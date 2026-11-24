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
 * Kendi kıyısıyla gelen model (25 Kasım, Kemal: Oyunlar'daki "Otel kalıbı" haritaya): The Imperial
 * kayalık yamacı, zikzak taş merdiveni, dipteki kum cebi, taş terası ve ahşap iskelesiyle bir bütün.
 * Haritada bütün parçaları çizilir (zemin altı kuralı uygulanmaz); yalnız modelin kendi denizi
 * (`deniz`) atılır, deniz haritanınki. Yeri ve kotu veride (`modelBaslangic`, `modelKot`):
 * modelin başlangıç noktası oraya, ölçeksiz oturur (`yapiKatmani.ts` → `modelMatrisi`).
 */
export const KENDI_KIYILI: Record<string, ReadonlySet<string>> = {
  'binalar/the-imperial-kemskoy.glb': new Set(['deniz'])
};
