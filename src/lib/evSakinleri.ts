import type { FeatureCollection } from 'geojson';
import type { Item } from '../types';
import type { HaritaDuzeni } from '../components/harita/duzenTipi';
import { bosDuzen } from '../components/harita/duzenKatmani';
import { bosTaslak, taslaktanBelge } from '../components/kurucu/kurucuTipi';
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
 *   3. Kurucu'da ya da 3B haritadaki ev kartında eve oturan eklendi
 *      (Kurucu taslağının `oturanlar` alanı, 3 Kasım) → o kişiler o evde.
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
  /** Haritadaki evin kimliği → o evde oturan kişiler */
  evlere: Map<string, EvSakini[]>;
  /** Künyesinde "Evi" yazılı ama haritadaki hiçbir eve bağlanamayan kişi sayısı */
  baglanamayan: number;
}

/** Bu harita özelliği bir ev mi */
export function evMi(p: Record<string, unknown> | null | undefined): boolean {
  if (!p || p.katman !== 'bina') return false;
  return p.tur === 'ev' || KURUCU_EV_TURLERI.includes(String(p.kurucuTur ?? ''));
}

/** Kurucu'daki yapı ev mi: Kurucu türü varsa ona, yoksa haritadaki türe bakılır */
export function kurucuEvMi(tur: string | null | undefined, haritaTur?: string): boolean {
  return tur ? KURUCU_EV_TURLERI.includes(tur) : haritaTur === 'ev';
}

/**
 * Evde oturanlar Kurucu taslağında durur; "Haritaya işle" beklemez. Taslak
 * işlenenle aynıysa kayıtta yalnız işlenen durur, o zaman ondan okunur.
 */
export function oturanlariOku(d: HaritaDuzeni | null | undefined): Record<string, string[]> {
  return (d?.kurucu ?? d?.kurucuIslenen)?.oturanlar ?? {};
}

/**
 * 3B haritadaki ev kartının "Kaydet"i için (3 Kasım): evin oturanları
 * değişmiş yeni düzen. Saf işlev, kendisi yazmaz; kaydı Kemal'in düğmesiyle
 * Atölye yazar (harita düzeninin her zamanki kaydetme yolu). Oturanlar
 * Kurucu taslağına girer; taslak yoksa haritadaki hâl taslak olarak alınır.
 */
export function oturanlariDegistir(d: HaritaDuzeni | null, evId: string, kisiIdleri: string[]): HaritaDuzeni {
  const temel = d ?? bosDuzen();
  const taslak = temel.kurucu ?? temel.kurucuIslenen ?? taslaktanBelge(bosTaslak());
  const oturanlar = { ...(taslak.oturanlar ?? {}) };
  const kisiler = [...new Set(kisiIdleri.filter(Boolean))];
  if (kisiler.length) oturanlar[evId] = kisiler; else delete oturanlar[evId];
  return { ...temel, guncelleme: Date.now(), kurucu: { ...taslak, oturanlar } };
}

/**
 * Haritadaki evlerde kim oturuyor.
 *
 * `geo`: çizili harita (düzen uygulanmış). `oturanlar`: Kurucu taslağındaki
 * ev → kişi bağları (yoksa boş).
 */
export function evSakinleri(items: Item[], geo: FeatureCollection, oturanlar: Record<string, string[]> = {}): EvSakinleri {
  const evlere = new Map<string, EvSakini[]>();
  const canli = items.filter(i => !i.archived && !i.isProposal);
  const kisiler = new Map(canli.filter(kisiMi).map(k => [k.id, k] as const));

  // Evin maddesi → o maddeye bağlı evler (bir madde birden çok eve bağlı olabilir)
  const maddedenEve = new Map<string, string[]>();
  const evIdleri: string[] = [];
  for (const f of geo.features) {
    const p = f.properties as Record<string, unknown> | null;
    if (!evMi(p)) continue;
    const evId = String(p?.id ?? '');
    if (!evId) continue;
    evIdleri.push(evId);
    if (typeof p?.wikiId === 'string' && p.wikiId) maddedenEve.set(p.wikiId, [...(maddedenEve.get(p.wikiId) ?? []), evId]);
  }

  // Kayıt kimliği → evin maddesi (sonradan bağlanan kayıt `haritaWikiId` taşır)
  const evAnahtari = new Map<string, string>();
  for (const i of canli) {
    if (maddedenEve.has(i.id)) evAnahtari.set(i.id, i.id);
    const hw = String(i.metadata?.haritaWikiId || '');
    if (hw && maddedenEve.has(hw)) evAnahtari.set(i.id, hw);
  }

  const eveEkle = (evId: string, k: Item) => {
    const liste = evlere.get(evId) ?? [];
    if (!liste.some(s => s.id === k.id)) liste.push({ id: k.id, ad: k.title });
    evlere.set(evId, liste);
  };
  const maddeyeEkle = (madde: string, k: Item) => { for (const evId of maddedenEve.get(madde) ?? []) eveEkle(evId, k); };

  const bagli = new Set<string>();
  for (const k of kisiler.values()) {
    // 2. Ev doğrudan kişiye bağlı
    const dogrudan = evAnahtari.get(k.id);
    if (dogrudan) { maddeyeEkle(dogrudan, k); bagli.add(k.id); }
    // 1. Kişi → "Bulunduğu yer" → evin maddesi
    const baglar = Array.isArray(k.metadata?.relations) ? k.metadata!.relations as Array<{ targetId?: string; type?: string; isProposal?: boolean }> : [];
    for (const r of baglar) {
      if (!r?.targetId || r.isProposal || r.type !== OTURMA_BAGI) continue;
      const anahtar = evAnahtari.get(r.targetId);
      if (anahtar) { maddeyeEkle(anahtar, k); bagli.add(k.id); }
    }
  }
  // 3. Kurucu'da eve eklenen oturanlar
  for (const evId of evIdleri) {
    for (const kisiId of oturanlar[evId] ?? []) {
      const k = kisiler.get(kisiId);
      if (k) { eveEkle(evId, k); bagli.add(k.id); }
    }
  }

  let baglanamayan = 0;
  for (const k of kisiler.values()) {
    if (bagli.has(k.id)) continue;
    const evi = k.metadata?.profile?.evi;
    if (typeof evi === 'string' && evi.trim()) baglanamayan++;
  }

  for (const liste of evlere.values()) liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return { evlere, baglanamayan };
}

/**
 * Evin numarası: üretilmiş evlerde kimliğin sonundaki sayı (`ev_yer_iskele_224`).
 * Geçicidir; sokak ve adres adı Kemal'in. Kurucu'da konan evin numarası yok.
 */
export function evNumarasi(id: unknown): string | null {
  const m = /^(?:ev|konut)_.*_(\d+)(?:_p\d+)?$/.exec(String(id ?? ''));
  return m ? m[1] : null;
}
