import * as THREE from 'three';
import { cizilenRakim, rakim, sahneye, type Koleksiyon, type Zemin } from './tekVeri';

/**
 * Tek harita yolları (`duzada-yollar.geojson`): her yol kendi genişliğinde bir
 * şerit; rengi kademesine göre. Yolun yüksekliği dosyadaki üçüncü sayıdan (yol
 * yatağı zeminde zaten açık). Meydan ve meydancıklar taş döşeme yüzey.
 * Aynı kademedeki bütün yollar tek parça çizilir (telefon için).
 */

export const YOL_RENGI: Record<string, string> = {
  ana: '#F4EEE2',
  ara: '#EEE6D6',
  sokak: '#E4D9C4',
  gecit: '#DACDB4',
  toprak: '#C9AE84',
  patika: '#BFA27A',
  merdiven: '#CFC5B4',
  basamak: '#A89E8C',
  meydan: '#E8DFCD',
  kumsal: '#E9DBB4'
};
/**
 * Liman yapıları (21 Kasım, Dondurmacı Kızlar çevresi): yol dosyasında `iskele`
 * (ahşap T iskele), `mendirek` (taş) ve `kumsal` (liman kumsalı) öğeleri. Veride
 * yoksa hiçbir şey çizilmez. İskele ve mendirek denizden yükselen düz blok
 * (üst kotu DENEME); modelleri (deniz/ahsap-iskele-*, deniz/mendirek-duz) sonraki iş.
 */
const LIMAN_BLOGU: Record<string, { renk: string; ust: number; alt: number }> = {
  iskele: { renk: '#A2754C', ust: 1.4, alt: -1.5 },
  mendirek: { renk: '#A9A296', ust: 2.2, alt: -3 }
};
/** Kademe sırası: üstteki alttakinin üstüne çizilir (kavşakta ana yol görünsün) */
const SIRA = ['patika', 'toprak', 'merdiven', 'basamak', 'gecit', 'sokak', 'ara', 'ana'];
/** Merdivende basamak aralığı ve basamak çizgisinin derinliği (m, DENEME) */
const BASAMAK_ARALIGI = 1.6, BASAMAK_DERINLIK = 0.3;
const YUKSELME = 0.25;

export class YolKatmani {
  grup = new THREE.Group();
  ucgen = 0;

  constructor(z: Zemin, yollar: Koleksiyon) {
    const parcalar = new Map<string, { p: number[]; i: number[] }>();
    const al = (k: string) => { let x = parcalar.get(k); if (!x) { x = { p: [], i: [] }; parcalar.set(k, x); } return x; };

    for (const f of yollar.features) {
      const pr = f.properties;
      if (f.geometry.type === 'LineString' && (pr.katman === 'yol' || pr.katman === 'kopru')) {
        const kademe = pr.katman === 'kopru' ? 'ara' : String(pr.kademe ?? 'sokak');
        const w = Number(pr.genislik) || 4;
        const c = (f.geometry.coordinates as number[][]).map(q => {
          const [x, sz] = sahneye(z.b, q);
          return [x, q.length > 2 ? q[2] : rakim(z, x, sz), sz] as const;
        });
        const sira = Math.max(0, SIRA.indexOf(kademe));
        if (kademe === 'merdiven' && pr.tasMerdiven) {
          // Taş merdiven (The Imperial, 25 Kasım): kayalık yarın önünde, kendi yüksekliğinde; her basamak altındaki
          // zemine kadar dolu taş (merdiven yarın önünde duvarıyla durur)
          tasMerdivenEkle(al('basamak'), al('merdiven'), z, c, w / 2);
          continue;
        }
        if (kademe === 'merdiven') {
          // Merdiven (25 Kasım, Kemal: "yamaçta ince kırık çizgi"): dik yamaçta da zeminin üstünde kalsın diye sık
          // noktalarla, çizilen zeminden aşağı inmeden; üstünde basamak çizgileri
          const m = merdivenNoktalari(z, c, w / 2);
          seritEkle(al(kademe), m, w / 2, YUKSELME + sira * 0.04);
          basamakEkle(al('basamak'), m, w / 2, YUKSELME + sira * 0.04 + 0.03);
          continue;
        }
        seritEkle(al(kademe), c, w / 2, YUKSELME + sira * 0.04 + (pr.katman === 'kopru' ? 0.1 : 0));
      } else if (f.geometry.type === 'Polygon' && (pr.katman === 'korunan' || pr.katman === 'meydancik')) {
        if (pr.katman === 'korunan' && pr.tur !== 'meydan') continue;
        yuzeyEkle(al('meydan'), z, f.geometry.coordinates as number[][][]);
      } else if (f.geometry.type === 'Polygon' && pr.katman === 'kumsal') {
        yuzeyEkle(al('kumsal'), z, f.geometry.coordinates as number[][][], 0.1);
      } else if (f.geometry.type === 'Polygon' && typeof pr.katman === 'string' && LIMAN_BLOGU[pr.katman]) {
        const b = LIMAN_BLOGU[pr.katman];
        const g = blokGeometrisi(z, f.geometry.coordinates as number[][][], b.ust, b.alt);
        if (!g) continue;
        const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: b.renk, flatShading: true }));
        m.castShadow = m.receiveShadow = true;
        this.grup.add(m);
        this.ucgen += g.getAttribute('position').count / 3;
      }
    }
    for (const [kademe, { p, i }] of parcalar) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      const n = new Float32Array(p.length);
      for (let k = 1; k < n.length; k += 3) n[k] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      g.setIndex(i);
      g.computeBoundingSphere();
      const sira = kademe === 'meydan' || kademe === 'kumsal' ? 0 : SIRA.indexOf(kademe) + 1;
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        color: YOL_RENGI[kademe] ?? YOL_RENGI.sokak,
        // Zemin kaba çizildiğinde yol altında kalmasın
        polygonOffset: true, polygonOffsetFactor: -2 - sira * 0.2, polygonOffsetUnits: -8 - sira
      }));
      m.receiveShadow = true;
      m.renderOrder = 1 + sira;
      this.grup.add(m);
      this.ucgen += i.length / 3;
    }
  }

  dispose() {
    this.grup.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}

/** Merdivenin noktaları: 0,8 m'de bir; yükseklik dosyadakinden ve şeridin enindeki çizilen zeminden aşağı inmez */
function merdivenNoktalari(z: Zemin, c: ReadonlyArray<readonly [number, number, number]>, yari: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let n = 0; n < c.length - 1; n++) {
    const a = c[n], b = c[n + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2], u = Math.hypot(dx, dz) || 1;
    const px = -dz / u * yari, pz = dx / u * yari;
    const adim = Math.max(1, Math.ceil(u / 0.8));
    for (let k = 0; k < adim + (n === c.length - 2 ? 1 : 0); k++) {
      const t = k / adim, x = a[0] + dx * t, sz = a[2] + dz * t;
      const y = Math.max(a[1] + (b[1] - a[1]) * t, cizilenRakim(z, x, sz), cizilenRakim(z, x + px, sz + pz), cizilenRakim(z, x - px, sz - pz));
      out.push([x, y, sz]);
    }
  }
  return out;
}

/**
 * Taş merdiven: yolun noktaları arasında 0,8 m'lik basamaklar; her basamak üstü düz (yolun o yerdeki yüksekliği),
 * altı basamağın altındaki en alçak çizilen zemine kadar dolu taş. Üstler `ust`e, yan yüzler `yan`a.
 */
function tasMerdivenEkle(yan: { p: number[]; i: number[] }, ust: { p: number[]; i: number[] }, z: Zemin,
  c: ReadonlyArray<readonly [number, number, number]>, yari: number) {
  const DERIN = 0.8;
  for (let n = 0; n < c.length - 1; n++) {
    const a = c[n], b = c[n + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2], u = Math.hypot(dx, dz);
    if (u < 0.01) continue;
    const tx = dx / u, tz = dz / u, px = -tz * yari, pz = tx * yari;
    const adim = Math.max(1, Math.round(u / DERIN));
    for (let k = 0; k < adim; k++) {
      const t0 = k / adim, t1 = (k + 1) / adim;
      const x0 = a[0] + dx * t0, z0 = a[2] + dz * t0, x1 = a[0] + dx * t1, z1 = a[2] + dz * t1;
      const y = a[1] + (b[1] - a[1]) * (t0 + t1) / 2;
      const kose: Array<[number, number]> = [[x0 + px, z0 + pz], [x1 + px, z1 + pz], [x1 - px, z1 - pz], [x0 - px, z0 - pz]];
      const alt = Math.min(...kose.map(([x, sz]) => cizilenRakim(z, x, sz))) - 0.5;
      if (alt >= y) continue;
      // üst yüz
      const ki = ust.p.length / 3;
      for (const [x, sz] of kose) ust.p.push(x, y, sz);
      ust.i.push(ki, ki + 2, ki + 1, ki, ki + 3, ki + 2, ki, ki + 1, ki + 2, ki, ki + 2, ki + 3);
      // dört yan yüz
      for (let e = 0; e < 4; e++) {
        const [xa, za] = kose[e], [xb, zb] = kose[(e + 1) % 4];
        const kb = yan.p.length / 3;
        yan.p.push(xa, y, za, xb, y, zb, xb, alt, zb, xa, alt, za);
        yan.i.push(kb, kb + 1, kb + 2, kb, kb + 2, kb + 3, kb, kb + 2, kb + 1, kb, kb + 3, kb + 2);
      }
    }
  }
}

/** Basamak çizgileri: merdiven boyunca BASAMAK_ARALIGI'nda bir, şeridin eninde ince koyu dörtgen */
function basamakEkle(hedef: { p: number[]; i: number[] }, c: ReadonlyArray<readonly [number, number, number]>, yari: number, yukari: number) {
  let birikim = 0;
  for (let n = 1; n < c.length; n++) {
    const a = c[n - 1], b = c[n];
    const dx = b[0] - a[0], dz = b[2] - a[2], u = Math.hypot(dx, dz);
    if (!u) continue;
    birikim += u;
    if (birikim < BASAMAK_ARALIGI) continue;
    birikim = 0;
    const tx = dx / u, tz = dz / u, px = -tz * yari, pz = tx * yari, y = b[1] + yukari;
    const k = hedef.p.length / 3;
    const ox = tx * BASAMAK_DERINLIK, oz = tz * BASAMAK_DERINLIK;
    hedef.p.push(b[0] + px, y, b[2] + pz, b[0] - px, y, b[2] - pz, b[0] + px + ox, y, b[2] + pz + oz, b[0] - px + ox, y, b[2] - pz + oz);
    hedef.i.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
}

/** Çizgiyi şerit yapar (köşede iki kenarın ortası yönünde, aşırı sivri köşe sınırlı) */
function seritEkle(hedef: { p: number[]; i: number[] }, c: ReadonlyArray<readonly [number, number, number]>, yari: number, yukari: number) {
  if (c.length < 2) return;
  const bas = hedef.p.length / 3;
  for (let n = 0; n < c.length; n++) {
    const onceki = c[Math.max(0, n - 1)], sonraki = c[Math.min(c.length - 1, n + 1)];
    let dx = sonraki[0] - onceki[0], dz = sonraki[2] - onceki[2];
    const u = Math.hypot(dx, dz) || 1;
    dx /= u; dz /= u;
    // Köşede genişlik korunsun: iki kesimin dikinin ortası, en çok 2 kat
    let olcek = 1;
    if (n > 0 && n < c.length - 1) {
      const ax = c[n][0] - c[n - 1][0], az = c[n][2] - c[n - 1][2], au = Math.hypot(ax, az) || 1;
      const kos = (ax / au) * dx + (az / au) * dz;
      olcek = Math.min(2, 1 / Math.max(0.5, kos));
    }
    const px = -dz * yari * olcek, pz = dx * yari * olcek;
    const y = c[n][1] + yukari;
    hedef.p.push(c[n][0] + px, y, c[n][2] + pz, c[n][0] - px, y, c[n][2] - pz);
  }
  for (let n = 0; n < c.length - 1; n++) {
    const a = bas + n * 2, b = a + 1, d = a + 2, e = a + 3;
    hedef.i.push(a, d, b, b, d, e);
  }
}

/** Meydan yüzeyi: çokgen üçgenlenir, her köşe zemine oturur */
function yuzeyEkle(hedef: { p: number[]; i: number[] }, z: Zemin, halkalar: number[][][], enAlt = -Infinity) {
  const dis = halkalar[0].map(q => sahneye(z.b, q));
  if (dis.length > 1 && dis[0][0] === dis[dis.length - 1][0] && dis[0][1] === dis[dis.length - 1][1]) dis.pop();
  const delikler = halkalar.slice(1).map(h => { const d = h.map(q => sahneye(z.b, q)); d.pop(); return d; });
  const v2 = (l: [number, number][]) => l.map(([x, sz]) => new THREE.Vector2(x, sz));
  const ucgenler = THREE.ShapeUtils.triangulateShape(v2(dis), delikler.map(v2));
  const hepsi = [...dis, ...delikler.flat()];
  const bas = hedef.p.length / 3;
  for (const [x, sz] of hepsi) hedef.p.push(x, Math.max(enAlt, rakim(z, x, sz)) + YUKSELME, sz);
  for (const [a, b, c] of ucgenler) {
    // Yukarı baksın
    const [ax, az] = hepsi[a], [bx, bz] = hepsi[b], [cx, cz] = hepsi[c];
    const yukariMi = (bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0;
    if (yukariMi) hedef.i.push(bas + a, bas + b, bas + c); else hedef.i.push(bas + a, bas + c, bas + b);
  }
}

/** Düz üstlü blok (iskele, mendirek): üst yüz üçgenlenir, kenarlar `alt`a iner */
function blokGeometrisi(z: Zemin, halkalar: number[][][], ust: number, alt: number): THREE.BufferGeometry | null {
  const dis = halkalar[0].map(q => sahneye(z.b, q));
  if (dis.length > 1 && dis[0][0] === dis[dis.length - 1][0] && dis[0][1] === dis[dis.length - 1][1]) dis.pop();
  if (dis.length < 3) return null;
  const ucgenler = THREE.ShapeUtils.triangulateShape(dis.map(([x, sz]) => new THREE.Vector2(x, sz)), []);
  const p: number[] = [];
  const nokta = (q: [number, number], y: number) => p.push(q[0], y, q[1]);
  for (const [a, b, c] of ucgenler) {
    const [ax, az] = dis[a], [bx, bz] = dis[b], [cx, cz] = dis[c];
    const yukariMi = (bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0;
    for (const k of yukariMi ? [a, b, c] : [a, c, b]) nokta(dis[k], ust);
  }
  // Kenarlar: iki yüzlü çizilir (halkanın yönü bilinmese de görünsün)
  for (let n = 0; n < dis.length; n++) {
    const a = dis[n], b = dis[(n + 1) % dis.length];
    nokta(a, ust); nokta(a, alt); nokta(b, ust);
    nokta(b, ust); nokta(a, alt); nokta(b, alt);
    nokta(a, ust); nokta(b, ust); nokta(a, alt);
    nokta(b, ust); nokta(b, alt); nokta(a, alt);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
