import { AJANS_DEPOSU } from './ajansDeposu';
import { anahtarBasligi, belgeyiOku } from './depoBelgesi';
import { gizliAdres } from './oyunAssetleri';

/**
 * Dirlik Stadı bölümü (19 Kasım, Kemal; plan: "KKM'de Imperial gibi ayrı bölüm,
 * tek çatı"). Ortak bina kütüphanesinde The Imperial Kemskoy'un yanında durur:
 * çevrilebilir 3B kompleks modeli, ajansın adım adım planları (1–3), her adımda
 * Kemal'in kararları, viki maddesi ve minigolfün planları.
 *
 * Planlar KKM'ye kopyalanmaz: ajansın deposundan (ana dal) her açılışta okunur,
 * `oneriler/dirlik-stadi-kompleksi/` klasöründen. Kararlar her adımın soru
 * dosyasındaki "Kemal'in cevapları" bölümünden ve "İşlenen … (Kemal)"
 * satırlarından olduğu gibi alınır; KKM hiçbir karar yazısı uydurmaz.
 * Yalnız okur: KKM kayıtlarına da ajansın deposuna da bir şey yazılmaz.
 */

/** Modelin dosyası (`public/modeller/` altında; katalogdaki "dirlik-stadi") */
export { DIRLIK_MODELI } from './binaKutuphanesi';

/** Vikideki madde */
export const DIRLIK_MADDESI = 'viki_mekan_dirlik_stadi';

/** Ajansın planlarının klasörü (ana dal) */
export const PLAN_KLASORU = 'oneriler/dirlik-stadi-kompleksi';

/** Minigolfün çizim listesi (ilk tur bu statta) */
export const MINIGOLF_DEPOSU = 'hkemal94/minigolf';

export interface PlanAdimi {
  no: number;
  /** Çizim (PNG) */
  gorsel: string;
  /** Soruların ve Kemal'in cevaplarının dosyası */
  sorular: string;
}

export const PLAN_ADIMLARI: PlanAdimi[] = [
  { no: 1, gorsel: 'adim-1-yerlesim.png', sorular: 'adim-1-sorular.md' },
  { no: 2, gorsel: 'adim-2-tribun-alti.png', sorular: 'adim-2-sorular.md' },
  { no: 3, gorsel: 'adim-3-kulup-binasi.png', sorular: 'adim-3-sorular.md' }
];

export interface AdimKararlari {
  /** Dosyanın başlığındaki konu ("genel yerleşim"); bulunamazsa boş */
  konu: string;
  /** "Kemal'in cevapları" bölümünün başlığındaki ek ("19 Kasım"); yoksa boş */
  cevapTarihi: string;
  /** "Kemal'in cevapları" bölümünün maddeleri; bölüm yoksa null */
  cevaplar: string[] | null;
  /** "İşlenen … (Kemal): …" satırları: bu çizime işlenmiş önceki kararlar */
  islenenler: string[];
  /** "Hâlâ DENEME: …" satırları: Kemal'in onaylamadığı ölçüler */
  denemeler: string[];
}

/**
 * Bölümün kısa listesi: numaralı maddeler ("1. …"); numaralı madde yoksa düz
 * maddeler ("- …"). Girintili alt satırlar maddeye eklenir; numaralı listeden
 * sonraki düz alt liste ("Bu cevaplarla değişenler") alınmaz.
 */
function maddeler(satirlar: string[]): string[] {
  const numarali = satirlar.some(s => /^\d+\.\s/.test(s));
  const bas = numarali ? /^\d+\.\s+/ : /^-\s+/;
  const cikti: string[] = [];
  let icinde = false;
  for (const s of satirlar) {
    if (bas.test(s)) { cikti.push(s.replace(bas, '').trim()); icinde = true; continue; }
    if (icinde && /^\s+\S/.test(s)) { cikti[cikti.length - 1] += ` ${s.trim()}`; continue; }
    icinde = false;
  }
  return cikti;
}

/** Soru dosyasından adımın konusu ve Kemal'in kararları */
export function kararlariCoz(md: string): AdimKararlari {
  const satirlar = md.replace(/\r\n?/g, '\n').split('\n');
  const ilk = satirlar.find(s => /^#\s/.test(s)) ?? '';
  const konu = (ilk.match(/\d+\.\s*adım:\s*([^·]+)/i)?.[1] ?? '').trim();

  let cevaplar: string[] | null = null;
  let cevapTarihi = '';
  const bas = satirlar.findIndex(s => /^##\s+Kemal'in cevapları/i.test(s));
  if (bas >= 0) {
    cevapTarihi = (satirlar[bas].match(/\(([^)]+)\)/)?.[1] ?? '').trim();
    const son = satirlar.findIndex((s, i) => i > bas && /^##\s/.test(s));
    cevaplar = maddeler(satirlar.slice(bas + 1, son < 0 ? undefined : son).filter(s => s.trim()));
  }

  const islenenler = satirlar
    .filter(s => /^-\s+İşlenen\b.*\(Kemal\)/.test(s))
    .map(s => s.replace(/^-\s+/, '').trim());

  const denemeler = satirlar
    .filter(s => /^-\s+Hâlâ DENEME\b/.test(s))
    .map(s => s.replace(/^-\s+Hâlâ DENEME:?\s*/, '').trim());

  return { konu, cevapTarihi, cevaplar, islenenler, denemeler };
}

/** Yazıyı DENEME sözcüğünden böler (ekranda DENEME ayrı işaretle görünür) */
export const denemeyeBol = (metin: string): string[] => metin.split(/(\bDENEME\b)/);

export type OkumaHatasi = 'anahtar-yok' | 'ana-dalda-yok' | 'sinir' | 'hata';

const hataTuru = (e: unknown): OkumaHatasi => {
  const m = e instanceof Error ? e.message : String(e);
  if (/404/.test(m)) return 'ana-dalda-yok';
  if (/403/.test(m)) return 'sinir';
  return 'hata';
};

export interface OkunanAdim extends PlanAdimi {
  /** Görselin tarayıcı içi adresi; okunamadıysa null */
  adres: string | null;
  kararlar: AdimKararlari | null;
}

export interface EskiCizim { yol: string; ad: string; adres: string | null }

export interface OkunanPlanlar {
  adimlar: OkunanAdim[];
  eskiler: EskiCizim[];
  /** Hiçbir dosya okunamadıysa nedeni */
  hata: OkumaHatasi | null;
}

/** Eski çizimin okunur adı: "adim-1-yerlesim-2026-11-16.png" → "Adım 1 · 16.11.2026" */
export function eskiAdi(dosya: string): string {
  const m = dosya.match(/^adim-(\d+)-.*?(\d{4})-(\d{2})-(\d{2})(?:-([a-z0-9-]+))?\.\w+$/i);
  if (!m) return dosya;
  return `Adım ${m[1]} · ${m[4]}.${m[3]}.${m[2]}${m[5] ? ` · ${m[5].replace(/-/g, ' ')}` : ''}`;
}

/** Ajansın ana dalından planları, kararları ve eski çizimleri okur */
export async function planlariOku(): Promise<OkunanPlanlar> {
  if (!Object.keys(anahtarBasligi()).length) return { adimlar: [], eskiler: [], hata: 'anahtar-yok' };
  let ilkHata: OkumaHatasi | null = null;
  const adimlar = await Promise.all(PLAN_ADIMLARI.map(async (a): Promise<OkunanAdim> => {
    const [adres, kararlar] = await Promise.all([
      gizliAdres(AJANS_DEPOSU, `${PLAN_KLASORU}/${a.gorsel}`).catch(e => { ilkHata ??= hataTuru(e); return null; }),
      belgeyiOku(AJANS_DEPOSU, [`${PLAN_KLASORU}/${a.sorular}`]).then(b => kararlariCoz(b.metin)).catch(e => { ilkHata ??= hataTuru(e); return null; })
    ]);
    return { ...a, adres, kararlar };
  }));

  let eskiler: EskiCizim[] = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${AJANS_DEPOSU}/contents/${PLAN_KLASORU}/eski`, { cache: 'no-cache', headers: anahtarBasligi() });
    if (r.ok) {
      const liste: { name: string; path: string; type: string }[] = await r.json();
      eskiler = await Promise.all(liste
        .filter(d => d.type === 'file' && /\.(png|jpe?g|webp)$/i.test(d.name))
        .sort((x, y) => x.name.localeCompare(y.name, 'tr'))
        .map(async d => ({ yol: d.path, ad: eskiAdi(d.name), adres: await gizliAdres(AJANS_DEPOSU, d.path).catch(() => null) })));
    }
  } catch { /* eski çizimler okunamazsa bölüm görünmez */ }

  const hicbiri = adimlar.every(a => !a.adres && !a.kararlar);
  return { adimlar, eskiler, hata: hicbiri ? (ilkHata ?? 'hata') : null };
}
