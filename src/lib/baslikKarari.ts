import type { Item } from '../types';

/**
 * Ajansın `baslikDegistir` kararı (24 Kasım, Kemal: "Feriha (Ercan)" maddesinin
 * başlığı "Feriha Yıldız" olsun). Saf iş: kayda yazmaz, yalnız ne olacağını söyler;
 * kayıt Kemal Onay bekleyenler'de "Uygula"ya basınca değişir (`ajansKararlari.ts`).
 *
 * - Başlık zaten `yeni` ise yapılmış (ikinci basışta bir şey yapmaz).
 * - Madde yoksa, başlığı birebir `eski` değilse ya da `yeni` başlıkta başka canlı
 *   madde varsa çakışma: uygulanmaz, listede "çakışma" diye görünür.
 * - Eski başlık, ekrandan ad değiştirmedeki gibi (App, handleUpdateItem) `eskiAdlar`a
 *   ve `adYayilacak`a girer: madde eski adıyla da bulunur, metinlerdeki eski ad
 *   bağlantı olarak kalır; öbür maddelerin metninde eski ad geçiyorsa Durum → Eksikler'deki
 *   "Ad değişikliği" kartı onu yenisiyle değiştirmeyi önerir. Bağlar kimlikle tutulur,
 *   bozulmaz.
 */
export interface BaslikKarari { eski: string; yeni: string }

const kucuk = (s: string) => (s || '').trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');
const liste = (x: unknown): string[] => (Array.isArray(x) ? x.filter((a): a is string => typeof a === 'string') : []);

export function baslikDegistirPlani(m: Item | null, items: Item[], k: BaslikKarari) {
  const eski = (k.eski || '').trim(), yeni = (k.yeni || '').trim();
  const bos = { yapildi: false, yeni: null as Item | null };
  if (!eski || !yeni) return { ...bos, cakisma: 'eski ya da yeni başlık boş' };
  if (!m) return { ...bos, cakisma: 'madde bulunamadı ya da aynı adla birden çok var' };
  const simdi = (m.title || '').trim();
  if (simdi === yeni) return { ...bos, yapildi: true, cakisma: null };
  if (simdi !== eski) return { ...bos, cakisma: `başlık bu arada değişmiş (şimdi: ${simdi || 'boş'})` };
  const ayni = items.some(i => i.id !== m.id && !i.archived && !i.isProposal && i.type !== 'aday' && kucuk(i.title) === kucuk(yeni));
  if (ayni) return { ...bos, cakisma: `"${yeni}" başlığında başka bir madde var` };
  const md = (m.metadata || {}) as Record<string, unknown>;
  const ekle = (l: string[]) => [...l.filter(a => a !== eski && a !== yeni), eski];
  const guncel: Item = {
    ...m, title: yeni,
    metadata: { ...md, eskiAdlar: ekle(liste(md.eskiAdlar)), adYayilacak: ekle(liste(md.adYayilacak)) } as Item['metadata'],
  };
  return { yapildi: false, cakisma: null, yeni: guncel };
}
