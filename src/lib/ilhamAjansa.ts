import type { Item } from '../types';
import { ilhamBilgisi, ilhamlar } from './ilhamlar';
import { ajansaDosyaYaz } from './tepsiAjansa';

/**
 * İlhamı ajansa gönder (4 Kasım, Kemal: video ve oyun bağlantıları ajansa
 * gitsin). İlham ve kaynaklar listesi ajansın gizli deposuna
 * `kkm/ilham.json` olarak yazılır (`lib/haritaAjansa.ts` ile aynı yol).
 * Yalnız bağlantı ve metin gider; görselin kendisi gitmez (yalnız "görseli
 * var" bilgisi). KKM kayıtlarına hiçbir şey yazılmaz; her basışta dosyanın
 * yerine yenisi.
 */

export const ILHAM_YOLU = 'kkm/ilham.json';

/** Gönderilecek dosyanın içeriği (saf iş; ağ yok) */
export function ilhamDosyasi(items: Item[], zaman = new Date()) {
  const ad = new Map(items.map(i => [i.id, i.title]));
  const liste = ilhamlar(items).map(i => {
    const b = ilhamBilgisi(i);
    return {
      id: i.id,
      baslik: i.title,
      tur: b.tur,
      baglanti: b.baglanti || null,
      etiketler: i.tags || [],
      not: i.notes || '',
      gorselVar: (i.images || []).length > 0,
      baglar: b.baglar.filter(id => ad.has(id)).map(id => ({ id, baslik: ad.get(id) as string })),
      guncellendi: new Date(i.updatedAt).toISOString()
    };
  });
  return {
    _aciklama: "KKM → Ürünler → İlham ve kaynaklar. Kemal 'İlhamı ajansa gönder'e basınca yazılır; elle düzenlenmez. tur: ilham | kaynak. Görseller gitmez (gorselVar yalnız bilgi).",
    olusturuldu: zaman.toISOString(),
    sayilar: { kayit: liste.length, baglantili: liste.filter(x => x.baglanti).length },
    ilhamlar: liste
  };
}

export type IlhamDosyasi = ReturnType<typeof ilhamDosyasi>;

/** Dosyayı ajansın ana dalına yazar; GitHub adresini döner */
export function ilhamiGonder(anahtar: string, dosya: IlhamDosyasi): Promise<string> {
  return ajansaDosyaYaz(anahtar, ILHAM_YOLU, `${JSON.stringify(dosya, null, 2)}\n`,
    `KKM ilham ve kaynaklar: ${dosya.sayilar.kayit} kayıt`, 'ilham listesi');
}
