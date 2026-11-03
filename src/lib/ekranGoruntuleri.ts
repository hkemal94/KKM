import { belgeyiOku, hamAdres } from './depoBelgesi';
import { assetleriListele, type Asset } from './oyunAssetleri';

/**
 * Oyunun gerçek ekran görüntüleri (3 Kasım, Kemal). Oyun deposunun
 * `docs/ekran-goruntuleri/liste.json` dosyası her açılışta okunur; yalnız
 * gösterilir, KKM kayıtlarına ve oyunun deposuna hiçbir şey yazılmaz.
 *
 * Eski taslak görseller (`docs/gorseller/`, `docs/ekran/`) silinmez; ekranda
 * "İlham / taslak" diye ayrı durur.
 */

export const EKRAN_KLASORU = 'docs/ekran-goruntuleri/';
export const LISTE_YOLU = `${EKRAN_KLASORU}liste.json`;
export const TASLAK_KLASORLERI = ['docs/gorseller/', 'docs/ekran/'];

export type Cihaz = 'telefon' | 'masaustu' | 'diger';
export interface EkranGoruntusu { dosya: string; baslik: string; tarih: string; cihaz: string; tur: Cihaz; adres: string }

/** "telefon (dik, 390x844)" → telefon; "masaüstü (1440x900)" → masaustu */
export function cihazTuru(cihaz: string, dosya: string): Cihaz {
  const s = `${cihaz} ${dosya}`.toLocaleLowerCase('tr');
  if (s.includes('telefon')) return 'telefon';
  if (s.includes('masaüstü') || s.includes('masaustu')) return 'masaustu';
  return 'diger';
}

/** liste.json'u çözer: `{ goruntuler: [...] }` ya da düz dizi; bozuk satır atlanır */
export function listeyiCoz(depo: string, metin: string): EkranGoruntusu[] {
  const veri = JSON.parse(metin) as unknown;
  const satirlar = Array.isArray(veri) ? veri : (veri as { goruntuler?: unknown })?.goruntuler;
  if (!Array.isArray(satirlar)) return [];
  return satirlar
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as { dosya?: unknown }).dosya === 'string')
    .map(s => {
      const dosya = String(s.dosya).replace(/^\.?\//, '');
      const cihaz = typeof s.cihaz === 'string' ? s.cihaz : '';
      return {
        dosya,
        baslik: typeof s.baslik === 'string' ? s.baslik : '',
        tarih: typeof s.tarih === 'string' ? s.tarih : '',
        cihaz,
        tur: cihazTuru(cihaz, dosya),
        adres: hamAdres(depo, `${EKRAN_KLASORU}${dosya}`),
      };
    });
}

/** Listeyi okur; okunamazsa boş liste (ekranda "henüz ekran görüntüsü yok") */
export async function ekranGoruntuleriniOku(depo: string): Promise<EkranGoruntusu[]> {
  try {
    const { metin } = await belgeyiOku(depo, [LISTE_YOLU]);
    return listeyiCoz(depo, metin);
  } catch {
    return [];
  }
}

/** Eski taslak görseller; okunamazsa boş liste */
export async function taslaklariOku(depo: string): Promise<Asset[]> {
  try {
    const hepsi = await assetleriListele(depo, 'docs/');
    return hepsi.filter(a => a.tur === 'gorsel' && TASLAK_KLASORLERI.some(k => a.yol.startsWith(k)));
  } catch {
    return [];
  }
}

/** "2026-11-03" → "3 Kasım 2026"; çözülemezse olduğu gibi */
export function tarihYazisi(tarih: string): string {
  const m = tarih.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return tarih;
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const ay = aylar[Number(m[2]) - 1];
  return ay ? `${Number(m[3])} ${ay} ${m[1]}` : tarih;
}
