import type { Item } from '../types';
import { ANA_MARKA_KIMLIKLERI, kurumMu } from './markaYapisi';
import { W5_GORSELLERI, w5GorselAdresi } from './w5Gorselleri';
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
 *   4. depodaki Canva yedeği (public/galeri/canva) — W5 eşleşmesiyle
 *   5. marka kitindeki internet adresi (en son: adres ölmüş olabilir)
 * Eski tohumlardaki hazır internet fotoğrafları (images içindeki http)
 * gösterilmez.
 */

const gorselMi = (s: unknown): s is string =>
  typeof s === 'string' && (s.startsWith('data:image/') || /^https?:\/\//.test(s) || s.startsWith('/'));

export function maddeGorseli(item: Item, items: Item[] = []): string | undefined {
  // SVG veriler güvenilmez: eski bir otomatik kod marka kitine açılmayan
  // bir SVG logo yazıyordu. SVG yalnız en sonda denenir.
  const veriMi = (x: unknown): x is string =>
    typeof x === 'string' && x.startsWith('data:image/') && !x.startsWith('data:image/svg');
  const kit = item.metadata?.brandKit;

  // Marka / kurumda birincil logo önce gelir (1 Ekim: Markalar'da "Birincil yap").
  // Depodaki logo da olabilir (8 Ekim, logo kartı: "/galeri/logolar/…")
  const depoda = (x: unknown): x is string => typeof x === 'string' && x.startsWith('/');
  if ((item.type === 'marka' || item.type === 'kulüp' || kurumMu(item))
    && (veriMi(kit?.logoBase64) || depoda(kit?.logoBase64))) return kit!.logoBase64;

  // 1–2. Uygulamaya yüklenmiş görseller (dosyanın kendisi kayıtta)
  const yuklenen = (item.images || []).find(veriMi);
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
    if (adres) return adres;
  }

  // 4. Depodaki Canva yedeği
  const yedek = W5_GORSELLERI.find(g => {
    if (g.hedefKimlik === 'kems') return ANA_MARKA_KIMLIKLERI.includes(item.id)
      || (item.type === 'marka' && !kurumMu(item) && item.title.trim().toLocaleLowerCase('tr') === 'kems company');
    if (g.hedefKimlik) return g.hedefKimlik === item.id;
    return !!g.hedefAd && kurumMu(item) && g.hedefAd.test(item.title);
  });
  if (yedek) return w5GorselAdresi(yedek);

  // 5. Marka kitindeki internet adresi — en son; adres ölmüş olabilir
  if (gorselMi(kit?.logoBase64)) return kit!.logoBase64;
  if (gorselMi(kit?.selectedLogo)) return kit!.selectedLogo;
  return undefined;
}
