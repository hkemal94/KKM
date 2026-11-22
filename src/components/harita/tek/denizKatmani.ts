/**
 * Tek harita: suyun üstündeki liman öğeleri (22 Kasım, Kemal: Dondurmacı Kızlar bir iskelenin önünde).
 *
 * `duzada-yapilar.geojson`'daki `katman: 'iskele'` (ahşap T iskele) ve `katman: 'mendirek'` (taş mendirek)
 * çokgenleri deniz yüzeyinin biraz üstünde düz bir kütle olarak çizilir. Yalnız okur; hiçbir şey yazmaz.
 */
import * as THREE from 'three';
import { sahneye, type Koleksiyon, type ZeminBasligi } from './tekVeri';

const OLCU: Record<string, { ust: number; alt: number; renk: string }> = {
  iskele: { ust: 1.2, alt: -1.5, renk: '#9A6B3F' },   // ahşap güverte (DENEME: sudan 1,2 m)
  mendirek: { ust: 2.5, alt: -4, renk: '#8A8C8F' }     // taş (DENEME: sudan 2,5 m)
};

export class DenizKatmani {
  grup = new THREE.Group();

  constructor(b: ZeminBasligi, yapilar: Koleksiyon) {
    for (const f of yapilar.features) {
      const o = OLCU[String(f.properties.katman)];
      if (!o || f.geometry.type !== 'Polygon') continue;
      const halka = (f.geometry.coordinates as number[][][])[0].map(c => sahneye(b, c));
      // Şekil x, -z düzleminde; kalıp yukarı (y) çekilir
      const sekil = new THREE.Shape(halka.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(sekil, { depth: o.ust - o.alt, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, o.alt, 0);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: o.renk }));
      m.castShadow = true;
      m.receiveShadow = true;
      this.grup.add(m);
    }
  }

  dispose() {
    this.grup.traverse(o => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }
}
