import { haritaAdresi, type Nokta, type ZeminBasligi } from '../tekVeri';
import { cografyaya, ondenEx } from './geometri';
import type { GrupEtiketi, GrupYer, GrupYeri, Kademe, YeniTur, YeniYapi, YeniYol } from './taslak';
import { KADEME } from './taslak';

/**
 * Hazır gruplar (`public/harita/hazir-gruplar.json`, gen/hazir_gruplar.py; 5. adım).
 *
 * Kırpma (Kemal, 21 Kasım: "grup sığmazsa kenar kareleri kırpılır"): gen/hazir_gruplar.py →
 * `kirp_tanim` / `kirpilmis` kuralının ekrandaki karşılığı. 0. sıra (konduğu yol ya da kıyı)
 * atılmaz; sol, sağ sütunlardan ve arka sıralardan en çok çeşidin `kirpma` sınırı kadar atılır;
 * meydan, pazar, özel yapı ve rıhtım karesi (M, P, #, R) atılamaz. Ekranda öğeler kırpılan
 * kutuya göre süzülür (kutunun dışına taşan arsa, ev, yol parçası atılır); ajans tarafındaki
 * betik (gen/kompakt_taslak_uygula.py) aynı kırpmayı üretecin kendisiyle (`kirpilmis`) yeniden
 * kurar ve ikisini karşılaştırır.
 */

export interface GrupOgesi {
  yerel: string;
  tip: 'yol' | 'alan' | 'arsa' | 'bina' | 'agac' | 'donati' | 'duvar';
  tur?: string; kademe?: string; genislik?: number; model?: string;
  kareler?: number[][];
  kenarlar?: number[][][];
  uclar?: number[][][];
  arsa?: string;
  merkez?: number[]; m?: number[];
  en?: number; boy?: number; yon?: 'on' | 'arka' | 'sol' | 'sag';
  modelEn?: number; yukseklik?: number;
  hat?: number[][];
}
export interface Cesit {
  id: string; grup: string; cesit: string; ad: string; tarif: string;
  yer: GrupYer; en: number; boy: number;
  egim?: { enAz: number; enCok: number; yukselir: string };
  harita: string[];
  ogeler: GrupOgesi[];
  kirpma?: { sol: number; sag: number; arka: number; enKucuk: number[] };
}
export interface Grup { id: string; ad: string; aciklama: string; cesitler: Cesit[] }
export interface GrupVerisi { kareM: number; gruplar: Grup[]; modelOlcu: Record<string, number[]>; cesit: Map<string, Cesit> }

export async function gruplariOku(sinyal?: AbortSignal): Promise<GrupVerisi> {
  const y = await fetch(haritaAdresi('hazir-gruplar.json'), { signal: sinyal });
  if (!y.ok) throw new Error(`hazir-gruplar.json: ${y.status}`);
  const d = (await y.json()) as { kareM: number; gruplar: Grup[]; modelOlcu: Record<string, number[]> };
  return { ...d, cesit: new Map(d.gruplar.flatMap(g => g.cesitler.map(c => [c.id, c] as const))) };
}

/** Kırpılamayan kareler (gen/hazir_gruplar.py → KORUNAN_HARF) */
const KORUNAN = new Set(['M', 'P', '#', 'R']);

export type Kirpma = { sol: number; sag: number; arka: number };

/** Kırpma kuralın içinde mi (sınırlar ve korunan kareler) */
export function kirpilabilir(c: Cesit, k: Kirpma): boolean {
  if (k.sol === 0 && k.sag === 0 && k.arka === 0) return true;
  const s = c.kirpma ?? { sol: 0, sag: 0, arka: 0 };
  if (k.sol > s.sol || k.sag > s.sag || k.arka > s.arka || k.sol < 0 || k.sag < 0 || k.arka < 0) return false;
  const D = c.harita.length, W = c.harita[0]?.length ?? 0;
  if (k.sol + k.sag >= W || k.arka >= D) return false;
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const atilir = i < k.sol || i >= W - k.sag || j >= D - k.arka;
    if (atilir && KORUNAN.has(c.harita[j][i])) return false;
  }
  return true;
}

/**
 * Kırpılmış çeşit (kural dışıysa null). Öğeler kutuya göre süzülür, sol kadar kayar.
 * Arsası atılan ev de atılır; yolun kutu dışı kareleri ve kenarları atılır.
 */
export function kirpilmis(c: Cesit, k: Kirpma): Cesit | null {
  if (!kirpilabilir(c, k)) return null;
  if (k.sol === 0 && k.sag === 0 && k.arka === 0) return c;
  const W = c.en - k.sol - k.sag, D = c.boy - k.arka, K = 8;
  const x0 = k.sol * K, x1 = (c.en - k.sag) * K, y1 = D * K, e = 0.01;
  const kutuda = (p: number[]) => p[0] >= x0 - e && p[0] <= x1 + e && p[1] >= -e && p[1] <= y1 + e;
  const kareKutuda = (q: number[]) => q[0] >= k.sol && q[0] < c.en - k.sag && q[1] < D;
  const kay = (p: number[]) => [p[0] - x0, p[1]];
  const kareKay = (q: number[]) => [q[0] - k.sol, q[1]];
  const atilanArsa = new Set<string>();
  const ogeler: GrupOgesi[] = [];
  for (const o of c.ogeler) {
    if (o.tip === 'arsa') {
      if (!(o.kareler ?? []).every(kareKutuda)) { atilanArsa.add(o.yerel); continue; }
      ogeler.push({ ...o, kareler: o.kareler!.map(kareKay) });
    }
  }
  for (const o of c.ogeler) {
    if (o.tip === 'arsa') continue;
    if (o.arsa && atilanArsa.has(o.arsa)) continue;
    if (o.tip === 'yol') {
      const kareler = (o.kareler ?? []).filter(kareKutuda).map(kareKay);
      const kenarlar = (o.kenarlar ?? []).filter(s => kutuda(s[0]) && kutuda(s[1])).map(s => s.map(kay));
      if (!kenarlar.length) continue;
      const uclar = (o.uclar ?? []).filter(s => kutuda(s[0]) && kutuda(s[1])).map(s => s.map(kay));
      ogeler.push({ ...o, kareler, kenarlar, uclar });
    } else if (o.tip === 'alan') {
      const kareler = (o.kareler ?? []).filter(kareKutuda).map(kareKay);
      if (kareler.length) ogeler.push({ ...o, kareler });
    } else if (o.tip === 'bina') {
      if (!o.arsa && !(o.merkez && kutuda(o.merkez))) continue;
      ogeler.push({ ...o, merkez: kay(o.merkez!) });
    } else if (o.tip === 'agac' || o.tip === 'donati') {
      if (!o.m || !kutuda(o.m)) continue;
      ogeler.push({ ...o, m: kay(o.m) });
    } else if (o.tip === 'duvar') {
      if (!o.hat?.every(kutuda)) continue;
      ogeler.push({ ...o, hat: o.hat.map(kay) });
    }
  }
  return {
    ...c, en: W, boy: D,
    harita: c.harita.slice(0, D).map(r => r.slice(k.sol, c.en - k.sag)),
    ogeler
  };
}

/** Yerleşim: yerel metre (x yol boyunca, y içeri) → sahne */
export interface Yerlesim { o: Nokta; U: Nokta; N: Nokta }
export const yerlesim = (o: Nokta, aci: number, yan: 1 | -1): Yerlesim => {
  const U: Nokta = [Math.cos(aci), Math.sin(aci)];
  return { o, U, N: [-U[1] * yan, U[0] * yan] };
};
export const yereldenSahneye = (y: Yerlesim, x: number, yy: number): Nokta =>
  [y.o[0] + x * y.U[0] + yy * y.N[0], y.o[1] + x * y.U[1] + yy * y.N[1]];

/** Çeşidin karesi (i, j) sahnede: dört köşe */
export function grupKaresi(y: Yerlesim, i: number, j: number, K = 8): Nokta[] {
  return [yereldenSahneye(y, i * K, j * K), yereldenSahneye(y, (i + 1) * K, j * K), yereldenSahneye(y, (i + 1) * K, (j + 1) * K), yereldenSahneye(y, i * K, (j + 1) * K)];
}

const YON: Record<string, [number, number]> = { on: [0, -1], arka: [0, 1], sol: [-1, 0], sag: [1, 0] };

/** Bina türü: grup türü KKM'nin Kurucu türüne */
const BINA_TURU: Record<string, YeniTur> = { ev: 'ev', dukkanli: 'dukkanli', ciftlik: 'ciftlik', yazlik: 'yazlik', depo: 'depo', kamu: 'kamu' };

/** Kenarları uç uca ekleyip çizgilere çevirir */
function cizgilere(kenarlar: number[][][]): number[][][] {
  const kalan = kenarlar.map(k => k.map(p => [p[0], p[1]]));
  const anahtar = (p: number[]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const cizgiler: number[][][] = [];
  while (kalan.length) {
    const c = kalan.shift()!;
    let degisti = true;
    while (degisti) {
      degisti = false;
      for (let i = 0; i < kalan.length; i++) {
        const k = kalan[i];
        const bas = anahtar(c[0]), son = anahtar(c[c.length - 1]);
        if (anahtar(k[0]) === son) { c.push(k[1]); kalan.splice(i, 1); degisti = true; break; }
        if (anahtar(k[1]) === son) { c.push(k[0]); kalan.splice(i, 1); degisti = true; break; }
        if (anahtar(k[1]) === bas) { c.unshift(k[0]); kalan.splice(i, 1); degisti = true; break; }
        if (anahtar(k[0]) === bas) { c.unshift(k[1]); kalan.splice(i, 1); degisti = true; break; }
      }
    }
    cizgiler.push(c);
  }
  return cizgiler;
}

/**
 * Konan grubun öğeleri taslağa: binalar, ağaçlar, donatılar yeni yapı; yollar yeni yol
 * (her öğe ayrı kayıt, grup etiketiyle). Alan ve duvar şablondan çizilir, kayda girmez.
 */
export function grupOgeleri(b: ZeminBasligi, c: Cesit, yer: Yerlesim, kimlik: string, modelOlcu: Record<string, number[]>):
  { yapilar: Record<string, YeniYapi>; yollar: Record<string, YeniYol> } {
  const yapilar: Record<string, YeniYapi> = {};
  const yollar: Record<string, YeniYol> = {};
  const etiket = (yerel: string): GrupEtiketi => ({ kimlik, sablon: c.id, yerel });
  const sahne = (p: number[]) => yereldenSahneye(yer, p[0], p[1]);
  const cog = (p: Nokta) => cografyaya(b, p[0], p[1]);
  for (const o of c.ogeler) {
    if (o.tip === 'bina' && o.merkez && o.model) {
      const f = YON[o.yon ?? 'on'];
      const fs: Nokta = [f[0] * yer.U[0] + f[1] * yer.N[0], f[0] * yer.U[1] + f[1] * yer.N[1]];
      const ex = ondenEx(fs);
      yapilar[`${kimlik}_${o.yerel}`] = {
        tur: BINA_TURU[o.tur ?? ''] ?? 'ozel', dosya: o.model, m: cog(sahne(o.merkez)), ex: [ex[0], ex[1]],
        en: o.en ?? 8, boy: o.boy ?? 8, yukseklik: modelOlcu[o.model]?.[2] ?? 8,
        ...(o.modelEn ? { modelEn: o.modelEn } : {}), grup: etiket(o.yerel)
      };
    } else if ((o.tip === 'agac' || o.tip === 'donati') && o.m && o.model) {
      const a = ((o.m[0] * 37 + o.m[1] * 11) % 360) * (Math.PI / 180);
      const olcu = modelOlcu[o.model];
      yapilar[`${kimlik}_${o.yerel}`] = {
        tur: o.tip, dosya: o.model, m: cog(sahne(o.m)), ex: [Math.cos(a), Math.sin(a)],
        en: olcu?.[0] ?? 2, boy: olcu?.[1] ?? 2, yukseklik: o.yukseklik ?? olcu?.[2] ?? 3, grup: etiket(o.yerel)
      };
    } else if (o.tip === 'yol' && o.kenarlar?.length) {
      const kademe = (o.kademe && o.kademe in KADEME ? o.kademe : 'sokak') as Kademe;
      const cizgiler = cizgilere([...o.kenarlar, ...(o.uclar ?? [])]);
      cizgiler.forEach((cz, n) => {
        if (cz.length < 2) return;
        yollar[`${kimlik}_${o.yerel}${cizgiler.length > 1 ? `_${n + 1}` : ''}`] = {
          kademe, tur: KADEME[kademe].yuzey, ad: '', n: cz.flatMap(p => cog(sahne(p))), grup: etiket(o.yerel)
        };
      });
    }
  }
  return { yapilar, yollar };
}

/** Grubun çizilecek alanları ve duvarları (sahne) */
export function grupCizimi(c: Cesit, yer: Yerlesim, K = 8) {
  const alanlar: Array<{ tur: string; kareler: Nokta[][] }> = [];
  const duvarlar: Nokta[][] = [];
  for (const o of c.ogeler) {
    if (o.tip === 'alan' && o.kareler) alanlar.push({ tur: o.tur ?? 'bos', kareler: o.kareler.map(q => grupKaresi(yer, q[0], q[1], K)) });
    else if (o.tip === 'duvar' && o.hat) duvarlar.push(o.hat.map(p => yereldenSahneye(yer, p[0], p[1])));
  }
  const kutu: Nokta[] = [yereldenSahneye(yer, 0, 0), yereldenSahneye(yer, c.en * K, 0), yereldenSahneye(yer, c.en * K, c.boy * K), yereldenSahneye(yer, 0, c.boy * K)];
  return { alanlar, duvarlar, kutu };
}

/** Kırpma adayları: önce az kırpılan (toplam atılan kare az) */
export function kirpmaAdaylari(c: Cesit): Kirpma[] {
  const s = c.kirpma ?? { sol: 0, sag: 0, arka: 0 };
  const out: Kirpma[] = [];
  for (let a = 0; a <= s.sol; a++) for (let b = 0; b <= s.sag; b++) for (let d = 0; d <= s.arka; d++) {
    const k = { sol: a, sag: b, arka: d };
    if (kirpilabilir(c, k)) out.push(k);
  }
  const atilan = (k: Kirpma) => (k.sol + k.sag) * c.boy + k.arka * (c.en - k.sol - k.sag);
  return out.sort((p, q) => atilan(p) - atilan(q));
}

export type { GrupYeri };
