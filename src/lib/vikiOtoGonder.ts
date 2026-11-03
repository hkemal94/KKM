import { useEffect, useRef } from 'react';
import type { Item } from '../types';
import { anahtariOku } from './oyunAyarlari';
import { sinirliVikiDosyasi, vikiDosyasi, vikiyiGonder } from './vikiAjansa';

/**
 * Vikiyi ajansa kendiliğinden gönder (3 Kasım, Kemal: "bunu her dakika ben mi
 * yapacağım?"; seçimi: "Değişince, KKM açıkken"). Viki yalnız KKM'den değiştiği için
 * KKM açıkken gönderim hiçbir değişikliği kaçırmaz:
 *   - açılışta son gönderimden bu yana viki değiştiyse bir kez,
 *   - açıkken viki değişince birkaç dakika bekleyip (art arda düzenlemeler tek gönderim olur).
 * Yalnız ajansın deposundaki `kkm/viki.json` yazılır; KKM kayıtlarına hiçbir şey yazılmaz.
 * GitHub anahtarı yoksa hiçbir şey yapmaz. Son gönderimin özeti ve zamanı bu tarayıcıda durur.
 */
const OZET_YERI = 'kkm-viki-son-ozet';
const ZAMAN_YERI = 'kkm-viki-son-gonderim';
const ACILIS_BEKLE = 20_000;
const DEGISIM_BEKLE = 3 * 60_000;

const oku = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const yaz = (k: string, d: string) => { try { localStorage.setItem(k, d); } catch { /* yalnız bu açılışta */ } };

/** İçeriğin kısa özeti (zaman damgası hariç): aynıysa yeniden gönderilmez */
function ozet(metin: string): string {
  let h = 5381;
  for (let i = 0; i < metin.length; i++) h = ((h << 5) + h + metin.charCodeAt(i)) | 0;
  return `${metin.length}:${(h >>> 0).toString(36)}`;
}

export function sonOtoGonderim(): string { return oku(ZAMAN_YERI); }

export function useVikiOtoGonder(items: Item[], hazir: boolean) {
  const ilk = useRef(true);
  const gidiyor = useRef(false);

  useEffect(() => {
    if (!hazir || !items.length) return;
    const bekle = ilk.current ? ACILIS_BEKLE : DEGISIM_BEKLE;
    const zaman = setTimeout(async () => {
      ilk.current = false;
      const anahtar = anahtariOku();
      if (!anahtar || gidiyor.current) return;
      const { dosya } = sinirliVikiDosyasi(vikiDosyasi(items));
      const yeniOzet = ozet(JSON.stringify({ ...dosya, olusturuldu: '' }));
      if (yeniOzet === oku(OZET_YERI)) return;
      gidiyor.current = true;
      try {
        await vikiyiGonder(anahtar, dosya);
        yaz(OZET_YERI, yeniOzet);
        yaz(ZAMAN_YERI, dosya.olusturuldu);
      } catch (e) {
        console.warn('Viki ajansa kendiliğinden gönderilemedi; sonraki değişiklikte yeniden denenecek:', e);
      } finally {
        gidiyor.current = false;
      }
    }, bekle);
    return () => clearTimeout(zaman);
  }, [items, hazir]);
}
