import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { AJANS_BELGELERI, AJANS_DEPOSU, AJANS_KLASORLERI, dosyaBasligi, klasoruOku, type AjansDosyasi } from '../../lib/ajansDeposu';
import { depoSayfasi } from '../../lib/depoBelgesi';
import { DepoBelgesi } from '../oyun/DepoBelgesi';
import { AnahtarKarti } from '../oyun/OyunAyarlari';
import { anahtariOku } from '../../lib/oyunAyarlari';
import type { Item } from '../../types';
import { TepsiAjansaKarti } from './TepsiAjansaKarti';
import { VikiAjansaKarti } from './VikiAjansaKarti';
import { AjansKararlariKarti } from './AjansKararlariKarti';
import { DUGME_BOS, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Durum → Ajans (21 Ekim, `lib/ajansDeposu.ts`). Kems Ajans'ın bıraktığı
 * dosyalar klasör klasör listelenir; dosyaya basınca depodan okunup
 * gösterilir. Depo gizli (22 Ekim): okumak için bu tarayıcıda GitHub
 * anahtarı gerekir. Ajansın deposuna "Tepsiyi ajansa gönder" yazar
 * (`TepsiAjansaKarti`); KKM kayıtlarını yalnız "Ajansın kararlarını uygula"
 * değiştirir (`AjansKararlariKarti`, Kemal basınca).
 */

type KlasorDurumu = AjansDosyasi[] | 'yukleniyor' | { hata: string };

const tarihYazisi = (t: Date) => t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export const AjansSayfasi: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}> = ({ items, onUpdateItem, onDeleteItem }) => {
  const [anahtar, setAnahtar] = useState(anahtariOku);
  const [klasorler, setKlasorler] = useState<Record<string, KlasorDurumu>>({});
  const [tur, setTur] = useState(0);
  const [acik, setAcik] = useState<{ yol: string; ad: string } | null>(null);

  useEffect(() => {
    let iptal = false;
    setKlasorler(Object.fromEntries(AJANS_KLASORLERI.map(k => [k.yol, 'yukleniyor' as const])));
    for (const k of AJANS_KLASORLERI) {
      klasoruOku(k.yol)
        .then(d => { if (!iptal) setKlasorler(o => ({ ...o, [k.yol]: d })); })
        .catch(e => { if (!iptal) setKlasorler(o => ({ ...o, [k.yol]: { hata: e instanceof Error ? e.message : String(e) } })); });
    }
    return () => { iptal = true; };
  }, [tur, anahtar]);

  if (acik) return (
    <div className="space-y-4">
      <button type="button" onClick={() => setAcik(null)} className={DUGME_BOS}><ArrowLeft className="w-3.5 h-3.5" /> Ajansın dosyaları</button>
      <h2 className={`text-[18px] font-bold ${YAZI}`}>{acik.ad}</h2>
      <DepoBelgesi depo={AJANS_DEPOSU} yollar={[acik.yol]} />
    </div>
  );

  const DosyaDugmesi: React.FC<{ yol: string; ad: string; tarih?: Date | null }> = ({ yol, ad, tarih }) => (
    <li>
      <button type="button" onClick={() => setAcik({ yol, ad })}
        className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-[#F3EFE8] dark:hover:bg-[#0B132B] ${YAZI}`}>
        <FileText className="w-4 h-4 mt-0.5 shrink-0 text-[#F26B6F]" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold break-words">{ad}</span>
          {tarih && <span className={`block text-[12px] ${IKINCIL}`}>{tarihYazisi(tarih)}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-[13px] ${IKINCIL} min-w-0`}>
          Kems Ajans'ın deposundan okunuyor: <span className={`font-semibold ${YAZI}`}>{AJANS_DEPOSU}</span>.
          Ajansın işi, sen birleştirince burada görünür.
        </p>
        <span className="flex-1" />
        <button type="button" onClick={() => setTur(t => t + 1)} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        <a href={depoSayfasi(AJANS_DEPOSU)} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Depoda aç</a>
      </div>

      {!anahtar && <AnahtarKarti anahtar={anahtar} onDegis={setAnahtar}
        baslik="Ajansın gizli deposunu okumak için GitHub anahtarı" depoNotu="Kems-Ajans deposu (oyuna da göndereceksen oyunun deposu da)" />}

      <TepsiAjansaKarti items={items} anahtar={anahtar} />
      <VikiAjansaKarti items={items} anahtar={anahtar} />
      <AjansKararlariKarti items={items} anahtar={anahtar} tur={tur} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />

      <div className="grid gap-4 md:grid-cols-2">
        {AJANS_KLASORLERI.map(k => {
          const d = klasorler[k.yol] ?? 'yukleniyor';
          return (
            <section key={k.yol} className={`${KART} px-4 py-4 space-y-2 min-w-0`}>
              <div>
                <div className={ETIKET}>{k.ad}</div>
                <p className={`text-[12px] ${IKINCIL}`}>{k.aciklama}</p>
              </div>
              {d === 'yukleniyor' && <p className={`text-[13px] ${IKINCIL}`}>Okunuyor…</p>}
              {typeof d === 'object' && 'hata' in d && <p className={`text-[13px] ${YAZI}`}>Okunamadı ({d.hata}).</p>}
              {Array.isArray(d) && (d.length
                ? <ul className="-mx-1">{d.map(f => <DosyaDugmesi key={f.yol} yol={f.yol} ad={dosyaBasligi(f.ad)} tarih={f.tarih} />)}</ul>
                : <p className={`text-[13px] ${IKINCIL}`}>Henüz dosya yok.</p>)}
            </section>
          );
        })}
      </div>

      <section className={`${KART} px-4 py-4 space-y-2`}>
        <div className={ETIKET}>Ajansın belgeleri</div>
        <ul className="-mx-1">{AJANS_BELGELERI.map(b => <DosyaDugmesi key={b.yol} yol={b.yol} ad={b.ad} />)}</ul>
      </section>
    </div>
  );
};

export default AjansSayfasi;
