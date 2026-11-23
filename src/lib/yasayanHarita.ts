import type { Item } from '../types';
import { parseKunye } from '../components/wiki/kunyeParser';

/**
 * Yaşayan harita (16 Kasım, Kemal öne aldı; 18 Kasım kararları): haritada bir
 * yapıya dokununca küçük kart açılır: ad, görsel, vikideki maddenin kısa girişi,
 * "Vikide aç". Yalnız okuma: kayda, Firestore'a hiçbir şey yazılmaz.
 *
 * ESLEME: yapı kimliği → viki maddesi (ajansın eşleme listesi ve Kemal'in
 * kararları). Tek harita (`TekHarita.tsx`) ve Düzenle modu okur; kartın kısa
 * girişi `kisaGiris`. Kimlik uyuşmazlıkları okurken eşlenir; kayıtlara
 * yazılmaz (Kemal, 18 Kasım). Rakım kartta gösterilmez.
 */

export type KartEslemesi = {
  /** Kartın açtığı viki maddesi; yoksa kart yalnız ad ve boş görsel yeriyle açılır */
  madde?: string;
  /** Kartta ikinci bağlantı olarak görünen maddeler */
  ikinci?: string[];
  /** Maddesi olmayan yapının adı (haritadaki / künyedeki adı; uydurulmaz) */
  ad?: string;
  /** Dokunma yarıçapı (metre; eski 3B haritadan kaldı, eşleme listesiyle uyum için) */
  yaricap?: number;
};

/** Yapı kimliği → kart. Kaynak: oneriler/gece-18-11/yasayan-harita-esleme.md (ajans) */
export const ESLEME: Record<string, KartEslemesi> = {
  bina_imperial: { madde: 'kemskoy_hotel', yaricap: 70 },
  bina_fener: { madde: 'viki_mekan_fener' },
  bina_stad_tribun: { madde: 'viki_mekan_dirlik_stadi', yaricap: 90 },
  // 18 Kasım, Kemal: bina kulübe bağlanır, çiftlik ikinci bağlantı (künye: çiftlik evi kulüp evi)
  bina_surek: { madde: 'marka_1782600611254_j7gg5', ikinci: ['madde_1791396429330'] },
  bina_meyhane: { madde: 'viki_mekan_meyhane' },
  bina_liman_ofis: { madde: 'viki_mekan_liman_idare' },
  // Haritada türü "kafe"; Liman'daki adsız öbür kafeyle karıştırılmasın
  bina_liman_kafe: { madde: 'viki_mekan_liman_kafe' },
  bina_belediye: { madde: 'viki_mekan_belediye' },
  bina_pazar: { madde: 'mekan_pazar' },
  bina_okul: { madde: 'mekan_okul', yaricap: 45 },
  // 19 Kasım: haritadaki adı da karakol (eskiden "Dükkânlı Ev"); kartın adı vikiden gelir
  bina_apt1: { madde: 'mekan_1791406291488_7jtvw' },
  // 19 Kasım, Kemal: kahvehane haritada meydanın kuzeydoğu üçgeninde (aday B)
  bina_kahvehane: { madde: 'mekan_1791406291022_hotli' },
  kurucu_bina_mw1zb16h: { madde: 'mekan_1791406293719_6ki1i' },
  kurucu_bina_muzkrwr7: { madde: 'marka_dirlik' },
  // Eşleme listesinde çıkarım: künyedeki kooperatif fabrikası Çiftlik'te
  bina_zeytinyagi: { madde: 'madde_1794596168449_degzx', yaricap: 45 },
  // Ajansın 3B haritaya eklediği yapılar (ek_*): adları maddeyle birebir
  ek_balik_hali: { madde: 'mekan_1791406293152_5flp7' },
  ek_balik_lokantasi: { madde: 'mekan_1791406293432_jmrl9' },
  ek_eski_kilise: { madde: 'mekan_1791406292605_gha8n' },
  // 18 Kasım, Kemal: vikide maddesi yok; yalnız ad ve boş görsel yeri, "Vikide aç" yok.
  // 3B'de henüz işareti yok; Blender'a eklenince kendiliğinden dokunulur olur.
  bina_fener_evi: { ad: 'Fener Evi' }
};

/** Rakım parçalarını çıkarır ("· 69 m rakım", "Rakım: 69 m") */
export const rakimsiz = (s: string): string => s
  .replace(/\s*[·,;-]?\s*\d[\d.,]*\s*m(?:etre)?\s+rakım(?:da|lı)?/giu, '')
  .replace(/\s*[·,;-]?\s*rakım(?:ı)?\s*:?\s*\d[\d.,]*\s*m(?:etre)?/giu, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

/**
 * Maddenin kısa girişi: kendi metninin ilk paragrafı (rakımsız). Çok kısaysa
 * künyenin ilk satırı eklenir. Kart 3 satırla keser; burada da uzunluk sınırı var.
 */
export function kisaGiris(item: Item, enCok = 240): string {
  const k = parseKunye(item);
  const paragraf = (k.body.split(/\n\s*\n/).map(p => rakimsiz(p.replace(/\s*\n\s*/g, ' '))).find(Boolean)) ?? '';
  const alanlar = k.fields
    .filter(f => !/rakım/iu.test(f.label))
    .map(f => `${f.label}: ${rakimsiz(f.value)}`)
    .filter(s => !/:\s*$/.test(s));
  let metin = paragraf;
  if (metin.length < 80 && alanlar.length) metin = [metin, alanlar[0]].filter(Boolean).join(' · ');
  if (!metin && alanlar.length) metin = alanlar.slice(0, 2).join(' · ');
  return metin.length > enCok ? `${metin.slice(0, enCok - 1).trimEnd()}…` : metin;
}
