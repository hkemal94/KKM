import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Link2, Sparkles, Trash2, X } from 'lucide-react';
import type { Item } from '../../types';
import { GorselImg } from '../GorselImg';

/**
 * Galeri temizliği (3 Kasım, Kemal: "tüm görseller için sil tut ata tarzı bir pano;
 * bitirince hemen kapatırız"). Görseller tek tek, büyük gelir:
 *   Sil  → kayıt ve görsel belgesi silinir (geri alınmaz)
 *   Tut  → galeride kalır, temizlikte bir daha sorulmaz
 *   Ata  → seçilen kayda (marka, mekân, kişi…) bağlanır, galeride kalır
 * Tut ve Ata kararları yalnız bu tarayıcıda hatırlanır (kayda yazılmaz); kayda yalnız
 * Sil ve Ata basınca yazılır. İş bitince bu bileşen kaldırılır.
 */
const YER = 'kkm-galeri-temizligi';
type Karar = 'tut' | 'ata';

function kararlariOku(): Record<string, Karar> {
  try { return JSON.parse(localStorage.getItem(YER) || '{}') as Record<string, Karar>; } catch { return {}; }
}
function kararlariYaz(k: Record<string, Karar>) {
  try { localStorage.setItem(YER, JSON.stringify(k)); } catch { /* yalnız bu açılışta */ }
}

export const GaleriTemizligi: React.FC<{
  gorseller: Item[];
  hedefler: Item[];
  onSil: (g: Item) => Promise<void>;
  onAta: (g: Item, hedefId: string) => Promise<void>;
}> = ({ gorseller, hedefler, onSil, onAta }) => {
  const [acik, setAcik] = useState(false);
  const [kararlar, setKararlar] = useState<Record<string, Karar>>(kararlariOku);
  const [mesgul, setMesgul] = useState(false);
  const [ataAcik, setAtaAcik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sayac, setSayac] = useState({ sil: 0, tut: 0, ata: 0 });
  const secim = useRef<HTMLSelectElement | null>(null);

  const sira = useMemo(() => gorseller.filter(g => !kararlar[g.id]), [gorseller, kararlar]);
  const simdiki = sira[0];

  const karar = (g: Item, k: Karar) => {
    const yeni = { ...kararlar, [g.id]: k };
    setKararlar(yeni);
    kararlariYaz(yeni);
  };

  const yap = async (is: () => Promise<void>) => {
    if (mesgul) return;
    setMesgul(true);
    setHata(null);
    try { await is(); } catch (e) {
      setHata(`Olmadı: ${e instanceof Error ? e.message : String(e)}. Yeniden dene.`);
    } finally { setMesgul(false); }
  };

  const sil = () => simdiki && yap(async () => { await onSil(simdiki); setSayac(s => ({ ...s, sil: s.sil + 1 })); });
  const tut = () => simdiki && yap(async () => { karar(simdiki, 'tut'); setSayac(s => ({ ...s, tut: s.tut + 1 })); });
  const ata = (hedefId: string) => simdiki && yap(async () => {
    await onAta(simdiki, hedefId);
    karar(simdiki, 'ata');
    setAtaAcik(false);
    setSayac(s => ({ ...s, ata: s.ata + 1 }));
  });

  useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => {
      if (ataAcik || mesgul || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const k = e.key.toLocaleLowerCase('tr');
      if (k === 's') { e.preventDefault(); void sil(); }
      else if (k === 't') { e.preventDefault(); void tut(); }
      else if (k === 'a') { e.preventDefault(); setAtaAcik(true); }
      else if (e.key === 'Escape') setAcik(false);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });
  useEffect(() => { if (ataAcik) secim.current?.focus(); }, [ataAcik]);

  const sifirla = () => { setKararlar({}); kararlariYaz({}); };

  if (!gorseller.length) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[#F26B6F] bg-[#FAF8F5] dark:bg-[#13204A]">
        <Sparkles className="w-4 h-4 text-[#F26B6F] shrink-0" />
        <p className="flex-1 min-w-0 text-[13px] text-[#0E1C4F] dark:text-[#F3EFE8]">
          <b>Galeri temizliği:</b> {sira.length} görsel sırada
          {Object.keys(kararlar).length ? ` · ${Object.keys(kararlar).length} görsele karar verildi` : ''}.
          Görseller tek tek gelir: Sil, Tut ya da bir kayda Ata.
        </p>
        <button
          type="button"
          onClick={() => setAcik(true)}
          disabled={!sira.length}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:opacity-90 disabled:opacity-40 cursor-pointer"
        >
          {sira.length ? 'Temizliğe başla' : 'Bitti'}
        </button>
        {!sira.length && (
          <button type="button" onClick={sifirla} className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] underline cursor-pointer">
            Tuttuklarımı yeniden göster
          </button>
        )}
      </div>

      {acik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setAcik(false)}>
          <div
            className="max-w-5xl w-full rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-4 max-h-[96vh] flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#6A5E4C] dark:text-[#A6B0C9]">
                  Galeri temizliği · {sira.length} kaldı · silinen {sayac.sil} · tutulan {sayac.tut} · atanan {sayac.ata}
                </p>
                {simdiki && <h2 className="text-sm font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] truncate">{simdiki.title}</h2>}
              </div>
              <button type="button" onClick={() => setAcik(false)} className="p-1 text-[#6A5E4C] hover:text-[#F26B6F] cursor-pointer" aria-label="Kapat">
                <X className="w-4 h-4" />
              </button>
            </div>

            {simdiki ? (
              <>
                <div className="flex-1 min-h-0 rounded-md" style={{ background: '#F3EFE8', padding: 12 }}>
                  <GorselImg key={simdiki.id} src={simdiki.images![0]} alt={simdiki.title} className="block mx-auto w-full object-contain" style={{ height: '62vh' }} />
                </div>

                {ataAcik ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      ref={secim}
                      defaultValue=""
                      disabled={mesgul}
                      onChange={e => { if (e.target.value) void ata(e.target.value); }}
                      className="flex-1 min-w-0 text-[13px] bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg p-2"
                    >
                      <option value="">Hangi kayda atansın?</option>
                      {hedefler.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
                    </select>
                    <button type="button" onClick={() => setAtaAcik(false)} className="px-3 py-2 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] cursor-pointer">Vazgeç</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" disabled={mesgul} onClick={() => void sil()}
                      className="flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold bg-[#F26B6F] text-white hover:opacity-90 disabled:opacity-40 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Sil <span className="text-[11px] font-mono opacity-70">S</span>
                    </button>
                    <button type="button" disabled={mesgul} onClick={() => void tut()}
                      className="flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:opacity-90 disabled:opacity-40 cursor-pointer">
                      <Check className="w-4 h-4" /> Tut <span className="text-[11px] font-mono opacity-70">T</span>
                    </button>
                    <button type="button" disabled={mesgul} onClick={() => setAtaAcik(true)}
                      className="flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold border border-[#0E1C4F] dark:border-[#A6B0C9] text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] disabled:opacity-40 cursor-pointer">
                      <Link2 className="w-4 h-4" /> Ata <span className="text-[11px] font-mono opacity-70">A</span>
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                  {hata || 'Sil geri alınmaz. Tut: galeride kalır, bir daha sorulmaz. Ata: seçtiğin kaydın görseli olur, galeride de kalır.'}
                </p>
              </>
            ) : (
              <p className="py-10 text-center text-[14px] text-[#336659] dark:text-[#8FC4A8]">
                Hepsi bitti: {sayac.sil} silindi, {sayac.tut} tutuldu, {sayac.ata} atandı. Kems'e "galeri bitti" de, bu pano kaldırılır.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
