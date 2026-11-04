import type { FeatureCollection } from 'geojson';
import {
  ARACLAR, BAHCE, HARITA_TURLERI, HARITA_YAPILARI, IMPERIAL_CAPA, IMPERIAL_MODELI, KALIP_MODELLERI, KURUCU_MODELLERI, TEKNELER,
  sabitSec, sans
} from '../../lib/binaKutuphanesi';

/**
 * Haritada 3B modellerin yeri (4 Kasım). Saf hesap: çizili veriden hangi yapının
 * hangi modelle, nereye, hangi açıyla gösterileceğini çıkarır. Kayda bir şey
 * yazmaz; three.js'e de dokunmaz (çizim `modelKatmani.ts`'te).
 *
 * Kural: yapının Kurucu türünün (`kurucuTur`; üreteçten gelen evlerde `tur: 'ev'`)
 * katalogda modeli varsa model, yoksa eski kutu. Aynı türün birden çok modeli
 * varsa yapının kimliğine göre sabit seçim. Kalıbı otel olan özel yapı ve
 * haritadaki The Imperial grubu Imperial modelini alır.
 */

type Nokta = [number, number];

export interface ModelYeri {
  /** Yerleşimin kimliği (bağ ağaçlarında `kimlik#n`) */
  id: string;
  dosya: string;
  /** Modeli görününce kutusu gizlenecek harita yapıları */
  gizle: string[];
  /** Taban merkezi [boylam, enlem] */
  merkez: Nokta;
  /** Modelin +X ekseni, metre düzleminde (x doğu, y güney), birim */
  ex: Nokta;
  /** ex boyunca ve ona dik taban ölçüsü (metre); 0 → modelin kendi ölçüsü */
  en: number;
  boy: number;
  /** Imperial: kalıba göre oturur, tek ölçek; ön cephe ex'e diktir */
  imperial?: { olcek: number };
  /** Arazi yüksekliği okunacak noktalar [boylam, enlem] */
  ornekler: Nokta[];
  /** Kalıp modeli (fener…): modelin kendi başlangıç noktası tabanın merkezine, kendi ölçüsünde */
  kokten?: boolean;
  /** Hesap sırasında: haritadaki kalıp yapısının eklerini de gizle */
  ekler?: boolean;
  /** Evin bahçesi (yalnız daha yakın bakışta çizilir) */
  bahce?: Bahce;
  /** Yapının önü bu yöne (en yakın yol), metre düzleminde birim; model ön = +Z */
  yol?: Nokta;
  /** Bu yakınlıktan önce çizilmez (park etmiş arabalar) */
  esik?: number;
  /** Arazi yerine deniz yüzeyi (tekneler) */
  deniz?: boolean;
  /** Komşuluk çeşitlemesi için: aynı gruptaki yapılar yan yana aynı modeli almaz */
  cesit?: { grup: string; liste: string[] };
}

/** Bahçe parçası: kendi ölçüsünde, ex yönünde; kenar parçasında `sx` boy kısaltması */
export interface BahceParcasi { dosya: string; merkez: Nokta; ex: Nokta; sx?: number }
/**
 * Evin bahçesi (Kemal, 4 Kasım: "bütün evler bahçeli"). Arsa büyükse hazır bahçe
 * arsası modeli evin altına (evle aynı başlangıç köşesinden) konur; değilse arsanın
 * kenarına 2 m'lik parçalar dizilir, yola bakan kenara kapı, içe birkaç parça ve bitki.
 */
export interface Bahce { arsa?: string; /** kenar parçası (komşulukla değişebilir) */ kenar?: string; parcalar: BahceParcasi[] }

const M_ENLEM = 111_320;

/** Yerel metre düzlemi: x doğu, y güney (Kurucu ile aynı yön) */
function duzlem(enlem0: number, boylam0: number) {
  const kx = M_ENLEM * Math.cos((enlem0 * Math.PI) / 180);
  return {
    metre: (p: Nokta): Nokta => [(p[0] - boylam0) * kx, -(p[1] - enlem0) * M_ENLEM],
    derece: (m: Nokta): Nokta => [m[0] / kx + boylam0, -m[1] / M_ENLEM + enlem0]
  };
}

const acik = (h: Nokta[]): Nokta[] =>
  h.length > 1 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1] ? h.slice(0, -1) : h;

const ortalama = (h: Nokta[]): Nokta => [h.reduce((t, p) => t + p[0], 0) / h.length, h.reduce((t, p) => t + p[1], 0) / h.length];

/**
 * En küçük alanlı dikdörtgen (kenar yönlerinden). Dikdörtgen tabanlarda ilk
 * kenarın yönünü seçer: Kurucu'nun `en` kenarı.
 */
function tabanKutusu(k: Nokta[]): { c: Nokta; u: Nokta; a: number; b: number } {
  let en: { c: Nokta; u: Nokta; a: number; b: number; alan: number } | null = null;
  for (let i = 0; i < k.length; i++) {
    const p = k[i], q = k[(i + 1) % k.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l < 1e-6) continue;
    const u: Nokta = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const r of k) {
      const s = r[0] * u[0] + r[1] * u[1], t = -r[0] * u[1] + r[1] * u[0];
      a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t);
    }
    const alan = (a1 - a0) * (b1 - b0);
    if (!en || alan < en.alan - 1e-6) {
      const sm = (a0 + a1) / 2, tm = (b0 + b1) / 2;
      en = { c: [sm * u[0] - tm * u[1], sm * u[1] + tm * u[0]], u, a: a1 - a0, b: b1 - b0, alan };
    }
  }
  return en ?? { c: ortalama(k), u: [1, 0], a: 0, b: 0 };
}

function icinde(p: Nokta, h: Nokta[]): boolean {
  let ic = false;
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
    const [xi, yi] = h[i], [xj, yj] = h[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}

/** Otel kalıbının köşe sayısı (`anitKaliplari.ts`): 0. ve 3. köşe ön çıkmanın iki ucu, arası 10 m */
const OTEL_KOSE_SAYISI = 28;
/**
 * Merkez Mahallesi'nin meydanı (üreteçteki `meydan_yer_merkez`, ~25 × 26 m; yanında
 * Merkez Pazarı). Künye: meydanda eski taş çeşme ve yaşlı çınar, haftada bir pazar;
 * merkez-meydani modeli bunlarla çizildi. Öbür mahallelerin meydan parçaları modelsiz kalır.
 */
const MERKEZ_MEYDANI = 'meydan_yer_merkez';
const BAG_ARALIK = 9;          // bağdaki ağaçlar arası, metre
const BAG_EN_COK = 40;

/** Bağa dağıtılacak bitkiler: duvar gibi parçalar değil, yalnız bitkiler */
const bagBitkileri = (l: string[]) => {
  const b = l.filter(x => x.startsWith('bitkiler/') || /agac|zeytin/.test(x));
  return b.length ? b : l;
};

/** Bahçesi olan türler */
const BAHCELI = ['ev', 'dukkanli', 'yazlik', 'ciftlik'];
/** Hazır arsa modelinin sığdığı en küçük arsa (metre; modeller 23–33 × 25–34 m) */
const ARSA_KISA = 20, ARSA_UZUN = 22;
/** Arsa verisi yoksa evin çevresine bırakılan pay */
const ARSA_PAYI = 3.5;
const KENAR = 2;            // kenar parçası boyu
const KAPI = 1.2;           // kapı açıklığı
const YOL_KAFESI = 25;      // yol noktalarının ızgarası (metre)
/** Evlerin kaçta birinin önünde park etmiş araba (her 3–4 evde bir) */
const ARABA_ORANI = 0.28;
/** Komşuluk: aynı türdeki en yakın kaç yapıyla aynı model olmasın */
const KOMSU = 4;
/** Komşu aranan ızgara (metre) */
const KOMSU_KAFESI = 60;

/** Kimlikten sabit rastgele sayı dizisi */
function rastgele(kimlik: string) {
  let a = Math.floor(sans(kimlik) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface YolNoktasi { /** metre */ u: number; nokta: Nokta; /** yolun yönü, metre düzleminde birim */ yon: Nokta }

/** Yol parçaları, derece ızgarasında: bir noktaya en yakın yol noktası ve yolun yönü */
function yolIzgarasi(geo: FeatureCollection) {
  const kafes = new Map<string, Array<[Nokta, Nokta]>>();
  const adim = YOL_KAFESI / 111_320;
  const anahtar = (x: number, y: number) => `${x}:${y}`;
  for (const f of geo.features) {
    if ((f.properties as Record<string, unknown> | null)?.katman !== 'yol' || f.geometry?.type !== 'LineString') continue;
    const k = f.geometry.coordinates as Nokta[];
    for (let i = 0; i + 1 < k.length; i++) {
      const a = k[i], b = k[i + 1];
      // Parçanın geçtiği hücreler (kaba: uç noktalar arası örnek)
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (adim / 2)));
      const hucreler = new Set<string>();
      for (let j = 0; j <= n; j++) hucreler.add(anahtar(Math.floor((a[0] + ((b[0] - a[0]) * j) / n) / adim), Math.floor((a[1] + ((b[1] - a[1]) * j) / n) / adim)));
      for (const h of hucreler) { const l = kafes.get(h) ?? []; l.push([a, b]); kafes.set(h, l); }
    }
  }
  /** En yakın yol noktası (yakında yol yoksa null) */
  return (p: Nokta): YolNoktasi | null => {
    const x = Math.floor(p[0] / adim), y = Math.floor(p[1] / adim);
    const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
    const m = (q: Nokta): Nokta => [(q[0] - p[0]) * kx, -(q[1] - p[1]) * 111_320];
    let en: YolNoktasi | null = null;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const [a, b] of kafes.get(anahtar(x + i, y + j)) ?? []) {
        const ma = m(a), mb = m(b);
        const dx = mb[0] - ma[0], dy = mb[1] - ma[1], l2 = dx * dx + dy * dy;
        if (l2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, -(ma[0] * dx + ma[1] * dy) / l2));
        const q: Nokta = [ma[0] + dx * t, ma[1] + dy * t];
        const u = Math.hypot(q[0], q[1]);
        if (!en || u < en.u) {
          const l = Math.sqrt(l2);
          en = { u, nokta: [p[0] + q[0] / kx, p[1] - q[1] / 111_320], yon: [dx / l, dy / l] };
        }
      }
    }
    return en;
  };
}

/** Evin bahçesi; `ev` evin metre tabanı, `arsa` arsanın metre halkası (yoksa tahmin) */
function bahceKur(
  id: string, ev: { c: Nokta; u: Nokta; a: number; b: number }, arsa: Nokta[] | null,
  d: ReturnType<typeof duzlem>, yolBul: (p: Nokta) => YolNoktasi | null
): Bahce | undefined {
  if (!BAHCE.kenar.length && !BAHCE.arsalar.length) return undefined;
  const kutu = arsa ? tabanKutusu(arsa) : null;
  const uzun = kutu ? Math.max(kutu.a, kutu.b) : 0, kisa = kutu ? Math.min(kutu.a, kutu.b) : 0;
  if (BAHCE.arsalar.length && kisa >= ARSA_KISA && uzun >= ARSA_UZUN) {
    return { arsa: sabitSec(`${id}#arsa`, BAHCE.arsalar), parcalar: [] };
  }
  if (!BAHCE.kenar.length) return undefined;
  // Arsa yoksa evin çevresine pay bırakan dikdörtgen
  const k = (s: number, t: number): Nokta => [ev.c[0] + ev.u[0] * s - ev.u[1] * t, ev.c[1] + ev.u[1] * s + ev.u[0] * t];
  const ea = ev.a / 2 + ARSA_PAYI, eb = ev.b / 2 + ARSA_PAYI;
  const halka = arsa ?? [k(-ea, -eb), k(ea, -eb), k(ea, eb), k(-ea, eb)];
  const r = rastgele(id);
  const kenarModeli = sabitSec(`${id}#kenar`, BAHCE.kenar);
  const parcalar: BahceParcasi[] = [];

  // Kapı: orta noktası yola en yakın kenarda
  let kapiKenari = -1, enYakin = Infinity, enUzunKenar = 0, enUzun = -1;
  for (let i = 0; i < halka.length; i++) {
    const p = halka[i], q = halka[(i + 1) % halka.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > enUzunKenar) { enUzunKenar = l; enUzun = i; }
    if (l < KAPI + 1) continue;
    const u = yolBul(d.derece([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]))?.u ?? Infinity;
    if (u < enYakin) { enYakin = u; kapiKenari = i; }
  }
  if (kapiKenari < 0 || enYakin > 40) kapiKenari = enUzun;

  for (let i = 0; i < halka.length; i++) {
    const p = halka[i], q = halka[(i + 1) % halka.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l < 0.3) continue;
    const ex: Nokta = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    const nokta = (s: number) => d.derece([p[0] + ex[0] * s, p[1] + ex[1] * s]);
    // Kapı aralığı [k0, k1]
    const kapili = i === kapiKenari && BAHCE.kapi.length > 0;
    const k0 = kapili ? l / 2 - KAPI / 2 : Infinity, k1 = kapili ? l / 2 + KAPI / 2 : -Infinity;
    if (kapili) parcalar.push({ dosya: sabitSec(`${id}#kapi`, BAHCE.kapi), merkez: nokta(k0), ex });
    for (let s = 0; s < l - 0.05; s += KENAR) {
      const son = Math.min(l, s + KENAR);
      if (son > k0 && s < k1) {
        // Kapının iki yanını doldur
        if (s < k0 - 0.3) parcalar.push({ dosya: kenarModeli, merkez: nokta(s), ex, sx: (k0 - s) / KENAR });
        if (son > k1 + 0.3) parcalar.push({ dosya: kenarModeli, merkez: nokta(k1), ex, sx: (son - k1) / KENAR });
        continue;
      }
      parcalar.push({ dosya: kenarModeli, merkez: nokta(s), ex, ...(son - s < KENAR - 0.01 ? { sx: (son - s) / KENAR } : {}) });
    }
  }

  // İçeri: 2–4 parça ve 1–2 bitki, evle ve birbiriyle çakışmadan
  const ak = tabanKutusu(halka);
  const evIcinde = (q: Nokta) => {
    const x = q[0] - ev.c[0], y = q[1] - ev.c[1];
    return Math.abs(x * ev.u[0] + y * ev.u[1]) < ev.a / 2 + 1.8 && Math.abs(-x * ev.u[1] + y * ev.u[0]) < ev.b / 2 + 1.8;
  };
  const konan: Nokta[] = [];
  const yerBul = (): Nokta | null => {
    for (let deneme = 0; deneme < 24; deneme++) {
      const s = (r() - 0.5) * (ak.a - 3), t = (r() - 0.5) * (ak.b - 3);
      const q: Nokta = [ak.c[0] + ak.u[0] * s - ak.u[1] * t, ak.c[1] + ak.u[1] * s + ak.u[0] * t];
      if (!icinde(q, halka) || evIcinde(q) || konan.some(o => Math.hypot(o[0] - q[0], o[1] - q[1]) < 3.2)) continue;
      konan.push(q);
      return q;
    }
    return null;
  };
  const dagit = (liste: string[], adet: number, tur: string) => {
    for (let n = 0; n < adet && liste.length; n++) {
      const q = yerBul();
      if (!q) return;
      const aci = r() * Math.PI * 2;
      parcalar.push({ dosya: sabitSec(`${id}#${tur}${n}`, liste), merkez: d.derece(q), ex: [Math.cos(aci), Math.sin(aci)] });
    }
  };
  dagit(BAHCE.ic, 2 + Math.floor(r() * 3), 'ic');
  dagit(BAHCE.bitki, 1 + Math.floor(r() * 2), 'bitki');
  return { kenar: kenarModeli, parcalar };
}

/** Modeli görünebilecek yapıların listesi (yalnız hesap; çizim yakın bakışta) */
export function modelYerleri(geo: FeatureCollection): ModelYeri[] {
  const cikti: ModelYeri[] = [];
  const imperialGrubu: Array<{ id: string; tur: string; halka: Nokta[] }> = [];
  // Ev arsaları (üreteçte ve Kurucu'da `ev` alanıyla evine bağlı)
  const arsalar = new Map<string, Nokta[]>();
  for (const f of geo.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.katman === 'zemin' && p.ev && f.geometry?.type === 'Polygon') arsalar.set(String(p.ev), acik(f.geometry.coordinates[0] as Nokta[]));
  }
  let yolBul: ((p: Nokta) => YolNoktasi | null) | null = null;
  const yol = (p: Nokta) => (yolBul ??= yolIzgarasi(geo))(p);

  for (const f of geo.features) {
    if (f.geometry?.type !== 'Polygon') continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const id = String(p.id ?? '');
    const katman = String(p.katman ?? '');
    if (!id || (katman !== 'bina' && katman !== 'zemin')) continue;
    const halka = acik(f.geometry.coordinates[0] as Nokta[]);
    if (halka.length < 3) continue;

    if (katman === 'bina' && id.startsWith('bina_imperial')) {
      imperialGrubu.push({ id, tur: String(p.tur ?? ''), halka });
      continue;
    }

    const kt = p.kurucuTur !== undefined && p.kurucuTur !== null ? String(p.kurucuTur) : '';
    const c0 = ortalama(halka);
    const d = duzlem(c0[1], c0[0]);
    const m = halka.map(d.metre);

    // Otel kalıbı (özel yapı): kalıbın kendi köşe sırasından yön ve ölçek
    if (katman === 'bina' && p.ozel && kt === 'otel') {
      if (m.length !== OTEL_KOSE_SAYISI) continue;
      const k0 = m[0], k3 = m[3];
      const l = Math.hypot(k3[0] - k0[0], k3[1] - k0[1]);
      if (l < 1) continue;
      const ex: Nokta = [(k3[0] - k0[0]) / l, (k3[1] - k0[1]) / l];
      const olcek = l / 10;
      const on: Nokta = [-ex[1], ex[0]];
      // k0 kalıpta (-5, 24): merkez = k0 - olcek·(-5·ex + 24·on)
      const c: Nokta = [k0[0] - olcek * (-5 * ex[0] + 24 * on[0]), k0[1] - olcek * (-5 * ex[1] + 24 * on[1])];
      cikti.push({ id, dosya: IMPERIAL_MODELI, gizle: [id], merkez: d.derece(c), ex, en: 0, boy: 0,
        imperial: { olcek }, ornekler: [d.derece(c), ...halka.filter((_, i) => i % 4 === 0)] });
      continue;
    }

    // Kalıp modelleri (fener…): Kurucu'da kalıbıyla konan özel yapı ya da haritadaki aynı türdeki yapı
    const kalip = katman === 'bina' ? (p.ozel ? KALIP_MODELLERI[kt] : !kt ? KALIP_MODELLERI[String(p.tur ?? '')] : undefined) : undefined;
    if (kalip && kalip !== IMPERIAL_MODELI) {
      const c = ortalama(m);
      // Yön: kalıbın ilk köşesi (çember kalıplarında 0°)
      const k0 = m[0];
      const l = Math.hypot(k0[0] - c[0], k0[1] - c[1]);
      const ex: Nokta = p.ozel && l > 0.1 ? [(k0[0] - c[0]) / l, (k0[1] - c[1]) / l] : [1, 0];
      cikti.push({ id, dosya: kalip, gizle: [id], merkez: d.derece(c), ex, en: 0, boy: 0, kokten: true, ornekler: [d.derece(c)],
        ...(p.ozel ? {} : { ekler: true }) });
      continue;
    }

    // Kurucu türü; üreteçten gelen evler `tur: 'ev'` taşır
    // Üreteçten gelen yapılar: önce ad/kimlik tablosu (Belediye → belediye…), sonra tür (ev, depo)
    const yapi = katman === 'bina' && !kt ? HARITA_YAPILARI[id] : undefined;
    const tur = kt || (yapi && !yapi.includes('/') ? yapi : '')
      || (katman === 'bina' && !yapi ? HARITA_TURLERI[String(p.tur ?? '')] ?? '' : '')
      || (id === MERKEZ_MEYDANI ? 'meydan' : '');
    const liste = yapi?.includes('/') ? [yapi] : KURUCU_MODELLERI[tur];
    if (!liste?.length) continue;
    // Düz alanlar (meydan, ağaç, bağ, saha) zemin olarak çizilir; binalar prizma.
    // Ev arsaları da zemin; yalnız Kurucu'da konan alanın kendisi
    if (katman === 'zemin' && id !== MERKEZ_MEYDANI && (p.ev || !p.kurucu)) continue;

    const kutu = tabanKutusu(m);
    const kose = (s: number, t: number): Nokta => d.derece([
      kutu.c[0] + kutu.u[0] * s - kutu.u[1] * t, kutu.c[1] + kutu.u[1] * s + kutu.u[0] * t
    ]);
    const koseler = [kose(-kutu.a / 2, -kutu.b / 2), kose(kutu.a / 2, -kutu.b / 2), kose(kutu.a / 2, kutu.b / 2), kose(-kutu.a / 2, kutu.b / 2)];

    if (tur === 'bag') {
      // Bağ / bahçe parseli: aralıklı zeytin ağaçları, her biri kendi ölçüsünde
      let n = 0;
      for (let s = -kutu.a / 2 + BAG_ARALIK / 2; s < kutu.a / 2 && n < BAG_EN_COK; s += BAG_ARALIK) {
        for (let t = -kutu.b / 2 + BAG_ARALIK / 2; t < kutu.b / 2 && n < BAG_EN_COK; t += BAG_ARALIK) {
          const q: Nokta = [kutu.c[0] + kutu.u[0] * s - kutu.u[1] * t, kutu.c[1] + kutu.u[1] * s + kutu.u[0] * t];
          if (!icinde(q, m)) continue;
          const yid = `${id}#${n++}`;
          const aci = sans(yid) * Math.PI * 2;
          cikti.push({ id: yid, dosya: sabitSec(yid, bagBitkileri(liste)), gizle: [], merkez: d.derece(q),
            ex: [Math.cos(aci), Math.sin(aci)], en: 0, boy: 0, ornekler: [d.derece(q)] });
        }
      }
      continue;
    }

    let bahce: Bahce | undefined;
    const arsa = arsalar.get(id);
    if (katman === 'bina' && BAHCELI.includes(tur)) bahce = bahceKur(id, kutu, arsa ? arsa.map(d.metre) : null, d, yol);
    // Önü en yakın yola baksın (40 m içinde yol varsa)
    let yolYonu: Nokta | undefined;
    if (katman === 'bina') {
      const y = yol(d.derece(kutu.c));
      if (y && y.u > 0.5 && y.u < 40) { const q = d.metre(y.nokta); const l = Math.hypot(q[0] - kutu.c[0], q[1] - kutu.c[1]); yolYonu = [(q[0] - kutu.c[0]) / l, (q[1] - kutu.c[1]) / l]; }
    }
    cikti.push({
      id, dosya: sabitSec(id, liste), gizle: katman === 'bina' ? [id] : [],
      merkez: d.derece(kutu.c), ex: kutu.u, en: kutu.a, boy: kutu.b,
      ornekler: [d.derece(kutu.c), ...koseler], ...(bahce ? { bahce } : {}), ...(yolYonu ? { yol: yolYonu } : {}),
      ...(katman === 'bina' && liste.length > 1 ? { cesit: { grup: tur, liste } } : {})
    });
    // Park etmiş araba: her 3–4 evden birinin arsasında, yola bakan kenarın içinde, yola paralel.
    // Yollar yalnız okunur; araba yol çizgisinin üstüne konmaz.
    if (katman === 'bina' && arsa && BAHCELI.includes(tur) && ARACLAR.length && sans(`${id}#araba`) < ARABA_ORANI) {
      const am = arsa.map(d.metre);
      const cm = ortalama(am);
      const y = yol(d.derece(cm));
      if (y && y.u < 30) {
        const q = d.metre(y.nokta);
        const l = Math.hypot(cm[0] - q[0], cm[1] - q[1]);
        const yan: Nokta = [(cm[0] - q[0]) / l, (cm[1] - q[1]) / l];
        // Yoldan arsaya doğru yürü: arsaya girilen yerden 1,4 m içeri
        let c: Nokta | null = null;
        for (let t = 0; t < l; t += 0.5) {
          const k: Nokta = [q[0] + yan[0] * t, q[1] + yan[1] * t];
          if (icinde(k, am)) { c = [k[0] + yan[0] * 1.4, k[1] + yan[1] * 1.4]; break; }
        }
        // Evin tabanına binmesin
        const evde = (k: Nokta) => {
          const x = k[0] - kutu.c[0], yy = k[1] - kutu.c[1];
          return Math.abs(x * kutu.u[0] + yy * kutu.u[1]) < kutu.a / 2 + 2.5 && Math.abs(-x * kutu.u[1] + yy * kutu.u[0]) < kutu.b / 2 + 2.5;
        };
        if (c && icinde(c, am) && !evde(c)) {
          const ters = sans(`${id}#yon`) < 0.5 ? -1 : 1;
          cikti.push({ id: `${id}#araba`, dosya: sabitSec(`${id}#arac`, ARACLAR), gizle: [], merkez: d.derece(c),
            ex: [y.yon[0] * ters, y.yon[1] * ters], en: 0, boy: 0, ornekler: [d.derece(c)], esik: 18 });
        }
      }
    }
  }

  // Haritadaki kalıp yapısının ekleri modelin içinde (fenerin bekçi evi: bina_fener → bina_fener_evi)
  const binalar = geo.features.map(f => String((f.properties as Record<string, unknown> | null)?.katman === 'bina' ? f.properties?.id ?? '' : ''));
  for (const y of cikti) {
    if (!y.ekler) continue;
    y.gizle.push(...binalar.filter(b => b.startsWith(`${y.id}_`)));
    delete y.ekler;
  }

  // Haritadaki The Imperial: U biçimli ana kütle ve ön köşelerdeki iki kule
  const kuleler = imperialGrubu.filter(g => g.tur === 'kule');
  const govde = imperialGrubu.find(g => g.tur === 'otel');
  if (govde && kuleler.length === 2) {
    const c0 = ortalama(govde.halka);
    const d = duzlem(c0[1], c0[0]);
    const k1 = ortalama(kuleler[0].halka.map(d.metre)), k2 = ortalama(kuleler[1].halka.map(d.metre));
    const u = ortalama(govde.halka.map(d.metre));
    const orta: Nokta = [(k1[0] + k2[0]) / 2, (k1[1] + k2[1]) / 2];
    const ara = Math.hypot(k2[0] - k1[0], k2[1] - k1[1]);
    const ol = Math.hypot(orta[0] - u[0], orta[1] - u[1]);
    if (ara > 1 && ol > 1) {
      // Ön cephe kulelerin tarafında
      const on: Nokta = [(orta[0] - u[0]) / ol, (orta[1] - u[1]) / ol];
      const ex: Nokta = [on[1], -on[0]];
      const olcek = ara / IMPERIAL_CAPA.kuleArasi;
      const c: Nokta = [orta[0] - 24 * olcek * on[0], orta[1] - 24 * olcek * on[1]];
      cikti.push({ id: 'bina_imperial', dosya: IMPERIAL_MODELI, gizle: imperialGrubu.map(g => g.id),
        merkez: d.derece(c), ex, en: 0, boy: 0, imperial: { olcek },
        ornekler: [d.derece(c), ...govde.halka.filter((_, i) => i % 3 === 0)] });
    }
  }
  teknelerKoy(geo, cikti);
  cesitle(cikti);
  return cikti;
}

/**
 * Tekneler (Kemal, 4 Kasım): Liman İskelesi'nin iki yanına balıkçı ve gırgır
 * tekneleriyle sandal, İskele Mahallesi'ndeki küçük iskeleye birkaç sandal.
 * İskeleler haritadaki `tur: 'iskele'` yapılardan (mendirek hariç); tekne iskeleye
 * paralel, deniz yüzeyinde; karaya düşen yer atlanır.
 */
function teknelerKoy(geo: FeatureCollection, cikti: ModelYeri[]) {
  if (!TEKNELER.sandal.length) return;
  const ada = geo.features.find(f => (f.properties as Record<string, unknown> | null)?.katman === 'ada');
  const kara: Nokta[][] = !ada ? [] : ada.geometry.type === 'Polygon' ? [ada.geometry.coordinates[0] as Nokta[]]
    : ada.geometry.type === 'MultiPolygon' ? ada.geometry.coordinates.map(p => p[0] as Nokta[]) : [];
  const karada = (p: Nokta) => kara.some(h => icinde(p, h));
  for (const f of geo.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (p.katman !== 'bina' || p.tur !== 'iskele' || f.geometry?.type !== 'Polygon') continue;
    const id = String(p.id ?? '');
    if (/mendirek/.test(id)) continue;
    const halka = acik(f.geometry.coordinates[0] as Nokta[]);
    const c0 = ortalama(halka);
    const d = duzlem(c0[1], c0[0]);
    const kutu = tabanKutusu(halka.map(d.metre));
    // Uzun kenar boyunca
    const u: Nokta = kutu.a >= kutu.b ? kutu.u : [-kutu.u[1], kutu.u[0]];
    const boyu = Math.max(kutu.a, kutu.b), eni = Math.min(kutu.a, kutu.b);
    const n: Nokta = [-u[1], u[0]];
    const liman = p.mahalle === 'yer_liman';
    // Liman: büyük tekneler ve sandal; İskele: yalnız sandal
    const turler = liman ? [TEKNELER.balikci, TEKNELER.girgir, TEKNELER.sandal, TEKNELER.balikci] : [TEKNELER.sandal];
    let sira = 0;
    for (const yan of [1, -1]) {
      let s = -boyu / 2 + 2;
      for (let k = 0; k < (liman ? 4 : 3); k++) {
        const liste = turler[(sira++) % turler.length];
        if (!liste.length) continue;
        const yid = `${id}#tekne${yan}${k}`;
        const dosya = sabitSec(yid, liste);
        const { uzun, gen } = TEKNE_OLCU(dosya);
        if (s + uzun > boyu / 2) break;
        const q: Nokta = [kutu.c[0] + u[0] * (s + uzun / 2) + n[0] * yan * (eni / 2 + gen / 2 + 0.6),
          kutu.c[1] + u[1] * (s + uzun / 2) + n[1] * yan * (eni / 2 + gen / 2 + 0.6)];
        s += uzun + 1.5 + sans(yid) * 2;
        const qd = d.derece(q);
        if (karada(qd)) continue;
        const ters = sans(`${yid}y`) < 0.5 ? -1 : 1;
        cikti.push({ id: yid, dosya, gizle: [], merkez: qd, ex: [u[0] * ters, u[1] * ters], en: 0, boy: 0, ornekler: [qd], deniz: true });
      }
    }
  }
}

/** Teknelerin yaklaşık boyu ve eni (metre; modeller x boyunca uzun) */
const TEKNE_OLCU = (dosya: string) => /girgir/.test(dosya) ? { uzun: 16, gen: 5.5 }
  : /balikci/.test(dosya) ? { uzun: 8, gen: 2.6 } : { uzun: 4.6, gen: 1.6 };

/**
 * Komşuluk çeşitlemesi (Kemal, 4 Kasım: "yan yana olan evler hep aynı tip"):
 * yapılar kimlik sırasıyla dolaşılır; her biri kendi listesinde kimliğinden çıkan
 * yerden başlar, aynı gruptaki en yakın KOMSU yapının aldığı modeli atlar. Bahçe
 * arsası ve kenar türü de aynı kuralla. Sonuç her yüklemede aynıdır.
 */
function cesitle(cikti: ModelYeri[]) {
  const kx = 111_320 * Math.cos((39.6 * Math.PI) / 180);
  const metre = (p: Nokta): Nokta => [p[0] * kx, p[1] * 111_320];
  const sec = (ogeler: Array<{ id: string; p: Nokta; grup: string; liste: string[]; ata: (d: string) => void }>) => {
    const kafes = new Map<string, number[]>();
    const anahtar = (g: string, x: number, y: number) => `${g}|${x}:${y}`;
    ogeler.forEach((o, i) => {
      const k = anahtar(o.grup, Math.floor(o.p[0] / KOMSU_KAFESI), Math.floor(o.p[1] / KOMSU_KAFESI));
      const l = kafes.get(k) ?? []; l.push(i); kafes.set(k, l);
    });
    const secilen = new Map<number, string>();
    const sira = ogeler.map((_, i) => i).sort((a, b) => (ogeler[a].id < ogeler[b].id ? -1 : ogeler[a].id > ogeler[b].id ? 1 : 0));
    for (const i of sira) {
      const o = ogeler[i];
      const x = Math.floor(o.p[0] / KOMSU_KAFESI), y = Math.floor(o.p[1] / KOMSU_KAFESI);
      const yakin: Array<[number, number]> = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const j of kafes.get(anahtar(o.grup, x + a, y + b)) ?? []) {
          if (j !== i) yakin.push([Math.hypot(ogeler[j].p[0] - o.p[0], ogeler[j].p[1] - o.p[1]), j]);
        }
      }
      yakin.sort((a, b) => a[0] - b[0]);
      const kullanilan = new Set(yakin.slice(0, KOMSU).map(([, j]) => secilen.get(j)).filter((d): d is string => !!d));
      const n = o.liste.length;
      const bas = Math.floor(sans(o.id) * n) % n;
      let dosya = o.liste[bas];
      for (let k = 0; k < n; k++) {
        const aday = o.liste[(bas + k) % n];
        if (!kullanilan.has(aday)) { dosya = aday; break; }
      }
      secilen.set(i, dosya);
      o.ata(dosya);
    }
  };
  // Yapılar
  sec(cikti.filter(y => y.cesit).map(y => ({ id: y.id, p: metre(y.merkez), grup: y.cesit!.grup, liste: y.cesit!.liste, ata: (d: string) => { y.dosya = d; } })));
  // Bahçe arsaları
  sec(cikti.filter(y => y.bahce?.arsa && BAHCE.arsalar.length > 1).map(y => ({
    id: `${y.id}#arsa`, p: metre(y.merkez), grup: 'arsa', liste: BAHCE.arsalar, ata: (d: string) => { y.bahce!.arsa = d; }
  })));
  // Bahçe kenarı (duvar / çit türü)
  sec(cikti.filter(y => y.bahce?.kenar && BAHCE.kenar.length > 1).map(y => ({
    id: `${y.id}#kenar`, p: metre(y.merkez), grup: 'kenar', liste: BAHCE.kenar, ata: (d: string) => {
      const eski = y.bahce!.kenar;
      y.bahce!.parcalar.forEach(p => { if (p.dosya === eski) p.dosya = d; });
      y.bahce!.kenar = d;
    }
  })));
  for (const y of cikti) delete y.cesit;
}
