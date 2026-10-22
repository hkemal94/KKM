import type { Item } from '../../types';

/**
 * Site ile Site yönetiminin ortak küçük parçaları (22 Ekim). Eskiden
 * ikisi birbirini içe aktarıyordu; yönetim ekranı ayrı yüklensin diye
 * ortak olanlar buraya alındı. Bağ tek yönlü: ikisi de buradan okur.
 */

/** "Taslağı önizle" ile açılan sitede taslak gösterilir (yalnız bu sekmede) */
export const TASLAK_ONIZLEME_ANAHTARI = 'kems_site_taslak_onizleme';

/** Sitede gösterilen maddeler: yalnız Kemal'in işaretledikleri */
export const sitedekiMaddeler = (items: Item[]) =>
  items.filter(i => i.metadata?.sitede === true && !i.archived && !i.isProposal);

/** Bir maddenin sitede hangi sayfada göründüğü (arama ve haritada gizli sayfayı ayıklamak için) */
export const maddeninSayfasi = (i: Item): 'urunler' | 'haberler' | 'viki' =>
  i.type === 'drop' || i.type === 'merch_urun' ? 'urunler' : i.type === 'blog_post' ? 'haberler' : 'viki';
