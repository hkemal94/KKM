# Marka Kiti — Üretim Kartı

Ürün, tasarım ve içerik üretirken bakılacak kart. Briefin anlatı kısmı
değil, çalışma değerleri.

## Kems Company

| | |
|---|---|
| Estetik | Sessiz lüks |
| Ses tonu | Gösterişsiz · bilge · samimi ama havalı |
| Değerler | Sessiz Özgüven · Kültürel Derinlik · Özenli/Düşünülmüş · Aidiyet |

## Renkler

**Ana palet**

| Ad | Kod | Nerede |
|---|---|---|
| Kültürel Krem | `#F3EFE8` | Zemin. Markanın sessiz tuvali. |
| Kolej Laciverti | `#0E1C4F` | Çapa. Armalar, başlıklar, çerçeveler. |
| Dinamik Kiremit | `#F26B6F` | Vurgu. Çorap, astar, ufak detay. Az kullanılır. |

**Alternatif palet**

| Ad | Kod | Nerede |
|---|---|---|
| Derin Çam Yeşili | `#336659` | Nostaljik, asil. Kolej kültürünü tamamlar. |
| Şehir Grisi | `#525252` | Nötr dengeleyici. Sweatshirt, rahat parçalar. |
| Sessiz Bej | `#BBA591` | Kasket, loafer, zamansız parçalar. |

> **Dikkat:** Eski belgelerde kiremit `#D35057` olarak geçiyor. Yanlış.
> Doğru ton `#F26B6F` — Canva marka kitindeki gerçek değer.

## Tipografi

**Poppins.** 28 Eylül 2026 kararı: her yerde Poppins — belgeler de arayüz de.

Arayüzün yazı tipi jetonları Poppins'e geçti (`src/index.css`). Arayüz
renkleri de markanınki oldu (28 Eylül gece, K paketi): #1B2A4A → #0E1C4F,
#D35057 → #F26B6F.

## Logo ve işaretler

- **KC monogramı** — tipografik. Markanın zanaat kökleri ve resmiyeti.
  Temel mühür.
- **KEMS / COMPANY kilidi** — dış lacivert çerçeve, krem alan, altta kiremit
  bantta "COMPANY".
- **Kangal** — Küçükçetmi Sürek Kulübü'nün maskotu. Kendi arması var.
- Pasaport damgaları, posta pulları, hayali şehir vizeleri: keşif ve aidiyet
  katmanı.

## Estetik yönelimler

| Yönelim | Özü |
|---|---|
| Basics | Şatafatsız, dökümlü silüet. Karakteri gramajdan ve dikişten alır. |
| Varsity & Preppy | Ivy League ilhamı. Fitilli ribana, kontrast blok, nakış arma. |
| Lokal | İstanbul sokağı, Samatya masası, Yeşilçam, esnaf tabelası tipografisi. |
| High-Low Fusion | Terzi pantolon + oversize sweatshirt aynı karede. |
| Desk to Dusk | Kıyafet değiştirmeden gündüzden geceye geçen parçalar. |
| Cinematic Nostalgia | Loş ışık, vintage ton, ahşap masa, film karesi derinliği. |
| Objects & Ephemera | Kibrit kutusu, kahve fincanı, deri mühür — giymenin ötesi. |

## Marka yapısı

**Kems Company tek gerçek markadır.**

Dirlik Spor Kulübü ve Küçükçetmi Sürek Kulübü **kurgu içi kurumdur** —
evrenin içindeki kulüpler. Ayrı listede dururlar; kendi arması, rengi ve
künyesi vardır. (28 Eylül 2026 kararı.)

**Kurum drop serisi çıkarabilir, ama ana marka altında.** Küçükçetmi
altında üç dört farklı başlıkta seri açılabilir; hepsi Kems Company'nin
ürünüdür. Ayrım gerçek hayat ile evren arasında:

- **Gerçekte** satan tek marka Kems Company.
- **Evrende** ürün kurumdan geliyor olabilir.

Uygulamada drop iki bağ taşır: `brandId` (satan — her zaman Kems Company)
ve isteğe bağlı `kurumId` (adada kimden çıktığı). Zincir:
marka → (kurum) → drop → ürün. Basics 1 gibi kurumsuz seriler de geçerli.

| | Ne | Nerede |
|---|---|---|
| Kems Company | Gerçek marka | Çatı |
| Dirlik Spor Kulübü | Kurgu içi kurum | Stadyum Mahallesi |
| Küçükçetmi Sürek Kulübü | Kurgu içi kurum | Çiftlik Mahallesi |

Evrendeki diğer işletmeler **mekân**. Mekânın ürünü olabilir, kimliği olmaz.

## Ürün zinciri

```
Marka  →  Drop  →  Ürün
```

Üç halka. **Tema katmanı kaldırıldı** — eski belgelerde geçiyorsa yok sayın.

- **Marka:** Kems Company.
- **Drop:** dönemsel veya sınırlı ürün paketi. Edisyonu var.
- **Ürün:** dropun içindeki somut parça. Renk varyantı, beden, kategori taşır.

**Ürünün hayat çizgisi:** Konsept → Tasarım → Üretim → Satışta.
(Numune adımı yok — 28 Eylül 2026 kararı.)

## Etiket dili — Basics 1

```
Kems Company's
Apparel + Objects
Made with Culture
Est. 2025
Düzada, TR
```

- Bedenler: S · M · L · XL · ONE
- Edisyon: I. Edisyon, 2026

**Menşe satırı Düzada, TR'dir** (28 Eylül 2026 kararı). Canva'daki lookbook
üç sayfada hâlâ "Küçükçetmi, TR" ve "Kemsköy, TR" yazıyor; düzeltilecek.

## Tasarım dosyaları

**Canva asıl, Galeri kopya.** Çalışma Canva'da sürer; biten tasarım
uygulamanın Galeri ekranına yüklenip ilgili kayda bağlanır. Böylece uygulama
görseli gösterebilir ve yedeğe düşer.

## Kök kuralı

Üründeki her ayırt edici detay Düzada'da bir yere köklenmeli. Etikete ikon
koyuyorsan, o ikonun evrende bir karşılığı olmalı. Boş süsleme istenmiyor.
