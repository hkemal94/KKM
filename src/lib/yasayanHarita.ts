import type { Item } from '../types';
import { parseKunye } from '../components/wiki/kunyeParser';

/**
 * Yaşayan harita (16 Kasım, Kemal öne aldı; 18 Kasım kararları): 3B haritada bir
 * yapıya dokununca küçük kart açılır: ad, görsel, vikideki maddenin kısa girişi,
 * "Vikide aç". Yalnız okuma: kayda, harita düzenine, Firestore'a hiçbir şey yazılmaz.
 *
 * 3B parçalarda (duzada-harita deposu) her özel yapının yerinde adı yapının kimliği
 * olan boş bir işaret durur (`extras.kkm_id`, ör. `bina_fener`). Kart, bu kimliği
 * aşağıdaki sırayla bir viki maddesine çevirir:
 *   1. ESLEME: ajansın eşleme listesi (Harita Ajanı, 18 Kasım) ve Kemal'in kararları
 *   2. Kurucu'daki bağ (`kurucu.baglar`; Kemal Kurucu'da bağlarsa kendiliğinden gelir)
 *   3. Maddenin `haritaBinaId` alanı (TAKMA ile: 3B'deki `bina_stad_tribun`, vikide `bina_stad`)
 * Kimlik uyuşmazlıkları burada, okurken eşlenir; kayıtlara yazılmaz (Kemal, 18 Kasım).
 * Rakım kartta gösterilmez (harita ile viki ayrışıyor; karar bekliyor).
 */

export type KartEslemesi = {
  /** Kartın açtığı viki maddesi; yoksa kart yalnız ad ve boş görsel yeriyle açılır */
  madde?: string;
  /** Kartta ikinci bağlantı olarak görünen maddeler */
  ikinci?: string[];
  /** Maddesi olmayan yapının adı (haritadaki / künyedeki adı; uydurulmaz) */
  ad?: string;
  /** Dokunma yarıçapı (metre); büyük yapılarda geniş */
  yaricap?: number;
};

/** 3B'deki yapı kimliği → kart. Kaynak: oneriler/gece-18-11/yasayan-harita-esleme.md (ajans) */
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

/** 3B'deki kimlik → vikideki `haritaBinaId` */
export const TAKMA: Record<string, string> = {
  bina_stad_tribun: 'bina_stad'
};

/** Mahalle kimlikleri: haritada `yer_merkez`, vikide `viki_yer_merkez` */
const vikiKimligi = (id: string, kimlik: Map<string, Item>): string =>
  kimlik.has(id) || !/^yer_[a-z]+$/.test(id) ? id : (kimlik.has(`viki_${id}`) ? `viki_${id}` : id);

export const VARSAYILAN_YARICAP = 30;

export type YapiKarti = {
  kimlik: string;
  ad: string;
  /** Açılacak viki maddesi (yoksa "Vikide aç" yok) */
  madde?: Item;
  ikinci: Item[];
  giris: string;
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

/**
 * Yapı kimliğini karta çeviren fonksiyon (sıra yukarıda). Kayıtlar bir kez
 * dizine alınır, sonuç önbellekte durur: 3B parçalarda yüzlerce ev işareti var.
 */
export function kartCozucu(items: Item[], baglar: Record<string, string> = {}): (kimlik: string) => YapiKarti | null {
  const ids = new Map(items.map(i => [i.id, i]));
  const binaya = new Map<string, Item>();
  for (const i of items) {
    const b = i.metadata?.haritaBinaId;
    if (!i.archived && typeof b === 'string' && b && !binaya.has(b)) binaya.set(b, i);
  }
  const bul = (id: string | undefined) => (id ? ids.get(vikiKimligi(id, ids)) : undefined);
  const onbellek = new Map<string, YapiKarti | null>();
  return kimlik => {
    if (onbellek.has(kimlik)) return onbellek.get(kimlik)!;
    const e = ESLEME[kimlik];
    let madde = bul(e?.madde) ?? bul(baglar[kimlik]);
    if (!madde && !e) madde = binaya.get(kimlik) ?? binaya.get(TAKMA[kimlik] ?? kimlik);
    const ikinci = (e?.ikinci ?? []).map(bul).filter((i): i is Item => !!i && i.id !== madde?.id);
    const kart: YapiKarti | null = madde ? { kimlik, ad: madde.title, madde, ikinci, giris: kisaGiris(madde) }
      : e?.ad ? { kimlik, ad: e.ad, ikinci, giris: '' } : null;
    onbellek.set(kimlik, kart);
    return kart;
  };
}

/** Tek yapının kartı (deneme ve tek seferlik okuma için) */
export const yapiKarti = (kimlik: string, items: Item[], baglar: Record<string, string> = {}): YapiKarti | null =>
  kartCozucu(items, baglar)(kimlik);

/** Dokunulan noktaya en yakın kartlı yapı (yatay uzaklık, yarıçap içinde) */
export function enYakinYapi(
  nokta: { x: number; z: number },
  yapilar: Iterable<{ kimlik: string; x: number; z: number }>,
  kartli: (kimlik: string) => boolean
): string | null {
  let en: string | null = null, enUzaklik = Infinity;
  for (const y of yapilar) {
    if (!kartli(y.kimlik)) continue;
    const u = Math.hypot(y.x - nokta.x, y.z - nokta.z);
    const r = ESLEME[y.kimlik]?.yaricap ?? VARSAYILAN_YARICAP;
    if (u <= r && u < enUzaklik) { en = y.kimlik; enUzaklik = u; }
  }
  return en;
}
