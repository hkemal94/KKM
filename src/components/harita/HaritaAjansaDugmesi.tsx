import React, { useRef, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { Item } from '../../types';
import type { HaritaDuzeni } from './duzenTipi';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { haritaDuzeniDosyasi, haritayiGonder } from '../../lib/haritaAjansa';
import { DUGME_BOS, IKINCIL, YAZI } from '../anasayfa/stil';

/**
 * Harita ve Kurucu → "Haritayı ajansa gönder" (4 Kasım, Kemal;
 * `lib/haritaAjansa.ts`). Kurucu düzeni ajansın gizli deposuna gider; KKM
 * kayıtlarına bir şey yazılmaz. Yalnız Kemal basınca; gönderim sürerken kilitli.
 */

type Durum = '' | 'gidiyor' | { adres: string } | { hata: string };

export const HaritaAjansaDugmesi: React.FC<{ duzen: HaritaDuzeni | null; items: Item[] }> = ({ duzen, items }) => {
  const [durum, setDurum] = useState<Durum>('');
  const kilit = useRef(false);
  const anahtar = anahtariOku();

  const gonder = async () => {
    if (!anahtar || !duzen || kilit.current) return;
    kilit.current = true;
    setDurum('gidiyor');
    try {
      setDurum({ adres: await haritayiGonder(anahtar, haritaDuzeniDosyasi(duzen, items)) });
    } catch (e) {
      setDurum({ hata: e instanceof Error ? e.message : String(e) });
    } finally { kilit.current = false; }
  };

  return (
    <>
      <button type="button" onClick={() => void gonder()} disabled={!anahtar || !duzen || durum === 'gidiyor'} className={DUGME_BOS}
        title={!anahtar ? "GitHub anahtarı yok: Ajanlar ve otomasyonlar → Ajans bağlantısı'nda girilir"
          : !duzen ? "Kurucu'da kayıtlı düzen yok" : "Kurucu'da yapılanları ajansa gönder; ajanlar haritayı okuyabilsin"}>
        <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Haritayı ajansa gönder'}
      </button>
      {typeof durum === 'object' && 'adres' in durum && (
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${YAZI}`}>
          Ajansa gitti.
          <a href={durum.adres} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 underline ${IKINCIL}`}>
            <ExternalLink className="w-3 h-3" /> Dosya
          </a>
        </span>
      )}
      {typeof durum === 'object' && 'hata' in durum && <span className={`text-[12px] ${YAZI}`}>Gönderilemedi: {durum.hata}</span>}
      {!anahtar && <span className={`text-[11px] ${IKINCIL}`}>Göndermek için bu tarayıcıda GitHub anahtarı gerekir (Ajanlar ve otomasyonlar → Ajans bağlantısı).</span>}
    </>
  );
};

export default HaritaAjansaDugmesi;
