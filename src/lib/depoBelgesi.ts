import { anahtariOku } from './oyunAyarlari';

/**
 * Oyunun deposundaki tasarım belgesi, canlı okunur (14 Ekim, Kemal:
 * "Dondurmacı Kızlar konusunda farklı bir repoda çok yol aldım, içeride
 * nasıl güncellerim?" → "Canlı okusun").
 *
 * - Oyunun künyesine depo yazılır (`metadata.depo`, ör. "hkemal94/DondumaciKizlar").
 * - Belge her açılışta depodan okunur ve gösterilir. KKM kayıtlarına bir şey
 *   yazılmaz (yazma sınırı yemez), oyunun deposuna da hiçbir şey yazılmaz.
 * - Okunan: `docs/tasarim-belgesi.md` (oyun deposunun "tek kaynağı"); yoksa README.md.
 *
 * Burada yalnız sade bir Markdown ayrıştırıcısı var: başlık, paragraf, liste,
 * tablo, görsel, ayraç. Sayfaya HTML olarak basılmaz; React öğesine çevrilir.
 */

export const BELGE_YOLLARI = ['docs/tasarim-belgesi.md', 'README.md'];
/** Oyunun yol haritası (14 Ekim gece, Kemal: "bir şirketmiş gibi yerimizi, noktamızı ve yolumuzu bilmek isterim") */
export const YOL_HARITASI_YOLLARI = ['docs/yol-haritasi.md'];

/** "hkemal94/DondumaciKizlar" ya da GitHub adresi → "sahip/depo"; uymuyorsa null */
export function depoAdi(girdi: string): string | null {
  const s = (girdi || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/.*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export const hamAdres = (depo: string, yol: string) => `https://raw.githubusercontent.com/${depo}/HEAD/${yol}`;
export const depoSayfasi = (depo: string, yol?: string) => `https://github.com/${depo}${yol ? `/blob/HEAD/${yol}` : ''}`;

/** Belgenin yanındaki göreli görsel yolunu ham adrese çevirir */
export function gorselAdresi(depo: string, belgeYolu: string, adres: string): string {
  if (/^https?:\/\//.test(adres)) return adres;
  const parcalar = belgeYolu.split('/').slice(0, -1);
  for (const p of adres.split('/')) {
    if (p === '..') parcalar.pop();
    else if (p && p !== '.') parcalar.push(p);
  }
  return hamAdres(depo, parcalar.join('/'));
}

export type Blok =
  | { tur: 'baslik'; seviye: number; metin: string; kimlik: string }
  | { tur: 'paragraf'; metin: string }
  | { tur: 'liste'; sirali: boolean; ogeler: string[] }
  | { tur: 'tablo'; baslik: string[]; satirlar: string[][] }
  | { tur: 'gorsel'; alt: string; adres: string }
  | { tur: 'cizgi' };

const hucreler = (satir: string) => satir.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(h => h.trim());
const ayracSatiri = (satir: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(satir);

export const baslikKimligi = (metin: string, n: number) =>
  `depo-${n}-${metin.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşüâîû]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

export function markdownuAyir(md: string): Blok[] {
  const satirlar = md.replace(/\r\n?/g, '\n').split('\n');
  const bloklar: Blok[] = [];
  let i = 0;
  let baslikSayisi = 0;
  while (i < satirlar.length) {
    const s = satirlar[i];
    if (!s.trim()) { i++; continue; }
    const baslik = s.match(/^(#{1,6})\s+(.*)$/);
    if (baslik) {
      const metin = baslik[2].trim();
      bloklar.push({ tur: 'baslik', seviye: baslik[1].length, metin, kimlik: baslikKimligi(metin, baslikSayisi++) });
      i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) { bloklar.push({ tur: 'cizgi' }); i++; continue; }
    const gorsel = s.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/);
    if (gorsel) { bloklar.push({ tur: 'gorsel', alt: gorsel[1], adres: gorsel[2] }); i++; continue; }
    if (s.trim().startsWith('|') && i + 1 < satirlar.length && ayracSatiri(satirlar[i + 1])) {
      const bas = hucreler(s);
      const govde: string[][] = [];
      i += 2;
      while (i < satirlar.length && satirlar[i].trim().startsWith('|')) { govde.push(hucreler(satirlar[i])); i++; }
      bloklar.push({ tur: 'tablo', baslik: bas, satirlar: govde });
      continue;
    }
    const madde = s.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (madde) {
      const sirali = /\d/.test(madde[1]);
      const ogeler: string[] = [];
      while (i < satirlar.length) {
        const m = satirlar[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (m) { ogeler.push(m[2]); i++; continue; }
        // Maddenin alt satırı (girintili devam)
        if (satirlar[i].trim() && /^\s{2,}/.test(satirlar[i]) && ogeler.length) { ogeler[ogeler.length - 1] += ' ' + satirlar[i].trim(); i++; continue; }
        break;
      }
      bloklar.push({ tur: 'liste', sirali, ogeler });
      continue;
    }
    // Paragraf: boş satıra ya da başka bir bloğa kadar
    const parca: string[] = [];
    while (i < satirlar.length && satirlar[i].trim()
      && !/^(#{1,6})\s/.test(satirlar[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(satirlar[i])
      && !satirlar[i].trim().startsWith('|') && !/^\s*(-{3,}|\*{3,})\s*$/.test(satirlar[i])) {
      parca.push(satirlar[i].trim()); i++;
    }
    // "**Etiket:** değer" ile başlayan satır yeni satırda kalır (belgenin baş bilgileri)
    if (parca.length) bloklar.push({ tur: 'paragraf', metin: parca.reduce((a, p, n) => n === 0 ? p : a + (p.startsWith('**') ? '\n' : ' ') + p, '') });
    else i++;
  }
  return bloklar;
}

export type Parca = { tur: 'duz' | 'kalin' | 'egik' | 'cizili' | 'kod'; metin: string } | { tur: 'baglanti'; metin: string; adres: string };

/** Satır içi: **kalın**, *eğik*, ~~çizili~~, `kod`, [bağlantı](adres) */
export function satirIci(metin: string): Parca[] {
  const desen = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  const cikti: Parca[] = [];
  let son = 0;
  for (const m of metin.matchAll(desen)) {
    const t = m[0];
    const n = m.index ?? 0;
    // Kelime içindeki alt çizgi (dosya_adi) eğik sayılmaz
    if (t.startsWith('_') && n > 0 && /\w/.test(metin[n - 1])) continue;
    if (n > son) cikti.push({ tur: 'duz', metin: metin.slice(son, n) });
    if (t.startsWith('**')) cikti.push({ tur: 'kalin', metin: t.slice(2, -2) });
    else if (t.startsWith('~~')) cikti.push({ tur: 'cizili', metin: t.slice(2, -2) });
    else if (t.startsWith('`')) cikti.push({ tur: 'kod', metin: t.slice(1, -1) });
    else if (t.startsWith('[')) {
      const b = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      cikti.push({ tur: 'baglanti', metin: b[1], adres: b[2] });
    } else cikti.push({ tur: 'egik', metin: t.slice(1, -1) });
    son = n + t.length;
  }
  if (son < metin.length) cikti.push({ tur: 'duz', metin: metin.slice(son) });
  return cikti;
}

/**
 * Gizli depo (22 Ekim, Kems-Ajans gizlendi): bu tarayıcıda GitHub anahtarı
 * varsa okuma GitHub'ın kendisinden anahtarla yapılır; yoksa açık adresten.
 */
export const anahtarBasligi = (): Record<string, string> => {
  const a = anahtariOku();
  return a ? { Authorization: `Bearer ${a}` } : {};
};
const okumaIstegi = (depo: string, yol: string) => anahtariOku()
  ? fetch(`https://api.github.com/repos/${depo}/contents/${yol}`, { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json', ...anahtarBasligi() } })
  : fetch(hamAdres(depo, yol), { cache: 'no-cache' });

/** Depodaki belgeyi okur; ilk bulunan yol döner */
export async function belgeyiOku(depo: string, yollar: string[] = BELGE_YOLLARI): Promise<{ yol: string; metin: string }> {
  let sonHata = '';
  for (const yol of yollar) {
    try {
      const r = await okumaIstegi(depo, yol);
      if (r.ok) return { yol, metin: await r.text() };
      sonHata = `${r.status}`;
    } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(sonHata || 'bulunamadı');
}
