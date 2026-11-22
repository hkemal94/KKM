/**
 * Tek harita: veride modeli olmayan (`dosya: null`) yapılara kodda bağlanan model
 * (6b, 22 Kasım). Veri dosyası (`duzada-yapilar.geojson`) değişmez; yapının
 * kimliğiyle eşlenir. Veride `dosya` varsa veri kazanır.
 */
export const MODEL_ESLEME: Record<string, string> = {
  // Dondurmacı Kızlar: oyunun (Dondurmacı Kızlar deposu) dükkân kabuğu; deneme dükkânının
  // biçimi, başlangıç görünüşü (krem duvar, mor çerçeve, mor-sarı tente, düz dam). Kemal, 22 Kasım.
  bina_liman_kafe: 'binalar/dondurmaci-kizlar.glb',
  // Ajansın Blender modelleri (`gen/blender_uc_yapi.py`, 22 Kasım; Kemal vitrin resmine baktı).
  // Yamaçtaki yere göre yapıldı: zemin, duvar ve taşlar o yapının tabanındaki rakıma uyar.
  // Sürek Kulübü: kulüp evi (çiftlik evi), yanındaki ayrı ev, Kangal barınağı, kuru taş avlu
  bina_surek: 'binalar/kucukcetmi-surek-kulubu.glb',
  // İskele Mescidi: badanalı, minaresiz küçük mescit, önde taş avlucuk ve abdest çeşmesi
  yapi_iskele_mescidi: 'binalar/iskele-mescidi.glb',
  // Rum Mezarlığı: alçak kuru taş duvar, kapalı demir kapı, yazısız mezar taşları (servi halkası ağaç katında)
  yapi_rum_mezarligi: 'binalar/rum-mezarligi.glb'
};
