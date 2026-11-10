import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, Plus, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react';
import { depoSayfasi } from '../../lib/depoBelgesi';
import { anahtariOku, sayiyaCevir } from '../../lib/oyunAyarlari';
import {
  DK_AYAR_YOLU, dkAyarOku, dkDegisiklikler, dkDenetle, dkGonder, hediyeTasi, kostumResmi, urunResmi,
  type Basamak, type DkAyar, type DkIlkBolum
} from '../../lib/dkLiteAyarlari';
import { useKaydedilmemis } from '../../lib/kaydedilmemis';
import { SekmeCipleri } from '../urunler/SekmeCipleri';
import { AnahtarKarti } from './OyunAyarlari';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Oyunlar → DK Lite → Ayarlar: DK Lite paneli (`lib/dkLiteAyarlari.ts`). Dört sekme: Hediyeler
 * (sürükle bırak), Lokasyonlar, Mağaza, Bölümler. Değişiklik "Oyuna gönder" ile DK Lite deposuna
 * PR olur; birleştiren Kemal. KKM kayıtlarına hiçbir şey yazılmaz.
 */

const kutu = 'w-full text-[14px] bg-[#F3EFE8] dark:bg-[#0B132B] text-[#0E1C4F] dark:text-[#F3EFE8] rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-[#F26B6F]/50';
// Sayı kutusu: genişliği kendisi verir (w-full yok)
const sayiKutusu = 'shrink-0 text-[14px] bg-[#F3EFE8] dark:bg-[#0B132B] text-[#0E1C4F] dark:text-[#F3EFE8] rounded-xl px-2 py-2 focus:outline-hidden focus:ring-2 focus:ring-[#F26B6F]/50';
const kucukDugme = 'w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] disabled:opacity-30 cursor-pointer';

type Sekme = 'hediye' | 'lokasyon' | 'magaza' | 'bolum';
const kopya = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Sayı kutusu: yazı serbest (virgül de olur); geçersizse kırmızı, değere NaN gider (denetim yakalar) */
const Sayi: React.FC<{ deger: number; onDegis: (n: number) => void; etiket: string; genislik?: string }> = ({ deger, onDegis, etiket, genislik = 'w-20' }) => {
  const [yazi, setYazi] = useState(Number.isFinite(deger) ? String(deger).replace('.', ',') : '');
  useEffect(() => {
    if (sayiyaCevir(yazi) !== deger && Number.isFinite(deger)) setYazi(String(deger).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deger]);
  const gecersiz = sayiyaCevir(yazi) === null;
  return (
    <input
      inputMode="decimal" aria-label={etiket} value={yazi}
      onChange={e => { setYazi(e.target.value); const n = sayiyaCevir(e.target.value); onDegis(n === null ? NaN : n); }}
      className={`${sayiKutusu} ${genislik} text-right ${gecersiz ? 'ring-2 ring-[#D6484C]' : ''}`}
    />
  );
};

/** Etiketli satır */
const Satir: React.FC<{ ad: string; not?: string; children: React.ReactNode }> = ({ ad, not, children }) => (
  <div className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
    <div className="flex-1 min-w-[10rem]">
      <div className={`text-[14px] ${YAZI}`}>{ad}</div>
      {not && <div className={`text-[12px] ${IKINCIL}`}>{not}</div>}
    </div>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const Bolum: React.FC<{ baslik: string; aciklama?: string; children: React.ReactNode }> = ({ baslik, aciklama, children }) => (
  <section className={`${KART} p-4 space-y-2`}>
    <div>
      <h3 className={`text-[15px] font-bold ${YAZI}`}>{baslik}</h3>
      {aciklama && <p className={`text-[12px] ${IKINCIL}`}>{aciklama}</p>}
    </div>
    {children}
  </section>
);

export const DkLitePaneli: React.FC<{ depo: string }> = ({ depo }) => {
  const [okunan, setOkunan] = useState<{ dosya: DkAyar; ham: string } | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [taslak, setTaslak] = useState<DkAyar | null>(null);
  const [tur, setTur] = useState(0);
  const [sekme, setSekme] = useState<Sekme>('hediye');
  const [anahtar, setAnahtar] = useState(anahtariOku);
  const [gonderim, setGonderim] = useState<'bos' | 'gidiyor' | { pr: string } | { hata: string }>('bos');

  useEffect(() => {
    let iptal = false;
    setOkunan('yukleniyor');
    dkAyarOku(depo)
      .then(o => { if (!iptal) { setOkunan(o); setTaslak(kopya(o.dosya)); } })
      .catch(e => { if (!iptal) setOkunan({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [depo, tur]);

  const asil = typeof okunan === 'object' && 'dosya' in okunan ? okunan.dosya : null;
  const satirlar = useMemo(() => (asil && taslak ? dkDegisiklikler(asil, taslak) : []), [asil, taslak]);
  const sorunlar = useMemo(() => (taslak ? dkDenetle(taslak) : []), [taslak]);
  useKaydedilmemis(satirlar.length > 0);

  /** Taslağı değiştir (kopya üzerinde) */
  const degis = (f: (a: DkAyar) => void) => setTaslak(t => { if (!t) return t; const k = kopya(t); f(k); return k; });

  const ust = (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-[13px] ${IKINCIL} min-w-0 break-all`}>
        Depodan okunuyor: <span className={`font-semibold ${YAZI}`}>{depo}</span> · {DK_AYAR_YOLU}
      </span>
      <span className="flex-1" />
      <button type="button" className={DUGME_BOS} onClick={() => {
        if (satirlar.length && !window.confirm('Değişiklikler silinsin, dosya yeniden okunsun mu?')) return;
        setGonderim('bos'); setTur(x => x + 1);
      }}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      <a href={depoSayfasi(depo, DK_AYAR_YOLU)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
    </div>
  );

  if (okunan === 'yukleniyor') return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Ayarlar okunuyor…</p></div>;
  if (!asil || !taslak) return <div className="space-y-4">{ust}<p className={`text-[14px] ${IKINCIL}`}>Okunamadı: {'hata' in okunan ? okunan.hata : ''}</p></div>;

  const gonder = async () => {
    if (!anahtar || !satirlar.length || sorunlar.length || !('ham' in okunan)) return;
    setGonderim('gidiyor');
    try {
      const pr = await dkGonder(anahtar, depo, okunan.ham, taslak, satirlar);
      setGonderim({ pr });
      setTur(x => x + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setGonderim({ hata: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4 pb-32">
      {ust}
      <p className={`text-[13px] ${IKINCIL}`}>
        DK Lite'ın hediyeleri, lokasyonları, mağazası ve bölüm ayarları. Değiştir, en altta <b>Oyuna gönder</b>'e bas: DK Lite deposunda
        öneri (PR) açılır, GitHub'da birleştirince oyuna girer. Yeni çizim (ürün, kostüm, lokasyon resmi) ve yeni tema görünüşü ekipten gelir;
        burada yalnız var olanlar seçilir ve düzenlenir.
      </p>
      <AnahtarKarti anahtar={anahtar} onDegis={setAnahtar} depoNotu="yalnız DK Lite deposu (hkemal94/dk-lite)" />
      {typeof gonderim === 'object' && 'pr' in gonderim && (
        <div className={`${KART} p-3 text-[14px] ${YAZI}`}>
          Öneri açıldı: <a href={gonderim.pr} target="_blank" rel="noreferrer" className="underline decoration-[#F26B6F] underline-offset-2 break-all">{gonderim.pr}</a>. Birleştirince oyuna geçer.
        </div>
      )}
      <SekmeCipleri<Sekme>
        etiket="DK Lite paneli"
        sekmeler={[{ id: 'hediye', ad: 'Hediyeler' }, { id: 'lokasyon', ad: 'Lokasyonlar' }, { id: 'magaza', ad: 'Mağaza' }, { id: 'bolum', ad: 'Bölümler' }]}
        aktif={sekme} onSec={setSekme}
      />
      {sekme === 'hediye' && <Hediyeler a={taslak} depo={depo} degis={degis} />}
      {sekme === 'lokasyon' && <Lokasyonlar a={taslak} degis={degis} />}
      {sekme === 'magaza' && <Magaza a={taslak} depo={depo} degis={degis} />}
      {sekme === 'bolum' && <Bolumler a={taslak} degis={degis} />}

      {(satirlar.length > 0 || gonderim === 'gidiyor' || (typeof gonderim === 'object' && 'hata' in gonderim)) && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 lg:pl-16">
          <div className={`${KART} p-3 shadow-lg max-w-3xl mx-auto space-y-2`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${ETIKET} flex-1 min-w-0`}>
                {sorunlar.length ? `${sorunlar.length} sorun var, gönderilemez` : `${satirlar.length} değişiklik`}
                {!anahtar && <span className="block normal-case tracking-normal font-sans text-[12px]">Göndermek için yukarıya GitHub anahtarı gir</span>}
              </span>
              <button type="button" className={DUGME_BOS} onClick={() => { setTaslak(kopya(asil)); setGonderim('bos'); }}><Undo2 className="w-3.5 h-3.5" /> Geri al</button>
              <button type="button" className={DUGME_LAC} disabled={!anahtar || !satirlar.length || sorunlar.length > 0 || gonderim === 'gidiyor'} onClick={gonder}>
                <Send className="w-3.5 h-3.5" /> {gonderim === 'gidiyor' ? 'Gönderiliyor…' : 'Oyuna gönder'}
              </button>
            </div>
            {sorunlar.length > 0 && (
              <ul className="text-[12px] text-[#D6484C] dark:text-[#F26B6F] list-disc pl-5 max-h-24 overflow-y-auto">
                {sorunlar.map(s => <li key={s}>{s}</li>)}
              </ul>
            )}
            {!sorunlar.length && (
              <details className={`text-[12px] ${IKINCIL}`}>
                <summary className="cursor-pointer">Neler değişti</summary>
                <ul className="list-disc pl-5 max-h-32 overflow-y-auto">{satirlar.map(s => <li key={s}>{s}</li>)}</ul>
              </details>
            )}
            {typeof gonderim === 'object' && 'hata' in gonderim && <p className="text-[12px] text-[#D6484C] dark:text-[#F26B6F]">{gonderim.hata}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

type Degis = (f: (a: DkAyar) => void) => void;

// ------------------------------------------------------------ Hediyeler
/**
 * Sürükle bırak: soldaki tutamaktan tutup sürükle (telefonda parmakla da olur). Ürünler yer değiştirir,
 * bölüm numaraları yerinde kalır ("5. bölümün hediyesi şu olsun"). Bölüm numarası kutudan da değişir.
 */
const Hediyeler: React.FC<{ a: DkAyar; depo: string; degis: Degis }> = ({ a, depo, degis }) => {
  const satirlar = useRef<(HTMLDivElement | null)[]>([]);
  const [surukle, setSurukleDurum] = useState<{ nereden: number; nereye: number } | null>(null);
  // Olay işleyicileri ekranın yeniden çizilmesini beklemeden son durumu okusun diye ayrıca tutulur
  const surukleRef = useRef<{ nereden: number; nereye: number } | null>(null);
  const setSurukle = (d: { nereden: number; nereye: number } | null) => { surukleRef.current = d; setSurukleDurum(d); };
  const urun = (id: string) => a.urunler.find(u => u.id === id);
  const disarida = a.urunler.filter(u => !a.baslangicUrunleri.includes(u.id) && !a.hediyeler.some(h => h.urun === u.id));
  const turAdi = { dondurma: 'dondurma', tatli: 'tatlı', icecek: 'içecek' } as const;

  const hedefBul = (y: number) => {
    let en = 0;
    satirlar.current.forEach((el, i) => { if (el && y >= el.getBoundingClientRect().top) en = i; });
    return en;
  };

  return (
    <div className="space-y-4">
      <Bolum baslik="Başlangıç ürünleri" aciklama="Oyunun başında açık olanlar (en az iki dondurma).">
        <div className="flex flex-wrap gap-2">
          {a.baslangicUrunleri.map(id => (
            <span key={id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[13px] ${YAZI}`}>
              <img src={urunResmi(depo, id)} alt="" className="w-6 h-6 object-contain" />{urun(id)?.ad || id}
            </span>
          ))}
        </div>
      </Bolum>
      <Bolum baslik="Hediyeler" aciklama="Soldaki sayı bölüm: o bölüm ilk kez kazanılınca ürün açılır, sonraki bölümde mutlaka gelir. Tutamaktan (⋮⋮) sürükle: ürünler yer değiştirir, bölümler yerinde kalır.">
        <div className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
          {a.hediyeler.map((h, i) => {
            const u = urun(h.urun);
            const tasinan = surukle?.nereden === i;
            const hedef = surukle && surukle.nereye === i && surukle.nereden !== i;
            return (
              <div
                key={`${i}-${h.urun}`}
                ref={el => { satirlar.current[i] = el; }}
                className={`py-1.5 flex items-center gap-2 ${tasinan ? 'opacity-50' : ''} ${hedef ? 'ring-2 ring-[#F26B6F] rounded-lg' : ''}`}
              >
                <button
                  type="button" aria-label={`${u?.ad || h.urun}: sürükle`}
                  className={`${kucukDugme} touch-none cursor-grab`}
                  onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setSurukle({ nereden: i, nereye: i }); }}
                  onPointerMove={e => { const d = surukleRef.current; if (d) { const n = hedefBul(e.clientY); if (n !== d.nereye) setSurukle({ ...d, nereye: n }); } }}
                  onPointerUp={() => { const d = surukleRef.current; if (d) degis(x => { x.hediyeler = hediyeTasi(x.hediyeler, d.nereden, d.nereye); }); setSurukle(null); }}
                  onPointerCancel={() => setSurukle(null)}
                ><GripVertical className="w-4 h-4" /></button>
                <Sayi deger={h.bolum} etiket={`${u?.ad || h.urun} hediye bölümü`} genislik="w-14" onDegis={n => degis(x => { x.hediyeler[i].bolum = n; })} />
                <span className={`text-[12px] ${IKINCIL} whitespace-nowrap -ml-1`}>.</span>
                <img src={urunResmi(depo, h.urun)} alt="" className="w-8 h-8 object-contain" />
                <span className={`text-[14px] ${YAZI} flex-1 min-w-0 truncate`}>{u?.ad || h.urun}<span className={`text-[12px] ${IKINCIL}`}> · {u ? turAdi[u.tur] : '?'}</span></span>
                <button type="button" aria-label="Yukarı" className={`${kucukDugme} max-sm:hidden`} disabled={i === 0} onClick={() => degis(x => { x.hediyeler = hediyeTasi(x.hediyeler, i, i - 1); })}><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Aşağı" className={`${kucukDugme} max-sm:hidden`} disabled={i === a.hediyeler.length - 1} onClick={() => degis(x => { x.hediyeler = hediyeTasi(x.hediyeler, i, i + 1); })}><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label="Hediyeden çıkar" className={kucukDugme} onClick={() => degis(x => { x.hediyeler.splice(i, 1); })}><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      </Bolum>
      {disarida.length > 0 && (
        <Bolum baslik="Hediyede olmayan ürünler" aciklama="Oyunda hiç gelmezler. Ekle'ye bas: listenin sonuna, son hediyeden 10 bölüm sonraya eklenir (bölümü sonra değiştir).">
          <div className="flex flex-wrap gap-2">
            {disarida.map(u => (
              <button key={u.id} type="button" className={DUGME_BOS} onClick={() => degis(x => {
                const son = x.hediyeler[x.hediyeler.length - 1]?.bolum ?? -10;
                x.hediyeler.push({ urun: u.id, bolum: Math.min(son + 10, x.bolumSayisi - 1) });
              })}>
                <img src={urunResmi(depo, u.id)} alt="" className="w-5 h-5 object-contain" /> {u.ad} <Plus className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </Bolum>
      )}
      <Bolum baslik="Yeni ürünler sık gelsin">
        <Satir ad="Son açılan kaç ürün sık gelir"><Sayi deger={a.yeniUrun.sayi} etiket="Yeni ürün sayısı" onDegis={n => degis(x => { x.yeniUrun.sayi = n; })} /></Satir>
        <Satir ad="Açıldıktan sonra kaç bölüm yeni sayılır"><Sayi deger={a.yeniUrun.sure} etiket="Yeni ürün süresi" onDegis={n => degis(x => { x.yeniUrun.sure = n; })} /></Satir>
      </Bolum>
    </div>
  );
};

// ------------------------------------------------------------ Lokasyonlar
const Lokasyonlar: React.FC<{ a: DkAyar; degis: Degis }> = ({ a, degis }) => {
  const gereken = Math.ceil(a.bolumSayisi / (a.lokasyon.bolumSayisi || 1));
  return (
    <div className="space-y-4">
      <Bolum baslik="Bölümler ve kilit">
        <Satir ad="Toplam bölüm" not={`${gereken} lokasyon gerekir`}><Sayi deger={a.bolumSayisi} etiket="Toplam bölüm" onDegis={n => degis(x => { x.bolumSayisi = n; })} /></Satir>
        <Satir ad="Bir lokasyonda kaç bölüm"><Sayi deger={a.lokasyon.bolumSayisi} etiket="Lokasyondaki bölüm" onDegis={n => degis(x => { x.lokasyon.bolumSayisi = n; })} /></Satir>
        <Satir ad="Her lokasyon için gereken yıldız" not="Lokasyonlar toplam yıldızla açılır: 2. lokasyon 1 kat, 3. lokasyon 2 kat …"><Sayi deger={a.lokasyon.acmaYildizi} etiket="Açma yıldızı" onDegis={n => degis(x => { x.lokasyon.acmaYildizi = n; })} /></Satir>
      </Bolum>
      <Bolum baslik="Lokasyonlar" aciklama="Ad (adlar senin), bölümler ekranının zemin rengi ve istersen zemin resmi (DK Lite'ın public klasöründeki yol; resmi ekip koyar).">
        <div className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
          {a.lokasyon.liste.map((l, i) => {
            const ilk = i * a.lokasyon.bolumSayisi + 1;
            return (
              <div key={i} className="py-2 flex flex-wrap items-center gap-2">
                <span className={`text-[12px] ${IKINCIL} w-20`}>{ilk}–{ilk + a.lokasyon.bolumSayisi - 1}</span>
                <input type="color" aria-label={`${l.ad} rengi`} value={l.renk} onChange={e => degis(x => { x.lokasyon.liste[i].renk = e.target.value; })} className="w-10 h-10 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer bg-transparent" />
                <input aria-label={`${i + 1}. lokasyonun adı`} value={l.ad} onChange={e => degis(x => { x.lokasyon.liste[i].ad = e.target.value; })} className={`${kutu} flex-1 min-w-[9rem]`} />
                <input aria-label={`${l.ad} resmi`} value={l.resim || ''} placeholder="resim (isteğe bağlı)" onChange={e => degis(x => {
                  const v = e.target.value.trim();
                  if (v) x.lokasyon.liste[i].resim = v; else delete x.lokasyon.liste[i].resim;
                })} className={`${kutu} flex-1 min-w-[9rem] text-[12px]`} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className={DUGME_BOS} onClick={() => degis(x => { x.lokasyon.liste.push({ ad: `Lokasyon ${x.lokasyon.liste.length + 1}`, renk: '#8a4cbc' }); })}><Plus className="w-3.5 h-3.5" /> Lokasyon ekle</button>
          <button type="button" className={DUGME_BOS} disabled={a.lokasyon.liste.length <= 1} onClick={() => degis(x => { x.lokasyon.liste.pop(); })}><Trash2 className="w-3.5 h-3.5" /> Sonuncuyu sil</button>
        </div>
      </Bolum>
    </div>
  );
};

// ------------------------------------------------------------ Mağaza
const Magaza: React.FC<{ a: DkAyar; depo: string; degis: Degis }> = ({ a, depo, degis }) => {
  const sirala = (liste: 'temalar' | 'kostumler', i: number, j: number) => degis(x => {
    const l = x.magaza[liste];
    if (i < 1 || j < 1 || j >= l.length) return; // ilki başta açık olandır, yeri değişmez
    const [o] = l.splice(i, 1);
    l.splice(j, 0, o);
  });
  return (
    <div className="space-y-4">
      <Bolum baslik="Fiyatlar" aciklama="Oyun içi parayla (DENEME).">
        {([['temaFiyati', 'Tema'], ['kostumFiyati', 'Kostüm'], ['yardimciFiyati', 'Yardımcı'], ['canFiyati', '+1 can']] as const).map(([k, ad]) => (
          <Satir key={k} ad={ad}><Sayi deger={a.magaza[k]} etiket={`${ad} fiyatı`} onDegis={n => degis(x => { x.magaza[k] = n; })} /></Satir>
        ))}
      </Bolum>
      <Bolum baslik="Para ödülleri">
        <Satir ad="Yeni yıldız başına"><Sayi deger={a.para.yildiz} etiket="Yıldız parası" onDegis={n => degis(x => { x.para.yildiz = n; })} /></Satir>
        <Satir ad="Sandıktan (en az – en çok)">
          <Sayi deger={a.para.sandik[0]} etiket="Sandık parası en az" onDegis={n => degis(x => { x.para.sandik[0] = n; })} />
          <Sayi deger={a.para.sandik[1]} etiket="Sandık parası en çok" onDegis={n => degis(x => { x.para.sandik[1] = n; })} />
        </Satir>
        <Satir ad="Günlük ödül, her gün"><Sayi deger={a.para.gunluk} etiket="Günlük para" onDegis={n => degis(x => { x.para.gunluk = n; })} /></Satir>
        <Satir ad="Günlük ödül, 7. gün ayrıca"><Sayi deger={a.para.gunluk7} etiket="7. gün parası" onDegis={n => degis(x => { x.para.gunluk7 = n; })} /></Satir>
        <Satir ad="Lokasyon kartı açılınca"><Sayi deger={a.para.kart} etiket="Kart parası" onDegis={n => degis(x => { x.para.kart = n; })} /></Satir>
      </Bolum>
      <Bolum baslik="Temalar" aciklama="Ad ve sıra. İlki başta açık olan, yeri değişmez. Yeni temanın görünüşünü ekip yapar.">
        <div className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
          {a.magaza.temalar.map((tm, i) => (
            <div key={tm.id} className="py-1.5 flex items-center gap-2">
              <input aria-label={`${tm.id} teması adı`} value={tm.ad} onChange={e => degis(x => { x.magaza.temalar[i].ad = e.target.value; })} className={`${kutu} flex-1`} />
              <button type="button" aria-label="Yukarı" className={kucukDugme} disabled={i <= 1} onClick={() => sirala('temalar', i, i - 1)}><ArrowUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Aşağı" className={kucukDugme} disabled={i === 0 || i === a.magaza.temalar.length - 1} onClick={() => sirala('temalar', i, i + 1)}><ArrowDown className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Bolum>
      <Bolum baslik="Kostümler" aciklama="Ad ve sıra. İlki dükkân önlüğü, başta açık. Yeni kostümün çizimi Canva'da yapılır, ekip ekler.">
        <div className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
          {a.magaza.kostumler.map((k, i) => (
            <div key={k.id} className="py-1.5 flex items-center gap-2">
              <img src={kostumResmi(depo, k.id, i)} alt="" className="w-10 h-12 object-contain" />
              <input aria-label={`${k.id} kostümü adı`} value={k.ad} onChange={e => degis(x => { x.magaza.kostumler[i].ad = e.target.value; })} className={`${kutu} flex-1`} />
              <button type="button" aria-label="Yukarı" className={kucukDugme} disabled={i <= 1} onClick={() => sirala('kostumler', i, i - 1)}><ArrowUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Aşağı" className={kucukDugme} disabled={i === 0 || i === a.magaza.kostumler.length - 1} onClick={() => sirala('kostumler', i, i + 1)}><ArrowDown className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Bolum>
    </div>
  );
};

// ------------------------------------------------------------ Bölümler
const ILK_ALANLAR: { k: keyof DkIlkBolum; ad: string }[] = [
  { k: 'musteri', ad: 'Müşteri' }, { k: 'cesit', ad: 'Çeşit' }, { k: 'istekEnAz', ad: 'İstek en az' },
  { k: 'istekEnCok', ad: 'İstek en çok' }, { k: 'bantYeri', ad: 'Bant yeri' }, { k: 'ikiCesitOrani', ad: 'İki çeşit oranı' }, { k: 'sutun', ad: 'Sütun' },
];

const Basamaklar: React.FC<{ ad: string; satirlar: Basamak[]; degis: (f: (s: Basamak[]) => void) => void }> = ({ ad, satirlar, degis }) => (
  <div className="py-2 space-y-1">
    <div className={`text-[14px] ${YAZI}`}>{ad}</div>
    {satirlar.map((s, i) => (
      <div key={i} className="flex items-center gap-2">
        <Sayi deger={s.bolumden} etiket={`${ad}: bölümden`} genislik="w-16" onDegis={n => degis(l => { l[i].bolumden = n; })} />
        <span className={`text-[12px] ${IKINCIL}`}>. bölümden itibaren</span>
        <Sayi deger={s.deger} etiket={`${ad}: değer`} genislik="w-16" onDegis={n => degis(l => { l[i].deger = n; })} />
        <button type="button" aria-label="Satırı sil" className={kucukDugme} disabled={satirlar.length <= 1} onClick={() => degis(l => { l.splice(i, 1); })}><Trash2 className="w-4 h-4" /></button>
      </div>
    ))}
    <button type="button" className={DUGME_BOS} onClick={() => degis(l => { const son = l[l.length - 1]; l.push({ bolumden: (son?.bolumden ?? 10) + 10, deger: son?.deger ?? 1 }); })}><Plus className="w-3.5 h-3.5" /> Satır ekle</button>
  </div>
);

const Bolumler: React.FC<{ a: DkAyar; degis: Degis }> = ({ a, degis }) => {
  const b = a.bolumler;
  const yo = b.yeniOgeler;
  return (
    <div className="space-y-4">
      <Bolum baslik="İlk 10 bölüm" aciklama="Satır satır. Hangi ürünlerin geleceğini oyun seçer; burada yalnız kaç çeşit.">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="text-[12px]">
            <thead>
              <tr className={IKINCIL}><th className="text-left pr-2">Bölüm</th>{ILK_ALANLAR.map(f => <th key={f.k} className="px-1 font-semibold text-left">{f.ad}</th>)}</tr>
            </thead>
            <tbody>
              {b.ilkBolumler.map((z, i) => (
                <tr key={i}>
                  <td className={`pr-2 font-semibold ${YAZI}`}>{i + 1}</td>
                  {ILK_ALANLAR.map(f => (
                    <td key={f.k} className="px-1 py-0.5"><Sayi deger={z[f.k]} etiket={`${i + 1}. bölüm ${f.ad}`} genislik="w-14" onDegis={n => degis(x => { x.bolumler.ilkBolumler[i][f.k] = n; })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bolum>
      <Bolum baslik="11. bölümden sonrası (kural)">
        <Satir ad="Müşteri: başlangıç"><Sayi deger={b.kural.musteri.baslangic} etiket="Müşteri başlangıç" onDegis={n => degis(x => { x.bolumler.kural.musteri.baslangic = n; })} /></Satir>
        <Satir ad="Müşteri: kaç bölümde bir artar"><Sayi deger={b.kural.musteri.herKacBolumdeBir} etiket="Müşteri artış aralığı" onDegis={n => degis(x => { x.bolumler.kural.musteri.herKacBolumdeBir = n; })} /></Satir>
        <Satir ad="Müşteri: en çok"><Sayi deger={b.kural.musteri.enCok} etiket="Müşteri en çok" onDegis={n => degis(x => { x.bolumler.kural.musteri.enCok = n; })} /></Satir>
        <Satir ad="İstek (en az – en çok)">
          <Sayi deger={b.kural.istekEnAz} etiket="İstek en az" onDegis={n => degis(x => { x.bolumler.kural.istekEnAz = n; })} />
          <Sayi deger={b.kural.istekEnCok} etiket="İstek en çok" onDegis={n => degis(x => { x.bolumler.kural.istekEnCok = n; })} />
        </Satir>
        <Basamaklar ad="Çeşit" satirlar={b.kural.cesit} degis={f => degis(x => f(x.bolumler.kural.cesit))} />
        <Basamaklar ad="Bant yeri" satirlar={b.kural.bantYeri} degis={f => degis(x => f(x.bolumler.kural.bantYeri))} />
        <Basamaklar ad="İki çeşit oranı (0–1)" satirlar={b.kural.ikiCesitOrani} degis={f => degis(x => f(x.bolumler.kural.ikiCesitOrani))} />
      </Bolum>
      <Bolum baslik="Zor bölümler" aciklama="Her 10 bölümün 5.'si zor, 10.'su çok zor (sandıklı); 6.'sı rahatlatan.">
        {([['zor', 'Zor'], ['cokZor', 'Çok zor']] as const).map(([k, ad]) => (
          <Satir key={k} ad={ad} not="fazla müşteri · bantta eksik yer · iki çeşit oranı artışı">
            <Sayi deger={b[k].musteri} etiket={`${ad}: fazla müşteri`} genislik="w-14" onDegis={n => degis(x => { x.bolumler[k].musteri = n; })} />
            <Sayi deger={b[k].bantEksik} etiket={`${ad}: bant eksik`} genislik="w-14" onDegis={n => degis(x => { x.bolumler[k].bantEksik = n; })} />
            <Sayi deger={b[k].ikiCesit} etiket={`${ad}: iki çeşit artışı`} genislik="w-16" onDegis={n => degis(x => { x.bolumler[k].ikiCesit = n; })} />
          </Satir>
        ))}
        <Satir ad="Rahat bölüm kaç bölüm önceki kadar"><Sayi deger={b.rahatGeri} etiket="Rahat geri" onDegis={n => degis(x => { x.bolumler.rahatGeri = n; })} /></Satir>
        <Satir ad="Bant en az"><Sayi deger={b.bantEnAz} etiket="Bant en az" onDegis={n => degis(x => { x.bolumler.bantEnAz = n; })} /></Satir>
        <Satir ad="İki çeşit oranı en çok"><Sayi deger={b.ikiCesitEnCok} etiket="İki çeşit en çok" onDegis={n => degis(x => { x.bolumler.ikiCesitEnCok = n; })} /></Satir>
      </Bolum>
      <Bolum baslik="Yeni öğeler" aciklama="İlk geldikleri bölüm (orada &quot;Yeni!&quot; penceresiyle tanıtılır) ve ne sıklıkla geldikleri (0–1).">
        {([['buzluTop', 'Buzlu top'], ['gizliTop', 'Gizli top'], ['aceleciMusteri', 'Aceleci müşteri']] as const).map(([k, ad]) => (
          <Satir key={k} ad={ad} not="bölüm · oran">
            <Sayi deger={yo[k].bolum} etiket={`${ad} bölümü`} genislik="w-16" onDegis={n => degis(x => { x.bolumler.yeniOgeler[k].bolum = n; })} />
            <Sayi deger={yo[k].oran} etiket={`${ad} oranı`} genislik="w-16" onDegis={n => degis(x => { x.bolumler.yeniOgeler[k].oran = n; })} />
          </Satir>
        ))}
        <Satir ad="Kilitli sütun" not="bölüm"><Sayi deger={yo.kilitliSutun.bolum} etiket="Kilitli sütun bölümü" genislik="w-16" onDegis={n => degis(x => { x.bolumler.yeniOgeler.kilitliSutun.bolum = n; })} /></Satir>
      </Bolum>
    </div>
  );
};

export default DkLitePaneli;
