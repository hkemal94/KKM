import type { Item, ItemType } from '../types';
import { getArticleBody, getKunyeFields, getEkBilgiler, WIKI_TYPES } from '../components/wiki/wikiSchema';

/**
 * Evren zaman çizgisi ve dönemler (5. gece, 7 Ekim; vvd'den).
 *
 * Tarihler künyeden okunur (20 Kasım, Kemal: mekânın faaliyeti, ailenin adaya
 * gelişi, kişinin doğum yılı ve yaşamı); hiçbir tarih uydurulmaz, okunamayan
 * değer satırda "tarih belirsiz" görünür.
 * Dönemler Kemal'in: adı ve yılları o verir, `kkm_ayar` → `donemler`'e
 * "Ekle"ye basınca yazılır. Adaylar yazılarda geçen "… dönemi" sözlerinden
 * çıkar; aday yalnız öneridir. Vikinin bir "şimdi"si yoktur: bitişi olmayan
 * aralık açık uçlu çizilir.
 */

const ACILIS_ALANI = /açılış|acilis/i;
const FAALIYET_ALANI = /faaliyet/i;
const KURULUS_ALANI = /kuruluş|kurulus|yapım|yapim|inşa|insa/i;

/**
 * Açılışı yazılı maddede "Faaliyette" satırı çizgiye ve tarihçeye girmez
 * (21 Ekim, Kemal: Dondurmacı Kızlar'da "2000 sonrası · açılış" ile "2000– ·
 * faaliyette" iki satır çıkıyordu, beğenmedi: "yalnız açılış"). Genel kural:
 * hangi maddede olursa olsun, açılış tarihi varsa faaliyet satırı atılır;
 * açılışı olmayan maddenin faaliyet satırı (kuruluş, yapım…) kalır.
 */
export function faaliyetiSuz<T extends { label: string; value: string }>(alanlar: T[]): T[] {
  const acilisVar = alanlar.some(f => ACILIS_ALANI.test(f.label) && f.value.trim());
  return acilisVar ? alanlar.filter(f => !FAALIYET_ALANI.test(f.label)) : alanlar;
}

/** Okunan tarih: yoksa `bit` tek tarih (nokta); null ise açık uçlu aralık ("1954–") */
export interface TarihAraligi {
  bas: number;
  bit?: number | null;
  /**
   * Açık uçlu aralığın başlangıcı yaklaşıksa başlangıcın en geç yılı:
   * "1980'ler–" → 1980…1989, "18. yüzyıl–" → 1700…1799, "1920–1940'lar–" → 1920…1949
   */
  basSon?: number;
  /** "1980'ler", "19. yüzyıl" gibi yaklaşık değer */
  yaklasik: boolean;
}

interface TarihParcasi { bas: number; son: number; yaklasik: boolean; konum: number; bitis: number }

/** Metindeki yıl ve yüzyıl sözleri, yazıldığı sırayla ("19. yüzyıl sonu", "1980'ler", "1954") */
function tarihParcalari(s: string): TarihParcasi[] {
  const l: TarihParcasi[] = [];
  const re = /(\d{1,2})\.\s*yüzyıl(?:ın)?(?:\s+(başı|başları|ortası|ortaları|sonu|sonları))?|\b(1\d{3}|20\d{2})(\s*'\s*(?:ler|lar)\w*|\s*-?\s*(?:ler|lar)\b)?/gi;
  for (const m of s.matchAll(re)) {
    const konum = m.index ?? 0, bitis = konum + m[0].length;
    if (m[1]) {
      const y = (Number(m[1]) - 1) * 100;
      const dilim = (m[2] || '').toLocaleLowerCase('tr');
      const [b, e] = dilim.startsWith('baş') ? [y, y + 33] : dilim.startsWith('orta') ? [y + 33, y + 66] : dilim.startsWith('son') ? [y + 66, y + 99] : [y, y + 99];
      l.push({ bas: b, son: e, yaklasik: true, konum, bitis });
    } else {
      const yil = Number(m[3]);
      const onyil = !!m[4] && yil % 10 === 0;
      l.push({ bas: yil, son: onyil ? yil + 9 : yil, yaklasik: onyil, konum, bitis });
    }
  }
  return l;
}

/** Tarihe benzer bir şey yazılmış mı (yıl, yüzyıl, dönem ya da tire) */
const tarihGibi = (s: string) => /\d|yüzyıl|dönem|[–—-]/i.test(s);

/**
 * Tek bir parça (";" ile ayrılmış). Parantez içi açıklamadır, başlangıç
 * sayılmaz: "Köy döneminden– (1980 sonrası yenilendi)" okunamaz (20 Kasım,
 * Kemal). Parantezin dışında tarihe benzer hiçbir şey yoksa ("Devlet
 * misafirhanesi (1954)") parantezdeki yıl okunur.
 */
function parcayiOku(parca: string): TarihAraligi | null {
  const disi = parca.replace(/\([^)]*\)/g, ' ').trim();
  const s = tarihGibi(disi) ? disi : parca.trim();
  const t = tarihParcalari(s);
  if (!t.length) return null;
  const ilk = t[0];
  const sonra = s.slice(ilk.bitis);
  const acikUc = (bas: number, son: number, yaklasik: boolean): TarihAraligi =>
    ({ bas, bit: null, ...(son > bas ? { basSon: son } : {}), yaklasik });
  const ikinci = t[1];
  if (ikinci && /^\s*[–—-]\s*$/.test(s.slice(ilk.bitis, ikinci.konum))) {
    // "1920–1940'lar–", "1950–1970 arası–": başlangıç bu aralıkta, sonu açık
    if (/^\s*(?:arası\s*)?[–—-]/i.test(s.slice(ikinci.bitis))) return acikUc(ilk.bas, ikinci.son, true);
    return { bas: ilk.bas, bit: ikinci.son, yaklasik: ilk.yaklasik || ikinci.yaklasik };
  }
  // "1954–", "18. yüzyıl–", "2024 ve sonrası": açık uçlu
  if (/^\s*[–—-]/.test(sonra) || /^\s*(ve\s+)?sonras/i.test(sonra)) return acikUc(ilk.bas, ilk.son, ilk.yaklasik);
  if (ilk.son > ilk.bas) return { bas: ilk.bas, bit: ilk.son, yaklasik: true };
  return { bas: ilk.bas, yaklasik: false };
}

/**
 * "1980–1990'lar" → { bas: 1980, bit: 1999 }; okunamazsa null. Yalnız ilk
 * parça (";"dan önce) okunur; `sonrakiParcalar` ile ilk parçada tarihe benzer
 * bir şey yoksa sonrakilere bakılır ("Eski yazlıkçı; 2000 sonrası yerleşti").
 */
export function tarihiOku(deger: string, secenek: { sonrakiParcalar?: boolean } = {}): TarihAraligi | null {
  const parcalar = deger.split(';');
  for (const p of secenek.sonrakiParcalar ? parcalar : parcalar.slice(0, 1)) {
    const t = parcayiOku(p);
    if (t) return t;
    if (tarihGibi(p)) return null;
  }
  return null;
}

const vikiMaddeleri = (items: Item[]) => items.filter(i => WIKI_TYPES.includes(i.type) && !i.archived && !i.isProposal);

// ---------------------------------------------------------------- zaman çizgisi satırları

/**
 * Zaman çizgisinin satırları (20 Kasım, Kemal): mekânların faaliyet yılları,
 * ailelerin adaya gelişi, kişilerin yaşamı (ekranda ayrı katman). Künyesinde
 * değer yazılı olan her madde bir satırdır; değer okunamıyorsa `aralik` null
 * olur ve satırda "tarih belirsiz" görünür. Hiçbir tarih uydurulmaz.
 */
export type ZamanGrubu = 'mekan' | 'aile' | 'kisi';

export interface ZamanSatiri {
  maddeId: string;
  madde: string;
  tur: ItemType;
  grup: ZamanGrubu;
  /** Künyede yazdığı gibi: [alan adı, değer] */
  degerler: Array<[string, string]>;
  aralik: TarihAraligi | null;
}

const GRUP: Partial<Record<ItemType, ZamanGrubu>> = { 'mekân': 'mekan', 'dükkân': 'mekan', aile: 'aile', kisi: 'kisi', karakter: 'kisi' };

/** Türkçe harfler sadeleşir, boşluk düşer: "Doğum yılı" ~ "dogumYili" */
const sade = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr')
  .replace(/[çğıöşüâî]/g, h => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i' } as Record<string, string>)[h] || h)
  .replace(/[^a-z0-9]+/g, '');

/** "Bilinmiyor" yazılmış alan okunmaz ama yazılmış sayılır (satırda "tarih belirsiz") */
const bilinmiyor = (s: string) => /^\s*bilinmiyor\W*$/i.test(s);

export function zamanSatirlari(items: Item[]): { satirlar: ZamanSatiri[]; tarihsiz: Record<ZamanGrubu, number> } {
  const satirlar: ZamanSatiri[] = [];
  const tarihsiz: Record<ZamanGrubu, number> = { mekan: 0, aile: 0, kisi: 0 };
  for (const i of vikiMaddeleri(items)) {
    const grup = GRUP[i.type];
    if (!grup) continue;
    const alanlar = [...getKunyeFields(i), ...getEkBilgiler(i)].filter(f => f.value.trim());
    const bul = (id: string, adlar: string[]) => {
      const s = new Set([id, ...adlar].map(sade));
      return alanlar.find(f => f.id === id) || alanlar.find(f => s.has(sade(f.label)));
    };
    let degerler: Array<[string, string]> = [];
    let aralik: TarihAraligi | null = null;
    if (grup === 'mekan') {
      const f = alanlar.find(x => ACILIS_ALANI.test(x.label)) || alanlar.find(x => FAALIYET_ALANI.test(x.label)) || alanlar.find(x => KURULUS_ALANI.test(x.label));
      if (f) { degerler = [[f.label, f.value.trim()]]; aralik = tarihiOku(f.value); }
    } else if (grup === 'aile') {
      const f = bul('gelis', ['Adaya geliş', 'Geliş']);
      if (f) { degerler = [[f.label, f.value.trim()]]; aralik = tarihiOku(f.value, { sonrakiParcalar: true }); }
    } else {
      const d = bul('dogumYili', ['Doğum yılı', 'Doğum', 'Doğum tarihi']);
      const y = bul('yasam', ['Yaşam']);
      degerler = [d, y].filter((f): f is NonNullable<typeof f> => !!f).map(f => [f.label, f.value.trim()]);
      const td = d && !bilinmiyor(d.value) ? tarihiOku(d.value) : null;
      const ty = y && !bilinmiyor(y.value) ? tarihiOku(y.value) : null;
      if (td) {
        // Doğum yılı önce (soy ağacındaki gibi); Yaşam'da ölüm yılı yazılıysa o da
        const olum = ty && typeof ty.bit === 'number' && ty.bit >= td.bas && /\d\s*[–—-]\s*\d/.test(y?.value || '') ? ty.bit : null;
        const son = td.bit ?? td.basSon ?? td.bas;
        aralik = { bas: td.bas, bit: olum, ...(son > td.bas ? { basSon: son } : {}), yaklasik: td.yaklasik };
      } else if (ty) {
        // Tek yıl doğum sayılır: o yıldan sonrası açık uçlu
        aralik = ty.bit === undefined ? { ...ty, bit: null } : ty;
      }
    }
    if (!degerler.length) { tarihsiz[grup]++; continue; }
    satirlar.push({ maddeId: i.id, madde: i.title.trim(), tur: i.type, grup, degerler, aralik });
  }
  satirlar.sort((a, b) => (a.aralik ? 0 : 1) - (b.aralik ? 0 : 1) || (a.aralik?.bas ?? 0) - (b.aralik?.bas ?? 0) || a.madde.localeCompare(b.madde, 'tr'));
  return { satirlar, tarihsiz };
}

// ---------------------------------------------------------------- dönemler

export interface Donem { id: string; ad: string; bas: number; bit?: number }

export function donemleriOku(items: Item[]): Donem[] {
  const ham = items.find(i => i.type === 'kkm_ayar')?.metadata?.donemler as Array<Record<string, unknown>> | undefined;
  return (ham || [])
    .filter(d => d && typeof d.ad === 'string' && typeof d.bas === 'number')
    .map(d => ({ id: String(d.id || d.ad), ad: String(d.ad), bas: Number(d.bas), ...(typeof d.bit === 'number' ? { bit: d.bit } : {}) }))
    .sort((a, b) => a.bas - b.bas);
}

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/** `kkm_ayar`'a yazılacak dönem listesi ve (istenirse) reddedilen adaylar; undefined yazılmaz */
export function donemKaydi(items: Item[], donemler: Donem[], reddedilen?: string[]): { guncel?: Item; yeni?: YeniKayit } {
  const liste = donemler.map(d => ({ id: d.id, ad: d.ad.trim(), bas: d.bas, ...(typeof d.bit === 'number' ? { bit: d.bit } : {}) }));
  const ek: Record<string, unknown> = { donemler: liste, ...(reddedilen ? { reddedilenDonemler: reddedilen } : {}) };
  const k = items.find(i => i.type === 'kkm_ayar');
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), ...ek }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: 'kkm_ayar', status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { hedefler: {}, bitenler: [], isler: [], ...ek }
    }
  };
}

export function reddedilenDonemler(items: Item[]): string[] {
  const r = items.find(i => i.type === 'kkm_ayar')?.metadata?.reddedilenDonemler;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : [];
}

export interface DonemAdayi {
  /** "Köy dönemi" — yazıldığı sözden, baş harfi büyük */
  ad: string;
  sayi: number;
  kaynaklar: Array<{ id: string; ad: string }>;
  /** İlk geçtiği cümle */
  ornek: string;
}

/** Dönem adı sayılmayan sözler ("bu dönemde", "parlak dönemi") */
const DONEM_DEGIL = new Set([
  'bu', 'o', 'şu', 'her', 'bir', 'aynı', 'farklı', 'yakın', 'uzak', 'parlak', 'son', 'ilk', 'uzun', 'kısa', 'hangi', 'belli', 'belirli',
  'eski', 'yeni', 'sonraki', 'önceki', 'öncesindeki', 'sonrasındaki', 'öncesi', 'sonrası', 'bütün', 'tüm', 'kendi', 'altın', 'zor', 'iyi', 'kötü', 'geçiş', 'ara', 'diğer', 'başka', 'açık'
]);

/**
 * Yazılarda (viki, künye, kitap, yazılar, notlar) geçen "X dönemi / X
 * döneminde" sözleri. Kemal'in eklediği ve "Önerme" dediği adlar çıkmaz.
 */
export function donemAdaylari(items: Item[], donemler: Donem[], reddedilen: string[]): DonemAdayi[] {
  const kucuk = (s: string) => s.toLocaleLowerCase('tr');
  const var_ = new Set([...donemler.map(d => kucuk(d.ad)), ...reddedilen.map(kucuk)]);
  const bul = new Map<string, DonemAdayi>();
  const kaynakTurleri = new Set<string>(['kitap_bolum', 'blog_post', 'fikir']);
  for (const i of items) {
    if (i.archived || i.isProposal) continue;
    const viki = WIKI_TYPES.includes(i.type);
    if (!viki && !kaynakTurleri.has(i.type)) continue;
    const metin = [
      ...(viki ? getArticleBody(i).map(b => b.text) : [i.notes || '']),
      ...(viki ? getKunyeFields(i).map(f => f.value) : [])
    ].join('\n');
    for (const m of metin.matchAll(/(?:^|[^\p{L}])(?:(\p{L}+)\s+)?(\p{L}+)\s+dönem(?:i|e|de|den|inde|inden|ine|ini|indeki|ler|lerinde)?(?![\p{L}])/gu)) {
      let soz = kucuk(m[2]);
      if (DONEM_DEGIL.has(soz) || soz.length < 3) continue;
      // İyelikli sözde önceki kelime de adın parçası: "top sahası dönemi"
      const once = m[1] ? kucuk(m[1]) : '';
      if (once && /s?[ıiuü]$/.test(soz) && !DONEM_DEGIL.has(once) && once.length > 1) soz = `${once} ${soz}`;
      const ad = soz.charAt(0).toLocaleUpperCase('tr') + soz.slice(1) + ' dönemi';
      if (var_.has(kucuk(ad))) continue;
      const a = bul.get(ad) || { ad, sayi: 0, kaynaklar: [], ornek: '' };
      a.sayi++;
      if (!a.kaynaklar.some(k => k.id === i.id)) a.kaynaklar.push({ id: i.id, ad: i.title.trim() });
      if (!a.ornek) {
        const bas = metin.lastIndexOf('.', m.index ?? 0) + 1;
        const son = metin.indexOf('.', (m.index ?? 0) + m[0].length);
        a.ornek = metin.slice(bas, son < 0 ? undefined : son + 1).replace(/\s+/g, ' ').trim().slice(0, 200);
      }
      bul.set(ad, a);
    }
  }
  return Array.from(bul.values()).sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'));
}
