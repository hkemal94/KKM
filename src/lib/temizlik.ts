import type { Item } from '../types';

/**
 * Temizlik (29 Eylül). Kemal: "Arka tarafta kullanmadığımız ne varsa sil,
 * arşiv işi beni sinirlendirdi." Kural değişti: kullanılmayan kayıt arşive
 * kalkmaz, silinir. Silmeden önce tam yedek indirilir (Neyin Eksik kartı).
 *
 * Silinecekler:
 *   - arşivdeki bütün kayıtlar (eski viki, eski temalar, kaldırılan sayfalar…)
 *   - onaylanmamış eski öneriler (isProposal), otel simülasyonunun kişileri
 *   - otel simülasyonunun resepsiyon vakaları (oyun verisi vikiye girmez)
 *   - Sürek Şenliği Tertip Komitesi (Kemal: "bunu sil")
 *   - ilk günün örnek verisi (Kamil Efendi, Küçükçetmi Dropu…)
 * Silinmezler: soru cevapları (aday kaydı), not defteri sayfaları,
 * uygulamanın kendi kayıtları (harita ayarı, kanal).
 */

/** Otel simülasyonunun resepsiyon vakaları — karakter değil, oyun verisi */
export const OYUN_VAKA_IDLERI = new Set<string>([
  'kemskoy_guest_erdal',
  'kemskoy_guest_priya',
  'kemskoy_guest_mei',
  'kemskoy_guest_ceren',
  'kemskoy_guest_mehmet',
  'kemskoy_guest_klaus',
  'kemskoy_guest_lena',
  'kemskoy_guest_can',
  'kemskoy_guest_neslihan',
  'kemskoy_guest_osman',
  'kemskoy_guest_cem',
  'kemskoy_guest_hans',
  'kemskoy_guest_yusuf',
  'kemskoy_guest_ahmet',
  'kemskoy_guest_sofia',
  'kemskoy_guest_selim',
  'kemskoy_companion_kerem',
  'kemskoy_companion_ingrid',
]);

const SILINECEK_ADLAR = [/^sürek şenliği tertip komitesi$/i];

/**
 * İlk günün örnek verisi (uygulama kurulurken kendiliğinden yazılan
 * kayıtlar): Kamil Efendi, Küçükçetmi Köy Meydanı, Küçükçetmi Dropu (hazır
 * bir adam fotoğrafıyla), Ege Rüzgarları teması…
 */
const ORNEK_ONEKLERI = [
  'kamil_efendi', 'kucukcetmi_meydan', 'surek_komitesi', 'surek_senligi', 'ege_ruzgarlari',
  'kucukcetmi_drop', 'senlik_tisort', 'kayip_amblemler_post', 'duzada_kitap_proje',
  'duzada_kitap_bolum_1', 'proposal_wiki_amblem'
];

export interface SilmeNedeni { item: Item; neden: string }

/**
 * Kitap bölümü görünen eski otel simülasyonu günleri ve mekanikleri (7 Ekim,
 * Kemal: "kitap bölümü olarak günler görünüyor… hepsi silinsin"). Yalnız
 * simülasyonun bıraktığı izlerle tanınır; adı "Gün 3" olan gerçek bir
 * bölüme dokunulmaz.
 */
const SIMULASYON_ETIKETLERI = ['oyun-tasarimi', 'kemskoy-oyun'];
export function simulasyonKaydi(i: Item): boolean {
  if (i.type !== 'kitap_bolum' && i.type !== 'kitap_proje') return false;
  const m = (i.metadata || {}) as Record<string, unknown>;
  return i.id.startsWith('kemskoy_day_')
    || i.id.startsWith('kemskoy_mech_')
    || i.id === 'kemskoy_game_project'
    || String(m.bookId || '') === 'kemskoy_game_project'
    || (i.tags || []).some(t => SIMULASYON_ETIKETLERI.includes(t))
    || (i.type === 'kitap_bolum' && SIMULASYON_ALANLARI.some(a => a in m));
}

export function silinecekler(items: Item[]): SilmeNedeni[] {
  const cikti: SilmeNedeni[] = [];
  for (const i of items) {
    if (i.type === 'map_settings' || i.type === 'channel') continue;
    if (i.type === 'aday' && !i.archived) continue;
    if ((i.tags || []).includes('gunluk-not') && !i.archived) continue;
    // Merch arşivi kalır (Kemal, 1 Ekim): işi biten droplar ve ürünleri arşive
    // geçer, bir gün devamı gelebilir — silinecekler listesine girmez
    const merchKaydi = i.type === 'drop' || i.type === 'merch_urun';
    if (i.archived && !merchKaydi) cikti.push({ item: i, neden: 'arşivde' });
    else if (i.isProposal) cikti.push({ item: i, neden: 'onaylanmamış eski öneri' });
    else if (simulasyonKaydi(i)) cikti.push({ item: i, neden: 'otel simülasyonu günü' })
    else if (OYUN_VAKA_IDLERI.has(i.id) || /^kemskoy_(guest|companion)_/.test(i.id)) cikti.push({ item: i, neden: 'otel simülasyonu vakası' });
    else if (ORNEK_ONEKLERI.some(o => i.id.startsWith(o))) cikti.push({ item: i, neden: 'ilk günün örnek verisi' });
    else if (SILINECEK_ADLAR.some(r => r.test(i.title.trim()))) cikti.push({ item: i, neden: 'Kemal: sil' });
    // Otel odaları (Kemal, 29 Eylül): tek tek odalar ansiklopedi maddesi değil
    else if (i.type === 'oda') cikti.push({ item: i, neden: 'otel odası' });
  }
  return cikti;
}

/** "312 arşivde · 76 eski öneri · 1 Kemal: sil" */
export function silmeOzeti(liste: SilmeNedeni[]): string {
  const say = new Map<string, number>();
  for (const s of liste) say.set(s.neden, (say.get(s.neden) || 0) + 1);
  return [...say.entries()].map(([n, k]) => `${k} ${n}`).join(' · ');
}

/**
 * Kayıtlarda kalan, kodun artık hiç okumadığı alanlar (2 Ekim gece, Kemal:
 * "kullanılmayan her şeyi sil"). Kayıt durur, yalnız bu alanlar silinir.
 *   - eskiMetin: soru-cevap / W3 / W5 aktarımlarının yedeği (göçler bitti)
 *   - oyunArsivi: otel maddesinde silinen otel simülasyonunun arşivi
 *   - proposalsSeeded: eski öneri sisteminin işareti
 *   - kitap bölümlerindeki otel simülasyonu günleri: resepsiyon vakaları,
 *     doluluk, hava, sabah notu, müdür notu, beklenen çıkışlar
 */
const ESKI_ALANLAR = ['eskiMetin', 'oyunArsivi', 'proposalsSeeded'];
const SIMULASYON_ALANLARI = ['operations', 'occupancy', 'weather', 'morningNote', 'memoText', 'memoFrom', 'expectedCheckouts'];

export interface EskiAlan { item: Item; alanlar: string[] }

export function eskiAlanlar(items: Item[]): EskiAlan[] {
  const cikti: EskiAlan[] = [];
  for (const i of items) {
    // Silinecek simülasyon günlerinin alanı ayrıca silinmez (kayıt gidiyor)
    if (simulasyonKaydi(i)) continue;
    const m = (i.metadata || {}) as Record<string, unknown>;
    const adaylar = i.type === 'kitap_bolum' ? [...ESKI_ALANLAR, ...SIMULASYON_ALANLARI] : ESKI_ALANLAR;
    const alanlar = adaylar.filter(a => a in m);
    if (alanlar.length) cikti.push({ item: i, alanlar });
  }
  return cikti;
}

/** "7 eski metin · 16 otel simülasyonu günü …" */
export function eskiAlanOzeti(liste: EskiAlan[]): string {
  const say = (f: (a: string) => boolean) => liste.filter(e => e.alanlar.some(f)).length;
  return [
    [say(a => a === 'eskiMetin'), 'kayıtta eski metin'],
    [say(a => a === 'oyunArsivi'), 'kayıtta oyun arşivi'],
    [say(a => a === 'proposalsSeeded'), 'kayıtta eski öneri işareti'],
    [say(a => SIMULASYON_ALANLARI.includes(a)), 'kitap bölümünde otel simülasyonu günü']
  ].filter(([n]) => n).map(([n, ad]) => `${n} ${ad}`).join(' · ');
}
