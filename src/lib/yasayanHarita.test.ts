// Yaşayan harita kartının denemesi: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Item } from '../types';
import { kisaGiris, rakimsiz } from './yasayanHarita';

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
