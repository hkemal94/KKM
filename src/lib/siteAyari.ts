import type { Item } from '../types';

/**
 * Site düzenleme (yapisal-4, 18. soru: "KKM → Site sayfasında sekmeler").
 *
 * Sitenin ayarları tek bir kayıtta: `type: 'site_ayar'`. İçinde iki kopya:
 *   - `taslak`: Kemal'in üzerinde çalıştığı hâl
 *   - `yayinda`: sitede görünen hâl
 * "Yayınla"ya basınca taslak yayına kopyalanır. Kayıt yalnız "Taslağı
 * kaydet", "Yayınla" ya da stüdyodaki "Ekle" ile değişir.
 *
 * Sayfaların sırası sabit (Kemal: yalnız gizle / göster). Sayfa görseli
 * Galeri'deki bir görselin kaydı; görsel kopyalanmaz, oradan okunur.
 * Canva'daki görseller önce Galeri'ye yüklenir.
 *
 * Maddelerin sitede görünmesi (`metadata.sitede`) bunun dışında: onlar
 * "sitede göster"e basınca hemen görünür.
 */

export const SITE_AYAR_TURU = 'site_ayar' as const;

/** Keşfet menüsündeki sayfalar — sıra sabit */
export const SITE_SAYFALARI = [
  { id: 'duzada', ad: 'Düzada', alt: 'ada haritası' },
  { id: 'viki', ad: 'Viki', alt: 'evrenin maddeleri' },
  { id: 'urunler', ad: 'Ürünler', alt: 'droplar ve hikâyeleri' },
  { id: 'haberler', ad: 'Haberler', alt: 'blog' },
  { id: 'projeler', ad: 'Projeler', alt: 'oyunlar, diğer işler' },
  { id: 'hakkinda', ad: 'Hakkında', alt: '' },
  { id: 'iletisim', ad: 'İletişim', alt: 'hesaplar, e-posta' }
] as const;

export interface SiteAyari {
  /** gizlenen sayfaların kimlikleri */
  gizli: string[];
  /** Hakkında sayfasının metni (Kemal yazar ya da stüdyo taslağından) */
  hakkinda: string;
  /** İletişim sayfasındaki e-posta */
  eposta: string;
  /** sayfa kimliği → Galeri kaydının kimliği */
  gorseller: Record<string, string>;
}

export const BOS_AYAR: SiteAyari = { gizli: [], hakkinda: '', eposta: '', gorseller: {} };

export const siteKaydi = (items: Item[]): Item | null =>
  items.find(i => i.type === SITE_AYAR_TURU && !i.archived) || null;

const ayarOku = (ham: unknown): SiteAyari => {
  const h = (ham || {}) as Partial<SiteAyari>;
  return {
    gizli: Array.isArray(h.gizli) ? h.gizli.filter(x => typeof x === 'string') : [],
    hakkinda: typeof h.hakkinda === 'string' ? h.hakkinda : '',
    eposta: typeof h.eposta === 'string' ? h.eposta : '',
    // Boş değer "kaldırıldı" demek (aşağıda `silinenGorseller`); okurken düşer
    gorseller: h.gorseller && typeof h.gorseller === 'object'
      ? Object.fromEntries(Object.entries(h.gorseller).filter(([, v]) => typeof v === 'string' && v)) : {}
  };
};

/** Sitede görünen hâl. Hiç yayınlanmadıysa boş ayar (bütün sayfalar açık). */
export const yayindakiAyar = (items: Item[]): SiteAyari => {
  const k = siteKaydi(items);
  return k?.metadata?.yayinda ? ayarOku(k.metadata.yayinda) : BOS_AYAR;
};

/** Düzenlenen hâl. Taslak yoksa yayındaki. */
export const taslakAyar = (items: Item[]): SiteAyari => {
  const k = siteKaydi(items);
  if (k?.metadata?.taslak) return ayarOku(k.metadata.taslak);
  return yayindakiAyar(items);
};

export const ayniMi = (a: SiteAyari, b: SiteAyari) => JSON.stringify(ayarOku(a)) === JSON.stringify(ayarOku(b));

/** Firestore'a yazılacak temiz kopya (boş görseller düşer) */
export const temizAyar = (a: SiteAyari): SiteAyari => {
  const gorseller: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.gorseller || {})) if (v) gorseller[k] = v;
  return { gizli: [...new Set(a.gizli)], hakkinda: a.hakkinda.trim(), eposta: a.eposta.trim(), gorseller };
};

/**
 * Kayıt birleştirilerek yazılıyor (setDoc merge), bu yüzden kaldırılan bir
 * sayfa görseli sunucuda silinmez, eskisi geri gelirdi. Kaldırılanlar boş
 * metinle yazılır; `ayarOku` boşu düşürür.
 */
const silinenGorselleriIsle = (onceki: unknown, yeni: SiteAyari): SiteAyari => {
  const eski = ((onceki as Partial<SiteAyari> | undefined)?.gorseller) || {};
  const gorseller: Record<string, string> = { ...yeni.gorseller };
  for (const k of Object.keys(eski)) if (!gorseller[k]) gorseller[k] = '';
  return { ...yeni, gorseller };
};

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

/**
 * Taslağı yazar; `yayinla` ise yayına da kopyalar. Kayıt yoksa yenisini
 * döndürür (ilk kayıt Kemal'in düğmesiyle oluşur).
 */
export function siteAyariniYaz(
  items: Item[], taslak: SiteAyari, yayinla: boolean
): { guncel?: Item; yeni?: YeniKayit } {
  const temiz = temizAyar(taslak);
  const simdi = Date.now();
  const k = siteKaydi(items);
  if (k) {
    const metadata = { ...(k.metadata || {}), taslak: silinenGorselleriIsle(k.metadata?.taslak, temiz) } as Item['metadata'];
    if (yayinla) Object.assign(metadata as object, { yayinda: silinenGorselleriIsle(k.metadata?.yayinda, temiz), yayinTarihi: simdi });
    return { guncel: { ...k, metadata, updatedAt: simdi } };
  }
  return {
    yeni: {
      title: 'Site ayarları',
      area: 'komuta',
      type: SITE_AYAR_TURU,
      status: 'Planlandı',
      priority: 'düşük',
      tags: ['site'],
      links: [],
      notes: '',
      images: [],
      isProposal: false,
      archived: false,
      metadata: (yayinla ? { taslak: temiz, yayinda: temiz, yayinTarihi: simdi } : { taslak: temiz }) as Item['metadata']
    }
  };
}

/** Stüdyodaki "Hakkında taslağı" → Ekle: yalnız taslaktaki metni değiştirir */
export function hakkindaTaslaginaYaz(items: Item[], metin: string) {
  return siteAyariniYaz(items, { ...taslakAyar(items), hakkinda: metin }, false);
}

/** Sayfa görselinin adresi (Galeri kaydından) */
export const sayfaGorseli = (items: Item[], ayar: SiteAyari, sayfa: string): string | undefined => {
  const id = ayar.gorseller[sayfa];
  if (!id) return undefined;
  return items.find(i => i.id === id)?.images?.[0];
};
