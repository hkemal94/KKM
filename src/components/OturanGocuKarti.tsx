import React, { useEffect, useMemo, useState } from 'react';
import { KisaListe } from './kabuk/KisaListe';
import { House } from 'lucide-react';
import type { Item } from '../types';
import { buluttakiHaritaKaydi, haritaKaydiniCoz } from '../lib/haritaDuzeni';
import { oturanGocu } from '../lib/oturanGocu';

/** Eski harita kaydındaki ev → kişi bağları (Kurucu taslağının `oturanlar`'ı); kayıt yoksa boş */
async function kayittanOku(): Promise<Record<string, string[]>> {
  const d = haritaKaydiniCoz(await buluttakiHaritaKaydi());
  // Taslak işlenenle aynıysa kayıtta yalnız işlenen durur (lib/evSakinleri.ts → oturanlariOku ile aynı)
  return (d?.kurucu ?? d?.kurucuIslenen)?.oturanlar ?? {};
}

/**
 * "Evde oturanları tek haritaya taşı" (tek harita 11. adım, KKM-A; Kemal,
 * 23 Kasım). Durum → Eksikler. Tek seferlik göç (`lib/oturanGocu.ts`).
 *
 * Sayfa açılınca eski harita kaydı yalnız okunur; yazılacak bir şey varsa
 * kart görünür. "Taşı" kişilerin maddesine evlerini yazar (her kişi bir
 * yazma). Eski kayıt olduğu gibi kalır. İkinci basışta iş kalmadığı için kart
 * kendini gizler.
 */
export const OturanGocuKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  /** Deneme sayfası için: eski kaydı okuyan iş (verilmezse buluttaki harita kaydı) */
  oku?: () => Promise<Record<string, string[]>>;
}> = ({ items, onUpdateItem, oku = kayittanOku }) => {
  const [oturanlar, setOturanlar] = useState<Record<string, string[]> | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);
  useEffect(() => {
    let iptal = false;
    oku().then(o => { if (!iptal) setOturanlar(o); }).catch(() => { if (!iptal) setOturanlar({}); });
    return () => { iptal = true; };
  }, [oku]);
  const gocu = useMemo(() => (oturanlar ? oturanGocu(items, oturanlar) : null), [items, oturanlar]);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!gocu || !gocu.yazilacak.length) return null;

  const tasi = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    // Basış anındaki hâl yeniden hesaplanır: aynı anda başka sekmede taşındıysa tekrar yazılmaz
    const { yazilacak } = oturanGocu(items, oturanlar ?? {});
    let tamam = 0;
    const hatalar: string[] = [];
    try {
      for (const { kisi } of yazilacak) {
        try { await onUpdateItem(kisi); tamam++; } catch { hatalar.push(kisi.title || kisi.id); }
      }
      setRapor(`${tamam} kişinin evi tek haritaya taşındı.${hatalar.length ? ` Yazılamayan: ${hatalar.join(', ')}.` : ''} Tek haritada evin kartında "Oturanlar" satırında görünür.`);
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <House className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Evde oturanları tek haritaya taşı: {gocu.yazilacak.length} kişi</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Kimin hangi evde oturduğu yalnız eski haritanın kaydında duruyor. "Taşı" bunu kişinin kendi maddesine yazar;
            tek haritada evin kartı oturanları gösterir. Evler tek haritada aynı. Eski kayda dokunulmaz. Tek seferlik.
          </p>
          <KisaListe className="mt-1.5 list-disc pl-5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
            {gocu.yazilacak.map(y => <li key={y.kisi.id}>{y.kisi.title || y.kisi.id} · ev {y.evId}</li>)}
          </KisaListe>
          {gocu.atlanan.length > 0 && (
            <p className="mt-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
              Taşınmayacak: {gocu.atlanan.map(a => `${a.ad} (${a.neden})`).join(' · ')}
            </p>
          )}
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void tasi()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Taşınıyor…' : 'Taşı'}
        </button>
      </div>
    </div>
  );
};

export default OturanGocuKarti;
