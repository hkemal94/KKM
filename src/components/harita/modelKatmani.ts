import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import { modelYukle } from '../../lib/modelYukle';
import { BAHCE, IMPERIAL_CAPA, modelOlcegi } from '../../lib/binaKutuphanesi';
import type { ModelYeri } from './modelYerlesimi';
import { ARAZI_ABARTI, ARAZI_KAYNAK, setDuvarlari, setSurumu, type DuvarParcasi } from './duzadaArazi';

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
/** Hazır arsa modelinde bina yerinin merkezi (modelYerlesimi.ts ile aynı) */
const BINA_YERI_X = 6.5, BINA_YERI_Z = -4.5;
/** Bir anda en çok kaç park etmiş araba */
const ARABA_EN_COK = 40;
/** Teknelerin oturduğu yükseklik (deniz yüzeyi, biraz batık) */
const DENIZ_KOTU = -0.3;
/** Bahçeler daha yakında (telefon için: yakın bakışta ekrandaki ev sayısı az) */
export const BAHCE_ESIGI = 18;
/** Arsa kenarına dizilen parçalar: modelin başlangıç noktası kenarın üstünde */
const KOSEDEN = new Set([...BAHCE.kenar, ...BAHCE.kapi]);
/** Bir anda çizilen en çok üçgen (telefon için) */
const UCGEN_BUTCESI = 1_400_000;
/** Bilinmeyen (henüz inmemiş) modelin tahmini üçgen sayısı */
const TAHMINI_UCGEN = 15_000;
/** Zemin altında kalan parçalar haritada çizilmez (arsa, deniz, kayalık) */
const ZEMIN_ESIGI = 0.15;

/** Taş duvarların çizildiği en uzak mesafe (metre, bakış merkezinden; telefon için) */
const DUVAR_YARICAP = 450;
/** Ajansın taş tonları: harç (koyu), taşlar, duvar şapkası (açık) */
const TAS_HARC = new THREE.Color('#A8977A');
const TAS_RENKLERI = ['#C9B48F', '#BFA987', '#D6C7A8'].map(r => new THREE.Color(r));
const TAS_SAPKA = new THREE.Color('#D6C7A8');
/** Taş sırasının yüksekliği ve taşın en çok boyu (metre) */
const TAS_SIRA = 0.55, TAS_BOY = 1.1;

/** Sabit sözde rastgele (aynı duvar her çizimde aynı taşları alsın) */
function tasSayisi(a: number, b: number, c: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Set yüzlerinin taş duvarı (5 Kasım akşam, Kemal: "set yüzlerine taş duvar"). Bütün
 * duvarlar tek parça: koyu harç yüzü, önünde biraz dışarı çıkan düzensiz taşlar (sıralar
 * şaşırtmalı, tonlar ajansın taş renklerinden), üstte basamağın eğimini örten açık şapka.
 * `yerel` derece → katmanın metre düzlemi (x doğu, z güney).
 */
function duvarGeometrisi(parcalar: DuvarParcasi[], yerel: (p: [number, number]) => readonly [number, number]): THREE.BufferGeometry | null {
  const konum: number[] = [], renk: number[] = [];
  const dortgen = (a: number[], b: number[], c: number[], d: number[], r: THREE.Color) => {
    konum.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) renk.push(r.r, r.g, r.b);
  };
  const tasRengi = new THREE.Color();
  for (const d of parcalar) {
    const [px, pz] = yerel(d.p), [qx, qz] = yerel(d.q);
    const L = Math.hypot(qx - px, qz - pz);
    if (L < 0.05) continue;
    const ix = d.ic[0], iz = d.ic[1];
    // Uçlarda dip ve üst (abartılı); arası doğrusal
    const a0 = d.alt[0] * ARAZI_ABARTI - 0.6, a1 = d.alt[1] * ARAZI_ABARTI - 0.6;
    const u0 = d.ust[0] * ARAZI_ABARTI + 0.08, u1 = d.ust[1] * ARAZI_ABARTI + 0.08;
    const ux = (qx - px) / L, uz = (qz - pz) / L;
    /** s boyunca, f (0 dip, 1 üst) yükseklikte, yüzden `cik` dışarıda nokta */
    const k = (s: number, f: number, cik = 0) => {
      const t = s / L, y0 = a0 + (a1 - a0) * t, y1 = u0 + (u1 - u0) * t;
      return [px + ux * s - ix * cik, y0 + (y1 - y0) * f, pz + uz * s - iz * cik];
    };
    // Harç yüzü ve şapka; komşu parçayla aralık kalmasın diye iki uçta biraz uzar
    const e = 0.12;
    dortgen(k(-e, 0), k(L + e, 0), k(L + e, 1), k(-e, 1), TAS_HARC);
    const w = d.sapka, [sx0, sy0, sz0] = k(-e, 1), [sx1, sy1, sz1] = k(L + e, 1);
    dortgen([sx0, sy0, sz0], [sx1, sy1, sz1], [sx1 + ix * w, sy1, sz1 + iz * w], [sx0 + ix * w, sy0, sz0 + iz * w], TAS_SAPKA);
    // Taşlar: sıra sıra, her sırada parça boyunca bir ya da iki taş (şaşırtmalı)
    const tohum = d.p[0] * 1e4 + d.p[1] * 3e4;
    const sira = Math.max(1, Math.round(Math.max(u0 - a0, u1 - a1) / TAS_SIRA));
    const fy = 0.035 / Math.max(0.3, Math.min(u0 - a0, u1 - a1));
    for (let r = 0; r < sira; r++) {
      const kes = L > TAS_BOY || r % 2 ? 0.3 + 0.4 * tasSayisi(tohum, r, 1) : 1;
      const araliklar = kes < 1 ? [[0, kes * L], [kes * L, L]] : [[0, L]];
      for (let a = 0; a < araliklar.length; a++) {
        const [s0, s1] = araliklar[a];
        if (s1 - s0 < 0.12) continue;
        const n = tasSayisi(tohum, r, a + 2);
        const cik = 0.03 + 0.06 * n;
        const fa = r / sira + fy, fb = (r + 1) / sira - fy;
        const sa = s0 + 0.04, sb = s1 - 0.04;
        tasRengi.copy(TAS_RENKLERI[Math.floor(n * 7.3) % TAS_RENKLERI.length]).offsetHSL(0, 0, (tasSayisi(tohum, r, a + 9) - 0.5) * 0.06);
        dortgen(k(sa, fa, cik), k(sb, fa, cik), k(sb, fb, cik), k(sa, fb, cik), tasRengi);
      }
    }
  }
  if (!konum.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(konum, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(renk, 3));
  g.computeVertexNormals();
  return g;
}

interface HaritaModeli {
  parcalar: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;
  /** Taban kutusunun merkezi ve ölçüleri (metre) */
  cx: number; cz: number; w: number; d: number;
  ucgen: number;
}


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
  /** Taş duvarlar (tek parça) ve hesaplandıkları set sürümü (-1: henüz hesaplanamadı) */
  private duvar: THREE.Mesh | null = null;
  private duvarMalzemesi = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private duvarSurumu = -1;
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
    map.on('sourcedata', this.araziIndi);
    this.tazele();
  }

  /** Arazi karoları (setler dahil) inince kotlar yeniden okunur; art arda inişlerde bir kez */
  private araziBekliyor = 0;
  private araziIndi = (e: { sourceId?: string }) => {
    if (e.sourceId !== ARAZI_KAYNAK || this.araziBekliyor) return;
    this.araziBekliyor = window.setTimeout(() => { this.araziBekliyor = 0; this.kotDenetle(); }, 400);
  };

  onRemove() {
    this.map?.off('moveend', this.tazele);
    this.map?.off('idle', this.kotDenetle);
    this.map?.off('sourcedata', this.araziIndi);
    if (this.araziBekliyor) { window.clearTimeout(this.araziBekliyor); this.araziBekliyor = 0; }
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
    if (this.duvar) { this.sahne.remove(this.duvar); this.duvar.geometry.dispose(); this.duvar = null; }
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
    const z = map.getZoom();
    let araba = 0;
    const adaylar = this.yerler
      .filter(y => (!y.esik || z >= y.esik) && sinir.contains(y.merkez))
      .map(y => ({ y, u: uzaklik(merkez, y.merkez) }))
      .filter(a => a.u <= yaricap)
      .sort((a, b) => a.u - b.u);

    // Bütçe: önce yapılar (yakından uzağa), sonra yakın bakışta bahçeleri
    const bahceli = map.getZoom() >= BAHCE_ESIGI;
    let toplam = 0;
    const secilen: ModelYeri[] = [];
    const indirilecek = new Set<string>();
    const ucgen = (dosya: string, tahmin: number) => this.modeller.get(dosya)?.ucgen ?? tahmin;
    for (const { y } of adaylar) {
      // Park etmiş arabalar telefon için sınırlı
      if (y.esik && ++araba > ARABA_EN_COK) continue;
      // Tekne arazinin üstüne düşüyorsa (kıyı yamacı) çizilmez
      if (y.deniz && (map.queryTerrainElevation(y.merkez) ?? 0) > 1) continue;
      const u = ucgen(y.dosya, TAHMINI_UCGEN);
      if (toplam + u > UCGEN_BUTCESI) continue;
      toplam += u;
      if (this.modeller.has(y.dosya)) secilen.push(y); else indirilecek.add(y.dosya);
    }
    const bahceler = new Set<string>();
    if (bahceli) {
      for (const y of secilen) {
        if (!y.bahce) continue;
        const dosyalar = [...(y.bahce.arsa ? [y.bahce.arsa] : []), ...y.bahce.parcalar.map(p => p.dosya)];
        const u = dosyalar.reduce((t, d) => t + ucgen(d, d === y.bahce?.arsa ? TAHMINI_UCGEN : 400), 0);
        if (toplam + u > UCGEN_BUTCESI) continue;
        toplam += u;
        const eksik = dosyalar.filter(d => !this.modeller.has(d));
        eksik.forEach(d => indirilecek.add(d));
        if (!eksik.length) bahceler.add(y.id);
      }
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
    const ekle = (dosya: string, m: THREE.Matrix4) => {
      const l = matrisler.get(dosya) ?? [];
      l.push(m);
      matrisler.set(dosya, l);
    };
    /** Yerel konum (metre) */
    const yerel = (p: [number, number]) => {
      const mc = maplibregl.MercatorCoordinate.fromLngLat(p, 0);
      return [(mc.x - koken.x) / s, (mc.y - koken.y) / s] as const;
    };
    /** Döndürme: modelin +X'i ex yönüne (metre düzleminde x doğu, y güney) */
    const donus = (ex: [number, number]) => new THREE.Matrix4().set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);
    const yerlestir = (p: [number, number], kot: number, ex: [number, number], olcek: [number, number, number], capa: [number, number]) => {
      const [px, pz] = yerel(p);
      return new THREE.Matrix4().makeTranslation(px, kot, pz).multiply(donus(ex))
        .multiply(new THREE.Matrix4().makeScale(...olcek)).multiply(new THREE.Matrix4().makeTranslation(-capa[0], 0, -capa[1]));
    };
    for (const y of secilen) {
      const m = this.modeller.get(y.dosya)!;
      let ex = y.ex, sx = 1, sy = 1, sz = 1, ax = m.cx, az = m.cz;
      if (y.imperial) {
        sx = sy = sz = y.imperial.olcek; ax = 0; az = IMPERIAL_CAPA.z;
      } else if (y.capa) {
        sx = sy = sz = y.capa.olcek; ax = y.capa.x; az = y.capa.z;
      } else if (y.kokten) {
        ax = 0; az = 0;
      } else if (y.en > 0 && y.boy > 0) {
        let en = y.en, boy = y.boy;
        // Modelin uzun kenarı tabanın uzun kenarına gelsin
        if (!y.yonSabit && (m.w >= m.d) !== (en >= boy) && Math.abs(en - boy) > 0.15 * Math.max(en, boy)) {
          ex = [-ex[1], ex[0]]; [en, boy] = [boy, en];
        }
        // Önü yola baksın (Kemal, 4 Kasım): uzun kenar hizası korunur, ters çevrilir;
        // taban kareye yakınsa dört yönden yola en çok bakanı
        if (y.yol && !y.yonSabit) {
          const kare = Math.abs(en - boy) <= 0.15 * Math.max(en, boy);
          const adaylar: Array<{ e: [number, number]; en: number; boy: number }> = [
            { e: ex, en, boy }, { e: [-ex[0], -ex[1]], en, boy },
            ...(kare ? [{ e: [-ex[1], ex[0]] as [number, number], en: boy, boy: en }, { e: [ex[1], -ex[0]] as [number, number], en: boy, boy: en }] : [])
          ];
          // Model ön = +Z; metre düzleminde +Z yönü (-e.y, e.x)
          const bakis = (e: [number, number]) => -e[1] * y.yol![0] + e[0] * y.yol![1];
          const en_iyi = adaylar.reduce((a, b) => (bakis(b.e) > bakis(a.e) ? b : a));
          ex = en_iyi.e; en = en_iyi.en; boy = en_iyi.boy;
        }
        // Özel bina kendi boyunda, tabana sığmazsa orantılı küçülür; öbürleri tabana göre
        [sx, sy, sz] = modelOlcegi(m.w, m.d, en, boy, y.tekOlcek);
      }
      const kot = this.kotBul(y);
      yeniKotlar.set(y.id, kot);
      ekle(y.dosya, yerlestir(y.merkez, kot, ex, [sx, sy, sz], [ax, az]));
      gizlenen.push(...y.gizle);

      // Bahçe: hazır arsa evle aynı başlangıç köşesinden; parçalar kendi yerlerinde
      if (!y.bahce || !bahceler.has(y.id)) continue;
      // Arsa modeli bina yeri tabanın merkezine (sığıp sığmadığı bu yerleşimle denetlendi)
      if (y.bahce.arsa) ekle(y.bahce.arsa, yerlestir(y.merkez, kot, ex, [1, 1, 1], [BINA_YERI_X, BINA_YERI_Z]));
      for (const p of y.bahce.parcalar) {
        const pm = this.modeller.get(p.dosya)!;
        if (KOSEDEN.has(p.dosya)) {
          // Kenar ve kapı: x 0'dan başlar, arsa kenarı boyunca; kendi noktasında araziye
          const k = this.map?.queryTerrainElevation(p.merkez) ?? kot;
          ekle(p.dosya, yerlestir(p.merkez, k, p.ex, [p.sx ?? 1, 1, 1], [0, 0]));
        } else {
          ekle(p.dosya, yerlestir(p.merkez, kot, p.ex, [1, 1, 1], [pm.cx, pm.cz]));
        }
      }
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
    // Set yüzlerinin taş duvarları: bakış merkezine yakın, görünen alanda
    const r = Math.min(yaricap, DUVAR_YARICAP);
    const kxm = 111_320 * Math.cos((merkez[1] * Math.PI) / 180);
    const dl = r / kxm, de = r / 111_320;
    const duvarlar = setDuvarlari(
      Math.max(sinir.getWest(), merkez[0] - dl), Math.max(sinir.getSouth(), merkez[1] - de),
      Math.min(sinir.getEast(), merkez[0] + dl), Math.min(sinir.getNorth(), merkez[1] + de));
    this.duvarSurumu = duvarlar ? duvarlar.surum : -1;
    const dg = duvarlar ? duvarGeometrisi(duvarlar.parcalar, yerel) : null;
    if (dg) {
      this.duvar = new THREE.Mesh(dg, this.duvarMalzemesi);
      this.duvar.frustumCulled = false;
      this.sahne.add(this.duvar);
    }
    this.kotlar = yeniKotlar;
    this.gizliBildir(gizlenen);
    map.triggerRepaint();
  };

  /**
   * Arazi: setli yapılar (5 Kasım) setin kotuna, Imperial ortalamaya, öbürleri (ağaç,
   * araba, kalıp) en alçak noktaya oturur (havada kalmasın)
   */
  private kotBul(y: ModelYeri): number {
    if (y.deniz) return DENIZ_KOTU;
    // Setli yapı (kutusunun yerine model): arazi tabanında düz; set kotu tabanın ortasında
    // okunur (köşesi yola taşan yapıda köşe yolun kotunu verir)
    if (y.gizle.length && !y.imperial && !y.kokten) return this.map?.queryTerrainElevation(y.ornekler[0]) ?? 0;
    const k = y.ornekler.map(p => this.map?.queryTerrainElevation(p) ?? 0);
    return y.imperial ? k.reduce((t, x) => t + x, 0) / k.length : Math.min(...k);
  }

  /**
   * Arazinin ayrıntılı karoları modellerden sonra inebilir: harita durulunca kotlar
   * yeniden okunur, değiştiyse modeller yeniden oturtulur (değişmediyse hiçbir şey olmaz).
   */
  private kotDenetle = () => {
    // Duvarlar henüz hesaplanamadıysa ya da set düzeni değiştiyse yeniden
    if (this.map && this.acik && this.map.getZoom() >= MODEL_ESIGI) {
      const surum = setSurumu();
      if (surum >= 0 && surum !== this.duvarSurumu) { this.tazele(); return; }
    }
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
    if (!this.renderer || (!this.orneklemeler.length && !this.duvar)) return;
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
