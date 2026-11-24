import type { Item, WikiSection } from '../types';
import { GERCEK_YER, gercekYerMi, kaynakAdi, kaynakAdresi } from './vikipediKaynagi';

/**
 * Viki madde standardının karar türleri (24 Kasım, Kemal standardı onayladı;
 * `ajansKararlari.ts` → `bolumYaz`, `bolumSil`, `gercekYer`, `alaniBosalt`).
 * Bu dosya saf iştir: ne değişeceğini hesaplar, kayda yazan `kararlariUygula`.
 *
 * Bölümler maddede `metadata.wikiSections` dizisinde durur (`{ id, title,
 * content, status, bekleyenOneri? }`), ekranda bu sırayla görünür.
 */

export interface BolumYazKarari { bolum: string; metin: string; sira?: number; eski?: string; eskiBaslik?: string }
export interface BolumSilKarari { bolum: string; eski: string; tekrar?: boolean }
export interface GercekYerKarari { kaynakAdi: string; kaynakUrl: string }

const kucuk = (s: string) => (s || '').trim().replace(/\s+/g, ' ').replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');
const temiz = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
export const bolumleriOku = (m: Item): WikiSection[] => (Array.isArray(m.metadata?.wikiSections) ? m.metadata!.wikiSections as WikiSection[] : []);

/**
 * `bolumYaz`: başlıklı bölümü açar ya da yazısını değiştirir.
 *   - O başlıkta bölüm yoksa açılır: `sira` verilmişse o sıraya (1 = ilk), yoksa sona.
 *   - Varsa ve yazısı zaten `metin` ise (başlığı da aynıysa) yapılmış sayılır.
 *   - Varsa ve boşsa ya da yazısı `eski` ile birebir aynıysa yazı `metin` olur;
 *     yeri ve kimliği değişmez. Başlık yalnız büyük küçük harf farkıysa `bolum` olur.
 *   - Dolu bölüm `eski` tutmuyorsa üzerine yazılmaz, yeni bölüm de açılmaz: çakışma
 *     (KKM kuralı: aynı başlıkta dolu bölüme gelen öneri yeni bölüm açmaz).
 *   - `eskiBaslik` verilirse bölüm o başlıkla aranır ve başlığı `bolum` olur
 *     ("Tarihçesi" → "Tarihçe"); o başlıkta bölüm yoksa ve `bolum` başlıklı bölüm
 *     zaten `metin` ile duruyorsa yapılmış sayılır, yoksa çakışma.
 */
export function bolumYazPlani(m: Item | null, k: BolumYazKarari, yeniId = 'bolum') {
  const baslik = temiz(k.bolum), metin = temiz(k.metin);
  const hepsi = m ? bolumleriOku(m) : [];
  const sonuc = (o: { bolumler?: WikiSection[]; yapildi?: boolean; cakisma?: string | null; ne?: string }) =>
    ({ bolumler: null as WikiSection[] | null, yapildi: false, cakisma: null as string | null, ne: '', ...o });
  if (!m) return sonuc({ cakisma: 'madde bulunamadı ya da aynı adla birden çok var' });
  if (!baslik || !metin) return sonuc({ cakisma: 'bölüm başlığı ya da metni boş' });
  const ara = temiz(k.eskiBaslik) || baslik;
  const bulunan = hepsi.map((b, n) => ({ b, n })).filter(x => kucuk(x.b.title) === kucuk(ara));
  if (bulunan.length > 1) return sonuc({ cakisma: `"${ara}" başlıklı birden çok bölüm var` });
  if (!bulunan.length) {
    if (temiz(k.eskiBaslik)) {
      const hedef = hepsi.filter(b => kucuk(b.title) === kucuk(baslik));
      if (hedef.length === 1 && hedef[0].title.trim() === baslik && temiz(hedef[0].content) === metin) return sonuc({ yapildi: true });
      return sonuc({ cakisma: `"${k.eskiBaslik}" başlıklı bölüm yok` });
    }
    const yeni: WikiSection = { id: yeniId, title: baslik, content: metin, status: 'resmi' };
    const sira = typeof k.sira === 'number' && Number.isInteger(k.sira) && k.sira > 0 ? Math.min(k.sira, hepsi.length + 1) : hepsi.length + 1;
    const bolumler = [...hepsi.slice(0, sira - 1), yeni, ...hepsi.slice(sira - 1)];
    return sonuc({ bolumler, ne: `"${baslik}" bölümü ${sira}. sıraya açılır` });
  }
  const { b, n } = bulunan[0];
  const simdi = temiz(b.content);
  if (simdi === metin && b.title.trim() === baslik) return sonuc({ yapildi: true });
  const yazilir = simdi === metin || !simdi || (k.eski !== undefined && simdi === temiz(k.eski));
  if (!yazilir) return sonuc({ cakisma: k.eski === undefined ? `"${b.title}" bölümü dolu; eski metin verilmeden üzerine yazılmaz` : `"${b.title}" bölümünün yazısı bu arada değişmiş` });
  if (hepsi.some((x, j) => j !== n && kucuk(x.title) === kucuk(baslik))) return sonuc({ cakisma: `"${baslik}" başlıklı başka bir bölüm zaten var` });
  const bolumler = hepsi.map((x, j) => (j === n ? { ...x, title: baslik, content: metin } : x));
  const ad = b.title.trim() !== baslik ? `"${b.title}" bölümünün adı "${baslik}" olur` : '';
  const yazi = simdi !== metin ? `"${baslik}" bölümünün ${simdi ? 'yazısı değişir' : 'boş yazısı dolar'}` : '';
  return sonuc({ bolumler, ne: [ad, yazi].filter(Boolean).join('; ') });
}

/**
 * `bolumSil`: başlığı `bolum`, yazısı birebir `eski` olan bölüm çıkar.
 *   - Böyle bölüm kalmadıysa yapılmış sayılır.
 *   - `tekrar: true`: aynı başlık ve yazıyla birden çok bölüm varsa ilki kalır,
 *     öbürleri çıkar (tekrar eden bölüm temizliği); bir tane kaldıysa yapılmış sayılır.
 *   - O başlıkta bölüm var ama yazısı `eski` değilse dokunulmaz (Kemal değiştirmiş;
 *     `metindenSil` gibi karar eskimiş sayılır, listeden düşer).
 *   - Bölümün altında bekleyen öneri varsa silinmez, çakışma.
 */
export function bolumSilPlani(m: Item | null, k: BolumSilKarari) {
  const sonuc = (o: { bolumler?: WikiSection[]; yapildi?: boolean; cakisma?: string | null; ne?: string }) =>
    ({ bolumler: null as WikiSection[] | null, yapildi: false, cakisma: null as string | null, ne: '', ...o });
  if (!m) return sonuc({ cakisma: 'madde bulunamadı ya da aynı adla birden çok var' });
  const baslik = temiz(k.bolum), eski = temiz(k.eski);
  if (!baslik || !eski) return sonuc({ cakisma: 'bölüm başlığı ya da eski metin boş' });
  const hepsi = bolumleriOku(m);
  const ayniBaslik = hepsi.filter(b => kucuk(b.title) === kucuk(baslik));
  const tutan = ayniBaslik.filter(b => temiz(b.content) === eski);
  const kalacak = k.tekrar ? 1 : 0;
  // Yazısı `eski` olan bölüm kalmadıysa (silinmiş ya da Kemal değiştirmiş) yapılmış sayılır; değişen yazı silinmez
  if (tutan.length <= kalacak) return sonuc({ yapildi: true });
  const silinecek = new Set(tutan.slice(kalacak));
  if ([...silinecek].some(b => temiz(b.bekleyenOneri))) return sonuc({ cakisma: `"${baslik}" bölümünün altında bekleyen öneri var` });
  return sonuc({
    bolumler: hepsi.filter(b => !silinecek.has(b)),
    ne: k.tekrar ? `"${baslik}" bölümünün ${silinecek.size} kopyası çıkar, biri kalır` : `"${baslik}" bölümü çıkar`,
  });
}

/**
 * `gercekYer`: madde "Gerçek yer" diye işaretlenir; başlığın yanındaki rozet
 * `kaynakUrl`'yi yeni sekmede açar. Kayıtta `metadata.kaynak = 'gercek'`,
 * `metadata.kaynakAdi`, `metadata.kaynakUrl`. Üçü de aynıysa yapılmış sayılır.
 */
export function gercekYerPlani(m: Item | null, k: GercekYerKarari) {
  const ad = temiz(k.kaynakAdi), url = temiz(k.kaynakUrl);
  const cakisma = !m ? 'madde bulunamadı ya da aynı adla birden çok var'
    : !ad ? 'kaynağın adı boş'
    : !/^https?:\/\//i.test(url) ? 'kaynak bağlantısı https:// ile başlamıyor'
    : null;
  const yapildi = !!m && !cakisma && m.metadata?.kaynak === GERCEK_YER && kaynakAdi(m) === ad && kaynakAdresi(m) === url;
  const metadata = m && !cakisma && !yapildi
    ? { ...(m.metadata || {}), kaynak: GERCEK_YER, kaynakAdi: ad, kaynakUrl: url } as Item['metadata']
    : null;
  const ne = !m || cakisma ? '' : `${gercekYerMi(m) ? 'gerçek yer işareti güncellenir' : '"Gerçek yer" işareti konur'} · kaynak: ${ad}`;
  return { metadata, yapildi, cakisma, ne };
}

/**
 * `alaniBosalt` (künyede "Bilinmiyor" yazan alanı boşaltır): yalnız alanın
 * bugünkü değeri `eski` ise. Değer kayıttaki alanda (`ham`) ya da metindeki
 * "* Alan: değer" satırında durabilir; ikisi de temizlenir. Kayıt birleşerek
 * yazıldığı için alan boş yazıyla ('') boşaltılır; undefined yazılmaz.
 * Alan zaten boşsa yapılmış sayılır; başka değerdeyse karar eskimiştir.
 */
export function alaniBosaltPlani(deger: string, eski: string) {
  const d = temiz(deger);
  if (!d) return { yapildi: true, eskimis: false };
  return { yapildi: false, eskimis: kucuk(d) !== kucuk(eski) };
}

/** Metinden "* Etiket: değer" satırını çıkarır (etiket `eslesir`, değer `deger`); satır yoksa null */
export function kunyeSatiriCikar(notes: string, eslesir: (etiket: string) => boolean, deger: string): string | null {
  const satirlar = (notes || '').split('\n');
  const n = satirlar.findIndex(s => {
    const x = s.match(/^\s*[*\-•]\s*([^:]{2,40}?)\s*:\s*(.+)$/);
    return !!x && eslesir(x[1].trim()) && kucuk(x[2]) === kucuk(deger);
  });
  if (n < 0) return null;
  return satirlar.filter((_, j) => j !== n).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
