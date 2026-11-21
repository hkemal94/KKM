"""Kompakt Düzada kare ızgara ve arsalar — tek harita, 3. adımın düzeltmesi (21 Kasım 2026, Kemal).

Girdi : public/harita/duzada-zemin.bin (yol yatağı açılmış zemin), public/harita/duzada-sinirlar.geojson,
        public/harita/duzada-yollar.geojson
Çıktı : public/harita/duzada-kareler.json      kare ızgara (hafif biçim; köşeler şerit başından hesaplanır)
        public/harita/duzada-parseller.geojson  arsalar (koordinatlar [boylam, enlem]); her arsa kendi karelerini sayar

Kemal 21 Kasım: "Cities Skylines'taki gibi eşit karelerden oluşan bir ızgara."
  - Yol, en çok SADELESTIRME kadar sapan düz kesimlere ayrılır. Her kesimin iki yanında yoldan içeri
    eşit kareler dizilir (KARE x KARE m, en çok DERINLIK_KARE sıra); kareler kesimin yönüne hizalı.
  - Kareler önce ön sıradan dağıtılır (bütün yolların 1. sırası, sonra 2. sıra ...): kavşakta ve kıvrımda
    çakışan karede yoldan yakın olan kalır, öbürü atılır. Arkası atılan sütunun daha derin karesi de olmaz.
    Tabanının eğimi %30'u aşan kare çizilmez (Kemal 21 Kasım). Başka yolun şeridine KOSE_PAY'den yakın, kıyı şeridine, kumsala, korunan alana, The Imperial'a,
    yerleşim alanının dışına düşen kare yok.
  - Arsa birkaç kareden olur ve kare çizgilerine oturur: bitişik 1x2 (Merkez Meydanı ve meydancıkların
    çevresi), avlulu 3x4 (köyler; araya en az 1 boş kare; kıvrımda dar avlulu 1x4, 1x3), büyük 3-4 x 4 (ana yol kenarı).
    Sığmazsa tabloda sıradaki küçük ölçü denenir. Eğim en çok %30; arsa kendi yerleşiminin mahallesinde.
  - Ad yok. Kimlikler kararlı: arsa prs_<yol>_<sol|sag>_<metre>, kare k_<yol>_<sol|sag>_<metre>_<sıra>
    (metre: sütun önünün yol başından uzaklığı; sıra: yoldan içeri 0, 1, 2, 3).
  - Kayda yazmaz; yalnız dosya üretir. 4. adımda evler bu arsalara oturur; 7. adımda kareler tek tek boyanır.

Ölçü değerleri Kemal onaylamadı: hepsi DENEME.

Çalıştırma: python gen/kompakt_parseller.py   (önce zemin ve yollar üretilmiş olmalı)
            Yol ağı değişirse sonra python gen/kompakt_merkez_sinirlari.py, python gen/kompakt_stadyum_kolu.py
            (tek seferlik), python gen/kompakt_mahalle_yerlesim.py ve bu dosya bir kez daha.
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
KARE_CIKTI = os.path.join(KOK, "public", "harita", "duzada-kareler.json")


# ------------------------------------------------------------------ ölçüler (hepsi DENEME)
KARE = 8.0              # DENEME: kare boyu (m); Kemal 21 Kasım "8x8 m"
DERINLIK_KARE = 4       # DENEME: yoldan içeri en çok bu kadar sıra kare (Cities Skylines gibi)
SADELESTIRME = 0.6      # DENEME: kesim yoldan en çok bu kadar sapar (m); kıvrımlı yol kısa düz kesimlere bölünür
# Arsa ölçüleri kare sayısıyla: (cephe, derinlik). İlki asıl ölçü, sonrakiler sığmazsa denenir.
ARSA = {   # DENEME
    "bitisik": [(1, 2)],                                   # 8 x 16 m, ortak duvar
    # 24 x 32 m (Kemal 21 Kasım: daha da seyrek); kıvrımda dar avlulu 1x4, 1x3 (Kemal 21 Kasım)
    "avlulu": [(3, 4), (3, 3), (2, 4), (2, 3), (1, 4), (1, 3)],
    "buyuk": [(4, 4), (3, 4), (3, 3)],                     # 32 x 32 m ya da 24 x 32 m
}
BUYUK_UC_ORANI = 0.5    # DENEME: büyük arsaların bu kadarı 3 kare cepheyle başlar (çeşitlilik; kararlı)
ARA_KARE = {"bitisik": 0, "avlulu": 1, "buyuk": 0}   # DENEME: aynı sırada arsadan sonra boş kalan kare; avlulu en az 1 (≈ 8 m)
KALDIRIM = 1.0          # DENEME: yol kenarı ile ilk sıra karenin önü arası (m)
KOSE_PAY = 2.0          # DENEME: kare başka yolun kenarından en az bu kadar geri (m)
CAKISMA_PAYI = 0.2      # m²; iki kare en çok bu kadar değebilir (denetim 0,5 m²; koordinat yuvarlaması için pay)
EGIM_SINIRI = 0.30      # DENEME: arsanın ortalama eğimi en çok %30 (yaklaşık 17 derece)
KIYI_SERIDI = 25.0      # DENEME: kıyıdan bu kadar içerisi karesiz (m)
KUMSAL_PAY = 60.0       # DENEME: kumlu kıyıda kumsal şeridi (m; kıyı şeridine ek)
YERLESIM_KUSAGI = 55.0  # DENEME: köy sokağının bu kadar çevresi yerleşim alanı (m)
YERLESIM_CARPAN = 1.25  # DENEME: yerleşim alanı yerleşimin yarıçapının bu katını geçmez
BITISIK_MEYDAN = 110.0  # DENEME: Merkez Meydanı'nın bu kadar çevresi bitişik (m)
BITISIK_MEYDANCIK = 30.0  # DENEME: meydancığın bu kadar çevresi bitişik (m)
KORUNAN_PAY = 3.0       # DENEME: korunan alanlardan en az bu kadar uzak (m)
CEPHE_YOLLARI = ("ana", "ara", "sokak", "gecit")   # toprak (tarla yolu), patika, merdiven kare almaz
SIRA = {"ana": 0, "ara": 1, "sokak": 2, "gecit": 3}
TUR_KADEME = {"bitisik": ("ana", "ara", "sokak", "gecit"), "avlulu": ("ara", "sokak", "gecit"), "buyuk": ("ana",)}

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




# ------------------------------------------------------------------ kesimler
def sade_indis(p, tol):
    """Douglas-Peucker; tutulan köşelerin sırası (özgün köşeler)."""
    tut = np.zeros(len(p), bool)
    tut[0] = tut[-1] = True
    yigin = [(0, len(p) - 1)]
    while yigin:
        i, j = yigin.pop()
        if j <= i + 1:
            continue
        a, b = p[i], p[j]
        v = b - a
        n = math.hypot(*v)
        ara = p[i + 1:j]
        if n < 1e-6:          # kapalı halka (Sahil Yolu): uçlar aynı noktada, en uzak köşeden bölünür
            d = np.hypot(ara[:, 0] - a[0], ara[:, 1] - a[1])
        else:
            d = np.abs((ara[:, 0] - a[0]) * v[1] - (ara[:, 1] - a[1]) * v[0]) / n
        k = int(np.argmax(d))
        if d[k] > tol:
            tut[i + 1 + k] = True
            yigin += [(i, i + 1 + k), (i + 1 + k, j)]
    return np.flatnonzero(tut)


def kademe_tur(y, nokta):
    """Sütunun türü (sütun önünün ortasına göre)."""
    if BITISIK_P.contains(nokta) and y["kademe"] in TUR_KADEME["bitisik"]:
        return "bitisik"
    return "buyuk" if y["kademe"] == "ana" else "avlulu"


def tohum(metin):
    return sum(ord(ch) * (i + 1) for i, ch in enumerate(metin)) % (2 ** 32)


SERITLER = []     # her kesimin bir yanı: kare şeridi
red = {"yerlesim": 0, "yasak": 0, "dik": 0, "yol": 0, "cakisma": 0, "egim": 0, "mahalle": 0, "sigmadi": 0}

print("Kareler ...")
sirali = sorted([y for y in YOLLISTE if y["kademe"] in CEPHE_YOLLARI],
                key=lambda y: (SIRA[y["kademe"]], -y["g"].length, y["id"]))
# öncelik: Merkez Meydanı'na yakın yollar önce (bitişik kuşak), sonra kademe sırası
yakin = sorted([y for y in sirali if y["g"].intersects(BITISIK_ALAN)],
               key=lambda y: (y["g"].distance(MEYDAN) if MEYDAN is not None else 0, y["id"]))
oncelik = {y["id"]: i for i, y in enumerate(yakin + [y for y in sirali if y not in yakin])}

for y in sirali:
    if YER_BIRLESIK.distance(y["g"]) > 1.0:
        continue
    pts = np.asarray(y["g"].coords)
    ind = sade_indis(pts, SADELESTIRME)
    o = y["genislik"] / 2 + KALDIRIM
    for kno in range(len(ind) - 1):
        i0, i1 = ind[kno], ind[kno + 1]
        A, Bn = pts[i0], pts[i1]
        v = Bn - A
        Lk = math.hypot(*v)
        n_sutun = int((Lk + 1e-6) // KARE)
        if n_sutun < 1:
            continue
        u = v / Lk
        for taraf, tad in ((1, "sol"), (-1, "sag")):
            nv = np.array([-u[1] * taraf, u[0] * taraf])
            # kesim içindeki gerçek yol köşeleri bu yana taşıyorsa şerit o kadar geri çekilir
            ara = pts[i0:i1 + 1]
            sapma = max(0.0, float(np.max((ara - A) @ nv)))
            bas = (Lk - n_sutun * KARE) / 2
            O = A + u * bas + nv * (o + sapma)
            SERITLER.append(dict(y=y, taraf=tad, kesim=int(kno), O=O, u=u, n=nv, n_sutun=n_sutun,
                                 sutun=[None] * n_sutun))

# sütunlar: her sütun yolun bir noktasında, yerleşim ve tür o noktadan
ADAY = []         # (sıra, öncelik, şerit no, sütun no)
for si, sr in enumerate(SERITLER):
    y = sr["y"]
    g = y["g"]
    for j in range(sr["n_sutun"]):
        on = sr["O"] + sr["u"] * (KARE * j)
        orta = Point(*(on + sr["u"] * (KARE / 2) + sr["n"] * 4.0))
        yid = yerlesim_bul(orta)
        if yid is None:
            red["yerlesim"] += 1
            continue
        s = g.project(Point(*on))
        sr["sutun"][j] = dict(metre=int(round(s)), yerlesim=yid, tur=kademe_tur(y, orta), derinlik=0, kare=[])


def kare_poly(sr, j, r):
    a = sr["O"] + sr["u"] * (KARE * j) + sr["n"] * (KARE * r)
    b = a + sr["u"] * KARE
    return Polygon([tuple(a), tuple(b), tuple(b + sr["n"] * KARE), tuple(a + sr["n"] * KARE)])


def kare_uygun(y, poly):
    if not ADA_IC.contains(poly) or YASAK_P.intersects(poly):
        return "yasak"
    # Kemal 21 Kasım: %30'dan dik yamaçta kare çizilmez (kare tabanının eğimi)
    if egim(list(poly.exterior.coords)[:4])[0] > EGIM_SINIRI:
        return "dik"
    for i in SERIT_AGAC.query(poly):
        serit = YOL_SERIT[i]
        if YOLLISTE[i] is y:
            if poly.intersection(serit).area > 0.3:
                return "yol"
        elif poly.distance(serit) < KOSE_PAY:
            return "yol"
    return None


# kareler sıra sıra: önce bütün yolların ön sırası; çakışmada yola yakın olan (ve öncelikli yol) kalır
KOVA = {}          # 16 m'lik kovalar: kabul edilen kareler
KOVA_M = 2 * KARE


def kovalar(poly):
    x0, y0, x1, y1 = poly.bounds
    for kx in range(int(math.floor(x0 / KOVA_M)), int(math.floor(x1 / KOVA_M)) + 1):
        for ky in range(int(math.floor(y0 / KOVA_M)), int(math.floor(y1 / KOVA_M)) + 1):
            yield (kx, ky)


sira_listesi = sorted(((oncelik[sr["y"]["id"]], sr["y"]["id"], sr["taraf"], sr["kesim"], si)
                       for si, sr in enumerate(SERITLER)))
for r in range(DERINLIK_KARE):
    for _, _, _, _, si in sira_listesi:
        sr = SERITLER[si]
        for j, st in enumerate(sr["sutun"]):
            if st is None or st["derinlik"] != r:
                continue
            poly = kare_poly(sr, j, r)
            neden = kare_uygun(sr["y"], poly)
            if neden is None:
                for kv in kovalar(poly):
                    if any(poly.intersection(q).area > CAKISMA_PAYI for q in KOVA.get(kv, ())):
                        neden = "cakisma"
                        break
            if neden is not None:
                red[neden] += 1
                st["derinlik"] = -r - 1 if r else -1   # bu sütunda derin kare yok
                continue
            for kv in kovalar(poly):
                KOVA.setdefault(kv, []).append(poly)
            st["kare"].append(poly)
            st["derinlik"] = r + 1
    print(f"  {r + 1}. sıra: {sum(1 for sr in SERITLER for st in sr['sutun'] if st and len(st['kare']) > r)} kare")
for sr in SERITLER:
    for st in sr["sutun"]:
        if st is not None:
            st["derinlik"] = len(st["kare"])

# ------------------------------------------------------------------ arsalar
PARSELLER = []


def arsa_dene(sr, j, w, d, tur):
    sut = sr["sutun"][j:j + w]
    if len(sut) < w or any(st is None or st["tur"] != tur or st["derinlik"] < d or st.get("arsa") for st in sut):
        return None, "sigmadi"
    a = sr["O"] + sr["u"] * (KARE * j)
    b = a + sr["u"] * (KARE * w)
    c = b + sr["n"] * (KARE * d)
    e = a + sr["n"] * (KARE * d)
    kose = (tuple(a), tuple(b), tuple(c), tuple(e))
    poly = Polygon(kose)
    e_, kot = egim(kose)
    if e_ > EGIM_SINIRI:
        return None, "egim"
    yid = sut[0]["yerlesim"]
    m = poly.centroid
    if not MAHALLE[YERLESIM[yid]["mahalle"]].contains(m):
        return None, "mahalle"
    return (poly, kose, e_, kot, yid), None


for sr in sorted(SERITLER, key=lambda sr: (oncelik[sr["y"]["id"]], sr["taraf"], sr["kesim"])):
    y = sr["y"]
    tad = sr["taraf"]
    rng = np.random.default_rng(tohum(f"{y['id']}_{tad}_{sr['kesim']}"))
    j = 0
    onceki_bos = True          # bir önceki sütunda arsa yok
    while j < sr["n_sutun"]:
        st = sr["sutun"][j]
        if st is None or st["derinlik"] == 0:
            j += 1
            onceki_bos = True
            continue
        tur = st["tur"]
        if tur == "avlulu" and not onceki_bos:
            j += 1                 # avlulunun önünde en az 1 boş kare
            onceki_bos = True
            continue
        olcu = ARSA[tur]
        if tur == "buyuk" and rng.random() < BUYUK_UC_ORANI:
            olcu = olcu[1:]
        sonuc, neden = None, "sigmadi"
        for w, d in olcu:
            sonuc, neden = arsa_dene(sr, j, w, d, tur)
            if sonuc is not None:
                break
        if sonuc is None:
            red[neden] += 1
            j += 1
            onceki_bos = True
            continue
        poly, kose, e_, kot, yid = sonuc
        yola = (-sr["n"][0], -sr["n"][1])
        cy = (math.degrees(math.atan2(yola[0], yola[1])) + 360) % 360
        aid = f"prs_{y['id']}_{tad}_{st['metre']}"
        kareler = []
        for q in range(j, j + w):
            sq = sr["sutun"][q]
            sq["arsa"] = aid
            sq["arsaDerinlik"] = d
            kareler += [f"k_{y['id']}_{tad}_{sq['metre']}_{r}" for r in range(d)]
        PARSELLER.append(dict(
            id=aid, tur=tur, yol=y["id"], yolKademe=y["kademe"], taraf=tad,
            konumM=round(y["g"].project(Point(*kose[0])), 1), cepheYonu=round(cy, 1),
            cepheM=round(w * KARE, 1), derinlikM=round(d * KARE, 1), alanM2=round(poly.area, 1),
            kotM=round(kot, 1), egim=round(100 * e_, 1), mahalle=mahalle_bul(poly.centroid), yerlesim=yid,
            kareler=kareler, poly=poly))
        j += w + ARA_KARE[tur]
        onceki_bos = ARA_KARE[tur] > 0

# kimlikler: aynı yolun aynı yanında aynı metrede iki sütun olursa kare kimliği çakışır (olmamalı)
_sayac = {}
for sr in SERITLER:
    for st in sr["sutun"]:
        if st is not None and st["derinlik"]:
            k = (sr["y"]["id"], sr["taraf"], st["metre"])
            _sayac[k] = _sayac.get(k, 0) + 1
assert all(v == 1 for v in _sayac.values()), f"kare kimliği çakıştı: {[k for k, v in _sayac.items() if v > 1][:5]}"
assert len({p["id"] for p in PARSELLER}) == len(PARSELLER), "arsa kimliği çakıştı"

# ------------------------------------------------------------------ yaz
ALANLAR = {
    "id": "kararlı kimlik: prs_<yol kimliği>_<sol|sag>_<metre>; metre ilk sütunun önünün yol başından uzaklığı",
    "tur": "bitisik (meydan çevresi, ortak duvar, 1x2 kare) | avlulu (köy, 3x4 kare) | buyuk (ana yol kenarı, 3-4 x 4 kare)",
    "yol": "cephe verdiği yolun kimliği (duzada-yollar.geojson)", "yolKademe": "o yolun kademesi",
    "taraf": "yolun çizim yönüne göre hangi yanı", "konumM": "arsa önünün yol başından uzaklığı (m)",
    "cepheYonu": "arsadan yola bakış yönü, derece (kuzey 0, saat yönünde)",
    "cepheM": "yol boyunca cephe (m; kare boyunun katı)", "derinlikM": "yoldan içeri derinlik (m; kare boyunun katı)",
    "alanM2": "alan (m²)", "kotM": "ortalama rakım (m)", "egim": "ortalama eğim (%)",
    "mahalle": "mahalle kimliği", "yerlesim": "yerleşim kimliği (duzada-sinirlar.geojson)",
    "kareler": "arsanın kareleri (duzada-kareler.json kimlikleri)",
}
OLCULER = {"not": "Hepsi DENEME (Kemal onaylamadı)", "kareM": KARE, "derinlikKare": DERINLIK_KARE,
           "sadelestirmeM": SADELESTIRME,
           "arsaKare": {t: [list(x) for x in v] for t, v in ARSA.items()},
           # eski denetimle uyum: tür ve kademeye göre en büyük ölçü (m)
           "olcu": {t: {k: {"cepheM": max(w for w, _ in ARSA[t]) * KARE, "derinlikM": max(d for _, d in ARSA[t]) * KARE}
                        for k in TUR_KADEME[t]} for t in ARSA},
           "cepheOynama": {t: 0.0 for t in ARSA}, "araKare": ARA_KARE, "buyukUcOrani": BUYUK_UC_ORANI,
           "kaldirimM": KALDIRIM, "kosePayM": KOSE_PAY,
           "egimSiniri": EGIM_SINIRI, "kiyiSeridiM": KIYI_SERIDI, "kumsalPayM": KUMSAL_PAY,
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
               "not": "Kompakt ada arsaları (kare ızgaraya oturur), taslak (Kemal onaylamadı). gen/kompakt_parseller.py üretir.",
               "alanlar": ALANLAR, "olculer": OLCULER, "features": ozellik},
              f, ensure_ascii=False, separators=(",", ":"))


def dd(v):
    """metre vektörü -> derece (boylam, enlem) vektörü."""
    return [round(v[0] / B["mPerLng"], 10), round(v[1] / B["mPerLat"], 10)]


arsa_no = {p["id"]: i for i, p in enumerate(sorted(PARSELLER, key=lambda p: p["id"]))}
seritler = []
kare_say = 0
for sr in sorted(SERITLER, key=lambda sr: (sr["y"]["id"], sr["taraf"], sr["kesim"])):
    sut = []
    for j, st in enumerate(sr["sutun"]):
        if st is None or not st["derinlik"]:
            continue
        a = st.get("arsa")
        sut.append([j, st["metre"], st["derinlik"], arsa_no[a] if a else -1, st.get("arsaDerinlik", 0)])
        kare_say += st["derinlik"]
    if not sut:
        continue
    seritler.append({"yol": sr["y"]["id"], "taraf": sr["taraf"], "kesim": sr["kesim"], "o": ll(*sr["O"]),
                     "u": dd(sr["u"] * KARE), "n": dd(sr["n"] * KARE), "s": sut})
KARE_ALANLAR = {
    "seritler": "her yol kesiminin bir yanındaki kare şeridi: yol, taraf (sol|sag), kesim (yolun kaçıncı düz kesimi)",
    "o": "şeridin 0. sütun, 0. sıra karesinin yola bakan ön köşesi [boylam, enlem]",
    "u": "bir kare boyunca yol yönünde adım [boylam, enlem farkı]",
    "n": "bir kare boyunca yoldan içeri adım [boylam, enlem farkı]",
    "s": "sütunlar: [sütun no j, metre, kare sayısı (derinlik), arsa sırası (arsalar listesinde; -1 boş), arsanın derinliği]",
    "kare": "sütunun r. karesi (r = 0 yola bitişik): köşeler o + j*u + r*n, o + (j+1)*u + r*n, o + (j+1)*u + (r+1)*n, "
            "o + j*u + (r+1)*n; kimlik k_<yol>_<taraf>_<metre>_<r>; r < arsanın derinliği ise arsanın karesi, değilse boş",
}
with open(KARE_CIKTI, "w", encoding="utf-8") as f:
    json.dump({"not": "Kompakt ada kare ızgarası, taslak (Kemal onaylamadı). gen/kompakt_parseller.py üretir.",
               "kareM": KARE, "alanlar": KARE_ALANLAR, "olculer": OLCULER,
               "arsalar": [p["id"] for p in sorted(PARSELLER, key=lambda p: p["id"])], "seritler": seritler},
              f, ensure_ascii=False, separators=(",", ":"))

from collections import Counter  # noqa: E402
dolu = sum(len(p["kareler"]) for p in PARSELLER)
print(f"  kare: {kare_say} (arsada {dolu}, boş {kare_say - dolu}) · şerit: {len(seritler)}")
print(f"  arsa: {len(PARSELLER)}")
print("  türe göre:", dict(Counter(p["tur"] for p in PARSELLER)))
print("  ölçüye göre:", dict(Counter(f"{p['tur']} {int(p['cepheM'] // KARE)}x{int(p['derinlikM'] // KARE)}" for p in PARSELLER)))
print("  mahalleye göre:", dict(Counter(p["mahalle"] for p in PARSELLER)))
print("  yerleşime göre:", dict(Counter(p["yerlesim"] for p in PARSELLER)))
print("  atılan kare ve sığmayan arsa denemeleri:", red)
for yol_ in (CIKTI, KARE_CIKTI):
    print(f"Yazıldı: {os.path.relpath(yol_, KOK)} ({os.path.getsize(yol_) / 1e6:.2f} MB)")
