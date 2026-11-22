import * as THREE from 'three';
import { rakim, sahneye, type Koleksiyon, type Zemin } from './tekVeri';

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
const SIRA = ['patika', 'toprak', 'merdiven', 'gecit', 'sokak', 'ara', 'ana'];
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
