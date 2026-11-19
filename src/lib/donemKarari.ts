import type { Donem } from './zamanCizgisi';

/**
 * Ajansın dönem kararı (19 Kasım, Kemal: "evet"; `ajansKararlari.ts` → `donem`).
 *
 * Zaman çizgisinin dönemleri `kkm_ayar` → `donemler`'de durur (Evren → Zaman
 * çizgisi'ndeki "Ekle" ile aynı yer). Ajans iki şey önerebilir:
 *   - dönem ekle (`eski` yok): aynı adla dönem yoksa eklenir. Aynı ad ve yıllarla
 *     varsa uygulanmış sayılır; aynı adla başka yıllarda varsa üzerine yazılmaz,
 *     çakışma olur.
 *   - dönem değiştir (`eski` var): `eski`nin adı ve yılları birebir tutan dönem
 *     yenisiyle değişir (kimliği aynı kalır). Tutan yoksa Kemal bu arada değiştirmiş
 *     ya da silmiştir: çakışma, uygulanmaz.
 * Silme yok. Bu dosya saf iştir; kayda yazan `kararlariUygula`.
 */

export interface DonemYillari { ad: string; bas: number; bit?: number | null }
export interface DonemKarari extends DonemYillari { eski?: DonemYillari }

const kucuk = (s: string) => (s || '').trim().toLocaleLowerCase('tr');
const yil = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
/** Bitiş: sayıysa o, yoksa (null, boş) açık uçlu */
const bitis = (d: DonemYillari) => (yil(d.bit) ? d.bit as number : undefined);

/** Adı dolu, başı tam sayı, bitişi yoksa ya da baştan küçük değilse geçerli */
export function donemGecerli(d: DonemYillari | undefined | null): boolean {
  if (!d || typeof d.ad !== 'string' || !d.ad.trim() || !yil(d.bas)) return false;
  if (d.bit === undefined || d.bit === null) return true;
  return yil(d.bit) && (d.bit as number) >= d.bas;
}

/** Ad (büyük küçük harf ayrımı yok) ve yıllar birebir aynı mı */
export const ayniDonem = (a: DonemYillari, b: DonemYillari) =>
  kucuk(a.ad) === kucuk(b.ad) && a.bas === b.bas && bitis(a) === bitis(b);

/** "1923–1950 dönemi (1923–1950)" gibi; bitişi yoksa "2020–" */
export const donemYazisi = (d: DonemYillari) => `${(d.ad || '').trim()} (${d.bas}–${bitis(d) ?? ''})`;

/** Kayda girecek dönem; bitişi yoksa alan hiç yazılmaz (Firestore'a undefined gitmez) */
const kayitDonemi = (id: string, d: DonemYillari): Donem => {
  const b = bitis(d);
  return { id, ad: d.ad.trim(), bas: d.bas, ...(b !== undefined ? { bit: b } : {}) };
};

/**
 * Ne olacak (saf iş): yapıldı mı, çakışma nedeni, yazılacak yeni liste.
 * `yeniId` yalnız eklemede kullanılır.
 */
export function donemPlani(donemler: Donem[], i: DonemKarari, yeniId = `donem_${Date.now()}`) {
  const degistir = i.eski !== undefined && i.eski !== null;
  const ayniAdli = donemler.filter(d => kucuk(d.ad) === kucuk(i.ad));
  const hedefler = degistir ? donemler.filter(d => ayniDonem(d, i.eski!)) : [];
  const hedef = hedefler.length === 1 ? hedefler[0] : null;
  const yeniVar = donemler.some(d => ayniDonem(d, i));
  const yapildi = donemGecerli(i) && yeniVar && (!degistir || !hedefler.length || ayniDonem(i, i.eski!));

  let cakisma: string | null = null;
  if (!donemGecerli(i)) cakisma = 'dönemin adı ya da yılları geçersiz (ad dolu, yıllar tam sayı, bitiş baştan önce olamaz)';
  else if (degistir && !donemGecerli(i.eski)) cakisma = 'değişecek dönemin (eski) adı ya da yılları geçersiz';
  else if (yapildi) cakisma = null;
  else if (!degistir && ayniAdli.length) cakisma = `aynı adla dönem var (${donemYazisi(ayniAdli[0])}); üzerine yazılmaz`;
  else if (degistir && !hedefler.length) cakisma = `dönem bu arada değişmiş ya da silinmiş (beklenen: ${donemYazisi(i.eski!)})`;
  else if (degistir && hedefler.length > 1) cakisma = `bu dönemden birden çok var (${donemYazisi(i.eski!)})`;
  else if (degistir && ayniAdli.some(d => d.id !== hedef!.id)) cakisma = `aynı adla başka bir dönem var (${donemYazisi(ayniAdli.find(d => d.id !== hedef!.id)!)})`;

  const liste = yapildi || cakisma ? null
    : degistir ? donemler.map(d => (d.id === hedef!.id ? kayitDonemi(d.id, i) : d))
    : [...donemler, kayitDonemi(yeniId, i)];
  return { yapildi, cakisma, hedef, liste };
}

/** Onay listesindeki satır: "Zaman çizgisi · dönem eklenir: …" ya da "eski → yeni"; çakışma varsa başta */
export function donemOnizleme(donemler: Donem[], i: DonemKarari): string {
  const p = donemPlani(donemler, i, 'onizleme');
  const ne = i.eski ? `dönem değişir: ${donemYazisi(i.eski)} → ${donemYazisi(i)}` : `dönem eklenir: ${donemYazisi(i)}`;
  return `${p.cakisma ? `Çakışma, uygulanmaz: ${p.cakisma}. ` : ''}Zaman çizgisi · ${ne}`;
}
