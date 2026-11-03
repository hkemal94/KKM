import React, { useMemo } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { Item } from '../../types';
import { KisaListe } from '../kabuk/KisaListe';
import { GorselImg } from '../GorselImg';
import { alanAdi, bagliIlhamlar, ilhamBilgisi, ILHAM_TURU_ADI, pinterestMi } from '../../lib/ilhamlar';

/**
 * Bir markanın ya da viki maddesinin sayfasında "İlhamlar" küçük bölümü
 * (3 Kasım). Ürünler → İlham ve kaynaklar'da bu kayda bağlanan ilham ve
 * kaynaklar burada yalnız okunur; bağlı ilham yoksa hiç görünmez.
 * Değiştirmek İlham ve kaynaklar ekranında.
 */
export const BagliIlhamlar: React.FC<{ items: Item[]; hedefId: string; className?: string }> = ({ items, hedefId, className = '' }) => {
  const liste = useMemo(() => bagliIlhamlar(items, hedefId), [items, hedefId]);
  if (!liste.length) return null;
  return (
    <section className={className}>
      <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#6A5E4C] dark:text-[#A6B0C9]">
        <Sparkles className="w-3 h-3" /> İlhamlar ({liste.length})
      </h2>
      <KisaListe className="space-y-1.5" dugmeClassName="mt-1">
        {liste.map(k => {
          const b = ilhamBilgisi(k);
          return (
            <li key={k.id} className="flex items-center gap-2.5">
              <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] flex items-center justify-center">
                {k.images?.[0]
                  ? <GorselImg src={k.images[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <Sparkles className="w-3.5 h-3.5 text-[#CFC5B4]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-[#0E1C4F] dark:text-[#F3EFE8] truncate">{k.title}</span>
                <span className="flex items-center gap-1.5 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                  {ILHAM_TURU_ADI[b.tur]}
                  {(k.tags || []).length > 0 && <span className="truncate">· {(k.tags || []).join(', ')}</span>}
                  {b.baglanti && pinterestMi(b.baglanti) && <span className="px-1 rounded bg-[#F26B6F] text-white text-[9px] font-semibold">Pinterest</span>}
                </span>
              </span>
              {b.baglanti && (
                <a href={b.baglanti} target="_blank" rel="noopener noreferrer" title={alanAdi(b.baglanti)}
                  className="shrink-0 p-2 rounded-lg text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F]" aria-label="Bağlantıyı aç">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </li>
          );
        })}
      </KisaListe>
    </section>
  );
};

export default BagliIlhamlar;
