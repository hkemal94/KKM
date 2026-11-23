import type { Item } from '../types';
import { MAHALLE_ADI } from './haritaMaddesi';

/**
 * Mahalle maddesinin 2B haritası (tek harita 9. adım, 22 Kasım 2026, Kemal).
 *
 * Resimler `public/harita/mahalle-2b/<mahalle-kimliği>-A.png` (sade şehir planı) ve
 * `-B.png` (poster tabanı); `gen/kompakt_mahalle_2b.py` üretir. Harita değişince
 * resimler o betikle yeniden üretilir; burada yalnız adres kurulur, kayda bir şey yazılmaz.
 *
 * Madde ↔ harita eşleşmesi haritadan maddeye gidişin tersi (`duzada/HaritaMaddesi.tsx`):
 * haritada `yer_liman`, vikide genelde `region_liman`; kimlik, `haritaWikiId`, bölge
 * alanı ya da başlıktaki mahalle adı.
 */

const sadelestir = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, c => 'cgiosu'['çğıöşü'.indexOf(c)])
    .replace(/[^a-z0-9]/g, '');

/** Mahalle maddesinin haritadaki mahalle kimliği (`yer_liman` gibi); mahalle değilse null */
export function mahalleHaritaKimligi(item: Item): string | null {
  if (item.type !== 'yer') return null;
  const kimlikler = Object.keys(MAHALLE_ADI);
  if (kimlikler.includes(item.id)) return item.id;
  const bag = item.metadata?.haritaWikiId;
  if (typeof bag === 'string' && kimlikler.includes(bag)) return bag;
  for (const k of kimlikler) {
    const anahtar = k.slice(4); // liman, merkez, iskele, stadyum, ciftlik
    if (sadelestir(String(item.metadata?.region || '')) === anahtar) return k;
    if (sadelestir(item.id) === `region${anahtar}`) return k;
    const baslik = sadelestir(item.title.replace(/\s*\([^)]*\)/g, ''));
    if (baslik === anahtar || baslik === `${anahtar}mahallesi`) return k;
  }
  return null;
}

export type MahalleGorunusu = 'A' | 'B';

/** Resmin adresi */
export const mahalleHaritaAdresi = (kimlik: string, gorunus: MahalleGorunusu) =>
  `${import.meta.env.BASE_URL || '/'}harita/mahalle-2b/${kimlik}-${gorunus}.png`;

/** İndirilen dosyanın adı: "liman-mahallesi-sehir-plani.png" gibi */
export function mahalleHaritaDosyaAdi(kimlik: string, gorunus: MahalleGorunusu): string {
  const ad = sadelestir(MAHALLE_ADI[kimlik] || kimlik.slice(4));
  return `${ad}-mahallesi-${gorunus === 'A' ? 'sehir-plani' : 'poster'}.png`;
}
