import React, { useState } from 'react';
import { BookOpen, Check, RefreshCw, Send } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { istekEkle } from '../../lib/kemalIstekleri';
import { DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Marka kitabı kartı (14 Kasım, Kemal: görünüş taslağı "Evet, bu hâliyle yap").
 * "Kitabı güncelle" ajan düğmesinin yolunu aynen kullanır: ajansın deposundaki
 * `kkm/istekler.json`'a tek istek yazar (`lib/kemalIstekleri.ts`). KKM
 * kayıtlarına hiçbir şey yazılmaz; yalnız Kemal düğmeye basınca istek gider.
 * Haftalık pazartesi kontrolü ajansın işidir, burada kod yok.
 */
const ISTEK_METNI = "Marka kitabını ve PDF'ini marka kartlarının son hâline göre güncelle.";

export const MarkaKitabi: React.FC = () => {
  const [durum, setDurum] = useState<'bos' | 'gidiyor' | 'gitti'>('bos');
  const [hata, setHata] = useState<string | null>(null);
  const anahtar = anahtariOku();

  const gonder = async () => {
    if (!anahtar || durum !== 'bos') return;
    setDurum('gidiyor');
    setHata(null);
    try {
      await istekEkle(anahtar, { tur: 'istek', metin: ISTEK_METNI, ekran: 'Marka ve merch' });
      setDurum('gitti');
    } catch (e) {
      setHata(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}. Tekrar dene.`);
      setDurum('bos');
    }
  };

  return (
    <section className={`${KART} p-3`}>
      <div className="flex items-center gap-2.5">
        <BookOpen className="w-5 h-5 shrink-0 text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={ETIKET}>Marka kitabı</p>
          <p className={`text-[13px] font-semibold ${YAZI}`}>Canva'daki kitap ve PDF'i</p>
        </div>
        <button type="button" onClick={() => void gonder()} disabled={!anahtar || durum !== 'bos'} className={DUGME_LAC}>
          {durum === 'gitti'
            ? <><Check className="w-3.5 h-3.5" /> Gönderildi</>
            : <><RefreshCw className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Kitabı güncelle'}</>}
        </button>
      </div>
      <p className={`mt-2 text-[11px] leading-relaxed ${IKINCIL}`}>
        Ajans, marka kartlarındaki son hâle göre Canva'daki kitabı ve PDF'ini günceller. Her pazartesi sabah turunda Pinterest markalar panosu ve marka kartları da kontrol edilir.
      </p>
      {!anahtar && (
        <p className={`mt-2 text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; istek ajansa gidemez. Anahtar Ajanlar ve otomasyonlar → Ajans bağlantısı'nda bir kez girilir.</p>
      )}
      {durum === 'gitti' && (
        <p className={`mt-2.5 px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] flex gap-2 items-start ${YAZI}`}>
          <Send className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span><b className="font-semibold">İstek ajansa gitti;</b> kitap güncellenince Onay bekleyenler'e düşer.</span>
        </p>
      )}
      {hata && <p className={`mt-2.5 px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{hata}</p>}
    </section>
  );
};
