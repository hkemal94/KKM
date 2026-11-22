import * as THREE from 'three';
import { modelYukle } from '../../../lib/modelYukle';
import { hazirla, type HaritaModeli } from '../modelHazirla';
import type { Yapi } from './tekVeri';

/**
 * Tek harita yapıları (`duzada-yapilar.geojson`, 1247 yapı). Yalnız KKM'nin
 * kendi modelleri (`public/modeller/`).
 *
 * - Uzaktaki her yapı basit bir kutu (gövde + kiremit çatı katmanı); hepsi iki
 *   çizimde (three'nin çoklu örneği).
 * - Bakılan yerin çevresindeki yapılar kendi modeliyle; aynı model bir kez iner,
 *   aynı modeldeki bütün yapılar onu paylaşır. Üçgen bütçesi dolunca kalanı kutu.
 * - Viki bağlı yapılar normal modda uzaktan da modeliyle (yer imi gibi).
 * - Hafif mod: daha dar çevre, daha küçük bütçe, gölge yok.
 * Kayda hiçbir şey yazılmaz.
 */

const GOVDE: Record<string, string> = {
  ev: '#F1ECE2', dukkanli: '#EBE1CF', ciftlik: '#E4D7BC', yazlik: '#F5F2EB',
  depo: '#CBC2B0', kamu: '#E9E2D4', ozel: '#E7DDCC', kutu: '#DDD3C2', alan: '#BFB6A2'
};
const CATI = '#B8735A';

/** Yapının modeli dosyasına göre mi ölçülür (ev türleri tabana uyar) */
const TABANA_UYAR = new Set(['ev', 'dukkanli', 'ciftlik', 'yazlik', 'depo']);

type Ayar = { yaricap: number; kameraEsigi: number; butce: number };
const NORMAL: Ayar = { yaricap: 700, kameraEsigi: 3000, butce: 900_000 };
const HAFIF: Ayar = { yaricap: 320, kameraEsigi: 1500, butce: 300_000 };
const TAHMIN = 12_000;

const sinirla = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class YapiKatmani {
  grup = new THREE.Group();
  /** Dokunma için: viki bağlı yapıların görünmez kutuları (`userData.yapi`) */
  secim = new THREE.Group();
  ucgen = 0;
  modelli = 0;
  private govde: THREE.InstancedMesh;
  private cati: THREE.InstancedMesh;
  private kutuMatris: THREE.Matrix4[] = [];
  private catiMatris: THREE.Matrix4[] = [];
  private modeller = new Map<string, HaritaModeli>();
  private inenler = new Set<string>();
  private ornekler: THREE.InstancedMesh[] = [];
  private gizliKutu = new Set<number>();
  private son: { x: number; z: number; u: number; hafif: boolean; golge: boolean } | null = null;
  private bekleyen = 0;
  private kapandi = false;

  constructor(private yapilar: Yapi[], private onDegisti: () => void) {
    const kutu = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const n = yapilar.length;
    this.govde = new THREE.InstancedMesh(kutu, new THREE.MeshLambertMaterial(), n);
    // Kırma çatı: dört yüzlü piramit, tabanı 1 x 1
    const catiGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0).toNonIndexed();
    catiGeo.computeVertexNormals();
    this.cati = new THREE.InstancedMesh(catiGeo, new THREE.MeshLambertMaterial({ color: CATI, flatShading: true }), n);
    const renk = new THREE.Color();
    yapilar.forEach((y, i) => {
      const alan = y.tur === 'alan';
      const h = alan ? 0.6 : Math.max(2.8, y.yukseklik * 0.68);
      const catiH = alan || y.tur === 'kutu' ? 0.01 : Math.min(3, 0.3 * Math.min(y.en, y.boy) + 0.6);
      const r = donus(y.ex);
      const m = new THREE.Matrix4().makeTranslation(y.merkez[0], y.kot - 0.5, y.merkez[1]).multiply(r)
        .multiply(new THREE.Matrix4().makeScale(y.en, h + 0.5, y.boy));
      const c = new THREE.Matrix4().makeTranslation(y.merkez[0], y.kot + h, y.merkez[1]).multiply(r)
        .multiply(new THREE.Matrix4().makeScale(y.en * 1.04, catiH, y.boy * 1.04));
      this.kutuMatris.push(m); this.catiMatris.push(c);
      this.govde.setMatrixAt(i, m); this.cati.setMatrixAt(i, c);
      this.govde.setColorAt(i, renk.set(GOVDE[y.tur] ?? GOVDE.ev));
      if (y.vikiId) {
        const s = new THREE.Mesh(kutu, new THREE.MeshBasicMaterial({ visible: false }));
        s.applyMatrix4(new THREE.Matrix4().makeTranslation(y.merkez[0], y.kot, y.merkez[1]).multiply(r)
          .multiply(new THREE.Matrix4().makeScale(Math.max(8, y.en), Math.max(6, y.yukseklik), Math.max(8, y.boy))));
        s.userData.yapi = y.id;
        this.secim.add(s);
      }
    });
    this.govde.castShadow = this.cati.castShadow = true;
    this.govde.receiveShadow = true;
    this.grup.add(this.govde, this.cati, this.secim);
  }

  /** Bakılan yere göre hangi yapı modeliyle çizilsin */
  guncelle(hedef: THREE.Vector3, kameraUzakligi: number, hafif: boolean, golge: boolean) {
    this.son = { x: hedef.x, z: hedef.z, u: kameraUzakligi, hafif, golge };
    const a = hafif ? HAFIF : NORMAL;
    const ucgen = (d: string) => this.modeller.get(d)?.ucgen ?? TAHMIN;
    const yakin = kameraUzakligi < a.kameraEsigi;
    const adaylar = this.yapilar
      .map((y, i) => ({ y, i, u: Math.hypot(y.merkez[0] - hedef.x, y.merkez[1] - hedef.z) }))
      .filter(({ y, u }) => y.dosya && ((yakin && u < a.yaricap) || (!hafif && y.vikiId && kameraUzakligi < 9000)))
      .sort((p, q) => (q.y.vikiId ? 1 : 0) - (p.y.vikiId ? 1 : 0) || p.u - q.u);
    let toplam = 0;
    const secilen: typeof adaylar = [];
    const indir = new Set<string>();
    for (const x of adaylar) {
      const d = x.y.dosya!;
      const u = ucgen(d);
      if (toplam + u > a.butce) continue;
      toplam += u;
      if (this.modeller.has(d)) secilen.push(x); else indir.add(d);
    }
    for (const d of indir) {
      if (this.inenler.has(d)) continue;
      this.inenler.add(d);
      modelYukle(d)
        .then(g => { if (!this.kapandi) { this.modeller.set(d, hazirla(g.scene)); this.sonra(); } })
        .catch(e => console.warn('[tek harita] model inmedi', d, e))
        .finally(() => this.inenler.delete(d));
    }

    // Örnekler yeniden kurulur
    for (const o of this.ornekler) { this.grup.remove(o); o.dispose(); }
    this.ornekler = [];
    const matrisler = new Map<string, THREE.Matrix4[]>();
    const gizle = new Set<number>();
    for (const { y, i } of secilen) {
      const m = this.modeller.get(y.dosya!)!;
      const l = matrisler.get(y.dosya!) ?? [];
      l.push(modelMatrisi(y, m));
      matrisler.set(y.dosya!, l);
      gizle.add(i);
    }
    for (const [d, l] of matrisler) {
      for (const p of this.modeller.get(d)!.parcalar) {
        const o = new THREE.InstancedMesh(p.geo, p.mat, l.length);
        l.forEach((x, k) => o.setMatrixAt(k, x));
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingSphere();
        o.castShadow = golge;
        o.receiveShadow = golge;
        this.grup.add(o);
        this.ornekler.push(o);
      }
    }
    // Modeli çizilen yapının kutusu gizlenir
    const sifir = new THREE.Matrix4().makeScale(0, 0, 0);
    let degisti = false;
    for (const i of this.gizliKutu) if (!gizle.has(i)) { this.govde.setMatrixAt(i, this.kutuMatris[i]); this.cati.setMatrixAt(i, this.catiMatris[i]); degisti = true; }
    for (const i of gizle) if (!this.gizliKutu.has(i)) { this.govde.setMatrixAt(i, sifir); this.cati.setMatrixAt(i, sifir); degisti = true; }
    this.gizliKutu = gizle;
    if (degisti) { this.govde.instanceMatrix.needsUpdate = true; this.cati.instanceMatrix.needsUpdate = true; this.govde.computeBoundingSphere(); this.cati.computeBoundingSphere(); }
    this.govde.castShadow = this.cati.castShadow = golge;
    this.modelli = secilen.length;
    this.ucgen = toplam + (this.yapilar.length - secilen.length) * 24;
  }

  /** Art arda inen modeller için tek yenileme */
  private sonra() {
    if (this.bekleyen) return;
    this.bekleyen = window.setTimeout(() => {
      this.bekleyen = 0;
      const s = this.son;
      if (s && !this.kapandi) { this.guncelle(new THREE.Vector3(s.x, 0, s.z), s.u, s.hafif, s.golge); this.onDegisti(); }
    }, 80);
  }

  /** Model inişi sürüyor mu (ölçüm için) */
  get iniyor() { return this.inenler.size > 0 || this.bekleyen !== 0; }

  dispose() {
    this.kapandi = true;
    if (this.bekleyen) clearTimeout(this.bekleyen);
    for (const o of this.ornekler) o.dispose();
    this.govde.dispose(); this.cati.dispose();
    this.govde.geometry.dispose(); this.cati.geometry.dispose(); (this.govde.material as THREE.Material).dispose(); (this.cati.material as THREE.Material).dispose();
  }
}

/** Modelin +X'i ex yönüne (x doğu, z güney); model ön = +Z */
const donus = (ex: [number, number]) => new THREE.Matrix4().set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);

function modelMatrisi(y: Yapi, m: HaritaModeli): THREE.Matrix4 {
  let sx = 1, sy = 1, sz = 1, ax = m.cx, az = m.cz;
  if (y.dosya!.startsWith('deniz/')) {
    // Kalıp modeli (fener): kendi başlangıç noktası tabanın merkezine, kendi ölçüsünde
    ax = 0; az = 0;
  } else if (TABANA_UYAR.has(y.tur)) {
    // Sıra evde model tabandan geniş (modelEn): gövdeler komşuyla değer
    sx = sinirla((y.modelEn ?? y.en) / m.w, 0.6, 1.8); sz = sinirla(y.boy / m.d, 0.6, 1.8); sy = sinirla(Math.sqrt(sx * sz), 0.7, 1.5);
  } else {
    // Özel yapı: kendi ölçüsünde; taban çok farklıysa (ör. stat sekisi) uydurulur
    const ox = y.en / m.w, oz = y.boy / m.d;
    if (ox > 0.75 && ox < 1.35 && oz > 0.75 && oz < 1.35) { sx = ox; sz = oz; sy = Math.sqrt(ox * oz); }
  }
  return new THREE.Matrix4().makeTranslation(y.merkez[0], y.kot, y.merkez[1]).multiply(donus(y.ex))
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz)).multiply(new THREE.Matrix4().makeTranslation(-ax, 0, -az));
}
