import React, { useState } from 'react';
import { ExternalLink, Plus, Check, X } from 'lucide-react';
import type { Item } from '../../types';

/**
 * Pinterest panoları (sosyal medya, 29 Eylül gece). Kemal: "pano akışı ve
 * ilham". Pano bir kayıt (`ilham_kaynak`): kullanıcı adı + pano adı. Pinler
 * yalnız "Pinleri getir"e basınca gelir, kaydolmaz. "Galeriye al" deyince
 * pin bir galeri görseli olur (görsel Pinterest'te durur, adresi kaydolur).
 *
 * Pinterest yalnız herkese açık panoların akışını verir; gizli pano gelmez.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

interface Pin { title: string; link: string; image: string }

interface Props {
  items: Item[];
  onAddItem: (item: YeniKayit) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}

/** "https://www.pinterest.com/kullanici/pano-adi/" → { kullanici, pano } */
export function panoAdresiniOku(metin: string): { kullanici: string; pano: string } | null {
  const t = metin.trim();
  const m = t.match(/pinterest\.[a-z.]+\/([^/?#\s]+)\/([^/?#\s]+)/i);
  if (m && !['pin', 'search', 'ideas'].includes(m[1].toLowerCase())) return { kullanici: decodeURIComponent(m[1]), pano: decodeURIComponent(m[2]) };
  const k = t.match(/^([^/\s]+)\/([^/\s]+)$/);
  return k ? { kullanici: k[1], pano: k[2] } : null;
}

const CIZGI = 'border-[#CFC5B4] dark:border-[#2C3C72]';
const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const YAZI = 'text-[#0E1C4F] dark:text-[#F3EFE8]';
const DUGME = `px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${CIZGI} ${YAZI} hover:border-[#F26B6F] disabled:opacity-40 cursor-pointer`;

export const PinterestPanolari: React.FC<Props> = ({ items, onAddItem, onDeleteItem }) => {
  const [adres, setAdres] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [pinler, setPinler] = useState<Record<string, Pin[] | 'yukleniyor' | string>>({});
  const [silOnay, setSilOnay] = useState<string | null>(null);

  const panolar = items.filter(i => i.type === 'ilham_kaynak' && !i.archived && i.metadata?.kaynak === 'pinterest');
  const galeridekiler = new Set(items.filter(i => i.type === 'ilham_gorsel' && !i.archived).map(i => i.images?.[0]).filter(Boolean));

  const ekle = async () => {
    setHata(null);
    if (/pin\.it\//i.test(adres)) { setHata('pin.it kısa bağlantısı çalışmaz. Panoyu tarayıcıda aç, adres çubuğundaki uzun adresi yapıştır.'); return; }
    const p = panoAdresiniOku(adres);
    if (!p) { setHata('Pano adresi okunamadı. Örnek: pinterest.com/kullanici/pano-adi'); return; }
    if (panolar.some(x => x.metadata?.kullanici === p.kullanici && x.metadata?.pano === p.pano)) { setHata('Bu pano zaten ekli.'); return; }
    await onAddItem({
      title: `${p.kullanici} / ${p.pano}`,
      area: 'ilham',
      type: 'ilham_kaynak',
      status: 'Fikir',
      priority: 'düşük',
      tags: ['pinterest'],
      links: [],
      notes: '',
      images: [],
      isProposal: false,
      archived: false,
      metadata: { kaynak: 'pinterest', kullanici: p.kullanici, pano: p.pano }
    });
    setAdres('');
  };

  const getir = async (pano: Item) => {
    setPinler(x => ({ ...x, [pano.id]: 'yukleniyor' }));
    try {
      const q = new URLSearchParams({ username: String(pano.metadata?.kullanici || ''), pano: String(pano.metadata?.pano || '') });
      const y = await fetch(`/api/pinterest?${q}`);
      const v = await y.json().catch(() => null);
      if (!y.ok || !v?.success) throw new Error(v?.error || `Pinterest'e ulaşılamadı (${y.status}).`);
      setPinler(x => ({ ...x, [pano.id]: (v.items as Pin[]).slice(0, 24) }));
    } catch (e) {
      setPinler(x => ({ ...x, [pano.id]: e instanceof Error ? e.message : 'Pinterest\'e ulaşılamadı.' }));
    }
  };

  const galeriyeAl = (pin: Pin, pano: Item) => onAddItem({
    title: pin.title || 'Pinterest ilhamı',
    area: 'ilham',
    type: 'ilham_gorsel',
    status: 'Arşivde',
    priority: 'düşük',
    tags: ['galeri', 'ilham', 'pinterest'],
    links: [],
    notes: '',
    images: [pin.image],
    isProposal: false,
    archived: false,
    metadata: { gorselTuru: 'ilham', kaynak: 'pinterest', kaynakAdres: pin.link, panoId: pano.id }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={adres} onChange={e => setAdres(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ekle(); }}
          placeholder="Pano adresi · pinterest.com/kullanici/pano-adi"
          className={`flex-1 text-[13px] bg-white dark:bg-[#17345A] ${YAZI} border ${CIZGI} rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-[#F26B6F]`} />
        <button type="button" disabled={!adres.trim()} onClick={() => void ekle()} className={`${DUGME} inline-flex items-center justify-center gap-1`}><Plus className="w-3 h-3" /> Panoyu ekle</button>
      </div>
      {hata && <p className="text-[12px] text-[#B23A40] dark:text-[#F26B6F]">{hata}</p>}
      {panolar.length === 0 && <p className={`text-[12px] ${IKINCIL}`}>Henüz pano yok. Herkese açık bir panonun adresini ekle; pinleri buradan galeriye alırsın.</p>}

      {panolar.map(pano => {
        const p = pinler[pano.id];
        const adresi = `https://www.pinterest.com/${pano.metadata?.kullanici}/${pano.metadata?.pano}/`;
        return (
          <div key={pano.id} className={`rounded-xl border ${CIZGI} p-3 space-y-2`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`flex-1 min-w-0 truncate text-[13px] font-semibold ${YAZI}`}>{pano.title}</span>
              <a href={adresi} target="_blank" rel="noreferrer" className={`${DUGME} inline-flex items-center gap-1`}><ExternalLink className="w-3 h-3" /> Pinterest'te aç</a>
              <button type="button" disabled={p === 'yukleniyor'} onClick={() => void getir(pano)} className={DUGME}>{p === 'yukleniyor' ? 'Getiriliyor…' : Array.isArray(p) ? 'Yenile' : 'Pinleri getir'}</button>
              {onDeleteItem && (silOnay === pano.id ? (
                <span className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => setSilOnay(null)} className={DUGME}>Vazgeç</button>
                  <button type="button" onClick={() => { setSilOnay(null); void onDeleteItem(pano.id); }} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F26B6F] text-white cursor-pointer">Panoyu kaldır</button>
                </span>
              ) : (
                <button type="button" onClick={() => setSilOnay(pano.id)} title="Panoyu kaldır" className={`w-7 h-7 rounded-full flex items-center justify-center ${IKINCIL} hover:text-[#D6484C] cursor-pointer`}><X className="w-4 h-4" /></button>
              ))}
            </div>
            {typeof p === 'string' && p !== 'yukleniyor' && <p className="text-[12px] text-[#B23A40] dark:text-[#F26B6F]">{p}</p>}
            {Array.isArray(p) && (p.length === 0
              ? <p className={`text-[12px] ${IKINCIL}`}>Bu panoda pin gelmedi (pano gizli olabilir).</p>
              : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {p.map((pin, idx) => {
                    const alindi = galeridekiler.has(pin.image);
                    return (
                      <div key={`${pin.link || pin.image}-${idx}`} className={`rounded-lg overflow-hidden border ${CIZGI} bg-[#F3EFE8] dark:bg-[#17345A]`}>
                        <a href={pin.link} target="_blank" rel="noreferrer" title={pin.title}>
                          <img src={pin.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full aspect-[3/4] object-cover" />
                        </a>
                        <button type="button" disabled={alindi} onClick={() => void galeriyeAl(pin, pano)}
                          className={`w-full py-1 text-[10.5px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer disabled:cursor-default ${alindi ? 'text-[#3F6B45] dark:text-[#B9D8BC]' : `${YAZI} hover:text-[#D6484C]`}`}>
                          {alindi ? <><Check className="w-3 h-3" /> Galeride</> : '+ Galeriye al'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
};

export default PinterestPanolari;
