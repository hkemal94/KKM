/**
 * Tek harita (6. adım, 21 Kasım; Kemal 20 Kasım): verinin okunması.
 *
 * Bütün veri `public/harita/` altındaki statik dosyalardan gelir (1–5. adımların
 * üreteçleri yazar). Bu dosya yalnız okur: Firestore'a, harita kaydına, Kurucu'ya
 * hiçbir şey yazılmaz, oradan da okunmaz.
 *
 * Sahne ölçüsü metre: x doğu, y yukarı, z güney (kuzey −z). Dönüşüm zemin
 * dosyasının başlığındaki `lng0`, `lat0`, `mPerLng`, `mPerLat` ile.
 */

import { MODEL_ESLEME, YAMAC_MODELLERI } from './modelEsleme';

export type Nokta = [number, number];

export interface ZeminBasligi {
  en: number; boy: number; hucre: number; x0: number; y0: number;
  lat0: number; lng0: number; mPerLat: number; mPerLng: number; birim: number;
}

export interface Zemin {
  b: ZeminBasligi;
  /** Rakım (metre), satırlar güneyden kuzeye: h[j * en + i] */
  h: Float32Array;
  /** Hücrenin kum ağırlığı 0–255 (kum kıyısına yakın, alçak kara; kenarda yumuşak) */
  kum: Uint8Array;
  /**
   * Ekranda çizilen rakım (24 Kasım): `h`'nin kıyı şeridi yumuşatılmış hâli (`kiyiYumusat`).
   * Zemin katı bunu çizer; yapılar ve bahçeler buna oturur. Zemin aracı `h`'yi değiştirince
   * zemin katı o bölgeyi yeniden hesaplar (`kiyiBolgesi`).
   */
  ciz: Float32Array;
}

type Ozellikler = Record<string, unknown>;
export interface Oge<G = unknown> { type: 'Feature'; properties: Ozellikler; geometry: { type: string; coordinates: G } }
export interface Koleksiyon { type: 'FeatureCollection'; features: Oge[] }

export const haritaAdresi = (dosya: string) => `${import.meta.env.BASE_URL || '/'}harita/${dosya}`;

/** İndirilen bayt (ölçüm için; sıkıştırılmış hâliyle) */
export const indirme = { bayt: 0, dosyalar: {} as Record<string, number> };

export async function indir(dosya: string, sinyal?: AbortSignal): Promise<ArrayBuffer> {
  const y = await fetch(haritaAdresi(dosya), { signal: sinyal });
  if (!y.ok) throw new Error(`${dosya}: ${y.status}`);
  const a = await y.arrayBuffer();
  indirme.bayt += a.byteLength;
  indirme.dosyalar[dosya] = a.byteLength;
  return a;
}

export async function geoOku(dosya: string, sinyal?: AbortSignal): Promise<Koleksiyon> {
  return JSON.parse(new TextDecoder().decode(await indir(dosya, sinyal))) as Koleksiyon;
}

/** Zemin ızgarası: gzip içinde "DZZ1", başlık uzunluğu, JSON başlık, int16 rakımlar (×0,1 m) */
export async function zeminOku(sinyal?: AbortSignal): Promise<Zemin> {
  const ham = await indir('duzada-zemin.bin', sinyal);
  const acik = await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const v = new DataView(acik);
  const imza = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (imza !== 'DZZ1') throw new Error('zemin dosyası tanınmadı');
  const n = v.getUint32(4, true);
  const b = JSON.parse(new TextDecoder().decode(new Uint8Array(acik, 8, n))) as ZeminBasligi;
  const adet = b.en * b.boy;
  const h = new Float32Array(adet);
  const bas = 8 + n;
  for (let k = 0; k < adet; k++) h[k] = v.getInt16(bas + k * 2, true) * b.birim;
  const z: Zemin = { b, h, kum: new Uint8Array(adet), ciz: new Float32Array(h) };
  kiyiBolgesi(z, 0, 0, b.en - 1, b.boy - 1);
  return z;
}

/**
 * Kıyı çizgisi (6b, 22 Kasım; Kemal: kumsal kenarı tırtıklı): verideki kıyı 10 m'lik
 * hücrelerde basamaklı (kumsal ~3 m'den denize tek hücrede iner), çizimde testere dişi
 * görünüyordu. Yalnız çizim için, yalnız kıyı şeridinde (2 hücre içinde hem deniz hem
 * kara olan, 4 m'den alçak hücreler) rakım çevresinin ağırlıklı ortalaması olur.
 * Kutudaki hücrelerin `z.ciz`'i `z.h`'den yeniden hesaplanır (8. adım: zemin aracı da çağırır).
 * Veri değişmez. 24 Kasım'dan beri yapılar da bu çizilen rakıma oturur (`tabanKotu`).
 */
export function kiyiBolgesi(z: Zemin, i0: number, j0: number, i1: number, j1: number) {
  const { b, h, ciz } = z;
  const R = 2;
  for (let j = Math.max(0, j0); j <= Math.min(b.boy - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(b.en - 1, i1); i++) {
    const k = j * b.en + i;
    ciz[k] = h[k];
    if (j < R || i < R || j >= b.boy - R || i >= b.en - R) continue;
    if (h[k] >= 4 || h[k] < -6) continue;
    let deniz = false, kara = false, top = 0, agirlik = 0;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const v = h[k + dj * b.en + di];
      if (v > 0) kara = true; else deniz = true;
      const w = (R + 1 - Math.abs(di)) * (R + 1 - Math.abs(dj));
      top += v * w; agirlik += w;
    }
    if (deniz && kara) ciz[k] = top / agirlik;
  }
}

/** Boylam, enlem → sahne x, z */
export const sahneye = (b: ZeminBasligi, p: ArrayLike<number>): Nokta =>
  [(p[0] - b.lng0) * b.mPerLng, -(p[1] - b.lat0) * b.mPerLat];

/** Sahne x, z'deki rakım (ızgaradan iki doğrusal ara değer) */
export function rakim(z: Zemin, x: number, sz: number): number {
  const { b, h } = z;
  const fi = (x - b.x0) / b.hucre, fj = (-sz - b.y0) / b.hucre;
  const i = Math.max(0, Math.min(b.en - 2, Math.floor(fi)));
  const j = Math.max(0, Math.min(b.boy - 2, Math.floor(fj)));
  const u = Math.max(0, Math.min(1, fi - i)), w = Math.max(0, Math.min(1, fj - j));
  const k = j * b.en + i;
  return (h[k] * (1 - u) + h[k + 1] * u) * (1 - w) + (h[k + b.en] * (1 - u) + h[k + b.en + 1] * u) * w;
}

/**
 * Sahne x, z'de ekranda çizilen zeminin yüksekliği (24 Kasım): zemin katının en ayrıntılı
 * çizimiyle aynı yüzey. Kıyısı yumuşatılmış rakım (`z.ciz`), her kare yükseklikleri birbirine
 * yakın iki köşeden iki üçgene bölünür (`zeminKatmani.ts` → `geometri`). Hafif modun kaba
 * karelerinde kıyı şeridi biraz farklı çizilir (çevre ortalaması); oradaki fark küçük.
 */
export function cizilenRakim(z: Zemin, x: number, sz: number): number {
  const { b } = z;
  const h = z.ciz;
  const fi = (x - b.x0) / b.hucre, fj = (-sz - b.y0) / b.hucre;
  const i = Math.max(0, Math.min(b.en - 2, Math.floor(fi)));
  const j = Math.max(0, Math.min(b.boy - 2, Math.floor(fj)));
  const u = Math.max(0, Math.min(1, fi - i)), w = Math.max(0, Math.min(1, fj - j));
  const k = j * b.en + i;
  const a = h[k], bb = h[k + 1], c = h[k + b.en], d = h[k + b.en + 1];
  if (Math.abs(a - d) < Math.abs(bb - c)) return u >= w ? a + u * (bb - a) + w * (d - bb) : a + w * (c - a) + u * (d - c);
  return u + w <= 1 ? a + u * (bb - a) + w * (c - a) : d + (1 - u) * (c - d) + (1 - w) * (bb - d);
}

/** Taban kotu: yokuş yukarı tarafta yapı en çok bu kadar (m) toprağa gömülür (DENEME) */
export const GOMME_SINIRI = 0.6;
/** Tabanın altındaki zemin kottan bu kadar (m) aşağıdaysa taş kaide çizilir */
export const KAIDE_ESIGI = 0.15;
/** Modeli tabanından geniş çizilen yapılar (sıra ev; `yapiKatmani.ts` ile aynı) */
const TABANA_UYAR = new Set(['ev', 'dukkanli', 'ciftlik', 'yazlik', 'depo']);

/**
 * Yapının tabanı (24 Kasım, Kemal: "bazı binalar havada asılı, bazıları yarı gömülü"):
 * tabanın içinde ~2 m aralıklı noktalarda (kenarlar dahil) çizilen zemin ölçülür.
 * - Kot: zeminin ortalaması; yokuş yukarı tarafta yapı en çok `GOMME_SINIRI` gömülür
 *   (eskiden en alçak noktaya oturuyordu: yamaçta yarısı toprağa giriyordu).
 * - `zeminAlt`: tabanın altındaki en alçak zemin; kot ondan yukarıdaysa yapının altında
 *   o kota kadar taş kaide çizilir (yapı havada kalmaz).
 * - Kendi zemini olan modeller (`YAMAC_MODELLERI`: yamaca göre yapılan Blender modelleri, The
 *   Imperial) eski kuralla: tabanın en alçak noktası, kaidesiz (zemini, temeli o kota göre yapıldı).
 * Denetimi: `gen/kompakt_rakim_denetim.py` (aynı kural).
 */
export function tabanKotu(z: Zemin, y: Pick<Yapi, 'merkez' | 'ex' | 'en' | 'boy' | 'modelEn' | 'tur' | 'dosya' | 'taban' | 'modelYeri'>): { kot: number; zeminAlt: number } {
  // Kendi kayalığıyla gelen model (The Imperial): kotu veride, zemin ona göre üretildi
  if (y.modelYeri) return { kot: y.modelYeri.kot, zeminAlt: y.modelYeri.kot };
  if (y.dosya && YAMAC_MODELLERI.has(y.dosya)) {
    const kot = Math.min(rakim(z, y.merkez[0], y.merkez[1]), ...y.taban.map(([x, sz]) => rakim(z, x, sz)));
    return { kot, zeminAlt: kot };
  }
  const en = TABANA_UYAR.has(y.tur) && y.modelEn ? y.modelEn : y.en, boy = y.boy;
  const nx = Math.max(2, Math.ceil(en / 2) + 1), nz = Math.max(2, Math.ceil(boy / 2) + 1);
  let enAz = Infinity, enCok = -Infinity, top = 0;
  for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
    const s = (a / (nx - 1) - 0.5) * en, t = (c / (nz - 1) - 0.5) * boy;
    const v = cizilenRakim(z, y.merkez[0] + s * y.ex[0] - t * y.ex[1], y.merkez[1] + s * y.ex[1] + t * y.ex[0]);
    enAz = Math.min(enAz, v); enCok = Math.max(enCok, v); top += v;
  }
  const kot = Math.max(top / (nx * nz), enCok - GOMME_SINIRI);
  return { kot, zeminAlt: enAz };
}

/**
 * Kumsal: `duzada-sinirlar.geojson`'daki kum kıyılarının yakınındaki alçak kara
 * hücreleri. Değer 0–255 kumun ağırlığı (6b, 22 Kasım: kumsal kenarı tırtıklı
 * olmasın diye yumuşak geçiş): kıyıya 22 m'ye kadar tam, 45 m'de biter; 4 m'den
 * yukarıda azalır, 7,5 m'de biter. Yalnız boyamak için; veriye yazılmaz.
 */
export function kumIsaretle(z: Zemin, sinirlar: Koleksiyon) {
  const { b, h, kum } = z;
  const r = Math.ceil(45 / b.hucre);
  const yumusak = (x: number, a: number, c: number) => { const t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
  for (const f of sinirlar.features) {
    if (f.properties.katman !== 'kiyi' || f.properties.tur !== 'kum' || f.geometry.type !== 'LineString') continue;
    const c = f.geometry.coordinates as number[][];
    for (let n = 1; n < c.length; n++) {
      const [ax, az] = sahneye(b, c[n - 1]), [bx, bz] = sahneye(b, c[n]);
      const adim = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (b.hucre / 2)));
      for (let s = 0; s <= adim; s++) {
        const x = ax + ((bx - ax) * s) / adim, sz = az + ((bz - az) * s) / adim;
        const fi = (x - b.x0) / b.hucre, fj = (-sz - b.y0) / b.hucre;
        const ci = Math.round(fi), cj = Math.round(fj);
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= b.en || j >= b.boy) continue;
          const k = j * b.en + i;
          if (h[k] <= -1.5) continue;
          const d = Math.hypot(i - fi, j - fj) * b.hucre;
          if (d > 45) continue;
          const w = Math.round(255 * (1 - yumusak(d, 22, 45)) * (1 - yumusak(h[k], 4, 7.5)));
          if (w > kum[k]) kum[k] = w;
        }
      }
    }
  }
}

/** Yapı (duzada-yapilar.geojson) — yalnız haritanın kullandığı alanlar */
export interface Yapi {
  id: string;
  tur: string;
  dosya: string | null;
  vikiId: string | null;
  ad: string | null;
  mahalle: string;
  merkez: Nokta; // sahne x, z
  ex: Nokta;     // modelin +X'i (x doğu, z güney)
  en: number; boy: number;
  modelEn?: number;
  yukseklik: number;
  /** Tabanın kotu (`tabanKotu`): model buraya oturur */
  kot: number;
  /** Tabanın altındaki en alçak çizilen zemin: kottan aşağıdaysa arada taş kaide çizilir */
  zeminAlt?: number;
  taban: Nokta[]; // sahne x, z
  /** Evin arsasının köşeleri (sahne x, z; yapı dosyasındaki `arsa`): bahçe ve duvar bununla çizilir */
  arsa?: Nokta[];
  /** Hazır gruptan gelen yapı (grubun kimliği): bahçesini grup getirir */
  grup?: string;
  /** Evinde oturan var (yapı dosyasında `bag: "oturan"`): dokununca kartı açılır, kart oturanları gösterir */
  oturanli?: boolean;
  /**
   * Kendi kayalığıyla gelen model (The Imperial, 25 Kasım): modelin başlangıç noktası (sahne x, z) ve kotu
   * veriden (`modelBaslangic`, `modelKot`). Model ölçeksiz oraya oturur; taban yalnız seçim ve ad için.
   */
  modelYeri?: { nokta: Nokta; kot: number };
}

export function yapilariOku(z: Zemin, k: Koleksiyon): Yapi[] {
  const cikti: Yapi[] = [];
  for (const f of k.features) {
    const p = f.properties;
    if (p.katman !== 'yapi' || f.geometry.type !== 'Polygon') continue;
    const halka = (f.geometry.coordinates as number[][][])[0].map(c => sahneye(z.b, c));
    const merkez = sahneye(z.b, p.merkez as number[]);
    const olcu = p.modelOlcusu as number[] | undefined;
    const modelYeri = Array.isArray(p.modelBaslangic) && typeof p.modelKot === 'number'
      ? { nokta: sahneye(z.b, p.modelBaslangic as number[]), kot: p.modelKot } : undefined;
    const temel = {
      tur: String(p.tur), dosya: (p.dosya as string | null) || MODEL_ESLEME[String(p.id)] || null,
      merkez, ex: p.ex as Nokta, en: Number(p.en) || 6, boy: Number(p.boy) || 6,
      modelEn: typeof p.modelEn === 'number' ? p.modelEn : undefined, taban: halka,
      ...(modelYeri ? { modelYeri } : {})
    };
    // Taban çizilen zemine oturur (24 Kasım): ortalamaya, yokuşta az gömülü, altında taş kaide
    const { kot, zeminAlt } = tabanKotu(z, temel);
    cikti.push({
      id: String(p.id), ...temel,
      vikiId: (p.vikiId as string | null) || null, ad: (p.ad as string | null) || null,
      mahalle: String(p.mahalle ?? ''),
      yukseklik: olcu?.[2] ?? (p.tur === 'kutu' ? 6 : 7),
      kot, zeminAlt,
      ...(Array.isArray(p.arsa) ? { arsa: (p.arsa as number[][]).map(c => sahneye(z.b, c)) } : {}),
      ...(p.bag === 'oturan' ? { oturanli: true } : {}),
      ...(p.grup ? { grup: typeof p.grup === 'string' ? p.grup : String((p.grup as { kimlik?: unknown }).kimlik ?? 'grup') } : {})
    });
  }
  return cikti;
}
