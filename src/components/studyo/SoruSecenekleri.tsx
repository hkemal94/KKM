import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Bosluk } from '../Bosluklar';
import { adayKaydi, seceneksizMi, sorulacaklar } from '../../lib/adaylar';
import { secenekGetir, secenekleriOku } from '../../lib/soruSecenekleri';
import { hatayiNotEt, kotaNotunuSil } from '../../lib/studyo';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, YAZI } from '../anasayfa/stil';
import type { StudyoIslemleri } from './StudyoBaglami';

/**
 * Kanon sorusu seçenekleri (stüdyo). Atölyedeki bir
 * soru için yapay zekâ en fazla üç kısa seçenek getirir; ad ya da sayı
 * soran sorularda getirmez. Seçilen cevap önce tepsiye (aday) düşer.
 */

interface Props extends StudyoIslemleri {
  bosluk?: Bosluk;
  kapali?: string | null;
  onDurum?: () => void;
}

export const SoruSecenekleri: React.FC<Props> = ({ bosluk: ilk, kapali, onDurum, ...islemler }) => {
  const { items, onAddItem } = islemler;
  const sorular = useMemo(() => {
    const l = sorulacaklar(items, 8).filter(b => !seceneksizMi(b));
    return ilk && !l.some(b => b.anahtar === ilk.anahtar) ? [ilk, ...l] : l;
  }, [items, ilk]);
  const [anahtar, setAnahtar] = useState(ilk?.anahtar || sorular[0]?.anahtar || '');
  const b = sorular.find(x => x.anahtar === anahtar);
  const [secenekler, setSecenekler] = useState<Record<string, string[]>>({});
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [alinan, setAlinan] = useState<string | null>(null);
  const liste = b ? (secenekler[b.anahtar] ?? secenekleriOku(b.anahtar)) : null;

  const getir = async () => {
    if (!b || calisiyor) return;
    setCalisiyor(true); setHata(null);
    try {
      const s = await secenekGetir(b, items);
      kotaNotunuSil();
      setSecenekler(x => ({ ...x, [b.anahtar]: s }));
    } catch (e) {
      hatayiNotEt(e);
      setHata(e instanceof Error ? e.message : 'Seçenek gelmedi.');
    } finally { setCalisiyor(false); onDurum?.(); }
  };

  const al = async (s: string) => {
    if (!b) return;
    await onAddItem(adayKaydi(b as Bosluk, s, true));
    setAlinan(s);
  };

  if (!sorular.length) return <p className={`text-[12px] ${IKINCIL}`}>Seçenek getirilecek soru kalmadı.</p>;

  return (
    <div className="space-y-3">
      <div>
        <div className={ETIKET}>Soru seçenekleri</div>
        <p className={`mt-1 text-[12px] leading-snug ${IKINCIL}`}>Vikideki bir boşluk için en fazla üç kısa seçenek. Seçtiğin cevap tepsiye düşer; "İşle" deyince vikiye yazılır.</p>
      </div>
      <select value={anahtar} onChange={e => { setAnahtar(e.target.value); setAlinan(null); }} className={`w-full text-[13px] bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg p-2`}>
        {sorular.map(x => <option key={x.anahtar} value={x.anahtar}>{x.item.title} · {x.etiket}</option>)}
      </select>
      {b && (
        <p className={`text-[12px] ${IKINCIL}`}>
          {TYPE_LABELS[b.item.type] || b.item.type} · <b className={YAZI}>{b.item.title}</b> — {b.soru}
        </p>
      )}
      {liste?.length ? (
        <div className="space-y-1.5">
          {liste.map(s => (
            <div key={s} className="flex items-center gap-2">
              <span className={`flex-1 min-w-0 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] px-3 py-2 text-[12px] ${YAZI}`}>{s}</span>
              <button type="button" disabled={alinan === s} onClick={() => al(s)} className={DUGME_BOS}>{alinan === s ? 'Tepside ✓' : 'Tepsiye al'}</button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={getir} disabled={!b || calisiyor || !!kapali} className={`${DUGME_LAC} inline-flex items-center gap-1.5`}>
          <Sparkles className="w-3.5 h-3.5" /> {calisiyor ? 'Hazırlanıyor…' : liste?.length ? 'Yeni seçenekler' : 'Seçenek getir'}
        </button>
        {kapali && <span className="text-[11px] text-[#B23A40] dark:text-[#F26B6F]">{kapali}</span>}
      </div>
      {hata && <p className="text-[12px] text-[#B23A40] dark:text-[#F26B6F]">{hata}</p>}
    </div>
  );
};

export default SoruSecenekleri;
