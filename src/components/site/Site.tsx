import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, X, Globe, UserRound, Search, ShoppingBag, ArrowLeft, ArrowUpRight } from 'lucide-react';
import type { Item } from '../../types';
import { DuzadaHarita } from '../harita/DuzadaHarita';
import { useHaritaDuzeni } from '../../lib/haritaDuzeni';
import { ATMOSFER_ACIK } from '../harita/atmosferAyari';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { SITE_SAYFALARI, sayfaGorseli, yayindakiAyar, BOS_AYAR, type SiteAyari } from '../../lib/siteAyari';
import { TASLAK_ONIZLEME_ANAHTARI, sitedekiMaddeler, maddeninSayfasi } from './siteOrtak';
import {
  DuzadaSayfasi, VikiSayfasi, MaddeSayfasi, UrunlerSayfasi, HaberlerSayfasi, ProjelerSayfasi,
  HakkindaSayfasi, IletisimSayfasi, SayfaKabugu, YaziSayfasi
} from './SiteSayfalari';

/**
 * Site önizlemesi (29 Eylül gece). kems.company'nin ilk hâli; şimdilik
 * yalnız KKM içinde, tam sayfa (açılır pencere değil — Kemal). Adres
 * çubuğunda `#site`; geri tuşu çalışır.
 *
 * Kemal'in kararları:
 *   - Anasayfa: canlı 3D harita yavaşça döner (manzara videosu gelene
 *     kadar); ortada yarı saydam etiket.
 *   - Sol üstte menü: Dükkân · Keşfet. Menü adları Türkçe.
 *   - Sağ üstte dil, hesap, arama, dükkân. Yalnız arama çalışır; diğerleri
 *     soluk.
 *   - Dükkân sekmesi Merch'teki droplardan gelir; mağaza bağlanana kadar
 *     soluk.
 *   - Sitede yalnız Kemal'in "Sitede göster" dediği maddeler görünür.
 * Keşfet sayfaları (30 Eylül): tema ve boş iskelet `SiteSayfalari.tsx`'te.
 */

type SiteSayfasi = 'ana' | 'duzada' | 'viki' | 'urunler' | 'haberler' | 'projeler' | 'hakkinda' | 'iletisim' | 'ara';

const KESFET: Array<{ id: SiteSayfasi; ad: string; alt: string }> = SITE_SAYFALARI.map(k => ({ ...k }));

/** `#site/viki` → 'viki'; `#site/viki/<kimlik>` → madde; tanınmayan her şey anasayfa */
const hashParcalari = () => (typeof location !== 'undefined' ? location.hash : '').replace(/^#site\/?/, '').split('/');
const hashtenSayfa = (): SiteSayfasi => {
  const p = hashParcalari()[0];
  return (['ara', ...KESFET.map(k => k.id)] as string[]).includes(p) ? p as SiteSayfasi : 'ana';
};
const hashtenMadde = (): string | null => (['viki', 'haberler'].includes(hashParcalari()[0]) && hashParcalari()[1] ? decodeURIComponent(hashParcalari()[1]) : null);
const sayfayaGit = (s: SiteSayfasi, madde?: string) => {
  location.hash = s === 'ana' ? 'site' : `site/${s}${madde ? `/${encodeURIComponent(madde)}` : ''}`;
};

/** Koyu zeminli sayfalar: üst çubuk açık renk alır */
const KOYU: SiteSayfasi[] = ['urunler', 'projeler', 'hakkinda', 'duzada'];

const trKucuk = (s: string) => s.toLocaleLowerCase('tr');

interface Props {
  items: Item[];
  /** KKM'ye dön */
  onKapat: () => void;
}

export const Site: React.FC<Props> = ({ items, onKapat }) => {
  const [sayfa, setSayfa] = useState<SiteSayfasi>(hashtenSayfa);
  const [maddeId, setMaddeId] = useState<string | null>(hashtenMadde);
  const [menuAcik, setMenuAcik] = useState(false);
  const [sekme, setSekme] = useState<'kesfet' | 'dukkan'>('kesfet');
  const [aranan, setAranan] = useState('');
  const { duzen } = useHaritaDuzeni();
  /*
   * Hangi ayarla çizilecek: KKM'de "Taslağı önizle" dendiyse ekrandaki
   * taslak (bu sekmeye özel), yoksa yayındaki.
   */
  const taslak = useMemo((): SiteAyari | null => {
    try {
      const ham = sessionStorage.getItem(TASLAK_ONIZLEME_ANAHTARI);
      return ham ? { ...BOS_AYAR, ...JSON.parse(ham) } : null;
    } catch { return null; }
  }, []);
  const ayar = taslak || yayindakiAyar(items);
  const kesfet = KESFET.filter(k => !ayar.gizli.includes(k.id));
  const kapak = (sf: string) => sayfaGorseli(items, ayar, sf);

  /* Site kapanınca taslak önizleme anahtarı kalmasın (geri tuşuyla çıkılırsa eski taslak açılırdı) */
  useEffect(() => () => { try { sessionStorage.removeItem(TASLAK_ONIZLEME_ANAHTARI); } catch { /* yok */ } }, []);

  useEffect(() => {
    const degisti = () => { setSayfa(hashtenSayfa()); setMaddeId(hashtenMadde()); setMenuAcik(false); };
    window.addEventListener('hashchange', degisti);
    return () => window.removeEventListener('hashchange', degisti);
  }, []);

  useEffect(() => {
    if (!menuAcik) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAcik(false); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [menuAcik]);

  /* Sayfa değişince ekran başa döner; sekme başlığı sayfa adını gösterir (22 Ekim) */
  const icSayfaRef = useRef<HTMLElement | null>(null);
  const gorunenSayfa: SiteSayfasi = ayar.gizli.includes(sayfa) ? 'ana' : sayfa;
  useEffect(() => {
    try { icSayfaRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); } catch { /* yok */ }
  }, [gorunenSayfa, maddeId]);
  const eskiBaslik = useRef(typeof document !== 'undefined' ? document.title : '');
  useEffect(() => {
    const onceki = eskiBaslik.current;
    return () => { document.title = onceki; };
  }, []);
  useEffect(() => {
    const ad = gorunenSayfa === 'ana' ? null : gorunenSayfa === 'ara' ? 'Ara' : KESFET.find(k => k.id === gorunenSayfa)?.ad ?? null;
    document.title = ad ? `${ad} · Kems Company` : 'Kems Company';
  }, [gorunenSayfa]);

  const droplar = useMemo(() => items.filter(i => i.type === 'drop' && !i.archived && !i.isProposal)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr')), [items]);
  const sitedekiler = useMemo(() => sitedekiMaddeler(items), [items]);

  const ana = sayfa === 'ana' || ayar.gizli.includes(sayfa);
  // Harita sayfası da anasayfa gibi: üst çubuk haritanın üstünde saydam
  const saydam = ana;
  const koyu = KOYU.includes(sayfa);
  const madde = maddeId ? sitedekiler.find(i => i.id === maddeId) ?? null : null;
  const sitedeTur = (t: string) => sitedekiler.filter(i => i.type === t).sort((a, b) => b.updatedAt - a.updatedAt);
  const vikiMaddeleri = useMemo(() => sitedekiler.filter(i => TYPE_LABELS[i.type]), [sitedekiler]);
  /** Arama: sitede görünen viki maddeleri, droplar, ürünler ve yazılar (yapisal-2, 8) */
  // Gizlenen sayfanın maddeleri aramada çıkmaz (tıklanınca anasayfaya düşerdi)
  const aranabilir = useMemo(() => sitedekiler.filter(i => (TYPE_LABELS[i.type] || ['drop', 'merch_urun', 'blog_post'].includes(i.type))
    && !ayar.gizli.includes(maddeninSayfasi(i))), [sitedekiler, ayar]);
  const sonucaGit = (i: Item) => {
    if (i.type === 'drop' || i.type === 'merch_urun') sayfayaGit('urunler');
    else if (i.type === 'blog_post') sayfayaGit('haberler', i.id);
    else sayfayaGit('viki', i.id);
  };
  const sonucTuru = (i: Item) => TYPE_LABELS[i.type] || ({ drop: 'Drop', merch_urun: 'Ürün', blog_post: 'Yazı' } as Record<string, string>)[i.type] || i.type;
  const sonuclar = useMemo(() => {
    const q = trKucuk(aranan.trim());
    return aranabilir.filter(i => !q || trKucuk(i.title).includes(q) || trKucuk(i.notes || '').includes(q)).slice(0, 30);
  }, [aranabilir, aranan]);
  // Haritadaki madde Viki sayfasına gider; Viki gizliyse haritada da görünmez
  const haritaMaddeleri = useMemo(() => ayar.gizli.includes('viki') ? [] : vikiMaddeleri.filter(i => ['yer', 'cadde', 'meydan', 'yer_adi', 'mekân', 'dükkân', 'kulüp'].includes(i.type))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr')), [vikiMaddeleri, ayar]);

  const simge = `w-10 h-10 sm:w-[42px] sm:h-[42px] rounded-full flex items-center justify-center border backdrop-blur-md ${saydam ? 'bg-[#0E1C4F]/35 border-[#F3EFE8]/25 text-[#F3EFE8]' : koyu ? 'bg-[#F3EFE8]/10 border-[#F3EFE8]/20 text-[#F3EFE8]' : 'bg-[#0E1C4F] border-transparent text-[#F3EFE8]'}`;

  return (
    <div className="fixed inset-0 overflow-hidden font-sans bg-[#1C4E8C] text-[#F3EFE8]">
      {/* ---- anasayfa: dönen ada ---- */}
      {ana && (
        <>
          <DuzadaHarita vitrin duzen={duzen} atmosfer={ATMOSFER_ACIK} className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(14,28,79,.45),rgba(14,28,79,0)_28%,rgba(14,28,79,0)_70%,rgba(14,28,79,.5))]" />
          <div className="absolute left-1/2 top-[72%] sm:top-1/2 -translate-x-1/2 -translate-y-1/2 text-center px-7 sm:px-10 pt-5 sm:pt-6 pb-4 sm:pb-5 rounded-[18px] bg-[#F3EFE8]/80 backdrop-blur-md text-[#0E1C4F] shadow-[0_30px_60px_-30px_rgba(14,28,79,.6)] max-w-[86vw]">
            <div className="font-extrabold text-[30px] sm:text-[40px] leading-none tracking-tight">KEMS</div>
            <div className="mx-auto mt-1.5 w-max bg-[#F26B6F] text-white text-[11px] sm:text-[13px] font-bold tracking-[0.32em] pl-3.5 pr-2.5 py-0.5">COMPANY</div>
            <div className="mt-3.5 text-[14px] font-semibold">Made with Culture</div>
            <div className="mt-1 text-[11px] tracking-[0.2em] uppercase opacity-70">Est. 2025 · Düzada, TR</div>
          </div>
        </>
      )}

      {/* ---- Düzada: tıklanabilir harita ---- */}
      {sayfa === 'duzada' && !ana && (
        <DuzadaSayfasi items={haritaMaddeleri} duzen={duzen} onMadde={id => sayfayaGit('viki', id)} />
      )}

      {/* ---- iç sayfalar ---- */}
      {!saydam && sayfa !== 'duzada' && (
        <main ref={icSayfaRef} className="absolute inset-0 overflow-y-auto bg-[#F3EFE8] text-[#0E1C4F]">
          {sayfa === 'viki' && (madde
            ? <MaddeSayfasi madde={madde} onViki={() => sayfayaGit('viki')} />
            : <VikiSayfasi items={vikiMaddeleri} onMadde={id => sayfayaGit('viki', id)} kapak={kapak('viki')} />)}
          {sayfa === 'urunler' && (
            <UrunlerSayfasi droplar={sitedeTur('drop')} urunler={sitedeTur('merch_urun')}
              kurumAdi={id => (id ? items.find(i => i.id === id)?.title : undefined)} kapak={kapak('urunler')} />
          )}
          {sayfa === 'haberler' && (madde && madde.type === 'blog_post'
            ? <YaziSayfasi yazi={madde} onGeri={() => sayfayaGit('haberler')} />
            : <HaberlerSayfasi yazilar={sitedeTur('blog_post')} kapak={kapak('haberler')} onYazi={id => sayfayaGit('haberler', id)} />)}
          {sayfa === 'projeler' && <ProjelerSayfasi kapak={kapak('projeler')} />}
          {sayfa === 'hakkinda' && <HakkindaSayfasi metin={ayar.hakkinda} kapak={kapak('hakkinda')} />}
          {sayfa === 'iletisim' && <IletisimSayfasi kanallar={sitedeTur('channel')} eposta={ayar.eposta} kapak={kapak('iletisim')} />}
          {sayfa === 'ara' && (
          <SayfaKabugu ton="krem" ust="Sitede ara" baslik="Ara">
            {(
              <>
                <input
                  autoFocus
                  value={aranan}
                  onChange={e => setAranan(e.target.value)}
                  placeholder="Madde, drop, yazı…"
                  className="w-full text-[17px] bg-white border border-[#CFC5B4] rounded-xl px-4 py-3 focus:outline-hidden focus:border-[#F26B6F]"
                />
                <div className="mt-5 divide-y divide-[#E4DCCD]">
                  {aranabilir.length === 0 && (
                    <p className="py-6 text-[14px] text-[#6A5E4C]">
                      Sitede henüz madde yok. KKM'de bir viki maddesini açıp "Sitede göster"e basınca burada aranır.
                    </p>
                  )}
                  {aranabilir.length > 0 && sonuclar.length === 0 && <p className="py-6 text-[14px] text-[#6A5E4C]">Bulunamadı.</p>}
                  {sonuclar.map(i => (
                    <button key={i.id} type="button" onClick={() => sonucaGit(i)} className="w-full text-left py-3.5 flex items-baseline justify-between gap-3 hover:text-[#D6484C] cursor-pointer">
                      <span className="text-[18px] font-semibold">{i.title}</span>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[#6A5E4C]">{sonucTuru(i)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </SayfaKabugu>
          )}
        </main>
      )}

      {/* ---- üst çubuk ---- */}
      <header className={`absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-3.5 sm:px-7 py-3.5 sm:py-5 ${saydam ? '' : sayfa === 'duzada' ? 'bg-[#0E1C4F]' : koyu ? 'bg-[#0E1C4F]/85 backdrop-blur-md' : sayfa === 'iletisim' ? 'bg-[#9CC7E6]/70 backdrop-blur-md' : 'bg-[#F3EFE8]/85 backdrop-blur-md'}`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMenuAcik(true)} title="Menü" className={`${simge} cursor-pointer`}><Menu className="w-5 h-5" /></button>
          {!ana && (
            <button type="button" onClick={() => sayfayaGit('ana')} className={`font-extrabold whitespace-nowrap text-[14px] sm:text-[17px] tracking-tight cursor-pointer ${saydam || koyu ? 'text-[#F3EFE8]' : 'text-[#0E1C4F]'} ${saydam ? 'drop-shadow' : ''}`}>KEMS COMPANY</button>
          )}
        </div>
        <div className="flex gap-1.5 sm:gap-2.5">
          <span title="Dil · yakında" className={`${simge} opacity-40`}><Globe className="w-5 h-5" /></span>
          <span title="Hesap · yakında" className={`${simge} opacity-40`}><UserRound className="w-5 h-5" /></span>
          <button type="button" onClick={() => sayfayaGit('ara')} title="Ara" className={`${simge} cursor-pointer`}><Search className="w-5 h-5" /></button>
          <span title="Dükkân · mağaza bağlanınca" className={`${simge} opacity-40`}><ShoppingBag className="w-5 h-5" /></span>
        </div>
      </header>

      {/* ---- menü ---- */}
      {menuAcik && (
        <>
          <div className="absolute inset-0 z-20 bg-[#0E1C4F]/35" onClick={() => setMenuAcik(false)} />
          <nav className="absolute inset-y-0 left-0 z-30 w-full sm:w-[380px] bg-[#0E1C4F] text-[#F3EFE8] flex flex-col px-6 sm:px-7 py-5 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setMenuAcik(false); sayfayaGit('ana'); }} className="font-extrabold text-[18px] cursor-pointer">KEMS COMPANY</button>
              <button type="button" onClick={() => setMenuAcik(false)} title="Kapat" className="w-10 h-10 rounded-full border border-[#F3EFE8]/25 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2 mt-8">
              {(['dukkan', 'kesfet'] as const).map(s => (
                <button key={s} type="button" onClick={() => setSekme(s)}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold tracking-[0.14em] uppercase border cursor-pointer ${sekme === s ? 'bg-[#F3EFE8] text-[#0E1C4F] border-transparent' : 'border-[#F3EFE8]/25 text-[#F3EFE8]/70'}`}>
                  {s === 'dukkan' ? 'Dükkân' : 'Keşfet'}
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-col overflow-y-auto">
              {sekme === 'kesfet' && kesfet.map(k => (
                <button key={k.id} type="button" onClick={() => sayfayaGit(k.id)}
                  className={`flex items-baseline justify-between gap-3 py-3 border-b border-[#F3EFE8]/15 text-left text-[20px] sm:text-[22px] font-semibold hover:text-[#F26B6F] cursor-pointer ${sayfa === k.id ? 'text-[#F26B6F]' : ''}`}>
                  {k.ad}<small className="text-[11px] font-medium opacity-55">{k.alt}</small>
                </button>
              ))}
              {sekme === 'dukkan' && (droplar.length === 0
                ? <p className="text-[13px] opacity-60 py-3">Merch'te drop yok.</p>
                : droplar.map(d => (
                  <span key={d.id} title="Mağaza bağlanınca açılır" className="flex items-baseline justify-between gap-3 py-3 border-b border-[#F3EFE8]/15 text-[20px] sm:text-[22px] font-semibold opacity-45">
                    {d.title}<small className="text-[11px] font-medium inline-flex items-center gap-0.5">drop <ArrowUpRight className="w-3 h-3" /></small>
                  </span>
                )))}
            </div>
            <p className="mt-auto pt-4 text-[11px] opacity-55 leading-relaxed">
              {sekme === 'dukkan'
                ? 'Dükkân dış mağazaya gider. Mağaza henüz bağlanmadı; o zamana kadar soluk durur.'
                : 'Kems Company · Est. 2025 · Düzada, TR'}
            </p>
          </nav>
        </>
      )}

      {/* ---- KKM'ye dönüş: yalnız önizlemede ---- */}
      {taslak && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-3.5 sm:bottom-4 z-10 text-[10px] font-bold uppercase tracking-[0.2em] bg-[#F26B6F] text-white px-3 py-1.5 rounded-full pointer-events-none">
          Taslak · yayında değil
        </span>
      )}
      <button type="button" onClick={() => { try { sessionStorage.removeItem(TASLAK_ONIZLEME_ANAHTARI); } catch { /* yok */ } onKapat(); }} className="absolute left-3.5 sm:left-4 bottom-3.5 sm:bottom-4 z-10 inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#0E1C4F]/75 text-[#F3EFE8] px-3 py-1.5 rounded-full cursor-pointer hover:bg-[#0E1C4F]">
        <ArrowLeft className="w-3.5 h-3.5" /> KKM'ye dön · önizleme
      </button>
    </div>
  );
};

export default Site;
