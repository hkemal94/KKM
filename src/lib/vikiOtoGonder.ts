import type { Item } from '../types';
import { sonGonderim, useOtoGonder, type OtoGonderim } from './otoGonder';
import { sinirliVikiDosyasi, vikiDosyasi, vikiyiGonder } from './vikiAjansa';

/**
 * Vikiyi ajansa kendiliğinden gönder (3 Kasım, Kemal: "bunu her dakika ben mi
 * yapacağım?"; seçimi: "Değişince, KKM açıkken"). Viki yalnız KKM'den değiştiği için
 * KKM açıkken gönderim hiçbir değişikliği kaçırmaz. Kalıp `lib/otoGonder.ts`'te
 * (tepsi de paylaşır). Yalnız ajansın deposundaki `kkm/viki.json` yazılır.
 */
const ZAMAN_YERI = 'kkm-viki-son-gonderim';

type VikiDosyasi = ReturnType<typeof sinirliVikiDosyasi>['dosya'];

const VIKI: OtoGonderim<VikiDosyasi> = {
  ozetYeri: 'kkm-viki-son-ozet',
  zamanYeri: ZAMAN_YERI,
  ad: 'Viki',
  hazirla: items => sinirliVikiDosyasi(vikiDosyasi(items)).dosya,
  karsilastir: dosya => JSON.stringify({ ...dosya, olusturuldu: '' }),
  zaman: dosya => dosya.olusturuldu,
  gonder: vikiyiGonder,
};

export function sonOtoGonderim(): string { return sonGonderim(ZAMAN_YERI); }

export function useVikiOtoGonder(items: Item[], hazir: boolean) {
  useOtoGonder(items, hazir, VIKI);
}
