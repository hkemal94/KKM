import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import type { Item } from '../types';
import { auth, sunucuyaUlas } from '../lib/firebase';
import { buluttakiHaritaKaydi, haritaDuzeniniYedektenYaz } from '../lib/haritaDuzeni';
import {
  EN_COK_YEDEK, geriYuklemeOzeti, kuralHatasiMi, vikiGeriYuklemeleri, yedegiBulutaYaz, yedegiIndir,
  yedegiOku, yedekIcerigi, yedekleriListele, type GeriYuklemeOzeti, type HaritaYedegi, type YedekBasi
} from '../lib/haritaYedegi';

/**
 * Harita yedeği kartı (18 Kasım, kompakt ada A adımı). Durum → Eksikler.
 *
 * "Yedeği al": buluttaki harita kaydını ve haritaya bağlı viki alanlarını
 * bilgisayara indirir ve buluttaki yedeklere yazar. En çok 3 yedek; dördüncüde
 * en eskisini silmek için Kemal'in onayı istenir.
 *
 * "Geri yükle": önce ne değişeceğini gösterir; Kemal onaylayınca şimdiki hâli
 * bilgisayara indirir, sonra harita kaydını tek yazmada yedekteki hâline
 * döndürür. Viki alanları yalnız kutu işaretlenirse yazılır.
 *
 * Sayfa açılınca yalnız yedek listesi okunur; kayda hiçbir şey yazılmaz.
 */

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
}

interface GeriYukleme {
  bas: YedekBasi;
  yedek: HaritaYedegi;
  simdi: Record<string, unknown> | null;
  ozet: GeriYuklemeOzeti;
  viki: Item[];
}

const tarihYaz = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hataYaz = (e: unknown) => kuralHatasiMi(e)
  ? 'veritabanı kuralı henüz yayımlanmamış (firestore.rules)'
  : e instanceof Error && e.message === 'zaman-asimi' ? 'bağlantı yok ya da çok yavaş' : e instanceof Error ? e.message : String(e);

const dugme = 'shrink-0 min-h-9 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40 cursor-pointer';
const koyu = `${dugme} bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]`;
const bos = `${dugme} border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8]`;

export const HaritaYedegiKarti: React.FC<Props> = ({ items, onUpdateItem }) => {
  const [liste, setListe] = useState<YedekBasi[] | null>(null);
  const [listeHatasi, setListeHatasi] = useState<string | null>(null);
  /** Veritabanı kuralı yayımlanmamış: bulut yedeği denenmez, yalnız indirme */
  const [kuralYok, setKuralYok] = useState(false);
  const [calisiyor, setCalisiyor] = useState<string | null>(null);
  const [rapor, setRapor] = useState<{ metin: string; hata?: boolean } | null>(null);
  /** 3 yedek varken: silinecek en eski yedek (Kemal onaylarsa) */
  const [silOnayi, setSilOnayi] = useState<YedekBasi | null>(null);
  const [geri, setGeri] = useState<GeriYukleme | null>(null);
  const [vikiDe, setVikiDe] = useState(false);

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

  /** Yedeği al: indir, buluta yaz. `sil` yalnız Kemal onaylayınca verilir */
  const yedekAl = async (sil?: YedekBasi) => {
    if (calisiyor || !uid) return;
    if (!sil && liste && liste.length >= EN_COK_YEDEK) { setSilOnayi(liste[liste.length - 1]); return; }
    setSilOnayi(null);
    setRapor(null);
    setCalisiyor('al');
    try {
      const ham = await sunucuyaUlas(buluttakiHaritaKaydi());
      if (!ham) { setRapor({ metin: 'Bulutta harita kaydı yok; yedeklenecek bir şey bulunmadı.', hata: true }); return; }
      const yedek = yedekIcerigi(ham, items);
      yedegiIndir(yedek);
      // Kural yayımlanmamışsa buluta hiç denenmez: yarım yazma olmaz
      if (kuralYok) {
        setRapor({ metin: `Yedek bilgisayarına indi (${tarihYaz(yedek.olusturma)}). Veritabanı kuralı yayımlanmadığı için buluta yazılmadı; inen dosyayı sakla.` });
        return;
      }
      try {
        await yedegiBulutaYaz(uid, yedek, sil);
        setRapor({ metin: `Yedek alındı (${tarihYaz(yedek.olusturma)}): bilgisayarına indi ve buluta yazıldı.${sil ? ` En eski yedek (${tarihYaz(sil.olusturma)}) silindi.` : ''}` });
      } catch (e) {
        if (kuralHatasiMi(e)) setKuralYok(true);
        setRapor({ metin: `Bilgisayarına indi, ama buluta yazılamadı: ${hataYaz(e)}. Bulutta hiçbir şey yazılmadı (yarım yedek kalmaz); inen dosyayı sakla.`, hata: true });
      }
      await listele();
    } catch (e) {
      setRapor({ metin: `Yedek alınamadı: ${hataYaz(e)}. Kayda hiçbir şey yazılmadı.`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  /** Geri yükleme: önce yalnız oku ve özeti göster */
  const geriYukleHazirla = async (bas: YedekBasi) => {
    if (calisiyor || !uid) return;
    setRapor(null);
    setGeri(null);
    setVikiDe(false);
    setCalisiyor(bas.id);
    try {
      const [yedek, simdi] = await Promise.all([yedegiOku(uid, bas), sunucuyaUlas(buluttakiHaritaKaydi())]);
      if (!yedek.haritaDuzeni) { setRapor({ metin: 'Bu yedekte harita kaydı yok; geri yüklenecek bir şey bulunmadı.', hata: true }); return; }
      setGeri({ bas, yedek, simdi, ozet: geriYuklemeOzeti(simdi, yedek.haritaDuzeni), viki: vikiGeriYuklemeleri(items, yedek.vikiAlanlari) });
    } catch (e) {
      setRapor({ metin: `Yedek okunamadı: ${hataYaz(e)}.`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  /** Kemal onayladı: şimdiki hâli indir, sonra tek yazmada geri yaz */
  const geriYukle = async () => {
    if (!geri || calisiyor) return;
    setCalisiyor('geri');
    setRapor(null);
    try {
      // Geri dönüş yolu: şimdiki hâl önce bilgisayara iner
      yedegiIndir(yedekIcerigi(geri.simdi, items), 'kkm-harita-geri-yukleme-oncesi');
      if (!geri.ozet.ayni) await sunucuyaUlas(haritaDuzeniniYedektenYaz(geri.yedek.haritaDuzeni, Number(geri.simdi?.kurucuSayac) || 0));
      let viki = 0;
      if (vikiDe) for (const i of geri.viki) { await onUpdateItem(i); viki++; }
      setRapor({ metin: `${geri.ozet.ayni ? `Harita zaten yedektekiyle aynıydı; ${viki} viki maddesi` : `Harita${viki ? ` ve ${viki} viki maddesi` : ''}`} ${tarihYaz(geri.bas.olusturma)} yedeğindeki hâline döndü. Geri yüklemeden önceki hâl bilgisayarına indi. Açık kalan Kurucu sekmeleri artık eski hâllerini yazamaz; onları yenile.` });
      setGeri(null);
    } catch (e) {
      setRapor({ metin: `Geri yüklenemedi: ${hataYaz(e)}.`, hata: true });
    } finally {
      setCalisiyor(null);
    }
  };

  if (!uid) return null;

  const degisen = geri?.ozet.satirlar.filter(r => r.gelecek || r.gidecek || r.degisecek) ?? [];

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <DatabaseBackup className="w-4 h-4 mt-0.5 shrink-0 text-[#0E1C4F] dark:text-[#F3EFE8]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Harita yedeği</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Haritanın bütün kaydı (Kurucu'daki yapılar, yollar, bağlar, evde oturanlar) ve haritaya bağlı viki alanları
            (rakım, harita konumu, işaretler) bilgisayarına iner ve buluta yazılır. En çok {EN_COK_YEDEK} yedek durur.
            Geri yüklemeden önce ne değişeceği gösterilir; sen onaylamadan hiçbir şey yazılmaz.
          </p>
        </div>
        <button type="button" disabled={!!calisiyor} onClick={() => void yedekAl()} className={koyu}>
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
        <div role="alert" className="mt-2.5 ml-7 px-3 py-2 rounded-lg border border-[#F26B6F]/60 bg-[#F26B6F]/10 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          <b>Veritabanı kuralı henüz yayımlanmamış.</b> Kural yayımlanana kadar yedek buluta yazılamaz:
          "Yedeği al" yalnız bilgisayarına indirir, buluta hiçbir şey (yarım bile) yazılmaz. Buluttaki yedekler ve
          "Yedekten geri yükle" kural yayımlanınca görünür; o zamana kadar inen dosya Yedekleme ekranından geri yüklenebilir.
        </div>
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
              <button type="button" disabled={!!calisiyor} onClick={() => void geriYukleHazirla(b)} className={bos}>
                {calisiyor === b.id ? 'Okunuyor…' : 'Yedekten geri yükle'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {geri && (
        <div className="mt-2.5 ml-7 p-3 rounded-lg border border-[#F26B6F]/50 bg-white/70 dark:bg-[#0E1C4F]/60 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          <p className="font-semibold">{tarihYaz(geri.bas.olusturma)} yedeğine dönülürse</p>
          {geri.ozet.ayni ? (
            <p className="mt-1 text-[#6A5E4C] dark:text-[#A6B0C9]">Harita kaydı yedektekiyle aynı; haritada bir şey değişmez.</p>
          ) : (
            <table className="mt-1.5 w-full text-[11px] tabular-nums">
              <thead className="text-[#6A5E4C] dark:text-[#A6B0C9]">
                <tr><th className="text-left font-normal">Ne</th><th className="text-right font-normal">Şimdi</th><th className="text-right font-normal">Yedekte</th><th className="text-right font-normal">Geri gelir</th><th className="text-right font-normal">Kalkar</th><th className="text-right font-normal">Eski hâline döner</th></tr>
              </thead>
              <tbody>
                {degisen.map(r => (
                  <tr key={r.ad}><td>{r.ad}</td><td className="text-right">{r.simdi}</td><td className="text-right">{r.yedekte}</td><td className="text-right">{r.gelecek || ''}</td><td className="text-right">{r.gidecek || ''}</td><td className="text-right">{r.degisecek || ''}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {geri.ozet.islenenDegisir && <p className="mt-1 text-[#6A5E4C] dark:text-[#A6B0C9]">Haritaya işlenmiş hâl (3B'de görünen) de yedektekine döner.</p>}
          {geri.viki.length > 0 ? (
            <label className="mt-2 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={vikiDe} onChange={e => setVikiDe(e.target.checked)} className="mt-0.5" />
              <span>Viki alanlarını da geri yaz ({geri.viki.length} madde: {geri.viki.slice(0, 4).map(i => i.title).join(', ')}{geri.viki.length > 4 ? '…' : ''}). Yalnız rakım, harita konumu, işaret ve ilgili not satırı değişir.</span>
            </label>
          ) : (
            <p className="mt-1 text-[#6A5E4C] dark:text-[#A6B0C9]">Viki alanları yedektekiyle aynı.</p>
          )}
          <p className="mt-2 text-[#6A5E4C] dark:text-[#A6B0C9]">Onaylarsan önce şimdiki hâl bilgisayarına iner, sonra harita kaydı tek yazmada yedekteki hâline döner.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setGeri(null)} className={bos}>Vazgeç</button>
            <button type="button" disabled={!!calisiyor || (geri.ozet.ayni && !(vikiDe && geri.viki.length))} onClick={() => void geriYukle()} className={`${dugme} bg-[#F26B6F] text-white`}>
              {calisiyor === 'geri' ? 'Geri yükleniyor…' : 'Onayla, geri yükle'}
            </button>
          </div>
        </div>
      )}

      {rapor && (
        <p className={`mt-2 ml-7 text-[12px] ${rapor.hata ? 'text-[#D6484C] dark:text-[#F26B6F] font-semibold' : 'text-[#336659] dark:text-[#8FC4A8]'}`}>{rapor.metin}</p>
      )}
    </div>
  );
};

export default HaritaYedegiKarti;
