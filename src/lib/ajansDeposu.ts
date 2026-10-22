/**
 * Kems Ajans'ın deposu, canlı okunur (21 Ekim, Kemal: "sizleri bu konuda
 * entegre etmek en çok istediğim şey"; ilk iş Ajans sayfası).
 *
 * - Ajans `hkemal94/Kems-Ajans` deposuna dosya bırakır: öneriler, videolar,
 *   raporlar, panoya gidecek notlar. KKM bu klasörleri listeler; dosyanın
 *   kendisi oyun deposundaki gibi `lib/depoBelgesi.ts` ile okunur.
 * - Yalnız okur: KKM kayıtlarına bir şey yazılmaz (yazma sınırı yemez),
 *   ajansın deposuna da hiçbir şey yazılmaz.
 * - Ana daldaki hâl okunur: ajansın işi Kemal birleştirince görünür.
 * - Depo gizli (22 Ekim): okuma bu tarayıcıdaki GitHub anahtarıyla yapılır
 *   (`lib/depoBelgesi.ts` → `anahtarBasligi`); anahtar yoksa dosyalar görünmez.
 */

import { anahtarBasligi } from './depoBelgesi';

export const AJANS_DEPOSU = 'hkemal94/Kems-Ajans';

export interface AjansKlasoru { yol: string; ad: string; aciklama: string }

export const AJANS_KLASORLERI: AjansKlasoru[] = [
  { yol: 'pano', ad: 'Pano notları', aciklama: 'Müdür ve şeflerin kısa notları' },
  { yol: 'oneriler', ad: 'Öneriler', aciklama: 'Sosyal medya, takvim, başlık, trend, merch ve drop' },
  { yol: 'videolar', ad: 'Videolar', aciklama: 'Video iskeletleri ve kurgu listeleri' },
  { yol: 'raporlar', ad: 'Raporlar', aciklama: 'Viki, kanon, marka denetimi, oyun, kod, yazı' }
];

/** Ajansın elle okunacak belgeleri */
export const AJANS_BELGELERI: { yol: string; ad: string }[] = [
  { yol: 'docs/kkm-yol-haritasi.md', ad: 'KKM yol haritası (ajansın listesi)' },
  { yol: 'docs/devir-notu.md', ad: 'Devir notu: nerede kaldık' },
  { yol: 'docs/sonra-sorulacaklar.md', ad: 'Sonra sorulacaklar' }
];

export interface AjansDosyasi {
  yol: string;
  ad: string;
  /** Dosya adındaki GG-AA-YYYY tarihi, yoksa null */
  tarih: Date | null;
}

/** "sosyal-27-10-2026.md" → 27 Ekim 2026; tarihsizse null */
export function dosyaTarihi(ad: string): Date | null {
  const m = ad.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(t.getTime()) ? null : t;
}

/** Dosya adından okunur başlık: tarih ve uzantı düşer, tireler boşluk olur */
export function dosyaBasligi(ad: string): string {
  const s = ad.replace(/\.md$/, '').replace(/-?\d{2}-\d{2}-\d{4}-?/, ' ').replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : ad;
}

/** Klasördeki Markdown dosyaları, yeniden eskiye; README sayılmaz */
export async function klasoruOku(klasor: string): Promise<AjansDosyasi[]> {
  const r = await fetch(`https://api.github.com/repos/${AJANS_DEPOSU}/contents/${klasor}`, { cache: 'no-cache', headers: anahtarBasligi() });
  if (r.status === 404 && !Object.keys(anahtarBasligi()).length) throw new Error('depo gizli; Oyun → Ajansa gönder\'deki GitHub anahtarını bu tarayıcıya kaydet');
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub okuma sınırı doldu, biraz sonra yenile' : `${r.status}`);
  const liste: { name: string; path: string; type: string }[] = await r.json();
  return liste
    .filter(d => d.type === 'file' && d.name.endsWith('.md') && d.name.toLowerCase() !== 'readme.md')
    .map(d => ({ yol: d.path, ad: d.name, tarih: dosyaTarihi(d.name) }))
    .sort((a, b) => (b.tarih?.getTime() ?? 0) - (a.tarih?.getTime() ?? 0) || a.ad.localeCompare(b.ad, 'tr'));
}
