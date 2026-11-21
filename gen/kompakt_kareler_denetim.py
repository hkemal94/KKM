"""Kompakt kare ızgara denetimi — public/harita/duzada-kareler.json ve arsalarla bağı.

Yalnız okur. Her madde "temiz" ya da "SORUN" yazar; sorun varsa çıkış kodu 1 olur.
Arsaların kendi denetimi (yol, eğim, mahalle, yasaklar): python gen/kompakt_parseller_denetim.py

  python gen/kompakt_kareler_denetim.py
"""
import json, math, os, sys, warnings
from collections import Counter

import numpy as np
from shapely.geometry import LineString, Polygon, shape
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
KARE = os.path.join(KOK, "public", "harita", "duzada-kareler.json")


def main():
    sorun = 0

    def yaz(ad, temiz, deger=""):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    for d_ in (PARSEL, KARE):
        if not os.path.exists(d_):
            print("Dosya yok. Önce: python gen/kompakt_parseller.py")
            sys.exit(1)
    b, _ = zd.oku()

    def mt(x, y, z=None):
        return ((np.asarray(x) - b["lng0"]) * b["mPerLng"], (np.asarray(y) - b["lat0"]) * b["mPerLat"])

    geo = json.load(open(zd.SINIR, encoding="utf-8"))["features"]
    yd = json.load(open(YOLLAR, encoding="utf-8"))["features"]
    pd = json.load(open(PARSEL, encoding="utf-8"))
    kd = json.load(open(KARE, encoding="utf-8"))
    O = kd["olculer"]
    K = kd["kareM"]
    ada = transform(mt, shape(next(f["geometry"] for f in geo if f["properties"]["katman"] == "ada")))
    imp = [transform(mt, shape(f["geometry"])) for f in geo
           if f["properties"]["katman"] == "imperial" and f["geometry"]["type"] == "Polygon"]
    kum = [LineString([mt(*c[:2]) for c in f["geometry"]["coordinates"]]) for f in geo
           if f["properties"]["katman"] == "kiyi" and f["properties"]["tur"] == "kum"]
    yollar = {f["properties"]["id"]: f for f in yd if f["properties"]["katman"] == "yol"}
    korunan = [transform(mt, shape(f["geometry"])) for f in yd if f["properties"]["katman"] in ("korunan", "meydancik")]

    # kareleri şeritlerden kur
    kare = {}           # kimlik -> (poly, arsa ya da None, şerit, sütun, sıra)
    tekrar = 0
    derin = 0
    arsalar = kd["arsalar"]
    serit_sira = {}     # (şerit no) -> [(j, arsa ya da None)] sıra 0
    for si, s in enumerate(kd["seritler"]):
        o = np.array(mt(*s["o"]))
        u = np.array([s["u"][0] * b["mPerLng"], s["u"][1] * b["mPerLat"]])
        n = np.array([s["n"][0] * b["mPerLng"], s["n"][1] * b["mPerLat"]])
        for j, metre, der, an, ad in s["s"]:
            derin += der > O["derinlikKare"] or der < 1 or ad > der or (an < 0) != (ad == 0)
            serit_sira.setdefault(si, []).append((j, arsalar[an] if an >= 0 else None))
            for r in range(der):
                a = o + u * j + n * r
                kid = f"k_{s['yol']}_{s['taraf']}_{metre}_{r}"
                tekrar += kid in kare
                kare[kid] = (Polygon([tuple(a), tuple(a + u), tuple(a + u + n), tuple(a + n)]),
                             arsalar[an] if r < ad else None, si, j, r)
    P = [v[0] for v in kare.values()]
    dolu = sum(1 for v in kare.values() if v[1])
    print(f"Kare: {len(kare)} (arsada {dolu}, boş {len(kare) - dolu}) · şerit {len(kd['seritler'])} · arsa {len(arsalar)}")

    yaz("kare kimlikleri tekil", tekrar == 0, f"{tekrar} tekrar")
    yaz(f"sütun derinliği 1–{O['derinlikKare']} kare, arsa derinliği sütunu aşmaz", derin == 0, f"{derin} sütun")
    bozuk = sum(1 for g in P if not g.is_valid or abs(g.area - K * K) > 0.5
                or any(abs(math.dist(c, d) - K) > 0.05 for c, d in zip(g.exterior.coords[:-1], g.exterior.coords[1:])))
    yaz(f"her kare {K:g} x {K:g} m kare", bozuk == 0, f"{bozuk} kare")
    agac = STRtree(P)
    cakis = 0
    for i, g in enumerate(P):
        for j in agac.query(g):
            if j > i and g.intersection(P[j]).area > 0.5:
                cakis += 1
    yaz("kareler üst üste binmez (0,5 m² pay)", cakis == 0, f"{cakis} çift")

    # arsa ile bağ
    parsel = {f["properties"]["id"]: f for f in pd["features"] if f["properties"]["katman"] == "parsel"}
    yaz("arsa listesi arsa dosyasıyla aynı", set(parsel) == set(arsalar), f"{len(set(parsel) ^ set(arsalar))} fark")
    eksik = tam_degil = sayi = 0
    for aid, f in parsel.items():
        p = f["properties"]
        ks = p.get("kareler", [])
        if any(k not in kare or kare[k][1] != aid for k in ks):
            eksik += 1
            continue
        if {k for k, v in kare.items() if v[1] == aid} != set(ks):
            eksik += 1
            continue
        if len(ks) != round(p["cepheM"] / K) * round(p["derinlikM"] / K) or p["cepheM"] % K or p["derinlikM"] % K:
            sayi += 1
        g = transform(mt, shape(f["geometry"]))
        birlesik = unary_union([kare[k][0] for k in ks])
        if g.symmetric_difference(birlesik).area > 1.0:
            tam_degil += 1
    yaz("her arsanın kareleri var ve yalnız ona ait", eksik == 0, f"{eksik} arsa")
    yaz("arsa tam karelerden oluşur (kare çizgisine oturur, 1 m² pay)", tam_degil == 0, f"{tam_degil} arsa")
    yaz("arsa ölçüsü kare boyunun katı ve kare sayısıyla uyuşuyor", sayi == 0, f"{sayi} arsa")
    tablo = {t: {tuple(x) for x in v} for t, v in O["arsaKare"].items()}
    disi = sum(1 for f in parsel.values() if (round(f["properties"]["cepheM"] / K), round(f["properties"]["derinlikM"] / K))
               not in tablo[f["properties"]["tur"]])
    yaz("arsa ölçüsü tür tablosunda (DENEME)", disi == 0, f"{disi} arsa")
    # avlulu: aynı şeritte önünde ve arkasında en az 1 boş sütun
    yanyana = 0
    for si, sut in serit_sira.items():
        sut = sorted(sut)
        for (j0, a0), (j1, a1) in zip(sut, sut[1:]):
            if a0 and a1 and a0 != a1 and j1 == j0 + 1 and "avlulu" in (parsel[a0]["properties"]["tur"], parsel[a1]["properties"]["tur"]):
                yanyana += 1
    yaz("avlulu arsanın yanında en az 1 boş kare (aynı şeritte)", yanyana == 0, f"{yanyana} yer")

    # yasaklar ve yol
    yasak = prepared.prep(unary_union([g.buffer(0.01) for g in korunan + imp]))
    yaz("kare korunan alan, meydancık ve The Imperial dışında", not any(yasak.intersects(g) for g in P),
        sum(1 for g in P if yasak.intersects(g)))
    ic = prepared.prep(ada.buffer(-O["kiyiSeridiM"] + 0.5))
    yaz(f"kare kıyı şeridinin ({O['kiyiSeridiM']:.0f} m) içinde", all(ic.contains(g) for g in P),
        sum(1 for g in P if not ic.contains(g)))
    kumsal = prepared.prep(unary_union([k.buffer(O["kiyiSeridiM"] + O["kumsalPayM"] - 0.5) for k in kum]))
    yaz("kumsal şeridinde kare yok", not any(kumsal.intersects(g) for g in P), sum(1 for g in P if kumsal.intersects(g)))
    serit = [transform(mt, shape(f["geometry"])).buffer(f["properties"]["genislik"] / 2,
                                                       cap_style=2 if f["properties"]["kademe"] != "patika" else 1)
             for f in yollar.values()]
    sagac = STRtree(serit)
    yolda = sum(1 for g in P if any(g.intersection(serit[j]).area > 0.3 for j in sagac.query(g)))
    yaz("kare yol yatağına girmez", yolda == 0, f"{yolda} kare")
    bilinmeyen = sum(1 for s in kd["seritler"] if s["yol"] not in yollar)
    yaz("şeridin yolu var", bilinmeyen == 0, f"{bilinmeyen} şerit")

    print("  kare sayısı yola göre:", dict(Counter(yollar[s["yol"]]["properties"]["kademe"] for s in kd["seritler"] for c in s["s"] for _ in range(c[2]))))
    print("Sonuç:", "temiz" if sorun == 0 else f"{sorun} SORUN")
    sys.exit(1 if sorun else 0)


if __name__ == "__main__":
    main()
