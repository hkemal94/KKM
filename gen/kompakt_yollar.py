"""Kompakt Düzada yol ağı — tek harita, 2. adım (20 Kasım 2026, Kemal'in kararları).

Girdi : public/harita/duzada-zemin.bin (1. adımın zemini), public/harita/duzada-sinirlar.geojson
Çıktı : public/harita/duzada-yollar.geojson   yol ağı (koordinatlar [boylam, enlem, yükseklik m])
        public/harita/duzada-zemin.bin         yalnız yol şeridinde hafifçe düzlenir (yol yatağı)

Kurallar:
  - Yalnız adı olan / vikide maddesi olan yollar korunur ve yeni adaya uyarlanır; numaralı
    ("İskele 3. Sokak", "Çiftlik 1. Yolu") ve öbür yollar yeniden üretilir, ad almaz.
  - Türler: ana (asfalt), sokak (asfalt/taş), toprak (yalnız Çiftlik tarlaları), patika (tepeler),
    merdiven (Sahil Merdiveni). Eğim sınırı: ana ≤ %10, sokak ve toprak ≤ %15, patika serbest.
  - Köylerde düzenli sokak dokusu: eş yükselti eğrisine koşut, 60 m arayla sokaklar ve 120 m
    arayla dik sokaklar; aralarında yol kenarı parselleri (3. adım) için düz şeritler kalır.
  - Stat alanı (132 x 100 m: 100 x 64 saha ve tribün payı), Merkez Meydanı ve The Imperial
    sahanlığı yola kapalı; yollar etraflarından geçer.
  - Dere üstünde kısa köprü; köprüde zemin oyulmaz.

Zemin dosyası bir kez düzlenir: başlığa "yolYatagi" yazılır. Yeniden üretmek için önce
python gen/kompakt_zemin.py, sonra python gen/kompakt_yollar.py.
Denetim: python gen/kompakt_yollar_denetim.py
"""
import gzip, heapq, json, math, os, struct, sys

import numpy as np
from matplotlib.path import Path
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box, shape
from shapely.ops import linemerge, split, unary_union
from shapely import affinity
from shapely.strtree import STRtree

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
from kompakt_zemin_denetim import oku  # noqa: E402

IZGARA = os.path.join(KOK, "public", "harita", "duzada-zemin.bin")
SINIR = os.path.join(KOK, "public", "harita", "duzada-sinirlar.geojson")
CIKTI = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")

B, HAM = oku(IZGARA)
if B.get("yolYatagi"):
    sys.exit("Zemin dosyasında yol yatağı zaten açılmış. Önce: python gen/kompakt_zemin.py")
H = B["hucre"]
Z0 = HAM.astype(float) * B["birim"]          # 1. adımın zemini (değişmez kopya)
Z = Z0.copy()                                # yol yatağı bunun üstüne açılır
BOY, EN = Z.shape
X0, Y0 = B["x0"], B["y0"]
GX, GY = np.meshgrid(X0 + np.arange(EN) * H, Y0 + np.arange(BOY) * H)


def m(p):
    return ((p[0] - B["lng0"]) * B["mPerLng"], (p[1] - B["lat0"]) * B["mPerLat"])


def ll(x, y):
    return [round(B["lng0"] + x / B["mPerLng"], 6), round(B["lat0"] + y / B["mPerLat"], 6)]


def kucult(x, y):
    """Eski haritadaki (bugünkü) bir metre noktasını kompakt adaya taşır (1. adımın küçültmesi)."""
    ox, oy = B["odak"]
    return (ox + B["olcek"] * (x - ox), oy + B["olcek"] * (y - oy))


def geom_m(g):
    g = shape(g)
    from shapely.ops import transform  # noqa
    return transform(lambda x, y, z=None: ((np.asarray(x) - B["lng0"]) * B["mPerLng"],
                                          (np.asarray(y) - B["lat0"]) * B["mPerLat"]), g)


GEO = json.load(open(SINIR, encoding="utf-8"))
F = [f for f in GEO["features"]]
ADA = geom_m(next(f["geometry"] for f in F if f["properties"]["katman"] == "ada"))
MAHALLE = {f["properties"]["id"]: geom_m(f["geometry"]) for f in F if f["properties"]["katman"] == "mahalle"}
DERELER = [geom_m(f["geometry"]) for f in F if f["properties"]["katman"] == "dere"]
YERLESIM = {f["properties"]["id"]: dict(f["properties"], xy=m(f["geometry"]["coordinates"]))
            for f in F if f["properties"]["katman"] == "yerlesim"}
ZIRVE = {f["properties"]["id"]: dict(f["properties"], xy=m(f["geometry"]["coordinates"]))
         for f in F if f["properties"]["katman"] == "zirve"}
IMP = {f["properties"]["tur"]: f for f in F if f["properties"]["katman"] == "imperial"}
SAHANLIK = geom_m(IMP["sahanlik"]["geometry"])
OTEL = geom_m(IMP["otel"]["geometry"])
MERDIVEN = geom_m(IMP["merdiven-hatti"]["geometry"])
IMP_ALAN = geom_m(IMP["alan"]["geometry"])

# Vikideki maddeler (Kems Ajans kkm/viki.json, 16 Kasım dökümü)
VIKI = {"Sahil Yolu": "cadde_1791406296377_5m88t", "Kemsköy Caddesi": "madde_1791396448239",
        "Otel Yolu": "cadde_1791406296024_l9bag", "Sahil Merdiveni": "cadde_1791406295594_kccg1",
        "Merkez Meydanı": "meydan_1791406291222_rjnix"}
GENISLIK = {"ana": 8.0, "sokak": 6.0, "toprak": 4.0, "patika": 1.5, "merdiven": 2.5}
EGIM = {"ana": 0.10, "sokak": 0.15, "toprak": 0.15, "patika": 0.45}

# ------------------------------------------------------------------ korunan alanlar
# Dirlik Stadı: eski haritadaki düzlüğün (gen/duzlukler.json) küçültülmüş yeri; ölçü aynı.
_st = json.load(open(os.path.join(BURASI, "duzlukler.json"), encoding="utf-8"))[0]
STAT_XY = kucult(_st["x"], _st["y"])
STAT = affinity.rotate(box(STAT_XY[0] + _st["ileri_min"], STAT_XY[1] - _st["yan_yari"],
                           STAT_XY[0] + _st["ileri_max"], STAT_XY[1] + _st["yan_yari"]),
                       _st["yon"], origin=STAT_XY)
# Merkez Meydanı: eski meydanın küçültülmüş yeri (duzada.py → MERKEZ_MEYDANI), 60 x 60 m yer
MEYDAN_XY = kucult(1430.0, 1010.0)
MEYDAN_YARI = 30.0

KARA = Path(np.asarray(ADA.exterior.coords)).contains_points(
    np.column_stack([GX.ravel(), GY.ravel()])).reshape(Z.shape)
D_KARA = ndimage.distance_transform_edt(KARA) * H


def maske(g, pay=0.0):
    g = g.buffer(pay) if pay else g
    x0, y0, x1, y1 = g.bounds
    i0, i1 = max(0, int((x0 - X0) / H) - 1), min(EN, int((x1 - X0) / H) + 2)
    j0, j1 = max(0, int((y0 - Y0) / H) - 1), min(BOY, int((y1 - Y0) / H) + 2)
    out = np.zeros(Z.shape, bool)
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    xy = np.column_stack([GX[j0:j1, i0:i1].ravel(), GY[j0:j1, i0:i1].ravel()])
    for p in polys:
        out[j0:j1, i0:i1] |= Path(np.asarray(p.exterior.coords)).contains_points(xy).reshape(j1 - j0, i1 - i0)
    return out


def cizgi_maske(hatlar, kalinlik=1):
    out = np.zeros(Z.shape, bool)
    for h_ in hatlar:
        L = h_.length
        for t in np.arange(0, L + 2, 2.0):
            p = h_.interpolate(min(t, L))
            i, j = int(round((p.x - X0) / H)), int(round((p.y - Y0) / H))
            if 0 <= i < EN and 0 <= j < BOY:
                out[j, i] = True
    return ndimage.binary_dilation(out, iterations=kalinlik - 1) if kalinlik > 1 else out


MEYDAN = affinity.rotate(box(MEYDAN_XY[0] - MEYDAN_YARI, MEYDAN_XY[1] - MEYDAN_YARI,
                             MEYDAN_XY[0] + MEYDAN_YARI, MEYDAN_XY[1] + MEYDAN_YARI), 0, origin=MEYDAN_XY)
DERE_M = cizgi_maske(DERELER, 2)
# Yol araması için zemin: dar dere yatakları kapatılır (köprüyle geçilecek), hafif yumuşatılır
ZR = ndimage.gaussian_filter(ndimage.grey_closing(Z, size=(5, 5)), 1.0)
YASAK_TEMEL = (D_KARA < 22) | maske(STAT, 6) | maske(OTEL, 8) | maske(SAHANLIK, 4)
# yan yamaç cezası: yol dik yamaca oturursa büyük kazı / dolgu ister; aramada pahalıdır
_yan = ndimage.maximum_filter(np.hypot(*np.gradient(ndimage.gaussian_filter(Z, 1.0), H)), size=3)
YAN_CEZA = 1.0 + 6.0 * np.clip(_yan - 0.18, 0, None) + 3.0 * np.clip((40.0 - D_KARA) / 18.0, 0, 1)


def ornek(Zm, x, y):
    tek = np.ndim(x) == 0
    x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
    v = ndimage.map_coordinates(Zm, [(y - Y0) / H, (x - X0) / H], order=1, mode="nearest")
    return float(v[0]) if tek else v


# ------------------------------------------------------------------ eğim bilen yol araması
KOMSU = [(di, dj, H * math.hypot(di, dj)) for di in range(-2, 3) for dj in range(-2, 3)
         if (di or dj) and math.gcd(abs(di), abs(dj)) == 1]


def yol_ara(bas, hedef, sinir, carpan=None, yasak=None, pay=700.0, agirlik=1.2, dere_ceza=60.0):
    """bas noktasından hedef hücre kümesine eğim sınırını aşmayan en ucuz yol (A*).
    Döner: metre noktaları listesi (bas'tan hedefe) ya da None."""
    yasak = YASAK_TEMEL if yasak is None else yasak
    uz = ndimage.distance_transform_edt(~hedef) * H
    bi, bj = int(round((bas[0] - X0) / H)), int(round((bas[1] - Y0) / H))
    d = uz[bj, bi] + pay
    i0, i1 = max(0, int(bi - d / H)), min(EN, int(bi + d / H) + 1)
    j0, j1 = max(0, int(bj - d / H)), min(BOY, int(bj + d / H) + 1)
    W, Hh = i1 - i0, j1 - j0
    sl = (slice(j0, j1), slice(i0, i1))
    zl = ZR[sl].ravel().tolist()
    cl = (YAN_CEZA[sl] * (1.0 if carpan is None else carpan[sl])).ravel().tolist()
    yl = yasak[sl].ravel().tolist()
    hl = (uz[sl] * agirlik).ravel().tolist()
    gl = hedef[sl].ravel().tolist()
    dl = DERE_M[sl].ravel().tolist()
    nb = [(di, dj, L, dj * W + di) for di, dj, L in KOMSU]
    g = [math.inf] * (W * Hh)
    par = [-1] * (W * Hh)
    kapali = bytearray(W * Hh)
    k0 = (bj - j0) * W + (bi - i0)
    g[k0] = 0.0
    yig = [(hl[k0], k0)]
    son = -1
    while yig:
        _, k = heapq.heappop(yig)
        if kapali[k]:
            continue
        kapali[k] = 1
        if gl[k]:
            son = k
            break
        j, i = divmod(k, W)
        zk, gk, ck = zl[k], g[k], cl[k]
        for di, dj, L, kd in nb:
            ii, jj = i + di, j + dj
            if ii < 0 or ii >= W or jj < 0 or jj >= Hh:
                continue
            n = k + kd
            if kapali[n] or (yl[n] and not gl[n]):
                continue
            gr = abs(zl[n] - zk) / L
            if gr > sinir:
                continue
            t = gr / sinir
            c = gk + L * 0.5 * (ck + cl[n]) * (1 + 2.0 * t * t)
            if dl[n] and not dl[k]:
                c += dere_ceza
            if c < g[n]:
                g[n] = c
                par[n] = k
                heapq.heappush(yig, (c + hl[n], n))
    if son < 0:
        return None
    yol = []
    k = son
    while k >= 0:
        j, i = divmod(k, W)
        yol.append((X0 + (i + i0) * H, Y0 + (j + j0) * H))
        k = par[k]
    yol.reverse()
    yol[0] = tuple(bas)
    return yol


def yumusat(pts, kapali=False, tur=3, sade=6.0):
    """Izgara basamaklarını yumuşat: sadeleştir, sonra köşe kesme (Chaikin)."""
    if len(pts) < 3:
        return list(pts)
    L = LineString(pts).simplify(sade)
    p = np.asarray(L.coords)
    for _ in range(tur):
        if kapali:
            q = np.roll(p, -1, axis=0)
            p = np.vstack([np.column_stack([0.75 * p + 0.25 * q]), np.column_stack([0.25 * p + 0.75 * q])])
            p = p.reshape(2, -1, 2).transpose(1, 0, 2).reshape(-1, 2)
        else:
            a, c = p[:-1], p[1:]
            ic = np.empty((2 * len(a), 2))
            ic[0::2] = 0.75 * a + 0.25 * c
            ic[1::2] = 0.25 * a + 0.75 * c
            p = np.vstack([p[:1], ic, p[-1:]])
    return [tuple(x) for x in p]


# ------------------------------------------------------------------ yol listesi
YOLLAR = []          # dict: geom (LineString, metre), tur, ad, vikiId, genislik, cikmaz (bas, son), grup


def ekle(geom, tur, ad=None, cikmaz=(False, False), grup=None, genislik=None):
    YOLLAR.append(dict(geom=geom, tur=tur, ad=ad, vikiId=VIKI.get(ad), cikmaz=cikmaz, grup=grup,
                       genislik=genislik or GENISLIK[tur]))
    return YOLLAR[-1]


SOKAK_KENAR = []   # köy kafeslerinin kenarları: dict(geom, koy, aile, sira)
HALKA = []         # stat çevresi halka sokak kenarları (budanmaz)


def tum_hatlar(turler=None):
    hat = [y["geom"] for y in YOLLAR if turler is None or y["tur"] in turler]
    if turler is None or "sokak" in turler:
        hat += [k["geom"] for k in SOKAK_KENAR] + HALKA
    return hat


def ag_maske(turler=None):
    return cizgi_maske(tum_hatlar(turler), 1)


def ucu_aga_bagla(pts, turler=None):
    """Son nokta ağdaki en yakın çizginin (köy kafesinde en yakın düğümün) üstüne oturur."""
    son = Point(pts[-1])
    adaylar = []
    for g in tum_hatlar(turler):
        q = g.interpolate(g.project(son))
        adaylar.append((son.distance(q), (q.x, q.y)))
    for k in SOKAK_KENAR:
        for c in (k["geom"].coords[0], k["geom"].coords[-1]):
            adaylar.append((son.distance(Point(c)) - 6.0, c))   # düğüm yakınsa düğüme
    if not adaylar:
        return pts
    return list(pts[:-1]) + [min(adaylar)[1]]


def baglanti(bas, hedef_maske, tur, ad=None, carpan=None, yasak=None, pay=900.0, ters=False, cikmaz=(False, False)):
    yol = yol_ara(bas, hedef_maske, EGIM[tur], carpan=carpan, yasak=yasak, pay=pay)
    if yol is None:
        print(f"  UYARI: yol bulunamadı ({ad or tur}, {bas[0]:.0f},{bas[1]:.0f})")
        return None
    yol = yumusat(yol, tur=2, sade=3.5)
    yol = ucu_aga_bagla(yol)
    if ters:
        yol = yol[::-1]
    return ekle(LineString(yol), tur, ad, cikmaz=cikmaz)


def disk(xy, r):
    return np.hypot(GX - xy[0], GY - xy[1]) <= r


# ================================================================== 1. Sahil Yolu
print("Sahil Yolu ...")
kiyi = ADA.exterior
KOY_KIYI = ["yerlesim_liman", "yerlesim_iskele", "yerlesim_stadyum_kiyi"]
duraklar = []   # (kıyı boyu konumu, nokta)
eg = ndimage.maximum_filter(np.hypot(*np.gradient(ZR, H)), size=5)
bant = (D_KARA >= 70) & (D_KARA <= 280) & KARA & ~YASAK_TEMEL & (eg < 0.09)
bant_xy = np.column_stack([GX[bant], GY[bant]])
bant_agac = cKDTree(bant_xy)
ADIM = 1100.0
for s in np.arange(0, kiyi.length, ADIM):
    p = kiyi.interpolate(s)
    idx = bant_agac.query_ball_point((p.x, p.y), 380)
    if not idx:
        continue
    adaylar = bant_xy[idx]
    puan = (np.hypot(adaylar[:, 0] - p.x, adaylar[:, 1] - p.y) + 1500 * ornek(eg, adaylar[:, 0], adaylar[:, 1])
            + 1.5 * np.abs(ornek(D_KARA, adaylar[:, 0], adaylar[:, 1]) - 140))
    q = adaylar[int(np.argmin(puan))]
    duraklar.append((s, tuple(q)))
for yid in KOY_KIYI:
    q = YERLESIM[yid]["xy"]
    s = kiyi.project(Point(q))
    duraklar = [d_ for d_ in duraklar if min(abs(d_[0] - s), kiyi.length - abs(d_[0] - s)) > 650]
    duraklar.append((s, q))
duraklar.sort()
_imp = Point(OTEL.centroid)
carpan_sahil = np.where(D_KARA > 160, 1 + ((D_KARA - 160) / 140) ** 2,
                        np.where(D_KARA < 70, 1 + ((70 - D_KARA) / 20) ** 2, 1.0))
carpan_sahil = carpan_sahil * np.where(np.hypot(GX - _imp.x, GY - _imp.y) < 230, 4.0, 1.0)
kullanilan = np.zeros(Z.shape, bool)
halka = []
nok = [d_[1] for d_ in duraklar]
i = 0
atlanan = 0
while i < len(nok):
    a = nok[i]
    hedef_i = (i + 1) % len(nok)
    yol = None
    for dene in range(3):
        b_ = nok[(i + 1 + dene) % len(nok)]
        c_ = carpan_sahil * np.where(kullanilan & ~disk(a, 60) & ~disk(b_, 60), 8.0, 1.0)
        yol = yol_ara(a, disk(b_, 12), EGIM["ana"], carpan=c_, pay=600)
        if yol is not None:
            atlanan += dene
            break
    if yol is None:
        sys.exit(f"HATA: Sahil Yolu {a} noktasından ilerleyemedi")
    yol[-1] = b_
    halka.extend(yol[:-1])
    kullanilan |= cizgi_maske([LineString(yol)], 3)
    i += 1 + dene
    if (i + 0) >= len(nok) and (i % len(nok)) != 0:
        pass
halka = yumusat(halka, kapali=True, tur=2, sade=3.5)
SAHIL = LineString(halka + [halka[0]])
if not SAHIL.is_simple:
    # kendi üstüne dönen küçük ilmekleri ayıkla: halkanın çokgen dış sınırını al
    SAHIL = Polygon(SAHIL.coords).buffer(0)
    SAHIL = max(SAHIL.geoms, key=lambda g: g.area) if SAHIL.geom_type == "MultiPolygon" else SAHIL
    SAHIL = LineString(SAHIL.exterior.coords)
print(f"  {len(nok)} durak, {atlanan} atlandı, uzunluk {SAHIL.length / 1000:.1f} km, basit: {SAHIL.is_simple}")
ekle(SAHIL, "ana", "Sahil Yolu", genislik=9.0)

# ================================================================== 2. köy dokuları
print("Köy dokuları ...")
IZIN = ADA.buffer(-24).difference(STAT.buffer(10)).difference(MEYDAN.buffer(1)).difference(
    SAHANLIK.buffer(15)).difference(OTEL.buffer(15))


def kontur_acisi(xy):
    Zs = ndimage.gaussian_filter(Z0, 15)
    gy_, gx_ = np.gradient(Zs, H)
    gx, gy = float(ornek(gx_, *xy)), float(ornek(gy_, *xy))
    return math.degrees(math.atan2(gx, -gy))     # eş yükselti yönü (eğime dik)


def en_buyuk_egim(geom, Zm=None, pencere=20.0):
    Zm = ZR if Zm is None else Zm
    L = geom.length
    if L < 1:
        return 0.0
    s = np.arange(0, L + 0.01, 5.0)
    p = np.array([geom.interpolate(t).coords[0] for t in s])
    z = ornek(Zm, p[:, 0], p[:, 1])
    k = max(1, int(pencere / 5))
    if len(z) <= k:
        return abs(z[-1] - z[0]) / max(L, 1)
    return float(np.max(np.abs(z[k:] - z[:-k]) / (s[k:] - s[:-k])))


def kafes(merkez, r, aci, ara_kos=60.0, ara_dik=120.0, kay=(0.0, 0.0), capraz=90.0):
    """Merkez çevresinde düzenli sokak kafesi: eş yükselti yönünde (u) koşut sokaklar,
    onları kesen sokaklar. Yamaç dikse kesen sokaklar dik değil, eğik açıyla (capraz, derece)
    iner: eğim sınırı aşılmaz, adalar paralelkenar olur. Döner: [(LineString, aile, sıra)]."""
    a = math.radians(aci)
    u = np.array([math.cos(a), math.sin(a)])
    v = np.array([-math.sin(a), math.cos(a)])
    kot = 1.0 / math.tan(math.radians(capraz))
    c0 = np.asarray(merkez)
    kenarlar = []
    nu, nv = int(r // ara_dik) + 2, int(r // ara_kos) + 2
    ku = kay[0] + ara_dik * np.arange(-nu, nu + 1)
    kv = kay[1] + ara_kos * np.arange(-nv, nv + 1)
    def dugum(iu, jv):
        return tuple(c0 + (ku[iu] + kv[jv] * kot) * u + kv[jv] * v)
    for jv in range(len(kv)):             # koşut sokaklar
        for iu in range(len(ku) - 1):
            kenarlar.append((LineString([dugum(iu, jv), dugum(iu + 1, jv)]), "kos", jv))
    for iu in range(len(ku)):             # kesen sokaklar
        for jv in range(len(kv) - 1):
            kenarlar.append((LineString([dugum(iu, jv), dugum(iu, jv + 1)]), "dik", iu))
    return kenarlar


def capraz_yakin(g, mevcut, esik=14.0, oran=0.55):
    """Yeni kenar mevcut bir yolun üstüne biniyor mu (uzunluğunun yarısından çoğu yakınında)."""
    for h_ in mevcut:
        if g.distance(h_) < esik and g.intersection(h_.buffer(esik)).length > oran * g.length:
            return True
    return False


KOY_PARAM = {
    "yerlesim_merkez": dict(merkez=MEYDAN_XY, kay=(MEYDAN_YARI, MEYDAN_YARI), ara_dik=60.0),
    "yerlesim_liman": {}, "yerlesim_iskele": {}, "yerlesim_stadyum": {},
    "yerlesim_stadyum_kiyi": dict(ara_dik=90.0), "yerlesim_ciftlik": {},
}
for yid, prm in KOY_PARAM.items():
    y = YERLESIM[yid]
    mz = prm.get("merkez", y["xy"])
    aci = prm.get("aci", kontur_acisi(mz))
    if yid == "yerlesim_merkez":
        aci = round(aci / 90.0) * 90.0 if False else aci
        MEYDAN = affinity.rotate(box(MEYDAN_XY[0] - MEYDAN_YARI, MEYDAN_XY[1] - MEYDAN_YARI,
                                     MEYDAN_XY[0] + MEYDAN_YARI, MEYDAN_XY[1] + MEYDAN_YARI), aci, origin=MEYDAN_XY)
        IZIN = IZIN.union(MEYDAN.buffer(3)).difference(MEYDAN.buffer(-0.5))
    if yid == "yerlesim_stadyum":
        c_ = list(STAT.buffer(14, join_style=2).exterior.coords)
        for a_, b_ in zip(c_[:-1], c_[1:]):
            e = LineString([a_, b_])
            if en_buyuk_egim(e) <= EGIM["sokak"]:
                HALKA.append(e)
    r = y["yaricapM"] * 1.05
    cember = Point(mz).buffer(r)
    alan = IZIN.intersection(cember)
    mevcut = [k["geom"] for k in YOLLAR] + HALKA
    Gs = ndimage.gaussian_filter(Z0, 12)
    G = float(np.hypot(*[ornek(g_, *mz) for g_ in np.gradient(Gs, H)]))
    capraz = 90.0 if (G <= 0.11 or yid == "yerlesim_merkez") else max(40.0, math.degrees(math.asin(min(1.0, 0.135 / G))))
    print(f"  {yid}: yamaç %{100 * G:.0f}, kesen sokak açısı {capraz:.0f}°")
    for g, aile, sira in kafes(mz, r, aci, prm.get("ara_kos", 60.0), prm.get("ara_dik", 120.0), prm.get("kay", (0.0, 0.0)), capraz):
        if not g.intersects(cember):
            continue
        parca = g.intersection(alan)
        parcalar = [parca] if parca.geom_type == "LineString" else [p for p in getattr(parca, "geoms", []) if p.geom_type == "LineString"]
        for p in parcalar:
            if p.length < 25 or capraz_yakin(p, mevcut):
                continue
            if en_buyuk_egim(p) > 0.9 * EGIM["sokak"]:     # kavşakta kota uymak için pay
                continue
            q = np.array([p.interpolate(t).coords[0] for t in np.arange(0, p.length, 5.0)])
            if (ornek(ZR, q[:, 0], q[:, 1]) - ornek(Z0, q[:, 0], q[:, 1])).max() > 2.5:
                continue        # dar bir vadiyi kesiyor: dolgu gerekir, sokak açılmaz
            SOKAK_KENAR.append(dict(geom=p, koy=yid, aile=aile, sira=sira))
# Ana yollarla ve stat halkasıyla kesişen kenarlar kesişimde bölünür
ana_birlesik = unary_union([y["geom"] for y in YOLLAR] + HALKA)
yeni = []
for k in SOKAK_KENAR:
    if k["geom"].intersects(ana_birlesik):
        for p in split(k["geom"], ana_birlesik).geoms:
            if p.length > 3:
                yeni.append(dict(k, geom=p))
    else:
        yeni.append(k)
SOKAK_KENAR = yeni


def anahtar(p):
    return (round(p[0], 1), round(p[1], 1))


def budama(kenarlar, capalar):
    """Çıkmaz sokak kalmasın: ucu hiçbir yere değmeyen kenar (bir ucu boşta) tekrar tekrar silinir.
    capalar: budanmayan çizgiler (ana yollar)."""
    agac = STRtree(capalar) if capalar else None
    while True:
        derece = {}
        for k in kenarlar:
            c = k["geom"].coords
            for p in (c[0], c[-1]):
                derece[anahtar(p)] = derece.get(anahtar(p), 0) + 1
        kalan = []
        for k in kenarlar:
            c = k["geom"].coords
            iyi = True
            for p in (c[0], c[-1]):
                if derece[anahtar(p)] >= 2:
                    continue
                if agac is not None and len(agac.query(Point(p), predicate="dwithin", distance=0.05)):
                    continue
                iyi = False
            if iyi:
                kalan.append(k)
        if len(kalan) == len(kenarlar):
            return kalan
        kenarlar = kalan


SOKAK_KENAR = budama(SOKAK_KENAR, [y["geom"] for y in YOLLAR] + HALKA)
print(f"  sokak kenarı: {len(SOKAK_KENAR)}")


def koy_dugumleri(yid):
    pts = set()
    for k in SOKAK_KENAR:
        if k["koy"] == yid:
            c = k["geom"].coords
            pts.add(c[0]); pts.add(c[-1])
    return list(pts)


def nokta_maske(pts):
    out = np.zeros(Z.shape, bool)
    for p in pts:
        i, j = int(round((p[0] - X0) / H)), int(round((p[1] - Y0) / H))
        if 0 <= i < EN and 0 <= j < BOY:
            out[j, i] = True
    return out


# ================================================================== 3. bağlantılar
print("Bağlantılar ...")


def koye_en_yakin(yid, hedef_xy):
    d = koy_dugumleri(yid)
    if not d:
        return YERLESIM[yid]["xy"]
    return min(d, key=lambda p: math.hypot(p[0] - hedef_xy[0], p[1] - hedef_xy[1]))


def koy_hedef(yid):
    return nokta_maske(koy_dugumleri(yid)) | ag_maske(turler={"ana"}) & disk(YERLESIM[yid]["xy"], YERLESIM[yid]["yaricapM"])


SAHIL_M = cizgi_maske([SAHIL], 1)
MZ = YERLESIM["yerlesim_merkez"]["xy"]


def sahil_parca(xy, r):
    return SAHIL_M & disk(xy, r)


def bagla_koy_dugum(yol_kaydi):
    """Yolun ilk noktası köy düğümüne değiyorsa olduğu gibi kalır (yol_ara başlangıcı düğümdür)."""
    return yol_kaydi


# Merkez Bağlantısı: Merkez'den güneydoğuda Sahil Yolu'na (eski güzergâhın küçültülmüş ucu)
uc = kucult(3595.0, -3444.0)
baglanti(koye_en_yakin("yerlesim_merkez", uc), sahil_parca(uc, 1500), "ana", "Merkez Bağlantısı", pay=1500)
# Çetmi Sırtı Yolu: Merkez'den doğuya, Sahil Yolu'na (eski ucu)
uc = kucult(7165.0, 672.0)
baglanti(koye_en_yakin("yerlesim_merkez", uc), sahil_parca(uc, 1600), "ana", "Çetmi Sırtı Yolu", pay=1500)
# Güney Sırt Yolu: İskele'den Merkez'e (eski hat batı uçtan doğuya adanın sırtını geçiyordu)
baglanti(koye_en_yakin("yerlesim_iskele", MZ), koy_hedef("yerlesim_merkez") | ag_maske(turler={"ana"}) & disk(MZ, 900),
         "ana", "Güney Sırt Yolu", pay=1500)
# Stadyum Bağlantısı: stat çevresinden kıyı köyüne (Kuzey Plajı, Taraftar Birahanesi)
ky = YERLESIM["yerlesim_stadyum_kiyi"]["xy"]
baglanti(koye_en_yakin("yerlesim_stadyum", ky), koy_hedef("yerlesim_stadyum_kiyi") | sahil_parca(ky, 250),
         "ana", "Stadyum Bağlantısı", pay=1200)
# Çiftlik Bağlantısı: Çiftlik köyünden en yakın Sahil Yolu'na
cf = YERLESIM["yerlesim_ciftlik"]["xy"]
baglanti(koye_en_yakin("yerlesim_ciftlik", kiyi.interpolate(kiyi.project(Point(cf))).coords[0]),
         SAHIL_M | ag_maske(turler={"ana"}) & ~disk(cf, YERLESIM["yerlesim_ciftlik"]["yaricapM"] * 1.1),
         "ana", "Çiftlik Bağlantısı", pay=1500)
# Adsız bağlantılar: Stadyum ve Liman köyleri Merkez'e
for yid in ("yerlesim_stadyum", "yerlesim_liman"):
    baglanti(koye_en_yakin(yid, MZ), koy_hedef("yerlesim_merkez") | (ag_maske(turler={"ana"}) & ~SAHIL_M & disk(MZ, 1500)),
             "ana", None, pay=1500)
# Köy kafesleri ana ağa değmiyorsa en yakın ana yola bağlanır
for yid in KOY_PARAM:
    dug = koy_dugumleri(yid)
    if not dug:
        continue
    ana = unary_union([y["geom"] for y in YOLLAR if y["tur"] == "ana"])
    if min(ana.distance(Point(p)) for p in dug) > 0.1:
        p = min(dug, key=lambda q: ana.distance(Point(q)))
        baglanti(p, ag_maske(turler={"ana"}), "sokak", None, pay=800)

# Merkez Dağ Yolu: Merkez'den Kuzey Sırtı'na doğru, patikanın başladığı yere (asfalt)
kz = ZIRVE["tepe_kuzey"]["xy"]
bas_n = (MZ[0] + 0.45 * (kz[0] - MZ[0]), MZ[1] + 0.45 * (kz[1] - MZ[1]))
dag = baglanti(bas_n, koy_hedef("yerlesim_merkez") | ag_maske(turler={"ana"}), "ana", "Merkez Dağ Yolu",
               pay=1000, ters=True)
# Kuzey Sırtı Yolu: patika (viki: "Patikayla çıkılır")
ks = baglanti(kz, disk(dag["geom"].coords[-1], 12) if dag else ag_maske(), "patika", "Kuzey Sırtı Yolu",
              yasak=(D_KARA < 15), pay=900, ters=True, cikmaz=(False, True))
if ks and dag:
    ks["geom"] = LineString([dag["geom"].coords[-1]] + list(ks["geom"].coords)[1:])

# ================================================================== 4. The Imperial
print("The Imperial ...")
# Otel Yolu: sahanlığın kara yanındaki kenarından ağa (≤ %10)
isk = YERLESIM["yerlesim_iskele"]["xy"]
kenar = SAHANLIK.exterior
s_bas = kenar.interpolate(kenar.project(Point(isk)))
yasak_otel = (D_KARA < 15) | maske(STAT, 6) | maske(OTEL, 6)
otel = baglanti((s_bas.x, s_bas.y), ag_maske(turler={"ana", "sokak"}) & ~maske(IMP_ALAN.buffer(-60)),
                "ana", "Otel Yolu", yasak=yasak_otel, pay=900, ters=True, cikmaz=(False, False))
# Sahil Merdiveni: 1. adımın merdiven hattı aynen (sahanlıktan dip terasa)
ekle(MERDIVEN, "merdiven", "Sahil Merdiveni", cikmaz=(False, True))

# ================================================================== 5. patikalar ve tarla yolları
print("Patika ve tarla yolları ...")
# Fener Patikası: Fener Burnu'na
fb = ZIRVE["tepe_bati"]["xy"]
baglanti(fb, ag_maske(turler={"ana", "sokak"}), "patika", "Fener Patikası", yasak=(D_KARA < 10), pay=900,
         ters=True, cikmaz=(False, True))
# Çiftlik tarla yolları (toprak): köyün dış düğümlerinden tarlalara, yokuşsuz
cf_m = MAHALLE["yer_ciftlik"].buffer(-60)
egt = ndimage.maximum_filter(np.hypot(*np.gradient(ZR, H)), size=5)
aday = KARA & (D_KARA > 90) & (egt < 0.18) & maske(cf_m) & ~disk(cf, 450) & disk(cf, 1400)
aday &= ndimage.distance_transform_edt(~ag_maske()) * H > 200
print(f"  tarla yolu adayı: {int(aday.sum())} hücre")
axy = np.column_stack([GX[aday], GY[aday]])
rng = np.random.default_rng(3)
tarla = 0
for k in rng.permutation(len(axy))[:400]:
    if tarla >= 5:
        break
    hd = tuple(axy[k])
    if (ndimage.distance_transform_edt(~ag_maske()) * H)[int(round((hd[1] - Y0) / H)), int(round((hd[0] - X0) / H))] < 200:
        continue
    yol = yol_ara(hd, ag_maske(), EGIM["toprak"], pay=500)
    if yol is None:
        continue
    yol = ucu_aga_bagla(yumusat(yol, sade=6.0))[::-1]
    g = LineString(yol)
    if g.length < 200 or g.length > 1200 or capraz_yakin(g, tum_hatlar(), 20, 0.3):
        print(f"    tarla yolu elendi: {g.length:.0f} m")
        continue
    ekle(g, "toprak", None, cikmaz=(False, True))
    tarla += 1
print(f"  tarla yolu: {tarla}")

# ================================================================== 6. sokak kenarlarını yollara çevir
# Aynı sıradaki kenarlar birleşir (bir sokak bir kayıt)
gruplar = {}
for k in SOKAK_KENAR:
    gruplar.setdefault((k["koy"], k["aile"], k["sira"]), []).append(k["geom"])
SOKAKLAR = []
for i_, g in enumerate(HALKA):
    gruplar[("yerlesim_stadyum", "halka", i_)] = [g]
for (koy, aile, sira), gs in gruplar.items():
    mg = linemerge(MultiLineString(gs)) if len(gs) > 1 else gs[0]
    for g in ([mg] if mg.geom_type == "LineString" else list(mg.geoms)):
        SOKAKLAR.append(dict(geom=g, koy=koy, aile=aile, sira=sira))


def adlandir(yid, ad, aile, kiyiya=False):
    """Köyün en uzun koşut sokağı (merkeze yakın; Liman'da kıyıya en yakın) adlı caddeye döner."""
    ad_adaylar = [s for s in SOKAKLAR if s["koy"] == yid and s["aile"] == aile and s["geom"].length > 200
                  and en_buyuk_egim(s["geom"]) <= EGIM["ana"]]
    if not ad_adaylar:
        print(f"  UYARI: {ad} için uygun sokak yok")
        return None
    c = Point(YERLESIM[yid]["xy"])
    if kiyiya:
        s = min(ad_adaylar, key=lambda s: kiyi.distance(s["geom"]) - 0.2 * s["geom"].length)
    else:
        s = min(ad_adaylar, key=lambda s: s["geom"].distance(c) - 0.3 * s["geom"].length)
    s["ad"] = ad
    return s


adlandir("yerlesim_iskele", "Kemsköy Caddesi", "kos")
lc = adlandir("yerlesim_liman", "Liman Caddesi", "kos", kiyiya=True)
if lc is not None:
    # Liman Bağlantısı: Liman Caddesi'ni Sahil Yolu'na bağlayan, merkeze en yakın dik sokak
    adaylar = [s for s in SOKAKLAR if s["koy"] == "yerlesim_liman" and s["aile"] == "dik"
               and s["geom"].distance(lc["geom"]) < 0.5 and s["geom"].distance(SAHIL) < 0.5]
    if adaylar:
        s = min(adaylar, key=lambda s: s["geom"].distance(Point(YERLESIM["yerlesim_liman"]["xy"])))
        s["ad"] = "Liman Bağlantısı"
for s in SOKAKLAR:
    ad = s.get("ad")
    tur = "ana" if ad in ("Kemsköy Caddesi", "Liman Caddesi") else "sokak"
    if ad == "Liman Bağlantısı" and en_buyuk_egim(s["geom"]) <= EGIM["ana"]:
        tur = "ana"
    gen = {"Kemsköy Caddesi": 10.0, "Liman Caddesi": 10.0}.get(ad)
    ekle(s["geom"], tur, ad, grup=s["koy"], genislik=gen)

# ================================================================== 7. bağlılık: ağa değmeyen parçalar
def bilesenler():
    geoms = [y["geom"] for y in YOLLAR]
    agac = STRtree(geoms)
    ata = list(range(len(geoms)))

    def bul(a):
        while ata[a] != a:
            ata[a] = ata[ata[a]]
            a = ata[a]
        return a
    for i_, g in enumerate(geoms):
        for j_ in agac.query(g, predicate="dwithin", distance=0.5):
            ata[bul(i_)] = bul(int(j_))
    # sahanlık bir kavşak sayılır: içinde biten yollar birbirine bağlı
    ic = [i_ for i_, g in enumerate(geoms) if SAHANLIK.buffer(3).intersects(g)]
    for a_ in ic[1:]:
        ata[bul(a_)] = bul(ic[0])
    return [bul(i_) for i_ in range(len(geoms))]


kok = bilesenler()
ana_kok = kok[0]
atilan = [y for y, k_ in zip(YOLLAR, kok) if k_ != ana_kok]
if atilan:
    print(f"  ağa değmeyen {len(atilan)} parça atıldı ({sum(y['geom'].length for y in atilan):.0f} m)")
YOLLAR = [y for y, k_ in zip(YOLLAR, kok) if k_ == ana_kok]

# Boşta kalan sokak ucu (stat halkasının kopuk kenarı gibi) son kavşağa kadar kırpılır
from shapely.ops import substring  # noqa: E402
for _tur in range(6):
    degisti = False
    agac_ = STRtree([y["geom"] for y in YOLLAR])
    for i_, y in enumerate(YOLLAR):
        if y["tur"] != "sokak":
            continue
        g = y["geom"]
        komsu = [YOLLAR[int(j_)]["geom"] for j_ in agac_.query(g, predicate="dwithin", distance=0.3) if int(j_) != i_]
        boşta = [not any(k.distance(Point(c)) < 0.3 for k in komsu) for c in (g.coords[0], g.coords[-1])]
        if not any(boşta):
            continue
        kav = []
        for k in komsu:
            x_ = g.intersection(k.buffer(0.3))
            if not x_.is_empty:
                kav += [g.project(Point(c)) for gg in getattr(x_, "geoms", [x_]) for c in gg.coords]
        if not kav:
            y["sil"] = True
            degisti = True
            continue
        a_ = min(kav) if boşta[0] else 0.0
        b_ = max(kav) if boşta[1] else g.length
        if b_ - a_ < 20:
            y["sil"] = True
        else:
            y["geom"] = substring(g, a_, b_)
        degisti = True
    YOLLAR = [y for y in YOLLAR if not y.get("sil")]
    if not degisti:
        break

# ================================================================== 8. köprü, yol yatağı, yükseklik
print("Yol yatağı ...")
SIRA = {"ana": 0, "sokak": 1, "toprak": 2, "patika": 3, "merdiven": 4}
YOLLAR.sort(key=lambda y: (SIRA[y["tur"]], 0 if y["ad"] else 1, -y["geom"].length))
SAHIP = maske(SAHANLIK, 2) | maske(STAT) | maske(MEYDAN)   # bunlara dokunulmaz
CEKIRDEK = {"ana": 9.0, "sokak": 8.0, "toprak": 7.0}
KENAR = {"ana": 26.0, "sokak": 22.0, "toprak": 16.0}
KENAR_EN_COK = 60.0
KIYI_KORU = smooth_ = None
KIYI_KORU = np.clip((D_KARA - 8.0) / 30.0, 0, 1) ** 0.7  # kıyının 8 m içine dokunulmaz, sonra yavaş artar
CEKIRDEK_M = np.zeros(Z.shape, bool)
IMP_KORU = maske(IMP_ALAN)      # Imperial tepesinde yalnız yolun çekirdeği düzlenir


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def alt_zarf(z, ds, lim):
    """z'yi hiçbir yerde aşmayan, eğimi lim'i geçmeyen en yüksek profil (yol zemini kazar, doldurmaz)."""
    z = z.copy()
    for i_ in range(1, len(z)):
        z[i_] = min(z[i_], z[i_ - 1] + lim * ds[i_ - 1])
    for i_ in range(len(z) - 2, -1, -1):
        z[i_] = min(z[i_], z[i_ + 1] + lim * ds[i_])
    return z


def sinirla(z, ds, lim):
    zf = z.copy()
    for i_ in range(1, len(z)):
        zf[i_] = min(max(zf[i_], zf[i_ - 1] - lim * ds[i_ - 1]), zf[i_ - 1] + lim * ds[i_ - 1])
    zb = z.copy()
    for i_ in range(len(z) - 2, -1, -1):
        zb[i_] = min(max(zb[i_], zb[i_ + 1] - lim * ds[i_]), zb[i_ + 1] + lim * ds[i_])
    return 0.5 * (zf + zb)


# kavşak noktaları: başka bir yolun ucu bu yolun üstündeyse o nokta yolun köşesi olur
UCLAR = [(i_, c) for i_, y in enumerate(YOLLAR) for c in (y["geom"].coords[0], y["geom"].coords[-1])]
for i_, y in enumerate(YOLLAR):
    g = y["geom"]
    ek = [g.project(Point(c)) for j_, c in UCLAR if j_ != i_ and g.distance(Point(c)) < 0.3]
    L = g.length
    s = np.unique(np.r_[np.linspace(0, L, max(2, int(math.ceil(L / 2.0)) + 1)), ek])
    s = s[np.r_[True, np.diff(s) > 0.05]]
    y["s"], y["p"] = s, np.array([g.interpolate(t).coords[0] for t in s])
    y["tut"] = np.isin(s, ek) if ek else np.zeros(len(s), bool)

for y in YOLLAR:
    s, p = y["s"], y["p"]
    n = len(s)
    if y["tur"] in ("patika", "merdiven"):
        continue
    ds = np.diff(s)
    lim = EGIM[y["tur"]] * (0.85 if y["tur"] == "ana" else 0.97)
    zg = ornek(Z, p[:, 0], p[:, 1])
    zr = ornek(ZR, p[:, 0], p[:, 1])
    # köprü: dar vadi / dere (yol araması onu kapalı görür, gerçek zemin 3 m'den derin)
    zg0 = ornek(Z0, p[:, 0], p[:, 1])       # vadi, ilk zeminde ölçülür (başka yolun kazısı vadi sayılmaz)
    zrs = ndimage.gaussian_filter1d(np.maximum(zr, zg0), 4.0, mode="nearest")
    kop = zrs - zg0 > 3.0
    kop = ndimage.binary_dilation(kop, iterations=3) & ((zrs - zg0 > 0.8) | kop)
    destek = np.minimum(zg, ndimage.gaussian_filter1d(zg, 3.0, mode="nearest"))
    etk, say = ndimage.label(kop)
    for e in range(1, say + 1):
        ix = np.nonzero(etk == e)[0]
        a_, b_ = max(ix[0] - 1, 0), min(ix[-1] + 1, n - 1)
        destek[a_:b_ + 1] = np.interp(s[a_:b_ + 1], [s[a_], s[b_]], [destek[a_], destek[b_]])
    # profil: zemini izler, kazı ile dolguyu dengeler; dolgu en çok 1 m (set olup suyu tutmasın)
    zp = sinirla(ndimage.gaussian_filter1d(destek, 5.0, mode="nearest"), ds, lim)
    zp = alt_zarf(np.minimum(zp, destek + 1.0), ds, lim)
    # kavşak: önceki yolun düzlenmiş şeridine giren noktalar o kota bağlanır, fark 30 m'de söner
    ii_ = np.clip(np.round((p[:, 0] - X0) / H).astype(int), 0, EN - 1)
    jj_ = np.clip(np.round((p[:, 1] - Y0) / H).astype(int), 0, BOY - 1)
    pin = SAHIP[jj_, ii_] & ~kop
    if pin.any():
        pi_ = np.nonzero(pin)[0]
        en_yakin = pi_[np.clip(np.searchsorted(s[pi_], s), 0, len(pi_) - 1)]
        onceki = pi_[np.clip(np.searchsorted(s[pi_], s) - 1, 0, len(pi_) - 1)]
        en_yakin = np.where(np.abs(s[onceki] - s) < np.abs(s[en_yakin] - s), onceki, en_yakin)
        uz_ = np.abs(s[en_yakin] - s)
        zp = zp + (zg - zp)[en_yakin] * (1 - smooth(uz_ / 60.0))
        zp = sinirla(zp, ds, lim)
    y["zp"], y["kop0"] = zp, kop
    # zemini şerit içinde profile getir: çekirdek tam, kenar yumuşak; kenarın genişliği
    # yapılan kazı / dolgu kadar artar (şev 1'e 2,5'tan dik olmaz)
    r1, r2 = CEKIRDEK[y["tur"]], KENAR[y["tur"]]

    x0_, y0_ = p.min(0) - KENAR_EN_COK - H
    x1_, y1_ = p.max(0) + KENAR_EN_COK + H
    i0, i1 = max(0, int((x0_ - X0) / H)), min(EN, int((x1_ - X0) / H) + 2)
    j0, j1 = max(0, int((y0_ - Y0) / H)), min(BOY, int((y1_ - Y0) / H) + 2)
    idx_map = np.arange(n)
    xy = np.column_stack([GX[j0:j1, i0:i1].ravel(), GY[j0:j1, i0:i1].ravel()])
    dk, ik = cKDTree(p).query(xy, distance_upper_bound=KENAR_EN_COK)
    ic = np.isfinite(dk)
    Zs = Z[j0:j1, i0:i1].ravel()
    hedef = Zs.copy()
    hedef[ic] = zp[idx_map[ik[ic]]]
    # kenar genişliği: yolun o kesimindeki en büyük kazı kadar (şev 1'e 2,5)
    kazi = ndimage.maximum_filter1d(np.abs(zg - zp), size=21) + 0.5 * r1   # yan yamaç payı
    gen_ = np.full_like(Zs, r2 - r1)
    gen_[ic] = np.clip(np.maximum(r2 - r1, 2.5 * kazi[idx_map[ik[ic]]]), 0, KENAR_EN_COK - r1)
    w = np.zeros_like(Zs)
    w[ic] = 1 - smooth((dk[ic] - r1) / gen_[ic])
    # köprünün altı doldurulmaz (yalnız kazılır)
    yalniz_kazi = np.zeros_like(Zs, bool)
    yalniz_kazi[ic] = kop[ik[ic]]
    cek = np.zeros_like(Zs, bool)
    cek[ic] = dk[ic] <= r1
    w = np.where(cek, (D_KARA[j0:j1, i0:i1].ravel() > 8.0).astype(float), w * KIYI_KORU[j0:j1, i0:i1].ravel())
    w = np.where(IMP_KORU[j0:j1, i0:i1].ravel() & ~cek, 0.0, w)
    w = np.where(SAHIP[j0:j1, i0:i1].ravel(), 0.0, w)
    yeni_ = Zs * (1 - w) + hedef * w
    # çekirdekte zemin yol kotuna gelir; kenarda yalnız kazılır (dolgu set yapıp suyu tutmasın)
    Zs = np.where(yalniz_kazi, np.minimum(Zs, yeni_), yeni_)
    Z[j0:j1, i0:i1] = Zs.reshape(j1 - j0, i1 - i0)
    _c = ((w >= 0.999) & ~yalniz_kazi).reshape(j1 - j0, i1 - i0)
    SAHIP[j0:j1, i0:i1] |= _c
    CEKIRDEK_M[j0:j1, i0:i1] |= _c


# Şev yumuşatma: yolun çekirdeği dışında, düzlemenin bıraktığı 36°'den dik yerde değişim
# komşularına yayılır (yalnız değişen hücrelerde ve yakınında)
for _k in range(150):
    _e = np.degrees(np.arctan(np.hypot(*np.gradient(Z, H))))
    _deg = Z - Z0
    _kotu = (_e > 36.0) & KARA & ndimage.binary_dilation(np.abs(_deg) > 0.05, iterations=2)
    _kotu &= ~maske(IMP_ALAN) | (_e > 48.0)
    if not _kotu.any() or (_k > 20 and _kotu.sum() >= _onceki):
        break
    _onceki = _kotu.sum()
    _alan = ndimage.binary_dilation(_kotu, iterations=2) & ~CEKIRDEK_M & ~SAHIP & (D_KARA > 4) & KARA
    _yay = ndimage.uniform_filter(_deg, 3)
    _deg = np.where(_alan, _yay, _deg)
    Z = Z0 + _deg
print(f"  şev yumuşatma: {_k} tur")


def cukur_doldur(Zm):
    """Öncelikli taşma: her kara hücresinin suyunu denize taşıyacağı en düşük kot."""
    Fz = Zm.copy()
    islendi = ~KARA.copy()
    kk = KARA & ndimage.binary_dilation(~KARA, structure=np.ones((3, 3)))
    yig = [(Fz[j, i], j, i) for j, i in zip(*np.nonzero(kk))]
    heapq.heapify(yig)
    islendi[kk] = True
    while yig:
        zz, j, i = heapq.heappop(yig)
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                a_, c_ = j + dj, i + di
                if (dj or di) and 0 <= a_ < BOY and 0 <= c_ < EN and not islendi[a_, c_]:
                    islendi[a_, c_] = True
                    if Fz[a_, c_] < zz:
                        Fz[a_, c_] = zz
                    heapq.heappush(yig, (Fz[a_, c_], a_, c_))
    return Fz


# Yol dolgusu bir vadiyi kapatıp arkasında su birikintisi bırakırsa: o kesimde dolgu geri alınır
# (yol orada menfez / küçük köprüyle geçer). Kazının bıraktığı küçük çukur kendi taşma kotuna doldurulur.
geri_alinan = 0
doldurulan = 0
for tur_ in range(12):
    Fz = cukur_doldur(Z)
    cuk = (Fz - Z) > 0.05
    if not (cuk & ((Fz - Z) > 0.12)).any():
        break
    baraj = (Z > Z0 + 0.05) & ndimage.binary_dilation(cuk, iterations=2)
    if baraj.any():
        geri_alinan += int(baraj.sum())
        Z = np.where(baraj, Z0, Z)
    else:
        doldurulan += int(cuk.sum())
        Z = np.where(cuk, Fz + 0.01, Z)
        break
print(f"  baraj olmasın diye dolgusu geri alınan hücre: {geri_alinan}; doldurulan küçük çukur hücresi: {doldurulan}")

degisim = Z - Z0
print(f"  zemin değişimi: {int((np.abs(degisim) > 0.05).sum())} hücre "
      f"({(np.abs(degisim) > 0.05).sum() * H * H / 1e6:.2f} km²), en çok kazı {-degisim.min():.1f} m, "
      f"en çok dolgu {degisim.max():.1f} m")

# yükseklikler: düzlenmiş yollarda profil; altı boş kalan kesim köprü / menfez
KOPRULER = []
for y in YOLLAR:
    p = y["p"]
    zf = ornek(Z, p[:, 0], p[:, 1])
    if "zp" not in y:
        y["z"] = zf
        y["kopru"] = np.zeros(len(p), bool)
        continue
    zp = y["zp"]
    kop = y["kop0"] | (zp - zf > 0.6)
    kop = ndimage.binary_closing(kop, iterations=2) | kop
    y["z"], y["kopru"] = zp, kop
    etk, say = ndimage.label(kop)
    for e in range(1, say + 1):
        ix = np.nonzero(etk == e)[0]
        a_, b_ = max(ix[0] - 1, 0), min(ix[-1] + 1, len(p) - 1)
        KOPRULER.append(dict(yol=y, a=a_, b=b_, derin=float((zp - zf)[a_:b_ + 1].max())))

# ================================================================== 9. yaz
def mahalle_bul(g):
    orta = g.interpolate(0.5, normalized=True)
    for k, mg in MAHALLE.items():  # noqa
        if mg.contains(orta):
            return k
    return None


def sade3(p, z, kop, tut, tol=0.15):
    """2B sadeleştirme, yükseklik, köprü uçları ve kavşaklar korunarak (kalan noktalar)."""
    g = LineString(p).simplify(tol, preserve_topology=False)
    agac = cKDTree(p)
    _, ix = agac.query(np.asarray(g.coords))
    ix = np.unique(np.r_[0, ix, len(p) - 1])
    # yükseklik de doğrusal arada 15 cm'den çok sapmasın: boy kesiti ayrıca sadeleştirilir
    s_ = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    kz = np.asarray(LineString(np.column_stack([s_, z])).simplify(0.15).coords)[:, 0]
    ix = np.unique(np.r_[ix, np.searchsorted(s_, kz).clip(0, len(p) - 1)])
    # köprü uçları korunur
    sinir = np.nonzero(np.diff(kop.astype(int)))[0]
    ix = np.unique(np.r_[ix, sinir, sinir + 1, np.nonzero(tut)[0]])
    return ix


for y in YOLLAR:
    y["ix"] = sade3(y["p"], y["z"], y["kopru"], y["tut"])
    y["g_out"] = LineString(y["p"][y["ix"]])
# son bağlılık denetimi, yazılacak hâliyle: ana ağa değmeyen parça yazılmaz
_ag = STRtree([y["g_out"] for y in YOLLAR])
_ata = list(range(len(YOLLAR)))


def _bul(a):
    while _ata[a] != a:
        _ata[a] = _ata[_ata[a]]
        a = _ata[a]
    return a


for i_, y in enumerate(YOLLAR):
    for j_ in _ag.query(y["g_out"], predicate="dwithin", distance=0.3):
        _ata[_bul(i_)] = _bul(int(j_))
_ic = [i_ for i_, y in enumerate(YOLLAR) if SAHANLIK.buffer(3).intersects(y["g_out"])]
for a_ in _ic[1:]:
    _ata[_bul(a_)] = _bul(_ic[0])
_kok = _bul(next(i_ for i_, y in enumerate(YOLLAR) if y["ad"] == "Sahil Yolu"))
_at = [y for i_, y in enumerate(YOLLAR) if _bul(i_) != _kok]
if _at:
    print(f"  yazarken ağa değmeyen {len(_at)} parça atıldı ({sum(y['geom'].length for y in _at):.0f} m)")
YOLLAR = [y for i_, y in enumerate(YOLLAR) if _bul(i_) == _kok]
KOPRULER = [k_ for k_ in KOPRULER if any(k_["yol"] is y for y in YOLLAR)]

ozellik = []
say = {}
for y in YOLLAR:
    tur = y["tur"]
    say[tur] = say.get(tur, 0) + 1
    mh = mahalle_bul(y["geom"])
    if y["ad"]:
        ascii_ = y["ad"].replace("İ", "i").lower().translate(str.maketrans("çğıöşüâ", "cgiosua"))
        kimlik = "yol_" + "".join(ch for ch in ascii_.replace(" ", "_") if ch.isalnum() or ch == "_")
    else:
        kimlik = f"{tur}_{(mh or 'ada').replace('yer_', '')}_{say[tur]}"
    ix = y["ix"]
    koord = [ll(*y["p"][i_]) + [round(float(y["z"][i_]), 1)] for i_ in ix]
    pr = {"katman": "yol", "id": kimlik, "tur": tur, "genislikM": y["genislik"],
          "uzunlukM": round(y["geom"].length)}
    if y["ad"]:
        pr["ad"] = y["ad"]
    if y["vikiId"]:
        pr["vikiId"] = y["vikiId"]
    if mh:
        pr["mahalle"] = mh
    if any(y["cikmaz"]):
        pr["cikmaz"] = [bool(c) for c in y["cikmaz"]]
    ozellik.append({"type": "Feature", "properties": pr, "geometry": {"type": "LineString", "coordinates": koord}})
    y["id"] = kimlik
for k_ in KOPRULER:
    y = k_["yol"]
    a_, b_ = k_["a"], k_["b"]
    koord = [ll(*y["p"][i_]) + [round(float(y["z"][i_]), 1)] for i_ in range(a_, b_ + 1)]
    ozellik.append({"type": "Feature", "properties": {
        "katman": "kopru", "yol": y["id"], "tur": "köprü" if k_["derin"] > 2.5 else "menfez", "uzunlukM": round(float(y["s"][b_] - y["s"][a_]), 1),
        "genislikM": y["genislik"]}, "geometry": {"type": "LineString", "coordinates": koord}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "meydan", "ad": "Merkez Meydanı",
                                                  "vikiId": VIKI["Merkez Meydanı"]},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in MEYDAN.exterior.coords]]}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "stat", "ad": "Dirlik Stadı",
                                                  "not": "132 x 100 m: 100 x 64 saha ve tribün payı; yola kapalı"},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in STAT.exterior.coords]]}})
with open(CIKTI, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection",
               "not": "Kompakt ada yol ağı, taslak (Kemal onaylamadı). gen/kompakt_yollar.py üretir.",
               "features": ozellik}, f, ensure_ascii=False, separators=(",", ":"))

# zemin: yalnız yol şeridinde değişti
B2 = dict(B)
B2["yolYatagi"] = "gen/kompakt_yollar.py (yalnız yol şeridi)"
_b = json.dumps(B2, ensure_ascii=False).encode("utf-8")
KAYIT = np.round(Z / B["birim"]).astype("<i2")
with gzip.GzipFile(IZGARA, "wb", compresslevel=9, mtime=0) as f:
    f.write(b"DZZ1" + struct.pack("<I", len(_b)) + _b + KAYIT.tobytes())

top = {}
for y in YOLLAR:
    top[y["tur"]] = top.get(y["tur"], 0) + y["geom"].length
T = sum(top.values())
print("Uzunluklar:", ", ".join(f"{k} {v / 1000:.1f} km" for k, v in sorted(top.items())), f"· toplam {T / 1000:.1f} km")
print(f"Toprak payı: %{100 * top.get('toprak', 0) / T:.1f}; toprak + patika: "
      f"%{100 * (top.get('toprak', 0) + top.get('patika', 0)) / T:.1f}")
print(f"Köprü: {len(KOPRULER)}")
print("Adlı yollar:", ", ".join(sorted({y['ad'] for y in YOLLAR if y['ad']})))
print(f"Yazıldı: {os.path.relpath(CIKTI, KOK)} ({os.path.getsize(CIKTI) / 1e6:.2f} MB), zemin güncellendi")
