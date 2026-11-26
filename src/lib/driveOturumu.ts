import { driveDosyaIzni, driveIzniniUnut, driveIzniVarMi } from './firebase';
import { DriveHatasi, izinPenceresiHatasi, yedegiDriveaKoy, type DriveBaglami, type DriveYedegi } from './driveYedek';

/**
 * Drive yedeklerinin tarayıcı tarafı (26 Kasım): izin ve işlem öncesi yedek.
 * Saf Drive işleri `driveYedek.ts`'te. İzin penceresi yalnız Kemal bir düğmeye
 * basınca açılır; belirteç yalnız bellekte durur (`firebase.ts`).
 */

/** Drive bağlamı: izin yoksa `pencere` ile Google penceresi açılır; açılmazsa null */
export async function driveBaglami(pencere: boolean): Promise<DriveBaglami | null> {
  if (!pencere && !driveIzniVarMi()) return null;
  try { return { belirtec: await driveDosyaIzni() }; } catch (e) { throw izinPenceresiHatasi(e); }
}

/** "Drive iznini yenile": Google izin ekranı yeniden açılır */
export async function driveIzniniYenidenIste(): Promise<DriveBaglami> {
  driveIzniniUnut();
  try { return { belirtec: await driveDosyaIzni(true) }; } catch (e) { throw izinPenceresiHatasi(e); }
}

/** Drive hatası Türkçe ve sade; süresi dolan izin bellekten atılır (sonraki basışta yeniden sorulur) */
export function driveHataMetni(e: unknown): string {
  if (e instanceof DriveHatasi) {
    if (e.durum === 401) driveIzniniUnut();
    return e.metin;
  }
  return `Drive'a ulaşılamadı: ${e instanceof Error ? e.message : String(e)}.`;
}

/** İzin eksikliğinden mi ("Drive iznini yenile" düğmesi çıkar) */
export const driveIzinHatasiMi = (e: unknown) => e instanceof DriveHatasi && e.tur === 'izin';

/**
 * Silme ya da toplu değişiklikten önce güvenlik yedeği: Drive'a `islem-oncesi`
 * türüyle yüklenir. Yüklenemezse hata fırlatır; çağıran işlemi yapmaz (bilgisayara
 * indirmeye dönülmez). İzin penceresi önce açılır (tarayıcı pencereyi yalnız
 * basışın hemen ardından açar), yedeğin içeriği sonra hazırlanır.
 */
export async function islemOncesiYedek(islem: string, veri: () => unknown | Promise<unknown>): Promise<DriveYedegi> {
  const b = await driveBaglami(true);
  if (!b) throw new DriveHatasi('izin', 'Drive izni verilmedi.');
  const olusturma = Date.now();
  const icerik = JSON.stringify(await veri());
  const { yedek } = await yedegiDriveaKoy(b, { tur: 'islem-oncesi', olusturma, icerik, islem });
  return yedek;
}
