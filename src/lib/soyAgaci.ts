import type { Item } from '../types';
import { adiCoz } from './alanSablonu';
import { tarihiOku } from './zamanCizgisi';

/**
 * Soy ağacı (6. gece, 7 Ekim; vvd'den). Kişi maddeleri ve aralarındaki
 * bağlar: aile (ebeveyni, eşi, kardeşi, akrabası) ağacın iskeleti; iş
 * (patronu, iş ortağı), arkadaşlık ve rekabet yanda renkli çizgi.
 *
 * Dönem sürümleri (Kemal'in seçimi): bağın yılları (`relations[].bas/bit`)
 * ve kişinin "Doğum yılı" ya da "Yaşam" alanı. Bir yıl ya da dönem seçilince yalnız o
 * aralıkta geçerli bağlar ve yaşayan kişiler görünür; yılı yazılmamış olan
 * her zaman görünür. Hiçbir şey kayda yazılmaz; ağaç bağlardan çizilir.
 */

export type AileBagi = 'ebeveyni' | 'eşi' | 'kardeşi' | 'akrabası';
/** 'iş yeri': künyede aynı "Çalıştığı yer" yazan kişiler (10 Kasım, bağ kurulmadan) */
export type YanBag = 'patronu' | 'iş ortağı' | 'iş yeri' | 'arkadaşı' | 'rakibi' | 'tanıdığı kişi';
export type SoyBagTuru = AileBagi | YanBag;

const AILE: AileBagi[] = ['ebeveyni', 'eşi', 'kardeşi', 'akrabası'];
const YAN: YanBag[] = ['patronu', 'iş ortağı', 'iş yeri', 'arkadaşı', 'rakibi', 'tanıdığı kişi'];

export interface SoyKisi {
  id: string;
  ad: string;
  aileId?: string;
  /** Evlenip başka aileye geçtiyse doğduğu aile (21 Ekim) */
  dogumAileId?: string;
  /** Yaşam yılları; bit null → yaşıyor/açık uçlu, yoksa bilinmiyor */
  yasam?: { bas: number; bit: number | null };
  yasamMetni?: string;
  /** Künyedeki rol (10 Kasım, kutuda ve yan panelde) */
  rol?: string;
  /** Künyedeki "Soyadı"nın karşılığı olan aile (24 Kasım; şimdi kullandığı soyadı) */
  soyadiAileId?: string;
  /** Doğduğu aile ya da doğumdaki soyadı yazılı ama vikide o aile yok (24 Kasım; ör. "Atabey") */
  dogumAilesiYok?: boolean;
}

/** a → b: ebeveyni'de a çocuk, b ebeveyn; ötekilerde yönsüz */
export interface SoyBagi { id: string; a: string; b: string; tur: SoyBagTuru; bas?: number; bit?: number }

export interface SoyVerisi { kisiler: SoyKisi[]; baglar: SoyBagi[]; aileler: Array<{ id: string; ad: string }> }

const KISI = new Set(['kisi', 'karakter']);

/** "Bilinmiyor" yazılmış alan boş sayılır (20 Kasım) */
const bilinen = (s: string) => (/^\s*bilinmiyor\W*$/i.test(s) ? '' : s.trim());

/**
 * Kutudaki yıllar (20 Kasım, Kemal): önce künyedeki "Doğum yılı" ("1990" → "1990–");
 * Yaşam'da ölüm yılı yazılıysa ("1990–2050") o da eklenir. Doğum yılı boşsa ya da
 * yıl okunamıyorsa eskisi gibi Yaşam. Yalnız okunur, kayda yazılmaz.
 */
export function yasamOku(dogumHam: string, yasamHam: string): { yasam?: { bas: number; bit: number | null }; yasamMetni?: string } {
  const dogum = bilinen(dogumHam);
  const yasamMetni = bilinen(yasamHam);
  const ty = yasamMetni ? tarihiOku(yasamMetni) : null;
  const td = dogum ? tarihiOku(dogum) : null;
  if (td) {
    const olum = ty && typeof ty.bit === 'number' && ty.bit >= td.bas && /\d\s*[–—-]\s*\d/.test(yasamMetni) ? ty.bit : null;
    // Onyıl ("1990'lar") yazıldıysa o yazı kalır; tek yıl yalnız yıl olarak
    const bas = td.yaklasik ? dogum.replace(/\s*[–—-]\s*$/, '') : String(td.bas);
    return { yasam: { bas: td.bas, bit: olum }, yasamMetni: `${bas}–${olum ?? ''}` };
  }
  // Tek yıl doğum sayılır: o yıldan sonrası açık uçlu
  return {
    ...(ty ? { yasam: { bas: ty.bas, bit: ty.bit === undefined ? null : ty.bit } } : {}),
    ...(yasamMetni ? { yasamMetni } : {})
  };
}

/**
 * Künyedeki rol: önce kişinin kendi "Rol" alanı; yoksa künyeden okunan değer.
 * Harfle başlamayan parça (metinden yanlış ayrılmış "), Stadyum…" gibi) gösterilmez (24 Kasım).
 */
function rolOku(i: Item, degerOku: (i: Item, alanId: string) => string): string {
  const kendi = (i.metadata?.profile as Record<string, unknown> | undefined)?.profession;
  const r = (typeof kendi === 'string' && kendi.trim() ? kendi : degerOku(i, 'profession')).trim();
  return /^[\p{L}\d"“'‘]/u.test(r) ? r : '';
}

export function soyVerisi(items: Item[], degerOku: (i: Item, alanId: string) => string): SoyVerisi {
  const canli = items.filter(i => !i.archived && !i.isProposal);
  const aileler = canli.filter(i => i.type === 'aile').map(i => ({ id: i.id, ad: i.title.trim() })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const aileKayitlari = canli.filter(i => i.type === 'aile');
  const kisiKayitlari = canli.filter(i => KISI.has(i.type));
  const var_ = new Set(kisiKayitlari.map(i => i.id));

  const kisiler: SoyKisi[] = kisiKayitlari.map(i => {
    const aileAdi = degerOku(i, 'aile') || degerOku(i, 'soyadi');
    const aile = aileAdi ? adiCoz(aileAdi, aileKayitlari) : null;
    const soyadi = degerOku(i, 'soyadi');
    const soyadiAile = soyadi ? adiCoz(soyadi, aileKayitlari) : null;
    const dogumAdi = degerOku(i, 'dogumAilesi') || degerOku(i, 'dogumSoyadi');
    const dogumAile = dogumAdi ? adiCoz(dogumAdi, aileKayitlari) : null;
    const { yasam, yasamMetni } = yasamOku(degerOku(i, 'dogumYili'), degerOku(i, 'yasam'));
    return {
      id: i.id, ad: i.title.trim(),
      ...(aile ? { aileId: aile.id } : {}),
      ...(soyadiAile ? { soyadiAileId: soyadiAile.id } : {}),
      ...(dogumAile ? { dogumAileId: dogumAile.id } : {}),
      ...(bilinen(dogumAdi) && !dogumAile ? { dogumAilesiYok: true } : {}),
      ...(yasam ? { yasam } : {}),
      ...(yasamMetni ? { yasamMetni } : {}),
      ...(rolOku(i, degerOku) ? { rol: rolOku(i, degerOku) } : {})
    };
  });

  const baglar = new Map<string, SoyBagi>();
  for (const i of kisiKayitlari) {
    for (const r of (i.metadata?.relations as Array<{ targetId?: string; type?: string; bas?: unknown; bit?: unknown }> | undefined) || []) {
      const tur = r?.type as SoyBagTuru;
      if (!r?.targetId || !var_.has(r.targetId) || r.targetId === i.id) continue;
      if (!AILE.includes(tur as AileBagi) && !YAN.includes(tur as YanBag)) continue;
      // Yönlü: ebeveyni (çocuk → ebeveyn) ve patronu (çalışan → patron); ötekiler yönsüz
      const yonlu = tur === 'ebeveyni' || tur === 'patronu';
      const [a, b] = yonlu ? [i.id, r.targetId] : [i.id, r.targetId].sort();
      const id = `${a}|${b}|${tur}`;
      if (baglar.has(id)) continue;
      baglar.set(id, {
        id, a, b, tur,
        ...(typeof r.bas === 'number' ? { bas: r.bas } : {}),
        ...(typeof r.bit === 'number' ? { bit: r.bit } : {})
      });
    }
  }
  // Künyeden gelen bağlar (10 Kasım): "Eşi" alanı eş bağı, aynı "Çalıştığı yer"
  // iş yeri bağı sayılır. Elle kurulmuş bağ varsa o geçerli; ikincisi eklenmez.
  const ekle = (a: string, b: string, tur: SoyBagTuru) => {
    if (a === b) return;
    const [x, y] = [a, b].sort();
    const id = `${x}|${y}|${tur}`;
    if (!baglar.has(id)) baglar.set(id, { id, a: x, b: y, tur });
  };
  for (const i of kisiKayitlari) {
    const esAdi = degerOku(i, 'eşi').trim();
    const es = esAdi ? adiCoz(esAdi, kisiKayitlari) : null;
    if (es) ekle(i.id, es.id, 'eşi');
  }
  const isYeri = new Map<string, string[]>();
  for (const i of kisiKayitlari) {
    const yer = degerOku(i, 'workplace').trim().toLocaleLowerCase('tr').replace(/\s*\(.*\)\s*$/, '');
    if (!yer || /^(bilinmiyor|evi|kendi işi)/.test(yer)) continue;
    isYeri.set(yer, [...(isYeri.get(yer) || []), i.id]);
  }
  // Aynı yerde çalışanlar zincir olarak bağlanır (kalabalık yerde çizgi yığılmasın)
  for (const ids of isYeri.values()) for (let n = 1; n < ids.length; n++) ekle(ids[n - 1], ids[n], 'iş yeri');

  return { kisiler: kisiler.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')), baglar: Array.from(baglar.values()), aileler };
}

/**
 * Ağaçta görünecek kişiler (10 Kasım, Kemal: "bağı olmayanları hiç çıkarma").
 * Görünen bir bağı olan ya da ailesinde başka biri de görünen kişi kalır;
 * hiç bağı olmayan kişi çıkar.
 */
export function bagliKisiler(kisiler: SoyKisi[], baglar: SoyBagi[]): SoyKisi[] {
  const bagli = new Set(baglar.flatMap(b => [b.a, b.b]));
  const aileSayisi = new Map<string, number>();
  for (const k of kisiler) for (const a of [k.aileId, k.dogumAileId]) if (a) aileSayisi.set(a, (aileSayisi.get(a) || 0) + 1);
  return kisiler.filter(k => bagli.has(k.id)
    || (!!k.aileId && (aileSayisi.get(k.aileId) || 0) > 1)
    || (!!k.dogumAileId && (aileSayisi.get(k.dogumAileId) || 0) > 1));
}

/** Bağ ya da kişi bu aralıkta geçerli mi? Yılı yoksa her zaman geçerli. */
const aralikta = (bas: number | undefined, bit: number | null | undefined, a: number, b: number) =>
  (bas === undefined || bas <= b) && (bit === undefined || bit === null || bit >= a);

export interface SoySuzgeci {
  /** [başlangıç, bitiş]; null → bütün zamanlar */
  aralik: [number, number] | null;
  aileId: string | null;
  yanlar: Set<YanBag>;
}

export function suz(v: SoyVerisi, s: SoySuzgeci): { kisiler: SoyKisi[]; baglar: SoyBagi[] } {
  let kisiler = s.aralik ? v.kisiler.filter(k => !k.yasam || aralikta(k.yasam.bas, k.yasam.bit, s.aralik![0], s.aralik![1])) : v.kisiler;
  let baglar = v.baglar.filter(b => (AILE.includes(b.tur as AileBagi) || s.yanlar.has(b.tur as YanBag))
    && (!s.aralik || aralikta(b.bas, b.bit, s.aralik[0], s.aralik[1])));
  if (s.aileId) {
    // Ailenin kişileri ve onlara aile bağıyla bağlı olanlar (gelinler, damatlar)
    const uye = new Set(kisiler.filter(k => k.aileId === s.aileId || k.dogumAileId === s.aileId).map(k => k.id));
    const yakin = new Set(uye);
    for (const b of baglar) {
      if (!AILE.includes(b.tur as AileBagi)) continue;
      if (uye.has(b.a)) yakin.add(b.b);
      if (uye.has(b.b)) yakin.add(b.a);
    }
    kisiler = kisiler.filter(k => yakin.has(k.id));
  }
  const gorunen = new Set(kisiler.map(k => k.id));
  baglar = baglar.filter(b => gorunen.has(b.a) && gorunen.has(b.b));
  return { kisiler, baglar };
}

/** Ağacın ve kişilerin yıllarından kaydırıcının sınırları */
export function yilSiniri(v: SoyVerisi): [number, number] | null {
  const yillar = [
    ...v.baglar.flatMap(b => [b.bas, b.bit]),
    ...v.kisiler.flatMap(k => (k.yasam ? [k.yasam.bas, k.yasam.bit ?? undefined] : []))
  ].filter((y): y is number => typeof y === 'number');
  if (!yillar.length) return null;
  return [Math.min(...yillar), Math.max(...yillar)];
}

// ---------------------------------------------------------------------------
// 24 Kasım (Kemal: "genel bir soy ağacı istiyorum; bunları aile maddelerinde
// kullanabilirsin"): aile maddesinin kuşak ağacı ile Görünümler → Soy ağacı
// aynı adlandırmayı, aynı yerleşimi ve aynı çizgileri kullanır. Hepsi yalnız
// ekranda hesaplanır; kayda bir şey yazılmaz.
// ---------------------------------------------------------------------------

/**
 * Kişinin ekranda yazılan adı. Köşeli ayraçlı yer tutucu ("[ad: Kemal] Ercan")
 * hiç görünmez: adı henüz konmamış kişi yalnız soyadıyla yazılır, önüne soluk
 * bir "—" gelir (Kemal, 24 Kasım). `ad` yer tutucusuz kalan kısımdır.
 */
export function adParcalari(baslik: string): { ad: string; adsiz: boolean } {
  const adsiz = /\[[^\]]*\]/.test(baslik);
  const ad = baslik.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  return { ad, adsiz };
}

/** Kişinin harfi (portresi yokken dairede): yalnız harf; köşeli ve normal ayraç içi atlanır */
export function kisiHarfi(baslik: string): string {
  const s = baslik.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  return (s.match(/\p{L}/u)?.[0] || '').toLocaleUpperCase('tr');
}

/**
 * Kişinin "evi" sayılan aile: şimdi kullandığı soyadının ailesi, yoksa künyedeki
 * "Aile", o da yoksa doğduğu aile. Evlenip soyadı değişen kişi eşinin ailesinde
 * durur; doğduğu aileye kısa bir okla bağlanır.
 */
export const anaAileId = (k: SoyKisi): string | undefined => k.soyadiAileId ?? k.aileId ?? k.dogumAileId;

export interface AgacOlcu {
  /** Kutunun eni ve boyu */
  en: number; boy: number;
  /** Kardeş kutuları arası, kuşaklar arası ve eşler arası boşluk */
  araX: number; araY: number; esAra: number;
}
export interface AgacDugumu { id: string; ad: string; dogum?: number }
/** ebeveyni: a çocuk, b ebeveyn; eşi ve kardeşi yönsüz */
export interface AgacKenari { a: string; b: string; tur: 'ebeveyni' | 'eşi' | 'kardeşi' }
export interface AgacYerlesimi {
  /** Kutunun sol üst köşesi; en soldaki x = 0, en üstteki y = 0 */
  konum: Map<string, { x: number; y: number }>;
  kusak: Map<string, number>;
  en: number;
  boy: number;
}

/** Kuşak: ebeveynin bir altı; eşler ve kardeşler aynı kuşakta. Bağı olmayan doğum yılına göre. */
function kusaklariBul(dugumler: AgacDugumu[], kenarlar: AgacKenari[]): Map<string, number> {
  const ids = dugumler.map(d => d.id);
  const kusak = new Map<string, number>(ids.map(id => [id, 0]));
  const ebeveyn = kenarlar.filter(k => k.tur === 'ebeveyni');
  const yatay = kenarlar.filter(k => k.tur !== 'ebeveyni');
  for (let tur = 0; tur < 16; tur++) {
    let degisti = false;
    for (const k of ebeveyn) {
      const y = (kusak.get(k.b) ?? 0) + 1;
      if (y > (kusak.get(k.a) ?? 0) && y < 40) { kusak.set(k.a, y); degisti = true; }
    }
    for (const k of yatay) {
      const y = Math.max(kusak.get(k.a) ?? 0, kusak.get(k.b) ?? 0);
      if (kusak.get(k.a) !== y || kusak.get(k.b) !== y) { kusak.set(k.a, y); kusak.set(k.b, y); degisti = true; }
    }
    if (!degisti) break;
  }
  // Hiç bağı olmayan kişi: doğum yılı ortalaması en yakın kuşağa
  const bagli = new Set(kenarlar.flatMap(k => [k.a, k.b]));
  const yillar = new Map<number, number[]>();
  for (const d of dugumler) if (bagli.has(d.id) && d.dogum !== undefined) {
    const k = kusak.get(d.id)!;
    yillar.set(k, [...(yillar.get(k) || []), d.dogum]);
  }
  const ort = [...yillar.entries()].map(([k, l]) => [k, l.reduce((a, b) => a + b, 0) / l.length] as const);
  if (ort.length) for (const d of dugumler) {
    if (bagli.has(d.id) || d.dogum === undefined) continue;
    kusak.set(d.id, ort.reduce((en, o) => (Math.abs(o[1] - d.dogum!) < Math.abs(en[1] - d.dogum!) ? o : en))[0]);
  }
  return kusak;
}

/**
 * Soy ağacı yerleşimi (24 Kasım): eşler tek birim olarak yan yana, çocukları
 * birimin tam altında ve ortalı; her kök kendi şeridinde, kardeş kökler yan
 * yana. Kutular üst üste binmez, çizgiler kesişmez (her alt ağaç kendi
 * genişliğinde durur).
 */
export function agacDiz(dugumler: AgacDugumu[], kenarlar: AgacKenari[], o: AgacOlcu): AgacYerlesimi {
  const var_ = new Set(dugumler.map(d => d.id));
  const kenar = kenarlar.filter(k => var_.has(k.a) && var_.has(k.b) && k.a !== k.b);
  const kusak = kusaklariBul(dugumler, kenar);
  const dugum = new Map(dugumler.map(d => [d.id, d]));
  const ebeveynleri = new Map<string, string[]>();
  const esleri = new Map<string, string[]>();
  const kardesleri = new Map<string, string[]>();
  const ekle = (m: Map<string, string[]>, a: string, b: string) => { if (!(m.get(a) || []).includes(b)) m.set(a, [...(m.get(a) || []), b]); };
  for (const k of kenar) {
    if (k.tur === 'ebeveyni') ekle(ebeveynleri, k.a, k.b);
    else if (k.tur === 'eşi') { ekle(esleri, k.a, k.b); ekle(esleri, k.b, k.a); }
    else { ekle(kardesleri, k.a, k.b); ekle(kardesleri, k.b, k.a); }
  }
  const dogumSirasi = (a: string, b: string) => {
    const da = dugum.get(a)?.dogum, db = dugum.get(b)?.dogum;
    if (da !== undefined && db !== undefined && da !== db) return da - db;
    if (da === undefined && db !== undefined) return 1;
    if (db === undefined && da !== undefined) return -1;
    return (dugum.get(a)?.ad || '').localeCompare(dugum.get(b)?.ad || '', 'tr');
  };

  // Birimler: aynı kuşaktaki eşler bir arada (ebeveyni ağaçta olan önce)
  const birimi = new Map<string, number>();
  const birimler: string[][] = [];
  for (const d of [...dugumler].sort((a, b) => dogumSirasi(a.id, b.id))) {
    if (birimi.has(d.id)) continue;
    const grup: string[] = [];
    const yigin = [d.id];
    while (yigin.length) {
      const x = yigin.pop()!;
      if (grup.includes(x) || birimi.has(x)) continue;
      grup.push(x);
      for (const e of esleri.get(x) || []) if (kusak.get(e) === kusak.get(d.id)) yigin.push(e);
    }
    const kanli = (x: string) => ((ebeveynleri.get(x) || []).length ? 0 : 1);
    let sira = [...grup].sort((a, b) => kanli(a) - kanli(b) || dogumSirasi(a, b));
    // Üç ve daha çok eş: en çok eşi olan ortada
    if (sira.length > 2) {
      const orta = [...sira].sort((a, b) => (esleri.get(b)?.length || 0) - (esleri.get(a)?.length || 0))[0];
      const kalan = sira.filter(x => x !== orta);
      sira = [...kalan.filter((_, n) => n % 2 === 1), orta, ...kalan.filter((_, n) => n % 2 === 0)];
    }
    const n = birimler.length;
    birimler.push(sira);
    for (const x of sira) birimi.set(x, n);
  }

  // Her birimin üst birimi: ebeveyni ağaçta olan ilk üyenin ebeveyninin birimi
  const ust = new Map<number, number>();
  birimler.forEach((b, n) => {
    for (const x of b) {
      const p = (ebeveynleri.get(x) || [])[0];
      if (p !== undefined && birimi.get(p) !== n) { ust.set(n, birimi.get(p)!); break; }
    }
  });
  const altlar = new Map<number, number[]>();
  for (const [n, u] of ust) altlar.set(u, [...(altlar.get(u) || []), n]);
  const ilkDogum = (n: number) => [...birimler[n]].sort(dogumSirasi)[0];
  for (const l of altlar.values()) l.sort((a, b) => dogumSirasi(ilkDogum(a), ilkDogum(b)));

  // Kökler: üst birimi olmayanlar; kuşağa ve doğuma göre, kardeş kökler yan yana
  const kokler = birimler.map((_, n) => n).filter(n => !ust.has(n))
    .sort((a, b) => (kusak.get(birimler[a][0])! - kusak.get(birimler[b][0])!) || dogumSirasi(ilkDogum(a), ilkDogum(b)));
  const kokSirasi: number[] = [];
  for (const k of kokler) {
    if (kokSirasi.includes(k)) continue;
    kokSirasi.push(k);
    for (const x of birimler[k]) for (const kd of kardesleri.get(x) || []) {
      const kb = birimi.get(kd)!;
      if (!ust.has(kb) && !kokSirasi.includes(kb)) kokSirasi.push(kb);
    }
  }

  const kendiEni = (n: number) => birimler[n].length * o.en + (birimler[n].length - 1) * o.esAra;
  const genislik = new Map<number, number>();
  const gen = (n: number, yol: Set<number> = new Set()): number => {
    if (genislik.has(n)) return genislik.get(n)!;
    if (yol.has(n)) return kendiEni(n);
    yol.add(n);
    const a = altlar.get(n) || [];
    const toplam = a.reduce((t, x) => t + gen(x, yol), 0) + Math.max(0, a.length - 1) * o.araX;
    const w = Math.max(kendiEni(n), toplam);
    genislik.set(n, w);
    return w;
  };
  const konum = new Map<string, { x: number; y: number }>();
  const yerlesti = new Set<number>();
  const yerlestir = (n: number, sol: number) => {
    if (yerlesti.has(n)) return;
    yerlesti.add(n);
    const w = gen(n);
    const a = altlar.get(n) || [];
    const toplam = a.reduce((t, x) => t + gen(x), 0) + Math.max(0, a.length - 1) * o.araX;
    let x = sol + (w - toplam) / 2;
    const merkezler: number[] = [];
    for (const c of a) {
      yerlestir(c, x);
      const ilk = konum.get(birimler[c][0]), son = konum.get(birimler[c][birimler[c].length - 1]);
      if (ilk && son) merkezler.push((ilk.x + son.x + o.en) / 2);
      x += gen(c) + o.araX;
    }
    const ke = kendiEni(n);
    const hedef = merkezler.length ? (merkezler[0] + merkezler[merkezler.length - 1]) / 2 - ke / 2 : sol + (w - ke) / 2;
    const bas = Math.min(Math.max(hedef, sol), sol + w - ke);
    birimler[n].forEach((id, i) => konum.set(id, { x: bas + i * (o.en + o.esAra), y: kusak.get(id)! * (o.boy + o.araY) }));
  };
  let sol = 0;
  for (const k of kokSirasi) { yerlestir(k, sol); sol += gen(k) + o.araX; }
  // Döngüde kalan (olmamalı) birimler de yer bulsun
  birimler.forEach((_, n) => { if (!yerlesti.has(n)) { yerlestir(n, sol); sol += gen(n) + o.araX; } });

  const xs = [...konum.values()].map(p => p.x), ys = [...konum.values()].map(p => p.y);
  const mx = xs.length ? Math.min(...xs) : 0, my = ys.length ? Math.min(...ys) : 0;
  for (const [id, p] of konum) konum.set(id, { x: p.x - mx, y: p.y - my });
  return {
    konum, kusak,
    en: xs.length ? Math.max(...xs) - mx + o.en : 0,
    boy: ys.length ? Math.max(...ys) - my + o.boy : 0
  };
}

export interface AgacCizgisi { id: string; d: string; tur: 'eşi' | 'çocuk' | 'kardeşi' }

/**
 * Çizgiler: eşler arasında kısa çift çizgi; çocuğa eşlerin ortasından inen
 * dik çizgi (tek ebeveynde kutunun altından); ortak ebeveyni görünmeyen
 * kardeşlerin üstünde kısa köşeli çizgi. Uzun çapraz çizgi yok.
 */
export function agacCizgileri(konum: Map<string, { x: number; y: number }>, kenarlar: AgacKenari[], o: AgacOlcu): AgacCizgisi[] {
  const cizgiler: AgacCizgisi[] = [];
  const yanyana = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.y - b.y) < 1 && Math.abs(Math.abs(a.x - b.x) - (o.en + o.esAra)) < 1;
  const esCifti = new Set<string>();
  for (const k of kenarlar) {
    if (k.tur !== 'eşi') continue;
    const a = konum.get(k.a), b = konum.get(k.b);
    if (!a || !b || !yanyana(a, b)) continue;
    esCifti.add([k.a, k.b].sort().join('|'));
    const [s, g] = a.x < b.x ? [a, b] : [b, a];
    cizgiler.push({ id: `e-${k.a}-${k.b}`, tur: 'eşi', d: `M${s.x + o.en},${s.y + o.boy / 2} H${g.x}` });
  }
  const ebeveynleri = new Map<string, string[]>();
  for (const k of kenarlar) if (k.tur === 'ebeveyni' && konum.has(k.a) && konum.has(k.b)) ebeveynleri.set(k.a, [...(ebeveynleri.get(k.a) || []), k.b]);
  for (const [c, ps] of ebeveynleri) {
    const cp = konum.get(c)!;
    const cx = cp.x + o.en / 2;
    const bus = cp.y - o.araY / 2;
    const cift = ps.length >= 2 ? ps.find((p, i) => ps.slice(i + 1).some(q => esCifti.has([p, q].sort().join('|')))) : undefined;
    let ax: number, ay: number;
    if (cift) {
      const es = ps.find(q => q !== cift && esCifti.has([cift, q].sort().join('|')))!;
      const a = konum.get(cift)!, b = konum.get(es)!;
      ax = (Math.min(a.x, b.x) + o.en + Math.max(a.x, b.x)) / 2; ay = a.y + o.boy / 2;
    } else {
      // Tek ebeveyn ya da yan yana olmayan ebeveynler: en yakın ebeveynin altından
      const p = ps.map(id => konum.get(id)!).sort((a, b) => Math.abs(a.x + o.en / 2 - cx) - Math.abs(b.x + o.en / 2 - cx))[0];
      ax = p.x + o.en / 2; ay = p.y + o.boy;
    }
    cizgiler.push({ id: `c-${c}`, tur: 'çocuk', d: `M${ax},${ay} V${bus} H${cx} V${cp.y}` });
  }
  for (const k of kenarlar) {
    if (k.tur !== 'kardeşi') continue;
    const a = konum.get(k.a), b = konum.get(k.b);
    if (!a || !b || Math.abs(a.y - b.y) > 1) continue;
    const ortak = (ebeveynleri.get(k.a) || []).some(p => (ebeveynleri.get(k.b) || []).includes(p));
    if (ortak) continue;
    const ust = a.y - Math.min(16, o.araY / 3);
    cizgiler.push({ id: `k-${k.a}-${k.b}`, tur: 'kardeşi', d: `M${a.x + o.en / 2},${a.y} V${ust} H${b.x + o.en / 2} V${b.y}` });
  }
  return cizgiler;
}


// ---------------------------------------------------------------------------
// Tek soy ağacı (24 Kasım akşam, Kemal: "Aile gruplandırmalarını kaldır,
// yalnızca doğduğu ailenin rengi kartın solunda ince bir şerit olarak
// duruyor ya, o kalsın").
//
// Bütün ada tek ağaç: aile çerçevesi ve kopya kart yok, her kişi tek kartta.
// Kuşaklar yukarıdan aşağı, eşler yan yana, çocuklar anne-babasının ortasının
// altında. Çizgiler yalnız kuşaklar arasındaki boşlukta yürür; kartın üstünden
// geçmez. Ebeveyni ağaçta olmayan kardeşler küçük bir köşeli çizgiyle birleşir.
// Akraba bağı çizilmez (seçili kişinin kartında yazar). Yalnız ekranda
// hesaplanır; kayda bir şey yazılmaz.
// ---------------------------------------------------------------------------

/** Kartın solundaki şeridin ailesi: doğduğu aile; doğduğu aile yazılı ama vikide yoksa hiçbiri */
export const dogduguAile = (k: SoyKisi): string | undefined =>
  k.dogumAileId ?? (k.dogumAilesiYok ? undefined : k.aileId ?? k.soyadiAileId);

export interface TekAgacCizgisi {
  id: string; d: string;
  tur: 'eşi' | 'çocuk' | 'kardeşi';
  /** Çizginin bağladığı kişiler (seçili kişide vurgulanır) */
  kisiler: string[];
}

export interface TekAgac {
  /** Kartın sol üst köşesi; en sol ve en üst 0 */
  konum: Map<string, { x: number; y: number }>;
  kusak: Map<string, number>;
  cizgiler: TekAgacCizgisi[];
  /** Birbirine kan ya da evlilikle bağlı kişi kümeleri, soldan sağa (ilk ekran için) */
  kumeler: Array<{ x: number; en: number; kisiler: string[] }>;
  en: number; boy: number;
  /** Ağaçta doğru gösterilemeyen bağlar (ör. ebeveynleri evli görünmeyen çocuk) */
  notlar: string[];
}

interface Birim {
  no: number;
  /** Soldan sağa kartlar; kardeş kümesinin sanal biriminde boş */
  uyeler: string[];
  kusak: number;
  sanal: boolean;
  /** Ağaçtaki yeri: üst birim (yalnız bir tane) */
  ust?: number;
  altlar: number[];
  /** Evlilikle ikinci bir aileye bağlı birim: eşin ailesi */
  misafir?: { uye: string; birim: number };
  /** Ağacın kenarına yaslanması gereken yol: 'sol' ya da 'sag' */
  kenar?: 'sol' | 'sag';
  x: number;
}

export function tekAgac(kisiler: SoyKisi[], baglar: SoyBagi[], o: AgacOlcu): TekAgac {
  const kisi = new Map(kisiler.map(k => [k.id, k]));
  const ids = kisiler.map(k => k.id);
  const notlar: string[] = [];
  const ad = (id: string) => adParcalari(kisi.get(id)?.ad || '').ad;
  const listeEkle = (m: Map<string, string[]>, a: string, b: string) => {
    const l = m.get(a) || [];
    if (!l.includes(b)) m.set(a, [...l, b]);
  };
  const ebeveynleri = new Map<string, string[]>(), cocuklari = new Map<string, string[]>();
  const esleri = new Map<string, string[]>(), kardesleri = new Map<string, string[]>(), akrabalari = new Map<string, string[]>();
  for (const b of baglar) {
    if (!kisi.has(b.a) || !kisi.has(b.b) || b.a === b.b) continue;
    if (b.tur === 'ebeveyni') {
      // Ters yönde de ebeveyn yazılmışsa (döngü) ikincisi alınmaz
      if ((ebeveynleri.get(b.b) || []).includes(b.a)) continue;
      listeEkle(ebeveynleri, b.a, b.b); listeEkle(cocuklari, b.b, b.a);
    } else if (b.tur === 'eşi') { listeEkle(esleri, b.a, b.b); listeEkle(esleri, b.b, b.a); }
    else if (b.tur === 'kardeşi') { listeEkle(kardesleri, b.a, b.b); listeEkle(kardesleri, b.b, b.a); }
    else if (b.tur === 'akrabası') { listeEkle(akrabalari, b.a, b.b); listeEkle(akrabalari, b.b, b.a); }
  }
  const dogum = (id: string) => kisi.get(id)?.yasam?.bas;
  const dogumSirasi = (a: string, b: string) => {
    const da = dogum(a), db = dogum(b);
    if (da !== undefined && db !== undefined && da !== db) return da - db;
    if (da === undefined && db !== undefined) return 1;
    if (db === undefined && da !== undefined) return -1;
    return ad(a).localeCompare(ad(b), 'tr');
  };

  // ---- Kuşaklar: çocuk ebeveynin bir altında; eşler ve kardeşler aynı sırada;
  // ebeveyni olmayan kişi en genç çocuğunun bir üstüne iner (gelinin anne-babası gibi)
  const kusak = new Map<string, number>(ids.map(id => [id, 0]));
  const yatay = [...esleri, ...kardesleri].flatMap(([a, l]) => l.map(b => [a, b] as const));
  for (let tur = 0; tur < 80; tur++) {
    let degisti = false;
    const koy = (id: string, k: number) => { if (k > kusak.get(id)! && k < 60) { kusak.set(id, k); degisti = true; } };
    for (const [c, ps] of ebeveynleri) for (const p of ps) koy(c, kusak.get(p)! + 1);
    for (const [a, b] of yatay) { const k = Math.max(kusak.get(a)!, kusak.get(b)!); koy(a, k); koy(b, k); }
    for (const [p, cs] of cocuklari) koy(p, Math.min(...cs.map(c => kusak.get(c)!)) - 1);
    if (!degisti) break;
  }

  // ---- Kümeler: kan ve evlilik bağıyla birbirine ulaşılan kişiler
  const kumeNo = new Map<string, number>();
  const kumeler: string[][] = [];
  for (const id of [...ids].sort(dogumSirasi)) {
    if (kumeNo.has(id)) continue;
    const n = kumeler.length, kume: string[] = [], yigin = [id];
    kumeNo.set(id, n);
    while (yigin.length) {
      const x = yigin.pop()!;
      kume.push(x);
      for (const y of [...(ebeveynleri.get(x) || []), ...(cocuklari.get(x) || []), ...(esleri.get(x) || []), ...(kardesleri.get(x) || [])]) {
        if (!kumeNo.has(y)) { kumeNo.set(y, n); yigin.push(y); }
      }
    }
    kumeler.push(kume);
  }

  // Ayrı kümeler doğum yıllarına göre aynı kuşak sırasına oturur: en kalabalık
  // kümenin kuşak–yıl doğrusuna en yakın kaydırma
  const sira = kumeler.map((_, n) => n).sort((a, b) => kumeler[b].length - kumeler[a].length || dogumSirasi(kumeler[a][0], kumeler[b][0]));
  const yilli = (n: number) => kumeler[n].filter(id => dogum(id) !== undefined).map(id => [kusak.get(id)!, dogum(id)!] as const);
  const ref = sira.length ? yilli(sira[0]) : [];
  if (ref.length) {
    const ks = new Set(ref.map(r => r[0]));
    const ok = ref.reduce((t, r) => t + r[0], 0) / ref.length, oy = ref.reduce((t, r) => t + r[1], 0) / ref.length;
    const egim = ks.size > 1
      ? ref.reduce((t, r) => t + (r[0] - ok) * (r[1] - oy), 0) / ref.reduce((t, r) => t + (r[0] - ok) ** 2, 0)
      : 25;
    const beklenen = (k: number) => oy + egim * (k - ok);
    for (const n of sira.slice(1)) {
      const l = yilli(n);
      if (!l.length) continue;
      let enIyi = 0, enAz = Infinity;
      for (let d = -12; d <= 12; d++) {
        const hata = l.reduce((t, r) => t + Math.abs(beklenen(r[0] + d) - r[1]), 0) + Math.abs(d) * 1e-6;
        if (hata < enAz) { enAz = hata; enIyi = d; }
      }
      for (const id of kumeler[n]) kusak.set(id, kusak.get(id)! + enIyi);
    }
  }

  // ---- Birimler: aynı kuşaktaki eşler bir arada
  const birimler: Birim[] = [];
  const birimi = new Map<string, number>();
  for (const id of [...ids].sort(dogumSirasi)) {
    if (birimi.has(id)) continue;
    const grup: string[] = [], yigin = [id];
    while (yigin.length) {
      const x = yigin.pop()!;
      if (grup.includes(x)) continue;
      grup.push(x);
      for (const e of esleri.get(x) || []) if (kusak.get(e) === kusak.get(id) && !birimi.has(e)) yigin.push(e);
    }
    const n = birimler.length;
    birimler.push({ no: n, uyeler: grup.sort(dogumSirasi), kusak: kusak.get(id)!, sanal: false, altlar: [], x: 0 });
    for (const x of grup) birimi.set(x, n);
  }
  for (const [a, l] of esleri) for (const b of l) {
    if (a < b && birimi.get(a) !== birimi.get(b)) notlar.push(`${ad(a)} ile ${ad(b)} eş, ama farklı kuşakta duruyor; eş çizgisi çizilmedi`);
  }

  // Ebeveyni ağaçta olmayan kardeşler: kartsız bir "kardeş birimi" altında toplanır
  const ebeveynVar = (id: string) => (ebeveynleri.get(id) || []).length > 0;
  const kardesBirimi = new Map<string, number>();
  for (const id of [...ids].sort(dogumSirasi)) {
    if (kardesBirimi.has(id) || ebeveynVar(id) || !(kardesleri.get(id) || []).length) continue;
    const grup: string[] = [], yigin = [id];
    while (yigin.length) {
      const x = yigin.pop()!;
      if (grup.includes(x)) continue;
      grup.push(x);
      for (const y of kardesleri.get(x) || []) {
        if (ebeveynVar(y)) notlar.push(`${ad(x)} ile ${ad(y)} kardeş, ama yalnız ${ad(y)} için ebeveyn bağı var; kardeşlik çizilmedi`);
        else yigin.push(y);
      }
    }
    if (grup.length < 2) continue;
    const n = birimler.length;
    birimler.push({ no: n, uyeler: [], kusak: kusak.get(id)! - 1, sanal: true, altlar: [], x: 0 });
    for (const x of grup) kardesBirimi.set(x, n);
  }

  // Kişinin ağaçtaki ailesi: ebeveynlerinin birimi (ya da kardeş birimi)
  const aileBirimi = new Map<string, number>();
  for (const id of ids) {
    const ps = (ebeveynleri.get(id) || []).filter(p => kusak.get(p)! < kusak.get(id)!);
    if (ps.length) {
      const bs = [...new Set(ps.map(p => birimi.get(p)!))];
      aileBirimi.set(id, bs[0]);
      if (bs.length > 1) notlar.push(`${ad(id)}: ebeveynleri (${ps.map(ad).join(', ')}) birbirine eş bağıyla bağlı değil; çizgi her birinden ayrı iner`);
    } else if (kardesBirimi.has(id)) aileBirimi.set(id, kardesBirimi.get(id)!);
  }

  // Kan bağı birimde kalan üye ("evlenip gelen" değil): doğduğu aile yazılmamış ya da ailesiyle aynı
  const evlenipGelen = (id: string) => {
    const k = kisi.get(id)!;
    return !!(k.dogumAileId && k.dogumAileId !== anaAileId(k)) || !!k.dogumAilesiYok;
  };
  for (const b of birimler) {
    if (b.sanal) continue;
    const kanli = b.uyeler.filter(u => aileBirimi.has(u));
    if (!kanli.length) continue;
    const ev = [...kanli].sort((x, y) => Number(evlenipGelen(x)) - Number(evlenipGelen(y)) || dogumSirasi(x, y))[0];
    b.ust = aileBirimi.get(ev)!;
    const misafir = kanli.find(u => u !== ev && aileBirimi.get(u) !== b.ust);
    if (misafir) b.misafir = { uye: misafir, birim: aileBirimi.get(misafir)! };
  }
  // Döngüye düşen (olmamalı) üst bağı kopar
  for (const b of birimler) {
    const yol = new Set<number>([b.no]);
    let u = b.ust;
    while (u !== undefined) {
      if (yol.has(u)) { b.ust = undefined; break; }
      yol.add(u); u = birimler[u].ust;
    }
  }
  for (const b of birimler) if (b.ust !== undefined) birimler[b.ust].altlar.push(b.no);
  const kokBul = (n: number): number => (birimler[n].ust === undefined ? n : kokBul(birimler[n].ust!));

  // ---- Ağaçların sırası: evlilikle bağlı ağaçlar yan yana (gelinin ailesi damadın ailesinin yanında)
  const agacKumesi = (k: number) => {
    const b = birimler[k];
    const ilk = b.uyeler[0] ?? birimler.find(x => x.ust === k)?.uyeler[0];
    return ilk !== undefined ? kumeNo.get(ilk)! : -1;
  };
  const kokler = birimler.filter(b => b.ust === undefined).map(b => b.no);
  const kavsaklar = birimler.filter(b => b.misafir).map(b => ({ birim: b.no, misafir: b.misafir!.birim, a: kokBul(b.no), b: kokBul(b.misafir!.birim) }))
    .filter(k => k.a !== k.b);
  const enYasli = (k: number): number => {
    const l: string[] = [];
    const topla = (n: number) => { l.push(...birimler[n].uyeler); birimler[n].altlar.forEach(topla); };
    topla(k);
    return l.sort(dogumSirasi).map(dogum).find(y => y !== undefined) ?? 99999;
  };
  // Kümeler arası yakınlık: akraba bağı ya da aynı aile
  const kumeKomsu = new Map<number, Set<number>>();
  const komsuEkle = (a: number, b: number) => { if (a !== b) { kumeKomsu.set(a, (kumeKomsu.get(a) || new Set()).add(b)); kumeKomsu.set(b, (kumeKomsu.get(b) || new Set()).add(a)); } };
  for (const [a, l] of akrabalari) for (const b of l) komsuEkle(kumeNo.get(a)!, kumeNo.get(b)!);
  const aileUyeleri = new Map<string, string[]>();
  for (const k of kisiler) for (const a of new Set([k.aileId, k.soyadiAileId, k.dogumAileId])) if (a) aileUyeleri.set(a, [...(aileUyeleri.get(a) || []), k.id]);
  for (const l of aileUyeleri.values()) for (let i = 1; i < l.length; i++) komsuEkle(kumeNo.get(l[0])!, kumeNo.get(l[i])!);
  const kumeSirasi: number[] = [];
  const kalanKume = [...sira];
  while (kalanKume.length) {
    let n = -1;
    for (let i = kumeSirasi.length - 1; i >= 0 && n < 0; i--) n = kalanKume.findIndex(k => kumeKomsu.get(kumeSirasi[i])?.has(k));
    kumeSirasi.push(kalanKume.splice(n >= 0 ? n : 0, 1)[0]);
  }

  // Her kümenin ağaçları: en yaşlı kökten başlayarak kavşaklarla sağa ve sola
  const kumeAgaclari = new Map<number, number[]>();
  for (const k of kokler) {
    const n = agacKumesi(k);
    kumeAgaclari.set(n, [...(kumeAgaclari.get(n) || []), k]);
  }
  const kenarIsaretle = (n: number, kenar: 'sol' | 'sag') => {
    for (let u: number | undefined = n; u !== undefined; u = birimler[u].ust) if (!birimler[u].kenar) birimler[u].kenar = kenar;
  };
  /** Kavşak biriminde misafir üye hangi yanda (misafir ağacın yanı) */
  const misafirYani = new Map<number, 'sol' | 'sag'>();
  const agacSirasi: Array<{ kok: number; kume: number }> = [];
  for (const n of kumeSirasi) {
    const agaclar = (kumeAgaclari.get(n) || []).sort((a, b) => enYasli(a) - enYasli(b));
    if (!agaclar.length) continue;
    const dizi: number[] = [agaclar[0]];
    const kalan = new Set(agaclar.slice(1));
    let ilerledi = true;
    while (kalan.size && ilerledi) {
      ilerledi = false;
      for (const kv of kavsaklar) {
        const [ic, dis] = kalan.has(kv.b) && dizi.includes(kv.a) ? [kv.a, kv.b] : kalan.has(kv.a) && dizi.includes(kv.b) ? [kv.b, kv.a] : [-1, -1];
        if (ic < 0) continue;
        // Sağ uçtaki ağaca bağlıysa sağa, sol uçtakine bağlıysa sola; ortadakine sağa (çizgi uzar, not düşülür)
        const uzak = dizi[0] !== ic && dizi[dizi.length - 1] !== ic;
        const sagda = dizi[0] !== ic || dizi.length === 1;
        if (sagda) dizi.push(dis); else dizi.unshift(dis);
        if (uzak) notlar.push(`${birimler[kv.birim].uyeler.map(ad).join(' ile ')} evliliği yan yana durmayan iki ağacı bağlıyor; çizgi uzun`);
        kalan.delete(dis);
        // Kavşağın iki yanı birbirine bakar
        const birimIc = kv.a === ic ? kv.birim : kv.misafir, birimDis = kv.a === ic ? kv.misafir : kv.birim;
        kenarIsaretle(birimIc, sagda ? 'sag' : 'sol');
        kenarIsaretle(birimDis, sagda ? 'sol' : 'sag');
        // Misafir üye misafir ağaca bakar
        misafirYani.set(kv.birim, kv.a === ic ? (sagda ? 'sag' : 'sol') : (sagda ? 'sol' : 'sag'));
        ilerledi = true;
      }
    }
    dizi.push(...[...kalan].sort((a, b) => enYasli(a) - enYasli(b)));
    for (const k of dizi) agacSirasi.push({ kok: k, kume: n });
  }

  // ---- Çocukların sırası ve birim içi sıra
  const birimDogumu = (n: number) => {
    const b = birimler[n];
    const kan = b.uyeler.filter(u => aileBirimi.get(u) === b.ust);
    return (kan.length ? kan : b.uyeler).sort(dogumSirasi)[0];
  };
  for (const b of birimler) {
    b.altlar.sort((x, y) => {
      const r = (k?: 'sol' | 'sag') => (k === 'sol' ? 0 : k === 'sag' ? 2 : 1);
      return r(birimler[x].kenar) - r(birimler[y].kenar) || dogumSirasi(birimDogumu(x), birimDogumu(y));
    });
  }
  for (const b of birimler) {
    if (b.sanal || b.uyeler.length < 2) continue;
    if (b.uyeler.length > 2) {
      // Üç ve daha çok eş: en çok eşi olan ortada
      const merkez = [...b.uyeler].sort((x, y) => (esleri.get(y)?.length || 0) - (esleri.get(x)?.length || 0))[0];
      const kalan = b.uyeler.filter(x => x !== merkez);
      b.uyeler = [...kalan.filter((_, n) => n % 2 === 1), merkez, ...kalan.filter((_, n) => n % 2 === 0)];
      continue;
    }
    const kan = b.ust !== undefined ? b.uyeler.find(u => aileBirimi.get(u) === b.ust) : undefined;
    const diger = b.uyeler.find(u => u !== kan);
    if (b.misafir && kan) {
      // Misafir üye kendi ailesinin ağacına bakar
      b.uyeler = misafirYani.get(b.no) === 'sol' ? [b.misafir.uye, kan] : [kan, b.misafir.uye];
    } else if (kan && diger) {
      // Kan bağı olan kardeşlerine bakar: ilk çocuksa sağda, değilse solda
      const kardes = birimler[b.ust!].altlar;
      const ilk = kardes.length > 1 && kardes[0] === b.no;
      b.uyeler = ilk ? [diger, kan] : [kan, diger];
    }
  }

  // ---- Ağaç içi yerleşim
  const adim = o.en + o.esAra;
  const kendiEni = (b: Birim) => (b.sanal ? 0 : b.uyeler.length * o.en + (b.uyeler.length - 1) * o.esAra);
  /** Birimin çocuklara indiği nokta (birimin solundan) */
  const inis = (b: Birim) => (b.sanal ? 0 : b.uyeler.length === 2 ? o.en + o.esAra / 2 : kendiEni(b) / 2);
  /** Kişinin kartının ortası (yerleşimden sonra) */
  const orta = (id: string) => birimler[birimi.get(id)!].x + birimler[birimi.get(id)!].uyeler.indexOf(id) * adim + o.en / 2;
  // Her alt ağacın kutusu birimin sol kenarına göre: çocuklar yan yana, birim
  // çocuklarının (kan bağı olanların) ortasının üstünde; geniş birimin altında çocuklar ortalanır
  const kutu = new Map<number, { sol: number; sag: number }>();
  const cocukX = new Map<number, number>();
  const hesapla = (n: number) => {
    const b = birimler[n];
    let x = 0;
    const yer: Array<[number, number]> = [];
    const capalar: number[] = [];
    for (const c of b.altlar) {
      hesapla(c);
      const k = kutu.get(c)!;
      const cx = x - k.sol;
      yer.push([c, cx]);
      birimler[c].uyeler.forEach((u, i) => { if (aileBirimi.get(u) === n) capalar.push(cx + i * adim + o.en / 2); });
      x += k.sag - k.sol + o.araX;
    }
    const toplam = Math.max(0, x - o.araX);
    const ke = kendiEni(b);
    const ux = capalar.length ? (Math.min(...capalar) + Math.max(...capalar)) / 2 - inis(b) : (toplam - ke) / 2;
    for (const [c, cx] of yer) cocukX.set(c, cx - ux);
    kutu.set(n, b.altlar.length ? { sol: Math.min(0, -ux), sag: Math.max(ke, toplam - ux) } : { sol: 0, sag: ke });
  };
  const konumla = (n: number, x: number) => {
    birimler[n].x = x;
    for (const c of birimler[n].altlar) konumla(c, x + cocukX.get(c)!);
  };
  const yerlestir = (kok: number) => { hesapla(kok); konumla(kok, -kutu.get(kok)!.sol); };

  // ---- Ağaçlar soldan sağa: kavşakla bağlı ağaçlar satır satır birbirine yaslanır,
  // ayrı kümeler arasında geniş boşluk ve üst üste binmeyen kutular
  const satirY = (k: number) => k * (o.boy + o.araY);
  const kumeArasi = Math.max(o.araX * 3, o.en / 2);
  const sagUc = new Map<number, number>(); // kuşak bandı → o kümede en sağdaki nokta
  let genelSag = -Infinity;
  let oncekiKume = -1;
  const kumeKutulari: Array<{ kume: number; x: number; sag: number }> = [];
  const agacBirimleri = (k: number) => { const l: number[] = []; const t = (n: number) => { l.push(n); birimler[n].altlar.forEach(t); }; t(k); return l; };
  for (const { kok, kume } of agacSirasi) {
    yerlestir(kok);
    const bl = agacBirimleri(kok);
    // Bant uçları: kartlar kendi kuşağında; çocuk çizgisi çocuğun kuşağında
    const solUc = new Map<number, number>(), sagYeni = new Map<number, number>();
    const uc = (k: number, a: number, b: number) => {
      solUc.set(k, Math.min(solUc.get(k) ?? Infinity, a));
      sagYeni.set(k, Math.max(sagYeni.get(k) ?? -Infinity, b));
    };
    for (const n of bl) {
      const b = birimler[n];
      if (!b.sanal) uc(b.kusak, b.x, b.x + kendiEni(b));
      const cocuklar = b.altlar.flatMap(c => birimler[c].uyeler.filter(u => aileBirimi.get(u) === n).map(u => [u, birimler[c].kusak] as const));
      if (!cocuklar.length) continue;
      const xs = [...cocuklar.map(([u]) => orta(u)), ...(b.sanal ? [] : [b.x + inis(b)])];
      for (let k = b.kusak + 1; k <= Math.max(...cocuklar.map(c => c[1])); k++) uc(k, Math.min(...xs), Math.max(...xs));
    }
    let dx: number;
    if (kume === oncekiKume) {
      dx = -Infinity;
      for (const [k, s] of solUc) if (sagUc.has(k)) dx = Math.max(dx, sagUc.get(k)! + o.araX - s);
      if (dx === -Infinity) dx = genelSag + o.araX - Math.min(...solUc.values());
    } else {
      dx = genelSag === -Infinity ? -Math.min(...solUc.values()) : genelSag + kumeArasi - Math.min(...solUc.values());
      sagUc.clear();
      kumeKutulari.push({ kume, x: Math.min(...solUc.values()) + dx, sag: -Infinity });
    }
    for (const n of bl) birimler[n].x += dx;
    for (const [k, s] of sagYeni) sagUc.set(k, Math.max(sagUc.get(k) ?? -Infinity, s + dx));
    genelSag = Math.max(genelSag, ...[...sagYeni.values()].map(s => s + dx));
    kumeKutulari[kumeKutulari.length - 1].sag = genelSag;
    oncekiKume = kume;
  }

  // ---- Konumlar
  const konum = new Map<string, { x: number; y: number }>();
  for (const b of birimler) b.uyeler.forEach((id, i) => konum.set(id, { x: b.x + i * adim, y: satirY(b.kusak) }));

  // ---- Çizgiler: yalnız kuşak aralarındaki boşlukta
  const cizgiler: TekAgacCizgisi[] = [];
  const yanyana = (a: string, b: string) => {
    const p = konum.get(a)!, q = konum.get(b)!;
    return Math.abs(p.y - q.y) < 1 && Math.abs(Math.abs(p.x - q.x) - adim) < 1;
  };
  for (const [a, l] of esleri) for (const b of l) {
    if (a > b || !yanyana(a, b)) continue;
    const [s, g] = konum.get(a)!.x < konum.get(b)!.x ? [konum.get(a)!, konum.get(b)!] : [konum.get(b)!, konum.get(a)!];
    cizgiler.push({ id: `e-${a}-${b}`, tur: 'eşi', kisiler: [a, b], d: `M${s.x + o.en},${s.y + o.boy / 2} H${g.x}` });
  }
  // Aileler: aynı ebeveyn takımının çocukları tek çizgide
  const aileler = new Map<string, { ebeveyn: string[]; cocuk: string[] }>();
  for (const id of ids) {
    const ps = (ebeveynleri.get(id) || []).filter(p => kusak.get(p)! < kusak.get(id)!).sort();
    if (!ps.length) continue;
    const anahtar = ps.join('|');
    if (!aileler.has(anahtar)) aileler.set(anahtar, { ebeveyn: ps, cocuk: [] });
    aileler.get(anahtar)!.cocuk.push(id);
  }
  const yuvarla = (v: number) => Math.round(v * 10) / 10;
  for (const [anahtar, { ebeveyn, cocuk }] of aileler) {
    const ustKusak = Math.max(...ebeveyn.map(p => kusak.get(p)!));
    const hatY = satirY(ustKusak) + o.boy + o.araY / 2;
    const parcalar: string[] = [];
    const xs: number[] = [];
    const cift = ebeveyn.length === 2 && yanyana(ebeveyn[0], ebeveyn[1]);
    if (cift) {
      const [a, b] = ebeveyn.map(p => konum.get(p)!);
      const x = (Math.min(a.x, b.x) + o.en + Math.max(a.x, b.x)) / 2;
      parcalar.push(`M${yuvarla(x)},${a.y + o.boy / 2} V${hatY}`);
      xs.push(x);
    } else for (const p of ebeveyn) {
      const q = konum.get(p)!;
      parcalar.push(`M${yuvarla(q.x + o.en / 2)},${q.y + o.boy} V${hatY}`);
      xs.push(q.x + o.en / 2);
    }
    for (const c of cocuk) {
      const q = konum.get(c)!;
      parcalar.push(`M${yuvarla(q.x + o.en / 2)},${hatY} V${q.y}`);
      xs.push(q.x + o.en / 2);
    }
    if (Math.max(...xs) - Math.min(...xs) > 0.5) parcalar.push(`M${yuvarla(Math.min(...xs))},${hatY} H${yuvarla(Math.max(...xs))}`);
    cizgiler.push({ id: `c-${anahtar}`, tur: 'çocuk', kisiler: [...ebeveyn, ...cocuk], d: parcalar.join(' ') });
  }
  // Ebeveyni ağaçta olmayan kardeşler: üstlerinde kısa köşeli çizgi
  for (const b of birimler) {
    if (!b.sanal) continue;
    const kardes = b.altlar.flatMap(c => birimler[c].uyeler.filter(u => aileBirimi.get(u) === b.no));
    if (kardes.length < 2) continue;
    const y = satirY(b.kusak + 1) - o.araY / 3;
    const xs = kardes.map(u => orta(u));
    cizgiler.push({
      id: `k-${b.no}`, tur: 'kardeşi', kisiler: kardes,
      d: [`M${yuvarla(Math.min(...xs))},${yuvarla(y)} H${yuvarla(Math.max(...xs))}`, ...kardes.map(u => `M${yuvarla(orta(u))},${yuvarla(y)} V${konum.get(u)!.y}`)].join(' ')
    });
  }

  // ---- Sol üst köşe 0
  const xs = [...konum.values()].map(p => p.x), ys = [...konum.values()].map(p => p.y);
  const mx = xs.length ? Math.min(...xs) : 0, my = ys.length ? Math.min(...ys) : 0;
  for (const [id, p] of konum) konum.set(id, { x: p.x - mx, y: p.y - my });
  const kaydir = (d: string) => d.replace(/([MLH])(-?[\d.]+)(?:,(-?[\d.]+))?|V(-?[\d.]+)/g, (_m, h, x, y, v) =>
    v !== undefined ? `V${yuvarla(Number(v) - my)}` : h === 'H' ? `H${yuvarla(Number(x) - mx)}` : `${h}${yuvarla(Number(x) - mx)},${yuvarla(Number(y) - my)}`);
  for (const c of cizgiler) c.d = kaydir(c.d);
  const kusakSon = new Map<string, number>();
  const minKusak = Math.min(...ids.map(id => kusak.get(id)!));
  for (const id of ids) kusakSon.set(id, kusak.get(id)! - minKusak);
  return {
    konum, kusak: kusakSon, cizgiler,
    kumeler: kumeKutulari.map(k => ({ x: k.x - mx, en: k.sag - k.x, kisiler: kumeler[k.kume] })),
    en: xs.length ? Math.max(...xs) - mx + o.en : 0,
    boy: ys.length ? Math.max(...ys) - my + o.boy : 0,
    notlar: [...new Set(notlar)]
  };
}
