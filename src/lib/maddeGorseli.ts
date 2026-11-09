import type { Item } from '../types';
import { kurumMu } from './markaYapisi';
import { silinenGorselMi } from './silinenGorseller';
import { basvuruMu } from './gorselBasvuru';
import { gorselAnlik } from './gorselOnbellek';

/**
 * Bir maddenin görseli — viki künyesi, Markalar ve kanon kutuları için.
 *
 * Kemal (29 Eylül): "Wikide hâlâ kulüp ve marka logoları görünmüyor."
 * Görsel yalnız maddenin `images` listesinden okunuyordu; W5 düğmesi
 * dosyaları okuyamadıysa ya da logo başka yerde duruyorsa künye boş
 * kalıyordu. Sıra:
 *   1. maddenin kendi yüklenmiş görseli (images, data:)
 *   2. marka kitine yüklenmiş logo (data:)
 *   3. galeride bu maddeye bağlanmış görsel (metadata.bagliId); görsel
 *      belgesinde duruyorsa (`gorsel:<id>`, 21 Ekim) bellek önbelleğinden
 *      okunur — App bağlı görselleri önceden yükler, yüklenene kadar bu adım
 *      atlanır. Çağıran ekranlar `useGorselSurumu()` ile yenilenir.
 *   4. marka kitindeki internet adresi (en son: adres ölmüş olabilir)
 * Depodaki Canva yedeği (public/galeri/canva) 4 Kasım'da silindi (Kemal:
 * "Tamamen sil"); görseli olmayan madde resimsiz görünür.
 * Eski tohumlardaki hazır internet fotoğrafları (images içindeki http)
 * gösterilmez.
 *
 * 5 Kasım: ajansın `gorselEkle` kararıyla gelen görseller sitenin kendi
 * dosyasıdır (`public/viki/`, kayıtta `/viki/…` yolu). 1. adımda yüklenen
 * görsellerle aynı sırada sayılır.
 */

/** Sitedeki viki görsel klasörü (`public/viki/`) */
export const VIKI_GORSEL_ONEKI = '/viki/';
/** Değer sitedeki viki klasöründe bir görsel yolu mu */
export const vikiGorseliMi = (s: unknown): s is string =>
  typeof s === 'string' && s.startsWith(VIKI_GORSEL_ONEKI) && s.length > VIKI_GORSEL_ONEKI.length && !s.includes('..');

/**
 * Yer tutucu silüet (`/viki/siluet-…`, 5 Kasım). 9 Kasım, Kemal: "Fotoğrafı olan
 * karakterlerde silüet hiç çıkmasın." Maddenin başka görseli varsa silüet gösterilmez.
 */
export const siluetMi = (s: unknown): boolean => typeof s === 'string' && s.startsWith(`${'/viki/'}siluet-`);

const gorselMi = (s: unknown): s is string =>
  typeof s === 'string' && !silinenGorselMi(s) && (s.startsWith('data:image/') || /^https?:\/\//.test(s) || s.startsWith('/'));

export function maddeGorseli(item: Item, items: Item[] = []): string | undefined {
  // SVG veriler güvenilmez: eski bir otomatik kod marka kitine açılmayan
  // bir SVG logo yazıyordu. SVG yalnız en sonda denenir.
  const veriMi = (x: unknown): x is string =>
    typeof x === 'string' && x.startsWith('data:image/') && !x.startsWith('data:image/svg');
  const kit = item.metadata?.brandKit;

  // Marka / kurumda birincil logo önce gelir (1 Ekim: Markalar'da "Birincil yap").
  // Depodaki logo da olabilir (8 Ekim, logo kartı: "/galeri/logolar/…")
  const depoda = (x: unknown): x is string => typeof x === 'string' && x.startsWith('/') && !silinenGorselMi(x);
  if ((item.type === 'marka' || item.type === 'kulüp' || kurumMu(item))
    && (veriMi(kit?.logoBase64) || depoda(kit?.logoBase64))) return kit!.logoBase64;

  // 1–2. Uygulamaya yüklenmiş görseller (dosyanın kendisi kayıtta)
  const yuklenenler = (item.images || []).filter(x => veriMi(x) || vikiGorseliMi(x));
  const yuklenen = yuklenenler.find(x => !siluetMi(x)) ?? yuklenenler[0];
  if (yuklenen) return yuklenen;
  if (veriMi(kit?.logoBase64)) return kit!.logoBase64;
  if (veriMi(kit?.selectedLogo)) return kit!.selectedLogo;

  // 3. Galeride bu maddeye bağlanmış görsel
  const galeride = items.find(g =>
    g.type === 'ilham_gorsel' && !g.archived
    && (g.metadata as Record<string, unknown> | undefined)?.bagliId === item.id
    && (g.images || []).length);
  if (galeride) {
    const g = galeride.images[0];
    const adres = basvuruMu(g) ? gorselAnlik(g) : g;
    if (adres && !silinenGorselMi(adres)) return adres;
  }

  // 4. Marka kitindeki internet adresi — en son; adres ölmüş olabilir
  if (gorselMi(kit?.logoBase64)) return kit!.logoBase64;
  if (gorselMi(kit?.selectedLogo)) return kit!.selectedLogo;
  return undefined;
}

/**
 * Künyede gösterilecek bütün görseller (5 Kasım): önce `maddeGorseli`, sonra
 * maddenin görsel listesindeki öbür yüklenmiş ya da viki klasöründeki görseller.
 * Ajansın kararıyla bir maddeye birden çok görsel girince hepsi görünsün diye.
 */
export function maddeGorselleri(item: Item, items: Item[] = []): string[] {
  const ana = maddeGorseli(item, items);
  const ek = (item.images || []).filter((x): x is string =>
    (typeof x === 'string' && x.startsWith('data:image/') && !x.startsWith('data:image/svg')) || vikiGorseliMi(x));
  const hepsi = [...new Set([...(ana ? [ana] : []), ...ek])];
  // Gerçek görsel varsa silüet hiç gösterilmez; yalnız silüet varsa o kalır
  return hepsi.some(g => !siluetMi(g)) ? hepsi.filter(g => !siluetMi(g)) : hepsi;
}
