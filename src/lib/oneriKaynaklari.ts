import { belgeyiOku, gorselAdresi, markdownuAyir, type Blok } from './depoBelgesi';

/**
 * Önerilerin dış kaynakları (21 Ekim). İkisi de yalnız OKUR; KKM kayıtlarına
 * ve oyunun deposuna hiçbir şey yazmaz.
 *
 *   - Türkçe Vikipedi: gerçek dünyadan bir madde, Düzada'daki benzerine örnek olsun diye.
 *   - Dondurmacı Kızlar deposu: yalnız evren bilgisi. Fiyat, süre, oran gibi
 *     oyun ayarları buradan geçerken ayıklanır (Kemal, 21 Ekim).
 */

export interface VikipediKaynagi { baslik: string; ozet: string; adres: string }

/** Vikipedi'nin kısa özet ucu. Bulunamazsa ya da ağ yoksa null (yuva başka kanala geçer) */
export async function vikipediOzeti(baslik: string): Promise<VikipediKaynagi | null> {
  try {
    const r = await fetch(`https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(baslik.replace(/ /g, '_'))}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const ozet = typeof j?.extract === 'string' ? j.extract.trim() : '';
    if (!ozet || j?.type === 'disambiguation') return null;
    return {
      baslik: typeof j.title === 'string' ? j.title : baslik,
      ozet: ozet.slice(0, 1500),
      adres: j?.content_urls?.desktop?.page || `https://tr.wikipedia.org/wiki/${encodeURIComponent(baslik.replace(/ /g, '_'))}`
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- Dondurmacı deposu

export const DONDURMACI_DEPOSU = 'hkemal94/DondumaciKizlar';
export const DONDURMACI_MADDESI = 'Dondurmacı Kızlar';

/** Yalnız bu başlıklı bölümler evren bilgisi sayılır; geri kalanı (mekanik, ekonomi, arayüz, karar tabloları…) oyunun işidir */
const EVREN_BASLIGI = /özet|dünya|kurgu|kanon/i;
/** Karar tablosundan yalnız bu satırlar geçer */
const EVREN_SATIRI = /^(kanon|dönem)$/i;
/** Sayı + birim varsa (₺, TL, sn, dk, %, x…) satır oyun ayarı sayılıp atılır */
const AYAR_SATIRI = /\d\s*(₺|tl\b|sn\b|saniye|dk\b|dakika|%|x\b|adet|puan|coin|altın)|[₺%]\s*\d/i;

export const ayarMi = (metin: string) => AYAR_SATIRI.test(metin);

/**
 * Belgeden yalnız evren bilgisini süzer (yer, dönem, sahip, hikâye): yalnız
 * "Oyunun özeti" ve "Dünya ve kurgu" bölümleri ile karar tablosundaki Kanon
 * ve Dönem satırları gider; sayı + birim içeren her satır ayrıca atılır.
 * Fiyat, süre, oran gibi oyun ayarları buradan geçmez. Saf fonksiyon.
 */
export function evrenBilgisiniSuz(md: string, sinir = 4000): string {
  const bloklar = markdownuAyir(md);
  const cikti: string[] = [];
  let icinde = false;
  for (const b of bloklar) {
    if (b.tur === 'baslik') { icinde = EVREN_BASLIGI.test(b.metin); continue; }
    if (b.tur === 'tablo') {
      for (const r of b.satirlar) {
        const ad = (r[0] || '').replace(/[*_~]/g, '').trim();
        if (EVREN_SATIRI.test(ad) && r[1] && !ayarMi(r[1])) cikti.push(`${ad}: ${r[1].replace(/[*~]/g, '')}`);
      }
      continue;
    }
    if (!icinde) continue;
    if (b.tur === 'paragraf') { if (!ayarMi(b.metin)) cikti.push(b.metin); }
    else if (b.tur === 'liste') { const o = b.ogeler.filter(x => !ayarMi(x)); if (o.length) cikti.push(o.map(x => `- ${x}`).join('\n')); }
  }
  return cikti.join('\n').slice(0, sinir);
}

/** Belgedeki taslak görsellerin adresleri (ham GitHub adresi), en çok 3 */
export function taslakGorselleri(depo: string, yol: string, bloklar: Blok[]): string[] {
  return bloklar
    .filter((b): b is Extract<Blok, { tur: 'gorsel' }> => b.tur === 'gorsel')
    .map(b => gorselAdresi(depo, yol, b.adres))
    .filter((a, n, d) => d.indexOf(a) === n)
    .slice(0, 3);
}

export interface DepoKaynagi { metin: string; gorseller: string[]; adres: string }

export async function depoKaynagi(): Promise<DepoKaynagi | null> {
  try {
    const { yol, metin } = await belgeyiOku(DONDURMACI_DEPOSU, ['docs/tasarim-belgesi.md']);
    const suzulen = evrenBilgisiniSuz(metin);
    if (suzulen.length < 80) return null;
    return {
      metin: suzulen,
      gorseller: taslakGorselleri(DONDURMACI_DEPOSU, yol, markdownuAyir(metin)),
      adres: `https://github.com/${DONDURMACI_DEPOSU}/blob/HEAD/${yol}`
    };
  } catch { return null; }
}
