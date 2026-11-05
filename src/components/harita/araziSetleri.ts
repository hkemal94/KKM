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
 * - Ev seti: modeli olan her yapının çizilen tabanı (+PAY; yola paralel yönü ve kaydırılmış
 *   yeriyle), parseli (arsa ve haritadaki eski tabanı) ve yola uzanan şeridi tek bir kotta düz;
 *   kot, en yakın yolun o noktadaki yüksekliği. Yoldan bahçe ve ev aynı seviyede.
 * - Setin dışı doğal arazi ya da komşu set; aradaki fark dik bir basamaktır (istinat
 *   duvarı). 5 Kasım akşam (Kemal: "set yüzlerine taş duvar"): `BASAMAK`tan yüksek fark
 *   birden çok basamağa bölünür, aralarında dar bir teras kalır. İki set yan yana
 *   geldiğinde basamaklar alçaktaki setin arka şeridine iner (evin tabanına girmez).
 *   Yol kenarı da aynı basamakla bağlanır. Her basamağın yüzüne taş duvar çizilir
 *   (`duvarlar`, çizim `modelKatmani.ts`).
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
  /** Evin haritadaki tabanı (arsa onu dışarıda bırakır; model başka yere dönse de set kaplar) */
  bina?: Nokta[];
}

export interface YolCizgisi { noktalar: Nokta[]; yarim: number }

/** Taş duvarın bir parçası: yüzün alt çizgisi p→q (derece), yükseklikler metre (abartısız) */
export interface DuvarParcasi {
  p: Nokta; q: Nokta;
  /** Duvarın üstü (yüksek tarafın kotu) ve dibi (alçak tarafın kotu), p ve q uçlarında */
  ust: [number, number]; alt: [number, number];
  /** Yüksek tarafa doğru yatay birim yön, metre düzleminde (x doğu, y güney) */
  ic: Nokta;
  /** Duvarın üstünü örten şapkanın genişliği (metre): basamağın eğimini kapatır */
  sapka: number;
}

const M_ENLEM = 111_320;
/** Tabanın çevresine bırakılan düz pay (metre) */
const PAY = 3;
/** Yol profili örnek aralığı ve yumuşatma yarıçapı (metre) */
const ORNEK = 4;
const YUMUSAK = 28;
/** Yolun kenarından sonra düz kalan şerit (metre); basamak bundan sonra başlar */
const YOL_KENAR = 0.5;
/** Bir basamağın en çok yüksekliği (metre); fazlası yeni basamağa */
const BASAMAK = 4;
/** Basamağın arazideki genişliği ve iki basamak arasındaki teras (metre) */
const SET_KENAR = 1.2, TERAS = 2;
const EN_COK_BASAMAK = 6;
/** Kazıda (set yamacın içinde) basamak setin kenarından bu kadar sonra başlar: duvarın önü düz kalsın */
const KAZI_PAYI = 1.2;
/** En geniş basamak dizisi (metre) */
const GENIS = KAZI_PAYI + EN_COK_BASAMAK * SET_KENAR + (EN_COK_BASAMAK - 1) * TERAS;
/** Duvar yüzünün basamaktan uzaklığı (arazi karosu 1,8 m'lik; eğim yüzün önüne taşmasın) */
const YUZ_PAYI = 0.9;
/** Bundan alçak basamağa duvar çizilmez (metre) */
const EN_AZ_DUVAR = 0.8;
/** Evin önündeki yolu ararken taban ve arsanın ötesine bakılan mesafe (metre) */
const YOL_ARAMA = 25;
/** Karada en düşük yükseklik (metre); deniz kotunun altına inilmez */
const KARA_EN_AZ = 0.3;
const IZGARA = 32;
/** Duvar hesabının parça ve ızgara adımı (metre) */
const DUVAR_PARCA = 48, DUVAR_ADIM = 1;

/** Yarı genişlikler haritadaki çizgi kalınlığına göre (metre) */
export const YOL_YARIM: Record<string, number> = { 'ana yol': 5, yol: 4, cadde: 4, sokak: 3.5, toprak: 2.5, merdiven: 2.5 };

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

/**
 * Basamak dizisi: sahibin kotundan (`kot`, u = 0) dış kota (`dis`) iner ya da çıkar.
 * `BASAMAK`tan yüksek fark birden çok basamağa bölünür (her biri en çok `BASAMAK`, sonuncusu
 * kalanı alır); aralarında `TERAS` genişliğinde düzlük. Fark büyüdükçe sonuç kesintisiz değişir.
 */
interface Basamaklar { n: number; a: number; isaret: number; kazi: boolean }
function basamaklar(dis: number, kot: number, kaziMi: boolean): Basamaklar {
  const fark = dis - kot, a = Math.abs(fark);
  return { n: a < 1e-3 ? 0 : Math.min(EN_COK_BASAMAK, Math.ceil(a / BASAMAK)), a, isaret: Math.sign(fark), kazi: kaziMi };
}
/** i. basamaktan sonraki seviye (sahibin kotundan fark, metre) */
const seviye = (b: Basamaklar, i: number) => (i >= b.n ? b.a : Math.min(i * BASAMAK, b.a));
/** i. basamağın başladığı uzaklık */
const basamakBasi = (b: Basamaklar, i: number) => (b.kazi ? KAZI_PAYI : 0) + i * (SET_KENAR + TERAS);
/** Basamak dizisinin genişliği (metre) */
const diziGenisligi = (b: Basamaklar) => (b.n ? basamakBasi(b, b.n - 1) + SET_KENAR : 0);
/** u uzaklığında yükseklik (sahibin kotundan fark, işaretli) */
function basamakFarki(b: Basamaklar, u: number): number {
  if (!b.n) return 0;
  const adim = SET_KENAR + TERAS;
  const v0 = u - (b.kazi ? KAZI_PAYI : 0);
  if (v0 <= 0) return 0;
  const i = Math.min(b.n - 1, Math.floor(v0 / adim)), v = v0 - i * adim;
  const l0 = seviye(b, i), l1 = seviye(b, i + 1);
  if (v >= SET_KENAR) return b.isaret * l1;
  const s = v / SET_KENAR, w = s * s * (3 - 2 * s);
  return b.isaret * (l0 + (l1 - l0) * w);
}
/** i. basamağın duvar yüzünün uzaklığı: dolguda alçak uçta (dışta), kazıda alçak uçta (içte) */
const yuzUzakligi = (b: Basamaklar, i: number) => (b.kazi ? basamakBasi(b, i) - YUZ_PAYI * 0.9 : basamakBasi(b, i) + SET_KENAR + YUZ_PAYI);

interface YolParcasi { x0: number; y0: number; x1: number; y1: number; h0: number; h1: number; yarim: number; cizgi: number }
interface EvSeti {
  cx: number; cy: number; ex: Nokta; a: number; b: number; kot: number;
  arsa?: Nokta[];
  bina?: Nokta[];
  /** Yola uzanan şerit: merkezden yol noktasına */
  kopru?: { qx: number; qy: number; L: number; ux: number; uy: number; yari: number };
  x0: number; x1: number; y0: number; y1: number;
}

/** Bir noktanın son hâli: yükseklik ve (varsa) basamağın sahibi */
interface NoktaSonucu {
  h: number;
  /** -1 yok; 0.. set; -2 - i i. yol çizgisi */
  sahip: number;
  /** Sahibin kenarından uzaklık (yolda yüzey içi eksi) */
  u: number;
  /** Sahibin kotu ve dış kot (basamaklar bunlardan) */
  kot: number; dis: number;
}

/** Noktanın çevresindeki setler için ara bellek (her piksel için yeniden ayrılmasın) */
const DIS_K = new Int32Array(128), DIS_U = new Float64Array(128);

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
  private setIzgara = new Map<number, number[]>();
  private cizgiSayisi = 0;
  /** Duvar parçaları, DUVAR_PARCA'lık karelerde (bir kez hesaplanır) */
  private duvarOnbellek = new Map<number, DuvarParcasi[]>();

  constructor(duzlemler: AraziDuzlemi[], cizgiler: YolCizgisi[], private rakim: (lng: number, lat: number) => number, sinir: [number, number, number, number]) {
    const [bati, guney, , kuzey] = sinir;
    this.lng0 = bati; this.lat0 = kuzey;
    this.kx = M_ENLEM * Math.cos((((guney + kuzey) / 2) * Math.PI) / 180);
    for (const c of cizgiler) this.yolEkle(c);
    for (const d of duzlemler) this.setEkle(d);
  }

  /** [boylam, enlem] → genel metre (x doğu, y güney) */
  private m = (p: Nokta): Nokta => [(p[0] - this.lng0) * this.kx, (this.lat0 - p[1]) * M_ENLEM];
  private derece = (x: number, y: number): Nokta => [this.lng0 + x / this.kx, this.lat0 - y / M_ENLEM];
  private ham = (x: number, y: number) => this.rakim(this.lng0 + x / this.kx, this.lat0 - y / M_ENLEM);

  private yolEkle(c: YolCizgisi) {
    const p = c.noktalar.map(this.m);
    if (p.length < 2) return;
    const cizgi = this.cizgiSayisi++;
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
      const parca: YolParcasi = { x0: ornek[i].x, y0: ornek[i].y, x1: ornek[i + 1].x, y1: ornek[i + 1].y, h0: h[i], h1: h[i + 1], yarim: c.yarim, cizgi };
      const k = this.yollar.push(parca) - 1;
      const pay = c.yarim + YOL_KENAR + GENIS + 2;
      this.izgaraya(this.izgara, k, Math.min(parca.x0, parca.x1) - pay, Math.max(parca.x0, parca.x1) + pay, Math.min(parca.y0, parca.y1) - pay, Math.max(parca.y0, parca.y1) + pay);
    }
  }

  private izgaraya(iz: Map<number, number[]>, k: number, x0: number, x1: number, y0: number, y1: number) {
    for (let gx = Math.floor(x0 / IZGARA); gx <= Math.floor(x1 / IZGARA); gx++) {
      for (let gy = Math.floor(y0 / IZGARA); gy <= Math.floor(y1 / IZGARA); gy++) {
        const a = gx * 100_000 + gy;
        const l = iz.get(a);
        if (l) l.push(k); else iz.set(a, [k]);
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
    const arsa = d.arsa?.map(this.m), bina = d.bina?.map(this.m);
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
    for (const p of [...(arsa ?? []), ...(bina ?? [])]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    let kopru: EvSeti['kopru'];
    if (yol && yol.d > 0.5) {
      const L = yol.d, ux = (yol.qx - cx) / L, uy = (yol.qy - cy) / L;
      kopru = { qx: yol.qx, qy: yol.qy, L, ux, uy, yari: Math.min(d.a, d.b) };
      x0 = Math.min(x0, yol.qx - kopru.yari); x1 = Math.max(x1, yol.qx + kopru.yari);
      y0 = Math.min(y0, yol.qy - kopru.yari); y1 = Math.max(y1, yol.qy + kopru.yari);
    }
    const k = this.setler.push({ cx, cy, ex: d.ex, a: d.a, b: d.b, kot, ...(arsa ? { arsa } : {}), ...(bina ? { bina } : {}), ...(kopru ? { kopru } : {}), x0, x1, y0, y1 }) - 1;
    const pay = GENIS + YUZ_PAYI + 2;
    this.izgaraya(this.setIzgara, k, x0 - pay, x1 + pay, y0 - pay, y1 + pay);
  }

  /**
   * Noktanın sete göre durumu: `oncelik` 2 tabanın (+PAY) içi, 1 arsa ya da yola uzanan
   * şerit, 0 dışı; `uzak` setin dışına uzaklık (metre, içeride 0).
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
    // Parsel: arsa ve evin eski tabanı (birleşimi); dışarıdaki noktanın uzaklığı ikisinin kenarına
    for (const h of [s.arsa, s.bina]) {
      if (!h) continue;
      if (icinde(x, y, h)) return { oncelik: 1, uzak: 0 };
      for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
        const [ax, ay] = h[j], [bx, by] = h[i];
        const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
        uzak = Math.min(uzak, Math.hypot(x - ax - t * vx, y - ay - t * vy));
      }
    }
    return { oncelik: 0, uzak };
  }

  /**
   * Bir noktanın son yüksekliği (genel metre). Sıra: setin içi (taban, sonra arsa ve şerit;
   * eşitse merkezi yakın olan) → yakındaki daha yüksek setlerin basamakları (setin dışında
   * ya da alçak setin arka şeridinde; tabana girmez) → yol yüzeyi ve yol kenarının basamağı.
   */
  private nokta(x: number, y: number, ham: number): NoktaSonucu {
    if (ham <= 0) return { h: ham, sahip: -1, u: 0, kot: 0, dis: 0 };
    const hucre = Math.floor(x / IZGARA) * 100_000 + Math.floor(y / IZGARA);
    // Setin içi
    let taban = -1, tabanOncelik = 0, tabanUzak = Infinity, disSayi = 0;
    for (const k of this.setIzgara.get(hucre) ?? []) {
      const s = this.setler[k];
      if (x < s.x0 - GENIS - 2 || x > s.x1 + GENIS + 2 || y < s.y0 - GENIS - 2 || y > s.y1 + GENIS + 2) continue;
      const d = this.sette(s, x, y);
      if (d.oncelik > 0) {
        const u = Math.hypot(x - s.cx, y - s.cy);
        if (d.oncelik > tabanOncelik || (d.oncelik === tabanOncelik && u < tabanUzak)) { taban = k; tabanOncelik = d.oncelik; tabanUzak = u; }
      } else if (d.uzak < GENIS + YUZ_PAYI + 1 && disSayi < DIS_K.length) { DIS_K[disSayi] = k; DIS_U[disSayi++] = d.uzak; }
    }
    let h: number, sahip = -1, u = 0, kot = 0, dis = 0;
    if (tabanOncelik === 2) {
      h = this.setler[taban].kot; sahip = taban; kot = h; dis = h;
    } else {
      const B = taban >= 0 ? this.setler[taban].kot : ham;
      h = B;
      if (taban >= 0) { sahip = taban; kot = B; dis = B; }
      // Basamaklar: en yakın kenar; alçak setin şeridine yalnız daha yüksek set iner
      let enUzak = Infinity;
      for (let z = 0; z < disSayi; z++) {
        const k = DIS_K[z], uzak = DIS_U[z], s = this.setler[k];
        if (taban >= 0 && s.kot <= B + 0.05) continue;
        const b = basamaklar(B, s.kot, B > s.kot);
        if (uzak >= diziGenisligi(b) + YUZ_PAYI + 1 || uzak >= enUzak) continue;
        enUzak = uzak;
        h = s.kot + basamakFarki(b, uzak); sahip = k; u = uzak; kot = s.kot; dis = B;
      }
    }
    // Yollar: en yakın yolun kenarı; yüzey düz, kenarda basamak
    let e = Infinity, yk = 0, cizgi = -1;
    for (const k of this.izgara.get(hucre) ?? []) {
      const s = this.yollar[k];
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L = vx * vx + vy * vy;
      const t = L ? Math.max(0, Math.min(1, ((x - s.x0) * vx + (y - s.y0) * vy) / L)) : 0;
      const kenar = Math.hypot(x - s.x0 - t * vx, y - s.y0 - t * vy) - s.yarim;
      if (kenar < e) { e = kenar; yk = s.h0 + (s.h1 - s.h0) * t; cizgi = s.cizgi; }
    }
    if (cizgi >= 0) {
      const yu = e - YOL_KENAR;
      if (yu <= 0) return { h: Math.max(yk, KARA_EN_AZ), sahip: -2 - cizgi, u: yu, kot: yk, dis: yk };
      const b = basamaklar(h, yk, h > yk);
      if (yu < diziGenisligi(b) + YUZ_PAYI + 1) {
        return { h: Math.max(yk + basamakFarki(b, yu), KARA_EN_AZ), sahip: -2 - cizgi, u: yu, kot: yk, dis: h };
      }
    }
    return { h: Math.max(h, KARA_EN_AZ), sahip, u, kot, dis };
  }

  /**
   * Karonun yüksekliklerine setleri ve yolları uygular (yerinde). Karo sınırı derece;
   * piksel satırları kuzeyden güneye.
   */
  uygula(yuk: Float32Array, karo: number, bati: number, dogu: number, kuzey: number, guney: number) {
    const X0 = (bati - this.lng0) * this.kx, X1 = (dogu - this.lng0) * this.kx;
    const Y0 = (this.lat0 - kuzey) * M_ENLEM, Y1 = (this.lat0 - guney) * M_ENLEM;
    const pxX = (X1 - X0) / karo, pxY = (Y1 - Y0) / karo;
    for (let j = 0; j < karo; j++) {
      const y = Y0 + (j + 0.5) * pxY;
      for (let i = 0; i < karo; i++) {
        const k = j * karo + i;
        yuk[k] = this.nokta(X0 + (i + 0.5) * pxX, y, yuk[k]).h;
      }
    }
  }

  /**
   * Taş duvarlar (5 Kasım akşam, Kemal: "set yüzlerine taş duvar"): verilen alandaki her
   * basamağın yüzü. Basamağın sahibi (set ya da yol) aynı kalan ızgara hücrelerinde, yüzün
   * uzaklık çizgisi izlenir (kare yürüyüşü). Kayda bir şey yazmaz; sonuç parça parça önbellekte.
   */
  duvarlar(bati: number, guney: number, dogu: number, kuzey: number): DuvarParcasi[] {
    const [x0, y0] = this.m([bati, kuzey]), [x1, y1] = this.m([dogu, guney]);
    const cikti: DuvarParcasi[] = [];
    for (let gx = Math.floor(x0 / DUVAR_PARCA); gx <= Math.floor(x1 / DUVAR_PARCA); gx++) {
      for (let gy = Math.floor(y0 / DUVAR_PARCA); gy <= Math.floor(y1 / DUVAR_PARCA); gy++) {
        const a = gx * 100_000 + gy;
        let l = this.duvarOnbellek.get(a);
        if (!l) { l = this.parcaDuvarlari(gx, gy); this.duvarOnbellek.set(a, l); }
        for (const d of l) cikti.push(d);
      }
    }
    return cikti;
  }

  private parcaDuvarlari(gx: number, gy: number): DuvarParcasi[] {
    const X0 = gx * DUVAR_PARCA, Y0 = gy * DUVAR_PARCA;
    // Yakında set ya da yol yoksa duvar da yok
    const bos = (iz: Map<number, number[]>) => {
      for (let a = Math.floor(X0 / IZGARA); a <= Math.floor((X0 + DUVAR_PARCA) / IZGARA); a++) {
        for (let b = Math.floor(Y0 / IZGARA); b <= Math.floor((Y0 + DUVAR_PARCA) / IZGARA); b++) if (iz.get(a * 100_000 + b)?.length) return false;
      }
      return true;
    };
    if (bos(this.setIzgara) && bos(this.izgara)) return [];
    const n = Math.round(DUVAR_PARCA / DUVAR_ADIM) + 1;
    const nk: NoktaSonucu[] = new Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X0 + i * DUVAR_ADIM, y = Y0 + j * DUVAR_ADIM;
      nk[j * n + i] = this.nokta(x, y, this.ham(x, y));
    }
    const cikti: DuvarParcasi[] = [];
    for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
      const k = [nk[j * n + i], nk[j * n + i + 1], nk[(j + 1) * n + i + 1], nk[(j + 1) * n + i]];
      const sahip = k[0].sahip;
      if (sahip === -1 || k.some(o => o.sahip !== sahip)) continue;
      const kx = [X0 + i * DUVAR_ADIM, X0 + (i + 1) * DUVAR_ADIM, X0 + (i + 1) * DUVAR_ADIM, X0 + i * DUVAR_ADIM];
      const ky = [Y0 + j * DUVAR_ADIM, Y0 + j * DUVAR_ADIM, Y0 + (j + 1) * DUVAR_ADIM, Y0 + (j + 1) * DUVAR_ADIM];
      for (let b = 0; b < EN_COK_BASAMAK; b++) this.hucreDuvari(k, kx, ky, b, cikti);
    }
    return cikti;
  }

  /** Bir hücrede b. basamağın yüzü (kare yürüyüşü; iki kesişim → bir parça) */
  private hucreDuvari(k: NoktaSonucu[], kx: number[], ky: number[], b: number, cikti: DuvarParcasi[]) {
    // Sahibin içindeki köşede (u ≤ 0) basamak yok: dizinin ölçüsü ve dış kot komşu köşeden
    const dizi = k.map(o => basamaklar(o.dis, o.kot, o.dis > o.kot));
    const r = dizi.findIndex(bs => b < bs.n);
    if (r < 0) return;
    // Dolgu ile kazı arasındaki geçişte (fark sıfırdan geçer) duvar yok
    if (dizi.some(bs => bs.n > 0 && bs.kazi !== dizi[r].kazi)) return;
    const dis = k.map((o, i) => (b < dizi[i].n ? o.dis : o.u <= 1e-6 ? k[r].dis : NaN));
    const deger = k.map((o, i) => (b < dizi[i].n ? o.u - yuzUzakligi(dizi[i], b) : o.u <= 1e-6 ? o.u - yuzUzakligi(dizi[r], b) : NaN));
    if (deger.some(Number.isNaN)) return;
    const kazi = dizi[r].kazi;
    // Kesişimler; yükseklikler kenarın iki köşesinden (komşu hücreyle aynı: duvarın üstü kesintisiz)
    const kesisim: Array<{ x: number; y: number; ust: number; alt: number }> = [];
    for (let e = 0; e < 4; e++) {
      const a = e, c = (e + 1) % 4;
      if ((deger[a] < 0) === (deger[c] < 0)) continue;
      const t = deger[a] / (deger[a] - deger[c]);
      const kot = k[a].kot + (k[c].kot - k[a].kot) * t, d = dis[a] + (dis[c] - dis[a]) * t;
      const bs = basamaklar(d, kot, kazi);
      if (b >= bs.n) return;
      const l0 = kot + bs.isaret * seviye(bs, b), l1 = kot + bs.isaret * seviye(bs, b + 1);
      kesisim.push({ x: kx[a] + (kx[c] - kx[a]) * t, y: ky[a] + (ky[c] - ky[a]) * t, ust: Math.max(l0, l1), alt: Math.min(l0, l1) });
    }
    if (kesisim.length !== 2) return;
    const [P, Q] = kesisim;
    const yuk = Math.max(P.ust - P.alt, Q.ust - Q.alt);
    if (yuk < EN_AZ_DUVAR) return;
    // u'nun eğimi (hücrede): u artan yön sahipten uzaklaşır
    const gx = (k[1].u - k[0].u + k[2].u - k[3].u) / 2, gy = (k[3].u - k[0].u + k[2].u - k[1].u) / 2;
    const gl = Math.hypot(gx, gy);
    if (gl < 1e-6) return;
    // Yüksek taraf: dolguda sahibe doğru (u azalır), kazıda dışa doğru (u artar)
    const isaret = kazi ? 1 : -1;
    const ic: Nokta = [(isaret * gx) / gl, (isaret * gy) / gl];
    cikti.push({
      p: this.derece(P.x, P.y), q: this.derece(Q.x, Q.y),
      ust: [P.ust, Q.ust], alt: [P.alt, Q.alt], ic,
      // Alçak duvarın basamağı da kısa: şapka yüksekliğe göre (geniş şapka yalnız yüksek duvarda)
      sapka: Math.min(SET_KENAR + YUZ_PAYI + 0.2, 0.4 + 0.5 * yuk)
    });
  }
}
