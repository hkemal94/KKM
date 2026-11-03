import React, { useMemo, useState } from 'react';
import { KisaListe } from './kabuk/KisaListe';
import { Copy, Download, Link2Off } from 'lucide-react';
import type { Item } from '../types';
import { mukerrerGruplari, mukerrerIsleri } from '../lib/mukerrerler';
import { uymayanBaglar } from '../lib/bagKurallari';
import { BAG_TURLERI } from '../utils/relations';
import { TYPE_LABELS } from './wiki/wikiSchema';

const KUTU = 'mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]';
const ACIKLAMA = 'mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]';

/**
 * Mükerrer maddeler (8 Ekim; `lib/mukerrerler.ts`). Yalnız iş varken görünür.
 * Aynı türde aynı adlı maddeler en eskisinde birleşir; öteki silinir.
 */
export const MukerrerKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}> = ({ items, onUpdateItem, onDeleteItem }) => {
  const gruplar = useMemo(() => mukerrerGruplari(items), [items]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);
  const [yedeklendi, setYedeklendi] = useState(false);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!gruplar.length) return null;

  // Yedek isteğe bağlı (30 Eylül kuralı)
  const yedekIndir = () => {
    const dosya = new Blob([JSON.stringify({ uygulama: 'Kems Komuta Merkezi', tur: 'mukerrer-oncesi-yedek', tarih: new Date().toISOString(), items }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(dosya);
    a.download = `kkm-yedek-mukerrer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setYedeklendi(true);
  };

  const birlestir = async () => {
    if (calisiyor || !window.confirm('Aynı adlı maddeler birleşecek, kopyalar silinecek. Geri alınamaz. Devam edilsin mi?')) return;
    setCalisiyor(true);
    const { guncellenecek, silinecek, ozet } = mukerrerIsleri(items);
    const olmayan: string[] = [];
    try {
      // Önce yazılır, sonra silinir: yazma olmazsa hiçbir şey silinmez
      for (const i of guncellenecek) { try { await onUpdateItem(i); } catch { olmayan.push(i.title); } }
      if (!olmayan.length) for (const id of silinecek) { try { await onDeleteItem(id); } catch { olmayan.push(id); } }
      setRapor(olmayan.length
        ? `Yazılamayan: ${olmayan.join(', ')}. Kopyalar silinmedi; tekrar basınca yeniden denenir.`
        : `Birleşti: ${ozet.join(' · ')}.`);
    } finally { setCalisiyor(false); }
  };

  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <Copy className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Mükerrer maddeler: {gruplar.length}</p>
          <p className={ACIKLAMA}>
            Aynı türde aynı adlı maddeler en eskisinde birleşir. Ötekinin dolu alanları yalnız boş alanlara eklenir; görseller, etiketler,
            bağlar ve bölümler birleşir; başka maddelerdeki bağlar kalan maddeye döner. Sonra kopya silinir.
          </p>
          <KisaListe className="mt-1.5 list-disc pl-5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            {gruplar.map(g => <li key={g.kalan.id}>{g.kalan.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">· {TYPE_LABELS[g.kalan.type] || g.kalan.type} · {g.gidenler.length + 1} madde</span></li>)}
          </KisaListe>
          <button type="button" onClick={yedekIndir} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#0E1C4F] cursor-pointer">
            <Download className="w-3.5 h-3.5" /> {yedeklendi ? 'Yedek indi ✓' : 'Yedek indir · isteğe bağlı'}
          </button>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void birlestir()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Birleştir'}
        </button>
      </div>
    </div>
  );
};

const turAdi = (t: string) => BAG_TURLERI.find(b => b.id === t)?.ad || t;

/**
 * Uymayan bağlar (8 Ekim; `lib/bagKurallari.ts`). Yalnız liste: kayda
 * yazmaz. Kemal düzenleyicide türü değiştirir ya da bağı kaldırır.
 */
export const UymayanBagKarti: React.FC<{ items: Item[]; onMaddeAc?: (id: string) => void }> = ({ items, onMaddeAc }) => {
  const liste = useMemo(() => uymayanBaglar(items), [items]);
  if (!liste.length) return null;
  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <Link2Off className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Uymayan bağlar: {liste.length}</p>
          <p className={ACIKLAMA}>Bu bağ türleri bu madde türleri arasında olmaz (ör. bir kişi bir mekânla evli olamaz). Maddeyi aç, düzenleyicide türü değiştir ya da bağı kaldır.</p>
          <KisaListe className="mt-1.5 space-y-0.5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            {liste.map((u, n) => (
              <li key={`${u.kaynak.id}-${u.hedef.id}-${n}`}>
                {onMaddeAc
                  ? <button type="button" onClick={() => onMaddeAc(u.kaynak.id)} className="underline decoration-[#0E1C4F]/30 underline-offset-2 hover:decoration-[#F26B6F] cursor-pointer">{u.kaynak.title}</button>
                  : u.kaynak.title}
                <span className="text-[#6A5E4C] dark:text-[#A6B0C9]"> ({TYPE_LABELS[u.kaynak.type] || u.kaynak.type}) → {turAdi(u.tur)} → </span>
                {u.hedef.title}<span className="text-[#6A5E4C] dark:text-[#A6B0C9]"> ({TYPE_LABELS[u.hedef.type] || u.hedef.type})</span>
              </li>
            ))}
          </KisaListe>
        </div>
      </div>
    </div>
  );
};

export default MukerrerKarti;
