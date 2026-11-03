import type { Item } from '../types';
import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { yeniGonderi, type Asama } from './sosyal';

/**
 * Ajansın gönderi taslakları (3 Kasım, Kemal: "her gönderi ayrı olsun",
 * "KKM İçerik'te gönderi kartı + Canva tasarımı").
 *
 * Ajans gizli deposuna `kkm/gonderiler.json` bırakır: her biri bir gönderi
 * (kanal, metin, etiketler, Canva bağlantısı, tarih, hazırlayan ajan,
 * durum). KKM yalnız okur; dosya yoksa liste sessizce boş. Kemal "Benim
 * listeme al" deyince taslak onun gönderilerine kopyalanır; kayda yalnız o
 * basışta yazılır. Paylaşımı Kemal yapar, ajans "paylaşıldı" yazamaz.
 */

export const GONDERILER_YOLU = 'kkm/gonderiler.json';

export interface AjansGonderisi {
  id: string;
  /** instagram · x · tiktok */
  kanal: string;
  metin: string;
  etiketler: string[];
  canva?: string;
  /** 'YYYY-MM-DD' */
  tarih?: string;
  ajan: string;
  /** taslak · onayda · onaylandi */
  durum: string;
}

/** Ajansın kanal adı → KKM'deki kanal (TikTok, YouTube Shorts ile tek kanal) */
const KANAL_ESI: Record<string, string> = {
  instagram: 'instagram', ig: 'instagram',
  x: 'x', twitter: 'x', threads: 'x',
  tiktok: 'tiktok', youtube: 'tiktok', shorts: 'tiktok'
};
export const kanalEsi = (k: string) => KANAL_ESI[k.trim().toLowerCase()] || '';

/** Ajansın durumu → KKM aşaması; "paylaşıldı" ajanstan gelmez */
const DURUM_ESI: Record<string, Asama> = { taslak: 'Taslak', onayda: 'Onayda', onaylandi: 'Onaylandı', 'onaylandı': 'Onaylandı' };
export const durumEsi = (d: string): Asama => DURUM_ESI[d.trim().toLowerCase()] || 'Taslak';

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

/** Ajansın taslaklarını okur; dosya yoksa ya da bozuksa boş liste. Anahtar depoyu göremiyorsa hata. */
export async function gonderileriOku(anahtar: string): Promise<AjansGonderisi[]> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${GONDERILER_YOLU}`);
    let j: unknown;
    try { j = JSON.parse(base64Coz(d.content)); } catch { return []; }
    const dizi = Array.isArray(j) ? j : [];
    return dizi
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof (g as { id?: unknown }).id === 'string' && typeof (g as { metin?: unknown }).metin === 'string')
      .map(g => ({
        id: String(g.id),
        kanal: typeof g.kanal === 'string' ? g.kanal : '',
        metin: String(g.metin),
        etiketler: Array.isArray(g.etiketler) ? g.etiketler.filter((e): e is string => typeof e === 'string' && !!e.trim()) : [],
        ...(typeof g.canva === 'string' && g.canva.trim() ? { canva: g.canva.trim() } : {}),
        ...(typeof g.tarih === 'string' && TARIH.test(g.tarih) ? { tarih: g.tarih } : {}),
        ajan: typeof g.ajan === 'string' ? g.ajan : '',
        durum: typeof g.durum === 'string' ? g.durum : 'taslak'
      }));
  } catch (e) {
    if (e instanceof Error && /yazma izni yok/.test(e.message)) {
      try { await github(anahtar, `/repos/${AJANS_DEPOSU}`); }
      catch { throw new Error('anahtar Kems-Ajans deposunu göremiyor; GitHub\'da anahtarın ayarlarına bu depoyu ekle'); }
      return [];
    }
    throw e;
  }
}

/** Etiketler hashtag alanına: "#a #b" */
const hashtagYaz = (etiketler: string[]) => etiketler.map(e => (e.startsWith('#') ? e : `#${e}`)).join(' ');

/** Kemal'in listesinde bu taslaktan alınmış gönderi (varsa) */
export const alinmisMi = (items: Item[], g: AjansGonderisi) =>
  items.find(i => i.type === 'sosyal_gonderi' && !i.archived && i.metadata?.ajansGonderisi === g.id);

/** "Benim listeme al": Kemal'in gönderisi olarak yazılacak kayıt */
export function ajansGonderisindenKayit(g: AjansGonderisi) {
  const kanal = kanalEsi(g.kanal);
  const ilkSatir = g.metin.split('\n').map(s => s.trim()).find(Boolean) || '';
  const baslik = ilkSatir.length > 60 ? `${ilkSatir.slice(0, 57)}…` : ilkSatir;
  const kayit = yeniGonderi({
    kanallar: kanal ? [kanal] : [],
    hashtag: hashtagYaz(g.etiketler),
    ...(g.canva ? { canva: g.canva } : {}),
    ...(g.tarih ? { tarih: g.tarih } : {})
  }, baslik || 'Ajansın taslağı');
  return {
    ...kayit,
    notes: g.metin,
    status: durumEsi(g.durum),
    metadata: { ...kayit.metadata, ajansGonderisi: g.id, ...(g.ajan ? { ajansAjani: g.ajan } : {}) }
  };
}
