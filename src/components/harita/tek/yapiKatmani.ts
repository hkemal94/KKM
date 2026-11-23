import * as THREE from 'three';
import { modelYukle } from '../../../lib/modelYukle';
import { hazirla, type HaritaModeli } from '../modelHazirla';
import type { Yapi } from './tekVeri';
import { uzakModelleriBirak, type UzakModel } from './uzakModeller';

/**
 * Tek harita yapıları (`duzada-yapilar.geojson`, 1247 yapı). Yalnız KKM'nin
 * kendi modelleri (`public/modeller/`).
 *
 * - Uzaktaki yapı modelinin az üçgenli kopyasıyla (6b, 22 Kasım; `uzakModeller.ts`):
 *   çatı biçimi, renkler, pencere sıraları kalır. 600 m'lik her karodaki kopyalar tek
 *   çizimde (ekran dışındaki karo çizilmez). Bakılan yerden uzak karolar ve çok uzaktan
 *   bakışta bütün karolar daha da az üçgenli sürümle; hafif modda bu sınır daha yakın.
 *   Kopyalar gölge düşürmez.
 * - Modeli olmayan yapı basit bir kutu (gövde + kiremit çatı katmanı).
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
const HAFIF: Ayar = { yaricap: 320, kameraEsigi: 1500, butce: 260_000 };
const TAHMIN = 12_000;
/** Bu uzaklıktan (kamera–hedef, m) sonra bütün karolar en az üçgenli sürümle */
const COK_UZAK = 6000;
/** Bakılan yere bu kadar (m) yakın karo daha ayrıntılı sürümle (normal, hafif; hafifte hep en az üçgenli) */
const AYRINTILI_KARO = { normal: 2500, hafif: 0 };

/** Uzak kopyaların karo ölçüsü (m): karo tek çizim, ekran dışındaki karo çizilmez */
const KARO = 600;

/**
 * Bir seviyedeki uzak kopyalar: her karodaki bütün yapılar tek parçada (köşe
 * renkli). Bir yapının köşeleri karoda art arda; modeliyle çizilen yapı karonun
 * dizininden çıkarılır.
 */
type UzakKaro = { mesh: THREE.Mesh; aralik: Map<number, [number, number]>; kose: number; x: number; z: number };
type UzakSeviye = { grup: THREE.Group; karolar: Map<string, UzakKaro>; yapiKarosu: Map<number, string>; ucgen: number; gizli: Set<number> };

const sinirla = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class YapiKatmani {
  grup = new THREE.Group();
  /** Dokunma için: viki bağlı ve evinde oturan olan yapıların görünmez kutuları (`userData.yapi`) */
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
  /** Uzak kopyası olan yapılar (kutusu hiç çizilmez) */
  private uzakli = new Set<number>();
  private uzakSeviyeler: Array<UzakSeviye | null> = [null, null];
  /** Uzak kopyaların malzemesi: köşe renkli, düz gölgeli (yüz yönü ekranda hesaplanır) */
  private uzakMalzeme = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  constructor(private yapilar: Yapi[], private uzak: Map<string, UzakModel> | null, private onDegisti: () => void) {
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
      const uzakli = !!(y.dosya && uzak?.has(y.dosya));
      if (uzakli) this.uzakli.add(i);
      const sifir = new THREE.Matrix4().makeScale(0, 0, 0);
      this.govde.setMatrixAt(i, uzakli ? sifir : m); this.cati.setMatrixAt(i, uzakli ? sifir : c);
      this.govde.setColorAt(i, renk.set(GOVDE[y.tur] ?? GOVDE.ev));
      if (y.vikiId || y.oturanli) {
        const s = new THREE.Mesh(kutu, new THREE.MeshBasicMaterial({ visible: false }));
        s.applyMatrix4(new THREE.Matrix4().makeTranslation(y.merkez[0], y.kot, y.merkez[1]).multiply(r)
          .multiply(new THREE.Matrix4().makeScale(Math.max(8, y.en), Math.max(6, y.yukseklik), Math.max(8, y.boy))));
        s.userData.yapi = y.id;
        this.secim.add(s);
      }
    });
    this.govde.castShadow = this.cati.castShadow = true;
    this.govde.receiveShadow = true;
    this.govde.computeBoundingSphere(); this.cati.computeBoundingSphere();
    this.grup.add(this.govde, this.cati, this.secim);
  }

  /** Bir seviyenin uzak kopyaları (ilk gerektiğinde kurulur) */
  private uzakSeviye(n: number): UzakSeviye {
    const var_ = this.uzakSeviyeler[n];
    if (var_) return var_;
    const s: UzakSeviye = { grup: new THREE.Group(), karolar: new Map(), yapiKarosu: new Map(), ucgen: 0, gizli: new Set() };
    // Karolara dağıt, karo başına köşe sayısı
    const karoYapilari = new Map<string, number[]>();
    for (const i of this.uzakli) {
      const y = this.yapilar[i];
      const a = `${Math.floor(y.merkez[0] / KARO)},${Math.floor(y.merkez[1] / KARO)}`;
      const l = karoYapilari.get(a) ?? []; l.push(i); karoYapilari.set(a, l);
      s.yapiKarosu.set(i, a);
    }
    const v = new THREE.Vector3();
    for (const [a, l] of karoYapilari) {
      let toplam = 0;
      for (const i of l) for (const p of this.uzak!.get(this.yapilar[i].dosya!)!.seviyeler[n]) toplam += p.geo.getAttribute('position').count;
      const konum = new Float32Array(toplam * 3), renk = new Uint8Array(toplam * 3);
      const aralik = new Map<number, [number, number]>();
      let k = 0;
      for (const i of l) {
        const y = this.yapilar[i];
        const m = this.uzak!.get(y.dosya!)!;
        const matris = modelMatrisi(y, m);
        const bas = k;
        for (const p of m.seviyeler[n]) {
          const pos = p.geo.getAttribute('position');
          const c = (p.mat as THREE.MeshLambertMaterial).color;
          const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
          for (let q = 0; q < pos.count; q++) {
            v.fromBufferAttribute(pos, q).applyMatrix4(matris);
            konum[k * 3] = v.x; konum[k * 3 + 1] = v.y; konum[k * 3 + 2] = v.z;
            renk[k * 3] = r; renk[k * 3 + 1] = g; renk[k * 3 + 2] = b;
            k++;
          }
        }
        aralik.set(i, [bas, k - bas]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(konum, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(renk, 3, true));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.uzakMalzeme);
      mesh.receiveShadow = true;
      s.grup.add(mesh);
      const [kx, kz] = a.split(',').map(Number);
      s.karolar.set(a, { mesh, aralik, kose: k, x: (kx + 0.5) * KARO, z: (kz + 0.5) * KARO });
      s.ucgen += k / 3;
    }
    this.uzakSeviyeler[n] = s;
    this.grup.add(s.grup);
    return s;
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
    for (const i of this.gizliKutu) if (!gizle.has(i) && !this.uzakli.has(i)) { this.govde.setMatrixAt(i, this.kutuMatris[i]); this.cati.setMatrixAt(i, this.catiMatris[i]); degisti = true; }
    for (const i of gizle) if (!this.gizliKutu.has(i) && !this.uzakli.has(i)) { this.govde.setMatrixAt(i, sifir); this.cati.setMatrixAt(i, sifir); degisti = true; }
    this.gizliKutu = gizle;
    if (degisti) { this.govde.instanceMatrix.needsUpdate = true; this.cati.instanceMatrix.needsUpdate = true; this.govde.computeBoundingSphere(); this.cati.computeBoundingSphere(); }
    this.govde.castShadow = this.cati.castShadow = golge;

    // Uzak kopyalar: her karo bakılan yere uzaklığına göre bir sürümle (yakın karo
    // ayrıntılı); modeliyle çizilen yapının kopyası gizlenir
    let uzakUcgen = 0;
    if (this.uzakli.size) {
      const sinir = kameraUzakligi > COK_UZAK ? -1 : hafif ? AYRINTILI_KARO.hafif : AYRINTILI_KARO.normal;
      const karoSeviyesi = (k: UzakKaro): number => (Math.hypot(k.x - hedef.x, k.z - hedef.z) < sinir ? 0 : 1);
      // Gereken seviyeler kurulur (karo listesi iki seviyede aynı)
      const ilk = this.uzakSeviye(1);
      const gerek = new Set([...ilk.karolar.values()].map(karoSeviyesi));
      for (let n = 0; n < 2; n++) {
        const s = gerek.has(n) ? this.uzakSeviye(n) : this.uzakSeviyeler[n];
        if (!s) continue;
        this.gizliUzakAyarla(s, gizle);
        for (const k of s.karolar.values()) {
          k.mesh.visible = karoSeviyesi(k) === n;
          if (!k.mesh.visible) continue;
          for (const [i, [, adet]] of k.aralik) if (!s.gizli.has(i)) uzakUcgen += adet / 3;
        }
      }
    }
    this.modelli = secilen.length;
    const kutulu = this.yapilar.length - this.uzakli.size - [...gizle].filter(i => !this.uzakli.has(i)).length;
    this.ucgen = toplam + kutulu * 24 + uzakUcgen;
  }

  /** Uzak kopyalarda gizlenecekler (modeliyle çizilenler): değişen karonun dizini yeniden kurulur */
  private gizliUzakAyarla(s: UzakSeviye, gizle: Set<number>) {
    const yeni = new Set([...gizle].filter(i => this.uzakli.has(i)));
    const degisen = new Set<string>();
    for (const i of s.gizli) if (!yeni.has(i)) degisen.add(s.yapiKarosu.get(i)!);
    for (const i of yeni) if (!s.gizli.has(i)) degisen.add(s.yapiKarosu.get(i)!);
    s.gizli = yeni;
    for (const a of degisen) {
      const karo = s.karolar.get(a)!;
      if (![...karo.aralik.keys()].some(i => yeni.has(i))) { karo.mesh.geometry.setIndex(null); continue; }
      const dizin: number[] = [];
      for (const [i, [bas, adet]] of karo.aralik) if (!yeni.has(i)) for (let q = bas; q < bas + adet; q++) dizin.push(q);
      karo.mesh.geometry.setIndex(dizin);
    }
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

  /** `uzakDa`: uzak kopyalar da bırakılsın mı (Düzenle modu katmanı yeniden kurarken kopyaları paylaşır) */
  dispose(uzakDa = true) {
    this.kapandi = true;
    if (this.bekleyen) clearTimeout(this.bekleyen);
    for (const o of this.ornekler) o.dispose();
    for (const u of this.uzakSeviyeler) if (u) for (const k of u.karolar.values()) k.mesh.geometry.dispose();
    this.uzakMalzeme.dispose();
    if (this.uzak && uzakDa) uzakModelleriBirak(this.uzak);
    this.govde.dispose(); this.cati.dispose();
    this.govde.geometry.dispose(); this.cati.geometry.dispose(); (this.govde.material as THREE.Material).dispose(); (this.cati.material as THREE.Material).dispose();
  }
}

/** Modelin +X'i ex yönüne (x doğu, z güney); model ön = +Z */
const donus = (ex: [number, number]) => new THREE.Matrix4().set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);

function modelMatrisi(y: Yapi, m: Pick<HaritaModeli, 'cx' | 'cz' | 'w' | 'd'>): THREE.Matrix4 {
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
