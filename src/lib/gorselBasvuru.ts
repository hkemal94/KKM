/**
 * Galeri görselleri kayıtların dışında (21 Ekim, paket K). Görselin kendisi
 * `users/{uid}/gorseller/{id}` belgesinde durur; kayıtta (`images`) yalnız
 * `gorsel:<id>` başvurusu kalır. Bu dosya saftır: veritabanına dokunmaz,
 * betikle denenebilir.
 */

export const GORSEL_ONEKI = 'gorsel:';

/** Bir görsel belgesinin üst sınırı (kural da aynısını ister), bayt */
export const GORSEL_ENFAZLA = 990_000;

export const basvuruMu = (s: unknown): s is string =>
  typeof s === 'string' && s.startsWith(GORSEL_ONEKI) && s.length > GORSEL_ONEKI.length;

export const basvuruKimligi = (ref: string) => ref.slice(GORSEL_ONEKI.length);

export const basvuruYap = (kimlik: string) => `${GORSEL_ONEKI}${kimlik}`;

/**
 * Aynı görsel aynı kimliği alır: göç yarıda kesilip yeniden basılınca ya da
 * iki kayıtta aynı görsel varsa belge ikilenmez. Kural belge güncellemeye
 * izin vermediği için yazmadan önce var mı diye bakılır.
 */
export function icerikKimligi(veri: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < veri.length; i++) {
    const c = veri.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const karma = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  return `g${karma}-${veri.length.toString(36)}`;
}

/** Rastgele kimlik (Galeri'ye yeni yüklenen görsel) */
export const rastgeleKimlik = () =>
  `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Kayıt listesindeki başvuruların kimlikleri */
export function basvurulari(images: unknown): string[] {
  return Array.isArray(images) ? images.filter(basvuruMu) : [];
}
