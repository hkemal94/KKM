import * as maplibregl from 'maplibre-gl';
// MapLibre karoları bir Web Worker'da işliyor ve o worker'ın adresini kendi
// paket dosyasının yanından (`import.meta.url`) türetiyor. Vite derlemeyi
// `assets/` altında topladığında o adres kayboluyor: worker hiç açılmıyor,
// harita sessizce boş deniz olarak kalıyordu — konsola tek satır hata
// düşmeden. Worker'ı Vite'a ayrı bir paket olarak kurdurup adresi elle
// veriyoruz. (Geliştirme sunucusunda sorun çıkmıyordu, yalnız yayın
// derlemesinde.)
import isciAdresi from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { DEM_PNG, DEM_SINIR } from '../../data/duzadaDem';

maplibregl.setWorkerUrl(isciAdresi);

/**
 * Düzada'nın 3B arazisi.
 *
 * MapLibre araziyi "raster-dem" karolarından kurar: rakımın renk
 * kanallarına gömüldüğü PNG'ler. Dışarıdan karo servisi kullanmıyoruz —
 * ne anahtar, ne hesap, ne ağ. Onun yerine adanın tamamı tek bir PNG'ye
 * kodlanmış durumda (`duzadaDem.ts`, ~36 KB) ve buradaki özel protokol
 * MapLibre her karo istediğinde o görüntüden ilgili parçayı kesip veriyor.
 *
 * Kodlama Terrarium: rakım = (R * 256 + G + B / 256) - 32768
 */

export const ARAZI_PROTOKOL = 'duzada-dem';
export const ARAZI_KAYNAK = 'duzada-arazi';

/**
 * Abartı katsayısı.
 *
 * 18 km genişliğinde bir adada 742 m gerçek ölçekte neredeyse düz görünür
 * (yatay/düşey oran 1:24). Haritacılıkta kabartma bu yüzden abartılır;
 * 1.6 kabartmayı okunur kılarken adayı hâlâ inandırıcı bırakıyor.
 */
export const ARAZI_ABARTI = 1.6;

const KARO = 256;
const [BATI, GUNEY, DOGU, KUZEY] = DEM_SINIR;

/**
 * Rakımlar, DEM görüntüsünden bir kez çözülür (metre, satır satır).
 *
 * 30 Eylül: önceden karo, DEM görüntüsünün renkleri yumuşatılarak
 * büyütülüyordu. Terrarium'da rakım üç kanala bölünmüş olduğu için renk
 * kanalları ayrı ayrı karışınca 256 m, 512 m gibi eşiklerde yüz metreyi
 * aşan sahte sivri duvarlar çıkıyordu (Kemal: "mahalle sınırlarında bir
 * bent"). Artık ara değer rakımın kendisinden hesaplanıyor.
 */
interface Rakimlar { en: number; boy: number; m: Float32Array }
let rakimlar: Promise<Rakimlar> | null = null;
let kayitli = false;

function rakimlariYukle(): Promise<Rakimlar> {
  if (!rakimlar) {
    rakimlar = new Promise((coz, hata) => {
      const im = new Image();
      im.onload = () => {
        const en = im.naturalWidth;
        const boy = im.naturalHeight;
        const tuval = document.createElement('canvas');
        tuval.width = en;
        tuval.height = boy;
        const ct = tuval.getContext('2d');
        if (!ct) { hata(new Error('2B bağlam alınamadı')); return; }
        ct.drawImage(im, 0, 0);
        const v = ct.getImageData(0, 0, en, boy).data;
        const m = new Float32Array(en * boy);
        for (let i = 0; i < en * boy; i++) {
          m[i] = v[i * 4] * 256 + v[i * 4 + 1] + v[i * 4 + 2] / 256 - 32768;
        }
        coz({ en, boy, m });
      };
      im.onerror = () => hata(new Error('DEM görüntüsü yüklenemedi'));
      im.src = DEM_PNG;
    });
  }
  return rakimlar;
}

/** DEM'de (x, y) pikselindeki rakım; çift doğrusal ara değer, dışarısı deniz */
function rakimOku(r: Rakimlar, x: number, y: number): number {
  if (x < 0 || y < 0 || x > r.en - 1 || y > r.boy - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, r.en - 1), y1 = Math.min(y0 + 1, r.boy - 1);
  const tx = x - x0, ty = y - y0;
  const a = r.m[y0 * r.en + x0], b = r.m[y0 * r.en + x1];
  const c = r.m[y1 * r.en + x0], d = r.m[y1 * r.en + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * Yapıların altında düzlenen arazi (5 Kasım, Kemal: "harita binaların üzerine çıkıyor,
 * toprakları düzelt"). Modeli olan her yapının taban dikdörtgeni (+PAY) tek bir kota
 * düzlenir; çevresinde RAMPA metrelik yumuşak şev var. Kot, tabanın altındaki ham
 * rakımların ortalaması; model de aynı kotu araziden okur (tek kaynak: bu karolar).
 * Yollar, arsalar araziye giydirildiği için geometrileri değişmeden şeve uyar.
 */
export interface AraziDuzlemi {
  /** Taban merkezi [boylam, enlem] */
  merkez: [number, number];
  /** Tabanın +X ekseni, metre düzleminde (x doğu, y güney), birim */
  ex: [number, number];
  /** Yarı ölçüler (metre), payı katmadan */
  a: number;
  b: number;
}
const PAY = 3;
const RAMPA = 7;
/** Bu yakınlıktan uzak karolarda düzlenmez (modeller 17'de görünür) */
const DUZLEM_EN_AZ_ZOOM = 14;
const M_ENLEM = 111_320;
let duzlemler: Array<AraziDuzlemi & { kot?: number; kx: number }> = [];
let duzlemAnahtari = '';
let duzlemSurumu = 0;

/**
 * Yollar düzlenmez: yolun altı ve kenarı doğal yamaçta kalır, düzlem yolun kenarına
 * kadar gelir. Yarı genişlikler haritadaki çizgi kalınlığına göre (metre).
 */
interface YolParcasi { a: [number, number]; b: [number, number]; yarim: number; bx0: number; bx1: number; by0: number; by1: number }
let yolParcalari: YolParcasi[] = [];
const YOL_YARIM: Record<string, number> = { 'ana yol': 5, yol: 4, cadde: 4, sokak: 3.5, toprak: 2.5, merdiven: 2.5 };
/** Yol kenarından sonra düzlemin tam etkiye ulaştığı mesafe (metre) */
const YOL_GECIS = 3;

/** Çizili veriden yollar (geometrilerine dokunulmaz, yalnız okunur) */
export function yolCizgileri(geo: FeatureCollection): Array<{ noktalar: [number, number][]; yarim: number }> {
  const l: Array<{ noktalar: [number, number][]; yarim: number }> = [];
  for (const f of geo.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.katman !== 'yol') continue;
    const yarim = YOL_YARIM[String(p.tur ?? '')] ?? 3;
    if (f.geometry?.type === 'LineString') l.push({ noktalar: f.geometry.coordinates as [number, number][], yarim });
    else if (f.geometry?.type === 'MultiLineString') f.geometry.coordinates.forEach(c => l.push({ noktalar: c as [number, number][], yarim }));
  }
  return l;
}

/**
 * Düzlenecek tabanları ve korunacak yolları verir; değiştiyse true döner (harita
 * karoları yeniden ister: `araziKarolari`). Kayda bir şey yazmaz.
 */
export function araziDuzlemleriniAyarla(liste: AraziDuzlemi[], yollar: Array<{ noktalar: [number, number][]; yarim: number }> = []): boolean {
  let yolOzeti = yollar.length;
  for (const y of yollar) for (const n of y.noktalar) yolOzeti += n[0] * 7 + n[1] * 13;
  const anahtar = JSON.stringify(liste.map(d => [d.merkez, d.ex, d.a, d.b].flat().map(x => Math.round(x * 100) / 100))) + yolOzeti.toFixed(6);
  if (anahtar === duzlemAnahtari) return false;
  duzlemAnahtari = anahtar;
  duzlemler = liste.map(d => ({ ...d, kx: M_ENLEM * Math.cos((d.merkez[1] * Math.PI) / 180) }));
  yolParcalari = [];
  for (const y of yollar) {
    for (let i = 0; i + 1 < y.noktalar.length; i++) {
      const a = y.noktalar[i], b = y.noktalar[i + 1];
      yolParcalari.push({ a, b, yarim: y.yarim, bx0: Math.min(a[0], b[0]), bx1: Math.max(a[0], b[0]), by0: Math.min(a[1], b[1]), by1: Math.max(a[1], b[1]) });
    }
  }
  duzlemSurumu++;
  return true;
}

/** Karo adresleri; düzlemler değişince sürüm değişir, harita karoları yeniden ister */
export const araziKarolari = () => [`${ARAZI_PROTOKOL}://{z}/{x}/{y}?d=${duzlemSurumu}`];

/** Düzlemin kotu: tabanın altındaki ham rakımların ortalaması (bir kez hesaplanır) */
function duzlemKotu(r: Rakimlar, d: AraziDuzlemi & { kot?: number; kx: number }): number {
  if (d.kot !== undefined) return d.kot;
  let t = 0, n = 0;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const s = (i / 2) * d.a, u = (j / 2) * d.b;
      const mx = s * d.ex[0] - u * d.ex[1], my = s * d.ex[1] + u * d.ex[0];
      const lng = d.merkez[0] + mx / d.kx, lat = d.merkez[1] - my / M_ENLEM;
      t += rakimOku(r, ((lng - BATI) / (DOGU - BATI)) * r.en - 0.5, ((KUZEY - lat) / (KUZEY - GUNEY)) * r.boy - 0.5);
      n++;
    }
  }
  d.kot = t / n;
  return d.kot;
}

/** Web Mercator karo numarasından enlem (derece) */
function karoEnlem(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Web Mercator karo numarasından boylam (derece) */
function karoBoylam(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

/**
 * Bir karoyu üretir.
 *
 * DEM enlem/boylamda düzgün aralıklı, karo ise Mercator'da. Bir karonun
 * kapsadığı enlem aralığı bu ölçeklerde çok küçük olduğu için aradaki
 * eğrilik fark edilmiyor; satır satır doğrusal eşleme yeterli.
 */
async function karoUret(z: number, x: number, y: number): Promise<ArrayBuffer> {
  const r = await rakimlariYukle();

  const tuval = document.createElement('canvas');
  tuval.width = KARO;
  tuval.height = KARO;
  const ct = tuval.getContext('2d');
  if (!ct) throw new Error('2B bağlam alınamadı');

  const bati = karoBoylam(x, z);
  const dogu = karoBoylam(x + 1, z);
  const kuzey = karoEnlem(y, z);
  const guney = karoEnlem(y + 1, z);

  // Karonun DEM üzerindeki piksel karşılığı
  const px = (lng: number) => ((lng - BATI) / (DOGU - BATI)) * r.en;
  const py = (lat: number) => ((KUZEY - lat) / (KUZEY - GUNEY)) * r.boy;
  const sx = px(bati), sy = py(kuzey);
  const adimX = (px(dogu) - sx) / KARO;
  const adimY = (py(guney) - sy) / KARO;

  const yuk = new Float32Array(KARO * KARO);
  for (let j = 0; j < KARO; j++) {
    for (let i = 0; i < KARO; i++) {
      // Piksel merkezi; kaynağın -0,5 kayması ara değeri hücre ortasına oturtur
      yuk[j * KARO + i] = rakimOku(r, sx + (i + 0.5) * adimX - 0.5, sy + (j + 0.5) * adimY - 0.5);
    }
  }

  // Yapıların altını düzle: her piksel en çok etkileyen düzlemin kotuna yaklaşır.
  // Uzak karolarda piksel yapıdan büyük; orada düzlemek yalnız iğne gibi iz bırakır.
  if (duzlemler.length && z >= DUZLEM_EN_AZ_ZOOM) {
    const agirlik = new Float32Array(KARO * KARO);
    const hedef = new Float32Array(KARO * KARO);
    const pxBoylam = (dogu - bati) / KARO, pxEnlem = (kuzey - guney) / KARO;
    for (const d of duzlemler) {
      const R = Math.hypot(d.a, d.b) + PAY + RAMPA;
      const lngR = R / d.kx, latR = R / M_ENLEM;
      if (d.merkez[0] + lngR < bati || d.merkez[0] - lngR > dogu || d.merkez[1] + latR < guney || d.merkez[1] - latR > kuzey) continue;
      const kot = duzlemKotu(r, d);
      const i0 = Math.max(0, Math.floor((d.merkez[0] - lngR - bati) / pxBoylam)), i1 = Math.min(KARO - 1, Math.ceil((d.merkez[0] + lngR - bati) / pxBoylam));
      const j0 = Math.max(0, Math.floor((kuzey - d.merkez[1] - latR) / pxEnlem)), j1 = Math.min(KARO - 1, Math.ceil((kuzey - d.merkez[1] + latR) / pxEnlem));
      for (let j = j0; j <= j1; j++) {
        const dy = -((kuzey - (j + 0.5) * pxEnlem) - d.merkez[1]) * M_ENLEM;
        for (let i = i0; i <= i1; i++) {
          const dx = (bati + (i + 0.5) * pxBoylam - d.merkez[0]) * d.kx;
          const s = dx * d.ex[0] + dy * d.ex[1], u = -dx * d.ex[1] + dy * d.ex[0];
          const uz = Math.hypot(Math.max(0, Math.abs(s) - d.a - PAY), Math.max(0, Math.abs(u) - d.b - PAY));
          if (uz >= RAMPA) continue;
          const x = 1 - uz / RAMPA;
          const w = x * x * (3 - 2 * x);
          const k = j * KARO + i;
          if (w > agirlik[k]) { agirlik[k] = w; hedef[k] = kot; }
        }
      }
    }
    // Yolların altı ve kenarı düzlenmez (yol doğal yamaçta kalır)
    const kx = M_ENLEM * Math.cos((((kuzey + guney) / 2) * Math.PI) / 180);
    const payD = (8 + YOL_GECIS) / M_ENLEM, payB = (8 + YOL_GECIS) / kx;
    const yakinYollar = yolParcalari.filter(s => s.bx1 + payB >= bati && s.bx0 - payB <= dogu && s.by1 + payD >= guney && s.by0 - payD <= kuzey)
      .map(s => ({ ax: (s.a[0] - bati) * kx, ay: (kuzey - s.a[1]) * M_ENLEM, bx: (s.b[0] - bati) * kx, by: (kuzey - s.b[1]) * M_ENLEM, yarim: s.yarim }));
    const pxX = pxBoylam * kx, pxY = pxEnlem * M_ENLEM;
    for (let k = 0; k < yuk.length; k++) {
      let w = agirlik[k];
      if (w <= 0) continue;
      if (yakinYollar.length) {
        const qx = ((k % KARO) + 0.5) * pxX, qy = (Math.floor(k / KARO) + 0.5) * pxY;
        let en = Infinity;
        for (const s of yakinYollar) {
          const vx = s.bx - s.ax, vy = s.by - s.ay, L = vx * vx + vy * vy;
          const t = L ? Math.max(0, Math.min(1, ((qx - s.ax) * vx + (qy - s.ay) * vy) / L)) : 0;
          const u = Math.hypot(qx - s.ax - t * vx, qy - s.ay - t * vy) - s.yarim;
          if (u < en) en = u;
        }
        if (en < YOL_GECIS) {
          const x = Math.max(0, en) / YOL_GECIS;
          w *= x * x * (3 - 2 * x);
        }
      }
      if (w > 0) yuk[k] += (hedef[k] - yuk[k]) * w;
    }
  }

  const cikti = ct.createImageData(KARO, KARO);
  const v = cikti.data;
  for (let j = 0; j < KARO; j++) {
    for (let i = 0; i < KARO; i++) {
      const h = Math.max(-32768, yuk[j * KARO + i]) + 32768;
      const R = Math.floor(h / 256);
      const G = Math.floor(h - R * 256);
      const B = Math.floor((h - R * 256 - G) * 256);
      const k = (j * KARO + i) * 4;
      v[k] = R; v[k + 1] = G; v[k + 2] = B; v[k + 3] = 255;
    }
  }
  ct.putImageData(cikti, 0, 0);

  const blob: Blob = await new Promise((coz, hata) =>
    tuval.toBlob(b => (b ? coz(b) : hata(new Error('karo çizilemedi'))), 'image/png')
  );
  return blob.arrayBuffer();
}

/**
 * Protokolü bir kez kaydeder. Harita bileşeni kurulmadan önce çağrılmalı.
 */
export function araziProtokolunuKur(): void {
  if (kayitli) return;
  kayitli = true;
  maplibregl.addProtocol(ARAZI_PROTOKOL, async params => {
    const eslesme = /\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!eslesme) throw new Error(`geçersiz arazi karosu: ${params.url}`);
    const [, z, x, y] = eslesme;
    const veri = await karoUret(Number(z), Number(x), Number(y));
    return { data: veri };
  });
}

/** Stile eklenecek raster-dem kaynağı */
export const araziKaynagi = (): maplibregl.RasterDEMSourceSpecification => ({
  type: 'raster-dem',
  tiles: araziKarolari(),
  tileSize: KARO,
  encoding: 'terrarium',
  minzoom: 8,
  // DEM ~35 m hücreli; 16, yapıların altındaki düzlem ve şev keskin dursun diye
  // (5 Kasım). Ötesini istemek boşuna karo üretir.
  maxzoom: 16,
  bounds: DEM_SINIR
});
