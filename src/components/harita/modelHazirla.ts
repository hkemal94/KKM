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

/** Kendi zeminiyle gelen modelin haritadaki kırpması (`tek/modelEsleme.ts` → `MODEL_KIRPMA`) */
export interface KirpmaAyari {
  /** Bu adlardaki parçalar hiç çizilmez */
  atla: ReadonlySet<string>;
  /** Suyun içi: bütün köşeleri `z`'den ileride ve en yükseği `y`'nin altında kalan üçgenler atılır */
  suIci: { z: number; y: number };
  /** Bu adlardaki parçaların kutudaki (x, z aralığı) ve en yükseği `y`'nin altında kalan üçgenleri atılır (modelin kendi merdiveni) */
  kutu?: { adlar: ReadonlySet<string>; x: [number, number]; z: [number, number]; y: number };
  /** Bu adlardaki parçalar `y` kadar aşağı (modelin cep plajı deniz seviyesine) */
  indir?: { adlar: ReadonlySet<string>; y: number };
}

/**
 * Modeli haritaya hazırlar: zemin altı parçalar atılır, aynı renkler tek parçada birleşir.
 * `kirpma` verilirse (The Imperial, 25 Kasım) zemin altı kuralı yerine o kırpılır: adlı parçalar ve suyun
 * içindeki üçgenler atılır, kayalık yar, merdiven, kum cebi kalır.
 */
export function hazirla(sahne: THREE.Object3D, kirpma?: KirpmaAyari): HaritaModeli {
  sahne.updateMatrixWorld(true);
  const gruplar = new Map<string, { renk: THREE.Color; cift: boolean; geo: THREE.BufferGeometry[] }>();
  const kutu = new THREE.Box3();
  sahne.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (kirpma?.atla.has(m.name)) return;
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
    if (kirpma?.indir?.adlar.has(m.name)) g.translate(0, kirpma.indir.y, 0);
    g.computeBoundingBox();
    if (!kirpma && g.boundingBox!.max.y <= ZEMIN_ESIGI) { g.dispose(); return; }
    // Düz gölgeli low-poly: normaller yüzlerden
    let duz = g.index ? g.toNonIndexed() : g;
    if (duz !== g) g.dispose();
    if (kirpma) {
      // Suyun içindeki üçgenler (modelin kendi iskelesi, kayıklar, sudaki kayalar) atılır
      const p0 = duz.getAttribute('position');
      const kalan: number[] = [];
      const { z: sz, y: sy } = kirpma.suIci;
      for (let t = 0; t < p0.count / 3; t++) {
        if (Math.min(p0.getZ(t * 3), p0.getZ(t * 3 + 1), p0.getZ(t * 3 + 2)) > sz
          && Math.max(p0.getY(t * 3), p0.getY(t * 3 + 1), p0.getY(t * 3 + 2)) < sy) continue;
        const k = kirpma.kutu?.adlar.has(m.name) ? kirpma.kutu : undefined;
        if (k && [0, 1, 2].every(q => {
          const x = p0.getX(t * 3 + q), zz = p0.getZ(t * 3 + q);
          return x >= k.x[0] && x <= k.x[1] && zz >= k.z[0] && zz <= k.z[1];
        }) && Math.max(p0.getY(t * 3), p0.getY(t * 3 + 1), p0.getY(t * 3 + 2)) < k.y) continue;
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

