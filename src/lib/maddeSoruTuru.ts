import type { Item, ItemType, WikiSection } from '../types';
import { adiCoz } from './alanSablonu';
import { WIKI_TYPES } from '../components/wiki/wikiSchema';

/** Metindeki "Sade Meze" geçişleri (ekleriyle) → "Sade Meyhane" */
function adDegistir(s: string): { s: string; degisti: boolean } {
  const y = s.replace(/Sade Meze(?![\p{L}])/gu, 'Sade Meyhane');
  return { s: y, degisti: y !== s };
}

/**
 * Madde soru turu (8 Ekim; `docs/soru-cevap/madde-1.md`). Kanonda yazılı
 * olup maddesi olmayan yerler boş metinle açılır, künyelerine yalnız
 * kanondaki ve Kemal'in bu turdaki cevapları yazılır. Yanlış alana düşmüş
 * eski bilgiler düzeltilir. Tek seferlik: açılmış madde (aynı ad ya da takma
 * ad) yeniden açılmaz, düzelmiş alana yeniden yazılmaz.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

interface Tohum {
  ad: string;
  tur: ItemType;
  bolge?: string;
  profil?: Record<string, string>;
  faaliyet?: string;
}

const MEKAN = (ad: string, bolge: string, shopType: string, ek: Record<string, string> = {}, faaliyet?: string): Tohum =>
  ({ ad, tur: 'mekân', bolge, profil: { shopType, ...ek }, ...(faaliyet ? { faaliyet } : {}) });

/** Açılacak maddeler; adlar yer tarifiyle (Kemal: "ad koyunca değişir") */
export const TOHUMLAR: Tohum[] = [
  // Merkez
  MEKAN('Merkez Camii', 'merkez', 'Cami', { manager: 'Devlet (Diyanet)', season: 'Yıl boyu' }, 'Köy döneminden– (1980 sonrası yenilendi)'),
  MEKAN('Merkez Kahvehanesi', 'merkez', 'Kahvehane', { manager: 'Aile işletmesi', season: 'Yıl boyu' }, "1950–1970'ler–"),
  { ad: 'Merkez Meydanı', tur: 'meydan', bolge: 'merkez', profil: { cevresi: 'Merkez Kahvehanesi, Merkez Pazarı, bakkal, fırın, taş çeşme, çınar' } },
  MEKAN('Jandarma Karakolu', 'merkez', 'Jandarma karakolu', { manager: 'Devlet', season: 'Yıl boyu' }, 'Köy döneminden–'),
  MEKAN('Merkez Postanesi', 'merkez', 'Postane', { manager: 'Devlet', season: 'Yıl boyu' }, "1950–1970'ler–"),
  MEKAN('Merkez Sağlık Ocağı', 'merkez', 'Sağlık ocağı', { manager: 'Devlet', season: 'Yıl boyu' }, '1980 sonrası–'),
  MEKAN('Merkez Eczanesi', 'merkez', 'Eczane', { manager: 'Aile işletmesi', season: 'Yıl boyu' }, '1980 sonrası–'),
  // İskele, Liman, Stadyum
  MEKAN('Eski Kilise', 'iskele', 'Kilise (küçük şapel), boş', { manager: 'Belediye (kapalı)' }, '18. yüzyıl–'),
  MEKAN('Rum Mezarlığı', 'iskele', 'Mezarlık (Eski Kilise\'nin yanında)'),
  MEKAN('Liman Balık Hali', 'liman', 'Balık hali', { manager: 'Balıkçı kooperatifi', season: 'Yıl boyu' }, "1980–1990'lar– (önce İskele'deydi)"),
  MEKAN('Liman Balık Lokantası', 'liman', 'Balık lokantası', { manager: 'Aile işletmesi', season: 'Yıl boyu' }, "1980–1990'lar–"),
  MEKAN('Taraftar Birahanesi', 'stadyum', 'Birahane (plaja bakan kıyıda)', { manager: 'Aile işletmesi', season: 'Yıl boyu; maç günleri dolu' }, "1980'ler–"),
  // Yer adları
  // Zirvelerin mahallesi haritadaki sınıra göre (2. soru turu)
  { ad: 'Ada Tepesi', tur: 'yer_adi', bolge: 'merkez', profil: { yerTuru: 'Tepe · 742 m (adanın en yüksek noktası)', adinKokeni: 'Adanın en yüksek tepesi' } },
  { ad: 'Kuzey Sırtı', tur: 'yer_adi', bolge: 'merkez', profil: { yerTuru: 'Sırt · 440 m', adinKokeni: 'Yönünden: adanın kuzeyindeki sırt' } },
  { ad: 'Çetmi Sırtı', tur: 'yer_adi', bolge: 'merkez', profil: { yerTuru: 'Sırt · 290 m', adinKokeni: "Küçükçetmi'den: Eskibey Ailesi'nin geldiği köy" } },
  { ad: 'Fener Burnu', tur: 'yer_adi', bolge: 'liman', profil: { yerTuru: 'Burun · 118 m', adinKokeni: "Deniz Feneri'nden: fenerin durduğu burun" } },
  { ad: 'Güney Burnu', tur: 'yer_adi', bolge: 'iskele', profil: { yerTuru: 'Burun · 96 m', adinKokeni: 'Yönünden: adanın güneyindeki burun' } },
  { ad: 'İskele Koyu', tur: 'yer_adi', bolge: 'iskele', profil: { yerTuru: 'Koy, plaj' } },
  // Kemal 8 Ekim'de adını Kuzey Plajı yaptı (eski adı Stadyum Plajı)
  { ad: 'Kuzey Plajı', tur: 'yer_adi', bolge: 'stadyum', profil: { yerTuru: 'Plaj (kumlu-çakıllı)' } },
  { ad: 'Amfora Alanı', tur: 'yer_adi', bolge: 'liman', profil: { yerTuru: "Sualtı antik amfora alanı (Liman'ın açığında)" } },
  // Yollar (Sahil Yolu: çevre yolu maddesinin adı değişir, aşağıda)
  { ad: 'Kemsköy Caddesi', tur: 'cadde', bolge: 'İskele Mahallesi', profil: { uzerindekiler: 'Kems Company dükkânı, Sade Meyhane, Eski Kilise, barlar ve meyhaneler' } },
  { ad: 'Sahil Merdiveni', tur: 'cadde', bolge: 'İskele Mahallesi', profil: { uzerindekiler: 'The Imperial Kemsköy' } },
  { ad: 'Otel Yolu', tur: 'cadde', bolge: 'İskele Mahallesi', profil: { uzerindekiler: 'The Imperial Kemsköy' } },
  { ad: 'Sahil Yolu', tur: 'cadde', bolge: 'Merkez Mahallesi, Liman Mahallesi, İskele Mahallesi, Stadyum Mahallesi, Çiftlik Mahallesi', profil: { uzerindekiler: 'Deniz Feneri, Liman İdare Binası, Taraftar Birahanesi, Kuzey Plajı' } },
  // Aile ve çiftlik
  { ad: 'Eskibey Ailesi', tur: 'aile', bolge: 'ciftlik', profil: { ugras: 'Zeytincilik', mekanlar: 'Küçükçetmi Çiftliği', gelis: "20. yüzyıl başı, Küçükkuyu'nun Küçükçetmi köyünden" } },
  MEKAN('Küçükçetmi Çiftliği', 'ciftlik', 'Çiftlik (Küçükçetmi Sürek Kulübü\'nün evi)', { manager: 'Eskibey Ailesi', season: 'Yıl boyu' }, '20. yüzyıl başı–')
];

const canli = (items: Item[]) => items.filter(i => !i.archived);

function tohumKaydi(t: Tohum): YeniKayit {
  return {
    title: t.ad, area: 'duzada', type: t.tur, status: 'Fikir', priority: 'orta',
    tags: [], links: [], notes: '', images: [], isProposal: false, archived: false,
    metadata: {
      ...(t.bolge ? { region: t.bolge } : {}),
      ...(t.profil ? { profile: t.profil } : {}),
      ...(t.faaliyet ? { faaliyet: t.faaliyet } : {})
    }
  };
}

/** Henüz açılmamış maddeler */
export function acilacaklar(items: Item[]): YeniKayit[] {
  const c = canli(items);
  return TOHUMLAR
    .filter(t => !adiCoz(t.ad, c) && t.ad !== 'Sahil Yolu')
    .map(tohumKaydi)
    // Sahil Yolu: çevre yolu maddesi varsa onun adı değişir (düzeltmelerde); yoksa açılır
    .concat(c.some(i => i.metadata?.cevreYolu === true) || adiCoz('Sahil Yolu', c) ? [] : [{
      ...tohumKaydi({ ad: 'Sahil Yolu', tur: 'cadde' }),
      metadata: { cevreYolu: true }
    }]);
}

const bul = (items: Item[], ad: string) => adiCoz(ad, canli(items));
const profil = (i: Item) => ((i.metadata?.profile as Record<string, string> | undefined) || {});

/** Var olan maddelerde düzeltmeler (Firestore birleştirerek yazar: alan boş metinle temizlenir) */
export function duzeltmeler(items: Item[]): Array<{ item: Item; neler: string[] }> {
  const c = canli(items);
  // Aynı maddeye birden çok düzeltme düşebilir: hepsi sırayla aynı kopyaya uygulanır
  const calisma = new Map<string, { item: Item; neler: string[] }>();
  const simdi = Date.now();
  const guncel = (i: Item) => calisma.get(i.id)?.item ?? i;
  const ekle = (i: Item | null | undefined, neler: string[], yeni: (i: Item) => Item) => {
    if (!i || !neler.length) return;
    const onceki = calisma.get(i.id);
    calisma.set(i.id, { item: { ...yeni(guncel(i)), updatedAt: simdi }, neler: [...(onceki?.neler || []), ...neler] });
  };

  // Çevre yolu → Sahil Yolu (kanondaki ad); Sahil Yolu maddesi yoksa
  const cevre = c.find(i => i.metadata?.cevreYolu === true);
  if (cevre && cevre.title !== 'Sahil Yolu' && !bul(items, 'Sahil Yolu')) {
    ekle(cevre, ['adı Sahil Yolu oldu'], i => ({ ...i, title: 'Sahil Yolu' }));
  }

  const stad = bul(items, 'Stadyum Mahallesi');
  if (stad) {
    const p = profil(stad);
    const n: string[] = [];
    // Yalnız eski uzun cümleler silinir; Kemal'in sonradan yazdığına dokunulmaz
    const eskiTur = /^Spor kulübü kültürüyle/.test(p.shopType || '');
    const eskiMimari = /^1950'li yılların toprak saha/.test(p.style || '');
    if (eskiTur) n.push('künyedeki "Tür" yazısı silindi');
    if (eskiMimari) n.push('künyedeki "Mimari" yazısı silindi');
    ekle(stad, n, i => ({ ...i, metadata: { ...i.metadata, profile: { ...profil(i), ...(eskiTur ? { shopType: '' } : {}), ...(eskiMimari ? { style: '' } : {}) } } }));
  }

  const surek = bul(items, 'Küçükçetmi Sürek Kulübü');
  if (surek) {
    const p = profil(surek);
    const kurulus = '1950–1980 arası';
    const faaliyet = "Kuruluştan 1990–2000'lere: sürek avı; cemiyet ve hayırseverler kulübü. Av bırakıldıktan sonra: nişancılık, doğa yürüyüşleri, Kangal yetiştiriciliği, buluşma yeri.";
    const n: string[] = [];
    // Yalnız eski değerler değişir (8 Ekim düzeltmesi: Kemal sonradan "Kurucu:
    // Eskibey Ailesi" yazdı; kart onu "Baş Sürekçi" sanıp siliyordu)
    const kurulusEski = !String(p.founded || '').trim() || /net olarak bilinmiyor/i.test(p.founded || '');
    const faaliyetEski = !String(p.field || '').trim() || /^Cemiyet ve sosyal birliktelik/.test(p.field || '');
    const liderEski = (p.leader || '').trim() === 'Baş Sürekçi';
    const uyelikEski = (p.secrecy || '').trim() === '40';
    if (kurulusEski) n.push(`kuruluş: ${kurulus}`);
    if (faaliyetEski) n.push('faaliyet dönemlere göre yazıldı');
    if (liderEski) n.push('"Baş Sürekçi" silindi');
    if (uyelikEski) n.push('"Üyelik: 40" silindi');
    ekle(surek, n, i => ({ ...i, metadata: { ...i.metadata, profile: {
      ...profil(i),
      ...(kurulusEski ? { founded: kurulus } : {}),
      ...(faaliyetEski ? { field: faaliyet } : {}),
      ...(liderEski ? { leader: '' } : {}),
      ...(uyelikEski ? { secrecy: '' } : {})
    } } }));
  }

  // Yalnız boş ya da eski (hatalı / "bilinmiyor") değerde yazılır
  const yil = (ad: string, deger: string, eski: RegExp) => {
    const i = bul(items, ad);
    const f = String(i?.metadata?.faaliyet || '').trim();
    if (i && f !== deger && (!f || eski.test(f))) ekle(i, [`faaliyet: ${deger}`], x => ({ ...x, metadata: { ...x.metadata, faaliyet: deger } }));
  };
  yil('Dirlik Stadı', "1980'ler–", /akfit|aktif|top sahası/i);
  yil('Düzada İlkokulu', "1920–1940'lar–", /net olarak bilinmiyor/i);
  yil('Merkez Pazarı', 'Köy döneminden–', /net olarak bilinmiyor/i);

  // 2. soru turu (8 Ekim): "Sade Meze" → "Sade Meyhane" her yerde; eski ad
  // maddenin takma adı olur. Boş bölüm başlıkları silinir (Kemal: "silinsin").
  for (const i0 of c.filter(x => WIKI_TYPES.includes(x.type))) {
    const i = guncel(i0);
    const n: string[] = [];
    let x = i;
    const metin = adDegistir(JSON.stringify({ notes: i.notes || '', m: i.metadata?.profile || {}, b: i.metadata?.wikiSections || [], r: i.metadata?.region || '' }));
    if (metin.degisti) {
      const v = JSON.parse(metin.s) as { notes: string; m: Record<string, string>; b: WikiSection[]; r: string };
      x = { ...x, notes: v.notes, metadata: { ...x.metadata, profile: v.m, wikiSections: v.b, ...(i.metadata?.region ? { region: v.r } : {}) } };
      n.push('"Sade Meze" → "Sade Meyhane"');
    }
    if (/^sade meyhane$/i.test(i.title.trim())) {
      const takma = Array.isArray(i.metadata?.aliases) ? (i.metadata!.aliases as string[]) : [];
      if (!takma.some(t => /^sade meze$/i.test(t))) { x = { ...x, metadata: { ...x.metadata, aliases: [...takma, 'Sade Meze'] } }; n.push('takma ad: Sade Meze'); }
    }
    const bolumler = (x.metadata?.wikiSections as WikiSection[] | undefined) || [];
    const dolu = bolumler.filter(bo => String(bo.content || '').trim() || String(bo.bekleyenOneri || '').trim());
    if (dolu.length !== bolumler.length) {
      x = { ...x, metadata: { ...x.metadata, wikiSections: dolu } };
      n.push(`${bolumler.length - dolu.length} boş bölüm başlığı silindi`);
    }
    const son = x;
    ekle(i0, n, () => son);
  }

  // Zaten var olan maddeler (ör. taşıma kartıyla Cadde'ye geçen Kemsköy
  // Caddesi): yalnız boş künye alanları dolar, dolu alana dokunulmaz
  for (const t of TOHUMLAR) {
    const i = bul(items, t.ad);
    if (!i) continue;
    const p = profil(guncel(i));
    const bos = Object.entries(t.profil || {}).filter(([k]) => !String(p[k] || '').trim());
    const n = bos.map(([k]) => `künye: ${k}`);
    const bolgeBos = t.bolge && !String(guncel(i).metadata?.region || '').trim();
    const faaliyetBos = t.faaliyet && !String(guncel(i).metadata?.faaliyet || '').trim();
    if (bolgeBos) n.push('mahalle');
    if (faaliyetBos) n.push('faaliyet');
    ekle(i, n.length ? [`boş alanlar doldu (${n.length})`] : [], x => ({
      ...x,
      metadata: {
        ...x.metadata,
        ...(bos.length ? { profile: { ...profil(x), ...Object.fromEntries(bos) } } : {}),
        ...(bolgeBos ? { region: t.bolge } : {}),
        ...(faaliyetBos ? { faaliyet: t.faaliyet } : {})
      }
    }));
  }
  return Array.from(calisma.values());
}

export const maddeSoruTuruIsVar = (items: Item[]) => acilacaklar(items).length > 0 || duzeltmeler(items).length > 0;
