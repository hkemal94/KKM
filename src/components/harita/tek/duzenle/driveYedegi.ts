import type { Item } from '../../../../types';
import { driveDosyaIzni } from '../../../../lib/firebase';
import { driveaYukle, izinPenceresiHatasi, klasorAdresi, klasoruBul } from '../../../../lib/driveYedek';
import { yedekIcerigi } from '../../../../lib/haritaYedegi';
import { taslakYazisi, type TekTaslak } from './taslak';

/**
 * Düzenle → "Drive'a yedek" (7. adım): Durum → Eksikler → Harita yedeği'nin yolu
 * (`lib/driveYedek.ts`, `lib/haritaYedegi.ts`). Bu taslak (`tekHaritaTaslak`)
 * ve haritaya bağlı viki alanları Kemal'in Drive'ında "KKM Yedekleri"
 * klasörüne JSON olarak yüklenir. Eski harita kaydı (`duzada/haritaDuzeni`)
 * 24 Kasım'dan beri girmez (tek harita 11. adım, KKM-C). Kayda bir şey
 * yazılmaz. Harita yedeği kartı dosyayı listeler ve indirir.
 */
export async function driveYedegiAl(items: Item[], taslak: TekTaslak): Promise<string> {
  let belirtec: string;
  try { belirtec = await driveDosyaIzni(); } catch (e) { throw izinPenceresiHatasi(e); }
  const b = { belirtec };
  const yedek = {
    ...yedekIcerigi(null, items),
    aciklama: 'Tek harita taslağı (tekHaritaTaslak) ve haritaya bağlı viki alanları. KKM → Harita → Düzenle → "Drive\'a yedek".',
    tekHaritaTaslak: JSON.parse(taslakYazisi(taslak)) as unknown
  };
  const klasor = await klasoruBul(b, true);
  await driveaYukle(b, klasor, { tur: 'harita-yedegi', olusturma: yedek.olusturma, icerik: JSON.stringify(yedek) });
  return klasorAdresi(klasor);
}
