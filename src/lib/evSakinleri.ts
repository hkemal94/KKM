import type { FeatureCollection } from 'geojson';
import type { Item } from '../types';
import { kisiMi } from './adaSakini';

/**
 * Haritada kim nerede oturuyor (3 Kasım, Kemal: "kimin nerede oturduğu
 * görünsün"). Yalnız okur; hiçbir kayda yazmaz.
 *
 * Bağ yalnız kayıtta açıkça kurulmuşsa sayılır, tahminle eşleme yapılmaz:
 *
 *   1. Ev, Kurucu'da bir viki maddesine bağlı (binanın `wikiId`'si) ve bir
 *      kişinin kaydında o maddeye "Bulunduğu yer" bağı var → kişi o evde.
 *   2. Ev doğrudan bir kişi maddesine bağlı → o kişi o evde.
 *
 * Künyedeki "Evi" alanı serbest yazı; haritadaki bir eve işaret etmediği için
 * eşlenmez. Bu alanı dolu olup hiçbir eve bağlanamayan kişiler sayılır ki
 * eksik görünür olsun.
 */

/** Kurucu'da konan ev türleri (haritadaki evler `tur: 'ev'`) */
const KURUCU_EV_TURLERI = ['ev', 'dukkanli', 'yazlik'];

export const OTURMA_BAGI = 'bulunduğu yer';

export interface EvSakini { id: string; ad: string }

export interface EvSakinleri {
  /** Binanın `wikiId`'si → o evde oturan kişiler */
  maddeye: Map<string, EvSakini[]>;
  /** Künyesinde "Evi" yazılı ama haritadaki hiçbir eve bağlanamayan kişi sayısı */
  baglanamayan: number;
}

/** Bu harita özelliği bir ev mi */
export function evMi(p: Record<string, unknown> | null | undefined): boolean {
  if (!p || p.katman !== 'bina') return false;
  return p.tur === 'ev' || KURUCU_EV_TURLERI.includes(String(p.kurucuTur ?? ''));
}

/** Haritadaki evlerin bağlı olduğu madde kimlikleri */
export function evMaddeleri(geo: FeatureCollection): Set<string> {
  const kume = new Set<string>();
  for (const f of geo.features) {
    const p = f.properties as Record<string, unknown> | null;
    if (evMi(p) && typeof p?.wikiId === 'string' && p.wikiId) kume.add(p.wikiId);
  }
  return kume;
}

export function evSakinleri(items: Item[], evler: Set<string>): EvSakinleri {
  const maddeye = new Map<string, EvSakini[]>();
  const canli = items.filter(i => !i.archived && !i.isProposal);

  // Kayıt kimliği → evin wikiId'si (sonradan bağlanan kayıt `haritaWikiId` taşır)
  const evAnahtari = new Map<string, string>();
  for (const i of canli) {
    if (evler.has(i.id)) evAnahtari.set(i.id, i.id);
    const hw = String(i.metadata?.haritaWikiId || '');
    if (hw && evler.has(hw)) evAnahtari.set(i.id, hw);
  }

  const ekle = (anahtar: string, k: Item) => {
    const liste = maddeye.get(anahtar) ?? [];
    if (!liste.some(s => s.id === k.id)) liste.push({ id: k.id, ad: k.title });
    maddeye.set(anahtar, liste);
  };

  const bagli = new Set<string>();
  for (const k of canli) {
    if (!kisiMi(k)) continue;
    // 2. Ev doğrudan kişiye bağlı
    const dogrudan = evAnahtari.get(k.id);
    if (dogrudan) { ekle(dogrudan, k); bagli.add(k.id); }
    // 1. Kişi → "Bulunduğu yer" → evin maddesi
    const baglar = Array.isArray(k.metadata?.relations) ? k.metadata!.relations as Array<{ targetId?: string; type?: string; isProposal?: boolean }> : [];
    for (const r of baglar) {
      if (!r?.targetId || r.isProposal || r.type !== OTURMA_BAGI) continue;
      const anahtar = evAnahtari.get(r.targetId);
      if (anahtar) { ekle(anahtar, k); bagli.add(k.id); }
    }
  }

  let baglanamayan = 0;
  for (const k of canli) {
    if (!kisiMi(k) || bagli.has(k.id)) continue;
    const evi = k.metadata?.profile?.evi;
    if (typeof evi === 'string' && evi.trim()) baglanamayan++;
  }

  for (const liste of maddeye.values()) liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return { maddeye, baglanamayan };
}

/**
 * Evin numarası: üretilmiş evlerde kimliğin sonundaki sayı (`ev_yer_iskele_224`).
 * Geçicidir; sokak ve adres adı Kemal'in. Kurucu'da konan evin numarası yok.
 */
export function evNumarasi(id: unknown): string | null {
  const m = /^(?:ev|konut)_.*_(\d+)(?:_p\d+)?$/.exec(String(id ?? ''));
  return m ? m[1] : null;
}
