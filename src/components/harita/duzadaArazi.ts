import * as maplibregl from 'maplibre-gl';
// MapLibre karoları bir Web Worker'da işliyor ve o worker'ın adresini kendi
// paket dosyasının yanından (`import.meta.url`) türetiyor. Vite derlemeyi
// `assets/` altında topladığında o adres kayboluyor: worker hiç açılmıyor,
// harita sessizce boş deniz olarak kalıyordu — konsola tek satır hata
// düşmeden. Worker'ı Vite'a ayrı bir paket olarak kurdurup adresi elle
// veriyoruz. (Geliştirme sunucusunda sorun çıkmıyordu, yalnız yayın
// derlemesinde.)
import isciAdresi from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { DEM_PNG, DEM_SINIR } from '../../data/duzadaDem';
import { AraziSetleri, type AraziDuzlemi, type YolCizgisi } from './araziSetleri';

export { yolCizgileri, type AraziDuzlemi } from './araziSetleri';

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
 * Yamaçta set–yol–ev düzeni (5 Kasım, Kemal): hesap `araziSetleri.ts`'te. Burada yalnız
 * sürüm tutulur; düzen değişince karo adresi değişir, harita karoları yeniden ister.
 * Model de yüksekliğini bu karolardan okur (tek kaynak).
 */
/** Bu yakınlıktan uzak karolarda set yok: adanın silueti ham rakımla kalır */
const SET_EN_AZ_ZOOM = 14;
let setGirdisi: { duzlemler: AraziDuzlemi[]; yollar: YolCizgisi[] } | null = null;
let setler: AraziSetleri | null = null;
let duzlemAnahtari = '';
let duzlemSurumu = 0;

/**
 * Setlenecek tabanları ve yolları verir; değiştiyse true döner (harita karoları yeniden
 * ister: `araziKarolari`). Kayda bir şey yazmaz.
 */
export function araziDuzlemleriniAyarla(liste: AraziDuzlemi[], yollar: YolCizgisi[] = []): boolean {
  let ozet = yollar.length * 3 + liste.length;
  for (const y of yollar) for (const n of y.noktalar) ozet += n[0] * 7 + n[1] * 13;
  for (const d of liste) { ozet += d.merkez[0] * 3 + d.merkez[1] * 5 + d.a + d.b + d.ex[0]; for (const n of d.arsa ?? []) ozet += n[0] + n[1]; }
  const anahtar = ozet.toFixed(6);
  if (anahtar === duzlemAnahtari) return false;
  duzlemAnahtari = anahtar;
  setGirdisi = { duzlemler: liste, yollar };
  setler = null;
  duzlemSurumu++;
  return true;
}

/** Karo adresleri; düzen değişince sürüm değişir, harita karoları yeniden ister */
export const araziKarolari = () => [`${ARAZI_PROTOKOL}://{z}/{x}/{y}?d=${duzlemSurumu}`];

/** Setler bir kez kurulur (ham rakımlar inince) */
function setleriKur(r: Rakimlar): AraziSetleri | null {
  if (!setGirdisi) return null;
  if (!setler) {
    const okuyucu = (lng: number, lat: number) =>
      rakimOku(r, ((lng - BATI) / (DOGU - BATI)) * r.en - 0.5, ((KUZEY - lat) / (KUZEY - GUNEY)) * r.boy - 0.5);
    setler = new AraziSetleri(setGirdisi.duzlemler, setGirdisi.yollar, okuyucu, DEM_SINIR as [number, number, number, number]);
  }
  return setler;
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

  // Set–yol–ev (yalnız yakın karolarda; uzak görünüm ve kıyı ham rakımla kalır)
  if (z >= SET_EN_AZ_ZOOM) setleriKur(r)?.uygula(yuk, KARO, bati, dogu, kuzey, guney);

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
  // DEM ~35 m hücreli; 16, setler ve yollar keskin dursun diye (5 Kasım).
  // Ötesini istemek boşuna karo üretir.
  maxzoom: 16,
  bounds: DEM_SINIR
});
