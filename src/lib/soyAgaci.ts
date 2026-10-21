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
export type YanBag = 'patronu' | 'iş ortağı' | 'arkadaşı' | 'rakibi' | 'tanıdığı kişi';
export type SoyBagTuru = AileBagi | YanBag;

const AILE: AileBagi[] = ['ebeveyni', 'eşi', 'kardeşi', 'akrabası'];
const YAN: YanBag[] = ['patronu', 'iş ortağı', 'arkadaşı', 'rakibi', 'tanıdığı kişi'];

/** Yan bağ grupları (süzgeç çipleri) */
export const YAN_GRUPLAR: Array<{ id: 'is' | 'arkadaslik' | 'rekabet' | 'tanidik'; ad: string; turler: YanBag[] }> = [
  { id: 'is', ad: 'İş', turler: ['patronu', 'iş ortağı'] },
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
      ...(yasamMetni ? { yasamMetni } : {})
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
  return { kisiler: kisiler.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')), baglar: Array.from(baglar.values()), aileler };
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
export function diz(kisiler: SoyKisi[], baglar: SoyBagi[]): Map<string, { x: number; y: number }> {
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
      return aile.get(a)!.localeCompare(aile.get(b)!) || ad.get(a)!.localeCompare(ad.get(b)!, 'tr');
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
      const x = Math.max(h ?? -Infinity, sonX + KUTU_EN + ARA_X, h === null && sonX === -Infinity ? 0 : -Infinity);
      konum.set(id, { x: Number.isFinite(x) ? x : 0, y: k * (KUTU_BOY + ARA_Y) });
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
