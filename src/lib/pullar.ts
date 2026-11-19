import { base64Coz, github, GithubHatasi } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Ürünler → Pullar (15 Kasım, Kemal: "posta pulları bütün oyunlarımızın ödül
 * sistemi olsun"). Bütün oyunların pul kaydı ajansın gizli deposunda,
 * `kkm/pullar.json`; ortak standart ajansın `docs/pul-koleksiyonu.md`'si.
 *
 * - Her ay bir pul (`YYYY-AA`), her çeyrekte üç aylık pulun yanında büyük
 *   4. pul (`YYYY-Q1…Q4`): "3+1 pul serisi".
 * - Pulun durumu: tasarlanmadi · taslak · onayli. Kayıtta olmayan pul
 *   "tasarlanmadı" sayılır.
 * - Ajans yeni taslağı kayda yazar ve Onay bekleyenler'e düşürür; Kemal bu
 *   sayfada durumu ve Canva bağlantısını değiştirip "Kaydet"e basınca KKM
 *   yalnız o pulu yazar (dosyanın güncel hâlinin üstüne).
 * - Dosya yoksa hiçbir şey yazılmaz. KKM kayıtlarına hiçbir şey yazılmaz.
 */

export const PULLAR_YOLU = 'kkm/pullar.json';

export type PulTasarimDurumu = 'tasarlanmadi' | 'taslak' | 'onayli';
export const PUL_DURUMLARI: Array<{ id: PulTasarimDurumu; ad: string }> = [
  { id: 'tasarlanmadi', ad: 'Tasarlanmadı' },
  { id: 'taslak', ad: 'Taslak' },
  { id: 'onayli', ad: 'Onaylı' },
];

export interface PulKaydi {
  durum: PulTasarimDurumu;
  /** Küçük resim: tam adres ya da ajansın deposunda dosya yolu */
  gorsel?: string;
  canva?: string;
  /** Ayın görevi (yoksa oyunun kazanma koşulu geçer) */
  gorev?: string;
}

export interface PulOyunu {
  id: string;
  ad: string;
  /** İlk aktif ay, "YYYY-AA"; yoksa içinde bulunulan yıl */
  baslangic: string | null;
  kosul?: string;
}

export interface PullarDosyasi {
  guncellendi?: string;
  oyunlar: PulOyunu[];
  pullar: Record<string, Record<string, PulKaydi>>;
}

const AY_BICIMI = /^\d{4}-(0[1-9]|1[0-2])$/;
const CEYREK_BICIMI = /^\d{4}-Q[1-4]$/;
export const gecerliAnahtar = (a: string) => AY_BICIMI.test(a) || CEYREK_BICIMI.test(a);
const durumMu = (d: unknown): d is PulTasarimDurumu => d === 'tasarlanmadi' || d === 'taslak' || d === 'onayli';
const metin = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function pulCoz(v: unknown): PulKaydi | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const gorsel = metin(o.gorsel), canva = metin(o.canva), gorev = metin(o.gorev);
  return {
    durum: durumMu(o.durum) ? o.durum : 'tasarlanmadi',
    ...(gorsel ? { gorsel } : {}), ...(canva ? { canva } : {}), ...(gorev ? { gorev } : {}),
  };
}

/** Dosyanın ham hâlinden ekranın okuduğu hâl (saf iş) */
export function pullariCoz(ham: string): PullarDosyasi {
  const j = JSON.parse(ham) as Record<string, unknown>;
  const oyunlar = (Array.isArray(j.oyunlar) ? j.oyunlar : [])
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && typeof (o as { id?: unknown }).id === 'string')
    .map(o => ({
      id: o.id as string,
      ad: metin(o.ad) || (o.id as string),
      baslangic: typeof o.baslangic === 'string' && AY_BICIMI.test(o.baslangic) ? o.baslangic : null,
      ...(metin(o.kosul) ? { kosul: metin(o.kosul) } : {}),
    }));
  const pullar: PullarDosyasi['pullar'] = {};
  const hamPullar = j.pullar && typeof j.pullar === 'object' ? j.pullar as Record<string, unknown> : {};
  for (const o of oyunlar) {
    const liste = hamPullar[o.id] && typeof hamPullar[o.id] === 'object' ? hamPullar[o.id] as Record<string, unknown> : {};
    pullar[o.id] = {};
    for (const [a, v] of Object.entries(liste)) {
      const p = gecerliAnahtar(a) ? pulCoz(v) : null;
      if (p) pullar[o.id][a] = p;
    }
  }
  return { guncellendi: metin(j.guncellendi), oyunlar, pullar };
}

/** Dosya yoksa null (sayfa "Pul kaydı henüz yok" der); başka hatada hata */
export async function pullariOku(anahtar: string): Promise<PullarDosyasi | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${PULLAR_YOLU}?t=${Date.now()}`);
    return pullariCoz(base64Coz(d.content));
  } catch (e) {
    if (e instanceof GithubHatasi && e.durum === 404) return null;
    throw e;
  }
}

/**
 * Tek pulu değiştirir; dosyanın geri kalanı (açıklama, öbür oyunlar, ajansın
 * eklediği alanlar) olduğu gibi kalır. Durum "tasarlanmadı" ve başka bilgi
 * yoksa pul kayıttan çıkar (kayıtta olmayan pul zaten tasarlanmadı sayılır).
 * Saf iş: girdi dosyanın güncel ham hâli.
 */
export function pulDegistir(ham: string, oyunId: string, anahtar: string, yeni: { durum: PulTasarimDurumu; canva: string }, zaman = new Date()): string {
  const j = JSON.parse(ham) as Record<string, unknown>;
  const pullar = (j.pullar && typeof j.pullar === 'object' ? { ...(j.pullar as Record<string, unknown>) } : {}) as Record<string, Record<string, Record<string, unknown>>>;
  const oyun = { ...(pullar[oyunId] && typeof pullar[oyunId] === 'object' ? pullar[oyunId] : {}) };
  const eski = { ...(oyun[anahtar] && typeof oyun[anahtar] === 'object' ? oyun[anahtar] : {}) };
  const canva = yeni.canva.trim();
  const pul: Record<string, unknown> = { ...eski, durum: yeni.durum };
  if (canva) pul.canva = canva; else delete pul.canva;
  const bosMu = yeni.durum === 'tasarlanmadi' && Object.keys(pul).every(k => k === 'durum');
  if (bosMu) delete oyun[anahtar]; else oyun[anahtar] = pul;
  pullar[oyunId] = oyun;
  return `${JSON.stringify({ ...j, guncellendi: zaman.toISOString(), pullar }, null, 2)}\n`;
}

/** Kemal "Kaydet"e basınca: yalnız bu pul yazılır; dosya yoksa hiçbir şey yazılmaz */
export function pulKaydet(anahtar: string, oyun: PulOyunu, pulAnahtari: string, yeni: { durum: PulTasarimDurumu; canva: string }): Promise<string> {
  return ajansaDosyaYaz(anahtar, PULLAR_YOLU, ham => {
    if (ham === null) throw new Error('Pul kaydı henüz yok; bir şey yazılmadı');
    return pulDegistir(ham, oyun.id, pulAnahtari, yeni);
  }, `KKM pullar: ${oyun.ad} ${pulAnahtari} → ${yeni.durum}`, 'pul kaydı');
}

/** Oyun başına özet: sayılar yalnız kayıttan (tasarlandı = taslak + onaylı) */
export function pulOzeti(pullar: Record<string, PulKaydi> | undefined) {
  const l = Object.values(pullar || {});
  const taslak = l.filter(p => p.durum === 'taslak').length;
  const onayli = l.filter(p => p.durum === 'onayli').length;
  return { tasarlandi: taslak + onayli, onayli, bekliyor: taslak };
}

// ---------------------------------------------------------------- seri düzeni

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const iki = (n: number) => String(n).padStart(2, '0');

export interface SeriAyi { anahtar: string; yil: number; ay: number; /** oyun başlamadan önceki ay */ once: boolean; /** henüz gelmedi */ gelecek: boolean }
export interface SeriCeyregi { anahtar: string; yil: number; ceyrek: 1 | 2 | 3 | 4; aylar: [SeriAyi, SeriAyi, SeriAyi]; once: boolean; gelecek: boolean }
export interface SeriYili { yil: number; ceyrekler: SeriCeyregi[] }

/**
 * Oyunun pul düzeni: başlangıç yılından bugünün yılına kadar her yıl, her
 * yılda dört çeyrek. İleri yıl yalnız kayıtta o yıla ait bir pul varsa
 * görünür (19 Kasım, Kemal 2027'nin ilk çeyreğini onayladı; seri 2026'da
 * bittiği için ekranda yoktu). Saf iş.
 */
export function pulSerisi(baslangic: string | null, bugun = new Date(), kayitlar?: Record<string, PulKaydi>): SeriYili[] {
  const buYil = bugun.getFullYear();
  const buAy = `${buYil}-${iki(bugun.getMonth() + 1)}`;
  const ilk = baslangic || `${buYil}-01`;
  const ilkYil = Number(ilk.slice(0, 4));
  const sonYil = Math.max(ilkYil, buYil, sonKayitYili(kayitlar));
  const yillar: SeriYili[] = [];
  for (let yil = ilkYil; yil <= sonYil; yil++) {
    const ceyrekler = ([1, 2, 3, 4] as const).map(ceyrek => {
      const aylar = [0, 1, 2].map(i => {
        const ay = ceyrek * 3 - 2 + i;
        const anahtar = `${yil}-${iki(ay)}`;
        return { anahtar, yil, ay, once: anahtar < ilk, gelecek: anahtar > buAy };
      }) as [SeriAyi, SeriAyi, SeriAyi];
      return { anahtar: `${yil}-Q${ceyrek}`, yil, ceyrek, aylar, once: aylar.every(a => a.once), gelecek: aylar.some(a => a.gelecek) };
    });
    yillar.push({ yil, ceyrekler });
  }
  return yillar;
}

/** Kayıttaki en ileri pulun yılı (tasarlanmamış kayıt sayılmaz); kayıt yoksa 0 */
export function sonKayitYili(kayitlar?: Record<string, PulKaydi>): number {
  return Object.entries(kayitlar || {})
    .filter(([a, p]) => gecerliAnahtar(a) && p.durum !== 'tasarlanmadi')
    .reduce((en, [a]) => Math.max(en, Number(a.slice(0, 4))), 0);
}

/** "Ocak 2026 · aylık pul" ya da "Ocak–Mart 2026 · büyük pul" */
export function pulAdi(anahtar: string): string {
  const yil = anahtar.slice(0, 4);
  if (CEYREK_BICIMI.test(anahtar)) {
    const c = Number(anahtar.slice(6));
    return `${AY_ADLARI[c * 3 - 3]}–${AY_ADLARI[c * 3 - 1]} ${yil} · büyük pul`;
  }
  return `${AY_ADLARI[Number(anahtar.slice(5, 7)) - 1]} ${yil} · aylık pul`;
}
