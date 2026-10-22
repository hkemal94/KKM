import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { Item } from '../../types';
import { adayBilgisi, adayiIsle, bekleyenAdaylar, eskiOneriler } from '../../lib/adaylar';
import { aracBul, oneriyiUygula, yapayZekaOnerisi, type YapayZekaOnerisi } from '../../lib/studyo';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';
import type { StudyoIslemleri } from './StudyoBaglami';

/**
 * Öneri tepsisi (29 Eylül akşamı) — Adaylar ile yapay zekâ önerileri tek
 * yerde (Kemal: "tek tepsi").
 *   - CEVAP: atölyeye verdiğin cevap. "İşle" maddenin
 *     alanına yazar.
 *   - YAPAY ZEKÂ: stüdyonun ürettiği öneri. "Ekle" hedef kayda yazar ve
 *     öneriyi siler; "Sil" yalnız öneriyi siler. Hiçbiri sen basmadan
 *     bir kayda dokunmaz.
 * Ana sayfada kısa hâli (ilk 3), stüdyoda tamamı.
 */

interface Props extends StudyoIslemleri {
  /** Kaç öneri görünsün (ana sayfa: 3) */
  sinir?: number;
  /** Yalnız bu kayda ait öneriler (yan panel) */
  hedefId?: string;
  baslik?: string;
  /** Neyin Eksik'teki Temizlik kartına götürür (eski öneriler orada silinir) */
  onTemizlik?: () => void;
}

const kopyala = (m: string) => { try { void navigator.clipboard.writeText(m); } catch { /* yok */ } };

export const OneriTepsisi: React.FC<Props> = ({
  items, onUpdateItem, onAddItem, onDeleteItem, onMaddeyiAc, onAcceptProposal, onStudyoSayfasi,
  sinir, hedefId, baslik = 'Öneri tepsisi', onTemizlik
}) => {
  const hepsi = useMemo(() => bekleyenAdaylar(items).filter(a => {
    if (!hedefId) return true;
    return (yapayZekaOnerisi(a)?.hedefId || adayBilgisi(a)?.hedefId) === hedefId;
  }), [items, hedefId]);
  const eskiler = useMemo(() => (hedefId || sinir ? [] : eskiOneriler(items)), [items, hedefId, sinir]);
  const [acik, setAcik] = useState<string | null>(null);
  const [duzenleme, setDuzenleme] = useState<Record<string, string>>({});
  const [calisan, setCalisan] = useState<string | null>(null);
  const [rapor, setRapor] = useState<string | null>(null);
  const [eskiAcik, setEskiAcik] = useState(false);

  const gorunen = sinir ? hepsi.slice(0, sinir) : hepsi;

  // ---- soru cevabı
  const isle = async (a: Item) => {
    const b = adayBilgisi(a)!;
    const cevap = (duzenleme[a.id] ?? b.cevap).trim();
    if (!cevap) return;
    const sonuc = adayiIsle({ ...a, notes: cevap, metadata: { ...a.metadata, aday: { ...b, cevap } } }, items);
    if (!sonuc) { setRapor(`"${b.etiket}" alanı bu arada dolmuş ya da madde bulunamadı; maddeye bakıp öneriyi silebilirsin.`); return; }
    setCalisan(a.id);
    try {
      await onUpdateItem(sonuc.hedef);
      await onDeleteItem(a.id);
      setRapor(`${sonuc.hedef.title} · ${b.etiket} vikiye yazıldı.`);
    } finally { setCalisan(null); }
  };

  // ---- yapay zekâ önerisi
  const ekle = async (a: Item, o: YapayZekaOnerisi, secim?: string | number) => {
    const s = oneriyiUygula(o, items, { secim });
    if (!s) { setRapor('Hedef kayıt bulunamadı; öneriyi silebilirsin.'); return; }
    setCalisan(a.id);
    try {
      if (s.guncel) await onUpdateItem(s.guncel);
      if (s.yeni) await onAddItem(s.yeni);
      // Ürün önerisinde diğer ürünler kalsın diye yalnız seçilen çıkar
      if (typeof secim === 'number' && (o.urunler?.length || 0) > 1) {
        await onUpdateItem({ ...a, metadata: { ...a.metadata, aday: { ...o, urunler: o.urunler!.filter((_, n) => n !== secim) } }, updatedAt: Date.now() });
      } else {
        await onDeleteItem(a.id);
      }
      setRapor(s.yeni ? `"${s.yeni.title}" eklendi.` : `${s.guncel?.title} güncellendi.`);
    } finally { setCalisan(null); }
  };

  const sil = async (a: Item) => {
    setCalisan(a.id);
    try {
      if (a.type === 'aday') await onDeleteItem(a.id);
      else await onUpdateItem({ ...a, archived: true, updatedAt: Date.now() });
    } finally { setCalisan(null); }
  };

  const satir = (a: Item, tur: string, govde: React.ReactNode) => {
    const buAcik = acik === a.id || (!!hedefId && hepsi.length <= 2);
    return (
      <li key={a.id} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72]">
        <button type="button" onClick={() => setAcik(buAcik ? null : a.id)} className="w-full flex items-center gap-2.5 py-2 text-left cursor-pointer">
          <i className="not-italic shrink-0 px-1.5 py-0.5 rounded bg-[#F3EFE8] dark:bg-[#17345A] text-[9px] font-mono font-bold tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">{tur}</i>
          <span className={`flex-1 min-w-0 truncate text-[13px] ${YAZI}`}>{a.title}</span>
          <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{neZaman(a.createdAt)}</span>
          {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
        </button>
        {buAcik && <div className="pb-3 space-y-2">{govde}</div>}
      </li>
    );
  };

  /** Gece önerisinin türüne göre "Ekle"nin ne açacağı; açacak bir şey yoksa düğme yok */
  const geceTuru = (o: YapayZekaOnerisi) => (o as YapayZekaOnerisi & { gece?: { tur: string } }).gece?.tur;
  const eklenebilir = (o: YapayZekaOnerisi) => {
    if (o.arac !== 'gece-oneri') return true;
    const t = geceTuru(o);
    if ((t === 'viki' || t === 'depo') && o.bolumler?.length && items.some(i => i.id === o.hedefId)) return true;
    return t === 'sosyal' || t === 'yazi' || (t === 'drop' && items.find(i => i.id === o.hedefId)?.type === 'drop');
  };
  const geceDugmesi = (o: YapayZekaOnerisi) => ({ sosyal: 'Gönderi taslağı aç', yazi: 'Yazı taslağı aç', drop: "Drop'a ürün olarak ekle", viki: 'Maddeye öneri bölümü olarak ekle', depo: 'Maddeye öneri bölümü olarak ekle' } as Record<string, string>)[geceTuru(o) || ''] || 'Ekle';

  const hedefiAc = (id: string) => { const h = items.find(i => i.id === id); if (h) onMaddeyiAc(h); };

  const yapayZekaGovdesi = (a: Item, o: YapayZekaOnerisi) => {
    const arac = aracBul(o.arac);
    const is = calisan === a.id;
    const kutu = `rounded-lg bg-white dark:bg-[#17345A] border border-[#CFC5B4] dark:border-[#2C3C72] p-2.5 text-[12px] leading-relaxed ${YAZI}`;
    return (
      <>
        {o.metin && <p className={`${kutu} whitespace-pre-line max-h-64 overflow-y-auto`}>{o.metin}</p>}
        {o.liste && (
          <div className="space-y-1.5">
            {o.liste.map(l => (
              <button key={l} type="button" disabled={is} onClick={() => ekle(a, o, l)} className={`block w-full text-left ${kutu} hover:border-[#F26B6F] cursor-pointer`}>
                {l} <span className={`text-[10px] ${IKINCIL}`}>· başlık yap</span>
              </button>
            ))}
          </div>
        )}
        {o.arac === 'gece-oneri' && !o.hedefId && ['viki', 'wikipedia', 'depo'].includes(geceTuru(o) || '') && (
          <p className={`text-[11px] ${IKINCIL}`}>Bu öneri hiçbir maddeye bağlanmamış (eski gece önerisi). Okuyup silebilirsin; yeni gece önerileri maddesine bağlı gelir.</p>
        )}
        {o.kaynak && (
          <p className={`text-[11px] ${IKINCIL}`}>Kaynak: <a href={o.kaynak.adres} target="_blank" rel="noreferrer" className="underline">{o.kaynak.ad}</a> · yalnız örnek, kopyalanmadı</p>
        )}
        {o.gorseller && o.gorseller.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {o.gorseller.map(g => <img key={g} src={g} alt="Oyun deposundan taslak görsel" loading="lazy" className="h-20 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] object-cover" />)}
            <span className={`basis-full text-[10px] ${IKINCIL}`}>Oyunun deposundan taslak görsel; kanon değil, kayda eklenmez.</span>
          </div>
        )}
        {o.bolumler && (
          <div className={`${kutu} space-y-2 max-h-64 overflow-y-auto`}>
            {o.bolumler.map(b => <div key={b.title}><b>{b.title}</b><p className="whitespace-pre-line">{b.content}</p></div>)}
          </div>
        )}
        {o.derle && (() => {
          // Derlemede eski hâl: "Ekle" deyince giden öneri bölümleri (8 Ekim)
          const giden = ((items.find(i => i.id === o.hedefId)?.metadata?.wikiSections as Array<{ title: string; status: string; content: string }> | undefined) || [])
            .filter(b => b.status === 'öneri' && String(b.content || '').trim());
          return (
            <div className={`${kutu} space-y-1`}>
              <b className="text-[11px]">Ekle deyince yerine geçtiği {giden.length} öneri bölümü</b>
              {giden.length ? giden.map((b, n) => <p key={n} className={`text-[11px] ${IKINCIL} line-clamp-2`}><b>{b.title}</b> · {b.content}</p>)
                : <p className={`text-[11px] ${IKINCIL}`}>Maddede öneri bölümü kalmamış.</p>}
              <p className={`text-[10px] ${IKINCIL}`}>Resmî bölümler olduğu gibi kalır.</p>
            </div>
          );
        })()}
        {o.kunye && (
          <dl className={`${kutu} grid grid-cols-[auto_1fr] gap-x-3 gap-y-1`}>
            {Object.entries(o.kunye).map(([k, v]) => <React.Fragment key={k}><dt className={IKINCIL}>{k}</dt><dd>{v}</dd></React.Fragment>)}
          </dl>
        )}
        {o.renkler && (
          <div className="flex flex-wrap gap-2">
            {o.renkler.map(r => (
              <span key={r.hex} className={`inline-flex items-center gap-1.5 text-[11px] ${YAZI}`}>
                <i className="w-5 h-5 rounded border border-[#CFC5B4]" style={{ background: r.hex }} />{r.hex}{r.name ? ` · ${r.name}` : ''}
              </span>
            ))}
          </div>
        )}
        {o.urunler && (
          <div className="grid gap-2 sm:grid-cols-2">
            {o.urunler.map((u, n) => (
              <div key={u.title} className={kutu}>
                <b>{u.title}</b>
                <p className="mt-1 line-clamp-5">{u.description}</p>
                {u.slogan && <p className={`mt-1 text-[11px] ${IKINCIL}`}>“{u.slogan}”</p>}
                <button type="button" disabled={is} onClick={() => ekle(a, o, n)} className={`mt-2 ${DUGME_LAC}`}>Drop'a ekle</button>
              </div>
            ))}
          </div>
        )}
        {arac?.kurgu && <p className={`text-[10px] ${IKINCIL}`}>Bu metni yapay zekâ yazdı; eklersen senin metnin olur, istediğin gibi düzeltirsin.</p>}
        <div className="flex flex-wrap gap-2">
          {arac?.uygulama && !['baslik-yap', 'urun-ekle'].includes(arac.uygulama) && eklenebilir(o) && (
            <button type="button" disabled={is} onClick={() => ekle(a, o)} className={DUGME_LAC}>
              {arac.uygulama === 'gece-oneri-ekle' ? geceDugmesi(o)
                : arac.uygulama === 'fanzin-olustur' ? 'Fanzin olarak aç (Yazı)'
                : arac.uygulama === 'fanzin-bolum' ? 'Bölümün yerine koy'
                : arac.uygulama === 'site-hakkinda' ? "Site taslağına koy (Hakkında)"
                : arac.uygulama === 'metnin-yerine' ? 'Metnin yerine koy' : arac.uygulama === 'bolum-ekle' ? 'Maddeye ekle (öneri olarak)'
                : arac.uygulama === 'bolum-derle' ? (o.derle ? 'Derlenmiş hâli koy' : 'Maddeye ekle (öneri olarak)') : arac.uygulama === 'kunye-ekle' ? 'Boş künye alanlarına yaz' : arac.uygulama === 'renk-ekle' ? 'Paletine ekle' : 'Metne ekle'}
            </button>
          )}
          {o.metin && <button type="button" onClick={() => kopyala(o.metin!)} className={`${DUGME_BOS} inline-flex items-center gap-1`}><Copy className="w-3 h-3" /> Kopyala</button>}
          {o.hedefId && <button type="button" onClick={() => hedefiAc(o.hedefId)} className={DUGME_BOS}>{o.hedefAdi || 'Kaydı'} aç</button>}
          <button type="button" disabled={is} onClick={() => sil(a)} className={DUGME_BOS}>Sil</button>
        </div>
      </>
    );
  };

  return (
    <section className={`${KART} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className={ETIKET}>{baslik} · bekleyen {hepsi.length}</div>
        {sinir && hepsi.length > 0 && (
          <button type="button" onClick={onStudyoSayfasi} className="text-[11px] font-mono text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">tümü · stüdyo</button>
        )}
      </div>
      {rapor && (
        <p className={`mt-2 px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[11px] ${IKINCIL}`}>
          {rapor} <button type="button" onClick={() => setRapor(null)} className="underline cursor-pointer">tamam</button>
        </p>
      )}

      {hepsi.length === 0 ? (
        <p className={`mt-2 text-[12px] ${IKINCIL}`}>
          {hedefId ? 'Bu kayıt için bekleyen öneri yok.' : 'Bekleyen öneri yok. Atölyede verdiğin cevaplar ve stüdyonun ürettikleri burada onayını bekler.'}
        </p>
      ) : (
        <ul className="mt-1">
          {gorunen.map(a => {
            const o = yapayZekaOnerisi(a);
            if (o) return satir(a, 'YAPAY ZEKÂ', yapayZekaGovdesi(a, o));
            const b = adayBilgisi(a);
            if (!b) return null;
            return satir(a, 'CEVAP', (
              <>
                <p className={`text-[11px] ${IKINCIL}`}>{b.soru}</p>
                <textarea
                  rows={2}
                  value={duzenleme[a.id] ?? b.cevap}
                  onChange={e => setDuzenleme(d => ({ ...d, [a.id]: e.target.value }))}
                  className={`w-full text-[13px] bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg p-2 focus:outline-hidden focus:border-[#F26B6F]`}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={calisan === a.id} onClick={() => isle(a)} className={DUGME_LAC}>İşle · vikiye yaz</button>
                  <button type="button" onClick={() => hedefiAc(b.hedefId)} className={DUGME_BOS}>Maddeyi aç</button>
                  <button type="button" disabled={calisan === a.id} onClick={() => sil(a)} className={DUGME_BOS}>Vazgeç</button>
                </div>
              </>
            ));
          })}
          {sinir && hepsi.length > sinir && (
            <li className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] pt-2">
              <button type="button" onClick={onStudyoSayfasi} className="text-[11px] font-mono text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">
                +{hepsi.length - sinir} öneri daha · stüdyoda
              </button>
            </li>
          )}
        </ul>
      )}

      {/* Eski öneriler (onaylanmamış, eski yapay zekâdan): tek satır özet */}
      {eskiler.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] p-3">
          <div className="flex items-start gap-3">
            <b className="font-mono text-[16px] text-[#6A5E4C] dark:text-[#A6B0C9] tabular-nums shrink-0">{eskiler.length}</b>
            <span className={`flex-1 min-w-0 text-[12px] font-semibold ${YAZI}`}>eski öneri (onaylanmamış) · Temizlik kartıyla silinir</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEskiAcik(x => !x)} className={DUGME_BOS}>{eskiAcik ? 'Listeyi kapat' : 'Listeyi aç'}</button>
            {onTemizlik && <button type="button" onClick={onTemizlik} className={DUGME_BOS}>Hepsini sil · Temizlik kartı</button>}
          </div>
          {eskiAcik && (
            <ul className="mt-2 max-h-72 overflow-y-auto pr-1">
              {eskiler.map(e => satir(e, (TYPE_LABELS[e.type] || e.type).toLocaleUpperCase('tr'), (
                <>
                  <p className={`text-[12px] leading-snug whitespace-pre-line line-clamp-4 ${IKINCIL}`}>{e.notes || 'Açıklama yok.'}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={calisan === e.id} onClick={() => onAcceptProposal(e.id)} className={DUGME_LAC}>Kabul et</button>
                    <button type="button" onClick={() => onMaddeyiAc(e)} className={DUGME_BOS}>Aç</button>
                  </div>
                </>
              )))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default OneriTepsisi;
