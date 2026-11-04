import type { Item } from '../types';

/**
 * Harita işaretleri ve katmanlar (5. gece, 7 Ekim; vvd'den).
 *
 * İki tür işaret:
 *   - Not: maddeye bağlı olmayan serbest iğne + kısa not. Her not ayrı küçük
 *     kayıt (`type: 'map_pin'`, Kemal'in seçimi); büyük harita kaydına
 *     dokunmaz, yazma kotasını az harcar.
 *   - Madde işareti: bir maddenin haritadaki yeri (`metadata.haritaIsareti`).
 *     Madde listeden sürüklenip boş bir yere bırakılınca konur; bir yapının
 *     üstüne bırakılırsa yapıya bağlanır (Kurucu'nun madde bağı).
 * Kayıt yalnız Kemal "Kaydet" / bırak / "Kaldır" deyince değişir.
 *
 * Katmanlar yalnız görünümdür; seçim bu tarayıcıda hatırlanır, kayda yazılmaz.
 */

export type KatmanId = 'yollar' | 'binalar' | 'modeller' | 'doga' | 'adlar' | 'notlar' | 'maddeler';
export type KatmanAyari = Record<KatmanId, boolean>;

export const KATMANLAR: Array<{ id: KatmanId; ad: string }> = [
  { id: 'yollar', ad: 'Yollar' },
  { id: 'binalar', ad: 'Yapılar' },
  // 3B modeller (4 Kasım): yakın bakışta kutu yerine bina modeli
  { id: 'modeller', ad: '3B modeller' },
  { id: 'doga', ad: 'Doğa' },
  { id: 'adlar', ad: 'Adlar' },
  { id: 'notlar', ad: 'Notlar' },
  { id: 'maddeler', ad: 'Madde işaretleri' }
];

export const KATMANLAR_ACIK: KatmanAyari = { yollar: true, binalar: true, modeller: true, doga: true, adlar: true, notlar: true, maddeler: true };
const ANAHTAR = 'kems_harita_katman';

export function katmanOku(): KatmanAyari {
  try { return { ...KATMANLAR_ACIK, ...JSON.parse(localStorage.getItem(ANAHTAR) || '{}') }; } catch { return KATMANLAR_ACIK; }
}
export function katmanYaz(k: KatmanAyari) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(k)); } catch { /* yok */ }
}

/** [boylam, enlem] */
export type Konum = [number, number];

export interface HaritaIsareti {
  /** Not için kaydın kimliği; madde için "madde:<kimlik>" */
  id: string;
  tur: 'not' | 'madde';
  ad: string;
  metin?: string;
  konum: Konum;
  maddeId?: string;
}

const konumOku = (k: unknown): Konum | null => {
  const o = k as { lng?: unknown; lat?: unknown } | null | undefined;
  return o && typeof o.lng === 'number' && typeof o.lat === 'number' ? [o.lng, o.lat] : null;
};

export function haritaIsaretleri(items: Item[]): HaritaIsareti[] {
  const cikti: HaritaIsareti[] = [];
  for (const i of items) {
    if (i.archived || i.isProposal) continue;
    if (i.type === 'map_pin') {
      const k = konumOku(i.metadata?.konum);
      if (k) cikti.push({ id: i.id, tur: 'not', ad: i.title.trim(), metin: (i.notes || '').trim(), konum: k });
      continue;
    }
    const k = konumOku(i.metadata?.haritaIsareti);
    if (k) cikti.push({ id: `madde:${i.id}`, tur: 'madde', ad: i.title.trim(), konum: k, maddeId: i.id });
  }
  return cikti;
}

const yuvarla = (k: Konum) => ({ lng: Math.round(k[0] * 1e6) / 1e6, lat: Math.round(k[1] * 1e6) / 1e6 });

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** Yeni not kaydı; başlık boşsa notun ilk sözleri, o da yoksa "Not" */
export function notKaydi(konum: Konum, baslik: string, metin: string): YeniKayit {
  const ad = baslik.trim() || metin.trim().split(/\s+/).slice(0, 5).join(' ') || 'Not';
  return {
    title: ad, area: 'duzada', type: 'map_pin', status: 'Planlandı', priority: 'düşük',
    tags: ['harita-notu'], links: [], notes: metin.trim(), images: [], isProposal: false, archived: false,
    metadata: { konum: yuvarla(konum) }
  };
}

export function notGuncelle(i: Item, degisen: { baslik?: string; metin?: string; konum?: Konum }): Item {
  return {
    ...i,
    ...(degisen.baslik !== undefined ? { title: degisen.baslik.trim() || i.title } : {}),
    ...(degisen.metin !== undefined ? { notes: degisen.metin.trim() } : {}),
    metadata: { ...(i.metadata || {}), ...(degisen.konum ? { konum: yuvarla(degisen.konum) } : {}) } as Item['metadata'],
    updatedAt: Date.now()
  };
}

/**
 * Maddenin işaretini koyar ya da (null) kaldırır. Kayıt eskisinin üstüne
 * birleşerek yazıldığı için kaldırmak null yazmaktır.
 */
export function maddeIsareti(i: Item, konum: Konum | null): Item {
  return {
    ...i,
    metadata: { ...(i.metadata || {}), haritaIsareti: konum ? yuvarla(konum) : null } as Item['metadata'],
    updatedAt: Date.now()
  };
}
