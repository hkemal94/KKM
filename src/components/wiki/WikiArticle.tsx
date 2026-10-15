import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, ChevronRight, Globe, Link2, PencilLine, Pin, Unlink, GitFork, Frame, Eye, EyeOff } from 'lucide-react';
import { maddeninTuvalleri, tuvaldeAc } from '../../lib/tuval';
import { gizlemeDegistir, gizlenebilenler } from '../../lib/siteGizleme';
import { StudyodaAc } from '../studyo/StudyodaAc';
import { Item, WikiSection } from '../../types';
import { MaddeDuzenleyici, AileUyeleri } from './MaddeDuzenleyici';
import { maddeyiAnanNotlar } from '../../lib/notBaglari';
import { resolveAllRelations, getRelationLabels, isEntityUnlinked } from '../../utils/relations';
import { AutoLinkedText, LinkIndexEntry } from './autoLink';
import { WikiRooms } from './WikiRooms';
import { WikiPeople } from './WikiPeople';
import { WikiHarita, haritaKarsiligiVar } from './WikiHarita';
import { KunyeDegeri } from './KunyeDegeri';
import { BAG_GRUPLARI, adiCoz, bagParcalari, kunyeBaglari, semaAlanlari, takmaAdlar, type SemaAlani, type VikiSablonu } from '../../lib/alanSablonu';
import { maddeGorseli } from '../../lib/maddeGorseli';
import {
  getKunyeFields,
  getEkBilgiler,
  getArticleBody,
  kunyeCompleteness,
  isStub,
  TYPE_LABELS,
  schemaKeyFor
} from './wikiSchema';

/**
 * Bir ilişki grubu. Otelin 90+ misafiri gibi kalabalık gruplar sayfayı
 * yutmasın diye ilk 24 tanesi gösterilir, gerisi istenirse açılır.
 */
const RelationGroup: React.FC<{
  label: string;
  count: number;
  children: (visible: number) => React.ReactNode;
}> = ({ label, count, children }) => {
  const LIMIT = 24;
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? count : Math.min(count, LIMIT);
  const hidden = count - visible;

  return (
    <div>
      <h3 className="text-[11px] font-mono text-gri dark:text-bej/85 mb-1.5">
        {label}
        {count > LIMIT && <span className="ml-1.5 opacity-60">{count}</span>}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {children(visible)}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[13px] px-2.5 py-1 rounded border border-dashed border-gri/40 dark:border-bej/30 text-gri dark:text-bej/85 hover:border-gri dark:hover:border-bej/60 transition-colors"
            >
              +{hidden} tane daha
            </button>
          </li>
        )}
        {expanded && count > LIMIT && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[13px] px-2.5 py-1 rounded border border-dashed border-gri/40 dark:border-bej/30 text-gri dark:text-bej/85 hover:border-gri dark:hover:border-bej/60 transition-colors"
            >
              daralt
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};

/**
 * Künye değeri. Bağ alanıysa (3. gece) her ad, eşleşen maddeye bağlantı
 * olur; eşleşmeyen ad düz yazı kalır (yönetim yüzünde noktalı altçizgi).
 */
const KunyeAlani: React.FC<{ value: string; alan?: SemaAlani; allItems: Item[]; selfId: string; admin: boolean; onNavigate: (id: string) => void }> = ({ value, alan, allItems, selfId, admin, onNavigate }) => {
  if (!alan?.bag?.length) return <KunyeDegeri value={value} />;
  const turler = new Set<string>(alan.bag.flatMap(g => BAG_GRUPLARI[g].turler));
  const adaylar = allItems.filter(i => !i.archived && !i.isProposal && i.id !== selfId && turler.has(i.type));
  const parcalar = bagParcalari(value, alan.coklu);
  return (
    <>
      {parcalar.map((p, n) => {
        const h = adiCoz(p, adaylar);
        return (
          <React.Fragment key={n}>
            {n > 0 && ', '}
            {h ? (
              <button type="button" onClick={() => onNavigate(h.id)} className="underline decoration-lacivert/30 dark:decoration-bej/40 underline-offset-2 hover:decoration-lacivert dark:hover:decoration-bej text-left">{p}</button>
            ) : admin ? (
              <span className="underline decoration-dotted decoration-kiremit/60 cursor-help" title="Bu adla bir madde yok; madde açılınca bağlantı olur">{p}</span>
            ) : p}
          </React.Fragment>
        );
      })}
    </>
  );
};

interface WikiArticleProps {
  item: Item;
  allItems: Item[];
  linkIndex: LinkIndexEntry[];
  onNavigate: (id: string) => void;
  /** 'okuma' ziyaretçi yüzü, 'yonetim' Kemal'in yüzü */
  mode: 'okuma' | 'yonetim';
  onEdit?: (id: string) => void;
  /** W3 · "Haritada göster" — verilmezse düğme çıkmaz */
  onHaritayaGit?: (binaId: string) => void;
  /** Aile maddesinde "Soy ağacında aç" (6. gece) */
  onSoyAgaci?: (aileId: string) => void;
  /** Site (29 Eylül gece): verilmezse düğme çıkmaz */
  onSitede?: (item: Item, acik: boolean) => void;
  /** Madde düzenleyici (yapisal-4): verilirse "düzenle" onu açar */
  onUpdateItem?: (item: Item) => Promise<void>;
  /** Düzenleyicideki "bu türe alan ekle" (3. gece) şablonu buradan yazar */
  onSablonYaz?: (s: VikiSablonu) => Promise<void>;
}

export const WikiArticle: React.FC<WikiArticleProps> = ({
  item,
  allItems,
  linkIndex,
  onNavigate,
  mode,
  onEdit,
  onHaritayaGit,
  onSoyAgaci,
  onSitede,
  onUpdateItem,
  onSablonYaz
}) => {
  const admin = mode === 'yonetim';
  const [duzenle, setDuzenle] = useState(false);
  // Başka maddeye geçince düzenleyici kapanır
  useEffect(() => { setDuzenle(false); }, [item.id]);

  // Sırlar yalnızca yönetim yüzünde
  const kunye = useMemo(
    () => getKunyeFields(item, { includeSecrets: admin }),
    [item, admin]
  );
  const body = useMemo(() => getArticleBody(item), [item]);
  /** Aynı başlıkta gelen, bölümün altında bekleyen öneriler (8 Ekim) */
  const bekleyenler = useMemo(() => new Map(((item.metadata?.wikiSections as WikiSection[] | undefined) || [])
    .filter(b => b.id && String(b.bekleyenOneri || '').trim()).map(b => [String(b.id), String(b.bekleyenOneri)])), [item]);
  /** Yerine koy / altına ekle / at: kayıt yalnız Kemal'in düğmesiyle yazılır */
  const bekleyeniIsle = async (id: string, is: 'yerine' | 'alta' | 'at') => {
    if (!onUpdateItem) return;
    const bolumler = ((item.metadata?.wikiSections as WikiSection[] | undefined) || []).map(b => {
      if (String(b.id) !== id || !b.bekleyenOneri) return b;
      const { bekleyenOneri, ...kalan } = b;
      if (is === 'yerine') return { ...kalan, content: bekleyenOneri, status: 'öneri' as const };
      if (is === 'alta') return { ...kalan, content: `${kalan.content.trim()}\n\n${bekleyenOneri.trim()}`, status: 'öneri' as const };
      return kalan;
    });
    await onUpdateItem({ ...item, metadata: { ...item.metadata, wikiSections: bolumler }, updatedAt: Date.now() });
  };
  /** Künyeye girmeyen satırlar — gövdede "Bilgiler" bölümü */
  const ekBilgiler = useMemo(() => getEkBilgiler(item, { includeSecrets: admin }), [item, admin]);
  const govdeVar = body.length > 0 || ekBilgiler.length > 0;
  /** Üst maddeler zinciri (en üstten bu maddeye) ve alt maddeler (4. gece) */
  const ustZincir = useMemo(() => {
    const z: Item[] = [];
    const gorulen = new Set([item.id]);
    let p = item.metadata?.placeId;
    while (p && !gorulen.has(p)) {
      const u = allItems.find(i => i.id === p && !i.archived);
      if (!u) break;
      z.unshift(u); gorulen.add(u.id); p = u.metadata?.placeId;
    }
    return z;
  }, [item, allItems]);
  const altMaddeler = useMemo(() => allItems
    .filter(i => !i.archived && !i.isProposal && i.type !== 'oda' && i.metadata?.placeId === item.id)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr')), [allItems, item.id]);
  /** Şablondaki alanlar (bağ alanı mı?) ve bu maddeyi künyesinde ananlar */
  const semaAlani = useMemo(() => new Map(semaAlanlari(schemaKeyFor(item.type) || '').map(a => [a.id, a])), [item.type]);
  const adlar = useMemo(() => takmaAdlar(item), [item]);
  const ananlar = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const b of kunyeBaglari(item, allItems, i => schemaKeyFor(i.type),
      (i, id) => getKunyeFields(i).find(f => f.id === id)?.value || '')) {
      if (!g.has(b.alan)) g.set(b.alan, []);
      if (!g.get(b.alan)!.some(x => x.id === b.kaynak.id)) g.get(b.alan)!.push(b.kaynak);
    }
    return Array.from(g.entries()).map(([alan, l]) => ({ alan, l: l.sort((a, b) => a.title.localeCompare(b.title, 'tr')) }));
  }, [item, allItems]);
  const completeness = useMemo(() => kunyeCompleteness(item), [item]);
  /** W3: yan sütun künye boş olsa da harita kartı için açılabilir */
  const haritada = useMemo(() => haritaKarsiligiVar(item), [item]);
  /**
   * W5: künyenin başında maddenin görseli. Yalnız uygulamanın kendi
   * verisindeki görseller (galeriden bağlanan ya da yüklenen); eski
   * tohumlardaki hazır internet fotoğrafları gösterilmez.
   */
  const gorsel = useMemo(() => maddeGorseli(item, allItems), [item, allItems]);

  /** Bu mekâna bağlı odalar — ayrı ve katlanmış gösterilir */
  const rooms = useMemo(
    () =>
      allItems.filter(
        i => !i.archived && i.type === 'oda' && i.metadata?.placeId === item.id
      ),
    [allItems, item.id]
  );

  /**
   * Geri bağlantılar. relations.ts zaten çift yönlü çözüyor; burada
   * sadece okunabilir başlıklar altında gruplanıyor.
   */
  const isPerson = item.type === 'kisi' || item.type === 'karakter';

  /**
   * Bir mekâna bağlı kişiler ayrı bir bloğa çıkar. Otelin 94 misafiri
   * çip duvarı olmaktan çıkıp gruplu, katlanmış bir listeye dönüşür.
   * Eşik 6: az sayıda kişi çip olarak zaten okunaklı.
   */
  const { grouped, relatedPeople, peopleProposals, peopleLabel } = useMemo(() => {
    const rels = resolveAllRelations(item, allItems).filter(r => {
      if (admin) return true;
      return !r.isProposal; // ziyaretçi öneri görmesin
    });

    const map = new Map<string, { label: string; entries: typeof rels }>();
    const people: Item[] = [];
    const proposals = new Set<string>();
    const labelVotes = new Map<string, number>();
    const seenPeople = new Set<string>();

    rels.forEach(r => {
      const outgoing = r.sourceId === item.id;
      const other = outgoing ? r.targetId : r.sourceId;
      const otherItem = allItems.find(i => i.id === other);
      if (!otherItem || otherItem.archived) return;

      // Oda ilişkileri yukarıdaki blokta zaten var
      if (otherItem.type === 'oda' && otherItem.metadata?.placeId === item.id) return;

      const labels = getRelationLabels(r.type, r.sourceType, r.targetType);
      const label = outgoing ? labels.forward : labels.inverse;

      const otherIsPerson = otherItem.type === 'kisi' || otherItem.type === 'karakter';
      if (!isPerson && otherIsPerson) {
        if (!seenPeople.has(otherItem.id)) {
          seenPeople.add(otherItem.id);
          people.push(otherItem);
          if (r.isProposal) proposals.add(otherItem.id);
        }
        labelVotes.set(label, (labelVotes.get(label) || 0) + 1);
        return;
      }

      if (!map.has(label)) map.set(label, { label, entries: [] });
      map.get(label)!.entries.push(r);
    });

    // Kişi sayısı azsa ayrı blok kurmaya değmez; çip olarak geri koy
    if (people.length > 0 && people.length < 6) {
      rels.forEach(r => {
        const outgoing = r.sourceId === item.id;
        const other = outgoing ? r.targetId : r.sourceId;
        const otherItem = allItems.find(i => i.id === other);
        if (!otherItem || !seenPeople.has(otherItem.id)) return;
        const labels = getRelationLabels(r.type, r.sourceType, r.targetType);
        const label = outgoing ? labels.forward : labels.inverse;
        if (!map.has(label)) map.set(label, { label, entries: [] });
        map.get(label)!.entries.push(r);
      });
      people.length = 0;
    }

    // En çok oy alan ilişki etiketi başlık olur; 'Bağlantılı Varlık' gibi
    // jenerik bir etiket çıkarsa mekâna yakışan bir başlığa düşülür.
    let topLabel =
      Array.from(labelVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Kişiler';
    if (/bağlantılı varlık/i.test(topLabel)) {
      topLabel = isPerson ? 'Tanıdıkları' : 'Buradakiler';
    }

    return {
      grouped: Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length),
      relatedPeople: people,
      peopleProposals: proposals,
      peopleLabel: topLabel
    };
  }, [item, allItems, admin, isPerson]);

  /** Sayfa başına tek bağlantı sayacı; madde değişince sıfırlanır */
  const linkedOnce = useMemo(() => new Set<string>(), [item.id, mode]);

  const unlinked = useMemo(() => isEntityUnlinked(item, allItems), [item, allItems]);
  const stub = useMemo(() => isStub(item), [item]);

  return (
    <article className="max-w-none">
      {/* --- Başlık --- */}
      <header className="pb-4 mb-6 border-b-2 border-lacivert/15 dark:border-bej/20">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="postmark-label text-gri dark:text-bej/85">
            {TYPE_LABELS[item.type] || item.type}
          </span>
          {item.isProposal && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-dashed border-kiremit/60 text-kiremit">
              henüz resmi değil
            </span>
          )}
          {/* Jenerik ad taşıyan mekânlar — asıl ad sonra konacak */}
          {item.metadata?.adiGecici && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-dashed border-bej text-[#6b5b46]"
              title="Bu jenerik bir ad. Asıl adı sonra konacak."
            >
              adı henüz konmadı
            </span>
          )}
          {admin && (
            <StudyodaAc
              grup="viki"
              hedefId={item.id}
              className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-gri hover:text-kiremit dark:text-bej/85 transition-colors cursor-pointer"
            />
          )}
          {admin && onSitede && (
            <button
              type="button"
              onClick={() => onSitede(item, item.metadata?.sitede !== true)}
              title={item.metadata?.sitede === true ? 'Sitede görünüyor · basınca gizlenir' : 'Sitede görünmüyor · basınca görünür'}
              className={`flex items-center gap-1.5 text-[11px] font-mono transition-colors cursor-pointer ${item.metadata?.sitede === true ? 'text-[#2F7A45] dark:text-[#9FD3A9]' : 'text-gri hover:text-lacivert dark:text-bej/85 dark:hover:text-krem'}`}
            >
              <Globe size={12} /> {item.metadata?.sitede === true ? 'sitede ✓' : 'sitede göster'}
            </button>
          )}
          {admin && (item.type === 'yer' || maddeninTuvalleri(allItems, item.id).length > 0) && (
            <button type="button" onClick={() => tuvaldeAc(item.id)} title="Bu maddenin panosu (Atölye → Tuval)"
              className="flex items-center gap-1.5 text-[11px] font-mono transition-colors cursor-pointer text-gri hover:text-lacivert dark:text-bej/85 dark:hover:text-krem">
              <Frame size={12} /> tuvalde aç
            </button>
          )}
          {item.type === 'aile' && onSoyAgaci && (
            <button type="button" onClick={() => onSoyAgaci(item.id)} title="Bu ailenin soy ağacı (Atölye)"
              className="flex items-center gap-1.5 text-[11px] font-mono transition-colors cursor-pointer text-gri hover:text-lacivert dark:text-bej/85 dark:hover:text-krem">
              <GitFork size={12} /> soy ağacında aç
            </button>
          )}
          {admin && onUpdateItem && (
            <button
              type="button"
              onClick={() => void onUpdateItem({ ...item, metadata: { ...(item.metadata || {}), sabit: item.metadata?.sabit !== true } as Item['metadata'], updatedAt: Date.now() })}
              title={item.metadata?.sabit === true ? 'Viki listesinde en üstte · basınca kalkar' : 'Viki listesinde en üste sabitle'}
              className={`flex items-center gap-1.5 text-[11px] font-mono transition-colors cursor-pointer ${item.metadata?.sabit === true ? 'text-kiremit' : 'text-gri hover:text-lacivert dark:text-bej/85 dark:hover:text-krem'}`}
            >
              <Pin size={12} /> {item.metadata?.sabit === true ? 'sabit ✓' : 'sabitle'}
            </button>
          )}
          {admin && (onUpdateItem || onEdit) && (
            <button
              type="button"
              onClick={() => (onUpdateItem ? setDuzenle(d => !d) : onEdit?.(item.id))}
              className="flex items-center gap-1.5 text-[11px] font-mono text-gri hover:text-lacivert dark:text-bej/85 dark:hover:text-krem transition-colors"
            >
              <PencilLine size={12} /> düzenle
            </button>
          )}
        </div>

        {ustZincir.length > 0 && (
          <nav aria-label="Üst maddeler" className="mb-1 flex flex-wrap items-center gap-1 text-[12px] text-gri dark:text-bej/85">
            {ustZincir.map(u => (
              <React.Fragment key={u.id}>
                <button type="button" onClick={() => onNavigate(u.id)} className="hover:text-lacivert dark:hover:text-krem hover:underline underline-offset-2">{u.title}</button>
                <ChevronRight size={12} className="shrink-0" />
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="font-sans text-3xl sm:text-4xl text-lacivert dark:text-krem leading-tight tracking-tight">
          {item.title}
        </h1>

        {adlar.length > 0 && (
          <p className="mt-1 text-[13px] text-gri dark:text-bej/85">Diğer adları: {adlar.join(', ')}</p>
        )}

        {item.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-3">
            {item.tags.slice(0, 10).map(t => (
              <li
                key={t}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bej/25 dark:bg-lacivert-600/40 text-gri dark:text-bej/80"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      {admin && duzenle && onUpdateItem && (
        <MaddeDuzenleyici item={item} allItems={allItems} onKaydet={onUpdateItem} onSablonYaz={onSablonYaz} onKapat={() => setDuzenle(false)} />
      )}

      {/* Sitede görünenler (6. gece): parça parça gizle / göster; yalnız site etkilenir */}
      {admin && onUpdateItem && (() => {
        const parcalar = gizlenebilenler(item, (item.images || []).some(s => typeof s === 'string' && s));
        if (!parcalar.length) return null;
        const gizliSayi = parcalar.filter(p => p.gizli).length;
        return (
          <details className="mb-6 rounded border border-dashed border-bej/70 px-3 py-2 text-[13px]">
            <summary className="cursor-pointer postmark-label text-gri dark:text-bej/85">
              Sitede görünenler{gizliSayi ? ` · ${gizliSayi} gizli` : ''}{item.metadata?.sitede === true ? '' : ' · madde sitede değil'}
            </summary>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {parcalar.map(p => (
                <li key={p.anahtar} className="flex items-center gap-2 min-h-8">
                  <button type="button" disabled={p.sablonda}
                    onClick={() => void onUpdateItem(gizlemeDegistir(item, p.anahtar, !p.gizli))}
                    aria-pressed={!p.gizli} aria-label={`${p.ad}: ${p.gizli ? 'sitede gizli' : 'sitede görünüyor'}`}
                    title={p.sablonda ? 'Alan şablonunda "sitede gizli"; oradan açılır' : p.gizli ? 'Basınca sitede görünür' : 'Basınca sitede gizlenir'}
                    className={`p-1 rounded cursor-pointer disabled:cursor-not-allowed ${p.gizli ? 'text-kiremit' : 'text-[#2F7A45] dark:text-[#9FD3A9]'}`}>
                    {p.gizli ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <span className={p.gizli ? 'line-through text-gri dark:text-bej/60' : ''}>{p.ad}</span>
                  <span className="text-[10px] font-mono text-gri dark:text-bej/60">
                    {p.tur === 'bolum' ? 'bölüm' : p.tur === 'alan' ? 'künye' : ''}{p.sablonda ? ' · şablonda gizli' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gri dark:text-bej/70">Yalnız siteyi etkiler; vikide ve düzenleyicide hepsi görünür. Bir alanı bu türün bütün maddelerinde gizlemek için: Alan şablonları → "sitede gizli".</p>
          </details>
        );
      })()}

      {/* Esin notu (yapisal-4): yalnız yönetim yüzünde, sitede hiç yok */}
      {admin && typeof item.metadata?.esin === 'string' && item.metadata.esin.trim() && (
        <details className="mb-6 rounded border border-dashed border-bej/70 px-3 py-2 text-[13px]">
          <summary className="cursor-pointer postmark-label text-gri dark:text-bej/85">Esin notu · yalnız sen görürsün</summary>
          <p className="mt-2 whitespace-pre-line text-gri dark:text-bej/85">{item.metadata.esin}</p>
        </details>
      )}

      {/* Not → madde bağı: bu maddeyi #ad ile anan not sayfaları (yalnız yönetim yüzü) */}
      {admin && (() => {
        const notlar = maddeyiAnanNotlar(item, allItems);
        return notlar.length ? (
          <p className="mb-6 text-[12px] font-mono text-gri dark:text-bej/85">
            Not defterinde geçiyor: {notlar.map(n => n.title || 'adsız sayfa').join(' · ')}
          </p>
        ) : null;
      })()}

      {/* Aile: üyeler ve basit aile ağacı */}
      {item.type === 'aile' && <AileUyeleri aile={item} allItems={allItems} onNavigate={onNavigate} />}

      {/* --- Yönetim uyarıları: ziyaretçi bunları görmez --- */}
      {admin && (unlinked || stub) && (
        <div className="mb-6 space-y-2">
          {unlinked && (
            <p className="flex items-start gap-2 text-[13px] px-3 py-2 rounded border border-kiremit/30 bg-kiremit/8 text-kiremit">
              <Unlink size={14} className="mt-0.5 shrink-0" />
              <span>
                Bu madde evrende hiçbir şeye bağlı değil. Bağlanmayan maddeler
                wiki'yi ölü gösterir — en az bir ilişki kur.
              </span>
            </p>
          )}
          {stub && (
            <p className="flex items-start gap-2 text-[13px] px-3 py-2 rounded border border-bej/60 bg-bej/15 text-[#6b5b46] dark:text-[#A6B0C9]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Taslak. Künyenin %{completeness.pct}'i dolu ({completeness.filled}/
                {completeness.total} alan) ve gövde metni kısa.
              </span>
            </p>
          )}
        </div>
      )}

      {/*
        Gövdesi olmayan maddelerde (künyesi dolu ama metni yazılmamış
        karakterler) iki sütun kurmak sol tarafı boş bırakıyor. O durumda
        künye tam genişlikte, ızgara olarak açılır.
      */}
      <div
        className={
          govdeVar
            ? 'lg:grid lg:grid-cols-[1fr_280px] lg:gap-8 items-start'
            : ''
        }
      >
        {/* --- Gövde --- */}
        <div className="min-w-0 order-1">
          {ekBilgiler.length > 0 && (
            <section className="mb-7">
              <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-3 tracking-tight">Bilgiler</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {ekBilgiler.map((f, idx) => (
                  <div key={`${f.id}-${idx}`} className="min-w-0">
                    <dt className="text-[10px] font-mono uppercase tracking-wide text-gri dark:text-bej/85 mb-0.5">
                      {f.label}
                    </dt>
                    <dd className="text-[14px] text-[#2a2a2a] dark:text-krem/90 leading-snug">
                      <KunyeDegeri value={f.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {body.length === 0 ? (
            admin && ekBilgiler.length === 0 ? (
              <p className="text-gri dark:text-bej/85 italic text-sm">
                Gövde metni yok — bu maddenin bildikleri künyeden ibaret.
              </p>
            ) : null
          ) : (
            /* Aynı küme tüm bölümlere veriliyor: bir maddeye sayfada bir kez bağlanır */
            body.map((block, i) => (
              <section key={i} className="mb-7">
                {block.heading && (
                  <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-2 flex items-center gap-2 tracking-tight">
                    {block.heading}
                    {admin && block.status === 'öneri' && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-dashed border-kiremit/50 text-kiremit">
                        öneri
                      </span>
                    )}
                  </h2>
                )}
                <div className="text-[15px] text-[#2a2a2a] dark:text-krem/85">
                  <AutoLinkedText
                    text={block.text}
                    index={linkIndex}
                    selfId={item.id}
                    onNavigate={onNavigate}
                    showBroken={admin}
                    seen={linkedOnce}
                  />
                </div>
                {admin && onUpdateItem && block.anahtar && bekleyenler.get(block.anahtar) && (
                  <div className="mt-3 rounded-lg border border-dashed border-kiremit/60 bg-krem-acik/60 dark:bg-lacivert-800/35 p-3 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-kiremit">Bu bölüm için yeni öneri bekliyor</div>
                    <p className="text-[13px] whitespace-pre-line text-lacivert dark:text-krem/85">{bekleyenler.get(block.anahtar)}</p>
                    <div className="flex flex-wrap gap-2">
                      {([['yerine', 'Yerine koy'], ['alta', 'Altına ekle'], ['at', 'At']] as const).map(([is, ad]) => (
                        <button key={is} type="button" onClick={() => bekleyeniIsle(block.anahtar!, is)}
                          className={is === 'at' ? 'min-h-9 px-3 rounded-lg border border-bej dark:border-lacivert-600 text-[12px] cursor-pointer' : 'min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-bold cursor-pointer'}>
                          {ad}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))
          )}

          <WikiPeople
            people={relatedPeople}
            onNavigate={onNavigate}
            title={peopleLabel}
            proposalIds={peopleProposals}
          />

          <WikiRooms rooms={rooms} onNavigate={onNavigate} />

          {/* --- Alt maddeler (4. gece, üst–alt madde) --- */}
          {altMaddeler.length > 0 && (
            <section className="mt-8">
              <h2 className="font-sans text-xl text-lacivert dark:text-krem mb-3 tracking-tight">Alt maddeler</h2>
              <ul className="flex flex-wrap gap-1.5">
                {altMaddeler.map(a => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onNavigate(a.id)}
                      className="text-[13px] px-2.5 py-1 rounded border border-bej/50 dark:border-lacivert-600/50 text-lacivert dark:text-krem hover:border-lacivert/50 dark:hover:border-bej/50">
                      {a.title}<span className="ml-1.5 text-[9px] font-mono text-gri dark:text-bej/85">{TYPE_LABELS[a.type] || a.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- Künyelerde anılıyor (3. gece, bağ alanları) --- */}
          {ananlar.length > 0 && (
            <section className="mt-8 pt-6 border-t border-bej/40 dark:border-lacivert-600/40">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 mb-4 flex items-center gap-1.5">
                <Link2 size={12} /> Künyelerde anılıyor
              </h2>
              <div className="space-y-3">
                {ananlar.map(g => (
                  <div key={g.alan}>
                    <div className="text-[12px] text-gri dark:text-bej/85 mb-1.5">{g.alan}</div>
                    <ul className="flex flex-wrap gap-1.5">
                      {g.l.map(k => (
                        <li key={k.id}>
                          <button type="button" onClick={() => onNavigate(k.id)}
                            className="text-[13px] px-2.5 py-1 rounded border border-bej/50 dark:border-lacivert-600/50 text-lacivert dark:text-krem hover:border-lacivert/50 dark:hover:border-bej/50 hover:bg-lacivert/5 dark:hover:bg-bej/10">
                            {k.title}
                            <span className="ml-1.5 text-[9px] font-mono text-gri dark:text-bej/85">{TYPE_LABELS[k.type] || k.type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* --- Geri bağlantılar --- */}
          {grouped.length > 0 && (
            <section className="mt-8 pt-6 border-t border-bej/40 dark:border-lacivert-600/40">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 mb-4 flex items-center gap-1.5">
                <Link2 size={12} /> Evrendeki bağlantıları
              </h2>

              <div className="space-y-4">
                {grouped.map(g => (
                  <RelationGroup key={g.label} label={g.label} count={g.entries.length}>
                    {(visible: number) => g.entries.slice(0, visible).map(r => {
                        const otherId = r.sourceId === item.id ? r.targetId : r.sourceId;
                        const otherTitle =
                          r.sourceId === item.id ? r.targetTitle : r.sourceTitle;
                        const otherType =
                          r.sourceId === item.id ? r.targetType : r.sourceType;
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => onNavigate(otherId)}
                              className={`text-[13px] px-2.5 py-1 rounded border transition-colors ${
                                r.isProposal
                                  ? 'border-dashed border-kiremit/50 text-kiremit hover:bg-kiremit/8'
                                  : 'border-bej/50 dark:border-lacivert-600/50 text-lacivert dark:text-krem hover:border-lacivert/50 dark:hover:border-bej/50 hover:bg-lacivert/5 dark:hover:bg-bej/10'
                              }`}
                              title={r.reason}
                            >
                              {otherTitle}
                              <span className="ml-1.5 text-[9px] font-mono text-gri dark:text-bej/85">
                                {TYPE_LABELS[otherType] || otherType}
                              </span>
                            </button>
                          </li>
                      );
                    })}
                  </RelationGroup>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* --- Künye + Haritada --- */}
        {(kunye.length > 0 || haritada || gorsel) && (
          <aside
            className={
              govdeVar
                ? 'order-2 mt-8 lg:mt-0 lg:sticky lg:top-6'
                : 'order-2 mt-2'
            }
          >
            {(kunye.length > 0 || gorsel) && (
            <div className="border border-bej/50 dark:border-lacivert-600/50 rounded-lg overflow-hidden bg-krem-acik/70 dark:bg-lacivert-800/40 archive-shadow">
              <h2 className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gri dark:text-bej/85 border-b border-bej/40 dark:border-lacivert-600/40 bg-bej/12 dark:bg-lacivert-600/25">
                Künye
              </h2>
              {gorsel && (
                <div className="border-b border-bej/40 dark:border-lacivert-600/40 bg-[#F3EFE8] p-3">
                  <img
                    src={gorsel}
                    alt={item.title}
                    className="block mx-auto w-full max-h-64 object-contain"
                  />
                </div>
              )}
              <dl
                className={
                  govdeVar
                    ? 'divide-y divide-bej/30 dark:divide-lacivert-600/30'
                    : 'grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-bej/30 dark:bg-lacivert-600/30'
                }
              >
                {kunye.map((f, idx) => (
                  <div
                    key={`${f.id}-${idx}`}
                    className={
                      govdeVar
                        ? 'px-4 py-2.5'
                        : 'px-4 py-3 bg-krem-acik/90 dark:bg-lacivert-800/60'
                    }
                  >
                    <dt className="text-[10px] font-mono uppercase tracking-wide text-gri dark:text-bej/85 mb-0.5">
                      {f.label}
                    </dt>
                    <dd className="text-[13px] text-lacivert dark:text-krem/90 leading-snug">
                      <KunyeAlani value={f.value} alan={semaAlani.get(f.id)} allItems={allItems} selfId={item.id} admin={admin} onNavigate={onNavigate} />
                    </dd>
                  </div>
                ))}
              </dl>

              {admin && completeness.total > 0 && (
                <div className="px-4 py-2 border-t border-bej/40 dark:border-lacivert-600/40">
                  <div className="flex items-center justify-between text-[10px] font-mono text-gri dark:text-bej/85 mb-1">
                    <span>künye doluluğu</span>
                    <span>%{completeness.pct}</span>
                  </div>
                  <div className="h-1 rounded-full bg-bej/35 dark:bg-lacivert-600/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cam transition-all"
                      style={{ width: `${completeness.pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            <WikiHarita
              item={item}
              onNavigate={onNavigate}
              onHaritayaGit={onHaritayaGit}
            />
          </aside>
        )}
      </div>
    </article>
  );
};
