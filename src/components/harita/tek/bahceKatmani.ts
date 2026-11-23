import * as THREE from 'three';
import { modelYukle } from '../../../lib/modelYukle';
import { ARSA_OLCULERI, BAHCE } from '../../../lib/binaKutuphanesi';
import { hazirla, type HaritaModeli } from '../modelHazirla';
import { rakim, sahneye, type Koleksiyon, type Nokta, type Yapi, type Zemin } from './tekVeri';

/**
 * Evlerin bahçeleri (23 Kasım, Kemal: "sen bu evleri bahçesiz yapıyorsun, daha öncesinde bahçe ve evi
 * kombinasyonlu yapıyorduk"). Eski haritadaki kalıp (`modelYerlesimi.ts` → `bahceKur`, gen/duzada.py →
 * "Ev ve arsası tek yapı"): ev + arsası birlikte; arsanın kenarında bahçe duvarı, yola bakan kenarda
 * kapı, içeride avlu zemini, bitki, ağaç ve yakın bakışta bahçe eşyaları.
 *
 * Her evin arsası yapı dosyasındaki `arsa` (köşeler; gen/kompakt_yapilar.py yazar). Arsası olmayan,
 * arsasının dışına taşınan ya da Düzenle'de yeni konan ev tek ev sayılır: çevresine pay bırakılarak arsa
 * kurulur (dar ön bahçe en yakın yola bakar); komşuya, başka arsaya, yola ya da kıyıya binerse küçülür,
 * en küçüğü de binerse bahçe yok. Hazır gruptan gelen evin ve hazır grup konan arsanın bahçesini grup
 * getirir (burada çizilmez).
 *
 * - Avlu zemini: arsanın tamamı (kasabada taş döşeme, köyde toprak), arkada bostan / çimen.
 * - Duvar (Kemal, 23 Kasım): kasabada badanalı, köyde taş. Komşu arsaların ortak kenarı bir kez çizilir;
 *   evin ve komşu evin içinde kalan duvar çizilmez; yola bakan kenarda kapı aralığı.
 * - Bitki: duvar dibinde 2–4 çalı (ağaçlar ağaç katmanında: avlu ağaçları).
 * - Yakın bakışta eşyalar (Kemal, 23 Kasım: "yakında eşyalar da gelsin"; eski haritanın kuralı): evin
 *   arsasına bütünüyle sığıyorsa hazır bahçe arsası modeli (katalog `bahce.arsalar`; bina yeri evin
 *   tabanına), o evin duvarı ve çalıları modelinkiyle değişir; sığmıyorsa kapı aralığına bahçe kapısı,
 *   içeriye 2–4 eşya (kuyu, çardak, sebze tarhı, çamaşır ipi…) ve 1–2 çalı ya da servi. Yalnız bakılan
 *   yerin yakınında, üçgen bütçesiyle; hafif modda çok daha dar.
 * - Telefon için: 300 m'lik karolarda tek geometri (zemin bir, duvar ve bitki bir çizim); yalnız
 *   bakılan yere yakın karolar çizilir, hafif modda daha dar.
 *
 * Bütün ölçüler ve renkler DENEME (Kemal onaylamadı). Kayda hiçbir şey yazılmaz.
 */

type Doku = 'kasaba' | 'koy';
type Bicim = {
  zemin: string; bostan: string; duvar: string; duvarUst: string;
  /** duvar yüksekliği, kalınlığı (m) */
  yukseklik: number; kalinlik: number;
  /** arsanın arkasında bostan / çimen payı (arsa derinliğine oran) ve olasılığı */
  bostanOrani: number; bostanSansi: number;
  bitki: string[];
};
// DENEME (Kemal onaylamadı): ölçüler ve renkler
const BICIM: Record<Doku, Bicim> = {
  kasaba: {
    zemin: '#D8CBB0', bostan: '#A7B06C', duvar: '#EFEAE0', duvarUst: '#D9D1C2',
    yukseklik: 1.6, kalinlik: 0.4, bostanOrani: 0.35, bostanSansi: 0.6,
    bitki: ['#A9467A', '#5F7F45', '#6E8B4E', '#58773F']
  },
  koy: {
    zemin: '#CDBB92', bostan: '#93A45C', duvar: '#B4A78C', duvarUst: '#A39578',
    yukseklik: 1.0, kalinlik: 0.5, bostanOrani: 0.5, bostanSansi: 0.8,
    bitki: ['#6E8B4E', '#7C9A55', '#8E7BB5', '#6E8B4E']
  }
};
/** Bahçeli yapı türleri */
const BAHCELI = new Set(['ev', 'dukkanli', 'yazlik', 'ciftlik']);
/** Arsası olmayan evin çevresine bırakılan pay (m); binerse sırayla küçülür (DENEME) */
const PAYLAR = [5, 3.5, 2];
/** Kapı aralığı (m, DENEME) */
const KAPI = 1.4;
/** Duvar parçası en çok bu boyda (m): zemine bu aralıkla oturur */
const PARCA = 4;
const ZEMIN_YUKARI = 0.18;
const KARO = 300;
/** Çizilen karolar: bakılan yere uzaklık (m) ve kamera uzaklığı sınırı (normal, hafif) */
const GORUS = { normal: { yaricap: 1500, kamera: 3200 }, hafif: { yaricap: 500, kamera: 1600 } };
/** Yakın bakışta eşyalar: bakılan yere uzaklık, kamera uzaklığı sınırı, üçgen bütçesi (DENEME) */
const YAKIN = { normal: { yaricap: 180, kamera: 1000, butce: 200_000 }, hafif: { yaricap: 60, kamera: 420, butce: 15_000 } };
/** İnmemiş modelin tahmini üçgeni (arsa modeli, öbürleri) */
const TAHMIN = { arsa: 30_000, parca: 2_500 };
/** Hazır arsa modelinde bina yerinin merkezi (katalog: x 0..13, ön -y; modelde z -9..0) */
const BINA_YERI = { x: 6.5, z: -4.5 };
/** İç eşyaların arsa kenarından ve evden en az uzaklığı, birbirinden aralığı (m; eski haritadaki gibi) */
const IC_PAY = 2, EV_PAYI = 1.8, ESYA_ARASI = 3.2;
/** Eşya olarak konan bitkiler: yalnız çalı ve servi (meyve ağaçları zaten avlu ağacı) */
const ESYA_BITKILERI = BAHCE.bitki.filter(d => /cali|lavanta|servi/.test(d));

/** Kimlikten sabit seçim */
const sec = <T,>(s: string, l: T[]): T => l[Math.floor(sans(s) * l.length) % l.length];

/** Kimlikten sabit 0–1 sayı */
function sans(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const dokusu = (mahalle: string, parselTuru: string | null): Doku =>
  mahalle === 'yer_iskele' || mahalle === 'yer_liman' || (mahalle === 'yer_merkez' && parselTuru === 'bitisik') ? 'kasaba' : 'koy';

/** Yapının taban dikdörtgeni (sahne): merkez, ex, yarı en / boy */
type Kutu = { c: Nokta; ex: Nokta; a: number; b: number };
const kutuIcinde = (k: Kutu, x: number, z: number, pay = 0) => {
  const dx = x - k.c[0], dz = z - k.c[1];
  return Math.abs(dx * k.ex[0] + dz * k.ex[1]) < k.a + pay && Math.abs(-dx * k.ex[1] + dz * k.ex[0]) < k.b + pay;
};

/** Dışbükey çokgen içinde mi (arsalar dikdörtgen) */
function icinde(p: Nokta, h: Nokta[]): boolean {
  let ic = false;
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
    const [xi, zi] = h[i], [xj, zj] = h[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ic = !ic;
  }
  return ic;
}

/** Çokgenin alanı (m²) */
const alan = (h: Nokta[]) => Math.abs(h.reduce((t, p, i) => { const q = h[(i + 1) % h.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** Noktanın çokgenin kenarına uzaklığı */
function kenaraUzaklik(p: Nokta, h: Nokta[]): number {
  let en = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    en = Math.min(en, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t));
  }
  return en;
}

/** Izgara: noktanın yakınındaki kutular */
class Izgara<T> {
  private h = new Map<string, T[]>();
  constructor(private m: number) {}
  ekle(x0: number, z0: number, x1: number, z1: number, t: T) {
    for (let i = Math.floor(x0 / this.m); i <= Math.floor(x1 / this.m); i++) for (let j = Math.floor(z0 / this.m); j <= Math.floor(z1 / this.m); j++) {
      const k = `${i},${j}`; const l = this.h.get(k); if (l) l.push(t); else this.h.set(k, [t]);
    }
  }
  yakin(x: number, z: number): T[] { return this.h.get(`${Math.floor(x / this.m)},${Math.floor(z / this.m)}`) ?? []; }
}

type Parca = { p: number[]; c: number[] };
/** Çalının biçimi: birim yirmi yüzlünün üçgenleri (köşeler art arda) */
const CALI = Array.from(new THREE.IcosahedronGeometry(1, 0).toNonIndexed().getAttribute('position').array as Float32Array);
/** Karonun bir ayrıntı seviyesi: 0 tam, 1 hafif mod (duvar parçası uzun, zemin kaba, çalı yok) */
type Seviye = { zemin: Parca; duvar: Parca; mesh?: THREE.Group; duvarMesh?: THREE.Mesh; ucgen: number };
type Karo = {
  sv: [Seviye, Seviye]; x: number; z: number;
  /** Evin duvar ve çalılarının köşe aralığı (tam seviyede; hazır arsa modeli konunca gizlenir) */
  aralik: Map<number, [number, number]>; gizli: Set<number>;
};
/** Hafif seviyenin duvar parçası ve zemin ızgarası (m) */
const PARCA_HAFIF = 8, ZEMIN_ADIM = { tam: 5, hafif: 8 };
/** Yakın bakışta konan eşya: model, yeri, yönü (+X), boyuna ölçek; `capa` modelin hangi noktası yere gelir */
type Esya = { dosya: string; x: number; z: number; ex: Nokta; sx: number; capa: 'merkez' | 'binaYeri'; kot?: number };
const bosSeviye = (): Seviye => ({ zemin: { p: [], c: [] }, duvar: { p: [], c: [] }, ucgen: 0 });
/** Hazırlanmış bahçe modelleri (sayfa boyunca bir kez) */
const ORTAK_MODELLER = new Map<string, HaritaModeli>();
type Bahce = { n: number; x: number; z: number; karo: Karo; esyalar: Esya[]; hazir: boolean };

export class BahceKatmani {
  grup = new THREE.Group();
  ucgen = 0;
  /** Bahçesi çizilen ev sayısı (ölçüm) */
  bahceli = 0;
  /** Yakın bakışta eşyası çizilen ev sayısı (ölçüm) */
  esyali = 0;
  private karolar = new Map<string, Karo>();
  private bahceler: Bahce[] = [];
  private zeminMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  private duvarMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private renk = new THREE.Color();
  /** İnen modeller bütün katmanlarda ortak (Düzenle her değişiklikte katmanı yeniden kurar) */
  private modeller = ORTAK_MODELLER;
  private inenler = new Set<string>();
  private ornekler: THREE.InstancedMesh[] = [];
  private karoUcgen = 0;
  private son: { x: number; z: number; u: number; hafif: boolean; golge: boolean } | null = null;
  private bekleyen = 0;
  private kapandi = false;

  /** `gizliAvlu`: hazır grup konan arsaların hücreleri (`duzenle/birlesik.ts` → gizli.avlu; 4 m) */
  constructor(private z: Zemin, yapilar: Yapi[], yollar: Koleksiyon, gizliAvlu: Set<number> | null, gizliHucre: number, private onDegisti: () => void) {
    // Bütün yapı tabanları (komşu evin içine duvar girmesin)
    const kutular = new Izgara<Kutu>(16);
    const kutusu = (y: Yapi): Kutu => ({ c: y.merkez, ex: y.ex, a: (y.modelEn ?? y.en) / 2, b: y.boy / 2 });
    for (const y of yapilar) {
      const k = kutusu(y), r = Math.hypot(k.a, k.b);
      kutular.ekle(y.merkez[0] - r, y.merkez[1] - r, y.merkez[0] + r, y.merkez[1] + r, k);
    }
    // Evlerin kendi arsaları (ev arsasının içindeyse) ve ızgarası (tek evin payı başka arsaya binmesin)
    const arsasi = (y: Yapi) => (y.arsa && y.arsa.length >= 3 && icinde(y.merkez, y.arsa) ? y.arsa : null);
    const arsaIzg = new Izgara<Nokta[]>(32);
    for (const y of yapilar) {
      const h = arsasi(y);
      if (!h) continue;
      const xs = h.map(q => q[0]), zs = h.map(q => q[1]);
      arsaIzg.ekle(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), h);
    }
    const yolIzg = new Izgara<{ a: Nokta; b: Nokta; w: number }>(24);
    for (const f of yollar.features) {
      if (f.geometry.type !== 'LineString' || (f.properties.katman !== 'yol' && f.properties.katman !== 'kopru')) continue;
      const w = (Number(f.properties.genislik) || 4) / 2;
      const c = (f.geometry.coordinates as number[][]).map(q => sahneye(z.b, q));
      for (let n = 1; n < c.length; n++) {
        const a = c[n - 1], b = c[n];
        yolIzg.ekle(Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, { a, b, w });
      }
    }
    /** Noktanın en yakın yol kenarına uzaklığı (çevredeki ~80 m içinde; yoksa sonsuz) */
    const yolUzakligi = (x: number, sz: number) => {
      let en = Infinity;
      for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) for (const { a, b, w } of yolIzg.yakin(x + di * 24, sz + dj * 24)) {
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (sz - a[1]) * dz) / l2));
        en = Math.min(en, Math.hypot(x - a[0] - dx * t, sz - a[1] - dz * t) - w);
      }
      return en;
    };
    const yolda = (x: number, sz: number) => yolIzg.yakin(x, sz).some(({ a, b, w }) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (sz - a[1]) * dz) / l2));
      return Math.hypot(x - a[0] - dx * t, sz - a[1] - dz * t) < w + 0.3;
    });
    const avluGizli = (h: Nokta[]) => {
      if (!gizliAvlu?.size) return false;
      const c = h.reduce((s, q) => [s[0] + q[0] / h.length, s[1] + q[1] / h.length], [0, 0]);
      return gizliAvlu.has(Math.floor(c[0] / gizliHucre) * 100003 + Math.floor(c[1] / gizliHucre));
    };

    // Çizilmiş duvar parçaları (ortak kenar bir kez): orta noktalar ızgarada
    const cizilen = new Izgara<{ m: Nokta; d: Nokta }>(4);
    const ciziliMi = (m: Nokta, d: Nokta) => cizilen.yakin(m[0], m[1]).some(o =>
      Math.abs(o.d[0] * d[0] + o.d[1] * d[1]) > 0.97 && Math.abs((m[0] - o.m[0]) * -o.d[1] + (m[1] - o.m[1]) * o.d[0]) < 0.45
      && Math.abs((m[0] - o.m[0]) * o.d[0] + (m[1] - o.m[1]) * o.d[1]) < PARCA * 0.6);

    for (const y of yapilar) {
      if (!BAHCELI.has(y.tur) || y.grup) continue;
      let halka = arsasi(y);
      let onYon: Nokta | null = null;
      const evK = kutusu(y);
      if (halka && avluGizli(halka)) continue;
      const tekEv = !halka;
      if (!halka) {
        // Tek ev: çevresine pay; komşu yapıya, arsaya, yola ya da kıyıya binerse küçülür.
        // Ön (dar bahçe, kapı) en yakın yola bakan yan.
        const yanlar: Array<{ f: Nokta; e: Nokta; a: number; b: number }> = [
          { f: [-y.ex[1], y.ex[0]], e: y.ex, a: evK.a, b: evK.b }, { f: [y.ex[1], -y.ex[0]], e: [-y.ex[0], -y.ex[1]], a: evK.a, b: evK.b },
          { f: y.ex, e: [y.ex[1], -y.ex[0]], a: evK.b, b: evK.a }, { f: [-y.ex[0], -y.ex[1]], e: [-y.ex[1], y.ex[0]], a: evK.b, b: evK.a }
        ];
        const yan = yanlar.reduce((p, q) => yolUzakligi(y.merkez[0] + q.f[0] * (q.b + 6), y.merkez[1] + q.f[1] * (q.b + 6))
          < yolUzakligi(y.merkez[0] + p.f[0] * (p.b + 6), y.merkez[1] + p.f[1] * (p.b + 6)) ? q : p);
        const f = yan.f, e = yan.e;
        onYon = f;
        for (const pay of PAYLAR) {
          const on = Math.min(pay, 1.5); // ön bahçe dar (yola bakar)
          const k = (s: number, t: number): Nokta => [y.merkez[0] + e[0] * s + f[0] * t, y.merkez[1] + e[1] * s + f[1] * t];
          const A = yan.a + pay, B0 = -yan.b - pay, B1 = yan.b + on;
          const aday = [k(-A, B0), k(A, B0), k(A, B1), k(-A, B1)];
          let bos = true;
          for (let n = 0; n < 4 && bos; n++) {
            const p = aday[n], q = aday[(n + 1) % 4], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
            for (let s = 0; s <= l && bos; s += 1.5) {
              const x = p[0] + ((q[0] - p[0]) * s) / l, sz = p[1] + ((q[1] - p[1]) * s) / l;
              if (rakim(z, x, sz) < 1 || yolda(x, sz) || kutular.yakin(x, sz).some(o => o.c !== y.merkez && kutuIcinde(o, x, sz, 0.3))
                || arsaIzg.yakin(x, sz).some(h => icinde([x, sz], h))) bos = false;
            }
          }
          if (bos) { halka = aday; break; }
        }
      }
      if (!halka) continue;
      // Tek ev kasabanın dokusunda değil: köy bahçesi. Merkez'de küçük arsa (bitişik sıra) kasaba gibi.
      const doku: Doku = tekEv ? 'koy' : dokusu(y.mahalle, alan(halka) < 200 ? 'bitisik' : 'avlulu');
      this.bahceKur(y, halka, doku, evK, kutular, ciziliMi, cizilen, onYon);
      this.bahceli++;
    }
    // Karoların geometrisi
    for (const k of this.karolar.values()) for (const sv of k.sv) {
      const g = new THREE.Group();
      for (const [parca, mat, golge] of [[sv.zemin, this.zeminMat, false], [sv.duvar, this.duvarMat, true]] as const) {
        if (!parca.p.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(parca.p, 3));
        geo.setAttribute('color', new THREE.Uint8BufferAttribute(parca.c, 3, true));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true;
        m.castShadow = golge;
        m.renderOrder = mat === this.zeminMat ? 0.5 : 0;
        sv.ucgen += parca.p.length / 9;
        if (mat === this.duvarMat) sv.duvarMesh = m;
        g.add(m);
      }
      g.visible = false;
      sv.mesh = g;
      this.grup.add(g);
      sv.zemin = { p: [], c: [] }; sv.duvar = { p: [], c: [] };
    }
  }

  private karo(x: number, sz: number): Karo {
    const a = `${Math.floor(x / KARO)},${Math.floor(sz / KARO)}`;
    let k = this.karolar.get(a);
    if (!k) { k = { sv: [bosSeviye(), bosSeviye()], aralik: new Map(), gizli: new Set(), x: (Math.floor(x / KARO) + 0.5) * KARO, z: (Math.floor(sz / KARO) + 0.5) * KARO }; this.karolar.set(a, k); }
    return k;
  }

  private y(x: number, sz: number) { return Math.max(0, rakim(this.z, x, sz)); }

  /** Üçgen (renkli) ekler */
  private ucgenEkle(h: Parca, renk: string, ...k: number[][]) {
    this.renk.set(renk);
    const r = Math.round(this.renk.r * 255), g = Math.round(this.renk.g * 255), b = Math.round(this.renk.b * 255);
    for (const q of k) { h.p.push(q[0], q[1], q[2]); h.c.push(r, g, b); }
  }

  /** Arsa içinde (u, v) koordinatlı dörtgen zemine serilir: u kenar boyunca, v içeri */
  private zemineSer(h: Parca, renk: string, o: Nokta, eu: Nokta, ev: Nokta, u0: number, u1: number, v0: number, v1: number, yukari: number, adim: number) {
    const nu = Math.max(1, Math.ceil((u1 - u0) / adim)), nv = Math.max(1, Math.ceil((v1 - v0) / adim));
    const nokta = (i: number, j: number) => {
      const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv;
      const x = o[0] + eu[0] * u + ev[0] * v, sz = o[1] + eu[1] * u + ev[1] * v;
      return [x, this.y(x, sz) + yukari, sz];
    };
    // Yukarı bakan yön: eu × ev'nin işareti
    const yukariMi = eu[0] * ev[1] - eu[1] * ev[0] < 0;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = nokta(i, j), b = nokta(i + 1, j), c = nokta(i + 1, j + 1), d = nokta(i, j + 1);
      if (yukariMi) { this.ucgenEkle(h, renk, a, b, c); this.ucgenEkle(h, renk, a, c, d); }
      else { this.ucgenEkle(h, renk, a, c, b); this.ucgenEkle(h, renk, a, d, c); }
    }
  }

  /** Duvar parçası: p'den q'ya, zemine oturur; üstü ve iki yanı (uçları `uc` ise kapalı) */
  private duvarEkle(h: Parca, b: Bicim, p: Nokta, q: Nokta, ucA: boolean, ucB: boolean) {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l < 0.2) return;
    const nx = (-(q[1] - p[1]) / l) * b.kalinlik / 2, nz = ((q[0] - p[0]) / l) * b.kalinlik / 2;
    const ya = this.y(p[0], p[1]), yb = this.y(q[0], q[1]);
    const alt = Math.min(ya, yb) - 0.8;
    const A1 = [p[0] + nx, ya + b.yukseklik, p[1] + nz], A2 = [p[0] - nx, ya + b.yukseklik, p[1] - nz];
    const B1 = [q[0] + nx, yb + b.yukseklik, q[1] + nz], B2 = [q[0] - nx, yb + b.yukseklik, q[1] - nz];
    const a1 = [p[0] + nx, alt, p[1] + nz], a2 = [p[0] - nx, alt, p[1] - nz];
    const b1 = [q[0] + nx, alt, q[1] + nz], b2 = [q[0] - nx, alt, q[1] - nz];
    // Üst (kapak), iki yan; sarma yönleri dışa baksın diye iki yan ayrı
    this.ucgenEkle(h, b.duvarUst, A1, B1, B2); this.ucgenEkle(h, b.duvarUst, A1, B2, A2);
    this.ucgenEkle(h, b.duvar, a1, b1, B1); this.ucgenEkle(h, b.duvar, a1, B1, A1);
    this.ucgenEkle(h, b.duvar, a2, B2, b2); this.ucgenEkle(h, b.duvar, a2, A2, B2);
    if (ucA) { this.ucgenEkle(h, b.duvar, a2, a1, A1); this.ucgenEkle(h, b.duvar, a2, A1, A2); }
    if (ucB) { this.ucgenEkle(h, b.duvar, b1, b2, B2); this.ucgenEkle(h, b.duvar, b1, B2, B1); }
  }

  /** Çalı: basık, hafif yamuk yirmi yüzlü (20 üçgen) */
  private caliEkle(h: Parca, renk: string, x: number, sz: number, r: number, boy: number, aci: number) {
    const y0 = this.y(x, sz) - 0.15;
    const c = Math.cos(aci), s = Math.sin(aci);
    const k: number[][] = [];
    for (let i = 0; i < CALI.length; i += 3) {
      const px = CALI[i] * r, py = (CALI[i + 1] * 0.5 + 0.5) * boy, pz = CALI[i + 2] * r * 0.85;
      k.push([x + px * c - pz * s, y0 + py, sz + px * s + pz * c]);
    }
    for (let i = 0; i < k.length; i += 3) this.ucgenEkle(h, renk, k[i], k[i + 1], k[i + 2]);
  }

  private bahceKur(y: Yapi, halka: Nokta[], doku: Doku, ev: Kutu, kutular: Izgara<Kutu>,
    ciziliMi: (m: Nokta, d: Nokta) => boolean, cizilen: Izgara<{ m: Nokta; d: Nokta }>, onYon: Nokta | null) {
    const b = BICIM[doku];
    const kr = this.karo(y.merkez[0], y.merkez[1]);
    // Ön yön: modelin +Z'si; ön kenar dış yönü buna en yakın olan kenar
    const f: Nokta = onYon ?? [-y.ex[1], y.ex[0]];
    const n = halka.length;
    let onK = 0, enIyi = -Infinity;
    const orta = halka.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n] as Nokta, [0, 0] as Nokta);
    for (let i = 0; i < n; i++) {
      const p = halka[i], q = halka[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2 - orta[0], mz = (p[1] + q[1]) / 2 - orta[1];
      const l = Math.hypot(mx, mz) || 1;
      const d = (mx * f[0] + mz * f[1]) / l;
      if (d > enIyi) { enIyi = d; onK = i; }
    }
    // Arsanın yerel ekseni: ön kenar boyunca u, içeri v
    const p0 = halka[onK], p1 = halka[(onK + 1) % n];
    const W = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const eu: Nokta = [(p1[0] - p0[0]) / W, (p1[1] - p0[1]) / W];
    let ei: Nokta = [-eu[1], eu[0]];
    if ((orta[0] - p0[0]) * ei[0] + (orta[1] - p0[1]) * ei[1] < 0) ei = [-ei[0], -ei[1]];
    const D = Math.max(...halka.map(q => (q[0] - p0[0]) * ei[0] + (q[1] - p0[1]) * ei[1]));
    // Evin arsadaki derinliği
    const evKoseleri = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [ev.c[0] + ev.ex[0] * ev.a * s - ev.ex[1] * ev.b * t, ev.c[1] + ev.ex[1] * ev.a * s + ev.ex[0] * ev.b * t]);
    const evV1 = Math.max(...evKoseleri.map(q => (q[0] - p0[0]) * ei[0] + (q[1] - p0[1]) * ei[1]));
    const evU = evKoseleri.map(q => (q[0] - p0[0]) * eu[0] + (q[1] - p0[1]) * eu[1]);
    const evU0 = Math.min(...evU), evU1 = Math.max(...evU);

    // Avlu zemini ve arkada bostan / çimen
    const [tam, hff] = kr.sv;
    this.zemineSer(tam.zemin, b.zemin, p0, eu, ei, 0, W, 0, D, ZEMIN_YUKARI, ZEMIN_ADIM.tam);
    this.zemineSer(hff.zemin, b.zemin, p0, eu, ei, 0, W, 0, D, ZEMIN_YUKARI, ZEMIN_ADIM.hafif);
    const r = sans(y.id);
    if (r < b.bostanSansi) {
      const v0 = Math.max(evV1 + 1.5, D * (1 - b.bostanOrani)), v1 = D - 1.0;
      if (v1 - v0 >= 2.5 && W > 4) {
        this.zemineSer(tam.zemin, b.bostan, p0, eu, ei, 1.0, W - 1.0, v0, v1, ZEMIN_YUKARI + 0.05, ZEMIN_ADIM.tam);
        this.zemineSer(hff.zemin, b.bostan, p0, eu, ei, 1.0, W - 1.0, v0, v1, ZEMIN_YUKARI + 0.05, ZEMIN_ADIM.hafif);
      }
    }

    // Duvar: kenarlar parça parça; evin, komşu evin içindeki ve çizilmiş olan parça atlanır.
    // Ön kenarda evin önü açık, evin yanındaki geniş kısımda kapı aralığı.
    const kapiU = (() => {
      const sol = evU0, sag = W - evU1;
      if (Math.max(sol, sag) < KAPI + 1) return null;
      return sol >= sag ? sol / 2 : evU1 + sag / 2;
    })();
    const engel = (x: number, sz: number) => kutuIcinde(ev, x, sz, 0.6) || kutular.yakin(x, sz).some(o => o.c !== ev.c && kutuIcinde(o, x, sz, 0.3));
    const no = this.bahceler.length;
    const duvarBasi = tam.duvar.p.length / 3;
    for (let i = 0; i < n; i++) {
      const p = halka[i], q = halka[(i + 1) % n];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l < 0.3) continue;
      const d: Nokta = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      // Arsanın içine bakan yön
      const ic: Nokta = [orta[0] - (p[0] + q[0]) / 2, orta[1] - (p[1] + q[1]) / 2];
      let nx = -d[1], nz = d[0];
      if (nx * ic[0] + nz * ic[1] < 0) { nx = -nx; nz = -nz; }
      // DENEME: duvar arsa kenarının üstünde (ortak kenar zaten bir kez çiziliyor)
      const ice = 0;
      const kesimler: Array<[number, number]> = [];
      let bas: number | null = null;
      const adet = Math.max(1, Math.ceil(l / PARCA));
      const adim = l / adet;
      for (let s = 0; s < adet; s++) {
        const a = s * adim, c = a + adim, m = (a + c) / 2;
        const mx = p[0] + d[0] * m + nx * ice, mz = p[1] + d[1] * m + nz * ice;
        const acik = engel(mx, mz) || ciziliMi([mx, mz], d);
        if (i === onK && kapiU !== null && !acik) {
          // Kapı aralığı: parçayı ikiye böl
          if (Math.abs(m - kapiU) < adim / 2 + KAPI / 2) {
            if (bas !== null) { kesimler.push([bas, Math.max(bas, kapiU - KAPI / 2)]); bas = null; }
            if (c > kapiU + KAPI / 2) bas = kapiU + KAPI / 2;
            continue;
          }
        }
        if (acik) { if (bas !== null) { kesimler.push([bas, a]); bas = null; } continue; }
        if (bas === null) bas = a;
      }
      if (bas !== null) kesimler.push([bas, l]);
      for (const [a, c] of kesimler) {
        if (c - a < 0.3) continue;
        const k = Math.max(1, Math.ceil((c - a) / PARCA));
        for (let s = 0; s < k; s++) {
          const u0 = a + ((c - a) * s) / k, u1 = a + ((c - a) * (s + 1)) / k;
          const A: Nokta = [p[0] + d[0] * u0 + nx * ice, p[1] + d[1] * u0 + nz * ice];
          const B: Nokta = [p[0] + d[0] * u1 + nx * ice, p[1] + d[1] * u1 + nz * ice];
          this.duvarEkle(tam.duvar, b, A, B, s === 0, s === k - 1);
          const m: Nokta = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
          cizilen.ekle(m[0], m[1], m[0], m[1], { m, d });
        }
        // Hafif seviye: aynı kesim daha uzun parçalarla
        const kh = Math.max(1, Math.ceil((c - a) / PARCA_HAFIF));
        for (let s = 0; s < kh; s++) {
          const u0 = a + ((c - a) * s) / kh, u1 = a + ((c - a) * (s + 1)) / kh;
          this.duvarEkle(hff.duvar, b, [p[0] + d[0] * u0, p[1] + d[1] * u0], [p[0] + d[0] * u1, p[1] + d[1] * u1], s === 0, s === kh - 1);
        }
      }
    }

    // Bitki: duvar dibinde 1–3 çalı (kasabada kapının yanında begonvil)
    const adetB = 2 + Math.floor(sans(y.id + '#b') * 3);
    const konan: Nokta[] = [];
    const yerler: Array<[number, number]> = [];
    if (kapiU !== null) yerler.push([kapiU + (KAPI / 2 + 1.1) * (sans(y.id + '#k') < 0.5 ? -1 : 1), 1.3]);
    yerler.push([1.5, D - 1.5], [W - 1.5, D - 1.5], [W - 1.5, Math.min(D - 1.5, evV1 + 2)], [1.5, Math.min(D - 1.5, evV1 + 2)]);
    for (let k = 0; k < Math.min(adetB, yerler.length); k++) {
      const [u, v] = yerler[k];
      const x = p0[0] + eu[0] * u + ei[0] * v, sz = p0[1] + eu[1] * u + ei[1] * v;
      if (engel(x, sz)) continue;
      const renk = k === 0 && kapiU !== null ? b.bitki[0] : b.bitki[1 + Math.floor(sans(y.id + k) * (b.bitki.length - 1))];
      this.caliEkle(tam.duvar, renk, x, sz, 1.0 + 0.6 * sans(y.id + 'r' + k), 1.3 + 0.9 * sans(y.id + 'h' + k), sans(y.id + 'a' + k) * Math.PI * 2);
      konan.push([x, sz]);
    }
    kr.aralik.set(no, [duvarBasi, tam.duvar.p.length / 3 - duvarBasi]);

    // Yakın bakışın eşyaları. Önce hazır bahçe arsası: bina yeri evin tabanına, arsaya bütünüyle sığarsa.
    const esyalar: Esya[] = [];
    const ez: Nokta = [-y.ex[1], y.ex[0]];
    const yerle = (x: number, zz: number): Nokta => [
      y.merkez[0] + y.ex[0] * (x - BINA_YERI.x) + ez[0] * (zz - BINA_YERI.z),
      y.merkez[1] + y.ex[1] * (x - BINA_YERI.x) + ez[1] * (zz - BINA_YERI.z)
    ];
    const hazirlar = BAHCE.arsalar.filter(d => {
      const o = ARSA_OLCULERI[d];
      if (!o) return false;
      return [yerle(o.x0, o.z0), yerle(o.x1, o.z0), yerle(o.x1, o.z1), yerle(o.x0, o.z1)].every(q => icinde(q, halka) && kenaraUzaklik(q, halka) >= 0.2);
    });
    if (hazirlar.length) {
      esyalar.push({ dosya: sec(`${y.id}#arsa`, hazirlar), x: y.merkez[0], z: y.merkez[1], ex: y.ex, sx: 1, capa: 'binaYeri', kot: y.kot });
    } else {
      // Sığmazsa parça parça: kapı aralığına bahçe kapısı (dışı yola), içeriye eşya ve çalı
      if (kapiU !== null && BAHCE.kapi.length) {
        const ex: Nokta = eu[1] * ei[0] - eu[0] * ei[1] > 0 ? eu : [-eu[0], -eu[1]];
        esyalar.push({ dosya: sec(`${y.id}#kapi`, BAHCE.kapi), x: p0[0] + eu[0] * kapiU, z: p0[1] + eu[1] * kapiU, ex, sx: -1, capa: 'merkez' });
      }
      const r2 = (k: number) => sans(`${y.id}#ic${k}`);
      let deneme = 0;
      const yerBul = (): Nokta | null => {
        for (; deneme < 40; deneme++) {
          const u = IC_PAY + (W - 2 * IC_PAY) * r2(deneme * 2), v = IC_PAY + (D - 2 * IC_PAY) * r2(deneme * 2 + 1);
          const q: Nokta = [p0[0] + eu[0] * u + ei[0] * v, p0[1] + eu[1] * u + ei[1] * v];
          if (!icinde(q, halka) || kenaraUzaklik(q, halka) < IC_PAY || kutuIcinde(ev, q[0], q[1], EV_PAYI)
            || konan.some(o => Math.hypot(o[0] - q[0], o[1] - q[1]) < ESYA_ARASI)) continue;
          konan.push(q);
          deneme++;
          return q;
        }
        return null;
      };
      const dagit = (liste: string[], adet: number, tur: string) => {
        for (let k = 0; k < adet && liste.length; k++) {
          const q = yerBul();
          if (!q) return;
          const aci = sans(`${y.id}#${tur}a${k}`) * Math.PI * 2;
          esyalar.push({ dosya: sec(`${y.id}#${tur}${k}`, liste), x: q[0], z: q[1], ex: [Math.cos(aci), Math.sin(aci)], sx: 1, capa: 'merkez' });
        }
      };
      dagit(BAHCE.ic, 2 + Math.floor(sans(`${y.id}#icAdet`) * 3), 'ic');
      dagit(ESYA_BITKILERI, 1 + Math.floor(sans(`${y.id}#bitkiAdet`) * 2), 'bitki');
    }
    this.bahceler.push({ n: no, x: y.merkez[0], z: y.merkez[1], karo: kr, esyalar, hazir: hazirlar.length > 0 });
  }

  guncelle(hedef: THREE.Vector3, kameraUzakligi: number, hafif: boolean, golge: boolean) {
    this.son = { x: hedef.x, z: hedef.z, u: kameraUzakligi, hafif, golge };
    const g = hafif ? GORUS.hafif : GORUS.normal;
    const acik = kameraUzakligi < g.kamera;
    let ucgen = 0;
    const seviye = hafif ? 1 : 0;
    for (const k of this.karolar.values()) {
      const v = acik && Math.hypot(k.x - hedef.x, k.z - hedef.z) < g.yaricap + KARO * 0.71;
      k.sv.forEach((sv, n) => { if (sv.mesh) sv.mesh.visible = v && n === seviye; });
      const sv = k.sv[seviye];
      if (!v || !sv.mesh) continue;
      ucgen += sv.ucgen;
      for (const m of sv.mesh.children as THREE.Mesh[]) {
        if (m.material === this.duvarMat) m.castShadow = golge;
        m.receiveShadow = golge;
      }
    }
    this.karoUcgen = ucgen;

    // Yakın bakışın eşyaları: yakından uzağa, bütçe dolana kadar; modeli inmemiş ev sonra gelir
    const y = hafif ? YAKIN.hafif : YAKIN.normal;
    const secilen: Bahce[] = [];
    const indir = new Set<string>();
    let toplam = 0;
    if (kameraUzakligi < y.kamera) {
      const adaylar = this.bahceler
        .map(b => ({ b, u: Math.hypot(b.x - hedef.x, b.z - hedef.z) }))
        .filter(a => a.u < y.yaricap && a.b.esyalar.length && !(hafif && a.b.hazir))
        .sort((p, q) => p.u - q.u);
      for (const { b } of adaylar) {
        let u = 0, eksik = false;
        for (const e of b.esyalar) {
          const m = this.modeller.get(e.dosya);
          u += m?.ucgen ?? (e.capa === 'binaYeri' ? TAHMIN.arsa : TAHMIN.parca);
          if (!m) { eksik = true; indir.add(e.dosya); }
        }
        if (toplam + u > y.butce) continue;
        toplam += u;
        if (!eksik) secilen.push(b);
      }
    }
    for (const d of indir) {
      if (this.inenler.has(d) || this.modeller.has(d)) continue;
      this.inenler.add(d);
      modelYukle(d)
        .then(gl => { if (!this.kapandi) { this.modeller.set(d, hazirla(gl.scene)); this.sonra(); } })
        .catch(e => console.warn('[tek harita] bahçe modeli inmedi', d, e))
        .finally(() => this.inenler.delete(d));
    }
    for (const o of this.ornekler) { this.grup.remove(o); o.dispose(); }
    this.ornekler = [];
    const matrisler = new Map<string, THREE.Matrix4[]>();
    let esyaUcgen = 0;
    const hazirlar = new Set<Bahce>();
    for (const b of secilen) {
      if (b.hazir) hazirlar.add(b);
      for (const e of b.esyalar) {
        const m = this.modeller.get(e.dosya)!;
        const sx = e.sx < 0 ? sinirla(KAPI / Math.max(0.1, m.w), 0.6, 1.6) : e.sx;
        const [ax, az] = e.capa === 'binaYeri' ? [BINA_YERI.x, BINA_YERI.z] : [m.cx, m.cz];
        const kot = e.kot ?? this.y(e.x, e.z);
        const mat = new THREE.Matrix4().makeTranslation(e.x, kot, e.z).multiply(donus(e.ex))
          .multiply(new THREE.Matrix4().makeScale(sx, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-ax, 0, -az));
        const l = matrisler.get(e.dosya) ?? [];
        l.push(mat);
        matrisler.set(e.dosya, l);
        esyaUcgen += m.ucgen;
      }
    }
    for (const [d, l] of matrisler) {
      for (const p of this.modeller.get(d)!.parcalar) {
        const o = new THREE.InstancedMesh(p.geo, p.mat, l.length);
        l.forEach((x, k) => o.setMatrixAt(k, x));
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingSphere();
        o.castShadow = golge;
        o.receiveShadow = golge;
        this.grup.add(o);
        this.ornekler.push(o);
      }
    }
    // Hazır arsa modeli konan evin duvarı ve çalıları gizlenir (modelin kendisininki geçerli)
    const yeniGizli = new Map<Karo, Set<number>>();
    for (const b of hazirlar) { const s = yeniGizli.get(b.karo) ?? new Set(); s.add(b.n); yeniGizli.set(b.karo, s); }
    for (const k of this.karolar.values()) {
      const s = yeniGizli.get(k) ?? new Set<number>();
      if (s.size === k.gizli.size && [...s].every(n => k.gizli.has(n))) continue;
      k.gizli = s;
      const geo = k.sv[0].duvarMesh?.geometry;
      if (!geo) continue;
      if (!s.size) { geo.setIndex(null); continue; }
      const toplamKose = geo.getAttribute('position').count;
      const kapali = [...s].map(n => k.aralik.get(n)).filter((a): a is [number, number] => !!a).sort((p, q) => p[0] - q[0]);
      const dizin: number[] = [];
      let i = 0;
      for (const [bas, adet] of kapali) { for (; i < bas; i++) dizin.push(i); i = bas + adet; }
      for (; i < toplamKose; i++) dizin.push(i);
      geo.setIndex(dizin);
    }
    this.esyali = secilen.length;
    this.ucgen = this.karoUcgen + esyaUcgen;
  }

  /** Art arda inen modeller için tek yenileme */
  private sonra() {
    if (this.bekleyen) return;
    this.bekleyen = window.setTimeout(() => {
      this.bekleyen = 0;
      const s = this.son;
      if (s && !this.kapandi) { this.guncelle(new THREE.Vector3(s.x, 0, s.z), s.u, s.hafif, s.golge); this.onDegisti(); }
    }, 80);
  }

  /** Model inişi sürüyor mu (ölçüm için) */
  get iniyor() { return this.inenler.size > 0 || this.bekleyen !== 0; }

  dispose() {
    this.kapandi = true;
    if (this.bekleyen) clearTimeout(this.bekleyen);
    for (const o of this.ornekler) o.dispose();
    for (const k of this.karolar.values()) for (const sv of k.sv) sv.mesh?.children.forEach(m => (m as THREE.Mesh).geometry.dispose());
    this.zeminMat.dispose(); this.duvarMat.dispose();
  }
}

const sinirla = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Modelin +X'i ex yönüne (x doğu, z güney); model ön = +Z (yapiKatmani.ts ile aynı) */
const donus = (ex: Nokta) => new THREE.Matrix4().set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);
