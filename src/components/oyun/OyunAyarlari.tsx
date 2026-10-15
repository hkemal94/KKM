import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, KeyRound, RefreshCw, Search, Send, Undo2 } from 'lucide-react';
import { depoSayfasi } from '../../lib/depoBelgesi';
import {
  AYAR_YOLU, anahtariOku, anahtariYaz, ayarlariOku, degisiklikListesi, oyunaGonder, sayiyaCevir, yeniDosya,
  type Ayar, type AyarBolumu, type AyarDosyasi, type Degisiklikler
} from '../../lib/oyunAyarlari';
import { useKaydedilmemis } from '../../lib/kaydedilmemis';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyun → Ayarlar (15 Ekim; `lib/oyunAyarlari.ts`). Oyunun deposundaki ayar
 * dosyası her açılışta canlı okunur. Kemal sayıları değiştirir, "Oyuna gönder"
 * deyince oyunun deposunda PR açılır; birleştirme GitHub'da Kemal'in.
 * KKM kayıtlarına hiçbir şey yazılmaz.
 */

const kutu = 'w-full text-[14px] bg-[#F3EFE8] dark:bg-[#0B132B] text-[#0E1C4F] dark:text-[#F3EFE8] rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-[#F26B6F]/50';

/** GitHub anahtarı: yoksa nasıl alınacağı ve kutu; varsa kaldırma düğmesi */
const AnahtarKarti: React.FC<{ anahtar: string; onDegis: (a: string) => void }> = ({ anahtar, onDegis }) => {
  const [yazi, setYazi] = useState('');
  if (anahtar)
    return (
      <div className={`${KART} p-3 flex flex-wrap items-center gap-2`}>
        <KeyRound className="w-4 h-4 text-[#D6484C] dark:text-[#F26B6F]" />
        <span className={`text-[13px] ${YAZI} flex-1 min-w-0`}>GitHub anahtarı bu tarayıcıda kayıtlı. KKM kayıtlarına yazılmaz.</span>
        <button type="button" className={DUGME_BOS} onClick={() => { anahtariYaz(''); onDegis(''); }}>Anahtarı kaldır</button>
      </div>
    );
  return (
    <div className={`${KART} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-[#D6484C] dark:text-[#F26B6F]" />
        <h3 className={`text-[15px] font-bold ${YAZI}`}>Oyuna göndermek için GitHub anahtarı</h3>
      </div>
      <ol className={`text-[13px] ${IKINCIL} list-decimal pl-5 space-y-1`}>
        <li>GitHub → sağ üstte resmin → <b>Settings</b> → en altta <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
        <li>Ad ver (ör. "KKM ayarlar"), süreyi seç. <b>Repository access</b>: <b>Only select repositories</b> → yalnız oyunun deposu.</li>
        <li><b>Permissions</b> → <b>Contents</b>: Read and write, <b>Pull requests</b>: Read and write. <b>Generate token</b>.</li>
        <li>Çıkan anahtarı kopyala, aşağıya yapıştır.</li>
      </ol>
      <p className={`text-[12px] ${IKINCIL}`}>Anahtar yalnız bu tarayıcıda durur; KKM kayıtlarına yazılmaz, yalnız GitHub'a gider. Başka cihazda yeniden girilir.</p>
      <div className="flex gap-2">
        <input type="password" value={yazi} onChange={e => setYazi(e.target.value)} placeholder="github_pat_…" className={kutu} autoComplete="off" spellCheck={false} />
        <button type="button" className={DUGME_LAC} disabled={!yazi.trim()} onClick={() => { anahtariYaz(yazi); onDegis(yazi.trim()); setYazi(''); }}>Kaydet</button>
      </div>
    </div>
  );
};

export const OyunAyarlari: React.FC<{ depo: string }> = ({ depo }) => {
  const [okunan, setOkunan] = useState<{ dosya: AyarDosyasi; ham: string } | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [tur, setTur] = useState(0);
  // Kutulardaki yazılar ("bolum.anahtar" → yazı); yalnız değişenler
  const [yazilar, setYazilar] = useState<Record<string, string>>({});
  const [ara, setAra] = useState('');
  const [anahtar, setAnahtar] = useState(anahtariOku);
  const [gonderim, setGonderim] = useState<'bos' | 'gidiyor' | { pr: string } | { hata: string }>('bos');

  useEffect(() => {
    let iptal = false;
    setOkunan('yukleniyor');
    ayarlariOku(depo)
      .then(o => { if (!iptal) setOkunan(o); })
      .catch(e => { if (!iptal) setOkunan({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [depo, tur]);

  const dosya = typeof okunan === 'object' && 'dosya' in okunan ? okunan.dosya : null;
  // Geçerli değişiklikler ve hatalı kutular
  const { degisiklikler, hatalilar } = useMemo(() => {
    const d: Degisiklikler = {};
    const h = new Set<string>();
    for (const [k, y] of Object.entries(yazilar) as [string, string][]) {
      const n = sayiyaCevir(y);
      if (n === null) h.add(k); else d[k] = n;
    }
    return { degisiklikler: d, hatalilar: h };
  }, [yazilar]);
  const satirlar = useMemo(() => (dosya ? degisiklikListesi(dosya, degisiklikler) : []), [dosya, degisiklikler]);
  useKaydedilmemis(satirlar.length > 0);

  const ust = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-[13px] ${IKINCIL} min-w-0 break-all`}>
        Depodan okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span> · {AYAR_YOLU}
      </span>
      <span className="flex-1" />
      <button type="button" onClick={() => { if (satirlar.length && !window.confirm('Değişiklikler silinsin, dosya yeniden okunsun mu?')) return; setYazilar({}); setGonderim('bos'); setTur(t => t + 1); }} className={DUGME_BOS}>
        <RefreshCw className="w-3.5 h-3.5" /> Yenile
      </button>
      <a href={depoSayfasi(depo, AYAR_YOLU)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
    </div>
  );

  if (okunan === 'yukleniyor') return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Ayarlar okunuyor…</p></div>;
  if (!dosya) return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Okunamadı: {'hata' in okunan ? okunan.hata : ''}</p></div>;

  const arama = ara.trim().toLocaleLowerCase('tr');
  const gonder = async () => {
    if (!anahtar || !satirlar.length || hatalilar.size || typeof okunan !== 'object' || !('ham' in okunan)) return;
    setGonderim('gidiyor');
    try {
      const pr = await oyunaGonder(anahtar, depo, okunan.ham, yeniDosya(dosya, degisiklikler), satirlar);
      setGonderim({ pr });
      setYazilar({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setGonderim({ hata: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {ust}
      <p className={`text-[13px] ${IKINCIL}`}>
        Oyundaki bütün fiyat, süre ve oranlar. Bir sayıyı değiştir, en altta <b>Oyuna gönder</b>'e bas: oyunun deposunda PR açılır,
        GitHub'da birleştirince oyun yeni değerlerle kurulur. Birleşene kadar burada eski değerler görünür.
      </p>
      <AnahtarKarti anahtar={anahtar} onDegis={setAnahtar} />
      {typeof gonderim === 'object' && 'pr' in gonderim && (
        <div className={`${KART} p-3 text-[14px] ${YAZI}`}>
          PR açıldı: <a href={gonderim.pr} target="_blank" rel="noreferrer" className="underline decoration-[#F26B6F] underline-offset-2 break-all">{gonderim.pr}</a>. Birleştirince oyuna geçer.
        </div>
      )}
      <label className="relative block">
        <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${IKINCIL}`} />
        <input value={ara} onChange={e => setAra(e.target.value)} placeholder="Ayar ara (ör. kup, yevmiye, çilek)" className={`${kutu} pl-9`} />
      </label>
      {(Object.entries(dosya.bolumler) as [string, AyarBolumu][]).map(([bolumId, b]) => {
        const ayarlar = (Object.entries(b.ayarlar) as [string, Ayar][]).filter(([, a]) => !arama || a.ad.toLocaleLowerCase('tr').includes(arama) || b.ad.toLocaleLowerCase('tr').includes(arama));
        if (!ayarlar.length) return null;
        return (
          <section key={bolumId} className={`${KART} p-4 space-y-2`}>
            <div>
              <h3 className={`text-[15px] font-bold ${YAZI}`}>{b.ad}</h3>
              {b.aciklama && <p className={`text-[12px] ${IKINCIL}`}>{b.aciklama}</p>}
            </div>
            <div className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
              {ayarlar.map(([anahtarAdi, a]) => {
                const k = `${bolumId}.${anahtarAdi}`;
                const yazi = yazilar[k] ?? String(a.deger).replace('.', ',');
                const yeni = degisiklikler[k];
                const degisti = yeni !== undefined && yeni !== a.deger;
                const hatali = hatalilar.has(k);
                return (
                  <div key={k} className={`py-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${degisti ? 'bg-[#F26B6F]/10 -mx-2 px-2 rounded-lg' : ''}`}>
                    <div className="flex-1 min-w-[12rem]">
                      <div className={`text-[14px] ${YAZI}`}>{a.ad}</div>
                      {(a.not || degisti) && (
                        <div className={`text-[12px] ${IKINCIL}`}>
                          {degisti && <span className="font-semibold text-[#D6484C] dark:text-[#F26B6F]">eski: {String(a.deger).replace('.', ',')}</span>}
                          {degisti && a.not ? ' · ' : ''}{a.not}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={yazi}
                        onChange={e => {
                          const v = e.target.value;
                          setYazilar(y => {
                            const kopya = { ...y };
                            if (sayiyaCevir(v) === a.deger) delete kopya[k]; else kopya[k] = v;
                            return kopya;
                          });
                        }}
                        aria-label={a.ad}
                        className={`${kutu} w-24 text-right ${hatali ? 'ring-2 ring-[#D6484C]' : ''}`}
                      />
                      <span className={`text-[12px] ${IKINCIL} w-24`}>{a.birim || ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {(satirlar.length > 0 || hatalilar.size > 0 || gonderim === 'gidiyor' || (typeof gonderim === 'object' && 'hata' in gonderim)) && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 lg:pl-72">
          <div className={`${KART} p-3 shadow-lg flex flex-wrap items-center gap-2 max-w-3xl mx-auto`}>
            <span className={`${ETIKET} flex-1 min-w-0`}>
              {hatalilar.size > 0 ? `${hatalilar.size} kutuda sayı yok` : `${satirlar.length} değişiklik`}
              {typeof gonderim === 'object' && 'hata' in gonderim && <span className="block normal-case tracking-normal font-sans text-[12px] text-[#D6484C] dark:text-[#F26B6F]">{gonderim.hata}</span>}
              {!anahtar && satirlar.length > 0 && <span className="block normal-case tracking-normal font-sans text-[12px]">Göndermek için yukarıya GitHub anahtarı gir</span>}
            </span>
            <button type="button" className={DUGME_BOS} onClick={() => { setYazilar({}); setGonderim('bos'); }}><Undo2 className="w-3.5 h-3.5" /> Geri al</button>
            <button type="button" className={DUGME_LAC} disabled={!anahtar || !satirlar.length || hatalilar.size > 0 || gonderim === 'gidiyor'} onClick={gonder}>
              <Send className="w-3.5 h-3.5" /> {gonderim === 'gidiyor' ? 'Gönderiliyor…' : 'Oyuna gönder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
