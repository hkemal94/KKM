"""Merkez Mahallesi küçülür — yalnız Merkez'in sınırları yeniden hesaplanır (Kemal, 21 Kasım 2026).

Kemal: Merkez'in alanı yaklaşık üçte bir azalsın (bugünkü alanın ~%67'si kalsın). Merkez köyü ve
Ada Tepesi'nin zirvesi Merkez'de kalır; tepenin dış yamaçları komşu mahallelere geçer, her biri
kendi tarafındaki yamacı alır. Yeni Merkez sınırları doğal hatlara (sırt, dere) oturur.
Merkez'e değmeyen sınırlar (Liman–İskele, Stadyum–Çiftlik, İskele–Çiftlik, Liman–Stadyum) aynı kalır;
onlar yalnız eski Merkez toprağına doğru uzar.

Yöntem (kompakt_zemin.py'deki doğal hat yöntemiyle aynı fikir): 20 m ızgarada sırt ve dere yatağı
geçmesi pahalı bir "yürüme maliyeti" kurulur. Komşu mahallelerin bütün bugünkü toprağı, Merkez'in
ise yalnız çekirdeği (köyün yerleşim alanı ve zirvenin çevresi) kaynak olur. Eski Merkez'in her
noktası en ucuz ulaşılan mahalleye düşer; Merkez'e bir öncelik payı verilir ve bu pay, Merkez'in
alanı hedefe inene kadar ayarlanır. Böylece sınırlar kendiliğinden sırta ya da dereye oturur.

Girdi : gen/kompakt-sinirlar.json, public/harita/duzada-sinirlar.geojson, duzada-zemin.bin,
        public/harita/duzada-parseller.geojson (yerleşim alanları), public/harita/duzada-yollar.geojson
Çıktı : gen/kompakt-sinirlar.json ve public/harita/duzada-sinirlar.geojson'da yalnız mahalle ve sınır
        kayıtları; duzada-yollar.geojson'da yalnız yolların "mahalle" alanı (kimlik ve çizgi aynı).
        Zemin değişmez.

Sıra: ... → kompakt_parseller.py → bu dosya → kompakt_stadyum_kolu.py → kompakt_mahalle_yerlesim.py →
kompakt_parseller.py.
İkinci çalıştırmada Merkez zaten hedefte olduğu için sınırlar yerinde kalır.
Değerler onaysız: DENEME.

  python gen/kompakt_merkez_sinirlari.py
"""
import json, math, os, sys, warnings

import numpy as np
import shapely
from matplotlib.path import Path
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from shapely.geometry import LineString, MultiLineString, Point, Polygon, shape
from shapely.ops import linemerge, transform, unary_union

warnings.filterwarnings("ignore", category=DeprecationWarning)
BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
from kompakt_zemin_denetim import oku  # noqa: E402

SABIT = os.path.join(BURASI, "kompakt-sinirlar.json")
SINIR = os.path.join(KOK, "public", "harita", "duzada-sinirlar.geojson")
PARSEL = os.path.join(KOK, "public", "harita", "duzada-parseller.geojson")
YOLLAR = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")

MERKEZ = "yer_merkez"
MERKEZ_TABAN_KM2 = 24.1    # 21 Kasım: Merkez'in yerleşim kaydırmasından sonraki ("bugünkü") alanı
HEDEF_ORAN = 0.67          # DENEME: Kemal "yaklaşık üçte bir azalsın"
ZIRVE_CEKIRDEK = 300.0     # DENEME: Ada Tepesi'nin zirvesinin bu kadar çevresi Merkez'de kalır (m)
KOY_PAY = 80.0             # DENEME: Merkez köyünün yerleşim alanının bu kadar çevresi Merkez'de kalır (m)
KIYI_UZAK = 400.0          # DENEME: Merkez kıyıya bu kadar yaklaşmaz (dış yamaçlar kıyıya kadar komşunun)
K = 2                      # 20 m ızgara (zemin 10 m)
SERIT = 15.0               # m; bundan ince şerit kalmaz
SIRT_OLCU = 160.0          # m; sırt, çevresinin bu yarıçaplı ortalamasından yüksek yer (kompakt_zemin.py ile aynı)

B, HAM = oku()
Z = HAM.astype(float) * B["birim"]


def mt(x, y, z=None):
    return ((np.asarray(x) - B["lng0"]) * B["mPerLng"], (np.asarray(y) - B["lat0"]) * B["mPerLat"])


def ll(x, y):
    return [round(B["lng0"] + x / B["mPerLng"], 6), round(B["lat0"] + y / B["mPerLat"], 6)]


def cokgen_ll(g):
    # enlem-boylam 6 basamağa yuvarlanınca sık köşeli kenar kendini kesmesin: ızgaraya oturtularak yuvarlanır
    g = shapely.set_precision(transform(lambda x, y, z=None: (B["lng0"] + np.asarray(x) / B["mPerLng"],
                                                              B["lat0"] + np.asarray(y) / B["mPerLat"]), g), 1e-6)
    pp = [g] if g.geom_type == "Polygon" else [q for q in g.geoms if q.geom_type == "Polygon"]
    return {"type": "MultiPolygon", "coordinates": [[[[round(x, 6), round(y, 6)] for x, y in p.exterior.coords]]
                                                    + [[[round(x, 6), round(y, 6)] for x, y in r.coords] for r in p.interiors]
                                                    for p in pp]}


def poligonlar(g):
    return [q for q in getattr(g, "geoms", [g]) if q.geom_type == "Polygon" and q.area > 0]


sabit = json.load(open(SABIT, encoding="utf-8"))
geo = json.load(open(SINIR, encoding="utf-8"))
pd = json.load(open(PARSEL, encoding="utf-8"))
ADA = transform(mt, shape(next(f["geometry"] for f in geo["features"] if f["properties"]["katman"] == "ada")))
ESKI = {f["properties"]["id"]: transform(mt, shape(f["geometry"])) for f in sabit["features"]
        if f["properties"]["katman"] == "mahalle"}
IDS = list(ESKI)
KOMSU_IDS = [k for k in IDS if k != MERKEZ]
ZIRVE = next(mt(*f["geometry"]["coordinates"]) for f in geo["features"]
             if f["properties"]["katman"] == "zirve" and f["properties"]["id"] == "tepe_ana")
DERE = [(transform(mt, shape(f["geometry"])), f["properties"]["alanKm2"]) for f in geo["features"]
        if f["properties"]["katman"] == "dere"]
YER_ALAN = {}
for f in pd["features"]:
    if f["properties"]["katman"] == "yerlesimAlani":
        y = f["properties"]["yerlesim"]
        g = transform(mt, shape(f["geometry"]))
        YER_ALAN[y] = g if y not in YER_ALAN else YER_ALAN[y].union(g)
YER_MAH = {f["properties"]["id"]: f["properties"]["mahalle"] for f in geo["features"]
           if f["properties"]["katman"] == "yerlesim"}

# ------------------------------------------------------------------ ızgara ve yürüme maliyeti
hk = B["hucre"] * K
Zk = Z[::K, ::K]
BOY, EN = Zk.shape
GX, GY = np.meshgrid(B["x0"] + np.arange(EN) * hk, B["y0"] + np.arange(BOY) * hk)
PTS = np.column_stack([GX.ravel(), GY.ravel()])


def icinde(g):
    m = np.zeros(PTS.shape[0], bool)
    for p in poligonlar(g):
        a = Path(np.asarray(p.exterior.coords)).contains_points(PTS)
        for r in p.interiors:
            a &= ~Path(np.asarray(r.coords)).contains_points(PTS)
        m |= a
    return m.reshape(Zk.shape)


KARA = icinde(ADA)
SIRT01 = np.clip((Zk - ndimage.gaussian_filter(Zk, SIRT_OLCU / hk)) / 8.0, 0, 1)
DERE01 = np.zeros(Zk.shape)
for g, a in DERE:
    v = float(np.clip(math.log10(max(a, 1e-4) / 0.08) / 1.2, 0, 1))
    for t in np.arange(0, g.length, hk / 2):
        q = g.interpolate(t)
        i, j = int(round((q.x - B["x0"]) / hk)), int(round((q.y - B["y0"]) / hk))
        if 0 <= i < EN and 0 <= j < BOY:
            DERE01[j, i] = max(DERE01[j, i], v)
DERE01 = ndimage.maximum_filter(DERE01, size=3)
ENGEL = np.clip(SIRT01 + DERE01, 0, 1)
MALIYET = 1.0 + 14.0 * ENGEL ** 1.5        # kompakt_zemin.py ile aynı

ETIKET = np.full(Zk.shape, -1)
for n, k in enumerate(IDS):
    ETIKET[icinde(ESKI[k]) & KARA & (ETIKET < 0)] = n
NM = IDS.index(MERKEZ)

# graf: kara hücreleri, 8 komşu
no = -np.ones(Zk.shape, int)
no[KARA] = np.arange(KARA.sum())
sat, sut, agr = [], [], []
for dj, di in ((0, 1), (1, 0), (1, 1), (1, -1)):
    a = KARA[max(0, -dj):BOY - max(0, dj), max(0, -di):EN - max(0, di)]
    b = KARA[max(0, dj):, max(0, di):][:a.shape[0], :a.shape[1]]
    ca = MALIYET[max(0, -dj):BOY - max(0, dj), max(0, -di):EN - max(0, di)]
    cb = MALIYET[max(0, dj):, max(0, di):][:a.shape[0], :a.shape[1]]
    na = no[max(0, -dj):BOY - max(0, dj), max(0, -di):EN - max(0, di)]
    nb = no[max(0, dj):, max(0, di):][:a.shape[0], :a.shape[1]]
    m = a & b
    w = math.hypot(dj, di) * hk * 0.5 * (ca[m] + cb[m])
    sat += [na[m], nb[m]]
    sut += [nb[m], na[m]]
    agr += [w, w]
GRAF = coo_matrix((np.concatenate(agr), (np.concatenate(sat), np.concatenate(sut))),
                  shape=(KARA.sum(), KARA.sum())).tocsr()


def uzaklik(kaynak):
    d = dijkstra(GRAF, directed=False, indices=no[kaynak & KARA], min_only=True)
    out = np.full(Zk.shape, 1e9)              # deniz ve ulaşılmayan yer: çok uzak
    out[KARA] = np.where(np.isfinite(d), d, 1e9)
    return out


def ortak_hat(a, b):
    # birleştirmede köşe noktaları milimetrelik kayabilir: a'nın sınırının b'ye değen kısmı
    h = a.boundary.intersection(b.buffer(0.3))
    parca = [q for q in getattr(h, "geoms", [h]) if q.geom_type in ("LineString", "MultiLineString")]
    if not parca:
        return []
    u = unary_union(parca)
    if u.is_empty or u.length == 0:
        return []
    m = linemerge(u) if u.geom_type == "MultiLineString" else u
    return [q.simplify(0.5) for q in getattr(m, "geoms", [m]) if q.length > 30]


def dogallik(h):
    t = np.arange(0, h.length, hk / 2)
    q = np.array([h.interpolate(s).coords[0] for s in t])
    i = np.clip(np.round((q[:, 0] - B["x0"]) / hk).astype(int), 0, EN - 1)
    j = np.clip(np.round((q[:, 1] - B["y0"]) / hk).astype(int), 0, BOY - 1)
    d = DERE01[j, i] > 0.35
    s = (SIRT01[j, i] > 0.35) & ~d
    return round(float(d.mean()), 2), round(float(s.mean()), 2)


# ------------------------------------------------------------------ Merkez payı (kompakt_stadyum_kolu.py bu satıra kadar ödünç alır)
if ESKI[MERKEZ].area / 1e6 <= MERKEZ_TABAN_KM2 * HEDEF_ORAN * 1.02:
    print(f"Merkez zaten hedefte ({ESKI[MERKEZ].area / 1e6:.1f} km²); sınırlar aynı kaldı.")
    sys.exit(0)
ESKI_M = ETIKET == NM
koy = [y for y, m in YER_MAH.items() if m == MERKEZ and y in YER_ALAN]
# Merkez yalnız zirveden büyür (her yöne kendi yamacı kadar); köy her durumda Merkez'de kalır ama
# kaynak değildir, yoksa köyün yakınındaki Liman sınırı hiç içeri çekilmez.
KOY = unary_union([YER_ALAN[y].buffer(KOY_PAY) for y in koy]).intersection(ESKI[MERKEZ])
ZIRVE_G = Point(ZIRVE).buffer(ZIRVE_CEKIRDEK).intersection(ESKI[MERKEZ])
CEKIRDEK = unary_union([KOY, ZIRVE_G])
KAYNAK_M = icinde(ZIRVE_G) & ESKI_M
ZORUNLU_M = icinde(CEKIRDEK) & ESKI_M
KIYIDA = (ndimage.distance_transform_edt(KARA) * hk) < KIYI_UZAK
D = {MERKEZ: uzaklik(KAYNAK_M)}
for k in KOMSU_IDS:
    D[k] = uzaklik(ETIKET == IDS.index(k))
D_KOMSU = np.min([D[k] for k in KOMSU_IDS], axis=0)

hedef_km2 = MERKEZ_TABAN_KM2 * HEDEF_ORAN
alt, ust = -20000.0, 200000.0
for _ in range(40):
    pay = (alt + ust) / 2
    m = ESKI_M & (((D[MERKEZ] - pay < D_KOMSU) & ~KIYIDA) | ZORUNLU_M)
    if m.sum() * hk * hk / 1e6 > hedef_km2:
        ust = pay
    else:
        alt = pay
PAY = (alt + ust) / 2
print(f"Merkez öncelik payı: {PAY:.0f} (maliyet birimi)")


# ------------------------------------------------------------------ ızgarada paylaşım
ESKI_MG = ESKI[MERKEZ]
ICI = icinde(ESKI_MG) & KARA
ETK = np.full(Zk.shape, -1)
ETK[ICI] = np.argmin(np.stack([D[k] for k in KOMSU_IDS]), axis=0)[ICI]
ETK = np.where(ICI, np.array([IDS.index(k) for k in KOMSU_IDS])[np.clip(ETK, 0, None)], -1)
ETK[ICI & (((D[MERKEZ] - PAY < D_KOMSU) & ~KIYIDA) | ZORUNLU_M)] = NM


def temizle(etk):
    """Kopuk parçalar komşu çoğunluğuna; Merkez yalnız köyünün parçası, komşu yalnız kendi toprağına
    bitişik parçası kalır. Sonra iki tur 3x3 çoğunluk (merdiven dişleri azalsın)."""
    for _ in range(2):
        for n in range(len(IDS)):
            if n == NM:
                tohum = ZORUNLU_M
            else:
                tohum = ndimage.binary_dilation(ETIKET == n) & ICI
            lab, _say = ndimage.label(etk == n, structure=np.ones((3, 3)))
            iyi = set(np.unique(lab[tohum & (etk == n)])) - {0}
            kotu = (etk == n) & ~np.isin(lab, list(iyi))
            etk[kotu] = -2
        while (etk == -2).any():
            for n in range(len(IDS)):
                buyu = ndimage.binary_dilation((etk == n) | (ETIKET == n) & ~ICI) & (etk == -2)
                etk[buyu] = n
        for _t in range(2):
            say = np.stack([ndimage.uniform_filter(((etk == n) | (~ICI & (ETIKET == n))).astype(float), 3)
                            for n in range(len(IDS))])
            cog = np.argmax(say, axis=0)
            degis = ICI & ~ZORUNLU_M & (say.max(axis=0) > 5.5 / 9)
            etk[degis] = cog[degis]
    return etk


ETK = temizle(ETK)


# ------------------------------------------------------------------ çokgenler: tek ağdan (eski dış sınır aynen, içteki yeni hatlar yumuşatılır)
def _chaikin(p, tur=3):
    p = np.asarray(p, float)
    for _ in range(tur):
        q = 0.75 * p[:-1] + 0.25 * p[1:]
        r = 0.25 * p[:-1] + 0.75 * p[1:]
        y = np.empty((2 * len(q), 2))
        y[0::2], y[1::2] = q, r
        p = np.vstack([p[:1], y, p[-1:]])
    return p


# komşu iki iç hücrenin etiketi farklıysa aralarındaki hücre kenarı bir sınır parçasıdır
seg = []
x0_, y0_ = GX[0, 0], GY[0, 0]
for j, i in zip(*np.nonzero(ICI[:, :-1] & ICI[:, 1:] & (ETK[:, :-1] != ETK[:, 1:]))):
    x = x0_ + (i + 0.5) * hk
    seg.append(((x, y0_ + (j - 0.5) * hk), (x, y0_ + (j + 0.5) * hk)))
for j, i in zip(*np.nonzero(ICI[:-1, :] & ICI[1:, :] & (ETK[:-1, :] != ETK[1:, :]))):
    y = y0_ + (j + 0.5) * hk
    seg.append(((x0_ + (i - 0.5) * hk, y), (x0_ + (i + 0.5) * hk, y)))
zincir = linemerge(MultiLineString(seg)) if seg else MultiLineString()
zincir = list(getattr(zincir, "geoms", [zincir]))
# zincirin eski sınıra yakın ucu dışarı uzatılır ki ağ kapansın
hatlar = [LineString(r.coords) for p_ in poligonlar(ESKI_MG) for r in [p_.exterior, *p_.interiors]]
for z in zincir:
    c = _chaikin(list(z.coords)) if len(z.coords) > 2 else np.asarray(z.coords)
    c = list(LineString(c).simplify(1.0).coords)
    for uc, ic in ((0, 1), (-1, -2)):
        if ESKI_MG.boundary.distance(Point(c[uc])) < 2.5 * hk:
            vx, vy = c[uc][0] - c[ic][0], c[uc][1] - c[ic][1]
            n_ = math.hypot(vx, vy) or 1.0
            ek = (c[uc][0] + 4 * hk * vx / n_, c[uc][1] + 4 * hk * vy / n_)
            c = [ek] + c if uc == 0 else c + [ek]
    hatlar.append(LineString(c))
from shapely.ops import polygonize  # noqa: E402
yuzler = [f_ for f_ in polygonize(unary_union(hatlar)) if ESKI_MG.contains(f_.representative_point())]
ic_xy = np.column_stack([GX[ICI], GY[ICI]])
ic_et = ETK[ICI]
YENI = {k: ESKI[k] for k in KOMSU_IDS}
YENI[MERKEZ] = Polygon()
for f_ in yuzler:
    m = Path(np.asarray(f_.exterior.coords)).contains_points(ic_xy)
    if m.any():
        n = int(np.bincount(ic_et[m], minlength=len(IDS)).argmax())
    else:
        q = f_.representative_point()
        n = int(ic_et[np.argmin(np.hypot(ic_xy[:, 0] - q.x, ic_xy[:, 1] - q.y))])
    YENI[IDS[n]] = unary_union([YENI[IDS[n]], f_])
YENI = {k: v.buffer(0) for k, v in YENI.items()}

# ------------------------------------------------------------------ sınır hatları
eski_hat = {}
for f in sabit["features"]:
    if f["properties"]["katman"] == "sinir":
        eski_hat.setdefault(tuple(sorted(f["properties"]["mahalleler"])), []).append(f)
yeni = []
for f in sabit["features"]:
    p = f["properties"]
    if p["katman"] == "mahalle":
        yeni.append({"type": "Feature", "properties": dict(p, alanKm2=round(YENI[p["id"]].area / 1e6, 1)),
                     "geometry": cokgen_ll(YENI[p["id"]])})
NOT = "Kemal 21 Kasım: Merkez küçüldü; sınır gen/kompakt_merkez_sinirlari.py ile doğal hatta (sırt, dere) yeniden hesaplandı"
for i, a in enumerate(IDS):
    for b in IDS[i + 1:]:
        cift = tuple(sorted((a, b)))
        hatlar = ortak_hat(YENI[a], YENI[b])
        if MERKEZ in cift:
            for h in hatlar:
                dr, sr = dogallik(h)
                yeni.append({"type": "Feature", "properties": {
                    "katman": "sinir", "mahalleler": [a, b], "dereOrani": dr, "sirtOrani": sr, "not": NOT},
                    "geometry": {"type": "LineString", "coordinates": [ll(*c) for c in h.coords]}})
            continue
        eskiler = eski_hat.get(cift, [])
        yeni.extend(eskiler)                       # Merkez'e değmeyen sınır aynen kalır
        eski_g = unary_union([transform(mt, shape(f["geometry"])) for f in eskiler]) if eskiler else None
        for h in hatlar:
            ek = h if eski_g is None else h.difference(eski_g.buffer(2.0))
            if ek.geom_type == "MultiLineString":
                ek = linemerge(ek)
            for q in getattr(ek, "geoms", [ek]):
                if q.geom_type == "LineString" and q.length > 30:
                    dr, sr = dogallik(q)
                    yeni.append({"type": "Feature", "properties": {
                        "katman": "sinir", "mahalleler": [a, b], "dereOrani": dr, "sirtOrani": sr,
                        "not": "Kemal 21 Kasım: eski Merkez toprağına uzayan kesim (sınırın eski kısmı aynı)"},
                        "geometry": {"type": "LineString", "coordinates": [ll(*c) for c in q.coords]}})
sabit["features"] = yeni
if "Merkez küçüldü" not in sabit["not"]:
    sabit["not"] += " 21 Kasım: Merkez küçüldü (yaklaşık %67), gen/kompakt_merkez_sinirlari.py."
with open(SABIT, "w", encoding="utf-8") as f:
    json.dump(sabit, f, ensure_ascii=False, separators=(",", ":"))
oz = [f for f in geo["features"] if f["properties"]["katman"] not in ("mahalle", "sinir")]
geo["features"] = [f for f in oz if f["properties"]["katman"] == "ada"] + yeni + \
    [f for f in oz if f["properties"]["katman"] != "ada"]
with open(SINIR, "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))

# ------------------------------------------------------------------ yolların mahalle alanı
# kompakt_yollar.py'deki kuralla aynı: yolun ortası hangi mahallede. Kimlik ve çizgi değişmez.
yd = json.load(open(YOLLAR, encoding="utf-8"))
degisen_yol = []
for f in yd["features"]:
    p = f["properties"]
    if p["katman"] != "yol":
        continue
    g = transform(mt, shape(f["geometry"]))
    orta = g.interpolate(0.5, normalized=True)
    yeni_m = next((k for k, v in YENI.items() if v.contains(orta)), None)
    if yeni_m != p.get("mahalle"):
        degisen_yol.append((p["id"], p.get("mahalle"), yeni_m))
        if yeni_m is None:
            p.pop("mahalle", None)
        else:
            p["mahalle"] = yeni_m
if degisen_yol:
    with open(YOLLAR, "w", encoding="utf-8") as f:
        json.dump(yd, f, ensure_ascii=False, separators=(",", ":"))

print("Alanlar (ha):")
for k in IDS:
    print(f"  {k:12s} {ESKI[k].area / 1e4:8.0f} → {YENI[k].area / 1e4:8.0f}")
print(f"Merkez: %{100 * YENI[MERKEZ].area / ESKI[MERKEZ].area:.1f} kaldı "
      f"(taban {MERKEZ_TABAN_KM2} km²'ye göre %{100 * YENI[MERKEZ].area / 1e6 / MERKEZ_TABAN_KM2:.1f})")
print(f"Yolların mahalle alanı değişti: {len(degisen_yol)} yol")
for a in sorted(degisen_yol):
    print("   ", a)
