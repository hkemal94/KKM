import { rakim, sahneye, type Nokta, type Zemin, type ZeminBasligi } from '../tekVeri';

/**
 * Yönetim ekranının küçük geometri işleri (saf iş). Sahne ölçüsü metre: x doğu, z güney.
 */

/** Sahne x, z → [boylam, enlem] (7 basamak) */
export const cografyaya = (b: ZeminBasligi, x: number, z: number): number[] =>
  [Math.round((b.lng0 + x / b.mPerLng) * 1e7) / 1e7, Math.round((b.lat0 - z / b.mPerLat) * 1e7) / 1e7];

export const sahneNoktasi = (b: ZeminBasligi, m: ArrayLike<number>): Nokta => sahneye(b, m);

/** Düz [boylam, enlem, …] dizisi → sahne noktaları */
export function duzdenSahneye(b: ZeminBasligi, n: number[]): Nokta[] {
  const c: Nokta[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) c.push(sahneye(b, [n[i], n[i + 1]]));
  return c;
}
export const sahnedenDuze = (b: ZeminBasligi, c: Nokta[]): number[] => c.flatMap(([x, z]) => cografyaya(b, x, z));

/** Dikdörtgen taban: merkez, +X yönü (ex), en (ex boyunca), boy */
export function dikdortgen(m: Nokta, ex: Nokta, en: number, boy: number): Nokta[] {
  const [ax, az] = ex, bx = -az, bz = ax; // ön (+Z modelde) = (−ex.z, ex.x)
  const e = en / 2, d = boy / 2;
  return [
    [m[0] - ax * e - bx * d, m[1] - az * e - bz * d],
    [m[0] + ax * e - bx * d, m[1] + az * e - bz * d],
    [m[0] + ax * e + bx * d, m[1] + az * e + bz * d],
    [m[0] - ax * e + bx * d, m[1] - az * e + bz * d]
  ];
}

/** Ön yönünden (sahne x, z) +X ekseni: model ön = +Z, +X = (ön.z, −ön.x) */
export const ondenEx = (f: Nokta): Nokta => { const u = Math.hypot(f[0], f[1]) || 1; return [f[1] / u, -f[0] / u]; };
export const acidanEx = (a: number): Nokta => [Math.cos(a), Math.sin(a)];
export const exAcisi = (ex: ArrayLike<number>) => Math.atan2(ex[1], ex[0]);

export function icinde(p: Nokta, halka: Nokta[]): boolean {
  let ic = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, zi] = halka[i], [xj, zj] = halka[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) ic = !ic;
  }
  return ic;
}

/** İki dışbükey çokgen kesişiyor mu (ayırıcı eksen; `pay` kadar içeri daraltarak: değme serbest) */
export function kesisir(a: Nokta[], b: Nokta[], pay = 0.3): boolean {
  for (const halka of [a, b]) {
    for (let i = 0; i < halka.length; i++) {
      const p = halka[i], q = halka[(i + 1) % halka.length];
      const nx = -(q[1] - p[1]), nz = q[0] - p[0];
      const u = Math.hypot(nx, nz) || 1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const r of a) { const v = (r[0] * nx + r[1] * nz) / u; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
      for (const r of b) { const v = (r[0] * nx + r[1] * nz) / u; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      if (a1 - pay <= b0 || b1 - pay <= a0) return false;
    }
  }
  return true;
}

/** Noktanın kesime uzaklığı ve kesim üstündeki oranı */
export function kesimeUzaklik(p: Nokta, a: Nokta, b: Nokta): { d: number; t: number; x: number; z: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  const x = a[0] + dx * t, z = a[1] + dz * t;
  return { d: Math.hypot(p[0] - x, p[1] - z), t, x, z };
}

/** Çizginin en dik yeri (20 m'lik pencerelerde, oran: 0,1 = %10) */
export function enBuyukEgim(zv: Zemin, c: Nokta[], pencere = 20): number {
  // Çizgi 5 m arayla örneklenir
  const ornek: Array<{ s: number; h: number }> = [];
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    if (i > 0) {
      const [ax, az] = c[i - 1], [bx, bz] = c[i];
      const l = Math.hypot(bx - ax, bz - az);
      const adim = Math.max(1, Math.ceil(l / 5));
      for (let k = 1; k <= adim; k++) {
        const x = ax + ((bx - ax) * k) / adim, z = az + ((bz - az) * k) / adim;
        ornek.push({ s: s + (l * k) / adim, h: Math.max(0, rakim(zv, x, z)) });
      }
      s += l;
    } else ornek.push({ s: 0, h: Math.max(0, rakim(zv, c[0][0], c[0][1])) });
  }
  let en = 0;
  for (let i = 0, j = 0; i < ornek.length; i++) {
    while (j < ornek.length && ornek[j].s - ornek[i].s < pencere) j++;
    if (j >= ornek.length) break;
    en = Math.max(en, Math.abs(ornek[j].h - ornek[i].h) / Math.max(1, ornek[j].s - ornek[i].s));
  }
  return en;
}

/** Kıyıya yakın mı: tabanın çevresinde `pay` m içinde deniz (rakım ≤ 0,8 m) var mı */
export function kiyiyaYakin(zv: Zemin, halka: Nokta[], pay: number): boolean {
  let cx = 0, cz = 0;
  for (const [x, z] of halka) { cx += x; cz += z; }
  cx /= halka.length; cz /= halka.length;
  let r = 0;
  for (const [x, z] of halka) r = Math.max(r, Math.hypot(x - cx, z - cz));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    if (rakim(zv, cx + Math.cos(a) * (r + pay), cz + Math.sin(a) * (r + pay)) <= 0.8) return true;
  }
  return rakim(zv, cx, cz) <= 0.8;
}

/** Izgara anahtarı (tek sayı; yakın arama için) */
export const hucreAnahtari = (i: number, j: number) => i * 100003 + j;
