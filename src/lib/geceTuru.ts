import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Gece turunun özeti (12 Kasım, Kemal: "sabahları bana bir tepside sunsun").
 *
 * Her gece tek tur çalışır; ajansın `araclar/gece_turu.py` aracı turun
 * sonucunu `kkm/gece-turu.json`'a yazar: hangi ajan ne getirdi, kim iş
 * bulamadı, günün görselleri. Görseller ana dalda değil, `gorselDali`
 * dalında durur. KKM yalnız okur; kayda hiçbir şey yazılmaz.
 */

export const GECE_TURU_YOLU = 'kkm/gece-turu.json';

export interface TurAjani { ajan: string; durum: 'uretti' | 'is-yok' | 'atlandi'; ozet?: string; oneri?: string }
export interface TurGorseli { yol: string; baslik?: string; ajan?: string; oneri?: string }
export interface GeceTuru { tarih: string; ajanlar: TurAjani[]; gorseller: TurGorseli[] }
export interface GeceTuruDosyasi { turlar: GeceTuru[]; gorselDali: string; guncellendi?: string }

/** Ajan dosyasının adından okunur ad (kadro, 2 Kasım) */
export const AJAN_ADLARI: Record<string, string> = {
  kems: 'Kems',
  'lore-arastirmacisi': 'Lore Araştırmacısı',
  'viki-editoru': 'Viki Editörü',
  'kanon-denetcisi': 'Kanon Denetçisi',
  'harita-ajani': 'Harita Ajanı',
  'video-yapimcisi': 'Video Yapımcısı',
  'video-editoru': 'Video Editörü',
  'sosyal-medya-stratejisti': 'Sosyal Medya Stratejisti',
  'sosyal-medya-yapimcisi': 'Sosyal Medya Yapımcısı',
  'sosyal-medya-dagitimcisi': 'Sosyal Medya Dağıtımcısı',
  'merch-konseptcisi': 'Merch Konseptçisi',
  'merch-tasarimcisi': 'Merch Tasarımcısı',
  'bulten-ajani': 'Bülten Ajanı',
  'oyun-tasarimcisi': 'Oyun Tasarımcısı',
  'oyun-gelistiricisi': 'Oyun Geliştiricisi',
  'kod-bakimcisi': 'Kod Bakımcısı',
  'kod-gelistiricisi': 'Kod Geliştiricisi',
};
export const ajanAdi = (ad: string) => AJAN_ADLARI[ad] || ad;

export async function geceTurunuOku(anahtar: string): Promise<GeceTuruDosyasi | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${GECE_TURU_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as Partial<GeceTuruDosyasi>;
    const turlar = Array.isArray(j.turlar) ? j.turlar.filter(t => t && typeof t.tarih === 'string') : [];
    return {
      turlar: turlar.map(t => ({ tarih: t.tarih, ajanlar: Array.isArray(t.ajanlar) ? t.ajanlar : [], gorseller: Array.isArray(t.gorseller) ? t.gorseller : [] }))
        .sort((a, b) => b.tarih.localeCompare(a.tarih)),
      gorselDali: typeof j.gorselDali === 'string' ? j.gorselDali : 'gece-turu-gorseller',
      guncellendi: j.guncellendi,
    };
  } catch {
    return null; // ilk tur henüz çalışmadı
  }
}

/** Gizli depodaki görsel: anahtarla indirilir, tarayıcıda geçici adres olur (bellekte tutulur) */
const gorselOnbellek = new Map<string, Promise<string>>();
export function gorselAdresi(anahtar: string, dal: string, yol: string): Promise<string> {
  const k = `${dal}:${yol}`;
  let p = gorselOnbellek.get(k);
  if (!p) {
    p = fetch(`https://api.github.com/repos/${AJANS_DEPOSU}/contents/${yol.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(dal)}`, {
      headers: { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${anahtar}`, 'X-GitHub-Api-Version': '2022-11-28' },
    }).then(async r => {
      if (!r.ok) throw new Error(`görsel okunamadı (${r.status})`);
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => gorselOnbellek.delete(k));
    gorselOnbellek.set(k, p);
  }
  return p;
}

/** "13 Kasım Cuma" */
export const turGunuYazi = (tarih: string) => {
  const [y, a, g] = tarih.split('-').map(Number);
  return new Date(y, a - 1, g).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
};
