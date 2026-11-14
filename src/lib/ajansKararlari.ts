import type { BrandKit, Item, ItemType, WikiSection } from '../types';
import { alanaYaz, bosluklariCikar } from '../components/Bosluklar';
import { base64, base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { bagEkle } from './bagAgi';
import { semaAlanlari, takmaAdlar } from './alanSablonu';
import { getKunyeFields, schemaKeyFor, TYPE_LABELS, WIKI_TYPES } from '../components/wiki/wikiSchema';
import type { BagTuru } from '../utils/relations';
import { bagUygun } from './bagKurallari';
import { vikiGorseliMi } from './maddeGorseli';

/**
 * Ajansın kararlarını uygula (22 Ekim, Kemal: "Ajans kendi uygulasın ama ben
 * neyi uyguladığını liste olarak panoda rapor hâlinde göreyim").
 *
 * Ajans, gönderilen tepsiyi ayıklar ve kararlarını gizli deposunda
 * `kkm/kararlar.json`'a yazar. KKM bu dosyayı okur, hâlâ geçerli olan
 * işleri listeler; Kemal "Uygula"ya basınca işler. Kayıt yalnız bu
 * düğmeyle değişir (KKM kuralı).
 *
 * İşler:
 *   - `sil`: tepsideki öneri silinir (ajans eledi, ilgili ajana taşıdı ya da
 *     soru kutusuna aldı).
 *   - `alanaYaz`: Kemal'in panoda verdiği cevap, sorunun boş alanına yazılır.
 *     Alan bu arada dolduysa üstüne yazılmaz (tepsideki "İşle" gibi).
 *   - 22 Ekim (Kemal'in kanon cevapları dolu alanlara ve bağlara dokunuyordu):
 *     `bagKur` (iki madde arasında bağ; eş bağı iki kayda da yazılır),
 *     `takmaAdEkle`, `metneEkle` (madde metnine, yani künyenin altındaki yazıya, paragraf), `metniDegistir`
 *     (metindeki bir cümle yenisiyle değişir). Bunlar maddeyi adıyla bulur
 *     (başlık ya da takma ad); tam bir eşleşme yoksa uygulanmaz, makbuzda
 *     nedeniyle "atlanan" olur.
 *   - 24 Ekim (kararı verilmiş viki düzeltmeleri: Erdal'ın takma adı, kökeni,
 *     ada kaydındaki paragraf): `takmaAdSil`, `alaniDegistir` (dolu künye
 *     alanı yenisiyle değişir; `eski` verilirse yalnız alan hâlâ o değerdeyse)
 *     ve `metindenSil` (metinden ya da bölümden bir paragraf / cümle çıkar;
 *     boşalan bölüm kalkar).
 *   - 2 Kasım (Kemal: "Uygula marka kartını da işlesin"): `markaKarti` (marka
 *     kartının, yani markanın bible'ının bir alanı: renk paleti, yazı, ton, örnek
 *     işler, kullanım kuralları, slogan). Logo ve moodboard görselleri bununla
 *     yazılmaz. `eski` verilirse alan yalnız hâlâ o değerdeyse değişir.
 *   - 4 Kasım (Kemal: ajans yeni viki maddesi önerebilsin, Kemal tek düğmeyle
 *     açsın): `yeniMadde` (`baslik` maddenin adı, `maddeTur` türü, `metin` madde
 *     metni, isteğe bağlı `baglar`: başka maddelere bağ). Aynı ad ve türde canlı
 *     madde varsa uygulanmış sayılır; aynı adla başka türde madde varsa atlanır.
 *   - 5 Kasım (Kemal viki maddelerine görsel seçti): `gorselEkle` (`deger`
 *     sitedeki görselin yolu, ör. `/viki/dondurmaci-kizlar-tabela.jpg`; görsel
 *     dosyası `public/viki/` altında durur). Maddenin görsel listesinin sonuna
 *     eklenir; aynısı zaten varsa uygulanmış sayılır. Yol `/viki/` ile
 *     başlamıyorsa atlanır.
 *   - 6 Kasım (Kemal: "senaryo kitabı, her bölüm bir bölüm"): `kitapBolumu`
 *     (`kitap` kitabın başlığı, `sira` bölümün sırası, `baslik` bölümün adı,
 *     `metin` bölümün yazısı). Kitap Kitap ekranındaki kitap kaydıdır
 *     (`kitap_proje`); o başlıkta kitap yoksa açılır. Aynı kitapta aynı adlı
 *     bölüm varsa metni ve sırası güncellenir, yoksa yeni bölüm (`kitap_bolum`,
 *     `metadata.bookId` + `chapterIndex`) eklenir. Bölümün adı Kitap ekranı
 *     gibi "Bölüm 3: Ad" diye yazılır; karşılaştırmada "Bölüm 3:" kısmı sayılmaz.
 *
 * Uygulanınca ajansın deposuna `kkm/uygulananlar/` altına bir makbuz yazılır;
 * ajansın akşam ve sabah raporu neyin işlendiğini oradan listeler.
 */

export const KARARLAR_YOLU = 'kkm/kararlar.json';
export const MAKBUZ_KLASORU = 'kkm/uygulananlar';

export type KararIslemi =
  | { kimlik: string; tur: 'sil'; id: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'alanaYaz'; anahtar: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'bagKur'; kaynak: string; hedef: string; bag: BagTuru; ikiYonlu?: boolean; baslik: string; neden: string }
  | { kimlik: string; tur: 'takmaAdEkle'; madde: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'metneEkle'; madde: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'gorselEkle'; madde: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'metniDegistir'; madde: string; eski: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'takmaAdSil'; madde: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'alaniDegistir'; madde: string; alan: string; eski?: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'metindenSil'; madde: string; eski: string; baslik: string; neden: string }
  /** 13 Kasım: künye ekranında olmayan eski bir alan (ör. merkezi, estDate, profile.konum); deger '' alanı boşaltır.
   *  Yalnız var olan yazı alanı değişir, yeni alan açılmaz; eski verilirse önce o değer aranır */
  | { kimlik: string; tur: 'eskiAlan'; madde: string; alan: string; eski?: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'markaKarti'; marka: string; alan: MarkaKartiAlani; eski?: string | string[]; deger: string | string[]; baslik: string; neden: string }
  | { kimlik: string; tur: 'yeniMadde'; baslik: string; maddeTur: string; metin?: string; baglar?: YeniMaddeBagi[]; neden?: string }
  | { kimlik: string; tur: 'kitapBolumu'; kitap: string; sira: number; baslik: string; metin: string; neden?: string };

type KitapBolumuIslemi = Extract<KararIslemi, { tur: 'kitapBolumu' }>;

/** "Bölüm 3: Devir teslim" → "Devir teslim" (Kitap ekranı bölüme sırasını önüne yazar) */
const bolumAdi = (t: string) => (t || '').replace(/^\s*bölüm\s+\d+\s*[:.\-–—]\s*/i, '').trim();
/** Bölümün kayıttaki başlığı */
export const bolumBasligi = (sira: number, baslik: string) => `Bölüm ${sira}: ${bolumAdi(baslik)}`;

/** Aynı başlıklı canlı kitaplar (Kitap ekranının listesiyle aynı süzgeç) */
const kitaplar = (items: Item[], ad: string) =>
  items.filter(i => i.area === 'kitap' && i.type === 'kitap_proje' && !i.archived && kucuk(i.title) === kucuk(ad));
/** Kitaptaki aynı adlı canlı bölümler */
const bolumler = (items: Item[], kitapId: string, ad: string) =>
  items.filter(i => i.area === 'kitap' && i.type === 'kitap_bolum' && !i.archived && i.metadata?.bookId === kitapId
    && kucuk(bolumAdi(i.title)) === kucuk(bolumAdi(ad)));

const kitapBolumuGecerli = (i: KitapBolumuIslemi) =>
  !!i.kitap?.trim() && !!bolumAdi(i.baslik || '') && typeof i.metin === 'string' && !!i.metin.trim()
  && typeof i.sira === 'number' && Number.isInteger(i.sira) && i.sira > 0;

/** Ne değişecek (saf iş): kitap açılacak mı, bölüm yeni mi, güncellenecek mi */
export function kitapBolumuPlani(items: Item[], i: KitapBolumuIslemi) {
  const k = kitaplar(items, i.kitap);
  const kitap = k.length === 1 ? k[0] : null;
  const b = kitap ? bolumler(items, kitap.id, i.baslik) : [];
  return { kitap, cokKitap: k.length > 1, bolum: b.length === 1 ? b[0] : null, cokBolum: b.length > 1 };
}

/** Önizleme satırı: ne değişecek ve metnin başı (uzun senaryo kısaltılır) */
export function kitapBolumuOnizleme(items: Item[], i: KitapBolumuIslemi, sinir = 180): string {
  const p = kitapBolumuPlani(items, i);
  const kitap = p.cokKitap ? `"${i.kitap}" adıyla birden çok kitap var, atlanır`
    : p.kitap ? `"${i.kitap}" kitabına` : `"${i.kitap}" kitabı yeni açılır;`;
  const bolum = p.cokBolum ? 'aynı adla birden çok bölüm var, atlanır'
    : p.bolum ? `${i.sira}. bölümün metni güncellenir` : `${i.sira}. bölüm eklenir`;
  const m = (i.metin || '').replace(/\s+/g, ' ').trim();
  const kisa = m.length > sinir ? `${m.slice(0, sinir).trimEnd()}… (${m.length} harf)` : m;
  return `${kitap} ${bolum} → ${kisa}`;
}

/** `yeniMadde`nin bağı: hedef maddenin kimliği ya da adı; `ikiYonlu` ise bağ hedefe de yazılır */
export interface YeniMaddeBagi { hedef: string; bag: BagTuru; ikiYonlu?: boolean }

/** `maddeTur` viki türü mü (kimliği ya da ekrandaki adı); değilse null */
export function maddeTuru(t: string): ItemType | null {
  const a = kucuk(t || '');
  return WIKI_TYPES.find(x => kucuk(x) === a || kucuk(TYPE_LABELS[x] || '') === a) || null;
}

/** Aynı adla canlı viki maddeleri */
const ayniAdli = (items: Item[], ad: string) =>
  items.filter(i => !i.archived && !i.isProposal && WIKI_TYPES.includes(i.type) && kucuk(i.title) === kucuk(ad));

/** Yeni maddenin kaydı (saf iş): bağlar çözülür, uymayan ya da bulunamayan bağ `atlanan`a */
export function yeniMaddeKaydi(items: Item[], islem: Extract<KararIslemi, { tur: 'yeniMadde' }>, id: string) {
  const tur = maddeTuru(islem.maddeTur) as ItemType;
  const relations: Array<{ targetId: string; type: BagTuru }> = [];
  const tersBaglar: Array<{ hedef: Item; bag: BagTuru }> = [];
  const atlanan: string[] = [];
  for (const b of Array.isArray(islem.baglar) ? islem.baglar : []) {
    const h = b && typeof b.hedef === 'string' ? maddeBul(items, b.hedef) : null;
    if (!h) { atlanan.push(`bağ kurulmadı: ${b?.hedef || '?'} bulunamadı ya da aynı adla birden çok var`); continue; }
    if (!bagUygun(b.bag, tur, h.type) || (b.ikiYonlu && !bagUygun(b.bag, h.type, tur))) { atlanan.push(`bağ kurulmadı: "${b.bag}" bu iki türe uymuyor (${h.title})`); continue; }
    if (!relations.some(r => r.targetId === h.id && r.type === b.bag)) relations.push({ targetId: h.id, type: b.bag });
    if (b.ikiYonlu) tersBaglar.push({ hedef: h, bag: b.bag });
  }
  const yeni: Omit<Item, 'createdAt' | 'updatedAt' | 'userId'> & { id: string } = {
    id, title: islem.baslik.trim(), area: 'duzada', type: tur, status: 'Fikir', priority: 'orta',
    tags: [], links: [], notes: (islem.metin || '').trim(), images: [], isProposal: false, archived: false,
    metadata: relations.length ? { relations } : {}
  };
  return { yeni, tersBaglar, atlanan };
}

/** `markaKarti` ile yazılabilen kart alanları; listeler dizi, ötekiler metin */
export const MARKA_KARTI_ALANLARI = {
  colorPalette: 'Renk paleti', selectedFont: 'Yazı', voiceTone: 'Ton', exemplaryWorks: 'Örnek işler',
  usageRulesDo: 'Yap', usageRulesDont: 'Yapma', slogan: 'Slogan',
} as const;
export type MarkaKartiAlani = keyof typeof MARKA_KARTI_ALANLARI;
const LISTE_ALANLARI: MarkaKartiAlani[] = ['colorPalette', 'exemplaryWorks', 'usageRulesDo', 'usageRulesDont'];

/** Değeri alanın biçimine çevirir (liste alanına tek metin gelirse satırlara böler); geçersizse null */
function kartDegeri(alan: string, deger: unknown): string | string[] | null {
  if (!(alan in MARKA_KARTI_ALANLARI)) return null;
  if (LISTE_ALANLARI.includes(alan as MarkaKartiAlani)) {
    const l = Array.isArray(deger) ? deger : String(deger ?? '').split('\n');
    const t = l.map(x => String(x).trim()).filter(Boolean);
    return t.length ? t : null;
  }
  const t = Array.isArray(deger) ? deger.join(' ').trim() : String(deger ?? '').trim();
  return t || null;
}
const kartAyni = (a: unknown, b: unknown) =>
  JSON.stringify(Array.isArray(a) ? a.map(x => kucuk(String(x))) : kucuk(String(a ?? '')))
  === JSON.stringify(Array.isArray(b) ? b.map(x => kucuk(String(x))) : kucuk(String(b ?? '')));
const kartAlani = (m: Item, alan: string): unknown => (m.metadata?.brandKit as unknown as Record<string, unknown> | undefined)?.[alan];
const bosMu = (v: unknown) => (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim());

/** `alaniDegistir` için maddenin künye alanı (kimliği ya da adıyla); metin ve başlık değil */
function kunyeAlani(m: Item, alan: string) {
  const a = kucuk(alan);
  const f = semaAlanlari(schemaKeyFor(m.type) || '').find(x => (kucuk(x.id) === a || kucuk(x.label) === a) && x.fieldPath.startsWith('metadata.'));
  if (!f) return null;
  // 14 Kasım: ekrandaki değer değil kayıttaki ham değer (Mahalle ekranda "Çiftlik Mahallesi", kayıtta "çiftlik";
  // karşılaştırma ekrandakine bakınca karar uygulandıktan sonra da listede dönüp duruyordu)
  const ham = f.fieldPath.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m as unknown);
  const deger = typeof ham === 'string' || typeof ham === 'number'
    ? String(ham)
    : getKunyeFields(m, { includeEmpty: true, includeSecrets: true }).find(x => x.id === f.id)?.value || '';
  return { yol: f.fieldPath, deger };
}

const bolumlerOf = (m: Item) => ((m.metadata?.wikiSections as Array<{ content?: string }> | undefined) || []);
/** Metin ya da bölümlerden birinde geçiyor mu */
const metindeVar = (m: Item, parca: string) => (m.notes || '').includes(parca) || bolumlerOf(m).some(b => String(b.content || '').includes(parca));
/** Parçayı çıkarır, kalan boş satırları toplar */
const parcaCikar = (metin: string, parca: string) => metin.replace(parca, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Künye ekranında olmayan alanlar: korunanlar dışında, metadata içinde nokta yolu (profile.konum) */
const KORUNAN_ALANLAR = new Set(['relations', 'wikiSections', 'brandKit', 'aliases', 'eskiAdlar', 'images', 'depo']);
function eskiAlanDegeri(m: Item, yol: string): string | null {
  const p = yol.split('.');
  if (!p.length || KORUNAN_ALANLAR.has(p[0])) return null;
  let v: unknown = m.metadata;
  for (const k of p) { if (!v || typeof v !== 'object') return null; v = (v as Record<string, unknown>)[k]; }
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}
function eskiAlanaYaz(m: Item, yol: string, deger: string): Item {
  const p = yol.split('.');
  const kopya = (o: unknown) => ({ ...((o && typeof o === 'object') ? o as Record<string, unknown> : {}) });
  const md = kopya(m.metadata);
  let ic = md;
  for (const k of p.slice(0, -1)) { ic[k] = kopya(ic[k]); ic = ic[k] as Record<string, unknown>; }
  ic[p[p.length - 1]] = deger;
  return { ...m, metadata: md as Item['metadata'] };
}

const kucuk = (s: string) => (s || '').trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

/**
 * Maddeyi bulur: önce kimliğiyle (2 Kasım: aynı adla iki kayıt olunca, ör.
 * Dondurmacı Kızlar mekânı ve markası, ajans kimlik yazar), sonra başlık,
 * sonra takma ad; tek bir eşleşme yoksa null
 */
export function maddeBul(items: Item[], ad: string): Item | null {
  const a = kucuk(ad);
  const canli = items.filter(i => !i.archived && !i.isProposal && i.type !== 'aday');
  const kimlikle = canli.find(i => i.id === ad.trim());
  if (kimlikle) return kimlikle;
  const bas = canli.filter(i => kucuk(i.title) === a);
  if (bas.length) return bas.length === 1 ? bas[0] : null;
  const tak = canli.filter(i => takmaAdlar(i).some(t => kucuk(t) === a));
  return tak.length === 1 ? tak[0] : null;
}

const bagVar = (k: Item, hedefId: string, bag: string) =>
  ((k.metadata?.relations as Array<Record<string, unknown>> | undefined) || []).some(r => r?.targetId === hedefId && r.type === bag && !r.isProposal);

/** Bu iş zaten uygulanmış mı (madde bulunamazsa hayır: denenir, makbuza neden yazılır) */
function yapilmis(items: Item[], i: KararIslemi): boolean {
  if (i.tur === 'bagKur') {
    const k = maddeBul(items, i.kaynak), h = maddeBul(items, i.hedef);
    return !!k && !!h && bagVar(k, h.id, i.bag) && (!i.ikiYonlu || bagVar(h, k.id, i.bag));
  }
  if (i.tur === 'takmaAdEkle') {
    const m = maddeBul(items, i.madde);
    return !!m && (kucuk(m.title) === kucuk(i.deger) || takmaAdlar(m).some(t => kucuk(t) === kucuk(i.deger)));
  }
  if (i.tur === 'metneEkle') { const m = maddeBul(items, i.madde); return !!m && (m.notes || '').includes(i.deger.trim()); }
  if (i.tur === 'gorselEkle') { const m = maddeBul(items, i.madde); return !!m && (m.images || []).includes(i.deger.trim()); }
  // 13 Kasım: metin ya da bölümlerden birinde (Stadyum Mahallesi)
  if (i.tur === 'metniDegistir') { const m = maddeBul(items, i.madde); return !!m && !metindeVar(m, i.eski) && metindeVar(m, i.deger.trim()); }
  if (i.tur === 'eskiAlan') { const m = maddeBul(items, i.madde); const v = m && eskiAlanDegeri(m, i.alan); return v !== null && v !== undefined && kucuk(v) === kucuk(i.deger); }
  if (i.tur === 'takmaAdSil') { const m = maddeBul(items, i.madde); return !!m && !takmaAdlar(m).some(t => kucuk(t) === kucuk(i.deger)); }
  if (i.tur === 'alaniDegistir') { const m = maddeBul(items, i.madde); const a = m && kunyeAlani(m, i.alan); return !!a && kucuk(a.deger) === kucuk(i.deger); }
  if (i.tur === 'metindenSil') { const m = maddeBul(items, i.madde); return !!m && !!i.eski?.trim() && !metindeVar(m, i.eski); }
  if (i.tur === 'markaKarti') { const m = maddeBul(items, i.marka); const d = kartDegeri(i.alan, i.deger); return !!m && d !== null && kartAyni(kartAlani(m, i.alan), d); }
  if (i.tur === 'yeniMadde') { const t = maddeTuru(i.maddeTur); return !!t && ayniAdli(items, i.baslik).some(m => m.type === t); }
  if (i.tur === 'kitapBolumu') {
    const { bolum } = kitapBolumuPlani(items, i);
    return !!bolum && (bolum.notes || '').trim() === (i.metin || '').trim() && bolum.metadata?.chapterIndex === i.sira;
  }
  return false;
}

export interface KararDosyasi { olusturuldu: string; islemler: KararIslemi[] }

/** Ajansın kararlarını gizli depodan okur; dosya yoksa null */
export async function kararlariOku(anahtar: string): Promise<KararDosyasi | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${KARARLAR_YOLU}`);
    const k = JSON.parse(base64Coz(d.content)) as Partial<KararDosyasi>;
    return { olusturuldu: k.olusturuldu || '', islemler: Array.isArray(k.islemler) ? k.islemler : [] };
  } catch (e) {
    if (e instanceof Error && /yazma izni yok/.test(e.message)) {
      // 404 iki şey olabilir: dosya yok ya da anahtar depoyu hiç göremiyor (2 Kasım'da
      // ekran "henüz karar yok" diyordu). Depoyu görebiliyorsa dosya gerçekten yok.
      try { await github(anahtar, `/repos/${AJANS_DEPOSU}`); }
      catch { throw new Error('anahtar Kems-Ajans deposunu göremiyor; GitHub\'da anahtarın ayarlarına bu depoyu ekle'); }
      return null;
    }
    throw e;
  }
}

/** Bugün hâlâ yapılabilecek işler (ikinci basışta boş döner) */
export function gecerliIslemler(items: Item[], islemler: KararIslemi[]): KararIslemi[] {
  const kimlik = new Map(items.map(i => [i.id, i]));
  const bosluklar = new Map(bosluklariCikar(items).map(b => [b.anahtar, b]));
  return islemler.filter(i => {
    if (i.tur === 'sil') { const k = kimlik.get(i.id); return !!k && k.type === 'aday' && !k.archived; }
    if (i.tur === 'alanaYaz') return !!i.deger?.trim() && bosluklar.has(i.anahtar);
    // Alan beklenen eski değerde değilse karar eskimiştir; listede durmaz
    if (i.tur === 'alaniDegistir' && i.eski !== undefined) {
      const m = maddeBul(items, i.madde), al = m && kunyeAlani(m, i.alan);
      if (al && kucuk(al.deger) !== kucuk(i.eski) && kucuk(al.deger) !== kucuk(i.deger)) return false;
    }
    // Kart alanı beklenen eski değerde değilse (ya da eski verilmeden doluysa değil) karar eskimiştir
    if (i.tur === 'markaKarti' && i.eski !== undefined) {
      const m = maddeBul(items, i.marka), v = m ? kartAlani(m, i.alan) : undefined;
      if (m && !kartAyni(v, kartDegeri(i.alan, i.eski) ?? '') && !kartAyni(v, kartDegeri(i.alan, i.deger)) && !(bosMu(v) && bosMu(i.eski))) return false;
    }
    if (i.tur === 'markaKarti') return !yapilmis(items, i);
    // Adı ya da türü geçersiz yeni madde listede durmaz
    if (i.tur === 'yeniMadde') return !!i.baslik?.trim() && !!maddeTuru(i.maddeTur) && !yapilmis(items, i);
    // Kitabı, adı ya da metni boş bölüm listede durmaz
    if (i.tur === 'kitapBolumu') return kitapBolumuGecerli(i) && !yapilmis(items, i);
    // Sitedeki viki klasöründe olmayan yol listede durmaz
    if (i.tur === 'gorselEkle') return vikiGorseliMi(i.deger?.trim()) && !yapilmis(items, i);
    if (i.tur === 'eskiAlan') return typeof i.alan === 'string' && !!i.alan.trim() && !KORUNAN_ALANLAR.has(i.alan.split('.')[0]) && typeof i.deger === 'string' && !yapilmis(items, i);
    if (i.tur === 'bagKur' || i.tur === 'takmaAdEkle' || i.tur === 'metneEkle' || i.tur === 'metniDegistir'
      || i.tur === 'takmaAdSil' || i.tur === 'alaniDegistir' || i.tur === 'metindenSil') return !yapilmis(items, i);
    return false;
  });
}

export interface Uygulama { uygulanan: KararIslemi[]; atlanan: Array<{ islem: KararIslemi; neden: string }> }

/**
 * İşleri sırayla uygular. Aynı maddeye birden çok cevap yazılabilsin diye
 * her yazıştan sonra maddenin son hâli kullanılır.
 */
export async function kararlariUygula(
  items: Item[], islemler: KararIslemi[],
  yaz: {
    guncelle: (i: Item) => Promise<void>; sil: (id: string) => Promise<void>;
    /** `yeniMadde` ve `kitapBolumu` için; verilmezse yeni madde ve yeni kitap / bölüm atlanır */
    ekle?: (i: Omit<Item, 'createdAt' | 'updatedAt' | 'userId'> & { id: string }) => Promise<void>;
  },
  ilerleme?: (n: number) => void
): Promise<Uygulama> {
  const guncel = new Map(items.map(i => [i.id, i]));
  const sonuc: Uygulama = { uygulanan: [], atlanan: [] };
  let n = 0;
  for (const islem of islemler) {
    try {
      if (islem.tur === 'sil') {
        const k = guncel.get(islem.id);
        if (!k || k.type !== 'aday' || k.archived) { sonuc.atlanan.push({ islem, neden: 'öneri tepside yok' }); continue; }
        await yaz.sil(islem.id);
        guncel.delete(islem.id);
      } else if (islem.tur === 'bagKur') {
        const liste = [...guncel.values()];
        const k = maddeBul(liste, islem.kaynak), h = maddeBul(liste, islem.hedef);
        if (!k || !h) { sonuc.atlanan.push({ islem, neden: `madde bulunamadı ya da aynı adla birden çok var (${!k ? islem.kaynak : islem.hedef})` }); continue; }
        const k2 = bagEkle(k, h.id, islem.bag);
        if (k2) { await yaz.guncelle(k2); guncel.set(k2.id, k2); }
        if (islem.ikiYonlu) {
          const h2 = bagEkle(guncel.get(h.id) || h, k.id, islem.bag);
          if (h2) { await yaz.guncelle(h2); guncel.set(h2.id, h2); }
        }
      } else if (islem.tur === 'yeniMadde') {
        if (!yaz.ekle) { sonuc.atlanan.push({ islem, neden: 'bu ekrandan yeni madde açılamıyor; Onay bekleyenler\'den uygula' }); continue; }
        const liste = [...guncel.values()];
        if (!islem.baslik?.trim() || !maddeTuru(islem.maddeTur)) { sonuc.atlanan.push({ islem, neden: `ad boş ya da "${islem.maddeTur}" viki türü değil` }); continue; }
        const ayni = ayniAdli(liste, islem.baslik);
        if (ayni.length) { sonuc.atlanan.push({ islem, neden: `aynı adla madde zaten var (${ayni.map(m => TYPE_LABELS[m.type] || m.type).join(', ')})` }); continue; }
        const id = `madde_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { yeni, tersBaglar, atlanan } = yeniMaddeKaydi(liste, islem, id);
        await yaz.ekle(yeni);
        guncel.set(id, { ...yeni, createdAt: Date.now(), updatedAt: Date.now(), userId: '' } as Item);
        for (const t of tersBaglar) {
          const h2 = bagEkle(guncel.get(t.hedef.id) || t.hedef, id, t.bag);
          if (h2) { await yaz.guncelle(h2); guncel.set(h2.id, h2); }
        }
        for (const neden of atlanan) sonuc.atlanan.push({ islem, neden });
      } else if (islem.tur === 'kitapBolumu') {
        if (!kitapBolumuGecerli(islem)) { sonuc.atlanan.push({ islem, neden: 'kitap, bölüm adı, metin ya da sıra eksik' }); continue; }
        const liste = [...guncel.values()];
        const p = kitapBolumuPlani(liste, islem);
        if (p.cokKitap) { sonuc.atlanan.push({ islem, neden: `"${islem.kitap}" adıyla birden çok kitap var` }); continue; }
        if (p.cokBolum) { sonuc.atlanan.push({ islem, neden: `kitapta "${bolumAdi(islem.baslik)}" adıyla birden çok bölüm var` }); continue; }
        if ((!p.kitap || !p.bolum) && !yaz.ekle) { sonuc.atlanan.push({ islem, neden: 'bu ekrandan kitap ya da bölüm açılamıyor; Onay bekleyenler\'den uygula' }); continue; }
        const metin = islem.metin.trim();
        const baslik = bolumBasligi(islem.sira, islem.baslik);
        let kitap = p.kitap;
        if (!kitap) {
          const id = `book_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          // Kitap ekranının "Yeni kitap" kaydıyla aynı biçim; notu boş (kurgu metni yazılmaz)
          const yeni = {
            id, title: islem.kitap.trim(), area: 'kitap' as const, type: 'kitap_proje' as const, status: 'Planlandı', priority: 'orta' as const,
            tags: ['kitap-projesi'], links: [], notes: '', images: [], isProposal: false, archived: false, metadata: {},
          };
          await yaz.ekle!(yeni);
          kitap = { ...yeni, createdAt: Date.now(), updatedAt: Date.now(), userId: '' } as Item;
          guncel.set(id, kitap);
        }
        if (p.bolum) {
          const yeni: Item = { ...p.bolum, title: baslik, notes: metin, metadata: { ...(p.bolum.metadata || {}), bookId: kitap.id, chapterIndex: islem.sira }, updatedAt: Date.now() };
          await yaz.guncelle(yeni);
          guncel.set(yeni.id, yeni);
        } else {
          const id = `chapter_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          // Kitap ekranının "Yeni bölüm" kaydıyla aynı biçim
          const yeni = {
            id, title: baslik, area: 'kitap' as const, type: 'kitap_bolum' as const, status: 'taslak', priority: 'orta' as const,
            tags: ['bölüm', 'kitap-bölümü'], links: [kitap.id], notes: metin, images: [], isProposal: false, archived: false,
            metadata: { bookId: kitap.id, chapterIndex: islem.sira, chapterTodos: [] },
          };
          await yaz.ekle!(yeni);
          guncel.set(id, { ...yeni, createdAt: Date.now(), updatedAt: Date.now(), userId: '' } as Item);
        }
      } else if (islem.tur === 'markaKarti') {
        const m = maddeBul([...guncel.values()], islem.marka);
        if (!m) { sonuc.atlanan.push({ islem, neden: `marka bulunamadı ya da aynı adla birden çok var (${islem.marka})` }); continue; }
        const d = kartDegeri(islem.alan, islem.deger);
        if (d === null) { sonuc.atlanan.push({ islem, neden: `"${islem.alan}" kartta yazılabilen bir alan değil ya da değer boş` }); continue; }
        const simdi = kartAlani(m, islem.alan);
        if (islem.eski !== undefined && !kartAyni(simdi, kartDegeri(islem.alan, islem.eski) ?? '') && !(bosMu(simdi) && bosMu(islem.eski))) {
          sonuc.atlanan.push({ islem, neden: 'kartta bu alan bu arada değişmiş' }); continue;
        }
        // Kart hiç açılmamışsa ekrandaki boş kartın alanlarıyla başlar
        const bk = { selectedLogo: '', ideaLogos: [], colorPalette: [], exemplaryWorks: [], ...(m.metadata?.brandKit || {}), [islem.alan]: d } as BrandKit;
        const yeni: Item = { ...m, metadata: { ...(m.metadata || {}), brandKit: bk }, updatedAt: Date.now() };
        await yaz.guncelle(yeni);
        guncel.set(yeni.id, yeni);
      } else if (islem.tur === 'takmaAdSil' || islem.tur === 'alaniDegistir' || islem.tur === 'metindenSil') {
        const m = maddeBul([...guncel.values()], islem.madde);
        if (!m) { sonuc.atlanan.push({ islem, neden: `madde bulunamadı ya da aynı adla birden çok var (${islem.madde})` }); continue; }
        let yeni: Item;
        if (islem.tur === 'takmaAdSil') {
          const at = (l: unknown) => (Array.isArray(l) ? l.filter(t => typeof t === 'string' && kucuk(t) !== kucuk(islem.deger)) : l);
          if (!takmaAdlar(m).some(t => kucuk(t) === kucuk(islem.deger))) { sonuc.atlanan.push({ islem, neden: 'takma ad maddede yok' }); continue; }
          const md = { ...(m.metadata || {}) } as Record<string, unknown>;
          if (Array.isArray(md.aliases)) md.aliases = at(md.aliases);
          if (Array.isArray(md.eskiAdlar)) md.eskiAdlar = at(md.eskiAdlar);
          yeni = { ...m, metadata: md as Item['metadata'] };
        } else if (islem.tur === 'alaniDegistir') {
          const a = kunyeAlani(m, islem.alan);
          if (!a) { sonuc.atlanan.push({ islem, neden: `"${islem.alan}" bu türün künyesinde yok` }); continue; }
          if (islem.eski !== undefined && kucuk(a.deger) !== kucuk(islem.eski)) { sonuc.atlanan.push({ islem, neden: `alan bu arada değişmiş (şimdi: ${a.deger || 'boş'})` }); continue; }
          yeni = alanaYaz(m, a.yol, islem.deger.trim());
        } else {
          if (!islem.eski?.trim() || !metindeVar(m, islem.eski)) { sonuc.atlanan.push({ islem, neden: 'silinecek parça metinde yok' }); continue; }
          if ((m.notes || '').includes(islem.eski)) yeni = { ...m, notes: parcaCikar(m.notes || '', islem.eski) };
          else {
            const bolumler = (m.metadata?.wikiSections as WikiSection[] | undefined) || [];
            const n = bolumler.findIndex(b => String(b.content || '').includes(islem.eski));
            const kalan = parcaCikar(String(bolumler[n].content || ''), islem.eski);
            const liste = kalan ? bolumler.map((b, k) => (k === n ? { ...b, content: kalan } : b)) : bolumler.filter((_, k) => k !== n);
            yeni = { ...m, metadata: { ...(m.metadata || {}), wikiSections: liste } as Item['metadata'] };
          }
        }
        yeni = { ...yeni, updatedAt: Date.now() };
        await yaz.guncelle(yeni);
        guncel.set(yeni.id, yeni);
      } else if (islem.tur === 'eskiAlan') {
        const m = maddeBul([...guncel.values()], islem.madde);
        if (!m) { sonuc.atlanan.push({ islem, neden: `madde bulunamadı ya da aynı adla birden çok var (${islem.madde})` }); continue; }
        const v = eskiAlanDegeri(m, islem.alan);
        if (v === null) { sonuc.atlanan.push({ islem, neden: `"${islem.alan}" bu maddede yazı alanı olarak yok` }); continue; }
        if (islem.eski !== undefined && kucuk(v) !== kucuk(islem.eski)) { sonuc.atlanan.push({ islem, neden: `alan bu arada değişmiş (şimdi: ${v || 'boş'})` }); continue; }
        const yeni = { ...eskiAlanaYaz(m, islem.alan, islem.deger.trim()), updatedAt: Date.now() };
        await yaz.guncelle(yeni);
        guncel.set(yeni.id, yeni);
      } else if (islem.tur === 'gorselEkle') {
        const m = maddeBul([...guncel.values()], islem.madde);
        if (!m) { sonuc.atlanan.push({ islem, neden: `madde bulunamadı ya da aynı adla birden çok var (${islem.madde})` }); continue; }
        const yol = (islem.deger || '').trim();
        if (!vikiGorseliMi(yol)) { sonuc.atlanan.push({ islem, neden: `görsel yolu /viki/ ile başlamıyor (${yol || 'boş'})` }); continue; }
        const eski = m.images || [];
        // Aynı görsel zaten varsa ikinci kez eklenmez
        if (!eski.includes(yol)) {
          const yeni: Item = { ...m, images: [...eski, yol], updatedAt: Date.now() };
          await yaz.guncelle(yeni);
          guncel.set(yeni.id, yeni);
        }
      } else if (islem.tur === 'takmaAdEkle' || islem.tur === 'metneEkle' || islem.tur === 'metniDegistir') {
        const m = maddeBul([...guncel.values()], islem.madde);
        if (!m) { sonuc.atlanan.push({ islem, neden: `madde bulunamadı ya da aynı adla birden çok var (${islem.madde})` }); continue; }
        const metin = m.notes || '';
        let yeni: Item;
        if (islem.tur === 'takmaAdEkle') {
          const eski = Array.isArray(m.metadata?.aliases) ? (m.metadata!.aliases as string[]) : [];
          yeni = { ...m, metadata: { ...(m.metadata || {}), aliases: [...eski, islem.deger.trim()] } as Item['metadata'] };
        } else if (islem.tur === 'metneEkle') {
          yeni = { ...m, notes: metin.trim() ? `${metin.trimEnd()}\n\n${islem.deger.trim()}` : islem.deger.trim() };
        } else {
          if (!metindeVar(m, islem.eski)) { sonuc.atlanan.push({ islem, neden: 'değişecek cümle metinde yok' }); continue; }
          // Cümle metinde birden çok kez geçiyorsa hepsi değişir; yoksa karar her uygulamada geri gelir (5 Kasım, Fener Burnu).
          // 13 Kasım: bölümlerde de (Stadyum Mahallesi'nin Tarihçe ve Kamu binaları bölümleri)
          const degis = (t: string) => t.split(islem.eski).join(islem.deger.trim());
          const bolumler = (m.metadata?.wikiSections as WikiSection[] | undefined) || [];
          yeni = {
            ...m, notes: degis(metin),
            ...(bolumler.some(b => String(b.content || '').includes(islem.eski))
              ? { metadata: { ...(m.metadata || {}), wikiSections: bolumler.map(b => ({ ...b, content: degis(String(b.content || '')) })) } as Item['metadata'] }
              : {}),
          };
        }
        yeni = { ...yeni, updatedAt: Date.now() };
        await yaz.guncelle(yeni);
        guncel.set(yeni.id, yeni);
      } else {
        const b = bosluklariCikar([...guncel.values()]).find(x => x.anahtar === islem.anahtar);
        if (!b) { sonuc.atlanan.push({ islem, neden: 'alan bu arada dolmuş ya da madde yok' }); continue; }
        const yeni = { ...(b.yaz ? b.yaz(b.item, islem.deger.trim()) : alanaYaz(b.item, b.yol, islem.deger.trim())), updatedAt: Date.now() };
        await yaz.guncelle(yeni);
        guncel.set(yeni.id, yeni);
      }
      sonuc.uygulanan.push(islem);
    } catch (e) {
      sonuc.atlanan.push({ islem, neden: e instanceof Error ? e.message : String(e) });
    }
    ilerleme?.(++n);
  }
  return sonuc;
}

/** Makbuzu ajansın deposuna yazar; adresini döner */
export async function makbuzYaz(anahtar: string, sonuc: Uygulama, zaman = new Date()): Promise<string> {
  const bilgi = await github<{ default_branch: string; private: boolean }>(anahtar, `/repos/${AJANS_DEPOSU}`);
  if (!bilgi.private) throw new Error('Kems-Ajans deposu herkese açık; makbuz yazılmadı.');
  const iki = (x: number) => String(x).padStart(2, '0');
  // 14 Kasım: aynı dakikada iki kez basılınca makbuz yazılamıyordu (aynı ad, GitHub 422); saniye de adda
  const ad = `${iki(zaman.getDate())}-${iki(zaman.getMonth() + 1)}-${zaman.getFullYear()}-${iki(zaman.getHours())}${iki(zaman.getMinutes())}${iki(zaman.getSeconds())}`;
  const govde = {
    _aciklama: "Kemal KKM'de 'Ajansın kararlarını uygula'ya bastı; KKM'de işlenenler ve atlananlar.",
    uygulandi: zaman.toISOString(),
    uygulanan: sonuc.uygulanan,
    atlanan: sonuc.atlanan,
  };
  const r = await github<{ content: { html_url: string } }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${MAKBUZ_KLASORU}/${ad}.json`, {
    method: 'PUT',
    govde: {
      message: `KKM: ajansın ${sonuc.uygulanan.length} kararı uygulandı`,
      content: base64(`${JSON.stringify(govde, null, 2)}\n`), branch: bilgi.default_branch,
    },
  });
  return r.content.html_url;
}
