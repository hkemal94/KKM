import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Plus } from 'lucide-react';
import type { Item } from '../../types';
import { MERCH_ASAMALARI, type MerchAsamasi } from '../../lib/durumOranlari';
import { KisaListe } from '../kabuk/KisaListe';

/**
 * Merch panosu (Paket 5). Kemal (yapısal 1. set, 4. tur): "Kanon kökü, pano
 * görünümü (Konsept → Tasarım → Üretim → Satışta)" ve "her ürüne Canva
 * tasarımı bağlanır (küçük resim, tıklayınca Canva)".
 *
 * Her sütun bir aşama; kart okla ileri/geri gider. Kartta ürünün kanon kökü
 * (hangi kurumdan, hangi drop'tan) ve Canva bağlantısı durur. Ad kutusu boş
 * açılır — ürün adı Kemal'in.
 */

const RENK: Record<MerchAsamasi, string> = { Konsept: '#CFC5B4', Tasarım: '#C9A24B', Üretim: '#F26B6F', Satışta: '#0E1C4F' };

const asamasi = (u: Item): MerchAsamasi =>
  (MERCH_ASAMALARI as readonly string[]).includes(u.status) ? u.status as MerchAsamasi : 'Konsept';

interface Props {
  urunler: Item[];
  items: Item[];
  kapak: (i: Item) => string | undefined;
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onAc: (id: string) => void;
}

export const MerchPano: React.FC<Props> = ({ urunler, items, kapak, onUpdateItem, onAddItem, onAc }) => {
  const [baglantiAcik, setBaglantiAcik] = useState<string | null>(null);
  const [baglanti, setBaglanti] = useState('');
  const [yeni, setYeni] = useState('');

  const tasi = (u: Item, yon: 1 | -1) => {
    const i = MERCH_ASAMALARI.indexOf(asamasi(u));
    const hedef = MERCH_ASAMALARI[Math.min(Math.max(i + yon, 0), MERCH_ASAMALARI.length - 1)];
    if (hedef !== asamasi(u)) void onUpdateItem({ ...u, status: hedef, updatedAt: Date.now() });
  };

  const baglantiKaydet = (u: Item) => {
    const url = baglanti.trim();
    const meta = { ...(u.metadata || {}) } as Record<string, unknown>;
    if (url) meta.canvaTasarim = url; else delete meta.canvaTasarim;
    void onUpdateItem({ ...u, metadata: meta, updatedAt: Date.now() });
    setBaglantiAcik(null);
  };

  const ekle = async () => {
    const ad = yeni.trim();
    if (!ad) return;
    await onAddItem({
      title: ad, area: 'merch', type: 'merch_urun', status: 'Konsept', priority: 'orta',
      tags: ['merch', 'merch_urun'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { brandId: 'kems_company' }
    });
    setYeni('');
  };

  const kok = (u: Item) => {
    const m = (u.metadata || {}) as Record<string, string | undefined>;
    const drop = m.dropId ? items.find(i => i.id === m.dropId) : undefined;
    const kurumId = m.kurumId || (drop?.metadata?.kurumId as string | undefined);
    const kurum = kurumId ? items.find(i => i.id === kurumId) : undefined;
    return [kurum?.title, drop?.title].filter(Boolean).join(' · ') || 'kanon kökü yok';
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <p className="text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
        Ürünlerin hayat çizgisi. Okla bir sonraki aşamaya taşı; Canva bağlantısı ekleyince kartta "Canva'da aç" çıkar.
      </p>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-start">
        {MERCH_ASAMALARI.map(a => {
          const bunlar = urunler.filter(u => asamasi(u) === a);
          return (
            <div key={a} className="rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#F3EFE8]/60 dark:bg-[#0F1A40] p-2.5 min-w-0">
              <div className="flex items-center gap-2 px-1 pb-2">
                <i className="w-2.5 h-2.5 rounded-full" style={{ background: RENK[a] }} />
                <b className="text-[13px] text-[#0E1C4F] dark:text-[#F3EFE8]">{a}</b>
                <span className="ml-auto font-mono text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{bunlar.length}</span>
              </div>
              <div className="space-y-2">
                <KisaListe as="div" className="space-y-2" dugmeClassName="px-1">
                {bunlar.map(u => {
                  const g = kapak(u);
                  const canva = (u.metadata as Record<string, unknown> | undefined)?.canvaTasarim as string | undefined;
                  return (
                    <div key={u.id} className="rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-2.5">
                      <button type="button" onClick={() => onAc(u.id)} className="w-full flex items-start gap-2.5 text-left cursor-pointer">
                        <span className="w-11 h-11 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] shrink-0 overflow-hidden flex items-center justify-center">
                          {g ? <img src={g} alt="" className="w-full h-full object-contain p-0.5" /> : <span className="text-[9px] text-[#6A5E4C]">görsel yok</span>}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12px] font-semibold leading-snug text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-2">{u.title}</span>
                          <span className="block text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9] truncate">{kok(u)}</span>
                        </span>
                      </button>
                      <div className="mt-2 flex items-center gap-1">
                        <button type="button" onClick={() => tasi(u, -1)} disabled={a === 'Konsept'} title="Bir aşama geri" className="p-1.5 rounded-lg text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#D6484C] disabled:opacity-25 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                        <button type="button" onClick={() => tasi(u, 1)} disabled={a === 'Satışta'} title="Bir aşama ileri" className="p-1.5 rounded-lg text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#D6484C] disabled:opacity-25 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
                        {canva ? (
                          <a href={canva} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-[#D6484C] dark:text-[#F26B6F] hover:underline">
                            Canva'da aç <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <button type="button" onClick={() => { setBaglantiAcik(u.id); setBaglanti(''); }} className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#D6484C] cursor-pointer">
                            <Link2 className="w-3 h-3" /> Canva bağla
                          </button>
                        )}
                      </div>
                      {baglantiAcik === u.id && (
                        <div className="mt-1.5 flex gap-1.5">
                          <input autoFocus value={baglanti} onChange={e => setBaglanti(e.target.value)} placeholder="canva.com/design/…" className="flex-1 min-w-0 text-[11px] bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2 py-1 focus:outline-hidden focus:border-[#F26B6F]" />
                          <button type="button" onClick={() => baglantiKaydet(u)} className="px-2 py-1 rounded-lg text-[10px] bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] cursor-pointer">Kaydet</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                </KisaListe>
                {!bunlar.length && <p className="px-1 py-3 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bu aşamada ürün yok.</p>}
                {a === 'Konsept' && (
                  <div className="flex gap-1.5 pt-1">
                    <input value={yeni} onChange={e => setYeni(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ekle(); }} placeholder="Yeni ürün (adını sen koy)" className="flex-1 min-w-0 text-[11px] bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2 py-1.5 focus:outline-hidden focus:border-[#F26B6F]" />
                    <button type="button" onClick={ekle} disabled={!yeni.trim()} title="Ekle" className="p-1.5 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] disabled:opacity-30 cursor-pointer"><Plus className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MerchPano;
