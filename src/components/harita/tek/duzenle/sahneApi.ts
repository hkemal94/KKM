import type * as THREE from 'three';
import type { Koleksiyon, Nokta, Yapi, Zemin } from '../tekVeri';
import type { Birlesik } from './birlesik';

/**
 * Tek harita ↔ Düzenle modu arası (7. adım). Tek harita sahnesini kurar, Düzenle modu
 * bu arayüzle zemine dokunulan yeri okur, katmanları taslakla yeniden çizdirir ve
 * dokunmaları (bas, sürükle, bırak) kendisi işler.
 */
export interface Isaretci {
  /** true dönerse dokunma Düzenle'nin: kamera o sürede dönmez, kaymaz */
  basildi?(e: PointerEvent, p: Nokta | null): boolean;
  tasindi?(e: PointerEvent, p: Nokta | null): void;
  birakildi?(e: PointerEvent, p: Nokta | null): void;
  /** Kısa dokunma (sürüklemesiz) */
  tiklandi?(e: PointerEvent, p: Nokta | null): void;
  /** Basılı değilken fare üstünde (önizleme) */
  uzerinde?(e: PointerEvent, p: Nokta | null): void;
  ciftTiklandi?(e: MouseEvent, p: Nokta | null): void;
}

export interface SahneApi {
  z: Zemin;
  temel: { yapilar: Yapi[]; yollar: Koleksiyon; yapiVerisi: Koleksiyon };
  sahne: THREE.Scene;
  /** Ekrandaki noktanın (istemci pikseli) zemindeki yeri; zemin yoksa null */
  zemineIsin(cx: number, cy: number): Nokta | null;
  /** Sahne noktasının kap içindeki pikseli; arkadaysa null */
  ekrana(x: number, y: number, z: number): [number, number] | null;
  kameraUzakligi(): number;
  /** Katmanları birleşik veriyle yeniden kurar; null: yalnız veri dosyaları */
  goster(b: Birlesik | null): void;
  /** Kamerayı bu noktaya yumuşakça götürür */
  uc(x: number, z: number): void;
  isaretci: Isaretci | null;
}
