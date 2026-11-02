import React, { useEffect, useMemo, useState } from 'react';
import { Box, Check, ExternalLink, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { istekEkle } from '../../lib/kemalIstekleri';
import { depoSayfasi } from '../../lib/depoBelgesi';
import { assetleriListele, gizliAdres, grupla, istekMetni, type Asset } from '../../lib/oyunAssetleri';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyunun assetleri (2 Kasım, `lib/oyunAssetleri.ts`). Oyunun deposundan her
 * açılışta okunur; yalnız gösterir. "Ajana değiştirt" ve "Yeni çalışma başlat"
 * ajansa istek yazar (`kkm/istekler.json`); oyuna hiçbir şey yazılmaz.
 */

/** Gizli depodaki görseli anahtarla, açıktakini doğrudan gösterir */
function useAdres(a: Asset | null, depo: string): string | null {
  const [adres, setAdres] = useState<string | null>(a && !a.gizli ? a.adres : null);
  useEffect(() => {
    if (!a) { setAdres(null); return; }
    if (!a.gizli) { setAdres(a.adres); return; }
    let iptal = false;
    setAdres(null);
    gizliAdres(depo, a.yol).then(u => { if (!iptal) setAdres(u); }).catch(() => { if (!iptal) setAdres(null); });
    return () => { iptal = true; };
  }, [a, depo]);
  return adres;
}

const Kucuk: React.FC<{ a: Asset; depo: string }> = ({ a, depo }) => {
  const adres = useAdres(a.tur === 'gorsel' ? a : null, depo);
  if (a.tur === 'model') return <span className="w-full h-full flex items-center justify-center"><Box className={`w-8 h-8 ${IKINCIL}`} /></span>;
  return adres ? <img src={adres} alt={a.ad} loading="lazy" className="w-full h-full object-contain" /> : <span className={`text-[11px] ${IKINCIL}`}>…</span>;
};

/** 3B model: döndürülebilir önizleme (model-viewer, yalnız açılınca yüklenir) */
const ModelGoster: React.FC<{ adres: string; ad: string }> = ({ adres, ad }) => {
  const [hazir, setHazir] = useState(false);
  const [hata, setHata] = useState(false);
  useEffect(() => {
    let iptal = false;
    import('@google/model-viewer').then(() => { if (!iptal) setHazir(true); }).catch(() => { if (!iptal) setHata(true); });
    return () => { iptal = true; };
  }, []);
  if (hata) return <p className={`text-[13px] ${IKINCIL}`}>3B önizleme açılamadı.</p>;
  if (!hazir) return <p className={`text-[13px] ${IKINCIL}`}>Model yükleniyor…</p>;
  return React.createElement('model-viewer', {
    src: adres, alt: ad, 'camera-controls': true, 'auto-rotate': true, 'shadow-intensity': '0.6',
    style: { width: '100%', height: '60vh', background: 'transparent' }
  });
};

/** İstek kutusu: not yaz, ajansa gönder */
const IstekKutusu: React.FC<{ baslik: string; aciklama: string; ornek: string; onGonder: (not: string) => Promise<void>; onKapat?: () => void }> = ({ baslik, aciklama, ornek, onGonder, onKapat }) => {
  const [not, setNot] = useState('');
  const [durum, setDurum] = useState<'' | 'gidiyor' | 'gitti' | { hata: string }>('');
  const gonder = async () => {
    setDurum('gidiyor');
    try { await onGonder(not); setDurum('gitti'); setNot(''); }
    catch (e) { setDurum({ hata: e instanceof Error ? e.message : String(e) }); }
  };
  return (
    <div className="space-y-2">
      <p className={`text-[13px] font-semibold ${YAZI}`}>{baslik}</p>
      <p className={`text-[12px] ${IKINCIL}`}>{aciklama}</p>
      <textarea value={not} onChange={e => setNot(e.target.value)} placeholder={ornek} rows={3}
        className={`w-full p-2.5 rounded-lg text-[13px] bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] focus:outline-hidden focus:border-[#F26B6F]`} />
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={!not.trim() || durum === 'gidiyor'} onClick={() => void gonder()} className={DUGME_LAC}>
          <Send className="w-3.5 h-3.5" /> {durum === 'gidiyor' ? 'Gönderiliyor…' : 'Ajansa gönder'}
        </button>
        {onKapat && <button type="button" onClick={onKapat} className={DUGME_BOS}>Vazgeç</button>}
        {durum === 'gitti' && <span className={`text-[12px] ${YAZI}`}>Ajansa yazıldı. Kems ilgili ajana verir; sonuç Onay bekleyenler'e düşer.</span>}
        {typeof durum === 'object' && <span className="text-[12px] text-[#F26B6F]">Yazılamadı: {durum.hata}</span>}
      </div>
    </div>
  );
};

interface Props {
  /** "sahip/depo" */
  depo: string;
  /** Ekranda ve istekte görünen ad (oyunun adı ya da "Ortak") */
  kaynak: string;
  /** Okunacak klasör */
  kok?: string;
  /** Gizli depo: dosyalar anahtarla okunur */
  gizli?: boolean;
  /** Değişikliği hangi ajan yapar (yeni çalışmada Kems seçer) */
  ajan: string;
  /** Hiç asset yoksa gösterilen açıklama */
  bosYazi?: string;
}

export const OyunAssetleri: React.FC<Props> = ({ depo, kaynak, kok = 'public/', gizli = false, ajan, bosYazi }) => {
  const anahtar = anahtariOku();
  const [liste, setListe] = useState<Asset[] | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [tur, setTur] = useState(0);
  const [acik, setAcik] = useState<Asset | null>(null);
  const [secim, setSecim] = useState<Set<string>>(new Set());
  const [secimModu, setSecimModu] = useState(false);
  const [yeniAcik, setYeniAcik] = useState(false);
  const acikAdres = useAdres(acik, depo);

  useEffect(() => {
    if (gizli && !anahtar) { setListe({ hata: 'Bu assetler gizli depoda; bu tarayıcıda GitHub anahtarı yok (Eksikler ve ayarlar).' }); return; }
    let iptal = false;
    setListe('yukleniyor');
    assetleriListele(depo, kok, gizli)
      .then(l => { if (!iptal) setListe(l); })
      .catch(e => { if (!iptal) setListe({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [depo, kok, gizli, anahtar, tur]);

  const gruplar = useMemo(() => (Array.isArray(liste) ? grupla(liste) : []), [liste]);
  const secilenler = Array.isArray(liste) ? liste.filter(a => secim.has(a.yol)) : [];

  const istekYaz = async (t: 'degistir' | 'yeni', assetler: Asset[], not: string) => {
    if (!anahtar) throw new Error('bu tarayıcıda GitHub anahtarı yok (Eksikler ve ayarlar)');
    await istekEkle(anahtar, { tur: 'istek', metin: istekMetni(kaynak, t, assetler, not), ekran: 'Oyunlar · Assetler', ...(t === 'degistir' ? { ajan } : {}) });
  };

  const ust = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-[13px] ${IKINCIL} min-w-0`}>
        {Array.isArray(liste) ? `${liste.length} asset · ` : ''}Okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span> · {kok}
      </span>
      <span className="flex-1" />
      <button type="button" onClick={() => { setSecimModu(m => !m); setSecim(new Set()); setYeniAcik(false); }} className={secimModu ? DUGME_LAC : DUGME_BOS}>
        <Sparkles className="w-3.5 h-3.5" /> {secimModu ? 'Seçimi bitir' : 'Yeni çalışma başlat'}
      </button>
      <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      {!gizli && <a href={depoSayfasi(depo)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>}
    </div>
  );

  if (liste === 'yukleniyor') return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Assetler okunuyor…</p></div>;
  if (!Array.isArray(liste)) return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Okunamadı: {liste.hata}</p></div>;

  return (
    <div className="space-y-4">
      {ust}
      {secimModu && (
        <div className={`${KART} p-4 space-y-3`}>
          <p className={`text-[13px] ${YAZI}`}>Kullanmak istediğin assetlere dokun ({secilenler.length} seçili), sonra ne istediğini yaz.</p>
          {secilenler.length > 0 && !yeniAcik && <button type="button" onClick={() => setYeniAcik(true)} className={DUGME_LAC}>Seçtiklerimle devam et</button>}
          {yeniAcik && (
            <IstekKutusu baslik={`Yeni çalışma · ${secilenler.length} asset`}
              aciklama="Kems işi uygun ajana verir; sonuç Onay bekleyenler'e düşer."
              ornek="Örneğin: bu üç dondurmayla yaz menüsü afişi"
              onGonder={async not => { await istekYaz('yeni', secilenler, not); setSecim(new Set()); }}
              onKapat={() => setYeniAcik(false)} />
          )}
        </div>
      )}
      {liste.length === 0 && <p className={`text-[14px] ${IKINCIL}`}>{bosYazi || 'Bu klasörde görsel ya da 3B model yok.'}</p>}
      {gruplar.map(g => (
        <section key={g.grup} className="space-y-2">
          <p className={`text-[13px] font-semibold ${YAZI}`}>{g.grup} <span className={`font-normal ${IKINCIL}`}>· {g.assetler.length}</span></p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {g.assetler.map(a => {
              const secili = secim.has(a.yol);
              return (
                <button key={a.yol} type="button" title={a.yol}
                  onClick={() => {
                    if (!secimModu) { setAcik(a); return; }
                    setSecim(s => { const y = new Set(s); if (y.has(a.yol)) y.delete(a.yol); else y.add(a.yol); return y; });
                  }}
                  className={`${KART} relative p-2 flex flex-col gap-1 cursor-pointer text-left ${secili ? 'ring-2 ring-[#F26B6F]' : 'hover:ring-2 hover:ring-[#F26B6F]/40'}`}>
                  <span className="aspect-square w-full flex items-center justify-center overflow-hidden rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B]"><Kucuk a={a} depo={depo} /></span>
                  <span className={`text-[11px] truncate ${IKINCIL}`}>{a.ad}</span>
                  {secili && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#F26B6F] flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {acik && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setAcik(null)}>
          <div className={`${KART} w-full max-w-3xl max-h-[92vh] overflow-auto p-4 space-y-3`} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <p className={`flex-1 min-w-0 text-[14px] font-semibold break-all ${YAZI}`}>{acik.ad}<span className={`block text-[12px] font-normal ${IKINCIL}`}>{kaynak} · {acik.yol}</span></p>
              <button type="button" onClick={() => setAcik(null)} aria-label="Kapat" className={`w-11 h-11 flex items-center justify-center ${IKINCIL} cursor-pointer`}><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] flex items-center justify-center min-h-48">
              {!acikAdres ? <p className={`text-[13px] ${IKINCIL}`}>Açılıyor…</p>
                : acik.tur === 'model' ? <ModelGoster adres={acikAdres} ad={acik.ad} />
                  : <img src={acikAdres} alt={acik.ad} className="max-h-[60vh] object-contain" />}
            </div>
            <IstekKutusu key={acik.yol} baslik="Ajana değiştirt"
              aciklama="Notun ajansa gider; değişiklik oyuna senin onayınla, ayrı bir PR'la girer."
              ornek="Örneğin: tenteyi daha koyu mor yap"
              onGonder={not => istekYaz('degistir', [acik], not)} />
          </div>
        </div>
      )}
    </div>
  );
};
