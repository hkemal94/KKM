import React, { useEffect, useState } from 'react';
import { ExternalLink, Gamepad2 } from 'lucide-react';
import { durumOzetiniOku, oyunKimliginiOku, type DurumOzeti as Ozet, type OyunKimligi } from '../../lib/oyunKimligi';
import { DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyun sayfasının başındaki durum özeti (11 Kasım, Kemal: "benim de işime
 * yaramalı"). Sayfa açılınca on saniyede: kapak, son güncelleme, neredeyiz,
 * sırada ne var, Kemal'den ne bekleniyor, oyunu aç. Hepsi oyunun deposundan
 * okunur (`lib/oyunKimligi.ts`); okunamayan bölüm görünmez.
 */

/** Oyunun kapağı: depodaki `kapak` işaretli ekran görüntüsü; yoksa yedek görsel, o da yoksa simge */
export const OyunKapagi: React.FC<{ depo?: string; yedek?: string; className: string }> = ({ depo, yedek, className }) => {
  const [kimlik, setKimlik] = useState<OyunKimligi | null>(null);
  const [kirik, setKirik] = useState(false);
  useEffect(() => {
    let iptal = false;
    if (depo) void oyunKimliginiOku(depo).then(k => { if (!iptal) setKimlik(k); });
    return () => { iptal = true; };
  }, [depo]);
  const kaynak = (!kirik && kimlik?.kapak) || yedek;
  return kaynak
    ? <img src={kaynak} alt="" className={`${className} object-cover`} onError={() => setKirik(true)} />
    : <span className={`${className} bg-[#0E1C4F] dark:bg-[#2C3C72] flex items-center justify-center`}><Gamepad2 className="w-8 h-8 text-[#F26B6F]" /></span>;
};

const Liste: React.FC<{ baslik: string; maddeler: string[] }> = ({ baslik, maddeler }) => maddeler.length ? (
  <div className="min-w-0">
    <div className={`text-[12px] font-bold uppercase tracking-[0.14em] ${IKINCIL}`}>{baslik}</div>
    <ul className="mt-1 space-y-1">
      {maddeler.map((m, i) => <li key={i} className={`text-[13px] leading-snug ${YAZI}`}>· {m}</li>)}
    </ul>
  </div>
) : null;

export const DurumOzeti: React.FC<{ depo: string }> = ({ depo }) => {
  const [ozet, setOzet] = useState<Ozet | null | undefined>(undefined);
  const [kimlik, setKimlik] = useState<OyunKimligi>({});
  useEffect(() => {
    let iptal = false;
    setOzet(undefined);
    void durumOzetiniOku(depo).then(o => { if (!iptal) setOzet(o); });
    void oyunKimliginiOku(depo).then(k => { if (!iptal) setKimlik(k); });
    return () => { iptal = true; };
  }, [depo]);

  if (ozet === undefined) return <section className={`${KART} p-4 text-[13px] ${IKINCIL}`}>Durum özeti oyunun deposundan okunuyor…</section>;
  const bos = !ozet || (!ozet.neredeyiz.length && !ozet.siradaki.length && !ozet.bekleyen.length);
  if (bos && !kimlik.oyunAdresi) return null;

  return (
    <section className={`${KART} p-4 space-y-3`}>
      <div className="flex items-center gap-3">
        <OyunKapagi depo={depo} className="w-16 h-16 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <div className={`text-[12px] font-bold uppercase tracking-[0.16em] ${IKINCIL}`}>Durum özeti</div>
          {ozet?.guncelleme && <div className={`text-[13px] ${IKINCIL}`}>Son güncelleme: <b className={YAZI}>{ozet.guncelleme}</b></div>}
        </div>
        {kimlik.oyunAdresi && (
          <a href={kimlik.oyunAdresi} target="_blank" rel="noreferrer" className={DUGME_LAC}><ExternalLink className="w-3.5 h-3.5" /> Oyunu aç</a>
        )}
      </div>
      {ozet && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Liste baslik="Neredeyiz" maddeler={ozet.neredeyiz} />
          <Liste baslik="Sırada" maddeler={ozet.siradaki} />
          <Liste baslik="Senden beklenen" maddeler={ozet.bekleyen} />
        </div>
      )}
    </section>
  );
};

export default DurumOzeti;
