import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, Maximize2, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { AJAN_ADLARI, ajanAdi } from '../../lib/geceTuru';
import { isleriOku, type IsDosyasi } from '../../lib/isler';
import { ajanEslesir, CIZIMLER, cizimOku, kisalt, NW, RENKLER, TAS, TURLER, type Cizim, type CizimId, type Dugum } from '../../lib/isAkisi';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Ajanlar ve otomasyonlar → İş akışı (13 Kasım, Kemal). Tuvaldeki "Resmi akış" ve
 * KKM'nin bugünkü ekranları, yalnız görünüm: parmakla kaydır, iki parmakla
 * yakınlaştır. Kutuya basınca açıklaması; ajan kutusu ajan kartını, ekran kutusu
 * o ekranı açar. Çizim tuvalde değişir; Kems buraya aktarır.
 */

export interface AkisOdagi { cizim: CizimId; dugum: string; n: number }

interface Props {
  /** KKM'de bir ekrana git (App'teki git) */
  onGit?: (hedef: string) => void;
  /** Ajan kartını aç */
  onAjan?: (ad: string) => void;
  /** Ajan kartından gelince: o kutu ortada ve seçili */
  odak?: AkisOdagi | null;
}

const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export const IsAkisi: React.FC<Props> = ({ onGit, onAjan, odak }) => {
  const anahtar = anahtariOku();
  const [cizimId, setCizimId] = useState<CizimId>(odak?.cizim ?? 'resmi');
  const [veriler, setVeriler] = useState<Partial<Record<CizimId, Cizim | { hata: string }>>>({});
  const [yenile, setYenile] = useState(0);
  const [secili, setSecili] = useState<string | null>(odak?.dugum ?? null);
  const [gorus, setGorus] = useState({ x: 20, y: 20, s: 0.5 });
  /** 13 Kasım ekleri: liste ve eşleşme görünümü, ajan süzgeci, istenenleri gizle, ajanların elindeki işler */
  const [gorunum, setGorunum] = useState<'cizim' | 'liste' | 'eslesme'>('cizim');
  const [odakAjan, setOdakAjan] = useState('');
  const [istenenGizle, setIstenenGizle] = useState(false);
  const [isler, setIsler] = useState<IsDosyasi | null>(null);
  const sahne = useRef<HTMLDivElement | null>(null);
  const bekleyenOdak = useRef<string | null>(odak?.dugum ?? null);

  useEffect(() => {
    if (!odak) return;
    setCizimId(odak.cizim); setSecili(odak.dugum); bekleyenOdak.current = odak.dugum;
  }, [odak?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    for (const c of CIZIMLER) {
      cizimOku(anahtar, c.id)
        .then(v => { if (!iptal) setVeriler(x => ({ ...x, [c.id]: v })); })
        .catch(e => { if (!iptal) setVeriler(x => ({ ...x, [c.id]: { hata: hataYazi(e) } })); });
    }
    isleriOku(anahtar).then(i => { if (!iptal) setIsler(i); }).catch(() => { /* sayılar görünmez */ });
    return () => { iptal = true; };
  }, [anahtar, yenile]);

  const v = veriler[cizimId];
  const cizim = v && 'dugumler' in v ? v : null;
  const D = useMemo(() => new Map((cizim?.dugumler || []).map(n => [n.id, n])), [cizim]);

  const sinirlar = useCallback(() => {
    if (!cizim) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const g of cizim.gruplar) { x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y - 60); x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h); }
    for (const d of cizim.dugumler) { x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x + NW); y1 = Math.max(y1, d.y + 120); }
    return x0 > x1 ? null : { x0, y0, x1, y1 };
  }, [cizim]);

  const sigdir = useCallback(() => {
    const b = sinirlar(), el = sahne.current; if (!b || !el) return;
    const r = el.getBoundingClientRect(), pad = 16;
    const s = Math.min(1, Math.max(0.08, Math.min((r.width - pad * 2) / (b.x1 - b.x0), (r.height - pad * 2) / (b.y1 - b.y0))));
    setGorus({ s, x: (r.width - (b.x1 - b.x0) * s) / 2 - b.x0 * s, y: (r.height - (b.y1 - b.y0) * s) / 2 - b.y0 * s });
  }, [sinirlar]);

  /** Açılış: hepsi sığarsa sığdır; telefonda yazı okunmayacak kadar küçülürse akışın başından okunur boyda */
  const baslangic = useCallback(() => {
    const b = sinirlar(), el = sahne.current; if (!b || !el) return;
    const r = el.getBoundingClientRect(), pad = 16;
    const sig = Math.min((r.width - pad * 2) / (b.x1 - b.x0), (r.height - pad * 2) / (b.y1 - b.y0));
    if (sig >= 0.35) { sigdir(); return; }
    const s = 0.55;
    // Başlangıç: en soldaki bölümün ortası
    const ilk = [...(cizim?.gruplar || [])].sort((a, b) => a.x - b.x)[0];
    const y = ilk ? ilk.y + ilk.h / 2 : (b.y0 + b.y1) / 2;
    setGorus({ s, x: pad - b.x0 * s, y: r.height / 2 - y * s });
  }, [sinirlar, sigdir, cizim]);

  const kutuyaGit = useCallback((id: string) => {
    const n = D.get(id), el = sahne.current; if (!n || !el) return;
    const r = el.getBoundingClientRect(), s = 0.9;
    setGorus({ s, x: r.width / 2 - (n.x + NW / 2) * s, y: r.height / 3 - (n.y + TAS / 2) * s });
    setSecili(id);
  }, [D]);

  // Çizim gelince ya da değişince: odak varsa ona, yoksa hepsini sığdır
  // Liste ya da eşleşmeden çizime dönünce de (çizim gizliyken ölçü alınamaz)
  const gorulenCizim = useRef<Cizim | null>(null);
  useLayoutEffect(() => {
    if (!cizim || gorunum !== 'cizim') return;
    if (bekleyenOdak.current && D.has(bekleyenOdak.current)) { kutuyaGit(bekleyenOdak.current); bekleyenOdak.current = null; }
    else if (gorulenCizim.current !== cizim) baslangic();
    gorulenCizim.current = cizim;
  }, [cizim, gorunum]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- dokunma
  const parmaklar = useRef(new Map<number, { x: number; y: number }>());
  const islem = useRef<null | { tur: 'kay'; sx: number; sy: number; gx: number; gy: number; oynadi: boolean; hedef: string | null } | { tur: 'cimdik'; d: number }>(null);
  const zumla = (k: number, mx: number, my: number) => setGorus(g => {
    const s = Math.min(2, Math.max(0.08, g.s * k)), o = s / g.s;
    return { s, x: mx - (mx - g.x) * o, y: my - (my - g.y) * o };
  });
  const asagi = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-arac]')) return;
    parmaklar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (parmaklar.current.size === 2) {
      const [a, b] = [...parmaklar.current.values()];
      islem.current = { tur: 'cimdik', d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      return;
    }
    const kutu = (e.target as HTMLElement).closest('[data-dugum]') as HTMLElement | null;
    islem.current = { tur: 'kay', sx: e.clientX, sy: e.clientY, gx: gorus.x, gy: gorus.y, oynadi: false, hedef: kutu?.dataset.dugum ?? null };
  };
  const hareket = (e: React.PointerEvent) => {
    if (parmaklar.current.has(e.pointerId)) parmaklar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const i = islem.current; if (!i) return;
    if (i.tur === 'cimdik') {
      if (parmaklar.current.size < 2 || !sahne.current) return;
      const [a, b] = [...parmaklar.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, r = sahne.current.getBoundingClientRect();
      zumla(d / i.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); i.d = d; return;
    }
    const dx = e.clientX - i.sx, dy = e.clientY - i.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) i.oynadi = true;
    if (i.oynadi) setGorus(g => ({ ...g, x: i.gx + dx, y: i.gy + dy }));
  };
  const yukari = (e: React.PointerEvent) => {
    parmaklar.current.delete(e.pointerId);
    const i = islem.current;
    if (i?.tur === 'cimdik') { if (!parmaklar.current.size) islem.current = null; return; }
    islem.current = null;
    if (i && !i.oynadi) setSecili(i.hedef);
  };
  useEffect(() => {
    const el = sahne.current; if (!el) return;
    const tekerlek = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zumla(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, []);
  const ortadanZumla = (k: number) => { const r = sahne.current?.getBoundingClientRect(); if (r) zumla(k, r.width / 2, r.height / 2); };

  // ---------------------------------------------------------------- çizim
  const sec = secili ? D.get(secili) : undefined;
  const elindeki = useCallback((ajan?: string) => (!ajan || !isler ? [] : isler.isler.filter(i => i.durum !== 'bitti' && ajanEslesir(ajan, i.kimde))), [isler]);
  const gizli = (n: Dugum) => istenenGizle && n.durum === 'istenen';
  /** Seçili ajanın kutuları ve bir adım komşuları parlar */
  const vurgu = useMemo(() => {
    if (!odakAjan || !cizim) return null;
    const ana = new Set(cizim.dugumler.filter(n => n.ajan === odakAjan).map(n => n.id));
    const hepsi = new Set(ana);
    for (const b of cizim.baglar) { if (ana.has(b.k)) hepsi.add(b.h); if (ana.has(b.h)) hepsi.add(b.k); }
    return { ana, hepsi };
  }, [odakAjan, cizim]);
  const akistakiAjanlar = useMemo(() => [...new Set((cizim?.dugumler || []).map(n => n.ajan).filter(Boolean) as string[])]
    .sort((a, b) => ajanAdi(a).localeCompare(ajanAdi(b), 'tr')), [cizim]);
  const komsu = useMemo(() => {
    if (!sec || !cizim) return null;
    return {
      once: cizim.baglar.filter(b => b.h === sec.id).map(b => D.get(b.k)).filter(Boolean) as Dugum[],
      sonra: cizim.baglar.filter(b => b.k === sec.id).map(b => D.get(b.h)).filter(Boolean) as Dugum[],
    };
  }, [sec, cizim, D]);
  const grubu = sec?.grup ? cizim?.gruplar.find(g => g.id === sec.grup) : undefined;
  const asamasi = grubu?.asama ? cizim?.asamalar.find(a => a.id === grubu.asama)?.ad : undefined;

  const basliklar = useMemo(() => {
    if (!cizim?.gruplar.length) return [];
    const ustY = Math.min(...cizim.gruplar.map(g => g.y)) - 50;
    return cizim.asamalar.map((a, i) => {
      const gs = cizim.gruplar.filter(g => g.asama === a.id); if (!gs.length) return null;
      const x0 = Math.min(...gs.map(g => g.x)), x1 = Math.max(...gs.map(g => g.x + g.w));
      return { id: a.id, ad: `${i + 1}. ${a.ad}`, x: x0, y: ustY, w: Math.max(160, x1 - x0) };
    }).filter(Boolean) as Array<{ id: string; ad: string; x: number; y: number; w: number }>;
  }, [cizim]);
  const sirali = useMemo(() => [...(cizim?.gruplar || [])].sort((a, b) => (a.sira || 0) - (b.sira || 0)), [cizim]);

  if (!anahtar) return <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; iş akışı ajansın deposundan okunur. Anahtar "Ajans bağlantısı" bölümünde girilir.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {CIZIMLER.map(c => (
          <button key={c.id} type="button" onClick={() => { setCizimId(c.id); setSecili(null); }} aria-pressed={cizimId === c.id}
            className={`min-h-9 px-3 rounded-full text-[12px] font-semibold border cursor-pointer ${cizimId === c.id ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI}`}`}>
            {c.ad}
          </button>
        ))}
        <span className={`flex-1 min-w-0 text-[11px] ${IKINCIL}`}>
          {cizimId === 'resmi' ? 'Ajans bu akışla çalışır. Kutuya bas: açıklaması ve bağlantısı.' : 'KKM\'nin bugünkü ekranları. Kutuya bas: o ekrana git.'}
        </span>
        <button type="button" onClick={() => setYenile(t => t + 1)} className={DUGME_BOS} title="Yeniden oku"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] p-0.5">
          {([['cizim', 'Çizim'], ['liste', 'Liste'], ['eslesme', 'Eşleşme']] as const).map(([id, ad]) => (
            <button key={id} type="button" onClick={() => setGorunum(id)} aria-pressed={gorunum === id}
              className={`min-h-8 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer ${gorunum === id ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]' : YAZI}`}>{ad}</button>
          ))}
        </div>
        {gorunum !== 'eslesme' && cizimId === 'resmi' && (
          <select value={odakAjan} onChange={e => { setOdakAjan(e.target.value); setSecili(null); }} aria-label="Ajan seç"
            className={`min-h-9 max-w-[180px] px-2 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`}>
            <option value="">Bütün ajanlar</option>
            {akistakiAjanlar.map(a => <option key={a} value={a}>{ajanAdi(a)}{elindeki(a).length ? ` · ${elindeki(a).length} iş` : ''}</option>)}
          </select>
        )}
        {gorunum !== 'eslesme' && cizimId === 'resmi' && (
          <label className={`inline-flex items-center gap-1.5 text-[12px] ${YAZI} cursor-pointer`}>
            <input type="checkbox" checked={istenenGizle} onChange={e => setIstenenGizle(e.target.checked)} className="accent-[#F26B6F]" /> Yalnız bugün olanlar
          </label>
        )}
      </div>

      {gorunum === 'liste' && cizim && <AkisListesi cizim={cizim} odakAjan={odakAjan} istenenGizle={istenenGizle} elindeki={elindeki} onGit={onGit} onAjan={onAjan}
        onCizimde={id => { bekleyenOdak.current = id; setGorunum('cizim'); }} />}
      {gorunum === 'eslesme' && <Eslesme veriler={veriler} elindeki={elindeki} onAjan={onAjan} onGit={onGit}
        onCizimde={(c, id) => { bekleyenOdak.current = id; setCizimId(c); setGorunum('cizim'); }} />}

      <div ref={sahne} hidden={gorunum !== 'cizim'} onPointerDown={asagi} onPointerMove={hareket} onPointerUp={yukari} onPointerCancel={yukari}
        className={`${KART} relative h-[68vh] min-h-[360px] overflow-hidden touch-none select-none cursor-grab`}
        style={{ backgroundImage: 'radial-gradient(rgba(106,94,76,.22) 1.1px, transparent 1.1px)', backgroundSize: '22px 22px' }}>
        {!v && <p className={`absolute inset-0 grid place-items-center text-[12px] ${IKINCIL}`}>Akış okunuyor…</p>}
        {v && 'hata' in v && <p className={`absolute inset-0 grid place-items-center p-6 text-center text-[12px] ${YAZI}`}>Okunamadı ({v.hata}).</p>}
        {cizim && (
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${gorus.x}px,${gorus.y}px) scale(${gorus.s})` }}>
            {basliklar.map(b => (
              <div key={b.id} className={`absolute flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.09em] whitespace-nowrap ${IKINCIL}`} style={{ left: b.x, top: b.y, width: b.w }}>
                {b.ad}<span className="flex-1 h-px bg-[#CFC5B4] dark:bg-[#2C3C72]" />
              </div>
            ))}
            {sirali.map((g, i) => {
              const r = RENKLER[g.renk || 'gri'] || RENKLER.gri;
              return (
                <div key={g.id} className="absolute rounded-xl border-[1.5px]" style={{ left: g.x, top: g.y, width: g.w, height: g.h, background: rgba(r, 0.1), borderColor: rgba(r, 0.5) }}>
                  <div className="px-4 pt-3">
                    <b className={`block text-[15px] font-semibold leading-tight ${YAZI}`}>{i + 1}. {g.ad}</b>
                    {g.not && <small className={`block text-[11.5px] leading-snug mt-0.5 ${IKINCIL}`}>{g.not}</small>}
                  </div>
                </div>
              );
            })}
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1">
              <defs>
                <marker id="ia-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8A8F99" /></marker>
                <marker id="ia-ok-s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#F26B6F" /></marker>
              </defs>
              {cizim.baglar.map(b => {
                const k = D.get(b.k), h = D.get(b.h); if (!k || !h || gizli(k) || gizli(h)) return null;
                const x1 = k.x + (NW - TAS) / 2 + TAS + 6, y1 = k.y + TAS / 2, x2 = h.x + (NW - TAS) / 2 - 8, y2 = h.y + TAS / 2;
                const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
                const ilgili = (!!secili && (b.k === secili || b.h === secili)) || (!!vurgu && (vurgu.ana.has(b.k) || vurgu.ana.has(b.h)));
                const soluk = (!!secili || !!vurgu) && !ilgili;
                const istenen = k.durum === 'istenen' || h.durum === 'istenen';
                return (
                  <g key={b.id}>
                    <path d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke={ilgili ? '#F26B6F' : '#8A8F99'}
                      strokeWidth={ilgili ? 2.5 : 1.6} strokeDasharray={istenen ? '6 5' : undefined} opacity={soluk ? (vurgu ? 0.15 : 0.35) : 1} markerEnd={`url(#${ilgili ? 'ia-ok-s' : 'ia-ok'})`} />
                    {b.etiket && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize="11" fill="#6A5E4C">{b.etiket}</text>}
                  </g>
                );
              })}
            </svg>
            {cizim.dugumler.map(n => {
              const t = TURLER[n.tur || 'arac'] || TURLER.arac;
              if (gizli(n)) return null;
              const bu = n.id === secili;
              const bagli = !!(n.ajan || n.git);
              const isSayisi = elindeki(n.ajan).length;
              return (
                <div key={n.id} data-dugum={n.id} className="absolute flex flex-col items-center gap-1.5 cursor-pointer" style={{ left: n.x, top: n.y, width: NW, opacity: vurgu && !vurgu.hepsi.has(n.id) ? 0.18 : 1 }}>
                  <div className={`relative grid place-items-center rounded-xl border-[1.5px] bg-[#FAF8F5] dark:bg-[#0F1A40] ${n.durum === 'istenen' ? 'border-dashed bg-transparent' : ''} ${bu ? 'border-[#F26B6F] ring-4 ring-[#F26B6F]/20' : 'border-[#CFC5B4] dark:border-[#2C3C72]'}`} style={{ width: TAS, height: TAS }}>
                    <div className="grid place-items-center rounded-lg font-mono text-[12px] font-medium text-[#15171c]" style={{ width: 36, height: 36, background: t.renk, opacity: n.durum === 'istenen' ? 0.6 : 1 }}>{n.kisa || kisalt(n.ad)}</div>
                    {isSayisi > 0 && <span className="absolute -bottom-2 -right-3 px-1.5 h-5 rounded-full bg-[#0E1C4F] dark:bg-[#F3EFE8] text-[#F3EFE8] dark:text-[#0E1C4F] text-[10px] font-semibold grid place-items-center whitespace-nowrap">{isSayisi} iş</span>}
                    {bagli && <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#F26B6F] text-white grid place-items-center"><ArrowRight className="w-3 h-3" /></span>}
                  </div>
                  <div className={`text-[12px] font-semibold leading-tight text-center break-words max-w-[130px] ${YAZI}`}>{n.ad}</div>
                  {n.alt && <div className={`-mt-1 text-[10.5px] leading-tight text-center break-words max-w-[130px] ${IKINCIL}`}>{n.alt}</div>}
                  {n.durum === 'istenen' && <div className={`font-mono text-[9.5px] border border-dashed rounded px-1 ${IKINCIL} border-current`}>istenen</div>}
                </div>
              );
            })}
          </div>
        )}

        <div data-arac className="absolute left-2 bottom-2 flex gap-1.5">
          <button type="button" onClick={sigdir} className={`${DUGME_BOS} bg-[#FAF8F5] dark:bg-[#13204A]`} aria-label="Hepsini göster"><Maximize2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => ortadanZumla(1.25)} className={`${DUGME_BOS} bg-[#FAF8F5] dark:bg-[#13204A]`} aria-label="Yakınlaş"><Plus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => ortadanZumla(0.8)} className={`${DUGME_BOS} bg-[#FAF8F5] dark:bg-[#13204A]`} aria-label="Uzaklaş"><Minus className="w-3.5 h-3.5" /></button>
        </div>

        {sec && (
          <aside data-arac className={`${KART} absolute right-2 left-2 bottom-2 sm:left-auto sm:top-2 sm:bottom-auto sm:w-[300px] max-h-[55%] sm:max-h-[calc(100%-16px)] overflow-auto p-3 space-y-2 shadow-lg cursor-auto`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className={ETIKET}>{(TURLER[sec.tur || 'arac'] || TURLER.arac).ad}{sec.durum === 'istenen' ? ' · istenen (henüz yok)' : ''}</div>
                <h3 className={`text-[14px] font-semibold leading-tight ${YAZI}`}>{sec.ad}</h3>
                {sec.alt && <p className={`text-[11.5px] ${IKINCIL}`}>{sec.alt}</p>}
              </div>
              <button type="button" onClick={() => setSecili(null)} className={`p-1 ${IKINCIL} cursor-pointer`} aria-label="Kapat"><X className="w-4 h-4" /></button>
            </div>
            {grubu && <p className={`text-[11.5px] ${IKINCIL}`}>{asamasi ? `${asamasi} · ` : ''}{grubu.ad}</p>}
            {sec.not && <p className={`text-[12px] leading-snug ${YAZI}`}>{sec.not}</p>}
            {sec.ajan && elindeki(sec.ajan).length > 0 && (
              <div>
                <div className={ETIKET}>Elindeki işler ({elindeki(sec.ajan).length})</div>
                <ul className="mt-1 space-y-0.5">
                  {elindeki(sec.ajan).slice(0, 5).map(i => <li key={i.id} className={`text-[11.5px] leading-snug line-clamp-2 ${YAZI}`}>{i.durum === 'calisiyor' ? '● ' : '○ '}{i.metin}</li>)}
                </ul>
                {elindeki(sec.ajan).length > 5 && <p className={`text-[11px] ${IKINCIL}`}>… ve {elindeki(sec.ajan).length - 5} iş daha (İşler ve takvim)</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {sec.ajan && onAjan && <button type="button" onClick={() => onAjan(sec.ajan!)} className={DUGME_LAC}><Bot className="w-3.5 h-3.5" /> {ajanAdi(sec.ajan)} kartı</button>}
              {sec.git && onGit && <button type="button" onClick={() => onGit(sec.git!)} className={DUGME_LAC}>KKM'de aç <ArrowRight className="w-3.5 h-3.5" /></button>}
            </div>
            {komsu && (komsu.once.length > 0 || komsu.sonra.length > 0) && (
              <div className="space-y-1.5 text-[11.5px]">
                {([['Önce', komsu.once], ['Sonra', komsu.sonra]] as const).map(([ad, l]) => l.length > 0 && (
                  <div key={ad} className="flex flex-wrap items-center gap-1">
                    <span className={`w-12 ${IKINCIL}`}>{ad}</span>
                    {l.map(n => <button key={n.id} type="button" onClick={() => kutuyaGit(n.id)} className={`px-2 py-0.5 rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI} hover:border-[#F26B6F] cursor-pointer`}>{n.ad}</button>)}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
      <p hidden={gorunum !== 'cizim'} className={`text-[11px] ${IKINCIL}`}>Parmakla kaydır, iki parmakla yakınlaştır. Kırmızı oklu kutular bir yere bağlı; lacivert sayı ajanın elindeki iş. Çizim şimdilik iş akışı sayfasında (tuval) değişir; Kems buraya aktarır.</p>
    </div>
  );
};

type Elindeki = (ajan?: string) => Array<{ id: string; metin: string; durum: string }>;

/** Okunur liste: aşama aşama, bölüm bölüm (tuvaldeki "Sayfa" gibi) */
const AkisListesi: React.FC<{ cizim: Cizim; odakAjan: string; istenenGizle: boolean; elindeki: Elindeki; onGit?: (h: string) => void; onAjan?: (a: string) => void; onCizimde: (id: string) => void }> = ({ cizim, odakAjan, istenenGizle, elindeki, onGit, onAjan, onCizimde }) => {
  const sirali = [...cizim.gruplar].sort((a, b) => (a.sira || 0) - (b.sira || 0));
  const asamalar = [...cizim.asamalar.map(a => ({ id: a.id as string | null, ad: a.ad })), { id: null, ad: 'Aşamasız' }];
  let no = 0;
  return (
    <div className="space-y-4">
      {asamalar.map((a, ai) => {
        const gs = sirali.filter(g => (g.asama ?? null) === a.id || (a.id === null && !cizim.asamalar.some(x => x.id === g.asama)));
        const gorunen = gs.map(g => ({ g, ns: cizim.dugumler.filter(n => n.grup === g.id && !(istenenGizle && n.durum === 'istenen')).sort((x, y) => x.x - y.x || x.y - y.y) }))
          .filter(x => !odakAjan || x.ns.some(n => n.ajan === odakAjan));
        if (!gorunen.length) return null;
        return (
          <section key={a.id ?? 'yok'} className="space-y-2">
            <h3 className={`${ETIKET} flex items-center gap-2`}>{a.id ? `${ai + 1}. ` : ''}{a.ad}<span className="flex-1 h-px bg-[#CFC5B4] dark:bg-[#2C3C72]" /></h3>
            {gorunen.map(({ g, ns }) => {
              no += 1;
              const r = RENKLER[g.renk || 'gri'] || RENKLER.gri;
              return (
                <article key={g.id} className={`${KART} p-3 space-y-2`} style={{ borderLeft: `4px solid ${r}` }}>
                  <div>
                    <b className={`text-[13.5px] ${YAZI}`}>{sirali.indexOf(g) + 1}. {g.ad}</b>
                    {g.not && <p className={`text-[11.5px] leading-snug ${IKINCIL}`}>{g.not}</p>}
                  </div>
                  <ul className="space-y-1">
                    {ns.map(n => {
                      const t = TURLER[n.tur || 'arac'] || TURLER.arac;
                      const is = elindeki(n.ajan).length;
                      return (
                        <li key={n.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] ${YAZI} ${odakAjan && n.ajan !== odakAjan ? 'opacity-50' : ''}`}>
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.renk }} title={t.ad} />
                          <button type="button" onClick={() => onCizimde(n.id)} className="font-semibold hover:text-[#F26B6F] cursor-pointer text-left">{n.ad}</button>
                          {n.alt && <span className={IKINCIL}>{n.alt}</span>}
                          {n.durum === 'istenen' && <span className={`font-mono text-[9.5px] border border-dashed rounded px-1 ${IKINCIL}`}>istenen</span>}
                          {is > 0 && <span className="text-[10.5px] font-semibold text-[#F26B6F]">{is} iş</span>}
                          {n.ajan && onAjan && <button type="button" onClick={() => onAjan(n.ajan!)} className="text-[11px] underline cursor-pointer">kartı</button>}
                          {n.git && onGit && <button type="button" onClick={() => onGit(n.git!)} className="text-[11px] underline cursor-pointer">KKM'de aç</button>}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </section>
        );
      })}
      {no === 0 && <p className={`text-[12px] ${IKINCIL}`}>Bu süzgeçle gösterilecek bölüm yok.</p>}
    </div>
  );
};

/** Eşleşme (13 Kasım, Kemal: "ajanlar ve ekranlar eşleşti mi"): her ajanın akışta kutusu, her KKM ekranının akışta geçip geçmediği */
const Eslesme: React.FC<{ veriler: Partial<Record<CizimId, Cizim | { hata: string }>>; elindeki: Elindeki; onAjan?: (a: string) => void; onGit?: (h: string) => void; onCizimde: (c: CizimId, id: string) => void }> = ({ veriler, elindeki, onAjan, onGit, onCizimde }) => {
  const resmi = veriler.resmi && 'dugumler' in veriler.resmi ? veriler.resmi : null;
  const ekranlar = veriler.ekranlar && 'dugumler' in veriler.ekranlar ? veriler.ekranlar : null;
  if (!resmi || !ekranlar) return <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Çizimler okunuyor…</p>;
  const ajanlar = Object.keys(AJAN_ADLARI).map(a => ({ a, ns: resmi.dugumler.filter(n => n.ajan === a) }));
  const ekranSayisi = new Map<string, number>();
  for (const n of resmi.dugumler) if (n.git) ekranSayisi.set(n.git, (ekranSayisi.get(n.git) || 0) + 1);
  const eksikAjan = ajanlar.filter(x => !x.ns.length).length;
  const eksikEkran = ekranlar.dugumler.filter(n => n.git && !ekranSayisi.get(n.git)).length;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className={`${KART} p-3 space-y-2`}>
        <div className={ETIKET}>Ajanlar · resmi akışta</div>
        <p className={`text-[12px] ${YAZI}`}>{ajanlar.length - eksikAjan}/{ajanlar.length} ajanın akışta kutusu var{eksikAjan ? `; ${eksikAjan} ajan akışta yok.` : '.'}</p>
        <ul className="space-y-1">
          {ajanlar.map(({ a, ns }) => (
            <li key={a} className={`flex flex-wrap items-center gap-x-2 text-[12px] ${YAZI}`}>
              <span className={`w-4 text-center font-bold ${ns.length ? 'text-[#3C8D5A] dark:text-[#7BC49A]' : 'text-[#D6484C]'}`}>{ns.length ? '✓' : '!'}</span>
              <button type="button" onClick={() => onAjan?.(a)} className="font-semibold hover:text-[#F26B6F] cursor-pointer">{ajanAdi(a)}</button>
              <span className={IKINCIL}>{ns.length ? `${ns.length} kutu` : 'akışta yok'}{elindeki(a).length ? ` · elinde ${elindeki(a).length} iş` : ''}</span>
              {ns[0] && <button type="button" onClick={() => onCizimde('resmi', ns[0].id)} className="text-[11px] underline cursor-pointer">çizimde</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className={`${KART} p-3 space-y-2`}>
        <div className={ETIKET}>KKM ekranları · resmi akışta geçiyor mu</div>
        <p className={`text-[12px] ${YAZI}`}>{ekranlar.dugumler.length - eksikEkran}/{ekranlar.dugumler.length} ekran akışta geçiyor{eksikEkran ? `; ${eksikEkran} ekran hiçbir adımda yok.` : '.'}</p>
        <ul className="space-y-1">
          {ekranlar.dugumler.map(n => {
            const say = n.git ? ekranSayisi.get(n.git) || 0 : 0;
            const g = ekranlar.gruplar.find(x => x.id === n.grup);
            return (
              <li key={n.id} className={`flex flex-wrap items-center gap-x-2 text-[12px] ${YAZI}`}>
                <span className={`w-4 text-center font-bold ${say ? 'text-[#3C8D5A] dark:text-[#7BC49A]' : 'text-[#D6484C]'}`}>{say ? '✓' : '–'}</span>
                <button type="button" onClick={() => n.git && onGit?.(n.git)} className="font-semibold hover:text-[#F26B6F] cursor-pointer">{g && g.ad !== n.ad ? `${g.ad} → ` : ''}{n.ad}</button>
                <span className={IKINCIL}>{say ? `${say} adımda` : 'akışta yok'}</span>
              </li>
            );
          })}
        </ul>
        <p className={`text-[11px] ${IKINCIL}`}>"Akışta yok" hata değil: o ekranı hiçbir ajan adımı kullanmıyor demek. Eklenmesi gerekiyorsa tuvalde kutu eklenir.</p>
      </section>
    </div>
  );
};

export default IsAkisi;
