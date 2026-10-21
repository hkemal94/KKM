import type { Item } from '../types';

/**
 * Yol haritası: açık işlerin tek yeri (7 Ekim, Kemal: "açık işlerin tek yeri
 * olsun, ekrandan iş ekleyeyim"). İki kaynak:
 *
 *   - `YOL_HARITASI` (bu dosya): kararlaştırılan paketler. Her PR kendi
 *     paketini `bitti: true` yapar; Kemal birleştirince ekranda "bitti" olur.
 *   - Kemal'in ekrandan eklediği işler: `kkm_ayar` kaydında (`isler`).
 *
 * `paket`: H harita · W viki · M marka · K küçük işler.
 * `kimde`: 'claude' → kodla yapılacak; 'kemal' → Kemal'in kararı ya da işi.
 * `gece`: 7 Ekim planındaki sıra; yoksa "sırası belli değil".
 * `uzak`: şimdilik değil (14 Ekim, Kemal: "benim yapmam gerekenler çok uzak
 * şeyler artık, başka şeyleri önceledik"). Listenin sonunda, kapalı bölümde;
 * "Sıradaki 3 iş"e girmez. Silinmez.
 */
export type PaketKodu = 'H' | 'W' | 'M' | 'K';
export const PAKET_ADLARI: Record<PaketKodu, string> = { H: 'Harita', W: 'Viki', M: 'Marka', K: 'Küçük işler' };

export interface YolIsi {
  id: string; ad: string; paket: PaketKodu; kimde: 'claude' | 'kemal';
  nereden: string; gece?: number; not?: string; bitti?: boolean; uzak?: boolean;
  /** Kemal'in ekrandan eklediği iş */
  kendi?: boolean;
}

export const YOL_HARITASI: YolIsi[] = [
  // 1. gece
  { id: 'yol-haritasi-ekrani', gece: 1, paket: 'K', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Yol haritası: açık işlerin tek yeri, ekrandan iş ekleme' },
  { id: 'gezinme-menu', gece: 1, paket: 'K', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Gezinme ve menü: geri tuşu ve ok, alt çubukta 4 düğme, menü birleştirmeleri, Durum yüzdesi → madde listesi' },
  { id: 'otel-teras', gece: 1, paket: 'H', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Otel: uçurum kenarında ince seyir terası (gerekirse kaide), bahçenin altından geçen yol' },
  // 2. gece
  { id: 'viki-temizligi', gece: 2, paket: 'W', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Viki temizliği: mahalle adlarındaki parantezler, simülasyon günleri, sosyal medya kartları, uydurma sokak adları' },
  { id: 'ev-dokusu', gece: 2, paket: 'H', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Ev dokusu: ilçelerde evler yarıya, arsalar büyük, çakışma yok, hafif Ege düzensizliği' },
  { id: 'pdfler', gece: 2, paket: 'K', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'PDF\'ler: Poppins, Evren Raporu düzeltmesi, oyun PDF\'i, "Yapım Aşaması" açıklaması' },
  // 3. gece
  { id: 'alan-sablonlari', gece: 3, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Alan şablonları, maddeler arası bağlar, takma adlar' },
  { id: 'yeni-dokular', gece: 3, paket: 'H', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Mahalle doldur\'a 4 doku: balıkçı köyü, yamaç teras, sahil şeridi, zeytinlik evleri' },
  { id: 'boyut-hiz', gece: 3, paket: 'K', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Boyut ve hız sayfası: kayıt boyutları, uygulama parçaları, açılış hızı' },
  // 4. gece
  { id: 'madde-onerileri', gece: 4, paket: 'W', kimde: 'claude', nereden: '7 Ekim', bitti: true,
    ad: 'Künyeden ve yazılarından madde önerileri; vikide metinde anılanı tanıma' },
  { id: 'ust-alt-tablo', gece: 4, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Üst–alt madde, sabitleme, maddeler tablo olarak' },
  { id: 'atolye', gece: 4, paket: 'K', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Atölye bölümü: Harita ve Kurucu birlikte' },
  // 5. gece
  { id: 'bag-agi', gece: 5, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true, ad: 'Bağ ağı' },
  { id: 'zaman-cizgisi', gece: 5, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true, ad: 'Evren zaman çizgisi ve dönemler' },
  { id: 'harita-isaretleri', gece: 5, paket: 'H', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Harita: katmanları aç/kapa, serbest not işareti, maddeyi sürükle-bırak' },
  // 6. gece
  { id: 'soy-agaci', gece: 6, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Soy ağacı: aile, iş, arkadaşlık ve rekabet; dönem sürümleri' },
  { id: 'tuval', gece: 6, paket: 'K', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Tuval: mahalle esini, drop panosu, kitap planı' },
  { id: 'alan-gizleme', gece: 6, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Sitede alan bazında gizleme' },
  // 7. gece (8 Ekim, Kemal: "bunu ilk pakete hazırla")
  { id: 'yer-kartlari', gece: 7, paket: 'W', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Yer kartları (cadde, meydan, yer adı, ada), Düzada ve çevre yolu maddeleri, tekrar eden tarihçe ve mahalle bilgilerinin derlenmesi' },
  { id: 'yer-soru-turu', gece: 7, paket: 'W', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Soru turu: yeni kartların (ve Kişi\'nin) künye alanları, bölüm başlıkları, mahalle bölüm sırası' },
  { id: 'yazim', gece: 7, paket: 'W', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Yazım: kitap ve fanzinde metinde tanıma, yazarken yan panel' },
  { id: 'kitap-disa', gece: 7, paket: 'K', kimde: 'claude', nereden: '7 Ekim · vvd', bitti: true,
    ad: 'Kitabı PDF ve EPUB olarak indirme' },
  // 8 Ekim: madde soru turu
  { id: 'madde-soru-turu', paket: 'W', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Madde soru turu: kanondaki 25 yerin maddesi, eski alanların düzeltilmesi (Eksikler → Soru turu kartı)' },
  { id: 'bosluk-soru-turu', paket: 'W', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Boşluk soru turu: sezon, sahibi, yıllar, mahalle; Sade Meyhane; Güney Burnu; boş başlıklar silindi' },
  { id: 'merkez-kavsak', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Merkez dört yol ağzında yeniden kuruldu; ev, arsası ve duvarı tek yapı; 2D\'de arsalar (Eksikler → Harita yenilendi)' },
  { id: 'uzak-gorunum', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Kamera daha uzağa; ada dışı coğrafya (karşı kıyı, Bozcaada, Babakale yönü) ve denizin ayrıntısı' },
  { id: 'plaj-iskele', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Plajlar yaşam alanlarına uzasın, önce İskele Mahallesi' },
  { id: 'hatalar-8-ekim', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Hatalar: Sahil Yolu geri, büyük kayıtlar küçülür, ad değişikliği her yere (Kuzey Plajı), soru turu kartı bitmiyordu' },
  { id: 'ust-uste-yollar', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Kurucu\'da üst üste binen yollar' },
  { id: 'sablonlar', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Kurucu şablonları: evler ve yerleşimler güncel, 3D\'de makul' },
  { id: 'arazi-2d', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: '2D\'de zeytinlik ve tarlalar sınırıyla görünsün' },
  { id: 'stat-2d', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: '2D\'de stat görünsün (3D\'deki gibi)' },
  { id: 'logo-sirasi', paket: 'M', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Markalarda logo sırası: birincil, ikincil, alternatif' },
  { id: 'bag-yakin', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Bağ ağında bağsız maddeler daha yakın' },
  { id: 'dondurmaci-gdd', paket: 'K', kimde: 'claude', nereden: '12 Ekim', bitti: true, ad: 'Dondurmacı Kızlar: Word tasarım belgesi ve ekran görselleri oyun sayfasına (makyaj sonra)' },
  { id: 'oyun-depo-belgesi', paket: 'K', kimde: 'claude', nereden: '14 Ekim', bitti: true, ad: 'Oyunun deposundaki tasarım belgesi oyun sayfasında canlı okunur; Dondurmacı kartı kalktı' },
  { id: 'oyun-yol-haritasi', paket: 'K', kimde: 'claude', nereden: '14 Ekim', bitti: true, ad: 'Oyun sayfasında Yol haritası sekmesi: oyunun deposundaki yol haritası canlı okunur' },
  { id: 'oyun-ayarlar', paket: 'K', kimde: 'claude', nereden: '15 Ekim', bitti: true, ad: 'Oyun sayfasında Ayarlar sekmesi: oyunun bütün fiyat, süre ve oranları; "Oyuna gönder" oyunun deposunda PR açar' },
  { id: 'gece-urun-tekrar', paket: 'K', kimde: 'claude', nereden: '14 Ekim', bitti: true, ad: 'Gece önerilerinde aynı ürün bir daha önerilmez' },
  { id: 'oyun-makyaj', paket: 'K', kimde: 'claude', nereden: '12 Ekim', gece: 4, bitti: true, ad: 'Oyun sayfasının makyajı: küçük kutular, sıkışan yazılar' },
  { id: 'liman-plaj', paket: 'H', kimde: 'claude', nereden: '8 Ekim', gece: 4, ad: 'Liman kıyısına kumsal şeridi' },
  { id: 'kayit-uyarisi', paket: 'K', kimde: 'claude', nereden: '12 Ekim', gece: 4, ad: 'Kayıt sunucuya ulaşmazsa ekranda uyarı; kartlar "Yazılıyor…"da takılı kalmasın', not: '12 Ekim\'de Dondurmacı kartının yazısı uyarısız kayboldu (yazma sınırı).' },
  { id: 'galeri-disari', paket: 'K', kimde: 'claude', nereden: '8 Ekim', gece: 4, ad: 'Galeri görselleri kayıtların dışına: kayıtlar küçülür, yazma sınırı geç dolar', not: 'Büyük iş; önce plan gösterilir.' },
  { id: 'bag-kurali', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Bağ türleri madde türüne özel; mükerrer maddeler birleşir (Küçükçetmi Çiftliği)' },
  { id: 'toplu-bag', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Bağ ağında toplu seçim: birçok maddeyi tek seferde bir maddeye (mahalleye) bağla' },
  { id: 'atolye-giris', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Atölye\'de önce başlangıç ekranı, harita sonra' },
  { id: 'denetim', paket: 'K', kimde: 'claude', nereden: '8 Ekim', bitti: true, ad: 'Büyük entegrasyon ve hız denetimi' },
  { id: 'logolar', paket: 'M', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Kemal\'in Canva logoları (KKM Logo, 12 sayfa, şeffaf PNG) ilgili marka ve viki maddelerine',
    not: 'Cevaplar docs/soru-cevap/logolar.md: Birlik Zeytin ve Birlik Birası kooperatifin ürünleri (1994 marka yılı), köpek Küçükçetmi Sürek Kulübü\'nün. Kemal Canva indirme iznini açınca.' },
  { id: 'otel-merdiven', paket: 'H', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Otel: Sahil Merdiveni, kum cebi ve tahta iskele haritada (görsel: Galeri → The Imperial Kemskoy)' },
  { id: 'mahalle-derleme-elle', paket: 'W', kimde: 'claude', nereden: '8 Ekim', bitti: true,
    ad: 'Mahalle derlemesi (Claude, 8 Ekim yedeğinden): Merkez, Liman, İskele, Çiftlik — Eksikler kartı' },
  { id: 'kisi-aile', paket: 'W', kimde: 'claude', nereden: '21 Ekim', bitti: true,
    ad: 'Kişi künyesi ve aile: Adı / Soyadı / Doğumdaki soyadı, evlenen kişi iki ailede görünür, eşi iki yönde, zaman çizgisinde yalnız açılış' },
  // sırası belli değil
  { id: 'teknik-foy', uzak: true, paket: 'M', ad: 'Ürünlere teknik föy (tech pack): ölçü tablosu, malzeme, renk, etiket', nereden: '1 Ekim', kimde: 'kemal', not: 'Kemal isterse; 3B stüdyo kaldırıldı (1 Ekim gece).' },
  { id: 'yardimci', paket: 'K', ad: 'Yardımcı erişimi: düzenler ama silemez', nereden: 'yapisal-2, 26', kimde: 'claude', not: 'İhtiyaç olunca.' },
  { id: 'buffer', uzak: true, paket: 'M', ad: 'Sosyal medyada Buffer bağlantısı (ücretli plan)', nereden: '1 Ekim', kimde: 'kemal', not: 'Kemal planı alınca bağlantı kurulur.' },
  { id: 'site-ingilizce', paket: 'K', ad: 'Sitenin İngilizcesi', nereden: 'yapisal-4, 19', kimde: 'claude', not: 'Yayından sonra.' },
  { id: 'site-adres', uzak: true, paket: 'K', ad: 'Kendi adrese taşıma (kems.company)', nereden: 'yapisal-2, 1', kimde: 'kemal', not: 'Şimdilik Google\'da (1 Ekim).' },
  { id: 'magaza', paket: 'M', ad: 'Mağaza: Shopify (sitedeki Dükkân bağlanır)', nereden: '1 Ekim', kimde: 'claude', not: 'Karar verildi; sırası gelince.' },
  { id: 'ikinci-drop', uzak: true, paket: 'M', ad: 'İkinci drop', nereden: 'yapisal-2, 9', kimde: 'kemal', not: 'Henüz erken (1 Ekim).' },
  { id: 'sokak-adlari', uzak: true, paket: 'H', ad: 'Sokak adları (şimdilik numara)', nereden: 'yapisal-2, 21', kimde: 'kemal' },
  { id: 'kitap', uzak: true, paket: 'W', ad: 'Kitap', nereden: 'yapisal-2, 29', kimde: 'kemal', not: 'Bekliyor (1 Ekim).' },
  { id: 'metin-soru-turu', uzak: true, paket: 'W', ad: 'Mahalle Tarihçeleri, Merkez Çarşı, Liman Deniz Feneri, Stadyum Dirlik Stadı: iskeletten stüdyo taslağı', nereden: '1 Ekim', kimde: 'kemal', not: 'Yapay zekâ → Mahalle metinleri: tek basışta 8 öneri; Kemal düzeltip ekler.' },
  { id: 'dirlik-forma', uzak: true, paket: 'M', ad: 'Dirlik forması: Merch\'te Dirlik kurumu altında Konsept ürün', nereden: '1 Ekim', kimde: 'kemal' },
  { id: 'ciftlik-yeri', uzak: true, paket: 'H', ad: 'Küçükçetmi Çiftliği\'ni Kurucuda yerleştirmek (yol temizliğinden sonra)', nereden: '1 Ekim', kimde: 'kemal' },
  { id: 'ibareler', uzak: true, paket: 'M', ad: 'İngilizce / Türkçe ibareler', nereden: 'yapisal-2, 14', kimde: 'kemal', not: 'Sonra (1 Ekim).' },
];

/** Kemal'in ekrandan eklediği iş (kkm_ayar → isler) */
export interface KendiIsi { id: string; ad: string; paket: PaketKodu; kimde: 'claude' | 'kemal'; eklendi: number; not?: string }

/** Bütün işler: plan + Kemal'in ekledikleri; bitenler işaretli */
export function butunIsler(a: KkmAyari): YolIsi[] {
  const kendi: YolIsi[] = a.isler.map(i => ({
    id: i.id, ad: i.ad, paket: i.paket, kimde: i.kimde, kendi: true,
    nereden: new Date(i.eklendi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }),
    ...(i.not ? { not: i.not } : {})
  }));
  return [...YOL_HARITASI, ...kendi].map(i => (a.bitenler.includes(i.id) ? { ...i, bitti: true } : i));
}

/** Açık işler, sırayla: önce gecesi olanlar, sonra gerisi, en sonda uzaklar */
export const acikIsler = (a: KkmAyari) => {
  const acik = butunIsler(a).filter(i => !i.bitti);
  const yakin = acik.filter(i => !i.uzak);
  return [...yakin.filter(i => i.gece).sort((x, y) => x.gece! - y.gece!), ...yakin.filter(i => !i.gece), ...acik.filter(i => i.uzak)];
};

// ---------------------------------------------------------------- KKM ayarı

export const KKM_AYAR_TURU = 'kkm_ayar' as const;

export interface KkmAyari {
  /** Durum hedefleri, yüzde (künye, kitap, harita, bosluk) */
  hedefler: Record<string, number>;
  /** Yol haritasında Kemal'in "tamam" dediği işler */
  bitenler: string[];
  /** Kemal'in ekrandan eklediği işler */
  isler: KendiIsi[];
}

export const kkmKaydi = (items: Item[]) => items.find(i => i.type === KKM_AYAR_TURU) || null;
export const kkmAyari = (items: Item[]): KkmAyari => {
  const m = (kkmKaydi(items)?.metadata || {}) as Partial<KkmAyari>;
  return {
    hedefler: { ...(m.hedefler || {}) },
    bitenler: Array.isArray(m.bitenler) ? m.bitenler : [],
    isler: Array.isArray(m.isler) ? m.isler : []
  };
};

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;
export function kkmAyariniYaz(items: Item[], a: KkmAyari): { guncel?: Item; yeni?: YeniKayit } {
  const k = kkmKaydi(items);
  // Firestore undefined kabul etmez: boş not alanı kayda girmez
  const isler = a.isler.map(i => ({ id: i.id, ad: i.ad, paket: i.paket, kimde: i.kimde, eklendi: i.eklendi, ...(i.not ? { not: i.not } : {}) }));
  const metadata = { hedefler: a.hedefler, bitenler: a.bitenler, isler };
  if (k) return { guncel: { ...k, metadata: { ...(k.metadata || {}), ...metadata }, updatedAt: Date.now() } };
  return {
    yeni: {
      title: 'KKM ayarları', area: 'komuta', type: KKM_AYAR_TURU, status: 'Planlandı', priority: 'düşük',
      tags: ['kkm'], links: [], notes: '', images: [], isProposal: false, archived: false, metadata
    }
  };
}

// ---------------------------------------------------------------- haftalık özet

/**
 * Haftalık özet (yapisal-2, 28). Kemal'in kendi Gmail'inden: uygulama metni
 * hazırlar, "Gmail'de aç" Kemal'in hesabında yeni ileti açar; gönderen Kemal.
 * Uydurma sayı yok: sayılar kayıtların son 7 gündeki değişiminden.
 */
export function haftalikOzet(items: Item[], simdi = Date.now()): { konu: string; metin: string } {
  const hafta = simdi - 7 * 86_400_000;
  const canli = items.filter(i => !i.archived && !i.isProposal);
  const degisen = canli.filter(i => i.updatedAt >= hafta);
  const yeni = canli.filter(i => i.createdAt >= hafta);
  const say = (t: string[]) => degisen.filter(i => t.includes(i.type));
  const VIKI = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay', 'ürün'];
  const satir = (ad: string, l: Item[]) => (l.length ? `• ${ad}: ${l.length} (${l.slice(0, 5).map(i => i.title).join(', ')}${l.length > 5 ? '…' : ''})` : '');
  const bekleyen = canli.filter(i => i.type === 'aday').length;
  const tarih = new Date(simdi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const metin = [
    `Kems Komuta Merkezi · haftalık özet (${tarih})`,
    '',
    'Son 7 günde değişenler:',
    satir('Viki maddesi', say(VIKI)),
    satir('Merch (drop, ürün)', say(['drop', 'merch_urun'])),
    satir('Yazı', say(['blog_post', 'kitap_bolum'])),
    satir('Sosyal medya gönderisi', say(['sosyal_gonderi'])),
    `• Yeni kayıt: ${yeni.filter(i => i.type !== 'aday').length}`,
    `• Öneri tepsisinde bekleyen: ${bekleyen}`,
    '',
    'Açık işler (yol haritası, ilk üç):',
    ...acikIsler(kkmAyari(items)).slice(0, 3).map(i => `• ${i.ad}`)
  ].filter(s => s !== '').join('\n');
  return { konu: `KKM haftalık özet · ${tarih}`, metin };
}

/** Kemal'in Gmail'inde yeni ileti (kendine) */
export const gmailBaglantisi = (eposta: string, konu: string, metin: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(eposta)}&su=${encodeURIComponent(konu)}&body=${encodeURIComponent(metin)}`;
