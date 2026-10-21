import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Frame, Image as ImageIcon, Link2, Minus, Plus, StickyNote, Trash2, X } from 'lucide-react';
import type { Item } from '../../types';
import { GorselImg } from '../GorselImg';
import { TYPE_LABELS, WIKI_TYPES } from '../wiki/wikiSchema';
import {
  KART_OLCUSU, NOT_RENKLERI, TUVAL_TURLERI, icerikOku, tuvalGuncel, tuvalTuru, tuvaller, yeniTuval,
  type KartTuru, type NotRengi, type TuvalIcerigi, type TuvalKarti, type TuvalTuru
} from '../../lib/tuval';

/**
 * Atölye → Tuval (6. gece). Solda panolar, ortada pano: kartlar sürüklenir,
 * köşesinden büyür; çerçeve taşınınca içindeki kartlar da gelir. "Ok" ile
 * iki karta sırayla basınca aralarına ok çekilir. Her işten 2 sn sonra pano
 * kaydına yazılır (Kemal'in seçimi); sayfa açılınca hiçbir şey yazılmaz.
 */

interface Props {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  /** Madde kartındaki "aç": kaydı kendi sayfasında açar (viki, drop, kitap) */
  onKayitAc: (item: Item) => void;
  /** Bir maddenin "Tuvalde aç"ından gelindiyse o madde */
  ilkMadde?: string | null;
}

const NOT_RENGI: Record<NotRengi, string> = {
  krem: 'bg-[#F3EFE8] text-[#0E1C4F]', kiremit: 'bg-[#FBE1DF] text-[#0E1C4F]', hardal: 'bg-[#F5E7C4] text-[#0E1C4F]',
  yesil: 'bg-[#DCEBE5] text-[#0E1C4F]', lacivert: 'bg-[#0E1C4F] text-[#F3EFE8]'
};
const NOT_NOKTASI: Record<NotRengi, string> = {
  krem: 'bg-[#F3EFE8]', kiremit: 'bg-[#F26B6F]', hardal: 'bg-[#C99A2E]', yesil: 'bg-[#2F7D6D]', lacivert: 'bg-[#0E1C4F]'
};
const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const KART = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733]';
const GIRDI = 'text-[12px] bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-[#F26B6F]';
const DUGME = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] disabled:opacity-40';
const DOLU = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer bg-[#0E1C4F] dark:bg-[#2C3C72] text-white disabled:opacity-40';
const yeniKimlik = (on: string) => `${on}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Kartın bağlanabileceği kayıtlar: viki maddeleri, droplar, ürünler, kitaplar */
const KARTLIK = new Set<string>([...WIKI_TYPES, 'drop', 'merch_urun', 'kitap_proje', 'kitap_bolum']);
const turAdi = (t: string) => TYPE_LABELS[t as keyof typeof TYPE_LABELS] || ({ drop: 'Drop', merch_urun: 'Ürün', kitap_proje: 'Kitap', kitap_bolum: 'Kitap bölümü' } as Record<string, string>)[t] || t;

export const Tuval: React.FC<Props> = ({ items, onAddItem, onUpdateItem, onDeleteItem, onKayitAc, ilkMadde = null }) => {
  const panolar = useMemo(() => tuvaller(items), [items]);
  const [panoId, setPanoId] = useState<string | null>(null);
  const pano = panolar.find(p => p.id === panoId) || null;

  // ---- yeni pano formu
  const [form, setForm] = useState<{ ad: string; tur: TuvalTuru; bagliId: string } | null>(null);
  const [yaziliyor, setYaziliyor] = useState(false);
  const [mesaj, setMesaj] = useState('');

  // "Tuvalde aç": maddenin panosu varsa o, yoksa bu maddeye bağlı yeni pano formu
  const istenen = useRef<string | null>(null);
  useEffect(() => {
    if (!ilkMadde || istenen.current === ilkMadde) return;
    istenen.current = ilkMadde;
    const var_ = panolar.find(p => p.metadata?.bagliId === ilkMadde);
    if (var_) { setPanoId(var_.id); setForm(null); return; }
    const m = items.find(i => i.id === ilkMadde);
    const tur = (TUVAL_TURLERI.find(t => m && t.bag.includes(m.type))?.id) || 'serbest';
    setForm({ ad: m?.title || '', tur, bagliId: ilkMadde });
  }, [ilkMadde, panolar, items]);
  // Pano seçilmemişse en son dokunulan
  useEffect(() => { if (!panoId && !form && panolar.length && !ilkMadde) setPanoId(panolar[0].id); }, [panoId, form, panolar, ilkMadde]);

  const panoAc = async () => {
    if (!form) return;
    setYaziliyor(true); setMesaj('');
    try {
      const id = `tuval_${Date.now()}`;
      await onAddItem({ id, ...yeniTuval(form.ad, form.tur, form.bagliId || undefined) });
      setPanoId(id); setForm(null);
    } catch { setMesaj('Pano açılamadı; yeniden dene.'); }
    finally { setYaziliyor(false); }
  };

  // ---- içerik ve kendiliğinden kayıt (her işten 2 sn sonra)
  const [icerik, setIcerik] = useState<TuvalIcerigi>({ kartlar: [], oklar: [] });
  const bekleyen = useRef<{ pano: Item; icerik: TuvalIcerigi } | null>(null);
  const [kayitDurumu, setKayitDurumu] = useState<'' | 'bekliyor' | 'yaziliyor' | 'yazildi' | 'hata'>('');
  const gonder = useCallback(async () => {
    const b = bekleyen.current;
    if (!b) return;
    bekleyen.current = null;
    setKayitDurumu('yaziliyor');
    try { await onUpdateItem(tuvalGuncel(b.pano, b.icerik)); setKayitDurumu('yazildi'); }
    catch { setKayitDurumu('hata'); }
  }, [onUpdateItem]);
  // Pano değişince içerik kayıttan okunur (önce bekleyen yazılır)
  const yuklenen = useRef<string | null>(null);
  useEffect(() => {
    if (!pano) return;
    if (yuklenen.current === pano.id) return;
    void gonder();
    yuklenen.current = pano.id;
    setIcerik(icerikOku(pano));
    setSecili(null); setOkBaslangici(null); setDuzenlenen(null);
  }, [pano, gonder]);
  const degistir = (f: (c: TuvalIcerigi) => TuvalIcerigi) => {
    if (!pano) return;
    setIcerik(c => {
      const y = f(c);
      bekleyen.current = { pano, icerik: y };
      return y;
    });
    setKayitDurumu('bekliyor');
  };
  useEffect(() => {
    if (kayitDurumu !== 'bekliyor') return;
    const z = setTimeout(() => void gonder(), 2000);
    return () => clearTimeout(z);
  }, [icerik, kayitDurumu, gonder]);
  useEffect(() => () => { void gonder(); }, [gonder]);

  // ---- görünüm
  const alan = useRef<HTMLDivElement>(null);
  const [bakis, setBakis] = useState({ x: 40, y: 40, olcek: 1 });
  const yakinlas = (oran: number) => setBakis(b => {
    const r = alan.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 : 0, cy = r ? r.height / 2 : 0;
    const olcek = Math.max(0.3, Math.min(2.5, b.olcek * oran));
    const o = olcek / b.olcek;
    return { olcek, x: cx - (cx - b.x) * o, y: cy - (cy - b.y) * o };
  });
  useEffect(() => {
    const el = alan.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      setBakis(b => {
        const olcek = Math.max(0.3, Math.min(2.5, b.olcek * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const o = olcek / b.olcek;
        return { olcek, x: cx - (cx - b.x) * o, y: cy - (cy - b.y) * o };
      });
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, [pano?.id]);
  const ortada = (w: number, h: number) => {
    const r = alan.current?.getBoundingClientRect();
    const cx = ((r ? r.width / 2 : 300) - bakis.x) / bakis.olcek, cy = ((r ? r.height / 2 : 200) - bakis.y) / bakis.olcek;
    const kay = (icerik.kartlar.length % 6) * 18;
    return { x: cx - w / 2 + kay, y: cy - h / 2 + kay };
  };

  // ---- seçim, ok, düzenleme
  const [secili, setSecili] = useState<string | null>(null);
  const [okModu, setOkModu] = useState(false);
  const [okBaslangici, setOkBaslangici] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  const [secici, setSecici] = useState<null | 'madde' | 'gorsel'>(null);
  const [ara, setAra] = useState('');

  const kartEkle = (tur: KartTuru, ek: Partial<TuvalKarti> = {}) => {
    const { w, h } = KART_OLCUSU[tur];
    const id = yeniKimlik('k');
    degistir(c => ({ ...c, kartlar: [...c.kartlar, { id, tur, ...ortada(w, h), w, h, ...ek }] }));
    setSecili(id);
    if (tur === 'not' || tur === 'cerceve') setDuzenlenen(id);
  };
  const seciliyiSil = () => {
    if (!secili) return;
    degistir(c => ({ kartlar: c.kartlar.filter(k => k.id !== secili), oklar: c.oklar.filter(o => o.id !== secili && o.a !== secili && o.b !== secili) }));
    setSecili(null);
  };
  const karta = (id: string) => {
    if (okModu) {
      if (!okBaslangici) { setOkBaslangici(id); return; }
      if (okBaslangici !== id && !icerik.oklar.some(o => o.a === okBaslangici && o.b === id)) {
        const a = okBaslangici;
        degistir(c => ({ ...c, oklar: [...c.oklar, { id: yeniKimlik('o'), a, b: id }] }));
      }
      setOkBaslangici(null); setOkModu(false);
      return;
    }
    setSecili(id);
  };
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (duzenlenen || !secili) return;
      const hedef = e.target as HTMLElement;
      if (hedef?.closest('input, textarea, select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); seciliyiSil(); }
      if (e.key === 'Escape') { setSecili(null); setOkModu(false); setOkBaslangici(null); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });

  // ---- sürükleme: kart, köşe (boyut) ya da boş alan (gezinme)
  const surukle = useRef<{ tur: 'kart' | 'boyut' | 'gez'; id?: string; sx: number; sy: number; ilk: TuvalKarti[]; bx: number; by: number; oynadi: boolean; icindekiler?: string[] } | null>(null);
  const bas = (e: React.PointerEvent, tur: 'kart' | 'boyut' | 'gez', id?: string) => {
    if ((e.target as HTMLElement).closest('textarea, input, button, select, a')) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const k = id ? icerik.kartlar.find(x => x.id === id) : undefined;
    // Çerçeve taşınınca ortası içinde kalan kartlar da gelir
    const icindekiler = k?.tur === 'cerceve' && tur === 'kart'
      ? icerik.kartlar.filter(x => x.id !== k.id && x.tur !== 'cerceve'
        && x.x + x.w / 2 > k.x && x.x + x.w / 2 < k.x + k.w && x.y + x.h / 2 > k.y && x.y + x.h / 2 < k.y + k.h).map(x => x.id)
      : [];
    surukle.current = { tur, id, sx: e.clientX, sy: e.clientY, ilk: icerik.kartlar, bx: bakis.x, by: bakis.y, oynadi: false, icindekiler };
  };
  const hareket = (e: React.PointerEvent) => {
    const s = surukle.current;
    if (!s) return;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (!s.oynadi && Math.abs(dx) + Math.abs(dy) < 4) return;
    s.oynadi = true;
    if (s.tur === 'gez') { setBakis(b => ({ ...b, x: s.bx + dx, y: s.by + dy })); return; }
    const mx = dx / bakis.olcek, my = dy / bakis.olcek;
    setIcerik(c => ({
      ...c, kartlar: s.ilk.map(k => {
        if (s.tur === 'boyut' && k.id === s.id) return { ...k, w: Math.max(120, k.w + mx), h: Math.max(60, k.h + my) };
        if (s.tur === 'kart' && (k.id === s.id || s.icindekiler?.includes(k.id))) return { ...k, x: k.x + mx, y: k.y + my };
        return k;
      })
    }));
  };
  const birak = () => {
    const s = surukle.current;
    surukle.current = null;
    if (!s) return;
    if (!s.oynadi) {
      if (s.tur === 'kart' && s.id) karta(s.id);
      else if (s.tur === 'gez') { setSecili(null); setDuzenlenen(null); }
      return;
    }
    if (s.tur !== 'gez') degistir(c => c);
  };

  const kayit = (id?: string) => (id ? items.find(i => i.id === id) : undefined);
  const merkez = (k: TuvalKarti) => ({ x: k.x + k.w / 2, y: k.y + k.h / 2 });
  /** Ok, kartın kenarında başlayıp biter */
  const kenar = (k: TuvalKarti, hx: number, hy: number) => {
    const c = merkez(k);
    const dx = hx - c.x, dy = hy - c.y;
    const t = Math.min(Math.abs((k.w / 2) / (dx || 1e-6)), Math.abs((k.h / 2) / (dy || 1e-6)));
    return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) };
  };
  const bagliMadde = pano?.metadata?.bagliId ? kayit(String(pano.metadata.bagliId)) : undefined;
  const sirali = [...icerik.kartlar].sort((a, b) => Number(b.tur === 'cerceve') - Number(a.tur === 'cerceve'));

  return (
    <div className="grid lg:grid-cols-[15rem_1fr] gap-4">
      {/* Panolar */}
      <aside className="space-y-2">
        <button type="button" onClick={() => setForm({ ad: '', tur: 'mahalle', bagliId: '' })} className={`${DOLU} w-full justify-center`}><Plus className="w-3.5 h-3.5" /> Yeni pano</button>
        <ul className="space-y-1">
          {panolar.map(p => {
            const b = p.metadata?.bagliId ? kayit(String(p.metadata.bagliId)) : undefined;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => { setPanoId(p.id); setForm(null); }}
                  className={`w-full text-left px-3 py-2 rounded-xl border cursor-pointer ${p.id === panoId && !form ? 'border-[#F26B6F] bg-white dark:bg-[#13204A]' : 'border-transparent hover:border-[#CFC5B4] dark:hover:border-[#2C3C72]'}`}>
                  <div className="text-[13px] font-semibold truncate">{p.title}</div>
                  <div className={`text-[11px] ${IKINCIL} truncate`}>{TUVAL_TURLERI.find(t => t.id === tuvalTuru(p))?.ad}{b ? ` · ${b.title}` : ''}</div>
                </button>
              </li>
            );
          })}
        </ul>
        {!panolar.length && !form && <p className={`text-[12px] ${IKINCIL}`}>Henüz pano yok.</p>}
      </aside>

      <div className="space-y-2 min-w-0">
        {form ? (
          <section className={`${KART} p-4 space-y-3 max-w-xl`}>
            <div className="text-[15px] font-semibold">Yeni pano</div>
            <div className="flex flex-wrap gap-1.5">
              {TUVAL_TURLERI.map(t => (
                <button key={t.id} type="button" onClick={() => setForm(f => f && { ...f, tur: t.id, bagliId: t.bag.length ? f.bagliId : '' })}
                  className={`min-h-8 px-2.5 py-0.5 rounded-full text-[11px] border cursor-pointer ${form.tur === t.id ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`}>{t.ad}</button>
              ))}
            </div>
            {TUVAL_TURLERI.find(t => t.id === form.tur)!.bag.length > 0 && (
              <label className="flex flex-col gap-1 text-[11px]">
                <span className={IKINCIL}>Bağlı olduğu kayıt (isteğe bağlı)</span>
                <select value={form.bagliId} className={GIRDI}
                  onChange={e => { const m = kayit(e.target.value); setForm(f => f && { ...f, bagliId: e.target.value, ad: f.ad || m?.title || '' }); }}>
                  <option value="">— yok</option>
                  {items.filter(i => !i.archived && TUVAL_TURLERI.find(t => t.id === form.tur)!.bag.includes(i.type))
                    .sort((a, b) => a.title.localeCompare(b.title, 'tr')).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-[11px]">
              <span className={IKINCIL}>Panonun adı</span>
              <input value={form.ad} onChange={e => setForm(f => f && { ...f, ad: e.target.value })} className={GIRDI} />
            </label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void panoAc()} disabled={yaziliyor || !form.ad.trim()} className={DOLU}>Panoyu aç</button>
              <button type="button" onClick={() => setForm(null)} className={DUGME}>Vazgeç</button>
            </div>
            {mesaj && <p className="text-[12px] text-[#F26B6F]">{mesaj}</p>}
          </section>
        ) : !pano ? (
          <section className={`${KART} p-6 max-w-xl space-y-1`}>
            <p className="text-[15px] font-semibold">Bir pano seç ya da yeni pano aç.</p>
            <p className={`text-[13px] ${IKINCIL}`}>Mahalle esini, drop panosu, kitap planı ya da serbest pano. Kartları istediğin yere koyar, aralarına ok çekersin.</p>
          </section>
        ) : (
          <>
            {/* Araç çubuğu */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-semibold mr-1 truncate max-w-[16rem]">{pano.title}</span>
              {bagliMadde && (
                <button type="button" onClick={() => onKayitAc(bagliMadde)} className={`${DUGME} !font-normal`} title="Bağlı kaydı aç"><ExternalLink className="w-3 h-3" />{bagliMadde.title}</button>
              )}
              <span className="flex-1" />
              <button type="button" onClick={() => kartEkle('not', { renk: 'krem', metin: '' })} className={DUGME}><StickyNote className="w-3.5 h-3.5" />Not</button>
              <button type="button" onClick={() => { setSecici(s => (s === 'madde' ? null : 'madde')); setAra(''); }} className={DUGME}><Link2 className="w-3.5 h-3.5" />Madde</button>
              <button type="button" onClick={() => { setSecici(s => (s === 'gorsel' ? null : 'gorsel')); setAra(''); }} className={DUGME}><ImageIcon className="w-3.5 h-3.5" />Görsel</button>
              <button type="button" onClick={() => kartEkle('cerceve', { metin: '' })} className={DUGME}><Frame className="w-3.5 h-3.5" />Çerçeve</button>
              <button type="button" onClick={() => { setOkModu(m => !m); setOkBaslangici(null); }} aria-pressed={okModu}
                className={okModu ? DOLU : DUGME} title="Önce oku başlatacağın karta, sonra hedef karta bas"><ArrowRight className="w-3.5 h-3.5" />Ok</button>
              <button type="button" onClick={seciliyiSil} disabled={!secili} className={DUGME}><Trash2 className="w-3.5 h-3.5" />Sil</button>
              <span className={`text-[11px] ${IKINCIL} w-20 text-right`}>
                {kayitDurumu === 'bekliyor' ? 'bekliyor…' : kayitDurumu === 'yaziliyor' ? 'yazılıyor…' : kayitDurumu === 'yazildi' ? 'kaydedildi ✓' : kayitDurumu === 'hata' ? 'kaydedilemedi' : ''}
              </span>
            </div>

            {/* Madde / görsel seçici */}
            {secici && (
              <div className={`${KART} p-3 space-y-2`}>
                <div className="flex items-center gap-2">
                  <input value={ara} onChange={e => setAra(e.target.value)} placeholder={secici === 'madde' ? 'Madde, drop, ürün ya da kitap ara…' : 'Görsel ara…'} className={`${GIRDI} flex-1`} autoFocus />
                  <button type="button" onClick={() => setSecici(null)} aria-label="Kapat" className={`p-1 ${IKINCIL}`}><X className="w-4 h-4" /></button>
                </div>
                {secici === 'madde' ? (
                  <ul className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {items.filter(i => !i.archived && !i.isProposal && KARTLIK.has(i.type) && (!ara.trim() || i.title.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr'))))
                      .sort((a, b) => a.title.localeCompare(b.title, 'tr')).slice(0, 60).map(i => (
                        <li key={i.id}><button type="button" onClick={() => { kartEkle('madde', { maddeId: i.id }); setSecici(null); }} className={`${DUGME} !font-normal`}>{i.title} <span className={`text-[10px] ${IKINCIL}`}>· {turAdi(i.type)}</span></button></li>
                      ))}
                  </ul>
                ) : (
                  <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-56 overflow-y-auto">
                    {items.filter(i => i.type === 'ilham_gorsel' && !i.archived && (i.images || []).length && (!ara.trim() || i.title.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr'))))
                      .map(i => (
                        <li key={i.id}>
                          <button type="button" onClick={() => { kartEkle('gorsel', { gorselId: i.id }); setSecici(null); }} title={i.title}
                            className="block w-full aspect-square rounded-lg overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F] cursor-pointer">
                            <GorselImg src={i.images![0]} alt={i.title} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {okModu && <p className="text-[12px] text-[#F26B6F]">{okBaslangici ? 'Şimdi okun gideceği karta bas.' : 'Okun başlayacağı karta bas.'}</p>}

            {/* Pano */}
            <div ref={alan} className={`${KART} relative overflow-hidden h-[calc(100dvh-17rem)] min-h-[420px] touch-none select-none ${okModu ? 'cursor-crosshair' : 'cursor-grab'}`}
              style={{ backgroundImage: 'radial-gradient(circle, rgba(140,123,99,0.25) 1px, transparent 1px)', backgroundSize: `${22 * bakis.olcek}px ${22 * bakis.olcek}px`, backgroundPosition: `${bakis.x}px ${bakis.y}px` }}
              onPointerDown={e => bas(e, 'gez')} onPointerMove={hareket} onPointerUp={birak} onPointerCancel={() => { surukle.current = null; }}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${bakis.x}px, ${bakis.y}px) scale(${bakis.olcek})` }}>
                {/* Oklar */}
                <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={1} height={1} aria-hidden="true">
                  <defs>
                    <marker id="tuval-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" className="fill-[#0E1C4F] dark:fill-[#A6B0C9]" />
                    </marker>
                  </defs>
                  {icerik.oklar.map(o => {
                    const a = icerik.kartlar.find(k => k.id === o.a), b = icerik.kartlar.find(k => k.id === o.b);
                    if (!a || !b) return null;
                    const p = kenar(a, merkez(b).x, merkez(b).y), q = kenar(b, merkez(a).x, merkez(a).y);
                    const sec = secili === o.id;
                    return (
                      <g key={o.id} className="pointer-events-auto cursor-pointer" onPointerDown={e => { e.stopPropagation(); setSecili(o.id); }}>
                        <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={14} />
                        <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={sec ? 'stroke-[#F26B6F]' : 'stroke-[#0E1C4F] dark:stroke-[#A6B0C9]'} strokeWidth={sec ? 2.6 : 1.8} markerEnd="url(#tuval-ok)" />
                      </g>
                    );
                  })}
                </svg>

                {/* Kartlar: çerçeveler arkada */}
                {sirali.map(k => {
                  const sec = secili === k.id || okBaslangici === k.id;
                  const m = kayit(k.maddeId), g = kayit(k.gorselId);
                  const halka = sec ? 'ring-2 ring-[#F26B6F]' : '';
                  const ortak = 'absolute rounded-xl shadow-[0_6px_18px_-10px_rgba(14,28,79,0.45)]';
                  return (
                    <div key={k.id} data-kart={k.id} className={`${ortak} ${halka} ${k.tur === 'cerceve' ? '!shadow-none border-2 border-dashed border-[#8C7B63]/60 dark:border-[#A6B0C9]/50 bg-[#FAF8F5]/40 dark:bg-[#13204A]/40' : ''}`}
                      style={{ left: k.x, top: k.y, width: k.w, height: k.h }}
                      onPointerDown={e => bas(e, 'kart', k.id)}
                      onDoubleClick={() => (k.tur === 'not' || k.tur === 'cerceve') && setDuzenlenen(k.id)}>
                      {k.tur === 'not' && (
                        <div className={`w-full h-full rounded-xl p-3 overflow-hidden ${NOT_RENGI[k.renk || 'krem']}`}>
                          {duzenlenen === k.id ? (
                            <textarea autoFocus defaultValue={k.metin || ''} className="w-full h-full bg-transparent resize-none text-[13px] leading-snug focus:outline-hidden"
                              onBlur={e => { const v = e.target.value; setDuzenlenen(null); if (v !== (k.metin || '')) degistir(c => ({ ...c, kartlar: c.kartlar.map(x => (x.id === k.id ? { ...x, metin: v } : x)) })); }} />
                          ) : (
                            <p className={`text-[13px] leading-snug whitespace-pre-line ${k.metin ? '' : 'opacity-50 italic'}`}>{k.metin || 'boş not · yazmak için çift tıkla'}</p>
                          )}
                        </div>
                      )}
                      {k.tur === 'cerceve' && (
                        <div className="px-3 pt-2">
                          {duzenlenen === k.id ? (
                            <input autoFocus defaultValue={k.metin || ''} placeholder="Çerçevenin başlığı"
                              className="w-full bg-transparent text-[13px] font-semibold focus:outline-hidden border-b border-[#CFC5B4]"
                              onBlur={e => { const v = e.target.value; setDuzenlenen(null); if (v !== (k.metin || '')) degistir(c => ({ ...c, kartlar: c.kartlar.map(x => (x.id === k.id ? { ...x, metin: v } : x)) })); }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                          ) : (
                            <p className={`text-[13px] font-semibold ${k.metin ? 'text-[#0E1C4F] dark:text-[#F3EFE8]' : `${IKINCIL} italic`}`}>{k.metin || 'başlıksız çerçeve'}</p>
                          )}
                        </div>
                      )}
                      {k.tur === 'madde' && (
                        <div className="w-full h-full rounded-xl p-3 bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold truncate">{m?.title || 'silinmiş kayıt'}</div>
                            <div className={`text-[10.5px] ${IKINCIL}`}>{m ? turAdi(m.type) : ''}</div>
                          </div>
                          {m && <button type="button" onClick={() => onKayitAc(m)} className={`p-1 ${IKINCIL} hover:text-[#F26B6F]`} title="Aç" aria-label="Kaydı aç"><ExternalLink className="w-3.5 h-3.5" /></button>}
                        </div>
                      )}
                      {k.tur === 'gorsel' && (
                        <div className="w-full h-full rounded-xl overflow-hidden bg-white dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72]">
                          {g?.images?.[0] ? <GorselImg src={g.images[0]} alt={g.title} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                            : <div className={`w-full h-full flex items-center justify-center text-[11px] ${IKINCIL}`}>görsel bulunamadı</div>}
                        </div>
                      )}
                      {/* Boyut tutamacı */}
                      {sec && k.tur !== 'madde' && (
                        <span onPointerDown={e => bas(e, 'boyut', k.id)} className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-white border-2 border-[#F26B6F] cursor-nwse-resize" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Seçili notun rengi */}
              {secili && icerik.kartlar.find(k => k.id === secili)?.tur === 'not' && (
                <div className={`${KART} absolute left-3 bottom-3 flex items-center gap-1.5 px-2 py-1.5`} onPointerDown={e => e.stopPropagation()}>
                  {NOT_RENKLERI.map(r => (
                    <button key={r} type="button" aria-label={`Not rengi ${r}`} onClick={() => degistir(c => ({ ...c, kartlar: c.kartlar.map(x => (x.id === secili ? { ...x, renk: r } : x)) }))}
                      className={`w-5 h-5 rounded-full border border-[#CFC5B4] cursor-pointer ${NOT_NOKTASI[r]}`} />
                  ))}
                </div>
              )}
              <div className="absolute right-3 top-3 flex flex-col gap-1" onPointerDown={e => e.stopPropagation()}>
                <button type="button" onClick={() => yakinlas(1.2)} aria-label="Yakınlaştır" className={`${DUGME} !px-2`}><Plus className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => yakinlas(1 / 1.2)} aria-label="Uzaklaştır" className={`${DUGME} !px-2`}><Minus className="w-3.5 h-3.5" /></button>
              </div>
              {!icerik.kartlar.length && (
                <p className={`absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] ${IKINCIL} pointer-events-none`}>
                  Boş pano. Üstteki düğmelerle not, madde, görsel ya da çerçeve ekle.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-[11px] ${IKINCIL} flex-1`}>Kartı sürükle, köşesinden büyüt; notu ve çerçeve başlığını çift tıklayıp yaz. Çerçeveyi taşıyınca içindekiler de gelir. Delete seçileni siler.</p>
              <PanoSil onSil={async () => { await onDeleteItem(pano.id); setPanoId(null); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/** Panoyu silme: iki adımlı */
const PanoSil: React.FC<{ onSil: () => Promise<void> }> = ({ onSil }) => {
  const [onay, setOnay] = useState(false);
  return onay ? (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      Pano silinsin mi?
      <button type="button" onClick={() => void onSil()} className="px-2.5 py-1 rounded-lg bg-[#F26B6F] text-white text-[12px] font-semibold cursor-pointer">Evet, sil</button>
      <button type="button" onClick={() => setOnay(false)} className={DUGME}>Vazgeç</button>
    </span>
  ) : <button type="button" onClick={() => setOnay(true)} className={`${DUGME} !font-normal`}><Trash2 className="w-3 h-3" />Panoyu sil</button>;
};

export default Tuval;
