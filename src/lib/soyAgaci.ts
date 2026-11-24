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
// Genel soy ağacı (24 Kasım, Kemal: "bütün adanın tek genel ağacı, tuvalde;
// bağlar viki verisinden otomatik ve doğru; aileler kümelenir, evlilikle
// aileler arası bağ kısa ve doğru").
//
// Her kişi kendi ailesinin çerçevesinde (`anaAileId`: şimdi kullandığı soyadı)
// tek gerçek kartla durur. Başka bir ailede de yeri varsa (doğduğu aile,
// ebeveynlerinin ailesi, eşinin ailesi) orada kesik kenarlı bir "yansıma"
// kartı olur; iki kart birbirine kısa okla bağlanır ("↗ Ercan Ailesi'nde").
// Böylece çerçeveler arasında hiç uzun çizgi çizilmez, eş eşinin yanında,
// çocuk ebeveynlerinin altında durur.
// ---------------------------------------------------------------------------

export interface GenelDugum {
  /** Tuvaldeki kimlik: gerçek kartta kişinin kimliği, yansımada `aile~kişi` */
  id: string;
  kisiId: string;
  cerceve: string;
  yansima: boolean;
  /** Tuvaldeki sol üst köşe */
  x: number; y: number;
}

export interface GenelCerceve {
  id: string; ad: string;
  x: number; y: number; en: number; boy: number;
  /** Çerçevenin içindeki ağacın sol üst köşesi (tuvalde) */
  icX: number; icY: number;
  kenarlar: AgacKenari[];
  /** Çerçeve içi konumlar (`icX`, `icY`'ye göre) */
  konum: Map<string, { x: number; y: number }>;
  kisiSayisi: number;
}

export interface GenelAgac {
  cerceveler: GenelCerceve[];
  dugumler: GenelDugum[];
  /** Kişinin bütün kartları (önce gerçeği) */
  kartlari: Map<string, GenelDugum[]>;
}

export const CERCEVE_PAY = 26;
export const CERCEVE_BASLIK = 48;
const CERCEVE_ARA = 56;

const AILE_TURLERI = new Set(['ebeveyni', 'eşi', 'kardeşi']);

export function genelAgac(kisiler: SoyKisi[], baglar: SoyBagi[], aileler: Array<{ id: string; ad: string }>, o: AgacOlcu, oran = 1.6): GenelAgac {
  const kisi = new Map(kisiler.map(k => [k.id, k]));
  const aileVar = new Set(aileler.map(a => a.id));
  const aileBaglari = baglar.filter(b => AILE_TURLERI.has(b.tur) && kisi.has(b.a) && kisi.has(b.b));
  const ebeveynleri = new Map<string, string[]>();
  const esleri = new Map<string, string[]>();
  for (const b of aileBaglari) {
    if (b.tur === 'ebeveyni') ebeveynleri.set(b.a, [...(ebeveynleri.get(b.a) || []), b.b]);
    if (b.tur === 'eşi') { esleri.set(b.a, [...(esleri.get(b.a) || []), b.b]); esleri.set(b.b, [...(esleri.get(b.b) || []), b.a]); }
  }

  // Kişinin çerçevesi: kendi ailesi; yoksa ebeveyninin, o da yoksa eşinin; hiçbiri yoksa "Ailesiz"
  const ana = new Map<string, string>();
  for (const k of kisiler) { const a = anaAileId(k); if (a && aileVar.has(a)) ana.set(k.id, a); }
  for (let tur = 0; tur < 6; tur++) for (const k of kisiler) {
    if (ana.has(k.id)) continue;
    const p = (ebeveynleri.get(k.id) || []).find(x => ana.has(x)) ?? (esleri.get(k.id) || []).find(x => ana.has(x));
    if (p) ana.set(k.id, ana.get(p)!);
  }
  for (const k of kisiler) if (!ana.has(k.id)) ana.set(k.id, '~');

  // Çerçevelerin kartları: gerçekler ve yansımalar
  const cerceveDugumu = new Map<string, Map<string, string>>(); // çerçeve → kişi → düğüm kimliği
  const ekle = (c: string, kisiId: string) => {
    if (!cerceveDugumu.has(c)) cerceveDugumu.set(c, new Map());
    const m = cerceveDugumu.get(c)!;
    if (!m.has(kisiId)) m.set(kisiId, ana.get(kisiId) === c ? kisiId : `${c}~${kisiId}`);
  };
  for (const k of kisiler) ekle(ana.get(k.id)!, k.id);
  for (const k of kisiler) {
    const m = ana.get(k.id)!;
    const yer = new Set<string>();
    if (k.dogumAileId && aileVar.has(k.dogumAileId)) yer.add(k.dogumAileId);
    for (const p of ebeveynleri.get(k.id) || []) yer.add(ana.get(p)!);
    for (const e of esleri.get(k.id) || []) yer.add(ana.get(e)!);
    for (const c of yer) if (c !== m && c !== '~') ekle(c, k.id);
  }

  // Çerçeve sırası: kalabalık aile başta, ardından ona kartla bağlı olanlar (komşu dursun)
  const komsu = new Map<string, Set<string>>();
  for (const [c, m] of cerceveDugumu) for (const kisiId of m.keys()) {
    const g = ana.get(kisiId)!;
    if (g === c) continue;
    komsu.set(c, (komsu.get(c) || new Set()).add(g));
    komsu.set(g, (komsu.get(g) || new Set()).add(c));
  }
  const kalan = [...cerceveDugumu.keys()].filter(c => c !== '~')
    .sort((a, b) => cerceveDugumu.get(b)!.size - cerceveDugumu.get(a)!.size || (aileler.find(x => x.id === a)?.ad || '').localeCompare(aileler.find(x => x.id === b)?.ad || '', 'tr'));
  const sira: string[] = [];
  while (kalan.length) {
    // Önce son eklenenin, yoksa daha öncekilerin komşusu
    let n = -1;
    for (let i = sira.length - 1; i >= 0 && n < 0; i--) n = kalan.findIndex(c => komsu.get(sira[i])?.has(c));
    sira.push(kalan.splice(n >= 0 ? n : 0, 1)[0]);
  }
  if (cerceveDugumu.has('~')) sira.push('~');

  // Her çerçeve kendi içinde dizilir
  const ham = sira.map(c => {
    const m = cerceveDugumu.get(c)!;
    const kenarlar: AgacKenari[] = [];
    for (const b of aileBaglari) {
      const a = m.get(b.a), d = m.get(b.b);
      if (a && d) kenarlar.push({ a, b: d, tur: b.tur as AgacKenari['tur'] });
    }
    const dugumler: AgacDugumu[] = [...m.entries()].map(([kisiId, id]) => {
      const k = kisi.get(kisiId)!;
      return { id, ad: k.ad, ...(k.yasam ? { dogum: k.yasam.bas } : {}) };
    });
    const y = agacDiz(dugumler, kenarlar, o);
    const baslikEn = 120 + (aileler.find(a => a.id === c)?.ad.length || 8) * 11;
    return {
      c, m, kenarlar, y,
      en: Math.max(y.en, baslikEn) + CERCEVE_PAY * 2,
      boy: y.boy + CERCEVE_PAY * 2 + CERCEVE_BASLIK,
      gercek: [...m.keys()].filter(id => ana.get(id) === c).length
    };
  });

  // Çerçeveler tuvale yerleşir: her biri sığdığı en üst, en sol boşluğa (alçak ailenin altı boş kalmaz).
  // Tuval genişliği adaylar arasından ekranın oranına en yakın ve en az boşluk bırakan seçilir.
  const yerlestir = (sinir: number) => {
    const konan: Array<{ x: number; y: number; en: number; boy: number }> = [];
    for (const b of ham) {
      const xler = [0, ...konan.map(k => k.x + k.en + CERCEVE_ARA)].filter(x => x === 0 || x + b.en <= sinir);
      let en: { x: number; y: number } | null = null;
      for (const x of xler) {
        const y = konan.filter(k => k.x < x + b.en && x < k.x + k.en).reduce((m, k) => Math.max(m, k.y + k.boy + CERCEVE_ARA), 0);
        if (!en || y < en.y || (y === en.y && x < en.x)) en = { x, y };
      }
      konan.push({ ...en!, en: b.en, boy: b.boy });
    }
    const en = Math.max(0, ...konan.map(k => k.x + k.en)), boy = Math.max(0, ...konan.map(k => k.y + k.boy));
    return { konan, en, boy };
  };
  const toplamEn = ham.reduce((t, b) => t + b.en + CERCEVE_ARA, 0);
  const enGenis = Math.max(0, ...ham.map(b => b.en));
  const adaylar: number[] = [];
  for (let n = 0; n <= 24; n++) adaylar.push(enGenis + ((toplamEn - enGenis) * n) / 24);
  const puan = (w: number) => {
    const l = yerlestir(w);
    const dolu = ham.reduce((t, b) => t + b.en * b.boy, 0) / Math.max(1, l.en * l.boy);
    return Math.abs(Math.log(l.en / Math.max(1, l.boy) / Math.max(0.3, oran))) + (1 - dolu) * 1.5;
  };
  const enIyi = adaylar.length ? adaylar.reduce((en, a) => (puan(a) < puan(en) ? a : en), adaylar[0]) : 0;
  const yer = yerlestir(enIyi).konan;

  const cerceveler: GenelCerceve[] = [];
  const dugumler: GenelDugum[] = [];
  ham.forEach((b, n) => {
    const { x: x0, y: y0 } = yer[n];
    const icX = x0 + CERCEVE_PAY + (b.en - CERCEVE_PAY * 2 - b.y.en) / 2, icY = y0 + CERCEVE_BASLIK + CERCEVE_PAY;
    cerceveler.push({
      id: b.c, ad: b.c === '~' ? 'Ailesiz' : (aileler.find(a => a.id === b.c)?.ad || 'Aile'),
      x: x0, y: y0, en: b.en, boy: b.boy, icX, icY, kenarlar: b.kenarlar, konum: b.y.konum, kisiSayisi: b.gercek
    });
    for (const [kisiId, id] of b.m) {
      const p = b.y.konum.get(id)!;
      dugumler.push({ id, kisiId, cerceve: b.c, yansima: id !== kisiId, x: icX + p.x, y: icY + p.y });
    }
  });
  const kartlari = new Map<string, GenelDugum[]>();
  for (const d of dugumler) kartlari.set(d.kisiId, [...(kartlari.get(d.kisiId) || []), d].sort((a, b) => Number(a.yansima) - Number(b.yansima)));
  return { cerceveler, dugumler, kartlari };
}
