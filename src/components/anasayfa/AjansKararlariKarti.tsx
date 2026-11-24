import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import type { Item } from '../../types';
import { gecerliIslemler, kararlariOku, kararlariUygula, kitapBolumuOnizleme, maddeTuru, oyunKarariOnizleme, vikiKarariOnizleme, baslikKarariOnizleme, makbuzYaz, MARKA_KARTI_ALANLARI, type KararDosyasi, type Uygulama } from '../../lib/ajansKararlari';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { donemleriOku } from '../../lib/zamanCizgisi';
import { donemOnizleme } from '../../lib/donemKarari';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Durum → Ajans → "Ajansın kararları" (22 Ekim, `lib/ajansKararlari.ts`).
 * Ajansın tepsi için verdiği kararlar listelenir; Kemal "Uygula"ya basınca
 * işlenir. Basılmadan hiçbir kayıt değişmez.
 */

interface Props {
  items: Item[];
  anahtar: string;
  /** Sayfanın "Yenile"si */
  tur: number;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  /** Yeni madde kararı için (4 Kasım); yoksa o karar atlanır */
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
}

/** Listede her işin başındaki kısa ad */
export const ISLEM_ADI: Record<string, string> = { sil: 'Sil', alanaYaz: 'Yaz', bagKur: 'Bağ', bagSil: 'Bağ sil', takmaAdEkle: 'Takma ad', metneEkle: 'Ekle', gorselEkle: 'Görsel', metniDegistir: 'Düzelt', takmaAdSil: 'Takma ad sil', alaniDegistir: 'Alanı değiştir', metindenSil: 'Metinden sil', eskiAlan: 'Eski alan', markaKarti: 'Marka kartı', yeniMadde: 'Yeni madde', yeniOyun: 'Yeni oyun', kitapBolumu: 'Kitap bölümü', oyunKarti: 'Oyun kartı', gddBolumu: 'Tasarım belgesi', donem: 'Dönem', bolumYaz: 'Bölüm yaz', bolumSil: 'Bölüm sil', gercekYer: 'Gerçek yer', alaniBosalt: 'Alanı boşalt', baslikDegistir: 'Başlık' };

/**
 * Kararları okur ve uygular (2 Kasım, 3. adım). Kart ve Onay bekleyenler'in
 * ortak listesi aynı işi kullanır.
 */
export function useAjansKararlari({ items, anahtar, tur, onUpdateItem, onDeleteItem, onAddItem }: Props) {
  const [dosya, setDosya] = useState<KararDosyasi | null | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [calisiyor, setCalisiyor] = useState<number | null>(null);
  const [sonuc, setSonuc] = useState<{ u: Uygulama; makbuz?: string; makbuzHata?: string } | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    setDosya('yukleniyor');
    kararlariOku(anahtar)
      .then(d => { if (!iptal) setDosya(d); })
      .catch(e => { if (!iptal) setDosya({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);

  const islemler = useMemo(() => (dosya && typeof dosya === 'object' && 'islemler' in dosya ? gecerliIslemler(items, dosya.islemler) : []), [dosya, items]);
  const silSayisi = islemler.filter(i => i.tur === 'sil').length;
  const kitapSayisi = islemler.filter(i => i.tur === 'kitapBolumu').length;
  const oyunSayisi = islemler.filter(i => i.tur === 'oyunKarti' || i.tur === 'gddBolumu').length;
  const donemSayisi = islemler.filter(i => i.tur === 'donem').length;
  const yazSayisi = islemler.length - silSayisi - kitapSayisi - oyunSayisi - donemSayisi;

  const uygula = async () => {
    setCalisiyor(0);
    try {
      const u = await kararlariUygula(items, islemler, { guncelle: onUpdateItem, sil: onDeleteItem, ...(onAddItem ? { ekle: onAddItem } : {}) }, setCalisiyor);
      try { setSonuc({ u, makbuz: await makbuzYaz(anahtar, u) }); }
      catch (e) { setSonuc({ u, makbuzHata: e instanceof Error ? e.message : String(e) }); }
    } finally { setCalisiyor(null); }
  };

  // 21 Kasım: makbuz yazılamadıysa (ajansın deposu tam o sırada değişti) Kemal tek düğmeyle yeniden dener;
  // kararlar yeniden uygulanmaz, yalnız makbuz yazılır
  const [makbuzDeneniyor, setMakbuzDeneniyor] = useState(false);
  const makbuzuYenidenYaz = async () => {
    if (!sonuc) return;
    setMakbuzDeneniyor(true);
    try { setSonuc({ u: sonuc.u, makbuz: await makbuzYaz(anahtar, sonuc.u) }); }
    catch (e) { setSonuc({ u: sonuc.u, makbuzHata: e instanceof Error ? e.message : String(e) }); }
    finally { setMakbuzDeneniyor(false); }
  };

  return { dosya, islemler, silSayisi, yazSayisi, kitapSayisi, oyunSayisi, donemSayisi, calisiyor, sonuc, uygula, makbuzuYenidenYaz, makbuzDeneniyor };
}

export const AjansKararlariKarti: React.FC<Props> = (props) => {
  const { anahtar } = props;
  const [acik, setAcik] = useState(false);
  const { dosya, islemler, silSayisi, yazSayisi, kitapSayisi, oyunSayisi, donemSayisi, calisiyor, sonuc, uygula, makbuzuYenidenYaz, makbuzDeneniyor } = useAjansKararlari(props);

  if (!anahtar) return null;

  return (
    <section className={`${KART} px-4 py-4 space-y-3`}>
      <div>
        <div className={ETIKET}>Ajansın kararları</div>
        <p className={`text-[13px] ${IKINCIL}`}>
          Ajans tepsiyi ayıkladı: elediği, ilgili ajana taşıdığı ve soru kutusuna aldığı öneriler tepsiden silinir;
          cevapladığın sorular vikideki boş alana yazılır; kararı verilmiş düzeltmeler (takma ad, künye alanı, metin) işlenir. Sen basmadan hiçbir kayıt değişmez.
        </p>
      </div>

      {dosya === 'yukleniyor' && <p className={`text-[13px] ${IKINCIL}`}>Okunuyor…</p>}
      {dosya && typeof dosya === 'object' && 'hata' in dosya && <p className={`text-[13px] ${YAZI}`}>Okunamadı ({dosya.hata}).</p>}
      {dosya === null && <p className={`text-[13px] ${IKINCIL}`}>Ajans henüz karar yazmadı.</p>}

      {sonuc ? (
        <div className="space-y-2">
          <p className={`text-[14px] ${YAZI}`}>
            <Check className="inline w-4 h-4 text-[#F26B6F]" /> {sonuc.u.uygulanan.length} karar işlendi
            {sonuc.u.atlanan.length ? `, ${sonuc.u.atlanan.length} atlandı (${[...new Set(sonuc.u.atlanan.map(a => a.neden))].join('; ')})` : ''}.
            Ajans bunu sabah ya da akşam raporunda listeler.
          </p>
          {sonuc.makbuz && <a href={sonuc.makbuz} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Makbuz</a>}
          {sonuc.makbuzHata && (
            <div className="space-y-1.5">
              <p className={`text-[13px] ${YAZI}`}>
                Kararlar işlendi, yalnız makbuz yazılamadı: {/409|422/.test(sonuc.makbuzHata)
                  ? 'ajansın deposu tam bu sırada değişti, birkaç kez denendi.'
                  : `GitHub yazmayı kabul etmedi (${sonuc.makbuzHata}).`} Biraz bekleyip "Makbuzu yeniden yaz"a bas; olmazsa ajansa "uyguladım" diye haber ver.
              </p>
              <button type="button" className={DUGME_BOS} disabled={makbuzDeneniyor} onClick={makbuzuYenidenYaz}>
                {makbuzDeneniyor ? 'Yazılıyor…' : 'Makbuzu yeniden yaz'}
              </button>
            </div>
          )}
        </div>
      ) : dosya && typeof dosya === 'object' && 'islemler' in dosya && (
        islemler.length ? (
          <>
            <p className={`text-[14px] ${YAZI}`}>
              {[silSayisi ? `${silSayisi} öneri tepsiden silinecek` : '', yazSayisi ? `${yazSayisi} cevap vikiye işlenecek` : '', kitapSayisi ? `${kitapSayisi} bölüm Kitap'a yazılacak` : '', oyunSayisi ? `${oyunSayisi} yazı Oyunlar'a işlenecek` : '', donemSayisi ? `${donemSayisi} dönem zaman çizgisine işlenecek` : ''].filter(Boolean).join(', ')}.
            </p>
            <button type="button" className={DUGME_BOS} onClick={() => setAcik(a => !a)}>{acik ? 'Listeyi gizle' : 'Listeyi göster'}</button>
            {acik && (
              <ul className={`text-[13px] ${YAZI} space-y-1.5 max-h-80 overflow-y-auto`}>
                {islemler.map(i => (
                  <li key={i.kimlik} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] pt-1.5">
                    <span className="font-semibold">{ISLEM_ADI[i.tur]}:</span> {i.baslik}
                    {(i.tur === 'alanaYaz' || i.tur === 'takmaAdEkle' || i.tur === 'metneEkle' || i.tur === 'metniDegistir') && <> → <span className="font-semibold">{i.deger}</span></>}
                    {i.tur === 'gorselEkle' && <> → <img src={i.deger} alt="" loading="lazy" className="inline-block h-10 max-w-20 object-cover rounded align-middle" /> <span className="font-semibold">{i.deger}</span></>}
                    {i.tur === 'alaniDegistir' && <> → <span className="font-semibold">{i.alan}: {i.eski ? `${i.eski} → ` : ''}{i.deger}</span></>}
                    {i.tur === 'eskiAlan' && <> → <span className="font-semibold">{i.alan}: {i.eski ? `${i.eski} → ` : ''}{i.deger || 'boşaltılır'}</span></>}
                    {(i.tur === 'takmaAdSil' || i.tur === 'metindenSil') && <> → <span className="font-semibold line-through">{i.tur === 'takmaAdSil' ? i.deger : i.eski}</span></>}
                    {i.tur === 'markaKarti' && <> → <span className="font-semibold">{i.marka} · {MARKA_KARTI_ALANLARI[i.alan] || i.alan}: {Array.isArray(i.deger) ? i.deger.join(' · ') : i.deger}</span></>}
                    {i.tur === 'bagSil' && <> → <span className="font-semibold line-through">{i.kaynak} · {i.bag} · {i.hedef}{i.ikiYonlu ? ' (iki tarafta)' : ''}</span></>}
                    {i.tur === 'bagKur' && <> → <span className="font-semibold">{i.kaynak} · {i.bag} · {i.hedef}{i.ikiYonlu ? ' (iki tarafta)' : ''}</span></>}
                    {i.tur === 'yeniMadde' && <> · <span className="font-semibold">{TYPE_LABELS[maddeTuru(i.maddeTur)!] || i.maddeTur}</span>{i.metin ? <> → {i.metin}</> : null}{i.baglar?.length ? <> · bağlar: {i.baglar.map(b => `${b.bag} ${b.hedef}`).join(', ')}</> : null}</>}
                    {i.tur === 'kitapBolumu' && <> → <span className="font-semibold">{kitapBolumuOnizleme(props.items, i)}</span></>}
                    {(i.tur === 'oyunKarti' || i.tur === 'gddBolumu') && <> → <span className="font-semibold">{oyunKarariOnizleme(props.items, i)}</span></>}
                    {i.tur === 'donem' && <> → <span className="font-semibold">{donemOnizleme(donemleriOku(props.items), i)}</span></>}
                    {(i.tur === 'bolumYaz' || i.tur === 'bolumSil' || i.tur === 'gercekYer' || i.tur === 'alaniBosalt') && <> → <span className="font-semibold">{vikiKarariOnizleme(props.items, i)}</span></>}
                    {i.tur === 'baslikDegistir' && <> → <span className="font-semibold">{baslikKarariOnizleme(props.items, i)}</span></>}
                    <span className={`block text-[12px] ${IKINCIL}`}>{i.neden}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={DUGME_LAC} disabled={calisiyor !== null} onClick={() => void uygula()}>
              <Check className="w-3.5 h-3.5" /> {calisiyor !== null ? `Uygulanıyor… ${calisiyor}/${islemler.length}` : 'Ajansın kararlarını uygula'}
            </button>
          </>
        ) : <p className={`text-[13px] ${IKINCIL}`}>Uygulanacak karar kalmadı.</p>
      )}
    </section>
  );
};

export default AjansKararlariKarti;
