// "Son yedek N gün önce": Drive'dan gelen bilgi, tarayıcı yedek bilgisi: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveSonYedegi, gecenGun, sonYedekBilgisi, sonYedekYazisi } from './sonYedek';

const GUN = 86_400_000;

test('gecenGun ve sonYedekYazisi', () => {
  const simdi = Date.UTC(2026, 10, 26, 12);
  assert.equal(gecenGun(null, simdi), null);
  assert.equal(gecenGun(simdi - 3 * GUN, simdi), 3);
  assert.equal(sonYedekYazisi({ zaman: simdi - 1000, kaynak: 'drive' }, simdi), 'Bugün yedek alındı');
  assert.equal(sonYedekYazisi({ zaman: simdi - 40 * GUN, kaynak: 'drive' }, simdi), 'Son yedek 40 gün önce');
  assert.equal(sonYedekYazisi({ zaman: null, kaynak: 'drive' }, simdi), "Drive'da henüz tam yedek yok");
  assert.equal(sonYedekYazisi({ zaman: null, kaynak: 'tarayici' }, simdi), 'Henüz yedek alınmadı');
});

test('driveSonYedegi: Drive bilgisi tarayıcınınkinin yerine geçer', () => {
  // Node'da tarayıcı hafızası yok: ilk bilgi tarayıcıdan, boş
  assert.deepEqual(sonYedekBilgisi(), { zaman: null, kaynak: 'tarayici' });
  driveSonYedegi(5000);
  assert.deepEqual(sonYedekBilgisi(), { zaman: 5000, kaynak: 'drive' });
  driveSonYedegi(null);
  assert.deepEqual(sonYedekBilgisi(), { zaman: null, kaynak: 'drive' });
});
