/**
 * Ürünlerin tech pack'leri (teknik föy), Canva'da (15 Kasım, Kemal: "proje
 * belgesi + KKM"). Bağlantı burada, kodun verisinde durur; kayda yazılmaz.
 * Anahtar ürünün KKM'deki adı (büyük-küçük harf önemsiz). Yeni ürünün tech
 * pack'i şablonun kopyası olarak açılınca buraya bir satır eklenir.
 * Şablon: Canva DAHa755XcHA.
 */
export const TEKNIK_FOYLER: Record<string, { ad: string; adres: string }> = {
  'basic hoodie': { ad: 'Tech pack · Basic Hoodie (örnek)', adres: 'https://www.canva.com/d/ywTYpQkuAk6nQS5' },
};

export const teknikFoy = (urunAdi: string) => TEKNIK_FOYLER[(urunAdi || '').trim().toLocaleLowerCase('tr')];
