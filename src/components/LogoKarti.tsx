import React, { useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import type { Item } from '../types';
import { LogoKutusu } from './LogoKutusu';
import { LOGOLAR, logoAdresi, logoIsiVar, logoIsleri } from '../lib/logoPaketi';

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

const ROL: Record<string, string> = { birincil: 'Birincil', ikincil: 'İkincil', alternatif: 'Alternatif', galeri: 'Galeri' };

/**
 * Logolar (M, 8 Ekim; `lib/logoPaketi.ts`). Yalnız iş varken görünür;
 * Kemal basınca logolar sahiplerine Kemal'in sırasıyla yerleşir.
 */
export const LogoKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: YeniKayit) => Promise<void>;
}> = ({ items, onUpdateItem, onAddItem }) => {
  const isler = useMemo(() => logoIsleri(items), [items]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!logoIsiVar(isler)) return null;

  const isle = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    let n = 0;
    const olmayan: string[] = [];
    const dene = async (ad: string, f: () => Promise<void>) => { try { await f(); n++; } catch { olmayan.push(ad); } };
    try {
      for (const m of isler.acilacak) await dene(m.title, () => onAddItem(m));
      for (const x of isler.sira) await dene(x.item.title, () => onUpdateItem(x.guncel));
      for (const x of isler.kunye) await dene(x.item.title, () => onUpdateItem(x.guncel));
      for (const x of isler.degisecek) await dene(x.logo.baslik, () => onUpdateItem(x.guncel));
      for (const x of isler.eklenecek) await dene(x.logo.baslik, () => onAddItem(x.kayit));
      setRapor(`${n} kayıt yazıldı: logolar yerinde, Galeri'deki küçük kopyalar büyükleriyle değişti.`
        + (olmayan.length ? ` Yazılamayan: ${olmayan.join(', ')} — tekrar basınca yalnız bunlar denenir.` : ''));
    } finally { setCalisiyor(false); }
  };

  const satir = 'text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]';
  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <Images className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Logolar: {LOGOLAR.length} logo yerine yerleşecek</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Drive'daki şeffaf logolar (büyük hâlleri). Markalarda senin sıran: birincil, ikincil, alternatif; eski logolar "deneme" olarak arkada kalır.
            Galeri'deki küçük kopyalar büyükleriyle değişir. Ayrıntı: docs/soru-cevap/logolar.md
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {LOGOLAR.map(l => (
              <span key={l.anahtar} className="w-16 shrink-0 text-center" title={l.baslik}>
                <LogoKutusu src={logoAdresi(l)} alt={l.baslik} className="w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72]" />
                <span className="block mt-0.5 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">{ROL[l.rol]}</span>
              </span>
            ))}
          </div>
          <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
            {isler.sira.map(x => <li key={x.item.id} className={satir}>{x.item.title}: {x.neler.join(', ')} logo</li>)}
            {isler.acilacak.map(m => <li key={m.id} className={satir}>Yeni madde: {m.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">(Eşya; metni boş)</span></li>)}
            {isler.kunye.map(x => <li key={x.item.id} className={satir}>{x.item.title}: künyede boş alanlar kanondan ({x.neler.join(', ')})</li>)}
            {(isler.degisecek.length + isler.eklenecek.length) > 0 && (
              <li className={satir}>Galeri: {isler.degisecek.length} küçük kopya büyüğüyle değişir, {isler.eklenecek.length} yeni logo eklenir</li>
            )}
          </ul>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Yerleştir'}
        </button>
      </div>
    </div>
  );
};

export default LogoKarti;
