import React from 'react';
import { ASAMALAR, type AsamaBilgisi, type TakipSatiri } from '../../lib/ajansta';
import { kimdeAdi } from '../../lib/isler';
import { IKINCIL, YAZI, neZaman } from '../anasayfa/stil';

/**
 * Ajana verilen işin aşaması (3 Kasım): Sırada → Kems aldı → Ajanda → Onayına düştü.
 * Geçilen aşamalar lacivert, bulunulan kiremit; süre ya da saat yazılmaz.
 */
export const AsamaSeridi: React.FC<{ durum: AsamaBilgisi }> = ({ durum }) => {
  const sira = ASAMALAR.findIndex(a => a.id === durum.asama);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Aşama">
      {ASAMALAR.map((a, n) => {
        const ad = a.id === 'ajanda' && durum.asama === 'ajanda' && durum.kimde ? kimdeAdi(durum.kimde) : a.ad;
        const renk = n === sira ? 'bg-[#F26B6F] text-white border-transparent'
          : n < sira ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] border-transparent'
          : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9]';
        return (
          <li key={a.id} className="flex items-center gap-1" aria-current={n === sira ? 'step' : undefined}>
            {n > 0 && <span className={`text-[10px] ${IKINCIL}`} aria-hidden>→</span>}
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${renk}`}>{ad}</span>
          </li>
        );
      })}
    </ol>
  );
};

/** Aşamanın altındaki kısa açıklama (yalnız dosyalarda yazanlar) */
export function asamaNotu(s: Pick<TakipSatiri, 'durum' | 'gitti'>): string {
  const { durum } = s;
  if (durum.asama === 'sirada') {
    if (s.gitti === false) return 'Not henüz ajansa gitmedi: Ajans bağlantısı → "Tepsiyi ajansa gönder".';
    return 'Kems sıradaki çalışmasında alacak.';
  }
  if (durum.asama === 'kems') return durum.kimde === 'Kemal' ? 'Kems aldı; senden bir şey bekliyor (Kimde ne var → Senden beklenenler).' : 'Kems aldı; ilgili ajana verecek.';
  if (durum.asama === 'ajanda') return `${kimdeAdi(durum.kimde || '')} üzerinde çalışıyor ya da sırasını bekliyor.`;
  return 'Yeni hâli Onay bekleyenler\'de.';
}

/** Ajansta satırının gövdesi: aşama, not ve bağlı işin son hâli */
export const TakipGovdesi: React.FC<{ s: TakipSatiri; notGizle?: boolean }> = ({ s, notGizle }) => (
  <div className="space-y-1.5">
    <AsamaSeridi durum={s.durum} />
    <p className={`text-[11px] ${IKINCIL}`}>{asamaNotu(s)}</p>
    {s.tur === 'istek' && (s.ekran || s.ajan) && (
      <p className={`text-[11px] ${IKINCIL}`}>{[s.ekran, s.ajan ? kimdeAdi(s.ajan) : ''].filter(Boolean).join(' · ')}</p>
    )}
    {s.tur === 'duzenle' && s.not && !notGizle && <p className={`text-[11px] ${IKINCIL}`}><b className={YAZI}>Notun:</b> {s.not}</p>}
    {s.durum.is?.not && <p className={`text-[11px] whitespace-pre-line ${IKINCIL}`}><b className={YAZI}>Ajansın notu:</b> {s.durum.is.not}</p>}
    {s.durum.is?.guncellendi && <p className={`text-[10px] ${IKINCIL}`}>İş listesi güncellendi {neZaman(Date.parse(s.durum.is.guncellendi))}</p>}
  </div>
);
