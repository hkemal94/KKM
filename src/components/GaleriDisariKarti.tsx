import React, { useMemo, useState } from 'react';
import { ImageDown } from 'lucide-react';
import type { Item } from '../types';
import { gocIsleri, gocOzeti, kbYaz } from '../lib/galeriGocu';
import { galeriyiTasi, gocRaporuYaz } from '../lib/galeriGocuCalistir';

/**
 * Galeri görsellerini kayıtların dışına taşı (21 Ekim, paket K;
 * `lib/galeriGocu.ts`). Görseller kayıtlardan çıkıp ayrı belgelere geçer;
 * kayıtlar küçülür, etiket ya da bağ değişince görsel yeniden yazılmaz.
 * Yalnız iş varken görünür; Kemal basınca çalışır.
 */
export const GaleriDisariKarti: React.FC<{ items: Item[]; onUpdateItem: (item: Item) => Promise<void> }> = ({ items, onUpdateItem }) => {
  const isler = useMemo(() => gocIsleri(items), [items]);
  const ozet = useMemo(() => gocOzeti(isler), [isler]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [ilerleme, setIlerleme] = useState('');
  const [rapor, setRapor] = useState<string | null>(null);
  const [durdu, setDurdu] = useState(false);

  const tasi = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    setRapor(null);
    try {
      const r = await galeriyiTasi(items, onUpdateItem, (y, t) => setIlerleme(`${y + 1} / ${t}`));
      setDurdu(!!r.durdu);
      setRapor(gocRaporuYaz(r));
    } finally {
      setCalisiyor(false);
      setIlerleme('');
    }
  };

  // Kural yayımlanmamışsa iş duruyor: kart kalır, sebebi söyler
  if (!isler.length && !calisiyor) {
    return rapor ? <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p> : null;
  }

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <ImageDown className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Galeri görsellerini kayıtların dışına taşı</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            {ozet.gorsel} görsel ({ozet.kayit} kayıt) ayrı belgelere geçer; kayıtlar yaklaşık {kbYaz(ozet.kazanilanBayt)} küçülür.
            Önce görseller yazılıp doğrulanır, sonra kayıt güncellenir; yarıda kesilirse hiçbir şey kaybolmaz.
            Galeride görünen hiçbir şey değişmez. Bunun için önce <span className="font-mono">firestore.rules</span> dosyasının
            yayımlanmış olması gerekir.
          </p>
          {rapor && <p className={`mt-1.5 text-[12px] ${durdu ? 'text-[#D6484C] dark:text-[#F26B6F] font-semibold' : 'text-[#336659] dark:text-[#8FC4A8]'}`}>{rapor}</p>}
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void tasi()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? `Taşınıyor… ${ilerleme}` : 'Taşı'}
        </button>
      </div>
    </div>
  );
};

export default GaleriDisariKarti;
