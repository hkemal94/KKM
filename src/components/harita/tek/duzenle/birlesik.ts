import { rakim, sahneye, tabanKotu, type Koleksiyon, type Nokta, type Oge, type Yapi, type Zemin } from '../tekVeri';
import { cografyaya, dikdortgen, duzdenSahneye, hucreAnahtari, icinde } from './geometri';
import { grupCizimi, kirpilmis, yerlesim, type GrupVerisi } from './gruplar';
import type { KareVerisi } from './kareler';
import { BOYALAR, KADEME, type TekTaslak, type YeniYapi } from './taslak';

/**
 * Haritanın verisi + taslak = ekranda görünen (saf iş). Tek harita Düzenle modunda bunu çizer;
 * Düzenle kapalıyken yalnız veri dosyaları görünür. Veri dosyalarındaki "elle" öğeler (ajansın
 * gen/kompakt_taslak_uygula.py ile işlediği eski taslaklar) burada sıradan öğe gibi okunur.
 */

/** Küçük öğe: ağaç ya da donatı (bank, çeşme, çardak…) */
export interface Kucuk { id: string; tur: 'agac' | 'donati'; dosya: string; merkez: Nokta; ex: Nokta; yukseklik: number; grup?: string; kaynak: 'veri' | 'taslak' | 'boya' }
export interface AlanCizimi { anahtar: string; renk: string; kareler: Nokta[][]; yukari?: number }

export interface Birlesik {
  yapilar: Yapi[];
  kucukler: Kucuk[];
  yollar: Koleksiyon;
  alanlar: AlanCizimi[];
  duvarlar: Nokta[][];
  /** Ağaç gizleme: 4 m'lik hücreler (hepsi / yalnız avlu ağaçları) */
  gizli: { hepsi: Set<number>; avlu: Set<number> };
  /** Taslakta değişen ya da yeni öğeler (vurgu için) */
  degisen: Set<string>;
}

export const GIZLI_HUCRE = 4;

/** Grup alanlarının rengi (hazir-gruplar.json → alan türleri) */
export const ALAN_RENGI: Record<string, string> = {
  meydan: '#E8DFCD', yesil: '#9DB872', bostan: '#B9A86A', zeytinlik: '#A9B57A', bag: '#8E9C4E', oyun: '#C9B48A',
  otopark: '#CFC8BA', mezarlik: '#A8A48F', rihtim: '#CBC2B0', saha: '#7FA35A', pazar: '#E4D6BC', avlu: '#E6DCCB',
  park: '#9DB872', bahce: '#B9B26A', meydancik: '#E3D8C3', agacli: '#7E9A5B'
};
const BOYA_RENGI = Object.fromEntries(BOYALAR.map(b => [b.id, b.renk]));
/** Boyanan "ağaç" karesine konan ağaç (KKM'nin bitki modeli) */
export const BOYA_AGACI = 'bitkiler/zeytin-yasli.glb';

/** Yeni yapı → haritanın yapı kaydı (taban dikdörtgen; çizilen zemine oturur, `tabanKotu`) */
export function yeniYapidan(z: Zemin, id: string, y: YeniYapi): Yapi {
  const merkez = sahneye(z.b, y.m);
  const ex: Nokta = [y.ex[0], y.ex[1]];
  const taban = dikdortgen(merkez, ex, y.en, y.boy);
  const { kot, zeminAlt } = tabanKotu(z, { tur: y.tur, dosya: y.dosya, merkez, ex, en: y.en, boy: y.boy, modelEn: y.modelEn, taban });
  return { id, tur: y.tur, dosya: y.dosya, vikiId: null, ad: null, mahalle: '', merkez, ex, en: y.en, boy: y.boy, modelEn: y.modelEn, yukseklik: y.yukseklik, kot, zeminAlt, taban, ...(y.grup ? { grup: y.grup.kimlik } : {}) };
}

/**
 * Var olan yapının taşınmış hâli. Kendi kıyısıyla gelen model (The Imperial) taşınınca verideki yeri ve
 * kotu (`modelYeri`) geçmez: öbür yapılar gibi tabanına ve zemine göre oturur.
 */
export function tasinmis(z: Zemin, y: Yapi, m: number[], exH: number[]): Yapi {
  const merkez = sahneye(z.b, m);
  const ex: Nokta = [exH[0], exH[1]];
  const taban = dikdortgen(merkez, ex, y.en, y.boy);
  const { modelYeri: _eskiYer, ...geri } = y;
  const { kot, zeminAlt } = tabanKotu(z, { ...geri, merkez, ex, taban });
  return { ...geri, merkez, ex, taban, kot, zeminAlt };
}

/** Veri dosyasındaki küçük öğeler (katman agac / donati; ajansın işlediği taslaklardan) */
export function verininKucukleri(z: Zemin, yapiVerisi: Koleksiyon): Kucuk[] {
  const out: Kucuk[] = [];
  for (const f of yapiVerisi.features) {
    const p = f.properties;
    if ((p.katman !== 'agac' && p.katman !== 'donati') || f.geometry.type !== 'Point' || typeof p.dosya !== 'string') continue;
    const ex = (p.ex as number[] | undefined) ?? [1, 0];
    out.push({ id: String(p.id), tur: p.katman, dosya: p.dosya, merkez: sahneye(z.b, f.geometry.coordinates as number[]), ex: [ex[0], ex[1]], yukseklik: Number(p.yukseklik) || 3, kaynak: 'veri' });
  }
  return out;
}

class Gizli {
  hepsi = new Set<number>();
  avlu = new Set<number>();
  cokgen(h: Nokta[], avlu: boolean, pay = 0) {
    const hedef = avlu ? this.avlu : this.hepsi;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const G = GIZLI_HUCRE;
    for (let i = Math.floor((x0 - pay) / G); i <= Math.floor((x1 + pay) / G); i++) for (let j = Math.floor((z0 - pay) / G); j <= Math.floor((z1 + pay) / G); j++) {
      const p: Nokta = [(i + 0.5) * G, (j + 0.5) * G];
      if (icinde(p, h) || (pay > 0 && h.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < pay + G))) hedef.add(hucreAnahtari(i, j));
    }
  }
  serit(c: Nokta[], yari: number) {
    const G = GIZLI_HUCRE;
    for (let n = 1; n < c.length; n++) {
      const [ax, az] = c[n - 1], [bx, bz] = c[n];
      const adim = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let s = 0; s <= adim; s++) {
        const x = ax + ((bx - ax) * s) / adim, z = az + ((bz - az) * s) / adim;
        const r = Math.ceil((yari + 1.5) / G);
        for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
          const i = Math.floor(x / G) + di, j = Math.floor(z / G) + dj;
          if (Math.hypot((i + 0.5) * G - x, (j + 0.5) * G - z) <= yari + 1.5) this.hepsi.add(hucreAnahtari(i, j));
        }
      }
    }
  }
}

/** Taslağın bir öğesinin geçerli olduğu her şey birleşir */
export function birlestir(
  z: Zemin, temel: { yapilar: Yapi[]; yollar: Koleksiyon; kucukler: Kucuk[] }, t: TekTaslak,
  ek: { gruplar?: GrupVerisi | null; kareler?: KareVerisi | null }
): Birlesik {
  const degisen = new Set<string>();
  const gizli = new Gizli();

  // Yapılar
  const yapilar: Yapi[] = [];
  for (const y of temel.yapilar) {
    const d = t.yapilar[y.id];
    if (d?.sil) { degisen.add(y.id); continue; }
    if (d?.m && d.ex) { const yy = tasinmis(z, y, d.m, d.ex); yapilar.push(yy); degisen.add(y.id); gizli.cokgen(yy.taban, false, 1); continue; }
    yapilar.push(y);
  }
  const kucukler: Kucuk[] = [];
  for (const k of temel.kucukler) {
    const d = t.yapilar[k.id];
    if (d?.sil) { degisen.add(k.id); continue; }
    if (d?.m && d.ex) { kucukler.push({ ...k, merkez: sahneye(z.b, d.m), ex: [d.ex[0], d.ex[1]] }); degisen.add(k.id); continue; }
    kucukler.push(k);
  }
  for (const [id, y] of Object.entries(t.yeniYapilar)) {
    degisen.add(id);
    if (y.tur === 'agac' || y.tur === 'donati') {
      kucukler.push({ id, tur: y.tur, dosya: y.dosya, merkez: sahneye(z.b, y.m), ex: [y.ex[0], y.ex[1]], yukseklik: y.yukseklik, grup: y.grup?.kimlik, kaynak: 'taslak' });
      continue;
    }
    const yy = yeniYapidan(z, id, y);
    yapilar.push(yy);
    gizli.cokgen(yy.taban, false, 1);
  }

  // Yollar: değişen var olan yollar yeni hâliyle, silinenler çıkar, yeniler eklenir
  const ozellik = (p: Record<string, unknown>, k: string, v: unknown) => (v === undefined ? p : { ...p, [k]: v });
  const features: Oge[] = [];
  for (const f of temel.yollar.features) {
    const p = f.properties;
    // Köprü / menfez kendi yolunun parçası: yol silinince ya da güzergâhı değişince çizilmez
    if (p.katman === 'kopru' && typeof p.yol === 'string' && (t.yollar[p.yol]?.sil || t.yollar[p.yol]?.n)) continue;
    const id = typeof p.id === 'string' ? p.id : null;
    const d = id ? t.yollar[id] : undefined;
    if (!d) { features.push(f); continue; }
    degisen.add(id!);
    if (d.sil) continue;
    let pr = { ...p };
    if (d.kademe) pr = ozellik(ozellik(pr, 'kademe', d.kademe), 'genislik', KADEME[d.kademe].genislik);
    if (d.tur) pr = ozellik(pr, 'tur', d.tur);
    if (d.ad !== undefined) pr = ozellik(pr, 'ad', d.ad);
    const coords = d.n ? duzdenSahneye(z.b, d.n).map(([x, sz]) => { const c = cografyaya(z.b, x, sz); return [c[0], c[1], Math.max(0, rakim(z, x, sz))]; }) : f.geometry.coordinates;
    features.push({ type: 'Feature', properties: pr, geometry: { type: 'LineString', coordinates: coords } });
    if (d.n) gizli.serit(duzdenSahneye(z.b, d.n), Number(pr.genislik) / 2 || 2);
  }
  for (const [id, y] of Object.entries(t.yeniYollar)) {
    degisen.add(id);
    const c = duzdenSahneye(z.b, y.n);
    features.push({
      type: 'Feature',
      properties: { katman: 'yol', id, kademe: y.kademe, tur: y.tur, ad: y.ad, genislik: KADEME[y.kademe].genislik },
      geometry: { type: 'LineString', coordinates: c.map(([x, sz]) => { const q = cografyaya(z.b, x, sz); return [q[0], q[1], Math.max(0, rakim(z, x, sz))]; }) }
    });
    gizli.serit(c, KADEME[y.kademe].genislik / 2);
  }

  // Alanlar: verideki "elle" alanlar, boyanan kareler, grupların alanları
  const alanlar: AlanCizimi[] = [];
  const duvarlar: Nokta[][] = [];
  for (const f of temel.yollar.features) {
    const p = f.properties;
    if (p.katman !== 'alan' || f.geometry.type !== 'Polygon') continue;
    const halka = (f.geometry.coordinates as number[][][])[0].map(q => sahneye(z.b, q));
    if (p.tur === 'grupAlani') { gizli.cokgen(halka, false); continue; }
    if (p.tur === 'avluKalkan') { gizli.cokgen(halka, true); continue; }
    if (typeof p.kare === 'string' && p.kare in t.kareler) continue;
    alanlar.push({ anahtar: String(p.id ?? p.kare ?? alanlar.length), renk: ALAN_RENGI[String(p.tur)] ?? '#CFC5B4', kareler: [halka] });
    gizli.cokgen(halka, false);
  }
  if (ek.kareler) {
    const boyali = new Map<string, Nokta[][]>();
    for (const [id, tur] of Object.entries(t.kareler)) {
      const k = ek.kareler.kimlik.get(id);
      if (!k) continue;
      degisen.add(id);
      if (tur === 'bos') continue;
      const l = boyali.get(tur) ?? []; l.push(k.koseler); boyali.set(tur, l);
      gizli.cokgen(k.koseler, false);
      if (tur === 'agac') kucukler.push({ id: `boya:${id}`, tur: 'agac', dosya: BOYA_AGACI, merkez: k.merkez, ex: [1, 0], yukseklik: 4, kaynak: 'boya' });
    }
    for (const [tur, kareler] of boyali) alanlar.push({ anahtar: `boya:${tur}`, renk: tur === 'agac' ? ALAN_RENGI.agacli : BOYA_RENGI[tur], kareler });
  }
  if (ek.gruplar) {
    for (const [id, g] of Object.entries(t.gruplar)) {
      const c0 = ek.gruplar.cesit.get(g.sablon);
      const c = c0 && kirpilmis(c0, g.kirp);
      if (!c) continue;
      degisen.add(id);
      const yer = yerlesim(sahneye(z.b, g.o), g.aci, g.yan);
      const ciz = grupCizimi(c, yer, ek.gruplar.kareM);
      for (const a of ciz.alanlar) {
        if (a.tur === 'bos') continue;
        alanlar.push({ anahtar: `${id}:${a.tur}`, renk: ALAN_RENGI[a.tur] ?? '#CFC5B4', kareler: a.kareler });
      }
      duvarlar.push(...ciz.duvarlar);
      gizli.cokgen(ciz.kutu, false);
      if (ek.kareler) for (const a of g.arsalar) for (const k of ek.kareler.arsalar.get(a) ?? []) gizli.cokgen(k.koseler, true);
    }
  }
  return { yapilar, kucukler, yollar: { ...temel.yollar, features }, alanlar, duvarlar, gizli: { hepsi: gizli.hepsi, avlu: gizli.avlu }, degisen };
}
