import React, { useMemo, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { Item } from '../../types';
import { sinirliVikiDosyasi, vikiDosyasi, vikiMaddeleri, vikiyiGonder } from '../../lib/vikiAjansa';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Durum → Ajans → "Vikiyi ajansa gönder" (22 Ekim gece, `lib/vikiAjansa.ts`).
 * Viki Editörü vikiyi okuyabilsin diye maddeler ajansın gizli deposuna gider;
 * KKM kayıtlarına bir şey yazılmaz. Son gönderim zamanı yalnız bu ekranda durur.
 */

type Sonuc = { adres: string; zaman: string; sayi: number; kisaltildi: boolean };

export const VikiAjansaKarti: React.FC<{ items: Item[]; anahtar: string }> = ({ items, anahtar }) => {
  const sayi = useMemo(() => vikiMaddeleri(items).length, [items]);
  const [durum, setDurum] = useState<'' | 'gidiyor' | Sonuc | { hata: string }>('');

  const gonder = async () => {
    setDurum('gidiyor');
    try {
      const { dosya } = sinirliVikiDosyasi(vikiDosyasi(items));
      const adres = await vikiyiGonder(anahtar, dosya);
      setDurum({ adres, zaman: dosya.olusturuldu, sayi: dosya.sayi, kisaltildi: dosya.kisaltildi });
    } catch (e) {
      setDurum({ hata: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className={`${KART} px-4 py-4 space-y-3`}>
      <div>
        <div className={ETIKET}>Viki → ajans</div>
        <p className={`text-[13px] ${IKINCIL}`}>
          Vikide {sayi} madde var (arşivdekiler ve öneriler hariç). Gönderince ajansın Viki Editörü vikiyi okuyabilir.
          Görseller ve harita verisi gitmez; KKM kayıtlarına bir şey yazılmaz. Her basışta önceki dosyanın yerine yenisi yazılır.
        </p>
      </div>
      {typeof durum === 'object' && 'adres' in durum && (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[14px] ${YAZI}`}>
            Gönderildi: {durum.sayi} madde, {new Date(durum.zaman).toLocaleString('tr-TR')}.
            {durum.kisaltildi ? ' Dosya 1 MB\'ı geçtiği için en uzun metinler kısaltıldı.' : ''}
          </p>
          <a href={durum.adres} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Gönderilen dosya</a>
        </div>
      )}
      {typeof durum === 'object' && 'hata' in durum && <p className={`text-[13px] ${YAZI}`}>Gönderilemedi: {durum.hata}</p>}
      {!anahtar && <p className={`text-[13px] ${IKINCIL}`}>Önce ajans bağlantısını kur (yukarıdaki GitHub anahtarı).</p>}
      <button type="button" className={DUGME_LAC} disabled={!anahtar || durum === 'gidiyor'} onClick={() => void gonder()}>
        <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Vikiyi ajansa gönder'}
      </button>
    </section>
  );
};

export default VikiAjansaKarti;
