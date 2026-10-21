import type { Item } from '../types';
import {
  WIKI_TYPES, TYPE_LABELS, isStub, bolgeAdi, getKunyeFields, getEkBilgiler,
  getArticleBody, mahalleEslesir, eslesmeBasligi, type KunyeField
} from '../components/wiki/wikiSchema';
import { faaliyetiSuz } from './zamanCizgisi';

/**
 * Düzada Evren Raporu (7 Ekim, Kemal: "kayıtlardan üret").
 *
 * 6 Ekim'deki rapor elle yazılmış cümlelerden oluşuyordu; bir kısmı kanona
 * uymuyordu (sabit "94 kişi", uydurma nüfus, eski otel simülasyonunun
 * kişileri) ve ekran, .md ve PDF birbirini tutmuyordu. Artık raporun tek
 * kaynağı bu dosya: içerik yalnız kayıtlardan gelir — ada ve mahalle
 * maddelerinin künyesi ve metni, kurum / mekân / kişi maddeleri, künyedeki
 * tarihler. Elle yazılmış kurgu cümlesi yok; boş olan "boş" görünür.
 * Ekran (DuzadaRaporu), .md ve PDF (raporPdf) aynı yapıyı okur.
 */

/** Harita üretecinin ölçtüğü değerler (`src/data/duzadaGeo.ts` başlığı) */
export const ADA_OLCULERI: [string, string][] = [
  ['Konum', '39,60° K · 25,85° D'],
  ['Yüzölçümü', '162,2 km²'],
  ['Doğu–batı', '18,7 km'],
  ['Kuzey–güney', '12,7 km'],
  ['Kıyı', '52,7 km'],
  ['Zirve', 'Ada Tepesi, 742 m']
];

/** Mahallelerin sırası; bunlardan başka "yer" maddesi varsa sona eklenir */
const MAHALLE_SIRASI = ['merkez', 'iskele', 'liman', 'stadyum', 'ciftlik'];

export interface RaporMaddesi {
  id: string;
  ad: string;
  tur: string;
  mahalle: string;
  /** Maddenin ilk paragrafı ya da künyesinin ilk satırları; yoksa boş */
  ozet: string;
  kunye: KunyeField[];
}

export interface RaporMahallesi extends RaporMaddesi {
  maddeSayisi: number;
}

export interface TarihSatiri {
  tarih: string;
  madde: string;
  maddeId: string;
  alan: string;
}

export interface EvrenRaporu {
  tarih: string;
  sayilar: { toplam: number; kisi: number; mekan: number; kurum: number; aile: number; olay: number; taslak: number; sitede: number };
  ada: RaporMaddesi | null;
  mahalleler: RaporMahallesi[];
  kurumlar: RaporMaddesi[];
  mekanlar: RaporMaddesi[];
  /** Cadde, meydan ve yer adları (8 Ekim) */
  yerler: RaporMaddesi[];
  aileler: RaporMaddesi[];
  olaylar: RaporMaddesi[];
  kisiler: RaporMaddesi[];
  tarihce: TarihSatiri[];
}

const kunyesi = (i: Item): KunyeField[] => [...getKunyeFields(i), ...getEkBilgiler(i)]
  .filter(f => f.id !== 'region' && f.value.trim());

/** İlk paragraf; çok uzunsa cümle sınırında kısalır */
function ilkParagraf(i: Item, sinir = 420): string {
  const govde = getArticleBody(i).map(b => b.text.trim()).find(Boolean) || '';
  let p = govde.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  if (p.length > sinir) {
    const kes = p.slice(0, sinir);
    const son = Math.max(kes.lastIndexOf('. '), kes.lastIndexOf('! '), kes.lastIndexOf('? '));
    p = son > sinir * 0.5 ? kes.slice(0, son + 1) : kes.trimEnd() + '…';
  }
  return p;
}

function maddeyeCevir(i: Item): RaporMaddesi {
  return {
    id: i.id,
    ad: i.title.trim(),
    tur: TYPE_LABELS[i.type] || i.type,
    mahalle: bolgeAdi(i.metadata?.region),
    ozet: ilkParagraf(i),
    kunye: kunyesi(i)
  };
}

const ada = (i: Item) => i.id === 'duzada_world_details' || i.title.trim().toLocaleLowerCase('tr') === 'düzada';
const sirala = (a: RaporMaddesi, b: RaporMaddesi) => a.ad.localeCompare(b.ad, 'tr');

/** Künyede tarih taşıyan satırlar: değerinde yıl, yüzyıl ya da "antik" geçer */
const TARIH_DEGERI = /\b(1\d{3}|20\d{2})\b|yüzyıl|\bantik\b/i;
const TARIH_ALANI = /kuruluş|kurulus|açılış|acilis|yapım|yapim|inşa|insa|faaliyet|oluşum|olusum|sayılma|kapan|dönüşüm|donusum|köken|koken|tarih|dönem|donem/i;

/** Sıralama için yaklaşık yıl: "19. yüzyıl" → 1800, "antik" → -500 */
function yaklasikYil(s: string): number {
  const y = s.match(/\b(1\d{3}|20\d{2})\b/);
  if (y) return Number(y[1]);
  const yy = s.match(/(\d{1,2})\.\s*yüzyıl/i);
  if (yy) return (Number(yy[1]) - 1) * 100;
  if (/antik/i.test(s)) return -500;
  return 9999;
}

export function evrenRaporu(items: Item[]): EvrenRaporu {
  const hepsi = items.filter(i => !i.archived && !i.isProposal && (i.area === 'duzada' || WIKI_TYPES.includes(i.type)));
  const viki = hepsi.filter(i => WIKI_TYPES.includes(i.type));
  const tur = (...t: string[]) => viki.filter(i => t.includes(i.type));

  const adaMaddesi = viki.find(ada) || null;
  const yerler = tur('yer').filter(i => !ada(i));
  const sira = (i: Item) => {
    const n = MAHALLE_SIRASI.findIndex(m => mahalleEslesir(m, eslesmeBasligi(i)));
    return n < 0 ? 99 : n;
  };
  const mahalleler: RaporMahallesi[] = [...yerler].sort((a, b) => sira(a) - sira(b) || a.title.localeCompare(b.title, 'tr'))
    .map(m => ({
      ...maddeyeCevir(m),
      maddeSayisi: viki.filter(i => i.id !== m.id && mahalleEslesir(i.metadata?.region, eslesmeBasligi(m))).length
    }));

  const tarihce: TarihSatiri[] = [];
  for (const i of viki) {
    for (const f of faaliyetiSuz(kunyesi(i))) {
      if (TARIH_ALANI.test(f.label) && TARIH_DEGERI.test(f.value)) {
        // "12 Mayıs 1957; köy döneminde…" → tarih "12 Mayıs 1957"; açıklama maddede
        const kisa = f.value.split(';')[0].trim();
        tarihce.push({ tarih: TARIH_DEGERI.test(kisa) ? kisa : f.value, madde: i.title.trim(), maddeId: i.id, alan: f.label });
      }
    }
  }
  tarihce.sort((a, b) => yaklasikYil(a.tarih) - yaklasikYil(b.tarih) || a.madde.localeCompare(b.madde, 'tr'));

  const kisiler = tur('kisi', 'karakter').map(maddeyeCevir).sort(sirala);
  const mekanlar = tur('mekân', 'dükkân').map(maddeyeCevir).sort(sirala);
  const yerAdlari = tur('cadde', 'meydan', 'yer_adi').map(maddeyeCevir).sort(sirala);
  const kurumlar = tur('kulüp', 'marka').map(maddeyeCevir).sort(sirala);
  const aileler = tur('aile').map(maddeyeCevir).sort(sirala);
  const olaylar = tur('olay').map(maddeyeCevir).sort(sirala);

  return {
    tarih: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
    sayilar: {
      toplam: viki.length,
      kisi: kisiler.length,
      mekan: mekanlar.length,
      kurum: kurumlar.length,
      aile: aileler.length,
      olay: olaylar.length,
      taslak: viki.filter(isStub).length,
      sitede: viki.filter(i => i.metadata?.sitede === true).length
    },
    ada: adaMaddesi ? maddeyeCevir(adaMaddesi) : null,
    mahalleler, kurumlar, mekanlar, yerler: yerAdlari, aileler, olaylar, kisiler, tarihce
  };
}

/** Kişinin listede görünecek kısa tanımı: mesleği ya da ilk künye satırı */
export function kisiTanimi(k: RaporMaddesi): string {
  const meslek = k.kunye.find(f => f.id === 'profession' || /meslek|rol|görev/i.test(f.label));
  return (meslek || k.kunye[0])?.value || '';
}

// --------------------------------------------------------------- markdown

const satirlar = (k: KunyeField[]) => k.map(f => `- **${f.label}:** ${f.value}`);
const bosMu = (s: string) => s.trim() || '_boş_';

export function raporMarkdown(r: EvrenRaporu): string {
  const s: string[] = [];
  s.push('# Düzada Evren Raporu', '', `Kems Komuta Merkezi · ${r.tarih}`, '');
  s.push('## Ada', '');
  s.push(...ADA_OLCULERI.map(([a, d]) => `- **${a}:** ${d}`));
  if (r.ada) s.push(...satirlar(r.ada.kunye), '', bosMu(r.ada.ozet));
  s.push('', '## Mahalleler', '');
  if (!r.mahalleler.length) s.push('_boş_', '');
  for (const m of r.mahalleler) {
    s.push(`### ${m.ad}`, '', ...satirlar(m.kunye), '', bosMu(m.ozet), '', `_${m.maddeSayisi} madde bu mahallede_`, '');
  }
  const liste = (baslik: string, x: RaporMaddesi[]) => {
    s.push(`## ${baslik} (${x.length})`, '');
    if (!x.length) s.push('_boş_');
    for (const m of x) s.push(`- **${m.ad}**${m.mahalle ? ` · ${m.mahalle}` : ''}${m.ozet ? ` — ${m.ozet}` : ''}`);
    s.push('');
  };
  liste('Kurumlar', r.kurumlar);
  liste('Mekânlar', r.mekanlar);
  liste('Cadde, meydan ve yer adları', r.yerler);
  liste('Aileler', r.aileler);
  liste('Olaylar', r.olaylar);
  s.push(`## Kişiler (${r.kisiler.length})`, '');
  if (!r.kisiler.length) s.push('_boş_');
  for (const k of r.kisiler) {
    const t = kisiTanimi(k);
    s.push(`- **${k.ad}**${t ? ` · ${t}` : ''}${k.mahalle ? ` · ${k.mahalle}` : ''}`);
  }
  s.push('', '## Tarihçe', '', '_Maddelerin künyesindeki tarihler._', '');
  if (!r.tarihce.length) s.push('_boş_');
  for (const t of r.tarihce) s.push(`- **${t.tarih}** · ${t.madde} (${t.alan.toLocaleLowerCase('tr')})`);
  s.push('', '## Durum', '',
    `- Viki maddesi: ${r.sayilar.toplam}`,
    `- Taslak: ${r.sayilar.taslak}`,
    `- Sitede gösterilen: ${r.sayilar.sitede}`, '');
  return s.join('\n');
}
