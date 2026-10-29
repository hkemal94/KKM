import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import type { Item } from '../../types';
import { getKunyeFields, getEkBilgiler, getArticleBody } from '../wiki/wikiSchema';
import { KunyeDegeri } from '../wiki/KunyeDegeri';
import { maddeGorseli } from '../../lib/maddeGorseli';
import { useGorselSurumu } from '../../lib/gorselOnbellek';

/**
 * Markalar ekranında bir kurumun (ya da markanın) viki özeti.
 *
 * Kemal (29 Eylül): "Markalar kısmında ilgili kurumların sayfası gelmemiş."
 * Kurum sayfası yalnız marka kitini gösteriyordu; viki için yazılan künye
 * satırları "Marka hikayesi" kutusunda tek paragraf hâlinde, yıldızlarıyla
 * duruyordu. Burada vikideki gibi okunur: görsel, kısa künye, bilgiler ve
 * sayfa metni. Düzenleme vikide yapılır; "Vikide aç" oraya götürür.
 */

interface KurumOzetiProps {
  item: Item;
  /** Galeride bu maddeye bağlı görseli bulmak için */
  items?: Item[];
  onVikideAc: (id: string) => void;
}

export const KurumOzeti: React.FC<KurumOzetiProps> = ({ item, items = [], onVikideAc }) => {
  useGorselSurumu(); // galeri görselleri çözülünce yenilenir (21 Ekim)
  const kunye = useMemo(() => getKunyeFields(item), [item]);
  const ekler = useMemo(() => getEkBilgiler(item), [item]);
  const govde = useMemo(() => getArticleBody(item), [item]);
  const gorsel = maddeGorseli(item, items);
  const bos = !kunye.length && !ekler.length && !govde.length;

  return (
    <div className="bg-white/80 dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] tracking-wider font-bold">
          Viki sayfası
        </h4>
        <button
          type="button"
          onClick={() => onVikideAc(item.id)}
          className="flex items-center gap-1.5 text-[11px] font-mono text-[#F26B6F] hover:underline cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5" /> Vikide aç
        </button>
      </div>

      {bos ? (
        <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">
          Vikide henüz künyesi ya da metni yok.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          {(gorsel || kunye.length > 0) && (
            <div className="space-y-3">
              {gorsel && (
                <div className="rounded-lg bg-[#F3EFE8] p-2">
                  <img src={gorsel} alt={item.title} className="block w-full h-36 object-contain" />
                </div>
              )}
              {kunye.length > 0 && (
                <dl className="space-y-2">
                  {kunye.map(f => (
                    <div key={f.id}>
                      <dt className="text-[9px] font-mono uppercase tracking-wide text-[#6A5E4C] dark:text-[#A6B0C9]">{f.label}</dt>
                      <dd className="text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] leading-snug">
                        <KunyeDegeri value={f.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <div className="min-w-0 space-y-4">
            {ekler.length > 0 && (
              <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5">
                {ekler.map(f => (
                  <div key={f.id} className="min-w-0">
                    <dt className="text-[9px] font-mono uppercase tracking-wide text-[#6A5E4C] dark:text-[#A6B0C9]">{f.label}</dt>
                    <dd className="text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] leading-snug">
                      <KunyeDegeri value={f.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {govde.map((b, i) => (
              <div key={i}>
                {b.heading && (
                  <h5 className="text-[11px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] mb-1">{b.heading}</h5>
                )}
                <p className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8] leading-relaxed whitespace-pre-line line-clamp-6">
                  {b.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default KurumOzeti;
