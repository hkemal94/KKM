import * as THREE from 'three';
import { indir } from './tekVeri';

/**
 * Tek harita: uzak yapıların az üçgenli model kopyaları (6b, 22 Kasım; Kemal: uzakta
 * kutu yerine modelin basit hâli). Hepsi tek dosyada (`public/harita/uzak-modeller.bin`,
 * üreten `scripts/uzakModelleriUret.mjs`). Her modelin iki sürümü var: 0 normal mod,
 * 1 hafif mod ve çok uzak. Taban kutusu asıl modelinkiyle aynı; basit sürüm asıl
 * modelin yerine tam oturur. Yalnız okur.
 */

export interface UzakModel {
  cx: number; cz: number; w: number; d: number;
  /** seviye → renk parçaları */
  seviyeler: Array<Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>>;
  /** seviye → üçgen sayısı */
  ucgen: number[];
}

type Baslik = { modeller: Record<string, { cx: number; cz: number; w: number; d: number; seviyeler: Array<Array<{ renk: string; cift: boolean; bas: number; adet: number }>> }> };

/** Dosya: gzip içinde "DZM1", başlık uzunluğu, JSON başlık, int16 konumlar (santim) */
export async function uzakModelleriOku(sinyal?: AbortSignal): Promise<Map<string, UzakModel>> {
  const ham = await indir('uzak-modeller.bin', sinyal);
  const acik = await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const v = new DataView(acik);
  const imza = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (imza !== 'DZM1') throw new Error('uzak model dosyası tanınmadı');
  const n = v.getUint32(4, true);
  const b = JSON.parse(new TextDecoder().decode(new Uint8Array(acik, 8, n))) as Baslik;
  const konum = new Int16Array(acik, 8 + n);
  // Aynı renk bir kez: malzemeler paylaşılır
  const malzemeler = new Map<string, THREE.Material>();
  const malzeme = (renk: string, cift: boolean) => {
    const a = renk + (cift ? 'c' : '');
    let m = malzemeler.get(a);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: `#${renk}`, side: cift ? THREE.DoubleSide : THREE.FrontSide }); malzemeler.set(a, m); }
    return m;
  };
  const cikti = new Map<string, UzakModel>();
  for (const [dosya, k] of Object.entries(b.modeller)) {
    const seviyeler = k.seviyeler.map(parcalar => parcalar.map(p => {
      const p3 = new Float32Array(p.adet * 3);
      for (let i = 0; i < p3.length; i++) p3[i] = konum[p.bas * 3 + i] / 100;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p3, 3));
      // Düz gölgeli: her üçgen kendi köşeleriyle
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      return { geo, mat: malzeme(p.renk, p.cift) };
    }));
    cikti.set(dosya, { cx: k.cx, cz: k.cz, w: k.w, d: k.d, seviyeler, ucgen: k.seviyeler.map(l => l.reduce((t, p) => t + p.adet / 3, 0)) });
  }
  return cikti;
}

export function uzakModelleriBirak(l: Map<string, UzakModel>) {
  const mats = new Set<THREE.Material>();
  for (const m of l.values()) for (const s of m.seviyeler) for (const p of s) { p.geo.dispose(); mats.add(p.mat); }
  for (const m of mats) m.dispose();
}
