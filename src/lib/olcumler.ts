import type { Item } from '../types';

/**
 * Boyut ve hız (3. gece; Kemal, 7 Ekim: kayıt boyutları, uygulama
 * parçaları, açılış hızı). Ölçümler yalnız bu tarayıcıda yapılır ve
 * kayda yazılmaz; açılış süreleri bu tarayıcının hafızasında (son 10)
 * tutulur ki önceki açılışlarla karşılaştırılabilsin.
 */

// ---------------------------------------------------------------- kayıt boyutları

/** Firestore'un bir kayıt için sınırı: 1 MiB */
export const KAYIT_SINIRI = 1024 * 1024;

const kodlayici = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
/** Kaydın yaklaşık boyutu (bayt): JSON hâlinin UTF-8 uzunluğu */
export const boyut = (x: unknown): number => {
  const s = JSON.stringify(x) ?? '';
  return kodlayici ? kodlayici.encode(s).length : s.length;
};

export interface TurBoyutu { tur: string; sayi: number; bayt: number }
export interface KayitBoyutu { id: string; ad: string; tur: string; bayt: number }

export function kayitBoyutlari(items: Item[]): { toplam: number; turler: TurBoyutu[]; enBuyukler: KayitBoyutu[] } {
  const turler = new Map<string, TurBoyutu>();
  const hepsi: KayitBoyutu[] = [];
  let toplam = 0;
  for (const i of items) {
    const b = boyut(i);
    toplam += b;
    const t = turler.get(i.type) || { tur: i.type, sayi: 0, bayt: 0 };
    t.sayi++; t.bayt += b;
    turler.set(i.type, t);
    hepsi.push({ id: i.id, ad: i.title || i.id, tur: i.type, bayt: b });
  }
  return {
    toplam,
    turler: Array.from(turler.values()).sort((a, b) => b.bayt - a.bayt),
    enBuyukler: hepsi.sort((a, b) => b.bayt - a.bayt).slice(0, 10)
  };
}

// ---------------------------------------------------------------- uygulama parçaları

/** Parça dosyasının adından bölüm adı (Vite parçaları "Ad-karma.js") */
const PARCA_ADLARI: Array<[RegExp, string]> = [
  [/maplibre/i, 'Harita motoru'],
  [/duzadaGeo/i, 'Harita verisi (ada, yollar, evler)'],
  [/duzadaDem/i, 'Harita verisi (arazi yükseltisi)'],
  [/DuzadaHarita|duzenKatmani|haritaMaddesi|harita/i, 'Harita'],
  [/Kurucu|kurucu/i, 'Kurucu'],
  [/jspdf|html2canvas|purify/i, 'PDF yazıcı'],
  [/raporPdf|pdfYazici|DuzadaRaporu|evrenRaporu/i, 'Evren Raporu'],
  [/Studyo|studyo|genai/i, 'Yapay zekâ stüdyosu'],
  [/Wiki|wiki/i, 'Viki'],
  [/^Duzada-/, 'Düzada sayfası'],
  [/Merch|merch|Urun|three/i, 'Merch ve 3B stüdyo'],
  [/Oyun|oyun/i, 'Oyun'],
  [/Yazi|Kitap|Fanzin/i, 'Yazı'],
  [/Markalar|marka|KurumOzeti|Galeri/i, 'Markalar ve galeri'],
  [/Sosyal|sosyal|GonderiKarti/i, 'Sosyal medya'],
  [/Durum|Takvim|takvim|YolHaritasi|Eksikler|Bosluklar/i, 'Durum'],
  [/firebase|firestore/i, 'Veritabanı bağlantısı'],
  [/Poppins|\.woff2?$|\.ttf$/i, 'Yazı tipleri'],
  [/^index/i, 'Uygulamanın çekirdeği']
];

export interface Parca { ad: string; dosyalar: number; bayt: number }

/**
 * Bu açılışta indirilen parçalar (tarayıcının kendi indirme kaydından).
 * Açılmamış bölümlerin parçası listede yoktur; bölümü açınca eklenir.
 */
export function indirilenParcalar(): { parcalar: Parca[]; toplam: number } {
  const p = new Map<string, Parca>();
  let toplam = 0;
  let girdiler: PerformanceResourceTiming[] = [];
  try { girdiler = performance.getEntriesByType('resource') as PerformanceResourceTiming[]; } catch { /* yok */ }
  for (const g of girdiler) {
    let yol = '';
    try { const u = new URL(g.name); if (u.origin !== location.origin) continue; yol = u.pathname; } catch { continue; }
    if (!/\.(js|css|ttf|woff2?|webp|png|svg)$/.test(yol)) continue;
    const dosya = yol.split('/').pop() || yol;
    const bayt = g.decodedBodySize || g.encodedBodySize || g.transferSize || 0;
    if (!bayt) continue;
    const ad = PARCA_ADLARI.find(([re]) => re.test(dosya))?.[1]
      || (/\.(webp|png|svg)$/.test(dosya) ? 'Görseller'
        : bayt < 12 * 1024 ? 'Küçük parçalar (simgeler, ortak kod)' : dosya.replace(/-[A-Za-z0-9_-]{6,}\./, '.'));
    const x = p.get(ad) || { ad, dosyalar: 0, bayt: 0 };
    x.dosyalar++; x.bayt += bayt;
    p.set(ad, x);
    toplam += bayt;
  }
  return { parcalar: Array.from(p.values()).sort((a, b) => b.bayt - a.bayt), toplam };
}

// ---------------------------------------------------------------- açılış hızı

type Isaret = 'kayitlar' | 'harita-basladi' | 'harita-hazir';
const isaretler: Partial<Record<Isaret, number>> = {};
const GECMIS = 'kkm_acilis_olcumleri';

export interface AcilisKaydi { tarih: number; kayitlar?: number; harita?: number }

function gecmisiOku(): AcilisKaydi[] {
  try {
    const h = JSON.parse(localStorage.getItem(GECMIS) || '[]');
    return Array.isArray(h) ? h.filter(x => x && typeof x.tarih === 'number') : [];
  } catch { return []; }
}

function gecmiseYaz(d: Partial<AcilisKaydi>) {
  try {
    const h = gecmisiOku();
    const bu = h.find(x => x.tarih === OTURUM);
    if (bu) Object.assign(bu, d); else h.unshift({ tarih: OTURUM, ...d });
    localStorage.setItem(GECMIS, JSON.stringify(h.slice(0, 10)));
  } catch { /* gizli pencere: yalnız bu oturum */ }
}

const OTURUM = Date.now();

/**
 * Açılış anlarını işaretler; her işaret oturumda bir kez. Harita, sayfa
 * her açıldığında yeniden ölçülür (Harita'ya her girişte).
 */
export function isaretle(ad: Isaret) {
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  if (ad === 'harita-basladi') { isaretler['harita-basladi'] = t; delete isaretler['harita-hazir']; return; }
  if (isaretler[ad] !== undefined) return;
  isaretler[ad] = t;
  if (ad === 'kayitlar') gecmiseYaz({ kayitlar: Math.round(t) });
  if (ad === 'harita-hazir' && isaretler['harita-basladi'] !== undefined) {
    gecmiseYaz({ harita: Math.round(t - isaretler['harita-basladi']!) });
  }
}

export interface AcilisOlcumu {
  /** Sayfanın kendisi (ilk ekran): tarayıcının ölçtüğü */
  sayfa?: number;
  /** Kayıtların ekrana gelmesi (açılıştan itibaren) */
  kayitlar?: number;
  /** Haritanın çizilmesi (Harita'ya girişten itibaren) */
  harita?: number;
  gecmis: AcilisKaydi[];
}

export function acilisOlcumu(): AcilisOlcumu {
  let sayfa: number | undefined;
  try {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (n && n.domContentLoadedEventEnd > 0) sayfa = Math.round(n.domContentLoadedEventEnd);
  } catch { /* yok */ }
  const b = isaretler['harita-basladi'], h = isaretler['harita-hazir'];
  return {
    sayfa,
    kayitlar: isaretler.kayitlar !== undefined ? Math.round(isaretler.kayitlar) : undefined,
    harita: b !== undefined && h !== undefined ? Math.round(h - b) : undefined,
    gecmis: gecmisiOku()
  };
}

// ---------------------------------------------------------------- yazım

export const kb = (b: number) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(b / 1024)).toLocaleString('tr-TR')} KB`;
export const sn = (ms?: number) => (ms === undefined ? '—' : `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} sn`);
