import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { Item } from '../../types';
import { soyDegeri } from '../wiki/soyDegeri';
import { KisiAdi, KisiPortresi, portreBul, yilYazisi } from '../wiki/AileAgaci';
import { hayattaDegil } from '../../lib/aileAgaci';
import { donemleriOku } from '../../lib/zamanCizgisi';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import {
  adParcalari, bagliKisiler, dogduguAile, kisiHarfi, soyVerisi, suz, tekAgac, yilSiniri,
  type AgacOlcu, type SoyBagTuru
} from '../../lib/soyAgaci';

/**
 * Görünümler → Soy ağacı: bütün adanın tek soy ağacı (24 Kasım akşam, Kemal:
 * "Aile gruplandırmalarını kaldır, yalnızca doğduğu ailenin rengi kartın
 * solunda ince bir şerit olarak duruyor ya, o kalsın").
 *
 * - Bağlar viki verisinden kendiliğinden: ebeveyni, eşi, kardeşi (künyedeki
 *   "Eşi" dahil) ve aile üyeliği (Aile, Soyadı, Doğduğu aile).
 * - Aile çerçevesi yok; her kişi tek kartta. Kuşaklar yukarıdan aşağı, eşler
 *   yan yana, çocuklar anne-babasının ortasının altında (`lib/soyAgaci.ts` → `tekAgac`).
 * - Aile ayrımı yalnız kartın solundaki ince şerit: kişinin doğduğu ailenin rengi.
 * - Akraba bağı çizilmez; iş, arkadaşlık, rekabet bağları burada yok (Bağ ağı'nda).
 *   Seçili kişinin kartında hepsi yazıyla durur.
 * - Tuval sürüklenir; tekerlek, iki parmak ve düğmelerle yakınlaşır.
 * Bu ekran kayda bir şey yazmaz.
 */

interface Props {
  items: Item[];
  onMaddeAc: (id: string) => void;
  /** Aile sayfasından "Soy ağacında aç" ile gelindiyse o aile */
  ilkAile?: string | null;
}

/** Büyük, okunur kartlar */
const O: AgacOlcu = { en: 252, boy: 112, araX: 26, araY: 58, esAra: 30 };
const PORTRE_R = 31;

const BAG_ADI: Record<SoyBagTuru, string> = {
  ebeveyni: 'Ebeveyni', 'eşi': 'Eşi', 'kardeşi': 'Kardeşi', 'akrabası': 'Akrabası',
  patronu: 'Patronu', 'iş ortağı': 'İş ortağı', 'iş yeri': 'Aynı yerde çalışır', 'arkadaşı': 'Arkadaşı', rakibi: 'Rakibi', 'tanıdığı kişi': 'Tanıdığı'
};
/** Aile renkleri (ağaçta soldan sağa görünme sırasıyla): kartın sol şeridi */
const AILE_RENK = ['#0E1C4F', '#B4474B', '#9A7424', '#2F7D6D', '#7A4E8E', '#3E6F9E', '#A0612E', '#5E7A3A'];
/** Doğduğu aile bilinmeyen kişinin şeridi */
const BOS_RENK = '#CFC5B4';

const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const KART = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]';
const GIRDI = 'text-[13px] text-[#0E1C4F] dark:text-[#F3EFE8] bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#F26B6F]';
const CIP = (secili: boolean) => `inline-flex items-center gap-1.5 min-h-8 px-3 py-0.5 rounded-full text-[12px] border cursor-pointer ${secili
  ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent'
  : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#F26B6F]'}`;
const yilMetni = (b: { bas?: number; bit?: number }) => (b.bas === undefined ? '' : `${b.bas}–${b.bit ?? ''}`);
const kisalt = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Adı en çok iki satıra böler (kelime kelime) */
function satirlara(ad: string, sinir: number): string[] {
  const satirlar: string[] = [];
  for (const k of ad.split(/\s+/).filter(Boolean)) {
    const son = satirlar[satirlar.length - 1];
    if (son !== undefined && (son + ' ' + k).length <= sinir) satirlar[satirlar.length - 1] = son + ' ' + k;
    else satirlar.push(k);
  }
  if (satirlar.length <= 2) return satirlar.map(s => kisalt(s, sinir + 2));
  return [satirlar[0], kisalt(satirlar.slice(1).join(' '), sinir)];
}

interface Gorunum { x: number; y: number; k: number }

export const SoyAgaci: React.FC<Props> = ({ items, onMaddeAc, ilkAile = null }) => {
  const gorselSurumu = useGorselSurumu();
  const veri = useMemo(() => soyVerisi(items, soyDegeri), [items]);
  const donemler = useMemo(() => donemleriOku(items), [items]);
  const madde = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const portreler = useMemo(() => new Map(veri.kisiler.map(k => [k.id, portreBul(madde.get(k.id), items)] as const)),
    [veri, madde, items, gorselSurumu]); // gorselSurumu: galeri görselleri çözülünce yenilenir
  const olmus = useMemo(() => new Set(veri.kisiler.filter(k => {
    const i = madde.get(k.id);
    return !!i && hayattaDegil(soyDegeri(i, 'dogumYili'), soyDegeri(i, 'yasam'));
  }).map(k => k.id)), [veri, madde]);

  const [aileId, setAileId] = useState<string | null>(ilkAile);
  useEffect(() => { if (ilkAile) setAileId(ilkAile); }, [ilkAile]);
  const [aralik, setAralik] = useState<[number, number] | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [arama, setArama] = useState('');

  const sinir = useMemo(() => {
    const s = yilSiniri(veri);
    const ys = [...(s || []), ...donemler.flatMap(d => [d.bas, d.bit ?? d.bas])];
    return ys.length ? [Math.min(...ys), Math.max(...ys)] as [number, number] : null;
  }, [veri, donemler]);

  // Görünenler: yıl ve aile süzgeci, sonra aile bağı da ailesinde başkası da olmayan kişi çıkar
  const gorunen = useMemo(() => {
    const s = suz(veri, { aralik, aileId, yanlar: new Set() });
    const kisiler = bagliKisiler(s.kisiler, s.baglar);
    const ic = new Set(kisiler.map(k => k.id));
    return { kisiler, baglar: s.baglar.filter(b => ic.has(b.a) && ic.has(b.b)) };
  }, [veri, aralik, aileId]);
  const gizli = useMemo(() => bagliKisiler(veri.kisiler, veri.baglar.filter(b => b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi' || b.tur === 'akrabası')).length, [veri]);
  const gizliSayi = veri.kisiler.length - gizli;

  const kap = useRef<HTMLDivElement>(null);
  const agac = useMemo(() => tekAgac(gorunen.kisiler, gorunen.baglar, O), [gorunen]);
  const kisi = useMemo(() => new Map(veri.kisiler.map(k => [k.id, k])), [veri]);
  const aileAdi = useMemo(() => new Map(veri.aileler.map(a => [a.id, a.ad])), [veri]);
  /** Şerit renkleri: aileler ağaçta göründükleri sırayla (yukarıdan aşağı, soldan sağa) */
  const aileRengi = useMemo(() => {
    const m = new Map<string, string>();
    const sirali = [...agac.konum.entries()].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x);
    for (const [id] of sirali) {
      const a = kisi.get(id) && dogduguAile(kisi.get(id)!);
      if (a && aileAdi.has(a) && !m.has(a)) m.set(a, AILE_RENK[m.size % AILE_RENK.length]);
    }
    return m;
  }, [agac, kisi, aileAdi]);
  const seritRengi = (id: string) => {
    const a = kisi.get(id) && dogduguAile(kisi.get(id)!);
    return (a && aileRengi.get(a)) || BOS_RENK;
  };
  const bilinmeyenVar = useMemo(() => [...agac.konum.keys()].some(id => { const a = kisi.get(id) && dogduguAile(kisi.get(id)!); return !a || !aileRengi.has(a); }), [agac, kisi, aileRengi]);

  // ---- Tuval: kaydırma ve yakınlaştırma ----
  const [gor, setGor] = useState<Gorunum>({ x: 0, y: 0, k: 1 });
  /** Bütün ağaç ekrana; okunmayacak kadar küçülecekse en kalabalık küme okunur boyda, en üstten */
  const sigdir = useCallback((hepsi = false) => {
    const el = kap.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight, pay = 20;
    const en = Math.max(1, agac.en), boy = Math.max(1, agac.boy);
    const k = Math.min(1.1, Math.min((w - pay * 2) / en, (h - pay * 2) / boy));
    const ilk = [...agac.kumeler].sort((a, b) => b.kisiler.length - a.kisiler.length)[0];
    if (!hepsi && k < 0.42 && ilk) {
      // Telefonda da adlar okunsun: en az 0,5; sığmayan kısım yana kaydırılarak görülür
      const k2 = Math.min(1, Math.max(0.5, (w - pay * 2) / ilk.en));
      const sigiyor = ilk.en * k2 <= w - pay * 2;
      setGor({ k: k2, x: (sigiyor ? (w - ilk.en * k2) / 2 : pay) - ilk.x * k2, y: pay });
      return;
    }
    const kk = Math.max(0.1, k);
    // Yatayda ortalı, dikeyde üstten (en eski kuşak hemen görünsün)
    setGor({ k: kk, x: (w - en * kk) / 2, y: Math.min(pay, (h - boy * kk) / 2) });
  }, [agac]);
  useEffect(() => { sigdir(); }, [sigdir]);

  const yakinlas = useCallback((carpan: number, cx?: number, cy?: number) => {
    const el = kap.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    setGor(g => {
      const k = Math.min(2.5, Math.max(0.1, g.k * carpan));
      const f = k / g.k;
      return { k, x: px - (px - g.x) * f, y: py - (py - g.y) * f };
    });
  }, []);

  // Tekerlek: sayfa kaymasın diye pasif olmayan dinleyici
  useEffect(() => {
    const el = kap.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) yakinlas(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      else setGor(g => ({ ...g, x: g.x - e.deltaX, y: g.y - e.deltaY }));
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, [yakinlas]);

  // Sürükleme ve iki parmakla yakınlaştırma
  const parmaklar = useRef(new Map<number, { x: number; y: number }>());
  const surukledi = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    parmaklar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surukledi.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = parmaklar.current;
    const once = p.get(e.pointerId);
    if (!once) return;
    if (p.size === 1) {
      const dx = e.clientX - once.x, dy = e.clientY - once.y;
      // Tıklama karta gitsin diye işaretçi yalnız sürükleme başlayınca yakalanır
      if (!surukledi.current && Math.abs(dx) + Math.abs(dy) > 3) {
        surukledi.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      if (surukledi.current) setGor(g => ({ ...g, x: g.x + dx, y: g.y + dy }));
      else return;
    } else if (p.size === 2) {
      const [a, b] = [...p.entries()];
      const diger = a[0] === e.pointerId ? b[1] : a[1];
      const eski = Math.hypot(once.x - diger.x, once.y - diger.y);
      const yeni = Math.hypot(e.clientX - diger.x, e.clientY - diger.y);
      const r = kap.current!.getBoundingClientRect();
      if (eski > 0) yakinlas(yeni / eski, (e.clientX + diger.x) / 2 - r.left, (e.clientY + diger.y) / 2 - r.top);
      surukledi.current = true;
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => { parmaklar.current.delete(e.pointerId); };

  /** Kartı ortala; görünmüyorsa (başka aile seçiliyse) bütün ağaca dön */
  const [bekleyenOdak, setBekleyenOdak] = useState<string | null>(null);
  const odakla = useCallback((kisiId: string) => {
    setSecili(kisiId);
    const d = agac.konum.get(kisiId), el = kap.current;
    if (!d) { if (aileId) { setAileId(null); setBekleyenOdak(kisiId); } return; }
    if (!el) return;
    setGor(g => {
      const k = Math.max(g.k, 0.85);
      return { k, x: el.clientWidth / 2 - (d.x + O.en / 2) * k, y: el.clientHeight / 2 - (d.y + O.boy / 2) * k };
    });
  }, [agac, aileId]);
  useEffect(() => {
    if (!bekleyenOdak || !agac.konum.has(bekleyenOdak)) return;
    const id = bekleyenOdak;
    setBekleyenOdak(null);
    odakla(id);
  }, [bekleyenOdak, agac, odakla]);

  const seciliBaglar = secili ? veri.baglar.filter(b => b.a === secili || b.b === secili) : [];
  const yakinlar = new Set(seciliBaglar.filter(b => b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi').flatMap(b => [b.a, b.b]));

  const isimler = useMemo(() => gorunen.kisiler.map(k => adParcalari(k.ad).ad).sort((a, b) => a.localeCompare(b, 'tr')), [gorunen]);
  const aramaYap = (metin: string) => {
    const k = metin.trim().toLocaleLowerCase('tr');
    if (!k) return;
    const ad = (x: { ad: string }) => adParcalari(x.ad).ad.toLocaleLowerCase('tr');
    const bulunan = gorunen.kisiler.find(x => ad(x) === k) || gorunen.kisiler.find(x => ad(x).includes(k));
    if (bulunan) odakla(bulunan.id);
  };

  if (!veri.kisiler.length) {
    return (
      <div className={`${KART} p-6 space-y-2 max-w-2xl`}>
        <p className="text-[15px] font-semibold">Henüz kişi maddesi yok.</p>
        <p className={`text-[13px] ${IKINCIL} leading-relaxed`}>
          Vikide kişi maddeleri aç; künyede "Aile" ve "Eşi" alanlarını doldur ya da düzenleyicide "Ebeveyni", "Eşi", "Kardeşi" bağlarını kur. Ağaç bunlardan kendiliğinden çizilir.
        </p>
      </div>
    );
  }

  const seciliKisi = secili ? kisi.get(secili) : undefined;

  /** Tek kart (SVG): solda doğduğu ailenin şeridi, portre, ad (büyük), yıllar, rol */
  const kart = (id: string, d: { x: number; y: number }) => {
    const k = kisi.get(id);
    if (!k) return null;
    const sec = id === secili;
    const silik = !!secili && !sec && !yakinlar.has(id);
    const renk = seritRengi(id);
    const g = portreler.get(id);
    const oldu = olmus.has(id);
    const p = adParcalari(k.ad);
    const metinX = 18 + PORTRE_R * 2 + 14;
    const sigan = O.en - metinX - 12;
    const adSatir = satirlara(p.ad, Math.floor(sigan / 9.4) - (p.adsiz ? 2 : 0));
    const yil = yilYazisi(k);
    const ust = 30;
    const yilY = ust + adSatir.length * 20;
    const dogduguAd = aileAdi.get(dogduguAile(k) || '');
    return (
      <g key={id} transform={`translate(${d.x} ${d.y})`} opacity={silik ? 0.28 : 1} className="cursor-pointer"
        onClick={e => { e.stopPropagation(); if (!surukledi.current) setSecili(sec ? null : id); }}
        onDoubleClick={e => { e.stopPropagation(); onMaddeAc(id); }}>
        <rect width={O.en} height={O.boy} rx={16}
          className={`${oldu ? 'fill-[#FBF8F1] dark:fill-[#1A2550]' : 'fill-white dark:fill-[#13204A]'} ${sec ? 'stroke-[#F26B6F]' : 'stroke-[#B9AC97] dark:stroke-[#3A4A7E]'}`}
          strokeWidth={sec ? 3 : 1.3} />
        <rect x={0} y={16} width={5} height={O.boy - 32} rx={2.5} fill={renk} className={renk === '#0E1C4F' ? 'dark:fill-[#6F80B8]' : undefined} />
        <g transform={`translate(${18 + PORTRE_R} ${O.boy / 2})`}>
          <circle r={PORTRE_R + 2} className={oldu ? 'fill-[#B9A27E]' : 'fill-[#CFC5B4] dark:fill-[#3A4A7E]'} />
          <circle r={PORTRE_R} className={oldu ? 'fill-[#EFE6D4]' : 'fill-[#F3EFE8] dark:fill-[#2C3C72]'} />
          {g ? (
            <image href={g} x={-PORTRE_R} y={-PORTRE_R} width={PORTRE_R * 2} height={PORTRE_R * 2} preserveAspectRatio="xMidYMin slice"
              clipPath="url(#soy-portre)" style={oldu ? { filter: 'grayscale(1) sepia(0.45)' } : undefined} />
          ) : (
            <text textAnchor="middle" dy={8} fontSize={23} fontWeight={600} className={oldu ? 'fill-[#8C7350]' : 'fill-[#0E1C4F] dark:fill-[#F3EFE8]'}>{kisiHarfi(k.ad)}</text>
          )}
        </g>
        {adSatir.map((s, n) => (
          <text key={n} x={metinX} y={ust + n * 20} fontSize={16.5} fontWeight={700} className="fill-[#0E1C4F] dark:fill-[#F3EFE8]">
            {n === 0 && p.adsiz && <tspan fillOpacity={0.35} fontWeight={400}>— </tspan>}{s}
          </text>
        ))}
        {yil && (
          // Uzun yıl aralığı ("1890'lar – 1950'ler/1960'lar") kartın içine sıkıştırılır
          <text x={metinX} y={yilY} fontSize={14} className="fill-[#4F4636] dark:fill-[#C9D0E0]"
            {...(yil.length * 7.4 > sigan ? { textLength: sigan, lengthAdjust: 'spacingAndGlyphs' as const } : {})}>{yil}</text>
        )}
        {k.rol && yilY + 18 < O.boy - 8 && (
          <text x={metinX} y={yilY + 18} fontSize={12.5} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]">{kisalt(k.rol.split(/[;(]/)[0].trim(), Math.floor(sigan / 6.9))}</text>
        )}
        <title>{[p.adsiz ? `— ${p.ad}` : p.ad, yil, k.rol, dogduguAd ? `Doğduğu aile: ${dogduguAd}` : ''].filter(Boolean).join(' · ')}</title>
      </g>
    );
  };

  return (
    <div className="space-y-3">
      {/* Süzgeçler */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={aileId ?? ''} onChange={e => { setAileId(e.target.value || null); setSecili(null); }} aria-label="Aile" className={GIRDI}>
          <option value="">Bütün aileler</option>
          {veri.aileler.filter(a => veri.kisiler.some(k => k.aileId === a.id || k.dogumAileId === a.id)).map(a => <option key={a.id} value={a.id}>{a.ad}</option>)}
        </select>
        <form className="relative ml-auto" onSubmit={e => { e.preventDefault(); aramaYap(arama); }}>
          <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${IKINCIL}`} />
          <input list="soy-isimler" value={arama} onChange={e => { setArama(e.target.value); if (isimler.includes(e.target.value)) aramaYap(e.target.value); }}
            placeholder="Kişi bul" aria-label="Kişi bul" className={`${GIRDI} pl-7 w-44`} />
          <datalist id="soy-isimler">{isimler.map(a => <option key={a} value={a} />)}</datalist>
        </form>
      </div>

      {/* Yıl ve dönem */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAralik(null)} className={CIP(aralik === null)}>Bütün zamanlar</button>
        {donemler.map(d => {
          const r: [number, number] = [d.bas, d.bit ?? (sinir ? sinir[1] : d.bas)];
          const sec = !!aralik && aralik[0] === r[0] && aralik[1] === r[1];
          return <button key={d.id} type="button" onClick={() => setAralik(r)} className={CIP(sec)}>{d.ad}</button>;
        })}
        {sinir && sinir[1] > sinir[0] && (
          <label className={`inline-flex items-center gap-2 text-[12px] ${IKINCIL}`}>
            Yıl
            <input type="range" min={sinir[0]} max={sinir[1]} value={aralik ? aralik[0] : sinir[0]}
              onChange={e => { const y = Number(e.target.value); setAralik([y, y]); }} className="w-40 accent-[#F26B6F]" aria-label="Yıl" />
            <span className="font-mono tabular-nums text-[#0E1C4F] dark:text-[#F3EFE8] w-20">
              {aralik ? (aralik[0] === aralik[1] ? aralik[0] : `${aralik[0]}–${aralik[1]}`) : '—'}
            </span>
          </label>
        )}
      </div>

      <div className="relative">
        <div ref={kap} className={`${KART} relative overflow-hidden h-[calc(100dvh-15rem)] min-h-[460px] touch-none select-none cursor-grab active:cursor-grabbing`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onClick={() => { if (!surukledi.current) setSecili(null); }}>
          {agac.konum.size === 0 ? (
            <div className={`absolute inset-0 grid place-items-center text-[13px] ${IKINCIL} p-6 text-center`}>
              Bu süzgeçte bağı olan kişi yok.
            </div>
          ) : (
            <svg width="100%" height="100%" role="img" aria-label={`Soy ağacı: ${gorunen.kisiler.length} kişi`} className="block font-sans">
              <defs>
                <clipPath id="soy-portre"><circle cx={0} cy={0} r={PORTRE_R} /></clipPath>
              </defs>
              <g transform={`translate(${gor.x} ${gor.y}) scale(${gor.k})`}>
                {/* Çizgiler: eş çift çizgi, çocuk dik çizgi; ebeveyni ağaçta olmayan kardeşler ince köşe */}
                {agac.cizgiler.map(z => {
                  const ilgili = !secili || z.kisiler.includes(secili);
                  return z.tur === 'eşi' ? (
                    <g key={z.id} opacity={ilgili ? 1 : 0.25}>
                      <path d={z.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={7} />
                      <path d={z.d} fill="none" className="stroke-[#FAF8F5] dark:stroke-[#0E1733]" strokeWidth={2.6} />
                    </g>
                  ) : (
                    <path key={z.id} d={z.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={z.tur === 'kardeşi' ? 1.6 : 2.2}
                      strokeLinejoin="round" opacity={ilgili ? (z.tur === 'kardeşi' ? 0.7 : 0.95) : 0.25} />
                  );
                })}

                {/* Kişiler: her kişi tek kartta */}
                {[...agac.konum.entries()].map(([id, d]) => kart(id, d))}
              </g>
            </svg>
          )}

          {/* Yakınlaştırma */}
          <div className="absolute left-3 bottom-3 flex flex-col gap-1" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => yakinlas(1.25)} aria-label="Yakınlaştır" className={`${GIRDI} !px-2`}><Plus className="w-4 h-4" /></button>
            <button type="button" onClick={() => yakinlas(0.8)} aria-label="Uzaklaştır" className={`${GIRDI} !px-2`}><Minus className="w-4 h-4" /></button>
            <button type="button" onClick={() => sigdir(true)} aria-label="Bütün ağaç" title="Bütün ağaç" className={`${GIRDI} !px-2`}><Maximize2 className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Seçili kişi */}
        {seciliKisi && (() => {
          const k = seciliKisi;
          const dogdugu = aileAdi.get(dogduguAile(k) || '');
          return (
            <div className={`${KART} absolute right-3 top-3 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto p-4 space-y-3 shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)]`}
              onPointerDown={e => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <KisiPortresi gorsel={portreler.get(k.id)} ad={k.ad} olmus={olmus.has(k.id)} boyut={64} harf />
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-semibold leading-snug text-[#0E1C4F] dark:text-[#F3EFE8]"><KisiAdi ad={k.ad} /></div>
                  {yilYazisi(k) && <div className="text-[13px] text-[#4F4636] dark:text-[#C9D0E0]">{yilYazisi(k)}</div>}
                  {k.rol && <div className="text-[12.5px] mt-0.5 text-[#0E1C4F] dark:text-[#F3EFE8]">{k.rol}</div>}
                </div>
                <button type="button" onClick={() => setSecili(null)} aria-label="Kapat" className={`p-1 ${IKINCIL}`}><X className="w-4 h-4" /></button>
              </div>
              <div className={`flex items-center gap-2 text-[12.5px] ${IKINCIL}`}>
                <span className="inline-block w-1.5 h-4 rounded-full" style={{ background: seritRengi(k.id) }} />
                {dogdugu ? <>Doğduğu aile: <span className="text-[#0E1C4F] dark:text-[#F3EFE8]">{dogdugu}</span></> : 'Doğduğu aile vikide yok'}
              </div>
              {seciliBaglar.length ? (
                <ul className="space-y-1 text-[13px]">
                  {seciliBaglar.map(b => {
                    const o = b.a === secili ? b.b : b.a;
                    const ad = b.tur === 'ebeveyni' ? (b.a === secili ? 'Ebeveyni' : 'Çocuğu')
                      : b.tur === 'patronu' ? (b.a === secili ? 'Patronu' : 'Yanında çalışan') : BAG_ADI[b.tur];
                    return (
                      <li key={b.id} className="flex items-baseline gap-1.5">
                        <span className={`text-[12px] ${IKINCIL} w-28 shrink-0`}>{ad}</span>
                        {agac.konum.has(o) ? (
                          <button type="button" onClick={() => odakla(o)} className="text-left underline decoration-[#0E1C4F]/30 underline-offset-2 hover:decoration-[#F26B6F]"><KisiAdi ad={kisi.get(o)?.ad || ''} /></button>
                        ) : <KisiAdi ad={kisi.get(o)?.ad || ''} />}
                        {yilMetni(b) && <span className={`text-[11px] font-mono ${IKINCIL}`}>{yilMetni(b)}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className={`text-[12px] ${IKINCIL}`}>Kişi bağı yok; ailesiyle ağaçta.</p>}
              <button type="button" onClick={() => onMaddeAc(k.id)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-white cursor-pointer">Maddeyi aç</button>
            </div>
          );
        })()}
      </div>

      {/* Şerit renkleri: kartın solundaki ince şerit kişinin doğduğu aile */}
      {aileRengi.size > 0 && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] ${IKINCIL}`}>
          <span>Kartın solundaki şerit doğduğu aile:</span>
          {[...aileRengi].map(([id, renk]) => (
            <button key={id} type="button" onClick={() => { setAileId(aileId === id ? null : id); setSecili(null); }}
              className={`inline-flex items-center gap-1.5 cursor-pointer hover:text-[#F26B6F] ${aileId === id ? 'text-[#0E1C4F] dark:text-[#F3EFE8] font-semibold' : ''}`}>
              <span className="inline-block w-1.5 h-3.5 rounded-full" style={{ background: renk }} />{aileAdi.get(id)}
            </button>
          ))}
          {bilinmeyenVar && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-1.5 h-3.5 rounded-full" style={{ background: BOS_RENK }} />vikide yok</span>}
        </div>
      )}

      <p className={`text-[12px] ${IKINCIL} leading-relaxed`}>
        {gorunen.kisiler.length} kişi{gizliSayi > 0 && !aileId && !aralik ? ` · bağı olmayan ${gizliSayi} kişi gösterilmiyor` : ''}.
        Çift çizgi evli, dik çizgi çocuğu; ebeveyni vikide olmayan kardeşlerin üstünde ince bir köşe var. Akrabalık seçili kişinin kartında yazar.
        Sürükle, tekerlekle ya da iki parmakla yakınlaş; karta dokun, çift dokununca maddesi açılır.
        İş, arkadaşlık ve rekabet bağları Bağ ağı'nda.
      </p>
    </div>
  );
};

export default SoyAgaci;
