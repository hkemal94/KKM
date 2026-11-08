/**
 * 3B deneme (8 Kasım, Kemal): Blender'da üretilen Düzada arazi parçalarının
 * adresi. Parçalar KKM'de değil, ayrı dosya deposunda durur
 * (`hkemal94/duzada-harita`) ve jsDelivr üzerinden iner.
 *
 * Yerel denemede (yalnız `npm run dev`) adres çubuğuna `?parca=http://localhost:PORT/`
 * yazılırsa kök o olur; yayındaki uygulamada bu parametre okunmaz.
 */
export const PARCA_KOKU = 'https://cdn.jsdelivr.net/gh/hkemal94/duzada-harita@main/';

/** Parça dosyalarının kökü; her zaman `/` ile biter */
export function parcaKoku(): string {
  if (import.meta.env.DEV) {
    try {
      const yerel = new URLSearchParams(window.location.search).get('parca');
      if (yerel) return yerel.endsWith('/') ? yerel : `${yerel}/`;
    } catch { /* adres okunamazsa yayındaki kök */ }
  }
  return PARCA_KOKU;
}
