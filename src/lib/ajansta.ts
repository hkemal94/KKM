import { useEffect, useState } from 'react';
import type { Item } from '../types';
import { base64Coz, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';
import { isleriOku, type AjansIsi } from './isler';
import { istekleriOku, type KemalIstegi } from './kemalIstekleri';
import { kararlariOku, onerileriOku, type AjanOnerisi, type OneriKarari } from './ajanOnerileri';
import { TEPSI_YOLU } from './tepsiAjansa';
import { bekleyenAdaylar } from './adaylar';
import { onayKayitlari, type OnayKaydi } from './onaylar';

/**
 * Ajansta ve aşamalar (3 Kasım, Kemal: "Düzenle dediğim iş listede kalmasın,
 * ajansta görünsün; ajana verdiğim işin nerede olduğunu aşama aşama göreyim").
 *
 * Aşamalar: Sırada → Kems aldı → Ajanda (hangi ajan) → Onayına düştü.
 * Saat ya da süre tahmini yok; aşama yalnız ajansın dosyalarından okunur:
 *   - Sırada: istek `kkm/istekler.json`'da duruyor ya da Düzenle notu yazıldı,
 *     ama iş listesinde (`kkm/isler.json`) ona bağlı bir iş yok.
 *   - Kems aldı: iş listesinde `kaynak` alanı bu isteği / notu gösteren açık
 *     bir iş var ve `kimde` Kems (ya da Kemal: senden bir şey bekliyor).
 *   - Ajanda: aynı iş bir ajanda (`kimde` ajan dosyasının adı).
 *   - Onayına düştü: `kkm/oneriler.json`'da `kaynak`ı aynı olan yeni satır var
 *     ya da bağlı iş kapandı. Bu durumda eski satır Ajansta'dan kalkar; yeni
 *     hâli Onay bekleyenler'dedir.
 *
 * Bağ yalnız `kaynak` alanıyla kurulur (Kems yazar); metin benzerliğine
 * bakılmaz. `kaynak` değeri:
 *   - istek için isteğin kimliği (ör. `istek-m3x9k2`, `yapilacak-m3x9k2`),
 *   - Düzenle notu için Onay bekleyenler'deki satırın anahtarı:
 *     `oneri:<kayıt>` (öneri tepsisi), `ajan:<öneri kimliği>` (ajanların işi),
 *     `is:<iş>:<ad>` (tek seferlik iş), `karar:<dosya tarihi>` (ajansın kararları).
 *     `oneri:` ve `ajan:` öneki yazılmasa da tutar (çıplak kimlik).
 *
 * KKM bu dosyalara hiçbir şey yazmaz; yalnız okur.
 */

export type Asama = 'sirada' | 'kems' | 'ajanda' | 'onayda';

export const ASAMALAR: Array<{ id: Asama; ad: string }> = [
  { id: 'sirada', ad: 'Sırada' },
  { id: 'kems', ad: 'Kems aldı' },
  { id: 'ajanda', ad: 'Ajanda' },
  { id: 'onayda', ad: 'Onayına düştü' },
];

export interface AsamaBilgisi {
  asama: Asama;
  /** Ajanda ise ajan dosyasının adı; Kems aldı'da "Kemal" ise senden bekliyor */
  kimde?: string;
  /** Bağlı iş (varsa) */
  is?: AjansIsi;
}

/**
 * `ajan:<id>` / `oneri:<id>` ile çıplak `<id>` aynı satırı gösterir: Kems ajan işlerinin
 * kimliğini `oneri-kararlari.json`'daki gibi çıplak, tepsi önerisininkini `tepsi.json`
 * → onaylar'daki gibi önekli yazabilir; ikisi de tutar.
 */
const cipla = (x: string) => x.trim().replace(/^(ajan|oneri):/, '');
const esit = (a: string, b: string) => a.trim() === b.trim() || cipla(a) === cipla(b);

/** Bir isteğin ya da Düzenle notunun aşaması */
export function asamaBul(kaynak: string, isler: AjansIsi[], oneriler: AjanOnerisi[]): AsamaBilgisi {
  if (oneriler.some(o => typeof o.kaynak === 'string' && esit(o.kaynak, kaynak))) return { asama: 'onayda' };
  const bagli = isler.filter(i => typeof i.kaynak === 'string' && esit(i.kaynak, kaynak));
  if (!bagli.length) return { asama: 'sirada' };
  const acik = bagli.filter(i => i.durum !== 'bitti');
  if (!acik.length) return { asama: 'onayda', is: bagli[bagli.length - 1] };
  const is = acik[acik.length - 1];
  return is.kimde === 'Kems' || is.kimde === 'Kemal' ? { asama: 'kems', kimde: is.kimde, is } : { asama: 'ajanda', kimde: is.kimde, is };
}

/** Ajansın aşama için okunan dosyaları */
export interface AjanstaVeri {
  istekler: KemalIstegi[];
  isler: AjansIsi[];
  oneriler: AjanOnerisi[];
  kararlar: Record<string, OneriKarari>;
  /** Ajansa giden son tepsideki onay bilgileri (Düzenle notları); okunamazsa null */
  tepsiOnaylar: Record<string, { zaman?: number }> | null;
}

async function tepsiOnaylariniOku(anahtar: string): Promise<Record<string, { zaman?: number }> | null> {
  try {
    const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${TEPSI_YOLU}`);
    if (!d.content) return null; // dosya büyükse içerik gelmez; bilinmiyor
    const j = JSON.parse(base64Coz(d.content)) as { onaylar?: Record<string, { zaman?: number }> };
    return j.onaylar && typeof j.onaylar === 'object' ? j.onaylar : {};
  } catch { return null; }
}

export async function ajanstaOku(anahtar: string): Promise<AjanstaVeri> {
  const [istekler, dosya, oneriler, kararlar, tepsiOnaylar] = await Promise.all([
    istekleriOku(anahtar), isleriOku(anahtar), onerileriOku(anahtar), kararlariOku(anahtar), tepsiOnaylariniOku(anahtar)
  ]);
  return { istekler, isler: dosya?.isler || [], oneriler, kararlar, tepsiOnaylar };
}

/** Ajansın dosyalarını okur (`tur` değişince yeniden); anahtar yoksa null */
export function useAjansta(anahtar: string | null, tur: number): { veri: AjanstaVeri | null; hata?: string } {
  const [d, setD] = useState<{ veri: AjanstaVeri | null; hata?: string }>({ veri: null });
  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    ajanstaOku(anahtar)
      .then(veri => { if (!iptal) setD({ veri }); })
      .catch(e => { if (!iptal) setD({ veri: null, hata: e instanceof Error ? e.message : String(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);
  return d;
}

/** Ajansta görünen bir satır: Kemal'in isteği ya da Düzenle notu */
export interface TakipSatiri {
  /** İsteğin kimliği ya da Onay bekleyenler anahtarı (iş kaydındaki `kaynak` ile aynı) */
  kaynak: string;
  tur: 'istek' | 'duzenle';
  baslik: string;
  /** Kemal'in notu / isteğin metni */
  not?: string;
  /** Hangi ekrandan, hangi ajana (istekte) */
  ekran?: string;
  ajan?: string;
  /** ms */
  zaman: number;
  durum: AsamaBilgisi;
  /** Düzenle notu ajansa gitti mi (tepsiyle); bilinmiyorsa undefined */
  gitti?: boolean;
}

const notYazi = (k: { not?: string; secenekler?: string[] }) => [...(k.secenekler || []), k.not].filter(Boolean).join(' · ') || undefined;

/** Düzenle notu ajansa gitti mi: ajan işleri doğrudan ajansın dosyasına yazılır; ötekiler tepsiyle gider */
export function notGittiMi(anahtar: string, k: OnayKaydi | OneriKarari, tepsiOnaylar: AjanstaVeri['tepsiOnaylar']): boolean | undefined {
  if (anahtar.startsWith('ajan:')) return true;
  if (!tepsiOnaylar) return undefined;
  const t = tepsiOnaylar[anahtar];
  return !!t && Number(t.zaman) >= k.zaman;
}

/**
 * Ajansta'daki bütün satırlar (en yeni üstte); yeni hâli onaya düşmüş olanlar
 * çıkar. Düzenle notları KKM kaydından (`kkm_ayar` → onaylar) ve ajan işlerinin
 * kararlarından; istekler `istekler.json`'dan ve Kems'in aldığı (artık iş
 * listesinde `kaynak`ıyla duran) isteklerden gelir.
 */
export function takipListesi(items: Item[], veri: AjanstaVeri): TakipSatiri[] {
  const { isler, oneriler } = veri;
  const liste: TakipSatiri[] = [];
  const goruldu = new Set<string>();
  const ekle = (s: Omit<TakipSatiri, 'durum'>) => {
    goruldu.add(s.kaynak);
    const durum = asamaBul(s.kaynak, isler, oneriler);
    if (durum.asama !== 'onayda') liste.push({ ...s, durum });
  };

  // Düzenle notları: öneri tepsisi, tek seferlik işler, ajansın kararları (KKM kaydında)
  const adaylar = new Map(bekleyenAdaylar(items).map(a => [a.id, a]));
  for (const [k, v] of Object.entries(onayKayitlari(items))) {
    if (v.durum !== 'duzenle') continue;
    let baslik: string | undefined;
    if (k.startsWith('oneri:')) baslik = adaylar.get(k.slice(6))?.title;
    else if (k.startsWith('is:')) baslik = k.split(':').slice(2).join(':') || undefined;
    else if (k.startsWith('karar:')) baslik = 'Ajansın kararları';
    if (!baslik) continue; // öneri silinmiş ya da işlenmiş
    ekle({ kaynak: k, tur: 'duzenle', baslik, not: notYazi(v), zaman: v.zaman, gitti: notGittiMi(k, v, veri.tepsiOnaylar) });
  }

  // Düzenle notları: ajanların işleri (ajansın deposunda)
  for (const o of oneriler) {
    const v = veri.kararlar[o.id];
    if (v?.durum !== 'duzenle') continue;
    ekle({ kaynak: `ajan:${o.id}`, tur: 'duzenle', baslik: o.baslik, not: notYazi(v), ajan: o.ajan, zaman: v.zaman, gitti: true });
  }

  // Kemal'in istekleri: henüz dosyada duranlar
  for (const i of veri.istekler) {
    ekle({
      kaynak: i.id, tur: 'istek', baslik: i.metin, zaman: Date.parse(i.tarih) || 0,
      ...(i.ekran ? { ekran: i.ekran } : {}), ...(i.ajan ? { ajan: i.ajan } : {})
    });
  }

  // Kems'in dosyadan alıp iş listesine bağladığı istekler
  for (const is of isler) {
    const k = is.kaynak;
    if (typeof k !== 'string' || !/^(istek|yapilacak)-/.test(k) || goruldu.has(k)) continue;
    ekle({ kaynak: k, tur: 'istek', baslik: is.metin, zaman: Date.parse(is.tarih || is.guncellendi || '') || 0 });
  }

  return liste.sort((x, y) => y.zaman - x.zaman);
}

/** Ajansta'daki satırlara bağlı işlerin kimlikleri (Kimde ne var'da iki kez görünmesinler) */
export function takiptekiIsler(liste: TakipSatiri[]): Set<string> {
  return new Set(liste.map(s => s.durum.is?.id).filter((x): x is string => !!x));
}
