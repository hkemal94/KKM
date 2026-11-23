import { VIKI_YAPILARI } from '../data/vikiYapilari';
import type { Item } from '../types';

/**
 * Haritadaki bir yapıdan wiki maddesi tohumu (W1).
 *
 * Sorun şuydu: haritada Belediye Binası'na tıklayıp "Maddeye git" deyince
 * hiçbir şey olmuyordu, çünkü `mekan_belediye` diye bir madde yoktu.
 * Düğme vardı, arkasında bir şey yoktu. Sessizce hiçbir şey yapmak en kötü
 * davranış: kullanıcı uygulamanın bozuk olduğunu sanıyor.
 *
 * Artık madde yoksa haritanın kendisinden kuruluyor. Ad ve mahalle zaten
 * haritada var (23 Kasım'dan beri tek haritadan) — bunları elle yeniden
 * yazmak saçma. Bölümler boş açılıyor; metni Kemal yazacak.
 *
 * Buradan çıkan madde `isProposal: false` — öneri değil, gerçekten var olan
 * bir yapının künyesi. Boş olması ayrı bir şey.
 */

export const MAHALLE_ADI: Record<string, string> = {
  yer_merkez: 'Merkez',
  yer_liman: 'Liman',
  yer_iskele: 'İskele',
  yer_stadyum: 'Stadyum',
  yer_ciftlik: 'Çiftlik'
};

export interface HaritaKunyesi {
  /** Tek haritadaki yapı kimliği (bina_belediye) */
  binaId: string;
  /** Maddenin kimliği (mekan_belediye) */
  wikiId: string;
  /** Haritadaki adı (boş olabilir) */
  ad: string;
  mahalleId: string | null;
  mahalleAdi: string | null;
}

/**
 * Verilen wikiId'ye karşılık gelen yapıyı haritada arar.
 * Bulamazsa null döner — o zaman madde kurulmaz, uydurma yapılmaz.
 *
 * 23 Kasım (tek harita 11. adım, Kemal): tek haritanın viki yapı listesi
 * okunur (`vikiYapilari.ts`, gen/kompakt_viki_yapilar.py tek haritanın yapı
 * dosyasından üretir). Kat, yükseklik, rakım ve eski koordinat yok.
 */
export function haritadaAra(wikiId: string): HaritaKunyesi | null {
  if (!wikiId) return null;
  const p = VIKI_YAPILARI.find(y => y.vikiId === wikiId);
  if (!p) return null;
  const mahalleId = p.mahalle;
  return {
    binaId: p.id,
    wikiId,
    ad: p.ad,
    mahalleId,
    mahalleAdi: mahalleId ? MAHALLE_ADI[mahalleId] ?? null : null
  };
}

/** Künyeden okunur tek satır: "Yapı · Merkez Mahallesi" */
export function kunyeSatiri(k: HaritaKunyesi): string {
  return ['Yapı', k.mahalleAdi ? `${k.mahalleAdi} Mahallesi` : null].filter(Boolean).join(' · ');
}


/**
 * Haritadan madde tohumu. `onAddItem`e verilecek hâli.
 *
 * Not: `id` bilerek wikiId'ye eşit. Harita → madde geçişi kimlik eşleşmesiyle
 * çalışıyor; rastgele kimlik üretirsek bağ bir daha kurulamaz.
 */
export function maddeTohumu(
  k: HaritaKunyesi
): Omit<Item, 'createdAt' | 'updatedAt' | 'userId'> & { id: string } {
  return {
    id: k.wikiId,
    title: k.ad,
    area: 'duzada',
    type: 'mekân',
    status: 'Fikir',
    priority: 'orta',
    tags: ['mekân', 'haritadan'],
    links: [],
    notes: kunyeSatiri(k),
    images: [],
    archived: false,
    isProposal: false,
    // Tek harita alanları (23 Kasım): yapı kimliği ve mahalle; boş alan yazılmaz
    metadata: {
      haritaBinaId: k.binaId,
      ...(k.mahalleAdi ? { region: k.mahalleAdi.toLocaleLowerCase('tr') } : {})
    }
  };
}
