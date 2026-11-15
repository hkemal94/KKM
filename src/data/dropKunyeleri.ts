import type { Item } from '../types';

/**
 * Drop künyeleri — Canva'daki lookbook'lardan çıkarıldı (MR1).
 *
 * Uygulamada bir drop yalnızca ad + durum + tema kimliğiydi. Oysa dropun
 * gerçek kimliği Canva'daki "Drop - Basics 1" tasarımında duruyor: yıl,
 * beden seti, bakım etiketi metni, menşei ve ürün renkleri. Bunlar üründen
 * ürüne değil, DROPTAN dropa sabit — bu yüzden ürüne değil dropa ait.
 *
 * Buradaki bilgi uygulamaya birleştirilerek yazılır: elle girilmiş notlar
 * ve görseller korunur.
 */

export interface DropKunyesi {
  /** Uygulamadaki drop kimliği */
  id: string;
  /** Kimlik değişirse ada göre de eşleşsin */
  adlar: string[];
  yil: number;
  edisyon: string;
  /** Lookbook'taki beden seti */
  bedenler: string[];
  /** Bakım / menşe etiketindeki satırlar */
  etiket: string[];
  /** Ürün adı → lookbook'taki renk */
  urunRenkleri: Record<string, string>;
  kaynak: string;
  /**
   * Canva ile uygulama arasında ya da Canva'nın kendi içinde tutarsız
   * kalan yerler. Sessizce düzeltmiyorum — hangisinin doğru olduğuna
   * Kemal karar verir.
   */
  uyarilar: string[];
}

export const DROP_KUNYELERI: DropKunyesi[] = [
  {
    id: 'drop_1783763762753_lgo55',
    adlar: ['Basics 1'], // Kemal 15 Kasım: her yerde "Basics 1"
    yil: 2026,
    edisyon: 'I. Edisyon',
    bedenler: ['S', 'M', 'L', 'XL', 'ONE'],
    etiket: [
      "Kems Company's",
      'Apparel + Objects',
      'Made with Culture',
      'Est. 2025',
      'Düzada, TR'
    ],
    urunRenkleri: {
      'Basic Tee': 'Beyaz',
      'Basic Hoodie': 'Lacivert',
      'Basic Sweatshirt': 'Siyah',
      "Basic's Hat": 'Bej · lacivert · kiremit (KC nakış)',
      "Basic's Socks Pack": 'Çok renkli — yeşil, kiremit, krem, lacivert, mavi'
    },
    kaynak: 'Canva · Drop - Basics 1',
    uyarilar: [
      'Etikette "Apperal + Objects" yazıyor; doğrusu "Apparel". Künyeye '
        + 'düzeltilmiş hâlini yazdım, Canva\'daki tasarıma dokunmadım.',
      'Kemal 15 Kasım: kuruluş 2025, menşe "Düzada, TR", ad her yerde "Basics 1". '
        + 'Canva\'daki lookbook ("Est. 2024", "Küçükçetmi, TR", "Basics I") henüz düzeltilmedi.'
    ]
  }
];

/** Bir dropun künyesini bulur — kimlikten, olmazsa addan */
export function dropKunyesiBul(drop: Item): DropKunyesi | undefined {
  const ad = drop.title.trim().toLocaleLowerCase('tr');
  return DROP_KUNYELERI.find(
    k => k.id === drop.id || k.adlar.some(a => a.toLocaleLowerCase('tr') === ad)
  );
}

/**
 * Künyeyi dropun üstüne birleştirir.
 *
 * Eksiltmez: elle yazılmış notlar, edisyon notu ve görseller korunur.
 * Yalnızca boş alanlar dolar.
 */
export function dropKunyesiniIsle(drop: Item, k: DropKunyesi): Item {
  const md = drop.metadata ?? {};
  return {
    ...drop,
    metadata: {
      ...md,
      yil: md.yil || k.yil,
      edisyon: md.edisyon || k.edisyon,
      bedenler: md.bedenler?.length ? md.bedenler : k.bedenler,
      etiketSatirlari: md.etiketSatirlari?.length ? md.etiketSatirlari : k.etiket,
      kunyeKaynagi: k.kaynak
    }
  };
}

/**
 * Dropa bağlı ürünlerin rengi lookbook'takiyle uyuşuyor mu.
 *
 * Uygulamada dört üründe `variantColor` vardı, ikisi boştu (Hat ve Socks).
 * Boş olanı doldurur, dolu ve farklı olanı DEĞİŞTİRMEZ — sadece bildirir.
 */
export function renkFarklari(
  urunler: Item[], k: DropKunyesi
): Array<{ item: Item; mevcut: string; lookbook: string }> {
  const fark: Array<{ item: Item; mevcut: string; lookbook: string }> = [];
  for (const u of urunler) {
    const beklenen = k.urunRenkleri[u.title.trim()];
    if (!beklenen) continue;
    const mevcut = String(u.metadata?.variantColor || '').trim();
    if (mevcut && beklenen.toLocaleLowerCase('tr').startsWith(
      mevcut.toLocaleLowerCase('tr')
    )) continue;
    fark.push({ item: u, mevcut, lookbook: beklenen });
  }
  return fark;
}

/** Rengi boş olan ürünleri lookbook'tan doldurur (dolu olana dokunmaz) */
export function renkleriDoldur(urun: Item, k: DropKunyesi): Item | null {
  const beklenen = k.urunRenkleri[urun.title.trim()];
  if (!beklenen) return null;
  if (String(urun.metadata?.variantColor || '').trim()) return null;
  return {
    ...urun,
    metadata: { ...(urun.metadata ?? {}), variantColor: beklenen }
  };
}
