import type { Item } from '../types';
import { AJANS_DEPOSU } from './ajansDeposu';
import { ajansaGonder, gunAdi, kisaAd } from './ajansaGonder';
import { github } from './oyunAyarlari';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Yazıyı Yazı Editörü'ne gönder (22 Ekim, ajans). Ajansın Yazı Editörü KKM'yi
 * okuyamadığı için Kemal'in düğmesiyle tek bir blog yazısı ya da kitap bölümü
 * ajansın gizli deposuna `yazilar/GG-AA-YYYY-<kisa-konu>.md` olarak yazılır;
 * `isler/gelen/` altına da küçük bir iş notu düşer, sabah planı işi Yazı
 * Editörü'ne atar. Ajans metni yeniden yazmaz, yalnız not bırakır.
 *
 * - Aynı adda dosya varsa sonuna -2, -3 eklenir.
 * - Yazının kaydına `metadata.yaziEditorunuGonderildi` (ISO zaman) yazılır;
 *   bunu düğmenin bulunduğu ekran yapar (Kemal bastığı için).
 */

export const YAZI_KLASORU = 'yazilar';

export type YaziTuru = 'blog' | 'kitap';

/** Düğmenin gösterildiği türler: blog yazısı ve kitap bölümü */
export const yaziTuru = (i: Item): YaziTuru | null =>
  i.type === 'blog_post' ? 'blog' : i.type === 'kitap_bolum' ? 'kitap' : null;

/** Dosyanın içeriği (saf iş; ağ yok): başlık, tür, durum, kimlik, zaman, ardından metin aynen */
export function yaziDosyasi(yazi: Item, tur: YaziTuru, zaman = new Date()): string {
  return [
    `# ${yazi.title || 'Başlıksız'}`,
    '',
    `- Tür: ${tur}`,
    `- Durum: ${yazi.status || 'boş'}`,
    `- KKM kimliği: ${yazi.id}`,
    `- Gönderilme zamanı: ${zaman.toISOString()}`,
    '',
    '---',
    '',
    yazi.notes || '',
    '',
  ].join('\n');
}

/** Aynı adda dosya varsa -2, -3 ekleyerek boş bir yol bulur */
async function bosYol(anahtar: string, temel: string): Promise<string> {
  const bilgi = await github<{ default_branch: string }>(anahtar, `/repos/${AJANS_DEPOSU}`);
  let yol = `${temel}.md`;
  for (let n = 2; n < 50; n++) {
    try {
      await github(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}?ref=${encodeURIComponent(bilgi.default_branch)}`);
      yol = `${temel}-${n}.md`;
    } catch {
      break; // dosya yok: bu ad boş
    }
  }
  return yol;
}

/** Yazıyı ve iş notunu ajansa yazar; yazının GitHub adresini ve gönderim zamanını (ISO) döner */
export async function yaziyiGonder(anahtar: string, yazi: Item, tur: YaziTuru, zaman = new Date()): Promise<{ adres: string; zaman: string }> {
  const konu = kisaAd(yazi.title);
  const yol = await bosYol(anahtar, `${YAZI_KLASORU}/${gunAdi(zaman)}-${konu}`);
  // gizli depo denetimi burada: depo açıksa hiçbir şey yazılmaz
  const adres = await ajansaDosyaYaz(anahtar, yol, yaziDosyasi(yazi, tur, zaman), `KKM yazısı: ${yazi.title}`, 'yazı');
  await ajansaGonder(anahtar, `yazi-notu-${konu}`,
    `# Yazı Editörü'ne not\n\nYazı Editörü'ne not: ${yol}\n\n- Tür: ${tur}\n- Başlık: ${yazi.title}\n- Gönderen: Kemal (KKM → ${tur === 'blog' ? 'Blog' : 'Kitap'} → Yazı Editörü'ne gönder)\n`, zaman);
  return { adres, zaman: zaman.toISOString() };
}
