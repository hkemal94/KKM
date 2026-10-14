import type { Item } from '../types';
import { aiCagir, AiHatasi } from './aiCagir';
import { hatayiNotEt, kotaNotunuSil, type YapayZekaOnerisi } from './studyo';
import { gonderiler } from './sosyal';

/**
 * Gece hazırlığı — kural istisnası (Kemal, 30 Eylül; docs/soru-cevap/yapisal-4.md, 17).
 *
 *   - Günde bir kez 3 üretim önerisi. Dört türden (sosyal medya, drop / ürün,
 *     yazı / fanzin, harita / viki) her gün biri dinlenir, üçü gelir.
 *   - Ayın ilk günü o ayın fanzin taslağı.
 *   - Hepsi YALNIZ öneri tepsisine düşer. Kanona, vikiye, Merch'e bir şey
 *     yazılmaz; Kemal "Ekle" demeden hiçbir kayda girmez.
 *
 * Uygulama gece açık değilse iş sabah ilk açılışta yapılır (birkaç saniye).
 * Açık kalırsa gece yarısından sonra kendiliğinden yapılır.
 *
 * Kota dolarsa ("Limit geldiğinde yeniden başlasın"): hata zamanı not edilir,
 * bir saat sonra yeniden denenir; limit yenilenince kaldığı yerden devam eder.
 *
 * İki cihazda aynı gün iki kez hazırlanmasın diye son yapılan gün tek bir
 * durum kaydında tutulur (`type: 'gece_hazirlik'`). Bu kayıt yalnız
 * defter tutar; içinde öneri ya da kanon yok.
 */

export const GECE_DURUM_TURU = 'gece_hazirlik' as const;
export const GECE_ARACI = 'gece-oneri';
export const FANZIN_ARACI = 'fanzin';

export const GECE_TURLERI = [
  { id: 'sosyal', ad: 'Sosyal medya' },
  { id: 'drop', ad: 'Drop / ürün' },
  { id: 'yazi', ad: 'Yazı / fanzin' },
  { id: 'viki', ad: 'Harita / viki' }
] as const;
export type GeceTuru = typeof GECE_TURLERI[number]['id'];

/** Hata sonrası yeniden deneme aralığı */
const YENIDEN_DENEME_MS = 60 * 60 * 1000;
/** Ayın ilk günü kaçırılırsa fanzin en geç ayın kaçına kadar hazırlanır */
const FANZIN_PENCERESI = 10;

/** İstanbul saatine göre gün: "2026-10-01" */
export const istanbulGunu = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** O gün gelecek üç tür (dördüncüsü dinlenir; sırayla değişir) */
export function gununTurleri(gun: string): GeceTuru[] {
  const n = Math.floor(Date.parse(`${gun}T00:00:00Z`) / 86_400_000);
  const dinlenen = ((n % 4) + 4) % 4;
  return GECE_TURLERI.filter((_, i) => i !== dinlenen).map(t => t.id);
}

export interface GeceDurumu {
  sonGun?: string;
  sonFanzinAy?: string;
  /** son hata zamanı (ms) ve kısa açıklaması */
  sonHata?: number;
  hata?: string;
  /** Daha önce gelen drop / ürün önerilerinin başlıkları (son 40). Bir daha önerilmez
   *  (14 Ekim, Kemal: "sürekli aynı ürün önerisi geliyor" → "ürün kalsın, tekrar etmesin") */
  oncekiUrunler?: string[];
}

export const durumKaydi = (items: Item[]) => items.find(i => i.type === GECE_DURUM_TURU) || null;
export const geceDurumu = (items: Item[]): GeceDurumu => (durumKaydi(items)?.metadata?.gece as GeceDurumu) || {};

export function yapilacaklar(items: Item[], simdi = new Date()): { oneriler: boolean; fanzin: boolean } {
  const d = geceDurumu(items);
  const gun = istanbulGunu(simdi);
  const ay = gun.slice(0, 7);
  const bekle = d.sonHata && simdi.getTime() - d.sonHata < YENIDEN_DENEME_MS;
  if (bekle) return { oneriler: false, fanzin: false };
  return {
    oneriler: d.sonGun !== gun,
    fanzin: d.sonFanzinAy !== ay && Number(gun.slice(8, 10)) <= FANZIN_PENCERESI
  };
}

// ---------------------------------------------------------------- bağlam

const canli = (items: Item[]) => items.filter(i => !i.archived && !i.isProposal);
const kisa = (s = '', n = 240) => (s.length > n ? s.slice(0, n) + '…' : s);
const VIKI = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay'];

/**
 * Gece önerilerine giden viki maddeleri (8 Ekim, Kemal: "sürekli aynı yerlere
 * öneri verdiği için Merkez'de bir sürü tarihçe oldu"). Eskiden en son
 * dokunulan 40 madde gidiyordu; öneri eklenince madde yine en son dokunulan
 * oluyor, ertesi gece yine seçiliyordu. Artık tepside bekleyen önerisi olan
 * maddeler sona, uzun süredir dokunulmamışlar öne gelir.
 */
export function vikiSirasi(items: Item[]): Item[] {
  const bekleyen = new Set(items
    .filter(i => i.type === 'aday' && !i.archived)
    .map(i => (i.metadata?.aday as { hedefId?: string } | undefined)?.hedefId)
    .filter((x): x is string => !!x));
  return canli(items)
    .filter(i => VIKI.includes(i.type))
    .sort((a, b) => Number(bekleyen.has(a.id)) - Number(bekleyen.has(b.id)) || a.updatedAt - b.updatedAt);
}

const ONCEKI_URUN_SINIRI = 40;
const sade = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşüâîû]+/g, ' ').trim();

/** Önceden önerilmiş drop / ürün başlıkları: defterdekiler + tepside duranlar */
export function oncekiUrunOnerileri(items: Item[]): string[] {
  const tepside = items
    .filter(i => i.type === 'aday')
    .map(i => (i.metadata?.aday as { gece?: { tur?: string; baslik?: string } } | undefined)?.gece)
    .filter(g => g?.tur === 'drop' && g.baslik)
    .map(g => g!.baslik!);
  const hepsi = [...(geceDurumu(items).oncekiUrunler || []), ...tepside];
  return hepsi.filter((b, n) => hepsi.findIndex(x => sade(x) === sade(b)) === n).slice(-ONCEKI_URUN_SINIRI);
}

/** Aynı ürün yeniden gelirse ayıklanır (yapay zekâ kuralı çiğnerse diye) */
export function tekrarlariAyikla(oneriler: GeceOnerisi[], onceki: string[]): GeceOnerisi[] {
  const bilinen = new Set(onceki.map(sade));
  return oneriler.filter(o => o.tur !== 'drop' || !bilinen.has(sade(o.baslik)));
}

/** Yapay zekâya giden özet: yalnız adlar ve kısa notlar */
export function geceBaglami(items: Item[]) {
  const c = canli(items);
  const son = (a: Item, b: Item) => b.updatedAt - a.updatedAt;
  return {
    viki: vikiSirasi(items).slice(0, 40).map(i => ({ ad: i.title, tur: i.type, not: kisa(i.notes) })),
    droplar: c.filter(i => i.type === 'drop').map(i => ({ ad: i.title, asama: i.status, not: kisa(i.notes, 160) })),
    urunler: c.filter(i => i.type === 'merch_urun').slice(0, 20).map(i => ({ ad: i.title, asama: i.status })),
    gonderiler: gonderiler(c).sort(son).slice(0, 10).map(i => ({ ad: i.title, asama: i.status })),
    yazilar: c.filter(i => i.type === 'blog_post').sort(son).slice(0, 10).map(i => ({ ad: i.title, asama: i.status })),
    notlar: c.filter(i => (i.tags || []).includes('gunluk-not')).sort(son).slice(0, 10).map(i => kisa(i.notes || i.title, 200)),
    oncekiUrunler: oncekiUrunOnerileri(items)
  };
}

/** Fanzin kaynakları (yapisal-4, 31): viki ve künye, Merch, not defteri, Pinterest, Canva ve sosyal medya */
export function fanzinBaglami(items: Item[], istek = '') {
  const c = canli(items);
  const g = geceBaglami(items);
  return {
    ...g,
    pinterest: c.filter(i => i.type === 'ilham_kaynak').slice(0, 10).map(i => ({ ad: i.title, not: kisa(i.notes, 120) })),
    galeri: c.filter(i => i.type === 'ilham_gorsel').slice(0, 15).map(i => i.title),
    hesaplar: c.filter(i => i.type === 'channel').map(i => i.title),
    istek
  };
}

// ---------------------------------------------------------------- kayıtlar

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

export interface GeceOnerisi { tur: GeceTuru; baslik: string; metin: string; bag?: string }

/** Sunucunun cevabından öneriler (bozuksa boş) */
export function onerileriAyikla(ham: unknown, turler: GeceTuru[]): GeceOnerisi[] {
  let v: unknown = ham;
  if (typeof v === 'string') { try { v = JSON.parse(v.replace(/^```(json)?|```$/gm, '').trim()); } catch { v = null; } }
  if (!Array.isArray(v)) return [];
  return v
    .filter(x => x && typeof x.baslik === 'string' && typeof x.metin === 'string')
    .map(x => ({
      tur: (turler.includes(x.tur) ? x.tur : turler[0]) as GeceTuru,
      baslik: String(x.baslik).trim().slice(0, 120),
      metin: String(x.metin).trim().slice(0, 1200),
      ...(typeof x.bag === 'string' && x.bag.trim() ? { bag: x.bag.trim() } : {})
    }))
    .slice(0, 3);
}

export function geceOneriKaydi(o: GeceOnerisi, items: Item[], gun: string): YeniKayit {
  const hedef = o.bag ? canli(items).find(i => i.title.toLocaleLowerCase('tr') === o.bag!.toLocaleLowerCase('tr')) : undefined;
  const turAdi = GECE_TURLERI.find(t => t.id === o.tur)?.ad || o.tur;
  const bilgi: YapayZekaOnerisi & { gece: { gun: string; tur: GeceTuru; baslik: string } } = {
    tur: 'yapay_zeka', durum: 'bekliyor', arac: GECE_ARACI,
    hedefId: hedef?.id || '', hedefAdi: hedef?.title || '',
    tarih: gun, metin: o.metin,
    gece: { gun, tur: o.tur, baslik: o.baslik }
  };
  return {
    title: `${turAdi} · ${o.baslik}`,
    area: 'komuta', type: 'aday', status: 'Fikir', priority: 'orta',
    tags: ['aday', 'studyo', 'gece'],
    links: hedef ? [hedef.id] : [],
    notes: o.metin, images: [], isProposal: false, archived: false,
    metadata: { aday: bilgi }
  };
}

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const ayYazisi = (ay: string) => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1]} ${ay.slice(0, 4)}`;

export function fanzinOneriKaydi(bolumler: Array<{ title: string; content: string }>, ay: string, gun: string): YeniKayit {
  const bilgi: YapayZekaOnerisi & { fanzinAy: string } = {
    tur: 'yapay_zeka', durum: 'bekliyor', arac: FANZIN_ARACI,
    hedefId: '', hedefAdi: '', tarih: gun, bolumler, fanzinAy: ay
  };
  return {
    title: `Fanzin taslağı · ${ayYazisi(ay)}`,
    area: 'komuta', type: 'aday', status: 'Fikir', priority: 'orta',
    tags: ['aday', 'studyo', 'gece', 'fanzin'],
    links: [], notes: bolumler.map(b => `${b.title}\n${b.content}`).join('\n\n'),
    images: [], isProposal: false, archived: false,
    metadata: { aday: bilgi }
  };
}

function durumYaz(items: Item[], deg: GeceDurumu): { guncel?: Item; yeni?: YeniKayit } {
  const k = durumKaydi(items);
  const eski = geceDurumu(items);
  const gece: GeceDurumu = { ...eski, ...deg };
  // Firestore: undefined yazılmaz
  (Object.keys(gece) as Array<keyof GeceDurumu>).forEach(a => gece[a] === undefined && delete gece[a]);
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), gece }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'Gece hazırlığı', area: 'komuta', type: GECE_DURUM_TURU, status: 'Planlandı', priority: 'düşük',
      tags: ['gece'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { gece }
    }
  };
}

// ---------------------------------------------------------------- çalıştırıcı

export interface GeceIslemleri {
  onAddItem: (item: YeniKayit) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
}

/**
 * Yapılacak ne varsa yapar. Dönen metin kısa rapor (bildirim için).
 * Hata olursa durum kaydına yazılır, bir saat sonra yeniden denenir.
 */
export async function geceHazirliginiYap(items: Item[], islem: GeceIslemleri, simdi = new Date()): Promise<string | null> {
  const is = yapilacaklar(items, simdi);
  if (!is.oneriler && !is.fanzin) return null;
  const gun = istanbulGunu(simdi);
  const ay = gun.slice(0, 7);
  const rapor: string[] = [];
  const deg: GeceDurumu = {};
  try {
    if (is.oneriler) {
      const turler = gununTurleri(gun);
      const ham = await aiCagir<unknown>('gece-onerileri', {
        gun, turler: turler.map(t => ({ id: t, ad: GECE_TURLERI.find(x => x.id === t)!.ad })), ...geceBaglami(items)
      });
      const ayiklanan = onerileriAyikla(ham, turler);
      if (!ayiklanan.length) throw new AiHatasi('Yapay zekâ beklenmedik bir cevap döndü.');
      const onceki = oncekiUrunOnerileri(items);
      const oneriler = tekrarlariAyikla(ayiklanan, onceki);
      for (const o of oneriler) await islem.onAddItem(geceOneriKaydi(o, items, gun));
      const yeniUrunler = oneriler.filter(o => o.tur === 'drop').map(o => o.baslik);
      if (yeniUrunler.length) deg.oncekiUrunler = [...onceki, ...yeniUrunler].slice(-ONCEKI_URUN_SINIRI);
      deg.sonGun = gun;
      rapor.push(`${oneriler.length} üretim önerisi`);
    }
    if (is.fanzin) {
      const ham = await aiCagir<unknown>('fanzin-taslak', { ay: ayYazisi(ay), ...fanzinBaglami(items) });
      let v: unknown = ham;
      if (typeof v === 'string') { try { v = JSON.parse(v.replace(/^```(json)?|```$/gm, '').trim()); } catch { v = null; } }
      const bolumler = Array.isArray(v)
        ? v.filter(x => x && typeof x.title === 'string').map(x => ({ title: String(x.title), content: String(x.content || '') })).slice(0, 8)
        : [];
      if (!bolumler.length) throw new AiHatasi('Fanzin taslağı beklenmedik bir biçimde geldi.');
      await islem.onAddItem(fanzinOneriKaydi(bolumler, ay, gun));
      deg.sonFanzinAy = ay;
      rapor.push(`${ayYazisi(ay)} fanzin taslağı`);
    }
    kotaNotunuSil();
    // alan silmek yerine sıfırlanır (kayıt üstüne eklenerek yazılıyor)
    deg.sonHata = 0; deg.hata = '';
  } catch (e) {
    hatayiNotEt(e);
    // Sunucu hiç yoksa (önizleme) deftere yazılmaz; yapacak bir şey yok
    if (e instanceof AiHatasi && e.sunucuYok) return null;
    deg.sonHata = Date.now();
    deg.hata = e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen hata';
  }
  const s = durumYaz(items, deg);
  if (s.guncel) await islem.onUpdateItem(s.guncel);
  if (s.yeni) await islem.onAddItem(s.yeni);
  return rapor.length ? `Stüdyo hazırladı: ${rapor.join(' ve ')}. Öneri tepsisinde.` : null;
}
