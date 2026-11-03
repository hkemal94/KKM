import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { GOK, YAPI, YOL } from './haritaStili';
import { CEVRE_COGRAFYASI } from '../../data/cevreCografyasi';

/**
 * Haritanın atmosferi (30 Eylül, Kemal'in kararları: docs/soru-cevap/
 * yapisal-3.md ve yapisal-4.md).
 *
 *   - Saat: gerçek saate göre (İstanbul) gündüz / alacakaranlık / gece.
 *     Gece pencereler yanar, sokak lambaları, fener, yıldızlar ve ay.
 *   - Mevsim: takvime göre. Kışın zemin solar, deniz koyulaşır ve
 *     köpüklenir, yazlıklar gece karanlık kalır, trafik seyrekleşir.
 *   - Trafik: araçlar (en çok sahil yolunda), kıyı açıklarında tekneler,
 *     limanda bekleyen feribot. Saati gelince yenisi gelir, bu kalkar.
 *     Yoğunluk saate, mevsime ve yere göre.
 *   - Her zaman: çevre (8 Ekim, H-b): gerçek kıyılarıyla Biga yarımadası,
 *     Babakale, Edremit Körfezi, Bozcaada, Gökçeada, Midilli, Limni;
 *     kıyılarında kumsal şeridi ve sığlık bantları, bütün denizde ince dalga
 *     dokusu, uzakken yer adları (`gen/cevre.py`). Küçükkuyu Limanı'na
 *     feribot hattı.
 *
 * Sitede üçü de hep açık; KKM'de düğmeyle açılıp kapanır.
 * Yalnız görüntüdür: hiçbir kayda yazmaz.
 */

import type { AtmosferAyari } from './atmosferAyari';
export { ATMOSFER_ACIK, ATMOSFER_KAPALI, type AtmosferAyari } from './atmosferAyari';

type Nokta = [number, number];

// ---- yer bilgisi ------------------------------------------------------------

/**
 * Liman İskelesi'nin T başı (üreteçteki bina_liman_iskele). Feribot T başının
 * deniz tarafına, ona paralel yanaşır (30 Eylül, Kemal: "koordinasyon
 * problemleri": feribot iskelenin üstüne biniyordu).
 */
const ISKELE_T: [Nokta, Nokta] = [[25.787492, 39.62536], [25.787726, 39.625712]];
const LIMAN: Nokta = (() => {
  const [a, b] = ISKELE_T;
  const orta: Nokta = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const kx = Math.cos((orta[1] * Math.PI) / 180) * 111_320;
  const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * 111_320;
  const L = Math.hypot(dx, dy);
  // T başına dik, batıya (denize) 14 m
  const nx = -dy / L, ny = dx / L;
  const yon = nx < 0 ? 1 : -1;
  return [orta[0] + (yon * nx * 14) / kx, orta[1] + (yon * ny * 14) / 111_320];
})();
export const KUCUKKUYU: Nokta = [26.607, 39.548];

/**
 * Feribot hattı: Liman'dan adanın kuzeyini dolaşır, Babakale burnunu döner,
 * Edremit Körfezi'nden Küçükkuyu'ya varır. Noktalar kıyıdan uzakta.
 */
const FERIBOT_ROTASI: Nokta[] = [
  LIMAN, [25.775, 39.6305], [25.779, 39.662], [25.86, 39.671], [25.93, 39.668],
  [25.99, 39.625], [26.02, 39.515], [26.075, 39.455], [26.25, 39.462],
  [26.45, 39.497], KUCUKKUYU
];

/** Çevre adları yalnız uzakken görünür (yakında adanın kendi etiketleri var) */
const CEVRE_ETIKET_ZOOM = 11.2;

/** Dalga dokusu: kısa, kırık açık çizgiler (her açılışta aynı) */
function dalgaDokusu(): ImageData {
  const N = 128, t = document.createElement('canvas');
  t.width = N; t.height = N;
  const c = t.getContext('2d')!;
  let k = 11;
  const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
  c.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = r() * N, y = r() * N, w = 5 + r() * 11;
    c.strokeStyle = `rgba(235,244,250,${0.18 + r() * 0.22})`;
    c.lineWidth = 0.8 + r() * 0.7;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + w / 2, y - 1.6 - r() * 1.4, x + w, y);
    c.stroke();
  }
  return c.getImageData(0, 0, N, N);
}

// ---- zaman ------------------------------------------------------------------

interface Zaman { saat: number; gunNo: number }

/** Adanın saati: İstanbul */
function adaZamani(d = new Date()): Zaman {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(d).map(x => [x.type, x.value]));
  const ay = Number(p.month), gun = Number(p.day);
  const gunNo = Math.floor((Date.UTC(2026, ay - 1, gun) - Date.UTC(2026, 0, 1)) / 86_400_000) + 1;
  return { saat: (Number(p.hour) % 24) + Number(p.minute) / 60, gunNo };
}

const sinirla = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export interface Durum {
  /** 0 gündüz … 1 tam gece */
  gece: number;
  /** 0 yaz … 1 tam kış görünümü */
  kis: number;
  saat: number;
}

/** Güneşin doğuşu / batışı mevsime göre; kış görünümü kasımdan marta */
export function durumHesapla(ayar: AtmosferAyari, d = new Date()): Durum {
  const { saat, gunNo } = adaZamani(d);
  const yaz = Math.cos((2 * Math.PI * (gunNo - 172)) / 365); // 1: haziran sonu
  const dogus = 6.9 - 1.3 * yaz;   // yazın ~5.6, kışın ~8.2
  const batis = 19.1 + 1.4 * yaz;  // yazın ~20.5, kışın ~17.7
  const gunIsigi = sinirla((saat - (dogus - 0.5)) / 1) * sinirla(((batis + 0.5) - saat) / 1);
  const soguk = Math.cos((2 * Math.PI * (gunNo - 25)) / 365); // 1: ocak sonu
  return {
    gece: ayar.saat ? 1 - gunIsigi : 0,
    kis: ayar.mevsim ? sinirla((soguk - 0.1) / 0.5) : 0,
    saat
  };
}

/** Trafik yoğunluğu: sabah ve akşam yoğun, gece seyrek; kışın azalır */
function yogunluk(saat: number, kis: number): number {
  const s = saat < 6 ? 0.08 : saat < 8 ? 0.08 + (saat - 6) * 0.46 : saat < 10 ? 1
    : saat < 17 ? 0.7 : saat < 20 ? 1 : saat < 22 ? 0.55 : 0.25;
  return s * (1.25 - 0.75 * kis);
}

// ---- renk -------------------------------------------------------------------

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export function karistir(a: string, b: string, t: number): string {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * sinirla(t)).toString(16).padStart(2, '0')).join('');
}

/**
 * Ada görselinin (raster) parlaklık ve doygunluk ayarını düz bir renge
 * uygular. Açık deniz de aynı ayarla boyanır; yoksa gece ve kışın adanın
 * çevresinde görselin dikdörtgen sınırı belli oluyordu.
 */
function rasterGibi(c: string, parlaklik: number, doygunluk: number): string {
  const [r, g, b] = hex(c).map(v => v * parlaklik);
  const gri = (r + g + b) / 3;
  const k = 1 + doygunluk;
  return '#' + [r, g, b].map(v => Math.round(sinirla(gri + (v - gri) * k, 0, 255)).toString(16).padStart(2, '0')).join('');
}

// ---- ölçü -------------------------------------------------------------------

const M_ENLEM = 111_320;
const mBoylam = (enlem: number) => 111_320 * Math.cos((enlem * Math.PI) / 180);
const mesafe = (a: Nokta, b: Nokta) => Math.hypot((b[0] - a[0]) * mBoylam(a[1]), (b[1] - a[1]) * M_ENLEM);
/** Kuzeyden saat yönünde derece */
const yonAcisi = (a: Nokta, b: Nokta) =>
  (Math.atan2((b[0] - a[0]) * mBoylam(a[1]), (b[1] - a[1]) * M_ENLEM) * 180) / Math.PI;

interface Hat { n: Nokta[]; u: number[]; L: number }
function hatKur(n: Nokta[]): Hat {
  const u = [0];
  for (let i = 1; i < n.length; i++) u.push(u[i - 1] + mesafe(n[i - 1], n[i]));
  return { n, u, L: u[u.length - 1] };
}
/** Hat üstünde s metredeki nokta ve yön */
function hattaNokta(h: Hat, s: number): { p: Nokta; yon: number } {
  s = Math.max(0, Math.min(h.L, s));
  let i = 1;
  while (i < h.u.length - 1 && h.u[i] < s) i++;
  const a = h.n[i - 1], b = h.n[i];
  const t = h.u[i] === h.u[i - 1] ? 0 : (s - h.u[i - 1]) / (h.u[i] - h.u[i - 1]);
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], yon: yonAcisi(a, b) };
}

/** Kimlikten tekrar üretilebilir 0–1 sayı (her açılışta aynı pencere yanar) */
function sans(kimlik: string): number {
  let h = 2166136261;
  for (let i = 0; i < kimlik.length; i++) { h ^= kimlik.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Harita verisine atmosfer için iki bilgi ekler: pencere şansı ve yazlık.
 * (Yazlık: İskele ve Stadyum'daki evlerin yarısı; kışın gece ışığı yanmaz.)
 */
export function atmosferVerisi(geo: FeatureCollection): FeatureCollection {
  return {
    ...geo,
    features: geo.features.map(f => {
      const p = f.properties as Record<string, unknown> | null;
      if (!p || p.katman !== 'bina') return f;
      const id = String(p.id ?? '');
      const r = sans(id);
      const yazlik = p.tur === 'ev' && (p.mahalle === 'yer_iskele' || p.mahalle === 'yer_stadyum') && sans(id + 'y') < 0.5;
      return { ...f, properties: { ...p, sans: r, yazlik } };
    })
  };
}

// ---- simgeler ---------------------------------------------------------------

/** Tek renk (SDF) simge: renk haritada verilir. Burun sağa (doğuya) bakar. */
function simge(en: number, boy: number, ciz: (c: CanvasRenderingContext2D) => void): ImageData {
  const cv = document.createElement('canvas');
  cv.width = en; cv.height = boy;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  ciz(c);
  return c.getImageData(0, 0, en, boy);
}
/** Simgede boşluk açar (cam, güverte çizgisi): SDF tek renk olduğu için ayrıntı boşlukla verilir */
const oy = (c: CanvasRenderingContext2D, ciz: () => void) => {
  c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); ciz(); c.fill(); c.restore();
};
const SIMGELER: Record<string, () => ImageData> = {
  // Araba: gövde, ön ve arka cam (2 Ekim, ayrıntı)
  arac: () => simge(28, 16, c => {
    c.beginPath(); c.roundRect(2, 2, 24, 12, 4); c.fill();
    oy(c, () => { c.roundRect(17, 4, 4, 8, 1.5); });
    oy(c, () => { c.roundRect(6, 4.5, 3, 7, 1.2); });
  }),
  // Balıkçı teknesi: sivri baş, kıçta kabin
  tekne: () => simge(36, 16, c => {
    c.beginPath(); c.moveTo(2, 3); c.lineTo(24, 3); c.lineTo(34, 8); c.lineTo(24, 13); c.lineTo(2, 13); c.closePath(); c.fill();
    oy(c, () => { c.rect(5, 5.5, 13, 5); });
    c.beginPath(); c.rect(7, 6.5, 6, 3); c.fill();
  }),
  // Feribot: gövde, iki güverte, köprü üstü
  feribot: () => simge(66, 24, c => {
    c.beginPath(); c.moveTo(3, 3); c.lineTo(51, 3); c.lineTo(64, 12); c.lineTo(51, 21); c.lineTo(3, 21); c.closePath(); c.fill();
    oy(c, () => { c.rect(7, 6, 38, 12); });
    c.beginPath(); c.rect(10, 8, 32, 8); c.fill();
    oy(c, () => { c.rect(14, 10.5, 24, 3); });
    c.beginPath(); c.roundRect(40, 7.5, 6, 9, 2); c.fill();
  })
};

// ---- yıldızlar ----------------------------------------------------------------

function yildizKatmani(): HTMLDivElement {
  const d = document.createElement('div');
  const noktalar: string[] = [];
  for (let i = 0; i < 90; i++) {
    const x = (sans('x' + i) * 100).toFixed(1), y = (sans('y' + i) * 100).toFixed(1);
    const r = sans('r' + i) < 0.85 ? 1 : 1.6;
    noktalar.push(`radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(255,255,255,${(0.5 + sans('a' + i) * 0.5).toFixed(2)}) 99%, transparent)`);
  }
  // Ay: sağ üstte
  noktalar.push('radial-gradient(9px 9px at 82% 28%, #F6EFD9 90%, transparent)');
  noktalar.push('radial-gradient(26px 26px at 82% 28%, rgba(246,239,217,0.18) 60%, transparent)');
  d.style.cssText = `position:absolute;left:0;right:0;top:0;height:0;pointer-events:none;opacity:0;transition:opacity 600ms;background:${noktalar.join(',')};z-index:1`;
  return d;
}

// ---- atmosferin kendisi ----------------------------------------------------------

interface Arac { hat: Hat; s0: number; hiz: number; yon: 1 | -1; renk: string; sira: number; agir: number; serit: number }
interface Tekne { merkez: Nokta; rx: number; ry: number; a0: number; w: number; sira: number }

const ARAC_RENKLERI = ['#E9E3D6', '#F26B6F', '#3B5B8C', '#D9CBA8', '#7A8B6F', '#FFFFFF'];

export class Atmosfer {
  private map: MLMap;
  private ayar: AtmosferAyari;
  private araclar: Arac[] = [];
  private tekneler: Tekne[] = [];
  private feribotHatti: Hat;
  private fener: Nokta | null = null;
  private fenerBoyu = 30;
  private gunduzBinaRengi: unknown;
  private yildiz: HTMLDivElement;
  private etiket: maplibregl.Marker;
  private cevreEtiketleri: maplibregl.Marker[] = [];
  private dongu = 0;
  private sonKare = 0;
  private sonDurum = 0;
  private durum: Durum = { gece: 0, kis: 0, saat: 12 };
  private bitti = false;

  constructor(map: MLMap, geo: FeatureCollection, ayar: AtmosferAyari) {
    this.map = map;
    this.ayar = ayar;
    this.feribotHatti = hatKur(FERIBOT_ROTASI);
    this.gunduzBinaRengi = map.getPaintProperty('binalar', 'fill-extrusion-color');
    this.hazirla(geo);
    this.katmanlariKur(geo);
    this.yildiz = yildizKatmani();
    map.getContainer().appendChild(this.yildiz);
    const el = document.createElement('div');
    el.textContent = 'Küçükkuyu Limanı';
    el.style.cssText = 'font:italic 500 11px Poppins,sans-serif;letter-spacing:.08em;color:#F3EFE8;text-shadow:0 1px 2px rgba(14,28,79,.8);pointer-events:none;white-space:nowrap';
    this.etiket = new maplibregl.Marker({ element: el, anchor: 'left', offset: [6, 0] }).setLngLat(KUCUKKUYU).addTo(map);
    // Çevrenin gerçek yer adları: ada adları geniş aralıklı, kıyı ve su eğik
    for (const f of CEVRE_COGRAFYASI.features) {
      const p = f.properties as Record<string, string> | null;
      if (p?.katman !== 'etiket' || f.geometry.type !== 'Point') continue;
      const e = document.createElement('div');
      e.textContent = p.ad;
      e.style.cssText = p.tur === 'ada'
        ? 'font:600 11px Poppins,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#F3EFE8;text-shadow:0 1px 3px rgba(14,28,79,.85);pointer-events:none;white-space:nowrap'
        : p.tur === 'su'
          ? 'font:italic 400 12px Poppins,sans-serif;letter-spacing:.3em;color:rgba(235,244,250,.75);pointer-events:none;white-space:nowrap'
          : 'font:italic 500 11px Poppins,sans-serif;letter-spacing:.08em;color:#F3EFE8;text-shadow:0 1px 2px rgba(14,28,79,.8);pointer-events:none;white-space:nowrap';
      this.cevreEtiketleri.push(new maplibregl.Marker({ element: e }).setLngLat(f.geometry.coordinates as Nokta).addTo(map));
    }
    map.on('move', this.ufukGuncelle);
    this.ufukGuncelle();
    this.durumUygula(true);
    this.dongu = requestAnimationFrame(this.kare);
  }

  /** Yolları ve araçları hazırlar; tekne rotalarını kurar */
  private hazirla(geo: FeatureCollection) {
    let sira = 0;
    for (const f of geo.features) {
      const p = f.properties as Record<string, unknown> | null;
      if (!p) continue;
      if (p.katman === 'bina' && p.tur === 'fener' && f.geometry.type === 'Polygon') {
        const k = f.geometry.coordinates[0] as Nokta[];
        this.fener = [k.reduce((t, q) => t + q[0], 0) / k.length, k.reduce((t, q) => t + q[1], 0) / k.length];
        this.fenerBoyu = Number(p.yukseklik) || 30;
      }
      if (p.katman !== 'yol' || f.geometry.type !== 'LineString') continue;
      const tur = String(p.tur);
      if (!['ana yol', 'yol', 'cadde', 'sokak'].includes(tur)) continue;
      const hat = hatKur(f.geometry.coordinates as Nokta[]);
      if (hat.L < (tur === 'sokak' ? 60 : 150)) continue;
      // Yer ağırlığı: sahil (çevre) yolu en canlı, sokaklar sakin (Kemal,
      // 30 Eylül: "araçlar küçük sokaklara girmiyor" → sokaklarda seyrek)
      const agir = tur === 'ana yol' ? 1 : tur === 'sokak' ? 0.3 : 0.5;
      const adet = tur === 'sokak' ? (sans(String(p.id)) < 0.45 ? 1 : 0) : Math.ceil(hat.L / (tur === 'ana yol' ? 200 : 550));
      // Sağdan gidiş: araç yolun ortasından bu kadar metre sağında
      const serit = tur === 'ana yol' ? 3.2 : tur === 'sokak' ? 1.4 : 2.4;
      for (let i = 0; i < adet; i++) {
        const k = `${p.id}${i}`;
        this.araclar.push({
          hat, s0: sans(k + 's') * hat.L, hiz: 9 + sans(k + 'h') * 7, yon: sans(k + 'y') < 0.5 ? 1 : -1,
          renk: ARAC_RENKLERI[Math.floor(sans(k + 'r') * ARAC_RENKLERI.length)], sira: sira++ % 97 / 97, agir, serit
        });
      }
    }
    // Tekneler: adayı saran geniş halkalar ve körfezde kısa turlar
    const T = (merkez: Nokta, rx: number, ry: number, i: number, w: number) =>
      this.tekneler.push({ merkez, rx, ry, a0: sans('t' + i) * Math.PI * 2, w: w * (sans('w' + i) < 0.5 ? 1 : -1), sira: sans('q' + i) });
    for (let i = 0; i < 9; i++) T([25.858, 39.596], 0.15 + sans('rx' + i) * 0.06, 0.085 + sans('ry' + i) * 0.035, i, 0.0009 + sans('v' + i) * 0.0006);
    T([25.765, 39.629], 0.009, 0.005, 20, 0.004);
    T([25.772, 39.572], 0.008, 0.005, 21, 0.004);
  }

  private katmanlariKur(geo: FeatureCollection) {
    const m = this.map;
    for (const [ad, uret] of Object.entries(SIMGELER)) if (!m.hasImage(ad)) m.addImage(ad, uret(), { sdf: true });
    const bos: FeatureCollection = { type: 'FeatureCollection', features: [] };

    // Çevre (8 Ekim, H-b): sığlıklar, komşu karalar, kumsal şeridi, kıyı
    // çizgisi; hepsi denizin hemen üstünde, adanın altında. Düzada'nın kendi
    // sığ suyu fiziki görselde.
    m.addSource('cevre', { type: 'geojson', data: CEVRE_COGRAFYASI });
    m.addLayer({
      id: 'cevre-sig', type: 'fill', source: 'cevre', filter: ['==', ['get', 'katman'], 'sig'],
      paint: { 'fill-color': ['match', ['get', 'bant'], 1, '#3F8DBF', 2, '#2C6FA8', '#235E9B'], 'fill-antialias': false }
    }, 'ada-fiziki');
    m.addLayer({ id: 'anakara', type: 'fill', source: 'cevre', filter: ['==', ['get', 'katman'], 'kara'], paint: { 'fill-color': '#93A07C' } }, 'ada-fiziki');
    m.addLayer({ id: 'cevre-kiyi', type: 'fill', source: 'cevre', filter: ['==', ['get', 'katman'], 'kiyi'], paint: { 'fill-color': '#CFC59A', 'fill-opacity': 0.85 } }, 'ada-fiziki');
    m.addLayer({
      id: 'cevre-kiyi-cizgi', type: 'line', source: 'cevre', filter: ['==', ['get', 'katman'], 'kara'],
      paint: { 'line-color': '#F3EFE8', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.4] }
    }, 'ada-fiziki');
    // Dalga dokusu: bütün denizde, Düzada'nın görselindeki suyun da üstünde
    if (!m.hasImage('dalga-doku')) m.addImage('dalga-doku', dalgaDokusu());
    m.addLayer({
      id: 'deniz-doku', type: 'fill', source: 'cevre', filter: ['==', ['get', 'katman'], 'deniz'],
      paint: { 'fill-pattern': 'dalga-doku', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 12, 0.55, 15, 0.25] }
    }, m.getLayer('zemin-doku') ? 'zemin-doku' : undefined);
    m.addSource('feribot-hatti', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: FERIBOT_ROTASI } } });
    m.addLayer({
      id: 'feribot-hatti', type: 'line', source: 'feribot-hatti',
      paint: { 'line-color': '#F3EFE8', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2], 'line-dasharray': [3, 3] }
    }, 'ada-fiziki');

    // Kış köpükleri: adanın çevresinde rastgele denizde beliren noktalar
    const kopuk: Feature<Point>[] = [];
    for (let i = 0; i < 260; i++) {
      const a = sans('ka' + i) * Math.PI * 2, r = 1.08 + sans('kr' + i) * 1.3;
      kopuk.push({ type: 'Feature', properties: { faz: sans('kf' + i) * 6.28 }, geometry: { type: 'Point', coordinates: [25.858 + Math.cos(a) * 0.14 * r, 39.596 + Math.sin(a) * 0.075 * r] } });
    }
    m.addSource('kopuk', { type: 'geojson', data: { type: 'FeatureCollection', features: kopuk } });
    m.addLayer({ id: 'kopuk', type: 'circle', source: 'kopuk', paint: { 'circle-color': '#E9F1F5', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 14, 4], 'circle-blur': 1, 'circle-opacity': 0 } }, 'ada-fiziki');

    // Sokak lambaları: caddeler ve sokaklar boyunca, gece yanar
    const lambalar: Feature<Point>[] = [];
    for (const f of geo.features) {
      const p = f.properties as Record<string, unknown> | null;
      if (!p || p.katman !== 'yol' || f.geometry.type !== 'LineString') continue;
      const aralik = p.tur === 'ana yol' ? 90 : p.tur === 'sokak' || p.tur === 'cadde' ? 42 : 0;
      if (!aralik) continue;
      const h = hatKur(f.geometry.coordinates as Nokta[]);
      for (let s = aralik / 2; s < h.L; s += aralik) lambalar.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: hattaNokta(h, s).p } });
    }
    m.addSource('lamba', { type: 'geojson', data: { type: 'FeatureCollection', features: lambalar } });
    m.addLayer({ id: 'lamba', type: 'circle', source: 'lamba', minzoom: 12, paint: { 'circle-color': '#FFD58A', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 17, 3.2], 'circle-blur': 0.7, 'circle-opacity': 0 } }, 'bina-golge');

    // Trafik: gece farları ve simgeler
    m.addSource('trafik', { type: 'geojson', data: bos });
    m.addLayer({ id: 'trafik-far', type: 'circle', source: 'trafik', paint: { 'circle-color': '#FFE3A1', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 6], 'circle-blur': 1, 'circle-opacity': 0 } });
    m.addLayer({
      id: 'trafik', type: 'symbol', source: 'trafik',
      layout: {
        'icon-image': ['get', 'ikon'], 'icon-rotate': ['get', 'aci'],
        'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, ['*', 0.22, ['get', 'boy']], 14, ['*', 0.45, ['get', 'boy']], 17, ['*', 1, ['get', 'boy']]]
      },
      paint: { 'icon-color': ['get', 'renk'], 'icon-halo-color': 'rgba(14,28,79,0.55)', 'icon-halo-width': 0.6 }
    });

    // Fener: tepede yanan lamba ve dönen huzme (30 Eylül, Kemal: "ışık altından
    // dağılıyor"). İkisi de fenerin boyunda, havada duran ince kütleler.
    // maxzoom 12: huzme karelere bölünmesin (her parça ayrı araziye oturuyordu)
    m.addSource('fener', { type: 'geojson', data: bos, maxzoom: 12 });
    m.addLayer({ id: 'fener-huzme', type: 'fill-extrusion', source: 'fener', filter: ['==', ['get', 'k'], 'huzme'],
      paint: { 'fill-extrusion-color': ['get', 'renk'], 'fill-extrusion-base': ['get', 'alt'], 'fill-extrusion-height': ['get', 'ust'], 'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': false } });
    m.addLayer({ id: 'fener-isik', type: 'fill-extrusion', source: 'fener', filter: ['==', ['get', 'k'], 'lamba'],
      paint: { 'fill-extrusion-color': '#FFF6D8', 'fill-extrusion-base': ['get', 'alt'], 'fill-extrusion-height': ['get', 'ust'], 'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': false } });
  }

  /** Ufuk çizgisinin ekrandaki yeri: yıldızlar yalnız gökte görünsün */
  private ufukGuncelle = () => {
    const m = this.map;
    const h = m.getContainer().clientHeight;
    const aci = 90 - m.getPitch();              // ufkun merkezden yukarı açısı
    const yariFov = 18.43;                       // MapLibre dikey görüş açısının yarısı
    const y = aci >= yariFov ? 0 : h / 2 - (h / 2) * (Math.tan((aci * Math.PI) / 180) / Math.tan((yariFov * Math.PI) / 180));
    this.yildiz.style.height = `${Math.max(0, y)}px`;
    const uzak = m.getZoom() < CEVRE_ETIKET_ZOOM;
    for (const e of this.cevreEtiketleri) e.getElement().style.display = uzak ? '' : 'none';
  };

  ayarla(ayar: AtmosferAyari) {
    this.ayar = ayar;
    this.durumUygula(true);
  }

  /** Saat ve mevsime göre renkler; dakikada bir yeniden hesaplanır */
  private durumUygula(zorla = false) {
    const simdi = Date.now();
    if (!zorla && simdi - this.sonDurum < 60_000) return;
    this.sonDurum = simdi;
    const d = this.durum = durumHesapla(this.ayar);
    const m = this.map;
    const { gece, kis } = d;

    const parlaklik = 1 - 0.72 * gece - 0.12 * kis * (1 - gece);
    const doygunluk = -0.45 * kis - 0.3 * gece;
    m.setPaintProperty('ada-fiziki', 'raster-brightness-max', parlaklik);
    m.setPaintProperty('ada-fiziki', 'raster-saturation', doygunluk);
    m.setPaintProperty('deniz', 'background-color', rasterGibi('#1C4E8C', parlaklik, doygunluk));
    m.setPaintProperty('anakara', 'fill-color', karistir(karistir('#93A07C', '#8F948C', kis), '#1B2436', gece));
    m.setPaintProperty('cevre-kiyi', 'fill-color', karistir(karistir('#CFC59A', '#B9B6A6', kis), '#262C3E', gece));
    m.setPaintProperty('cevre-kiyi-cizgi', 'line-opacity', 0.55 * (1 - 0.7 * gece));
    m.setPaintProperty('cevre-sig', 'fill-color', ['match', ['get', 'bant'],
      1, rasterGibi('#3F8DBF', parlaklik, doygunluk), 2, rasterGibi('#2C6FA8', parlaklik, doygunluk), rasterGibi('#235E9B', parlaklik, doygunluk)]);
    m.setPaintProperty('deniz-doku', 'fill-opacity', ['interpolate', ['linear'], ['zoom'],
      8, 0.35 * (1 - 0.75 * gece), 12, 0.55 * (1 - 0.75 * gece), 15, 0.25 * (1 - 0.75 * gece)]);
    m.setPaintProperty('yol-dolgu', 'line-color', karistir(YOL.dolgu, '#6F6A5E', gece * 0.7));
    m.setSky({
      'sky-color': karistir(karistir(GOK.ust, '#AEBBC6', kis * 0.6), '#0B1430', gece),
      'horizon-color': karistir(karistir(GOK.ufuk, '#DCE1E4', kis * 0.5), '#27335A', gece),
      'fog-color': karistir(karistir(GOK.pus, '#D5DBDF', kis * 0.5), '#1B2444', gece),
      'sky-horizon-blend': 0.9, 'horizon-fog-blend': 0.55, 'fog-ground-blend': 0.72,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 0.28, 16, 0.1]
    });
    m.setLight({ anchor: 'viewport', color: karistir('#FFFFFF', '#8795C8', gece), intensity: 0.5 - 0.22 * gece });

    // Binalar: gece pencereler (yazlıklar kışın karanlık)
    if (gece < 0.03) {
      m.setPaintProperty('binalar', 'fill-extrusion-color', this.gunduzBinaRengi as never);
    } else {
      const yanar: unknown[] = ['all', ['<', ['get', 'sans'], 0.68]];
      if (kis > 0.5) yanar.push(['!', ['to-boolean', ['get', 'yazlik']]]);
      m.setPaintProperty('binalar', 'fill-extrusion-color', [
        'case',
        ['boolean', ['feature-state', 'uzerinde'], false], YAPI.vurgu,
        // Dolu ev (3 Kasım): içinde kayıtlı biri oturuyor, gece ışığı hep yanık
        ['boolean', ['feature-state', 'dolu'], false], karistir('#FAF8F5', '#F2C77A', gece),
        yanar, karistir(YAPI.genel, '#E7B566', gece),
        karistir(YAPI.genel, '#343A52', gece * 0.9)
      ] as never);
    }
    m.setPaintProperty('lamba', 'circle-opacity', 0.9 * gece);
    // Fener yalnız gece yanar (2 Ekim, Kemal: "tepeden, dönen"); alacakaranlıkta söner
    const fenerGece = sinirla((gece - 0.45) / 0.35);
    m.setPaintProperty('fener-isik', 'fill-extrusion-opacity', 0.95 * fenerGece);
    m.setPaintProperty('fener-huzme', 'fill-extrusion-opacity', 0.32 * fenerGece);
    m.setPaintProperty('trafik-far', 'circle-opacity', 0.55 * gece);
    m.setLayoutProperty('trafik', 'visibility', this.ayar.trafik ? 'visible' : 'none');
    m.setLayoutProperty('trafik-far', 'visibility', this.ayar.trafik ? 'visible' : 'none');
    this.yildiz.style.opacity = String(sinirla((gece - 0.3) / 0.6));
    if (!this.ayar.trafik) (m.getSource('trafik') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
  }

  /** Feribotlar: biri limanda bekler; sefer saatinde yenisi gelir, bu kalkar */
  private feribotlar(simdiSaat: number, kis: number): Feature<Point>[] {
    const h = this.feribotHatti;
    const hiz = 12;                                   // m/sn (görsel)
    const sure = h.L / hiz / 3600;                    // saat cinsinden yolculuk
    const seferler: number[] = [];
    const [bas, son, ara] = kis > 0.5 ? [8, 17, 3] : [7, 21, 2];
    for (let gun = -1; gun <= 1; gun++) for (let s = bas; s <= son; s += ara) seferler.push(gun * 24 + s);
    const ciktilar: Feature<Point>[] = [];
    const ekle = (s: number, geri: boolean) => {
      const { p, yon } = hattaNokta(h, s);
      ciktilar.push({ type: 'Feature', properties: { ikon: 'feribot', aci: (geri ? yon + 180 : yon) - 90, boy: 1, renk: '#FFFFFF' }, geometry: { type: 'Point', coordinates: p } });
    };
    // Limanda bekleyen
    const d0 = hattaNokta(h, 0);
    ciktilar.push({ type: 'Feature', properties: { ikon: 'feribot', aci: yonAcisi(ISKELE_T[0], ISKELE_T[1]) - 90, boy: 1, renk: '#FFFFFF' }, geometry: { type: 'Point', coordinates: d0.p } });
    for (const t of seferler) {
      const gecen = simdiSaat - t;                          // kalkıştan beri (saat)
      if (gecen > 0 && gecen < sure) ekle(gecen * 3600 * hiz, false);           // giden
      const kalan = t - simdiSaat;                          // bir sonraki gelişe
      if (kalan > 0 && kalan < sure) ekle(kalan * 3600 * hiz, true);            // gelen
    }
    return ciktilar;
  }

  private kare = (zaman: number) => {
    if (this.bitti) return;
    this.dongu = requestAnimationFrame(this.kare);
    if (zaman - this.sonKare < 70) return;           // ~14 kare/sn yeter
    this.sonKare = zaman;
    this.durumUygula();
    const m = this.map;
    const t = zaman / 1000;
    const { gece, kis, saat } = this.durum;

    // Kış köpükleri: dalgalar kabarıp söner
    if (kis > 0.05) m.setPaintProperty('kopuk', 'circle-opacity', ['*', 0.35 * kis, ['max', 0, ['sin', ['+', t * 0.9, ['get', 'faz']]]]] as never);
    else m.setPaintProperty('kopuk', 'circle-opacity', 0);

    // Fener huzmesi döner (yalnız gece).
    // 2 Ekim (Kemal: "ışık nereden çıkıyor nereye gidiyor"): fener 69 m'lik
    // yamaçta. Arazi açıkken MapLibre her kütleyi köşelerinin ortalamasının
    // arazi kotuna oturtur; tek yönlü uzun huzmenin ortası denizde kaldığı
    // için ışık fenerin tepesinden değil, deniz seviyesinden çıkıyordu.
    // Artık huzme karşılıklı iki koldan oluşan tek bir kum saati şekli: köşe
    // ortalaması tam fenerin üstüne düşer, ışık lambadan yatay çıkar.
    // (Gerçek fenerlerin döner merceği de iki yöne ışık verir.)
    if (gece > 0.45 && this.fener) {
      const a = t * 0.35, c = this.fener, H = this.fenerBoyu;
      const kx = mBoylam(c[1]);
      const nokta = (aci: number, r: number): Nokta => [c[0] + (Math.cos(aci) * r) / kx, c[1] + (Math.sin(aci) * r) / M_ENLEM];
      const lamba: Nokta[] = [];
      for (let i = 0; i < 12; i++) lamba.push(nokta((i / 12) * Math.PI * 2, 3.2));
      lamba.push(lamba[0]);
      const acik = 0.05, R = 380, BOYUN = 0.6;
      const P = Math.PI;
      // Simetrik köşeler: her köşenin karşısında bir eşi var, ortalama = fener
      const huzme: Nokta[] = [
        nokta(a - acik, R), nokta(a + acik, R), nokta(a + P / 2, BOYUN),
        nokta(a + P - acik, R), nokta(a + P + acik, R), nokta(a - P / 2, BOYUN)
      ];
      (m.getSource('fener') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection', features: [
          { type: 'Feature', properties: { k: 'lamba', alt: H, ust: H + 3.5 }, geometry: { type: 'Polygon', coordinates: [lamba] } },
          // Kapanış köşesi eklenmez: ortalamayı kaydırmasın diye halka açık bırakılır, MapLibre kapatır
          { type: 'Feature', properties: { k: 'huzme', alt: H + 1.2, ust: H + 1.9, renk: '#FFF3C4' }, geometry: { type: 'Polygon', coordinates: [huzme] } }
        ]
      });
    }

    if (!this.ayar.trafik) return;
    const yog = yogunluk(saat, kis);
    const ozellikler: Feature<Point>[] = [];
    for (const a of this.araclar) {
      if (a.sira > yog * a.agir * 1.1) continue;        // saate, mevsime, yere göre
      let s = (a.s0 + a.yon * a.hiz * t) % a.hat.L;
      if (s < 0) s += a.hat.L;
      const { p, yon } = hattaNokta(a.hat, s);
      // Gidiş yönünün sağına kaydır: iki yönlü akış ayrı şeritlerde
      const gidis = a.yon > 0 ? yon : yon + 180;
      const r = ((gidis + 90) * Math.PI) / 180;
      const q: Nokta = [p[0] + (Math.sin(r) * a.serit) / mBoylam(p[1]), p[1] + (Math.cos(r) * a.serit) / M_ENLEM];
      ozellikler.push({ type: 'Feature', properties: { ikon: 'arac', aci: gidis - 90, boy: 0.6, renk: a.renk }, geometry: { type: 'Point', coordinates: q } });
    }
    const tekneOrani = (0.35 + 0.65 * (1 - gece)) * (1 - 0.65 * kis);
    for (const b of this.tekneler) {
      if (b.sira > tekneOrani) continue;
      const a = b.a0 + b.w * t;
      const p: Nokta = [b.merkez[0] + Math.cos(a) * b.rx, b.merkez[1] + Math.sin(a) * b.ry];
      const ileri: Nokta = [b.merkez[0] + Math.cos(a + Math.sign(b.w) * 0.01) * b.rx, b.merkez[1] + Math.sin(a + Math.sign(b.w) * 0.01) * b.ry];
      ozellikler.push({ type: 'Feature', properties: { ikon: 'tekne', aci: yonAcisi(p, ileri) - 90, boy: 0.7, renk: '#F7F4EC' }, geometry: { type: 'Point', coordinates: p } });
    }
    ozellikler.push(...this.feribotlar(saat, kis));
    (m.getSource('trafik') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: ozellikler });
  };

  kaldir() {
    this.bitti = true;
    cancelAnimationFrame(this.dongu);
    this.map.off('move', this.ufukGuncelle);
    this.yildiz.remove();
    this.etiket.remove();
    for (const e of this.cevreEtiketleri) e.remove();
  }
}
