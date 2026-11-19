import React, { Suspense, useEffect, useState } from 'react';
import { Box, Image as ImageIcon, Maximize2, X } from 'lucide-react';

/** three.js yalnız 3B açılınca iner (bina kütüphanesinin önizlemesi) */
const ModelOnizleme = React.lazy(() => import('../oyun/ModelOnizleme'));

/**
 * Viki maddesinde 3B görünüm (19 Kasım, `lib/maddeModelleri.ts`). Künyenin
 * görsel alanında "Görsel · 3B" seçimi; 3B'ye basılınca model iner. Parmakla /
 * fareyle döner, iki parmakla / tekerlekle yakınlaşır. "Büyüt" tam ekranda açar.
 * Yalnız gösterir; kayda yazmaz.
 */

const KUTU = 'w-full aspect-[4/3] max-h-[60vh] rounded-md bg-[#F3EFE8] overflow-hidden';

const Onizleme: React.FC<{ dosya: string; baslik: string; buyuk?: boolean; className: string }> = ({ dosya, baslik, buyuk, className }) => (
  <Suspense fallback={<div className={`${className} flex items-center justify-center text-[12px] text-gri`}>Model yükleniyor…</div>}>
    <ModelOnizleme dosya={dosya} baslik={baslik} buyuk={buyuk} className={className} />
  </Suspense>
);

export const Madde3B: React.FC<{
  dosya: string;
  baslik: string;
  /** Maddenin görsel alanı (görsel yoksa verilmez; 3B tek başına açılır) */
  gorselAlani?: React.ReactNode;
  maddeId: string;
}> = ({ dosya, baslik, gorselAlani, maddeId }) => {
  const [ucB, setUcB] = useState(false);
  const [buyuk, setBuyuk] = useState(false);
  // Başka maddeye geçince görsele dönülür
  useEffect(() => { setUcB(false); setBuyuk(false); }, [maddeId]);
  useEffect(() => {
    if (!buyuk) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuyuk(false); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [buyuk]);

  const sekme = (aktif: boolean) =>
    `inline-flex items-center gap-1 px-2.5 min-h-8 rounded-full text-[11px] font-mono cursor-pointer transition-colors ${aktif
      ? 'bg-[#0E1C4F] text-[#F3EFE8] dark:bg-[#2C3C72]'
      : 'border border-bej/70 text-gri hover:text-lacivert'}`;

  return (
    <div className="border-b border-bej/40 dark:border-lacivert-600/40 bg-[#F3EFE8] p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        {gorselAlani && (
          <button type="button" onClick={() => setUcB(false)} className={sekme(!ucB)} aria-pressed={!ucB}>
            <ImageIcon size={12} /> Görsel
          </button>
        )}
        <button type="button" onClick={() => setUcB(true)} className={sekme(ucB)} aria-pressed={ucB}>
          <Box size={12} /> 3B
        </button>
        <span className="flex-1" />
        {ucB && (
          <button type="button" onClick={() => setBuyuk(true)} className={sekme(false)} aria-label="3B görünümü büyüt">
            <Maximize2 size={12} /> Büyüt
          </button>
        )}
      </div>

      {ucB ? (
        <>
          <Onizleme dosya={dosya} baslik={baslik} className={KUTU} />
          <p className="text-[11px] text-gri">Taslak model. Parmakla çevir, iki parmakla yaklaş.</p>
        </>
      ) : gorselAlani ?? (
        <button type="button" onClick={() => setUcB(true)}
          className={`${KUTU} flex flex-col items-center justify-center gap-1.5 text-[12px] text-gri hover:text-lacivert cursor-pointer`}>
          <Box size={28} /> 3B görünümü aç
        </button>
      )}

      {buyuk && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4" onClick={() => setBuyuk(false)}
          role="dialog" aria-modal="true" aria-label={`${baslik} · 3B`}>
          <div className="w-full max-w-5xl rounded-lg bg-krem-acik dark:bg-lacivert-800 p-2 sm:p-3 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <p className="flex-1 min-w-0 truncate text-[14px] font-semibold text-lacivert dark:text-krem">{baslik} <span className="font-normal text-gri">· 3B taslak</span></p>
              <button type="button" onClick={() => setBuyuk(false)} aria-label="Kapat" className="w-11 h-11 flex items-center justify-center text-gri cursor-pointer"><X size={18} /></button>
            </div>
            <Onizleme dosya={dosya} baslik={baslik} buyuk className="w-full h-[78vh] rounded-md bg-[#F3EFE8] overflow-hidden" />
          </div>
        </div>
      )}
    </div>
  );
};
