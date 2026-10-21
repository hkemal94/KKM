import type { Item } from '../types';
import { aiCagir, AiHatasi } from './aiCagir';
import { hatayiNotEt, kotaNotunuSil, type YapayZekaOnerisi } from './studyo';
import { gonderiler } from './sosyal';
import {
  GECE_TURLERI, ONCEKI_HEDEF_SINIRI, ONCEKI_SINIRI, WIKIPEDIA_KAYNAKLARI, acikGeceTurleri, bekleyenHedefler, defterSatiri,
  gununYuvalari, hedefiBul, kanalAcikMi, kanalAyari, kaynakSec, oncekiOneriler, oncekiTurlereGore, sade, vikiAdaylari,
  vikiAilesiMi, vikiOzeti, type GeceTuru
} from './oneriKanallari';
import {
  DONDURMACI_MADDESI, ayarMi, depoKaynagi, vikipediOzeti, type DepoKaynagi, type VikipediKaynagi
} from './oneriKaynaklari';

/**
 * Gece hazırlığı — kural istisnası (Kemal, 30 Eylül; docs/soru-cevap/yapisal-4.md, 17).
 *
 *   - Günde bir kez 3 üretim önerisi. Yuvaların çoğu vikiye gider (21 Ekim):
 *     viki, Wikipedia örneği ve Dondurmacı deposu; kalanı sosyal, drop, yazı.
 *     Hangi kanalların açık olduğunu Kemal "Öneri ayarları"ndan seçer.
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

export { GECE_TURLERI };
export type { GeceTuru };

/** Hata sonrası yeniden deneme aralığı */
const YENIDEN_DENEME_MS = 60 * 60 * 1000;
/** Ayın ilk günü kaçırılırsa fanzin en geç ayın kaçına kadar hazırlanır */
const FANZIN_PENCERESI = 10;

/** İstanbul saatine göre gün: "2026-10-01" */
export const istanbulGunu = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export interface GeceDurumu {
  sonGun?: string;
  sonFanzinAy?: string;
  /** son hata zamanı (ms) ve kısa açıklaması */
  sonHata?: number;
  hata?: string;
  /** Eski alan: yalnız drop başlıkları. Okunur; bir sonraki gece `oncekiBasliklar`a katılıp silinir */
  oncekiUrunler?: string[];
  /** Daha önce gelen BÜTÜN önerilerin "tür|başlık" satırları (son 90). Aynısı bir daha önerilmez
   *  (14 Ekim ürün için, 21 Ekim bütün kanallar için). "wikipedia-kaynak|<madde>" satırı hangi
   *  Vikipedi maddesinin kullanıldığını tutar. */
  oncekiBasliklar?: string[];
  /** Son öneri alan viki maddelerinin kimlikleri (son 60); sıradaki gecelerde başka maddelere sıra gelir */
  oncekiHedefler?: string[];
}

export const durumKaydi = (items: Item[]) => items.find(i => i.type === GECE_DURUM_TURU) || null;
export const geceDurumu = (items: Item[]): GeceDurumu => (durumKaydi(items)?.metadata?.gece as GeceDurumu) || {};

export function yapilacaklar(items: Item[], simdi = new Date()): { oneriler: boolean; fanzin: boolean } {
  const d = geceDurumu(items);
  const gun = istanbulGunu(simdi);
  const ay = gun.slice(0, 7);
  const bekle = d.sonHata && simdi.getTime() - d.sonHata < YENIDEN_DENEME_MS;
  if (bekle) return { oneriler: false, fanzin: false };
  // Kapatılan kanallar çalışmaz (Öneri ayarları); hiçbiri açık değilse yapay zekâya sorulmaz
  const fanzinAcik = kanalAcikMi(kanalAyari(items), 'fanzin');
  return {
    oneriler: d.sonGun !== gun && acikGeceTurleri(items).length > 0,
    fanzin: fanzinAcik && d.sonFanzinAy !== ay && Number(gun.slice(8, 10)) <= FANZIN_PENCERESI
  };
}

// ---------------------------------------------------------------- bağlam

const canli = (items: Item[]) => items.filter(i => !i.archived && !i.isProposal);
const kisa = (s = '', n = 240) => (s.length > n ? s.slice(0, n) + '…' : s);

/** Yapay zekâya giden özet: yalnız adlar, kimlikler ve kısa notlar */
export function geceBaglami(items: Item[]) {
  const c = canli(items);
  const son = (a: Item, b: Item) => b.updatedAt - a.updatedAt;
  const d = geceDurumu(items);
  return {
    viki: vikiAdaylari(items, d.oncekiHedefler).map(vikiOzeti),
    droplar: c.filter(i => i.type === 'drop').map(i => ({ ad: i.title, asama: i.status, not: kisa(i.notes, 160) })),
    urunler: c.filter(i => i.type === 'merch_urun').slice(0, 20).map(i => ({ ad: i.title, asama: i.status })),
    gonderiler: gonderiler(c).sort(son).slice(0, 10).map(i => ({ ad: i.title, asama: i.status })),
    yazilar: c.filter(i => i.type === 'blog_post').sort(son).slice(0, 10).map(i => ({ ad: i.title, asama: i.status })),
    notlar: c.filter(i => (i.tags || []).includes('gunluk-not')).sort(son).slice(0, 10).map(i => kisa(i.notes || i.title, 200)),
    /** Tür başına daha önce önerilen başlıklar: "bunları ve benzerlerini önerme" */
    onceki: oncekiTurlereGore(oncekiOneriler(items, d))
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

export interface GeceBolumu { title: string; content: string }
export interface GeceOnerisi {
  tur: GeceTuru; baslik: string; metin: string;
  /** Önerinin bağlandığı maddenin kimliği (tercih edilen) ve adı */
  bagId?: string; bag?: string;
  /** Viki ailesinde: "Ekle" deyince maddeye öneri bölümü olarak giden kısa taslak */
  bolumler?: GeceBolumu[];
}

/** Dış kaynaktan gelen ek bilgi: öneri kaydına yazılır, tepside gösterilir */
export interface GeceKaynagi { kaynak?: { ad: string; adres: string }; gorseller?: string[] }

/** Sunucunun cevabından öneriler (bozuksa boş). Bir türden, yuva sayısından fazlası kabul edilmez. */
export function onerileriAyikla(ham: unknown, yuvalar: GeceTuru[]): GeceOnerisi[] {
  let v: unknown = ham;
  if (typeof v === 'string') { try { v = JSON.parse(v.replace(/^```(json)?|```$/gm, '').trim()); } catch { v = null; } }
  if (!Array.isArray(v) || !yuvalar.length) return [];
  const kalan = [...yuvalar];
  const cikti: GeceOnerisi[] = [];
  for (const x of v) {
    if (!x || typeof x.baslik !== 'string' || typeof x.metin !== 'string') continue;
    const tur = (yuvalar.includes(x.tur) ? x.tur : kalan[0]) as GeceTuru;
    const n = kalan.indexOf(tur);
    if (n < 0) continue; // bu türün yuvası bitti
    kalan.splice(n, 1);
    const bolumler = Array.isArray(x.bolumler)
      ? x.bolumler
        .filter((b: unknown): b is GeceBolumu => !!b && typeof (b as GeceBolumu).title === 'string' && typeof (b as GeceBolumu).content === 'string' && !!(b as GeceBolumu).content.trim())
        .map((b: GeceBolumu) => ({ title: b.title.trim().slice(0, 80), content: b.content.trim().slice(0, 900) }))
        .slice(0, 3)
      : [];
    cikti.push({
      tur,
      baslik: String(x.baslik).trim().slice(0, 120),
      metin: String(x.metin).trim().slice(0, 1200),
      ...(typeof x.bagId === 'string' && x.bagId.trim() ? { bagId: x.bagId.trim() } : {}),
      ...(typeof x.bag === 'string' && x.bag.trim() ? { bag: x.bag.trim() } : {}),
      ...(bolumler.length ? { bolumler } : {})
    });
    if (cikti.length >= 3) break;
  }
  return cikti;
}

export interface SuzulmusOneri { o: GeceOnerisi; hedef?: Item }

/**
 * Tekrarları ve bağsızları ayıklar (21 Ekim):
 *   - aynı türde aynı başlık daha önce önerildiyse (defter + tepside duranlar) düşer,
 *   - viki ailesinde maddeye bağlanamayan öneri düşer (ilgili yere ulaşmayan öneri tepside takılıp kalıyordu),
 *   - bekleyen önerisi olan ya da son gecelerde öneri almış maddeye ikinci öneri gelmez,
 *   - aynı gece aynı maddeye iki öneri gelmez,
 *   - Dondurmacı deposu önerisi her zaman "Dondurmacı Kızlar" maddesine bağlanır ve
 *     içinde oyun ayarı (sayı + birim) sızmışsa düşer.
 */
export function oneriSuz(oneriler: GeceOnerisi[], items: Item[], durum: GeceDurumu = geceDurumu(items)): SuzulmusOneri[] {
  const onceki = oncekiOneriler(items, durum);
  const bilinen = new Set(onceki.map(b => `${b.tur}|${sade(b.baslik)}`));
  const bekleyen = bekleyenHedefler(items);
  const son = new Set(durum.oncekiHedefler || []);
  const bu = new Set<string>();
  const sonuc: SuzulmusOneri[] = [];
  for (const o of oneriler) {
    if (bilinen.has(`${o.tur}|${sade(o.baslik)}`)) continue;
    if (o.tur === 'drop' || !vikiAilesiMi(o.tur)) {
      const hedef = hedefiBul(items, o.bagId, o.bag);
      sonuc.push({ o, ...(hedef ? { hedef } : {}) });
      continue;
    }
    const hedef = o.tur === 'depo' ? depoHedefi(items) : hedefiBul(items, o.bagId, o.bag);
    if (!hedef) continue;
    if (bekleyen.has(hedef.id) || bu.has(hedef.id)) continue;
    if (o.tur !== 'depo' && son.has(hedef.id)) continue;
    if (o.tur === 'depo' && [o.baslik, o.metin, ...(o.bolumler || []).map(b => b.content)].some(ayarMi)) continue;
    bu.add(hedef.id);
    sonuc.push({ o, hedef });
  }
  return sonuc;
}

/** Dondurmacı deposunun önerisi yalnız vikideki "Dondurmacı Kızlar" mekânına bağlanır */
export const depoHedefi = (items: Item[]) =>
  canli(items).find(i => i.type === 'mekân' && sade(i.title) === sade(DONDURMACI_MADDESI));

export function geceOneriKaydi(s: SuzulmusOneri, gun: string, ek: GeceKaynagi = {}): YeniKayit {
  const { o, hedef } = s;
  const turAdi = GECE_TURLERI.find(t => t.id === o.tur)?.ad || o.tur;
  const bilgi: YapayZekaOnerisi & { gece: { gun: string; tur: GeceTuru; baslik: string } } = {
    tur: 'yapay_zeka', durum: 'bekliyor', arac: GECE_ARACI,
    hedefId: hedef?.id || '', hedefAdi: hedef?.title || '',
    tarih: gun, metin: o.metin,
    ...(o.bolumler?.length ? { bolumler: o.bolumler } : {}),
    ...(ek.kaynak ? { kaynak: ek.kaynak } : {}),
    ...(ek.gorseller?.length ? { gorseller: ek.gorseller } : {}),
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

/** Deftere eklenecek satırlar; sınırlar aşılırsa en eskiler düşer. Saf fonksiyon. */
export function defteriGuncelle(
  eski: GeceDurumu, yeniOneriler: SuzulmusOneri[], kullanilanKaynak?: string
): Pick<GeceDurumu, 'oncekiBasliklar' | 'oncekiHedefler' | 'oncekiUrunler'> {
  const satirlar = [
    ...(eski.oncekiUrunler || []).map(b => defterSatiri('drop', b)),
    ...(eski.oncekiBasliklar || []),
    ...yeniOneriler.map(s => defterSatiri(s.o.tur, s.o.baslik)),
    ...(kullanilanKaynak ? [defterSatiri('wikipedia-kaynak', kullanilanKaynak)] : [])
  ];
  // "wikipedia-kaynak" satırları kaynak seçimi için; sınır aşılınca en eskiden düşer
  const hedefler = [...(eski.oncekiHedefler || []), ...yeniOneriler.filter(s => s.hedef && vikiAilesiMi(s.o.tur)).map(s => s.hedef!.id)];
  return {
    oncekiBasliklar: satirlar.slice(-ONCEKI_SINIRI),
    oncekiHedefler: hedefler.filter((x, n) => hedefler.lastIndexOf(x) === n).slice(-ONCEKI_HEDEF_SINIRI),
    oncekiUrunler: undefined // eski alan artık oncekiBasliklar içinde; undefined → kayıttan çıkar
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

/** Kaynağı alınamayan yuvanın yerine (Vikipedi'ye ulaşılamadı gibi) açık bir viki yuvası ya da hiçbiri */
const yuvaDegistir = (yuvalar: GeceTuru[], eski: GeceTuru, acik: GeceTuru[]): GeceTuru[] => {
  const yerine = acik.includes('viki') ? 'viki' : undefined;
  const n = yuvalar.indexOf(eski);
  if (n < 0) return yuvalar;
  const kopya = [...yuvalar];
  if (yerine) kopya[n] = yerine; else kopya.splice(n, 1);
  return kopya;
};

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
      const acik = acikGeceTurleri(items);
      const durum = geceDurumu(items);
      let yuvalar = gununYuvalari(gun, acik);

      // Dış kaynaklar (yalnız okunur). Alınamazsa yuva vikiye kayar.
      let wiki: VikipediKaynagi | null = null;
      let depo: DepoKaynagi | null = null;
      if (yuvalar.includes('wikipedia')) {
        const sirali = [...WIKIPEDIA_KAYNAKLARI];
        const secilen = kaynakSec(sirali, durum.oncekiBasliklar || []);
        const deneme = secilen ? [secilen, ...sirali.filter(x => x !== secilen)] : sirali;
        for (const baslik of deneme) { wiki = await vikipediOzeti(baslik); if (wiki) break; }
        if (!wiki) yuvalar = yuvaDegistir(yuvalar, 'wikipedia', acik);
      }
      if (yuvalar.includes('depo')) {
        depo = depoHedefi(items) ? await depoKaynagi() : null;
        if (!depo) yuvalar = yuvaDegistir(yuvalar, 'depo', acik);
      }
      if (!yuvalar.length) throw new AiHatasi('Bugün için açık bir öneri kanalı kalmadı.');

      const ham = await aiCagir<unknown>('gece-onerileri', {
        gun,
        yuvalar: yuvalar.map((t, n) => ({ no: n + 1, tur: t, ad: GECE_TURLERI.find(x => x.id === t)!.ad })),
        ...(wiki ? { wikipedia: wiki } : {}),
        ...(depo ? { depo: { metin: depo.metin, madde: DONDURMACI_MADDESI } } : {}),
        ...geceBaglami(items)
      });
      const ayiklanan = onerileriAyikla(ham, yuvalar);
      if (!ayiklanan.length) throw new AiHatasi('Yapay zekâ beklenmedik bir cevap döndü.');
      const suzulen = oneriSuz(ayiklanan, items, durum);
      for (const s of suzulen) {
        const ek: GeceKaynagi = s.o.tur === 'wikipedia' && wiki ? { kaynak: { ad: wiki.baslik, adres: wiki.adres } }
          : s.o.tur === 'depo' && depo ? { kaynak: { ad: 'Dondurmacı Kızlar · tasarım belgesi', adres: depo.adres }, gorseller: depo.gorseller }
            : {};
        await islem.onAddItem(geceOneriKaydi(s, gun, ek));
      }
      // Defter: ek yazma yok, aynı gece kaydı içinde
      Object.assign(deg, defteriGuncelle(durum, suzulen, suzulen.some(s => s.o.tur === 'wikipedia') ? wiki?.baslik : undefined));
      deg.sonGun = gun;
      if (suzulen.length) rapor.push(`${suzulen.length} üretim önerisi`);
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
