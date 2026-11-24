import type { KirpmaAyari } from '../modelHazirla';
/**
 * Tek harita: veride modeli olmayan (`dosya: null`) yapılara kodda bağlanan model
 * (6b, 22 Kasım). Veri dosyası (`duzada-yapilar.geojson`) değişmez; yapının
 * kimliğiyle eşlenir. Veride `dosya` varsa veri kazanır.
 */
export const MODEL_ESLEME: Record<string, string> = {
  // Dondurmacı Kızlar: oyunun (Dondurmacı Kızlar deposu) dükkân kabuğu; deneme dükkânının
  // biçimi, başlangıç görünüşü (krem duvar, mor çerçeve, mor-sarı tente, düz dam). Kemal, 22 Kasım.
  bina_liman_kafe: 'binalar/dondurmaci-kizlar.glb',
  // Ajansın Blender modelleri (`gen/blender_uc_yapi.py`, 22 Kasım; Kemal vitrin resmine baktı, cevapladı).
  // Yamaçtaki yere göre yapıldı: zemin, duvar ve taşlar o yapının tabanındaki rakıma uyar.
  // Sürek Kulübü, U biçiminde (Kemal): kulüp evi, Kangal barınağı ve ahır kanadı, ayrı ev kanadı; kuru taş avlu
  bina_surek: 'binalar/kucukcetmi-surek-kulubu.glb',
  // İskele Mescidi: badanalı küçük mescit, küçük tek şerefeli minare (Kemal), taş avlucuk, abdest çeşmesi
  yapi_iskele_mescidi: 'binalar/iskele-mescidi.glb',
  // Rum Mezarlığı: alçak kuru taş duvar, kapalı demir kapı, yazısız mezar taşları (servi halkası ağaç katında)
  yapi_rum_mezarligi: 'binalar/rum-mezarligi.glb'
};

/**
 * Kendi zemini olan modeller: yamaca göre yapılanlar (Blender: `gen/blender_uc_yapi.py`,
 * `gen/blender_tek_eklemeler.py`; zeminleri, duvarları, taşları tabanın en alçak noktasına göre)
 * ve kendi temeliyle gelen The Imperial (temeli ve terasları 19 m aşağı iner, tepesinin sahanlığı
 * düzlenmiş). Tek harita onları eski kuralla (en alçak nokta, kaidesiz) oturtur
 * (`tekVeri.ts` → `tabanKotu`; 24 Kasım). The Imperial'in veride kendi kotu varsa (`modelKot`, 25 Kasım) o geçer.
 */
export const YAMAC_MODELLERI = new Set([
  'binalar/kucukcetmi-surek-kulubu.glb', 'binalar/iskele-mescidi.glb', 'binalar/rum-mezarligi.glb',
  'binalar/yangin-gozetleme-kulesi.glb', 'binalar/antik-sur-kalintisi.glb', 'binalar/merkez-mezarligi.glb',
  'binalar/the-imperial-kemskoy.glb'
]);

/**
 * Kendi kayalığıyla gelen model (25 Kasım, Kemal: Oyunlar'daki "Otel kalıbı" haritaya; "20 m yükseklikte bu tipte
 * olmalıydı"; yar kayalık, merdiven yarın yüzünde): The Imperial modelinin binası, kayalık yarı, taş merdiveni, kum cebi
 * ve taş terası çizilir; çimeni (sahanlık adanın zemini), denizi ve suyun içindekiler (kendi iskelesi, kayıklar; yerel
 * z 33'ten ileride, sahanlığın 14 m altında) ve kendi zikzak merdiveni atılır; cep plajı deniz seviyesine iner. İskele
 * ve tek dönüşlü taş merdiven adanın (`iskele_imperial`, Sahil Merdiveni). Yeri ve kotu veride
 * (`modelBaslangic`, `modelKot`): modelin başlangıç noktası oraya, ölçeksiz oturur (`yapiKatmani.ts` → `modelMatrisi`).
 */
export const MODEL_KIRPMA: Record<string, KirpmaAyari> = {
  'binalar/the-imperial-kemskoy.glb': {
    // tas2 / saksi: modelin kendi zikzak merdiveni ve saksıları (Kemal: merdiven tek dönüşlü; haritanın taş merdiveni)
    atla: new Set(['deniz', 'cimen', 'tas2', 'saksi']), suIci: { z: 33, y: -14 },
    // modelin merdiveninin öbür parçaları (basamak, korkuluk; yarın merdiven oyuğunda, sahanlığın 1 m altından aşağısı)
    kutu: { adlar: new Set(['demir', 'fener', 'ahsap', 'ahsap_koyu', 'kesme', 'kesme2', 'silme', 'badana', 'asma2']), x: [26, 40], z: [21.5, 34], y: -1 },
    // Sahanlık 20 m (`gen/kompakt_zemin.py` → IMP_MODEL_KOT 20,1): modelin cep plajı 3,5 m iner, deniz seviyesine
    indir: { adlar: new Set(['kum', 'kum2', 'islak_kum', 'sezlong', 'havlu', 'semsiye', 'semsiye2']), y: -3.5 }
  }
};
