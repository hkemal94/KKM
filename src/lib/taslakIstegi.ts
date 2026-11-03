import type { Item } from '../types';
import { getKunyeFields, getArticleBody } from '../components/wiki/wikiSchema';

/*
 * Taslak maddeler için "öneri iste" (3 Kasım, Kemal: "taslak hâlindeki maddeler
 * için de öneri düğmeleri"). Eksikler'deki taslak listesi ve maddenin kendi
 * sayfası aynı istek metnini kullanır. Ayrı dosya: viki sayfası harita verisini
 * (eksikler.ts) indirmesin. Kayda hiçbir şey yazılmaz.
 */

/** Maddenin künyesinde boş kalan alanlar — "neyi eksik" satırı */
export function bosAlanlar(i: Item): string {
  const bos = getKunyeFields(i, { includeEmpty: true }).filter(f => !f.value).map(f => f.label.toLocaleLowerCase('tr'));
  const govde = getArticleBody(i).length === 0;
  const parcalar = [...(govde ? ['sayfa metni'] : []), ...bos];
  return parcalar.length ? `boş: ${parcalar.slice(0, 4).join(', ')}${parcalar.length > 4 ? '…' : ''}` : '';
}

/** Taslak madde listesini (en çok 40) viki editörüne gidecek istek metnine çevirir */
export function taslakIstegi(maddeler: Array<{ ad: string; not?: string }>): { metin: string; ajan: string } {
  const liste = maddeler.slice(0, 40).map(k => `- ${k.ad}${k.not ? ` (${k.not})` : ''}`).join('\n');
  const fazla = maddeler.length > 40 ? `\n… ve ${maddeler.length - 40} madde daha` : '';
  const bas = maddeler.length === 1
    ? `Viki: "${maddeler[0].ad}" maddesi taslak hâlde.`
    : `Eksikler: ${maddeler.length} madde taslak hâlde.`;
  return {
    metin: `${bas} Bu taslakları tamamlamak için aday metin/alan önerisi hazırla: yalnız vikide zaten yazan bilgiden; yeni bilgi uydurma, yalnız aday ver, bilinmeyeni aday cevaplı soru yap. Öneriler Ajansın kararları ya da Onay bekleyenler olarak gelsin.\n${liste}${fazla}`,
    ajan: 'viki-editoru'
  };
}
