/**
 * Yedekler → Google Drive (19 Kasım harita yedeği; 26 Kasım, Kemal: "Yedek işinin
 * direkt indirilmesi beni rahatsız ediyor; direkt Drive'a kaydolmalı, gerekirse ben
 * indirebilmeliyim").
 *
 * Bütün yedekler Kemal'in Drive'ında "KKM Yedekleri" klasörüne JSON olarak yüklenir
 * (klasör yoksa açılır). Yedeğin türü dosyanın `appProperties`'inde durur:
 *   - `tam-yedek`: Yedekleme penceresi (bütün maddeler, ayarlar, galeri görselleri)
 *   - `harita-yedegi`: Durum → Eksikler → Harita yedeği; Harita → Düzenle → "Drive'a yedek"
 *   - `islem-oncesi`: silme ya da toplu değişiklikten önce alınan güvenlik yedeği
 *     (Temizlik, eski alanlar, mükerrer, kanon, viki görselleri)
 *
 * Kapsam yalnız `drive.file`: uygulama yalnız kendi açtığı klasörü ve dosyaları görür;
 * Kemal'in öbür Drive dosyalarına dokunamaz. Eski "KKM yedekleri" klasörü (küçük y,
 * 26 Kasım'a kadar Yedekleme penceresi) Drive'da durur; bu dosya ona dokunmaz.
 *
 *   - Klasör ve dosyalar `appProperties` ile bulunur (ad değişse de olur).
 *   - Drive'da yedek silinmez: eskileri silmek Kemal'in işi.
 *   - Bilgisayara indirme yalnız Kemal listeden "İndir"e basınca (`bilgisayaraIndir`).
 *   - Erişim belirteci yalnız bellekte durur (`firebase.ts` → `driveDosyaIzni`);
 *     kayda ve koda yazılmaz.
 *
 * Bu dosya Firebase'e bağlı değil: `fetch` ve belirteç dışarıdan verilir, birim testi
 * sahte fetch ile çalışır (`driveYedek.test.ts`).
 */

export const DRIVE_KAPSAMI = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_KLASORU = 'KKM Yedekleri';
const KLASOR_TURU = 'application/vnd.google-apps.folder';
/** appProperties: klasörü ve yedekleri bulmak için */
const KLASOR_ISARETI = { key: 'kkmKlasor', value: 'yedekler' } as const;
const TUR_ANAHTARI = 'kkmTur';

export type YedekTuru = 'tam-yedek' | 'harita-yedegi' | 'islem-oncesi';
export const YEDEK_TURLERI: YedekTuru[] = ['tam-yedek', 'harita-yedegi', 'islem-oncesi'];
/** Ekranda görünen tür adı */
export const YEDEK_TURU_ADI: Record<YedekTuru, string> = {
  'tam-yedek': 'Tam yedek',
  'harita-yedegi': 'Harita yedeği',
  'islem-oncesi': 'İşlem öncesi'
};

const API = 'https://www.googleapis.com/drive/v3/files';
const YUKLE = 'https://www.googleapis.com/upload/drive/v3/files';
/** Drive'ın tek istekte (multipart) aldığı en büyük dosya 5 MB; üstü parçalı yolla gider */
export const TEK_ISTEK_SINIRI = 4_500_000;

export type DriveHataTuru = 'izin' | 'api-kapali' | 'ag' | 'diger';

/** Drive hatası: ekranda `metin` görünür (Türkçe, sade) */
export class DriveHatasi extends Error {
  constructor(public tur: DriveHataTuru, public metin: string, public durum?: number) {
    super(metin);
  }
}

export interface DriveYedegi {
  id: string;
  ad: string;
  /** Yedeğin alındığı an (ms) */
  olusturma: number;
  tur: YedekTuru;
  /** Bayt; Drive söylemediyse yok */
  boyut?: number;
  /** İşlem öncesi yedekte hangi işten önce alındığı (ör. "Temizlik") */
  islem?: string;
  /** Drive'da açma adresi */
  adres: string;
}

export interface DriveBaglami {
  belirtec: string;
  fetch?: typeof fetch;
}

/** Drive'ın hata cevabını Türkçe hataya çevirir (saf iş) */
export function driveHatasiniCoz(durum: number, govde: unknown): DriveHatasi {
  const hata = (govde as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null)?.error;
  const nedenler = [
    ...(hata?.errors ?? []).map(e => e?.reason),
    ...(hata?.details ?? []).map(e => e?.reason)
  ].filter(Boolean).map(String);
  const mesaj = hata?.message ?? '';
  if (nedenler.some(n => /accessNotConfigured|SERVICE_DISABLED/i.test(n)) || /has not been used|is disabled/i.test(mesaj)) {
    return new DriveHatasi('api-kapali', "Google Cloud'da Drive API'yi açman gerekiyor (KKM'nin Firebase projesinde \"Google Drive API\" → Etkinleştir). Açtıktan birkaç dakika sonra yeniden dene.", durum);
  }
  if (durum === 401) {
    return new DriveHatasi('izin', 'Drive izninin süresi dolmuş. Düğmeye yeniden bas; Google izni yeniden sorar.', durum);
  }
  if (durum === 403 && nedenler.some(n => /insufficient|forbidden|PERMISSION/i.test(n))) {
    return new DriveHatasi('izin', "Google, KKM'ye Drive'a yazma izni vermemiş. \"Drive iznini yenile\"ye bas; açılan Google penceresinde izni onayla.", durum);
  }
  if (durum === 429 || nedenler.some(n => /rateLimit|userRateLimit|quota/i.test(n))) {
    return new DriveHatasi('diger', 'Drive şu an çok fazla istek aldı; birkaç dakika sonra yeniden dene.', durum);
  }
  return new DriveHatasi('diger', `Drive cevap vermedi (${durum}${mesaj ? `: ${mesaj}` : ''}).`, durum);
}

/** Firebase'in izin penceresi hatasını Türkçe hataya çevirir (saf iş) */
export function izinPenceresiHatasi(e: unknown): DriveHatasi {
  const kod = (e as { code?: string } | null)?.code ?? '';
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(kod)) {
    return new DriveHatasi('izin', 'Drive izni verilmedi (pencere kapandı). Yeniden bas ve açılan Google penceresinde izni onayla.');
  }
  if (/popup-blocked/.test(kod)) {
    return new DriveHatasi('izin', 'Tarayıcı Google izin penceresini engelledi. Açılır pencerelere izin verip yeniden bas.');
  }
  if (/user-mismatch/.test(kod)) {
    return new DriveHatasi('izin', "İzin penceresinde başka bir Google hesabı seçildi. KKM'ye girdiğin hesabı seç.");
  }
  if (/network-request-failed/.test(kod)) {
    return new DriveHatasi('ag', 'İnternet bağlantısı yok; Drive izni alınamadı.');
  }
  return new DriveHatasi('izin', `Drive izni alınamadı (${kod || (e instanceof Error ? e.message : String(e))}).`);
}

async function istek(b: DriveBaglami, url: string, secenek: RequestInit = {}): Promise<Response> {
  const f = b.fetch ?? fetch;
  let cevap: Response;
  try {
    cevap = await f(url, { ...secenek, headers: { Authorization: `Bearer ${b.belirtec}`, ...(secenek.headers || {}) } });
  } catch {
    throw new DriveHatasi('ag', 'İnternet bağlantısı yok ya da Drive\'a ulaşılamadı.');
  }
  if (!cevap.ok) throw driveHatasiniCoz(cevap.status, await cevap.json().catch(() => null));
  return cevap;
}

const json = async <T>(b: DriveBaglami, url: string, secenek?: RequestInit) => (await istek(b, url, secenek)).json() as Promise<T>;
const tirnak = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const isaretSorgusu = (key: string, value: string) => `appProperties has { key='${tirnak(key)}' and value='${tirnak(value)}' }`;

/** "KKM Yedekleri" klasörünü bulur; `ac` verilirse yoksa açar */
export async function klasoruBul(b: DriveBaglami, ac: true): Promise<string>;
export async function klasoruBul(b: DriveBaglami, ac?: false): Promise<string | null>;
export async function klasoruBul(b: DriveBaglami, ac = false): Promise<string | null> {
  const q = `${isaretSorgusu(KLASOR_ISARETI.key, KLASOR_ISARETI.value)} and mimeType='${KLASOR_TURU}' and trashed=false`;
  const bul = await json<{ files?: { id: string }[] }>(b, `${API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
  const id = bul.files?.[0]?.id;
  if (id) return id;
  if (!ac) return null;
  const yeni = await json<{ id: string }>(b, `${API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: DRIVE_KLASORU, mimeType: KLASOR_TURU, appProperties: { [KLASOR_ISARETI.key]: KLASOR_ISARETI.value } })
  });
  return yeni.id;
}

/** Dosya adına giren kısa ek: yalnız harf, rakam ve tire (saf iş) */
const ekTemizle = (s: string) => s.toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Yedek dosyasının adı (saf iş): kkm-<tür>[-<işlem>]-YYYY-AA-GG-SS-DD.json */
export const driveDosyaAdi = (tur: YedekTuru, olusturma: number, islem?: string) => {
  const ek = islem ? ekTemizle(islem) : '';
  return `kkm-${tur}${ek ? `-${ek}` : ''}-${new Date(olusturma).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
};

/** Dosyanın Drive'daki adresi (Drive adres vermediyse) */
export const dosyaAdresi = (dosyaId: string) => `https://drive.google.com/file/d/${encodeURIComponent(dosyaId)}/view`;
/** Klasörün Drive'daki adresi (Kemal eskileri orada siler) */
export const klasorAdresi = (klasorId: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(klasorId)}`;

interface DriveDosyasi { id: string; name?: string; size?: string; webViewLink?: string; createdTime?: string; appProperties?: Record<string, string> }
const DOSYA_ALANLARI = 'id,name,size,webViewLink,createdTime,appProperties';

const turMu = (s: unknown): s is YedekTuru => typeof s === 'string' && (YEDEK_TURLERI as string[]).includes(s);

function yedegeCevir(f: DriveDosyasi, tahmin?: Partial<DriveYedegi>): DriveYedegi {
  const kayitliTur = f.appProperties?.[TUR_ANAHTARI];
  const tur: YedekTuru = turMu(kayitliTur) ? kayitliTur : (tahmin?.tur ?? 'tam-yedek');
  const boyut = f.size !== undefined && Number.isFinite(Number(f.size)) ? Number(f.size) : tahmin?.boyut;
  const islem = f.appProperties?.islem || tahmin?.islem;
  return {
    id: f.id,
    ad: f.name ?? tahmin?.ad ?? '',
    olusturma: Number(f.appProperties?.olusturma) || tahmin?.olusturma || Date.parse(f.createdTime ?? '') || 0,
    tur,
    ...(boyut !== undefined ? { boyut } : {}),
    ...(islem ? { islem } : {}),
    adres: f.webViewLink || dosyaAdresi(f.id)
  };
}

export interface YuklenecekYedek {
  tur: YedekTuru;
  olusturma: number;
  /** JSON yazısı */
  icerik: string;
  /** İşlem öncesi yedekte hangi işten önce (dosya adına ve appProperties'e girer) */
  islem?: string;
}

/** Metnin bayt boyu (saf iş) */
export const baytBoyu = (s: string) => new TextEncoder().encode(s).length;

/**
 * Yedeği klasöre yükler. Küçük dosya tek istekte (multipart: bilgi + içerik); büyük
 * dosya (galeri görselleriyle tam yedek 5 MB'ı geçebilir) parçalı yolla: önce bilgi,
 * Drive bir yükleme adresi verir, içerik oraya gider.
 */
export async function driveaYukle(b: DriveBaglami, klasorId: string, y: YuklenecekYedek): Promise<DriveYedegi> {
  const bilgi = {
    name: driveDosyaAdi(y.tur, y.olusturma, y.islem),
    mimeType: 'application/json',
    parents: [klasorId],
    appProperties: {
      [TUR_ANAHTARI]: y.tur,
      olusturma: String(y.olusturma),
      ...(y.islem ? { islem: y.islem.slice(0, 60) } : {})
    }
  };
  const boyut = baytBoyu(y.icerik);
  const tahmin: Partial<DriveYedegi> = { ad: bilgi.name, olusturma: y.olusturma, tur: y.tur, boyut, ...(y.islem ? { islem: y.islem } : {}) };

  if (boyut <= TEK_ISTEK_SINIRI) {
    const sinir = `kkm_yedek_${y.olusturma}`;
    const govde =
      `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(bilgi)}\r\n` +
      `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${y.icerik}\r\n--${sinir}--`;
    const d = await json<DriveDosyasi>(b, `${YUKLE}?uploadType=multipart&fields=${DOSYA_ALANLARI}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${sinir}` },
      body: govde
    });
    return yedegeCevir(d, tahmin);
  }

  const oturum = await istek(b, `${YUKLE}?uploadType=resumable&fields=${DOSYA_ALANLARI}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' },
    body: JSON.stringify(bilgi)
  });
  const adres = oturum.headers.get('Location');
  if (!adres) throw new DriveHatasi('diger', 'Drive büyük dosya için yükleme adresi vermedi; yeniden dene.');
  const d = await json<DriveDosyasi>(b, adres, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: y.icerik
  });
  return yedegeCevir(d, tahmin);
}

/** Klasörü bulur (yoksa açar) ve yedeği yükler */
export async function yedegiDriveaKoy(b: DriveBaglami, y: YuklenecekYedek): Promise<{ yedek: DriveYedegi; klasorId: string }> {
  const klasorId = await klasoruBul(b, true);
  return { yedek: await driveaYukle(b, klasorId, y), klasorId };
}

/** Klasördeki yedekler, yeniden eskiye. `tur` verilirse yalnız o tür(ler) */
export async function driveYedekleri(b: DriveBaglami, klasorId: string, tur?: YedekTuru | YedekTuru[]): Promise<DriveYedegi[]> {
  const turler = tur === undefined ? YEDEK_TURLERI : Array.isArray(tur) ? tur : [tur];
  const turSorgusu = turler.map(t => isaretSorgusu(TUR_ANAHTARI, t)).join(' or ');
  const q = `'${tirnak(klasorId)}' in parents and (${turSorgusu}) and trashed=false`;
  const dosyalar: DriveDosyasi[] = [];
  let sayfa: string | undefined;
  // En çok 10 sayfa (1000 yedek); daha eskisi Drive'da durur, listede görünmez
  for (let i = 0; i < 10; i++) {
    const s = await json<{ files?: DriveDosyasi[]; nextPageToken?: string }>(
      b, `${API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${DOSYA_ALANLARI})&orderBy=createdTime desc&pageSize=100&spaces=drive${sayfa ? `&pageToken=${encodeURIComponent(sayfa)}` : ''}`
    );
    dosyalar.push(...(s.files ?? []));
    sayfa = s.nextPageToken;
    if (!sayfa) break;
  }
  return dosyalar.map(f => yedegeCevir(f)).sort((a, c) => c.olusturma - a.olusturma);
}

/** Drive'daki dosyanın yazısı (indirmek için) */
export async function drivedanMetin(b: DriveBaglami, dosyaId: string): Promise<string> {
  return (await istek(b, `${API}/${encodeURIComponent(dosyaId)}?alt=media`)).text();
}

/** Drive'daki yedeği okur (JSON; hangi yedek olduğunu çağıran denetler) */
export async function drivedanOku(b: DriveBaglami, dosyaId: string): Promise<unknown> {
  const metin = await drivedanMetin(b, dosyaId);
  try { return JSON.parse(metin); } catch { throw new DriveHatasi('diger', 'Drive\'daki dosya okunamadı (bozuk ya da yedek değil).'); }
}

/** Belli türün en yeni yedeğinin anı; yoksa null (saf iş) */
export const enYeniYedek = (liste: DriveYedegi[], tur: YedekTuru): number | null => {
  const z = liste.filter(y => y.tur === tur).reduce((m, y) => Math.max(m, y.olusturma), 0);
  return z || null;
};

/** Boyut, okunur (saf iş): "820 KB", "4,2 MB" */
export const boyutYaz = (bayt?: number) => {
  if (bayt === undefined) return '';
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${Math.round(bayt / 1024)} KB`;
  return `${(bayt / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
};

/** Kemal listeden "İndir"e basınca: yazıyı bilgisayara dosya olarak indirir */
export function bilgisayaraIndir(ad: string, metin: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([metin], { type: 'application/json' }));
  a.download = ad || 'kkm-yedek.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
