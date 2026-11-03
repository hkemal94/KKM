import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { DURUM_ADI, isleriOku, kimdeAdi, oebekle, prAdresi, prBirlestiMi, type AjansIsi, type IsDosyasi } from '../../lib/isler';
import { DUGME_BOS, ETIKET, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';
import type { Item } from '../../types';
import { ASAMALAR, takipListesi, takiptekiIsler, useAjansta, type TakipSatiri } from '../../lib/ajansta';
import { TakipGovdesi } from './AsamaSeridi';

/**
 * Ajans → İşler ve takvim → Kimde ne var (2 Kasım, yol haritası 3. adım).
 * Ajansın iş dosyasından (`lib/isler.ts`) okunur; KKM kayda yazmaz. Kanıtı
 * birleşmiş PR olan iş kendiliğinden "Bitti" görünür.
 *
 * Ajansta (3 Kasım): Kemal'in istekleri ve Düzenle notları aşamasıyla en üstte
 * (`lib/ajansta.ts`); bağlı işleri "Kems ve ajanlarda"da ikinci kez görünmez.
 */
interface Props {
  /** Düzenle notları ve öneri başlıkları için */
  items: Item[];
  /** Durum → Ajans (GitHub anahtarı orada girilir) */
  onAjans: () => void;
}

/** Bir çalışmada en fazla bu kadar PR'a bakılır (GitHub sınırı) */
const PR_SINIRI = 12;

export const KimdeNeVar: React.FC<Props> = ({ items, onAjans }) => {
  const anahtar = anahtariOku();
  const [tur, setTur] = useState(0);
  const [dosya, setDosya] = useState<IsDosyasi | null | 'yukleniyor' | { hata: string }>('yukleniyor');
  const [birlesen, setBirlesen] = useState<Set<string>>(new Set());
  const [acik, setAcik] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    setDosya('yukleniyor');
    isleriOku(anahtar)
      .then(async d => {
        if (iptal) return;
        setDosya(d);
        if (!d) return;
        const bakilacak = d.isler.filter(i => i.durum !== 'bitti' && prAdresi(i.kanit)).slice(0, PR_SINIRI);
        const sonuc = await Promise.all(bakilacak.map(async i => [i.id, await prBirlestiMi(anahtar, i.kanit!)] as const));
        if (!iptal) setBirlesen(new Set(sonuc.filter(([, b]) => b === true).map(([id]) => id)));
      })
      .catch(e => { if (!iptal) setDosya({ hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);

  const ajansta = useAjansta(anahtar, tur);
  const takip = useMemo(() => (ajansta.veri ? takipListesi(items, ajansta.veri) : []), [items, ajansta.veri]);
  const obek = useMemo(() => {
    if (!(dosya && typeof dosya === 'object' && 'isler' in dosya)) return null;
    const o = oebekle(dosya.isler, birlesen);
    const takipte = takiptekiIsler(takip);
    return { ...o, ajansta: o.ajansta.filter(i => !takipte.has(i.id)) };
  }, [dosya, birlesen, takip]);

  if (!anahtar) {
    return (
      <section className={`${KART} p-4 space-y-2`}>
        <p className={`text-[13px] font-semibold ${YAZI}`}>Kimde ne var</p>
        <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; ajansın iş listesi okunamıyor. Anahtar Ajanlar ve otomasyonlar → Ajans bağlantısı'nda bir kez girilir.</p>
        <button type="button" onClick={onAjans} className={DUGME_BOS}>Ajans bağlantısı</button>
      </section>
    );
  }

  const satir = (i: AjansIsi) => {
    const buAcik = acik === i.id;
    const birlesti = birlesen.has(i.id);
    const durum = birlesti ? 'Bitti' : DURUM_ADI[i.durum];
    return (
      <li key={i.id} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72]">
        <button type="button" onClick={() => setAcik(buAcik ? null : i.id)} className="w-full min-h-11 flex items-center gap-2.5 py-2 text-left cursor-pointer">
          <i className={`not-italic shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${i.durum === 'calisiyor' ? 'bg-[#F26B6F] text-white' : 'bg-[#F3EFE8] dark:bg-[#17345A] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>{durum.toLocaleUpperCase('tr')}</i>
          <span className={`flex-1 min-w-0 text-[13px] leading-snug line-clamp-2 ${YAZI}`}>{i.metin}</span>
          <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{kimdeAdi(i.kimde)}</span>
          {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
        </button>
        {buAcik && (
          <div className="pb-3 space-y-2">
            {i.not && <p className={`text-[12px] leading-relaxed whitespace-pre-line ${IKINCIL}`}>{i.not}</p>}
            <p className={`text-[11px] ${IKINCIL}`}>
              {i.konu ? `${i.konu} · ` : ''}{i.guncellendi ? `güncellendi ${neZaman(Date.parse(i.guncellendi))}` : ''}
              {birlesti ? ' · kanıt PR birleşti' : ''}
            </p>
            {i.kanit && /^https?:\/\//.test(i.kanit) && (
              <a href={i.kanit} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Kanıt</a>
            )}
          </div>
        )}
      </li>
    );
  };

  const takipSatiri = (t: TakipSatiri) => {
    const k = `takip:${t.kaynak}`;
    const buAcik = acik === k;
    const asama = t.durum.asama === 'ajanda' && t.durum.kimde ? kimdeAdi(t.durum.kimde) : ASAMALAR.find(a => a.id === t.durum.asama)?.ad;
    return (
      <li key={k} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72]">
        <button type="button" onClick={() => setAcik(buAcik ? null : k)} className="w-full min-h-11 flex items-center gap-2.5 py-2 text-left cursor-pointer">
          <i className="not-italic shrink-0 px-1.5 py-0.5 rounded bg-[#F3EFE8] dark:bg-[#17345A] text-[9px] font-mono font-bold tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">{t.tur === 'istek' ? 'İSTEK' : 'DÜZENLE'}</i>
          <span className={`flex-1 min-w-0 text-[13px] leading-snug line-clamp-2 ${YAZI}`}>{t.baslik}</span>
          <span className="shrink-0 text-[10px] font-semibold text-[#F26B6F]">{asama}</span>
          {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
        </button>
        {buAcik && <div className="pb-3"><TakipGovdesi s={t} /></div>}
      </li>
    );
  };

  const obekGoster = (baslik: string, liste: AjansIsi[], bos: string) => (
    <section className={`${KART} p-4`}>
      <div className={ETIKET}>{baslik} · {liste.length}</div>
      {liste.length ? <ul className="mt-1">{liste.map(satir)}</ul> : <p className={`mt-2 text-[12px] ${IKINCIL}`}>{bos}</p>}
    </section>
  );

  return (
    <div className="space-y-3 lg:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[12px] ${IKINCIL}`}>
          Ajansın iş listesi{dosya && typeof dosya === 'object' && 'guncellendi' in dosya && dosya.guncellendi ? ` · güncellendi ${neZaman(Date.parse(dosya.guncellendi))}` : ''}
        </p>
        <button type="button" onClick={() => setTur(t => t + 1)} className={`${DUGME_BOS} shrink-0`}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      </div>
      {dosya === 'yukleniyor' && <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Okunuyor…</p>}
      {dosya === null && <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Ajans henüz iş listesi yazmadı.</p>}
      {dosya && typeof dosya === 'object' && 'hata' in dosya && (
        <p className={`${KART} p-4 text-[12px] ${YAZI}`}>Okunamadı ({dosya.hata}). <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button></p>
      )}
      {ajansta.veri && (
        <section className={`${KART} p-4`}>
          <div className={ETIKET}>Ajansta · {takip.length}</div>
          <p className={`mt-1 text-[11px] ${IKINCIL}`}>Ajana verdiğin istekler ve Düzenle notların: Sırada → Kems aldı → Ajanda → Onayına düştü. Yeni hâli onayına düşünce buradan kalkar.</p>
          {takip.length ? <ul className="mt-1">{takip.map(takipSatiri)}</ul> : <p className={`mt-2 text-[12px] ${IKINCIL}`}>Ajansta bekleyen isteğin ya da notun yok.</p>}
        </section>
      )}
      {obek && (<>
        {obekGoster('Senden beklenenler', obek.sende, 'Senden beklenen iş yok.')}
        {obekGoster('Kems ve ajanlarda', obek.ajansta, 'Ajansta açık iş yok.')}
        {obekGoster('Son bitenler', obek.biten, 'Son 7 günde biten iş yok.')}
      </>)}
    </div>
  );
};

export default KimdeNeVar;
