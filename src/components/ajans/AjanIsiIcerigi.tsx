import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { AJANS_DEPOSU } from '../../lib/ajansDeposu';
import { markdownuAyir, satirIci, type Blok } from '../../lib/depoBelgesi';
import type { AjanOnerisi, AjanSorusu } from '../../lib/ajanOnerileri';
import { DUGME_LAC, IKINCIL, YAZI } from '../anasayfa/stil';

/**
 * Ajanın işi KKM'nin içinde (13 Kasım, Kemal: "ben neden tepsimde ilgili
 * yazıları okuyup kararları veremiyorum, her çıktıya GitHub'dan mı
 * uzanacağım?").
 *
 *   Metin   — satırdaki `metin`; yoksa bağlantı ajansın deposundaki bir
 *             .md dosyasıysa anahtarla okunur ve burada gösterilir
 *   Görsel  — bağlantı ajansın deposundaki bir görselse burada görünür
 *   Sorular — satırdaki `sorular`: her soru seçenek düğmeleriyle; istersen
 *             kendi cevabın. "Cevapları gönder" kararı ajansa yazar
 *             (`oneri-kararlari.json`, durum "duzenle" + `cevaplar`)
 *
 * Yalnız okur; tek yazma Kemal "Cevapları gönder"e basınca.
 */

const BLOB = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/;

/** Ajansın deposundaki dosya: anahtarla ham hâli (metin ya da görsel adresi) */
async function depodanOku(anahtar: string, baglanti: string, gorsel: boolean): Promise<string> {
  const m = baglanti.match(BLOB);
  if (!m || m[1].toLowerCase() !== AJANS_DEPOSU.toLowerCase()) throw new Error('ajansın deposunda değil');
  const r = await fetch(`https://api.github.com/repos/${AJANS_DEPOSU}/contents/${m[3]}?ref=${encodeURIComponent(m[2])}`, {
    headers: { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${anahtar}`, 'X-GitHub-Api-Version': '2022-11-28' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`okunamadı (${r.status})`);
  return gorsel ? URL.createObjectURL(await r.blob()) : r.text();
}

const Satir: React.FC<{ metin: string }> = ({ metin }) => (
  <>
    {satirIci(metin).map((p, n) => {
      if (p.tur === 'kalin') return <strong key={n} className="font-semibold">{p.metin}</strong>;
      if (p.tur === 'egik') return <em key={n}>{p.metin}</em>;
      if (p.tur === 'cizili') return <s key={n} className="opacity-60">{p.metin}</s>;
      if (p.tur === 'kod') return <code key={n} className="px-1 rounded bg-[#E4DCCD] dark:bg-[#0B132B] text-[0.92em]">{p.metin}</code>;
      if (p.tur === 'baglanti') return /^https?:\/\//.test(p.adres)
        ? <a key={n} href={p.adres} target="_blank" rel="noreferrer" className="underline decoration-[#F26B6F] underline-offset-2">{p.metin}</a>
        : <span key={n}>{p.metin}</span>;
      return <React.Fragment key={n}>{p.metin}</React.Fragment>;
    })}
  </>
);

const Metin: React.FC<{ md: string }> = ({ md }) => {
  const bloklar = useMemo<Blok[]>(() => markdownuAyir(md), [md]);
  return (
    <div className={`text-[13px] leading-relaxed ${YAZI} space-y-2 min-w-0`}>
      {bloklar.map((b, n) => {
        switch (b.tur) {
          case 'baslik': return <div key={n} className={b.seviye <= 1 ? 'text-[15px] font-bold' : b.seviye === 2 ? 'pt-2 text-[14px] font-bold' : 'pt-1 font-semibold'}><Satir metin={b.metin} /></div>;
          case 'paragraf': return <p key={n} className="whitespace-pre-line"><Satir metin={b.metin} /></p>;
          case 'liste': {
            const L = b.sirali ? 'ol' : 'ul';
            return <L key={n} className={`${b.sirali ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-[#F26B6F]`}>{b.ogeler.map((o, k) => <li key={k}><Satir metin={o} /></li>)}</L>;
          }
          case 'tablo': return (
            <div key={n} className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                {!b.baslik.every(h => !h) && <thead><tr>{b.baslik.map((h, k) => <th key={k} className={`text-left px-2 py-1 font-semibold ${IKINCIL} border-b border-[#CFC5B4] dark:border-[#2C3C72]`}><Satir metin={h} /></th>)}</tr></thead>}
                <tbody>{b.satirlar.map((s, k) => <tr key={k} className="border-b border-[#E4DCCD] dark:border-[#2C3C72] last:border-0">{s.map((h, j) => <td key={j} className="align-top px-2 py-1"><Satir metin={h} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
          case 'gorsel': return null;
          case 'cizgi': return <hr key={n} className="border-[#E4DCCD] dark:border-[#2C3C72]" />;
        }
      })}
    </div>
  );
};

const cip = (on: boolean) => `text-left min-h-9 px-3 py-1.5 rounded-xl text-[12px] border cursor-pointer ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI} hover:border-[#F26B6F]`}`;

const Sorular: React.FC<{ sorular: AjanSorusu[]; onGonder: (cevaplar: Record<string, string>) => Promise<void> }> = ({ sorular, onGonder }) => {
  const onerilenler = (s: AjanSorusu) => (Array.isArray(s.onerilen) ? s.onerilen : typeof s.onerilen === 'number' ? [s.onerilen] : [])
    .filter(k => typeof k === 'number' && s.adaylar[k] !== undefined);
  const [secim, setSecim] = useState<Record<string, string[]>>(() => Object.fromEntries(
    sorular.map(s => [s.id, (s.coklu ? onerilenler(s) : onerilenler(s).slice(0, 1)).map(k => s.adaylar[k])])));
  const [serbest, setSerbest] = useState<Record<string, string>>({});
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const cevap = (id: string) => {
    const adaylar = sorular.find(s => s.id === id)?.adaylar || [];
    return (serbest[id]?.trim() || adaylar.filter(a => (secim[id] || []).includes(a)).join(' · ')).trim();
  };
  const sayi = sorular.filter(s => cevap(s.id)).length;
  return (
    <div className="space-y-3">
      {sorular.map((s, n) => (
        <div key={s.id} className="rounded-xl border border-[#CFC5B4]/80 dark:border-[#2C3C72] p-2.5 space-y-1.5">
          <div className={`text-[13px] font-semibold ${YAZI}`}>{n + 1}. <Satir metin={s.soru} /></div>
          {s.coklu && <p className={`text-[11px] ${IKINCIL}`}>Birden çok seçebilirsin.</p>}
          {s.neden && <p className={`text-[11.5px] leading-snug ${IKINCIL}`}><Satir metin={s.neden} /></p>}
          <div className="flex flex-col gap-1.5">
            {s.adaylar.map((a, k) => {
              const on = !serbest[s.id]?.trim() && (secim[s.id] || []).includes(a);
              return (
                <button key={k} type="button" onClick={() => { setSecim(x => ({ ...x, [s.id]: s.coklu ? (on ? (x[s.id] || []).filter(y => y !== a) : [...(x[s.id] || []).filter(y => y !== a), a]) : [a] })); setSerbest(x => ({ ...x, [s.id]: '' })); }} aria-pressed={on} className={cip(on)}>
                  {on && <Check className="inline w-3 h-3 mr-1" />}<Satir metin={a} />{onerilenler(s).includes(k) && <span className="opacity-70"> · önerilen</span>}
                </button>
              );
            })}
            <input value={serbest[s.id] || ''} onChange={e => setSerbest(x => ({ ...x, [s.id]: e.target.value }))} placeholder="Ya da kendi cevabın…"
              className={`min-h-9 px-3 rounded-xl text-[12px] bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI} border border-transparent focus:border-[#F26B6F] focus:outline-hidden`} />
          </div>
        </div>
      ))}
      {hata && <p className="text-[12px] text-[#D6484C]">{hata}</p>}
      <button type="button" disabled={!sayi || gonderiliyor} className={DUGME_LAC}
        onClick={async () => {
          setGonderiliyor(true); setHata(null);
          try { await onGonder(Object.fromEntries(sorular.filter(s => cevap(s.id)).map(s => [s.id, cevap(s.id)]))); }
          catch (e) { setHata(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}`); setGonderiliyor(false); }
        }}>
        <Send className="w-3.5 h-3.5" /> {gonderiliyor ? 'Gönderiliyor…' : `Cevapları gönder (${sayi}/${sorular.length})`}
      </button>
      <p className={`text-[11px] ${IKINCIL}`}>Boş bıraktığın soru ajansa gitmez; sonra yine sorulabilir.</p>
    </div>
  );
};

export const AjanIsiIcerigi: React.FC<{ o: AjanOnerisi; anahtar: string; onCevapla: (cevaplar: Record<string, string>) => Promise<void> }> = ({ o, anahtar, onCevapla }) => {
  const mdBaglanti = !o.metin && o.baglanti && BLOB.test(o.baglanti) && /\.md$/i.test(o.baglanti) ? o.baglanti : null;
  const gorselBaglanti = o.baglanti && BLOB.test(o.baglanti) && /\.(jpe?g|png|webp)$/i.test(o.baglanti) ? o.baglanti : null;
  const [md, setMd] = useState<string | null>(o.metin || null);
  const [gorsel, setGorsel] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);
  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    if (mdBaglanti) depodanOku(anahtar, mdBaglanti, false).then(t => { if (!iptal) setMd(t); }).catch(e => { if (!iptal) setHata(String(e.message || e)); });
    if (gorselBaglanti) depodanOku(anahtar, gorselBaglanti, true).then(s => { if (!iptal) setGorsel(s); }).catch(() => { /* bağlantı kalır */ });
    return () => { iptal = true; };
  }, [anahtar, mdBaglanti, gorselBaglanti]);

  const uzun = (md?.length || 0) > 900;
  return (
    <div className="space-y-3">
      {gorsel && <img src={gorsel} alt={o.baslik} className="w-full max-w-md rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72]" />}
      {o.sorular?.length ? <Sorular sorular={o.sorular} onGonder={onCevapla} /> : null}
      {md && (
        <div className="rounded-xl bg-[#F3EFE8]/70 dark:bg-[#0B132B]/60 p-3">
          <div className={uzun && !acik ? 'max-h-72 overflow-hidden relative' : ''}>
            <Metin md={md} />
            {uzun && !acik && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#F3EFE8] dark:from-[#0B132B]" />}
          </div>
          {uzun && (
            <button type="button" onClick={() => setAcik(a => !a)} className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold ${YAZI} cursor-pointer`}>
              {acik ? <><ChevronUp className="w-3.5 h-3.5" /> Kısalt</> : <><ChevronDown className="w-3.5 h-3.5" /> Hepsini oku</>}
            </button>
          )}
        </div>
      )}
      {mdBaglanti && !md && !hata && <p className={`text-[12px] ${IKINCIL}`}>Metin ajanstan okunuyor…</p>}
      {hata && <p className={`text-[12px] ${IKINCIL}`}>Metin burada açılamadı ({hata}); aşağıdaki bağlantıdan bakabilirsin.</p>}
    </div>
  );
};

export default AjanIsiIcerigi;
