import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import type { Item } from '../types';
import { auth, driveDosyaIzni, driveIzniniUnut, driveIzniVarMi, sunucuyaUlas } from '../lib/firebase';
import { buluttakiHaritaKaydi } from '../lib/haritaDuzeni';
import {
  EN_COK_YEDEK, kuralHatasiMi, yedegiBulutaYaz, yedegiIndir,
  yedegiOku, yedekIcerigi, yedekleriListele, yedekMi, type YedekBasi
} from '../lib/haritaYedegi';
import {
  DRIVE_KLASORU, DriveHatasi, drivedanOku, driveaYukle, driveYedekleri, izinPenceresiHatasi, klasorAdresi, klasoruBul,
  type DriveBaglami, type DriveYedegi
} from '../lib/haritaDrive';

/**
 * Harita yedeği kartı (18 Kasım, kompakt ada A adımı). Durum → Eksikler.
 *
 * "Yedeği al": buluttaki harita kaydını ve haritaya bağlı viki alanlarını
 * bilgisayara indirir, Kemal'in Drive'ında "KKM Yedekleri" klasörüne yükler
 * (19 Kasım; yalnız drive.file izni, Google penceresi düğmeyle açılır) ve
 * buluttaki yedeklere yazar. Bulutta en çok 3 yedek; dördüncüde en eskisini
 * silmek için Kemal'in onayı istenir. Drive'da hiçbir yedek silinmez: 3'ten
 * fazlası olursa kart yalnız söyler.
 *
 * "Geri yükle" 24 Kasım'da kalktı (tek harita 11. adım, KKM-C): eski harita
 * silindi, kaydı da "Eski harita kaydını sil" kartıyla silinir; geri yükleme
 * kodu git geçmişinde. Kart artık yedekleri gösterir: her yedek bilgisayara
 * indirilir, buluttaki yedek Drive'a da yüklenir. Eski harita kaydı yoksa
 * "Yedeği al" kapalı (yedeklenecek kayıt kalmadı).
 *
 * Sayfa açılınca yedek listesi ve kaydın var olup olmadığı okunur (Drive'ınki
 * yalnız izin bu oturumda verilmişse; pencere kendiliğinden açılmaz); kayda
 * hiçbir şey yazılmaz.
 */

interface Props {
  items: Item[];
}

const tarihYaz = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hataYaz = (e: unknown) => kuralHatasiMi(e)
  ? 'veritabanı kuralı henüz yayımlanmamış (firestore.rules)'
  : e instanceof Error && e.message === 'zaman-asimi' ? 'bağlantı yok ya da çok yavaş' : e instanceof Error ? e.message : String(e);

/** Drive hatası Türkçe ve sade */
const driveHataYaz = (e: unknown) => e instanceof DriveHatasi ? e.metin : `Drive'a ulaşılamadı: ${hataYaz(e)}.`;

const dugme = 'shrink-0 min-h-9 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40 cursor-pointer';
const koyu = `${dugme} bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]`;
const bos = `${dugme} border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8]`;

export const HaritaYedegiKarti: React.FC<Props> = ({ items }) => {
  const [liste, setListe] = useState<YedekBasi[] | null>(null);
  const [listeHatasi, setListeHatasi] = useState<string | null>(null);
  /** Veritabanı kuralı yayımlanmamış: bulut yedeği denenmez, yalnız indirme */
  const [kuralYok, setKuralYok] = useState(false);
  const [calisiyor, setCalisiyor] = useState<string | null>(null);
  const [rapor, setRapor] = useState<{ metin: string; hata?: boolean } | null>(null);
  /** 3 yedek varken: silinecek en eski yedek (Kemal onaylarsa) */
  const [silOnayi, setSilOnayi] = useState<YedekBasi | null>(null);
  /** Eski harita kaydı bulutta duruyor mu (null: okunuyor ya da okunamadı) */
  const [kayitVar, setKayitVar] = useState<boolean | null>(null);
  /** Drive'daki yedekler (izin bu oturumda verildiyse) */
  const [driveListe, setDriveListe] = useState<DriveYedegi[] | null>(null);
  const [driveKlasor, setDriveKlasor] = useState<string | null>(null);
  const [driveListeHatasi, setDriveListeHatasi] = useState<string | null>(null);

  const uid = auth.currentUser?.uid ?? null;

  const listele = useCallback(async () => {
    if (!uid) return;
    try {
      setListe(await yedekleriListele(uid));
      setListeHatasi(null);
      setKuralYok(false);
    } catch (e) {
      setListe(null);
      if (kuralHatasiMi(e)) { setKuralYok(true); setListeHatasi(null); } else setListeHatasi(hataYaz(e));
    }
  }, [uid]);
  useEffect(() => { void listele(); }, [listele]);
  useEffect(() => {
    if (!uid) return;
    let iptal = false;
    sunucuyaUlas(buluttakiHaritaKaydi()).then(h => { if (!iptal) setKayitVar(!!h); }).catch(() => { /* bilinmiyor: düğme açık kalır */ });
    return () => { iptal = true; };
  }, [uid]);

  /** Drive bağlamı: izin yoksa `pencere` ile Google penceresi açılır */
  const driveBaglami = async (pencere: boolean): Promise<DriveBaglami | null> => {
    if (!pencere && !driveIzniVarMi()) return null;
    try { return { belirtec: await driveDosyaIzni() }; } catch (e) { throw izinPenceresiHatasi(e); }
  };
  /** Süresi dolan izin bellekten atılır; sonraki basışta yeniden sorulur */
  const driveHatasiniIsle = (e: unknown) => {
    if (e instanceof DriveHatasi && e.durum === 401) driveIzniniUnut();
    return driveHataYaz(e);
  };

  const driveListele = async (b: DriveBaglami) => {
    const klasor = await klasoruBul(b);
    setDriveKlasor(klasor);
    setDriveListe(klasor ? await driveYedekleri(b, klasor) : []);
    setDriveListeHatasi(null);
  };
  /** Sayfa açılınca: yalnız izin bu oturumda verilmişse okunur */
  useEffect(() => {
    if (!driveIzniVarMi()) return;
    void (async () => {
      try { const b = await driveBaglami(false); if (b) await driveListele(b); } catch (e) { setDriveListeHatasi(driveHatasiniIsle(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Drive'daki yedekleri göster": izin penceresi düğmeyle açılır */
  const driveGoster = async () => {
    if (calisiyor) return;
    setCalisiyor('drive');
    try { const b = await driveBaglami(true); if (b) await driveListele(b); } catch (e) { setDriveListeHatasi(driveHatasiniIsle(e)); } finally { setCalisiyor(null); }
  };

  /** Yedeği al: indir, buluta yaz. `sil` yalnız Kemal onaylayınca verilir */
  const yedekAl = async (sil?: YedekBasi) => {
    if (calisiyor || !uid) return;
    if (!sil && liste && liste.length >= EN_COK_YEDEK) { setSilOnayi(liste[liste.length - 1]); return; }
    setSilOnayi(null);
    setRapor(null);
    setCalisiyor('al');
    try {
      // İzin penceresi önce: tarayıcı pencereyi yalnız basışın hemen ardından açar
      let b: DriveBaglami | null = null;
      let driveHata: string | null = null;
      try { b = await driveBaglami(true); } catch (e) { driveHata = driveHataYaz(e); }

      const ham = await sunucuyaUlas(buluttakiHaritaKaydi());
      if (!ham) { setRapor({ metin: 'Bulutta harita kaydı yok; yedeklenecek bir şey bulunmadı.', hata: true }); return; }
      const yedek = yedekIcerigi(ham, items);
      yedegiIndir(yedek);
      const ne = `(${tarihYaz(yedek.olusturma)})`;

      let driveTamam = false;
      if (b) {
        try {
          const klasor = await klasoruBul(b, true);
          await driveaYukle(b, klasor, yedek.olusturma, JSON.stringify(yedek));
          driveTamam = true;
          setDriveKlasor(klasor);
          try { setDriveListe(await driveYedekleri(b, klasor)); setDriveListeHatasi(null); } catch { /* liste sonra */ }
        } catch (e) { driveHata = driveHatasiniIsle(e); }
      }

      // Kural yayımlanmamışsa buluta hiç denenmez: yarım yazma olmaz
      let bulut: 'tamam' | 'kural' | string = 'kural';
      if (!kuralYok) {
        try {
          await yedegiBulutaYaz(uid, yedek, sil);
          bulut = 'tamam';
        } catch (e) {
          if (kuralHatasiMi(e)) setKuralYok(true);
          bulut = kuralHatasiMi(e) ? 'kural' : hataYaz(e);
        }
      }
      const silindi = bulut === 'tamam' && sil ? ` Buluttaki en eski yedek (${tarihYaz(sil.olusturma)}) silindi.` : '';
      const bulutNotu = bulut === 'tamam' ? '' : bulut === 'kural' ? ' Bulut yedeği kural yayımlanınca.' : ` Buluta yazılamadı: ${bulut} (bulutta yarım yedek kalmaz).`;
      if (driveTamam) {
        setRapor({ metin: `Yedek Drive'a yazıldı ${ne}: "${DRIVE_KLASORU}" klasöründe; bilgisayarına da indi.${bulut === 'tamam' ? ' Buluta da yazıldı.' : bulutNotu}${silindi}` });
      } else {
        setRapor({
          metin: `Yedek bilgisayarına indi ${ne}, ama Drive'a yazılamadı: ${driveHata ?? 'bilinmeyen hata'}${bulut === 'tamam' ? ' Buluta yazıldı.' : bulutNotu}${silindi}${bulut === 'tamam' ? '' : ' İnen dosyayı sakla.'}`,
          hata: bulut !== 'tamam'
        });
      }
      await listele();
    } catch (e) {
      setRapor({ metin: `Yedek alınamadı: ${hataYaz(e)}. Kayda hiçbir şey yazılmadı.`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  /** Yedeği bilgisayara indirir (bulut ya da Drive) */
  const indir = async (anahtar: string, kaynak: 'bulut' | 'drive', oku: () => Promise<unknown>) => {
    if (calisiyor || !uid) return;
    setRapor(null);
    setCalisiyor(anahtar);
    try {
      const y = await oku();
      if (!yedekMi(y)) throw new DriveHatasi('diger', 'Dosya bir harita yedeği değil.');
      yedegiIndir(y);
      setRapor({ metin: `${tarihYaz(y.olusturma)} yedeği bilgisayarına indi.` });
    } catch (e) {
      setRapor({ metin: `Yedek okunamadı: ${kaynak === 'drive' ? driveHatasiniIsle(e) : `${hataYaz(e)}.`}`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };
  const buluttanIndir = (bas: YedekBasi) => indir(bas.id, 'bulut', () => yedegiOku(uid!, bas));
  const drivedanIndir = (d: DriveYedegi) => indir(`drive-${d.id}`, 'drive', async () => {
    const b = await driveBaglami(true);
    if (!b) throw new DriveHatasi('izin', 'Drive izni verilmedi.');
    return drivedanOku(b, d.id);
  });

  /** Buluttaki yedeği Drive'a yükler (Drive'daki hiçbir dosya silinmez) */
  const drivea = async (bas: YedekBasi) => {
    if (calisiyor || !uid) return;
    setRapor(null);
    setCalisiyor(`yukle-${bas.id}`);
    try {
      const b = await driveBaglami(true);
      if (!b) throw new DriveHatasi('izin', 'Drive izni verilmedi.');
      const y = await yedegiOku(uid, bas);
      const klasor = await klasoruBul(b, true);
      await driveaYukle(b, klasor, y.olusturma, JSON.stringify(y));
      setDriveKlasor(klasor);
      try { setDriveListe(await driveYedekleri(b, klasor)); setDriveListeHatasi(null); } catch { /* liste sonra */ }
      setRapor({ metin: `${tarihYaz(bas.olusturma)} yedeği Drive'a yazıldı: "${DRIVE_KLASORU}" klasöründe.` });
    } catch (e) {
      setRapor({ metin: `Drive'a yazılamadı: ${driveHatasiniIsle(e)}`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  if (!uid) return null;

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <DatabaseBackup className="w-4 h-4 mt-0.5 shrink-0 text-[#0E1C4F] dark:text-[#F3EFE8]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Harita yedeği</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Eski haritanın bütün kaydı (Kurucu'da konan yapılar, yollar, bağlar, evde oturanlar) ve haritaya bağlı viki alanları
            (rakım, harita konumu, işaretler). Her yedek bilgisayarına indirilebilir; buluttaki yedek Drive'ında "{DRIVE_KLASORU}"
            klasörüne de yüklenir. Drive için ilk basışta Google izin sorar (yalnız KKM'nin açtığı dosyalar).
            {kayitVar === false
              ? ' Eski harita kaydı silindi: yeni yedek alınmaz, geri yükleme yok (kodu git geçmişinde).'
              : ` Bulutta en çok ${EN_COK_YEDEK} yedek durur. Geri yükleme yok: eski harita silindi (kodu git geçmişinde).`}
          </p>
        </div>
        <button type="button" disabled={!!calisiyor || kayitVar === false} onClick={() => void yedekAl()} className={koyu}>
          {calisiyor === 'al' ? 'Alınıyor…' : 'Yedeği al'}
        </button>
      </div>

      {silOnayi && (
        <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-2 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          <span className="min-w-0 flex-1">
            {EN_COK_YEDEK} yedek var. Yenisi için en eskisi ({tarihYaz(silOnayi.olusturma)}) silinsin mi? Bilgisayarına inen dosyalara dokunulmaz.
          </span>
          <button type="button" onClick={() => setSilOnayi(null)} className={bos}>Vazgeç</button>
          <button type="button" disabled={!!calisiyor} onClick={() => void yedekAl(silOnayi)} className={`${dugme} bg-[#F26B6F] text-white`}>Eskisini sil, yedeği al</button>
        </div>
      )}

      {kuralYok && (
        <p className="mt-2 ml-7 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
          Bulut yedeği veritabanı kuralı yayımlanınca açılır. O zamana kadar "Yedeği al" bilgisayarına indirir ve Drive'a yazar;
          buluta hiçbir şey (yarım bile) yazılmaz.
        </p>
      )}
      {listeHatasi && (
        <p className="mt-2 ml-7 text-[12px] text-[#D6484C] dark:text-[#F26B6F]">
          Buluttaki yedekler okunamadı: {listeHatasi}. "Yedeği al" yine bilgisayarına indirir.
        </p>
      )}

      {liste && (
        <ul className="mt-2.5 ml-7 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60 border-t border-[#CFC5B4]/50 dark:border-[#2C3C72]/60">
          {liste.length === 0 && <li className="py-2 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bulutta henüz harita yedeği yok.</li>}
          {liste.map(b => (
            <li key={b.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{tarihYaz(b.olusturma)}</span>
              <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] flex-1 min-w-0">
                {b.ozet.yapi} yapı · {b.ozet.yol} yol · {b.ozet.bag} bağ · {b.ozet.oturanEv} evde oturan · {b.ozet.vikiMadde} viki maddesi
              </span>
              <button type="button" disabled={!!calisiyor} onClick={() => void buluttanIndir(b)} className={bos}>
                {calisiyor === b.id ? 'İniyor…' : 'İndir'}
              </button>
              <button type="button" disabled={!!calisiyor} onClick={() => void drivea(b)} className={bos}>
                {calisiyor === `yukle-${b.id}` ? 'Yükleniyor…' : "Drive'a yükle"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 ml-7 border-t border-[#CFC5B4]/50 dark:border-[#2C3C72]/60 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-0 text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Drive'daki yedekler</span>
          {driveKlasor && (
            <a href={klasorAdresi(driveKlasor)} target="_blank" rel="noreferrer" className="text-[12px] underline text-[#0E1C4F] dark:text-[#F3EFE8]">Klasörü aç</a>
          )}
          {!driveListe && (
            <button type="button" disabled={!!calisiyor} onClick={() => void driveGoster()} className={bos}>
              {calisiyor === 'drive' ? 'Okunuyor…' : 'Drive\'daki yedekleri göster'}
            </button>
          )}
        </div>
        {driveListeHatasi && <p className="mt-1 text-[12px] text-[#D6484C] dark:text-[#F26B6F]">{driveListeHatasi}</p>}
        {driveListe && driveListe.length === 0 && <p className="mt-1 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">Drive'da henüz harita yedeği yok.</p>}
        {driveListe && driveListe.length > EN_COK_YEDEK && (
          <p className="mt-1 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            Drive'da {driveListe.length} yedek var, eskileri sen silebilirsin ("Klasörü aç"). KKM Drive'da hiçbir yedeği silmez.
          </p>
        )}
        {driveListe && driveListe.length > 0 && (
          <ul className="mt-1 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
            {driveListe.slice(0, EN_COK_YEDEK).map(d => (
              <li key={d.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{tarihYaz(d.olusturma)}</span>
                  <span className="block truncate text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{d.ad}</span>
                </span>
                <button type="button" disabled={!!calisiyor} onClick={() => void drivedanIndir(d)} className={bos}>
                  {calisiyor === `drive-${d.id}` ? 'İniyor…' : 'İndir'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rapor && (
        <p className={`mt-2 ml-7 text-[12px] ${rapor.hata ? 'text-[#D6484C] dark:text-[#F26B6F] font-semibold' : 'text-[#336659] dark:text-[#8FC4A8]'}`}>{rapor.metin}</p>
      )}
    </div>
  );
};

export default HaritaYedegiKarti;
