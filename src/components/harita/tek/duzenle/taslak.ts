/**
 * Tek harita 7. adım (22 Kasım, Kemal: "hepsi tek seferde"): yönetim ekranının taslağı.
 *
 * Taslak yalnız DEĞİŞİKLİKLERİ tutar (bütün harita değil): taşınan / döndürülen /
 * silinen yapılar, yeni yapılar, düzenlenen / silinen / yeni yollar, boyanan kareler,
 * konan hazır gruplar ve (8. adım) zeminin değişen hücreleri. Kimlikler veri dosyalarındaki kimliklerdir
 * (`public/harita/duzada-yapilar.geojson`, `duzada-yollar.geojson`, `duzada-kareler.json`).
 *
 * Koordinatlar [boylam, enlem] (7 basamak); yollar düz sayı dizisi
 * [boylam0, enlem0, boylam1, enlem1, …]: Firestore iç içe dizi kabul etmez, taslak da
 * hiç iç içe dizi taşımaz. Taslak kayda JSON yazı olarak gider (`taslakDeposu.ts`).
 *
 * Bu dosya saf iştir: ağ yok, kayıt yok.
 */

import { zeminCoz, type ZeminTaslagi } from './zemin';

export const TASLAK_SURUMU = 1;

export type Kademe = 'ana' | 'ara' | 'sokak' | 'gecit' | 'toprak' | 'patika' | 'merdiven';
export type Yuzey = 'asfalt' | 'taş' | 'toprak' | 'basamak';
export type BoyaTuru = 'park' | 'bahce' | 'meydancik' | 'agac' | 'bos';

/** Kademeler (gen/kompakt_yollar.py ile aynı: genişlik, eğim sınırı, yüzey). Ölçüler DENEME */
export const KADEMELER: Array<{ id: Kademe; ad: string; genislik: number; egim: number | null; yuzey: Yuzey }> = [
  { id: 'ana', ad: 'Ana yol', genislik: 8, egim: 0.10, yuzey: 'asfalt' },
  { id: 'ara', ad: 'Ara yol', genislik: 6.5, egim: 0.10, yuzey: 'asfalt' },
  { id: 'sokak', ad: 'Sokak', genislik: 5, egim: 0.15, yuzey: 'taş' },
  { id: 'gecit', ad: 'Geçit', genislik: 3, egim: 0.15, yuzey: 'taş' },
  { id: 'toprak', ad: 'Toprak yol', genislik: 4, egim: 0.15, yuzey: 'toprak' },
  { id: 'patika', ad: 'Patika', genislik: 1.5, egim: 0.45, yuzey: 'toprak' },
  { id: 'merdiven', ad: 'Merdiven', genislik: 2.5, egim: null, yuzey: 'basamak' }
];
export const KADEME: Record<Kademe, (typeof KADEMELER)[number]> = Object.fromEntries(KADEMELER.map(k => [k.id, k])) as Record<Kademe, (typeof KADEMELER)[number]>;
export const YUZEYLER: Array<{ id: Yuzey; ad: string }> = [
  { id: 'asfalt', ad: 'Asfalt' }, { id: 'taş', ad: 'Taş döşeme' }, { id: 'toprak', ad: 'Toprak' }, { id: 'basamak', ad: 'Basamak' }
];

export const BOYALAR: Array<{ id: BoyaTuru; ad: string; renk: string }> = [
  { id: 'park', ad: 'Park', renk: '#9DB872' },
  { id: 'bahce', ad: 'Bahçe', renk: '#B9B26A' },
  { id: 'meydancik', ad: 'Meydancık', renk: '#E3D8C3' },
  { id: 'agac', ad: 'Ağaç', renk: '#6E8B4E' },
  { id: 'bos', ad: 'Boş', renk: '#FAF8F5' }
];

/** Grup öğesinin izi: hangi gruptan, hangi şablondan, şablondaki kimliği */
export interface GrupEtiketi { kimlik: string; sablon: string; yerel: string }

/** Var olan yapının değişikliği: silindi ya da yeni yeri / yönü */
export interface YapiDegisikligi { sil?: true; m?: number[]; ex?: number[] }

export type YeniTur = 'ev' | 'dukkanli' | 'ciftlik' | 'yazlik' | 'depo' | 'kamu' | 'ozel' | 'agac' | 'donati';
/** Yeni yapı (ağaç ve donatı da: küçük öğe) */
export interface YeniYapi {
  tur: YeniTur;
  dosya: string;
  /** Taban merkezi [boylam, enlem] */
  m: number[];
  /** Modelin +X ekseni, x doğu z güney */
  ex: number[];
  en: number; boy: number; yukseklik: number;
  modelEn?: number;
  grup?: GrupEtiketi;
}

/** Var olan yolun değişikliği */
export interface YolDegisikligi { sil?: true; n?: number[]; kademe?: Kademe; ad?: string; tur?: Yuzey }
export interface YeniYol { kademe: Kademe; tur: Yuzey; ad: string; n: number[]; grup?: GrupEtiketi; bolundu?: string }

export type GrupYer = 'yol' | 'serit' | 'kiyi';
/**
 * Konan hazır grup. Yerleşim: yerel x = 8·i yol boyunca (U), y = 8·j yoldan içeri (N);
 * sahne noktası = o + x·U + y·N. U = (cos aci, sin aci) sahne x, z'de; N = yan · (−U.z, U.x).
 * Öğelerin kendisi (bina, yol, ağaç, donatı) yeniYapilar / yeniYollar'da grup etiketiyle
 * ayrı ayrı durur; alanlar ve duvarlar şablondan ve kırpmadan yeniden kurulur.
 */
export interface GrupYeri {
  sablon: string;
  kirp: { sol: number; sag: number; arka: number };
  o: number[];
  aci: number;
  yan: 1 | -1;
  yer: GrupYer;
  /** Konduğu yol (yer: yol) ya da şerit (serit: "yol|taraf|kesim") */
  dayanak?: string;
  /** Altında kalan arsalar (avlu ağaçları kalkar) */
  arsalar: string[];
}

export interface TekTaslak {
  surum: number;
  yapilar: Record<string, YapiDegisikligi>;
  yeniYapilar: Record<string, YeniYapi>;
  yollar: Record<string, YolDegisikligi>;
  yeniYollar: Record<string, YeniYol>;
  kareler: Record<string, BoyaTuru>;
  gruplar: Record<string, GrupYeri>;
  /** Zemin aracı (8. adım): değişen hücreler, sıkıştırılmış parçalar (`zemin.ts`) */
  zemin?: ZeminTaslagi;
}

export const bosTaslak = (): TekTaslak => ({ surum: TASLAK_SURUMU, yapilar: {}, yeniYapilar: {}, yollar: {}, yeniYollar: {}, kareler: {}, gruplar: {} });

/** Değişiklik sayıları (ekranda ve ajans dosyasında) */
export function taslakSayilari(t: TekTaslak) {
  const yapi = Object.values(t.yapilar);
  return {
    tasinan: yapi.filter(y => !y.sil).length,
    silinen: yapi.filter(y => y.sil).length,
    yeniYapi: Object.values(t.yeniYapilar).filter(y => !y.grup).length,
    yol: Object.keys(t.yollar).length,
    yeniYol: Object.values(t.yeniYollar).filter(y => !y.grup).length,
    kare: Object.keys(t.kareler).length,
    grup: Object.keys(t.gruplar).length,
    /** Zemin: fırça vuruşu sayısı (hücre sayısı `t.zemin.hucre`) */
    zemin: t.zemin?.vurus ?? 0
  };
}
export const toplamDegisiklik = (t: TekTaslak) => Object.values(taslakSayilari(t)).reduce((a, b) => a + b, 0);

const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sayiDizisi = (v: unknown, en = 0): number[] | undefined =>
  Array.isArray(v) && v.length >= en && v.every(sayiMi) ? (v as number[]) : undefined;
const nesne = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const KADEME_IDLERI = new Set(KADEMELER.map(k => k.id));
const YUZEY_IDLERI = new Set(YUZEYLER.map(k => k.id));
const BOYA_IDLERI = new Set(BOYALAR.map(k => k.id));
const YENI_TURLER = new Set<string>(['ev', 'dukkanli', 'ciftlik', 'yazlik', 'depo', 'kamu', 'ozel', 'agac', 'donati']);

function etiket(v: unknown): GrupEtiketi | undefined {
  const e = nesne(v);
  return typeof e.kimlik === 'string' && typeof e.sablon === 'string' && typeof e.yerel === 'string'
    ? { kimlik: e.kimlik, sablon: e.sablon, yerel: e.yerel } : undefined;
}

/** Kayıttan / dosyadan gelen taslağı denetleyerek okur; bozuk satır atılır (saf iş) */
export function taslakCoz(ham: unknown): TekTaslak {
  const d = nesne(ham);
  const t = bosTaslak();
  for (const [id, v] of Object.entries(nesne(d.yapilar))) {
    const y = nesne(v);
    if (y.sil === true) t.yapilar[id] = { sil: true };
    else {
      const m = sayiDizisi(y.m, 2), ex = sayiDizisi(y.ex, 2);
      if (m && ex) t.yapilar[id] = { m: m.slice(0, 2), ex: ex.slice(0, 2) };
    }
  }
  for (const [id, v] of Object.entries(nesne(d.yeniYapilar))) {
    const y = nesne(v);
    const m = sayiDizisi(y.m, 2), ex = sayiDizisi(y.ex, 2);
    if (!m || !ex || typeof y.dosya !== 'string' || !YENI_TURLER.has(String(y.tur)) || !sayiMi(y.en) || !sayiMi(y.boy)) continue;
    const g = etiket(y.grup);
    t.yeniYapilar[id] = {
      tur: y.tur as YeniTur, dosya: y.dosya, m: m.slice(0, 2), ex: ex.slice(0, 2), en: y.en, boy: y.boy,
      yukseklik: sayiMi(y.yukseklik) ? y.yukseklik : 8,
      ...(sayiMi(y.modelEn) ? { modelEn: y.modelEn } : {}), ...(g ? { grup: g } : {})
    };
  }
  for (const [id, v] of Object.entries(nesne(d.yollar))) {
    const y = nesne(v);
    if (y.sil === true) { t.yollar[id] = { sil: true }; continue; }
    const r: YolDegisikligi = {};
    const n = sayiDizisi(y.n, 4);
    if (n && n.length % 2 === 0) r.n = n;
    if (KADEME_IDLERI.has(y.kademe as Kademe)) r.kademe = y.kademe as Kademe;
    if (typeof y.ad === 'string') r.ad = y.ad;
    if (YUZEY_IDLERI.has(y.tur as Yuzey)) r.tur = y.tur as Yuzey;
    if (Object.keys(r).length) t.yollar[id] = r;
  }
  for (const [id, v] of Object.entries(nesne(d.yeniYollar))) {
    const y = nesne(v);
    const n = sayiDizisi(y.n, 4);
    if (!n || n.length % 2 || !KADEME_IDLERI.has(y.kademe as Kademe)) continue;
    const g = etiket(y.grup);
    t.yeniYollar[id] = {
      kademe: y.kademe as Kademe, tur: YUZEY_IDLERI.has(y.tur as Yuzey) ? (y.tur as Yuzey) : KADEME[y.kademe as Kademe].yuzey,
      ad: typeof y.ad === 'string' ? y.ad : '', n, ...(g ? { grup: g } : {}),
      ...(typeof y.bolundu === 'string' ? { bolundu: y.bolundu } : {})
    };
  }
  for (const [id, v] of Object.entries(nesne(d.kareler))) if (BOYA_IDLERI.has(v as BoyaTuru)) t.kareler[id] = v as BoyaTuru;
  for (const [id, v] of Object.entries(nesne(d.gruplar))) {
    const g = nesne(v);
    const o = sayiDizisi(g.o, 2), k = nesne(g.kirp);
    if (!o || typeof g.sablon !== 'string' || !sayiMi(g.aci) || !['yol', 'serit', 'kiyi'].includes(String(g.yer))) continue;
    t.gruplar[id] = {
      sablon: g.sablon, o: o.slice(0, 2), aci: g.aci, yan: g.yan === -1 ? -1 : 1, yer: g.yer as GrupYer,
      kirp: { sol: sayiMi(k.sol) ? k.sol : 0, sag: sayiMi(k.sag) ? k.sag : 0, arka: sayiMi(k.arka) ? k.arka : 0 },
      ...(typeof g.dayanak === 'string' ? { dayanak: g.dayanak } : {}),
      arsalar: Array.isArray(g.arsalar) ? g.arsalar.filter((a): a is string => typeof a === 'string') : []
    };
  }
  const zm = zeminCoz(d.zemin);
  if (zm) t.zemin = zm;
  return t;
}

/** Kayda giden yazı: sayılar yuvarlanır (boylam/enlem 7 basamak, ölçü 2 basamak) */
export function taslakYazisi(t: TekTaslak): string {
  return JSON.stringify(t, (anahtar, v) => {
    if (typeof v !== 'number') return v;
    if (anahtar === 'aci') return Math.round(v * 1e5) / 1e5;
    return Math.abs(v) > 20 ? Math.round(v * 1e7) / 1e7 : Math.round(v * 1e5) / 1e5;
  });
}

/** Yeni kimlik (öğe başına; zaman + rastgele) */
export const yeniKimlik = (on: string) => `${on}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** İç içe dizi var mı (Firestore'a yazılacak her şey için denetim; saf iş) */
export function icIceDiziVarMi(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(x => Array.isArray(x) || (x && typeof x === 'object' && icIceDiziVarMi(x)));
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(icIceDiziVarMi);
  return false;
}
