import * as THREE from 'three';
import { modelYukle } from '../../../lib/modelYukle';
import { hazirla, type HaritaModeli } from '../modelHazirla';
import { haritaAdresi, indirme, rakim, type Zemin } from './tekVeri';
import type { ZeminKatmani } from './zeminKatmani';

/**
 * Tek harita ağaçları (22 Kasım, Kemal: "ağaçlar arazi türüne göre otomatik gelsin").
 * Veri `public/harita/duzada-agaclar.bin` (gen/kompakt_agaclar.py üretir; taslak,
 * ölçüler DENEME): arazi türü ızgarası, ~600 bin ağaç, bağ sıra çizgileri.
 *
 * - Yakında ağaç KKM'nin kendi bitki modeliyle (`public/modeller/bitkiler/`).
 * - Ortada basit öbek (4 üçgenlik piramit, türün rengi).
 * - Uzakta ağaç çizilmez; arazi türü yalnız zeminin rengine karışır.
 * - Bağ sıraları zeminde ince şerit.
 * - Hafif mod (telefon): dar çevre; sahnenin toplamı ~400 bin üçgende kalsın diye
 *   ağaçlara kalan pay öbür katların üçgeninden hesaplanır (Kemal, 22 Kasım).
 * - Avlu ağaçları ayrı grupta: 7. adımda arsaya hazır grup konunca o arsadaki avlu
 *   ağaçları çizilmeyecek, grubun ağacı geçerli (Kemal, 22 Kasım).
 * Kayda hiçbir şey yazılmaz.
 */

export interface AgacTuru { id: string; ad: string; model: string; boyM: number }
export interface AgacBasligi {
  en: number; boy: number; hucre: number; x0: number; y0: number; birim: number;
  turler: AgacTuru[]; gruplar: string[]; arazi: { id: string; ad: string; renk: string }[];
  karoM: number; karoX0: number; karoY0: number; karolar: [number, number, number, number][];
  adet: number; siraAdet: number;
}
export interface AgacVerisi {
  b: AgacBasligi;
  /** Arazi türü (zemin ızgarasıyla aynı hücreler) */
  arazi: Uint8Array;
  x: Uint16Array; y: Uint16Array; tur: Uint8Array; olcek: Uint8Array; grup: Uint8Array;
  sira: [Uint16Array, Uint16Array, Uint16Array, Uint16Array];
}

/** Ağaç dosyası: gzip içinde "DZA1", başlık, arazi ızgarası, bayt düzlemleri (gen/kompakt_agaclar.py) */
export async function agaclariOku(sinyal?: AbortSignal): Promise<AgacVerisi> {
  const y = await fetch(haritaAdresi('duzada-agaclar.bin'), { signal: sinyal });
  if (!y.ok) throw new Error(`duzada-agaclar.bin: ${y.status}`);
  const ham = await y.arrayBuffer();
  indirme.bayt += ham.byteLength;
  indirme.dosyalar['duzada-agaclar.bin'] = ham.byteLength;
  const v = new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if (String.fromCharCode(v[0], v[1], v[2], v[3]) !== 'DZA1') throw new Error('ağaç dosyası tanınmadı');
  const n = new DataView(v.buffer).getUint32(4, true);
  const b = JSON.parse(new TextDecoder().decode(v.subarray(8, 8 + n))) as AgacBasligi;
  let o = 8 + n;
  const arazi = v.slice(o, o + b.en * b.boy); o += b.en * b.boy;
  const u16 = (adet: number) => {
    const a = new Uint16Array(adet);
    for (let i = 0; i < adet; i++) a[i] = (v[o + i] << 8) | v[o + adet + i];
    o += 2 * adet;
    return a;
  };
  const u8 = (adet: number) => { const a = v.slice(o, o + adet); o += adet; return a; };
  const N = b.adet, M = b.siraAdet;
  const x = u16(N), yy = u16(N), tur = u8(N), olcek = u8(N), grup = u8(N);
  const sira: AgacVerisi['sira'] = [u16(M), u16(M), u16(M), u16(M)];
  return { b, arazi, x, y: yy, tur, olcek, grup, sira };
}

/** Zemine karışan arazi türleri ve oranı */
const BOYANAN = new Set(['cam', 'maki', 'zeytinlik', 'bag', 'tarla', 'kayalik']);
const KARISIM = 0.5;

/** Uzaktan görünen öbeğin rengi (türe göre; model inince modelin yaprak rengi geçer) */
const OBEK_RENGI: Record<string, string> = {
  zeytin: '#8A9A5B', fistik: '#2F5A3A', maki: '#6E8B4E', servi: '#24452E', cinar: '#4E7A3A',
  incir: '#5F8F3E', limon: '#7E9A3C', zakkum: '#6F8F4F'
};
/** Öbeğin biçimi (ölçek 1'de): taç genişliği (m), tacın altı ve boyu (ağacın boyuna oran) */
const OBEK: Record<string, { en: number; alt: number; boy: number }> = {
  fistik: { en: 8, alt: 0.45, boy: 0.55 }, servi: { en: 2.4, alt: 0.05, boy: 0.95 }, maki: { en: 2.2, alt: 0, boy: 1 },
  cinar: { en: 11, alt: 0.3, boy: 0.7 }, zeytin: { en: 4.5, alt: 0.25, boy: 0.75 }, incir: { en: 4.5, alt: 0.2, boy: 0.8 },
  limon: { en: 3, alt: 0.2, boy: 0.8 }, zakkum: { en: 2, alt: 0, boy: 1 }
};

type Ayar = {
  modelYaricap: number; modelEnCok: number; modelKamera: number;
  obekYaricap: number; obekKamera: number; siraYaricap: number;
  sahneToplam: number; agacEnCok: number; agacEnAz: number;
};
// Hepsi DENEME (Kemal onaylamadı)
const NORMAL: Ayar = {
  modelYaricap: 300, modelEnCok: 900, modelKamera: 1200, obekYaricap: 1500, obekKamera: 5000, siraYaricap: 900,
  sahneToplam: 2_000_000, agacEnCok: 1_300_000, agacEnAz: 150_000
};
const HAFIF: Ayar = {
  modelYaricap: 150, modelEnCok: 160, modelKamera: 700, obekYaricap: 600, obekKamera: 2500, siraYaricap: 350,
  sahneToplam: 400_000, agacEnCok: 260_000, agacEnAz: 70_000
};
const OBEK_UCGEN = 8;
/** Ağaçlar yalnız yakından bakınca gölge düşürür (uzakta gölgeli halka öbeklerden ayrı görünmesin) */
const GOLGE_KAMERA = 500;
const SIRA_PARCA = 4; // m; şerit bu aralıkla zemine oturur

const yonu = (x: number, y: number) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 360) * (Math.PI / 180);

export class AgacKatmani {
  grup = new THREE.Group();
  /** Son çizimin ölçüsü */
  ucgen = 0;
  modelli = 0;
  obekli = 0;
  private modeller = new Map<number, HaritaModeli & { olc: number }>();
  private inenler = new Set<number>();
  private ornekler: THREE.InstancedMesh[] = [];
  private obek: THREE.InstancedMesh | null = null;
  private obekGeo = new THREE.OctahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  private obekMat = new THREE.MeshLambertMaterial({ flatShading: true });
  private obekRenk: THREE.Color[];
  private siraMesh: THREE.Mesh | null = null;
  private siraMat = new THREE.MeshLambertMaterial({ color: '#56662E', side: THREE.DoubleSide });
  private kapandi = false;
  private son: Parameters<AgacKatmani['guncelle']> | null = null;
  // geçici diziler (her güncellemede yeniden kurulmasın)
  private aday = new Uint32Array(0);
  private uzak = new Float32Array(0);
  /**
   * Düzenle modu (7. adım): bu hücrelerdeki ağaçlar çizilmez (4 m'lik hücre, `duzenle/birlesik.ts`).
   * `hepsi`: yeni yapı, yol, boyanan kare, grubun alanı; `avlu`: grup konan arsalar (yalnız avlu ağaçları).
   */
  gizli: { hucre: number; hepsi: Set<number>; avlu: Set<number> } | null = null;

  constructor(private z: Zemin, private v: AgacVerisi, private onDegisti: () => void) {
    this.obekRenk = v.b.turler.map(t => new THREE.Color(OBEK_RENGI[t.id] ?? '#6E8B4E'));
    // Modeller küçük (8 tür): hepsi baştan iner, öbek rengi modelin yaprağına uysun
    v.b.turler.forEach((_, t) => this.modelIndir(t));
  }

  /** Arazi türünü zeminin rengine karıştırır (uzaktan bakınca orman, zeytinlik, bağ seçilsin) */
  zemineBoya(zemin: ZeminKatmani) {
    const { arazi, b } = this.v;
    const renkler = b.arazi.map(a => (BOYANAN.has(a.id) ? new THREE.Color(a.renk) : null));
    zemin.renkKaristir((k, r) => {
      const c = renkler[arazi[k]];
      if (!c) return;
      r[k * 3] = r[k * 3] * (1 - KARISIM) + c.r * 255 * KARISIM;
      r[k * 3 + 1] = r[k * 3 + 1] * (1 - KARISIM) + c.g * 255 * KARISIM;
      r[k * 3 + 2] = r[k * 3 + 2] * (1 - KARISIM) + c.b * 255 * KARISIM;
    });
  }

  private modelIndir(t: number) {
    if (this.modeller.has(t) || this.inenler.has(t)) return;
    this.inenler.add(t);
    const tur = this.v.b.turler[t];
    modelYukle(tur.model)
      .then(g => {
        if (this.kapandi) return;
        const m = hazirla(g.scene);
        let yuk = 0;
        for (const p of m.parcalar) { p.geo.computeBoundingBox(); yuk = Math.max(yuk, p.geo.boundingBox!.max.y); }
        this.modeller.set(t, { ...m, olc: tur.boyM / Math.max(0.01, yuk) });
        // Öbeğin rengi: modelin en yeşil, en büyük parçasının rengi (gövde değil yaprak)
        let iyi = -Infinity;
        for (const p of m.parcalar) {
          const c = (p.mat as THREE.MeshLambertMaterial).color;
          if (!c) continue;
          const puan = (c.g - (c.r + c.b) / 2) * Math.log(2 + (p.geo.index?.count ?? 0));
          if (puan > iyi) { iyi = puan; this.obekRenk[t].copy(c); }
        }
        if (this.son) this.guncelle(...this.son);
        this.onDegisti();
      })
      .catch(e => console.warn('[tek harita] ağaç modeli inmedi', tur.model, e))
      .finally(() => this.inenler.delete(t));
  }

  /**
   * Bakılan yere göre ağaçlar. `digerUcgen`: zemin, yol, yapı katlarının üçgeni; ağaçlar
   * sahnenin toplam bütçesinden kalanı kullanır.
   */
  guncelle(hedef: THREE.Vector3, kameraUzakligi: number, hafif: boolean, golge: boolean, digerUcgen: number) {
    if (this.kapandi) return;
    this.son = [hedef, kameraUzakligi, hafif, golge, digerUcgen];
    const a = hafif ? HAFIF : NORMAL;
    const { b, x, y, tur, olcek } = this.v;
    for (const o of this.ornekler) { this.grup.remove(o); o.dispose(); }
    this.ornekler = [];
    this.ucgen = 0; this.modelli = 0; this.obekli = 0;
    if (this.obek) this.obek.count = 0;
    if (this.siraMesh) { this.grup.remove(this.siraMesh); this.siraMesh.geometry.dispose(); this.siraMesh = null; }
    if (kameraUzakligi > a.obekKamera) return;

    // Çevredeki karolardan adaylar (hedefe uzaklığıyla)
    const hx = hedef.x, hk = -hedef.z; // kuzey
    const R = a.obekYaricap, R2 = R * R;
    const ki0 = Math.floor((hx - R - b.karoX0) / b.karoM), ki1 = Math.floor((hx + R - b.karoX0) / b.karoM);
    const kj0 = Math.floor((hk - R - b.karoY0) / b.karoM), kj1 = Math.floor((hk + R - b.karoY0) / b.karoM);
    let n = 0;
    const karolar = b.karolar.filter(([i, j]) => i >= ki0 && i <= ki1 && j >= kj0 && j <= kj1);
    const enCok = karolar.reduce((s, k) => s + k[3], 0);
    if (this.aday.length < enCok) { this.aday = new Uint32Array(enCok); this.uzak = new Float32Array(enCok); }
    const gz = this.gizli && (this.gizli.hepsi.size || this.gizli.avlu.size) ? this.gizli : null;
    const avluNo = b.gruplar.indexOf('avlu');
    const grupNo = this.v.grup;
    for (const [, , bas, adet] of karolar) {
      for (let i = bas; i < bas + adet; i++) {
        const dx = b.x0 + x[i] * b.birim - hx, dy = b.y0 + y[i] * b.birim - hk;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R2) continue;
        if (gz) {
          // anahtar duzenle/geometri.ts → hucreAnahtari ile aynı (x doğu, z güney)
          const k = Math.floor((b.x0 + x[i] * b.birim) / gz.hucre) * 100003 + Math.floor(-(b.y0 + y[i] * b.birim) / gz.hucre);
          if (gz.hepsi.has(k) || (grupNo[i] === avluNo && gz.avlu.has(k))) continue;
        }
        this.aday[n] = i; this.uzak[n] = d2; n++;
      }
    }
    const sira = Array.from(this.aday.subarray(0, n).keys());
    const uz = this.uzak;
    sira.sort((p, q) => uz[p] - uz[q]);

    // Bütçe: sahnenin toplamından öbür katların payı düşülür
    let butce = Math.max(a.agacEnAz, Math.min(a.agacEnCok, a.sahneToplam - digerUcgen));
    const modelAcik = kameraUzakligi < a.modelKamera;
    const M2 = a.modelYaricap * a.modelYaricap;
    const modelListe = new Map<number, number[]>();
    const obekListe: number[] = [];
    for (const s of sira) {
      const i = this.aday[s];
      const t = tur[i];
      if (modelAcik && uz[s] < M2 && this.modelli < a.modelEnCok) {
        const m = this.modeller.get(t);
        if (!m) this.modelIndir(t);
        else if (butce >= m.ucgen) {
          let l = modelListe.get(t);
          if (!l) { l = []; modelListe.set(t, l); }
          l.push(i);
          butce -= m.ucgen; this.ucgen += m.ucgen; this.modelli++;
          continue;
        }
      }
      if (butce < OBEK_UCGEN) break;
      obekListe.push(i);
      butce -= OBEK_UCGEN; this.ucgen += OBEK_UCGEN;
    }

    // Modeller
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s3 = new THREE.Vector3(), yukari = new THREE.Vector3(0, 1, 0);
    for (const [t, l] of modelListe) {
      const m = this.modeller.get(t)!;
      const mat = l.map(i => {
        const px = b.x0 + x[i] * b.birim, pz = -(b.y0 + y[i] * b.birim);
        const s = m.olc * olcek[i] * 0.05;
        q.setFromAxisAngle(yukari, yonu(x[i], y[i]));
        return m4.compose(p.set(px - m.cx * s, rakim(this.z, px, pz) - 0.2, pz - m.cz * s), q, s3.set(s, s, s)).clone();
      });
      for (const pr of m.parcalar) {
        const o = new THREE.InstancedMesh(pr.geo, pr.mat, mat.length);
        mat.forEach((x2, k) => o.setMatrixAt(k, x2));
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingSphere();
        o.castShadow = golge && kameraUzakligi < GOLGE_KAMERA;
        this.grup.add(o);
        this.ornekler.push(o);
      }
    }
    // Öbekler (tek çizim)
    if (obekListe.length) {
      if (!this.obek || this.obek.instanceMatrix.count < obekListe.length) {
        if (this.obek) { this.grup.remove(this.obek); this.obek.dispose(); }
        this.obek = new THREE.InstancedMesh(this.obekGeo, this.obekMat, Math.ceil(obekListe.length * 1.3));
        this.obek.frustumCulled = false;
        this.grup.add(this.obek);
      }
      const o = this.obek;
      q.identity();
      obekListe.forEach((i, k) => {
        const t = b.turler[tur[i]];
        const px = b.x0 + x[i] * b.birim, pz = -(b.y0 + y[i] * b.birim);
        const s = olcek[i] * 0.05, ob = OBEK[t.id] ?? { en: 4, alt: 0, boy: 1 }, en = ob.en * s;
        q.setFromAxisAngle(yukari, yonu(x[i], y[i]));
        o.setMatrixAt(k, m4.compose(p.set(px, rakim(this.z, px, pz) - 0.3 + ob.alt * t.boyM * s, pz), q, s3.set(en, ob.boy * t.boyM * s, en)));
        o.setColorAt(k, this.obekRenk[tur[i]]);
      });
      o.count = obekListe.length;
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
      this.obekli = obekListe.length;
    }

    // Bağ sıraları: zeminde ince şerit (yakında)
    if (modelAcik) this.siralar(hx, hk, a.siraYaricap);
  }

  private siralar(hx: number, hk: number, R: number) {
    const { b, sira: [a1, a2, a3, a4] } = this.v;
    const p: number[] = [];
    for (let i = 0; i < a1.length; i++) {
      const ax = b.x0 + a1[i] * b.birim, ak = b.y0 + a2[i] * b.birim, bx = b.x0 + a3[i] * b.birim, bk = b.y0 + a4[i] * b.birim;
      if (Math.hypot((ax + bx) / 2 - hx, (ak + bk) / 2 - hk) > R) continue;
      const az = -ak, bz = -bk;
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const adim = Math.max(1, Math.ceil(L / SIRA_PARCA));
      const nx = (-(bz - az) / L) * 0.55, nz = ((bx - ax) / L) * 0.55;
      for (let k = 0; k < adim; k++) {
        const u0 = k / adim, u1 = (k + 1) / adim;
        const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
        const y0 = rakim(this.z, x0, z0) + 0.3, y1 = rakim(this.z, x1, z1) + 0.3;
        p.push(x0 - nx, y0, z0 - nz, x0 + nx, y0, z0 + nz, x1 + nx, y1, z1 + nz,
          x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
      }
    }
    if (!p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    this.siraMesh = new THREE.Mesh(g, this.siraMat);
    this.siraMesh.receiveShadow = true;
    this.grup.add(this.siraMesh);
    this.ucgen += p.length / 9;
  }

  dispose() {
    this.kapandi = true;
    for (const o of this.ornekler) o.dispose();
    this.obek?.dispose();
    this.siraMesh?.geometry.dispose();
    this.obekGeo.dispose(); this.obekMat.dispose(); this.siraMat.dispose();
  }
}
