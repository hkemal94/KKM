import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, ExternalLink, Power, RefreshCw, Save } from 'lucide-react';
import type { Item } from '../../types';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { isleriOku, type IsDosyasi } from '../../lib/isler';
import {
  ajanlariOku, GUNLER, KEMS, MODELLER, MODEL_ADI, modelleriOku, modelleriYaz, varsayilanZaman, zamanlayiciOku, zamanlayiciYaz, zamanOzeti,
  type AjanBilgisi, type AjanZamani, type GunKodu, type ModelKodu
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
 * 7. adım (2 Kasım, Kemal: "ajanların içine girdiğimde künyeleri, takvimleri,
 * eski işleri görünür olsun; modelini seçebileyim"): kartta "Ayrıntı" açılır;
 * model seçimi aynı "Kaydet"le `kkm/ajan-modelleri.json`'a yazılır.
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
  /** Model seçimi: kayıtlı ve taslak (yalnız Kemal'in seçtikleri) */
  const [modelKayitli, setModelKayitli] = useState<Record<string, ModelKodu>>({});
  const [modelTaslak, setModelTaslak] = useState<Record<string, ModelKodu>>({});
  /** Ayrıntısı açık ajan */
  const [secili, setSecili] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    setAjanlar('yukleniyor');
    Promise.all([ajanlariOku(anahtar), zamanlayiciOku(anahtar), isleriOku(anahtar).catch(() => null), modelleriOku(anahtar)])
      .then(([a, z, i, m]) => {
        if (iptal) return;
        setAjanlar(a);
        setKayitli(z.ajanlar);
        setTaslak(z.ajanlar);
        setIsler(i);
        setModelKayitli(m);
        setModelTaslak(m);
      })
      .catch(e => { if (!iptal) setAjanlar({ hata: hataYazi(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);

  const zaman = (ad: string) => taslak[ad] ?? varsayilanZaman(ad);
  const degistir = (ad: string, d: Partial<AjanZamani>) => setTaslak(t => ({ ...t, [ad]: { ...(t[ad] ?? varsayilanZaman(ad)), ...d } }));
  const zamanDegisti = useMemo(() => JSON.stringify(taslak) !== JSON.stringify(kayitli), [taslak, kayitli]);
  const modelDegisti = useMemo(() => JSON.stringify(modelTaslak) !== JSON.stringify(modelKayitli), [modelTaslak, modelKayitli]);
  const degisti = zamanDegisti || modelDegisti;

  const kaydet = async () => {
    if (!anahtar || !Array.isArray(ajanlar)) return;
    setKaydediliyor(true);
    setMesaj(null);
    try {
      if (zamanDegisti) {
        const hepsi = Object.fromEntries(ajanlar.map(a => [a.ad, zaman(a.ad)]));
        await zamanlayiciYaz(anahtar, hepsi);
        setKayitli(hepsi);
        setTaslak(hepsi);
      }
      if (modelDegisti) {
        await modelleriYaz(anahtar, modelTaslak);
        setModelKayitli(modelTaslak);
      }
      setMesaj([zamanDegisti && 'Zamanlayıcı kaydedildi; sen "başla" deyince Kems zamanlı görevleri buna göre kurar.', modelDegisti && 'Model seçimi kaydedildi; Kems ajanları bu modelle çalıştırır.'].filter(Boolean).join(' '));
    } catch (e) {
      setMesaj(`Kaydedilemedi: ${hataYazi(e)}`);
    } finally { setKaydediliyor(false); }
  };

  const elinde = (ad: string) => (isler?.isler || []).filter(i => i.kimde === ad && i.durum !== 'bitti');
  const sonIs = (ad: string) => (isler?.isler || []).filter(i => i.kimde === ad && i.durum === 'bitti')
    .sort((a, b) => (b.bitti || b.guncellendi || '').localeCompare(a.bitti || a.guncellendi || ''))[0];

  const eskiIsler = (ad: string) => (isler?.isler || []).filter(i => i.kimde === ad && i.durum === 'bitti')
    .sort((a, b) => (b.bitti || b.guncellendi || '').localeCompare(a.bitti || a.guncellendi || ''));
  const modelKodu = (a: AjanBilgisi): string | undefined => modelTaslak[a.ad] ?? a.modelKodu;

  /** Ayrıntı: künye, model, takvim, işler */
  const ayrinti = (a: AjanBilgisi, kems: boolean) => {
    const z = zaman(a.ad);
    const el = elinde(a.ad);
    const eski = eskiIsler(a.ad);
    const m = modelKodu(a);
    const isSatiri = (i: (typeof el)[number]) => (
      <li key={i.id} className={`text-[12px] ${YAZI}`}>
        {i.metin}
        <span className={`block text-[11px] ${IKINCIL}`}>
          {i.bitti ? neZaman(Date.parse(i.bitti)) : i.guncellendi ? neZaman(Date.parse(i.guncellendi)) : ''}
          {i.kanit && <> · <a href={i.kanit} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">kanıt <ExternalLink className="w-3 h-3" /></a></>}
        </span>
      </li>
    );
    return (
      <div className="mt-1 pt-3 border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] space-y-3">
        <div>
          <div className={ETIKET}>Künye</div>
          <p className={`mt-1 text-[12px] leading-relaxed ${YAZI}`}>{a.aciklama}</p>
          {a.araclar && <p className={`mt-1 text-[11px] ${IKINCIL}`}>Araçları: {a.araclar.split(',').map(t => t.trim().replace(/^mcp__\w+__/, '')).join(' · ')}</p>}
          {a.govde && (
            <details className="mt-1">
              <summary className={`text-[11px] cursor-pointer ${IKINCIL}`}>Görev ve kuralları (ajan dosyası)</summary>
              <pre className={`mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed p-2 rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI}`}>{a.govde}</pre>
            </details>
          )}
        </div>
        <div>
          <div className={ETIKET}>Model</div>
          {kems ? (
            <p className={`mt-1 text-[12px] ${IKINCIL}`}>Kems ana oturumdur; senin açtığın oturumun modeliyle çalışır.</p>
          ) : (<>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {MODELLER.map(x => (
                <button key={x.kod} type="button" aria-pressed={m === x.kod} title={x.aciklama}
                  onClick={() => setModelTaslak(t => (x.kod === a.modelKodu ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== a.ad)) as Record<string, ModelKodu> : { ...t, [a.ad]: x.kod }))}
                  className={cip(m === x.kod)}>{x.ad}</button>
              ))}
            </div>
            <p className={`mt-1 text-[11px] ${IKINCIL}`}>{MODELLER.find(x => x.kod === m)?.aciklama ?? ''}{a.modelKodu ? ` · dosyadaki: ${MODEL_ADI[a.modelKodu] ?? a.modelKodu}` : ''}. Yalnız Claude modelleri.</p>
          </>)}
        </div>
        <div>
          <div className={ETIKET}>Takvim</div>
          <p className={`mt-1 text-[12px] ${YAZI}`}>{kems ? 'Sen yazınca çalışır.' : zamanOzeti(z)}
            {!kems && <> · <button type="button" onClick={() => onSekme('zamanlayici')} className="underline cursor-pointer">Zamanlayıcıda değiştir</button></>}
          </p>
        </div>
        <div>
          <div className={ETIKET}>Elindeki işler ({el.length})</div>
          {el.length ? <ul className="mt-1 space-y-1">{el.map(isSatiri)}</ul> : <p className={`mt-1 text-[12px] ${IKINCIL}`}>İş yok.</p>}
        </div>
        <div>
          <div className={ETIKET}>Eski işleri ({eski.length})</div>
          {eski.length ? <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">{eski.map(isSatiri)}</ul> : <p className={`mt-1 text-[12px] ${IKINCIL}`}>Henüz biten iş yok.</p>}
        </div>
      </div>
    );
  };

  const kart = (a: AjanBilgisi, kems = false) => {
    const z = zaman(a.ad);
    const el = elinde(a.ad);
    const son = sonIs(a.ad);
    const acik = secili === a.ad;
    return (
      <article key={a.ad} className={`${KART} p-4 flex flex-col gap-2 ${acik ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`text-[14px] font-bold leading-tight ${YAZI}`}>{a.baslik}</h3>
            <p className={`text-[11px] ${IKINCIL}`}>{a.hat} · {a.ekran} · model {kems ? a.model : (MODEL_ADI[modelKodu(a) || ''] ?? a.model)}</p>
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
        <button type="button" onClick={() => setSecili(acik ? null : a.ad)} aria-expanded={acik}
          className={`self-start inline-flex items-center gap-1 text-[12px] font-semibold cursor-pointer ${YAZI} hover:text-[#F26B6F]`}>
          {acik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} {acik ? 'Kapat' : 'Ayrıntı: künye, model, takvim, işler'}
        </button>
        {acik && ayrinti(a, kems)}
      </article>
    );
  };

  const kaydetCubugu = degisti && (
    <div className={`${KART} p-3 flex flex-wrap items-center gap-2 border-[#F26B6F]`}>
      <span className={`flex-1 min-w-0 text-[12px] ${YAZI}`}>{[zamanDegisti && 'Zamanlayıcıda', modelDegisti && 'model seçiminde'].filter(Boolean).join(' ve ')} kaydedilmemiş değişiklik var.</span>
      <button type="button" onClick={() => { setTaslak(kayitli); setModelTaslak(modelKayitli); }} className={DUGME_BOS}>Vazgeç</button>
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
