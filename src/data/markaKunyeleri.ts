import type { BrandKit, Item } from '../types';

/**
 * Marka künyeleri — Canva'daki gerçek tasarımlardan çıkarıldı (M1).
 *
 * Kaynak: Kemal'in Canva hesabındaki "kems" (12 sayfa) ve "Küçükçetmi Sürek
 * Kulübü" (4 sayfa) tasarımları. Renkler tahmin değil: tasarım dosyasındaki
 * kayıtlı değerler.
 *
 * Kemal'in 16 Eylül kararı: palet çakışmasında Canva kazanır. Uygulamadaki
 * Brand Kit lacivert için #1B2A4A yazıyordu — o arayüzün lacivertiydi,
 * markanın değil. Markanınki #0E1C4F. Kiremit de #D35057 değil #F26B6F.
 *
 * Buradaki değerler uygulamaya BİRLEŞTİRİLEREK yazılır: zaten kayıtlı olan
 * logo, moodboard ve notlar korunur; boş alanlar dolar, renkler düzelir.
 */

/** Canva'daki tasarımlardan okunan renkler */
export const KEMS_RENK = {
  lacivert: '#0E1C4F',
  kiremit: '#F26B6F',
  krem: '#F3EFE8',
  bej: '#BBA591',
  murekkep: '#131313'
} as const;

/**
 * ÖNEMLİ: `selectedLogo` ve `ideaLogos` arayüzde <img src=...> olarak
 * çiziliyor. Buraya metin yazınca kırık görsel simgesi çıkıyor — ilk
 * sürümde arma tariflerini oraya koydum, Kemal'in ekranında "Fikir 3,
 * Fikir 4, Fikir 5" diye kırık kutular belirdi. Tarifler artık
 * `armaTarifi` alanında duruyor ve metin olarak gösteriliyor.
 */
export interface MarkaKunyesi {
  /** Excel ve harita tarafındaki kimlik */
  id: string;
  /** Uygulamada başka bir kimlikle kayıtlıysa onunla da eşleşsin */
  digerKimlikler?: string[];
  ad: string;
  tur: string;
  ustMarka?: string;
  neYapar: string;
  hikayeKoku?: string;
  kurulus?: string;
  merkezi?: string;
  bagliMekan?: string;
  /** Armanın sözle tarifi — görsel değil, metin olarak gösterilir */
  armaTarifi: string[];
  kit: BrandKit;
}

export const MARKA_KUNYELERI: MarkaKunyesi[] = [
  {
    id: 'marka_kems',
    digerKimlikler: ['kems_company'],
    ad: 'Kems Company',
    tur: 'çatı marka',
    neYapar:
      'Düzada evreninin çatı markası; merch, oyun, yayın ve deneyimleri bir '
      + 'arada tutar.',
    hikayeKoku:
      "Kems, Kemal'in lakabı. Marka bir ürün fikrinden bir evrene dönüştü.",
    // kurulus yok (3 Kasım): kuruluş yılı vikide `profile.founded`; eski alan Temizlik'te silinir
    merkezi: 'İstanbul',
    armaTarifi: [
      'Çerçeveli kilit: lacivert çerçeve, krem alan, altta kiremit bant',
      'KEMS blok + el yazısı "Company" (kiremit, krem konturlu)',
      'KC el yazısı monogram — flama biçiminde, kiremit zemin',
      'KEMS APPAREL + OBJECTS — düz siyah, sıkışık blok',
      'Kurum arması ailesi: "Düzada Ziraat İşletmeleri Kurumu" etiketleri'
    ],
    kit: {
      // Görsel alanlar boş: logoyu Kemal yüklüyor, metin buraya girmez
      selectedLogo: '',
      ideaLogos: [],
      colorPalette: [
        KEMS_RENK.lacivert, KEMS_RENK.kiremit, KEMS_RENK.krem, KEMS_RENK.bej
      ],
      exemplaryWorks: [
        'Birlik Birası etiketi',
        'Birlik Zeytin etiketi',
        'Kemsköy Tabakhane İşletmeleri Kurumu etiketi',
        'Kems Coffee Co. bardak logosu'
      ],
      selectedFont: 'Sıkışık blok sans (başlık) + el yazısı (alt satır)',
      voiceTone: 'Gösterişsiz · Bilge · Samimi ama havalı',
      slogan: 'Quietly cultural.',
      usageRulesDo: [
        'Lacivert ve kiremit birlikte; krem her zaman zemin',
        'Arma tipi etiketlerde "Kuruluş 2025" satırı kalsın',
        'Bej yalnız zemin olarak — yazıda kullanılmaz'
      ],
      usageRulesDont: [
        'Blok KEMS ile el yazısı Company aynı ağırlıkta olmaz',
        'Kiremit geniş alan doldurmaz; vurgu rengidir',
        'Arayüzün laciverti (#1B2A4A) marka laciverti değildir'
      ]
    }
  },

  {
    id: 'marka_dirlik',
    ad: 'Dirlik Spor Kulübü',
    tur: 'kulüp markası',
    ustMarka: 'marka_kems',
    neYapar: 'Adanın spor kulübü; Dirlik Stadı onun sahası.',
    kurulus: '12 Mayıs',
    merkezi: 'Stadyum Mahallesi',
    bagliMekan: 'mekan_dirlik_stadi',
    armaTarifi: [
      'Oval rozet: kiremit kontur, krem alan, lacivert yelkenli',
      'Üstte "DİRLİK SPOR KULÜBÜ", altta "12 MAYIS" kavisli dizilir',
      'Yelkenli tek başına da kullanılabilir — lacivert siluet',
      'İki yanda nokta uçlu dikey çizgi: rozetin flama direkleri'
    ],
    kit: {
      selectedLogo: '',
      ideaLogos: [],
      colorPalette: [KEMS_RENK.kiremit, KEMS_RENK.lacivert, KEMS_RENK.krem],
      exemplaryWorks: ['Eski kulüp armaları', 'Deniz kulübü flamaları'],
      selectedFont: 'Kalın grotesk, harf aralığı açık (kavisli dizim)',
      voiceTone: 'Kulüp ağırbaşlılığı; övünmeden köklü',
      slogan: '',
      usageRulesDo: [
        'Rozetin oranı korunur — yatay ezilmez',
        'Yelkenli her zaman lacivert, zemin krem',
        '12 Mayıs kuruluş tarihidir, armadan düşmez'
      ],
      usageRulesDont: [
        'Kiremit ile lacivert yer değiştirmez',
        'Rozet içine fotoğraf konmaz'
      ]
    }
  },

  {
    id: 'marka_kucukcetmi',
    digerKimlikler: ['marka_1782600611254_j7gg5'],
    ad: 'Küçükçetmi Sürek Kulübü',
    tur: 'kulüp markası',
    ustMarka: 'marka_kems',
    neYapar: 'Çiftlik Mahallesindeki avcılık ve kültür kulübü.',
    merkezi: 'Çiftlik Mahallesi',
    bagliMekan: 'mekan_kucukcetmi',
    armaTarifi: [
      'Kangal — tek çizgi, mürekkep. Resmî amblem bu.',
      'Kangal silueti: dikenli tasma, kıvrık kuyruk, tek ağırlıkta kontur',
      'KÇ monogram — iç içe geçmiş, tırnaklı serif',
      'El yazısı "Küçükçetmi" + harf aralığı açık "SÜREK KULÜBÜ"',
      'Köy sokağı illüstrasyonu üstünde tam kilit'
    ],
    kit: {
      selectedLogo: '',
      ideaLogos: [],
      /*
       * Bilerek tek renk: kulüp Kems paletini kullanmıyor.
       *
       * 28 Eylül 2026'da armanın kendisinden ölçüldü, tahmin değil:
       * kangal sayfasında zeminin %82,9'u #f3efe8, çizginin tamamı
       * #131313 (kenar yumuşatmasıyla #111–#141 arası). Monogram
       * sayfasında zemin aynı krem, harf #010101 — pratikte aynı
       * mürekkep. Üçüncü bir renk yok.
       */
      colorPalette: [KEMS_RENK.krem, KEMS_RENK.murekkep],
      exemplaryWorks: ['Köy sokağı illüstrasyonu (değirmen taşı ve çeşme)'],
      selectedFont: 'El yazısı (ad) + harf aralığı açık serif (alt satır)',
      voiceTone: 'Sakin, yerli, gösterişsiz',
      slogan: '',
      usageRulesDo: [
        'Tek renk kalır: krem zemin, mürekkep çizgi',
        'Kangal ile monogram birlikte kullanılabilir, üst üste gelmez',
        'El yazısı ad ile alt satır arasındaki hizalama ortalanır'
      ],
      usageRulesDont: [
        'Kems paletindeki kiremit ve lacivert bu markaya girmez',
        'Kangal dolu siluet olarak kullanılmaz — kontur çizgidir'
      ]
    }
  }
];

/**
 * Var olan marka kaydını künyeyle BİRLEŞTİRİR.
 *
 * Kural: uygulamada zaten yazılı olan bir şey silinmez. Yüklenmiş logo,
 * moodboard ve notlar olduğu gibi kalır. Boş alanlar Canva künyesinden
 * dolar. Tek istisna renk paleti — Kemal'in kararı gereği Canva kazanır.
 */
/** Gerçekten görsel mi — <img src> olarak çizilebilir mi */
function gorselMi(v: unknown): v is string {
  return typeof v === 'string'
    && (v.startsWith('data:') || v.startsWith('http://') || v.startsWith('https://'));
}

export function kunyeyiBirlestir(mevcut: Item, kunye: MarkaKunyesi): Item {
  const eski: Partial<BrandKit> = mevcut.metadata?.brandKit ?? {};
  const yeni = kunye.kit;

  const birlesikKit: BrandKit = {
    // Yüklenmiş logo her zaman kazanır: o Kemal'in dosyası
    logoBase64: eski.logoBase64,
    // Görsel alanlara ASLA metin yazma — arayüz bunları <img> olarak çiziyor
    // Önceki sürümde buraya metin yazılmıştı; kırık görselleri temizle
    selectedLogo: gorselMi(eski.selectedLogo) ? eski.selectedLogo : '',
    ideaLogos: (eski.ideaLogos ?? []).filter(gorselMi),
    // Palet: Canva kazanır (16 Eylül kararı)
    colorPalette: yeni.colorPalette,
    exemplaryWorks: Array.from(
      new Set([...(eski.exemplaryWorks ?? []), ...yeni.exemplaryWorks])
    ),
    selectedFont: eski.selectedFont && eski.selectedFont !== 'Inter'
      ? eski.selectedFont : yeni.selectedFont,
    voiceTone: eski.voiceTone || yeni.voiceTone,
    atmosphereMoodboard: eski.atmosphereMoodboard,
    usageRulesDo: Array.from(
      new Set([...(eski.usageRulesDo ?? []), ...(yeni.usageRulesDo ?? [])])
    ),
    usageRulesDont: Array.from(
      new Set([...(eski.usageRulesDont ?? []), ...(yeni.usageRulesDont ?? [])])
    ),
    slogan: eski.slogan || yeni.slogan
  };

  return {
    ...mevcut,
    notes: mevcut.notes || kunye.neYapar,
    metadata: {
      ...mevcut.metadata,
      brandKit: birlesikKit,
      markaTuru: mevcut.metadata?.markaTuru || kunye.tur,
      armaTarifi: mevcut.metadata?.armaTarifi?.length
        ? mevcut.metadata.armaTarifi : kunye.armaTarifi,
      ustMarka: mevcut.metadata?.ustMarka || kunye.ustMarka,
      ...(mevcut.metadata?.kurulus || kunye.kurulus ? { kurulus: mevcut.metadata?.kurulus || kunye.kurulus } : {}),
      merkezi: mevcut.metadata?.merkezi || kunye.merkezi,
      placeId: mevcut.metadata?.placeId || kunye.bagliMekan,
      kunyeKaynagi: 'Canva · 16 Eylül 2026'
    }
  };
}

/** Kayıt yoksa sıfırdan kurulacak hâli */
export function kunyedenYeni(
  kunye: MarkaKunyesi
): Omit<Item, 'createdAt' | 'updatedAt' | 'userId'> & { id: string } {
  return {
    id: kunye.id,
    title: kunye.ad,
    area: 'duzada',
    // Marka yapısı (28 Eylül): kulüpler kurgu içi kurum. Kayıt yoksa
    // doğrudan kurum olarak açılır; ana marka marka olarak.
    type: kunye.tur === 'kulüp markası' ? 'kulüp' : 'marka',
    status: 'Çalışılıyor',
    priority: 'yüksek',
    tags: kunye.tur === 'kulüp markası' ? ['marka', 'kurum'] : ['marka'],
    links: [],
    notes: kunye.neYapar,
    images: [],
    archived: false,
    isProposal: false,
    metadata: {
      brandKit: kunye.kit,
      markaTuru: kunye.tur,
      armaTarifi: kunye.armaTarifi,
      ustMarka: kunye.ustMarka,
      ...(kunye.kurulus ? { kurulus: kunye.kurulus } : {}),
      merkezi: kunye.merkezi,
      placeId: kunye.bagliMekan,
      kunyeKaynagi: 'Canva · 16 Eylül 2026'
    }
  };
}

/** Bir künyenin uygulamadaki karşılığını bulur (kimlik, diğer kimlik ya da ad) */
export function markayiBul(items: Item[], kunye: MarkaKunyesi): Item | undefined {
  const kimlikler = new Set([kunye.id, ...(kunye.digerKimlikler ?? [])]);
  return (
    items.find(i => kimlikler.has(i.id))
    || items.find(
      i => (i.type === 'marka' || i.type === 'kulüp')
        && i.title.trim().toLocaleLowerCase('tr') === kunye.ad.toLocaleLowerCase('tr')
    )
  );
}
