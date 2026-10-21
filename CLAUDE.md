# CLAUDE.md — Kems Komuta Merkezi (KKM)

Bu depoda çalışan her yapay zekâ oturumu önce bu dosyayı, sonra `docs/`
klasöründeki dört belgeyi okur:

| Belge | Ne anlatır |
|---|---|
| `docs/01-calisma-kurallari.md` | Nasıl çalışılır — en önemlisi |
| `docs/02-marka-kiti.md` | Kems Company: renk, font, ton, marka yapısı |
| `docs/03-duzada-kunyesi.md` | Evrenin kanonu: ada, mahalleler, konmuş adlar |
| `docs/04-durum.md` | Şu an neredeyiz, ne bitti, ne açık |

Belgeler Kemal'in Claude projesindeki belgelerin kopyası. Çelişki olursa
Kemal'e sor; kendin seçme.

## Bu uygulama ne

Kemal'in kişisel "ikinci beyni": Düzada adlı kurgusal Ege adası evreninin
(kitap, merch, marka, harita) yönetildiği tek kullanıcılı bir panel.
Kimse dışarıdan kullanmıyor, bağlantı gizli.

**Kemal'in kodlama deneyimi yok.** Açıklamalar Türkçe, sade ve teknik
terimsiz olur. Kodu değil, **ekranda ne değiştiğini** anlat.

## Teknik

- React 19 · TypeScript 5.8 · Vite 6 · Tailwind CSS 4 · Firebase/Firestore 12
  · MapLibre GL 6 · @google/genai · lucide-react
- `npm run dev` → `tsx server.ts` (Express; `/api/ai` Gemini'ye buradan gider)
- `npm run lint` → `tsc --noEmit` · `npm run build` → vite + server paketi
- **GitHub deposu tek doğru kaynak.** AI Studio yalnızca önizleme penceresi.
- Harita verisi (`src/data/duzadaGeo.ts`) üretilir, elle düzenlenmez:
  `python gen/duzada.py` (shapely, numpy, scipy, matplotlib gerekir). Ev ve
  sokak dokusu orada (`_ege_dokusu`, Merkez için `_merkez_dokusu`, evler ve arsaları, Çiftlik arazileri).
- Tasarım jetonları `src/index.css` içindeki `@theme` bloğunda. Bütün font
  rolleri (sans, serif, mono, blok…) Poppins; rol adları bilerek duruyor.
  Tek satır değişince ~1000 yer değişir — jetona dokunmadan önce sor.
- Arayüz renkleri markanınki (Kemal, 28 Eylül gece): lacivert `#0E1C4F`,
  vurgu kiremit `#F26B6F`, krem `#F3EFE8`, kâğıt `#FAF8F5`. Karanlık modda
  lacivert düğmeler `dark:bg-[#2C3C72]` alır. Eski `#1B2A4A` / `#D35057`
  kullanılmaz.

## Kesin kurallar

**Veri**
- **Kullanılmayan kayıt ve kod silinir** (Kemal, 29 Eylül: "arka tarafta
  kullanmadığımız ne varsa sil, arşiv işi beni sinirlendirdi"). Eski
  "arşive kalkar" kuralı kalktı. Toplu silme Durum → Eksikler'deki Temizlik
  kartıyla yapılır; önce bütün kayıtların yedeği iner (`src/lib/temizlik.ts`).
  Kişi bilgileri için `src/lib/adaSakini.ts` duruyor.
- **İstisna: Merch arşivi kalır** (Kemal, 1 Ekim: "hazırlanmış ve satılmış
  droplar arşive geçer işleri bittiklerinde, belki bir gün o dropun devamını
  getiririz"). Merch'te Arşiv sekmesi ve Arşivle düğmesi durur; Temizlik
  kartı arşivdeki drop ve ürünleri silmez (`src/lib/temizlik.ts`).
- **Kayıtlara kendiliğinden yazan kod yazılmaz.** Sayfa açılınca kayıt
  oluşturan / düzelten "otomatik" etkiler kaldırıldı (örnek veri tohumu,
  bölge ve ada maddesi yaratma, otel simülasyonu); kayıt yalnız Kemal bir
  düğmeye basınca değişir.
- **Firestore:** iç içe dizi yasak. Bir alana `undefined` yazmak bütün
  kaydı reddettirir — alanı silmek için anahtarı nesneden çıkar.
  (`src/lib/firebase.ts` ayrıca temizliyor ama buna güvenme.)
- Kurucu taslağına (`KurucuBelge`) yeni alan eklenirse `src/lib/haritaDuzeni.ts`
  → `kurucuyuTemizle`'ye de eklenir; yoksa kayıtta sessizce düşer (30 Eylül'de
  özel yapı, doğa ve madde bağları böyle kayboluyordu).
- **Veri göçleri tek seferliktir ve düğmeyle çalışır.** Kalıp:
  `src/lib/` altında yazılacak kayıtları üreten saf bir fonksiyon + Durum → Eksikler
  sekmesinde (`src/components/Eksikler.tsx`) yalnızca iş varken
  görünen bir kart. İkinci basışta hiçbir şey yapmamalı. Örnekler:
  `markaYapisi.ts`, `temizlik.ts` (`eskiAlanlar`). İşi biten göç kartı ve
  kodu silinir (2 Ekim gece: soru-cevap, W3–W5, kanon, viki düzeni gitti).
- **Yazma kotası:** veritabanı ücretsiz katmanda; günlük yazma sınırı belge
  boyutuna göre sayılıyor (2 Ekim'de doldu). Büyük belgeyi sık yazan kod
  yazılmaz; Kurucu 20 sn biriktirip yazar, yollar `lib/hatSadelestir.ts`'den
  geçer. Yazma reddedilirse ekranda uyarı çıkar.

**Yazı ve ad**
- **Kurgu metni yazma.** Künye, mekân hikâyesi, slogan, drop anlatısı
  Kemal'in işi. Boş alan boş kalır, boş olduğu görünür.
- **Ad koyma.** Mekân, sokak, zirve, ürün, drop adları Kemal'in. Aday
  önerebilirsin, karar onun. Numaralı adlar ("İskele 3. Sokak") geçicidir.
- **Uydurma sayı yok.** Takipçi, erişim, fiyat: veri yoksa alan boş.
- Yazım her yerde **Kemsköy** (Türkçe ö). Norveç ø'sü yok.
  **Tek istisna:** oyunun adı **The Imperial Kemskoy** (ö'süz; Kemal, 1 Ekim).
  Yalnız oyunun adı; evrende ve vikide yazım yine Kemsköy.
- Kod içindeki değişken adları ve yorumlar Türkçe.

**Kanon**
- Vikinin bir "şimdi"si yoktur. "Hâlâ", "şu anda", "günümüzde" yazılmaz;
  tarihler aralık olarak yazılır ("Faaliyette: 1954–").
- **Oyun verisi vikiye girmez.** İstisna (Kemal, 21 Ekim): Dondurmacı Kızlar
  deposundaki kanon bilgisi ve taslak görseller **yalnız öneri olarak** öneri
  tepsisine gelebilir; oyunun ayarları (fiyat, süre) hiç gelmez. Oyun ayrı bir depoda:
  `hkemal94/TheImperialKemskoy`. **Bu depodan oraya, oradan buraya
  yazılmaz.** Buradaki eski otel simülasyonu 29 Eylül'de silindi; oyunun
  kaynağı hiçbir zaman o değildi.
- Otel departmanlarına (Resepsiyon, Kat Hizmetleri, Güvenlik) ad uydurulmaz.
- **Bağ türleri madde türüne özel** (8 Ekim, Kemal: "bir insan mekânla evli
  olamaz"): aile ve tanışıklık bağları yalnız kişi ↔ kişi; tablo
  `src/lib/bagKurallari.ts`. Bağ kuran her ekran yalnız uyan türleri gösterir.
- **Yer kartları** (8 Ekim): `yer` yalnız mahalle; cadde / sokak `cadde`,
  `meydan`, yer adı (tepe, koy…) `yer_adi`, adanın kendisi `ada`
  (`src/lib/yerTurleri.ts`). Aynı başlıkta dolu bölüme gelen öneri yeni
  bölüm açmaz, `bekleyenOneri` olarak bekler.

**Marka**
- **Kems Company tek markadır.** Dirlik Spor Kulübü ve Küçükçetmi Sürek
  Kulübü kurgu içi **kurum**dur (`type: 'kulüp'`).
- Drop iki bağ taşır: `brandId` = satan (her zaman Kems Company),
  `kurumId` = evrende kimden çıktığı (isteğe bağlı). Kurum altında seri
  açılır, ürün yine Kems Company'nin. Ayrım `src/lib/markaYapisi.ts`'de.
- Ürün hayat çizgisi: Konsept → Tasarım → Üretim → Satışta.

**Yapay zekâ** (29 Eylül)
- Bütün yapay zekâ çağrıları stüdyodan geçer (`src/lib/studyo.ts`,
  `src/components/studyo/`). Sayfalara yeni AI düğmesi konmaz; yalnız
  "✨ Stüdyoda aç". Sonuç öneri tepsisine düşer, Kemal "Ekle" demeden
  kayda yazılmaz. Sayfa açılınca kendiliğinden yapay zekâya sorulmaz.
- **Tek istisna** (Kemal, 30 Eylül, `docs/soru-cevap/yapisal-4.md`): stüdyo
  geceleri günde bir kez 3 üretim önerisi, ayın ilk günü fanzin taslağı
  hazırlar — **yalnız öneri tepsisine**. Kanona / kayda hiçbir şey yazmaz.
- Belge ile uygulama ayrıdır: karar belgeye yazıldıysa "uygulamada henüz
  yok" diye açıkça söylenir (30 Eylül'de karışmıştı).

**Kod**
- React kancaları (`useState`, `useMemo`…) her zaman erken `return`'den
  **önce** gelir. `Eksikler.tsx`'te tersi vardı, veri yüklenince hata
  veriyordu; 28 Eylül'de düzeltildi.
- Her iş sonunda `npm run lint` ve `vite build` temiz geçmeli.

## Çalışma şekli

0. **Token tasarrufu, ajanlarla çalış** (Kemal, 21 Ekim: "CEO gibi senin
   yönettiğin, bana raporladığın bir evren"). Ana oturum planlar, işi alt
   ajanlara (daha ucuz model: sonnet / haiku) dağıtır, sonucu denetler ve
   Kemal'e raporlar. Gecede üç paket sınırı kalktı. Paralel işler ayrı
   dallarda (`claude/nifty-goodall-nl52ue-<paket>`), her biri kendi PR'ı.

1. **Önce dinle.** Kemal bütün isteklerini ve itirazlarını sıralamayı
   sever. Yarısını duyup başlama; "başka var mı?" diye sor.
2. **Önce öner, onay gelince yap.** Kapsamı büyük ya da belgelerle çelişen
   bir işte başlamadan planı kısaca göster.
3. **Tek seferde tek adım.** Bir adım bitince dur, ekranda ne değiştiğini
   anlat, Kemal onaylamadan sonrakine geçme.
4. İşler kodlu paketlerle anılır: **H** harita, **W** viki, **M** marka,
   **K** küçük işler. Gecede en fazla üç paket.
5. **Her değişiklik ayrı dalda ve PR ile.** Ana dala kendin birleştirme;
   Kemal birleştirir. PR açıklaması Türkçe ve şunları söyler:
   - ekranda ne değişti,
   - basılması gereken tek seferlik düğme var mı, nerede,
   - Kemal'in elle yapması gereken bir şey var mı.
6. **Yapılmayan iş yapıldı diye sunulmaz.** Bir şey çalışmıyorsa, test
   edilemediyse ya da tahmine dayanıyorsa açıkça söyle.
7. **Görsel iş görsel gösterilir.** Tasarım değişikliğinde ekran görüntüsü
   al; anlatmakla yetinme.
8. Bir karar değişirse `docs/04-durum.md` de güncellenir.

## Kapsam

**Bu deponun işi:** Komuta Merkezi'nin bütün ekranları, **sosyal medya**
sayfası (Araçlar, 29 Eylül gece; kararlar `docs/04-durum.md`'de) ve
ileride **site / ön yüz**. Hepsi bu depoda, KKM'nin parçası.

Site başladı (29 Eylül gece): KKM içinde tam sayfa önizleme (`#site`,
`src/components/site/`): anasayfa, menü ve Keşfet sayfalarının teması
(30 Eylül, `SiteSayfalari.tsx`; boş yerler "yakında" çerçevesi). Sitede yalnız Kemal'in
"sitede göster" dediği maddeler görünür (`metadata.sitede`). Sonraki
sayfalara Kemal'in isteklerini duymadan başlama. Sosyal medyada paylaşımı Kemal yapar; Buffer
bağlantısı 2. adım.

**Bu deponun işi DEĞİL:** oyun. Ayrı depo, ayrı oturum.

**Veri alanı:** Kayıtlar Google hesabının alanında. Ortak alan kalktı
(30 Eylül): tarayıcı Kemal'i hiç tanımıyorsa "Google ile bağlan" ekranı
çıkar; tanıyorsa kendi alanı açılır.

**Tek kayıtlık ayarlar** (30 Eylül): `site_ayar` (sitenin taslağı ve
yayındaki hâli), `gece_hazirlik` (gece önerilerinin defteri), `kkm_ayar`
(Durum hedefleri, yol haritasında bitenler, Kemal'in ekrandan eklediği
işler, vikinin alan şablonu `vikiSablonu`, bağ ağının yerleşimi `bagAgiYerlesim`, zaman çizgisinin dönemleri `donemler` ve önerilmeyecek dönem adayları `reddedilenDonemler`). Temizlik bunlara dokunmaz.
**Yol haritası açık işlerin tek yeridir** (7 Ekim): plan `src/lib/yolHaritasi.ts`'te
(paket H/W/M/K, gece, kimde). Her PR kendi paketini `bitti: true` yapar;
Kemal birleştirince ekranda "bitti" olur. Kemal'in eklediği işler `kkm_ayar`'da.
7 Ekim planı ve kararlar: `docs/04-durum.md`.

## Açık işler (29 Eylül itibarıyla)

Eski otel yazıları ve ad / tarih soruları vikiye işlendi (kanon kartı,
29 Eylül gece Kemal bastı; kart ve kodu 2 Ekim'de silindi). Kalan açık
sorular `docs/soru-cevap/acik-sorular.md`'de. "Eylül Hanım" yalnız bir
ad; bu karakter hakkında hiçbir şey yazma ya da önerme.
