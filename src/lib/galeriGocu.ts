import type { Item } from '../types';
import { GORSEL_ENFAZLA, basvuruYap, icerikKimligi } from './gorselBasvuru';

/**
 * Galeri görsellerini kayıtların dışına taşıma (21 Ekim, paket K). Saf
 * kısım: hangi kayıtlar taşınacak, kayıt başvurularla nasıl görünecek.
 * Yazma sırası (önce görsel belgeleri, doğrulama, en son kayıt) çalıştıran
 * dosyada: `galeriGocuCalistir.ts`.
 */

export const tasinacakMi = (s: unknown): s is string =>
  typeof s === 'string' && s.startsWith('data:image/') && s.length <= GORSEL_ENFAZLA;

export interface GocGorseli { sira: number; kimlik: string; veri: string }
export interface GocIsi { item: Item; gorseller: GocGorseli[] }

/**
 * Taşınacak kayıtlar. Eskiden yeniye sıralı: her yazma kaydın değişme
 * zamanını yeniler, Galeri bu zamana göre dizildiği için sıra korunsun.
 */
export function gocIsleri(items: Item[]): GocIsi[] {
  const cikti: GocIsi[] = [];
  for (const item of items) {
    if (item.type !== 'ilham_gorsel') continue;
    const gorseller: GocGorseli[] = [];
    (item.images || []).forEach((s, sira) => {
      if (tasinacakMi(s)) gorseller.push({ sira, kimlik: icerikKimligi(s), veri: s });
    });
    if (gorseller.length) cikti.push({ item, gorseller });
  }
  return cikti.sort((a, b) => (a.item.updatedAt || 0) - (b.item.updatedAt || 0));
}

export interface GocOzeti { kayit: number; gorsel: number; kazanilanBayt: number }

/** Kartta görünen sayılar — gerçek veriden */
export function gocOzeti(isler: GocIsi[]): GocOzeti {
  let gorsel = 0, kazanilanBayt = 0;
  for (const is of isler) {
    for (const g of is.gorseller) {
      gorsel++;
      kazanilanBayt += g.veri.length - basvuruYap(g.kimlik).length;
    }
  }
  return { kayit: isler.length, gorsel, kazanilanBayt };
}

/** Kaydın başvurulu hâli. Başvurusu olmayan sıradaki değerlere dokunulmaz. */
export function basvuruluKayit(is: GocIsi, basvurular: Map<number, string>): Item {
  const images = (is.item.images || []).map((s, i) => basvurular.get(i) ?? s);
  return { ...is.item, images, updatedAt: Date.now() };
}

export const kbYaz = (bayt: number) => `${Math.round(bayt / 1024)} KB`;
