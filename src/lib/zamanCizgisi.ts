import type { Item, ItemType } from '../types';
import { getArticleBody, getKunyeFields, getEkBilgiler, WIKI_TYPES } from '../components/wiki/wikiSchema';

/**
 * Evren zaman çizgisi ve dönemler (5. gece, 7 Ekim; vvd'den).
 *
 * Tarihler künyeden okunur (kuruluş, açılış, yapım, "Faaliyette: 1954–"…);
 * hiçbir tarih uydurulmaz, okunamayan değer çizgiye konmaz, ayrı listelenir.
 * Dönemler Kemal'in: adı ve yılları o verir, `kkm_ayar` → `donemler`'e
 * "Ekle"ye basınca yazılır. Adaylar yazılarda geçen "… dönemi" sözlerinden
 * çıkar; aday yalnız öneridir. Vikinin bir "şimdi"si yoktur: bitişi olmayan
 * aralık açık uçlu çizilir.
 */

/** Tarih alanı sayılan künye etiketleri (Evren Raporu'nun tarihçesiyle aynı) */
const TARIH_ALANI = /kuruluş|kurulus|açılış|acilis|yapım|yapim|inşa|insa|faaliyet|oluşum|olusum|sayılma|kapan|dönüşüm|donusum|köken|koken|tarih|dönem|donem/i;

const ACILIS_ALANI = /açılış|acilis/i;
const FAALIYET_ALANI = /faaliyet/i;

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

export interface ZamanKaydi {
  maddeId: string;
  madde: string;
  tur: ItemType;
  alan: string;
  /** Künyede yazdığı gibi (";"dan önceki kısım) */
  metin: string;
  bas: number;
  /** Yoksa tek tarih (nokta); null ise açık uçlu aralık ("1954–") */
  bit?: number | null;
  /** "1980'ler", "19. yüzyıl" gibi yaklaşık değer */
  yaklasik: boolean;
}

export interface OkunamayanTarih { maddeId: string; madde: string; alan: string; metin: string }

/** "1980–1990'lar" → { bas: 1980, bit: 1999 }; okunamazsa null */
export function tarihiOku(deger: string): Omit<ZamanKaydi, 'maddeId' | 'madde' | 'tur' | 'alan' | 'metin'> | null {
  const s = deger.split(';')[0].trim();
  const yy = s.match(/(\d{1,2})\.\s*yüzyıl/i);
  const yillar = Array.from(s.matchAll(/\b(1\d{3}|20\d{2})(\s*'\s*(?:ler|lar)\w*|\s*-?\s*(?:ler|lar)\b)?/gi))
    .map(m => ({ yil: Number(m[1]), onyil: !!m[2] && Number(m[1]) % 10 === 0, son: (m.index ?? 0) + m[0].length }));
  if (!yillar.length) {
    if (!yy) return null;
    const bas = (Number(yy[1]) - 1) * 100;
    return { bas, bit: bas + 99, yaklasik: true };
  }
  const ilk = yillar[0];
  const tire = /^\s*[–—-]/.test(s.slice(ilk.son));
  if (tire && yillar[1]) {
    const ikinci = yillar[1];
    return { bas: ilk.yil, bit: ikinci.onyil ? ikinci.yil + 9 : ikinci.yil, yaklasik: ilk.onyil || ikinci.onyil };
  }
  // "1954–" ve "2024 ve sonrası": açık uçlu
  if (tire || /^\s*(ve\s+)?sonras/i.test(s.slice(ilk.son))) return { bas: ilk.yil, bit: null, yaklasik: ilk.onyil };
  if (ilk.onyil) return { bas: ilk.yil, bit: ilk.yil + 9, yaklasik: true };
  return { bas: ilk.yil, yaklasik: false };
}

const vikiMaddeleri = (items: Item[]) => items.filter(i => WIKI_TYPES.includes(i.type) && !i.archived && !i.isProposal);

export function zamanKayitlari(items: Item[]): { kayitlar: ZamanKaydi[]; okunamayanlar: OkunamayanTarih[] } {
  const kayitlar: ZamanKaydi[] = [];
  const okunamayanlar: OkunamayanTarih[] = [];
  for (const i of vikiMaddeleri(items)) {
    for (const f of faaliyetiSuz([...getKunyeFields(i), ...getEkBilgiler(i)])) {
      if (!TARIH_ALANI.test(f.label) || !f.value.trim()) continue;
      const metin = f.value.split(';')[0].trim();
      const t = tarihiOku(f.value);
      if (t) kayitlar.push({ maddeId: i.id, madde: i.title.trim(), tur: i.type, alan: f.label, metin, ...t });
      else if (/\d|yüzyıl|antik/i.test(metin)) okunamayanlar.push({ maddeId: i.id, madde: i.title.trim(), alan: f.label, metin });
    }
  }
  kayitlar.sort((a, b) => a.bas - b.bas || a.madde.localeCompare(b.madde, 'tr'));
  return { kayitlar, okunamayanlar };
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
