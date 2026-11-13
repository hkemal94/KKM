import type { Item } from '../types';
import { duzAlanlar } from './vikiAjansa';
import { ajansaDosyaYaz } from './tepsiAjansa';
import { useOtoGonder, type OtoGonderim } from './otoGonder';

/**
 * Merch ajansa (13 Kasım, Kemal: "KKM'deki merch ajansa açılsın"). Merch Konseptçisi ve
 * Merch Tasarımcısı Firestore'a erişemez; droplar ve ürünler vikideki gibi KKM açıkken
 * değişince kendiliğinden ajansın gizli deposuna, `kkm/merch.json`'a yazılır. Yalnız okumak
 * içindir: KKM kayıtlarına hiçbir şey yazılmaz. Görseller gitmez (yalnız kaç tane olduğu);
 * öneri hâlindeki (yapay zekâ) droplar ve ürünler "oneri: true" diye işaretlenir.
 */
export const MERCH_YOLU = 'kkm/merch.json';

const gorselSayisi = (i: Item) => (Array.isArray(i.images) ? i.images.length : 0);

export function merchDosyasi(items: Item[], zaman = new Date()) {
  const merch = items.filter(i => i.area === 'merch' && !i.archived && (i.type === 'drop' || i.type === 'merch_urun'));
  const droplar = merch.filter(i => i.type === 'drop');
  const dropAdi = new Map(droplar.map(d => [d.id, d.title]));
  const satir = (i: Item) => ({
    id: i.id, baslik: i.title, metin: i.notes || '', durum: i.status, etiketler: i.tags || [],
    alanlar: duzAlanlar((i.metadata || {}) as Record<string, unknown>), gorsel: gorselSayisi(i),
    ...(i.isProposal ? { oneri: true } : {}),
  });
  const urunler = merch.filter(i => i.type === 'merch_urun').map(i => {
    const dropId = String(i.metadata?.dropId || '');
    return { ...satir(i), dropId, dropBaslik: dropAdi.get(dropId) || '' };
  });
  return {
    olusturuldu: zaman.toISOString(),
    droplar: droplar.map(d => ({ ...satir(d), urunSayisi: urunler.filter(u => u.dropId === d.id).length })),
    urunler,
  };
}

export type MerchDosyasi = ReturnType<typeof merchDosyasi>;

export function merchiGonder(anahtar: string, dosya: MerchDosyasi): Promise<string> {
  return ajansaDosyaYaz(anahtar, MERCH_YOLU, `${JSON.stringify({ _aciklama: "KKM'deki droplar ve ürünler (KKM açıkken değişince kendiliğinden yazılır; yalnız okumak için). Merch ajanları buradan okur.", ...dosya }, null, 2)}\n`,
    `KKM merch: ${dosya.droplar.length} drop, ${dosya.urunler.length} ürün`, 'merch');
}

const MERCH: OtoGonderim<MerchDosyasi> = {
  ozetYeri: 'kkm-merch-son-ozet',
  zamanYeri: 'kkm-merch-son-gonderim',
  ad: 'Merch',
  hazirla: items => merchDosyasi(items),
  karsilastir: dosya => JSON.stringify({ ...dosya, olusturuldu: '' }),
  zaman: dosya => dosya.olusturuldu,
  gonder: merchiGonder,
};

export function useMerchOtoGonder(items: Item[], hazir: boolean) {
  useOtoGonder(items, hazir, MERCH);
}
