import React, { useMemo } from 'react';
import type { Item } from '../../types';
import type { AileAgaci as AileAgaciVerisi, AileAgaciKisisi } from '../../lib/aileAgaci';
import { adiCoz } from '../../lib/alanSablonu';
import { maddeGorseli, siluetMi } from '../../lib/maddeGorseli';
import { useGorselSurumu } from '../../lib/gorselOnbellek';
import { AileOku, KisiAdi, KisiPortresi, onyil, portreBul, yilYazisi } from './AileAgaci';
import { soyDegeri } from './soyDegeri';

/**
 * Aile maddesi "Albüm" (24 Kasım, Kemal B1'i seçti):
 *  - üstte kuşak kuşak tam boy aile bandı (en eski solda; görseli olmayan
 *    silüet, hayatta olmayan eski fotoğraf çerçevesinde sepya)
 *  - sağda kartlar: Yaşadığı yer, Aile evi, Evlilikle gelenler, Bu aileden
 *    doğanlar (başka soyadıyla), Üyelerin bağlı yerleri.
 * Hepsi künyelerden ve bağlardan ekranda hesaplanır; metin yazılmaz, kayda
 * bir şey yazılmaz. Bilgi yoksa kart çıkmaz.
 */

/** Tam boy görsel (`/viki/tamboy-…`); yoksa silüet */
const tamBoy = (i: Item | undefined) => (i?.images || []).find(g => typeof g === 'string' && g.startsWith('/viki/tamboy-'));

const Siluet: React.FC<{ olmus?: boolean }> = ({ olmus }) => (
  <svg viewBox="0 0 60 150" className="h-full w-auto" aria-hidden>
    <g className={olmus ? 'fill-[#9C8160]' : 'fill-[#0E1C4F] dark:fill-[#F3EFE8]'} fillOpacity={olmus ? 0.5 : 0.18}>
      <circle cx={30} cy={17} r={12} />
      <path d="M14 36 Q30 30 46 36 L50 86 L43 87 L41 148 L32 148 L30 96 L28 148 L19 148 L17 87 L10 86 Z" />
    </g>
  </svg>
);

/** Üstteki aile bandı */
export const AileBandi: React.FC<{ agac: AileAgaciVerisi; allItems: Item[]; onNavigate: (id: string) => void }> = ({ agac, allItems, onNavigate }) => {
  const gorselSurumu = useGorselSurumu();
  const madde = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);
  const sirali = useMemo(() => [...agac.kisiler].sort((a, b) => {
    const da = a.yasam?.bas, db = b.yasam?.bas;
    if (da !== undefined && db !== undefined && da !== db) return da - db;
    if (da === undefined && db !== undefined) return 1;
    if (db === undefined && da !== undefined) return -1;
    return (agac.kusak.get(a.id) ?? 0) - (agac.kusak.get(b.id) ?? 0) || a.ad.localeCompare(b.ad, 'tr');
  }), [agac]);
  const gorseller = useMemo(() => new Map(sirali.map(k => [k.id, tamBoy(madde.get(k.id))] as const)), [sirali, madde, gorselSurumu]);
  if (!sirali.length) return null;
  let sonOnyil = '';
  return (
    <figure className="mb-6 rounded-3xl border border-[#E2D9CA] dark:border-[#2C3C72] bg-[#F3EFE8] dark:bg-[#13204A] overflow-hidden m-0">
      <div className="overflow-x-auto">
        <div className="flex items-end gap-2 sm:gap-3 px-3 sm:px-5 pt-4 min-w-max sm:min-w-0">
          {sirali.map((k, n) => {
            const g = gorseller.get(k.id);
            return (
              <button key={k.id} type="button" onClick={() => onNavigate(k.id)} title={k.ad}
                className="group flex-1 min-w-[92px] sm:min-w-[96px] max-w-[150px] flex flex-col items-center text-center cursor-pointer">
                <div className={`h-[150px] sm:h-[210px] w-full flex items-end justify-center ${k.olmus
                  ? 'bg-[#FBF8F1] p-1.5 pb-3 shadow-[0_4px_12px_-5px_rgba(14,28,79,0.45)] border border-[#E4DCCB]' : ''}`}
                  style={k.olmus ? { transform: `rotate(${n % 2 ? 1.6 : -1.6}deg)` } : undefined}>
                  <div className={`h-full w-full flex items-end justify-center ${k.olmus ? 'bg-[#E9DFCB]' : ''}`}>
                    {g ? (
                      <img src={g} alt="" className={`h-full w-full object-contain object-bottom ${k.olmus ? '[filter:grayscale(1)_sepia(0.5)_contrast(1.05)]' : ''}`} />
                    ) : <Siluet olmus={k.olmus} />}
                  </div>
                </div>
                <span className="mt-2 text-[13px] sm:text-[14px] font-semibold leading-tight text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#B4474B] line-clamp-2"><KisiAdi ad={k.ad} /></span>
                <span className="text-[11.5px] sm:text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-tight min-h-[1.2em]">{yilYazisi(k)}</span>
              </button>
            );
          })}
        </div>
        {/* Onyıl şeridi: her onyıl ilk kişisinin altında */}
        <div className="flex gap-2 sm:gap-3 px-3 sm:px-5 mt-2 py-1.5 bg-[#E6DCCB] dark:bg-[#0E1733] min-w-max sm:min-w-0">
          {sirali.map(k => {
            const o = k.yasam ? onyil(k.yasam.bas) : '';
            const yaz = o && o !== sonOnyil;
            if (o) sonOnyil = o;
            return (
              <span key={k.id} className="flex-1 min-w-[92px] sm:min-w-[96px] max-w-[150px] text-center text-[11px] font-semibold tracking-[0.14em] uppercase text-[#6B5320] dark:text-[#C9D0E0]">
                {yaz ? o : ''}
              </span>
            );
          })}
        </div>
      </div>
      <figcaption className="sr-only">Aile, kuşak kuşak; en eski solda</figcaption>
    </figure>
  );
};

const KART = 'rounded-2xl border border-[#E2D9CA] dark:border-[#2C3C72] bg-white dark:bg-[#13204A] overflow-hidden';
const BASLIK = 'text-[10.5px] font-semibold tracking-[0.16em] uppercase text-[#6A5E4C] dark:text-[#A6B0C9]';
const YER_TURLERI = new Set(['yer', 'cadde', 'meydan', 'yer_adi', 'ada']);
const KISI = new Set(['kisi', 'karakter']);

/** Sağdaki kartlar */
export const AileYanKartlari: React.FC<{ aile: Item; agac: AileAgaciVerisi; allItems: Item[]; onNavigate: (id: string) => void }> = ({ aile, agac, allItems, onNavigate }) => {
  const gorselSurumu = useGorselSurumu();
  const madde = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);
  const canli = useMemo(() => allItems.filter(i => !i.archived && !i.isProposal), [allItems]);

  /** Yaşadığı yer: ailenin "Mahalle"si; yoksa üyelerin künyesinde en çok geçen mahalle */
  const yer = useMemo(() => {
    const kendi = String(aile.metadata?.region || '').trim();
    const yerler = canli.filter(i => YER_TURLERI.has(i.type));
    if (kendi) return { ad: kendi, madde: adiCoz(kendi, yerler), kaynak: 'aile' as const };
    const sayim = new Map<string, number>();
    for (const k of agac.kisiler) {
      if (k.yer !== 'uye' && k.yer !== 'gelen') continue;
      const r = String(madde.get(k.id)?.metadata?.region || '').trim();
      if (r) sayim.set(r, (sayim.get(r) || 0) + 1);
    }
    const en = [...sayim.entries()].sort((a, b) => b[1] - a[1])[0];
    return en ? { ad: en[0], madde: adiCoz(en[0], yerler), kaynak: 'uyeler' as const } : null;
  }, [aile, canli, agac, madde]);
  const yerGorseli = useMemo(() => {
    const g = yer?.madde ? maddeGorseli(yer.madde, allItems) : undefined;
    return g && !siluetMi(g) ? g : undefined;
  }, [yer, allItems, gorselSurumu]);

  /** Aile evi: üyelerin künyesindeki "Evi" */
  const evler = useMemo(() => {
    const gorulen = new Set<string>();
    return agac.kisiler.filter(k => k.yer === 'uye' || k.yer === 'gelen')
      .map(k => ({ k, ev: soyDegeri(madde.get(k.id)!, 'evi').trim() }))
      .filter(x => x.ev && !gorulen.has(x.ev.toLocaleLowerCase('tr')) && !!gorulen.add(x.ev.toLocaleLowerCase('tr')))
      // Önce hayatta olan, ailenin soyadını taşıyan üye; en çok ayrıntı veren önde; en çok iki satır
      .sort((a, b) => Number(a.k.olmus) - Number(b.k.olmus) || Number(a.k.yer !== 'uye') - Number(b.k.yer !== 'uye') || b.ev.length - a.ev.length)
      .slice(0, 2);
  }, [agac, madde]);

  const gelenler = agac.kisiler.filter(k => k.yer === 'gelen');
  const doganlar = agac.kisiler.filter(k => k.yer === 'dogan' || k.yer === 'soy');

  /** Üyelerin bağlı yerleri: kişilerin mekân, dükkân, kulüp ve markaya bağları ile "Çalıştığı yer" */
  const bagliYerler = useMemo(() => {
    const m = new Map<string, { i: Item; kim: Set<string> }>();
    const ekle = (i: Item | null | undefined, kim: string) => {
      if (!i || i.archived || i.isProposal || KISI.has(i.type) || i.type === 'aile' || YER_TURLERI.has(i.type) || i.id === aile.id) return;
      if (!m.has(i.id)) m.set(i.id, { i, kim: new Set() });
      m.get(i.id)!.kim.add(kim);
    };
    for (const k of agac.kisiler) {
      const i = madde.get(k.id);
      if (!i) continue;
      for (const r of (i.metadata?.relations as Array<{ targetId?: string; isProposal?: boolean }> | undefined) || []) {
        if (r?.targetId && !r.isProposal) ekle(madde.get(r.targetId), k.id);
      }
      const is = soyDegeri(i, 'workplace').replace(/\s*\(.*\)\s*$/, '').trim();
      if (is) ekle(adiCoz(is, canli.filter(x => !KISI.has(x.type))), k.id);
    }
    return [...m.values()].sort((a, b) => b.kim.size - a.kim.size || a.i.title.localeCompare(b.i.title, 'tr')).slice(0, 5);
  }, [agac, madde, canli, aile.id]);
  const kisiAdi = (id: string) => agac.kisiler.find(k => k.id === id)?.ad || '';

  const kisiSatiri = (k: AileAgaciKisisi, alt: string) => (
    <li key={k.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <button type="button" onClick={() => onNavigate(k.id)} className="shrink-0 cursor-pointer" aria-label={k.ad}>
        <KisiPortresi gorsel={portreBul(madde.get(k.id), allItems)} ad={k.ad} olmus={k.olmus} boyut={38} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onNavigate(k.id)} className="block text-left text-[14px] font-medium leading-snug text-[#0E1C4F] dark:text-[#F3EFE8] hover:text-[#B4474B] cursor-pointer">
          <KisiAdi ad={k.ad} />
        </button>
        <div className="text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-snug">{alt}</div>
        {k.baglar.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{k.baglar.map(b => <AileOku key={b.aileId} ad={b.ad} onClick={() => onNavigate(b.aileId)} />)}</div>}
      </div>
    </li>
  );

  return (
    <div className="space-y-3 mt-3">
      {yer && (
        <div className={KART}>
          {yerGorseli && (
            <button type="button" onClick={() => yer.madde && onNavigate(yer.madde.id)} className="block w-full cursor-pointer" aria-label={yer.ad}>
              <img src={yerGorseli} alt="" className="block w-full h-32 object-cover" />
            </button>
          )}
          <div className="px-4 py-3">
            <div className={BASLIK}>Yaşadığı yer</div>
            {yer.madde ? (
              <button type="button" onClick={() => onNavigate(yer.madde!.id)} className="text-left text-[16px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:text-[#B4474B] cursor-pointer">{yer.ad}</button>
            ) : <div className="text-[16px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{yer.ad}</div>}
            <div className="text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">{yer.kaynak === 'aile' ? 'Ailenin künyesinden' : 'Üyelerin künyesinden'}</div>
          </div>
        </div>
      )}
      {evler.length > 0 && (
        <div className={`${KART} px-4 py-3`}>
          <div className={BASLIK}>Aile evi</div>
          <ul className="mt-1.5 space-y-1.5">
            {evler.map(({ k, ev }) => (
              <li key={k.id} className="text-[13px] leading-snug text-[#0E1C4F] dark:text-[#F3EFE8]">
                {ev}
                <span className="block text-[11.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">künyeden: <KisiAdi ad={k.ad} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {gelenler.length > 0 && (
        <div className={`${KART} px-4 py-3`}>
          <div className={`${BASLIK} mb-2`}>Evlilikle gelenler</div>
          <ul className="divide-y divide-[#EFE8DC] dark:divide-[#2C3C72]">
            {gelenler.map(k => kisiSatiri(k, [k.dogumSoyadi ? `doğumda ${k.dogumSoyadi}` : '', yilYazisi(k)].filter(Boolean).join(' · ')))}
          </ul>
        </div>
      )}
      {doganlar.length > 0 && (
        <div className={`${KART} px-4 py-3`}>
          <div className={`${BASLIK} mb-2`}>Bu aileden doğanlar · başka soyadıyla</div>
          <ul className="divide-y divide-[#EFE8DC] dark:divide-[#2C3C72]">
            {doganlar.map(k => kisiSatiri(k, [k.yer === 'soy' ? 'torunu' : k.dogumSoyadi ? `doğumda ${k.dogumSoyadi}` : '', yilYazisi(k)].filter(Boolean).join(' · ')))}
          </ul>
        </div>
      )}
      {bagliYerler.length > 0 && (
        <div className={`${KART} px-4 py-3`}>
          <div className={`${BASLIK} mb-2`}>Üyelerin bağlı yerleri</div>
          <ul className="space-y-2">
            {bagliYerler.map(({ i, kim }) => {
              const g = maddeGorseli(i, allItems);
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => onNavigate(i.id)} className="w-full flex items-center gap-2.5 text-left cursor-pointer group">
                    {g && !siluetMi(g)
                      ? <img src={g} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 border border-[#E2D9CA] dark:border-[#2C3C72]" />
                      : <span className="w-11 h-11 rounded-lg shrink-0 bg-[#F3EFE8] dark:bg-[#2C3C72]" />}
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium leading-snug text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#B4474B]">{i.title}</span>
                      <span className="block text-[11.5px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-snug">
                        {[...kim].map((id, n) => <React.Fragment key={id}>{n ? ', ' : ''}<KisiAdi ad={kisiAdi(id)} /></React.Fragment>)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
