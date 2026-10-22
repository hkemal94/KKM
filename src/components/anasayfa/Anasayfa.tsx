import { BekleyenIsler } from './BekleyenIsler';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CalendarDays, ChevronDown, Gamepad2, Globe, Milestone, Newspaper, Search, Sparkles, Users } from 'lucide-react';
import { useMasaustu } from '../kabuk/KatlanirBolum';
import type { Item } from '../../types';
import { durumOranlari } from '../../lib/durumOranlari';
import { adayKaydi, soruyuErtele, sorulacaklar } from '../../lib/adaylar';
import { gununSorusuBitti } from '../../lib/bildirimler';
import { gununSorusuAcik } from '../../lib/oneriKanallari';
import { eksikleriCikar } from '../../lib/eksikler';
import { YuzdeSeridi, type SeritHedefi } from './YuzdeSeridi';
import { SoruKarti } from './SoruKarti';
import { OneriTepsisi } from '../studyo/OneriTepsisi';
import type { StudyoIslemleri } from '../studyo/StudyoBaglami';
import { EksikOzeti } from './EksikOzeti';
import { NotDefteri } from './NotDefteri';
import { DuzadaKarti } from './DuzadaKarti';
import { AdaKarti } from './AdaKarti';
import { ETIKET, KART, IKINCIL, YAZI } from './stil';

/**
 * Ana sayfadaki kısayollar (30 Eylül, Kemal: "büyük şeyler çok derinlere
 * saklanmış"). 7 Ekim: "Bütün araçlar" ekranı kalktı; Fanzin Yazı'da,
 * Takvim ve Yol haritası Durum'da açılır.
 */
const KISAYOLLAR: Array<{ id: 'fanzin' | 'takvim' | 'yolharitasi' | 'studyo' | 'site' | 'ajans' | 'oyun'; ad: string; simge: React.ElementType }> = [
  { id: 'fanzin', ad: 'Fanzin', simge: Newspaper },
  { id: 'takvim', ad: 'Takvim', simge: CalendarDays },
  { id: 'yolharitasi', ad: 'Yol haritası', simge: Milestone },
  { id: 'studyo', ad: 'Yapay zekâ', simge: Sparkles },
  { id: 'site', ad: 'Site', simge: Globe },
  { id: 'ajans', ad: 'Ajans', simge: Users },
  { id: 'oyun', ad: 'Oyun', simge: Gamepad2 }
];
/** Listesi olan yüzdeler Durum'da maddelerin listesini açar (7 Ekim) */
const seritHedefi = (h: SeritHedefi): Hedef => (h === 'kunye' || h === 'kitap' || h === 'harita' ? `durum-${h}` : h);

/**
 * Ana sayfa (Paket 4). Kemal onayladı, 29 Eylül:
 *   Masaüstü: tek ekran — yüzde şeridi, üretim atölyesi, günün sorusu,
 *   adaylar, neyin eksik, not defteri, Düzada kartı.
 *   Telefon (2 Ekim, Kemal: "kaydırma ekranını beğenmedim, her yer çok tuş
 *   oldu"; "yukarı sekmeleri kaldırıp açılır kapanır bir şey"): sekme ve
 *   kısayol şeridi yok. Tek sayfa, alt alta açılır-kapanır bölümler:
 *   Bugün (açık) · Ada · Notlar · Durum. Araçlar Diğer menüsünde.
 *
 * Atölye yalnız kanon sorusu getirir. Yapay zekâ seçenekleri artık
 * stüdyoda (29 Eylül akşamı): ana sayfa açılınca kendiliğinden yapay
 * zekâya sorulmuyor. Adaylar kutusu yerine öneri tepsisinin ilk üçü.
 */

export type TelSekmesi = 'bugun' | 'atolye' | 'notlar' | 'durum';

type Hedef = SeritHedefi | 'eksikler' | 'harita' | 'fanzin' | 'takvim' | 'yolharitasi' | 'studyo' | 'site' | 'ajans' | 'oyun' | `durum-${'kunye' | 'kitap' | 'harita'}`;

interface Props {
  items: Item[];
  bugunDugmeler: string[];
  onGit: (hedef: Hedef, ayrinti?: string | null) => void;
  onMaddeyiAc: (item: Item) => void;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
  /** Öneri tepsisi (stüdyoyla ortak) */
  studyo: StudyoIslemleri;
  onOpenSearch: () => void;
  /** Günün sorusu cevaplanınca bildirimler yeniden sayılsın */
  onBildirimYenile: () => void;
  /** Başlıktaki zil (App'ten) */
  zil: React.ReactNode;
  /** "+" ile yeni not sayfası isteği */
  yeniNotBekliyor: boolean;
  /** Kiremit "+" (Not / Fikir), App'ten gelir */
  arti: React.ReactNode;
  onYeniNotAcildi: () => void;
  sekme: TelSekmesi;
  onSekme: (s: TelSekmesi) => void;
}

function selam(): string {
  const s = new Date().getHours();
  if (s >= 5 && s < 11) return 'Günaydın';
  if (s < 17 && s >= 11) return 'İyi günler';
  if (s < 22 && s >= 17) return 'İyi akşamlar';
  return 'İyi geceler';
}

export const Anasayfa: React.FC<Props> = ({
  items, bugunDugmeler, onGit, onMaddeyiAc, onAddItem, onUpdateItem, onDeleteItem, onAlanSil, studyo,
  onOpenSearch, onBildirimYenile, zil, yeniNotBekliyor, arti, onYeniNotAcildi, sekme, onSekme
}) => {
  const [nabiz, setNabiz] = useState(0);
  const oranlar = useMemo(() => durumOranlari(items), [items]);
  const eksikler = useMemo(() => eksikleriCikar(items), [items]);
  const sorular = useMemo(() => sorulacaklar(items, 40), [items, nabiz]); // eslint-disable-line react-hooks/exhaustive-deps
  const gununSorusu = sorular[0];
  const adaySayisi = useMemo(() => items.filter(i => i.type === 'aday' && !i.archived).length, [items]);
  const cevapla = useCallback((gunun: boolean) => async (b: NonNullable<typeof gununSorusu>, cevap: string, secenektenMi: boolean) => {
    await onAddItem(adayKaydi(b, cevap, secenektenMi));
    if (gunun) { gununSorusuBitti(); onBildirimYenile(); }
  }, [onAddItem, onBildirimYenile]);
  const ertele = useCallback((gunun: boolean, anahtar: string) => {
    soruyuErtele(anahtar);
    if (gunun) { gununSorusuBitti(); onBildirimYenile(); }
    setNabiz(n => n + 1);
  }, [onBildirimYenile]);

  // Telefonda açık bölümler; "+ Not" gibi dışarıdan gelen istek o bölümü açar
  const masa = useMasaustu();
  const [acik, setAcik] = useState<Set<TelSekmesi>>(() => new Set<TelSekmesi>(['bugun', sekme]));
  useEffect(() => { setAcik(a => (a.has(sekme) ? a : new Set([...a, sekme]))); }, [sekme]);
  const cevir = useCallback((s: TelSekmesi) => {
    const aciliyor = !acik.has(s);
    setAcik(a => {
      const y = new Set(a);
      if (y.has(s)) y.delete(s); else y.add(s);
      return y;
    });
    if (aciliyor) {
      onSekme(s);
    }
  }, [acik, onSekme]);

  const tarih = useMemo(() => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }), []);

  const TEL_SEKMELERI: Array<{ id: TelSekmesi; ad: string; rozet?: number }> = useMemo(() => [
    { id: 'bugun', ad: 'Bugün', rozet: adaySayisi || undefined },
    { id: 'atolye', ad: 'Ada' },
    { id: 'notlar', ad: 'Notlar' },
    { id: 'durum', ad: 'Durum' }
  ], [adaySayisi]);

  const soruAcik = useMemo(() => gununSorusuAcik(items), [items]);
  const gununSorusuKarti = soruAcik && (
    <section className={`${KART} p-4`}>
      <div className={ETIKET}>Günün sorusu</div>
      <div className="mt-2">
        {gununSorusu ? (
          <SoruKarti
            bosluk={gununSorusu}
            buyuk
            onCevap={(c, s) => cevapla(true)(gununSorusu, c, s)}
            onSonra={() => ertele(true, gununSorusu.anahtar)}
          />
        ) : (
          <p className={`text-[12px] ${IKINCIL}`}>Sorulacak boşluk kalmadı.</p>
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-3 lg:space-y-4 animate-in fade-in duration-300">
      {/* Selamlama */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-mono uppercase tracking-[0.2em] ${IKINCIL}`}>{tarih}</div>
          <h1 className={`mt-1 font-bold tracking-tight leading-tight text-[20px] lg:text-[28px] ${YAZI}`}>
            {selam()}, Kemal. <em className="not-italic text-[#D6484C] dark:text-[#F26B6F] block lg:inline">Bugün adada ne üretelim?</em>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onOpenSearch} className={`hidden lg:flex items-center gap-2 w-56 px-3 py-2 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] text-[12px] ${IKINCIL} hover:border-[#F26B6F] cursor-pointer`}>
            <Search className="w-3.5 h-3.5" /> Ara <kbd className="ml-auto text-[10px]">⌘K</kbd>
          </button>
          <button type="button" onClick={onOpenSearch} title="Ara" className={`lg:hidden w-11 h-11 rounded-full flex items-center justify-center border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] ${IKINCIL} cursor-pointer`}>
            <Search className="w-4 h-4" />
          </button>
          <span className="lg:hidden">{zil}</span>
          {arti}
        </div>
      </div>

      {!masa && (
        <div className="space-y-2.5">
          {TEL_SEKMELERI.map(b => {
            const ac = acik.has(b.id);
            return (
              <section key={b.id} className="space-y-2.5">
                <button type="button" onClick={() => cevir(b.id)} aria-expanded={ac}
                  className={`${KART} w-full min-h-12 px-4 flex items-center gap-2 text-left cursor-pointer`}>
                  <span className={`text-[14px] font-bold ${YAZI}`}>{b.ad}</span>
                  {b.rozet ? <span className="px-1.5 rounded-full bg-[#F26B6F] text-white text-[10px] font-bold">{b.rozet}</span> : null}
                  <ChevronDown className={`ml-auto w-4 h-4 ${IKINCIL} transition-transform ${ac ? '' : '-rotate-90'}`} />
                </button>
                {ac && b.id === 'bugun' && (
                  <>
                    <BekleyenIsler items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onDeleteItem={onDeleteItem} onAlanSil={onAlanSil} />
                    <EksikOzeti eksikler={eksikler} dugmeler={bugunDugmeler} onAc={x => onGit('eksikler', x)} />
                    {gununSorusuKarti}
                    <OneriTepsisi {...studyo} sinir={3} />
                  </>
                )}
                {ac && b.id === 'atolye' && <AdaKarti items={items} onMadde={onMaddeyiAc} onTepsi={studyo.onStudyoSayfasi} className="flex flex-col" />}
                {ac && b.id === 'notlar' && (
                  <NotDefteri items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onMaddeAc={onMaddeyiAc} uzun yeniSayfaBekliyor={yeniNotBekliyor} onYeniSayfaAcildi={onYeniNotAcildi} />
                )}
                {ac && b.id === 'durum' && (
                  <>
                    <YuzdeSeridi oranlar={oranlar} onSec={h => onGit(seritHedefi(h))} />
                    <DuzadaKarti items={items} onHarita={() => onGit('harita')} onMadde={onMaddeyiAc} />
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {masa && (<>
      {/* Bekleyen tek seferlik işler (3 Ekim, Kemal: "onlara buton ver, aratma bana") */}
      <BekleyenIsler items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onDeleteItem={onDeleteItem} onAlanSil={onAlanSil} />

      {/*
        Kısayollar (30 Eylül, Kemal: "büyük şeyler çok derinlere saklanmış"):
        büyük araçlar ana sayfadan tek dokunuşla. Yalnız masaüstünde.
      */}
      <div className="grid grid-cols-7 gap-2">
          {KISAYOLLAR.map(a => (
            <button key={a.id} type="button" onClick={() => onGit(a.id)}
              className={`${KART} p-3 text-left hover:border-[#F26B6F] cursor-pointer`}>
              <a.simge className="w-5 h-5 text-[#F26B6F]" />
              <span className={`mt-2 block text-[13px] font-bold leading-tight ${YAZI}`}>{a.ad}</span>
            </button>
          ))}
      </div>

      {/* Yüzde şeridi */}
      <div>
        <YuzdeSeridi oranlar={oranlar} onSec={h => onGit(seritHedefi(h))} />
      </div>

      {/*
        Hizalama (Kemal, 30 Eylül: "kartlar hizasız"): iki sıra da aynı üç
        sütunlu ızgarada; atölye iki sütun kaplar. Bir sıradaki kartlar en
        uzununun boyuna uzar, alt kenarları aynı çizgide biter.
      */}
      <div className="grid gap-4 grid-cols-3 items-stretch">
        {/* Ada'dan bilgi + bugünün üretim önerileri (yapisal-4); atölyenin üç sorusu kalktı */}
        <AdaKarti
          items={items}
          onMadde={onMaddeyiAc}
          onTepsi={studyo.onStudyoSayfasi}
          className="col-span-2 flex flex-col"
        />

        <div className="flex flex-col gap-3 lg:gap-4 min-w-0">
          {gununSorusuKarti}

          <div className="flex-1 [&>*]:h-full">
            <OneriTepsisi {...studyo} sinir={3} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-3 items-stretch">
        <div className="min-w-0 [&>*]:h-full">
          <EksikOzeti eksikler={eksikler} dugmeler={bugunDugmeler} onAc={a => onGit('eksikler', a)} />
        </div>
        <div className="min-w-0 [&>*]:h-full">
          <NotDefteri items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onMaddeAc={onMaddeyiAc} uzun={false} yeniSayfaBekliyor={yeniNotBekliyor} onYeniSayfaAcildi={onYeniNotAcildi} />
        </div>
        <div className="min-w-0 [&>*]:h-full">
          <DuzadaKarti items={items} onHarita={() => onGit('harita')} onMadde={onMaddeyiAc} />
        </div>
      </div>
      </>)}
    </div>
  );
};

export default Anasayfa;
