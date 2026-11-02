import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Kemal'in istekleri (2 Kasım, yol haritası 7. adım).
 *
 * İki kapı, tek dosya (`kkm/istekler.json`, ajansın gizli deposu):
 *   - Ajan düğmesi: ekranların başındaki tuş; Kemal kendi cümlesiyle ister
 *     (Kemal, Tur 6: "tuş + kendi cümlem"). Kems ilgili ajana verir, sonuç
 *     Onay bekleyenler'e düşer.
 *   - Yapılacak ekle: İşler ve takvim'de not (Kemal: "Kems'in limiti yoksa
 *     bile not alabilmek isterim"). Kems'in çalışmasını beklemez; dosyaya
 *     hemen yazılır, Kems sonraki oturumda panoya ve iş listesine alır.
 *
 * KKM kayıtlarına hiçbir şey yazılmaz; yalnız Kemal "Gönder"e basınca bu dosya.
 */
export const ISTEKLER_YOLU = 'kkm/istekler.json';

export type IstekTuru = 'istek' | 'yapilacak';

export interface KemalIstegi {
  id: string;
  tur: IstekTuru;
  metin: string;
  /** Hangi ekrandan geldi (İçerik, Viki, …) */
  ekran?: string;
  /** Seçildiyse ajan dosyası adı; yoksa Kems dağıtır */
  ajan?: string;
  /** ISO */
  tarih: string;
}

interface IstekDosyasi { istekler: KemalIstegi[] }

export async function istekleriOku(anahtar: string): Promise<KemalIstegi[]> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${ISTEKLER_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as Partial<IstekDosyasi>;
    return (Array.isArray(j.istekler) ? j.istekler : []).filter(i => i && typeof i.id === 'string' && typeof i.metin === 'string');
  } catch (e) {
    if (e instanceof Error && /yazma izni yok/.test(e.message)) return []; // dosya henüz yok
    throw e;
  }
}

/** Yeni isteği dosyanın sonuna ekler (yazmadan hemen önce yeniden okur); güncel listeyi döner */
export async function istekEkle(anahtar: string, yeni: Omit<KemalIstegi, 'id' | 'tarih'>): Promise<KemalIstegi[]> {
  const metin = yeni.metin.trim();
  if (!metin) throw new Error('boş istek gönderilmez');
  const liste = await istekleriOku(anahtar);
  const simdi = new Date();
  const istek: KemalIstegi = {
    id: `${yeni.tur}-${simdi.getTime().toString(36)}`, tur: yeni.tur, metin, tarih: simdi.toISOString(),
    ...(yeni.ekran ? { ekran: yeni.ekran } : {}), ...(yeni.ajan ? { ajan: yeni.ajan } : {})
  };
  const sonraki = [...liste, istek];
  const dosya = {
    _aciklama: "Kemal'in istekleri: ajan düğmesinden (istek) ve İşler ve takvim'deki 'Yapılacak ekle'den (yapilacak). KKM yazar. Kems her oturum başında okur, iş listesine (kkm/isler.json) alır, aldığını buradan çıkarır (araclar/istekler.py).",
    guncellendi: simdi.toISOString(),
    istekler: sonraki
  };
  await ajansaDosyaYaz(anahtar, ISTEKLER_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM: Kemal'in ${yeni.tur === 'istek' ? 'isteği' : 'yapılacak notu'}`, yeni.tur === 'istek' ? 'istek' : 'not');
  return sonraki;
}
