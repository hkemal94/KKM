import React from 'react';
import { aileBasHarfi } from '../../lib/aileAgaci';

/**
 * Aile monogramı (24 Kasım, Kemal: "yalnız monogram, 5 Kasım Örnek A gibi").
 * Daire çerçeve, krem zemin, lacivert harf (Poppins), altında küçük kiremit çizgi.
 * Yer tutucudur: ailenin görseli yokken görünür (`aileGorseliVar`). Kodla çizilir;
 * görsel dosyası yok, kayda yazılmaz.
 */

const LACIVERT = '#0E1C4F';
const KREM = '#F3EFE8';
const KIREMIT = '#F26B6F';

/** 40 birimlik karede monogramın parçaları (SVG içine `<g>` olarak da konur) */
export const MonogramIcerik: React.FC<{ ad: string }> = ({ ad }) => {
  const harf = aileBasHarfi(ad);
  // Noktalı ve kancalı büyük harfler (Ö, Ü, İ, Ç, Ş) dairede biraz aşağı oturur
  const ustu = /[ÖÜİ]/.test(harf), alti = /[ÇŞ]/.test(harf);
  return (
    <>
      <circle cx={20} cy={20} r={18.6} fill={KREM} stroke={LACIVERT} strokeWidth={1.6} />
      <circle cx={20} cy={20} r={15.6} fill="none" stroke={LACIVERT} strokeWidth={0.5} strokeOpacity={0.45} />
      <text x={20} y={ustu ? 25.4 : alti ? 23.2 : 24.6} textAnchor="middle" fontFamily="Poppins, ui-sans-serif, system-ui, sans-serif"
        fontWeight={600} fontSize={ustu ? 15 : 16.5} fill={LACIVERT}>{harf}</text>
      <line x1={16} x2={24} y1={alti ? 31.6 : 30.2} y2={alti ? 31.6 : 30.2} stroke={KIREMIT} strokeWidth={1.4} strokeLinecap="round" />
    </>
  );
};

/** Başlığın yanındaki rozet */
export const AileMonogrami: React.FC<{ ad: string; boyut?: number; className?: string }> = ({ ad, boyut = 36, className }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 40 40" role="img" aria-label={`${ad} monogramı (yer tutucu)`} className={className}>
    <title>{`${ad}: monogram (ailenin görseli gelene kadar yer tutucu)`}</title>
    <MonogramIcerik ad={ad} />
  </svg>
);
