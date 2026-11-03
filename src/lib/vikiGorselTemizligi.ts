import type { Item } from '../types';
import { WIKI_TYPES, TYPE_LABELS } from '../components/wiki/wikiSchema';
import { basvuruMu, icerikKimligi } from './gorselBasvuru';
import { maddeGorseli } from './maddeGorseli';
import { hazirFotoMu } from './gorselSecimi';

/**
 * Vikide kalan silinmiş galeri görselleri (3 Kasım, Kemal: "Görselleri
 * galeriden sildim ama vikide kaldı, onları da kaldıralım"). Saf dosya:
 * veritabanına dokunmaz; yazmayı kart yapar, yalnız Kemal basınca.
 *
 * Galeri'de "bağla" görseli başvuru değil görselin kendisiyle kopyalar; galeri
 * kaydı silinince vikideki kopya kalır. Bundan sonra bağlanan görselin izi
 * hedef kayıtta durur: `metadata.galeriKaynaklari = [{ galeriId, kimlik }]`
 * (kimlik = görselin içerik kimliği). İzi olan görsel kesin ayırt edilir;
 * izi olmayan eski görsellerde iz yoktur: galeride aynı görsel yoksa "emin
 * değil" diye ayrı gösterilir (Kemal'in maddeye doğrudan yüklediği de olabilir).
 */

export interface GaleriIzi { galeriId: string; kimlik: string }

/** Kaydın galeri izleri (bozuk satırlar atlanır) */
export function galeriIzleri(i: Item): GaleriIzi[] {
  const ham = (i.metadata as Record<string, unknown> | undefined)?.galeriKaynaklari;
  if (!Array.isArray(ham)) return [];
  return ham.filter((z): z is GaleriIzi =>
    !!z && typeof (z as GaleriIzi).galeriId === 'string' && typeof (z as GaleriIzi).kimlik === 'string');
}

/** Bağlamada hedefe yazılacak iz listesi (aynı galeri kaydı ikinci kez eklenmez) */
export function izEkle(hedef: Item, galeriId: string, veri: string): GaleriIzi[] | null {
  const izler = galeriIzleri(hedef);
  if (izler.some(z => z.galeriId === galeriId)) return null;
  return [...izler, { galeriId, kimlik: icerikKimligi(veri) }];
}

export const vikiMaddeleri = (items: Item[]) =>
  items.filter(i => WIKI_TYPES.includes(i.type) && !i.archived && !i.isProposal);

/** Galeriden kopyalanmış olabilecek değer: dosyanın kendisi ya da depodaki yol */
const kopyaOlabilir = (s: unknown): s is string =>
  typeof s === 'string' && (s.startsWith('data:image/') || s.startsWith('/')) && !basvuruMu(s);

export interface Aday {
  /** Seçim anahtarı */
  anahtar: string;
  item: Item;
  /** images içindeki değer (silinecek olan) */
  gorsel: string;
  kimlik: string;
  kesin: boolean;
}

const galeriKayitlari = (items: Item[]) => items.filter(i => i.type === 'ilham_gorsel');

/** İzi olan ve galeri kaydı artık olmayan görseller: kesin */
export function kesinAdaylar(items: Item[]): Aday[] {
  const galeride = new Set(galeriKayitlari(items).map(g => g.id));
  const cikti: Aday[] = [];
  for (const item of vikiMaddeleri(items)) {
    const silinmis = new Set(galeriIzleri(item).filter(z => !galeride.has(z.galeriId)).map(z => z.kimlik));
    if (!silinmis.size) continue;
    for (const g of item.images || []) {
      if (!kopyaOlabilir(g)) continue;
      const kimlik = icerikKimligi(g);
      if (silinmis.has(kimlik)) cikti.push({ anahtar: `${item.id}|${kimlik}`, item, gorsel: g, kimlik, kesin: true });
    }
  }
  return cikti;
}

/**
 * Galeride hâlâ duran görsellerin içerik kimlikleri. Görsel belgede duruyorsa
 * (`gorsel:<id>`) çağıran içeriği okuyup verir (`okunan`: başvuru → veri).
 */
export function galeriIcerikKimlikleri(items: Item[], okunan: Map<string, string>): Set<string> {
  const k = new Set<string>();
  for (const g of galeriKayitlari(items)) {
    for (const s of g.images || []) {
      const veri = basvuruMu(s) ? okunan.get(s) : s;
      if (typeof veri === 'string') k.add(icerikKimligi(veri));
    }
  }
  return k;
}

/** Okunması gereken galeri başvuruları */
export const galeriBasvurulari = (items: Item[]) =>
  [...new Set(galeriKayitlari(items).flatMap(g => (g.images || []).filter(basvuruMu)))];

/**
 * İzi olmayan ve galeride aynısı bulunmayan görseller: emin değil. Galeri
 * içeriği okunamadıysa (`okunamayan` > 0) çağıran bunu ekranda söyler.
 */
export function belirsizAdaylar(items: Item[], galeriKimlikleri: Set<string>): Aday[] {
  const cikti: Aday[] = [];
  for (const item of vikiMaddeleri(items)) {
    const izli = new Set(galeriIzleri(item).map(z => z.kimlik));
    for (const g of item.images || []) {
      if (!kopyaOlabilir(g)) continue;
      const kimlik = icerikKimligi(g);
      if (izli.has(kimlik) || galeriKimlikleri.has(kimlik)) continue;
      cikti.push({ anahtar: `${item.id}|${kimlik}`, item, gorsel: g, kimlik, kesin: false });
    }
  }
  return cikti;
}

/** Seçilen görseller çıkarılmış kayıtlar (izleri de çıkar; iz kalmazsa alan silinir) */
export function temizlenmisKayitlar(secilen: Aday[]): Item[] {
  const kayitta = new Map<string, { item: Item; kimlikler: Set<string> }>();
  for (const a of secilen) {
    const k = kayitta.get(a.item.id) || { item: a.item, kimlikler: new Set<string>() };
    k.kimlikler.add(a.kimlik);
    kayitta.set(a.item.id, k);
  }
  return [...kayitta.values()].map(({ item, kimlikler }) => {
    const images = (item.images || []).filter(g => !(kopyaOlabilir(g) && kimlikler.has(icerikKimligi(g))));
    const metadata = { ...(item.metadata || {}) } as Record<string, unknown>;
    const izler = galeriIzleri(item).filter(z => !kimlikler.has(z.kimlik));
    if (izler.length) metadata.galeriKaynaklari = izler; else delete metadata.galeriKaynaklari;
    return { ...item, images, metadata, updatedAt: Date.now() } as Item;
  });
}

/** Görseli olmayan viki maddeleri (yalnız gösterim) */
export function gorselIsteyenler(items: Item[]): Item[] {
  const bagli = new Set(items
    .filter(g => g.type === 'ilham_gorsel' && !g.archived && (g.images || []).length)
    .map(g => (g.metadata as Record<string, unknown> | undefined)?.bagliId)
    .filter((x): x is string => typeof x === 'string'));
  return vikiMaddeleri(items)
    .filter(i => !bagli.has(i.id)
      && !(i.images || []).some(g => typeof g === 'string' && g && !hazirFotoMu(g))
      && !maddeGorseli(i, items))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

export const turAdi = (i: Item) => TYPE_LABELS[i.type] || i.type;

/** Ajana gidecek istek metni */
export function gorselIstegi(liste: Item[]): string {
  const ENFAZLA = 120;
  const satirlar = liste.slice(0, ENFAZLA).map(i => `- ${i.title} (${turAdi(i)})`);
  const kalan = liste.length - satirlar.length;
  return [
    `Görseli olmayan viki maddeleri (${liste.length}):`,
    ...satirlar,
    ...(kalan > 0 ? [`- … ve ${kalan} madde daha (KKM → Durum → Eksikler'de tam liste)`] : []),
    '',
    "Her biri için Canva'dan uygun görsel öner (gerekirse Canva'daki mevcut tasarımlardan). Öneri yalnız aday; "
    + 'Kemal onaylamadan maddeye görsel girmez, ad ve kurgu metni yazılmaz.'
  ].join('\n');
}
