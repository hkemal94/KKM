/**
 * Site yönetiminde kayıt yazılamayınca çıkan yazı (22 Ekim, Kemal: "zaman-asimi
 * gibi anlaşılmaz"). Ham hata kodunu sade Türkçeye çevirir.
 */
export function siteHatasiniSadelestir(e: unknown): string {
  let metin = e instanceof Error ? e.message : String(e);
  // firebase.ts hatayı JSON olarak sarıyor; içindeki asıl yazıyı al
  try {
    const j = JSON.parse(metin) as { error?: unknown };
    if (typeof j?.error === 'string') metin = j.error;
  } catch { /* düz yazı */ }
  if (/oturum-yok/.test(metin)) return 'Google ile bağlı değilsin. Önce "Google ile bağlan" de, sonra yeniden dene.';
  if (/zaman-asimi/.test(metin)) return 'Sunucuya ulaşılamadı (bağlantı kopmuş ya da veritabanının günlük yazma sınırı dolmuş olabilir). Tarayıcı göndermeyi denemeye devam ediyor; sayfayı yenileme.';
  if (/quota|resource.?exhausted/i.test(metin)) return 'Veritabanının günlük yazma sınırı doldu. Sınır her gün Türkiye saatiyle 10:00\'da sıfırlanır.';
  if (/maximum allowed size|exceeds the maximum|too large|1 ?MB|1048576|cok-buyuk/i.test(metin)) return 'Kayıt çok büyük (1 MB sınırı). Durum → Eksikler → "Büyük kayıtlar" kartıyla görselleri küçült.';
  if (/permission|izin|unauthenticated/i.test(metin)) return 'Bu hesapla yazma izni yok. Google ile yeniden bağlanmayı dene.';
  if (/unavailable|network|offline|failed to fetch/i.test(metin)) return 'Bağlantı yok. İnternetini kontrol edip yeniden dene.';
  return 'Sunucu yazmayı kabul etmedi.';
}
