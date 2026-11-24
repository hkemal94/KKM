import type { Item } from '../types';
import { aileUyeleri } from './aileUyeligi';
import { maddeGorselleri, siluetMi } from './maddeGorseli';
import { diz, soyVerisi, yasamOku, type SoyBagi, type SoyKisi } from './soyAgaci';

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
  const soyadi = ad.replace(/\s+ailesi\s*$/i, '').trim();
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

export type AileEtiketi = 'dogum' | 'evlilik';
export interface AileAgaciKisisi extends SoyKisi { etiket?: AileEtiketi }

export interface AileAgaci {
  kisiler: AileAgaciKisisi[];
  /** Yalnız ebeveyni, eşi ve kardeşi bağları (iki ucu da ailede) */
  baglar: SoyBagi[];
  /** Kutunun sol üst köşesi; en soldaki kutu x = 0, en üstteki y = 0 */
  konum: Map<string, { x: number; y: number }>;
  en: number;
  boy: number;
}

/**
 * Ailenin kuşak ağacı: üyeler `aileUyeleri`'nden (üye, doğduğu aile, evlilikle),
 * kuşaklar ve sıra soy ağacının `diz`'inden.
 */
export function aileAgaci(aile: Item, items: Item[], degerOku: (i: Item, alanId: string) => string,
  kutuEn: number, kutuBoy: number, araX: number, araY: number): AileAgaci {
  const uyeler = aileUyeleri(aile, items);
  const yol = new Map(uyeler.map(u => [u.kisi.id, u.yol]));
  const veri = soyVerisi(items, degerOku);
  const kisiler: AileAgaciKisisi[] = veri.kisiler.filter(k => yol.has(k.id)).map(k => {
    const etiket: AileEtiketi | undefined = yol.get(k.id) === 'evlilik' ? 'evlilik'
      : k.dogumAileId === aile.id && k.aileId !== aile.id ? 'dogum' : undefined;
    return etiket ? { ...k, etiket } : k;
  });
  const ic = new Set(kisiler.map(k => k.id));
  const baglar = veri.baglar.filter(b => ic.has(b.a) && ic.has(b.b)
    && (b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi'));
  const ham = diz(kisiler, baglar, kutuEn, kutuBoy, new Map(), araX, araY);
  const xs = [...ham.values()].map(p => p.x), ys = [...ham.values()].map(p => p.y);
  const mx = xs.length ? Math.min(...xs) : 0, my = ys.length ? Math.min(...ys) : 0;
  const konum = new Map([...ham.entries()].map(([id, p]) => [id, { x: p.x - mx, y: p.y - my }]));
  const en = xs.length ? Math.max(...xs) - mx + kutuEn : 0;
  const boy = ys.length ? Math.max(...ys) - my + kutuBoy : 0;
  return { kisiler, baglar, konum, en, boy };
}
