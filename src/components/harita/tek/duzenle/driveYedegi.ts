import type { Item } from '../../../../types';
import { driveDosyaIzni, sunucuyaUlas } from '../../../../lib/firebase';
import { driveaYukle, izinPenceresiHatasi, klasorAdresi, klasoruBul } from '../../../../lib/haritaDrive';
import { buluttakiHaritaKaydi } from '../../../../lib/haritaDuzeni';
import { yedekIcerigi } from '../../../../lib/haritaYedegi';
import { taslakYazisi, type TekTaslak } from './taslak';

/**
 * Düzenle → "Drive'a yedek" (7. adım): Durum → Eksikler → Harita yedeği'nin yolu
 * (`lib/haritaDrive.ts`, `lib/haritaYedegi.ts`). Harita kaydı olduğu gibi ve
 * yanında bu taslak (`tekHaritaTaslak`) Kemal'in Drive'ında "KKM Yedekleri"
 * klasörüne JSON olarak yüklenir. Kayda bir şey yazılmaz. Geri yükleme Harita
 * yedeği kartından (taslak alanını o kart okumaz; dosyada durur).
 */
export async function driveYedegiAl(items: Item[], taslak: TekTaslak): Promise<string> {
  let belirtec: string;
  try { belirtec = await driveDosyaIzni(); } catch (e) { throw izinPenceresiHatasi(e); }
  const b = { belirtec };
  const ham = await sunucuyaUlas(buluttakiHaritaKaydi());
  const yedek = { ...yedekIcerigi(ham, items), tekHaritaTaslak: JSON.parse(taslakYazisi(taslak)) as unknown };
  const klasor = await klasoruBul(b, true);
  await driveaYukle(b, klasor, yedek.olusturma, JSON.stringify(yedek));
  return klasorAdresi(klasor);
}
