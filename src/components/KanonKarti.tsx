import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Item } from '../types';
import { useIslemOncesiYedek, yedekNotu } from './IslemOncesiYedek';

/**
 * Kanon kararları ve eski otel yazıları kartı (29 Eylül akşamı).
 * Sıra Temizlik kartıyla aynı: "Vikiye işle"ye basınca önce değişecek kayıtların
 * yedeği Drive'a yüklenir (26 Kasım), sonra yazılır; yüklenemezse değişiklik
 * yapılmaz. Yazılınca iş kalmaz, kart kendini gizler.
 */

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  /**
   * Aynı kart başka tek seferlik işler için de kullanılır (29 Eylül gece:
   * "Boşlukları künyeden doldur"). Verilmezse kanon kararları.
   */
  hesapla: (items: Item[]) => Array<{ item: Item; neler: string[] }>;
  baslik?: string;
  aciklama?: string;
  /** Yedeğin işlem adı (Drive'daki dosya adına girer): kkm-islem-oncesi-<ad>-….json */
  yedekAdi?: string;
}

const KANON_ACIKLAMA = 'Eskibey Ailesi, Yağ Fabrikası, Küçükkuyu Gençlerbirliği, Eylül Hanım (yalnız ad), Kemsköy adı, antik yerleşim, kesinleşen adlar; Ekim 2003 paragrafı, Liman 54 / Peron cümleleri ve Oda Yapısı bölümü silinir.';

export const KanonKarti: React.FC<Props> = ({
  items, onUpdateItem, hesapla,
  baslik = 'kanon kararların ve eski otel yazıları vikiye işlenecek',
  aciklama = KANON_ACIKLAMA, yedekAdi = 'kanon-oncesi'
}) => {
  const liste = useMemo(() => hesapla(items), [items, hesapla]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);
  const yedek = useIslemOncesiYedek(yedekAdi, 'değişiklik');

  const isle = async () => {
    setCalisiyor(true);
    setRapor(null);
    // Önce değişecek kayıtların yedeği Drive'a; olmazsa hiçbir şey yazılmaz
    const y = await yedek.al(() => ({
      uygulama: 'Kems Komuta Merkezi',
      tur: `${yedekAdi}-yedek`,
      tarih: new Date().toISOString(),
      items: items.filter(i => liste.some(l => l.item.id === i.id))
    }));
    if (!y) { setCalisiyor(false); return; }
    let n = 0;
    try {
      for (const d of liste) { await onUpdateItem(d.item); n++; }
      setRapor(`${n} madde güncellendi.${yedekNotu(y)}`);
    } catch (e) {
      setRapor(`${n} madde yazıldı, sonra hata: ${e instanceof Error ? e.message : 'bilinmeyen'}. Kalanlar için tekrar bas.`);
    } finally {
      setCalisiyor(false);
    }
  };

  if (!liste.length) {
    return rapor ? (
      <p className="mb-2.5 px-4 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{rapor}</p>
    ) : null;
  }

  return (
    <div className="mb-2.5 rounded-xl border border-[#F26B6F]/50 bg-[#FAF8F5] dark:bg-[#13204A] px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="font-mono text-lg font-bold text-[#D6484C] dark:text-[#F26B6F] leading-none mt-0.5 shrink-0 tabular-nums">{liste.length}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{baslik}</span>
          <span className="block mt-0.5 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-snug">{aciklama}</span>
        </span>
      </div>

      <button type="button" onClick={() => setAcik(a => !a)} className="mt-2 flex items-center gap-1 text-[11px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#D6484C] cursor-pointer">
        {acik ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {acik ? 'listeyi kapat' : 'neler değişecek?'}
      </button>
      {acik && (
        <ul className="mt-1 max-h-72 overflow-y-auto text-[11px] text-[#0E1C4F] dark:text-[#F3EFE8] divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]">
          {liste.map(d => (
            <li key={d.item.id} className="py-1.5">
              <b className="block">{d.item.title || d.item.id}</b>
              {d.neler.map((n, i) => <span key={i} className="block text-[#6A5E4C] dark:text-[#A6B0C9]">· {n}</span>)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={isle}
          disabled={calisiyor}
          className="px-3 py-1.5 text-[11px] font-mono rounded-lg bg-[#F26B6F] text-white hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          {calisiyor ? 'Yedekleniyor, yazılıyor…' : 'Vikiye işle'}
        </button>
        <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Önce yedek Drive'a kaydedilir.</span>
      </div>
      {yedek.uyari}
      {rapor && <p className="mt-2 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{rapor}</p>}
    </div>
  );
};

export default KanonKarti;
