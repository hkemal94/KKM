// Ajansın dönem kararı: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donemOnizleme, donemPlani } from './donemKarari';
import type { Donem } from './zamanCizgisi';

const var_: Donem[] = [
  { id: 'd1', ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1950 },
  { id: 'd2', ad: '2020 sonrası', bas: 2020 },
];

test('ekle: yeni dönem listenin sonuna, bitişsizse bit alanı hiç yazılmaz', () => {
  const p = donemPlani(var_, { ad: ' 1980–2000 ', bas: 1980, bit: 2000 }, 'yeni');
  assert.equal(p.cakisma, null);
  assert.equal(p.yapildi, false);
  assert.deepEqual(p.liste?.at(-1), { id: 'yeni', ad: '1980–2000', bas: 1980, bit: 2000 });
  const q = donemPlani(var_, { ad: 'Açık uçlu', bas: 2000, bit: null }, 'y2');
  assert.ok(q.liste && !('bit' in q.liste.at(-1)!));
});

test('ekle: aynı ad ve yıllar varsa uygulanmış sayılır (ikinci basışta bir şey yapmaz)', () => {
  const p = donemPlani(var_, { ad: 'mübadele ve erken cumhuriyet', bas: 1923, bit: 1950 });
  assert.equal(p.yapildi, true);
  assert.equal(p.liste, null);
  assert.equal(donemPlani(var_, { ad: '2020 sonrası', bas: 2020, bit: null }).yapildi, true);
});

test('ekle: aynı adla başka yıllarda dönem varsa üzerine yazılmaz, çakışma', () => {
  const p = donemPlani(var_, { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1954 });
  assert.match(p.cakisma || '', /aynı adla dönem var/);
  assert.equal(p.liste, null);
});

test('değiştir: eski birebir tutarsa yerinde değişir, kimlik aynı kalır', () => {
  const p = donemPlani(var_, { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1954, eski: { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1950 } });
  assert.equal(p.cakisma, null);
  assert.deepEqual(p.liste?.[0], { id: 'd1', ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1954 });
  assert.equal(p.liste?.length, 2);
  // uygulandıktan sonra
  const sonra = donemPlani(p.liste!, { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1954, eski: { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1950 } });
  assert.equal(sonra.yapildi, true);
});

test('değiştir: eski tutmuyorsa (Kemal bu arada değiştirdi) çakışma', () => {
  const p = donemPlani(var_, { ad: 'X', bas: 1923, bit: 1954, eski: { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1949 } });
  assert.match(p.cakisma || '', /bu arada değişmiş/);
  assert.equal(p.liste, null);
});

test('değiştir: yeni ad başka bir dönemin adıysa çakışma', () => {
  const p = donemPlani(var_, { ad: '2020 sonrası', bas: 1923, bit: 1950, eski: { ad: 'Mübadele ve erken Cumhuriyet', bas: 1923, bit: 1950 } });
  assert.match(p.cakisma || '', /aynı adla başka bir dönem/);
});

test('geçersiz: boş ad, kesirli yıl, bitiş baştan önce', () => {
  assert.ok(donemPlani(var_, { ad: ' ', bas: 1900 }).cakisma);
  assert.ok(donemPlani(var_, { ad: 'A', bas: 1900.5 }).cakisma);
  assert.ok(donemPlani(var_, { ad: 'A', bas: 1950, bit: 1923 }).cakisma);
  assert.ok(donemPlani(var_, { ad: 'A', bas: 1950, eski: { ad: '', bas: 1 } }).cakisma);
});

test('önizleme: eklenir / değişir satırı, çakışma başta', () => {
  assert.equal(donemOnizleme(var_, { ad: '1980–2000', bas: 1980, bit: 2000 }), 'Zaman çizgisi · dönem eklenir: 1980–2000 (1980–2000)');
  assert.equal(donemOnizleme(var_, { ad: '2020 sonrası', bas: 2021, eski: { ad: '2020 sonrası', bas: 2020 } }), 'Zaman çizgisi · dönem değişir: 2020 sonrası (2020–) → 2020 sonrası (2021–)');
  assert.match(donemOnizleme(var_, { ad: '2020 sonrası', bas: 2019 }), /^Çakışma, uygulanmaz: /);
});
