import React, { useMemo } from 'react';
import type { Item } from '../../types';
import { maddeGorseli } from '../../lib/maddeGorseli';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { ETIKET, IKINCIL, KART, YAZI, neZaman } from './stil';

/**
 * Düzada kartı (Paket 4): haritanın küçük resmi ve son dokunulan maddeler.
 * Harita resmine basınca harita açılır, maddeye basınca madde.
 *
 * Resim (public/harita-kucuk.webp) yeni adanın 3B görüntüsü, evleriyle
 * (30 Eylül). Harita çok değişirse önizlemeden yeniden çekilir.
 */

const SAYILMAZ = new Set(['map_settings', 'map_pin', 'channel', 'aday']);

interface Props {
  items: Item[];
  onHarita: () => void;
  onMadde: (item: Item) => void;
}

export const DuzadaKarti: React.FC<Props> = ({ items, onHarita, onMadde }) => {
  const gorselSurumu = useGorselSurumu(); // galeri görselleri çözülünce yenilenir (21 Ekim)
  const son = useMemo(() => [...items]
    .filter(i => !i.archived && !i.isProposal && !SAYILMAZ.has(i.type) && !(i.tags || []).includes('gunluk-not') && i.type !== 'fikir')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3), [items]);

  return (
    <section className={`${KART} overflow-hidden`}>
      <button type="button" onClick={onHarita} className="block w-full h-36 bg-[#1C4E8C] cursor-pointer" title="Haritayı aç">
        <img src="/harita-kucuk.webp" alt="Düzada haritası" className="w-full h-full object-cover" loading="lazy" />
      </button>
      <div className="p-4">
        <div className={ETIKET}>Düzada · 39,60 K · 25,85 D</div>
        <ul className="mt-2 space-y-1">
          {son.map(i => {
            const g = maddeGorseli(i, items);
            return (
              <li key={i.id}>
                <button type="button" onClick={() => onMadde(i)} className="w-full flex items-center gap-2.5 py-1 text-left cursor-pointer group">
                  <span className="w-7 h-7 rounded-md bg-[#F3EFE8] dark:bg-[#17345A] shrink-0 overflow-hidden flex items-center justify-center">
                    {g ? <img src={g} alt="" className="w-full h-full object-contain" /> : <span className="text-[10px] font-bold text-[#6A5E4C]">{i.title.slice(0, 1)}</span>}
                  </span>
                  <span className={`flex-1 min-w-0 truncate text-[13px] ${YAZI} group-hover:underline`}>{i.title}</span>
                  <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{(TYPE_LABELS[i.type] || i.area).toLocaleLowerCase('tr')} · {neZaman(i.updatedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default DuzadaKarti;
