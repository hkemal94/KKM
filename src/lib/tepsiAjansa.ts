import type { Item } from '../types';
import { adayBilgisi, bekleyenAdaylar, eskiOneriler, seceneksizMi, sorulacaklar } from './adaylar';
import { aracBul, yapayZekaOnerisi } from './studyo';
import { base64, base64Coz, github, GithubHatasi } from './oyunAyarlari';
import { guncelHaleYaz, yeniDosyaYaz } from './cakisma';
import { AJANS_DEPOSU } from './ajansDeposu';
import { onayKayitlari } from './onaylar';

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
    _aciklama: "KKM'nin öneri tepsisi ve günün soruları. Kemal 'Tepsiyi ajansa gönder'e basınca ya da KKM açıkken tepsi değişince kendiliğinden yazılır; elle düzenlenmez.",
    gonderildi: zaman.toISOString(),
    sayilar: { oneri: oneriler.length, eski: eskiler.length, soru: sorular.length },
    oneriler, eskiler, sorular,
    // Onay bekleyenler'de Kemal'in düğmeleri (2 Kasım): "duzenle" notuyla ajans
    // revize eder; "arsiv", "bekle", "silindi" ajansa bilgi. Anahtar: oneri:<id>,
    // is:<iş>, karar:<dosya tarihi>.
    onaylar: onayKayitlari(items),
    maddeler: Object.fromEntries([...hedefler].map(id => [id, maddeOzeti(kimlik.get(id)!)])),
  };
}

export type TepsiDosyasi = ReturnType<typeof tepsiDosyasi>;

/**
 * Ajansa yazmalar sırayla gider (4 Kasım): tepsi ve viki açılıştan 20 sn
 * sonra aynı anda gönderiliyordu; ikisi de ana dala yazdığı için biri
 * "GitHub 409" ile reddediliyordu. Artık her yazma bir öncekinin bitmesini
 * bekler.
 */
let kuyruk: Promise<unknown> = Promise.resolve();

/**
 * Ajansın gizli deposunun ana dalına bir dosya yazar (varsa yerine); GitHub
 * adresini döner. Depo açıksa hiçbir şey yazılmaz. Tepsi, viki, harita,
 * ilham, yazı ve ajan ayarları bunu paylaşır.
 *
 * Dosya ya da dal okunduktan sonra değiştiyse (ajans gece yazdı, başka bir
 * gönderim araya girdi) GitHub 409 döner: dosyanın güncel hâli yeniden
 * okunur ve birkaç kez daha denenir. Gönderilen her zaman dosyanın tamamı
 * ve KKM'deki en son hâlidir; öncekinin yerine geçmesi istenen şeydir.
 *
 * Listeye ekleyen yazmalar (istekler, öneri kararları, asset kararları) içeriği
 * işlev olarak verir: her denemede dosyanın güncel hâli (`ham`, yoksa null)
 * okunur ve içerik onun üstüne yeniden kurulur; eski okunuşla ezilmez (15 Kasım).
 */
export type Icerik = string | ((ham: string | null) => string);

export function ajansaDosyaYaz(anahtar: string, yol: string, icerik: Icerik, mesaj: string, ad: string): Promise<string> {
  return sirayaKoy(() => ajansaYazDene(anahtar, yol, icerik, mesaj, ad));
}

/** Her yazma bir öncekinin bitmesini bekler */
function sirayaKoy<T>(is: () => Promise<T>): Promise<T> {
  const p = kuyruk.then(is);
  kuyruk = p.catch(() => undefined);
  return p;
}

/** Ajansın deposu gizli mi; ana dalın adını döner. Açıksa hiçbir şey yazılmaz. */
async function gizliDepoDali(anahtar: string, ad: string): Promise<string> {
  const bilgi = await github<{ default_branch: string; private: boolean }>(anahtar, `/repos/${AJANS_DEPOSU}`);
  if (!bilgi.private) throw new Error(`Kems-Ajans deposu herkese açık; ${ad} gönderilmedi. Önce depoyu GitHub'da gizli (Private) yap.`);
  return bilgi.default_branch;
}

async function ajansaYazDene(anahtar: string, yol: string, icerik: Icerik, mesaj: string, ad: string): Promise<string> {
  const dal = await gizliDepoDali(anahtar, ad);
  return guncelHaleYaz(
    async () => {
      try {
        const d = await github<{ sha: string; content?: string; encoding?: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}?ref=${encodeURIComponent(dal)}&t=${Date.now()}`);
        // Çok büyük dosyada GitHub içeriği vermez; üstüne eklenecekse körlemesine ezilmesin
        if (typeof icerik === 'function' && (d.encoding !== 'base64' || typeof d.content !== 'string')) throw new Error(`${yol} okunamadı; ${ad} gönderilmedi`);
        return { sha: d.sha as string | undefined, ham: typeof d.content === 'string' ? base64Coz(d.content) : null };
      } catch (e) {
        // İlk gönderim: dosya yok (404). Başka bir hata gerçek hatadır.
        if (!(e instanceof GithubHatasi) || e.durum !== 404) throw e;
        return { sha: undefined, ham: null };
      }
    },
    async ({ sha, ham }) => {
      const metin = typeof icerik === 'function' ? icerik(ham) : icerik;
      const sonuc = await github<{ content: { html_url: string } }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}`, {
        method: 'PUT',
        govde: { message: mesaj, content: base64(metin), branch: dal, ...(sha ? { sha } : {}) },
      });
      return sonuc.content.html_url;
    },
  );
}

/**
 * Ajansın deposunda yeni dosya açar (makbuz, "Ajansa gönder" dosyası); GitHub
 * adresini döner. Dal bu arada ilerlediyse (409) yeniden dener; o adda dosya
 * varsa (422) adın sonuna -2, -3 … ekler (15 Kasım: makbuz 409 ile düşüyordu).
 */
export function ajansaYeniDosyaYaz(anahtar: string, yol: string, icerik: string, mesaj: string, ad: string): Promise<string> {
  return sirayaKoy(async () => {
    const dal = await gizliDepoDali(anahtar, ad);
    return yeniDosyaYaz(yol, async y => {
      const sonuc = await github<{ content: { html_url: string } }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${y}`, {
        method: 'PUT',
        govde: { message: mesaj, content: base64(icerik), branch: dal },
      });
      return sonuc.content.html_url;
    });
  });
}

/** Tepsi dosyasını ajansın ana dalına yazar; GitHub adresini döner */
export function tepsiyiGonder(anahtar: string, dosya: TepsiDosyasi): Promise<string> {
  const s = dosya.sayilar;
  return ajansaDosyaYaz(anahtar, TEPSI_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM tepsisi: ${s.oneri} öneri, ${s.eski} eski öneri, ${s.soru} soru`, 'tepsi');
}
