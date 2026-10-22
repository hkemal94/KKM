import { useMemo } from 'react';
import type { Item, WikiSection } from '../types';
import { bekleyenAdaylar, sorulacaklar } from './adaylar';
import { bekleyenDugmeler } from './bekleyenIsler';
import { tarihUyarilari, type TarihUyarisi } from './kanonTarihleri';
import { useHaritaDuzeni } from './haritaDuzeni';
import { gununSorusuAcik } from './oneriKanallari';

/**
 * Bildirimler — menüdeki kırmızı nokta (Paket 4).
 *
 * Kemal'in seçimi (29 Eylül): onay bekleyen aday, tek seferlik düğme,
 * kanon uyarısı, günün sorusu — dördü de. Şimdilik yalnız uygulama içi;
 * telefon bildirimi ve e-posta ayrı bir iş.
 */

export type BildirimTuru = 'aday' | 'dugme' | 'kanon' | 'soru' | 'yedek';

export interface Bildirim {
  tur: BildirimTuru;
  sayi: number;
  baslik: string;
  ayrinti: string;
  /** Kanon uyarısında sorunlu maddeler */
  maddeler?: Item[];
  /** Kanon uyarısının ayrıntısı: hangi cümle, kanonda ne yazıyor */
  kanon?: KanonSatiri[];
}

export interface KanonSatiri { madde: Item; uyari: TarihUyarisi }

/** Kemal'in "yanlış alarm" dediği uyarılar maddede durur (2 Ekim) */
export const KANON_YOKSAY = 'kanonYoksay';

const CEVAP_ANAHTARI = 'kems_gunun_sorusu';
const bugun = () => new Date().toISOString().slice(0, 10);

/** Günün sorusu bugün cevaplandı ya da ertelendi */
export function gununSorusuBitti() {
  try { localStorage.setItem(CEVAP_ANAHTARI, bugun()); } catch { /* yok */ }
}
function gununSorusuBittiMi(): boolean {
  try { return localStorage.getItem(CEVAP_ANAHTARI) === bugun(); } catch { return false; }
}

const KANON_TURLERI = new Set(['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'olay', 'kitap_bolum', 'blog_post']);

/** Son yedekten bu yana geçen gün (Yedekleme penceresi yazar); hiç yoksa null */
function sonYedekGunu(): number | null {
  try {
    const v = Number(localStorage.getItem('kems_son_yedek'));
    return v ? Math.floor((Date.now() - v) / 86_400_000) : null;
  } catch { return null; }
}

/** Metninde kanonla çelişen bir tarih geçen maddeler ve cümleleri */
export function kanonSatirlari(items: Item[]): KanonSatiri[] {
  return items.flatMap(i => {
    if (i.archived || !KANON_TURLERI.has(i.type)) return [];
    const yoksay = new Set(((i.metadata?.[KANON_YOKSAY] as string[] | undefined) || []));
    const bolumler = ((i.metadata?.wikiSections as WikiSection[] | undefined) || []).map(b => b.content || '').join('\n\n');
    return tarihUyarilari([i.notes || '', bolumler].join('\n\n'))
      .filter(u => !yoksay.has(u.anahtar))
      .map(uyari => ({ madde: i, uyari }));
  });
}

export function kanonUyarililar(items: Item[]): Item[] {
  const gorulen = new Set<string>();
  return kanonSatirlari(items).map(s => s.madde).filter(m => !gorulen.has(m.id) && !!gorulen.add(m.id));
}

export function useBildirimler(items: Item[], yenile = 0): Bildirim[] {
  const harita = useHaritaDuzeni();
  const haritaEski = !!(harita.duzen?.eskiKoordinat && harita.ilkYukleme);
  return useMemo(() => {
    if (!items.length) return [];
    const liste: Bildirim[] = [];
    const aday = bekleyenAdaylar(items).length;  // eski öneriler bildirim değil; Temizlik kartında
    if (aday) liste.push({ tur: 'aday', sayi: aday, baslik: 'Onay bekleyen öneri', ayrinti: 'Öneri tepsisinde · stüdyo' });
    if (gununSorusuAcik(items) && !gununSorusuBittiMi() && sorulacaklar(items, 1).length) {
      liste.push({ tur: 'soru', sayi: 1, baslik: 'Günün sorusu', ayrinti: 'Henüz cevaplanmadı' });
    }
    const dugme = bekleyenDugmeler(items, haritaEski);
    if (dugme.length) liste.push({ tur: 'dugme', sayi: dugme.length, baslik: 'Tek seferlik düğme bekliyor', ayrinti: dugme.join(' · ') });
    const kanon = kanonSatirlari(items);
    if (kanon.length) liste.push({ tur: 'kanon', sayi: kanon.length, baslik: 'Kanon uyarısı', ayrinti: 'Metinde kanonla çelişen tarih', maddeler: kanonUyarililar(items).slice(0, 5), kanon: kanon.slice(0, 6) });
    // Ayda bir yedek hatırlatması (yapisal-2, 27). İndirme yine Kemal'in düğmesiyle.
    const son = sonYedekGunu();
    if (son === null || son >= 30) {
      liste.push({ tur: 'yedek', sayi: 1, baslik: 'Aylık yedek', ayrinti: son === null ? 'Henüz yedek alınmadı' : `Son yedek ${son} gün önce` });
    }
    return liste;
    // `yenile`: günün sorusu cevaplanınca liste yeniden hesaplansın
  }, [items, haritaEski, yenile]); // eslint-disable-line react-hooks/exhaustive-deps
}
