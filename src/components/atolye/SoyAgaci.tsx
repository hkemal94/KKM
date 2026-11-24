import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { Item } from '../../types';
import { soyDegeri } from '../wiki/soyDegeri';
import { MonogramIcerik } from '../wiki/AileMonogrami';
import { KisiAdi, KisiPortresi, portreBul, yilYazisi } from '../wiki/AileAgaci';
import { aileGorseliVar, hayattaDegil } from '../../lib/aileAgaci';
import { donemleriOku } from '../../lib/zamanCizgisi';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import {
  CERCEVE_BASLIK, adParcalari, agacCizgileri, bagliKisiler, genelAgac, kisiHarfi, soyVerisi, suz, yilSiniri,
  type AgacOlcu, type GenelDugum, type SoyBagTuru
} from '../../lib/soyAgaci';

/**
 * Görünümler → Soy ağacı: bütün adanın tek genel ağacı (24 Kasım, Kemal:
 * "tuval üzerinden birbirleriyle doğru bağlantıları kurulan aile; genel bir
 * soy ağacı istiyorum").
 *
 * - Bağlar viki verisinden kendiliğinden: ebeveyni, eşi, kardeşi (künyedeki
 *   "Eşi" dahil) ve aile üyeliği (Aile, Soyadı, Doğduğu aile).
 * - Her aile kendi çerçevesinde, monogramlı başlıkla; kuşaklar yukarıdan aşağı,
 *   eşler yan yana, çocuklar ortalı altta (`lib/soyAgaci.ts` → `genelAgac`).
 * - Aileler arası uzun çizgi yok: evlilikle ya da doğumla başka ailede de yeri
 *   olan kişinin orada kesik kenarlı yansıma kartı var; iki kart kısa okla
 *   birbirine bağlı, basınca öbürüne gidilir.
 * - İş, arkadaşlık, rekabet bağları burada çizilmez (Bağ ağı'nda); seçili
 *   kişinin kartında yazıyla durur.
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
/** Aile renkleri (sırayla): çerçeve başlığı ve kartın sol şeridi */
const AILE_RENK = ['#0E1C4F', '#B4474B', '#9A7424', '#2F7D6D', '#7A4E8E', '#3E6F9E'];

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
/** "Ercan Ailesi" → "Ercan Ailesi'nde" / "'nden" (aile adları "Ailesi" ile biter) */
const aileEki = (ad: string, ek: 'de' | 'den') => (/ailesi$/i.test(ad) ? `${ad}'n${ek}` : ad);

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

  // Görünenler: yıl süzgeci, sonra aile bağı da ailesinde başkası da olmayan kişi çıkar
  const gorunen = useMemo(() => {
    const s = suz(veri, { aralik, aileId: null, yanlar: new Set() });
    const kisiler = bagliKisiler(s.kisiler, s.baglar);
    const ic = new Set(kisiler.map(k => k.id));
    return { kisiler, baglar: s.baglar.filter(b => ic.has(b.a) && ic.has(b.b)) };
  }, [veri, aralik]);
  const gizli = veri.kisiler.length - gorunen.kisiler.length;

  // Tuvalin en/boy oranı: çerçeveler telefonda alt alta, geniş ekranda yan yana sarılır
  const kap = useRef<HTMLDivElement>(null);
  const [oran, setOran] = useState(1.6);
  useEffect(() => {
    const el = kap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!el.clientHeight) return;
      const yeni = Math.round((el.clientWidth / el.clientHeight) * 4) / 4;
      setOran(o => (Math.abs(o - yeni) > 0.2 ? yeni : o));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tumAgac = useMemo(() => genelAgac(gorunen.kisiler, gorunen.baglar, veri.aileler, O, oran), [gorunen, veri.aileler, oran]);
  // Aile seçiliyse yalnız o ailenin çerçevesi
  const agac = useMemo(() => {
    if (!aileId || !tumAgac.cerceveler.some(c => c.id === aileId)) return tumAgac;
    const c = tumAgac.cerceveler.find(x => x.id === aileId)!;
    const dx = -c.x, dy = -c.y;
    return {
      cerceveler: [{ ...c, x: 0, y: 0, icX: c.icX + dx, icY: c.icY + dy }],
      dugumler: tumAgac.dugumler.filter(d => d.cerceve === aileId).map(d => ({ ...d, x: d.x + dx, y: d.y + dy })),
      kartlari: tumAgac.kartlari
    };
  }, [tumAgac, aileId]);
  const dugum = useMemo(() => new Map(agac.dugumler.map(d => [d.id, d])), [agac]);
  const kisi = useMemo(() => new Map(veri.kisiler.map(k => [k.id, k])), [veri]);
  const aileRengi = useMemo(() => new Map(veri.aileler.map((a, n) => [a.id, AILE_RENK[n % AILE_RENK.length]])), [veri]);
  const aileAdi = useMemo(() => new Map(veri.aileler.map(a => [a.id, a.ad])), [veri]);
  /** Görseli olmayan ailenin çerçeve başlığında monogram (yer tutucu) */
  const monogramli = useMemo(() => new Set(veri.aileler.filter(a => {
    const i = madde.get(a.id);
    return !!i && !aileGorseliVar(i, items);
  }).map(a => a.id)), [veri, madde, items]);
  const cizgiler = useMemo(() => new Map(agac.cerceveler.map(c => [c.id, agacCizgileri(c.konum, c.kenarlar, O)])), [agac]);

  // ---- Tuval: kaydırma ve yakınlaştırma ----
  const [gor, setGor] = useState<Gorunum>({ x: 0, y: 0, k: 1 });
  const sinirKutusu = useMemo(() => {
    const cs = agac.cerceveler;
    if (!cs.length) return { x: 0, y: 0, en: 400, boy: 200 };
    const x = Math.min(...cs.map(b => b.x)), y = Math.min(...cs.map(b => b.y));
    return { x, y, en: Math.max(...cs.map(b => b.x + b.en)) - x, boy: Math.max(...cs.map(b => b.y + b.boy)) - y };
  }, [agac]);
  /** Bütün ağaç ekrana; okunmayacak kadar küçülecekse ilk (en kalabalık) aile okunur boyda */
  const sigdir = useCallback((hepsi = false) => {
    const el = kap.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight, pay = 20;
    const k = Math.min(1.1, Math.min((w - pay * 2) / sinirKutusu.en, (h - pay * 2) / sinirKutusu.boy));
    const ilk = agac.cerceveler[0];
    if (!hepsi && k < 0.42 && ilk) {
      // Telefonda da adlar okunsun: en az 0,6; sığmayan kısım yana kaydırılarak görülür
      const k2 = Math.min(1, Math.max(0.6, (w - pay * 2) / ilk.en));
      const sigiyor = ilk.en * k2 <= w - pay * 2;
      setGor({ k: k2, x: (sigiyor ? (w - ilk.en * k2) / 2 : pay) - ilk.x * k2, y: pay - ilk.y * k2 });
      return;
    }
    const kk = Math.max(0.1, k);
    setGor({ k: kk, x: (w - sinirKutusu.en * kk) / 2 - sinirKutusu.x * kk, y: (h - sinirKutusu.boy * kk) / 2 - sinirKutusu.y * kk });
  }, [sinirKutusu, agac]);
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
  const odakla = useCallback((dugumId: string, kisiId: string) => {
    setSecili(kisiId);
    const d = dugum.get(dugumId), el = kap.current;
    if (!d) { if (aileId) { setAileId(null); setBekleyenOdak(dugumId); } return; }
    if (!el) return;
    setGor(g => {
      const k = Math.max(g.k, 0.85);
      return { k, x: el.clientWidth / 2 - (d.x + O.en / 2) * k, y: el.clientHeight / 2 - (d.y + O.boy / 2) * k };
    });
  }, [dugum, aileId]);
  useEffect(() => {
    if (!bekleyenOdak || !dugum.has(bekleyenOdak)) return;
    const d = dugum.get(bekleyenOdak)!;
    setBekleyenOdak(null);
    odakla(d.id, d.kisiId);
  }, [bekleyenOdak, dugum, odakla]);
  /** Kişinin öbür kartları (kısa ok) */
  const obur = (d: GenelDugum) => (agac.kartlari.get(d.kisiId) || []).filter(x => x.id !== d.id);

  const seciliBaglar = secili ? veri.baglar.filter(b => b.a === secili || b.b === secili) : [];
  const yakinlar = new Set(seciliBaglar.filter(b => b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi').flatMap(b => [b.a, b.b]));

  const isimler = useMemo(() => gorunen.kisiler.map(k => adParcalari(k.ad).ad).sort((a, b) => a.localeCompare(b, 'tr')), [gorunen]);
  const aramaYap = (metin: string) => {
    const k = metin.trim().toLocaleLowerCase('tr');
    if (!k) return;
    const ad = (x: { ad: string }) => adParcalari(x.ad).ad.toLocaleLowerCase('tr');
    const bulunan = gorunen.kisiler.find(x => ad(x) === k) || gorunen.kisiler.find(x => ad(x).includes(k));
    const kart = bulunan ? (tumAgac.kartlari.get(bulunan.id) || [])[0] : undefined;
    if (bulunan && kart) odakla(kart.id, bulunan.id);
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

  /** Tek kart (SVG): portre, ad (büyük), yıllar, rol; yansımada kesik kenar */
  const kart = (d: GenelDugum) => {
    const k = kisi.get(d.kisiId);
    if (!k) return null;
    const sec = d.kisiId === secili;
    const silik = !!secili && !sec && !yakinlar.has(d.kisiId);
    const renk = aileRengi.get(d.cerceve) || '#8C7B63';
    const g = portreler.get(d.kisiId);
    const oldu = olmus.has(d.kisiId);
    const p = adParcalari(k.ad);
    const metinX = 18 + PORTRE_R * 2 + 14;
    const sigan = O.en - metinX - 12;
    const adSatir = satirlara(p.ad, Math.floor(sigan / 9.4) - (p.adsiz ? 2 : 0));
    const yil = yilYazisi(k);
    const ust = 30;
    const yilY = ust + adSatir.length * 20;
    const ok = obur(d)[0];
    const okYazi = ok ? `↗ ${kisalt(aileEki(aileAdi.get(ok.cerceve) || '', d.yansima ? 'de' : 'den'), 26)}` : '';
    const okEn = okYazi.length * 6.7 + 20;
    return (
      <g key={d.id} transform={`translate(${d.x} ${d.y})`} opacity={silik ? 0.28 : 1} className="cursor-pointer"
        onClick={e => { e.stopPropagation(); if (!surukledi.current) setSecili(sec ? null : d.kisiId); }}
        onDoubleClick={e => { e.stopPropagation(); onMaddeAc(d.kisiId); }}>
        <rect width={O.en} height={O.boy} rx={16}
          className={`${d.yansima ? 'fill-[#F6F1E8] dark:fill-[#101A3D]' : oldu ? 'fill-[#FBF8F1] dark:fill-[#1A2550]' : 'fill-white dark:fill-[#13204A]'} ${sec ? 'stroke-[#F26B6F]' : 'stroke-[#B9AC97] dark:stroke-[#3A4A7E]'}`}
          strokeWidth={sec ? 3 : 1.3} strokeDasharray={d.yansima ? '7 5' : undefined} />
        {!d.yansima && <rect x={0} y={16} width={5} height={O.boy - 32} rx={2.5} fill={renk} className={renk === '#0E1C4F' ? 'dark:fill-[#6F80B8]' : undefined} />}
        <g transform={`translate(${18 + PORTRE_R} ${O.boy / 2 - (ok ? 6 : 0)})`}>
          <circle r={PORTRE_R + 2.5} fill={oldu ? '#B9A27E' : renk} />
          <circle r={PORTRE_R} className={oldu ? 'fill-[#EFE6D4]' : 'fill-[#F3EFE8] dark:fill-[#2C3C72]'} />
          {g ? (
            <image href={g} x={-PORTRE_R} y={-PORTRE_R} width={PORTRE_R * 2} height={PORTRE_R * 2} preserveAspectRatio="xMidYMin slice"
              clipPath="url(#soy-portre)" style={oldu ? { filter: 'grayscale(1) sepia(0.45)' } : undefined} />
          ) : (
            <text textAnchor="middle" dy={8} fontSize={23} fontWeight={600} fill={oldu ? '#8C7350' : renk} className={oldu ? '' : 'dark:fill-[#F3EFE8]'}>{kisiHarfi(k.ad)}</text>
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
        {k.rol && yilY + 18 < O.boy - (ok ? 22 : 8) && (
          <text x={metinX} y={yilY + 18} fontSize={12.5} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]">{kisalt(k.rol.split(/[;(]/)[0].trim(), Math.floor(sigan / 6.9))}</text>
        )}
        {ok && (
          <g transform={`translate(${O.en - okEn - 10} ${O.boy - 12})`} className="cursor-pointer"
            onClick={e => { e.stopPropagation(); if (!surukledi.current) odakla(ok.id, ok.kisiId); }}>
            <rect width={okEn} height={22} rx={11} className="fill-[#FDE9E9] dark:fill-[#3A2236] stroke-[#F26B6F]" strokeWidth={1} />
            <text x={okEn / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-[#B4474B] dark:fill-[#F7A5A8]">{okYazi}</text>
            <title>{d.yansima ? 'Kişinin asıl kartı bu ailede; basınca oraya gider' : 'Kişinin öbür ailedeki yeri; basınca oraya gider'}</title>
          </g>
        )}
        <title>{[p.adsiz ? `— ${p.ad}` : p.ad, yil, k.rol].filter(Boolean).join(' · ')}</title>
      </g>
    );
  };

  return (
    <div className="space-y-3">
      {/* Süzgeçler */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={aileId ?? ''} onChange={e => { setAileId(e.target.value || null); setSecili(null); }} aria-label="Aile" className={GIRDI}>
          <option value="">Bütün aileler</option>
          {veri.aileler.filter(a => tumAgac.cerceveler.some(c => c.id === a.id)).map(a => <option key={a.id} value={a.id}>{a.ad}</option>)}
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
          {agac.dugumler.length === 0 ? (
            <div className={`absolute inset-0 grid place-items-center text-[13px] ${IKINCIL} p-6 text-center`}>
              Bu süzgeçte bağı olan kişi yok.
            </div>
          ) : (
            <svg width="100%" height="100%" role="img" aria-label={`Soy ağacı: ${gorunen.kisiler.length} kişi, ${agac.cerceveler.length} aile`} className="block font-sans">
              <defs>
                <clipPath id="soy-portre"><circle cx={0} cy={0} r={PORTRE_R} /></clipPath>
              </defs>
              <g transform={`translate(${gor.x} ${gor.y}) scale(${gor.k})`}>
                {/* Aile çerçeveleri: monogramlı başlık */}
                {agac.cerceveler.map(c => {
                  const renk = c.id === '~' ? '#8C7B63' : aileRengi.get(c.id) || '#0E1C4F';
                  const mono = monogramli.has(c.id);
                  return (
                    <g key={c.id}>
                      <rect x={c.x} y={c.y} width={c.en} height={c.boy} rx={24} fill={renk} fillOpacity={0.05} stroke={renk} strokeOpacity={0.4} strokeWidth={1.4} />
                      <path d={`M${c.x},${c.y + CERCEVE_BASLIK} V${c.y + 24} a24,24 0 0 1 24,-24 H${c.x + c.en - 24} a24,24 0 0 1 24,24 V${c.y + CERCEVE_BASLIK} Z`} fill={renk} fillOpacity={0.92}
                        className={renk === '#0E1C4F' ? 'dark:fill-[#2C3C72]' : undefined} />
                      {mono && <g transform={`translate(${c.x + 14} ${c.y + 6}) scale(0.9)`}><MonogramIcerik ad={c.ad} /></g>}
                      <text x={c.x + (mono ? 58 : 22)} y={c.y + 31} fontSize={18} fontWeight={700} fill="#fff" letterSpacing={0.3}>{c.ad}</text>
                      <text x={c.x + c.en - 20} y={c.y + 30} textAnchor="end" fontSize={13} fill="#fff" fillOpacity={0.85}>{c.kisiSayisi} kişi</text>
                    </g>
                  );
                })}

                {/* Çizgiler: çerçeve içinde kısa; eş çift çizgi, çocuk dik çizgi, kardeş kesik köşe */}
                {agac.cerceveler.map(c => (
                  <g key={`c-${c.id}`} transform={`translate(${c.icX} ${c.icY})`}>
                    {(cizgiler.get(c.id) || []).map(z => {
                      const ilgili = !secili || z.id.includes(secili);
                      return z.tur === 'eşi' ? (
                        <g key={z.id} opacity={ilgili ? 1 : 0.25}>
                          <path d={z.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={7} />
                          <path d={z.d} fill="none" className="stroke-[#FAF8F5] dark:stroke-[#0E1733]" strokeWidth={2.6} />
                        </g>
                      ) : (
                        <path key={z.id} d={z.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={2.2}
                          strokeDasharray={z.tur === 'kardeşi' ? '4 5' : undefined} opacity={ilgili ? 0.95 : 0.25} />
                      );
                    })}
                  </g>
                ))}

                {/* Kişiler */}
                {agac.dugumler.map(kart)}
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
          const kartlar = tumAgac.kartlari.get(k.id) || [];
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
              {kartlar.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {kartlar.map(d => (
                    <button key={d.id} type="button" onClick={() => odakla(d.id, k.id)}
                      className="px-2 py-0.5 rounded-full text-[12px] border border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F] cursor-pointer">
                      {d.yansima ? '↗ ' : ''}{aileAdi.get(d.cerceve) || 'Ailesiz'}
                    </button>
                  ))}
                </div>
              )}
              {seciliBaglar.length ? (
                <ul className="space-y-1 text-[13px]">
                  {seciliBaglar.map(b => {
                    const o = b.a === secili ? b.b : b.a;
                    const ad = b.tur === 'ebeveyni' ? (b.a === secili ? 'Ebeveyni' : 'Çocuğu')
                      : b.tur === 'patronu' ? (b.a === secili ? 'Patronu' : 'Yanında çalışan') : BAG_ADI[b.tur];
                    const oKart = (tumAgac.kartlari.get(o) || [])[0];
                    return (
                      <li key={b.id} className="flex items-baseline gap-1.5">
                        <span className={`text-[12px] ${IKINCIL} w-28 shrink-0`}>{ad}</span>
                        {oKart ? (
                          <button type="button" onClick={() => odakla(oKart.id, o)} className="text-left underline decoration-[#0E1C4F]/30 underline-offset-2 hover:decoration-[#F26B6F]"><KisiAdi ad={kisi.get(o)?.ad || ''} /></button>
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

      <p className={`text-[12px] ${IKINCIL} leading-relaxed`}>
        {gorunen.kisiler.length} kişi · {agac.cerceveler.length} aile{gizli > 0 ? ` · bağı olmayan ${gizli} kişi gösterilmiyor` : ''}.
        Her aile kendi çerçevesinde; çift çizgi evli, dik çizgi çocuğu, kesik köşe kardeş. Kesik kenarlı kart kişinin başka bir ailedeki yeridir;
        ↗ ok iki kartı bağlar, basınca öbürüne gider. Sürükle, tekerlekle ya da iki parmakla yakınlaş; karta dokun, çift dokununca maddesi açılır.
        İş, arkadaşlık ve rekabet bağları Bağ ağı'nda; burada seçili kişinin kartında yazar.
      </p>
    </div>
  );
};

export default SoyAgaci;
