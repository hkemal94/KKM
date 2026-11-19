import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { BolumBasligi, Rozet } from '../kabuk/Parcalar';
import { DUGME_BOS, IKINCIL, KART, YAZI } from '../anasayfa/stil';
import { depoSayfasi } from '../../lib/depoBelgesi';
import { tarihYazisi } from '../../lib/ekranGoruntuleri';
import { CIZIM_SIRASI, durumYazisi, galeriyiOku, GALERI_YOLU, kumele, type GaleriBolumu, type GaleriGorseli } from '../../lib/planGalerisi';

/**
 * Planlar ve çizimler (19 Kasım, Kemal: minigolf planları KKM'deki oyun
 * galerisinde saklansın). Oyunun deposundaki `docs/galeri.json`'u okur
 * (`lib/planGalerisi.ts`); bölümler listeden gelir, "Delikler" her deliğin
 * çizimlerini yan yana, "Eski sürümler" kümeleriyle gösterir. Yalnız gösterir.
 */

const KART_DUGME = `${KART} p-2 flex flex-col gap-1 text-left cursor-zoom-in hover:ring-2 hover:ring-[#F26B6F]/40`;

const Kart: React.FC<{ g: GaleriGorseli; onAc: (g: GaleriGorseli) => void }> = ({ g, onAc }) => (
  <button type="button" title={g.yol} onClick={() => onAc(g)} className={KART_DUGME}>
    <span className={`aspect-[4/3] w-full flex items-center justify-center overflow-hidden rounded-lg ${g.yol.endsWith('.svg') ? 'bg-white' : 'bg-[#F3EFE8] dark:bg-[#0B132B]'}`}>
      <img src={g.adres} alt={g.baslik} loading="lazy" className="w-full h-full object-contain" />
    </span>
    <span className={`text-[12px] font-semibold leading-snug ${YAZI}`}>{g.baslik}</span>
    <span className={`text-[11px] ${IKINCIL}`}>{[tarihYazisi(g.tarih), durumYazisi(g)].filter(Boolean).join(' · ')}</span>
  </button>
);

const Izgara: React.FC<{ gorseller: GaleriGorseli[]; onAc: (g: GaleriGorseli) => void }> = ({ gorseller, onAc }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
    {gorseller.map(g => <Kart key={g.yol} g={g} onAc={onAc} />)}
  </div>
);

/** Delikler: her delik bir satır, delik ekranı · atış ekranı · ölçülü şema */
const DelikSatirlari: React.FC<{ gorseller: GaleriGorseli[]; onAc: (g: GaleriGorseli) => void }> = ({ gorseller, onAc }) => {
  const kumeler = useMemo(() => kumele(gorseller, g => g.delik ?? null)
    .sort((a, b) => (a.anahtar ?? 999) - (b.anahtar ?? 999)), [gorseller]);
  return (
    <div className="space-y-3">
      {kumeler.map(k => (
        <div key={String(k.anahtar)} className="space-y-1.5">
          {k.anahtar !== null && <p className={`text-[13px] font-semibold ${YAZI}`}>Delik {k.anahtar}</p>}
          <div className="grid grid-cols-3 gap-2">
            {[...k.gorseller].sort((a, b) => CIZIM_SIRASI.indexOf(a.tur ?? 'sema') - CIZIM_SIRASI.indexOf(b.tur ?? 'sema'))
              .map(g => <Kart key={g.yol} g={g} onAc={onAc} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

export const PlanGalerisi: React.FC<{ depo: string }> = ({ depo }) => {
  const [bolumler, setBolumler] = useState<GaleriBolumu[] | null | undefined>(undefined);
  const [tur, setTur] = useState(0);
  const [eskiAcik, setEskiAcik] = useState(false);
  const [buyuk, setBuyuk] = useState<GaleriGorseli | null>(null);

  useEffect(() => {
    let iptal = false;
    setBolumler(undefined);
    void galeriyiOku(depo).then(b => { if (!iptal) setBolumler(b); });
    return () => { iptal = true; };
  }, [depo, tur]);

  useEffect(() => {
    if (!buyuk) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setBuyuk(null); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [buyuk]);

  const toplam = (bolumler || []).reduce((t, b) => t + b.gorseller.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[13px] ${IKINCIL} min-w-0 break-all`}>
          Depodan okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span> · {GALERI_YOLU}{bolumler ? ` · ${toplam} çizim` : ''}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        <a href={depoSayfasi(depo, GALERI_YOLU)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
      </div>

      <div className={`${KART} p-4 flex gap-3 items-start`}>
        <Rozet renk="dikkat">taslak</Rozet>
        <p className={`flex-1 text-[13px] leading-relaxed ${IKINCIL}`}>
          Oyun ajanlarının çizimleri; birleşmiş PR'lardan gelir. Kemal açıkça onaylamadıkça "taslak" yazar. Eski sürümler silinmez, en altta durur. Oyun verisi; vikiye girmez.
        </p>
      </div>

      {bolumler === undefined && <p className={`text-[14px] ${IKINCIL}`}>Okunuyor…</p>}
      {bolumler === null && <p className={`${KART} px-4 py-3 text-[14px] ${IKINCIL}`}>Oyunun deposunda galeri listesi henüz yok ({GALERI_YOLU}). Oyun ajanının galeri PR'ı birleşince burada görünür.</p>}
      {bolumler && bolumler.length === 0 && <p className={`${KART} px-4 py-3 text-[14px] ${IKINCIL}`}>Listede henüz çizim yok.</p>}

      {(bolumler || []).map(b => (
        <section key={b.id} className="space-y-2">
          {b.id === 'eski' ? (
            <button type="button" onClick={() => setEskiAcik(a => !a)} className="w-full flex items-center gap-1.5 cursor-pointer">
              {eskiAcik ? <ChevronDown className={`w-4 h-4 ${IKINCIL}`} /> : <ChevronRight className={`w-4 h-4 ${IKINCIL}`} />}
              <BolumBasligi baslik={b.baslik} sayi={b.gorseller.length} renk="bekliyor" className="flex-1" />
            </button>
          ) : (
            <BolumBasligi baslik={b.baslik} sayi={b.gorseller.length} renk="lacivert" />
          )}
          {b.id === 'delik' && <DelikSatirlari gorseller={b.gorseller} onAc={setBuyuk} />}
          {b.id === 'eski' && eskiAcik && kumele(b.gorseller, g => g.grup ?? '').map(k => (
            <div key={k.anahtar} className="space-y-1.5">
              {k.anahtar && <p className={`text-[13px] font-semibold ${YAZI}`}>{k.anahtar} <span className={`font-normal ${IKINCIL}`}>· {k.gorseller.length}</span></p>}
              <Izgara gorseller={k.gorseller} onAc={setBuyuk} />
            </div>
          ))}
          {b.id !== 'delik' && b.id !== 'eski' && <Izgara gorseller={b.gorseller} onAc={setBuyuk} />}
        </section>
      ))}

      {buyuk && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 gap-3 cursor-zoom-out" role="dialog" aria-modal="true" aria-label={buyuk.baslik} onClick={() => setBuyuk(null)}>
          <button type="button" onClick={() => setBuyuk(null)} aria-label="Kapat" className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white cursor-pointer"><X className="w-5 h-5" /></button>
          <img src={buyuk.adres} alt={buyuk.baslik} className={`max-w-full max-h-[80vh] rounded-xl object-contain ${buyuk.yol.endsWith('.svg') ? 'bg-white' : ''}`} />
          <div className="text-center text-[#F3EFE8]">
            <div className="text-[14px] font-semibold">{buyuk.baslik}</div>
            <div className="text-[12px] text-[#C9D0E3]">{[tarihYazisi(buyuk.tarih), durumYazisi(buyuk)].filter(Boolean).join(' · ')}</div>
            {buyuk.not && <div className="text-[12px] text-[#C9D0E3]">{buyuk.not}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanGalerisi;
