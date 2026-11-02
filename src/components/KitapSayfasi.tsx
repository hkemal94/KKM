import React, { useMemo, useState } from 'react';
import { Library } from 'lucide-react';
import Kitap from './Kitap';
import { Item } from '../types';
import {
  ORNEK_PROJE_ID, ornekProje, ornekBolumler
} from '../data/hikayeOrnekleri';
import { SayfaBasi } from './kabuk/SayfaBasi';

/**
 * Evren → Kitap (2 Kasım, yol haritası 6. adım; Kemal: "Kitap Evren'e,
 * Fanzin İçerik'e"). Eski Yazı ekranının kitap kısmı; blog ve fanzin
 * Ürünler → İçerik'te.
 */

interface KitapSayfasiProps {
  items: Item[];
  activeItemId?: string | null;
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  /** Yazım panelinden maddeyi vikide açar (7. gece) */
  onMaddeAc?: (id: string) => void;
}

export default function KitapSayfasi({
  items,
  activeItemId,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onMaddeAc
}: KitapSayfasiProps) {

  /**
   * Açılış zinciri örneği (16 Eylül).
   *
   * Kemal hikâyeyi sıfırdan yazacak ama eldeki kurgu kaybolmasın istedi.
   * Bu düğme onu Kitap atölyesine bir ÖRNEK proje olarak getiriyor: altı
   * bölüm künyesi, kıymıklar, motifler ve beş yazım kuralı. Hepsi "öneri"
   * işaretli — kanon değil, yazarken bakılacak iskelet.
   */
  const ornekVar = useMemo(
    () => items.some(i => i.id === ORNEK_PROJE_ID),
    [items]
  );
  const [ornekKuruluyor, setOrnekKuruluyor] = useState(false);

  const ornegiGetir = async () => {
    if (ornekVar || ornekKuruluyor) return;
    setOrnekKuruluyor(true);
    try {
      await onAddItem(ornekProje());
      for (const b of ornekBolumler()) await onAddItem(b);
      onSelectItem(ORNEK_PROJE_ID);
    } finally {
      setOrnekKuruluyor(false);
    }
  };

  return (
    <div className="space-y-6">


      <SayfaBasi baslik="Kitap">
        {!ornekVar && (
          <button
            type="button"
            onClick={ornegiGetir}
            disabled={ornekKuruluyor}
            title="Excel'deki açılış zincirini örnek proje olarak getirir. Kanon değil; yeniden yazarken bakılacak iskelet."
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:bg-[#F3EFE8]/60 dark:hover:bg-[#17345A] transition-colors cursor-pointer disabled:opacity-40"
          >
            <Library className="w-3.5 h-3.5" />
            <span>
              {ornekKuruluyor ? 'Getiriliyor…' : 'Açılış zinciri örneğini getir'}
            </span>
          </button>
        )}
      </SayfaBasi>

      <Kitap
          items={items}
          activeItemId={activeItemId}
          onSelectItem={onSelectItem}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
          onAddItem={onAddItem}
          onMaddeAc={onMaddeAc}
      />
    </div>
  );
}
