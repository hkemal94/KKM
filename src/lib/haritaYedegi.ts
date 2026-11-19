import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db, sunucuyaUlas } from './firebase';
import type { Item } from '../types';
import { haritaKaydiniCoz } from './haritaDuzeni';
import type { HaritaDuzeni, KurucuBelge } from '../components/harita/duzenTipi';

/**
 * Harita yedeği (18 Kasım, kompakt ada A adımı; Kemal onayladı).
 *
 * Ada küçültülmeden önce Kemal'in harita kaydının ve haritaya bağlı viki
 * alanlarının yedeği. Durum → Eksikler → "Harita yedeği" kartı kullanır.
 *
 *   - Yedek iki yere: bilgisayara JSON olarak iner ve Firestore'da
 *     `users/{uid}/haritaYedekleri/{id}` belgesine yazılır. Belge boyut
 *     sınırı için içerik `parcalar/{sıra}` alt belgelerine bölünür; baş
 *     belge ile parçalar tek toplu yazmada gider (yarım yedek kalmaz).
 *   - Yedek bir kez yazılır, değişmez (kural güncellemeye izin vermez).
 *     En çok 3 yedek durur; dördüncüde en eskisi yalnız Kemal onaylarsa
 *     silinir.
 *   - Geri yükleme önce ne değişeceğini gösterir; Kemal onaylayınca harita
 *     kaydını tek yazmada yazar. Viki alanları ayrıca işaretlenirse yazılır.
 *   - Drive'a yükleme bu adımda yok (sonra).
 *
 * Bu dosyadaki hesaplar saf iştir; ağ yalnız en alttaki işlevlerde.
 */

export const EN_COK_YEDEK = 3;
/** Bir parçadaki en çok karakter (Türkçe harf 2 bayt: belge 1 MB'ın altında kalır) */
export const PARCA_BOYU = 300_000;
/** Bir yedekte en çok parça (kuralla aynı) */
export const EN_COK_PARCA = 10;

/** Haritaya bağlı viki alanları (metadata içinde) */
export const VIKI_HARITA_ALANLARI = [
  'rakim', 'haritaKonum', 'haritaIsareti', 'konum', 'haritaBinaId', 'haritaTur', 'haritaWikiId'
] as const;
type VikiHaritaAlanAdi = (typeof VIKI_HARITA_ALANLARI)[number];

/** Bir maddenin haritaya bağlı alanları (yalnız dolu olanlar) */
export interface VikiHaritaAlani {
  id: string;
  title: string;
  type: string;
  metadata: Partial<Record<VikiHaritaAlanAdi, unknown>>;
  /** Not satırı: rakımın ya da yüzölçümünün yazılı olduğu madde için */
  notes?: string;
}

export interface HaritaOzeti {
  /** Kurucu'da konan yapı + özel yapı */
  yapi: number;
  /** Kurucu'da çizilen yol */
  yol: number;
  /** Yapı → madde bağı */
  bag: number;
  /** İçinde oturan olan ev */
  oturanEv: number;
  doga: number;
  /** Elle düzeltilen üreteç yolu */
  yolDuzeni: number;
  /** Taşınan / döndürülen üreteç yapısı */
  binaDuzeni: number;
  gizlenen: number;
  mekan: number;
  /** Yedekteki viki maddesi */
  vikiMadde: number;
  kurucuSayac: number;
  adaKusagi: number;
  /** Kaydın son değiştiği an (ms) */
  guncelleme: number;
}

export interface HaritaYedegi {
  uygulama: 'Kems Komuta Merkezi';
  tur: 'harita-yedegi';
  surum: 1;
  tarih: string;
  olusturma: number;
  aciklama: string;
  /** Yedekleme ekranının "Geri yükle"si okuyabilsin diye (madde yok) */
  sayilar: { madde: 0 };
  items: [];
  /** Buluttaki harita kaydı olduğu gibi (`duzada/haritaDuzeni`) */
  haritaDuzeni: Record<string, unknown> | null;
  vikiAlanlari: VikiHaritaAlani[];
  ozet: HaritaOzeti;
}

/** Firestore'daki baş belge (içerik parçalarda) */
export interface YedekBasi {
  id: string;
  olusturma: number;
  parcaSayisi: number;
  boyut: number;
  ozet: Pick<HaritaOzeti, 'yapi' | 'yol' | 'bag' | 'oturanEv' | 'vikiMadde'>;
}

const say = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
const taslagi = (d: HaritaDuzeni | null): KurucuBelge | undefined => d?.kurucu ?? d?.kurucuIslenen;

/** Harita kaydının sayıları (saf iş) */
export function haritaOzeti(ham: unknown, vikiMadde = 0): HaritaOzeti {
  const d = haritaKaydiniCoz(ham);
  const t = taslagi(d);
  return {
    yapi: say(t?.yeniBinalar) + say(t?.ozelYapilar),
    yol: say(t?.yeniYollar),
    bag: say(t?.baglar),
    oturanEv: say(t?.oturanlar),
    doga: say(t?.doga),
    yolDuzeni: say(t?.yolDuzeni),
    binaDuzeni: say(t?.binaDuzeni),
    gizlenen: t?.gizlenen?.length ?? 0,
    mekan: say(d?.mekanlar),
    vikiMadde,
    kurucuSayac: Number(d?.kurucuSayac) || 0,
    adaKusagi: Number(d?.adaKusagi) || 2,
    guncelleme: Number(d?.guncelleme) || 0
  };
}

/** Haritaya bağlı alanı olan maddeler ve o alanlar (saf iş) */
export function vikiHaritaAlanlari(items: Item[]): VikiHaritaAlani[] {
  const cikti: VikiHaritaAlani[] = [];
  for (const i of items) {
    const m = (i.metadata || {}) as Record<string, unknown>;
    const alanlar: Partial<Record<VikiHaritaAlanAdi, unknown>> = {};
    for (const a of VIKI_HARITA_ALANLARI) if (m[a] !== undefined && m[a] !== null) alanlar[a] = m[a];
    const notlu = typeof i.notes === 'string' && i.notes
      && (alanlar.rakim !== undefined || alanlar.haritaKonum !== undefined || i.notes.includes('km²'));
    if (!Object.keys(alanlar).length && !notlu) continue;
    cikti.push({
      id: i.id, title: i.title, type: i.type, metadata: alanlar,
      ...(notlu ? { notes: i.notes } : {})
    });
  }
  return cikti;
}

/** Yedeğin içeriği (saf iş): bilgisayara inen dosya ile buluttaki aynı */
export function yedekIcerigi(ham: Record<string, unknown> | null, items: Item[], zaman = new Date()): HaritaYedegi {
  const viki = vikiHaritaAlanlari(items);
  return {
    uygulama: 'Kems Komuta Merkezi',
    tur: 'harita-yedegi',
    surum: 1,
    tarih: zaman.toISOString(),
    olusturma: zaman.getTime(),
    aciklama: 'Harita yedeği: harita kaydı (duzada/haritaDuzeni) olduğu gibi ve haritaya bağlı viki alanları (rakım, harita konumu, işaret, bağlı yapı, ilgili not satırı). KKM → Durum → Eksikler → Harita yedeği kartından geri yüklenir.',
    sayilar: { madde: 0 },
    items: [],
    haritaDuzeni: ham,
    vikiAlanlari: viki,
    ozet: haritaOzeti(ham, viki.length)
  };
}

/** Yedeğin kimliği: tarih ve saat (saf iş) */
export const yedekKimligi = (zaman: Date) =>
  'harita-' + zaman.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/** Okunan dosya / belge bir harita yedeği mi (saf iş) */
export function yedekMi(x: unknown): x is HaritaYedegi {
  if (!x || typeof x !== 'object') return false;
  const y = x as Partial<HaritaYedegi>;
  return y.tur === 'harita-yedegi' && Array.isArray(y.vikiAlanlari)
    && (y.haritaDuzeni === null || (typeof y.haritaDuzeni === 'object' && !Array.isArray(y.haritaDuzeni)));
}

// ---- geri yükleme özeti ------------------------------------------------------

export interface FarkSatiri {
  ad: string;
  simdi: number;
  yedekte: number;
  /** Yedekte olup şimdi olmayan: geri gelir */
  gelecek: number;
  /** Şimdi olup yedekte olmayan: kalkar */
  gidecek: number;
  /** İkisinde de olan ama farklı: eski hâline döner */
  degisecek: number;
}

const kayitFarki = (ad: string, simdi: unknown, yedekte: unknown): FarkSatiri => {
  const a = (simdi && typeof simdi === 'object' ? simdi : {}) as Record<string, unknown>;
  const b = (yedekte && typeof yedekte === 'object' ? yedekte : {}) as Record<string, unknown>;
  let gelecek = 0, gidecek = 0, degisecek = 0;
  for (const k of Object.keys(b)) {
    if (!(k in a)) gelecek++;
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) degisecek++;
  }
  for (const k of Object.keys(a)) if (!(k in b)) gidecek++;
  return { ad, simdi: Object.keys(a).length, yedekte: Object.keys(b).length, gelecek, gidecek, degisecek };
};

const kumeFarki = (ad: string, simdi: string[] = [], yedekte: string[] = []): FarkSatiri => {
  const a = new Set(simdi), b = new Set(yedekte);
  return {
    ad, simdi: a.size, yedekte: b.size, degisecek: 0,
    gelecek: [...b].filter(x => !a.has(x)).length,
    gidecek: [...a].filter(x => !b.has(x)).length
  };
};

export interface GeriYuklemeOzeti {
  satirlar: FarkSatiri[];
  /** Haritaya işlenmiş hâl (3B'de görünen) de değişiyor mu */
  islenenDegisir: boolean;
  /** Harita kaydında hiçbir fark yok */
  ayni: boolean;
}

/** Şimdiki kayıt → yedekteki kayıt: ne değişecek (saf iş) */
export function geriYuklemeOzeti(simdiHam: unknown, yedekHam: unknown): GeriYuklemeOzeti {
  const s = haritaKaydiniCoz(simdiHam), y = haritaKaydiniCoz(yedekHam);
  const st = taslagi(s), yt = taslagi(y);
  const satirlar = [
    kayitFarki("Kurucu'da konan yapı", st?.yeniBinalar, yt?.yeniBinalar),
    kayitFarki('Özel yapı', st?.ozelYapilar, yt?.ozelYapilar),
    kayitFarki("Kurucu'da çizilen yol", st?.yeniYollar, yt?.yeniYollar),
    kayitFarki('Yapı → madde bağı', st?.baglar, yt?.baglar),
    kayitFarki('İçinde oturan olan ev', st?.oturanlar, yt?.oturanlar),
    kayitFarki('Doğa alanı', st?.doga, yt?.doga),
    kayitFarki('Elle düzeltilen yol', st?.yolDuzeni, yt?.yolDuzeni),
    kayitFarki('Taşınan haritadaki yapı', st?.binaDuzeni, yt?.binaDuzeni),
    kayitFarki('Tür değişikliği', st?.turDegisikligi, yt?.turDegisikligi),
    kumeFarki('Kaldırılan haritadaki öğe', st?.gizlenen, yt?.gizlenen),
    kayitFarki('Mekân düzeltmesi', s?.mekanlar, y?.mekanlar),
    kayitFarki('Sınır hattı', s?.hatlar, y?.hatlar),
    kayitFarki('Eski düzenleyicinin yolu', s?.yollar, y?.yollar)
  ];
  const islenenDegisir = JSON.stringify(s?.kurucuIslenen ?? null) !== JSON.stringify(y?.kurucuIslenen ?? null);
  const ayni = !islenenDegisir && JSON.stringify(st ?? null) === JSON.stringify(yt ?? null)
    && satirlar.every(r => !r.gelecek && !r.gidecek && !r.degisecek);
  return { satirlar, islenenDegisir, ayni };
}

/**
 * Viki alanlarını yedekteki hâline döndürecek kayıtlar (saf iş). Yalnız
 * farklı olan maddeler; yedekte olmayan alan maddeden çıkarılır (tanımsız
 * yazılmaz). Yedekten sonra açılan ya da silinen maddeye dokunulmaz.
 */
export function vikiGeriYuklemeleri(items: Item[], yedekte: VikiHaritaAlani[], zaman = Date.now()): Item[] {
  const kimlik = new Map(items.map(i => [i.id, i]));
  const cikti: Item[] = [];
  for (const v of yedekte) {
    const i = kimlik.get(v.id);
    if (!i) continue;
    const m: Record<string, unknown> = { ...(i.metadata || {}) };
    for (const a of VIKI_HARITA_ALANLARI) {
      if (v.metadata[a] !== undefined) m[a] = v.metadata[a];
      else delete m[a];
    }
    const notes = v.notes !== undefined ? v.notes : i.notes;
    const eskiM = (i.metadata || {}) as Record<string, unknown>;
    const degisti = notes !== i.notes
      || VIKI_HARITA_ALANLARI.some(a => JSON.stringify(eskiM[a] ?? null) !== JSON.stringify(m[a] ?? null));
    if (degisti) cikti.push({ ...i, metadata: m as Item['metadata'], ...(notes !== undefined ? { notes } : {}), updatedAt: zaman });
  }
  return cikti;
}

/** İçeriği parçalara böler (saf iş) */
export function parcala(metin: string, boy = PARCA_BOYU): string[] {
  const p: string[] = [];
  for (let i = 0; i < metin.length; i += boy) p.push(metin.slice(i, i + boy));
  return p.length ? p : [''];
}

// ---- ağ ----------------------------------------------------------------------

const yedekler = (uid: string) => collection(db, 'users', uid, 'haritaYedekleri');
const parcalar = (uid: string, id: string) => collection(db, 'users', uid, 'haritaYedekleri', id, 'parcalar');

/** Buluttaki yedekler, yeniden eskiye (yalnız baş belgeler okunur) */
export async function yedekleriListele(uid: string): Promise<YedekBasi[]> {
  const s = await sunucuyaUlas(getDocs(yedekler(uid)));
  return s.docs.map(d => d.data() as YedekBasi)
    .filter(b => b && typeof b.id === 'string' && Number.isFinite(b.olusturma))
    .sort((a, b) => b.olusturma - a.olusturma);
}

/**
 * Yedeği buluta yazar: baş belge ve parçalar tek toplu yazmada. `sil`
 * verilirse (Kemal'in onayıyla) o eski yedek aynı yazmada silinir.
 */
export async function yedegiBulutaYaz(uid: string, yedek: HaritaYedegi, sil?: YedekBasi): Promise<YedekBasi> {
  const metin = JSON.stringify(yedek);
  const p = parcala(metin);
  if (p.length > EN_COK_PARCA) throw new Error(`yedek çok büyük (${Math.round(metin.length / 1000)} bin karakter)`);
  const id = yedekKimligi(new Date(yedek.olusturma));
  const bas: YedekBasi = {
    id, olusturma: yedek.olusturma, parcaSayisi: p.length, boyut: metin.length,
    ozet: { yapi: yedek.ozet.yapi, yol: yedek.ozet.yol, bag: yedek.ozet.bag, oturanEv: yedek.ozet.oturanEv, vikiMadde: yedek.ozet.vikiMadde }
  };
  const toplu = writeBatch(db);
  if (sil) {
    const eski = await sunucuyaUlas(getDocs(parcalar(uid, sil.id)));
    eski.docs.forEach(d => toplu.delete(d.ref));
    toplu.delete(doc(yedekler(uid), sil.id));
  }
  toplu.set(doc(yedekler(uid), id), { ...bas, userId: uid });
  p.forEach((veri, sira) => toplu.set(doc(parcalar(uid, id), String(sira)), { sira, veri }));
  await sunucuyaUlas(toplu.commit());
  return bas;
}

/** Buluttaki yedeği okur (parçaları birleştirir) */
export async function yedegiOku(uid: string, bas: YedekBasi): Promise<HaritaYedegi> {
  const s = await sunucuyaUlas(getDocs(parcalar(uid, bas.id)));
  const p = s.docs.map(d => d.data() as { sira: number; veri: string }).sort((a, b) => a.sira - b.sira);
  if (p.length !== bas.parcaSayisi) throw new Error(`yedeğin ${bas.parcaSayisi} parçasından ${p.length} tanesi okunabildi`);
  const y = JSON.parse(p.map(x => x.veri).join('')) as unknown;
  if (!yedekMi(y)) throw new Error('yedek okunamadı');
  return y;
}

/** Yedeği bilgisayara indirir */
export function yedegiIndir(yedek: HaritaYedegi, onEk = 'kkm-harita-yedegi') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' }));
  a.download = `${onEk}-${new Date(yedek.olusturma).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Firestore "izin yok" hatası mı (kural yayımlanmamış) */
export const kuralHatasiMi = (e: unknown) => {
  const kod = (e as { code?: string } | null)?.code;
  return kod === 'permission-denied' || /permission|insufficient/i.test(e instanceof Error ? e.message : String(e));
};
