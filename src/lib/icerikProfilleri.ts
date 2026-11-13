import { base64Coz, github, GithubHatasi } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaDosyaYaz } from './tepsiAjansa';
import { istekEkle } from './kemalIstekleri';

/**
 * İçerik → Profiller (12 Kasım, Kemal: "kanallar öncesi markalar veya profil
 * olması gerekmez mi; Eylül Altunkaya'ya basınca videolar, insta gönderileri
 * kategorize edilebilir"). İş akışı planıyla aynı sıra: profil → kanallar →
 * Fikir · Taslak · Hazır · Paylaşıldı panosu (Benim ekranlarım: "İçerik aşama
 * panosu"; Kemal'in taslağı: kanallar hesap sahibine göre).
 *
 * Tek dosya, ajansın gizli deposunda `kkm/icerik.json`. Ajan yeni fikri
 * oraya yazar (Kems, gece turunda); Kemal KKM'den aşamayı değiştirir,
 * siler ya da fikir ekler. Taslağa alınan fikir için ajansa istek gider
 * (`kkm/istekler.json`). KKM kayıtlarına hiçbir şey yazılmaz.
 * Şimdilik iki profil (Kemal: "şimdilik bunlar olsun, test için").
 */

export const ICERIK_YOLU = 'kkm/icerik.json';

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'x' | 'threads';
export type IcerikTuru = 'video' | 'short' | 'gonderi' | 'hikaye';
export type Asama = 'fikir' | 'taslak' | 'hazir' | 'paylasildi';

export interface Kanal { platform: Platform; hesap: string; adres?: string; acik: boolean }
export interface Profil { id: string; ad: string; /** marka kartının kimliği (Marka ve merch) */ marka?: string; kanallar: Kanal[] }
export interface Icerik {
  id: string;
  profil: string;
  tur: IcerikTuru;
  kanallar: Platform[];
  baslik: string;
  ozet?: string;
  asama: Asama;
  /** kim getirdi: ajan dosyası adı ya da 'kemal' */
  kaynak?: string;
  /** taslak, senaryo, Drive klasörü… */
  baglanti?: string;
  tarih: string;
  guncellendi?: string;
}
export interface IcerikDosyasi { profiller: Profil[]; icerikler: Icerik[] }

export const PLATFORM_ADI: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', x: 'X', threads: 'Threads' };
export const TUR_ADI: Record<IcerikTuru, string> = { video: 'Video', short: 'Short / Reels', gonderi: 'Gönderi', hikaye: 'Hikâye' };
export const ASAMALAR: Array<{ id: Asama; ad: string }> = [
  { id: 'fikir', ad: 'Fikir' }, { id: 'taslak', ad: 'Taslak' }, { id: 'hazir', ad: 'Hazır' }, { id: 'paylasildi', ad: 'Paylaşıldı' }
];

/** Dosya yoksa: açık kanallar (docs/kaynak-haritasi.md), açılacaklar kapalı */
export const VARSAYILAN: IcerikDosyasi = {
  profiller: [
    {
      id: 'kems-company', ad: 'Kems Company', marka: 'kems_company', kanallar: [
        { platform: 'instagram', hesap: '@kemscompany', adres: 'https://www.instagram.com/kemscompany', acik: true },
        { platform: 'x', hesap: '@kemscompany', adres: 'https://x.com/kemscompany', acik: true },
        { platform: 'tiktok', hesap: '@kemscompany', acik: false },
        { platform: 'youtube', hesap: 'Kems Company', acik: false },
        { platform: 'threads', hesap: '@kemscompany', acik: false },
      ]
    },
    {
      id: 'eylul-altunkaya', ad: 'Eylül Altunkaya', kanallar: [
        { platform: 'youtube', hesap: 'Eylül Altunkaya', acik: true },
        { platform: 'tiktok', hesap: '@eylul.altunkaya', adres: 'https://www.tiktok.com/@eylul.altunkaya', acik: true },
      ]
    },
  ],
  icerikler: [],
};

export async function icerikOku(anahtar: string): Promise<IcerikDosyasi> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${ICERIK_YOLU}`);
    const j = JSON.parse(base64Coz(d.content)) as Partial<IcerikDosyasi>;
    return {
      profiller: Array.isArray(j.profiller) && j.profiller.length ? j.profiller : VARSAYILAN.profiller,
      icerikler: Array.isArray(j.icerikler) ? j.icerikler.filter(i => i && typeof i.id === 'string' && typeof i.baslik === 'string') : [],
    };
  } catch (e) {
    // Yalnız dosya gerçekten yoksa varsayılan; başka hatada yazma yapılmasın diye hata (13 Kasım, Kod Bakımcısı)
    if (e instanceof GithubHatasi && e.durum === 404) return VARSAYILAN;
    throw e;
  }
}

function yaz(anahtar: string, d: IcerikDosyasi, mesaj: string) {
  const dosya = {
    _aciklama: "İçerik profilleri ve aşama panosu (KKM → İçerik → Profiller). Ajan yeni fikri 'fikir' aşamasında ekler; Kemal KKM'den aşamayı değiştirir ya da siler. Aşamalar: fikir · taslak · hazir · paylasildi.",
    guncellendi: new Date().toISOString(),
    ...d,
  };
  return ajansaDosyaYaz(anahtar, ICERIK_YOLU, `${JSON.stringify(dosya, null, 2)}\n`, mesaj, 'içerik');
}

/** Güncel dosyayı okuyup değiştirir (başkası arada yazdıysa onun üstüne) */
export async function icerikDegistir(anahtar: string, mesaj: string, f: (d: IcerikDosyasi) => IcerikDosyasi): Promise<IcerikDosyasi> {
  const yeni = f(await icerikOku(anahtar));
  await yaz(anahtar, yeni, mesaj);
  return yeni;
}

/**
 * Aşama değişir. Taslağa alınınca ajansa istek gider: Video Yapımcısı
 * (video, short) ya da Sosyal Medya Yapımcısı (gönderi, hikâye) taslağını
 * hazırlar; sonuç Onay bekleyenler'e ve kartın bağlantısına gelir.
 */
export async function asamaDegistir(anahtar: string, ic: Icerik, asama: Asama, profilAdi: string): Promise<IcerikDosyasi> {
  const d = await icerikDegistir(anahtar, `KKM içerik: "${ic.baslik}" → ${asama}`, x => ({
    ...x, icerikler: x.icerikler.map(i => (i.id === ic.id ? { ...i, asama, guncellendi: new Date().toISOString() } : i)),
  }));
  if (asama === 'taslak' && ic.asama === 'fikir') {
    const ajan = ic.tur === 'video' || ic.tur === 'short' ? 'video-yapimcisi' : 'sosyal-medya-yapimcisi';
    await istekEkle(anahtar, {
      tur: 'istek', ekran: 'İçerik', ajan,
      metin: `${profilAdi} · ${TUR_ADI[ic.tur]} (${ic.kanallar.map(k => PLATFORM_ADI[k]).join(', ')}): "${ic.baslik}" taslağa alındı. Taslağını hazırla (video için senaryo iskeleti, başlık, kapak yazısı; gönderi için görsel ve metin). İçerik kimliği: ${ic.id}`,
    });
  }
  return d;
}

export function yeniIcerikKimligi(): string { return `ic-${Date.now().toString(36)}` }
