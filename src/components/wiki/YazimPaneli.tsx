import React, { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, Plus, Search, X } from 'lucide-react';
import type { Item, ItemType } from '../../types';
import { WIKI_TYPES, TYPE_LABELS, getKunyeFields } from './wikiSchema';
import { KunyeDegeri } from './KunyeDegeri';
import { anilanKimlikler, buildLinkIndex } from './autoLink';
import { takmaAdlar } from '../../lib/alanSablonu';
import { tarihUyarilari } from '../../lib/kanonTarihleri';
import { ONERI_TURU_ADI, metindekiYeniAdlar, type OneriTuru } from '../../lib/maddeOnerileri';

/**
 * Yazım paneli — yazarken yanda evren (7. gece, 8 Ekim; Kemal'in seçimleri).
 * Kitap bölümü, fanzin, blog yazısı ve not defterinde aynı panel:
 *   - metinde adı (ya da takma adı) geçen maddeler; basınca künyesi panelde
 *   - arama: metinde geçmese de bir maddeyi bulup künyesine bakmak
 *   - kanonla çelişen tarihler (eski Kanon panelinden)
 *   - metinde geçen ama maddesi olmayan adlar: "Madde aç" boş madde açar
 *     (ad metinden, türü Kemal seçer; metin boş kalır)
 * Metne dokunmaz; kayıt yalnız "Madde aç" ile yazılır.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

interface Props {
  metin: string;
  items: Item[];
  /** "Maddeyi aç": vikide açar */
  onMaddeAc?: (id: string) => void;
  /** Maddesi olmayan ad için boş madde açar */
  onAddItem?: (item: YeniKayit) => Promise<void>;
  /** Yeni maddenin bağlanacağı yazı (kitap bölümü, yazı…) */
  kaynakId?: string;
  /** Not defterinde kapalı başlar */
  kapaliBaslar?: boolean;
  className?: string;
}

const trKucuk = (s: string) => s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');
const ACILABILIR: OneriTuru[] = ['mekân', 'yer', 'cadde', 'meydan', 'yer_adi', 'kulüp', 'aile'];
const CIP = 'text-[12px] px-2.5 py-1 rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] cursor-pointer';
const ALT_BASLIK = 'text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#6A5E4C] dark:text-[#A6B0C9]';

export const YazimPaneli: React.FC<Props> = ({ metin, items, onMaddeAc, onAddItem, kaynakId, kapaliBaslar = false, className }) => {
  const [acik, setAcik] = useState(!kapaliBaslar);
  const [secili, setSecili] = useState<string | null>(null);
  const [aranan, setAranan] = useState('');
  const [turler, setTurler] = useState<Record<string, OneriTuru>>({});
  const [acilan, setAcilan] = useState<string | null>(null);

  const maddeler = useMemo(() => items.filter(i => !i.archived && !i.isProposal && WIKI_TYPES.includes(i.type as ItemType)), [items]);
  const index = useMemo(() => buildLinkIndex(maddeler), [maddeler]);
  const anilanlar = useMemo(() => anilanKimlikler(metin, index)
    .map(id => maddeler.find(i => i.id === id)).filter((i): i is Item => !!i)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr')), [metin, index, maddeler]);
  const uyarilar = useMemo(() => tarihUyarilari(metin), [metin]);
  const yeniAdlar = useMemo(() => metindekiYeniAdlar(metin, items), [metin, items]);
  const sonuclar = useMemo(() => {
    const q = trKucuk(aranan.trim());
    if (q.length < 2) return [];
    return maddeler.filter(i => trKucuk(i.title).includes(q) || takmaAdlar(i).some(t => trKucuk(t).includes(q))).slice(0, 8);
  }, [aranan, maddeler]);
  const madde = secili ? maddeler.find(i => i.id === secili) || null : null;

  const maddeAc = async (ad: string, tur: OneriTuru) => {
    if (!onAddItem || acilan) return;
    setAcilan(ad);
    try {
      await onAddItem({
        title: ad, area: 'duzada', type: tur, status: 'Fikir', priority: 'orta',
        tags: [], links: kaynakId ? [kaynakId] : [], notes: '', images: [], isProposal: false, archived: false, metadata: {}
      });
    } finally { setAcilan(null); }
  };

  const ozet = [
    anilanlar.length ? `${anilanlar.length} madde` : '',
    uyarilar.length ? `${uyarilar.length} tarih uyarısı` : '',
    yeniAdlar.length ? `${yeniAdlar.length} maddesiz ad` : ''
  ].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] ${className || ''}`}>
      <button type="button" onClick={() => setAcik(a => !a)} aria-expanded={acik} className="w-full flex items-center gap-2 px-4 py-2.5 text-left cursor-pointer">
        <BookOpen className="w-3.5 h-3.5 text-[#F26B6F]" />
        <span className="shrink-0 whitespace-nowrap text-[10px] font-mono uppercase tracking-wider font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">Yazım paneli</span>
        {ozet && <span className="text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9] truncate">{ozet}</span>}
        <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 text-[#6A5E4C] dark:text-[#A6B0C9] transition-transform ${acik ? 'rotate-180' : ''}`} />
      </button>

      {acik && (
        <div className="px-4 pb-4 space-y-3">
          {/* Arama */}
          <label className="flex items-center gap-2 px-2.5 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A]">
            <Search className="w-3.5 h-3.5 text-[#6A5E4C] dark:text-[#A6B0C9] shrink-0" />
            <input value={aranan} onChange={e => setAranan(e.target.value)} placeholder="Vikide ara"
              className="flex-1 min-w-0 min-h-9 bg-transparent text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] focus:outline-hidden" />
            {aranan && <button type="button" aria-label="Aramayı temizle" onClick={() => setAranan('')} className="cursor-pointer"><X className="w-3.5 h-3.5 text-[#6A5E4C]" /></button>}
          </label>
          {sonuclar.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {sonuclar.map(i => (
                <li key={i.id}><button type="button" onClick={() => { setSecili(i.id); setAranan(''); }} className={CIP}>{i.title}</button></li>
              ))}
            </ul>
          )}
          {aranan.trim().length >= 2 && !sonuclar.length && <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bu adla madde yok.</p>}

          {/* Seçili maddenin künyesi */}
          {madde && (
            <div className="rounded-lg border border-[#F26B6F]/50 bg-white dark:bg-[#17345A] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{madde.title}</div>
                  <div className="text-[9px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">{TYPE_LABELS[madde.type as ItemType] || madde.type}</div>
                </div>
                <button type="button" aria-label="Künyeyi kapat" onClick={() => setSecili(null)} className="cursor-pointer"><X className="w-3.5 h-3.5 text-[#6A5E4C]" /></button>
              </div>
              {(() => {
                const kunye = getKunyeFields(madde);
                return kunye.length ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    {kunye.map((f, idx) => (
                      <React.Fragment key={`${f.id}-${idx}`}>
                        <dt className="font-mono text-[9px] uppercase pt-0.5 text-[#6A5E4C] dark:text-[#A6B0C9]">{f.label}</dt>
                        <dd className="text-[#0E1C4F] dark:text-[#F3EFE8] leading-snug min-w-0"><KunyeDegeri value={f.value} /></dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : <p className="text-[11px] italic text-[#6A5E4C] dark:text-[#A6B0C9]">Künyesi boş.</p>;
              })()}
              {onMaddeAc && (
                <button type="button" onClick={() => onMaddeAc(madde.id)} className="text-[11px] font-semibold text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">
                  Maddeyi vikide aç →
                </button>
              )}
            </div>
          )}

          {/* Tarih uyarıları */}
          {uyarilar.map((u, i) => (
            <div key={i} className="flex gap-2 px-3 py-2 rounded-lg border border-[#F26B6F]/40 bg-[#F26B6F]/8 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-[#F26B6F] shrink-0 mt-0.5" />
              <span className="min-w-0 text-[#0E1C4F] dark:text-[#F3EFE8] leading-snug">
                <strong>{u.yil}</strong> geçen bir paragrafta <strong>{u.kural.ad}</strong> var. {u.kural.not}
                <span className="block mt-0.5 text-[#6A5E4C] dark:text-[#A6B0C9] italic truncate">“{u.alinti}…”</span>
              </span>
            </div>
          ))}

          {/* Metinde anılanlar */}
          <div className="space-y-1.5">
            <div className={ALT_BASLIK}>Bu metinde anılanlar{anilanlar.length ? ` · ${anilanlar.length}` : ''}</div>
            {anilanlar.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {anilanlar.map(i => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setSecili(s => (s === i.id ? null : i.id))}
                      className={`${CIP} ${secili === i.id ? 'border-[#F26B6F] dark:border-[#F26B6F]' : ''}`}>
                      {i.title}<span className="ml-1.5 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">{TYPE_LABELS[i.type as ItemType] || i.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Metinde henüz vikideki bir ad geçmiyor.</p>}
          </div>

          {/* Maddesi olmayan adlar */}
          {yeniAdlar.length > 0 && (
            <div className="space-y-1.5">
              <div className={ALT_BASLIK}>Maddesi yok · {yeniAdlar.length}</div>
              <ul className="space-y-1.5">
                {yeniAdlar.map(a => {
                  const tur = turler[a.ad] || a.tur;
                  return (
                    <li key={a.ad} className="flex flex-wrap items-center gap-1.5">
                      <span className="flex-1 min-w-[110px] text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{a.ad}</span>
                      {onAddItem && (
                        <>
                          <select aria-label={`${a.ad} türü`} value={tur} onChange={e => setTurler(t => ({ ...t, [a.ad]: e.target.value as OneriTuru }))}
                            className="min-h-8 text-[11px] bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-1.5">
                            {ACILABILIR.map(t => <option key={t} value={t}>{ONERI_TURU_ADI[t]}</option>)}
                          </select>
                          <button type="button" disabled={!!acilan} onClick={() => void maddeAc(a.ad, tur)}
                            className="min-h-8 px-2.5 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                            <Plus className="w-3 h-3" />{acilan === a.ad ? '…' : 'Madde aç'}
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">Madde boş açılır; adı metinden, metnini sen yazarsın.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default YazimPaneli;
