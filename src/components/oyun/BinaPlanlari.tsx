import React, { useEffect, useState } from 'react';
import { Maximize2, Minus, Plus, X } from 'lucide-react';
import { BolumBasligi, Rozet } from '../kabuk/Parcalar';
import { DUGME_BOS, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * The Imperial Kemskoy · bina ve kat planları (4 Kasım).
 *
 * Kems Ajans'ın 3B taslakları: dış görünüş, giriş katı ve oda katı planı
 * (SVG), çatısı kaldırılmış iç görünümler. Hepsi Kemal'in çizimlerinden
 * hazırlanmış taslak; kanon değil, vikiye girmez (oyun verisi). Dosyalar
 * `public/oyun/imperial/` altında; büyük görseller webp, küçük resimler
 * `-kucuk.webp`. Yalnız gösterir, hiçbir kayda yazmaz.
 */

const KOK = '/oyun/imperial/';

interface Gorsel {
  /** Dosya adı (uzantısız); küçük resmi `<ad>-kucuk.webp` */
  ad: string;
  baslik: string;
}

const PLANLAR: { dosya: string; baslik: string; aciklama: string[] }[] = [
  {
    dosya: 'imperial-giris-kati.svg',
    baslik: 'Giriş katı',
    aciklama: [
      'Sağ kol misafir tarafı: otelin girişi sağ kolun ucunda; bagaj odası, bell team, concierge ve reception bankoları, arkalarında personel koridoru, lobby bar.',
      'Sol kol personel tarafı: soyunma odaları, mutfak deposu, ofisler, güvenlik, mutfak.',
      'Sol altta restoran (sol kule dahil); mutfakla arası yarım cam, ortası buzlu cam servis kapısı. Sağ altta lobby bar oturma alanı (sağ kule dahil).',
    ],
  },
  {
    dosya: 'imperial-kat-plani.svg',
    baslik: 'Oda katı',
    aciklama: [
      'Her katta 5 süit: kollarda 9 × 15 m dört süit, ön blokta 24 × 8 m büyük süit.',
      'Lavabolar, housekeeping, acil çıkış merdivenleri; avluya bakan iki cam asansör. Kuleler ortak alan.',
    ],
  },
];

const GIRIS_GORUNUMLERI: Gorsel[] = [
  { ad: 'giris-on', baslik: 'Giriş katı · önden' },
  { ad: 'giris-arka', baslik: 'Giriş katı · arkadan' },
  { ad: 'giris-sag', baslik: 'Sağ kol · bankolar' },
  { ad: 'giris-sag2', baslik: 'Sağ kol · yakın' },
  { ad: 'giris-sol', baslik: 'Sol kol · personel tarafı' },
  { ad: 'giris-mutfak', baslik: 'Restoran ve mutfak' },
  { ad: 'giris-mutfak2', baslik: 'Servis kapısı · yakın' },
];

const ODA_GORUNUMLERI: Gorsel[] = [
  { ad: 'oda-on', baslik: 'Oda katı · önden' },
  { ad: 'oda-arka', baslik: 'Oda katı · arkadan' },
  { ad: 'oda-sag', baslik: 'Kol süitleri · 9 × 15 m' },
  { ad: 'oda-suit', baslik: 'Büyük süit · 24 × 8 m' },
];

type Acik = { adres: string; baslik: string; plan: boolean };

/** Tam ekran görüntüleyici: + / − ile yakınlaştırma, kaydırarak gezinme */
const TamEkran: React.FC<{ acik: Acik; onKapat: () => void }> = ({ acik, onKapat }) => {
  const [olcek, setOlcek] = useState(1);
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onKapat();
      if (e.key === '+' || e.key === '=') setOlcek(o => Math.min(4, o + 0.5));
      if (e.key === '-') setOlcek(o => Math.max(1, o - 0.5));
    };
    window.addEventListener('keydown', tus);
    const eski = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tus); document.body.style.overflow = eski; };
  }, [onKapat]);
  const dugme = 'w-11 h-11 rounded-full flex items-center justify-center bg-[#FAF8F5]/95 text-[#0E1C4F] disabled:opacity-40 cursor-pointer';
  return (
    <div className="fixed inset-0 z-50 bg-[#0B132B] flex flex-col" role="dialog" aria-modal="true" aria-label={acik.baslik}>
      <div className="flex items-center gap-2 px-3 py-2 text-[#F3EFE8]">
        <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{acik.baslik}</span>
        <Rozet renk="dikkat">taslak</Rozet>
        <button type="button" onClick={() => setOlcek(o => Math.max(1, o - 0.5))} disabled={olcek <= 1} aria-label="Uzaklaştır" className={dugme}><Minus className="w-4 h-4" /></button>
        <span className="w-12 text-center text-[12px] tabular-nums">%{Math.round(olcek * 100)}</span>
        <button type="button" onClick={() => setOlcek(o => Math.min(4, o + 0.5))} disabled={olcek >= 4} aria-label="Yakınlaştır" className={dugme}><Plus className="w-4 h-4" /></button>
        <button type="button" onClick={onKapat} aria-label="Kapat" className={dugme}><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="min-h-full flex items-center justify-center p-2" style={{ width: `${olcek * 100}%` }}>
          <img src={acik.adres} alt={acik.baslik} className={`w-full h-auto ${acik.plan ? 'bg-white rounded-lg' : 'rounded-lg'}`} style={olcek === 1 ? { maxHeight: 'calc(100vh - 80px)', objectFit: 'contain' } : undefined} />
        </div>
      </div>
    </div>
  );
};

const Kucukler: React.FC<{ gorseller: Gorsel[]; onAc: (a: Acik) => void }> = ({ gorseller, onAc }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
    {gorseller.map(g => (
      <button key={g.ad} type="button" onClick={() => onAc({ adres: `${KOK}${g.ad}.webp`, baslik: g.baslik, plan: false })}
        className={`${KART} overflow-hidden text-left cursor-pointer hover:ring-2 hover:ring-[#F26B6F]/40`}>
        <img src={`${KOK}${g.ad}-kucuk.webp`} alt={g.baslik} loading="lazy" className="w-full aspect-[8/5] object-cover" />
        <span className={`block px-2.5 py-1.5 text-[12px] font-semibold truncate ${YAZI}`}>{g.baslik}</span>
      </button>
    ))}
  </div>
);

export const BinaPlanlari: React.FC = () => {
  const [acik, setAcik] = useState<Acik | null>(null);
  return (
    <div className="space-y-5">
      <div className={`${KART} p-4 flex gap-3 items-start`}>
        <Rozet renk="dikkat">taslak</Rozet>
        <p className={`flex-1 text-[13px] leading-relaxed ${IKINCIL}`}>
          Kems Ajans'ın hazırladığı 3B taslaklar, Kemal'in çizimlerinden. Kanon değil; vikiye girmez. İç görünümlerde çatı kaldırıldı, eşyalar temsilî.
        </p>
      </div>

      <section className="space-y-2">
        <BolumBasligi baslik="Dış görünüş" renk="lacivert" />
        <button type="button" onClick={() => setAcik({ adres: `${KOK}dis-gorunus.webp`, baslik: 'Dış görünüş', plan: false })}
          className={`${KART} block w-full overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#F26B6F]/40`}>
          <img src={`${KOK}dis-gorunus.webp`} alt="Otelin dış görünüşü" loading="lazy" className="w-full h-auto" />
        </button>
      </section>

      {PLANLAR.map(p => (
        <section key={p.dosya} className="space-y-2">
          <BolumBasligi baslik={`${p.baslik} planı`} renk="lacivert"
            ek={<button type="button" onClick={() => setAcik({ adres: `${KOK}${p.dosya}`, baslik: `${p.baslik} planı`, plan: true })} className={DUGME_BOS}><Maximize2 className="w-3.5 h-3.5" /> Tam ekran</button>} />
          <div className={`${KART} overflow-hidden`}>
            <button type="button" onClick={() => setAcik({ adres: `${KOK}${p.dosya}`, baslik: `${p.baslik} planı`, plan: true })}
              className="block w-full bg-white cursor-zoom-in" aria-label={`${p.baslik} planını tam ekran aç`}>
              <img src={`${KOK}${p.dosya}`} alt={`${p.baslik} planı`} loading="lazy" className="w-full h-auto" />
            </button>
            <ul className={`px-4 py-3 space-y-1 text-[13px] leading-relaxed list-disc pl-8 border-t border-[#E4DCCD] dark:border-[#2C3C72] ${IKINCIL}`}>
              {p.aciklama.map(s => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <BolumBasligi baslik="3B iç görünüm · giriş katı" sayi={GIRIS_GORUNUMLERI.length} renk="bitti" />
        <Kucukler gorseller={GIRIS_GORUNUMLERI} onAc={setAcik} />
      </section>
      <section className="space-y-2">
        <BolumBasligi baslik="3B iç görünüm · oda katı" sayi={ODA_GORUNUMLERI.length} renk="bitti" />
        <Kucukler gorseller={ODA_GORUNUMLERI} onAc={setAcik} />
      </section>

      {acik && <TamEkran acik={acik} onKapat={() => setAcik(null)} />}
    </div>
  );
};

export default BinaPlanlari;
