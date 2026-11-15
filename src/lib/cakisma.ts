/**
 * Ajansın deposuna yazarken çakışma (15 Kasım, Kemal: makbuz yazılamıyordu).
 *
 * Ajans her gün `kkm/*.json` dosyalarını ana dala yazıyor. KKM bir dosyayı
 * okuyup yazana kadar ana dal ilerlerse GitHub reddeder:
 *   - 409 "is at … but expected …": dal ya da dosya bu arada değişti.
 *   - 422: verilen sürüm (sha) eski; yeni dosyada ise aynı adda dosya var.
 * Çözüm: dosyanın güncel hâli yeniden okunur, yazılacak içerik o hâlin
 * üstüne yeniden kurulur ve birkaç kez daha denenir. Eski içerikle ezilmez.
 *
 * Saf iş: ağ yok; okuma, yazma ve bekleme dışarıdan verilir (deneme kolay olsun).
 */

/** Çakışmada kaç kez daha denensin ve aralarda kaç ms beklensin */
export const CAKISMA_DENEME = 3;
export const CAKISMA_BEKLE = 1500;

export const bekle = (ms: number) => new Promise<void>(c => setTimeout(c, ms));

/** GitHub hatasının kodu (GithubHatasi.durum); yoksa null */
const durumu = (e: unknown): number | null => {
  const d = (e as { durum?: unknown } | null)?.durum;
  return typeof d === 'number' ? d : null;
};

/** Dosya ya da dal bu arada değişti mi (yeniden okuyup denemeye değer mi) */
export function cakismaMi(e: unknown): boolean {
  const d = durumu(e);
  return d === 409 || d === 422;
}

/** "kkm/uygulananlar/15-11-2026-101500.json", 2 → "kkm/uygulananlar/15-11-2026-101500-2.json" */
export function ekliYol(yol: string, n: number): string {
  if (n < 2) return yol;
  const nokta = yol.lastIndexOf('.');
  const bolu = yol.lastIndexOf('/');
  return nokta > bolu + 1 ? `${yol.slice(0, nokta)}-${n}${yol.slice(nokta)}` : `${yol}-${n}`;
}

export interface Secenek { deneme?: number; beklemeMs?: number; bekle?: (ms: number) => Promise<void> }

/**
 * Var olan (ya da henüz olmayan) bir dosyanın yerine yazar: her denemede önce
 * `oku` güncel hâli getirir (sha ve içerik), `yaz` onun üstüne yazar.
 * Çakışmada (409 / 422) en çok `deneme` kez daha dener; başka hata ya da
 * son deneme de çakışırsa hatayı olduğu gibi fırlatır (ekrandaki uyarı kalır).
 */
export async function guncelHaleYaz<H, S>(oku: () => Promise<H>, yaz: (hal: H) => Promise<S>, s: Secenek = {}): Promise<S> {
  const enCok = s.deneme ?? CAKISMA_DENEME;
  const ms = s.beklemeMs ?? CAKISMA_BEKLE;
  const uyu = s.bekle ?? bekle;
  for (let deneme = 0; ; deneme++) {
    const hal = await oku();
    try {
      return await yaz(hal);
    } catch (e) {
      if (!cakismaMi(e) || deneme >= enCok) throw e;
      await uyu(ms * (deneme + 1));
    }
  }
}

/**
 * Yeni dosya açar (makbuz gibi; sha gerekmez). 409 gelirse dal bu arada
 * ilerlemiştir: aynı adla yeniden dener. 422 gelirse o adda dosya vardır:
 * adın sonuna -2, -3 … ekler. Başka hata olduğu gibi fırlar.
 */
export async function yeniDosyaYaz<S>(yol: string, yaz: (yol: string) => Promise<S>, s: Secenek & { adDeneme?: number } = {}): Promise<S> {
  const enCok = s.deneme ?? CAKISMA_DENEME;
  const ms = s.beklemeMs ?? CAKISMA_BEKLE;
  const uyu = s.bekle ?? bekle;
  const adSiniri = s.adDeneme ?? 20;
  let n = 1;
  for (let deneme = 0; ; ) {
    try {
      return await yaz(ekliYol(yol, n));
    } catch (e) {
      const d = durumu(e);
      if (d === 422 && n < adSiniri) { n++; continue; }
      if (d !== 409 || deneme >= enCok) throw e;
      await uyu(ms * (++deneme));
    }
  }
}
