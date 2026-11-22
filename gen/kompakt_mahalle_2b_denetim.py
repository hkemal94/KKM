"""Mahalle 2B haritalarının denetimi — public/harita/mahalle-2b/.

Yalnız okur, hiçbir dosyaya yazmaz. Her madde "temiz" ya da "SORUN" yazar; sorun varsa çıkış kodu 1.

  - Her mahallenin (duzada-sinirlar.geojson) A ve B resmi var, açılıyor, 1,5 MB'tan küçük.
  - Resimlere yazılan her yazı (yazilar.json, üreteç yazar) verideki bir addan: adlı yol, vikide
    maddesi olan yapı, zirve (rakımı veridekiyle aynı), mahalle. Adsız yola ve yapıya yazı yok,
    uydurma ad yok. A'da yalnız başlık, lejant ve künye satırı ek yazıdır; B'de bunlar da yok.
  - "Taslak" notu yok; künye satırı "Düzada · tek harita, <tarih>".
  - Klasörde mahalleye ait olmayan resim yok.

  python gen/kompakt_mahalle_2b_denetim.py
"""
import json, os, re, sys

from PIL import Image

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERI = os.path.join(KOK, "public", "harita")
KLASOR = os.path.join(VERI, "mahalle-2b")
SINIR_MB = 1.5

LEJANT = {"Ana yol", "Ara yol", "Sokak", "Geçit", "Patika, toprak yol", "Yapı",
          "Vikide maddesi olan yapı (adı yazılı)", "Zeytinlik", "Maki", "Tarla", "Kumsal", "Çam ormanı", "Bağ",
          "Çıplak kayalık", "Eş yükselti: 20 m, kalın 100 m", "Mahalle sınırı"}
KUNYE = re.compile(r"^Düzada · tek harita, \d{1,2} (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) \d{4}$")


def oku(ad):
    return json.load(open(os.path.join(VERI, ad), encoding="utf-8"))["features"]


sinir = oku("duzada-sinirlar.geojson")
MAHALLE = {f["properties"]["id"]: f["properties"]["ad"] for f in sinir if f["properties"]["katman"] == "mahalle"}
ZIRVE = {f["properties"]["ad"]: f["properties"].get("rakim") for f in sinir if f["properties"]["katman"] == "zirve"}
YOL_ADLARI = {f["properties"]["ad"] for f in oku("duzada-yollar.geojson") if f["properties"].get("ad")}
VIKI_YAPI = {f["properties"]["ad"] for f in oku("duzada-yapilar.geojson")
             if f["properties"].get("ad") and f["properties"].get("vikiId")}

sorunlar = []


def sorun(s):
    sorunlar.append(s)
    print("SORUN:", s)


yazilar_yolu = os.path.join(KLASOR, "yazilar.json")
if not os.path.exists(yazilar_yolu):
    sorun("yazilar.json yok (üreteç çalıştırılmamış)")
    sys.exit(1)
YAZI = json.load(open(yazilar_yolu, encoding="utf-8"))

for mid, ad in sorted(MAHALLE.items()):
    kayit = YAZI.get(mid)
    if not kayit:
        sorun(f"{mid}: yazilar.json'da kayıt yok")
        continue
    for g in ("A", "B"):
        yol = os.path.join(KLASOR, f"{mid}-{g}.png")
        if not os.path.exists(yol):
            sorun(f"{mid}-{g}.png yok")
            continue
        mb = os.path.getsize(yol) / 1e6
        if mb >= SINIR_MB:
            sorun(f"{mid}-{g}.png {mb:.2f} MB (sınır {SINIR_MB} MB)")
        try:
            en, boy = Image.open(yol).size
        except Exception as e:      # bozuk dosya
            sorun(f"{mid}-{g}.png açılmıyor: {e}")
            continue
        if (en, boy) != (kayit[g]["en"], kayit[g]["boy"]):
            sorun(f"{mid}-{g}.png ölçüsü yazilar.json'dakinden farklı (yeniden üretilmeli)")
        for y in kayit[g]["yazilar"]:
            t, m = y["tur"], y["metin"]
            if "taslak" in m.lower():
                sorun(f"{mid}-{g}: 'Taslak' notu var")
            if t == "yol" and m not in YOL_ADLARI:
                sorun(f"{mid}-{g}: verideki bir yolun adı değil: {m}")
            elif t == "yapi" and m not in VIKI_YAPI:
                sorun(f"{mid}-{g}: vikide maddesi olan bir yapının adı değil: {m}")
            elif t == "zirve" and (m not in ZIRVE or ZIRVE[m] != y.get("rakim")):
                sorun(f"{mid}-{g}: zirve adı ya da rakımı veriyle uyuşmuyor: {m} {y.get('rakim')}")
            elif t == "mahalle" and m not in MAHALLE.values():
                sorun(f"{mid}-{g}: mahalle adı değil: {m}")
            elif t in ("lejant", "baslik", "kunye") and g == "B":
                sorun(f"{mid}-B: posterde ek yazı var ({t}: {m})")
            elif t == "lejant" and m not in LEJANT:
                sorun(f"{mid}-A: bilinmeyen lejant yazısı: {m}")
            elif t == "baslik" and m != ad:
                sorun(f"{mid}-A: başlık mahallenin adı değil: {m}")
            elif t == "kunye" and not KUNYE.match(m):
                sorun(f"{mid}-A: künye satırı beklenen biçimde değil: {m}")
            elif t not in ("yol", "yapi", "zirve", "mahalle", "lejant", "baslik", "kunye"):
                sorun(f"{mid}-{g}: bilinmeyen yazı türü: {t}")
        if g == "A" and not any(y["tur"] == "kunye" for y in kayit[g]["yazilar"]):
            sorun(f"{mid}-A: künye satırı yok")
    for s in kayit.get("sigmayan", []):
        print(f"[bilgi] {mid}: yazı sığmadı (resimde yok): {s}")

fazla = [f for f in os.listdir(KLASOR) if f.endswith(".png") and f.rsplit("-", 1)[0] not in MAHALLE]
for f in fazla:
    sorun(f"mahalleye ait olmayan resim: {f}")

if sorunlar:
    print(f"\n{len(sorunlar)} sorun")
    sys.exit(1)
print(f"temiz: {len(MAHALLE)} mahalle, {2 * len(MAHALLE)} resim; yazıların hepsi veriden, posterde ek yazı yok")
