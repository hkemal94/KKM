import type { Item, ItemType } from '../types';
import type { Relation } from '../utils/relations';
import { takmaAdlar } from './alanSablonu';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Vikiyi ajansa gönder (22 Ekim gece). Ajansın Viki Editörü Firestore'a
 * erişemediği için viki maddeleri Kemal'in düğmesiyle ajansın gizli deposuna,
 * `kkm/viki.json`'a yazılır. Yalnız okumak içindir: KKM kayıtlarına hiçbir
 * şey yazılmaz. Arşivdeki ve öneri olan maddeler, görseller ve harita verisi
 * gitmez. Dosya 1 MB'ı geçerse en uzun metinler kısaltılır ve işaretlenir.
 */

export const VIKI_YOLU = 'kkm/viki.json';
const SINIR_BAYT = 1_000_000;

/** `lib/bagKurallari.ts` içindeki viki türleri (oda dahil, kural tablosuyla aynı) */
const VIKI_TURLERI: ItemType[] = ['kisi', 'karakter', 'aile', 'mekân', 'dükkân', 'kulüp', 'marka', 'yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'olay', 'ürün', 'oda'];

/** Dosyaya girmeyen alanlar: görsel, harita, yerleşim ve bağlar (bağlar ayrı yazılır) */
const ATLANAN = new Set(['brandKit', 'eskiAdlar', 'aliases', 'relations', 'images', 'moodboard', 'haritaKonum', 'wikiSections']);

const metinMi = (d: unknown): d is string => typeof d === 'string' && !d.startsWith('data:') && !d.startsWith('gorsel:');

/** Düz metin ve sayı alanları; iç içe nesnede (künye gibi) yalnız bir kat inilir */
function duzAlanlar(m: Record<string, unknown>, derin = true): Record<string, string | number | boolean> {
  const cikti: Record<string, string | number | boolean> = {};
  for (const [k, d] of Object.entries(m)) {
    if (ATLANAN.has(k) || d == null) continue;
    if (metinMi(d) && d.trim()) cikti[k] = d;
    else if (typeof d === 'number' || typeof d === 'boolean') cikti[k] = d;
    else if (derin && typeof d === 'object' && !Array.isArray(d)) {
      for (const [ik, id] of Object.entries(duzAlanlar(d as Record<string, unknown>, false))) cikti[`${k}.${ik}`] = id;
    }
  }
  return cikti;
}

export function vikiMaddeleri(items: Item[]): Item[] {
  return items.filter(i => VIKI_TURLERI.includes(i.type) && !i.archived && !i.isProposal);
}

/** Gönderilecek dosyanın içeriği (saf iş; ağ yok) */
export function vikiDosyasi(items: Item[], zaman = new Date()) {
  const kimlik = new Map(items.map(i => [i.id, i]));
  const maddeler = vikiMaddeleri(items).map(i => {
    const m = (i.metadata || {}) as Record<string, unknown>;
    const bolumler = (Array.isArray(m.wikiSections) ? m.wikiSections : [])
      .filter(b => b && metinMi(b.content) && b.content.trim())
      .map(b => ({ baslik: String(b.title || ''), metin: b.content as string }));
    const baglar = (Array.isArray(m.relations) ? (m.relations as Relation[]) : [])
      .filter(r => r && !r.isProposal && kimlik.has(r.targetId))
      .map(r => ({ tur: r.type, hedefId: r.targetId, hedefBaslik: kimlik.get(r.targetId)!.title }));
    return {
      id: i.id, baslik: i.title, tur: i.type, takmaAdlar: takmaAdlar(i), metin: i.notes || '',
      alanlar: { ...duzAlanlar(m), ...(bolumler.length ? { bolumler } : {}) },
      baglar,
    };
  });
  return { olusturuldu: zaman.toISOString(), sayi: maddeler.length, kisaltildi: false, maddeler };
}

export type VikiDosyasi = ReturnType<typeof vikiDosyasi>;

const bayt = (d: unknown) => new TextEncoder().encode(JSON.stringify(d, null, 2)).length;

/** Dosya sınırı aşarsa uzun metinleri adım adım kısaltır; kısaltıldıysa `kisaltildi` olur */
export function sinirliVikiDosyasi(dosya: VikiDosyasi): { dosya: VikiDosyasi; bayt: number } {
  let simdi = dosya;
  for (const tavan of [6000, 3000, 1500, 800, 400]) {
    if (bayt(simdi) <= SINIR_BAYT) break;
    const kisalt = <T,>(d: T): T => {
      if (typeof d === 'string') return (d.length > tavan ? `${d.slice(0, tavan)}… [kısaltıldı]` : d) as T;
      if (Array.isArray(d)) return d.map(kisalt) as T;
      if (d && typeof d === 'object') return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, kisalt(v)])) as T;
      return d;
    };
    simdi = { ...kisalt(dosya), kisaltildi: true };
  }
  return { dosya: simdi, bayt: bayt(simdi) };
}

/** Dosyayı ajansın ana dalına yazar; GitHub adresini döner */
export function vikiyiGonder(anahtar: string, dosya: VikiDosyasi): Promise<string> {
  return ajansaDosyaYaz(anahtar, VIKI_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM vikisi: ${dosya.sayi} madde`, 'viki');
}
