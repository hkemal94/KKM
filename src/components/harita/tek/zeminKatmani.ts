import * as THREE from 'three';
import { kiyiBolgesi, type Zemin } from './tekVeri';

/**
 * Tek harita zemini: tek parça 10 m ızgara, 128 hücrelik karelere bölünür.
 * Her kare kameraya uzaklığına göre 10, 20, 40 ya da 80 m aralıkla çizilir
 * (yakın ayrıntılı, uzak kaba). Kareler arasındaki çatlak görünmesin diye
 * kenarlarda aşağı inen etek var. Derin denizdeki kareler çizilmez (alttaki
 * deniz düzlemi yeter).
 *
 * Renk: deniz derinliğe göre, kumsal kum rengi (kenarı yumuşak), kara rakım ve
 * eğime göre (dik yamaç taşlık). Kaba karelerde köşe rengi çevresinin ortalaması
 * (6b: kumsal kenarı tırtıklı görünmesin). Eğim gölgesini ışık yapar.
 */

const KARE = 128;
const DERIN = -25;

/** Renk durakları: rakım (m) → renk */
const KARA_RENK: Array<[number, THREE.Color]> = [
  [0, new THREE.Color('#B9BE86')],
  [60, new THREE.Color('#A7B276')],
  [200, new THREE.Color('#93A066')],
  [400, new THREE.Color('#8E9468')],
  [600, new THREE.Color('#A39C84')],
  [760, new THREE.Color('#B8B09C')]
];
const KUM = new THREE.Color('#E9DBB4');
const TAS = new THREE.Color('#A89C88');
const SIG = new THREE.Color('#9FC9C4');
const DIP = new THREE.Color('#3E7FA6');

function duraktan(duraklar: Array<[number, THREE.Color]>, v: number, c: THREE.Color) {
  if (v <= duraklar[0][0]) return c.copy(duraklar[0][1]);
  for (let n = 1; n < duraklar.length; n++) {
    if (v <= duraklar[n][0]) {
      const t = (v - duraklar[n - 1][0]) / (duraklar[n][0] - duraklar[n - 1][0]);
      return c.copy(duraklar[n - 1][1]).lerp(duraklar[n][1], t);
    }
  }
  return c.copy(duraklar[duraklar.length - 1][1]);
}

type KareKaydi = { ci: number; cj: number; cx: number; cz: number; cy: number; derin: boolean; adim: number; mesh?: THREE.Mesh };

export class ZeminKatmani {
  grup = new THREE.Group();
  private renk: Uint8Array;
  private kareler: KareKaydi[] = [];
  private onbellek = new Map<string, THREE.BufferGeometry>();
  private malzeme: THREE.MeshLambertMaterial;
  /** Çizimde kullanılan rakım: kıyı çizgisi yumuşatılmış (`z.ciz`, `tekVeri.ts` → `kiyiBolgesi`; yapılar da buna oturur) */
  private h: Float32Array;
  ucgen = 0;
  /** Dışarıdan renk karışımı (bölge yeniden boyanınca da uygulanır) */
  private karistir: ((k: number, renk: Uint8Array) => void) | null = null;

  constructor(private z: Zemin) {
    const { b } = z;
    this.h = z.ciz;
    this.malzeme = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Hücre renkleri bir kez (bayt olarak; 1,5 milyon hücre)
    this.renk = new Uint8Array(b.en * b.boy * 3);
    this.renkleriKur(0, 0, b.en - 1, b.boy - 1);
    for (let cj = 0; cj * KARE < b.boy - 1; cj++) for (let ci = 0; ci * KARE < b.en - 1; ci++) {
      const k: KareKaydi = { ci, cj, cx: 0, cz: 0, cy: 0, derin: false, adim: 0 };
      this.kareOlc(k);
      this.kareler.push(k);
    }
  }

  /** Karenin ortası, ortalama yüksekliği ve derin denizde mi */
  private kareOlc(k: KareKaydi) {
    const { b } = this.z;
    const h = this.h;
    const { ci, cj } = k;
    let enYuksek = -Infinity, top = 0, say = 0;
    for (let j = cj * KARE; j <= Math.min(b.boy - 1, (cj + 1) * KARE); j += 4) for (let i = ci * KARE; i <= Math.min(b.en - 1, (ci + 1) * KARE); i += 4) {
      const v = h[j * b.en + i]; enYuksek = Math.max(enYuksek, v); top += Math.max(0, v); say++;
    }
    k.cx = b.x0 + (ci + 0.5) * KARE * b.hucre; k.cz = -(b.y0 + (cj + 0.5) * KARE * b.hucre);
    k.cy = top / Math.max(1, say); k.derin = enYuksek < DERIN;
  }

  /** Kutudaki hücrelerin rengi (rakım, eğim, kıyı, kumsal; sonra dışarıdan karışım) */
  private renkleriKur(i0: number, j0: number, i1: number, j1: number) {
    const { b, kum } = this.z;
    const h = this.h;
    const c = new THREE.Color();
    for (let j = Math.max(0, j0); j <= Math.min(b.boy - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(b.en - 1, i1); i++) {
      const k = j * b.en + i;
      const v = h[k];
      if (v <= 0) {
        c.copy(SIG).lerp(DIP, Math.min(1, -v / 30));
      } else {
        duraktan(KARA_RENK, v, c);
        // Eğim: dik yamaç taşlığa döner
        const a0 = Math.max(0, i - 1), a1 = Math.min(b.en - 1, i + 1), c0 = Math.max(0, j - 1), c1 = Math.min(b.boy - 1, j + 1);
        const gx = (h[j * b.en + a1] - h[j * b.en + a0]) / ((a1 - a0) * b.hucre);
        const gy = (h[c1 * b.en + i] - h[c0 * b.en + i]) / ((c1 - c0) * b.hucre);
        const egim = Math.hypot(gx, gy);
        c.lerp(TAS, THREE.MathUtils.smoothstep(egim, 0.35, 0.8) * 0.75);
        // Kıyıda ince geçiş
        if (v < 2) c.lerp(KUM, (2 - v) / 2 * 0.35);
        // Kumsal: ağırlığıyla (kenarı yumuşak)
        if (kum[k]) c.lerp(KUM, kum[k] / 255);
      }
      this.renk[k * 3] = c.r * 255; this.renk[k * 3 + 1] = c.g * 255; this.renk[k * 3 + 2] = c.b * 255;
      if (this.karistir) this.karistir(k, this.renk);
    }
  }

  /**
   * Zemin aracı (8. adım): `z.h` kutuda değişti. Çizim rakımı, renk ve o bölgenin kareleri
   * yeniden kurulur (bir sonraki `guncelle`de).
   */
  bolgeYenile(i0: number, j0: number, i1: number, j1: number) {
    kiyiBolgesi(this.z, i0 - 2, j0 - 2, i1 + 2, j1 + 2);
    this.renkleriKur(i0 - 3, j0 - 3, i1 + 3, j1 + 3);
    // Kenar normalleri ve kaba karelerin ortalaması 8 hücreye kadar komşuya bakar
    const P = 11;
    const ci0 = Math.floor((i0 - P) / KARE), ci1 = Math.floor((i1 + P) / KARE), cj0 = Math.floor((j0 - P) / KARE), cj1 = Math.floor((j1 + P) / KARE);
    for (const k of this.kareler) {
      if (k.ci < ci0 || k.ci > ci1 || k.cj < cj0 || k.cj > cj1) continue;
      for (const adim of [1, 2, 4, 8]) {
        const a = `${k.ci},${k.cj},${adim}`;
        const g = this.onbellek.get(a);
        if (g) { g.dispose(); this.onbellek.delete(a); }
      }
      k.adim = 0;
      this.kareOlc(k);
      if (k.derin && k.mesh) { this.grup.remove(k.mesh); k.mesh = undefined; }
    }
  }

  /** Bir karenin verilen aralıkla geometrisi (önbellekte) */
  private geometri(k: KareKaydi, adim: number): THREE.BufferGeometry {
    const anahtar = `${k.ci},${k.cj},${adim}`;
    const var_ = this.onbellek.get(anahtar);
    if (var_) return var_;
    const { b } = this.z;
    const h = this.h;
    const i0 = k.ci * KARE, j0 = k.cj * KARE;
    const iSon = Math.min(b.en - 1, i0 + KARE), jSon = Math.min(b.boy - 1, j0 + KARE);
    const is: number[] = [], js: number[] = [];
    for (let i = i0; i < iSon; i += adim) is.push(i);
    is.push(iSon);
    for (let j = j0; j < jSon; j += adim) js.push(j);
    js.push(jSon);
    const nx = is.length, ny = js.length;
    // Izgara + dört kenarın eteği
    const etek = 2 * (nx + ny);
    const say = nx * ny + etek;
    const p = new Float32Array(say * 3), n = new Float32Array(say * 3), r = new Float32Array(say * 3);
    const nor = new THREE.Vector3();
    const yaz = (v: number, i: number, j: number, asagi: number) => {
      const k2 = j * b.en + i;
      p[v * 3] = b.x0 + i * b.hucre; p[v * 3 + 1] = h[k2] - asagi; p[v * 3 + 2] = -(b.y0 + j * b.hucre);
      const a0 = Math.max(0, i - adim), a1 = Math.min(b.en - 1, i + adim), c0 = Math.max(0, j - adim), c1 = Math.min(b.boy - 1, j + adim);
      const gx = (h[j * b.en + a1] - h[j * b.en + a0]) / ((a1 - a0) * b.hucre);
      const gy = (h[c1 * b.en + i] - h[c0 * b.en + i]) / ((c1 - c0) * b.hucre);
      // Yüz yönü: x doğu, z güney (kuzey eğimi gy, z'de ters)
      nor.set(-gx, 1, gy).normalize();
      n[v * 3] = nor.x; n[v * 3 + 1] = nor.y; n[v * 3 + 2] = nor.z;
      if (adim === 1) {
        r[v * 3] = this.renk[k2 * 3] / 255; r[v * 3 + 1] = this.renk[k2 * 3 + 1] / 255; r[v * 3 + 2] = this.renk[k2 * 3 + 2] / 255;
      } else {
        // Kaba karede renk çevresinin ortalaması: kumsal ve kıyı kenarı tırtıklı görünmesin (6b).
        // Kıyıda (çevrede hem deniz hem kara varsa) yükseklik de ortalama
        const y = adim >> 1, s = Math.max(1, adim >> 2);
        let tr = 0, tg = 0, tb = 0, th = 0, say = 0, deniz = false, kara = false;
        for (let dj = -y; dj <= y; dj += s) for (let di = -y; di <= y; di += s) {
          const a = Math.min(b.en - 1, Math.max(0, i + di)), c = Math.min(b.boy - 1, Math.max(0, j + dj));
          const k4 = c * b.en + a, k3 = k4 * 3;
          tr += this.renk[k3]; tg += this.renk[k3 + 1]; tb += this.renk[k3 + 2]; th += h[k4]; say++;
          if (h[k4] <= 0) deniz = true; else kara = true;
        }
        r[v * 3] = tr / say / 255; r[v * 3 + 1] = tg / say / 255; r[v * 3 + 2] = tb / say / 255;
        if (deniz && kara && h[k2] < 4) p[v * 3 + 1] = th / say - asagi;
      }
    };
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) yaz(y * nx + x, is[x], js[y], 0);
    const indeks: number[] = [];
    for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const a = y * nx + x, bb = a + 1, c = a + nx, d = c + 1;
      // z = −kuzey: üstten bakınca saat yönünün tersi. Kare, yükseklikleri birbirine
      // yakın iki köşeden bölünür (6b): kıyı ve kumsal çizgisi testere dişi olmasın
      const ad = Math.abs(p[a * 3 + 1] - p[d * 3 + 1]), bc = Math.abs(p[bb * 3 + 1] - p[c * 3 + 1]);
      if (ad < bc) indeks.push(a, bb, d, a, d, c);
      else indeks.push(a, bb, c, bb, d, c);
    }
    // Etek: kenar noktaları 6 m × aralık aşağı
    const asagi = 6 * adim;
    let v = nx * ny;
    const kenar = (liste: number[], ters: boolean) => {
      const bas = v;
      for (const q of liste) { const i = q % nx, j = Math.floor(q / nx); yaz(v++, is[i], js[j], asagi); }
      for (let s = 0; s < liste.length - 1; s++) {
        const a = liste[s], bb = liste[s + 1], c = bas + s, d = bas + s + 1;
        if (ters) indeks.push(a, c, bb, bb, c, d); else indeks.push(a, bb, c, bb, d, c);
      }
    };
    kenar(Array.from({ length: nx }, (_, x) => x), true);
    kenar(Array.from({ length: nx }, (_, x) => (ny - 1) * nx + x), false);
    kenar(Array.from({ length: ny }, (_, y) => y * nx), false);
    kenar(Array.from({ length: ny }, (_, y) => y * nx + nx - 1), true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(r.subarray(0, v * 3), 3));
    g.setIndex(indeks);
    g.computeBoundingSphere();
    this.onbellek.set(anahtar, g);
    return g;
  }

  /** Kamera yerine göre karelerin ayrıntısı; değişen kare yeniden kurulur */
  guncelle(kamera: THREE.Vector3, hafif: boolean, golge: boolean) {
    let ucgen = 0;
    const kullanilan = new Set<string>();
    for (const k of this.kareler) {
      if (k.derin) continue;
      const d = Math.hypot(k.cx - kamera.x, k.cy - kamera.y, k.cz - kamera.z);
      const adim = hafif ? (d < 1400 ? 2 : d < 4000 ? 4 : 8) : (d < 1000 ? 1 : d < 2600 ? 2 : d < 6500 ? 4 : 8);
      kullanilan.add(`${k.ci},${k.cj},${adim}`);
      if (k.adim !== adim || !k.mesh) {
        const g = this.geometri(k, adim);
        if (!k.mesh) { k.mesh = new THREE.Mesh(g, this.malzeme); this.grup.add(k.mesh); } else k.mesh.geometry = g;
        k.adim = adim;
      }
      k.mesh.receiveShadow = golge && adim <= 2;
      ucgen += (k.mesh.geometry.index?.count ?? 0) / 3;
    }
    // Kullanılmayan geometriler boşaltılır (bellek)
    for (const [a, g] of this.onbellek) if (!kullanilan.has(a)) { g.dispose(); this.onbellek.delete(a); }
    this.ucgen = ucgen;
  }

  /** Sahne x, z'deki zemin hücresinin rengi (taş kaide zemine bu renkle karışır; `kaideGeometrisi.ts`) */
  renkAl = (x: number, sz: number, c: THREE.Color) => {
    const { b } = this.z;
    const i = Math.max(0, Math.min(b.en - 1, Math.round((x - b.x0) / b.hucre)));
    const j = Math.max(0, Math.min(b.boy - 1, Math.round((-sz - b.y0) / b.hucre)));
    const k = (j * b.en + i) * 3;
    c.setRGB(this.renk[k] / 255, this.renk[k + 1] / 255, this.renk[k + 2] / 255);
  };

  /** Hücre renklerine dışarıdan karışım (ağaç katı: arazi türü, 22 Kasım); kurulmuş kareler yeniden kurulur */
  renkKaristir(karistir: (k: number, renk: Uint8Array) => void) {
    this.karistir = karistir;
    const adet = this.renk.length / 3;
    for (let k = 0; k < adet; k++) karistir(k, this.renk);
    for (const g of this.onbellek.values()) g.dispose();
    this.onbellek.clear();
    for (const k of this.kareler) k.adim = 0;
  }

  dispose() {
    for (const g of this.onbellek.values()) g.dispose();
    this.onbellek.clear();
    this.malzeme.dispose();
  }
}
