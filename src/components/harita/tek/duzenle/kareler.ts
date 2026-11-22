import { haritaAdresi, type Nokta, type ZeminBasligi } from '../tekVeri';
import { hucreAnahtari, icinde } from './geometri';

/**
 * Kare ızgarası (`public/harita/duzada-kareler.json`, gen/kompakt_parseller.py): her yol
 * kesiminin iki yanında 8 m'lik kare şeritleri. Kare boşsa (arsası yok) boyanabilir,
 * hazır grup (yer: serit) konabilir. Yalnız okuma.
 */

export interface Kare {
  id: string;
  /** Şeridin kimliği: "yol|taraf|kesim" */
  serit: string;
  /** Sütun no (j) ve sıra (r = 0 yola bitişik) */
  j: number; r: number;
  bos: boolean;
  /** Arsası (boş değilse) */
  arsa: string | null;
  koseler: Nokta[];
  merkez: Nokta;
}

export interface Serit {
  id: string; yol: string; taraf: string; kesim: number;
  /** Sahne: 0. sütun 0. sıranın ön köşesi, yol boyunca ve içeri bir kare adımı */
  o: Nokta; u: Nokta; n: Nokta;
  /** j → sütundaki kareler (r sırasıyla) */
  sutunlar: Map<number, Kare[]>;
}

export interface KareVerisi {
  kareM: number;
  kareler: Kare[];
  seritler: Map<string, Serit>;
  /** id → kare */
  kimlik: Map<string, Kare>;
  /** arsa → kareleri */
  arsalar: Map<string, Kare[]>;
  /** 16 m'lik hücre → kare sıraları (yakın arama) */
  hucre: Map<number, number[]>;
}

const HUCRE = 16;
const sayiYazisi = (v: number) => (Number.isInteger(v) ? String(v) : String(v));

type Ham = { kareM: number; arsalar: string[]; seritler: Array<{ yol: string; taraf: string; kesim: number; o: number[]; u: number[]; n: number[]; s: number[][] }> };

export function kareleriKur(b: ZeminBasligi, ham: Ham): KareVerisi {
  const kareler: Kare[] = [];
  const seritler = new Map<string, Serit>();
  const kimlik = new Map<string, Kare>();
  const arsalar = new Map<string, Kare[]>();
  const hucre = new Map<number, number[]>();
  const sahne = (lng: number, lat: number): Nokta => [(lng - b.lng0) * b.mPerLng, -(lat - b.lat0) * b.mPerLat];
  const fark = (d: number[]): Nokta => [d[0] * b.mPerLng, -d[1] * b.mPerLat];
  for (const s of ham.seritler) {
    const o = sahne(s.o[0], s.o[1]), u = fark(s.u), n = fark(s.n);
    const id = `${s.yol}|${s.taraf}|${s.kesim}`;
    const serit: Serit = { id, yol: s.yol, taraf: s.taraf, kesim: s.kesim, o, u, n, sutunlar: new Map() };
    seritler.set(id, serit);
    for (const [j, metre, adet, arsaSira, derinlik] of s.s) {
      const arsa = arsaSira >= 0 ? ham.arsalar[arsaSira] ?? null : null;
      const sutun: Kare[] = [];
      for (let r = 0; r < adet; r++) {
        const k = (a: number, c: number): Nokta => [o[0] + a * u[0] + c * n[0], o[1] + a * u[1] + c * n[1]];
        const koseler = [k(j, r), k(j + 1, r), k(j + 1, r + 1), k(j, r + 1)];
        const merkez: Nokta = [(koseler[0][0] + koseler[2][0]) / 2, (koseler[0][1] + koseler[2][1]) / 2];
        const bos = !arsa || r >= derinlik;
        const kare: Kare = { id: `k_${s.yol}_${s.taraf}_${sayiYazisi(metre)}_${r}`, serit: id, j, r, bos, arsa: bos ? null : arsa, koseler, merkez };
        const sira = kareler.length;
        kareler.push(kare);
        kimlik.set(kare.id, kare);
        sutun.push(kare);
        if (kare.arsa) { const l = arsalar.get(kare.arsa) ?? []; l.push(kare); arsalar.set(kare.arsa, l); }
        const a = hucreAnahtari(Math.floor(merkez[0] / HUCRE), Math.floor(merkez[1] / HUCRE));
        const l = hucre.get(a) ?? []; l.push(sira); hucre.set(a, l);
      }
      serit.sutunlar.set(j, sutun);
    }
  }
  return { kareM: ham.kareM || 8, kareler, seritler, kimlik, arsalar, hucre };
}

export async function kareleriOku(b: ZeminBasligi, sinyal?: AbortSignal): Promise<KareVerisi> {
  const y = await fetch(haritaAdresi('duzada-kareler.json'), { signal: sinyal });
  if (!y.ok) throw new Error(`duzada-kareler.json: ${y.status}`);
  return kareleriKur(b, (await y.json()) as Ham);
}

/** Noktanın üstündeki kare (yoksa null) */
export function kareBul(v: KareVerisi, p: Nokta): Kare | null {
  const i = Math.floor(p[0] / HUCRE), j = Math.floor(p[1] / HUCRE);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    for (const s of v.hucre.get(hucreAnahtari(i + di, j + dj)) ?? []) {
      const k = v.kareler[s];
      if (icinde(p, k.koseler)) return k;
    }
  }
  return null;
}

/** Noktaya `r` m'den yakın kareler */
export function yakinKareler(v: KareVerisi, p: Nokta, r: number): Kare[] {
  const c = Math.ceil(r / HUCRE);
  const i = Math.floor(p[0] / HUCRE), j = Math.floor(p[1] / HUCRE);
  const out: Kare[] = [];
  for (let di = -c; di <= c; di++) for (let dj = -c; dj <= c; dj++) {
    for (const s of v.hucre.get(hucreAnahtari(i + di, j + dj)) ?? []) {
      const k = v.kareler[s];
      if (Math.hypot(k.merkez[0] - p[0], k.merkez[1] - p[1]) <= r) out.push(k);
    }
  }
  return out;
}
