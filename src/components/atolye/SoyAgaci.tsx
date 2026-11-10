import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import type { Item } from '../../types';
import { schemaKeyFor, getKunyeFields, getEkBilgiler } from '../wiki/wikiSchema';
import { donemleriOku } from '../../lib/zamanCizgisi';
import { maddeGorseli, siluetMi } from '../../lib/maddeGorseli';
import {
  YAN_GRUPLAR, aileDiz, bagliKisiler, soyVerisi, suz, yilSiniri,
  type SoyBagi, type SoyBagTuru, type YanBag
} from '../../lib/soyAgaci';

/**
 * Görünümler → Soy ağacı (6. gece; 10 Kasım'da büyük ağaç).
 *
 * Kemal (10 Kasım): "sağlam, interaktif, büyük bir soy ağacı; aile bağı ya da
 * başka bağı olmayan kişi hiç çıkmasın; iş ve arkadaşlık kapalı başlasın,
 * açınca görelim; kutuda portre, ad, yıllar."
 *
 * - Her aile kendi çerçevesinde, kendi kuşaklarıyla; evlilikle bağlı aileler
 *   yan yana. Ailesi olmayan bağlı kişi "Ailesiz" çerçevesinde.
 * - Bağlar elle kurulanlardan ve künyeden gelir: "Eşi" alanı eş, aynı
 *   "Çalıştığı yer" iş yeri bağı.
 * - Tuval sürüklenir; tekerlek, iki parmak ve düğmelerle yakınlaşır.
 * - Kişiye dokununca bağları öne çıkar, yanda kartı açılır.
 * Bu ekran kayda bir şey yazmaz.
 */

interface Props {
  items: Item[];
  onMaddeAc: (id: string) => void;
  /** Aile sayfasından "Soy ağacında aç" ile gelindiyse o aile */
  ilkAile?: string | null;
}

const KUTU_EN = 212;
const KUTU_BOY = 76;
const PORTRE_R = 26;

const BAG_ADI: Record<SoyBagTuru, string> = {
  ebeveyni: 'Ebeveyni', 'eşi': 'Eşi', 'kardeşi': 'Kardeşi', 'akrabası': 'Akrabası',
  patronu: 'Patronu', 'iş ortağı': 'İş ortağı', 'iş yeri': 'Aynı yerde çalışır', 'arkadaşı': 'Arkadaşı', rakibi: 'Rakibi', 'tanıdığı kişi': 'Tanıdığı'
};
/** Yan bağ renkleri: iş hardal, arkadaşlık yeşil, rekabet kiremit, tanıdık gri */
const YAN_RENGI: Record<YanBag, string> = {
  patronu: 'stroke-[#C99A2E]', 'iş ortağı': 'stroke-[#C99A2E]', 'iş yeri': 'stroke-[#C99A2E]',
  'arkadaşı': 'stroke-[#2F7D6D] dark:stroke-[#5FB3A0]',
  rakibi: 'stroke-[#F26B6F]', 'tanıdığı kişi': 'stroke-[#8C7B63] dark:stroke-[#A6B0C9]'
};
const CIP_NOKTASI: Record<string, string> = { is: 'bg-[#C99A2E]', arkadaslik: 'bg-[#2F7D6D]', rekabet: 'bg-[#F26B6F]', tanidik: 'bg-[#8C7B63]' };
/** Aile renkleri (sırayla): çerçeve başlığı ve kutunun sol şeridi */
const AILE_RENK = ['#0E1C4F', '#F26B6F', '#C99A2E', '#2F7D6D', '#8A5A9E', '#3E7CB1'];

const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const KART = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]';
const GIRDI = 'text-[12px] bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#F26B6F]';
const CIP = (secili: boolean) => `inline-flex items-center gap-1.5 min-h-8 px-2.5 py-0.5 rounded-full text-[11px] border cursor-pointer ${secili
  ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent'
  : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#F26B6F]'}`;
const yilMetni = (b: { bas?: number; bit?: number }) => (b.bas === undefined ? '' : `${b.bas}–${b.bit ?? ''}`);
const kisalt = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const basHarfler = (ad: string) => ad.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toLocaleUpperCase('tr');

/** Künye değeri: alan kimliğiyle ya da etiketiyle ("Eşi" gibi türe sonradan eklenen alanlar) */
const degerOku = (i: Item, id: string) => {
  if (!schemaKeyFor(i.type)) return '';
  const alanlar = getKunyeFields(i);
  const etiket = (f: { label: string }) => f.label.trim().toLocaleLowerCase('tr') === id;
  // Şemada yoksa metindeki künye satırından ("* Eşi: …") okunur
  return (alanlar.find(f => f.id === id) || alanlar.find(etiket) || getEkBilgiler(i).find(etiket))?.value || '';
};

interface Gorunum { x: number; y: number; k: number }

export const SoyAgaci: React.FC<Props> = ({ items, onMaddeAc, ilkAile = null }) => {
  const veri = useMemo(() => soyVerisi(items, degerOku), [items]);
  const donemler = useMemo(() => donemleriOku(items), [items]);
  const madde = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const portre = useCallback((id: string) => {
    const i = madde.get(id);
    const g = i ? maddeGorseli(i, items) : undefined;
    return g && !siluetMi(g) ? g : undefined;
  }, [madde, items]);

  const [aileId, setAileId] = useState<string | null>(ilkAile);
  useEffect(() => { if (ilkAile) setAileId(ilkAile); }, [ilkAile]);
  // Kemal (10 Kasım): iş ve arkadaşlık kapalı başlar, açınca görünür
  const [yanGruplar, setYanGruplar] = useState<Set<string>>(() => new Set());
  const yanlar = useMemo(() => new Set(YAN_GRUPLAR.filter(g => yanGruplar.has(g.id)).flatMap(g => g.turler)), [yanGruplar]);
  const [aralik, setAralik] = useState<[number, number] | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [arama, setArama] = useState('');

  const sinir = useMemo(() => {
    const s = yilSiniri(veri);
    const ys = [...(s || []), ...donemler.flatMap(d => [d.bas, d.bit ?? d.bas])];
    return ys.length ? [Math.min(...ys), Math.max(...ys)] as [number, number] : null;
  }, [veri, donemler]);

  // Görünenler: süzgeç, sonra bağı olmayan kişi çıkar
  const gorunen = useMemo(() => {
    const s = suz(veri, { aralik, aileId, yanlar });
    const kisiler = bagliKisiler(s.kisiler, s.baglar);
    const ic = new Set(kisiler.map(k => k.id));
    return { kisiler, baglar: s.baglar.filter(b => ic.has(b.a) && ic.has(b.b)) };
  }, [veri, aralik, aileId, yanlar]);
  const gizli = veri.kisiler.length - gorunen.kisiler.length;

  // Tuvalin en/boy oranı: bloklar telefonda alt alta, geniş ekranda yan yana sarılır
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
  const { konum, bloklar } = useMemo(
    () => aileDiz(gorunen.kisiler, gorunen.baglar, veri.aileler, KUTU_EN, KUTU_BOY, oran),
    [gorunen, veri.aileler, oran]
  );
  const kisi = useMemo(() => new Map(veri.kisiler.map(k => [k.id, k])), [veri]);
  const aileRengi = useMemo(() => new Map(veri.aileler.map((a, n) => [a.id, AILE_RENK[n % AILE_RENK.length]])), [veri]);

  // ---- Tuval: kaydırma ve yakınlaştırma ----
  const [gor, setGor] = useState<Gorunum>({ x: 0, y: 0, k: 1 });
  const sinirKutusu = useMemo(() => {
    if (!bloklar.length) return { x: 0, y: 0, en: 400, boy: 200 };
    const x = Math.min(...bloklar.map(b => b.x)), y = Math.min(...bloklar.map(b => b.y));
    return { x, y, en: Math.max(...bloklar.map(b => b.x + b.en)) - x, boy: Math.max(...bloklar.map(b => b.y + b.boy)) - y };
  }, [bloklar]);
  const sigdir = useCallback(() => {
    const el = kap.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight, pay = 32;
    const k = Math.min(1.2, Math.max(0.15, Math.min((w - pay * 2) / sinirKutusu.en, (h - pay * 2) / sinirKutusu.boy)));
    setGor({ k, x: (w - sinirKutusu.en * k) / 2 - sinirKutusu.x * k, y: (h - sinirKutusu.boy * k) / 2 - sinirKutusu.y * k });
  }, [sinirKutusu]);
  useEffect(() => { sigdir(); }, [sigdir]);

  const yakinlas = useCallback((carpan: number, cx?: number, cy?: number) => {
    const el = kap.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    setGor(g => {
      const k = Math.min(2.5, Math.max(0.12, g.k * carpan));
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
      // Tıklama kutuya gitsin diye işaretçi yalnız sürükleme başlayınca yakalanır
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

  /** Kişiyi ortala (arama ve yan paneldeki bağlar) */
  const odakla = useCallback((id: string) => {
    const p = konum.get(id), el = kap.current;
    setSecili(id);
    if (!p || !el) return;
    setGor(g => {
      const k = Math.max(g.k, 0.9);
      return { k, x: el.clientWidth / 2 - (p.x + KUTU_EN / 2) * k, y: el.clientHeight / 2 - (p.y + KUTU_BOY / 2) * k };
    });
  }, [konum]);

  // ---- Çizgiler ----
  const merkez = (id: string) => { const p = konum.get(id)!; return { x: p.x + KUTU_EN / 2, y: p.y + KUTU_BOY / 2 }; };
  const esler = new Set(gorunen.baglar.filter(b => b.tur === 'eşi').map(b => [b.a, b.b].sort().join('|')));
  const ebeveynleri = new Map<string, string[]>();
  for (const b of gorunen.baglar) if (b.tur === 'ebeveyni') ebeveynleri.set(b.a, [...(ebeveynleri.get(b.a) || []), b.b]);
  const seciliBaglar = secili ? gorunen.baglar.filter(b => b.a === secili || b.b === secili) : [];
  const yakinlar = new Set(seciliBaglar.flatMap(b => [b.a, b.b]));
  const vurgu = (b: SoyBagi) => !!secili && (b.a === secili || b.b === secili);
  const soluk = (b: SoyBagi) => (secili && !vurgu(b) ? 0.15 : 0.9);

  const cocukYolu = (cocuk: string, ps: string[]) => {
    const c = konum.get(cocuk)!;
    const cx = c.x + KUTU_EN / 2;
    const iki = ps.length === 2 && esler.has([...ps].sort().join('|'));
    const a = merkez(ps[0]);
    const ax = iki ? (a.x + merkez(ps[1]).x) / 2 : a.x;
    const ay = iki ? a.y : konum.get(ps[0])!.y + KUTU_BOY;
    const orta = c.y - 34;
    return `M${ax},${ay} V${orta} H${cx} V${c.y}`;
  };

  /** Eş çizgisi: yan yana ise düz çift çizgi, ayrı ailelerdeyse yukarıdan kavis */
  const esYolu = (b: SoyBagi) => {
    const [sol, sag] = [konum.get(b.a)!, konum.get(b.b)!].sort((p, q) => p.x - q.x);
    if (Math.abs(sol.y - sag.y) < 1 && sag.x - sol.x < KUTU_EN + 160) {
      const y = sol.y + KUTU_BOY / 2;
      return { d: `M${sol.x + KUTU_EN},${y} H${sag.x}`, kavis: false };
    }
    // Ayrı satırlardaki aileler: üstteki kutunun altından alttakinin üstüne
    if (Math.abs(sol.y - sag.y) > KUTU_BOY) {
      const [ust, alt] = [sol, sag].sort((p, q) => p.y - q.y);
      const a = { x: ust.x + KUTU_EN / 2, y: ust.y + KUTU_BOY }, c = { x: alt.x + KUTU_EN / 2, y: alt.y };
      const orta = (a.y + c.y) / 2;
      return { d: `M${a.x},${a.y} C${a.x},${orta} ${c.x},${orta} ${c.x},${c.y}`, kavis: true };
    }
    const a = { x: sol.x + KUTU_EN / 2, y: sol.y }, c = { x: sag.x + KUTU_EN / 2, y: sag.y };
    const ust = Math.min(a.y, c.y) - 90 - Math.abs(a.x - c.x) * 0.06;
    return { d: `M${a.x},${a.y} C${a.x},${ust} ${c.x},${ust} ${c.x},${c.y}`, kavis: true };
  };

  const isimler = useMemo(() => gorunen.kisiler.map(k => k.ad).sort((a, b) => a.localeCompare(b, 'tr')), [gorunen]);
  const aramaYap = (metin: string) => {
    const k = metin.trim().toLocaleLowerCase('tr');
    if (!k) return;
    const bulunan = gorunen.kisiler.find(x => x.ad.toLocaleLowerCase('tr') === k) || gorunen.kisiler.find(x => x.ad.toLocaleLowerCase('tr').includes(k));
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

  return (
    <div className="space-y-3">
      {/* Süzgeçler */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={aileId ?? ''} onChange={e => { setAileId(e.target.value || null); setSecili(null); }} aria-label="Aile" className={GIRDI}>
          <option value="">Bütün aileler</option>
          {veri.aileler.map(a => <option key={a.id} value={a.id}>{a.ad}</option>)}
        </select>
        {YAN_GRUPLAR.map(g => (
          <button key={g.id} type="button" aria-pressed={yanGruplar.has(g.id)} className={CIP(yanGruplar.has(g.id))}
            onClick={() => setYanGruplar(s => { const y = new Set(s); if (y.has(g.id)) y.delete(g.id); else y.add(g.id); return y; })}>
            <span className={`w-2 h-2 rounded-full ${CIP_NOKTASI[g.id]}`} />{g.ad}
          </button>
        ))}
        <form className="relative ml-auto" onSubmit={e => { e.preventDefault(); aramaYap(arama); }}>
          <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${IKINCIL}`} />
          <input list="soy-isimler" value={arama} onChange={e => { setArama(e.target.value); if (isimler.includes(e.target.value)) aramaYap(e.target.value); }}
            placeholder="Kişi bul" aria-label="Kişi bul" className={`${GIRDI} pl-7 w-40`} />
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
        <div ref={kap} className={`${KART} relative overflow-hidden h-[calc(100dvh-16rem)] min-h-[420px] touch-none select-none cursor-grab active:cursor-grabbing`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onClick={() => { if (!surukledi.current) setSecili(null); }}>
          {gorunen.kisiler.length === 0 ? (
            <div className={`absolute inset-0 grid place-items-center text-[13px] ${IKINCIL} p-6 text-center`}>
              Bu süzgeçte bağı olan kişi yok.
            </div>
          ) : (
            <svg width="100%" height="100%" role="img" aria-label={`Soy ağacı: ${gorunen.kisiler.length} kişi`} className="block">
              <defs>
                <clipPath id="soy-portre"><circle cx={0} cy={0} r={PORTRE_R} /></clipPath>
              </defs>
              <g transform={`translate(${gor.x} ${gor.y}) scale(${gor.k})`}>
                {/* Aile çerçeveleri */}
                {bloklar.map(b => {
                  const renk = b.id === '~' ? '#8C7B63' : aileRengi.get(b.id) || '#0E1C4F';
                  return (
                    <g key={b.id}>
                      <rect x={b.x} y={b.y} width={b.en} height={b.boy} rx={22} fill={renk} fillOpacity={0.06} stroke={renk} strokeOpacity={0.35} strokeWidth={1.2} />
                      <rect x={b.x} y={b.y} width={b.en} height={34} rx={22} fill={renk} fillOpacity={0.9} />
                      <rect x={b.x} y={b.y + 20} width={b.en} height={14} fill={renk} fillOpacity={0.9} />
                      <text x={b.x + 18} y={b.y + 22} fontSize={14} fontWeight={700} fill="#fff" letterSpacing={0.4}>{b.ad.toLocaleUpperCase('tr')}</text>
                    </g>
                  );
                })}

                {/* Yan bağlar: iş, arkadaşlık, rekabet, tanıdık */}
                {gorunen.baglar.filter(b => yanlar.has(b.tur as YanBag)).map((b, _, liste) => {
                  const a = merkez(b.a), c = merkez(b.b);
                  const cift = [b.a, b.b].sort().join('|');
                  const sira = liste.filter(x => [x.a, x.b].sort().join('|') === cift).indexOf(b);
                  const mx = (a.x + c.x) / 2, my = Math.max(a.y, c.y) + 90 + Math.abs(a.x - c.x) * 0.05 + sira * 26;
                  return (
                    <path key={b.id} d={`M${a.x},${a.y} Q${mx},${my} ${c.x},${c.y}`} fill="none" className={YAN_RENGI[b.tur as YanBag]}
                      strokeWidth={vurgu(b) ? 3 : 1.8} strokeDasharray={b.tur === 'rakibi' ? '7 5' : b.tur === 'arkadaşı' ? '2 5' : b.tur === 'iş yeri' ? '8 4' : undefined}
                      opacity={soluk(b)} strokeLinecap="round">
                      <title>{`${kisi.get(b.a)?.ad} — ${kisi.get(b.b)?.ad} · ${BAG_ADI[b.tur]}${yilMetni(b) ? ` · ${yilMetni(b)}` : ''}`}</title>
                    </path>
                  );
                })}

                {/* Akraba ve ortak ebeveyni görünmeyen kardeşler: noktalı */}
                {gorunen.baglar.filter(b => b.tur === 'akrabası' || b.tur === 'kardeşi').map(b => {
                  const ortak = (ebeveynleri.get(b.a) || []).some(p => (ebeveynleri.get(b.b) || []).includes(p));
                  if (b.tur === 'kardeşi' && ortak) return null;
                  const a = konum.get(b.a)!, c = konum.get(b.b)!;
                  const ax = a.x + KUTU_EN / 2, cx = c.x + KUTU_EN / 2, ust = Math.min(a.y, c.y) - 16;
                  return <path key={b.id} d={`M${ax},${a.y} V${ust} H${cx} V${c.y}`} fill="none"
                    className="stroke-[#8C7B63] dark:stroke-[#A6B0C9]" strokeWidth={2} strokeDasharray="3 4" opacity={soluk(b)}>
                    <title>{`${kisi.get(b.a)?.ad} — ${kisi.get(b.b)?.ad} · ${BAG_ADI[b.tur]}`}</title>
                  </path>;
                })}

                {/* Ebeveyn → çocuk */}
                {[...ebeveynleri.entries()].map(([c, ps]) => {
                  const ilgili = !secili || secili === c || ps.includes(secili);
                  return <path key={`c-${c}`} d={cocukYolu(c, ps)} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]"
                    strokeWidth={secili && ilgili ? 2.8 : 1.8} opacity={ilgili ? 0.9 : 0.15} />;
                })}

                {/* Eşler: çift çizgi */}
                {gorunen.baglar.filter(b => b.tur === 'eşi').map(b => {
                  const { d, kavis } = esYolu(b);
                  return (
                    <g key={b.id} opacity={soluk(b)}>
                      <path d={d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={vurgu(b) ? 6.5 : 5.5} />
                      <path d={d} fill="none" className="stroke-[#FAF8F5] dark:stroke-[#0E1733]" strokeWidth={kavis ? 2.6 : 2.2} />
                      <title>{`${kisi.get(b.a)?.ad} — ${kisi.get(b.b)?.ad} · Eşi${yilMetni(b) ? ` · ${yilMetni(b)}` : ''}`}</title>
                    </g>
                  );
                })}

                {/* Kişiler */}
                {gorunen.kisiler.map(k => {
                  const p = konum.get(k.id);
                  if (!p) return null;
                  const sec = k.id === secili;
                  const silik = !!secili && !sec && !yakinlar.has(k.id);
                  const renk = k.aileId ? aileRengi.get(k.aileId) || '#8C7B63' : '#8C7B63';
                  const g = portre(k.id);
                  return (
                    <g key={k.id} transform={`translate(${p.x} ${p.y})`} opacity={silik ? 0.3 : 1} className="cursor-pointer"
                      onClick={e => { e.stopPropagation(); if (!surukledi.current) setSecili(k.id === secili ? null : k.id); }}
                      onDoubleClick={e => { e.stopPropagation(); onMaddeAc(k.id); }}>
                      <rect width={KUTU_EN} height={KUTU_BOY} rx={14} className={`fill-white dark:fill-[#13204A] ${sec ? 'stroke-[#F26B6F]' : 'stroke-[#CFC5B4] dark:stroke-[#2C3C72]'}`}
                        strokeWidth={sec ? 2.6 : 1.1} />
                      <rect x={0} y={12} width={5} height={KUTU_BOY - 24} rx={2.5} fill={renk} />
                      <g transform={`translate(${14 + PORTRE_R} ${KUTU_BOY / 2})`}>
                        <circle r={PORTRE_R + 2} fill={renk} fillOpacity={0.9} />
                        {g ? (
                          <image href={g} x={-PORTRE_R} y={-PORTRE_R} width={PORTRE_R * 2} height={PORTRE_R * 2} preserveAspectRatio="xMidYMin slice" clipPath="url(#soy-portre)" />
                        ) : (
                          <>
                            <circle r={PORTRE_R} className="fill-[#F3EFE8] dark:fill-[#2C3C72]" />
                            <text textAnchor="middle" dy={5} fontSize={15} fontWeight={700} fill={renk}>{basHarfler(k.ad)}</text>
                          </>
                        )}
                      </g>
                      <text x={14 + PORTRE_R * 2 + 12} y={k.rol ? 26 : 34} fontSize={13.5} fontWeight={700} className="fill-[#0E1C4F] dark:fill-[#F3EFE8]">
                        {kisalt(k.ad, 18)}
                      </text>
                      <text x={14 + PORTRE_R * 2 + 12} y={k.rol ? 43 : 52} fontSize={11} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]" fontFamily="ui-monospace, monospace">
                        {k.yasamMetni && !/^bilinmiyor$/i.test(k.yasamMetni) ? k.yasamMetni.replace(/-$/, '–') : '—'}
                      </text>
                      {k.rol && (
                        <text x={14 + PORTRE_R * 2 + 12} y={60} fontSize={10.5} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]">{kisalt(k.rol, 22)}</text>
                      )}
                      <title>{k.ad}</title>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Yakınlaştırma */}
          <div className="absolute left-3 bottom-3 flex flex-col gap-1" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => yakinlas(1.25)} aria-label="Yakınlaştır" className={`${GIRDI} !px-2`}><Plus className="w-4 h-4" /></button>
            <button type="button" onClick={() => yakinlas(0.8)} aria-label="Uzaklaştır" className={`${GIRDI} !px-2`}><Minus className="w-4 h-4" /></button>
            <button type="button" onClick={sigdir} aria-label="Ekrana sığdır" title="Ekrana sığdır" className={`${GIRDI} !px-2`}><Maximize2 className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Seçili kişi */}
        {seciliKisi && (() => {
          const k = seciliKisi;
          const aile = veri.aileler.find(a => a.id === k.aileId);
          const dogum = veri.aileler.find(a => a.id === k.dogumAileId);
          const g = portre(k.id);
          return (
            <div className={`${KART} absolute right-3 top-3 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto p-3 space-y-3 shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)]`}>
              <div className="flex items-start gap-3">
                {g ? <img src={g} alt="" className="w-16 h-16 rounded-full object-cover object-top border-2" style={{ borderColor: aile ? aileRengi.get(aile.id) : '#8C7B63' }} />
                  : <div className="w-16 h-16 rounded-full grid place-items-center bg-[#F3EFE8] dark:bg-[#2C3C72] text-[18px] font-bold">{basHarfler(k.ad)}</div>}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{k.ad}</div>
                  <div className={`text-[11px] ${IKINCIL}`}>{[aile?.ad, k.yasamMetni].filter(Boolean).join(' · ') || 'Kişi'}</div>
                  {dogum && dogum.id !== aile?.id && <div className={`text-[11px] ${IKINCIL}`}>Doğduğu aile: {dogum.ad}</div>}
                  {k.rol && <div className="text-[12px] mt-0.5">{k.rol}</div>}
                </div>
                <button type="button" onClick={() => setSecili(null)} aria-label="Kapat" className={`p-1 ${IKINCIL}`}><X className="w-4 h-4" /></button>
              </div>
              {seciliBaglar.length ? (
                <ul className="space-y-1 text-[12px]">
                  {seciliBaglar.map(b => {
                    const o = b.a === secili ? b.b : b.a;
                    const ad = b.tur === 'ebeveyni' ? (b.a === secili ? 'Ebeveyni' : 'Çocuğu')
                      : b.tur === 'patronu' ? (b.a === secili ? 'Patronu' : 'Yanında çalışan') : BAG_ADI[b.tur];
                    return (
                      <li key={b.id} className="flex items-baseline gap-1.5">
                        <span className={`text-[11px] ${IKINCIL} w-28 shrink-0`}>{ad}</span>
                        <button type="button" onClick={() => odakla(o)} className="text-left underline decoration-[#0E1C4F]/30 underline-offset-2 hover:decoration-[#F26B6F]">{kisi.get(o)?.ad}</button>
                        {yilMetni(b) && <span className={`text-[10.5px] font-mono ${IKINCIL}`}>{yilMetni(b)}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className={`text-[12px] ${IKINCIL}`}>Görünen bir kişi bağı yok; ailesiyle ağaçta.</p>}
              <button type="button" onClick={() => onMaddeAc(k.id)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-white cursor-pointer">Maddeyi aç</button>
            </div>
          );
        })()}
      </div>

      <p className={`text-[12px] ${IKINCIL} leading-relaxed`}>
        {gorunen.kisiler.length} kişi · {gorunen.baglar.length} bağ{gizli > 0 ? ` · bağı olmayan ${gizli} kişi gösterilmiyor` : ''}.
        Çift çizgi eş, dik çizgi ebeveyn → çocuk, noktalı çizgi akraba ya da kardeş; iş ve arkadaşlık üstteki düğmelerle açılır.
        Sürükle, tekerlekle ya da iki parmakla yakınlaş; kişiye dokun, çift dokununca maddesi açılır.
        Bağlar künyeden ("Aile", "Eşi", "Çalıştığı yer") ve düzenleyicideki bağlardan gelir.
      </p>
    </div>
  );
};

export default SoyAgaci;
