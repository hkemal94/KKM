import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Koleksiyon, ZeminBasligi } from './tekVeri';

/**
 * Adanın Ege'deki yeri (24 Kasım; Kemal: "Ege'deki konum geri gelsin"). Eski haritanın
 * çevresi geri geldi: komşu karalar (Biga Yarımadası, Babakale, Edremit Körfezi kıyısı,
 * Bozcaada, Gökçeada, Midilli, Limni…), içeri 350 m kumsal şeridi, ince kıyı çizgisi ve
 * kıyıdan açığa üç sığlık bandı. Veri `public/harita/ege-cevresi.json`
 * (`scripts/egeCevresiUret.mjs`; Natural Earth 1:10m Land, kamu malı).
 *
 * Hepsi düz: kara ve kumsal deniz yüzünün hemen üstünde, sığlık bantları altında (saydam
 * denizin altından açık renk görünür; adanın kendi sığ suyu gibi). Düzada'ya en yakın kara
 * 15 km'den uzak; yakınken sis örter, katman yalnız uzaklaşınca çizilir.
 */

export type CevreEtiketi = { ad: string; tur: 'ada' | 'kiyi' | 'su' | 'liman' | 'duzada'; x: number; z: number };

const RENK = {
  kara: '#93A07C',
  kiyi: '#D9CC9E',
  cizgi: '#F3EFE8',
  sig: ['#9FC9C4', '#7FB2C0', '#629DB6']
};

/** Katman bu uzaklıktan (kamera ile bakılan yer arası, m) sonra çizilir */
export const CEVRE_UZAKLIGI = 3500;

type Halka = number[][];

export class EgeKatmani {
  grup = new THREE.Group();
  etiketler: CevreEtiketi[] = [];
  /** Verideki bütün karaların kapladığı alan (sahne x, z): kamera bu alandan çıkmaz */
  alt = new THREE.Vector2(Infinity, Infinity);
  ust = new THREE.Vector2(-Infinity, -Infinity);
  private atilacak: Array<{ dispose: () => void }> = [];

  constructor(b: ZeminBasligi, veri: Koleksiyon) {
    // Şekil düzlemi (x, kuzey) → sahne (x, 0, -kuzey): rotateX(-90°)
    const nokta = (p: number[]) => new THREE.Vector2((p[0] - b.lng0) * b.mPerLng, (p[1] - b.lat0) * b.mPerLat);
    const sekil = (halkalar: Halka[]) => {
      const s = new THREE.Shape(halkalar[0].map(nokta));
      for (const h of halkalar.slice(1)) s.holes.push(new THREE.Path(h.map(nokta)));
      return new THREE.ShapeGeometry(s);
    };
    const kara: THREE.BufferGeometry[] = [], kiyi: THREE.BufferGeometry[] = [];
    const sig: THREE.BufferGeometry[][] = [[], [], []];
    const cizgi: number[] = [];
    for (const f of veri.features) {
      const p = f.properties as { katman?: string; bant?: number; ad?: string; tur?: string };
      if (p.katman === 'etiket' && f.geometry.type === 'Point') {
        const c = f.geometry.coordinates as number[];
        const v = nokta(c);
        this.etiketler.push({ ad: String(p.ad ?? ''), tur: (p.tur ?? 'ada') as CevreEtiketi['tur'], x: v.x, z: -v.y });
        continue;
      }
      if (f.geometry.type !== 'Polygon') continue;
      const halkalar = f.geometry.coordinates as Halka[];
      if (p.katman === 'kara') {
        kara.push(sekil(halkalar));
        for (const h of halkalar) {
          for (let i = 0; i + 1 < h.length; i++) {
            const a = nokta(h[i]), c = nokta(h[i + 1]);
            cizgi.push(a.x, 0, -a.y, c.x, 0, -c.y);
            this.alt.min(a); this.ust.max(a);
          }
        }
      } else if (p.katman === 'kiyi') kiyi.push(sekil(halkalar));
      else if (p.katman === 'sig') sig[Math.max(0, Math.min(2, (p.bant ?? 1) - 1))].push(sekil(halkalar));
    }
    // Kara ve kumsal deniz yüzünün üstünde, adanın katlarıyla karışmaz (Düzada'dan uzak)
    const yuzey = (parcalar: THREE.BufferGeometry[], renk: string, y: number, sira: number, ek: THREE.MeshLambertMaterialParameters = {}, kalkar = true) => {
      if (!parcalar.length) return;
      const g = mergeGeometries(parcalar, false);
      for (const p of parcalar) p.dispose();
      if (!g) return;
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshLambertMaterial({ color: renk, ...ek });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.y = y;
      if (kalkar) mesh.userData.y = y;
      mesh.renderOrder = sira;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.grup.add(mesh);
      this.atilacak.push(g, m);
    };
    // Sığlık bantları denizin altında, deniz dibinin üstünde çizilir (derinliğe bakmaz; Düzada'ya
    // değmez): saydam deniz yüzü üstlerinden geçer, adanın sığ suyu gibi açık görünür
    sig.forEach((parcalar, n) => yuzey(parcalar, RENK.sig[n], -4, 1, { depthTest: false, depthWrite: false }, false));
    yuzey(kara, RENK.kara, 1, 2);
    // Kumsal karanın üstünde: aynı yükseklik, derinlik kaydırmasıyla önde
    yuzey(kiyi, RENK.kiyi, 1, 3, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    if (cizgi.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cizgi, 3));
      const m = new THREE.LineBasicMaterial({ color: RENK.cizgi, transparent: true, opacity: 0.55 });
      const l = new THREE.LineSegments(g, m);
      l.position.y = 1.5;
      l.userData.y = 1.5;
      l.renderOrder = 4;
      l.matrixAutoUpdate = false;
      l.updateMatrix();
      this.grup.add(l);
      this.atilacak.push(g, m);
    }
    this.grup.visible = false;
  }

  /** Uzaklaşınca görünür; yakında sis zaten örter, çizilmez */
  guncelle(uzaklik: number) {
    this.grup.visible = uzaklik > CEVRE_UZAKLIGI;
    // Uzakta derinlik ayrımı kabalaşır: kara deniz yüzünden uzaklıkla orantılı yukarıda durur
    // (100 km'den bakınca 140 m; o uzaklıktan düz görünür), yoksa saydam deniz karanın üstüne biner.
    const k = Math.max(1, uzaklik / 700);
    for (const c of this.grup.children) {
      if (c.userData.y === undefined) continue;
      c.position.y = (c.userData.y as number) * k;
      c.updateMatrix();
    }
  }

  dispose() {
    for (const a of this.atilacak) a.dispose();
    this.atilacak.length = 0;
  }
}
