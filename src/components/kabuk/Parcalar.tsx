import React from 'react';

/**
 * Ekran iskeletinin ortak parçaları (1 Ekim, Kemal: "yapı değil, iskelet ve
 * renk"). Stitch denemesinden yalnız iskelet alındı; içerik hep Kemal'in
 * kayıtlarından gelir, boş olan boş görünür.
 */

/** Durum renkleri markadan: çam = bitti, bej = bekliyor, kiremit = dikkat */
export const DURUM_RENK = { bitti: '#336659', bekliyor: '#BBA591', dikkat: '#F26B6F', lacivert: '#0E1C4F' } as const;
export type DurumRengi = keyof typeof DURUM_RENK;

/** Bölüm başlığı: solda nokta + etiket, sağda sayı ya da küçük düğme */
export const BolumBasligi: React.FC<{ baslik: React.ReactNode; sayi?: React.ReactNode; renk?: DurumRengi; ek?: React.ReactNode; className?: string }> = ({ baslik, sayi, renk = 'dikkat', ek, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DURUM_RENK[renk] }} />
    <h3 className="flex-1 min-w-0 truncate text-[12px] lg:text-[11px] font-bold uppercase tracking-[0.16em] text-[#6A5E4C] dark:text-[#A6B0C9]">{baslik}</h3>
    {sayi !== undefined && <span className="text-[12px] tabular-nums text-[#6A5E4C] dark:text-[#A6B0C9]">{sayi}</span>}
    {ek}
  </div>
);

/** Küçük durum rozeti */
export const Rozet: React.FC<{ children: React.ReactNode; renk?: DurumRengi }> = ({ children, renk = 'bekliyor' }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[12px] lg:text-[11px] font-semibold whitespace-nowrap"
    style={{ background: `${DURUM_RENK[renk]}22`, color: renk === 'bekliyor' ? '#6A5E4C' : DURUM_RENK[renk] }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: DURUM_RENK[renk] }} />
    {children}
  </span>
);

/** İlerleme halkası (0–100); ortada yüzde yazar */
export const IlerlemeHalkasi: React.FC<{ yuzde: number; boyut?: number; renk?: DurumRengi }> = ({ yuzde, boyut = 56, renk = 'bitti' }) => {
  const y = Math.max(0, Math.min(100, Math.round(yuzde)));
  const r = (boyut - 6) / 2;
  const cevre = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: boyut, height: boyut }}>
      <svg width={boyut} height={boyut} className="-rotate-90">
        <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" strokeWidth={5} className="stroke-[#E4DCCD] dark:stroke-[#2C3C72]" />
        <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" strokeWidth={5} strokeLinecap="round" stroke={DURUM_RENK[renk]} strokeDasharray={cevre} strokeDashoffset={cevre * (1 - y / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-[#0E1C4F] dark:text-[#F3EFE8]">%{y}</span>
    </div>
  );
};

/** Bilgi kuyusu: kart içinde küçük etiket + değer kutusu. Değer yoksa "boş" yazar. */
export const Kuyu: React.FC<{ etiket: string; children?: React.ReactNode }> = ({ etiket, children }) => {
  const bos = children === undefined || children === null || children === '';
  return (
    <div className="rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] px-3 py-2 min-w-0">
      <div className="text-[12px] lg:text-[10px] font-bold uppercase tracking-[0.14em] text-[#6A5E4C] dark:text-[#A6B0C9]">{etiket}</div>
      <div className={`mt-0.5 text-[14px] font-semibold truncate ${bos ? 'text-[#9A8C76] dark:text-[#6F7BA0] font-normal' : 'text-[#0E1C4F] dark:text-[#F3EFE8]'}`}>{bos ? 'boş' : children}</div>
    </div>
  );
};

/** Boş satır: "boş · ekle" (boş alan gizlenmez, boş olduğu görünür) */
export const BosSatir: React.FC<{ yazi?: string; onEkle?: () => void }> = ({ yazi = 'boş', onEkle }) => (
  <div className="flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
    <span>{yazi}</span>
    {onEkle && <button type="button" onClick={onEkle} className="min-h-11 px-1 whitespace-nowrap hover:text-[#F26B6F] cursor-pointer">boş · ekle</button>}
  </div>
);

