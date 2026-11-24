#!/usr/bin/env node
/**
 * Tek harita: uzak yapılar için az üçgenli model kopyaları (6b, 22 Kasım; Kemal:
 * "uzakta kutu yerine modelin basit hâli, telefon zorlanmasın").
 *
 * Haritadaki her modelin (public/harita/duzada-yapilar.geojson'daki `dosya`ları,
 * `MODEL_ESLEME`deki eklenenler, iskele ve mendirek) iki basit sürümünü üretir ve hepsini tek dosyaya
 * yazar: `public/harita/uzak-modeller.bin`.
 *
 * - Model haritadaki gibi hazırlanır (`modelHazirla.ts` → `hazirla`): aynı ölçü,
 *   aynı taban kutusu; böylece basit sürüm asıl modelin yerine tam oturur.
 * - Her renk kendi parçalarına ayrılır. Büyük parça (duvar, çatı) üçgen azaltmayla
 *   sadeleşir (three'nin SimplifyModifier'ı); çatının biçimi kalır.
 * - Küçük parça (pencere, kapı, kepenk) dış yüzündeki tek dörtgene iner: pencere
 *   sırası uzaktan görünür ama 12 yerine 2 üçgen tutar.
 * - Çok küçük süs (saksı, kulp, korkuluk çubuğu) atılır.
 * - 1. sürüm normal mod, 2. sürüm hafif mod (daha az: küçük parçalar daha erken atılır).
 *
 * Dosya: gzip içinde "DZM1", başlık uzunluğu (uint32), JSON başlık, int16 konumlar
 * (santim). Başlık: { modeller: { dosya: { cx, cz, w, d, seviyeler: [[{ renk, cift, bas, adet }]] } } }
 * (`bas`, `adet`: köşe sırası; her üç köşe bir üçgen).
 *
 * - Kendi kıyısıyla gelen model (The Imperial, 25 Kasım; `modelEsleme.ts` → `KENDI_KIYILI`) haritadaki gibi
 *   kayalığı, kum cebi ve iskelesiyle hazırlanır (yalnız kendi denizi atılır).
 *
 * Kayda yazmaz; yalnız depodaki dosyayı yazar.
 * Kullanım:  npx tsx scripts/uzakModelleriUret.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hazirla } from '../src/components/harita/modelHazirla.ts';
import { MODEL_ESLEME, KENDI_KIYILI } from '../src/components/harita/tek/modelEsleme.ts';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = join(KOK, 'public', 'harita', 'uzak-modeller.bin');

/**
 * Seviyeler (ölçüler metre, DENEME). Parçalar büyükten küçüğe sıralanır (en geniş
 * yüzü) ve üçgen bütçesi dolana kadar eklenir: önce duvar ve çatı, sonra pencere
 * sıraları. `at` altındaki parça hiç girmez. Bütçe 100 m²'lik tabana göredir;
 * büyük yapıda tabanın kareköküyle büyür.
 * 0: normal mod, 1: hafif mod ve çok uzak.
 */
const SEVIYELER = [
  { at: 0.7, butce: 320, oran: 0.12 },
  { at: 1.0, butce: 130, oran: 0.06 }
];

const yukleyici = new GLTFLoader();
yukleyici.setMeshoptDecoder(MeshoptDecoder);
const sade = new SimplifyModifier();

async function modelOku(dosya) {
  const b = readFileSync(join(KOK, 'public', 'modeller', dosya));
  return yukleyici.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}

/** Düz (indekssiz) geometriyi bitişik parçalarına ayırır (aynı köşeyi paylaşan üçgenler) */
function parcalara(geo) {
  const p = geo.getAttribute('position');
  const n = p.count / 3;
  const anahtar = i => `${Math.round(p.getX(i) * 200)},${Math.round(p.getY(i) * 200)},${Math.round(p.getZ(i) * 200)}`;
  const ata = Array.from({ length: n }, (_, i) => i);
  const bul = i => { while (ata[i] !== i) { ata[i] = ata[ata[i]]; i = ata[i]; } return i; };
  const ilk = new Map();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const a = anahtar(t * 3 + k);
    const o = ilk.get(a);
    if (o === undefined) ilk.set(a, t); else { const x = bul(o), y = bul(t); if (x !== y) ata[x] = y; }
  }
  const gruplar = new Map();
  for (let t = 0; t < n; t++) { const r = bul(t); const l = gruplar.get(r) ?? []; l.push(t); gruplar.set(r, l); }
  return [...gruplar.values()].map(ucgenler => {
    const a = new Float32Array(ucgenler.length * 9);
    ucgenler.forEach((t, s) => { for (let k = 0; k < 9; k++) a[s * 9 + k] = p.array[t * 9 + k]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.computeBoundingBox();
    return g;
  });
}

/** Kutu (eksenlere hizalı, alt yüz yok: 10 üçgen) */
function kutuUcgenleri(k) {
  const { min: a, max: b } = k;
  const v = [[a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, b.y, a.z], [a.x, b.y, a.z], [a.x, a.y, b.z], [b.x, a.y, b.z], [b.x, b.y, b.z], [a.x, b.y, b.z]];
  // Dışa bakan yüzler (saat yönünün tersi)
  const yuz = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [3, 7, 6, 2]];
  const c = [];
  for (const [p, q, r, s] of yuz) c.push(...v[p], ...v[q], ...v[r], ...v[p], ...v[r], ...v[s]);
  return c;
}

/** Küçük ince parça: kutusunun modelin dışına bakan yüzünde tek dörtgen */
function dortgen(kutu, merkez) {
  const o = kutu.getSize(new THREE.Vector3());
  const c = kutu.getCenter(new THREE.Vector3());
  // İnce ekseni bul (yatay eksenlerden); dikey ince parça (pervaz, eşik) üstten dörtgen
  const eksen = o.y < Math.min(o.x, o.z) * 0.5 ? 'y' : o.x < o.z ? 'x' : 'z';
  const k = [];
  const { min: a, max: b } = kutu;
  if (eksen === 'x') {
    const x = c.x >= merkez.x ? b.x : a.x, s = c.x >= merkez.x ? 1 : -1;
    k.push([x, a.y, a.z], [x, a.y, b.z], [x, b.y, b.z], [x, b.y, a.z]);
    if (s > 0) k.reverse();
  } else if (eksen === 'z') {
    const z = c.z >= merkez.z ? b.z : a.z, s = c.z >= merkez.z ? 1 : -1;
    k.push([a.x, a.y, z], [b.x, a.y, z], [b.x, b.y, z], [a.x, b.y, z]);
    if (s < 0) k.reverse();
  } else {
    k.push([a.x, b.y, a.z], [a.x, b.y, b.z], [b.x, b.y, b.z], [b.x, b.y, a.z]);
  }
  return [k[0], k[1], k[2], k[0], k[2], k[3]].flat();
}

/**
 * Aynı renkte, aynı düzlemde yan yana dizilmiş ince parçalar (iskele tahtası, döşeme,
 * duvar taşı) tek dörtgende birleşir: birlikte kapladıkları alan çerçevelerinin en az
 * yarısıysa. Tek tek küçük kalıp atılmasınlar, tek parça yüzey olarak kalsınlar.
 */
function kumele(parcalar) {
  const eksen = k => { const o = k.getSize(new THREE.Vector3()); return o.y <= Math.min(o.x, o.z) ? 'y' : o.x <= o.z ? 'x' : 'z'; };
  const adaylar = parcalar.filter(x => x.ince && x.g.getAttribute('position').count <= 36);
  const ata = adaylar.map((_, i) => i);
  const bul = i => { while (ata[i] !== i) { ata[i] = ata[ata[i]]; i = ata[i]; } return i; };
  const anahtar = adaylar.map(x => { const e = eksen(x.kutu); const c = x.kutu.getCenter(new THREE.Vector3()); return `${e}${Math.round(c[e] / 0.15)}`; });
  for (let i = 0; i < adaylar.length; i++) for (let j = i + 1; j < adaylar.length; j++) {
    if (anahtar[i] !== anahtar[j]) continue;
    if (adaylar[i].kutu.clone().expandByScalar(0.3).intersectsBox(adaylar[j].kutu)) { const a = bul(i), b = bul(j); if (a !== b) ata[a] = b; }
  }
  const kumeler = new Map();
  adaylar.forEach((x, i) => { const r = bul(i); const l = kumeler.get(r) ?? []; l.push(x); kumeler.set(r, l); });
  const cikan = new Set(), yeni = [];
  for (const l of kumeler.values()) {
    if (l.length < 3) continue;
    const kutu = new THREE.Box3();
    for (const x of l) kutu.union(x.kutu);
    const o = kutu.getSize(new THREE.Vector3());
    const sirali = [o.x, o.y, o.z].sort((a, b) => b - a);
    const alan = sirali[0] * sirali[1];
    if (l.reduce((t, x) => t + x.alan, 0) < 0.5 * alan) continue;
    for (const x of l) cikan.add(x);
    yeni.push({ g: null, kutu, buyuk: sirali[0], ince: true, alan });
  }
  for (const x of cikan) x.g.dispose();
  return [...parcalar.filter(x => !cikan.has(x)), ...yeni];
}

/** Büyük parça: üçgen azaltma (biçim kalır); azaltılamazsa olduğu gibi */
function azalt(geo, oran, enAz) {
  const n = geo.getAttribute('position').count / 3;
  if (n <= enAz) return Array.from(geo.getAttribute('position').array);
  const birlesik = mergeVertices(geo.clone(), 0.005);
  const kose = birlesik.getAttribute('position').count;
  const hedef = Math.max(enAz, Math.round(n * oran));
  // SimplifyModifier köşe sayısıyla çalışır: kaba oranla
  const sil = Math.max(0, Math.min(kose - 4, Math.round(kose * (1 - hedef / n))));
  let sonuc = birlesik;
  try { sonuc = sade.modify(birlesik, sil); } catch { sonuc = birlesik; }
  const duz = sonuc.index ? sonuc.toNonIndexed() : sonuc;
  const p = duz.getAttribute('position');
  // Bozuk (sıfır alanlı) üçgenler atılır
  const cikti = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  for (let t = 0; t < p.count / 3; t++) {
    v0.fromBufferAttribute(p, t * 3); v1.fromBufferAttribute(p, t * 3 + 1); v2.fromBufferAttribute(p, t * 3 + 2);
    if (v1.clone().sub(v0).cross(v2.clone().sub(v0)).lengthSq() < 1e-8) continue;
    cikti.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
  }
  // Azaltma parçayı fazla bozduysa (yarıdan çok kaybolduysa) asıl hâl
  return cikti.length / 9 >= Math.min(4, n) ? cikti : Array.from(geo.getAttribute('position').array);
}

async function main() {
  const yapilar = JSON.parse(readFileSync(join(KOK, 'public', 'harita', 'duzada-yapilar.geojson'), 'utf8'));
  const dosyalar = new Set();
  for (const f of yapilar.features) if (f.properties.katman === 'yapi' && f.properties.dosya) dosyalar.add(f.properties.dosya);
  for (const d of Object.values(MODEL_ESLEME)) dosyalar.add(d);
  // İskele ve mendirek (limanModelleri.ts)
  dosyalar.add('deniz/ahsap-iskele-duz.glb');
  dosyalar.add('deniz/mendirek-duz.glb');
  const sirali = [...dosyalar].sort();

  const baslik = { modeller: {} };
  const konumlar = [];
  let kose = 0;
  const rapor = [];
  for (const dosya of sirali) {
    const g = await modelOku(dosya);
    const m = hazirla(g.scene, KENDI_KIYILI[dosya]);
    const merkez = new THREE.Vector3(m.cx, 0, m.cz);
    const kayit = { cx: +m.cx.toFixed(3), cz: +m.cz.toFixed(3), w: +m.w.toFixed(3), d: +m.d.toFixed(3), seviyeler: [] };
    const satir = [dosya, m.ucgen];
    // Parçalar bir kez ayrılır (iki seviye de kullanır)
    const renkler = m.parcalar.map(p => ({
      renk: p.mat.color.getHexString(), cift: p.mat.side === THREE.DoubleSide,
      parcalar: kumele(parcalara(p.geo).map(g => {
        const olcu = g.boundingBox.getSize(new THREE.Vector3());
        const sirali = [olcu.x, olcu.y, olcu.z].sort((x, y) => y - x);
        return { g, kutu: g.boundingBox, buyuk: sirali[0], ince: sirali[2] < 0.3 * sirali[0], alan: sirali[0] * sirali[1] };
      }))
    }));
    // İçi görünmeyen parça (dolu bir kutunun içinde kalan) hiç girmez
    const hepsi = renkler.flatMap(r => r.parcalar);
    const dolular = hepsi.filter(x => x.g && x.g.getAttribute('position').count <= 36 && !x.ince);
    const icte = new Set(hepsi.filter(x => dolular.some(d => d !== x && d.kutu.clone().expandByScalar(0.01).containsBox(x.kutu))));
    const olcek = Math.max(1, Math.sqrt((m.w * m.d) / 100));
    for (const s of SEVIYELER) {
      // Büyükten küçüğe, bütçe dolana kadar
      const secilen = new Map();
      let kalan = Math.round(s.butce * olcek);
      for (const x of [...hepsi].filter(x => x.buyuk >= s.at && !icte.has(x)).sort((p, q) => q.alan - p.alan)) {
        let l;
        if (!x.g) l = dortgen(x.kutu, merkez);
        else if (x.g.getAttribute('position').count / 3 > 12) l = x.ince && x.buyuk < 3 ? dortgen(x.kutu, merkez) : azalt(x.g, s.oran, 12);
        else l = x.ince && x.buyuk < 3 ? dortgen(x.kutu, merkez) : Array.from(x.g.getAttribute('position').array);
        const u = l.length / 9;
        if (u > kalan) continue;
        kalan -= u;
        secilen.set(x, l);
      }
      const parcalar = [];
      for (const r of renkler) {
        const kose0 = kose;
        for (const x of r.parcalar) {
          const l = secilen.get(x);
          if (!l) continue;
          for (const v of l) konumlar.push(Math.round(v * 100));
          kose += l.length / 3;
        }
        if (kose > kose0) parcalar.push({ renk: r.renk, cift: r.cift, bas: kose0, adet: kose - kose0 });
      }
      kayit.seviyeler.push(parcalar);
      satir.push(parcalar.reduce((t, x) => t + x.adet / 3, 0));
    }
    for (const r of renkler) for (const x of r.parcalar) x.g?.dispose();
    for (const p of m.parcalar) { p.geo.dispose(); p.mat.dispose(); }
    baslik.modeller[dosya] = kayit;
    rapor.push(satir);
  }
  for (const v of konumlar) if (v < -32768 || v > 32767) throw new Error('konum int16 sınırının dışında');
  const json = new TextEncoder().encode(JSON.stringify(baslik));
  const bas = 8 + json.length;
  const hiza = bas % 2;
  const tampon = Buffer.alloc(bas + hiza + konumlar.length * 2);
  tampon.write('DZM1', 0, 'latin1');
  tampon.writeUInt32LE(json.length + hiza, 4);
  Buffer.from(json).copy(tampon, 8);
  if (hiza) tampon.write(' ', 8 + json.length, 'latin1');
  const veri = new Int16Array(konumlar);
  Buffer.from(veri.buffer).copy(tampon, bas + hiza);
  const gz = gzipSync(tampon, { level: 9 });
  writeFileSync(CIKTI, gz);
  console.log('model\tasil\tnormal\thafif');
  for (const r of rapor) console.log(r.join('\t'));
  console.log(`${sirali.length} model · ${(gz.length / 1024).toFixed(1)} KB (gzip) → ${CIKTI}`);
}

main().catch(e => { console.error(e); process.exit(1); });
