import React, { useState } from 'react';
import { ExternalLink, Send, X } from 'lucide-react';
import type { Item } from '../../types';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { ajansaGonder, oyunDosyasiMetni } from '../../lib/ajansaGonder';
import { AnahtarKarti } from './OyunAyarlari';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyun → Ajansa gönder (21 Ekim, `lib/ajansaGonder.ts`). Oyunun dosyası ve
 * Kemal'in notu Kems Ajans'ın deposuna gider; KKM kayıtlarına bir şey yazılmaz.
 */

const kutu = 'w-full text-[14px] bg-[#F3EFE8] dark:bg-[#0B132B] text-[#0E1C4F] dark:text-[#F3EFE8] rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-[#F26B6F]/50';

export const AjansaGonder: React.FC<{ items: Item[]; oyunId: string; oyunAdi: string; onKapat: () => void }> = ({ items, oyunId, oyunAdi, onKapat }) => {
  const [anahtar, setAnahtar] = useState(anahtariOku);
  const [not, setNot] = useState('');
  const [durum, setDurum] = useState<'' | 'gidiyor' | { adres: string } | { hata: string }>('');

  const gonder = async () => {
    setDurum('gidiyor');
    try {
      const adres = await ajansaGonder(anahtar, oyunAdi, oyunDosyasiMetni(items, oyunId, not));
      setDurum({ adres });
    } catch (e) {
      setDurum({ hata: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className={`${KART} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-[#D6484C] dark:text-[#F26B6F]" />
        <h3 className={`text-[15px] font-bold ${YAZI} flex-1`}>Ajansa gönder: {oyunAdi}</h3>
        <button type="button" onClick={onKapat} className={DUGME_BOS} aria-label="Kapat"><X className="w-3.5 h-3.5" /></button>
      </div>
      <p className={`text-[13px] ${IKINCIL}`}>
        Oyunun dosyası (PDF'teki bilgiler) ve notun Kems Ajans'a gider. Ajansın sabah planı onu görür ve oyun departmanına verir.
        KKM kayıtlarına bir şey yazılmaz.
      </p>
      {typeof durum === 'object' && 'adres' in durum ? (
        <div className="space-y-2">
          <p className={`text-[14px] ${YAZI}`}>Gönderildi. Ajans yarın sabahki planında görecek.</p>
          <a href={durum.adres} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Gönderilen dosya</a>
        </div>
      ) : (
        <>
          <AnahtarKarti anahtar={anahtar} onDegis={setAnahtar}
            baslik="Ajansa göndermek için GitHub anahtarı"
            depoNotu="Kems-Ajans deposu (oyuna da göndereceksen oyunun deposu da)" />
          <label className="block space-y-1">
            <span className={`text-[13px] font-semibold ${YAZI}`}>Ajansa not (isteğe bağlı)</span>
            <textarea value={not} onChange={e => setNot(e.target.value)} rows={4} className={kutu}
              placeholder="Ne istiyorsun? Örneğin: tasarım belgesini ve yol haritasını hazırlayın." />
          </label>
          {typeof durum === 'object' && 'hata' in durum && <p className={`text-[13px] ${YAZI}`}>Gönderilemedi: {durum.hata}</p>}
          <button type="button" className={DUGME_LAC} disabled={!anahtar || durum === 'gidiyor'} onClick={() => void gonder()}>
            <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Ajansa gönder'}
          </button>
        </>
      )}
    </section>
  );
};

export default AjansaGonder;
