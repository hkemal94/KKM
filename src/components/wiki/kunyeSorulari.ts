/**
 * Künye alanları — her madde türünün kısa künyesi ve Boşluklar'daki sorular.
 *
 * 29 Eylül 2026 (Kemal): "Boşluklar kısmında sorduğun sorular çok spesifik
 * ve biraz alakasız" ve "daha kompakt bir künye, diğer bilgiler sayfa
 * kısmında". Eski liste bir rol yapma şablonundan kalmaydı (gizli sırlar,
 * gizlilik derecesi, nadirlik, gizli ipuçları…). Yeni liste adanın
 * kanonuna uygun, kısa ve somut alanlardan oluşur; künyede yalnız bunlar
 * görünür, künye satırlarının kalanı sayfada "Bilgiler" bölümüne iner.
 *
 * Eski alanlara yazılmış değerler kaybolmaz: `ESKI_ALAN_ADLARI` ile
 * okunur adlarıyla "Bilgiler" bölümünde görünmeye devam eder.
 *
 * Sorular sayı istemez (uydurma sayı yok) ve "şu an" demez (vikinin
 * şimdisi yok).
 */

export interface KunyeSorusu {
  id: string;
  label: string;
  question: string;
  fieldPath: string;
  /** Çoğu maddede boş kalır (ör. kızlık soyadı): Boşluklar'da sorulmaz, doluluk yüzdesine girmez */
  istegeBagli?: boolean;
  /** Künye satırlarında bu alanın başka adları ("Branşlar" → Faaliyet) */
  esAdlar?: string[];
}

export const DEFAULT_QUESTIONS_BY_CAT: Record<string, KunyeSorusu[]> = {
  kisi: [
    { id: 'title', label: 'Ad', question: 'Kişinin adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Hayatı', question: 'Kişinin hayatı (sayfa metni).', fieldPath: 'notes' },
    // Ad ve soyadı (21 Ekim): evli kadında iki soyadı yan yana, "Zeynep Kaya Yılmaz"
    { id: 'adi', label: 'Adı', question: 'Kişinin adı (soyadsız).', fieldPath: 'metadata.profile.adi' },
    { id: 'soyadi', label: 'Soyadı', question: 'Kişinin soyadı. Evli kadında şimdi kullandığı soyadı.', fieldPath: 'metadata.profile.soyadi' },
    { id: 'dogumSoyadi', label: 'Doğumdaki soyadı', question: 'Evlenip soyadı değiştiyse doğumdaki (kızlık) soyadı. Değişmediyse boş kalır.', fieldPath: 'metadata.profile.dogumSoyadi', istegeBagli: true },
    { id: 'profession', label: 'Rol', question: 'Adada ne iş yapar?', fieldPath: 'metadata.profile.profession', esAdlar: ['Meslek', 'Görev'] },
    { id: 'region', label: 'Mahalle', question: 'Hangi mahallede yaşar?', fieldPath: 'metadata.region' },
    { id: 'workplace', label: 'Çalıştığı yer', question: 'Hangi mekânda ya da kurumda çalışır?', fieldPath: 'metadata.profile.workplace' },
    { id: 'origin', label: 'Köken', question: 'Adalı mı, sonradan mı geldi? Nereden?', fieldPath: 'metadata.profile.origin', esAdlar: ['Nereli', 'Uyruk'] },
    // Soy ağacı (6. gece): o yılda yaşayanlar süzülür
    { id: 'yasam', label: 'Yaşam', question: 'Hangi yıllar arasında yaşadı? (aralık olarak: 1920–1987)', fieldPath: 'metadata.profile.yasam' },
    // Kişi ↔ Aile (yapisal-4, 26): aile sayfasında üyeler buradan listelenir
    { id: 'aile', label: 'Aile', question: 'Hangi aileden?', fieldPath: 'metadata.profile.aile' },
    // Evlenip başka aileye geçen kişi iki ailenin sayfasında da görünür (21 Ekim)
    { id: 'dogumAilesi', label: 'Doğduğu aile', question: 'Evlenerek başka aileye geçtiyse doğduğu aile.', fieldPath: 'metadata.profile.dogumAilesi', istegeBagli: true },
    // Soru turu (8 Ekim): evi bir cadde ya da meydana bağlanabilir
    { id: 'evi', label: 'Evi', question: 'Hangi evde, hangi sokakta oturur?', fieldPath: 'metadata.profile.evi' }
  ],
  // Aile (yapisal-2, 19; yapisal-4, 26–27). Üyeler kişilerin "Aile" alanından gelir.
  aile: [
    { id: 'title', label: 'Ad', question: 'Ailenin adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Ailenin tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'region', label: 'Mahalle', question: 'Hangi mahallede?', fieldPath: 'metadata.region' },
    { id: 'ugras', label: 'Uğraş', question: 'Aile ne iş yapar? (zeytincilik, balıkçılık…)', fieldPath: 'metadata.profile.ugras' },
    { id: 'mekanlar', label: 'Bağlı mekânlar', question: 'Hangi mekânlarla bağlı?', fieldPath: 'metadata.profile.mekanlar' },
    { id: 'kisiler', label: 'Bağlı kişiler', question: 'Aileden olmayan ama bağlı kişiler?', fieldPath: 'metadata.profile.kisiler' },
    { id: 'gelis', label: 'Adaya geliş', question: 'Adaya ne zaman, nereden geldi? (aralık olarak)', fieldPath: 'metadata.profile.gelis', esAdlar: ['Geliş'] }
  ],
  mekan: [
    { id: 'title', label: 'Ad', question: 'Mekânın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Mekânın tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'shopType', label: 'Tür', question: 'Ne tür bir yer? (meyhane, dükkân, fener…)', fieldPath: 'metadata.profile.shopType' },
    { id: 'region', label: 'Mahalle', question: 'Hangi mahallede?', fieldPath: 'metadata.region' },
    { id: 'faaliyet', label: 'Faaliyette', question: 'Hangi yıllardan beri? (aralık olarak: 1954–)', fieldPath: 'metadata.faaliyet' },
    { id: 'manager', label: 'Sahibi', question: 'Kim işletiyor ya da kimin?', fieldPath: 'metadata.profile.manager', esAdlar: ['İşleten', 'Sorumlu'] },
    { id: 'season', label: 'Sezon', question: 'Yıl boyu mu açık, yalnız yazın mı?', fieldPath: 'metadata.profile.season' }
  ],
  marka: [
    { id: 'title', label: 'Ad', question: 'Kurumun ya da markanın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'founded', label: 'Kuruluş', question: 'Ne zaman kuruldu? (yıl ya da aralık)', fieldPath: 'metadata.profile.founded' },
    { id: 'region', label: 'Yeri', question: 'Adada nerede? (mahalle)', fieldPath: 'metadata.region' },
    { id: 'field', label: 'Faaliyet', question: 'Ne yapar? (futbol, sürek, zeytinyağı…)', fieldPath: 'metadata.profile.field', esAdlar: ['Branşlar', 'Branş', 'Faaliyet alanı'] },
    { id: 'leader', label: 'Kurucu', question: 'Kim kurdu, kim yönetir?', fieldPath: 'metadata.profile.leader', esAdlar: ['Yönetim', 'Kurucu aile'] },
    { id: 'colors', label: 'Renkler', question: 'Renkleri neler? (renk kodlarıyla)', fieldPath: 'metadata.profile.colors', esAdlar: ['Renk'] }
  ],
  olay: [
    { id: 'title', label: 'Ad', question: 'Olayın ya da şenliğin adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Anlatım', question: 'Olayın anlatımı (sayfa metni).', fieldPath: 'notes' },
    { id: 'date', label: 'Tarih', question: 'Ne zaman? (yıl, ay ya da mevsim)', fieldPath: 'metadata.date' },
    { id: 'recurrence', label: 'Tekrar', question: 'Her yıl mı, tek seferlik mi?', fieldPath: 'metadata.recurrence' },
    { id: 'region', label: 'Yer', question: 'Adanın neresinde?', fieldPath: 'metadata.region' },
    { id: 'manager', label: 'Katılanlar', question: 'Kimler katılır ya da düzenler?', fieldPath: 'metadata.profile.manager' }
  ],
  urun: [
    { id: 'title', label: 'Ad', question: 'Eşyanın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Anlatım', question: 'Eşyanın anlatımı (sayfa metni).', fieldPath: 'notes' },
    { id: 'material', label: 'Malzeme', question: 'Neden yapılmış?', fieldPath: 'metadata.profile.material' },
    { id: 'owner', label: 'Kimin', question: 'Kime ait, nerede durur?', fieldPath: 'metadata.profile.owner' }
  ],
  oda: [
    { id: 'title', label: 'Oda', question: 'Oda numarası.', fieldPath: 'title' },
    { id: 'notes', label: 'Anlatım', question: 'Odanın anlatımı (sayfa metni).', fieldPath: 'notes' },
    { id: 'floor', label: 'Kat', question: 'Hangi katta?', fieldPath: 'metadata.profile.floor' },
    { id: 'roomType', label: 'Tip', question: 'Ne tür bir oda? (standart, suit…)', fieldPath: 'metadata.profile.roomType', esAdlar: ['Oda tipi'] }
  ],
  yer: [
    { id: 'title', label: 'Ad', question: 'Mahallenin adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Mahallenin tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'konum', label: 'Konum', question: 'Adanın hangi tarafında?', fieldPath: 'metadata.profile.konum' },
    { id: 'komsular', label: 'Sınır komşuları', question: 'Hangi mahallelerle komşu?', fieldPath: 'metadata.profile.komsular' },
    { id: 'landmarks', label: 'Simgeler', question: 'Mahallenin simge yapıları neler?', fieldPath: 'metadata.profile.landmarks' },
    { id: 'sakinler', label: 'Sakinler', question: 'Kimler yaşar?', fieldPath: 'metadata.profile.sakinler' }
  ],
  // Yeni yer kartları (8 Ekim). Alanlar Kemal'in soru turundaki seçimi.
  cadde: [
    { id: 'title', label: 'Ad', question: 'Caddenin ya da sokağın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Caddenin tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'region', label: 'Mahalleler', question: 'Hangi mahallelerden geçer?', fieldPath: 'metadata.region' },
    { id: 'uzerindekiler', label: 'Üstündekiler', question: 'Üstünde hangi mekânlar var?', fieldPath: 'metadata.profile.uzerindekiler' }
  ],
  meydan: [
    { id: 'title', label: 'Ad', question: 'Meydanın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Tarihçe', question: 'Meydanın tarihçesi (sayfa metni).', fieldPath: 'notes' },
    { id: 'region', label: 'Mahalle', question: 'Hangi mahallede?', fieldPath: 'metadata.region' },
    { id: 'cevresi', label: 'Çevresindekiler', question: 'Çevresinde hangi yapılar var?', fieldPath: 'metadata.profile.cevresi' }
  ],
  yer_adi: [
    { id: 'title', label: 'Ad', question: 'Yerin adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Anlatım', question: 'Yerin anlatımı (sayfa metni).', fieldPath: 'notes' },
    { id: 'yerTuru', label: 'Tür', question: 'Ne tür bir yer? (tepe, burun, koy, plaj, dere…)', fieldPath: 'metadata.profile.yerTuru' },
    { id: 'region', label: 'Mahalle', question: 'Hangi mahallede ya da yakınında?', fieldPath: 'metadata.region' },
    { id: 'adinKokeni', label: 'Adın kökeni', question: 'Bu adı nereden aldı?', fieldPath: 'metadata.profile.adinKokeni' }
  ],
  ada: [
    { id: 'title', label: 'Ad', question: 'Adanın adı.', fieldPath: 'title' },
    { id: 'notes', label: 'Genel bakış', question: 'Adanın genel anlatımı (sayfa metni).', fieldPath: 'notes' },
    { id: 'konum', label: 'Konum', question: 'Ege\'nin neresinde?', fieldPath: 'metadata.profile.konum' },
    { id: 'olcek', label: 'Ölçek', question: 'Ne büyüklükte bir ada?', fieldPath: 'metadata.profile.olcek' },
    { id: 'iklim', label: 'İklim', question: 'İklimi nasıl?', fieldPath: 'metadata.climate' },
    { id: 'mahalleler', label: 'Mahalleler', question: 'Hangi mahallelerden oluşur?', fieldPath: 'metadata.profile.mahalleler' },
    { id: 'ulasim', label: 'Ulaşım', question: 'Adaya nasıl gidilir?', fieldPath: 'metadata.profile.ulasim' }
  ]
};

/**
 * Eski listeden kalan alanlar: değeri doluysa "Bilgiler" bölümünde bu adla
 * görünür. Boşsa hiçbir yerde sorulmaz. Odaların durum / misafir / ipucu
 * alanları otel simülasyonundan kalma; gösterilmez (Kemal, 29 Eylül).
 */
export const ESKI_ALAN_ADLARI: Record<string, string> = {
  personality: 'Kişilik',
  motivation: 'Motivasyon',
  socialClass: 'Toplumsal konum',
  style: 'Mimari',
  secrets: 'Sırlar',
  purpose: 'Amaç',
  secrecy: 'Üyelik',
  influence: 'Nüfuz',
  consequences: 'Sonuçlar',
  rarity: 'Nadirlik',
  function: 'İşlev',
  population: 'Nüfus',
  vibe: 'Atmosfer',
  // Mahalle kartından başka bir yer kartına taşınan maddelerde (8 Ekim)
  konum: 'Konum',
  komsular: 'Sınır komşuları',
  landmarks: 'Simgeler',
  sakinler: 'Sakinler'
};
