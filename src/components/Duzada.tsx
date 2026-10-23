import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Item } from '../types';
import { SayfaBasi } from './kabuk/SayfaBasi';
import { WikiShell } from './wiki/WikiShell';
import { useHaritaMaddesi } from './duzada/HaritaMaddesi';
import { SayfaRayi, type RayBolumu } from './SayfaRayi';

/**
 * Düzada'nın iki yüzü — Viki ve Evren Raporu. Harita ve Kurucu 4. gecede
 * (7 Ekim) Atölye'ye taşındı.
 */
const RAY_BOLUMLERI: RayBolumu[] = [
  { id: 'wiki', label: 'Düzada Wiki' },
  { id: 'rapor', label: 'Evren Raporu' }
];

// Rapor sekmesi açılınca yüklenir (sayfa açılışı hafif kalsın diye)
const DuzadaRaporu = lazy(() =>
  import('./duzada/DuzadaRaporu').then(m => ({ default: m.DuzadaRaporu }))
);

export type DuzadaSekmesi = 'wiki' | 'rapor';

interface DuzadaProps {
  items: Item[];
  activeItemId?: string | null;
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  /** Menüden doğrudan bir sekmeye gelmek için */
  istek?: { sekme: DuzadaSekmesi; n: number } | null;
  /** "Haritada gör": Atölye'deki Harita ve Kurucu */
  onAtolye: () => void;
  /** Aile maddesinden "Soy ağacında aç" (6. gece) */
  onSoyAgaci?: (aileId: string) => void;
}

export default function Duzada({
  items,
  activeItemId,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  istek = null,
  onAtolye,
  onSoyAgaci
}: DuzadaProps) {
  const [activeTab, setActiveTab] = useState<DuzadaSekmesi>(istek?.sekme ?? 'wiki');
  useEffect(() => { if (istek) setActiveTab(istek.sekme); }, [istek?.n]);

  // Raporda haritadaki bir yapıya basınca maddesi vikide açılır
  const haritaMaddesi = useHaritaMaddesi({
    items, onAddItem,
    onMaddeAc: id => { setActiveTab('wiki'); onSelectItem(id); }
  });

  return (
    <div className="space-y-6">

      {/* Sade başlık (1 Ekim, K-2): sekmeler yalnız sayfa rayında; tutarlılık denetimi stüdyoda */}
      <SayfaBasi baslik="Düzada" />

      <SayfaRayi
        baslik="Düzada"
        bolumler={RAY_BOLUMLERI}
        aktifId={activeTab}
        onSec={id => setActiveTab(id as DuzadaSekmesi)}
      />

      {activeTab === 'wiki' && (
        <WikiShell
          items={items}
          selectedId={activeItemId}
          onSelect={onSelectItem}
          onEdit={(id) => {
            setActiveTab('wiki');
            onSelectItem(id);
          }}
          onHaritayaGit={onAtolye}
          onSoyAgaci={onSoyAgaci}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
          onAddItem={onAddItem}
          onRaporAc={() => setActiveTab('rapor')}
          onSitede={(it, acik) => {
            // Yalnız Kemal basınca yazılır. Kayıt eskisinin üstüne eklenerek
            // yazıldığı için alanı silmek işe yaramıyor; kapatınca false yazılır.
            void onUpdateItem({ ...it, metadata: { ...(it.metadata || {}), sitede: acik } as Item['metadata'], updatedAt: Date.now() });
          }}
        />
      )}

      {/* EVREN RAPORU — kayıtlardan, yazdırılabilir */}
      {activeTab === 'rapor' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Rapor hazırlanıyor…</div>}>
          <DuzadaRaporu
            items={items}
            onMaddeSec={haritaMaddesi.ac}
            onHaritayaGit={onAtolye}
          />
        </Suspense>
      )}

      {haritaMaddesi.kutu}
    </div>
  );
}
