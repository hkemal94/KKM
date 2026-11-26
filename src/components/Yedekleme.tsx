import React, { useRef, useState } from 'react';
import { Archive, CloudUpload, Upload, X } from 'lucide-react';
import type { Item, UserSettings } from '../types';
import { driveIzniVarMi } from '../lib/firebase';
import { gorselYedegi, gorselleriGeriYaz } from '../lib/gorselDeposu';
import {
  DRIVE_KLASORU, DriveHatasi, YEDEK_TURU_ADI, bilgisayaraIndir, boyutYaz, drivedanMetin, drivedanOku, driveYedekleri,
  enYeniYedek, klasorAdresi, klasoruBul, yedegiDriveaKoy, type DriveBaglami, type DriveYedegi
} from '../lib/driveYedek';
import { driveBaglami, driveHataMetni, driveIzinHatasiMi, driveIzniniYenidenIste } from '../lib/driveOturumu';
import { driveSonYedegi, gecenGun, sonYedekYazisi, useSonYedek } from '../lib/sonYedek';

/**
 * Yedekleme (K2; 26 Kasım, Kemal: "Yedek işinin direkt indirilmesi beni rahatsız
 * ediyor; direkt Drive'a kaydolmalı, gerekirse ben indirebilmeliyim").
 *
 * Firestore'un zamanlanmış yedeklemesi bu projenin katmanında kapalı; yedek elle
 * alınır: tek düğme ("Drive'a yedekle"), yedek doğrudan Kemal'in Drive'ındaki
 * "KKM Yedekleri" klasörüne gider (`lib/driveYedek.ts`, tür `tam-yedek`).
 * Bilgisayara bir şey inmez; Drive'daki yedekler listesinden tek tek "İndir".
 * "Son yedek N gün önce" Drive listesinden gelir (`lib/sonYedek.ts`); Drive bu
 * oturumda okunamadıysa tarayıcının hafızası yedek bilgi olarak görünür.
 *
 * Geri yükleme BİLEREK eksiltmeyen biçimde çalışıyor: yedekteki kayıtlar
 * eklenir ya da üstüne yazılır, yedekte olmayanlara dokunulmaz. Yani yanlış
 * bir dosya seçmek veriyi silmez. Drive listesinden ("Bundan geri yükle") ya da
 * bilgisayardaki dosyadan yapılır; ikisinde de önce onay sorulur.
 *
 * Pencere açılınca Drive listesi yalnız izin bu oturumda verilmişse okunur;
 * Google penceresi kendiliğinden açılmaz. Kayda yalnız geri yüklemede, Kemal
 * onaylayınca yazılır.
 */

const SURUM = 1;
/** Listede ilk görünen yedek sayısı; gerisi "Hepsini göster" ile */
const ILK_GORUNEN = 8;

export interface YedeklemeProps {
  items: Item[];
  settings: UserSettings;
  /** Yedekten gelen bir kaydı yazar (var olanın üstüne) */
  onKayit: (item: Item) => Promise<void> | void;
  /** Düğmenin görünüşü: raydaki simge ya da "Diğer" listesindeki satır */
  tetikSinifi?: string;
  /** Verilirse simgenin yanında yazı çıkar */
  etiket?: React.ReactNode;
}

interface YedekDosyasi {
  uygulama: string;
  surum: number;
  tarih: string;
  sayilar: { madde: number };
  settings: UserSettings;
  items: Item[];
  /** Galeri görselleri (21 Ekim): { görsel kimliği: data adresi }; kayıtlarda yalnız başvuru durur */
  gorseller?: Record<string, string>;
}

const tarihYaz = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hataYaz = (e: unknown) => e instanceof Error ? e.message : 'bilinmeyen hata';
const izinYok = () => new DriveHatasi('izin', 'Drive izni verilmedi.');

const kucukDugme = 'shrink-0 min-h-8 px-2.5 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[11px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] disabled:opacity-40 cursor-pointer';
const baglanti = 'text-[11px] underline text-[#0E1C4F] dark:text-[#F3EFE8] hover:text-[#F26B6F]';

export const Yedekleme: React.FC<YedeklemeProps> = ({ items, settings, onKayit, tetikSinifi, etiket }) => {
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<{ metin: string; hata?: boolean } | null>(null);
  /** Çalışan iş: 'yedekle', 'liste', 'yenile', 'dosya', `indir-<id>`, `geri-<id>` */
  const [calisiyor, setCalisiyor] = useState<string | null>(null);
  /** Drive izni eksik çıktıysa "Drive iznini yenile" düğmesi görünür */
  const [izinEksik, setIzinEksik] = useState(false);
  /** İzin yenilenince yeniden denenecek iş */
  const sonIs = useRef<'yedekle' | 'liste'>('liste');
  /** Drive'daki yedekler (bu oturumda okunduysa) */
  const [liste, setListe] = useState<DriveYedegi[] | null>(null);
  const [klasor, setKlasor] = useState<string | null>(null);
  const [hepsi, setHepsi] = useState(false);
  const sonYedek = useSonYedek();
  const dosyaGirdisi = useRef<HTMLInputElement | null>(null);

  // Zildeki "aylık yedek" bildirimi pencereyi açar
  const tetik = useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    // Düğme iki yerde (ray, "Diğer"); yalnız görünen ve ilk yanıt veren açılır
    const ac = (e: Event) => {
      if (e.defaultPrevented || !tetik.current || tetik.current.offsetParent === null) return;
      e.preventDefault();
      setAcik(true);
    };
    window.addEventListener('kems-yedek-ac', ac);
    return () => window.removeEventListener('kems-yedek-ac', ac);
  }, []);

  // Esc ile çıkış — düğme kırpılsa bile bir yolu kalsın
  React.useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik]);

  /** Drive hatası: ekranda sade metin; izin eksikse "Drive iznini yenile" */
  const driveHatasi = (on: string, e: unknown, is: 'yedekle' | 'liste') => {
    sonIs.current = is;
    setIzinEksik(driveIzinHatasiMi(e));
    setDurum({ metin: `${on}: ${driveHataMetni(e)}`, hata: true });
  };

  const listele = async (b: DriveBaglami) => {
    const k = await klasoruBul(b);
    setKlasor(k);
    const l = k ? await driveYedekleri(b, k) : [];
    setListe(l);
    driveSonYedegi(enYeniYedek(l, 'tam-yedek'));
  };

  // Pencere açılınca: Drive listesi yalnız izin bu oturumda verilmişse okunur
  React.useEffect(() => {
    if (!acik || liste || !driveIzniVarMi()) return;
    void (async () => {
      try { const b = await driveBaglami(false); if (b) await listele(b); } catch (e) { driveHatasi("Drive'daki yedekler okunamadı", e, 'liste'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  const yedekVerisi = async (): Promise<YedekDosyasi> => ({
    uygulama: 'Kems Komuta Merkezi',
    surum: SURUM,
    tarih: new Date().toISOString(),
    sayilar: { madde: items.length },
    settings,
    items,
    gorseller: await gorselYedegi(items)
  });

  /** "Drive'daki yedekleri göster": izin penceresi düğmeyle açılır */
  const driveGoster = async () => {
    if (calisiyor) return;
    setCalisiyor('liste');
    setDurum(null);
    try {
      const b = await driveBaglami(true);
      if (!b) throw izinYok();
      await listele(b);
      setIzinEksik(false);
    } catch (e) { driveHatasi("Drive'daki yedekler okunamadı", e, 'liste'); } finally { setCalisiyor(null); }
  };

  /** "Drive'a yedekle": bütün maddeler, ayarlar ve galeri görselleri → "KKM Yedekleri" */
  const driveaYedekle = async () => {
    if (calisiyor) return;
    setCalisiyor('yedekle');
    setDurum(null);
    try {
      // İzin penceresi önce: tarayıcı pencereyi yalnız basışın hemen ardından açar
      const b = await driveBaglami(true);
      if (!b) throw izinYok();
      let veri: YedekDosyasi;
      try { veri = await yedekVerisi(); } catch (e) { setDurum({ metin: `Yedek hazırlanamadı: ${hataYaz(e)}`, hata: true }); return; }
      const olusturma = Date.parse(veri.tarih);
      const { yedek, klasorId } = await yedegiDriveaKoy(b, { tur: 'tam-yedek', olusturma, icerik: JSON.stringify(veri) });
      setKlasor(klasorId);
      driveSonYedegi(olusturma);
      try { await listele(b); } catch { setListe(l => [yedek, ...(l ?? [])]); }
      setIzinEksik(false);
      setDurum({ metin: `${items.length} madde Drive'a yedeklendi: "${DRIVE_KLASORU}" klasöründe${yedek.boyut !== undefined ? ` (${boyutYaz(yedek.boyut)})` : ''}. Bilgisayarına bir şey inmedi.` });
    } catch (e) {
      driveHatasi("Drive'a yedeklenemedi", e, 'yedekle');
    } finally {
      setCalisiyor(null);
    }
  };

  const izniYenile = async () => {
    if (calisiyor) return;
    setCalisiyor('yenile');
    setDurum(null);
    try {
      await driveIzniniYenidenIste();
      setIzinEksik(false);
    } catch (e) {
      setCalisiyor(null);
      setDurum({ metin: `İzin alınamadı: ${driveHataMetni(e)}`, hata: true });
      return;
    }
    setCalisiyor(null);
    // Aynı çizimin işleri: onlarda `calisiyor` hâlâ boş görünür, iş hemen başlar
    await (sonIs.current === 'yedekle' ? driveaYedekle() : driveGoster());
  };

  /** Listeden "İndir": yalnız o dosya bilgisayara iner */
  const indir = async (y: DriveYedegi) => {
    if (calisiyor) return;
    setCalisiyor(`indir-${y.id}`);
    setDurum(null);
    try {
      const b = await driveBaglami(true);
      if (!b) throw izinYok();
      bilgisayaraIndir(y.ad, await drivedanMetin(b, y.id));
      setDurum({ metin: `${tarihYaz(y.olusturma)} yedeği bilgisayarına indi.` });
    } catch (e) {
      driveHatasi('İndirilemedi', e, 'liste');
    } finally {
      setCalisiyor(null);
    }
  };

  /** Yedekteki kayıtları yazar (onaydan sonra); eksiltmez */
  const geriYaz = async (veri: Partial<YedekDosyasi>) => {
    let yazilan = 0;
    for (const kayit of veri.items ?? []) {
      if (!kayit || !kayit.id) continue;
      await onKayit(kayit);
      yazilan++;
    }
    // Eski harita kaydı (23 Kasım'a kadarki yedeklerde `haritaDuzeni`) geri yazılmaz:
    // eski harita silindi (tek harita 11. adım, KKM-C); yalnız kayıtlar ve görseller döner
    // Galeri görselleri (21 Ekim): olmayan görsel belgeleri yazılır
    const gorselSayisi = veri.gorseller ? await gorselleriGeriYaz(veri.gorseller) : 0;
    setDurum({ metin: `${yazilan} kayıt geri yüklendi${gorselSayisi ? `, ${gorselSayisi} galeri görseli yazıldı` : ''}.` });
  };

  const onayla = (sayi: number, nereden: string) => window.confirm(
    `${sayi} kayıt geri yüklenecek (${nereden}).\n\n`
    + 'Aynı kimlikli kayıtların üstüne yazılır. '
    + 'Yedekte olmayan kayıtlar SİLİNMEZ.\n\nDevam edilsin mi?'
  );

  /** Listeden "Bundan geri yükle" */
  const drivedanGeriYukle = async (y: DriveYedegi) => {
    if (calisiyor) return;
    setCalisiyor(`geri-${y.id}`);
    setDurum(null);
    try {
      const b = await driveBaglami(true);
      if (!b) throw izinYok();
      const veri = await drivedanOku(b, y.id) as Partial<YedekDosyasi> | null;
      if (!veri || !Array.isArray(veri.items)) { setDurum({ metin: 'Bu dosya bir Kems yedeği değil.', hata: true }); return; }
      if (!onayla(veri.items.length, `Drive, ${tarihYaz(y.olusturma)}`)) return;
      await geriYaz(veri);
    } catch (e) {
      if (e instanceof DriveHatasi) driveHatasi('Yedek okunamadı', e, 'liste');
      else setDurum({ metin: `Geri yüklenemedi: ${hataYaz(e)}`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  /** Bilgisayardaki dosyadan geri yükleme (eski indirilmiş yedekler için) */
  const dosyadanGeriYukle = async (dosya: File) => {
    setCalisiyor('dosya');
    setDurum(null);
    try {
      const veri = JSON.parse(await dosya.text()) as Partial<YedekDosyasi>;
      if (!Array.isArray(veri.items)) {
        setDurum({ metin: 'Bu dosya bir Kems yedeği değil.', hata: true });
        return;
      }
      if (!onayla(veri.items.length, dosya.name)) return;
      await geriYaz(veri);
    } catch (e) {
      setDurum({ metin: `Okunamadı: ${hataYaz(e)}`, hata: true });
    } finally {
      setCalisiyor(null);
      if (dosyaGirdisi.current) dosyaGirdisi.current.value = '';
    }
  };

  const gun = gecenGun(sonYedek.zaman);
  const eski = gun === null || gun >= 30;
  const sonYazi = sonYedekYazisi(sonYedek);
  const gorunen = liste ? (hepsi ? liste : liste.slice(0, ILK_GORUNEN)) : [];

  return (
    <>
      <button
        ref={tetik}
        onClick={() => setAcik(true)}
        title={sonYazi}
        className={tetikSinifi ?? `relative p-2 bg-white dark:bg-[#17345A] border border-[#CFC5B4]
                   dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9]
                   rounded-lg hover:text-[#F26B6F] transition-colors cursor-pointer`}
      >
        <Archive className="w-4 h-4 shrink-0" />
        {etiket && (typeof etiket === 'string' ? <span>{etiket}</span> : etiket)}
        {eski && (
          <span className={`absolute w-2 h-2 rounded-full bg-[#F26B6F] ${etiket && typeof etiket !== 'string' ? 'top-2 left-7' : '-top-0.5 -right-0.5'}`} />
        )}
      </button>

      {acik && (
        /*
         * Pencere küçük bir çerçeve içinde açılınca üstü kesiliyor, kapatma
         * çarpısı ekranın dışında kalıyordu: Kemal "işlemsiz çıkış imkânsız"
         * dedi, haklıydı. Üç şey değişti — pencere ekran boyunu aşmıyor,
         * aşarsa kendi içinde kayıyor, ve en altta her zaman görünen bir
         * "Kapat" var. Esc de kapatıyor.
         */
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center
                     justify-center p-3 sm:p-4 bg-black/40 overflow-y-auto"
          onClick={() => setAcik(false)}
        >
          <div
            className="w-full max-w-md my-auto rounded-xl bg-[#FAF8F5]
                       dark:bg-[#13204A] border border-[#CFC5B4]
                       dark:border-[#2C3C72] p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-mono text-sm font-bold text-[#0E1C4F]
                               dark:text-[#F3EFE8]">
                  Yedekleme
                </h2>
                <p className="mt-0.5 text-xs text-[#6A5E4C] dark:text-[#A6B0C9]">
                  {sonYazi}.{sonYedek.kaynak === 'tarayici' && sonYedek.zaman !== null && ' (Bu tarayıcının bilgisi; Drive okununca düzelir.)'}
                </p>
              </div>
              <button
                onClick={() => setAcik(false)}
                className="p-1 text-[#6A5E4C] dark:text-[#A6B0C9]
                           hover:text-[#F26B6F] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[#6A5E4C]
                          dark:text-[#A6B0C9]">
              Bütün maddeler, ayarlar ve galeri görselleri Drive'ındaki "{DRIVE_KLASORU}" klasörüne tek dosya olarak
              kaydedilir; bilgisayarına bir şey inmez. İstersen aşağıdaki listeden tek tek indirirsin. İlk seferde
              Google, Drive izni sorar (KKM yalnız kendi açtığı dosyaları görür).
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => void driveaYedekle()}
                disabled={!!calisiyor}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg
                           bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8] text-xs
                           font-mono hover:opacity-90 disabled:opacity-40
                           cursor-pointer"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                {calisiyor === 'yedekle' ? 'Drive\'a yedekleniyor…' : `Drive'a yedekle · ${items.length} madde`}
              </button>
            </div>

            {/* Drive'daki yedekler: tarih, tür, boyut; İndir · Bundan geri yükle · Drive'da aç */}
            <div className="mt-4 border-t border-[#CFC5B4]/60 dark:border-[#2C3C72]/60 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0 text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">
                  Drive'daki yedekler{liste ? ` · ${liste.length}` : ''}
                </span>
                {klasor && <a href={klasorAdresi(klasor)} target="_blank" rel="noreferrer" className={baglanti}>Klasörü aç</a>}
                {!liste && (
                  <button type="button" disabled={!!calisiyor} onClick={() => void driveGoster()} className={kucukDugme}>
                    {calisiyor === 'liste' ? 'Okunuyor…' : 'Drive\'daki yedekleri göster'}
                  </button>
                )}
              </div>
              {liste && liste.length === 0 && (
                <p className="mt-1.5 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">"{DRIVE_KLASORU}" klasöründe henüz yedek yok.</p>
              )}
              {gorunen.length > 0 && (
                <ul className="mt-1.5 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
                  {gorunen.map(y => (
                    <li key={y.id} className="py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{tarihYaz(y.olusturma)}</span>
                        <span className="flex-1 min-w-0 truncate text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                          {YEDEK_TURU_ADI[y.tur]}{y.islem ? ` · ${y.islem}` : ''}{y.boyut !== undefined ? ` · ${boyutYaz(y.boyut)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={!!calisiyor} onClick={() => void indir(y)} className={kucukDugme}>
                          {calisiyor === `indir-${y.id}` ? 'İniyor…' : 'İndir'}
                        </button>
                        {y.tur !== 'harita-yedegi' && (
                          <button type="button" disabled={!!calisiyor} onClick={() => void drivedanGeriYukle(y)} className={kucukDugme}>
                            {calisiyor === `geri-${y.id}` ? 'Yükleniyor…' : 'Bundan geri yükle'}
                          </button>
                        )}
                        <a href={y.adres} target="_blank" rel="noreferrer" className={baglanti}>Drive'da aç</a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {liste && liste.length > ILK_GORUNEN && (
                <button type="button" onClick={() => setHepsi(h => !h)} className={`mt-1 ${baglanti} cursor-pointer`}>
                  {hepsi ? 'Kısalt' : `Hepsini göster (${liste.length})`}
                </button>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-[#6A5E4C] dark:text-[#A6B0C9]">
                KKM Drive'da hiçbir yedeği silmez; eskileri sen silebilirsin ("Klasörü aç"). 26 Kasım'dan önce Drive'a
                kaydedilen yedekler eski "KKM yedekleri" klasöründe durur.
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => dosyaGirdisi.current?.click()}
                disabled={!!calisiyor}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg
                           border border-[#CFC5B4] dark:border-[#2C3C72]
                           text-[#6A5E4C] dark:text-[#A6B0C9] text-xs font-mono
                           hover:bg-[#F3EFE8] dark:hover:bg-[#17345A]
                           disabled:opacity-40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {calisiyor === 'dosya' ? 'Yükleniyor…' : 'Bilgisayardaki dosyadan geri yükle'}
              </button>
              <input
                ref={dosyaGirdisi}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void dosyadanGeriYukle(f);
                }}
              />
            </div>

            <p className="mt-3 text-[11px] leading-snug text-[#6A5E4C] dark:text-[#A6B0C9]">
              Geri yükleme eksiltmez: yedekteki kayıtlar eklenir ya da üstüne
              yazılır, yedekte olmayanlara dokunulmaz.
            </p>

            {durum && (
              <p className={`mt-3 px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-xs
                            ${durum.hata ? 'text-[#D6484C] dark:text-[#F26B6F] font-semibold' : 'text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>
                {durum.metin}
              </p>
            )}
            {izinEksik && (
              <button type="button" onClick={() => void izniYenile()} disabled={!!calisiyor}
                className="mt-2 w-full min-h-11 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
                {calisiyor === 'yenile' ? 'İzin soruluyor…' : 'Drive iznini yenile'}
              </button>
            )}

            {/* Üstteki çarpı kırpılsa bile buradan çıkılır */}
            <button
              onClick={() => setAcik(false)}
              className="mt-4 w-full py-2 rounded-lg border border-[#CFC5B4]
                         dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9]
                         text-xs font-mono hover:bg-[#F3EFE8]
                         dark:hover:bg-[#17345A] cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Yedekleme;
