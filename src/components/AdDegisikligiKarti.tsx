import React, { useMemo, useState } from 'react';
import { KisaListe } from './kabuk/KisaListe';
import { PenLine } from 'lucide-react';
import type { Item } from '../types';
import { adIsiVar, adIsleri, adYazimlari } from '../lib/adYayma';

/**
 * Ad değişikliği her yere (8 Ekim; `lib/adYayma.ts`). Yalnız iş varken
 * görünür; Kemal basınca eski ad öbür maddelerde yenisiyle değişir, eski
 * adla açılmış boş kopya silinir.
 */
export const AdDegisikligiKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}> = ({ items, onUpdateItem, onDeleteItem }) => {
  const isler = useMemo(() => adIsleri(items), [items]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!adIsiVar(isler)) return null;
  // Yalnız "yayıldı" işareti kalkacaksa (metin işi yok) kart gösterilmez; sessiz iş değil, bir sonraki basışta gider
  if (!isler.metin.length && !isler.kopya.length && !isler.adKaydi.length) return null;

  const degisimler = Array.from(new Set([
    ...isler.adKaydi.map(a => `"${a.eski}" → "${a.item.title}"`),
    ...isler.metin.flatMap(m => m.neler)
  ]));

  const isle = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    const { yaz, sil } = adYazimlari(isler);
    let n = 0, s = 0;
    const olmayan: string[] = [];
    try {
      for (const i of yaz) {
        try { await onUpdateItem(i); n++; } catch { olmayan.push(i.title); }
      }
      if (onDeleteItem) for (const i of sil) {
        try { await onDeleteItem(i.id); s++; } catch { olmayan.push(i.title); }
      }
      setRapor(`${n} madde güncellendi${s ? `, ${s} boş kopya silindi` : ''}.`
        + (olmayan.length ? ` Yazılamayan: ${olmayan.join(', ')} — tekrar basınca yalnız bunlar denenir.` : ''));
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <PenLine className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Ad değişikliği her yere: {degisimler.join(' · ')}</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Eski adın geçtiği maddelerde yeni ad yazılır (metin, künye, bölümler). Tarihî eski adlara (İskele'nin "Kemsköy"ü gibi) dokunulmaz.
          </p>
          <KisaListe className="mt-1.5 list-disc pl-5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            {isler.metin.map(m => <li key={m.item.id}>{m.item.title}</li>)}
            {isler.kopya.map(k => <li key={k.item.id}>Boş kopya silinir: {k.item.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">(asıl madde: {k.asil.title})</span></li>)}
          </KisaListe>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Her yerde değiştir'}
        </button>
      </div>
    </div>
  );
};

export default AdDegisikligiKarti;
