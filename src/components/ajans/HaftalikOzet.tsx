import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { bitisZamani, isleriOku, sonGunlerde, type AjansIsi } from '../../lib/isler';
import { ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * İşler ve takvim → "Bu hafta" kartı (3 Kasım, Kemal: "pazartesi sabahı
 * haftalık özet"). Yalnız pazartesi (yerel saat) görünür. Ajansın iş
 * dosyasından okunur, kayda hiçbir şey yazmaz. "Kapat" yalnız o hafta için
 * bu tarayıcıda saklanır (kayıt değil).
 */
const KAPALI_ANAHTARI = 'kkm_haftalik_ozet_kapali';

/** Bugünün yerel tarihi ("2026-11-02"); kart haftanın pazartesisine bağlanır */
const yerelTarih = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const HaftalikOzet: React.FC = () => {
  const anahtar = anahtariOku();
  const bugun = new Date();
  const pazartesi = bugun.getDay() === 1;
  const hafta = yerelTarih(bugun);
  const [kapali, setKapali] = useState(() => {
    try { return localStorage.getItem(KAPALI_ANAHTARI) === hafta; } catch { return false; }
  });
  const [isler, setIsler] = useState<AjansIsi[] | null>(null);

  useEffect(() => {
    if (!anahtar || !pazartesi || kapali) return;
    let iptal = false;
    isleriOku(anahtar).then(d => { if (!iptal) setIsler(d?.isler || []); }).catch(() => { if (!iptal) setIsler(null); });
    return () => { iptal = true; };
  }, [anahtar, pazartesi, kapali]);

  if (!anahtar || !pazartesi || kapali || !isler) return null;

  const biten = isler.filter(i => i.durum === 'bitti' && sonGunlerde(i.bitti || i.guncellendi, 7)).sort((a, b) => bitisZamani(b) - bitisZamani(a));
  const acik = isler.filter(i => i.durum !== 'bitti');
  const sende = acik.filter(i => i.kimde === 'Kemal');

  const kapat = () => {
    try { localStorage.setItem(KAPALI_ANAHTARI, hafta); } catch { /* tarayıcı saklamıyorsa yalnız bu açılışta kapanır */ }
    setKapali(true);
  };

  const liste = (l: AjansIsi[]) => (
    <ul className={`mt-1 space-y-0.5 text-[12px] leading-snug ${YAZI}`}>
      {l.map(i => <li key={i.id} className="line-clamp-2">· {i.metin}</li>)}
    </ul>
  );

  return (
    <section className={`${KART} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <p className={`flex-1 text-[13px] font-semibold ${YAZI}`}>Bu hafta</p>
        <button type="button" onClick={kapat} aria-label="Bu hafta için kapat" title="Bu hafta için kapat" className={`p-1.5 rounded-lg cursor-pointer ${IKINCIL} hover:text-[#F26B6F]`}><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Geçen 7 günde biten', biten.length], ['Açık iş', acik.length], ['Senden beklenen', sende.length]].map(([ad, n]) => (
          <div key={ad} className="rounded-xl bg-[#F3EFE8] dark:bg-[#17345A] px-2 py-2">
            <div className={`text-[18px] font-bold leading-none ${YAZI}`}>{n}</div>
            <div className={`mt-1 text-[10px] ${IKINCIL}`}>{ad}</div>
          </div>
        ))}
      </div>
      {biten.length > 0 && <div><div className={ETIKET}>Geçen 7 günde bitenler</div>{liste(biten)}</div>}
      {sende.length > 0 && <div><div className={ETIKET}>Senden beklenenler</div>{liste(sende)}</div>}
    </section>
  );
};

export default HaftalikOzet;
