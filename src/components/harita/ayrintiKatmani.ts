import type { Feature, FeatureCollection, Polygon } from 'geojson';

/**
 * Haritanın ayrıntı katmanı (2 Ekim, Kemal: "harita ürünlerinin biraz daha
 * detaylı olmasını isterim" — özel yapılar, evler, doğa, araç ve süs).
 *
 * Üretilmiş veriye (duzadaGeo) dokunmaz; harita açılırken ondan türetilir:
 *   - çatılar: her evin üstünde biraz içeri çekilmiş ikinci bir kütle;
 *     çoğu kiremit, bir kısmı düz (beyaz badanalı) dam,
 *   - fenerin tepesi: balkon, lamba camı ve kubbe,
 *   - zeytinlikler (ve Kurucu'da çizilen orman alanları): tek tek ağaçlar,
 *   - bağ bölmeleri: sıra sıra asma; avlular: ara ara bir ağaç (2 Ekim,
 *     Ege dokusu).
 * Hepsi süs: tıklanmaz, kayda yazılmaz, adı yok.
 */

type Nokta = [number, number];

const M_ENLEM = 111_320;
const mBoylam = (enlem: number) => 111_320 * Math.cos((enlem * Math.PI) / 180);

/** Kimlikten tekrar üretilebilir 0–1 sayı (her açılışta aynı ağaç aynı yerde) */
function sans(kimlik: string): number {
  let h = 2166136261;
  for (let i = 0; i < kimlik.length; i++) { h ^= kimlik.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

const merkez = (h: Nokta[]): Nokta => {
  const k = h.length > 1 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1] ? h.slice(0, -1) : h;
  return [k.reduce((t, q) => t + q[0], 0) / k.length, k.reduce((t, q) => t + q[1], 0) / k.length];
};

/** Halkayı merkezine doğru `oran` kadar küçültür */
const icineCek = (h: Nokta[], oran: number): Nokta[] => {
  const c = merkez(h);
  return h.map(p => [c[0] + (p[0] - c[0]) * oran, c[1] + (p[1] - c[1]) * oran] as Nokta);
};

/** Metre cinsinden yarıçaplı sekizgen */
const sekizgen = (c: Nokta, r: number, kenar = 8): Nokta[] => {
  const kx = mBoylam(c[1]);
  const h: Nokta[] = [];
  for (let i = 0; i <= kenar; i++) {
    const a = (i / kenar) * Math.PI * 2;
    h.push([c[0] + (Math.cos(a) * r) / kx, c[1] + (Math.sin(a) * r) / M_ENLEM]);
  }
  return h;
};

const icinde = (p: Nokta, h: Nokta[]): boolean => {
  let ic = false;
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
    const [xi, yi] = h[i], [xj, yj] = h[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
};

/** `bina`: üstüne oturduğu yapının kimliği (3B model görününce çatı da gizlenir) */
const kutle = (halka: Nokta[], alt: number, ust: number, renk: string, tur: string, bina?: string): Feature<Polygon> => ({
  type: 'Feature',
  properties: bina ? { katman: 'ayrinti', tur, alt, ust, renk, bina } : { katman: 'ayrinti', tur, alt, ust, renk },
  geometry: { type: 'Polygon', coordinates: [halka] }
});

/** Ege kiremidi ve badana; evden eve az farkla */
const KIREMIT = ['#B5603F', '#A9553A', '#C06C48', '#9E4E36'];
const DAM = ['#EEE8DC', '#E6DED0'];
const ZEYTIN = ['#6E7F4A', '#7A8A55', '#647444', '#82905F'];
const CAM = ['#4F6B45', '#5A7550', '#46603E'];

const ASMA = ['#5E7A3A', '#67833F', '#587236'];

const AGAC_ARALIK = 13;        // metre
const EN_COK_AGAC = 4500;
const ASMA_ARALIK = 3;         // bağ sıraları arası, metre
const EN_COK_ASMA = 2500;
const AVLU_ARALIK = 9;         // avlu ağacı adayları arası, metre
const EN_COK_AVLU_AGACI = 3000;

/** Yatay bir çizginin halkayı kestiği boylamlar, sıralı */
const kesisimler = (y: number, h: Nokta[]): number[] => {
  const xs: number[] = [];
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
    const [xi, yi] = h[i], [xj, yj] = h[j];
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
  }
  return xs.sort((a, b) => a - b);
};

export function ayrintiVerisi(geo: FeatureCollection): FeatureCollection {
  const cikti: Feature[] = [];
  let agac = 0;
  let asma = 0;
  let avluAgaci = 0;

  for (const f of geo.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (f.geometry.type !== 'Polygon') continue;
    const halka = f.geometry.coordinates[0] as Nokta[];
    const id = String(p.id ?? '');

    if (p.katman === 'bina') {
      const H = Number(p.yukseklik) || 0;
      if (!H) continue;
      // Kurucu'da konan evlerin türü `kurucuTur`da (tur okunur ad taşır)
      const kt = String(p.kurucuTur ?? '');
      const tur = ['ev', 'dukkanli', 'yazlik'].includes(kt) ? 'ev' : kt === 'depo' ? 'depo' : String(p.tur ?? '');

      // Çatılar: ev, ahır, depo ve küçük mekânlar
      if (['ev', 'ahir', 'depo', 'kafe', 'meyhane', 'yapı', 'kulüp'].includes(tur)) {
        const s = sans(id + 'c');
        const duz = tur === 'ev' && s < 0.28;          // düz dam (badanalı)
        const renk = duz ? DAM[Math.floor(s * 10) % DAM.length] : KIREMIT[Math.floor(s * 97) % KIREMIT.length];
        // Kiremit çatı iki kademe: saçak ve mahya (sivri çatıya yakın görünür)
        if (duz) {
          cikti.push(kutle(icineCek(halka, 0.92), H, H + 0.5, renk, 'cati', id));
        } else {
          cikti.push(kutle(icineCek(halka, 0.9), H, H + 0.9, renk, 'cati', id));
          cikti.push(kutle(icineCek(halka, 0.55), H + 0.9, H + 1.8, renk, 'cati', id));
        }
        continue;
      }

      // Fenerin tepesi: balkon, lamba camı, kubbe
      if (tur === 'fener') {
        const c = merkez(halka);
        const kx = mBoylam(c[1]);
        const r = halka.reduce((t, q) => t + Math.hypot((q[0] - c[0]) * kx, (q[1] - c[1]) * M_ENLEM), 0) / halka.length;
        cikti.push(kutle(sekizgen(c, r + 1.1, 12), H - 1.4, H - 0.8, '#2E3A55', 'fener', id));
        cikti.push(kutle(sekizgen(c, r * 0.72, 12), H - 0.8, H + 2.6, '#7FA0B8', 'fener', id));
        cikti.push(kutle(sekizgen(c, r * 0.6, 12), H + 2.6, H + 3.6, '#B5453A', 'fener', id));
        cikti.push(kutle(sekizgen(c, r * 0.2, 6), H + 3.6, H + 4.6, '#2E3A55', 'fener', id));
        continue;
      }

      // Otel kuleleri ve kuleler: tepede kiremit külah
      if (tur === 'kule' || tur === 'otel') {
        cikti.push(kutle(icineCek(halka, 0.95), H, H + 0.8, '#E6DCCB', 'cati', id));
        if (tur === 'kule') cikti.push(kutle(icineCek(halka, 0.6), H + 0.8, H + 3, '#A9553A', 'cati', id));
        continue;
      }
      continue;
    }

    // Bağ: doğu-batı sıralar halinde alçak asmalar
    if (p.katman === 'zemin' && p.tur === 'bağ' && asma < EN_COK_ASMA) {
      const ys = halka.map(q => q[1]);
      const kx = mBoylam(ys[0]);
      const yari = 0.45 / M_ENLEM, pay = 1 / kx;
      const renk = ASMA[Math.floor(sans(id) * 31) % ASMA.length];
      for (let y = Math.min(...ys) + ASMA_ARALIK / M_ENLEM; y < Math.max(...ys) && asma < EN_COK_ASMA; y += ASMA_ARALIK / M_ENLEM) {
        const xs = kesisimler(y, halka);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const x0 = xs[i] + pay, x1 = xs[i + 1] - pay;
          if (x1 - x0 < 3 / kx) continue;
          cikti.push(kutle([[x0, y - yari], [x1, y - yari], [x1, y + yari], [x0, y + yari], [x0, y - yari]], 0, 1.2, renk, 'agac'));
          asma++;
        }
      }
      continue;
    }

    // Avlu ve ev bahçesi: ara ara bir ağaç (incir, limon, dut gibi; adı yok)
    if (p.katman === 'zemin' && (p.tur === 'avlu' || p.tur === 'bahçe') && avluAgaci < EN_COK_AVLU_AGACI) {
      const xs = halka.map(q => q[0]), ys = halka.map(q => q[1]);
      const kx = mBoylam(ys[0]);
      for (let y = Math.min(...ys); y <= Math.max(...ys) && avluAgaci < EN_COK_AVLU_AGACI; y += AVLU_ARALIK / M_ENLEM) {
        for (let x = Math.min(...xs); x <= Math.max(...xs) && avluAgaci < EN_COK_AVLU_AGACI; x += AVLU_ARALIK / kx) {
          const k = `${id}${x.toFixed(5)}${y.toFixed(5)}`;
          if (sans(k + 'a') > 0.22) continue;
          const q: Nokta = [x, y];
          if (!icinde(q, halka)) continue;
          // gövde avlunun kenarına değmesin: dört yanda 2 m boşluk
          const d = 2 / M_ENLEM, dx = 2 / kx;
          if (![[x + dx, y], [x - dx, y], [x, y + d], [x, y - d]].every(c => icinde(c as Nokta, halka))) continue;
          const s = sans(k + 'r');
          const r = 1.6 + s * 1.2, h = 3.6 + s * 1.8;
          cikti.push(kutle(sekizgen(q, 0.3, 5), 0, 1.4, '#6B5640', 'agac'));
          cikti.push(kutle(sekizgen(q, r, 7), 1.4, h, ZEYTIN[Math.floor(s * 31) % ZEYTIN.length], 'agac'));
          avluAgaci++;
        }
      }
      continue;
    }

    // Doğa: zeytinlik ve orman alanlarında tek tek ağaç
    if (p.katman === 'zemin' && (p.tur === 'zeytinlik' || p.tur === 'orman') && agac < EN_COK_AGAC) {
      const cam = p.tur === 'orman';
      const xs = halka.map(q => q[0]), ys = halka.map(q => q[1]);
      const kx = mBoylam(ys[0]);
      const adimX = AGAC_ARALIK / kx, adimY = AGAC_ARALIK / M_ENLEM;
      for (let y = Math.min(...ys); y <= Math.max(...ys) && agac < EN_COK_AGAC; y += adimY) {
        for (let x = Math.min(...xs); x <= Math.max(...xs) && agac < EN_COK_AGAC; x += adimX) {
          const k = `${id}${x.toFixed(5)}${y.toFixed(5)}`;
          // Sıralı dikilmiş zeytinlik: hafif kaydırma, ara ara boşluk
          if (sans(k + 'b') < 0.18) continue;
          const q: Nokta = [x + (sans(k + 'x') - 0.5) * adimX * 0.5, y + (sans(k + 'y') - 0.5) * adimY * 0.5];
          if (!icinde(q, halka)) continue;
          const s = sans(k + 'r');
          if (cam) {
            const r = 2.2 + s * 1.2, h = 7 + s * 4;
            const renk = CAM[Math.floor(s * 31) % CAM.length];
            cikti.push(kutle(sekizgen(q, r, 6), 0, h * 0.6, renk, 'agac'));
            cikti.push(kutle(sekizgen(q, r * 0.6, 6), h * 0.6, h, renk, 'agac'));
          } else {
            const r = 1.8 + s * 1.3, h = 3.4 + s * 1.6;
            cikti.push(kutle(sekizgen(q, 0.35, 5), 0, 1.1, '#6B5640', 'agac'));
            cikti.push(kutle(sekizgen(q, r, 7), 1.1, h, ZEYTIN[Math.floor(s * 31) % ZEYTIN.length], 'agac'));
          }
          agac++;
        }
      }
    }
  }
  return { type: 'FeatureCollection', features: cikti };
}
