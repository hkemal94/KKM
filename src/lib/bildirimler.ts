import { useEffect, useMemo, useState } from 'react';
import type { Item, WikiSection } from '../types';
import { bekleyenAdaylar } from './adaylar';
import { listedekiOneriler } from './onaylar';
import { bekleyenDugmeler } from './bekleyenIsler';
import { tarihUyarilari, type TarihUyarisi } from './kanonTarihleri';
import { useHaritaDuzeni } from './haritaDuzeni';
import { anahtariOku } from './oyunAyarlari';
import { gorunum, onayKayitlari } from './onaylar';
import { kararlariOku as oneriKararlariniOku, onayKaydinaCevir, onerileriOku } from './ajanOnerileri';
import { gecerliIslemler, kararlariOku as ajansKararlariniOku, type KararDosyasi } from './ajansKararlari';

/**
 * Bildirimler — menüdeki kırmızı nokta (Paket 4).
 *
 * Kemal'in seçimi (29 Eylül): onay bekleyen aday, tek seferlik düğme,
 * kanon uyarısı — üçü de. (Günün sorusu 22 Ekim'de kalktı.)
 *
 * 8. adım (2 Kasım): ajanların işleri ve ajansın karar dosyası da sayılır
 * (`ajan`). Bunlar ajansın deposunda durur; tarayıcıda GitHub anahtarı
 * varsa açılışta ve sekmeye her dönüşte okunur. Telefona bildirim KKM'den
 * değil, Kems'ten gelir (Claude uygulaması; Kemal: çalışma sonunda tek bildirim).
 */

export type BildirimTuru = 'aday' | 'dugme' | 'kanon' | 'yedek' | 'ajan';

/** Ajansın deposundaki bekleyenler: ajanların işleri (görünür olanlar) ve karar dosyası */
interface AjansBekleyen { ajanIsi: number; karar: KararDosyasi | null }

function useAjansBekleyen(): AjansBekleyen {
  const [d, setD] = useState<AjansBekleyen>({ ajanIsi: 0, karar: null });
  useEffect(() => {
    let iptal = false;
    const oku = () => {
      const anahtar = anahtariOku();
      if (!anahtar || document.visibilityState === 'hidden') return;
      Promise.all([onerileriOku(anahtar), oneriKararlariniOku(anahtar), ajansKararlariniOku(anahtar)])
        .then(([oneriler, kararlar, karar]) => {
          if (iptal) return;
          const ajanIsi = oneriler.filter(o => { const k = kararlar[o.id]; return !k || gorunum(onayKaydinaCevir(k)) === 'liste'; }).length;
          setD({ ajanIsi, karar });
        })
        .catch(() => { /* okunamazsa zil yalnız susar; Onay bekleyenler hatayı gösterir */ });
    };
    oku();
    document.addEventListener('visibilitychange', oku);
    return () => { iptal = true; document.removeEventListener('visibilitychange', oku); };
  }, []);
  return d;
}

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

export function useBildirimler(items: Item[]): Bildirim[] {
  const harita = useHaritaDuzeni();
  const haritaEski = !!(harita.duzen?.eskiKoordinat && harita.ilkYukleme);
  const ajans = useAjansBekleyen();
  return useMemo(() => {
    if (!items.length) return [];
    const liste: Bildirim[] = [];
    const aday = listedekiOneriler(items, bekleyenAdaylar(items)).length;  // eski öneriler bildirim değil; bekletilen ve arşivdekiler de değil
    if (aday) liste.push({ tur: 'aday', sayi: aday, baslik: 'Onay bekleyen öneri', ayrinti: 'Onay bekleyenler' });
    // Karar dosyası: hâlâ uygulanacak işi varsa ve Kemal satırı silmediyse / arşivlemediyse
    const karar = ajans.karar && gecerliIslemler(items, ajans.karar.islemler).length
      && gorunum(onayKayitlari(items)[`karar:${ajans.karar.olusturuldu || 'dosya'}`]) === 'liste' ? 1 : 0;
    if (ajans.ajanIsi || karar) {
      liste.push({
        tur: 'ajan', sayi: ajans.ajanIsi + karar, baslik: 'Ajanstan onay bekleyen',
        ayrinti: [ajans.ajanIsi && `${ajans.ajanIsi} ajan işi`, karar && 'ajansın kararları'].filter(Boolean).join(' · ')
      });
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
  }, [items, haritaEski, ajans]); // eslint-disable-line react-hooks/exhaustive-deps
}
