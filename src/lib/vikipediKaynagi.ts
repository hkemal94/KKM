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

/**
 * "Vikipedi'den getir" (14 Kasım, Kemal: gerçek dünyadaki yerlerin bilgisi
 * Vikipedi'den çekilsin). Türkçe Vikipedi'nin kısa özetini ve sayfa adresini
 * getirir. Kayda hiçbir şey yazmaz: özet düzenleyicide aday olarak görünür,
 * Kemal "Metne ekle" deyip "Kaydet"e basmadan vikiye girmez.
 */
export type VikipediSonucu =
  | { durum: 'bulundu'; baslik: string; ozet: string; adres: string }
  | { durum: 'yok' }
  | { durum: 'cokAnlamli'; adres: string };

export async function vikipedidenGetir(ad: string): Promise<VikipediSonucu> {
  const temiz = ad.trim().replace(/\s+/g, '_');
  if (!temiz) return { durum: 'yok' };
  const yanit = await fetch(`https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(temiz)}?redirect=true`, { headers: { Accept: 'application/json' } });
  if (yanit.status === 404) return { durum: 'yok' };
  if (!yanit.ok) throw new Error(`Vikipedi yanıt vermedi (${yanit.status})`);
  const v = await yanit.json() as { type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  const adres = v.content_urls?.desktop?.page || `https://tr.wikipedia.org/wiki/${encodeURIComponent(temiz)}`;
  if (v.type === 'disambiguation') return { durum: 'cokAnlamli', adres };
  const ozet = (v.extract || '').trim();
  if (!ozet) return { durum: 'yok' };
  return { durum: 'bulundu', baslik: v.title || ad.trim(), ozet, adres };
}
