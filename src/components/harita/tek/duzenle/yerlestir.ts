import { rakim, sahneye, type Koleksiyon, type Nokta, type Yapi, type Zemin } from '../tekVeri';
import { hucreAnahtari, icinde, kesimeUzaklik } from './geometri';
import { grupCizimi, kirpilmis, kirpmaAdaylari, yereldenSahneye, yerlesim, type Cesit, type Kirpma, type Yerlesim } from './gruplar';
import { kareBul, yakinKareler, type KareVerisi } from './kareler';
import type { TekTaslak } from './taslak';

/**
 * Hazır grubu yerine oturtma (saf iş). Grup sığmazsa kenar kareleri kırpılır (Kemal,
 * 21 Kasım); en az kırpılan ve dolu yere en az düşen yerleşim seçilir. Hiç sığmasa da
 * konabilir: kalan dolu kareler uyarı olur (yumuşak kural, 22 Kasım).
 */

export interface Yerlestirme {
  cesit: Cesit;
  kirp: Kirpma;
  yer: Yerlesim;
  aci: number;
  yan: 1 | -1;
  /** Dolu yere, yola ya da denize düşen kare sayısı */
  cakisma: number;
  dayanak?: string;
  arsalar: string[];
}

/** Doluluk sorgusu: yapı tabanları ve yol şeritleri (ızgarada) */
export class Doluluk {
  private H = 32;
  private yapi = new Map<number, Yapi[]>();
  private yol = new Map<number, Array<{ id: string; a: Nokta; b: Nokta; yari: number }>>();
  segmentler: Array<{ id: string; a: Nokta; b: Nokta; yari: number }> = [];

  constructor(private z: Zemin, yapilar: Yapi[], yollar: Koleksiyon, haricOn?: string) {
    for (const y of yapilar) {
      if (haricOn && y.id.startsWith(haricOn)) continue;
      for (const k of this.hucreler(y.taban)) { const l = this.yapi.get(k) ?? []; l.push(y); this.yapi.set(k, l); }
    }
    for (const f of yollar.features) {
      const p = f.properties;
      if (f.geometry.type !== 'LineString' || (p.katman !== 'yol' && p.katman !== 'kopru')) continue;
      const id = String(p.id ?? p.yol ?? '');
      if (haricOn && id.startsWith(haricOn)) continue;
      const c = (f.geometry.coordinates as number[][]).map(q => sahneye(z.b, q));
      const yari = (Number(p.genislik) || 4) / 2;
      for (let n = 1; n < c.length; n++) {
        const s = { id, a: c[n - 1], b: c[n], yari };
        this.segmentler.push(s);
        for (const k of this.hucreler([s.a, s.b], yari)) { const l = this.yol.get(k) ?? []; l.push(s); this.yol.set(k, l); }
      }
    }
  }
  private hucreler(h: Nokta[], pay = 0): number[] {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const out: number[] = [];
    for (let i = Math.floor((x0 - pay) / this.H); i <= Math.floor((x1 + pay) / this.H); i++)
      for (let j = Math.floor((z0 - pay) / this.H); j <= Math.floor((z1 + pay) / this.H); j++) out.push(hucreAnahtari(i, j));
    return out;
  }
  doluMu(p: Nokta): boolean {
    const k = hucreAnahtari(Math.floor(p[0] / this.H), Math.floor(p[1] / this.H));
    for (const y of this.yapi.get(k) ?? []) if (icinde(p, y.taban)) return true;
    for (const s of this.yol.get(k) ?? []) if (kesimeUzaklik(p, s.a, s.b).d < s.yari + 1) return true;
    return false;
  }
  /** Noktaya en yakın yol kesimi (`r` m içinde) */
  enYakinYol(p: Nokta, r: number) {
    let en: { s: (typeof this.segmentler)[number]; d: number; x: number; z: number } | null = null;
    const c = Math.ceil(r / this.H);
    const i0 = Math.floor(p[0] / this.H), j0 = Math.floor(p[1] / this.H);
    for (let di = -c; di <= c; di++) for (let dj = -c; dj <= c; dj++) {
      for (const s of this.yol.get(hucreAnahtari(i0 + di, j0 + dj)) ?? []) {
        const u = kesimeUzaklik(p, s.a, s.b);
        if (u.d <= r && (!en || u.d < en.d)) en = { s, d: u.d, x: u.x, z: u.z };
      }
    }
    return en;
  }
  get zemin() { return this.z; }
}

/** Grubun karelerinden kaçı dolu yere, denize düşüyor (kıyı grubunda 0. sıra denize değebilir) */
export function cakismaSay(d: Doluluk, c: Cesit, yer: Yerlesim, kiyi: boolean, K = 8): number {
  let n = 0;
  for (let j = 0; j < c.boy; j++) for (let i = 0; i < c.en; i++) {
    const p = yereldenSahneye(yer, (i + 0.5) * K, (j + 0.5) * K);
    const h = rakim(d.zemin, p[0], p[1]);
    if (kiyi && j === 0) { if (h < -3) n++; continue; }
    if (h <= 0.8 || d.doluMu(p)) n++;
  }
  return n;
}

function arsalariBul(kv: KareVerisi | null | undefined, c: Cesit, yer: Yerlesim, K = 8): string[] {
  if (!kv) return [];
  const { kutu } = grupCizimi(c, yer, K);
  const m: Nokta = [(kutu[0][0] + kutu[2][0]) / 2, (kutu[0][1] + kutu[2][1]) / 2];
  const r = Math.hypot(c.en, c.boy) * K / 2 + K;
  const set = new Set<string>();
  for (const k of yakinKareler(kv, m, r)) if (k.arsa && icinde(k.merkez, kutu)) set.add(k.arsa);
  return [...set].sort();
}

/** Yol kenarına: grup imlecin bulunduğu yanda, 0. sırası yola bitişik */
export function yoldaYerlestir(d: Doluluk, c0: Cesit, p: Nokta, kv?: KareVerisi | null): Yerlestirme | null {
  const y = d.enYakinYol(p, 60);
  if (!y) return null;
  const dx = y.s.b[0] - y.s.a[0], dz = y.s.b[1] - y.s.a[1], l = Math.hypot(dx, dz) || 1;
  const U: Nokta = [dx / l, dz / l];
  const yan: 1 | -1 = (-U[1]) * (p[0] - y.x) + U[0] * (p[1] - y.z) >= 0 ? 1 : -1;
  const aci = Math.atan2(U[1], U[0]);
  const N: Nokta = [-U[1] * yan, U[0] * yan];
  const kenar: Nokta = [y.x + N[0] * (y.s.yari + 1), y.z + N[1] * (y.s.yari + 1)];
  let en: Yerlestirme | null = null;
  for (const k of kirpmaAdaylari(c0)) {
    const c = kirpilmis(c0, k);
    if (!c) continue;
    const W = c.en * 8;
    for (const kay of [0, -8, 8, -16, 16, -24, 24]) {
      if (Math.abs(kay) > W / 2 - 4) continue;
      const o: Nokta = [kenar[0] - U[0] * (W / 2 + kay), kenar[1] - U[1] * (W / 2 + kay)];
      const yer = yerlesim(o, aci, yan);
      const n = cakismaSay(d, c, yer, false);
      if (!en || n < en.cakisma) en = { cesit: c, kirp: k, yer, aci, yan, cakisma: n, dayanak: y.s.id, arsalar: [] };
      if (n === 0) break;
    }
    if (en?.cakisma === 0) break;
  }
  if (en) en.arsalar = arsalariBul(kv, en.cesit, en.yer);
  return en;
}

/** Boş karelere (duzada-kareler.json şeridi): yalnız boş ve boyanmamış kareler sayılır */
export function seritteYerlestir(kv: KareVerisi, t: TekTaslak, c0: Cesit, p: Nokta): Yerlestirme | null {
  const k0 = kareBul(kv, p);
  if (!k0) return null;
  const s = kv.seritler.get(k0.serit)!;
  const ul = Math.hypot(s.u[0], s.u[1]) || 1, nl = Math.hypot(s.n[0], s.n[1]) || 1;
  const U: Nokta = [s.u[0] / ul, s.u[1] / ul], Nn: Nokta = [s.n[0] / nl, s.n[1] / nl];
  const yan: 1 | -1 = -U[1] * Nn[0] + U[0] * Nn[1] >= 0 ? 1 : -1;
  const aci = Math.atan2(U[1], U[0]);
  const bosMu = (j: number, r: number) => {
    const k = s.sutunlar.get(j)?.[r];
    return !!k && k.bos && (!t.kareler[k.id] || t.kareler[k.id] === 'bos');
  };
  let en: (Yerlestirme & { uzak: number }) | null = null;
  for (const k of kirpmaAdaylari(c0)) {
    const c = kirpilmis(c0, k);
    if (!c) continue;
    for (let j0 = k0.j - c.en + 1; j0 <= k0.j; j0++) {
      let n = 0;
      for (let i = 0; i < c.en; i++) for (let r = 0; r < c.boy; r++) if (!bosMu(j0 + i, r)) n++;
      const uzak = Math.abs(j0 + (c.en - 1) / 2 - k0.j);
      if (!en || n < en.cakisma || (n === en.cakisma && uzak < en.uzak && k === en.kirp)) {
        const o: Nokta = [s.o[0] + j0 * s.u[0], s.o[1] + j0 * s.u[1]];
        en = { cesit: c, kirp: k, yer: yerlesim(o, aci, yan), aci, yan, cakisma: n, dayanak: s.id, arsalar: [], uzak };
      }
    }
    if (en?.cakisma === 0) break;
  }
  if (!en) return null;
  const { uzak: _u, ...sonuc } = en;
  return sonuc;
}

/** Kıyıya: 0. sıra kıyı çizgisinde, grup karaya doğru */
export function kiyidaYerlestir(d: Doluluk, c0: Cesit, p: Nokta, kv?: KareVerisi | null): Yerlestirme | null {
  const z = d.zemin;
  const e = 8;
  const gx = rakim(z, p[0] + e, p[1]) - rakim(z, p[0] - e, p[1]);
  const gz = rakim(z, p[0], p[1] + e) - rakim(z, p[0], p[1] - e);
  const gl = Math.hypot(gx, gz);
  if (gl < 0.05) return null;
  const N: Nokta = [gx / gl, gz / gl];
  // Kıyı çizgisi: karadaysa denize doğru, denizdeyse karaya doğru yürünür
  let s: Nokta | null = null;
  const karada = rakim(z, p[0], p[1]) > 0.8;
  for (let t = 0; t <= 240; t += 2) {
    const q: Nokta = karada ? [p[0] - N[0] * t, p[1] - N[1] * t] : [p[0] + N[0] * t, p[1] + N[1] * t];
    const h = rakim(z, q[0], q[1]);
    if (karada ? h <= 0.8 : h > 0.8) { s = q; break; }
  }
  if (!s) return null;
  const U: Nokta = [N[1], -N[0]];
  const aci = Math.atan2(U[1], U[0]);
  let en: Yerlestirme | null = null;
  for (const k of kirpmaAdaylari(c0)) {
    const c = kirpilmis(c0, k);
    if (!c) continue;
    const W = c.en * 8;
    for (const kay of [0, -8, 8, -16, 16]) {
      if (Math.abs(kay) > W / 2 - 4) continue;
      const o: Nokta = [s[0] - U[0] * (W / 2 + kay), s[1] - U[1] * (W / 2 + kay)];
      const yer = yerlesim(o, aci, 1);
      const n = cakismaSay(d, c, yer, true);
      if (!en || n < en.cakisma) en = { cesit: c, kirp: k, yer, aci, yan: 1, cakisma: n, arsalar: [] };
      if (n === 0) break;
    }
    if (en?.cakisma === 0) break;
  }
  if (en) en.arsalar = arsalariBul(kv, en.cesit, en.yer);
  return en;
}

/** Boş karelere konan grubun altındaki arsalar (şerit grubunda yok: yalnız boş kareler) */
export { arsalariBul };
