import { useEffect, useRef } from 'react';
import type { Item } from '../types';
import { anahtariOku } from './oyunAyarlari';

/**
 * Ajansa kendiliğinden gönderimin ortak kalıbı (3 Kasım; viki ve tepsi paylaşır).
 * KKM açıkken:
 *   - açılışta son gönderimden bu yana içerik değiştiyse bir kez (kısa gecikmeyle),
 *   - açıkken içerik değişince birkaç dakika bekleyip (art arda düzenlemeler tek gönderim olur).
 * Yalnız ajansın deposuna dosya yazılır; KKM kayıtlarına hiçbir şey yazılmaz.
 * GitHub anahtarı yoksa hiçbir şey yapmaz. Son gönderimin özeti ve zamanı bu tarayıcıda durur.
 */
export const ACILIS_BEKLE = 20_000;
export const DEGISIM_BEKLE = 3 * 60_000;

const oku = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const yaz = (k: string, d: string) => { try { localStorage.setItem(k, d); } catch { /* yalnız bu açılışta */ } };

/** İçeriğin kısa özeti: aynıysa yeniden gönderilmez */
export function ozet(metin: string): string {
  let h = 5381;
  for (let i = 0; i < metin.length; i++) h = ((h << 5) + h + metin.charCodeAt(i)) | 0;
  return `${metin.length}:${(h >>> 0).toString(36)}`;
}

export interface OtoGonderim<D> {
  /** Son gönderilen içeriğin özetinin bu tarayıcıdaki yeri */
  ozetYeri: string;
  /** Son kendiliğinden gönderim zamanının bu tarayıcıdaki yeri */
  zamanYeri: string;
  /** Kim için (uyarı yazısında) */
  ad: string;
  /** Gönderilecek dosya (saf iş; ağ yok) */
  hazirla: (items: Item[]) => D;
  /** Karşılaştırılacak metin: zaman damgası gibi her seferinde değişen alanlar hariç */
  karsilastir: (dosya: D) => string;
  /** Dosyanın içindeki gönderim zamanı */
  zaman: (dosya: D) => string;
  gonder: (anahtar: string, dosya: D) => Promise<unknown>;
}

export const sonGonderim = (zamanYeri: string): string => oku(zamanYeri);

/** `ayar` sabit olmalı (modül düzeyinde); her çizimde yenisi verilirse sayaç baştan kurulur */
export function useOtoGonder<D>(items: Item[], hazir: boolean, ayar: OtoGonderim<D>) {
  const ilk = useRef(true);
  const gidiyor = useRef(false);

  useEffect(() => {
    if (!hazir || !items.length) return;
    const bekle = ilk.current ? ACILIS_BEKLE : DEGISIM_BEKLE;
    const zaman = setTimeout(async () => {
      ilk.current = false;
      const a = ayar;
      const anahtar = anahtariOku();
      if (!anahtar || gidiyor.current) return;
      const dosya = a.hazirla(items);
      const yeniOzet = ozet(a.karsilastir(dosya));
      if (yeniOzet === oku(a.ozetYeri)) return;
      gidiyor.current = true;
      try {
        await a.gonder(anahtar, dosya);
        yaz(a.ozetYeri, yeniOzet);
        yaz(a.zamanYeri, a.zaman(dosya));
      } catch (e) {
        console.warn(`${a.ad} ajansa kendiliğinden gönderilemedi; sonraki değişiklikte yeniden denenecek:`, e);
      } finally {
        gidiyor.current = false;
      }
    }, bekle);
    return () => clearTimeout(zaman);
  }, [items, hazir, ayar]);
}
