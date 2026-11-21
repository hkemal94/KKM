"""Kompakt Düzada yol kenarı parselleri — tek harita, 3. adım (20 Kasım 2026, Kemal'in kararları).

Girdi : public/harita/duzada-zemin.bin (yol yatağı açılmış zemin), public/harita/duzada-sinirlar.geojson,
        public/harita/duzada-yollar.geojson
Çıktı : public/harita/duzada-parseller.geojson   parseller (koordinatlar [boylam, enlem])

Kurallar:
  - Cities Skylines'taki gibi yol kenarı kareli parsel: her parsel bir yola cephe verir, cephesi yola
    koşut, derinliği yola dik. Eğri yolda parsel yolun ofset hattını izler (dörtgen), düz yolda dikdörtgen.
  - Ölçü yolun kademesine uyar: ana yol kenarında büyük ve derin, ara yolda orta, sokakta ve geçitte küçük.
  - Tür: bitisik (Merkez Meydanı ve meydancıkların çevresi; aralıksız, ortak duvar), avlulu (köyler ve
    yerleşim kenarları; parseller arasında dar pay), buyuk (ana yol kenarı, meydan çevresi dışında).
  - Parsel yalnız yerleşim alanında (köy sokaklarının çevresi, yerleşimin yarıçapı içinde). Tarla,
    zeytinlik, orman, kumsal, dik yamaç, yol yatağı, kıyı şeridi, korunan alanlar (meydan, stat, seki,
    birahane yeri, The Imperial) ve meydancıklar dışarıda.
  - Ad yok. Her parselin kararlı kimliği yolun kimliği, yolun hangi yanı ve yol başından uzaklığından
    gelir: prs_<yol>_<sol|sag>_<metre>. Yol değişmedikçe aynı parsel aynı kimliği alır.
  - Kayda yazmaz; yalnız dosya üretir. 4. adımda evler bu parsellere oturur.

Ölçü değerleri Kemal onaylamadı: hepsi DENEME.

Çalıştırma: python gen/kompakt_parseller.py   (önce zemin ve yollar üretilmiş olmalı)
Denetim   : python gen/kompakt_parseller_denetim.py
"""
import json, math, os, sys, warnings

import numpy as np
from scipy import ndimage
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely import prepared

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
from kompakt_zemin_denetim import oku  # noqa: E402

warnings.filterwarnings("ignore", category=DeprecationWarning)   # shapely.ops.transform (öbür üreteçlerle aynı)

IZGARA = os.path.join(KOK, "public", "harita", "duzada-zemin.bin")
SINIR = os.path.join(KOK, "public", "harita", "duzada-sinirlar.geojson")
YOLLAR = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")
CIKTI = os.path.join(KOK, "public", "harita", "duzada-parseller.geojson")

# ------------------------------------------------------------------ ölçüler (hepsi DENEME)
# Kademeye göre parsel: cephe (yol boyunca, m), derinlik (yoldan içeri, m). Tür satırı.
OLCU = {   # DENEME
    "bitisik": {"ana": (8.0, 16.0), "ara": (7.5, 15.0), "sokak": (7.0, 14.0), "gecit": (6.0, 12.0)},
    # Kemal 21 Kasım: daha seyrek (DENEME)
    "avlulu": {"ara": (21.0, 30.0), "sokak": (18.0, 26.0), "gecit": (15.0, 20.0)},
    "buyuk": {"ana": (24.0, 32.0)},
}
CEPHE_OYNAMA = {"bitisik": 0.20, "avlulu": 0.15, "buyuk": 0.10}   # DENEME: cephe ± bu oranda değişir (sıra ev çeşitliliği)
ARA_PAY = {"bitisik": 0.0, "avlulu": 3.0, "buyuk": 2.0}           # DENEME: komşu parseller arası (m); bitişikte ortak duvar; avlulu 3 m (Kemal 21 Kasım: daha seyrek)
KALDIRIM = 1.0          # DENEME: yol kenarı ile parsel önü arası (m)
KOSE_PAY = 2.0          # DENEME: kavşakta öbür yolun kenarından en az bu kadar geri (m)
DERINLIK_EN_AZ = 0.6    # DENEME: köşede sığmazsa derinlik bu orana kadar kısalır
CEPHE_EN_AZ = 0.7       # DENEME: sığmazsa cephe bu orana kadar kısalır
ADIM = 2.0              # m; parsel sığmayınca yol boyunca bu kadar ilerlenir
ON_SEHIM = 1.0          # m; eğri yolda ön kenarın ortası kaldırımdan en çok bu kadar açılır (denetim 1,5 m)
CAKISMA_PAYI = 0.2      # m²; komşu parselle en çok bu kadar değebilir (denetim 0,5 m²; koordinat yuvarlaması için pay)
BUKUM_SINIRI = 30.0     # DENEME: cephe boyunca yol bundan çok dönerse (derece) parsel konmaz (yelpaze parsel olmasın)
EGIM_SINIRI = 0.30      # DENEME: parselin ortalama eğimi en çok %30 (yaklaşık 17 derece)
KIYI_SERIDI = 25.0      # DENEME: kıyıdan bu kadar içerisi parselsiz (m)
KUMSAL_PAY = 60.0       # DENEME: kumlu kıyıda kumsal şeridi (m; kıyı şeridine ek)
YERLESIM_KUSAGI = 55.0  # DENEME: köy sokağının bu kadar çevresi yerleşim alanı (m)
YERLESIM_CARPAN = 1.25  # DENEME: yerleşim alanı yerleşimin yarıçapının bu katını geçmez
BITISIK_MEYDAN = 110.0  # DENEME: Merkez Meydanı'nın bu kadar çevresi bitişik (m)
BITISIK_MEYDANCIK = 30.0  # DENEME: meydancığın bu kadar çevresi bitişik (m)
KORUNAN_PAY = 3.0       # DENEME: korunan alanlardan en az bu kadar uzak (m)
CEPHE_YOLLARI = ("ana", "ara", "sokak", "gecit")   # toprak (tarla yolu), patika, merdiven parsel almaz
SIRA = {"ana": 0, "ara": 1, "sokak": 2, "gecit": 3}

# ------------------------------------------------------------------ girdiler
B, HAM = oku(IZGARA)
if not B.get("yolYatagi"):
    sys.exit("Zeminde yol yatağı yok. Önce: python gen/kompakt_zemin.py, sonra python gen/kompakt_yollar.py")
H = B["hucre"]
Z = HAM.astype(float) * B["birim"]


def mt(x, y, z=None):
    return ((np.asarray(x) - B["lng0"]) * B["mPerLng"], (np.asarray(y) - B["lat0"]) * B["mPerLat"])


def ll(x, y):
    return [round(B["lng0"] + x / B["mPerLng"], 7), round(B["lat0"] + y / B["mPerLat"], 7)]


def zemin(x, y):
    return ndimage.map_coordinates(Z, [(np.asarray(y) - B["y0"]) / H, (np.asarray(x) - B["x0"]) / H], order=1)


GEO = json.load(open(SINIR, encoding="utf-8"))["features"]
YOL = json.load(open(YOLLAR, encoding="utf-8"))["features"]
ADA = transform(mt, shape(next(f["geometry"] for f in GEO if f["properties"]["katman"] == "ada")))
MAHALLE = {f["properties"]["id"]: transform(mt, shape(f["geometry"])) for f in GEO if f["properties"]["katman"] == "mahalle"}
YERLESIM = {f["properties"]["id"]: dict(f["properties"], xy=mt(*f["geometry"]["coordinates"][:2]))
            for f in GEO if f["properties"]["katman"] == "yerlesim"}
KUM = [LineString([mt(*c[:2]) for c in f["geometry"]["coordinates"]]) for f in GEO
       if f["properties"]["katman"] == "kiyi" and f["properties"]["tur"] == "kum"]
IMP = [transform(mt, shape(f["geometry"])) for f in GEO
       if f["properties"]["katman"] == "imperial" and f["geometry"]["type"] == "Polygon"]
KORUNAN = {f["properties"]["tur"]: transform(mt, shape(f["geometry"])) for f in YOL if f["properties"]["katman"] == "korunan"}
MEYDANCIK = [(f["properties"]["koy"], transform(mt, shape(f["geometry"]))) for f in YOL if f["properties"]["katman"] == "meydancik"]
KOPRU = [transform(mt, shape(f["geometry"])).buffer(f["properties"]["genislik"] / 2 + 2.0) for f in YOL
         if f["properties"]["katman"] == "kopru"]


def yol_cizgisi(f):
    c = np.asarray(f["geometry"]["coordinates"], float)
    x, y = mt(c[:, 0], c[:, 1])
    return LineString(np.column_stack([x, y]))


YOLLISTE = []
for f in YOL:
    p = f["properties"]
    if p["katman"] != "yol":
        continue
    k = "basamak" if p["kademe"] == "gecit" and p["tur"] == "basamak" else p["kademe"]
    YOLLISTE.append(dict(id=p["id"], kademe=p["kademe"], k=k, genislik=float(p["genislik"]), g=yol_cizgisi(f)))

# yol yatağı: her yolun kendi şeridi + kaldırım (parsel buna girmez)
YOL_SERIT = [y["g"].buffer(y["genislik"] / 2 + KALDIRIM - 0.05, cap_style=2 if y["k"] != "patika" else 1)
             for y in YOLLISTE]
SERIT_AGAC = STRtree(YOL_SERIT)

# ------------------------------------------------------------------ yasak alanlar
_kiyi_bant = ADA.exterior.buffer(KIYI_SERIDI)
_kumsal = unary_union([k.buffer(KIYI_SERIDI + KUMSAL_PAY) for k in KUM]) if KUM else Polygon()
_korunan = unary_union([g.buffer(KORUNAN_PAY) for g in KORUNAN.values()] + [g.buffer(KORUNAN_PAY) for g in IMP]
                       + [g.buffer(KORUNAN_PAY) for _, g in MEYDANCIK] + KOPRU)
YASAK = unary_union([_kiyi_bant, _kumsal, _korunan])
YASAK_P = prepared.prep(YASAK)
ADA_IC = prepared.prep(ADA.buffer(-KIYI_SERIDI))


# yerleşim alanı: her yerleşimin köy sokaklarının (ara, sokak, geçit) kuşağı, yarıçapının içinde
def _disk(xy, r):
    return Point(xy).buffer(r, resolution=32)


YER_ALAN = {}
for yid, y in YERLESIM.items():
    d = _disk(y["xy"], y["yaricapM"] * YERLESIM_CARPAN)
    koy_yol = [o["g"] for o in YOLLISTE if o["kademe"] in ("ara", "sokak", "gecit") and o["g"].intersects(d)]
    if not koy_yol:
        continue
    YER_ALAN[yid] = unary_union([g.buffer(YERLESIM_KUSAGI) for g in koy_yol]).intersection(d)
# iki yerleşimin alanı üst üste binerse yakın olanınki
YER_P = {k: prepared.prep(v) for k, v in YER_ALAN.items()}
YER_BIRLESIK = unary_union(list(YER_ALAN.values()))

MEYDAN = KORUNAN.get("meydan")
BITISIK_ALAN = unary_union(([MEYDAN.buffer(BITISIK_MEYDAN)] if MEYDAN is not None else [])
                           + [g.buffer(BITISIK_MEYDANCIK) for _, g in MEYDANCIK])
BITISIK_P = prepared.prep(BITISIK_ALAN)


def yerlesim_bul(p):
    adaylar = [k for k, v in YER_P.items() if v.contains(p)]
    if not adaylar:
        return None
    return min(adaylar, key=lambda k: math.dist(YERLESIM[k]["xy"], (p.x, p.y)))


def mahalle_bul(p):
    for k, v in MAHALLE.items():
        if v.contains(p):
            return k
    return min(MAHALLE, key=lambda k: MAHALLE[k].distance(p))


def egim(poly_kose):
    """Parselin içinden 3x3 örnek, düzleme uydurup ortalama eğim (oran)."""
    a, b, c, d = [np.asarray(q) for q in poly_kose]
    ornek = []
    for u in (0.15, 0.5, 0.85):
        on = a + (b - a) * u
        arka = d + (c - d) * u
        for v in (0.15, 0.5, 0.85):
            ornek.append(on + (arka - on) * v)
    ornek = np.asarray(ornek)
    z = zemin(ornek[:, 0], ornek[:, 1])
    A = np.column_stack([ornek[:, 0], ornek[:, 1], np.ones(len(ornek))])
    (gx, gy, _), *_ = np.linalg.lstsq(A, z, rcond=None)
    return float(math.hypot(gx, gy)), float(np.mean(z))


def yon(g, s, L):
    """s noktasındaki birim teğet (±4 m ortalama)."""
    a = g.interpolate(max(0.0, s - 4.0))
    b = g.interpolate(min(L, s + 4.0))
    vx, vy = b.x - a.x, b.y - a.y
    n = math.hypot(vx, vy) or 1.0
    return vx / n, vy / n


# ------------------------------------------------------------------ yerleştirme
PARSELLER = []
_konan = []                       # yerleşen poligonlar
_agac = None
_agac_n = 0
red = {"yerlesim": 0, "yasak": 0, "yol": 0, "komsu": 0, "egim": 0, "gecersiz": 0}


def komsu_cakisir(poly):
    global _agac, _agac_n
    if _agac_n != len(_konan):
        _agac = STRtree(_konan) if _konan else None
        _agac_n = len(_konan)
    hepsi = []
    if _agac is not None:
        hepsi = [_konan[i] for i in _agac.query(poly)]
    hepsi += _bekleyen
    return any(poly.intersection(q).area > CAKISMA_PAYI for q in hepsi)


_bekleyen = []   # bu yolda konan ama ağaca henüz girmemiş parseller


def dene(y, s, w, d, taraf, o, L):
    """s'den başlayıp w cepheli, d derinlikli parsel; uygun değilse None ve nedeni."""
    g = y["g"]
    if s + w > L:
        return None, "yol"
    t0 = yon(g, s, L)
    t1 = yon(g, s + w, L)
    if math.degrees(math.acos(max(-1.0, min(1.0, t0[0] * t1[0] + t0[1] * t1[1])))) > BUKUM_SINIRI:
        return None, "gecersiz"
    p0 = g.interpolate(s)
    p1 = g.interpolate(s + w)
    n0 = (-t0[1] * taraf, t0[0] * taraf)
    n1 = (-t1[1] * taraf, t1[0] * taraf)
    a = (p0.x + n0[0] * o, p0.y + n0[1] * o)
    b = (p1.x + n1[0] * o, p1.y + n1[1] * o)
    c = (p1.x + n1[0] * (o + d), p1.y + n1[1] * (o + d))
    e = (p0.x + n0[0] * (o + d), p0.y + n0[1] * (o + d))
    # eğri yolun dış yanında ön kenarın ortası yoldan açılır (kiriş sehimi); denetimin payından önce dur
    if g.distance(Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) > o + ON_SEHIM:
        return None, "gecersiz"
    poly = Polygon([a, b, c, e])
    if not poly.is_valid or poly.area < 0.6 * w * d:
        return None, "gecersiz"
    m = poly.centroid
    if not ADA_IC.contains(poly):
        return None, "yasak"
    if YASAK_P.intersects(poly):
        return None, "yasak"
    # yol yatağı: kendi yolu dahil hiçbir yol şeridine girmez; öbür yollarda köşe payı
    for i in SERIT_AGAC.query(poly):
        serit = YOL_SERIT[i]
        if YOLLISTE[i] is y:
            if poly.intersection(serit).area > 0.3:
                return None, "yol"
        elif poly.distance(serit) < KOSE_PAY:
            return None, "yol"
    if komsu_cakisir(poly):
        return None, "komsu"
    # cephe yönü ön kenarın (a-b) dikinden: parselden yola
    kx, ky = b[0] - a[0], b[1] - a[1]
    kn = math.hypot(kx, ky) or 1.0
    yola = (ky / kn * taraf, -kx / kn * taraf)
    return (poly, (a, b, c, e), m, t0, yola), None


def yerlestir(y, tur_sec):
    g = y["g"]
    L = g.length
    o = y["genislik"] / 2 + KALDIRIM
    rng = np.random.default_rng(sum(ord(ch) * (i + 1) for i, ch in enumerate(y["id"])) % (2 ** 32))
    for taraf, tad in ((1, "sol"), (-1, "sag")):
        s = KOSE_PAY
        while s < L - 4.0:
            # türü o noktanın yerine göre seç (parsel önünün ortası)
            t_ = yon(g, s, L)
            q = g.interpolate(min(L, s + 6.0))
            on = Point(q.x - t_[1] * taraf * (o + 4), q.y + t_[0] * taraf * (o + 4))
            yid = yerlesim_bul(on)
            if yid is None:
                red["yerlesim"] += 1
                s += 4 * ADIM
                continue
            tur = tur_sec(y, on)
            if tur is None:
                s += 4 * ADIM
                continue
            w0, d0 = OLCU[tur][y["kademe"]]
            w0 = w0 * (1 + rng.uniform(-CEPHE_OYNAMA[tur], CEPHE_OYNAMA[tur]))
            sonuc, neden = None, None
            for fw, fd in ((1.0, 1.0), (1.0, 0.8), (CEPHE_EN_AZ, 1.0), (1.0, DERINLIK_EN_AZ), (CEPHE_EN_AZ, DERINLIK_EN_AZ)):
                sonuc, neden = dene(y, s, w0 * fw, d0 * fd, taraf, o, L)
                if sonuc is not None:
                    w, d = w0 * fw, d0 * fd
                    break
            if sonuc is None:
                red[neden] += 1
                s += ADIM
                continue
            poly, kose, m, t0, yola = sonuc
            e_, kot = egim(kose)
            if e_ > EGIM_SINIRI:
                red["egim"] += 1
                s += ADIM
                continue
            # cephe yönü: parselden yola bakış (kuzey 0, saat yönünde derece)
            cy = (math.degrees(math.atan2(yola[0], yola[1])) + 360) % 360
            PARSELLER.append(dict(
                id=f"prs_{y['id']}_{tad}_{int(round(s))}", tur=tur, yol=y["id"], yolKademe=y["kademe"],
                taraf=tad, konumM=round(s, 1), cepheYonu=round(cy, 1), cepheM=round(w, 1), derinlikM=round(d, 1),
                alanM2=round(poly.area, 1), kotM=round(kot, 1), egim=round(100 * e_, 1),
                mahalle=mahalle_bul(m), yerlesim=yid, poly=poly))
            _bekleyen.append(poly)
            s += w + ARA_PAY[tur]


def tur_bitisik(y, p):
    return "bitisik" if BITISIK_P.contains(p) and y["kademe"] in OLCU["bitisik"] else None


def tur_genel(y, p):
    if BITISIK_P.contains(p):
        return None                       # bitişik kuşak ilk turda doldu
    if y["kademe"] == "ana":
        return "buyuk"
    return "avlulu"


print("Parseller ...")
sirali = sorted([y for y in YOLLISTE if y["kademe"] in CEPHE_YOLLARI],
                key=lambda y: (SIRA[y["kademe"]], -y["g"].length, y["id"]))
# 1. tur: meydan çevresi bitişik (meydana yakın yoldan başlayarak), 2. tur: öbürleri kademe sırasıyla
yakin = sorted([y for y in sirali if y["g"].intersects(BITISIK_ALAN)],
               key=lambda y: (y["g"].distance(MEYDAN) if MEYDAN is not None else 0, y["id"]))
for tur_sec, liste in ((tur_bitisik, yakin), (tur_genel, sirali)):
    for y in liste:
        yerlestir(y, tur_sec)
        _konan.extend(_bekleyen)
        _bekleyen.clear()

# kimlik çakışması (aynı yolun aynı yanında aynı metre) olmaz ama yine de denetlenir
assert len({p["id"] for p in PARSELLER}) == len(PARSELLER), "kimlik çakıştı"

# ------------------------------------------------------------------ yaz
ALANLAR = {
    "id": "kararlı kimlik: prs_<yol kimliği>_<sol|sag>_<yol başından metre>; yol değişmedikçe aynı kalır",
    "tur": "bitisik (meydan çevresi, ortak duvar) | avlulu (köy ve yerleşim kenarı) | buyuk (ana yol kenarı)",
    "yol": "cephe verdiği yolun kimliği (duzada-yollar.geojson)", "yolKademe": "o yolun kademesi",
    "taraf": "yolun çizim yönüne göre hangi yanı", "konumM": "parsel önünün yol başından uzaklığı (m)",
    "cepheYonu": "parselden yola bakış yönü, derece (kuzey 0, saat yönünde)",
    "cepheM": "yol boyunca cephe (m)", "derinlikM": "yoldan içeri derinlik (m)", "alanM2": "alan (m²)",
    "kotM": "ortalama rakım (m)", "egim": "ortalama eğim (%)",
    "mahalle": "mahalle kimliği", "yerlesim": "yerleşim kimliği (duzada-sinirlar.geojson)",
}
OLCULER = {"not": "Hepsi DENEME (Kemal onaylamadı)",
           "olcu": {t: {k: {"cepheM": v[0], "derinlikM": v[1]} for k, v in d_.items()} for t, d_ in OLCU.items()},
           "cepheOynama": CEPHE_OYNAMA, "araPay": ARA_PAY, "kaldirimM": KALDIRIM, "kosePayM": KOSE_PAY,
           "egimSiniri": EGIM_SINIRI, "bukumSiniri": BUKUM_SINIRI, "kiyiSeridiM": KIYI_SERIDI, "kumsalPayM": KUMSAL_PAY,
           "yerlesimKusagiM": YERLESIM_KUSAGI, "yerlesimCarpan": YERLESIM_CARPAN,
           "bitisikMeydanM": BITISIK_MEYDAN, "bitisikMeydancikM": BITISIK_MEYDANCIK}
ozellik = []
for p in sorted(PARSELLER, key=lambda p: p["id"]):
    pr = {"katman": "parsel"}
    pr.update({k: v for k, v in p.items() if k != "poly"})
    ozellik.append({"type": "Feature", "properties": pr,
                    "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in p["poly"].exterior.coords]]}})
for yid, g in YER_ALAN.items():
    for pp in getattr(g, "geoms", [g]):
        ozellik.append({"type": "Feature", "properties": {"katman": "yerlesimAlani", "yerlesim": yid},
                        "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in pp.exterior.coords]]
                                     + [[ll(*c) for c in r.coords] for r in pp.interiors]}})
with open(CIKTI, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection",
               "not": "Kompakt ada yol kenarı parselleri, taslak (Kemal onaylamadı). gen/kompakt_parseller.py üretir.",
               "alanlar": ALANLAR, "olculer": OLCULER, "features": ozellik},
              f, ensure_ascii=False, separators=(",", ":"))

from collections import Counter  # noqa: E402
print(f"  parsel: {len(PARSELLER)}")
print("  türe göre:", dict(Counter(p["tur"] for p in PARSELLER)))
print("  mahalleye göre:", dict(Counter(p["mahalle"] for p in PARSELLER)))
print("  yerleşime göre:", dict(Counter(p["yerlesim"] for p in PARSELLER)))
print("  sığmayan denemeler:", red)
print(f"Yazıldı: {os.path.relpath(CIKTI, KOK)} ({os.path.getsize(CIKTI) / 1e6:.2f} MB)")
