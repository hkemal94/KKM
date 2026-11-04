import { ajansaDosyaYaz } from './tepsiAjansa';
import { github, GithubHatasi } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Asset kararları (4 Kasım, Kemal: kararlar ayrı panoda değil KKM'de).
 * 3B galerideki her modelin kartında Kemal'in kararı: Tamam · Düzelt (not) · Sil.
 * Karar ajansın gizli deposuna `kkm/asset-kararlari.json` olarak yazılır; ajans
 * oradan okur ve gereğini yapar. Yalnız Kemal düğmeye basınca yazılır.
 *
 * Dosya: { "<model-kimliği>": { karar, not?, tarih } }; kimlik dosya adıdır
 * ("tas-ev", "merkez-meydani").
 */

export const ASSET_KARARLARI_YOLU = 'kkm/asset-kararlari.json';

export type AssetKarariTuru = 'tamam' | 'duzelt' | 'sil';
export interface AssetKarari { karar: AssetKarariTuru; not?: string; tarih: string }
export type AssetKararlari = Record<string, AssetKarari>;

export const KARAR_ADI: Record<AssetKarariTuru, string> = { tamam: 'Tamam', duzelt: 'Düzelt', sil: 'Sil' };

function base64Coz(b64: string): string {
  const ikili = atob(b64.replace(/\s/g, ''));
  const baytlar = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) baytlar[i] = ikili.charCodeAt(i);
  return new TextDecoder().decode(baytlar);
}

/** Ajans deposundaki kararlar; dosya yoksa boş */
export async function assetKararlariniOku(anahtar: string): Promise<AssetKararlari> {
  try {
    const d = await github<{ content?: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${ASSET_KARARLARI_YOLU}?t=${Date.now()}`);
    if (!d.content) return {};
    const veri = JSON.parse(base64Coz(d.content)) as unknown;
    return veri && typeof veri === 'object' && !Array.isArray(veri) ? (veri as AssetKararlari) : {};
  } catch (e) {
    if (e instanceof GithubHatasi && e.durum === 404) return {};
    throw e;
  }
}

/** Kararlar sırayla yazılır: art arda basışta biri öbürünü ezmesin */
let sira: Promise<unknown> = Promise.resolve();

/** Tek modelin kararını yazar (dosyanın güncel hâli okunur, yalnız o model değişir); yeni hâli döner */
export function assetKarariYaz(anahtar: string, kimlik: string, karar: AssetKarariTuru, not?: string): Promise<AssetKararlari> {
  const is = sira.then(async () => {
    const kararlar = await assetKararlariniOku(anahtar);
    const temizNot = (not ?? '').trim();
    kararlar[kimlik] = { karar, ...(temizNot ? { not: temizNot } : {}), tarih: new Date().toISOString() };
    const sirali = Object.fromEntries(Object.keys(kararlar).sort().map(k => [k, kararlar[k]]));
    await ajansaDosyaYaz(anahtar, ASSET_KARARLARI_YOLU, `${JSON.stringify(sirali, null, 2)}\n`,
      `KKM asset kararı: ${kimlik} · ${KARAR_ADI[karar]}`, 'asset kararı');
    return sirali;
  });
  sira = is.catch(() => undefined);
  return is;
}
