import { ajansaDosyaYaz } from '../../../../lib/tepsiAjansa';
import { taslakSayilari, taslakYazisi, type TekTaslak } from './taslak';

/**
 * "Haritaya işle" (7. adım, 22 Kasım): taslak Kems Ajans'ın gizli deposuna
 * `kkm/tek-harita-taslak.json` olarak gider ("Haritayı ajansa gönder" ile aynı yol,
 * `lib/tepsiAjansa.ts`). Ajans (Kems) dosyayı üreteç zincirine işler
 * (`python gen/kompakt_taslak_uygula.py <dosya>`), KKM'ye öneri PR'ı açar; Kemal
 * birleştirince harita yeni hâliyle açılır. KKM kayıtlarına bir şey yazılmaz.
 */

export const TASLAK_DOSYASI = 'kkm/tek-harita-taslak.json';

const ACIKLAMA = {
  _genel: "KKM → Harita → Düzenle'de yapılan değişiklikler (yalnız değişiklikler). Kemal 'Haritaya işle'ye basınca yazılır; elle düzenlenmez. Koordinatlar [boylam, enlem]; n düz dizi [boylam0, enlem0, boylam1, enlem1, …]. Ajans gen/kompakt_taslak_uygula.py ile işler, KKM'ye PR açar.",
  yapilar: 'Var olan yapı (duzada-yapilar.geojson kimliği) → { sil: true } ya da { m: yeni merkez, ex: yeni +X yönü (x doğu, z güney) }.',
  yeniYapilar: 'Yeni yapı → { tur, dosya (public/modeller/), m, ex, en, boy, yukseklik, modelEn?, grup? }. tur agac / donati: küçük öğe.',
  yollar: 'Var olan yol (duzada-yollar.geojson kimliği) → { sil: true } ya da { n?, kademe?, ad?, tur? }. ad boşsa adsız (ad Kemal\'in).',
  yeniYollar: 'Yeni yol → { kademe, tur, ad, n, grup?, bolundu? (bölünen yolun kimliği) }.',
  kareler: 'Kare (duzada-kareler.json kimliği) → park | bahce | meydancik | agac | bos.',
  gruplar: 'Konan hazır grup → { sablon (çeşit kimliği), kirp { sol, sag, arka }, o [boylam, enlem], aci (U yönü, radyan; sahne x doğu, z güney), yan (N = yan · (−U.z, U.x)), yer, dayanak, arsalar }. Öğeleri yeniYapilar / yeniYollar\'da grup etiketiyle.'
};

export function taslakDosyasi(t: TekTaslak, zaman = new Date()) {
  return {
    aciklama: ACIKLAMA,
    olusturuldu: zaman.toISOString(),
    sayilar: taslakSayilari(t),
    taslak: JSON.parse(taslakYazisi(t)) as unknown
  };
}

export function haritayaIsle(anahtar: string, t: TekTaslak): Promise<string> {
  const metin = `${JSON.stringify(taslakDosyasi(t), null, 1)}\n`;
  return ajansaDosyaYaz(anahtar, TASLAK_DOSYASI, metin, 'KKM: tek harita taslağı (Haritaya işle)', 'taslak');
}
