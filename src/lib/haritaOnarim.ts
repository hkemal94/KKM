import type { HaritaDuzeni, KurucuBelge } from '../components/harita/duzenTipi';

/**
 * Bozulan yol düzenleri (8 Ekim, Kemal: "Sahil yolu haritadan kayboldu").
 * Kayda yazılan her yol `lib/hatSadelestir.ts`'den geçiyordu; başı sonuna
 * eşit kapalı bir halkada (Sahil Yolu) uzaklık hep 0 ölçülüyor, yol iki
 * noktaya, 0 metreye iniyordu. Araç düzeldi; kayda yazılmış bozuk düzen bu
 * kartla silinir, yol üreteçteki hâline döner. Bütün parçaları birlikte
 * 1 metreden kısa düzen bozuk sayılır (gerçek bir düzenleme böyle olmaz).
 * Kemal'in kendi çizdiği kısa yollara dokunulmaz.
 */

const M_ENLEM = 111_320;
const M_BOYLAM = 111_320 * Math.cos((39.6 * Math.PI) / 180);

function uzunluk(n: number[]): number {
  let t = 0;
  for (let i = 2; i + 1 < n.length; i += 2) {
    t += Math.hypot((n[i] - n[i - 2]) * M_BOYLAM, (n[i + 1] - n[i - 1]) * M_ENLEM);
  }
  return t;
}

const bozuklar = (b: KurucuBelge | undefined): string[] =>
  Object.entries(b?.yolDuzeni ?? {})
    .filter(([, p]) => Object.values(p ?? {}).reduce((t, n) => t + uzunluk(n), 0) < 1)
    .map(([id]) => id);

/** Bozuk düzeni olan yollar (taslak ya da haritaya işlenmiş hâlde) */
export function bozukYollar(d: HaritaDuzeni | null): string[] {
  if (!d) return [];
  return Array.from(new Set([...bozuklar(d.kurucu), ...bozuklar(d.kurucuIslenen)]));
}

const temizle = (b: KurucuBelge): KurucuBelge => {
  const sil = new Set(bozuklar(b));
  return sil.size
    ? { ...b, yolDuzeni: Object.fromEntries(Object.entries(b.yolDuzeni ?? {}).filter(([id]) => !sil.has(id))) }
    : b;
};

/** Yazılacak düzen: bozuk yol düzenleri silinmiş */
export function yollariOnar(d: HaritaDuzeni): HaritaDuzeni {
  return {
    ...d,
    guncelleme: Date.now(),
    ...(d.kurucu ? { kurucu: temizle(d.kurucu) } : {}),
    ...(d.kurucuIslenen ? { kurucuIslenen: temizle(d.kurucuIslenen) } : {})
  };
}

/** Kartta görünen ad (harita verisi bu ekrana yüklenmesin diye kısa liste) */
const BILINEN: Record<string, string> = { yol_sahil: 'Sahil Yolu', yol_bag_merkez: 'Merkez Bağlantısı', yol_merkez_dag: 'Merkez Dağ Yolu' };
export const yolAdi = (id: string) => BILINEN[id] || id.replace(/^(yol|sokak)_/, '').replace(/_/g, ' ');
