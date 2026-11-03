// Aramada iki yan bu katlamayla karşılaştırılır: Türkçe küçük harf, sonra ı → i.
// Böylece "iskele" ↔ "İskele" ve "imperial" ↔ "Imperial" birbirini bulur.
export const aramaKatla = (metin: string): string =>
  metin.toLocaleLowerCase('tr').replace(/ı/g, 'i');
