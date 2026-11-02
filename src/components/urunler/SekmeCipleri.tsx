import React from 'react';

/**
 * Ürünler sayfalarının üstündeki sekme çipleri (2 Kasım, yol haritası 6. adım).
 * İçerideki ekranların kendi başlığı ve rayı olduğu için burada yalnız çip
 * sırası var; telefonda yana kayar.
 */
export function SekmeCipleri<T extends string>({ sekmeler, aktif, onSec, etiket }: {
  sekmeler: Array<{ id: T; ad: string }>;
  aktif: T;
  onSec: (id: T) => void;
  etiket: string;
}) {
  return (
    <div role="tablist" aria-label={etiket} className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto [scrollbar-width:none]">
      {sekmeler.map(s => {
        const on = s.id === aktif;
        return (
          <button
            key={s.id} type="button" role="tab" aria-selected={on} onClick={() => onSec(s.id)}
            className={`shrink-0 min-h-9 px-3 rounded-full text-[12px] font-semibold cursor-pointer border ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F]'}`}
          >
            {s.ad}
          </button>
        );
      })}
    </div>
  );
}
