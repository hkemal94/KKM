import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * 3B deneme (8 Kasım): Blender'dan gelen Draco sıkıştırmalı arazi parçalarını
 * indirir ve sahneye hazırlar. `modelYukle.ts` (meshopt, oyun modelleri) ayrı
 * kalır; bu yükleyici yalnız 3B deneme görünümünündür.
 *
 * - Aynı dosya bir kez iner: istek sürerken ya da parça yüklüyken ikinci istek
 *   aynı sonucu bekler. Parça bırakılınca (dispose) kaydı da silinir.
 * - Aynı anda en çok 4 indirme; sıradakiler önceliğe göre (küçük sayı önce).
 * - Sıradaki ya da inmekte olan istek iptal edilebilir.
 * - Malzemeler glb'deki rengiyle düz gölgeli (flatShading) Lambert'e çevrilir;
 *   aynı renk bütün parçalarda tek malzemeyi paylaşır. Gölge yok.
 */

/** İptal edilen isteğin hatası; ekranda gösterilmez */
export class IptalHatasi extends Error {
  constructor() { super('iptal'); this.name = 'IptalHatasi'; }
}

type Bekleyen = {
  dosya: string;
  oncelik: number;
  coz: (g: THREE.Group) => void;
  reddet: (e: unknown) => void;
  durdur?: AbortController;
};

const AYNI_ANDA = 4;

export class ParcaYukleyici {
  private readonly gltf: GLTFLoader;
  private readonly draco: DRACOLoader;
  private readonly kayit = new Map<string, Promise<THREE.Group>>();
  private readonly yuklu = new Map<string, THREE.Group>();
  private readonly sira: Bekleyen[] = [];
  private readonly inen = new Set<Bekleyen>();
  private readonly malzemeler = new Map<string, THREE.MeshLambertMaterial>();
  private kapandi = false;
  /** Bugüne kadar inen bayt (sayaç için) */
  indirilen = 0;

  constructor(private readonly kok: string) {
    this.draco = new DRACOLoader();
    this.draco.setDecoderPath('/draco/');
    this.gltf = new GLTFLoader();
    this.gltf.setDRACOLoader(this.draco);
  }

  /** Dosyayı iste; yüklüyse ya da iniyorsa aynı sonuç döner */
  iste(dosya: string, oncelik: number): Promise<THREE.Group> {
    const var_ = this.kayit.get(dosya);
    if (var_) {
      const sirada = this.sira.find(b => b.dosya === dosya);
      if (sirada) sirada.oncelik = Math.min(sirada.oncelik, oncelik);
      return var_;
    }
    const soz = new Promise<THREE.Group>((coz, reddet) => {
      this.sira.push({ dosya, oncelik, coz, reddet });
    });
    this.kayit.set(dosya, soz);
    // Bırakılan ya da iptal edilen istek kayıttan düşer; bir sonraki istek yeniden indirir
    soz.catch(() => { if (this.kayit.get(dosya) === soz) this.kayit.delete(dosya); });
    queueMicrotask(() => this.pompala());
    return soz;
  }

  /** Henüz sahnede olmayan isteği düşür (sıradaysa çıkar, iniyorsa durdur) */
  iptal(dosya: string): void {
    const i = this.sira.findIndex(b => b.dosya === dosya);
    if (i >= 0) {
      const [b] = this.sira.splice(i, 1);
      b.reddet(new IptalHatasi());
      return;
    }
    for (const b of this.inen) if (b.dosya === dosya) b.durdur?.abort();
  }

  /** İstek bekliyor ya da iniyor mu */
  bekliyor(dosya: string): boolean {
    return this.kayit.has(dosya) && !this.yuklu.has(dosya);
  }

  /** Yüklü parçayı boşalt: geometriler silinir (malzemeler paylaşımlı, kapanışta silinir) */
  birak(dosya: string): void {
    const g = this.yuklu.get(dosya);
    if (!g) { this.iptal(dosya); return; }
    g.removeFromParent();
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.yuklu.delete(dosya);
    this.kayit.delete(dosya);
  }

  /** Her şeyi kapat: indirmeler durur, geometri, malzeme ve çözücü silinir */
  kapat(): void {
    this.kapandi = true;
    for (const b of this.sira.splice(0)) b.reddet(new IptalHatasi());
    for (const b of this.inen) b.durdur?.abort();
    for (const d of [...this.yuklu.keys()]) this.birak(d);
    for (const m of this.malzemeler.values()) m.dispose();
    this.malzemeler.clear();
    this.kayit.clear();
    this.draco.dispose();
  }

  private pompala(): void {
    while (!this.kapandi && this.inen.size < AYNI_ANDA && this.sira.length) {
      let en = 0;
      for (let i = 1; i < this.sira.length; i++) if (this.sira[i].oncelik < this.sira[en].oncelik) en = i;
      const [b] = this.sira.splice(en, 1);
      this.inen.add(b);
      void this.indir(b).finally(() => { this.inen.delete(b); this.pompala(); });
    }
  }

  private async indir(b: Bekleyen): Promise<void> {
    b.durdur = new AbortController();
    try {
      const yanit = await fetch(this.kok + b.dosya, { signal: b.durdur.signal });
      if (!yanit.ok) throw new Error(`${b.dosya}: ${yanit.status}`);
      const veri = await yanit.arrayBuffer();
      this.indirilen += veri.byteLength;
      if (this.kapandi || b.durdur.signal.aborted) throw new IptalHatasi();
      const sonuc = await this.gltf.parseAsync(veri, '');
      const grup = sonuc.scene;
      if (this.kapandi || b.durdur.signal.aborted) {
        grup.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
        throw new IptalHatasi();
      }
      this.malzemeyiCevir(grup);
      this.yuklu.set(b.dosya, grup);
      b.coz(grup);
    } catch (e) {
      b.reddet(e instanceof DOMException && e.name === 'AbortError' ? new IptalHatasi() : e);
    }
  }

  private malzemeyiCevir(grup: THREE.Object3D): void {
    grup.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      const eski = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
      const yeni = eski.map(e => {
        const renk = e.color ?? new THREE.Color(1, 1, 1);
        const saydam = e.transparent || e.opacity < 1;
        const anahtar = `${renk.getHexString()}|${e.opacity}|${saydam ? 1 : 0}|${e.side}`;
        let p = this.malzemeler.get(anahtar);
        if (!p) {
          p = new THREE.MeshLambertMaterial({
            color: renk.clone(), flatShading: true, side: e.side,
            transparent: saydam, opacity: e.opacity, depthWrite: !saydam
          });
          this.malzemeler.set(anahtar, p);
        }
        e.dispose();
        return p;
      });
      m.material = Array.isArray(m.material) ? yeni : yeni[0];
    });
  }
}
