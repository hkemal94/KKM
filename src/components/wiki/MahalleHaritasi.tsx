import React, { useEffect, useState } from 'react';
import { Download, Map as HaritaSimgesi } from 'lucide-react';
import type { Item } from '../../types';
import {
  mahalleHaritaAdresi, mahalleHaritaDosyaAdi, mahalleHaritaKimligi, type MahalleGorunusu
} from '../../lib/mahalleHaritasi';

/**
 * Mahalle maddesinde harita bölümü (tek harita 9. adım, 22 Kasım 2026, Kemal: "ikisi de").
 * Açılışta sade şehir planı (A); "Poster görünüşü" posteri (B) açar, "Şehir planı" geri döner.
 * "Resmi indir" o an görüneni indirir. Resim yoksa ya da açılmazsa bölüm görünmez.
 * Yalnız ekranda; kayda bir şey yazılmaz.
 */
export const MahalleHaritasi: React.FC<{ item: Item }> = ({ item }) => {
  const kimlik = mahalleHaritaKimligi(item);
  const [gorunus, setGorunus] = useState<MahalleGorunusu>('A');
  const [yok, setYok] = useState(false);
  useEffect(() => { setGorunus('A'); setYok(false); }, [item.id]);
  if (!kimlik || yok) return null;

  const adres = mahalleHaritaAdresi(kimlik, gorunus);
  const dugme = 'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-[12px] font-semibold cursor-pointer transition-opacity';

  return (
    <section className="mb-7">
      <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-3 tracking-tight flex items-center gap-2">
        <HaritaSimgesi size={18} className="shrink-0" /> Harita
      </h2>
      <a href={adres} target="_blank" rel="noreferrer" title="Resmi tam boyutta aç"
        className="block rounded-lg overflow-hidden border border-bej/50 dark:border-lacivert-600/50 bg-[#F3EFE8]">
        <img
          key={adres}
          src={adres}
          alt={gorunus === 'A' ? `${item.title}: şehir planı` : `${item.title}: poster görünüşü`}
          loading="lazy"
          className="block mx-auto w-auto max-w-full h-auto max-h-[85vh]"
          onError={() => setYok(true)}
        />
      </a>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGorunus(gorunus === 'A' ? 'B' : 'A')}
          className={`${dugme} bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:opacity-90`}>
          {gorunus === 'A' ? 'Poster görünüşü' : 'Şehir planı'}
        </button>
        <a href={adres} download={mahalleHaritaDosyaAdi(kimlik, gorunus)}
          className={`${dugme} border border-bej dark:border-lacivert-600 text-lacivert dark:text-krem hover:bg-bej/15 dark:hover:bg-lacivert-600/25`}>
          <Download size={14} /> Resmi indir
        </a>
      </div>
    </section>
  );
};
