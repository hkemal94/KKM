"""Kompakt Düzada ağaçları — arazi türüne göre kendiliğinden dağılan ağaç ve çalılar.

Tek harita, ağaç adımı (22 Kasım 2026, Kemal: "ağaçlar arazi türüne göre otomatik gelsin").
Taslak (Kemal onaylamadı); bütün ölçüler DENEME.

Künyeye sadık (docs/03-duzada-kunyesi.md): "zeytin ağaçlarıyla çevrili ada"; doğa: zeytinlik,
maki, Ada Tepesi yamaçlarında çam ormanı, çıplak kayalık; Çiftlik: zeytinlik (asırlık ve yeni
karışık), bağcılık 2000 sonrası; Merkez meydanında yaşlı bir çınar; İskele'de eski Rum
mezarlığı. Yer adı konmaz; arazi türleri yalnız tür adıdır.

Arazi türleri (10 m'lik zemin ızgarasında, her hücreye bir tür):
  deniz, kumsal, kayalik (çıplak), cam (Ada Tepesi çam ormanı), maki (kıyı ve dik yamaç),
  zeytinlik, bag, tarla (ağaçsız açık arazi), yerlesim (köy alanı: yalnız avlu ve meydan ağacı).

Kurallar:
  - Yol şeridi, köprü, yapı, arsa (parsel), kumsal, deniz, korunan alan ve otelin sahanlığı
    üstüne ağaç konmaz. Avlu ağacı yalnız evi olan arsanın içinde, evden uzakta.
  - Kot ve eğime göre tür: Ada Tepesi kütlesinde yüksek → çam, en tepe ve çok dik → çıplak
    kayalık; kıyıya yakın ve dik alçak yamaç → maki; alçak ve düz → zeytinlik (Çiftlik'te
    zeytinlik, bağ, tarla bölmeleri; oran eski haritadan: gen/duzada.py Çiftlik arazileri).
  - Doğal yoğunluk ve öbek: tohumlu gürültü (her çalıştırmada aynı sonuç).
  - Bağ sıra hâlinde: ağaç yok (bağ modeli yok), zeminde sıra çizgisi (dosyada çizgi listesi).
  - Yalnız KKM'nin bitki modelleri (public/modeller/bitkiler/).

Çıktı: public/harita/duzada-agaclar.bin (gzip). Açılınca:
  4 bayt  "DZA1"
  4 bayt  başlık uzunluğu (uint32, küçük uçlu)
  başlık  UTF-8 JSON (türler, gruplar, arazi türleri, karolar, ölçüler, bölüm uzunlukları)
  arazi   en*boy uint8 (zemin ızgarasıyla aynı hücreler, satırlar güneyden kuzeye)
  ağaçlar karolara göre sıralı; her alan ayrı düzlem (gzip daha iyi sıkıştırır):
          x (uint16, 0,5 m; üst ve alt bayt ayrı), y (aynı), tür uint8, ölçek uint8 (*0,05), grup uint8.
          Yön dosyada yok: konumdan kararlı hesaplanır (başlıktaki "duzen").
  sıralar bağ sıra çizgileri: x1, y1, x2, y2 (uint16, 0,5 m; düzlem düzlem)

Çalıştırma: python gen/kompakt_agaclar.py   (shapely, numpy, scipy)
Denetim   : python gen/kompakt_agaclar_denetim.py
"""
import gzip, hashlib, json, math, os, struct, sys

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
HARITA = os.path.join(KOK, "public", "harita")
CIKTI = os.environ.get("AGAC_CIKTI") or os.path.join(HARITA, "duzada-agaclar.bin")   # denetim geçici dosyaya yazdırır

# ------------------------------------------------------------------ ölçüler (hepsi DENEME)
OLCU = {
    "not": "Hepsi DENEME (Kemal onaylamadı)",
    "tohum": "duzada-agaclar-1",
    "denizKotuM": 0.8,          # bunun altı ağaçsız (kıyı çizgisi payı)
    "yolPayiM": 1.5,            # yol şeridinin yarı genişliğine eklenen boşluk
    "yapiPayiM": 2.0,           # yapı tabanından uzaklık (alan ağaçları)
    "avluEvPayiM": 2.5,         # avlu ağacının evden uzaklığı
    "kiyiMakiM": 110.0,         # kıyıdan bu kadar içeri maki kuşağı
    "makiEgim": 0.45,           # alçak yamaçta bundan dik → maki
    "tarimEgim": 0.22,          # zeytinlik / bağ / tarla için en çok eğim
    "tarimKotM": 260.0,         # zeytinlik için en çok kot
    "camKotM": 250.0,           # Ada Tepesi kütlesinde bundan yüksek → çam ormanı (gürültüyle ±50 m)
    "camEgim": 0.30,            # ya da bundan dik ve 200 m'den yüksek → çam
    "kayalikKotM": 670.0,       # Ada Tepesi'nin en üstü çıplak kayalık
    "kayalikEgim": 0.85,        # bundan dik yamaç çıplak kayalık
    "bolmeM": 64.0,             # tarım bölmesi aralığı (≈ 3–5 dönüm)
    "bolmeDuvarPayiM": 3.0,     # bölmeler arası taş duvar payı (ağaçsız)
    "ciftlikOran": {"zeytinlik": 0.5, "bag": 0.3, "tarla": 0.2},   # gen/duzada.py Çiftlik arazileri
    "digerOran": {"zeytinlik": 0.55, "maki": 0.27, "tarla": 0.18},
    "aralik": {"cam": 13.0, "zeytinlik": 12.0, "maki": 10.0, "zakkum": 8.0},   # ağaç arası (m); genç zeytinlik 0,8 katı
    "zeytinBosluk": 0.12,       # zeytinlikte eksik ağaç oranı
    "bagSiraM": 3.0,            # bağ sıra aralığı
    "obekSigmaM": 70.0,         # öbekleşme gürültüsünün ölçüsü
    "dereZakkumKotM": 160.0,    # bu kotun altındaki derelerde zakkum
    "dereZakkumM": 7.0,         # dereye uzaklık
    "girisServiM": [30.0, 150.0],   # köy girişinde yolun iki yanında servi (köy sınırından uzaklık)
    "girisServiAralikM": 11.0,
    "mezarlikServiAralikM": 6.0,
    "avluAgac": {"enAzM2": 50.0, "ikiM2": 400.0, "ucM2": 800.0, "bosOran": 0.15},
    "koyBoslukAralikM": 24.0,  # köy alanında arsa ve yol dışındaki boşlukta seyrek ağaç
    "karoM": 500.0,             # telefonda karo karo çizim için
}

TURLER = [   # sıra dosyada tür numarasıdır
    {"id": "zeytin", "ad": "Zeytin", "model": "bitkiler/zeytin-yasli.glb", "boyM": 3.7},
    {"id": "fistik", "ad": "Fıstık çamı", "model": "bitkiler/fistik-cami.glb", "boyM": 9.1},
    {"id": "maki", "ad": "Maki çalısı", "model": "bitkiler/cali-maki.glb", "boyM": 1.2},
    {"id": "servi", "ad": "Servi", "model": "bitkiler/servi.glb", "boyM": 9.9},
    {"id": "cinar", "ad": "Çınar", "model": "bitkiler/cinar-yasli.glb", "boyM": 10.6},
    {"id": "incir", "ad": "İncir", "model": "bitkiler/incir.glb", "boyM": 3.7},
    {"id": "limon", "ad": "Limon", "model": "bitkiler/limon.glb", "boyM": 2.5},
    {"id": "zakkum", "ad": "Zakkum", "model": "bitkiler/cali-zakkum.glb", "boyM": 1.3},
]
TUR = {t["id"]: n for n, t in enumerate(TURLER)}
GRUPLAR = ["alan", "avlu", "meydan", "yol", "mezarlik", "dere"]
GRUP = {g: n for n, g in enumerate(GRUPLAR)}
ARAZI = [   # sıra dosyada arazi numarasıdır
    {"id": "deniz", "ad": "Deniz", "renk": "#5C9DBE"},
    {"id": "kumsal", "ad": "Kumsal", "renk": "#E8D9B0"},
    {"id": "kayalik", "ad": "Çıplak kayalık", "renk": "#A79F92"},
    {"id": "cam", "ad": "Çam ormanı", "renk": "#3F6B45"},
    {"id": "maki", "ad": "Maki", "renk": "#6F8A4C"},
    {"id": "zeytinlik", "ad": "Zeytinlik", "renk": "#A9B57A"},
    {"id": "bag", "ad": "Bağ", "renk": "#8E9C4E"},
    {"id": "tarla", "ad": "Tarla (ağaçsız)", "renk": "#D9C99A"},
    {"id": "yerlesim", "ad": "Köy alanı", "renk": "#E6DCCB"},
]
AR = {a["id"]: n for n, a in enumerate(ARAZI)}


BIRIM = 0.5   # konum adımı (m); dosyada x, y bu birimle

# ------------------------------------------------------------------ yardımcılar
def sans(*parca):
    """Kararlı rastgele sayı [0, 1): aynı girdi her zaman aynı sonuç"""
    h = hashlib.blake2b(("|".join(map(str, (OLCU["tohum"],) + parca))).encode(), digest_size=8).digest()
    return int.from_bytes(h, "little") / 2 ** 64


def zemin_oku():
    b = gzip.decompress(open(os.path.join(HARITA, "duzada-zemin.bin"), "rb").read())
    assert b[:4] == b"DZZ1"
    n = struct.unpack("<I", b[4:8])[0]
    bas = json.loads(b[8:8 + n])
    h = np.frombuffer(b[8 + n:], dtype="<i2").astype(np.float32).reshape(bas["boy"], bas["en"]) * bas["birim"]
    return bas, h


B, H = zemin_oku()
EN, BOY, HUC, X0, Y0 = B["en"], B["boy"], B["hucre"], B["x0"], B["y0"]
LAT0, LNG0, MLAT, MLNG = B["lat0"], B["lng0"], B["mPerLat"], B["mPerLng"]


def m(p):
    return ((p[0] - LNG0) * MLNG, (p[1] - LAT0) * MLAT)


def gm(g):
    """GeoJSON geometrisi → metre (shapely)"""
    return shapely.transform(shape(g), lambda a: np.column_stack([(a[:, 0] - LNG0) * MLNG, (a[:, 1] - LAT0) * MLAT]))


def oku(ad):
    return json.load(open(os.path.join(HARITA, ad), encoding="utf-8"))["features"]


XS = X0 + np.arange(EN) * HUC
YS = Y0 + np.arange(BOY) * HUC
GX, GY = np.meshgrid(XS, YS)


def izgaraya(g):
    """Çokgen → hücre maskesi (hücre merkezi içinde mi)"""
    if g is None or g.is_empty:
        return np.zeros((BOY, EN), bool)
    shapely.prepare(g)
    x0, y0, x1, y1 = g.bounds
    i0, i1 = max(0, int((x0 - X0) / HUC) - 1), min(EN, int((x1 - X0) / HUC) + 2)
    j0, j1 = max(0, int((y0 - Y0) / HUC) - 1), min(BOY, int((y1 - Y0) / HUC) + 2)
    out = np.zeros((BOY, EN), bool)
    if i1 > i0 and j1 > j0:
        out[j0:j1, i0:i1] = shapely.contains_xy(g, GX[j0:j1, i0:i1], GY[j0:j1, i0:i1])
    return out


def deger(a, x, y):
    """Izgaradan en yakın hücre değeri (dizi ya da tek)"""
    i = np.clip(np.rint((np.asarray(x) - X0) / HUC).astype(int), 0, EN - 1)
    j = np.clip(np.rint((np.asarray(y) - Y0) / HUC).astype(int), 0, BOY - 1)
    return a[j, i]


def kot(x, y):
    fi = np.clip((np.asarray(x) - X0) / HUC, 0, EN - 1.001)
    fj = np.clip((np.asarray(y) - Y0) / HUC, 0, BOY - 1.001)
    i, j = fi.astype(int), fj.astype(int)
    u, w = fi - i, fj - j
    return (H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - w) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * w


# ------------------------------------------------------------------ girdiler
SINIR = oku("duzada-sinirlar.geojson")
YOLLAR = oku("duzada-yollar.geojson")
YAPILAR = oku("duzada-yapilar.geojson")
PARSEL = oku("duzada-parseller.geojson")

MAHALLE = {f["properties"]["id"]: gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "mahalle"}
MAHALLE_ADI = {f["properties"]["id"]: f["properties"]["ad"] for f in SINIR if f["properties"]["katman"] == "mahalle"}
ZIRVE = {f["properties"]["id"]: m(f["geometry"]["coordinates"]) for f in SINIR if f["properties"]["katman"] == "zirve"}
DERELER = [gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "dere"]
KUM_KIYI = [gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "kiyi" and f["properties"].get("tur") == "kum"]
IMPERIAL = unary_union([gm(f["geometry"]).buffer(3) for f in SINIR if f["properties"]["katman"] == "imperial"
                        and f["geometry"]["type"] in ("Polygon", "MultiPolygon", "LineString")
                        and f["properties"].get("tur") != "alan"])

YOL_SERIT = []
for f in YOLLAR:
    p = f["properties"]
    if p["katman"] in ("yol", "kopru"):
        YOL_SERIT.append(gm(f["geometry"]).buffer(float(p.get("genislik") or 4.0) / 2 + OLCU["yolPayiM"], cap_style="flat"))
YOL_ALAN = unary_union(YOL_SERIT)
KORUNAN = {f["properties"].get("tur"): gm(f["geometry"]) for f in YOLLAR if f["properties"]["katman"] == "korunan"}
MEYDANCIK = [gm(f["geometry"]) for f in YOLLAR if f["properties"]["katman"] == "meydancik"]

YAPI_G = [gm(f["geometry"]) for f in YAPILAR]
YAPI_P = [f["properties"] for f in YAPILAR]
YAPI_ALAN = unary_union([g.buffer(OLCU["yapiPayiM"]) for g in YAPI_G])

ARSA_G = [gm(f["geometry"]) for f in PARSEL if f["properties"]["katman"] == "parsel"]
ARSA_P = [f["properties"] for f in PARSEL if f["properties"]["katman"] == "parsel"]
YERLESIM = {f["properties"]["yerlesim"]: gm(f["geometry"]) for f in PARSEL if f["properties"]["katman"] == "yerlesimAlani"}
ARSA_ALAN = unary_union(ARSA_G)

# Engel: alan ağaçlarının hiç girmeyeceği yerler
ENGEL = unary_union([YOL_ALAN, YAPI_ALAN, ARSA_ALAN, IMPERIAL, *[g.buffer(2) for g in KORUNAN.values()],
                     *[g.buffer(2) for g in MEYDANCIK]])
shapely.prepare(ENGEL)


# ------------------------------------------------------------------ arazi türü ızgarası
def kumsal_maskesi():
    """KKM'nin boyadığı kumsalla aynı: kum kıyısının 35 m yakınında, 6 m'den alçak (tekVeri.ts)"""
    hat = unary_union(KUM_KIYI).buffer(35)
    return izgaraya(hat) & (H > -1.5) & (H < 6)


def egim_izgarasi():
    gy, gx = np.gradient(H, HUC)
    return np.hypot(gx, gy)


def gurultu(ad, sigma_m):
    """Tohumlu, yumuşak gürültü [0, 1]"""
    rnd = np.random.default_rng(int.from_bytes(hashlib.blake2b((OLCU["tohum"] + ad).encode(), digest_size=4).digest(), "little"))
    g = ndimage.gaussian_filter(rnd.standard_normal((BOY, EN)), sigma_m / HUC)
    g = (g - g.mean()) / (g.std() + 1e-9)
    return 0.5 + 0.5 * np.tanh(g)


def bolmeler(maske, ad):
    """Tarım bölmeleri: titreşimli ızgaradan Voronoi; her hücrenin bölmesi ve bölme sınırına uzaklığı"""
    a = OLCU["bolmeM"]
    tohum = []
    for j in range(int(BOY * HUC / a) + 1):
        for i in range(int(EN * HUC / a) + 1):
            tohum.append((X0 + (i + 0.15 + 0.7 * sans(ad, "bx", i, j)) * a, Y0 + (j + 0.15 + 0.7 * sans(ad, "by", i, j)) * a))
    tohum = np.array(tohum)
    agac = cKDTree(tohum)
    d, k = agac.query(np.column_stack([GX[maske], GY[maske]]), k=2)
    no = np.full((BOY, EN), -1, int)
    no[maske] = k[:, 0]
    return tohum, agac, no


def arazi_hesapla():
    kara = H > OLCU["denizKotuM"]
    kum = kumsal_maskesi()
    eg = egim_izgarasi()
    kiyi_uz = ndimage.distance_transform_edt(H > 0) * HUC
    zx, zy = ZIRVE["tepe_ana"]
    zirve_uz = np.hypot(GX - zx, GY - zy)
    # Ada Tepesi kütlesi: Ada Tepesi'ne öbür zirvelerden yakın, 170 m'den yüksek bağlı bölge
    # (Kuzey Sırtı ve Çetmi Sırtı'nın yamacı maki; künyede çam ormanı yalnız Ada Tepesi'nde)
    kx, ky = ZIRVE["tepe_kuzey"]
    oteki = np.hypot(GX - kx, GY - ky)
    yuksek, n = ndimage.label((H > 170) & (zirve_uz < oteki * (0.9 + 0.4 * gurultu("kutle", 200.0))))
    kutle = yuksek == yuksek[int(round((zy - Y0) / HUC)), int(round((zx - X0) / HUC))]
    gur_cam = gurultu("cam", 120.0)
    mah = np.full((BOY, EN), "", object)
    for k, g in MAHALLE.items():
        mah[izgaraya(g)] = k
    yer = np.zeros((BOY, EN), bool)
    for g in YERLESIM.values():
        yer |= izgaraya(g)

    A = np.full((BOY, EN), AR["deniz"], np.uint8)
    gur = gurultu("arazi", 160.0)
    # 1) Varsayılan kara: zeytinlik / maki / tarla bölmeleri (Çiftlik'te bağ da)
    tohum, tagac, bno = bolmeler(kara, "bolme")
    ciftlik = mah == "yer_ciftlik"
    oran_c, oran_d = OLCU["ciftlikOran"], OLCU["digerOran"]
    tur_bolme = {}
    obek = gurultu("bolme-obek", 220.0)
    for b in np.unique(bno[kara]):
        x, y = tohum[b]
        # komşu bölmeler birbirine benzesin (öbek), ama tek tek de değişsin
        r = float(np.clip(0.45 * sans("bolme-tur", int(b)) + 0.55 * (deger(obek, x, y) - 0.5) * 1.6 + 0.27, 0, 0.999))
        c = bool(deger(ciftlik, x, y))
        if c:
            t = "zeytinlik" if r < oran_c["zeytinlik"] else "bag" if r < oran_c["zeytinlik"] + oran_c["bag"] else "tarla"
        else:
            t = "zeytinlik" if r < oran_d["zeytinlik"] else "maki" if r < oran_d["zeytinlik"] + oran_d["maki"] else "tarla"
        tur_bolme[int(b)] = t
    harita = np.full(len(tohum), AR["maki"], np.uint8)
    for b, t in tur_bolme.items():
        harita[b] = AR[t]
    A[kara] = harita[bno[kara]]
    # bağ yalnız Çiftlik'te ve düzde (eski haritada da yalnız orada)
    A[(A == AR["bag"]) & ~ciftlik] = AR["zeytinlik"]
    # 2) Eğim ve kot: tarıma dik ya da yüksekse maki
    tarim = np.isin(A, [AR["zeytinlik"], AR["bag"], AR["tarla"]])
    A[tarim & ((eg > OLCU["tarimEgim"]) | (H > OLCU["tarimKotM"]))] = AR["maki"]
    A[kara & (eg > OLCU["makiEgim"]) & (H < 140)] = AR["maki"]
    # 3) Kıyı makisi (kumsal hariç), gürültüyle girintili
    A[kara & (kiyi_uz < OLCU["kiyiMakiM"] * (0.6 + 0.8 * gur))] = AR["maki"]
    # 4) Ada Tepesi çam ormanı: kütlede yüksek ya da dik
    cam = kara & kutle & ((H > OLCU["camKotM"] + 100 * (gur_cam - 0.5)) | ((eg > OLCU["camEgim"]) & (H > 200)))
    A[cam] = AR["cam"]
    # 5) Çıplak kayalık: en tepe ve çok dik
    A[kara & ((H > OLCU["kayalikKotM"] - 40 * gur) | (eg > OLCU["kayalikEgim"]))] = AR["kayalik"]
    # 6) Köy alanı, kumsal, deniz
    A[kara & yer] = AR["yerlesim"]
    A[kum & (H > -1.5)] = AR["kumsal"]
    A[~kara & ~kum] = AR["deniz"]
    return A, eg, mah, tohum, tagac, bno, kiyi_uz


A, EGIM, MAH, BTOHUM, BAGAC, BNO, KIYI_UZ = arazi_hesapla()


# ------------------------------------------------------------------ ağaçlar
AGACLAR = []   # (x, y, tur, olcek, yon, grup)


def ekle(x, y, tur, olcek, yon, grup):
    AGACLAR.append((float(x), float(y), TUR[tur], float(olcek), float(yon), GRUP[grup]))


def serbest(xs, ys):
    """Alan ağacı için: engelin dışında, karada"""
    if len(xs) == 0:
        return np.zeros(0, bool)
    return ~shapely.contains_xy(ENGEL, xs, ys)


def bolme_acisi(b):
    """Bölmenin sıra yönü: eşyükselti boyunca (eğim yönüne dik); düzde kararlı rastgele"""
    x, y = BTOHUM[b]
    i = int(np.clip(round((x - X0) / HUC), 1, EN - 2)); j = int(np.clip(round((y - Y0) / HUC), 1, BOY - 2))
    gx = (H[j, i + 1] - H[j, i - 1]) / (2 * HUC); gy = (H[j + 1, i] - H[j - 1, i]) / (2 * HUC)
    if math.hypot(gx, gy) < 0.03:
        return sans("aci", b) * math.pi
    return math.atan2(gy, gx) + math.pi / 2


def duvar_payi(xs, ys):
    """Bölme sınırına uzaklık (iki en yakın tohumun yarı farkı)"""
    d, _ = BAGAC.query(np.column_stack([xs, ys]), k=2)
    return (d[:, 1] - d[:, 0]) / 2


def zeytinlikler():
    a = OLCU["aralik"]["zeytinlik"]
    maske = A == AR["zeytinlik"]
    sayi = np.bincount(BNO[maske])
    for b in np.nonzero(sayi >= 4)[0]:
        aci = bolme_acisi(int(b))
        u = np.array([math.cos(aci), math.sin(aci)]); n = np.array([-u[1], u[0]])
        x0, y0 = BTOHUM[b]
        r = OLCU["bolmeM"] * 1.2
        k = np.arange(-int(r / a) - 1, int(r / a) + 2)
        KI, KJ = np.meshgrid(k, k)
        genc = sans("genc", int(b)) < 0.4           # asırlık ve yeni karışık (künye)
        aa = a * (0.8 if genc else 1.0) * (1 + 0.15 * (sans("aa", int(b)) - 0.5))
        px = x0 + KI.ravel() * aa * u[0] + KJ.ravel() * aa * n[0]
        py = y0 + KI.ravel() * aa * u[1] + KJ.ravel() * aa * n[1]
        jit = (np.random.default_rng(int(b) * 7919 + 17).random((len(px), 2)) - 0.5) * aa * 0.25
        px, py = px + jit[:, 0], py + jit[:, 1]
        icinde = deger(BNO, px, py) == b
        icinde &= deger(A, px, py) == AR["zeytinlik"]
        icinde &= duvar_payi(px, py) > OLCU["bolmeDuvarPayiM"]
        px, py = px[icinde], py[icinde]
        tut = serbest(px, py)
        r3 = np.random.default_rng(int(b) * 104729 + 3).random((int(tut.sum()), 3))
        for (x, y), (rb, ro, ry) in zip(zip(px[tut], py[tut]), r3):
            if rb < OLCU["zeytinBosluk"]:
                continue
            o = (0.6 + 0.3 * ro) if genc else (0.9 + 0.45 * ro)
            ekle(x, y, "zeytin", o, ry * 360, "alan")


def bag_siralari():
    """Bağ bölmelerinde sıra çizgileri (zeminde); ağaç değil"""
    s = OLCU["bagSiraM"]
    maske = A == AR["bag"]
    cizgi = []
    JJ, II = np.nonzero(maske)
    BB = BNO[JJ, II]
    sira = np.argsort(BB, kind="stable")
    JJ, II, BB = JJ[sira], II[sira], BB[sira]
    sinir = np.flatnonzero(np.diff(BB)) + 1
    for jj, ii in zip(np.split(JJ, sinir), np.split(II, sinir)):
        if len(jj) < 4:
            continue
        b = BNO[jj[0], ii[0]]
        # bölmenin çokgeni: hücrelerin birleşimi, duvar payı içeri
        kare = unary_union([box(X0 + i * HUC - HUC / 2, Y0 + j * HUC - HUC / 2, X0 + i * HUC + HUC / 2, Y0 + j * HUC + HUC / 2)
                            for i, j in zip(ii, jj)])
        alan = kare.buffer(-OLCU["bolmeDuvarPayiM"]).difference(ENGEL).simplify(0.5)
        if alan.is_empty:
            continue
        aci = bolme_acisi(int(b))
        u = np.array([math.cos(aci), math.sin(aci)]); n = np.array([-u[1], u[0]])
        x0, y0 = BTOHUM[b]
        r = OLCU["bolmeM"] * 1.3
        for k in range(-int(r / s), int(r / s) + 1):
            c = np.array([x0, y0]) + n * k * s
            hat = LineString([c - u * r, c + u * r]).intersection(alan)
            for parca in getattr(hat, "geoms", [hat]):
                if parca.geom_type == "LineString" and parca.length > 4:
                    (ax, ay), (bx, by) = parca.coords[0], parca.coords[-1]
                    cizgi.append((ax, ay, bx, by))
    return cizgi


def dogal(tur, arazi, aralik, ad, esik_taban, esik_gur, olcek, grup="alan", ek_maske=None):
    """Titreşimli ızgara + öbek gürültüsü: doğal dağılım"""
    a = aralik
    gur = gurultu(ad, OLCU["obekSigmaM"])
    maske = A == arazi if ek_maske is None else ek_maske
    jj, ii = np.nonzero(maske)
    if len(ii) == 0:
        return
    x0, x1 = XS[ii.min()] - HUC, XS[ii.max()] + HUC
    y0, y1 = YS[jj.min()] - HUC, YS[jj.max()] + HUC
    nx, ny = int((x1 - x0) / a) + 1, int((y1 - y0) / a) + 1
    KI, KJ = np.meshgrid(np.arange(nx), np.arange(ny))
    KI, KJ = KI.ravel(), KJ.ravel()
    rnd = np.random.default_rng(int.from_bytes(hashlib.blake2b((OLCU["tohum"] + ad).encode(), digest_size=4).digest(), "little"))
    j1 = rnd.random((len(KI), 4))
    px = x0 + (KI + 0.1 + 0.8 * j1[:, 0]) * a
    py = y0 + (KJ + 0.1 + 0.8 * j1[:, 1]) * a
    tut = deger(maske, px, py)
    px, py, j1 = px[tut], py[tut], j1[tut]
    g = deger(gur, px, py)
    tut = j1[:, 2] < np.clip(esik_taban + esik_gur * (g - 0.5), 0, 1)
    px, py, j1, g = px[tut], py[tut], j1[tut], g[tut]
    tut = serbest(px, py)
    for x, y, r, gg in zip(px[tut], py[tut], j1[tut], g[tut]):
        ekle(x, y, tur, olcek[0] + (olcek[1] - olcek[0]) * (0.5 * r[3] + 0.5 * gg), r[3] * 360 * 7 % 360, grup)


def cam_ormani():
    # kenarda ve kayalığa yakın seyrek, içeride sık; yer yer maki altı çalı
    eg_ic = ndimage.distance_transform_edt(A == AR["cam"]) * HUC
    sik = (A == AR["cam"]) & (eg_ic > 30)
    seyrek = (A == AR["cam"]) & (eg_ic <= 30)
    dogal("fistik", AR["cam"], OLCU["aralik"]["cam"], "cam-ic", 0.78, 0.9, (0.75, 1.2), ek_maske=sik)
    dogal("fistik", AR["cam"], OLCU["aralik"]["cam"] * 1.3, "cam-kenar", 0.45, 0.9, (0.65, 1.05), ek_maske=seyrek)
    dogal("maki", AR["cam"], 14.0, "cam-cali", 0.3, 0.6, (0.8, 1.4))
    # kayalıkta tek tük çam
    dogal("fistik", AR["kayalik"], 30.0, "kaya-cam", 0.18, 0.4, (0.55, 0.9))


def maki():
    dogal("maki", AR["maki"], OLCU["aralik"]["maki"], "maki", 0.6, 1.4, (1.3, 2.8))   # her çalı bir öbek
    # makide seyrek tek çam (yamaçta) ve zeytin (yabani)
    dogal("fistik", AR["maki"], 45.0, "maki-cam", 0.25, 0.6, (0.6, 1.0), ek_maske=(A == AR["maki"]) & (H > 60))
    dogal("zeytin", AR["maki"], 40.0, "maki-zeytin", 0.25, 0.5, (0.7, 1.0), ek_maske=(A == AR["maki"]) & (H < 200))
    # köy alanının boşluklarında (arsa, yol, yapı dışı) seyrek zeytin ve incir
    a = OLCU["koyBoslukAralikM"]
    dogal("zeytin", AR["yerlesim"], a, "koy-zeytin", 0.35, 0.6, (0.8, 1.25))
    dogal("incir", AR["yerlesim"], a * 1.8, "koy-incir", 0.3, 0.5, (0.8, 1.1))
    # tarlanın kenarında tek tük zeytin
    dogal("zeytin", AR["tarla"], 50.0, "tarla-zeytin", 0.25, 0.5, (0.8, 1.3))


def dere_zakkumu():
    hat = unary_union(DERELER).buffer(OLCU["dereZakkumM"])
    maske = izgaraya(hat) & (H < OLCU["dereZakkumKotM"]) & (H > 1) & np.isin(A, [AR["maki"], AR["zeytinlik"], AR["tarla"]])
    dogal("zakkum", None, OLCU["aralik"]["zakkum"], "zakkum", 0.6, 0.8, (0.8, 1.3), grup="dere", ek_maske=maske)


def avlular():
    """Evi olan arsada 1–3 meyve ağacı (zeytin, incir, limon; Çiftlik'te zeytin)"""
    yapi_agaci = STRtree(YAPI_G)
    ao = OLCU["avluAgac"]
    for n, (g, p) in enumerate(zip(ARSA_G, ARSA_P)):
        evler = [YAPI_G[k] for k in yapi_agaci.query(g) if YAPI_G[k].intersection(g).area > 1]
        if not evler or sans("avlu-bos", p["id"]) < ao["bosOran"]:
            continue
        avlu = g.buffer(-1.0).difference(unary_union(evler).buffer(OLCU["avluEvPayiM"])).difference(YOL_ALAN)
        if avlu.area < ao["enAzM2"]:
            continue
        adet = 1 + (avlu.area > ao["ikiM2"]) + (avlu.area > ao["ucM2"])
        x0, y0, x1, y1 = avlu.bounds
        konan = []
        for q in range(40):
            if len(konan) >= adet:
                break
            x = x0 + (x1 - x0) * sans("ax", p["id"], q); y = y0 + (y1 - y0) * sans("ay", p["id"], q)
            if not avlu.contains(Point(x, y)) or any(math.dist((x, y), k) < 5 for k in konan):
                continue
            konan.append((x, y))
            r = sans("at", p["id"], q)
            tur = "zeytin" if p.get("mahalle") == "yer_ciftlik" else ("incir" if r < 0.4 else "limon" if r < 0.7 else "zeytin")
            ekle(x, y, tur, 0.8 + 0.3 * sans("ao", p["id"], q), sans("ay2", p["id"], q) * 360, "avlu")


def meydanlar():
    """Merkez Meydanı'nda tek yaşlı çınar (künye); her meydancıkta bir çınar"""
    yapi = unary_union(YAPI_G).buffer(6)
    yerler = []
    if "meydan" in KORUNAN:
        yerler.append(("Merkez Meydanı", KORUNAN["meydan"], 1.15))
    yerler += [(f"meydancik_{n}", g, 0.85) for n, g in enumerate(MEYDANCIK)]
    for ad, g, o in yerler:
        ic = g.buffer(-5).difference(yapi).difference(YOL_ALAN.buffer(2))
        if ic.is_empty or ic.area < 12:
            continue   # meydancığın hepsi yol: çınar konmaz (yol üstüne ağaç yok)
        q = ic.point_on_surface() if not ic.contains(g.centroid) else g.centroid
        ekle(q.x, q.y, "cinar", o, sans("cinar", ad) * 360, "meydan")


def serviler():
    """Rum Mezarlığı'nın çevresinde ve köy girişlerinde yolun iki yanında servi"""
    for g, p in zip(YAPI_G, YAPI_P):
        if p.get("tur") == "alan" and "mezar" in (p.get("id") or ""):
            halka = g.exterior.buffer(0).exterior if False else g.buffer(1.5).exterior
            s = OLCU["mezarlikServiAralikM"]
            for k in range(int(halka.length / s)):
                q = halka.interpolate(k * s)
                ekle(q.x, q.y, "servi", 0.85 + 0.2 * sans("ms", k), sans("msy", k) * 360, "mezarlik")
    a0, a1 = OLCU["girisServiM"]
    s = OLCU["girisServiAralikM"]
    for yid, alan in YERLESIM.items():
        kenar = alan.exterior
        for f in YOLLAR:
            p = f["properties"]
            if p["katman"] != "yol" or p.get("kademe") not in ("ana", "ara"):
                continue
            hat = gm(f["geometry"])
            if not hat.intersects(kenar):
                continue
            yari = float(p.get("genislik") or 6) / 2 + 2.5
            disari = hat.difference(alan)
            for parca in getattr(disari, "geoms", [disari]):
                if parca.length < a0 + 10:
                    continue
                # parçanın köy sınırına değen ucu
                bas_kenarda = Point(parca.coords[0]).distance(kenar) < Point(parca.coords[-1]).distance(kenar)
                L = parca.length
                for k in range(int((a1 - a0) / s) + 1):
                    t = a0 + k * s
                    if t > L - 2:
                        break
                    d = t if bas_kenarda else L - t
                    q = parca.interpolate(d); q2 = parca.interpolate(min(L, d + 1)); q1 = parca.interpolate(max(0, d - 1))
                    ux, uy = q2.x - q1.x, q2.y - q1.y
                    ul = math.hypot(ux, uy) or 1
                    nx, ny = -uy / ul, ux / ul
                    for yan in (-1, 1):
                        x, y = q.x + nx * yari * yan, q.y + ny * yari * yan
                        if YOL_ALAN.contains(Point(x, y)) or YAPI_ALAN.contains(Point(x, y)) or ARSA_ALAN.contains(Point(x, y)):
                            continue
                        if kot(x, y) < OLCU["denizKotuM"] or deger(A, x, y) in (AR["kumsal"], AR["deniz"]):
                            continue
                        ekle(x, y, "servi", 0.8 + 0.25 * sans("gs", yid, p["id"], k, yan), sans("gsy", yid, k, yan) * 360, "yol")


UYGUN_ARAZI = {   # alan ağacının durabileceği arazi türleri
    "zeytin": ["zeytinlik", "maki", "tarla", "yerlesim"], "incir": ["yerlesim"], "fistik": ["cam", "kayalik", "maki"], "maki": ["cam", "maki"],
    "zakkum": ["maki", "zeytinlik", "tarla"],
}


def temizle():
    """Son süzgeç (dosyadaki 0,5 m'lik konumla): deniz, kumsal, arazi uyumu, engel; aynı yere düşen ikinci ağaç atılır"""
    global AGACLAR
    a = np.array(AGACLAR)
    a[:, 0] = X0 + np.rint((a[:, 0] - X0) / BIRIM) * BIRIM
    a[:, 1] = Y0 + np.rint((a[:, 1] - Y0) / BIRIM) * BIRIM
    k = kot(a[:, 0], a[:, 1])
    ar = deger(A, a[:, 0], a[:, 1])
    tut = (k > OLCU["denizKotuM"]) & ~np.isin(ar, [AR["deniz"], AR["kumsal"]])
    alan = np.isin(a[:, 5], [GRUP["alan"], GRUP["dere"]])
    for t, liste in UYGUN_ARAZI.items():
        tut &= ~(alan & (a[:, 2] == TUR[t]) & ~np.isin(ar, [AR[x] for x in liste]))
    tut &= ~(alan & ~serbest(a[:, 0], a[:, 1]))
    a = a[tut]
    # çok yakın ikiliyi at (öncelik: meydan, mezarlık, yol, avlu, alan)
    once = np.array([{GRUP["meydan"]: 0, GRUP["mezarlik"]: 1, GRUP["yol"]: 2, GRUP["avlu"]: 3}.get(int(g), 4) for g in a[:, 5]])
    sira = np.lexsort((a[:, 1], a[:, 0], once))
    a = a[sira]
    agac = cKDTree(a[:, :2])
    at = np.zeros(len(a), bool)
    for i, j in sorted(agac.query_pairs(2.5)):
        if not at[i] and not at[j]:
            at[j] = True
    AGACLAR = [tuple(r) for r in a[~at]]


# ------------------------------------------------------------------ yazma
def nicemle(v, o):
    return np.clip(np.rint((np.asarray(v) - o) / BIRIM), 0, 65535).astype("<u2")


def duzlem(a):
    """uint16 dizisi → üst bayt düzlemi + alt bayt düzlemi (gzip böyle daha iyi sıkıştırır)"""
    return (a >> 8).astype(np.uint8).tobytes() + (a & 255).astype(np.uint8).tobytes()


def yaz(cizgiler):
    a = np.array(AGACLAR)
    # konum dosyadaki adıma yuvarlanır; denetim de yuvarlanmış konumu okur
    a[:, 0] = X0 + nicemle(a[:, 0], X0) * BIRIM
    a[:, 1] = Y0 + nicemle(a[:, 1], Y0) * BIRIM
    km = OLCU["karoM"]
    ki = ((a[:, 0] - (X0 - HUC / 2)) // km).astype(int)
    kj = ((a[:, 1] - (Y0 - HUC / 2)) // km).astype(int)
    sira = np.lexsort((a[:, 0], a[:, 1], ki, kj))
    a, ki, kj = a[sira], ki[sira], kj[sira]
    karolar = []
    bas = 0
    for n in range(1, len(a) + 1):
        if n == len(a) or ki[n] != ki[bas] or kj[n] != kj[bas]:
            karolar.append([int(ki[bas]), int(kj[bas]), bas, n - bas])
            bas = n
    x, y = nicemle(a[:, 0], X0), nicemle(a[:, 1], Y0)
    t = a[:, 2].astype(np.uint8)
    o = np.clip(np.rint(a[:, 3] / 0.05), 1, 255).astype(np.uint8)
    g = a[:, 5].astype(np.uint8)
    c = np.array(cizgiler) if cizgiler else np.zeros((0, 4))
    s1 = [nicemle(c[:, k], X0 if k % 2 == 0 else Y0) for k in range(4)] if len(c) else [np.zeros(0, "<u2")] * 4
    say = {}
    for tt, mh in zip(t, deger(MAH, a[:, 0], a[:, 1])):
        say.setdefault(TURLER[tt]["id"], {}).setdefault(mh or "kiyi", 0)
        say[TURLER[tt]["id"]][mh or "kiyi"] += 1
    alan = {ARAZI[k]["id"]: round(float((A == k).sum()) * HUC * HUC / 1e6, 2) for k in range(len(ARAZI))}
    baslik = {
        "not": "Kompakt ada ağaçları, taslak (Kemal onaylamadı). gen/kompakt_agaclar.py üretir. Ölçüler DENEME.",
        "en": EN, "boy": BOY, "hucre": HUC, "x0": X0, "y0": Y0, "birim": BIRIM,
        "turler": TURLER, "gruplar": GRUPLAR, "arazi": ARAZI, "araziKm2": alan,
        "karoM": km, "karoX0": X0 - HUC / 2, "karoY0": Y0 - HUC / 2, "karolar": karolar,
        "adet": int(len(a)), "siraAdet": int(len(c)), "sayim": say, "olcu": OLCU,
        "duzen": ("arazi: en*boy uint8 (satırlar güneyden kuzeye) · ağaçlar (adet uzunlukta düzlemler): "
                  "x üst, x alt, y üst, y alt bayt (birim m, zemin x0 / y0'dan), tür, ölçek (*0,05), grup · "
                  "bağ sıraları (siraAdet uzunlukta düzlemler): x1, y1, x2, y2 (her biri üst, alt bayt). "
                  "Yön dosyada yok: ((x * 73856093) xor (y * 19349663)), 32 bit işaretsiz, mod 360 derece (x, y dosyadaki tam sayılar)."),
    }
    bj = json.dumps(baslik, ensure_ascii=False, separators=(",", ":")).encode()
    ham = (b"DZA1" + struct.pack("<I", len(bj)) + bj + A.astype(np.uint8).tobytes()
           + duzlem(x) + duzlem(y) + t.tobytes() + o.tobytes() + g.tobytes()
           + b"".join(duzlem(v) for v in s1))
    veri = gzip.compress(ham, compresslevel=9, mtime=0)
    open(CIKTI, "wb").write(veri)
    return baslik, len(ham), len(veri)


def uret():
    zeytinlikler()
    cam_ormani()
    maki()
    dere_zakkumu()
    avlular()
    meydanlar()
    serviler()
    temizle()
    return bag_siralari()


if __name__ == "__main__":
    cizgi = uret()
    b, ham, gz = yaz(cizgi)
    print(f"Ağaç           : {b['adet']} ({', '.join(f'{k} {sum(v.values())}' for k, v in b['sayim'].items())})")
    print(f"Bağ sırası     : {b['siraAdet']} çizgi")
    print(f"Arazi (km²)    : {b['araziKm2']}")
    print(f"Dosya          : {gz / 1e6:.2f} MB (açılınca {ham / 1e6:.2f} MB), {len(b['karolar'])} karo")
