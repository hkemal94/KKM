/**
 * Tek haritanın toplam üçgen sınırı (25 Kasım, Kemal: "Imperial, Sürek ve belediye için orta ayrıntılı sürüm,
 * bütçe tek tavana bağlansın"). Eskiden yapılar, ağaçlar ve bahçeler ayrı ayrı sınırlanıyordu; toplam normal
 * modda 2 milyonu geçebiliyordu. Şimdi bütün katlar (zemin, yol, bahçe, yapı, ağaç, liman) bu tavanı paylaşır:
 * - Yapı modelleri, öbür katların üçgeninden ve ağaçlara bırakılan paydan (`AGAC_PAYI`) kalanı kullanır
 *   (`yapiKatmani.ts` → `guncelle`). Pay dolunca uzaktaki yapılar önce hafif sürüme (`HAFIF_SURUMLER`), o da
 *   sığmazsa uzak kopyaya düşer.
 * - Ağaçlar kalanı kullanır (`agacKatmani.ts` → `sahneToplam` bu tavandır).
 * Yapıların uzak kopyaları tavana sayılmaz (sayaç adanın bütün karolarını sayar, ekranda yalnız görünenler çizilir;
 * normal modda ~200 bin).
 * Bütün değerler DENEME (Kemal onaylamadı; telefonda ölçülmedi).
 */
export const TOPLAM_SINIR = { normal: 1_600_000, hafif: 400_000 };

/** Yapı modelleri seçilirken ağaçlara bırakılan pay (DENEME) */
export const AGAC_PAYI = { normal: 400_000, hafif: 60_000 };

/** Tavan dolu olsa da yapı modellerine kalan en az pay: en yakın birkaç yapı modeliyle görünsün (DENEME) */
export const YAPI_EN_AZ = { normal: 120_000, hafif: 40_000 };

/**
 * Orta ayrıntılı hafif sürümler (25 Kasım): asıl modelin parçaları sadeleştirildi (meshoptimizer; adlar, renkler
 * ve taban kutusu aynı). Uzakta (`ORTA_UZAKLIK`), hafif modda ya da tavan dolunca bu sürüm çizilir.
 * The Imperial 89 bin → 14 bin üçgen (834 → 158 KB), Sürek Kulübü 35 bin → 10 bin (448 → 131 KB),
 * belediye 34 bin → 7 bin (340 → 80 KB).
 */
export const HAFIF_SURUMLER: Record<string, string> = {
  'binalar/the-imperial-kemskoy.glb': 'binalar/the-imperial-kemskoy-hafif.glb',
  'binalar/kucukcetmi-surek-kulubu.glb': 'binalar/kucukcetmi-surek-kulubu-hafif.glb',
  'binalar/belediye.glb': 'binalar/belediye-hafif.glb'
};

/** Bakılan yerden bu kadar (m) uzaktaki yapı hafif sürümüyle çizilir (DENEME) */
export const ORTA_UZAKLIK = 450;
