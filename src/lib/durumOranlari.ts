import type { Item, ItemType } from '../types';
import { WIKI_TYPES, getKunyeFields, eksikSayilmaz, kunyeDolu as kunyeDoluMu } from '../components/wiki/wikiSchema';
import { haritaBeklentisi } from './eksikler';
import { boslukOrani } from '../components/Bosluklar';
import { ADA_KIMLIGI } from './vikiSifirlama';

/**
 * Ana sayfanın yüzde şeridi ve Durum sayfası (Paket 4).
 *
 * Kemal (yapısal 1. set, 2. ve 8. tur): "yüzdelikler ve sayıları çalışan
 * bir sekme" — künye doluluğu, merch, kitap, harita; ana ekranda şerit,
 * ayrıntı kendi sekmesinde. Her sayı gerçek veriden sayılır; kayıt yoksa
 * oran yok (null), "0" gibi görünmez.
 */

export const MERCH_ASAMALARI = ['Konsept', 'Tasarım', 'Üretim', 'Satışta'] as const;
export type MerchAsamasi = typeof MERCH_ASAMALARI[number];

export interface DurumOranlari {
  kunye: { dolu: number; toplam: number; madde: number };
  merch: { asamalar: Record<MerchAsamasi, number>; toplam: number };
  kitap: { oran: number | null; bolum: number };
  harita: { dolu: number; toplam: number };
  bosluk: { dolu: number; toplam: number };
}

/** 0–100 arası tam sayı; toplam yoksa null */
export const yuzde = (dolu: number, toplam: number): number | null =>
  toplam > 0 ? Math.round((dolu / toplam) * 100) : null;

const canli = (i: Item) => !i.archived && !i.isProposal;

export function durumOranlari(items: Item[]): DurumOranlari {
  // Künye: viki maddelerinin künye alanlarından kaçı dolu
  let kunyeDolu = 0, kunyeToplam = 0, madde = 0;
  for (const i of items) {
    if (!canli(i) || !WIKI_TYPES.includes(i.type as ItemType) || i.id === ADA_KIMLIGI) continue;
    // 24 Kasım: gerçek yerin Mahalle alanı sayılmaz, "Bilinmiyor" dolu sayılmaz
    const alanlar = getKunyeFields(i, { includeEmpty: true }).filter(f => !eksikSayilmaz(i, f.id));
    if (!alanlar.length) continue;
    madde++;
    kunyeToplam += alanlar.length;
    kunyeDolu += alanlar.filter(f => kunyeDoluMu(f.value)).length;
  }

  // Merch: ürünlerin hayat çizgisi (Konsept → Tasarım → Üretim → Satışta)
  const asamalar: Record<MerchAsamasi, number> = { Konsept: 0, Tasarım: 0, Üretim: 0, Satışta: 0 };
  const urunler = items.filter(i => canli(i) && i.type === 'merch_urun');
  for (const u of urunler) {
    const a = (MERCH_ASAMALARI as readonly string[]).includes(u.status) ? u.status as MerchAsamasi : 'Konsept';
    asamalar[a]++;
  }

  // Kitap: bölüm başına ilerleme (taslak 20, yazıldı 70, düzeltildi 100)
  const bolumler = items.filter(i => canli(i) && i.type === 'kitap_bolum' && !(i.tags || []).includes('oyun-tasarimi'));
  const kitapToplam = bolumler.reduce((n, b) =>
    n + (b.status === 'düzeltildi' ? 100 : b.status === 'yazıldı' ? 70 : 20), 0);

  // Harita: maddesi olması gereken yapılardan kaçının maddesi açılmış
  const beklenen = haritaBeklentisi();
  // Haritadaki yapıya sonradan bağlanan kayıtlar da sayılır (Durum listesiyle aynı)
  const kimlikler = new Set(items.filter(canli).flatMap(i => [i.id, String(i.metadata?.haritaWikiId || '')]).filter(Boolean));
  const haritaDolu = beklenen.filter(b => kimlikler.has(b.wikiId)).length;

  const b = boslukOrani(items);

  return {
    kunye: { dolu: kunyeDolu, toplam: kunyeToplam, madde },
    merch: { asamalar, toplam: urunler.length },
    kitap: { oran: bolumler.length ? Math.round(kitapToplam / bolumler.length) : null, bolum: bolumler.length },
    harita: { dolu: haritaDolu, toplam: beklenen.length },
    bosluk: { dolu: b.toplam - b.bos, toplam: b.toplam }
  };
}
