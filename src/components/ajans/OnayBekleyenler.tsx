import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Item } from '../../types';
import { bekleyenAdaylar } from '../../lib/adaylar';
import { eksikleriCikar } from '../../lib/eksikler';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { BekleyenIsler } from '../anasayfa/BekleyenIsler';
import { EksikOzeti } from '../anasayfa/EksikOzeti';
import { AjansKararlariKarti } from '../anasayfa/AjansKararlariKarti';
import { OneriTepsisi } from '../studyo/OneriTepsisi';
import type { StudyoIslemleri } from '../studyo/StudyoBaglami';
import { DUGME_BOS, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Ajans → Onay bekleyenler (2 Kasım, Kemal'in yeni yerleşimi, 2. adım).
 * KKM'nin açılış ekranı. Kemal'in kararını bekleyen her şey tek sayfada:
 * tek seferlik işler, öneri tepsisi, ajansın kararları ve eksikler.
 * Üstteki süzgeç tek türü gösterir. Hiçbir kayıt Kemal basmadan değişmez;
 * her bölüm kendi kartının düğmeleriyle çalışır (Ekle / İşle / Uygula / Sil).
 * Ortak dört düğme (Uygula · Düzenle · Arşivle · Sil), tarihe kadar
 * bekletme ve toplu seçim sonraki adımda gelir.
 */

type Suzgec = 'hepsi' | 'isler' | 'oneriler' | 'kararlar' | 'eksikler';

interface Props {
  items: Item[];
  studyo: StudyoIslemleri;
  /** Bekleyen tek seferlik düğmelerin adları (zildeki liste) */
  dugmeler: string[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
  /** Eksikler sayfasını açar (başlık verilirse o liste açık gelir) */
  onEksikler: (anahtar: string | null) => void;
  /** Durum → Ajans (GitHub anahtarı orada girilir) */
  onAjans: () => void;
}

export const OnayBekleyenler: React.FC<Props> = ({
  items, studyo, dugmeler, onUpdateItem, onAddItem, onDeleteItem, onAlanSil, onEksikler, onAjans
}) => {
  const [suzgec, setSuzgec] = useState<Suzgec>('hepsi');
  /** "Yenile": ajansın kararları depodan yeniden okunur */
  const [tur, setTur] = useState(0);
  const anahtar = anahtariOku();
  const oneriSayisi = useMemo(() => bekleyenAdaylar(items).length, [items]);
  const eksikler = useMemo(() => eksikleriCikar(items), [items]);
  const eksikSayisi = eksikler.reduce((t, e) => t + e.sayi, 0);

  const SUZGECLER: Array<{ id: Suzgec; ad: string; sayi?: number }> = [
    { id: 'hepsi', ad: 'Hepsi' },
    { id: 'isler', ad: 'Tek seferlik işler', sayi: dugmeler.length || undefined },
    { id: 'oneriler', ad: 'Öneriler', sayi: oneriSayisi || undefined },
    { id: 'kararlar', ad: 'Ajansın kararları' },
    { id: 'eksikler', ad: 'Eksikler', sayi: eksikSayisi || undefined }
  ];
  const goster = (s: Suzgec) => suzgec === 'hepsi' || suzgec === s;

  return (
    <div className="space-y-3 lg:space-y-4 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`font-bold tracking-tight leading-tight text-[20px] lg:text-[28px] ${YAZI}`}>Onay bekleyenler</h1>
          <p className={`mt-1 text-[13px] ${IKINCIL}`}>Kararını bekleyen her şey burada. Sen basmadan hiçbir kayıt değişmez.</p>
        </div>
        <button type="button" onClick={() => setTur(t => t + 1)} className={`${DUGME_BOS} shrink-0`} title="Ajansın kararlarını yeniden oku">
          <RefreshCw className="w-3.5 h-3.5" /> Yenile
        </button>
      </div>

      {/* Süzgeç: telefonda yana kayar */}
      <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {SUZGECLER.map(s => {
          const aktif = suzgec === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSuzgec(s.id)}
              aria-pressed={aktif}
              className={`shrink-0 min-h-9 px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer border ${aktif ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F]'}`}
            >
              {s.ad}
              {s.sayi ? <span className={`px-1.5 rounded-full text-[10px] font-bold ${aktif ? 'bg-[#F26B6F] text-white' : 'bg-[#F3EFE8] dark:bg-[#0B132B]'}`}>{s.sayi}</span> : null}
            </button>
          );
        })}
      </div>

      {goster('isler') && (
        <BekleyenIsler items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onDeleteItem={onDeleteItem} onAlanSil={onAlanSil} />
      )}
      {suzgec === 'isler' && !dugmeler.length && (
        <p className={`${KART} p-4 text-[13px] ${IKINCIL}`}>Bekleyen tek seferlik iş yok.</p>
      )}

      {goster('oneriler') && <OneriTepsisi {...studyo} />}

      {goster('kararlar') && (anahtar ? (
        <AjansKararlariKarti items={items} anahtar={anahtar} tur={tur} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />
      ) : (
        <section className={`${KART} p-4 space-y-2`}>
          <p className={`text-[13px] font-semibold ${YAZI}`}>Ajansın kararları</p>
          <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; ajansın kararları okunamıyor. Anahtar Durum → Ajans sayfasında bir kez girilir.</p>
          <button type="button" onClick={onAjans} className={DUGME_BOS}>Durum → Ajans</button>
        </section>
      ))}

      {goster('eksikler') && <EksikOzeti eksikler={eksikler} dugmeler={dugmeler} onAc={onEksikler} />}
    </div>
  );
};

export default OnayBekleyenler;
