import React, { useMemo, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { Item } from '../../types';
import { tepsiDosyasi, tepsiyiGonder } from '../../lib/tepsiAjansa';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Durum → Ajans → "Tepsiyi ajansa gönder" (22 Ekim, `lib/tepsiAjansa.ts`).
 * Öneri tepsisi ve günün soruları ajansın gizli deposuna gider; KKM
 * kayıtlarına bir şey yazılmaz.
 */

export const TepsiAjansaKarti: React.FC<{ items: Item[]; anahtar: string }> = ({ items, anahtar }) => {
  const sayilar = useMemo(() => tepsiDosyasi(items).sayilar, [items]);
  const [durum, setDurum] = useState<'' | 'gidiyor' | { adres: string } | { hata: string }>('');

  const gonder = async () => {
    setDurum('gidiyor');
    try {
      setDurum({ adres: await tepsiyiGonder(anahtar, tepsiDosyasi(items)) });
    } catch (e) {
      setDurum({ hata: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className={`${KART} px-4 py-4 space-y-3`}>
      <div>
        <div className={ETIKET}>Öneri tepsisi → ajans</div>
        <p className={`text-[13px] ${IKINCIL}`}>
          Tepside {sayilar.oneri} öneri{sayilar.eski ? `, ${sayilar.eski} eski öneri` : ''} ve {sayilar.soru} soru var.
          Gönderince ajans geceleri okur: mantıksızları eler, basitleri hazırlar, sana sorulacakları panodaki kutusuna alır.
          KKM kayıtlarına bir şey yazılmaz; tepsi olduğu gibi kalır.
        </p>
      </div>
      {typeof durum === 'object' && 'adres' in durum && (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[14px] ${YAZI}`}>Gönderildi. Ajans bu geceki turunda işler.</p>
          <a href={durum.adres} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Gönderilen dosya</a>
        </div>
      )}
      {typeof durum === 'object' && 'hata' in durum && <p className={`text-[13px] ${YAZI}`}>Gönderilemedi: {durum.hata}</p>}
      <button type="button" className={DUGME_LAC} disabled={!anahtar || durum === 'gidiyor'} onClick={() => void gonder()}>
        <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Tepsiyi ajansa gönder'}
      </button>
    </section>
  );
};

export default TepsiAjansaKarti;
