// Evde oturanların tek haritaya göçü (tek harita 11. adım): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Item } from '../types';
import { evdeOturanlar, oturanGocu } from './oturanGocu';

const kisi = (id: string, title: string, metadata: Record<string, unknown> = {}): Item => ({
  id, title, area: 'duzada', type: 'kisi', status: 'Fikir', priority: 'orta', tags: [], links: [], notes: '',
  images: [], createdAt: 1, updatedAt: 1, archived: false, isProposal: false, userId: 'u', metadata
} as Item);

test('oturanGocu: kişinin maddesine evi yazılır, ikinci basışta iş kalmaz', () => {
  const items = [kisi('k1', 'Bir'), kisi('k2', 'İki'), kisi('k3', 'Üç')];
  const oturanlar = { ev_a: ['k1'], ev_b: ['k2', 'k3'] };
  const g = oturanGocu(items, oturanlar, 5);
  assert.equal(g.yazilacak.length, 3);
  assert.deepEqual(g.yazilacak.map(y => [y.kisi.id, y.kisi.metadata?.haritaEvi, y.kisi.updatedAt]), [['k1', 'ev_a', 5], ['k2', 'ev_b', 5], ['k3', 'ev_b', 5]]);
  const sonra = items.map(i => g.yazilacak.find(y => y.kisi.id === i.id)?.kisi ?? i);
  const g2 = oturanGocu(sonra, oturanlar);
  assert.equal(g2.yazilacak.length, 0);
  assert.equal(g2.atlanan.length, 0);
  assert.deepEqual(evdeOturanlar(sonra, 'ev_b').map(i => i.id), ['k2', 'k3']);
});

test('oturanGocu: başka ev yazılıysa, kişi yoksa ya da iki evdeyse üstüne yazılmaz', () => {
  const items = [kisi('k1', 'Bir', { haritaEvi: 'ev_x' }), kisi('k2', 'İki')];
  const g = oturanGocu(items, { ev_a: ['k1', 'yok'], ev_b: ['k2'], ev_c: ['k2'] });
  assert.equal(g.yazilacak.length, 0);
  assert.deepEqual(g.atlanan.map(a => a.kisiId).sort(), ['k1', 'k2', 'yok']);
});

test('oturanGocu: eski kayıt yoksa iş yok', () => {
  assert.deepEqual(oturanGocu([kisi('k1', 'Bir')], {}), { yazilacak: [], atlanan: [] });
});
