/**
 * Pinterest panosunun pinlerini okur (3 Kasım, Kemal: İlham ve kaynaklar'da
 * pano bağlantısının küçük resimleri). Yalnız okuma: Pinterest'in herkese
 * açık pano aracı (widgets.pinterest.com, tarayıcıdan okunabiliyor).
 * Hiçbir kayda yazılmaz; sonuç yalnız bu oturumun belleğinde tutulur.
 */

/** Bağlantının Pinterest açısından ne olduğu */
export type PinterestAdresi =
  | { tur: 'pano'; kullanici: string; pano: string; bolum?: string }
  | { tur: 'kisa' }
  | { tur: 'diger' };

/** pinterest.com/<ilk>/… ile başlayan ama pano olmayan adresler */
const PANO_OLMAYAN = new Set([
  'pin', 'search', 'ideas', 'today', 'explore', 'business', 'settings', 'categories', 'topics',
  'videos', 'shopping', 'resource', 'login', 'signup', 'password', 'about', 'news_hub', 'discover',
  'board', 'boards', 'user', '_', 'oauth', 'help', 'privacy', 'terms', 'notifications', 'messages'
]);
/** pinterest.com/<kullanıcı>/<ikinci>/ biçiminde olup pano olmayan sekmeler */
const PROFIL_SEKMESI = new Set(['_created', '_saved', '_shop', '_tried', '_profile', 'pins', 'boards', 'followers', 'following']);

export function pinterestAdresi(adres: string): PinterestAdresi {
  let u: URL;
  try { u = new URL(adres.trim()); } catch { return { tur: 'diger' }; }
  const h = u.hostname.toLowerCase();
  if (h === 'pin.it') return { tur: 'kisa' };
  if (!/(^|\.)pinterest\.[a-z.]+$/.test(h)) return { tur: 'diger' };
  const p = u.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  if (p.length < 2 || p.length > 3) return { tur: 'diger' };
  if (PANO_OLMAYAN.has(p[0].toLowerCase()) || PROFIL_SEKMESI.has(p[1].toLowerCase())) return { tur: 'diger' };
  if (p[2] && PROFIL_SEKMESI.has(p[2].toLowerCase())) return { tur: 'diger' };
  return { tur: 'pano', kullanici: p[0], pano: p[1], ...(p[2] ? { bolum: p[2] } : {}) };
}

export interface PanoPini {
  id: string;
  resim: string;
  aciklama: string;
  /** Pinin Pinterest'teki sayfası */
  adres: string;
}

export type PanoSonucu =
  | {
    durum: 'tamam';
    pinler: PanoPini[];
    panoAdi: string;
    /** Pinterest'in bildirdiği pin sayısı (yoksa boş) */
    toplam?: number;
    /** Bölüm bağlantısıydı ama bölüm ayrı okunamadı, panonun tamamı geldi */
    bolumOkunamadi: boolean;
  }
  | { durum: 'yok' }
  | { durum: 'hata'; mesaj: string };

const UC = 'https://widgets.pinterest.com/v3/pidgets';
const parca = (s: string) => encodeURIComponent(s);

interface HamPin { id?: string | number; description?: string; images?: Record<string, { url?: string } | undefined> }
interface HamYanit { data?: { pins?: HamPin[]; board?: { name?: string; pin_count?: number } } | null }

class BulunamadiHatasi extends Error {}

async function oku(adres: string): Promise<HamYanit> {
  const r = await fetch(adres);
  if (r.status === 404 || r.status === 403) throw new BulunamadiHatasi();
  if (!r.ok) throw new Error(`Pinterest yanıt vermedi (${r.status})`);
  return (await r.json()) as HamYanit;
}

function pinlereCevir(y: HamYanit): PanoPini[] {
  const liste: PanoPini[] = [];
  for (const p of y.data?.pins || []) {
    const resim = p.images?.['237x']?.url || p.images?.['236x']?.url || p.images?.['564x']?.url;
    if (!p.id || !resim) continue;
    const id = String(p.id);
    liste.push({ id, resim, aciklama: (p.description || '').trim(), adres: `https://www.pinterest.com/pin/${id}/` });
  }
  return liste;
}

// Aynı oturumda aynı pano bir kez okunur (bellekte, sayfa yenilenince gider)
const onbellek = new Map<string, Promise<PanoSonucu>>();

async function getir(k: string, p: string, b?: string): Promise<PanoSonucu> {
  let bolumOkunamadi = false;
  if (b) {
    try {
      const y = await oku(`${UC}/sections/${parca(k)}/${parca(p)}/${parca(b)}/pins/`);
      const pinler = pinlereCevir(y);
      if (pinler.length) return { durum: 'tamam', pinler, panoAdi: y.data?.board?.name || p, bolumOkunamadi: false };
      bolumOkunamadi = true;
    } catch {
      bolumOkunamadi = true;
    }
  }
  try {
    const y = await oku(`${UC}/boards/${parca(k)}/${parca(p)}/pins/`);
    const toplam = y.data?.board?.pin_count;
    return {
      durum: 'tamam', pinler: pinlereCevir(y), panoAdi: y.data?.board?.name || p, bolumOkunamadi,
      ...(typeof toplam === 'number' ? { toplam } : {})
    };
  } catch (e) {
    if (e instanceof BulunamadiHatasi) return { durum: 'yok' };
    throw e;
  }
}

export function panoPinleri(kullanici: string, pano: string, bolum?: string): Promise<PanoSonucu> {
  const anahtar = [kullanici, pano, bolum || ''].join('/').toLowerCase();
  const var_ = onbellek.get(anahtar);
  if (var_) return var_;
  const s = getir(kullanici, pano, bolum).catch((e): PanoSonucu => {
    // Bağlantı hatası önbellekte kalmaz: sonra yeniden denenebilsin
    onbellek.delete(anahtar);
    return { durum: 'hata', mesaj: e instanceof Error ? e.message : 'bilinmeyen' };
  });
  onbellek.set(anahtar, s);
  return s;
}
