/**
 * Ürünlerin tech pack'leri (teknik föy), Canva'da (15 Kasım, Kemal: "proje
 * belgesi + KKM"). Bağlantı burada, kodun verisinde durur; kayda yazılmaz.
 * Anahtar ürünün KKM'deki adı (büyük-küçük harf önemsiz). Yeni ürünün tech
 * pack'i şablonun kopyası olarak açılınca buraya bir satır eklenir.
 * Şablon: Canva DAHa755XcHA.
 */
export const TEKNIK_FOYLER: Record<string, { ad: string; adres: string }> = {
  // Basics 1: 9 ürün, aynı standart (16 Kasım, Kemal: "her ürüne ayrı tech pack").
  // Son dördün adı çalışma adıdır; ürün adı Kemal'in.
  // 15 Kasım, Kemal: üç ürün daha (12). Eşofman altı ve atkının adı çalışma adıdır.
  'basic tee': { ad: 'Tech pack · Basic Tee', adres: 'https://www.canva.com/design/DAHa8J9cO1c/view' },
  'basic hoodie': { ad: 'Tech pack · Basic Hoodie', adres: 'https://www.canva.com/design/DAHa71mrInM/view' },
  'basic sweatshirt': { ad: 'Tech pack · Basic Sweatshirt', adres: 'https://www.canva.com/design/DAHa8C0d2FQ/view' },
  "basic's hat": { ad: 'Tech pack · Basic\'s Hat', adres: 'https://www.canva.com/design/DAHa_OKB8U8/view' },
  "basic's socks pack": { ad: 'Tech pack · Basic\'s Socks Pack', adres: 'https://www.canva.com/design/DAHa_NIVQZk/view' },
  'yarım fermuarlı sweatshirt': { ad: 'Tech pack · Yarım fermuarlı sweatshirt', adres: 'https://www.canva.com/design/DAHa8CnV_YU/view' },
  'kolej montu': { ad: 'Tech pack · Kolej montu', adres: 'https://www.canva.com/design/DAHa8NZezhQ/view' },
  'bez çanta': { ad: 'Tech pack · Bez çanta', adres: 'https://www.canva.com/design/DAHa_MhArQI/view' },
  'rüzgârlık': { ad: 'Tech pack · Rüzgârlık', adres: 'https://www.canva.com/design/DAHa_B0vxQc/view' }, // kiremit #F26B6F
  'basic bomber': { ad: 'Tech pack · Basic Bomber', adres: 'https://www.canva.com/design/DAHbAsws39w/view' }, // sessiz bej #BBA591
  'eşofman altı': { ad: 'Tech pack · Eşofman altı', adres: 'https://www.canva.com/design/DAHbAvLLL1E/view' }, // düz paça
  'atkı': { ad: 'Tech pack · Atkı', adres: 'https://www.canva.com/design/DAHbAlzWrsk/view' }, // lacivert-krem
};

export const teknikFoy = (urunAdi: string) => TEKNIK_FOYLER[(urunAdi || '').trim().toLocaleLowerCase('tr')];
