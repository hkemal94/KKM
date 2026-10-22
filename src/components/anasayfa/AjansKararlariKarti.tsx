import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import type { Item } from '../../types';
import { gecerliIslemler, kararlariOku, kararlariUygula, makbuzYaz, type KararDosyasi, type Uygulama } from '../../lib/ajansKararlari';
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
}

/** Listede her işin başındaki kısa ad */
const ISLEM_ADI: Record<string, string> = { sil: 'Sil', alanaYaz: 'Yaz', bagKur: 'Bağ', takmaAdEkle: 'Takma ad', metneEkle: 'Ekle', metniDegistir: 'Düzelt' };

export const AjansKararlariKarti: React.FC<Props> = ({ items, anahtar, tur, onUpdateItem, onDeleteItem }) => {
  const [dosya, setDosya] = useState<KararDosyasi | null | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [acik, setAcik] = useState(false);
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
  const yazSayisi = islemler.length - silSayisi;

  const uygula = async () => {
    setCalisiyor(0);
    try {
      const u = await kararlariUygula(items, islemler, { guncelle: onUpdateItem, sil: onDeleteItem }, setCalisiyor);
      try { setSonuc({ u, makbuz: await makbuzYaz(anahtar, u) }); }
      catch (e) { setSonuc({ u, makbuzHata: e instanceof Error ? e.message : String(e) }); }
    } finally { setCalisiyor(null); }
  };

  if (!anahtar) return null;

  return (
    <section className={`${KART} px-4 py-4 space-y-3`}>
      <div>
        <div className={ETIKET}>Ajansın kararları</div>
        <p className={`text-[13px] ${IKINCIL}`}>
          Ajans tepsiyi ayıkladı: elediği, departmanına taşıdığı ve soru kutusuna aldığı öneriler tepsiden silinir;
          panoda cevapladığın sorular vikideki boş alana yazılır. Sen basmadan hiçbir kayıt değişmez.
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
          {sonuc.makbuzHata && <p className={`text-[13px] ${YAZI}`}>Makbuz yazılamadı ({sonuc.makbuzHata}); ajansa "uyguladım" diye haber ver.</p>}
        </div>
      ) : dosya && typeof dosya === 'object' && 'islemler' in dosya && (
        islemler.length ? (
          <>
            <p className={`text-[14px] ${YAZI}`}>
              {silSayisi ? `${silSayisi} öneri tepsiden silinecek` : ''}{silSayisi && yazSayisi ? ', ' : ''}{yazSayisi ? `${yazSayisi} cevap vikiye işlenecek` : ''}.
            </p>
            <button type="button" className={DUGME_BOS} onClick={() => setAcik(a => !a)}>{acik ? 'Listeyi gizle' : 'Listeyi göster'}</button>
            {acik && (
              <ul className={`text-[13px] ${YAZI} space-y-1.5 max-h-80 overflow-y-auto`}>
                {islemler.map(i => (
                  <li key={i.kimlik} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72] pt-1.5">
                    <span className="font-semibold">{ISLEM_ADI[i.tur]}:</span> {i.baslik}
                    {(i.tur === 'alanaYaz' || i.tur === 'takmaAdEkle' || i.tur === 'metneEkle' || i.tur === 'metniDegistir') && <> → <span className="font-semibold">{i.deger}</span></>}
                    {i.tur === 'bagKur' && <> → <span className="font-semibold">{i.kaynak} · {i.bag} · {i.hedef}{i.ikiYonlu ? ' (iki tarafta)' : ''}</span></>}
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
