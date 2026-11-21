// Ajansa yazarken çakışma yardımcısının denemesi: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cakismaMi, ekliYol, guncelHaleYaz, hataninGuncelShasi, yeniDosyaYaz } from './cakisma';

const hata = (durum: number) => Object.assign(new Error(`GitHub ${durum}`), { durum });
const hemen = { bekle: async () => {} };

test('ekliYol: uzantıdan önce sıra eklenir', () => {
  assert.equal(ekliYol('kkm/uygulananlar/15-11-2026-101500.json', 1), 'kkm/uygulananlar/15-11-2026-101500.json');
  assert.equal(ekliYol('kkm/uygulananlar/15-11-2026-101500.json', 2), 'kkm/uygulananlar/15-11-2026-101500-2.json');
  assert.equal(ekliYol('a.b/dosya', 3), 'a.b/dosya-3');
});

test('cakismaMi: yalnız 409 ve 422', () => {
  assert.ok(cakismaMi(hata(409)));
  assert.ok(cakismaMi(hata(422)));
  assert.ok(!cakismaMi(hata(403)));
  assert.ok(!cakismaMi(new Error('ağ')));
});

test('yeniDosyaYaz: 409 sonrası aynı adla yeniden dener', async () => {
  const denenen: string[] = [];
  const adres = await yeniDosyaYaz('m/a.json', async y => {
    denenen.push(y);
    if (denenen.length < 3) throw hata(409);
    return `ok:${y}`;
  }, hemen);
  assert.equal(adres, 'ok:m/a.json');
  assert.deepEqual(denenen, ['m/a.json', 'm/a.json', 'm/a.json']);
});

test('yeniDosyaYaz: 422 (ad dolu) adın sonuna -2 ekler', async () => {
  const dolu = new Set(['m/a.json']);
  const adres = await yeniDosyaYaz('m/a.json', async y => { if (dolu.has(y)) throw hata(422); return y; }, hemen);
  assert.equal(adres, 'm/a-2.json');
});

test('yeniDosyaYaz: hep 409 ise sonunda hata fırlar (ekrandaki uyarı kalır)', async () => {
  let n = 0;
  await assert.rejects(yeniDosyaYaz('m/a.json', async () => { n++; throw hata(409); }, { ...hemen, deneme: 3 }), /409/);
  assert.equal(n, 4);
});

test('yeniDosyaYaz: başka hata yeniden denenmez', async () => {
  let n = 0;
  await assert.rejects(yeniDosyaYaz('m/a.json', async () => { n++; throw hata(401); }, hemen), /401/);
  assert.equal(n, 1);
});

test('guncelHaleYaz: çakışınca güncel hâli yeniden okur, üstüne ekler', async () => {
  // Depodaki liste: KKM okuduktan sonra ajans "b"yi ekliyor
  let depo = { sha: 's1', liste: ['a'] };
  let ilkYazma = true;
  const yazilan = await guncelHaleYaz(
    async () => ({ ...depo, liste: [...depo.liste] }),
    async hal => {
      if (ilkYazma) { ilkYazma = false; depo = { sha: 's2', liste: ['a', 'b'] }; }
      if (hal.sha !== depo.sha) throw hata(409);
      depo = { sha: 's3', liste: [...hal.liste, 'yeni'] };
      return depo.liste;
    },
    hemen,
  );
  assert.deepEqual(yazilan, ['a', 'b', 'yeni']);
});

test('hataninGuncelShasi: 409 iletisindeki güncel sürüm', () => {
  const a = 'a'.repeat(40), b = 'b'.repeat(40);
  assert.equal(hataninGuncelShasi(new Error(`GitHub 409: kkm/x.json is at ${a} but expected ${b}`)), a);
  assert.equal(hataninGuncelShasi(new Error('GitHub 409')), null);
});

test('guncelHaleYaz: çakışınca cakisinca hatayla çağrılır', async () => {
  const gelen: unknown[] = [];
  let n = 0;
  const r = await guncelHaleYaz(async () => n, async () => { if (n++ === 0) throw hata(409); return 'tamam'; }, { ...hemen, cakisinca: e => gelen.push(e) });
  assert.equal(r, 'tamam');
  assert.equal(gelen.length, 1);
});

test('yeniDosyaYaz: önceki deneme aynı içeriği yazmışsa yeniden yazmaz', async () => {
  let yazma = 0;
  const depo = new Map<string, string>();
  const adres = await yeniDosyaYaz('m/a.json', async y => {
    yazma++;
    depo.set(y, 'icerik');            // yazıldı ama cevap 409 ile düştü
    if (yazma === 1) throw hata(409);
    return `ok:${y}`;
  }, { ...hemen, varMi: async y => (depo.has(y) ? { ayni: depo.get(y) === 'icerik', sonuc: `var:${y}` } : null) });
  assert.equal(adres, 'var:m/a.json');
  assert.equal(yazma, 1);
});

test('yeniDosyaYaz: o adda başka içerik varsa sıradaki ada yazar', async () => {
  const adres = await yeniDosyaYaz('m/a.json', async y => `ok:${y}`,
    { ...hemen, varMi: async y => (y === 'm/a.json' ? { ayni: false, sonuc: 'baska' } : null) });
  assert.equal(adres, 'ok:m/a-2.json');
});
