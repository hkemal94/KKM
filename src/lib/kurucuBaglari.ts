import type { KurucuTaslak } from '../components/kurucu/kurucuTipi';
import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Kurucu'nun viki bağları ve ajansın harita önerileri (4 Kasım, Kemal).
 *
 * - Yapı kaldırılınca (gizlenince) bağı da kalkar (Kurucu bunu kaldırırken
 *   yapar: `bagsizGizle`). Önceden kalmış artık bağlar için Kurucu'da uyarı ve
 *   "Artık bağları temizle" düğmesi var (`artikBaglar`, `artiklariTemizle`).
 *   Birahane örneği: kaldırılan binanın bağı duruyordu, görünen binada da aynı
 *   madde vardı.
 * - Aynı maddeye bağlı iki görünen yapı varsa yalnız uyarı (`ciftBaglar`);
 *   hiçbir şey silinmez.
 * - Ajans `kkm/harita-onerileri.json`'a oturan önerisi (ev → kişi) yazar;
 *   Kurucu "Ajansın önerileri"nde gösterir, Kemal "Uygula" deyince öneri
 *   taslağa girer, Kurucu'nun normal kaydıyla kaydedilir. Dosya yalnız okunur.
 *
 * Bu dosyadaki işler saftır (ağ yalnız `haritaOnerileriniOku`'da).
 */

/** Gizlenen yapıların bağları da düşer (taslağın yeni hâli) */
export function bagsizGizle(t: KurucuTaslak, idler: string[]): KurucuTaslak {
  const gz = new Set(t.gizlenen);
  idler.forEach(id => gz.add(id));
  return { ...t, gizlenen: [...gz], baglar: baglardanCikar(t.baglar, idler) };
}

/** Bağlardan verilen yapıları çıkarır (değişmediyse aynı nesne) */
export function baglardanCikar(baglar: Record<string, string>, idler: Iterable<string>): Record<string, string> {
  const cik = [...idler].filter(id => id in baglar);
  if (!cik.length) return baglar;
  const bg = { ...baglar };
  for (const id of cik) delete bg[id];
  return bg;
}

export interface ArtikBag { yapi: string; madde: string; neden: 'kaldirildi' | 'yok' }

/**
 * Artık bağlar: yapısı kaldırılmış (gizlenen) ya da Kurucu'da artık hiç
 * olmayan bağlar. `varOlanlar`: Kurucu'daki bütün yapı, yol ve doğa kimlikleri.
 */
export function artikBaglar(t: KurucuTaslak, varOlanlar: Set<string>): ArtikBag[] {
  const gizli = new Set(t.gizlenen);
  return Object.entries(t.baglar)
    .filter(([yapi]) => gizli.has(yapi) || !varOlanlar.has(yapi))
    .map(([yapi, madde]) => ({ yapi, madde, neden: gizli.has(yapi) ? 'kaldirildi' as const : 'yok' as const }));
}

export function artiklariTemizle(t: KurucuTaslak, artik: ArtikBag[]): KurucuTaslak {
  const bg = baglardanCikar(t.baglar, artik.map(a => a.yapi));
  return bg === t.baglar ? t : { ...t, baglar: bg };
}

/**
 * Aynı maddeye bağlı birden çok görünen yapı. `gorunenler`: görünen her yapının
 * kimliği ve haritadan gelen bağı; `lider`: tek parça grupların başı (otel ve
 * kuleleri bir yapı sayılır).
 */
export function ciftBaglar(
  t: KurucuTaslak,
  gorunenler: Array<{ id: string; wikiId?: string | null }>,
  lider: (id: string) => string = id => id
): Array<{ madde: string; yapilar: string[] }> {
  const madde = new Map<string, Set<string>>();
  for (const y of gorunenler) {
    const m = t.baglar[y.id] ?? y.wikiId;
    if (!m) continue;
    if (!madde.has(m)) madde.set(m, new Set());
    madde.get(m)!.add(lider(y.id));
  }
  return [...madde.entries()].filter(([, s]) => s.size > 1).map(([m, s]) => ({ madde: m, yapilar: [...s] }));
}

// ---- ajansın harita önerileri ------------------------------------------------

export const HARITA_ONERILERI_YOLU = 'kkm/harita-onerileri.json';

export interface OturanOnerisi { id: string; tur: 'oturan'; ev: string; kisi: string; not?: string }
export interface HaritaOnerileri { olusturuldu: string; oneriler: OturanOnerisi[] }

/** Dosyadaki geçerli biçimdeki öneriler (bilinmeyen tür ve eksik alan düşer) */
export function onerileriAyikla(ham: unknown): HaritaOnerileri {
  const o = (ham && typeof ham === 'object' ? ham : {}) as { olusturuldu?: unknown; oneriler?: unknown };
  const liste = Array.isArray(o.oneriler) ? o.oneriler : [];
  return {
    olusturuldu: typeof o.olusturuldu === 'string' ? o.olusturuldu : '',
    oneriler: liste.flatMap((x): OturanOnerisi[] => {
      const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      if (r.tur !== 'oturan' || typeof r.ev !== 'string' || typeof r.kisi !== 'string' || !r.ev || !r.kisi) return [];
      const id = typeof r.id === 'string' && r.id ? r.id : `${r.ev}:${r.kisi}`;
      return [{ id, tur: 'oturan', ev: r.ev, kisi: r.kisi, ...(typeof r.not === 'string' && r.not.trim() ? { not: r.not.trim() } : {}) }];
    })
  };
}

export type OneriDurumu = 'bekliyor' | 'uygulandi' | 'ev-yok' | 'kisi-yok';

/** Önerinin taslağa göre durumu */
export function oneriDurumu(t: KurucuTaslak, o: OturanOnerisi, evler: Set<string>, kisiler: Set<string>): OneriDurumu {
  if ((t.oturanlar[o.ev] ?? []).includes(o.kisi)) return 'uygulandi';
  if (!evler.has(o.ev)) return 'ev-yok';
  if (!kisiler.has(o.kisi)) return 'kisi-yok';
  return 'bekliyor';
}

/** Önerileri taslağa ekler (Kurucu'nun "oturan ekle"siyle aynı iş); zaten eklenmiş olan değişmez */
export function onerileriUygula(t: KurucuTaslak, oneriler: OturanOnerisi[]): KurucuTaslak {
  let o = t.oturanlar;
  for (const x of oneriler) {
    const liste = o[x.ev] ?? [];
    if (liste.includes(x.kisi)) continue;
    o = { ...o, [x.ev]: [...liste, x.kisi] };
  }
  return o === t.oturanlar ? t : { ...t, oturanlar: o };
}

/** Ajansın önerilerini gizli depodan okur; dosya yoksa ya da okunamazsa null */
export async function haritaOnerileriniOku(anahtar: string): Promise<HaritaOnerileri | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${HARITA_ONERILERI_YOLU}`);
    return onerileriAyikla(JSON.parse(base64Coz(d.content)));
  } catch {
    return null;
  }
}

/** "Yok say": yalnız bu tarayıcıda hatırlanır, kayda yazılmaz */
const YOK_SAY = 'kkm_harita_onerisi_yok_say';
export function yokSayilanlar(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(YOK_SAY) || '[]') as string[]); } catch { return new Set(); }
}
export function yokSay(idler: string[]): Set<string> {
  const s = yokSayilanlar();
  idler.forEach(id => s.add(id));
  try { localStorage.setItem(YOK_SAY, JSON.stringify([...s])); } catch { /* yok */ }
  return s;
}
