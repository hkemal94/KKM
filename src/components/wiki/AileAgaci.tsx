import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '../../types';
import { aileAgaci, type AileAgaci as AileAgaciVerisi, type AileAgaciKisisi } from '../../lib/aileAgaci';
import { adParcalari, agacCizgileri, kisiHarfi, type AgacOlcu } from '../../lib/soyAgaci';
import { maddeGorseli, siluetMi } from '../../lib/maddeGorseli';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import { soyDegeri } from './soyDegeri';

/**
 * Aile maddesinde "Kuşaklar" (24 Kasım, Kemal: B1 "Albüm"; kartlar A1 gibi büyük).
 * En eski kuşak üstte, eşler yan yana (çift çizgi), çocuklar ortalı altta.
 * Başka aileye geçiş uzun çizgiyle değil kartta kısa okla gösterilir
 * ("↗ Demir Ailesi"; basınca o aile açılır). Adı konmamış kişi yalnız soyadıyla,
 * önünde soluk "—" ile yazılır. Dar ekranda kuşak kuşak girintili liste olur.
 * Bu ekran kayda bir şey yazmaz.
 */

export const AILE_OLCU: AgacOlcu = { en: 206, boy: 132, araX: 20, araY: 46, esAra: 26 };

/** Onyılın Türkçe eki: 1890'lar, 1950'ler, 2000'ler */
export const onyil = (yil: number) => {
  const o = Math.floor(yil / 10) * 10;
  const ek: Record<number, string> = { 0: 'ler', 10: 'lar', 20: 'ler', 30: 'lar', 40: 'lar', 50: 'ler', 60: 'lar', 70: 'ler', 80: 'ler', 90: 'lar' };
  return `${o}'${ek[o % 100] ?? 'ler'}`;
};

/** Yıllar: "1951 –", "1928 – 1999" */
export const yilYazisi = (k: { yasamMetni?: string }) => (k.yasamMetni ? k.yasamMetni.replace(/\s*[–—-]\s*/, ' – ').trim() : '');

/** Kişinin adı: adsızda soluk "—" ve soyadı (Kemal, 24 Kasım: "[ad: Kemal]" görünmez) */
export const KisiAdi: React.FC<{ ad: string; className?: string }> = ({ ad, className }) => {
  const p = adParcalari(ad);
  return (
    <span className={className}>
      {p.adsiz && <span className="opacity-40 font-normal mr-1" title="Adı henüz konmadı (ad Kemal'in)">—</span>}
      {p.ad}
    </span>
  );
};

/** Portre dairesi: görsel, yoksa yüzsüz silüet; hayatta olmayanda eski fotoğraf tonu */
export const KisiPortresi: React.FC<{ gorsel?: string; ad: string; olmus?: boolean; boyut?: number; harf?: boolean }> = ({ gorsel, ad, olmus, boyut = 52, harf }) => (
  <span className={`relative shrink-0 rounded-full overflow-hidden grid place-items-center border-2 ${olmus ? 'border-[#B9A27E] bg-[#EFE6D4]' : 'border-[#0E1C4F]/85 dark:border-[#A6B0C9] bg-[#F3EFE8] dark:bg-[#2C3C72]'}`}
    style={{ width: boyut, height: boyut }}>
    {gorsel ? (
      <img src={gorsel} alt="" className={`w-full h-full object-cover object-top ${olmus ? '[filter:grayscale(1)_sepia(0.45)_contrast(1.05)]' : ''}`} />
    ) : harf ? (
      <span className="font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]" style={{ fontSize: boyut * 0.38 }}>{kisiHarfi(ad)}</span>
    ) : (
      <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden>
        <g className={olmus ? 'fill-[#8C7350]' : 'fill-[#0E1C4F] dark:fill-[#F3EFE8]'} fillOpacity={0.28}>
          <circle cx={20} cy={16} r={7.2} />
          <ellipse cx={20} cy={37} rx={14} ry={11} />
        </g>
      </svg>
    )}
  </span>
);

/** Kişinin portresi (silüet yer tutucusu sayılmaz) */
export const portreBul = (i: Item | undefined, items: Item[]) => {
  const g = i ? maddeGorseli(i, items) : undefined;
  return g && !siluetMi(g) ? g : undefined;
};

/** Kartın altındaki etiket: nereden geldi, nereye geçti */
export const yerEtiketi = (k: AileAgaciKisisi): string => {
  if (k.yer === 'gelen') return k.dogumSoyadi ? `evlilikle geldi · doğumda ${k.dogumSoyadi}` : 'evlilikle geldi';
  if (k.yer === 'dogan') return k.dogumSoyadi ? `doğumda ${k.dogumSoyadi}` : 'bu aileden doğdu';
  return '';
};

/** Başka aileye kısa ok; basınca o aile açılır */
export const AileOku: React.FC<{ ad: string; onClick: () => void }> = ({ ad, onClick }) => (
  <button type="button" onClick={e => { e.stopPropagation(); onClick(); }}
    className="inline-flex items-center gap-0.5 max-w-full px-1.5 py-0.5 rounded-full text-[11px] leading-tight bg-[#F26B6F]/10 text-[#B4474B] dark:text-[#F26B6F] hover:bg-[#F26B6F]/20 cursor-pointer">
    <span aria-hidden>↗</span><span className="truncate">{ad}</span>
  </button>
);

const Kart: React.FC<{ k: AileAgaciKisisi; portre?: string; onNavigate: (id: string) => void; style?: React.CSSProperties; className?: string }> = ({ k, portre, onNavigate, style, className = '' }) => {
  const etiket = yerEtiketi(k);
  const yil = yilYazisi(k);
  return (
    <div role="link" tabIndex={0} aria-label={adParcalari(k.ad).ad} onClick={() => onNavigate(k.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(k.id); } }}
      style={style}
      className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer outline-none text-left transition-colors
        ${k.olmus ? 'bg-[#FBF8F1] dark:bg-[#1A2550] border-[#D9CCB3] dark:border-[#3A4A7E]' : 'bg-white dark:bg-[#13204A] border-[#E2D9CA] dark:border-[#2C3C72]'}
        hover:border-[#F26B6F] focus-visible:border-[#F26B6F] ${className}`}>
      <KisiPortresi gorsel={portre} ad={k.ad} olmus={k.olmus} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-snug text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-2"><KisiAdi ad={k.ad} /></div>
        {yil && <div className="text-[13px] text-[#4F4636] dark:text-[#C9D0E0] leading-snug">{yil}</div>}
        {k.rol && <div className="text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-snug truncate">{k.rol.split(/[;(]/)[0].trim()}</div>}
        {(etiket || k.baglar.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {etiket && <span className={`px-1.5 py-0.5 rounded-full text-[11px] leading-tight ${k.yer === 'gelen' ? 'bg-[#0E1C4F]/8 text-[#0E1C4F] dark:bg-[#F3EFE8]/10 dark:text-[#F3EFE8]' : 'bg-[#C99A2E]/15 text-[#6B5320] dark:text-[#E9CF8E]'}`}>{etiket}</span>}
            {k.baglar.map(b => <AileOku key={b.aileId} ad={b.ad} onClick={() => onNavigate(b.aileId)} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export const AileAgaci: React.FC<{ aile: Item; allItems: Item[]; onNavigate: (id: string) => void; agac?: AileAgaciVerisi }> = ({ aile, allItems, onNavigate, agac: verilen }) => {
  const gorselSurumu = useGorselSurumu();
  const kap = useRef<HTMLDivElement>(null);
  const [genislik, setGenislik] = useState(0);
  useEffect(() => {
    const el = kap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setGenislik(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const o = AILE_OLCU;
  const agac = useMemo(() => verilen ?? aileAgaci(aile, allItems, soyDegeri, o), [verilen, aile, allItems, o]);
  // Ağaç sütuna sığmazsa biraz küçülür; çok küçülecekse (ya da telefonda) kuşak listesi olur
  const olcek = genislik && agac.en > genislik ? genislik / agac.en : 1;
  const dar = genislik > 0 && (genislik < 520 || olcek < 0.74);
  const madde = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);
  const portreler = useMemo(() => new Map(agac.kisiler.map(k => [k.id, portreBul(madde.get(k.id), allItems)] as const)),
    [agac, madde, allItems, gorselSurumu]); // gorselSurumu: galeri görselleri çözülünce yenilenir
  const cizgiler = useMemo(() => agacCizgileri(agac.konum, agac.kenarlar, o), [agac, o]);

  // Kuşaklar (dar ekrandaki liste için)
  const kusaklar = useMemo(() => {
    const m = new Map<number, AileAgaciKisisi[]>();
    for (const k of agac.kisiler) { const n = agac.kusak.get(k.id) ?? 0; m.set(n, [...(m.get(n) || []), k]); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, l], sira) => {
      const yillar = l.map(k => k.yasam?.bas).filter((y): y is number => y !== undefined);
      return { n, sira, kisiler: l.sort((a, b) => (agac.konum.get(a.id)?.x ?? 0) - (agac.konum.get(b.id)?.x ?? 0)), onyil: yillar.length ? onyil(Math.min(...yillar)) : '' };
    });
  }, [agac]);
  const esi = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of agac.kenarlar) if (k.tur === 'eşi') { m.set(k.a, [...(m.get(k.a) || []), k.b]); m.set(k.b, [...(m.get(k.b) || []), k.a]); }
    return m;
  }, [agac]);

  if (!agac.kisiler.length) {
    return (
      <section className="mb-8" ref={kap}>
        <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-3 tracking-tight">Kuşaklar</h2>
        <p className="text-[13px] text-gri dark:text-bej/80">Henüz üye yok. Bir kişinin künyesinde "Aile" ya da "Soyadı" alanına bu ailenin adı yazılınca burada görünür.</p>
      </section>
    );
  }

  return (
    <section className="mb-8" ref={kap}>
      <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-3 tracking-tight">Kuşaklar</h2>
      {dar ? (
        // Telefon: kuşak kuşak girintili liste; eşler tek kutuda "evli" ayracıyla
        <ol className="space-y-3">
          {kusaklar.map(g => {
            const gorulen = new Set<string>();
            return (
              <li key={g.n} style={{ marginLeft: Math.min(g.sira, 4) * 12 }} className={g.sira ? 'pl-3 border-l-2 border-[#0E1C4F]/70 dark:border-[#A6B0C9]/70' : ''}>
                <div className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">
                  {g.sira + 1}. kuşak{g.onyil ? ` · ${g.onyil}` : ''}
                </div>
                <div className="space-y-2">
                  {g.kisiler.map(k => {
                    if (gorulen.has(k.id)) return null;
                    gorulen.add(k.id);
                    const eslar = (esi.get(k.id) || []).map(id => g.kisiler.find(x => x.id === id)).filter((x): x is AileAgaciKisisi => !!x && !gorulen.has(x.id));
                    eslar.forEach(e => gorulen.add(e.id));
                    if (!eslar.length) return <Kart key={k.id} k={k} portre={portreler.get(k.id)} onNavigate={onNavigate} />;
                    return (
                      <div key={k.id} className="rounded-2xl border border-[#E2D9CA] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#0E1733] p-1.5 space-y-1">
                        <Kart k={k} portre={portreler.get(k.id)} onNavigate={onNavigate} className="!border-transparent" />
                        {eslar.map(e => (
                          <React.Fragment key={e.id}>
                            <div className="flex items-center gap-2 px-3 text-[10px] tracking-[0.14em] uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">
                              <span className="h-px flex-1 bg-[#CFC5B4] dark:bg-[#2C3C72]" />evli<span className="h-px flex-1 bg-[#CFC5B4] dark:bg-[#2C3C72]" />
                            </div>
                            <Kart k={e} portre={portreler.get(e.id)} onNavigate={onNavigate} className="!border-transparent" />
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div style={{ height: agac.boy * olcek }}>
          <div className="relative mx-auto origin-top-left" style={{ width: agac.en, height: agac.boy, transform: olcek < 1 ? `scale(${olcek})` : undefined }}>
            <svg width={agac.en} height={agac.boy} className="absolute inset-0 overflow-visible" aria-hidden>
              {cizgiler.map(c => c.tur === 'eşi' ? (
                <g key={c.id}>
                  <path d={c.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={6} />
                  <path d={c.d} fill="none" className="stroke-[#F3EFE8] dark:stroke-[#0E1733]" strokeWidth={2.2} />
                </g>
              ) : (
                <path key={c.id} d={c.d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={1.8}
                  strokeDasharray={c.tur === 'kardeşi' ? '3 4' : undefined} />
              ))}
            </svg>
            {agac.kisiler.map(k => {
              const p = agac.konum.get(k.id);
              if (!p) return null;
              return <Kart key={k.id} k={k} portre={portreler.get(k.id)} onNavigate={onNavigate}
                className="absolute" style={{ left: p.x, top: p.y, width: o.en, height: o.boy }} />;
            })}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-gri dark:text-bej/80 leading-relaxed">
        En eski kuşak üstte. Çift çizgi evli, dik çizgi çocuğu; sepya portreli soluk kart hayatta olmayan.
        ↗ başka bir aileye geçişi gösterir, basınca o aile açılır. Adı henüz konmamış kişi "— Soyadı" diye yazılır.
      </p>
    </section>
  );
};
