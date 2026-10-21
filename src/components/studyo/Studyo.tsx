import React, { useEffect, useState } from 'react';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { GRUP_ADLARI, STUDYO_ARACLARI, aracBul, kotaHali, type KotaHali, type StudyoGrubu } from '../../lib/studyo';
import { ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';
import { AracCalistirici } from './AracCalistirici';
import { OneriTepsisi } from './OneriTepsisi';
import { OneriAyarlari } from './OneriAyarlari';
import { bekleyenAdaylar } from '../../lib/adaylar';
import { adayBilgisiHedefi } from '../../lib/studyo';
import { SoruSecenekleri } from './SoruSecenekleri';
import { useStudyo, type StudyoIslemleri } from './StudyoBaglami';
import ConsistencyChecker from '../ConsistencyChecker';
import { KatlanirBolum } from '../kabuk/KatlanirBolum';

/**
 * Tutarlılık denetimi (1 Ekim, K-1): eskiden Düzada, Merch, Markalar, Kitap,
 * Blog'un başında ayrı ayrı düğmeydi; artık yalnız burada. Yapay zekâ değil,
 * kurallı tarama; düzeltmeyi Kemal "kabul" deyince yazar.
 */
const DENETIMLER = [
  { modul: 'duzada', ad: 'Düzada' },
  { modul: 'marka', ad: 'Markalar' },
  { modul: 'merch', ad: 'Merch' },
  { modul: 'kitap', ad: 'Kitap' },
  { modul: 'blog', ad: 'Blog' }
] as const;

/**
 * Yapay zekâ stüdyosu (Araçlar, 29 Eylül akşamı). Kemal'in seçimleri:
 * araç kartları sayfaya göre gruplu, öneri tepsisi (Adaylar'la tek), üstte
 * kota satırı. Sayfalardan "✨ Stüdyoda aç" ile yan panel açılır.
 */

const SORU_ARACI = 'kanon-secenek';
const GRUPLAR: StudyoGrubu[] = ['viki', 'yazi', 'marka', 'kanon'];

/** Kota satırı; bir çağrıdan sonra `nabiz` artınca yeniden okunur */
function useKota(nabiz: number): [KotaHali, string | null] {
  const [hal, setHal] = useState<KotaHali>(() => kotaHali());
  useEffect(() => { setHal(kotaHali()); }, [nabiz]);
  const kapali = hal === 'doldu' ? 'Bugünlük hak doldu — yarın tekrar dene.' : null;
  return [hal, kapali];
}

const KotaSatiri: React.FC<{ hal: KotaHali }> = ({ hal }) => {
  const r = hal === 'hazir'
    ? { nokta: 'bg-[#4F8A5B]', yazi: 'Hazır. Google\'ın ücretsiz günlük hakkı kullanılır; dolarsa yalnız stüdyo bekler.' }
    : hal === 'doldu'
      ? { nokta: 'bg-[#F26B6F]', yazi: 'Bugünlük hak doldu — yarın tekrar dene. Uygulamanın geri kalanı normal çalışır.' }
      : { nokta: 'bg-[#CFC5B4]', yazi: 'Yapay zekâ sunucusu bu ortamda çalışmıyor (önizleme). Uygulamanın geri kalanı normal.' };
  return (
    <p className={`flex items-start gap-2 px-3 py-2 rounded-xl bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] leading-snug ${YAZI}`}>
      <i className={`mt-1 w-2 h-2 rounded-full shrink-0 ${r.nokta}`} /> {r.yazi}
    </p>
  );
};

const AracKartlari: React.FC<{ secili: string | null; onSec: (id: string) => void; grup?: StudyoGrubu; hedefTuru?: string }> = ({ secili, onSec, grup, hedefTuru }) => {
  const liste = (g: StudyoGrubu) => (
    <div className="mt-2 grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0 [&>*]:break-words">
      {[...STUDYO_ARACLARI.filter(a => a.grup === g && !a.gizli && (!hedefTuru || !a.hedefTurleri || a.hedefTurleri.includes(hedefTuru as never))).map(a => ({ id: a.id, ad: a.ad, aciklama: a.aciklama })),
        ...(g === 'kanon' ? [{ id: SORU_ARACI, ad: 'Soru seçenekleri', aciklama: 'Günün sorusu ve atölye soruları için kısa seçenekler.' }] : [])
      ].map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSec(a.id)}
          className={`text-left rounded-xl border p-3 cursor-pointer transition-colors ${secili === a.id ? 'border-[#F26B6F] bg-[#F26B6F]/8' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`}
        >
          <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${YAZI}`}><Sparkles className="w-3.5 h-3.5 text-[#F26B6F]" />{a.ad}</span>
          {/* Telefonda açıklama yalnız seçilince (1 Ekim, K-4) */}
          <span className={`${secili === a.id ? 'block' : 'hidden sm:block'} mt-1 text-[12px] leading-snug ${IKINCIL}`}>{a.aciklama}</span>
        </button>
      ))}
    </div>
  );
  // Yan panelde tek grup açık gelir; sayfada gruplar telefonda katlı (K-4)
  if (grup) return <div><div className={ETIKET}>{GRUP_ADLARI[grup]}</div>{liste(grup)}</div>;
  return (
    <div className="space-y-4">
      {GRUPLAR.map(g => (
        <KatlanirBolum key={g} baslik={GRUP_ADLARI[g]}>{liste(g)}</KatlanirBolum>
      ))}
    </div>
  );
};

/** Stüdyo sayfası (Araçlar) */
export const Studyo: React.FC<StudyoIslemleri & { onTemizlik?: () => void }> = ({ onTemizlik, ...islemler }) => {
  const [secili, setSecili] = useState<string | null>(null);
  const [nabiz, setNabiz] = useState(0);
  const [hal, kapali] = useKota(nabiz);
  const arac = aracBul(secili);
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SayfaBasi baslik="Yapay zekâ" />
      <KotaSatiri hal={hal} />
      <OneriAyarlari items={islemler.items} onAddItem={islemler.onAddItem} onUpdateItem={islemler.onUpdateItem} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr] items-start [&>*]:min-w-0">
        <section className={`${KART} p-4 space-y-4`}>
          <AracKartlari secili={secili} onSec={id => setSecili(s => (s === id ? null : id))} />
          {secili === SORU_ARACI && (
            <div className="pt-4 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
              <SoruSecenekleri {...islemler} kapali={kapali} onDurum={() => setNabiz(n => n + 1)} />
            </div>
          )}
          {arac && (
            <div className="pt-4 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
              <AracCalistirici key={arac.id} {...islemler} arac={arac} kapali={kapali} onDurum={() => setNabiz(n => n + 1)} />
            </div>
          )}
        </section>
        <OneriTepsisi {...islemler} onTemizlik={onTemizlik} />
      </div>
      <section className={`${KART} p-4`}>
        <div className={ETIKET}>Tutarlılık denetimi</div>
        <p className={`mt-1 text-[12px] ${IKINCIL}`}>Kurallı tarama, yapay zekâ değil. Bulduğu düzeltmeler sen kabul edince yazılır.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DENETIMLER.map(d => (
            <span key={d.modul}><ConsistencyChecker module={d.modul} etiket={d.ad} items={islemler.items} onUpdateItem={islemler.onUpdateItem} onAddItem={islemler.onAddItem}
              buttonClassName={`px-3 py-2 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI} hover:border-[#F26B6F] cursor-pointer`} /></span>
          ))}
        </div>
      </section>
    </div>
  );
};

/** Sayfalardan "✨ Stüdyoda aç" ile açılan yan panel (telefonda alttan tam ekran) */
export const StudyoPaneli: React.FC<StudyoIslemleri> = (islemler) => {
  const { istek, kapat } = useStudyo();
  const [secili, setSecili] = useState<string | null>(null);
  const [nabiz, setNabiz] = useState(0);
  const [hal, kapali] = useKota(nabiz);

  useEffect(() => {
    setSecili(istek?.bosluk ? SORU_ARACI : istek?.arac ?? null);
    setNabiz(n => n + 1);
  }, [istek]);

  useEffect(() => {
    if (!istek) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') kapat(); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [istek, kapat]);

  if (!istek) return null;
  const arac = aracBul(secili);
  const grup: StudyoGrubu | undefined = istek.bosluk ? 'kanon' : istek.grup ?? aracBul(istek.arac)?.grup;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/35" onClick={kapat}>
      <aside
        onClick={e => e.stopPropagation()}
        className="w-full lg:max-w-[520px] h-full lg:h-full mt-auto lg:mt-0 max-h-[100dvh] overflow-y-auto bg-[#FAF8F5] dark:bg-[#13204A] lg:border-l border-[#CFC5B4] dark:border-[#2C3C72] shadow-2xl p-4 lg:p-5 space-y-4 animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#F26B6F]" />
          <h2 className={`flex-1 text-[17px] font-bold ${YAZI}`}>Yapay zekâ stüdyosu</h2>
          <button type="button" onClick={() => { kapat(); islemler.onStudyoSayfasi(); }} className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-mono ${IKINCIL} hover:text-[#D6484C] cursor-pointer`}>
            tamamı <ArrowRight className="w-3 h-3" />
          </button>
          <button type="button" onClick={kapat} title="Kapat" className={`w-9 h-9 rounded-full flex items-center justify-center ${IKINCIL} hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <KotaSatiri hal={hal} />
        {/* Madde için bekleyen öneriler en üstte: öneri ilgili yerde de görünsün (21 Ekim) */}
        {istek.hedefId && bekleyenAdaylar(islemler.items).some(a => adayBilgisiHedefi(a) === istek.hedefId) && (
          <OneriTepsisi {...islemler} hedefId={istek.hedefId} baslik={`${islemler.items.find(i => i.id === istek.hedefId)?.title || 'Madde'} için öneriler`} />
        )}
        <AracKartlari grup={grup} hedefTuru={islemler.items.find(i => i.id === istek.hedefId)?.type} secili={secili} onSec={id => setSecili(id)} />
        {secili === SORU_ARACI && (
          <div className="pt-4 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
            <SoruSecenekleri {...islemler} bosluk={istek.bosluk} kapali={kapali} onDurum={() => setNabiz(n => n + 1)} />
          </div>
        )}
        {arac && (
          <div className="pt-4 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
            <AracCalistirici key={`${arac.id}:${istek.hedefId || ''}:${istek.serbest || ''}`} {...islemler} arac={arac} hedefId={istek.hedefId} serbestIlk={istek.serbest} kapali={kapali} onDurum={() => setNabiz(n => n + 1)} />
          </div>
        )}
      </aside>
    </div>
  );
};

export default Studyo;
