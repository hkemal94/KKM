import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { depoSayfasi } from '../../lib/depoBelgesi';
import { grupla, type Asset } from '../../lib/oyunAssetleri';
import { EKRAN_KLASORU, ekranGoruntuleriniOku, taslaklariOku, tarihYazisi, type Cihaz, type EkranGoruntusu } from '../../lib/ekranGoruntuleri';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyunun ekran görüntüleri (3 Kasım, `lib/ekranGoruntuleri.ts`). Oyunun
 * deposundan her açılışta okunur; yalnız gösterir, hiçbir yere yazmaz.
 * Altta eski taslak görseller "İlham / taslak" diye ayrı durur.
 */

type Suzgec = 'hepsi' | Cihaz;
const SUZGECLER: Array<{ id: Suzgec; ad: string }> = [
  { id: 'hepsi', ad: 'Hepsi' }, { id: 'telefon', ad: 'Telefon' }, { id: 'masaustu', ad: 'Masaüstü' },
];

interface Buyuk { adres: string; baslik: string; alt: string }

export const EkranGoruntuleri: React.FC<{ depo: string }> = ({ depo }) => {
  const [liste, setListe] = useState<EkranGoruntusu[] | null>(null);
  const [taslaklar, setTaslaklar] = useState<Asset[] | null>(null);
  const [taslakAcik, setTaslakAcik] = useState(false);
  const [suzgec, setSuzgec] = useState<Suzgec>('hepsi');
  const [buyuk, setBuyuk] = useState<Buyuk | null>(null);
  const [tur, setTur] = useState(0);

  useEffect(() => {
    let iptal = false;
    setListe(null);
    setTaslaklar(null);
    void ekranGoruntuleriniOku(depo).then(l => { if (!iptal) setListe(l); });
    void taslaklariOku(depo).then(l => { if (!iptal) setTaslaklar(l); });
    return () => { iptal = true; };
  }, [depo, tur]);

  const gorunen = useMemo(() => (liste || []).filter(g => suzgec === 'hepsi' || g.tur === suzgec), [liste, suzgec]);
  const sayilar = useMemo(() => ({
    hepsi: liste?.length || 0,
    telefon: liste?.filter(g => g.tur === 'telefon').length || 0,
    masaustu: liste?.filter(g => g.tur === 'masaustu').length || 0,
    diger: 0,
  }), [liste]);
  const taslakGruplari = useMemo(() => grupla(taslaklar || []), [taslaklar]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[13px] ${IKINCIL} min-w-0 break-all`}>
          Depodan okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span> · {EKRAN_KLASORU}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        <a href={depoSayfasi(depo)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`text-[17px] font-bold ${YAZI}`}>Ekran görüntüleri</h2>
          <span className="flex-1" />
          {liste && liste.length > 0 && SUZGECLER.filter(s => s.id === 'hepsi' || sayilar[s.id] > 0).map(s => (
            <button key={s.id} type="button" onClick={() => setSuzgec(s.id)} className={suzgec === s.id ? DUGME_LAC : DUGME_BOS}>
              {s.ad} · {sayilar[s.id]}
            </button>
          ))}
        </div>
        {liste === null && <p className={`text-[14px] ${IKINCIL}`}>Okunuyor…</p>}
        {liste && liste.length === 0 && <p className={`${KART} px-4 py-3 text-[14px] ${IKINCIL}`}>Henüz ekran görüntüsü yok.</p>}
        {gorunen.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {gorunen.map(g => (
              <button key={g.dosya} type="button" title={g.dosya}
                onClick={() => setBuyuk({ adres: g.adres, baslik: g.baslik || g.dosya, alt: [tarihYazisi(g.tarih), g.cihaz].filter(Boolean).join(' · ') })}
                className={`${KART} p-2 flex flex-col gap-1.5 text-left cursor-zoom-in hover:ring-2 hover:ring-[#F26B6F]/40`}>
                <span className={`${g.tur === 'telefon' ? 'aspect-[3/4]' : 'aspect-video'} w-full flex items-center justify-center overflow-hidden rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B]`}>
                  <img src={g.adres} alt={g.baslik} loading="lazy" className="w-full h-full object-contain" />
                </span>
                <span className={`text-[13px] font-semibold leading-snug ${YAZI}`}>{g.baslik || g.dosya}</span>
                <span className={`text-[11px] ${IKINCIL}`}>{[tarihYazisi(g.tarih), g.cihaz].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {taslaklar && taslaklar.length > 0 && (
        <section className="space-y-3">
          <button type="button" onClick={() => setTaslakAcik(a => !a)} className={`flex items-center gap-1.5 text-[17px] font-bold ${YAZI} cursor-pointer`}>
            {taslakAcik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            İlham / taslak <span className={`text-[13px] font-normal ${IKINCIL}`}>· {taslaklar.length} görsel</span>
          </button>
          <p className={`text-[12px] ${IKINCIL}`}>Oyunun deposundaki eski taslak ve deneme görselleri; gerçek ekran görüntüsü değil.</p>
          {taslakAcik && taslakGruplari.map(g => (
            <div key={g.grup} className="space-y-2">
              <p className={`text-[13px] font-semibold ${YAZI}`}>{g.grup} <span className={`font-normal ${IKINCIL}`}>· {g.assetler.length}</span></p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {g.assetler.map(a => (
                  <button key={a.yol} type="button" title={a.yol} onClick={() => setBuyuk({ adres: a.adres, baslik: a.ad, alt: `İlham / taslak · ${a.yol}` })}
                    className={`${KART} p-2 flex flex-col gap-1 text-left cursor-zoom-in hover:ring-2 hover:ring-[#F26B6F]/40`}>
                    <span className="aspect-square w-full flex items-center justify-center overflow-hidden rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B]">
                      <img src={a.adres} alt={a.ad} loading="lazy" className="w-full h-full object-contain" />
                    </span>
                    <span className={`text-[11px] truncate ${IKINCIL}`}>{a.ad}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {buyuk && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-3 cursor-zoom-out" onClick={() => setBuyuk(null)}>
          <button type="button" onClick={() => setBuyuk(null)} aria-label="Kapat" className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white cursor-pointer"><X className="w-5 h-5" /></button>
          <img src={buyuk.adres} alt={buyuk.baslik} className="max-w-full max-h-[80vh] rounded-xl object-contain" />
          <div className="text-center text-[#F3EFE8]">
            <div className="text-[14px] font-semibold">{buyuk.baslik}</div>
            {buyuk.alt && <div className="text-[12px] text-[#C9D0E3] break-all">{buyuk.alt}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default EkranGoruntuleri;
