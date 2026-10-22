export type AreaType = 'duzada' | 'merch' | 'blog' | 'kitap' | 'brainstorm' | 'ilham' | 'komuta' | 'markalar' | 'oyun' | 'bosluklar' | 'galeri' | 'sosyal';

export type GeneralStatus = 'Fikir' | 'Planlandı' | 'Çalışılıyor' | 'Bitti' | 'Yayınlandı';
export type DropStatus = 'Konsept' | 'Tasarım' | 'Üretim' | 'Satışta';
/*
 * Ürün ve drop aynı dört adımı izliyor (28 Eylül 2026 kararı).
 * Eskiden üründe 'Fikir' ve 'Örnek/numune' de vardı; numune ayrı takip
 * edilmediği için kalktı, 'Fikir' ise Brainstorm'un işi.
 */
export type UrunStatus = 'Konsept' | 'Tasarım' | 'Üretim' | 'Satışta';
export type BlogStatus = 'Taslak' | 'Yayında';
export type KitapStatus = 'taslak' | 'yazıldı' | 'düzeltildi';

export type ItemType = 
  // Düzada types
  | 'kulüp' | 'dükkân' | 'karakter' | 'mekân' | 'ürün' | 'olay' | 'map_settings' | 'map_pin'
  | 'marka' | 'kisi' | 'yer' | 'oda' | 'aile'
  // Yer türleri (8 Ekim): 'yer' yalnız mahalle; cadde, meydan, doğa adı ve ada ayrı kart
  | 'cadde' | 'meydan' | 'yer_adi' | 'ada'
  // Merch types
  | 'drop' | 'merch_urun'
  // Blog types
  | 'blog_post'
  // Kitap types
  | 'kitap_proje' | 'kitap_bolum'
  // Brainstorm
  | 'fikir'
  // Oyun stüdyosu: süreçteki iş kartı ve tasarım belgesi bölümü
  | 'oyun_is' | 'gdd_bolum'
  // Oyun fikir notu (1 Ekim): kategorili not, oyunun dosyasında durur
  | 'oyun_fikir'
  // Inspiration
  | 'ilham_gorsel'
  // Komuta types
  | 'channel'
  // Onay bekleyen aday (Paket 4): soru cevabı, atölye taslağı
  | 'aday'
  // Oyunun tanıtım künyesi (Paket 5): durum, özet, açıklama, ekran görüntüleri
  | 'oyun_tanitim'
  // Sosyal medya (29 Eylül gece): gönderi, seri, Pinterest panosu
  | 'sosyal_gonderi' | 'sosyal_seri' | 'ilham_kaynak'
  // Site ayarları (30 Eylül): taslak + yayındaki, tek kayıt
  | 'site_ayar'
  // Gece hazırlığının defteri (30 Eylül): son yapılan gün, son fanzin ayı
  | 'gece_hazirlik'
  // KKM ayarları (30 Eylül): Durum hedefleri, yol haritasında bitenler
  | 'kkm_ayar'
  // Atölye → Tuval panosu (6. gece)
  | 'tuval';

export interface WikiSection {
  id: string;
  title: string;
  content: string;
  status: 'resmi' | 'öneri' | 'boş';
  /**
   * Aynı başlıkta gelen yapay zekâ önerisi (8 Ekim). Yeni bölüm açılmaz;
   * bölümün altında bekler, Kemal "yerine koy / altına ekle / at" der.
   */
  bekleyenOneri?: string;
}

export interface BrandKit {
  selectedLogo: string; // URL or base64 or description
  logoBase64?: string;  // Custom uploaded logo base64 image data
  ideaLogos: string[];  // variants
  /** İkincil logo: ideaLogos içindeki sırası (1 Ekim; Kemal seçer, denemeler gizli) */
  ikincilLogoSira?: number;
  /** Alternatif logo: ideaLogos içindeki sırası (8 Ekim, Kemal: "birincil, ikincil ve alternatif") */
  alternatifLogoSira?: number;
  colorPalette: string[]; // hex codes
  exemplaryWorks: string[]; // references
  selectedFont?: string;
  voiceTone?: string;         // Ton / ses
  atmosphereMoodboard?: string[]; // Moodboard / atmosfer (base64 image URLs)
  usageRulesDo?: string[];    // Kullanım kuralları - Do
  usageRulesDont?: string[];  // Kullanım kuralları - Don't
  slogan?: string;            // Slogan / manifesto
}

export interface Item {
  id: string;
  title: string;
  area: AreaType;
  type: ItemType;
  status: string; // GeneralStatus | DropStatus | UrunStatus | BlogStatus | KitapStatus
  priority: 'düşük' | 'orta' | 'yüksek';
  tags: string[];
  links: string[]; // Linked item IDs
  notes: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  isProposal: boolean; // dashed coral border, labels "henüz resmi değil" with "Kabul et" and "Vazgeç"
  userId: string;
  
  // Specific Metadata fields
  metadata?: {
    [key: string]: any;
    // Düzada specific
    region?: string; // kuzey / liman / orman etc.
    haritaKonum?: { x: number; y: number } | null;
    wikiSections?: WikiSection[];
    brandKit?: BrandKit;
    date?: string; // for olay type
    recurrence?: string; // for olay type
    brandId?: string; // parent brand ID
    placeId?: string; // parent place ID

    // Merch specific
    moodboard?: string[]; // references for Tema
    themeId?: string; // for Drop and Ürün
    dropId?: string; // for Ürün
    variantColor?: string; // for Ürün (color variant)
    category?: 'giyim' | 'baskı' | 'aksesuar' | string; // for Ürün
    editionNotes?: string; // for Drop
    editionCount?: number; // e.g. 1, 2 for Drop

    // Blog specific
    categoryType?: 'lore yazısı' | 'duyuru' | 'kişisel' | 'rehber' | 'fanzin';
    isWikiHooked?: boolean;

    // Kitap specific
    bookId?: string; // for Bölüm
    chapterIndex?: number; // for Bölüm ordering
    chapterTodos?: string[]; // manual tasks

    // Komuta/Channel specific
    platform?: string;
    handle?: string;
    link?: string;
    subscribers?: number;

    // Google Keep specific
    keepColor?: string;
    isKeepNote?: boolean;
  };
}

export interface UserSettings {
  theme: 'arşiv' | 'dark';
}
