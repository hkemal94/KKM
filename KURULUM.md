# Düzada Viki — kurulum

> **23 Kasım 2026 notu:** eski haritalar, Kurucu, MapLibre ve eski harita üreteci (`gen/duzada.py`, `gen/dem.py`) silindi (tek harita 11. adım). Bu belgedeki harita bölümleri geçmişin kaydıdır; bugünkü harita için `CLAUDE.md` → Teknik.

## ÖNEMLİ — geçen yüklemede ne ters gitti

Dosyalar repoya **`duzada-nihai/` klasörünün içine** düştü. Uygulama kök
dizindeki `src/` klasörünü çalıştırdığı için hiçbir şey değişmedi.

Doğrusu: zip'i aç, **klasörün kendisini değil, içindekileri** sürükle.

```
YANLIŞ                          DOĞRU
repo/                           repo/
└── duzada-nihai/               ├── src/
    ├── src/                    ├── src/
    ├── gen/                    ├── gen/
    └── ...                     └── ...
```

Repodaki `duzada-nihai/` klasörünü de silmen gerekiyor. GitHub'ın web
arayüzünde klasör silme düğmesi yok; en kolayı: repo sayfasındayken klavyeden
**nokta tuşuna (`.`)** bas — tarayıcıda VS Code açılır. Soldaki ağaçtan
`duzada-nihai` klasörüne sağ tıkla → **Delete** → sol üstten **Commit &
Push**. Silmezsen uygulama yine de çalışır, sadece repoda ölü bir kopya durur.

## Bu sürümde eski wiki ve eski harita kaldırıldı

- `src/components/DuzadaWiki.tsx` **silindi**. "Düzada Wiki" sekmesi artık
  `src/components/wiki/WikiShell.tsx`'i açıyor — mahalle → mekân → kişi
  ağacıyla çalışan yeni wiki. (Künye soruları `wiki/kunyeSorulari.ts`'e taşındı.)
- Eski parşömen pin haritası (`EGE HARİTA ARAYÜZÜ v1`) **silindi**: panel,
  pin ekleme/sürükleme/düzenleme kartları ve arkalarındaki işleyiciler gitti.
  "Düzada Haritası" sekmesinde artık yalnız 3B arazi haritası var.
  **Kaybolan tek şey:** haritaya elle pin koyma. Yerine, haritadaki yapıya
  tıklayıp "Viki maddesini aç" var.
- Mahalle kartlarında "Eski_liman", "Stad" gibi ham anahtarlar görünüyordu;
  artık mahallenin kendi adı yazıyor. Eski `eski liman / kemskoy` bölgesi
  İskele Mahallesine bağlandı, ada çatı kaydı ("Düzada") madde listesinden çıktı.

## Son tur (14 Eylül 2026, ikinci paket)

Excel'in "Bekleyen sorular" sekmesindeki 10 cevabının kodda karşılığı:

| Cevabın | Kodda ne oldu |
|---|---|
| "Belediye binası olarak güncelle" | Haritadaki `bina_belediye` artık **Belediye Binası** (eskiden Ada Konağı) |
| "Otelin yanına bir tarihi meyhane ekleyebilirsin" | Yeni yapı `bina_meyhane` — yerleşkenin karaya bakan ucunda, bahçenin gerisinde ayrı kütle. Otelin alt alanı değil, kendi başına mekân |
| "Liman Kafesi artık liman mahallesinde olsun" | Otelden alındı; yeni yapı `bina_liman_kafe` körfez kıyısına çizildi |
| "Farklılaştır" (kopyalanmış karakter metinleri) | 6 kişiye görevine uygun yeni fizik, saç, kişilik, sevdikleri ve sevmedikleri metni yazıldı: Begüm Çalışkan, Ceyda Demir, Bulut Korkmaz, Ahsen Ay, Sibel Dansu, Nusret Demir. Her grupta belgede ilk geçen kişinin metni korundu |
| "Spa kaldır", "ek bina yok" | Zaten listede değillerdi; onaylandı |
| "Otel Sahili = iskelenin olduğu yer" | Ayrı alan çizilmedi, açıklaması iskeleye bağlandı |

Bina sayısı 28 → 30. Harita ve arazi yeniden üretildi.

## Bu sürümde ne değişti (14 Eylül 2026)

Excel'de verdiğin 13 kararın uygulamaya inen kısmı. Tamamı ve gerekçeleri
`Duzada-Wiki-Veri-v2.xlsx` → **12 Karar günlüğü** sekmesinde.

| Karar | Kodda ne oldu |
|---|---|
| Otel adı ö ile | `Kemskøy` → `Kemsköy`, 9 dosyada 39 yer |
| Otel bir mekân | `kemskoy_hotel` türü `yer` → `mekân` |
| Restoran ve bar jenerik, lobinin arkasında | Üç birim (`mekan_ana_restoran`, `mekan_restoran_bar`, `mekan_jazz_bar`) ikiye indi: `mekan_restoran`, `mekan_bar`. Aday adlar `metadata.adAdaylari` içinde duruyor. Kişi–birim eşleşmesi yeni kimliklere taşındı |
| Uyruk ülke adıyla | `Uyruk: T.C.` → `Uyruk: Türkiye`, diğer 10 uyruk da ülke adına çevrildi |
| Mükerrer karakter | Aysu Ateş ile Deniz Aydın aynı restoranda sommelierdi; ilk isim kaldı, Deniz Aydın çıkarıldı (76 → 75 karakter) |
| Beş mahalle | Varsayılan mahalle listesi 6'dan 5'e indi; Fener mahalle olmaktan çıkıp Liman içinde mevki oldu, İskele ile Eski Liman birleşti. **Kimlikler değişmedi** (`eski_liman`, `stad`) — kayıtlı maddelerin `metadata.region` bağı kopmasın diye |
| Güney Burnu · Güney Sırt Yolu · Liman İdare Binası | `gen/duzada.py` içinde adlandırıldı, harita yeniden üretildi |
| Caddeler yapı değil | "Kemsköy Caddesi 7" aslında caddenin üstündeki sıra yapıydı; artık **"Kemsköy Caddesi No. 7"** — cadde zaten yollar katmanında ayrı duruyor |

Ayrıca bir hata düzeltildi: `gen/dem.py`, `duzada.py`'yi kendi içinde
çalıştırırken `__file__` tanımsız kaldığı için sınır düzenleme dosyasını okuyan
blokta patlıyordu. Artık çalışıyor.

> Uygulamada kayıtlı bir "harita ayarları" maddesi varsa mahalle listesi oradan
> geliyor; yukarıdaki varsayılan devreye girmez. O durumda Fener'i uygulamadan
> elle silmen gerekir.

## Yükleme (token yok, komut satırı yok)

1. GitHub'da `hkemal94/Kems-Company` reposunu aç
2. **Add file → Upload files**
3. Zip'i bilgisayarında aç, içindeki **her şeyi** (klasörler dâhil) pencereye sürükle:

   | Ne | Niye |
   |---|---|
   | `src/` | Uygulama — harita bileşenleri, üretilmiş ada verisi, düzenleyici |
   | `package.json` | `maplibre-gl` bağımlılığı — bu olmadan harita açılmaz |
   | `vite.config.ts` | MapLibre worker ayarı |
   | `gen/` | Ada üretici Python betikleri (çalıştırman gerekmiyor, arşiv) |
   | `KURULUM.md` | Bu dosya |

4. Alttaki kutuya bir mesaj yaz, **Commit changes**
5. AI Studio'da uygulamayı aç → **Settings → GitHub → pull**
6. Bağımlılık yeni: AI Studio kurulumu kendi yapmazsa bir kez `npm install`

Mevcut `DuzadaWiki.tsx` dosyasına dokunulmadı. Yeni wiki onun yanında ayrı bir katman olarak duruyor; beğenmezsen eskisi yerinde.

## Bağlama

Wiki sekmesinde eski bileşenin yerine:

```tsx
import { WikiShell } from './components/wiki/WikiShell';

<WikiShell
  items={items}
  onEdit={(id) => { /* mevcut düzenleme akışın */ }}
/>
```

Ziyaretçiye açık bir sayfada `readOnly` ver — yönetim yüzü hiç görünmez:

```tsx
<WikiShell items={items} readOnly />
```

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `wiki/WikiShell.tsx` | Ada sayfası, arama, dizinler, okuma/yönetim geçişi |
| `wiki/WikiArticle.tsx` | Madde sayfası: künye, gövde, geri bağlantılar |
| `wiki/WikiPeople.tsx` | Mekâna bağlı kişiler — gruplu, katlanabilir |
| `wiki/WikiRooms.tsx` | Odalar — kalıcı özellikleriyle, katlanabilir |
| `wiki/autoLink.tsx` | Metinde geçen madde adlarını bağlantıya çevirir |
| `wiki/kunyeParser.ts` | `notes` içindeki künye bloğunu alanlara ayırır |
| `wiki/wikiSchema.ts` | Künye alanları, taslak ölçüsü, mahalle adları |
| `data/kemskoyVenues.ts` | Otel birimleri + karakter–birim eşleşmesi |
| `index.css` | Marka paleti `@theme` tokenleri |

## Kararların koda yansıyan hâli

- **Geniş zaman.** Odalarda doluluk, misafir, temiz/kirli yok. Tarihli olgular aralık: `metadata.faaliyet = '1954–'` yazarsan künyede "Faaliyette: 1954–" olarak çıkar.
- **Oyun verisi wiki'de değil.** Senaryo tipleri zaten dışarıda; kanonik listede olmayan 18 resepsiyon vakası `OYUN_VAKA_IDLERI` ile eleniyor.
- **Sırlar yönetim yüzünde.** `secrets` ve `clues` alanları ziyaretçiye kapalı.
- **Mahalle, bölge değil.** Ham `eski_liman` anahtarı künyede "İskele Mahallesi" olarak görünür.
- **Jenerik birim adları.** Altı birim `adiGecici: true` taşıyor ve sayfada "adı henüz konmadı" rozetiyle duruyor. Asıl adı koyduğunda bu alanı sil.
- **Bağlantı disiplini.** Bir maddeye sayfada bir kez bağlanılır. "liman", "ada", "otel" gibi genel kelimeler kendiliğinden bağlanmaz; `[[Liman Mahallesi]]` yazarsan bağlanır.

## Sırada bekleyen veri işleri

Bunlar kodla değil, metinle çözülür:

1. **Otelin tipi `yer` görünüyor**, `mekân` olmalı. Sayfada "MAHALLE" rozeti bu yüzden çıkıyor.
2. **Oyun dilindeki metinler.** Otel maddesinde hâlâ *"Ekim 2003 (Sezon Sonu) döneminde geçen olayların merkezidir"* ve *"203 numaralı oda klima arızası sebebiyle bakım altındadır"* duruyor. Geniş zamana çevrilmeli.
3. **"Peron restoran"** kanonik listede yok — kalacak mı, silinecek mi?
4. **Fener Bölgesi** kaydı silinip fener Liman Mahallesi'ne bağlanmalı.
5. **Kuvayi Milliye Caddesi** ve **Çarşı Sokak** silinecek.
6. **Kaynak alanı.** Her kayda `metadata.kaynak` (`kanon` / `öneri` / `model`) eklenip briefte karşılığı olmayanlar tek listede toplanacak. `kemskoyVenues.ts` bu alanı zaten taşıyor.
7. **Künye taşıması.** `kunyeParser.buildKunyeMigration` bir kez çalıştırılırsa künye `notes`'tan `metadata.profile`'a geçer ve düzenleme formların da alanları görür. Wiki bu taşıma olmadan da doğru çalışıyor.

## Coğrafya: otelin yeri

Otel koyun içinde değil, **Güne Burnu**'nun üstünde: İskele Koyu'nun güney
kolunu oluşturan çıkıntı, adanın güneybatı köşesi.

| | |
|---|---|
| Rakım | 92 m |
| Cephe | koya döner (98°) |
| Cephede uçurum | 236 m ileride, oradan deniz |
| Koy suyuna | 761 m |
| Arkasında | 800 m kara, Güne sırtının omurgası (148 m) |

Haritada yalnızca **ana bina + iki kule + teras + bahçe + inen merdiven +
iskele** var. Restoran, bar, meyhane ve kafe ayrı yapı değil — otelin kendi
içindeki mekânlar, wiki'de otelin altında duruyorlar.

Bina Haydarpaşa yerleşimini izliyor: denize bakan yüz kapalı ve görkemli
cephe, iki kule o cephenin köşelerinde, U'nun ağzı ve avlu karaya bakıyor.
20 oda; spa ve havuz yok.

**Not:** Prizmalar kâğıdın üstünde duruyor, arazi kotundan yükselmiyor —
haritada gerçek 3B arazi olmadığı için yükseltilseler havada asılı
kalıyorlardı. Rakım veride duruyor ve bir binaya tıklayınca künyede
"92 m rakım" olarak çıkıyor; kabartma da hipsometrik bantlarla okunuyor.

## Arazi: 3B

Harita artık gerçek bir yükselti modeli üstünde çiziliyor. Dışarıdan hiçbir
karo servisi yok — adanın tamamı tek bir PNG'ye kodlanmış (`duzadaDem.ts`,
~79 KB) ve `duzadaArazi.ts` içindeki özel protokol MapLibre karo istedikçe
o görüntüden kesip veriyor.

| | |
|---|---|
| Izgara | 1156 × 854, ~20 m hücre |
| Kodlama | Terrarium, 1 m çözünürlük |
| Abartı | **1.6×** |

**Abartı neden var:** ada 18 km genişliğinde, en yüksek nokta 742 m. Gerçek
ölçekte yatay/düşey oranı 1:24 — kuşbakışında ada dümdüz görünür.
Haritacılıkta kabartma bu yüzden abartılır. 1.6 katsayısı kabartmayı okunur
kılıyor, adayı hâlâ inandırıcı bırakıyor. Değiştirmek istersen:
`duzadaArazi.ts` → `ARAZI_ABARTI`.

İki şey üretim sırasında ayrıca düzeltildi:

- **Kıyı testere dişi gibiydi.** Sırt katkıları yüzünden arazi bazı yerlerde
  kıyıya 40-60 m kotla varıyor, deniz 0'da olduğu için orada dik bir duvar
  çıkıyordu. Son 140 metrede kot sıfıra indiriliyor.
- **Otel yamaçta eğri duruyordu.** Yerleşke %13 eğimli bir yamaçta; bina,
  teras ve bahçe araziye giydirilince yamulmuş görünüyordu. Gerçekte de
  böyle bir otel kaz-doldur ile düzlenmiş bir sekiye oturur — arazi
  modelinde o seki açılıyor (146 × 108 m, 92 m kotunda).

## İdari sınırlar — yoldan bağımsız

Sınırlar ve yollar iki ayrı katman. Bir ara sınırları yolların üstüne
oturtmuştuk; sınır olarak okunuşu iyiydi ama o halkayı **yol** saymak
gerçekçi değildi — kimse adanın ortasına pergelle yol yapmaz. Geometri
aynı kaldı, rolü değişti: bunlar artık yalnızca idari çizgi.

- **Çember Sınırı** — 235 m eşyükseltisi. İçinde kalan yayla Merkez
  Mahallesi (48 km²). Yükselti sınırı gerçek bir idari ölçüttür; orman ve
  yayla sınırları böyle çizilir.
- **Dört radyal** — çemberden kıyıya inen sınırlar (20°, 104°, 169°, 265°).
  Aralarındaki dört dilim öbür dört mahalle.

| Mahalle | Alan |
|---|---|
| Merkez | 48.2 km² |
| Liman | 43.4 km² |
| İskele | 30.5 km² |
| Çiftlik | 20.2 km² |
| Stadyum | 19.8 km² |

Haritada kesik-noktalı çizgiyle, ayrıca çok soluk bir renk yıkamasıyla
ayrışıyorlar (`haritaStili.ts` → `MAHALLE_TONU`). Üretici her yapının
iddia ettiği mahallenin içinde olup olmadığını denetliyor.

## Yol ağı

**Hiçbir yol havada bitmiyor.** Sahil Yolu kıyıdan 460 m içeride dolanan
48 km'lik kapalı bir halka; Sırt Yolları onu içeriden Dağ Kavşağı'na
bağlıyor; yerleşim bağlantıları da Sahil Yolu'na oturuyor. Üretici bunu
bir çizge denetimiyle doğruluyor: yollar tek bileşende değilse durup
hangilerinin koptuğunu söylüyor.

Sırt Yolları adını hak ediyor: hizaları, adanın su bölümü düğümünden
kıyıya inen **en yüksek ortalamalı** güzergâh olarak hesaplanıyor, yani
gerçekten sırtı izliyorlar. Ama sınır değiller.

### Eğim

Yollar düz çizgiyle bağlanmıyor; **eğimi gözeten bir güzergâh araması**
var (metre başına maliyet eğimle artıyor). Fark büyük: Merkez Bağlantısı
düz çizgiyle %20 eğimle Düzada Tepesi'nin üstünden geçiyordu, şimdi yamacı
dolanıp %5.8'e iniyor.

Dağ Kavşağı da bu yüzden var: su bölümü düğümü 687 metrede, oraya çıkan
her yol %20'nin üstünde eğim istiyordu. Kavşak kuzey yamacında, 220 m
kotta — yolun taşıyabileceği bir yerde.

| Yol | Ortalama eğim | Uzunluk |
|---|---|---|
| Sahil Yolu | %1.5 | 48.4 km |
| Güne Sırt Yolu | %2.0 | 9.2 km |
| Çetmi Sırtı Yolu | %4.2 | 7.7 km |
| Kuzey Sırtı Yolu | %6.1 | 6.0 km |
| Merkez Bağlantısı | %5.8 | 7.9 km |
| Merkez Dağ Yolu | %11.8 | 1.0 km |
| Sahil Merdiveni | %41 | 0.2 km (yaya) |

Merdiven hariç %13'ü aşan bir yol olursa üretici uyarı basıyor.

Yol kademeleri kalınlıkla ayrışıyor: **ana yol** (Sahil Yolu) → **cadde**
(yerleşim omurgası) → **yol** (sırt yolları, bağlantılar) → **sokak**
(numaralı ara sokak) → **merdiven** (yaya).

## Otel: uçurumun kenarı

Otel Güne Burnu'nun koya bakan uçurumunun **başında**, alından 20 metre
geride.

| | |
|---|---|
| Sahanlık kotu | 59 m |
| Uçurum alnı | terasın 20 m önünde |
| Koy suyu | 403 m ileride |
| Merdiven | 150 m yolla 59 m iniş (%39) |
| İskele | kıyıya dik, T başı 36 m |

Önceki sürümde yerleşke kıyıdan 236 metre içerideydi ve haritada denizle
ilgisi olmayan bir yapı gibi duruyordu.

Uçurum arazi modeline ayrıca eklendi (`UCURUMLAR`): taban profili her yerde
kıyıdan sıfırdan başlıyor, yani kumsal gibi yumuşak yükseliyor. Otelin
durduğu yerde ise kara kıyıya yüksek kotla varıp denize dikey iniyor.

Teras ve bahçe artık prizma değil, **araziye giydirilen dolgu**: uçurum
başındaki teras düz tabanlı bir plaka olarak çizilince yamacın üstünde
havada bir çıkma gibi sarkıyordu.

## Harita sitede nerede

Komuta Merkezi → **Düzada & Lore → Düzada Haritası** sekmesi. Eski parşömen
pin haritası silinmedi: sağ üstteki **📍 Pin Haritası** düğmesiyle ona
geçiliyor, **🗺️ Arazi Haritası** ile geri dönülüyor. Sekme açıldığında
varsayılan arazi haritası.

Yan sütun (mahalle ağacı, pin kartları, bölge özetleri) olduğu gibi duruyor.

Haritada bir yapıya ya da mahalleye tıklayınca çıkan **“Viki maddesini aç”**
düğmesi Düzada Wiki'ye geçip o maddeyi seçiyor (Varlık Arşivi K1 ile kaldırıldı). Bina kimlikleri madde
kimlikleriyle birebir aynı (`kemskoy_hotel`); mahalleler haritada `yer_merkez`,
arşivde `region_merkez` diye geçtiği için bölge anahtarı üzerinden eşleşiyor.
Karşılığı olmayan bir mahalleye tıklanırsa sekme değişmiyor, kart açık kalıyor.

MapLibre paketi (~1,3 MB) sekmeye girilene kadar indirilmiyor — bileşen
`React.lazy` ile ayrı bir parçaya bölündü.

## Haritayı kendin düzenle

Çizgileri anlatmak yerine elinle oynatman için bir düzenleyici var —
**iki sekme: Sınırlar ve Yollar.**

**Düzada → Düzada Haritası → “Haritayı düzenle”.** Düzenleyici aynı panelde
açılır; işin bitince sağ üstteki **“Bitti”** ile haritaya dönersin.
(Eskiden ayrı bir `/harita-duzenle.html` sayfası vardı — H2 ile kaldırıldı.)

**Kaydet düğmesiyle kaydedilir** (Ctrl+S), yanında **Geri al** var.
Otomatik kayıt yok. Panelin üstünde durum yazar (“Kaydedilmemiş değişiklik
var”, “Kaydediliyor…”, “Kaydedildi”). Kaydedilmemiş değişiklikle “Bitti”ye
basınca sorar: kaydet ve çık / kaydetmeden çık / vazgeç. Kaydetmeden sekme
değiştirir ya da sayfayı yenilersen iş taslak olarak tarayıcıda kalır;
düzenleyiciyi tekrar açınca “Geri yükle / At” diye sorar.

Kayıt önce bu tarayıcıya, sonra Firestore'a yazılır. Buluta ulaşılamazsa
kırmızı “Buluta yazılamadı — bu tarayıcıda saklandı” yazar; kayıt
kaybolmaz, bir sonraki açılışta yeniden gönderilir.

| Ne yapıyorsun | Nasıl |
|---|---|
| Çizgiyi oynat | Köşeyi sürükle |
| Yeni köşe | Hatta çift tıkla |
| Köşeyi sil | Köşeyi seç, Delete |
| Geri al | Ctrl+Z |
| Mıknatısı aç/kapa | M |

### Mıknatıs

Köşeyi bir **yola**, **eşyükseltiye** ya da **kıyıya** 13 pikselden fazla
yaklaştırınca kendiliğinden yapışıyor; ekranın altında neye yapıştığı
yazıyor ("yapıştı: yol · Otel Yolu"). Üç hedefi tek tek kapatabilirsin —
mesela yalnız eşyükseltiye yapışsın istiyorsan.

Böylece "bu sınır şu yolu izlesin" ya da "şu kotta gitsin" demek gözle
tutturmaya kalmıyor.

### Sınırlar sekmesi

Mahalleler sürüklerken **anında** yeniden boyanıyor ve panelde alan
yüzdeleri değişiyor — neyi neye kattığın görünsün diye.

**Uç köşeler bej ve yapışık:** radyalin bir ucu Çember Sınırı'nın, öbür ucu
kıyının üstünde kalmak zorunda. Üstlerinde kayarlar ama kopmazlar;
koparlarsa mahalleler kapanmaz.

### Yollar sekmesi

Listeden bir yol seç, köşelerini sürükle. Seçili yolun **uzunluğu, kot
aralığı ve ortalama eğimi** üstteki kutuda anlık ölçülüyor; %13'ü aşarsan
ya da yol denize taşarsa kutu kırmızıya döner ve hat kırmızı çizilir.
Eğim ölçümü gerçek arazi modelinden okunuyor (`duzadaKot.ts`, DEM
görüntüsünü tarayıcıda çözüyor).

35 sokak listede yok — hepsi kısa ve listeyi boğuyorlardı.

### Harita düzeni kaydı (H1)

Elle yaptığın düzeltmeler `duzadaGeo.ts`'e yazılmaz. Firestore'da tek bir
belgede durur: `duzada/haritaDuzeni`. Yol sabit — kullanıcıya değil
dünyaya ait, hangi cihazdan ya da tarayıcıdan girersen gir aynı düzeni
görürsün. Harita açılırken üretilmiş veri
yüklenir, düzen onun üstüne bindirilir. Yalnız **değiştirdiğin** hatlar
kaydedilir — dokunmadığın bir yol üreteç ne derse onu izler, dokunduğun
yol üreteç yeniden çalışsa da senin hâlinde kalır. Bir sınırı oynatınca
yalnız o sınıra komşu mahalleler yeniden hesaplanır. Düzenleyicideki
arka plan yolları ve mıknatıs da yolların kayıtlı hâlini kullanır.

**Yedek indir / Yedek yükle** yalnızca istersen: düzeni JSON olarak
bilgisayarına alır ya da geri yükler. Kayıt için gerekmez.

Düzenlenmiş yollarda denetimler (karada mı, eğim, ağ bütünlüğü) çalışmaya
devam ediyor ama **hata değil uyarı** veriyorlar: senin dosyan yüzünden
üretecin durması yerine neyin bozulduğunu söylemesi daha iyi.

**Tutamak sayısı.** Üreteç çizgileri yüzlerce noktayla yazıyor (çember 180,
her radyal 41): çizim için doğru, elle düzenlemek için felaket — 439 tutamak
arasında hiçbir şey seçilemiyordu. Düzenleyici seyrek bir kontrol çokgeni
üstünde çalışıyor (çember 30, radyal 10, yollar 5–28) ve eğri Catmull-Rom
ile geri kazanılıyor. Aynı eğri hesabı üreteçte de var (`catmull_rom`),
yani ekranda gördüğün çizgi ile haritaya inen çizgi aynı şey.

## Üretici

```
cd gen
python3 duzada.py     # geometri  → src/data/duzadaGeo.ts
python3 dem.py        # yükselti  → src/data/duzadaDem.ts
```

`gen/sinir-duzenleme.json` varsa `duzada.py` sınırları hesaplamak yerine
oradan okur ve çıktıda "Sınır düzenleme: … okundu" satırını basar.

Sıra önemli: `dem.py`, `duzada.py`'nin yazdığı `otel_sahanlik.json`
dosyasını okuyor.

## Adını senin koyacakların

Bunları ben uydurdum, kanon değiller:

| Ne | Şimdiki ad |
|---|---|
| Ana zirve | Düzada Tepesi (742 m) |
| Kuzey sırtı | Kuzey Sırtı (386 m) |
| Doğu sırtı | Çetmi Sırtı (254 m) |
| Kuzeybatı burnu | Fener Burnu (118 m) |
| Otelin burnu | Güne Burnu (148 m) |
| Kuleler | Batı Kulesi / Doğu Kulesi |
| Kıyı halkası | Sahil Yolu |
| Sırt yolları | Güne / Çetmi Sırtı / Kuzey Sırtı Yolu |
| İç kavşak | Dağ Kavşağı |
| İdari çember | Çember Sınırı |
| Köyün caddesi | Kemsköy Caddesi |
| Otele çıkan yol | Otel Yolu |
| Suya inen merdiven | Sahil Merdiveni |
| Ara sokaklar | "İskele 3. Sokak" gibi numaralı |

Ayrıca altı otel birimi hâlâ jenerik adla duruyor (`adiGecici: true`).
