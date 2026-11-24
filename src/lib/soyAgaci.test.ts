import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dogduguAile, tekAgac, type SoyBagi, type SoyKisi, type TekAgac } from './soyAgaci';

/** Tek soy ağacı (24 Kasım akşam): çerçeve yok, kopya kart yok, çizgiler kesişmez */

const o = { en: 100, boy: 50, araX: 20, araY: 40, esAra: 20 };
const bag = (a: string, b: string, tur: SoyBagi['tur']): SoyBagi => ({ id: `${a}|${b}|${tur}`, a, b, tur });

type Parca = { x1: number; y1: number; x2: number; y2: number; cizgi: string; kisiler: string[] };

/** Çizgileri düz parçalara ayırır (yalnız M, H, V kullanılıyor) */
function parcalar(a: TekAgac): Parca[] {
  const l: Parca[] = [];
  for (const c of a.cizgiler) {
    let x = 0, y = 0;
    for (const [, h, s1, s2] of c.d.matchAll(/([MHV])(-?[\d.]+)(?:,(-?[\d.]+))?/g)) {
      const v1 = Number(s1);
      if (h === 'M') { x = v1; y = Number(s2); continue; }
      const [nx, ny] = h === 'H' ? [v1, y] : [x, v1];
      l.push({ x1: Math.min(x, nx), y1: Math.min(y, ny), x2: Math.max(x, nx), y2: Math.max(y, ny), cizgi: c.id, kisiler: c.kisiler });
      x = nx; y = ny;
    }
  }
  return l;
}

/** Kesişme ve kart üstünden geçme denetimi */
function denetle(a: TekAgac) {
  const ps = parcalar(a);
  // Hiçbir çizgi bir kartın içinden geçmez (kenara değmesi serbest)
  for (const p of ps) for (const [id, k] of a.konum) {
    const icX = p.x2 > k.x + 0.5 && p.x1 < k.x + o.en - 0.5, icY = p.y2 > k.y + 0.5 && p.y1 < k.y + o.boy - 0.5;
    assert.ok(!(icX && icY), `${p.cizgi} çizgisi ${id} kartının üstünden geçiyor`);
  }
  // Farklı çizgilerin parçaları kesişmez, üst üste binmez
  for (const p of ps) for (const q of ps) {
    if (p.cizgi >= q.cizgi) continue;
    // Çocuk çizgisi anne-babasının eş çizgisinin ortasından başlar: o değme serbest
    const [es, cocuk] = p.cizgi.startsWith('e-') ? [p, q] : [q, p];
    if (es.cizgi.startsWith('e-') && cocuk.cizgi.startsWith('c-') && es.kisiler.every(x => cocuk.kisiler.includes(x))) continue;
    const kesisir = p.x1 <= q.x2 + 0.5 && q.x1 <= p.x2 + 0.5 && p.y1 <= q.y2 + 0.5 && q.y1 <= p.y2 + 0.5;
    assert.ok(!kesisir, `${p.cizgi} ile ${q.cizgi} kesişiyor`);
  }
  // Kartlar üst üste binmez
  const ks = [...a.konum.entries()];
  for (const [i, p] of ks) for (const [j, q] of ks) {
    if (i >= j) continue;
    assert.ok(p.x + o.en <= q.x || q.x + o.en <= p.x || p.y + o.boy <= q.y || q.y + o.boy <= p.y, `${i} ile ${j} binmemeli`);
  }
}

const kisiler: SoyKisi[] = [
  { id: 'gulsum', ad: 'Gülsüm Ercan', aileId: 'ercan', soyadiAileId: 'ercan', yasam: { bas: 1895, bit: 1963 } },
  { id: 'mustafa', ad: 'Mustafa Ercan', aileId: 'ercan', soyadiAileId: 'ercan', yasam: { bas: 1925, bit: 1991 } },
  { id: 'naciye', ad: 'Naciye Ercan', aileId: 'ercan', soyadiAileId: 'ercan', dogumAilesiYok: true, yasam: { bas: 1929, bit: 2008 } },
  { id: 'hasan', ad: 'Hasan Ercan', aileId: 'ercan', soyadiAileId: 'ercan', yasam: { bas: 1951, bit: null } },
  { id: 'feriha', ad: 'Feriha Yıldız', dogumAileId: 'ercan', yasam: { bas: 1954, bit: null } },
  { id: 'ismail', ad: 'İsmail Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1928, bit: 1999 } },
  { id: 'emine', ad: 'Emine Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1933, bit: 2011 } },
  { id: 'nusret', ad: 'Nusret Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1961, bit: null } },
  { id: 'saadet', ad: 'Saadet Ercan', aileId: 'ercan', soyadiAileId: 'ercan', dogumAileId: 'demir', yasam: { bas: 1955, bit: null } },
  { id: 'aysel', ad: 'Aysel Özdemir', aileId: 'ozdemir', soyadiAileId: 'ozdemir', dogumAileId: 'ercan', yasam: { bas: 1974, bit: null } },
  { id: 'kadir', ad: 'Kadir Özdemir', aileId: 'ozdemir', soyadiAileId: 'ozdemir', yasam: { bas: 1966, bit: null } },
  { id: 'derya', ad: 'Derya Özdemir', aileId: 'ozdemir', soyadiAileId: 'ozdemir', yasam: { bas: 1992, bit: null } },
  { id: 'mehmet', ad: 'Mehmet Yılmaz', aileId: 'yilmaz', soyadiAileId: 'yilmaz', yasam: { bas: 1980, bit: null } },
  { id: 'zeynep', ad: 'Zeynep Öztürk Yılmaz', aileId: 'ozturk', soyadiAileId: 'yilmaz', dogumAileId: 'ozturk', yasam: { bas: 1985, bit: null } },
  { id: 'erdal', ad: 'Erdal Öztürk', aileId: 'ozturk', soyadiAileId: 'ozturk', yasam: { bas: 1997, bit: null } },
  { id: 'elif', ad: 'Elif Yılmaz', aileId: 'yilmaz', soyadiAileId: 'yilmaz', yasam: { bas: 2022, bit: null } },
  { id: 'goksel', ad: 'Göksel Yılmaz', aileId: 'yilmaz', soyadiAileId: 'yilmaz', yasam: { bas: 1989, bit: null } },
  { id: 'kubra', ad: 'Kübra Yılmaz', aileId: 'yilmaz', soyadiAileId: 'yilmaz', dogumAilesiYok: true, yasam: { bas: 1995, bit: null } }
];
const baglar = [
  bag('mustafa', 'gulsum', 'ebeveyni'), bag('mustafa', 'naciye', 'eşi'),
  bag('hasan', 'mustafa', 'ebeveyni'), bag('hasan', 'naciye', 'ebeveyni'),
  bag('feriha', 'mustafa', 'ebeveyni'), bag('feriha', 'naciye', 'ebeveyni'), bag('feriha', 'hasan', 'kardeşi'),
  bag('emine', 'ismail', 'eşi'), bag('nusret', 'ismail', 'ebeveyni'), bag('nusret', 'emine', 'ebeveyni'),
  bag('saadet', 'ismail', 'ebeveyni'), bag('saadet', 'emine', 'ebeveyni'), bag('nusret', 'saadet', 'kardeşi'),
  bag('hasan', 'saadet', 'eşi'), bag('aysel', 'hasan', 'ebeveyni'), bag('aysel', 'saadet', 'ebeveyni'),
  bag('aysel', 'kadir', 'eşi'), bag('derya', 'aysel', 'ebeveyni'), bag('derya', 'kadir', 'ebeveyni'),
  bag('mehmet', 'zeynep', 'eşi'), bag('erdal', 'zeynep', 'kardeşi'),
  bag('elif', 'mehmet', 'ebeveyni'), bag('elif', 'zeynep', 'ebeveyni'),
  bag('goksel', 'kubra', 'eşi'), bag('goksel', 'mehmet', 'akrabası')
];

test('tek ağaç: Elif, Mehmet ile Zeynep\'in ortasının altında; herkes tek kartta', () => {
  const a = tekAgac(kisiler, baglar, o);
  assert.equal(a.konum.size, kisiler.length);
  const k = (id: string) => a.konum.get(id)!;
  const ortaX = (id: string) => k(id).x + o.en / 2;
  // Mehmet ile Zeynep yan yana, Elif bir kuşak altta ve tam ortalarında
  assert.equal(k('mehmet').y, k('zeynep').y);
  assert.equal(Math.abs(k('mehmet').x - k('zeynep').x), o.en + o.esAra);
  assert.ok(k('elif').y > k('mehmet').y);
  assert.ok(Math.abs(ortaX('elif') - (ortaX('mehmet') + ortaX('zeynep')) / 2) < 0.5, 'Elif ortada');
  // Elif'in çizgisi Mehmet ile Zeynep'in eş çizgisinden iner, Kübra'ya dokunmaz
  const elifCizgisi = a.cizgiler.find(c => c.tur === 'çocuk' && c.kisiler.includes('elif'))!;
  assert.deepEqual([...elifCizgisi.kisiler].sort(), ['elif', 'mehmet', 'zeynep']);
  // Zeynep kardeşi Erdal'a bakar
  assert.equal(Math.abs(k('zeynep').x - k('erdal').x), o.en + o.esAra);
  // Gelin (Saadet) eşinin yanında, tek kartta; Demir'den inen çizgi ona ulaşır
  assert.equal(k('hasan').y, k('saadet').y);
  assert.equal(Math.abs(k('hasan').x - k('saadet').x), o.en + o.esAra);
  const demir = a.cizgiler.find(c => c.tur === 'çocuk' && c.kisiler.includes('ismail'))!;
  assert.ok(demir.kisiler.includes('saadet') && demir.kisiler.includes('nusret'));
  // Aysel, Hasan ile Saadet'in ortasının altında
  assert.ok(Math.abs(ortaX('aysel') - (ortaX('hasan') + ortaX('saadet')) / 2) < 0.5);
  // Kuşaklar: Gülsüm en üstte; İsmail, Mustafa ile aynı sırada
  assert.equal(a.kusak.get('gulsum'), 0);
  assert.equal(a.kusak.get('ismail'), a.kusak.get('mustafa'));
  // Ayrı aileler (Göksel ile Kübra) Elif'in üstünde durmaz
  for (const id of ['goksel', 'kubra']) assert.ok(k(id).x + o.en <= k('elif').x || k('elif').x + o.en <= k(id).x, `${id} Elif'in üstünde değil`);
  denetle(a);
});

test('şerit: doğduğu aile; doğduğu aile vikide yoksa renk yok', () => {
  const k = new Map(kisiler.map(x => [x.id, x]));
  assert.equal(dogduguAile(k.get('zeynep')!), 'ozturk');
  assert.equal(dogduguAile(k.get('saadet')!), 'demir');
  assert.equal(dogduguAile(k.get('mehmet')!), 'yilmaz');
  assert.equal(dogduguAile(k.get('kubra')!), undefined);
});

test('ebeveyni ağaçta olmayan kardeşler kısa köşeli çizgiyle; kesişme yok', () => {
  const ks: SoyKisi[] = [
    { id: 'a', ad: 'A', yasam: { bas: 1990, bit: null } }, { id: 'b', ad: 'B', yasam: { bas: 1995, bit: null } },
    { id: 'c', ad: 'C', yasam: { bas: 2000, bit: null } }, { id: 'e', ad: 'E', yasam: { bas: 1988, bit: null } },
    { id: 'f', ad: 'F', yasam: { bas: 2015, bit: null } }
  ];
  const a = tekAgac(ks, [bag('a', 'b', 'kardeşi'), bag('b', 'c', 'kardeşi'), bag('b', 'e', 'eşi'), bag('f', 'b', 'ebeveyni'), bag('f', 'e', 'ebeveyni')], o);
  const kardes = a.cizgiler.filter(c => c.tur === 'kardeşi');
  assert.equal(kardes.length, 1);
  assert.deepEqual([...kardes[0].kisiler].sort(), ['a', 'b', 'c']);
  denetle(a);
});
