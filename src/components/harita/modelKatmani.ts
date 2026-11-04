import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import { modelYukle } from '../../lib/modelYukle';
import { IMPERIAL_CAPA } from '../../lib/binaKutuphanesi';
import type { ModelYeri } from './modelYerlesimi';

/**
 * Haritada 3B modeller (4 Kasım). MapLibre'nin özel katmanı, three.js ile çizer.
 *
 * - Yalnız yakın bakışta (`MODEL_ESIGI` ve üstü) ve görünür alanda çalışır;
 *   uzak bakışta hiçbir şey indirmez, çizmez.
 * - Aynı model bir kez indirilir; aynı türdeki bütün yapılar onu paylaşır
 *   (her parça için tek çizim: three'nin çoklu örneği).
 * - Telefonda hız için ekrana konan modeller bir üçgen bütçesiyle sınırlı;
 *   bakış merkezine yakın olan önce gelir, bütçe dolunca kalanlar eski kutuda kalır.
 * - Modelin göründüğü yapıların kimliklerini `onGizle`'ye bildirir; harita o
 *   kutuları gizler. Kayda hiçbir şey yazmaz.
 */

export const MODEL_ESIGI = 17;
/** Bir anda çizilen en çok üçgen (telefon için) */
const UCGEN_BUTCESI = 1_400_000;
/** Bilinmeyen (henüz inmemiş) modelin tahmini üçgen sayısı */
const TAHMINI_UCGEN = 15_000;
/** Zemin altında kalan parçalar haritada çizilmez (arsa, deniz, kayalık) */
const ZEMIN_ESIGI = 0.15;

interface HaritaModeli {
  parcalar: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;
  /** Taban kutusunun merkezi ve ölçüleri (metre) */
  cx: number; cz: number; w: number; d: number;
  ucgen: number;
}

const sinirla = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Modeli haritaya hazırlar: zemin altı parçalar atılır, aynı renkler tek parçada birleşir */
function hazirla(sahne: THREE.Object3D): HaritaModeli {
  sahne.updateMatrixWorld(true);
  const gruplar = new Map<string, { renk: THREE.Color; cift: boolean; geo: THREE.BufferGeometry[] }>();
  const kutu = new THREE.Box3();
  sahne.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
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
    if (g.boundingBox!.max.y <= ZEMIN_ESIGI) { g.dispose(); return; }
    // Düz gölgeli low-poly: normaller yüzlerden
    const duz = g.index ? g.toNonIndexed() : g;
    if (duz !== g) g.dispose();
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

/** Kaba uzaklık (metre) */
function uzaklik(a: [number, number], b: [number, number]): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

export class ModelKatmani implements CustomLayerInterface {
  id = 'modeller-3b';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: MLMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private sahne = new THREE.Scene();
  private kamera = new THREE.Camera();
  private koken = { x: 0, y: 0, s: 1 };
  private yerler: ModelYeri[] = [];
  private acik = false;
  private modeller = new Map<string, HaritaModeli>();
  private inenler = new Set<string>();
  private orneklemeler: THREE.InstancedMesh[] = [];
  private gizli = '';
  private tazeleBekliyor = 0;
  /** Çizilen yerlerin arazi kotu: arazi karoları sonradan inince yeniden oturtmak için */
  private kotlar = new Map<string, number>();

  constructor(private onGizle: (kimlikler: string[]) => void) {
    this.sahne.add(new THREE.HemisphereLight(0xfffaf0, 0x8c7a5c, 2.2));
    const gunes = new THREE.DirectionalLight(0xffffff, 1.6);
    gunes.position.set(-0.6, 1, 0.45);
    this.sahne.add(gunes);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    map.on('moveend', this.tazele);
    map.on('idle', this.kotDenetle);
    this.tazele();
  }

  onRemove() {
    this.map?.off('moveend', this.tazele);
    this.map?.off('idle', this.kotDenetle);
    this.temizle();
    this.onGizle([]);
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  /** Çizili veriden çıkan yerler (düzen değişince yeniden verilir) */
  veri(yerler: ModelYeri[]) {
    this.yerler = yerler;
    this.tazele();
  }

  /** "3B modeller" katmanı açık mı */
  ayarla(acik: boolean) {
    if (this.acik === acik) return;
    this.acik = acik;
    this.tazele();
  }

  private temizle() {
    for (const o of this.orneklemeler) { this.sahne.remove(o); o.dispose(); }
    this.orneklemeler = [];
  }

  private gizliBildir(kimlikler: string[]) {
    const anahtar = kimlikler.slice().sort().join('|');
    if (anahtar === this.gizli) return;
    this.gizli = anahtar;
    this.onGizle(kimlikler);
  }

  /** Görünür alandaki yapıları seçer, modelleri indirir, örnekleri kurar */
  tazele = () => {
    const map = this.map;
    if (!map) return;
    if (!this.acik || map.getZoom() < MODEL_ESIGI) {
      if (this.orneklemeler.length) { this.temizle(); map.triggerRepaint(); }
      this.gizliBildir([]);
      return;
    }
    const c = map.getCenter();
    const merkez: [number, number] = [c.lng, c.lat];
    const sinir = map.getBounds();
    // Yakın bakışta ekranın birkaç katı; eğik bakışta ufka kadar gitmesin
    const yaricap = 900 * 2 ** (MODEL_ESIGI - map.getZoom());
    const adaylar = this.yerler
      .filter(y => sinir.contains(y.merkez))
      .map(y => ({ y, u: uzaklik(merkez, y.merkez) }))
      .filter(a => a.u <= yaricap)
      .sort((a, b) => a.u - b.u);

    let toplam = 0;
    const secilen: ModelYeri[] = [];
    const indirilecek = new Set<string>();
    for (const { y } of adaylar) {
      const m = this.modeller.get(y.dosya);
      const u = m ? m.ucgen : TAHMINI_UCGEN;
      if (toplam + u > UCGEN_BUTCESI) continue;
      toplam += u;
      if (m) secilen.push(y); else indirilecek.add(y.dosya);
    }
    for (const dosya of indirilecek) {
      if (this.inenler.has(dosya)) continue;
      this.inenler.add(dosya);
      modelYukle(dosya)
        .then(g => { this.modeller.set(dosya, hazirla(g.scene)); this.sonraTazele(); })
        .catch(e => console.error('[harita] model indirilemedi', dosya, e))
        .finally(() => this.inenler.delete(dosya));
    }

    // Örnekler: kökene göre metre (x doğu, y yukarı, z güney)
    this.temizle();
    const koken = maplibregl.MercatorCoordinate.fromLngLat(merkez, 0);
    const s = koken.meterInMercatorCoordinateUnits();
    this.koken = { x: koken.x, y: koken.y, s };
    const matrisler = new Map<string, THREE.Matrix4[]>();
    const gizlenen: string[] = [];
    const yeniKotlar = new Map<string, number>();
    const B = new THREE.Matrix4(), S = new THREE.Matrix4(), T = new THREE.Matrix4(), A = new THREE.Matrix4();
    for (const y of secilen) {
      const m = this.modeller.get(y.dosya)!;
      let ex = y.ex, sx = 1, sy = 1, sz = 1, ax = m.cx, az = m.cz;
      if (y.imperial) {
        sx = sy = sz = y.imperial.olcek; ax = 0; az = IMPERIAL_CAPA.z;
      } else if (y.en > 0 && y.boy > 0) {
        let en = y.en, boy = y.boy;
        // Modelin uzun kenarı tabanın uzun kenarına gelsin
        if ((m.w >= m.d) !== (en >= boy) && Math.abs(en - boy) > 0.15 * Math.max(en, boy)) {
          ex = [-ex[1], ex[0]]; [en, boy] = [boy, en];
        }
        sx = sinirla(en / m.w, 0.7, 1.5); sz = sinirla(boy / m.d, 0.7, 1.5); sy = sinirla(Math.sqrt(sx * sz), 0.7, 1.5);
      }
      const kot = this.kotBul(y);
      yeniKotlar.set(y.id, kot);
      const mc = maplibregl.MercatorCoordinate.fromLngLat(y.merkez, 0);
      const px = (mc.x - koken.x) / s, pz = (mc.y - koken.y) / s;
      B.set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);
      S.makeScale(sx, sy, sz);
      A.makeTranslation(-ax, 0, -az);
      T.makeTranslation(px, kot, pz);
      const son = new THREE.Matrix4().multiplyMatrices(T, B).multiply(S).multiply(A);
      const l = matrisler.get(y.dosya) ?? [];
      l.push(son);
      matrisler.set(y.dosya, l);
      gizlenen.push(...y.gizle);
    }
    for (const [dosya, l] of matrisler) {
      const m = this.modeller.get(dosya)!;
      for (const p of m.parcalar) {
        const o = new THREE.InstancedMesh(p.geo, p.mat, l.length);
        l.forEach((x, i) => o.setMatrixAt(i, x));
        o.instanceMatrix.needsUpdate = true;
        o.frustumCulled = false;
        this.sahne.add(o);
        this.orneklemeler.push(o);
      }
    }
    this.kotlar = yeniKotlar;
    this.gizliBildir(gizlenen);
    map.triggerRepaint();
  };

  /** Arazi: küçük yapı en alçak noktaya oturur (havada kalmasın); Imperial ortalamaya */
  private kotBul(y: ModelYeri): number {
    const k = y.ornekler.map(p => this.map?.queryTerrainElevation(p) ?? 0);
    return y.imperial ? k.reduce((t, x) => t + x, 0) / k.length : Math.min(...k);
  }

  /**
   * Arazinin ayrıntılı karoları modellerden sonra inebilir: harita durulunca kotlar
   * yeniden okunur, değiştiyse modeller yeniden oturtulur (değişmediyse hiçbir şey olmaz).
   */
  private kotDenetle = () => {
    if (!this.kotlar.size) return;
    const yerler = new Map(this.yerler.map(y => [y.id, y]));
    for (const [id, eski] of this.kotlar) {
      const y = yerler.get(id);
      if (y && Math.abs(this.kotBul(y) - eski) > 0.3) { this.tazele(); return; }
    }
  };

  /** Art arda inen modeller için tek tazeleme */
  private sonraTazele() {
    if (this.tazeleBekliyor) return;
    this.tazeleBekliyor = window.setTimeout(() => { this.tazeleBekliyor = 0; this.tazele(); }, 60);
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.renderer || !this.orneklemeler.length) return;
    const { x, y, s } = this.koken;
    const ana = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const yerel = new THREE.Matrix4().makeTranslation(x, y, 0)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.kamera.projectionMatrix = ana.multiply(yerel);
    this.renderer.resetState();
    this.renderer.render(this.sahne, this.kamera);
  }
}
