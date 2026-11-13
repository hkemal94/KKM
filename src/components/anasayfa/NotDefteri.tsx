import { YazimPaneli } from '../wiki/YazimPaneli';
import { nottakiMaddeler } from '../../lib/notBaglari';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Item } from '../../types';
import { ETIKET, IKINCIL, KART, YAZI, neZaman } from './stil';

/**
 * Not defteri (Paket 4) — "Günlük Notlar"ın yerine.
 *
 * Kemal (29 Eylül): günlük not bir not defteri gibi çalışsın. Her sayfa
 * ayrı bir kayıt (eski günlük notla aynı biçim: `gunluk-not` etiketi), o
 * yüzden eski "Bugünün Düşüncesi" notu da defterde bir sayfa olarak durur;
 * hiçbir şey taşınmaz, silinmez. Yazdıkça kaydolur. Sayfa kaldırılınca
 * arşive kalkar.
 */

export const DEFTER_ETIKETI = 'gunluk-not';

interface Props {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  /** Telefonda kâğıt daha uzun */
  uzun?: boolean;
  /** "+" düğmesiyle gelinince yeni sayfa açılır; açılınca haber verilir */
  yeniSayfaBekliyor?: boolean;
  onYeniSayfaAcildi?: () => void;
  /** #madde bağına basınca maddeyi açar */
  onMaddeAc?: (item: Item) => void;
  /** Ana sayfa (13 Kasım, Kemal: "notlar basit olmalı"): çerçevesiz, sayfa seçimi tek açılır liste,
   *  yazım paneli ve kaldırma Notlar sayfasında kalır */
  sade?: boolean;
}

const bugunAdi = () => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export const NotDefteri: React.FC<Props> = ({ items, onAddItem, onUpdateItem, uzun = false, sade = false, yeniSayfaBekliyor = false, onYeniSayfaAcildi, onMaddeAc }) => {
  const sayfalar = useMemo(
    () => items.filter(i => !i.archived && (i.tags || []).includes(DEFTER_ETIKETI)).sort((a, b) => b.updatedAt - a.updatedAt),
    [items]
  );
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const secili = sayfalar.find(s => s.id === seciliId) ?? sayfalar[0];
  const [metin, setMetin] = useState(secili?.notes ?? '');
  const [baslik, setBaslik] = useState(secili?.title ?? '');
  const [durum, setDurum] = useState<'kayitli' | 'yaziliyor' | 'bekliyor'>('kayitli');
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const zamanlayici = useRef<number | null>(null);
  const bekleyen = useRef<Item | null>(null);
  const kagit = useRef<HTMLTextAreaElement | null>(null);

  // Sayfa değişince (ya da ilk yüklemede) kutular o sayfayla dolar.
  // Yazarken gelen kendi kaydımız metni ezmesin diye yalnız kimlik izlenir.
  useEffect(() => {
    setMetin(secili?.notes ?? '');
    setBaslik(secili?.title ?? '');
    setKaldirOnay(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili?.id]);

  const simdiYaz = async () => {
    if (zamanlayici.current) { window.clearTimeout(zamanlayici.current); zamanlayici.current = null; }
    const k = bekleyen.current;
    bekleyen.current = null;
    if (!k) return;
    setDurum('yaziliyor');
    try { await onUpdateItem(k); setDurum('kayitli'); } catch { setDurum('bekliyor'); }
  };

  // Başka sayfaya geçerken ya da ekran kapanırken bekleyen yazı kaybolmasın
  useEffect(() => () => { void simdiYaz(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const degisti = (alan: { notes?: string; title?: string }) => {
    if (!secili) return;
    bekleyen.current = { ...(bekleyen.current ?? secili), ...alan, updatedAt: Date.now() };
    setDurum('bekliyor');
    if (zamanlayici.current) window.clearTimeout(zamanlayici.current);
    zamanlayici.current = window.setTimeout(() => { void simdiYaz(); }, 900);
  };

  const sec = async (id: string) => {
    await simdiYaz();
    setSeciliId(id);
  };

  const yeniSayfa = async () => {
    await simdiYaz();
    const id = `defter_${Date.now()}`;
    await onAddItem({
      id,
      title: bugunAdi(),
      area: 'komuta',
      type: 'fikir',
      status: 'Bitti',
      priority: 'orta',
      tags: [DEFTER_ETIKETI, 'defter-sayfasi'],
      notes: '',
      links: [],
      images: [],
      isProposal: false,
      archived: false,
      metadata: {}
    });
    setSeciliId(id);
    window.setTimeout(() => kagit.current?.focus(), 80);
  };

  useEffect(() => {
    if (!yeniSayfaBekliyor) return;
    onYeniSayfaAcildi?.();
    void yeniSayfa();
  }, [yeniSayfaBekliyor]); // eslint-disable-line react-hooks/exhaustive-deps

  const kaldir = async () => {
    if (!secili) return;
    await simdiYaz();
    await onUpdateItem({ ...secili, archived: true, updatedAt: Date.now() });
    setSeciliId(null);
    setKaldirOnay(false);
  };

  const cizgili: React.CSSProperties = {
    backgroundImage: 'repeating-linear-gradient(transparent, transparent 25px, var(--defter-cizgi) 25px, var(--defter-cizgi) 26px)',
    lineHeight: '26px',
    backgroundAttachment: 'local'
  };

  const durumYazisi = durum === 'yaziliyor' ? 'kaydediliyor…' : durum === 'bekliyor' ? 'yazıyorsun…' : secili ? `kaydedildi · ${neZaman(secili.updatedAt)}` : '';

  if (sade) {
    return (
      <div className="[--defter-cizgi:#E4DCCD] dark:[--defter-cizgi:#2C3C72]">
        <div className="flex items-center gap-2">
          <select
            value={secili?.id ?? ''}
            onChange={e => { void sec(e.target.value); }}
            aria-label="Sayfa"
            className={`min-w-0 flex-1 bg-transparent text-[13px] font-semibold ${YAZI} focus:outline-hidden cursor-pointer truncate`}
          >
            {!sayfalar.length && <option value="">Defter boş</option>}
            {sayfalar.map(s => <option key={s.id} value={s.id}>{s.title || 'Adsız sayfa'}</option>)}
          </select>
          <button type="button" onClick={yeniSayfa} aria-label="Yeni sayfa" title="Yeni sayfa" className="shrink-0 p-1 rounded-full text-[#D6484C] dark:text-[#F26B6F] hover:bg-[#F26B6F]/10 cursor-pointer">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {secili ? (
          <textarea
            ref={kagit}
            value={metin}
            onChange={e => { setMetin(e.target.value); degisti({ notes: e.target.value }); }}
            placeholder="Yaz; yazdıkça kaydolur."
            style={cizgili}
            className={`mt-1 w-full resize-y bg-transparent text-[14px] lg:text-[13px] ${YAZI} placeholder:text-[#6A5E4C]/70 dark:placeholder:text-[#A6B0C9]/70 focus:outline-hidden min-h-[156px]`}
          />
        ) : (
          <button type="button" onClick={yeniSayfa} className={`mt-2 w-full text-left text-[12px] ${IKINCIL} cursor-pointer hover:underline`}>Defter boş. İlk sayfayı aç.</button>
        )}
        <div className={`text-[10px] font-mono text-right ${IKINCIL}`}>{durumYazisi}</div>
      </div>
    );
  }

  return (
    <section className={`${KART} p-4 [--defter-cizgi:#E4DCCD] dark:[--defter-cizgi:#2C3C72]`}>
      <div className="flex items-center justify-between gap-2">
        <div className={ETIKET}>Not defteri</div>
        <span className={`text-[10px] font-mono ${IKINCIL}`}>
          {durumYazisi}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[130px_1fr]">
        {/* Sayfalar: telefonda yan yana kayar, masaüstünde solda liste */}
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible">
          {sayfalar.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => sec(s.id)}
              className={`shrink-0 text-left px-3 py-1.5 rounded-full lg:rounded-lg text-[12px] cursor-pointer truncate lg:max-w-full max-w-[160px] border lg:border-0 ${
                secili?.id === s.id
                  ? `bg-[#F3EFE8] dark:bg-[#17345A] font-semibold ${YAZI} border-[#CFC5B4] dark:border-[#2C3C72]`
                  : `${IKINCIL} border-[#CFC5B4] dark:border-[#2C3C72] hover:text-[#0E1C4F] dark:hover:text-[#F3EFE8]`
              }`}
            >
              {s.title || 'Adsız sayfa'}
            </button>
          ))}
          <button type="button" onClick={yeniSayfa} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full lg:rounded-lg text-[12px] text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Yeni sayfa
          </button>
        </div>

        {secili ? (
          <div className="min-w-0 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-white/70 dark:bg-[#0F1A40] px-3 pt-1.5 pb-2">
            <input
              value={baslik}
              onChange={e => { setBaslik(e.target.value); degisti({ title: e.target.value }); }}
              placeholder="Sayfanın adı"
              className={`w-full bg-transparent text-[13px] font-semibold ${YAZI} focus:outline-hidden border-b border-[var(--defter-cizgi)] pb-1`}
            />
            <textarea
              ref={kagit}
              value={metin}
              onChange={e => { setMetin(e.target.value); degisti({ notes: e.target.value }); }}
              placeholder="Yaz; yazdıkça kaydolur."
              style={cizgili}
              className={`w-full resize-y bg-transparent text-[14px] lg:text-[13px] ${YAZI} placeholder:text-[#6A5E4C]/70 dark:placeholder:text-[#A6B0C9]/70 focus:outline-hidden ${uzun ? 'min-h-[52vh]' : 'min-h-[182px]'}`}
            />
            {/* Not → madde bağı: metinde "#Madde adı" */}
            {(() => {
              const bagli = nottakiMaddeler(metin, items);
              return (
                <div className="flex flex-wrap items-center gap-1.5 py-1">
                  {bagli.map(m => (
                    <button key={m.id} type="button" onClick={() => onMaddeAc?.(m)} className="px-2 py-0.5 rounded-full bg-[#F26B6F]/12 text-[11px] font-semibold text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">
                      #{m.title}
                    </button>
                  ))}
                  {!bagli.length && <span className={`text-[10px] ${IKINCIL}`}>Maddeye bağlamak için "#" ile adını yaz: #Dirlik Stadı</span>}
                </div>
              );
            })()}
            {/* Yazım paneli (7. gece): defterde kapalı başlar */}
            <YazimPaneli metin={metin} items={items} onMaddeAc={onMaddeAc ? id => { const m = items.find(i => i.id === id); if (m) onMaddeAc(m); } : undefined}
              onAddItem={onAddItem} kaynakId={secili.id} kapaliBaslar className="my-2" />
            <div className="flex justify-end">
              {kaldirOnay ? (
                <span className="flex items-center gap-2 text-[11px]">
                  <span className={IKINCIL}>Sayfa arşive kalksın mı?</span>
                  <button type="button" onClick={() => setKaldirOnay(false)} className={`${IKINCIL} underline cursor-pointer`}>Vazgeç</button>
                  <button type="button" onClick={kaldir} className="text-[#D6484C] dark:text-[#F26B6F] font-semibold cursor-pointer">Evet</button>
                </span>
              ) : (
                <button type="button" onClick={() => setKaldirOnay(true)} className={`text-[11px] ${IKINCIL} hover:text-[#D6484C] cursor-pointer`}>
                  Sayfayı kaldır
                </button>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={yeniSayfa} className={`rounded-xl border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] p-6 text-[12px] ${IKINCIL} cursor-pointer hover:border-[#F26B6F]`}>
            Defter boş. İlk sayfayı aç.
          </button>
        )}
      </div>
    </section>
  );
};

export default NotDefteri;
