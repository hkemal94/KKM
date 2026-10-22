/**
 * Sayfa açılış sayacı (22 Ekim, Kemal: "evet, eklensin"). Hangi sayfayı
 * gerçekten ne kadar açtığını görmek için. YALNIZ bu tarayıcıda (localStorage)
 * tutulur; veritabanına, Firestore'a hiçbir şey yazılmaz, kota harcamaz.
 * Sayfa değişince sayaç artar; aynı sayfada yeniden çizimde artmaz.
 */

const ANAHTAR = 'kems_sayfa_sayaci';

export interface SayacDurumu { ilk: number | null; sayilar: Record<string, number> }

export const SAYFA_ADLARI: Record<string, string> = {
  komuta: 'Ana sayfa', duzada: 'Viki', atolye: 'Atölye', markalar: 'Markalar', merch: 'Merch', yazi: 'Yazı',
  oyun: 'Oyun', durum: 'Durum', studyo: 'Yapay zekâ', sosyal: 'Sosyal medya', site: 'Site'
};
export const DURUM_SEKME_ADLARI: Record<string, string> = {
  yuzdeler: 'Yüzdeler', eksikler: 'Eksikler', bosluklar: 'Boşluklar', takvim: 'Takvim',
  yolharitasi: 'Yol haritası', ajans: 'Ajans', boyut: 'Boyut ve hız'
};

export function sayaciOku(): SayacDurumu {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (!ham) return { ilk: null, sayilar: {} };
    const j = JSON.parse(ham) as Partial<SayacDurumu>;
    const sayilar: Record<string, number> = {};
    for (const [k, v] of Object.entries(j.sayilar || {})) if (typeof v === 'number' && v > 0) sayilar[k] = v;
    return { ilk: typeof j.ilk === 'number' ? j.ilk : null, sayilar };
  } catch {
    return { ilk: null, sayilar: {} };
  }
}

/** Bir sayfa açılınca çağrılır; ad sayfanın okunur adıdır ("Durum · Ajans" gibi) */
export function sayfaAcildi(ad: string): void {
  try {
    const d = sayaciOku();
    d.sayilar[ad] = (d.sayilar[ad] || 0) + 1;
    localStorage.setItem(ANAHTAR, JSON.stringify({ ilk: d.ilk ?? Date.now(), sayilar: d.sayilar }));
  } catch { /* gizli pencerede yazılamayabilir; sayaç sessizce durur */ }
}

export function sayaciSifirla(): void {
  try { localStorage.removeItem(ANAHTAR); } catch { /* yok */ }
}

/** En çok açılandan aza */
export const siraliSayilar = (d: SayacDurumu): Array<{ ad: string; sayi: number }> =>
  Object.entries(d.sayilar).map(([ad, sayi]) => ({ ad, sayi })).sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'));
