import type React from 'react';
import type { Item, ItemType } from '../types';

/**
 * Sosyal medya (Araçlar, 29 Eylül gece). Kemal'in kararları:
 *   - Ay takvimi; yanında tarihsiz fikir kutusu (güne sürükleyince tarih alır).
 *   - Tek gönderi, çok kanal; her kanal ayrı "paylaşıldı" işaretlenir.
 *     TikTok ile YouTube Shorts aynı içerik: tek kanal.
 *   - Aşama: Fikir → Taslak → Onayda → Onaylandı → Paylaşıldı (3 Kasım,
 *     Kemal: gönderi kartı). "Paylaşıldı"yı yalnız Kemal işaretler; KKM
 *     paylaşmaz. Eski "Hazır" kayıtta durur, ekranda "Onaylandı" okunur
 *     (kayda yazılmaz; Kemal aşamayı değiştirince yenisi yazılır).
 *   - Biçim: tek görsel, kaydırmalı, video / reels.
 *   - İçerik türü yalnız KKM içinde (dışarı yansımaz): Ürün · Nostalji ·
 *     Afiş · Hayat · Marka.
 *   - Seriler: ad (Kemal koyar), renk, düzen (haftanın günü, ayın günü ya da
 *     düzensiz). Düzenli serilerin boş günleri takvimde kesikli görünür;
 *     kayıt yalnız Kemal basınca oluşur.
 *   - Numara yok. Paylaşımı Kemal yapar; Buffer ikinci adım.
 *
 * Kayıtlar: `sosyal_gonderi` ve `sosyal_seri`. Firestore iç içe dizi
 * kabul etmez; bütün diziler düz metin dizisi.
 */

export const ASAMALAR = ['Fikir', 'Taslak', 'Onayda', 'Onaylandı', 'Paylaşıldı'] as const;
export type Asama = typeof ASAMALAR[number];

/** Aşama rozetinin rengi (Sosyal, gönderi kartı, Takvim) */
export const ASAMA_RENGI: Record<Asama, string> = {
  Fikir: 'bg-[#F3EFE8] text-[#6A5E4C] dark:bg-[#17345A] dark:text-[#A6B0C9]',
  Taslak: 'bg-[#F3EFE8] text-[#6A5E4C] dark:bg-[#17345A] dark:text-[#A6B0C9]',
  Onayda: 'bg-[#FCE7E2] text-[#B23A40] dark:bg-[#4A2430] dark:text-[#F5B3B5]',
  Onaylandı: 'bg-[#E5EFE3] text-[#3F6B45] dark:bg-[#23452B] dark:text-[#B9D8BC]',
  Paylaşıldı: 'bg-[#0E1C4F] text-white dark:bg-[#2C3C72]'
};

export interface Kanal { id: string; ad: string; kisa: string; platform: string[] }
export const KANALLAR: Kanal[] = [
  { id: 'instagram', ad: 'Instagram', kisa: 'IG', platform: ['instagram'] },
  { id: 'tiktok', ad: 'TikTok + YouTube Shorts', kisa: 'TT', platform: ['tiktok', 'youtube'] },
  { id: 'x', ad: 'X · Threads', kisa: 'X', platform: ['twitter'] },
  { id: 'pinterest', ad: 'Pinterest', kisa: 'PIN', platform: ['pinterest'] }
];

export const BICIMLER = [
  { id: 'tek', ad: 'Tek görsel' },
  { id: 'kaydirmali', ad: 'Kaydırmalı' },
  { id: 'video', ad: 'Video / reels' }
] as const;

/** `koyu`: karanlık modda (lacivert zeminde lacivert kaybolmasın) */
export const TURLER = [
  { id: 'urun', ad: 'Ürün', renk: '#0E1C4F', koyu: '#8C9BD6' },
  { id: 'nostalji', ad: 'Nostalji', renk: '#B07A4B', koyu: '#B07A4B' },
  { id: 'afis', ad: 'Afiş', renk: '#2F8F9D', koyu: '#2F8F9D' },
  { id: 'hayat', ad: 'Hayat', renk: '#6E8B5C', koyu: '#6E8B5C' },
  { id: 'marka', ad: 'Marka', renk: '#F26B6F', koyu: '#F26B6F' }
] as const;

/** Tür rengi için stil: sınıfta `bg-[var(--tur)] dark:bg-[var(--tur-koyu)]` */
export const turStili = (id: string): React.CSSProperties => {
  const t = TURLER.find(x => x.id === id);
  return { ['--tur' as string]: t?.renk || '#CFC5B4', ['--tur-koyu' as string]: t?.koyu || '#2C3C72' } as React.CSSProperties;
};
export const TUR_SINIFI = 'bg-[var(--tur)] dark:bg-[var(--tur-koyu)]';

/** Seri renkleri (türlerden ayrı dursun diye farklı tonlar) */
export const SERI_RENKLERI = ['#8E5BA6', '#D18B2C', '#3C7A89', '#A6475B', '#5B7F3A', '#6B6B9A'];

export const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Gönderinin bağlanabileceği kayıtlar */
export const BAG_TURLERI: Array<{ ad: string; turler: ItemType[] }> = [
  { ad: 'Drop / ürün', turler: ['drop', 'merch_urun'] },
  { ad: 'Viki', turler: ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'olay'] },
  { ad: 'Blog', turler: ['blog_post'] },
  { ad: 'Kitap', turler: ['kitap_bolum'] },
  { ad: 'Oyun', turler: ['oyun_tanitim'] }
];

// ---------------------------------------------------------------- kayıtlar

export interface GonderiBilgisi {
  tarih: string;       // 'YYYY-MM-DD'; boşsa fikir kutusunda
  saat: string;        // 'HH:MM' ya da ''
  kanallar: string[];
  paylasilan: string[];
  bicim: string;
  tur: string;
  seriId: string;
  hashtag: string;
  not: string;
  baglanti: string;    // paylaşılan gönderinin adresi
  ilham: string;       // Pinterest bağlantısı
  canva: string;       // Canva tasarım bağlantısı
}

export const BOS_GONDERI: GonderiBilgisi = {
  tarih: '', saat: '', kanallar: [], paylasilan: [], bicim: 'tek', tur: '', seriId: '',
  hashtag: '', not: '', baglanti: '', ilham: '', canva: ''
};

export const gonderiBilgisi = (i: Item): GonderiBilgisi => ({ ...BOS_GONDERI, ...((i.metadata?.gonderi as Partial<GonderiBilgisi>) || {}) });

export const asamasi = (i: Item): Asama =>
  i.status === 'Hazır' ? 'Onaylandı'
    : (ASAMALAR as readonly string[]).includes(i.status) ? i.status as Asama : 'Fikir';

export type Duzen = 'haftalik' | 'aylik' | 'duzensiz';
export interface SeriBilgisi {
  renk: string;
  duzen: Duzen;
  /** haftalık: 0 = pazartesi … 6 = pazar; aylık: ayın günü */
  gun: number;
  kanallar: string[];
}

export const seriBilgisi = (i: Item): SeriBilgisi => ({
  renk: SERI_RENKLERI[0], duzen: 'duzensiz', gun: 0, kanallar: [],
  ...((i.metadata?.seri as Partial<SeriBilgisi>) || {})
});

export const seriDuzenYazisi = (s: SeriBilgisi) =>
  s.duzen === 'haftalik' ? `Her ${GUN_ADLARI[s.gun]?.toLocaleLowerCase('tr')}`
    : s.duzen === 'aylik' ? `Her ayın ${s.gun}. günü`
      : 'Düzensiz';

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

export function yeniGonderi(b: Partial<GonderiBilgisi> = {}, baslik = ''): YeniKayit {
  return {
    title: baslik || 'Yeni gönderi',
    area: 'sosyal',
    type: 'sosyal_gonderi',
    status: 'Fikir',
    priority: 'orta',
    tags: ['sosyal'],
    links: [],
    notes: '',
    images: [],
    isProposal: false,
    archived: false,
    metadata: { gonderi: { ...BOS_GONDERI, ...b } }
  };
}

export function yeniSeri(ad: string, s: SeriBilgisi): YeniKayit {
  return {
    title: ad,
    area: 'sosyal',
    type: 'sosyal_seri',
    status: 'Fikir',
    priority: 'orta',
    tags: ['sosyal'],
    links: [],
    notes: '',
    images: [],
    isProposal: false,
    archived: false,
    metadata: { seri: s }
  };
}

export const gonderiGuncelle = (i: Item, b: Partial<GonderiBilgisi>, ek: Partial<Item> = {}): Item => ({
  ...i, ...ek, updatedAt: Date.now(),
  metadata: { ...i.metadata, gonderi: { ...gonderiBilgisi(i), ...b } }
});

// ---------------------------------------------------------------- takvim

export const tarihYaz = (y: number, a: number, g: number) =>
  `${y}-${String(a + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`;

export const bugunTarih = () => { const d = new Date(); return tarihYaz(d.getFullYear(), d.getMonth(), d.getDate()); };

/** Ayın gün ızgarası: pazartesiden başlar; ay dışı günler null */
export function ayIzgarasi(y: number, a: number): Array<number | null> {
  const ilk = (new Date(y, a, 1).getDay() + 6) % 7;
  const gunSayisi = new Date(y, a + 1, 0).getDate();
  const h: Array<number | null> = [...Array(ilk).fill(null)];
  for (let g = 1; g <= gunSayisi; g++) h.push(g);
  while (h.length % 7) h.push(null);
  return h;
}

/** Düzenli serinin o aydaki günleri */
export function seriGunleri(s: SeriBilgisi, y: number, a: number): number[] {
  const gunSayisi = new Date(y, a + 1, 0).getDate();
  if (s.duzen === 'aylik') return s.gun >= 1 && s.gun <= gunSayisi ? [s.gun] : [];
  if (s.duzen !== 'haftalik') return [];
  const g: number[] = [];
  for (let d = 1; d <= gunSayisi; d++) if ((new Date(y, a, d).getDay() + 6) % 7 === s.gun) g.push(d);
  return g;
}

/** Bir kanalın Markalar'daki hesabı (varsa kullanıcı adı / başlık) */
export function kanalHesabi(k: Kanal, items: Item[]): string | null {
  const c = items.find(i => i.type === 'channel' && !i.archived && k.platform.includes(String(i.metadata?.platform || '')));
  return c ? (c.metadata?.handle || c.title) : null;
}

export const gonderiler = (items: Item[]) => items.filter(i => i.type === 'sosyal_gonderi' && !i.archived);
export const seriler = (items: Item[]) => items.filter(i => i.type === 'sosyal_seri' && !i.archived);

/** Seri boş yeri: düzenli serinin gönderisi olmayan günü (bugünden sonra) */
export function bosYerler(seri: Item, tum: Item[], y: number, a: number, bugun: string): string[] {
  const s = seriBilgisi(seri);
  const dolu = new Set(tum.filter(g => gonderiBilgisi(g).seriId === seri.id).map(g => gonderiBilgisi(g).tarih));
  return seriGunleri(s, y, a).map(g => tarihYaz(y, a, g)).filter(t => t >= bugun && !dolu.has(t));
}

/** Serinin sıradaki boş yeri (üç ay ileriye bakar) */
export function siradakiBosYer(seri: Item, tum: Item[], bugun: string): string | null {
  const d = new Date(bugun + 'T12:00');
  for (let n = 0; n < 3; n++) {
    const ay = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const b = bosYerler(seri, tum, ay.getFullYear(), ay.getMonth(), bugun);
    if (b.length) return b[0];
  }
  return null;
}

/** '2026-10-05' → '5 Ekim' */
export const kisaTarih = (t: string) => {
  const [, a, g] = t.split('-').map(Number);
  return a && g ? `${g} ${AY_ADLARI[a - 1]}` : '';
};

export const turBul = (id: string) => TURLER.find(t => t.id === id);
