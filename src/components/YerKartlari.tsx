import React, { useMemo, useState } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
import type { Item, ItemType } from '../types';
import {
  TASINABILEN_TURLER, adaMaddesiEksik, adaMaddesiKaydi, cevreYoluKaydi, cevreYoluVar,
  mahalleKalsin, mahalleTekrarlari, tasinacaklar, turAdi, turuDegistir
} from '../lib/yerTurleri';
import { useStudyo } from './studyo/StudyoBaglami';
import { acilacaklar, duzeltmeler } from '../lib/maddeSoruTuru';
import { derlemeyiUygula, derlenecekler, ekDuzeltmeler } from '../lib/mahalleDerlemesi';

/**
 * Yer kartları (8 Ekim). İki kart, ikisi de yalnız iş varken görünür:
 *   1. Mahalle kartında duran cadde, meydan, tepe ve adanın kaydı: Kemal her
 *      birinin türünü seçip "Taşı" der. Boş Düzada ve çevre yolu maddeleri.
 *   2. Tekrar eden mahalle bilgileri: "✨ Stüdyoda derle" stüdyoyu açar;
 *      sonuç öneri tepsisine düşer, Kemal "Ekle" demeden bir şey değişmez.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

const KUTU = 'mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]';
const BASLIK = 'text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]';
const ACIKLAMA = 'mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]';
const DUGME = 'shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer';
const BOS_DUGME = 'shrink-0 min-h-9 px-3 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] disabled:opacity-40 cursor-pointer';
const SECIM = 'min-h-9 text-[12px] bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2';

export const YerKartlariKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem?: (item: YeniKayit) => Promise<void>;
  onAc: (id: string) => void;
}> = ({ items, onUpdateItem, onAddItem, onAc }) => {
  const liste = useMemo(() => tasinacaklar(items), [items]);
  const adaYok = useMemo(() => adaMaddesiEksik(items), [items]);
  const yolYok = useMemo(() => !cevreYoluVar(items), [items]);
  /** Satırdaki seçim: '' = henüz seçilmedi */
  const [secim, setSecim] = useState<Record<string, ItemType | ''>>({});
  const [calisan, setCalisan] = useState<string | null>(null);

  if (!liste.length && !(onAddItem && (adaYok || yolYok))) return null;

  const isle = async (anahtar: string, is: () => Promise<void>) => {
    if (calisan) return;
    setCalisan(anahtar);
    try { await is(); } finally { setCalisan(null); }
  };

  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>Yer kartları: cadde, meydan, yer adı ve ada ayrıldı</p>
          <p className={ACIKLAMA}>
            Mahalle kartı artık yalnız mahalleler için. Aşağıdakiler bugün mahalle kartında duruyor; her birinin türünü seç, "Taşı"ya bas.
            Metni, künyesi ve bağları olduğu gibi kalır.
          </p>
        </div>
      </div>
      {liste.length > 0 && (
        <ul className="mt-2.5 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
          {liste.map(({ item, tahmin }) => {
            const s = secim[item.id] ?? tahmin ?? '';
            return (
              <li key={item.id} className="py-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onAc(item.id)} className="flex-1 min-w-[140px] text-left text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:underline cursor-pointer truncate">
                  {item.title}
                </button>
                <select aria-label={`${item.title} türü`} value={s} onChange={e => setSecim(m => ({ ...m, [item.id]: e.target.value as ItemType | '' }))} className={SECIM}>
                  <option value="">Tür seç…</option>
                  {TASINABILEN_TURLER.map(t => <option key={t} value={t}>{turAdi(t)}</option>)}
                </select>
                <button type="button" disabled={!s || !!calisan} onClick={() => s && void isle(item.id, () => onUpdateItem(turuDegistir(item, s)))} className={DUGME}>
                  {calisan === item.id ? '…' : 'Taşı'}
                </button>
                <button type="button" disabled={!!calisan} onClick={() => void isle(`${item.id}:m`, () => onUpdateItem(mahalleKalsin(item)))} className={BOS_DUGME}>
                  Mahalle kalsın
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onAddItem && (adaYok || yolYok) && (
        <div className="mt-2.5 pt-2.5 border-t border-[#CFC5B4]/50 dark:border-[#2C3C72]/60 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[180px] text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">Boş açılır; metnini ve adını sen yazarsın.</span>
          {adaYok && (
            <button type="button" disabled={!!calisan} onClick={() => void isle('ada', () => onAddItem(adaMaddesiKaydi()))} className={DUGME}>
              {calisan === 'ada' ? '…' : 'Düzada maddesini aç'}
            </button>
          )}
          {yolYok && (
            <button type="button" disabled={!!calisan} onClick={() => void isle('yol', () => onAddItem(cevreYoluKaydi()))} className={DUGME}>
              {calisan === 'yol' ? '…' : 'Sahil Yolu maddesini aç'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const MahalleDerlemeKarti: React.FC<{ items: Item[]; onAc: (id: string) => void }> = ({ items, onAc }) => {
  const liste = useMemo(() => mahalleTekrarlari(items), [items]);
  const studyo = useStudyo();
  if (!liste.length) return null;
  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>{liste.length} mahallede tekrar eden bilgi var</p>
          <p className={ACIKLAMA}>
            "Stüdyoda derle" öneri bölümlerini tek düzenli hâle getirir: her bilgi bir kez, aynı başlık iki kez yok, bölümler sabit sırada.
            Resmî bölümlere dokunmaz. Sonuç öneri tepsisine düşer; "Ekle" demeden hiçbir şey değişmez.
          </p>
        </div>
      </div>
      <ul className="mt-2.5 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
        {liste.map(t => (
          <li key={t.item.id} className="py-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onAc(t.item.id)} className="flex-1 min-w-[160px] text-left cursor-pointer">
              <span className="block text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] hover:underline">{t.item.title}</span>
              <span className="block text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                {[
                  ...t.ayniBasliklar.map(b => `${b.baslik} ×${b.sayi}`),
                  t.benzerCumle ? `${t.benzerCumle} tekrar eden cümle${t.ornek ? ` (${t.ornek.a} ↔ ${t.ornek.b})` : ''}` : ''
                ].filter(Boolean).join(' · ')}
              </span>
            </button>
            <button type="button" onClick={() => studyo.ac({ arac: 'viki-derle', hedefId: t.item.id })} className={`${DUGME} inline-flex items-center gap-1.5`}>
              <Sparkles className="w-3.5 h-3.5" /> Stüdyoda derle
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Madde soru turu kartı (8 Ekim). Kanonda olup maddesi olmayan yerleri boş
 * metinle açar, eski yanlış alanları düzeltir. İş bitince kendini gizler.
 */
export const MaddeSoruTuruKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: YeniKayit) => Promise<void>;
}> = ({ items, onUpdateItem, onAddItem }) => {
  const yeniler = useMemo(() => acilacaklar(items), [items]);
  const duzelt = useMemo(() => duzeltmeler(items), [items]);
  const [acik, setAcik] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!yeniler.length && !duzelt.length) return null;

  const isle = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    let a = 0, d = 0;
    // Biri yazılamazsa (ör. kayıt 1 MB sınırını aşıyor) öbürleri yine yazılır;
    // yazılamayanlar söylenir (8 Ekim: kart her basışta yeniden çıkıyordu)
    const olmayan: string[] = [];
    try {
      for (const y of yeniler) { try { await onAddItem(y); a++; } catch { olmayan.push(y.title); } }
      for (const x of duzelt) { try { await onUpdateItem(x.item); d++; } catch { olmayan.push(x.item.title); } }
      setRapor(`${a} madde açıldı, ${d} madde düzeltildi. Metinleri boş; sen yazarsın.`
        + (olmayan.length ? ` Yazılamayan: ${olmayan.join(', ')}.` : ''));
    } finally { setCalisiyor(false); }
  };

  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>Soru turu: {yeniler.length} madde açılacak, {duzelt.length} madde düzeltilecek</p>
          <p className={ACIKLAMA}>
            Kanonda yazılı olup maddesi olmayan yerler açılır; künyelerine yalnız kanondaki ve bu turdaki cevapların yazılır, metinleri boş kalır.
            Ayrıntı: docs/soru-cevap/madde-1.md
          </p>
          <button type="button" onClick={() => setAcik(a => !a)} className="mt-1 text-[11px] text-[#D6484C] dark:text-[#F26B6F] hover:underline cursor-pointer">
            {acik ? 'listeyi gizle' : 'neler olacak?'}
          </button>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()} className={DUGME}>
          {calisiyor ? 'İşleniyor…' : 'Aç ve düzelt'}
        </button>
      </div>
      {acik && (
        <ul className="mt-2.5 space-y-1 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          {yeniler.map((y, idx) => <li key={`yeni-${y.title}-${idx}`}>＋ {y.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">· {turAdi(y.type)}</span></li>)}
          {duzelt.map((x, idx) => <li key={`duzelt-${x.item.id}-${idx}`}>✎ {x.item.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">· {x.neler.join(' · ')}</span></li>)}
        </ul>
      )}
    </div>
  );
};

/**
 * Claude'un mahalle derlemesi (8 Ekim; `lib/mahalleDerlemesi.ts`). Stüdyo
 * çalışmadığı için derleme elle yapıldı; kart eski ve yeni hâli gösterir,
 * Kemal basınca yazılır. İş bitince kendini gizler.
 */
export const ClaudeDerlemeKarti: React.FC<{ items: Item[]; onUpdateItem: (item: Item) => Promise<void> }> = ({ items, onUpdateItem }) => {
  const liste = useMemo(() => derlenecekler(items), [items]);
  const ekler = useMemo(() => ekDuzeltmeler(items), [items]);
  const [acik, setAcik] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!liste.length && !ekler.length) return null;

  const isle = async () => {
    if (calisiyor) return;
    setCalisiyor(true);
    let n = 0;
    try {
      for (const x of liste) {
        const g = derlemeyiUygula(items, x.item, x.bolumler);
        if (g) { await onUpdateItem(g); n++; }
      }
      for (const e of ekler) { await onUpdateItem(e.item); n++; }
      setRapor(`${n} madde güncellendi. Derlenen metinler "öneri" olarak duruyor; okuyup düzeltebilirsin.`);
    } catch (e) {
      setRapor(`${n} madde güncellendi, sonra hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
    } finally { setCalisiyor(false); }
  };

  const kutu = 'rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A] p-2.5 text-[12px] leading-relaxed text-[#0E1C4F] dark:text-[#F3EFE8] max-h-72 overflow-y-auto';
  return (
    <div className={KUTU}>
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>Mahalle derlemesi hazır: {liste.length} mahalle{ekler.length ? ` + ${ekler.length} küçük düzeltme` : ''}</p>
          <p className={ACIKLAMA}>
            Stüdyo çalışmadığı için derlemeyi Claude yaptı (8 Ekim yedeğinden). Tekrar eden öneri bölümleri tek düzenli hâle geldi; yeni bilgi yok,
            kanonla çelişen cümleler düzeltildi, resmî bölümlere dokunulmadı. Eski ve yeni hâline bak; "Derlenmiş hâli koy" deyince yazılır.
          </p>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()} className={DUGME}>
          {calisiyor ? 'Yazılıyor…' : 'Derlenmiş hâli koy'}
        </button>
      </div>
      <ul className="mt-2.5 divide-y divide-[#CFC5B4]/50 dark:divide-[#2C3C72]/60">
        {liste.map(x => {
          const eski = ((x.item.metadata?.wikiSections as Array<{ title: string; status: string; content: string }> | undefined) || [])
            .filter(b => b.status === 'öneri' && String(b.content || '').trim());
          const buAcik = acik === x.item.id;
          return (
            <li key={`liste-${x.item.id}`} className="py-2">
              <button type="button" onClick={() => setAcik(buAcik ? null : x.item.id)} className="w-full flex items-center gap-2 text-left cursor-pointer">
                <span className="flex-1 text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{x.item.title}</span>
                <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{eski.length} öneri bölümü → {x.bolumler.length}</span>
                <span className="text-[11px] text-[#D6484C] dark:text-[#F26B6F]">{buAcik ? 'gizle' : 'eski / yeni'}</span>
              </button>
              {buAcik && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className={kutu}>
                    <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">Eski (gidecek)</div>
                    {eski.map((b, n) => <p key={n} className="mb-2 whitespace-pre-line"><b>{b.title}</b>{'\n'}{b.content}</p>)}
                  </div>
                  <div className={kutu}>
                    <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-[#D6484C] dark:text-[#F26B6F]">Yeni (derlenmiş)</div>
                    {x.bolumler.map((b, n) => <p key={n} className="mb-2 whitespace-pre-line"><b>{b.title}</b>{'\n'}{b.content}</p>)}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {ekler.map((e, idx) => (
          <li key={`ek-${e.item.id}-${idx}`} className="py-2 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">✎ {e.item.title} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">· {e.ne}</span></li>
        ))}
      </ul>
    </div>
  );
};
