import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BoxSelect, Link2, LocateFixed, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import type { Item, ItemType } from '../../types';
import { BAG_TURLERI, type BagTuru } from '../../utils/relations';
import { kaynakTurleri, uygunTurler } from '../../lib/bagKurallari';
import { TYPE_LABELS, schemaKeyFor, getKunyeFields } from '../wiki/wikiSchema';
import { TUR_RENGI, TUR_NOKTASI } from './turRenkleri';
import {
  ACILIS_OBEKLERI, BAG_OBEKLERI, agKur, bagEkle, ciftleriKur, kenarAdi, komsuAdimlari, kumeliDiz, mahalleKumeleri, odakDiz,
  type AgCifti, type BagObegi, type Konum
} from '../../lib/bagAgi';

/**
 * Görünümler → Bağ ağı. Maddeler nokta, bağlar çizgi; aynı iki madde arasında
 * tek çizgi. 20 Kasım (Kemal: "çok karışık"): açılışta maddeler mahalle
 * kümelerinde, yalnız aile, sahiplik ve bulunduğu yer bağları görünür; öbür
 * bağ öbekleri düğmeyle açılır. Bir maddeye basınca odak: yalnız o ve
 * komşuları (1 ya da 2 adım). Noktalar sürüklenebilir ama yerleşim kayda
 * yazılmaz; eski kayıtlı yerleşim (`bagAgiYerlesim`) okunmaz.
 * Ağdan bağ kurulur: seçili madde → "Bağ kur" → başka maddeye bas → tür → "Bağla"
 * (bağ ilk maddeye yazılır). Başka hiçbir şey kayda yazılmaz.
 */

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onMaddeAc: (id: string) => void;
}

/** Süzgeç çipleri: kişi ve karakter tek çip */
const CIP_TURLERI: ItemType[] = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'aile', 'olay', 'ürün', 'oda'];
const turAnahtari = (t: ItemType): ItemType => (t === 'karakter' ? 'kisi' : t);

/** Bağ öbeği → çizgi biçimi */
const CIZGI: Record<BagObegi, string> = {
  aile: '', sahiplik: '9 3', yer: '', is: '6 4', tanidik: '2 4', olay: '6 4', genel: '1 3'
};

const CIP = (secili: boolean) => `inline-flex items-center gap-1.5 min-h-8 px-2.5 py-0.5 rounded-full text-[11px] border cursor-pointer ${secili
  ? 'border-[#0E1C4F] dark:border-[#A6B0C9] text-[#0E1C4F] dark:text-[#F3EFE8] bg-white dark:bg-[#13204A]'
  : 'border-[#CFC5B4]/70 dark:border-[#2C3C72] text-[#6A5E4C]/70 dark:text-[#A6B0C9]/60 line-through decoration-1'}`;
const DUGME = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] disabled:opacity-40';
const DOLU = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer bg-[#0E1C4F] dark:bg-[#2C3C72] text-white disabled:opacity-40';
const KART = 'absolute left-2 right-2 bottom-14 max-h-[45%] sm:left-3 sm:right-auto sm:bottom-auto sm:top-3 sm:w-[20rem] sm:max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl bg-[#FAF8F5]/97 dark:bg-[#13204A]/97 border border-[#CFC5B4] dark:border-[#2C3C72] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] p-3 space-y-2.5';

export const BagAgi: React.FC<Props> = ({ items, onUpdateItem, onMaddeAc }) => {
  const ag = useMemo(() => agKur(items, i => schemaKeyFor(i.type),
    (i, id) => getKunyeFields(i).find(f => f.id === id)?.value || ''), [items]);
  const turBul = useMemo(() => { const m = new Map(ag.dugumler.map(d => [d.id, d.tur])); return (id: string) => m.get(id); }, [ag]);
  const ciftler = useMemo(() => ciftleriKur(ag.kenarlar, turBul), [ag, turBul]);
  const kume = useMemo(() => mahalleKumeleri(items, ag.dugumler), [items, ag]);

  const [turler, setTurler] = useState<Set<ItemType>>(() => new Set(CIP_TURLERI.filter(t => t !== 'oda')));
  const [obekler, setObekler] = useState<Set<BagObegi>>(() => new Set(ACILIS_OBEKLERI));
  const [secili, setSecili] = useState<string | null>(null);
  const [derinlik, setDerinlik] = useState<1 | 2>(1);
  const [ara, setAra] = useState('');
  const [aramaAcik, setAramaAcik] = useState(false);
  // Bağ kurma: seçili maddeden başka bir maddeye
  const [bagModu, setBagModu] = useState(false);
  const [hedef, setHedef] = useState<string | null>(null);
  const [yeniTur, setYeniTur] = useState<BagTuru>('genel bağlantı');
  const [yaziliyor, setYaziliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');
  // Toplu seçim (8 Ekim): kutu çizerek ya da tek tek basarak seçilir; hepsi tek hedefe bağlanır
  const [topluKip, setTopluKip] = useState(false);
  const [coklu, setCoklu] = useState<Set<string>>(() => new Set());
  const [kutu, setKutu] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [topluHedef, setTopluHedef] = useState('');
  const [topluTur, setTopluTur] = useState<BagTuru>('bulunduğu yer');
  // Elle oynatılan noktalar (yalnız bu açılışta; kayda yazılmaz)
  const [elle, setElle] = useState<Map<string, Konum>>(() => new Map());

  // Ekranın eni / boyu: kümeler ekrana göre satırlanır (telefonda dik, masaüstünde yatık)
  const svgRef = useRef<SVGSVGElement>(null);
  const [oran, setOran] = useState(1.75);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Çeyrek adımla yuvarlanır: pencere biraz değişince yerleşim oynamasın
    const bak = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setOran(Math.min(2.5, Math.max(0.5, Math.round((r.width / r.height) * 4) / 4))); };
    bak();
    const g = new ResizeObserver(bak);
    g.observe(el);
    return () => g.disconnect();
  }, []);

  const gorunenDugumler = useMemo(() => ag.dugumler.filter(d => turler.has(turAnahtari(d.tur))), [ag, turler]);
  const gorunenIdler = useMemo(() => new Set(gorunenDugumler.map(d => d.id)), [gorunenDugumler]);
  const acikCiftler = useMemo(() => ciftler.filter(c => c.obekler.some(o => obekler.has(o)) && gorunenIdler.has(c.a) && gorunenIdler.has(c.b)), [ciftler, obekler, gorunenIdler]);

  // Kümeli yerleşim (her açılışta aynı); küme içi çekim yalnız açık bağlarla değil bütün bağlarla
  const kumeli = useMemo(() => kumeliDiz(gorunenDugumler, ciftler, kume.kumeler, kume.kumesi, oran), [gorunenDugumler, ciftler, kume, oran]);

  // Odak: seçili madde ve komşuları
  const adimlar = useMemo(() => (secili && gorunenIdler.has(secili) ? komsuAdimlari(secili, acikCiftler, derinlik) : null), [secili, acikCiftler, derinlik, gorunenIdler]);
  const adi = (id: string) => ag.dugumler.find(d => d.id === id)?.ad || '';
  const odakKonum = useMemo(() => (secili && adimlar ? odakDiz(secili, adimlar, acikCiftler, adi) : null),
    [secili, adimlar, acikCiftler]); // eslint-disable-line react-hooks/exhaustive-deps
  const odakta = !!odakKonum;
  // Odak değişince elle oynatılanlar sıfırlanır (odak yerleşimi her seferinde yeniden kurulur)
  const odakAnahtari = odakta ? `${secili}:${derinlik}` : 'kume';
  useEffect(() => { setElle(new Map()); }, [odakAnahtari]);

  const temelKonum = odakKonum || kumeli.konumlar;
  const konumlar = useMemo(() => {
    if (!elle.size) return temelKonum;
    const m = new Map(temelKonum);
    for (const [id, k] of elle) if (m.has(id)) m.set(id, k);
    return m;
  }, [temelKonum, elle]);

  const ekrandakiDugumler = useMemo(() => (adimlar ? gorunenDugumler.filter(d => adimlar.has(d.id)) : gorunenDugumler), [gorunenDugumler, adimlar]);
  const ekrandakiCiftler = useMemo(() => (adimlar ? acikCiftler.filter(c => adimlar.has(c.a) && adimlar.has(c.b)) : acikCiftler), [acikCiftler, adimlar]);
  const baglantiSayisi = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of acikCiftler) { m.set(c.a, (m.get(c.a) || 0) + 1); m.set(c.b, (m.get(c.b) || 0) + 1); }
    return m;
  }, [acikCiftler]);
  // Kümenin çemberi: üyelerinin o anki yerlerini sarar (nokta sürüklenince çember de genişler)
  const kumeCemberleri = useMemo(() => {
    if (odakta) return [];
    return kumeli.yerler.map(y => {
      const uyeler = ekrandakiDugumler.filter(d => kume.kumesi.get(d.id) === y.id);
      const r = Math.max(y.r, ...uyeler.map(d => { const k = konumlar.get(d.id); return k ? Math.hypot(k.x - y.x, k.y - y.y) + 40 : 0; }));
      return { ...y, r, ad: kume.kumeler.find(k => k.id === y.id)?.ad || '', sayi: uyeler.length };
    }).filter(y => y.sayi);
  }, [odakta, kumeli, ekrandakiDugumler, kume, konumlar]);

  // Bağ türü madde türüne özel (8 Ekim, `lib/bagKurallari.ts`): listede yalnız uyan türler
  const turu = (id: string | null) => (id ? items.find(i => i.id === id)?.type : undefined);
  const tekTurler = useMemo<BagTuru[]>(() => {
    const k = turu(secili), h = turu(hedef);
    return k ? (h ? uygunTurler(k, h) : kaynakTurleri(k)) : [];
  }, [secili, hedef, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const etkinTur: BagTuru = tekTurler.includes(yeniTur) ? yeniTur : (tekTurler[0] ?? 'genel bağlantı');
  const topluTurler = useMemo<BagTuru[]>(() => {
    const h = turu(topluHedef);
    const kaynaklar = [...coklu].map(turu).filter(Boolean) as Item['type'][];
    if (!kaynaklar.length) return [];
    return BAG_TURLERI.map(b => b.id).filter(t => kaynaklar.every(k => (h ? uygunTurler(k, h) : kaynakTurleri(k)).includes(t)));
  }, [coklu, topluHedef, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const etkinTopluTur: BagTuru = topluTurler.includes(topluTur) ? topluTur : (topluTurler[0] ?? 'genel bağlantı');
  const seciliCiftler = useMemo(() => (secili ? ciftler.filter(c => c.a === secili || c.b === secili) : []), [secili, ciftler]);
  // Odakta görünmeyen bağlar: kapalı öbekte ya da gizli türdeki maddeye
  const gizliBag = useMemo(() => seciliCiftler.filter(c => !acikCiftler.includes(c)).length, [seciliCiftler, acikCiftler]);

  // ---- Bakış: kaydırma ve yakınlaştırma (yalnız ekranda)
  const [bakis, setBakis] = useState({ x: 0, y: 0, olcek: 1 });
  // Kümeli görünümde kümelerin çemberleri (adlarıyla) sığar, odakta noktalar
  const tumu = (): Konum[] => (odakta || !kumeCemberleri.length
    ? ekrandakiDugumler.map(d => konumlar.get(d.id)).filter(Boolean) as Konum[]
    : kumeCemberleri.flatMap(k => [{ x: k.x - k.r, y: k.y - k.r - 30 }, { x: k.x + k.r, y: k.y + k.r }]));
  const sigdir = (ks: Konum[] = tumu(), kartPayi = !!secili || topluKip || coklu.size > 0) => {
    const el = svgRef.current;
    if (!el || !ks.length) return;
    const minX = Math.min(...ks.map(k => k.x)) - 70, maxX = Math.max(...ks.map(k => k.x)) + 70;
    const minY = Math.min(...ks.map(k => k.y)) - 50, maxY = Math.max(...ks.map(k => k.y)) + 60;
    const { width, height } = el.getBoundingClientRect();
    // Kart açıkken ağ kartın dışındaki boşluğa sığar: telefonda kart altta, masaüstünde solda
    const telefon = width < 640;
    const sol = kartPayi && !telefon ? 340 : 0;
    const en = width - sol, yuk = kartPayi && telefon ? height * 0.52 : height;
    const olcek = Math.min(1.6, en / (maxX - minX), yuk / (maxY - minY));
    setBakis({ olcek, x: sol + en / 2 - ((minX + maxX) / 2) * olcek, y: yuk / 2 - ((minY + maxY) / 2) * olcek });
  };
  // Açılışta, odağa girip çıkınca ve ekran biçimi değişince ağ ekrana sığar
  const sigAnahtari = `${odakAnahtari}:${oran}:${gorunenDugumler.length}`;
  useEffect(() => { sigdir(); }, [sigAnahtari]); // eslint-disable-line react-hooks/exhaustive-deps
  const yakinlas = (oran: number, cx?: number, cy?: number) => setBakis(b => {
    const el = svgRef.current?.getBoundingClientRect();
    const px = cx ?? (el ? el.width / 2 : 0), py = cy ?? (el ? el.height / 2 : 0);
    const olcek = Math.max(0.15, Math.min(4, b.olcek * oran));
    const o = olcek / b.olcek;
    return { olcek, x: px - (px - b.x) * o, y: py - (py - b.y) * o };
  });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      yakinlas(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, []);
  // Telefonda iki parmakla yakınlaştırma
  const parmaklar = useRef(new Map<number, { x: number; y: number }>());
  const tutam = useRef<number | null>(null);

  // ---- Sürükleme: noktaya basılıysa nokta, boşluğa basılıysa bakış kayar
  const surukle = useRef<{ tur: 'dugum' | 'bakis' | 'kutu'; id?: string; sx: number; sy: number; ox: number; oy: number; oynadi: boolean; grup?: Map<string, Konum>; toplu?: boolean } | null>(null);
  const agNoktasi = (cx: number, cy: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: (cx - (r?.left ?? 0) - bakis.x) / bakis.olcek, y: (cy - (r?.top ?? 0) - bakis.y) / bakis.olcek };
  };
  const basla = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation();
    parmaklar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (parmaklar.current.size === 2) {
      const [p, q] = [...parmaklar.current.values()];
      tutam.current = Math.hypot(p.x - q.x, p.y - q.y);
      surukle.current = null;
      return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const k = id ? konumlar.get(id) : null;
    const toplu = topluKip || e.shiftKey;
    if (id && k) {
      const grup = coklu.has(id) && coklu.size > 1
        ? new Map([...coklu].map(c => [c, konumlar.get(c)!] as const).filter(([, q]) => q)) : undefined;
      surukle.current = { tur: 'dugum', id, sx: e.clientX, sy: e.clientY, ox: k.x, oy: k.y, oynadi: false, grup, toplu };
    } else if (toplu) {
      const q = agNoktasi(e.clientX, e.clientY);
      surukle.current = { tur: 'kutu', sx: e.clientX, sy: e.clientY, ox: q.x, oy: q.y, oynadi: false, toplu };
    } else surukle.current = { tur: 'bakis', sx: e.clientX, sy: e.clientY, ox: bakis.x, oy: bakis.y, oynadi: false };
  };
  const hareket = (e: React.PointerEvent) => {
    if (parmaklar.current.has(e.pointerId)) parmaklar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (parmaklar.current.size === 2 && tutam.current) {
      const [p, q] = [...parmaklar.current.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const r = svgRef.current?.getBoundingClientRect();
      yakinlas(d / tutam.current, (p.x + q.x) / 2 - (r?.left ?? 0), (p.y + q.y) / 2 - (r?.top ?? 0));
      tutam.current = d;
      return;
    }
    const s = surukle.current;
    if (!s) return;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) s.oynadi = true;
    if (!s.oynadi) return;
    if (s.tur === 'dugum' && s.id) {
      const id = s.id;
      if (s.grup) {
        const g = s.grup;
        setElle(m => { const y = new Map(m); for (const [c, q] of g) y.set(c, { x: q.x + dx / bakis.olcek, y: q.y + dy / bakis.olcek }); return y; });
      } else setElle(m => new Map(m).set(id, { x: s.ox + dx / bakis.olcek, y: s.oy + dy / bakis.olcek }));
    } else if (s.tur === 'kutu') {
      const q = agNoktasi(e.clientX, e.clientY);
      setKutu({ x0: s.ox, y0: s.oy, x1: q.x, y1: q.y });
    } else setBakis(b => ({ ...b, x: s.ox + dx, y: s.oy + dy }));
  };
  const birak = (e: React.PointerEvent) => {
    parmaklar.current.delete(e.pointerId);
    if (parmaklar.current.size < 2) tutam.current = null;
    const s = surukle.current;
    surukle.current = null;
    if (s?.tur === 'kutu') {
      const k = kutu;
      setKutu(null);
      if (k && s.oynadi) {
        const [x0, x1] = [Math.min(k.x0, k.x1), Math.max(k.x0, k.x1)], [y0, y1] = [Math.min(k.y0, k.y1), Math.max(k.y0, k.y1)];
        setCoklu(c => { const y = new Set(c); for (const d of ekrandakiDugumler) { const q = konumlar.get(d.id); if (q && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) y.add(d.id); } return y; });
      }
      return;
    }
    if (!s || s.oynadi) return;
    if (s.tur === 'dugum' && s.id && s.toplu) {
      const id = s.id;
      setCoklu(c => { const y = new Set(c); if (y.has(id)) y.delete(id); else y.add(id); return y; });
      setMesaj('');
      return;
    }
    if (s.tur === 'dugum' && s.id) dugumeBas(s.id);
  };
  const birakIptal = (e: React.PointerEvent) => {
    parmaklar.current.delete(e.pointerId);
    if (parmaklar.current.size < 2) tutam.current = null;
    surukle.current = null;
  };
  const odakla = (id: string) => {
    setMesaj(''); setTopluKip(false); setCoklu(new Set()); setTopluHedef('');
    // Gizli türdeki maddeyi aramayla seçince türü açılır
    const t = turBul(id);
    if (t && !turler.has(turAnahtari(t))) setTurler(s => new Set(s).add(turAnahtari(t)));
    setSecili(id); setBagModu(false); setHedef(null);
  };
  const dugumeBas = (id: string) => {
    setMesaj('');
    if (bagModu && secili && id !== secili) { setHedef(id); return; }
    if (id === secili) return;
    odakla(id);
  };
  const odaktanCik = () => { setSecili(null); setBagModu(false); setHedef(null); setDerinlik(1); setMesaj(''); };

  // ---- Kayıt (yalnız düğmeyle)
  const bagla = async () => {
    if (!secili || !hedef) return;
    const kaynak = items.find(i => i.id === secili);
    if (!kaynak) return;
    const yeni = bagEkle(kaynak, hedef, etkinTur);
    if (!yeni) { setMesaj('Bu bağ zaten var.'); return; }
    setYaziliyor(true); setMesaj('');
    try { await onUpdateItem(yeni); setBagModu(false); setHedef(null); setMesaj('Bağ kuruldu.'); }
    catch { setMesaj('Bağ kaydedilemedi; yeniden dene.'); }
    finally { setYaziliyor(false); }
  };
  // Toplu bağ: seçilen her maddeye "hedef" bağı yazılır (bağ her maddenin kendi kaydında)
  const topluBagla = async () => {
    if (!topluHedef) return;
    setYaziliyor(true); setMesaj('');
    let kuruldu = 0, vardi = 0, hata = 0;
    for (const id of coklu) {
      if (id === topluHedef) continue;
      const kaynak = items.find(i => i.id === id);
      const yeni = kaynak ? bagEkle(kaynak, topluHedef, etkinTopluTur) : null;
      if (!yeni) { vardi++; continue; }
      try { await onUpdateItem(yeni); kuruldu++; } catch { hata++; }
    }
    setYaziliyor(false);
    setMesaj(`${kuruldu} bağ kuruldu${vardi ? ` · ${vardi} zaten vardı` : ''}${hata ? ` · ${hata} kaydedilemedi, yeniden dene` : ''}.`);
    if (!hata) setCoklu(new Set());
  };

  // Arama: uyan maddeler listelenir, birine basınca odak
  const bulunanlar = useMemo(() => {
    const k = ara.trim().toLocaleLowerCase('tr');
    if (!k) return [];
    return ag.dugumler.filter(x => x.ad.toLocaleLowerCase('tr').includes(k))
      .sort((a, b) => Number(!a.ad.toLocaleLowerCase('tr').startsWith(k)) - Number(!b.ad.toLocaleLowerCase('tr').startsWith(k)) || a.ad.localeCompare(b.ad, 'tr'))
      .slice(0, 8);
  }, [ara, ag]);
  const aramadanSec = (id: string) => { odakla(id); setAra(''); setAramaAcik(false); };

  const kenarCizgisi = (c: AgCifti) => c.obekler.find(o => obekler.has(o)) || c.obekler[0];
  const kenarAdlari = (c: AgCifti) => [...new Set(c.kenarlar.map(e => kenarAdi(e) + (e.oneri ? ' (öneri)' : '')))].join(', ');
  const seciliMadde = secili ? ag.dugumler.find(d => d.id === secili) : null;
  // Uzaktan bakınca yalnız mahalle ve seçili maddenin adı yazılır; yaklaştıkça hepsi
  const adlarGorunur = odakta || bakis.olcek >= 0.5;

  return (
    <div className="space-y-2.5">
      {/* Arama ve bağ öbekleri */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative w-full sm:w-64 sm:order-last sm:ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6A5E4C] dark:text-[#A6B0C9]" aria-hidden="true" />
          <input value={ara} onChange={e => { setAra(e.target.value); setAramaAcik(true); }} onFocus={() => setAramaAcik(true)}
            onBlur={() => setTimeout(() => setAramaAcik(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter' && bulunanlar[0]) aramadanSec(bulunanlar[0].id); if (e.key === 'Escape') setAra(''); }}
            placeholder="Madde ara, odakla…" aria-label="Madde ara ve odakla"
            className="w-full text-[13px] bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg pl-8 pr-2.5 py-2 focus:outline-hidden focus:border-[#F26B6F]" />
          {aramaAcik && ara.trim() && (
            <ul className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] py-1">
              {bulunanlar.length ? bulunanlar.map(d => (
                <li key={d.id}>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => aramadanSec(d.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#F3EFE8] dark:hover:bg-[#0E1733]">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TUR_NOKTASI[turAnahtari(d.tur)]}`} />
                    <span className="flex-1 min-w-0 truncate">{d.ad}</span>
                    <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{TYPE_LABELS[d.tur] || d.tur}</span>
                  </button>
                </li>
              )) : <li className="px-3 py-2 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">Uyan madde yok.</li>}
            </ul>
          )}
        </div>
        <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] mr-0.5">Bağlar:</span>
        {BAG_OBEKLERI.filter(o => ciftler.some(c => c.obekler.includes(o.id))).map(o => (
          <button key={o.id} type="button" aria-pressed={obekler.has(o.id)} className={CIP(obekler.has(o.id))}
            onClick={() => setObekler(s => { const y = new Set(s); if (y.has(o.id)) y.delete(o.id); else y.add(o.id); return y; })}>
            <svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" className="stroke-current" strokeWidth="1.6" strokeDasharray={CIZGI[o.id]} /></svg>
            {o.ad}
          </button>
        ))}
      </div>
      <details className="group">
        <summary className="cursor-pointer select-none text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] w-fit">Madde türleri ({turler.size} açık)</summary>
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
          {CIP_TURLERI.filter(t => ag.dugumler.some(d => turAnahtari(d.tur) === t)).map(t => (
            <button key={t} type="button" aria-pressed={turler.has(t)} className={CIP(turler.has(t))}
              onClick={() => setTurler(s => { const y = new Set(s); if (y.has(t)) y.delete(t); else y.add(t); return y; })}>
              <span className={`w-2.5 h-2.5 rounded-full ${TUR_NOKTASI[t]}`} />{TYPE_LABELS[t] || t}
            </button>
          ))}
        </div>
      </details>

      <div className="relative rounded-2xl overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]">
        <svg ref={svgRef} role="img" aria-label={`Bağ ağı: ${ekrandakiDugumler.length} madde, ${ekrandakiCiftler.length} çizgi`}
          className={`block w-full h-[calc(100dvh-17rem)] min-h-[440px] touch-none select-none ${bagModu || topluKip ? 'cursor-crosshair' : 'cursor-grab'}`}
          onPointerDown={e => basla(e)} onPointerMove={hareket} onPointerUp={birak} onPointerCancel={birakIptal}>
          <g transform={`translate(${bakis.x} ${bakis.y}) scale(${bakis.olcek})`}>
            {/* Mahalle kümeleri: hafif zemin ve ad */}
            {kumeCemberleri.map(k => (
              <g key={k.id}>
                <circle cx={k.x} cy={k.y} r={k.r} className="fill-[#F3EFE8] dark:fill-[#13204A] stroke-[#CFC5B4] dark:stroke-[#2C3C72]" strokeWidth={1.2 / bakis.olcek} />
                <text x={k.x} y={k.y - k.r - 10 / Math.sqrt(bakis.olcek)} textAnchor="middle" fontSize={15 / Math.sqrt(bakis.olcek)}
                  className="fill-[#0E1C4F] dark:fill-[#F3EFE8] font-semibold cursor-pointer"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => sigdir(ekrandakiDugumler.filter(d => kume.kumesi.get(d.id) === k.id).map(d => konumlar.get(d.id)).filter(Boolean) as Konum[])}>
                  {k.ad} <tspan className="fill-[#6A5E4C] dark:fill-[#A6B0C9] font-normal">· {k.sayi}</tspan>
                  <title>{`${k.ad}: ${k.sayi} madde. Basınca bu kümeye yaklaşır.`}</title>
                </text>
              </g>
            ))}
            {odakta && derinlik === 2 && odakKonum && (() => {
              const r1 = Math.max(...[...(adimlar || [])].filter(([, d]) => d === 1).map(([id]) => { const k = odakKonum.get(id); return k ? Math.hypot(k.x, k.y) : 0; }), 0);
              return r1 ? <circle r={r1} className="fill-none stroke-[#CFC5B4] dark:stroke-[#2C3C72]" strokeWidth={1 / bakis.olcek} strokeDasharray="4 6" /> : null;
            })()}
            {ekrandakiCiftler.map(c => {
              const a = konumlar.get(c.a), b = konumlar.get(c.b);
              if (!a || !b) return null;
              const o = kenarCizgisi(c);
              const vurgu = !!secili && (c.a === secili || c.b === secili);
              const oneri = c.kenarlar.every(e => e.oneri);
              const opak = vurgu ? 0.85 : o === 'yer' ? 0.2 : 0.45;
              return (
                <line key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  className={vurgu ? 'stroke-[#F26B6F]' : 'stroke-[#6A5E4C] dark:stroke-[#A6B0C9]'}
                  strokeOpacity={opak} strokeWidth={(vurgu ? 1.8 : o === 'yer' ? 0.9 : 1.3) / Math.sqrt(bakis.olcek)}
                  strokeDasharray={oneri ? '3 3' : CIZGI[o]}>
                  <title>{`${adi(c.a)} — ${adi(c.b)} · ${kenarAdlari(c)}`}</title>
                </line>
              );
            })}
            {secili && hedef && (() => {
              const a = konumlar.get(secili), b = konumlar.get(hedef);
              return a && b ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-[#F26B6F]" strokeWidth={2.2 / Math.sqrt(bakis.olcek)} strokeDasharray="5 4" /> : null;
            })()}
            {ekrandakiDugumler.map(d => {
              const p = konumlar.get(d.id);
              if (!p) return null;
              const mahalle = d.tur === 'yer';
              const r = (mahalle ? 9 : 5) + Math.min(8, Math.sqrt(baglantiSayisi.get(d.id) || 0) * 1.8);
              const isaretli = d.id === secili || d.id === hedef || coklu.has(d.id) || d.id === topluHedef;
              const uzak = adimlar?.get(d.id) === 2;
              // Kümenin ortasındaki mahallenin adı kümenin başlığında zaten yazılı
              const kumeOrtasi = !odakta && mahalle && kume.kumesi.get(d.id) === d.id;
              const adYaz = (adlarGorunur && !kumeOrtasi) || isaretli || (odakta && mahalle);
              return (
                <g key={d.id} transform={`translate(${p.x} ${p.y})`} opacity={uzak ? 0.75 : 1}
                  onPointerDown={e => basla(e, d.id)} className="cursor-pointer">
                  {isaretli && <circle r={r + 5} className={`stroke-[#F26B6F] ${coklu.has(d.id) ? 'fill-[#F26B6F]/15' : 'fill-none'}`} strokeWidth={2} strokeDasharray={d.id === topluHedef ? '3 2' : undefined} />}
                  <circle r={r} className={`${TUR_RENGI[d.tur] || 'fill-[#6A5E4C]'} stroke-[#FAF8F5] dark:stroke-[#0E1733]`} strokeWidth={1.5} />
                  {/* Dokunma payı: telefonda küçük noktaya da basılsın */}
                  <circle r={Math.max(r, 16 / bakis.olcek)} className="fill-transparent" />
                  {adYaz && (
                    <text y={r + 12 / Math.sqrt(bakis.olcek)} textAnchor="middle" fontSize={(d.id === secili ? 13 : 11) / Math.sqrt(bakis.olcek)}
                      className={`fill-[#0E1C4F] dark:fill-[#F3EFE8] stroke-[#FAF8F5] dark:stroke-[#0E1733] ${isaretli || mahalle ? 'font-bold' : ''}`}
                      style={{ paintOrder: 'stroke', strokeWidth: 3, strokeLinejoin: 'round' }}>
                      {d.ad}
                    </text>
                  )}
                  <title>{`${d.ad} · ${TYPE_LABELS[d.tur] || d.tur} · ${baglantiSayisi.get(d.id) || 0} bağ`}</title>
                </g>
              );
            })}
            {kutu && (
              <rect x={Math.min(kutu.x0, kutu.x1)} y={Math.min(kutu.y0, kutu.y1)} width={Math.abs(kutu.x1 - kutu.x0)} height={Math.abs(kutu.y1 - kutu.y0)}
                className="fill-[#F26B6F]/10 stroke-[#F26B6F]" strokeWidth={1.2 / bakis.olcek} strokeDasharray={`${4 / bakis.olcek} ${3 / bakis.olcek}`} />
            )}
          </g>
        </svg>

        {/* Bakış düğmeleri */}
        <div className="absolute right-2 top-2 sm:right-3 sm:top-3 flex flex-col gap-1">
          <button type="button" onClick={() => yakinlas(1.25)} aria-label="Yakınlaştır" className={DUGME}><Plus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => yakinlas(0.8)} aria-label="Uzaklaştır" className={DUGME}><Minus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => sigdir()} aria-label="Ağı sığdır" title="Ağı sığdır" className={DUGME}><LocateFixed className="w-3.5 h-3.5" /></button>
          {!odakta && (
            <button type="button" onClick={() => { setTopluKip(t => !t); setMesaj(''); }} aria-pressed={topluKip}
              title="Toplu seç: kutu çiz ya da maddelere tek tek bas (Shift ile de olur)" aria-label="Toplu seç"
              className={topluKip ? DOLU : DUGME}><BoxSelect className="w-3.5 h-3.5" /></button>
          )}
        </div>

        {/* Alt şerit: sayı, sıfırlama */}
        <div className="absolute left-2 bottom-2 right-2 sm:left-3 sm:bottom-3 sm:right-3 flex flex-wrap items-center gap-2 pointer-events-none">
          <span className="pointer-events-auto text-[11px] font-mono px-2 py-1 rounded-md bg-[#FAF8F5]/90 dark:bg-[#13204A]/90 text-[#6A5E4C] dark:text-[#A6B0C9]">
            {odakta ? 'Odak · ' : `${kumeCemberleri.length} küme · `}{ekrandakiDugumler.length} madde · {ekrandakiCiftler.length} çizgi
          </span>
          <span className="flex-1" />
          {elle.size > 0 && (
            <button type="button" onClick={() => { setElle(new Map()); setTimeout(() => sigdir(), 0); }} className={`${DUGME} pointer-events-auto`} title="Sürüklenen noktalar yerine döner (kayda bir şey yazılmaz)">
              <RotateCcw className="w-3.5 h-3.5" /> Düzeni sıfırla
            </button>
          )}
        </div>

        {/* Toplu seçim kartı */}
        {(topluKip || coklu.size > 0) && !seciliMadde && (
          <div className={KART}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold leading-snug">{coklu.size ? `${coklu.size} madde seçili` : 'Toplu seç'}</div>
                <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Boşlukta kutu çiz ya da maddelere tek tek bas. Seçili grubu sürükleyince hepsi birlikte kayar.</div>
              </div>
              <button type="button" onClick={() => { setTopluKip(false); setCoklu(new Set()); setTopluHedef(''); }} aria-label="Toplu seçimi kapat" className="p-1 text-[#6A5E4C] dark:text-[#A6B0C9]"><X className="w-4 h-4" /></button>
            </div>
            {coklu.size > 0 && (
              <>
                <div className="flex flex-wrap gap-1">
                  {[...coklu].map(id => (
                    <button key={id} type="button" onClick={() => setCoklu(c => { const y = new Set(c); y.delete(id); return y; })} title="Seçimden çıkar"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]">
                      {adi(id)}<X className="w-3 h-3 opacity-60" />
                    </button>
                  ))}
                </div>
                <div className="space-y-2 rounded-lg border border-dashed border-[#F26B6F]/60 p-2">
                  <p className="text-[12px]">Hepsini şuna bağla:</p>
                  <select value={topluHedef} onChange={e => setTopluHedef(e.target.value)} aria-label="Hepsinin bağlanacağı madde"
                    className="w-full text-[12px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1.5">
                    <option value="">Madde seç…</option>
                    {[...ag.dugumler].filter(d => !coklu.has(d.id))
                      .sort((a, b) => Number(b.tur === 'yer') - Number(a.tur === 'yer') || a.ad.localeCompare(b.ad, 'tr'))
                      .map(d => <option key={d.id} value={d.id}>{d.ad}{d.tur === 'yer' ? ' (mahalle)' : ''}</option>)}
                  </select>
                  <select value={etkinTopluTur} onChange={e => setTopluTur(e.target.value as BagTuru)} aria-label="Bağ türü"
                    className="w-full text-[12px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1.5">
                    {BAG_TURLERI.filter(b => topluTurler.includes(b.id)).map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}
                  </select>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => void topluBagla()} disabled={!topluHedef || yaziliyor} className={DOLU}>{yaziliyor ? 'Yazılıyor…' : `${coklu.size} maddeyi bağla`}</button>
                    <button type="button" onClick={() => setCoklu(new Set())} className={DUGME}>Seçimi temizle</button>
                  </div>
                  <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bağ her maddenin kendi kaydına yazılır; düzenleyicide de görünür. Listede yalnız seçilen bütün maddelere uyan bağ türleri çıkar.</p>
                </div>
              </>
            )}
            {mesaj && <p className="text-[12px] text-[#F26B6F]" role="status">{mesaj}</p>}
          </div>
        )}
        {/* Odak kartı */}
        {seciliMadde && (
          <div className={KART}>
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${TUR_NOKTASI[turAnahtari(seciliMadde.tur)]}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold leading-snug">{seciliMadde.ad}</div>
                <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{TYPE_LABELS[seciliMadde.tur] || seciliMadde.tur} · {seciliCiftler.length} madde ile bağlı</div>
              </div>
              <button type="button" onClick={odaktanCik} aria-label="Odaktan çık" title="Odaktan çık" className="p-1 text-[#6A5E4C] dark:text-[#A6B0C9]"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] overflow-hidden" role="group" aria-label="Kaç adım komşu">
                {([1, 2] as const).map(n => (
                  <button key={n} type="button" aria-pressed={derinlik === n} onClick={() => setDerinlik(n)}
                    className={`px-3 py-1.5 text-[12px] font-semibold ${derinlik === n ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white' : 'bg-[#FAF8F5] dark:bg-[#13204A] text-[#0E1C4F] dark:text-[#F3EFE8]'}`}>
                    {n} adım
                  </button>
                ))}
              </div>
              <button type="button" onClick={odaktanCik} className={DUGME}>Odaktan çık</button>
            </div>
            {gizliBag > 0 && (
              <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                {gizliBag} bağ kapalı öbekte, ağda görünmüyor.{' '}
                <button type="button" className="underline underline-offset-2 hover:text-[#F26B6F]"
                  onClick={() => { setObekler(new Set(BAG_OBEKLERI.map(o => o.id))); setTurler(new Set(CIP_TURLERI)); }}>Bütün bağları aç</button>
              </p>
            )}
            {seciliCiftler.length > 0 && (
              <ul className="space-y-1 text-[12px]">
                {seciliCiftler.map(c => {
                  const o = c.a === secili ? c.b : c.a;
                  const acik = acikCiftler.includes(c);
                  return (
                    <li key={c.id} className={`flex items-baseline gap-1.5 ${acik ? '' : 'opacity-55'}`}>
                      <button type="button" onClick={() => dugumeBas(o)} className="text-left underline decoration-[#0E1C4F]/30 dark:decoration-[#A6B0C9]/40 underline-offset-2 hover:decoration-[#F26B6F]">{adi(o)}</button>
                      <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">· {kenarAdlari(c)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!bagModu ? (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onMaddeAc(seciliMadde.id)} className={DOLU}>Maddeyi aç</button>
                <button type="button" onClick={() => { setBagModu(true); setHedef(null); setMesaj(''); }} className={DUGME}><Link2 className="w-3.5 h-3.5" /> Bağ kur</button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-dashed border-[#F26B6F]/60 p-2">
                <p className="text-[12px]">{hedef ? <>Bağ: <b>{seciliMadde.ad}</b> → <b>{adi(hedef)}</b></> : 'Ağda bağlanacak maddeye bas ya da listeden seç.'}</p>
                <select value={hedef || ''} onChange={e => setHedef(e.target.value || null)} aria-label="Bağlanacak madde"
                  className="w-full text-[12px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1.5">
                  <option value="">Madde seç…</option>
                  {ag.dugumler.filter(d => d.id !== secili).map(d => <option key={d.id} value={d.id}>{d.ad}</option>)}
                </select>
                <select value={etkinTur} onChange={e => setYeniTur(e.target.value as BagTuru)} aria-label="Bağ türü"
                  className="w-full text-[12px] bg-white dark:bg-[#0E1733] border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1.5">
                  {BAG_TURLERI.filter(b => tekTurler.includes(b.id)).map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}
                </select>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => void bagla()} disabled={!hedef || yaziliyor} className={DOLU}>Bağla</button>
                  <button type="button" onClick={() => { setBagModu(false); setHedef(null); }} className={DUGME}>Vazgeç</button>
                </div>
                <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bağ "{seciliMadde.ad}" maddesine yazılır; düzenleyicide de görünür.</p>
              </div>
            )}
            {mesaj && <p className="text-[12px] text-[#F26B6F]" role="status">{mesaj}</p>}
          </div>
        )}
        {!seciliMadde && !topluKip && !coklu.size && mesaj && (
          <p role="status" className="absolute left-3 top-3 text-[12px] px-2 py-1 rounded-md bg-[#FAF8F5]/95 dark:bg-[#13204A]/95 text-[#F26B6F]">{mesaj}</p>
        )}
      </div>
      <p className="text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-relaxed">
        Maddeler mahallelerine göre kümelenir (künyedeki Mahalle alanı); kümenin adına basınca o kümeye yaklaşır.
        Bir maddeye bas ya da ara: yalnız o ve komşuları kalır, "2 adım" bir halka daha açar. Boşluğu sürükleyerek gez,
        tekerlekle ya da iki parmakla yakınlaştır. Aynı iki madde arasındaki bağlar tek çizgidir; nokta büyüdükçe bağı çoğalır.
        Noktaları sürüklemek yalnız bu ekranı değiştirir, kayda yazılmaz.
      </p>
    </div>
  );
};

export default BagAgi;
