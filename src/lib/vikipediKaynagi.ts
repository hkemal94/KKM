import type { Item } from '../types';

/**
 * Wikipedia'dan gelen maddeler (3 Kasım, Kemal: "Wikipedia'dan kopyaladığın
 * maddeler için ayrı bir madde kategorisi aç ki gerçeklik ayırt edilsin";
 * seçimi: yalnız işaret). Madde yerinde kalır; başında "Wikipedia'dan"
 * işareti ve kaynak bağlantısı görünür.
 *
 * Kayıtta iki isteğe bağlı alan: `metadata.kaynak = 'wikipedia'` ve
 * `metadata.kaynakUrl` (Wikipedia sayfasının adresi). İkisini de Kemal madde
 * düzenleyicisinde (Ayarlar sekmesi) elle işaretler; hiçbir kod bunları
 * kendiliğinden yazmaz ya da tahmin etmez.
 */

export const WIKIPEDIA_KAYNAGI = 'wikipedia';

/** Madde Wikipedia'dan diye işaretli mi */
export const wikipediadanMi = (item: Item): boolean => item.metadata?.kaynak === WIKIPEDIA_KAYNAGI;

/** Kaynak bağlantısı; yalnız http(s) adresi geçerli sayılır, yoksa boş */
export function kaynakAdresi(item: Item): string {
  const a = typeof item.metadata?.kaynakUrl === 'string' ? item.metadata.kaynakUrl.trim() : '';
  return /^https?:\/\//i.test(a) ? a : '';
}
