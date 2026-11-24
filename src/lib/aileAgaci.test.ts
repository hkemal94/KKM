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

import { adParcalari, agacDiz, kisiHarfi } from './soyAgaci';
import { aileAgaci } from './aileAgaci';
import type { Item } from '../types';

test('adsız kişi: köşeli ayraç görünmez, yalnız soyadı kalır', () => {
  assert.deepEqual(adParcalari('[ad: Kemal] Ercan'), { ad: 'Ercan', adsiz: true });
  assert.deepEqual(adParcalari('Hasan Ercan'), { ad: 'Hasan Ercan', adsiz: false });
  assert.equal(kisiHarfi('[ad: Kemal] Özdemir'), 'Ö');
  assert.equal(kisiHarfi('Feriha (Ercan)'), 'F');
  assert.equal(aileBasHarfi('[ad: Kemal] Ailesi'), '');
});

test('yerleşim: eşler yan yana, çocuk eşlerin ortasında, kutular binmez', () => {
  const o = { en: 100, boy: 50, araX: 20, araY: 40, esAra: 20 };
  const y = agacDiz(
    [{ id: 'baba', ad: 'Baba', dogum: 1920 }, { id: 'anne', ad: 'Anne', dogum: 1925 }, { id: 'c1', ad: 'Bir', dogum: 1950 }, { id: 'c2', ad: 'İki', dogum: 1955 }, { id: 'tek', ad: 'Tek', dogum: 1990 }],
    [{ a: 'baba', b: 'anne', tur: 'eşi' }, { a: 'c1', b: 'baba', tur: 'ebeveyni' }, { a: 'c1', b: 'anne', tur: 'ebeveyni' }, { a: 'c2', b: 'baba', tur: 'ebeveyni' }, { a: 'c2', b: 'anne', tur: 'ebeveyni' }],
    o);
  const p = (id: string) => y.konum.get(id)!;
  assert.equal(p('baba').y, p('anne').y);
  assert.equal(Math.abs(p('anne').x - p('baba').x), o.en + o.esAra);
  assert.equal(p('c1').y, o.boy + o.araY);
  const ciftOrta = (p('baba').x + p('anne').x + o.en) / 2;
  const cocukOrta = (p('c1').x + p('c2').x + o.en) / 2;
  assert.ok(Math.abs(ciftOrta - cocukOrta) < 1);
  const kutular = [...y.konum.values()];
  for (const a of kutular) for (const b of kutular) {
    if (a === b) continue;
    assert.ok(Math.abs(a.y - b.y) >= o.boy || Math.abs(a.x - b.x) >= o.en, 'kutular üst üste binmemeli');
  }
});

const kisi = (id: string, title: string, profile: Record<string, string>, relations: Array<{ targetId: string; type: string }> = []): Item =>
  ({ id, title, type: 'kisi', area: 'duzada', status: '', priority: 'orta', tags: [], links: [], notes: '', images: [], createdAt: 0, updatedAt: 0, archived: false, isProposal: false, userId: '', metadata: { profile, relations } } as unknown as Item);
const aile = (id: string, title: string): Item =>
  ({ id, title, type: 'aile', area: 'duzada', status: '', priority: 'orta', tags: [], links: [], notes: '', images: [], createdAt: 0, updatedAt: 0, archived: false, isProposal: false, userId: '' } as unknown as Item);

test('aile ağacı: evlilikle gelen, buradan doğup giden ve torunu; gidenin eşi girmez', () => {
  const oku = (i: Item, id: string) => String((i.metadata?.profile as Record<string, string> | undefined)?.[id] || '');
  const items = [
    aile('ercan', 'Ercan Ailesi'), aile('demir', 'Demir Ailesi'), aile('ozdemir', 'Özdemir Ailesi'),
    kisi('hasan', 'Hasan Ercan', { aile: 'Ercan Ailesi', soyadi: 'Ercan', dogumYili: '1951' }),
    kisi('saadet', 'Saadet Ercan', { aile: 'Ercan Ailesi', soyadi: 'Ercan', dogumSoyadi: 'Demir', dogumAilesi: 'Demir Ailesi' }, [{ targetId: 'hasan', type: 'eşi' }]),
    kisi('aysel', 'Aysel Özdemir', { soyadi: 'Özdemir', aile: 'Özdemir Ailesi', dogumAilesi: 'Ercan Ailesi', dogumSoyadi: 'Ercan' },
      [{ targetId: 'hasan', type: 'ebeveyni' }, { targetId: 'saadet', type: 'ebeveyni' }, { targetId: 'ercan', type: 'üyesi' }]),
    kisi('kadir', 'Kadir Özdemir', { soyadi: 'Özdemir', aile: 'Özdemir Ailesi' }, [{ targetId: 'aysel', type: 'eşi' }]),
    kisi('derya', 'Derya Özdemir', { soyadi: 'Özdemir' }, [{ targetId: 'aysel', type: 'ebeveyni' }, { targetId: 'kadir', type: 'ebeveyni' }])
  ];
  const a = aileAgaci(items[0], items, oku, { en: 100, boy: 50, araX: 20, araY: 40, esAra: 20 });
  const yer = new Map(a.kisiler.map(k => [k.id, k.yer]));
  assert.equal(yer.get('hasan'), 'uye');
  assert.equal(yer.get('saadet'), 'gelen');
  assert.equal(yer.get('aysel'), 'dogan');
  assert.equal(yer.get('derya'), 'soy');
  assert.equal(yer.has('kadir'), false);
  assert.deepEqual(a.kisiler.find(k => k.id === 'saadet')!.baglar.map(b => b.ad), ['Demir Ailesi']);
  assert.deepEqual(a.kisiler.find(k => k.id === 'aysel')!.baglar.map(b => b.ad), ['Özdemir Ailesi']);
});
