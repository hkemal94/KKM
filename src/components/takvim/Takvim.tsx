import React, { useEffect, useMemo, useState } from 'react';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { BolumBasligi, BosSatir } from '../kabuk/Parcalar';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Item } from '../../types';
import {
  AY_ADLARI, GUN_ADLARI, GUN_KISA, KANALLAR, TURLER, asamasi, ayIzgarasi, bosYerler, bugunTarih, gonderiBilgisi,
  gonderiGuncelle, gonderiler, seriBilgisi, seriler, tarihYaz, turBul, turStili, TUR_SINIFI, yeniGonderi,
  type GonderiBilgisi
} from '../../lib/sosyal';
import { dropTarihi, takvimOlaylari, type TakvimOlayi, type TakvimTuru } from '../../lib/takvim';
import { ajansGunu, ajansIcsEtkinlikleri } from '../../lib/ajansTakvimi';
import { icsUret, type IcsEtkinlik } from '../../lib/takvimIcs';
import { GonderiKarti } from '../sosyal/GonderiKarti';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Birleşik Takvim (1 Ekim, Kemal: "tek ve birleşik bir takvim olsun").
 * Drop çıkışları, sosyal medya gönderileri, seri boş yerleri ve ayın fanzin
 * günü tek yerde. Sosyal medyanın kendi takvimi buraya taşındı; orada
 * fikir kutusu, seriler ve ızgara kaldı.
 *
 * Telefon: hafta şeridi → seçili gün → yaklaşanlar.
 * Masaüstü: ay ızgarası (gönderi sürüklenip başka güne bırakılır), yanda
 * seçili gün, tarihsiz fikirler ve yaklaşanlar.
 *
 * Hiçbir şey kendiliğinden kaydolmaz: seri boş yerleri yalnız görünür,
 * gönderi Kemal basınca açılır. Drop tarihi Merch'te girilir.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** Süzgeç türleri; renkler markadan (kiremit, çam, bej) */
const TUR: Record<TakvimTuru, { ad: string; renk: string }> = {
  drop: { ad: 'Drop', renk: '#F26B6F' },
  gonderi: { ad: 'Gönderi', renk: '#336659' },
  fanzin: { ad: 'Fanzin', renk: '#BBA591' }
};

/** Ajansın düzenli işleri (yalnız ekranda; kayıt değil) */
const AJANS_RENGI = '#0E1C4F';

const ASAMA_RENGI: Record<string, string> = {
  Fikir: 'bg-[#F3EFE8] text-[#6A5E4C] dark:bg-[#17345A] dark:text-[#A6B0C9]',
  Taslak: 'bg-[#F3EFE8] text-[#6A5E4C] dark:bg-[#17345A] dark:text-[#A6B0C9]',
  Hazır: 'bg-[#E5EFE3] text-[#3F6B45] dark:bg-[#23452B] dark:text-[#B9D8BC]',
  Paylaşıldı: 'bg-[#0E1C4F] text-white dark:bg-[#2C3C72]'
};

/** '2026-10-05' ± gün */
const gunEkle = (t: string, n: number) => {
  const d = new Date(t + 'T12:00');
  d.setDate(d.getDate() + n);
  return tarihYaz(d.getFullYear(), d.getMonth(), d.getDate());
};
const haftaBasi = (t: string) => gunEkle(t, -((new Date(t + 'T12:00').getDay() + 6) % 7));
const gunAdi = (t: string) => {
  const d = new Date(t + 'T12:00');
  return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${GUN_ADLARI[(d.getDay() + 6) % 7]}`;
};

interface Props {
  items: Item[];
  /** Drop ve fanzin kendi sayfasında açılır */
  onAc: (o: TakvimOlayi) => void;
  onAddItem: (item: YeniKayit & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  /** Sosyal medya → Seriler → "Takvimde gör": o seri süzülü gelir */
  seriIstegi?: { id: string; n: number } | null;
  /** Başka yerden basılan gönderi */
  acilacakId?: string | null;
}

export const Takvim: React.FC<Props> = ({ items, onAc, onAddItem, onUpdateItem, onDeleteItem, seriIstegi, acilacakId = null }) => {
  const bugun = bugunTarih();
  const [secili, setSecili] = useState(bugun);
  const [acik, setAcik] = useState<Record<TakvimTuru, boolean>>({ drop: true, gonderi: true, fanzin: true });
  const [ajansAcik, setAjansAcik] = useState(true);
  const [kanalSuz, setKanalSuz] = useState('');
  const [seriSuz, setSeriSuz] = useState('');
  const [acikId, setAcikId] = useState<string | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);
  const [hedef, setHedef] = useState<string | null>(null);

  useEffect(() => {
    if (!seriIstegi) return;
    setSeriSuz(seriIstegi.id); setKanalSuz(''); setAcik(a => ({ ...a, gonderi: true })); setSecili(bugunTarih());
  }, [seriIstegi]);
  useEffect(() => {
    const k = acilacakId ? items.find(i => i.id === acilacakId) : undefined;
    if (k?.type === 'sosyal_gonderi') { setAcikId(k.id); const t = gonderiBilgisi(k).tarih; if (t) setSecili(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acilacakId]);

  const ay = useMemo(() => { const d = new Date(secili + 'T12:00'); return { y: d.getFullYear(), a: d.getMonth() }; }, [secili]);

  const tum = useMemo(() => gonderiler(items), [items]);
  const seriListesi = useMemo(() => seriler(items).sort((a, b) => a.createdAt - b.createdAt), [items]);
  const seriBul = (id: string) => seriListesi.find(s => s.id === id);
  const uyar = (g: Item) => {
    const b = gonderiBilgisi(g);
    return (!kanalSuz || b.kanallar.includes(kanalSuz)) && (!seriSuz || b.seriId === seriSuz);
  };
  const tarihli = acik.gonderi ? tum.filter(g => gonderiBilgisi(g).tarih && uyar(g)) : [];
  const fikirler = tum.filter(g => !gonderiBilgisi(g).tarih && uyar(g)).sort((a, b) => b.createdAt - a.createdAt);
  const gunde = (t: string) => tarihli.filter(g => gonderiBilgisi(g).tarih === t)
    .sort((a, b) => (gonderiBilgisi(a).saat || '99').localeCompare(gonderiBilgisi(b).saat || '99'));

  /*
   * Drop, fanzin ve seri boş yerleri ay ay hesaplanır. Seçili ay, bugünün
   * ayı ve sonraki ay (yaklaşanlar 30 günü kapsar) birlikte.
   */
  const aylar = useMemo(() => {
    const b = new Date(bugun + 'T12:00');
    const liste = [[ay.y, ay.a], [b.getFullYear(), b.getMonth()], [new Date(b.getFullYear(), b.getMonth() + 1, 1).getFullYear(), new Date(b.getFullYear(), b.getMonth() + 1, 1).getMonth()]];
    // Hafta şeridi ay sınırını aşabilir
    const hb = new Date(haftaBasi(secili) + 'T12:00'), hs = new Date(gunEkle(haftaBasi(secili), 6) + 'T12:00');
    liste.push([hb.getFullYear(), hb.getMonth()], [hs.getFullYear(), hs.getMonth()]);
    return [...new Map(liste.map(([y, a]) => [`${y}-${a}`, [y, a] as [number, number]])).values()];
  }, [ay, bugun, secili]);
  const turler = (['drop', 'fanzin'] as TakvimTuru[]).filter(t => acik[t]);
  const olaylar = useMemo(() => {
    const m = new Map<string, TakvimOlayi[]>();
    for (const [y, a] of aylar) for (const [k, v] of takvimOlaylari(items, y, a, turler)) m.set(k, v);
    return m;
  }, [items, aylar, turler.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const bosYer = useMemo(() => {
    const m = new Map<string, Item[]>();
    if (!acik.gonderi) return m;
    for (const s of seriListesi) {
      if (seriSuz && s.id !== seriSuz) continue;
      if (kanalSuz && !seriBilgisi(s).kanallar.includes(kanalSuz)) continue;
      for (const [y, a] of aylar) for (const t of bosYerler(s, tum, y, a, bugun)) m.set(t, [...(m.get(t) || []), s]);
    }
    return m;
  }, [seriListesi, tum, aylar, bugun, seriSuz, kanalSuz, acik.gonderi]);
  const doluMu = (t: string) => (olaylar.get(t)?.length || 0) + gunde(t).length + (bosYer.get(t)?.length || 0) > 0;

  const yeni = (b: Partial<GonderiBilgisi>) => {
    const id = `sosyal_gonderi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setAcikId(id);
    void onAddItem({ ...yeniGonderi(b), id });
  };
  const seriIcin = (seri: Item, tarih: string) => yeni({ tarih, seriId: seri.id, kanallar: seriBilgisi(seri).kanallar });
  const tasi = (id: string | null, tarih: string) => {
    const g = id && tum.find(x => x.id === id);
    setSurukle(null); setHedef(null);
    if (g && gonderiBilgisi(g).tarih !== tarih) void onUpdateItem(gonderiGuncelle(g, { tarih }));
  };
  const birak = (tarih: string) => ({
    onDragOver: (e: React.DragEvent) => { if (surukle) { e.preventDefault(); setHedef(tarih || 'fikir'); } },
    onDragLeave: () => setHedef(h => (h === (tarih || 'fikir') ? null : h)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); tasi(surukle || e.dataTransfer.getData('text/plain'), tarih); }
  });
  const ayDegis = (n: number) => {
    const d = new Date(ay.y, ay.a + n, 1);
    const buAy = d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
    setSecili(buAy ? bugun : tarihYaz(d.getFullYear(), d.getMonth(), 1));
  };
  /** Ajansın düzenli işleri + takvimdeki tarihli KKM etkinlikleri tek .ics dosyası olarak iner */
  const icsIndir = () => {
    const canli = items.filter(i => !i.archived && !i.isProposal);
    const kkm: IcsEtkinlik[] = [];
    for (const d of canli.filter(i => i.type === 'drop')) {
      const t = dropTarihi(d);
      if (t) kkm.push({ uid: `kkm-drop-${d.id}@kkm.kems`, baslik: `Drop çıkışı · ${d.title}`, tarih: t });
    }
    for (const g of tum) {
      const b = gonderiBilgisi(g);
      if (b.tarih) kkm.push({ uid: `kkm-gonderi-${g.id}@kkm.kems`, baslik: g.title || 'Adsız gönderi', tarih: b.tarih, saat: b.saat || undefined });
    }
    // Fanzin taslağı her ayın ilk günü hazırlanır
    kkm.push({ uid: 'kkm-fanzin@kkm.kems', baslik: 'Fanzin taslağı hazırlanır', tarih: `${bugun.slice(0, 8)}01`, kural: 'FREQ=MONTHLY;BYMONTHDAY=1' });
    const dosya = new Blob([icsUret([...ajansIcsEtkinlikleri(), ...kkm])], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(dosya);
    a.download = 'kems-takvim.ics';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const acikGonderi = acikId ? tum.find(g => g.id === acikId) : undefined;

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
        draggable
        onDragStart={e => { setSurukle(g.id); e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setSurukle(null); setHedef(null); }}
        onClick={() => setAcikId(g.id)}
        title={g.title}
        className={`rounded-lg border-l-4 bg-[#FAF8F5] dark:bg-[#13204A] cursor-pointer hover:bg-white dark:hover:bg-[#17345A] shadow-[0_1px_2px_rgba(14,28,79,0.06)] ${ince ? 'px-1.5 py-1' : 'px-3 py-2.5'} ${surukle === g.id ? 'opacity-40' : ''}`}
        style={{ borderLeftColor: seri ? seriBilgisi(seri).renk : TUR.gonderi.renk }}
      >
        <div className={`flex items-center gap-1.5 min-w-0 font-semibold ${YAZI} ${ince ? 'text-[11px]' : 'text-[14px]'}`}>
          {tur && <i className={`w-2 h-2 rounded-full shrink-0 block ${TUR_SINIFI}`} style={turStili(tur.id)} />}
          <span className="truncate">{b.saat && !ince ? `${b.saat} · ` : ''}{g.title || 'Adsız gönderi'}</span>
        </div>
        <div className={`flex flex-wrap items-center gap-1 mt-0.5 ${IKINCIL} ${ince ? 'text-[9px]' : 'text-[12px]'}`}>
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

  const bosYerCip = (s: Item, tarih: string, ince?: boolean) => (
    <button
      key={s.id}
      type="button"
      onClick={() => seriIcin(s, tarih)}
      title={`${s.title} · boş yer — basınca gönderi açılır`}
      className={`w-full text-left rounded-lg border-[1.5px] border-dashed border-l-4 border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL} hover:border-[#F26B6F] cursor-pointer ${ince ? 'px-1.5 py-1 text-[10.5px]' : 'min-h-11 px-3 py-2 text-[13px]'}`}
      style={{ borderLeftColor: seriBilgisi(s).renk }}
    >
      <span className="font-semibold truncate block">{s.title}</span>
      <span className={ince ? 'text-[9px]' : 'text-[12px]'}>boş · ekle</span>
    </button>
  );

  const olayCip = (o: TakvimOlayi, ince = false) => (
    <button key={o.id} type="button" onClick={() => onAc(o)} title={`${TUR[o.tur].ad} · ${o.baslik}`}
      className={`w-full text-left rounded-lg border-l-4 bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} hover:bg-white dark:hover:bg-[#17345A] cursor-pointer shadow-[0_1px_2px_rgba(14,28,79,0.06)] ${ince ? 'px-1.5 py-0.5 text-[10.5px]' : 'min-h-11 px-3 py-2 text-[14px]'}`}
      style={{ borderLeftColor: TUR[o.tur].renk }}>
      <span className="block truncate font-semibold">{o.tur === 'drop' ? 'Drop çıkışı · ' : ''}{o.baslik}</span>
      {!ince && <span className={`text-[12px] ${IKINCIL}`}>{TUR[o.tur].ad}</span>}
    </button>
  );

  const ajansBlogu = (aj: ReturnType<typeof ajansGunu>) => aj.length > 0 && (
    <div className="rounded-lg border-l-4 bg-[#FAF8F5] dark:bg-[#13204A] px-3 py-2 shadow-[0_1px_2px_rgba(14,28,79,0.06)]" style={{ borderLeftColor: AJANS_RENGI }}>
      <div className={`${ETIKET} mb-1`}>Ajans · İstanbul saati</div>
      <ul className={`space-y-0.5 text-[13px] ${YAZI}`}>
        {aj.map(i => <li key={i.id}><span className="font-bold tabular-nums">{i.saat}</span> · {i.ad}</li>)}
      </ul>
    </div>
  );

  /** Bir günün bütün içeriği; boşsa "boş · ekle" */
  const gunIcerigi = (t: string) => {
    const liste = gunde(t);
    const bos = bosYer.get(t) || [];
    const ol = olaylar.get(t) || [];
    const aj = ajansAcik ? ajansGunu(t) : [];
    if (!liste.length && !bos.length && !ol.length) {
      return (
        <div className="space-y-1.5">
          <BosSatir yazi="Bu gün boş" onEkle={() => yeni({ tarih: t })} />
          {ajansBlogu(aj)}
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {ajansBlogu(aj)}
        {ol.map(o => olayCip(o))}
        {liste.map(g => gonderiCip(g))}
        {bos.map(s => bosYerCip(s, t))}
      </div>
    );
  };

  const cipSinifi = (on: boolean) => `shrink-0 min-h-11 lg:min-h-0 inline-flex items-center gap-1.5 px-3.5 lg:px-3 lg:py-1.5 rounded-full text-[13px] lg:text-[12px] font-semibold border cursor-pointer whitespace-nowrap ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] border-transparent' : `bg-[#FAF8F5] dark:bg-[#13204A] border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL}`}`;

  const Suzgec = (
    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
      {(Object.keys(TUR) as TakvimTuru[]).map(t => (
        <button key={t} type="button" onClick={() => setAcik(a => ({ ...a, [t]: !a[t] }))} aria-pressed={acik[t]} className={cipSinifi(acik[t])}>
          <i className="w-2.5 h-2.5 rounded-full block" style={{ background: TUR[t].renk }} /> {TUR[t].ad}
        </button>
      ))}
      <button type="button" onClick={() => setAjansAcik(a => !a)} aria-pressed={ajansAcik} className={cipSinifi(ajansAcik)} title="Ajansın düzenli işleri (sabah planı, gece işleri, kapanış)">
        <i className="w-2.5 h-2.5 rounded-full block" style={{ background: AJANS_RENGI }} /> Ajans
      </button>
      {acik.gonderi && <span className="shrink-0 w-px my-2 bg-[#CFC5B4] dark:bg-[#2C3C72]" />}
      {acik.gonderi && KANALLAR.map(k => <button key={k.id} type="button" onClick={() => setKanalSuz(s => (s === k.id ? '' : k.id))} className={cipSinifi(kanalSuz === k.id)}>{k.ad}</button>)}
      {acik.gonderi && seriListesi.length > 0 && (
        <select value={seriSuz} onChange={e => setSeriSuz(e.target.value)} className={`${cipSinifi(!!seriSuz)} pr-1 focus:outline-hidden`}>
          <option value="">Bütün seriler</option>
          {seriListesi.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      )}
    </div>
  );

  const OK = `w-11 h-11 lg:w-9 lg:h-9 rounded-full bg-[#FAF8F5] dark:bg-[#13204A] flex items-center justify-center ${IKINCIL} cursor-pointer hover:text-[#F26B6F] shadow-[0_1px_2px_rgba(14,28,79,0.06)]`;

  // Telefon: hafta şeridi
  const hb = haftaBasi(secili);
  const hafta = Array.from({ length: 7 }, (_, n) => gunEkle(hb, n));
  const haftaAyi = (() => { const d = new Date(hafta[3] + 'T12:00'); return `${AY_ADLARI[d.getMonth()]} ${d.getFullYear()}`; })();
  const HaftaSeridi = (
    <div className={`${KART} p-2`}>
      <div className="flex items-center gap-1 px-1 pb-2">
        <button type="button" onClick={() => setSecili(s => gunEkle(s, -7))} aria-label="Önceki hafta" className={OK}><ChevronLeft className="w-4 h-4" /></button>
        <div className={`flex-1 text-center text-[16px] font-bold ${YAZI}`}>{haftaAyi}</div>
        <button type="button" onClick={() => setSecili(s => gunEkle(s, 7))} aria-label="Sonraki hafta" className={OK}><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {hafta.map((t, n) => {
          const d = new Date(t + 'T12:00');
          const bu = t === secili;
          const turlerBu = [
            ...(olaylar.get(t) || []).map(o => TUR[o.tur].renk),
            ...(gunde(t).length ? [TUR.gonderi.renk] : []),
            ...((bosYer.get(t) || []).length ? ['transparent'] : []),
            ...(ajansAcik ? [AJANS_RENGI] : [])
          ];
          return (
            <button key={t} type="button" onClick={() => setSecili(t)} aria-pressed={bu}
              className={`min-h-[64px] rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${bu ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]' : t === bugun ? 'bg-[#F26B6F]/12 text-[#0E1C4F] dark:text-[#F3EFE8]' : `${YAZI}`}`}>
              <span className={`text-[12px] font-semibold ${bu ? 'text-[#A6B0C9]' : IKINCIL}`}>{GUN_KISA[n]}</span>
              <span className={`text-[17px] font-bold leading-none ${!bu && t === bugun ? 'text-[#D6484C] dark:text-[#F26B6F]' : ''}`}>{d.getDate()}</span>
              <span className="flex gap-0.5 h-1.5">
                {[...new Set(turlerBu)].slice(0, 3).map(r => (
                  <i key={r} className={`w-1.5 h-1.5 rounded-full block ${r === 'transparent' ? 'border border-dashed border-current opacity-60' : ''}`} style={r === 'transparent' ? undefined : { background: r }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Masaüstü: ay ızgarası
  const AyIzgarasi = (
    <div className="grid grid-cols-7 gap-px rounded-2xl overflow-hidden bg-[#E4DCCD] dark:bg-[#2C3C72] shadow-[0_1px_2px_rgba(14,28,79,0.05),0_4px_14px_rgba(14,28,79,0.06)]">
      {GUN_KISA.map(g => <div key={g} className={`bg-[#F3EFE8] dark:bg-[#17345A] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${IKINCIL}`}>{g}</div>)}
      {ayIzgarasi(ay.y, ay.a).map((gun, n) => {
        if (!gun) return <div key={`b${n}`} className="bg-[#EFE9DF] dark:bg-[#0F1A3D] min-h-[112px]" />;
        const t = tarihYaz(ay.y, ay.a, gun);
        return (
          <div key={t} {...birak(t)} onClick={e => { if (e.target === e.currentTarget) setSecili(t); }}
            className={`group relative min-h-[112px] p-1.5 space-y-1 cursor-default ${hedef === t ? 'bg-[#FDECEC] dark:bg-[#3A2440]' : t === secili ? 'bg-white dark:bg-[#1B2A5C] ring-2 ring-inset ring-[#0E1C4F]/60 dark:ring-[#A6B0C9]/50' : t < bugun ? 'bg-[#F7F4EF] dark:bg-[#111C42]' : 'bg-[#FAF8F5] dark:bg-[#13204A]'}`}>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setSecili(t)} title="Günü seç" className={`text-[12px] font-bold w-6 h-6 flex items-center justify-center rounded-full cursor-pointer ${t === bugun ? 'bg-[#F26B6F] text-white' : t < bugun ? 'text-[#B3A894] dark:text-[#6F7BA0]' : YAZI}`}>{gun}</button>
              <button type="button" onClick={() => yeni({ tarih: t })} title="Bu güne gönderi" className={`w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 ${IKINCIL} hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer`}><Plus className="w-3.5 h-3.5" /></button>
            </div>
            {ajansAcik && (
              <button type="button" onClick={() => setSecili(t)} title={ajansGunu(t).map(i => `${i.saat} ${i.ad}`).join('\n')}
                className={`w-full text-left rounded-lg border-l-4 bg-[#FAF8F5] dark:bg-[#13204A] px-1.5 py-0.5 text-[10.5px] font-semibold cursor-pointer ${YAZI}`} style={{ borderLeftColor: AJANS_RENGI }}>
                Ajans · {ajansGunu(t).length} iş
              </button>
            )}
            {(olaylar.get(t) || []).map(o => olayCip(o, true))}
            {gunde(t).map(g => gonderiCip(g, true))}
            {(bosYer.get(t) || []).map(s => bosYerCip(s, t, true))}
          </div>
        );
      })}
    </div>
  );

  // Yaklaşanlar: bugünden 30 gün, yalnız dolu günler
  const yaklasan = Array.from({ length: 30 }, (_, n) => gunEkle(bugun, n)).filter(t => t !== secili && doluMu(t));
  const Yaklasanlar = (
    <section className="space-y-2">
      <BolumBasligi baslik="Yaklaşanlar · 30 gün" sayi={yaklasan.length} renk="bekliyor" />
      {yaklasan.length === 0 && <p className={`text-[13px] ${IKINCIL}`}>Önümüzdeki 30 gün boş.</p>}
      {yaklasan.map(t => {
        const d = new Date(t + 'T12:00');
        return (
          <div key={t} className="flex gap-3">
            <button type="button" onClick={() => setSecili(t)} className="w-11 shrink-0 text-center pt-1.5 cursor-pointer">
              <div className={`text-[20px] font-bold leading-none ${t === bugun ? 'text-[#D6484C] dark:text-[#F26B6F]' : YAZI}`}>{d.getDate()}</div>
              <div className={`text-[12px] font-semibold ${IKINCIL}`}>{GUN_KISA[(d.getDay() + 6) % 7]}</div>
            </button>
            <div className="flex-1 min-w-0 pb-2">{gunIcerigi(t)}</div>
          </div>
        );
      })}
    </section>
  );

  const SeciliGun = (
    <section className="space-y-2">
      <BolumBasligi
        baslik={secili === bugun ? `Bugün · ${gunAdi(secili)}` : gunAdi(secili)}
        renk="dikkat"
        ek={<button type="button" onClick={() => yeni({ tarih: secili })} className={DUGME_BOS}><Plus className="w-3.5 h-3.5" /> Gönderi</button>}
      />
      {gunIcerigi(secili)}
    </section>
  );

  const Fikirler = (
    <section {...birak('')} className={`${KART} p-3 space-y-2 ${hedef === 'fikir' ? 'ring-2 ring-[#F26B6F]' : ''}`}>
      <div className={ETIKET}>Tarihsiz gönderi fikirleri{fikirler.length ? ` · ${fikirler.length}` : ''}</div>
      {fikirler.length === 0 && <p className={`text-[12px] ${IKINCIL}`}>Tarihi olmayan gönderi fikri yok. Fikirler Sosyal medya sayfasında yazılır.</p>}
      <div className="space-y-1.5 max-h-[32vh] overflow-y-auto">{fikirler.map(g => gonderiCip(g, true))}</div>
      {fikirler.length > 0 && <p className={`text-[11px] ${IKINCIL}`}>Bir fikri takvimde bir güne sürükle, tarih alır. Günden buraya sürüklersen tarihi kalkar.</p>}
    </section>
  );

  const TurLejanti = (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${IKINCIL}`}>
      <span className={ETIKET}>Gönderi türü · yalnız KKM</span>
      {TURLER.map(t => <span key={t.id} className="inline-flex items-center gap-1"><i className={`w-2 h-2 rounded-full block ${TUR_SINIFI}`} style={turStili(t.id)} />{t.ad}</span>)}
    </div>
  );

  const buAyMi = ay.y === new Date().getFullYear() && ay.a === new Date().getMonth();

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SayfaBasi baslik="Takvim">
        {secili !== bugun && <button type="button" onClick={() => setSecili(bugun)} className={DUGME_BOS}>Bugün</button>}
        <button type="button" onClick={icsIndir} title="Ajansın düzenli işleri ve tarihli etkinlikler .ics olarak iner; Google ya da Apple Takvim'e eklenir" className={DUGME_BOS}><CalendarPlus className="w-3.5 h-3.5" /> Takvimime ekle (.ics)</button>
        <span className="hidden lg:inline"><button type="button" onClick={() => yeni({ tarih: secili })} className={DUGME_LAC}><Plus className="w-3.5 h-3.5" /> Gönderi</button></span>
      </SayfaBasi>

      {Suzgec}

      {/* TELEFON */}
      <div className="lg:hidden space-y-5">
        {HaftaSeridi}
        {SeciliGun}
        {Yaklasanlar}
        {TurLejanti}
      </div>

      {/* MASAÜSTÜ */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => ayDegis(-1)} aria-label="Önceki ay" className={OK}><ChevronLeft className="w-4 h-4" /></button>
            <div className={`min-w-[150px] text-center text-[17px] font-bold ${YAZI}`}>{AY_ADLARI[ay.a]} {ay.y}</div>
            <button type="button" onClick={() => ayDegis(1)} aria-label="Sonraki ay" className={OK}><ChevronRight className="w-4 h-4" /></button>
            {!buAyMi && <button type="button" onClick={() => setSecili(bugun)} className={DUGME_BOS}>Bu ay</button>}
          </div>
          {AyIzgarasi}
          {TurLejanti}
        </div>
        <div className="space-y-5">
          {SeciliGun}
          {acik.gonderi && Fikirler}
          {Yaklasanlar}
        </div>
      </div>

      {acikGonderi && (
        <GonderiKarti item={acikGonderi} items={items} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} onKapat={() => setAcikId(null)} />
      )}
    </div>
  );
};

export default Takvim;
