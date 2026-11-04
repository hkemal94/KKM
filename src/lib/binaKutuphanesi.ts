/**
 * Ortak bina kütüphanesi (4 Kasım; Kemal, 2 Kasım: "KKM haritası kutu yerine bu
 * modelleri, oyunlar uygun olanları kullanır").
 *
 * Modeller ajansın `assetler/3b/` klasöründen gelir, `public/modeller/` altına
 * sıkıştırılmış (meshopt) olarak kondu. Hepsi taslak: Kemal'in onayı asset
 * panosunda. Ölçü metre, Y yukarı, ön cephe +Z.
 *
 * Başlıklar dosya adından okunur hâle getirilmiş tür adlarıdır, özel ad değildir.
 * Tek istisna The Imperial Kemskoy: oyunun ve otelin kanondaki adı.
 */

import katalogMetni from '../data/binaKatalogu.json?raw';

export type ModelGrubu = 'bina' | 'sokak' | 'bitki' | 'imperial';

export interface BinaModeli {
  /** `public/modeller/` altındaki yol */
  dosya: string;
  /** Kimlik: dosya adı uzantısız (ör. "tas-ev") */
  kimlik: string;
  baslik: string;
  grup: ModelGrubu;
}

/**
 * Ajansın `assetler/3b/katalog.json`'unun kopyası (`src/data/binaKatalogu.json`).
 * Türler buradan eşlenir: yeni model gelince katalog ve dosya kopyalanır, kod değişmez.
 */
interface Katalog {
  kurucu_turleri?: Record<string, string[]>;
  ozel?: Record<string, string>;
  sokak?: { parcalar?: string[]; dosemeler?: string[] };
  bitkiler?: string[];
}
const KATALOG = JSON.parse(katalogMetni) as Katalog;

/** KKM'ye konmayan modeller (yalnız eski çizim) */
const DISARIDA = ['binalar/haydarpasa-buyuk-olcek.glb'];

/** Bilinen dosyaların Türkçe başlığı; listede olmayan dosya adından okunur hâle getirilir */
const BASLIKLAR: Record<string, string> = {
  'tas-ev': 'Taş ev', 'cumbali-ev': 'Cumbalı ev', 'balikci-evi': 'Balıkçı evi', 'dukkanli-ev': 'Dükkânlı ev',
  'kahvehane-meyhane': 'Kahvehane / meyhane', 'koy-evi-dis-merdivenli': 'Dış merdivenli köy evi',
  belediye: 'Belediye binası', karakol: 'Karakol', okul: 'Okul', 'merkez-meydani': 'Merkez meydanı',
  cesme: 'Çeşme', cinar: 'Çınar', 'zeytin-agaci': 'Zeytin ağacı', 'bahce-duvari': 'Bahçe duvarı',
  'yol-duz': 'Yol: düz', 'yol-kose': 'Yol: köşe', 'yol-t': 'Yol: T kavşak', 'yol-kavsak': 'Yol: dört yol',
  'merdivenli-sokak': 'Merdivenli sokak', 'sokak-lambasi': 'Sokak lambası', bank: 'Bank',
  'pazar-tezgahi': 'Pazar tezgâhı', 'the-imperial-kemskoy': 'The Imperial Kemskoy',
  'ev-tas-tek-katli': 'Tek katlı taş ev', 'ev-tas-dis-merdivenli': 'Dış merdivenli taş ev', 'ev-tas-balkonlu': 'Balkonlu taş ev',
  'ev-badana-dam': 'Badanalı, düz damlı ev', 'ev-badana-iki-katli': 'İki katlı badanalı ev', 'ev-badana-kirma': 'Kırma çatılı badanalı ev',
  'ev-karisik-cumbali': 'Cumbalı karma ev', 'ev-karisik-uzun': 'Uzun karma ev', 'ev-uc-katli': 'Üç katlı ev',
  'dukkanli-ev-iki-dukkan': 'İki dükkânlı ev', 'dukkanli-ev-tas': 'Dükkânlı taş ev', 'ciftlik-evi-tas': 'Taş çiftlik evi',
  'yazlik-iki-katli': 'İki katlı yazlık', begonvil: 'Begonvil', 'cali-maki': 'Maki çalısı', 'cali-zakkum': 'Zakkum',
  'cinar-yasli': 'Yaşlı çınar', 'fistik-cami': 'Fıstık çamı', incir: 'İncir', lavanta: 'Lavanta', limon: 'Limon',
  servi: 'Servi', 'zeytin-yasli': 'Yaşlı zeytin',
  yazlik: 'Yazlık', 'depo-atolye': 'Depo / atölye', 'futbol-sahasi': 'Futbol sahası', tribun: 'Tribün'
};

export const modelKimligi = (dosya: string) => (dosya.split('/').pop() || dosya).replace(/\.glb$/i, '');

const baslikYap = (kimlik: string) => {
  const s = kimlik.replace(/-/g, ' ');
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
};

/** Kurucu türü → modeller (katalogdan). Boş türlerin modeli yok. */
export const KURUCU_MODELLERI: Record<string, string[]> = Object.fromEntries(
  Object.entries(KATALOG.kurucu_turleri ?? {})
    .map(([t, l]) => [t, (l ?? []).filter(d => !DISARIDA.includes(d))] as [string, string[]])
    .filter(([, l]) => l.length)
);

/** Modeli olmayan Kurucu türleri */
export const MODELI_EKSIK_TURLER = Object.entries(KATALOG.kurucu_turleri ?? {}).filter(([, l]) => !l?.length).map(([t]) => t);

/** The Imperial: otel kalıbının ve haritadaki otel grubunun modeli */
export const IMPERIAL_MODELI = KATALOG.ozel?.['the-imperial-kemskoy'] ?? 'binalar/the-imperial-kemskoy.glb';

/** Galerideki bütün modeller: binalar, sokak parçaları, The Imperial */
export const BINA_MODELLERI: BinaModeli[] = (() => {
  const gorulen = new Set<string>();
  const cikti: BinaModeli[] = [];
  const ekle = (dosya: string) => {
    if (gorulen.has(dosya) || DISARIDA.includes(dosya)) return;
    gorulen.add(dosya);
    const kimlik = modelKimligi(dosya);
    const grup: ModelGrubu = dosya === IMPERIAL_MODELI ? 'imperial' : dosya.startsWith('sokak/') ? 'sokak'
      : dosya.startsWith('bitkiler/') ? 'bitki' : 'bina';
    cikti.push({ dosya, kimlik, baslik: BASLIKLAR[kimlik] ?? baslikYap(kimlik), grup });
  };
  Object.values(KATALOG.kurucu_turleri ?? {}).forEach(l => (l ?? []).forEach(ekle));
  (KATALOG.sokak?.parcalar ?? []).forEach(ekle);
  (KATALOG.sokak?.dosemeler ?? []).forEach(ekle);
  (KATALOG.bitkiler ?? []).forEach(ekle);
  Object.values(KATALOG.ozel ?? {}).forEach(ekle);
  // Bina önce, sokak sonra, Imperial en sonda
  const sira: Record<ModelGrubu, number> = { bina: 0, sokak: 1, bitki: 2, imperial: 3 };
  return cikti.sort((a, b) => sira[a.grup] - sira[b.grup]);
})();

/**
 * Imperial modelinin otel kalıbına göre yeri (Kemal'in ölçüleri, 4 Kasım):
 * kalıbın merkezi modelde z = -12'de; ön köşe kuleleri modelde (±24, 12),
 * kalıpta (±24, 24). İki kule arası 48 m.
 */
export const IMPERIAL_CAPA = { z: -12, kuleArasi: 48 };

/** Kurucu türünün okunur adı (galeri etiketi) */
export const KURUCU_TUR_ADI: Record<string, string> = {
  ev: 'Müstakil ev', yazlik: 'Yazlık', depo: 'Depo / atölye', saha: 'Futbol sahası', tribun: 'Tribün', dukkanli: 'Dükkânlı ev', ciftlik: 'Taş çiftlik evi', kamu: 'Kamu / büyük yapı',
  meydan: 'Meydan', cesme: 'Çeşme', agac: 'Büyük ağaç', bag: 'Bağ / bahçe parseli', otel: 'Otel kalıbı'
};

/** Modelin hangi Kurucu türlerinde kullanıldığı */
export function modelinTurleri(dosya: string): string[] {
  const t = Object.entries(KURUCU_MODELLERI).filter(([, l]) => l.includes(dosya)).map(([k]) => k);
  return dosya === IMPERIAL_MODELI ? [...t, 'otel'] : t;
}

/** Imperial'in kat planları ve çatısı kaldırılmış iç görünümleri */
export const IMPERIAL_PLANLARI: Array<{ dosya: string; baslik: string }> = [
  { dosya: 'planlar/imperial-giris-kati.svg', baslik: 'Giriş katı planı' },
  { dosya: 'planlar/imperial-kat-plani.svg', baslik: 'Oda katları planı' }
];
export const IMPERIAL_GORUNUMLERI: Array<{ dosya: string; baslik: string }> = [
  ['giris-on', 'Giriş katı · önden'], ['giris-arka', 'Giriş katı · arkadan'], ['giris-sol', 'Giriş katı · soldan'],
  ['giris-sag', 'Giriş katı · sağdan'], ['giris-sag2', 'Giriş katı · sağdan 2'], ['giris-mutfak', 'Giriş katı · mutfak'],
  ['giris-mutfak2', 'Giriş katı · mutfak 2'], ['oda-on', 'Oda katı · önden'], ['oda-arka', 'Oda katı · arkadan'],
  ['oda-sag', 'Oda katı · sağdan'], ['oda-suit', 'Oda katı · suit']
].map(([d, b]) => ({ dosya: `planlar/${d}.webp`, baslik: b }));

/** Dosyanın tarayıcıdaki adresi */
export const modelAdresi = (dosya: string) => `${import.meta.env.BASE_URL || '/'}modeller/${dosya}`;

/** Kimlikten sabit seçim: aynı yapı her açılışta aynı modeli alır */
export function sabitSec<T>(kimlik: string, liste: T[]): T {
  return liste[Math.floor(sans(kimlik) * liste.length) % liste.length];
}

/** Kimlikten tekrar üretilebilir 0–1 sayı */
export function sans(kimlik: string): number {
  let h = 2166136261;
  for (let i = 0; i < kimlik.length; i++) { h ^= kimlik.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
