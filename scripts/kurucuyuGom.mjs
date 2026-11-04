#!/usr/bin/env node
/**
 * Kurucu'daki işi haritanın kalıcı verisine gömer (4 Kasım).
 *
 * Kemal KKM'de "Haritayı ajansa gönder"e basınca düzenin tamamı ajans
 * deposuna `kkm/harita-duzeni.json` olarak yazılır (büyükse -2, -3
 * parçaları). Bu betik o dosyayı okur ve `src/data/kurucuGomulu.ts`'i
 * yeniden yazar. Harita, Firebase'deki `duzada/haritaDuzeni` belgesi
 * yoksa (ya da belgede Kurucu işi hiç yoksa) bu gömülü hâli gösterir;
 * belge varsa her zaman belge kazanır. Böylece hiçbir şey iki kez
 * çizilmez: Kurucu'da da taslak yoksa gömülü hâl taslak olarak açılır.
 *
 * Gömülenler: haritaya işlenmiş Kurucu hâli (yollar, binalar, özel
 * yapılar, doğa, tür değişikliği, kaldırılanlar, yol ve yapı düzeni,
 * madde bağları), mekân düzeltmeleri, eski düzenleyicinin yol ve sınır
 * hatları. Gömülmeyenler: evde oturanlar (kişi bağı; yalnız kayıtta
 * durur), notlar ve madde işaretleri (viki kayıtlarından gelir).
 *
 * Kayda yazmaz; yalnız depodaki dosyayı yazar. Sonuç öneri PR'ıyla gelir.
 *
 * Kullanım:  node scripts/kurucuyuGom.mjs <ajans-deposu>/kkm/harita-duzeni.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = join(KOK, 'src', 'data', 'kurucuGomulu.ts');
const DUZEN_SURUMU = 2;   // duzenTipi.ts → DUZEN_SURUMU
const HARITA_KUSAGI = 2;  // duzenTipi.ts → HARITA_KUSAGI

const nesneMi = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Alan yolundaki ('kurucu.yeniBinalar') değeri yerine koyar: nesneler birleşir, diziler uç uca */
function yerineKoy(hedef, yol, deger) {
  const parcalar = yol.split('.');
  let n = hedef;
  for (const p of parcalar.slice(0, -1)) {
    if (!nesneMi(n[p])) n[p] = {};
    n = n[p];
  }
  const son = parcalar[parcalar.length - 1];
  if (Array.isArray(deger)) n[son] = [...(Array.isArray(n[son]) ? n[son] : []), ...deger];
  else if (nesneMi(deger)) n[son] = { ...(nesneMi(n[son]) ? n[son] : {}), ...deger };
  else n[son] = deger;
}

/** Ana dosyayı ve varsa parçalarını tek nesnede toplar (haritaAjansa.ts → haritaDosyalari'nın tersi) */
function dosyayiOku(yol) {
  const ana = JSON.parse(readFileSync(yol, 'utf8'));
  if (!ana.bolundu) return ana;
  const tam = Object.fromEntries(Object.entries(ana).filter(([k]) => !['bolundu', 'parcalar', 'alanlar'].includes(k)));
  // İlk parça ana dosyanın kendisi; ötekiler aynı klasörde -2, -3…
  for (const [i, p] of (ana.parcalar ?? []).entries()) {
    const parcaYolu = join(dirname(yol), basename(p.yol));
    if (i > 0 && !existsSync(parcaYolu)) throw new Error(`Parça yok: ${parcaYolu}`);
    const parca = i === 0 ? ana : JSON.parse(readFileSync(parcaYolu, 'utf8'));
    for (const [alan, deger] of Object.entries(parca.alanlar ?? {})) yerineKoy(tam, alan, deger);
  }
  return tam;
}

/** Sayıları kısaltır (7 basamak ≈ 1 cm); dosya küçük kalsın */
const kisalt = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e7) / 1e7 : x)));

function main(yol) {
  if (!yol) {
    console.error('Kullanım: node scripts/kurucuyuGom.mjs <ajans-deposu>/kkm/harita-duzeni.json');
    process.exit(1);
  }
  const d = dosyayiOku(resolve(yol));
  if (Number(d.surum) !== DUZEN_SURUMU) throw new Error(`Düzen sürümü ${d.surum}; beklenen ${DUZEN_SURUMU}. Betik güncellenmeli.`);

  // Haritada görünen hâl: taslak işlenmişse taslak, değilse işlenen
  const islenen = d.taslakHaritayaIslendi ? d.kurucu : (d.kurucuIslenen ?? null);
  if (!d.taslakHaritayaIslendi) {
    console.warn('Uyarı: Kurucu taslağında haritaya işlenmemiş değişiklik var; yalnız haritaya işlenmiş hâl gömülür.');
  }
  let kurucuIslenen = null;
  if (nesneMi(islenen)) {
    // Evde oturanlar kişi bağıdır; kayıtta kalır, depoya girmez
    const { oturanlar: _oturanlar, ...kalan } = islenen;
    kurucuIslenen = kisalt(kalan);
    if (Number(kurucuIslenen.surum) !== HARITA_KUSAGI) {
      console.warn(`Uyarı: Kurucu kaydı ${kurucuIslenen.surum}. harita kuşağına göre; harita ${HARITA_KUSAGI}. kuşakta.`);
    }
  } else {
    console.warn('Uyarı: dosyada haritaya işlenmiş Kurucu hâli yok; Kurucu işi gömülmedi.');
  }

  const duzen = {
    surum: DUZEN_SURUMU,
    // Kayıttaki herhangi bir değişiklik bundan yeni sayılsın
    guncelleme: 0,
    hatlar: kisalt(d.hatlar ?? {}),
    yollar: kisalt(d.yollar ?? {}),
    mekanlar: kisalt(d.mekanlar ?? {}),
    ...(kurucuIslenen ? { kurucuIslenen } : {})
  };
  const k = kurucuIslenen ?? {};
  const say = (x) => (Array.isArray(x) ? x.length : Object.keys(x ?? {}).length);
  const sayilar = {
    yeniYol: say(k.yeniYollar), yeniBina: say(k.yeniBinalar), ozelYapi: say(k.ozelYapilar),
    doga: say(k.doga), turDegisikligi: say(k.turDegisikligi), gizlenen: say(k.gizlenen),
    yolDuzeni: say(k.yolDuzeni), binaDuzeni: say(k.binaDuzeni), baglar: say(k.baglar),
    mekan: say(duzen.mekanlar), yol: say(duzen.yollar), hat: say(duzen.hatlar)
  };
  const kaynak = { dosya: basename(yol), olusturuldu: d.olusturuldu ?? null, guncelleme: d.guncelleme ?? null, sayilar };

  const metin = `/**
 * Kurucu'nun kalıcı hâli: haritaya gömülü düzen (4 Kasım).
 *
 * Bu dosya üretilir, elle düzenlenmez:
 *   node scripts/kurucuyuGom.mjs <ajans-deposu>/kkm/harita-duzeni.json
 *
 * Firebase'deki \`duzada/haritaDuzeni\` belgesi yoksa ya da belgede Kurucu
 * işi yoksa harita ve Kurucu bunu açar (\`lib/haritaDuzeni.ts\` →
 * \`gomuluyleTamamla\`). Belge varsa belge kazanır; ikisi üst üste binmez.
 * Evde oturanlar (kişi bağları) bilerek dışarıda: yalnız kayıtta durur.
 */
import type { HaritaDuzeni } from '../components/harita/duzenTipi';

export const GOMULU_KAYNAK = ${JSON.stringify(kaynak, null, 2)};

export const GOMULU_DUZEN: HaritaDuzeni = JSON.parse(${JSON.stringify(JSON.stringify(duzen))});
`;
  writeFileSync(CIKTI, metin, 'utf8');
  console.log(`Yazıldı: ${CIKTI}`);
  console.log(Object.entries(sayilar).map(([a, n]) => `${a} ${n}`).join(' · '));
}

main(process.argv[2]);
