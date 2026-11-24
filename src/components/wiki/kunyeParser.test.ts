// Künye başlık satırı: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kunyeBasligi, parseKunye } from './kunyeParser';
import type { Item } from '../../types';

const kisi = (title: string, notes: string): Item => ({
  id: 'k', title, area: 'duzada', type: 'kisi', status: 'Fikir', priority: 'orta', tags: [], links: [],
  notes, images: [], isProposal: false, archived: false, createdAt: 0, updatedAt: 0, userId: '', metadata: {},
} as unknown as Item);

test('künye başlığı: yıl aralığıyla başlayan viki cümlesi başlık değildir', () => {
  assert.equal(kunyeBasligi("Elif Yılmaz (2022–), Stadyum Mahallesi'nde doğdu.", 'Elif Yılmaz'), null);
  assert.equal(kunyeBasligi("Saadet Ercan (1955–), Hasan Ercan'ın eşidir.", 'Saadet Ercan'), null);
  assert.equal(kunyeBasligi("Elif Yılmaz (2022–), Stadyum'da doğdu — sonra Liman'a taşındı.", 'Elif Yılmaz'), null);
  assert.equal(kunyeBasligi('Elif Yılmaz (1990-2020) bir öğretmendi.', 'Elif Yılmaz'), null);
});

test('künye başlığı: eski geçerli biçimler aynen okunur', () => {
  assert.deepEqual(kunyeBasligi('Esra Gezgin (38) — Başaşçı', 'Esra Gezgin'), { yas: '38', rol: 'Başaşçı' });
  assert.deepEqual(kunyeBasligi('Esra Gezgin (38) – Başaşçı', 'Esra Gezgin'), { yas: '38', rol: 'Başaşçı' });
  assert.deepEqual(kunyeBasligi('Esra Gezgin — Başaşçı', 'Esra Gezgin'), { yas: undefined, rol: 'Başaşçı' });
  assert.deepEqual(kunyeBasligi('Esra Gezgin - Başaşçı', 'Esra Gezgin'), { yas: undefined, rol: 'Başaşçı' });
  assert.equal(kunyeBasligi('Başka Biri — Başaşçı', 'Esra Gezgin'), null);
});

test('parseKunye: viki cümlesi gövdede kalır, rol boş kalır', () => {
  const p = parseKunye(kisi('Saadet Ercan', "Saadet Ercan (1955–), Hasan Ercan'ın eşidir.\n\nİkinci paragraf."));
  assert.equal(p.rol, undefined);
  assert.equal(p.yas, undefined);
  assert.match(p.body, /^Saadet Ercan \(1955–\), Hasan Ercan'ın eşidir\./);
});

test('parseKunye: eski künye bloğu aynen ayrışır', () => {
  const p = parseKunye(kisi('Esra Gezgin', 'Esra Gezgin (38) — Başaşçı\n* Fizik: 1,75 boyunda\n* Ayrıntı: Uzun yıllar mutfakta.'));
  assert.equal(p.yas, '38');
  assert.equal(p.rol, 'Başaşçı');
  assert.deepEqual(p.fields, [{ label: 'Fizik', value: '1,75 boyunda' }]);
  assert.equal(p.body, 'Uzun yıllar mutfakta.');
});
