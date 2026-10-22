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

const HAFTA_ICI_4: GunKodu[] = ['MO', 'TU', 'WE', 'TH'];

export const AJANS_ISLERI: AjansIsi[] = [
  { id: 'sabah-plani', saat: '07:50', ad: 'Sabah planı', not: 'Yeni işleri atar; gece yapılanları, birleştirilecek PR\'ları ve Kemal\'den beklenenleri panoya yazar.' },
  { id: 'aksam-kapanisi', saat: '19:50', ad: 'Akşam kapanışı', not: 'Bitenleri toplar, günün kapanışını yazar.' },
  { id: 'gece-isleri', saat: '00:53', ad: 'Gece işleri', not: 'Kemal\'den bir şey beklemeyen bütün işler ilgili ajanlara yaptırılır; çıktılar sabaha PR olarak hazır olur.' },
  { id: 'gece-viki', saat: '00:53', ad: 'Gece: Evren, viki ve kanon taraması', not: 'Öneriler panoya düğmeli soru olur.' },
  { id: 'gece-oyun', saat: '00:53', ad: 'Gece: Oyun kontrolü', gunler: HAFTA_ICI_4, not: 'Derleme ve test kontrolü.' },
  { id: 'gece-marka', saat: '00:53', ad: 'Gece: Marka ve Merch + Marka Denetçisi', gunler: ['FR'], not: 'Drop önerisi ve haftanın marka denetimi.' },
  { id: 'gece-icerik', saat: '00:53', ad: 'Gece: İçerik', gunler: ['SA'], not: 'Gelecek haftanın paylaşım takvimi.' },
  { id: 'gece-teknik', saat: '00:53', ad: 'Gece: Teknik', gunler: ['SU'], not: 'Kod taraması.' }
];

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
