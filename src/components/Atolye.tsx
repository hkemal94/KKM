import React, { useState, useEffect, lazy, Suspense } from 'react';
import type { Item } from '../types';
import { isaretle } from '../lib/olcumler';
import { SayfaBasi } from './kabuk/SayfaBasi';
import { SayfaRayi, type RayBolumu } from './SayfaRayi';

/**
 * Atölye (4. gece, 7 Ekim; vvd'den): evrenin çalışma araçları tek bölümde.
 * Harita (29 Eylül'den 23 Kasım'a dek Harita ve Kurucu), bağ
 * ağı ve zaman çizgisi (5. gece); soy ağacı geldiği gece raya eklendi (Kemal:
 * "görünmesin"). Düzada viki ve Evren Raporu olarak kaldı.
 * 2 Kasım (yol haritası 1. adım): Tuval kalktı.
 * 2 Kasım (yol haritası 6. adım): Evren menüsünde iki sayfa oldu: Harita ve
 * Kurucu (`sekmeler=['harita']`) ve Görünümler (bağ ağı, zaman çizgisi, soy
 * ağacı). Başlangıç ekranı kalktı.
 * 23 Kasım (tek harita 11. adım): eski üç harita ve Kurucu silindi; Harita
 * sayfasında yalnız tek harita (Kemal: sayfanın adı "Harita").
 */
const RAY_BOLUMLERI: RayBolumu[] = [
  { id: 'harita', label: 'Harita' },
  // 20 Kasım (Kemal): Görünümler soy ağacıyla açılır; sıra soy, zaman, bağ
  { id: 'soy', label: 'Soy ağacı' },
  { id: 'zaman', label: 'Zaman çizgisi' },
  { id: 'ag', label: 'Bağ ağı' }
];
export type AtolyeSekmesi = 'harita' | 'ag' | 'zaman' | 'soy';

// Bağ ağı (5. gece): sekme açılınca yüklenir
const BagAgi = lazy(() => import('./atolye/BagAgi').then(m => ({ default: m.BagAgi })));
// Zaman çizgisi ve dönemler (5. gece)
// Soy ağacı (6. gece)
const SoyAgaci = lazy(() => import('./atolye/SoyAgaci').then(m => ({ default: m.SoyAgaci })));
const ZamanCizgisi = lazy(() => import('./atolye/ZamanCizgisi').then(m => ({ default: m.ZamanCizgisi })));

// Tek harita (21 Kasım, 6. adım): kompakt ada, statik dosyalardan
const TekHarita = lazy(() => import('./harita/TekHarita'));

interface AtolyeProps {
  items: Item[];
  onAddItem: (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  /** Bağ ağında "Bağla" */
  onUpdateItem: (item: Item) => Promise<void>;
  /** Menüden doğrudan bir sekmeye gelmek için */
  istek?: { sekme: AtolyeSekmesi; n: number; aile?: string } | null;
  /** Sayfanın başlığı ve gösterdiği araçlar (Harita · Görünümler) */
  baslik: string;
  sekmeler: AtolyeSekmesi[];
  /** Haritadan seçilen maddeyi Düzada vikisinde açar */
  onMaddeAc: (id: string) => void;
}

export default function Atolye({ items, onAddItem, onUpdateItem, istek = null, onMaddeAc, baslik, sekmeler }: AtolyeProps) {
  const ilk = istek && sekmeler.includes(istek.sekme) ? istek.sekme : sekmeler[0];
  const [sekme, setSekme] = useState<AtolyeSekmesi>(ilk);
  useEffect(() => { if (istek && sekmeler.includes(istek.sekme)) setSekme(istek.sekme); }, [istek?.n]);
  const bolumler = RAY_BOLUMLERI.filter(b => sekmeler.includes(b.id as AtolyeSekmesi));
  // Açılış hızı (3. gece): Harita'ya her girişte ölçüm baştan
  useEffect(() => { if (sekme === 'harita') isaretle('harita-basladi'); }, [sekme]);

  return (
    <div className="space-y-6">
      <SayfaBasi baslik={baslik} />
      {bolumler.length > 1 && <SayfaRayi baslik={baslik} bolumler={bolumler} aktifId={sekme} onSec={id => setSekme(id as AtolyeSekmesi)} />}


      {sekme === 'ag' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Ağ kuruluyor…</div>}>
          <BagAgi items={items} onUpdateItem={onUpdateItem} onMaddeAc={onMaddeAc} />
        </Suspense>
      )}
      {sekme === 'soy' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Soy ağacı hazırlanıyor…</div>}>
          <SoyAgaci items={items} onMaddeAc={onMaddeAc} ilkAile={istek?.sekme === 'soy' ? istek.aile ?? null : null} />
        </Suspense>
      )}
      {sekme === 'zaman' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Zaman çizgisi hazırlanıyor…</div>}>
          <ZamanCizgisi items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onMaddeAc={onMaddeAc} />
        </Suspense>
      )}

      {sekme === 'harita' && (
        <Suspense fallback={<div className="h-[calc(100dvh-14.5rem)] sm:h-[calc(100vh-11rem)] min-h-[460px] flex items-center justify-center rounded-2xl bg-[#D8E6EC] font-mono text-xs text-[#0E1C4F]">Harita yükleniyor…</div>}>
          <TekHarita items={items} onMaddeAc={onMaddeAc}
            className="h-[calc(100dvh-14.5rem)] sm:h-[calc(100vh-11rem)] min-h-[460px] sm:min-h-[520px] rounded-2xl overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72]" />
        </Suspense>
      )}
    </div>
  );
}
