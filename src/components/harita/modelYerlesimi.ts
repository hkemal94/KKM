import type { FeatureCollection } from 'geojson';
import { IMPERIAL_CAPA, IMPERIAL_MODELI, KURUCU_MODELLERI, sabitSec, sans } from '../../lib/binaKutuphanesi';

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
}

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

/** Modeli görünebilecek yapıların listesi (yalnız hesap; çizim yakın bakışta) */
export function modelYerleri(geo: FeatureCollection): ModelYeri[] {
  const cikti: ModelYeri[] = [];
  const imperialGrubu: Array<{ id: string; tur: string; halka: Nokta[] }> = [];

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

    // Kurucu türü; üreteçten gelen evler `tur: 'ev'` taşır
    const tur = kt || (katman === 'bina' && p.tur === 'ev' ? 'ev' : id === MERKEZ_MEYDANI ? 'meydan' : '');
    const liste = KURUCU_MODELLERI[tur];
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

    cikti.push({
      id, dosya: sabitSec(id, liste), gizle: katman === 'bina' ? [id] : [],
      merkez: d.derece(kutu.c), ex: kutu.u, en: kutu.a, boy: kutu.b,
      ornekler: [d.derece(kutu.c), ...koseler]
    });
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
  return cikti;
}
