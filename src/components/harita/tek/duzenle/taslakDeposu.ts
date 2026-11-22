import { taslakCoz, taslakYazisi, type TekTaslak } from './taslak';

/**
 * Taslağın saklanması (7. adım). Çalışırken taslak KKM kaydında durur:
 * Firestore `duzada/tekHaritaTaslak` (harita kaydından ayrı, küçük bir belge;
 * `firestoreDeposu.ts`). Belgede yalnız değişiklikler JSON yazı olarak durur
 * (`veri`; iç içe dizi yok, en çok 400 bin harf), sayaçla (`sayac`): açık kalmış
 * eski bir sekme daha yeni taslağın üstüne yazamaz (Kurucu'nun `kurucuSayac`'ı gibi).
 *
 * İki kat güvence (harita kaydı gibi): her yazma önce bu tarayıcıya
 * (localStorage), sonra buluta. Bulut yazılamazsa taslak bu tarayıcıda durur.
 *
 * Kayda kendiliğinden yazan kod yok: yazma yalnız Kemal düzenleme yaptıkça
 * (20 sn biriktirerek) ya da düğmeye basınca olur.
 */

export interface TaslakKaydi { taslak: TekTaslak; sayac: number; guncelleme: number }
export type YazmaSonucu =
  | { durum: 'bulut' }
  | { durum: 'yerel'; neden: 'kural' | 'baglanti' | 'buyuk' | string }
  | { durum: 'cakisma' };

export interface TaslakDeposu {
  /** Ekranda: "KKM kaydı" ya da "deneme (bellekte)" */
  ad: string;
  oku(): Promise<TaslakKaydi | null>;
  /** `sayac`: açılışta (ya da son yazmada) görülen sayaç. Kayıttaki daha büyükse yazmaz */
  yaz(t: TekTaslak, sayac: number): Promise<{ sonuc: YazmaSonucu; sayac: number }>;
}

/** Belgedeki yazının üst sınırı (harf). Taslak büyürse yazılmaz, uyarı çıkar */
export const VERI_SINIRI = 400_000;

export const YEREL_ANAHTAR = 'kems_tek_harita_taslak';

export function yereldenOku(): TaslakKaydi | null {
  try {
    const ham = localStorage.getItem(YEREL_ANAHTAR);
    if (!ham) return null;
    const d = JSON.parse(ham) as { veri?: string; sayac?: number; guncelleme?: number };
    if (typeof d.veri !== 'string') return null;
    return { taslak: taslakCoz(JSON.parse(d.veri)), sayac: Number(d.sayac) || 0, guncelleme: Number(d.guncelleme) || 0 };
  } catch { return null; }
}
export function yereleYaz(veri: string, sayac: number, guncelleme: number) {
  try { localStorage.setItem(YEREL_ANAHTAR, JSON.stringify({ veri, sayac, guncelleme })); } catch { /* dolu */ }
}

/** Deneme sayfası için: bellekte (Google girişi ve Firestore yok) */
export function bellekDeposu(): TaslakDeposu & { yazilanlar: Array<{ bayt: number; sayac: number }> } {
  let kayit: { veri: string; sayac: number; guncelleme: number } | null = null;
  const yazilanlar: Array<{ bayt: number; sayac: number }> = [];
  return {
    ad: 'deneme (bellekte)',
    yazilanlar,
    async oku() { return kayit ? { taslak: taslakCoz(JSON.parse(kayit.veri)), sayac: kayit.sayac, guncelleme: kayit.guncelleme } : null; },
    async yaz(t, sayac) {
      const veri = taslakYazisi(t);
      if (veri.length > VERI_SINIRI) return { sonuc: { durum: 'yerel', neden: 'buyuk' }, sayac };
      if (kayit && kayit.sayac > sayac) return { sonuc: { durum: 'cakisma' }, sayac };
      kayit = { veri, sayac: sayac + 1, guncelleme: Date.now() };
      yazilanlar.push({ bayt: new TextEncoder().encode(veri).length, sayac: kayit.sayac });
      return { sonuc: { durum: 'bulut' }, sayac: kayit.sayac };
    }
  };
}
