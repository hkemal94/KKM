import { deleteDoc, doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';
import type { HaritaDuzeni, KurucuBelge, MekanDuzeni, Nokta, SinirHatlari } from '../components/harita/duzenTipi';

/**
 * Eski harita kaydı (`duzada/haritaDuzeni`): yalnız yedek işleri.
 *
 * Eski üç harita ve Kurucu 23 Kasım'da silindi (tek harita 11. adım); kaydı
 * canlı dinleyen ve yazan kod da onlarla gitti. Kalanlar: Harita yedeği kartı
 * ve Drive'a harita yedeği buluttaki kaydı olduğu gibi okur
 * (`buluttakiHaritaKaydi`), yedeğin özeti ve evde oturanların göç kartı onu
 * çözer (`haritaKaydiniCoz`). Kayda yazan kod yok; geri yükleme KKM-C'de
 * kalktı (git geçmişinde). Durum → Eksikler → "Eski harita kaydını sil"
 * kaydı yalnız Kemal basınca siler (`haritaKaydiniSil`).
 */

const belgeYolu = () => doc(db, 'duzada', 'haritaDuzeni');

const nesne = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

/** Tam sayı alanı: yalnız sıfırdan büyük olan */
const tamSayi = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
};

/** Kayıttaki düz hat dizisi [x0, y0, x1, y1, …] → noktalar */
const hatlariCoz = (h: unknown): SinirHatlari => {
  const cikti: SinirHatlari = {};
  for (const [id, dizi] of Object.entries(nesne(h))) {
    if (!Array.isArray(dizi) || dizi.length < 4) continue;
    const n: Nokta[] = [];
    for (let i = 0; i + 1 < dizi.length; i += 2) {
      const x = Number(dizi[i]), y = Number(dizi[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) n.push([x, y]);
    }
    if (n.length >= 2) cikti[id] = n;
  }
  return cikti;
};

/** Ev → kişi kimlikleri: boş liste ve bozuk değer atılır, aynı kişi bir kez (göç kartı okur) */
const oturanlariCoz = (o: unknown): Record<string, string[]> => Object.fromEntries(
  Object.entries(nesne(o))
    .map(([id, l]) => [id, Array.isArray(l) ? [...new Set(l.filter((x: unknown): x is string => typeof x === 'string' && !!x))] : []] as const)
    .filter(([, l]) => l.length)
);

/** Kurucu taslağı: zorunlu alanlar boşsa boş gelir, oturanlar temizlenir; öbürü olduğu gibi (yalnız sayılır, karşılaştırılır) */
const kurucuCoz = (k: unknown): KurucuBelge | undefined => {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return undefined;
  const v = k as Partial<KurucuBelge>;
  return {
    ...v,
    surum: Number(v.surum) || 1,
    yeniYollar: nesne(v.yeniYollar) as KurucuBelge['yeniYollar'],
    turDegisikligi: nesne(v.turDegisikligi) as KurucuBelge['turDegisikligi'],
    gizlenen: Array.isArray(v.gizlenen) ? v.gizlenen.filter((x): x is string => typeof x === 'string') : [],
    ...(v.oturanlar !== undefined ? { oturanlar: oturanlariCoz(v.oturanlar) } : {})
  };
};

/** Ham kayıt → harita düzeni (saf iş; yedek kartının özeti ve göç kartı için) */
export const haritaKaydiniCoz = (ham: unknown): HaritaDuzeni | null => {
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) return null;
  const v = ham as Record<string, unknown>;
  const kurucu = kurucuCoz(v.kurucu), kurucuIslenen = kurucuCoz(v.kurucuIslenen);
  return {
    surum: Number(v.surum) || 1,
    guncelleme: Number(v.guncelleme) || 0,
    hatlar: hatlariCoz(v.hatlar),
    yollar: hatlariCoz(v.yollar),
    mekanlar: nesne(v.mekanlar) as MekanDuzeni,
    ...(tamSayi(v.kurucuSayac) ? { kurucuSayac: tamSayi(v.kurucuSayac) } : {}),
    ...(tamSayi(v.adaKusagi) ? { adaKusagi: tamSayi(v.adaKusagi) } : {}),
    ...(kurucu ? { kurucu } : {}),
    ...(kurucuIslenen ? { kurucuIslenen } : {})
  };
};

/**
 * Harita yedeği için buluttaki kaydı olduğu gibi okur (18 Kasım).
 * Kayıt yoksa null.
 */
export async function buluttakiHaritaKaydi(): Promise<Record<string, unknown> | null> {
  const s = await getDocFromServer(belgeYolu());
  return s.exists() ? (s.data() as Record<string, unknown>) : null;
}

/**
 * Eski harita kaydını siler (tek harita 11. adım, KKM-C; Kemal, 23 Kasım:
 * harita yedeğinden sonra silinsin). Yalnız Eksikler kartındaki düğmeyle;
 * kural yalnız bu belgenin silinmesine izin verir (`firestore.rules`).
 */
export async function haritaKaydiniSil(): Promise<void> {
  await deleteDoc(belgeYolu());
}
