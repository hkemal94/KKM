import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { Item } from '../../types';
import { GDD_SECIMLERI, secilenler, secimiUygula, serbestYazi, secimSatirlari } from './OyunSureci';

/**
 * Tasarım belgesinin bir bölümü, tıklamalı (Paket 5). Seçenekler bölüm
 * metnine "* Etiket: değer" satırı olarak yazılır; bölüm yoksa ilk tıkta
 * açılır. Altta serbest yazı kutusu — onu Kemal yazar.
 * Makyaj (14 Ekim, Kemal: "kutular küçük"): yazı kutusu içindeki yazı kadar
 * uzar, kaydırma çubuğu çıkmaz; yazı ve başlıklar büyüdü.
 */

interface Props {
  bolum: { id: string; ad: string; soru: string };
  kayit?: Item;
  onAc: (notlar: string) => Promise<void>;
  onYaz: (kayit: Item, notlar: string) => Promise<void>;
}

export const GddBolumu: React.FC<Props> = ({ bolum, kayit, onAc, onYaz }) => {
  const secimler = GDD_SECIMLERI[bolum.id] || [];
  const notlar = kayit?.notes || '';
  const [yazi, setYazi] = useState(serbestYazi(notlar));
  const [yaziliyor, setYaziliyor] = useState(false);
  useEffect(() => { setYazi(serbestYazi(kayit?.notes || '')); }, [kayit?.id]);
  // Yazı kutusu içeriği kadar uzar
  const kutu = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const k = kutu.current;
    if (!k) return;
    k.style.height = 'auto';
    k.style.height = `${k.scrollHeight + 2}px`;
  }, [yazi]);

  const dolu = secimler.filter(s => secilenler(notlar, s).length).length;

  const kaydet = async (yeni: string) => {
    setYaziliyor(true);
    try {
      if (kayit) await onYaz(kayit, yeni);
      else await onAc(yeni);
    } finally { setYaziliyor(false); }
  };

  const tikla = (sIdx: number, secenek: string) => {
    if (yaziliyor) return;
    void kaydet(secimiUygula(notlar, secimler[sIdx], secenek));
  };

  const yaziyiKaydet = () => {
    const yeni = [secimSatirlari(notlar), yazi.trim()].filter(Boolean).join('\n\n');
    if (yeni === notlar.trim()) return;
    void kaydet(yeni);
  };

  return (
    <div className="rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{bolum.ad}</p>
        {secimler.length > 0 && (
          <span className={`font-mono text-[12px] ${dolu === secimler.length ? 'text-[#4A7A62] dark:text-[#8FC4A8]' : 'text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>
            {dolu}/{secimler.length}
          </span>
        )}
      </div>
      <p className="text-[13px] text-[#6A5E4C] dark:text-[#A6B0C9]">{bolum.soru}</p>

      {secimler.map((s, i) => {
        const secili = secilenler(notlar, s);
        return (
          <div key={s.id} className="mt-3.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">
              {s.etiket}{s.coklu ? ' · birden çok seçilebilir' : ''}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {s.secenekler.map(o => {
                const bu = secili.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => tikla(i, o)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] border cursor-pointer transition-colors ${bu
                      ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] border-transparent'
                      : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F]'}`}
                  >
                    {bu && <Check className="w-3 h-3" />}{o}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-4 text-[11px] font-mono uppercase tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">{secimler.length ? 'Notlar' : 'Metin'}</div>
      <textarea
        ref={kutu}
        value={yazi}
        rows={3}
        onChange={e => setYazi(e.target.value)}
        onBlur={yaziyiKaydet}
        placeholder={secimler.length ? 'Eklemek istediğin not (isteğe bağlı)…' : 'Bu bölümü sen yazıyorsun…'}
        className="mt-1 w-full min-h-[5.5rem] resize-none overflow-hidden text-[14px] leading-relaxed bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-3 py-2.5 focus:outline-hidden focus:border-[#F26B6F]"
      />
    </div>
  );
};

export default GddBolumu;
