"""Kompakt parsel denetimi — public/harita/duzada-parseller.geojson.

Yalnız okur. Her madde "temiz" ya da "SORUN" yazar; sorun varsa çıkış kodu 1 olur.
Ölçü sınırlarını dosyanın kendi "olculer" bölümünden okur (üreteçle aynı DENEME değerleri).

  python gen/kompakt_parseller_denetim.py
"""
import json, math, os, re, sys, warnings
from collections import Counter

import numpy as np
from scipy import ndimage
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely import prepared

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_zemin_denetim as zd  # noqa: E402

warnings.filterwarnings("ignore", category=DeprecationWarning)

KOK = os.path.dirname(BURASI)
YOLLAR = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")
PARSEL = os.path.join(KOK, "public", "harita", "duzada-parseller.geojson")
TURLER = {"bitisik", "avlulu", "buyuk"}
KADEMELER = {"ana", "ara", "sokak", "gecit"}
ALANLAR = ("id", "tur", "yol", "yolKademe", "taraf", "konumM", "cepheYonu", "cepheM", "derinlikM", "alanM2",
           "kotM", "egim", "mahalle", "yerlesim")


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    if not os.path.exists(PARSEL):
        print("Parsel dosyası yok. Önce: python gen/kompakt_parseller.py")
        sys.exit(1)
    b, ham = zd.oku()
    h = b["hucre"]
    Z = ham.astype(float) * b["birim"]

    def mt(x, y, z=None):
        return ((np.asarray(x) - b["lng0"]) * b["mPerLng"], (np.asarray(y) - b["lat0"]) * b["mPerLat"])

    def zemin(x, y):
        return ndimage.map_coordinates(Z, [(np.asarray(y) - b["y0"]) / h, (np.asarray(x) - b["x0"]) / h], order=1)

    geo = json.load(open(zd.SINIR, encoding="utf-8"))["features"]
    yd = json.load(open(YOLLAR, encoding="utf-8"))["features"]
    pd = json.load(open(PARSEL, encoding="utf-8"))
    O = pd["olculer"]
    ada = transform(mt, shape(next(f["geometry"] for f in geo if f["properties"]["katman"] == "ada")))
    mahalle = {f["properties"]["id"]: transform(mt, shape(f["geometry"])) for f in geo if f["properties"]["katman"] == "mahalle"}
    yerlesim_id = {f["properties"]["id"] for f in geo if f["properties"]["katman"] == "yerlesim"}
    imp = [transform(mt, shape(f["geometry"])) for f in geo
           if f["properties"]["katman"] == "imperial" and f["geometry"]["type"] == "Polygon"]
    kum = [LineString([mt(*c[:2]) for c in f["geometry"]["coordinates"]]) for f in geo
           if f["properties"]["katman"] == "kiyi" and f["properties"]["tur"] == "kum"]
    yollar = {f["properties"]["id"]: f for f in yd if f["properties"]["katman"] == "yol"}
    yol_g = {k: transform(mt, shape(f["geometry"])) for k, f in yollar.items()}
    korunan = [transform(mt, shape(f["geometry"])) for f in yd if f["properties"]["katman"] in ("korunan", "meydancik")]
    meydan = next((transform(mt, shape(f["geometry"])) for f in yd
                   if f["properties"]["katman"] == "korunan" and f["properties"]["tur"] == "meydan"), None)
    meydancik = [transform(mt, shape(f["geometry"])) for f in yd if f["properties"]["katman"] == "meydancik"]
    parseller = [f for f in pd["features"] if f["properties"]["katman"] == "parsel"]
    alanlar = {}
    for f in pd["features"]:
        if f["properties"]["katman"] == "yerlesimAlani":
            g = transform(mt, shape(f["geometry"]))
            alanlar[f["properties"]["yerlesim"]] = g if f["properties"]["yerlesim"] not in alanlar \
                else alanlar[f["properties"]["yerlesim"]].union(g)
    P = [transform(mt, shape(f["geometry"])) for f in parseller]
    pr = [f["properties"] for f in parseller]
    print(f"Parsel: {len(P)} · türe göre {dict(Counter(p['tur'] for p in pr))}")
    print(f"  mahalleye göre {dict(Counter(p['mahalle'] for p in pr))}")

    # 1. alanlar ve değerler
    eksik = [p.get("id") for p in pr if any(k not in p for k in ALANLAR)]
    yaz("her parselde bütün alanlar var", not eksik, f"{len(eksik)} eksik")
    yaz("tür bilinen", all(p["tur"] in TURLER for p in pr), sorted({p["tur"] for p in pr}))
    yaz("cephe verdiği yol var ve parsel alan kademede",
        all(p["yol"] in yollar and yollar[p["yol"]]["properties"]["kademe"] == p["yolKademe"] in KADEMELER for p in pr),
        f"{sum(1 for p in pr if p['yol'] not in yollar)} bilinmeyen yol")
    yaz("büyük parsel yalnız ana yolda", all(p["yolKademe"] == "ana" for p in pr if p["tur"] == "buyuk"),
        sum(1 for p in pr if p["tur"] == "buyuk" and p["yolKademe"] != "ana"))
    yer_mahalle = {f["properties"]["id"]: f["properties"]["mahalle"] for f in geo if f["properties"]["katman"] == "yerlesim"}
    dagilim = {}
    for p in pr:
        dagilim.setdefault(p["yerlesim"], Counter())[p["mahalle"]] += 1
    bolunen = {k: dict(v) for k, v in dagilim.items() if set(v) != {yer_mahalle.get(k)}}
    yaz("her yerleşimin parselleri tek mahallede (kendi mahallesinde; Kemal 21 Kasım)", not bolunen, bolunen or "")
    _zirve = next(f for f in geo if f["properties"]["katman"] == "zirve" and f["properties"]["id"] == "tepe_ana")
    yaz("Ada Tepesi'nin zirvesi Merkez Mahallesi'nde (Kemal 21 Kasım)",
        mahalle["yer_merkez"].contains(transform(mt, shape(_zirve["geometry"]))), "")
    yaz("mahalle ve yerleşim bilinen", all(p["mahalle"] in mahalle and p["yerlesim"] in yerlesim_id for p in pr), "")

    # 2. kimlik
    ids = [p["id"] for p in pr]
    def _kimlik_uyar(p):
        m_ = re.fullmatch(rf"prs_{re.escape(p['yol'])}_(sol|sag)_(\d+)", p["id"])
        return m_ is not None and m_.group(1) == p["taraf"] and abs(int(m_.group(2)) - p["konumM"]) <= 0.55
    kalip = all(_kimlik_uyar(p) for p in pr)
    yaz("kimlikler tekil", len(set(ids)) == len(ids), f"{len(ids) - len(set(ids))} tekrar")
    yaz("kimlik yol + yan + metreden", kalip, "prs_<yol>_<sol|sag>_<metre>")

    yanlis_m = sum(1 for g, p in zip(P, pr) if not mahalle[p["mahalle"]].contains(g.centroid))
    yaz("parselin mahalle alanı sınır dosyasıyla uyuşuyor", yanlis_m == 0, f"{yanlis_m} parsel")

    # 3. geometri
    gecersiz = sum(1 for g in P if not g.is_valid or g.area <= 0 or len(g.exterior.coords) != 5)
    yaz("parseller geçerli dörtgen", gecersiz == 0, f"{gecersiz} geçersiz")
    agac = STRtree(P)
    cakis = 0
    for i, g in enumerate(P):
        for j in agac.query(g):
            if j > i and g.intersection(P[j]).area > 0.5:
                cakis += 1
    yaz("parseller üst üste binmez (0,5 m² pay)", cakis == 0, f"{cakis} çift")
    serit = [(k, yol_g[k].buffer(f["properties"]["genislik"] / 2, cap_style=2 if f["properties"]["kademe"] != "patika" else 1))
             for k, f in yollar.items()]
    sagac = STRtree([s for _, s in serit])
    yolda = 0
    for g in P:
        for j in sagac.query(g):
            if g.intersection(serit[j][1]).area > 0.3:
                yolda += 1
                break
    yaz("parsel yol yatağına girmez", yolda == 0, f"{yolda} parsel")
    yasak = prepared.prep(unary_union([g.buffer(O.get("kosePayM", 0) * 0 + 0.01) for g in korunan + imp]))
    yaz("korunan alan, meydancık ve The Imperial dışında", not any(yasak.intersects(g) for g in P),
        sum(1 for g in P if yasak.intersects(g)))
    ic = prepared.prep(ada.buffer(-O["kiyiSeridiM"] + 0.5))
    yaz(f"kıyı şeridinin ({O['kiyiSeridiM']:.0f} m) içinde", all(ic.contains(g) for g in P),
        sum(1 for g in P if not ic.contains(g)))
    kumsal = prepared.prep(unary_union([k.buffer(O["kiyiSeridiM"] + O["kumsalPayM"] - 0.5) for k in kum]))
    yaz("kumsal şeridinde parsel yok", not any(kumsal.intersects(g) for g in P), sum(1 for g in P if kumsal.intersects(g)))
    disari = sum(1 for g, p in zip(P, pr) if p["yerlesim"] not in alanlar or
                 alanlar[p["yerlesim"]].buffer(O["kosePayM"] + 40).disjoint(g.centroid))
    yaz("parsel kendi yerleşim alanında", disari == 0, f"{disari} parsel")

    # 4. cephe: önü yola yakın, yönü yola bakar
    uzak = yanlis = 0
    for g, p in zip(P, pr):
        c = list(g.exterior.coords)
        on = Point((c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2)
        yg = yol_g[p["yol"]]
        d = yg.distance(on)
        gen = yollar[p["yol"]]["properties"]["genislik"]
        if d > gen / 2 + O["kaldirimM"] + 1.5:
            uzak += 1
        q = yg.interpolate(yg.project(on))
        az = (math.degrees(math.atan2(q.x - on.x, q.y - on.y)) + 360) % 360
        fark = abs((az - p["cepheYonu"] + 180) % 360 - 180)
        if d > 0.5 and fark > 35:
            yanlis += 1
            print("    yön:", p["id"], round(fark), round(d, 1))
    yaz("parselin önü yolunun kenarında", uzak == 0, f"{uzak} parsel uzak")
    yaz("cephe yönü yola bakıyor (35° pay)", yanlis == 0, f"{yanlis} parsel")

    # 5. eğim, kot, tür bölgesi
    dik = 0
    for g, p in zip(P, pr):
        c = np.asarray(g.exterior.coords)[:4]
        a_, b_, c_, d_ = c
        ornek = np.asarray([a_ + (b_ - a_) * u + ((d_ + (c_ - d_) * u) - (a_ + (b_ - a_) * u)) * v
                            for u in (0.15, 0.5, 0.85) for v in (0.15, 0.5, 0.85)])
        z = zemin(ornek[:, 0], ornek[:, 1])
        A = np.column_stack([ornek[:, 0], ornek[:, 1], np.ones(len(ornek))])
        (gx, gy, _), *_ = np.linalg.lstsq(A, z, rcond=None)
        if math.hypot(gx, gy) > O["egimSiniri"] + 1e-3:
            dik += 1
    yaz(f"eğim en çok %{100 * O['egimSiniri']:.0f} (DENEME)", dik == 0, f"{dik} parsel")
    bolge = prepared.prep(unary_union(([meydan.buffer(O["bitisikMeydanM"] + 0.5)] if meydan is not None else [])
                                      + [g.buffer(O["bitisikMeydancikM"] + 0.5) for g in meydancik]))
    yaz("bitişik yalnız meydan ve meydancık çevresinde",
        all(bolge.intersects(g) for g, p in zip(P, pr) if p["tur"] == "bitisik"),
        sum(1 for g, p in zip(P, pr) if p["tur"] == "bitisik" and not bolge.intersects(g)))
    olcu = O["olcu"]
    asiri = sum(1 for p in pr if p["derinlikM"] > olcu[p["tur"]][p["yolKademe"]]["derinlikM"] + 0.05
                or p["cepheM"] > olcu[p["tur"]][p["yolKademe"]]["cepheM"] * (1 + O["cepheOynama"][p["tur"]]) + 0.05)
    yaz("ölçüler tür ve kademe tablosunu aşmaz", asiri == 0, f"{asiri} parsel")

    print("Sonuç:", "temiz" if sorun == 0 else f"{sorun} SORUN")
    sys.exit(1 if sorun else 0)


if __name__ == "__main__":
    main()
