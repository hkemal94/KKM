import type { Item } from '../types';
import type { HaritaDuzeni, KurucuBelge } from '../components/harita/duzenTipi';
import { DUZEN_SURUMU } from '../components/harita/duzenTipi';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * Haritayı ajansa gönder (4 Kasım, Kemal). Kurucu'da yapılanlar
 * `duzada/haritaDuzeni` belgesinde duruyor; ajanlar oraya erişemiyor. Kemal
 * Harita ve Kurucu'daki düğmeye basınca düzenin tamamı ajansın gizli
 * deposuna, `kkm/harita-duzeni.json`'a yazılır (viki aktarımıyla aynı yol,
 * `lib/vikiAjansa.ts`). Yalnız okumak içindir: KKM kayıtlarına ve harita
 * belgesine hiçbir şey yazılmaz. Her basışta önceki dosyanın yerine yenisi.
 */

export const HARITA_YOLU = 'kkm/harita-duzeni.json';

const ACIKLAMA: Record<string, string> = {
  _genel: "KKM'deki Harita ve Kurucu düzeni. Kemal 'Haritayı ajansa gönder'e basınca yazılır; elle düzenlenmez. Koordinatlar [boylam, enlem]. Düz sayı dizileri (n) sırayla [boylam0, enlem0, boylam1, enlem1, …] demektir.",
  guncelleme: 'Düzenin KKM\'de son değiştiği an.',
  kurucu: "Kurucu taslağı (Kurucu'da şu an görünen hâl).",
  'kurucu.yeniYollar': 'Kurucu\'da çizilen yeni yollar: kimlik → { tur, n }.',
  'kurucu.turDegisikligi': 'Haritadan gelen yolun ya da yapının türü değişti: kimlik → yeni tür.',
  'kurucu.gizlenen': 'Haritadan kaldırılan (gizlenen) üretilmiş yolların ve yapıların kimlikleri.',
  'kurucu.yeniBinalar': 'Kurucu\'da konan binalar: kimlik → { tur, x (boylam), y (enlem), en, boy, aci (radyan), kat }.',
  'kurucu.ozelYapilar': 'Köşe köşe çizilen ya da anıt kalıbından konan özel yapılar: kimlik → { n, kat, cati (duz | besik), kalip }.',
  'kurucu.doga': 'Doğa alanları (zeytinlik, orman, kumsal…): kimlik → { tur, n }.',
  'kurucu.baglar': 'Yapı → viki maddesi kimliği. Okunur hâli: maddeBaglari.',
  'kurucu.oturanlar': 'Ev → orada oturan kişi maddelerinin kimlikleri. Okunur hâli: evdeOturanlar.',
  'kurucu.yolDuzeni': 'Haritadan gelen yolun yeni hâli (nokta taşındı ya da parça silindi): yol kimliği → { parça sırası → n }.',
  'kurucu.binaDuzeni': 'Haritadan gelen yapının düzeltmesi: kimlik → { dx, dy (metre, doğuya / güneye), aci (radyan), kat, tur }.',
  kurucuIslenen: "Kurucu'da 'Haritaya işle'ye basıldığı andaki hâl; 3B harita bunu gösterir. Taslakla aynıysa yazılmaz (taslakHaritayaIslendi: true).",
  taslakHaritayaIslendi: 'true: taslak haritaya işlenmiş hâlle aynı. false: taslakta haritaya işlenmemiş değişiklik var.',
  mekanlar: 'Mekân düzeltmeleri ve elle eklenen mekânlar: kimlik → { yeni, ad, tur, konum, silindi, mahalle, wikiId, taban, yukseklik, yaricap }.',
  hatlar: 'Üreteçten farklı olan sınır hatları: kimlik → [[boylam, enlem], …].',
  yollar: 'Üreteçten farklı olan yollar (eski harita düzenleyicisi): kimlik → [[boylam, enlem], …].',
  maddeBaglari: 'Yapı ile viki maddesi bağları, madde başlığıyla. Bağı olmayan (silinmiş) madde maddeBaslik: null.',
  evdeOturanlar: 'Evde oturanlar, kişi başlıklarıyla.'
};

const baslikBul = (kimlik: Map<string, Item>) => (id: string) => kimlik.get(id)?.title ?? null;

/** Gönderilecek dosyanın içeriği (saf iş; ağ yok) */
export function haritaDuzeniDosyasi(duzen: HaritaDuzeni, items: Item[], zaman = new Date()) {
  const baslik = baslikBul(new Map(items.map(i => [i.id, i])));
  const taslak: KurucuBelge | undefined = duzen.kurucu ?? duzen.kurucuIslenen;
  const islendi = !!taslak && !!duzen.kurucuIslenen && JSON.stringify(taslak) === JSON.stringify(duzen.kurucuIslenen);

  const maddeBaglari = Object.entries(taslak?.baglar ?? {}).map(([yapi, maddeId]) => ({ yapi, maddeId, maddeBaslik: baslik(maddeId) }));
  const mekanBaglari = Object.entries(duzen.mekanlar ?? {})
    .filter(([, m]) => typeof m.wikiId === 'string' && m.wikiId)
    .map(([mekan, m]) => ({ yapi: mekan, maddeId: m.wikiId as string, maddeBaslik: baslik(m.wikiId as string), mekanKaydindan: true }));
  const evdeOturanlar = Object.entries(taslak?.oturanlar ?? {}).map(([ev, kisiler]) => ({
    ev, kisiler: kisiler.map(id => ({ id, baslik: baslik(id) }))
  }));

  return {
    aciklama: ACIKLAMA,
    olusturuldu: zaman.toISOString(),
    surum: duzen.surum || DUZEN_SURUMU,
    guncelleme: duzen.guncelleme ? new Date(duzen.guncelleme).toISOString() : null,
    sayilar: {
      yeniYol: Object.keys(taslak?.yeniYollar ?? {}).length,
      yeniBina: Object.keys(taslak?.yeniBinalar ?? {}).length,
      ozelYapi: Object.keys(taslak?.ozelYapilar ?? {}).length,
      doga: Object.keys(taslak?.doga ?? {}).length,
      maddeBagi: maddeBaglari.length + mekanBaglari.length,
      gizlenen: (taslak?.gizlenen ?? []).length,
      mekan: Object.keys(duzen.mekanlar ?? {}).length
    },
    taslakHaritayaIslendi: islendi,
    kurucu: taslak ?? null,
    ...(duzen.kurucuIslenen && !islendi ? { kurucuIslenen: duzen.kurucuIslenen } : {}),
    mekanlar: duzen.mekanlar ?? {},
    hatlar: duzen.hatlar ?? {},
    yollar: duzen.yollar ?? {},
    maddeBaglari: [...maddeBaglari, ...mekanBaglari],
    evdeOturanlar
  };
}

export type HaritaDuzeniDosyasi = ReturnType<typeof haritaDuzeniDosyasi>;

/** Dosyayı ajansın ana dalına yazar; GitHub adresini döner */
export function haritayiGonder(anahtar: string, dosya: HaritaDuzeniDosyasi): Promise<string> {
  const s = dosya.sayilar;
  return ajansaDosyaYaz(anahtar, HARITA_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM harita düzeni: ${s.yeniBina} bina, ${s.ozelYapi} özel yapı, ${s.yeniYol} yol, ${s.maddeBagi} bağ`, 'harita düzeni');
}
