import type { Item } from '../../types';
import { schemaKeyFor, getKunyeFields, getEkBilgiler } from './wikiSchema';
import { DEFAULT_QUESTIONS_BY_CAT } from './kunyeSorulari';

/**
 * Soy ağacının ve aile sayfasının künye okuyucusu (20 Kasım'da `SoyAgaci.tsx`'te
 * doğdu; 24 Kasım'da aile sayfası da kullansın diye buraya taşındı). Yalnız okur.
 */

/** Türkçe harfler sadeleşir, boşluk düşer: "Soyadı" ~ "soyadi", "Doğum yılı" ~ "dogumYili" (20 Kasım) */
const sade = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr')
  .replace(/[çğıöşüâî]/g, h => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' } as Record<string, string>)[h] || h)
  .replace(/[^a-z0-9]+/g, '');

/** Künye değeri: alan kimliğiyle ya da etiketiyle ("Eşi" gibi türe sonradan eklenen alanlar) */
export const soyDegeri = (i: Item, id: string): string => {
  if (!schemaKeyFor(i.type)) return '';
  const alanlar = getKunyeFields(i);
  // Kimlik ve hazır alanın adları (ör. dogumYili → "Doğum yılı", "Doğum", "Doğum tarihi")
  const hazir = DEFAULT_QUESTIONS_BY_CAT.kisi.find(f => f.id === id);
  const adlar = new Set([id, ...(hazir ? [hazir.label, ...(hazir.esAdlar || [])] : [])].map(sade));
  const etiket = (f: { label: string }) => adlar.has(sade(f.label));
  // Şemada yoksa metindeki künye satırından ("* Eşi: …") okunur
  return (alanlar.find(f => f.id === id) || alanlar.find(etiket) || getEkBilgiler(i).find(etiket))?.value || '';
};
