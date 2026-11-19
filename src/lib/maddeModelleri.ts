import { BINA_MODELLERI, DIRLIK_MODELI } from './binaKutuphanesi';

/**
 * The Imperial'in vikiye özel hafif kopyası (19 Kasım, Kemal). Asıl model
 * (`IMPERIAL_MODELI`) harita, Kurucu ve oyun galerisinde aynen kalır; bu kopya
 * yalnız viki maddesinin 3B görünümünde iner. Asıldan gltf-transform ile
 * üretildi (yüzey yönleri atıldı, köşeler birleştirildi, sadeleştirildi,
 * meshopt ile sıkıştırıldı); yüzey yönü olmayınca yükleyici düz gölgeleme yapar.
 */
export const IMPERIAL_VIKI_MODELI = 'binalar/the-imperial-kemskoy-viki.glb';

/**
 * Viki maddesi → 3B model (19 Kasım, Kemal: modeli olan her bina vikide
 * çevrilebilir 3B görünümle açılsın).
 *
 * Eşleme kodda sabit bir tablodur; kayıtlara hiçbir şey yazılmaz. Anahtar
 * maddenin kimliğidir (`item.id`): kimlik değişmez, başlık ise Kemal
 * değiştirince değişir (yaşayan haritanın `ESLEME`'si ve Dirlik bölümü de
 * kimlikle bulur). Yalnız modeli gerçekten o yapı için olan binalar girer;
 * her satırın dayanağı yanında.
 *
 * Karakol ve kahvehane (19 Kasım, Kemal): türün ortak modeli (`karakol.glb`,
 * `kahvehane-meyhane.glb`) belirli bir bina için olmadığından bağlanmamıştı;
 * ikisine de kendi modeli yapıldı ve bağlandı. Karakol haritada da bu modelle
 * (`bina_apt1`); kahvehane haritada yok, yalnız vikide açılır.
 */
export const MADDE_MODELLERI: Record<string, string> = {
  // Otel: yaşayan haritada `bina_imperial`; katalogda özel model
  kemskoy_hotel: IMPERIAL_VIKI_MODELI,
  // Dirlik bölümünün "Vikide aç"ı (`lib/dirlikStadi.ts` → DIRLIK_MADDESI)
  viki_mekan_dirlik_stadi: DIRLIK_MODELI,
  // Haritadaki `bina_belediye`, `bina_okul` bu modellerle çiziliyor (HARITA_YAPILARI)
  viki_mekan_belediye: 'binalar/belediye.glb',
  mekan_okul: 'binalar/okul.glb',
  // Yaşayan haritanın eşlemesi (`bina_*`) + katalogdaki aynı adlı özel modeller
  viki_mekan_fener: 'deniz/deniz-feneri.glb',
  viki_mekan_meyhane: 'binalar/sade-meyhane.glb',
  viki_mekan_liman_idare: 'binalar/liman-idare.glb',
  mekan_pazar: 'binalar/merkez-pazari.glb',
  madde_1794596168449_degzx: 'binalar/zeytinyagi-fabrikasi.glb', // Yağ Fabrikası
  // Ajansın 3B haritaya eklediği yapılar (`ek_*`): adları maddeyle birebir
  mekan_1791406293152_5flp7: 'binalar/liman-balik-hali.glb',
  mekan_1791406293432_jmrl9: 'binalar/liman-balik-lokantasi.glb',
  mekan_1791406292605_gha8n: 'binalar/eski-kilise.glb',
  // Taraftar Birahanesi: yaşayan haritada Kurucu yapısı; vikideki görseli bu modelin
  // görüntüsü (5 Kasım, Kemal seçti)
  mekan_1791406293719_6ki1i: 'binalar/taraftar-birahanesi.glb',
  // 19 Kasım, Kemal: katalogdaki aynı adlı modeller vikideki maddelerine bağlansın
  mekan_1791406290403_o0m2j: 'binalar/merkez-camii.glb', // Düzada Merkez Camii
  mekan_1791406292051_49pt1: 'binalar/saglik-ocagi.glb', // Düzada Sağlık Ocağı
  mekan_1791406291758_f8hzx: 'binalar/merkez-postanesi.glb', // Merkez Postanesi
  // 19 Kasım, Kemal: iki maddeye özel model (ajans). Karakol yaşayan haritada `bina_apt1`
  mekan_1791406291488_7jtvw: 'binalar/duzada-jandarma-karakolu.glb', // Düzada Jandarma Karakolu
  mekan_1791406291022_hotli: 'binalar/merkez-kahvehanesi.glb' // Merkez Kahvehanesi
};

const BILINEN = new Set([IMPERIAL_VIKI_MODELI, ...BINA_MODELLERI.flatMap(m => [m.dosya, ...(m.renkler?.map(r => r.dosya) ?? [])])]);

/** Maddenin 3B modeli (`public/modeller/` altındaki yol); yoksa null */
export function maddeModeli(id: string): string | null {
  const dosya = MADDE_MODELLERI[id];
  return dosya && BILINEN.has(dosya) ? dosya : null;
}
