import React from 'react';
import { ExternalLink, FileText, Palette } from 'lucide-react';
import { KisaListe } from '../kabuk/KisaListe';
import { ajansDosyaAdresi, type Dizi } from '../../lib/diziler';
import { DUGME_BOS, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * İçerik → Video → dizi kartı (6 Kasım, Kemal: "Video sekmesinde dizi kartı").
 * Ajansın `kkm/diziler.json`'daki bir dizisi: ad, taslak etiketi, özet, durum,
 * bölümler, karakterler, Canva ve senaryo bağlantısı. Yalnız gösterir.
 */
export const DiziKarti: React.FC<{ dizi: Dizi; dal: string }> = ({ dizi, dal }) => {
  return (
    <section className={`${KART} p-4 space-y-3`}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[14px] font-semibold ${YAZI}`}>{dizi.ad}</p>
          {dizi.taslak && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#F26B6F] text-[#F26B6F]">Taslak</span>
          )}
        </div>
        {dizi.bicim && <p className={`text-[11px] ${IKINCIL}`}>{dizi.bicim}</p>}
      </div>

      {dizi.ozet && <p className={`text-[12px] leading-relaxed ${YAZI}`}>{dizi.ozet}</p>}
      {dizi.durum && <p className={`text-[12px] ${IKINCIL}`}><span className="font-semibold">Durum:</span> {dizi.durum}</p>}

      {dizi.sezonlar.map(s => (
        <div key={s.no} className="space-y-1.5">
          <div className={ETIKET}>{s.no}. sezon{s.ad ? ` · ${s.ad}` : ''} · {s.bolumler.length} bölüm</div>
          <KisaListe as="ol" className="space-y-1">
            {s.bolumler.map(b => (
              <li key={b.no} className={`text-[12px] ${YAZI} flex gap-2`}>
                <span className={`shrink-0 w-5 text-right font-mono ${IKINCIL}`}>{b.no}</span>
                <span className="min-w-0">
                  {b.baslik}
                  {(b.mevsim || b.durum) && (
                    <span className={`block text-[11px] ${IKINCIL}`}>{[b.mevsim, b.durum].filter(Boolean).join(' · ')}</span>
                  )}
                </span>
              </li>
            ))}
          </KisaListe>
        </div>
      ))}

      {dizi.karakterler.length > 0 && (
        <div className="space-y-1.5">
          <div className={ETIKET}>Karakterler</div>
          <KisaListe className="space-y-1">
            {dizi.karakterler.map(k => (
              <li key={k.ad} className={`text-[12px] ${YAZI}`}>
                {k.ad}{k.not ? <span className={IKINCIL}> · {k.not}</span> : null}
              </li>
            ))}
          </KisaListe>
        </div>
      )}

      {(dizi.canva || dizi.senaryo) && (
        <div className="flex flex-wrap gap-2">
          {dizi.canva && (
            <a href={dizi.canva} target="_blank" rel="noreferrer" className={DUGME_BOS}>
              <Palette className="w-3.5 h-3.5" /> Canva <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {dizi.senaryo && (
            <a href={ajansDosyaAdresi(dizi.senaryo, dal)} target="_blank" rel="noreferrer" className={DUGME_BOS}>
              <FileText className="w-3.5 h-3.5" /> Senaryo <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </section>
  );
};
