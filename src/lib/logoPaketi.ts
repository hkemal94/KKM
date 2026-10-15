import type { BrandKit, Item } from '../types';
import { kurumMu } from './markaYapisi';

/**
 * Logolar (M, 8 Ekim). Kemal Canva'daki "KKM Logo" tasarımını şeffaf PNG
 * olarak Drive'a koydu: "İlgili marka ve viki maddelerine eklersin." Birden
 * çok logosu olanlarda "birincil, ikincil ve alternatif". Cevaplar
 * `docs/soru-cevap/logolar.md`.
 *
 * Dosyalar depoda (public/galeri/logolar, 1280 px WebP): kayda yalnız
 * adresi yazılır, kayıt şişmez (bir kaydın sınırı 1 MB). Durum → Eksikler →
 * "Logolar" kartı, Kemal basınca:
 *   - markaların / kurumların logoları Kemal'in sırasıyla yerleşir: birincil
 *     (brandKit.logoBase64), ikincil ve alternatif (ideaLogos'un başı;
 *     eskiler arkada "deneme" olarak kalır);
 *   - Galeri'deki eski küçük kopyalar (1 Ekim, 447 px) büyükleriyle
 *     değişir, olmayanlar eklenir; her biri sahibine bağlanır;
 *   - Birlik Zeytin ve Birlik Birası ürün maddeleri boş metinle açılır;
 *     kooperatifin (Kemal'in açtığı Düzada Ziraat İşletmeleri Kurumu) boş
 *     künye alanları kanondan dolar.
 * İkinci basışta iş kalmaz.
 */

const ADRES = '/galeri/logolar/';

export const BIRLIK_ZEYTIN_ID = 'urun_birlik_zeytin';
export const BIRLIK_BIRASI_ID = 'urun_birlik_birasi';
const kooperatifMi = (i: Item) => i.title.toLocaleLowerCase('tr').includes('ziraat işletmeleri');

type Hedef = { id: string } | { kurum: RegExp };
export type LogoRolu = 'birincil' | 'ikincil' | 'alternatif' | 'galeri';

export interface Logo {
  anahtar: string;
  baslik: string;
  dosya: string;
  hedef: Hedef;
  rol: LogoRolu;
  /** Galeri'de yerini aldığı eski küçük kopyanın anahtarı (metadata.canvaKaynak) */
  eski?: string;
}

const KSK = { kurum: /küçükçetmi/i };

export const LOGOLAR: Logo[] = [
  { anahtar: 'logo:kems', baslik: 'Kems Company — ana logo', dosya: 'kems-company.webp', hedef: { id: 'kems_company' }, rol: 'birincil', eski: 'canva:kems:1' },
  { anahtar: 'logo:kems-bayrak', baslik: 'Kems Company — bayrak', dosya: 'kems-company-bayrak.webp', hedef: { id: 'kems_company' }, rol: 'ikincil', eski: 'canva:kems:11' },
  { anahtar: 'logo:kems-harf', baslik: 'Kems Company — harf logo (KC)', dosya: 'kems-company-harf.webp', hedef: { id: 'kems_company' }, rol: 'alternatif', eski: 'canva:kems:12' },
  { anahtar: 'logo:kucukcetmi-maskot', baslik: 'Küçükçetmi Sürek Kulübü — maskot (Kangal)', dosya: 'kucukcetmi-maskot.webp', hedef: KSK, rol: 'birincil', eski: 'canva:kucukcetmi:1' },
  { anahtar: 'logo:kucukcetmi', baslik: 'Küçükçetmi Sürek Kulübü — yazı logo', dosya: 'kucukcetmi-surek-kulubu.webp', hedef: KSK, rol: 'ikincil', eski: 'canva:kucukcetmi:3' },
  { anahtar: 'logo:kucukcetmi-harf', baslik: 'Küçükçetmi Sürek Kulübü — harf logo (KÇ)', dosya: 'kucukcetmi-harf.webp', hedef: KSK, rol: 'alternatif', eski: 'canva:kucukcetmi:2' },
  { anahtar: 'logo:dirlik', baslik: 'Dirlik Spor Kulübü arması', dosya: 'dirlik-spor-kulubu.webp', hedef: { id: 'marka_dirlik' }, rol: 'birincil', eski: 'canva:kems:9' },
  { anahtar: 'logo:imperial', baslik: 'The Imperial Kemsköy — logo', dosya: 'the-imperial-kemskoy.webp', hedef: { id: 'kemskoy_hotel' }, rol: 'birincil' },
  { anahtar: 'logo:dondurmaci', baslik: 'Dondurmacı Kızlar — logo', dosya: 'dondurmaci-kizlar.webp', hedef: { id: 'viki_mekan_liman_kafe' }, rol: 'birincil', eski: 'canva:kems:8' },
  { anahtar: 'logo:dondurmaci-yazi', baslik: 'Dondurmacı Kızlar — yazı logo', dosya: 'dondurmaci-kizlar-yazi.webp', hedef: { id: 'viki_mekan_liman_kafe' }, rol: 'ikincil' },
  { anahtar: 'logo:birlik-zeytin', baslik: 'Birlik Zeytin etiketi', dosya: 'birlik-zeytin.webp', hedef: { id: BIRLIK_ZEYTIN_ID }, rol: 'galeri', eski: 'canva:kems:4' },
  { anahtar: 'logo:birlik-birasi', baslik: 'Birlik Birası etiketi', dosya: 'birlik-birasi.webp', hedef: { id: BIRLIK_BIRASI_ID }, rol: 'galeri', eski: 'canva:kems:3' }
];

export const logoAdresi = (l: Logo) => ADRES + l.dosya;

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

const bos = (): Pick<Item, 'tags' | 'links' | 'notes' | 'images' | 'isProposal' | 'archived'> =>
  ({ tags: [], links: [], notes: '', images: [], isProposal: false, archived: false });

const SAHIBI = 'Düzada Ziraat İşletmeleri Kurumu (Birlik markası, 1994–)';

/** Açılacak ürünler: metin boş, künyede yalnız Kemal'in cevapları */
const URUNLER: Array<YeniKayit & { id: string }> = [
  { ...bos(), id: BIRLIK_ZEYTIN_ID, title: 'Birlik Zeytin', area: 'duzada', type: 'ürün', status: 'Fikir', priority: 'orta', metadata: { profile: { owner: SAHIBI } } },
  { ...bos(), id: BIRLIK_BIRASI_ID, title: 'Birlik Birası', area: 'duzada', type: 'ürün', status: 'Fikir', priority: 'orta', metadata: { profile: { owner: SAHIBI } } }
];

/** Kooperatifin kanondaki künyesi: yalnız boş alana yazılır */
const KOOPERATIF_KUNYE: Record<string, string> = {
  founded: '1950–1970 arası',
  field: 'Kooperatif; Çiftlik\'te zeytinyağı fabrikası. Birlik markası (1994–): Birlik Zeytin, Birlik Birası'
};

function hedefBul(h: Hedef, items: Item[]): Item | undefined {
  if ('id' in h) return items.find(i => i.id === h.id && !i.archived);
  return items.find(i => !i.archived && kurumMu(i) && h.kurum.test(i.title));
}

export interface LogoIsleri {
  acilacak: Array<YeniKayit & { id: string }>;
  /** Logo sırası değişecek markalar / kurumlar */
  sira: Array<{ item: Item; neler: string[]; guncel: Item }>;
  /** Künyesinin boş alanları dolacak kooperatif */
  kunye: Array<{ item: Item; neler: string[]; guncel: Item }>;
  degisecek: Array<{ item: Item; logo: Logo; guncel: Item }>;
  eklenecek: Array<{ logo: Logo; kayit: YeniKayit; hedefAdi: string }>;
}

const bosKit = (): BrandKit => ({ selectedLogo: '', ideaLogos: [], colorPalette: [], exemplaryWorks: [] });

export function logoIsleri(items: Item[]): LogoIsleri {
  const simdi = Date.now();
  const acilacak = URUNLER.filter(m => !items.some(i => i.id === m.id));
  const tum = [...items, ...acilacak.map(m => ({ ...m, createdAt: simdi, updatedAt: simdi, userId: '' }) as Item)];

  // Logo sırası: hedef başına birincil / ikincil / alternatif
  const sira: LogoIsleri['sira'] = [];
  const hedefler = new Map<string, { item: Item; logolar: Logo[] }>();
  for (const l of LOGOLAR) {
    if (l.rol === 'galeri') continue;
    const h = hedefBul(l.hedef, items);
    if (!h) continue;
    const k = hedefler.get(h.id) ?? { item: h, logolar: [] };
    k.logolar.push(l);
    hedefler.set(h.id, k);
  }
  for (const { item, logolar } of hedefler.values()) {
    const kit: BrandKit = item.metadata?.brandKit ?? bosKit();
    const adres = (r: LogoRolu) => { const l = logolar.find(x => x.rol === r); return l ? logoAdresi(l) : ''; };
    const [b, i2, a] = [adres('birincil'), adres('ikincil'), adres('alternatif')];
    const ust = [i2, a].filter(Boolean);
    const eskiler = (kit.ideaLogos || []).filter(x => !ust.includes(x) && x !== b);
    const ideaLogos = [...ust, ...eskiler];
    const yeni: BrandKit = {
      ...kit,
      ...(b ? { logoBase64: b } : {}),
      ideaLogos,
      ...(i2 ? { ikincilLogoSira: 0 } : {}),
      ...(a ? { alternatifLogoSira: i2 ? 1 : 0 } : {})
    };
    const neler: string[] = [];
    if (b && kit.logoBase64 !== b) neler.push('birincil');
    if (i2 && (kit.ideaLogos?.[0] !== i2 || kit.ikincilLogoSira !== 0)) neler.push('ikincil');
    if (a && (kit.ideaLogos?.[i2 ? 1 : 0] !== a || kit.alternatifLogoSira !== (i2 ? 1 : 0))) neler.push('alternatif');
    if (neler.length) sira.push({ item, neler, guncel: { ...item, metadata: { ...item.metadata, brandKit: yeni }, updatedAt: simdi } });
  }

  // Kooperatif: Kemal'in açtığı kurum; yalnız boş alanlar dolar
  const kunye: LogoIsleri['kunye'] = [];
  const koop = items.find(i => !i.archived && kurumMu(i) && kooperatifMi(i));
  if (koop) {
    const p = ((koop.metadata?.profile as Record<string, string> | undefined) || {});
    const ek = Object.fromEntries(Object.entries(KOOPERATIF_KUNYE).filter(([k]) => !String(p[k] || '').trim()));
    const bolge = String(koop.metadata?.region || '').trim() ? {} : { region: 'çiftlik', merkezi: 'Çiftlik Mahallesi' };
    if (Object.keys(ek).length || Object.keys(bolge).length) {
      kunye.push({
        item: koop, neler: [...Object.keys(ek).map(k => (k === 'founded' ? 'kuruluş' : 'faaliyet')), ...(Object.keys(bolge).length ? ['yeri'] : [])],
        guncel: { ...koop, metadata: { ...koop.metadata, ...bolge, profile: { ...p, ...ek } }, updatedAt: simdi }
      });
    }
  }

  // Galeri: eski küçük kopyalar büyükleriyle değişir, olmayanlar eklenir
  const degisecek: LogoIsleri['degisecek'] = [];
  const eklenecek: LogoIsleri['eklenecek'] = [];
  const galeri = items.filter(i => i.type === 'ilham_gorsel' && !i.archived);
  const kaynak = (g: Item) => String((g.metadata as Record<string, unknown> | undefined)?.canvaKaynak || '');
  for (const l of LOGOLAR) {
    const adres = logoAdresi(l);
    const hedef = hedefBul(l.hedef, tum);
    const varOlan = galeri.find(g => kaynak(g) === l.anahtar) || (l.eski ? galeri.find(g => kaynak(g) === l.eski) : undefined);
    if (varOlan) {
      if ((varOlan.images || [])[0] !== adres || (hedef && (varOlan.metadata as Record<string, unknown> | undefined)?.bagliId !== hedef.id)) {
        degisecek.push({
          item: varOlan, logo: l,
          guncel: { ...varOlan, title: l.baslik, images: [adres], updatedAt: simdi, metadata: { ...varOlan.metadata, canvaKaynak: l.anahtar, ...(hedef ? { bagliId: hedef.id } : {}) } }
        });
      }
    } else {
      eklenecek.push({
        logo: l, hedefAdi: hedef?.title || '',
        kayit: {
          ...bos(), title: l.baslik, area: 'ilham', type: 'ilham_gorsel', status: 'Galeride', priority: 'düşük',
          tags: ['galeri', 'logo', 'canva'], images: [adres],
          metadata: { gorselTuru: 'logo', canvaKaynak: l.anahtar, canvaTasarim: 'KKM Logo', ...(hedef ? { bagliId: hedef.id } : {}) }
        }
      });
    }
  }
  return { acilacak, sira, kunye, degisecek, eklenecek };
}

export const logoIsiVar = (x: LogoIsleri) =>
  x.acilacak.length + x.sira.length + x.kunye.length + x.degisecek.length + x.eklenecek.length > 0;
