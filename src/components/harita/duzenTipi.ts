/**
 * Eski harita kaydının biçimi (`duzada/haritaDuzeni`; H1'den 23 Kasım'a dek).
 *
 * Eski üç harita ve Kurucu 23 Kasım'da silindi (tek harita 11. adım). Kayıt
 * yalnız Harita yedeği kartı, Drive'a harita yedeği, eski bir genel yedeğin
 * geri yüklenmesi ve evde oturanların göç kartı için okunur; tek harita onu
 * okumaz. Tipler o işler için duruyor.
 */

/** Nokta: [boylam, enlem] */
export type Nokta = [number, number];
/** Hat kimliği → noktalar */
export type SinirHatlari = Record<string, Nokta[]>;

/** Bir mekânın elle yapılmış düzeltmesi (H3): yalnız değişen alanlar */
export interface MekanKaydi {
  yeni?: boolean;
  ad?: string;
  tur?: string;
  konum?: [number, number];
  silindi?: boolean;
  mahalle?: string | null;
  wikiId?: string | null;
  taban?: number;
  yukseklik?: number;
  yaricap?: number;
}

export type MekanDuzeni = Record<string, MekanKaydi>;

/**
 * Kurucu taslağı. Noktalar düz dizi: [boylam0, enlem0, boylam1, enlem1, …]
 * (Firestore iç içe dizi kabul etmiyor).
 */
export interface KurucuBelge {
  surum: number;
  yeniYollar: Record<string, { tur: string; n: number[] }>;
  turDegisikligi: Record<string, string>;
  gizlenen: string[];
  yeniBinalar?: Record<string, { tur: string; x: number; y: number; en: number; boy: number; aci: number; kat?: number }>;
  ozelYapilar?: Record<string, { n: number[]; kat: number; cati: string; kalip?: string }>;
  doga?: Record<string, { tur: string; n: number[] }>;
  /** Yapı → viki maddesi bağı */
  baglar?: Record<string, string>;
  /** Evde oturanlar: ev kimliği → kişi maddelerinin kimlikleri (göç kartı okur) */
  oturanlar?: Record<string, string[]>;
  yolDuzeni?: Record<string, Record<string, number[]>>;
  binaDuzeni?: Record<string, { dx: number; dy: number; aci: number; kat?: number; tur?: string }>;
}

export interface HaritaDuzeni {
  surum: number;
  /** ms cinsinden son değişiklik zamanı */
  guncelleme: number;
  hatlar: SinirHatlari;
  yollar: SinirHatlari;
  mekanlar?: MekanDuzeni;
  /** Kurucu taslağı */
  kurucu?: KurucuBelge;
  /** Kurucu'nun haritaya işlenmiş hâli */
  kurucuIslenen?: KurucuBelge;
  /** Kurucu yazma sayacı (18 Kasım): geri yükleme bir artırır */
  kurucuSayac?: number;
  /** Ada kuşağı (18 Kasım): yoksa 2 */
  adaKusagi?: number;
}

/** Kayda yazacak işin yazacağı yeni sayaç: kayıttakinin bir fazlası */
export const sonrakiKurucuSayaci = (d: { kurucuSayac?: number } | null | undefined): number =>
  (Number.isFinite(Number(d?.kurucuSayac)) ? Math.max(0, Math.floor(Number(d?.kurucuSayac))) : 0) + 1;
