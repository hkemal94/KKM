"""Mahalle sınırını yerleşimlere uydurur — tek harita, 3. adımın eki (Kemal, 21 Kasım 2026).

Kemal: "Her yerleşimin bütün parselleri kendi mahallesinin içinde kalsın." Bir yerleşimin
alanı (ve parselleri) komşu mahalleye taşıyorsa, taşan parça bir pay ve yumuşatmayla
yerleşimin kendi mahallesine geçer; öbür sınırlar ve kesimler olduğu gibi kalır
(Liman–Merkez sınırı Kemal'in onaylı hâliyle; ona dokunan bir taşma yok).

Girdi : gen/kompakt-sinirlar.json (onaylı sabit sınırlar), public/harita/duzada-parseller.geojson
        (yerleşim alanları ve parseller), public/harita/duzada-sinirlar.geojson
Çıktı : gen/kompakt-sinirlar.json ve public/harita/duzada-sinirlar.geojson'da yalnız mahalle ve
        sınır kayıtları. Zemin, yollar, dereler, kıyı değişmez.

Sıra: kompakt_zemin.py → kompakt_yollar.py → kompakt_parseller.py → bu dosya → kompakt_parseller.py
(parsellerin mahalle alanı yeni sınırla yazılsın). İkinci çalıştırmada taşma kalmadığı için hiçbir
şey değişmez. Pay değerleri onaysız: DENEME.

  python gen/kompakt_mahalle_yerlesim.py
"""
import json, os, sys, warnings

import numpy as np
from shapely.geometry import LineString, MultiLineString, Polygon, shape
from shapely.ops import linemerge, transform, unary_union

warnings.filterwarnings("ignore", category=DeprecationWarning)
BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
from kompakt_zemin_denetim import oku  # noqa: E402

SABIT = os.path.join(BURASI, "kompakt-sinirlar.json")
SINIR = os.path.join(KOK, "public", "harita", "duzada-sinirlar.geojson")
PARSEL = os.path.join(KOK, "public", "harita", "duzada-parseller.geojson")

PAY = 40.0          # DENEME: yerleşim alanının dışında sınıra kalan pay (m)
YUMUSAT = 80.0      # DENEME: geçen parçanın girinti çıkıntısı bu yarıçapla kapanır (m)
KOMSU_PAY = 60.0    # DENEME: komşu mahallenin kendi yerleşim alanına bu kadar yaklaşılmaz (m)

B, _ = oku()


def mt(x, y, z=None):
    return ((np.asarray(x) - B["lng0"]) * B["mPerLng"], (np.asarray(y) - B["lat0"]) * B["mPerLat"])


def ll(x, y):
    return [round(B["lng0"] + x / B["mPerLng"], 6), round(B["lat0"] + y / B["mPerLat"], 6)]


def cokgen_ll(g):
    pp = [g] if g.geom_type == "Polygon" else list(g.geoms)
    return {"type": "MultiPolygon", "coordinates": [[[ll(*c) for c in p.exterior.coords]]
                                                    + [[ll(*c) for c in r.coords] for r in p.interiors] for p in pp]}


sabit = json.load(open(SABIT, encoding="utf-8"))
geo = json.load(open(SINIR, encoding="utf-8"))
pd = json.load(open(PARSEL, encoding="utf-8"))
yer_mahalle = {f["properties"]["id"]: f["properties"]["mahalle"] for f in geo["features"]
               if f["properties"]["katman"] == "yerlesim"}
MAH = {f["properties"]["id"]: transform(mt, shape(f["geometry"])) for f in sabit["features"]
       if f["properties"]["katman"] == "mahalle"}
ESKI = dict(MAH)
alan = {}
for f in pd["features"]:
    p = f["properties"]
    if p["katman"] in ("yerlesimAlani", "parsel"):
        g = transform(mt, shape(f["geometry"]))
        alan.setdefault(p["yerlesim"], []).append(g.buffer(0.5) if p["katman"] == "parsel" else g)
alan = {k: unary_union(v) for k, v in alan.items()}

degisen = {}      # (kazanan, kaybeden) -> alan m²
for yid, a in sorted(alan.items()):
    ev = yer_mahalle[yid]
    for mid in sorted(MAH):
        if mid == ev:
            continue
        tasma = a.intersection(MAH[mid])
        if tasma.area < 1.0:
            continue
        parca = tasma.buffer(PAY).buffer(YUMUSAT).buffer(-YUMUSAT)
        # komşu mahallenin kendi yerleşimlerine dokunma
        oz = [alan[k].buffer(KOMSU_PAY) for k, m in yer_mahalle.items() if m == mid and k in alan]
        if oz:
            parca = parca.difference(unary_union(oz))
        parca = parca.intersection(MAH[mid])
        # yalnız yerleşimin kendi mahallesine bitişen parça geçer (ada gibi kopuk parça olmasın)
        pp = [q for q in getattr(parca, "geoms", [parca]) if q.geom_type == "Polygon" and q.distance(MAH[ev]) < 1.0]
        if not pp:
            continue
        parca = unary_union(pp)
        MAH[ev] = unary_union([MAH[ev], parca]).buffer(0)
        MAH[mid] = MAH[mid].difference(parca).buffer(0)
        degisen[(ev, mid)] = degisen.get((ev, mid), 0.0) + parca.area
        print(f"  {yid}: {mid} → {ev}, {parca.area / 1e4:.1f} ha ({tasma.area / 1e4:.1f} ha taşma)")

if not degisen:
    print("Taşma yok; sınırlar aynı kaldı.")
    sys.exit(0)


def ortak_hat(a, b):
    h = a.boundary.intersection(b.boundary)
    parca = [q for q in getattr(h, "geoms", [h]) if q.geom_type in ("LineString", "MultiLineString")]
    if not parca:
        return []
    m = linemerge(unary_union(parca))
    return [q for q in getattr(m, "geoms", [m]) if q.length > 30]


cift_ = {tuple(sorted(c)) for c in degisen}
yeni = []
for f in sabit["features"]:
    p = f["properties"]
    if p["katman"] == "mahalle":
        g = MAH[p["id"]]
        yeni.append({"type": "Feature", "properties": dict(p, alanKm2=round(g.area / 1e6, 1)), "geometry": cokgen_ll(g)})
    elif p["katman"] == "sinir" and tuple(sorted(p["mahalleler"])) in cift_:
        continue
    else:
        yeni.append(f)
for a, b in sorted(cift_):
    eski = ortak_hat(ESKI[a], ESKI[b])
    for h in ortak_hat(MAH[a], MAH[b]):
        sap = max((h.hausdorff_distance(e) for e in eski), default=0)
        yeni.append({"type": "Feature", "properties": {
            "katman": "sinir", "mahalleler": [a, b],
            "not": "Kemal 21 Kasım: yerleşimin parselleri kendi mahallesinde kalsın diye kaydırıldı "
                   "(dere ve sırt oranı eski hat içindi, kaldırıldı)"},
            "geometry": {"type": "LineString", "coordinates": [ll(*c) for c in h.coords]}})
        print(f"  sınır {a}–{b}: {h.length:.0f} m hat, eski hattan en çok {sap:.0f} m uzak")
sabit["features"] = yeni
sabit["not"] = (sabit["not"] + " 21 Kasım: Merkez–Çiftlik (ve gerekirse öbür) sınırı yerleşimlere göre "
                "gen/kompakt_mahalle_yerlesim.py ile kaydırıldı.") if "21 Kasım" not in sabit["not"] else sabit["not"]
with open(SABIT, "w", encoding="utf-8") as f:
    json.dump(sabit, f, ensure_ascii=False, separators=(",", ":"))

# yayındaki sınır dosyasında yalnız mahalle ve sınır kayıtları değişir, sıra korunur
oz = [f for f in geo["features"] if f["properties"]["katman"] not in ("mahalle", "sinir")]
ada = [f for f in oz if f["properties"]["katman"] == "ada"]
geo["features"] = ada + yeni + [f for f in oz if f["properties"]["katman"] != "ada"]
with open(SINIR, "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
for (ev, mid), a_ in sorted(degisen.items()):
    print(f"Geçen alan: {mid} → {ev} {a_ / 1e4:.1f} ha")
print("Yazıldı: gen/kompakt-sinirlar.json, public/harita/duzada-sinirlar.geojson (yalnız mahalle ve sınır)")
