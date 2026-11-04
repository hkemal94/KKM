import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { modelAdresi } from './binaKutuphanesi';

/**
 * 3B model yükleyici (4 Kasım). Modeller meshopt ile sıkıştırılmış; çözücü
 * three'nin kendi kütüphanesinden. Aynı model bir kez indirilir; harita ve
 * galeri aynı indirmeyi paylaşır. Bu dosya yalnız 3B açılınca yüklenir.
 */

let yukleyici: GLTFLoader | null = null;
const onbellek = new Map<string, Promise<GLTF>>();

export function modelYukle(dosya: string): Promise<GLTF> {
  const var_ = onbellek.get(dosya);
  if (var_) return var_;
  if (!yukleyici) {
    yukleyici = new GLTFLoader();
    yukleyici.setMeshoptDecoder(MeshoptDecoder);
  }
  const s = yukleyici.loadAsync(modelAdresi(dosya));
  // Hata olursa bir sonraki denemede yeniden indirilsin
  s.catch(() => onbellek.delete(dosya));
  onbellek.set(dosya, s);
  return s;
}
