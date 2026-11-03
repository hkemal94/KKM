import type { Item } from '../types';
import { KKM_AYAR_TURU, kkmKaydi } from './yolHaritasi';

/**
 * Onay bekleyenler'in ortak düğmeleri (2 Kasım, Kemal'in yeni yerleşimi,
 * 3. adım): Uygula · Düzenle · Arşivle · Sil, tarihe kadar bekletme, toplu
 * seçim.
 *
 * Bu dosya yalnız saf işler yapar. Bir satırın arşivde mi, bekletilmiş mi,
 * düzenleme notu var mı bilgisi `kkm_ayar` kaydında (`onaylar`) durur ve
 * yalnız Kemal bir düğmeye basınca yazılır. Kayıt yoksa her şey listededir.
 *
 * Anahtarlar: `oneri:<kayıt>` (öneri tepsisi), `is:<iş>:<ad>` (tek seferlik
 * iş; ad sayıyı taşıdığı için yeni iş çıkınca satır yeniden görünür),
 * `karar:<dosya tarihi>` (ajansın kararları; yeni dosya yeniden görünür).
 *
 * Düzenleme notları ajansa "Tepsiyi ajansa gönder" ile gider (`tepsiAjansa.ts`
 * → `onaylar`); ajans notlara göre revize eder.
 */

export type OnayDurumu = 'bekle' | 'arsiv' | 'duzenle' | 'silindi';

export interface OnayKaydi {
  durum: OnayDurumu;
  /** Bekletmede listeye döneceği gün (YYYY-AA-GG) */
  tarih?: string;
  /** Düzenle: Kemal'in notu */
  not?: string;
  /** Düzenle: hazır seçeneklerden seçilenler */
  secenekler?: string[];
  /** Yazıldığı an (ms) */
  zaman: number;
}

/** ajansta: Düzenle notuyla ajansa geri verildi (3 Kasım); yeni hâli gelene kadar listede değil */
export type Gorunum = 'liste' | 'bekletilen' | 'arsiv' | 'ajansta' | 'gizli';

/** Düzenle'deki hazır seçenekler */
export const HAZIR_SECENEKLER = ['Daha kısa', 'Daha sade', 'Kanona daha sadık', 'Başka seçenekler getir', 'Yeniden dene'] as const;

/**
 * "Ajansa yolla" (3 Kasım, Kemal): not yazmadan "olduğu gibi yeniden yap".
 * Düzenle'nin yazdığı kaydın aynısı (`durum: 'duzenle'`) bu hazır notla yazılır;
 * ajans (Kems) onu Düzenle notu gibi okur, ayrı bir şey bilmesi gerekmez.
 */
export const AJANSA_YOLLA_NOTU = 'Ajansa yolla: olduğu gibi yeniden yap';

/** Bugünün tarihi (YYYY-AA-GG, yerel saat) */
export function bugun(simdi = new Date()): string {
  const y = simdi.getFullYear(), a = String(simdi.getMonth() + 1).padStart(2, '0'), g = String(simdi.getDate()).padStart(2, '0');
  return `${y}-${a}-${g}`;
}

/** `gun` güne `n` gün ekler (YYYY-AA-GG) */
export function gunEkle(gun: string, n: number): string {
  const [y, a, g] = gun.split('-').map(Number);
  return bugun(new Date(y, a - 1, g + n));
}

const DURUMLAR = new Set<OnayDurumu>(['bekle', 'arsiv', 'duzenle', 'silindi']);

/** `kkm_ayar` kaydındaki onay bilgileri (bozuk olanlar atlanır) */
export function onayKayitlari(items: Item[]): Record<string, OnayKaydi> {
  const ham = (kkmKaydi(items)?.metadata?.onaylar || {}) as Record<string, Partial<OnayKaydi>>;
  const sonuc: Record<string, OnayKaydi> = {};
  for (const [k, v] of Object.entries(ham)) {
    if (!v || !DURUMLAR.has(v.durum as OnayDurumu)) continue;
    sonuc[k] = {
      durum: v.durum as OnayDurumu, zaman: Number(v.zaman) || 0,
      ...(typeof v.tarih === 'string' ? { tarih: v.tarih } : {}),
      ...(typeof v.not === 'string' && v.not ? { not: v.not } : {}),
      ...(Array.isArray(v.secenekler) && v.secenekler.length ? { secenekler: v.secenekler.filter(s => typeof s === 'string') } : {}),
    };
  }
  return sonuc;
}

/** Satır nerede görünür: listede, bekletilenlerde, arşivde, ajansta ya da hiç */
export function gorunum(kayit: OnayKaydi | undefined, gun = bugun()): Gorunum {
  if (!kayit) return 'liste';
  if (kayit.durum === 'arsiv') return 'arsiv';
  if (kayit.durum === 'silindi') return 'gizli';
  // Tarihi gelen bekletme kendiliğinden listeye döner (kayıt değişmez)
  if (kayit.durum === 'bekle') return kayit.tarih && kayit.tarih > gun ? 'bekletilen' : 'liste';
  if (kayit.durum === 'duzenle') return 'ajansta';
  return 'liste';
}

export const oneriAnahtari = (id: string) => `oneri:${id}`;

/** Listede görünen öneriler (bekletilen, arşivdeki ve ajanstakiler hariç); zil bunu sayar */
export function listedekiOneriler(items: Item[], adaylar: Item[]): Item[] {
  const k = onayKayitlari(items);
  if (!Object.keys(k).length) return adaylar;
  const gun = bugun();
  return adaylar.filter(a => gorunum(k[oneriAnahtari(a.id)], gun) === 'liste');
}

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/**
 * Onay bilgilerini değiştirir: `degisim` içinde `null` olan anahtar silinir.
 * `gecerli` verilirse ona uymayan anahtarların (silinmiş öneri gibi) eski
 * bilgileri de temizlenir. Kaydın öbür alanlarına dokunmaz; kayıt
 * yoksa yeni açar. Firestore `undefined` kabul etmez: boş alan yazılmaz.
 */
export function onaylariYaz(items: Item[], degisim: Record<string, OnayKaydi | null>, gecerli?: (anahtar: string) => boolean): { guncel?: Item; yeni?: YeniKayit } {
  const onaylar: Record<string, OnayKaydi> = {};
  for (const [k, v] of Object.entries(onayKayitlari(items))) {
    if (gecerli && !gecerli(k)) continue;
    onaylar[k] = v;
  }
  for (const [k, v] of Object.entries(degisim)) {
    if (v) onaylar[k] = temiz(v);
    else delete onaylar[k];
  }
  const k = kkmKaydi(items);
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), onaylar }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: KKM_AYAR_TURU, status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false,
      metadata: { onaylar }
    }
  };
}

function temiz(v: OnayKaydi): OnayKaydi {
  return {
    durum: v.durum, zaman: v.zaman,
    ...(v.tarih ? { tarih: v.tarih } : {}),
    ...(v.not?.trim() ? { not: v.not.trim() } : {}),
    ...(v.secenekler?.length ? { secenekler: [...v.secenekler] } : {}),
  };
}

/** "5 Kasım" gibi kısa tarih */
export function tarihYaz(gun: string): string {
  const [y, a, g] = gun.split('-').map(Number);
  return new Date(y, a - 1, g).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
