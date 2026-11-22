import { rakim, sahneye, type Koleksiyon, type Nokta, type Yapi, type Zemin } from '../tekVeri';
import { duzdenSahneye, enBuyukEgim, hucreAnahtari, kesimeUzaklik, kesisir, kiyiyaYakin } from './geometri';
import type { Birlesik } from './birlesik';
import { KADEME, type Kademe, type TekTaslak } from './taslak';

/**
 * Yumuşak kurallar (Kemal, 22 Kasım): yol eğimi, üst üste binme, kıyı şeridi gibi ihlaller
 * hiçbir işi engellemez; yalnız uyarı olarak görünür. Ölçüler DENEME (gen/kompakt_yollar.py,
 * duzada-kareler.json → kiyiSeridiM ile aynı).
 */

export interface Uyari { id: string; ogeAdi: string; metin: string; x: number; z: number; tur: 'egim' | 'binme' | 'yol' | 'kiyi' | 'deniz' | 'grup' }

export const KIYI_SERIDI_M = 25;
const LIMAN = new Set(['iskele', 'mendirek']);

type YolCizgisi = { id: string; c: Nokta[]; yari: number };

function yolCizgileri(z: Zemin, yollar: Koleksiyon): YolCizgisi[] {
  const out: YolCizgisi[] = [];
  for (const f of yollar.features) {
    const p = f.properties;
    if (f.geometry.type !== 'LineString' || (p.katman !== 'yol' && p.katman !== 'kopru')) continue;
    out.push({ id: String(p.id ?? p.yol ?? ''), c: (f.geometry.coordinates as number[][]).map(q => sahneye(z.b, q)), yari: (Number(p.genislik) || 4) / 2 });
  }
  return out;
}

/** Taslaktaki değişen öğeler için uyarılar */
export function uyarilariBul(z: Zemin, t: TekTaslak, g: Birlesik, grupSigmadi: Record<string, number> = {}, adi?: (y: Yapi) => string): Uyari[] {
  const out: Uyari[] = [];
  const ad = (y: Yapi) => adi?.(y) || y.ad || (y.tur === 'ozel' ? 'Özel yapı' : 'Yapı');

  // Yapı ızgarası (yakın arama)
  const H = 40;
  const izgara = new Map<number, Yapi[]>();
  for (const y of g.yapilar) {
    const a = hucreAnahtari(Math.floor(y.merkez[0] / H), Math.floor(y.merkez[1] / H));
    const l = izgara.get(a) ?? []; l.push(y); izgara.set(a, l);
  }
  const yollar = yolCizgileri(z, g.yollar);
  const yolIzgara = new Map<number, Array<{ y: YolCizgisi; a: Nokta; b: Nokta }>>();
  for (const y of yollar) for (let n = 1; n < y.c.length; n++) {
    const a = y.c[n - 1], b = y.c[n];
    const i0 = Math.floor(Math.min(a[0], b[0]) / H), i1 = Math.floor(Math.max(a[0], b[0]) / H);
    const j0 = Math.floor(Math.min(a[1], b[1]) / H), j1 = Math.floor(Math.max(a[1], b[1]) / H);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = hucreAnahtari(i, j);
      const l = yolIzgara.get(k) ?? []; l.push({ y, a, b }); yolIzgara.set(k, l);
    }
  }

  const degisenYapilar = g.yapilar.filter(y => t.yapilar[y.id] || t.yeniYapilar[y.id]);
  for (const y of degisenYapilar) {
    if (LIMAN.has(y.tur)) continue;
    const i = Math.floor(y.merkez[0] / H), j = Math.floor(y.merkez[1] / H);
    let binen: Yapi | null = null;
    for (let di = -2; di <= 2 && !binen; di++) for (let dj = -2; dj <= 2 && !binen; dj++) {
      for (const o of izgara.get(hucreAnahtari(i + di, j + dj)) ?? []) {
        if (o.id === y.id || Math.hypot(o.merkez[0] - y.merkez[0], o.merkez[1] - y.merkez[1]) > (Math.max(o.en, o.boy) + Math.max(y.en, y.boy))) continue;
        if (kesisir(y.taban, o.taban)) { binen = o; break; }
      }
    }
    if (binen) out.push({ id: y.id, ogeAdi: ad(y), metin: `başka bir yapıyla üst üste biniyor${binen.ad ? ` (${binen.ad})` : ''}`, x: y.merkez[0], z: y.merkez[1], tur: 'binme' });
    // Yolun üstünde mi: tabanın köşelerinden ya da merkezinden biri bir yol şeridinde
    let yolda: string | null = null;
    for (let di = -1; di <= 1 && !yolda; di++) for (let dj = -1; dj <= 1 && !yolda; dj++) {
      for (const s of yolIzgara.get(hucreAnahtari(i + di, j + dj)) ?? []) {
        if ([y.merkez, ...y.taban].some(p => kesimeUzaklik(p, s.a, s.b).d < s.y.yari - 0.3)) { yolda = s.y.id; break; }
      }
    }
    if (yolda) out.push({ id: y.id, ogeAdi: ad(y), metin: 'bir yolun üstüne taşıyor', x: y.merkez[0], z: y.merkez[1], tur: 'yol' });
    if (rakim(z, y.merkez[0], y.merkez[1]) <= 0.5) out.push({ id: y.id, ogeAdi: ad(y), metin: 'denizde', x: y.merkez[0], z: y.merkez[1], tur: 'deniz' });
    else if (kiyiyaYakin(z, y.taban, KIYI_SERIDI_M)) out.push({ id: y.id, ogeAdi: ad(y), metin: `kıyı şeridinde (kıyıya ${KIYI_SERIDI_M} m'den yakın)`, x: y.merkez[0], z: y.merkez[1], tur: 'kiyi' });
  }

  // Yollar: eğim sınırı (kademeye göre)
  const yolKontrol = (id: string, adi: string, kademe: Kademe, n: number[]) => {
    const sinir = KADEME[kademe].egim;
    const c = duzdenSahneye(z.b, n);
    if (c.length < 2) return;
    const e = enBuyukEgim(z, c);
    if (sinir !== null && e > sinir + 0.005) {
      const o = c[Math.floor(c.length / 2)];
      out.push({ id, ogeAdi: adi, metin: `eğimi %${Math.round(e * 100)} (${KADEME[kademe].ad.toLowerCase()} için sınır %${Math.round(sinir * 100)})`, x: o[0], z: o[1], tur: 'egim' });
    }
  };
  for (const [id, y] of Object.entries(t.yeniYollar)) if (!y.grup) yolKontrol(id, y.ad || `Yeni ${KADEME[y.kademe].ad.toLowerCase()}`, y.kademe, y.n);
  for (const f of g.yollar.features) {
    const id = String(f.properties.id ?? '');
    const d = t.yollar[id];
    if (!d || d.sil || !(d.n || d.kademe)) continue;
    const n = d.n ?? (f.geometry.coordinates as number[][]).flatMap(q => [q[0], q[1]]);
    yolKontrol(id, String(f.properties.ad || '') || 'Yol', (f.properties.kademe as Kademe) ?? 'sokak', n);
  }

  // Gruplar: sığmayan kareler (kırpmadan sonra da dolu ya da denizde)
  for (const [id, n] of Object.entries(grupSigmadi)) {
    const gy = t.gruplar[id];
    if (!gy || n <= 0) continue;
    const [x, sz] = sahneye(z.b, gy.o);
    out.push({ id, ogeAdi: 'Hazır grup', metin: `${n} karesi dolu yere ya da denize düşüyor (en çok kırpmadan sonra)`, x, z: sz, tur: 'grup' });
  }
  return out;
}
