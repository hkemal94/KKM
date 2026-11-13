import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * İş akışı (13 Kasım, Kemal: "iş akışımızı aynı şekilde KKM'ye aktarma ve hyperlink
 * gibi kurgulama; ajanlar süreçlerini bilir böylece"). İki çizim ajansın deposunda,
 * `docs/is-akisi/` altında: Resmi akış (tuvalin kopyası) ve KKM'nin bugünkü ekranları.
 * Kems `araclar/is_akisi.py` ile yazar; KKM yalnız okur ve gösterir (düzenleme yok).
 * Kutudaki `ajan` ajan kartını, `git` KKM'de o ekranı açar.
 */

export type CizimId = 'resmi' | 'ekranlar';
export const CIZIMLER: Array<{ id: CizimId; ad: string; yol: string }> = [
  { id: 'resmi', ad: 'Resmi akış', yol: 'docs/is-akisi/resmi-akis.json' },
  { id: 'ekranlar', ad: 'KKM ekranları', yol: 'docs/is-akisi/kkm-ekranlari.json' },
];

export type DugumTuru = 'kisi' | 'yonetici' | 'ajan' | 'arac' | 'kayit' | 'karar' | 'kanal';
export interface Dugum {
  id: string; ad: string; alt?: string; not?: string; kisa?: string;
  tur?: DugumTuru; durum?: 'var' | 'istenen'; grup?: string | null; x: number; y: number;
  /** ajan dosyasının adı (ajan kartı) */ ajan?: string;
  /** KKM'deki ekranın adı (App → git) */ git?: string;
}
export interface Grup { id: string; ad: string; not?: string; renk?: string; asama?: string | null; sira?: number; x: number; y: number; w: number; h: number }
export interface Bag { id: string; k: string; h: string; etiket?: string }
export interface Asama { id: string; ad: string }
export interface Cizim { asamalar: Asama[]; gruplar: Grup[]; dugumler: Dugum[]; baglar: Bag[] }

export const TURLER: Record<DugumTuru, { ad: string; renk: string }> = {
  kisi: { ad: 'Kişi', renk: '#BBA591' },
  yonetici: { ad: 'Yönetici', renk: '#F26B6F' },
  ajan: { ad: 'Ajan', renk: '#8FC1B0' },
  arac: { ad: 'Araç / ekran', renk: '#9FB4EC' },
  kayit: { ad: 'Kayıt / pano', renk: '#C9B6E8' },
  karar: { ad: 'Karar', renk: '#E4DCCD' },
  kanal: { ad: 'Kanal', renk: '#E7C27F' },
};
export const RENKLER: Record<string, string> = {
  sari: '#C9A227', turuncu: '#E07B39', kirmizi: '#D9455F', pembe: '#D45B9E', mor: '#6C63D9', lacivert: '#3F51B5',
  mavi: '#3C8DD9', turkuaz: '#1FA3A3', yesil: '#2F9E6B', cimen: '#7CB342', kahve: '#9C6B4E', gri: '#8A8F99',
};

/** Tuvalle aynı ölçüler: kutu 130 geniş, taş 64 */
export const NW = 130, TAS = 64;

export async function cizimOku(anahtar: string, id: CizimId): Promise<Cizim> {
  const yol = CIZIMLER.find(c => c.id === id)!.yol;
  const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}`);
  const j = JSON.parse(base64Coz(d.content)) as Partial<Cizim>;
  return {
    asamalar: Array.isArray(j.asamalar) ? j.asamalar : [],
    gruplar: Array.isArray(j.gruplar) ? j.gruplar : [],
    dugumler: Array.isArray(j.dugumler) ? j.dugumler.filter(n => n && typeof n.x === 'number' && typeof n.y === 'number') : [],
    baglar: Array.isArray(j.baglar) ? j.baglar : [],
  };
}

/** Kems'in kartı 'Kems', akıştaki kutusu 'kems' */
export const ajanEslesir = (dugumAjani: string | undefined, kartAdi: string) =>
  !!dugumAjani && (dugumAjani === kartAdi || (dugumAjani === 'kems' && kartAdi === 'Kems'));

/** Ajanın resmi akıştaki adımları: hangi aşama, hangi bölüm, önce ve sonra ne var */
export function ajaninAdimlari(c: Cizim, kartAdi: string) {
  const D = new Map(c.dugumler.map(n => [n.id, n]));
  const G = new Map(c.gruplar.map(g => [g.id, g]));
  const A = new Map(c.asamalar.map(a => [a.id, a.ad]));
  return c.dugumler.filter(n => ajanEslesir(n.ajan, kartAdi)).map(n => {
    const g = n.grup ? G.get(n.grup) : undefined;
    return {
      dugum: n,
      bolum: g?.ad || 'Çerçevesiz',
      asama: (g?.asama && A.get(g.asama)) || '',
      sira: g?.sira ?? 99,
      once: c.baglar.filter(b => b.h === n.id).map(b => D.get(b.k)?.ad).filter(Boolean) as string[],
      sonra: c.baglar.filter(b => b.k === n.id).map(b => D.get(b.h)?.ad).filter(Boolean) as string[],
    };
  }).sort((a, b) => a.sira - b.sira);
}

export function kisalt(ad: string): string {
  const p = (ad || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] || '?').slice(0, 2)).toLocaleUpperCase('tr');
}
