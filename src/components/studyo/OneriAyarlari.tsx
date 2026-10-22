import React, { useEffect, useMemo, useState } from 'react';
import { Settings, X } from 'lucide-react';
import type { Item } from '../../types';
import { ONERI_KANALLARI, kanalAcikMi, kanalAyari, kanalAyariniYaz, type KanalAyari, type KanalKodu } from '../../lib/oneriKanallari';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Öneri ayarları (21 Ekim, Kemal: "Öneri kanalları açılır kapanır olabileceği
 * bir nokta olsun"). Her kanal bir anahtar. Seçimler "Kaydet"e basılınca
 * `kkm_ayar` kaydına yazılır; basılmadan hiçbir kayıt değişmez. Gece
 * hazırlığı kapalı kanalı çalıştırmaz.
 */

interface Props {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
}

/** Stüdyo sayfasının başındaki dişli düğmesi + açılan panel */
export const OneriAyarlari: React.FC<Props> = ({ items, onAddItem, onUpdateItem }) => {
  const [acik, setAcik] = useState(false);
  const kayitli = useMemo(() => kanalAyari(items), [items]);
  const [taslak, setTaslak] = useState<KanalAyari>(kayitli);
  const [yaziyor, setYaziyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  // Panel kapalıyken ya da kayıt dışarıdan değişince taslak kayıtlıya döner
  useEffect(() => { if (!acik) setTaslak(kayitli); }, [kayitli, acik]);

  const degisti = ONERI_KANALLARI.some(k => kanalAcikMi(taslak, k.id) !== kanalAcikMi(kayitli, k.id));
  const acikSayisi = ONERI_KANALLARI.filter(k => kanalAcikMi(kayitli, k.id)).length;

  const ac = (id: KanalKodu, deger: boolean) => { setTaslak(t => ({ ...t, [id]: deger })); setMesaj(null); };

  const kaydet = async () => {
    setYaziyor(true);
    try {
      const s = kanalAyariniYaz(items, taslak);
      if (s.guncel) await onUpdateItem(s.guncel);
      if (s.yeni) await onAddItem(s.yeni);
      setMesaj('Kaydedildi. Bu geceki hazırlık yeni seçimlere göre yapılır.');
    } catch {
      setMesaj('Kaydedilemedi. Bağlantıyı kontrol edip yeniden dene.');
    } finally { setYaziyor(false); }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        className={`${DUGME_BOS} gap-1.5`}
      >
        <Settings className="w-3.5 h-3.5 text-[#F26B6F]" /> Öneri ayarları
        <span className={`font-mono text-[10px] ${IKINCIL}`}>{acikSayisi}/{ONERI_KANALLARI.length} açık</span>
      </button>

      {acik && (
        <section className={`${KART} p-4 mt-2 space-y-3`}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className={ETIKET}>Öneri kanalları</div>
              <p className={`mt-1 text-[12px] leading-snug ${IKINCIL}`}>
                Kapattığın kanaldan gece öneri gelmez. Günün üç önerisinin çoğu vikiye gider; viki kanalları açıksa öncelik onlardadır.
                Hiçbir öneri sen "Ekle" demeden kayda yazılmaz.
              </p>
            </div>
            <button type="button" onClick={() => setAcik(false)} title="Kapat" className={`w-9 h-9 rounded-full flex items-center justify-center ${IKINCIL} hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer`}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <ul className="divide-y divide-[#CFC5B4]/70 dark:divide-[#2C3C72]">
            {ONERI_KANALLARI.map(k => {
              const a = kanalAcikMi(taslak, k.id);
              return (
                <li key={k.id} className="flex items-start gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-semibold ${YAZI}`}>{k.ad}</div>
                    <p className={`text-[11px] leading-snug ${IKINCIL}`}>{k.aciklama}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a}
                    aria-label={`${k.ad} ${a ? 'açık' : 'kapalı'}`}
                    onClick={() => ac(k.id, !a)}
                    className={`shrink-0 mt-0.5 relative w-11 h-6 rounded-full transition-colors cursor-pointer ${a ? 'bg-[#0E1C4F] dark:bg-[#2C3C72]' : 'bg-[#CFC5B4] dark:bg-[#17345A]'}`}
                  >
                    <i className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[#F3EFE8] transition-transform ${a ? 'translate-x-5' : ''}`} />
                  </button>
                  <span className={`shrink-0 w-10 mt-1 text-[10px] font-mono ${IKINCIL}`}>{a ? 'açık' : 'kapalı'}</span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!degisti || yaziyor} onClick={kaydet} className={DUGME_LAC}>{yaziyor ? 'Kaydediliyor…' : 'Kaydet'}</button>
            {degisti && <button type="button" onClick={() => setTaslak(kayitli)} className={DUGME_BOS}>Vazgeç</button>}
            {mesaj && <span className={`text-[11px] ${IKINCIL}`}>{mesaj}</span>}
            {!degisti && !mesaj && <span className={`text-[11px] ${IKINCIL}`}>Değişiklik yok.</span>}
          </div>
        </section>
      )}
    </div>
  );
};

export default OneriAyarlari;
