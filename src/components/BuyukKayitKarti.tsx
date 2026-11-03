import React, { useMemo, useState } from 'react';
import { KisaListe } from './kabuk/KisaListe';
import { HardDrive } from 'lucide-react';
import type { Item } from '../types';
import { buyukKayitlar, kaydiKucult, kayitBoyutu, BUYUK_SINIR } from '../lib/buyukKayitlar';

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

/** Büyük kayıtlar (8 Ekim; `lib/buyukKayitlar.ts`). Yalnız iş varken görünür. */
export const BuyukKayitKarti: React.FC<{ items: Item[]; onUpdateItem: (item: Item) => Promise<void> }> = ({ items, onUpdateItem }) => {
  const liste = useMemo(() => buyukKayitlar(items), [items]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!liste.length) return null;

  const kucult = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    const satirlar: string[] = [];
    try {
      for (const { item, boyut } of liste) {
        try {
          const yeni = await kaydiKucult(item);
          const yb = kayitBoyutu(yeni);
          if (yb >= boyut - 1024) { satirlar.push(`${item.title}: küçülecek görsel yok (${kb(boyut)})`); continue; }
          await onUpdateItem(yeni);
          satirlar.push(`${item.title}: ${kb(boyut)} → ${kb(yb)}`);
        } catch {
          satirlar.push(`${item.title}: yazılamadı`);
        }
      }
      setRapor(satirlar.join(' · '));
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <HardDrive className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Büyük kayıtlar: {liste.length} kayıt 1 MB sınırına yakın</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Bir kayıt 1 MB'ı aşınca kaydedilmiyor; bu kayıtlara birkaç satır eklemek bile yetiyor. İçlerindeki görseller küçültülür
            (saydam olanlar saydam kalır, en uzun kenar 1400 px). Metne ve künyeye dokunulmaz. Sınır: {kb(BUYUK_SINIR)}.
          </p>
          <KisaListe className="mt-1.5 list-disc pl-5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            {liste.map(x => <li key={x.item.id}>{x.item.title || x.item.id} · {kb(x.boyut)}</li>)}
          </KisaListe>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void kucult()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Küçültülüyor…' : 'Küçült'}
        </button>
      </div>
    </div>
  );
};

export default BuyukKayitKarti;
