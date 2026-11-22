import type { Nokta, Zemin } from '../tekVeri';

/**
 * Tek harita 8. adım (Kemal, 20 ve 22 Kasım): Düzenle → Zemin. Fırça zemini yükseltir, alçaltır,
 * düzler (tıklanan noktanın kotuna), yumuşatır ya da kıyı çizgisini çeker (kara aç / deniz aç).
 * Fırçanın kenarı yumuşak; boyutu ve gücü kaydırıcıyla.
 *
 * Kıyı korumalı (açıkken): fırça kıyı çizgisini ve kumsalı değiştirmez. Deniz hücresine, kumsala
 * ve kıyıya 20 m'den yakın karaya dokunmaz; 20–50 m arasında etkisi yumuşakça azalır; kara
 * hücresi denizin altına inmez. Kıyıyı yalnız "Kıyıyı çek" aracı değiştirir.
 *
 * Taslakta (TekTaslak.zemin) yalnız değişen hücreler durur: ızgara 64 × 64 hücrelik parçalara
 * bölünür, değişen her parça 4096 sayılık int16 dizisi (rakım × 10; değişmeyen hücre −32768)
 * olarak sıkıştırılır (deflate-raw) ve base64 yazı olur. Değerler mutlak: taslak ikinci kez
 * uygulanınca aynı sonuç. Fırça vuruşlarının listesi yerine bu seçildi: ekranda ne görüldüyse
 * ajansa o gider, ajans fırçayı yeniden hesaplamaz (ölçüm PR açıklamasında).
 *
 * Bu dosya saf iştir (sıkıştırma dışında): ağ yok, kayıt yok.
 */

export type ZeminAraci = 'yukselt' | 'alcalt' | 'duzle' | 'yumusat' | 'kiyi';
export type KiyiYonu = 'kara' | 'deniz';

export const ZEMIN_ARACLARI: Array<{ id: ZeminAraci; ad: string; tarif: string }> = [
  { id: 'yukselt', ad: 'Yükselt', tarif: 'Sürükledikçe zemin yükselir.' },
  { id: 'alcalt', ad: 'Alçalt', tarif: 'Sürükledikçe zemin alçalır.' },
  { id: 'duzle', ad: 'Düzle', tarif: 'İlk dokunduğun noktanın kotuna düzler.' },
  { id: 'yumusat', ad: 'Yumuşat', tarif: 'Dik yeri ve basamağı yumuşatır.' },
  { id: 'kiyi', ad: 'Kıyıyı çek', tarif: 'Kıyı çizgisini dışa (kara aç) ya da içe (deniz aç) taşır.' }
];

export interface ZeminTaslagi {
  /** Parçanın kenarı (hücre) */
  parca: number;
  /** "i_j" (parçanın sütunu, satırı) → sıkıştırılmış değerler (base64) */
  p: Record<string, string>;
  /** Kıyının değişebildiği parçalar ("Kıyıyı çek" ya da kıyı koruması kapalı fırça) */
  kiyi: string[];
  /** Değişen hücre sayısı */
  hucre: number;
  /** Fırça vuruşu sayısı (her sürükleme bir) */
  vurus: number;
}

export const PARCA = 64;
export const DEGISMEDI = -32768;
/** Ölçüler DENEME */
export const FIRCA = { enAz: 10, enCok: 250, ilk: 60 };
export const KORUMA = { tam: 20, son: 50, enAlcakKara: 0.6 };
const KARA_KOTU = 1.2;
const DENIZ_KOTU = -2.5;

export interface Vurus { arac: ZeminAraci; yaricap: number; guc: number; korumali: boolean; yon: KiyiYonu; hedef: number }

export const parcaAnahtari = (ti: number, tj: number) => `${ti}_${tj}`;

const yumusak = (a: number, c: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); };

/** Sahne x, z → en yakın hücre */
export function hucresi(z: Zemin, x: number, sz: number): [number, number] {
  return [Math.round((x - z.b.x0) / z.b.hucre), Math.round((-sz - z.b.y0) / z.b.hucre)];
}

export interface Kutu { i0: number; j0: number; i1: number; j1: number }
export const kutuBirlestir = (a: Kutu | null, b: Kutu | null): Kutu | null =>
  !a ? b : !b ? a : { i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1) };

/**
 * Bir sürükleme. `z.h` (ekrandaki zemin) yerinde değişir; `bas` vuruş başındaki hâl (koruma
 * ve yumuşatma ona bakar). Bitince değişen hücreler 0,1 m'ye yuvarlanır.
 */
export class FircaVurusu {
  private bas: Float32Array;
  private kiyiUzak = new Map<number, number>();
  private son: Nokta | null = null;
  dokunulan: Kutu | null = null;
  /** Korumanın durdurduğu hücre oldu mu (uyarı için) */
  korunanVar = false;
  /** Kıyı çizgisi (kara ↔ deniz) değişen hücre */
  kiyiDegisti = 0;

  constructor(private z: Zemin, private v: Vurus) {
    this.bas = z.h.slice();
  }

  /** Kara hücresinin denize uzaklığı (m; 50 m'den uzaksa Infinity) */
  private denizeUzaklik(k: number): number {
    const v = this.kiyiUzak.get(k);
    if (v !== undefined) return v;
    const { b } = this.z;
    const i = k % b.en, j = (k - i) / b.en;
    const R = Math.ceil(KORUMA.son / b.hucre);
    let en = Infinity;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= b.en || c >= b.boy) continue;
      if (this.bas[c * b.en + a] <= 0) { const d = Math.hypot(di, dj) * b.hucre; if (d < en) en = d; }
    }
    const s = en <= KORUMA.son ? en : Infinity;
    this.kiyiUzak.set(k, s);
    return s;
  }

  /** Kıyı korumasının ağırlığı: 0 dokunmaz, 1 tam */
  koruma(k: number): number {
    if (!this.v.korumali || this.v.arac === 'kiyi') return 1;
    if (this.bas[k] <= 0 || this.z.kum[k] > 0) return 0;
    return yumusak(KORUMA.tam, KORUMA.son, this.denizeUzaklik(k));
  }

  /** Fırçanın tek dokunuşu (merkez sahne x, z) */
  private damla(cx: number, cz: number): Kutu | null {
    const { b, h } = this.z;
    const r = this.v.yaricap, s = Math.max(0.05, Math.min(1, this.v.guc));
    const [ci, cj] = hucresi(this.z, cx, cz);
    const R = Math.ceil(r / b.hucre);
    const i0 = Math.max(1, ci - R), i1 = Math.min(b.en - 2, ci + R), j0 = Math.max(1, cj - R), j1 = Math.min(b.boy - 2, cj + R);
    if (i0 > i1 || j0 > j1) return null;
    // Yumuşatma için çevrenin ortalaması (dokunuştan önceki hâlden)
    let ort: Float32Array | null = null;
    const gen = i1 - i0 + 1;
    if (this.v.arac === 'yumusat') {
      ort = new Float32Array(gen * (j1 - j0 + 1));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        let t = 0, n = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const a = i + di, c = j + dj;
          if (a < 0 || c < 0 || a >= b.en || c >= b.boy) continue;
          t += h[c * b.en + a]; n++;
        }
        ort[(j - j0) * gen + (i - i0)] = t / n;
      }
    }
    let degisti = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = b.x0 + i * b.hucre, sz = -(b.y0 + j * b.hucre);
      const d = Math.hypot(x - cx, sz - cz);
      if (d >= r) continue;
      const q = 1 - (d / r) ** 2;
      const f = q * q;
      const k = j * b.en + i;
      const eski = h[k];
      let dh = 0;
      switch (this.v.arac) {
        case 'yukselt': dh = 2 * s * f; break;
        case 'alcalt': dh = -2 * s * f; break;
        case 'duzle': dh = (this.v.hedef - eski) * Math.min(1, 0.5 * s * f + 0.02 * f); break;
        case 'yumusat': dh = (ort![(j - j0) * gen + (i - i0)] - eski) * 0.8 * s * f; break;
        case 'kiyi':
          if (this.v.yon === 'kara' && eski < KARA_KOTU) dh = (KARA_KOTU - eski) * 0.6 * s * f;
          else if (this.v.yon === 'deniz' && eski > DENIZ_KOTU) dh = (DENIZ_KOTU - eski) * 0.6 * s * f;
          break;
      }
      if (Math.abs(dh) < 1e-4) continue;
      const m = this.koruma(k);
      if (m < 1) this.korunanVar = true;
      if (m <= 0) continue;
      let yeni = eski + dh * m;
      // Korumalıyken kara kara kalır
      if (this.v.korumali && this.v.arac !== 'kiyi' && this.bas[k] > 0) yeni = Math.max(KORUMA.enAlcakKara, yeni);
      if (yeni === eski) continue;
      h[k] = yeni;
      degisti = true;
    }
    return degisti ? { i0, j0, i1, j1 } : null;
  }

  /** Sürükleme: son noktadan buna fırça aralıklarla dokunur; değişen kutu döner */
  dokun(p: Nokta): Kutu | null {
    const ara = Math.max(4, this.v.yaricap / 4);
    let kutu: Kutu | null = null;
    if (!this.son) kutu = this.damla(p[0], p[1]);
    else {
      const L = Math.hypot(p[0] - this.son[0], p[1] - this.son[1]);
      if (L < ara) return null;
      const n = Math.ceil(L / ara);
      for (let s = 1; s <= n; s++) kutu = kutuBirlestir(kutu, this.damla(this.son[0] + ((p[0] - this.son[0]) * s) / n, this.son[1] + ((p[1] - this.son[1]) * s) / n));
    }
    this.son = p;
    this.dokunulan = kutuBirlestir(this.dokunulan, kutu);
    return kutu;
  }

  /** Bitiş: değişen hücreler 0,1 m'ye yuvarlanır; kıyı değişimi sayılır */
  bitir(): Kutu | null {
    const k0 = this.dokunulan;
    if (!k0) return null;
    const { b, h } = this.z;
    let kiyi = 0;
    for (let j = k0.j0; j <= k0.j1; j++) for (let i = k0.i0; i <= k0.i1; i++) {
      const k = j * b.en + i;
      if (h[k] === this.bas[k]) continue;
      h[k] = Math.round(h[k] * 10) / 10;
      if ((h[k] > 0) !== (this.bas[k] > 0)) kiyi++;
    }
    this.kiyiDegisti = kiyi;
    return k0;
  }
}

/**
 * Fırçanın önizlemesi: kıyı korumalıyken fırçanın altında korunan hücre var mı (uyarı için).
 * Vuruş başlamadan (fare üstündeyken) bakılır.
 */
export function korunanVarMi(z: Zemin, p: Nokta, r: number): boolean {
  const { b, h, kum } = z;
  const [ci, cj] = hucresi(z, p[0], p[1]);
  const R = Math.ceil((r + KORUMA.tam) / b.hucre);
  for (let dj = -R; dj <= R; dj += 1) for (let di = -R; di <= R; di += 1) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= b.en || j >= b.boy) continue;
    const d = Math.hypot(di, dj) * b.hucre;
    const k = j * b.en + i;
    if (d < r && (h[k] <= 0 || kum[k] > 0)) return true;
    if (d < r + KORUMA.tam && h[k] <= 0) return true;
  }
  return false;
}

// ---- taslağa yazma ----------------------------------------------------------------

function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64Coz(s: string): Uint8Array {
  const ikili = atob(s);
  const b = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) b[i] = ikili.charCodeAt(i);
  return b;
}

/** int16 dizisini sıkıştırır (deflate-raw; Python zlib wbits −15 açar) */
export async function parcaKodla(a: Int16Array): Promise<string> {
  const akis = new Blob([a.slice().buffer]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return base64(new Uint8Array(await new Response(akis).arrayBuffer()));
}
export async function parcaCoz(s: string, adet = PARCA * PARCA): Promise<Int16Array> {
  const akis = new Blob([base64Coz(s).slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const a = new Int16Array(await new Response(akis).arrayBuffer());
  if (a.length !== adet) throw new Error('zemin parçası bozuk');
  return a;
}

export const bosZemin = (): ZeminTaslagi => ({ parca: PARCA, p: {}, kiyi: [], hucre: 0, vurus: 0 });

/** Taslağın parçaları açık hâlde (bellekte); ekran ile taslak arası */
export type AcikParcalar = Map<string, Int16Array>;

export async function parcalariAc(zt: ZeminTaslagi | undefined): Promise<AcikParcalar> {
  const m: AcikParcalar = new Map();
  if (!zt) return m;
  for (const [a, s] of Object.entries(zt.p)) {
    try { m.set(a, await parcaCoz(s)); } catch { /* bozuk parça atlanır */ }
  }
  return m;
}

/**
 * Ekrandaki zemini (z.h) taslağa göre kurar: taslaktaki hücre taslağın değeri, öbürü dosyanın
 * (h0). Yalnız iki parça kümesinin (eski ve yeni) hücrelerine bakılır. Değişen kutu döner.
 */
export function zemineUygula(z: Zemin, h0: Float32Array, eski: AcikParcalar, yeni: AcikParcalar): Kutu | null {
  const { b, h } = z;
  let kutu: Kutu | null = null;
  const anahtarlar = new Set([...eski.keys(), ...yeni.keys()]);
  for (const a of anahtarlar) {
    const [ti, tj] = a.split('_').map(Number);
    const dizi = yeni.get(a);
    for (let y = 0; y < PARCA; y++) for (let x = 0; x < PARCA; x++) {
      const i = ti * PARCA + x, j = tj * PARCA + y;
      if (i >= b.en || j >= b.boy) continue;
      const k = j * b.en + i;
      const v = dizi?.[y * PARCA + x];
      const hedef = v !== undefined && v !== DEGISMEDI ? v / 10 : h0[k];
      if (h[k] !== hedef) {
        h[k] = hedef;
        kutu = kutuBirlestir(kutu, { i0: i, j0: j, i1: i, j1: j });
      }
    }
  }
  return kutu;
}

/**
 * Vuruştan sonra taslağın zemini: kutudaki hücreler ekrandakiyle (z.h) yeniden yazılır; dosyanın
 * değerine dönen hücre "değişmedi" olur. Boşalan parça çıkar. Değişen parçalar sıkıştırılır.
 */
export async function taslagaYaz(z: Zemin, h0: Float32Array, acik: AcikParcalar, onceki: ZeminTaslagi | undefined, kutu: Kutu, kiyiParcasi: boolean): Promise<{ zemin: ZeminTaslagi; acik: AcikParcalar }> {
  const { b, h } = z;
  const yeniAcik: AcikParcalar = new Map(acik);
  const zt = onceki ?? bosZemin();
  const p = { ...zt.p };
  const kiyi = new Set(zt.kiyi);
  const ti0 = Math.floor(kutu.i0 / PARCA), ti1 = Math.floor(kutu.i1 / PARCA), tj0 = Math.floor(kutu.j0 / PARCA), tj1 = Math.floor(kutu.j1 / PARCA);
  for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) {
    const a = parcaAnahtari(ti, tj);
    const dizi = (acik.get(a) ?? new Int16Array(PARCA * PARCA).fill(DEGISMEDI)).slice();
    let dolu = 0;
    for (let y = 0; y < PARCA; y++) for (let x = 0; x < PARCA; x++) {
      const i = ti * PARCA + x, j = tj * PARCA + y;
      if (i >= b.en || j >= b.boy) { dizi[y * PARCA + x] = DEGISMEDI; continue; }
      const k = j * b.en + i;
      if (i >= kutu.i0 && i <= kutu.i1 && j >= kutu.j0 && j <= kutu.j1) {
        const v = Math.round(h[k] * 10), v0 = Math.round(h0[k] * 10);
        dizi[y * PARCA + x] = v === v0 ? DEGISMEDI : v;
      }
      if (dizi[y * PARCA + x] !== DEGISMEDI) dolu++;
    }
    if (dolu) {
      yeniAcik.set(a, dizi);
      p[a] = await parcaKodla(dizi);
      if (kiyiParcasi) kiyi.add(a);
    } else {
      yeniAcik.delete(a);
      delete p[a];
      kiyi.delete(a);
    }
  }
  let hucre = 0;
  for (const d of yeniAcik.values()) for (let n = 0; n < d.length; n++) if (d[n] !== DEGISMEDI) hucre++;
  return { zemin: { parca: PARCA, p, kiyi: [...kiyi].filter(a => a in p).sort(), hucre, vurus: zt.vurus + 1 }, acik: yeniAcik };
}

/** Taslaktaki zemini denetleyerek okur (taslak.ts → taslakCoz) */
export function zeminCoz(v: unknown): ZeminTaslagi | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>;
  if (d.parca !== PARCA || !d.p || typeof d.p !== 'object') return undefined;
  const p: Record<string, string> = {};
  for (const [a, s] of Object.entries(d.p as Record<string, unknown>)) if (/^\d+_\d+$/.test(a) && typeof s === 'string') p[a] = s;
  if (!Object.keys(p).length) return undefined;
  const kiyi = Array.isArray(d.kiyi) ? d.kiyi.filter((a): a is string => typeof a === 'string' && a in p) : [];
  return { parca: PARCA, p, kiyi, hucre: Number(d.hucre) || 0, vurus: Number(d.vurus) || 0 };
}

/** Değişen hücrelerin işareti (yollar ve yapılar yeniden otursun diye; 1 = değişti) */
export function degisenHucreler(z: Zemin, acik: AcikParcalar): Uint8Array | null {
  if (!acik.size) return null;
  const { b } = z;
  const m = new Uint8Array(b.en * b.boy);
  for (const [a, d] of acik) {
    const [ti, tj] = a.split('_').map(Number);
    for (let y = 0; y < PARCA; y++) for (let x = 0; x < PARCA; x++) {
      if (d[y * PARCA + x] === DEGISMEDI) continue;
      const i = ti * PARCA + x, j = tj * PARCA + y;
      if (i < b.en && j < b.boy) m[j * b.en + i] = 1;
    }
  }
  return m;
}

/** Sahne noktasının çevresinde (yarıçap hücre) değişen hücre var mı */
export function degisenYakin(z: Zemin, m: Uint8Array, x: number, sz: number, r = 1): boolean {
  const [ci, cj] = hucresi(z, x, sz);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj;
    if (i >= 0 && j >= 0 && i < z.b.en && j < z.b.boy && m[j * z.b.en + i]) return true;
  }
  return false;
}
