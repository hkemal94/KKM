import * as THREE from 'three';
import { cizilenRakim, type Yapi, type Zemin } from './tekVeri';

/**
 * Taş kaide (25 Kasım, Kemal: "düz kahverengi kaide yerine taş dokulu, zemin rengine karışan kaide").
 * Eskiden yapının altında düz, tek renk (kahverengi) bir kutu vardı; Deniz Feneri (~11 m), Yağ Fabrikası
 * (6,6 m), Sade Meyhane (5,4 m), Eski Kilise (5,3 m) gibi yüksek kaidelerde kumsalda ve çayırda blok gibi
 * okunuyordu. Yeni kaide bütün kaideli yapılarda aynı kuralla çizilir:
 * - Yamaca oturur: dört duvarın alt kenarı düz değil, her noktada çizilen zeminin biraz altına iner.
 * - Şevli: duvar aşağı indikçe dışa açılır (eski taş istinat duvarı gibi; `SEV`, en çok `SEV_EN_COK`).
 * - Taş sıralı: duvar `SIRA` m'lik sıralara, sıralar `TAS` m'lik taşlara bölünür; alt alta sıralar
 *   şaşırtmalı, her taşın tonu biraz farklı (kimlikten, her açılışta aynı).
 * - Zemine karışır: duvarın zemine yakın kısmı (yüksekliğin `KARISMA_ORANI`'ı, `KARISMA` m aralığında) altındaki
 *   zeminin rengine geçer (kumsalda kum,
 *   çayırda yeşil). Renk zemin katından okunur (`zeminRengi`), ağaç katı zemini boyayınca yeniden okunur.
 * Bütün kaideler tek çizimde (tek geometri). Ölçüler DENEME. Kayda hiçbir şey yazılmaz.
 */

/** Sıra yüksekliği (m, DENEME) */
const SIRA = 0.7;
/** Taş eni (m, DENEME) */
const TAS = 1.5;
/** Bu yükseklikten (m) alçak duvarda taşlar üç kat geniş (DENEME) */
const ALCAK = 1.5;
/** Şev: her 1 m inişte duvar bu kadar (m) dışa açılır (DENEME) */
const SEV = 0.12;
const SEV_EN_COK = 0.9;
/** Duvarın zemine yakın bu kadarı (m) zemin rengine geçer (DENEME) */
const KARISMA = [1.0, 3.5];
const KARISMA_ORANI = 0.3;
/** Alt kenar zeminin bu kadar (m) altına iner (zemin çizimi kaba karelerde biraz farklı) */
const GOMME = 0.4;
/** Taşın ana rengi ve ton aralığı: kireçtaşı, zemin taşlığına yakın (DENEME) */
const TAS_RENGI = new THREE.Color('#C4B79F');
const TAS_KOYU = new THREE.Color('#8C7F6A');

export type ZeminRengi = (x: number, z: number, c: THREE.Color) => void;

export interface KaideGirdisi { yapi: Yapi; en: number; boy: number; ust: number }

/** Kimlikten tekrar üretilebilir 0–1 sayı (taş tonu) */
function sayi(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Kaidelerin geometrisi: köşe renkli, düz gölgeli. `karisim` her köşenin zemin rengine geçme oranı,
 * `tasRenk` taşın kendi rengi; `boya` ikisini zemin rengiyle birleştirir.
 */
export class KaideGeometrisi {
  geo = new THREE.BufferGeometry();
  ucgen = 0;
  private karisim: Float32Array;
  private tasRenk: Float32Array;

  constructor(z: Zemin, girdiler: KaideGirdisi[]) {
    const kon: number[] = [], kar: number[] = [], tas: number[] = [];
    const c = new THREE.Color();
    const sev = (d: number) => Math.min(SEV_EN_COK, Math.max(0, d) * SEV);
    girdiler.forEach((g, gi) => {
      const { yapi: y, ust } = g;
      const hx = g.en / 2, hz = g.boy / 2;
      const [ex, ez] = y.ex;
      // Yerel (s: ön cephe yönü, t: derinlik) → sahne
      const sahne = (s: number, t: number): [number, number] => [y.merkez[0] + s * ex - t * ez, y.merkez[1] + s * ez + t * ex];
      // Dört duvar: köşe a'dan b'ye, dış yön n (yerel)
      const duvarlar: Array<{ a: [number, number]; b: [number, number]; n: [number, number] }> = [
        { a: [-hx, hz], b: [hx, hz], n: [0, 1] }, { a: [hx, hz], b: [hx, -hz], n: [1, 0] },
        { a: [hx, -hz], b: [-hx, -hz], n: [0, -1] }, { a: [-hx, -hz], b: [-hx, hz], n: [-1, 0] }
      ];
      duvarlar.forEach((d, di) => {
        const uzun = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
        const yon: [number, number] = [(d.b[0] - d.a[0]) / uzun, (d.b[1] - d.a[1]) / uzun];
        // Duvar üzerindeki nokta: u (0–1, a'dan b'ye), y yüksekliği; şev dışa ve yanlara (köşeler birleşir)
        const nokta = (u: number, yy: number): [number, number, number] => {
          const o = sev(ust - yy);
          const s = d.a[0] - yon[0] * o + (uzun + 2 * o) * u * yon[0] + d.n[0] * o;
          const t = d.a[1] - yon[1] * o + (uzun + 2 * o) * u * yon[1] + d.n[1] * o;
          const [x, zz] = sahne(s, t);
          return [x, yy, zz];
        };
        // u'daki alt kenar: oradaki zeminin GOMME altı (şevli yerdeki zemin bir kez daha okunur)
        const altY = (u: number): number => {
          const p0 = nokta(u, ust);
          let a = cizilenRakim(z, p0[0], p0[2]) - GOMME;
          const p1 = nokta(u, Math.min(ust, a));
          a = cizilenRakim(z, p1[0], p1[2]) - GOMME;
          return Math.min(ust - 0.05, a);
        };
        const yerde = (x: number, yy: number, zz: number) => cizilenRakim(z, x, zz) - yy;
        // Alçak kaidede (çoğu 1 m'nin altında) taşlar geniş: az üçgen, uzaktan zaten seçilmez
        const yukseklik = ust - Math.min(cizilenRakim(z, ...sahne(d.a[0], d.a[1])), cizilenRakim(z, ...sahne(d.b[0], d.b[1])));
        const sutun = Math.max(1, Math.round(uzun / (yukseklik < ALCAK ? TAS * 3 : TAS)));
        const altlar: number[] = [];
        for (let k = 0; k <= sutun * 2; k++) altlar.push(altY(k / (sutun * 2)));
        const enAlt = Math.min(...altlar);
        const sira = Math.max(1, Math.ceil((ust - enAlt) / SIRA));
        const karisma = THREE.MathUtils.clamp((ust - enAlt) * KARISMA_ORANI, KARISMA[0], KARISMA[1]);
        for (let r = 0; r < sira; r++) {
          const ustY = ust - r * SIRA, altSira = ust - (r + 1) * SIRA;
          // Şaşırtma: tek sıralarda taşlar yarım kayar (kenarda yarım taş)
          const kay = r % 2 ? 0.5 : 0;
          const sinirlar: number[] = [0];
          for (let k = 1; k <= sutun; k++) { const u = (k - kay) / sutun; if (u > 0 && u < 1) sinirlar.push(u); }
          sinirlar.push(1);
          for (let k = 0; k + 1 < sinirlar.length; k++) {
            const u0 = sinirlar[k], u1 = sinirlar[k + 1];
            // u'daki alt kenar: yarım adımlık örnekten ara değer
            const alt = (u: number) => { const f = u * sutun * 2, i = Math.min(sutun * 2 - 1, Math.floor(f)); return altlar[i] + (altlar[i + 1] - altlar[i]) * (f - i); };
            const a0 = alt(u0), a1 = alt(u1);
            if (ustY <= a0 && ustY <= a1) continue;
            const b0 = Math.max(altSira, a0), b1 = Math.max(altSira, a1);
            const t0 = Math.max(ustY, b0), t1 = Math.max(ustY, b1);
            const p = [nokta(u0, b0), nokta(u1, b1), nokta(u1, t1), nokta(u0, t0)];
            // Taşın tonu
            const ton = sayi(gi, di * 97 + r, k);
            c.copy(TAS_RENGI).lerp(TAS_KOYU, 0.15 + ton * 0.7 + (r % 2) * 0.12);
            if (r === 0) c.copy(TAS_RENGI);
            for (const i of [0, 1, 2, 0, 2, 3]) {
              const q = p[i];
              kon.push(q[0], q[1], q[2]);
              tas.push(c.r, c.g, c.b);
              // Zemine yakınlık: zeminin üstündeki yüksekliğe göre zemin rengine geçer
              const h = -yerde(q[0], q[1], q[2]);
              kar.push(1 - THREE.MathUtils.smoothstep(h, 0, karisma));
            }
            this.ucgen += 2;
          }
        }
      });
    });
    this.karisim = new Float32Array(kar);
    this.tasRenk = new Float32Array(tas);
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(kon, 3));
    this.geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(tas.length), 3));
    this.geo.computeBoundingSphere();
  }

  /** Köşe renkleri: taş rengi, zemine yakın köşelerde zeminin rengine geçer */
  boya(zeminRengi: ZeminRengi | null) {
    const kon = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const renk = this.geo.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < kon.count; i++) {
      const k = this.karisim[i];
      let r = this.tasRenk[i * 3], g = this.tasRenk[i * 3 + 1], b = this.tasRenk[i * 3 + 2];
      if (zeminRengi && k > 0) {
        zeminRengi(kon.getX(i), kon.getZ(i), c);
        r += (c.r - r) * k; g += (c.g - g) * k; b += (c.b - b) * k;
      }
      renk.setXYZ(i, r, g, b);
    }
    renk.needsUpdate = true;
  }
}
