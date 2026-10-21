import { useSyncExternalStore } from 'react';

/**
 * Çözülmüş galeri görsellerinin bellek önbelleği (21 Ekim). Veritabanına
 * dokunmaz; `maddeGorseli` gibi eşzamanlı kodlar buradan okur. Bir görsel
 * yüklenince sürüm artar, `useGorselSurumu()` kullanan ekranlar yenilenir.
 */

const cozulmus = new Map<string, string>();
let surum = 0;
const dinleyiciler = new Set<() => void>();

/** Çözülmüşse görüntülenecek adres, değilse undefined */
export const gorselAnlik = (ref: string): string | undefined => cozulmus.get(ref);

export function gorselOnbellegeKoy(ref: string, veri: string) {
  if (cozulmus.get(ref) === veri) return;
  cozulmus.set(ref, veri);
  surum++;
  dinleyiciler.forEach(f => f());
}

const abone = (f: () => void) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; };

/** Yeni görsel çözülünce ekranın yenilenmesi için (memo bağımlılığı da olur) */
export const useGorselSurumu = () => useSyncExternalStore(abone, () => surum, () => surum);
