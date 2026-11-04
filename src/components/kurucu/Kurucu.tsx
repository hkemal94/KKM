import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isaretle } from '../../lib/olcumler';
import { Eraser, Hand, MousePointer2, PenLine, Redo2, Undo2, Check, X, Eye, EyeOff, Home, LayoutGrid, RotateCcw, RotateCw, MapPinned, Pentagon, TreePine, Link2, Minus, Plus, ExternalLink, Blocks, Shuffle, StickyNote, Trash2, Move } from 'lucide-react';
import type { Item } from '../../types';
import { DEM_SINIR } from '../../data/duzadaDem';
import { ANIT_KALIPLARI, kalipBul, kalibiYerlestir, alan, merkez as cokgenMerkezi, yolCokgeneBiniyor } from './anitKaliplari';
import { belgelerAyniMi, belgeFarklari } from './kurucuHarita';
import { DOKULAR, dokuBul, mahalleDoldur, yolYariEni, type DokuTuru, type DoldurAlani } from './mahalleDoldur';
import type { KurucuBelge } from '../harita/duzenTipi';
import { kurucuEvMi } from '../../lib/evSakinleri';
import { anahtariOku } from '../../lib/oyunAyarlari';
import {
  bagsizGizle, artikBaglar, artiklariTemizle, ciftBaglar,
  haritaOnerileriniOku, oneriDurumu, onerileriUygula, bagOnerisiDurumu, bagOnerileriniUygula, yokSay, yokSayilanlar,
  type HaritaOnerileri, type HaritaOnerisi, type OneriDurumu, type BagOnerisi, type OturanOnerisi
} from '../../lib/kurucuBaglari';
import { kisiMi } from '../../lib/adaSakini';
import { DUZADA_GEO } from '../../data/duzadaGeo';
import type { HaritaBakisi } from '../harita/DuzadaHarita';
import { duzeniUygula, bosDuzen, type HaritaDuzeni } from '../harita/duzenKatmani';
import { catmullRom, type Nokta } from '../harita/sinirBolgeleri';
import type { KayitDurumu } from '../../lib/haritaDuzeni';
import { KATMANLAR_ACIK, notKaydi, notGuncelle, maddeIsareti, type KatmanAyari, type HaritaIsareti } from '../../lib/haritaIsaretleri';
import {
  YOL_TURLERI, turBilgisi, belgedenTaslak, taslaktanBelge, 
  zeminCikar, yollariKur, yapistir, cakisanParcalariAyir, yeniEvArsalari, yeniYolId, derceye, metreye, uzunluk, karadaMi, DOGA_TURLERI, sadelestir,
  binalariKur, binaKonabilirMi, hattaUzaklik, parcaCikar, merkezi, etrafindaTasi,
  type KurucuTaslak, type KurucuYol, type KurucuBina, type Yapisma, type YolTuru, type Cati, type DogaTuru, type BinaDuzeltme
} from './kurucuTipi';
import {
  BINA_TURLERI, SABLONLAR, binaBilgisi, binaKoseleri, hatBoyuBinalar, sablonuYerlestir,
  type BinaTuru, type SablonCikti
} from './kurucuSablonlari';

/**
 * Kurucu — Düzada'nın şehir kurucusu (1. adım: yol aracı · 2. adım: bina
 * aracı ve hazır mahalle şablonları).
 *
 * Üstten plan. Açılışta bugünkü haritayı (elle yapılan düzen dahil) gösterir.
 * Her çizim bir TASLAK'a yazılır; harita değişmez. "Haritaya işle" sonraki
 * adımda gelecek.
 *
 * Araçlar:
 *   - Gez: sürükle-kaydır, tekerlek / düğmelerle yakınlaş
 *   - Seç: yola dokun → türünü değiştir, taslaktan kaldır / geri getir
 *   - Yol çiz: türü seç, noktaları tıkla; kavşağa ve yola yapışır.
 *     Bitir: Enter ya da çift tık · Vazgeç: Esc · son noktayı sil: ⌫
 *   - Bina: türü seç, dokun; yola yakınsa yola dönük oturur
 *   - Şablon: hazır mahalle dokusu; döndür, büyüt, dokunduğun yere yerleşir
 *   - Seç → yol → "Kenarını evlerle doldur"
 * Geri al / yinele: düğmeler ya da Ctrl+Z / Ctrl+Y.
 */

type Arac = 'gez' | 'sec' | 'ciz' | 'bina' | 'sablon' | 'doldur' | 'ozel' | 'doga' | 'bagla' | 'not' | 'sil';

interface KurucuProps {
  duzen: HaritaDuzeni | null;
  kaydet: (d: HaritaDuzeni) => Promise<void>;
  durum: KayitDurumu;
  /**
   * "Haritaya işle"de haritanın önceki Kurucu hâli buraya verilir; Düzada
   * onu arşivli bir kayıt olarak saklar (hiçbir şey silinmez).
   */
  arsivle?: (onceki: KurucuBelge) => Promise<void>;
  className?: string;
  /** Madde bağlama için viki maddeleri (H, 29 Eylül) */
  items?: Item[];
  /** "Maddeyi aç" */
  onMaddeAc?: (id: string) => void;
  /** Sol üstte gösterilecek başlık / görünüm düğmesi (Düzada verir) */
  ustSol?: React.ReactNode;
  /** 2D ↔ 3D geçişinde aynı yere bakmak için (Düzada tutar) */
  bakis?: HaritaBakisi | null;
  onBakis?: (b: HaritaBakisi) => void;
  /** Görünen katmanlar (5. gece; Atölye tutar, 3D ile ortak) */
  katmanlar?: KatmanAyari;
  /** Not ve madde işaretleri (5. gece) */
  isaretler?: HaritaIsareti[];
  /** Not kaydı açmak, notu / maddenin işaretini değiştirmek, notu silmek (yalnız düğmeyle) */
  onAddItem?: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem?: (item: Item) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}

interface Gorunum { x: number; y: number; w: number }

/** MapLibre'de yakınlık 0'da bir pikselin ekvatordaki metresi (512 px karo) */
const EKVATOR_MPP = 78271.517;

const egri = (k: Nokta[]) => catmullRom(k, false, 6);

/** Haritadan gelen arazilerin 2D rengi (8 Ekim) */
const ARAZI_RENGI: Record<string, { renk: string; kenar: string }> = {
  zeytinlik: { renk: '#8FA25E', kenar: '#4F6334' },
  tarla: { renk: '#E3D3A0', kenar: '#8C7748' },
  'bağ': { renk: '#B8C27A', kenar: '#66702F' },
  saha: { renk: '#6E9A4E', kenar: '#FAF8F5' },
  teras: { renk: '#E9E1D0', kenar: '#9C8768' },
  meydan: { renk: '#E9E1D0', kenar: '#9C8768' }
};
/** Düz dolgu, kesik çizgi yok: yapılaşmış zemin */
const DUZ_ZEMIN = new Set(['saha', 'teras', 'meydan']);
const yolYolu = (m: Nokta[]) =>
  m.length ? 'M' + m.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') : '';
/** Parçası silinmiş yol birden çok çizgidir */
const parcaYolu = (y: { parcalar: Nokta[][] }) => y.parcalar.map(yolYolu).join('');
const halkaYolu = (h: Nokta[][]) =>
  h.map(r => 'M' + r.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join('L') + 'Z').join('');

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function Kurucu({ duzen, kaydet, durum, arsivle, className, items = [], onMaddeAc, ustSol, bakis, onBakis, katmanlar, isaretler = [], onAddItem, onUpdateItem, onDeleteItem }: KurucuProps) {
  const katman = katmanlar ?? KATMANLAR_ACIK;
  // ---- veri -------------------------------------------------------------------
  // Zemin bugünkü haritadır; Kurucu açıkken harita düzeni değişse bile zemin
  // açılıştaki hâlde kalır (çizerken altındaki yolların kaymaması için).
  // Haritaya işlenmiş Kurucu katmanı zemine katılmaz: o zaten taslakta.
  const [zemin] = useState(() => zeminCikar(duzeniUygula(DUZADA_GEO, duzen, { kurucuHaric: true })));

  // Geri al / yinele: taslağın her hâli sırayla saklanır (en fazla 100)
  const [tarihce, setTarihce] = useState<{ hal: KurucuTaslak[]; i: number }>(
    () => ({ hal: [belgedenTaslak(duzen?.kurucu ?? duzen?.kurucuIslenen)], i: 0 })
  );
  const taslak = tarihce.hal[tarihce.i];
  const gecmis = tarihce.hal;
  const adim = tarihce.i;

  const degistir = useCallback((f: (t: KurucuTaslak) => KurucuTaslak) => {
    setTarihce(({ hal, i }) => {
      const yeni = [...hal.slice(0, i + 1), f(hal[i])].slice(-100);
      return { hal: yeni, i: yeni.length - 1 };
    });
  }, []);

  const geriAl = useCallback(() => setTarihce(t => ({ ...t, i: Math.max(0, t.i - 1) })), []);
  const yinele = useCallback(() => setTarihce(t => ({ ...t, i: Math.min(t.hal.length - 1, t.i + 1) })), []);

  const yollar = useMemo(() => yollariKur(zemin, taslak, egri), [zemin, taslak]);
  const binalar = useMemo(() => binalariKur(zemin, taslak, binaKoseleri), [zemin, taslak]);
  // Evlerin arsaları (8 Ekim, Kemal: "2D'de bahçelerin görüntüsü bulunmuyor"):
  // ev taşınınca, dönünce, kaldırılınca arsası da onunla
  const evMerkezleri = useMemo(() => new Map(zemin.binalar.map(b => {
    const h = b.halka.length > 1 && b.halka[0][0] === b.halka[b.halka.length - 1][0]
      && b.halka[0][1] === b.halka[b.halka.length - 1][1] ? b.halka.slice(0, -1) : b.halka;
    return [b.id, merkezi(h)] as const;
  })), [zemin]);
  const arsalar = useMemo(() => {
    const ev = new Map<string, KurucuBina>(binalar.map(b => [b.id, b]));
    return zemin.arsalar.flatMap(a => {
      const b = ev.get(a.ev);
      if (!b) return [];
      const d = b.duzeltme, c = evMerkezleri.get(a.ev);
      return [{ id: a.id, ev: a.ev, gizli: b.gizli, k: d && c ? etrafindaTasi(a.halka, c, d.dx, d.dy, d.aci) : a.halka }];
    }).concat(
      // Kurucu'da konan evlerin arsası (8 Ekim): haritadaki gibi bahçeli
      yeniEvArsalari(binalar.filter(b => b.yeni && !b.gizli), yollar.filter(y => !y.gizli).flatMap(y => y.parcalar))
        .map(a => ({ id: a.id, ev: a.ev, gizli: false, k: a.halka }))
    );
  }, [zemin, binalar, evMerkezleri, yollar]);

  /**
   * Tek parça yapılar (30 Eylül, Kemal: "otel binasının kulelerini otele
   * entegre et, ayrı olarak oynatmak istemiyorum"). Grubun her parçası
   * birlikte seçilir, taşınır, döner, kaldırılır. İlk kimlik grubun başı:
   *   - The Imperial Kemsköy + Batı ve Doğu kuleleri
   *   - Dirlik Stadı (ana tribün, açık tribün, soyunma, ışık direkleri) +
 *     çevresine Kurucu'da konan tribün ve sahalar
   *   - Çiftlik kompleksleri: ev, ahır, depo (`ciftlik_<arazi>_<parça>`)
   */
  const gruplar = useMemo(() => {
    const g = new Map<string, string[]>();
    const kur = (uyeler: string[]) => { if (uyeler.length > 1) uyeler.forEach(u => g.set(u, uyeler)); };
    const var_ = new Set(binalar.map(b => b.id));
    kur(['bina_imperial', 'bina_imperial_kule_bati', 'bina_imperial_kule_dogu'].filter(i => var_.has(i)));
    // Stat (2 Ekim): ana tribün başta; öbür tribün, soyunma, ışık direkleri
    const stad = binalar.find(b => b.id === 'bina_stad_tribun');
    if (stad) kur(['bina_stad_tribun', ...binalar.filter(b => b.id !== 'bina_stad_tribun' && (b.id.startsWith('bina_stad_')
      || (b.yeni && (b.tur === 'tribun' || b.tur === 'saha') && Math.hypot(b.m[0] - stad.m[0], b.m[1] - stad.m[1]) < 180))).map(b => b.id)]);
    const ciftlik = new Map<string, string[]>();
    for (const b of binalar) {
      const e = /^ciftlik_(\d+)_\d+$/.exec(b.id);
      if (e) ciftlik.set(e[1], [...(ciftlik.get(e[1]) ?? []), b.id]);
    }
    ciftlik.forEach(kur);
    return g;
  }, [binalar]);
  /** Yapının grubu (tek başınaysa kendisi) ve grubun başı */
  const grubu = useCallback((id: string) => gruplar.get(id) ?? [id], [gruplar]);
  const lider = useCallback((id: string) => grubu(id)[0], [grubu]);

  // ---- kayıt ----------------------------------------------------------------
  // 2 Ekim gece: her değişiklikten 1 sn sonra bütün harita kaydı yeniden
  // yazılıyordu; veritabanının günlük yazma kotası (belge boyutuna göre
  // sayılıyor) bu yüzden doldu. Artık değişiklikler 20 sn birikir, tek
  // seferde yazılır; Kurucu kapanınca, sekme arka plana geçince ya da sayfa
  // kapanırken bekleyen kayıt hemen gönderilir.
  const ilkTaslak = useRef(taslak);
  const sonDuzen = useRef(duzen);
  useEffect(() => { sonDuzen.current = duzen; }, [duzen]);
  // Açılış hızı (3. gece): Kurucu'nun ilk çizimi bittiğinde
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => isaretle('harita-hazir'))); }, []);
  const bekleyenTaslak = useRef<KurucuTaslak | null>(null);
  const bekleyeniGonder = useCallback(() => {
    const t = bekleyenTaslak.current;
    if (!t) return;
    bekleyenTaslak.current = null;
    const d = sonDuzen.current ?? bosDuzen();
    void kaydet({ ...d, guncelleme: Date.now(), kurucu: taslaktanBelge(t) });
  }, [kaydet]);
  useEffect(() => {
    if (taslak === ilkTaslak.current) return;
    bekleyenTaslak.current = taslak;
    const zaman = setTimeout(bekleyeniGonder, 20000);
    return () => clearTimeout(zaman);
  }, [taslak, bekleyeniGonder]);
  useEffect(() => {
    const gizlenince = () => { if (document.visibilityState === 'hidden') bekleyeniGonder(); };
    document.addEventListener('visibilitychange', gizlenince);
    window.addEventListener('pagehide', bekleyeniGonder);
    return () => {
      document.removeEventListener('visibilitychange', gizlenince);
      window.removeEventListener('pagehide', bekleyeniGonder);
      bekleyeniGonder();
    };
  }, [bekleyeniGonder]);

  // ---- görünüm ----------------------------------------------------------------
  const kutu = useRef<HTMLDivElement>(null);
  const [boyut, setBoyut] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = kutu.current;
    if (!el) return;
    const g = new ResizeObserver(() => setBoyut({ w: el.clientWidth, h: el.clientHeight }));
    g.observe(el);
    return () => g.disconnect();
  }, []);

  // Adayı kutuya sığdırır (en ve boy), ortalar
  const sigdir = useCallback((kw: number, kh: number): Gorunum => {
    const xs = zemin.ada.flat().map(p => p[0]);
    const ys = zemin.ada.flat().map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const aw = (maxX - minX) * 1.08, ah = (maxY - minY) * 1.08;
    const w = Math.max(aw, ah * (kw / Math.max(kh, 1)));
    const hh = w * (kh / Math.max(kw, 1));
    return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - hh / 2, w };
  }, [zemin]);
  const [gorunum, setGorunum] = useState<Gorunum>(() => sigdir(800, 600));
  const sigdi = useRef(false);
  const ilkBakis = useRef(bakis ?? null);
  useEffect(() => {
    if (sigdi.current || boyut.w < 50 || boyut.h < 50) return;
    const el = kutu.current;
    if (!el || el.clientWidth !== boyut.w) return;
    sigdi.current = true;
    // 3D'den gelindiyse aynı yere bak; yoksa bütün ada
    const b = ilkBakis.current;
    if (b) {
      const cosE = Math.cos((b.merkez[1] * Math.PI) / 180);
      const w = Math.min(Math.max((EKVATOR_MPP * cosE / 2 ** b.zoom) * boyut.w, 60), 40000);
      const m = metreye(b.merkez);
      setGorunum({ x: m[0] - w / 2, y: m[1] - (w * boyut.h / boyut.w) / 2, w });
    } else {
      setGorunum(sigdir(boyut.w, boyut.h));
    }
  }, [boyut, sigdir]);
  const olcek = boyut.w / gorunum.w; // piksel / metre
  const h = boyut.h / olcek;

  // Baktığı yeri Düzada'ya bildir (3D açılınca oradan başlasın)
  useEffect(() => {
    if (!sigdi.current || !onBakis) return;
    const merkez = derceye([gorunum.x + gorunum.w / 2, gorunum.y + h / 2]) as [number, number];
    const cosE = Math.cos((merkez[1] * Math.PI) / 180);
    onBakis({ merkez, zoom: Math.log2((EKVATOR_MPP * cosE * boyut.w) / gorunum.w) });
  }, [gorunum, h, boyut.w, onBakis]);

  const ekrandanMetre = useCallback((cx: number, cy: number): Nokta => {
    const r = kutu.current!.getBoundingClientRect();
    return [gorunum.x + (cx - r.left) / olcek, gorunum.y + (cy - r.top) / olcek];
  }, [gorunum, olcek]);

  const yakinlas = useCallback((kat: number, merkez?: Nokta) => {
    setGorunum(g => {
      const w = Math.min(Math.max(g.w * kat, 60), 40000);
      const m = merkez ?? [g.x + g.w / 2, g.y + (boyut.h / (boyut.w / g.w)) / 2];
      const oran = w / g.w;
      return { x: m[0] - (m[0] - g.x) * oran, y: m[1] - (m[1] - g.y) * oran, w };
    });
  }, [boyut]);

  // ---- araçlar ----------------------------------------------------------------
  const [arac, setArac] = useState<Arac>('gez');
  const [cizTur, setCizTur] = useState<YolTuru>('sokak');
  const [cizilen, setCizilen] = useState<Nokta[]>([]); // metre
  const [imlec, setImlec] = useState<Nokta | null>(null);
  const [yapisma, setYapisma] = useState<Yapisma | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  // Kaldırılanlar yalnız istenince ya da Kaldır aracındayken görünür
  // (2 Ekim, Kemal: "sildiklerim neden görünmeye devam ediyor?")
  const [kaldirilanAcik, setGizliGoster] = useState(false);
  const gizliGoster = kaldirilanAcik || arac === 'sil';
  const [uyari, setUyari] = useState<string | null>(null);
  const [binaTur, setBinaTur] = useState<BinaTuru>('ev');
  const [sablonId, setSablonId] = useState(SABLONLAR[0].id);
  const [sablonAci, setSablonAci] = useState(0); // derece
  const [sablonOlcek, setSablonOlcek] = useState(1);
  const sablonHam = useMemo(() => SABLONLAR.find(x => x.id === sablonId)!.uret(), [sablonId]);
  useEffect(() => {
    if (!uyari) return;
    const z = setTimeout(() => setUyari(null), 2200);
    return () => clearTimeout(z);
  }, [uyari]);

  // ---- özel yapı, doğa, madde bağı (H, 29 Eylül) ------------------------------
  const [ozelKat, setOzelKat] = useState(3);
  const [ozelCati, setOzelCati] = useState<Cati>('duz');
  const [kalipId, setKalipId] = useState<string | null>(null);
  const [kalipAci, setKalipAci] = useState(0); // derece
  const [dogaTur, setDogaTur] = useState<DogaTuru>('zeytinlik');
  const [cokgen, setCokgen] = useState<Nokta[]>([]); // metre; özel yapı / doğa çizimi
  const [baglaArama, setBaglaArama] = useState('');
  const [oturanArama, setOturanArama] = useState('');
  useEffect(() => { setOturanArama(''); }, [secili]);
  /** Sürüklenen köşe: özel yapının köşesi, bırakılınca taslağa yazılır */
  const [surukKose, setSurukKose] = useState<{ id: string; i: number; m: Nokta } | null>(null);
  /**
   * Sürüklenen yol noktası (30 Eylül, Kemal: "yapılı bir yolla ilgili
   * düzenleme yapamıyorum"). parca 'k': yeni yolun kontrol noktası.
   */
  const [surukYol, setSurukYol] = useState<{ id: string; parca: number | 'k'; i: number; m: Nokta; bas?: Nokta } | null>(null);
  /** Dokunulup bırakılan yol noktası: silinmek üzere seçili (30 Eylül) */
  const [seciliNokta, setSeciliNokta] = useState<{ id: string; parca: number | 'k'; i: number } | null>(null);
  useEffect(() => { setSeciliNokta(null); }, [secili]);
  /**
   * Toplu kaldırma (2 Ekim, Kemal: "bir yeri silerken tek tek uğraşmak
   * zorunda kalıyorum"): Kaldır aracında "Alanla" seçiliyken parmakla
   * dikdörtgen çizilir; içindeki yapılar ve yol parçaları tek adımda kalkar.
   */
  const [silAlanla, setSilAlanla] = useState(false);
  const [silAlani, setSilAlani] = useState<{ bas: Nokta; son: Nokta } | null>(null);
  /**
   * Toplu taşıma (2 Ekim akşam, Kemal: "toplu taşıma da koy"): Seç aracında
   * "Alanla" seçiliyken dikdörtgenle seçilen yapılar ve tamamen içinde kalan
   * yollar birlikte sürüklenir; tek "Geri al" adımı.
   */
  const [secAlanla, setSecAlanla] = useState(false);
  /**
   * Yol mıknatısı (2 Ekim akşam, Kemal: "yollara mıknatıs ekle ki kavşak
   * yapımı kolay olsun"): çizerken ve yol noktasını sürüklerken başka bir
   * yolun köşesine ya da üstüne yapışır; telefonda yakalama alanı geniş.
   * Yolun ortasına yapışınca o yola da nokta eklenir: gerçek kavşak olur.
   */
  const [miknatis, setMiknatis] = useState(true);
  const dokunmatik = useRef(false);
  /** Çizim sırasında yolların üstüne yapışan noktalar: bitince kavşak olur */
  const [kavsakAdaylari, setKavsakAdaylari] = useState<Array<{ yolId: string; q: Nokta }>>([]);
  const [coklu, setCoklu] = useState<{ x0: number; y0: number; x1: number; y1: number; binalar: string[]; yollar: string[] } | null>(null);
  const [surukCoklu, setSurukCoklu] = useState<{ bas: Nokta; m: Nokta } | null>(null);
  /**
   * Bekleyen yerleşim (2 Ekim, Kemal: "tıklandıktan sonra döndürme ve
   * büyütme olmuyor, vazgeç yapamıyorum"): şablon ve kalıp dokununca hemen
   * konmaz; yerinde taslak olarak bekler, Yön / Boyut onu çevirir,
   * "Yerleştir" ya da "Vazgeç" ile biter. Başka yere dokununca taşınır.
   */
  const [bekleyen, setBekleyen] = useState<Nokta | null>(null);
  /**
   * Mahalle doldur (2 Ekim gece, watabou sonrası 3. paket): dikdörtgen
   * çizilir, içindeki sokakların iki yanına seçilen dokuyla evler dizilir.
   * Sonuç taslak olarak bekler; "Yerleştir" ya da "Vazgeç".
   */
  const [doldurAlani, setDoldurAlani] = useState<DoldurAlani | null>(null);
  const [doku, setDoku] = useState<DokuTuru>('bitisik');
  const [tohum, setTohum] = useState(1);
  /**
   * İşaretler (5. gece): Not aracıyla konan serbest not, listeden sürüklenen
   * madde. `yerlestirilen`: dokun-bırak (telefonda sürükleme yok) ya da
   * notu taşıma; sonraki dokunuşta yerine konur.
   */
  const [notTaslagi, setNotTaslagi] = useState<{ m: Nokta; baslik: string; metin: string } | null>(null);
  const [seciliIsaret, setSeciliIsaret] = useState<string | null>(null);
  const [isaretDuzen, setIsaretDuzen] = useState<{ baslik: string; metin: string } | null>(null);
  const [silOnayi, setSilOnayi] = useState(false);
  const [yerlestirilen, setYerlestirilen] = useState<{ maddeId?: string; notId?: string } | null>(null);
  const [isaretYaziliyor, setIsaretYaziliyor] = useState(false);
  const [maddeAra, setMaddeAra] = useState('');
  // Telefonda liste haritayı örtmesin: kapalı başlar
  const [maddeListesiAcik, setMaddeListesiAcik] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  /** Sürüklenen yapı (30 Eylül, Kemal: "binaları taşıyabilmek isterim") */
  const [surukBina, setSurukBina] = useState<{ id: string; bas: Nokta; m: Nokta } | null>(null);

  const ozelYapilar = useMemo(() => (Object.entries(taslak.ozelYapilar) as Array<[string, KurucuTaslak['ozelYapilar'][string]]>).map(([id, o]) => {
    const k = o.koseler.map(metreye);
    return { id, ...o, m: k, gizli: taslak.gizlenen.includes(id) };
  }), [taslak.ozelYapilar, taslak.gizlenen]);
  const dogaAlanlari = useMemo(() => (Object.entries(taslak.doga) as Array<[string, KurucuTaslak['doga'][string]]>).map(([id, d]) => ({ id, tur: d.tur, m: d.koseler.map(metreye) })), [taslak.doga]);

  /** Yapı yolun üstüne biniyorsa o yolun adı (yoksa null) */
  const ustundekiYol = useCallback((k: Nokta[]) =>
    yollar.find(y => !y.gizli && y.parcalar.some(h => yolCokgeneBiniyor(h, k))) ?? null, [yollar]);

  /** Özel yapı / doğa çokgenini kapatır ve taslağa yazar */
  const cokgeniBitir = useCallback((k: Nokta[] = cokgen) => {
    if (k.length < 3) { setUyari('En az üç köşe gerekir.'); return; }
    if (arac === 'ozel') {
      const yol = ustundekiYol(k);
      if (yol) { setUyari(`Yapı yolun üstüne biniyor (${yol.ad}). Köşeleri yoldan uzağa koy ya da önce yolu Kaldır.`); return; }
      degistir(t => ({ ...t, ozelYapilar: { ...t.ozelYapilar, [yeniYolId(t.ozelYapilar, 'kurucu_ozel')]: { koseler: k.map(derceye), kat: ozelKat, cati: ozelCati } } }));
      setUyari(`Özel yapı kondu · ${Math.round(alan(k))} m² · ${ozelKat} kat`);
    } else {
      degistir(t => ({ ...t, doga: { ...t.doga, [yeniYolId(t.doga, 'kurucu_doga')]: { tur: dogaTur, koseler: k.map(derceye) } } }));
    }
    setCokgen([]);
  }, [cokgen, arac, ozelKat, ozelCati, dogaTur, degistir, ustundekiYol]);

  const kalibiKoy = useCallback((m: Nokta) => {
    const k = kalipBul(kalipId ?? undefined);
    if (!k) return;
    const koseler = kalibiYerlestir(k, m, (kalipAci * Math.PI) / 180);
    if (!koseler.every(p => karadaMi(p, zemin.ada))) { setUyari('Kalıp denize taşıyor — karada daha geniş bir yer seç.'); return; }
    const yol = ustundekiYol(koseler);
    if (yol) { setUyari(`Kalıp yolun üstüne biniyor (${yol.ad}). Yolun yanına koy ya da yönünü çevir.`); return; }
    degistir(t => ({ ...t, ozelYapilar: { ...t.ozelYapilar, [yeniYolId(t.ozelYapilar, 'kurucu_ozel')]: { koseler: koseler.map(derceye), kat: k.kat, cati: 'duz', kalip: k.id } } }));
    setUyari(`${k.ad} kondu · ${k.kat} kat. Seç ile katını, köşelerini ve yönünü değiştirebilirsin.`);
  }, [kalipId, kalipAci, zemin.ada, degistir, ustundekiYol]);

  const ozelDegistir = (id: string, f: (o: KurucuTaslak['ozelYapilar'][string]) => KurucuTaslak['ozelYapilar'][string]) =>
    degistir(t => t.ozelYapilar[id] ? { ...t, ozelYapilar: { ...t.ozelYapilar, [id]: f(t.ozelYapilar[id]) } } : t);

  const ozelDondur = (id: string, derece: number) => ozelDegistir(id, o => {
    const k = o.koseler.map(metreye);
    const c = cokgenMerkezi(k);
    const a = (derece * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    return { ...o, koseler: k.map(([x, y]) => derceye([c[0] + (x - c[0]) * co - (y - c[1]) * si, c[1] + (x - c[0]) * si + (y - c[1]) * co])) };
  });

  /** Kurucu'da konan özel yapı ve doğa alanı taslaktan silinir (kural: silme var) */
  const taslaktanSil = (id: string) => degistir(t => {
    const oz = { ...t.ozelYapilar }; delete oz[id];
    const dg = { ...t.doga }; delete dg[id];
    const bg = { ...t.baglar }; delete bg[id];
    return { ...t, ozelYapilar: oz, doga: dg, baglar: bg };
  });

  const bagla = (yapiId: string, maddeId: string | null) => degistir(t => {
    const bg = { ...t.baglar };
    if (maddeId) bg[yapiId] = maddeId; else delete bg[yapiId];
    return { ...t, baglar: bg };
  });

  /** Eve oturan ekle / çıkar (3 Kasım): taslağa girer, Kurucu'nun öteki işleri gibi kaydedilir */
  const oturanDegistir = (evId: string, kisiId: string, ekle: boolean) => degistir(t => {
    const o = { ...t.oturanlar };
    const liste = (o[evId] ?? []).filter(x => x !== kisiId);
    if (ekle) liste.push(kisiId);
    if (liste.length) o[evId] = liste; else delete o[evId];
    return { ...t, oturanlar: o };
  });

  // ---- işaretler (5. gece) ----------------------------------------------------
  const isaretSec = (id: string | null) => {
    setSeciliIsaret(id); setNotTaslagi(null); setIsaretDuzen(null); setSilOnayi(false); setSecili(null);
  };
  const isaretYaz = async (f: () => Promise<void>, tamam?: string) => {
    setIsaretYaziliyor(true);
    try { await f(); if (tamam) setUyari(tamam); } catch { setUyari('Kaydedilemedi; yeniden dene.'); }
    finally { setIsaretYaziliyor(false); }
  };
  const notuKaydet = () => {
    const n = notTaslagi;
    if (!n || !onAddItem || (!n.baslik.trim() && !n.metin.trim())) return;
    void isaretYaz(async () => { await onAddItem(notKaydi(derceye(n.m) as [number, number], n.baslik, n.metin)); setNotTaslagi(null); }, 'Not kaydedildi.');
  };
  /**
   * Bırakma (sürükle-bırak ya da dokun-bırak): madde bir yapının üstüne
   * bırakılırsa yapıya bağlanır (taslağa, Kurucu'nun öteki işleri gibi);
   * boş yere bırakılırsa maddenin işareti olur (maddenin kaydına yazılır).
   * Not taşınıyorsa notun yeri değişir.
   */
  const yerlestir = async (h: { maddeId?: string; notId?: string }, cx: number, cy: number) => {
    setYerlestirilen(null);
    const m = ekrandanMetre(cx, cy);
    const altta = document.elementsFromPoint(cx, cy);
    const oz = altta.map(el => el.closest('[data-ozel]')).find(Boolean);
    const bn = altta.map(el => el.closest('[data-bina]')).find(Boolean);
    const yapiId = oz ? oz.getAttribute('data-ozel') : bn ? bn.getAttribute('data-bina') : null;
    if (h.notId) {
      const not = items.find(i => i.id === h.notId);
      if (!not || !onUpdateItem) return;
      if (!karadaMi(m, zemin.ada)) { setUyari('Not denize konamaz.'); return; }
      await isaretYaz(() => onUpdateItem(notGuncelle(not, { konum: derceye(m) as [number, number] })), 'Notun yeri değişti.');
      return;
    }
    const madde = h.maddeId ? items.find(i => i.id === h.maddeId) : undefined;
    if (!madde) return;
    if (yapiId) {
      bagla(yapiId, madde.id);
      // Yapıya bağlanan maddenin ayrı iğnesi kalkar (iki yerde görünmesin)
      if (madde.metadata?.haritaIsareti && onUpdateItem) await isaretYaz(() => onUpdateItem(maddeIsareti(madde, null)));
      setUyari(`${madde.title} yapıya bağlandı.`);
      return;
    }
    if (!karadaMi(m, zemin.ada)) { setUyari('İşaret denize konamaz — karada bir yere bırak.'); return; }
    if (!onUpdateItem) return;
    await isaretYaz(() => onUpdateItem(maddeIsareti(madde, derceye(m) as [number, number])), `${madde.title} haritaya işaretlendi.`);
  };
  /** Bağlanabilecek viki maddeleri: yerler, mekânlar, kurumlar */
  const baglanabilir = useMemo(() => items.filter(i => !i.archived && !i.isProposal
    && ['yer', 'cadde', 'meydan', 'yer_adi', 'mekân', 'dükkân', 'kulüp', 'marka', 'oda'].includes(i.type)), [items]);
  const maddeAdi = (id?: string | null) => (id ? items.find(i => i.id === id)?.title : undefined);
  /** Eve oturan olarak eklenebilecek kişi maddeleri */
  const evKisileri = useMemo(() => items.filter(i => !i.archived && !i.isProposal && kisiMi(i)), [items]);

  // ---- viki bağlarının denetimi ve ajansın önerileri (4 Kasım) ----------------
  const varOlanlar = useMemo(() => new Set<string>([
    ...binalar.map(b => b.id), ...ozelYapilar.map(o => o.id), ...dogaAlanlari.map(d => d.id), ...yollar.map(y => y.id)
  ]), [binalar, ozelYapilar, dogaAlanlari, yollar]);
  const artik = useMemo(() => artikBaglar(taslak, varOlanlar), [taslak, varOlanlar]);
  const cift = useMemo(() => ciftBaglar(taslak, [
    ...binalar.filter(b => !b.gizli).map(b => ({ id: b.id, wikiId: b.wikiId })),
    ...ozelYapilar.filter(o => !o.gizli).map(o => ({ id: o.id }))
  ], lider), [taslak, binalar, ozelYapilar, lider]);
  const artiklariSil = () => {
    const n = artik.length;
    degistir(t => artiklariTemizle(t, artikBaglar(t, varOlanlar)));
    setUyari(`${n} artık bağ kaldırıldı. Geri al ile döner.`);
  };
  /** Ajansın harita önerileri: açılışta bir kez okunur (yalnız okuma; dosya yoksa panel çıkmaz) */
  const [ajansOnerileri, setAjansOnerileri] = useState<HaritaOnerileri | null>(null);
  const [yokSayilan, setYokSayilan] = useState<Set<string>>(yokSayilanlar);
  const [denetimAcik, setDenetimAcik] = useState(false);
  useEffect(() => {
    const anahtar = anahtariOku();
    if (!anahtar) return;
    let iptal = false;
    void haritaOnerileriniOku(anahtar).then(d => { if (!iptal) setAjansOnerileri(d); });
    return () => { iptal = true; };
  }, []);
  const oneriSatirlari = useMemo(() => {
    if (!ajansOnerileri) return [];
    const evler = new Set<string>(binalar.filter(b => !b.gizli && kurucuEvMi(b.tur, b.haritaTur)).map(b => b.id));
    const kisiler = new Set<string>(evKisileri.map(i => i.id));
    // Bağ önerisi (4 Kasım): hedef görünen bir yol ya da yapı olmalı
    const hedefler = new Set<string>([
      ...yollar.filter(y => !y.gizli).map(y => y.id), ...binalar.filter(b => !b.gizli).map(b => b.id),
      ...ozelYapilar.filter(o => !o.gizli).map(o => o.id)
    ]);
    const haritadan = new Map(binalar.map(b => [b.id, b.wikiId ?? undefined]));
    const mevcutBag = (id: string) => taslak.baglar[id] ?? haritadan.get(id);
    const maddeler = new Set<string>(items.filter(i => !i.archived).map(i => i.id));
    const isaretli = new Set<string>(items.filter(i => i.metadata?.haritaIsareti).map(i => i.id));
    return ajansOnerileri.oneriler
      .filter(o => !yokSayilan.has(o.id))
      .map(o => ({ o, durum: (o.tur === 'bag' ? bagOnerisiDurumu(o, hedefler, mevcutBag, maddeler, isaretli) : oneriDurumu(taslak, o, evler, kisiler)) as OneriDurumu }))
      .filter(x => x.durum !== 'uygulandi');
  }, [ajansOnerileri, yokSayilan, binalar, evKisileri, taslak, yollar, ozelYapilar, items]);
  const uygulanabilir = oneriSatirlari.filter(x => x.durum === 'bekliyor').map(x => x.o);
  /**
   * Uygula yalnız düğmeyle: oturan ve bağ taslağa girer (Kurucu her zamanki
   * gibi kaydeder); bağ önerisi isaretKaldir diyorsa maddenin işareti
   * "Kaldır"daki gibi kaldırılır. Uygulanan öneri listeden kendiliğinden düşer.
   */
  const oneriUygula = async (liste: HaritaOnerisi[]) => {
    if (!liste.length) return;
    const oturan = liste.filter((o): o is OturanOnerisi => o.tur === 'oturan');
    const bag = liste.filter((o): o is BagOnerisi => o.tur === 'bag');
    degistir(t => bagOnerileriniUygula(onerileriUygula(t, oturan), bag));
    const silinecek = [...new Set(bag.filter(o => o.isaretKaldir).map(o => o.madde))]
      .map(id => items.find(i => i.id === id))
      .filter((i): i is NonNullable<typeof i> => !!i && !!i.metadata?.haritaIsareti);
    const metin = liste.length === 1 ? 'Öneri taslağa eklendi; Kurucu her zamanki gibi kaydeder.' : `${liste.length} öneri taslağa eklendi; Kurucu her zamanki gibi kaydeder.`;
    if (silinecek.length && onUpdateItem) {
      await isaretYaz(async () => { for (const m of silinecek) await onUpdateItem(maddeIsareti(m, null)); },
        `${metin} ${silinecek.length === 1 ? 'Maddenin işareti' : `${silinecek.length} maddenin işareti`} kaldırıldı.`);
    } else setUyari(metin);
  };

  /** Mıknatısın yakalama yarıçapı (metre): parmakta geniş, farede dar */
  const miknatisEsigi = () => (miknatis ? (dokunmatik.current ? 30 : 16) : 6) / olcek;

  /**
   * Kavşak: q noktası verilen yolun üstüne düştüyse o yola da nokta ekler
   * (yoksa yol yalnız üst üste biner, kavşak sayılmaz).
   */
  const kavsakEkle = (t: KurucuTaslak, yolId: string, q: Nokta): KurucuTaslak => {
    const y = yollar.find(o => o.id === yolId);
    if (!y) return t;
    const ekle = (h: Nokta[]): { h: Nokta[]; d: number } => {
      let en = { i: -1, d: Infinity };
      for (let i = 1; i < h.length; i++) {
        const a = h[i - 1], b = h[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        if (!l2) continue;
        const k = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
        const d = Math.hypot(a[0] + dx * k - q[0], a[1] + dy * k - q[1]);
        if (d < en.d) en = { i, d };
      }
      if (en.i < 0 || h.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.8)) return { h, d: en.d };
      const n = [...h]; n.splice(en.i, 0, q);
      return { h: n, d: en.d };
    };
    if (y.yeni) {
      const yy = t.yeniYollar[yolId];
      if (!yy) return t;
      const { h } = ekle(yy.noktalar.map(metreye));
      return { ...t, yeniYollar: { ...t.yeniYollar, [yolId]: { ...yy, noktalar: h.map(derceye) } } };
    }
    const parcalar = (t.yolDuzeni[yolId]?.map(h => h.map(metreye)) ?? y.parcalar);
    const sonuc = parcalar.map(ekle);
    const enYakin = sonuc.reduce((e, x, i) => (x.d < sonuc[e].d ? i : e), 0);
    return { ...t, yolDuzeni: { ...t.yolDuzeni, [yolId]: parcalar.map((h, i) => (i === enYakin ? sonuc[i].h : h).map(derceye)) } };
  };

  const bitir = useCallback((ekle?: Nokta) => {
    const c = ekle ? [...cizilen, ekle] : cizilen;
    if (c.length >= 2) {
      // Var olan yolun üstünden giden parça atılır, yol oradan bölünür (8 Ekim)
      const parcalar = cakisanParcalariAyir(c, yollar);
      if (!parcalar.length) setUyari('Bu yol zaten var — üstüne çizilen parça eklenmedi.');
      else if (parcalar.flat().length < c.length || parcalar.length > 1) setUyari('Var olan yolun üstünden giden parça eklenmedi; yol oradan birleşir.');
      if (parcalar.length) degistir(t => {
        let y: KurucuTaslak = t;
        for (const parca of parcalar) {
          const id = yeniYolId(y.yeniYollar);
          y = { ...y, yeniYollar: { ...y.yeniYollar, [id]: { tur: cizTur, noktalar: parca.map(derceye) } } };
        }
        for (const k of kavsakAdaylari) if (parcalar.some(pr => pr.some(p => p === k.q))) y = kavsakEkle(y, k.yolId, k.q);
        return y;
      });
    }
    setCizilen([]);
    setKavsakAdaylari([]);
  }, [cizilen, cizTur, degistir, kavsakAdaylari, yollar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- bina ve şablon yerleştirme ---------------------------------------------
  const gorunurYolHatlari = useMemo(() => yollar.filter(y => !y.gizli).flatMap(y => y.parcalar), [yollar]);

  /** Dokunulan yere bina: 35 m içinde yol varsa yola dönük, yoldan geri çekilmiş */
  const binaTaslagi = useCallback((m: Nokta, tur: BinaTuru) => {
    const b = binaBilgisi(tur);
    let en = { d: Infinity, aci: 0, q: m as Nokta };
    for (const h of gorunurYolHatlari) {
      const u = hattaUzaklik(m, h);
      if (u.d < en.d) en = u;
    }
    if (en.d < 35 && !['meydan', 'agac', 'cesme', 'bag'].includes(tur)) {
      const yan = Math.sign((m[0] - en.q[0]) * -Math.sin(en.aci) + (m[1] - en.q[1]) * Math.cos(en.aci)) || 1;
      const d = 3.5 + b.boy / 2;
      return { tur, m: [en.q[0] - Math.sin(en.aci) * d * yan, en.q[1] + Math.cos(en.aci) * d * yan] as Nokta, en: b.en, boy: b.boy, aci: en.aci };
    }
    return { tur, m, en: b.en, boy: b.boy, aci: 0 };
  }, [gorunurYolHatlari]);

  /** Binaları süzüp taslağa ekler; kaç tanesinin konduğunu döndürür */
  // `kendiArasinda: false` — şablonun parçaları zaten birbirine göre dizili
  // (meydanın ortasında çeşme, sahanın kenarında tribün); yalnız haritadaki
  // mevcut yapılara bakılır.
  const binalariEkle = useCallback((adaylar: Array<{ tur: BinaTuru; m: Nokta; en: number; boy: number; aci: number }>,
    ekYollar: Nokta[][] = [], yolKontrolu = true, kendiArasinda = true) => {
    const engel = binalar.map(b => ({ m: b.m, r: b.r, gizli: b.gizli }));
    const konan: typeof adaylar = [];
    for (const a of adaylar) {
      if (!binaKonabilirMi(a, zemin.ada, engel, yolKontrolu ? [...gorunurYolHatlari, ...ekYollar] : ekYollar)) continue;
      konan.push(a);
      if (kendiArasinda) engel.push({ m: a.m, r: Math.hypot(a.en, a.boy) / 2, gizli: false });
    }
    return konan;
  }, [binalar, gorunurYolHatlari, zemin.ada]);

  const sablonOnizleme = useMemo((): SablonCikti | null => {
    const yer = bekleyen ?? imlec;
    if (arac !== 'sablon' || !yer) return null;
    return sablonuYerlestir(sablonHam, yer, (sablonAci * Math.PI) / 180, sablonOlcek);
  }, [arac, imlec, bekleyen, sablonHam, sablonAci, sablonOlcek]);

  const sablonuKoy = useCallback((merkez: Nokta) => {
    const c = sablonuYerlestir(sablonHam, merkez, (sablonAci * Math.PI) / 180, sablonOlcek);
    // Yollar: denize düşen noktalar kırpılır, iki noktadan kısa kalan atılır
    const yeniYollar: Array<{ tur: YolTuru; m: Nokta[] }> = [];
    for (const y of c.yollar) {
      const kara = y.m.filter(p => karadaMi(p, zemin.ada));
      if (kara.length >= 2) yeniYollar.push({ tur: y.tur, m: kara });
    }
    // Binalar: şablonun kendi yollarına göre zaten dizili; yalnız mevcut
    // haritaya ve denize bakılır
    const konan = binalariEkle(c.binalar, [], true, false);
    if (!yeniYollar.length && !konan.length) { setUyari('Şablon buraya sığmadı — karada, boş bir yer seç.'); return; }
    degistir(t => {
      const yY = { ...t.yeniYollar };
      for (const y of yeniYollar) yY[yeniYolId(yY)] = { tur: y.tur, noktalar: y.m.map(derceye) };
      const yB = { ...t.yeniBinalar };
      for (const b of konan) yB[yeniYolId(yB, 'kurucu_bina')] = { tur: b.tur, merkez: derceye(b.m), en: b.en, boy: b.boy, aci: b.aci };
      return { ...t, yeniYollar: yY, yeniBinalar: yB };
    });
    const atlanan = c.binalar.length - konan.length;
    setUyari(`${yeniYollar.length} yol, ${konan.length} yapı kondu` + (atlanan ? ` · ${atlanan} yapı sığmadı (deniz ya da mevcut bina)` : ''));
  }, [sablonHam, sablonAci, sablonOlcek, zemin.ada, binalariEkle, degistir]);

  const binaKoy = useCallback((m: Nokta) => {
    const aday = binaTaslagi(m, binaTur);
    const konan = binalariEkle([aday]);
    if (!konan.length) { setUyari('Buraya konmadı: deniz, yol ya da başka bir bina var.'); return; }
    degistir(t => ({
      ...t,
      yeniBinalar: { ...t.yeniBinalar, [yeniYolId(t.yeniBinalar, 'kurucu_bina')]: { tur: aday.tur, merkez: derceye(aday.m), en: aday.en, boy: aday.boy, aci: aday.aci } }
    }));
  }, [binaTaslagi, binaTur, binalariEkle, degistir]);

  const kenariDoldur = useCallback((y: KurucuYol, tur: BinaTuru) => {
    const b = binaBilgisi(tur);
    const adaylar = y.parcalar.flatMap(h => hatBoyuBinalar(h, tur, b.en + 6, 3.5, [1, -1], Math.random, 0.1));
    const digerYollar = yollar.filter(o => !o.gizli && o.id !== y.id).flatMap(o => o.parcalar);
    const konan = binalariEkle(adaylar, digerYollar, false);
    if (!konan.length) { setUyari('Yol kenarında boş yer bulunamadı.'); return; }
    degistir(t => {
      const yB = { ...t.yeniBinalar };
      for (const k of konan) yB[yeniYolId(yB, 'kurucu_bina')] = { tur: k.tur, merkez: derceye(k.m), en: k.en, boy: k.boy, aci: k.aci };
      return { ...t, yeniBinalar: yB };
    });
    setUyari(`${konan.length} yapı kondu`);
  }, [yollar, binalariEkle, degistir]);

  const doldurOnizleme = useMemo(() => {
    if (!doldurAlani) return [];
    const girdi = yollar.filter(y => !y.gizli).map(y => ({
      parcalar: y.parcalar, yari: yolYariEni(y.tur, y.haritaTur), cepheAlir: y.tur === 'ana' || y.tur === 'sokak'
    }));
    const engel = [
      ...binalar.filter(b => !b.gizli).map(b => b.kose),
      ...ozelYapilar.filter(o => !o.gizli).map(o => o.m)
    ];
    return mahalleDoldur(doldurAlani, girdi, engel, zemin.ada, doku, tohum);
  }, [doldurAlani, yollar, binalar, ozelYapilar, zemin.ada, doku, tohum]);

  const doldurKoy = useCallback(() => {
    if (!doldurOnizleme.length) { setUyari('Bu alanda ev dizilecek sokak kenarı yok.'); return; }
    const evler = doldurOnizleme;
    degistir(t => {
      const yB = { ...t.yeniBinalar };
      for (const b of evler) yB[yeniYolId(yB, 'kurucu_bina')] = { tur: b.tur, merkez: derceye(b.m), en: b.en, boy: b.boy, aci: b.aci, kat: b.kat };
      return { ...t, yeniBinalar: yB };
    });
    setUyari(`${evler.length} ev kondu`);
    setDoldurAlani(null);
  }, [doldurOnizleme, degistir]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement;
      if (hedef && /INPUT|TEXTAREA|SELECT/.test(hedef.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); geriAl(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); yinele(); }
      else if (e.key === 'Enter' && arac === 'ciz') bitir();
      else if (e.key === 'Enter' && (arac === 'ozel' || arac === 'doga') && cokgen.length >= 3) cokgeniBitir();
      else if (e.key === 'Enter' && bekleyen) bekleyeniKoy()
      else if (e.key === 'Enter' && arac === 'doldur' && doldurAlani) doldurKoy();
      else if (e.key === 'Escape') { setCizilen([]); setCokgen([]); setSecili(null); setBekleyen(null); setSilAlani(null); setCoklu(null); setKavsakAdaylari([]); setDoldurAlani(null); }
      else if (e.key === 'Backspace' && arac === 'ciz' && cizilen.length) { e.preventDefault(); setCizilen(c => c.slice(0, -1)); }
      else if (e.key === 'Backspace' && (arac === 'ozel' || arac === 'doga') && cokgen.length) { e.preventDefault(); setCokgen(c => c.slice(0, -1)); }
      // Seçili yol ya da yapı Delete / Backspace ile kaldırılır
      else if ((e.key === 'Delete' || e.key === 'Backspace') && arac === 'sec' && seciliNokta) { e.preventDefault(); yolNoktasiSil(seciliNokta); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && arac === 'sec' && secili) { e.preventDefault(); kaldirGeriGetir(secili); setSecili(null); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [arac, bitir, cizilen.length, geriAl, yinele, secili, seciliNokta, cokgen.length, cokgeniBitir, bekleyen, doldurAlani, doldurKoy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- işaretçi: kaydır / tıkla / çimdikle ------------------------------------
  const basilanlar = useRef(new Map<number, { x: number; y: number }>());
  const surukleme = useRef<{ x: number; y: number; g: Gorunum; oynadi: boolean } | null>(null);
  const cimdik = useRef<{ d: number; g: Gorunum; m: Nokta } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dokunmatik.current = e.pointerType === 'touch' || e.pointerType === 'pen';
    // Seçili özel yapının köşesi tutulduysa: köşe sürüklenir, harita kaymaz
    const kose = (e.target as Element).closest?.('[data-kose]');
    if (kose && arac === 'sec') {
      const [id, i] = String(kose.getAttribute('data-kose')).split('|');
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setSurukKose({ id, i: Number(i), m: ekrandanMetre(e.clientX, e.clientY) });
      return;
    }
    // Seçili yolun noktası: nokta sürüklenir
    const yn = (e.target as Element).closest?.('[data-yolnokta]');
    if (yn && arac === 'sec') {
      const [id, parca, i] = String(yn.getAttribute('data-yolnokta')).split('|');
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const m = ekrandanMetre(e.clientX, e.clientY);
      setSurukYol({ id, parca: parca === 'k' ? 'k' : Number(parca), i: Number(i), m, bas: m });
      return;
    }
    // İki nokta arasındaki "+": yeni nokta konur ve hemen sürüklenir
    const ek = (e.target as Element).closest?.('[data-yolekle]');
    if (ek && arac === 'sec') {
      const [id, parcaH, iH] = String(ek.getAttribute('data-yolekle')).split('|');
      const parca = parcaH === 'k' ? 'k' as const : Number(parcaH), i = Number(iH);
      const m = ekrandanMetre(e.clientX, e.clientY);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      yolNoktasiEkle(id, parca, i, m);
      setSurukYol({ id, parca, i: i + 1, m });
      setSeciliNokta(null);
      return;
    }
    // Seçili yapının üstünden tutulduysa: yapı taşınır
    if (arac === 'sec' && secili && basilanlar.current.size === 0) {
      const g = (e.target as Element).closest?.('[data-bina],[data-ozel]');
      const ham = g ? g.getAttribute('data-bina') ?? g.getAttribute('data-ozel') : null;
      const id = ham ? lider(ham) : null;
      if (id && id === secili) {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const m = ekrandanMetre(e.clientX, e.clientY);
        setSurukBina({ id, bas: m, m });
        return;
      }
    }
    // Toplu seçimin içinden tutulursa: hepsi birlikte sürüklenir
    if (arac === 'sec' && coklu && basilanlar.current.size === 0) {
      const m = ekrandanMetre(e.clientX, e.clientY);
      if (m[0] >= coklu.x0 && m[0] <= coklu.x1 && m[1] >= coklu.y0 && m[1] <= coklu.y1) {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setSurukCoklu({ bas: m, m });
        return;
      }
    }
    // Alanla kaldır / alanla seç: tek parmak dikdörtgen çizer (iki parmak yine yakınlaştırır)
    if (((arac === 'sil' && silAlanla) || (arac === 'sec' && secAlanla) || arac === 'doldur') && basilanlar.current.size === 0) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const m = ekrandanMetre(e.clientX, e.clientY);
      setSilAlani({ bas: m, son: m });
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    basilanlar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (basilanlar.current.size === 2) {
      const [a, b] = [...basilanlar.current.values()];
      cimdik.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y), g: gorunum,
        m: ekrandanMetre((a.x + b.x) / 2, (a.y + b.y) / 2)
      };
      surukleme.current = null;
      return;
    }
    surukleme.current = { x: e.clientX, y: e.clientY, g: gorunum, oynadi: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (surukKose) { setSurukKose({ ...surukKose, m: ekrandanMetre(e.clientX, e.clientY) }); return; }
    if (surukYol) {
      const m = ekrandanMetre(e.clientX, e.clientY);
      // Mıknatıs: başka bir yolun köşesine ya da üstüne yapış
      const y = miknatis ? yapistir(m, yollar.filter(o => o.id !== surukYol.id), miknatisEsigi()) : null;
      setYapisma(y);
      setSurukYol({ ...surukYol, m: y ? y.m : m });
      return;
    }
    if (surukBina) { setSurukBina({ ...surukBina, m: ekrandanMetre(e.clientX, e.clientY) }); return; }
    if (surukCoklu) { setSurukCoklu({ ...surukCoklu, m: ekrandanMetre(e.clientX, e.clientY) }); return; }
    if (silAlani) { setSilAlani({ ...silAlani, son: ekrandanMetre(e.clientX, e.clientY) }); return; }
    if (basilanlar.current.has(e.pointerId)) basilanlar.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cimdik.current && basilanlar.current.size === 2) {
      const [a, b] = [...basilanlar.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = cimdik.current;
      const w = Math.min(Math.max(c.g.w * (c.d / Math.max(d, 1)), 60), 40000);
      const oran = w / c.g.w;
      setGorunum({ x: c.m[0] - (c.m[0] - c.g.x) * oran, y: c.m[1] - (c.m[1] - c.g.y) * oran, w });
      return;
    }
    const s = surukleme.current;
    if (s) {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.oynadi && Math.hypot(dx, dy) > 5) s.oynadi = true;
      if (s.oynadi) {
        setGorunum({ ...s.g, x: s.g.x - dx / olcek, y: s.g.y - dy / olcek });
        return;
      }
    }
    if (arac === 'ciz') {
      const m = ekrandanMetre(e.clientX, e.clientY);
      const y = yapistir(m, yollar, miknatisEsigi(), cizilen);
      setYapisma(y);
      setImlec(y ? y.m : m);
    } else if (arac === 'bina' || arac === 'sablon' || arac === 'ozel' || arac === 'doga') {
      setImlec(ekrandanMetre(e.clientX, e.clientY));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (silAlani) {
      const { bas, son } = silAlani;
      setSilAlani(null);
      // Çok küçük alan: kaza ile dokunuş sayılır
      if (Math.abs(son[0] - bas[0]) * olcek < 12 || Math.abs(son[1] - bas[1]) * olcek < 12) { if (arac === 'sec') setCoklu(null); return; }
      if (arac === 'doldur') { setDoldurAlani({ x0: bas[0], y0: bas[1], x1: son[0], y1: son[1] }); setTohum(t => t + 1); }
      else if (arac === 'sec') alanlaSec(bas, son); else topluKaldir(bas, son);
      return;
    }
    if (surukCoklu) {
      const { bas, m } = surukCoklu;
      setSurukCoklu(null);
      if (Math.hypot(m[0] - bas[0], m[1] - bas[1]) * olcek >= 3) topluTasi(m[0] - bas[0], m[1] - bas[1]);
      return;
    }
    if (surukKose) {
      const { id, i, m } = surukKose;
      setSurukKose(null);
      if (!karadaMi(m, zemin.ada)) { setUyari('Köşe denize taşınamaz.'); return; }
      ozelDegistir(id, o => ({ ...o, koseler: o.koseler.map((k, j) => (j === i ? derceye(m) : k)) }));
      return;
    }
    if (surukYol) {
      const { id, parca, i, m, bas } = surukYol;
      setSurukYol(null);
      // Dokunup bırakınca nokta seçilir (silmek için); sürükleyince taşınır
      if (bas && Math.hypot(m[0] - bas[0], m[1] - bas[1]) * olcek < 3) {
        setSeciliNokta(s => (s && s.id === id && s.parca === parca && s.i === i ? null : { id, parca, i }));
        return;
      }
      const kavsak = yapisma?.tur === 'hat' && yapisma.yolId ? { yolId: yapisma.yolId, q: m } : undefined;
      setYapisma(null);
      yolNoktasiYaz(id, parca, i, m, kavsak);
      return;
    }
    if (surukBina) {
      const { id, bas, m } = surukBina;
      setSurukBina(null);
      // Kısa dokunuş taşıma sayılmaz (ekranda 3 pikselden az)
      if (Math.hypot(m[0] - bas[0], m[1] - bas[1]) * olcek >= 3) yapiTasi(id, m[0] - bas[0], m[1] - bas[1]);
      return;
    }
    basilanlar.current.delete(e.pointerId);
    if (basilanlar.current.size < 2) cimdik.current = null;
    const s = surukleme.current;
    surukleme.current = null;
    if (!s || s.oynadi) return;
    // Tıklama
    if (yerlestirilen) { void yerlestir(yerlestirilen, e.clientX, e.clientY); return; }
    if (!['ciz', 'ozel', 'doga', 'bina', 'sablon', 'doldur', 'sil'].includes(arac)) {
      const isr = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest('[data-isaret]')).find(Boolean);
      if (isr) { isaretSec(isr.getAttribute('data-isaret')); return; }
    }
    if (arac === 'not') {
      const m = ekrandanMetre(e.clientX, e.clientY);
      if (!karadaMi(m, zemin.ada)) { setUyari('Not denize konamaz — karada bir yere dokun.'); return; }
      setSeciliIsaret(null);
      setNotTaslagi(n => ({ m, baslik: n?.baslik ?? '', metin: n?.metin ?? '' }));
      return;
    }
    if (arac === 'ciz') {
      const m = ekrandanMetre(e.clientX, e.clientY);
      const y = yapistir(m, yollar, miknatisEsigi(), cizilen);
      // İlk noktaya dönülürse yol kapanır ve biter
      if (y?.tur === 'uc') { bitir(y.m); return; }
      const nokta = y ? y.m : m;
      if (!karadaMi(nokta, zemin.ada)) { setUyari('Yol denize çizilemez — karada bir nokta seç.'); return; }
      if (y?.tur === 'hat' && y.yolId) { const yolId = y.yolId; setKavsakAdaylari(k => [...k, { yolId, q: nokta }]); }
      setCizilen(c => {
        const son = c[c.length - 1];
        if (son && Math.hypot(son[0] - nokta[0], son[1] - nokta[1]) < 2 / olcek) return c;
        return [...c, nokta];
      });
    } else if (arac === 'sec') {
      // İşaretçi yakalandığı için hedef kutunun kendisi olur; altındaki
      // yola / binaya noktadan bakılır. Bina yolun önünde seçilir.
      const altta = document.elementsFromPoint(e.clientX, e.clientY);
      const oz = altta.map(el => el.closest('[data-ozel]')).find(Boolean);
      const bn = altta.map(el => el.closest('[data-bina]')).find(Boolean);
      const yl = altta.map(el => el.closest('[data-yol]')).find(Boolean);
      const dg = altta.map(el => el.closest('[data-doga]')).find(Boolean);
      setSecili(oz ? oz.getAttribute('data-ozel') : bn ? lider(String(bn.getAttribute('data-bina'))) : yl ? yl.getAttribute('data-yol') : dg ? dg.getAttribute('data-doga') : null);
    } else if (arac === 'sil') {
      // Kaldır aracı: dokunulan yol ya da yapı tek dokunuşta kaldırılır;
      // kaldırılmışa dokununca geri gelir (29 Eylül, Kemal: "yolların
      // silinmesi daha kolay olmalı"). Silinmez; Geri al da çalışır.
      const altta = document.elementsFromPoint(e.clientX, e.clientY);
      const oz = altta.map(el => el.closest('[data-ozel]')).find(Boolean);
      const dg = altta.map(el => el.closest('[data-doga]')).find(Boolean);
      if (oz || dg) { taslaktanSil(String((oz ?? dg)!.getAttribute(oz ? 'data-ozel' : 'data-doga'))); return; }
      const bn = altta.map(el => el.closest('[data-bina]')).find(Boolean);
      const yl = altta.map(el => el.closest('[data-yol]')).find(Boolean);
      if (bn) grupKaldirGetir(String(bn.getAttribute('data-bina')));
      else if (yl) yolParcasiSil(String(yl.getAttribute('data-yol')), ekrandanMetre(e.clientX, e.clientY));
    } else if (arac === 'ozel' && kalipId) {
      setBekleyen(ekrandanMetre(e.clientX, e.clientY));
    } else if (arac === 'ozel' || arac === 'doga') {
      const m = ekrandanMetre(e.clientX, e.clientY);
      // İlk köşeye dönülünce çokgen kapanır
      if (cokgen.length >= 3 && Math.hypot(m[0] - cokgen[0][0], m[1] - cokgen[0][1]) < 10 / olcek) { cokgeniBitir(); return; }
      if (!karadaMi(m, zemin.ada)) { setUyari('Köşe denize konamaz — karada bir nokta seç.'); return; }
      setCokgen(c => [...c, m]);
    } else if (arac === 'bagla') {
      const altta = document.elementsFromPoint(e.clientX, e.clientY);
      const oz = altta.map(el => el.closest('[data-ozel]')).find(Boolean);
      const bn = altta.map(el => el.closest('[data-bina]')).find(Boolean);
      const id = oz ? oz.getAttribute('data-ozel') : bn ? bn.getAttribute('data-bina') : null;
      setSecili(id);
      setBaglaArama('');
      if (!id) setUyari('Bir yapıya dokun; ardından maddesini seç.');
    } else if (arac === 'bina') {
      binaKoy(ekrandanMetre(e.clientX, e.clientY));
    } else if (arac === 'sablon') {
      setBekleyen(ekrandanMetre(e.clientX, e.clientY));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    yakinlas(e.deltaY > 0 ? 1.18 : 1 / 1.18, ekrandanMetre(e.clientX, e.clientY));
  };

  // Sayfa kaymasın diye tekerlek dinleyicisi pasif olmayan olarak eklenir
  useEffect(() => {
    const el = kutu.current;
    if (!el) return;
    const dur = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', dur, { passive: false });
    return () => el.removeEventListener('wheel', dur);
  }, []);

  // ---- seçili yol işlemleri ---------------------------------------------------
  const seciliYol = yollar.find(y => y.id === secili) ?? null;
  const seciliBina = binalar.find(b => b.id === secili) ?? null;
  const binaDegistir = (b: KurucuBina, f: (x: KurucuTaslak['yeniBinalar'][string]) => KurucuTaslak['yeniBinalar'][string]) =>
    degistir(t => ({ ...t, yeniBinalar: { ...t.yeniBinalar, [b.id]: f(t.yeniBinalar[b.id]) } }));
  const binaGizleGoster = (b: KurucuBina) => grupKaldirGetir(b.id);
  /** Grubun hepsini birlikte kaldırır ya da geri getirir (başın durumuna göre) */
  function grupKaldirGetir(id: string) {
    const uyeler = grubu(id);
    degistir(t => {
      const gizli = t.gizlenen.includes(uyeler[0]);
      const kalan = t.gizlenen.filter(x => !uyeler.includes(x));
      // 4 Kasım (Kemal): kaldırılan yapının viki bağı da kalkar
      return gizli ? { ...t, gizlenen: kalan } : bagsizGizle({ ...t, gizlenen: kalan }, uyeler);
    });
  }
  const [dolguTur, setDolguTur] = useState<BinaTuru>('ev');
  const turDegistir = (y: KurucuYol, tur: YolTuru) => degistir(t => {
    if (y.yeni) {
      const eski = t.yeniYollar[y.id];
      return { ...t, yeniYollar: { ...t.yeniYollar, [y.id]: { ...eski, tur } } };
    }
    return { ...t, turDegisikligi: { ...t.turDegisikligi, [y.id]: tur } };
  });
  const gizleGoster = (y: KurucuYol) => kaldirGeriGetir(y.id);
  function kaldirGeriGetir(id: string) {
    degistir(t => (t.gizlenen.includes(id)
      ? { ...t, gizlenen: t.gizlenen.filter(x => x !== id) }
      : bagsizGizle(t, [id])));
  }

  // ---- düzenleme: yol noktası, yol parçası, yapı taşıma (30 Eylül) -----------
  /** Haritadan gelen yapının düzeltmesi (taşı, döndür, kat, tür) */
  const haritaBinaDuzelt = (id: string, f: (d: BinaDuzeltme) => BinaDuzeltme) =>
    degistir(t => ({ ...t, binaDuzeni: { ...t.binaDuzeni, [id]: f(t.binaDuzeni[id] ?? { dx: 0, dy: 0, aci: 0 }) } }));
  const haritaBinaSifirla = (id: string) => degistir(t => {
    const bd = { ...t.binaDuzeni }; delete bd[id];
    return { ...t, binaDuzeni: bd };
  });

  /** Yapıyı (grubuyla birlikte) dx, dy metre kaydırır */
  const yapiTasi = (id: string, dx: number, dy: number) => {
    const uyeler = grubu(id);
    if (uyeler.length > 1) {
      const bas = binalar.find(b => b.id === uyeler[0]);
      if (bas && !karadaMi([bas.m[0] + dx, bas.m[1] + dy], zemin.ada)) { setUyari('Yapı denize taşınamaz.'); return; }
      uyeler.forEach(u => tekYapiTasi(u, dx, dy, false));
      return;
    }
    tekYapiTasi(id, dx, dy, true);
  };

  /** Grubu, merkezinin çevresinde döndürür (tek yapıda kendi çevresinde) */
  const yapiDondur = (id: string, a: number) => {
    const uyeler = grubu(id).map(u => binalar.find(b => b.id === u)).filter(Boolean) as KurucuBina[];
    const G: Nokta = [uyeler.reduce((t, b) => t + b.m[0], 0) / uyeler.length, uyeler.reduce((t, b) => t + b.m[1], 0) / uyeler.length];
    const co = Math.cos(a), si = Math.sin(a);
    degistir(t => {
      const yB = { ...t.yeniBinalar }, bD = { ...t.binaDuzeni };
      for (const b of uyeler) {
        const yeni: Nokta = [G[0] + (b.m[0] - G[0]) * co - (b.m[1] - G[1]) * si, G[1] + (b.m[0] - G[0]) * si + (b.m[1] - G[1]) * co];
        const ddx = yeni[0] - b.m[0], ddy = yeni[1] - b.m[1];
        if (yB[b.id]) {
          const m = metreye(yB[b.id].merkez);
          yB[b.id] = { ...yB[b.id], merkez: derceye([m[0] + ddx, m[1] + ddy]), aci: yB[b.id].aci + a };
        } else {
          const d = bD[b.id] ?? { dx: 0, dy: 0, aci: 0 };
          bD[b.id] = { ...d, dx: d.dx + ddx, dy: d.dy + ddy, aci: d.aci + a };
        }
      }
      return { ...t, yeniBinalar: yB, binaDuzeni: bD };
    });
  };

  const tekYapiTasi = (id: string, dx: number, dy: number, karaDenetimi: boolean) => {
    const oz = taslak.ozelYapilar[id];
    const yb = taslak.yeniBinalar[id];
    const bn = binalar.find(b => b.id === id);
    const yeniMerkez: Nokta | null = oz ? (() => { const c = cokgenMerkezi(oz.koseler.map(metreye)); return [c[0] + dx, c[1] + dy]; })()
      : bn ? [bn.m[0] + dx, bn.m[1] + dy] : null;
    if (!yeniMerkez) return;
    if (karaDenetimi && !karadaMi(yeniMerkez, zemin.ada)) { setUyari('Yapı denize taşınamaz.'); return; }
    if (oz) {
      ozelDegistir(id, o => ({ ...o, koseler: o.koseler.map(k => { const m = metreye(k); return derceye([m[0] + dx, m[1] + dy]); }) }));
    } else if (yb) {
      const m = metreye(yb.merkez);
      degistir(t => ({ ...t, yeniBinalar: { ...t.yeniBinalar, [id]: { ...t.yeniBinalar[id], merkez: derceye([m[0] + dx, m[1] + dy]) } } }));
    } else {
      haritaBinaDuzelt(id, d => ({ ...d, dx: d.dx + dx, dy: d.dy + dy }));
    }
  };

  /** Yol noktasını yeni yere yazar */
  const yolNoktasiYaz = (id: string, parca: number | 'k', i: number, m: Nokta, kavsak?: { yolId: string; q: Nokta }) => {
    if (!karadaMi(m, zemin.ada)) { setUyari('Yol noktası denize taşınamaz.'); return; }
    const yol = yollar.find(y => y.id === id);
    if (!yol) return;
    degistir(t => {
      let y2: KurucuTaslak;
      if (parca === 'k') {
        const y = t.yeniYollar[id];
        if (!y) return t;
        y2 = { ...t, yeniYollar: { ...t.yeniYollar, [id]: { ...y, noktalar: y.noktalar.map((p, j) => (j === i ? derceye(m) : p)) } } };
      } else {
        const parcalar = yol.parcalar.map((h, pi) => h.map((p, j) => (pi === parca && j === i ? m : p)).map(derceye));
        y2 = { ...t, yolDuzeni: { ...t.yolDuzeni, [id]: parcalar } };
      }
      return kavsak ? kavsakEkle(y2, kavsak.yolId, kavsak.q) : y2;
    });
    if (kavsak) setUyari('Kavşak oldu: iki yol birleşti.');
  };

  /** Kaldır aracı yola dokununca: iki kavşak arası kalkar (30 Eylül) */
  const yolParcasiSil = (id: string, dokunus: Nokta) => {
    const y = yollar.find(o => o.id === id);
    if (!y) return;
    if (y.gizli) { kaldirGeriGetir(id); return; }
    const kalan = parcaCikar(y, dokunus, yollar);
    if (!kalan.length) {
      kaldirGeriGetir(id);
      setUyari('Yolun arada kavşağı yok; tamamı kaldırıldı. Dokununca geri gelir.');
      return;
    }
    degistir(t => {
      if (y.yeni) {
        const yY = { ...t.yeniYollar };
        const tur = yY[id]?.tur ?? y.tur;
        delete yY[id];
        kalan.forEach((k, i) => { yY[i === 0 ? id : yeniYolId(yY)] = { tur, noktalar: sadelestir(k.map(derceye)) }; });
        return { ...t, yeniYollar: yY };
      }
      return { ...t, yolDuzeni: { ...t.yolDuzeni, [id]: kalan.map(k => k.map(derceye)) } };
    });
    setUyari('İki kavşak arası kaldırıldı. Geri al ile döner.');
  };

  /** Alanla kaldır: dikdörtgenin içindeki her şey tek "Geri al" adımında kalkar */
  const topluKaldir = (a: Nokta, b: Nokta) => {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const icinde = (p: Nokta) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const binaIds = new Set<string>();
    for (const bn of binalar) if (!bn.gizli && icinde(bn.m)) grubu(bn.id).forEach(u => binaIds.add(u));
    const silinecek = [
      ...ozelYapilar.filter(o => icinde(cokgenMerkezi(o.m))).map(o => o.id),
      ...dogaAlanlari.filter(d => icinde(cokgenMerkezi(d.m))).map(d => d.id)
    ];
    // Yollar: içerideki noktalar atılır, dışarıda kalan parçalar ayrı yol olur
    const yolKes: Array<{ y: KurucuYol; kalan: Nokta[][] }> = [];
    for (const y of yollar) {
      if (y.gizli || !y.parcalar.some(h => h.some(icinde))) continue;
      const kalan: Nokta[][] = [];
      for (const h of y.parcalar) {
        let dizi: Nokta[] = [];
        for (const p of h) {
          if (icinde(p)) { if (dizi.length >= 2) kalan.push(dizi); dizi = []; } else dizi.push(p);
        }
        if (dizi.length >= 2) kalan.push(dizi);
      }
      yolKes.push({ y, kalan });
    }
    if (!binaIds.size && !silinecek.length && !yolKes.length) { setUyari('Seçtiğin alanda kaldırılacak bir şey yok.'); return; }
    degistir(t => {
      const oz = { ...t.ozelYapilar }, dg = { ...t.doga }, bg = { ...t.baglar };
      for (const id of silinecek) { delete oz[id]; delete dg[id]; delete bg[id]; }
      const gz = new Set(t.gizlenen);
      binaIds.forEach(id => { gz.add(id); delete bg[id]; });
      const yY = { ...t.yeniYollar }, yD = { ...t.yolDuzeni };
      for (const { y, kalan } of yolKes) {
        if (!kalan.length) { gz.add(y.id); continue; }
        if (y.yeni) {
          const tur = yY[y.id]?.tur ?? y.tur;
          delete yY[y.id];
          kalan.forEach((k, i) => { yY[i === 0 ? y.id : yeniYolId(yY)] = { tur, noktalar: sadelestir(k.map(derceye)) }; });
        } else {
          yD[y.id] = kalan.map(k => k.map(derceye));
        }
      }
      return { ...t, ozelYapilar: oz, doga: dg, baglar: bg, gizlenen: [...gz], yeniYollar: yY, yolDuzeni: yD };
    });
    setUyari(`Alandan ${binaIds.size} yapı, ${yolKes.length} yol parçası${silinecek.length ? `, ${silinecek.length} çizim` : ''} kaldırıldı. Geri al ile hepsi birden döner.`);
  };

  /** Alanla seç: dikdörtgendeki yapılar (gruplarıyla) ve tamamen içinde kalan yollar */
  const alanlaSec = (a: Nokta, b: Nokta) => {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const icinde = (p: Nokta) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    const bs = new Set<string>();
    for (const bn of binalar) if (!bn.gizli && icinde(bn.m)) grubu(bn.id).forEach(u => bs.add(u));
    for (const o of ozelYapilar) if (!o.gizli && icinde(cokgenMerkezi(o.m))) bs.add(o.id);
    const ys = yollar.filter(y => !y.gizli && y.parcalar.every(h => h.every(icinde))).map(y => y.id);
    if (!bs.size && !ys.length) { setCoklu(null); setUyari('Seçtiğin alanda yapı yok.'); return; }
    setSecili(null);
    setCoklu({ x0, y0, x1, y1, binalar: [...bs], yollar: ys });
    setUyari(`${bs.size} yapı${ys.length ? `, ${ys.length} yol` : ''} seçildi. Seçimin içinden tutup sürükle.`);
  };

  /** Toplu seçimi dx, dy metre taşır (tek Geri al adımı) */
  const topluTasi = (dx: number, dy: number) => {
    if (!coklu) return;
    const kayik = (p: Nokta): Nokta => [p[0] + dx, p[1] + dy];
    const denize = coklu.binalar.some(id => {
      const bn = binalar.find(b => b.id === id);
      const oz = ozelYapilar.find(o => o.id === id);
      const m = bn ? bn.m : oz ? cokgenMerkezi(oz.m) : null;
      return m ? !karadaMi(kayik(m), zemin.ada) : false;
    });
    if (denize) { setUyari('Seçimin bir kısmı denize düşüyor; daha az kaydır.'); return; }
    degistir(t => {
      const oz = { ...t.ozelYapilar }, yB = { ...t.yeniBinalar }, bD = { ...t.binaDuzeni }, yY = { ...t.yeniYollar }, yD = { ...t.yolDuzeni };
      for (const id of coklu.binalar) {
        if (oz[id]) oz[id] = { ...oz[id], koseler: oz[id].koseler.map(k => derceye(kayik(metreye(k)))) };
        else if (yB[id]) yB[id] = { ...yB[id], merkez: derceye(kayik(metreye(yB[id].merkez))) };
        else { const d = bD[id] ?? { dx: 0, dy: 0, aci: 0 }; bD[id] = { ...d, dx: d.dx + dx, dy: d.dy + dy }; }
      }
      for (const id of coklu.yollar) {
        const y = yollar.find(o => o.id === id);
        if (!y) continue;
        if (yY[id]) yY[id] = { ...yY[id], noktalar: yY[id].noktalar.map(k => derceye(kayik(metreye(k)))) };
        else yD[id] = y.parcalar.map(h => h.map(p => derceye(kayik(p))));
      }
      return { ...t, ozelYapilar: oz, yeniBinalar: yB, binaDuzeni: bD, yeniYollar: yY, yolDuzeni: yD };
    });
    setCoklu({ ...coklu, x0: coklu.x0 + dx, x1: coklu.x1 + dx, y0: coklu.y0 + dy, y1: coklu.y1 + dy });
    setUyari(`${coklu.binalar.length} yapı${coklu.yollar.length ? `, ${coklu.yollar.length} yol` : ''} taşındı. Geri al ile döner.`);
  };

  /** Yolun i. noktasından sonra yeni nokta (metre) */
  const yolNoktasiEkle = (id: string, parca: number | 'k', i: number, m: Nokta) => {
    const yol = yollar.find(y => y.id === id);
    if (!yol) return;
    degistir(t => {
      if (parca === 'k') {
        const y = t.yeniYollar[id];
        if (!y) return t;
        const n = [...y.noktalar]; n.splice(i + 1, 0, derceye(m));
        return { ...t, yeniYollar: { ...t.yeniYollar, [id]: { ...y, noktalar: n } } };
      }
      const parcalar = yol.parcalar.map((h, pi) => {
        const k = [...h]; if (pi === parca) k.splice(i + 1, 0, m);
        return k.map(derceye);
      });
      return { ...t, yolDuzeni: { ...t.yolDuzeni, [id]: parcalar } };
    });
  };

  /** Seçili yol noktasını siler; iki noktadan az kalan parça (ya da yol) gider */
  const yolNoktasiSil = (n: { id: string; parca: number | 'k'; i: number }) => {
    const yol = yollar.find(y => y.id === n.id);
    if (!yol) return;
    setSeciliNokta(null);
    degistir(t => {
      if (n.parca === 'k') {
        const y = t.yeniYollar[n.id];
        if (!y) return t;
        const k = y.noktalar.filter((_, j) => j !== n.i);
        if (k.length < 2) { const yY = { ...t.yeniYollar }; delete yY[n.id]; return { ...t, yeniYollar: yY }; }
        return { ...t, yeniYollar: { ...t.yeniYollar, [n.id]: { ...y, noktalar: k } } };
      }
      const parcalar = yol.parcalar
        .map((h, pi) => (pi === n.parca ? h.filter((_, j) => j !== n.i) : h))
        .filter(h => h.length >= 2).map(h => h.map(derceye));
      if (!parcalar.length) return { ...t, gizlenen: [...t.gizlenen.filter(x => x !== n.id), n.id] };
      return { ...t, yolDuzeni: { ...t.yolDuzeni, [n.id]: parcalar } };
    });
    setUyari('Nokta silindi. Geri al ile döner.');
  };

  const yolSifirla = (id: string) => degistir(t => {
    const yd = { ...t.yolDuzeni }; delete yd[id];
    return { ...t, yolDuzeni: yd };
  });

  /** Sürüklenirken ekranda görünen yollar */
  const yollarCizim = useMemo(() => {
    if (!surukYol) return yollar;
    return yollar.map(y => {
      if (y.id !== surukYol.id) return y;
      if (surukYol.parca === 'k' && y.kontrol) {
        const kontrol = y.kontrol.map((p, j) => (j === surukYol.i ? surukYol.m : p));
        return { ...y, kontrol, parcalar: [egri(kontrol.map(derceye)).map(metreye)] };
      }
      return { ...y, parcalar: y.parcalar.map((h, pi) => (pi === surukYol.parca ? h.map((p, j) => (j === surukYol.i ? surukYol.m : p)) : h)) };
    });
  }, [yollar, surukYol]);


  // ---- Haritaya işle ------------------------------------------------------------
  const taslakBelgesi = useMemo(() => taslaktanBelge(taslak), [taslak]);
  // Kayıt buluttan geri dönene kadar az önce işlenen hâl burada tutulur
  const [yerelIslenen, setYerelIslenen] = useState<KurucuBelge | undefined>(undefined);
  /*
   * Karşılaştırma aynı süzgeçten geçmiş iki hâl arasında (30 Eylül, Kemal:
   * "hiçbir şey yapmadım, işlenmemiş değişiklik var diyor"). Kayıttan dönen
   * hâl taslağa çevrilip yeniden belgelenir; biçim farkı değişiklik sayılmaz.
   */
  const haritadaki = useMemo(
    () => (duzen?.kurucuIslenen ? taslaktanBelge(belgedenTaslak(duzen.kurucuIslenen)) : undefined),
    [duzen?.kurucuIslenen]
  );
  const islenmemis = !belgelerAyniMi(taslakBelgesi, haritadaki)
    && !belgelerAyniMi(taslakBelgesi, yerelIslenen);
  const farklar = useMemo(() => (islenmemis ? belgeFarklari(taslakBelgesi, yerelIslenen ?? haritadaki) : []), [islenmemis, taslakBelgesi, yerelIslenen, haritadaki]);
  /** Taslağı haritadaki hâle döndür (Kemal'in düğmesi; geri alınabilir) */
  // Oturanlar haritaya işlenmeyi beklemediği için geri dönüşte yerinde kalır
  const haritadakineDon = () => degistir(t => ({ ...belgedenTaslak(yerelIslenen ?? duzen?.kurucuIslenen), oturanlar: t.oturanlar }));
  const [isleOnay, setIsleOnay] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);
  const [isleRaporu, setIsleRaporu] = useState<string | null>(null);
  // "Haritaya işlendi" yazısı birkaç saniye sonra kalkar (29 Eylül gece)
  useEffect(() => {
    if (!isleRaporu || isleRaporu.startsWith('İşlenemedi')) return;
    const z = setTimeout(() => setIsleRaporu(null), 6000);
    return () => clearTimeout(z);
  }, [isleRaporu]);
  const haritayaIsle = async () => {
    if (isleniyor) return;
    setIsleOnay(false);
    setIsleniyor(true);
    try {
      const onceki = yerelIslenen ?? duzen?.kurucuIslenen;
      if (onceki && !belgelerAyniMi(onceki, undefined) && arsivle) await arsivle(onceki);
      const d = sonDuzen.current ?? bosDuzen();
      bekleyenTaslak.current = null;   // işlenen taslak zaten yazılıyor
      await kaydet({ ...d, guncelleme: Date.now(), kurucu: taslakBelgesi, kurucuIslenen: taslakBelgesi });
      setYerelIslenen(taslakBelgesi);
      setIsleRaporu('Haritaya işlendi. "3D · bak" ile görünür.'
        + (onceki && arsivle ? ' Önceki hâl arşive kalktı.' : ''));
    } catch (e) {
      setIsleRaporu(`İşlenemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}. Taslak duruyor, tekrar dene.`);
    } finally {
      setIsleniyor(false);
    }
  };

  const cizimUzunlugu = useMemo(() => {
    const hat = imlec && arac === 'ciz' && cizilen.length ? [...cizilen, imlec] : cizilen;
    return hat.length >= 2 ? uzunluk(hat.map(derceye)) : 0;
  }, [cizilen, imlec, arac]);

  // ---- çizim ------------------------------------------------------------------
  const px = (n: number) => n / olcek; // piksel → metre (kalınlık için)

  /**
   * Çakışmayan etiketler (29 Eylül gece). Ekrandaki kutusu önce mahalleye,
   * sonra zirveye, sonra ötekilere yer açar; binen etiket bu yakınlıkta
   * gizlenir, yaklaşınca geri gelir. Kutu yazının uzunluğundan kestirilir.
   */
  const gorunenEtiketler = useMemo(() => {
    const sira = (t: string) => (t === 'mahalle' ? 0 : t === 'zirve' ? 1 : 2);
    const kutular: Array<[number, number, number, number]> = [];
    const kalan = new Set<number>();
    zemin.etiketler
      .map((et, i) => ({ et, i }))
      .sort((a, b) => sira(a.et.tur) - sira(b.et.tur))
      .forEach(({ et, i }) => {
        const buyuk = et.tur === 'mahalle';
        const yazi = buyuk ? 13 : 10;
        const genPx = et.ad.length * yazi * (buyuk ? 0.62 + 2.5 / yazi : 0.58) + 6;
        const yukPx = yazi * 1.3 + 4;
        const g = genPx / olcek / 2, y = yukPx / olcek / 2;
        const k: [number, number, number, number] = [et.m[0] - g, et.m[1] - y, et.m[0] + g, et.m[1] + y];
        if (kutular.some(o => k[0] < o[2] && k[2] > o[0] && k[1] < o[3] && k[3] > o[1])) return;
        kutular.push(k);
        kalan.add(i);
      });
    return kalan;
  }, [zemin.etiketler, olcek]);
  /**
   * Yol kalınlığı yakınlaşmaya bağlı: sokak düzeyinde tam kalınlık, adanın
   * tamamına bakarken üçte birine iner (29 Eylül, Kemal: "zoom out'tayken
   * yollar çok kalın görünüyor").
   */
  const yolOrani = Math.min(1, Math.max(0.35, olcek * 1.4));
  const yk = (n: number) => px(n * yolOrani);
  const gorunenYollar = [...yollarCizim].sort((a, b) =>
    ['patika', 'toprak', 'sokak', 'ana'].indexOf(a.tur) - ['patika', 'toprak', 'sokak', 'ana'].indexOf(b.tur));

  const kayitYazisi: Record<KayitDurumu, string> = {
    yukleniyor: 'Yükleniyor…', hazir: 'Taslak hazır', kaydediliyor: 'Kaydediliyor…',
    kaydedildi: 'Taslak kaydedildi', yerelde: 'Buluta ulaşılamadı; bu tarayıcıda duruyor, bağlantı gelince gönderilir'
  };

  // ---- seçili nesne -----------------------------------------------------------
  const seciliOzel = ozelYapilar.find(o => o.id === secili) ?? null;
  const seciliDoga = dogaAlanlari.find(d => d.id === secili) ?? null;
  const fiziki = useMemo(() => {
    const a = metreye([DEM_SINIR[0], DEM_SINIR[3]]);
    const b = metreye([DEM_SINIR[2], DEM_SINIR[1]]);
    return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] };
  }, []);
  const ozelKoseleri = (o: { id: string; m: Nokta[] }) =>
    surukKose && surukKose.id === o.id ? o.m.map((p, i) => (i === surukKose.i ? surukKose.m : p)) : o.m;

  const kart = 'rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5]/95 dark:bg-[#13204A]/95 backdrop-blur-sm shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] text-[#0E1C4F] dark:text-[#F3EFE8]';
  const etiket = 'text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-[#6A5E4C] dark:text-[#A6B0C9]';
  const cip = (aktif: boolean) => `px-2.5 py-1 rounded-full text-[11px] border cursor-pointer ${aktif ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`;
  const dugmeBos = 'flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[11px] cursor-pointer hover:border-[#F26B6F] disabled:opacity-35';

  /** Madde bağı kutusu — seçili yapı için */
  const maddeBagi = (yapiId: string, varsayilan?: string) => {
    const mevcut = taslak.baglar[yapiId] ?? varsayilan;
    const q = baglaArama.trim().toLocaleLowerCase('tr');
    const liste = baglanabilir.filter(i => !q || i.title.toLocaleLowerCase('tr').includes(q)).slice(0, 7);
    return (
      <div className="mt-2 pt-2 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
        <div className={etiket}>Viki maddesi</div>
        {mevcut ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">{maddeAdi(mevcut) ?? 'bağlı (madde bulunamadı)'}</span>
            {onMaddeAc && <button type="button" onClick={() => onMaddeAc(mevcut)} className={dugmeBos}><ExternalLink className="w-3 h-3" />Aç</button>}
            {taslak.baglar[yapiId] && <button type="button" onClick={() => bagla(yapiId, null)} className={dugmeBos} title="Bağı kaldır"><X className="w-3 h-3" /></button>}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bağlı madde yok.</p>
        )}
        <input
          value={baglaArama}
          onChange={e => setBaglaArama(e.target.value)}
          placeholder="Madde ara ve bağla…"
          className="mt-1.5 w-full text-[12px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A] px-2 py-1.5 focus:outline-hidden focus:border-[#F26B6F]"
        />
        {(q || arac === 'bagla') && (
          <ul className="mt-1 max-h-40 overflow-y-auto">
            {liste.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => { bagla(yapiId, i.id); setBaglaArama(''); }}
                  className={`w-full text-left px-2 py-1 rounded-md text-[12px] cursor-pointer hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] ${mevcut === i.id ? 'font-semibold text-[#D6484C] dark:text-[#F26B6F]' : ''}`}>
                  {i.title} <span className="text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">· {i.type}</span>
                </button>
              </li>
            ))}
            {!liste.length && <li className="px-2 py-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Eşleşen madde yok.</li>}
          </ul>
        )}
      </div>
    );
  };

  /** Oturanlar kutusu — seçili ev için (3 Kasım) */
  const oturanKutusu = (evId: string) => {
    const ekli = taslak.oturanlar[evId] ?? [];
    const q = oturanArama.trim().toLocaleLowerCase('tr');
    const liste = q ? evKisileri.filter(i => !ekli.includes(i.id) && i.title.toLocaleLowerCase('tr').includes(q)).slice(0, 7) : [];
    return (
      <div className="mt-2 pt-2 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
        <div className={etiket}>Oturanlar</div>
        {ekli.length ? (
          <ul className="mt-1 space-y-0.5">
            {ekli.map(id => (
              <li key={id} className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">{maddeAdi(id) ?? 'kişi bulunamadı'}</span>
                {onMaddeAc && maddeAdi(id) && <button type="button" onClick={() => onMaddeAc(id)} className={dugmeBos}><ExternalLink className="w-3 h-3" />Aç</button>}
                <button type="button" onClick={() => oturanDegistir(evId, id, false)} className={dugmeBos} title="Bu evden çıkar"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Eklenmiş oturan yok.</p>
        )}
        <input
          value={oturanArama}
          onChange={e => setOturanArama(e.target.value)}
          placeholder="Kişi ara ve ekle…"
          className="mt-1.5 w-full text-[12px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A] px-2 py-1.5 focus:outline-hidden focus:border-[#F26B6F]"
        />
        {q && (
          <ul className="mt-1 max-h-40 overflow-y-auto">
            {liste.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => { oturanDegistir(evId, i.id, true); setOturanArama(''); }}
                  className="w-full text-left px-2 py-1 rounded-md text-[12px] cursor-pointer hover:bg-[#F3EFE8] dark:hover:bg-[#17345A]">
                  {i.title}
                </button>
              </li>
            ))}
            {!liste.length && <li className="px-2 py-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Eşleşen kişi yok.</li>}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">Haritaya işlemeyi beklemez; kayıttan sonra 3B'de görünür.</p>
      </div>
    );
  };

  const ARACLAR: Array<{ id: Arac; ad: string; Ikon: React.ElementType }> = [
    { id: 'gez', ad: 'Gez', Ikon: Hand },
    { id: 'sec', ad: 'Seç', Ikon: MousePointer2 },
    { id: 'ciz', ad: 'Yol', Ikon: PenLine },
    { id: 'bina', ad: 'Bina', Ikon: Home },
    { id: 'sablon', ad: 'Şablon', Ikon: LayoutGrid },
    { id: 'doldur', ad: 'Doldur', Ikon: Blocks },
    { id: 'ozel', ad: 'Özel yapı', Ikon: Pentagon },
    { id: 'doga', ad: 'Doğa', Ikon: TreePine },
    { id: 'bagla', ad: 'Madde bağla', Ikon: Link2 },
    { id: 'not', ad: 'Not', Ikon: StickyNote },
    { id: 'sil', ad: 'Kaldır', Ikon: Eraser }
  ];
  /** Bekleyen şablonu / kalıbı yerine koyar */
  function bekleyeniKoy() {
    if (!bekleyen) return;
    if (arac === 'sablon') sablonuKoy(bekleyen);
    else if (arac === 'ozel' && kalipId) kalibiKoy(bekleyen);
    setBekleyen(null);
  }
  const aracSec = (id: Arac) => { setArac(id); setCizilen([]); setCokgen([]); setImlec(null); setBekleyen(null); setSilAlani(null); setCoklu(null); setDoldurAlani(null); if (id !== 'sec' && id !== 'bagla') setSecili(null); setNotTaslagi(null); setYerlestirilen(null); };

  const ipucu = (() => {
    if (yerlestirilen?.notId) return 'Notun yeni yerine dokun.';
    if (yerlestirilen?.maddeId) return `${maddeAdi(yerlestirilen.maddeId)}: bir yapıya dokun (bağlanır) ya da boş bir yere (işaret olur).`;
    if (arac === 'not') return notTaslagi ? 'Notu yaz, "Kaydet"e bas. Başka yere dokunursan iğne oraya geçer.' : 'Not koymak istediğin yere dokun.';
    if (arac === 'ciz') return cizilen.length === 0
      ? `${turBilgisi(cizTur).ad}: ilk noktaya dokun. Yol ve kavşak yakınında nokta yapışır.`
      : `${cizilen.length} nokta · ${km(cizimUzunlugu)} — bitirmek için Enter, çift tık ya da "Bitir"`;
    if (arac === 'ozel' && kalipId) return bekleyen ? `${kalipBul(kalipId)?.ad} bekliyor: yönünü çevir, başka yere dokunup taşı; sonra Yerleştir ya da Vazgeç.` : `${kalipBul(kalipId)?.ad}: koymak istediğin yere dokun.`;
    if (arac === 'ozel' || arac === 'doga') return cokgen.length === 0
      ? `${arac === 'ozel' ? 'Özel yapı' : DOGA_TURLERI.find(d => d.id === dogaTur)!.ad}: köşelere sırayla dokun. İlk köşeye dönünce kapanır.`
      : `${cokgen.length} köşe · ${cokgen.length >= 3 ? `${Math.round(alan(cokgen))} m² — ilk köşeye dokun ya da Enter` : 'devam et'} · ⌫ son köşeyi siler`;
    if (arac === 'bagla') return 'Soldaki listeden bir maddeyi haritaya sürükle (ya da maddeye, sonra haritaya dokun). Yapıya dokunup sağdan da bağlayabilirsin.';
    if (arac === 'bina') return `${binaBilgisi(binaTur).ad}: dokun. Yola yakınsa yola dönük oturur.`;
    if (arac === 'sablon') return bekleyen ? `${SABLONLAR.find(x => x.id === sablonId)!.ad} bekliyor: yönünü ve boyutunu ayarla, başka yere dokunup taşı; sonra Yerleştir ya da Vazgeç.` : `${SABLONLAR.find(x => x.id === sablonId)!.ad}: koymak istediğin yere dokun.`;
    if (arac === 'doldur') return doldurAlani
      ? `${doldurOnizleme.length} ev bekliyor (${dokuBul(doku).ad}). Dokuyu değiştir ya da Karıştır; sonra Yerleştir ya da Vazgeç.`
      : 'Mahalle doldur: doldurmak istediğin yerin çevresine bir dikdörtgen çiz. İçindeki sokakların iki yanına evler dizilir.';
    if (arac === 'sil') return silAlanla ? 'Bir dikdörtgen çiz: içindeki yapılar ve yol parçaları birden kalkar. Geri al hepsini birden getirir.' : 'Yola dokununca iki kavşak arası kalkar; yapıya dokununca yapı. Kaldırılana dokununca geri gelir. Geri al da çalışır.';
    if (arac === 'sec') return seciliBina || seciliOzel
      ? 'Yapıyı sürükleyerek taşı; katını, türünü ve yönünü sağdaki karttan değiştir.'
      : seciliYol ? 'Yolun beyaz noktalarını sürükle. Bir parçasını silmek için Kaldır aracıyla o parçaya dokun.'
      : secAlanla ? (coklu ? 'Seçimin içinden tutup sürükle; hepsi birlikte taşınır. Geri al tek adımda geri getirir.' : 'Taşımak istediğin yerin çevresine bir dikdörtgen çiz.') : 'Bir yola, yapıya ya da doğa alanına dokun.';
    return null;
  })();

  const seciliVar = !!(seciliOzel || seciliBina || seciliYol || seciliDoga);

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-[#CFC5B4] dark:border-[#2C3C72] ${className ?? ''}`}>
      {/* Harita alanı */}
      <div
        ref={kutu}
        className={`absolute inset-0 bg-[#1C4E8C] touch-none select-none ${
          ['ciz', 'bina', 'sablon', 'doldur', 'sil', 'ozel', 'doga'].includes(arac) ? 'cursor-crosshair' : arac === 'gez' ? 'cursor-grab' : 'cursor-pointer'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={e => { basilanlar.current.delete(e.pointerId); cimdik.current = null; surukleme.current = null; setSilAlani(null); setSurukCoklu(null); }}
        onPointerLeave={() => { setImlec(null); setYapisma(null); }}
        onWheel={onWheel}
        onDoubleClick={() => { if (arac === 'ciz') bitir(); else if ((arac === 'ozel' || arac === 'doga') && cokgen.length >= 3) cokgeniBitir(); }}
        onDragOver={e => { if (e.dataTransfer.types.includes('text/kems-madde')) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; } }}
        onDrop={e => { const id = e.dataTransfer.getData('text/kems-madde'); if (id) { e.preventDefault(); void yerlestir({ maddeId: id }, e.clientX, e.clientY); } }}
        data-kurucu-alan
      >
        <svg width={boyut.w} height={boyut.h} viewBox={`${gorunum.x} ${gorunum.y} ${gorunum.w} ${h}`} className="block">
          <defs>
            <pattern id="agac-deseni" width={14} height={14} patternUnits="userSpaceOnUse">
              <circle cx={4} cy={4} r={3.2} fill="#46643A" opacity={0.85} />
              <circle cx={11} cy={10} r={2.8} fill="#3C5A33" opacity={0.85} />
            </pattern>
            <pattern id="zeytin-deseni" width={10} height={10} patternUnits="userSpaceOnUse">
              <circle cx={5} cy={5} r={2.4} fill="#6F8747" opacity={0.9} />
            </pattern>
          </defs>

          {/* Fiziki ada: yükselti verisinden üretilen doku (29 Eylül) */}
          <image href={`${import.meta.env.BASE_URL || '/'}ada-fiziki.webp`} x={fiziki.x} y={fiziki.y}
            width={fiziki.w} height={fiziki.h} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />

          {/* Haritanın zeytinlik, tarla ve bağları (8 Ekim): düzenlerken görünsün diye kesik çizgili sınır */}
          {(katman.doga ? zemin.araziler : []).map(a => {
            const r = ARAZI_RENGI[a.tur] ?? ARAZI_RENGI.tarla;
            return (
              <g key={a.id} style={{ pointerEvents: 'none' }}>
                <path d={halkaYolu([a.halka])} fill={r.renk} fillOpacity={DUZ_ZEMIN.has(a.tur) ? 0.9 : 0.45} stroke={r.kenar} strokeWidth={px(1.4)}
                  strokeDasharray={DUZ_ZEMIN.has(a.tur) ? undefined : `${px(5)} ${px(3)}`} strokeLinejoin="round" />
                {a.tur === 'zeytinlik' && <path d={halkaYolu([a.halka])} fill="url(#zeytin-deseni)" />}
              </g>
            );
          })}

          {/* Doğa alanları */}
          {(katman.doga ? dogaAlanlari : []).map(d => {
            const bi = DOGA_TURLERI.find(x => x.id === d.tur)!;
            const sec = d.id === secili;
            return (
              <g key={d.id} data-doga={d.id}>
                {/* Açık renkli dış kontur: yeşil zeminde kaybolmasın (8 Ekim) */}
                <path d={halkaYolu([d.m])} fill="none" stroke="#FAF8F5" strokeOpacity={0.85} strokeWidth={px(sec ? 4.5 : 3.2)} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                <path d={halkaYolu([d.m])} fill={bi.renk} fillOpacity={0.55} stroke={sec ? '#F26B6F' : bi.kenar} strokeWidth={px(sec ? 2.5 : 1.6)} strokeLinejoin="round" />
                {d.tur !== 'kumsal' && <path d={halkaYolu([d.m])} fill={`url(#${d.tur === 'orman' ? 'agac' : 'zeytin'}-deseni)`} style={{ pointerEvents: 'none' }} />}
              </g>
            );
          })}

          {/* Evlerin arsaları: evin parçası; tıklayınca ev seçilir */}
          {(katman.binalar ? arsalar : []).map(a => {
            if (a.gizli) return null;
            const kay = surukBina && lider(a.ev) === surukBina.id ? `translate(${surukBina.m[0] - surukBina.bas[0]} ${surukBina.m[1] - surukBina.bas[1]})` : undefined;
            return (
              <path key={a.id} data-bina={a.ev} transform={kay} d={halkaYolu([a.k])}
                fill={lider(a.ev) === secili ? '#E4EFC9' : '#CFE0B4'} fillOpacity={0.9}
                stroke="#B49A78" strokeWidth={px(0.7)} />
            );
          })}

          {/* Yollar: önce kenarlar, sonra dolgu */}
          {(katman.yollar ? gorunenYollar : []).map(y => {
            if (y.gizli && !gizliGoster) return null;
            const b = turBilgisi(y.tur);
            if (y.gizli || !b.kenar) return null;
            return <path key={`k-${y.id}`} d={parcaYolu(y)} fill="none" stroke={b.kenar}
              strokeWidth={yk(b.kalinlik + 2)} strokeLinecap="round" strokeLinejoin="round" />;
          })}
          {(katman.yollar ? gorunenYollar : []).map(y => {
            if (y.gizli && !gizliGoster) return null;
            const b = turBilgisi(y.tur);
            const sec = y.id === secili;
            return (
              <g key={y.id} data-yol={y.id}>
                <path d={parcaYolu(y)} fill="none" stroke="transparent" strokeWidth={px(14)} />
                {sec && <path d={parcaYolu(y)} fill="none" stroke="#F26B6F" strokeOpacity={0.45}
                  strokeWidth={yk(b.kalinlik) + px(6)} strokeLinecap="round" strokeLinejoin="round" />}
                <path d={parcaYolu(y)} fill="none"
                  stroke={y.gizli ? '#F26B6F' : b.renk} strokeOpacity={y.gizli ? 0.5 : 1}
                  strokeWidth={y.gizli ? px(1.5) : yk(b.kalinlik)}
                  strokeDasharray={y.gizli ? `${px(4)} ${px(4)}` : b.kesik ? b.kesik.split(' ').map(n => px(Number(n))).join(' ') : undefined}
                  strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}

          {/* Binalar */}
          {(katman.binalar ? binalar : []).map(bn => {
            if (bn.gizli && !gizliGoster) return null;
            const bi = bn.tur ? binaBilgisi(bn.tur) : null;
            const sec = lider(bn.id) === secili;
            const bagli = !!(taslak.baglar[bn.id] ?? bn.wikiId);
            const kay = surukBina && lider(bn.id) === surukBina.id ? `translate(${surukBina.m[0] - surukBina.bas[0]} ${surukBina.m[1] - surukBina.bas[1]})` : undefined;
            return (
              <g key={bn.id} data-bina={bn.id} transform={kay} style={sec && arac === 'sec' ? { cursor: 'move' } : undefined}>
                {!bn.gizli && !bi?.yuvarlak && <path d={halkaYolu([bn.kose.map(p => [p[0] + px(2), p[1] + px(2)] as Nokta)])} fill="rgba(14,28,79,0.25)" />}
                {bi?.yuvarlak ? (
                  <circle cx={bn.m[0]} cy={bn.m[1]} r={(bn.en ?? 10) / 2}
                    fill={bn.gizli ? 'none' : bi.renk} fillOpacity={0.95}
                    stroke={sec ? '#F26B6F' : bn.gizli ? '#F26B6F' : bi.kenar} strokeWidth={px(sec ? 2.5 : 0.8)}
                    strokeDasharray={bn.gizli ? `${px(3)} ${px(3)}` : undefined} />
                ) : (
                  <path d={halkaYolu([bn.kose])}
                    fill={bn.gizli ? 'none' : bi ? bi.renk : '#E9E1D3'}
                    stroke={sec ? '#F26B6F' : bn.gizli ? '#F26B6F' : bagli ? '#0E1C4F' : bi ? bi.kenar : '#8C7B63'}
                    strokeWidth={px(sec ? 2.5 : bagli ? 1.4 : 0.8)}
                    strokeDasharray={bn.gizli || (bn.tur === 'meydan') ? `${px(3)} ${px(3)}` : undefined} />
                )}
              </g>
            );
          })}

          {/* Özel yapılar: gölge + taban + kat yazısı */}
          {(katman.binalar ? ozelYapilar : []).map(o => {
            const k = ozelKoseleri(o);
            const sec = o.id === secili;
            const c = cokgenMerkezi(k);
            const golge = px(2) + o.kat * px(0.9);
            // Küçük görünen yapıda yazı binayı örtmesin: yalnız seçiliyken ya da yeterince büyükken
            const xler = k.map(p => p[0]);
            const yaziSigar = (Math.max(...xler) - Math.min(...xler)) / px(1) > 56;
            const kay = surukBina?.id === o.id ? `translate(${surukBina.m[0] - surukBina.bas[0]} ${surukBina.m[1] - surukBina.bas[1]})` : undefined;
            return (
              <g key={o.id} data-ozel={o.id} transform={kay} style={sec && arac === 'sec' ? { cursor: 'move' } : undefined}>
                <path d={halkaYolu([k.map(p => [p[0] + golge, p[1] + golge] as Nokta)])} fill="rgba(14,28,79,0.3)" />
                <path d={halkaYolu([k])} fill="#F3EDE2" stroke={sec ? '#F26B6F' : '#8C7B63'} strokeWidth={px(sec ? 2.8 : 1.2)} />
                {o.cati === 'besik' && k.length === 4 && (
                  <line x1={(k[0][0] + k[3][0]) / 2} y1={(k[0][1] + k[3][1]) / 2} x2={(k[1][0] + k[2][0]) / 2} y2={(k[1][1] + k[2][1]) / 2}
                    stroke="#B8A588" strokeWidth={px(1.2)} />
                )}
                {(yaziSigar || sec) && (
                  <text x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="middle" fontSize={px(11)} fontWeight={600}
                    fill="#0E1C4F" style={{ pointerEvents: 'none' }}>
                    {maddeAdi(taslak.baglar[o.id]) ?? `${o.kat} kat`}
                  </text>
                )}
                {sec && arac === 'sec' && k.map((p, i) => (
                  <circle key={i} data-kose={`${o.id}|${i}`} cx={p[0]} cy={p[1]} r={px(6)}
                    fill="#fff" stroke="#F26B6F" strokeWidth={px(2)} style={{ cursor: 'move' }} />
                ))}
              </g>
            );
          })}

          {/* Seçili yolun noktaları: sürüklenir (30 Eylül). Sık noktalar ekranda seyreltilir */}
          {arac === 'sec' && (() => {
            const y = yollarCizim.find(o => o.id === secili);
            if (!y || y.gizli) return null;
            const tutamaclar: Array<{ anahtar: string; p: Nokta }> = [];
            const artilar: Array<{ anahtar: string; p: Nokta }> = [];
            const ekle = (liste: Nokta[], parca: number | 'k') => {
              let son: Nokta | null = null;
              liste.forEach((p, i) => {
                // İki komşu nokta ekranda yeterince uzaksa aralarına "+" (yeni nokta)
                const sonraki = liste[i + 1];
                if (sonraki && Math.hypot(sonraki[0] - p[0], sonraki[1] - p[1]) * olcek >= 34) {
                  artilar.push({ anahtar: `${y.id}|${parca}|${i}`, p: [(p[0] + sonraki[0]) / 2, (p[1] + sonraki[1]) / 2] });
                }
                const uc = i === 0 || i === liste.length - 1;
                if (!uc && son && Math.hypot(p[0] - son[0], p[1] - son[1]) * olcek < 14) return;
                son = p;
                tutamaclar.push({ anahtar: `${y.id}|${parca}|${i}`, p });
              });
            };
            if (y.yeni && y.kontrol) ekle(y.kontrol, 'k');
            else y.parcalar.forEach((h, pi) => ekle(h, pi));
            const secAnahtar = seciliNokta && seciliNokta.id === y.id ? `${y.id}|${seciliNokta.parca}|${seciliNokta.i}` : '';
            return (
              <>
                {artilar.map(t => (
                  <g key={`+${t.anahtar}`} data-yolekle={t.anahtar} style={{ cursor: 'copy' }}>
                    <circle cx={t.p[0]} cy={t.p[1]} r={px(5.5)} fill="#0E1C4F" fillOpacity={0.75} />
                    <path d={`M${t.p[0] - px(3)},${t.p[1]}H${t.p[0] + px(3)}M${t.p[0]},${t.p[1] - px(3)}V${t.p[1] + px(3)}`} stroke="#fff" strokeWidth={px(1.4)} />
                  </g>
                ))}
                {tutamaclar.map(t => (
                  <circle key={t.anahtar} data-yolnokta={t.anahtar} cx={t.p[0]} cy={t.p[1]} r={px(t.anahtar === secAnahtar ? 7 : 5)}
                    fill={t.anahtar === secAnahtar ? '#F26B6F' : '#fff'} stroke="#F26B6F" strokeWidth={px(2)} style={{ cursor: 'move' }} />
                ))}
              </>
            );
          })()}

          {/* Şablon ve bina önizlemesi */}
          {sablonOnizleme && (
            <g style={{ pointerEvents: 'none' }} opacity={0.75}>
              {sablonOnizleme.yollar.map((y, i) => (
                <path key={i} d={yolYolu(y.m)} fill="none" stroke="#F26B6F" strokeWidth={yk(turBilgisi(y.tur).kalinlik)} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {sablonOnizleme.binalar.map((b, i) => (
                binaBilgisi(b.tur).yuvarlak
                  ? <circle key={i} cx={b.m[0]} cy={b.m[1]} r={b.en / 2} fill="#F26B6F" fillOpacity={0.35} stroke="#F26B6F" strokeWidth={px(1)} />
                  : <path key={i} d={halkaYolu([binaKoseleri(b.m, b.en, b.boy, b.aci)])} fill="#F26B6F" fillOpacity={0.3} stroke="#F26B6F" strokeWidth={px(1)} />
              ))}
            </g>
          )}
          {arac === 'bina' && imlec && (() => {
            const t = binaTaslagi(imlec, binaTur);
            const bi = binaBilgisi(binaTur);
            return bi.yuvarlak
              ? <circle cx={t.m[0]} cy={t.m[1]} r={t.en / 2} fill={bi.renk} fillOpacity={0.6} stroke="#F26B6F" strokeWidth={px(1.5)} style={{ pointerEvents: 'none' }} />
              : <path d={halkaYolu([binaKoseleri(t.m, t.en, t.boy, t.aci)])} fill={bi.renk} fillOpacity={0.6} stroke="#F26B6F" strokeWidth={px(1.5)} style={{ pointerEvents: 'none' }} />;
          })()}
          {arac === 'ozel' && kalipId && (bekleyen ?? imlec) && (() => {
            const k = kalibiYerlestir(kalipBul(kalipId)!, (bekleyen ?? imlec)!, (kalipAci * Math.PI) / 180);
            return <path d={halkaYolu([k])} fill="#F26B6F" fillOpacity={0.3} stroke="#F26B6F" strokeWidth={px(1.5)} style={{ pointerEvents: 'none' }} />;
          })()}

          {/* Mahalle doldur: alan ve bekleyen evler */}
          {arac === 'doldur' && doldurAlani && (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={Math.min(doldurAlani.x0, doldurAlani.x1)} y={Math.min(doldurAlani.y0, doldurAlani.y1)}
                width={Math.abs(doldurAlani.x1 - doldurAlani.x0)} height={Math.abs(doldurAlani.y1 - doldurAlani.y0)}
                fill="none" stroke="#F26B6F" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(4)}`} />
              {doldurOnizleme.map((b, i) => (
                <path key={i} d={halkaYolu([binaKoseleri(b.m, b.en, b.boy, b.aci)])} fill="#F26B6F" fillOpacity={0.35} stroke="#F26B6F" strokeWidth={px(0.8)} />
              ))}
            </g>
          )}

          {/* Alanla kaldır: çizilen dikdörtgen */}
          {silAlani && (
            <rect x={Math.min(silAlani.bas[0], silAlani.son[0])} y={Math.min(silAlani.bas[1], silAlani.son[1])}
              width={Math.abs(silAlani.son[0] - silAlani.bas[0])} height={Math.abs(silAlani.son[1] - silAlani.bas[1])}
              fill="#F26B6F" fillOpacity={0.15} stroke="#F26B6F" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(4)}`} style={{ pointerEvents: 'none' }} />
          )}

          {/* Toplu seçim: çerçeve ve (sürüklenirken) yeni yerindeki gölgesi */}
          {coklu && (() => {
            const dx = surukCoklu ? surukCoklu.m[0] - surukCoklu.bas[0] : 0;
            const dy = surukCoklu ? surukCoklu.m[1] - surukCoklu.bas[1] : 0;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={coklu.x0 + dx} y={coklu.y0 + dy} width={coklu.x1 - coklu.x0} height={coklu.y1 - coklu.y0}
                  fill="#0E1C4F" fillOpacity={0.08} stroke="#0E1C4F" strokeWidth={px(1.5)} strokeDasharray={`${px(6)} ${px(4)}`} />
                {binalar.filter(b => coklu.binalar.includes(b.id)).map(b => (
                  <path key={b.id} d={halkaYolu([b.kose.map(p => [p[0] + dx, p[1] + dy] as Nokta)])} fill="none" stroke="#F26B6F" strokeWidth={px(1.5)} />
                ))}
              </g>
            );
          })()}

          {/* Etiketler: yalnız ad (mahalle sınırı çizilmez) */}
          {(katman.adlar ? zemin.etiketler : []).map((et, i) => gorunenEtiketler.has(i) && (
            <text key={i} x={et.m[0]} y={et.m[1]} textAnchor="middle"
              fontSize={px(et.tur === 'mahalle' ? 13 : 10)} fontWeight={et.tur === 'mahalle' ? 700 : 500}
              letterSpacing={et.tur === 'mahalle' ? px(2.5) : 0}
              fill="#FAF8F5" stroke="rgba(14,28,79,0.55)" strokeWidth={px(3)} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
              {et.tur === 'mahalle' ? et.ad.toLocaleUpperCase('tr') : et.ad}
            </text>
          ))}

          {/* İşaretler (5. gece): not iğnesi hardal, madde iğnesi kiremit */}
          {[...isaretler.filter(i => (i.tur === 'not' ? katman.notlar : katman.maddeler)),
            ...(notTaslagi ? [{ id: '__yeni', tur: 'not' as const, ad: notTaslagi.baslik || 'Yeni not', konum: derceye(notTaslagi.m) as [number, number] }] : [])
          ].map(i => {
            const p = metreye(i.konum);
            const sec = i.id === seciliIsaret || i.id === '__yeni';
            const r0 = px(sec ? 8.5 : 7);
            return (
              <g key={i.id} data-isaret={i.id === '__yeni' ? undefined : i.id} transform={`translate(${p[0]} ${p[1]})`} style={{ cursor: 'pointer' }}>
                <path d={`M0,0 C${-r0 * 0.45},${-r0 * 0.9} ${-r0},${-r0 * 1.3} ${-r0},${-r0 * 2} A${r0},${r0} 0 1 1 ${r0},${-r0 * 2} C${r0},${-r0 * 1.3} ${r0 * 0.45},${-r0 * 0.9} 0,0Z`}
                  fill={i.tur === 'not' ? '#C99A2E' : '#F26B6F'} stroke={sec ? '#FAF8F5' : '#0E1C4F'} strokeWidth={px(sec ? 2 : 1.2)} />
                <circle cy={-r0 * 2} r={r0 * 0.38} fill="#FAF8F5" />
                <text y={-r0 * 3.3} textAnchor="middle" fontSize={px(10.5)} fontWeight={600}
                  fill="#FAF8F5" stroke="rgba(14,28,79,0.7)" strokeWidth={px(3)} paintOrder="stroke">
                  {i.ad}
                </text>
              </g>
            );
          })}

          {/* Çizilen yol */}
          {arac === 'ciz' && cizilen.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <path d={yolYolu(cizilen.length >= 3 ? egri(cizilen) : cizilen)} fill="none" stroke="#F26B6F"
                strokeWidth={yk(turBilgisi(cizTur).kalinlik)} strokeLinecap="round" strokeLinejoin="round" />
              {imlec && <path d={yolYolu([cizilen[cizilen.length - 1], imlec])} fill="none" stroke="#F26B6F" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(4)}`} />}
              {cizilen.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={px(i === 0 ? 5 : 3.5)} fill={i === 0 ? '#F3EFE8' : '#F26B6F'} stroke="#0E1C4F" strokeWidth={px(1.2)} />
              ))}
            </g>
          )}
          {(arac === 'ciz' || surukYol) && yapisma && (
            <circle cx={yapisma.m[0]} cy={yapisma.m[1]} r={px(yapisma.tur === 'hat' ? 6 : 8)} fill="none" stroke="#0E1C4F" strokeWidth={px(2)} style={{ pointerEvents: 'none' }} />
          )}

          {/* Çizilen özel yapı / doğa çokgeni */}
          {(arac === 'ozel' || arac === 'doga') && cokgen.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <path d={'M' + cokgen.map(p => `${p[0]},${p[1]}`).join('L')} fill="rgba(242,107,111,0.2)" stroke="#F26B6F" strokeWidth={px(2.5)} />
              {imlec && <path d={`M${cokgen[cokgen.length - 1][0]},${cokgen[cokgen.length - 1][1]}L${imlec[0]},${imlec[1]}L${cokgen[0][0]},${cokgen[0][1]}`}
                fill="none" stroke="#F26B6F" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(4)}`} />}
              {cokgen.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={px(i === 0 ? 6 : 4)} fill="#fff" stroke="#F26B6F" strokeWidth={px(2.2)} />
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Sol üst: başlık ve görünüm düğmesi (Düzada'dan) */}
      {ustSol && <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 pointer-events-none [&>*]:pointer-events-auto">{ustSol}</div>}

      {/* Sağ üst: her şey haritadaysa yalnız küçük bir işaret (29 Eylül gece) */}
      {!islenmemis && !isleOnay && !isleniyor && !isleRaporu && (
        <div className={`${kart} absolute right-3 top-16 sm:top-3 z-10 px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#2F7A45] dark:text-[#9FD3A9]`} title={kayitYazisi[durum]}>
          <MapPinned className="w-3.5 h-3.5" /> Haritada ✓
        </div>
      )}
      {/* Sağ üst: işlenmemiş değişiklik varken taslak ve Haritaya işle */}
      {(islenmemis || isleOnay || isleniyor || !!isleRaporu) && (
      <div className={`${kart} absolute right-3 top-16 sm:top-3 z-10 px-3 py-2 flex flex-wrap items-center gap-2 text-[12px] max-w-[calc(100%-1.5rem)]`}>
        <span>{islenmemis ? <>Taslak · <b className="text-[#D6484C] dark:text-[#F26B6F]">işlenmemiş değişiklik var</b></> : 'Taslak haritada'}</span>
        <span className="hidden sm:inline text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">{kayitYazisi[durum]}</span>
        <button type="button" onClick={geriAl} disabled={adim === 0} className={dugmeBos} title="Geri al (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={yinele} disabled={adim >= gecmis.length - 1} className={`${dugmeBos} hidden sm:flex`} title="Yinele (Ctrl+Y)"><Redo2 className="w-3.5 h-3.5" /></button>
        {isleOnay ? (
          <>
            <span className="text-[11px] font-semibold text-[#D6484C] dark:text-[#F26B6F]">Haritaya işlensin mi?</span>
            <button type="button" onClick={() => setIsleOnay(false)} className={dugmeBos}>Vazgeç</button>
            <button type="button" onClick={haritayaIsle} className="px-3 py-1.5 rounded-lg bg-[#F26B6F] text-white text-[11px] font-semibold cursor-pointer">Evet, işle</button>
          </>
        ) : (
          <button type="button" onClick={() => { setIsleRaporu(null); setIsleOnay(true); }} disabled={!islenmemis || isleniyor}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F26B6F] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40">
            <MapPinned className="w-3.5 h-3.5" />{isleniyor ? 'İşleniyor…' : islenmemis ? 'Haritaya işle' : 'Haritada'}
          </button>
        )}
        {islenmemis && !isleOnay && (
          <span className="basis-full flex flex-wrap items-center gap-2 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            <span>Fark: {farklar.join(' · ') || 'küçük'}</span>
            <button type="button" onClick={haritadakineDon} className="underline cursor-pointer hover:text-[#D6484C]">Haritadaki hâle döndür</button>
          </span>
        )}
        {isleRaporu && <span className="basis-full text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">{isleRaporu}</span>}
      </div>
      )}

      {/* Yakınlaştırma */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1">
        <button type="button" onClick={() => yakinlas(1 / 1.5)} aria-label="Yakınlaştır" title="Yakınlaştır" className={`${kart} w-9 h-9 flex items-center justify-center cursor-pointer`}><Plus className="w-4 h-4" /></button>
        <button type="button" onClick={() => yakinlas(1.5)} aria-label="Uzaklaştır" title="Uzaklaştır" className={`${kart} w-9 h-9 flex items-center justify-center cursor-pointer`}><Minus className="w-4 h-4" /></button>
      </div>

      {/* İpucu */}
      {ipucu && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${islenmemis || isleRaporu ? 'top-[12rem]' : 'top-[6.75rem]'} sm:top-16 z-10 max-w-[88%] sm:max-w-[80%] px-3 py-1.5 rounded-2xl sm:rounded-full bg-[#0E1C4F]/85 text-[11px] text-[#F3EFE8] pointer-events-none text-center`}>
          {ipucu}
        </div>
      )}
      {uyari && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-40 z-20 px-3 py-1.5 rounded-lg bg-[#F26B6F] text-[12px] text-white shadow pointer-events-none">
          {uyari}
        </div>
      )}

      {/* Sağ: seçili nesnenin kartı */}
      {seciliVar && (arac === 'sec' || arac === 'bagla') && (
        <div className={`${kart} absolute z-10 right-3 top-16 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-13rem)] overflow-y-auto p-3 text-[12px]`}>
          <div className="flex items-start justify-between gap-2">
            <div className={etiket}>{seciliOzel ? 'Seçili · özel yapı' : seciliBina ? 'Seçili · yapı' : seciliYol ? 'Seçili · yol' : 'Seçili · doğa'}</div>
            <button type="button" onClick={() => setSecili(null)} aria-label="Kapat" title="Kapat" className="p-0.5 cursor-pointer text-[#6A5E4C] dark:text-[#A6B0C9]"><X className="w-3.5 h-3.5" /></button>
          </div>

          {seciliOzel && (() => {
            const kl = kalipBul(seciliOzel.kalip);
            const ustYol = ustundekiYol(ozelKoseleri(seciliOzel));
            return (
              <>
                <div className="mt-1 text-[15px] font-bold">{maddeAdi(taslak.baglar[seciliOzel.id]) ?? kl?.ad ?? 'Özel yapı'}</div>
                <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{kl ? `Kalıp: ${kl.ad}` : 'Elle çizildi'} · taban {Math.round(alan(seciliOzel.m))} m²</div>
                {ustYol && (
                  <div className="mt-1.5 rounded-lg bg-[#F26B6F]/12 text-[#B83A3F] dark:text-[#F26B6F] text-[11px] px-2 py-1">
                    Yolun üstüne biniyor: {ustYol.ad}. Köşeleri sürükleyip yoldan çek.
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-10">Kat</span>
                  <button type="button" aria-label="Kat azalt" title="Kat azalt" className={dugmeBos} onClick={() => ozelDegistir(seciliOzel.id, o => ({ ...o, kat: Math.max(1, o.kat - 1) }))}><Minus className="w-3 h-3" /></button>
                  <b className="w-6 text-center tabular-nums">{seciliOzel.kat}</b>
                  <button type="button" aria-label="Kat ekle" title="Kat ekle" className={dugmeBos} onClick={() => ozelDegistir(seciliOzel.id, o => ({ ...o, kat: Math.min(30, o.kat + 1) }))}><Plus className="w-3 h-3" /></button>
                  <span className="text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">≈ {Math.round(seciliOzel.kat * 3.2)} m</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="w-10">Çatı</span>
                  <button type="button" className={cip(seciliOzel.cati === 'duz')} onClick={() => ozelDegistir(seciliOzel.id, o => ({ ...o, cati: 'duz' }))}>Düz</button>
                  <button type="button" className={cip(seciliOzel.cati === 'besik')} onClick={() => ozelDegistir(seciliOzel.id, o => ({ ...o, cati: 'besik' }))}>Beşik</button>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button type="button" className={`${dugmeBos} flex-1`} onClick={() => ozelDondur(seciliOzel.id, -15)}><RotateCcw className="w-3.5 h-3.5" />Döndür</button>
                  <button type="button" className={`${dugmeBos} flex-1`} onClick={() => ozelDondur(seciliOzel.id, 15)}><RotateCw className="w-3.5 h-3.5" />Döndür</button>
                </div>
                <p className="mt-1.5 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">Köşeleri düzeltmek için beyaz noktaları sürükle.</p>
                {maddeBagi(seciliOzel.id)}
                <button type="button" onClick={() => { taslaktanSil(seciliOzel.id); setSecili(null); }}
                  className="mt-2 w-full py-1.5 rounded-lg border border-[#F26B6F] text-[#D6484C] dark:text-[#F26B6F] text-[11px] cursor-pointer hover:bg-[#F26B6F]/10">Sil</button>
              </>
            );
          })()}

          {seciliBina && (() => {
            // Kurucu'da konan yapı kendi kaydında, haritadan gelen düzeltme olarak değişir (30 Eylül)
            const b = seciliBina;
            const kat = b.kat ?? (b.tur ? binaBilgisi(b.tur).kat : 1) ?? 1;
            const katYaz = (k: number) => {
              const yeni = Math.min(Math.max(k, 1), 30);
              if (b.yeni) binaDegistir(b, x => ({ ...x, kat: yeni }));
              else haritaBinaDuzelt(b.id, d => ({ ...d, kat: yeni }));
            };
            const dondur = (a: number) => yapiDondur(b.id, a);
            const uyeSayisi = grubu(b.id).length;
            const turYaz = (tur: BinaTuru) => {
              if (b.yeni) binaDegistir(b, x => ({ ...x, tur, en: binaBilgisi(tur).en, boy: binaBilgisi(tur).boy }));
              else haritaBinaDuzelt(b.id, d => ({ ...d, tur }));
            };
            return (
            <>
              <div className="mt-1 text-[15px] font-bold">{maddeAdi(taslak.baglar[b.id] ?? b.wikiId) ?? (b.tur ? binaBilgisi(b.tur).ad : b.ad)}</div>
              <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                {b.yeni ? 'Kurucu\'da kondu' : `Haritadan${b.haritaTur ? ` · ${b.haritaTur}` : ''}`}{b.duzeltme ? ' · düzenlendi' : ''}
                {uyeSayisi > 1 && <> · <b>tek parça, {uyeSayisi} yapı</b></>}
              </div>
              {!b.gizli && (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-10">Kat</span>
                    <button type="button" aria-label="Kat azalt" title="Kat azalt" className={dugmeBos} onClick={() => katYaz(kat - 1)} disabled={kat <= 1}><Minus className="w-3 h-3" /></button>
                    <b className="w-6 text-center tabular-nums">{kat}</b>
                    <button type="button" aria-label="Kat ekle" title="Kat ekle" className={dugmeBos} onClick={() => katYaz(kat + 1)}><Plus className="w-3 h-3" /></button>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" className={`${dugmeBos} flex-1`} onClick={() => dondur(-Math.PI / 12)}><RotateCcw className="w-3.5 h-3.5" />Döndür</button>
                    <button type="button" className={`${dugmeBos} flex-1`} onClick={() => dondur(Math.PI / 12)}><RotateCw className="w-3.5 h-3.5" />Döndür</button>
                  </div>
                  {uyeSayisi === 1 && <div className="mt-2 grid grid-cols-2 gap-1">
                    {BINA_TURLERI.filter(x => x.elle && !x.yuvarlak && !['meydan', 'saha', 'bag', 'agac', 'cesme'].includes(x.id)).map(x => (
                      <button key={x.id} type="button" onClick={() => turYaz(x.id)} className={cip(b.tur === x.id)}>{x.ad}</button>
                    ))}
                  </div>}
                  <p className="mt-1.5 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">Taşımak için yapıyı sürükle.</p>
                  {grubu(b.id).some(u => taslak.binaDuzeni[u]) && (
                    <button type="button" onClick={() => grubu(b.id).forEach(haritaBinaSifirla)} className={`${dugmeBos} mt-1.5 w-full`}>Eski hâline döndür</button>
                  )}
                </>
              )}
              {maddeBagi(b.id, b.wikiId)}
              {!b.gizli && kurucuEvMi(b.tur, b.haritaTur) && oturanKutusu(b.id)}
              <button type="button" onClick={() => binaGizleGoster(b)}
                className="mt-2 w-full py-1.5 rounded-lg border border-[#F26B6F] text-[#D6484C] dark:text-[#F26B6F] text-[11px] cursor-pointer hover:bg-[#F26B6F]/10">
                {b.gizli ? 'Geri getir' : 'Kaldır'}
              </button>
            </>
            );
          })()}

          {seciliYol && !seciliBina && !seciliOzel && (
            <>
              <div className="mt-1 text-[15px] font-bold">{seciliYol.ad}</div>
              <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{seciliYol.yeni ? 'Kurucu\'da çizildi' : `Haritadan · ${seciliYol.haritaTur}`} · {km(seciliYol.parcalar.reduce((t, h) => t + uzunluk(h.map(derceye)), 0))}</div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {YOL_TURLERI.map(t => <button key={t.id} type="button" onClick={() => turDegistir(seciliYol, t.id)} className={cip(seciliYol.tur === t.id)}>{t.ad}</button>)}
              </div>
              {!seciliYol.gizli && (
                <div className="mt-2 flex gap-1">
                  <select value={dolguTur} onChange={e => setDolguTur(e.target.value as BinaTuru)}
                    className="flex-1 min-w-0 text-[11px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-transparent px-1">
                    {BINA_TURLERI.filter(b => ['ev', 'dukkanli', 'yazlik', 'ciftlik'].includes(b.id)).map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}
                  </select>
                  <button type="button" onClick={() => kenariDoldur(seciliYol, dolguTur)} className="px-2 py-1 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[11px] cursor-pointer">Kenarını doldur</button>
                </div>
              )}
              {!seciliYol.gizli && (
                <p className="mt-2 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                  Beyaz noktaları sürükleyerek yolu düzelt; noktaya dokunup bırakınca seçilir, "Seçili noktayı sil"le gider. Aradaki <b>+</b> yeni nokta koyar. Bir parçayı (iki kavşak arası) silmek için alttan <b>Kaldır</b>'ı seçip o parçaya dokun.
                </p>
              )}
              {seciliNokta && seciliNokta.id === seciliYol.id && (
                <button type="button" onClick={() => yolNoktasiSil(seciliNokta)}
                  className="mt-2 w-full py-1.5 rounded-lg bg-[#F26B6F] text-white text-[11px] font-semibold cursor-pointer">Seçili noktayı sil</button>
              )}
              {seciliYol.duzenli && (
                <button type="button" onClick={() => yolSifirla(seciliYol.id)} className={`${dugmeBos} mt-1.5 w-full`}>Eski hâline döndür</button>
              )}
              {!seciliYol.gizli && maddeBagi(seciliYol.id)}
              <button type="button" onClick={() => gizleGoster(seciliYol)}
                className="mt-2 w-full py-1.5 rounded-lg border border-[#F26B6F] text-[#D6484C] dark:text-[#F26B6F] text-[11px] cursor-pointer hover:bg-[#F26B6F]/10">
                {seciliYol.gizli ? 'Geri getir' : 'Bütün yolu kaldır'}
              </button>
            </>
          )}

          {seciliDoga && !seciliOzel && !seciliBina && !seciliYol && (
            <>
              <div className="mt-1 text-[15px] font-bold">{DOGA_TURLERI.find(d => d.id === seciliDoga.tur)!.ad}</div>
              <div className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{Math.round(alan(seciliDoga.m)).toLocaleString('tr-TR')} m²</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {DOGA_TURLERI.map(d => (
                  <button key={d.id} type="button" className={cip(seciliDoga.tur === d.id)}
                    onClick={() => degistir(t => ({ ...t, doga: { ...t.doga, [seciliDoga.id]: { ...t.doga[seciliDoga.id], tur: d.id } } }))}>{d.ad}</button>
                ))}
              </div>
              <button type="button" onClick={() => { taslaktanSil(seciliDoga.id); setSecili(null); }}
                className="mt-2 w-full py-1.5 rounded-lg border border-[#F26B6F] text-[#D6484C] dark:text-[#F26B6F] text-[11px] cursor-pointer hover:bg-[#F26B6F]/10">Sil</button>
            </>
          )}
        </div>
      )}

      {/* İşaret kartı (5. gece): yeni not ya da seçili iğne */}
      {(notTaslagi || seciliIsaret) && !seciliVar && (() => {
        const isr = seciliIsaret ? isaretler.find(i => i.id === seciliIsaret) : undefined;
        const kayit = isr ? items.find(i => i.id === (isr.tur === 'not' ? isr.id : isr.maddeId)) : undefined;
        const girdi = 'w-full text-[12px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A] px-2 py-1.5 focus:outline-hidden focus:border-[#F26B6F]';
        const kapat = () => { setNotTaslagi(null); isaretSec(null); };
        return (
          <div className={`${kart} absolute z-10 right-3 top-16 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-13rem)] overflow-y-auto p-3 text-[12px] space-y-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className={etiket}>{notTaslagi ? 'Yeni not' : isr?.tur === 'not' ? 'Not' : 'Madde işareti'}</div>
              <button type="button" onClick={kapat} aria-label="Kapat" title="Kapat" className="p-0.5 cursor-pointer text-[#6A5E4C] dark:text-[#A6B0C9]"><X className="w-3.5 h-3.5" /></button>
            </div>
            {notTaslagi && (
              <>
                <input value={notTaslagi.baslik} onChange={e => setNotTaslagi(n => n && { ...n, baslik: e.target.value })} placeholder="Başlık (isteğe bağlı)" className={girdi} />
                <textarea value={notTaslagi.metin} onChange={e => setNotTaslagi(n => n && { ...n, metin: e.target.value })} rows={3} placeholder="Not" className={girdi} autoFocus />
                <div className="flex gap-1.5">
                  <button type="button" onClick={notuKaydet} disabled={isaretYaziliyor || !onAddItem || (!notTaslagi.baslik.trim() && !notTaslagi.metin.trim())}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40"><Check className="w-3.5 h-3.5" />Kaydet</button>
                  <button type="button" onClick={() => setNotTaslagi(null)} className={dugmeBos}>Vazgeç</button>
                </div>
                <p className="text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">Not ayrı küçük bir kayıt olur; maddeye bağlı değildir.</p>
              </>
            )}
            {isr && isr.tur === 'not' && kayit && (
              isaretDuzen ? (
                <>
                  <input value={isaretDuzen.baslik} onChange={e => setIsaretDuzen(d => d && { ...d, baslik: e.target.value })} className={girdi} />
                  <textarea value={isaretDuzen.metin} onChange={e => setIsaretDuzen(d => d && { ...d, metin: e.target.value })} rows={4} className={girdi} />
                  <div className="flex gap-1.5">
                    <button type="button" disabled={isaretYaziliyor || !onUpdateItem}
                      onClick={() => onUpdateItem && void isaretYaz(async () => { await onUpdateItem(notGuncelle(kayit, isaretDuzen)); setIsaretDuzen(null); }, 'Not kaydedildi.')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40"><Check className="w-3.5 h-3.5" />Kaydet</button>
                    <button type="button" onClick={() => setIsaretDuzen(null)} className={dugmeBos}>Vazgeç</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-semibold">{isr.ad}</div>
                  {isr.metin && <p className="whitespace-pre-line leading-relaxed">{isr.metin}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setIsaretDuzen({ baslik: kayit.title, metin: kayit.notes || '' })} className={dugmeBos}><PenLine className="w-3 h-3" />Düzenle</button>
                    <button type="button" onClick={() => { setYerlestirilen({ notId: kayit.id }); isaretSec(null); }} className={dugmeBos}><Move className="w-3 h-3" />Taşı</button>
                    {silOnayi ? (
                      <button type="button" disabled={isaretYaziliyor || !onDeleteItem}
                        onClick={() => onDeleteItem && void isaretYaz(async () => { await onDeleteItem(kayit.id); isaretSec(null); }, 'Not silindi.')}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F26B6F] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40">Evet, sil</button>
                    ) : (
                      <button type="button" onClick={() => setSilOnayi(true)} className={dugmeBos}><Trash2 className="w-3 h-3" />Sil</button>
                    )}
                  </div>
                </>
              )
            )}
            {isr && isr.tur === 'madde' && kayit && (
              <>
                <div className="text-[13px] font-semibold">{isr.ad}</div>
                <div className="flex flex-wrap gap-1.5">
                  {onMaddeAc && <button type="button" onClick={() => onMaddeAc(kayit.id)} className={dugmeBos}><ExternalLink className="w-3 h-3" />Maddeyi aç</button>}
                  <button type="button" onClick={() => { setYerlestirilen({ maddeId: kayit.id }); isaretSec(null); }} className={dugmeBos}><Move className="w-3 h-3" />Taşı</button>
                  <button type="button" disabled={isaretYaziliyor || !onUpdateItem}
                    onClick={() => onUpdateItem && void isaretYaz(async () => { await onUpdateItem(maddeIsareti(kayit, null)); isaretSec(null); }, 'İşaret kaldırıldı.')}
                    className={dugmeBos}><X className="w-3 h-3" />İşareti kaldır</button>
                </div>
                <p className="text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">İşaret maddenin kaydında durur; madde silinmez.</p>
              </>
            )}
          </div>
        );
      })()}

      {/* Maddeler listesi (5. gece): Madde bağla aracında; sürükle ya da dokun-bırak */}
      {arac === 'bagla' && (() => {
        const q = maddeAra.trim().toLocaleLowerCase('tr');
        const haritada = new Set([...Object.values(taslak.baglar), ...binalar.map(b => b.wikiId).filter(Boolean) as string[], ...isaretler.map(i => i.maddeId).filter(Boolean) as string[]]);
        const liste = baglanabilir.filter(i => !q || i.title.toLocaleLowerCase('tr').includes(q))
          .sort((a, b) => Number(haritada.has(a.id)) - Number(haritada.has(b.id)) || a.title.localeCompare(b.title, 'tr'));
        return (
          <div className={`${kart} absolute z-10 left-3 top-16 w-60 max-w-[calc(100%-1.5rem)] p-2.5 text-[12px] ${maddeListesiAcik ? 'max-h-[calc(100%-14rem)] flex flex-col' : ''}`}>
            <button type="button" onClick={() => setMaddeListesiAcik(a => !a)} className={`${etiket} w-full text-left cursor-pointer`}>
              Maddeler · {liste.length} {maddeListesiAcik ? '▾' : '▸'}
            </button>
            {maddeListesiAcik && (
              <>
                <input value={maddeAra} onChange={e => setMaddeAra(e.target.value)} placeholder="Madde ara…"
                  className="mt-1.5 w-full text-[12px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A] px-2 py-1.5 focus:outline-hidden focus:border-[#F26B6F]" />
                <ul className="mt-1.5 overflow-y-auto min-h-0 space-y-0.5">
                  {liste.map(i => (
                    <li key={i.id}>
                      <button type="button" draggable
                        onDragStart={e => { e.dataTransfer.setData('text/kems-madde', i.id); e.dataTransfer.effectAllowed = 'link'; }}
                        onClick={() => setYerlestirilen(y => (y?.maddeId === i.id ? null : { maddeId: i.id }))}
                        title="Haritaya sürükle ya da dokun, sonra haritaya dokun"
                        className={`w-full flex items-center gap-1.5 text-left px-2 py-1 rounded-md cursor-grab hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] ${yerlestirilen?.maddeId === i.id ? 'ring-2 ring-[#F26B6F]' : ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${haritada.has(i.id) ? 'bg-[#2F7A45]' : 'bg-[#CFC5B4]'}`} />
                        <span className="flex-1 min-w-0 truncate">{i.title}</span>
                        {haritada.has(i.id) && <span className="text-[10px] text-[#2F7A45] dark:text-[#9FD3A9]">haritada</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })()}

      {/* Alt: seçili aracın ayarları + araç çubuğu */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10 flex flex-col items-center gap-2 w-[calc(100%-1.5rem)] max-w-max">
        {arac === 'ciz' && (
          <div className={`${kart} flex items-center gap-2 px-3 py-2 max-w-full overflow-x-auto whitespace-nowrap`}>
            <span className={etiket}>Yol türü</span>
            {YOL_TURLERI.map(t => <button key={t.id} type="button" onClick={() => setCizTur(t.id)} className={cip(cizTur === t.id)} title={t.aciklama}>{t.ad}</button>)}
            <button type="button" onClick={() => bitir()} disabled={cizilen.length < 2} className={dugmeBos}><Check className="w-3.5 h-3.5" />Bitir</button>
            <button type="button" onClick={() => { setCizilen([]); setKavsakAdaylari([]); }} disabled={!cizilen.length} className={dugmeBos}><X className="w-3.5 h-3.5" />Vazgeç</button>
            <button type="button" onClick={() => setMiknatis(v => !v)} className={cip(miknatis)} title="Başka yollara yapış">Mıknatıs</button>
          </div>
        )}
        {arac === 'sec' && (
          <div className={`${kart} flex items-center gap-2 px-3 py-2 max-w-full overflow-x-auto whitespace-nowrap`}>
            <span className={etiket}>Seç</span>
            <button type="button" onClick={() => { setSecAlanla(false); setCoklu(null); }} className={cip(!secAlanla)}>Tek tek</button>
            <button type="button" onClick={() => { setSecAlanla(true); setSecili(null); }} className={cip(secAlanla)}>Alanla</button>
            <button type="button" onClick={() => setMiknatis(v => !v)} className={cip(miknatis)} title="Yol noktası sürüklenirken başka yollara yapışsın">Mıknatıs</button>
            {coklu ? (
              <>
                <span className="text-[11px]">{coklu.binalar.length} yapı{coklu.yollar.length ? ` · ${coklu.yollar.length} yol` : ''} · içinden tutup sürükle</span>
                <button type="button" onClick={() => { topluKaldir([coklu.x0, coklu.y0], [coklu.x1, coklu.y1]); setCoklu(null); }} className={dugmeBos}>Kaldır</button>
                <button type="button" onClick={() => setCoklu(null)} className={dugmeBos}><X className="w-3.5 h-3.5" />Vazgeç</button>
              </>
            ) : secAlanla && <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Taşımak istediğin yerin çevresine dikdörtgen çiz</span>}
          </div>
        )}
        {arac === 'sil' && (
          <div className={`${kart} flex items-center gap-2 px-3 py-2 max-w-full overflow-x-auto whitespace-nowrap`}>
            <span className={etiket}>Kaldır</span>
            <button type="button" onClick={() => setSilAlanla(false)} className={cip(!silAlanla)}>Tek tek</button>
            <button type="button" onClick={() => setSilAlanla(true)} className={cip(silAlanla)}>Alanla</button>
            <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{silAlanla ? 'Parmağınla bir dikdörtgen çiz; içindekiler birden kalkar' : 'Yola ya da yapıya dokun'}</span>
          </div>
        )}
        {arac === 'bina' && (
          <div className={`${kart} flex lg:flex-wrap items-center gap-1.5 px-3 py-2 max-w-full lg:max-w-[900px] overflow-x-auto whitespace-nowrap lg:whitespace-normal`}>
            <span className={etiket}>Bina</span>
            {BINA_TURLERI.filter(b => b.elle).map(b => <button key={b.id} type="button" onClick={() => setBinaTur(b.id)} className={cip(binaTur === b.id)}>{b.ad}</button>)}
          </div>
        )}
        {arac === 'sablon' && (
          <div className={`${kart} flex lg:flex-wrap items-center gap-2 px-3 py-2 max-w-full lg:max-w-[900px] overflow-x-auto whitespace-nowrap lg:whitespace-normal`}>
            <span className={etiket}>Şablon</span>
            {SABLONLAR.map(t => <button key={t.id} type="button" onClick={() => setSablonId(t.id)} className={cip(sablonId === t.id)} title={t.aciklama}>{t.ad}</button>)}
            <span className="text-[11px]">Yön</span>
            <input type="range" min={0} max={359} step={5} value={sablonAci} onChange={e => setSablonAci(Number(e.target.value))} />
            <span className="text-[11px]">Boyut</span>
            <input type="range" min={0.6} max={1.6} step={0.05} value={sablonOlcek} onChange={e => setSablonOlcek(Number(e.target.value))} />
            {bekleyen ? (
              <>
                <button type="button" onClick={bekleyeniKoy} className={dugmeBos}><Check className="w-3.5 h-3.5" />Yerleştir</button>
                <button type="button" onClick={() => setBekleyen(null)} className={dugmeBos}><X className="w-3.5 h-3.5" />Vazgeç</button>
              </>
            ) : <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Haritaya dokun: taslak orada bekler</span>}
          </div>
        )}
        {arac === 'doldur' && (
          <div className={`${kart} flex lg:flex-wrap items-center gap-2 px-3 py-2 max-w-full lg:max-w-[900px] overflow-x-auto whitespace-nowrap lg:whitespace-normal`}>
            <span className={etiket}>Doldur</span>
            {DOKULAR.map(d => <button key={d.id} type="button" onClick={() => setDoku(d.id)} className={cip(doku === d.id)} title={d.aciklama}>{d.ad}</button>)}
            {doldurAlani ? (
              <>
                <span className="text-[11px]">{doldurOnizleme.length} ev</span>
                <button type="button" onClick={() => setTohum(t => t + 1)} className={dugmeBos} title="Aynı alanı başka bir dizilişle doldur"><Shuffle className="w-3.5 h-3.5" />Karıştır</button>
                <button type="button" onClick={doldurKoy} disabled={!doldurOnizleme.length} className={dugmeBos}><Check className="w-3.5 h-3.5" />Yerleştir</button>
                <button type="button" onClick={() => setDoldurAlani(null)} className={dugmeBos}><X className="w-3.5 h-3.5" />Vazgeç</button>
              </>
            ) : <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Parmağınla bir dikdörtgen çiz</span>}
          </div>
        )}
        {arac === 'ozel' && (
          <div className={`${kart} flex lg:flex-wrap items-center gap-2 px-3 py-2 max-w-full lg:max-w-[1000px] overflow-x-auto whitespace-nowrap lg:whitespace-normal`}>
            <span className={etiket}>Özel yapı</span>
            <button type="button" onClick={() => setKalipId(null)} className={cip(!kalipId)}>Köşe köşe çiz</button>
            {!kalipId && (
              <>
                <span className="text-[11px]">Kat</span>
                <button type="button" className={dugmeBos} onClick={() => setOzelKat(k => Math.max(1, k - 1))}><Minus className="w-3 h-3" /></button>
                <b className="text-[12px] tabular-nums">{ozelKat}</b>
                <button type="button" className={dugmeBos} onClick={() => setOzelKat(k => Math.min(30, k + 1))}><Plus className="w-3 h-3" /></button>
                <button type="button" className={cip(ozelCati === 'duz')} onClick={() => setOzelCati('duz')}>Düz çatı</button>
                <button type="button" className={cip(ozelCati === 'besik')} onClick={() => setOzelCati('besik')}>Beşik çatı</button>
                {cokgen.length >= 3 && <button type="button" onClick={() => cokgeniBitir()} className={dugmeBos}><Check className="w-3.5 h-3.5" />Kapat</button>}
              </>
            )}
            <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">ya da kalıp:</span>
            {ANIT_KALIPLARI.map(k => <button key={k.id} type="button" onClick={() => { setKalipId(k.id); setCokgen([]); }} className={cip(kalipId === k.id)} title={k.aciklama}>{k.ad}</button>)}
            {kalipId && (
              <>
                <span className="text-[11px]">Yön</span>
                <input type="range" min={0} max={359} step={5} value={kalipAci} onChange={e => setKalipAci(Number(e.target.value))} />
                <span className="text-[11px] font-mono w-9">{kalipAci}°</span>
                {bekleyen ? (
                  <>
                    <button type="button" onClick={bekleyeniKoy} className={dugmeBos}><Check className="w-3.5 h-3.5" />Yerleştir</button>
                    <button type="button" onClick={() => setBekleyen(null)} className={dugmeBos}><X className="w-3.5 h-3.5" />Vazgeç</button>
                  </>
                ) : <span className="text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Haritaya dokun: kalıp orada bekler</span>}
              </>
            )}
          </div>
        )}
        {arac === 'doga' && (
          <div className={`${kart} flex items-center gap-2 px-3 py-2 max-w-full overflow-x-auto whitespace-nowrap`}>
            <span className={etiket}>Doğa</span>
            {DOGA_TURLERI.map(d => <button key={d.id} type="button" onClick={() => setDogaTur(d.id)} className={cip(dogaTur === d.id)} title={d.aciklama}>{d.ad}</button>)}
            {cokgen.length >= 3 && <button type="button" onClick={() => cokgeniBitir()} className={dugmeBos}><Check className="w-3.5 h-3.5" />Kapat</button>}
          </div>
        )}

        <div className="flex items-stretch gap-1 p-1.5 rounded-2xl bg-[#0E1C4F]/95 border border-[#2C3C72] shadow-[0_10px_26px_-10px_rgba(0,0,0,0.6)] max-w-full overflow-x-auto">
          {ARACLAR.map(({ id, ad, Ikon }) => (
            <button key={id} type="button" onClick={() => aracSec(id)}
              className={`flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[58px] lg:min-w-[64px] px-2 py-1.5 rounded-xl text-[10.5px] cursor-pointer ${arac === id ? 'bg-[#F26B6F] text-white' : 'text-[#C9D0E3] hover:bg-white/10'}`}>
              <Ikon className="w-[18px] h-[18px]" />
              {id === 'sec' ? <><span className="lg:hidden">Bilgi</span><span className="hidden lg:inline">{ad}</span></> : ad}
            </button>
          ))}
          <span className="w-px my-1.5 bg-[#2C3C72]" />
          <button type="button" onClick={geriAl} disabled={adim === 0} className="flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[60px] px-2 py-1.5 rounded-xl text-[10.5px] text-[#C9D0E3] hover:bg-white/10 disabled:opacity-35 cursor-pointer">
            <Undo2 className="w-[18px] h-[18px]" />Geri al
          </button>
          <button type="button" onClick={() => setGizliGoster(g => !g)} className="flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[60px] px-2 py-1.5 rounded-xl text-[10.5px] text-[#C9D0E3] hover:bg-white/10 cursor-pointer" title="Kaldırılanları göster / gizle">
            {kaldirilanAcik ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}Kaldırılan
          </button>
        </div>
      </div>

      {/* Viki bağları ve ajansın önerileri (4 Kasım): yalnız iş varken, küçük kart */}
      {arac !== 'bagla' && (artik.length > 0 || cift.length > 0 || oneriSatirlari.length > 0) && (
        <div className={`${kart} absolute z-10 left-3 top-16 lg:top-24 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-14rem)] overflow-y-auto p-2.5 text-[12px] space-y-2`}>
          <button type="button" onClick={() => setDenetimAcik(a => !a)} className={`${etiket} w-full text-left cursor-pointer`}>
            {[oneriSatirlari.length ? `Ajansın önerileri · ${oneriSatirlari.length}` : '', artik.length + cift.length ? `Bağ uyarısı · ${artik.length + cift.length}` : ''].filter(Boolean).join(' · ')} {denetimAcik ? '▾' : '▸'}
          </button>
          {denetimAcik && oneriSatirlari.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold">Ajansın önerileri</div>
              <p className="text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">Uygula taslağa ekler; Kurucu her zamanki gibi kaydeder, haritaya sen işlersin. Bağ önerisinde maddenin kırmızı işareti de kalkar.</p>
              <ul className="space-y-1">
                {oneriSatirlari.map(({ o, durum: d }) => (
                  <li key={o.id} className="rounded-lg border border-[#CFC5B4]/70 dark:border-[#2C3C72] px-2 py-1.5">
                    <div className="flex items-start gap-1.5">
                      {o.tur === 'bag' ? (
                        <span className="flex-1 min-w-0">
                          <b>{maddeAdi(o.madde) ?? o.maddeAd ?? 'madde bulunamadı'}</b> → <button type="button" onClick={() => { setArac('sec'); setSecili(o.hedefTur === 'yapi' ? lider(o.hedef) : o.hedef); }} className="underline cursor-pointer hover:text-[#F26B6F]">{o.hedefTur === 'yol' ? 'yolu göster' : 'yapıyı göster'}</button>
                          <span className="block text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">{o.hedefTur === 'yol' ? 'Yola bağla' : 'Yapıya bağla'}{o.isaretKaldir ? ', kırmızı işaretini kaldır' : ''}</span>
                          {o.not && <span className="block text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">{o.not}</span>}
                          {d !== 'bekliyor' && <span className="block text-[10.5px] text-[#D6484C] dark:text-[#F26B6F]">{d === 'hedef-yok' ? (o.hedefTur === 'yol' ? 'Yol Kurucu\'da yok ya da kaldırılmış.' : 'Yapı Kurucu\'da yok ya da kaldırılmış.') : 'Madde vikide bulunamadı.'}</span>}
                        </span>
                      ) : (
                        <span className="flex-1 min-w-0">
                          <b>{maddeAdi(o.kisi) ?? 'kişi bulunamadı'}</b> → <button type="button" onClick={() => { setArac('sec'); setSecili(o.ev); }} className="underline cursor-pointer hover:text-[#F26B6F]">evi göster</button>
                          {o.not && <span className="block text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">{o.not}</span>}
                          {d !== 'bekliyor' && <span className="block text-[10.5px] text-[#D6484C] dark:text-[#F26B6F]">{d === 'ev-yok' ? 'Ev Kurucu\'da yok ya da kaldırılmış.' : 'Kişi vikide bulunamadı.'}</span>}
                        </span>
                      )}
                      {d === 'bekliyor' && <button type="button" disabled={isaretYaziliyor} onClick={() => void oneriUygula([o])} className={dugmeBos}>Uygula</button>}
                      <button type="button" onClick={() => setYokSayilan(yokSay([o.id]))} className={dugmeBos} title="Yok say (bu tarayıcıda gizlenir)"><X className="w-3 h-3" /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                {uygulanabilir.length > 1 && <button type="button" disabled={isaretYaziliyor} onClick={() => void oneriUygula(uygulanabilir)} className={dugmeBos}><Check className="w-3 h-3" />Hepsini uygula ({uygulanabilir.length})</button>}
                <button type="button" onClick={() => setYokSayilan(yokSay(oneriSatirlari.map(x => x.o.id)))} className={dugmeBos}>Hepsini yok say</button>
              </div>
            </div>
          )}
          {denetimAcik && artik.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold">{artik.length} artık bağ</div>
              <p className="text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">Kaldırılmış ya da artık olmayan yapılara bağlı kalmış maddeler:</p>
              <ul className="text-[11px]">
                {artik.map(a => <li key={a.yapi} className="truncate">· {maddeAdi(a.madde) ?? a.madde} <span className="text-[#6A5E4C] dark:text-[#A6B0C9]">({a.neden === 'kaldirildi' ? 'yapı kaldırıldı' : 'yapı yok'})</span></li>)}
              </ul>
              <button type="button" onClick={artiklariSil} className={dugmeBos}><Trash2 className="w-3 h-3" />Artık bağları temizle</button>
            </div>
          )}
          {denetimAcik && cift.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold">Aynı maddeye bağlı birden çok yapı</div>
              <p className="text-[10.5px] text-[#6A5E4C] dark:text-[#A6B0C9]">Yalnız bilgi; hiçbir şey silinmez. Yanlış olanın bağını yapının kartından kaldırabilirsin.</p>
              <ul className="text-[11px] space-y-0.5">
                {cift.map(c => (
                  <li key={c.madde}>
                    · {maddeAdi(c.madde) ?? c.madde}: {c.yapilar.map((y, n) => (
                      <button key={y} type="button" onClick={() => { setArac('sec'); setSecili(y); }} className="underline cursor-pointer hover:text-[#F26B6F] mr-1">{n + 1}. yapı</button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Ölçek */}
      <div className={`absolute left-3 top-16 z-10 hidden ${arac === 'bagla' ? '' : 'lg:block'} px-2 py-1 rounded-lg bg-[#FAF8F5]/90 text-[10px] font-mono text-[#6A5E4C] pointer-events-none`}>
        {(() => {
          const hedef = 100 / olcek;
          const adimlar = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
          const m = adimlar.find(a => a >= hedef) ?? 5000;
          return <span className="flex items-center gap-1.5"><span className="inline-block h-1 bg-[#0E1C4F]" style={{ width: m * olcek }} />{km(m)}</span>;
        })()}
      </div>
    </div>
  );
}
