import React, { useEffect, useRef, useState } from 'react';
import { LogOut, KeyRound, UserRound } from 'lucide-react';

/**
 * Sol çubuktaki "Google hesabı" satırı (1 Ekim, Kemal: "çıkış butonu
 * yok"). Bağlıysa basınca küçük menü: Çıkış yap · Drive iznini yenile.
 * Çıkış bir kez onay sorar; kayıtlara dokunmaz.
 */
export const HesapMenusu: React.FC<{
  girisli: boolean;
  eposta?: string | null;
  foto?: string | null;
  /** Kapalı çubukta gizlenen yazıların sınıfı */
  yaziSinifi: string;
  onBaglan: () => void;
  onCikis: () => void;
  onDriveIzni: () => void;
}> = ({ girisli, eposta, foto, yaziSinifi, onBaglan, onCikis, onDriveIzni }) => {
  const [acik, setAcik] = useState(false);
  const kutu = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false); };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    document.addEventListener('mousedown', disari);
    window.addEventListener('keydown', tus);
    return () => { document.removeEventListener('mousedown', disari); window.removeEventListener('keydown', tus); };
  }, [acik]);

  const SATIR = 'w-full min-h-11 flex items-center gap-3 px-3 rounded-lg text-left text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-[#F3EFE8] dark:hover:bg-[#2C3C72] cursor-pointer';

  return (
    <div ref={kutu} className="relative">
      <button
        type="button"
        onClick={() => (girisli ? setAcik(a => !a) : onBaglan())}
        aria-expanded={girisli ? acik : undefined}
        title={girisli ? `Google hesabı: ${eposta || ''}` : 'Açık Erişim'}
        className={`relative w-full h-11 rounded-xl flex items-center gap-3 px-3 cursor-pointer hover:bg-white/10 ${girisli ? 'text-[#A6B0C9] hover:text-white' : 'text-[#A6B0C9]'}`}
      >
        {girisli && foto
          ? <img src={foto} alt="" referrerPolicy="no-referrer" className="w-7 h-7 -ml-[5px] rounded-full shrink-0" />
          : <UserRound className="w-[18px] h-[18px] shrink-0" />}
        <span className={`${yaziSinifi} text-[13px] font-semibold`}>{girisli ? 'Google hesabı' : 'Açık Erişim'}</span>
      </button>
      {acik && (
        <div className="fixed left-60 bottom-4 z-50 w-64 p-1.5 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] shadow-xl">
          {eposta && <div className="px-3 py-2 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] truncate">{eposta}</div>}
          <button type="button" onClick={() => { setAcik(false); onDriveIzni(); }} className={SATIR}>
            <KeyRound className="w-4 h-4 text-[#6A5E4C] dark:text-[#A6B0C9]" /> Drive iznini yenile
          </button>
          <button type="button" onClick={() => { setAcik(false); onCikis(); }} className={SATIR}>
            <LogOut className="w-4 h-4 text-[#D6484C] dark:text-[#F26B6F]" /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
};

export default HesapMenusu;
