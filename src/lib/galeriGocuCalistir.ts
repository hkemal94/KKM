import type { Item } from '../types';
import { gocIsleri, basvuruluKayit, type GocIsi } from './galeriGocu';
import { gorselYaz, gorselDogrula, GorselYazmaHatasi } from './gorselDeposu';

/**
 * Galeri göçünün yazma kısmı (21 Ekim, paket K). Kemal düğmeye basınca çalışır.
 * Sıra, her kayıt için:
 *   1. kaydın bütün görselleri görsel belgesine yazılır,
 *   2. her biri sunucudan okunup doğrulanır,
 *   3. ANCAK ŞİMDİ kayıt başvurularla güncellenir.
 * Yarıda kesilirse kayıtta hâlâ görselin kendisi durur, veri kaybolmaz; en
 * kötü ihtimalle sahipsiz bir görsel belgesi kalır, yeniden basınca aynı
 * kimlikle bulunup kullanılır. İkinci basışta iş yoksa hiçbir şey yazılmaz.
 */

export interface GocRaporu {
  /** 'kural': veritabanı kuralı yayımlanmamış; 'zaman': sunucuya ulaşılamadı */
  durdu?: 'kural' | 'zaman';
  kayit: number;
  gorsel: number;
  atlanan: string[];
}

export async function galeriyiTasi(
  items: Item[],
  onUpdateItem: (item: Item) => Promise<void>,
  ilerleme?: (yapilan: number, toplam: number) => void
): Promise<GocRaporu> {
  const isler: GocIsi[] = gocIsleri(items);
  const rapor: GocRaporu = { kayit: 0, gorsel: 0, atlanan: [] };
  let n = 0;
  for (const is of isler) {
    ilerleme?.(n++, isler.length);
    const basvurular = new Map<number, string>();
    try {
      for (const g of is.gorseller) {
        const ref = await gorselYaz(g.veri, g.kimlik);
        if (!(await gorselDogrula(ref, g.veri))) throw new GorselYazmaHatasi('diger', 'yazılan görsel doğrulanamadı');
        basvurular.set(g.sira, ref);
      }
    } catch (e) {
      const neden = e instanceof GorselYazmaHatasi ? e.neden : 'diger';
      // Kural ya da bağlantı sorunu hepsini etkiler: dur, kayda dokunma
      if (neden === 'kural' || neden === 'zaman') { rapor.durdu = neden; return rapor; }
      rapor.atlanan.push(is.item.title || is.item.id);
      continue;
    }
    try {
      await onUpdateItem(basvuruluKayit(is, basvurular));
      rapor.kayit++;
      rapor.gorsel += is.gorseller.length;
    } catch {
      rapor.atlanan.push(is.item.title || is.item.id);
    }
  }
  return rapor;
}

/** Rapor satırı (kart ve Bekleyen işler için) */
export function gocRaporuYaz(r: GocRaporu): string {
  if (r.durdu === 'kural') return 'Veritabanı kuralı henüz yayımlanmamış; hiçbir kayda dokunulmadı. firestore.rules yayımlanınca yeniden bas.';
  if (r.durdu === 'zaman') return `Sunucuya ulaşılamadı (yazma sınırı dolmuş ya da bağlantı kopuk olabilir); ${r.kayit} kayıt taşındı, kalanlara dokunulmadı. Sonra yeniden bas.`;
  return `${r.gorsel} görsel kayıtların dışına taşındı (${r.kayit} kayıt).`
    + (r.atlanan.length ? ` Taşınamayan: ${r.atlanan.join(', ')}. Yeniden basınca yalnız bunlar denenir.` : '');
}
