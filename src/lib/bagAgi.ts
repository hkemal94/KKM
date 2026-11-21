import type { Item, ItemType } from '../types';
import { BAG_TURLERI, type BagTuru } from '../utils/relations';
import { BAG_GRUPLARI, adiCoz, bagParcalari, semaAlanlari } from './alanSablonu';
import { eslesmeBasligi, mahalleEslesir } from '../components/wiki/wikiSchema';

/**
 * Bağ ağı (5. gece, 7 Ekim; vvd'den). Maddeler düğüm, bağlar kenar.
 * Kenarlar dört yerden gelir: düzenleyicideki bağlar (`metadata.relations`),
 * üst madde (`placeId`), kurum (`brandId`), eski `links` ve künyedeki bağ
 * alanları. Hesap saf; kayda yalnız Kemal "Bağla"ya basınca yazılır.
 *
 * Mahalle kümeleri ve odak (20 Kasım, Kemal: "çok karışık"): maddeler
 * mahallelerine göre öbeklenir, aynı iki madde arasındaki bağlar tek çizgiye
 * iner, bağ türleri yedi öbekte süzülür. Yerleşim her açılışta aynı çıkar;
 * Kemal'in eski elle yerleşimi (`kkm_ayar` → `bagAgiYerlesim`) okunmaz,
 * yazılmaz, silinmez.
 */

/** Ağda görünen türler (Atölye → Bağ ağı) */
export const AG_TURLERI: ItemType[] = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay', 'ürün', 'oda'];

export type KenarTuru = BagTuru | 'künye';

export interface AgDugumu { id: string; ad: string; tur: ItemType }
export interface AgKenari {
  id: string;
  a: string;
  b: string;
  tur: KenarTuru;
  /** Künye bağında alanın adı ("Kurucu") */
  etiket?: string;
  /** Künye bağında alanın kimliği ("manager"); öbeği bulmak için */
  alan?: string;
  oneri: boolean;
}
export interface Konum { x: number; y: number }

export function agKur(
  items: Item[],
  anahtarBul: (i: Item) => string | undefined,
  degerOku: (i: Item, alanId: string) => string
): { dugumler: AgDugumu[]; kenarlar: AgKenari[] } {
  const maddeler = items.filter(i => AG_TURLERI.includes(i.type) && !i.archived && !i.isProposal);
  const var_ = new Set(maddeler.map(i => i.id));
  const kenarlar = new Map<string, AgKenari>();
  const ekle = (a: string, b: string, tur: KenarTuru, oneri = false, etiket?: string, alan?: string) => {
    if (a === b || !var_.has(a) || !var_.has(b)) return;
    const id = [[a, b].sort().join('::'), tur, alan || ''].join('::');
    const eski = kenarlar.get(id);
    if (eski && !(eski.oneri && !oneri)) return;
    kenarlar.set(id, { id, a, b, tur, oneri, ...(etiket ? { etiket } : {}), ...(alan ? { alan } : {}) });
  };
  for (const i of maddeler) {
    for (const r of (i.metadata?.relations as Array<{ targetId?: string; type?: BagTuru; isProposal?: boolean }> | undefined) || []) {
      if (r?.targetId) ekle(i.id, r.targetId, r.type || 'genel bağlantı', !!r.isProposal);
    }
    if (i.metadata?.placeId) ekle(i.id, String(i.metadata.placeId), 'bulunduğu yer');
    if (i.metadata?.brandId) ekle(i.id, String(i.metadata.brandId), 'ait olduğu marka');
    for (const l of i.links || []) ekle(i.id, l, 'genel bağlantı');
    // Künyedeki bağ alanları ("Kurucu: Ali Usta")
    const anahtar = anahtarBul(i);
    if (!anahtar) continue;
    for (const a of semaAlanlari(anahtar)) {
      if (!a.bag?.length) continue;
      const deger = degerOku(i, a.id);
      if (!deger) continue;
      const turler = new Set<string>(a.bag.flatMap(g => BAG_GRUPLARI[g].turler));
      const adaylar = maddeler.filter(m => m.id !== i.id && turler.has(m.type));
      for (const p of bagParcalari(deger, a.coklu)) {
        const h = adiCoz(p, adaylar);
        if (h) ekle(i.id, h.id, 'künye', false, a.label, a.id);
      }
    }
  }
  return {
    dugumler: maddeler.map(i => ({ id: i.id, ad: i.title, tur: i.type })).sort((x, y) => x.ad.localeCompare(y.ad, 'tr')),
    kenarlar: Array.from(kenarlar.values())
  };
}

// ---------------------------------------------------------------- bağ öbekleri

/** Bağ türleri yedi öbekte süzülür; açılışta ilk üçü görünür (20 Kasım, Kemal) */
export const BAG_OBEKLERI = [
  { id: 'aile', ad: 'Aile' },
  { id: 'sahiplik', ad: 'Sahiplik' },
  { id: 'yer', ad: 'Bulunduğu yer' },
  { id: 'is', ad: 'İş ve üyelik' },
  { id: 'tanidik', ad: 'Tanışıklık' },
  { id: 'olay', ad: 'Olay' },
  { id: 'genel', ad: 'Genel bağ' }
] as const;
export type BagObegi = typeof BAG_OBEKLERI[number]['id'];
export const ACILIS_OBEKLERI: BagObegi[] = ['aile', 'sahiplik', 'yer'];

const TUR_OBEGI: Record<BagTuru, BagObegi> = {
  ebeveyni: 'aile', 'eşi': 'aile', 'kardeşi': 'aile', 'akrabası': 'aile',
  sahibi: 'sahiplik', 'ait olduğu marka': 'sahiplik',
  'bulunduğu yer': 'yer',
  'çalışanı': 'is', 'üyesi': 'is', patronu: 'is', 'iş ortağı': 'is',
  'arkadaşı': 'tanidik', rakibi: 'tanidik', 'tanıdığı kişi': 'tanidik',
  'ilgili olay': 'olay',
  'genel bağlantı': 'genel'
};
/** Künyedeki bağ alanı → öbek (alan kimliği `alanSablonu`'ndaki gibi) */
const ALAN_OBEGI: Record<string, BagObegi> = {
  aile: 'aile', dogumAilesi: 'aile', kisiler: 'aile',
  manager: 'sahiplik', mekanlar: 'sahiplik', owner: 'sahiplik', leader: 'sahiplik',
  evi: 'yer', region: 'yer', uzerindekiler: 'yer', cevresi: 'yer', mahalleler: 'yer',
  workplace: 'is'
};

/** Kenarın öbeği. Aileye "üyesi" aile bağıdır, kulübe "üyesi" iş ve üyelik. */
export function kenarObegi(e: AgKenari, turu: (id: string) => ItemType | undefined): BagObegi {
  if (e.tur === 'künye') return (e.alan && ALAN_OBEGI[e.alan]) || 'genel';
  if (e.tur === 'üyesi' && (turu(e.a) === 'aile' || turu(e.b) === 'aile')) return 'aile';
  return TUR_OBEGI[e.tur] || 'genel';
}

/** Aynı iki madde arasındaki bütün bağlar: ekranda tek çizgi */
export interface AgCifti { id: string; a: string; b: string; kenarlar: AgKenari[]; obekler: BagObegi[] }

export function ciftleriKur(kenarlar: AgKenari[], turu: (id: string) => ItemType | undefined): AgCifti[] {
  const m = new Map<string, AgCifti>();
  const sira = BAG_OBEKLERI.map(o => o.id) as BagObegi[];
  for (const e of kenarlar) {
    const [a, b] = [e.a, e.b].sort();
    const id = `${a}::${b}`;
    const c = m.get(id) || { id, a, b, kenarlar: [], obekler: [] };
    c.kenarlar.push(e);
    const o = kenarObegi(e, turu);
    if (!c.obekler.includes(o)) c.obekler.push(o);
    m.set(id, c);
  }
  for (const c of m.values()) c.obekler.sort((x, y) => sira.indexOf(x) - sira.indexOf(y));
  return [...m.values()];
}

// ---------------------------------------------------------------- mahalle kümeleri

export interface AgKumesi {
  id: string;
  ad: string;
  /** Mahalle maddesi (kümenin ortasında durur) */
  mahalleId?: string;
}
export const KUME_COKLU = '~coklu', KUME_DISARI = '~disari', KUME_YOK = '~yok';

/**
 * Maddenin kümesi `metadata.region`'dan okunur; kayıt değişmez. Yazılış karışık
 * ("merkez", "Merkez Mahallesi", "Kemsköy Caddesi, İskele Mahallesi.",
 * virgüllü çoklu): her parça mahalle maddelerinin adı ve takma adlarıyla
 * eşlenir (`mahalleEslesir`). Birden çok mahalleye düşen "Birden çok mahalle",
 * "Adada oturmaz" yazan kendi kümesine, bölgesi boş ya da eşleşmeyen
 * "Mahallesiz"e gider. Mahalle maddesi her zaman kendi kümesindedir.
 */
export function mahalleKumeleri(items: Item[], dugumler: AgDugumu[]): { kumeler: AgKumesi[]; kumesi: Map<string, string> } {
  const mahalleler = items.filter(i => i.type === 'yer' && !i.archived && !i.isProposal)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  const basliklar = new Map(mahalleler.map(m => [m.id, eslesmeBasligi(m)]));
  const kayit = new Map(items.map(i => [i.id, i]));
  const kumesi = new Map<string, string>();
  for (const d of dugumler) {
    if (basliklar.has(d.id)) { kumesi.set(d.id, d.id); continue; }
    const ham = kayit.get(d.id)?.metadata?.region;
    const bolge = typeof ham === 'string' ? ham.trim() : '';
    if (!bolge) { kumesi.set(d.id, KUME_YOK); continue; }
    if (/adada\s+oturmaz/i.test(bolge.toLocaleLowerCase('tr'))) { kumesi.set(d.id, KUME_DISARI); continue; }
    const bulunan = new Set<string>();
    for (const parca of bolge.split(/[,;/]+/).map(p => p.replace(/[.]+$/, '').trim()).filter(Boolean)) {
      for (const [id, b] of basliklar) if (mahalleEslesir(parca, b)) bulunan.add(id);
    }
    kumesi.set(d.id, bulunan.size === 1 ? [...bulunan][0] : bulunan.size > 1 ? KUME_COKLU : KUME_YOK);
  }
  const dolu = new Set(kumesi.values());
  const kumeler: AgKumesi[] = [
    ...mahalleler.filter(m => dolu.has(m.id)).map(m => ({ id: m.id, ad: m.title, mahalleId: m.id })),
    ...([[KUME_COKLU, 'Birden çok mahalle'], [KUME_DISARI, 'Adada oturmaz'], [KUME_YOK, 'Mahallesiz']] as const)
      .filter(([id]) => dolu.has(id)).map(([id, ad]) => ({ id, ad }))
  ];
  return { kumeler, kumesi };
}

/** Kimlikten 0–1 arası sabit sayı (açılışlar arasında aynı yerleşim) */
function sabitSayi(s: string, tuz: number): number {
  let h = 2166136261 ^ tuz;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Küme içi dizme: mahalle maddesi ortada sabit; öbürleri ayçiçeği gibi
 * çevresine dizilir, sonra küme içindeki bağlarla hafifçe çekişir. Güçlü bir
 * çekim kümeyi toplu tutar.
 */
function kumeIciDiz(uyeler: AgDugumu[], ciftler: AgCifti[], orta?: string): Map<string, Konum> {
  const ARA = 54;
  const p = new Map<string, Konum>();
  const digerleri = uyeler.filter(d => d.id !== orta)
    .sort((a, b) => a.tur.localeCompare(b.tur, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
  if (orta) p.set(orta, { x: 0, y: 0 });
  const altin = Math.PI * (3 - Math.sqrt(5));
  digerleri.forEach((d, i) => {
    const r = ARA * Math.sqrt(i + (orta ? 1.4 : 0.5));
    const a = i * altin;
    p.set(d.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
  });
  const ids = digerleri.map(d => d.id);
  const hepsi = [...p.keys()];
  const ic = ciftler.filter(c => p.has(c.a) && p.has(c.b));
  for (let t = 0; t < 120; t++) {
    const kayma = new Map<string, Konum>(hepsi.map(id => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < hepsi.length; i++) for (let j = i + 1; j < hepsi.length; j++) {
      const a = p.get(hepsi[i])!, b = p.get(hepsi[j])!;
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
      if (d2 > (ARA * 2.2) ** 2) continue;
      const f = (ARA * ARA) / d2;
      const ka = kayma.get(hepsi[i])!, kb = kayma.get(hepsi[j])!;
      ka.x += dx * f; ka.y += dy * f; kb.x -= dx * f; kb.y -= dy * f;
    }
    for (const c of ic) {
      // Mahalleye "bulunduğu yer" bağı herkeste var; çekmesin, kümeyi zaten topluyor
      if (c.a === orta || c.b === orta) continue;
      const a = p.get(c.a)!, b = p.get(c.b)!;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 0.1;
      const f = (d / ARA) * 0.3;
      const ka = kayma.get(c.a)!, kb = kayma.get(c.b)!;
      ka.x -= dx * f; ka.y -= dy * f; kb.x += dx * f; kb.y += dy * f;
    }
    const sicaklik = Math.max(1, 18 * (1 - t / 120));
    for (const id of ids) {
      const q = p.get(id)!, m = kayma.get(id)!;
      m.x -= q.x * 0.08; m.y -= q.y * 0.08;
      const uz = Math.hypot(m.x, m.y) || 1;
      const adim = Math.min(uz, sicaklik);
      q.x += (m.x / uz) * adim; q.y += (m.y / uz) * adim;
    }
  }
  return p;
}

export interface KumeYeri { id: string; x: number; y: number; r: number }

/**
 * Kümeli yerleşim: her küme kendi içinde dizilir, kümeler satır satır
 * yerleştirilir. `oran` ekranın eni / boyu: telefonda dik, masaüstünde yatık dizilir.
 */
export function kumeliDiz(dugumler: AgDugumu[], ciftler: AgCifti[], kumeler: AgKumesi[], kumesi: Map<string, string>, oran = 1.6):
  { konumlar: Map<string, Konum>; yerler: KumeYeri[] } {
  const ici = kumeler.map(k => {
    const uyeler = dugumler.filter(d => kumesi.get(d.id) === k.id);
    const p = kumeIciDiz(uyeler, ciftler, k.mahalleId && uyeler.some(u => u.id === k.mahalleId) ? k.mahalleId : undefined);
    const r = Math.max(85, ...[...p.values()].map(q => Math.hypot(q.x, q.y) + 44));
    return { k, p, r };
  }).filter(x => x.p.size);
  const BOSLUK = 46;
  // Kümenin yeri: çemberi ya da adı, hangisi genişse (uzaktan bakınca ad büyük yazılır, yan yana binmesin)
  const genislik = (x: typeof ici[number]) => Math.max(2 * x.r, (x.k.ad.length + 5) * 12) + BOSLUK;
  // Satırlara böl: en, ekranın biçimine (oran) en büyük ölçekle sığan dizilişi verecek gibi seçilir
  const sat = (en: number) => {
    const satirlar: Array<typeof ici> = [[]];
    let w = 0;
    for (const x of ici) {
      const g = genislik(x);
      if (w + g > en && satirlar[satirlar.length - 1].length) { satirlar.push([]); w = 0; }
      satirlar[satirlar.length - 1].push(x); w += g;
    }
    return satirlar;
  };
  const olc = (satirlar: Array<typeof ici>) => {
    const W = Math.max(...satirlar.map(r => r.reduce((t, x) => t + genislik(x), 0)));
    const H = satirlar.reduce((t, r) => t + Math.max(...r.map(x => 2 * x.r)) + BOSLUK + 30, 0);
    return Math.min(oran / W, 1 / H);
  };
  let satirlar = sat(Infinity);
  let enIyi = olc(satirlar);
  for (let i = 1, top = 0; i <= ici.length; i++) {
    top += genislik(ici[i - 1]);
    const aday = sat(top + 0.5);
    const o = olc(aday);
    if (o > enIyi) { enIyi = o; satirlar = aday; }
  }
  const konumlar = new Map<string, Konum>();
  const yerler: KumeYeri[] = [];
  let y = 0;
  for (const satir of satirlar) {
    const yuk = Math.max(...satir.map(x => 2 * x.r));
    const top = satir.reduce((t, x) => t + genislik(x), 0) - BOSLUK;
    let x0 = -top / 2;
    for (const x of satir) {
      // Satırdaki kümeler üstten hizalı: adları aynı çizgide okunur
      const g = genislik(x) - BOSLUK;
      const cx = x0 + g / 2, cy = y + x.r;
      for (const [id, q] of x.p) konumlar.set(id, { x: cx + q.x, y: cy + q.y });
      yerler.push({ id: x.k.id, x: cx, y: cy, r: x.r });
      x0 += g + BOSLUK;
    }
    y += yuk + BOSLUK + 30;
  }
  return { konumlar, yerler };
}

// ---------------------------------------------------------------- odak

/** Seçili maddeden en çok `derinlik` adımda varılan maddeler: kimlik → adım */
export function komsuAdimlari(merkez: string, ciftler: AgCifti[], derinlik: number): Map<string, number> {
  const adim = new Map<string, number>([[merkez, 0]]);
  let sinir = [merkez];
  for (let d = 1; d <= derinlik && sinir.length; d++) {
    const yeni: string[] = [];
    const s = new Set(sinir);
    for (const c of ciftler) {
      const o = s.has(c.a) ? c.b : s.has(c.b) ? c.a : null;
      if (o && !adim.has(o)) { adim.set(o, d); yeni.push(o); }
    }
    sinir = yeni;
  }
  return adim;
}

/**
 * Odak yerleşimi: seçili madde ortada, 1. adım çevresinde halka, 2. adım
 * dışta ve bağlı olduğu 1. adım maddesinin hizasında.
 */
export function odakDiz(merkez: string, adimlar: Map<string, number>, ciftler: AgCifti[], ad: (id: string) => string): Map<string, Konum> {
  const p = new Map<string, Konum>([[merkez, { x: 0, y: 0 }]]);
  const bir = [...adimlar].filter(([, d]) => d === 1).map(([id]) => id).sort((a, b) => ad(a).localeCompare(ad(b), 'tr'));
  const r1 = Math.max(150, (bir.length * 58) / (2 * Math.PI));
  const aci = new Map<string, number>();
  bir.forEach((id, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, bir.length)) * Math.PI * 2;
    aci.set(id, a);
    p.set(id, { x: Math.cos(a) * r1, y: Math.sin(a) * r1 });
  });
  const iki = [...adimlar].filter(([, d]) => d === 2).map(([id]) => {
    // Bağlı olduğu ilk 1. adım maddesinin açısı
    const ata = ciftler.find(c => (c.a === id && aci.has(c.b)) || (c.b === id && aci.has(c.a)));
    const a = ata ? aci.get(ata.a === id ? ata.b : ata.a)! : 0;
    return { id, a: a + sabitSayi(id, 3) * 0.001 };
  }).sort((x, y) => x.a - y.a);
  const r2 = Math.max(r1 + 140, (iki.length * 52) / (2 * Math.PI));
  // Atasının açısına göre sıralı, eşit aralıkla: komşusunun hizasına yakın düşer
  iki.forEach((x, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / Math.max(1, iki.length)) * Math.PI * 2;
    p.set(x.id, { x: Math.cos(a) * r2, y: Math.sin(a) * r2 });
  });
  return p;
}

/**
 * Ağdan bağ kurma: bağ ilk seçilen maddeye yazılır (düzenleyicideki gibi).
 * Aynı hedefe aynı türde bağ varsa kayıt değişmez (null).
 */
export function bagEkle(kaynak: Item, hedefId: string, tur: BagTuru): Item | null {
  const eski = ((kaynak.metadata?.relations as Array<Record<string, unknown>> | undefined) || []).filter(r => r && r.targetId);
  if (eski.some(r => r.targetId === hedefId && r.type === tur && !r.isProposal)) return null;
  const relations = [
    ...eski.filter(r => !(r.targetId === hedefId && r.type === tur)).map(r => {
      const o: Record<string, unknown> = { targetId: r.targetId, type: r.type };
      if (r.isProposal) o.isProposal = true;
      if (r.reason) o.reason = r.reason;
      if (typeof r.bas === 'number') o.bas = r.bas;
      if (typeof r.bit === 'number') o.bit = r.bit;
      return o;
    }),
    { targetId: hedefId, type: tur }
  ];
  return { ...kaynak, metadata: { ...(kaynak.metadata || {}), relations } as Item['metadata'], updatedAt: Date.now() };
}

/** Kenar türünün ekrandaki adı */
export function kenarAdi(e: Pick<AgKenari, 'tur' | 'etiket'>): string {
  if (e.tur === 'künye') return e.etiket ? `Künye · ${e.etiket}` : 'Künye';
  return BAG_TURLERI.find(b => b.id === e.tur)?.ad || e.tur;
}
