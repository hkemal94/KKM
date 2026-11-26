// Drive yedekleri (tam, harita, işlem öncesi) → Drive çağrılarının denemesi (sahte fetch): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_KLASORU, DriveHatasi, TEK_ISTEK_SINIRI, boyutYaz, driveDosyaAdi, drivedanMetin, drivedanOku, driveaYukle, driveHatasiniCoz,
  driveYedekleri, enYeniYedek, izinPenceresiHatasi, klasoruBul, yedegiDriveaKoy, type DriveBaglami, type DriveYedegi
} from './driveYedek';

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
  const { b, cagrilar } = sahte([tamam({ id: 'D1', name: 'x.json', size: '23', webViewLink: 'https://drive.google.com/file/d/D1/view?usp=drivesdk' })]);
  const an = Date.UTC(2026, 10, 19, 21, 30);
  const sonuc = await driveaYukle(b, 'K1', { tur: 'harita-yedegi', olusturma: an, icerik: '{"tur":"harita-yedegi"}' });
  assert.deepEqual(sonuc, { id: 'D1', ad: 'x.json', olusturma: an, tur: 'harita-yedegi', boyut: 23, adres: 'https://drive.google.com/file/d/D1/view?usp=drivesdk' });
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
    { id: 'a', name: 'a.json', appProperties: { kkmTur: 'harita-yedegi', olusturma: '1000' } },
    { id: 'c', name: 'c.json', createdTime: '2026-11-19T10:00:00Z', appProperties: { kkmTur: 'harita-yedegi' } },
    { id: 'b', name: 'b.json', appProperties: { kkmTur: 'harita-yedegi', olusturma: '3000' } },
    { id: 'd', name: 'd.json', appProperties: { kkmTur: 'harita-yedegi', olusturma: '2000' } }
  ] })]);
  const l = await driveYedekleri(b, 'K1', 'harita-yedegi');
  assert.deepEqual(l.map(x => x.id), ['c', 'b', 'd', 'a']);
  assert.equal(l.length, 4); // 3'ten fazlası listelenir, hiçbiri silinmez
  assert.equal(cagrilar.length, 1);
  assert.ok(cagrilar.every(c => c.method === 'GET'));
  const q = decodeURIComponent(new URL(cagrilar[0].url).searchParams.get('q') ?? '');
  assert.match(q, /'K1' in parents/);
  assert.match(q, /key='kkmTur' and value='harita-yedegi'/);
  assert.doesNotMatch(q, /tam-yedek|islem-oncesi/);
  assert.equal(l[0].adres, 'https://drive.google.com/file/d/c/view'); // Drive adres vermediyse
});

test('driveYedekleri: tür verilmezse üç tür birden; tür, boyut, işlem okunur; sayfalar birleşir', async () => {
  const { b, cagrilar } = sahte([
    tamam({ nextPageToken: 'S2', files: [
      { id: 't', name: 't.json', size: '2048', appProperties: { kkmTur: 'tam-yedek', olusturma: '5000' } },
      { id: 'i', name: 'i.json', size: '10', appProperties: { kkmTur: 'islem-oncesi', olusturma: '6000', islem: 'Temizlik' } }
    ] }),
    tamam({ files: [{ id: 'h', name: 'h.json', appProperties: { kkmTur: 'harita-yedegi', olusturma: '4000' } }] })
  ]);
  const l = await driveYedekleri(b, 'K1');
  assert.deepEqual(l.map(x => [x.id, x.tur]), [['i', 'islem-oncesi'], ['t', 'tam-yedek'], ['h', 'harita-yedegi']]);
  assert.equal(l[0].islem, 'Temizlik');
  assert.equal(l[1].boyut, 2048);
  assert.equal(l[2].boyut, undefined);
  const q = decodeURIComponent(new URL(cagrilar[0].url).searchParams.get('q') ?? '');
  assert.match(q, /\(appProperties has \{ key='kkmTur' and value='tam-yedek' \} or .*'harita-yedegi'.* or .*'islem-oncesi' \}\)/);
  assert.equal(new URL(cagrilar[1].url).searchParams.get('pageToken'), 'S2');
  assert.ok(cagrilar.every(c => c.method === 'GET'));
});

test('enYeniYedek: yalnız istenen türün en yenisi', () => {
  const y = (id: string, tur: DriveYedegi['tur'], olusturma: number): DriveYedegi => ({ id, ad: id, tur, olusturma, adres: '' });
  const l = [y('a', 'islem-oncesi', 9000), y('b', 'tam-yedek', 3000), y('c', 'tam-yedek', 7000), y('d', 'harita-yedegi', 8000)];
  assert.equal(enYeniYedek(l, 'tam-yedek'), 7000);
  assert.equal(enYeniYedek([y('a', 'islem-oncesi', 1)], 'tam-yedek'), null);
});

test('driveDosyaAdi: tür ve işlem adı (Türkçe harf sadeleşir)', () => {
  const an = Date.UTC(2026, 10, 26, 9, 5);
  assert.equal(driveDosyaAdi('harita-yedegi', an), 'kkm-harita-yedegi-2026-11-26-09-05.json');
  assert.equal(driveDosyaAdi('tam-yedek', an), 'kkm-tam-yedek-2026-11-26-09-05.json');
  assert.equal(driveDosyaAdi('islem-oncesi', an, 'Mükerrer'), 'kkm-islem-oncesi-mukerrer-2026-11-26-09-05.json');
  assert.equal(driveDosyaAdi('islem-oncesi', an, 'Viki görselleri'), 'kkm-islem-oncesi-viki-gorselleri-2026-11-26-09-05.json');
});

test('yedegiDriveaKoy: işlem öncesi yedek klasörü bulur, türü ve işlemi yazar', async () => {
  const { b, cagrilar } = sahte([tamam({ files: [{ id: 'K1' }] }), tamam({ id: 'D9', name: 'kkm-islem-oncesi-temizlik.json' })]);
  const an = Date.UTC(2026, 10, 26, 10, 0);
  const { yedek, klasorId } = await yedegiDriveaKoy(b, { tur: 'islem-oncesi', olusturma: an, icerik: '{"items":[]}', islem: 'Temizlik' });
  assert.equal(klasorId, 'K1');
  assert.equal(yedek.tur, 'islem-oncesi');
  assert.equal(yedek.islem, 'Temizlik');
  assert.equal(yedek.boyut, 12); // Drive boyut vermediyse yazının bayt boyu
  const c = cagrilar[1];
  const sinir = /boundary=(.+)$/.exec(c.headers['Content-Type'])![1];
  const bilgi = JSON.parse(c.body!.split(`--${sinir}`)[1].split('\r\n\r\n')[1]);
  assert.deepEqual(bilgi.appProperties, { kkmTur: 'islem-oncesi', olusturma: String(an), islem: 'Temizlik' });
  assert.equal(bilgi.name, 'kkm-islem-oncesi-temizlik-2026-11-26-10-00.json');
  assert.deepEqual(bilgi.parents, ['K1']);
});

test('driveaYukle: büyük yedek parçalı yolla (önce bilgi, sonra içerik yükleme adresine)', async () => {
  const buyuk = JSON.stringify({ items: [], gorseller: { g: 'x'.repeat(TEK_ISTEK_SINIRI) } });
  const oturum = new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=U1' } });
  const { b, cagrilar } = sahte([oturum, tamam({ id: 'B1', name: 'buyuk.json', size: String(buyuk.length) })]);
  const sonuc = await driveaYukle(b, 'K1', { tur: 'tam-yedek', olusturma: 1, icerik: buyuk });
  assert.equal(sonuc.id, 'B1');
  assert.equal(sonuc.tur, 'tam-yedek');
  assert.equal(cagrilar.length, 2);
  assert.ok(cagrilar[0].url.includes('uploadType=resumable'));
  assert.equal(cagrilar[0].method, 'POST');
  const bilgi = JSON.parse(cagrilar[0].body!);
  assert.deepEqual(bilgi.parents, ['K1']);
  assert.equal(bilgi.appProperties.kkmTur, 'tam-yedek');
  assert.equal(cagrilar[1].method, 'PUT');
  assert.ok(cagrilar[1].url.includes('upload_id=U1'));
  assert.equal(cagrilar[1].body, buyuk);
  assert.equal(cagrilar[1].headers.Authorization, 'Bearer deneme-belirteci');

  // Drive yükleme adresi vermezse hata
  const s2 = sahte([new Response(null, { status: 200 })]);
  await assert.rejects(driveaYukle(s2.b, 'K1', { tur: 'tam-yedek', olusturma: 1, icerik: buyuk }), (e: unknown) => e instanceof DriveHatasi && /yükleme adresi/.test(e.metin));
});

test('driveaYukle: yüklenemezse hata fırlatır (işlem öncesi yedekte işlem yapılmaz)', async () => {
  const { b } = sahte([hata(500, { error: { message: 'Backend Error' } })]);
  await assert.rejects(driveaYukle(b, 'K1', { tur: 'islem-oncesi', olusturma: 1, icerik: '{}' }), (e: unknown) => e instanceof DriveHatasi && e.durum === 500);
});

test('boyutYaz', () => {
  assert.equal(boyutYaz(undefined), '');
  assert.equal(boyutYaz(512), '512 B');
  assert.equal(boyutYaz(2048), '2 KB');
  assert.equal(boyutYaz(4.2 * 1024 * 1024), '4,2 MB');
});

test('drivedanOku: içeriği indirir (alt=media)', async () => {
  const { b, cagrilar } = sahte([new Response('{"tur":"harita-yedegi","vikiAlanlari":[]}', { status: 200 })]);
  assert.deepEqual(await drivedanOku(b, 'D1'), { tur: 'harita-yedegi', vikiAlanlari: [] });
  assert.equal(cagrilar[0].url, 'https://www.googleapis.com/drive/v3/files/D1?alt=media');
  const s3 = sahte([new Response('{"a":1}', { status: 200 })]);
  assert.equal(await drivedanMetin(s3.b, 'D2'), '{"a":1}');
  const s2 = sahte([new Response('bozuk', { status: 200 })]);
  await assert.rejects(drivedanOku(s2.b, 'D1'), (e: unknown) => e instanceof DriveHatasi && /okunamadı/.test((e as DriveHatasi).metin));
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
