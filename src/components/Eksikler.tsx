import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, CircleCheck } from 'lucide-react';
import type { AreaType, Item } from '../types';
import { TemizlikKarti, EskiAlanKarti } from './TemizlikKarti';
import { OrtakAlanKarti } from './OrtakAlanKarti';
import { GaleriYedegiKarti } from './GaleriYedegiKarti';
import { KanonKarti } from './KanonKarti';
import { AdDegisikligiKarti } from './AdDegisikligiKarti';
import { MukerrerKarti, UymayanBagKarti } from './MukerrerKarti';
import { BuyukKayitKarti } from './BuyukKayitKarti';
import { YerKartlariKarti, MahalleDerlemeKarti, MaddeSoruTuruKarti, ClaudeDerlemeKarti } from './YerKartlari';
import { boslukDoldurma } from '../lib/boslukDoldurma';
import { haritadaAra, maddeTohumu } from '../lib/haritaMaddesi';
import { eksikleriCikar, type Cozum } from '../lib/eksikler';

interface EksiklerProps {
  items: Item[];
  onSelectArea: (area: AreaType, itemId?: string) => void;
  /** Kayıt yazma — ø temizliği için */
  onUpdateItem?: (item: Item) => Promise<void>;
  /** W5: galeriye görsel eklemek için */
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  /** Ana sayfadan bir satıra basılınca o başlık açık gelir (Paket 4) */
  baslangicAcik?: string | null;
  /** Temizlik kartı: kaydı gerçekten siler (29 Eylül) */
  onDeleteItem?: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
}

export const Eksikler: React.FC<EksiklerProps> = ({
  items, onSelectArea, onUpdateItem, onAddItem, baslangicAcik = null, onDeleteItem, onAlanSil
}) => {
  const eksikler = useMemo(() => eksikleriCikar(items), [items]);
  /** Listesi açık olan eksik başlığı */
  const [acikEksik, setAcikEksik] = useState<string | null>(baslangicAcik);
  React.useEffect(() => { if (baslangicAcik) setAcikEksik(baslangicAcik); }, [baslangicAcik]);
  /** Satırdaki çözüm düğmesi çalışırken */
  const [cozuluyor, setCozuluyor] = useState<string | null>(null);

  /** Tek tuşla çözüm — yalnız Kemal basınca yazar */
  const coz = async (c: Cozum, anahtar: string) => {
    if (cozuluyor) return;
    setCozuluyor(anahtar);
    try {
      if (c.tur === 'madde-ac' && onAddItem) {
        const k = haritadaAra(c.wikiId);
        if (!k) return;
        const tohum = maddeTohumu(k);
        // undefined alan bütün kaydı reddettirir: boş anahtarlar çıkarılır
        const meta = Object.fromEntries(Object.entries(tohum.metadata || {}).filter(([, v]) => v !== undefined));
        await onAddItem({ ...tohum, metadata: meta } as Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>);
      } else if (c.tur === 'kayda-bagla' && onUpdateItem) {
        const hedef = items.find(i => i.id === c.hedefId);
        if (hedef) await onUpdateItem({ ...hedef, metadata: { ...(hedef.metadata || {}), haritaWikiId: c.wikiId }, updatedAt: Date.now() });
      } else if (c.tur === 'markaya-bagla' && onUpdateItem) {
        const hedef = items.find(i => i.id === c.hedefId);
        if (hedef) await onUpdateItem({ ...hedef, metadata: { ...(hedef.metadata || {}), brandId: c.markaId }, updatedAt: Date.now() });
      }
    } finally {
      setCozuluyor(null);
    }
  };
  const cozumAdi = (c: Cozum) => c.tur === 'madde-ac' ? 'Madde aç' : c.tur === 'kayda-bagla' ? 'Kayda bağla' : `${c.markaAdi}'ye bağla`;

  // Bu satır bütün useMemo/useState'lerin ALTINDA olmalı: üstte dururken veri
  // yüklenince çağrılan kanca sayısı değişiyordu, React bunu hata sayar.
  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Ortak alan (1 Ekim): eski ortak alanda kayıt kaldıysa tek seferlik taşıma */}
      {onUpdateItem && <OrtakAlanKarti items={items} onUpdateItem={onUpdateItem} />}

      {/* Temizlik (29 Eylül): kullanılmayan kayıtlar silinir, önce yedek */}
      {onDeleteItem && <TemizlikKarti items={items} onDeleteItem={onDeleteItem} />}
      {onAlanSil && <EskiAlanKarti items={items} onAlanSil={onAlanSil} />}

      {/* Galeri (29 Eylül): kullanılan görseller galeriye */}
      {onAddItem && <GaleriYedegiKarti items={items} onAddItem={onAddItem} />}

      {onUpdateItem && <BuyukKayitKarti items={items} onUpdateItem={onUpdateItem} />}
      {onUpdateItem && <AdDegisikligiKarti items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />}
      {/* Mükerrer maddeler ve uymayan bağlar (8 Ekim) */}
      {onUpdateItem && onDeleteItem && <MukerrerKarti items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />}
      <UymayanBagKarti items={items} onMaddeAc={id => onSelectArea('duzada', id)} />
      {/* Dondurmacı Kızlar tasarım belgesi (12 Ekim) */}

      {/* Yer kartları ve mahalle derlemesi (8 Ekim) */}
      {onUpdateItem && (
        <YerKartlariKarti items={items} onUpdateItem={onUpdateItem} onAc={id => onSelectArea('duzada', id)}
          onAddItem={onAddItem as ((i: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>) | undefined} />
      )}
      {onUpdateItem && <ClaudeDerlemeKarti items={items} onUpdateItem={onUpdateItem} />}
      <MahalleDerlemeKarti items={items} onAc={id => onSelectArea('duzada', id)} />
      {onUpdateItem && onAddItem && (
        <MaddeSoruTuruKarti items={items} onUpdateItem={onUpdateItem}
          onAddItem={onAddItem as (i: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>} />
      )}

      {/* Boşlukları künyedeki cevaplarla doldur (yeni boşluk çıktıkça yine görünür) */}
      {onUpdateItem && (
        <KanonKarti
          items={items}
          onUpdateItem={onUpdateItem}
          hesapla={boslukDoldurma}
          baslik="boşluklar künyedeki cevaplarla dolacak"
          aciklama="Künyede cevabı yazılı olan boş alanlar dolar (tür, mahalle, yıllar, sahibi, sezon, simgeler, sakinler). Dolu alana ve tarihçe metnine dokunulmaz."
          yedekAdi="bosluk-oncesi"
        />
      )}

      {eksikler.length === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A]">
          <CircleCheck className="w-4 h-4 text-[#4A5E68] dark:text-[#A6B0C9] shrink-0" />
          <p className="text-[13px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Takip ettiğim boşluk kalmadı. Yeni bir şey eklediğinde burası
            kendiliğinden dolar.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {eksikler.map(e => {
            const acik = acikEksik === e.anahtar;
            const liste = e.kayitlar || [];
            return (
            <li key={e.anahtar} className={acik ? 'sm:col-span-2' : ''}>
              <button
                type="button"
                onClick={() => liste.length ? setAcikEksik(acik ? null : e.anahtar) : onSelectArea(e.alan, e.hedefId)}
                aria-expanded={liste.length ? acik : undefined}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] hover:border-[#F26B6F] dark:hover:border-[#F26B6F] transition-colors cursor-pointer group archive-shadow ${acik ? 'rounded-t-xl border-[#F26B6F] dark:border-[#F26B6F]' : 'rounded-xl'}`}
              >
                <span className="font-mono text-lg font-bold text-[#F26B6F] leading-none mt-0.5 shrink-0 tabular-nums">
                  {e.sayi}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">
                    {e.baslik}
                  </span>
                  <span className="block mt-0.5 text-[11px] text-[#6A5E4C] dark:text-[#95A1C2] leading-snug">
                    {e.aciklama}
                  </span>
                </span>
                {liste.length
                  ? <ChevronDown className={`w-3.5 h-3.5 mt-1 shrink-0 transition-transform ${acik ? 'rotate-180 text-[#F26B6F]' : 'text-[#6A5E4C] dark:text-[#95A1C2]'} group-hover:text-[#F26B6F]`} />
                  : <ArrowRight className="w-3.5 h-3.5 mt-1 shrink-0 text-[#6A5E4C] dark:text-[#95A1C2] group-hover:text-[#F26B6F] transition-colors" />}
              </button>
              {acik && (
                <div className="border border-t-0 border-[#F26B6F] rounded-b-xl bg-white/70 dark:bg-[#0E1C4F]/60 max-h-80 overflow-y-auto">
                  <ul className="divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
                    {liste.map((k, n) => (
                      <li key={(k.id || k.ad) + n} className="flex items-center">
                        <div className="flex-1 min-w-0">
                        {k.id ? (
                          <button
                            type="button"
                            onClick={() => onSelectArea(e.alan, k.id)}
                            className="w-full text-left flex items-baseline gap-3 px-4 py-2 hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer"
                          >
                            <span className="text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] shrink-0 max-w-[45%] truncate">{k.ad}</span>
                            <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] min-w-0 truncate flex-1">{k.not}</span>
                            <ArrowRight className="w-3 h-3 shrink-0 self-center text-[#F26B6F]" />
                          </button>
                        ) : (
                          <div className="flex items-baseline gap-3 px-4 py-2">
                            <span className="text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] shrink-0 max-w-[45%] truncate">{k.ad}</span>
                            <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] min-w-0 truncate">{k.not}</span>
                          </div>
                        )}
                        </div>
                        {k.cozum && (
                          <button
                            type="button"
                            disabled={!!cozuluyor}
                            onClick={() => void coz(k.cozum!, `${e.anahtar}:${n}`)}
                            className="shrink-0 mr-3 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:opacity-90 disabled:opacity-40 cursor-pointer"
                          >
                            {cozuluyor === `${e.anahtar}:${n}` ? '…' : cozumAdi(k.cozum)}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Eksikler;
