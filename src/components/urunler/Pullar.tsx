import React, { useEffect, useId, useMemo, useState } from 'react';
import { ExternalLink, Inbox, X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { gorselAdresi } from '../../lib/geceTuru';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import {
  AY_ADLARI, PUL_DURUMLARI, pulAdi, pulKaydet, pulOzeti, pullariOku, pulSerisi,
  type PulKaydi, type PullarDosyasi, type PulOyunu, type PulTasarimDurumu,
} from '../../lib/pullar';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Ürünler → Pullar (15 Kasım, Kemal). Bütün oyunların pul koleksiyonu,
 * oyunlardaki düzenle: yıl bölümü; her çeyrek bir satırda üç aylık pul ve
 * yanında büyük 4. pul, altında çeyrek ve yıl. Pula dokununca ayrıntı
 * paneli açılır: durum, küçük resim, ayın görevi, Canva bağlantısı. Kemal
 * durumu ve Canva bağlantısını değiştirip "Kaydet"e basınca KKM ajansın
 * `kkm/pullar.json`'una yazar (`lib/pullar.ts`). KKM kayıtlarına hiçbir şey
 * yazılmaz. Pul çizimi kart oyunundaki pulun dilinde (tırtıklı kenar, ince
 * çerçeve; büyük pulda çift çerçeve ve köşe süsü), burada yeniden yazıldı.
 */

const hata = (e: unknown) => (e instanceof Error ? e.message : String(e));
const cip = (on: boolean) => `min-h-9 px-3 rounded-full text-[12px] font-semibold border cursor-pointer inline-flex items-center gap-1.5 ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI} hover:border-[#F26B6F]`}`;

/** Durumun rengi: tasarlanmadı soluk, taslak kiremit, onaylı krem */
const DURUM_RENGI: Record<PulTasarimDurumu, string> = { tasarlanmadi: '#6B7699', taslak: '#F26B6F', onayli: '#F3EFE8' };
const DURUM_ETIKETI: Record<PulTasarimDurumu, string> = {
  tasarlanmadi: 'border border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9]',
  taslak: 'bg-[#F26B6F]/15 text-[#B8474B] dark:text-[#F7A3A6]',
  onayli: 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]',
};
const durumAdi = (d: PulTasarimDurumu) => PUL_DURUMLARI.find(x => x.id === d)?.ad || d;

/** Pulun küçük resmi: tam adres olduğu gibi; ajansın deposundaki yol anahtarla indirilir */
function useResim(anahtar: string | null, gorsel?: string): string | null {
  const [adres, setAdres] = useState<string | null>(null);
  useEffect(() => {
    setAdres(null);
    if (!gorsel) return;
    if (/^https?:\/\//.test(gorsel)) { setAdres(gorsel); return; }
    if (!anahtar) return;
    let iptal = false;
    gorselAdresi(anahtar, 'main', gorsel.replace(/^\/+/, '')).then(a => { if (!iptal) setAdres(a); }).catch(() => undefined);
    return () => { iptal = true; };
  }, [anahtar, gorsel]);
  return adres;
}

// Ölçüler pul biriminde; ekrandaki boyutu sınıf verir
const OLCU = { kucuk: { en: 50, boy: 60, pay: 6.5 }, buyuk: { en: 66, boy: 80, pay: 7 } };

function tirtiklar(en: number, boy: number, r = 2.1, aralik = 6.2) {
  const d: Array<[number, number]> = [];
  const yatay = Math.max(2, Math.round(en / aralik)), dikey = Math.max(2, Math.round(boy / aralik));
  for (let i = 0; i < yatay; i++) { const x = ((i + 0.5) * en) / yatay; d.push([x, 0], [x, boy]); }
  for (let i = 0; i < dikey; i++) { const y = ((i + 0.5) * boy) / dikey; d.push([0, y], [en, y]); }
  return d.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={r} fill="#000" />);
}

/** Kodla çizilen pul: tırtıklı kenar, ince çerçeve; resim varsa içinde */
const PulCizimi: React.FC<{ durum: PulTasarimDurumu; buyuk?: boolean; resim?: string | null; soluk?: boolean; className?: string }> = ({ durum, buyuk, resim, soluk, className = '' }) => {
  const id = useId().replace(/:/g, '');
  const o = buyuk ? OLCU.buyuk : OLCU.kucuk;
  const ic = { x: o.pay, y: o.pay, w: o.en - 2 * o.pay, h: o.boy - 2 * o.pay };
  const tasarli = durum !== 'tasarlanmadi';
  const zemin = tasarli ? '#F3EFE8' : '#4A5478';
  const cizgi = tasarli ? '#0E1C4F' : '#7983A6';
  const sus = 3.2;
  return (
    <svg viewBox={`0 0 ${o.en} ${o.boy}`} className={`${className} ${soluk ? 'opacity-45' : ''}`} aria-hidden="true">
      <defs>
        <mask id={`t-${id}`}>
          <rect width={o.en} height={o.boy} fill="#fff" />
          {tirtiklar(o.en, o.boy)}
        </mask>
      </defs>
      <rect width={o.en} height={o.boy} fill={zemin} mask={`url(#t-${id})`} />
      {resim && <image href={resim} x={ic.x} y={ic.y} width={ic.w} height={ic.h} preserveAspectRatio="xMidYMid slice" />}
      <rect x={ic.x} y={ic.y} width={ic.w} height={ic.h} fill="none" stroke={cizgi} strokeWidth={0.8} />
      {buyuk && (
        <>
          <rect x={ic.x + sus} y={ic.y + sus} width={ic.w - 2 * sus} height={ic.h - 2 * sus} fill="none" stroke={cizgi} strokeWidth={0.6} />
          {[[ic.x, ic.y], [ic.x + ic.w, ic.y], [ic.x, ic.y + ic.h], [ic.x + ic.w, ic.y + ic.h]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 2.2} L${x + 2.2} ${y} L${x} ${y + 2.2} L${x - 2.2} ${y} Z`} fill={cizgi} />
          ))}
        </>
      )}
    </svg>
  );
};

/** Seri içindeki pul düğmesi: çizim + köşede durumun rengi */
const PulDugmesi: React.FC<{
  anahtar: string | null; pulAnahtari: string; kayit?: PulKaydi; buyuk?: boolean; soluk?: boolean; secili: boolean; onSec: () => void;
}> = ({ anahtar, pulAnahtari, kayit, buyuk, soluk, secili, onSec }) => {
  const durum = kayit?.durum || 'tasarlanmadi';
  const resim = useResim(anahtar, kayit?.gorsel);
  return (
    <button type="button" onClick={onSec} title={`${pulAdi(pulAnahtari)} · ${durumAdi(durum)}`}
      aria-label={`${pulAdi(pulAnahtari)}, ${durumAdi(durum)}`}
      className={`relative shrink-0 rounded-md cursor-pointer outline-offset-2 ${secili ? 'outline-2 outline-[#F26B6F] outline' : 'hover:outline hover:outline-1 hover:outline-[#F3EFE8]/40'}`}>
      <PulCizimi durum={durum} buyuk={buyuk} resim={resim} soluk={soluk}
        className={buyuk ? 'block w-[64px] h-[78px] sm:w-[76px] sm:h-[92px]' : 'block w-[46px] h-[55px] sm:w-[56px] sm:h-[67px]'} />
      {durum !== 'tasarlanmadi' && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full ring-2 ring-[#0E1C4F]" style={{ background: DURUM_RENGI[durum] }} />
      )}
    </button>
  );
};

export default function Pullar({ onAjans, onOnay }: { onAjans: () => void; onOnay: () => void }) {
  const anahtar = anahtariOku();
  const [veri, setVeri] = useState<PullarDosyasi | null | undefined>(undefined);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [oyunId, setOyunId] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    pullariOku(anahtar).then(d => { if (!iptal) setVeri(d); }).catch(e => { if (!iptal) setOkumaHatasi(hata(e)); });
    return () => { iptal = true; };
  }, [anahtar]);

  const oyun = veri?.oyunlar.find(o => o.id === oyunId) || veri?.oyunlar[0] || null;
  const seri = useMemo(() => (oyun ? pulSerisi(oyun.baslangic) : []), [oyun]);

  let govde: React.ReactNode;
  if (!anahtar) {
    govde = (
      <section className={`${KART} p-4 text-[13px] ${YAZI}`}>
        Pullar ajansın deposundan okunur; bu tarayıcıda Ajans bağlantısı yok.{' '}
        <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button>
      </section>
    );
  } else if (okumaHatasi) {
    govde = <p className={`${KART} p-4 text-[13px] ${YAZI}`}>Pul kaydı okunamadı: {okumaHatasi}. Bir şey yazılmadı; sayfayı yenileyip yeniden dene.</p>;
  } else if (veri === undefined) {
    govde = <p className={`text-[13px] ${IKINCIL}`}>Pul kaydı okunuyor…</p>;
  } else if (veri === null || !oyun) {
    govde = <p className={`${KART} p-4 text-[13px] ${YAZI}`}>Pul kaydı henüz yok. Ajans <code className="text-[12px]">kkm/pullar.json</code> dosyasını açınca pullar burada görünür.</p>;
  } else {
    const kayitlar = veri.pullar[oyun.id] || {};
    govde = (
      <div className="space-y-3">
        {/* Oyun düğmeleri ve özet: sayılar yalnız kayıttan */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Oyunlar">
          {veri.oyunlar.map(o => {
            const s = pulOzeti(veri.pullar[o.id]);
            return (
              <button key={o.id} type="button" role="tab" aria-selected={o.id === oyun.id} onClick={() => { setOyunId(o.id); setSecili(null); }} className={cip(o.id === oyun.id)}>
                {o.ad}
                <span className="font-normal tabular-nums opacity-80">{s.tasarlandi}</span>
              </button>
            );
          })}
        </div>
        <OzetSeridi oyun={oyun} kayitlar={kayitlar} onOnay={onOnay} />

        {[...seri].reverse().map(y => (
          <section key={y.yil} className="rounded-2xl bg-[#0E1C4F] dark:bg-[#0B132B] dark:border dark:border-[#2C3C72] px-3 py-3 sm:px-5 sm:py-4">
            <h2 className="text-[13px] font-bold tracking-wide text-[#F3EFE8]/65 mb-2">{y.yil}</h2>
            <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
              {y.ceyrekler.map(c => (
                <figure key={c.anahtar} className="flex flex-col items-center">
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    {c.aylar.map(a => (
                      <PulDugmesi key={a.anahtar} anahtar={anahtar} pulAnahtari={a.anahtar} kayit={kayitlar[a.anahtar]}
                        soluk={a.once || a.gelecek} secili={secili === a.anahtar} onSec={() => setSecili(a.anahtar)} />
                    ))}
                    <span className="w-1" />
                    <PulDugmesi anahtar={anahtar} pulAnahtari={c.anahtar} kayit={kayitlar[c.anahtar]} buyuk
                      soluk={c.once || c.gelecek} secili={secili === c.anahtar} onSec={() => setSecili(c.anahtar)} />
                  </div>
                  <figcaption className="mt-1 text-[12px] text-[#F3EFE8]/75">{AY_ADLARI[c.ceyrek * 3 - 3]}–{AY_ADLARI[c.ceyrek * 3 - 1]} {c.yil}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}

        {secili && (
          <PulPaneli key={`${oyun.id}:${secili}`} anahtar={anahtar} oyun={oyun} pulAnahtari={secili} kayit={kayitlar[secili]}
            onKapat={() => setSecili(null)} onOnay={onOnay}
            onKaydedildi={(durum, canva) => setVeri(v => {
              if (!v) return v;
              const oyunPullari = { ...(v.pullar[oyun.id] || {}) };
              const eski = oyunPullari[secili];
              const yeni: PulKaydi = { ...(eski || {}), durum };
              if (canva) yeni.canva = canva; else delete yeni.canva;
              if (durum === 'tasarlanmadi' && !yeni.canva && !yeni.gorsel && !yeni.gorev) delete oyunPullari[secili];
              else oyunPullari[secili] = yeni;
              return { ...v, guncellendi: new Date().toISOString(), pullar: { ...v.pullar, [oyun.id]: oyunPullari } };
            })} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <SayfaBasi baslik="Pullar" />
      {govde}
    </div>
  );
}

/** Seçili oyunun özeti ve renklerin anlamı */
const OzetSeridi: React.FC<{ oyun: PulOyunu; kayitlar: Record<string, PulKaydi>; onOnay: () => void }> = ({ oyun, kayitlar, onOnay }) => {
  const s = pulOzeti(kayitlar);
  const kutu = (sayi: number, ad: string, renk: string) => (
    <span className="rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B] px-2.5 py-1.5 text-center min-w-[88px]">
      <b className={`flex items-center justify-center gap-1.5 text-[15px] tabular-nums ${YAZI}`}><span className="w-2 h-2 rounded-full" style={{ background: renk }} />{sayi}</b>
      <span className={`block text-[10.5px] ${IKINCIL}`}>{ad}</span>
    </span>
  );
  return (
    <div className={`${KART} p-2.5 flex flex-wrap items-center gap-2`}>
      <span className={`${ETIKET} w-full sm:w-auto sm:mr-1`}>{oyun.ad}</span>
      {kutu(s.tasarlandi, 'tasarlandı', '#0E1C4F')}
      {kutu(s.onayli, 'onaylı', '#CFC5B4')}
      {kutu(s.bekliyor, 'bekliyor (taslak)', '#F26B6F')}
      {s.bekliyor > 0 && (
        <button type="button" onClick={onOnay} className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${IKINCIL} hover:text-[#F26B6F] cursor-pointer`}>
          <Inbox className="w-3.5 h-3.5" /> Taslaklar Onay bekleyenler'de
        </button>
      )}
    </div>
  );
};

/** Pula dokununca açılan ayrıntı paneli: telefonda alttan, masada sağ altta */
const PulPaneli: React.FC<{
  anahtar: string; oyun: PulOyunu; pulAnahtari: string; kayit?: PulKaydi;
  onKapat: () => void; onOnay: () => void; onKaydedildi: (durum: PulTasarimDurumu, canva: string) => void;
}> = ({ anahtar, oyun, pulAnahtari, kayit, onKapat, onOnay, onKaydedildi }) => {
  const ilkDurum = kayit?.durum || 'tasarlanmadi';
  const [durum, setDurum] = useState<PulTasarimDurumu>(ilkDurum);
  const [canva, setCanva] = useState(kayit?.canva || '');
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const resim = useResim(anahtar, kayit?.gorsel);
  const buyuk = pulAnahtari.includes('-Q');
  const canvaTemiz = canva.trim();
  const canvaGecersiz = !!canvaTemiz && !/^https?:\/\//.test(canvaTemiz);
  const degisti = durum !== ilkDurum || canvaTemiz !== (kayit?.canva || '');
  const gorev = kayit?.gorev || (buyuk ? null : oyun.kosul) || null;

  const kaydet = async () => {
    setMesgul(true); setMesaj(null);
    try {
      await pulKaydet(anahtar, oyun, pulAnahtari, { durum, canva: canvaTemiz });
      onKaydedildi(durum, canvaTemiz);
      setMesaj('Kaydedildi.');
    } catch (e) {
      setMesaj(`Yazılamadı: ${hata(e)}`);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#0E1C4F]/30 lg:bg-transparent" onClick={onKapat} />
      <section role="dialog" aria-label={pulAdi(pulAnahtari)}
        className={`${KART} fixed z-50 inset-x-2 bottom-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[380px] p-3.5 space-y-3 shadow-xl max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-[#0E1C4F] dark:bg-[#0B132B] p-2 shrink-0">
            <PulCizimi durum={durum} buyuk={buyuk} resim={resim} className={buyuk ? 'block w-[66px] h-[80px]' : 'block w-[56px] h-[67px]'} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className={ETIKET}>{oyun.ad}</div>
            <div className={`text-[15px] font-bold leading-snug ${YAZI}`}>{pulAdi(pulAnahtari)}</div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${DURUM_ETIKETI[ilkDurum]}`}>{durumAdi(ilkDurum)}</span>
            {ilkDurum === 'taslak' && (
              <button type="button" onClick={onOnay} className={`flex items-center gap-1 text-[11px] font-semibold ${IKINCIL} hover:text-[#F26B6F] cursor-pointer`}>
                <Inbox className="w-3.5 h-3.5" /> Onay bekleyenler'de
              </button>
            )}
            {!kayit?.gorsel && <p className={`text-[11px] ${IKINCIL}`}>Küçük resim yok.</p>}
          </div>
          <button type="button" onClick={onKapat} aria-label="Kapat" className={`p-1.5 rounded-lg ${IKINCIL} hover:text-[#F26B6F] cursor-pointer`}><X className="w-4 h-4" /></button>
        </div>

        <div>
          <div className={ETIKET}>{buyuk ? 'Kazanma koşulu' : kayit?.gorev ? 'Ayın görevi' : 'Kazanma koşulu'}</div>
          <p className={`text-[13px] leading-snug ${YAZI}`}>
            {buyuk ? (kayit?.gorev || 'Çeyreğin üç aylık pulu toplanınca') : (gorev || '[Kemal]')}
          </p>
        </div>

        <div>
          <div className={`${ETIKET} mb-1`}>Durum</div>
          <div className="grid grid-cols-3 gap-1.5">
            {PUL_DURUMLARI.map(d => (
              <button key={d.id} type="button" onClick={() => setDurum(d.id)} aria-pressed={durum === d.id}
                className={`min-h-10 lg:min-h-8 rounded-lg text-[12px] font-semibold border cursor-pointer inline-flex items-center justify-center gap-1.5 ${durum === d.id ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI} hover:border-[#F26B6F]`}`}>
                <span className="w-2 h-2 rounded-full ring-1 ring-[#CFC5B4]" style={{ background: DURUM_RENGI[d.id] }} />{d.ad}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={`${ETIKET} mb-1 block`} htmlFor="pul-canva">Canva bağlantısı</label>
          <div className="flex gap-1.5">
            <input id="pul-canva" type="url" value={canva} onChange={e => setCanva(e.target.value)} placeholder="https://www.canva.com/…"
              className={`flex-1 min-w-0 min-h-10 lg:min-h-8 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#0B132B] px-2.5 text-[12px] ${YAZI} focus:outline-none focus:border-[#F26B6F]`} />
            {canvaTemiz && !canvaGecersiz && (
              <a href={canvaTemiz} target="_blank" rel="noreferrer" className={DUGME_BOS} aria-label="Canva'da aç"><ExternalLink className="w-3.5 h-3.5" /></a>
            )}
          </div>
          {canvaGecersiz && <p className="mt-1 text-[11px] text-[#B8474B] dark:text-[#F7A3A6]">Bağlantı https:// ile başlamalı.</p>}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void kaydet()} disabled={mesgul || !degisti || canvaGecersiz} className={DUGME_LAC}>
            {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button type="button" onClick={onKapat} className={DUGME_BOS}>Kapat</button>
          {mesaj && <span className={`text-[11px] ${mesaj.startsWith('Yazılamadı') ? 'text-[#B8474B] dark:text-[#F7A3A6]' : IKINCIL}`}>{mesaj}</span>}
        </div>
      </section>
    </>
  );
};
