import type { Item, WikiSection } from '../types';
import { yeniGonderi } from './sosyal';
import { siraya } from './yerTurleri';

/**
 * Yapay zekâ önerileri (29 Eylül akşamı; 3 Kasım'da sadeleşti).
 *
 * Stüdyo ekranı ve sayfalardaki "Stüdyoda aç" düğmeleri 3 Kasım'da kalktı
 * (Kemal: "kalksın"). Burada kalan: bekleyen yapay zekâ önerilerinin
 * Onay bekleyenler'de "Ekle" ile uygulanması ve fanzin bilgisi. Kemal
 * "Ekle" demeden hiçbir kayda yazılmaz.
 *
 * Öneri ayrı bir kayıt: `type: 'aday'`, `metadata.aday.tur = 'yapay_zeka'`.
 * Firestore iç içe dizi kabul etmez; sonuçlar düz dizi ya da nesne dizisi.
 */

/** "Ekle" düğmesinin ne yaptığı; null ise yalnız kopyalanır */
export type Uygulama = 'notlara-ekle' | 'bolum-ekle' | 'bolum-derle' | 'kunye-ekle' | 'baslik-yap' | 'metnin-yerine' | 'renk-ekle' | 'urun-ekle' | 'gece-oneri-ekle' | 'fanzin-olustur' | 'fanzin-bolum' | null;

/** Bekleyen önerinin geldiği araç: adı, "Ekle"nin ne yaptığı, kurgu mu */
export interface StudyoAraci {
  id: string;
  ad: string;
  uygulama: Uygulama;
  /** Kurgu metni yazar — tepside Kemal'e hatırlatılır */
  kurgu?: boolean;
}

/** Fanzin bölümünün tonları (yapisal-4, 32: "yazıya göre seçilir") */
export const FANZIN_TONLARI = ['Sade', 'Sıcak ve nostaljik', 'Evren içinden', 'Marka günlüğü', 'Esprili'] as const;

export interface FanzinBolumu { id: string; baslik: string; metin: string; ton: string }
export interface FanzinBilgisi { ay: string; bolumler: FanzinBolumu[] }
export const fanzinBilgisi = (i: Item): FanzinBilgisi | null => {
  const f = i.metadata?.fanzin as FanzinBilgisi | undefined;
  return f && Array.isArray(f.bolumler) ? f : null;
};
/** "3 · Sıcak ve nostaljik" → { sira: 3, ton } — fanzin bölümü önerisinin isteği */
const fanzinIstegi = (s = '') => {
  const m = s.match(/^\s*(\d+)\s*·\s*(.+?)\s*$/);
  return m ? { sira: Number(m[1]), ton: m[2] } : null;
};

/** Önceden üretilmiş öneriler bu araçlardan gelir; "Ekle" buna göre uygulanır */
export const STUDYO_ARACLARI: StudyoAraci[] = [
  { id: 'viki-bolum', ad: 'Bölüm öner', uygulama: 'bolum-ekle', kurgu: true },
  { id: 'viki-kunye', ad: 'Künye önerisi', uygulama: 'kunye-ekle' },
  { id: 'viki-devam', ad: 'Devam et', uygulama: 'notlara-ekle', kurgu: true },
  { id: 'viki-mahalle', ad: 'Mahalle metinleri', uygulama: 'bolum-ekle', kurgu: true },
  { id: 'viki-derle', ad: 'Mahalleyi derle', uygulama: 'bolum-derle', kurgu: true },
  { id: 'yazi-devam', ad: 'Devam et', uygulama: 'notlara-ekle', kurgu: true },
  { id: 'yazi-baslik', ad: 'Başlık öner', uygulama: 'baslik-yap' },
  { id: 'yazi-ton', ad: 'Ton düzelt', uygulama: 'metnin-yerine' },
  { id: 'yazi-ozet', ad: 'Bölüm özeti', uygulama: null },
  { id: 'yazi-fikir', ad: 'Sonraki bölüm için fikir', uygulama: null, kurgu: true },
  { id: 'marka-renk', ad: 'Renk paleti öner', uygulama: 'renk-ekle' },
  // Gece hazırlığının önerileri (kural istisnası; `geceHazirligi.ts` üretir)
  { id: 'gece-oneri', ad: 'Günün üretim önerisi', uygulama: 'gece-oneri-ekle' },
  { id: 'fanzin', ad: 'Bu ayın fanzini', uygulama: 'fanzin-olustur', kurgu: true },
  { id: 'fanzin-bolum', ad: 'Fanzin bölümünü tonla yaz', uygulama: 'fanzin-bolum', kurgu: true },
  { id: 'merch-oner', ad: 'Ürün fikri', uygulama: 'urun-ekle' },
  { id: 'kanon-tutarlilik', ad: 'Tutarlılık kontrolü', uygulama: null },
  { id: 'kanon-lore-bagi', ad: 'Lore bağı', uygulama: null }
];

export const aracBul = (id?: string | null) => STUDYO_ARACLARI.find(a => a.id === id);

// ---------------------------------------------------------------- öneri kaydı

export interface StudyoSonucu {
  metin?: string;
  liste?: string[];
  bolumler?: Array<{ title: string; content: string; anahtar?: string; madde?: string }>;
  /** Mahalle derlemesi: "Ekle" öneri bölümlerinin yerine geçer */
  derle?: boolean;
  kunye?: Record<string, string>;
  renkler?: Array<{ hex: string; name: string }>;
  urunler?: Array<{ title: string; description: string; slogan: string }>;
  /** Kemal'in serbest kutuya yazdığı (fanzin bölümü: "3 · ton") */
  istek?: string;
}

export interface YapayZekaOnerisi extends StudyoSonucu {
  tur: 'yapay_zeka';
  durum: 'bekliyor';
  arac: string;
  hedefId: string;
  hedefAdi: string;
  tarih: string;
  /** Dış kaynak (Vikipedi maddesi, oyunun tasarım belgesi): tepside bağlantı olarak görünür */
  kaynak?: { ad: string; adres: string };
  /** Oyun deposundaki taslak görsellerin adresleri: yalnız gösterilir, kayda eklenmez */
  gorseller?: string[];
}

export const yapayZekaOnerisi = (i: Item): YapayZekaOnerisi | undefined => {
  const a = i.type === 'aday' ? (i.metadata?.aday as YapayZekaOnerisi | undefined) : undefined;
  return a?.tur === 'yapay_zeka' ? a : undefined;
};

// ---------------------------------------------------------------- "Ekle"

const baslikAnahtari = (s = '') => s.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

/**
 * Bölüm önerisini maddeye ekler. Aynı başlıkta boş bölüm varsa o dolar;
 * dolu bölüm varsa (8 Ekim, Kemal: "Merkez'de bir sürü tarihçe oldu")
 * yeni bölüm açılmaz, öneri o bölümün altında bekler (`bekleyenOneri`).
 */
export function bolumleriEkle(hedef: Item, bolumler: Array<{ title: string; content: string }>, simdi = Date.now()): Item {
  const eski = [...((hedef.metadata?.wikiSections as WikiSection[]) || [])];
  const yeni: WikiSection[] = [];
  bolumler.forEach((b, n) => {
    if (!b.content.trim()) return;
    const ayni = eski.findIndex(e => baslikAnahtari(e.title) === baslikAnahtari(b.title));
    if (ayni < 0) { yeni.push({ id: `studyo_${simdi}_${n}`, title: b.title, content: b.content, status: 'öneri' }); return; }
    if (!String(eski[ayni].content || '').trim()) eski[ayni] = { ...eski[ayni], content: b.content, status: 'öneri' };
    else eski[ayni] = { ...eski[ayni], bekleyenOneri: b.content };
  });
  return { ...hedef, metadata: { ...hedef.metadata, wikiSections: [...eski, ...yeni] }, updatedAt: simdi };
}

export interface EkleSecimi {
  /** baslik-yap: seçilen başlık; urun-ekle: hangi ürün (sıra) */
  secim?: string | number;
}

/**
 * "Ekle": öneriyi hedef kayda uygular. Yeni kayıt gerekiyorsa (ürün)
 * `yeni` döner. Hedef bulunamazsa null.
 */
export function oneriyiUygula(
  oneri: YapayZekaOnerisi, items: Item[], s: EkleSecimi = {}
): { guncel?: Item; yeni?: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> } | null {
  const arac = aracBul(oneri.arac);
  const hedef = items.find(i => i.id === oneri.hedefId);
  const simdi = Date.now();
  // Hedefsiz olanlar: yeni kayıt açar
  if (arac?.uygulama === 'fanzin-olustur') {
    const ay = String((oneri as YapayZekaOnerisi & { fanzinAy?: string }).fanzinAy || oneri.tarih.slice(0, 7));
    const ayAdi = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${ay.slice(0, 7)}-15T12:00:00Z`));
    const fanzin: FanzinBilgisi = {
      ay: ay.slice(0, 7),
      bolumler: (oneri.bolumler || []).map((b, n) => ({ id: `b${simdi}_${n}`, baslik: b.title, metin: b.content, ton: 'Sade' }))
    };
    return {
      yeni: {
        title: `Fanzin · ${ayAdi.charAt(0).toLocaleUpperCase('tr') + ayAdi.slice(1)}`,
        area: 'blog', type: 'blog_post', status: 'Taslak', priority: 'orta',
        tags: ['yazı', 'fanzin'], links: [], notes: '', images: [], isProposal: false, archived: false,
        metadata: { categoryType: 'fanzin', fanzin }
      }
    };
  }
  if (arac?.uygulama === 'gece-oneri-ekle') {
    const g = (oneri as YapayZekaOnerisi & { gece?: { tur: string; baslik: string } }).gece;
    if (!g) return null;
    // Viki ailesi (21 Ekim): taslak bölümler maddeye "öneri" bölümü olarak girer; bölüm yoksa yalnız okunur
    if ((g.tur === 'viki' || g.tur === 'depo') && hedef && oneri.bolumler?.length) return { guncel: bolumleriEkle(hedef, oneri.bolumler, simdi) };
    if (g.tur === 'sosyal') return { yeni: { ...yeniGonderi({}, g.baslik), notes: oneri.metin || '', links: hedef ? [hedef.id] : [] } };
    if (g.tur === 'yazi') {
      return {
        yeni: {
          title: g.baslik, area: 'blog', type: 'blog_post', status: 'Taslak', priority: 'orta',
          tags: ['yazı'], links: hedef ? [hedef.id] : [], notes: oneri.metin || '', images: [], isProposal: false, archived: false,
          metadata: { categoryType: 'lore yazısı' }
        }
      };
    }
    if (g.tur === 'drop' && hedef?.type === 'drop') {
      return {
        yeni: {
          title: g.baslik, area: 'merch', type: 'merch_urun', status: 'Konsept', priority: 'orta',
          tags: ['merch', 'merch_urun'], links: [hedef.id], notes: oneri.metin || '', images: [], isProposal: false, archived: false,
          metadata: { dropId: hedef.id, themeId: hedef.metadata?.themeId || '', category: 'giyim' }
        }
      };
    }
    return null;
  }
  if (!arac?.uygulama || !hedef) return null;
  switch (arac.uygulama) {
    case 'fanzin-bolum': {
      const f = fanzinBilgisi(hedef);
      const ist = fanzinIstegi(oneri.istek);
      if (!f || !ist || !oneri.metin || !f.bolumler[ist.sira - 1]) return null;
      const bolumler = f.bolumler.map((b, n) => (n === ist.sira - 1 ? { ...b, metin: oneri.metin!, ton: ist.ton } : b));
      return { guncel: { ...hedef, metadata: { ...hedef.metadata, fanzin: { ...f, bolumler } }, updatedAt: simdi } };
    }
    case 'notlara-ekle':
      return { guncel: { ...hedef, notes: [(hedef.notes || '').trim(), oneri.metin || ''].filter(Boolean).join('\n\n'), updatedAt: simdi } };
    case 'metnin-yerine':
      return oneri.metin ? { guncel: { ...hedef, notes: oneri.metin, updatedAt: simdi } } : null;
    case 'baslik-yap':
      return typeof s.secim === 'string' && s.secim.trim() ? { guncel: { ...hedef, title: s.secim.trim(), updatedAt: simdi } } : null;
    case 'bolum-ekle':
      return { guncel: bolumleriEkle(hedef, oneri.bolumler || [], simdi) };
    case 'bolum-derle': {
      if (!oneri.derle) return { guncel: bolumleriEkle(hedef, oneri.bolumler || [], simdi) };
      // Öneri bölümleri gider, derlenmiş hâli gelir; resmî ve boş bölümler kalır
      const kalan = ((hedef.metadata?.wikiSections as WikiSection[]) || []).filter(b => b.status !== 'öneri');
      const resmiBasliklar = new Set(kalan.filter(b => String(b.content || '').trim()).map(b => baslikAnahtari(b.title)));
      const yeni: WikiSection[] = [];
      (oneri.bolumler || []).forEach((b, n) => {
        if (!b.content.trim()) return;
        const bos = kalan.findIndex(e => baslikAnahtari(e.title) === baslikAnahtari(b.title) && !String(e.content || '').trim());
        if (bos >= 0) { kalan[bos] = { ...kalan[bos], content: b.content, status: 'öneri' }; return; }
        // Aynı başlıkta resmî bölüm varsa yeni bölüm açılmaz: altında bekler
        const resmi = resmiBasliklar.has(baslikAnahtari(b.title)) ? kalan.findIndex(e => baslikAnahtari(e.title) === baslikAnahtari(b.title)) : -1;
        if (resmi >= 0) { kalan[resmi] = { ...kalan[resmi], bekleyenOneri: b.content }; return; }
        yeni.push({ id: `studyo_${simdi}_${n}`, title: b.title, content: b.content, status: 'öneri' });
      });
      return { guncel: { ...hedef, metadata: { ...hedef.metadata, wikiSections: siraya([...kalan, ...yeni]) }, updatedAt: simdi } };
    }
    case 'kunye-ekle': {
      // Dolu alanın üstüne yazılmaz; yalnız boş olanlar dolar
      const profil = { ...((hedef.metadata?.profile as Record<string, string>) || {}) };
      for (const [k, v] of Object.entries(oneri.kunye || {})) if (!String(profil[k] || '').trim()) profil[k] = v;
      return { guncel: { ...hedef, metadata: { ...hedef.metadata, profile: profil }, updatedAt: simdi } };
    }
    case 'renk-ekle': {
      const kit = hedef.metadata?.brandKit || { selectedLogo: '', ideaLogos: [], colorPalette: [], exemplaryWorks: [] };
      const palet = Array.from(new Set([...(kit.colorPalette || []), ...(oneri.renkler || []).map(r => r.hex)]));
      return { guncel: { ...hedef, metadata: { ...hedef.metadata, brandKit: { ...kit, colorPalette: palet } }, updatedAt: simdi } };
    }
    case 'urun-ekle': {
      const u = oneri.urunler?.[typeof s.secim === 'number' ? s.secim : 0];
      if (!u) return null;
      return {
        yeni: {
          title: u.title,
          area: 'merch',
          type: 'merch_urun',
          status: 'Konsept',
          priority: 'orta',
          tags: ['merch', 'merch_urun'],
          links: [hedef.id],
          notes: [u.description, u.slogan ? `Slogan önerisi: ${u.slogan}` : ''].filter(Boolean).join('\n\n'),
          images: [],
          isProposal: false,
          archived: false,
          metadata: { dropId: hedef.id, themeId: hedef.metadata?.themeId || '', category: 'giyim' }
        }
      };
    }
  }
  return null;
}
