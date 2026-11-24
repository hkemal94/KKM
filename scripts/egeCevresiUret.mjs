#!/usr/bin/env node
/**
 * Tek harita: adanın Ege'deki yeri (24 Kasım; Kemal: "Ege'deki konum geri gelsin").
 *
 * Eski haritanın çevresi (8 Ekim, H-b: komşu kıyılar, kumsal şeridi, sığlık bantları,
 * gerçek yer adları) `src/data/cevreCografyasi.ts`'teydi; 23 Kasım'da eski haritanın
 * koduyla silindi (819bda2). Bu betik o dosyayı git geçmişinden okur ve tek haritanın
 * indireceği `public/harita/ege-cevresi.json`'u yazar. Yeni çizim yok, kıyılar aynı.
 *
 * Kaynak: Natural Earth 1:10m Land (kamu malı, naturalearthdata.com), eski `gen/cevre.py`
 * ile sadeleşmiş hâli. Yer adları gerçek coğrafya (ad koyma değil). Küçükkuyu Limanı'nın
 * yeri eski haritanın `atmosfer.ts` → `KUCUKKUYU` değeri (künyede "feribotun anakara ucu").
 *
 * Alınanlar: kara (komşu karalar), kiyi (içeri 350 m kumsal şeridi), sig (kıyıdan açığa
 * üç bant; gerçek derinlik değil, kıyıya uzaklık), etiket. Alınmayan: deniz (dalga dokusu;
 * içinde eski büyük adanın deliği vardı) ve feribot hattı (eski Liman'dan çıkıyordu).
 *
 *   git show 819bda2^:src/data/cevreCografyasi.ts > /tmp/eski-cevre.ts
 *   node scripts/egeCevresiUret.mjs /tmp/eski-cevre.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const yol = process.argv[2];
if (!yol) throw new Error('Kullanım: node scripts/egeCevresiUret.mjs <eski cevreCografyasi.ts>');
const metin = readFileSync(yol, 'utf8');
const ham = metin.match(/JSON\.parse\(("(?:[^"\\]|\\.)*")\);/s);
if (!ham) throw new Error('Eski dosyada veri bulunamadı');
const eski = JSON.parse(JSON.parse(ham[1]));

const ALINAN = new Set(['kara', 'kiyi', 'sig', 'etiket']);
const ozellikler = eski.features.filter(f => ALINAN.has(f.properties?.katman));
// Küçükkuyu Limanı: eski haritada ayrı bir yazıydı (atmosfer.ts → KUCUKKUYU)
ozellikler.push({ type: 'Feature', properties: { katman: 'etiket', ad: 'Küçükkuyu Limanı', tur: 'liman' }, geometry: { type: 'Point', coordinates: [26.607, 39.548] } });

const veri = { type: 'FeatureCollection', features: ozellikler };
const cikti = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'harita', 'ege-cevresi.json');
writeFileSync(cikti, JSON.stringify(veri));
const sayi = {};
for (const f of ozellikler) sayi[f.properties.katman] = (sayi[f.properties.katman] ?? 0) + 1;
console.log('Ege çevresi:', sayi, `${(JSON.stringify(veri).length / 1024).toFixed(0)} KB →`, cikti);
