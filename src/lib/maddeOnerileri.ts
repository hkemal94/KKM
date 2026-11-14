import type { Item, ItemType } from '../types';
import { WIKI_TYPES, schemaKeyFor, getKunyeFields, getArticleBody } from '../components/wiki/wikiSchema';
import { adiCoz, bagParcalari, semaAlanlari, type BagGrubu } from './alanSablonu';

/**
 * Madde önerileri (4. gece; Kemal, 7 Ekim: "yapılar ve yerler, kurumlar,
 * aileler; künyeden ve yazılarımdan"). Yapay zekâ yok: Kemal'in kendi
 * yazdığı adlar taranır, maddesi olmayanlar listelenir.
 *
 *   - Künyedeki bağ alanları ve "Simgeler": madde adı yazılmış ama madde yok
 *   - Yazılar (viki metni, kitap bölümleri, yazılar ve fanzin, notlar):
 *     büyük harfle başlayan ve türünü söyleyen bir sözle biten adlar
 *     ("… Kahvehanesi", "… Ailesi", "… Kulübü", "… Koyu")
 *
 * Ad Kemal'in metninden olduğu gibi alınır; hiçbir ad uydurulmaz. Kayıt
 * yalnız "Madde aç" ya da "Önerme" ile yazılır.
 */

export type OneriTuru = 'mekân' | 'yer' | 'cadde' | 'meydan' | 'yer_adi' | 'kulüp' | 'aile';
export const ONERI_TURU_ADI: Record<OneriTuru, string> = {
  'mekân': 'Yapı / mekân', yer: 'Mahalle', cadde: 'Cadde / sokak', meydan: 'Meydan', yer_adi: 'Yer adı', 'kulüp': 'Kurum', aile: 'Aile'
};

/** Adın son sözü → tür */
const SON_SOZ: Array<[OneriTuru, string[]]> = [
  ['aile', ['Ailesi']],
  ['kulüp', ['Kulübü', 'Derneği', 'Kooperatifi', 'Kurumu', 'Vakfı', 'Birliği', 'Belediyesi', 'Şirketi']],
  ['mekân', ['Kahvehanesi', 'Kahvesi', 'Lokantası', 'Meyhanesi', 'Birahanesi', 'Fırını', 'Bakkalı', 'Pansiyonu', 'Oteli', 'Kilisesi',
    'Camii', 'Çeşmesi', 'Okulu', 'İlkokulu', 'Fabrikası', 'Değirmeni', 'Feneri', 'Deposu', 'Atölyesi', 'Dükkânı', 'Dükkanı', 'Hamamı',
    'Mezarlığı', 'Kulesi', 'Konağı', 'Köşkü', 'Binası', 'Postanesi', 'Ocağı', 'Halı', 'Hali', 'Çiftliği', 'Mağazası', 'Stadı']],
  // 8 Ekim: cadde, meydan ve doğa adları mahalle kartından ayrıldı
  ['cadde', ['Caddesi', 'Sokağı', 'Yokuşu', 'Yolu']],
  ['meydan', ['Meydanı']],
  ['yer_adi', ['Koyu', 'Burnu', 'Tepesi', 'Plajı', 'Zeytinliği', 'Ormanı', 'Deresi', 'Adası', 'Mevkii', 'Koyağı', 'Pınarı']],
  ['yer', ['Limanı', 'İskelesi', 'Mahallesi', 'Köyü']]
];
const SOZ_TURU = new Map(SON_SOZ.flatMap(([t, l]) => l.map(s => [s, t] as const)));

/** Cümle başında büyük yazılan ama adın parçası olmayan sözler */
const BAS_SOZLER = new Set(['Sonra', 'Bu', 'Şu', 'O', 'Bir', 'Ve', 'Ama', 'Her', 'Hem', 'Ya', 'İlk', 'Önce', 'Yine', 'Artık',
  'Belki', 'Hatta', 'Ayrıca', 'Ancak', 'Fakat', 'Çünkü', 'Oysa', 'Eğer', 'Şimdi', 'Orada', 'Burada', 'Yanında', 'Karşısında']);

const SON = SON_SOZ.flatMap(([, l]) => l).join('|');
// 1–4 büyük harfli söz + türünü söyleyen son söz
const AD_RE = new RegExp(`(?<![\\p{L}\\p{N}])((?:\\p{Lu}[\\p{L}'’]*\\s+){1,4})(${SON})(?![\\p{L}\\p{N}])`, 'gu');

export interface MaddeOnerisi {
  ad: string;
  tur: OneriTuru;
  /** Geçtiği kayıtlar */
  kaynaklar: Array<{ id: string; ad: string }>;
  sayi: number;
}

/**
 * Adın başına cümleden karışan sözleri atar (14 Kasım, Kemal: "Öztürk Ailesi'nden
 * Zeynep Taraftar Birahanesi" öneri olarak gelmişti). Ek almış bir söz ("Ailesi'nden")
 * bir adın sonudur; yeni ad ondan sonra başlar. Cümle başı sözleri de düşer.
 */
function adSozleri(adHam: string): string[] {
  let sozler = adHam.replace(/\s+/g, ' ').trim().split(' ');
  for (let n = sozler.length - 2; n >= 0; n--) {
    if (/['’]\p{L}/u.test(sozler[n])) { sozler = sozler.slice(n + 1); break; }
  }
  while (sozler.length > 1 && BAS_SOZLER.has(sozler[0])) sozler = sozler.slice(1);
  return sozler;
}

const trKucuk = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

/** Kaydın Kemal'in yazdığı metinleri */
function metinleri(i: Item): string[] {
  const m = (i.metadata || {}) as Record<string, unknown>;
  const l: string[] = [];
  if (WIKI_TYPES.includes(i.type)) {
    for (const b of getArticleBody(i)) l.push(b.text);
    for (const f of getKunyeFields(i)) l.push(f.value);
  } else if (['kitap_bolum', 'blog_post', 'fikir'].includes(i.type)) {
    l.push(i.notes || '');
    const fz = m.fanzin as { bolumler?: Array<{ metin?: string; baslik?: string }> } | undefined;
    for (const b of fz?.bolumler || []) l.push(`${b.baslik || ''}\n${b.metin || ''}`);
  }
  return l.filter(Boolean);
}

/** Bağ alanına uygun düz bir ad mı (cümle değil) */
const adGibi = (s: string) => s.length >= 3 && s.length <= 40 && /^\p{Lu}/u.test(s) && s.split(/\s+/).length <= 5 && !/[.!?;:()]/.test(s);

const grupTuru = (g: BagGrubu): OneriTuru | null =>
  g === 'aile' ? 'aile' : g === 'kurum' ? 'kulüp' : g === 'mekan' ? 'mekân' : g === 'mahalle' ? 'yer' : g === 'yol' ? 'cadde' : g === 'doga' ? 'yer_adi' : null;

export function maddeOnerileri(items: Item[], reddedilen: string[] = []): MaddeOnerisi[] {
  const canli = items.filter(i => !i.archived);
  const maddeler = canli.filter(i => WIKI_TYPES.includes(i.type));
  const red = new Set(reddedilen.map(trKucuk));
  const bulunan = new Map<string, MaddeOnerisi>();

  const ekle = (adHam: string, tur: OneriTuru, kaynak: Item) => {
    const sozler = adSozleri(adHam);
    const ad = sozler.join(' ').replace(/['’]$/, '');
    if (sozler.length < 2 && !SOZ_TURU.has(sozler[0])) return;
    const k = trKucuk(ad);
    if (!k || red.has(k) || adiCoz(ad, maddeler)) return;
    const o = bulunan.get(k) || { ad, tur, kaynaklar: [], sayi: 0 };
    o.sayi++;
    if (!o.kaynaklar.some(x => x.id === kaynak.id)) o.kaynaklar.push({ id: kaynak.id, ad: kaynak.title || kaynak.id });
    bulunan.set(k, o);
  };

  for (const i of canli) {
    // Künyedeki bağ alanları: maddesi olmayan ad
    const anahtar = WIKI_TYPES.includes(i.type) ? schemaKeyFor(i.type) : undefined;
    if (anahtar) {
      const kunye = new Map(getKunyeFields(i).map(f => [f.id, f.value]));
      for (const a of semaAlanlari(anahtar)) {
        const deger = kunye.get(a.id);
        if (!deger) continue;
        const bagTuru = a.bag?.map(grupTuru).find(Boolean) || null;
        const simge = a.id === 'landmarks';
        if (!bagTuru && !simge) continue;
        for (const p of bagParcalari(deger, simge || a.coklu)) {
          if (!adGibi(p)) continue;
          const sonSoz = p.split(/\s+/).pop() || '';
          const tur = SOZ_TURU.get(sonSoz) || bagTuru || 'mekân';
          // Kişi adları bu pakette değil (Kemal: yapılar, yerler, kurumlar, aileler):
          // kişi de alan bir bağda yalnız türünü söyleyen ad önerilir
          if (a.bag?.includes('kisi') && !SOZ_TURU.has(sonSoz)) continue;
          ekle(p, tur, i);
        }
      }
    }
    // Yazılar: türünü söyleyen adlar
    for (const t of metinleri(i)) {
      for (const m of t.matchAll(AD_RE)) ekle(`${m[1]}${m[2]}`, SOZ_TURU.get(m[2])!, i);
    }
  }
  // Daha uzun bir adın sonu olan kısa ad (ör. "İdare Binası" ← "Liman İdare
  // Binası") ve başına cümleden söz karışmış uzun ad ("Arıcılık Ada Tepesi")
  const basliklar = maddeler.map(i => trKucuk(i.title.replace(/\s*\([^)]*\)/g, '')));
  const liste = Array.from(bulunan.entries());
  const sonuc: MaddeOnerisi[] = [];
  for (const [k, o] of liste) {
    if (basliklar.some(b => b !== k && b.endsWith(' ' + k))) continue;
    // Var olan bir maddenin adının başına cümleden söz karışmış ("Zeynep Taraftar Birahanesi")
    if (basliklar.some(b => b.includes(' ') && k.endsWith(' ' + b))) continue;
    const kisa = liste.find(([k2]) => k2 !== k && k.endsWith(' ' + k2));
    if (kisa) {
      const [, ko] = kisa;
      ko.sayi += o.sayi;
      for (const x of o.kaynaklar) if (!ko.kaynaklar.some(y => y.id === x.id)) ko.kaynaklar.push(x);
      continue;
    }
    sonuc.push(o);
  }
  return sonuc.sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'));
}

/** Öneriden açılacak madde: yalnız ad ve tür; metin boş (Kemal yazar) */
export function oneridenMadde(o: MaddeOnerisi, tur: ItemType): Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> {
  return {
    title: o.ad, area: 'duzada', type: tur, status: 'Fikir', priority: 'orta',
    tags: [], links: o.kaynaklar.map(k => k.id), notes: '', images: [], isProposal: false, archived: false, metadata: {}
  };
}

/** "Önerme" listesi kkm_ayar'da */
export const reddedilenler = (items: Item[]): string[] => {
  const r = items.find(i => i.type === 'kkm_ayar')?.metadata?.reddedilenOneriler;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : [];
};

export function reddiYaz(items: Item[], ad: string): { guncel?: Item; yeni?: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> } {
  const k = items.find(i => i.type === 'kkm_ayar');
  const liste = Array.from(new Set([...reddedilenler(items), ad]));
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), reddedilenOneriler: liste }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: 'kkm_ayar', status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { hedefler: {}, bitenler: [], isler: [], reddedilenOneriler: liste }
    }
  };
}


/**
 * Yazım paneli (7. gece, 8 Ekim): tek bir metinde geçen, türünü söyleyen
 * ama vikide maddesi olmayan adlar ("Kemal'in yazısında Zeytin Koyu var,
 * maddesi yok"). Ad metinden olduğu gibi alınır; "Önerme" denenler gelmez.
 */
export function metindekiYeniAdlar(metin: string, items: Item[]): Array<{ ad: string; tur: OneriTuru }> {
  if (!metin.trim()) return [];
  const maddeler = items.filter(i => !i.archived && WIKI_TYPES.includes(i.type));
  const red = new Set(reddedilenler(items).map(trKucuk));
  const bulunan = new Map<string, { ad: string; tur: OneriTuru }>();
  for (const m of metin.matchAll(AD_RE)) {
    const sozler = adSozleri(`${m[1]}${m[2]}`);
    if (sozler.length < 2) continue;
    const ad = sozler.join(' ').replace(/['’]$/, '');
    const k = trKucuk(ad);
    if (!k || red.has(k) || bulunan.has(k) || adiCoz(ad, maddeler)) continue;
    if (maddeler.some(i => { const b = trKucuk(i.title); return b.includes(' ') && k.endsWith(' ' + b); })) continue;
    bulunan.set(k, { ad, tur: SOZ_TURU.get(m[2])! });
  }
  return Array.from(bulunan.values()).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}
