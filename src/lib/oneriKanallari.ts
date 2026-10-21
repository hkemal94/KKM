import type { Item } from '../types';
import { KKM_AYAR_TURU, kkmKaydi } from './yolHaritasi';

/**
 * Öneri kanalları (21 Ekim, Kemal: "Öneri kanalları açılır kapanır olabileceği
 * bir nokta olsun" · "daha çok viki için öneri versin").
 *
 * Bu dosya yalnız saf işler yapar: hangi kanal açık, bugün hangi üç yuva
 * hangi kanala gider, daha önce ne önerildi, öneri hangi maddeye bağlanır.
 * Ağ çağrısı ve kayıt yazma `geceHazirligi.ts`'te.
 *
 * Açık / kapalı bilgisi `kkm_ayar` kaydında (`oneriKanallari`), yalnız Kemal
 * "Kaydet" deyince yazılır. Hiç kayıt yoksa bütün kanallar açıktır.
 */

export const ONERI_KANALLARI = [
  { id: 'viki', ad: 'Viki / harita', aciklama: 'Vikideki bir maddenin eksik yerini ve Kemal\'e sorulacak soruyu söyler; elindeki bilgiden kısa bir örnek bölüm taslağı verir.' },
  { id: 'wikipedia', ad: 'Wikipedia örneği', aciklama: 'Gerçek dünyadan bir Vikipedi maddesini örnek alır; Düzada\'daki benzer maddede hangi başlık ve soruların olabileceğini önerir.' },
  { id: 'depo', ad: 'Dondurmacı Kızlar deposu', aciklama: 'Oyunun deposundaki tasarım belgesinden yalnız evren bilgisini (yer, dönem, sahip) vikideki "Dondurmacı Kızlar" maddesine öneri olarak taşır. Fiyat, süre gibi oyun ayarları asla.' },
  { id: 'sosyal', ad: 'Sosyal medya', aciklama: 'Gönderi fikri.' },
  { id: 'drop', ad: 'Drop / ürün', aciklama: 'Yeni ürün fikri; daha önce önerilenler tekrar gelmez.' },
  { id: 'yazi', ad: 'Yazı / fanzin', aciklama: 'Blog ya da lore yazısı fikri.' },
  { id: 'fanzin', ad: 'Aylık fanzin taslağı', aciklama: 'Ayın ilk günlerinde o ayın fanzin taslağı.' }
] as const;

export type KanalKodu = typeof ONERI_KANALLARI[number]['id'];

/** Gece yuvalarına girenler (fanzin ayrı, ayda bir) */
export type GeceTuru = Exclude<KanalKodu, 'fanzin'>;
export const GECE_TURLERI = ONERI_KANALLARI.filter(k => k.id !== 'fanzin') as unknown as ReadonlyArray<{ id: GeceTuru; ad: string; aciklama: string }>;

/** Vikiye öneri getiren kanallar: "bag" olarak mutlaka bir viki maddesi ister */
export const VIKI_AILESI: GeceTuru[] = ['viki', 'wikipedia', 'depo'];
export const vikiAilesiMi = (t: string) => (VIKI_AILESI as string[]).includes(t);

// ---------------------------------------------------------------- ayar

export type KanalAyari = Partial<Record<KanalKodu, boolean>>;

export const kanalAyari = (items: Item[]): KanalAyari => {
  const k = (kkmKaydi(items)?.metadata?.oneriKanallari || {}) as Record<string, unknown>;
  const a: KanalAyari = {};
  for (const kanal of ONERI_KANALLARI) if (typeof k[kanal.id] === 'boolean') a[kanal.id] = k[kanal.id] as boolean;
  return a;
};

export const kanalAcikMi = (ayar: KanalAyari, id: KanalKodu) => ayar[id] !== false;
export const acikGeceTurleri = (items: Item[]): GeceTuru[] => {
  const a = kanalAyari(items);
  return GECE_TURLERI.map(t => t.id).filter(id => kanalAcikMi(a, id));
};

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/**
 * Kanal ayarını `kkm_ayar` kaydına yazar. Kaydın öbür alanlarına (hedefler,
 * bitenler, isler, vikiSablonu…) dokunmaz; kayıt yoksa yeni açar.
 */
export function kanalAyariniYaz(items: Item[], ayar: KanalAyari): { guncel?: Item; yeni?: YeniKayit } {
  const k = kkmKaydi(items);
  const oneriKanallari: Record<string, boolean> = {};
  for (const kanal of ONERI_KANALLARI) oneriKanallari[kanal.id] = ayar[kanal.id] !== false;
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), oneriKanallari }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: KKM_AYAR_TURU, status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { oneriKanallari }
    }
  };
}

// ---------------------------------------------------------------- günün yuvaları

/** Gün numarası ("2026-10-21" → gün sayısı) */
const gunNo = (gun: string) => Math.floor(Date.parse(`${gun}T00:00:00Z`) / 86_400_000);
const sirada = <T,>(liste: T[], n: number): T | undefined => (liste.length ? liste[((n % liste.length) + liste.length) % liste.length] : undefined);

/**
 * Günün üç yuvası. Viki ağırlıklıdır (Kemal, 21 Ekim):
 *   1. yuva: her gün viki,
 *   2. yuva: viki ailesi sırayla (viki, Wikipedia örneği, viki, Dondurmacı deposu),
 *   3. yuva: öbür kanallar sırayla (sosyal, drop, yazı).
 * Bir kanal kapalıysa yuvası ailenin ya da diğerlerinin açık olanına kayar;
 * hiç açık kanal yoksa liste boş döner. Aynı gün aynı Wikipedia / depo iki kez
 * gelmez; viki iki kez gelebilir (farklı maddelere).
 */
export function gununYuvalari(gun: string, acik: GeceTuru[]): GeceTuru[] {
  const n = gunNo(gun);
  const var_ = (t: GeceTuru) => acik.includes(t);
  const aileDongusu = (['viki', 'wikipedia', 'viki', 'depo'] as GeceTuru[]).filter(var_);
  const digerleri = (['sosyal', 'drop', 'yazi'] as GeceTuru[]).filter(var_);
  const yuvalar: GeceTuru[] = [];
  const birinci = var_('viki') ? 'viki' : sirada(aileDongusu, n);
  if (birinci) yuvalar.push(birinci);
  const ikinci = sirada(aileDongusu, n + 1);
  if (ikinci && (ikinci === 'viki' || !yuvalar.includes(ikinci))) yuvalar.push(ikinci);
  const ucuncu = sirada(digerleri, n);
  if (ucuncu) yuvalar.push(ucuncu);
  // Eksik yuva: henüz seçilmemiş açık kanaldan; kalmadıysa viki (farklı bir maddeye)
  for (let k = 0; yuvalar.length < 3 && acik.length && k < 6; k++) {
    const kalan = acik.filter(t => !yuvalar.includes(t));
    const t = kalan.length ? sirada(kalan, n + k) : (var_('viki') ? 'viki' : undefined);
    if (!t) break;
    yuvalar.push(t);
  }
  return yuvalar.slice(0, 3);
}

// ---------------------------------------------------------------- tekrar önleme

export const sade = (s = '') => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşüâîû]+/g, ' ').trim();

export const ONCEKI_SINIRI = 90;
export const ONCEKI_HEDEF_SINIRI = 60;

/** Defterdeki satır: "tür|başlık" */
export const defterSatiri = (tur: string, baslik: string) => `${tur}|${baslik}`;
const satirAyir = (s: string): { tur: string; baslik: string } => {
  const n = s.indexOf('|');
  return n < 0 ? { tur: 'drop', baslik: s } : { tur: s.slice(0, n), baslik: s.slice(n + 1) };
};

interface GeceBilgisi { tur?: string; baslik?: string }
const adayGecesi = (i: Item) => (i.metadata?.aday as { gece?: GeceBilgisi; hedefId?: string } | undefined);

/** Defterdeki (eski `oncekiUrunler` dahil) ve tepside duran önceki öneriler, en eski başta */
export function oncekiOneriler(items: Item[], defter: { oncekiBasliklar?: string[]; oncekiUrunler?: string[] }): Array<{ tur: string; baslik: string }> {
  const eskiler = (defter.oncekiUrunler || []).map(b => ({ tur: 'drop', baslik: b }));
  const kayitli = (defter.oncekiBasliklar || []).map(satirAyir);
  const tepside = items
    .filter(i => i.type === 'aday' && !i.archived)
    .map(i => adayGecesi(i)?.gece)
    .filter((g): g is Required<GeceBilgisi> => !!g?.tur && !!g.baslik)
    .map(g => ({ tur: g.tur, baslik: g.baslik }));
  const hepsi = [...eskiler, ...kayitli, ...tepside];
  return hepsi.filter((b, n) => hepsi.findIndex(x => x.tur === b.tur && sade(x.baslik) === sade(b.baslik)) === n).slice(-ONCEKI_SINIRI);
}

/** Yapay zekâya "bunları önerme" diye giden liste, tür başına */
export const oncekiTurlereGore = (onceki: Array<{ tur: string; baslik: string }>): Record<string, string[]> => {
  const s: Record<string, string[]> = {};
  for (const o of onceki) (s[o.tur] ||= []).push(o.baslik);
  return s;
};

/** Bekleyen önerisi olan maddelerin kimlikleri (tepsiden) */
export const bekleyenHedefler = (items: Item[]): Set<string> => new Set(items
  .filter(i => i.type === 'aday' && !i.archived)
  .map(i => (i.metadata?.aday as { hedefId?: string } | undefined)?.hedefId)
  .filter((x): x is string => !!x));

// ---------------------------------------------------------------- viki adayları

const VIKI = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay'];
const canli = (items: Item[]) => items.filter(i => !i.archived && !i.isProposal);

interface Bolum { title?: string; content?: string; status?: string }
const bolumleri = (i: Item) => ((i.metadata?.wikiSections as Bolum[] | undefined) || []);

/** Maddenin ne kadar dolu olduğu: boş maddeler önce gelsin diye */
const doluluk = (i: Item) => (i.notes || '').length + bolumleri(i).filter(b => String(b.content || '').trim()).length * 300;

export interface VikiAdayi { id: string; ad: string; tur: string; dolu: string[]; bos: string[]; not: string }

/**
 * Yapay zekâya giden viki maddeleri (21 Ekim). Eskiden en uzun süredir
 * dokunulmamış 40 madde gidiyordu: liste her gece aynıydı, öneri bir maddeye
 * düşmeyince o madde yine başta kalıyordu. Şimdi:
 *   - tepside bekleyen önerisi olan ve son zamanlarda öneri alan maddeler çıkar,
 *   - türler sırayla karışır (mahalle, mekân, kişi, kurum… art arda aynı tür olmaz),
 *   - her türün içinde en boş madde önce.
 * Elenenler yüzünden liste 8'den azsa elenenler de eklenir.
 */
export function vikiAdaylari(items: Item[], sonHedefler: string[] = [], sinir = 40): Item[] {
  const bekleyen = bekleyenHedefler(items);
  const son = new Set(sonHedefler);
  const hepsi = canli(items).filter(i => VIKI.includes(i.type));
  const temiz = hepsi.filter(i => !bekleyen.has(i.id) && !son.has(i.id));
  const havuz = temiz.length >= 8 ? temiz : [...temiz, ...hepsi.filter(i => !temiz.includes(i) && !bekleyen.has(i.id))];
  const turler = new Map<string, Item[]>();
  for (const i of havuz.sort((a, b) => doluluk(a) - doluluk(b) || a.updatedAt - b.updatedAt)) {
    if (!turler.has(i.type)) turler.set(i.type, []);
    turler.get(i.type)!.push(i);
  }
  const sonuc: Item[] = [];
  const kuyruklar = [...turler.values()];
  while (sonuc.length < sinir && kuyruklar.some(k => k.length)) {
    for (const k of kuyruklar) { const x = k.shift(); if (x && sonuc.length < sinir) sonuc.push(x); }
  }
  return sonuc;
}

const kisa = (s = '', n = 240) => (s.length > n ? s.slice(0, n) + '…' : s);

export const vikiOzeti = (i: Item): VikiAdayi => ({
  id: i.id, ad: i.title, tur: i.type, not: kisa(i.notes),
  dolu: bolumleri(i).filter(b => String(b.content || '').trim() && b.title).map(b => String(b.title)).slice(0, 12),
  bos: bolumleri(i).filter(b => !String(b.content || '').trim() && b.title).map(b => String(b.title)).slice(0, 12)
});

/**
 * Önerinin bağlanacağı maddeyi bulur. Önce kimlik, sonra aynı ad, sonra tek
 * bir maddede geçen ad ("Merkez" → "Merkez Mahallesi" gibi). Birden çok madde
 * uyuyorsa tahmin edilmez: null döner.
 *
 * Eski hata (21 Ekim): yalnız tam ad eşleşiyordu; yapay zekâ adı biraz farklı
 * yazınca öneri hiçbir maddeye bağlanmıyor, maddenin sayfasında görünmüyor ve
 * "bekleyen önerisi var" sayılmadığı için aynı maddeye yeniden öneri geliyordu.
 */
export function hedefiBul(items: Item[], bagId?: string, bagAdi?: string): Item | undefined {
  const c = canli(items).filter(i => i.type !== 'aday');
  if (bagId) { const h = c.find(i => i.id === bagId); if (h) return h; }
  const ad = sade(bagAdi);
  if (!ad) return undefined;
  const tam = c.filter(i => sade(i.title) === ad);
  if (tam.length === 1) return tam[0];
  if (tam.length > 1) return undefined;
  if (ad.length < 4) return undefined;
  const kismi = c.filter(i => { const t = sade(i.title); return t.length >= 4 && (t.includes(ad) || ad.includes(t)); });
  return kismi.length === 1 ? kismi[0] : undefined;
}

// ---------------------------------------------------------------- Wikipedia kaynakları

/** Kemal'in adını andığı gerçek dünya maddeleri (Türkçe Vikipedi, 21 Ekim) */
export const WIKIPEDIA_KAYNAKLARI = [
  'Küçükkuyu, Ayvacık',
  'Küçükçetmi, Ayvacık',
  'Küçükkuyu Gençlerbirliği'
];

/** En uzun süredir kullanılmayan kaynak (hiç kullanılmamış olan önce) */
export function kaynakSec(liste: string[], defterSatirlari: string[]): string | undefined {
  const kullanim = defterSatirlari.filter(s => s.startsWith('wikipedia-kaynak|')).map(s => s.slice('wikipedia-kaynak|'.length));
  const son = (k: string) => kullanim.lastIndexOf(k);
  return [...liste].sort((a, b) => son(a) - son(b))[0];
}
