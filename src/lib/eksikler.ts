import type { AreaType, Item } from '../types';
import { HARITA_YAPILARI } from '../data/haritaYapilari';
import { isStub, getKunyeFields, getArticleBody } from '../components/wiki/wikiSchema';
import { getRol } from '../components/wiki/kunyeParser';
import { isEntityUnlinked } from '../utils/relations';
import { markaYapisi } from './markaYapisi';

/*
 * 1 Ekim (K-3): Neyin Eksik'in sayma kısmı Eksikler.tsx'ten buraya taşındı.
 * Ana sayfa da bu sayıları gösteriyor; bileşen ve harita verisi uygulama
 * açılırken inmesin diye ayrı dosya.
 */

/**
 * "Neyin eksik" paneli (A1).
 *
 * Anasayfada zaten sayılar vardı: 93 kişi, 43 mekân, 3 marka. Ama sayı
 * "ne yapmam lazım" sorusuna cevap vermiyor. 93 kişinin kaçının görevi boş,
 * haritadaki kaç yapının maddesi hiç açılmamış, hangi markanın sloganı yok —
 * bunları görmek için tek tek gezmek gerekiyordu.
 *
 * Bu panel onları tek ekranda topluyor. Her satır: kaç tane, neyin eksik,
 * tıklayınca nereye gidiyor. Hiçbir şey eksik değilse panel kendini gizler —
 * boş bir "her şey yolunda" kutusu yer kaplamasın.
 *
 * Kural: uydurma iş üretmiyor. Her satır gerçek bir veriden sayılıyor;
 * sayı sıfırsa satır yok.
 */

/**
 * Satırdaki tek tuşla çözüm (Kemal, 29 Eylül gece: "kısa bir tuşla madde
 * açma veya eksik dediği şeyleri yapma butonu"). Kayda yalnız basınca yazılır.
 */
export type Cozum =
  | { tur: 'madde-ac'; wikiId: string }
  | { tur: 'kayda-bagla'; wikiId: string; hedefId: string }
  | { tur: 'markaya-bagla'; hedefId: string; markaId: string; markaAdi: string };

export interface Eksik {
  anahtar: string;
  sayi: number;
  baslik: string;
  aciklama: string;
  alan: AreaType;
  /** Tıklayınca açılacak madde — varsa doğrudan oraya gider */
  hedefId?: string;
  /**
   * Bu başlığın altındaki kayıtlar ve her birinde eksik olan (29 Eylül,
   * Kemal: "basınca genel bir yere varıyor, direkt o başlığı öneri olarak
   * görebilmek isterim"). Satıra basınca liste yerinde açılır.
   */
  kayitlar?: Array<{ id?: string; ad: string; not?: string; cozum?: Cozum }>;
}

/** Maddenin künyesinde boş kalan alanlar — "neyi eksik" satırı */
function bosAlanlar(i: Item): string {
  const bos = getKunyeFields(i, { includeEmpty: true }).filter(f => !f.value).map(f => f.label.toLocaleLowerCase('tr'));
  const govde = getArticleBody(i).length === 0;
  const parcalar = [...(govde ? ['sayfa metni'] : []), ...bos];
  return parcalar.length ? `boş: ${parcalar.slice(0, 4).join(', ')}${parcalar.length > 4 ? '…' : ''}` : '';
}

/** Haritada maddesi olması gereken yapılar */
export function haritaBeklentisi(): Array<{ wikiId: string; ad: string }> {
  // Liste gen/duzada.py'de binalardan çıkarılır (otelin kuleleri tek sayılır)
  return HARITA_YAPILARI;
}

/**
 * Kişinin rolü belli mi.
 *
 * Rol ayrı bir metadata alanı DEĞİL: künye metninden, profilden ya da
 * etiketten çözülüyor. İlk yazdığımda metadata'da `gorev` diye bir alan
 * aradım, öyle bir alan yok, o yüzden 94 kişinin 94'ü "eksik" çıktı —
 * hiçbir işe yaramayan bir sayı. getRol uygulamanın kendi çözümleyicisi.
 */
function rolBos(i: Item): boolean {
  return !getRol(i).trim();
}

export function eksikleriCikar(items: Item[]): Eksik[] {
  const canli = items.filter(i => !i.archived);
  // Haritadaki yapıya sonradan bağlanan kayıtlar da sayılır (metadata.haritaWikiId)
  const kimlikler = new Set([...canli.map(i => i.id), ...canli.map(i => String(i.metadata?.haritaWikiId || '')).filter(Boolean)]);
  const trKucuk = (x: string) => x.trim().toLocaleLowerCase('tr');
  const eksikler: Eksik[] = [];

  // --- Harita: maddesi hiç açılmamış yapılar
  const maddesiz = haritaBeklentisi().filter(b => !kimlikler.has(b.wikiId));
  if (maddesiz.length) {
    eksikler.push({
      anahtar: 'harita-madde',
      sayi: maddesiz.length,
      baslik: 'yapının maddesi yok',
      aciklama: maddesiz.slice(0, 3).map(b => b.ad).join(', ')
        + (maddesiz.length > 3 ? '…' : '')
        + ' · aç, satırdaki düğmeyle maddesini kur',
      alan: 'duzada',
      kayitlar: maddesiz.map(b => {
        // Aynı adla kaydı zaten varsa (ör. kulüp) yeni madde açılmaz, bağlanır
        const var_ = canli.find(i => !i.isProposal && trKucuk(i.title) === trKucuk(b.ad || ''));
        return var_
          ? { ad: b.ad || b.wikiId, not: `kaydı var (${var_.type}); haritadaki yapıya bağlanır`, cozum: { tur: 'kayda-bagla' as const, wikiId: b.wikiId, hedefId: var_.id } }
          : { ad: b.ad || b.wikiId, not: 'haritadaki bilgilerle boş künye açılır', cozum: { tur: 'madde-ac' as const, wikiId: b.wikiId } };
      })
    });
  }

  // --- Wiki: açılmış ama içi boş maddeler
  const wikiTipleri = new Set(['mekân', 'dükkân', 'kulüp', 'yer', 'cadde', 'meydan', 'yer_adi', 'ada', 'kisi', 'karakter']);
  const taslaklar = canli.filter(
    i => wikiTipleri.has(i.type) && !i.isProposal && isStub(i)
  );
  if (taslaklar.length) {
    eksikler.push({
      anahtar: 'taslak',
      sayi: taslaklar.length,
      baslik: 'madde taslak hâlde',
      aciklama: 'künyesi ya da gövdesi doldurulmayı bekliyor',
      alan: 'duzada',
      hedefId: taslaklar[0].id,
      kayitlar: taslaklar.map(i => ({ id: i.id, ad: i.title, not: bosAlanlar(i) }))
    });
  }

  // --- Wiki: evrende hiçbir şeye bağlı olmayanlar
  const kopuk = canli.filter(
    i => wikiTipleri.has(i.type) && !i.isProposal && isEntityUnlinked(i, canli)
  );
  if (kopuk.length) {
    eksikler.push({
      anahtar: 'kopuk',
      sayi: kopuk.length,
      baslik: 'madde hiçbir şeye bağlı değil',
      aciklama: 'bağlanmayan madde wiki\'yi ölü gösterir — en az bir ilişki kur',
      alan: 'duzada',
      hedefId: kopuk[0].id,
      kayitlar: kopuk.map(i => ({ id: i.id, ad: i.title, not: 'hiçbir maddeye bağlı değil' }))
    });
  }

  // --- Kişiler: görevi yazılmamış olanlar
  const gorevsiz = canli.filter(
    i => (i.type === 'kisi' || i.type === 'karakter') && !i.isProposal && rolBos(i)
  );
  if (gorevsiz.length) {
    eksikler.push({
      anahtar: 'gorev',
      sayi: gorevsiz.length,
      baslik: 'kişinin rolü belli değil',
      aciklama: 'künyesinde ne iş yaptığı yazmıyor',
      alan: 'duzada',
      hedefId: gorevsiz[0].id,
      kayitlar: gorevsiz.map(i => ({ id: i.id, ad: i.title, not: 'rolü yazılmamış' }))
    });
  }

  // --- Mekânlar: adı hâlâ jenerik olanlar
  const adsiz = canli.filter(i => !i.isProposal && i.metadata?.adiGecici);
  if (adsiz.length) {
    eksikler.push({
      anahtar: 'ad',
      sayi: adsiz.length,
      baslik: 'yerin adı hâlâ geçici',
      aciklama: adsiz.slice(0, 3).map(i => i.title).join(', '),
      alan: 'duzada',
      hedefId: adsiz[0].id,
      kayitlar: adsiz.map(i => ({ id: i.id, ad: i.title, not: 'ad geçici; asıl adı sen koyacaksın' }))
    });
  }

  // --- Markalar: künyesi yarım olanlar
  /*
   * Marka künyesinin VAR olması yetmiyor: uygulama yeni marka açarken
   * hazır bir kit koyuyor — font 'Inter', palet rastgele. Küçükçetmi'nin
   * kaydında böyle bir palet duruyordu, gerçek markayla (krem + mürekkep)
   * hiç ilgisi yoktu. O yüzden ölçü "kit var mı" değil, "kit gerçek mi".
   */
  // Marka yapısı (7. madde): Kems Company + kurgu içi kurumlar. İkisinin de
  // künyesi gerçek olmalı; kurumun sloganı boş kalabilir (Kemal'in kararı).
  const yapi = markaYapisi(items);
  const markalar = yapi.hepsi.filter(i => !i.isProposal);
  const varsayilanMarka = markalar.filter(i => {
    const bk = i.metadata?.brandKit;
    if (!bk) return true;
    const fontVarsayilan = !bk.selectedFont || bk.selectedFont.trim() === 'Inter';
    const paletBos = !bk.colorPalette?.length;
    const sessiz = !bk.slogan?.trim() && !bk.voiceTone?.trim();
    return fontVarsayilan || paletBos || sessiz;
  });
  if (varsayilanMarka.length) {
    eksikler.push({
      anahtar: 'marka',
      sayi: varsayilanMarka.length,
      baslik: 'markanın künyesi hâlâ varsayılan',
      aciklama: varsayilanMarka.map(i => i.title).join(', ')
        + ' · Markalar\'daki "Canva künyelerini uygula" düğmesi bunu doldurur',
      alan: 'markalar',
      hedefId: varsayilanMarka[0].id,
      kayitlar: varsayilanMarka.map(i => {
        const bk = i.metadata?.brandKit;
        const neler = [
          ...(!bk?.selectedFont || bk.selectedFont.trim() === 'Inter' ? ['yazı tipi'] : []),
          ...(!bk?.colorPalette?.length ? ['renkler'] : []),
          ...(!bk?.slogan?.trim() && !bk?.voiceTone?.trim() ? ['slogan / ses tonu'] : [])
        ];
        return { id: i.id, ad: i.title, not: neler.length ? `varsayılan: ${neler.join(', ')}` : '' };
      })
    });
  }

  // --- Merch: dropu olmayan ürün
  const droplar = new Set(canli.filter(i => i.type === 'drop').map(i => i.id));
  const dropsuzUrun = canli.filter(
    i => i.type === 'merch_urun' && !i.isProposal
      && !droplar.has(String(i.metadata?.dropId || ''))
  );
  if (dropsuzUrun.length) {
    eksikler.push({
      anahtar: 'urun-drop',
      sayi: dropsuzUrun.length,
      baslik: 'ürün bir dropa bağlı değil',
      aciklama: dropsuzUrun.slice(0, 3).map(i => i.title).join(', '),
      alan: 'merch',
      hedefId: dropsuzUrun[0].id,
      kayitlar: dropsuzUrun.map(i => ({ id: i.id, ad: i.title, not: 'bir dropa bağla' }))
    });
  }

  // --- Merch: markası olmayan drop
  // Eskiden burada "dropun teması seçilmemiş" vardı; tema katmanı kaldırıldı
  // (34 cevabın 16. maddesi), artık eksik olan şey markanın kendisi.
  // Satan her zaman gerçek marka (Kems Company). brandId bir kurumu
  // gösteriyorsa drop da "markasız" sayılır — kurum ürün satmaz, ürün
  // kurumdan gelir. Kurum bağı ayrı alanda: kurumId.
  const markaKimlikleri = new Set(
    [yapi.anaMarka, ...yapi.digerMarkalar].filter(Boolean).map(i => i!.id)
  );
  const markasizDrop = canli.filter(
    i => i.type === 'drop' && !i.isProposal
      && !markaKimlikleri.has(String(i.metadata?.brandId || ''))
  );
  if (markasizDrop.length) {
    eksikler.push({
      anahtar: 'drop-marka',
      sayi: markasizDrop.length,
      baslik: 'drop bir markaya bağlı değil',
      aciklama: markasizDrop.map(i => i.title).join(', '),
      alan: 'merch',
      hedefId: markasizDrop[0].id,
      kayitlar: markasizDrop.map(i => ({
        id: i.id, ad: i.title, not: 'satan marka seçilmemiş',
        cozum: yapi.anaMarka ? { tur: 'markaya-bagla' as const, hedefId: i.id, markaId: yapi.anaMarka.id, markaAdi: yapi.anaMarka.title } : undefined
      }))
    });
  }

  return eksikler.sort((a, b) => b.sayi - a.sayi);
}


/**
 * "Ajana öneri hazırlat" (3 Kasım, Kemal: "bunlar niye bitmiyor ve önerileri yok").
 * Eksik başlığını ve listesini ajansa gidecek istek metnine çevirir; ajanı başlığa göre
 * önerir (yoksa Kems seçer). Kayda hiçbir şey yazılmaz.
 */
export function eksikIstegi(e: Eksik): { metin: string; ajan?: string } {
  const liste = (e.kayitlar || []).slice(0, 40).map(k => `- ${k.ad}${k.not ? ` (${k.not})` : ''}`).join('\n');
  const fazla = (e.kayitlar || []).length > 40 ? `\n… ve ${(e.kayitlar || []).length - 40} kayıt daha` : '';
  const b = e.baslik.toLocaleLowerCase('tr');
  const ajan = /bağlı değil/.test(b) && e.alan !== 'duzada' ? undefined
    : /bağlı değil|taslak|boşluk|rolü/.test(b) ? 'viki-editoru'
    : /künye|marka/.test(b) ? 'merch-tasarimcisi'
    : undefined;
  return {
    metin: `Eksikler: ${e.sayi} ${e.baslik}. Her biri için vikide zaten yazan bilgiden öneri hazırla (bağ, alan ya da metin); yeni bilgi uydurma, bilinmeyeni aday cevaplı soru yap. Öneriler Ajansın kararları ya da Onay bekleyenler olarak gelsin.\n${liste}${fazla}`,
    ...(ajan ? { ajan } : {})
  };
}
