import React, { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Item } from '../../types';
import { useHaritaDuzeni } from '../../lib/haritaDuzeni';
import { KAYIT_SINIRI, acilisOlcumu, boyut, indirilenParcalar, kayitBoyutlari, kb, sn } from '../../lib/olcumler';
import { sayaciOku, sayaciSifirla, siraliSayilar } from '../../lib/sayfaSayaci';
import { DUGME_BOS, ETIKET, IKINCIL, KART, YAZI } from './stil';

/**
 * Durum → Boyut ve hız (3. gece; Kemal, 7 Ekim). Üç bölüm: kayıt
 * boyutları, uygulama parçaları, açılış hızı. Hepsi bu tarayıcıda ölçülür;
 * hiçbir şey kayda yazılmaz. Sayılar ölçüm, tahmin değil.
 */

const TUR_ADI: Record<string, string> = {
  kisi: 'Kişi', karakter: 'Kişi', aile: 'Aile', 'mekân': 'Mekân', 'dükkân': 'Dükkân', yer: 'Mahalle', kulüp: 'Kurum', marka: 'Marka',
  olay: 'Olay', 'ürün': 'Eşya', oda: 'Oda', kitap_bolum: 'Kitap bölümü', kitap_proje: 'Kitap', ilham_gorsel: 'Galeri görseli',
  gdd_bolum: 'Oyun belgesi', oyun_tanitim: 'Oyun', oyun_is: 'Oyun işi', oyun_fikir: 'Oyun fikri', merch_urun: 'Merch ürünü', drop: 'Drop',
  blog_post: 'Yazı', aday: 'Öneri', fikir: 'Not', kkm_ayar: 'KKM ayarları', site_ayar: 'Site ayarları', gece_hazirlik: 'Gece önerileri',
  channel: 'Kanal', map_pin: 'Harita işareti', tuval: 'Tuval panosu', map_settings: 'Harita ayarı', ilham_kaynak: 'İlham kaynağı'
};

/** Tek dizi büyüklük çubuğu: lacivert, ince, uçları yuvarlak */
const Cubuk: React.FC<{ oran: number; uyari?: boolean }> = ({ oran, uyari }) => (
  <span className="block h-1.5 rounded-full bg-[#E4DCCD] dark:bg-[#2C3C72]/60 overflow-hidden">
    <span className={`block h-full rounded-full ${uyari ? 'bg-[#D6484C] dark:bg-[#F26B6F]' : 'bg-[#0E1C4F] dark:bg-[#A6B0C9]'}`}
      style={{ width: `${Math.max(1.5, Math.min(100, oran * 100))}%` }} />
  </span>
);

export const BoyutHiz: React.FC<{ items: Item[] }> = ({ items }) => {
  const { duzen } = useHaritaDuzeni();
  const kayit = useMemo(() => kayitBoyutlari(items), [items]);
  const haritaKaydi = useMemo(() => (duzen ? boyut(duzen) : 0), [duzen]);
  // Parçalar ve açılış o an okunur; "Yenile" ile yeniden
  const [an, setAn] = useState(0);
  const parca = useMemo(() => indirilenParcalar(), [an]);
  const acilis = useMemo(() => acilisOlcumu(), [an]);
  const [sayac, setSayac] = useState(sayaciOku);
  const sayacSirali = useMemo(() => siraliSayilar(sayac), [sayac]);
  const enCokAcilan = sayacSirali[0]?.sayi || 1;
  const enBuyukTur = kayit.turler[0]?.bayt || 1;
  const enBuyukParca = parca.parcalar[0]?.bayt || 1;
  const enYavas = Math.max(1, ...acilis.gecmis.flatMap(g => [g.kayitlar || 0, g.harita || 0]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-[13px] ${IKINCIL} flex-1 min-w-[16rem]`}>
          Bu tarayıcıda ölçülür; hiçbir şey kayda yazılmaz. Bir kaydın sınırı 1 MB (veritabanının kuralı).
        </p>
        <button type="button" onClick={() => { setAn(n => n + 1); setSayac(sayaciOku()); }} className={DUGME_BOS}><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
      </div>

      {/* Sayfa açılışları (22 Ekim): yalnız bu tarayıcıda sayılır, kayda yazılmaz */}
      <section className={`${KART} p-4 space-y-3`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className={ETIKET}>Sayfa açılışları</div>
          <span className={`ml-auto text-[12px] ${IKINCIL}`}>
            {sayac.ilk ? `İlk sayım ${new Date(sayac.ilk).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Henüz sayım yok'}
          </span>
        </div>
        {sayacSirali.length === 0 ? (
          <p className={`text-[12px] ${IKINCIL}`}>Veri yok. Sayfalar açıldıkça burada sıralanır.</p>
        ) : (
          <ul className="space-y-2">
            {sayacSirali.map(s => (
              <li key={s.ad}>
                <div className="flex items-baseline gap-2 text-[12px]">
                  <span className={`flex-1 min-w-0 truncate ${YAZI}`}>{s.ad}</span>
                  <span className={`tabular-nums ${YAZI}`}>{s.sayi.toLocaleString('tr-TR')}</span>
                </div>
                <Cubuk oran={s.sayi / enCokAcilan} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[11px] flex-1 min-w-[14rem] ${IKINCIL}`}>Yalnız bu tarayıcıda tutulur; veritabanına yazılmaz. Başka cihazın sayımı ayrıdır.</p>
          <button type="button" disabled={!sayac.ilk}
            onClick={() => { if (window.confirm('Sayfa açılış sayımı sıfırlansın mı?')) { sayaciSifirla(); setSayac(sayaciOku()); } }}
            className={DUGME_BOS}>Sıfırla</button>
        </div>
      </section>

      {/* Kayıt boyutları */}
      <section className={`${KART} p-4 space-y-3`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className={ETIKET}>Kayıt boyutları</div>
          <span className={`ml-auto text-[12px] ${IKINCIL}`}>{items.length.toLocaleString('tr-TR')} kayıt · {kb(kayit.toplam)}</span>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className={`text-left ${IKINCIL}`}>
              <th className="font-semibold py-1">Tür</th>
              <th className="font-semibold py-1 text-right w-16">Kayıt</th>
              <th className="font-semibold py-1 text-right w-20">Boyut</th>
              <th className="py-1 w-[35%] hidden sm:table-cell"><span className="sr-only">Oran</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
            {kayit.turler.map(t => (
              <tr key={t.tur} title={`${TUR_ADI[t.tur] || t.tur}: ${t.sayi} kayıt, ${kb(t.bayt)}`}>
                <td className={`py-1.5 ${YAZI}`}>{TUR_ADI[t.tur] || t.tur}</td>
                <td className={`py-1.5 text-right tabular-nums ${YAZI}`}>{t.sayi}</td>
                <td className={`py-1.5 text-right tabular-nums ${YAZI}`}>{kb(t.bayt)}</td>
                <td className="py-1.5 pl-3 hidden sm:table-cell"><Cubuk oran={t.bayt / enBuyukTur} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={ETIKET}>En büyük 10 kayıt</div>
        <ul className="space-y-2">
          {haritaKaydi > 0 && (
            <li title={`Harita düzeni: ${kb(haritaKaydi)} · sınırın %${Math.round(haritaKaydi / KAYIT_SINIRI * 100)}'i`}>
              <div className="flex items-baseline gap-2 text-[12px]">
                <span className={`flex-1 min-w-0 truncate ${YAZI}`}>Harita düzeni <span className={IKINCIL}>· Kurucu ve harita kaydı</span></span>
                <span className={`tabular-nums ${YAZI}`}>{kb(haritaKaydi)}</span>
                <span className={`w-12 text-right tabular-nums ${IKINCIL}`}>%{Math.round(haritaKaydi / KAYIT_SINIRI * 100)}</span>
              </div>
              <Cubuk oran={haritaKaydi / KAYIT_SINIRI} uyari={haritaKaydi > KAYIT_SINIRI * 0.7} />
            </li>
          )}
          {kayit.enBuyukler.map(k => (
            <li key={k.id} title={`${k.ad}: ${kb(k.bayt)} · sınırın %${Math.round(k.bayt / KAYIT_SINIRI * 100)}'i`}>
              <div className="flex items-baseline gap-2 text-[12px]">
                <span className={`flex-1 min-w-0 truncate ${YAZI}`}>{k.ad} <span className={IKINCIL}>· {TUR_ADI[k.tur] || k.tur}</span></span>
                <span className={`tabular-nums ${YAZI}`}>{kb(k.bayt)}</span>
                <span className={`w-12 text-right tabular-nums ${IKINCIL}`}>%{Math.max(0, Math.round(k.bayt / KAYIT_SINIRI * 100))}</span>
              </div>
              <Cubuk oran={k.bayt / KAYIT_SINIRI} uyari={k.bayt > KAYIT_SINIRI * 0.7} />
            </li>
          ))}
        </ul>
        <p className={`text-[11px] ${IKINCIL}`}>Yüzde, kaydın 1 MB sınırının ne kadarını doldurduğu. %70'i geçen kayıt kiremit renkte görünür.</p>
      </section>

      {/* Uygulama parçaları */}
      <section className={`${KART} p-4 space-y-3`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className={ETIKET}>Uygulama parçaları · bu açılışta indirilenler</div>
          <span className={`ml-auto text-[12px] ${IKINCIL}`}>{kb(parca.toplam)}</span>
        </div>
        {!parca.parcalar.length ? (
          <p className={`text-[12px] ${IKINCIL}`}>Tarayıcı indirme kaydını vermedi.</p>
        ) : (
          <ul className="space-y-2">
            {parca.parcalar.map(p => (
              <li key={p.ad} title={`${p.ad}: ${p.dosyalar} dosya, ${kb(p.bayt)}`}>
                <div className="flex items-baseline gap-2 text-[12px]">
                  <span className={`flex-1 min-w-0 truncate ${YAZI}`}>{p.ad}</span>
                  <span className={`tabular-nums ${IKINCIL}`}>{p.dosyalar} dosya</span>
                  <span className={`w-20 text-right tabular-nums ${YAZI}`}>{kb(p.bayt)}</span>
                </div>
                <Cubuk oran={p.bayt / enBuyukParca} />
              </li>
            ))}
          </ul>
        )}
        <p className={`text-[11px] ${IKINCIL}`}>Bir bölüm yalnız açıldığında indirilir. Haritayı, Kurucu'yu ya da PDF'i açtıktan sonra "Yenile"ye basınca onlar da listeye gelir.</p>
      </section>

      {/* Açılış hızı */}
      <section className={`${KART} p-4 space-y-3`}>
        <div className={ETIKET}>Açılış hızı</div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['İlk ekran', acilis.sayfa, 'Sayfa açılınca ilk ekranın çizilmesi'],
            ['Kayıtlar', acilis.kayitlar, 'Açılıştan kayıtların ekrana gelmesine'],
            ['Harita', acilis.harita, "Harita'ya girişten haritanın çizilmesine"]
          ] as const).map(([ad, ms, aciklama]) => (
            <div key={ad} className="rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] p-3">
              <dt className={`text-[12px] ${IKINCIL}`}>{ad}</dt>
              <dd className={`text-[22px] font-bold tabular-nums ${YAZI}`}>{sn(ms)}</dd>
              <dd className={`text-[11px] ${IKINCIL}`}>{ms === undefined && ad === 'Harita' ? "Bu açılışta Harita'ya girilmedi" : aciklama}</dd>
            </div>
          ))}
        </dl>
        {acilis.gecmis.length > 0 && (
          <>
            <div className={ETIKET}>Son açılışlar · bu tarayıcı</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className={`text-left ${IKINCIL}`}>
                  <th className="font-semibold py-1">Ne zaman</th>
                  <th className="font-semibold py-1 text-right w-20">Kayıtlar</th>
                  <th className="font-semibold py-1 text-right w-20">Harita</th>
                  <th className="py-1 w-[30%] hidden sm:table-cell"><span className="sr-only">Kayıtlar süresi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
                {acilis.gecmis.map(g => (
                  <tr key={g.tarih}>
                    <td className={`py-1.5 ${YAZI}`}>{new Date(g.tarih).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={`py-1.5 text-right tabular-nums ${YAZI}`}>{sn(g.kayitlar)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${YAZI}`}>{sn(g.harita)}</td>
                    <td className="py-1.5 pl-3 hidden sm:table-cell">{g.kayitlar !== undefined && <Cubuk oran={g.kayitlar / enYavas} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
};

export default BoyutHiz;
