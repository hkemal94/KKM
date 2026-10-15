import React, { useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Item } from '../../types';
import { TYPE_LABELS, getArticleBody, getKunyeFields } from '../wiki/wikiSchema';
import { GECE_TURLERI, istanbulGunu, geceDurumu } from '../../lib/geceHazirligi';
import { ADA_KIMLIGI } from '../../lib/vikiSifirlama';
import { yapayZekaOnerisi } from '../../lib/studyo';

/**
 * Girişin lacivert kartı (yapisal-4, 13–14; Kemal: "yapay zekâ girişte çok
 * üzerime geliyor, daha çok ada kanonu hakkında infolar paylaşan, üretimler
 * yapan bir hal istiyorum").
 *
 *   - Ada'dan bilgi: her gün başka bir viki maddesi, rastgele. Yapay zekâ
 *     yok; maddenin kendi künyesi ve metninden kısa bir parça.
 *   - Bugünün önerileri: stüdyonun gece hazırladığı 3 üretim önerisi (kural
 *     istisnası). Ayrıntı ve "Ekle" öneri tepsisinde.
 * Atölyedeki üç kanon sorusu kalktı; günün sorusu tek soru olarak duruyor.
 */

const VIKI = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay'];

/** Gün → sabit sayı (aynı gün hep aynı madde) */
const gunSayisi = (gun: string) => Array.from(gun).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function gununMaddesi(items: Item[], gun = istanbulGunu()): Item | null {
  const adaylar = items
    .filter(i => !i.archived && !i.isProposal && VIKI.includes(i.type))
    .filter(i => getKunyeFields(i).length > 0 || getArticleBody(i).some(b => b.text.trim().length > 40))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!adaylar.length) return null;
  return adaylar[gunSayisi(gun) % adaylar.length];
}

interface Props {
  items: Item[];
  onMadde: (i: Item) => void;
  onTepsi: () => void;
  className?: string;
}

export const AdaKarti: React.FC<Props> = ({ items, onMadde, onTepsi, className = '' }) => {
  const gun = istanbulGunu();
  const madde = useMemo(() => gununMaddesi(items, gun), [items, gun]);
  const kunye = madde ? getKunyeFields(madde).slice(0, 4) : [];
  const parca = madde ? (getArticleBody(madde).find(b => b.text.trim())?.text || '').trim() : '';
  const kisa = parca.length > 260 ? parca.slice(0, 260).replace(/\s+\S*$/, '') + '…' : parca;

  const oneriler = useMemo(() => items
    .filter(i => i.type === 'aday' && !i.archived)
    .map(i => ({ i, o: yapayZekaOnerisi(i) as (ReturnType<typeof yapayZekaOnerisi> & { gece?: { gun: string; tur: string; baslik: string } }) | undefined }))
    .filter(x => x.o?.gece)
    .sort((a, b) => b.i.createdAt - a.i.createdAt)
    .slice(0, 3), [items]);

  // Bugün neden öneri yok? (2 Ekim: sabah hâlâ boştu) Gece defterinden okunur
  const defter = geceDurumu(items);
  const neden = oneriler.length ? null
    : defter.hata && defter.sonHata ? `Bugünkü hazırlık olmadı: ${defter.hata} Bir saat sonra kendiliğinden yeniden denenir.`
    : defter.sonGun === gun ? 'Bugünün önerileri hazırlandı; tepside eklenmiş ya da silinmiş.'
    : null;

  return (
    <section className={`rounded-2xl bg-[#0E1C4F] dark:bg-[#13204A] dark:border dark:border-[#2C3C72] text-[#F3EFE8] p-4 lg:p-5 ${className}`}>
      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] flex-1">
        {/* Ada'dan bilgi */}
        <div className="min-w-0 flex flex-col">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#A6B0C9]">Ada'dan bilgi · bugün</div>
          {madde ? (
            <>
              <h2 className="mt-1 text-[20px] font-bold leading-tight">{madde.title}</h2>
              {/* Düzada da 'yer' kaydı; altına "Mahalle" yazılmasın (2 Ekim) */}
              <div className="text-[11px] text-[#A6B0C9]">{madde.id === ADA_KIMLIGI ? 'Ada' : TYPE_LABELS[madde.type] || madde.type}</div>
              {kunye.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                  {kunye.map((k, idx) => (
                    <React.Fragment key={`${k.id}-${idx}`}>
                      <dt className="text-[#A6B0C9]">{k.label}</dt>
                      <dd className="text-[#F3EFE8] min-w-0 truncate">{k.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              {kisa && <p className="mt-3 text-[13px] leading-relaxed text-[#C9D0E3]">{kisa}</p>}
              <button type="button" onClick={() => onMadde(madde)} className="mt-auto pt-3 self-start inline-flex items-center gap-1 text-[12px] font-semibold text-[#F26B6F] hover:underline cursor-pointer">
                Maddeyi aç <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-[#C9D0E3]">Vikide künyesi dolu madde yok.</p>
          )}
        </div>

        {/* Bugünün önerileri */}
        <div className="min-w-0 flex flex-col md:border-l md:border-white/10 md:pl-4">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#A6B0C9] flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#F26B6F]" /> Bugünün üretim önerileri
          </div>
          {oneriler.length ? (
            <ul className="mt-2 space-y-2">
              {oneriler.map(({ i, o }) => (
                <li key={i.id}>
                  <button type="button" onClick={onTepsi} className="w-full text-left rounded-xl bg-white/[0.06] hover:bg-white/[0.12] p-2.5 cursor-pointer">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F26B6F]">{GECE_TURLERI.find(t => t.id === o!.gece!.tur)?.ad || o!.gece!.tur}</span>
                    <span className="block text-[13px] font-semibold leading-snug">{o!.gece!.baslik}</span>
                    <span className="block mt-0.5 text-[12px] leading-snug text-[#C9D0E3] line-clamp-2">{o!.metin}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-[#C9D0E3]">
              Stüdyo her gün üç öneri hazırlar (gece, ya da sabah ilk açılışta). Hazır olunca burada ve öneri tepsisinde görünür.
            </p>
          )}
          {neden && (
            <p className="mt-2 text-[12px] leading-relaxed text-[#F26B6F]">{neden}</p>
          )}
          {oneriler.length > 0 && <p className="mt-auto pt-2 text-[11px] text-[#A6B0C9]">Ayrıntı ve "Ekle" öneri tepsisinde.</p>}
        </div>
      </div>
    </section>
  );
};

export default AdaKarti;
