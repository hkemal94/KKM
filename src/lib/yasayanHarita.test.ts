// Yaşayan harita kartının denemesi: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Item } from '../types';
import { enYakinYapi, kisaGiris, rakimsiz, yapiKarti } from './yasayanHarita';

const madde = (id: string, title: string, notes = '', metadata: Item['metadata'] = {}): Item => ({
  id, title, notes, metadata, area: 'duzada', type: 'mekân', status: '', priority: 'orta', tags: [], links: [], images: [],
  createdAt: 0, updatedAt: 0, archived: false, isProposal: false, userId: 'u'
} as unknown as Item);

const items = [
  madde('viki_mekan_fener', 'Deniz Feneri', 'Deniz feneri · Liman Mahallesi · 69 m rakım\n* Bekçilik: Bekçi fenerin yanındaki evde yaşardı'),
  madde('marka_1782600611254_j7gg5', 'Küçükçetmi Sürek Kulübü', 'Kulüp.'),
  madde('madde_1791396429330', 'Küçükçetmi Çiftliği'),
  madde('viki_mekan_dirlik_stadi', 'Dirlik Stadı', '', { haritaBinaId: 'bina_stad' }),
  madde('mekan_1791406291488_7jtvw', 'Düzada Jandarma Karakolu', 'Düzada Jandarma Karakolu, Merkez Mahallesi\'nde, Belediye Binası\'nın yanındadır.'),
  madde('m_baska', 'Bağlı yapı')
];

test('rakım kartta görünmez', () => {
  assert.equal(rakimsiz('Deniz feneri · Liman Mahallesi · 69 m rakım'), 'Deniz feneri · Liman Mahallesi');
  assert.equal(rakimsiz('Ev, rakım: 120 m'), 'Ev');
  assert.ok(!/rakım|69/.test(kisaGiris(items[0])));
  assert.match(kisaGiris(items[0]), /Bekçilik/);
});

test('Sürek Kulübü binası kulübü açar, çiftlik ikinci bağlantı', () => {
  const k = yapiKarti('bina_surek', items)!;
  assert.equal(k.madde?.id, 'marka_1782600611254_j7gg5');
  assert.deepEqual(k.ikinci.map(i => i.title), ['Küçükçetmi Çiftliği']);
});

test('karakolun adı vikiden; maddesiz yapı yalnız adla', () => {
  assert.equal(yapiKarti('bina_apt1', items)!.ad, 'Düzada Jandarma Karakolu');
  const f = yapiKarti('bina_fener_evi', items)!;
  assert.equal(f.ad, 'Fener Evi');
  assert.equal(f.madde, undefined);
  assert.equal(yapiKarti('bina_liman_depo', items), null);
});

test('Kurucu bağı ve haritaBinaId takması okunur', () => {
  assert.equal(yapiKarti('kurucu_bina_x', items, { kurucu_bina_x: 'm_baska' })!.ad, 'Bağlı yapı');
  assert.equal(yapiKarti('bina_stad_tribun', items.filter(i => i.id !== 'x'))!.madde?.id, 'viki_mekan_dirlik_stadi');
});

test('en yakın kartlı yapı, yarıçap içinde', () => {
  const yapilar = [{ kimlik: 'bina_fener', x: 0, z: 0 }, { kimlik: 'bina_liman_depo', x: 5, z: 0 }];
  const kartli = (k: string) => yapiKarti(k, items) !== null;
  assert.equal(enYakinYapi({ x: 4, z: 0 }, yapilar, kartli), 'bina_fener');
  assert.equal(enYakinYapi({ x: 200, z: 0 }, yapilar, kartli), null);
});
