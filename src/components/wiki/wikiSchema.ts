import { Item, ItemType } from '../../types';
import { ESKI_ALAN_ADLARI } from './kunyeSorulari';
import { semaAlanlari, takmaAdlar } from '../../lib/alanSablonu';
import { parseKunye } from './kunyeParser';
import { tamAd } from '../../lib/kisiAdi';

/**
 * ItemType değerleri ile künye şemasının anahtarları birebir aynı değil
 * (örn. 'karakter' ve 'kisi' aynı şemayı kullanır). Eşleme burada.
 */
const TYPE_TO_SCHEMA: Partial<Record<ItemType, string>> = {
  kisi: 'kisi',
  karakter: 'kisi',
  aile: 'aile',
  mekân: 'mekan',
  dükkân: 'mekan',
  yer: 'yer',
  cadde: 'cadde',
  meydan: 'meydan',
  yer_adi: 'yer_adi',
  ada: 'ada',
  marka: 'marka',
  kulüp: 'marka',
  olay: 'olay',
  ürün: 'urun',
  oda: 'oda'
};

export const TYPE_LABELS: Partial<Record<ItemType, string>> = {
  kisi: 'Kişi',
  // Karakter → Kişi (yapisal-4, 25): ayrım kalktı; eski kayıtlar da Kişi görünür
  karakter: 'Kişi',
  aile: 'Aile',
  mekân: 'Mekân',
  dükkân: 'Dükkân',
  yer: 'Mahalle',
  cadde: 'Cadde / sokak',
  meydan: 'Meydan',
  yer_adi: 'Yer adı',
  ada: 'Ada',
  marka: 'Marka',
  kulüp: 'Kulüp',
  olay: 'Olay',
  ürün: 'Eşya',
  oda: 'Oda'
};

/** Wiki'de kendi sayfası olan tipler */
export const WIKI_TYPES: ItemType[] = [
  'yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay', 'ürün', 'oda'
];

export function schemaKeyFor(type: ItemType): string | undefined {
  return TYPE_TO_SCHEMA[type];
}

export interface KunyeField {
  id: string;
  label: string;
  value: string;
}

/**
 * Bu alanlar yalnızca yönetim yüzünde görünür. Sırlar çatışma üretmek için
 * yazılıyor; ziyaretçiye açılırsa hikâyelerin sürprizi önceden yanar.
 */
const GIZLI_ALANLAR = new Set(['secrets', 'clues']);

/**
 * Ham bölge anahtarlarının insan okunur karşılığı. Künyede `eski_liman`
 * değil "İskele Mahallesi" yazmalı.
 */
export const BOLGE_ADLARI: Record<string, string> = {
  eski_liman: 'İskele Mahallesi',
  // Eski kayıtlarda bölge böyle yazılıydı; Kemal kararıyla İskele ile aynı yer
  'eski liman / kemskoy': 'İskele Mahallesi',
  'eski liman': 'İskele Mahallesi',
  iskele: 'İskele Mahallesi',
  kemskoy: 'Kemsköy Caddesi',
  merkez: 'Merkez Mahallesi',
  liman: 'Liman Mahallesi',
  fener: 'Liman Mahallesi',
  ciftlik: 'Çiftlik Mahallesi',
  'çiftlik': 'Çiftlik Mahallesi',
  stad: 'Stadyum Mahallesi',
  stadyum: 'Stadyum Mahallesi'
};

export function bolgeAdi(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const key = raw.trim().toLocaleLowerCase('tr');
  if (BOLGE_ADLARI[key]) return BOLGE_ADLARI[key];
  // Ham anahtar gibi görünüyorsa (alt çizgili, hep küçük) okunur hale getir
  if (/^[a-zçğıöşü0-9_]+$/.test(key) && !/\s/.test(raw)) {
    return raw
      .split('_')
      .map(p => p.charAt(0).toLocaleUpperCase('tr') + p.slice(1))
      .join(' ');
  }
  return raw.trim();
}

/**
 * Mahalle eşleşmesi (2 Ekim, Kemal: "altta mahallesi belli olmayan yerlerin
 * hepsinde mahalle belli aslında"). Kayıtta "iskele", "İskele Mahallesi",
 * "Kemsköy Caddesi" yazabilir; mahallenin adı "İskele Mahallesi (Kemsköy)"
 * olabilir. Hepsi aynı yere düşmeli: parantez içi de bir ad sayılır,
 * "mahallesi" sözü ve Türkçe harf farkı yok sayılır.
 */
const mahalleAnahtari = (s: string) => s
  .toLocaleLowerCase('tr')
  .replace(/[çğıöşüâî]/g, h => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' } as Record<string, string>)[h] || h)
  .replace(/\bmahallesi\b/g, ' ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Mahalle adının bütün okunuşları: "İskele Mahallesi (Kemsköy)" → iskele, kemskoy */
export function mahalleAdlari(baslik: string): string[] {
  const adlar = [baslik.replace(/\(.*?\)/g, ''), ...Array.from(baslik.matchAll(/\(([^)]+)\)/g), m => m[1])];
  return Array.from(new Set(adlar.map(mahalleAnahtari).filter(Boolean)));
}

/**
 * Eşleşmede kullanılan başlık: maddenin adı ve eski adları (7 Ekim: mahalle
 * adlarındaki parantez kalktı, eski ad `metadata.eskiAdlar`'a geçti).
 * "İskele Mahallesi" + ["Kemsköy"] → "İskele Mahallesi (Kemsköy)"
 */
export function eslesmeBasligi(item: Item): string {
  // Takma adlar da (3. gece): eski adlar ve Kemal'in yazdığı takma adlar
  return [item.title, ...takmaAdlar(item).map(e => `(${e})`)].join(' ');
}

/** Kayıttaki mahalle yazısı bu mahalleyi mi gösteriyor? */
export function mahalleEslesir(bolge: unknown, mahalleBasligi: string): boolean {
  if (typeof bolge !== 'string' || !bolge.trim()) return false;
  const adlar = mahalleAdlari(mahalleBasligi);
  return [bolge, bolgeAdi(bolge)].some(b => {
    const k = mahalleAnahtari(b);
    // "kemskoy caddesi" → kemskoy; "iskele" → iskele
    return !!k && adlar.some(a => k === a || k.startsWith(a + ' '));
  });
}

/** 'metadata.profile.profession' gibi bir yolu güvenle okur */
function readPath(item: Item, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, item as unknown);
}

/**
 * Bir maddenin künye alanlarını şemadan çıkarır.
 * `title` ve `notes` künyeye girmez — onlar sayfanın başlığı ve gövdesidir.
 */
/**
 * Künye başlıkları eşleşiyor mu? Ayrıştırılan satırın başlığı ("Kuruluş")
 * şema alanıyla ("Kuruluş") eşleşir. Kısmi eşleşme sözcük sözcük yapılır ve
 * yalnız Türkçe ek farkına izin verir ("Yer" ~ "Yeri", "Tür" ~ "Türü");
 * "Kat" "Kategori"yi, "Kuruluş" "Kuruluş amacı"nı tutmaz.
 */
function basliklarEslesir(a: string, b: string): boolean {
  const x = a.toLocaleLowerCase('tr').trim().split(/\s+/);
  const y = b.toLocaleLowerCase('tr').trim().split(/\s+/);
  if (x.length !== y.length) return false;
  return x.every((w, i) => {
    const v = y[i];
    if (w === v) return true;
    const [kisa, uzun] = w.length <= v.length ? [w, v] : [v, w];
    return kisa.length >= 3 && uzun.startsWith(kisa) && uzun.length - kisa.length <= 2;
  });
}

interface KunyeCozumu {
  /** Şema alanları (kısa künye) */
  alanlar: KunyeField[];
  /** Künyeye girmeyen satırlar → sayfada "Bilgiler" */
  ekler: KunyeField[];
}

function kunyeyiCoz(item: Item, includeSecrets: boolean): KunyeCozumu | null {
  const key = schemaKeyFor(item.type);
  if (!key) return null;

  // Kemal'in alan şablonu (3. gece): gizli alan künyede yok, özel alan var
  const schema = semaAlanlari(key);
  const parsed = parseKunye(item);
  const kullanilan = new Set<number>();

  /** Şemadaki alan boşsa, notes'tan ayrıştırılan künyeden doldurmayı dener */
  const fromParsed = (adlar: string[]): string => {
    const i = parsed.fields.findIndex((f, n) => !kullanilan.has(n) && adlar.some(ad => basliklarEslesir(f.label, ad)));
    if (i < 0) return '';
    kullanilan.add(i);
    return parsed.fields[i].value;
  };

  const alanlar = schema
    .filter(f => f.fieldPath !== 'title' && f.fieldPath !== 'notes')
    .map(f => {
      const raw = readPath(item, f.fieldPath);
      let value =
        typeof raw === 'string' ? raw.trim()
        : typeof raw === 'number' ? String(raw)
        : '';

      if (!value) value = fromParsed([f.label, ...(f.esAdlar || [])]);
      // Meslek alanı künye başlığından da gelebilir ("Ad (38) — Başaşçı")
      if (!value && f.id === 'profession' && parsed.rol) value = parsed.rol;
      // Markanın renkleri marka kitinde de durabilir
      if (!value && f.id === 'colors') {
        const palet = (item.metadata as { brandKit?: { colorPalette?: unknown } } | undefined)?.brandKit?.colorPalette;
        if (Array.isArray(palet)) value = palet.filter(c => typeof c === 'string').join(', ');
      }
      // Ham bölge anahtarı yerine mahallenin adı
      if (f.id === 'region') value = bolgeAdi(value);

      return { id: f.id, label: f.label, value };
    })
    .filter(f => (includeSecrets ? true : !GIZLI_ALANLAR.has(f.id)));

  /**
   * Künyeye girmeyen satırlar kaybolmaz — sayfada "Bilgiler" bölümünde
   * görünür (Kemal, 29 Eylül: "daha kompakt bir künye, diğer bilgiler
   * sayfa kısmında").
   */
  // Yaş alanı kalktı (yapisal-4): eski "Yaş" satırları da gösterilmez
  const ekler: KunyeField[] = parsed.fields
    .filter((f, n) => !kullanilan.has(n) && !/^yaş$/i.test(f.label.trim()))
    .map(f => ({ id: `ek_${f.label}`, label: f.label, value: f.value }));

  // Eski alan listesine yazılmış değerler
  const profil = (item.metadata?.profile as Record<string, unknown> | undefined) || {};
  const semaYollari = new Set(schema.map(f => f.fieldPath));
  for (const [id, ad] of Object.entries(ESKI_ALAN_ADLARI)) {
    if (semaYollari.has(`metadata.profile.${id}`)) continue;
    if (!includeSecrets && GIZLI_ALANLAR.has(id)) continue;
    const v = profil[id];
    if (typeof v === 'string' && v.trim()) ekler.push({ id: `eski_${id}`, label: ad, value: v.trim() });
  }

  /**
   * Geniş zaman kuralı: wiki'nin "şimdi"si yoktur. Zamana bağlı olgular
   * ancak aralık olarak yazılır — "Faaliyette: 1954–". Aralığın kendisi
   * kalıcı bir olgudur, "şu anda açık" değildir.
   */
  const faaliyet = item.metadata?.faaliyet;
  if (typeof faaliyet === 'string' && faaliyet.trim() && !semaYollari.has('metadata.faaliyet')) {
    alanlar.unshift({ id: 'ek_faaliyet', label: 'Faaliyette', value: faaliyet.trim() });
  }

  // Kişide ad ve soyadı yazılmışsa tam ad (21 Ekim): "Zeynep Kaya Yılmaz". Hesaplanır, kayda yazılmaz.
  if (key === 'kisi') {
    const tam = tamAd(item);
    if (tam) alanlar.unshift({ id: 'tam_ad', label: 'Tam adı', value: tam });
  }

  return { alanlar, ekler };
}

/**
 * Bir maddenin kısa künyesi (yalnız şema alanları).
 * `title` ve `notes` künyeye girmez — onlar sayfanın başlığı ve gövdesidir.
 */
export function getKunyeFields(
  item: Item,
  opts: { includeEmpty?: boolean; includeSecrets?: boolean } = {}
): KunyeField[] {
  const c = kunyeyiCoz(item, !!opts.includeSecrets);
  if (!c) return [];
  return opts.includeEmpty ? c.alanlar : c.alanlar.filter(f => f.value.length > 0);
}

/** Künyeye girmeyen satırlar — sayfada "Bilgiler" bölümü */
export function getEkBilgiler(item: Item, opts: { includeSecrets?: boolean } = {}): KunyeField[] {
  return kunyeyiCoz(item, !!opts.includeSecrets)?.ekler.filter(f => f.value.length > 0) ?? [];
}

/** Metindeki renk kodları (#0E1C4F) — künyede renk kutucuğu olarak çizilir */
export function renkKodlari(metin: string): string[] {
  return Array.from(new Set((metin.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map(r => r.toUpperCase())));
}

/**
 * Künyenin ne kadarının dolu olduğu — yönetim yüzündeki olgunluk göstergesi.
 * Yalnızca şema alanları sayılır; ayrıştırmadan gelen ek alanlar bonusdur.
 */
export function kunyeCompleteness(item: Item): { filled: number; total: number; pct: number } {
  const key = schemaKeyFor(item.type);
  if (!key) return { filled: 0, total: 0, pct: 0 };

  const schemaIds = new Set(
    semaAlanlari(key)
      .filter(f => f.fieldPath !== 'title' && f.fieldPath !== 'notes' && !f.istegeBagli)
      .map(f => f.id)
  );

  const all = getKunyeFields(item, { includeEmpty: true }).filter(f => schemaIds.has(f.id));
  const filled = all.filter(f => f.value.length > 0).length;
  const total = all.length;
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

/**
 * Gövde metni. Künye bloğu ayrıştırılıp künye kutusuna taşındığı için
 * burada yalnızca gerçek düzyazı kalır — '* Fizik: ...' satırları gövdeyi
 * artık şişirmez.
 */
export function getArticleBody(item: Item): { heading?: string; text: string; status?: string; anahtar?: string }[] {
  const blocks: { heading?: string; text: string; status?: string; anahtar?: string }[] = [];

  // anahtar: sitede bölüm gizleme için (6. gece) — giriş metni 'giris', bölüm kendi kimliği
  const notes = parseKunye(item).body.trim();
  if (notes) blocks.push({ text: notes, anahtar: 'giris' });

  const sections = item.metadata?.wikiSections;
  if (Array.isArray(sections)) {
    sections.forEach(s => {
      const text = (s?.content || '').trim();
      if (text) blocks.push({ heading: s.title, text, status: s.status, ...(s.id ? { anahtar: String(s.id) } : {}) });
    });
  }

  return blocks;
}

/**
 * Bu madde bir "taslak" mı — yönetim yüzünde öne çıkarılır.
 *
 * Ölçü, "doldurulmuş bilgi miktarı": gövde metni ile künye satırları
 * birlikte sayılır. Künyesi zengin ama gövdesi kısa bir karakter taslak
 * değildir; ikisi de boş olan taslaktır.
 */
export function isStub(item: Item): boolean {
  const chars = getArticleBody(item).reduce((n, b) => n + b.text.length, 0);
  const kunye = [...getKunyeFields(item), ...getEkBilgiler(item)];
  const kunyeChars = kunye.reduce((n, f) => n + f.value.length, 0);

  const bilgi = chars + kunyeChars;
  const { pct, total } = kunyeCompleteness(item);

  // Künyesi tamamen dolu madde taslak değildir (Kemal, 30 Eylül: "bunlar
  // %100 dolu"). Kısa değerli künyeler (Tür: Okul) harf sayısına takılıyordu.
  if (total > 0 && pct === 100) return false;
  if (bilgi >= 800) return false;                        // uzun yazılmış madde
  if (bilgi >= 400 && kunye.length >= 4) return false;   // künyesi zengin madde
  return bilgi < 240 || (total > 0 && pct < 30 && kunye.length < 4);
}
