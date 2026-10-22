import type { Item } from '../types';
import { bosluklariCikar, alanaYaz, type Bosluk } from '../components/Bosluklar';
import { kunyedeCevabiVar } from './boslukDoldurma';

/**
 * Adaylar ve atölye soruları (Paket 4).
 *
 * Kemal'in kararları (29 Eylül):
 *   - Yapay zekâ taslak üretir, Kemal onaylamadan vikiye, kanona, markaya
 *     hiçbir şey girmez; önce "Adaylar"a düşer.
 *   - Sorulara verilen cevap önce Adaylar'a ve soru-cevap kaydına;
 *     vikiye Kemal "işle" deyince girer.
 *
 * Aday ayrı bir kayıt türüdür (`type: 'aday'`). Varlık sayılmaz, vikide,
 * fikir kutusunda görünmez. İşlenen ya da vazgeçilen aday silinmez:
 * arşive kalkar, `metadata.aday.durum` ne olduğunu söyler — soru-cevap
 * kaydı olarak kalır.
 */

export type AdayTuru = 'kanon_cevabi';
export type AdayDurumu = 'bekliyor' | 'islendi' | 'vazgecildi';

export interface AdayBilgisi {
  tur: AdayTuru;
  durum: AdayDurumu;
  /** Sorunun kimliği: `${maddeId}::${alanId}` */
  anahtar: string;
  hedefId: string;
  alanId: string;
  etiket: string;
  yol: string;
  soru: string;
  cevap: string;
  /** Cevap yapay zekâ seçeneklerinden mi seçildi */
  secenektenMi: boolean;
  tarih: string;
}

export const adayBilgisi = (i: Item): AdayBilgisi | undefined =>
  i.type === 'aday' ? (i.metadata?.aday as AdayBilgisi | undefined) : undefined;

/** Onay bekleyen adaylar — en yeni üstte */
export function bekleyenAdaylar(items: Item[]): Item[] {
  return items
    .filter(i => i.type === 'aday' && !i.archived && adayBilgisi(i)?.durum === 'bekliyor')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Eski yapay zekâ önerileri (isProposal) — Adaylar'da onlar da görünür */
export function eskiOneriler(items: Item[]): Item[] {
  return items.filter(i => i.isProposal && !i.archived && i.type !== 'aday');
}

/** Bir cevap için yazılacak aday kaydı */
export function adayKaydi(b: Bosluk, cevap: string, secenektenMi: boolean): Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> {
  const bilgi: AdayBilgisi = {
    tur: 'kanon_cevabi',
    durum: 'bekliyor',
    anahtar: b.anahtar,
    hedefId: b.item.id,
    alanId: b.alanId,
    etiket: b.etiket,
    yol: b.yol,
    soru: b.soru,
    cevap,
    secenektenMi,
    tarih: new Date().toISOString().slice(0, 10)
  };
  return {
    title: `${b.item.title} · ${b.etiket}`,
    area: 'komuta',
    type: 'aday',
    status: 'Fikir',
    priority: 'orta',
    tags: ['aday', 'gunun-sorusu'],
    links: [b.item.id],
    notes: cevap,
    images: [],
    isProposal: false,
    archived: false,
    metadata: { aday: bilgi }
  };
}

/**
 * "İşle": cevabı maddenin alanına yazar. Alan bu arada dolduysa
 * üstüne yazmaz — null döner, Kemal elle bakar.
 */
export function adayiIsle(aday: Item, items: Item[]): { hedef: Item; aday: Item } | null {
  const b = adayBilgisi(aday);
  if (!b) return null;
  const hedef = items.find(i => i.id === b.hedefId);
  if (!hedef) return null;
  // Bütün kayıtlarla bakılır: mahallenin tanınıp tanınmadığı öteki kayıtlara bağlı
  const hala = bosluklariCikar(items).some(x => x.item.id === hedef.id && x.alanId === b.alanId);
  if (!hala) return null;
  return {
    hedef: alanaYaz(hedef, b.yol, b.cevap),
    aday: adayiKapat(aday, 'islendi')
  };
}

export function adayiKapat(aday: Item, durum: Exclude<AdayDurumu, 'bekliyor'>): Item {
  const b = adayBilgisi(aday)!;
  return { ...aday, archived: true, metadata: { ...aday.metadata, aday: { ...b, durum } }, updatedAt: Date.now() };
}

/* --- sorular ------------------------------------------------------ */

/** Günün sayısı — soru sırası güne göre döner, gün içinde sabit kalır */
const gunNo = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * Sorulacak boşluklar, sırasıyla. Cevabı Adaylar'da bekleyen soru yok.
 * Sayfa metni sorusu (uzun yazı) tıklamalı soruya uymaz; atlanır.
 */
export function sorulacaklar(items: Item[], adet = 4): Bosluk[] {
  const bekleyen = new Set(items.filter(i => i.type === 'aday' && !i.archived).map(i => adayBilgisi(i)?.anahtar));
  const uygun = bosluklariCikar(items)
    .filter(b => b.alanId !== 'notes' && !b.yaz && !bekleyen.has(b.anahtar)
      && !kunyedeCevabiVar(b));
  if (!uygun.length) return [];
  // Art arda aynı soru ("Hangi mahallede yaşar?") ya da aynı madde
  // gelmesin: sorular türüne göre gruplanır, her turda her gruptan bir
  // soru alınır; aynı madde bir kez görünür.
  const gruplar = new Map<string, Bosluk[]>();
  for (const b of uygun) {
    const k = `${b.item.type}:${b.alanId}`;
    if (!gruplar.has(k)) gruplar.set(k, []);
    gruplar.get(k)!.push(b);
  }
  const g = gunNo();
  const anahtarlar = [...gruplar.keys()].sort();
  const bas = g % anahtarlar.length;
  const sira = [...anahtarlar.slice(bas), ...anahtarlar.slice(0, bas)].map(k => {
    const l = gruplar.get(k)!;
    const i = g % l.length;
    return [...l.slice(i), ...l.slice(0, i)];
  });
  const cikti: Bosluk[] = [];
  const gorulen = new Set<string>();
  for (let tur = 0; cikti.length < adet; tur++) {
    let kaldi = false;
    for (const l of sira) {
      const b = l[tur];
      if (!b) continue;
      kaldi = true;
      if (gorulen.has(b.item.id) && tur === 0) continue;
      gorulen.add(b.item.id);
      cikti.push(b);
      if (cikti.length >= adet) break;
    }
    if (!kaldi) break;
  }
  return cikti;
}

/**
 * Seçenek getirilmeyecek soru mu. Ad koymak Kemal'in işi, sayı da
 * uydurulmaz: ad, kişi ya da sayı soran sorulara yapay zekâ seçenek
 * getirmez, yalnız kutu açılır.
 */
export const seceneksizMi = (b: Bosluk) =>
  /\bad[ıi]?\b|adı ne|isim|sahib|kim\b|kurucu|soyad|fiyat|takipçi|nüfus|sayı|kaç/i.test(`${b.etiket} ${b.soru}`);
