import type { Item, ItemType, WikiSection } from '../types';
import { ADA_KIMLIGI } from './vikiSifirlama';
import { getKunyeFields, TYPE_LABELS } from '../components/wiki/wikiSchema';
import { parseKunye } from '../components/wiki/kunyeParser';

/**
 * Yer kartları ve mahalle derlemesi (8 Ekim, Kemal).
 *
 *   - "Cadde ve tepeyi mahalle kartı altında ele alıyor, bu doğru değil."
 *     'yer' artık yalnız mahalle; cadde / sokak, meydan, yer adı (tepe,
 *     koy…) ve ada ayrı kart. Eski kayıtlar Durum → Eksikler'deki "Yer
 *     kartları" kartıyla, Kemal tür seçip "Taşı" deyince taşınır.
 *   - "Genel Düzada maddesi yok": adanın eski çatı kaydı vikide hiç
 *     görünmüyordu. Ada kartına taşınınca kendi maddesi olur; kayıt yoksa
 *     aynı karttan boş açılır.
 *   - Çevre yolu: boş bir cadde maddesi, adı Kemal koyana kadar geçici.
 *   - "Mahalle bilgilerini optimize et, tekrar eden çok bilgi oldu":
 *     tekrarlar burada bulunur, stüdyo derler (öneri tepsisine), Kemal
 *     "Ekle" demeden hiçbir şey değişmez. Resmî bölümlere dokunulmaz.
 *
 * Kayıtlar yalnız Kemal'in düğmesiyle yazılır; ikinci basışta iş kalmaz.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

const canli = (items: Item[]) => items.filter(i => !i.archived && !i.isProposal);
const trKucuk = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

/** Taşıma kartında seçilebilen türler */
export const TASINABILEN_TURLER: ItemType[] = ['cadde', 'meydan', 'yer_adi', 'ada'];

// ---------------------------------------------------------------- taşıma

/** Adın son sözünden tür tahmini (yalnız varsayılan seçim; karar Kemal'in) */
const SON_SOZ_TURU: Array<[ItemType, RegExp]> = [
  ['cadde', /\b(caddesi|sokağı|sokak|yokuşu|yolu|cadde)$/i],
  ['meydan', /\b(meydanı|meydan)$/i],
  ['yer_adi', /\b(tepesi|tepe|koyu|burnu|plajı|deresi|ormanı|mevkii|pınarı|zeytinliği|koyağı|kayalığı|adası)$/i]
];

export function turTahmini(i: Item): ItemType | null {
  if (i.id === ADA_KIMLIGI || trKucuk(i.title) === 'düzada') return 'ada';
  const ad = trKucuk(i.title.replace(/\s*\([^)]*\)/g, ''));
  for (const [tur, re] of SON_SOZ_TURU) if (re.test(ad)) return tur;
  return null;
}

/** Mahalle kartında duran ama mahalle olmayabilecek kayıtlar */
export function tasinacaklar(items: Item[]): Array<{ item: Item; tahmin: ItemType | null }> {
  return canli(items)
    .filter(i => i.type === 'yer' && i.metadata?.mahalleOnayli !== true)
    // Adında "mahalle" geçen kayıt mahalledir
    .filter(i => !/mahalle/i.test(i.title))
    .map(item => ({ item, tahmin: turTahmini(item) }))
    .sort((a, b) => a.item.title.localeCompare(b.item.title, 'tr'));
}

/**
 * Türü değiştirir; metin, künye ve bağlar olduğu gibi kalır. Boş bölüm
 * başlığı eklenmez (Kemal, 8 Ekim: "boş başlıklar silinsin"; yazmak
 * isteyince "Bölüm ekle").
 */
export const turuDegistir = (i: Item, tur: ItemType): Item => ({ ...i, type: tur, area: 'duzada', updatedAt: Date.now() });

/** "Mahalle kalsın": kayıt bir daha sorulmaz */
export const mahalleKalsin = (i: Item): Item => ({ ...i, metadata: { ...(i.metadata || {}), mahalleOnayli: true }, updatedAt: Date.now() });

export const turAdi = (t: ItemType) => TYPE_LABELS[t] || t;

// ---------------------------------------------------------------- yeni maddeler

/** Adanın maddesi yoksa (ne Ada kartında ne eski çatı kaydı olarak) */
export const adaMaddesiEksik = (items: Item[]) => !items.some(i => i.type === 'ada' || i.id === ADA_KIMLIGI);

/** Boş Düzada maddesi: yalnız ad ve tür; metin Kemal'in */
export const adaMaddesiKaydi = (): YeniKayit => ({
  id: ADA_KIMLIGI,
  title: 'Düzada', area: 'duzada', type: 'ada', status: 'Fikir', priority: 'orta',
  tags: [], links: [], notes: '', images: [], isProposal: false, archived: false,
  metadata: {}
});

export const cevreYoluVar = (items: Item[]) => items.some(i => i.metadata?.cevreYolu === true);

/** Adayı çevreleyen yol: boş cadde maddesi; adı kanondan, Sahil Yolu (8 Ekim) */
export const cevreYoluKaydi = (): YeniKayit => ({
  title: 'Sahil Yolu', area: 'duzada', type: 'cadde', status: 'Fikir', priority: 'orta',
  tags: [], links: [], notes: '', images: [], isProposal: false, archived: false,
  metadata: { cevreYolu: true }
});

// ---------------------------------------------------------------- tekrarlar

/**
 * Mahallede bölümlerin sırası (Kemal, 8 Ekim: "bölüm başlıkları sabit";
 * sıra soru turunda onaylandı). Listede olmayan başlıklar sona gelir.
 */
export const MAHALLE_BOLUM_SIRASI = ['Konum ve sınırlar', 'Tarihçe', 'Gündelik hayat', 'Kamu binaları', 'Çarşı ve işletmeler'];

const baslikAnahtari = (s: string) => trKucuk(s).replace(/\s+/g, ' ');

function sozler(c: string): Set<string> {
  return new Set(trKucuk(c).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2));
}
const benzerlik = (a: Set<string>, b: Set<string>) => {
  let ortak = 0;
  for (const w of a) if (b.has(w)) ortak++;
  return ortak / (a.size + b.size - ortak || 1);
};

interface Parca { yer: string; oneri: boolean; metin: string }

function parcalari(i: Item): Parca[] {
  const l: Parca[] = getKunyeFields(i).map(f => ({ yer: `künye · ${f.label}`, oneri: false, metin: f.value }));
  const giris = parseKunye(i).body.trim();
  if (giris) l.push({ yer: 'giriş', oneri: false, metin: giris });
  for (const b of (i.metadata?.wikiSections as WikiSection[] | undefined) || []) {
    if (String(b.content || '').trim()) l.push({ yer: b.title || 'bölüm', oneri: b.status === 'öneri', metin: b.content });
  }
  return l;
}

export interface MahalleTekrari {
  item: Item;
  /** Birden çok kez geçen başlıklar ("Tarihçe ×3") */
  ayniBasliklar: Array<{ baslik: string; sayi: number }>;
  /** Başka bir yerde de geçen (ya da çok benzeyen) cümle sayısı */
  benzerCumle: number;
  /** Örnek: hangi iki yerde */
  ornek?: { a: string; b: string };
}

/**
 * Tekrarı olan mahalleler. Yalnız işi olanlar döner: tekrarın en az bir
 * tarafı "öneri" bölümüdür (resmî metne dokunulmadığı için iki tarafı da
 * resmî olan tekrar burada sayılmaz).
 */
export function mahalleTekrarlari(items: Item[]): MahalleTekrari[] {
  const sonuc: MahalleTekrari[] = [];
  for (const item of canli(items).filter(i => i.type === 'yer')) {
    const bolumler = ((item.metadata?.wikiSections as WikiSection[] | undefined) || []).filter(b => String(b.content || '').trim());
    const gruplar = new Map<string, { baslik: string; sayi: number; oneri: boolean }>();
    for (const b of bolumler) {
      const k = baslikAnahtari(b.title || '');
      if (!k) continue;
      const g = gruplar.get(k) || { baslik: b.title, sayi: 0, oneri: false };
      g.sayi++; g.oneri = g.oneri || b.status === 'öneri';
      gruplar.set(k, g);
    }
    const ayniBasliklar = Array.from(gruplar.values()).filter(g => g.sayi > 1 && g.oneri).map(({ baslik, sayi }) => ({ baslik, sayi }));

    const cumleler = parcalari(item).flatMap(p => p.metin
      .split(/(?<=[.!?])\s+|\n+/)
      .map(c => c.trim())
      .filter(c => c.length >= 25)
      .map(c => ({ ...p, cumle: c, sozler: sozler(c) })))
      .filter(c => c.sozler.size >= 4);
    let benzerCumle = 0;
    let ornek: MahalleTekrari['ornek'];
    const sayilan = new Set<number>();
    for (let x = 0; x < cumleler.length; x++) {
      for (let y = x + 1; y < cumleler.length; y++) {
        const a = cumleler[x], b = cumleler[y];
        if (!a.oneri && !b.oneri) continue;
        if (benzerlik(a.sozler, b.sozler) < 0.6) continue;
        if (!sayilan.has(y)) { sayilan.add(y); benzerCumle++; }
        if (!ornek) ornek = { a: a.yer, b: b.yer };
      }
    }
    if (ayniBasliklar.length || benzerCumle) sonuc.push({ item, ayniBasliklar, benzerCumle, ...(ornek ? { ornek } : {}) });
  }
  return sonuc;
}

/** Bölümleri sabit sıraya dizer (aynı sıradakilerin yeri değişmez) */
export function siraya(bolumler: WikiSection[]): WikiSection[] {
  const yer = (b: WikiSection) => {
    const n = MAHALLE_BOLUM_SIRASI.findIndex(s => baslikAnahtari(s) === baslikAnahtari(b.title || ''));
    return n < 0 ? MAHALLE_BOLUM_SIRASI.length : n;
  };
  return bolumler.map((b, n) => ({ b, n })).sort((x, y) => yer(x.b) - yer(y.b) || x.n - y.n).map(x => x.b);
}
