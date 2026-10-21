import type { Item, ItemType, WikiSection } from '../types';
import { aiCagir, AiHatasi } from './aiCagir';
import { hakkindaTaslaginaYaz } from './siteAyari';
import { yeniGonderi } from './sosyal';
import { MAHALLE_ISKELETI, mahalleMaddesi, mahalleMetniVerisi } from './mahalleMetinleri';
import { derlemeVerisi, siraya } from './yerTurleri';
import { adiCoz } from './alanSablonu';

/**
 * Yapay zekâ stüdyosu (29 Eylül akşamı).
 *
 * Kemal'in kararları:
 *   - Bütün yapay zekâ işleri tek yerde, Araçlar'daki stüdyoda. Sayfalarda
 *     yalnız "✨ Stüdyoda aç" kalır; basınca stüdyo yan panelde, o madde
 *     seçili açılır.
 *   - Kartlar sayfaya göre gruplu: Viki · Yazı · Marka ve Merch · Kanon.
 *   - Her sonuç öneri tepsisine düşer (Adaylar'la tek tepsi). Kemal "Ekle"
 *     demeden hiçbir kayda yazılmaz; "Sil" deyince gider.
 *   - "Devam et" araçları kalır, yalnız stüdyoda.
 *   - Kota dolunca yalnız stüdyo "yarın tekrar dene" der; uygulamanın geri
 *     kalanı etkilenmez.
 *
 * Öneri ayrı bir kayıt: `type: 'aday'`, `metadata.aday.tur = 'yapay_zeka'`.
 * Firestore iç içe dizi kabul etmez; sonuçlar düz dizi ya da nesne dizisi.
 */

// 7 Ekim: sosyal medya kartları kalktı (Kemal: kullanılmayan kartlar kalksın)
export type StudyoGrubu = 'viki' | 'yazi' | 'marka' | 'kanon';

export const GRUP_ADLARI: Record<StudyoGrubu, string> = {
  viki: 'Viki',
  yazi: 'Yazı',
  marka: 'Marka ve Merch',
  kanon: 'Kanon'
};

export type SonucTuru = 'metin' | 'liste' | 'bolumler' | 'kunye' | 'renkler' | 'urunler';

/** "Ekle" düğmesinin ne yaptığı; null ise yalnız kopyalanır */
export type Uygulama = 'notlara-ekle' | 'bolum-ekle' | 'bolum-derle' | 'kunye-ekle' | 'baslik-yap' | 'metnin-yerine' | 'renk-ekle' | 'urun-ekle' | 'site-hakkinda' | 'gece-oneri-ekle' | 'fanzin-olustur' | 'fanzin-bolum' | null;

export interface StudyoAraci {
  id: string;
  grup: StudyoGrubu;
  ad: string;
  aciklama: string;
  /** Hangi kayıtlarla çalışır (null: kayıt seçilmez, yalnız yazı) */
  hedefTurleri: ItemType[] | null;
  /** Serbest yazı kutusu (tema, not) */
  serbest?: string;
  sonuc: SonucTuru;
  uygulama: Uygulama;
  /** Kurgu metni yazar — Kemal'e hatırlatılır */
  kurgu?: boolean;
  task: string;
  veri: (hedef: Item | null, serbest: string, items: Item[]) => unknown;
  /** Stüdyonun kart listesinde görünmez (gece hazırlığı, fanzin ekranından açılan) */
  gizli?: boolean;
  /** En fazla kaç bölüm (varsayılan 6) */
  enCokBolum?: number;
  /**
   * Tek çağrının sonucunu birden çok maddeye öneri olarak dağıtır
   * (mahalle metinleri). Maddesi bulunamayanlar `eksik`te döner.
   */
  dagit?: (sonuc: StudyoSonucu, items: Item[], hedef: Item | null) => { oneriler: Array<{ hedef: Item; sonuc: StudyoSonucu }>; eksik: string[] };
}

/** Fanzin bölümünün tonları (yapisal-4, 32: "yazıya göre seçilir") */
export const FANZIN_TONLARI = ['Sade', 'Sıcak ve nostaljik', 'Evren içinden', 'Marka günlüğü', 'Esprili'] as const;

export interface FanzinBolumu { id: string; baslik: string; metin: string; ton: string }
export interface FanzinBilgisi { ay: string; bolumler: FanzinBolumu[] }
export const fanzinBilgisi = (i: Item): FanzinBilgisi | null => {
  const f = i.metadata?.fanzin as FanzinBilgisi | undefined;
  return f && Array.isArray(f.bolumler) ? f : null;
};
/** "3 · Sıcak ve nostaljik" → { sira: 3, ton } — fanzin ekranından stüdyoya giden istek */
export const fanzinIstegi = (s = '') => {
  const m = s.match(/^\s*(\d+)\s*·\s*(.+?)\s*$/);
  return m ? { sira: Number(m[1]), ton: m[2] } : null;
};

const VIKI: ItemType[] = ['yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'mekân', 'dükkân', 'kulüp', 'marka', 'kisi', 'karakter', 'aile', 'olay'];
const YAZI: ItemType[] = ['blog_post', 'kitap_bolum'];

const vikiBaglami = (items: Item[]) => items
  .filter(i => !i.archived && !i.isProposal && VIKI.includes(i.type))
  .slice(0, 80)
  .map(e => ({ title: e.title, type: e.type, notes: (e.notes || '').slice(0, 400) }));

/** Fanzin kaynakları (yapisal-4, 31) — yalnız adlar ve kısa notlar */
function fanzinVerisi(items: Item[], istek: string) {
  const c = items.filter(i => !i.archived && !i.isProposal);
  const kisa = (t = '', n = 200) => (t.length > n ? t.slice(0, n) + '…' : t);
  const son = (a: Item, b: Item) => b.updatedAt - a.updatedAt;
  return {
    viki: c.filter(i => VIKI.includes(i.type)).sort(son).slice(0, 40).map(i => ({ ad: i.title, tur: i.type, not: kisa(i.notes) })),
    droplar: c.filter(i => i.type === 'drop').map(i => ({ ad: i.title, asama: i.status, not: kisa(i.notes, 160) })),
    urunler: c.filter(i => i.type === 'merch_urun').slice(0, 20).map(i => ({ ad: i.title, asama: i.status })),
    notlar: c.filter(i => (i.tags || []).includes('gunluk-not')).sort(son).slice(0, 10).map(i => kisa(i.notes || i.title)),
    pinterest: c.filter(i => i.type === 'ilham_kaynak').slice(0, 10).map(i => ({ ad: i.title, not: kisa(i.notes, 120) })),
    galeri: c.filter(i => i.type === 'ilham_gorsel').slice(0, 15).map(i => i.title),
    gonderiler: c.filter(i => i.type === 'sosyal_gonderi').sort(son).slice(0, 10).map(i => ({ ad: i.title, asama: i.status })),
    hesaplar: c.filter(i => i.type === 'channel').map(i => i.title),
    istek
  };
}

export const STUDYO_ARACLARI: StudyoAraci[] = [
  // ---- Viki
  {
    id: 'viki-bolum', grup: 'viki', ad: 'Bölüm öner', kurgu: true,
    aciklama: 'Maddeye 3 bölüm başlığı ve kısa içerik önerir.',
    hedefTurleri: VIKI, sonuc: 'bolumler', uygulama: 'bolum-ekle', task: 'wiki-section-oner',
    veri: h => ({ title: h?.title, type: h?.type, notes: h?.notes || h?.title })
  },
  {
    id: 'viki-kunye', grup: 'viki', ad: 'Künye önerisi',
    aciklama: 'Maddenin metninden künye alanlarını çıkarır.',
    hedefTurleri: VIKI, sonuc: 'kunye', uygulama: 'kunye-ekle', task: 'kunya-cikar',
    veri: h => ({ title: h?.title, type: h?.type, notes: h?.notes || '' })
  },
  {
    id: 'viki-devam', grup: 'viki', ad: 'Devam et', kurgu: true,
    aciklama: 'Madde metnine bir paragraf ekler.',
    hedefTurleri: VIKI, sonuc: 'metin', uygulama: 'notlara-ekle', task: 'devam-et',
    veri: h => ({ text: h?.notes || '', notes: `Varlık: ${h?.title}, türü: ${h?.type}`, viki: true })
  },
  {
    // Metin soru turu (1 Ekim gece): 8 bölüm tek basışta; her biri kendi
    // mahallesinin maddesine ayrı öneri. İskelet `mahalleMetinleri.ts`.
    id: 'viki-mahalle', grup: 'viki', ad: 'Mahalle metinleri', kurgu: true,
    aciklama: 'Soru turundaki cevaplarından 8 bölümün taslağı tek seferde (5 Tarihçe, Çarşı, Deniz Feneri, Dirlik Stadı). Her biri kendi mahallesine ayrı öneri olarak düşer.',
    hedefTurleri: null, sonuc: 'bolumler', uygulama: 'bolum-ekle', task: 'mahalle-metinleri', enCokBolum: MAHALLE_ISKELETI.length,
    veri: () => mahalleMetniVerisi(),
    dagit: (sonuc, items) => {
      const oneriler: Array<{ hedef: Item; sonuc: StudyoSonucu }> = [];
      const eksik: string[] = [];
      const gelenler = sonuc.bolumler || [];
      // Model anahtarları düşürdüyse sıraya güvenilir
      const anahtarsiz = !gelenler.some(x => x.anahtar);
      MAHALLE_ISKELETI.forEach((b, n) => {
        const gelen = anahtarsiz ? gelenler[n] : gelenler.find(x => x.anahtar === b.anahtar);
        if (!gelen?.content.trim()) return;
        const hedef = mahalleMaddesi(items, b.mahalleAdlari);
        if (!hedef) { if (!eksik.includes(b.mahalle)) eksik.push(b.mahalle); return; }
        oneriler.push({ hedef, sonuc: { bolumler: [{ title: b.bolum, content: gelen.content }] } });
      });
      if (!oneriler.length && !eksik.length) throw new AiHatasi('Yapay zekâ bölümleri tanınmayan bir biçimde döndü; bir daha dene.');
      return { oneriler, eksik };
    }
  },
  {
    // Mahalle derlemesi (8 Ekim, Kemal: "tekrar eden çok bilgi oldu"). Öneri
    // bölümleri tek düzenli hâle gelir; resmî bölümlere dokunulmaz. Cadde,
    // meydan ya da tepe hakkındaki uzun yazı o maddeye ayrı öneri olarak düşer.
    id: 'viki-derle', grup: 'viki', ad: 'Mahalleyi derle', kurgu: true,
    aciklama: 'Mahallenin öneri bölümlerini tek düzenli hâle getirir: her bilgi bir kez, aynı başlık iki kez yok, bölümler sabit sırada. Resmî bölümlere dokunmaz; yeni bilgi eklemez. Cadde, meydan ve tepe hakkındaki uzun yazı o maddeye ayrı öneri olur.',
    hedefTurleri: ['yer'], sonuc: 'bolumler', uygulama: 'bolum-derle', task: 'mahalle-derle', enCokBolum: 12,
    veri: (h, _s, items) => derlemeVerisi(h, items),
    dagit: (sonuc, items, hedef) => {
      const oneriler: Array<{ hedef: Item; sonuc: StudyoSonucu }> = [];
      const eksik: string[] = [];
      if (!hedef) return { oneriler, eksik };
      const kendi = (sonuc.bolumler || []).filter(b => !b.madde).map(({ title, content }) => ({ title, content }));
      oneriler.push({ hedef, sonuc: { bolumler: kendi, derle: true } });
      const altlar = items.filter(i => !i.archived && ['cadde', 'meydan', 'yer_adi'].includes(i.type));
      const tasinan = new Map<string, { hedef: Item; bolumler: Array<{ title: string; content: string }> }>();
      for (const b of sonuc.bolumler || []) {
        if (!b.madde || !b.content.trim()) continue;
        const h = adiCoz(b.madde, altlar);
        if (!h) { if (!eksik.includes(b.madde)) eksik.push(b.madde); continue; }
        const t = tasinan.get(h.id) || { hedef: h, bolumler: [] };
        t.bolumler.push({ title: b.title, content: b.content });
        tasinan.set(h.id, t);
      }
      for (const t of tasinan.values()) oneriler.push({ hedef: t.hedef, sonuc: { bolumler: t.bolumler } });
      return { oneriler, eksik };
    }
  },
  // ---- Yazı
  {
    id: 'yazi-devam', grup: 'yazi', ad: 'Devam et', kurgu: true,
    aciklama: 'Blog yazısını ya da kitap bölümünü bir paragraf sürdürür.',
    hedefTurleri: YAZI, sonuc: 'metin', uygulama: 'notlara-ekle', task: 'devam-et',
    veri: h => ({ text: h?.notes || '', notes: `Başlık: ${h?.title}` })
  },
  {
    id: 'yazi-baslik', grup: 'yazi', ad: 'Başlık öner',
    aciklama: '5 başlık önerir; birini seçersen yazının başlığı olur.',
    hedefTurleri: YAZI, sonuc: 'liste', uygulama: 'baslik-yap', task: 'baslik-oner',
    veri: h => ({ text: h?.notes || h?.title })
  },
  {
    id: 'yazi-ton', grup: 'yazi', ad: 'Ton düzelt',
    aciklama: 'Metni daha sıcak, arşivsel bir tona çeker. Ekle deyince metnin yerine geçer.',
    hedefTurleri: YAZI, sonuc: 'metin', uygulama: 'metnin-yerine', task: 'ton-duzelt',
    veri: h => ({ text: h?.notes || '', style: 'Nostaljik arşivsel' })
  },
  {
    id: 'yazi-ozet', grup: 'yazi', ad: 'Bölüm özeti',
    aciklama: 'Kitap bölümünün kısa özetini çıkarır.',
    hedefTurleri: ['kitap_bolum'], sonuc: 'metin', uygulama: null, task: 'bolum-ozeti',
    veri: h => ({ text: h?.notes || '' })
  },
  {
    id: 'yazi-fikir', grup: 'yazi', ad: 'Sonraki bölüm için fikir', kurgu: true,
    aciklama: 'Bölümden sonra hikâyenin nereye gidebileceğine dair 3 fikir.',
    hedefTurleri: ['kitap_bolum'], sonuc: 'metin', uygulama: null, task: 'sonraki-fikir',
    veri: h => ({ text: h?.notes || '' })
  },
  // ---- Marka ve Merch
  {
    id: 'marka-renk', grup: 'marka', ad: 'Renk paleti öner',
    aciklama: 'Markanın ya da kurumun notlarından 4 renk önerir.',
    hedefTurleri: ['marka', 'kulüp'], sonuc: 'renkler', uygulama: 'renk-ekle', task: 'logo-renk-cikar',
    veri: h => ({ logoDescription: h?.metadata?.brandKit?.selectedLogo || h?.notes || h?.title })
  },
  {
    // Site → Hakkında (yapisal-4). Marka kaydından iki üç cümle; "Ekle" yalnız
    // sitenin taslağına yazar, Kemal "Yayınla" demeden sitede görünmez.
    id: 'site-hakkinda', grup: 'marka', ad: 'Site · Hakkında taslağı',
    aciklama: 'Marka kaydından sitenin Hakkında sayfası için iki üç cümle önerir. "Ekle" sitenin taslağına yazar.',
    hedefTurleri: ['marka'], serbest: 'Neyi vurgulasın? (isteğe bağlı)', sonuc: 'metin', uygulama: 'site-hakkinda', task: 'site-hakkinda',
    veri: (h, serbest) => ({ baslik: h?.title, notlar: (h?.notes || '').slice(0, 1500), kit: h?.metadata?.brandKit || null, istek: serbest })
  },
  {
    // Gece hazırlığının önerileri (kural istisnası). Stüdyoda kart olarak
    // görünmez; `geceHazirligi.ts` çalıştırır, tepside "Ekle" buradan uygulanır.
    id: 'gece-oneri', grup: 'yazi', ad: 'Günün üretim önerisi', gizli: true,
    aciklama: 'Gece hazırlanan üç öneriden biri.',
    hedefTurleri: null, sonuc: 'metin', uygulama: 'gece-oneri-ekle', task: 'gece-onerileri',
    veri: () => ({})
  },
  {
    id: 'fanzin', grup: 'yazi', ad: 'Bu ayın fanzini', kurgu: true,
    aciklama: 'Viki, Merch, not defteri, Pinterest ve hesaplardan bu ayın fanzini için bölüm taslakları. Ayın ilk günü gece kendiliğinden de hazırlanır.',
    hedefTurleri: null, serbest: 'Bu ay neyi öne çıkarsın? (isteğe bağlı)', sonuc: 'bolumler', uygulama: 'fanzin-olustur', task: 'fanzin-taslak',
    veri: (_h, serbest, items) => ({ ay: new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date()), ...fanzinVerisi(items, serbest) })
  },
  {
    id: 'fanzin-bolum', grup: 'yazi', ad: 'Fanzin bölümünü tonla yaz', kurgu: true, gizli: true,
    aciklama: 'Fanzindeki bir bölümü seçilen tonda yeniden yazar. "Ekle" yalnız o bölümün metnini değiştirir.',
    hedefTurleri: ['blog_post'], serbest: 'Bölüm ve ton (fanzin ekranından gelir)', sonuc: 'metin', uygulama: 'fanzin-bolum', task: 'fanzin-bolum',
    veri: (h, serbest) => {
      const f = h ? fanzinBilgisi(h) : null;
      const ist = fanzinIstegi(serbest);
      const b = f && ist ? f.bolumler[ist.sira - 1] : undefined;
      return { baslik: b?.baslik || '', metin: b?.metin || '', ton: ist?.ton || 'Sade' };
    }
  },
  {
    id: 'merch-oner', grup: 'marka', ad: 'Ürün fikri',
    aciklama: 'Bir drop için 3 ürün fikri. Ekle deyince ürün "Konsept" olarak drop\'a girer. Fiyat önermez.',
    hedefTurleri: ['drop'], serbest: 'Tema ya da not (isteğe bağlı)', sonuc: 'urunler', uygulama: 'urun-ekle', task: 'merch-oner',
    veri: (h, s) => ({ brandInfo: [h?.title, h?.notes].filter(Boolean).join(' — '), notes: s, category: 'hepsi' })
  },
  // ---- Kanon
  {
    id: 'kanon-tutarlilik', grup: 'kanon', ad: 'Tutarlılık kontrolü',
    aciklama: 'Metni vikiyle karşılaştırır, çelişki varsa söyler.',
    hedefTurleri: [...YAZI, ...VIKI], sonuc: 'metin', uygulama: null, task: 'tutarlilik-kontrolu',
    veri: (h, _s, items) => ({ text: h?.notes || '', wikiContext: vikiBaglami(items) })
  },
  {
    id: 'kanon-lore-bagi', grup: 'kanon', ad: 'Lore bağı',
    aciklama: 'Metnin vikideki hangi maddelerle bağlanabileceğini önerir.',
    hedefTurleri: [...YAZI, ...VIKI], sonuc: 'metin', uygulama: null, task: 'lore-bagi',
    veri: (h, _s, items) => ({ text: h?.notes || '', existingEntities: vikiBaglami(items).map(e => ({ title: e.title, type: e.type })) })
  }
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

/** Bir öneri kaydının bağlı olduğu maddenin kimliği (yapay zekâ önerisi ya da günün sorusu cevabı) */
export const adayBilgisiHedefi = (i: Item): string | undefined =>
  i.type === 'aday' ? ((i.metadata?.aday as { hedefId?: string } | undefined)?.hedefId || undefined) : undefined;

function jsonAyikla(ham: unknown): unknown {
  if (typeof ham !== 'string') return ham;
  try { return JSON.parse(ham.replace(/^```(json)?|```$/gm, '').trim()); } catch { return null; }
}

const metinMi = (x: unknown): x is string => typeof x === 'string' && !!x.trim();

/** Sunucunun cevabını aracın sonuç türüne çevirir; bozuksa hata */
export function sonucuAyikla(arac: StudyoAraci, ham: unknown): StudyoSonucu {
  const bozuk = () => { throw new AiHatasi('Yapay zekâ beklenmedik bir cevap döndü; bir daha dene.'); };
  switch (arac.sonuc) {
    case 'metin':
      return metinMi(ham) ? { metin: ham.trim() } : bozuk();
    case 'liste': {
      const v = jsonAyikla(ham);
      return Array.isArray(v) && v.some(metinMi) ? { liste: v.filter(metinMi).map(x => x.trim()).slice(0, 8) } : bozuk();
    }
    case 'bolumler': {
      const v = jsonAyikla(ham);
      // anahtar yalnız varsa yazılır (Firestore undefined kabul etmez)
      const b = Array.isArray(v) ? v.filter(x => x && metinMi(x.title)).map(x => ({ title: String(x.title), content: String(x.content || ''), ...(metinMi(x.anahtar) ? { anahtar: x.anahtar } : {}), ...(metinMi(x.madde) ? { madde: x.madde.trim() } : {}) })) : [];
      return b.length ? { bolumler: b.slice(0, arac.enCokBolum || 6) } : bozuk();
    }
    case 'kunye': {
      const v = jsonAyikla(ham) as { profile?: Record<string, unknown> } | null;
      const p = v?.profile && typeof v.profile === 'object' ? v.profile : null;
      const k: Record<string, string> = {};
      for (const [a, d] of Object.entries(p || {})) if (metinMi(d)) k[a] = d.trim();
      return Object.keys(k).length ? { kunye: k } : bozuk();
    }
    case 'renkler': {
      const v = jsonAyikla(ham);
      const r = Array.isArray(v) ? v.filter(x => x && /^#[0-9a-f]{6}$/i.test(String(x.hex))).map(x => ({ hex: String(x.hex).toUpperCase(), name: String(x.name || '') })) : [];
      return r.length ? { renkler: r.slice(0, 6) } : bozuk();
    }
    case 'urunler': {
      const v = jsonAyikla(ham);
      const u = Array.isArray(v) ? v.filter(x => x && metinMi(x.title)).map(x => ({ title: String(x.title), description: String(x.description || ''), slogan: String(x.slogan || '') })) : [];
      return u.length ? { urunler: u.slice(0, 5) } : bozuk();
    }
  }
}

/** Öneri tepsisine yazılacak kayıt */
export function oneriKaydi(arac: StudyoAraci, hedef: Item | null, sonuc: StudyoSonucu): Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> {
  const bilgi: YapayZekaOnerisi = {
    tur: 'yapay_zeka', durum: 'bekliyor', arac: arac.id,
    hedefId: hedef?.id || '', hedefAdi: hedef?.title || '',
    tarih: new Date().toISOString().slice(0, 10),
    ...sonuc
  };
  return {
    title: `${arac.ad}${hedef ? ` · ${hedef.title}` : ''}`,
    area: 'komuta',
    type: 'aday',
    status: 'Fikir',
    priority: 'orta',
    tags: ['aday', 'studyo'],
    links: hedef ? [hedef.id] : [],
    notes: sonuc.metin || '',
    images: [],
    isProposal: false,
    archived: false,
    metadata: { aday: bilgi }
  };
}

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
    case 'site-hakkinda':
      return oneri.metin ? hakkindaTaslaginaYaz(items, oneri.metin) : null;
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

// ---------------------------------------------------------------- kota

const KOTA_ANAHTARI = 'kems_ai_kota_doldu';
const bugun = () => new Date().toISOString().slice(0, 10);

export type KotaHali = 'hazir' | 'doldu' | 'sunucu-yok';

export function kotaHali(): KotaHali {
  try {
    const v = localStorage.getItem(KOTA_ANAHTARI);
    if (v === `sunucu:${bugun()}`) return 'sunucu-yok';
    if (v === bugun()) return 'doldu';
  } catch { /* yok */ }
  return 'hazir';
}

function kotaYaz(v: string | null) {
  try { if (v) localStorage.setItem(KOTA_ANAHTARI, v); else localStorage.removeItem(KOTA_ANAHTARI); } catch { /* yok */ }
}

/**
 * Aracı çalıştırır. Kota ya da sunucu hatası günlük olarak not edilir;
 * stüdyonun üst satırı buradan okur. Başarılı çağrı notu siler.
 */
export async function araciCalistir(arac: StudyoAraci, hedef: Item | null, serbest: string, items: Item[]): Promise<StudyoSonucu> {
  try {
    const ham = await aiCagir<unknown>(arac.task, arac.veri(hedef, serbest, items));
    const sonuc = sonucuAyikla(arac, ham);
    kotaYaz(null);
    return serbest.trim() ? { ...sonuc, istek: serbest.trim() } : sonuc;
  } catch (e) {
    hatayiNotEt(e);
    throw e;
  }
}

/** Kota ya da sunucu hatasını günlük not eder (stüdyonun üst satırı için) */
export function hatayiNotEt(e: unknown) {
  if (!(e instanceof AiHatasi)) return;
  if (e.sunucuYok) kotaYaz(`sunucu:${bugun()}`);
  else if (/kota|quota|RESOURCE_EXHAUSTED|429/i.test(e.message)) kotaYaz(bugun());
}

/** Başarılı çağrıdan sonra notu siler */
export const kotaNotunuSil = () => kotaYaz(null);
