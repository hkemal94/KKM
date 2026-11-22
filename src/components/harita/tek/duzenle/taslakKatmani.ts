import * as THREE from 'three';
import { modelYukle } from '../../../../lib/modelYukle';
import { hazirla, type HaritaModeli } from '../../modelHazirla';
import { rakim, type Nokta, type Zemin } from '../tekVeri';
import type { AlanCizimi, Kucuk } from './birlesik';

/**
 * Düzenle modunun çizimi: boyanan kareler ve grup alanları (zemine yapışık düz yüzey),
 * duvarlar, ağaç ve donatılar (KKM'nin modelleriyle), seçimin çerçevesi, önizleme
 * (konacak bina, grup, çizilen yol), yol noktalarının tutamakları ve uyarı halkaları.
 * Yalnız ekran; kayda bir şey yazmaz.
 */

const YUKARI = 0.35;

export class TaslakKatmani {
  grup = new THREE.Group();
  private alanGrup = new THREE.Group();
  private kucukGrup = new THREE.Group();
  private duvarGrup = new THREE.Group();
  private onizlemeGrup = new THREE.Group();
  private tutamakGrup = new THREE.Group();
  private uyariGrup = new THREE.Group();
  private vurguGrup = new THREE.Group();
  private modeller = new Map<string, HaritaModeli>();
  private inenler = new Set<string>();
  private sonKucukler: Kucuk[] = [];
  private kapandi = false;

  constructor(private z: Zemin, private degisti: () => void) {
    this.grup.add(this.alanGrup, this.duvarGrup, this.kucukGrup, this.vurguGrup, this.onizlemeGrup, this.tutamakGrup, this.uyariGrup);
  }

  private y(x: number, sz: number) { return Math.max(0, rakim(this.z, x, sz)); }

  private temizle(g: THREE.Group) {
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.geometry && !(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
        if (m.material && !(m.userData.paylasilan)) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
        if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
      });
    }
  }

  /** Kareler: her kare dört köşesiyle zemine oturur (karelerin her biri ikiye bölünür) */
  alanlar(liste: AlanCizimi[]) {
    this.temizle(this.alanGrup);
    for (const a of liste) {
      const p: number[] = [];
      for (const k of a.kareler) {
        if (k.length < 3) continue;
        const c = k.map(([x, sz]) => [x, this.y(x, sz) + (a.yukari ?? YUKARI), sz]);
        for (let n = 1; n + 1 < c.length; n++) {
          // Yukarı baksın
          const [ax, , az] = c[0], [bx, , bz] = c[n], [cx, , cz] = c[n + 1];
          const yukari = (bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0;
          const s = yukari ? [c[0], c[n], c[n + 1]] : [c[0], c[n + 1], c[n]];
          for (const q of s) p.push(q[0], q[1], q[2]);
        }
      }
      if (!p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: a.renk, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -10 }));
      m.receiveShadow = true;
      m.renderOrder = 3;
      this.alanGrup.add(m);
    }
  }

  duvarlar(liste: Nokta[][]) {
    this.temizle(this.duvarGrup);
    const p: number[] = [];
    for (const c of liste) for (let n = 1; n < c.length; n++) {
      const [ax, az] = c[n - 1], [bx, bz] = c[n];
      p.push(ax, this.y(ax, az) + 1.4, az, bx, this.y(bx, bz) + 1.4, bz);
    }
    if (!p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.duvarGrup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#B9AE9A' })));
  }

  /** Ağaç ve donatılar: model iner inmez çizilir; aynı model tek çizimde */
  kucukler(liste: Kucuk[]) {
    this.sonKucukler = liste;
    this.temizle(this.kucukGrup);
    const gruplar = new Map<string, Kucuk[]>();
    for (const k of liste) { const l = gruplar.get(k.dosya) ?? []; l.push(k); gruplar.set(k.dosya, l); }
    const m4 = new THREE.Matrix4();
    for (const [dosya, l] of gruplar) {
      const m = this.modeller.get(dosya);
      if (!m) { this.indir(dosya); continue; }
      const matrisler = l.map(k => {
        const r = new THREE.Matrix4().set(k.ex[0], 0, -k.ex[1], 0, 0, 1, 0, 0, k.ex[1], 0, k.ex[0], 0, 0, 0, 0, 1);
        return m4.makeTranslation(k.merkez[0], this.y(k.merkez[0], k.merkez[1]) - 0.1, k.merkez[1]).multiply(r)
          .multiply(new THREE.Matrix4().makeTranslation(-m.cx, 0, -m.cz)).clone();
      });
      for (const pr of m.parcalar) {
        const o = new THREE.InstancedMesh(pr.geo, pr.mat, matrisler.length);
        o.userData.paylasilan = true;
        matrisler.forEach((x, i) => o.setMatrixAt(i, x));
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingSphere();
        o.castShadow = true;
        this.kucukGrup.add(o);
      }
    }
  }

  private indir(dosya: string) {
    if (this.inenler.has(dosya) || this.modeller.has(dosya)) return;
    this.inenler.add(dosya);
    modelYukle(dosya)
      .then(g => { if (this.kapandi) return; this.modeller.set(dosya, hazirla(g.scene)); this.kucukler(this.sonKucukler); this.degisti(); })
      .catch(e => console.warn('[düzenle] model inmedi', dosya, e))
      .finally(() => this.inenler.delete(dosya));
  }

  /**
   * Halka (taban) çizgisi zeminden biraz yukarıda. Çizgi 1 piksel olduğu için kalın
   * halkada merkezden dışa doğru birkaç kat çizilir (uzaktan da görünsün).
   */
  private halka(h: Nokta[], renk: string, yukari = 0.8, kalin = false): THREE.Object3D {
    const p: number[] = [];
    let cx = 0, cz = 0;
    for (const [x, sz] of h) { cx += x; cz += sz; }
    cx /= h.length; cz /= h.length;
    const katlar = kalin ? [0, 0.35, 0.7, 1.05] : [0];
    for (const k of katlar) {
      for (let n = 0; n < h.length; n++) {
        const a = h[n], b = h[(n + 1) % h.length];
        const dis = (q: Nokta): [number, number] => { const dx = q[0] - cx, dz = q[1] - cz, u = Math.hypot(dx, dz) || 1; return [q[0] + (dx / u) * k, q[1] + (dz / u) * k]; };
        const [ax, az] = dis(a), [bx, bz] = dis(b);
        p.push(ax, this.y(ax, az) + yukari, az, bx, this.y(bx, bz) + yukari, bz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: renk, depthTest: !kalin, transparent: kalin, opacity: kalin ? 0.95 : 1 }));
    l.renderOrder = 20;
    return l;
  }

  private cizgi(c: Nokta[], renk: string, yukari = 0.9): THREE.Object3D {
    const p: number[] = [];
    for (const [x, sz] of c) p.push(x, this.y(x, sz) + yukari, sz);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: renk, depthTest: false, transparent: true }));
    l.renderOrder = 21;
    return l;
  }

  /** Çizgi boyunca düz şerit (seçili yol, çizilen yol): uzaktan da görünür */
  private serit(c: Nokta[], renk: string, yari: number, opaklik = 0.55): THREE.Object3D {
    const p: number[] = [];
    for (let n = 1; n < c.length; n++) {
      const [ax, az] = c[n - 1], [bx, bz] = c[n];
      const dx = bx - ax, dz = bz - az, u = Math.hypot(dx, dz) || 1;
      const px = (-dz / u) * yari, pz = (dx / u) * yari;
      const ya = this.y(ax, az) + 0.9, yb = this.y(bx, bz) + 0.9;
      p.push(ax + px, ya, az + pz, bx + px, yb, bz + pz, bx - px, yb, bz - pz, ax + px, ya, az + pz, bx - px, yb, bz - pz, ax - px, ya, az - pz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: opaklik, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    m.renderOrder = 22;
    return m;
  }

  private dolgu(h: Nokta[], renk: string, opaklik: number, yukari = 0.6): THREE.Object3D {
    const p: number[] = [];
    const c = h.map(([x, sz]) => [x, this.y(x, sz) + yukari, sz]);
    for (let n = 1; n + 1 < c.length; n++) p.push(...c[0], ...c[n], ...c[n + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: opaklik, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    m.renderOrder = 19;
    return m;
  }

  /** Seçilenin çerçevesi (yapı tabanı ya da yol çizgisi) */
  vurgu(v: { halkalar?: Nokta[][]; cizgiler?: Nokta[][] } | null) {
    this.temizle(this.vurguGrup);
    if (!v) return;
    for (const h of v.halkalar ?? []) { this.vurguGrup.add(this.halka(h, '#F26B6F', 1.2, true)); this.vurguGrup.add(this.dolgu(h, '#F26B6F', 0.3)); }
    for (const c of v.cizgiler ?? []) { this.vurguGrup.add(this.serit(c, '#F26B6F', 2.2, 0.45)); this.vurguGrup.add(this.cizgi(c, '#F26B6F', 1.1)); }
  }

  /** Önizleme: konacak şeyin çerçevesi, kareleri, çizilen yol */
  onizleme(v: { halkalar?: Array<{ h: Nokta[]; renk: string; opak?: number }>; cizgiler?: Array<{ c: Nokta[]; renk: string }> } | null) {
    this.temizle(this.onizlemeGrup);
    if (!v) return;
    for (const { h, renk, opak } of v.halkalar ?? []) {
      this.onizlemeGrup.add(this.halka(h, renk, 0.9, true));
      if (opak) this.onizlemeGrup.add(this.dolgu(h, renk, opak));
    }
    for (const { c, renk } of v.cizgiler ?? []) { this.onizlemeGrup.add(this.serit(c, renk, 2, 0.5)); this.onizlemeGrup.add(this.cizgi(c, renk)); }
  }

  /** Yol noktalarının tutamakları (seçili nokta kiremit) */
  tutamaklar(noktalar: Nokta[], secili: number | null, olcek: number) {
    this.temizle(this.tutamakGrup);
    if (!noktalar.length) return;
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: '#0E1C4F', depthTest: false });
    const m = new THREE.InstancedMesh(geo, mat, noktalar.length);
    const m4 = new THREE.Matrix4();
    const renk = new THREE.Color();
    noktalar.forEach(([x, sz], i) => {
      m.setMatrixAt(i, m4.compose(new THREE.Vector3(x, this.y(x, sz) + 1.2, sz), new THREE.Quaternion(), new THREE.Vector3(olcek, olcek, olcek)));
      m.setColorAt(i, renk.set(i === secili ? '#F26B6F' : '#0E1C4F'));
    });
    m.renderOrder = 30;
    this.tutamakGrup.add(m);
  }

  /** Uyarı halkaları */
  uyarilar(noktalar: Nokta[], olcek: number) {
    this.temizle(this.uyariGrup);
    for (const [x, sz] of noktalar) {
      const h: Nokta[] = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; h.push([x + Math.cos(a) * olcek, sz + Math.sin(a) * olcek]); }
      this.uyariGrup.add(this.halka(h, '#D9822B', 1.6, true));
    }
  }

  dispose() {
    this.kapandi = true;
    for (const g of [this.alanGrup, this.kucukGrup, this.duvarGrup, this.onizlemeGrup, this.tutamakGrup, this.uyariGrup, this.vurguGrup]) this.temizle(g);
    for (const m of this.modeller.values()) for (const p of m.parcalar) { p.geo.dispose(); p.mat.dispose(); }
  }
}
