import * as THREE from 'three';
import { modelYukle } from '../../../lib/modelYukle';
import { hazirla, type HaritaModeli } from '../modelHazirla';
import { sahneye, type Koleksiyon, type Nokta, type ZeminBasligi } from './tekVeri';
import type { UzakModel } from './uzakModeller';

/**
 * Tek harita: iskele ve mendirek KKM'nin kendi modelleriyle (6b, 22 Kasım; Kemal).
 *
 * `duzada-yapilar.geojson`'da `katman: 'iskele'` ve `katman: 'mendirek'` öğeleri varsa
 * çizilir; yoksa hiçbir şey çizilmez. (Yol dosyasındaki liman öğelerini `yolKatmani.ts`
 * düz blok çizer; burada okunmaz.)
 * - İskele: çokgen dikdörtgenlere ayrılır (T iskelede gövde ve T başı); her dikdörtgen
 *   `deniz/ahsap-iskele-duz` parçalarıyla döşenir, parçalar dikdörtgene uyacak kadar
 *   uzar ya da daralır.
 * - Mendirek: orta çizgisi (`hat`) boyunca `deniz/mendirek-duz` parçaları; genişlik
 *   veriden (`genislik`). Taş iskele (`tur: 'taş'`, `hat` var) de böyle çizilir.
 * Modeller deniz seviyesinde (kendi başlangıç noktası y = 0). Yakında asıl model (yalnız bakılan yere
 * `PARCA_YAKIN` m yakın parçalar), uzakta ve hafif modda az üçgenli kopyası (`uzakModeller.ts`). Yalnız okur.
 * - Mendireğin hafif sürümü (25 Kasım akşam, Kemal: "yapılsın"; `HAFIF_SURUM`): normal modda asıl model yalnız
 *   `ASIL_YAKIN` m yakın parçalarda, `PARCA_YAKIN` m'ye kadar hafif sürüm; hafif modda `HAFIF_MOD_YAKIN` m yakın
 *   parçalar hafif sürümle (eskiden hafif modda hepsi en kaba kopyaydı). İskele parçaları eskisi gibi.
 */

const ISKELE = 'deniz/ahsap-iskele-duz.glb';
const MENDIREK = 'deniz/mendirek-duz.glb';
/** Bu uzaklığın içinde (bakılan yer ile en yakın iskele ya da mendirek, m) ve normal modda asıl model */
const YAKIN = 1500;
const COK_UZAK = 6000;
/**
 * Asıl model yalnız bakılan yere bu kadar (m) yakın parçalarda; öbürleri uzak kopya (25 Kasım, üçgen tavanı:
 * eskiden bir iskeleye yakın bakınca adanın bütün iskele ve mendirek parçaları asıl modelle çiziliyordu, ~565 bin üçgen; DENEME)
 */
const PARCA_YAKIN = 350;

/**
 * Orta ayrıntılı hafif sürüm (25 Kasım akşam): asıl modelin parçaları sadeleştirildi (meshoptimizer, Imperial ve
 * Sürek'teki yol; parça adları, renkler ve taban kutusu aynı, yerleşim asıl modelin ölçüsüyle). Mendirek 9.804 →
 * 1.988 üçgen (200 → 16 KB). Ahşap iskele parçası (1.620 üçgen) sadeleşince tahtaları delik deşik oluyor; onun hafif
 * sürümü yok.
 */
const HAFIF_SURUM: Record<string, string> = { [MENDIREK]: 'deniz/mendirek-duz-hafif.glb' };
/** Normal modda asıl model yalnız bakılan yere bu kadar (m) yakın parçalarda; ötesi `PARCA_YAKIN`'a kadar hafif sürüm (DENEME) */
const ASIL_YAKIN = 120;
/** Hafif modda bakılan yere bu kadar (m) yakın parçalar hafif sürümle, öbürleri en kaba kopyayla (DENEME) */
const HAFIF_MOD_YAKIN = 60;

/** Parçanın çizildiği sürüm: asıl model, hafif sürüm ya da uzak kopyanın iki seviyesi */
type Surum = 'asil' | 'hafif' | 'uzak0' | 'uzak1';
type Kaynak = { anahtar: Surum; parcalar: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>; ucgen: number };

type Yerlesim = { dosya: string; matris: THREE.Matrix4 };

/** Modelin +X'i ex yönüne (x doğu, z güney) */
const donus = (ex: Nokta) => new THREE.Matrix4().set(ex[0], 0, -ex[1], 0, 0, 1, 0, 0, ex[1], 0, ex[0], 0, 0, 0, 0, 1);

export class LimanModelleri {
  grup = new THREE.Group();
  ucgen = 0;
  private yerlesimler: Yerlesim[] = [];
  /** İskele başları ve mendirek noktaları: bakılan yer bunlardan birine yakınsa asıl model (iskeleler ayrı koylarda da olabilir) */
  private noktalar: Nokta[] = [];
  private modeller = new Map<string, HaritaModeli>();
  private ornekler: THREE.InstancedMesh[] = [];
  private son: { x: number; z: number; u: number; hafif: boolean; golge: boolean } | null = null;
  private kurulan = '';
  private kapandi = false;
  /** Asıl modelin ölçüsü (taban kutusu; yerleşim buna göre) */
  private olcu = new Map<string, { cx: number; cz: number; w: number; d: number }>();
  private iskeleler: Dikdortgen[] = [];
  private mendirekler: Array<{ hat: Nokta[]; genislik: number }> = [];

  constructor(b: ZeminBasligi, koleksiyonlar: Koleksiyon[], private uzak: Map<string, UzakModel> | null, private onDegisti: () => void) {
    for (const k of koleksiyonlar) for (const f of k.features) {
      const p = f.properties;
      if (p.katman === 'iskele' && p.tur === 'taş' && Array.isArray(p.hat)) {
        // Taş iskele (İskele'nin eski feribot iskelesi, 24 Kasım): mendirek gibi taş parçalarla, orta çizgisi boyunca
        const hat = (p.hat as number[][]).map(c => sahneye(b, c));
        if (hat.length > 1) this.mendirekler.push({ hat, genislik: Number(p.genislik) || 8 });
      } else if (p.katman === 'iskele' && f.geometry.type === 'Polygon') {
        const halka = (f.geometry.coordinates as number[][][])[0].map(c => sahneye(b, c));
        this.iskeleler.push(...dikdortgenler(halka));
      } else if (p.katman === 'mendirek' && Array.isArray(p.hat)) {
        const hat = (p.hat as number[][]).map(c => sahneye(b, c));
        if (hat.length > 1) this.mendirekler.push({ hat, genislik: Number(p.genislik) || 8 });
      }
    }
    this.noktalar = [...this.iskeleler.map(i => i.bas), ...this.mendirekler.flatMap(m => m.hat)];
    if (!this.noktalar.length) return;
    // Ölçüler önce uzak kopyadan (hemen var); asıl model inince ondan
    for (const d of [ISKELE, MENDIREK]) { const u = uzak?.get(d); if (u) this.olcu.set(d, u); }
    this.yerlestir();
  }

  get bos() { return !this.iskeleler.length && !this.mendirekler.length; }

  /** Parçaların yerleri (modelin ölçüsü bilinince) */
  private yerlestir() {
    this.yerlesimler = [];
    const iskele = this.olcu.get(ISKELE);
    if (iskele) for (const r of this.iskeleler) {
      // Uzun kenar boyunca parçalar; enine sıra sayısı genişliğe göre (en az 1).
      // Modelin boyu Z'de: Z uzun kenara, X enine döner
      const sira = Math.max(1, Math.round(r.genis / 3.2)), adet = Math.max(1, Math.round(r.uzun / iskele.d));
      const ex: Nokta = [r.boy[1], -r.boy[0]];
      for (let s = 0; s < sira; s++) for (let a = 0; a < adet; a++) {
        const t = (a + 0.5) * (r.uzun / adet), e = (s + 0.5) * (r.genis / sira);
        const x = r.bas[0] + r.boy[0] * t + r.yan[0] * e, z = r.bas[1] + r.boy[1] * t + r.yan[1] * e;
        const m = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(donus(ex))
          .multiply(new THREE.Matrix4().makeScale((r.genis / sira) / iskele.w, 1, ((r.uzun / adet) / iskele.d) * 1.02))
          .multiply(new THREE.Matrix4().makeTranslation(-iskele.cx, 0, -iskele.cz));
        this.yerlesimler.push({ dosya: ISKELE, matris: m });
      }
    }
    const mendirek = this.olcu.get(MENDIREK);
    if (mendirek) for (const { hat, genislik } of this.mendirekler) {
      // Hafif kıvrımlı kenarlar (KIRIK'tan az dönen) tek dizi: parçalar hat boyunca eşit aralıkla, her biri iki ucunu
      // birleştiren doğruda (25 Kasım akşam: İskele'nin kıvrık mendireği 30 kısa kenardı, kenar başına bir parça
      // düşüyordu; 141 m'ye 30 sıkışık parça, ~294 bin üçgen; şimdi 7). Keskin köşede dizi bölünür.
      for (const dizi of diziler(hat)) {
        const boy = [0];
        for (let n = 1; n < dizi.length; n++) boy.push(boy[n - 1] + Math.hypot(dizi[n][0] - dizi[n - 1][0], dizi[n][1] - dizi[n - 1][1]));
        const l = boy[boy.length - 1];
        if (l < 0.5) continue;
        // Hat boyunca t metredeki nokta
        const nokta = (t: number): Nokta => {
          let n = 1;
          while (n < boy.length - 1 && boy[n] < t) n++;
          const k = (t - boy[n - 1]) / Math.max(1e-6, boy[n] - boy[n - 1]);
          return [dizi[n - 1][0] + (dizi[n][0] - dizi[n - 1][0]) * k, dizi[n - 1][1] + (dizi[n][1] - dizi[n - 1][1]) * k];
        };
        const adet = Math.max(1, Math.round(l / mendirek.w));
        const parca = l / adet;
        for (let a = 0; a < adet; a++) {
          const [ax, az] = nokta(a * parca), [bx, bz] = nokta((a + 1) * parca);
          const c = Math.max(0.5, Math.hypot(bx - ax, bz - az));
          const ex: Nokta = [(bx - ax) / c, (bz - az) / c];
          // Kıvrımda boşluk kalmasın: parça biraz uzun
          const m = new THREE.Matrix4().makeTranslation((ax + bx) / 2, 0, (az + bz) / 2).multiply(donus(ex))
            .multiply(new THREE.Matrix4().makeScale((c + 1.5) / mendirek.w, 1, genislik / mendirek.d))
            .multiply(new THREE.Matrix4().makeTranslation(-mendirek.cx, 0, -mendirek.cz));
          this.yerlesimler.push({ dosya: MENDIREK, matris: m });
        }
      }
    }
  }

  /** Bakılan yere göre her parça asıl model, hafif sürüm ya da uzak kopya */
  guncelle(hedef: THREE.Vector3, kameraUzakligi: number, hafif: boolean, golge: boolean) {
    if (this.bos) return;
    this.son = { x: hedef.x, z: hedef.z, u: kameraUzakligi, hafif, golge };
    const bolge = kameraUzakligi < 2600 && this.noktalar.some(([x, z]) => Math.hypot(hedef.x - x, hedef.z - z) < YAKIN);
    const kaba: Surum = hafif || kameraUzakligi > COK_UZAK ? 'uzak1' : 'uzak0';
    // Parçanın istenen sürümü (bakılan yere uzaklığına göre)
    const istenen = (y: Yerlesim): Surum => {
      if (!bolge) return kaba;
      const u = Math.hypot(y.matris.elements[12] - hedef.x, y.matris.elements[14] - hedef.z);
      const yerine: Surum = HAFIF_SURUM[y.dosya] ? 'hafif' : hafif ? 'uzak1' : 'asil';
      if (hafif) return u < HAFIF_MOD_YAKIN ? yerine : 'uzak1';
      return u < ASIL_YAKIN ? 'asil' : u < PARCA_YAKIN ? yerine : 'uzak0';
    };
    // Sürüm hazırsa parçaları; inmemişse indirilir (yalnız istenen sürüm)
    const hazir = (d: string, s: Surum, indirsin: boolean): Kaynak | null => {
      if (s === 'asil' || s === 'hafif') {
        const dosya = s === 'asil' ? d : HAFIF_SURUM[d];
        if (!dosya) return null;
        const m = this.modeller.get(dosya);
        if (m) return { anahtar: s, parcalar: m.parcalar, ucgen: m.ucgen };
        if (indirsin) this.indir(dosya);
        return null;
      }
      const u = this.uzak?.get(d), n = s === 'uzak1' ? 1 : 0;
      return u ? { anahtar: s, parcalar: u.seviyeler[n], ucgen: u.ucgen[n] } : null;
    };
    // İstenen sürüm inene kadar bir alttaki (uzak kopya yoksa asıl model)
    const yedek: Record<Surum, Surum[]> = { asil: ['hafif', 'uzak0'], hafif: [kaba], uzak0: ['asil'], uzak1: ['asil'] };
    const sec = (d: string, s: Surum): Kaynak | null => {
      const k = hazir(d, s, true);
      if (k) return k;
      for (const y of yedek[s]) {
        const q = hazir(d, y, y === 'asil');
        if (q) return q;
      }
      return null;
    };
    const gruplar = new Map<string, { d: string; p: Kaynak | null; l: Yerlesim[] }>();
    for (const y of this.yerlesimler) {
      const p = sec(y.dosya, istenen(y));
      const a = `${y.dosya}:${p?.anahtar ?? '-'}`;
      const g = gruplar.get(a) ?? { d: y.dosya, p, l: [] };
      g.l.push(y);
      gruplar.set(a, g);
    }
    const secim = [...gruplar.values()];
    const sira = new Map(this.yerlesimler.map((y, i) => [y, i] as const));
    const anahtar = secim.map(x => `${x.d}:${x.p?.anahtar ?? '-'}:${x.l.map(y => sira.get(y)).join(',')}`).join('|') + `|${this.yerlesimler.length}`;
    if (anahtar !== this.kurulan) {
      this.kurulan = anahtar;
      for (const o of this.ornekler) { this.grup.remove(o); o.dispose(); }
      this.ornekler = [];
      this.ucgen = 0;
      for (const { p, l } of secim) {
        if (!p || !l.length) continue;
        for (const q of p.parcalar) {
          const o = new THREE.InstancedMesh(q.geo, q.mat, l.length);
          l.forEach((y, k) => o.setMatrixAt(k, y.matris));
          o.instanceMatrix.needsUpdate = true;
          o.computeBoundingSphere();
          o.receiveShadow = true;
          this.grup.add(o);
          this.ornekler.push(o);
        }
        this.ucgen += p.ucgen * l.length;
      }
    }
    for (const o of this.ornekler) o.castShadow = golge;
  }

  private inenler = new Set<string>();
  private indir(d: string) {
    if (this.inenler.has(d) || this.modeller.has(d)) return;
    this.inenler.add(d);
    modelYukle(d)
      .then(g => {
        if (this.kapandi) return;
        const m = hazirla(g.scene);
        this.modeller.set(d, m);
        // Ölçü asıl modelden (hafif sürüm aynı taban kutusuyla asıl modelin yerine oturur)
        if ((d === ISKELE || d === MENDIREK) && !this.olcu.has(d)) { this.olcu.set(d, m); this.yerlestir(); }
        const s = this.son;
        if (s) { this.guncelle(new THREE.Vector3(s.x, 0, s.z), s.u, s.hafif, s.golge); this.onDegisti(); }
      })
      .catch(e => console.warn('[tek harita] liman modeli inmedi', d, e))
      .finally(() => this.inenler.delete(d));
  }

  get iniyor() { return this.inenler.size > 0; }

  dispose() {
    this.kapandi = true;
    for (const o of this.ornekler) o.dispose();
    for (const m of this.modeller.values()) for (const p of m.parcalar) { p.geo.dispose(); p.mat.dispose(); }
  }
}

/**
 * Çokgeni (sahne x, z) dikdörtgenlere ayırır: en uzun kenarın yönünde 0,5 m'lik
 * ızgaraya döker, en büyük dikdörtgeni alır, kalanla sürdürür (T iskele: gövde ve
 * T başı). Dönen her dikdörtgen: köşesi, uzun ve kısa kenar yönleri, uzunluk, genişlik.
 */
type Dikdortgen = { bas: Nokta; boy: Nokta; yan: Nokta; uzun: number; genis: number };

function dikdortgenler(halka: Nokta[]): Dikdortgen[] {
  const h = halka.slice();
  if (h.length > 1 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1]) h.pop();
  if (h.length < 3) return [];
  // Yön: en uzun kenar
  let d: Nokta = [1, 0], enUzun = 0;
  for (let n = 0; n < h.length; n++) {
    const a = h[n], b = h[(n + 1) % h.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > enUzun) { enUzun = l; d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  }
  const dik: Nokta = [-d[1], d[0]];
  const yerel = h.map(([x, z]) => [x * d[0] + z * d[1], x * dik[0] + z * dik[1]] as Nokta);
  const t0 = Math.min(...yerel.map(p => p[0])), s0 = Math.min(...yerel.map(p => p[1]));
  const H = 0.5;
  const nt = Math.ceil((Math.max(...yerel.map(p => p[0])) - t0) / H), ns = Math.ceil((Math.max(...yerel.map(p => p[1])) - s0) / H);
  if (nt * ns > 400_000) return [];
  const dolu = new Uint8Array(nt * ns);
  for (let j = 0; j < ns; j++) for (let i = 0; i < nt; i++) if (icinde(yerel, t0 + (i + 0.5) * H, s0 + (j + 0.5) * H)) dolu[j * nt + i] = 1;
  const cikti: Dikdortgen[] = [];
  for (let tur = 0; tur < 8; tur++) {
    // En büyük dolu dikdörtgen (satır satır yükseklik çubukları)
    const yuk = new Int32Array(nt);
    let en = { alan: 0, i0: 0, i1: 0, j0: 0, j1: 0 };
    for (let j = 0; j < ns; j++) {
      for (let i = 0; i < nt; i++) yuk[i] = dolu[j * nt + i] ? yuk[i] + 1 : 0;
      const yigin: number[] = [];
      for (let i = 0; i <= nt; i++) {
        const y = i < nt ? yuk[i] : 0;
        while (yigin.length && yuk[yigin[yigin.length - 1]] >= y) {
          const k = yigin.pop()!;
          const sol = yigin.length ? yigin[yigin.length - 1] + 1 : 0;
          const alan = yuk[k] * (i - sol);
          if (alan > en.alan) en = { alan, i0: sol, i1: i, j0: j - yuk[k] + 1, j1: j + 1 };
        }
        yigin.push(i);
      }
    }
    if (en.alan * H * H < 6) break;
    for (let j = en.j0; j < en.j1; j++) for (let i = en.i0; i < en.i1; i++) dolu[j * nt + i] = 0;
    const a = { t: t0 + en.i0 * H, s: s0 + en.j0 * H }, uT = (en.i1 - en.i0) * H, uS = (en.j1 - en.j0) * H;
    const dunya = (t: number, s: number): Nokta => [t * d[0] + s * dik[0], t * d[1] + s * dik[1]];
    // Uzun kenar boyunca: t mi s mi
    if (uT >= uS) cikti.push({ bas: dunya(a.t, a.s), boy: d, yan: dik, uzun: uT, genis: uS });
    else cikti.push({ bas: dunya(a.t, a.s), boy: dik, yan: d, uzun: uS, genis: uT });
  }
  return cikti;
}

function icinde(h: Nokta[], x: number, y: number) {
  let ic = false;
  for (let n = 0, m = h.length - 1; n < h.length; m = n++) {
    const [xi, yi] = h[n], [xj, yj] = h[m];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}

/** Mendirek hattında bu açıdan (derece) keskin dönen köşede parça dizisi bölünür (DENEME) */
const KIRIK = 10;

/** Hattı keskin köşelerinden dizilere böler (0,5 m'den kısa kenarlar atlanır) */
function diziler(hat: Nokta[]): Nokta[][] {
  const temiz: Nokta[] = [hat[0]];
  for (const p of hat.slice(1)) if (Math.hypot(p[0] - temiz[temiz.length - 1][0], p[1] - temiz[temiz.length - 1][1]) >= 0.5) temiz.push(p);
  const cikti: Nokta[][] = [[temiz[0]]];
  for (let n = 1; n < temiz.length; n++) {
    const d = cikti[cikti.length - 1];
    d.push(temiz[n]);
    if (n < temiz.length - 1) {
      const [ax, az] = temiz[n - 1], [bx, bz] = temiz[n], [cx, cz] = temiz[n + 1];
      const u: Nokta = [bx - ax, bz - az], v: Nokta = [cx - bx, cz - bz];
      const aci = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
      if (aci > KIRIK) cikti.push([temiz[n]]);
    }
  }
  return cikti.filter(d => d.length > 1);
}
