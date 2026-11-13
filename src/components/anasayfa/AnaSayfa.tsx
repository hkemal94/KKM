import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, Bot, CalendarDays, Gamepad2, Image as GorselSimgesi, Inbox, Moon, NotebookPen, X } from 'lucide-react';
import type { Item } from '../../types';
import type { Bildirim } from '../../lib/bildirimler';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { isleriOku, type IsDosyasi } from '../../lib/isler';
import { bugunSirada, siradakiTurGunu, VARSAYILAN_TUR_SAATI, zamanlayiciOku, type AjanZamani, type Zamanlayici } from '../../lib/ajanlar';
import { ajanAdi, geceTurunuOku, gorselAdresi, turGunuYazi, type GeceTuruDosyasi, type TurGorseli } from '../../lib/geceTuru';
import { durumOzetiniOku, type DurumOzeti } from '../../lib/oyunKimligi';
import { OyunKapagi } from '../oyun/DurumOzeti';
import { NotDefteri } from './NotDefteri';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Ana sayfa (12 Kasım, Kemal: "Tepsiyi bir yerde, onayları bir yerde
 * gördüğüm böyle bir ekran istiyorum. Notlarım bir yerde olsun.").
 * Kompakt ve dolu (DK Lite kuralıyla aynı: boş delik yok, ekrana yayılmaz).
 *
 *   Sabah tepsisi      — gece turunun getirdikleri (`lib/geceTuru.ts`);
 *                        günün görsellerine basınca galeri o günde açılır
 *   Onaylar            — zildeki bekleyenler; Onay bekleyenler'e götürür
 *   Notlarım           — not defteri (Notlar sayfasının aynısı, kısa)
 *   Senden beklenenler — ajansın iş listesinde Kemal'in üzerindekiler
 *   Bu gece            — zamanlayıcıdan sıradaki turun ajanları
 *   Projeler           — oyunların durum özeti, ajansta çalışılan işler
 *
 * Hepsi okunur; kayda ve depoya hiçbir şey yazılmaz.
 */

type Hedef = 'onay' | 'notlar' | 'isler' | 'ajanlar' | 'oyun';

interface Props {
  items: Item[];
  bildirimler: Bildirim[];
  onGit: (hedef: Hedef) => void;
  /** Tepsideki işe basınca Onay bekleyenler o iş açık gelir (13 Kasım) */
  onIsAc?: (anahtar: string) => void;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onMaddeAc: (item: Item) => void;
}

const Kart: React.FC<{ baslik: string; simge: React.ElementType; git?: () => void; gitAdi?: string; children: React.ReactNode; className?: string }> = ({ baslik, simge: Simge, git, gitAdi, children, className }) => (
  <section className={`${KART} p-3.5 min-w-0 ${className || ''}`}>
    <div className="flex items-center gap-2 mb-2">
      <Simge className="w-4 h-4 text-[#F26B6F] shrink-0" />
      <h2 className={`flex-1 ${ETIKET}`}>{baslik}</h2>
      {git && (
        <button type="button" onClick={git} className={`inline-flex items-center gap-1 text-[11px] font-semibold ${YAZI} hover:text-[#F26B6F] cursor-pointer`}>
          {gitAdi || 'Aç'} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
    {children}
  </section>
);

/** Gizli depodaki görsel: yüklenince görünür */
const DepoGorseli: React.FC<{ anahtar: string; dal: string; g: TurGorseli; className: string }> = ({ anahtar, dal, g, className }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let iptal = false;
    gorselAdresi(anahtar, dal, g.yol).then(s => { if (!iptal) setSrc(s); }).catch(() => { /* görünmez */ });
    return () => { iptal = true; };
  }, [anahtar, dal, g.yol]);
  return src
    ? <img src={src} alt={g.baslik || ''} className={`${className} object-cover`} />
    : <span className={`${className} bg-[#F3EFE8] dark:bg-[#0B132B] animate-pulse`} />;
};

/** Ajansın görselleri, gün gün (tıklanan gün en üstte) */
const Galeri: React.FC<{ anahtar: string; veri: GeceTuruDosyasi; gun: string; onKapat: () => void }> = ({ anahtar, veri, gun, onKapat }) => {
  const turlar = veri.turlar.filter(t => t.gorseller.length);
  useEffect(() => {
    document.getElementById(`galeri-${gun}`)?.scrollIntoView({ block: 'start' });
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat(); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [gun, onKapat]);
  return (
    <div className="fixed inset-0 z-[90] bg-[#F3EFE8] dark:bg-[#0B132B] overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-[#F3EFE8]/95 dark:bg-[#0B132B]/95 border-b border-[#CFC5B4] dark:border-[#2C3C72]">
        <GorselSimgesi className="w-4 h-4 text-[#F26B6F]" />
        <span className={`flex-1 text-[14px] font-bold ${YAZI}`}>Gece turunun görselleri</span>
        <button type="button" onClick={onKapat} className={`inline-flex items-center gap-1 min-h-11 px-3 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] font-semibold ${YAZI} cursor-pointer`}>
          <X className="w-3.5 h-3.5" /> Kapat
        </button>
      </div>
      <div className="max-w-5xl mx-auto p-4 space-y-5">
        <p className={`text-[12px] ${IKINCIL}`}>Hepsi yapay zekâ taslağı; sen onaylamadan hiçbir yere gitmez.</p>
        {turlar.map(t => (
          <section key={t.tarih} id={`galeri-${t.tarih}`} className="scroll-mt-16">
            <h3 className={`mb-2 text-[13px] font-bold ${YAZI}`}>{turGunuYazi(t.tarih)}</h3>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
              {t.gorseller.map(g => (
                <figure key={g.yol} className="min-w-0">
                  <DepoGorseli anahtar={anahtar} dal={veri.gorselDali} g={g} className="w-full aspect-square rounded-xl block" />
                  {g.baslik && <figcaption className={`mt-1 text-[12px] ${IKINCIL}`}>{g.baslik}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export const AnaSayfa: React.FC<Props> = ({ items, bildirimler, onGit, onIsAc, onAddItem, onUpdateItem, onMaddeAc }) => {
  const anahtar = anahtariOku();
  const [tur, setTur] = useState<GeceTuruDosyasi | null | undefined>(undefined);
  const [isler, setIsler] = useState<IsDosyasi | null>(null);
  const [zaman, setZaman] = useState<Zamanlayici | null>(null);
  const [galeriGunu, setGaleriGunu] = useState<string | null>(null);
  const galeriKapat = useCallback(() => setGaleriGunu(null), []);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    void geceTurunuOku(anahtar).then(t => { if (!iptal) setTur(t); });
    void isleriOku(anahtar).then(i => { if (!iptal) setIsler(i); }).catch(() => { /* yok */ });
    void zamanlayiciOku(anahtar).then(z => { if (!iptal) setZaman(z); }).catch(() => { /* okunamazsa kart "—" kalır */ });
    return () => { iptal = true; };
  }, [anahtar]);

  // Oyunlar: künyesinde deposu yazılı olanlar
  const oyunlar = useMemo(() => items.filter(i => !i.archived && String((i.metadata as { depo?: string } | undefined)?.depo || '').trim())
    .map(i => ({ ad: i.title, depo: String((i.metadata as { depo?: string }).depo).trim() })).slice(0, 3), [items]);
  const [ozetler, setOzetler] = useState<Record<string, DurumOzeti | null>>({});
  useEffect(() => {
    let iptal = false;
    for (const o of oyunlar) void durumOzetiniOku(o.depo).then(d => { if (!iptal) setOzetler(x => ({ ...x, [o.depo]: d })); });
    return () => { iptal = true; };
  }, [oyunlar]);

  const sonTur = tur?.turlar[0];
  const uretenler = sonTur?.ajanlar.filter(a => a.durum === 'uretti') || [];
  const bosGecenler = sonTur?.ajanlar.filter(a => a.durum !== 'uretti') || [];
  const bekleyenler = (isler?.isler || []).filter(i => i.kimde === 'Kemal' && i.durum !== 'bitti');
  const calisilan = (isler?.isler || []).filter(i => i.kimde !== 'Kemal' && i.durum === 'calisiyor');
  const turSaati = zaman?.turSaati || VARSAYILAN_TUR_SAATI;
  const turGunu = siradakiTurGunu(turSaati);
  const turId = `${turGunu.getFullYear()}-${String(turGunu.getMonth() + 1).padStart(2, '0')}-${String(turGunu.getDate()).padStart(2, '0')}`;
  const buGece = zaman ? (Object.entries(zaman.ajanlar) as Array<[string, AjanZamani]>).filter(([ad, z]) => bugunSirada(z, turGunu) || (zaman.ekstra?.[turId] || []).includes(ad)) : [];
  const turKapali = zaman?.turAcik === false || (zaman?.atla || []).includes(turId);
  const toplamOnay = bildirimler.filter(b => b.tur !== 'yedek').reduce((t, b) => t + b.sayi, 0);
  const satir = 'text-[12.5px] leading-snug';
  // Onaylar: telefonda tepsinin hemen altında, masaüstünde sağ sütunun başında
  const onaylar = (cls: string) => (
    <Kart className={cls} baslik={toplamOnay ? `Onaylar · ${toplamOnay}` : 'Onaylar'} simge={Inbox} git={() => onGit('onay')}>
          {bildirimler.length ? (
            <ul className="space-y-1">
              {bildirimler.map(b => (
                <li key={b.tur}>
                  <button type="button" onClick={() => onGit('onay')} className={`w-full flex items-baseline gap-2 text-left ${satir} ${YAZI} hover:text-[#F26B6F] cursor-pointer`}>
                    <b className="w-5 shrink-0 font-mono text-[#D6484C] dark:text-[#F26B6F] tabular-nums">{b.sayi}</b>
                    <span className="min-w-0">{b.baslik}<span className={`block text-[11px] ${IKINCIL} truncate`}>{b.ayrinti}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className={`${satir} ${IKINCIL}`}>Onayını bekleyen bir şey yok.</p>}
        </Kart>
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <SayfaBasi baslik="Ana sayfa" />
      {!anahtar && (
        <p className={`${KART} p-3 text-[12px] ${IKINCIL}`}>Bu tarayıcıda Ajans bağlantısı yok; tepsi, işler ve zamanlayıcı okunamıyor. Ajanlar ve otomasyonlar → Ajans bağlantısı'ndan bir kez girilir.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-3 items-start">
        <div className="grid gap-3 lg:col-span-2 min-w-0">
        {/* Sabah tepsisi */}
        <Kart baslik={sonTur ? `Sabah tepsisi · ${turGunuYazi(sonTur.tarih)}` : 'Sabah tepsisi'} simge={Moon} git={() => onGit('onay')} gitAdi="Onaylara git">
          {tur === undefined && anahtar ? <p className={`${satir} ${IKINCIL}`}>Gece turu okunuyor…</p>
            : !sonTur ? <p className={`${satir} ${IKINCIL}`}>Gece turu henüz çalışmadı. İlk tur gece {turSaati}'de; sabah burada olur.</p>
            : (
              <div className="space-y-2">
                {uretenler.length ? (
                  <ul className="space-y-1">
                    {uretenler.map(a => (
                      <li key={a.ajan}>
                        <button type="button" onClick={() => (a.oneri && onIsAc ? onIsAc(`ajan:${a.oneri}`) : onGit('onay'))}
                          className={`w-full text-left ${satir} ${YAZI} hover:text-[#F26B6F] cursor-pointer`}>
                          <b>{ajanAdi(a.ajan)}</b>{a.ozet ? ` · ${a.ozet}` : ''} <span className="text-[11px] font-semibold text-[#F26B6F] whitespace-nowrap">Oku ve karar ver →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className={`${satir} ${IKINCIL}`}>Bu gece kimse iş getirmedi.</p>}
                {bosGecenler.length > 0 && (
                  <p className={`text-[11px] ${IKINCIL}`}>İş bulamadı: {bosGecenler.map(a => ajanAdi(a.ajan)).join(' · ')}</p>
                )}
                {sonTur.gorseller.length > 0 && anahtar && (
                  <div className="flex gap-2 overflow-x-auto pt-1">
                    {sonTur.gorseller.map(g => (
                      <button key={g.yol} type="button" onClick={() => setGaleriGunu(sonTur.tarih)} title={g.baslik || 'Günün görseli'} className="shrink-0 cursor-pointer">
                        <DepoGorseli anahtar={anahtar} dal={tur!.gorselDali} g={g} className="w-20 h-20 rounded-lg block" />
                      </button>
                    ))}
                    <button type="button" onClick={() => setGaleriGunu(sonTur.tarih)} className={`shrink-0 w-20 h-20 rounded-lg border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] text-[11px] font-semibold ${YAZI} cursor-pointer`}>Galeri</button>
                  </div>
                )}
              </div>
            )}
        </Kart>

        {onaylar('lg:hidden')}
        {/* Notlarım */}
        <Kart baslik="Notlarım" simge={NotebookPen} git={() => onGit('notlar')} gitAdi="Hepsi">
          <NotDefteri items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onMaddeAc={onMaddeAc} />
        </Kart>

        {/* Projeler */}
        <Kart baslik="Projeler" simge={Gamepad2} git={() => onGit('oyun')} gitAdi="Oyunlar">
          <div className="grid gap-3 sm:grid-cols-2">
            {oyunlar.map(o => {
              const d = ozetler[o.depo];
              return (
                <button key={o.depo} type="button" onClick={() => onGit('oyun')} className="flex gap-2.5 text-left min-w-0 cursor-pointer group">
                  <OyunKapagi depo={o.depo} className="w-12 h-12 rounded-lg shrink-0" />
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-semibold ${YAZI} group-hover:text-[#F26B6F] truncate`}>{o.ad}</span>
                    {d?.guncelleme && <span className={`block text-[11px] ${IKINCIL}`}>{d.guncelleme}</span>}
                    {d?.neredeyiz[0] && <span className={`block text-[11.5px] ${YAZI} line-clamp-2`}>{d.neredeyiz[0]}</span>}
                  </span>
                </button>
              );
            })}
            <div className="min-w-0">
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${IKINCIL}`}><CalendarDays className="w-3.5 h-3.5" /> Ajansta çalışılan</div>
              <ul className="mt-1 space-y-0.5">
                {calisilan.slice(0, 4).map(i => <li key={i.id} className={`text-[11.5px] ${YAZI} line-clamp-1`}>· {i.metin}</li>)}
                {!calisilan.length && <li className={`text-[11.5px] ${IKINCIL}`}>{isler ? 'Şu an çalışılan iş yok.' : '—'}</li>}
              </ul>
            </div>
          </div>
        </Kart>
        </div>
        <div className="grid gap-3 min-w-0">
          {onaylar('hidden lg:block')}
          {/* Senden beklenenler */}
          <Kart baslik={`Senden beklenenler${bekleyenler.length ? ` · ${bekleyenler.length}` : ''}`} simge={Bell} git={() => onGit('isler')}>
            {bekleyenler.length ? (
              <ul className="space-y-1">
                {bekleyenler.slice(0, 5).map(i => <li key={i.id} className={`${satir} ${YAZI} line-clamp-2`}>· {i.metin}</li>)}
                {bekleyenler.length > 5 && <li className={`text-[11px] ${IKINCIL}`}>+{bekleyenler.length - 5} iş daha</li>}
              </ul>
            ) : <p className={`${satir} ${IKINCIL}`}>{isler ? 'Senden beklenen bir şey yok.' : '—'}</p>}
          </Kart>

          {/* Bu gece */}
          <Kart baslik={`Bu gece · ${turSaati}`} simge={Bot} git={() => onGit('ajanlar')} gitAdi="Zamanlayıcı">
            {!zaman ? <p className={`${satir} ${IKINCIL}`}>—</p>
              : turKapali ? <p className={`${satir} ${IKINCIL}`}>{zaman.turAcik === false ? 'Gece turu durduruldu.' : 'Bu gece atlanıyor.'}</p>
              : (
                <ul className="flex flex-wrap gap-1.5">
                  {buGece.map(([ad, z]) => (
                    <li key={ad} className={`px-2 py-1 rounded-full text-[11px] font-semibold ${z.tur === 'kosul' ? `border border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL}` : 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8]'}`}>
                      {ajanAdi(ad)}{z.tur === 'kosul' ? ' (iş varsa)' : ''}
                    </li>
                  ))}
                </ul>
              )}
          </Kart>
        </div>
      </div>
      {galeriGunu && tur && anahtar && <Galeri anahtar={anahtar} veri={tur} gun={galeriGunu} onKapat={galeriKapat} />}
    </div>
  );
};

export default AnaSayfa;
