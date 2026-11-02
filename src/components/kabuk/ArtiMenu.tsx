import React, { useEffect, useRef, useState } from 'react';
import { PenLine, StickyNote, Send, NotebookText } from 'lucide-react';

/**
 * Yaz tuşu (2 Kasım, Kemal: "Hızlı not, Kems'e yaz ve Notlar tek tuşta").
 * Dokununca seçim açılır. Telefonda alt menünün sağında, masaüstünde sol
 * çubukta durur. (1 Ekim'den beri kiremit "+" idi.)
 */
export const ArtiMenu: React.FC<{
  onNot: () => void;
  onFikir: () => void;
  /** Not defterini açar */
  onNotlar?: () => void;
  /** Kutuda bekleyen fikir sayısı (fikir satırında görünür) */
  fikirSayisi?: number;
  /** Menü hangi yöne açılsın: 'asagi' (üst çubuk) ya da 'sag' (sol çubuk) */
  yon?: 'asagi' | 'sag' | 'yukari';
  /** Dış kutunun sınıfı (alt menüde hücreyi doldurmak için) */
  kapsayiciSinifi?: string;
  /** Tetik düğmesinin görünüşü; verilmezse yuvarlak kiremit düğme */
  tetikSinifi?: string;
  /** Tetikte simgenin yanında yazı (sol çubukta açılınca görünür) */
  etiket?: React.ReactNode;
}> = ({ onNot, onFikir, onNotlar, fikirSayisi = 0, yon = 'asagi', kapsayiciSinifi, tetikSinifi, etiket }) => {
  const [acik, setAcik] = useState(false);
  const kutu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false); };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('mousedown', disari); document.removeEventListener('keydown', tus); };
  }, [acik]);

  const sec = (f: () => void) => { setAcik(false); f(); };
  const SATIR = 'w-full min-h-11 flex items-center gap-3 px-3 rounded-lg text-left text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-[#F3EFE8] dark:hover:bg-[#2C3C72] cursor-pointer';

  return (
    <div ref={kutu} className={`relative ${kapsayiciSinifi ?? ''}`}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Yaz: not ya da Kems'e"
        title="Yaz: not ya da Kems'e"
        className={tetikSinifi ?? 'w-11 h-11 rounded-full bg-[#F26B6F] text-white flex items-center justify-center hover:opacity-90 cursor-pointer'}
      >
        <PenLine className="w-5 h-5 shrink-0" />
        {etiket}
      </button>
      {acik && (
        <div
          className={`absolute z-50 w-56 p-1.5 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] shadow-xl ${
            yon === 'sag' ? 'left-full bottom-0 ml-2' : yon === 'yukari' ? 'right-0 bottom-full mb-2' : 'right-0 top-full mt-2'
          }`}
        >
          <button type="button" onClick={() => sec(onNot)} className={SATIR}>
            <StickyNote className="w-4 h-4 text-[#6A5E4C] dark:text-[#A6B0C9]" />
            <span className="flex-1">Hızlı not<span className="block text-[12px] font-normal text-[#6A5E4C] dark:text-[#A6B0C9]">not defterinde yeni sayfa</span></span>
          </button>
          <button type="button" onClick={() => sec(onFikir)} className={SATIR}>
            <Send className="w-4 h-4 text-[#D6484C] dark:text-[#F26B6F]" />
            <span className="flex-1">Kems'e yaz<span className="block text-[12px] font-normal text-[#6A5E4C] dark:text-[#A6B0C9]">fikir kutusu; oradan ajansa gider</span></span>
            {fikirSayisi > 0 && <span className="text-[12px] tabular-nums text-[#6A5E4C] dark:text-[#A6B0C9]">{fikirSayisi}</span>}
          </button>
          {onNotlar && (
            <button type="button" onClick={() => sec(onNotlar)} className={SATIR}>
              <NotebookText className="w-4 h-4 text-[#6A5E4C] dark:text-[#A6B0C9]" />
              <span className="flex-1">Notlar<span className="block text-[12px] font-normal text-[#6A5E4C] dark:text-[#A6B0C9]">bütün notlar</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ArtiMenu;
