import React, { useState } from 'react';
import { DRIVE_KLASORU, DriveHatasi, type DriveYedegi } from '../lib/driveYedek';
import { driveBaglami, driveHataMetni, driveIzinHatasiMi, driveIzniniYenidenIste, islemOncesiYedek } from '../lib/driveOturumu';

/**
 * İşlem öncesi güvenlik yedeği (26 Kasım, Kemal: "direkt Drive'a kaydolmalı").
 * Temizlik, eski alanlar, mükerrer, kanon ve viki görseli kartları silmeden ya
 * da değiştirmeden önce bütün ilgili kayıtları Drive'daki "KKM Yedekleri"
 * klasörüne yükler. Yüklenemezse işlem yapılmaz; ekranda sade bir uyarı çıkar,
 * izin eksikse "Drive iznini yenile" düğmesi. Bilgisayara bir şey inmez.
 *
 *   const yedek = useIslemOncesiYedek('Temizlik', 'silme');
 *   if (!(await yedek.al(() => veri))) return;   // önce yedek, sonra işlem
 *   ... işlem ...
 *   {yedek.uyari}
 */
export function useIslemOncesiYedek(islem: string, yapilmayan: string) {
  const [hata, setHata] = useState<{ metin: string; izin: boolean } | null>(null);
  const [izinNotu, setIzinNotu] = useState<string | null>(null);
  const [yeniliyor, setYeniliyor] = useState(false);

  /** Yedeği Drive'a yükler; olursa yedeğin bilgisi, olmazsa null (uyarı ekranda) */
  const al = async (veri: () => unknown | Promise<unknown>): Promise<DriveYedegi | null> => {
    setHata(null);
    setIzinNotu(null);
    try {
      return await islemOncesiYedek(islem, veri);
    } catch (e) {
      setHata({ metin: `Yedek Drive'a kaydedilemedi, ${yapilmayan} yapılmadı. ${driveHataMetni(e)}`, izin: driveIzinHatasiMi(e) });
      return null;
    }
  };

  /**
   * Onay penceresinden (window.confirm) önce çağrılır: Google izin penceresi
   * basışın hemen ardından açılmalı, yoksa tarayıcı engeller. İzin bellekteyse
   * pencere açılmaz. Olmazsa false ve uyarı ekranda.
   */
  const izinAl = async (): Promise<boolean> => {
    setHata(null);
    setIzinNotu(null);
    try {
      if (await driveBaglami(true)) return true;
      throw new DriveHatasi('izin', 'Drive izni verilmedi.');
    } catch (e) {
      setHata({ metin: `Yedek Drive'a kaydedilemedi, ${yapilmayan} yapılmadı. ${driveHataMetni(e)}`, izin: driveIzinHatasiMi(e) });
      return false;
    }
  };

  const izniYenile = async () => {
    setYeniliyor(true);
    try {
      await driveIzniniYenidenIste();
      setHata(null);
      setIzinNotu('Drive izni alındı. İşlemi yeniden başlat; önce yedek Drive\'a kaydedilir.');
    } catch (e) {
      setHata(h => ({ metin: `${h?.metin ?? ''} İzin alınamadı: ${driveHataMetni(e)}`.trim(), izin: true }));
    } finally {
      setYeniliyor(false);
    }
  };

  const uyari = hata || izinNotu ? (
    <div className="mt-2">
      {hata && <p className="text-[12px] font-semibold text-[#D6484C] dark:text-[#F26B6F]">{hata.metin}</p>}
      {izinNotu && <p className="text-[12px] text-[#336659] dark:text-[#8FC4A8]">{izinNotu}</p>}
      {hata?.izin && (
        <button type="button" onClick={() => void izniYenile()} disabled={yeniliyor}
          className="mt-1.5 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
          {yeniliyor ? 'İzin soruluyor…' : 'Drive iznini yenile'}
        </button>
      )}
    </div>
  ) : null;

  return { al, izinAl, uyari };
}

/** Rapor satırının sonuna: yedeğin nerede durduğu */
export const yedekNotu = (y: DriveYedegi) => ` Öncesinin yedeği Drive'da: "${DRIVE_KLASORU}" klasöründe (${y.ad}).`;
