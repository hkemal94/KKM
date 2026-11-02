import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Kimde ne var (2 Kasım, yol haritası 3. adım; Kemal'in yerleşimi, Tur 8:
 * "kimde ne var listesi: ne, kimde, durum, kanıt").
 *
 * İşleri Kems (ajansın ana oturumu) ajansın gizli deposuna `kkm/isler.json`
 * olarak yazar (`araclar/isler.py`); KKM yalnız okur, kayda hiçbir şey
 * yazmaz. Biten iş kanıtla kapanır: kanıtı bir GitHub PR'ıysa ve PR
 * birleştiyse iş ekranda "bitti" görünür (dosya sonra güncellenir).
 */

export const ISLER_YOLU = 'kkm/isler.json';

export type IsDurumu = 'yeni' | 'goruldu' | 'calisiyor' | 'bitti';

export interface AjansIsi {
  id: string;
  metin: string;
  konu?: string;
  durum: IsDurumu;
  /** "Kemal", "Kems" ya da ajan dosyasının adı (ör. kod-gelistiricisi) */
  kimde: string;
  not?: string;
  /** PR, makbuz ya da dosya bağlantısı */
  kanit?: string;
  guncellendi?: string;
  bitti?: string;
}

/** Limit uyarısı (2 Kasım, Kemal: "Kems bildirsin"); KKM sınırı okuyamaz, Kems yazar */
export interface LimitUyarisi { uyari: string; tarih: string }

export interface IsDosyasi { guncellendi: string; isler: AjansIsi[]; limit?: LimitUyarisi }

const DURUMLAR = new Set<IsDurumu>(['yeni', 'goruldu', 'calisiyor', 'bitti']);

/** Ajansın iş dosyasını okur; dosya yoksa null. Anahtar depoyu göremiyorsa hata. */
export async function isleriOku(anahtar: string): Promise<IsDosyasi | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${ISLER_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as Partial<IsDosyasi>;
    const isler = (Array.isArray(j.isler) ? j.isler : [])
      .filter((i): i is AjansIsi => !!i && typeof i.id === 'string' && typeof i.metin === 'string')
      .map(i => ({ ...i, durum: DURUMLAR.has(i.durum) ? i.durum : 'yeni', kimde: i.kimde || 'Kems' }));
    const limit = j.limit && typeof j.limit.uyari === 'string' && j.limit.uyari.trim() ? { uyari: j.limit.uyari, tarih: j.limit.tarih || '' } : undefined;
    return { guncellendi: j.guncellendi || '', isler, ...(limit ? { limit } : {}) };
  } catch (e) {
    if (e instanceof Error && /yazma izni yok/.test(e.message)) {
      try { await github(anahtar, `/repos/${AJANS_DEPOSU}`); }
      catch { throw new Error('anahtar Kems-Ajans deposunu göremiyor; GitHub\'da anahtarın ayarlarına bu depoyu ekle'); }
      return null;
    }
    throw e;
  }
}

/** "https://github.com/sahip/depo/pull/12" → { sahip, depo, no } */
export function prAdresi(kanit?: string): { sahip: string; depo: string; no: number } | null {
  const m = (kanit || '').match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  return m ? { sahip: m[1], depo: m[2], no: Number(m[3]) } : null;
}

/** Kanıt PR'ı birleşti mi; okunamazsa null (ekranda yalnız gösterilmez) */
export async function prBirlestiMi(anahtar: string, kanit: string): Promise<boolean | null> {
  const p = prAdresi(kanit);
  if (!p) return null;
  try {
    const d = await github<{ merged?: boolean }>(anahtar, `/repos/${p.sahip}/${p.depo}/pulls/${p.no}`);
    return !!d.merged;
  } catch { return null; }
}

/** Ajan dosyası adını okunur ada çevirir ("kod-gelistiricisi" → "Kod Geliştiricisi") */
const AJAN_ADLARI: Record<string, string> = {
  'video-yapimcisi': 'Video Yapımcısı', 'video-editoru': 'Video Editörü',
  'sosyal-medya-stratejisti': 'Sosyal Medya Stratejisti', 'sosyal-medya-yapimcisi': 'Sosyal Medya Yapımcısı',
  'sosyal-medya-dagitimcisi': 'Sosyal Medya Dağıtımcısı', 'merch-konseptcisi': 'Merch Konseptçisi',
  'merch-tasarimcisi': 'Merch Tasarımcısı', 'lore-arastirmacisi': 'Lore Araştırmacısı',
  'viki-editoru': 'Viki Editörü', 'kanon-denetcisi': 'Kanon Denetçisi', 'harita-ajani': 'Harita Ajanı',
  'bulten-ajani': 'Bülten Ajanı', 'oyun-tasarimcisi': 'Oyun Tasarımcısı', 'oyun-gelistiricisi': 'Oyun Geliştiricisi',
  'kod-bakimcisi': 'Kod Bakımcısı', 'kod-gelistiricisi': 'Kod Geliştiricisi'
};
export const kimdeAdi = (k: string) => (k === 'Kemal' ? 'Sende' : AJAN_ADLARI[k] || k);

export const DURUM_ADI: Record<IsDurumu, string> = { yeni: 'Yeni', goruldu: 'Görüldü', calisiyor: 'Çalışıyor', bitti: 'Bitti' };

/** Ekrandaki üç öbek: sende bekleyenler, ajansta olanlar, son bitenler */
export function oebekle(isler: AjansIsi[], birlesen: Set<string>) {
  const bittiMi = (i: AjansIsi) => i.durum === 'bitti' || birlesen.has(i.id);
  const acik = isler.filter(i => !bittiMi(i));
  return {
    sende: acik.filter(i => i.kimde === 'Kemal'),
    ajansta: acik.filter(i => i.kimde !== 'Kemal'),
    biten: isler.filter(bittiMi)
  };
}
