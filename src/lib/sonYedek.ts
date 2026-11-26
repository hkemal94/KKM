import { useSyncExternalStore } from 'react';

/**
 * "Son yedek N gün önce" bilgisinin tek kaynağı (26 Kasım). Yedekleme penceresi,
 * kenar çubuğundaki ve "Diğer"deki Yedek düğmesi ve zildeki "Aylık yedek"
 * hatırlatması buradan okur.
 *
 * Asıl bilgi Drive'daki tam yedeklerin en yenisidir: Yedekleme penceresi Drive
 * listesini okuyunca ya da yedek alınca `driveSonYedegi` ile buraya yazar.
 * Drive bu oturumda okunamadıysa (izin daha verilmedi, bağlantı yok) tarayıcının
 * hafızasındaki son bilgi (`kems_son_yedek`) yedek bilgi olarak görünür; başka
 * cihazda eski kalabilir, ekranda bunu söyler. Kayda (Firestore) bir şey yazılmaz.
 */

const ANAHTAR = 'kems_son_yedek';

export interface SonYedek {
  /** Son tam yedeğin anı (ms); hiç yoksa null */
  zaman: number | null;
  /** 'drive': bu oturumda Drive'dan okundu; 'tarayici': yalnız bu tarayıcının hafızası */
  kaynak: 'drive' | 'tarayici';
}

function tarayicidan(): number | null {
  try {
    const v = Number(localStorage.getItem(ANAHTAR));
    return v || null;
  } catch { return null; }
}

let durum: SonYedek | null = null;
const dinleyenler = new Set<() => void>();

const oku = (): SonYedek => (durum ??= { zaman: tarayicidan(), kaynak: 'tarayici' });

/** Drive'daki son tam yedek (liste okununca ya da yedek alınınca) */
export function driveSonYedegi(zaman: number | null) {
  durum = { zaman, kaynak: 'drive' };
  try {
    if (zaman) localStorage.setItem(ANAHTAR, String(zaman)); else localStorage.removeItem(ANAHTAR);
  } catch { /* tarayıcı hafızası yok */ }
  dinleyenler.forEach(f => f());
}

const abone = (f: () => void) => { dinleyenler.add(f); return () => { dinleyenler.delete(f); }; };

export const sonYedekBilgisi = oku;
export const useSonYedek = (): SonYedek => useSyncExternalStore(abone, oku, oku);

/** Son yedekten bu yana geçen gün; hiç yoksa null (saf iş) */
export const gecenGun = (zaman: number | null, simdi = Date.now()): number | null =>
  zaman === null ? null : Math.max(0, Math.floor((simdi - zaman) / 86_400_000));

/** "Bugün yedek alındı", "Son yedek 3 gün önce", "Henüz yedek alınmadı" (saf iş) */
export const sonYedekYazisi = (s: SonYedek, simdi = Date.now()) => {
  const gun = gecenGun(s.zaman, simdi);
  if (gun === null) return s.kaynak === 'drive' ? "Drive'da henüz tam yedek yok" : 'Henüz yedek alınmadı';
  return gun === 0 ? 'Bugün yedek alındı' : `Son yedek ${gun} gün önce`;
};
