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

export type Nokta = [number, number];

export interface ZeminBasligi {
  en: number; boy: number; hucre: number; x0: number; y0: number;
  lat0: number; lng0: number; mPerLat: number; mPerLng: number; birim: number;
}

export interface Zemin {
  b: ZeminBasligi;
  /** Rakım (metre), satırlar güneyden kuzeye: h[j * en + i] */
  h: Float32Array;
  /** Hücre kumsal mı (kum kıyısına yakın, alçak kara) */
  kum: Uint8Array;
}

type Ozellikler = Record<string, unknown>;
export interface Oge<G = unknown> { type: 'Feature'; properties: Ozellikler; geometry: { type: string; coordinates: G } }
export interface Koleksiyon { type: 'FeatureCollection'; features: Oge[] }

export const haritaAdresi = (dosya: string) => `${import.meta.env.BASE_URL || '/'}harita/${dosya}`;

/** İndirilen bayt (ölçüm için; sıkıştırılmış hâliyle) */
export const indirme = { bayt: 0, dosyalar: {} as Record<string, number> };

async function indir(dosya: string, sinyal?: AbortSignal): Promise<ArrayBuffer> {
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
  return { b, h, kum: new Uint8Array(adet) };
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
 * Kumsal: `duzada-sinirlar.geojson`'daki kum kıyılarının 35 m yakınındaki alçak
 * (6 m'den alçak) kara hücreleri. Yalnız boyamak için; veriye yazılmaz.
 */
export function kumIsaretle(z: Zemin, sinirlar: Koleksiyon) {
  const { b, h, kum } = z;
  const r = Math.ceil(35 / b.hucre);
  for (const f of sinirlar.features) {
    if (f.properties.katman !== 'kiyi' || f.properties.tur !== 'kum' || f.geometry.type !== 'LineString') continue;
    const c = f.geometry.coordinates as number[][];
    for (let n = 1; n < c.length; n++) {
      const [ax, az] = sahneye(b, c[n - 1]), [bx, bz] = sahneye(b, c[n]);
      const adim = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / b.hucre));
      for (let s = 0; s <= adim; s++) {
        const x = ax + ((bx - ax) * s) / adim, sz = az + ((bz - az) * s) / adim;
        const ci = Math.round((x - b.x0) / b.hucre), cj = Math.round((-sz - b.y0) / b.hucre);
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (di * di + dj * dj > r * r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= b.en || j >= b.boy) continue;
          const k = j * b.en + i;
          if (h[k] > -1.5 && h[k] < 6) kum[k] = 1;
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
  kot: number;
  taban: Nokta[]; // sahne x, z
}

export function yapilariOku(z: Zemin, k: Koleksiyon): Yapi[] {
  const cikti: Yapi[] = [];
  for (const f of k.features) {
    const p = f.properties;
    if (p.katman !== 'yapi' || f.geometry.type !== 'Polygon') continue;
    const halka = (f.geometry.coordinates as number[][][])[0].map(c => sahneye(z.b, c));
    const merkez = sahneye(z.b, p.merkez as number[]);
    // Taban en alçak köşesine oturur (yamaçta havada kalmasın); modelin altı zemine gömülür
    const kot = Math.min(rakim(z, merkez[0], merkez[1]), ...halka.map(([x, sz]) => rakim(z, x, sz)));
    const olcu = p.modelOlcusu as number[] | undefined;
    cikti.push({
      id: String(p.id), tur: String(p.tur), dosya: (p.dosya as string | null) ?? null,
      vikiId: (p.vikiId as string | null) || null, ad: (p.ad as string | null) || null,
      mahalle: String(p.mahalle ?? ''), merkez, ex: p.ex as Nokta,
      en: Number(p.en) || 6, boy: Number(p.boy) || 6,
      modelEn: typeof p.modelEn === 'number' ? p.modelEn : undefined,
      yukseklik: olcu?.[2] ?? (p.tur === 'kutu' ? 6 : 7),
      kot, taban: halka
    });
  }
  return cikti;
}
