import React, { useEffect, useMemo, useState } from 'react';
import { GomuluSayfa, SayfaBasi } from './kabuk/SayfaBasi';
import type { AreaType, Item } from '../types';
import { durumOranlari } from '../lib/durumOranlari';
import { eksikleriCikar } from '../lib/eksikler';
import { YuzdeSeridi, type SeritHedefi } from './anasayfa/YuzdeSeridi';
import { Bosluklar } from './Bosluklar';
import { Eksikler } from './Eksikler';
import { SayfaRayi } from './SayfaRayi';
import { DurumListesi, LISTELI_HEDEFLER } from './anasayfa/DurumListesi';
import { BoyutHiz } from './anasayfa/BoyutHiz';
import { AjansSayfasi } from './anasayfa/AjansSayfasi';

export type DurumSekmesi = 'yuzdeler' | 'eksikler' | 'bosluklar' | 'takvim' | 'yolharitasi' | 'ajans' | 'boyut';

/**
 * Durum (29 Eylül; 1 Ekim'de Neyin Eksik de buraya katıldı). Kemal:
 * "Durum ile Neyin Eksik birleşsin, adı Durum." Üç sekme: Yüzdeler ·
 * Eksikler · Boşluklar. Aynı anda yalnız biri çizilir; sayfa kısa kalır.
 * Tek seferlik düğmeler (Temizlik, aktarımlar) Eksikler sekmesinde.
 *
 * 7 Ekim (Kemal: "çok fazla buton var, daha az başlık"): Takvim ve Yol
 * haritası da Durum'un sekmesi. Yüzdeye basınca o yüzdenin maddeleri
 * listelenir, eksikler önde (Kemal: "haritaya değil maddelerin listesine
 * gitmem lazım").
 *
 * 21 Ekim: Ajans sekmesi, Kems Ajans'ın dosyaları (`lib/ajansDeposu.ts`).
 */
export const Durum: React.FC<{
  items: Item[];
  sekme: DurumSekmesi;
  onSekme: (s: DurumSekmesi) => void;
  onSec: (h: SeritHedefi) => void;
  onSelectArea: (area: AreaType, itemId?: string) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
  /** Ana sayfadan bir eksiğe basılınca o başlık açık gelir */
  eksikAcik?: string | null;
  /** Haftalık özetin gideceği adres: Kemal'in kendi Google hesabı */
  eposta?: string | null;
  /** Durum'un sekmesi olarak çizilen sayfalar */
  takvim?: React.ReactNode;
  yolHaritasi?: React.ReactNode;
  /** Listedeki maddeyi aç */
  onMaddeAc?: (item: Item) => void;
  /** Ana sayfanın yüzde şeridinden gelince açık gelecek liste */
  listeIstegi?: { h: SeritHedefi; n: number } | null;
}> = ({ items, sekme, onSekme, onSec, onSelectArea, onUpdateItem, onAddItem, onDeleteItem, onAlanSil, eksikAcik, takvim, yolHaritasi, onMaddeAc, listeIstegi }) => {
  const oranlar = useMemo(() => durumOranlari(items), [items]);
  /** Yüzde şeridinde açık liste */
  const [liste, setListe] = useState<SeritHedefi | null>(listeIstegi?.h ?? null);
  useEffect(() => { if (listeIstegi) setListe(listeIstegi.h); }, [listeIstegi?.n]);
  const eksikSayisi = useMemo(() => eksikleriCikar(items).length, [items]);
  const bolumler = [
    { id: 'yuzdeler', label: 'Yüzdeler' },
    { id: 'eksikler', label: eksikSayisi ? `Eksikler · ${eksikSayisi}` : 'Eksikler' },
    { id: 'bosluklar', label: 'Boşluklar' },
    { id: 'takvim', label: 'Takvim' },
    { id: 'yolharitasi', label: 'Yol haritası' },
    // 21 Ekim: Kems Ajans'ın dosyaları, depodan okunur
    { id: 'ajans', label: 'Ajans' },
    // 3. gece: kayıt boyutları, uygulama parçaları, açılış hızı
    { id: 'boyut', label: 'Boyut ve hız' }
  ];
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <SayfaBasi baslik="Durum" />
      <SayfaRayi baslik="Durum" bolumler={bolumler} aktifId={sekme} onSec={id => onSekme(id as DurumSekmesi)} />
      {sekme === 'yuzdeler' && (
        <section id="durum-yuzdeler">
          <YuzdeSeridi oranlar={oranlar} onSec={h => (LISTELI_HEDEFLER.includes(h) ? setListe(l => (l === h ? null : h)) : onSec(h))} ayrintili />
          {liste && <DurumListesi items={items} hedef={liste} onKapat={() => setListe(null)} onMaddeAc={onMaddeAc} onHarita={() => onSec('harita')} />}
        </section>
      )}
      {sekme === 'eksikler' && (
        <Eksikler
          items={items}
          onSelectArea={onSelectArea}
          onUpdateItem={onUpdateItem}
          onAddItem={onAddItem}
          baslangicAcik={eksikAcik}
          onDeleteItem={onDeleteItem}
          onAlanSil={onAlanSil}
        />
      )}
      {sekme === 'bosluklar' && <Bosluklar items={items} onUpdateItem={onUpdateItem} gomulu />}
      {sekme === 'boyut' && <BoyutHiz items={items} />}
      {sekme === 'ajans' && <AjansSayfasi items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />}
      <GomuluSayfa.Provider value={true}>
        {sekme === 'takvim' && takvim}
        {sekme === 'yolharitasi' && yolHaritasi}
      </GomuluSayfa.Provider>
    </div>
  );
};

export default Durum;
