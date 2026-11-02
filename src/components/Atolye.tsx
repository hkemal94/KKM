import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Maximize2, Minimize2, Car, Moon, Snowflake, Layers, Check, Map as HaritaIkon, Share2, CalendarRange, GitBranch } from 'lucide-react';
import { isaretle } from '../lib/olcumler';
import type { HaritaBakisi } from './harita/DuzadaHarita';
import { ATMOSFER_KAPALI, type AtmosferAyari } from './harita/atmosferAyari';
import type { Item } from '../types';
import { SayfaBasi } from './kabuk/SayfaBasi';
import { SayfaRayi, type RayBolumu } from './SayfaRayi';
import { useHaritaDuzeni } from '../lib/haritaDuzeni';
import { useHaritaMaddesi } from './duzada/HaritaMaddesi';
import { KATMANLAR, haritaIsaretleri, katmanOku, katmanYaz, type KatmanAyari, type KatmanId } from '../lib/haritaIsaretleri';

/**
 * Atölye (4. gece, 7 Ekim; vvd'den): evrenin çalışma araçları tek bölümde.
 * Harita ve Kurucu (29 Eylül'den beri tek ekran: 2D kur, 3D bak), bağ
 * ağı ve zaman çizgisi (5. gece); soy ağacı geldiği gece raya eklendi (Kemal:
 * "görünmesin"). Düzada viki ve Evren Raporu olarak kaldı.
 * 2 Kasım (yol haritası 1. adım): Tuval kalktı.
 */
const RAY_BOLUMLERI: RayBolumu[] = [
  { id: 'harita', label: 'Harita ve Kurucu' },
  { id: 'ag', label: 'Bağ ağı' },
  { id: 'zaman', label: 'Zaman çizgisi' },
  { id: 'soy', label: 'Soy ağacı' }
];
export type AtolyeSekmesi = 'harita' | 'ag' | 'zaman' | 'soy';
/** Menüden gelinen yer: bir araç ya da başlangıç ekranı */
export type AtolyeHedefi = AtolyeSekmesi | 'giris';

/** Başlangıç ekranının kartları: aracın ne işe yaradığı (kurgu yok) */
const GIRIS_KARTLARI: Array<{ id: AtolyeSekmesi; ad: string; aciklama: string; Ikon: React.ComponentType<{ className?: string }> }> = [
  { id: 'harita', ad: 'Harita ve Kurucu', aciklama: '2D\'de yol, yapı, doğa çiz; 3D\'de adaya eğik bak.', Ikon: HaritaIkon },
  { id: 'ag', ad: 'Bağ ağı', aciklama: 'Maddeler ve aralarındaki bağlar; buradan bağ kur.', Ikon: Share2 },
  { id: 'zaman', ad: 'Zaman çizgisi', aciklama: 'Tarihli maddeler ve dönemler sırayla.', Ikon: CalendarRange },
  { id: 'soy', ad: 'Soy ağacı', aciklama: 'Ailelerin kuşakları ve akrabalık bağları.', Ikon: GitBranch }
];

// Bağ ağı (5. gece): sekme açılınca yüklenir
const BagAgi = lazy(() => import('./atolye/BagAgi').then(m => ({ default: m.BagAgi })));
// Zaman çizgisi ve dönemler (5. gece)
// Soy ağacı (6. gece)
const SoyAgaci = lazy(() => import('./atolye/SoyAgaci').then(m => ({ default: m.SoyAgaci })));
const ZamanCizgisi = lazy(() => import('./atolye/ZamanCizgisi').then(m => ({ default: m.ZamanCizgisi })));

// MapLibre haritası ~1 MB'lık bir paket (motor + arazi verisi); 3D'ye geçince indirilir
const DuzadaHarita = lazy(() =>
  import('./harita/DuzadaHarita').then(m => ({ default: m.DuzadaHarita }))
);
// Kurucu (şehir kurucu): harita verisini kullanır, sayfa açılınca yüklenir
const Kurucu = lazy(() =>
  import('./kurucu/Kurucu').then(m => ({ default: m.Kurucu }))
);

interface AtolyeProps {
  items: Item[];
  onAddItem: (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  /** Bağ ağında "Bağla" ve "Yerleşimi kaydet" */
  onUpdateItem: (item: Item) => Promise<void>;
  /** Haritadaki notu silmek (yalnız "Evet, sil" ile) */
  onDeleteItem: (id: string) => Promise<void>;
  /** Menüden doğrudan bir sekmeye gelmek için */
  istek?: { sekme: AtolyeHedefi; n: number; aile?: string } | null;
  /** Haritadan seçilen maddeyi Düzada vikisinde açar */
  onMaddeAc: (id: string) => void;
}

export default function Atolye({ items, onAddItem, onUpdateItem, onDeleteItem, istek = null, onMaddeAc }: AtolyeProps) {
  // Katmanlar ve işaretler (5. gece): 2D ve 3D ortak; katman seçimi bu tarayıcıda hatırlanır
  const [katmanlar, setKatmanlar] = useState<KatmanAyari>(katmanOku);
  const [katmanMenusu, setKatmanMenusu] = useState(false);
  const katmanDegistir = (id: KatmanId) => setKatmanlar(k => { const y = { ...k, [id]: !k[id] }; katmanYaz(y); return y; });
  const isaretler = useMemo(() => haritaIsaretleri(items), [items]);
  // Başlangıç ekranı (8 Ekim, Kemal: "Atölye'de önce başlangıç ekranı"):
  // menüden doğrudan bir araca gelinmediyse harita hemen yüklenmez
  const [sekme, setSekme] = useState<AtolyeHedefi>(istek?.sekme ?? 'giris');
  useEffect(() => { if (istek) setSekme(istek.sekme); }, [istek?.n]);
  const haritaDuzeni = useHaritaDuzeni();
  const haritaMaddesi = useHaritaMaddesi({ items, onAddItem, onMaddeAc });
  // 2D çalışma, 3D bakış (29 Eylül)
  const [haritaUc, setHaritaUc] = useState(false);
  // 2D ↔ 3D geçişinde kamera aynı yere baksın
  const haritaBakisi = useRef<HaritaBakisi | null>(null);
  const bakisiTut = useCallback((b: HaritaBakisi) => { haritaBakisi.current = b; }, []);
  // Açılış hızı (3. gece): Atölye'ye her girişte ölçüm baştan
  useEffect(() => { if (sekme === 'harita') isaretle('harita-basladi'); }, [sekme]);

  /**
   * Tam ekran (30 Eylül, Kemal: "tam ekrana geçiremiyorum"). Tarayıcı
   * destekliyorsa gerçek tam ekran; desteklemiyorsa (iPhone) harita bütün
   * pencereyi kaplar. Esc ya da düğme ile çıkılır.
   */
  const haritaKabi = useRef<HTMLDivElement>(null);

  /**
   * Trafik, saat, mevsim (30 Eylül): sitede hep açık; KKM'de bu düğmelerle.
   * Seçim bu tarayıcıda hatırlanır (kayda yazılmaz).
   */
  const [atmosfer, setAtmosfer] = useState<AtmosferAyari>(() => {
    try { return { ...ATMOSFER_KAPALI, ...JSON.parse(localStorage.getItem('kems_harita_atmosfer') || '{}') }; } catch { return ATMOSFER_KAPALI; }
  });
  const atmosferDegistir = (k: keyof AtmosferAyari) => setAtmosfer(a => {
    const y = { ...a, [k]: !a[k] };
    try { localStorage.setItem('kems_harita_atmosfer', JSON.stringify(y)); } catch { /* yok */ }
    return y;
  });
  const [tamEkran, setTamEkran] = useState(false);
  const tamEkranDegistir = useCallback(() => {
    const el = haritaKabi.current;
    if (!tamEkran) {
      setTamEkran(true);
      try { void el?.requestFullscreen?.().catch(() => { /* kaplama yeter */ }); } catch { /* yok */ }
    } else {
      setTamEkran(false);
      try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* yok */ }
    }
  }, [tamEkran]);
  useEffect(() => {
    const cikti = () => { if (!document.fullscreenElement) setTamEkran(false); };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setTamEkran(false); };
    document.addEventListener('fullscreenchange', cikti);
    window.addEventListener('keydown', tus);
    return () => { document.removeEventListener('fullscreenchange', cikti); window.removeEventListener('keydown', tus); };
  }, []);
  // Harita kutusu büyüyünce çizim yeniden ölçülsün
  useEffect(() => { const z = setTimeout(() => window.dispatchEvent(new Event('resize')), 60); return () => clearTimeout(z); }, [tamEkran]);

  const gorunumDugmesi = (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FAF8F5]/95 dark:bg-[#13204A]/95 border border-[#CFC5B4] dark:border-[#2C3C72] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)]">
      <span className="hidden sm:block px-2 text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-[#6A5E4C] dark:text-[#A6B0C9]">Düzada</span>
      {([['2d', '2D · kur'], ['3d', '3D · bak']] as const).map(([id, ad]) => (
        <button key={id} type="button" onClick={() => setHaritaUc(id === '3d')}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${(id === '3d') === haritaUc ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white' : 'text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>
          {ad}
        </button>
      ))}
      <button type="button" onClick={tamEkranDegistir} title={tamEkran ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'} aria-label={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'}
        className="ml-0.5 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#6A5E4C] dark:text-[#A6B0C9] hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer">
        {tamEkran ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{tamEkran ? 'Küçült' : 'Tam ekran'}</span>
      </button>
      <span className="relative">
        <button type="button" onClick={() => setKatmanMenusu(a => !a)} aria-expanded={katmanMenusu} title="Katmanları aç / kapa"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${katmanMenusu ? 'bg-[#F3EFE8] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8]' : 'text-[#6A5E4C] dark:text-[#A6B0C9] hover:bg-[#F3EFE8] dark:hover:bg-[#17345A]'}`}>
          <Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline">Katmanlar</span>
          {KATMANLAR.some(k => !katmanlar[k.id]) && <span className="w-1.5 h-1.5 rounded-full bg-[#F26B6F]" />}
        </button>
        {katmanMenusu && (
          <span className="absolute left-0 top-full mt-1.5 z-30 w-48 p-1.5 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] flex flex-col">
            {KATMANLAR.map(k => (
              <button key={k.id} type="button" role="menuitemcheckbox" aria-checked={katmanlar[k.id]} onClick={() => katmanDegistir(k.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-left text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer">
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${katmanlar[k.id] ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72]'}`}>
                  {katmanlar[k.id] && <Check className="w-3 h-3" />}
                </span>
                {k.ad}
                {k.id === 'notlar' && <span className="ml-auto w-2 h-2 rounded-full bg-[#C99A2E]" />}
                {k.id === 'maddeler' && <span className="ml-auto w-2 h-2 rounded-full bg-[#F26B6F]" />}
              </button>
            ))}
            <span className="px-2 pt-1 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">Yalnız görünüm; kayda yazılmaz.</span>
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <SayfaBasi baslik="Atölye" />
      <SayfaRayi baslik="Atölye" bolumler={RAY_BOLUMLERI} aktifId={sekme} onSec={id => setSekme(id as AtolyeSekmesi)} />

      {sekme === 'giris' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GIRIS_KARTLARI.map(({ id, ad, aciklama, Ikon }) => (
            <button key={id} type="button" onClick={() => setSekme(id)}
              className="group text-left p-5 rounded-2xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F] dark:hover:border-[#F26B6F] shadow-[0_8px_24px_-18px_rgba(14,28,79,0.5)] cursor-pointer transition-colors">
              <span className="w-10 h-10 rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] flex items-center justify-center text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#F26B6F]">
                <Ikon className="w-5 h-5" />
              </span>
              <span className="block mt-3 text-[15px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">{ad}</span>
              <span className="block mt-1 text-[12px] leading-relaxed text-[#6A5E4C] dark:text-[#A6B0C9]">{aciklama}</span>
            </button>
          ))}
        </div>
      )}

      {sekme === 'ag' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Ağ kuruluyor…</div>}>
          <BagAgi items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onMaddeAc={onMaddeAc} />
        </Suspense>
      )}
      {sekme === 'soy' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Soy ağacı hazırlanıyor…</div>}>
          <SoyAgaci items={items} onMaddeAc={onMaddeAc} ilkAile={istek?.sekme === 'soy' ? istek.aile ?? null : null} />
        </Suspense>
      )}
      {sekme === 'zaman' && (
        <Suspense fallback={<div className="h-48 flex items-center justify-center font-mono text-xs text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Zaman çizgisi hazırlanıyor…</div>}>
          <ZamanCizgisi items={items} onUpdateItem={onUpdateItem} onAddItem={onAddItem} onMaddeAc={onMaddeAc} />
        </Suspense>
      )}

      {/*
        HARİTA VE KURUCU (H, 29 Eylül) — tek ekran. Kemal: "Düzada Haritası
        ve Kurucu kısmını birbirine entegre et; city builder oyunlar gibi
        kontrol edebileceğim bir şey." 2D: çalışma ekranı (araçlar altta).
        3D: aynı ada eğik bakışla, yapılar kat sayısıyla yükselir.
      */}
      {sekme === 'harita' && (haritaDuzeni.ilkYukleme ? (
        <div ref={haritaKabi} className={tamEkran ? 'fixed inset-0 z-[80] bg-[#1C4E8C]' : ''}>
          <Suspense fallback={<div className="h-[80vh] flex items-center justify-center rounded-2xl bg-[#1C4E8C] font-mono text-xs text-[#F3EFE8]">Harita yükleniyor…</div>}>
            {haritaUc ? (
              <div className="relative">
                <DuzadaHarita
                  className={tamEkran ? 'h-[100dvh] overflow-hidden' : 'h-[calc(100dvh-14.5rem)] sm:h-[calc(100vh-11rem)] min-h-[460px] sm:min-h-[520px] rounded-2xl overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72]'}
                  onSelect={haritaMaddesi.ac}
                  duzen={haritaDuzeni.duzen}
                  bakis={haritaBakisi.current}
                  onBakis={bakisiTut}
                  atmosfer={atmosfer}
                  isaretler={isaretler}
                  katmanlar={katmanlar}
                />
                <div className="absolute left-3 top-3 z-10">{gorunumDugmesi}</div>
                {/* Atmosfer düğmeleri sol altta: üstteki ada kartıyla çakışmasın */}
                <div className="absolute left-3 bottom-3 z-10">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FAF8F5]/95 dark:bg-[#13204A]/95 border border-[#CFC5B4] dark:border-[#2C3C72] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)]">
                    {([['trafik', 'Trafik', Car], ['saat', 'Saat', Moon], ['mevsim', 'Mevsim', Snowflake]] as const).map(([k, ad, Ikon]) => (
                      <button key={k} type="button" onClick={() => atmosferDegistir(k)} aria-pressed={atmosfer[k]} aria-label={ad}
                        title={k === 'trafik' ? 'Araçlar, tekneler, feribot' : k === 'saat' ? 'Gerçek saate göre gündüz / gece' : 'Takvime göre yaz / kış'}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer ${atmosfer[k] ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white' : 'text-[#6A5E4C] dark:text-[#A6B0C9]'}`}>
                        <Ikon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{ad}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Kurucu
                className={tamEkran ? 'h-[100dvh] !rounded-none !border-0' : 'h-[calc(100dvh-14.5rem)] sm:h-[calc(100vh-11rem)] min-h-[460px] sm:min-h-[520px]'}
                duzen={haritaDuzeni.duzen}
                kaydet={haritaDuzeni.kaydet}
                durum={haritaDuzeni.durum}
                items={items}
                onMaddeAc={onMaddeAc}
                ustSol={gorunumDugmesi}
                bakis={haritaBakisi.current}
                onBakis={bakisiTut}
                katmanlar={katmanlar}
                isaretler={isaretler}
                onAddItem={onAddItem}
                onUpdateItem={onUpdateItem}
                onDeleteItem={onDeleteItem}
              />
            )}
          </Suspense>
        </div>
      ) : (
        <div className="h-[80vh] flex items-center justify-center rounded-2xl bg-[#1C4E8C] font-mono text-xs text-[#F3EFE8]">Kayıtlı düzen okunuyor…</div>
      ))}

      {haritaMaddesi.kutu}
    </div>
  );
}
