import type { FeatureCollection } from 'geojson';

/**
 * Yamaçta set–yol–ev düzeni (5 Kasım, Kemal: "yolları da düzelt, set yap; ev yolla aynı
 * seviyede olsun, set sonrası altta yol, onunla aynı seviyede diğer evler").
 *
 * Saf hesap: arazi karosu üretilirken ham rakımların üstüne biner (`duzadaArazi.ts`).
 * Yol, arsa ve parsel geometrisine dokunmaz; yalnız arazinin yüksekliğini değiştirir.
 *
 * - Yol yüzeyi: her yolun boyuna profili araziyi izler ama yumuşatılır (dalga, basamak
 *   yok); enine kesitte yol düzdür (yükseklik yalnız yol boyunca konuma bağlı).
 * - Ev seti: modeli olan her yapının tabanı (+PAY), arsası ve yola uzanan şeridi tek bir
 *   kotta düz; kot, en yakın yolun o noktadaki yüksekliği. Yoldan bahçe ve ev aynı seviyede.
 * - Setin dışı doğal arazi; aradaki fark yumuşak şev değil, bir piksellik dik basamaktır
 *   (istinat duvarı gibi).
 * - Deniz pikselleri hiç değişmez; karada sonuç denizin altına inmez.
 */

type Nokta = [number, number];

export interface AraziDuzlemi {
  /** Taban merkezi [boylam, enlem] */
  merkez: Nokta;
  /** Tabanın +X ekseni, metre düzleminde (x doğu, y güney), birim */
  ex: Nokta;
  /** Yarı ölçüler (metre), payı katmadan */
  a: number;
  b: number;
  /** Evin arsası [boylam, enlem] halkası: set bütün arsayı kaplar */
  arsa?: Nokta[];
}

export interface YolCizgisi { noktalar: Nokta[]; yarim: number }

const M_ENLEM = 111_320;
/** Tabanın çevresine bırakılan düz pay (metre) */
const PAY = 3;
/** Yol profili örnek aralığı ve yumuşatma yarıçapı (metre) */
const ORNEK = 4;
const YUMUSAK = 28;
/** Yolun kenarından sonra arazinin yola bağlandığı kısa geçiş (metre) */
const YOL_KENAR = 0.5, YOL_GECIS = 1.5;
/** Setin dik kenarı (metre): istinat duvarı gibi dik, ama testere dişi olmasın */
const SET_KENAR = 2.5;
/** Evin önündeki yolu ararken taban ve arsanın ötesine bakılan mesafe (metre) */
const YOL_ARAMA = 25;
/** Karada en düşük yükseklik (metre); deniz kotunun altına inilmez */
const KARA_EN_AZ = 0.3;
const IZGARA = 32;

/** Yarı genişlikler haritadaki çizgi kalınlığına göre (metre) */
const YOL_YARIM: Record<string, number> = { 'ana yol': 5, yol: 4, cadde: 4, sokak: 3.5, toprak: 2.5, merdiven: 2.5 };

/** Çizili veriden yollar (geometrilerine dokunulmaz, yalnız okunur) */
export function yolCizgileri(geo: FeatureCollection): YolCizgisi[] {
  const l: YolCizgisi[] = [];
  for (const f of geo.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.katman !== 'yol') continue;
    const yarim = YOL_YARIM[String(p.tur ?? '')] ?? 3;
    if (f.geometry?.type === 'LineString') l.push({ noktalar: f.geometry.coordinates as Nokta[], yarim });
    else if (f.geometry?.type === 'MultiLineString') f.geometry.coordinates.forEach(c => l.push({ noktalar: c as Nokta[], yarim }));
  }
  return l;
}

interface YolParcasi { x0: number; y0: number; x1: number; y1: number; h0: number; h1: number; yarim: number }
interface EvSeti {
  cx: number; cy: number; ex: Nokta; a: number; b: number; kot: number;
  arsa?: Nokta[];
  /** Yola uzanan şerit: merkezden yol noktasına */
  kopru?: { qx: number; qy: number; L: number; ux: number; uy: number; yari: number };
  x0: number; x1: number; y0: number; y1: number;
}

function icinde(x: number, y: number, h: Nokta[]): boolean {
  let ic = false;
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
    const [xi, yi] = h[i], [xj, yj] = h[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}

/**
 * Bir sürüm için setler ve yol profilleri. Ham rakım okuyucusu verilir
 * (`rakim(boylam, enlem)`, metre); her şey bir kez hesaplanır.
 */
export class AraziSetleri {
  private lng0: number; private lat0: number; private kx: number;
  private yollar: YolParcasi[] = [];
  private izgara = new Map<number, number[]>();
  private setler: EvSeti[] = [];

  constructor(duzlemler: AraziDuzlemi[], cizgiler: YolCizgisi[], private rakim: (lng: number, lat: number) => number, sinir: [number, number, number, number]) {
    const [bati, guney, , kuzey] = sinir;
    this.lng0 = bati; this.lat0 = kuzey;
    this.kx = M_ENLEM * Math.cos((((guney + kuzey) / 2) * Math.PI) / 180);
    for (const c of cizgiler) this.yolEkle(c);
    for (const d of duzlemler) this.setEkle(d);
  }

  /** [boylam, enlem] → genel metre (x doğu, y güney) */
  private m = (p: Nokta): Nokta => [(p[0] - this.lng0) * this.kx, (this.lat0 - p[1]) * M_ENLEM];
  private ham = (x: number, y: number) => this.rakim(this.lng0 + x / this.kx, this.lat0 - y / M_ENLEM);

  private yolEkle(c: YolCizgisi) {
    const p = c.noktalar.map(this.m);
    if (p.length < 2) return;
    // Eşit aralıklı örnekler
    const ornek: Array<{ x: number; y: number; s: number }> = [{ x: p[0][0], y: p[0][1], s: 0 }];
    let s = 0, kalan = ORNEK;
    for (let i = 0; i + 1 < p.length; i++) {
      const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1], L = Math.hypot(dx, dy);
      let t = 0;
      while (L - t >= kalan) {
        t += kalan; s += kalan; kalan = ORNEK;
        ornek.push({ x: p[i][0] + (dx * t) / L, y: p[i][1] + (dy * t) / L, s });
      }
      kalan -= L - t; s += L - t;
    }
    const son = p[p.length - 1];
    if (Math.hypot(son[0] - ornek[ornek.length - 1].x, son[1] - ornek[ornek.length - 1].y) > 0.3) ornek.push({ x: son[0], y: son[1], s });
    // Profil: ham rakım, iki kez kayan ortalama (dalga ve basamak kalmasın)
    const ham = ornek.map(o => this.ham(o.x, o.y));
    let h = ham.slice();
    const n = h.length, r = Math.max(1, Math.round(YUMUSAK / ORNEK));
    for (let tur = 0; tur < 2; tur++) {
      const t = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) t[i + 1] = t[i] + h[i];
      h = h.map((_, i) => { const a = Math.max(0, i - r), b = Math.min(n - 1, i + r); return (t[b + 1] - t[a]) / (b - a + 1); });
    }
    h = h.map((v, i) => (ham[i] > 0 ? Math.max(v, KARA_EN_AZ + 0.2) : v));
    for (let i = 0; i + 1 < n; i++) {
      const parca: YolParcasi = { x0: ornek[i].x, y0: ornek[i].y, x1: ornek[i + 1].x, y1: ornek[i + 1].y, h0: h[i], h1: h[i + 1], yarim: c.yarim };
      const k = this.yollar.push(parca) - 1;
      const pay = c.yarim + YOL_KENAR + YOL_GECIS;
      for (let gx = Math.floor((Math.min(parca.x0, parca.x1) - pay) / IZGARA); gx <= Math.floor((Math.max(parca.x0, parca.x1) + pay) / IZGARA); gx++) {
        for (let gy = Math.floor((Math.min(parca.y0, parca.y1) - pay) / IZGARA); gy <= Math.floor((Math.max(parca.y0, parca.y1) + pay) / IZGARA); gy++) {
          const a = gx * 100_000 + gy;
          const l = this.izgara.get(a);
          if (l) l.push(k); else this.izgara.set(a, [k]);
        }
      }
    }
  }

  /** En yakın yol (orta çizgi): yükseklik ve nokta */
  private yolBul(x: number, y: number, enCok: number): { h: number; qx: number; qy: number; d: number } | null {
    let en: { h: number; qx: number; qy: number; d: number } | null = null;
    const g = Math.ceil(enCok / IZGARA);
    const gx0 = Math.floor(x / IZGARA), gy0 = Math.floor(y / IZGARA);
    const bakilan = new Set<number>();
    for (let gx = gx0 - g; gx <= gx0 + g; gx++) {
      for (let gy = gy0 - g; gy <= gy0 + g; gy++) {
        for (const k of this.izgara.get(gx * 100_000 + gy) ?? []) {
          if (bakilan.has(k)) continue;
          bakilan.add(k);
          const s = this.yollar[k];
          const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L = vx * vx + vy * vy;
          const t = L ? Math.max(0, Math.min(1, ((x - s.x0) * vx + (y - s.y0) * vy) / L)) : 0;
          const qx = s.x0 + t * vx, qy = s.y0 + t * vy, d = Math.hypot(x - qx, y - qy);
          if (d <= enCok && (!en || d < en.d)) en = { h: s.h0 + (s.h1 - s.h0) * t, qx, qy, d };
        }
      }
    }
    return en;
  }

  private setEkle(d: AraziDuzlemi) {
    const [cx, cy] = this.m(d.merkez);
    const arsa = d.arsa?.map(this.m);
    const ar = arsa ? Math.max(...arsa.map(p => Math.hypot(p[0] - cx, p[1] - cy))) : 0;
    const yol = this.yolBul(cx, cy, Math.max(Math.hypot(d.a, d.b), ar) + YOL_ARAMA);
    let kot: number;
    if (yol) kot = yol.h;
    else {
      // Önünde yol yoksa tabanın altındaki ham rakımların ortalaması
      let t = 0, n = 0;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const s = (i / 2) * d.a, u = (j / 2) * d.b;
        t += this.ham(cx + s * d.ex[0] - u * d.ex[1], cy + s * d.ex[1] + u * d.ex[0]); n++;
      }
      kot = t / n;
    }
    if (this.ham(cx, cy) > 0) kot = Math.max(kot, KARA_EN_AZ + 0.2);
    const R = Math.hypot(d.a, d.b) + PAY;
    let x0 = cx - R, x1 = cx + R, y0 = cy - R, y1 = cy + R;
    if (arsa) for (const p of arsa) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    let kopru: EvSeti['kopru'];
    if (yol && yol.d > 0.5) {
      const L = yol.d, ux = (yol.qx - cx) / L, uy = (yol.qy - cy) / L;
      kopru = { qx: yol.qx, qy: yol.qy, L, ux, uy, yari: Math.min(d.a, d.b) };
      x0 = Math.min(x0, yol.qx - kopru.yari); x1 = Math.max(x1, yol.qx + kopru.yari);
      y0 = Math.min(y0, yol.qy - kopru.yari); y1 = Math.max(y1, yol.qy + kopru.yari);
    }
    this.setler.push({ cx, cy, ex: d.ex, a: d.a, b: d.b, kot, ...(arsa ? { arsa } : {}), ...(kopru ? { kopru } : {}), x0, x1, y0, y1 });
  }

  /**
   * Noktanın sete göre durumu: `oncelik` 2 tabanın (+PAY) içi, 1 arsa ya da yola uzanan
   * şerit, 0 dışı; `uzak` setin dışına uzaklık (metre, içeride 0). Kenar bir piksel
   * genişliğinde yumuşatılır ki eğik kenarlar testere dişi gibi basamaklanmasın.
   */
  private sette(s: EvSeti, x: number, y: number): { oncelik: number; uzak: number } {
    const dx = x - s.cx, dy = y - s.cy;
    const u = dx * s.ex[0] + dy * s.ex[1], v = -dx * s.ex[1] + dy * s.ex[0];
    const kutu = Math.hypot(Math.max(0, Math.abs(u) - s.a - PAY), Math.max(0, Math.abs(v) - s.b - PAY));
    if (kutu === 0) return { oncelik: 2, uzak: 0 };
    let uzak = kutu;
    if (s.kopru) {
      const t = dx * s.kopru.ux + dy * s.kopru.uy, w = -dx * s.kopru.uy + dy * s.kopru.ux;
      const k = Math.hypot(Math.max(0, -t, t - s.kopru.L), Math.max(0, Math.abs(w) - s.kopru.yari));
      if (k === 0) return { oncelik: 1, uzak: 0 };
      uzak = Math.min(uzak, k);
    }
    if (s.arsa) {
      if (icinde(x, y, s.arsa)) return { oncelik: 1, uzak: 0 };
      for (let i = 0, j = s.arsa.length - 1; i < s.arsa.length; j = i++) {
        const [ax, ay] = s.arsa[j], [bx, by] = s.arsa[i];
        const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
        uzak = Math.min(uzak, Math.hypot(x - ax - t * vx, y - ay - t * vy));
      }
    }
    return { oncelik: 0, uzak };
  }

  /**
   * Karonun yüksekliklerine setleri ve yolları uygular (yerinde). Karo sınırı derece;
   * piksel satırları kuzeyden güneye.
   */
  uygula(yuk: Float32Array, karo: number, bati: number, dogu: number, kuzey: number, guney: number) {
    const X0 = (bati - this.lng0) * this.kx, X1 = (dogu - this.lng0) * this.kx;
    const Y0 = (this.lat0 - kuzey) * M_ENLEM, Y1 = (this.lat0 - guney) * M_ENLEM;
    const pxX = (X1 - X0) / karo, pxY = (Y1 - Y0) / karo;
    const n = karo * karo;
    const ham = yuk.slice();
    // Setler: önce tabanın içi, sonra arsa / şerit, sonra yumuşak kenar; eşitse en yakın merkez
    const setKot = new Float32Array(n);
    const setAgirlik = new Float32Array(n);
    const setSira = new Float32Array(n).fill(-1);
    const setUzak = new Float32Array(n).fill(Infinity);
    const kenar = Math.max(SET_KENAR, Math.max(pxX, pxY) * 1.2);
    for (const s of this.setler) {
      if (s.x1 + kenar < X0 || s.x0 - kenar > X1 || s.y1 + kenar < Y0 || s.y0 - kenar > Y1) continue;
      const i0 = Math.max(0, Math.floor((s.x0 - kenar - X0) / pxX)), i1 = Math.min(karo - 1, Math.ceil((s.x1 + kenar - X0) / pxX));
      const j0 = Math.max(0, Math.floor((s.y0 - kenar - Y0) / pxY)), j1 = Math.min(karo - 1, Math.ceil((s.y1 + kenar - Y0) / pxY));
      for (let j = j0; j <= j1; j++) {
        const y = Y0 + (j + 0.5) * pxY;
        for (let i = i0; i <= i1; i++) {
          const x = X0 + (i + 0.5) * pxX;
          const k = j * karo + i;
          const d = this.sette(s, x, y);
          if (d.uzak >= kenar) continue;
          const t = 1 - d.uzak / kenar;
          const w = t * t * (3 - 2 * t);
          const sira = d.oncelik * 2 + w;
          const u = Math.hypot(x - s.cx, y - s.cy);
          if (sira < setSira[k] || (sira === setSira[k] && u >= setUzak[k])) continue;
          setSira[k] = sira; setUzak[k] = u; setKot[k] = s.kot; setAgirlik[k] = w;
        }
      }
    }
    // Yollar: piksel en yakın yolun profiline; enine düz
    const yolKot = new Float32Array(n);
    const yolKenar = new Float32Array(n).fill(Infinity);
    const pay = 6 + YOL_KENAR + YOL_GECIS;
    const parcalar = new Set<number>();
    for (let gx = Math.floor((X0 - pay) / IZGARA); gx <= Math.floor((X1 + pay) / IZGARA); gx++) {
      for (let gy = Math.floor((Y0 - pay) / IZGARA); gy <= Math.floor((Y1 + pay) / IZGARA); gy++) {
        for (const k of this.izgara.get(gx * 100_000 + gy) ?? []) parcalar.add(k);
      }
    }
    for (const k of parcalar) {
      const s = this.yollar[k];
      const e = s.yarim + YOL_KENAR + YOL_GECIS;
      const i0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - e - X0) / pxX)), i1 = Math.min(karo - 1, Math.ceil((Math.max(s.x0, s.x1) + e - X0) / pxX));
      const j0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - e - Y0) / pxY)), j1 = Math.min(karo - 1, Math.ceil((Math.max(s.y0, s.y1) + e - Y0) / pxY));
      if (i0 > i1 || j0 > j1) continue;
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L = vx * vx + vy * vy;
      for (let j = j0; j <= j1; j++) {
        const y = Y0 + (j + 0.5) * pxY;
        for (let i = i0; i <= i1; i++) {
          const x = X0 + (i + 0.5) * pxX;
          const t = L ? Math.max(0, Math.min(1, ((x - s.x0) * vx + (y - s.y0) * vy) / L)) : 0;
          const kenar = Math.hypot(x - s.x0 - t * vx, y - s.y0 - t * vy) - s.yarim;
          const p = j * karo + i;
          if (kenar >= yolKenar[p]) continue;
          yolKenar[p] = kenar; yolKot[p] = s.h0 + (s.h1 - s.h0) * t;
        }
      }
    }
    for (let k = 0; k < n; k++) {
      // Deniz değişmez
      if (ham[k] <= 0) continue;
      let h = ham[k] + (setKot[k] - ham[k]) * setAgirlik[k];
      const e = yolKenar[k];
      if (e < YOL_KENAR + YOL_GECIS) {
        const x = e <= YOL_KENAR ? 1 : 1 - (e - YOL_KENAR) / YOL_GECIS;
        const w = x * x * (3 - 2 * x);
        h += (yolKot[k] - h) * w;
      }
      yuk[k] = Math.max(h, KARA_EN_AZ);
    }
  }
}
