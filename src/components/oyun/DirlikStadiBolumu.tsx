import React, { Suspense, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Flag, Maximize2, RefreshCw, X } from 'lucide-react';
import { BolumBasligi, Rozet } from '../kabuk/Parcalar';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';
import { satirIci, depoSayfasi } from '../../lib/depoBelgesi';
import { AJANS_DEPOSU } from '../../lib/ajansDeposu';
import { GALERI_YOLU } from '../../lib/planGalerisi';
import {
  denemeyeBol, DIRLIK_MODELI, MINIGOLF_DEPOSU, PLAN_ADIMLARI, PLAN_KLASORU, planlariOku,
  type OkunanAdim, type OkunanPlanlar, type OkumaHatasi
} from '../../lib/dirlikStadi';

/** three.js yalnız bölüm açılınca iner */
const ModelOnizleme = React.lazy(() => import('./ModelOnizleme'));

/**
 * Dirlik Stadı bölümü (19 Kasım, Kemal; `lib/dirlikStadi.ts`). Bina
 * kütüphanesinde The Imperial Kemskoy'un yanında: kompleksin çevrilebilir
 * modeli, ajansın adım 1–3 planları (ajansın deposundan canlı), her adımda
 * Kemal'in kararları (soru dosyalarından olduğu gibi), viki maddesi ve
 * minigolfün planları. Yalnız gösterir; hiçbir kayda yazmaz.
 */

const HATA_YAZISI: Record<OkumaHatasi, string> = {
  'anahtar-yok': 'Bu tarayıcıda GitHub anahtarı yok; ajansın planları okunamıyor (Eksikler ve ayarlar).',
  'ana-dalda-yok': `Planlar ajansın ana dalında henüz yok (${PLAN_KLASORU}). Kems ana dala alınca burada görünür.`,
  sinir: 'GitHub şu an okumaya izin vermiyor (saatlik sınır); biraz sonra yenile.',
  hata: 'Planlar okunamadı; biraz sonra yenile.'
};

/** Markdown satırı; DENEME sözcüğü ayrı işaretle */
const Satir: React.FC<{ metin: string }> = ({ metin }) => (
  <>
    {denemeyeBol(metin).map((parca, i) => parca === 'DENEME'
      ? <span key={i} className="inline-block px-1.5 rounded border border-[#F26B6F] text-[#F26B6F] text-[11px] font-semibold leading-[1.4] align-[1px]">DENEME</span>
      : satirIci(parca).map((p, n) => {
        if (p.tur === 'kalin') return <strong key={`${i}-${n}`} className="font-semibold">{p.metin}</strong>;
        if (p.tur === 'kod') return <code key={`${i}-${n}`} className="px-1 rounded bg-[#E4DCCD] dark:bg-[#0B132B] text-[0.92em]">{p.metin}</code>;
        return <React.Fragment key={`${i}-${n}`}>{p.metin}</React.Fragment>;
      }))}
  </>
);

const Kararlar: React.FC<{ a: OkunanAdim }> = ({ a }) => {
  const k = a.kararlar;
  if (!k) return <p className={`text-[12px] ${IKINCIL}`}>Soru dosyası okunamadı ({a.sorular}).</p>;
  const bos = !k.cevaplar?.length && !k.islenenler.length;
  return (
    <div className={`space-y-2 text-[13px] leading-relaxed ${YAZI}`}>
      {k.cevaplar && k.cevaplar.length > 0 && (
        <div className="space-y-1">
          <p className={`text-[12px] font-semibold ${IKINCIL}`}>Kemal'in cevapları{k.cevapTarihi ? ` · ${k.cevapTarihi}` : ''}</p>
          <ol className="list-decimal pl-5 space-y-1">{k.cevaplar.map(c => <li key={c}><Satir metin={c} /></li>)}</ol>
        </div>
      )}
      {k.islenenler.length > 0 && (
        <div className="space-y-1">
          <p className={`text-[12px] font-semibold ${IKINCIL}`}>Bu çizime işlenen kararlar</p>
          <ul className="list-disc pl-5 space-y-1">{k.islenenler.map(c => <li key={c}><Satir metin={c.replace(/^İşlenen[^:]*:\s*/, '')} /></li>)}</ul>
        </div>
      )}
      {k.denemeler.length > 0 && (
        <p className={`text-[12px] ${IKINCIL}`}><Satir metin={`Onaylanmamış ölçüler (DENEME): ${k.denemeler.join(' ')}`} /></p>
      )}
      {bos && <p className={`text-[12px] ${IKINCIL}`}>Bu adımın dosyasında "Kemal'in cevapları" bölümü yok.</p>}
    </div>
  );
};

type Acik = { adres: string; baslik: string };

export const DirlikStadiBolumu: React.FC<{
  baslik: string;
  /** Vikide madde varsa açar; yoksa düğme pasif */
  onVikideAc?: () => void;
  /** Oyunlar → Mini Golf Duzada → Planlar ve çizimler; oyun yoksa verilmez */
  onMinigolfPlanlari?: () => void;
  /** Modelin karar düğmeleri (bina kütüphanesinin öbür kartlarındaki gibi) */
  karar?: React.ReactNode;
}> = ({ baslik, onVikideAc, onMinigolfPlanlari, karar }) => {
  const [planlar, setPlanlar] = useState<OkunanPlanlar | undefined>(undefined);
  const [tur, setTur] = useState(0);
  const [eskiAcik, setEskiAcik] = useState(false);
  const [modelBuyuk, setModelBuyuk] = useState(false);
  const [acik, setAcik] = useState<Acik | null>(null);

  useEffect(() => {
    let iptal = false;
    setPlanlar(undefined);
    void planlariOku().then(p => { if (!iptal) setPlanlar(p); });
    return () => { iptal = true; };
  }, [tur]);

  useEffect(() => {
    if (!acik && !modelBuyuk) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAcik(null); setModelBuyuk(false); } };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, modelBuyuk]);

  const onizleme = (sinif: string, buyuk?: boolean) => (
    <Suspense fallback={<div className={`${sinif} flex items-center justify-center text-[12px] ${IKINCIL}`}>Model yükleniyor…</div>}>
      <ModelOnizleme dosya={DIRLIK_MODELI} baslik={baslik} buyuk={buyuk} className={sinif} />
    </Suspense>
  );

  return (
    <div className="space-y-4" id="dirlik-stadi-bolumu">
      <div className={`${KART} p-3 space-y-2.5`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`flex-1 min-w-0 text-[14px] font-semibold ${YAZI}`}>Kompleks · 3B <Rozet renk="dikkat">taslak</Rozet></p>
          <button type="button" onClick={onVikideAc} disabled={!onVikideAc} className={DUGME_BOS}
            title={onVikideAc ? 'Vikideki maddeyi aç' : 'Vikide bu madde bulunamadı'}>
            <BookOpen className="w-3.5 h-3.5" /> Vikide aç
          </button>
          <button type="button" onClick={() => setModelBuyuk(true)} className={DUGME_BOS}><Maximize2 className="w-3.5 h-3.5" /> Büyüt</button>
        </div>
        {onizleme('w-full aspect-[16/9] lg:aspect-[21/9] rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] overflow-hidden')}
        <p className={`text-[12px] ${IKINCIL}`}>
          Saha, iki tribün, taş duvar, ışık direkleri ve köşedeki kulüp binası tek modelde. Parmakla çevir, iki parmakla yaklaş.
        </p>
        {karar}
      </div>

      <div className={`${KART} p-3 flex flex-wrap items-center gap-2`}>
        <Flag className="w-4 h-4 text-[#F26B6F] shrink-0" />
        <p className={`flex-1 min-w-[12rem] text-[13px] ${YAZI}`}>
          Minigolfün ilk turu bu statta. Delik planları minigolfün galerisinde.
        </p>
        <button type="button" onClick={onMinigolfPlanlari} disabled={!onMinigolfPlanlari} className={DUGME_LAC}
          title={onMinigolfPlanlari ? 'Oyunlar → Mini Golf Duzada → Planlar ve çizimler' : 'Oyunlar listesinde minigolf oyunu yok'}>
          Planlar ve çizimler
        </button>
        <a href={depoSayfasi(MINIGOLF_DEPOSU, GALERI_YOLU)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BolumBasligi baslik="Adım adım planlar" sayi={PLAN_ADIMLARI.length} renk="lacivert" className="flex-1" />
        <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        <a href={`https://github.com/${AJANS_DEPOSU}/tree/HEAD/${PLAN_KLASORU}`} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Ajansta aç</a>
      </div>
      <p className={`text-[12px] ${IKINCIL}`}>
        Ajansın çizimleri; deposundan her açılışta okunur, KKM'ye kopyalanmaz. Kemal'in kararları her adımın soru dosyasından olduğu gibi gelir. Kanon değil; ölçülerin bir kısmı DENEME.
      </p>

      {planlar === undefined && <p className={`text-[13px] ${IKINCIL}`}>Okunuyor…</p>}
      {planlar?.hata && <p className={`${KART} px-4 py-3 text-[13px] ${IKINCIL}`}>{HATA_YAZISI[planlar.hata]}</p>}

      {planlar && !planlar.hata && (
        <div className="grid gap-3 lg:grid-cols-3">
          {planlar.adimlar.map(a => {
            const ad = `Adım ${a.no}${a.kararlar?.konu ? ` · ${a.kararlar.konu}` : ''}`;
            return (
              <section key={a.no} className={`${KART} overflow-hidden flex flex-col`}>
                {a.adres
                  ? <button type="button" onClick={() => setAcik({ adres: a.adres!, baslik: ad })} className="block w-full bg-white cursor-zoom-in" aria-label={`${ad} çizimini büyüt`}>
                    <img src={a.adres} alt={ad} className="w-full h-auto aspect-[4/3] object-contain" />
                  </button>
                  : <div className={`aspect-[4/3] flex items-center justify-center text-[12px] ${IKINCIL} bg-[#F3EFE8] dark:bg-[#0B132B]`}>Çizim okunamadı</div>}
                <div className="p-3 space-y-2 border-t border-[#E4DCCD] dark:border-[#2C3C72]">
                  <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${YAZI}`}><span className="flex-1 min-w-0 first-letter:uppercase">{ad}</span><Rozet renk="dikkat">taslak</Rozet></p>
                  <Kararlar a={a} />
                </div>
              </section>
            );
          })}
        </div>
      )}

      {planlar && planlar.eskiler.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setEskiAcik(e => !e)} className="w-full flex items-center gap-1.5 text-left cursor-pointer">
            {eskiAcik ? <ChevronDown className={`w-4 h-4 ${IKINCIL}`} /> : <ChevronRight className={`w-4 h-4 ${IKINCIL}`} />}
            <BolumBasligi baslik="Eski sürümler" sayi={planlar.eskiler.length} renk="bekliyor" className="flex-1" />
          </button>
          {eskiAcik && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {planlar.eskiler.map(e => (
                <button key={e.yol} type="button" disabled={!e.adres} onClick={() => e.adres && setAcik({ adres: e.adres, baslik: e.ad })}
                  className={`${KART} p-1.5 text-left space-y-1 cursor-zoom-in`}>
                  {e.adres
                    ? <img src={e.adres} alt={e.ad} loading="lazy" className="w-full aspect-[4/3] object-contain rounded-lg bg-white" />
                    : <span className={`block aspect-[4/3] text-[12px] ${IKINCIL}`}>okunamadı</span>}
                  <span className={`block text-[11px] truncate ${IKINCIL}`}>{e.ad}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {acik && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col p-2 sm:p-4 gap-2" role="dialog" aria-modal="true" aria-label={acik.baslik}>
          <div className="flex items-center gap-2 text-[#F3EFE8]">
            <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{acik.baslik}</span>
            <Rozet renk="dikkat">taslak</Rozet>
            <button type="button" onClick={() => setAcik(null)} aria-label="Kapat" className="w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center" onClick={() => setAcik(null)}>
            <img src={acik.adres} alt={acik.baslik} className="max-w-full max-h-full object-contain rounded-lg bg-white" />
          </div>
        </div>
      )}

      {modelBuyuk && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setModelBuyuk(false)}>
          <div className={`${KART} w-full max-w-5xl p-3 space-y-2`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <p className={`flex-1 min-w-0 text-[14px] font-semibold ${YAZI}`}>{baslik} <span className={`font-normal ${IKINCIL}`}>· taslak</span></p>
              <button type="button" onClick={() => setModelBuyuk(false)} aria-label="Kapat" className={`w-11 h-11 flex items-center justify-center ${IKINCIL} cursor-pointer`}><X className="w-4 h-4" /></button>
            </div>
            {onizleme('w-full h-[70vh] rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] overflow-hidden', true)}
          </div>
        </div>
      )}
    </div>
  );
};

export default DirlikStadiBolumu;
