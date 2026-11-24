import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genelAgac, type SoyBagi, type SoyKisi } from './soyAgaci';

/** Genel soy ağacı (24 Kasım): her kişi kendi ailesinde tek gerçek kartla, öbür ailede yansımayla */
test('genel ağaç: gelin eşinin ailesinde, doğduğu ailede yansıma; çerçeveler ve kartlar binmez', () => {
  const kisiler: SoyKisi[] = [
    { id: 'ismail', ad: 'İsmail Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1928, bit: 1999 } },
    { id: 'emine', ad: 'Emine Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1933, bit: 2011 } },
    { id: 'nusret', ad: 'Nusret Demir', aileId: 'demir', soyadiAileId: 'demir', yasam: { bas: 1961, bit: null } },
    { id: 'hasan', ad: 'Hasan Ercan', aileId: 'ercan', soyadiAileId: 'ercan', yasam: { bas: 1951, bit: null } },
    { id: 'saadet', ad: 'Saadet Ercan', aileId: 'ercan', soyadiAileId: 'ercan', dogumAileId: 'demir', yasam: { bas: 1955, bit: null } },
    { id: 'aysel', ad: 'Aysel Özdemir', aileId: 'ozdemir', soyadiAileId: 'ozdemir', dogumAileId: 'ercan', yasam: { bas: 1970, bit: null } },
    { id: 'kadir', ad: 'Kadir Özdemir', aileId: 'ozdemir', soyadiAileId: 'ozdemir', yasam: { bas: 1966, bit: null } }
  ];
  const bag = (a: string, b: string, tur: SoyBagi['tur']): SoyBagi => ({ id: `${a}|${b}|${tur}`, a, b, tur });
  const baglar = [
    bag('ismail', 'emine', 'eşi'), bag('nusret', 'ismail', 'ebeveyni'), bag('nusret', 'emine', 'ebeveyni'),
    bag('saadet', 'ismail', 'ebeveyni'), bag('saadet', 'emine', 'ebeveyni'), bag('hasan', 'saadet', 'eşi'),
    bag('aysel', 'hasan', 'ebeveyni'), bag('aysel', 'saadet', 'ebeveyni'), bag('aysel', 'kadir', 'eşi')
  ];
  const aileler = [{ id: 'demir', ad: 'Demir Ailesi' }, { id: 'ercan', ad: 'Ercan Ailesi' }, { id: 'ozdemir', ad: 'Özdemir Ailesi' }];
  const o = { en: 100, boy: 50, araX: 20, araY: 40, esAra: 20 };
  const g = genelAgac(kisiler, baglar, aileler, o);
  const kartlar = (id: string) => (g.kartlari.get(id) || []).map(d => `${d.cerceve}${d.yansima ? '~' : ''}`).sort();
  assert.deepEqual(kartlar('saadet'), ['demir~', 'ercan']);
  assert.deepEqual(kartlar('aysel'), ['ercan~', 'ozdemir']);
  assert.deepEqual(kartlar('hasan'), ['ercan']);
  // Saadet'in yansıması Demir'de ebeveynlerinin altında
  const demir = g.cerceveler.find(c => c.id === 'demir')!;
  assert.ok(demir.kenarlar.some(k => k.a === 'demir~saadet' && k.b === 'ismail' && k.tur === 'ebeveyni'));
  // Çerçeveler üst üste binmez
  for (const a of g.cerceveler) for (const b of g.cerceveler) {
    if (a === b) continue;
    assert.ok(a.x + a.en <= b.x || b.x + b.en <= a.x || a.y + a.boy <= b.y || b.y + b.boy <= a.y, `${a.id} ile ${b.id} binmemeli`);
  }
  // Kartlar kendi çerçevesinin içinde
  for (const d of g.dugumler) {
    const c = g.cerceveler.find(x => x.id === d.cerceve)!;
    assert.ok(d.x >= c.x && d.x + o.en <= c.x + c.en && d.y >= c.y && d.y + o.boy <= c.y + c.boy, `${d.id} çerçevesinde`);
  }
});
