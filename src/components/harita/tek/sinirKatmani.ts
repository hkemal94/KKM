import * as THREE from 'three';
import { rakim, sahneye, type Koleksiyon, type Yapi, type Zemin } from './tekVeri';

/**
 * Tek harita: mahalle sınırları (kesik çizgi), dereler (ince mavi) ve ekranda
 * yazılan adlar (mahalleler, zirveler, viki bağlı yapılar). Adlar veriden
 * gelir; yeni ad konmaz.
 */

export type Etiket = { anahtar: string; ad: string; tur: 'mahalle' | 'zirve' | 'yapi'; x: number; y: number; z: number; yapi?: string };

export class SinirKatmani {
  grup = new THREE.Group();
  etiketler: Etiket[] = [];

  constructor(z: Zemin, sinirlar: Koleksiyon, yapilar: Yapi[]) {
    const sinirNoktalari: number[] = [];
    const dereNoktalari: number[] = [];
    for (const f of sinirlar.features) {
      const p = f.properties;
      if (f.geometry.type === 'LineString' && (p.katman === 'sinir' || p.katman === 'dere')) {
        const hedef = p.katman === 'sinir' ? sinirNoktalari : dereNoktalari;
        const c = (f.geometry.coordinates as number[][]).map(q => sahneye(z.b, q));
        // Sık örnek: çizgi zemine yapışsın (her 15 m)
        const l: number[][] = [];
        for (let n = 0; n < c.length; n++) {
          if (n > 0) {
            const [ax, az] = c[n - 1], [bx, bz] = c[n];
            const adim = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 15));
            for (let s = 1; s < adim; s++) l.push([ax + ((bx - ax) * s) / adim, az + ((bz - az) * s) / adim]);
          }
          l.push(c[n]);
        }
        const yukari = p.katman === 'sinir' ? 3 : 0.8;
        for (let n = 1; n < l.length; n++) {
          const [ax, az] = l[n - 1], [bx, bz] = l[n];
          hedef.push(ax, Math.max(0.3, rakim(z, ax, az)) + yukari, az, bx, Math.max(0.3, rakim(z, bx, bz)) + yukari, bz);
        }
      } else if (p.katman === 'mahalle' && typeof p.ad === 'string') {
        // Ad, mahallenin en büyük parçasının ağırlık merkezine
        const cok = f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as number[][][][]) : [f.geometry.coordinates as number[][][]];
        let enIyi: { a: number; x: number; z: number } = { a: 0, x: 0, z: 0 };
        for (const poly of cok) {
          const h = poly[0].map(q => sahneye(z.b, q));
          let a = 0, cx = 0, cz = 0;
          for (let n = 0; n < h.length - 1; n++) {
            const k = h[n][0] * h[n + 1][1] - h[n + 1][0] * h[n][1];
            a += k; cx += (h[n][0] + h[n + 1][0]) * k; cz += (h[n][1] + h[n + 1][1]) * k;
          }
          if (Math.abs(a) > Math.abs(enIyi.a)) enIyi = { a, x: cx / (3 * a), z: cz / (3 * a) };
        }
        if (enIyi.a) this.etiketler.push({ anahtar: String(p.id), ad: p.ad, tur: 'mahalle', x: enIyi.x, y: rakim(z, enIyi.x, enIyi.z) + 40, z: enIyi.z });
      } else if (p.katman === 'zirve' && typeof p.ad === 'string' && f.geometry.type === 'Point') {
        const [x, sz] = sahneye(z.b, f.geometry.coordinates as number[]);
        this.etiketler.push({ anahtar: String(p.id), ad: p.ad, tur: 'zirve', x, y: rakim(z, x, sz) + 15, z: sz });
      }
    }
    for (const y of yapilar) {
      if (!y.vikiId || !y.ad) continue;
      this.etiketler.push({ anahtar: y.id, ad: y.ad, tur: 'yapi', x: y.merkez[0], y: y.kot + Math.max(8, y.yukseklik) + 2, z: y.merkez[1], yapi: y.id });
    }
    const cizgi = (noktalar: number[], malzeme: THREE.LineBasicMaterial | THREE.LineDashedMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(noktalar, 3));
      const l = new THREE.LineSegments(g, malzeme);
      if (malzeme instanceof THREE.LineDashedMaterial) l.computeLineDistances();
      this.grup.add(l);
    };
    cizgi(dereNoktalari, new THREE.LineBasicMaterial({ color: '#6FA8C4', transparent: true, opacity: 0.7 }));
    cizgi(sinirNoktalari, new THREE.LineDashedMaterial({ color: '#0E1C4F', dashSize: 40, gapSize: 25, transparent: true, opacity: 0.55 }));
  }

  dispose() {
    this.grup.traverse(o => { const l = o as THREE.LineSegments; if (l.isLineSegments) { l.geometry.dispose(); (l.material as THREE.Material).dispose(); } });
  }
}
