/**
 * Ortak bina kütüphanesi (4 Kasım; Kemal, 2 Kasım: "KKM haritası kutu yerine bu
 * modelleri, oyunlar uygun olanları kullanır").
 *
 * Modeller ajansın `assetler/3b/` klasöründen gelir, `public/modeller/` altına
 * sıkıştırılmış (meshopt) olarak kondu. Hepsi taslak: Kemal'in onayı asset
 * panosunda. Ölçü metre, Y yukarı, ön cephe +Z.
 *
 * Başlıklar dosya adından okunur hâle getirilmiş tür adlarıdır, özel ad değildir.
 * İstisnalar kanonda adı konmuş yapılar: The Imperial Kemskoy (oyunun ve otelin adı)
 * ve 5 Kasım'da gelen özel binalar (Sade Meyhane, Taraftar Birahanesi, Dirlik Stadı,
 * Merkez Pazarı, Liman İdare Binası, Zeytinyağı Fabrikası; adlar haritadan ve vikiden).
 */

import katalogMetni from '../data/binaKatalogu.json?raw';

export type ModelGrubu = 'bina' | 'sokak' | 'bitki' | 'bahce' | 'deniz' | 'arac' | 'imperial';

export interface BinaModeli {
  /** `public/modeller/` altındaki yol */
  dosya: string;
  /** Kimlik: dosya adı uzantısız (ör. "tas-ev") */
  kimlik: string;
  baslik: string;
  grup: ModelGrubu;
  /** Aynı modelin renkleri (galeride tek kart, renk düğmeleri); ilk renk kartın kendisi */
  renkler?: Array<{ dosya: string; kimlik: string; renk: string }>;
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
  bahce?: { kenar?: string[]; kapi?: string[]; ic?: string[]; bitki?: string[]; arsalar?: string[] };
  kaliplar?: Record<string, string>;
  deniz?: Record<string, string[] | string>;
  araclar?: string[];
  /**
   * Renk takımları: katalogdaki ad → renkli dosyalar. Ajansın katalogunda adı geçen
   * ama yerinde renkli dosyaları olan model (sedan → sedan-krem, sedan-lacivert…)
   * KKM'ye kopyalanırken buraya açılır.
   */
  renkli?: Record<string, string[]>;
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
  'bahce-arsasi-avlulu': 'Bahçe arsası: avlulu', 'bahce-arsasi-camli': 'Bahçe arsası: çamlı', 'bahce-arsasi-cardakli': 'Bahçe arsası: çardaklı',
  'bahce-arsasi-ciftlik': 'Bahçe arsası: çiftlik', 'bahce-arsasi-kose': 'Bahçe arsası: köşe', 'bahce-arsasi-sebzeli': 'Bahçe arsası: sebzeli',
  'bahce-arsasi-servili': 'Bahçe arsası: servili', 'bahce-arsasi-zeytinli': 'Bahçe arsası: zeytinli',
  'bahce-ahsap-cit-2m': 'Ahşap çit (2 m)', 'bahce-badana-duvar-2m': 'Badanalı duvar (2 m)', 'bahce-tas-duvar-2m': 'Taş duvar (2 m)',
  'bahce-yesil-cit-2m': 'Yeşil çit (2 m)', 'bahce-kapisi-ahsap': 'Bahçe kapısı: ahşap', 'bahce-kapisi-asmali': 'Bahçe kapısı: asmalı',
  'bahce-kapisi-demir': 'Bahçe kapısı: demir', 'camasir-ipi': 'Çamaşır ipi', 'cardak-asmali': 'Asmalı çardak', kuyu: 'Kuyu',
  'odun-yigini': 'Odun yığını', 'oturma-kosesi': 'Oturma köşesi', 'sebze-tarhi': 'Sebze tarhı', 'tavuk-kumesi': 'Tavuk kümesi',
  'deniz-feneri': 'Deniz feneri ve bekçi evi', 'cekek-yeri': 'Çekek yeri', 'feribot-rampasi': 'Feribot rampası',
  'mendirek-duz': 'Mendirek: düz', 'mendirek-ucu': 'Mendirek: uç', rihtim: 'Rıhtım', 'yat-iskelesi': 'Yat iskelesi',
  'ahsap-iskele-t': 'Ahşap iskele: T', 'ahsap-iskele-duz': 'Ahşap iskele: düz', 'arabali-feribot': 'Arabalı feribot',
  'balikci-teknesi': 'Balıkçı teknesi', 'deniz-taksisi': 'Deniz taksisi', 'girgir-teknesi': 'Gırgır teknesi',
  'sahil-guvenlik-botu': 'Sahil güvenlik botu', sandal: 'Sandal', yelkenli: 'Yelkenli', 'yolcu-motoru': 'Yolcu motoru',
  bisiklet: 'Bisiklet', dolmus: 'Dolmuş', hatchback: 'Hatchback', motosiklet: 'Motosiklet', pikap: 'Pikap', sedan: 'Sedan',
  taksi: 'Taksi', traktor: 'Traktör',
  yazlik: 'Yazlık', 'depo-atolye': 'Depo / atölye', 'futbol-sahasi': 'Futbol sahası', tribun: 'Tribün',
  'sade-meyhane': 'Sade Meyhane', 'taraftar-birahanesi': 'Taraftar Birahanesi', 'dirlik-stadi': 'Dirlik Stadı',
  'merkez-pazari': 'Merkez Pazarı', 'liman-idare': 'Liman İdare Binası', 'zeytinyagi-fabrikasi': 'Zeytinyağı Fabrikası'
};

export const modelKimligi = (dosya: string) => (dosya.split('/').pop() || dosya).replace(/\.glb$/i, '');

const baslikYap = (kimlik: string) => {
  const s = kimlik.replace(/-/g, ' ');
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
};

/** Katalogdaki adın renkli dosyaları; renk takımı yoksa kendisi */
const renkliAc = (dosya: string): string[] => KATALOG.renkli?.[dosya] ?? [dosya];

/** Kurucu türü → modeller (katalogdan). Boş türlerin modeli yok. */
export const KURUCU_MODELLERI: Record<string, string[]> = Object.fromEntries(
  Object.entries(KATALOG.kurucu_turleri ?? {})
    .map(([t, l]) => [t, (l ?? []).filter(d => !DISARIDA.includes(d)).flatMap(renkliAc)] as [string, string[]])
    .filter(([, l]) => l.length)
);

/** Modeli olmayan Kurucu türleri */
export const MODELI_EKSIK_TURLER = Object.entries(KATALOG.kurucu_turleri ?? {}).filter(([, l]) => !l?.length).map(([t]) => t);

/** The Imperial: otel kalıbının ve haritadaki otel grubunun modeli */
export const IMPERIAL_MODELI = KATALOG.kaliplar?.otel ?? KATALOG.ozel?.['the-imperial-kemskoy'] ?? 'binalar/the-imperial-kemskoy.glb';

/** Kurucu kalıbı (ve haritadaki aynı türdeki yapı) → model: otel → Imperial, fener → deniz feneri */
export const KALIP_MODELLERI: Record<string, string> = { otel: IMPERIAL_MODELI, ...(KATALOG.kaliplar ?? {}) };

/** Bahçe parçaları (Kemal, 4 Kasım: "bütün evler bahçeli") */
export const BAHCE = {
  kenar: (KATALOG.bahce?.kenar ?? []).flatMap(renkliAc), kapi: (KATALOG.bahce?.kapi ?? []).flatMap(renkliAc),
  ic: (KATALOG.bahce?.ic ?? []).flatMap(renkliAc), bitki: (KATALOG.bahce?.bitki ?? []).flatMap(renkliAc),
  arsalar: (KATALOG.bahce?.arsalar ?? []).flatMap(renkliAc)
};

/** Dosya adındaki renk eki: "araclar/sedan-krem.glb" (takımı "araclar/sedan.glb") → "krem" */
const RENK_SOZCUK: Record<string, string> = { yesil: 'yeşil', kirmizi: 'kırmızı' };
const renkAdi = (takim: string, dosya: string) => modelKimligi(dosya).slice(modelKimligi(takim).length + 1)
  .split('-').filter(Boolean).map(w => RENK_SOZCUK[w] ?? w).join(' ');

/** Galerideki bütün modeller: binalar, sokak parçaları, The Imperial */
export const BINA_MODELLERI: BinaModeli[] = (() => {
  const gorulen = new Set<string>();
  const cikti: BinaModeli[] = [];
  const grubu = (dosya: string): ModelGrubu => dosya === IMPERIAL_MODELI ? 'imperial'
    : dosya.startsWith('sokak/') ? 'sokak' : dosya.startsWith('bitkiler/') ? 'bitki' : dosya.startsWith('bahce/') ? 'bahce'
      : dosya.startsWith('deniz/') ? 'deniz' : dosya.startsWith('araclar/') ? 'arac' : 'bina';
  const ekle = (takim: string) => {
    if (gorulen.has(takim) || DISARIDA.includes(takim)) return;
    gorulen.add(takim);
    const dosyalar = renkliAc(takim);
    const kimlik = modelKimligi(takim);
    const ilk = dosyalar[0];
    cikti.push({
      dosya: ilk, kimlik: modelKimligi(ilk), baslik: BASLIKLAR[kimlik] ?? baslikYap(kimlik), grup: grubu(takim),
      ...(dosyalar.length > 1 || ilk !== takim
        ? { renkler: dosyalar.map(d => ({ dosya: d, kimlik: modelKimligi(d), renk: renkAdi(takim, d) || 'tek renk' })) } : {})
    });
  };
  Object.values(KATALOG.kurucu_turleri ?? {}).forEach(l => (l ?? []).forEach(ekle));
  (KATALOG.sokak?.parcalar ?? []).forEach(ekle);
  (KATALOG.sokak?.dosemeler ?? []).forEach(ekle);
  (KATALOG.bitkiler ?? []).forEach(ekle);
  [...BAHCE.arsalar, ...BAHCE.kenar, ...BAHCE.kapi, ...BAHCE.ic].forEach(ekle);
  Object.values(KATALOG.kaliplar ?? {}).forEach(ekle);
  Object.values(KATALOG.deniz ?? {}).forEach(l => (Array.isArray(l) ? l : [l]).forEach(d => { if (d.endsWith('.glb')) ekle(d); }));
  (KATALOG.araclar ?? []).forEach(ekle);
  Object.values(KATALOG.ozel ?? {}).forEach(ekle);
  // Katalogda sırası: bina, sokak, bitki, bahçe, deniz, araç; Imperial en sonda
  const sira: Record<ModelGrubu, number> = { bina: 0, sokak: 1, bitki: 2, bahce: 3, deniz: 4, arac: 5, imperial: 6 };
  return cikti.sort((a, b) => sira[a.grup] - sira[b.grup]);
})();

/**
 * Imperial modelinin otel kalıbına göre yeri (Kemal'in ölçüleri, 4 Kasım):
 * kalıbın merkezi modelde z = -12'de; ön köşe kuleleri modelde (±24, 12),
 * kalıpta (±24, 24). İki kule arası 48 m.
 */
export const IMPERIAL_CAPA = { z: -12, kuleArasi: 48 };

/** Katalogdaki özel model; katalogda yoksa verilen yol */
const ozelModel = (ad: string, yedek: string) => KATALOG.ozel?.[ad] ?? yedek;

/**
 * Haritadaki (üreteçten gelen) adlı yapılar → model (Kemal, 4 Kasım). Değer bir dosya
 * ya da Kurucu türü (o türün modelleri arasından seçilir). 5 Kasım (Kemal: "haritadaki
 * kutu binalara özel bina yap"): Sade Meyhane, Merkez Pazarı, Liman İdare Binası ve
 * Zeytinyağı Fabrikası kendi modellerini aldı. Tabloda olmayan "yapı" türündeki
 * binalar kutu kalır: Kemsköy Caddesi'ndeki yapılar. Dirlik Stadı'nın parçaları
 * (tribünler, soyunma, ışık direkleri) tek modelle çizilir: `DIRLIK_STADI`.
 * Haritada karakol yok.
 */
export const HARITA_YAPILARI: Record<string, string> = {
  bina_belediye: 'binalar/belediye.glb',    // Belediye Binası
  bina_okul: 'binalar/okul.glb',            // Düzada İlkokulu
  bina_apt1: 'dukkanli',                    // Dükkânlı Ev
  bina_apt2: 'ev',                          // Müstakil Ev
  bina_liman_depo: 'depo',                  // Liman Deposu
  bina_meyhane: ozelModel('sade-meyhane', 'binalar/sade-meyhane.glb'),                  // Sade Meyhane
  bina_pazar: ozelModel('merkez-pazari', 'binalar/merkez-pazari.glb'),                  // Merkez Pazarı
  bina_liman_ofis: ozelModel('liman-idare', 'binalar/liman-idare.glb'),                 // Liman İdare Binası
  bina_zeytinyagi: ozelModel('zeytinyagi-fabrikasi', 'binalar/zeytinyagi-fabrikasi.glb') // Zeytinyağı Fabrikası
};

/**
 * Viki maddesine bağlı yapı → model (5 Kasım). Haritada kimliği olmayan, Kurucu'da
 * konup maddeye bağlanan yapılar için: bağ hangi yapıdaysa model oraya gelir.
 * Taraftar Birahanesi Kurucu'da Stadyum Mahallesi'nde (gömülü düzende bağlı).
 */
export const MADDE_MODELLERI: Record<string, string> = {
  mekan_1791406293719_6ki1i: ozelModel('taraftar-birahanesi', 'binalar/taraftar-birahanesi.glb') // Taraftar Birahanesi
};

/**
 * Kendi ölçüsünde çizilen özel binalar (5 Kasım): kutunun tabanına tek ölçekle sığar
 * (en çok kendi boyu, gerekirse küçülür; enine boyuna ayrı gerilmez).
 */
export const KENDI_OLCUSUNDE = new Set<string>([...Object.values(MADDE_MODELLERI),
  ...['bina_meyhane', 'bina_pazar', 'bina_liman_ofis', 'bina_zeytinyagi'].map(id => HARITA_YAPILARI[id])]);

/**
 * Dirlik Stadı (5 Kasım): saha, kapalı ana tribün, açık tribün, duvar, soyunma ve dört
 * ışık direği tek modelde. Haritadaki parçaların kutuları gizlenir, model sahanın
 * (`stad_saha`) ortasına oturur. Modelde saha x 0..90, z -58..0 (orta x 45, z -29);
 * kapalı tribün +Z yanında. Uzun kenar sahanın uzun kenarına, kapalı tribün haritadaki
 * ana tribünün (`bina_stad_cati`) yanına gelir. Saha haritadakinden büyükse orantılı küçülür.
 */
export const DIRLIK_STADI = {
  dosya: ozelModel('dirlik-stadi', 'binalar/dirlik-stadi.glb'),
  saha: 'stad_saha',
  anaTribun: 'bina_stad_cati',
  parcalar: ['bina_stad_tribun', 'bina_stad_cati', 'bina_stad_acik', 'bina_stad_soyunma',
    'bina_stad_isik_1', 'bina_stad_isik_2', 'bina_stad_isik_3', 'bina_stad_isik_4'],
  capa: { x: 45, z: -29 },
  sahaEn: 90, sahaBoy: 58
};

/** Haritadaki yapı türü → Kurucu türü (üreteçteki evler ve çiftlik depoları) */
export const HARITA_TURLERI: Record<string, string> = { ev: 'ev', depo: 'depo' };

/**
 * Hazır bahçe arsalarının taban sınırı (modelin kendi ölçüsü, metre; ön +Z). Haritada
 * arsa modeli yalnız evin kendi arsasına bütünüyle sığıyorsa konur. Ölçüler ajansın
 * dosyalarından okundu (4 Kasım); tabloda olmayan arsa haritada kullanılmaz.
 */
export const ARSA_OLCULERI: Record<string, { x0: number; x1: number; z0: number; z1: number }> = {
  'bahce/bahce-arsasi-avlulu.glb': { x0: -4.0, x1: 17.6, z0: -14.0, z1: 8.1 },
  'bahce/bahce-arsasi-camli.glb': { x0: -7.0, x1: 20.1, z0: -16.0, z1: 9.1 },
  'bahce/bahce-arsasi-cardakli.glb': { x0: -6.0, x1: 19.0, z0: -14.0, z1: 11.1 },
  'bahce/bahce-arsasi-ciftlik.glb': { x0: -10.0, x1: 21.0, z0: -17.0, z1: 10.1 },
  'bahce/bahce-arsasi-kose.glb': { x0: -9.4, x1: 17.4, z0: -18.4, z1: 8.5 },
  'bahce/bahce-arsasi-sebzeli.glb': { x0: -8.0, x1: 19.0, z0: -17.0, z1: 9.1 },
  'bahce/bahce-arsasi-servili.glb': { x0: -5.5, x1: 18.5, z0: -15.4, z1: 12.4 },
  'bahce/bahce-arsasi-zeytinli.glb': { x0: -5.0, x1: 18.0, z0: -15.0, z1: 10.1 }
};

/** Park etmiş arabalar: binek araçlarının renkli dosyaları (dolmuş, taksi, traktör, iki teker değil) */
export const ARACLAR: string[] = (KATALOG.araclar ?? []).filter(d => /sedan|hatchback|pikap/.test(d)).flatMap(renkliAc);

/** Liman ve iskele tekneleri (renkli dosyalar) */
const denizListesi = (ad: RegExp) => Object.values(KATALOG.deniz ?? {})
  .flatMap(l => (Array.isArray(l) ? l : [l])).filter(d => ad.test(d)).flatMap(renkliAc);
export const TEKNELER = {
  balikci: denizListesi(/balikci-teknesi/), girgir: denizListesi(/girgir-teknesi/), sandal: denizListesi(/sandal/)
};

/** Kurucu türünün okunur adı (galeri etiketi) */
export const KURUCU_TUR_ADI: Record<string, string> = {
  ev: 'Müstakil ev', yazlik: 'Yazlık', depo: 'Depo / atölye', saha: 'Futbol sahası', tribun: 'Tribün', dukkanli: 'Dükkânlı ev', ciftlik: 'Taş çiftlik evi', kamu: 'Kamu / büyük yapı',
  meydan: 'Meydan', cesme: 'Çeşme', agac: 'Büyük ağaç', bag: 'Bağ / bahçe parseli', otel: 'Otel kalıbı', fener: 'Fener kalıbı'
};

/** Modelin hangi Kurucu türlerinde kullanıldığı */
export function modelinTurleri(dosya: string): string[] {
  const t = Object.entries(KURUCU_MODELLERI).filter(([, l]) => l.includes(dosya)).map(([k]) => k);
  const kaliplar = Object.entries(KALIP_MODELLERI).filter(([, d]) => d === dosya).map(([k]) => k);
  return [...t, ...kaliplar];
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
  // Murmur3 son karıştırması: ardışık kimlikler ("ev_224", "ev_225") birbirine benzer sonuç vermesin
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
