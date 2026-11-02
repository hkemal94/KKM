import React, { useState } from 'react';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { ArrowLeft, ArrowRight, CircleCheck, CircleDashed } from 'lucide-react';
import { BolumBasligi, BosSatir, IlerlemeHalkasi, Kuyu, StudyoKarti } from '../kabuk/Parcalar';
import type { Item } from '../../types';
import { fanzinBilgisi } from '../../lib/studyo';
import { StudyodaAc } from '../studyo/StudyodaAc';
import { Fanzin } from './Fanzin';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';

/**
 * Fanzin kendi sayfasında (30 Eylül: menüde kendi satırı). Fanzinler yine
 * birer yazı kaydı; Yazı'da da görünürler. Burada yalnız fanzinler.
 * 1 Ekim (Kemal: "Fanzin'i çok beğendim", Stitch iskeleti): son sayı kartı
 * (kapak, durum, ilerleme halkası, üç kutucuk), yazı listesi, önceki
 * sayılar ve stüdyo kartı. İçerik yalnız Kemal'in kayıtlarından.
 */
export const FanzinSayfasi: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onStudyo: () => void;
  onMaddeAc?: (id: string) => void;
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
}> = ({ items, onUpdateItem, onStudyo, onMaddeAc, onAddItem }) => {
  const fanzinler = items.filter(i => i.type === 'blog_post' && !i.archived && fanzinBilgisi(i)).sort((a, b) => b.createdAt - a.createdAt);
  const bekleyen = items.filter(i => i.type === 'aday' && !i.archived && (i.metadata?.aday as { arac?: string } | undefined)?.arac === 'fanzin');
  const [acik, setAcik] = useState<string | null>(null);
  const secili = fanzinler.find(f => f.id === acik);

  if (secili) {
    return (
      <div className="space-y-3 animate-in fade-in duration-300">
        <button type="button" onClick={() => setAcik(null)} className={`${DUGME_BOS} inline-flex items-center gap-1`}><ArrowLeft className="w-3.5 h-3.5" /> Fanzinler</button>
        <Fanzin yazi={secili} onUpdateItem={onUpdateItem} items={items} onMaddeAc={onMaddeAc} onAddItem={onAddItem} />
      </div>
    );
  }
  const sonSayi = fanzinler[0];
  const oncekiler = fanzinler.slice(1);
  /** Bir sayının doluluk oranı: metni yazılmış bölüm / bütün bölümler */
  const doluluk = (f: Item) => {
    const b = fanzinBilgisi(f)!.bolumler;
    return b.length ? Math.round((b.filter(x => x.metin.trim()).length / b.length) * 100) : 0;
  };
  const kapak = (f: Item, buyuk = false) => (
    f.images?.[0]
      ? <img src={f.images[0]} alt="" className={`${buyuk ? 'w-28 h-36 lg:w-36 lg:h-48' : 'w-12 h-16'} rounded-lg object-cover shrink-0`} />
      : (
        <div className={`${buyuk ? 'w-28 h-36 lg:w-36 lg:h-48 p-3' : 'w-12 h-16 p-1.5'} rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] flex flex-col justify-between shrink-0`}>
          <span className={`${buyuk ? 'text-[12px]' : 'text-[7px]'} font-bold uppercase tracking-[0.14em] text-[#F26B6F]`}>Fanzin</span>
          <span className={`${buyuk ? 'text-[12px]' : 'hidden'} leading-tight text-[#C9D0E3]`}>kapak görseli yok</span>
        </div>
      )
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <SayfaBasi baslik="Fanzin">
        <StudyodaAc arac="fanzin" etiket="Bu ayın fanzini · stüdyo" />
      </SayfaBasi>
      {bekleyen.length > 0 && (
        <button type="button" onClick={onStudyo} className={`${KART} w-full min-h-11 p-3 text-left text-[13px] ${YAZI} hover:ring-2 hover:ring-[#F26B6F]/40 cursor-pointer`}>
          Öneri tepsisinde {bekleyen.length} fanzin taslağı bekliyor · aç
        </button>
      )}

      {!sonSayi ? (
        <BosSatir yazi="Henüz fanzin yok. Taslak her ayın ilk günü gece öneri tepsisine düşer." />
      ) : (
        <>
          {/* Son sayı: kapak, durum, ilerleme (1 Ekim, Stitch iskeleti) */}
          <section className="space-y-2">
            <BolumBasligi baslik="Son sayı" />
            <div className={`${KART} p-4 lg:p-5`}>
              <div className="flex gap-4">
                {kapak(sonSayi, true)}
                <div className="flex-1 min-w-0 space-y-2">
                  <h2 className={`text-[20px] lg:text-[24px] font-bold leading-tight ${YAZI}`}>{sonSayi.title}</h2>
                  <div className="flex items-center gap-3">
                    <IlerlemeHalkasi yuzde={doluluk(sonSayi)} boyut={52} />
                    <span className={`text-[13px] ${IKINCIL}`}>bölümlerin yazılmış olanı</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Kuyu etiket="Bölüm">{fanzinBilgisi(sonSayi)!.bolumler.length || undefined}</Kuyu>
                <Kuyu etiket="Ay">{fanzinBilgisi(sonSayi)!.ay || undefined}</Kuyu>
                <Kuyu etiket="Değişti">{neZaman(sonSayi.updatedAt)}</Kuyu>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setAcik(sonSayi.id)} className={DUGME_LAC}>Sayıyı aç <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </section>

          {/* Yazılar: bölümler, durum simgesiyle */}
          <section className="space-y-2">
            <BolumBasligi baslik="Bu sayının yazıları" sayi={fanzinBilgisi(sonSayi)!.bolumler.length} renk="bitti" />
            {fanzinBilgisi(sonSayi)!.bolumler.length === 0 ? (
              <BosSatir yazi="Bölüm yok" onEkle={() => setAcik(sonSayi.id)} />
            ) : (
              <ul className={`${KART} p-1.5`}>
                {fanzinBilgisi(sonSayi)!.bolumler.map((b, n) => {
                  const yazili = !!b.metin.trim();
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => setAcik(sonSayi.id)} className="w-full min-h-11 flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[#F3EFE8] dark:hover:bg-[#0B132B] cursor-pointer">
                        {yazili ? <CircleCheck className="w-5 h-5 shrink-0 text-[#336659]" /> : <CircleDashed className="w-5 h-5 shrink-0 text-[#BBA591]" />}
                        <span className={`flex-1 min-w-0 truncate text-[14px] font-semibold ${YAZI}`}>{b.baslik.trim() || `Bölüm ${n + 1} · başlıksız`}</span>
                        <span className={`text-[12px] ${IKINCIL}`}>{yazili ? b.ton : 'boş'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {oncekiler.length > 0 && (
            <section className="space-y-2">
              <BolumBasligi baslik="Önceki sayılar" sayi={oncekiler.length} renk="bekliyor" />
              <ul className="grid gap-2 sm:grid-cols-2">
                {oncekiler.map(f => (
                  <li key={f.id}>
                    <button type="button" onClick={() => setAcik(f.id)} className={`${KART} w-full p-3 flex items-center gap-3 text-left hover:ring-2 hover:ring-[#F26B6F]/40 cursor-pointer`}>
                      {kapak(f)}
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[15px] font-bold truncate ${YAZI}`}>{f.title}</span>
                        <span className={`block mt-0.5 text-[12px] ${IKINCIL}`}>{fanzinBilgisi(f)!.bolumler.length} bölüm · {neZaman(f.updatedAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <StudyoKarti baslik="Bu ayın fanzini" aciklama="Bölüm taslağı, ton değişikliği; sonuç öneri tepsisine düşer." istek={{ arac: 'fanzin' }} />
    </div>
  );
};

export default FanzinSayfasi;
