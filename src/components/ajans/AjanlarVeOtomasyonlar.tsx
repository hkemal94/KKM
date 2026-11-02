import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Power, RefreshCw, Save } from 'lucide-react';
import type { Item } from '../../types';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { isleriOku, type IsDosyasi } from '../../lib/isler';
import {
  ajanlariOku, GUNLER, KEMS, varsayilanZaman, zamanlayiciOku, zamanlayiciYaz, zamanOzeti,
  type AjanBilgisi, type AjanZamani, type GunKodu
} from '../../lib/ajanlar';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { SayfaRayi } from '../SayfaRayi';
import { AjansSayfasi } from '../anasayfa/AjansSayfasi';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';

/**
 * Ajans → Ajanlar ve otomasyonlar (2 Kasım, yol haritası 4. adım; Kemal'in
 * yerleşimi, Tur 9). Üç bölüm:
 *   - Ajanlar: her ajanın kartı (ne yapar, hangi ekran, şu an elinde ne var,
 *     son işi, ne zaman çalışır, aç / kapat). Limit uyarısını Kems yazar.
 *   - Zamanlayıcı: alarm gibi; her gün, haftanın günleri ya da tek tarih.
 *     "Kaydet" ayarı ajansın deposuna yazar (`lib/ajanlar.ts`). Ayar kendi
 *     başına bir şey çalıştırmaz; Kemal "başla" deyince Kems kurar.
 *   - Ajans bağlantısı: eski Durum → Ajans (anahtar, tepsi, viki, dosyalar).
 * KKM kayıtlarına hiçbir şey yazılmaz.
 */
export type AjanlarSekmesi = 'ajanlar' | 'zamanlayici' | 'baglanti';

interface Props {
  items: Item[];
  sekme: AjanlarSekmesi;
  onSekme: (s: AjanlarSekmesi) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

const BOLUMLER = [
  { id: 'ajanlar', label: 'Ajanlar' },
  { id: 'zamanlayici', label: 'Zamanlayıcı' },
  { id: 'baglanti', label: 'Ajans bağlantısı' }
];

const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e));
const GIRDI = `min-h-9 px-2 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`;
const cip = (on: boolean) => `min-h-9 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer ${on ? 'bg-[#F26B6F] border-transparent text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`;

export const AjanlarVeOtomasyonlar: React.FC<Props> = ({ items, sekme, onSekme, onUpdateItem, onDeleteItem }) => {
  const anahtar = anahtariOku();
  const [tur, setTur] = useState(0);
  const [ajanlar, setAjanlar] = useState<AjanBilgisi[] | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [isler, setIsler] = useState<IsDosyasi | null>(null);
  /** Kayıtlı ayar ve ekrandaki taslak */
  const [kayitli, setKayitli] = useState<Record<string, AjanZamani>>({});
  const [taslak, setTaslak] = useState<Record<string, AjanZamani>>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    setAjanlar('yukleniyor');
    Promise.all([ajanlariOku(anahtar), zamanlayiciOku(anahtar), isleriOku(anahtar).catch(() => null)])
      .then(([a, z, i]) => {
        if (iptal) return;
        setAjanlar(a);
        setKayitli(z.ajanlar);
        setTaslak(z.ajanlar);
        setIsler(i);
      })
      .catch(e => { if (!iptal) setAjanlar({ hata: hataYazi(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);

  const zaman = (ad: string) => taslak[ad] ?? varsayilanZaman(ad);
  const degistir = (ad: string, d: Partial<AjanZamani>) => setTaslak(t => ({ ...t, [ad]: { ...(t[ad] ?? varsayilanZaman(ad)), ...d } }));
  const degisti = useMemo(() => JSON.stringify(taslak) !== JSON.stringify(kayitli), [taslak, kayitli]);

  const kaydet = async () => {
    if (!anahtar || !Array.isArray(ajanlar)) return;
    setKaydediliyor(true);
    setMesaj(null);
    try {
      const hepsi = Object.fromEntries(ajanlar.map(a => [a.ad, zaman(a.ad)]));
      await zamanlayiciYaz(anahtar, hepsi);
      setKayitli(hepsi);
      setTaslak(hepsi);
      setMesaj('Kaydedildi. Ayar ajansın deposunda; sen "başla" deyince Kems zamanlı görevleri buna göre kurar.');
    } catch (e) {
      setMesaj(`Kaydedilemedi: ${hataYazi(e)}`);
    } finally { setKaydediliyor(false); }
  };

  const elinde = (ad: string) => (isler?.isler || []).filter(i => i.kimde === ad && i.durum !== 'bitti');
  const sonIs = (ad: string) => (isler?.isler || []).filter(i => i.kimde === ad && i.durum === 'bitti')
    .sort((a, b) => (b.bitti || b.guncellendi || '').localeCompare(a.bitti || a.guncellendi || ''))[0];

  const kart = (a: AjanBilgisi, kems = false) => {
    const z = zaman(a.ad);
    const el = elinde(a.ad);
    const son = sonIs(a.ad);
    return (
      <article key={a.ad} className={`${KART} p-4 flex flex-col gap-2`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`text-[14px] font-bold leading-tight ${YAZI}`}>{a.baslik}</h3>
            <p className={`text-[11px] ${IKINCIL}`}>{a.hat} · {a.ekran} · model {a.model}</p>
          </div>
          {!kems && (
            <button type="button" onClick={() => degistir(a.ad, { acik: !z.acik })} aria-pressed={z.acik}
              title={z.acik ? 'Zamanlayıcıda açık · basınca kapanır' : 'Zamanlayıcıda kapalı · basınca açılır'}
              className={`shrink-0 min-h-9 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 border cursor-pointer ${z.acik ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>
              <Power className="w-3 h-3" /> {z.acik ? 'Açık' : 'Kapalı'}
            </button>
          )}
        </div>
        <p className={`text-[12px] leading-snug line-clamp-3 ${IKINCIL}`}>{a.aciklama}</p>
        <dl className={`text-[11px] grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 ${IKINCIL}`}>
          <dt>Elinde</dt><dd className={YAZI}>{el.length ? `${el.length} iş · ${el[0].metin.slice(0, 60)}${el[0].metin.length > 60 ? '…' : ''}` : 'iş yok'}</dd>
          <dt>Son işi</dt><dd className={YAZI}>{son ? `${son.metin.slice(0, 60)}${son.metin.length > 60 ? '…' : ''}` : '—'}</dd>
          <dt>Ne zaman</dt><dd className={YAZI}>{kems ? 'Sen yazınca' : zamanOzeti(z)}</dd>
        </dl>
      </article>
    );
  };

  const kaydetCubugu = degisti && (
    <div className={`${KART} p-3 flex flex-wrap items-center gap-2 border-[#F26B6F]`}>
      <span className={`flex-1 min-w-0 text-[12px] ${YAZI}`}>Zamanlayıcıda kaydedilmemiş değişiklik var.</span>
      <button type="button" onClick={() => setTaslak(kayitli)} className={DUGME_BOS}>Vazgeç</button>
      <button type="button" disabled={kaydediliyor} onClick={() => void kaydet()} className={DUGME_LAC}><Save className="w-3.5 h-3.5" /> {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </div>
  );

  const anahtarYok = (
    <section className={`${KART} p-4 space-y-2`}>
      <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; ajanlar ve zamanlayıcı okunamıyor. Anahtar "Ajans bağlantısı" bölümünde bir kez girilir.</p>
      <button type="button" onClick={() => onSekme('baglanti')} className={DUGME_BOS}>Ajans bağlantısı</button>
    </section>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <SayfaBasi baslik="Ajanlar ve otomasyonlar" />
      <SayfaRayi baslik="Ajanlar ve otomasyonlar" bolumler={BOLUMLER} aktifId={sekme} onSec={id => onSekme(id as AjanlarSekmesi)} />

      {sekme !== 'baglanti' && (anahtar ? (<>
        <div className="flex flex-wrap items-center gap-2">
          <p className={`flex-1 min-w-0 text-[12px] ${IKINCIL}`}>Zamanlı işler kapalı (28 Ekim). Zamanlayıcıdaki ayar sen "başla" deyince kurulur.</p>
          <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        </div>
        {isler?.limit && (
          <p className={`${KART} p-3 flex items-start gap-2 text-[12px] ${YAZI} border-[#F26B6F]`}>
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#F26B6F]" />
            <span><b>Limit:</b> {isler.limit.uyari}{isler.limit.tarih ? ` · ${neZaman(Date.parse(isler.limit.tarih))}` : ''}</span>
          </p>
        )}
        {mesaj && <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{mesaj} <button type="button" onClick={() => setMesaj(null)} className="underline cursor-pointer">tamam</button></p>}
        {kaydetCubugu}
        {ajanlar === 'yukleniyor' && <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Ajanlar okunuyor…</p>}
        {typeof ajanlar === 'object' && !Array.isArray(ajanlar) && <p className={`${KART} p-4 text-[12px] ${YAZI}`}>Okunamadı ({ajanlar.hata}).</p>}
      </>) : anahtarYok)}

      {sekme === 'ajanlar' && Array.isArray(ajanlar) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kart(KEMS, true)}
          {ajanlar.map(a => kart(a))}
        </div>
      )}

      {sekme === 'zamanlayici' && Array.isArray(ajanlar) && (
        <section className={`${KART} p-4`}>
          <div className={ETIKET}>Zamanlayıcı · İstanbul saati</div>
          <p className={`mt-1 text-[12px] ${IKINCIL}`}>Alarm gibi: her gün, haftanın seçtiğin günleri ya da tek bir tarih. Kararın (2 Kasım): şimdilik yalnız evren ajanları her gece az az; diğerleri sen isteyince.</p>
          <ul className="mt-2">
            {ajanlar.map(a => {
              const z = zaman(a.ad);
              return (
                <li key={a.ad} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] py-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className={`w-4 h-4 shrink-0 ${z.acik ? 'text-[#F26B6F]' : 'text-[#CFC5B4]'}`} />
                    <span className={`flex-1 min-w-0 text-[13px] font-semibold ${YAZI}`}>{a.baslik} <span className={`font-normal text-[11px] ${IKINCIL}`}>· {zamanOzeti(z)}</span></span>
                    <button type="button" onClick={() => degistir(a.ad, { acik: !z.acik })} aria-pressed={z.acik} className={cip(z.acik)}>{z.acik ? 'Açık' : 'Kapalı'}</button>
                  </div>
                  {z.acik && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-6">
                      {([['hergun', 'Her gün'], ['gunler', 'Günler'], ['tarih', 'Tarih']] as const).map(([t, ad]) => (
                        <button key={t} type="button" aria-pressed={z.tur === t} onClick={() => degistir(a.ad, { tur: t })} className={cip(z.tur === t)}>{ad}</button>
                      ))}
                      <input type="time" value={z.saat} onChange={e => degistir(a.ad, { saat: e.target.value })} aria-label={`${a.baslik} saati`} className={GIRDI} />
                      {z.tur === 'gunler' && GUNLER.map(g => {
                        const on = (z.gunler || []).includes(g.kod);
                        return <button key={g.kod} type="button" aria-pressed={on} className={cip(on)}
                          onClick={() => degistir(a.ad, { gunler: on ? (z.gunler || []).filter(x => x !== g.kod) : [...(z.gunler || []), g.kod] as GunKodu[] })}>{g.ad}</button>;
                      })}
                      {z.tur === 'tarih' && <input type="date" value={z.tarih || ''} onChange={e => degistir(a.ad, { tarih: e.target.value })} aria-label={`${a.baslik} tarihi`} className={GIRDI} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sekme === 'baglanti' && <AjansSayfasi items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />}
    </div>
  );
};

export default AjanlarVeOtomasyonlar;
