import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { Item } from '../../types';
import { TUR_NOKTASI } from './turRenkleri';
import {
  donemAdaylari, donemKaydi, donemleriOku, reddedilenDonemler, zamanSatirlari,
  type Donem, type TarihAraligi, type ZamanGrubu, type ZamanSatiri
} from '../../lib/zamanCizgisi';

/**
 * Görünümler → Zaman çizgisi (5. gece; 20 Kasım'da okunur hâle geldi, Kemal).
 * Satırlar türe göre gruplu: mekânların faaliyeti, ailelerin adaya gelişi,
 * kişilerin yaşamı (ayrı katman, kapalı başlar); grup içinde yıla göre.
 * Eksen parçalı: verinin olduğu yıllar geniş, boş yüzyıllar kesik çizgili dar
 * bir şeritte sıkışır. Aralık çubuk, tek tarih nokta, açık uçlu aralık ("1954–")
 * sağ kenara uzanır; yaklaşık başlangıç soluk. Arkada Kemal'in dönemleri bant
 * olarak. Satıra basınca madde açılır. Kayda yalnız dönem "Ekle", dönemin ×'i
 * ve adayın "Önerme"si yazar; katmanın açık / kapalı oluşu yazılmaz.
 */

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onMaddeAc: (id: string) => void;
}

/** Dönem bantlarının renkleri (sırayla) */
const BANT = [
  { zemin: 'bg-[#F26B6F]/10', yazi: 'text-[#B8454A] dark:text-[#F7A3A6]', cizgi: 'border-[#F26B6F]/40' },
  { zemin: 'bg-[#0E1C4F]/[0.07] dark:bg-[#8FA3D9]/10', yazi: 'text-[#0E1C4F] dark:text-[#B9C6EA]', cizgi: 'border-[#0E1C4F]/30 dark:border-[#8FA3D9]/40' },
  { zemin: 'bg-[#C99A2E]/12', yazi: 'text-[#8A6516] dark:text-[#E2C277]', cizgi: 'border-[#C99A2E]/40' },
  { zemin: 'bg-[#2F7D6D]/10', yazi: 'text-[#2F7D6D] dark:text-[#7FCBB8]', cizgi: 'border-[#2F7D6D]/40' },
  { zemin: 'bg-[#8A5A9E]/10', yazi: 'text-[#6E4581] dark:text-[#C9A6D8]', cizgi: 'border-[#8A5A9E]/40' }
];
const GIRDI = 'text-[12px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#F26B6F]';
const DUGME = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] disabled:opacity-40';
const DOLU = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer bg-[#0E1C4F] dark:bg-[#2C3C72] text-white disabled:opacity-40';
const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const KART = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]';
/** Ad sütunu ve çizgi: telefonda alt alta, geniş ekranda yan yana */
const IZGARA = 'grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-3';
const BASLIK = `text-[10px] font-mono font-bold uppercase tracking-[0.14em] ${IKINCIL}`;

const aralikMetni = (k: { bas: number; bit?: number | null }) => (k.bit === undefined ? String(k.bas) : k.bit === null ? `${k.bas}–` : `${k.bas}–${k.bit}`);

const GRUPLAR: Array<{ id: ZamanGrubu; ad: string; neyi: string; tarihsiz: string }> = [
  { id: 'mekan', ad: 'Mekânlar', neyi: 'faaliyette', tarihsiz: 'mekânda' },
  { id: 'aile', ad: 'Aileler', neyi: 'adaya geliş', tarihsiz: 'ailede' },
  { id: 'kisi', ad: 'Kişiler', neyi: 'yaşam', tarihsiz: 'kişide' }
];

// ---------------------------------------------------------------- parçalı eksen

/** Yıllar arasındaki boşluk bundan büyükse kesik olur */
const KESIK_ESIGI = 50;
/** Kesiğin eni (yüzde) ve dar bir öbeğin en az sayılan yılı */
const KESIK_ENI = 3.5;
const EN_AZ_YIL = 20;

interface Dilim { bas: number; bit: number; sol: number; en: number }
interface Olcek { dilimler: Dilim[]; kesikler: Array<{ sol: number; en: number }>; x: (y: number) => number }

/**
 * Verinin yoğun olduğu yıllar geniş dilim, aralarındaki boş yıllar dar kesik
 * (20 Kasım, Kemal). Dilimler başlangıç ve bitiş yıllarından onluğa yuvarlanır;
 * en sağ dilim açık uçlu çubuklar için biraz pay alır. Yalnız ekran içindir.
 */
function olcekKur(yillar: number[]): Olcek {
  const l = Array.from(new Set(yillar)).sort((a, b) => a - b);
  if (!l.length) l.push(1900, 2020);
  const obekler: Array<[number, number]> = [];
  for (const y of l) {
    const son = obekler[obekler.length - 1];
    if (son && y - son[1] <= KESIK_ESIGI) son[1] = y; else obekler.push([y, y]);
  }
  const ham = obekler.map(([a, b], n) => {
    const bas = Math.floor(a / 10) * 10;
    const bit = Math.max(bas + 10, n === obekler.length - 1 ? Math.ceil((b + 6) / 10) * 10 : Math.ceil((b + 1) / 10) * 10);
    return { bas, bit };
  });
  const toplam = ham.reduce((t, d) => t + Math.max(d.bit - d.bas, EN_AZ_YIL), 0);
  const kalan = 100 - KESIK_ENI * (ham.length - 1);
  const dilimler: Dilim[] = [];
  const kesikler: Olcek['kesikler'] = [];
  let sol = 0;
  ham.forEach((d, n) => {
    if (n > 0) { kesikler.push({ sol, en: KESIK_ENI }); sol += KESIK_ENI; }
    const en = (Math.max(d.bit - d.bas, EN_AZ_YIL) / toplam) * kalan;
    dilimler.push({ ...d, sol, en });
    sol += en;
  });
  const x = (y: number) => {
    if (y <= dilimler[0].bas) return 0;
    for (let n = 0; n < dilimler.length; n++) {
      const d = dilimler[n];
      if (y <= d.bit) {
        if (y >= d.bas) return d.sol + ((y - d.bas) / (d.bit - d.bas)) * d.en;
        // İki dilim arasındaki boş yıllar kesiğin içinde
        const o = dilimler[n - 1];
        return o.sol + o.en + ((y - o.bit) / (d.bas - o.bit)) * KESIK_ENI;
      }
    }
    return 100;
  };
  return { dilimler, kesikler, x };
}

/** Dilimin yıl işaretleri; telefonda yalnız yirmilikler (dar dilimde yalnız başı) */
function isaretler(o: Olcek): Array<{ yil: number; dar: boolean }> {
  const l: Array<{ yil: number; dar: boolean }> = [];
  for (const d of o.dilimler) {
    const adim = d.bit - d.bas > 200 ? 50 : 10;
    if (d.en < 10) { l.push({ yil: d.bas, dar: false }); continue; }
    for (let y = d.bas; y < d.bit || (d === o.dilimler[o.dilimler.length - 1] && y <= d.bit); y += adim) {
      l.push({ yil: y, dar: adim === 10 && y % 20 !== 0 && y !== d.bas });
    }
  }
  return l;
}

/** Açık uçlu çubuk sağ kenara uzanır, ucu hafif solar ("bugün" yok) */
const ACIK_UC: React.CSSProperties = {
  maskImage: 'linear-gradient(to right, black 80%, rgba(0,0,0,0.35))',
  WebkitMaskImage: 'linear-gradient(to right, black 80%, rgba(0,0,0,0.35))'
};

const Cubuk: React.FC<{ a: TarihAraligi; x: (y: number) => number; renk: string }> = ({ a, x, renk }) => {
  if (a.bit === undefined) {
    return <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-[#FAF8F5] dark:ring-[#0E1733] ${renk}`} style={{ left: `${x(a.bas)}%` }} />;
  }
  const sol = x(a.bas);
  const sag = a.bit === null ? 100 : x(a.bit);
  const kesin = a.basSon !== undefined ? x(a.basSon) : sol;
  return (
    <>
      {/* Yaklaşık başlangıç: soluk */}
      {kesin > sol && <span className={`absolute top-1/2 -translate-y-1/2 h-2 rounded-l-full opacity-35 ${renk}`} style={{ left: `${sol}%`, width: `${kesin - sol}%` }} />}
      <span className={`absolute top-1/2 -translate-y-1/2 h-2 ${kesin > sol ? 'rounded-r-full' : 'rounded-full'} ${renk} ${a.yaklasik && a.basSon === undefined ? 'opacity-60' : ''}`}
        style={{ left: `${kesin}%`, width: `max(6px, ${sag - kesin}%)`, ...(a.bit === null ? ACIK_UC : {}) }} />
    </>
  );
};

export const ZamanCizgisi: React.FC<Props> = ({ items, onUpdateItem, onAddItem, onMaddeAc }) => {
  const { satirlar, tarihsiz } = useMemo(() => zamanSatirlari(items), [items]);
  const donemler = useMemo(() => donemleriOku(items), [items]);
  const reddedilen = useMemo(() => reddedilenDonemler(items), [items]);
  const adaylar = useMemo(() => donemAdaylari(items, donemler, reddedilen), [items, donemler, reddedilen]);

  // Kişilerin yaşamı ayrı katman, kapalı başlar (20 Kasım, Kemal); yalnız ekranda
  const [kisilerAcik, setKisilerAcik] = useState(false);
  const gorunen = useMemo(() => satirlar.filter(s => s.grup !== 'kisi' || kisilerAcik), [satirlar, kisilerAcik]);

  // Eksenin dayandığı yıllar: başlangıçlar, yazılı bitişler, dönemler (yaklaşık başlangıcın sonu değil)
  const olcek = useMemo(() => olcekKur([
    ...gorunen.flatMap(s => (s.aralik ? [s.aralik.bas, ...(typeof s.aralik.bit === 'number' ? [s.aralik.bit] : [])] : [])),
    ...donemler.flatMap(d => [d.bas, ...(typeof d.bit === 'number' ? [d.bit] : [])])
  ]), [gorunen, donemler]);
  const isaret = useMemo(() => isaretler(olcek), [olcek]);
  const x = olcek.x;
  const yuzde = (y: number) => `${x(y)}%`;

  // Dönem formu
  const [ad, setAd] = useState('');
  const [yilBas, setYilBas] = useState('');
  const [yilBit, setYilBit] = useState('');
  const [yaziliyor, setYaziliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');
  const basSayi = Number(yilBas), bitSayi = yilBit.trim() ? Number(yilBit) : undefined;
  const formGecerli = ad.trim().length > 0 && /^-?\d{1,4}$/.test(yilBas.trim())
    && (bitSayi === undefined || (/^-?\d{1,4}$/.test(yilBit.trim()) && bitSayi >= basSayi));

  const yaz = async (yeni: Donem[], red?: string[], tamam?: string) => {
    setYaziliyor(true); setMesaj('');
    try {
      const k = donemKaydi(items, yeni, red);
      if (k.guncel) await onUpdateItem(k.guncel); else if (k.yeni) await onAddItem(k.yeni);
      if (tamam) setMesaj(tamam);
      return true;
    } catch { setMesaj('Kaydedilemedi; yeniden dene.'); return false; }
    finally { setYaziliyor(false); }
  };
  const ekle = async () => {
    if (!formGecerli) return;
    const d: Donem = { id: `donem_${Date.now()}`, ad: ad.trim(), bas: basSayi, ...(bitSayi !== undefined ? { bit: bitSayi } : {}) };
    if (await yaz([...donemler, d], undefined, `"${d.ad}" eklendi.`)) { setAd(''); setYilBas(''); setYilBit(''); }
  };

  return (
    <div className="space-y-4">
      <p className={`text-[13px] ${IKINCIL} max-w-3xl leading-relaxed`}>
        Mekânların faaliyet yılları ve ailelerin adaya gelişi; kişilerin yaşamı aşağıda ayrı katman. Çubuk aralık, nokta tek tarih.
        Arkadaki bantlar senin dönemlerin. Bir satıra basınca madde açılır; tarihi oradan değiştirirsin.
      </p>

      {/* Çizgi */}
      <div className={`${KART} p-3`}>
        {/* Dönem başlıkları */}
        {donemler.length > 0 && (
          <div className={`${IZGARA} mb-1`}>
            <div className={`${BASLIK} self-end hidden sm:block`}>Dönemler</div>
            <div className="relative h-6">
              {donemler.map((d, n) => (
                <div key={d.id} title={`${d.ad} · ${aralikMetni({ bas: d.bas, bit: d.bit ?? null })}`}
                  className={`absolute top-0 h-6 px-1.5 flex items-center rounded-md text-[11px] font-semibold truncate ${BANT[n % BANT.length].zemin} ${BANT[n % BANT.length].yazi}`}
                  style={{ left: yuzde(d.bas), width: `calc(${d.bit === undefined ? '100%' : yuzde(d.bit)} - ${yuzde(d.bas)})` }}>
                  {d.ad}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Eksen: kesikte "≈" */}
        <div className={`${IZGARA} sticky top-0 z-20 bg-[#FAF8F5] dark:bg-[#0E1733]`}>
          <div className="hidden sm:block" />
          <div className="relative h-5 border-b border-[#CFC5B4] dark:border-[#2C3C72]">
            {isaret.map(({ yil, dar }) => (
              <span key={yil} className={`absolute bottom-1 -translate-x-1/2 text-[10px] font-mono tabular-nums ${IKINCIL} ${dar ? 'hidden sm:inline' : ''}`} style={{ left: yuzde(yil) }}>{yil}</span>
            ))}
            {olcek.kesikler.map((k, n) => (
              <span key={n} className={`absolute bottom-0.5 -translate-x-1/2 text-[12px] leading-none ${IKINCIL}`} style={{ left: `${k.sol + k.en / 2}%` }} title="Boş yıllar sıkıştırıldı">≈</span>
            ))}
          </div>
        </div>

        {/* Satırlar */}
        <div className="relative">
          {/* Dönem bantları ve on yıl çizgileri satırların arkasında */}
          <div className={`absolute inset-0 ${IZGARA} pointer-events-none`} aria-hidden="true">
            <div className="hidden sm:block" />
            <div className="relative">
              {isaret.map(({ yil, dar }) => <span key={yil} className={`absolute inset-y-0 border-l border-[#E4DCCD] dark:border-[#1C2A55] hidden sm:block`} style={{ left: yuzde(yil) }} />)}
              {donemler.map((d, n) => (
                <span key={d.id} className={`absolute inset-y-0 border-x ${BANT[n % BANT.length].zemin} ${BANT[n % BANT.length].cizgi}`}
                  style={{ left: yuzde(d.bas), width: `calc(${d.bit === undefined ? '100%' : yuzde(d.bit)} - ${yuzde(d.bas)})` }} />
              ))}
            </div>
          </div>
          {!satirlar.length && <p className={`relative py-6 text-[13px] ${IKINCIL}`}>Mekânların, ailelerin ve kişilerin künyesinde tarih yazılı değil.</p>}
          {GRUPLAR.map(g => {
            const liste = satirlar.filter(s => s.grup === g.id);
            if (!liste.length && !tarihsiz[g.id]) return null;
            const acik = g.id !== 'kisi' || kisilerAcik;
            return (
              <section key={g.id} className="relative">
                <div className={`relative z-20 flex flex-wrap items-baseline gap-x-2 pt-3 pb-1 ${g.id === 'mekan' ? 'pt-2' : 'border-t border-[#E4DCCD] dark:border-[#2C3C72] mt-1'}`}>
                  {g.id === 'kisi' ? (
                    <button type="button" onClick={() => setKisilerAcik(a => !a)} aria-expanded={kisilerAcik}
                      className={`inline-flex items-center gap-1 ${BASLIK} hover:text-[#F26B6F] cursor-pointer`}>
                      {kisilerAcik ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} {g.ad} · {g.neyi}
                    </button>
                  ) : <span className={BASLIK}>{g.ad} · {g.neyi}</span>}
                  <span className={`text-[11px] ${IKINCIL}`}>
                    {liste.length}{tarihsiz[g.id] > 0 && ` · ${tarihsiz[g.id]} ${g.tarihsiz} yazılı değil`}
                    {g.id === 'kisi' && !kisilerAcik && ' · göstermek için bas'}
                  </span>
                </div>
                {acik && liste.map(s => <Satir key={s.maddeId} s={s} x={x} kesikler={olcek.kesikler} onMaddeAc={onMaddeAc} />)}
              </section>
            );
          })}
        </div>
      </div>
      <p className={`text-[11px] ${IKINCIL}`}>
        Soluk kısım yaklaşık başlangıç ("1980'ler–", "18. yüzyıl–"); sağ kenara uzanan çubuğun bitişi yazılmamış. Kesik çizgili dar şerit ("≈") boş yılları sıkıştırır.
        Parantez içi açıklama tarih sayılmaz; okunamayan değer satırında "tarih belirsiz" yazar.
      </p>

      {/* Dönemler */}
      <section className={`${KART} p-4 space-y-3`}>
        <div className={`text-[10px] font-mono font-bold uppercase tracking-[0.14em] ${IKINCIL}`}>Dönemler</div>
        {donemler.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {donemler.map((d, n) => (
              <li key={d.id} className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-[12px] ${BANT[n % BANT.length].zemin} ${BANT[n % BANT.length].yazi}`}>
                <b>{d.ad}</b> <span className="font-mono text-[11px]">{aralikMetni({ bas: d.bas, bit: d.bit ?? null })}</span>
                <button type="button" disabled={yaziliyor} onClick={() => void yaz(donemler.filter(x => x.id !== d.id), undefined, `"${d.ad}" silindi.`)}
                  aria-label={`${d.ad} dönemini sil`} title="Dönemi sil" className="p-0.5 rounded-full hover:bg-white/60 dark:hover:bg-black/20 disabled:opacity-40"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ul>
        ) : <p className={`text-[12px] ${IKINCIL}`}>Henüz dönem yok. Adı ve yılları sen verirsin.</p>}

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] flex-1 min-w-[12rem]">
            <span className={IKINCIL}>Dönemin adı</span>
            <input value={ad} onChange={e => setAd(e.target.value)} className={GIRDI} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] w-24">
            <span className={IKINCIL}>Başlangıç</span>
            <input value={yilBas} onChange={e => setYilBas(e.target.value)} inputMode="numeric" placeholder="yıl" className={GIRDI} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] w-24">
            <span className={IKINCIL}>Bitiş</span>
            <input value={yilBit} onChange={e => setYilBit(e.target.value)} inputMode="numeric" placeholder="açık" className={GIRDI} />
          </label>
          <button type="button" onClick={() => void ekle()} disabled={!formGecerli || yaziliyor} className={DOLU}><Plus className="w-3.5 h-3.5" /> Ekle</button>
        </div>
        <p className={`text-[11px] ${IKINCIL}`}>Bitişi boş bırakırsan dönem açık uçlu çizilir. Yıl yazmazsan "Ekle" basılmaz.</p>
        {mesaj && <p role="status" className="text-[12px] text-[#F26B6F]">{mesaj}</p>}

        {adaylar.length > 0 && (
          <div className="pt-2 border-t border-[#E4DCCD] dark:border-[#2C3C72] space-y-2">
            <div className={`text-[10px] font-mono font-bold uppercase tracking-[0.14em] ${IKINCIL}`}>Yazılarında geçen dönemler · aday</div>
            <ul className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
              {adaylar.map(a => (
                <li key={a.ad} className="py-2 flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[14rem]">
                    <div className="text-[13px] font-semibold">{a.ad}</div>
                    <div className={`text-[11px] ${IKINCIL}`}>
                      {a.sayi} kez:{' '}
                      {a.kaynaklar.slice(0, 3).map((k, n) => (
                        <React.Fragment key={k.id}>{n > 0 && ', '}
                          <button type="button" onClick={() => onMaddeAc(k.id)} className="underline decoration-[#0E1C4F]/30 underline-offset-2 hover:decoration-[#F26B6F]">{k.ad}</button>
                        </React.Fragment>
                      ))}
                      {a.kaynaklar.length > 3 && ` ve ${a.kaynaklar.length - 3} yer daha`}
                    </div>
                    {a.ornek && <div className={`mt-0.5 text-[11px] italic ${IKINCIL}`}>“{a.ornek}”</div>}
                  </div>
                  <button type="button" onClick={() => { setAd(a.ad); setMesaj('Yılları yaz, sonra "Ekle".'); }} className={DUGME}>Bu adla başla</button>
                  <button type="button" disabled={yaziliyor} onClick={() => void yaz(donemler, Array.from(new Set([...reddedilen, a.ad])))} title="Bu adı bir daha önerme" className={DUGME}>Önerme</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

    </div>
  );
};

const Satir: React.FC<{ s: ZamanSatiri; x: (y: number) => number; kesikler: Olcek['kesikler']; onMaddeAc: (id: string) => void }> = ({ s, x, kesikler, onMaddeAc }) => {
  const renk = TUR_NOKTASI[s.tur] || 'bg-[#6A5E4C]';
  const deger = s.degerler.map(([, v]) => v).join(' · ');
  return (
    <button type="button" onClick={() => onMaddeAc(s.maddeId)}
      title={s.degerler.map(([a, v]) => `${a}: ${v}`).join('\n')}
      className={`relative w-full ${IZGARA} items-center py-0.5 sm:py-1 text-left rounded-md hover:bg-[#F3EFE8]/80 dark:hover:bg-[#13204A]/80 cursor-pointer group`}>
      <span className="min-w-0 overflow-hidden flex items-baseline gap-2 sm:flex-col sm:gap-0">
        <span className="flex items-center gap-1.5 min-w-0 shrink-0 max-w-[60%] sm:max-w-full">
          <span className={`w-2 h-2 rounded-full shrink-0 ${renk}`} />
          <span className="text-[12px] truncate group-hover:text-[#F26B6F]">{s.madde}</span>
        </span>
        <span className={`text-[10px] font-mono truncate min-w-0 sm:max-w-full ${IKINCIL} sm:pl-3.5`}>{deger}</span>
      </span>
      <span className="relative h-4">
        {s.aralik
          ? <Cubuk a={s.aralik} x={x} renk={renk} />
          : <span className={`absolute inset-y-0 left-0 z-20 flex items-center pr-1 text-[11px] italic bg-[#FAF8F5] dark:bg-[#0E1733] ${IKINCIL}`}>tarih belirsiz</span>}
        {/* Kesik: boş yıllar sıkıştı, çubuk burada kesilir */}
        {s.aralik && kesikler.map((k, n) => (
          <span key={n} aria-hidden="true" className="absolute -inset-y-1 border-x border-dashed border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]"
            style={{ left: `${k.sol}%`, width: `${k.en}%` }} />
        ))}
      </span>
    </button>
  );
};

export default ZamanCizgisi;
