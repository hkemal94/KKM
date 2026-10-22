import type { Item } from '../types';
import { adayBilgisi, bekleyenAdaylar, eskiOneriler, seceneksizMi, sorulacaklar } from './adaylar';
import { aracBul, yapayZekaOnerisi } from './studyo';
import { base64, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Tepsiyi ajansa gönder (22 Ekim, Kemal: "ilgili ajan bunu kendi üzerine
 * alsın ve o tepsiyi de pano yönetsin"). Firebase anahtarı alınamadığı için
 * (Google kuruluş kuralı) köprü GitHub: öneri tepsisi ve günün soruları
 * JSON olarak Kems Ajans'ın deposuna, `kkm/tepsi.json`'a yazılır. Ajans
 * geceleri okur; mantıksızları eler, basitleri hazırlar, sorulacakları
 * kendi kutusuna alır.
 *
 * - Yalnız gizli depoya yazılır: depo açıksa hiçbir şey gönderilmez
 *   (tepside onaylanmamış taslaklar ve Kemal'in cevapları var).
 * - Yazma yolu "Ajansa gönder" ile aynı (`lib/ajansaGonder.ts`): GitHub
 *   anahtarı yalnız bu tarayıcıda; Kemal bastığı için ana dala yazılır.
 * - Her basışta dosyanın yerine yenisi yazılır (tepsinin o anki hâli).
 * - KKM kayıtlarına hiçbir şey yazılmaz; yazma sınırı yemez.
 */

export const TEPSI_YOLU = 'kkm/tepsi.json';

/** Ajansın maddeyi tanıması için kısa bilgi; görseller gitmez */
const OZET_SINIRI = 1200;
const maddeOzeti = (i: Item) => ({
  baslik: i.title,
  tur: i.type,
  ...(i.metadata?.region ? { mahalle: i.metadata.region } : {}),
  notlar: (i.notes || '').slice(0, OZET_SINIRI),
});

/** Gönderilecek dosyanın içeriği (saf iş; ağ yok) */
export function tepsiDosyasi(items: Item[], zaman = new Date()) {
  const kimlik = new Map(items.map(i => [i.id, i]));
  const hedefler = new Set<string>();
  const hedef = (id?: string) => { if (id && kimlik.has(id)) hedefler.add(id); return id || null; };

  const oneriler = bekleyenAdaylar(items).map(a => {
    const yz = yapayZekaOnerisi(a);
    if (yz) {
      const { gorseller: _gorseller, ...oneri } = yz;
      return {
        id: a.id, tur: 'yapay_zeka' as const, baslik: a.title, tarih: yz.tarih,
        arac: yz.arac, aracAdi: aracBul(yz.arac)?.ad || yz.arac,
        hedefId: hedef(yz.hedefId), oneri,
      };
    }
    const b = adayBilgisi(a);
    return {
      id: a.id, tur: 'cevap' as const, baslik: a.title, tarih: b?.tarih,
      hedefId: hedef(b?.hedefId), soru: b?.soru, etiket: b?.etiket, cevap: a.notes,
    };
  });

  const eskiler = eskiOneriler(items).map(i => ({
    id: i.id, tur: 'eski' as const, baslik: i.title, maddeTuru: i.type,
    notlar: (i.notes || '').slice(0, OZET_SINIRI), tarih: new Date(i.createdAt).toISOString().slice(0, 10),
  }));

  const sorular = sorulacaklar(items, 1000).map(b => ({
    anahtar: b.anahtar, hedefId: hedef(b.item.id), alanId: b.alanId,
    etiket: b.etiket, soru: b.soru, seceneksiz: seceneksizMi(b),
  }));

  return {
    _aciklama: "KKM'nin öneri tepsisi ve günün soruları. Kemal 'Tepsiyi ajansa gönder'e basınca yazılır; elle düzenlenmez.",
    gonderildi: zaman.toISOString(),
    sayilar: { oneri: oneriler.length, eski: eskiler.length, soru: sorular.length },
    oneriler, eskiler, sorular,
    maddeler: Object.fromEntries([...hedefler].map(id => [id, maddeOzeti(kimlik.get(id)!)])),
  };
}

export type TepsiDosyasi = ReturnType<typeof tepsiDosyasi>;

/**
 * Ajansın gizli deposunun ana dalına bir dosya yazar (varsa yerine); GitHub
 * adresini döner. Depo açıksa hiçbir şey yazılmaz. Tepsi ve viki aktarımı
 * (`lib/vikiAjansa.ts`) bunu paylaşır.
 */
export async function ajansaDosyaYaz(anahtar: string, yol: string, icerik: string, mesaj: string, ad: string): Promise<string> {
  const bilgi = await github<{ default_branch: string; private: boolean }>(anahtar, `/repos/${AJANS_DEPOSU}`);
  if (!bilgi.private) throw new Error(`Kems-Ajans deposu herkese açık; ${ad} gönderilmedi. Önce depoyu GitHub'da gizli (Private) yap.`);
  const dal = bilgi.default_branch;
  let sha: string | undefined;
  try {
    sha = (await github<{ sha: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}?ref=${encodeURIComponent(dal)}`)).sha;
  } catch { /* ilk gönderim: dosya yok */ }
  const sonuc = await github<{ content: { html_url: string } }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}`, {
    method: 'PUT',
    govde: { message: mesaj, content: base64(icerik), branch: dal, ...(sha ? { sha } : {}) },
  });
  return sonuc.content.html_url;
}

/** Tepsi dosyasını ajansın ana dalına yazar; GitHub adresini döner */
export function tepsiyiGonder(anahtar: string, dosya: TepsiDosyasi): Promise<string> {
  const s = dosya.sayilar;
  return ajansaDosyaYaz(anahtar, TEPSI_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM tepsisi: ${s.oneri} öneri, ${s.eski} eski öneri, ${s.soru} soru`, 'tepsi');
}
