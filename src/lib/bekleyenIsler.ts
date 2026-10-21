import type { Item } from '../types';
import { boslukDoldurma } from './boslukDoldurma';
import { silinecekler } from './temizlik';
import { mahalleAdDuzeltmeleri } from './vikiTemizligi';
import { galeridenEksikler } from '../components/GaleriYedegiKarti';
import { gocIsleri } from './galeriGocu';
import { maddeSoruTuruIsVar } from './maddeSoruTuru';
import { derlenecekler, ekDuzeltmeler } from './mahalleDerlemesi';
import { adaMaddesiEksik, cevreYoluVar, mahalleTekrarlari, tasinacaklar } from './yerTurleri';

/**
 * Neyin Eksik'te basılmayı bekleyen tek seferlik düğmeler (bildirimler).
 * Kartların göründüğü koşulların aynısı; kart yoksa liste boş. Harita
 * düzeni ayrı bir belgede durduğu için dışarıdan verilir.
 *
 * 29 Eylül: işi biten göç kartları (viki sıfırlama, tema, marka yapısı,
 * otel temizliği, ø, boş projeler) silindi; yerine Temizlik kartı geldi.
 * 2 Ekim gece: soru-cevap, W3, W4, W5, kanon kararları, viki düzeni ve
 * koordinat kartları da işini bitirdi, silindi.
 */
export function bekleyenDugmeler(items: Item[], haritaEskiKoordinatta = false): string[] {
  if (!items.length) return [];
  const is: string[] = [];
  if (mahalleAdDuzeltmeleri(items).length) is.push('mahalle adlarındaki parantez');
  if (silinecekler(items).length) is.push('temizlik');
  if (galeridenEksikler(items).length) is.push('galeriye görseller');
  if (gocIsleri(items).length) is.push('galeri görselleri kayıtların dışına');
  if (haritaEskiKoordinatta) is.push('harita düzeni yeni koordinata');
  if (boslukDoldurma(items).length) is.push('boşlukları künyeden doldur');
  // 8 Ekim: yer kartları ve mahalle derlemesi
  if (tasinacaklar(items).length || adaMaddesiEksik(items) || !cevreYoluVar(items)) is.push('yer kartları');
  if (mahalleTekrarlari(items).length) is.push('mahalle derlemesi');
  if (maddeSoruTuruIsVar(items)) is.push('soru turu maddeleri');
  if (derlenecekler(items).length || ekDuzeltmeler(items).length) is.push('mahalle derlemesi (Claude)');
  return is;
}
