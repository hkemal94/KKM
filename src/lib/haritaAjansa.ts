import type { Item } from '../types';
import type { HaritaDuzeni, KurucuBelge } from '../components/harita/duzenTipi';
import { DUZEN_SURUMU } from '../components/harita/duzenTipi';
import { ajansaDosyaYaz } from './tepsiAjansa';
import { haritaIsaretleri } from './haritaIsaretleri';
import { github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Haritayı ajansa gönder (4 Kasım, Kemal). Kurucu'da yapılanlar
 * `duzada/haritaDuzeni` belgesinde duruyor; ajanlar oraya erişemiyor. Kemal
 * Harita ve Kurucu'daki düğmeye basınca düzenin tamamı ajansın gizli
 * deposuna, `kkm/harita-duzeni.json`'a yazılır (viki aktarımıyla aynı yol,
 * `lib/vikiAjansa.ts`). Yalnız okumak içindir: KKM kayıtlarına ve harita
 * belgesine hiçbir şey yazılmaz. Her basışta önceki dosyanın yerine yenisi.
 *
 * 4 Kasım akşamı (Kemal):
 *   - Kurucu notları (`map_pin` iğneleri) ve madde işaretleri de gider
 *     (`notlar`, `maddeIsaretleri`).
 *   - Dosya büyükse (`PARCA_SINIRI` üstü) parçalara bölünür: ana dosya
 *     `kkm/harita-duzeni.json`, ötekiler `kkm/harita-duzeni-2.json`, `-3`…
 *     Ana dosyada `parcalar` listesi durur; yalnız listedeki dosyalar geçerli.
 *   - "Ajansa son gönderim" ana dosyanın son değiştiği an (GitHub'dan okunur).
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
  evdeOturanlar: 'Evde oturanlar, kişi başlıklarıyla.',
  notlar: "Kurucu'daki notlar (haritaya konan iğneler, Kemal'in ajansa notları): { id, konum [boylam, enlem], baslik, metin }.",
  maddeIsaretleri: 'Viki maddelerinin haritadaki işaretleri: { konum [boylam, enlem], baslik, madde (madde kimliği) }.',
  parcalar: "Dosya büyük olduğu için bölündü: veri bu dosyanın 'alanlar'ında ve listedeki parça dosyalarının 'alanlar'ında. Alan yolu ('kurucu.yeniBinalar' gibi) birden çok dosyada geçiyorsa nesneler birleştirilir, diziler uç uca eklenir. Listede olmayan eski parça dosyaları geçersiz."
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
  const isaretler = haritaIsaretleri(items);
  const notlar = isaretler.filter(i => i.tur === 'not').map(i => ({ id: i.id, konum: i.konum, baslik: i.ad, metin: i.metin || '' }));
  const maddeIsaretleri = isaretler.filter(i => i.tur === 'madde').map(i => ({ konum: i.konum, baslik: i.ad, madde: i.maddeId || '' }));

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
      mekan: Object.keys(duzen.mekanlar ?? {}).length,
      not: notlar.length,
      maddeIsareti: maddeIsaretleri.length
    },
    taslakHaritayaIslendi: islendi,
    kurucu: taslak ?? null,
    ...(duzen.kurucuIslenen && !islendi ? { kurucuIslenen: duzen.kurucuIslenen } : {}),
    mekanlar: duzen.mekanlar ?? {},
    hatlar: duzen.hatlar ?? {},
    yollar: duzen.yollar ?? {},
    maddeBaglari: [...maddeBaglari, ...mekanBaglari],
    evdeOturanlar,
    notlar,
    maddeIsaretleri
  };
}

export type HaritaDuzeniDosyasi = ReturnType<typeof haritaDuzeniDosyasi>;

/** Tek dosyanın üst sınırı (bayt); üstündeyse bölünür. GitHub 1 MB üstünü okurken zorlanıyor. */
export const PARCA_SINIRI = 900 * 1024;

/** Ana dosyada hep kalan küçük alanlar */
const KUCUK_ALANLAR = ['aciklama', 'olusturuldu', 'surum', 'guncelleme', 'sayilar', 'taslakHaritayaIslendi'];

const parcaYolu = (n: number) => (n === 1 ? HARITA_YOLU : HARITA_YOLU.replace(/\.json$/, `-${n}.json`));
const bayt = (s: string) => new TextEncoder().encode(s).length;
const metin = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
/** Değerin dosyadaki boyu: girintili yazılır, parça dosyasında 3 kat içeride (alanlar → yol → anahtar) */
const yazimBoyu = (d: unknown, anahtar = '') => {
  const j = JSON.stringify(d, null, 2) ?? 'null';
  return bayt(j) + (j.split('\n').length * 6) + bayt(anahtar) + 12;
};

/** Bölünecek en küçük birim: bir alan yolunun tek girdisi (nesnede anahtar, dizide öğe) */
interface Birim { yol: string; anahtar?: string; deger: unknown; boy: number }

const nesneMi = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function birimlereAyir(yol: string, v: unknown, cikti: Birim[], derin: boolean) {
  if (Array.isArray(v)) { for (const d of v) cikti.push({ yol, deger: d, boy: yazimBoyu(d) }); return; }
  if (nesneMi(v)) {
    for (const [k, d] of Object.entries(v)) {
      // Kurucu belgesinin alt alanları (yeniBinalar, doga…) ayrıca bölünür
      if (derin && ((nesneMi(d) && Object.keys(d).length > 0) || (Array.isArray(d) && d.length > 0))) birimlereAyir(`${yol}.${k}`, d, cikti, false);
      else cikti.push({ yol, anahtar: k, deger: d, boy: yazimBoyu(d, k) });
    }
    return;
  }
  cikti.push({ yol: '', anahtar: yol, deger: v, boy: yazimBoyu(v, yol) });
}

/** Birimleri `alanlar` nesnesine yerleştirir */
function alanlaraKoy(birimler: Birim[]) {
  const alanlar: Record<string, unknown> = {};
  for (const b of birimler) {
    if (b.anahtar === undefined) ((alanlar[b.yol] ??= []) as unknown[]).push(b.deger);
    else if (b.yol === '') alanlar[b.anahtar] = b.deger;
    else ((alanlar[b.yol] ??= {}) as Record<string, unknown>)[b.anahtar] = b.deger;
  }
  return alanlar;
}

/**
 * Gönderilecek dosyalar (saf iş): küçükse tek dosya, büyükse ana dosya + parçalar.
 * Ana dosya listenin SONUNDA (önce parçalar yazılsın, ana dosya hiç yazılmamış
 * parçayı göstermesin).
 */
export function haritaDosyalari(dosya: HaritaDuzeniDosyasi, sinir = PARCA_SINIRI): Array<{ yol: string; icerik: string }> {
  const tam = metin(dosya);
  if (bayt(tam) <= sinir) return [{ yol: HARITA_YOLU, icerik: tam }];

  const kucuk = Object.fromEntries(Object.entries(dosya).filter(([k]) => KUCUK_ALANLAR.includes(k)));
  const birimler: Birim[] = [];
  for (const [k, v] of Object.entries(dosya)) {
    if (KUCUK_ALANLAR.includes(k)) continue;
    birimlereAyir(k, v, birimler, k === 'kurucu' || k === 'kurucuIslenen');
  }
  // Boş alanlar da görünsün (ör. hiç not yoksa notlar: [])
  const bosAlanlar = Object.entries(dosya).filter(([k, v]) => !KUCUK_ALANLAR.includes(k) && (Array.isArray(v) ? !v.length : nesneMi(v) && !Object.keys(v).length));

  // Ana dosyada küçük alanlar ve parça listesi için yer bırakılır
  const anaPayi = bayt(metin(kucuk)) + 4096;
  const gruplar: Birim[][] = [[]];
  let doluluk = anaPayi;
  for (const b of birimler) {
    const tasar = doluluk + b.boy > sinir && gruplar[gruplar.length - 1].length > 0;
    if (tasar) { gruplar.push([]); doluluk = 512; }
    gruplar[gruplar.length - 1].push(b);
    doluluk += b.boy;
  }

  const parcalar = gruplar.map((g, n) => ({ yol: parcaYolu(n + 1), alanlar: [...new Set(g.map(b => b.yol || b.anahtar!))] }));
  const ana = {
    ...kucuk,
    bolundu: true,
    parcalar,
    alanlar: { ...Object.fromEntries(bosAlanlar), ...alanlaraKoy(gruplar[0]) }
  };
  const digerleri = gruplar.slice(1).map((g, n) => ({
    yol: parcaYolu(n + 2),
    icerik: metin({
      _aciklama: `Harita düzeninin ${n + 2}. parçası (toplam ${gruplar.length}). Ana dosya: ${HARITA_YOLU}; açıklamalar orada.`,
      olusturuldu: dosya.olusturuldu, parca: n + 2, toplam: gruplar.length, alanlar: alanlaraKoy(g)
    })
  }));
  return [...digerleri, { yol: HARITA_YOLU, icerik: metin(ana) }];
}

/** Dosyayı (gerekirse parçalayarak) ajansın ana dalına yazar; ana dosyanın GitHub adresini döner */
export async function haritayiGonder(anahtar: string, dosya: HaritaDuzeniDosyasi): Promise<{ adres: string; parca: number }> {
  const s = dosya.sayilar;
  const dosyalar = haritaDosyalari(dosya);
  let adres = '';
  for (const [n, d] of dosyalar.entries()) {
    const ek = dosyalar.length > 1 ? ` (${d.yol === HARITA_YOLU ? 'ana dosya' : `parça ${n + 2}`})` : '';
    adres = await ajansaDosyaYaz(anahtar, d.yol, d.icerik,
      `KKM harita düzeni: ${s.yeniBina} bina, ${s.ozelYapi} özel yapı, ${s.yeniYol} yol, ${s.maddeBagi} bağ, ${s.not} not${ek}`, 'harita düzeni');
  }
  return { adres, parca: dosyalar.length };
}

/** Ana dosyanın ajans deposunda son değiştiği an (son gönderim); dosya yoksa null */
export async function sonGonderim(anahtar: string): Promise<Date | null> {
  const l = await github<Array<{ commit: { committer?: { date?: string }; author?: { date?: string } } }>>(
    anahtar, `/repos/${AJANS_DEPOSU}/commits?path=${encodeURIComponent(HARITA_YOLU)}&per_page=1`);
  const t = l[0]?.commit.committer?.date || l[0]?.commit.author?.date;
  return t ? new Date(t) : null;
}
