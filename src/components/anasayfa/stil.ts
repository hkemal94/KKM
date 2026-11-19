/**
 * Ana sayfa kartlarının ortak sınıfları (Paket 4). Renkler markanınki:
 * lacivert #0E1C4F, kiremit #F26B6F, krem #F3EFE8, kâğıt #FAF8F5.
 */
export const KART = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A]';
export const ETIKET = 'text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#6A5E4C] dark:text-[#A6B0C9]';
export const YAZI = 'text-[#0E1C4F] dark:text-[#F3EFE8]';
export const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
export const DUGME_LAC = 'min-h-11 lg:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:opacity-90 disabled:opacity-40 cursor-pointer';
export const DUGME_BOS = 'min-h-11 lg:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] disabled:opacity-40 cursor-pointer';
/** Vurgulu dolu düğme (kiremit), ör. oyun sayfasındaki "Oyna" */
export const DUGME_VURGU = 'min-h-11 lg:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F26B6F] text-[#0E1C4F] hover:opacity-90 disabled:opacity-40 cursor-pointer';

/** "az önce", "3 saat önce", "dün", "5 gün önce" */
export function neZaman(ms: number): string {
  const dk = Math.floor((Date.now() - ms) / 60_000);
  if (dk < 2) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} saat önce`;
  const gun = Math.floor(sa / 24);
  return gun === 1 ? 'dün' : `${gun} gün önce`;
}
