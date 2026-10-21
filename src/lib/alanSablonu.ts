import type { Item, ItemType } from '../types';
import { DEFAULT_QUESTIONS_BY_CAT, type KunyeSorusu } from '../components/wiki/kunyeSorulari';

/**
 * Alan şablonları (3. gece, vvd; Kemal, 7 Ekim).
 *
 * Her madde türünün künyesinde hangi alanların olacağını Kemal belirler:
 * alan ekler, adını değiştirir, gizler, sıralar; bir alanı "bağ alanı"
 * yapabilir. Başlangıç şablonu bugünkü künye alanlarıdır
 * (`kunyeSorulari.ts`); Kemal hiç dokunmadıysa o kullanılır.
 *
 * Bağ alanı: değeri başka maddelerin adıdır (virgülle birden çok). Ad bir
 * maddeyle (başlık ya da takma ad) eşleşirse künyede bağlantı olur ve
 * hedef madde "künyesinde bu maddeyi ananlar"ı görür. Değer yine düz
 * yazıdır; eski kayıtlar olduğu gibi çalışır, göç gerekmez.
 *
 * Şablon `kkm_ayar` kaydında (`vikiSablonu`) durur ve yalnız Kemal
 * "Kaydet"e basınca yazılır. Kemal'in eklediği alanların değeri
 * `metadata.alanlar.<id>`'de.
 */

/** Bağ hedefi grupları; her biri bir ya da birkaç madde türü */
export const BAG_GRUPLARI = {
  kisi: { ad: 'Kişi', turler: ['kisi', 'karakter'] },
  aile: { ad: 'Aile', turler: ['aile'] },
  mekan: { ad: 'Mekân', turler: ['mekân', 'dükkân'] },
  kurum: { ad: 'Kurum', turler: ['kulüp', 'marka'] },
  mahalle: { ad: 'Mahalle', turler: ['yer'] },
  yol: { ad: 'Cadde / meydan', turler: ['cadde', 'meydan'] },
  doga: { ad: 'Yer adı', turler: ['yer_adi'] },
  olay: { ad: 'Olay', turler: ['olay'] },
  esya: { ad: 'Eşya', turler: ['ürün'] }
} as const satisfies Record<string, { ad: string; turler: readonly ItemType[] }>;
export type BagGrubu = keyof typeof BAG_GRUPLARI;
export const BAG_GRUP_SIRASI = Object.keys(BAG_GRUPLARI) as BagGrubu[];

export interface SablonAlani {
  id: string;
  label: string;
  /** Doluysa bağ alanı: hangi tür maddelere bağlanır */
  bag?: BagGrubu[];
  /** Bağ alanında birden çok madde (virgülle) */
  coklu?: boolean;
  /** Künyede, düzenleyicide ve Boşluklar'da görünmez; değeri silinmez */
  gizli?: boolean;
  /** Yalnız sitede görünmez (6. gece); vikide ve düzenleyicide durur */
  sitedeGizli?: boolean;
  /** Kemal'in eklediği alan (değeri metadata.alanlar'da) */
  ozel?: boolean;
}

export type VikiSablonu = Record<string, SablonAlani[]>;

/** Türlerin şablon sayfasındaki adları ve sırası */
export const SABLON_TURLERI: Array<{ anahtar: string; ad: string }> = [
  { anahtar: 'kisi', ad: 'Kişi' }, { anahtar: 'aile', ad: 'Aile' }, { anahtar: 'mekan', ad: 'Mekân / dükkân' },
  { anahtar: 'marka', ad: 'Kurum / marka' }, { anahtar: 'yer', ad: 'Mahalle' },
  { anahtar: 'cadde', ad: 'Cadde / sokak' }, { anahtar: 'meydan', ad: 'Meydan' }, { anahtar: 'yer_adi', ad: 'Yer adı' }, { anahtar: 'ada', ad: 'Ada' },
  { anahtar: 'olay', ad: 'Olay' },
  { anahtar: 'urun', ad: 'Eşya' }, { anahtar: 'oda', ad: 'Oda' }
];

/** Kemal'in seçtiği başlangıç bağ alanları (7 Ekim) */
const VARSAYILAN_BAGLAR: Record<string, Record<string, { bag: BagGrubu[]; coklu?: boolean }>> = {
  kisi: { aile: { bag: ['aile'] }, dogumAilesi: { bag: ['aile'] }, workplace: { bag: ['mekan', 'kurum'] }, evi: { bag: ['yol'] } },
  mekan: { manager: { bag: ['kisi', 'aile', 'kurum'], coklu: true } },
  aile: { mekanlar: { bag: ['mekan'], coklu: true }, kisiler: { bag: ['kisi'], coklu: true } },
  marka: { leader: { bag: ['kisi', 'aile'], coklu: true } },
  olay: { manager: { bag: ['kisi', 'aile', 'kurum'], coklu: true } },
  urun: { owner: { bag: ['kisi', 'mekan'], coklu: true } },
  cadde: { region: { bag: ['mahalle'], coklu: true }, uzerindekiler: { bag: ['mekan'], coklu: true } },
  meydan: { cevresi: { bag: ['mekan'], coklu: true } },
  ada: { mahalleler: { bag: ['mahalle'], coklu: true } }
};

const govdeDisi = (f: KunyeSorusu) => f.fieldPath !== 'title' && f.fieldPath !== 'notes';

/** Başlangıç şablonu: bugünkü künye alanları + seçilen bağ alanları */
export function baslangicSablonu(anahtar: string): SablonAlani[] {
  return (DEFAULT_QUESTIONS_BY_CAT[anahtar] || []).filter(govdeDisi).map(f => {
    const b = VARSAYILAN_BAGLAR[anahtar]?.[f.id];
    return { id: f.id, label: f.label, ...(b ? { bag: [...b.bag], ...(b.coklu ? { coklu: true } : {}) } : {}) };
  });
}

/**
 * Kayıttaki şablonu okur. Kayıtta olmayan yeni hazır alanlar sona eklenir
 * (kod sonradan alan eklerse kaybolmasın); bozuk girdiler atlanır.
 */
export function sablonuOku(ham: unknown): VikiSablonu {
  const s: VikiSablonu = {};
  const kayit = (ham && typeof ham === 'object' ? ham : {}) as Record<string, unknown>;
  for (const { anahtar } of SABLON_TURLERI) {
    const bas = baslangicSablonu(anahtar);
    const liste = Array.isArray(kayit[anahtar]) ? (kayit[anahtar] as unknown[]) : null;
    if (!liste) { s[anahtar] = bas; continue; }
    const temiz: SablonAlani[] = [];
    for (const x of liste) {
      if (!x || typeof x !== 'object') continue;
      const a = x as Partial<SablonAlani>;
      if (typeof a.id !== 'string' || !a.id || temiz.some(t => t.id === a.id)) continue;
      const hazir = bas.find(b => b.id === a.id);
      if (!hazir && !a.ozel) continue;          // kodda artık olmayan hazır alan
      const bag = Array.isArray(a.bag) ? a.bag.filter((g): g is BagGrubu => g in BAG_GRUPLARI) : [];
      temiz.push({
        id: a.id,
        label: (typeof a.label === 'string' && a.label.trim()) || hazir?.label || a.id,
        ...(bag.length ? { bag } : {}),
        ...(bag.length && a.coklu ? { coklu: true } : {}),
        ...(a.gizli ? { gizli: true } : {}),
        ...(a.sitedeGizli ? { sitedeGizli: true } : {}),
        ...(a.ozel ? { ozel: true } : {})
      });
    }
    for (const b of bas) if (!temiz.some(t => t.id === b.id)) temiz.push(b);
    s[anahtar] = temiz;
  }
  return s;
}

/** Firestore'a gidecek hâl: undefined yok, boş dizi yok */
export function sablonuYazilacak(s: VikiSablonu): Record<string, Record<string, unknown>[]> {
  const o: Record<string, Record<string, unknown>[]> = {};
  for (const [k, liste] of Object.entries(s)) {
    o[k] = liste.map(a => ({
      id: a.id, label: a.label.trim() || a.id,
      ...(a.bag?.length ? { bag: [...a.bag] } : {}),
      ...(a.bag?.length && a.coklu ? { coklu: true } : {}),
      ...(a.gizli ? { gizli: true } : {}),
      ...(a.sitedeGizli ? { sitedeGizli: true } : {}),
      ...(a.ozel ? { ozel: true } : {})
    }));
  }
  return o;
}

/** Yeni özel alanın kimliği: addan, Türkçe harfsiz, çakışmasız */
export function ozelAlanKimligi(ad: string, mevcut: SablonAlani[]): string {
  const kok = 'ozel_' + (ad.toLocaleLowerCase('tr')
    .replace(/[çğıöşüâî]/g, h => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' } as Record<string, string>)[h] || h)
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'alan');
  let id = kok;
  for (let n = 2; mevcut.some(a => a.id === id); n++) id = `${kok}_${n}`;
  return id;
}

// ---------------------------------------------------------------- etkin şablon

/**
 * Uygulamanın kullandığı şablon. App, kayıtlar her yüklendiğinde
 * `sablonuUygula` ile günceller; künye okuyan saf fonksiyonlar
 * (wikiSchema) buradan okur. Kayıt yokken başlangıç şablonu.
 */
let etkin: VikiSablonu = sablonuOku(null);
export const sablonuUygula = (s: VikiSablonu) => { etkin = s; };
export const etkinSablon = () => etkin;

export interface SemaAlani extends KunyeSorusu {
  bag?: BagGrubu[];
  coklu?: boolean;
  ozel?: boolean;
  /** Alan şablonunda "sitede gizli" (6. gece) */
  sitedeGizli?: boolean;
}

/**
 * Türün künye alanları (görünür olanlar, şablon sırasıyla), başta Ad ve
 * gövde. Hazır alan kendi yolunu, sorusunu ve eş adlarını korur; adı
 * şablondan gelir. Özel alanın yolu `metadata.alanlar.<id>`.
 */
export function semaAlanlari(anahtar: string, s: VikiSablonu = etkin): SemaAlani[] {
  const hazir = DEFAULT_QUESTIONS_BY_CAT[anahtar] || [];
  const bas = hazir.filter(f => !govdeDisi(f));
  const liste = s[anahtar] || baslangicSablonu(anahtar);
  const alanlar: SemaAlani[] = [];
  for (const a of liste) {
    if (a.gizli) continue;
    const h = hazir.find(f => f.id === a.id);
    if (h) {
      alanlar.push({ ...h, label: a.label || h.label, ...(a.bag?.length ? { bag: a.bag, coklu: a.coklu } : {}), ...(a.sitedeGizli ? { sitedeGizli: true } : {}) });
    } else if (a.ozel) {
      alanlar.push({
        id: a.id, label: a.label, question: `${a.label}?`, fieldPath: `metadata.alanlar.${a.id}`, ozel: true,
        ...(a.bag?.length ? { bag: a.bag, coklu: a.coklu } : {}),
        ...(a.sitedeGizli ? { sitedeGizli: true } : {})
      });
    }
  }
  return [...bas, ...alanlar];
}

// ---------------------------------------------------------------- adlar

const trKucuk = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

/** Maddenin takma adları: `aliases` ve viki temizliğinden gelen `eskiAdlar` */
export function takmaAdlar(item: Item): string[] {
  const m = (item.metadata || {}) as Record<string, unknown>;
  const liste = [...(Array.isArray(m.aliases) ? m.aliases : []), ...(Array.isArray(m.eskiAdlar) ? m.eskiAdlar : [])];
  const gorulen = new Set<string>([trKucuk(item.title)]);
  const cikti: string[] = [];
  for (const a of liste) {
    if (typeof a !== 'string' || !a.trim()) continue;
    const k = trKucuk(a);
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    cikti.push(a.trim());
  }
  return cikti;
}

/** Bağ alanının değeri → parçalar (virgül ya da noktalı virgülle) */
export const bagParcalari = (deger: string, coklu?: boolean): string[] =>
  (coklu ? deger.split(/[,;]/) : [deger]).map(p => p.trim()).filter(Boolean);

/** Bağ alanına yazılabilecek maddeler */
export function bagAdaylari(items: Item[], bag: BagGrubu[], disari?: string): Item[] {
  const turler = new Set<string>(bag.flatMap(g => BAG_GRUPLARI[g].turler));
  return items.filter(i => !i.archived && !i.isProposal && i.id !== disari && turler.has(i.type))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

/**
 * Bir adı bu türlerdeki bir maddeye çözer: başlık, başlığın parantezsiz hâli
 * ve parantez içi ("Merkez Mahallesi (Düzada Köyü)"), takma adlar;
 * "X Ailesi" ↔ "X".
 */
export function adiCoz(ad: string, adaylar: Item[]): Item | null {
  const k = trKucuk(ad);
  if (!k) return null;
  const ailesiz = (s: string) => s.replace(/\s+ailesi$/, '');
  const adlari = (i: Item) => {
    const t = i.title || '';
    return [t, t.replace(/\s*\([^)]*\)\s*/g, ' '), ...Array.from(t.matchAll(/\(([^)]+)\)/g), m => m[1]), ...takmaAdlar(i)]
      .map(trKucuk).filter(Boolean);
  };
  for (const i of adaylar) if (adlari(i).includes(k)) return i;
  for (const i of adaylar) if (i.type === 'aile' && ailesiz(trKucuk(i.title)) === ailesiz(k)) return i;
  return null;
}

export interface KunyeBagi {
  /** Künyesinde anan madde */
  kaynak: Item;
  /** Alanın künyedeki adı */
  alan: string;
}

/**
 * Bu maddeyi künyesindeki bir bağ alanında anan maddeler ("Sade Meyhane"
 * sayfasında: Çalıştığı yer ← Ali). `degerOku` künye değerini verir
 * (şema alanı ya da notlardaki künye satırı).
 */
export function kunyeBaglari(
  hedef: Item,
  items: Item[],
  anahtarBul: (i: Item) => string | undefined,
  degerOku: (i: Item, alanId: string) => string
): KunyeBagi[] {
  const cikti: KunyeBagi[] = [];
  for (const i of items) {
    if (i.id === hedef.id || i.archived || i.isProposal) continue;
    const anahtar = anahtarBul(i);
    if (!anahtar) continue;
    for (const a of semaAlanlari(anahtar)) {
      if (!a.bag?.length) continue;
      const turler = new Set<string>(a.bag.flatMap(g => BAG_GRUPLARI[g].turler));
      if (!turler.has(hedef.type)) continue;
      const deger = degerOku(i, a.id);
      if (!deger) continue;
      if (bagParcalari(deger, a.coklu).some(p => adiCoz(p, [hedef]))) cikti.push({ kaynak: i, alan: a.label });
    }
  }
  return cikti;
}

// ---------------------------------------------------------------- kayıt

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/**
 * Şablonu `kkm_ayar` kaydına yazılacak hâle getirir: kayıt varsa günceller,
 * yoksa yeni kayıt (Durum hedefleri ve yol haritası boş başlar).
 */
export function sablonKaydi(items: Item[], s: VikiSablonu): { guncel?: Item; yeni?: YeniKayit } {
  const k = items.find(i => i.type === 'kkm_ayar');
  const vikiSablonu = sablonuYazilacak(s);
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), vikiSablonu }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: 'kkm_ayar', status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { hedefler: {}, bitenler: [], isler: [], vikiSablonu }
    }
  };
}
