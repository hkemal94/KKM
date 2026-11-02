import React, { useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { ekranAjanlari } from '../../lib/ajanlar';
import { kimdeAdi } from '../../lib/isler';
import { istekEkle } from '../../lib/kemalIstekleri';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Ajan düğmesi (2 Kasım, yol haritası 7. adım; Kemal, Tur 6: "tuş + kendi
 * cümlem; zorlanmamak için hazır örnekler görünsün; sonuç Onay ekranına
 * düşsün"). İçerik, Viki, Marka ve merch, Oyunlar, Harita ve Kurucu'nun
 * başında. İstek ajansın deposuna yazılır (`lib/kemalIstekleri.ts`); Kems
 * ilgili ajana verir, çıktı ön elemeden sonra Onay bekleyenler'e gelir.
 * Hiçbir kayıt değişmez; ajan kendi başına yayınlamaz.
 */
const ORNEKLER: Record<string, string[]> = {
  'İçerik': ['Bu hafta için 3 Instagram gönderisi fikri hazırla', "Eylül'ün son videosu için başlık ve kapak yazısı adayları", 'Bu ayın fanzini için bölüm planı çıkar'],
  'Viki': ['Boş künye alanları için aday cevaplar getir', 'Şu maddeyi kanonla karşılaştır, çelişkileri listele: ', 'Ayvacık ve Bozcaada gerçek bilgisiyle şu maddeyi doğrula: '],
  'Marka ve merch': ['Kış dropu için kök kuralına uyan 5 aday fikir', 'Şu fikir için Canva mockup taslağı hazırla: ', 'Drop için moodboard notu çıkar'],
  'Oyunlar': ['DK Lite için bir sonraki bölümün mekanik önerisi', 'Oyun depolarının derlemesini kontrol et, hataları listele', 'Şu oyun için asset istem listesi: '],
  'Harita ve Kurucu': ['Şu kişi şu mahallede oturur, ev ve sokak öner: ', 'Haritadaki boş arsaları künyeyle karşılaştır', 'Cadde adları için aday liste (karar benim)']
};

export const AjanDugmesi: React.FC<{ ekran: string }> = ({ ekran }) => {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState('');
  const [ajan, setAjan] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const anahtar = anahtariOku();
  const ajanlar = ekranAjanlari(ekran);

  const gonder = async () => {
    if (!anahtar) return;
    setGonderiliyor(true);
    setMesaj(null);
    try {
      await istekEkle(anahtar, { tur: 'istek', metin, ekran, ...(ajan ? { ajan } : {}) });
      setMetin('');
      setMesaj(`Gönderildi. ${ajan ? kimdeAdi(ajan) : 'Kems uygun ajanı seçip'} işe alır; sonuç Onay bekleyenler'e düşer. Kems sen bir oturum açınca (ya da zamanlayıcı açıksa gece) okur.`);
    } catch (e) {
      setMesaj(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}. Tekrar dene.`);
    } finally { setGonderiliyor(false); }
  };

  if (!acik) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={() => { setAcik(true); setMesaj(null); }} className={DUGME_BOS} title={`${ekran} için ajana iş ver`}>
          <Bot className="w-3.5 h-3.5" /> Ajana yaptır
        </button>
      </div>
    );
  }

  return (
    <section className={`${KART} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-[#F26B6F]" />
        <p className={`flex-1 text-[13px] font-semibold ${YAZI}`}>Ajana yaptır · {ekran}</p>
        <button type="button" onClick={() => setAcik(false)} aria-label="Kapat" className={`p-1.5 rounded-lg cursor-pointer ${IKINCIL} hover:text-[#F26B6F]`}><X className="w-4 h-4" /></button>
      </div>
      {!anahtar ? (
        <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; istek ajansa gidemez. Anahtar Ajanlar ve otomasyonlar → Ajans bağlantısı'nda bir kez girilir.</p>
      ) : (<>
        <div className="flex flex-wrap gap-1.5">
          {(ORNEKLER[ekran] || []).map(o => (
            <button key={o} type="button" onClick={() => setMetin(o)}
              className="min-h-9 px-2.5 rounded-full text-[11px] text-left border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#F26B6F] cursor-pointer">
              {o}
            </button>
          ))}
        </div>
        <textarea rows={3} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Kendi cümlenle yaz; örneğe basınca buraya gelir, düzenleyebilirsin."
          className={`w-full text-[13px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg p-2 focus:outline-hidden focus:border-[#F26B6F]`} />
        <div className="flex flex-wrap items-center gap-2">
          {ajanlar.length > 0 && (
            <select value={ajan} onChange={e => setAjan(e.target.value)} aria-label="Hangi ajan"
              className={`min-h-9 px-2 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`}>
              <option value="">Kems seçsin</option>
              {ajanlar.map(a => <option key={a} value={a}>{kimdeAdi(a)}</option>)}
            </select>
          )}
          <button type="button" disabled={gonderiliyor || !metin.trim()} onClick={() => void gonder()} className={`${DUGME_LAC} ml-auto`}>
            <Send className="w-3.5 h-3.5" /> {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </div>
        <p className={`text-[11px] ${IKINCIL}`}>Ajan yalnız taslak hazırlar; ad, kurgu ve yayın kararı senin.</p>
      </>)}
      {mesaj && <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{mesaj}</p>}
    </section>
  );
};
