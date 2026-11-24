// Ajansın başlık değiştirme kararı: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baslikDegistirPlani } from './baslikKarari';
import type { Item } from '../types';

const madde = (id: string, title: string, metadata: Record<string, unknown> = {}, ek: Partial<Item> = {}): Item => ({
  id, title, area: 'duzada', type: 'kisi', status: 'Fikir', priority: 'orta', tags: [], links: [],
  notes: '', images: [], isProposal: false, archived: false, createdAt: 0, updatedAt: 0, userId: '',
  metadata, ...ek,
} as unknown as Item);
const k = { eski: 'Feriha (Ercan)', yeni: 'Feriha Yıldız' };

test('baslikDegistir: başlık değişir, eski başlık eski adlara girer; ikinci basışta bir şey yapmaz', () => {
  const m = madde('f', 'Feriha (Ercan)', { eskiAdlar: ['Feriha'], relations: [{ targetId: 'x', type: 'esi' }] });
  const p = baslikDegistirPlani(m, [m], k);
  assert.equal(p.cakisma, null);
  assert.equal(p.yeni?.title, 'Feriha Yıldız');
  assert.deepEqual(p.yeni?.metadata?.eskiAdlar, ['Feriha', 'Feriha (Ercan)']);
  assert.deepEqual(p.yeni?.metadata?.adYayilacak, ['Feriha (Ercan)']);
  assert.deepEqual(p.yeni?.metadata?.relations, [{ targetId: 'x', type: 'esi' }]);
  const ikinci = baslikDegistirPlani(p.yeni, [p.yeni!], k);
  assert.equal(ikinci.yapildi, true);
  assert.equal(ikinci.yeni, null);
  assert.equal(ikinci.cakisma, null);
});

test('baslikDegistir: başlık eski de yeni de değilse çakışma', () => {
  const m = madde('f', 'Feriha Ercan');
  const p = baslikDegistirPlani(m, [m], k);
  assert.match(p.cakisma || '', /bu arada değişmiş/);
  assert.equal(p.yeni, null);
});

test('baslikDegistir: yeni başlıkta başka canlı madde varsa çakışma; arşivdeki sayılmaz', () => {
  const m = madde('f', 'Feriha (Ercan)');
  assert.match(baslikDegistirPlani(m, [m, madde('g', 'feriha yıldız')], k).cakisma || '', /başka bir madde/);
  assert.equal(baslikDegistirPlani(m, [m, madde('g', 'Feriha Yıldız', {}, { archived: true })], k).cakisma, null);
});

test('baslikDegistir: madde yoksa ya da başlık boşsa çakışma', () => {
  assert.match(baslikDegistirPlani(null, [], k).cakisma || '', /bulunamadı/);
  const m = madde('f', 'Feriha (Ercan)');
  assert.match(baslikDegistirPlani(m, [m], { eski: 'Feriha (Ercan)', yeni: ' ' }).cakisma || '', /boş/);
});
