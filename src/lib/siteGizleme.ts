import type { Item } from '../types';
import { getArticleBody, getKunyeFields, schemaKeyFor, type KunyeField } from '../components/wiki/wikiSchema';
import { semaAlanlari, takmaAdlar } from './alanSablonu';

/**
 * Sitede alan bazında gizleme (6. gece, 7 Ekim; vvd'den). İki düzey
 * (Kemal'in seçimi): alan şablonunda "sitede gizli" (o türün bütün
 * maddeleri) ve tek maddede tek parça (`metadata.sitedeGizli`). Gizlenebilen
 * parçalar: künye alanı, metin bölümü, diğer adları, görsel (Kemal'in
 * seçimi). Vikide ve düzenleyicide hiçbir şey gizlenmez; yalnız site.
 *
 * Anahtarlar: `alan:<id>`, `bolum:<anahtar>` (giriş metni `bolum:giris`),
 * `takma`, `gorsel`.
 */

export const maddeGizlileri = (i: Item): Set<string> =>
  new Set(((i.metadata?.sitedeGizli as unknown[]) || []).filter((x): x is string => typeof x === 'string'));

/** Alan şablonunda "sitede gizli" işaretli alanlar (bu maddenin türü için) */
export function sablondaGizli(i: Item): Set<string> {
  const anahtar = schemaKeyFor(i.type);
  return new Set(anahtar ? semaAlanlari(anahtar).filter(a => a.sitedeGizli).map(a => a.id) : []);
}

/** Bir parçayı bu maddede gizler ya da açar; kayıt Kemal'in düğmesiyle yazılır */
export function gizlemeDegistir(i: Item, anahtar: string, gizli: boolean): Item {
  const s = maddeGizlileri(i);
  if (gizli) s.add(anahtar); else s.delete(anahtar);
  return { ...i, metadata: { ...(i.metadata || {}), sitedeGizli: Array.from(s) } as Item['metadata'], updatedAt: Date.now() };
}

/** Sitede görünecek künye satırları */
export function sitedeKunye(i: Item): KunyeField[] {
  const madde = maddeGizlileri(i), sablon = sablondaGizli(i);
  return getKunyeFields(i).filter(f => !sablon.has(f.id) && !madde.has(`alan:${f.id}`));
}

/**
 * Sitede görünecek metin: gizlenen bölümler çıkar. Öneri bölümleri de
 * görünür (Kemal, 22 Ekim): maddeye yalnız Kemal "Ekle" deyince girerler,
 * yani kabul edilmişlerdir. Tek tek gizlemek için "Sitede görünenler".
 */
export function sitedeGovde(i: Item) {
  const madde = maddeGizlileri(i);
  return getArticleBody(i).filter(b => !(b.anahtar && madde.has(`bolum:${b.anahtar}`)));
}

export const sitedeTakmaAdlar = (i: Item): string[] => (maddeGizlileri(i).has('takma') ? [] : takmaAdlar(i));
export const sitedeGorselVar = (i: Item): boolean => !maddeGizlileri(i).has('gorsel');

/** Madde sayfasındaki "Sitede görünenler" listesi: gizlenebilen her parça */
export interface GizlenebilenParca { anahtar: string; ad: string; tur: 'alan' | 'bolum' | 'takma' | 'gorsel'; sablonda: boolean; gizli: boolean }
export function gizlenebilenler(i: Item, gorselVar: boolean): GizlenebilenParca[] {
  const madde = maddeGizlileri(i), sablon = sablondaGizli(i);
  const cikti: GizlenebilenParca[] = [];
  for (const f of getKunyeFields(i)) {
    const a = `alan:${f.id}`;
    cikti.push({ anahtar: a, ad: f.label, tur: 'alan', sablonda: sablon.has(f.id), gizli: sablon.has(f.id) || madde.has(a) });
  }
  for (const b of getArticleBody(i)) {
    if (!b.anahtar) continue;
    const a = `bolum:${b.anahtar}`;
    cikti.push({ anahtar: a, ad: b.heading || 'Giriş metni', tur: 'bolum', sablonda: false, gizli: madde.has(a) });
  }
  if (takmaAdlar(i).length) cikti.push({ anahtar: 'takma', ad: 'Diğer adları', tur: 'takma', sablonda: false, gizli: madde.has('takma') });
  if (gorselVar) cikti.push({ anahtar: 'gorsel', ad: 'Görsel', tur: 'gorsel', sablonda: false, gizli: madde.has('gorsel') });
  return cikti;
}
