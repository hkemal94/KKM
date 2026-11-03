import type { Item, ItemType } from '../types';

/**
 * İlham ve kaynaklar (3 Kasım, Kemal: "kaynaklarımı ve ilhamlarımı madde
 * madde, marka, ürün gibi köprüleyebileceğim ekran"). Her kayıt bir
 * `ilham_madde`: bağlantı (isteğe bağlı), görsel (isteğe bağlı; Galeri'nin
 * görsel deposu kuralıyla `gorsel:<id>`), kısa not, tür (ilham | kaynak),
 * etiketler (yönelim: Basics, Varsity & Preppy, Lokal…) ve bağlar.
 *
 * Bağlar `metadata.baglar`'da durur, `links`'te değil: `links` vikide
 * "Evrendeki bağlantıları" ve bağ ağını besler, ilham notu orada madde gibi
 * görünmesin. Silinen kaydın kimliği bağlarda kalırsa yalnız gösterilmez.
 * Bu dosya saf fonksiyonlardır; kayda yalnız ekrandaki "Kaydet" yazar.
 */

export type IlhamTuru = 'ilham' | 'kaynak';

export const ILHAM_TURU_ADI: Record<IlhamTuru, string> = { ilham: 'İlham', kaynak: 'Kaynak' };

/** Bağlanabilecek kayıtların grupları */
export type BagGrubu = 'marka' | 'urun' | 'madde';

export const BAG_GRUBU_ADI: Record<BagGrubu, string> = {
  marka: 'Marka ve kurum', urun: 'Drop ve ürün', madde: 'Viki maddesi'
};

const MARKA_TURLERI: ItemType[] = ['marka', 'kulüp'];
const URUN_TURLERI: ItemType[] = ['drop', 'merch_urun'];
const MADDE_TURLERI: ItemType[] = ['kisi', 'karakter', 'aile', 'mekân', 'dükkân', 'yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'olay', 'ürün'];

export function bagGrubu(t: ItemType): BagGrubu | null {
  if (MARKA_TURLERI.includes(t)) return 'marka';
  if (URUN_TURLERI.includes(t)) return 'urun';
  if (MADDE_TURLERI.includes(t)) return 'madde';
  return null;
}

/** İlhamın bağlanabileceği kayıtlar, ada göre */
export function bagHedefleri(items: Item[]): Item[] {
  return items
    .filter(i => !i.isProposal && bagGrubu(i.type) && (!i.archived || URUN_TURLERI.includes(i.type)))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

export interface IlhamBilgisi {
  tur: IlhamTuru;
  baglanti: string;
  baglar: string[];
}

export function ilhamBilgisi(i: Item): IlhamBilgisi {
  const m = (i.metadata || {}) as Record<string, unknown>;
  return {
    tur: m.ilhamTuru === 'kaynak' ? 'kaynak' : 'ilham',
    baglanti: typeof m.baglanti === 'string' ? m.baglanti : '',
    baglar: Array.isArray(m.baglar) ? (m.baglar as unknown[]).filter((x): x is string => typeof x === 'string') : []
  };
}

export const ilhamMi = (i: Item) => i.type === 'ilham_madde' && !i.archived;

export function ilhamlar(items: Item[]): Item[] {
  return items.filter(ilhamMi).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Bir kayda (marka, madde, drop, ürün) bağlı ilhamlar */
export function bagliIlhamlar(items: Item[], hedefId: string): Item[] {
  return ilhamlar(items).filter(i => ilhamBilgisi(i).baglar.includes(hedefId));
}

/** Pinterest bağlantısı mı (pinterest.com, pin.it, ülke alan adları) */
export function pinterestMi(adres: string): boolean {
  try {
    const h = new URL(adres.trim()).hostname.toLowerCase();
    return h === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(h);
  } catch { return false; }
}

/** "https://www.ornek.com/a/b" → "ornek.com"; geçersizse olduğu gibi */
export function alanAdi(adres: string): string {
  try { return new URL(adres.trim()).hostname.replace(/^www\./, ''); } catch { return adres.trim(); }
}

/** Yapıştırılan bağlantı: başında şema yoksa https eklenir; boşsa boş */
export function baglantiDuzelt(ham: string): string {
  const t = ham.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

/** Virgülle yazılan etiketler: kırpılır, tekrar edenler bir kez */
export function etiketleriAyir(ham: string): string[] {
  const gorulen = new Set<string>();
  const cikti: string[] = [];
  for (const p of ham.split(',')) {
    const e = p.trim();
    const k = e.toLocaleLowerCase('tr');
    if (!e || gorulen.has(k)) continue;
    gorulen.add(k);
    cikti.push(e);
  }
  return cikti;
}

/** Kaydın başlığı: Kemal başlık yazmadıysa notun ilk satırı, yoksa alan adı */
export function ilhamBasligi(not: string, baglanti: string, yedek = 'İlham'): string {
  const ilk = not.trim().split('\n')[0]?.trim();
  if (ilk) return ilk.length > 60 ? `${ilk.slice(0, 57)}…` : ilk;
  if (baglanti) return alanAdi(baglanti);
  return yedek;
}

/** "Ajana ilham tamamlat" isteğinin metni */
export function tamamlatmaIstegi(secili: string[], mevcut: Item[]): string {
  const yonelim = secili.length ? secili.join(', ') : 'bütün yönelimler';
  const ornek = mevcut.slice(0, 5).map(i => {
    const b = ilhamBilgisi(i);
    return `- ${i.title}${b.baglanti ? ` (${b.baglanti})` : ''}`;
  });
  return [
    `İlham ve kaynaklar · yönelim: ${yonelim}.`,
    'Eksik kalan ilhamları internetten kaynaklı tamamla, bağlantılarıyla. Her biri için bağlantı, kısa not ve önerilen etiket; ad, slogan ve kurgu yazma, uydurma sayı yok.',
    ...(ornek.length ? [`Elimdekilerden örnek (${mevcut.length} kayıt):`, ...ornek] : ['Bu yönelimde henüz kayıt yok.'])
  ].join('\n');
}
