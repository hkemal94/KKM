// Viki madde standardının karar türleri: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alaniBosaltPlani, bolumSilPlani, bolumYazPlani, gercekYerPlani, kunyeSatiriCikar } from './vikiKarari';
import type { Item, WikiSection } from '../types';

const madde = (bolumler: WikiSection[], metadata: Record<string, unknown> = {}): Item => ({
  id: 'm1', title: 'Küçükkuyu', area: 'duzada', type: 'yer_adi', status: 'Fikir', priority: 'orta', tags: [], links: [],
  notes: 'Giriş.', images: [], isProposal: false, archived: false, createdAt: 0, updatedAt: 0, userId: '',
  metadata: { wikiSections: bolumler, ...metadata },
} as unknown as Item);
const b = (id: string, title: string, content: string): WikiSection => ({ id, title, content, status: 'resmi' });
/** Planın sonucunu maddeye işler (ikinci basışı denemek için) */
const isle = (m: Item, bolumler: WikiSection[] | null) => (bolumler ? madde(bolumler) : m);

test('bolumYaz: yoksa verilen sıraya açılır, ikinci basışta bir şey yapmaz', () => {
  const m = madde([b('a', 'Konum ve sınırlar', 'K.'), b('c', 'Gündelik hayat', 'G.')]);
  const p = bolumYazPlani(m, { bolum: 'Tarihçe', metin: 'T.', sira: 2 }, 'yeni');
  assert.equal(p.cakisma, null);
  assert.deepEqual(p.bolumler?.map(x => x.title), ['Konum ve sınırlar', 'Tarihçe', 'Gündelik hayat']);
  assert.deepEqual(p.bolumler?.[1], { id: 'yeni', title: 'Tarihçe', content: 'T.', status: 'resmi' });
  const ikinci = bolumYazPlani(isle(m, p.bolumler), { bolum: 'Tarihçe', metin: 'T.', sira: 2 }, 'yeni2');
  assert.equal(ikinci.yapildi, true);
  assert.equal(ikinci.bolumler, null);
});

test('bolumYaz: sıra verilmezse ya da taşarsa sona', () => {
  const m = madde([b('a', 'Konum ve sınırlar', 'K.')]);
  assert.equal(bolumYazPlani(m, { bolum: 'Kaynaklar', metin: 'Vikipedi: Küçükkuyu' }).bolumler?.at(-1)?.title, 'Kaynaklar');
  assert.equal(bolumYazPlani(m, { bolum: 'Kaynaklar', metin: 'V', sira: 9 }).bolumler?.at(-1)?.title, 'Kaynaklar');
});

test('bolumYaz: dolu bölüm eski tutarsa değişir (yeri aynı), tutmazsa çakışma ve yeni bölüm açılmaz', () => {
  const m = madde([b('a', 'Tarihçe', 'Eski yazı.'), b('c', 'Kaynaklar', 'V')]);
  const p = bolumYazPlani(m, { bolum: 'Tarihçe', metin: 'Yeni yazı.', eski: 'Eski yazı.' });
  assert.equal(p.cakisma, null);
  assert.deepEqual(p.bolumler?.map(x => [x.id, x.title, x.content]), [['a', 'Tarihçe', 'Yeni yazı.'], ['c', 'Kaynaklar', 'V']]);
  const q = bolumYazPlani(m, { bolum: 'Tarihçe', metin: 'Yeni yazı.', eski: 'Başka.' });
  assert.match(q.cakisma || '', /değişmiş/);
  assert.equal(q.bolumler, null);
  const r = bolumYazPlani(m, { bolum: 'tarihçe', metin: 'Yeni yazı.' });
  assert.match(r.cakisma || '', /dolu/);
  // Kemal bu arada aynı yazıyı yazmışsa: yapılmış sayılır
  assert.equal(bolumYazPlani(madde([b('a', 'Tarihçe', 'Yeni yazı.')]), { bolum: 'Tarihçe', metin: 'Yeni yazı.', eski: 'Eski yazı.' }).yapildi, true);
});

test('bolumYaz: boş bölüm eskisiz dolar; büyük harf farkı başlığı düzeltir; eskiBaslik adı değiştirir', () => {
  assert.equal(bolumYazPlani(madde([b('a', 'Tarihçe', '')]), { bolum: 'Tarihçe', metin: 'T.' }).bolumler?.[0].content, 'T.');
  const d = bolumYazPlani(madde([b('a', 'Konum ve Dönem', 'X.')]), { bolum: 'Konum ve dönem', metin: 'X.' });
  assert.equal(d.bolumler?.[0].title, 'Konum ve dönem');
  const m = madde([b('a', 'Tarihçesi', 'X.'), b('c', 'Kaynaklar', 'V')]);
  const e = bolumYazPlani(m, { bolum: 'Tarihçe', eskiBaslik: 'Tarihçesi', metin: 'X.' });
  assert.deepEqual(e.bolumler?.map(x => x.title), ['Tarihçe', 'Kaynaklar']);
  assert.equal(bolumYazPlani(isle(m, e.bolumler), { bolum: 'Tarihçe', eskiBaslik: 'Tarihçesi', metin: 'X.' }).yapildi, true);
  assert.match(bolumYazPlani(madde([b('a', 'Tarihçesi', 'X.'), b('c', 'Tarihçe', 'Y.')]), { bolum: 'Tarihçe', eskiBaslik: 'Tarihçesi', metin: 'X.' }).cakisma || '', /zaten var/);
});

test('bolumYaz: aynı başlıkta iki bölüm, boş başlık ya da metin çakışma', () => {
  assert.match(bolumYazPlani(madde([b('a', 'Genel', 'A'), b('c', 'Genel', 'B')]), { bolum: 'Genel', metin: 'C', eski: 'A' }).cakisma || '', /birden çok/);
  assert.ok(bolumYazPlani(madde([]), { bolum: ' ', metin: 'x' }).cakisma);
  assert.ok(bolumYazPlani(null, { bolum: 'Tarihçe', metin: 'x' }).cakisma);
});

test('bolumSil: eski birebir tutarsa çıkar, ikinci basışta bir şey yapmaz, tutmazsa dokunmaz', () => {
  const m = madde([b('a', 'Genel', 'Aynı giriş.'), b('c', 'Tarihçe', 'T.')]);
  const p = bolumSilPlani(m, { bolum: 'Genel', eski: 'Aynı giriş.' });
  assert.deepEqual(p.bolumler?.map(x => x.id), ['c']);
  assert.equal(bolumSilPlani(isle(m, p.bolumler), { bolum: 'Genel', eski: 'Aynı giriş.' }).yapildi, true);
  // Kemal yazıyı değiştirmişse silinmez; karar eskimiştir
  const d = bolumSilPlani(m, { bolum: 'Genel', eski: 'Başka.' });
  assert.equal(d.yapildi, true);
  assert.equal(d.bolumler, null);
  // Aynı başlıkta başka yazılı bölüm kalsa da ikinci basış bir şey yapmaz
  const iki = madde([b('a', 'Genel', 'A'), b('c', 'Genel', 'B')]);
  const s1 = bolumSilPlani(iki, { bolum: 'Genel', eski: 'A' });
  assert.deepEqual(s1.bolumler?.map(x => x.id), ['c']);
  assert.equal(bolumSilPlani(isle(iki, s1.bolumler), { bolum: 'Genel', eski: 'A' }).yapildi, true);
  const o = madde([{ ...b('a', 'Genel', 'G'), bekleyenOneri: 'öneri' }]);
  assert.match(bolumSilPlani(o, { bolum: 'Genel', eski: 'G' }).cakisma || '', /bekleyen öneri/);
});

test('bolumSil tekrar: kopyalardan ilki kalır, ikinci basışta bir şey yapmaz', () => {
  const m = madde([b('a', 'Logo ve arma', 'L.'), b('x', 'Tarihçe', 'T.'), b('c', 'Logo ve arma', 'L.')]);
  const p = bolumSilPlani(m, { bolum: 'Logo ve arma', eski: 'L.', tekrar: true });
  assert.deepEqual(p.bolumler?.map(x => x.id), ['a', 'x']);
  assert.equal(bolumSilPlani(isle(m, p.bolumler), { bolum: 'Logo ve arma', eski: 'L.', tekrar: true }).yapildi, true);
});

test('gercekYer: işaret, ad ve bağlantı yazılır; aynıysa bir şey yapmaz; bağlantı https değilse çakışma', () => {
  const m = madde([]);
  const k = { kaynakAdi: 'Vikipedi: Küçükkuyu', kaynakUrl: 'https://tr.wikipedia.org/wiki/K%C3%BC%C3%A7%C3%BCkkuyu' };
  const p = gercekYerPlani(m, k);
  assert.equal(p.cakisma, null);
  assert.equal(p.metadata?.kaynak, 'gercek');
  assert.equal(p.metadata?.kaynakAdi, 'Vikipedi: Küçükkuyu');
  assert.ok(Array.isArray(p.metadata?.wikiSections));
  const ikinci = gercekYerPlani({ ...m, metadata: p.metadata } as Item, k);
  assert.equal(ikinci.yapildi, true);
  assert.equal(ikinci.metadata, null);
  // Eski "Wikipedia'dan" işaretli madde yeni işarete geçer
  assert.equal(gercekYerPlani(madde([], { kaynak: 'wikipedia', kaynakUrl: k.kaynakUrl }), k).yapildi, false);
  assert.ok(gercekYerPlani(m, { ...k, kaynakUrl: 'tr.wikipedia.org' }).cakisma);
  assert.ok(gercekYerPlani(m, { ...k, kaynakAdi: '' }).cakisma);
});

test('alaniBosalt: yalnız bugünkü değer eskiyse; boşsa yapılmış', () => {
  assert.deepEqual(alaniBosaltPlani('Bilinmiyor', 'bilinmiyor'), { yapildi: false, eskimis: false });
  assert.deepEqual(alaniBosaltPlani('', 'Bilinmiyor'), { yapildi: true, eskimis: false });
  assert.deepEqual(alaniBosaltPlani('1957', 'Bilinmiyor'), { yapildi: false, eskimis: true });
});

test('kunyeSatiriCikar: yalnız eşleşen satır çıkar', () => {
  const n = 'Giriş.\n\n* Köken: Bilinmiyor\n* Rol: Balıkçı';
  assert.equal(kunyeSatiriCikar(n, e => e === 'Köken', 'Bilinmiyor'), 'Giriş.\n\n* Rol: Balıkçı');
  assert.equal(kunyeSatiriCikar(n, e => e === 'Rol', 'Bilinmiyor'), null);
});
