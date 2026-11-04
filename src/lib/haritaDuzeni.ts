import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { hattiSadelestir } from './hatSadelestir';
import {
  DUZEN_SURUMU, type HaritaDuzeni, type KurucuBelge, type MekanDuzeni, type MekanKaydi
} from '../components/harita/duzenTipi';
import type { Nokta, SinirHatlari } from '../components/harita/sinirBolgeleri';
import { duzeniTasi, YENI_KOORDINAT_SURUMU } from '../components/harita/koordinatGocu';

/**
 * Harita düzeninin saklanması (H1).
 *
 * Yer: `duzada/haritaDuzeni` — tek belge, sabit yol.
 *
 * Kullanıcıya değil dünyaya ait. Açık erişim modunda uid tarayıcı
 * hafızasına bağlı olduğu için (App.tsx) kullanıcı altına yazmak düzeni
 * cihaza ve tarayıcıya bağlardı: başka cihazdan girince ya da tarayıcıyı
 * temizleyince kaybolmuş görünürdü. Kemal'in kararı: sabit yol.
 *
 * Firestore iç içe dizi kabul etmiyor ([[x,y],[x,y]] yazılamaz). Her hat
 * düz sayı dizisi olarak yazılıyor: [x0, y0, x1, y1, ...].
 *
 * İki kat güvence:
 *   1. Her kayıt ÖNCE bu tarayıcıya (localStorage) yazılır.
 *   2. Sonra Firestore'a. Firestore'a yazılamazsa yerel kopya kalır ve bir
 *      sonraki açılışta, buluttakinden yeniyse yeniden gönderilir.
 * Hangisi yeniyse o kazanır (`guncelleme` alanı).
 */

const KOLEKSIYON = 'duzada';
const BELGE = 'haritaDuzeni';
const YEREL_ANAHTAR = 'kems_harita_duzeni';
const belgeYolu = () => doc(db, KOLEKSIYON, BELGE);

type DuzHatlar = Record<string, number[]>;

interface Belge {
  surum: number;
  guncelleme: number;
  hatlar: DuzHatlar;
  yollar: DuzHatlar;
  /** Mekânlar (H3). Eski kayıtlarda yok. */
  mekanlar: MekanDuzeni;
  /** Kurucu taslağı. Eski kayıtlarda yok; yoksa hiç yazılmaz. */
  kurucu?: KurucuBelge;
  /** Kurucu'nun haritaya işlenmiş hâli. Yoksa hiç yazılmaz. */
  kurucuIslenen?: KurucuBelge;
}

const duzle = (h: SinirHatlari): DuzHatlar =>
  Object.fromEntries(Object.entries(h).map(([id, n]) => [id, n.flat()]));

const coz = (h: unknown): SinirHatlari => {
  if (!h || typeof h !== 'object') return {};
  const cikti: SinirHatlari = {};
  for (const [id, dizi] of Object.entries(h as Record<string, unknown>)) {
    if (!Array.isArray(dizi) || dizi.length < 4) continue;
    const n: Nokta[] = [];
    for (let i = 0; i + 1 < dizi.length; i += 2) {
      const x = Number(dizi[i]);
      const y = Number(dizi[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) n.push([x, y]);
    }
    if (n.length >= 2) cikti[id] = n;
  }
  return cikti;
};

/**
 * Firestore tanımsız (undefined) alan kabul etmiyor; tek bir tanımsız alan
 * bütün yazmayı düşürür. Mekân kaydındaki alanların çoğu isteğe bağlı
 * olduğu için yazmadan önce ayıklanıyor.
 */
const mekanlariTemizle = (m: MekanDuzeni | undefined): MekanDuzeni => {
  const cikti: MekanDuzeni = {};
  for (const [id, kayit] of Object.entries(m ?? {})) {
    const temiz: Record<string, unknown> = {};
    for (const [alan, deger] of Object.entries(kayit ?? {})) {
      if (deger !== undefined) temiz[alan] = deger;
    }
    cikti[id] = temiz as MekanKaydi;
  }
  return cikti;
};

const mekanlariCoz = (m: unknown): MekanDuzeni => {
  if (!m || typeof m !== 'object') return {};
  const cikti: MekanDuzeni = {};
  for (const [id, ham] of Object.entries(m as Record<string, unknown>)) {
    if (!ham || typeof ham !== 'object') continue;
    const k = ham as Record<string, unknown>;
    const kayit: MekanKaydi = {};
    if (typeof k.yeni === 'boolean') kayit.yeni = k.yeni;
    if (typeof k.ad === 'string') kayit.ad = k.ad;
    if (typeof k.tur === 'string') kayit.tur = k.tur;
    if (typeof k.silindi === 'boolean') kayit.silindi = k.silindi;
    if (typeof k.mahalle === 'string' || k.mahalle === null) {
      kayit.mahalle = k.mahalle as string | null;
    }
    if (typeof k.wikiId === 'string' || k.wikiId === null) {
      kayit.wikiId = k.wikiId as string | null;
    }
    for (const sayi of ['taban', 'yukseklik', 'yaricap'] as const) {
      if (Number.isFinite(k[sayi])) kayit[sayi] = Number(k[sayi]);
    }
    if (Array.isArray(k.konum) && k.konum.length >= 2
      && Number.isFinite(Number(k.konum[0])) && Number.isFinite(Number(k.konum[1]))) {
      kayit.konum = [Number(k.konum[0]), Number(k.konum[1])];
    }
    if (Object.keys(kayit).length) cikti[id] = kayit;
  }
  return cikti;
};

const belgeye = (d: HaritaDuzeni): Belge => {
  const b: Belge = {
    surum: DUZEN_SURUMU,
    guncelleme: d.guncelleme,
    hatlar: duzle(d.hatlar),
    yollar: duzle(d.yollar),
    mekanlar: mekanlariTemizle(d.mekanlar)
  };
  // Tanımsız alan yazılmaz: Firestore bütün kaydı reddeder
  if (d.kurucuIslenen) b.kurucuIslenen = kurucuyuTemizle(d.kurucuIslenen);
  if (d.kurucu) {
    // Taslak haritaya işlenenle aynıysa ikinci kopya yazılmaz (2 Ekim gece,
    // kayıt boyutu): Kurucu taslak yoksa işleneni açar.
    const taslak = kurucuyuTemizle(d.kurucu);
    if (!b.kurucuIslenen || JSON.stringify(taslak) !== JSON.stringify(b.kurucuIslenen)) b.kurucu = taslak;
  }
  return b;
};

/**
 * Ana sayfadaki "Bekleyen işler" için (3 Ekim): harita kaydı şişmiş mi,
 * Kurucu taslağı haritaya işlenmemiş mi? Şişmiş: yazılacak temiz hâli
 * bugünkünden %20'den fazla küçük.
 */
export function haritaKaydiDurumu(d: HaritaDuzeni | null): { sisik: boolean; islenmemis: boolean } {
  if (!d) return { sisik: false, islenmemis: false };
  const ham = JSON.stringify({ k: d.kurucu ?? null, i: d.kurucuIslenen ?? null }).length;
  const temiz = belgeye(d);
  const yeni = JSON.stringify({ k: temiz.kurucu ?? null, i: temiz.kurucuIslenen ?? null }).length;
  const islenmemis = !!d.kurucu && JSON.stringify(oturansiz(kurucuyuTemizle(d.kurucu)))
    !== JSON.stringify(d.kurucuIslenen ? oturansiz(kurucuyuTemizle(d.kurucuIslenen)) : null);
  return { sisik: ham > 20000 && yeni < ham * 0.8, islenmemis };
}

const sayilar = (n: unknown): number[] =>
  Array.isArray(n) ? n.map(Number).filter(Number.isFinite) : [];

const nesne = (x: unknown): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, any> : {}); // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Kurucu taslağını yazılabilir hâle getirir (tanımsız / bozuk alan atılır).
 *
 * 30 Eylül: özel yapı, doğa ve madde bağı alanları burada unutulmuştu;
 * kayıtta düşüyor, sayfa yenilenince kayboluyordu. Hepsi eklendi, yeni
 * yol ve bina düzeltmeleriyle birlikte.
 */
const kurucuyuTemizle = (k: KurucuBelge): KurucuBelge => ({
  ...kurucuTemelAlanlar(k),
  ozelYapilar: Object.fromEntries(
    Object.entries(nesne(k.ozelYapilar))
      .filter(([, o]) => o && sayilar(o.n).length >= 6)
      .map(([id, o]) => [id, {
        n: sayilar(o.n), kat: Math.min(Math.max(Math.round(Number(o.kat) || 1), 1), 30),
        cati: o.cati === 'besik' ? 'besik' : 'duz',
        ...(typeof o.kalip === 'string' && o.kalip ? { kalip: o.kalip } : {})
      }])
  ),
  doga: Object.fromEntries(
    Object.entries(nesne(k.doga))
      .filter(([, d]) => d && typeof d.tur === 'string' && sayilar(d.n).length >= 6)
      .map(([id, d]) => [id, { tur: d.tur, n: sayilar(d.n) }])
  ),
  baglar: Object.fromEntries(
    Object.entries(nesne(k.baglar)).filter(([, w]) => typeof w === 'string' && w)
  ),
  oturanlar: oturanlariTemizle(k.oturanlar),
  yolDuzeni: Object.fromEntries(
    Object.entries(nesne(k.yolDuzeni))
      .map(([id, parcalar]) => [id, Object.fromEntries(
        Object.entries(nesne(parcalar)).map(([i, n]) => [i, hattiSadelestir(sayilar(n))]).filter(([, n]) => (n as number[]).length >= 4)
      )] as const)
      .filter(([, p]) => Object.keys(p).length)
  ),
  binaDuzeni: Object.fromEntries(
    Object.entries(nesne(k.binaDuzeni))
      .filter(([, b]) => b && [b.dx, b.dy, b.aci].every(v => Number.isFinite(Number(v))))
      .map(([id, b]) => [id, {
        dx: Number(b.dx), dy: Number(b.dy), aci: Number(b.aci),
        ...(Number.isFinite(Number(b.kat)) && Number(b.kat) >= 1 ? { kat: Math.min(Math.round(Number(b.kat)), 30) } : {}),
        ...(typeof b.tur === 'string' && b.tur ? { tur: b.tur } : {})
      }])
  )
});

/** Ev → kişi kimlikleri: boş liste ve bozuk değer atılır, aynı kişi bir kez */
export const oturanlariTemizle = (o: unknown): Record<string, string[]> => Object.fromEntries(
  Object.entries(nesne(o))
    .map(([id, l]) => [id, Array.isArray(l) ? [...new Set(l.filter((x: unknown): x is string => typeof x === 'string' && !!x))] : []] as const)
    .filter(([, l]) => l.length)
);

/** "Haritaya işlenmemiş" sayılmasın diye oturanlar karşılaştırmadan çıkar (harita taslaktan okur) */
const oturansiz = (k: KurucuBelge): KurucuBelge => { const { oturanlar: _o, ...kalan } = k; return kalan; };

const kurucuTemelAlanlar = (k: KurucuBelge): KurucuBelge => ({
  surum: Number(k.surum) || 1,
  yeniYollar: Object.fromEntries(
    Object.entries(k.yeniYollar ?? {})
      .filter(([, y]) => y && Array.isArray(y.n) && typeof y.tur === 'string')
      .map(([id, y]) => [id, { tur: y.tur, n: hattiSadelestir(y.n.map(Number).filter(Number.isFinite)) }])
  ),
  turDegisikligi: Object.fromEntries(
    Object.entries(k.turDegisikligi ?? {}).filter(([, t]) => typeof t === 'string')
  ),
  gizlenen: (k.gizlenen ?? []).filter(x => typeof x === 'string'),
  yeniBinalar: Object.fromEntries(
    Object.entries(k.yeniBinalar ?? {})
      .filter(([, b]) => b && typeof b.tur === 'string'
        && [b.x, b.y, b.en, b.boy, b.aci].every(v => Number.isFinite(Number(v))))
      .map(([id, b]) => [id, {
        tur: b.tur, x: Number(b.x), y: Number(b.y), en: Number(b.en), boy: Number(b.boy), aci: Number(b.aci),
        ...(Number.isFinite(Number(b.kat)) && Number(b.kat) >= 1 ? { kat: Math.min(Math.round(Number(b.kat)), 30) } : {})
      }])
  )
});

const belgeden = (b: unknown): HaritaDuzeni | null => {
  if (!b || typeof b !== 'object') return null;
  const v = b as Partial<Belge>;
  const d = belgedenHam(v);
  // Eski koordinattaki belge (surum 1): okunurken yeni yere çevrilir
  if (Number(v.surum ?? 1) < YENI_KOORDINAT_SURUMU) {
    return { ...duzeniTasi(d), eskiKoordinat: true };
  }
  return d;
};

const belgedenHam = (v: Partial<Belge>): HaritaDuzeni => {
  return {
    surum: Number(v.surum ?? DUZEN_SURUMU),
    guncelleme: Number(v.guncelleme ?? 0),
    hatlar: coz(v.hatlar),
    yollar: coz(v.yollar),
    mekanlar: mekanlariCoz(v.mekanlar),
    ...(v.kurucu && typeof v.kurucu === 'object'
      ? { kurucu: kurucuyuTemizle(v.kurucu as KurucuBelge) }
      : {}),
    ...(v.kurucuIslenen && typeof v.kurucuIslenen === 'object'
      ? { kurucuIslenen: kurucuyuTemizle(v.kurucuIslenen as KurucuBelge) }
      : {})
  };
};

// ---- gömülü düzen (4 Kasım) ----------------------------------------------

/**
 * Kurucu'nun depoya gömülü hâli (`data/kurucuGomulu.ts`,
 * `scripts/kurucuyuGom.mjs` ile ajansa gönderilen dosyadan üretilir).
 *
 * Yalnız kayıt yoksa ya da kayıtta Kurucu işi hiç yoksa yerine geçer; kayıt
 * varsa kayıt kazanır. Üst üste bindirilmez: harita ya kaydın Kurucu
 * hâlini ya gömülü hâli çizer, ikisini birden değil. Kendi başına kayda
 * yazmaz; Kemal bir şeyi kaydedince kayda onun gördüğü hâl yazılır.
 *
 * Ayrı parça olarak yüklenir (ana paket büyümesin).
 */
let gomuluSozu: Promise<HaritaDuzeni | null> | null = null;
let gomuluBellek: HaritaDuzeni | null = null;

function gomuluyuYukle(): Promise<HaritaDuzeni | null> {
  gomuluSozu ??= import('../data/kurucuGomulu')
    .then(m => {
      const g = m.GOMULU_DUZEN;
      gomuluBellek = {
        surum: DUZEN_SURUMU,
        guncelleme: 0,
        hatlar: g.hatlar ?? {},
        yollar: g.yollar ?? {},
        mekanlar: mekanlariCoz(g.mekanlar),
        ...(g.kurucuIslenen ? { kurucuIslenen: kurucuyuTemizle(g.kurucuIslenen) } : {})
      };
      return gomuluBellek;
    })
    .catch(e => { console.error('[harita düzeni] gömülü düzen yüklenemedi', e); return null; });
  return gomuluSozu;
}

/** Kayıt + gömülü düzen → ekranda görünecek düzen (saf iş) */
export function gomuluyleTamamla(d: HaritaDuzeni | null, g: HaritaDuzeni | null): HaritaDuzeni | null {
  if (!g) return d;
  if (!d) return g;
  if (!d.kurucu && !d.kurucuIslenen && g.kurucuIslenen) return { ...d, kurucuIslenen: g.kurucuIslenen };
  return d;
}

let bellekHam: string | null = null;
let bellekDuzen: HaritaDuzeni | null = null;

function yereldenOku(): HaritaDuzeni | null {
  try {
    const ham = localStorage.getItem(YEREL_ANAHTAR);
    if (!ham) return null;
    if (ham === bellekHam && bellekDuzen) return bellekDuzen;
    bellekHam = ham;
    bellekDuzen = belgeden(JSON.parse(ham));
    return bellekDuzen;
  } catch {
    return null;
  }
}

function yereleYaz(d: HaritaDuzeni) {
  try {
    const str = JSON.stringify(belgeye(d));
    bellekHam = str;
    bellekDuzen = d;
    localStorage.setItem(YEREL_ANAHTAR, str);
  } catch { /* depolama kapalıysa bulut yine dener */ }
}

export type KayitDurumu =
  | 'yukleniyor'
  | 'hazir'
  | 'kaydediliyor'
  | 'kaydedildi'
  | 'yerelde'; // buluta yazılamadı, bu tarayıcıda duruyor

/**
 * Firestore bağlantı yokken `setDoc` sonsuza dek bekler (yazıyı kuyruğa
 * alır, bağlantı gelince gönderir). Ekranın "Kaydediliyor…"da takılı
 * kalmaması için 8 sn sonra "yerelde" sayıyoruz; kuyruk yine de işler.
 */
async function buluta(d: HaritaDuzeni, gecUlasti?: () => void) {
  let zaman: ReturnType<typeof setTimeout> | undefined;
  let gecikti = false;
  const bekle = new Promise<never>((_, ret) => {
    zaman = setTimeout(() => { gecikti = true; ret({ code: 'zaman-asimi' }); }, 8000);
  });
  const yazi = setDoc(belgeYolu(), belgeye(d));
  // Zaman aşımından sonra yazı yine de ulaşırsa haber ver (30 Eylül:
  // "bağlantı yok" yazısı, kayıt aslında buluta gitmişken takılı kalıyordu)
  yazi.then(() => { if (gecikti) gecUlasti?.(); }).catch(() => { /* aşağıda yakalanıyor */ });
  try {
    await Promise.race([yazi, bekle]);
  } finally {
    clearTimeout(zaman);
  }
}

/**
 * Düzeni canlı dinler ve kaydetme işlevi verir.
 *
 * `duzen` her zaman elde olan en yeni hâldir (bulut ya da yerel).
 */
export function useHaritaDuzeni() {
  const [duzen, setDuzen] = useState<HaritaDuzeni | null>(() => yereldenOku());
  const [durum, setDurum] = useState<KayitDurumu>('yukleniyor');
  const [hata, setHata] = useState<string | null>(null);
  const [ilkYukleme, setIlkYukleme] = useState(false);
  const sonYazilan = useRef(0);
  const [gomulu, setGomulu] = useState<HaritaDuzeni | null>(gomuluBellek);
  const [gomuluHazir, setGomuluHazir] = useState(gomuluBellek !== null);
  useEffect(() => {
    let canli = true;
    gomuluyuYukle().then(g => { if (canli) { setGomulu(g); setGomuluHazir(true); } });
    return () => { canli = false; };
  }, []);
  // Ekranda görünen: kayıt, yoksa gömülü hâl
  const gorunen = useMemo(() => gomuluyleTamamla(duzen, gomulu), [duzen, gomulu]);
  // Harita düzenleyicisi kaydederken Kurucu taslağını bilmiyor; son hâl
  // burada tutulur ki taslak ezilmesin.
  const sonDuzen = useRef<HaritaDuzeni | null>(gorunen);
  useEffect(() => { sonDuzen.current = gorunen; }, [gorunen]);

  useEffect(() => {
    setDuzen(yereldenOku());
    setIlkYukleme(false);
    setDurum('yukleniyor');
    let ilk = true;

    // Bağlantı yoksa ilk yanıt çok gecikebilir: 5 sn sonra yerel kopyayla aç
    const yedekZaman = setTimeout(() => {
      if (!ilk) return;
      setIlkYukleme(true);
      setDurum('yerelde');
      setHata('bağlantı-yok');
    }, 5000);

    const birak = onSnapshot(
      belgeYolu(),
      snap => {
        const bulut = snap.exists() ? belgeden(snap.data()) : null;
        const yerel = yereldenOku();
        const bulutZaman = bulut?.guncelleme ?? 0;
        const yerelZaman = yerel?.guncelleme ?? 0;

        if (yerel && yerelZaman > bulutZaman) {
          // Önceki bir kayıt buluta ulaşamamış — şimdi gönder
          setDuzen(yerel);
          if (ilk) {
            setDurum('kaydediliyor');
            buluta(yerel)
              .then(() => { setDurum('kaydedildi'); setHata(null); })
              .catch(e => { setDurum('yerelde'); setHata(String(e?.code ?? e)); });
          }
        } else {
          // Kendi yazdığımızın yankısını tekrar işlemeye gerek yok
          if (!(bulut && bulutZaman === sonYazilan.current && !ilk)) {
            setDuzen(bulut);
            if (bulut) yereleYaz(bulut);
          }
          if (ilk) setDurum('hazir');
        }
        if (ilk) { ilk = false; setIlkYukleme(true); clearTimeout(yedekZaman); }
      },
      e => {
        // Okuma izni yok / bağlantı yok: yerel kopyayla devam
        console.error('[harita düzeni] okunamadı', e);
        setHata(String((e as { code?: string })?.code ?? e));
        setDurum('yerelde');
        setIlkYukleme(true);
        clearTimeout(yedekZaman);
      }
    );
    return () => { clearTimeout(yedekZaman); birak(); };
  }, []);

  const kaydet = useCallback(async (yeni: HaritaDuzeni): Promise<boolean> => {
    // Kayıt her zaman yeni koordinatta yazılır; "eski" işareti kalkar
    const { eskiKoordinat: _eski, ...temiz } = yeni;
    const d: HaritaDuzeni = { ...temiz, guncelleme: yeni.guncelleme || Date.now() };
    if (!('kurucu' in yeni) && sonDuzen.current?.kurucu) d.kurucu = sonDuzen.current.kurucu;
    if (!('kurucuIslenen' in yeni) && sonDuzen.current?.kurucuIslenen) d.kurucuIslenen = sonDuzen.current.kurucuIslenen;
    sonYazilan.current = d.guncelleme;
    yereleYaz(d);
    setDuzen(d);
    setDurum('kaydediliyor');
    try {
      await buluta(d, () => {
        // Arada daha yeni bir kayıt yoksa durumu düzelt
        if (sonYazilan.current === d.guncelleme) { setDurum('kaydedildi'); setHata(null); }
      });
      setDurum('kaydedildi');
      setHata(null);
      return true;
    } catch (e) {
      console.error('[harita düzeni] buluta yazılamadı', e);
      setDurum('yerelde');
      setHata(String((e as { code?: string })?.code ?? e));
      return false;
    }
  }, []);

  return { duzen: gorunen ?? null, durum, hata, ilkYukleme: ilkYukleme && gomuluHazir, kaydet };
}

// ---- yedekleme (K2) -------------------------------------------------------

/**
 * Harita düzeninin yedeğe girecek hâli.
 *
 * Yerel kopyadan okunuyor: her kayıt önce oraya yazıldığı için buluttakiyle
 * aynı ya da ondan yeni. Böylece yedek almak için ağ gerekmiyor.
 */
export function haritaDuzeniniYedekIcinOku(): unknown {
  try {
    const ham = localStorage.getItem(YEREL_ANAHTAR);
    return ham ? JSON.parse(ham) : null;
  } catch {
    return null;
  }
}

/** Yedekten gelen harita düzenini geri yazar — önce yerele, sonra buluta */
export async function haritaDuzeniniYedektenYaz(ham: unknown): Promise<void> {
  const d = belgeden(ham);
  if (!d) return;
  const belge = belgeye({ ...d, guncelleme: Date.now() });
  try { localStorage.setItem(YEREL_ANAHTAR, JSON.stringify(belge)); } catch { /* yok */ }
  await setDoc(belgeYolu(), belge);
}
