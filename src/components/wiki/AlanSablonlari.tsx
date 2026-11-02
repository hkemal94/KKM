import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import {
  BAG_GRUPLARI, BAG_GRUP_SIRASI, SABLON_TURLERI, baslangicSablonu, ozelAlanKimligi,
  type BagGrubu, type SablonAlani, type VikiSablonu
} from '../../lib/alanSablonu';
import { useKaydedilmemis } from '../../lib/kaydedilmemis';

/**
 * Alan şablonları sayfası (3. gece; Kemal, 7 Ekim: "ikisi de" — ayrı sayfa
 * ve düzenleyicide kısa yol). Her türün künye alanları: ekle, adını
 * değiştir, gizle, sırala, bağ alanı yap. Kayıt yalnız "Kaydet" ile.
 */

interface Props {
  sablon: VikiSablonu;
  onKaydet: (s: VikiSablonu) => Promise<void>;
  onKapat: () => void;
}

const GIRDI = 'w-full text-[13px] bg-white dark:bg-lacivert-800/60 border border-bej/70 dark:border-lacivert-600/60 rounded px-2.5 py-1.5 focus:outline-hidden focus:border-kiremit';
const CIP = (secili: boolean) => `min-h-8 px-2 py-0.5 rounded-full text-[11px] border cursor-pointer ${secili
  ? 'bg-lacivert text-krem border-transparent dark:bg-[#2C3C72]'
  : 'border-bej/80 dark:border-lacivert-600 text-gri dark:text-bej/85 hover:border-kiremit'}`;

export const AlanSablonlari: React.FC<Props> = ({ sablon, onKaydet, onKapat }) => {
  const [taslak, setTaslak] = useState<VikiSablonu>(() => structuredClone(sablon));
  const [tur, setTur] = useState(SABLON_TURLERI[0].anahtar);
  const [yeniAd, setYeniAd] = useState('');
  const [yaziliyor, setYaziliyor] = useState(false);
  const [hata, setHata] = useState('');
  const degisti = useMemo(() => JSON.stringify(taslak) !== JSON.stringify(sablon), [taslak, sablon]);
  useKaydedilmemis(degisti);

  const liste = taslak[tur] || [];
  const yaz = (l: SablonAlani[]) => setTaslak(t => ({ ...t, [tur]: l }));
  const alanYaz = (n: number, d: Partial<SablonAlani>) => yaz(liste.map((a, k) => (k === n ? { ...a, ...d } : a)));
  const tasi = (n: number, yon: -1 | 1) => {
    const j = n + yon;
    if (j < 0 || j >= liste.length) return;
    const y = liste.slice();
    [y[n], y[j]] = [y[j], y[n]];
    yaz(y);
  };
  const bagDegistir = (n: number, g: BagGrubu) => {
    const a = liste[n];
    const bag = a.bag?.includes(g) ? a.bag.filter(x => x !== g) : [...(a.bag || []), g];
    alanYaz(n, { bag: bag.length ? bag : undefined, ...(bag.length ? {} : { coklu: undefined }) });
  };
  const ekle = () => {
    const ad = yeniAd.trim();
    if (!ad) return;
    yaz([...liste, { id: ozelAlanKimligi(ad, liste), label: ad, ozel: true }]);
    setYeniAd('');
  };

  const kaydet = async () => {
    setYaziliyor(true);
    setHata('');
    try {
      await onKaydet(taslak);
      onKapat();
    } catch {
      setHata('Kaydedilemedi; değişiklikler burada duruyor, yeniden dene.');
    } finally {
      setYaziliyor(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-3xl tracking-tight">Alan şablonları</h1>
          <p className="mt-1 text-[14px] text-gri dark:text-bej/85 max-w-2xl leading-relaxed">
            Her türün künyesinde hangi alanlar olacağını burada seçersin. Başlangıç şablonu bugünkü künye alanları.
            <b> Bağ alanına</b> bir maddenin adını yazınca o ad maddeye bağlantı olur; bağlanan madde de seni görür.
          </p>
        </div>
        <button type="button" onClick={onKapat} aria-label="Kapat" className="p-2 text-gri hover:text-lacivert dark:text-bej/85"><X size={18} /></button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SABLON_TURLERI.map(t => (
          <button key={t.anahtar} type="button" onClick={() => setTur(t.anahtar)} className={CIP(tur === t.anahtar)}>{t.ad}</button>
        ))}
      </div>

      <ul className="space-y-2">
        {liste.map((a, n) => (
          <li key={a.id} className={`rounded-lg border p-3 space-y-2 ${a.gizli ? 'border-dashed border-bej/70 opacity-60' : 'border-bej/70 dark:border-lacivert-600/60 bg-white/60 dark:bg-lacivert-800/40'}`}>
            <div className="flex items-center gap-1.5">
              <input value={a.label} onChange={e => alanYaz(n, { label: e.target.value })} aria-label="Alanın adı" className={`${GIRDI} font-semibold`} />
              <span className="shrink-0 text-[11px] text-gri dark:text-bej/70 w-12 text-center">{a.ozel ? 'senin' : 'hazır'}</span>
              <button type="button" aria-label="Yukarı" onClick={() => tasi(n, -1)} disabled={n === 0} className="p-2 text-gri hover:text-kiremit disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" aria-label="Aşağı" onClick={() => tasi(n, 1)} disabled={n === liste.length - 1} className="p-2 text-gri hover:text-kiremit disabled:opacity-30"><ArrowDown size={14} /></button>
              {a.ozel && (
                <button type="button" aria-label="Alanı sil" onClick={() => yaz(liste.filter((_, k) => k !== n))} className="p-2 text-gri hover:text-kiremit"><Trash2 size={14} /></button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-gri dark:text-bej/80 mr-1">Bağ alanı:</span>
              {BAG_GRUP_SIRASI.map(g => (
                <button key={g} type="button" onClick={() => bagDegistir(n, g)} className={CIP(!!a.bag?.includes(g))}>{BAG_GRUPLARI[g].ad}</button>
              ))}
              {!!a.bag?.length && (
                <label className="ml-2 inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!a.coklu} onChange={e => alanYaz(n, { coklu: e.target.checked || undefined })} className="w-4 h-4 accent-[#0E1C4F] dark:accent-[#F26B6F]" />
                  birden çok madde
                </label>
              )}
              {!a.ozel && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!a.gizli} onChange={e => alanYaz(n, { gizli: e.target.checked || undefined })} className="w-4 h-4 accent-[#0E1C4F] dark:accent-[#F26B6F]" />
                  gizle
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={e => { e.preventDefault(); ekle(); }} className="flex flex-wrap items-center gap-2">
        <input value={yeniAd} onChange={e => setYeniAd(e.target.value)} placeholder="Yeni alanın adı (ör. Lakabı)" className={`${GIRDI} flex-1 min-w-[200px]`} />
        <button type="submit" disabled={!yeniAd.trim()} className="inline-flex items-center gap-1 text-[12px] font-mono px-3 py-1.5 rounded border border-bej/70 hover:border-kiremit disabled:opacity-40">
          <Plus size={13} /> Alan ekle
        </button>
      </form>

      <p className="text-[12px] text-gri dark:text-bej/75 leading-relaxed">
        Gizlenen alan künyede, düzenleyicide ve Boşluklar'da görünmez; maddelere yazılmış değeri silinmez. Kendi eklediğin bir alanı silersen
        maddelerdeki değeri de görünmez olur ama kayıtta kalır; alanı aynı adla yeniden eklersen geri gelir.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {hata && <span className="mr-auto text-[12px] text-kiremit">{hata}</span>}
        <button type="button" onClick={() => yaz(baslangicSablonu(tur))} className="mr-auto inline-flex items-center gap-1 text-[12px] font-mono px-3 py-1.5 rounded border border-bej/70 hover:border-kiremit">
          <RotateCcw size={13} /> Bu türü başlangıç şablonuna döndür
        </button>
        <button type="button" onClick={onKapat} className="text-[12px] font-mono px-3 py-1.5 rounded border border-bej/70">Vazgeç</button>
        <button type="button" disabled={!degisti || yaziliyor} onClick={() => void kaydet()} className="inline-flex items-center gap-1 text-[12px] font-mono px-3 py-1.5 rounded bg-lacivert text-krem dark:bg-[#2C3C72] disabled:opacity-40">
          <Save size={13} /> {yaziliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </section>
  );
};

export default AlanSablonlari;
