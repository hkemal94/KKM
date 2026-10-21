import React, { useMemo, useState } from 'react';
import { KURUM_TIKI } from '../../lib/markaYapisi';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from 'lucide-react';
import type { Item, WikiSection } from '../../types';
import { parseKunye, kendiMetniYaz } from './kunyeParser';
import { useKaydedilmemis } from '../../lib/kaydedilmemis';
import { BAG_GRUPLARI, BAG_GRUP_SIRASI, bagAdaylari, etkinSablon, ozelAlanKimligi, semaAlanlari, takmaAdlar, type BagGrubu, type SablonAlani, type SemaAlani, type VikiSablonu } from '../../lib/alanSablonu';
import { TYPE_LABELS, WIKI_TYPES, schemaKeyFor, getKunyeFields } from './wikiSchema';
import { BAG_TURLERI, getRelationLabels, resolveAllRelations, type BagTuru } from '../../utils/relations';
import { aileUyeleri, type AileUyeligi } from '../../lib/aileUyeligi';
import { tamAd } from '../../lib/kisiAdi';
import { bagUygun, kaynakTurleri, uygunTurler } from '../../lib/bagKurallari';

/**
 * Madde düzenleyici (yapisal-4, 25–28). Vikinin yönetim yüzünde "düzenle"ye
 * basınca maddenin üstünde açılır:
 *   - Künye alanları (türün şemasından; Kişi'de "Aile", Aile'de mahalle,
 *     uğraş, bağlı mekânlar / kişiler, adaya geliş)
 *   - Bağlar: hedef madde + sabit listeden bağ türü
 *   - Esin notu: yalnız Kemal görür; sitede ve okuma yüzünde yok
 *   - Metin (1 Ekim, Kemal: "künye harici düzenleme yapamıyorum"): giriş
 *     metni ve vikide görünen bölümler (başlık + metin; ekle, sil, sırala).
 *     Metni Kemal yazar; burada hiçbir şey kendiliğinden doldurulmaz.
 * Kayda yalnız "Kaydet" ile yazılır.
 */

interface Props {
  item: Item;
  allItems: Item[];
  onKaydet: (item: Item) => Promise<void>;
  /** "Bu türe alan ekle" (3. gece): verilirse yeni alan şablona da yazılır */
  onSablonYaz?: (s: VikiSablonu) => Promise<void>;
  onKapat: () => void;
}

interface Bag { targetId: string; type: BagTuru; isProposal?: boolean; reason?: string; bas?: number; bit?: number; /** ekranda yazılan yıllar ("1950–1975") */ yil?: string }

/** Bağın yılları (6. gece): "1950–1975", "1950–" (açık uçlu) ya da "1950" */
const bagYili = (b: Bag) => (typeof b.bas === 'number' ? `${b.bas}–${typeof b.bit === 'number' ? b.bit : ''}` : '');
function yilOku(s: string): { bas?: number; bit?: number } {
  const m = s.trim().match(/^(\d{3,4})\s*(?:[–—-]\s*(\d{3,4})?)?$/);
  if (!m) return {};
  const bas = Number(m[1]), bit = m[2] ? Number(m[2]) : undefined;
  return bit !== undefined && bit >= bas ? { bas, bit } : { bas };
}

const yolOku = (item: Item, yol: string): string => {
  const v = yol.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), item);
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
};

export const MaddeDuzenleyici: React.FC<Props> = ({ item, allItems, onKaydet, onSablonYaz, onKapat }) => {
  const sablonAnahtari = schemaKeyFor(item.type) || '';
  /** Bu düzenleyicide eklenen, henüz şablona yazılmamış alanlar */
  const [yeniAlanlar, setYeniAlanlar] = useState<SablonAlani[]>([]);
  const [alanAdi, setAlanAdi] = useState('');
  const [alanBagi, setAlanBagi] = useState<BagGrubu | ''>('');
  const sema: SemaAlani[] = useMemo(() => {
    const s = etkinSablon();
    const taslak = yeniAlanlar.length ? { ...s, [sablonAnahtari]: [...(s[sablonAnahtari] || []), ...yeniAlanlar] } : s;
    return semaAlanlari(sablonAnahtari, taslak).filter(f => f.fieldPath !== 'title' && f.fieldPath !== 'notes');
  }, [sablonAnahtari, yeniAlanlar]);
  const [alanlar, setAlanlar] = useState<Record<string, string>>(() => Object.fromEntries(sema.map(f => [f.fieldPath, yolOku(item, f.fieldPath)])));
  /** Üst madde (4. gece): her madde bir başka maddenin altına konabilir (metadata.placeId) */
  const [ust, setUst] = useState<string>(String(item.metadata?.placeId || ''));
  /** Takma adlar (3. gece): virgülle; eski adlar da burada görünür */
  const ilkTakma = useMemo(() => takmaAdlar(item).join(', '), [item]);
  const [takma, setTakma] = useState<string>(ilkTakma);
  const [baglar, setBaglar] = useState<Bag[]>(() => ((item.metadata?.relations as Bag[]) || []).filter(b => b && b.targetId));
  const [esin, setEsin] = useState<string>(String(item.metadata?.esin || ''));
  /** Alan boşsa metindeki künye satırından okunan değer — kutuda soluk görünür */
  const metindeki = useMemo(() => new Map(getKunyeFields(item).map(f => [f.id, f.value])), [item]);
  const ipucu = (id: string, soru: string) => (metindeki.get(id) ? `metinde: ${metindeki.get(id)}` : soru);
  /** Maddenin adı (2 Ekim, Kemal: "isimleri değiştirmek mümkün değil") */
  const [ad, setAd] = useState<string>(item.title);
  /** Giriş metni: notlardaki kendi metin (künye satırları hariç) */
  const ilkGiris = useMemo(() => parseKunye(item).kendiMetni, [item]);
  const [giris, setGiris] = useState<string>(ilkGiris);
  const [bolumler, setBolumler] = useState<WikiSection[]>(() => ((item.metadata?.wikiSections as WikiSection[]) || []).map(b => ({ ...b })));
  // Metin değiştiyse kaydetmeden çıkarken sorulur
  const metinDegisti = ust !== String(item.metadata?.placeId || '') || yeniAlanlar.length > 0 || takma.trim() !== ilkTakma.trim() || ad.trim() !== item.title.trim() || giris.trim() !== ilkGiris.trim() || JSON.stringify(bolumler) !== JSON.stringify((item.metadata?.wikiSections as WikiSection[]) || []);
  useKaydedilmemis(metinDegisti);
  const bolumYaz = (n: number, d: Partial<WikiSection>) => setBolumler(bs => bs.map((b, k) => (k === n ? { ...b, ...d } : b)));
  const bolumTasi = (n: number, yon: -1 | 1) => setBolumler(bs => {
    const j = n + yon;
    if (j < 0 || j >= bs.length) return bs;
    const y = bs.slice();
    [y[n], y[j]] = [y[j], y[n]];
    return y;
  });
  /** Markalar'da kurum olarak görünsün mü (1 Ekim, Kemal: "ben tikle seçerim") */
  const kurumTikiVar = item.type !== 'marka' && item.type !== 'kulüp';
  const [kurum, setKurum] = useState<boolean>(item.metadata?.[KURUM_TIKI] === true);
  const [yeniHedef, setYeniHedef] = useState('');
  /** Öbür maddelerin kaydında bu maddeye yazılmış bağlar (21 Ekim): yalnız gösterilir, buradan değişmez */
  const gelenBaglar = useMemo(() => resolveAllRelations(item, allItems)
    .filter(r => r.originItemId !== item.id && !r.isProposal && (r.type !== 'genel bağlantı') && r.sourceId !== item.id)
    // Bu maddenin kendi kaydında aynı kişiyle aynı tür bağ zaten varsa tekrar yazılmaz
    .filter(r => !baglar.some(b => b.targetId === r.sourceId && b.type === r.type)), [item, allItems, baglar]);
  // Bağ türü madde türüne özel (8 Ekim, `lib/bagKurallari.ts`): bu maddenin
  // kurabileceği türler; hedef listesi seçilen türe uyan maddeler
  const izinliTurler = useMemo(() => kaynakTurleri(item.type), [item.type]);
  const [yeniTur, setYeniTur] = useState<BagTuru>('genel bağlantı');
  const [yaziliyor, setYaziliyor] = useState(false);

  const hedefler = useMemo(() => allItems
    .filter(i => i.id !== item.id && !i.archived && !i.isProposal && WIKI_TYPES.includes(i.type) && i.type !== 'oda')
    .sort((a, b) => a.title.localeCompare(b.title, 'tr')), [allItems, item.id]);
  /** Üst madde adayları: kendisi ve kendi alt maddeleri hariç (döngü olmasın) */
  const ustAdaylari = useMemo(() => {
    const altlar = new Set<string>([item.id]);
    let degisti = true;
    while (degisti) {
      degisti = false;
      for (const i of allItems) {
        const p = i.metadata?.placeId;
        if (p && altlar.has(p) && !altlar.has(i.id)) { altlar.add(i.id); degisti = true; }
      }
    }
    return hedefler.filter(h => !altlar.has(h.id));
  }, [hedefler, allItems, item.id]);
  /** Mahalle alanı için seçenekler: üst düzey 'yer' kayıtları (mahalleler) */
  const mahalleSecenekleri = useMemo(() => hedefler.filter(i => i.type === 'yer' && !i.metadata?.placeId).map(i => i.title), [hedefler]);

  const kaydet = async () => {
    setYaziliyor(true);
    try {
      const metadata = { ...(item.metadata || {}) } as Record<string, unknown>;
      const profil = { ...((metadata.profile as Record<string, unknown>) || {}) };
      const ozel = { ...((metadata.alanlar as Record<string, unknown>) || {}) };
      for (const f of sema) {
        const v = (alanlar[f.fieldPath] || '').trim();
        if (f.fieldPath.startsWith('metadata.profile.')) profil[f.fieldPath.slice('metadata.profile.'.length)] = v;
        else if (f.fieldPath.startsWith('metadata.alanlar.')) ozel[f.fieldPath.slice('metadata.alanlar.'.length)] = v;
        else if (f.fieldPath.startsWith('metadata.')) metadata[f.fieldPath.slice('metadata.'.length)] = v;
      }
      metadata.profile = profil;
      if (Object.keys(ozel).length) metadata.alanlar = ozel;
      // Takma adlar: eski adlardan silinen de silinir
      const takmaListe = Array.from(new Set(takma.split(/[,;]/).map(t => t.trim()).filter(Boolean)));
      if (takmaListe.length || Array.isArray(metadata.aliases)) metadata.aliases = takmaListe;
      if (Array.isArray(metadata.eskiAdlar)) metadata.eskiAdlar = (metadata.eskiAdlar as unknown[]).filter(e => typeof e === 'string' && takmaListe.includes(e));
      // Yeni alanlar önce şablona (kayıt reddedilirse madde de yazılmaz)
      if (yeniAlanlar.length && onSablonYaz) {
        const s = etkinSablon();
        await onSablonYaz({ ...s, [sablonAnahtari]: [...(s[sablonAnahtari] || []), ...yeniAlanlar] });
      }
      // Firestore: undefined yazılmaz
      metadata.relations = baglar.map(b => {
        const o: Record<string, unknown> = { targetId: b.targetId, type: b.type };
        if (b.isProposal) o.isProposal = true;
        if (b.reason) o.reason = b.reason;
        const y = b.yil !== undefined ? yilOku(b.yil) : { bas: b.bas, bit: b.bit };
        if (typeof y.bas === 'number') o.bas = y.bas;
        if (typeof y.bit === 'number') o.bit = y.bit;
        return o;
      });
      metadata.esin = esin.trim();
      // Üst madde: kayıt birleşerek yazıldığı için kaldırınca boş yazılır
      if (ust || metadata.placeId) metadata.placeId = ust;
      // Bölümler: boş başlık ve boş metinli olanlar atılır; undefined yazılmaz
      metadata.wikiSections = bolumler
        .map(b => ({ id: b.id, title: b.title.trim(), content: b.content.trim(), status: b.status || 'resmi' }))
        .filter(b => b.title || b.content);
      // Tik kalkınca false yazılır: kayıt birleşerek yazıldığı için anahtarı silmek yetmez
      if (kurumTikiVar && (kurum || metadata[KURUM_TIKI] !== undefined)) metadata[KURUM_TIKI] = kurum;
      const notes = giris.trim() === ilkGiris.trim() ? item.notes : kendiMetniYaz(item, giris);
      // Boş ad yazılmaz; eski ad kalır
      const title = ad.trim() || item.title;
      await onKaydet({ ...item, title, notes, metadata: metadata as Item['metadata'], updatedAt: Date.now() });
      onKapat();
    } catch {
      // Sunucu yazmadı: uyarıyı uygulama gösterir; düzenleyici açık kalır,
      // yazılan metin kaybolmaz (2 Ekim gece)
    } finally {
      setYaziliyor(false);
    }
  };

  const secim = 'text-[13px] bg-white dark:bg-lacivert-800/60 border border-bej/70 dark:border-lacivert-600/60 rounded px-2 py-1.5 focus:outline-hidden focus:border-kiremit';
  const girdi = 'w-full text-[13px] bg-white dark:bg-lacivert-800/60 border border-bej/70 dark:border-lacivert-600/60 rounded px-2.5 py-1.5 focus:outline-hidden focus:border-kiremit';

  return (
    <section className="mb-8 rounded-lg border-2 border-kiremit/40 bg-white/60 dark:bg-lacivert-800/40 p-4 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-sans text-[15px] font-bold">Düzenle · {TYPE_LABELS[item.type] || item.type}</h2>
        <button type="button" onClick={onKapat} aria-label="Kapat" className="p-1 text-gri hover:text-lacivert dark:text-bej/85"><X size={16} /></button>
      </div>

      <label className="block">
        <span className="block text-[11px] text-gri dark:text-bej/85 mb-0.5">Ad</span>
        <input value={ad} onChange={e => setAd(e.target.value)} placeholder={item.title} className={`${girdi} font-semibold`} />
      </label>

      {sema.length > 0 && (
        <div>
          <div className="postmark-label text-gri dark:text-bej/85 mb-2">Künye</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sema.map(f => (
              <label key={f.id} className="block">
                <span className="block text-[11px] text-gri dark:text-bej/85 mb-0.5">{f.label}</span>
                {f.bag?.length ? (
                  <>
                    <input list={`bag-${f.id}`} value={alanlar[f.fieldPath] || ''} onChange={e => setAlanlar(a => ({ ...a, [f.fieldPath]: e.target.value }))} placeholder={ipucu(f.id, f.coklu ? `${f.question} (virgülle birden çok)` : f.question)} className={girdi} />
                    <datalist id={`bag-${f.id}`}>{bagAdaylari(allItems, f.bag, item.id).map(a => <option key={a.id} value={a.title} />)}</datalist>
                    <span className="block mt-0.5 text-[10px] text-gri dark:text-bej/70">bağ alanı · {f.bag.map(g => BAG_GRUPLARI[g].ad).join(', ')}</span>
                  </>
                ) : f.id === 'region' ? (
                  <>
                    <input list="mahalle-listesi" value={alanlar[f.fieldPath] || ''} onChange={e => setAlanlar(a => ({ ...a, [f.fieldPath]: e.target.value }))} placeholder={ipucu(f.id, f.question)} className={girdi} />
                    <datalist id="mahalle-listesi">{mahalleSecenekleri.map(m => <option key={m} value={m} />)}</datalist>
                  </>
                ) : (
                  <input value={alanlar[f.fieldPath] || ''} onChange={e => setAlanlar(a => ({ ...a, [f.fieldPath]: e.target.value }))} placeholder={ipucu(f.id, f.question)} className={girdi} />
                )}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-gri dark:text-bej/70">Boş bırakılan alan, metindeki künye satırında yazıyorsa oradan okunur.</p>
          {onSablonYaz && sablonAnahtari && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={alanAdi} onChange={e => setAlanAdi(e.target.value)} placeholder="Bu türe yeni alan (ör. Lakabı)" className={`${girdi} flex-1 min-w-[160px]`} />
              <select value={alanBagi} onChange={e => setAlanBagi(e.target.value as BagGrubu | '')} className={secim} aria-label="Bağ alanı mı">
                <option value="">düz yazı</option>
                {BAG_GRUP_SIRASI.map(g => <option key={g} value={g}>bağ · {BAG_GRUPLARI[g].ad}</option>)}
              </select>
              <button type="button" disabled={!alanAdi.trim()} onClick={() => {
                const mevcut = [...(etkinSablon()[sablonAnahtari] || []), ...yeniAlanlar];
                setYeniAlanlar(y => [...y, { id: ozelAlanKimligi(alanAdi.trim(), mevcut), label: alanAdi.trim(), ozel: true, ...(alanBagi ? { bag: [alanBagi] } : {}) }]);
                setAlanAdi(''); setAlanBagi('');
              }} className="inline-flex items-center gap-1 text-[12px] font-mono px-2.5 py-1.5 rounded border border-bej/70 hover:border-kiremit disabled:opacity-40">
                <Plus size={13} /> Bu türe alan ekle
              </button>
              {yeniAlanlar.length > 0 && <span className="w-full text-[11px] text-kiremit">Yeni alan "Kaydet"e basınca bu türün bütün maddelerine gelir.</span>}
            </div>
          )}
        </div>
      )}

      <label className="block">
        <span className="block text-[11px] text-gri dark:text-bej/85 mb-0.5">Üst madde · bu madde neyin altında?</span>
        <select value={ust} onChange={e => setUst(e.target.value)} className={`${secim} w-full`}>
          <option value="">— yok (en üstte)</option>
          {ustAdaylari.map(h => <option key={h.id} value={h.id}>{h.title} · {TYPE_LABELS[h.type] || h.type}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="block text-[11px] text-gri dark:text-bej/85 mb-0.5">Takma adlar · virgülle</span>
        <input value={takma} onChange={e => setTakma(e.target.value)} placeholder="Başka adları (ör. Düzada Köyü). Vikide geçince bağlantı olur." className={girdi} />
      </label>

      <div>
        <div className="postmark-label text-gri dark:text-bej/85 mb-1">Metin</div>
        <span className="block text-[11px] text-gri dark:text-bej/85 mb-0.5">Giriş metni</span>
        <textarea value={giris} onChange={e => setGiris(e.target.value)} rows={6} placeholder="Maddenin giriş metni — sen yazıyorsun." className={`${girdi} leading-relaxed`} />
        <div className="mt-3 space-y-3">
          {bolumler.map((b, n) => (
            <div key={b.id} className="rounded border border-bej/60 dark:border-lacivert-600/60 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input value={b.title} onChange={e => bolumYaz(n, { title: e.target.value })} placeholder="Bölüm başlığı (ör. Tarihçe)" className={`${girdi} font-semibold`} />
                {b.status === 'öneri' && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-kiremit/15 text-kiremit">öneri</span>}
                <button type="button" aria-label="Yukarı" onClick={() => bolumTasi(n, -1)} disabled={n === 0} className="p-2 text-gri hover:text-kiremit disabled:opacity-30"><ArrowUp size={14} /></button>
                <button type="button" aria-label="Aşağı" onClick={() => bolumTasi(n, 1)} disabled={n === bolumler.length - 1} className="p-2 text-gri hover:text-kiremit disabled:opacity-30"><ArrowDown size={14} /></button>
                <button type="button" aria-label="Bölümü sil" onClick={() => setBolumler(bs => bs.filter((_, k) => k !== n))} className="p-2 text-gri hover:text-kiremit"><Trash2 size={14} /></button>
              </div>
              <textarea value={b.content} onChange={e => bolumYaz(n, { content: e.target.value })} rows={4} placeholder="Bölümün metni…" className={`${girdi} leading-relaxed`} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setBolumler(bs => [...bs, { id: `b${Date.now()}`, title: '', content: '', status: 'resmi' }])}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-mono px-2.5 py-1.5 rounded border border-bej/70 hover:border-kiremit">
          <Plus size={13} /> Bölüm ekle
        </button>
      </div>

      <div>
        <div className="postmark-label text-gri dark:text-bej/85 mb-2">Bağlar</div>
        {baglar.length === 0 && <p className="text-[12px] text-gri dark:text-bej/70 mb-2">Henüz bağ yok.</p>}
        <ul className="space-y-1.5 mb-2">
          {baglar.map((b, n) => {
            const h = allItems.find(i => i.id === b.targetId);
            return (
              <li key={`${b.targetId}-${n}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                <select value={b.type} onChange={e => setBaglar(bs => bs.map((x, k) => (k === n ? { ...x, type: e.target.value as BagTuru } : x)))} className={secim}>
                  {/* Yalnız uyan türler; var olan uymayan tür seçili kalır, "uymuyor" yazar */}
                  {BAG_TURLERI.filter(t => t.id === b.type || !h || uygunTurler(item.type, h.type).includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
                </select>
                <span className="flex-1 min-w-0 truncate">{h?.title || 'silinmiş madde'}{b.isProposal ? ' · öneri' : ''}
                  {h && !bagUygun(b.type, item.type, h.type) && <span className="ml-1.5 text-[11px] text-kiremit" title="Bu bağ türü bu iki madde arasında olmaz; türü değiştir ya da bağı kaldır">· uymuyor</span>}
                </span>
                <input value={b.yil ?? bagYili(b)} onChange={e => setBaglar(bs => bs.map((x, k) => (k === n ? { ...x, yil: e.target.value } : x)))}
                  placeholder="yıllar" aria-label="Bağın yılları" title="İsteğe bağlı: 1950–1975 ya da 1950– (sürüyor)"
                  className={`${secim} w-28 ${b.yil && b.yil.trim() && yilOku(b.yil).bas === undefined ? 'border-kiremit' : ''}`} />
                <button type="button" aria-label="Bağı kaldır" onClick={() => setBaglar(bs => bs.filter((_, k) => k !== n))} className="p-1 text-gri hover:text-kiremit"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
        {gelenBaglar.length > 0 && (
          <div className="mb-2 rounded border border-dashed border-bej/70 dark:border-lacivert-600 px-3 py-2">
            <p className="text-[11px] font-mono text-gri dark:text-bej/80 mb-1">Öbür maddelerin kaydından gelen bağlar (burada değişmez; orada değişir)</p>
            <ul className="space-y-0.5 text-[13px]">
              {gelenBaglar.map(r => (
                <li key={r.id}>
                  <span className="text-gri dark:text-bej/80">{getRelationLabels(r.type, r.sourceType, r.targetType).inverse}: </span>
                  {r.sourceTitle}
                  <span className="text-[11px] text-gri dark:text-bej/70"> · {r.sourceTitle} kaydında yazılı</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select value={yeniTur} onChange={e => { setYeniTur(e.target.value as BagTuru); setYeniHedef(''); }} className={secim}>
            {BAG_TURLERI.filter(t => izinliTurler.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
          </select>
          <select value={yeniHedef} onChange={e => setYeniHedef(e.target.value)} className={`${secim} flex-1 min-w-[160px]`}>
            <option value="">Madde seç…</option>
            {hedefler.filter(h => bagUygun(yeniTur, item.type, h.type)).map(h => <option key={h.id} value={h.id}>{h.title} · {TYPE_LABELS[h.type] || h.type}</option>)}
          </select>
          <button type="button" disabled={!yeniHedef} onClick={() => { setBaglar(bs => [...bs, { targetId: yeniHedef, type: yeniTur }]); setYeniHedef(''); }}
            className="inline-flex items-center gap-1 text-[12px] font-mono px-2.5 py-1.5 rounded border border-bej/70 hover:border-kiremit disabled:opacity-40">
            <Plus size={13} /> Bağ ekle
          </button>
        </div>
      </div>

      <div>
        <div className="postmark-label text-gri dark:text-bej/85 mb-1">Esin notu · yalnız sen görürsün</div>
        <textarea value={esin} onChange={e => setEsin(e.target.value)} rows={3} placeholder="Bu madde neyden esinlendi? Sitede ve okuma yüzünde görünmez." className={girdi} />
      </div>

      {kurumTikiVar && (
        <label className="flex items-start gap-3 min-h-11 cursor-pointer">
          <input type="checkbox" checked={kurum} onChange={e => setKurum(e.target.checked)} className="mt-1 w-5 h-5 accent-[#0E1C4F] dark:accent-[#F26B6F] shrink-0" />
          <span>
            <span className="block text-[14px] font-semibold">Markalar'da kurum olarak göster</span>
            <span className="block text-[12px] text-gri dark:text-bej/70">Tiklersen bu madde Markalar sayfasında kurgu içi kurumlar arasına gelir; madde vikide olduğu gibi kalır. Tiki kaldırınca oradan çıkar.</span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onKapat} className="text-[12px] font-mono px-3 py-1.5 rounded border border-bej/70">Vazgeç</button>
        <button type="button" disabled={yaziliyor} onClick={() => void kaydet()} className="inline-flex items-center gap-1 text-[12px] font-mono px-3 py-1.5 rounded bg-lacivert text-krem dark:bg-[#2C3C72] disabled:opacity-40">
          <Save size={13} /> {yaziliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </section>
  );
};

/**
 * Aile sayfası: üyeler ve basit aile ağacı. Üyeler kişilerin "Aile", "Soyadı"
 * ve "Doğduğu aile" alanlarından ve eşlerinden hesaplanır (21 Ekim,
 * `lib/aileUyeligi.ts`): evlenip geçen kişi iki ailede de görünür.
 */
export const AileUyeleri: React.FC<{ aile: Item; allItems: Item[]; onNavigate: (id: string) => void }> = ({ aile, allItems, onNavigate }) => {
  const uyeler = useMemo(() => aileUyeleri(aile, allItems), [aile, allItems]);
  const kutu = (u: AileUyeligi) => {
    const rol = (u.kisi.metadata?.profile as Record<string, string> | undefined)?.profession;
    const tam = tamAd(u.kisi);
    const not = u.yol === 'dogum' ? 'doğduğu aile' : u.yol === 'evlilik' && u.es ? `eşi: ${u.es.title}` : '';
    return (
      <div key={u.kisi.id} className="relative flex flex-col items-center">
        <span className="absolute -top-5 h-5 w-px bg-bej dark:bg-lacivert-600" />
        <button type="button" onClick={() => onNavigate(u.kisi.id)} className="px-3 py-1.5 rounded border border-bej/80 dark:border-lacivert-600 bg-white/70 dark:bg-lacivert-800/40 text-[13px] hover:border-kiremit">
          {tam || u.kisi.title}
          {rol && <span className="block text-[10px] text-gri dark:text-bej/70">{rol}</span>}
          {not && <span className="block text-[10px] text-gri dark:text-bej/70">{not}</span>}
        </button>
      </div>
    );
  };
  const kendi = uyeler.filter(u => u.yol !== 'evlilik');
  const evlilikle = uyeler.filter(u => u.yol === 'evlilik');
  const sira = (liste: AileUyeligi[]) => (
    <div className="relative flex flex-wrap justify-center gap-x-3 gap-y-4 pt-5 border-t border-bej dark:border-lacivert-600" style={{ minWidth: liste.length > 1 ? '60%' : undefined }}>
      {liste.map(kutu)}
    </div>
  );
  return (
    <section className="mb-8">
      <h2 className="font-sans text-[20px] mb-3">Üyeler</h2>
      {uyeler.length === 0 ? (
        <p className="text-[13px] text-gri dark:text-bej/80">Henüz üye yok. Bir kişinin künyesinde "Aile" ya da "Soyadı" alanına bu ailenin adı yazılınca burada görünür.</p>
      ) : (
        <div className="flex flex-col items-center">
          <div className="px-4 py-2 rounded-lg bg-lacivert text-krem dark:bg-[#2C3C72] text-[14px] font-semibold">{aile.title}</div>
          <div className="w-px h-5 bg-bej dark:bg-lacivert-600" />
          {kendi.length > 0 && sira(kendi)}
          {evlilikle.length > 0 && (
            <>
              <p className="mt-5 mb-1 text-[11px] font-mono uppercase tracking-wide text-gri dark:text-bej/80">Evlilikle bağlı olanlar</p>
              {sira(evlilikle)}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default MaddeDuzenleyici;
