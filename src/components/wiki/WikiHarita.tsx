import React, { useMemo } from 'react';
import { Compass } from 'lucide-react';
import type { Item } from '../../types';
import { VIKI_YAPILARI, type VikiYapisi } from '../../data/vikiYapilari';
import { MAHALLE_ADI } from '../../lib/haritaMaddesi';

/**
 * Maddenin harita karşılığı (W3).
 *
 * Bir mekân sayfasında "nerede" sorusunun cevabı künyede değil haritada
 * duruyordu; okuyan kişi iki sekme arasında gidip geliyordu. Bu kart, madde
 * ile haritadaki yapı arasındaki bağı sayfanın içinde gösteriyor.
 *
 * Veri haritadan OKUNUYOR, maddeye kopyalanmıyor: yapı taşınınca ya da adı
 * değişince burası kendiliğinden doğru kalır.
 *
 * 23 Kasım (tek harita 11. adım, Kemal): tek haritadan okunur
 * (`vikiYapilari.ts`: vikide maddesi olan yapıların kısa listesi,
 * gen/kompakt_viki_yapilar.py üretir). Mahalle, aynı mahalledeki yapılar ve
 * haritadaki adı; kat, yükseklik ve rakım satırları kalktı. Eski haritanın
 * verisi hiç inmez.
 */

interface HaritaBilgisi {
  binaId: string;
  ad: string;
  mahalleAdi: string | null;
  /** Aynı mahalledeki, maddesi olan diğer yapılar */
  komsular: Array<{ wikiId: string; ad: string }>;
}

function bilgiKur(yapi: VikiYapisi, hepsi: VikiYapisi[]): HaritaBilgisi {
  const mahalleId = yapi.mahalle;
  const komsular = hepsi
    .filter(q => mahalleId && q.mahalle === mahalleId && q.id !== yapi.id && q.vikiId !== yapi.vikiId && q.ad)
    .map(q => ({ wikiId: q.vikiId, ad: q.ad }))
    // Aynı maddeye bağlı birden çok yapı bir kez görünsün
    .filter((k, i, h) => h.findIndex(x => x.wikiId === k.wikiId) === i)
    .sort((x, y) => x.ad.localeCompare(y.ad, 'tr'))
    .slice(0, 8);
  return {
    binaId: yapi.id,
    ad: yapi.ad,
    mahalleAdi: mahalleId ? MAHALLE_ADI[mahalleId] ?? null : null,
    komsular
  };
}

/**
 * Maddenin tek haritadaki yapısı: yapının maddesi bu madde, ya da madde
 * yapıya bağlı (`haritaBinaId`, Eksikler'deki "Kayda bağla" ile `haritaWikiId`).
 */
function haritaBilgisi(item: Item): HaritaBilgisi | null {
  const binaId = item.metadata?.haritaBinaId;
  const bagli = item.metadata?.haritaWikiId;
  const yapi = VIKI_YAPILARI.find(y => y.vikiId === item.id)
    || (binaId ? VIKI_YAPILARI.find(y => y.id === binaId) : undefined)
    || (bagli ? VIKI_YAPILARI.find(y => y.vikiId === bagli) : undefined);
  return yapi ? bilgiKur(yapi, VIKI_YAPILARI) : null;
}

/** Bu maddenin haritada bir karşılığı var mı — yan sütunu açmaya değer mi */
export function haritaKarsiligiVar(item: Item): boolean {
  return haritaBilgisi(item) !== null;
}

interface WikiHaritaProps {
  item: Item;
  onNavigate: (id: string) => void;
  /** Harita sekmesine geçiş — verilmezse düğme çıkmaz */
  onHaritayaGit?: (binaId: string) => void;
}

export const WikiHarita: React.FC<WikiHaritaProps> = ({
  item, onNavigate, onHaritayaGit
}) => {
  const bilgi = useMemo(() => haritaBilgisi(item), [item]);
  if (!bilgi) return null;

  const satirlar: Array<[string, string]> = [];
  if (bilgi.mahalleAdi) satirlar.push(['Mahalle', `${bilgi.mahalleAdi} Mahallesi`]);
  // Haritadaki ad maddeninkinden farklıysa bunu gizlemek yerine göster:
  // ikisinden biri eskimiş demektir.
  if (bilgi.ad && bilgi.ad !== item.title) {
    satirlar.push(['Haritadaki adı', bilgi.ad]);
  }

  return (
    <div className="mt-4 border border-bej/50 dark:border-lacivert-600/50 rounded-lg overflow-hidden bg-krem-acik/70 dark:bg-lacivert-800/40 archive-shadow">
      <h2 className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 border-b border-bej/40 dark:border-lacivert-600/40 bg-bej/12 dark:bg-lacivert-600/25 flex items-center gap-1.5">
        <Compass size={12} /> Haritada
      </h2>

      {satirlar.length > 0 && (
        <dl className="divide-y divide-bej/30 dark:divide-lacivert-600/30">
          {satirlar.map(([etiket, deger]) => (
            <div key={etiket} className="px-4 py-2.5">
              <dt className="text-[10px] font-mono uppercase tracking-wide text-gri dark:text-bej/85 mb-0.5">
                {etiket}
              </dt>
              <dd className="text-[13px] text-lacivert dark:text-krem/90 leading-snug">
                {deger}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {bilgi.komsular.length > 0 && (
        <div className="px-4 py-3 border-t border-bej/40 dark:border-lacivert-600/40">
          <p className="text-[10px] font-mono uppercase tracking-wide text-gri dark:text-bej/85 mb-1.5">
            Aynı mahallede
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {bilgi.komsular.map(k => (
              <li key={k.wikiId}>
                <button
                  type="button"
                  onClick={() => onNavigate(k.wikiId)}
                  className="text-[12px] px-2 py-0.5 rounded border border-bej/50 dark:border-lacivert-600/50 text-lacivert dark:text-krem hover:border-lacivert/50 dark:hover:border-bej/50 hover:bg-lacivert/5 dark:hover:bg-bej/10 transition-colors"
                >
                  {k.ad}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onHaritayaGit && (
        <button
          type="button"
          onClick={() => onHaritayaGit(bilgi.binaId)}
          className="w-full px-4 py-2.5 border-t border-bej/40 dark:border-lacivert-600/40 text-[11px] font-mono text-gri dark:text-bej/85 hover:text-lacivert dark:hover:text-krem hover:bg-bej/12 dark:hover:bg-lacivert-600/25 transition-colors cursor-pointer text-left"
        >
          Haritada göster →
        </button>
      )}
    </div>
  );
};
