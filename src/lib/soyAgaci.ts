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

/** Yan bağ grupları (süzgeç çipleri) */
export const YAN_GRUPLAR: Array<{ id: 'is' | 'arkadaslik' | 'rekabet' | 'tanidik'; ad: string; turler: YanBag[] }> = [
  { id: 'is', ad: 'İş', turler: ['patronu', 'iş ortağı', 'iş yeri'] },
  { id: 'arkadaslik', ad: 'Arkadaşlık', turler: ['arkadaşı'] },
  { id: 'rekabet', ad: 'Rekabet', turler: ['rakibi'] },
  { id: 'tanidik', ad: 'Tanıdık', turler: ['tanıdığı kişi'] }
];

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

export interface AileBlogu { id: string; ad: string; x: number; y: number; en: number; boy: number }

/**
 * Aile blokları (10 Kasım): her aile kendi çerçevesinde, kendi kuşaklarıyla
 * dizilir; bloklar soldan sağa yan yana. Evlilikle bağlı aileler yan yana
 * gelir. Ailesi olmayan kişi, aile bağıyla bağlı olduğu kişinin bloğuna;
 * o da yoksa "Ailesiz" bloğuna girer.
 */
export function aileDiz(kisiler: SoyKisi[], baglar: SoyBagi[], aileler: Array<{ id: string; ad: string }>, kutuEn = KUTU_EN, kutuBoy = KUTU_BOY, oran = 1.6):
  { konum: Map<string, { x: number; y: number }>; bloklar: AileBlogu[] } {
  const aileBagi = (b: SoyBagi) => b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi' || b.tur === 'akrabası';
  const blok = new Map<string, string>();
  for (const k of kisiler) if (k.aileId) blok.set(k.id, k.aileId);
  for (let tur = 0; tur < 4; tur++) for (const b of baglar.filter(aileBagi)) {
    if (!blok.has(b.a) && blok.has(b.b)) blok.set(b.a, blok.get(b.b)!);
    if (!blok.has(b.b) && blok.has(b.a)) blok.set(b.b, blok.get(b.a)!);
  }
  for (const k of kisiler) if (!blok.has(k.id)) blok.set(k.id, '~');

  const gruplar = new Map<string, SoyKisi[]>();
  for (const k of kisiler) gruplar.set(blok.get(k.id)!, [...(gruplar.get(blok.get(k.id)!) || []), k]);

  // Blok sırası: en kalabalık aile başta, ardından ona aile bağıyla bağlı olanlar
  const komsu = new Map<string, Set<string>>();
  for (const b of baglar.filter(aileBagi)) {
    const x = blok.get(b.a), y = blok.get(b.b);
    if (!x || !y || x === y) continue;
    komsu.set(x, (komsu.get(x) || new Set()).add(y));
    komsu.set(y, (komsu.get(y) || new Set()).add(x));
  }
  const kalan = [...gruplar.keys()].filter(g => g !== '~').sort((a, b) => gruplar.get(b)!.length - gruplar.get(a)!.length);
  const sira: string[] = [];
  while (kalan.length) {
    const son = sira[sira.length - 1];
    const n = son ? kalan.findIndex(g => komsu.get(son)?.has(g)) : -1;
    sira.push(kalan.splice(n >= 0 ? n : 0, 1)[0]);
  }
  if (gruplar.has('~')) sira.push('~');

  const yon = new Map<string, number>();
  for (const b of baglar.filter(aileBagi)) {
    const x = sira.indexOf(blok.get(b.a)!), y = sira.indexOf(blok.get(b.b)!);
    if (x === y) continue;
    yon.set(b.a, Math.sign(y - x));
    yon.set(b.b, Math.sign(x - y));
  }

  const konum = new Map<string, { x: number; y: number }>();
  const bloklar: AileBlogu[] = [];
  const PAY = 28, BASLIK = 34, BLOK_ARA = 64;
  // Önce her blok kendi içinde dizilir
  const ham = sira.map(g => {
    const uyeler = gruplar.get(g)!;
    const ic = new Set(uyeler.map(k => k.id));
    const ici = diz(uyeler, baglar.filter(b => ic.has(b.a) && ic.has(b.b)), kutuEn, kutuBoy, yon);
    const xs = [...ici.values()].map(p => p.x), ys = [...ici.values()].map(p => p.y);
    const mx = Math.min(...xs), my = Math.min(...ys);
    return {
      g, ici, mx, my,
      en: Math.max(...xs) - mx + kutuEn + PAY * 2,
      boy: Math.max(...ys) - my + kutuBoy + PAY * 2 + BASLIK
    };
  });
  // Sonra bloklar ekranın oranına göre satırlara sarılır (telefonda alt alta)
  // Satır genişliği: ağacın en/boy oranı ekranınkine en yakın olan seçilir
  const yerlesim = (sinir: number) => {
    let x = 0, y = 0, sb = 0, en = 0;
    for (const b of ham) {
      if (x > 0 && x + b.en > sinir) { x = 0; y += sb + BLOK_ARA; sb = 0; }
      x += b.en + BLOK_ARA; sb = Math.max(sb, b.boy); en = Math.max(en, x - BLOK_ARA);
    }
    return { en, boy: y + sb };
  };
  const adaylar = [...new Set(ham.map((_, n) => ham.slice(0, n + 1).reduce((t, b) => t + b.en + BLOK_ARA, 0)))];
  const satirEn = adaylar.reduce((en, aday) => {
    const fark = (w: number) => { const l = yerlesim(w); return Math.abs(Math.log(l.en / l.boy / Math.max(0.3, oran))); };
    return fark(aday) < fark(en) ? aday : en;
  }, adaylar[adaylar.length - 1]);
  let x0 = 0, y0 = 0, satirBoy = 0;
  for (const b of ham) {
    if (x0 > 0 && x0 + b.en > satirEn) { x0 = 0; y0 += satirBoy + BLOK_ARA; satirBoy = 0; }
    for (const [id, p] of b.ici) konum.set(id, { x: x0 + PAY + p.x - b.mx, y: y0 + BASLIK + PAY + p.y - b.my });
    bloklar.push({ id: b.g, ad: b.g === '~' ? 'Ailesiz' : (aileler.find(a => a.id === b.g)?.ad || 'Aile'), x: x0, y: y0, en: b.en, boy: b.boy });
    x0 += b.en + BLOK_ARA;
    satirBoy = Math.max(satirBoy, b.boy);
  }
  return { konum, bloklar };
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

export const KUTU_EN = 168;
export const KUTU_BOY = 48;
const ARA_X = 36;
const ARA_Y = 92;

/**
 * Kuşaklara dizme: ebeveyni bağıyla kuşak bulunur (çocuk ebeveynin bir
 * altında), eşler ve kardeşler aynı kuşağa çekilir. Kuşak içinde eşler
 * yan yana, çocuklar ebeveynlerinin altına (ortalama yerlerine) dizilir.
 * `araX` / `araY`: kutular arası boşluk (aile sayfası daha sık dizer, 24 Kasım).
 */
export function diz(kisiler: SoyKisi[], baglar: SoyBagi[], kutuEn = KUTU_EN, kutuBoy = KUTU_BOY, yon: Map<string, number> = new Map(),
  araX = ARA_X, araY = ARA_Y): Map<string, { x: number; y: number }> {
  const ids = kisiler.map(k => k.id);
  const ebeveyn = new Map<string, string[]>();
  const es = new Map<string, string[]>();
  const ekle = (m: Map<string, string[]>, a: string, b: string) => m.set(a, [...(m.get(a) || []), b]);
  for (const b of baglar) {
    if (b.tur === 'ebeveyni') ekle(ebeveyn, b.a, b.b);
    if (b.tur === 'eşi') { ekle(es, b.a, b.b); ekle(es, b.b, b.a); }
  }
  const kardes = baglar.filter(b => b.tur === 'kardeşi');

  // Kuşak: birkaç turda yayılır (döngüye karşı en fazla 12 tur)
  const kusak = new Map<string, number>(ids.map(id => [id, 0]));
  for (let tur = 0; tur < 12; tur++) {
    let degisti = false;
    for (const id of ids) {
      for (const p of ebeveyn.get(id) || []) {
        const k = (kusak.get(p) ?? 0) + 1;
        if (k > (kusak.get(id) ?? 0) && k < 40) { kusak.set(id, k); degisti = true; }
      }
    }
    for (const id of ids) for (const e of es.get(id) || []) {
      const k = Math.max(kusak.get(id) ?? 0, kusak.get(e) ?? 0);
      if (kusak.get(id) !== k || kusak.get(e) !== k) { kusak.set(id, k); kusak.set(e, k); degisti = true; }
    }
    for (const b of kardes) {
      const k = Math.max(kusak.get(b.a) ?? 0, kusak.get(b.b) ?? 0);
      if (kusak.get(b.a) !== k || kusak.get(b.b) !== k) { kusak.set(b.a, k); kusak.set(b.b, k); degisti = true; }
    }
    if (!degisti) break;
  }

  // Hiç aile bağı olmayan kişi (ebeveyn, çocuk, eş, kardeş yok): doğum yılı
  // biliniyorsa doğum yılı ortalaması en yakın kuşağa konur
  const bagli = new Set<string>();
  for (const b of baglar) if (b.tur === 'ebeveyni' || b.tur === 'eşi' || b.tur === 'kardeşi') { bagli.add(b.a); bagli.add(b.b); }
  const dogum = new Map(kisiler.filter(k => k.yasam).map(k => [k.id, k.yasam!.bas]));
  const kusakYili = new Map<number, number[]>();
  for (const id of ids) if (bagli.has(id) && dogum.has(id)) kusakYili.set(kusak.get(id)!, [...(kusakYili.get(kusak.get(id)!) || []), dogum.get(id)!]);
  const ortalamalar = [...kusakYili.entries()].map(([k, l]) => [k, l.reduce((a, b) => a + b, 0) / l.length] as const);
  if (ortalamalar.length) {
    for (const id of ids) {
      if (bagli.has(id) || !dogum.has(id)) continue;
      const d = dogum.get(id)!;
      kusak.set(id, ortalamalar.reduce((en, o) => (Math.abs(o[1] - d) < Math.abs(en[1] - d) ? o : en))[0]);
    }
  }

  const ad = new Map(kisiler.map(k => [k.id, k.ad]));
  const aile = new Map(kisiler.map(k => [k.id, k.aileId || '~']));
  const konum = new Map<string, { x: number; y: number }>();
  const enCok = Math.max(0, ...kusak.values());
  for (let k = 0; k <= enCok; k++) {
    const satir = ids.filter(id => kusak.get(id) === k);
    // Çocuk ebeveynlerinin ortasına; ebeveyni yoksa ailesine ve adına göre
    const hedef = (id: string) => {
      const ps = (ebeveyn.get(id) || []).map(p => konum.get(p)?.x).filter((x): x is number => x !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    };
    satir.sort((a, b) => {
      const ha = hedef(a), hb = hedef(b);
      if (ha !== null && hb !== null && ha !== hb) return ha - hb;
      if (ha === null && hb !== null) return 1;
      if (hb === null && ha !== null) return -1;
      // Başka bir ailedeki eşine ya da akrabasına doğru: soldaki aileye bağlı olan sola, sağdaki sağa
      return (yon.get(a) ?? 0) - (yon.get(b) ?? 0) || aile.get(a)!.localeCompare(aile.get(b)!) || ad.get(a)!.localeCompare(ad.get(b)!, 'tr');
    });
    // Eşler yan yana: eşi satırda daha sonra geliyorsa hemen arkasına al
    const sira: string[] = [];
    for (const id of satir) {
      if (sira.includes(id)) continue;
      sira.push(id);
      for (const e of es.get(id) || []) if (satir.includes(e) && !sira.includes(e)) sira.push(e);
    }
    let sonX = -Infinity;
    for (const id of sira) {
      const h = hedef(id);
      const x = Math.max(h ?? -Infinity, sonX + kutuEn + araX, h === null && sonX === -Infinity ? 0 : -Infinity);
      konum.set(id, { x: Number.isFinite(x) ? x : 0, y: k * (kutuBoy + araY) });
      sonX = konum.get(id)!.x;
    }
  }
  return konum;
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
