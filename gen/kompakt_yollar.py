"""Kompakt Düzada yol ağı — tek harita, 2. adım (20 Kasım 2026, Kemal'in kararları).

Girdi : public/harita/duzada-zemin.bin (1. adımın zemini), public/harita/duzada-sinirlar.geojson
Çıktı : public/harita/duzada-yollar.geojson   yol ağı (koordinatlar [boylam, enlem, yükseklik m])
        public/harita/duzada-zemin.bin         yalnız yol şeridinde hafifçe düzlenir (yol yatağı)

Kurallar:
  - Yalnız adı olan / vikide maddesi olan yollar korunur ve yeni adaya uyarlanır; numaralı
    ("İskele 3. Sokak", "Çiftlik 1. Yolu") ve öbür yollar yeniden üretilir, ad almaz.
  - Kademeler (Kemal, 20 Kasım): ana (köyler arası, Sahil Yolu), ara (köy içi ana sokak, köyü ana
    yola bağlayan), sokak (köy sokağı), gecit (dar geçit; dik yerde basamaklı), toprak (yalnız Çiftlik
    tarlaları), patika (tepeler), merdiven (Sahil Merdiveni). Eğim: ana ve ara ≤ %10, sokak, geçit
    ve toprak ≤ %15; basamaklı geçit, patika, merdiven serbest.
  - Köyler Ege köyü gibi (Kemal, 20 Kasım): meydandan çıkan, eğime koşut kıvrılan sokaklar (eş
    yükselti eğrileri, kıyı köyünde kıyıya koşut), yamaç aşağı kısa geçitler, düzensiz kavşaklar,
    birkaç meydancık. Sokaklar arası ~80 m: iki yanda yol kenarı parseli (3. adım) için düz şerit kalır.
  - Dirlik Stadı (132 x 100 m: 100 x 64 saha ve tribün payı) zeminde düz bir sekiye oturur (kazı ve
    dolgu 1'e 3 şevle); stat çevresi sokak sekinin üstünde, köyün sokakları ondan çıkar.
  - Kıyı köyü (Kemal, 20 Kasım) bugünkü haritadaki gibi Sahil Yolu ile deniz arasında: kıyıya koşut düz
    bir terasa oturur (kumsal korunur; deniz yanı 1'e 3, kara yanı 1'e 2 şev). Sahil Yolu'nun köydeki
    kesimi terasın kara yanından yeniden aranır; hattın geri kalanı aynen kalır.
  - Stat, Merkez Meydanı, The Imperial sahanlığı ve kıyı köyündeki birahane yeri yola kapalı.
  - Dere üstünde kısa köprü; köprüde zemin oyulmaz.

Zemin dosyası bir kez düzlenir: başlığa "yolYatagi" yazılır. Yeniden üretmek için önce
python gen/kompakt_zemin.py, sonra python gen/kompakt_yollar.py.
Denetim: python gen/kompakt_yollar_denetim.py
"""
import gzip, hashlib, heapq, json, math, os, struct, sys

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
KADEMELER = ["ana", "ara", "sokak", "gecit", "toprak", "patika", "merdiven"]
GENISLIK = {"ana": 8.0, "ara": 6.5, "sokak": 5.0, "gecit": 3.0, "toprak": 4.0, "patika": 1.5, "merdiven": 2.5}
EGIM = {"ana": 0.10, "ara": 0.10, "sokak": 0.15, "gecit": 0.15, "toprak": 0.15, "patika": 0.45}
YUZEY = {"ana": "asfalt", "ara": "asfalt", "sokak": "taş", "gecit": "taş", "toprak": "toprak",
         "patika": "toprak", "merdiven": "basamak"}
# KKM Kurucu'daki yol türü (src/components/kurucu/kurucuTipi.ts → YolTuru; haritaTuru ile aynı eşleşme)
KURUCU_TURU = {"ana": "ana", "ara": "ana", "sokak": "sokak", "gecit": "sokak", "toprak": "toprak",
               "patika": "patika", "merdiven": "patika"}

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


SAHIL_PARCALAR = {}     # Sahil Yolu kesimleri: kıyı köyü kesimi değişince öbür kesimlerin hücreleri aynı kalsın


def cizgi_maske(hatlar, kalinlik=1):
    out = np.zeros(Z.shape, bool)
    for h_ in [q for h0 in hatlar for q in SAHIL_PARCALAR.get(id(h0), [h0])]:
        L = h_.length
        for t in np.arange(0, L + 2, 2.0):
            p = h_.interpolate(min(t, L))
            i, j = int(round((p.x - X0) / H)), int(round((p.y - Y0) / H))
            if 0 <= i < EN and 0 <= j < BOY:
                out[j, i] = True
    return ndimage.binary_dilation(out, iterations=kalinlik - 1) if kalinlik > 1 else out


# ------------------------------------------------------------------ stat sekisi (Kemal, 20 Kasım)
# Stat ve çevre sokağı düz bir sekide: kot sekinin içindeki zeminin ortancası (kazı ve dolgu
# dengeli), dışında 1'e 3 şevle (18°) eski zemine iner; şev yumuşatılır. Z0 bundan sonra sekili zemindir.
SEKI = STAT.buffer(16.0, join_style=2)
_ic = maske(SEKI)
SEKI_KOT = round(float(np.median(Z0[_ic])), 1)
_d = ndimage.distance_transform_edt(~_ic) * H
_hedef = SEKI_KOT + np.clip(Z0 - SEKI_KOT, -_d / 3.0, _d / 3.0)
Z0 = Z0 + ndimage.gaussian_filter(_hedef - Z0, 1.2)
Z0[_ic] = SEKI_KOT
_sev = int((np.abs(Z0 - HAM.astype(float) * B["birim"]) > 0.05).sum())
print(f"Stat sekisi: kot {SEKI_KOT} m, en çok kazı {float((HAM * B['birim'] - Z0).max()):.1f} m, "
      f"en çok dolgu {float((Z0 - HAM * B['birim']).max()):.1f} m, değişen {_sev * H * H / 1e4:.1f} ha")
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

Z = Z0.copy()

MEYDAN = affinity.rotate(box(MEYDAN_XY[0] - MEYDAN_YARI, MEYDAN_XY[1] - MEYDAN_YARI,
                             MEYDAN_XY[0] + MEYDAN_YARI, MEYDAN_XY[1] + MEYDAN_YARI), 0, origin=MEYDAN_XY)
DERE_M = cizgi_maske(DERELER, 2)
# Yol araması için zemin: dar dere yatakları kapatılır (köprüyle geçilecek), hafif yumuşatılır
ZR = ndimage.gaussian_filter(ndimage.grey_closing(Z, size=(5, 5)), 1.0)
# stat sekisinin kazı yanı vadi sayılmasın (kapatma onu doldururdu): sekide ve şevinde gerçek zemin
_sk = ndimage.binary_dilation(maske(SEKI), iterations=6)
ZR = np.where(_sk, ndimage.gaussian_filter(Z, 1.0), ZR)
ZR[maske(SEKI)] = SEKI_KOT
YASAK_TEMEL = (D_KARA < 22) | maske(STAT, 6) | maske(OTEL, 8) | maske(SAHANLIK, 4)
# yan yamaç cezası: yol dik yamaca oturursa büyük kazı / dolgu ister; aramada pahalıdır
_yan = ndimage.maximum_filter(np.hypot(*np.gradient(ndimage.gaussian_filter(Z, 1.0), H)), size=3)
YAN_CEZA = 1.0 + 6.0 * np.clip(_yan - 0.18, 0, None) + 3.0 * np.clip((40.0 - D_KARA) / 18.0, 0, 1)
# köprü gerektiren hücre (kapatılmış vadi) pahalı: yollar vadiyi kısa yerden geçer
YAN_CEZA = YAN_CEZA * np.where(ZR - Z > 2.5, 12.0, 1.0)


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


# ------------------------------------------------------------------ yol listesi
YOLLAR = []          # dict: geom (LineString, metre), tur, ad, vikiId, genislik, cikmaz (bas, son), grup


def ekle(geom, tur, ad=None, cikmaz=(False, False), grup=None, genislik=None, yuzey=None):
    """tur: kademe (KADEMELER)."""
    YOLLAR.append(dict(geom=geom, tur=tur, ad=ad, vikiId=VIKI.get(ad), cikmaz=cikmaz, grup=grup,
                       genislik=genislik or GENISLIK[tur], yuzey=yuzey or YUZEY[tur]))
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


def baglanti(bas, hedef_maske, tur, ad=None, carpan=None, yasak=None, pay=900.0, ters=False, cikmaz=(False, False),
             sinir_carpan=1.0):
    yol = yol_ara(bas, hedef_maske, EGIM[tur] * sinir_carpan, carpan=carpan, yasak=yasak, pay=pay)
    if yol is None:
        print(f"  UYARI: yol bulunamadı ({ad or tur}, {bas[0]:.0f},{bas[1]:.0f})")
        return None
    ham = yol
    for _sd in (9.0, 6.0, 3.5):        # en yumuşak hâl, eğimi aşmıyorsa
        yol = yumusat(ham, tur=2, sade=_sd)
        if tur in ("patika",) or en_buyuk_egim(LineString(yol)) <= EGIM[tur] * sinir_carpan * 0.95:
            break
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
# ------------------------------------------------------------------ kıyı köyü terası (Kemal, 20 Kasım)
# Kıyı köyü bugünkü haritadaki gibi Sahil Yolu ile deniz arasında. Orada yamaç dik (%20–25): köy kıyıya
# koşut düz bir terasa oturur. Kumsal (Kuzey Plajı) olduğu gibi kalır; terasın deniz yanı dolgusu 1'e 3,
# kara yanı kazısı 1'e 2 şevle eski zemine iner (kıyıda duvar yok). Sahil Yolu terasın kara yanından geçer.
# Teras Sahil Yolu'nun ilk hattından sonra açılır: hattın köy dışındaki kesimleri aynen kalır.
from shapely.ops import nearest_points, substring  # noqa: E402


def _yumusak_gecis(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


KK_ID = "yerlesim_stadyum_kiyi"
KK_YARI = 105.0                      # köy sokağının yarı boyu (m)
KK_SOKAK_U = 70.0                    # köy sokağının kıyıya uzaklığı
KK_DENIZ_U, KK_KARA_U = 34.0, 96.0   # terasın deniz ve kara kenarı (kıyıya uzaklık)
KK_UC_PAY = 22.0                     # teras sokağın uçlarından bu kadar taşar (uçtaki ev payı)
_kc = Point(YERLESIM[KK_ID]["xy"])
_kh = ADA.exterior
_ks0 = _kh.project(_kc)
_kp = substring(_kh, _ks0 - KK_YARI - 120, _ks0 + KK_YARI + 120)
_kp = LineString(yumusat(list(_kp.simplify(15).coords), tur=3, sade=15))


def _kiyidan(u):
    """Kıyı parçasını kara yanına u m kaydırır."""
    for _s in (1.0, -1.0):
        g = _kp.offset_curve(_s * u)
        g = max(getattr(g, "geoms", [g]), key=lambda q: q.length)
        if ADA.contains(g.interpolate(0.5, normalized=True)) and \
                _kh.distance(g.interpolate(0.5, normalized=True)) > 0.6 * u:
            return g
    sys.exit("HATA: kıyı köyü kıyı parçası kaydırılamadı")


_ks = _kiyidan(KK_SOKAK_U)
_t0 = _ks.project(_kc)
KK_SOKAK = substring(_ks, _t0 - KK_YARI, _t0 + KK_YARI)
_kd, _kk = _kiyidan(KK_DENIZ_U), _kiyidan(KK_KARA_U)
_ta, _tb = _t0 - KK_YARI - KK_UC_PAY, _t0 + KK_YARI + KK_UC_PAY
_ld = substring(_kd, _kd.project(_ks.interpolate(_ta)), _kd.project(_ks.interpolate(_tb)))
_lk = substring(_kk, _kk.project(_ks.interpolate(_ta)), _kk.project(_ks.interpolate(_tb)))
KK_TERAS = Polygon(list(_ld.coords) + list(_lk.coords)[::-1]).buffer(0)
_ic = maske(KK_TERAS)
_z0 = Z0.copy()
KK_KOT = round(float(np.percentile(Z0[_ic], 40)), 1)   # kazı ağır basar: deniz yanı dolgu az kalır
_d = ndimage.distance_transform_edt(~_ic) * H
_hedef = KK_KOT + np.clip(Z0 - KK_KOT, -_d / 3.0, _d / 2.0)
# yalnız yakın çevre ve kara; kumsal korunur (kıyının 14 m içi değişmez, 28 m'ye kadar yumuşak geçiş)
_w = (1 - _yumusak_gecis(120.0, 180.0, _d)) * KARA * _yumusak_gecis(14.0, 28.0, D_KARA)
Z0 = Z0 + ndimage.gaussian_filter((_hedef - Z0) * _w, 1.0) * (D_KARA >= 14.0)
Z0[_ic] = KK_KOT
Z0 = np.where(KARA & (_w > 0), np.maximum(Z0, 0.3), Z0)
KK_DEGISEN = np.abs(Z0 - _z0) > 0.3
KK_SEV = np.abs(Z0 - _z0) > 1.5          # terasın ve şevinin belirgin kısmı (Sahil Yolu bunun dışından geçer)
print(f"Kıyı köyü terası: kot {KK_KOT} m, en çok kazı {float((_z0 - Z0).max()):.1f} m, "
      f"en çok dolgu {float((Z0 - _z0).max()):.1f} m, teras {KK_TERAS.area / 1e4:.2f} ha, "
      f"değişen {int(KK_DEGISEN.sum()) * H * H / 1e4:.1f} ha, kumsal (kıyının 14 m içi) değişmedi: "
      f"{bool(np.abs(Z0 - _z0)[KARA & (D_KARA < 14)].max() < 0.05)}")
# yol araması için zemin yeniden (yalnız teras çevresi değişir)
Z = Z0.copy()
ZR = ndimage.gaussian_filter(ndimage.grey_closing(Z, size=(5, 5)), 1.0)
_sk = ndimage.binary_dilation(maske(SEKI) | KK_DEGISEN, iterations=6)
ZR = np.where(_sk, ndimage.gaussian_filter(Z, 1.0), ZR)
ZR[maske(SEKI)] = SEKI_KOT
ZR[maske(KK_TERAS)] = KK_KOT
_yan = ndimage.maximum_filter(np.hypot(*np.gradient(ndimage.gaussian_filter(Z, 1.0), H)), size=3)
YAN_CEZA = 1.0 + 6.0 * np.clip(_yan - 0.18, 0, None) + 3.0 * np.clip((40.0 - D_KARA) / 18.0, 0, 1)
YAN_CEZA = YAN_CEZA * np.where(ZR - Z > 2.5, 12.0, 1.0)

# Kıyı köyü kesimi (Kemal, 20 Kasım): köy Sahil Yolu'nun deniz yanında. Köyün iki yanında 550 m'lik
# kesim yeniden aranır: terasın ve şevinin kara yanından, dirseksiz; hattın geri kalanı aynen kalır.
_kdis = ndimage.binary_dilation(KK_SEV, iterations=2)
_sk0 = SAHIL.project(Point(YERLESIM[KK_ID]["xy"]))
_sa, _sb = _sk0 - 550.0, 2.0 * round((_sk0 + 550.0) / 2.0)   # çift metre: kesim sonrası hücreler aynı kalır
if _sa < 0 or _sb > SAHIL.length:
    sys.exit("HATA: kıyı köyü kesimi Sahil Yolu'nun başlangıcına denk geldi")
_pa, _pb = SAHIL.interpolate(_sa), SAHIL.interpolate(_sb)
_yk = yol_ara((_pa.x, _pa.y), disk((_pb.x, _pb.y), 12), EGIM["ana"], pay=600,
              carpan=carpan_sahil * np.where(_kdis, 40.0, 1.0), yasak=YASAK_TEMEL | maske(KK_TERAS, 6))
if _yk is None:
    sys.exit("HATA: Sahil Yolu'nun kıyı köyü kesimi bulunamadı")
_yk = yumusat(list(_yk[:-1]) + [(_pb.x, _pb.y)], tur=3, sade=6.0)
_p1, _p3 = substring(SAHIL, 0, _sa), substring(SAHIL, _sb, SAHIL.length)
SAHIL = LineString(list(_p1.coords)[:-1] + _yk + list(_p3.coords)[1:])
_L0, _Lk = _p1.length + (_sb - _sa) + _p3.length, LineString(_yk).length
_s0 = np.linspace(0, _L0, max(2, int(math.ceil(_L0 / 2.0)) + 1))      # yol yatağının eski örnek noktaları
SAHIL_PARCALAR[id(SAHIL)] = [_p1, LineString(_yk), _p3]
SAHIL_ORNEK = {id(SAHIL): np.r_[_s0[_s0 < _sa], _sa + np.linspace(0, _Lk, max(2, int(math.ceil(_Lk / 2.0)) + 1)),
                                _s0[_s0 > _sb] - _sb + _sa + _Lk]}
print(f"  kıyı köyü kesimi yeniden: {LineString(_yk).length:.0f} m, basit: {SAHIL.is_simple}")
ekle(SAHIL, "ana", "Sahil Yolu", genislik=9.0)

# ================================================================== 2. köy dokuları (Ege köyü)
print("Köy dokuları ...")
from contourpy import contour_generator  # noqa: E402


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


def capraz_yakin(g, mevcut, esik=14.0, oran=0.55):
    """Yeni kenar mevcut bir yolun üstüne biniyor mu (uzunluğunun yarısından çoğu yakınında)."""
    for h_ in mevcut:
        if g.distance(h_) < esik and g.intersection(h_.buffer(esik)).length > oran * g.length:
            return True
    return False


# Merkez Meydanı eş yükselti yönüne döner; sokaklar çevresinden çıkar
MEYDAN = affinity.rotate(box(MEYDAN_XY[0] - MEYDAN_YARI, MEYDAN_XY[1] - MEYDAN_YARI,
                             MEYDAN_XY[0] + MEYDAN_YARI, MEYDAN_XY[1] + MEYDAN_YARI),
                         kontur_acisi(MEYDAN_XY), origin=MEYDAN_XY)
IZIN = ADA.buffer(-24).difference(SEKI.buffer(2)).difference(MEYDAN.buffer(2)).difference(
    SAHANLIK.buffer(15)).difference(OTEL.buffer(15))
ZS5 = ndimage.gaussian_filter(Z0, 3.0)     # 30 m: eğriler arazinin kıvrımını izler
DS5 = ndimage.gaussian_filter(D_KARA, 5.0)
GRAD_ZS5 = np.gradient(ZS5, H)[::-1]     # (x, y)
GRAD_DS5 = np.gradient(DS5, H)[::-1]
KOY_HAT = []       # köy sokakları (kaynak çizgiler): dict(geom, koy, kademe, yuzey, genislik, ad, aile)
MEYDANCIK = []     # dict(koy, geom)


def kaynak_ekle(g, koy, kademe, aile, yuzey=None, genislik=None, ad=None):
    KOY_HAT.append(dict(geom=g, koy=koy, kademe=kademe, aile=aile, yuzey=yuzey or YUZEY[kademe],
                        genislik=genislik or GENISLIK[kademe], ad=ad))
    return KOY_HAT[-1]


def parcalar(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    out = []
    for q in getattr(g, "geoms", []):
        out += parcalar(q)
    return out


def noktalar(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Point":
        return [g]
    if g.geom_type == "LineString":
        return [Point(g.coords[0]), Point(g.coords[-1])]
    out = []
    for q in getattr(g, "geoms", []):
        out += noktalar(q)
    return out


def egime_gore_bol(g, lim, en_az=40.0):
    """Çizginin eğimi lim'i aşan ve dar vadiyi kesen yerlerini çıkarır; kalan parçalar."""
    L = g.length
    if L < en_az:
        return []
    s = np.arange(0, L + 0.01, 5.0)
    p = np.array([g.interpolate(t).coords[0] for t in s])
    z = ornek(ZR, p[:, 0], p[:, 1])
    kotu = (z - ornek(Z0, p[:, 0], p[:, 1])) > 2.5
    k = 4
    if len(z) > k:
        e = np.abs(z[k:] - z[:-k]) / (s[k:] - s[:-k])
        for i_ in np.nonzero(e > lim)[0]:
            kotu[i_:i_ + k + 1] = True
    out = []
    etk, n = ndimage.label(~kotu)
    for e_ in range(1, n + 1):
        ix = np.nonzero(etk == e_)[0]
        a_, b_ = s[ix[0]], s[ix[-1]]
        if b_ - a_ >= en_az:
            out.append(substring(g, a_, b_))
    return out


def yanyana_cikar(g, diger, pay, uzun):
    """g'nin başka bir yolun yanında (pay içinde) uzun boyunca koşan kısmını çıkarır; kesişme kalır."""
    if diger is None or diger.is_empty:
        return [g]
    kes = [q for q in parcalar(g.intersection(diger.buffer(pay))) if q.length > uzun]
    if not kes:
        return [g]
    return parcalar(g.difference(unary_union([q.buffer(0.5) for q in kes])))


def egim_yonu(GR, c, isaret, uzun):
    pts, s = [np.asarray(c, float)], [0.0]
    while s[-1] < uzun:
        q = pts[-1]
        gx, gy = float(ornek(GR[0], *q)), float(ornek(GR[1], *q))
        n = math.hypot(gx, gy)
        if n < 1e-5:
            break
        pts.append(q + isaret * 5.0 * np.array([gx, gy]) / n)
        s.append(s[-1] + 5.0)
    return np.array(pts), np.array(s)


def ana_birlesik():
    return unary_union([y["geom"] for y in YOLLAR])


def koy_dokusu(yid, ara=80.0, merkez=None, cikis=None, cevre=()):
    """Ege köyü dokusu: eş yükselti (düzlükte kıyıya koşut) sokaklar ~ara arayla, merkezden
    çıkan kollar, sokaklar arasında yamaç aşağı kısa geçitler ve meydancıklar."""
    y = YERLESIM[yid]
    rng = np.random.default_rng(sum(map(ord, yid)))
    r = y["yaricapM"] * 1.05
    c = np.asarray(merkez if merkez is not None else y["xy"], float)
    ana_u = ana_birlesik()
    if cikis is None and ana_u.distance(Point(c)) < 40:
        q = nearest_points(ana_u, Point(c))[0]      # köyün ortası ana yolun üstündeyse kavşak olur
        c = np.array([q.x, q.y])
    th = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    f1, f2 = rng.uniform(0, 2 * np.pi, 2)
    rr = r * (1 + 0.12 * np.sin(3 * th + f1) + 0.07 * np.sin(5 * th + f2))
    sinir = Polygon(np.column_stack([c[0] + rr * np.cos(th), c[1] + rr * np.sin(th)]))
    alan = IZIN.intersection(sinir)
    for g in cevre:
        kaynak_ekle(g, yid, "ara", "halka")
    G = float(np.hypot(*[ornek(g_, *c) for g_ in GRAD_ZS5]))
    F, GR = (ZS5, GRAD_ZS5) if G >= 0.03 else (DS5, GRAD_DS5)
    seviyeler = []
    for isaret in (1, -1):
        p, s = egim_yonu(GR, c, isaret, r * 1.25)
        k = 0
        while True:
            hedef = (k + 0.5) * ara + rng.uniform(-8, 8)
            if hedef > s[-1]:
                break
            i_ = min(int(np.searchsorted(s, hedef)), len(p) - 1)
            seviyeler.append((isaret * (k + 0.5), float(ornek(F, *p[i_]))))
            k += 1
    seviyeler.sort()
    R = r * 1.4
    i0, i1 = max(0, int((c[0] - R - X0) / H)), min(EN, int((c[0] + R - X0) / H) + 2)
    j0, j1 = max(0, int((c[1] - R - Y0) / H)), min(BOY, int((c[1] + R - Y0) / H) + 2)
    cg = contour_generator(GX[j0:j1, i0:i1], GY[j0:j1, i0:i1], F[j0:j1, i0:i1])
    hat = []
    onceki = unary_union(list(cevre)) if cevre else None
    for sira, lv in seviyeler:
        parca = []
        for arr in cg.lines(lv):
            if len(arr) < 3:
                continue
            g = LineString(yumusat([tuple(a) for a in arr], tur=2, sade=2.0))
            if not g.intersects(sinir):
                continue
            for q in parcalar(g.intersection(alan)):
                for q2 in yanyana_cikar(q, ana_u, 22.0, 60.0):
                    for q3 in yanyana_cikar(q2, onceki, 34.0, 45.0):
                        parca += egime_gore_bol(q3, 0.85 * EGIM["sokak"])
        if parca:
            for q in parca:
                kaynak_ekle(q, yid, "sokak", "kos")
            hat.append((sira, parca))
            u = unary_union(parca)
            onceki = u if onceki is None else onceki.union(u)
    # merkezden çıkan kollar (meydandan, stat çevresinden ya da köyün ortasındaki kavşaktan)
    yasak = YASAK_TEMEL | ~maske(alan.buffer(12)) if not alan.is_empty else YASAK_TEMEL
    if cikis is None:
        gx, gy = [float(ornek(g_, *c)) for g_ in GR]
        a0 = math.atan2(gy, gx)
        cikis = [(tuple(c), a0 + math.radians(d_ + rng.uniform(-12, 12))) for d_ in (40, -40, 140, -140)]
        if alan.contains(Point(c)):
            MEYDANCIK.append(dict(koy=yid, geom=Point(c).buffer(10, resolution=2)))
    kollar = []
    for bas, a in cikis:
        d = np.array([math.cos(a), math.sin(a)])
        hedef = None
        for f_ in np.linspace(0.95, 0.45, 6):
            t = c + d * r * f_
            if alan.buffer(-5).contains(Point(t)):
                hedef = t
                break
        if hedef is None:
            continue
        yol = None
        for kad in ("ara", "sokak"):
            yol = yol_ara(bas, disk(hedef, 15), EGIM[kad] * (0.8 if kad == "ara" else 0.9), yasak=yasak, pay=250)
            if yol is not None:
                break
        if yol is None or len(yol) < 3:
            continue
        g = None
        for _sd in (9.0, 6.0, 4.0, 2.0, 0.5):        # yumuşatma dik yamaçta köşe kesip eğimi artırmasın
            _y = yumusat(yol, tur=2, sade=_sd)
            _y[0] = tuple(bas)
            _g = LineString(_y)
            _e = en_buyuk_egim(_g)
            if _e <= 0.9 * EGIM[kad]:
                g = _g
                break
            if _e <= 0.85 * EGIM["sokak"]:
                g, kad = _g, "sokak"
                break
        if g is None or g.length > 1.5 * math.dist(g.coords[0], g.coords[-1]):
            continue        # zikzak (dik yamaçta kıvrıla kıvrıla) kol açılmaz; orada basamaklı geçitler var
        if capraz_yakin(g, kollar + [ana_u], 18.0, 0.4):
            continue
        kaynak_ekle(g, yid, kad, "kol")
        kollar.append(g)
    # yamaç aşağı geçitler: komşu iki sokak arasında, 110–170 m arayla
    baglar = []
    for (s1, p1), (s2, p2) in zip(hat[:-1], hat[1:]):
        if abs(s2 - s1) > 1.01:
            continue
        u2 = unary_union(p2)
        m2 = cizgi_maske(p2, 1)
        for g in p1:
            t = rng.uniform(25, 70)
            while t < g.length - 20:
                q = g.interpolate(t)
                t += rng.uniform(80, 130)
                if any(x.distance(q) < 45 for x in kollar + baglar):
                    continue
                dq = u2.distance(q)
                if dq > 140 or dq < 15:
                    continue
                yol = yol_ara((q.x, q.y), m2 & disk((q.x, q.y), dq + 60), EGIM["gecit"] * 0.9, yasak=yasak, pay=120)
                g2 = None
                if yol is not None and len(yol) >= 2 and LineString(yol).length <= max(1.7 * dq, dq + 50):
                    for _sd in (3.0, 1.5, 0.5):
                        _y = yumusat(yol, tur=2, sade=_sd)
                        _y[0] = (q.x, q.y)
                        e = nearest_points(u2, Point(_y[-1]))[0]
                        _y[-1] = (e.x, e.y)
                        if en_buyuk_egim(LineString(_y)) <= 0.85 * EGIM["gecit"]:
                            g2 = LineString(_y)
                            break
                if g2 is not None:
                    kaynak_ekle(g2, yid, "gecit", "gecit")
                    baglar.append(g2)
                elif dq <= 90:
                    e = nearest_points(u2, q)[0]
                    g2 = LineString([(q.x, q.y), (e.x, e.y)])
                    if alan.buffer(3).contains(g2):
                        kaynak_ekle(g2, yid, "gecit", "basamak", yuzey="basamak", genislik=2.5)
                        baglar.append(g2)
    # meydancıklar: kolun sokağı kestiği, merkezden uzak iki kavşak
    kav = []
    for g in kollar:
        for _, pp in hat:
            for q in pp:
                for P in noktalar(g.intersection(q)):
                    if P.distance(Point(c)) > 120:
                        kav.append(P)
    rng.shuffle(kav)
    for P in kav:
        if sum(1 for m_ in MEYDANCIK if m_["koy"] == yid) >= 3:
            break
        if all(P.distance(m_["geom"].centroid) > 150 for m_ in MEYDANCIK):
            MEYDANCIK.append(dict(koy=yid, geom=P.buffer(9, resolution=2)))
    print(f"  {yid}: eğim %{100 * G:.0f}, {len(hat)} eğime koşut sokak, {len(kollar)} kol, "
          f"{len(baglar)} geçit ({sum(1 for b_ in baglar if b_.length < 95 and len(b_.coords) == 2)} basamaklı)")


def cevre_kenarlari(poligon, lim=None):
    c_ = list(poligon.exterior.coords)
    out = [LineString([a_, b_]) for a_, b_ in zip(c_[:-1], c_[1:])]
    return [e for e in out if lim is None or en_buyuk_egim(e) <= lim]


def disari_cikislar(poligon, kenarlar):
    m_ = poligon.centroid
    out = []
    for e in kenarlar:
        q = e.interpolate(0.5, normalized=True)
        out.append(((q.x, q.y), math.atan2(q.y - m_.y, q.x - m_.x)))
    return out


# Merkez: meydanın çevresi sokak, kollar dört kenarın ortasından çıkar
_mc = cevre_kenarlari(MEYDAN.buffer(4, join_style=2), 0.9 * EGIM["ara"])
koy_dokusu("yerlesim_merkez", 80.0, merkez=MEYDAN_XY, cikis=disari_cikislar(MEYDAN, _mc), cevre=_mc)
# Stadyum köyü: sekinin üstündeki stat çevresi sokağından çıkar
STAT_CEVRE = STAT.buffer(10, join_style=2)
_sc = cevre_kenarlari(STAT_CEVRE)
koy_dokusu("yerlesim_stadyum", 80.0, cikis=disari_cikislar(STAT, _sc), cevre=_sc)
for _yid, _ara in (("yerlesim_liman", 85.0), ("yerlesim_iskele", 80.0), ("yerlesim_ciftlik", 90.0)):
    koy_dokusu(_yid, _ara)

# ------------------------------------------------------------------ kıyı köyü (Taraftar Birahanesi)
# Bugünkü haritadaki gibi Sahil Yolu ile deniz arasında (Kemal, 20 Kasım): terasın üstünde kıyıya koşut
# köy sokağı (iki yanı ev sırası), Sahil Yolu'na yakın ucundan yukarı kısa bağlantı (≤ %15) ve
# ortasından basamaklı kısa geçit. Birahanenin yeri terasın deniz yanında, bağlantının ağzında:
# Kuzey Plajı'na bakar, köydedir, Sahil Yolu'na yakındır. Bina 3. adımda.
_ky = KK_ID
BIRAHANE_YERI = None
_A = KK_SOKAK
kaynak_ekle(_A, _ky, "sokak", "kos")
_sm_k = cizgi_maske([SAHIL], 1)
# bağlantı: köy sokağının Sahil Yolu'na yakın ucundan Sahil Yolu'na, eğim sınırlı arama
_ucs = sorted([0.0, _A.length], key=lambda t: SAHIL.distance(_A.interpolate(t)))
_C = None
for _bt in _ucs:
    _bu = _A.interpolate(_bt)
    _yol = yol_ara((_bu.x, _bu.y), _sm_k & disk((_bu.x, _bu.y), 400), 0.9 * EGIM["sokak"], pay=400,
                   yasak=YASAK_TEMEL | (maske(KK_TERAS) & ~disk((_bu.x, _bu.y), 30)))
    if _yol is None:
        continue
    for _sd in (9.0, 6.0, 3.5):
        _yy = yumusat(_yol, tur=2, sade=_sd)
        if en_buyuk_egim(LineString(_yy)) <= 0.95 * EGIM["sokak"]:
            break
    _q = nearest_points(SAHIL, Point(_yy[-1]))[0]
    _yy = [(_bu.x, _bu.y)] + list(_yy[1:-1]) + [(_q.x, _q.y)]
    _C = LineString(_yy)
    kaynak_ekle(_C, _ky, "sokak", "kol")
    break
if _C is None:
    print("  UYARI: kıyı köyü bağlantısı açılamadı")
# ortasından Sahil Yolu'na kısa geçit (dikse basamaklı)
_o = _A.interpolate(0.5, normalized=True)
_so = nearest_points(SAHIL, _o)[0]
_B = LineString([(_o.x, _o.y), (_so.x, _so.y)])
_dik = en_buyuk_egim(_B) > 0.9 * EGIM["sokak"]
kaynak_ekle(_B, _ky, "gecit" if _dik else "sokak", "kol", yuzey="basamak" if _dik else None)
# birahane yeri: 30 x 24 m, terasta sokağın deniz yanında, bağlantının ağzına en yakın uygun yer
_aday = []
if _C is not None:
    _bt = _ucs[0]
    for _dt in np.arange(18.0, 120.0, 4.0):
        _t = abs(_bt - _dt)
        _P = _A.interpolate(_t)
        _tt = np.subtract(_A.interpolate(min(_t + 5, _A.length)).coords[0], _A.interpolate(max(_t - 5, 0)).coords[0])
        _tt = _tt / np.hypot(*_tt)
        _nn = np.array([-_tt[1], _tt[0]])
        if float(ornek(D_KARA, _P.x + _nn[0] * 10, _P.y + _nn[1] * 10)) > float(ornek(D_KARA, _P.x, _P.y)):
            _nn = -_nn                                                   # deniz yanına
        _m = np.array([_P.x, _P.y]) + _nn * 18.0
        _by = Polygon([tuple(_m + a_ * 15 * _tt + b_ * 12 * _nn) for a_, b_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        if (KK_TERAS.buffer(2).contains(_by) and ADA.buffer(-15).contains(_by) and SAHIL.distance(_by) >= 6.0
                and not any(k["geom"].intersects(_by.buffer(3)) for k in KOY_HAT if k["koy"] == _ky)):
            BIRAHANE_YERI = _by
            break
if BIRAHANE_YERI is not None:
    YASAK_TEMEL = YASAK_TEMEL | maske(BIRAHANE_YERI, 3)
    print(f"  birahane yeri: terasta, kıyıya {BIRAHANE_YERI.distance(kiyi):.0f} m, Sahil Yolu'na "
          f"{BIRAHANE_YERI.distance(SAHIL):.0f} m, bağlantının ağzına {BIRAHANE_YERI.distance(_C.interpolate(0)):.0f} m")
else:
    print("  UYARI: birahane yeri sığmadı")
print(f"  Sahil Yolu kıyıya {float(ornek(D_KARA, _so.x, _so.y)):.0f} m (köy sokağı {KK_SOKAK_U:.0f} m)")
print(f"  kıyı köyü: köy sokağı {_A.length:.0f} m (Sahil Yolu'nun deniz yanında), bağlantı "
      f"{_C.length if _C is not None else 0:.0f} m (en dik %{100 * en_buyuk_egim(_C) if _C is not None else 0:.0f}), "
      f"geçit {_B.length:.0f} m{' basamaklı' if _dik else ''}, birahane yeri {'açıldı' if BIRAHANE_YERI is not None else 'YOK'}")

# ------------------------------------------------------------------ adlı caddeler
def adlandir(yid, ad, kiyiya=False):
    ad_adaylar = [k for k in KOY_HAT if k["koy"] == yid and k["aile"] == "kos" and k["geom"].length > 200
                  and en_buyuk_egim(k["geom"]) <= 0.9 * EGIM["ara"]]
    if not ad_adaylar:
        print(f"  UYARI: {ad} için uygun sokak yok")
        return None
    c = Point(YERLESIM[yid]["xy"])
    if kiyiya:
        k = min(ad_adaylar, key=lambda k: kiyi.distance(k["geom"]) - 0.2 * k["geom"].length)
    else:
        k = min(ad_adaylar, key=lambda k: k["geom"].distance(c) - 0.3 * k["geom"].length)
    k.update(ad=ad, kademe="ara", yuzey="asfalt", genislik=10.0)
    return k


adlandir("yerlesim_iskele", "Kemsköy Caddesi")
LIMAN_CADDESI = adlandir("yerlesim_liman", "Liman Caddesi", kiyiya=True)


# ------------------------------------------------------------------ düğümleme
def dugumle(hatlar, sabit):
    """Köy sokaklarını kesiştikleri ve başka yolun ucunun değdiği yerde böler (adlı olanlar bölünmez)."""
    tum = [h_["geom"] for h_ in hatlar] + list(sabit)
    agac = STRtree(tum)
    out = []
    for i_, h_ in enumerate(hatlar):
        g = h_["geom"]
        if h_.get("ad"):
            out.append(h_)
            continue
        ts = []
        for j_ in agac.query(g, predicate="dwithin", distance=0.1):
            j_ = int(j_)
            if j_ == i_:
                continue
            o = tum[j_]
            ts += [g.project(P) for P in noktalar(g.intersection(o))]
            for cc in (o.coords[0], o.coords[-1]):
                if g.distance(Point(cc)) < 0.1:
                    ts.append(g.project(Point(cc)))
        a_ = 0.0
        for t in sorted(t for t in ts if 1.0 < t < g.length - 1.0) + [g.length]:
            if t - a_ >= 1.0:
                out.append(dict(h_, geom=substring(g, a_, t)))
                a_ = t
    return out


def bos_uclar(hatlar, sabit):
    """Her hat için iki ucunun boşta olup olmadığı (başka hiçbir yola değmiyor)."""
    tum = [h_["geom"] for h_ in hatlar] + list(sabit)
    agac = STRtree(tum)
    out = []
    for i_, h_ in enumerate(hatlar):
        g = h_["geom"]
        b_ = []
        for cc in (g.coords[0], g.coords[-1]):
            P = Point(cc)
            b_.append(not any(int(j_) != i_ for j_ in agac.query(P, predicate="dwithin", distance=0.3)))
        out.append(b_)
    return out


SABIT = [y["geom"] for y in YOLLAR]
SOKAK_KENAR = dugumle(KOY_HAT, SABIT)
for _ in range(8):       # kavşaktan taşan kısa uçlar (40 m altı) silinir
    bu = bos_uclar(SOKAK_KENAR, SABIT)
    kalan = [k for k, b_ in zip(SOKAK_KENAR, bu) if k.get("ad") or k["aile"] == "halka"
             or not (any(b_) and k["geom"].length < 40.0) and not all(b_)]
    if len(kalan) == len(SOKAK_KENAR):
        break
    SOKAK_KENAR = kalan
# Liman Bağlantısı: Liman Caddesi'ni Sahil Yolu'na bağlayan, köyün ortasına en yakın kol parçası
if LIMAN_CADDESI is not None:
    _ad = [k for k in SOKAK_KENAR if k["koy"] == "yerlesim_liman" and k["aile"] in ("kol", "gecit")
           and k["geom"].distance(LIMAN_CADDESI["geom"]) < 0.5 and k["geom"].distance(SAHIL) < 0.5]
    if _ad:
        k = min(_ad, key=lambda k: k["geom"].distance(Point(YERLESIM["yerlesim_liman"]["xy"])))
        k.update(ad="Liman Bağlantısı", kademe="ara" if en_buyuk_egim(k["geom"]) <= EGIM["ara"] else "sokak",
                 yuzey="asfalt", genislik=GENISLIK["ara"])
    else:
        print("  UYARI: Liman Bağlantısı için uygun parça yok")
# yer yer daralan sokaklar: köy sokağı parçalarının bir kısmı 4 m
_rng = np.random.default_rng(11)
for k in SOKAK_KENAR:
    if k["kademe"] == "sokak" and not k.get("ad") and _rng.random() < 0.3:
        k["genislik"] = 4.0
print(f"  köy sokağı parçası: {len(SOKAK_KENAR)}, meydancık: {len(MEYDANCIK)}")


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
    return nokta_maske(koy_dugumleri(yid)) | ag_maske(turler={"ana", "ara"}) & disk(YERLESIM[yid]["xy"], YERLESIM[yid]["yaricapM"])


SAHIL_M = cizgi_maske([SAHIL], 1)
MZ = YERLESIM["yerlesim_merkez"]["xy"]


def sahil_parca(xy, r):
    return SAHIL_M & disk(xy, r)


def bagla_koy_dugum(yol_kaydi):
    """Yolun ilk noktası köy düğümüne değiyorsa olduğu gibi kalır (yol_ara başlangıcı düğümdür)."""
    return yol_kaydi


# Merkez Bağlantısı: Merkez'den güneydoğuda Sahil Yolu'na (eski güzergâhın küçültülmüş ucu)
uc = kucult(3595.0, -3444.0)
baglanti(koye_en_yakin("yerlesim_merkez", uc), sahil_parca(uc, 1500), "ara", "Merkez Bağlantısı", pay=1500)
# Çetmi Sırtı Yolu: Merkez'den doğuya, Sahil Yolu'na (eski ucu)
uc = kucult(7165.0, 672.0)
baglanti(koye_en_yakin("yerlesim_merkez", uc), sahil_parca(uc, 1600), "ara", "Çetmi Sırtı Yolu", pay=1500)
# Güney Sırt Yolu: İskele'den Merkez'e (eski hat batı uçtan doğuya adanın sırtını geçiyordu)
baglanti(koye_en_yakin("yerlesim_iskele", MZ), koy_hedef("yerlesim_merkez") | ag_maske(turler={"ana"}) & disk(MZ, 900),
         "ana", "Güney Sırt Yolu", pay=1500)
# Stadyum Bağlantısı: stat çevresinden kıyı köyüne (Kuzey Plajı, Taraftar Birahanesi)
ky = YERLESIM["yerlesim_stadyum_kiyi"]["xy"]
# stat sekisinin çevre sokağından, sekinin doğal zeminle aynı kotta olduğu (kazı ve dolgu yok)
# kenarından çıkar: iniş şevden değil, zeminden başlar
_Zilk = HAM.astype(float) * B["birim"]
_sq, _en_iyi = None, 1e9
_sm = STAT.centroid
for _t_ in np.arange(0, STAT_CEVRE.exterior.length, 5.0):
    _q = STAT_CEVRE.exterior.interpolate(_t_)
    _v = np.array([_q.x - _sm.x, _q.y - _sm.y])
    _v = _v / np.hypot(*_v)
    _dis = (_q.x + 30 * _v[0], _q.y + 30 * _v[1])
    _puan = abs(float(ornek(_Zilk, *_dis)) - SEKI_KOT) + 0.01 * Point(ky).distance(_q)
    if _puan < _en_iyi:
        _sq, _en_iyi = _q, _puan
baglanti((_sq.x, _sq.y), koy_hedef("yerlesim_stadyum_kiyi") | sahil_parca(ky, 250),
         "ana", "Stadyum Bağlantısı", pay=1200, sinir_carpan=0.8)   # sekiden inişte yatağa uysun
# Çiftlik Bağlantısı: Çiftlik köyünden en yakın Sahil Yolu'na
cf = YERLESIM["yerlesim_ciftlik"]["xy"]
baglanti(koye_en_yakin("yerlesim_ciftlik", kiyi.interpolate(kiyi.project(Point(cf))).coords[0]),
         SAHIL_M | ag_maske(turler={"ana", "ara"}) & ~disk(cf, YERLESIM["yerlesim_ciftlik"]["yaricapM"] * 1.1),
         "ara", "Çiftlik Bağlantısı", pay=1500)
# Adsız bağlantılar: Stadyum ve Liman köyleri Merkez'e
for yid in ("yerlesim_stadyum", "yerlesim_liman"):
    baglanti(koye_en_yakin(yid, MZ), koy_hedef("yerlesim_merkez") | (ag_maske(turler={"ana"}) & ~SAHIL_M & disk(MZ, 1500)),
             "ana", None, pay=1500)
# Köy kafesleri ana ağa değmiyorsa en yakın ana yola bağlanır
for yid in ("yerlesim_merkez", "yerlesim_liman", "yerlesim_iskele", "yerlesim_stadyum", "yerlesim_stadyum_kiyi", "yerlesim_ciftlik"):
    dug = koy_dugumleri(yid)
    if not dug:
        continue
    ana = unary_union([y["geom"] for y in YOLLAR if y["tur"] in ("ana", "ara")])
    if min(ana.distance(Point(p)) for p in dug) > 0.1:
        p = min(dug, key=lambda q: ana.distance(Point(q)))
        baglanti(p, ag_maske(turler={"ana", "ara"}), "ara", None, pay=800)

# Merkez Dağ Yolu: Merkez'den Kuzey Sırtı'na doğru, patikanın başladığı yere (asfalt)
kz = ZIRVE["tepe_kuzey"]["xy"]
bas_n = (MZ[0] + 0.45 * (kz[0] - MZ[0]), MZ[1] + 0.45 * (kz[1] - MZ[1]))
dag = baglanti(bas_n, koy_hedef("yerlesim_merkez") | ag_maske(turler={"ana", "ara"}), "ara", "Merkez Dağ Yolu",
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
otel = baglanti((s_bas.x, s_bas.y), ag_maske(turler={"ana", "ara", "sokak"}) & ~maske(IMP_ALAN.buffer(-60)),
                "ara", "Otel Yolu", yasak=yasak_otel, pay=900, ters=True, cikmaz=(False, False))
# Sahil Merdiveni: 1. adımın merdiven hattı aynen (sahanlıktan dip terasa)
ekle(MERDIVEN, "merdiven", "Sahil Merdiveni", cikmaz=(False, True))

# ================================================================== 5. patikalar ve tarla yolları
print("Patika ve tarla yolları ...")
# Fener Patikası: Fener Burnu'na
fb = ZIRVE["tepe_bati"]["xy"]
baglanti(fb, ag_maske(turler={"ana", "ara", "sokak"}), "patika", "Fener Patikası", yasak=(D_KARA < 10), pay=900,
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

# ================================================================== 6. köy sokakları yol listesine
for k in SOKAK_KENAR:
    ekle(k["geom"], k["kademe"], k.get("ad"), grup=k["koy"], genislik=k["genislik"], yuzey=k["yuzey"])

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

# Boşta kalan kısa sokak ucu (40 m altı) silinir; daha uzun boşta uç çıkmaz sokak olarak kalır
for _tur in range(6):
    bu = bos_uclar(YOLLAR, [])
    kalan = [y for y, b_ in zip(YOLLAR, bu) if y["ad"] or y["tur"] not in ("ara", "sokak", "gecit")
             or not (any(b_) and y["geom"].length < 40.0)]
    if len(kalan) == len(YOLLAR):
        break
    YOLLAR = kalan

# ================================================================== 8. köprü, yol yatağı, yükseklik
print("Yol yatağı ...")
SIRA = {k: i for i, k in enumerate(KADEMELER)}
YOLLAR.sort(key=lambda y: (SIRA[y["tur"]], 0 if y["ad"] else 1, -y["geom"].length))
SAHIP = maske(SAHANLIK, 2) | maske(SEKI) | maske(MEYDAN)   # bunlara dokunulmaz
CEKIRDEK = {"ana": 9.0, "ara": 8.0, "sokak": 7.0, "gecit": 5.0, "toprak": 7.0}
KENAR = {"ana": 26.0, "ara": 24.0, "sokak": 20.0, "gecit": 14.0, "toprak": 16.0}
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


def sinirla_sabit(z, ds, lim, sabit):
    """Kavşakta (sabit) kot öbür yolunki kalır; aradaki noktalar eğim sınırına çekilir."""
    z = z.copy()
    for _ in range(3):
        for i_ in range(1, len(z)):
            if not sabit[i_]:
                z[i_] = min(max(z[i_], z[i_ - 1] - lim * ds[i_ - 1]), z[i_ - 1] + lim * ds[i_ - 1])
        for i_ in range(len(z) - 2, -1, -1):
            if not sabit[i_]:
                z[i_] = min(max(z[i_], z[i_ + 1] - lim * ds[i_]), z[i_ + 1] + lim * ds[i_])
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
    _taban = SAHIL_ORNEK.get(id(g))       # Sahil Yolu: köy dışındaki kesimlerde eski örnek noktaları
    _taban = np.clip(_taban, 0, L) if _taban is not None else np.linspace(0, L, max(2, int(math.ceil(L / 2.0)) + 1))
    s = np.unique(np.r_[_taban, ek])
    s = s[np.r_[True, np.diff(s) > 0.05]]
    y["s"], y["p"] = s, np.array([g.interpolate(t).coords[0] for t in s])
    y["tut"] = np.isin(s, ek) if ek else np.zeros(len(s), bool)

for y in YOLLAR:
    s, p = y["s"], y["p"]
    n = len(s)
    if y["tur"] in ("patika", "merdiven") or y["yuzey"] == "basamak":
        continue
    ds = np.diff(s)
    lim = EGIM[y["tur"]] * (0.85 if y["tur"] in ("ana", "ara") else 0.93)
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
    # dolgu en çok 1 m; stat sekisinin 60 m yakınında rampa için daha çok (sekiden iniş)
    _sekiye = np.array([SEKI.distance(Point(q)) for q in p]) if y["geom"].distance(SEKI) < 60 else np.full(n, 999.0)
    _pay = 1.0 + 14.0 * np.clip(1 - _sekiye / 60.0, 0, 1)
    # kavşağın 50 m yakınında da dolgu payı (dik köyde kollar ortak kavşaktan iner)
    _ii = np.clip(np.round((p[:, 0] - X0) / H).astype(int), 0, EN - 1)
    _jj = np.clip(np.round((p[:, 1] - Y0) / H).astype(int), 0, BOY - 1)
    _pn = np.nonzero(SAHIP[_jj, _ii] & ~kop)[0]
    if len(_pn):
        _dp = np.min(np.abs(s[:, None] - s[_pn][None, :]), axis=1)
        _pay = np.maximum(_pay, 1.0 + 6.0 * np.clip(1 - _dp / 50.0, 0, 1))
    zp = alt_zarf(np.minimum(zp, destek + _pay), ds, lim)
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

# tek hücrelik sivri kalmasın (yol şeridi kenarlarının kesiştiği yerde olabiliyor)
_ayak = np.ones((3, 3), bool)
_ayak[1, 1] = False
_en = ndimage.maximum_filter(Z, footprint=_ayak, mode="nearest")
_siv = (Z - _en > 0.5) & (np.abs(Z - Z0) > 0.05)
Z = np.where(_siv, _en, Z)
print(f"  sivri düzeltilen hücre: {int(_siv.sum())}")
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

ALANLAR = {
    "id": "kalıcı kimlik. Adlı yolda yol_<ad>, adsızda <kademe>_<mahalle>_<yerin özeti>; yeniden üretimde adlı yolunki değişmez",
    "kademe": "ana | ara | sokak | gecit | toprak | patika | merdiven (genişlik ve çizim rengi buna bağlı)",
    "tur": "yüzey: asfalt | taş | toprak | basamak",
    "kurucuTuru": "KKM Kurucu'daki yol türü (ana | sokak | toprak | patika); Kurucu'nun turDegisikligi bununla eşleşir",
    "ad": "yolun adı; adsızsa boş (geçici numarayı yalnız ekran gösterir, veriye yazılmaz)",
    "vikiId": "vikideki maddesi; yoksa boş",
    "genislik": "metre",
    "uzunlukM": "metre (bilgi)", "mahalle": "mahalle kimliği", "cikmaz": "[baş, son] uç çıkmaz mı",
}
ozellik = []
kullanilan_id = set()
_bu = bos_uclar(YOLLAR, [])
for y, b_ in zip(YOLLAR, _bu):
    tur = y["tur"]
    mh = mahalle_bul(y["geom"])
    if y["ad"]:
        ascii_ = y["ad"].replace("İ", "i").lower().translate(str.maketrans("çğıöşüâ", "cgiosua"))
        kimlik = "yol_" + "".join(ch for ch in ascii_.replace(" ", "_") if ch.isalnum() or ch == "_")
    else:
        # kalıcı kimlik: kademe, mahalle ve yolun ortasının 25 m'lik ızgaradaki yeri
        o = y["geom"].interpolate(0.5, normalized=True)
        oz = hashlib.md5(f"{tur}|{round(o.x / 25)}|{round(o.y / 25)}".encode()).hexdigest()[:6]
        kimlik = f"{tur}_{(mh or 'ada').replace('yer_', '')}_{oz}"
    k_ = kimlik
    n_ = 2
    while k_ in kullanilan_id:
        k_ = f"{kimlik}_{n_}"
        n_ += 1
    kimlik = k_
    kullanilan_id.add(kimlik)
    ix = y["ix"]
    koord = [ll(*y["p"][i_]) + [round(float(y["z"][i_]), 1)] for i_ in ix]
    kapali = np.hypot(*np.subtract(y["geom"].coords[0], y["geom"].coords[-1])) < 0.5
    cik = [bool(c) for c in y["cikmaz"]]
    if not kapali:
        cik = [cik[0] or b_[0], cik[1] or b_[1]]
    pr = {"katman": "yol", "id": kimlik, "kademe": tur, "tur": y["yuzey"], "kurucuTuru": KURUCU_TURU[tur],
          "ad": y["ad"] or "", "vikiId": y["vikiId"] or "", "genislik": y["genislik"],
          "uzunlukM": round(y["geom"].length)}
    if mh:
        pr["mahalle"] = mh
    if any(cik):
        pr["cikmaz"] = cik
    ozellik.append({"type": "Feature", "properties": pr, "geometry": {"type": "LineString", "coordinates": koord}})
    y["id"] = kimlik
for k_ in KOPRULER:
    y = k_["yol"]
    a_, b_ = k_["a"], k_["b"]
    koord = [ll(*y["p"][i_]) + [round(float(y["z"][i_]), 1)] for i_ in range(a_, b_ + 1)]
    ozellik.append({"type": "Feature", "properties": {
        "katman": "kopru", "yol": y["id"], "tur": "köprü" if k_["derin"] > 2.5 else "menfez", "uzunlukM": round(float(y["s"][b_] - y["s"][a_]), 1),
        "genislik": y["genislik"]}, "geometry": {"type": "LineString", "coordinates": koord}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "meydan", "ad": "Merkez Meydanı",
                                                  "vikiId": VIKI["Merkez Meydanı"]},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in MEYDAN.exterior.coords]]}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "stat", "ad": "Dirlik Stadı",
                                                  "not": "132 x 100 m: 100 x 64 saha ve tribün payı; yola kapalı"},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in STAT.exterior.coords]]}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "seki", "kotM": SEKI_KOT,
                                                  "not": "Stadın düz sekisi (stat ve çevre sokağı); dışı 1'e 3 şev"},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in SEKI.exterior.coords]]}})
ozellik.append({"type": "Feature", "properties": {"katman": "korunan", "tur": "kiyi-koy-terasi", "kotM": KK_KOT,
                                                  "not": "Kıyı köyünün düz terası (Sahil Yolu'nun deniz yanında); deniz yanı 1'e 3, kara yanı 1'e 2 şev"},
                "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in KK_TERAS.exterior.coords]]}})
if BIRAHANE_YERI is not None:
    ozellik.append({"type": "Feature", "properties": {
        "katman": "korunan", "tur": "birahane-yeri",
        "not": "Taraftar Birahanesi için ayrılan yer (30 x 24 m); bina 3. adımda. Yola kapalı"},
        "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in BIRAHANE_YERI.exterior.coords]]}})
for m_ in MEYDANCIK:
    ozellik.append({"type": "Feature", "properties": {"katman": "meydancik", "koy": m_["koy"]},
                    "geometry": {"type": "Polygon", "coordinates": [[ll(*c) for c in m_["geom"].exterior.coords]]}})
with open(CIKTI, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection",
               "not": "Kompakt ada yol ağı, taslak (Kemal onaylamadı). gen/kompakt_yollar.py üretir.",
               "alanlar": ALANLAR,
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
print("Uzunluklar:", ", ".join(f"{k} {top[k] / 1000:.1f} km" for k in KADEMELER if k in top), f"· toplam {T / 1000:.1f} km")
print(f"Toprak payı: %{100 * top.get('toprak', 0) / T:.1f}; toprak + patika: "
      f"%{100 * (top.get('toprak', 0) + top.get('patika', 0)) / T:.1f}")
print(f"Köprü: {len(KOPRULER)}")
print("Adlı yollar:", ", ".join(sorted({y['ad'] for y in YOLLAR if y['ad']})))
print(f"Yazıldı: {os.path.relpath(CIKTI, KOK)} ({os.path.getsize(CIKTI) / 1e6:.2f} MB), zemin güncellendi")
