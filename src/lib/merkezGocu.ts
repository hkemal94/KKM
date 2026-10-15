import { HARITA_KUSAGI, type HaritaDuzeni, type KurucuBelge } from '../components/harita/duzenTipi';

/**
 * Harita yenilendi (8 Ekim): Merkez dört yol ağzında yeniden kuruldu, evler
 * arsalarıyla yeniden dizildi (H, Kemal: "yuvarlak şehir yapısını sil, ana
 * yolun çevresinde yeniden kur", "evleri bahçeleriyle birleştir").
 *
 * Kemal'in Kurucu kaydında eski haritaya ait şunlar kaldı:
 *   - eski Merkez'in evlerine, sokaklarına yaptığı taşıma ve kaldırmalar
 *     (o evler ve sokaklar artık yok);
 *   - öbür mahallelerde üretilmiş evlere (`konut_…`) yaptıkları: evler
 *     yeniden dizildiği için aynı kimlik artık başka bir evde;
 *   - Belediye, okul, pazar ve iki evin eski köydeki konum ayarı (yapılar
 *     yeni Merkez'de yeniden yerleşti);
 *   - eski köyün yerinde Kurucu'da çizdiği yol ve yapılar.
 * Hepsi Durum → Eksikler'deki kartla, Kemal basınca silinir; kayıt 2. kuşağa
 * geçer ve kart bir daha görünmez. Sonraki düzenlemelerine dokunulmaz.
 */

const ESKI_MERKEZ = ['konut_yer_merkez_', 'ev_yer_merkez_', 'sokak_yer_merkez_'];
const MERKEZ_KAMU = new Set(['bina_belediye', 'bina_okul', 'bina_pazar', 'bina_apt1', 'bina_apt2']);

/** Eski köyün yeri (üreteçte MERKEZ_KASABA), metre; yarıçapı */
const ESKI_KOY: [number, number] = [820, -430];
const ESKI_KOY_R = 560;
const metre = (lng: number, lat: number): [number, number] =>
  [(lng - 25.85) * 111320 * Math.cos((39.6 * Math.PI) / 180), (lat - 39.6) * 111132];
const eskiKoydeMi = (n: unknown): boolean => {
  if (!Array.isArray(n) || n.length < 2) return false;
  for (let i = 0; i + 1 < n.length; i += 2) {
    const [x, y] = metre(Number(n[i]), Number(n[i + 1]));
    if (Math.hypot(x - ESKI_KOY[0], y - ESKI_KOY[1]) > ESKI_KOY_R) return false;
  }
  return true;
};

/** Eski haritaya ait mi: ev / sokak kimliği (yeni Merkez'inkiler `konut_merkez_`) */
const eskiKimlik = (id: string) =>
  (id.startsWith('konut_') && !id.startsWith('konut_merkez_')) || ESKI_MERKEZ.some(o => id.startsWith(o));

export interface GocSayilari {
  evDuzeni: number;      // taşınmış / döndürülmüş ev
  gizlenen: number;      // kaldırılmış ev ya da sokak
  sokakDuzeni: number;   // düzenlenmiş sokak
  bag: number;           // maddeye bağlı ev
  kamu: number;          // kamu yapılarının eski ayarı
  kendiYol: number;      // eski köyde çizilen yol
  kendiYapi: number;     // eski köyde konan yapı / özel yapı / doğa alanı
}

const bos = (): GocSayilari => ({ evDuzeni: 0, gizlenen: 0, sokakDuzeni: 0, bag: 0, kamu: 0, kendiYol: 0, kendiYapi: 0 });

/** Belgenin temizlenmiş hâli ve ne gittiği */
function belgeyiTemizle(b: KurucuBelge): { belge: KurucuBelge; say: GocSayilari } {
  const say = bos();
  const kendiYol = Object.keys(b.yeniYollar ?? {}).filter(id => eskiKoydeMi(b.yeniYollar[id]?.n));
  const kendiBina = Object.keys(b.yeniBinalar ?? {}).filter(id => eskiKoydeMi([b.yeniBinalar[id]?.x, b.yeniBinalar[id]?.y]));
  const kendiOzel = Object.keys(b.ozelYapilar ?? {}).filter(id => eskiKoydeMi(b.ozelYapilar?.[id]?.n));
  const kendiDoga = Object.keys(b.doga ?? {}).filter(id => eskiKoydeMi(b.doga?.[id]?.n));
  const giden = new Set([...kendiYol, ...kendiBina, ...kendiOzel, ...kendiDoga]);
  say.kendiYol = kendiYol.length;
  say.kendiYapi = kendiBina.length + kendiOzel.length + kendiDoga.length;

  const disari = <T,>(r: Record<string, T> | undefined, sil: (id: string) => boolean, sayac?: keyof GocSayilari) =>
    Object.fromEntries(Object.entries(r ?? {}).filter(([id]) => {
      const git = sil(id);
      if (git && sayac) say[sayac]++;
      return !git;
    }));

  const binaDuzeni = Object.fromEntries(Object.entries(b.binaDuzeni ?? {}).filter(([id]) => {
    if (MERKEZ_KAMU.has(id)) { say.kamu++; return false; }
    if (eskiKimlik(id)) { say.evDuzeni++; return false; }
    return !giden.has(id);
  }));
  const gizlenen = (b.gizlenen ?? []).filter(id => {
    if (eskiKimlik(id)) { say.gizlenen++; return false; }
    return !giden.has(id);
  });
  const belge: KurucuBelge = {
    ...b,
    surum: HARITA_KUSAGI,
    yeniYollar: disari(b.yeniYollar, id => giden.has(id)),
    yeniBinalar: disari(b.yeniBinalar, id => giden.has(id)),
    turDegisikligi: disari(b.turDegisikligi, id => eskiKimlik(id) || giden.has(id), 'sokakDuzeni'),
    gizlenen,
    binaDuzeni,
    yolDuzeni: disari(b.yolDuzeni, id => eskiKimlik(id) || giden.has(id), 'sokakDuzeni'),
    baglar: disari(b.baglar, id => eskiKimlik(id) || giden.has(id), 'bag'),
    ...(b.ozelYapilar ? { ozelYapilar: disari(b.ozelYapilar, id => giden.has(id)) } : {}),
    ...(b.doga ? { doga: disari(b.doga, id => giden.has(id)) } : {})
  };
  return { belge, say };
}

const eskiMi = (b: KurucuBelge | undefined) => !!b && (Number(b.surum) || 1) < HARITA_KUSAGI;

/** Kart görünsün mü: kayıt eski haritaya göre */
export const haritaGocuGerekli = (d: HaritaDuzeni | null) => !!d && (eskiMi(d.kurucu) || eskiMi(d.kurucuIslenen));

/** Neler gidecek (taslak ve haritaya işlenmiş hâlin büyüğü) */
export function haritaGocuOzeti(d: HaritaDuzeni): GocSayilari {
  const t = d.kurucu && eskiMi(d.kurucu) ? belgeyiTemizle(d.kurucu).say : bos();
  const i = d.kurucuIslenen && eskiMi(d.kurucuIslenen) ? belgeyiTemizle(d.kurucuIslenen).say : bos();
  return Object.fromEntries((Object.keys(t) as Array<keyof GocSayilari>).map(k => [k, Math.max(t[k], i[k])])) as unknown as GocSayilari;
}

/** Yazılacak düzen: iki kurucu kaydı da temizlenmiş, 2. kuşak */
export function haritaGocu(d: HaritaDuzeni): HaritaDuzeni {
  return {
    ...d,
    guncelleme: Date.now(),
    ...(d.kurucu ? { kurucu: eskiMi(d.kurucu) ? belgeyiTemizle(d.kurucu).belge : d.kurucu } : {}),
    ...(d.kurucuIslenen ? { kurucuIslenen: eskiMi(d.kurucuIslenen) ? belgeyiTemizle(d.kurucuIslenen).belge : d.kurucuIslenen } : {})
  };
}
