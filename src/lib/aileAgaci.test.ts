import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aileBasHarfi, hayattaDegil } from './aileAgaci';

test('monogram harfi soyadının baş harfi', () => {
  assert.equal(aileBasHarfi('Ercan Ailesi'), 'E');
  assert.equal(aileBasHarfi('Öztürk Ailesi'), 'Ö');
  assert.equal(aileBasHarfi('İnce ailesi'), 'İ');
  assert.equal(aileBasHarfi(''), '');
});

test('hayatta olmayan: Yaşam\'da ölüm yılı ya da aralığı yazılı', () => {
  assert.equal(hayattaDegil('', "1890'lar–1950'ler/1960'lar"), true);
  assert.equal(hayattaDegil('', "1920'ler–1990'lar"), true);
  assert.equal(hayattaDegil('1980', '1980–2020'), true);
  assert.equal(hayattaDegil('', '1951–'), false);
  assert.equal(hayattaDegil('', "1950'ler başı–"), false);
  assert.equal(hayattaDegil('', "1920'ler–"), false);
  assert.equal(hayattaDegil('', 'Bilinmiyor'), false);
  assert.equal(hayattaDegil('', ''), false);
});
