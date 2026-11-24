import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '../../types';
import { aileAgaci, type AileAgaciKisisi } from '../../lib/aileAgaci';
import { maddeGorseli, siluetMi } from '../../lib/maddeGorseli';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import { soyDegeri } from './soyDegeri';

/**
 * Aile sayfasında "Üyeler": portreli kuşak ağacı (24 Kasım, Kemal: "en eski kuşak
 * üstte, eşler yan yana, çocuklar altta; yıllar ve meslek kutuda").
 * Eski düz yazılı kutuların yerine geldi. Üyelik `lib/aileUyeligi.ts`'ten,
 * kuşaklar soy ağacının hesabından (`lib/aileAgaci.ts`). Portresi olmayan
 * kişide yüzsüz silüet çizilir. Kutuya basınca kişinin maddesi açılır.
 * Bu ekran kayda bir şey yazmaz.
 */

interface Olcu { en: number; boy: number; araX: number; araY: number; r: number }
/** Geniş ekran ve telefon ölçüleri (telefonda yatay kaydırma olmasın diye dar) */
const GENIS: Olcu = { en: 118, boy: 162, araX: 22, araY: 46, r: 31 };
const DAR: Olcu = { en: 96, boy: 156, araX: 10, araY: 40, r: 27 };

const LACIVERT = '#0E1C4F';

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
const kisalt = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** Kutuya sığmayan yazı (uzun yıl aralığı) yatayda sıkıştırılır */
const sigdir = (metin: string, boyut: number, enCok: number) =>
  (metin.length * boyut * 0.56 > enCok ? { textLength: enCok, lengthAdjust: 'spacingAndGlyphs' as const } : {});

export const AileAgaci: React.FC<{ aile: Item; allItems: Item[]; onNavigate: (id: string) => void }> = ({ aile, allItems, onNavigate }) => {
  const gorselSurumu = useGorselSurumu();
  const kap = useRef<HTMLDivElement>(null);
  const [dar, setDar] = useState(false);
  useEffect(() => {
    const el = kap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDar(el.clientWidth < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const o = dar ? DAR : GENIS;
  const agac = useMemo(() => aileAgaci(aile, allItems, soyDegeri, o.en, o.boy, o.araX, o.araY), [aile, allItems, o]);
  const madde = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);
  const portreler = useMemo(() => new Map(agac.kisiler.map(k => {
    const i = madde.get(k.id);
    const g = i ? maddeGorseli(i, allItems) : undefined;
    return [k.id, g && !siluetMi(g) ? g : undefined] as const;
  })), [agac, madde, allItems, gorselSurumu]); // gorselSurumu: galeri görselleri çözülünce yenilenir

  const { kisiler, baglar, konum, en, boy } = agac;
  const PAY = 6;
  const pcy = 8 + o.r; // portrenin merkezi (kutunun üstünden)

  const esler = new Set(baglar.filter(b => b.tur === 'eşi').map(b => [b.a, b.b].sort().join('|')));
  const ebeveynleri = new Map<string, string[]>();
  for (const b of baglar) if (b.tur === 'ebeveyni') ebeveynleri.set(b.a, [...(ebeveynleri.get(b.a) || []), b.b]);

  /** Ebeveyn → çocuk: iki eş ebeveynse aralarındaki çizginin ortasından iner */
  const cocukYolu = (cocuk: string, ps: string[]) => {
    const c = konum.get(cocuk)!;
    const cx = c.x + o.en / 2;
    const varolan = ps.filter(p => konum.has(p));
    if (!varolan.length) return '';
    const iki = varolan.length === 2 && esler.has([...varolan].sort().join('|'));
    const a = konum.get(varolan[0])!;
    const ax = iki ? (a.x + konum.get(varolan[1])!.x) / 2 + o.en / 2 : a.x + o.en / 2;
    const ay = iki ? a.y + pcy : a.y + o.boy;
    const orta = c.y - o.araY / 2;
    return `M${ax},${ay} V${orta} H${cx} V${c.y}`;
  };

  const kutu = (k: AileAgaciKisisi) => {
    const p = konum.get(k.id);
    if (!p) return null;
    const g = portreler.get(k.id);
    const adSatirlari = satirlara(k.ad, dar ? 13 : 16);
    const ilkY = pcy + o.r + 16;
    const satirAra = 14;
    const yilY = ilkY + adSatirlari.length * satirAra + 1;
    const etiket = k.etiket === 'dogum' ? 'doğduğu aile' : k.etiket === 'evlilik' ? 'evlilikle' : '';
    const yillar = k.yasamMetni ? k.yasamMetni.replace(/-$/, '–') : '—';
    const etiketY = yilY + (k.rol ? 39 : 26);
    const ac = () => onNavigate(k.id);
    return (
      <g key={k.id} transform={`translate(${p.x} ${p.y})`} role="link" tabIndex={0} aria-label={k.ad} className="cursor-pointer group outline-none"
        onClick={ac} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ac(); } }}>
        <rect width={o.en} height={o.boy} rx={12}
          className="fill-white dark:fill-[#13204A] stroke-[#CFC5B4] dark:stroke-[#2C3C72] group-hover:stroke-[#F26B6F] group-focus-visible:stroke-[#F26B6F]" strokeWidth={1.1} />
        <g transform={`translate(${o.en / 2} ${pcy})`}>
          <circle r={o.r + 2} fill={LACIVERT} fillOpacity={0.9} />
          <circle r={o.r} className="fill-[#F3EFE8] dark:fill-[#2C3C72]" />
          {g ? (
            <image href={g} x={-o.r} y={-o.r} width={o.r * 2} height={o.r * 2} preserveAspectRatio="xMidYMin slice" clipPath={`url(#aile-portre-${o.r})`} />
          ) : (
            // Yüzsüz silüet: portre gelene kadar yer tutucu
            <g clipPath={`url(#aile-portre-${o.r})`} className="fill-[#0E1C4F] dark:fill-[#F3EFE8]" fillOpacity={0.28}>
              <circle cy={-o.r * 0.22} r={o.r * 0.36} />
              <ellipse cy={o.r * 0.82} rx={o.r * 0.7} ry={o.r * 0.55} />
            </g>
          )}
        </g>
        {adSatirlari.map((s, n) => (
          <text key={n} x={o.en / 2} y={ilkY + n * satirAra} textAnchor="middle" fontSize={dar ? 11.5 : 12.5} fontWeight={600}
            className="fill-[#0E1C4F] dark:fill-[#F3EFE8]">{s}</text>
        ))}
        <text x={o.en / 2} y={yilY + 12} textAnchor="middle" fontSize={dar ? 10 : 10.5} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]"
          {...sigdir(yillar, dar ? 10 : 10.5, o.en - 12)}>
          {yillar}
        </text>
        {k.rol && (
          <text x={o.en / 2} y={yilY + 25} textAnchor="middle" fontSize={dar ? 9.5 : 10} className="fill-[#6A5E4C] dark:fill-[#A6B0C9]">
            {kisalt(k.rol.split(/[;,(]/)[0].trim(), dar ? 17 : 21)}
          </text>
        )}
        {etiket && (
          <text x={o.en / 2} y={etiketY} textAnchor="middle" fontSize={9} fontStyle="italic" className="fill-[#B4474B] dark:fill-[#F26B6F]">{etiket}</text>
        )}
        <title>{[k.ad, k.yasamMetni, k.rol, etiket].filter(Boolean).join(' · ')}</title>
      </g>
    );
  };

  return (
    <section className="mb-8" ref={kap}>
      <h2 className="font-sans text-[20px] mb-3">Üyeler</h2>
      {kisiler.length === 0 ? (
        <p className="text-[13px] text-gri dark:text-bej/80">Henüz üye yok. Bir kişinin künyesinde "Aile" ya da "Soyadı" alanına bu ailenin adı yazılınca burada görünür.</p>
      ) : (
        <>
          <div className="rounded-lg border border-bej/50 dark:border-lacivert-600/50 bg-krem-acik/70 dark:bg-lacivert-800/40 px-2 py-3 sm:px-4 sm:py-4">
            <svg viewBox={`${-PAY} ${-PAY} ${en + PAY * 2} ${boy + PAY * 2}`} role="img" aria-label={`${aile.title}: ${kisiler.length} kişi, kuşak ağacı`}
              className="block mx-auto w-full h-auto" style={{ maxWidth: en + PAY * 2 }}>
              <defs>
                <clipPath id={`aile-portre-${o.r}`}><circle cx={0} cy={0} r={o.r} /></clipPath>
              </defs>
              {/* Kardeşler (ortak ebeveyni görünmüyorsa): noktalı */}
              {baglar.filter(b => b.tur === 'kardeşi').map(b => {
                const ortak = (ebeveynleri.get(b.a) || []).some(x => (ebeveynleri.get(b.b) || []).includes(x));
                const a = konum.get(b.a), c = konum.get(b.b);
                if (ortak || !a || !c) return null;
                const ax = a.x + o.en / 2, cx = c.x + o.en / 2, ust = Math.min(a.y, c.y) - Math.min(14, o.araY / 3);
                return <path key={b.id} d={`M${ax},${a.y} V${ust} H${cx} V${c.y}`} fill="none" className="stroke-[#8C7B63] dark:stroke-[#A6B0C9]" strokeWidth={1.6} strokeDasharray="3 4" />;
              })}
              {/* Ebeveyn → çocuk */}
              {[...ebeveynleri.entries()].map(([c, ps]) => (
                <path key={`c-${c}`} d={cocukYolu(c, ps)} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={1.6} />
              ))}
              {/* Eşler: portre hizasında çift çizgi */}
              {baglar.filter(b => b.tur === 'eşi').map(b => {
                const [sol, sag] = [konum.get(b.a), konum.get(b.b)].sort((p, q) => (p?.x ?? 0) - (q?.x ?? 0));
                if (!sol || !sag) return null;
                const d = Math.abs(sol.y - sag.y) < 1
                  ? `M${sol.x + o.en},${sol.y + pcy} H${sag.x}`
                  : `M${sol.x + o.en / 2},${sol.y + o.boy} L${sag.x + o.en / 2},${sag.y}`;
                return (
                  <g key={b.id}>
                    <path d={d} fill="none" className="stroke-[#0E1C4F] dark:stroke-[#A6B0C9]" strokeWidth={5} />
                    <path d={d} fill="none" className="stroke-[#FAF8F5] dark:stroke-[#16295F]" strokeWidth={2} />
                  </g>
                );
              })}
              {kisiler.map(kutu)}
            </svg>
          </div>
          <p className="mt-2 text-[11px] text-gri dark:text-bej/80 leading-relaxed">
            En eski kuşak üstte. Çift çizgi eş, dik çizgi ebeveyn → çocuk. Kutuya basınca kişinin maddesi açılır.
            Üyeler kişilerin künyesinden ("Aile", "Soyadı", "Doğduğu aile") ve bağlarından gelir.
          </p>
        </>
      )}
    </section>
  );
};
