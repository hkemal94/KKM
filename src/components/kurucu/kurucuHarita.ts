import type { Feature } from 'geojson';
import { catmullRom, type Nokta } from '../harita/sinirBolgeleri';
import type { KurucuBelge } from '../harita/duzenTipi';
import { belgedenTaslak, metreye, derceye, kaydirDondur, merkezi, etrafindaTasi, yeniEvArsalari, type YolTuru } from './kurucuTipi';
import { binaBilgisi, binaKoseleri, type BinaTuru } from './kurucuSablonlari';

/**
 * Kurucu'nun haritaya işlenmiş katmanı (3. adım: "Haritaya işle").
 *
 * `duzada/haritaDuzeni` belgesindeki `kurucuIslenen` alanı, Kurucu'da
 * "Haritaya işle"ye basıldığı andaki taslağın kopyasıdır. Harita her
 * açılışta bu katmanı üretilmiş verinin üstüne bindirir:
 *   - kaldırılan yollar / yapılar gizlenir (veriden silinmez),
 *   - türü değişen yolların çizgisi değişir,
 *   - yeni yollar ve yapılar eklenir.
 * Yeni yol ve yapılara ad verilmez.
 */

/** Kurucu yol türü → haritanın yol türü (çizim kademesi) */
const HARITA_YOL: Record<YolTuru, string> = {
  ana: 'yol', sokak: 'sokak', toprak: 'toprak', patika: 'patika'
};

/** Düz alanlar prizma değil, zemine giydirilen dolgu olarak çizilir */
const ZEMIN_TURU: Partial<Record<BinaTuru, string>> = {
  meydan: 'teras', saha: 'saha', agac: 'bahçe', bag: 'bahçe'
};

export function kurucuKatmani(features: Feature[], belge: KurucuBelge): Feature[] {
  const t = belgedenTaslak(belge);
  const gizli = new Set(t.gizlenen);

  // Ev ve arsası tek yapı (8 Ekim): taşınan evin merkezi ve hareketi; arsası
  // ve duvarı (`ev` alanı) aynı hareketle gider, ev kaldırılınca onlar da
  const evHareketi = new Map<string, { c: Nokta; dx: number; dy: number; aci: number }>();
  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.katman !== 'bina' || f.geometry.type !== 'Polygon') continue;
    const d = t.binaDuzeni[String(p.id ?? '')];
    if (!d || !(d.dx || d.dy || d.aci)) continue;
    const halka = (f.geometry.coordinates[0] as Nokta[]).slice(0, -1).map(metreye);
    evHareketi.set(String(p.id), { c: merkezi(halka), dx: d.dx, dy: d.dy, aci: d.aci });
  }
  const evleTasi = (k: Nokta[], h: { c: Nokta; dx: number; dy: number; aci: number }) =>
    etrafindaTasi(k.map(metreye), h.c, h.dx, h.dy, h.aci).map(derceye);

  const cikti: Feature[] = [];
  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const id = String(p.id ?? '');
    const katman = String(p.katman ?? '');
    if ((katman === 'yol' || katman === 'bina' || katman === 'zemin') && gizli.has(id)) continue;
    if (p.ev && (katman === 'zemin' || katman === 'duvar')) {
      const ev = String(p.ev);
      if (gizli.has(ev)) continue;
      const h = evHareketi.get(ev);
      if (h && f.geometry.type === 'Polygon') {
        cikti.push({ ...f, geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.map(r => evleTasi(r as Nokta[], h)) } });
        continue;
      }
      if (h && f.geometry.type === 'MultiLineString') {
        cikti.push({ ...f, geometry: { type: 'MultiLineString', coordinates: f.geometry.coordinates.map(c => evleTasi(c as Nokta[], h)) } });
        continue;
      }
    }
    if (katman === 'etiket' && id.startsWith('etk_') && gizli.has(id.slice(4))) continue;
    // Taşınan yapının adı da onunla gider (30 Eylül)
    const bd = katman === 'etiket' && id.startsWith('etk_') ? t.binaDuzeni[id.slice(4)] : undefined;
    if (bd && f.geometry.type === 'Point') {
      const m = metreye(f.geometry.coordinates as Nokta);
      cikti.push({ ...f, geometry: { type: 'Point', coordinates: derceye([m[0] + bd.dx, m[1] + bd.dy]) } });
      continue;
    }
    if (katman === 'bina') {
      // Madde bağı (H, 29 Eylül) ve yapı düzeltmesi (30 Eylül): taşı, döndür, kat, tür
      const d = t.binaDuzeni[id];
      if (!t.baglar[id] && !d) { cikti.push(f); continue; }
      const yeniP: Record<string, unknown> = { ...p };
      if (t.baglar[id]) yeniP.wikiId = t.baglar[id];
      let geometry = f.geometry;
      if (d) {
        if (d.kat) { yeniP.kat = d.kat; yeniP.yukseklik = Math.round((d.kat * 3.1 + 1.4) * 10) / 10; }
        if (d.tur) { yeniP.tur = binaBilgisi(d.tur).ad; yeniP.kurucuTur = d.tur; }
        if (f.geometry.type === 'Polygon' && (d.dx || d.dy || d.aci)) {
          const halka = (f.geometry.coordinates[0] as Nokta[]).slice(0, -1).map(metreye);
          const yeni = kaydirDondur(halka, d.dx, d.dy, d.aci).map(derceye);
          geometry = { type: 'Polygon', coordinates: [[...yeni, yeni[0]]] };
        }
      }
      cikti.push({ ...f, properties: yeniP, geometry });
      continue;
    }
    if (katman === 'yol' && (t.turDegisikligi[id] || t.yolDuzeni[id])) {
      const yeniP = t.turDegisikligi[id] ? { ...p, tur: HARITA_YOL[t.turDegisikligi[id]] } : p;
      const parcalar = t.yolDuzeni[id];
      if (!parcalar) { cikti.push({ ...f, properties: yeniP }); continue; }
      // Noktası taşınan ya da parçası silinen yol: her parça ayrı çizgi
      parcalar.forEach((k, i) => cikti.push({
        type: 'Feature',
        properties: { ...yeniP, id: i ? `${id}_p${i}` : id },
        geometry: { type: 'LineString', coordinates: k }
      }));
      continue;
    }
    cikti.push(f);
  }

  for (const [id, y] of Object.entries(t.yeniYollar)) {
    if (gizli.has(id)) continue;
    cikti.push({
      type: 'Feature',
      properties: { katman: 'yol', id, ad: '', tur: HARITA_YOL[y.tur], kurucu: true },
      geometry: { type: 'LineString', coordinates: catmullRom(y.noktalar, false, 6) }
    });
  }

  for (const [id, b] of Object.entries(t.yeniBinalar)) {
    if (gizli.has(id)) continue;
    const bi = binaBilgisi(b.tur);
    const m = metreye(b.merkez);
    let halka: Nokta[];
    if (bi.yuvarlak) {
      halka = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return derceye([m[0] + Math.cos(a) * b.en / 2, m[1] + Math.sin(a) * b.en / 2]);
      });
    } else {
      halka = binaKoseleri(m, b.en, b.boy, b.aci).map(derceye);
    }
    const kapali = [...halka, halka[0]];
    const zemin = ZEMIN_TURU[b.tur];
    cikti.push(zemin
      ? {
          type: 'Feature',
          properties: { katman: 'zemin', id, ad: '', tur: zemin, kurucuTur: b.tur, kurucu: true },
          geometry: { type: 'Polygon', coordinates: [kapali] }
        }
      : {
          type: 'Feature',
          properties: {
            // Haritanın künye kutusu türü olduğu gibi gösteriyor: okunur ad
            katman: 'bina', id, ad: '', tur: bi.ad, kurucuTur: b.tur, mahalle: null, wikiId: t.baglar[id] ?? null,
            yukseklik: b.tur === 'cesme' ? 1.2 : b.tur === 'tribun' ? 6 : Math.max(b.kat ?? bi.kat, 1) * 3.2,
            taban: 0, kat: Math.max(b.kat ?? bi.kat, 1), kurucu: true
          },
          geometry: { type: 'Polygon', coordinates: [kapali] }
        });
  }
  // Kurucu'da konan evlerin arsası ve duvarı (8 Ekim): haritanın evleri gibi
  const hatlar = cikti.flatMap(f => (f.properties?.katman === 'yol' && f.geometry.type === 'LineString')
    ? [(f.geometry.coordinates as Nokta[]).map(metreye)] : []);
  const evler = Object.entries(t.yeniBinalar).filter(([id]) => !gizli.has(id))
    .map(([id, b]) => ({ id, tur: b.tur, m: metreye(b.merkez), en: b.en, boy: b.boy, aci: b.aci }));
  for (const a of yeniEvArsalari(evler, hatlar)) {
    const k = a.halka.map(derceye);
    cikti.push({
      type: 'Feature',
      properties: { katman: 'zemin', id: a.id, ad: '', tur: 'bahçe', ev: a.ev, kurucu: true },
      geometry: { type: 'Polygon', coordinates: [[...k, k[0]]] }
    });
    cikti.push({
      type: 'Feature',
      properties: { katman: 'duvar', id: `duvar_${a.ev}`, ev: a.ev, kurucu: true },
      geometry: { type: 'MultiLineString', coordinates: [a.duvar.map(derceye)] }
    });
  }
  // Özel yapılar: kat sayısına göre yükselen prizma (kat başına 3,2 m)
  for (const [id, o] of Object.entries(t.ozelYapilar)) {
    if (gizli.has(id)) continue;
    const halka = [...o.koseler, o.koseler[0]];
    cikti.push({
      type: 'Feature',
      properties: {
        katman: 'bina', id, ad: '', tur: 'Özel yapı', kurucuTur: o.kalip ?? 'ozel', mahalle: null,
        wikiId: t.baglar[id] ?? null, yukseklik: o.kat * 3.2, taban: 0, kat: o.kat, kurucu: true, ozel: true
      },
      geometry: { type: 'Polygon', coordinates: [halka] }
    });
  }

  // Doğa alanları: zemine giydirilen dolgu
  for (const [id, d] of Object.entries(t.doga)) {
    if (gizli.has(id)) continue;
    cikti.push({
      type: 'Feature',
      properties: { katman: 'zemin', id, ad: '', tur: d.tur, kurucu: true },
      geometry: { type: 'Polygon', coordinates: [[...d.koseler, d.koseler[0]]] }
    });
  }
  return cikti;
}

/** Taslak ile haritadaki hâl aynı mı? (Haritaya işle düğmesi için) */
export function belgelerAyniMi(a: KurucuBelge | undefined, b: KurucuBelge | undefined): boolean {
  // Oturanlar (3 Kasım) haritaya işlenmeyi beklemez; karşılaştırmaya girmez
  a = oturansiz(a); b = oturansiz(b);
  const bos = (x?: KurucuBelge) => !x || (!Object.keys(x.yeniYollar ?? {}).length
    && !Object.keys(x.turDegisikligi ?? {}).length && !(x.gizlenen ?? []).length
    && !Object.keys(x.yeniBinalar ?? {}).length && !Object.keys(x.ozelYapilar ?? {}).length
    && !Object.keys(x.doga ?? {}).length && !Object.keys(x.baglar ?? {}).length
    && !Object.keys(x.yolDuzeni ?? {}).length && !Object.keys(x.binaDuzeni ?? {}).length);
  // Boş alanlar ({}) ile hiç olmayan alan aynı sayılır: eski kayıtlarda yeni alanlar yok
  const temiz = (x?: KurucuBelge) => x && Object.fromEntries(Object.entries(x).filter(([, v]) =>
    !(v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
  a = temiz(a) as KurucuBelge | undefined;
  b = temiz(b) as KurucuBelge | undefined;
  if (bos(a) && bos(b)) return true;
  return sirali(a) === sirali(b);
}

const oturansiz = (x?: KurucuBelge): KurucuBelge | undefined => {
  if (!x) return x;
  const { oturanlar: _o, ...kalan } = x;
  return kalan;
};

/**
 * Anahtarları sıralı, sayıları yuvarlanmış metin (30 Eylül: kayıttan dönen
 * sayılardaki çok küçük farklar "işlenmemiş değişiklik" sanılıyordu).
 */
const sirali = (x?: unknown) => JSON.stringify(x ?? {}, (_k, v) =>
  typeof v === 'number' ? Math.round(v * 1e5) / 1e5
    : v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
      : v);

const ALAN_ADLARI: Record<string, string> = {
  yeniYollar: 'yeni yol', turDegisikligi: 'yol türü', gizlenen: 'kaldırılan', yeniBinalar: 'yeni yapı',
  ozelYapilar: 'özel yapı', doga: 'doğa alanı', baglar: 'madde bağı', yolDuzeni: 'yol düzeni', binaDuzeni: 'yapı düzeni'
};

/** Taslak ile haritadaki hâl arasında ne farklı: "2 yapı düzeni · 1 yol düzeni" */
export function belgeFarklari(a: KurucuBelge | undefined, b: KurucuBelge | undefined): string[] {
  const cikti: string[] = [];
  for (const [alan, ad] of Object.entries(ALAN_ADLARI)) {
    const x = (a as unknown as Record<string, unknown> | undefined)?.[alan];
    const y = (b as unknown as Record<string, unknown> | undefined)?.[alan];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xs = new Set((x as string[]) ?? []), ys = new Set((y as string[]) ?? []);
      const n = [...xs].filter(v => !ys.has(v)).length + [...ys].filter(v => !xs.has(v)).length;
      if (n) cikti.push(`${n} ${ad}`);
      continue;
    }
    const xo = (x as Record<string, unknown>) ?? {}, yo = (y as Record<string, unknown>) ?? {};
    const anahtarlar = new Set([...Object.keys(xo), ...Object.keys(yo)]);
    let n = 0;
    anahtarlar.forEach(k => { if (sirali(xo[k]) !== sirali(yo[k])) n++; });
    if (n) cikti.push(`${n} ${ad}`);
  }
  return cikti;
}
