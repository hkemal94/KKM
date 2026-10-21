import React, { useRef, useState } from 'react';
import { Download, Upload, Archive, X } from 'lucide-react';
import type { Item, UserSettings } from '../types';
import { driveYedekYukle, YEDEK_KLASORU } from '../lib/googleApi';
import { driveIzniniYenile, getCachedAccessToken, izinEksikMi, signInWithGoogle } from '../lib/firebase';
import { gorselYedegi, gorselleriGeriYaz } from '../lib/gorselDeposu';
import {
  haritaDuzeniniYedekIcinOku, haritaDuzeniniYedektenYaz
} from '../lib/haritaDuzeni';

/**
 * Yedekleme (K2).
 *
 * Firestore'un zamanlanmış yedeklemesi bu projenin katmanında (AI Studio
 * Starter) kapalı. Otomatik yedek alınamıyor, o yüzden elle alınıyor:
 * tek düğme, tek dosya.
 *
 * Geri yükleme BİLEREK eksiltmeyen biçimde çalışıyor: yedekteki kayıtlar
 * eklenir ya da üstüne yazılır, yedekte olmayanlara dokunulmaz. Yani yanlış
 * bir dosya seçmek veriyi silmez. Gerçekten silmek isteyen kayıtları tek tek
 * siler.
 */

const SURUM = 1;
const SON_YEDEK_ANAHTARI = 'kems_son_yedek';

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
  haritaDuzeni: unknown;
}

function sonYedekZamani(): number | null {
  try {
    const v = localStorage.getItem(SON_YEDEK_ANAHTARI);
    return v ? Number(v) : null;
  } catch { return null; }
}

function gunFarki(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000);
}

export const Yedekleme: React.FC<YedeklemeProps> = ({ items, settings, onKayit, tetikSinifi, etiket }) => {
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  /** Drive izni eksik çıktıysa "Drive iznini yenile" düğmesi görünür */
  const [izinEksik, setIzinEksik] = useState(false);
  const [sonYedek, setSonYedek] = useState<number | null>(() => sonYedekZamani());
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

  const yedekVerisi = async (): Promise<YedekDosyasi> => ({
    uygulama: 'Kems Komuta Merkezi',
    surum: SURUM,
    tarih: new Date().toISOString(),
    sayilar: { madde: items.length },
    settings,
    items,
    gorseller: await gorselYedegi(items),
    haritaDuzeni: haritaDuzeniniYedekIcinOku()
  });

  /** Drive'daki "KKM yedekleri" klasörüne (yapisal-2, 27) */
  const driveaKaydet = async () => {
    setCalisiyor(true);
    setDurum(null);
    try {
      if (!getCachedAccessToken()) await signInWithGoogle();
      const bugun = new Date().toISOString().slice(0, 10);
      await driveYedekYukle(`kems-yedek-${bugun}.json`, JSON.stringify(await yedekVerisi()));
      const simdi = Date.now();
      try { localStorage.setItem(SON_YEDEK_ANAHTARI, String(simdi)); } catch { /* yok */ }
      setSonYedek(simdi);
      setDurum(`${items.length} madde Drive'da "${YEDEK_KLASORU}" klasörüne kaydedildi.`);
      setIzinEksik(false);
    } catch (e) {
      // İzin eksikse açıklama + "Drive iznini yenile" düğmesi (1 Ekim)
      if (izinEksikMi(e)) {
        setIzinEksik(true);
        setDurum("Google, uygulamaya Drive'a yazma izni vermemiş. Aşağıdaki düğmeye bas; açılan Google ekranında Drive kutusunu işaretle.");
      } else {
        setDurum(`Drive'a kaydedilemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
      }
    } finally {
      setCalisiyor(false);
    }
  };

  const izniYenile = async () => {
    setDurum(null);
    try {
      await driveIzniniYenile();
      setIzinEksik(false);
      await driveaKaydet();
    } catch (e) {
      setDurum(`İzin alınamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
    }
  };

  const indir = async () => {
    setCalisiyor(true);
    let yedek: YedekDosyasi;
    try {
      yedek = await yedekVerisi();
    } catch (e) {
      setDurum(`Yedek hazırlanamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
      return;
    } finally {
      setCalisiyor(false);
    }
    const bugun = new Date().toISOString().slice(0, 10);
    const bag = document.createElement('a');
    bag.href = URL.createObjectURL(
      new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' })
    );
    bag.download = `kems-yedek-${bugun}.json`;
    bag.click();
    URL.revokeObjectURL(bag.href);

    const simdi = Date.now();
    try { localStorage.setItem(SON_YEDEK_ANAHTARI, String(simdi)); } catch { /* yok */ }
    setSonYedek(simdi);
    setDurum(`${items.length} madde indirildi.`);
  };

  const yukle = async (dosya: File) => {
    setCalisiyor(true);
    setDurum(null);
    try {
      const veri = JSON.parse(await dosya.text()) as Partial<YedekDosyasi>;
      if (!Array.isArray(veri.items)) {
        setDurum('Bu dosya bir Kems yedeği değil.');
        return;
      }
      if (!window.confirm(
        `${veri.items.length} kayıt geri yüklenecek.\n\n`
        + 'Aynı kimlikli kayıtların üstüne yazılır. '
        + 'Yedekte olmayan kayıtlar SİLİNMEZ.\n\nDevam edilsin mi?'
      )) return;

      let yazilan = 0;
      for (const kayit of veri.items) {
        if (!kayit || !kayit.id) continue;
        await onKayit(kayit);
        yazilan++;
      }
      if (veri.haritaDuzeni) {
        await haritaDuzeniniYedektenYaz(veri.haritaDuzeni);
      }
      // Galeri görselleri (21 Ekim): olmayan görsel belgeleri yazılır
      const gorselSayisi = veri.gorseller ? await gorselleriGeriYaz(veri.gorseller) : 0;
      setDurum(`${yazilan} kayıt geri yüklendi${gorselSayisi ? `, ${gorselSayisi} galeri görseli yazıldı` : ''}.`);
    } catch (e) {
      setDurum(`Okunamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
    } finally {
      setCalisiyor(false);
      if (dosyaGirdisi.current) dosyaGirdisi.current.value = '';
    }
  };

  const gun = sonYedek === null ? null : gunFarki(sonYedek);
  const eski = gun === null || gun >= 30;

  return (
    <>
      <button
        ref={tetik}
        onClick={() => setAcik(true)}
        title={
          gun === null ? 'Henüz yedek alınmadı'
            : gun === 0 ? 'Bugün yedek alındı'
              : `Son yedek ${gun} gün önce`
        }
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
                  {gun === null ? 'Henüz yedek alınmadı.'
                    : gun === 0 ? 'Bugün yedek alındı.'
                      : `Son yedek ${gun} gün önce.`}
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
              Bütün maddeler, ayarlar ve harita düzeni tek bir dosyaya iner.
              Otomatik yedek bu Firebase katmanında sunulmuyor, o yüzden elle
              alınıyor.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => void indir()}
                disabled={calisiyor}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg
                           bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8] text-xs
                           font-mono hover:opacity-90 disabled:opacity-40
                           cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Yedek indir · {items.length} madde
              </button>

              <button
                onClick={() => void driveaKaydet()}
                disabled={calisiyor}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg
                           border border-[#0E1C4F] dark:border-[#F26B6F]
                           text-[#0E1C4F] dark:text-[#F3EFE8] text-xs font-mono
                           hover:bg-[#F3EFE8] dark:hover:bg-[#17345A]
                           disabled:opacity-40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Drive'a kaydet · {YEDEK_KLASORU}
              </button>

              <button
                onClick={() => dosyaGirdisi.current?.click()}
                disabled={calisiyor}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg
                           border border-[#CFC5B4] dark:border-[#2C3C72]
                           text-[#6A5E4C] dark:text-[#A6B0C9] text-xs font-mono
                           hover:bg-[#F3EFE8] dark:hover:bg-[#17345A]
                           disabled:opacity-40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {calisiyor ? 'Yükleniyor…' : 'Yedekten geri yükle'}
              </button>
              <input
                ref={dosyaGirdisi}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void yukle(f);
                }}
              />
            </div>

            <p className="mt-3 text-[11px] leading-snug text-[#6A5E4C] dark:text-[#A6B0C9]
                          dark:text-[#95A1C2]">
              Geri yükleme eksiltmez: yedekteki kayıtlar eklenir ya da üstüne
              yazılır, yedekte olmayanlara dokunulmaz.
            </p>

            {durum && (
              <p className="mt-3 px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A]
                            text-xs text-[#6A5E4C] dark:text-[#A6B0C9]">
                {durum}
              </p>
            )}
            {izinEksik && (
              <button type="button" onClick={() => void izniYenile()} disabled={calisiyor}
                className="mt-2 w-full min-h-11 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
                Drive iznini yenile
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
