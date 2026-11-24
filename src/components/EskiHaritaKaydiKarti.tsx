import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { auth, sunucuyaUlas } from '../lib/firebase';
import { buluttakiHaritaKaydi, haritaKaydiniSil } from '../lib/haritaDuzeni';
import { kuralHatasiMi, yedekleriListele } from '../lib/haritaYedegi';

/** Kartın okuduğu durum: eski kayıt duruyor mu, son harita yedeği ne zaman (yoksa null) */
export interface EskiKayitDurumu { kayitVar: boolean; sonYedek: number | null }

/** Buluttan okur: eski harita kaydı ve son harita yedeğinin tarihi (yalnız okuma) */
async function buluttanOku(): Promise<EskiKayitDurumu> {
  const uid = auth.currentUser?.uid;
  const kayit = await sunucuyaUlas(buluttakiHaritaKaydi());
  if (!kayit || !uid) return { kayitVar: !!kayit, sonYedek: null };
  const liste = await yedekleriListele(uid).catch(() => []);
  return { kayitVar: true, sonYedek: liste[0]?.olusturma ?? null };
}

const tarihYaz = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * "Eski harita kaydını sil" (tek harita 11. adım, KKM-C; Kemal, 23 Kasım:
 * eski harita kaydı harita yedeğinden sonra silinsin). Durum → Eksikler.
 *
 * Tek seferlik: yalnız `duzada/haritaDuzeni` belgesi bulutta varken görünür.
 * Son harita yedeğinin tarihini gösterir; yedek yoksa düğme kapalı. Basınca
 * önce onay sorulur, sonra yalnız o belge silinir. İkinci açılışta belge
 * olmadığı için kart görünmez. Sayfa açılınca yalnız okunur.
 */
export const EskiHaritaKaydiKarti: React.FC<{
  /** Deneme sayfası için: durumu okuyan iş (verilmezse bulut) */
  oku?: () => Promise<EskiKayitDurumu>;
  /** Deneme sayfası için: silen iş (verilmezse buluttaki belge silinir) */
  sil?: () => Promise<void>;
}> = ({ oku = buluttanOku, sil = haritaKaydiniSil }) => {
  const [durum, setDurum] = useState<EskiKayitDurumu | null>(null);
  const [onay, setOnay] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<{ metin: string; hata?: boolean } | null>(null);

  useEffect(() => {
    let iptal = false;
    oku().then(d => { if (!iptal) setDurum(d); }).catch(() => { if (!iptal) setDurum(null); });
    return () => { iptal = true; };
  }, [oku]);

  const sileBas = async () => {
    setOnay(false);
    setCalisiyor(true);
    setRapor(null);
    try {
      await sunucuyaUlas(sil());
      setDurum({ kayitVar: false, sonYedek: durum?.sonYedek ?? null });
      setRapor({ metin: 'Eski harita kaydı silindi. Harita yedekleri duruyor.' });
    } catch (e) {
      setRapor({
        metin: kuralHatasiMi(e)
          ? 'Silinemedi: veritabanı kuralı henüz yapıştırılmamış (firestore.rules). Kuralı Firebase konsoluna yapıştırıp yeniden bas.'
          : `Silinemedi: ${e instanceof Error ? e.message : String(e)}. Kayıt olduğu gibi duruyor.`,
        hata: true
      });
    } finally {
      setCalisiyor(false);
    }
  };

  if (rapor && !rapor.hata) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor.metin}</p>;
  if (!durum?.kayitVar) return null;
  const yedekYok = durum.sonYedek === null;

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/50 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <Trash2 className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Eski harita kaydını sil</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Eski haritanın ve Kurucu'nun kaydı bulutta duruyor; hiçbir ekran onu kullanmıyor. Yalnız bu kayıt silinir:
            viki maddeleri, tek harita ve harita yedekleri olduğu gibi kalır. Silinen geri gelmez.
          </p>
          <p className={`mt-1 text-[12px] ${yedekYok ? 'text-[#D6484C] dark:text-[#F26B6F] font-semibold' : 'text-[#0E1C4F] dark:text-[#F3EFE8]'}`}>
            {yedekYok
              ? 'Bulutta harita yedeği yok: önce Harita yedeği al (yukarıdaki kart).'
              : `Son harita yedeği: ${tarihYaz(durum.sonYedek!)}.`}
          </p>
        </div>
        {!onay && (
          <button
            type="button"
            disabled={calisiyor || yedekYok}
            onClick={() => setOnay(true)}
            className="shrink-0 min-h-9 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40 cursor-pointer bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]"
          >
            {calisiyor ? 'Siliniyor…' : 'Sil'}
          </button>
        )}
      </div>
      {onay && (
        <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-2 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          <span className="min-w-0 flex-1">Eski harita kaydı silinsin mi? Geri alınamaz.</span>
          <button type="button" onClick={() => setOnay(false)} className="shrink-0 min-h-9 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8]">Vazgeç</button>
          <button type="button" onClick={() => void sileBas()} className="shrink-0 min-h-9 px-3 rounded-lg text-[12px] font-semibold cursor-pointer bg-[#F26B6F] text-white">Evet, sil</button>
        </div>
      )}
      {rapor?.hata && <p className="mt-2 ml-7 text-[12px] font-semibold text-[#D6484C] dark:text-[#F26B6F]">{rapor.metin}</p>}
    </div>
  );
};

export default EskiHaritaKaydiKarti;
