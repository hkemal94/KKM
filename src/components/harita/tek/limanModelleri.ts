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
 *   veriden (`genislik`).
 * Modeller deniz seviyesinde (kendi başlangıç noktası y = 0). Yakında asıl model,
 * uzakta ve hafif modda az üçgenli kopyası (`uzakModeller.ts`). Yalnız okur.
 */

const ISKELE = 'deniz/ahsap-iskele-duz.glb';
const MENDIREK = 'deniz/mendirek-duz.glb';
/** Bu uzaklığın içinde (bakılan yer ile en yakın iskele ya da mendirek, m) ve normal modda asıl model */
const YAKIN = 1500;
const COK_UZAK = 6000;

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
      if (p.katman === 'iskele' && f.geometry.type === 'Polygon') {
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
      for (let n = 1; n < hat.length; n++) {
        const [ax, az] = hat[n - 1], [bx, bz] = hat[n];
        const l = Math.hypot(bx - ax, bz - az);
        if (l < 0.5) continue;
        const ex: Nokta = [(bx - ax) / l, (bz - az) / l];
        const adet = Math.max(1, Math.round(l / mendirek.w));
        const parca = l / adet;
        for (let a = 0; a < adet; a++) {
          const t = (a + 0.5) * parca;
          // Kıvrımda boşluk kalmasın: parça biraz uzun
          const m = new THREE.Matrix4().makeTranslation(ax + ex[0] * t, 0, az + ex[1] * t).multiply(donus(ex))
            .multiply(new THREE.Matrix4().makeScale((parca + 1.5) / mendirek.w, 1, genislik / mendirek.d))
            .multiply(new THREE.Matrix4().makeTranslation(-mendirek.cx, 0, -mendirek.cz));
          this.yerlesimler.push({ dosya: MENDIREK, matris: m });
        }
      }
    }
  }

  /** Bakılan yere göre asıl model ya da uzak kopya */
  guncelle(hedef: THREE.Vector3, kameraUzakligi: number, hafif: boolean, golge: boolean) {
    if (this.bos) return;
    this.son = { x: hedef.x, z: hedef.z, u: kameraUzakligi, hafif, golge };
    const yakin = !hafif && kameraUzakligi < 2600 && this.noktalar.some(([x, z]) => Math.hypot(hedef.x - x, hedef.z - z) < YAKIN);
    const seviye = hafif || kameraUzakligi > COK_UZAK ? 1 : 0;
    // Her dosya için: asıl model (yakında ve inmişse) ya da uzak kopya
    const parcalar = (d: string) => {
      if (yakin) {
        const m = this.modeller.get(d);
        if (m) return { anahtar: 'asil', parcalar: m.parcalar, ucgen: m.ucgen };
        this.indir(d);
      }
      const u = this.uzak?.get(d);
      if (u) return { anahtar: `uzak${seviye}`, parcalar: u.seviyeler[seviye], ucgen: u.ucgen[seviye] };
      const m = this.modeller.get(d);
      if (m) return { anahtar: 'asil', parcalar: m.parcalar, ucgen: m.ucgen };
      this.indir(d);
      return null;
    };
    const secim = [ISKELE, MENDIREK].map(d => ({ d, p: parcalar(d) }));
    const anahtar = secim.map(x => `${x.d}:${x.p?.anahtar ?? '-'}`).join('|') + `|${this.yerlesimler.length}`;
    if (anahtar !== this.kurulan) {
      this.kurulan = anahtar;
      for (const o of this.ornekler) { this.grup.remove(o); o.dispose(); }
      this.ornekler = [];
      this.ucgen = 0;
      for (const { d, p } of secim) {
        if (!p) continue;
        const l = this.yerlesimler.filter(y => y.dosya === d);
        if (!l.length) continue;
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
        if (!this.olcu.has(d)) { this.olcu.set(d, m); this.yerlestir(); }
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
