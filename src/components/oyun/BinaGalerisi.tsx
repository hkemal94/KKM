import React, { Suspense, useEffect, useState } from 'react';
import { Check, Maximize2, PenLine, Trash2, X } from 'lucide-react';
import { BolumBasligi, Rozet } from '../kabuk/Parcalar';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';
import {
  BAHCE, BINA_MODELLERI, IMPERIAL_GORUNUMLERI, IMPERIAL_PLANLARI, KURUCU_TUR_ADI, modelAdresi, modelinTurleri,
  type BinaModeli, type ModelGrubu
} from '../../lib/binaKutuphanesi';
import { assetKarariYaz, assetKararlariniOku, KARAR_ADI, type AssetKarari, type AssetKarariTuru, type AssetKararlari } from '../../lib/assetKararlari';
import { anahtariOku } from '../../lib/oyunAyarlari';

/** three.js yalnız galeri açılınca iner */
const ModelOnizleme = React.lazy(() => import('./ModelOnizleme'));

/**
 * Ortak bina kütüphanesi galerisi (4 Kasım). Binalar, sokak parçaları ve The
 * Imperial Kemskoy (kat planları ve iç görünümleriyle). Her kartta döndürülebilir
 * 3B önizleme, Kurucu türü ve "taslak" işareti; Kemal'in kararı için
 * Tamam · Düzelt · Sil (ajansın `kkm/asset-kararlari.json`'una yazılır).
 */

const GRUPLAR: Array<{ grup: ModelGrubu; baslik: string }> = [
  { grup: 'bina', baslik: 'Binalar' },
  { grup: 'sokak', baslik: 'Sokak parçaları' },
  { grup: 'bitki', baslik: 'Bitkiler' },
  { grup: 'bahce', baslik: 'Bahçe' },
  { grup: 'deniz', baslik: 'Deniz ve liman' },
  { grup: 'arac', baslik: 'Araçlar' },
  { grup: 'imperial', baslik: 'The Imperial Kemskoy' }
];

const KARAR_RENGI: Record<AssetKarariTuru, 'bitti' | 'dikkat' | 'lacivert'> = { tamam: 'bitti', duzelt: 'dikkat', sil: 'lacivert' };

const tarihYaz = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Onizleme: React.FC<{ m: BinaModeli; ekDosya?: string; buyuk?: boolean; className: string }> = ({ m, ekDosya, buyuk, className }) => (
  <Suspense fallback={<div className={`${className} flex items-center justify-center text-[12px] ${IKINCIL}`}>Model yükleniyor…</div>}>
    <ModelOnizleme dosya={m.dosya} ekDosya={ekDosya} baslik={m.baslik} buyuk={buyuk} className={className} />
  </Suspense>
);

const SECIM = `min-h-11 lg:min-h-9 px-2 rounded-lg text-[13px] bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`;

/**
 * Bahçe arsası + ev (Kemal, 4 Kasım): arsalar binasız, bina yeri bütün evlerde aynı
 * köşede; seçilen ev seçilen arsaya aynı başlangıç noktasıyla oturur.
 */
const BahceBirlestir: React.FC<{ onBuyut: (m: BinaModeli, ek: string) => void }> = ({ onBuyut }) => {
  const arsalar = BINA_MODELLERI.filter(m => m.grup === 'bahce' && BAHCE.arsalar.includes(m.dosya));
  const evler = BINA_MODELLERI.filter(m => m.grup === 'bina' && modelinTurleri(m.dosya).some(t => ['ev', 'dukkanli', 'yazlik', 'ciftlik'].includes(t)));
  const [arsa, setArsa] = useState(arsalar[0]?.dosya ?? '');
  const [ev, setEv] = useState(evler[0]?.dosya ?? '');
  const am = arsalar.find(a => a.dosya === arsa);
  if (!am || !ev) return null;
  return (
    <div className={`${KART} p-3 space-y-2.5`}>
      <p className={`text-[14px] font-semibold ${YAZI}`}>Arsa + ev <span className={`font-normal ${IKINCIL}`}>· {arsalar.length} arsa × {evler.length} ev</span></p>
      <div className="flex flex-wrap gap-2">
        <label className={`text-[12px] ${IKINCIL} flex items-center gap-1.5`}>Arsa
          <select value={arsa} onChange={e => setArsa(e.target.value)} className={SECIM}>
            {arsalar.map(a => <option key={a.dosya} value={a.dosya}>{a.baslik}</option>)}
          </select>
        </label>
        <label className={`text-[12px] ${IKINCIL} flex items-center gap-1.5`}>Ev
          <select value={ev} onChange={e => setEv(e.target.value)} className={SECIM}>
            {evler.map(a => <option key={a.dosya} value={a.dosya}>{a.baslik}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onBuyut(am, ev)} className={DUGME_BOS}><Maximize2 className="w-3.5 h-3.5" /> Büyüt</button>
      </div>
      <Onizleme key={`${arsa}|${ev}`} m={am} ekDosya={ev} className="w-full lg:max-w-4xl aspect-[16/9] rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] overflow-hidden" />
      <p className={`text-[12px] ${IKINCIL}`}>Haritada büyük arsalı evler bu arsalardan birini alır; küçük arsalarda kenara duvar ya da çit dizilir, yola bakan kenara kapı konur.</p>
    </div>
  );
};

/** Karar düğmeleri: yalnız basınca yazar */
const KararSatiri: React.FC<{
  kimlik: string; karar?: AssetKarari; anahtar: string | null;
  onYazildi: (k: AssetKararlari) => void;
}> = ({ kimlik, karar, anahtar, onYazildi }) => {
  const [notAcik, setNotAcik] = useState(false);
  const [not, setNot] = useState('');
  const [yaziliyor, setYaziliyor] = useState<AssetKarariTuru | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const yaz = async (k: AssetKarariTuru, n?: string) => {
    if (!anahtar || yaziliyor) return;
    setYaziliyor(k); setHata(null);
    try {
      onYazildi(await assetKarariYaz(anahtar, kimlik, k, n));
      setNotAcik(false); setNot('');
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYaziliyor(null);
    }
  };
  return (
    <div className="space-y-2">
      {karar && (
        <p className={`text-[12px] ${IKINCIL}`}>
          <Rozet renk={KARAR_RENGI[karar.karar]}>Kararın: {KARAR_ADI[karar.karar]}</Rozet>
          <span className="ml-1.5">{tarihYaz(karar.tarih)}</span>
          {karar.not && <span className={`block mt-1 ${YAZI}`}>Not: {karar.not}</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={!anahtar || !!yaziliyor} onClick={() => void yaz('tamam')} className={DUGME_LAC}>
          <Check className="w-3.5 h-3.5" /> {yaziliyor === 'tamam' ? 'Yazılıyor…' : 'Tamam'}
        </button>
        <button type="button" disabled={!anahtar || !!yaziliyor} onClick={() => setNotAcik(a => !a)} className={DUGME_BOS}>
          <PenLine className="w-3.5 h-3.5" /> Düzelt
        </button>
        <button type="button" disabled={!anahtar || !!yaziliyor} onClick={() => void yaz('sil')} className={`${DUGME_BOS} text-[#B23A40]`}>
          <Trash2 className="w-3.5 h-3.5" /> {yaziliyor === 'sil' ? 'Yazılıyor…' : 'Sil'}
        </button>
      </div>
      {notAcik && (
        <div className="space-y-1.5">
          <textarea value={not} onChange={e => setNot(e.target.value)} rows={2} placeholder="Ne düzelsin? Örneğin: çatı daha koyu olsun"
            className={`w-full p-2 rounded-lg text-[13px] bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] focus:outline-hidden focus:border-[#F26B6F]`} />
          <button type="button" disabled={!not.trim() || !!yaziliyor} onClick={() => void yaz('duzelt', not)} className={DUGME_LAC}>
            {yaziliyor === 'duzelt' ? 'Yazılıyor…' : 'Notu gönder'}
          </button>
        </div>
      )}
      {hata && <p className="text-[12px] text-[#F26B6F]">Yazılamadı: {hata}</p>}
    </div>
  );
};

export const BinaGalerisi: React.FC = () => {
  const anahtar = anahtariOku();
  const [kararlar, setKararlar] = useState<AssetKararlari | null>(null);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [buyuk, setBuyuk] = useState<{ m: BinaModeli; ek?: string } | null>(null);
  /** Renkli modellerde seçili renk (takımın ilk dosyası → seçilen dosya) */
  const [renk, setRenk] = useState<Record<string, string>>({});

  // Açılışta mevcut kararlar okunur (yalnız okuma)
  useEffect(() => {
    if (!anahtar) { setKararlar({}); return; }
    let iptal = false;
    assetKararlariniOku(anahtar)
      .then(k => { if (!iptal) setKararlar(k); })
      .catch(e => { if (!iptal) { setKararlar({}); setOkumaHatasi(e instanceof Error ? e.message : String(e)); } });
    return () => { iptal = true; };
  }, [anahtar]);

  const kart = (takim: BinaModeli) => {
    const secili = takim.renkler?.find(r => r.dosya === renk[takim.dosya]) ?? takim.renkler?.[0];
    const m: BinaModeli = secili ? { ...takim, dosya: secili.dosya, kimlik: secili.kimlik } : takim;
    const turler = modelinTurleri(m.dosya);
    return (
      <div key={takim.dosya} className={`${KART} p-3 space-y-2.5`}>
        <div className="relative">
          <Onizleme key={m.dosya} m={m} className="w-full aspect-[4/3] rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] overflow-hidden" />
          <button type="button" onClick={() => setBuyuk({ m })} aria-label="Büyüt"
            className={`absolute top-1.5 right-1.5 w-9 h-9 rounded-lg bg-[#FAF8F5]/90 dark:bg-[#13204A]/90 flex items-center justify-center ${YAZI} cursor-pointer`}>
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`flex-1 min-w-0 text-[14px] font-semibold ${YAZI}`}>{m.baslik}</p>
          <Rozet renk="dikkat">taslak</Rozet>
        </div>
        {takim.renkler && takim.renkler.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Renk">
            {takim.renkler.map(r => (
              <button key={r.dosya} type="button" role="radio" aria-checked={r.dosya === m.dosya}
                onClick={() => setRenk(s => ({ ...s, [takim.dosya]: r.dosya }))}
                className={`${r.dosya === m.dosya ? DUGME_LAC : DUGME_BOS} !min-h-9 !px-2.5`}>{r.renk}</button>
            ))}
          </div>
        )}
        {turler.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {turler.map(t => <Rozet key={t} renk="bekliyor">Kurucu: {KURUCU_TUR_ADI[t] ?? t}</Rozet>)}
          </div>
        )}
        <KararSatiri kimlik={m.kimlik} karar={kararlar?.[m.kimlik]} anahtar={anahtar}
          onYazildi={k => setKararlar(k)} />
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <BolumBasligi baslik="Bina kütüphanesi · 3B" sayi={BINA_MODELLERI.length} />
      <p className={`text-[13px] ${IKINCIL}`}>
        Ajansın Blender'da yaptığı ortak modeller; hepsi taslak. Binalar haritada yakına gelince kutuların yerinde, bahçeler daha da yakında görünür.
        Modeli parmakla çevir, iki parmakla yaklaş. Kararın ajansa gider: Tamam, Düzelt (notla) ya da Sil.
      </p>
      {!anahtar && <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; kararlar okunamıyor ve yazılamıyor (Eksikler ve ayarlar).</p>}
      {okumaHatasi && <p className="text-[12px] text-[#F26B6F]">Kararlar okunamadı: {okumaHatasi}</p>}

      {GRUPLAR.map(g => {
        const liste = BINA_MODELLERI.filter(m => m.grup === g.grup);
        if (!liste.length) return null;
        return (
          <div key={g.grup} className="space-y-2">
            <p className={`text-[13px] font-semibold ${YAZI}`}>{g.baslik} <span className={`font-normal ${IKINCIL}`}>· {liste.length}</span></p>
            {g.grup === 'bahce' && <BahceBirlestir onBuyut={(m, ek) => setBuyuk({ m, ek })} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{liste.map(kart)}</div>
            {g.grup === 'imperial' && (
              <div className="space-y-3">
                <p className={`text-[12px] font-semibold ${YAZI}`}>Kat planları</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {IMPERIAL_PLANLARI.map(p => (
                    <a key={p.dosya} href={modelAdresi(p.dosya)} target="_blank" rel="noreferrer" className={`${KART} p-2 block space-y-1.5`}>
                      <img src={modelAdresi(p.dosya)} alt={p.baslik} loading="lazy" className="w-full rounded-lg bg-white" />
                      <span className={`flex items-center gap-1.5 text-[12px] ${YAZI}`}>{p.baslik} <Rozet renk="dikkat">taslak</Rozet></span>
                    </a>
                  ))}
                </div>
                <p className={`text-[12px] font-semibold ${YAZI}`}>Çatısı kaldırılmış iç görünümler <span className={`font-normal ${IKINCIL}`}>· eşyalar ve bazı kapı yerleri temsilî</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {IMPERIAL_GORUNUMLERI.map(p => (
                    <a key={p.dosya} href={modelAdresi(p.dosya)} target="_blank" rel="noreferrer" className={`${KART} p-1.5 block space-y-1`}>
                      <img src={modelAdresi(p.dosya)} alt={p.baslik} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-lg" />
                      <span className={`block text-[11px] truncate ${IKINCIL}`}>{p.baslik}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {buyuk && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setBuyuk(null)}>
          <div className={`${KART} w-full max-w-4xl p-3 space-y-2`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <p className={`flex-1 min-w-0 text-[14px] font-semibold ${YAZI}`}>{buyuk.m.baslik} <span className={`font-normal ${IKINCIL}`}>· taslak</span></p>
              <button type="button" onClick={() => setBuyuk(null)} aria-label="Kapat" className={`w-11 h-11 flex items-center justify-center ${IKINCIL} cursor-pointer`}><X className="w-4 h-4" /></button>
            </div>
            <Onizleme key={`${buyuk.m.dosya}|${buyuk.ek ?? ''}`} m={buyuk.m} ekDosya={buyuk.ek} buyuk className="w-full h-[70vh] rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] overflow-hidden" />
          </div>
        </div>
      )}
    </section>
  );
};
