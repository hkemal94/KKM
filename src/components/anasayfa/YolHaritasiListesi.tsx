import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { PAKET_ADLARI, acikIsler, butunIsler, type KkmAyari, type PaketKodu, type YolIsi } from '../../lib/yolHaritasi';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Yol haritası listesi (7 Ekim): açık işlerin tek yeri. İşler geceye göre
 * gruplu; H/W/M/K ve Sen/Claude süzgeci; Kemal ekrandan iş ekler, "tamam"
 * der ya da kendi eklediğini siler. Kayıt yalnız düğmeye basınca değişir.
 */

const PAKETLER: PaketKodu[] = ['H', 'W', 'M', 'K'];
const PAKET_RENGI: Record<PaketKodu, string> = {
  H: 'bg-[#2F7A45]/15 text-[#2F7A45] dark:text-[#9FD3A9]',
  W: 'bg-[#0E1C4F]/10 text-[#0E1C4F] dark:bg-[#2C3C72] dark:text-[#F3EFE8]',
  M: 'bg-[#F26B6F]/15 text-[#D6484C] dark:text-[#F26B6F]',
  K: 'bg-[#CFC5B4]/40 text-[#6A5E4C] dark:bg-[#2C3C72]/60 dark:text-[#A6B0C9]'
};
const SECIM = `text-[12px] bg-white dark:bg-[#17345A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2 py-1.5 ${YAZI}`;

type Kim = 'hepsi' | 'kemal' | 'claude';

interface Props {
  ayar: KkmAyari;
  yaz: (a: KkmAyari) => Promise<void>;
}

export const YolHaritasiListesi: React.FC<Props> = ({ ayar, yaz }) => {
  const [paket, setPaket] = useState<PaketKodu | null>(null);
  const [kim, setKim] = useState<Kim>('hepsi');
  const [bitenlerAcik, setBitenlerAcik] = useState(false);
  const [uzakAcik, setUzakAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniPaket, setYeniPaket] = useState<PaketKodu>('K');
  const [yeniKim, setYeniKim] = useState<'kemal' | 'claude'>('kemal');
  const [yeniNot, setYeniNot] = useState('');
  const [yaziyor, setYaziyor] = useState(false);

  const hepsi = useMemo(() => butunIsler(ayar), [ayar]);
  const acik = useMemo(() => acikIsler(ayar), [ayar]);
  const uyar = (i: YolIsi) => (!paket || i.paket === paket) && (kim === 'hepsi' || i.kimde === kim);
  const gorunen = acik.filter(uyar);
  const bitenler = hepsi.filter(i => i.bitti && uyar(i));

  // Gece grupları: 1…7, sonra "sırası belli değil", Kemal'in ekledikleri, en sonda uzaklar (kapalı)
  const gruplar: { baslik: string; isler: YolIsi[] }[] = [];
  for (const i of gorunen) {
    const baslik = i.uzak ? UZAK : i.kendi ? 'Senin eklediklerin' : i.gece ? `${i.gece}. gece` : 'Sırası belli değil';
    const g = gruplar.find(x => x.baslik === baslik);
    if (g) g.isler.push(i); else gruplar.push({ baslik, isler: [i] });
  }
  gruplar.sort((a, b) => sira(a.baslik) - sira(b.baslik));

  const calistir = async (a: KkmAyari) => {
    setYaziyor(true);
    try { await yaz(a); } finally { setYaziyor(false); }
  };

  const ekle = async () => {
    const ad = yeniAd.trim();
    if (!ad) return;
    const not = yeniNot.trim();
    await calistir({
      ...ayar,
      isler: [...ayar.isler, { id: `kendi-${Date.now().toString(36)}`, ad, paket: yeniPaket, kimde: yeniKim, eklendi: Date.now(), ...(not ? { not } : {}) }]
    });
    setYeniAd(''); setYeniNot('');
  };

  const sil = (id: string) => calistir({
    ...ayar,
    isler: ayar.isler.filter(i => i.id !== id),
    bitenler: ayar.bitenler.filter(b => b !== id)
  });

  return (
    <section id="yol-haritasi" className={`${KART} p-4 lg:col-span-3 scroll-mt-24 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className={ETIKET}>Yol haritası · açık işlerin tek yeri</div>
        <span className={`ml-auto text-[11px] ${IKINCIL}`}>{acik.length} açık · {hepsi.length - acik.length} bitti</span>
      </div>

      {/* Süzgeç */}
      <div className="flex flex-wrap gap-1.5">
        <Cip secili={paket === null} onClick={() => setPaket(null)}>Hepsi</Cip>
        {PAKETLER.map(p => (
          <Cip key={p} secili={paket === p} onClick={() => setPaket(paket === p ? null : p)}>
            <b className="font-mono">{p}</b> {PAKET_ADLARI[p]}
          </Cip>
        ))}
        <span className="w-px bg-[#CFC5B4] dark:bg-[#2C3C72] mx-1" />
        <Cip secili={kim === 'hepsi'} onClick={() => setKim('hepsi')}>Herkes</Cip>
        <Cip secili={kim === 'kemal'} onClick={() => setKim('kemal')}>Senden</Cip>
        <Cip secili={kim === 'claude'} onClick={() => setKim('claude')}>Claude'dan</Cip>
      </div>

      {gruplar.map(g => (
        <div key={g.baslik}>
          {g.baslik === UZAK
            ? (
              <button type="button" onClick={() => setUzakAcik(a => !a)} className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider cursor-pointer ${IKINCIL}`}>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${uzakAcik ? '' : '-rotate-90'}`} /> {g.baslik} ({g.isler.length})
              </button>
            )
            : <div className={`text-[11px] font-semibold uppercase tracking-wider ${IKINCIL}`}>{g.baslik}</div>}
          {(g.baslik !== UZAK || uzakAcik) && <ul className="mt-1 divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
            {g.isler.map(i => (
              <li key={i.id} className="py-2 flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 w-6 text-center py-0.5 rounded text-[10px] font-mono font-bold ${PAKET_RENGI[i.paket]}`} title={PAKET_ADLARI[i.paket]}>{i.paket}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] leading-snug ${YAZI}`}>{i.ad}</span>
                  <span className={`block text-[11px] ${IKINCIL}`}>
                    <b className={i.kimde === 'kemal' ? 'text-[#D6484C] dark:text-[#F26B6F]' : ''}>{i.kimde === 'kemal' ? 'Senden' : "Claude'dan"}</b>
                    {' · '}{i.nereden}{i.not ? ` · ${i.not}` : ''}
                  </span>
                </span>
                {i.kendi && (
                  <button type="button" disabled={yaziyor} title="Sil" onClick={() => void sil(i.id)} className={`${DUGME_BOS} shrink-0 !px-2`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <button type="button" disabled={yaziyor} title="Bitti olarak işaretle" onClick={() => void calistir({ ...ayar, bitenler: [...ayar.bitenler, i.id] })} className={`${DUGME_BOS} shrink-0`}>
                  <Check className="w-3 h-3" /> tamam
                </button>
              </li>
            ))}
          </ul>}
        </div>
      ))}
      {gorunen.length === 0 && <p className={`text-[12px] ${IKINCIL}`}>Bu süzgeçte açık iş yok.</p>}

      {/* Yeni iş */}
      <div className="rounded-xl border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] p-3 space-y-2">
        <div className={ETIKET}>Yeni iş ekle</div>
        <input value={yeniAd} onChange={e => setYeniAd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ekle(); }}
          placeholder="Ne yapılacak?" className={`w-full ${SECIM}`} />
        <div className="flex flex-wrap items-center gap-2">
          <select value={yeniPaket} onChange={e => setYeniPaket(e.target.value as PaketKodu)} className={SECIM} aria-label="Paket">
            {PAKETLER.map(p => <option key={p} value={p}>{p} · {PAKET_ADLARI[p]}</option>)}
          </select>
          <select value={yeniKim} onChange={e => setYeniKim(e.target.value as 'kemal' | 'claude')} className={SECIM} aria-label="Kimde">
            <option value="kemal">Ben yapacağım</option>
            <option value="claude">Claude yapsın</option>
          </select>
          <input value={yeniNot} onChange={e => setYeniNot(e.target.value)} placeholder="Not (isteğe bağlı)" className={`flex-1 min-w-[10rem] ${SECIM}`} />
          <button type="button" disabled={!yeniAd.trim() || yaziyor} onClick={() => void ekle()} className={DUGME_LAC}>
            <Plus className="w-3.5 h-3.5" /> Ekle
          </button>
        </div>
      </div>

      {/* Bitenler */}
      {bitenler.length > 0 && (
        <div>
          <button type="button" onClick={() => setBitenlerAcik(a => !a)} className={`flex items-center gap-1 text-[12px] font-semibold cursor-pointer ${IKINCIL}`}>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${bitenlerAcik ? '' : '-rotate-90'}`} /> Bitenler ({bitenler.length})
          </button>
          {bitenlerAcik && (
            <ul className="mt-1 space-y-1">
              {bitenler.map(i => (
                <li key={i.id} className={`flex items-start gap-2 text-[12px] ${IKINCIL}`}>
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2F7A45] dark:text-[#9FD3A9]" />
                  <span className="line-through decoration-1">{i.paket} · {i.ad}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

const UZAK = 'Uzak · şimdilik değil';

function sira(baslik: string): number {
  const n = parseInt(baslik, 10);
  if (!Number.isNaN(n)) return n;
  return baslik === 'Sırası belli değil' ? 100 : baslik === UZAK ? 300 : 200;
}

const Cip: React.FC<{ secili: boolean; onClick: () => void; children: React.ReactNode }> = ({ secili, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`min-h-9 lg:min-h-0 px-2.5 py-1 rounded-full text-[11px] border cursor-pointer ${secili
      ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] border-transparent'
      : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F]'}`}>
    {children}
  </button>
);

export default YolHaritasiListesi;
