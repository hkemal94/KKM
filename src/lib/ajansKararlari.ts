import type { Item } from '../types';
import { alanaYaz, bosluklariCikar } from '../components/Bosluklar';
import { base64, base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

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
 *
 * Uygulanınca ajansın deposuna `kkm/uygulananlar/` altına bir makbuz yazılır;
 * ajansın akşam ve sabah raporu neyin işlendiğini oradan listeler.
 */

export const KARARLAR_YOLU = 'kkm/kararlar.json';
export const MAKBUZ_KLASORU = 'kkm/uygulananlar';

export type KararIslemi =
  | { kimlik: string; tur: 'sil'; id: string; baslik: string; neden: string }
  | { kimlik: string; tur: 'alanaYaz'; anahtar: string; deger: string; baslik: string; neden: string };

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
