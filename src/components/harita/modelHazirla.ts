import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Modeli haritaya hazırlama (4 Kasım; 21 Kasım'da modelKatmani.ts'ten ayrıldı,
 * tek harita da kullansın diye). Zemin altı parçalar atılır, aynı renkler tek
 * parçada birleşir; taban kutusu ölçülür.
 */

/** Zemin altında kalan parçalar haritada çizilmez (arsa, deniz, kayalık) */
const ZEMIN_ESIGI = 0.15;

export interface HaritaModeli {
  parcalar: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;
  /** Taban kutusunun merkezi ve ölçüleri (metre) */
  cx: number; cz: number; w: number; d: number;
  ucgen: number;
}

/** Kaidesiz çizilen modelin ayarı (`tek/modelEsleme.ts` → `KAIDESIZ`) */
export interface KaideAyari {
  /** Bu adlardaki parçalar hiç çizilmez */
  atla: ReadonlySet<string>;
  /** Bütün köşeleri bu yüksekliğin altında kalan üçgenler atılır (modelin kaidesi) */
  altSinir: number;
}

/**
 * Modeli haritaya hazırlar: zemin altı parçalar atılır, aynı renkler tek parçada birleşir.
 * `kaide` verilirse (The Imperial, 25 Kasım) parça parça değil üçgen üçgen kırpılır: modelin
 * sahanlık altında kalan kaidesi atılır, sahanlık üstü (bina) kalır.
 */
export function hazirla(sahne: THREE.Object3D, kaide?: KaideAyari): HaritaModeli {
  sahne.updateMatrixWorld(true);
  const gruplar = new Map<string, { renk: THREE.Color; cift: boolean; geo: THREE.BufferGeometry[] }>();
  const kutu = new THREE.Box3();
  sahne.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (kaide?.atla.has(m.name)) return;
    const kaynak = m.geometry;
    const konum = kaynak.getAttribute('position');
    if (!konum) return;
    // Sıkıştırılmış (tam sayı) öznitelikleri düz sayıya çevir, dünya konumuna taşı
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(konum.count * 3);
    for (let i = 0; i < konum.count; i++) { p[i * 3] = konum.getX(i); p[i * 3 + 1] = konum.getY(i); p[i * 3 + 2] = konum.getZ(i); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (kaynak.index) g.setIndex(Array.from(kaynak.index.array as ArrayLike<number>));
    g.applyMatrix4(m.matrixWorld);
    g.computeBoundingBox();
    if (!kaide && g.boundingBox!.max.y <= ZEMIN_ESIGI) { g.dispose(); return; }
    // Düz gölgeli low-poly: normaller yüzlerden
    let duz = g.index ? g.toNonIndexed() : g;
    if (duz !== g) g.dispose();
    if (kaide) {
      // Kaidenin üçgenleri (bütün köşeleri altSinir'in altında) atılır
      const p0 = duz.getAttribute('position');
      const kalan: number[] = [];
      for (let t = 0; t < p0.count / 3; t++) {
        if (Math.max(p0.getY(t * 3), p0.getY(t * 3 + 1), p0.getY(t * 3 + 2)) < kaide.altSinir) continue;
        for (let k = 0; k < 9; k++) kalan.push(p0.array[t * 9 + k]);
      }
      duz.dispose();
      if (!kalan.length) return;
      duz = new THREE.BufferGeometry();
      duz.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kalan), 3));
      duz.computeBoundingBox();
    }
    duz.computeVertexNormals();
    kutu.union(duz.boundingBox ?? (duz.computeBoundingBox(), duz.boundingBox!));
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const renk = mat?.color ? mat.color.clone() : new THREE.Color('#cccccc');
    const cift = mat?.side === THREE.DoubleSide;
    const anahtar = `${renk.getHexString()}${cift ? 'c' : ''}`;
    const grup = gruplar.get(anahtar) ?? { renk, cift, geo: [] };
    grup.geo.push(duz);
    gruplar.set(anahtar, grup);
  });
  let ucgen = 0;
  const parcalar: HaritaModeli['parcalar'] = [];
  for (const { renk, cift, geo } of gruplar.values()) {
    const birlesik = geo.length > 1 ? mergeGeometries(geo) : geo[0];
    if (geo.length > 1) geo.forEach(x => x.dispose());
    if (!birlesik) continue;
    ucgen += birlesik.getAttribute('position').count / 3;
    parcalar.push({ geo: birlesik, mat: new THREE.MeshLambertMaterial({ color: renk, side: cift ? THREE.DoubleSide : THREE.FrontSide }) });
  }
  const bos = kutu.isEmpty();
  return {
    parcalar, ucgen,
    cx: bos ? 0 : (kutu.min.x + kutu.max.x) / 2, cz: bos ? 0 : (kutu.min.z + kutu.max.z) / 2,
    w: bos ? 1 : Math.max(0.5, kutu.max.x - kutu.min.x), d: bos ? 1 : Math.max(0.5, kutu.max.z - kutu.min.z)
  };
}

