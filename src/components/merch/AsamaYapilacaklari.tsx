import React, { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Item } from '../../types';
import { KisaListe } from '../kabuk/KisaListe';

/**
 * Aşama yapılacakları (yapisal-4, 34: "hazır liste + düzenlenebilir").
 * Ürünün bulunduğu aşamanın işleri. Liste ürüne kaydedilene kadar hazır
 * listedir; bir işi işaretleyince, ekleyince ya da silince ürüne yazılır
 * (`metadata.yapilacaklar`). Görünüm liste (33: "Liste, şu anki").
 * Uzun listede ilk 5 iş görünür (KisaListe, 3 Kasım); sayaç bütün listeyi sayar.
 */

export const ASAMALAR = ['Konsept', 'Tasarım', 'Üretim', 'Satışta'] as const;

/** Süreç adımları; ad ya da kurgu değil */
export const HAZIR_LISTE: Record<string, string[]> = {
  Konsept: ['Fikir notu', 'Pinterest / ilham panosu', 'Canva taslağı', 'Hangi drop / kurum'],
  Tasarım: ['Mockup / ürün görseli', 'Renk ve baskı yeri', 'Son tasarım dosyası', 'Etiket (Kems Company)'],
  Üretim: ['Üretici / baskıcı seç', 'Numune iste', 'Numune onayı', 'Sipariş'],
  Satışta: ['Ürün çekimi', 'Mağaza sayfası', 'Sosyal medya duyurusu', 'Sitede göster']
};

export interface Yapilacak { id: string; asama: string; metin: string; bitti: boolean }

export const yapilacaklar = (urun: Item): Yapilacak[] => {
  const kayitli = urun.metadata?.yapilacaklar as Yapilacak[] | undefined;
  if (Array.isArray(kayitli)) return kayitli;
  return ASAMALAR.flatMap(a => HAZIR_LISTE[a].map((m, n) => ({ id: `${a}_${n}`, asama: a, metin: m, bitti: false })));
};

interface Props {
  urun: Item;
  onUpdateItem: (item: Item) => Promise<void>;
}

export const AsamaYapilacaklari: React.FC<Props> = ({ urun, onUpdateItem }) => {
  const asama = (ASAMALAR as readonly string[]).includes(urun.status) ? urun.status : 'Konsept';
  const hepsi = yapilacaklar(urun);
  const liste = hepsi.filter(y => y.asama === asama);
  const [yeni, setYeni] = useState('');

  const yaz = (l: Yapilacak[]) => onUpdateItem({ ...urun, metadata: { ...urun.metadata, yapilacaklar: l }, updatedAt: Date.now() });
  const bitenSayi = liste.filter(y => y.bitti).length;

  return (
    <div className="mt-3 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white/60 dark:bg-[#17345A]/60 p-3">
      <div className="flex items-center justify-between text-[11px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
        <span className="font-bold uppercase tracking-wider">{asama} · yapılacaklar</span>
        <span>{bitenSayi}/{liste.length}</span>
      </div>
      <KisaListe className="mt-2 space-y-1" dugmeClassName="mt-1">
        {liste.map(y => (
          <li key={y.id} className="flex items-center gap-2 group">
            <button
              type="button"
              aria-label={y.bitti ? 'Yapılmadı olarak işaretle' : 'Yapıldı olarak işaretle'}
              onClick={() => void yaz(hepsi.map(x => (x.id === y.id ? { ...x, bitti: !x.bitti } : x)))}
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${y.bitti ? 'bg-[#F26B6F] border-[#F26B6F] text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72]'}`}
            >
              {y.bitti && <Check className="w-3 h-3" />}
            </button>
            <span className={`flex-1 text-[12px] ${y.bitti ? 'line-through text-[#A99C87]' : 'text-[#0E1C4F] dark:text-[#F3EFE8]'}`}>{y.metin}</span>
            <button type="button" aria-label="Sil" onClick={() => void yaz(hepsi.filter(x => x.id !== y.id))} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-[#A99C87] hover:text-[#F26B6F] cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </KisaListe>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (!yeni.trim()) return;
          void yaz([...hepsi, { id: `y${Date.now()}`, asama, metin: yeni.trim(), bitti: false }]);
          setYeni('');
        }}
        className="mt-2 flex gap-1.5"
      >
        <input value={yeni} onChange={e => setYeni(e.target.value)} placeholder="İş ekle…" className="flex-1 min-w-0 text-[12px] bg-transparent border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1 text-[#0E1C4F] dark:text-[#F3EFE8]" />
        <button type="submit" disabled={!yeni.trim()} aria-label="Ekle" className="px-2 rounded border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] disabled:opacity-40 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
      </form>
    </div>
  );
};

export default AsamaYapilacaklari;
