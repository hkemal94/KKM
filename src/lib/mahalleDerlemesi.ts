import type { Item, WikiSection } from '../types';
import { oneriyiUygula, type YapayZekaOnerisi } from './studyo';

/**
 * Mahalle derlemesi, Claude'un elinden (8 Ekim). Stüdyodaki "Mahalleyi
 * derle" Kemal'in yapay zekâ hakkı dolduğu için çalışmadı; Kemal "sen yap"
 * dedi. 8 Ekim yedeğindeki öneri bölümleri okunup derlendi:
 *   - yeni bilgi yok; künyede ya da resmî bölümde yazan tekrar edilmez
 *   - kanonla çelişen cümleler kanona göre düzeltildi (okul ve kahvehane
 *     "açıldı", jandarma köy döneminden, Çiftlik'te yerleşim 20. yy başında
 *     başlamadı — o yıllarda gelen yalnız Eskibey Ailesi)
 *   - resmî bölümle aynı başlıktaki öneri o bölümün altında bekler
 * Uygulama stüdyonun "Derlenmiş hâli koy"u ile aynı (`bolum-derle`).
 */

type Bolum = { title: string; content: string };

export const DERLEMELER: Array<{ id: string; ad: string; bolumler: Bolum[] }> = [
  {
    id: 'viki_yer_merkez', ad: 'Merkez Mahallesi',
    bolumler: [
      {
        title: 'Tarihçe',
        content: `Yerleşimin kökeni antik döneme uzanır; Ada Tepesi'nde antik yerleşim duvarları bulunur.

Düzada Köyü döneminde yerleşim meydan, taş çeşme ve yaşlı çınar çevresinde şekillendi. Sözlü anlatıya göre taş çeşme antik bir kaynağın üstüne yapılmıştır. Jandarma karakolu köy döneminden kalmadır; okul 1920–1940'lar arasında açıldı. Merkez'deki Rum aileler 1923 mübadelesinin dışında kaldı; yıllar içinde, kendi istekleriyle yavaş yavaş adadan ayrıldılar. Kahvehane 1950–1970'ler arasında açıldı. Otelden (1954) sonra İskele'deki mübadele aileleri evlerini yazlıkçılara satıp Merkez'e geçti.

1980 sonrasında belediye kuruldu ve köy Merkez Mahallesi adını aldı. Belediye yeni bir binaya geçti, cami yenilendi; belediye itfaiyesi ve sağlık ocağı bu dönemde kuruldu. Mahallede apartman yoktur; evler müstakildir.`
      },
      {
        title: 'Çarşı ve işletmeler',
        content: `Eczanenin yanında terzi, kasap ve berber de bulunur.

Adada banka yoktur; ATM'ler Liman ve İskele'dedir.`
      }
    ]
  },
  {
    id: 'viki_yer_liman', ad: 'Liman Mahallesi',
    bolumler: [
      {
        title: 'Tarihçe',
        content: `Limandan önce fener ve koyun çevresi zeytinlikti.

İskele operasyonel olarak yetersiz kalınca 1980–1990'lar arasında devlet, adanın kuzeybatısındaki derin ve poyraza kapalı koya yeni limanı yaptı. Liman tamamlanınca 1950'lerden beri kamu hattı olan feribot ve balık hali İskele'den buraya taşındı.`
      },
      {
        title: 'Deniz Feneri',
        content: `Deniz Feneri 19. yüzyılda, adanın kuzeybatı ucunda limanı yukarıdan görecek biçimde yapıldı. Bekçi, fenerin yanındaki evde yaşardı.

Fener 1970'lerde otomatiğe geçti; bekçi evi sahil güvenliğin kullanımına bırakıldı. Fener ziyarete açıktır; içine çıkılır ve limana bakar.`
      }
    ]
  },
  {
    id: 'viki_yer_iskele', ad: 'İskele Mahallesi',
    bolumler: [
      {
        title: 'Tarihçe',
        content: `Kemsköy, Düzada Köyü'nün dışında kalan iskele ve birkaç balıkçı evinden oluşuyordu. Burada 18. yüzyıldan kalma küçük bir kilise ve yanında eski bir Rum mezarlığı bulunur. Kilisenin Rum cemaati 1923 mübadelesinin dışında kaldı; yıllar içinde, kendi istekleriyle yavaş yavaş adadan ayrıldı. 1923'te mübadeleyle gelen aileler İskele'ye yerleşti; Rum evleri zamanla boşaldı. Kilise, cemaat ayrıldıktan sonra boş kaldı.

1954'te devlet misafirhanesi olarak açılan yapı, 1960'larda İstanbul merkezli bir şirkete geçerek otel oldu. Otelle adada yaz turizmi başladı; İskele'ye otelciler ve varlıklı yazlıkçılar yerleşti, mübadele aileleri evlerini satıp Merkez'e geçti. Halk 1954 sonrasında buraya "mahalle" dedi; resmî mahalle olması belediyeyle (1980 sonrası) oldu.

1970'lerden itibaren barlar açıldı; Kemsköy Caddesi zamanla dükkânlı bir yazlık caddesine döndü. Eski zeytinyağı fabrikasının taş binası 1980–1990'larda meyhane oldu: Sade Meyhane. Aynı yıllarda feribot ve balık hali yeni limana taşındı; İskele otelin, eğlence mekânlarının ve küçük teknelerin yeri olarak kaldı.`
      }
    ]
  },
  {
    id: 'viki_yer_ciftlik', ad: 'Çiftlik Mahallesi',
    bolumler: [
      {
        title: 'Tarihçe',
        content: `Çiftlik Mahallesi hep dağınık, küçük aile çiftliklerinin bölgesi oldu.

20. yüzyıl başında Küçükkuyu'nun Küçükçetmi köyünden gelen Eskibey Ailesi'nin Küçükçetmi Çiftliği burada. Köyün eski sürek avı geleneği, ailenin 1950–1980 arasında kurduğu Küçükçetmi Sürek Kulübü'yle sürdü; çiftlik evi kulübün evi oldu. Av 1990–2000'lerde bırakıldı.

1950–1970 arasında kooperatif (Düzada Ziraat İşletmeleri Kurumu) mahallede modern, küçük bir zeytinyağı fabrikası kurdu. Bağcılık adada 2000 sonrası başladı; küçük aile şaraphaneleri bu dönemde açıldı.`
      }
    ]
  }
];

const anahtar = (s = '') => s.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

/** Aynı başlıkta birden çok öneri bölümü var mı (derleme bekliyor mu) */
function tekrarliMi(i: Item): boolean {
  const say = new Map<string, number>();
  for (const b of (i.metadata?.wikiSections as WikiSection[] | undefined) || []) {
    if (b.status !== 'öneri' || !String(b.content || '').trim()) continue;
    const k = anahtar(b.title);
    say.set(k, (say.get(k) || 0) + 1);
  }
  return Array.from(say.values()).some(n => n > 1);
}

/** Derlenecek mahalleler: kayıt var ve hâlâ tekrar ediyor */
export function derlenecekler(items: Item[]): Array<{ item: Item; bolumler: Bolum[] }> {
  return DERLEMELER
    .map(d => ({ item: items.find(i => i.id === d.id && !i.archived), bolumler: d.bolumler }))
    .filter((x): x is { item: Item; bolumler: Bolum[] } => !!x.item && tekrarliMi(x.item));
}

/** Derlenmiş hâli koy: öneri bölümleri gider, resmîler kalır */
export function derlemeyiUygula(items: Item[], item: Item, bolumler: Bolum[]): Item | null {
  const oneri: YapayZekaOnerisi = {
    tur: 'yapay_zeka', durum: 'bekliyor', arac: 'viki-derle',
    hedefId: item.id, hedefAdi: item.title, tarih: new Date().toISOString().slice(0, 10),
    bolumler, derle: true
  };
  return oneriyiUygula(oneri, items)?.guncel || null;
}

/** Derlemeyle birlikte giden küçük düzeltmeler (8 Ekim yedeğinde görüldü) */
export function ekDuzeltmeler(items: Item[]): Array<{ item: Item; ne: string }> {
  const cikti: Array<{ item: Item; ne: string }> = [];
  const simdi = Date.now();
  // Düzada: "Adaya Ulaşım" (resmî) varken boş açılan ikinci "Ulaşım" bölümü
  const ada = items.find(i => i.type === 'ada' && !i.archived);
  const adaBol = (ada?.metadata?.wikiSections as WikiSection[] | undefined) || [];
  if (ada && adaBol.some(b => /ulaşım/i.test(b.title) && b.status !== 'boş') && adaBol.some(b => anahtar(b.title) === 'ulaşım' && !String(b.content || '').trim())) {
    cikti.push({
      ne: 'boş ikinci "Ulaşım" bölümü kalktı ("Adaya Ulaşım" duruyor)',
      item: { ...ada, metadata: { ...ada.metadata, wikiSections: adaBol.filter(b => !(anahtar(b.title) === 'ulaşım' && !String(b.content || '').trim())) }, updatedAt: simdi }
    });
  }
  // Ada Tepesi: künye kanondan (742 m; Merkez Mahallesi'nde)
  const tepe = items.find(i => i.type === 'yer_adi' && anahtar(i.title) === 'ada tepesi' && !i.archived);
  if (tepe) {
    const p = (tepe.metadata?.profile as Record<string, string> | undefined) || {};
    if (!String(p.yerTuru || '').trim() || !String(tepe.metadata?.region || '').trim()) {
      cikti.push({
        ne: 'künye: Tepe · 742 m, Merkez Mahallesi',
        item: {
          ...tepe,
          metadata: {
            ...tepe.metadata,
            region: String(tepe.metadata?.region || '').trim() || 'merkez',
            profile: { ...p, yerTuru: String(p.yerTuru || '').trim() || 'Tepe · 742 m (adanın en yüksek noktası)' }
          },
          updatedAt: simdi
        }
      });
    }
  }
  return cikti;
}
