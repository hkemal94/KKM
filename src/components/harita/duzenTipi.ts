import type { SinirHatlari } from './sinirBolgeleri';

/**
 * Harita düzeni kaydının biçimi (H1).
 *
 * Ayrı dosyada, çünkü uygulamanın ana paketi bunu okuyor; `duzenKatmani`
 * ise 1 MB'lık harita verisini içeri çekiyor ve yalnızca harita sekmesi
 * açılınca yüklenmeli.
 *
 * Sonraki paketler bu kayda alan ekleyecek (H3 mekânlar, H5 gizlenen
 * yapılar). `surum` bunun için var.
 */
export const DUZEN_SURUMU = 2; // 2: yeni koordinat (39,60 K · 25,85 D) — koordinatGocu.ts

/**
 * Kurucu kaydının hangi harita üretimine göre yapıldığı (KurucuBelge.surum).
 * 2: 8 Ekim — Merkez dört yol ağzında yeniden kuruldu, evler arsalarıyla
 * yeniden dizildi. 1 olan kayıttaki ev taşımaları eski evlere aitti; Kemal
 * 8 Ekim'de "Uyarla" kartıyla temizledi (kart ve kodu denetimde silindi).
 */
export const HARITA_KUSAGI = 2;

/**
 * Bir mekânın elle yapılmış düzeltmesi (H3).
 *
 * İki ayrı işi görür:
 *   - üreteçten gelen bir yapının taşınması, adının değişmesi, silinmesi
 *   - haritaya elle eklenen yeni bir mekân (`yeni: true`)
 *
 * Yalnız değişen alanlar yazılır; dokunulmayanlar üreteçten gelmeye devam
 * eder. Böylece `gen/duzada.py` yeniden çalıştığında elle yapılan iş durur.
 */
export interface MekanKaydi {
  /** Üretilmiş bir yapının düzeltmesi değil, elle eklenmiş mekân */
  yeni?: boolean;
  ad?: string;
  tur?: string;
  /** Taşındıysa tabanın yeni merkezi — [boylam, enlem] */
  konum?: [number, number];
  /** Haritadan kaldırıldı. Üretilmiş yapı silinmez, gizlenir. */
  silindi?: boolean;
  /** Konumdan bulunan mahalle — bilgi amaçlı, wiki eşleşmesi için */
  mahalle?: string | null;
  wikiId?: string | null;
  /** Yeni mekânlar: taban kotu ve kat yüksekliği (metre) */
  taban?: number;
  yukseklik?: number;
  /** Yeni mekânlar: taban kenarının yarısı (derece) */
  yaricap?: number;
}

export type MekanDuzeni = Record<string, MekanKaydi>;

/**
 * Kurucu taslağı (şehir kurucu, 1. adım). Haritayı değiştirmez; "Haritaya
 * işle" gelene kadar yalnız saklanır. Ayrıntı: `kurucu/kurucuTipi.ts`.
 * Noktalar düz dizi: [boylam0, enlem0, boylam1, enlem1, …].
 */
export interface KurucuBelge {
  surum: number;
  yeniYollar: Record<string, { tur: string; n: number[] }>;
  turDegisikligi: Record<string, string>;
  gizlenen: string[];
  /** Kurucuda konan binalar (2. adım). Eski kayıtlarda yok. x/y: boylam/enlem */
  yeniBinalar?: Record<string, { tur: string; x: number; y: number; en: number; boy: number; aci: number; kat?: number }>;
  /**
   * Özel yapılar (H, 29 Eylül): köşe köşe çizilen ya da anıt kalıbından
   * konan yapı. n: düz köşe dizisi [b0, e0, b1, e1…], kat, çatı, kalıp.
   */
  ozelYapilar?: Record<string, { n: number[]; kat: number; cati: string; kalip?: string }>;
  /** Doğa alanları: zeytinlik, orman, kumsal. n: düz köşe dizisi */
  doga?: Record<string, { tur: string; n: number[] }>;
  /** Yapı → viki maddesi bağı (haritadan gelen ya da Kurucu'da konan yapı) */
  baglar?: Record<string, string>;
  /**
   * Evde oturanlar (3 Kasım, Kemal): ev kimliği → kişi maddelerinin
   * kimlikleri. Kurucu'da ya da 3B haritadaki ev kartında Kemal seçer.
   * Yalnız bağdır; "Haritaya işle" beklemez, harita taslaktan okur.
   */
  oturanlar?: Record<string, string[]>;
  /**
   * Haritadan gelen yolun yeni hâli (30 Eylül): noktası taşındı ya da bir
   * parçası silindi. Parça sırası → düz nokta dizisi [b0, e0, b1, e1…].
   * (Firestore iç içe dizi kabul etmiyor; parçalar nesne anahtarıyla.)
   */
  yolDuzeni?: Record<string, Record<string, number[]>>;
  /**
   * Haritadan gelen yapının düzeltmesi (30 Eylül): taşıma (dx, dy metre,
   * doğuya / güneye), döndürme (aci, radyan), kat ve tür.
   */
  binaDuzeni?: Record<string, { dx: number; dy: number; aci: number; kat?: number; tur?: string }>;
}

export interface HaritaDuzeni {
  surum: number;
  /** ms cinsinden son değişiklik zamanı */
  guncelleme: number;
  /** Sınır hatları — yalnız üreteçten farklı olanların kontrol noktaları */
  hatlar: SinirHatlari;
  /** Yollar — yalnız üreteçten farklı olanların kontrol noktaları */
  yollar: SinirHatlari;
  /**
   * Mekânlar (H3). Eski kayıtlarda yok — okurken boş kabul edilir, bu yüzden
   * isteğe bağlı. Firestore kuralı yalnız ilk dört alanın varlığına bakıyor,
   * bu alan kuralı bozmuyor.
   */
  mekanlar?: MekanDuzeni;
  /** Kurucu taslağı. Eski kayıtlarda yok. */
  kurucu?: KurucuBelge;
  /**
   * Kurucu'da "Haritaya işle"ye basıldığı andaki taslak (3. adım). Harita
   * bunu üretilmiş verinin üstüne bindirir. Önceki hâl, basışta Düzada
   * kayıtlarına arşivli bir "Harita arşivi" maddesi olarak kalkar.
   */
  kurucuIslenen?: KurucuBelge;
  /**
   * Yalnız bellekte: belge eski koordinattan (surum 1) okunup çevrildi,
   * kalıcı yazım bekliyor. Firestore'a yazılmaz.
   */
  eskiKoordinat?: boolean;
}
