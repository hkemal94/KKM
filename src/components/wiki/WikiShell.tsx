import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, Eye, FileText, MapPin, Pin, Search, Settings2, Unlink } from 'lucide-react';
import { Item, ItemType } from '../../types';
import { isEntityUnlinked } from '../../utils/relations';
import { buildLinkIndex } from './autoLink';
import { WikiArticle } from './WikiArticle';
import { WikiGiris } from './WikiGiris';
import { parseKunye } from './kunyeParser';
import { WIKI_TYPES, TYPE_LABELS, isStub, mahalleEslesir, eslesmeBasligi } from './wikiSchema';
import { OYUN_VAKA_IDLERI } from '../../lib/temizlik';
import { etkinSablon, sablonKaydi, takmaAdlar, type VikiSablonu } from '../../lib/alanSablonu';
import { AlanSablonlari } from './AlanSablonlari';
import { MaddeOnerileri } from './MaddeOnerileri';
import { MaddeTablosu } from './MaddeTablosu';
import { maddeOnerileri, reddedilenler } from '../../lib/maddeOnerileri';

interface WikiShellProps {
  items: Item[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onEdit?: (id: string) => void;
  /** W3 · maddeden haritaya geçiş */
  onHaritayaGit?: (binaId: string) => void;
  onSoyAgaci?: (aileId: string) => void;
  /** Site (29 Eylül gece): maddeyi sitede göster / gizle */
  onSitede?: (item: Item, acik: boolean) => void;
  readOnly?: boolean;
  /** Madde düzenleyici ve "Yeni madde" (yapisal-4) */
  onUpdateItem?: (item: Item) => Promise<void>;
  /** Maddeyi siler (23 Ekim): düzenleyicideki "Maddeyi sil" buradan çalışır */
  onDeleteItem?: (id: string) => Promise<void>;
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  /** Evren raporuna geçiş */
  onRaporAc?: () => void;
}

/** Yeni maddede seçilebilen türler. Karakter yok (Kişi ile birleşti). */
const YENI_TURLER: Array<{ id: ItemType; ad: string }> = [
  { id: 'kisi', ad: 'Kişi' }, { id: 'aile', ad: 'Aile' }, { id: 'mekân', ad: 'Mekân' }, { id: 'dükkân', ad: 'Dükkân' },
  { id: 'yer', ad: 'Mahalle' }, { id: 'cadde', ad: 'Cadde / sokak' }, { id: 'meydan', ad: 'Meydan' }, { id: 'yer_adi', ad: 'Yer adı (tepe, koy…)' },
  { id: 'kulüp', ad: 'Kurum / kulüp' }, { id: 'olay', ad: 'Olay' }, { id: 'ürün', ad: 'Eşya' }
];

/** Odalar dizinde ayrı satır işgal etmez; mekânlarının altında yaşarlar */
const INDEX_TYPES: ItemType[] = WIKI_TYPES.filter(t => t !== 'oda');

/** Mekân sayılan tipler — mahallenin altında listelenirler */
const MEKAN_TIPLERI: ItemType[] = ['mekân', 'dükkân', 'kulüp'];
/** Mahallenin içinde listelenen yer kartları (8 Ekim): cadde, meydan, doğa adı */
const ALT_YERLER: ItemType[] = ['cadde', 'meydan', 'yer_adi'];

export const WikiShell: React.FC<WikiShellProps> = ({
  items,
  selectedId: controlledId,
  onSelect,
  onEdit,
  onHaritayaGit,
  onSoyAgaci,
  onSitede,
  readOnly = false,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onRaporAc
}) => {
  const [yeniAcik, setYeniAcik] = useState(false);
  /** Alan şablonları sayfası (3. gece) */
  const [sablonAcik, setSablonAcik] = useState(false);
  /** Madde önerileri sayfası (4. gece) */
  const [onerilerAcik, setOnerilerAcik] = useState(false);
  /** Maddeler tablosu (4. gece) */
  const [tabloAcik, setTabloAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniTur, setYeniTur] = useState<ItemType>('kisi');
  const [internalId, setInternalId] = useState<string | null>(null);
  const [mode, setMode] = useState<'okuma' | 'yonetim'>(readOnly ? 'okuma' : 'yonetim');
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'hepsi' | null>(null);

  /**
   * Gezinme her hâlükârda kendi durumunu günceller; onSelect yalnızca
   * dışarıya haber verir. (Önceden onSelect verilince iç durum
   * güncellenmiyordu ve `selectedId` da verilmediyse sayfa hiç açılmıyordu.)
   * Dışarıdan `selectedId` verilirse kontrol tamamen dışarıdadır.
   */
  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const navigate = (id: string | null) => {
    setSablonAcik(false);
    setOnerilerAcik(false);
    setTabloAcik(false);
    setInternalId(id);
    onSelect?.(id);
  };

  /**
   * Wiki'nin nüfusu. Oyun verisi buraya girmez: senaryo tipleri zaten
   * WIKI_TYPES dışında, resepsiyon vakaları ise kimlik listesiyle elenir.
   */
  const wikiItems = useMemo(
    () =>
      items.filter(
        i => !i.archived && WIKI_TYPES.includes(i.type) && !OYUN_VAKA_IDLERI.has(i.id)
             // Adanın eski çatı kaydı ('yer' türünde) mahalle sanılmasın; Ada kartına
             // taşınınca (8 Ekim) kendi maddesi olarak görünür
             && !(i.id === 'duzada_world_details' && i.type !== 'ada')
      ),
    [items]
  );

  const linkIndex = useMemo(() => buildLinkIndex(wikiItems), [wikiItems]);
  const selected = useMemo(
    () => wikiItems.find(i => i.id === selectedId) || null,
    [wikiItems, selectedId]
  );

  /**
   * Mahalleler ve içlerindeki mekânlar — girişin omurgası.
   *
   * Mahalle, başka bir yere bağlı OLMAYAN 'yer' kaydıdır. Otel gibi bir
   * mekân veride 'yer' tipiyle durabilir; placeId'si bir mahalleyi
   * gösterdiği için mahalle listesine değil, o mahallenin içine düşer.
   */
  const idSet = useMemo(() => new Set(wikiItems.map(i => i.id)), [wikiItems]);

  const mahalleler = useMemo(() => {
    const ustDuzeyMi = (i: Item) => {
      const p = i.metadata?.placeId;
      return !p || !idSet.has(p);
    };

    const yerler = wikiItems.filter(i => i.type === 'yer' && ustDuzeyMi(i));

    /** Bir kaydın hangi mahalleye ait olduğu: önce placeId, yoksa bölge adı */
    const aitMi = (i: Item, yer: Item): boolean => {
      const p = i.metadata?.placeId;
      if (p && idSet.has(p)) return p === yer.id; // placeId varsa tek doğru cevap odur
      // Mahalle üç yerde yazılı olabilir: künye alanı, eski profil alanı
      // ya da notlardaki "* Mahalle: …" satırı
      const satirlar = parseKunye(i).fields
        .filter(f => /^(mahalle|mahallesi|yer|yeri|konum)$/i.test(f.label.trim()))
        .map(f => f.value);
      return [i.metadata?.region, i.metadata?.profile?.region, ...satirlar].some(r => mahalleEslesir(r, eslesmeBasligi(yer)));
    };

    return yerler
      .map(yer => {
        const icindekiler = wikiItems.filter(i => {
          if (i.id === yer.id) return false;
          const mekanSayilir = MEKAN_TIPLERI.includes(i.type) || ALT_YERLER.includes(i.type) || i.type === 'yer';
          if (!mekanSayilir) return false;
          if (i.type === 'yer' && ustDuzeyMi(i)) return false; // başka bir mahalle
          return aitMi(i, yer);
        });
        return { yer, icindekiler };
      })
      .sort((a, b) => b.icindekiler.length - a.icindekiler.length);
  }, [wikiItems, idSet]);

  /**
   * Hiçbir yere bağlanmamış mekânlar. Bir otelin barı burada görünmez —
   * o otele bağlıdır ve otelin sayfasında yaşar; burada yalnızca gerçekten
   * sahipsiz kalanlar listelenir.
   */
  /** Adanın kendi maddesi (Ada kartı) */
  const adaMaddesi = useMemo(() => wikiItems.find(i => i.type === 'ada') || null, [wikiItems]);

  const yersizMekanlar = useMemo(() => {
    const bagli = new Set(mahalleler.flatMap(m => m.icindekiler.map(i => i.id)));
    const mahalleIds = new Set(mahalleler.map(m => m.yer.id));
    return wikiItems.filter(i => {
      if (!MEKAN_TIPLERI.includes(i.type) && !ALT_YERLER.includes(i.type) && i.type !== 'yer') return false;
      if (bagli.has(i.id) || mahalleIds.has(i.id)) return false;
      const p = i.metadata?.placeId;
      if (p && idSet.has(p)) return false; // bir üst mekâna bağlı
      return true;
    });
  }, [wikiItems, mahalleler, idSet]);

  const listed = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return wikiItems
      .filter(i => i.type !== 'oda')
      .filter(i => (!typeFilter || typeFilter === 'hepsi' ? true : i.type === typeFilter))
      .filter(i =>
        needle
          ? i.title.toLocaleLowerCase('tr').includes(needle) ||
            takmaAdlar(i).some(t => t.toLocaleLowerCase('tr').includes(needle)) ||
            (i.notes || '').toLocaleLowerCase('tr').includes(needle) ||
            i.tags.some(t => t.toLocaleLowerCase('tr').includes(needle))
          : true
      )
      // Sabitlenenler (4. gece) listenin başında
      .sort((a, b) => Number(b.metadata?.sabit === true) - Number(a.metadata?.sabit === true) || a.title.localeCompare(b.title, 'tr'));
  }, [wikiItems, q, typeFilter]);

  const typeCounts = useMemo(() => {
    const m = new Map<ItemType, number>();
    wikiItems.filter(i => i.type !== 'oda').forEach(i => {
      m.set(i.type, (m.get(i.type) || 0) + 1);
    });
    return m;
  }, [wikiItems]);

  const health = useMemo(() => {
    const pool = wikiItems.filter(i => i.type !== 'oda');
    return {
      total: pool.length,
      unlinked: pool.filter(i => isEntityUnlinked(i, items)).length,
      stubs: pool.filter(i => isStub(i)).length
    };
  }, [wikiItems, items]);

  const admin = mode === 'yonetim';
  const oneriSayisi = useMemo(() => (readOnly ? 0 : maddeOnerileri(items, reddedilenler(items)).length), [items, readOnly]);
  /** Şablonu kkm_ayar kaydına yazar (yalnız "Kaydet" ile) */
  const sablonuYaz = onUpdateItem && onAddItem ? async (sb: VikiSablonu) => {
    const r = sablonKaydi(items, sb);
    if (r.guncel) await onUpdateItem(r.guncel);
    else if (r.yeni) await onAddItem(r.yeni);
  } : undefined;
  /** Arama yazıldıysa ya da bir tip seçildiyse liste görünümü açılır */
  const listeGorunumu = q.trim().length > 0 || typeFilter !== null;

  return (
    <div className="paper-grain min-h-full bg-krem dark:bg-lacivert text-lacivert dark:text-krem">
      <div className="sticky top-0 z-10 backdrop-blur bg-krem/90 dark:bg-lacivert/90 border-b border-bej/45 dark:border-lacivert-600/45">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* KKM'de sayfa adı zaten üstte; viki başlığı yalnız sitede (1 Ekim, K-2) */}
          {readOnly && (
            <button
              type="button"
              onClick={() => {
                navigate(null);
                setQ('');
                setTypeFilter(null);
              }}
              className="flex items-center gap-2 font-serif text-lg hover:opacity-70 transition-opacity"
            >
              <BookOpen size={17} />
              Düzada Viki
            </button>
          )}

          {(selected || listeGorunumu) && (
            <button
              type="button"
              onClick={() => {
                navigate(null);
                setQ('');
                setTypeFilter(null);
              }}
              className="flex items-center gap-1 text-[12px] font-mono text-gri dark:text-bej/85 hover:text-lacivert dark:hover:text-krem transition-colors"
            >
              <ChevronLeft size={13} /> ada sayfası
            </button>
          )}

          {onRaporAc && (
            <button
              type="button"
              onClick={onRaporAc}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors text-[#F26B6F] dark:text-[#F26B6F] font-semibold cursor-pointer"
              title="Kapsamlı Düzada Evren Raporunu Aç"
            >
              <FileText size={12} />
              Evren Raporu
            </button>
          )}

          {!readOnly && onUpdateItem && mode === 'yonetim' && (
            <button
              type="button"
              onClick={() => { navigate(null); setTabloAcik(true); }}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors"
              title="Maddeleri tablo olarak gör ve hücreden düzenle"
            >
              tablo
            </button>
          )}
          {!readOnly && onAddItem && onUpdateItem && mode === 'yonetim' && (
            <button
              type="button"
              onClick={() => { navigate(null); setOnerilerAcik(true); }}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors"
              title="Yazılarında geçen ama maddesi olmayan adlar"
            >
              madde önerileri{oneriSayisi ? ` · ${oneriSayisi}` : ''}
            </button>
          )}
          {!readOnly && sablonuYaz && mode === 'yonetim' && (
            <button
              type="button"
              onClick={() => { navigate(null); setSablonAcik(true); }}
              className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors"
              title="Her türün künyesinde hangi alanlar olacağı"
            >
              alan şablonları
            </button>
          )}
          {!readOnly && onAddItem && mode === 'yonetim' && (
            <button
              type="button"
              onClick={() => setYeniAcik(a => !a)}
              className="ml-auto flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors"
            >
              + yeni madde
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setMode(m => (m === 'okuma' ? 'yonetim' : 'okuma'))}
              className={`${onAddItem && mode === 'yonetim' ? '' : onRaporAc ? '' : 'ml-auto '} flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded border border-bej/55 dark:border-lacivert-600/55 hover:bg-bej/15 dark:hover:bg-lacivert-600/30 transition-colors`}
            >
              {admin ? <Settings2 size={12} /> : <Eye size={12} />}
              {admin ? 'yönetim yüzü' : 'okuma yüzü'}
            </button>
          )}
        </div>
        {yeniAcik && onAddItem && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!yeniAd.trim()) return;
              // Aynı adla madde varsa önce sorulur (8 Ekim: Küçükçetmi Çiftliği iki kez açılmıştı)
              const ayni = wikiItems.find(i => !i.archived && i.title.trim().toLocaleLowerCase('tr') === yeniAd.trim().toLocaleLowerCase('tr'));
              if (ayni && !window.confirm(`"${ayni.title}" adlı bir madde zaten var (${TYPE_LABELS[ayni.type] || ayni.type}). Yine de yeni madde açılsın mı?\n\nİptal: var olan madde açılır.`)) {
                setYeniAd(''); setYeniAcik(false); navigate(ayni.id); return;
              }
              // Ad Kemal'in; kayıt yalnız bu düğmeyle oluşur
              const id = `madde_${Date.now()}`;
              await onAddItem({
                id, title: yeniAd.trim(), area: 'duzada', type: yeniTur, status: 'Fikir', priority: 'orta',
                tags: [], links: [], notes: '', images: [], isProposal: false, archived: false,
                metadata: {}
              });
              setYeniAd(''); setYeniAcik(false); navigate(id);
            }}
            className="max-w-5xl mx-auto px-4 pb-3 flex flex-wrap items-center gap-2"
          >
            <select value={yeniTur} onChange={e => setYeniTur(e.target.value as ItemType)} className="text-[13px] bg-white dark:bg-lacivert-800/60 border border-bej/70 rounded px-2 py-1.5">
              {YENI_TURLER.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
            </select>
            <input autoFocus value={yeniAd} onChange={e => setYeniAd(e.target.value)} placeholder="Adı (senin koyduğun ad)" className="flex-1 min-w-[180px] text-[13px] bg-white dark:bg-lacivert-800/60 border border-bej/70 rounded px-2.5 py-1.5" />
            <button type="submit" disabled={!yeniAd.trim()} className="text-[12px] font-mono px-3 py-1.5 rounded bg-lacivert text-krem dark:bg-[#2C3C72] disabled:opacity-40">Oluştur</button>
          </form>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {tabloAcik && onUpdateItem ? (
          <MaddeTablosu maddeler={wikiItems.filter(i => !i.isProposal)} onUpdateItem={onUpdateItem} onNavigate={navigate} onKapat={() => setTabloAcik(false)} />
        ) : onerilerAcik && onAddItem && onUpdateItem ? (
          <MaddeOnerileri items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onNavigate={navigate} onKapat={() => setOnerilerAcik(false)} />
        ) : sablonAcik && sablonuYaz ? (
          <AlanSablonlari sablon={etkinSablon()} onKaydet={sablonuYaz} onKapat={() => setSablonAcik(false)} />
        ) : selected ? (
          <WikiArticle
            item={selected}
            allItems={items}
            linkIndex={linkIndex}
            onNavigate={navigate}
            mode={mode}
            onEdit={onEdit}
            onHaritayaGit={onHaritayaGit}
            onSoyAgaci={onSoyAgaci}
            onSitede={onSitede}
            onUpdateItem={readOnly ? undefined : onUpdateItem}
            onSablonYaz={readOnly ? undefined : sablonuYaz}
            onSil={readOnly || !onDeleteItem ? undefined : async () => { await onDeleteItem(selected.id); navigate(String(selected.metadata?.placeId || '') || null); }}
          />
        ) : (
          <>
            {!listeGorunumu && (
              <header className="mb-7">
                <h1 className="font-sans text-4xl mb-1.5 tracking-tight">Düzada</h1>
                <p className="text-[15px] text-gri dark:text-bej/85 max-w-xl leading-relaxed">
                  Ege Denizi'nde, zeytin ağaçlarıyla çevrili bir ada. {health.total} madde.
                </p>
              </header>
            )}

            <label className="flex items-center gap-2 px-3 py-2.5 mb-6 rounded-lg border border-bej/55 dark:border-lacivert-600/55 bg-white/70 dark:bg-lacivert-800/40">
              <Search size={15} className="text-gri dark:text-bej/85 shrink-0" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Adada bir şey ara"
                className="w-full bg-transparent text-sm outline-none placeholder:text-gri/60 dark:placeholder:text-bej/40"
              />
            </label>

            {listeGorunumu ? (
              <>
                <div className="flex flex-wrap gap-1.5 mb-5">
                  <FilterChip
                    active={typeFilter === 'hepsi' || typeFilter === null}
                    onClick={() => setTypeFilter('hepsi')}
                    label="hepsi"
                    count={listed.length}
                  />
                  {INDEX_TYPES.filter(t => (typeCounts.get(t) || 0) > 0).map(t => (
                    <FilterChip
                      key={t}
                      active={typeFilter === t}
                      onClick={() => setTypeFilter(t)}
                      label={TYPE_LABELS[t] || t}
                      count={typeCounts.get(t) || 0}
                    />
                  ))}
                </div>

                {listed.length === 0 ? (
                  <p className="text-sm text-gri dark:text-bej/85 italic py-8 text-center">
                    Eşleşen madde yok.
                  </p>
                ) : (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                    {listed.map(i => (
                      <li key={i.id}>
                        <MaddeButonu
                          item={i}
                          admin={admin}
                          allItems={items}
                          onClick={() => navigate(i.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              /* --- Ada sayfası: önce giriş paneli, sonra coğrafya --- */
              <div className="space-y-8">
                <WikiGiris
                  maddeler={wikiItems}
                  hepsi={items}
                  onNavigate={navigate}
                  onTipSec={t => setTypeFilter(t)}
                />
                {adaMaddesi && (
                  <button
                    type="button"
                    onClick={() => navigate(adaMaddesi.id)}
                    className="w-full text-left border border-bej/45 dark:border-lacivert-600/45 rounded-lg bg-krem-acik/60 dark:bg-lacivert-800/35 px-4 py-3.5 archive-shadow hover:bg-bej/12 dark:hover:bg-lacivert-600/25 transition-colors group"
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85">Ada</span>
                    <span className="mt-1 flex items-center gap-2">
                      <MapPin size={13} className="text-kiremit shrink-0" />
                      <span className="font-serif text-lg group-hover:underline decoration-lacivert/30 dark:decoration-bej/40 underline-offset-2">{adaMaddesi.title}</span>
                    </span>
                  </button>
                )}
                <section>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 mb-3">
                    Mahalleler
                  </h2>

                  {mahalleler.length === 0 ? (
                    <p className="text-sm text-gri dark:text-bej/85 italic">
                      Henüz mahalle kaydı yok.
                    </p>
                  ) : (
                    <ul className="grid sm:grid-cols-2 gap-3">
                      {mahalleler.map(({ yer, icindekiler }) => (
                        <li
                          key={yer.id}
                          className="border border-bej/45 dark:border-lacivert-600/45 rounded-lg bg-krem-acik/60 dark:bg-lacivert-800/35 overflow-hidden archive-shadow"
                        >
                          <button
                            type="button"
                            onClick={() => navigate(yer.id)}
                            className="w-full text-left px-4 pt-3.5 pb-2 hover:bg-bej/12 dark:hover:bg-lacivert-600/25 transition-colors group"
                          >
                            <span className="flex items-center gap-2">
                              <MapPin size={13} className="text-kiremit shrink-0" />
                              <span className="font-serif text-lg group-hover:underline decoration-lacivert/30 dark:decoration-bej/40 underline-offset-2">
                                {yer.title}
                              </span>
                            </span>
                          </button>

                          {icindekiler.length > 0 && (
                            <ul className="px-4 pb-3.5 pt-0.5 flex flex-wrap gap-1.5">
                              {icindekiler.map(m => (
                                <li key={m.id}>
                                  <button
                                    type="button"
                                    onClick={() => navigate(m.id)}
                                    className="text-[12px] px-2 py-0.5 rounded border border-bej/50 dark:border-lacivert-600/50 hover:border-lacivert/45 dark:hover:border-bej/45 transition-colors"
                                  >
                                    {m.title}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {yersizMekanlar.length > 0 && (
                  <section>
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 mb-3">
                      Mahallesi belirtilmemiş yerler ve mekânlar
                    </h2>
                    <ul className="flex flex-wrap gap-1.5">
                      {yersizMekanlar.map(m => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => navigate(m.id)}
                            className="text-[13px] px-2.5 py-1 rounded border border-bej/50 dark:border-lacivert-600/50 hover:border-lacivert/45 dark:hover:border-bej/45 transition-colors"
                          >
                            {m.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/*
                  "Dizinler" buradaydı — sayfanın en altında, katlamanın
                  altında kalıyordu. Aynı iş artık en üstteki "Nereden
                  girilir" bloğunda; iki kere göstermeye gerek yok.
                */}

                {admin && (health.unlinked > 0 || health.stubs > 0) && (
                  <section className="pt-5 border-t border-bej/40 dark:border-lacivert-600/40">
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 mb-2">
                      Yapılacaklar
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {health.unlinked > 0 && (
                        <span className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-kiremit/30 bg-kiremit/8 text-kiremit">
                          <Unlink size={11} /> {health.unlinked} madde hiçbir şeye bağlı değil
                        </span>
                      )}
                      {health.stubs > 0 && (
                        <span className="text-[11px] font-mono px-2 py-1 rounded border border-bej/60 bg-bej/15 text-[#6b5b46] dark:text-[#A6B0C9]">
                          {health.stubs} taslak
                        </span>
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const MaddeButonu: React.FC<{
  item: Item;
  admin: boolean;
  allItems: Item[];
  onClick: () => void;
}> = ({ item, admin, allItems, onClick }) => {
  const stub = admin && isStub(item);
  const floating = admin && isEntityUnlinked(item, allItems);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-full text-left px-3.5 py-3 rounded-lg border border-bej/45 dark:border-lacivert-600/45 bg-white/60 dark:bg-lacivert-800/35 hover:border-lacivert/40 dark:hover:border-bej/45 transition-colors archive-shadow group"
    >
      <span className="flex items-start gap-2">
        <span className="font-serif text-[15px] group-hover:underline decoration-lacivert/30 dark:decoration-bej/40 underline-offset-2 leading-snug">
          {item.title}
        </span>
        {item.metadata?.sabit === true && <Pin size={11} className="text-kiremit shrink-0 mt-1" aria-label="sabit" />}
        {floating && <Unlink size={11} className="text-kiremit shrink-0 mt-1" />}
      </span>
      <span className="flex items-center gap-1.5 mt-1.5">
        <span className="text-[9px] font-mono uppercase tracking-wide text-gri dark:text-bej/85">
          {TYPE_LABELS[item.type] || item.type}
        </span>
        {item.metadata?.adiGecici && (
          <span className="text-[9px] font-mono px-1 py-px rounded border border-dashed border-bej/70 text-[#6b5b46]">
            adsız
          </span>
        )}
        {stub && (
          <span className="text-[9px] font-mono px-1 py-px rounded border border-bej/55 text-[#6b5b46]">
            taslak
          </span>
        )}
      </span>
    </button>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}> = ({ active, onClick, label, count }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
      active
        ? 'border-lacivert bg-lacivert text-krem dark:border-bej dark:bg-bej dark:text-lacivert'
        : 'border-bej/55 dark:border-lacivert-600/55 text-gri dark:text-bej/85 hover:border-lacivert/40 dark:hover:border-bej/45'
    }`}
  >
    {label}
    <span className="ml-1 opacity-60">{count}</span>
  </button>
);
