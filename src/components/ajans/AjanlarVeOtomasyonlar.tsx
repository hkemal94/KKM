import React, { useEffect, useMemo, useState } from 'react';
import { KisaListe } from '../kabuk/KisaListe';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, ExternalLink, Power, RefreshCw, Save } from 'lucide-react';
import type { Item } from '../../types';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { isleriOku, type IsDosyasi } from '../../lib/isler';
import {
  ajanlariOku, bugunSirada, GUNLER, gunYaz, isoHafta, siradakiTurGunu, KEMS, KOSULLAR, MODELLER, MODEL_ADI, modelleriOku, modelleriYaz, VARSAYILAN_TUR_SAATI, varsayilanZaman, zamanlayiciOku, zamanlayiciYaz, zamanOzeti,
  type AjanBilgisi, type AjanZamani, type GunKodu, type ModelKodu, type TurAyari
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
 *   - Zamanlayıcı (12 Kasım, Kemal: "gerçekten çalışsın"): tek gece turu;
 *     her ajan için günler, iki haftada bir, ayda bir ya da "iş olunca".
 *     "Kaydet" ajansın deposuna yazar (`lib/ajanlar.ts`); gece turu her gece
 *     bu ayarı okur, değişiklik ertesi gece geçerli olur.
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
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
}

const BOLUMLER = [
  { id: 'ajanlar', label: 'Ajanlar' },
  { id: 'zamanlayici', label: 'Zamanlayıcı' },
  { id: 'baglanti', label: 'Ajans bağlantısı' }
];

const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e));
const GIRDI = `min-h-9 px-2 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`;
const cip = (on: boolean) => `min-h-9 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer ${on ? 'bg-[#F26B6F] border-transparent text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`;

export const AjanlarVeOtomasyonlar: React.FC<Props> = ({ items, sekme, onSekme, onUpdateItem, onDeleteItem, onAddItem }) => {
  const anahtar = anahtariOku();
  const [tur, setTur] = useState(0);
  const [ajanlar, setAjanlar] = useState<AjanBilgisi[] | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [isler, setIsler] = useState<IsDosyasi | null>(null);
  /** Kayıtlı ayar ve ekrandaki taslak */
  const [kayitli, setKayitli] = useState<Record<string, AjanZamani>>({});
  const [taslak, setTaslak] = useState<Record<string, AjanZamani>>({});
  /** Turun kendi ayarı: saat, açık / durdu, atlanan geceler, bir kerelik ajanlar */
  const [turKayitli, setTurKayitli] = useState<TurAyari>({ turSaati: VARSAYILAN_TUR_SAATI, turAcik: true });
  const [turTaslak, setTurTaslak] = useState<TurAyari>({ turSaati: VARSAYILAN_TUR_SAATI, turAcik: true });
  const saatTaslak = turTaslak.turSaati || VARSAYILAN_TUR_SAATI;
  const saatKayitli = turKayitli.turSaati || VARSAYILAN_TUR_SAATI;
  /** Model seçimi: kayıtlı ve taslak (yalnız Kemal'in seçtikleri) */
  const [modelKayitli, setModelKayitli] = useState<Record<string, ModelKodu>>({});
  const [modelTaslak, setModelTaslak] = useState<Record<string, ModelKodu>>({});
  /** Ayrıntısı açık ajan */
  const [secili, setSecili] = useState<string | null>(null);
  /** Zamanlayıcıda ayarı açık satır (kompakt liste; 12 Kasım) */
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  /** Limit uyarısı aç / kapa (12 Kasım, Kemal); yalnız bu tarayıcıda, kayda yazılmaz */
  const [limitGoster, setLimitGoster] = useState(() => { try { return localStorage.getItem('kkm-limit-uyarisi') !== 'kapali'; } catch { return true; } });
  const limitDegistir = () => setLimitGoster(g => {
    try { localStorage.setItem('kkm-limit-uyarisi', g ? 'kapali' : 'acik'); } catch { /* yok */ }
    return !g;
  });
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
        const t: TurAyari = { turSaati: z.turSaati, turAcik: z.turAcik, atla: z.atla, ekstra: z.ekstra };
        setTurKayitli(t);
        setTurTaslak(t);
        setIsler(i);
        setModelKayitli(m);
        setModelTaslak(m);
      })
      .catch(e => { if (!iptal) setAjanlar({ hata: hataYazi(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);

  const zaman = (ad: string) => taslak[ad] ?? varsayilanZaman(ad);
  const degistir = (ad: string, d: Partial<AjanZamani>) => setTaslak(t => ({ ...t, [ad]: { ...(t[ad] ?? varsayilanZaman(ad)), ...d } }));
  const zamanDegisti = useMemo(() => JSON.stringify(taslak) !== JSON.stringify(kayitli) || JSON.stringify(turTaslak) !== JSON.stringify(turKayitli), [taslak, kayitli, turTaslak, turKayitli]);
  const modelDegisti = useMemo(() => JSON.stringify(modelTaslak) !== JSON.stringify(modelKayitli), [modelTaslak, modelKayitli]);
  const degisti = zamanDegisti || modelDegisti;

  const kaydet = async () => {
    if (!anahtar || !Array.isArray(ajanlar)) return;
    setKaydediliyor(true);
    setMesaj(null);
    try {
      if (zamanDegisti) {
        const hepsi = Object.fromEntries(ajanlar.map(a => [a.ad, zaman(a.ad)]));
        await zamanlayiciYaz(anahtar, hepsi, turTaslak);
        setKayitli(hepsi);
        setTaslak(hepsi);
        setTurKayitli(turTaslak);
      }
      if (modelDegisti) {
        await modelleriYaz(anahtar, modelTaslak);
        setModelKayitli(modelTaslak);
      }
      setMesaj([zamanDegisti && 'Zamanlayıcı kaydedildi; gece turu bu geceden itibaren buna göre çalışır.', modelDegisti && 'Model seçimi kaydedildi; Kems ajanları bu modelle çalıştırır.'].filter(Boolean).join(' '));
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
          {el.length ? <KisaListe className="mt-1 space-y-1">{el.map(isSatiri)}</KisaListe> : <p className={`mt-1 text-[12px] ${IKINCIL}`}>İş yok.</p>}
        </div>
        <div>
          <div className={ETIKET}>Eski işleri ({eski.length})</div>
          {eski.length ? <KisaListe className="mt-1 space-y-1 max-h-60 overflow-y-auto">{eski.map(isSatiri)}</KisaListe> : <p className={`mt-1 text-[12px] ${IKINCIL}`}>Henüz biten iş yok.</p>}
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
          <p className={`flex-1 min-w-0 text-[12px] ${IKINCIL}`}>{turKayitli.turAcik === false ? 'Gece turu durduruldu; ayarlar duruyor, "Başlat" deyince kaldığı yerden devam eder.' : `Gece turu açık: her gece ${saatKayitli}'de zamanlayıcıdaki sıraya göre çalışır; getirdikleri sabah tepsine düşer.`}</p>
          <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        </div>
        <div className={`flex flex-wrap items-center gap-2 text-[12px] ${IKINCIL}`}>
          <AlertTriangle className={`w-4 h-4 ${limitGoster ? 'text-[#F26B6F]' : 'text-[#CFC5B4]'}`} />
          <span>Limit uyarısı</span>
          <button type="button" onClick={limitDegistir} aria-pressed={limitGoster} className={cip(limitGoster)}>{limitGoster ? 'Açık' : 'Kapalı'}</button>
          {!isler?.limit && <span>· şu an uyarı yok</span>}
          {isler?.limit && !limitGoster && <span>· bir uyarı var, gizli</span>}
        </div>
        {isler?.limit && limitGoster && (
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

      {sekme === 'zamanlayici' && Array.isArray(ajanlar) && (() => {
        const turGunu = siradakiTurGunu(saatTaslak);
        const turId = gunYaz(turGunu);
        const turAcik = turTaslak.turAcik !== false;
        const atlanacak = (turTaslak.atla || []).includes(turId);
        const ekstra = turTaslak.ekstra?.[turId] || [];
        const geceAjanlari = (g: Date) => {
          const id = gunYaz(g);
          if (!turAcik || (turTaslak.atla || []).includes(id)) return null;
          const ek = turTaslak.ekstra?.[id] || [];
          return ajanlar.filter(a => zaman(a.ad).tur !== 'kosul' && (bugunSirada(zaman(a.ad), g) || ek.includes(a.ad)));
        };
        const kosullular = ajanlar.filter(a => zaman(a.ad).acik && zaman(a.ad).tur === 'kosul');
        const buGece = geceAjanlari(turGunu);
        const turDegistir = (d: Partial<TurAyari>) => setTurTaslak(t => ({ ...t, ...d }));
        const ekstraDegistir = (ad: string) => turDegistir({ ekstra: { ...(turTaslak.ekstra || {}), [turId]: ekstra.includes(ad) ? ekstra.filter(x => x !== ad) : [...ekstra, ad] } });
        const yediGece = Array.from({ length: 7 }, (_, i) => { const g = new Date(turGunu); g.setDate(g.getDate() + i); return g; });
        return (
        <section className={`${KART} p-4`}>
          <div className={ETIKET}>Zamanlayıcı · İstanbul saati</div>
          <p className={`mt-1 text-[12px] ${IKINCIL}`}>Her gece tek tur çalışır; sırası gelen ajan bir küçük iş yapar, iş yoksa bir şey üretmez. Getirdikleri sabah tepsine ve Onay bekleyenler'e düşer. Değişiklik ertesi gece geçerli olur.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Clock className="w-4 h-4 text-[#F26B6F]" />
            <span className={`text-[13px] font-semibold ${YAZI}`}>Gece turu</span>
            <button type="button" onClick={() => turDegistir({ turAcik: !turAcik })} aria-pressed={turAcik} className={cip(turAcik)}>{turAcik ? 'Açık' : 'Durduruldu'}</button>
            <input type="time" value={saatTaslak} onChange={e => turDegistir({ turSaati: e.target.value })} aria-label="Gece turu saati" className={GIRDI} />
            {turAcik && (
              <button type="button" onClick={() => turDegistir({ atla: atlanacak ? (turTaslak.atla || []).filter(g => g !== turId) : [...(turTaslak.atla || []), turId] })}
                aria-pressed={atlanacak} className={cip(atlanacak)}>{atlanacak ? 'Bu gece atlanıyor' : 'Bu geceyi atla'}</button>
            )}
            <span className={`text-[11px] ${IKINCIL}`}>Bu hafta {isoHafta() % 2 === 1 ? 'tek' : 'çift'}</span>
          </div>
          <div className={`mt-2 text-[12px] ${YAZI}`}>
            <b>Sıradaki tur ({turGunu.toLocaleDateString('tr-TR', { weekday: 'long' })} {saatTaslak}):</b>{' '}
            {!turAcik ? 'tur durduruldu' : atlanacak ? 'bu gece atlanıyor' : [...(buGece || []).map(a => a.baslik), ...kosullular.map(a => `${a.baslik} (iş varsa)`)].join(' · ') || 'kimse yok'}
          </div>
          {/* Haftalık takvim (12 Kasım, Kemal): önümüzdeki 7 gece */}
          <div className="mt-3 rounded-xl border border-[#CFC5B4]/70 dark:border-[#2C3C72] overflow-hidden">
            {yediGece.map(g => {
              const l = geceAjanlari(g);
              return (
                <div key={gunYaz(g)} className="flex gap-2 px-2.5 py-1.5 text-[12px] border-t first:border-t-0 border-[#CFC5B4]/50 dark:border-[#2C3C72]">
                  <span className={`w-24 shrink-0 font-semibold ${YAZI}`}>{g.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className={`min-w-0 ${l && l.length ? YAZI : IKINCIL}`}>{l === null ? 'atlanıyor' : l.length ? l.map(a => a.baslik).join(' · ') : '—'}</span>
                </div>
              );
            })}
            {kosullular.length > 0 && <div className={`px-2.5 py-1.5 text-[11px] border-t border-[#CFC5B4]/50 dark:border-[#2C3C72] ${IKINCIL}`}>Her gece iş varsa: {kosullular.map(a => a.baslik).join(' · ')}</div>}
          </div>
          <ul className="mt-2">
            {ajanlar.map(a => {
              const z = zaman(a.ad);
              const kosul = KOSULLAR[a.ad];
              return (
                <li key={a.ad} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] py-1.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock className={`w-4 h-4 shrink-0 ${z.acik ? 'text-[#F26B6F]' : 'text-[#CFC5B4]'}`} />
                    <span className={`flex-1 min-w-0 text-[13px] font-semibold ${YAZI}`}>{a.baslik} <span className={`font-normal text-[11px] ${IKINCIL}`}>· {zamanOzeti(z)}</span></span>
                    {turAcik && !atlanacak && !(buGece || []).some(x => x.ad === a.ad) && z.tur !== 'kosul' && (
                      <button type="button" onClick={() => ekstraDegistir(a.ad)} aria-pressed={ekstra.includes(a.ad)} className={cip(ekstra.includes(a.ad))}
                        title="Günü olmasa da bu geceki tura bir kerelik eklenir">{ekstra.includes(a.ad) ? 'Bu gece ✓' : 'Bu gece de'}</button>
                    )}
                    {ekstra.includes(a.ad) && <button type="button" onClick={() => ekstraDegistir(a.ad)} className={cip(true)}>Bu gece ✓</button>}
                    {z.acik && (
                      <button type="button" onClick={() => setDuzenlenen(d => (d === a.ad ? null : a.ad))} aria-expanded={duzenlenen === a.ad}
                        className={`min-h-9 px-2.5 rounded-full text-[11px] font-semibold border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer ${YAZI}`}>
                        {duzenlenen === a.ad ? 'Tamam' : 'Değiştir'}
                      </button>
                    )}
                    <button type="button" onClick={() => degistir(a.ad, { acik: !z.acik })} aria-pressed={z.acik} className={cip(z.acik)}>{z.acik ? 'Açık' : 'Kapalı'}</button>
                  </div>
                  {z.acik && duzenlenen === a.ad && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-6">
                      {([['gunler', 'Günler'], ['ayda', 'Ayda bir'], ...(kosul ? [['kosul', 'İş olunca']] : []), ['tarih', 'Tek tarih']] as Array<[AjanZamani['tur'], string]>).map(([t, ad]) => (
                        <button key={t} type="button" aria-pressed={z.tur === t} onClick={() => degistir(a.ad, { tur: t })} className={cip(z.tur === t)}>{ad}</button>
                      ))}
                      {(z.tur === 'gunler' || z.tur === 'ayda') && <span className="basis-full h-0" />}
                      {(z.tur === 'gunler' || z.tur === 'ayda') && GUNLER.map(g => {
                        const on = (z.gunler || []).includes(g.kod);
                        return <button key={g.kod} type="button" aria-pressed={on} className={cip(on)}
                          onClick={() => degistir(a.ad, { gunler: z.tur === 'ayda' ? [g.kod] : (on ? (z.gunler || []).filter(x => x !== g.kod) : [...(z.gunler || []), g.kod] as GunKodu[]) })}>{g.ad}</button>;
                      })}
                      {z.tur === 'gunler' && <span className="basis-full h-0" />}
                      {z.tur === 'gunler' && ([['her', 'Her hafta'], ['tek', 'Tek haftalar'], ['cift', 'Çift haftalar']] as const).map(([h, ad]) => (
                        <button key={h} type="button" aria-pressed={(z.hafta || 'her') === h} onClick={() => degistir(a.ad, { hafta: h })} className={cip((z.hafta || 'her') === h)}>{ad}</button>
                      ))}
                      {z.tur === 'ayda' && <span className={`text-[11px] ${IKINCIL}`}>Ayın son seçili günü</span>}
                      {z.tur === 'kosul' && kosul && <span className={`text-[11px] ${IKINCIL}`}>Her gece bakar: {kosul}</span>}
                      {z.tur === 'tarih' && <input type="date" value={z.tarih || ''} onChange={e => degistir(a.ad, { tarih: e.target.value })} aria-label={`${a.baslik} tarihi`} className={GIRDI} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        );
      })()}

      {sekme === 'baglanti' && <AjansSayfasi items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} onAddItem={onAddItem} />}
    </div>
  );
};

export default AjanlarVeOtomasyonlar;
