import type { Item } from '../types';
import { adiCoz } from './alanSablonu';
import { tarihiOku } from './zamanCizgisi';

/**
 * Soy ağacı (6. gece, 7 Ekim; vvd'den). Kişi maddeleri ve aralarındaki
 * bağlar: aile (ebeveyni, eşi, kardeşi, akrabası) ağacın iskeleti; iş
 * (patronu, iş ortağı), arkadaşlık ve rekabet yanda renkli çizgi.
 *
 * Dönem sürümleri (Kemal'in seçimi): bağın yılları (`relations[].bas/bit`)
 * ve kişinin "Yaşam" alanı. Bir yıl ya da dönem seçilince yalnız o
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
}

/** a → b: ebeveyni'de a çocuk, b ebeveyn; ötekilerde yönsüz */
export interface SoyBagi { id: string; a: string; b: string; tur: SoyBagTuru; bas?: number; bit?: number }

export interface SoyVerisi { kisiler: SoyKisi[]; baglar: SoyBagi[]; aileler: Array<{ id: string; ad: string }> }

const KISI = new Set(['kisi', 'karakter']);

export function soyVerisi(items: Item[], degerOku: (i: Item, alanId: string) => string): SoyVerisi {
  const canli = items.filter(i => !i.archived && !i.isProposal);
  const aileler = canli.filter(i => i.type === 'aile').map(i => ({ id: i.id, ad: i.title.trim() })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const aileKayitlari = canli.filter(i => i.type === 'aile');
  const kisiKayitlari = canli.filter(i => KISI.has(i.type));
  const var_ = new Set(kisiKayitlari.map(i => i.id));

  const kisiler: SoyKisi[] = kisiKayitlari.map(i => {
    const aileAdi = degerOku(i, 'aile') || degerOku(i, 'soyadi');
    const aile = aileAdi ? adiCoz(aileAdi, aileKayitlari) : null;
    const dogumAdi = degerOku(i, 'dogumAilesi') || degerOku(i, 'dogumSoyadi');
    const dogumAile = dogumAdi ? adiCoz(dogumAdi, aileKayitlari) : null;
    const yasamMetni = degerOku(i, 'yasam').trim();
    const t = yasamMetni ? tarihiOku(yasamMetni) : null;
    return {
      id: i.id, ad: i.title.trim(),
      ...(aile ? { aileId: aile.id } : {}),
      ...(dogumAile ? { dogumAileId: dogumAile.id } : {}),
      // Tek yıl doğum sayılır: o yıldan sonrası açık uçlu
      ...(t ? { yasam: { bas: t.bas, bit: t.bit === undefined ? null : t.bit } } : {}),
      ...(yasamMetni ? { yasamMetni } : {}),
      ...(degerOku(i, 'profession').trim() ? { rol: degerOku(i, 'profession').trim() } : {})
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
 */
export function diz(kisiler: SoyKisi[], baglar: SoyBagi[], kutuEn = KUTU_EN, kutuBoy = KUTU_BOY, yon: Map<string, number> = new Map()): Map<string, { x: number; y: number }> {
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
      const x = Math.max(h ?? -Infinity, sonX + kutuEn + ARA_X, h === null && sonX === -Infinity ? 0 : -Infinity);
      konum.set(id, { x: Number.isFinite(x) ? x : 0, y: k * (kutuBoy + ARA_Y) });
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
