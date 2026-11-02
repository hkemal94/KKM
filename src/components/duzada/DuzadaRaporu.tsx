import React, { useState, useMemo } from 'react';
import {
  Printer, Copy, Check, Download, FileText, MapPin, Compass, Building, Calendar, Search, Users
} from 'lucide-react';
import type { Item } from '../../types';
import { ADA_OLCULERI, evrenRaporu, kisiTanimi, raporMarkdown, type RaporMaddesi } from '../../lib/evrenRaporu';

/**
 * Düzada Evren Raporu (6 Ekim Kemal ekledi; 7 Ekim: içerik kayıtlardan).
 * Ekran, .md ve PDF aynı yapıyı (`lib/evrenRaporu.ts`) gösterir; elle
 * yazılmış kurgu cümlesi yok, boş olan "boş" görünür.
 */

type BolumSekmesi = 'hepsi' | 'ada' | 'mahalleler' | 'varliklar' | 'tarihce';

interface DuzadaRaporuProps {
  items: Item[];
  onMaddeSec?: (id: string) => void;
  onHaritayaGit?: () => void;
}

const BOS = <span className="italic text-[#8A7F6E]">boş</span>;
const DUGME = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#17345A] border border-[#CFC5B4] dark:border-[#2C3C72] text-[11px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-stone-100 dark:hover:bg-[#2C3C72] cursor-pointer transition-colors';

const Baslik: React.FC<{ simge: React.ReactNode; children: React.ReactNode }> = ({ simge, children }) => (
  <div className="flex items-center gap-2 text-[#0E1C4F]">
    {simge}
    <h2 className="text-base font-bold tracking-tight">{children}</h2>
  </div>
);

const Kunye: React.FC<{ m: RaporMaddesi | null }> = ({ m }) => !m?.kunye.length ? null : (
  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
    {m.kunye.map(f => (
      <React.Fragment key={f.id + f.label}>
        <dt className="font-semibold text-[#0E1C4F]">{f.label}</dt>
        <dd className="text-[#3B3A36]">{f.value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

export const DuzadaRaporu: React.FC<DuzadaRaporuProps> = ({ items, onMaddeSec }) => {
  const [gorunum, setGorunum] = useState<'belge' | 'markdown'>('belge');
  const [aktifBolum, setAktifBolum] = useState<BolumSekmesi>('hepsi');
  const [arama, setArama] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const [tumKisiler, setTumKisiler] = useState(false);
  const [pdfDurumu, setPdfDurumu] = useState<'' | 'hazirlaniyor' | 'hata'>('');

  const r = useMemo(() => evrenRaporu(items), [items]);
  const md = useMemo(() => (gorunum === 'markdown' ? raporMarkdown(r) : ''), [gorunum, r]);

  const uyan = (m: RaporMaddesi) => {
    const q = arama.trim().toLocaleLowerCase('tr');
    return !q || [m.ad, m.ozet, m.mahalle, ...m.kunye.map(f => f.value)].some(s => s.toLocaleLowerCase('tr').includes(q));
  };
  const varliklar = [...r.kurumlar, ...r.mekanlar, ...r.yerler, ...r.aileler, ...r.olaylar].filter(uyan);
  const kisiler = r.kisiler.filter(uyan);

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(raporMarkdown(r));
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { /* pano izni yoksa sessiz */ }
  };

  const indirMarkdown = () => {
    const blob = new Blob([raporMarkdown(r)], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `duzada-evren-raporu-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // PDF yazıcı (jsPDF + Poppins) yalnız tıklanınca yüklenir
  const indirPdf = async () => {
    setPdfDurumu('hazirlaniyor');
    try {
      const { evrenRaporuPdf } = await import('../../lib/raporPdf');
      await evrenRaporuPdf(items);
      setPdfDurumu('');
    } catch (e) {
      console.error('PDF hazırlanamadı:', e);
      setPdfDurumu('hata');
    }
  };

  const gorunur = (id: BolumSekmesi) => aktifBolum === 'hepsi' || aktifBolum === id;

  return (
    <div className="space-y-4">
      {/* Üst çubuk (yazdırmada gizli) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#0E1C4F] dark:text-[#F3EFE8] leading-tight">Düzada Evren Raporu</h2>
            <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Vikideki {r.sayilar.toplam} maddeden; ekran, .md ve PDF aynı</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] p-0.5 bg-white/70 dark:bg-[#0B132B]">
            {(['belge', 'markdown'] as const).map(g => (
              <button key={g} type="button" onClick={() => setGorunum(g)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${gorunum === g ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white' : 'text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#0E1C4F]'}`}>
                {g === 'belge' ? 'Belge' : 'Ham metin'}
              </button>
            ))}
          </div>
          <button type="button" onClick={kopyala} className={DUGME} title="Metni kopyala">
            {kopyalandi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <button type="button" onClick={indirMarkdown} className={DUGME} title="Metin dosyası olarak indir">
            <Download className="w-3.5 h-3.5" /> .md
          </button>
          <button type="button" onClick={() => void indirPdf()} disabled={pdfDurumu === 'hazirlaniyor'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] hover:opacity-90 text-[#F3EFE8] text-[11px] font-semibold cursor-pointer shadow-xs">
            <Download className="w-3.5 h-3.5 text-[#F26B6F]" />
            {pdfDurumu === 'hazirlaniyor' ? 'Hazırlanıyor…' : 'PDF indir'}
          </button>
          <button type="button" onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F26B6F] hover:bg-[#E05357] text-white text-[11px] font-semibold shadow-xs cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> Yazdır
          </button>
        </div>
        {pdfDurumu === 'hata' && (
          <p className="w-full text-[12px] text-[#D6484C] dark:text-[#F26B6F]">PDF hazırlanamadı (yazı tipi yüklenemedi olabilir). Bağlantını kontrol edip yeniden dene.</p>
        )}
      </div>

      {gorunum === 'belge' && (
        <div className="print:hidden flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
          {([
            ['hepsi', 'Tüm belge'], ['ada', 'Ada'], ['mahalleler', `Mahalleler (${r.mahalleler.length})`],
            ['varliklar', 'Kurumlar, mekânlar, kişiler'], ['tarihce', 'Tarihçe']
          ] as const).map(([id, ad]) => (
            <button key={id} type="button" onClick={() => setAktifBolum(id)}
              className={`px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap ${aktifBolum === id
                ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white font-bold'
                : 'bg-white/80 dark:bg-[#13204A]/60 text-[#6A5E4C] dark:text-[#A6B0C9] border border-[#CFC5B4]/50 hover:bg-stone-100'}`}>
              {ad}
            </button>
          ))}
        </div>
      )}

      {gorunum === 'markdown' && (
        <textarea readOnly value={md} rows={24}
          className="w-full font-mono text-[11px] leading-relaxed p-3.5 rounded-2xl bg-white dark:bg-[#081029] border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] resize-y focus:outline-hidden" />
      )}

      {gorunum === 'belge' && (
        <div className="bg-white dark:bg-[#FAF8F5] text-[#0E1C4F] rounded-2xl border border-[#CFC5B4] dark:border-stone-400 p-6 sm:p-10 shadow-sm max-w-5xl mx-auto print:max-w-none print:m-0 print:p-0 print:border-none print:shadow-none print:rounded-none">
          <header className="pb-6 border-b-2 border-[#0E1C4F] flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded-xs bg-[#0E1C4F] text-white text-[10px] font-bold tracking-[0.15em] uppercase">Evren raporu</span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">Düzada Evren Raporu</h1>
              <p className="mt-0.5 text-[12px] text-[#6A5E4C]">Ada, mahalleler, kurumlar, mekânlar, kişiler ve tarihçe — vikideki kayıtlardan</p>
            </div>
            <div className="text-right text-[11px] text-[#6A5E4C]">{r.tarih}</div>
          </header>

          {gorunur('ada') && (
            <section className="py-5 border-b border-[#E5DFD5] space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5DFD5]">
                {([['Viki maddesi', r.sayilar.toplam], ['Kişi', r.sayilar.kisi], ['Mekân ve kurum', r.sayilar.mekan + r.sayilar.kurum], ['Mahalle', r.mahalleler.length]] as const).map(([a, n]) => (
                  <div key={a}>
                    <div className="text-[10px] uppercase tracking-wider text-[#6A5E4C]">{a}</div>
                    <div className="text-xl font-black tabular-nums mt-0.5">{n}</div>
                  </div>
                ))}
              </div>
              <Baslik simge={<Compass className="w-4 h-4 text-[#F26B6F]" />}>Ada</Baslik>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                {[...ADA_OLCULERI, ...(r.ada?.kunye || []).map(f => [f.label, f.value] as [string, string])].map(([a, d]) => (
                  <React.Fragment key={a}><dt className="font-semibold">{a}</dt><dd className="text-[#3B3A36]">{d}</dd></React.Fragment>
                ))}
              </dl>
              <p className="text-[12px] leading-relaxed text-[#3B3A36]">{r.ada?.ozet || BOS}</p>
            </section>
          )}

          {gorunur('mahalleler') && (
            <section className="py-5 border-b border-[#E5DFD5] space-y-3">
              <Baslik simge={<MapPin className="w-4 h-4 text-[#F26B6F]" />}>Mahalleler</Baslik>
              {!r.mahalleler.length && <p className="text-[12px]">{BOS}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {r.mahalleler.map(m => (
                  <button key={m.id} type="button" onClick={() => onMaddeSec?.(m.id)}
                    className="text-left flex flex-col justify-start p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5DFD5] hover:border-[#0E1C4F] space-y-1.5 cursor-pointer">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-bold text-[14px]">{m.ad}</h3>
                      <span className="text-[10px] text-[#6A5E4C] shrink-0">{m.maddeSayisi} madde</span>
                    </div>
                    <Kunye m={m} />
                    <p className="text-[11px] text-[#3B3A36] leading-snug">{m.ozet || BOS}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {gorunur('varliklar') && (
            <section className="py-5 border-b border-[#E5DFD5] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Baslik simge={<Building className="w-4 h-4 text-[#F26B6F]" />}>Kurumlar, mekânlar, aileler, olaylar</Baslik>
                <div className="relative print:hidden">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#6A5E4C]" />
                  <input type="text" value={arama} onChange={e => setArama(e.target.value)} placeholder="Süz…"
                    className="pl-7 pr-2.5 py-1 text-[11px] rounded-lg border border-[#CFC5B4] bg-white text-[#0E1C4F] focus:outline-hidden" />
                </div>
              </div>
              {!varliklar.length && <p className="text-[12px]">{BOS}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {varliklar.map(m => (
                  <button key={m.id} type="button" onClick={() => onMaddeSec?.(m.id)}
                    className="text-left flex flex-col justify-start p-2.5 rounded-lg border border-[#E5DFD5] hover:border-[#0E1C4F] bg-white cursor-pointer">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-[#D6484C]">{m.tur}</span>
                      <span className="text-[#6A5E4C] truncate">{m.mahalle}</span>
                    </div>
                    <div className="font-bold text-[12px] mt-1">{m.ad}</div>
                    <p className="text-[11px] text-[#555] line-clamp-2 mt-0.5">{m.ozet || BOS}</p>
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-[#E5DFD5] space-y-2">
                <div className="flex items-center justify-between">
                  <Baslik simge={<Users className="w-4 h-4 text-[#F26B6F]" />}>Kişiler ({kisiler.length})</Baslik>
                  {kisiler.length > 24 && (
                    <button type="button" onClick={() => setTumKisiler(t => !t)} className="print:hidden text-[11px] text-[#D6484C] hover:underline cursor-pointer">
                      {tumKisiler ? 'Daralt' : `Hepsini göster (${kisiler.length})`}
                    </button>
                  )}
                </div>
                {!kisiler.length && <p className="text-[12px]">{BOS}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(tumKisiler ? kisiler : kisiler.slice(0, 24)).map(k => (
                    <button key={k.id} type="button" onClick={() => onMaddeSec?.(k.id)}
                      className="text-left p-2 rounded-lg border border-[#E5DFD5] hover:border-[#0E1C4F] bg-[#FAF8F5] cursor-pointer">
                      <div className="font-semibold text-[11px] truncate">{k.ad}</div>
                      <div className="text-[10px] text-[#6A5E4C] truncate">{kisiTanimi(k) || k.mahalle || '—'}</div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {gorunur('tarihce') && (
            <section className="py-5 space-y-3">
              <Baslik simge={<Calendar className="w-4 h-4 text-[#F26B6F]" />}>Tarihçe</Baslik>
              <p className="text-[11px] text-[#6A5E4C]">Maddelerin künyesindeki tarihler.</p>
              {!r.tarihce.length && <p className="text-[12px]">{BOS}</p>}
              <ul className="border-l-2 border-[#0E1C4F] ml-2 pl-3 space-y-1.5 text-[11px]">
                {r.tarihce.map((t, n) => (
                  <li key={n}>
                    <b className="text-[#D6484C]">{t.tarih}</b>{' · '}
                    <button type="button" onClick={() => onMaddeSec?.(t.maddeId)} className="font-semibold hover:underline cursor-pointer">{t.madde}</button>
                    <span className="text-[#6A5E4C]"> ({t.alan.toLocaleLowerCase('tr')})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="pt-6 border-t-2 border-[#0E1C4F] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6A5E4C]">
            <div>Taslak: {r.sayilar.taslak}</div>
            <div>Kems Komuta Merkezi · Düzada</div>
          </footer>
        </div>
      )}
    </div>
  );
};
