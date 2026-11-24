import type { Item } from '../types';

/**
 * Ad değişikliği her yere (8 Ekim, Kemal: "Stadyum plajını kuzey plajı
 * yaptım; sadece madde ismi değişti, her yerden değişmeli").
 *
 * Bir maddenin adı değişince eski ad `metadata.eskiAdlar`a ve
 * `metadata.adYayilacak`a girer (App, handleUpdateItem). Yalnız
 * `adYayilacak` yayılır: eskiAdlar'daki tarihî adlar (İskele'nin
 * "Kemsköy"ü, Merkez'in "Düzada Köyü") metinlerde bilerek geçer. Bu kart:
 *   - öbür maddelerin metninde, künyesinde, bölümlerinde eski adı yenisiyle
 *     değiştirir (tam sözcük olarak; "Stadyum Plajı'nda" da olur);
 *   - eski adla sonradan açılmış boş kopyayı siler (soru turu, ad değişince
 *     maddeyi bulamayıp eski adla yeniden açıyordu).
 * Kemal basınca çalışır; ikinci basışta iş kalmaz.
 */

/** Uygulamadaki ad saklama gelmeden önce yapılmış değişiklikler */
const BILINEN: Array<{ eski: string; yeni: string }> = [
  { eski: 'Stadyum Plajı', yeni: 'Kuzey Plajı' },
  // Kemal 8 Ekim: kooperatifin adı etiketlerdeki gibi (kanon "Kemsköy …" idi)
  { eski: 'Kemsköy Ziraat İşletmeleri Kurumu', yeni: 'Düzada Ziraat İşletmeleri Kurumu' }
];

const kucuk = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');
const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Metindeki eski adı yenisiyle değiştirir (öncesi ve sonrası harf değilse) */
const degistir = (s: string, eski: string, yeni: string) =>
  s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${kacis(eski)}(?![\\p{L}\\p{N}])`, 'gu'), yeni);

/** Değiştirilmeyecek alanlar: görseller, eski adlar, bağlar, kimlikler */
const DOKUNMA = new Set(['brandKit', 'eskiAdlar', 'aliases', 'relations', 'images', 'moodboard']);

function derin(x: unknown, eski: string, yeni: string): unknown {
  if (typeof x === 'string') return degistir(x, eski, yeni);
  if (Array.isArray(x)) return x.map(v => derin(v, eski, yeni));
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x as Record<string, unknown>)
      .map(([k, v]) => [k, DOKUNMA.has(k) ? v : derin(v, eski, yeni)]));
  }
  return x;
}

const bosMu = (i: Item) => !String(i.notes || '').trim()
  && !((i.metadata?.wikiSections as Array<{ content?: string }> | undefined) || []).some(b => String(b.content || '').trim());

export interface AdIsleri {
  /** Eski adı kayda yazılacak madde (bilinen eski değişiklikler) */
  adKaydi: Array<{ item: Item; eski: string; guncel: Item }>;
  /** Metni değişecek maddeler */
  metin: Array<{ item: Item; neler: string[]; guncel: Item }>;
  /** Silinecek boş kopyalar */
  kopya: Array<{ item: Item; asil: Item }>;
  /** İş bitince "yayılacak" işareti kalkacak maddeler (en son yazılır) */
  yayildi: Array<{ item: Item; guncel: Item }>;
}

export function adIsleri(items: Item[]): AdIsleri {
  const canli = items.filter(i => !i.archived && !i.isProposal);
  const simdi = Date.now();
  const adKaydi: AdIsleri['adKaydi'] = [];
  // (asıl madde, eski ad) çiftleri
  const ciftler: Array<{ asil: Item; eski: string }> = [];
  const yayilacak: AdIsleri['yayildi'] = [];
  for (const i of canli) {
    const liste = Array.isArray(i.metadata?.adYayilacak) ? i.metadata!.adYayilacak as string[] : [];
    for (const a of liste) {
      if (typeof a === 'string' && a.trim() && kucuk(a) !== kucuk(i.title)) ciftler.push({ asil: i, eski: a.trim() });
    }
    // Firestore birleştirerek yazar: alanı silmek yerine boş liste
    if (liste.length) yayilacak.push({ item: i, guncel: { ...i, metadata: { ...i.metadata, adYayilacak: [] }, updatedAt: simdi } });
  }
  for (const b of BILINEN) {
    const asil = canli.find(i => kucuk(i.title) === kucuk(b.yeni));
    if (!asil) continue;
    const eskiler = Array.isArray(asil.metadata?.eskiAdlar) ? asil.metadata!.eskiAdlar as string[] : [];
    if (!eskiler.some(a => kucuk(a) === kucuk(b.eski))) {
      adKaydi.push({ item: asil, eski: b.eski, guncel: { ...asil, metadata: { ...asil.metadata, eskiAdlar: [...eskiler, b.eski] }, updatedAt: simdi } });
    }
    if (!ciftler.some(c => c.asil.id === asil.id && kucuk(c.eski) === kucuk(b.eski))) ciftler.push({ asil, eski: b.eski });
  }

  const kopya: AdIsleri['kopya'] = [];
  const silinecek = new Set<string>();
  for (const { asil, eski } of ciftler) {
    for (const i of canli) {
      if (i.id !== asil.id && i.type === asil.type && kucuk(i.title) === kucuk(eski) && bosMu(i) && !silinecek.has(i.id)) {
        kopya.push({ item: i, asil });
        silinecek.add(i.id);
      }
    }
  }

  const metin: AdIsleri['metin'] = [];
  for (const i of canli) {
    if (silinecek.has(i.id)) continue;
    let g: Item = i;
    const neler: string[] = [];
    for (const { asil, eski } of ciftler) {
      if (asil.id === i.id) continue;
      const yeni: Item = {
        ...g,
        notes: degistir(g.notes || '', eski, asil.title),
        metadata: derin(g.metadata || {}, eski, asil.title) as Item['metadata']
      };
      if (JSON.stringify(yeni) !== JSON.stringify(g)) { g = yeni; neler.push(`"${eski}" → "${asil.title}"`); }
    }
    if (neler.length) metin.push({ item: i, neler, guncel: { ...g, updatedAt: simdi } });
  }
  return { adKaydi, metin, kopya, yayildi: yayilacak };
}

export const adIsiVar = (x: AdIsleri) => x.adKaydi.length + x.metin.length + x.kopya.length > 0;

/**
 * Yazılacak son hâller: aynı maddeye düşen işler (eski ad kaydı, metin,
 * işaretin kalkması) tek kayıtta birleşir; silinecekler ayrı.
 */
export function adYazimlari(x: AdIsleri): { yaz: Item[]; sil: Item[] } {
  const son = new Map<string, Item>();
  for (const m of x.metin) son.set(m.item.id, m.guncel);
  for (const a of x.adKaydi) {
    const g = son.get(a.item.id) ?? a.item;
    son.set(a.item.id, { ...g, metadata: { ...g.metadata, eskiAdlar: a.guncel.metadata?.eskiAdlar }, updatedAt: a.guncel.updatedAt });
  }
  for (const y of x.yayildi) {
    const g = son.get(y.item.id) ?? y.item;
    son.set(y.item.id, { ...g, metadata: { ...g.metadata, adYayilacak: [] }, updatedAt: y.guncel.updatedAt });
  }
  return { yaz: Array.from(son.values()), sil: x.kopya.map(k => k.item) };
}
