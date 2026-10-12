import React, { useMemo, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import type { Item } from '../types';
import { DONDURMACI_GORSELLERI, dondurmaciIsiVar, dondurmaciIsleri } from '../lib/dondurmaciBelgesi';

/**
 * Dondurmacı Kızlar tasarım belgesi (12 Ekim; `lib/dondurmaciBelgesi.ts`).
 * Yalnız iş varken görünür. Kemal'in Word belgesi bölümlerin sonuna, üç
 * ekran görseli oyunun vitrinine.
 */
export const DondurmaciKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
}> = ({ items, onUpdateItem, onAddItem }) => {
  const isler = useMemo(() => dondurmaciIsleri(items), [items]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!dondurmaciIsiVar(isler)) return null;

  const isle = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    const olmayan: string[] = [];
    try {
      for (const i of isler.guncellenecek) { try { await onUpdateItem(i); } catch { olmayan.push(i.title); } }
      if (onAddItem) for (const i of isler.eklenecek) { try { await onAddItem(i); } catch { olmayan.push(i.title); } }
      setRapor(olmayan.length
        ? `Yazılamayan: ${olmayan.join(', ')} — tekrar basınca yalnız bunlar denenir.`
        : 'Dondurmacı Kızlar: tasarım belgesi ve görseller oyun sayfasında.');
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <Gamepad2 className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Dondurmacı Kızlar: tasarım belgesini oyuna koy</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Senin Word belgendeki metin, aynen, şu bölümlerin sonuna eklenir: {isler.bolumler.join(', ') || '—'}. Dolu yazıya ve seçimlere dokunulmaz.
            {isler.gorselEksik > 0 && ` ${isler.gorselEksik} ekran görseli oyunun vitrinine girer.`}
          </p>
          {isler.gorselEksik > 0 && (
            <div className="mt-2 flex gap-2">
              {DONDURMACI_GORSELLERI.map(g => <img key={g} src={g} alt="" loading="lazy" className="w-24 h-14 object-cover rounded border border-[#CFC5B4] dark:border-[#2C3C72]" />)}
            </div>
          )}
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Oyuna koy'}
        </button>
      </div>
    </div>
  );
};

export default DondurmaciKarti;
