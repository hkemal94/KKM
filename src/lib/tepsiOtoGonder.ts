import type { Item } from '../types';
import { sonGonderim, useOtoGonder, type OtoGonderim } from './otoGonder';
import { tepsiDosyasi, tepsiyiGonder, type TepsiDosyasi } from './tepsiAjansa';

/**
 * Tepsiyi ajansa kendiliğinden gönder (3 Kasım, Kemal: "tepsiyi kendi kendime ajansa
 * atmam gerekiyor"; seçimi viki gibi: değişince, KKM açıkken, açılışta da bir kez).
 * Kalıp `lib/otoGonder.ts`'te. Yalnız ajansın deposundaki `kkm/tepsi.json` yazılır;
 * KKM kayıtlarına hiçbir şey yazılmaz. Elle "Tepsiyi ajansa gönder" düğmesi de durur.
 */
const ZAMAN_YERI = 'kkm-tepsi-son-gonderim';

const TEPSI: OtoGonderim<TepsiDosyasi> = {
  ozetYeri: 'kkm-tepsi-son-ozet',
  zamanYeri: ZAMAN_YERI,
  ad: 'Tepsi',
  hazirla: items => tepsiDosyasi(items),
  // Gönderim zamanı hariç; günün soruları her gün başka sırayla gelir, sıra fark sayılmaz
  karsilastir: dosya => JSON.stringify({
    ...dosya, gonderildi: '',
    sorular: [...dosya.sorular].sort((a, b) => a.anahtar.localeCompare(b.anahtar)),
  }),
  zaman: dosya => dosya.gonderildi,
  gonder: tepsiyiGonder,
};

export function sonTepsiOtoGonderim(): string { return sonGonderim(ZAMAN_YERI); }

export function useTepsiOtoGonder(items: Item[], hazir: boolean) {
  useOtoGonder(items, hazir, TEPSI);
}
