import type { Item } from '../types';

/**
 * Kişinin adı ve soyadı (21 Ekim, Kemal: "insanları isim ve soyisim diye
 * künyelendirebilmeliyiz; evli kadınlar için soyisim durumunu anlaşılır
 * hale getirmelisin"). Karar: iki soyadı yan yana, doğumdaki soyadı önce,
 * şimdiki soyadı sonra: "Zeynep Kaya Yılmaz".
 *
 * Alanlar künyede: Adı, Soyadı (şimdi kullandığı), Doğumdaki soyadı
 * (yalnız soyadı değişenlerde). Maddenin başlığı olduğu gibi kalır;
 * hiçbir kayıt kendiliğinden yeniden adlandırılmaz.
 */

const profil = (i: Item, anahtar: string): string => {
  const v = (i.metadata?.profile as Record<string, unknown> | undefined)?.[anahtar];
  return typeof v === 'string' ? v.trim() : '';
};

const kucuk = (s: string) => s.trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

export interface KisiAdi { adi: string; soyadi: string; dogumSoyadi: string }

export function kisiAdiAlanlari(i: Item): KisiAdi {
  return { adi: profil(i, 'adi'), soyadi: profil(i, 'soyadi'), dogumSoyadi: profil(i, 'dogumSoyadi') };
}

/** Başlıktan sondaki soyadları atar: "Zeynep Kaya Yılmaz" − Yılmaz − Kaya → "Zeynep" */
function soyadsizBaslik(baslik: string, soyadlari: string[]): string {
  const sozcukler = baslik.trim().split(/\s+/).filter(Boolean);
  for (const s of soyadlari) {
    if (!s) continue;
    const n = s.split(/\s+/).length;
    const son = sozcukler.slice(-n).join(' ');
    if (sozcukler.length > n && kucuk(son) === kucuk(s)) sozcukler.splice(-n, n);
  }
  return sozcukler.join(' ');
}

/**
 * Yazılacak tam ad. Adı, soyadı ya da doğumdaki soyadı hiç yazılmamışsa boş
 * döner (başlık zaten yeterli). Ad yazılmamışsa başlıktan soyadlar atılarak
 * bulunur.
 */
export function tamAd(i: Item): string {
  const { adi, soyadi, dogumSoyadi } = kisiAdiAlanlari(i);
  if (!adi && !soyadi && !dogumSoyadi) return '';
  const ad = adi || soyadsizBaslik(i.title, [soyadi, dogumSoyadi]);
  const parcalar = [ad, dogumSoyadi, soyadi].filter(Boolean);
  // Doğumdaki ve şimdiki soyadı aynıysa tek yazılır
  if (dogumSoyadi && soyadi && kucuk(dogumSoyadi) === kucuk(soyadi)) parcalar.splice(1, 1);
  return parcalar.join(' ');
}

/** Başlıkta "Hanım", "Efendi" gibi ünvanla biten adlar soyad taşımaz */
const UNVAN = new Set(['hanım', 'hanim', 'efendi', 'bey', 'abla', 'abi', 'amca', 'teyze', 'dayı', 'usta', 'hoca', 'kaptan', 'baba', 'ana', 'dede', 'nine', 'ağa', 'paşa', 'kızı', 'oğlu']);

const KISI = new Set(['kisi', 'karakter']);

/** Bu kişinin başlığından Ad / Soyadı ayrılabilir mi, ayrılırsa nasıl */
function basliktanAyir(i: Item): { ad: string; soyad: string } | null {
  const sozcukler = i.title.trim().split(/\s+/);
  if (sozcukler.length !== 2) return null;
  if (!sozcukler.every(s => /^[\p{L}'’-]+$/u.test(s))) return null;
  if (UNVAN.has(kucuk(sozcukler[1]))) return null;
  return { ad: sozcukler[0], soyad: sozcukler[1] };
}

const bosKisi = (i: Item) => {
  const k = kisiAdiAlanlari(i);
  return KISI.has(i.type) && !i.archived && !i.isProposal && !k.adi && !k.soyadi && !k.dogumSoyadi;
};

/**
 * Tek seferlik kart (Durum → Eksikler): başlığı tam iki sözcük olan kişide
 * Adı ve Soyadı alanlarını başlıktan doldurur. Yalnız BOŞ alanlara yazar;
 * üç sözcüklü, tek sözcüklü, ünvanlı adlar ve "Eylül Hanım" atlanır (elle).
 * İkinci basışta iş kalmaz. Başlığa dokunmaz.
 */
export function kisiAdlariniAyir(items: Item[]): Array<{ item: Item; neler: string[] }> {
  const cikti: Array<{ item: Item; neler: string[] }> = [];
  for (const i of items) {
    if (!bosKisi(i)) continue;
    const a = basliktanAyir(i);
    if (!a) continue;
    const profile = { ...((i.metadata?.profile as Record<string, unknown> | undefined) || {}), adi: a.ad, soyadi: a.soyad };
    cikti.push({
      item: { ...i, metadata: { ...(i.metadata || {}), profile }, updatedAt: Date.now() },
      neler: [`Adı: ${a.ad}`, `Soyadı: ${a.soyad}`]
    });
  }
  return cikti;
}

/** Karttan atlanan, Kemal'in elle dolduracağı kişiler (yalnız sayı için; yazmaz) */
export function adiAyrilamayanlar(items: Item[]): Item[] {
  return items.filter(i => bosKisi(i) && !basliktanAyir(i));
}
