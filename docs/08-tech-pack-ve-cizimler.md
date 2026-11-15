# Tech pack ve ürün çizimleri

Kems Company ürünlerinin atölyeye giden teknik dosyası (tech pack) ve
çizimlerin nerede durduğu, nasıl kullanıldığı. Code ve ajanlar bu belgeden
okur. Kurulum: Kemal'in kararı, 15 Kasım 2026 ("Proje belgesi + KKM").

## Canva dosyaları

| Ne | Canva kimliği | Not |
|---|---|---|
| Tech pack şablonu (taslak) | `DAHa755XcHA` | 13 sayfa, boş. Dokunulmaz; her ürün için kopyası alınır. |
| Örnek: Basics 1 · Basic Hoodie | `DAHa71mrInM` | Şablondan doldurulmuş örnek, 13 sayfa. Klasör `FAHZ_W7UZy4`. |
| Etsy tech pack (Kemal'in lisanslı kopyası) | `DAHa78a4_o4` | Yalnız çizim kaynağı. Düzeni, metni, görselleri kopyalanmaz. |
| Klasör "Ürün çizimleri" | `FAHa70YysZA` | Ücretsiz kaynaklardan işlenmiş çizimler (aşağıda). |

## Şablonun sayfaları

1 Kapak ve ürün özeti · 2 Çizimler (ön/arka) · 3 Dikiş ve yapım
ayrıntıları · 4 Referans görseller · 5 Kumaş ve aksesuarlar · 6 Renk
seçenekleri (colorways) · 7 Baskı ve nakış (artwork) · 8 Etiketler
(3 kart) · 9 Yıkama talimatı etiketi (5 simge kutusu) · 10 Ölçü noktaları
üst giyim (A–K) · 11 Ölçü noktaları alt giyim (A–I) · 12 Malzeme listesi
(BOM, 11 satır) · 13 Fiyat etiketi ve ambalaj.

Basic Hoodie örneğinde çizim konan sayfalar: 1 (lacivert), 2, 3, 10;
11'de alt giyim için referans eşofman altı. 6 ve 7'deki çizim kutuları boş.

## Yeni ürün için tech pack açma

1. Şablonu (`DAHa755XcHA`) kopyala; adı: "Kems Company · Tech pack · <Drop> <Ürün>".
2. Üst şeridi doldur: ürün, drop, yıl/sezon, stil kodu, sürüm (v0), tarih, hazırlayan.
3. Bilinmeyen her alana "[Kemal]" ya da "atölyeyle netleşecek" yazılır.
   Ölçü, oran, fiyat, adet tahminle yazılmaz.
4. Çizimi koy (aşağıdaki kaynaklardan). Logo konmaz (Kemal: hoodie'de logo yok).
5. Her değişiklikte sürüm bir artar; revizyon tablosuna satır eklenir.
6. KKM'de Merch panosundaki ürün kartında görünsün diye `src/data/teknikFoyler.ts`'e bir satır eklenir.

## Çizim kaynakları

**Etsy (Kemal satın aldı, yalnız hoodie paketi):** hoodie ön+arka
`MAHTqAkZdoU` (gri dolgulu; Canva'da lacivert `#0E1C4F`'ye boyanabiliyor),
eşofman altı ön `MAGVB6sumAE`, arka `MAGVBzx8mBg`. Eşofman altı
çizimlerinde satıcının kırmızı ölçü harfleri (A–P) var; bizim A–I
tablosuyla aynı değil. Lisans: yalnız kendi tech pack'lerimizde ve
atölyeye gönderirken kullanılır; ayrıca paylaşılmaz, satılmaz.

Teknik not: bir Canva tasarımındaki görsel başka tasarıma doğrudan
konamıyor ("media bundle not found"). Önce kaynak sayfa birleştirilir
(merge), görsel konur, geçici sayfalar silinir. Birleştirme ve silme her
seferinde Kemal'in onayıyla yapılır.

**VecFashion (ücretsiz, standart lisans: ticari tasarımda kullanım ve
değişiklik serbest, atıf gerekmez):** "Ürün çizimleri" klasöründe 9 görsel —
MCJ014 Saha ceketi, MSH005 Yarım fermuarlı dik yaka sweatshirt, MST101
Uzun kollu tişört, MST106 Basic Tee, MST111 Oversize tişört, MSW008 Spor
tişört forma, MTS013 Sweatshirt ve eşofman altı, MTS027 Rüzgârlık takımı,
MTV057 Atlet. Çizgiler `#2B2B2B`, dolgu `#E8E8E8`. MSW007 Varsity ceket
çöpe taşındı (üzerinde başka harf/sayı var; Kemal: "benim modelim değil").

**Ajansın vektör çizimleri:** Kems'in kodla çizdiği boş hoodie (ön, arka;
gri dolgu, koyu çizgi), ajansın gizli deposunda `gece-turu-gorseller`
dalında. Telif ajansın; Kemal'in stil onayını bekliyor.

**Eksik:** şapka/kasket, bere, çorap, bez çanta — ücretsiz kaynak aranıyor.

## Kurallar

- Para harcanmaz (Kemal: "başka para harcayamam"); Pro öğe alınmaz.
- Satıcı düzeni ve metni kopyalanmaz; yalnız lisanslı çizim kullanılır.
- Başka marka harfi, numarası, logosu taşıyan çizim kullanılmaz.
- Şablon değişmez; çalışma hep kopyada.
- Kaydetme, silme, birleştirme Kemal'in onayıyla.

## KKM'de nerede görünür

- Galeri → Canva aynası (`src/data/canvaAynasi.ts`): şablon ve örnek.
- Merch → Pano: Basic Hoodie kartında tech pack bağlantısı (`DAHa71mrInM`; veri `src/data/teknikFoyler.ts`).
- Bu belge: `docs/08-tech-pack-ve-cizimler.md` (proje kopyası: claude/08-tech-pack-ve-cizimler.md).
