import React, { useEffect, useState } from 'react';
import { YazimPaneli } from '../wiki/YazimPaneli';
import { ArrowDown, ArrowUp, Download, Plus, Printer, Save, Trash2 } from 'lucide-react';
import type { Item } from '../../types';
import { FANZIN_TONLARI, fanzinBilgisi, type FanzinBilgisi, type FanzinBolumu } from '../../lib/studyo';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Aylık fanzin (yapisal-2, 31; yapisal-4, 29–32).
 *
 *   - Taslak her ayın ilk günü gece stüdyoda hazırlanır, öneri tepsisine düşer;
 *     Kemal "Fanzin olarak aç" deyince burada bir yazı olur.
 *   - Görünüm temiz dergi. Fanzinin adı yok (Kemal koyacak); bölümler serbest.
 *   - Her bölümün tonu ayrı seçilir; yeniden yazımı stüdyo yapar ("✨").
 *   - Çıktılar: PDF (yazdır → PDF olarak kaydet), Instagram karuseli
 *     (1080 × 1350 PNG'ler). "Sitede göster" 2 Kasım'da site kalkınca gitti.
 *
 * Kayda yalnız "Kaydet" düğmesiyle yazılır.
 */

interface Props {
  yazi: Item;
  onUpdateItem: (item: Item) => Promise<void>;
  /** Metinde tanıma (4. gece): anılan maddeler için kayıtlar ve açma */
  items?: Item[];
  onMaddeAc?: (id: string) => void;
  /** Yazım panelinde "Madde aç" (7. gece) */
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
}

const yeniBolum = (): FanzinBolumu => ({ id: `b${Date.now()}`, baslik: '', metin: '', ton: 'Sade' });

export const Fanzin: React.FC<Props> = ({ yazi, onUpdateItem, items, onMaddeAc, onAddItem }) => {
  const kayitli = fanzinBilgisi(yazi) || { ay: '', bolumler: [] };
  const [f, setF] = useState<FanzinBilgisi>(kayitli);
  const [baslik, setBaslik] = useState(yazi.title);
  const [gorunum, setGorunum] = useState<'duzen' | 'dergi'>('duzen');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const imza = JSON.stringify(kayitli) + yazi.title;
  // Stüdyodan "Bölümün yerine koy" gelince ekran da yenilensin
  useEffect(() => { setF(fanzinBilgisi(yazi) || { ay: '', bolumler: [] }); setBaslik(yazi.title); }, [imza]); // eslint-disable-line react-hooks/exhaustive-deps

  const degisti = JSON.stringify(f) !== JSON.stringify(kayitli) || baslik !== yazi.title;
  const bolumYaz = (id: string, d: Partial<FanzinBolumu>) => setF(x => ({ ...x, bolumler: x.bolumler.map(b => (b.id === id ? { ...b, ...d } : b)) }));
  const tasi = (i: number, yon: -1 | 1) => setF(x => {
    const j = i + yon;
    if (j < 0 || j >= x.bolumler.length) return x;
    const b = x.bolumler.slice();
    [b[i], b[j]] = [b[j], b[i]];
    return { ...x, bolumler: b };
  });

  const kaydet = async () => {
    await onUpdateItem({ ...yazi, title: baslik.trim() || yazi.title, metadata: { ...yazi.metadata, fanzin: f }, updatedAt: Date.now() });
    setMesaj('Kaydedildi.');
  };

  const girdi = `w-full bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-3 py-2 focus:outline-hidden focus:border-[#F26B6F]`;

  return (
    <div className="space-y-4">
      <div className={`${KART} p-4 flex flex-wrap items-center gap-2`}>
        <div className="flex-1 min-w-[220px]">
          <div className={ETIKET}>Fanzin · adı yok, Kemal koyacak</div>
          <input value={baslik} onChange={e => setBaslik(e.target.value)} className={`mt-1 text-[20px] font-bold ${girdi}`} aria-label="Fanzin başlığı" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setGorunum(g => (g === 'duzen' ? 'dergi' : 'duzen'))} className={DUGME_BOS}>
            {gorunum === 'duzen' ? 'Dergi görünümü' : 'Düzenle'}
          </button>
          <button type="button" disabled={!degisti} onClick={() => void kaydet()} className={`${DUGME_LAC} inline-flex items-center gap-1`}><Save className="w-3.5 h-3.5" /> Kaydet</button>
        </div>
        <div className="w-full flex flex-wrap gap-1.5 pt-2 border-t border-[#E4DCCD] dark:border-[#2C3C72]">
          <span className={`self-center mr-1 ${ETIKET}`}>Çıktı</span>
          <button type="button" onClick={() => pdfYazdir(baslik, f)} className={`${DUGME_BOS} inline-flex items-center gap-1`}>
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button type="button" onClick={() => void karuselIndir(baslik, f)} className={`${DUGME_BOS} inline-flex items-center gap-1`}>
            <Download className="w-3.5 h-3.5" /> Instagram karuseli
          </button>
          {degisti && <span className="self-center text-[11px] text-[#D6484C]">Kaydedilmemiş değişiklik var; çıktılar ekrandakini kullanır.</span>}
          {mesaj && !degisti && <span className={`self-center text-[11px] ${IKINCIL}`}>{mesaj}</span>}
        </div>
      </div>

      {gorunum === 'dergi' ? <DergiGorunumu baslik={baslik} f={f} /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
        <div className="space-y-3 min-w-0">
          {f.bolumler.map((b, i) => (
            <section key={b.id} className={`${KART} p-4 space-y-2`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-[12px] ${IKINCIL}`}>{String(i + 1).padStart(2, '0')}</span>
                <input value={b.baslik} onChange={e => bolumYaz(b.id, { baslik: e.target.value })} placeholder="Bölüm başlığı" className={`flex-1 min-w-[160px] text-[15px] font-semibold ${girdi}`} />
                <button type="button" aria-label="Yukarı" onClick={() => tasi(i, -1)} className={DUGME_BOS}><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Aşağı" onClick={() => tasi(i, 1)} className={DUGME_BOS}><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Bölümü sil" onClick={() => setF(x => ({ ...x, bolumler: x.bolumler.filter(y => y.id !== b.id) }))} className={DUGME_BOS}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <textarea value={b.metin} onChange={e => bolumYaz(b.id, { metin: e.target.value })} rows={5} className={`text-[14px] leading-relaxed ${girdi}`} />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] ${IKINCIL}`}>Ton</span>
                <select value={b.ton} onChange={e => bolumYaz(b.id, { ton: e.target.value })} className={`text-[12px] bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2 py-1 focus:outline-hidden focus:border-[#F26B6F]`}>
                  {FANZIN_TONLARI.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </section>
          ))}
          <button type="button" onClick={() => setF(x => ({ ...x, bolumler: [...x.bolumler, yeniBolum()] }))} className={`${DUGME_BOS} inline-flex items-center gap-1`}>
            <Plus className="w-3.5 h-3.5" /> Bölüm ekle
          </button>
        </div>
          {/* Yazım paneli (7. gece): yazarken anılanlar, künye, arama, maddesiz adlar */}
          {items && <YazimPaneli metin={f.bolumler.map(b => `${b.baslik}\n\n${b.metin}`).join('\n\n')} items={items} onMaddeAc={onMaddeAc} onAddItem={onAddItem} kaynakId={yazi.id} className="lg:sticky lg:top-4" />}
        </div>
      )}
    </div>
  );
};

/** Temiz dergi: krem kâğıt, büyük başlık, iki sütun metin */
export const DergiGorunumu: React.FC<{ baslik: string; f: FanzinBilgisi }> = ({ baslik, f }) => (
  <article className="rounded-2xl bg-[#FAF8F5] text-[#0E1C4F] border border-[#CFC5B4] px-6 sm:px-12 py-10 sm:py-14 shadow-[0_20px_50px_-30px_rgba(14,28,79,.35)]">
    <header className="border-b-2 border-[#0E1C4F] pb-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#F26B6F]">Kems Company · Fanzin</div>
      <h1 className="mt-2 text-[34px] sm:text-[52px] font-extrabold leading-[0.95] tracking-tight">{baslik}</h1>
    </header>
    <div className="mt-8 sm:columns-2 gap-10 [column-rule:1px_solid_#E4DCCD]">
      {f.bolumler.map((b, i) => (
        <section key={b.id} className="break-inside-avoid mb-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#6A5E4C]">{String(i + 1).padStart(2, '0')} · {b.ton}</div>
          <h2 className="mt-1 text-[22px] font-bold leading-tight">{b.baslik || 'Başlıksız bölüm'}</h2>
          {b.metin.split(/\n{2,}/).map((p, k) => <p key={k} className="mt-2 text-[14.5px] leading-relaxed text-[#2A3358]">{p}</p>)}
        </section>
      ))}
    </div>
    <footer className="mt-6 pt-4 border-t border-[#CFC5B4] flex items-end justify-between text-[10px] uppercase tracking-[0.2em] text-[#6A5E4C]">
      <span className="font-extrabold text-[14px] tracking-tight text-[#0E1C4F] normal-case">KEMS <span className="bg-[#F26B6F] text-white text-[8px] px-1.5 py-px tracking-[0.3em] align-middle">COMPANY</span></span>
      <span lang="en">Made with Culture · Est. 2025</span>
    </footer>
  </article>
);

// ---------------------------------------------------------------- çıktılar

const kacis = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** PDF: yazdırma penceresi açılır; "PDF olarak kaydet" seçilir */
export function pdfYazdir(baslik: string, f: FanzinBilgisi) {
  const w = window.open('', '_blank');
  if (!w) { alert('Açılır pencere engellendi; tarayıcıda bu siteye izin ver.'); return; }
  const bolumler = f.bolumler.map((b, i) => `
    <section><div class="k">${String(i + 1).padStart(2, '0')} · ${kacis(b.ton)}</div>
    <h2>${kacis(b.baslik || 'Başlıksız bölüm')}</h2>
    ${b.metin.split(/\n{2,}/).map(p => `<p>${kacis(p)}</p>`).join('')}</section>`).join('');
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${kacis(baslik)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Poppins, sans-serif; color: #0E1C4F; background: #FAF8F5; margin: 0; }
    header { border-bottom: 2px solid #0E1C4F; padding-bottom: 14px; }
    .ust { font-size: 9px; font-weight: 700; letter-spacing: .3em; text-transform: uppercase; color: #F26B6F; }
    h1 { font-size: 40px; line-height: .95; margin: 6px 0 0; font-weight: 800; letter-spacing: -.02em; }
    main { columns: 2; column-gap: 12mm; column-rule: 1px solid #E4DCCD; margin-top: 10mm; }
    section { break-inside: avoid; margin-bottom: 8mm; }
    .k { font-size: 8px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; color: #6A5E4C; }
    h2 { font-size: 17px; margin: 3px 0 0; }
    p { font-size: 10.5px; line-height: 1.6; color: #2A3358; margin: 6px 0 0; }
    footer { margin-top: 6mm; border-top: 1px solid #CFC5B4; padding-top: 3mm; font-size: 8px; letter-spacing: .2em; text-transform: uppercase; color: #6A5E4C; }
  </style></head><body>
  <header><div class="ust">Kems Company · Fanzin</div><h1>${kacis(baslik)}</h1></header>
  <main>${bolumler}</main>
  <footer><span lang="en">Made with Culture · Est. 2025</span></footer>
  <script>document.fonts.ready.then(() => setTimeout(() => print(), 300));</script>
  </body></html>`);
  w.document.close();
}

/** Satırlara böl (tuval) */
function satirlar(c: CanvasRenderingContext2D, metin: string, gen: number): string[] {
  const cikti: string[] = [];
  for (const par of metin.split(/\n+/)) {
    let satir = '';
    for (const k of par.split(/\s+/)) {
      const dene = satir ? `${satir} ${k}` : k;
      if (c.measureText(dene).width > gen && satir) { cikti.push(satir); satir = k; } else satir = dene;
    }
    cikti.push(satir);
    cikti.push('');
  }
  return cikti;
}

/** Karusel görselleri: kapak + her bölüm bir kare (1080 × 1350) */
export async function karuselGorselleri(baslik: string, f: FanzinBilgisi): Promise<string[]> {
  try { await document.fonts.load('800 60px Poppins'); await document.fonts.load('400 30px Poppins'); } catch { /* yoksa sistem yazısı */ }
  const W = 1080, H = 1350, K = 90;
  const kare = () => {
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const c = t.getContext('2d')!;
    return { t, c };
  };
  const imza = (c: CanvasRenderingContext2D, renk: string, n: string) => {
    c.fillStyle = renk; c.font = '800 34px Poppins, sans-serif'; c.textBaseline = 'alphabetic';
    c.fillText('KEMS', K, H - K);
    c.fillStyle = '#F26B6F'; c.fillRect(K, H - K + 10, 128, 26);
    c.fillStyle = '#FFFFFF'; c.font = '700 15px Poppins, sans-serif'; c.fillText('C O M P A N Y', K + 10, H - K + 29);
    c.fillStyle = renk; c.font = '600 22px Poppins, sans-serif'; c.textAlign = 'right'; c.fillText(n, W - K, H - K); c.textAlign = 'left';
  };
  const cikti: string[] = [];
  const toplam = f.bolumler.length + 1;
  // kapak
  {
    const { t, c } = kare();
    c.fillStyle = '#0E1C4F'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#F26B6F'; c.font = '700 26px Poppins, sans-serif'; c.fillText('KEMS COMPANY · FANZİN', K, K + 20);
    c.fillStyle = '#F3EFE8'; c.font = '800 110px Poppins, sans-serif';
    const s = satirlar(c, baslik, W - 2 * K).filter(Boolean);
    s.forEach((x, i) => c.fillText(x, K, 520 + i * 118));
    c.fillStyle = '#A6B0C9'; c.font = '400 30px Poppins, sans-serif';
    f.bolumler.slice(0, 6).forEach((b, i) => c.fillText(`${String(i + 1).padStart(2, '0')}  ${b.baslik}`, K, 520 + s.length * 118 + 60 + i * 46));
    imza(c, '#F3EFE8', `1/${toplam}`);
    cikti.push(t.toDataURL('image/png'));
  }
  f.bolumler.forEach((b, i) => {
    const { t, c } = kare();
    c.fillStyle = '#FAF8F5'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#6A5E4C'; c.font = '700 22px Poppins, sans-serif';
    c.fillText(`${String(i + 1).padStart(2, '0')} · ${b.ton.toLocaleUpperCase('tr')}`, K, K + 20);
    c.fillStyle = '#0E1C4F'; c.font = '800 64px Poppins, sans-serif';
    const bs = satirlar(c, b.baslik || 'Başlıksız bölüm', W - 2 * K).filter(Boolean);
    bs.forEach((x, n) => c.fillText(x, K, K + 120 + n * 72));
    c.fillStyle = '#F26B6F'; c.fillRect(K, K + 120 + bs.length * 72 - 20, 80, 6);
    c.fillStyle = '#2A3358'; c.font = '400 32px Poppins, sans-serif';
    const y0 = K + 150 + bs.length * 72;
    const ms = satirlar(c, b.metin, W - 2 * K);
    const sigan = Math.floor((H - K - 90 - y0) / 46);
    ms.slice(0, sigan).forEach((x, n) => c.fillText(n === sigan - 1 && ms.length > sigan ? `${x} …` : x, K, y0 + n * 46));
    imza(c, '#0E1C4F', `${i + 2}/${toplam}`);
    cikti.push(t.toDataURL('image/png'));
  });
  return cikti;
}

async function karuselIndir(baslik: string, f: FanzinBilgisi) {
  const gorseller = await karuselGorselleri(baslik, f);
  const ad = baslik.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (let i = 0; i < gorseller.length; i++) {
    const a = document.createElement('a');
    a.href = gorseller[i];
    a.download = `${ad || 'fanzin'}-${String(i + 1).padStart(2, '0')}.png`;
    a.click();
    await new Promise(r => setTimeout(r, 250));
  }
}

export default Fanzin;
