import { belgeyiOku, hamAdres } from './depoBelgesi';

/**
 * Oyunun plan ve çizim galerisi (19 Kasım, Kemal: "Bu minigolf planlarını
 * sakla, bayıldım; KKM'nin içinde oyun galerisine koy"). Oyun deposundaki
 * `docs/galeri.json` her açılışta okunur; görseller oyun deposunda durur, KKM'ye
 * kopyalanmaz. Yalnız gösterir: KKM kayıtlarına ve oyunun deposuna hiçbir şey
 * yazılmaz.
 *
 * Liste biçimi: `{ bolumler: [{ id, baslik }], gorseller: [{ bolum, baslik,
 * tarih, durum, yol, pr?, delik?, tur?, grup?, not? }] }`. `durum`: `taslak`
 * ya da `onayli` (Kemal açıkça onayladı). Liste ana daldan okunur; ana daldaki
 * her satır birleşmiş bir PR'dan gelir.
 */

export const GALERI_YOLU = 'docs/galeri.json';

export type GaleriDurumu = 'taslak' | 'onayli';
export type CizimTuru = 'delik' | 'atis' | 'sema';

export interface GaleriGorseli {
  bolum: string;
  baslik: string;
  tarih: string;
  durum: GaleriDurumu;
  yol: string;
  adres: string;
  pr?: number;
  delik?: number;
  tur?: CizimTuru;
  grup?: string;
  not?: string;
}

export interface GaleriBolumu { id: string; baslik: string; gorseller: GaleriGorseli[] }

/** Delik bölümünde bir deliğin üç çizimi yan yana */
export const CIZIM_SIRASI: CizimTuru[] = ['delik', 'atis', 'sema'];

const metin = (d: unknown) => (typeof d === 'string' ? d : '');

/** galeri.json'u çözer; bozuk satır atlanır, listede adı olmayan bölüm sona eklenir */
export function galeriyiCoz(depo: string, kaynak: string): GaleriBolumu[] {
  const veri = JSON.parse(kaynak) as { bolumler?: unknown; gorseller?: unknown };
  const satirlar = Array.isArray(veri?.gorseller) ? veri.gorseller : [];
  const gorseller: GaleriGorseli[] = satirlar
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as { yol?: unknown }).yol === 'string' && typeof (s as { bolum?: unknown }).bolum === 'string')
    .map(s => {
      const yol = String(s.yol).replace(/^\.?\//, '');
      const g: GaleriGorseli = {
        bolum: String(s.bolum),
        baslik: metin(s.baslik) || yol.split('/').pop() || yol,
        tarih: metin(s.tarih),
        durum: s.durum === 'onayli' ? 'onayli' : 'taslak',
        yol,
        adres: hamAdres(depo, yol),
      };
      if (typeof s.pr === 'number') g.pr = s.pr;
      if (typeof s.delik === 'number') g.delik = s.delik;
      if (s.tur === 'delik' || s.tur === 'atis' || s.tur === 'sema') g.tur = s.tur;
      if (metin(s.grup)) g.grup = metin(s.grup);
      if (metin(s.not)) g.not = metin(s.not);
      return g;
    });

  const tanimlar = (Array.isArray(veri?.bolumler) ? veri.bolumler : [])
    .filter((b): b is { id: string; baslik?: unknown } => !!b && typeof b === 'object' && typeof (b as { id?: unknown }).id === 'string');
  const sira = tanimlar.map(b => ({ id: b.id, baslik: metin(b.baslik) || b.id }));
  for (const g of gorseller) if (!sira.some(b => b.id === g.bolum)) sira.push({ id: g.bolum, baslik: g.bolum });
  return sira
    .map(b => ({ ...b, gorseller: gorseller.filter(g => g.bolum === b.id) }))
    .filter(b => b.gorseller.length > 0);
}

/** Listeyi okur; liste yoksa null (ekranda "liste henüz yok") */
export async function galeriyiOku(depo: string): Promise<GaleriBolumu[] | null> {
  try {
    const { metin: kaynak } = await belgeyiOku(depo, [GALERI_YOLU]);
    return galeriyiCoz(depo, kaynak);
  } catch {
    return null;
  }
}

/** Görselleri sırasını bozmadan bir anahtara göre kümeler */
export function kumele<T>(liste: GaleriGorseli[], anahtar: (g: GaleriGorseli) => T): Array<{ anahtar: T; gorseller: GaleriGorseli[] }> {
  const cikti: Array<{ anahtar: T; gorseller: GaleriGorseli[] }> = [];
  for (const g of liste) {
    const a = anahtar(g);
    const var_ = cikti.find(k => k.anahtar === a);
    if (var_) var_.gorseller.push(g); else cikti.push({ anahtar: a, gorseller: [g] });
  }
  return cikti;
}

/** Görselin altındaki durum satırı: "taslak · birleşti (PR #4)" */
export function durumYazisi(g: GaleriGorseli): string {
  return `${g.durum === 'onayli' ? 'onaylı' : 'taslak'} · birleşti${g.pr ? ` (PR #${g.pr})` : ''}`;
}
