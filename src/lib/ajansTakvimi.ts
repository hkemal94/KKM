/**
 * Ajansın düzenli işleri (Takvim sayfasında "Ajans" etiketiyle görünür).
 * Kaynak: Kems-Ajans CLAUDE.md → Zamanlı görevler (22 Ekim).
 * Saatler İstanbul. Zamanlayıcı değişirse bu liste de aynı PR'da güncellenir.
 *
 * Yalnız ekranda gösterilir ve .ics olarak dışa aktarılır; kayda yazılmaz.
 */
import type { IcsEtkinlik } from './takvimIcs';

export type GunKodu = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface AjansIsi {
  id: string;
  /** 'SS:DD', İstanbul */
  saat: string;
  ad: string;
  /** Hangi günler; boşsa her gün */
  gunler?: GunKodu[];
  /** Kısa açıklama (etkinlik notu) */
  not?: string;
}

/**
 * 2 Kasım (yeni ajan kadrosu): ajansın zamanlı işlerinin hepsi kapalı (Kemal,
 * 28 Ekim). Eski düzenin sabah planı, gece işleri ve kapanışı listeden çıktı.
 * Zamanlayıcı açılınca (yol haritası 4. adım) yalnız evren ajanları (Lore
 * Araştırmacısı, Viki Editörü, Kanon Denetçisi) her gece az az çalışacak;
 * o gün bu liste aynı PR'da doldurulur.
 */
export const AJANS_ISLERI: AjansIsi[] = [];

/** Date.getDay() (0 = Pazar) → gün kodu */
const GUN_KODLARI: GunKodu[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const gunKodu = (tarih: string): GunKodu => GUN_KODLARI[new Date(tarih + 'T12:00').getDay()];

/** Bir günün ajans işleri, saate göre */
export function ajansGunu(tarih: string): AjansIsi[] {
  const k = gunKodu(tarih);
  return AJANS_ISLERI
    .filter(i => !i.gunler || i.gunler.includes(k))
    .sort((a, b) => a.saat.localeCompare(b.saat) || a.ad.localeCompare(b.ad, 'tr'));
}

/** .ics başlangıcı: ilk etkinlik bu günden sonraki ilk uygun günde başlar (zamanlayıcıların kurulduğu gün) */
export const AJANS_ICS_BASLANGIC = '2026-10-22';

/** Ajansın düzenli işleri tekrarlayan etkinlik olarak */
export function ajansIcsEtkinlikleri(baslangic: string = AJANS_ICS_BASLANGIC): IcsEtkinlik[] {
  return AJANS_ISLERI.map(i => {
    let ilk = baslangic;
    if (i.gunler) {
      const d = new Date(baslangic + 'T12:00');
      while (!i.gunler.includes(GUN_KODLARI[d.getDay()])) d.setDate(d.getDate() + 1);
      ilk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return {
      uid: `ajans-${i.id}@kkm.kems`,
      baslik: `Ajans: ${i.ad}`,
      aciklama: i.not,
      tarih: ilk,
      saat: i.saat,
      sureDk: 15,
      kural: i.gunler ? `FREQ=WEEKLY;BYDAY=${i.gunler.join(',')}` : 'FREQ=DAILY'
    };
  });
}
