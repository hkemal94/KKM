// Harita yedeği → Drive çağrılarının denemesi (sahte fetch): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_KLASORU, DriveHatasi, drivedanOku, driveaYukle, driveHatasiniCoz, driveYedekleri, izinPenceresiHatasi, klasoruBul,
  type DriveBaglami
} from './haritaDrive';

interface Cagri { url: string; method: string; headers: Record<string, string>; body?: string }

/** Sırayla verilen cevapları döndüren sahte fetch; çağrıları kaydeder */
function sahte(cevaplar: (Response | Error)[]) {
  const cagrilar: Cagri[] = [];
  const f = (async (url: string, s: RequestInit = {}) => {
    cagrilar.push({ url, method: s.method ?? 'GET', headers: s.headers as Record<string, string>, body: s.body as string | undefined });
    const c = cevaplar.shift();
    if (!c) throw new Error('beklenmeyen çağrı');
    if (c instanceof Error) throw c;
    return c;
  }) as unknown as typeof fetch;
  return { b: { belirtec: 'deneme-belirteci', fetch: f } as DriveBaglami, cagrilar };
}
const tamam = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
const hata = (durum: number, g: unknown) => new Response(JSON.stringify(g), { status: durum });

test('klasoruBul: appProperties ile bulur, açmaz', async () => {
  const { b, cagrilar } = sahte([tamam({ files: [{ id: 'K1' }] })]);
  assert.equal(await klasoruBul(b, true), 'K1');
  assert.equal(cagrilar.length, 1);
  const q = decodeURIComponent(new URL(cagrilar[0].url).searchParams.get('q') ?? '');
  assert.match(q, /appProperties has \{ key='kkmKlasor' and value='yedekler' \}/);
  assert.match(q, /mimeType='application\/vnd.google-apps.folder'/);
  assert.match(q, /trashed=false/);
  assert.equal(cagrilar[0].headers.Authorization, 'Bearer deneme-belirteci');
});

test('klasoruBul: yoksa "KKM Yedekleri" klasörünü açar; ac yoksa null', async () => {
  const { b, cagrilar } = sahte([tamam({ files: [] }), tamam({ id: 'YENI' })]);
  assert.equal(await klasoruBul(b, true), 'YENI');
  assert.equal(cagrilar[1].method, 'POST');
  const govde = JSON.parse(cagrilar[1].body!);
  assert.equal(govde.name, DRIVE_KLASORU);
  assert.equal(govde.name, 'KKM Yedekleri');
  assert.equal(govde.mimeType, 'application/vnd.google-apps.folder');
  assert.deepEqual(govde.appProperties, { kkmKlasor: 'yedekler' });

  const s2 = sahte([tamam({ files: [] })]);
  assert.equal(await klasoruBul(s2.b), null);
  assert.equal(s2.cagrilar.length, 1);
});

test('driveaYukle: multipart, klasörün içine, appProperties ve içerik', async () => {
  const { b, cagrilar } = sahte([tamam({ id: 'D1', name: 'x.json' })]);
  const an = Date.UTC(2026, 10, 19, 21, 30);
  const sonuc = await driveaYukle(b, 'K1', an, '{"tur":"harita-yedegi"}');
  assert.deepEqual(sonuc, { id: 'D1', ad: 'x.json', olusturma: an });
  const c = cagrilar[0];
  assert.ok(c.url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'));
  assert.equal(c.method, 'POST');
  const sinir = /boundary=(.+)$/.exec(c.headers['Content-Type'])![1];
  const parcalar = c.body!.split(`--${sinir}`);
  assert.equal(parcalar.length, 4); // boş, bilgi, içerik, "--"
  const bilgi = JSON.parse(parcalar[1].split('\r\n\r\n')[1]);
  assert.equal(bilgi.name, 'kkm-harita-yedegi-2026-11-19-21-30.json');
  assert.deepEqual(bilgi.parents, ['K1']);
  assert.equal(bilgi.mimeType, 'application/json');
  assert.deepEqual(bilgi.appProperties, { kkmTur: 'harita-yedegi', olusturma: String(an) });
  assert.equal(parcalar[2].split('\r\n\r\n')[1].trim(), '{"tur":"harita-yedegi"}');
  assert.ok(c.body!.endsWith(`--${sinir}--`));
});

test('driveYedekleri: klasördeki yedekler yeniden eskiye; silme çağrısı yok', async () => {
  const { b, cagrilar } = sahte([tamam({ files: [
    { id: 'a', name: 'a.json', appProperties: { olusturma: '1000' } },
    { id: 'c', name: 'c.json', createdTime: '2026-11-19T10:00:00Z' },
    { id: 'b', name: 'b.json', appProperties: { olusturma: '3000' } },
    { id: 'd', name: 'd.json', appProperties: { olusturma: '2000' } }
  ] })]);
  const l = await driveYedekleri(b, 'K1');
  assert.deepEqual(l.map(x => x.id), ['c', 'b', 'd', 'a']);
  assert.equal(l.length, 4); // 3'ten fazlası listelenir, hiçbiri silinmez
  assert.equal(cagrilar.length, 1);
  assert.ok(cagrilar.every(c => c.method === 'GET'));
  const q = decodeURIComponent(new URL(cagrilar[0].url).searchParams.get('q') ?? '');
  assert.match(q, /'K1' in parents/);
  assert.match(q, /key='kkmTur' and value='harita-yedegi'/);
});

test('drivedanOku: içeriği indirir (alt=media)', async () => {
  const { b, cagrilar } = sahte([new Response('{"tur":"harita-yedegi","vikiAlanlari":[]}', { status: 200 })]);
  assert.deepEqual(await drivedanOku(b, 'D1'), { tur: 'harita-yedegi', vikiAlanlari: [] });
  assert.equal(cagrilar[0].url, 'https://www.googleapis.com/drive/v3/files/D1?alt=media');
  const s2 = sahte([new Response('bozuk', { status: 200 })]);
  await assert.rejects(drivedanOku(s2.b, 'D1'), (e: unknown) => e instanceof DriveHatasi && /okunamadı/.test(e.metin));
});

test('403 accessNotConfigured: "Drive API\'yi açman gerekiyor"', async () => {
  const { b } = sahte([hata(403, { error: { code: 403, message: 'Google Drive API has not been used in project 123 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } })]);
  await assert.rejects(klasoruBul(b, true), (e: unknown) => {
    assert.ok(e instanceof DriveHatasi);
    assert.equal(e.tur, 'api-kapali');
    assert.match(e.metin, /Google Cloud'da Drive API'yi açman gerekiyor/);
    return true;
  });
  // Yalnız details içinde gelen SERVICE_DISABLED da aynı
  assert.equal(driveHatasiniCoz(403, { error: { details: [{ reason: 'SERVICE_DISABLED' }] } }).tur, 'api-kapali');
});

test('izin hataları: 401 süresi doldu, 403 yetersiz izin', () => {
  const e401 = driveHatasiniCoz(401, { error: { message: 'Invalid Credentials' } });
  assert.equal(e401.tur, 'izin');
  assert.equal(e401.durum, 401);
  const e403 = driveHatasiniCoz(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } });
  assert.equal(e403.tur, 'izin');
  assert.match(e403.metin, /yazma izni/);
});

test('ağ yok: fetch fırlatırsa "bağlantı yok"', async () => {
  const { b } = sahte([new TypeError('Failed to fetch')]);
  await assert.rejects(driveYedekleri(b, 'K1'), (e: unknown) => e instanceof DriveHatasi && e.tur === 'ag' && /bağlantı/.test(e.metin));
});

test('izin penceresi: kapandı, engellendi, başka hesap', () => {
  assert.match(izinPenceresiHatasi({ code: 'auth/popup-closed-by-user' }).metin, /izni verilmedi/);
  assert.match(izinPenceresiHatasi({ code: 'auth/popup-blocked' }).metin, /engelledi/);
  assert.match(izinPenceresiHatasi({ code: 'auth/user-mismatch' }).metin, /başka bir Google hesabı/);
  assert.equal(izinPenceresiHatasi({ code: 'auth/network-request-failed' }).tur, 'ag');
});
