import type { Item } from '../types';
import { GDD_BOLUMLERI } from '../components/oyun/OyunSureci';

/**
 * Dondurmacı Kızlar tasarım belgesi (12 Ekim, Kemal: "ilgili oyunun içeriği
 * şimdilik böyle olacak, makyaj konusunda sonra çalışacağız"). Kaynak:
 * Kemal'in Word belgesi "Dondurmacı Kızlar - Oyun Tasarım Belgesi (GDD)"
 * ve üç ekran görseli (`public/galeri/oyun/`). Metin Kemal'in, aynen;
 * burada yazı eklenmez. Oyunun deposuna ve vikiye hiçbir şey gitmez.
 *
 * Tek seferlik: Eksikler'deki kart basılınca bölümlerin SONUNA eklenir (dolu
 * yazıya ve seçimlere dokunulmaz; "Kamera" tek seçimli, Birinci şahıs işaretlenirse
 * İzometrik silinirdi — iki açı künyedeki metinde yazıyor), görseller oyunun
 * vitrinine girer. İkinci basışta iş kalmaz (metin zaten varsa eklenmez).
 */

export const DONDURMACI_ADI = 'Dondurmacı Kızlar';

export const DONDURMACI_GORSELLERI = [
  '/galeri/oyun/dondurmaci-kizlar-dukkan.webp',
  '/galeri/oyun/dondurmaci-kizlar-servis.webp',
  '/galeri/oyun/dondurmaci-kizlar-menu.webp'
];

/** Bölüm → belgeden eklenecek metin (Kemal'in yazısı) */
const METIN: Record<string, string> = {
  kunye: [
    'Tasarım Aşaması: Detaylandırılmış Konsept & Oynanış Belgesi',
    'Tür: Cozy Casual / Tycoon & Hands-on Shop Simulator Hibriti',
    'Platform: PC, Mobil (iOS & Android)',
    'Kamera Açısı: İzometrik (Yönetim) & Birinci Şahıs (FPS - Dondurma Hazırlama)',
    'Görsel Stil: Cute / Cozy Low-Poly 3D (Yumuşak Işıklandırmalı, Pastel Tonlar)',
    'Oyuncu Sayısı: Tek Oyunculu (Singleplayer)'
  ].join('\n'),
  ozet: 'Dūzada\'nın sahil şeridindeki "Dondurmacı Kızlar" dükkanını yönettiğiniz, dükkanı büyütüp yeni yetenekler açarken, müşterilerin siparişlerini birinci şahıs (FPS) kamerasıyla kendi ellerinizle hazırladığınız, sakinleştirici ve lofi atmosferli bir dükkan işletme oyunudur.',
  mekanik: [
    'Temel Tasarım Sütunları',
    'Cozy & Chill (Huzurlu Atmosfer): Oyunda kaybetmek veya sert cezalar yoktur. Lofi müzikler, tatlı deniz esintisi sesleri ve sevimli Düzada sakinleri ile oyuncuya güvenli ve dinlendirici bir alan sunar.',
    'Dual-Perspective (Çift Bakış Açılı Eğlence): Oyuncu sadece menüleri tıklayan bir yönetici değildir; tezgaha geçip fiziksel olarak dondurma yapmanın (kepçe daldırma, sos dökme) tatminini yaşar.',
    'Progressive Growth (Sürekli İlerleme): Küçük bir dondurma tezgahından, onlarca çeşit dondurma, waffle, limonata satan ve her köşesi dekore edilmiş popüler bir işletmeye dönüşme hissi.',
    '',
    'Detaylı Mekanikler (FPS Dondurma Hazırlama)',
    'Adım 1: Altlık Seçimi: Külah, Kap veya Kup seçeneklerinden siparişe uygun olanı seçilir.',
    'Adım 2: Dondurma Alımı (Scoop Mekaniği): Basılı tutarak dondurma küvetine daldırılır, "MÜKEMMEL!" hizalamasında bırakılarak kusursuz top elde edilir.',
    'Adım 3: Külaha Yerleştirme: Dondurma topu külah üzerine yerleştirilir.',
    'Adım 4: Süsleme & Sos (Topping): İsteğe bağlı sos veya şekerlemeler eklenir.',
    'Adım 5: Servis Et: Hazırlanan dondurma müşteriye sunularak para ve itibar kazanılır.'
  ].join('\n'),
  arayuz: [
    'Ekran Görseli 1: Dükkân Geneli ve Ana Arayüz (İzometrik Yönetim)',
    'Oyuncu güne başlar. Ekranın üst kısmında günlük kazanç, itibar göstergesi ve Düzada\'daki zaman çizelgesi yer alır. Tezgahta mevcut dondurma çeşitleri sergilenmektedir.',
    '',
    'Ekran Görseli 2: Müşteri Ağırlama ve Dondurma Servisi',
    'Düzada sakinleri tezgah önünde sıraya girer. Müşterilerin üzerinde istedikleri dondurma çeşidini gösteren konuşma balonları belirir.',
    '',
    'Ekran Görseli 3: Birebir Dondurma Hazırlama Ekranı (FPS Bakış Açısı)',
    'Müşteri tezgaha geldiğinde kamera yumuşakça FPS açısına geçer. Oyuncu külahı seçer, dondurma küvetinden zamanlama barını kullanarak kepçeyle dondurmayı alır ve külaha yerleştirip servis eder.',
    '',
    'Ekran Görseli 4: İlerleme, Yetenek ve Menü Yönetimi',
    'Biriktirilen paralarla yeni tariflerin kilidi açılır, ürün fiyatları ayarlanır ve dükkân için yeni masa, bitki ve dekorasyon ürünleri satın alınır.'
  ].join('\n'),
  ilerleme: [
    'Yeni Çeşitler & Tarif Ağacı: Mango, yaban mersini dondurmalarından Waffle, Kup ve Limonataye uzanan genişleme.',
    'Dükkan Özelleştirme: Masa, sandalye, şemsiye, bitki ve ışıklandırmalarla dükkanın çekiciliğini artırma.'
  ].join('\n'),
  gorsel: 'Sanat Yönetimi: Düşük poligonlu (low-poly), pastel tonlarda sevimli 3D grafikler.',
  ses: 'Ses & Müzik: Sakin lofi-hiphop, akustik müzikler, deniz ve rüzgar sesleri.'
};

export const dondurmaciOyunu = (items: Item[]) =>
  items.find(i => i.type === 'oyun_tanitim' && !i.archived && i.title.trim() === DONDURMACI_ADI);

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string };

export interface DondurmaciIsleri { oyun?: Item; guncellenecek: Item[]; eklenecek: YeniKayit[]; bolumler: string[]; gorselEksik: number }

export function dondurmaciIsleri(items: Item[]): DondurmaciIsleri {
  const oyun = dondurmaciOyunu(items);
  const bos: DondurmaciIsleri = { guncellenecek: [], eklenecek: [], bolumler: [], gorselEksik: 0 };
  if (!oyun) return bos;
  const belgeler = items.filter(i => i.type === 'gdd_bolum' && !i.archived && (i.metadata as { oyunId?: string })?.oyunId === oyun.id);
  const cikti: DondurmaciIsleri = { ...bos, oyun };
  const simdi = Date.now();
  for (const b of GDD_BOLUMLERI) {
    const metin = METIN[b.id];
    if (!metin) continue;
    const kayit = belgeler.find(k => (k.metadata as { bolumId?: string })?.bolumId === b.id);
    const eski = kayit?.notes || '';
    if (eski.includes(metin.split('\n')[0])) continue;
    const notlar = [eski.trim(), metin].filter(Boolean).join('\n\n');
    cikti.bolumler.push(b.ad);
    if (kayit) cikti.guncellenecek.push({ ...kayit, notes: notlar, updatedAt: simdi });
    else cikti.eklenecek.push({
      title: b.ad, area: 'oyun', type: 'gdd_bolum', status: 'Fikir', priority: 'orta', tags: ['oyun', 'gdd'],
      links: [], notes: notlar, images: [], isProposal: false, archived: false,
      metadata: { bolumId: b.id, soru: b.soru, oyunId: oyun.id }
    });
  }
  const eksik = DONDURMACI_GORSELLERI.filter(g => !(oyun.images || []).includes(g));
  cikti.gorselEksik = eksik.length;
  if (eksik.length) cikti.guncellenecek.push({ ...oyun, images: [...(oyun.images || []), ...eksik].slice(0, 4), updatedAt: simdi });
  return cikti;
}

export const dondurmaciIsiVar = (i: DondurmaciIsleri) => i.guncellenecek.length + i.eklenecek.length > 0;
