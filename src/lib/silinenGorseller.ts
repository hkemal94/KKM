/**
 * Depodan silinen görseller (4 Kasım, Kemal: "Tamamen sil"): public/galeri/canva
 * ve public/galeri/oyun klasörleri kalktı. Eski kayıtlarda bu adresler durabilir
 * (ör. Dondurmacı Kızlar'ın vitrini); ekranda kırık resim yerine "görsel yok"
 * görünsün diye bu adresler yok sayılır. Kayda bir şey yazmaz.
 */
export const silinenGorselMi = (adres: unknown): boolean =>
  typeof adres === 'string' && /(^|\/)galeri\/(canva|oyun)\//.test(adres);

/** Listeden silinmiş adresleri ayıklar */
export const yasayanGorseller = (liste: string[] | undefined): string[] =>
  (liste || []).filter(g => !silinenGorselMi(g));
