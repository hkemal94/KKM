/**
 * Canva görselleri (W5, 1 Ekim): galeriye ve madde görsellerine yedek olarak
 * giden PNG'ler (public/galeri/canva). W5 aktarım kartı işini bitirip
 * silindi (2 Ekim gece, Kemal: "kullanılmayan her şeyi sil"); liste galeri
 * ve madde görseli için duruyor.
 */

/** The Imperial Kemsköy maddesinin kimliği */
const OTEL_KIMLIGI = 'kemskoy_hotel';


export type W5GorselTuru = 'logo' | 'urun' | 'mekan' | 'diger';

export interface W5Gorsel {
  /** Galeride görseli tanıyan anahtar (tekrar eklenmesin) */
  anahtar: string;
  baslik: string;
  dosya: string;
  tur: W5GorselTuru;
  canvaTasarim: string;
  /** Görselin bağlanacağı kayıt — kimlik ya da ad */
  hedefKimlik?: string;
  hedefAd?: RegExp;
}

export const W5_GORSELLERI: W5Gorsel[] = [
  { anahtar: 'canva:kems:1', baslik: 'Kems Company — kutu logo', dosya: 'kems-company-kutu.png', tur: 'logo', canvaTasarim: 'kems', hedefKimlik: 'kems' },
  { anahtar: 'canva:kems:2', baslik: 'Kems Company — el yazısı', dosya: 'kems-company-el-yazisi.png', tur: 'logo', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:10', baslik: 'KEMS Apparel + Objects', dosya: 'kems-apparel-objects.png', tur: 'logo', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:11', baslik: 'KC flama', dosya: 'kc-flama.png', tur: 'logo', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:12', baslik: 'KC monogram', dosya: 'kc-monogram.png', tur: 'logo', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:3', baslik: 'Birlik Birası etiketi', dosya: 'birlik-birasi-etiketi.png', tur: 'urun', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:4', baslik: 'Birlik Zeytin etiketi', dosya: 'birlik-zeytin-etiketi.png', tur: 'urun', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:7', baslik: 'Kems Coffee Co.', dosya: 'kems-coffee-co.png', tur: 'urun', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:5', baslik: 'Zeytin Selelerini Yaşatma Derneği (tasarım şakası)', dosya: 'zeytin-seleleri-dernegi.png', tur: 'diger', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:6', baslik: 'Kemsköy Tabakhane etiketi (tasarım şakası)', dosya: 'kemskoy-tabakhane-etiketi.png', tur: 'diger', canvaTasarim: 'kems' },
  { anahtar: 'canva:kems:9', baslik: 'Dirlik Spor Kulübü arması', dosya: 'dirlik-spor-kulubu-arma.png', tur: 'logo', canvaTasarim: 'kems', hedefAd: /dirlik/i },
  { anahtar: 'canva:kems:8', baslik: 'Dondurmacı Kızlar logosu', dosya: 'dondurmaci-kizlar.png', tur: 'logo', canvaTasarim: 'kems', hedefKimlik: 'viki_mekan_liman_kafe' },
  { anahtar: 'canva:kucukcetmi:3', baslik: 'Küçükçetmi Sürek Kulübü — yazı logosu', dosya: 'kucukcetmi-yazi.png', tur: 'logo', canvaTasarim: 'Küçükçetmi Sürek Kulübü', hedefAd: /küçükçetmi|kucukcetmi/i },
  { anahtar: 'canva:kucukcetmi:1', baslik: 'Küçükçetmi Sürek Kulübü — Kangal', dosya: 'kucukcetmi-kangal.png', tur: 'logo', canvaTasarim: 'Küçükçetmi Sürek Kulübü' },
  { anahtar: 'canva:kucukcetmi:2', baslik: 'KC monogram (Küçükçetmi tasarımından)', dosya: 'kucukcetmi-kc-monogram.png', tur: 'logo', canvaTasarim: 'Küçükçetmi Sürek Kulübü' },
  { anahtar: 'canva:kucukcetmi:4', baslik: 'Küçükçetmi Sürek Kulübü — afiş', dosya: 'kucukcetmi-afis.png', tur: 'mekan', canvaTasarim: 'Küçükçetmi Sürek Kulübü' },
  { anahtar: 'canva:the-imperial:1', baslik: 'The Imperial Kemsköy', dosya: 'the-imperial-kemskoy.png', tur: 'mekan', canvaTasarim: 'The Imperial', hedefKimlik: OTEL_KIMLIGI }
];

export const w5GorselAdresi = (g: W5Gorsel) =>
  `${import.meta.env.BASE_URL || '/'}galeri/canva/${g.dosya}`;
