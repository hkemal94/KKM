import type { Item, WikiSection } from '../types';
import { alanaYaz, bosluklariCikar } from '../components/Bosluklar';
import { base64, base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { bagEkle } from './bagAgi';
import { semaAlanlari, takmaAdlar } from './alanSablonu';
import { getKunyeFields, schemaKeyFor } from '../components/wiki/wikiSchema';
import type { BagTuru } from '../utils/relations';

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
 *   - `sil`: tepsideki öneri silinir (ajans eledi, departmana taşıdı ya da
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
  | { kimlik: string; tur: 'metniDegistir'; madde: string; eski: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'takmaAdSil'; madde: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'alaniDegistir'; madde: string; alan: string; eski?: string; deger: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'metindenSil'; madde: string; eski: string; baslik: string; neden: string };

/** `alaniDegistir` için maddenin künye alanı (kimliği ya da adıyla); metin ve başlık değil */
function kunyeAlani(m: Item, alan: string) {
  const a = kucuk(alan);
  const f = semaAlanlari(schemaKeyFor(m.type) || '').find(x => (kucuk(x.id) === a || kucuk(x.label) === a) && x.fieldPath.startsWith('metadata.'));
  if (!f) return null;
  const deger = getKunyeFields(m, { includeEmpty: true, includeSecrets: true }).find(x => x.id === f.id)?.value || '';
  return { yol: f.fieldPath, deger };
}

const bolumlerOf = (m: Item) => ((m.metadata?.wikiSections as Array<{ content?: string }> | undefined) || []);
/** Metin ya da bölümlerden birinde geçiyor mu */
const metindeVar = (m: Item, parca: string) => (m.notes || '').includes(parca) || bolumlerOf(m).some(b => String(b.content || '').includes(parca));
/** Parçayı çıkarır, kalan boş satırları toplar */
const parcaCikar = (metin: string, parca: string) => metin.replace(parca, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const kucuk = (s: string) => (s || '').trim().replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');

/** Maddeyi adıyla bulur (önce başlık, sonra takma ad); tek bir eşleşme yoksa null */
export function maddeBul(items: Item[], ad: string): Item | null {
  const a = kucuk(ad);
  const canli = items.filter(i => !i.archived && !i.isProposal && i.type !== 'aday');
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
  if (i.tur === 'metniDegistir') { const m = maddeBul(items, i.madde); return !!m && !(m.notes || '').includes(i.eski) && (m.notes || '').includes(i.deger.trim()); }
  if (i.tur === 'takmaAdSil') { const m = maddeBul(items, i.madde); return !!m && !takmaAdlar(m).some(t => kucuk(t) === kucuk(i.deger)); }
  if (i.tur === 'alaniDegistir') { const m = maddeBul(items, i.madde); const a = m && kunyeAlani(m, i.alan); return !!a && kucuk(a.deger) === kucuk(i.deger); }
  if (i.tur === 'metindenSil') { const m = maddeBul(items, i.madde); return !!m && !!i.eski?.trim() && !metindeVar(m, i.eski); }
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
    if (e instanceof Error && /yazma izni yok/.test(e.message)) return null; // 404: henüz karar yok
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
  yaz: { guncelle: (i: Item) => Promise<void>; sil: (id: string) => Promise<void> },
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
          if (!metin.includes(islem.eski)) { sonuc.atlanan.push({ islem, neden: 'değişecek cümle metinde yok' }); continue; }
          yeni = { ...m, notes: metin.replace(islem.eski, islem.deger.trim()) };
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
  const ad = `${iki(zaman.getDate())}-${iki(zaman.getMonth() + 1)}-${zaman.getFullYear()}-${iki(zaman.getHours())}${iki(zaman.getMinutes())}`;
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
