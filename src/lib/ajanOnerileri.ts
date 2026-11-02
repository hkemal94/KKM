import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaDosyaYaz } from './tepsiAjansa';
import { prAdresi } from './isler';
import type { OnayKaydi } from './onaylar';

/**
 * Onaylı yazma (2 Kasım, yol haritası 5. adım; Kemal: "ajanlar KKM'ye
 * yazabilsin, ama yalnız onayladığım öneriyi").
 *
 * Ajanların işi (merch, içerik, oyun, kod, video) Kems'in ön elemesinden
 * geçince ajansın gizli deposunda `kkm/oneriler.json`'a bir satır olur
 * (Kemal: PR'sız güncellenir). KKM → Onay bekleyenler bu satırları ortak
 * düğmelerle gösterir. Kemal'in kararı aynı depoda `kkm/oneri-kararlari.json`'a
 * yazılır; Kems sonraki çalışmasında okur ve gereğini yapar (düzenle notuna
 * göre revize, arşiv, sil).
 *
 * KKM kayıtlarına bu dosya hiçbir şey yazmaz. Tek dış etki: PR olan bir işte
 * Kemal "Uygula"ya basıp "emin misin"e evet derse PR, tarayıcıdaki GitHub
 * anahtarıyla birleştirilir (Kemal, 2 Kasım: "KKM'den birleştirsin").
 */

export const ONERILER_YOLU = 'kkm/oneriler.json';
export const ONERI_KARARLARI_YOLU = 'kkm/oneri-kararlari.json';

/** pr: GitHub PR'ı · dosya: ajans deposunda dosya · drive: Drive belgesi · eksik: eksik yetenek */
export type OneriTuru = 'pr' | 'dosya' | 'drive' | 'eksik';

export interface AjanOnerisi {
  id: string;
  /** Ajan dosyasının adı (ör. merch-konseptcisi) ya da "Kems" */
  ajan: string;
  tur: OneriTuru;
  baslik: string;
  ozet?: string;
  /** PR, dosya ya da belge bağlantısı */
  baglanti?: string;
  /** ISO */
  tarih: string;
}

export type OneriKararDurumu = 'uygula' | 'duzenle' | 'arsiv' | 'bekle' | 'silindi';

export interface OneriKarari {
  durum: OneriKararDurumu;
  /** Bekletmede listeye döneceği gün (YYYY-AA-GG) */
  tarih?: string;
  not?: string;
  secenekler?: string[];
  /** ms */
  zaman: number;
  /** Uygula sonucu (ör. "PR birleşti") */
  sonuc?: string;
}

export const TUR_ETIKETI: Record<OneriTuru, string> = { pr: 'PR', dosya: 'DOSYA', drive: 'DRIVE', eksik: 'EKSİK YETENEK' };

const TURLER = new Set<OneriTuru>(['pr', 'dosya', 'drive', 'eksik']);
const KARAR_DURUMLARI = new Set<OneriKararDurumu>(['uygula', 'duzenle', 'arsiv', 'bekle', 'silindi']);

export const ajanAnahtari = (id: string) => `ajan:${id}`;

async function jsonOku<T>(anahtar: string, yol: string): Promise<T | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}`);
    return JSON.parse(base64Coz(d.content)) as T;
  } catch (e) {
    if (e instanceof Error && /yazma izni yok/.test(e.message)) return null; // dosya henüz yok (404)
    throw e;
  }
}

/** Ajanların önerileri; bozuk satırlar atlanır, dosya yoksa boş */
export async function onerileriOku(anahtar: string): Promise<AjanOnerisi[]> {
  const j = await jsonOku<{ oneriler?: unknown[] }>(anahtar, ONERILER_YOLU);
  return (Array.isArray(j?.oneriler) ? j!.oneriler : [])
    .filter((o): o is AjanOnerisi => !!o && typeof (o as AjanOnerisi).id === 'string' && typeof (o as AjanOnerisi).baslik === 'string')
    .map(o => ({ ...o, ajan: o.ajan || 'Kems', tur: TURLER.has(o.tur) ? o.tur : 'dosya', tarih: o.tarih || '' }));
}

/** Kemal'in verdiği kararlar (öneri kimliğine göre); bozuklar atlanır */
export async function kararlariOku(anahtar: string): Promise<Record<string, OneriKarari>> {
  const j = await jsonOku<{ kararlar?: Record<string, Partial<OneriKarari>> }>(anahtar, ONERI_KARARLARI_YOLU);
  const sonuc: Record<string, OneriKarari> = {};
  for (const [id, k] of Object.entries(j?.kararlar || {})) {
    if (!k || !KARAR_DURUMLARI.has(k.durum as OneriKararDurumu)) continue;
    sonuc[id] = {
      durum: k.durum as OneriKararDurumu, zaman: Number(k.zaman) || 0,
      ...(typeof k.tarih === 'string' ? { tarih: k.tarih } : {}),
      ...(typeof k.not === 'string' && k.not ? { not: k.not } : {}),
      ...(Array.isArray(k.secenekler) && k.secenekler.length ? { secenekler: k.secenekler.filter(s => typeof s === 'string') } : {}),
      ...(typeof k.sonuc === 'string' ? { sonuc: k.sonuc } : {}),
    };
  }
  return sonuc;
}

/**
 * Kararları ajansın deposuna yazar (yalnız Kemal bir düğmeye basınca).
 * Dosya yazmadan hemen önce yeniden okunur ki Kems'in arada sildikleri geri gelmesin.
 * `null` o önerinin kararını kaldırır (listeye geri al). Yeni kararları döner.
 */
export async function kararYaz(anahtar: string, degisim: Record<string, OneriKarari | null>): Promise<Record<string, OneriKarari>> {
  const kararlar = await kararlariOku(anahtar);
  for (const [id, k] of Object.entries(degisim)) {
    if (k) kararlar[id] = k;
    else delete kararlar[id];
  }
  const dosya = {
    _aciklama: "Kemal'in ajan önerilerine verdiği kararlar. KKM → Onay bekleyenler'de düğmeye basınca yazılır. Kems okur: uygula = onaylandı, duzenle = nota göre revize, arsiv = beklesin, bekle = tarihe kadar beklesin, silindi = istenmiyor.",
    guncellendi: new Date().toISOString(),
    kararlar
  };
  const sayi = Object.keys(degisim).length;
  await ajansaDosyaYaz(anahtar, ONERI_KARARLARI_YOLU, `${JSON.stringify(dosya, null, 2)}\n`, `KKM: ${sayi} öneriye Kemal'in kararı`, 'karar');
  return kararlar;
}

/** Karar → Onay bekleyenler'in görünüm bilgisi (uygulanan da silinen gibi listeden kalkar) */
export function onayKaydinaCevir(k: OneriKarari): OnayKaydi {
  return {
    durum: k.durum === 'uygula' ? 'silindi' : k.durum, zaman: k.zaman,
    ...(k.tarih ? { tarih: k.tarih } : {}), ...(k.not ? { not: k.not } : {}), ...(k.secenekler ? { secenekler: k.secenekler } : {}),
  };
}

/**
 * PR'ı birleştirir (Kemal "Uygula"ya basıp onaylayınca). Birleşmişse
 * yeniden denemez. Sonucu yazı olarak döner.
 */
export async function prBirlestir(anahtar: string, baglanti: string): Promise<string> {
  const p = prAdresi(baglanti);
  if (!p) throw new Error('PR bağlantısı okunamadı');
  const yol = `/repos/${p.sahip}/${p.depo}/pulls/${p.no}`;
  const d = await github<{ merged?: boolean; state?: string; mergeable?: boolean | null }>(anahtar, yol);
  if (d.merged) return `PR #${p.no} zaten birleşmiş`;
  if (d.state === 'closed') throw new Error(`PR #${p.no} kapatılmış; birleştirilemez`);
  if (d.mergeable === false) throw new Error(`PR #${p.no} çakışıyor; ajans düzeltmeli (Düzenle ile not bırak)`);
  try {
    await github(anahtar, `${yol}/merge`, { method: 'PUT', govde: {} });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/405/.test(m)) throw new Error(`PR #${p.no} şu an birleştirilemiyor (denetimler bitmemiş olabilir); biraz sonra yeniden dene`);
    if (/yazma izni yok/.test(m)) throw new Error(`anahtarın ${p.depo} deposunda PR birleştirme izni yok (Contents ve Pull requests: Read and write)`);
    throw e;
  }
  return `PR #${p.no} birleşti`;
}
