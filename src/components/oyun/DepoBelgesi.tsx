import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { belgeyiOku, depoSayfasi, gorselAdresi, markdownuAyir, satirIci, type Blok } from '../../lib/depoBelgesi';
import { DUGME_BOS, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyunun deposundaki tasarım belgesi (14 Ekim, `lib/depoBelgesi.ts`).
 * Her açılışta depodan okunur; yalnız gösterir, hiçbir yere yazmaz.
 */

const Satir: React.FC<{ metin: string }> = ({ metin }) => (
  <>
    {satirIci(metin).map((p, n) => {
      if (p.tur === 'kalin') return <strong key={n} className="font-semibold">{p.metin}</strong>;
      if (p.tur === 'egik') return <em key={n}>{p.metin}</em>;
      if (p.tur === 'cizili') return <s key={n} className="opacity-60">{p.metin}</s>;
      if (p.tur === 'kod') return <code key={n} className="px-1 rounded bg-[#E4DCCD] dark:bg-[#0B132B] text-[0.92em]">{p.metin}</code>;
      if (p.tur === 'baglanti') {
        const dis = /^https?:\/\//.test(p.adres);
        return dis
          ? <a key={n} href={p.adres} target="_blank" rel="noreferrer" className="underline decoration-[#F26B6F] underline-offset-2">{p.metin}</a>
          : <span key={n} className="underline decoration-dotted underline-offset-2">{p.metin}</span>;
      }
      return <React.Fragment key={n}>{p.metin}</React.Fragment>;
    })}
  </>
);

export const DepoBelgesi: React.FC<{ depo: string }> = ({ depo }) => {
  const [durum, setDurum] = useState<{ yol: string; metin: string } | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [tur, setTur] = useState(0);
  const [buyuk, setBuyuk] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setDurum('yukleniyor');
    belgeyiOku(depo)
      .then(b => { if (!iptal) setDurum(b); })
      .catch(e => { if (!iptal) setDurum({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [depo, tur]);

  const bloklar = useMemo<Blok[]>(() => (typeof durum === 'object' && 'metin' in durum ? markdownuAyir(durum.metin) : []), [durum]);
  const icindekiler = bloklar.filter((b): b is Extract<Blok, { tur: 'baslik' }> => b.tur === 'baslik' && b.seviye === 2);
  const yol = typeof durum === 'object' && 'yol' in durum ? durum.yol : undefined;

  const ust = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-[13px] ${IKINCIL} min-w-0 break-all`}>
        Depodan okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span>{yol ? ` · ${yol}` : ''}
      </span>
      <span className="flex-1" />
      <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      <a href={depoSayfasi(depo, yol)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
    </div>
  );

  if (durum === 'yukleniyor') return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Belge okunuyor…</p></div>;
  if ('hata' in durum) return (
    <div className="space-y-4">
      {ust}
      <p className={`${KART} px-4 py-3 text-[14px] ${YAZI}`}>
        Belge okunamadı ({durum.hata}). Deponun adı doğru mu, depo herkese açık mı, içinde <code>docs/tasarim-belgesi.md</code> ya da <code>README.md</code> var mı? Künye ve konsept sekmesindeki "Oyunun deposu" kutusundan düzeltebilirsin.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {ust}
      {icindekiler.length > 1 && (
        <nav className="flex flex-wrap gap-1.5">
          {icindekiler.map(b => (
            <a key={b.kimlik} href={`#${b.kimlik}`}
              onClick={e => { e.preventDefault(); document.getElementById(b.kimlik)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className={`px-3 py-1.5 rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] ${YAZI} hover:border-[#F26B6F]`}>
              {b.metin}
            </a>
          ))}
        </nav>
      )}
      <article className={`${KART} px-4 py-5 sm:px-7 sm:py-7 text-[15px] leading-relaxed ${YAZI} space-y-3 min-w-0`}>
        {bloklar.map((b, n) => {
          switch (b.tur) {
            case 'baslik': {
              const sinif = b.seviye === 1 ? 'text-[24px] font-bold leading-tight'
                : b.seviye === 2 ? 'pt-4 text-[19px] font-bold border-t border-[#E4DCCD] dark:border-[#2C3C72]'
                : 'pt-2 text-[16px] font-semibold';
              return <div key={n} id={b.kimlik} className={`${sinif} scroll-mt-20`}><Satir metin={b.metin} /></div>;
            }
            case 'paragraf': return <p key={n} className="whitespace-pre-line"><Satir metin={b.metin} /></p>;
            case 'liste': {
              const Liste = b.sirali ? 'ol' : 'ul';
              return (
                <Liste key={n} className={`${b.sirali ? 'list-decimal' : 'list-disc'} pl-6 space-y-1.5 marker:text-[#F26B6F]`}>
                  {b.ogeler.map((o, k) => <li key={k}><Satir metin={o} /></li>)}
                </Liste>
              );
            }
            case 'tablo': {
              const basBos = b.baslik.every(h => !h);
              return (
                <div key={n} className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[14px] border-collapse">
                    {!basBos && (
                      <thead>
                        <tr>{b.baslik.map((h, k) => <th key={k} className={`text-left align-bottom px-3 py-2 text-[12px] font-semibold uppercase tracking-wider ${IKINCIL} border-b border-[#CFC5B4] dark:border-[#2C3C72]`}><Satir metin={h} /></th>)}</tr>
                      </thead>
                    )}
                    <tbody>
                      {b.satirlar.map((s, k) => (
                        <tr key={k} className="border-b border-[#E4DCCD] dark:border-[#2C3C72] last:border-0">
                          {s.map((h, j) => <td key={j} className={`align-top px-3 py-2 ${j === 0 ? 'font-semibold whitespace-nowrap' : 'min-w-[16rem]'}`}><Satir metin={h} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            case 'gorsel': {
              const adres = gorselAdresi(depo, yol || '', b.adres);
              return (
                <button key={n} type="button" onClick={() => setBuyuk(adres)} className="block w-full cursor-zoom-in">
                  <img src={adres} alt={b.alt} loading="lazy" className="w-full max-w-3xl rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72]" />
                  {b.alt && <span className={`block mt-1 text-left text-[12px] ${IKINCIL}`}>{b.alt}</span>}
                </button>
              );
            }
            case 'cizgi': return null;
          }
        })}
      </article>
      {buyuk && (
        <button type="button" onClick={() => setBuyuk(null)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" aria-label="Kapat">
          <img src={buyuk} alt="" className="max-w-full max-h-full rounded-xl" />
        </button>
      )}
    </div>
  );
};

export default DepoBelgesi;
