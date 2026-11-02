import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Ajanlar ve otomasyonlar (2 Kasım, yol haritası 4. adım).
 *
 * Ajan kartları ajansın gizli deposundaki `.claude/agents/*.md` dosyalarından
 * okunur (ad, açıklama, model); kadro değişirse ekran kendiliğinden değişir.
 * Hat ve KKM ekranı aşağıdaki tablodan (Kemal'in kadrosu, 2 Kasım).
 *
 * Zamanlayıcı ayarı `kkm/zamanlayici.json`: Kemal "Kaydet"e basınca KKM
 * yazar. Ayar kendi başına bir şey çalıştırmaz; Kemal "başla" deyince Kems
 * onu Claude'da zamanlı görevlere çevirir. KKM kayıtlarına hiçbir şey yazılmaz.
 */

export const AJANLAR_KLASORU = '.claude/agents';
export const ZAMANLAYICI_YOLU = 'kkm/zamanlayici.json';

export interface AjanBilgisi {
  /** Dosya adı (ör. kod-gelistiricisi) */
  ad: string;
  /** Okunur ad (açıklamanın ilk cümlesi) */
  baslik: string;
  aciklama: string;
  model: string;
  /** Dosyadaki model kodu (opus · sonnet · haiku) */
  modelKodu?: string;
  hat: string;
  ekran: string;
  /** Künye: kullandığı araçlar ve dosyanın gövdesi (görevi, kuralları) */
  araclar?: string;
  govde?: string;
}

/** Kadronun hattı ve bağlı olduğu KKM ekranı (docs/ajan-soru-turu.md) */
const HATLAR: Record<string, { hat: string; ekran: string }> = {
  'video-yapimcisi': { hat: 'Video', ekran: 'İçerik' },
  'video-editoru': { hat: 'Video', ekran: 'İçerik' },
  'sosyal-medya-stratejisti': { hat: 'Sosyal medya', ekran: 'İçerik' },
  'sosyal-medya-yapimcisi': { hat: 'Sosyal medya', ekran: 'İçerik' },
  'sosyal-medya-dagitimcisi': { hat: 'Sosyal medya', ekran: 'İçerik' },
  'merch-konseptcisi': { hat: 'Merch', ekran: 'Marka ve merch' },
  'merch-tasarimcisi': { hat: 'Merch', ekran: 'Marka ve merch' },
  'lore-arastirmacisi': { hat: 'Evren', ekran: 'Viki' },
  'viki-editoru': { hat: 'Evren', ekran: 'Viki' },
  'kanon-denetcisi': { hat: 'Evren', ekran: 'Viki' },
  'harita-ajani': { hat: 'Harita', ekran: 'Harita ve Kurucu' },
  'bulten-ajani': { hat: 'Bülten', ekran: 'İçerik' },
  'oyun-tasarimcisi': { hat: 'Oyun', ekran: 'Oyunlar' },
  'oyun-gelistiricisi': { hat: 'Oyun', ekran: 'Oyunlar' },
  'kod-bakimcisi': { hat: 'Kod', ekran: 'Ajanlar ve otomasyonlar' },
  'kod-gelistiricisi': { hat: 'Kod', ekran: 'Ajanlar ve otomasyonlar' }
};
/** Bir KKM ekranına bağlı ajanlar (ajan düğmesinde seçim için) */
export const ekranAjanlari = (ekran: string) => Object.entries(HATLAR).filter(([, h]) => h.ekran === ekran).map(([ad]) => ad);
const HAT_SIRASI = ['Video', 'Sosyal medya', 'Merch', 'Evren', 'Harita', 'Bülten', 'Oyun', 'Kod'];

/** Kems (CEO): dosyası yok, ana oturumdur */
export const KEMS: AjanBilgisi = {
  ad: 'Kems', baslik: 'Kems (CEO)', model: 'güçlü', hat: 'Yönetim', ekran: 'Ajans',
  aciklama: 'İşi dağıtır, takip eder, çıktıları sana gelmeden ön elemeden geçirir (marka denetimi dahil). Ana oturumdur; sen yazınca çalışır.'
};

/** Evren ajanları: zamanlayıcı açılınca her gece az az (Kemal, 2 Kasım) */
export const EVREN_AJANLARI = ['lore-arastirmacisi', 'viki-editoru', 'kanon-denetcisi'];

export const MODEL_ADI: Record<string, string> = { opus: 'güçlü', sonnet: 'orta', haiku: 'hızlı' };
export type ModelKodu = 'opus' | 'sonnet' | 'haiku';
export const MODELLER: Array<{ kod: ModelKodu; ad: string; aciklama: string }> = [
  { kod: 'opus', ad: 'Güçlü', aciklama: 'en dikkatli; limitten en çok yer' },
  { kod: 'sonnet', ad: 'Orta', aciklama: 'çoğu iş için yeterli' },
  { kod: 'haiku', ad: 'Hızlı', aciklama: 'kısa ve basit işler; limitten az yer' }
];

/** Dosyanın baş kısmını (--- ... ---) okur */
export function ajanDosyasiniCoz(ad: string, metin: string): AjanBilgisi | null {
  const m = metin.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const alan: Record<string, string> = {};
  for (const satir of m[1].split('\n')) {
    const i = satir.indexOf(': ');
    if (i > 0) alan[satir.slice(0, i).trim()] = satir.slice(i + 2).trim();
  }
  const aciklama = alan.description || '';
  const nokta = aciklama.indexOf('. ');
  const h = HATLAR[ad] || { hat: 'Diğer', ekran: '—' };
  return {
    ad, baslik: nokta > 0 ? aciklama.slice(0, nokta) : ad,
    aciklama: nokta > 0 ? aciklama.slice(nokta + 2) : aciklama,
    model: MODEL_ADI[alan.model] || alan.model || '—', modelKodu: alan.model, ...h,
    araclar: alan.tools || '', govde: metin.slice(m[0].length).trim()
  };
}

/** Ajans deposundaki ajanlar, hat sırasıyla */
export async function ajanlariOku(anahtar: string): Promise<AjanBilgisi[]> {
  const liste = await github<Array<{ name: string; type: string }>>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${AJANLAR_KLASORU}`);
  const dosyalar = liste.filter(f => f.type === 'file' && f.name.endsWith('.md'));
  const ajanlar = await Promise.all(dosyalar.map(async f => {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${AJANLAR_KLASORU}/${f.name}`);
    return ajanDosyasiniCoz(f.name.slice(0, -3), base64Coz(d.content));
  }));
  return ajanlar.filter((a): a is AjanBilgisi => !!a)
    .sort((a, b) => (HAT_SIRASI.indexOf(a.hat) - HAT_SIRASI.indexOf(b.hat)) || a.baslik.localeCompare(b.baslik, 'tr'));
}

// ---------------------------------------------------------------- zamanlayıcı

export type GunKodu = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export const GUNLER: Array<{ kod: GunKodu; ad: string }> = [
  { kod: 'MO', ad: 'Pzt' }, { kod: 'TU', ad: 'Sal' }, { kod: 'WE', ad: 'Çar' }, { kod: 'TH', ad: 'Per' },
  { kod: 'FR', ad: 'Cum' }, { kod: 'SA', ad: 'Cmt' }, { kod: 'SU', ad: 'Paz' }
];

export interface AjanZamani {
  acik: boolean;
  /** her gün · haftanın seçili günleri · tek bir tarih */
  tur: 'hergun' | 'gunler' | 'tarih';
  /** 'SS:DD', İstanbul */
  saat: string;
  gunler?: GunKodu[];
  /** YYYY-AA-GG */
  tarih?: string;
}

export interface Zamanlayici { guncellendi?: string; ajanlar: Record<string, AjanZamani> }

/** Ayar yoksa: hepsi kapalı; evren ajanlarına önerilen saat gece 01:00 */
export const varsayilanZaman = (ad: string): AjanZamani => ({ acik: false, tur: 'hergun', saat: EVREN_AJANLARI.includes(ad) ? '01:00' : '09:00' });

export async function zamanlayiciOku(anahtar: string): Promise<Zamanlayici> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${ZAMANLAYICI_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as Partial<Zamanlayici>;
    return { guncellendi: j.guncellendi, ajanlar: (j.ajanlar && typeof j.ajanlar === 'object') ? j.ajanlar : {} };
  } catch {
    return { ajanlar: {} }; // ilk kez: dosya yok
  }
}

/** Ayarı ajansın deposuna yazar (Kemal "Kaydet"e basınca); GitHub adresini döner */
export function zamanlayiciYaz(anahtar: string, ajanlar: Record<string, AjanZamani>): Promise<string> {
  const temiz: Record<string, AjanZamani> = {};
  for (const [ad, z] of Object.entries(ajanlar)) {
    temiz[ad] = {
      acik: !!z.acik, tur: z.tur, saat: /^\d{2}:\d{2}$/.test(z.saat) ? z.saat : '09:00',
      ...(z.tur === 'gunler' && z.gunler?.length ? { gunler: z.gunler } : {}),
      ...(z.tur === 'tarih' && z.tarih ? { tarih: z.tarih } : {})
    };
  }
  const dosya = {
    _aciklama: "Ajanların zamanlayıcısı. Kemal KKM → Ajanlar ve otomasyonlar → Zamanlayıcı'da 'Kaydet'e basınca yazılır. Kendi başına bir şey çalıştırmaz; Kemal 'başla' deyince Kems Claude'da zamanlı görevlere çevirir. Saatler İstanbul.",
    guncellendi: new Date().toISOString(),
    ajanlar: temiz
  };
  const acik = Object.values(temiz).filter(z => z.acik).length;
  return ajansaDosyaYaz(anahtar, ZAMANLAYICI_YOLU, `${JSON.stringify(dosya, null, 2)}\n`, `KKM zamanlayıcı: ${acik} ajan açık`, 'zamanlayıcı');
}

/** "Her gün 01:00", "Pzt, Çar 09:00", "5 Kasım 10:00", "Kapalı" */
export function zamanOzeti(z: AjanZamani): string {
  if (!z.acik) return 'Kapalı';
  if (z.tur === 'gunler') return `${(z.gunler || []).map(g => GUNLER.find(x => x.kod === g)?.ad).filter(Boolean).join(', ') || 'gün seçilmedi'} ${z.saat}`;
  if (z.tur === 'tarih') {
    if (!z.tarih) return `tarih seçilmedi ${z.saat}`;
    const [y, a, g] = z.tarih.split('-').map(Number);
    return `${new Date(y, a - 1, g).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${z.saat}`;
  }
  return `Her gün ${z.saat}`;
}

// ---------------------------------------------------------------- model seçimi

/**
 * Ajanların modeli (2 Kasım, Kemal: "ilgili ajanın hangi yapay zekâ modelini
 * kullanacağını seçebileyim"). Kemal kartta seçer, "Kaydet"le
 * `kkm/ajan-modelleri.json`'a yazılır; Kems ajanı çalıştırırken bu modeli
 * kullanır. Seçim yoksa ajan dosyasındaki model geçerli. Yalnız Claude
 * modelleri (ajanlar Claude'un içinde çalışır).
 */
export const MODELLER_YOLU = 'kkm/ajan-modelleri.json';

export async function modelleriOku(anahtar: string): Promise<Record<string, ModelKodu>> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${MODELLER_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as { ajanlar?: Record<string, string> };
    return Object.fromEntries(Object.entries(j.ajanlar || {}).filter(([, m]) => MODELLER.some(x => x.kod === m))) as Record<string, ModelKodu>;
  } catch {
    return {}; // ilk kez: dosya yok
  }
}

export function modelleriYaz(anahtar: string, modeller: Record<string, ModelKodu>): Promise<string> {
  const dosya = {
    _aciklama: "Ajanların modeli. Kemal KKM → Ajanlar ve otomasyonlar'da ajan kartından seçip 'Kaydet'e basınca yazılır. Kems ajanı çalıştırırken bu modeli kullanır; listede olmayan ajan kendi dosyasındaki modelle çalışır.",
    guncellendi: new Date().toISOString(),
    ajanlar: modeller
  };
  return ajansaDosyaYaz(anahtar, MODELLER_YOLU, `${JSON.stringify(dosya, null, 2)}\n`, `KKM ajan modelleri: ${Object.keys(modeller).length} seçim`, 'model ayarı');
}
