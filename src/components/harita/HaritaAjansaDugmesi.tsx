import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import type { Item } from '../../types';
import type { HaritaDuzeni } from './duzenTipi';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { haritaDuzeniDosyasi, haritayiGonder, sonGonderim } from '../../lib/haritaAjansa';
import { DUGME_BOS, IKINCIL, YAZI } from '../anasayfa/stil';

/**
 * Harita ve Kurucu → "Haritayı ajansa gönder" (4 Kasım, Kemal;
 * `lib/haritaAjansa.ts`). Kurucu düzeni ajansın gizli deposuna gider; KKM
 * kayıtlarına bir şey yazılmaz. Yalnız Kemal basınca; gönderim sürerken kilitli.
 *
 * "Ajansa son gönderim" (4 Kasım akşamı): ajans deposundaki dosyanın son
 * değiştiği an okunur (yalnız okuma); okunamazsa bu tarayıcıdaki son gönderim.
 */

type Durum = '' | 'gidiyor' | { adres: string; parca: number } | { hata: string };

/** Bu tarayıcıda son gönderimin anı (yalnız görünüm; kayda yazılmaz) */
const YEREL = 'kkm_harita_ajansa_son';
const yerelOku = (): Date | null => {
  try { const t = localStorage.getItem(YEREL); return t ? new Date(t) : null; } catch { return null; }
};

const tarihSaat = (t: Date) => t.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export const HaritaAjansaDugmesi: React.FC<{ duzen: HaritaDuzeni | null; items: Item[] }> = ({ duzen, items }) => {
  const [durum, setDurum] = useState<Durum>('');
  const [son, setSon] = useState<Date | null>(yerelOku);
  const kilit = useRef(false);
  const anahtar = anahtariOku();

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    sonGonderim(anahtar)
      .then(t => { if (!iptal && t) setSon(o => (o && o > t ? o : t)); })
      .catch(() => { /* okunamazsa yerel bilgi kalır */ });
    return () => { iptal = true; };
  }, [anahtar]);

  const gonder = async () => {
    if (!anahtar || !duzen || kilit.current) return;
    kilit.current = true;
    setDurum('gidiyor');
    try {
      const sonuc = await haritayiGonder(anahtar, haritaDuzeniDosyasi(duzen, items));
      const simdi = new Date();
      try { localStorage.setItem(YEREL, simdi.toISOString()); } catch { /* yok */ }
      setSon(simdi);
      setDurum(sonuc);
    } catch (e) {
      setDurum({ hata: e instanceof Error ? e.message : String(e) });
    } finally { kilit.current = false; }
  };

  return (
    <>
      <button type="button" onClick={() => void gonder()} disabled={!anahtar || !duzen || durum === 'gidiyor'} className={DUGME_BOS}
        title={!anahtar ? "GitHub anahtarı yok: Ajanlar ve otomasyonlar → Ajans bağlantısı'nda girilir"
          : !duzen ? "Kurucu'da kayıtlı düzen yok" : "Kurucu'da yapılanları, notları ve madde işaretlerini ajansa gönder; ajanlar haritayı okuyabilsin"}>
        <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Haritayı ajansa gönder'}
      </button>
      {typeof durum === 'object' && 'adres' in durum && (
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${YAZI}`}>
          Ajansa gitti{durum.parca > 1 ? ` (büyük olduğu için ${durum.parca} dosyaya bölündü)` : ''}.
          <a href={durum.adres} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 underline ${IKINCIL}`}>
            <ExternalLink className="w-3 h-3" /> Dosya
          </a>
        </span>
      )}
      {typeof durum === 'object' && 'hata' in durum && <span className={`text-[12px] ${YAZI}`}>Gönderilemedi: {durum.hata}</span>}
      {son && durum !== 'gidiyor' && <span className={`text-[11px] ${IKINCIL}`}>Ajansa son gönderim: {tarihSaat(son)}</span>}
      {!anahtar && <span className={`text-[11px] ${IKINCIL}`}>Göndermek için bu tarayıcıda GitHub anahtarı gerekir (Ajanlar ve otomasyonlar → Ajans bağlantısı).</span>}
    </>
  );
};

export default HaritaAjansaDugmesi;
