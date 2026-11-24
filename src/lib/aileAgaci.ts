import type { Item } from '../types';
import { aileUyeleri } from './aileUyeligi';
import { maddeGorselleri, siluetMi } from './maddeGorseli';
import { agacDiz, anaAileId, soyVerisi, yasamOku, type AgacKenari, type AgacOlcu, type SoyKisi } from './soyAgaci';

/**
 * Aile sayfası (24 Kasım, Kemal'in kararları):
 *  - Aile monogramı yer tutucudur: ailenin görseli yokken görünür, görsel gelince
 *    gizlenir (5 Kasım silüeti gibi). Yalnız ekranda kodla çizilir; dosya ve kayıt yok.
 *  - Üyeler portreli kuşak ağacı olarak dizilir: en eski kuşak üstte, eşler yan
 *    yana, çocuklar altta. Hesap soy ağacınınki (`soyAgaci.ts` → `diz`).
 *  - Hayatta olmayan kişinin künyesinde portrenin yanında siyah-beyaz "eski
 *    fotoğraf" hâli: aynı portre, ekranda gri tonlu.
 * Hiçbir şey kayda yazılmaz.
 */

/** Monogramın harfi: soyadının baş harfi ("Ercan Ailesi" → "E", "Öztürk Ailesi" → "Ö") */
export function aileBasHarfi(ad: string): string {
  // Köşeli ve normal ayraç içi atlanır ("[ad: Kemal]" gibi yer tutucu harf vermez)
  const soyadi = ad.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+ailesi\s*$/i, '').trim();
  const harf = soyadi.match(/\p{L}/u)?.[0] || '';
  return harf.toLocaleUpperCase('tr');
}

/** Ailenin gerçek görseli var mı (silüet sayılmaz). Varsa monogram gösterilmez. */
export function aileGorseliVar(aile: Item, items: Item[] = []): boolean {
  return maddeGorselleri(aile, items).some(g => !siluetMi(g));
}

/**
 * Kişi hayatta değil mi: Yaşam'da ölüm yılı ya da aralığı yazılı
 * ("1890'lar–1950'ler/1960'lar", "1920'ler–1990'lar", "1980–2020").
 * Çizginin arkası boşsa ("1951–", "1950'ler başı–") ya da yalnız doğum yazılıysa hayatta sayılır.
 */
export function hayattaDegil(dogumHam: string, yasamHam: string): boolean {
  const { yasam, yasamMetni } = yasamOku(dogumHam, yasamHam);
  return !!yasam && typeof yasam.bit === 'number' && !!yasamMetni && /[–—-]\s*\d/.test(yasamMetni);
}

/**
 * Kişinin bu ailedeki yeri (24 Kasım, B1 "Albüm"):
 *  - 'uye': ailenin soyadını taşıyan, burada doğan
 *  - 'gelen': evlilikle gelen (doğduğu soyadı ya da aile başka)
 *  - 'dogan': burada doğup başka soyadına geçen
 *  - 'soy': burada doğup ayrılanın çocuğu (başka soyadıyla)
 */
export type AileYeri = 'uye' | 'gelen' | 'dogan' | 'soy';

export interface AileAgaciKisisi extends SoyKisi {
  yer: AileYeri;
  /** Doğumdaki soyadı (künyeden; ailesi yoksa da yazılır) */
  dogumSoyadi?: string;
  /** Kısa ok: başka bir aileye geçiş ("↗ Demir Ailesi"), basınca o aile açılır */
  baglar: Array<{ aileId: string; ad: string; neden: 'dogum' | 'ev' }>;
  /** Hayatta değil (Yaşam'da ölüm yılı ya da aralığı yazılı) */
  olmus: boolean;
}

export interface AileAgaci {
  kisiler: AileAgaciKisisi[];
  /** Yalnız ebeveyni, eşi ve kardeşi bağları (iki ucu da ağaçta) */
  kenarlar: AgacKenari[];
  kusak: Map<string, number>;
  konum: Map<string, { x: number; y: number }>;
  en: number;
  boy: number;
}

/**
 * Ailenin kuşak ağacı: üyeler `aileUyeleri`'nden (üye, doğduğu aile, evlilikle),
 * bu aileden doğup başka soyadına geçenlerin çocukları da (bir kuşak) girer.
 * Yerleşim soy ağacının `agacDiz`'i: eşler yan yana, çocuklar ortalı altta.
 */
export function aileAgaci(aile: Item, items: Item[], degerOku: (i: Item, alanId: string) => string, o: AgacOlcu): AileAgaci {
  const uyeler = aileUyeleri(aile, items);
  const veri = soyVerisi(items, degerOku);
  const sk = new Map(veri.kisiler.map(k => [k.id, k]));
  const aileAdi = new Map(veri.aileler.map(a => [a.id, a.ad]));
  const madde = new Map(items.map(i => [i.id, i]));
  const ic = new Map<string, AileYeri>();
  const kucuk = (x: string) => x.trim().toLocaleLowerCase('tr');
  const aileSoyadi = kucuk(aile.title.replace(/\s+ailesi\s*$/i, ''));
  for (const u of uyeler) {
    const k = sk.get(u.kisi.id);
    if (!k) continue;
    const ana = anaAileId(k);
    const dogumda = kucuk(degerOku(u.kisi, 'dogumSoyadi'));
    const soyadi = kucuk(degerOku(u.kisi, 'soyadi'));
    const buradaDogdu = k.dogumAileId === aile.id || (!!dogumda && dogumda === aileSoyadi);
    const yer: AileYeri = buradaDogdu
      ? ((ana && ana !== aile.id) || (soyadi && soyadi !== aileSoyadi) ? 'dogan' : 'uye')
      : u.yol === 'evlilik' || (k.dogumAileId && k.dogumAileId !== aile.id) || (dogumda && dogumda !== aileSoyadi) ? 'gelen'
      : u.yol === 'dogum' ? 'dogan' : 'uye';
    ic.set(k.id, yer);
  }
  // Buradan ayrılanın eşi bu ailede görünmez (Ercan'da doğup Özdemir'e gelin gidenin eşi)
  for (const u of uyeler) {
    if (u.yol !== 'evlilik' || !ic.has(u.kisi.id)) continue;
    const buradakiEsler = veri.baglar.filter(b => b.tur === 'eşi' && (b.a === u.kisi.id || b.b === u.kisi.id))
      .map(b => (b.a === u.kisi.id ? b.b : b.a)).filter(id => ic.has(id) && id !== u.kisi.id);
    if (buradakiEsler.length && buradakiEsler.every(id => ic.get(id) === 'dogan')) ic.delete(u.kisi.id);
  }
  // Burada doğup ayrılanın çocukları (ör. kızının kızı)
  for (const b of veri.baglar) {
    if (b.tur === 'ebeveyni' && ic.get(b.b) === 'dogan' && !ic.has(b.a) && sk.has(b.a)) ic.set(b.a, 'soy');
  }
  const kisiler: AileAgaciKisisi[] = [...ic.entries()].map(([id, yer]) => {
    const k = sk.get(id)!;
    const i = madde.get(id)!;
    const ana = anaAileId(k);
    const baglar: AileAgaciKisisi['baglar'] = [];
    if (ana && ana !== aile.id) baglar.push({ aileId: ana, ad: aileAdi.get(ana) || '', neden: 'ev' });
    if (k.dogumAileId && k.dogumAileId !== aile.id && k.dogumAileId !== ana) baglar.push({ aileId: k.dogumAileId, ad: aileAdi.get(k.dogumAileId) || '', neden: 'dogum' });
    const dogumSoyadi = degerOku(i, 'dogumSoyadi').trim();
    return {
      ...k, yer, baglar,
      ...(dogumSoyadi ? { dogumSoyadi } : {}),
      olmus: hayattaDegil(degerOku(i, 'dogumYili'), degerOku(i, 'yasam'))
    };
  });
  const kenarlar: AgacKenari[] = veri.baglar
    .filter(b => ic.has(b.a) && ic.has(b.b) && (b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi'))
    .map(b => ({ a: b.a, b: b.b, tur: b.tur as AgacKenari['tur'] }));
  const y = agacDiz(kisiler.map(k => ({ id: k.id, ad: k.ad, ...(k.yasam ? { dogum: k.yasam.bas } : {}) })), kenarlar, o);
  return { kisiler, kenarlar, ...y };
}

/** Kuşak sayısı */
export const kusakSayisi = (a: AileAgaci) => new Set(a.kusak.values()).size;
