/**
 * Harita yedeği → Google Drive (19 Kasım, Kemal: "KKM doğrudan Drive'a").
 *
 * Durum → Eksikler → "Harita yedeği" kartı kullanır. Yedek Kemal'in
 * Drive'ında "KKM Yedekleri" klasörüne JSON olarak yüklenir (klasör yoksa
 * açılır). Kapsam yalnız `drive.file`: uygulama yalnız kendi açtığı klasörü
 * ve dosyaları görür; Kemal'in öbür Drive dosyalarına dokunamaz.
 *
 *   - Klasör ve dosyalar `appProperties` ile bulunur (ad değişse de olur).
 *   - Drive'da yedek silinmez: 3'ten fazlası olursa kart yalnız söyler,
 *     silmek Kemal'in işi.
 *   - Erişim belirteci yalnız bellekte durur (`firebase.ts` →
 *     `driveDosyaIzni`); kayda ve koda yazılmaz.
 *
 * Bu dosya Firebase'e bağlı değil: `fetch` ve belirteç dışarıdan verilir,
 * birim testi sahte fetch ile çalışır (`haritaDrive.test.ts`).
 */

export const DRIVE_KAPSAMI = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_KLASORU = 'KKM Yedekleri';
const KLASOR_TURU = 'application/vnd.google-apps.folder';
/** appProperties: klasörü ve yedekleri bulmak için */
const KLASOR_ISARETI = { key: 'kkmKlasor', value: 'yedekler' } as const;
const YEDEK_ISARETI = { key: 'kkmTur', value: 'harita-yedegi' } as const;

const API = 'https://www.googleapis.com/drive/v3/files';
const YUKLE = 'https://www.googleapis.com/upload/drive/v3/files';

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
    return new DriveHatasi('izin', 'Drive izninin süresi dolmuş. "Yedeği al"a yeniden bas; Google izni yeniden sorar.', durum);
  }
  if (durum === 403 && nedenler.some(n => /insufficient|forbidden|PERMISSION/i.test(n))) {
    return new DriveHatasi('izin', "Google, KKM'ye Drive'a yazma izni vermemiş. Yeniden bas; açılan Google penceresinde izni onayla.", durum);
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
    return new DriveHatasi('izin', 'Drive izni verilmedi (pencere kapandı). Yedek yine bilgisayarına indi; Drive için yeniden bas ve izni onayla.');
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
const isaretSorgusu = (i: { key: string; value: string }) => `appProperties has { key='${tirnak(i.key)}' and value='${tirnak(i.value)}' }`;

/** "KKM Yedekleri" klasörünü bulur; `ac` verilirse yoksa açar */
export async function klasoruBul(b: DriveBaglami, ac: true): Promise<string>;
export async function klasoruBul(b: DriveBaglami, ac?: false): Promise<string | null>;
export async function klasoruBul(b: DriveBaglami, ac = false): Promise<string | null> {
  const q = `${isaretSorgusu(KLASOR_ISARETI)} and mimeType='${KLASOR_TURU}' and trashed=false`;
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

/** Yedek dosyasının adı (saf iş) */
export const driveDosyaAdi = (olusturma: number) =>
  `kkm-harita-yedegi-${new Date(olusturma).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;

/** Yedeği klasöre yükler (multipart: bilgi + içerik tek istekte) */
export async function driveaYukle(b: DriveBaglami, klasorId: string, olusturma: number, icerik: string): Promise<DriveYedegi> {
  const sinir = `kkm_harita_${olusturma}`;
  const bilgi = {
    name: driveDosyaAdi(olusturma),
    mimeType: 'application/json',
    parents: [klasorId],
    appProperties: { [YEDEK_ISARETI.key]: YEDEK_ISARETI.value, olusturma: String(olusturma) }
  };
  const govde =
    `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(bilgi)}\r\n` +
    `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${icerik}\r\n--${sinir}--`;
  const d = await json<{ id: string; name?: string }>(b, `${YUKLE}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${sinir}` },
    body: govde
  });
  return { id: d.id, ad: d.name ?? bilgi.name, olusturma };
}

/** Klasördeki harita yedekleri, yeniden eskiye */
export async function driveYedekleri(b: DriveBaglami, klasorId: string): Promise<DriveYedegi[]> {
  const q = `'${tirnak(klasorId)}' in parents and ${isaretSorgusu(YEDEK_ISARETI)} and trashed=false`;
  const s = await json<{ files?: { id: string; name: string; createdTime?: string; appProperties?: Record<string, string> }[] }>(
    b, `${API}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,appProperties)&orderBy=createdTime desc&pageSize=100&spaces=drive`
  );
  return (s.files ?? [])
    .map(f => ({ id: f.id, ad: f.name, olusturma: Number(f.appProperties?.olusturma) || Date.parse(f.createdTime ?? '') || 0 }))
    .sort((a, c) => c.olusturma - a.olusturma);
}

/** Drive'daki yedeği okur (JSON; harita yedeği mi, çağıran denetler) */
export async function drivedanOku(b: DriveBaglami, dosyaId: string): Promise<unknown> {
  const metin = await (await istek(b, `${API}/${encodeURIComponent(dosyaId)}?alt=media`)).text();
  try { return JSON.parse(metin); } catch { throw new DriveHatasi('diger', 'Drive\'daki dosya okunamadı (bozuk ya da yedek değil).'); }
}

/** Klasörün Drive'daki adresi (Kemal eskileri orada siler) */
export const klasorAdresi = (klasorId: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(klasorId)}`;
