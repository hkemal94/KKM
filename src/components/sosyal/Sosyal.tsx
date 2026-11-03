import { SayfaBasi } from '../kabuk/SayfaBasi';
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, EyeOff, Eye } from 'lucide-react';
import type { Item } from '../../types';
import {
  ASAMA_RENGI, KANALLAR, TURLER, asamasi, bugunTarih, gonderiBilgisi,
  gonderiler, seriBilgisi, seriler, turBul, turStili, TUR_SINIFI, yeniGonderi,
  type GonderiBilgisi
} from '../../lib/sosyal';
import { GonderiKarti } from './GonderiKarti';
import { SeriListesi } from './Seriler';
import { GonderiListesi } from './GonderiListesi';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Sosyal medya sayfası (Araçlar, 29 Eylül gece).
 *
 * 1 Ekim: takvimi birleşik Takvim sayfasına taşındı ("Takvimde aç").
 * Burada fikir kutusu (tarihsiz gönderiler), seriler ve Instagram ızgarası.
 * Telefon: sekmeler — Gönderiler · Fikirler · Seriler · Izgara.
 * 3 Kasım: Gönderiler sekmesi; her gönderi bir kart, ajansın taslakları üstte
 * (`GonderiListesi`).
 * Hiçbir şey kendiliğinden kaydolmaz: seri boş yerleri yalnız görünür,
 * gönderi Kemal basınca açılır. Paylaşımı Kemal yapar.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;
type Gorunum = 'gonderi' | 'fikir' | 'seri' | 'izgara';

interface Props {
  items: Item[];
  onAddItem: (item: YeniKayit & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  /** Birleşik Takvim'e git; seri verilirse o seri süzülü açılır (1 Ekim) */
  onTakvim: (seriId?: string) => void;
  /** Başka sayfadan (ör. "Son dokunulanlar") basılan gönderi ya da seri */
  acilacakId?: string | null;
}

const IZGARA_ANAHTARI = 'kems_sosyal_izgara';
const izgaraOku = () => { try { return localStorage.getItem(IZGARA_ANAHTARI) !== 'kapali'; } catch { return true; } };
const izgaraYaz = (acik: boolean) => { try { localStorage.setItem(IZGARA_ANAHTARI, acik ? 'acik' : 'kapali'); } catch { /* yok */ } };

export const Sosyal: React.FC<Props> = ({ items, onAddItem, onUpdateItem, onDeleteItem, onTakvim, acilacakId = null }) => {
  const bugun = bugunTarih();
  const [gorunum, setGorunum] = useState<Gorunum>('gonderi');
  const [acikId, setAcikId] = useState<string | null>(null);
  const [izgaraAcik, setIzgaraAcik] = useState(izgaraOku);
  useEffect(() => {
    const k = acilacakId ? items.find(i => i.id === acilacakId) : undefined;
    if (!k) return;
    if (k.type === 'sosyal_seri') setGorunum('seri');
    else if (k.type === 'sosyal_gonderi') setAcikId(k.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acilacakId]);

  const tum = useMemo(() => gonderiler(items), [items]);
  const seriListesi = useMemo(() => seriler(items).sort((a, b) => a.createdAt - b.createdAt), [items]);
  const seriBul = (id: string) => seriListesi.find(s => s.id === id);

  const fikirler = tum.filter(g => !gonderiBilgisi(g).tarih).sort((a, b) => b.createdAt - a.createdAt);

  const yeni = (b: Partial<GonderiBilgisi>) => {
    const id = `sosyal_gonderi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setAcikId(id);
    void onAddItem({ ...yeniGonderi(b), id });
  };
  const seriIcin = (seri: Item, tarih: string) => yeni({ tarih, seriId: seri.id, kanallar: seriBilgisi(seri).kanallar });
  const acik = acikId ? tum.find(g => g.id === acikId) : undefined;

  // ---------------------------------------------------------------- parçalar

  // Bileşen değil, düz işlev: sürüklerken yeniden kurulmasın (sürükleme kopar)
  const gonderiCip = (g: Item, ince?: boolean) => {
    const b = gonderiBilgisi(g);
    const seri = seriBul(b.seriId);
    const tur = turBul(b.tur);
    const asama = asamasi(g);
    return (
      <div
        key={g.id}
        onClick={() => setAcikId(g.id)}
        title={g.title}
        className={`rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] border-l-4 bg-[#FAF8F5] dark:bg-[#13204A] cursor-pointer hover:border-[#F26B6F] ${ince ? 'px-1.5 py-1' : 'px-2.5 py-2'}`}
        style={{ borderLeftColor: seri ? seriBilgisi(seri).renk : undefined }}
      >
        <div className={`flex items-center gap-1.5 min-w-0 font-semibold ${YAZI} ${ince ? 'text-[11px]' : 'text-[13px]'}`}>
          {tur && <i className={`w-2 h-2 rounded-full shrink-0 block ${TUR_SINIFI}`} style={turStili(tur.id)} />}
          <span className="truncate">{b.saat && !ince ? `${b.saat} · ` : ''}{g.title}</span>
        </div>
        <div className={`flex flex-wrap items-center gap-1 mt-0.5 ${IKINCIL} ${ince ? 'text-[9px]' : 'text-[10.5px]'}`}>
          {b.kanallar.map(k => {
            const kanal = KANALLAR.find(x => x.id === k);
            return kanal && <span key={k} className={`font-bold px-1 rounded border border-[#CFC5B4] dark:border-[#2C3C72] ${b.paylasilan.includes(k) ? 'bg-[#0E1C4F] text-white dark:bg-[#2C3C72] border-transparent' : 'bg-white dark:bg-[#17345A]'}`}>{kanal.kisa}</span>;
          })}
          <span className={`font-bold uppercase tracking-wide px-1 rounded ${ASAMA_RENGI[asama]}`}>{asama}</span>
          {seri && !ince && <span className="truncate">· {seri.title}</span>}
        </div>
      </div>
    );
  };

  const FikirKutusu = (
    <section className={`${KART} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`flex-1 ${ETIKET}`}>Fikir kutusu · tarihsiz{fikirler.length ? ` · ${fikirler.length}` : ''}</div>
        <button type="button" onClick={() => yeni({})} className={`${DUGME_BOS} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Fikir</button>
      </div>
      {fikirler.length === 0 && <p className={`text-[12px] ${IKINCIL}`}>Tarihi olmayan fikirler burada durur.</p>}
      <div className="space-y-1.5 lg:max-h-[46vh] lg:overflow-y-auto">
        {fikirler.map(g => gonderiCip(g))}
      </div>
      <p className={`text-[11px] ${IKINCIL}`}>Tarih vermek için fikri aç, tarih seç; ya da Takvim'de bir güne sürükle.</p>
    </section>
  );

  // Izgara: Instagram'a işaretli, tarihli gönderiler; yeniden eskiye.
  // Paylaşılmamışlar soluk (üstte, çünkü tarihleri ileride).
  const izgara = tum.filter(g => { const b = gonderiBilgisi(g); return b.tarih && b.kanallar.includes('instagram'); })
    .sort((a, b) => gonderiBilgisi(b).tarih.localeCompare(gonderiBilgisi(a).tarih) || (gonderiBilgisi(b).saat || '').localeCompare(gonderiBilgisi(a).saat || ''))
    .slice(0, 18);
  const Izgara = (
    <section className={`${KART} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`flex-1 ${ETIKET}`}>Izgara · Instagram</div>
        <button type="button" onClick={() => { setIzgaraAcik(a => { izgaraYaz(!a); return !a; }); }} title={izgaraAcik ? 'Gizle' : 'Göster'} className={`hidden lg:flex w-7 h-7 rounded-full items-center justify-center ${IKINCIL} hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer`}>
          {izgaraAcik ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className={izgaraAcik ? '' : 'lg:hidden'}>
        {izgara.length === 0 ? (
          <p className={`text-[12px] ${IKINCIL}`}>Instagram'a işaretli, tarihli gönderi yok.</p>
        ) : (
          <div className="grid grid-cols-3 gap-[3px]">
            {izgara.map(g => {
              const b = gonderiBilgisi(g);
              const paylasildi = b.paylasilan.includes('instagram');
              const gorsel = g.images?.[0];
              return (
                <button key={g.id} type="button" onClick={() => setAcikId(g.id)} title={`${g.title} · ${b.tarih}`}
                  className={`aspect-square cursor-pointer overflow-hidden ${gorsel ? '' : TUR_SINIFI} ${paylasildi ? '' : 'opacity-45'}`}
                  style={gorsel ? { background: `center/cover no-repeat url("${gorsel}")` } : turStili(b.tur)} />
              );
            })}
          </div>
        )}
        <p className={`mt-2 text-[11px] ${IKINCIL}`}>Soluk kareler henüz paylaşılmadı. Görseli olmayan kare türünün renginde.</p>
      </div>
    </section>
  );

  const TurLejanti = (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${IKINCIL}`}>
      <span className={ETIKET}>Tür · yalnız KKM</span>
      {TURLER.map(t => <span key={t.id} className="inline-flex items-center gap-1"><i className={`w-2 h-2 rounded-full block ${TUR_SINIFI}`} style={turStili(t.id)} />{t.ad}</span>)}
    </div>
  );

  const SEKMELER: Array<{ id: Gorunum; ad: string; masaAdi?: string; telefon?: boolean }> = [
    { id: 'gonderi', ad: 'Gönderiler' },
    { id: 'fikir', ad: `Fikirler${fikirler.length ? ` ${fikirler.length}` : ''}`, masaAdi: 'Fikirler ve ızgara' },
    { id: 'seri', ad: 'Seriler' },
    { id: 'izgara', ad: 'Izgara', telefon: true }
  ];
  // Masaüstünde fikir ve ızgara yan yana; tek sekme "Fikir ve ızgara"
  const AKTIF = 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] border-transparent';
  const PASIF = `bg-[#FAF8F5] dark:bg-[#13204A] ${IKINCIL} border-[#CFC5B4] dark:border-[#2C3C72]`;
  const sekmeSinifi = (id: Gorunum) => {
    if (id === gorunum) return AKTIF;
    if (id === 'fikir' && gorunum === 'izgara') return `${PASIF} lg:bg-[#0E1C4F] lg:dark:bg-[#2C3C72] lg:text-[#F3EFE8] lg:border-transparent`;
    return PASIF;
  };
  const masaSeri = gorunum === 'seri';

  return (
    <div className="space-y-4 animate-in fade-in duration-300 ">
      <SayfaBasi baslik="Sosyal medya">
        <button type="button" onClick={onTakvim} className={`${DUGME_LAC} inline-flex items-center gap-1`}><CalendarDays className="w-3.5 h-3.5" /> Takvimde aç</button>
      </SayfaBasi>

      <div className="flex gap-1.5">
        {SEKMELER.map(s => (
          <button key={s.id} type="button" onClick={() => setGorunum(s.id)}
            className={`${s.telefon ? 'lg:hidden' : ''} flex-1 lg:flex-none lg:px-5 min-h-11 lg:min-h-0 py-2 rounded-xl text-[13px] font-semibold border cursor-pointer ${sekmeSinifi(s.id)}`}>
            {s.masaAdi ? <><span className="lg:hidden">{s.ad}</span><span className="hidden lg:inline">{s.masaAdi}</span></> : s.ad}
          </button>
        ))}
      </div>

      {gorunum === 'gonderi' ? (
        <GonderiListesi items={items} onAddItem={onAddItem} onAc={setAcikId} onYeni={() => yeni({})} />
      ) : masaSeri ? (
        <SeriListesi
          items={items}
          bugun={bugun}
          onAddItem={onAddItem}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
          onTakvimde={id => onTakvim(id)}
          onBosYer={seriIcin}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 items-start space-y-4 lg:space-y-0">
          <div className={`${gorunum === 'fikir' ? '' : 'hidden'} lg:block`}>{FikirKutusu}</div>
          <div className={`${gorunum === 'izgara' ? '' : 'hidden'} lg:block space-y-3`}>{Izgara}{TurLejanti}</div>
        </div>
      )}

      {acik && (
        <GonderiKarti item={acik} items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} onKapat={() => setAcikId(null)} />
      )}
    </div>
  );
};

export default Sosyal;
