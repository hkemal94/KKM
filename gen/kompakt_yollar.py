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
    yükselti eğrileri), yamaç aşağı kısa geçitler, düzensiz kavşaklar,
    birkaç meydancık. Sokaklar arası ~80 m: iki yanda yol kenarı parseli (3. adım) için düz şerit kalır.
  - Dirlik Stadı (132 x 100 m: 100 x 64 saha ve tribün payı) zeminde düz bir sekiye oturur (kazı ve
    dolgu 1'e 3 şevle); stat çevresi sokak sekinin üstünde, köyün sokakları ondan çıkar.
  - Kıyı köyü (Kemal, 20 Kasım akşam) bugünkü haritadaki köyün sokak hatlarıyla aynı: Kurucu'nun kalıcı
    hâlindeki dokuz yol ve birahanenin yeri adanın küçültmesiyle (0,70) taşınır; zemin değişmez (teras yok).
    Sahil Yolu köyün önünde eski hattının küçültülmüşünden geçer; hattın geri kalanı aynen kalır.
  - Liman kasabası (Kemal, 22 Kasım) eski haritadaki sokaklarıyla aynı: Kurucu'nun son hâlindeki 177 sokak ve 4 meydancık
    oran 0,70 ile taşınır, odak Dondurmacı Kızlar (gen/kompakt_liman.py); köy dokusu üretilmez. Sahil Yolu kasabanın
    içinden eski hattının taşınmışından geçer; iki yanda ilk hatta eğim sınırlı arama. Sahil Yolu'nun Liman dışındaki
    noktaları ana daldakiyle aynı kalır (gen/kompakt-sahil-ana.json): öbür köylerin arsaları yeniden dizilmez.
  - İskele köyü (Kemal, 24 Kasım) eski haritadaki sokaklarıyla aynı: Kurucu'nun son hâlindeki 124 sokak ve yol (Kemsköy
    Caddesi dahil; seyreltmeyle 52'si kalır, gen/kompakt_iskele.py → GIDEN) ve 3 meydancık adanın küçültmesiyle (0,70)
    taşınır (gen/kompakt_iskele.py); köy dokusu üretilmez.
    Sahil Yolu köyün içinden eski hattının taşınmışından geçer; Liman'daki gibi iki yanda arama ve doğal hat. Sahil
    Yolu'nun profili kesim kesim kurulur (ana daldaki hat → Liman kesimi → İskele kesimi; sahil_profili).
  - Stat, Merkez Meydanı, The Imperial sahanlığı ve kıyı köyündeki birahane yeri yola kapalı.
  - Dere üstünde kısa köprü; köprüde zemin oyulmaz.
  - Doğal hat (Kemal, 24 Kasım: "düzgün, doğal bir yol olsun"): aramayla bulunan yollar (Sahil Yolu, bağlantılar,
    tarla yolları) ızgaranın kırıklarıyla değil, ip germe + büyük yarıçaplı viraj + yumuşatmayla çizilir (dogal_hat).
    Eğim sınırı yumuşak kural: dik yamaçta sınırın en çok ASIM_ORAN katı (yolun egimAsimi alanı; denetimde bilgi).
    Köy sokakları ve İskele'nin içindeki Sahil Yolu eski haritadaki hatlarıyla (aramayla çizilmez).

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
import kompakt_eski as EK  # noqa: E402  (eski haritanın dondurulmuş girdileri, tek harita 11. adım)

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
# Dirlik Stadı: eski haritadaki düzlüğün (o günkü gen/duzlukler.json; dondurulmuş) küçültülmüş yeri; ölçü aynı.
_st = EK.STAT_DUZLUGU
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
        # (çizgi, baş, son): eski bir kesimin yalnız [baş, son] aralığı, eskisiyle aynı örnek noktalarıyla
        h_, _lo, _hi = h_ if isinstance(h_, tuple) else (h_, -1.0, math.inf)
        L = h_.length
        for t in np.arange(0, L + 2, 2.0):
            if t < _lo or t > _hi:
                continue
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
# elle konan yapılar (gen/tek-harita-elle.json; ör. fener bekçi evi Sahil Yolu'nun yanında): doğal hat üstlerinden geçmez
ELLE_YAPI = np.zeros(Z.shape, bool)
_elle_d = os.path.join(BURASI, "tek-harita-elle.json")
if os.path.exists(_elle_d):
    for _yp in (json.load(open(_elle_d, encoding="utf-8")).get("taslak", {}).get("yeniYapilar") or {}).values():
        if _yp.get("m") and _yp.get("en") and _yp.get("boy"):
            ELLE_YAPI |= np.hypot(GX - m(_yp["m"])[0], GY - m(_yp["m"])[1]) <= math.hypot(_yp["en"], _yp["boy"]) / 2 + 8.0
VADI = ZR - Z > 1.5        # kapatılmış dar vadi ya da yatak (yol orada köprüye çıkar)


def ornek(Zm, x, y):
    tek = np.ndim(x) == 0
    x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
    v = ndimage.map_coordinates(Zm, [(y - Y0) / H, (x - X0) / H], order=1, mode="nearest")
    return float(v[0]) if tek else v


# ------------------------------------------------------------------ eğim bilen yol araması
KOMSU = [(di, dj, H * math.hypot(di, dj)) for di in range(-2, 3) for dj in range(-2, 3)
         if (di or dj) and math.gcd(abs(di), abs(dj)) == 1]


# dönüş cezası (24 Kasım): aramada yön değişimi 1 - cos(açı) ile pahalı; eğim sınırını küçük zikzaklarla (testere
# dişi) "yumuşatan" hat yerine az sayıda büyük viraj seçilir. Köy sokaklarının araması (dokusu ayrı iş) cezasız.
DONUS_CEZA = 80.0      # DENEME: 90°'lik dönüşün bedeli (m), 180° bunun iki katı
_KY = [math.atan2(dj, di) for di, dj, _ in KOMSU]
DONUS_TABLO = [[1.0 - math.cos(a - b) for b in _KY] for a in _KY]


def yol_ara(bas, hedef, sinir, carpan=None, yasak=None, pay=700.0, agirlik=1.2, dere_ceza=60.0, donus=0.0):
    """bas noktasından hedef hücre kümesine eğim sınırını aşmayan en ucuz yol (A*).
    donus > 0: yön değişimi cezası (gelinen yön hücrede tutulur; yaklaşık, yön durum sayılmaz).
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
    cl = YAN_CEZA[sl] * (1.0 if carpan is None else carpan[sl])
    if donus:
        cl = cl * np.where(VADI[sl], 6.0, 1.0)     # doğal hat: sığ vadi tabanı boyunca da gitmez (uzun menfez olurdu)
    cl = cl.ravel().tolist()
    yl = yasak[sl].ravel().tolist()
    hl = (uz[sl] * agirlik).ravel().tolist()
    gl = hedef[sl].ravel().tolist()
    dl = DERE_M[sl].ravel().tolist()
    nb = [(di, dj, L, dj * W + di, ki) for ki, (di, dj, L) in enumerate(KOMSU)]
    g = [math.inf] * (W * Hh)
    par = [-1] * (W * Hh)
    gyon = [-1] * (W * Hh)
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
        dt = DONUS_TABLO[gyon[k]] if donus and gyon[k] >= 0 else None
        for di, dj, L, kd, ki in nb:
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
            if dt is not None:
                c += donus * dt[ki]
            if c < g[n]:
                g[n] = c
                par[n] = k
                gyon[n] = ki
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


# ------------------------------------------------------------------ doğal hat (Kemal, 24 Kasım: "düzgün, doğal bir yol olsun")
# Izgara araması 10 m'lik hücrelerden ve 16 yönden geçer: eğim sınırı ve yan yamaç cezası yüzünden yol hücre hücre
# kırılır; eski yumuşatma (3,5–9 m sadeleştirme + iki tur köşe kesme) bu kırıkları küçük kıvrımlara çeviriyordu
# (testere dişi, kısa dirsek). Arama artık yalnız güzergâhı bulur; çizgi ondan sonra yeniden kurulur:
# (1) ip germe: aramanın hattından düz gidilebilen en uzak noktaya gidilir (yasak yok, hattan en çok SAPMA kadar
# uzak, zemin 10 m'de yumuşatılınca eğim sınırı içinde); (2) kalan köşeler büyük yarıçaplı yayla dönülür (dağ
# yolunun virajı gibi; yay komşu düz kesimlerin yarısına sığmazsa yarıçap küçülür). Eğim yine aşılırsa engel değil uyarı.
VIRAJ_R = {"ana": 70.0, "ara": 55.0, "sokak": 25.0, "gecit": 15.0, "toprak": 35.0, "patika": 12.0}   # DENEME: viraj yarıçapı hedefi (m)
SAPMA = {"ana": 30.0, "ara": 30.0, "sokak": 15.0, "gecit": 10.0, "toprak": 25.0, "patika": 15.0}      # DENEME: aramanın hattından en çok (m)
IP_EN_COK = 60          # ip germede en çok kaç arama noktası atlanır (~600 m)
DOGAL_UYARI = []        # eğim sınırını aşan doğal hatlar (yumuşak kural: uyarı)


KAZI_EN_COK = 2.5       # DENEME: düz kesimde zemin, yumuşatılmış hâlinden en çok bu kadar sapar (kazı / dolgu, m)


def _profil_egimi(xs, ys, Zm=None):
    """Düz kesimin 5 m'de bir örneklenmiş zemininde (10 m yumuşatılmış) 20 m pencerede en dik eğim. Yumuşatma
    KAZI_EN_COK'tan büyük kazı / dolgu isterse (sırtı yarıp geçmek, vadiyi doldurmak) kesim geçmez (sonsuz)."""
    Zm = ZR if Zm is None else Zm
    z0 = ornek(Zm, xs, ys)
    d = math.hypot(xs[-1] - xs[0], ys[-1] - ys[0])
    if len(z0) < 3:
        return abs(z0[-1] - z0[0]) / max(d, 1.0)
    z = ndimage.gaussian_filter1d(z0, 2.0, mode="nearest")
    if np.max(np.abs(z - z0)) > KAZI_EN_COK:
        return math.inf
    ds = d / (len(z) - 1)
    k = min(len(z) - 1, 4)
    return float(np.max(np.abs(z[k:] - z[:-k])) / (k * ds))


ASIM_ORAN = 2.0        # DENEME: yumuşak kural; düz gidiş ancak sınırın bu katına kadar dik olabilir (uyarı olur)
ASIM_HAT = []          # sınırı aşan düz kesimler (yol yatağı orada daha dik çizilir, denetimde bilgi)


def ip_ger(ham, sinir, sapma, yasak=None, sabit_uclar=20.0, tut=(), asim=None):
    """Arama hattının kırıklarını atlar: her noktadan, düz gidilebilen en uzak noktaya.
    tut: atlanmayacak noktaların sırası (korunan hattın başı, teğet noktası).
    asim: yumuşak sınır. Sınır içinde ancak kısa (< 80 m) gidilebiliyor, yumuşak sınırla iki katından uzağa
    gidilebiliyorsa (aramanın hattı eğimi küçük zikzaklarla tutturmuş: testere dişi) düz kesim seçilir ve
    ASIM_HAT'a yazılır. Döner: noktalar."""
    p = np.asarray(ham, float)
    n = len(p)
    if n < 3:
        return [tuple(q) for q in p]
    yasak = YASAK_TEMEL if yasak is None else yasak
    agac = cKDTree(np.asarray(LineString(p).segmentize(4.0).coords))
    bas_, son_ = p[0], p[-1]

    def egim(a, b):
        u, v = p[a], p[b]
        d = math.hypot(*(v - u))
        k = max(2, int(math.ceil(d / 5.0)) + 1)
        t = np.linspace(0, 1, k)
        xs, ys = u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])
        if agac.query(np.column_stack([xs, ys]))[0].max() > sapma:
            return math.inf
        ii = np.clip(np.round((xs - X0) / H).astype(int), 0, EN - 1)
        jj = np.clip(np.round((ys - Y0) / H).astype(int), 0, BOY - 1)
        uc = (np.hypot(xs - bas_[0], ys - bas_[1]) < sabit_uclar) | (np.hypot(xs - son_[0], ys - son_[1]) < sabit_uclar)
        if ((yasak[jj, ii] | ELLE_YAPI[jj, ii]) & ~uc).any():
            return math.inf
        # vadi ve dere boyunca gitmez (aramadaki gibi; yalnız kısa geçiş, köprü ≤ ~40 m)
        vd = VADI[jj, ii] | DERE_M[jj, ii]
        if vd.sum() > 8:
            return math.inf
        return _profil_egimi(xs, ys)

    tut = sorted(set(int(k) % n for k in tut))
    out = [0]
    i = 0
    while i < n - 1:
        sik, gev, ard = i + 1, i + 1, 0
        sinir_j = min([k for k in tut if k > i] + [n - 1])
        for j in range(i + 2, min(sinir_j, i + IP_EN_COK) + 1):
            e = egim(i, j)
            if e <= sinir:
                sik, ard = j, 0
            if asim and e <= asim:
                gev, ard = j, 0
            if e > (asim or sinir):
                ard += 1
                if ard > 8:
                    break
        d_sik, d_gev = math.dist(p[i], p[sik]), math.dist(p[i], p[gev])
        if asim and gev > sik and d_sik < 80.0 and d_gev > 2.0 * d_sik:
            ASIM_HAT.append(LineString([p[i], p[gev]]))
            sik = gev
        out.append(sik)
        i = sik
    return [tuple(p[k]) for k in out]


def viraj_yuvarla(pts, R, kapali=False, adim=4.0, sabit=()):
    """Köşeleri yarıçapı R olan yayla döner; yay komşu kesimin yarısına (uç ya da sabit köşe yanında
    tamamına) sığmazsa yarıçap küçülür. sabit: dokunulmayacak köşelerin sırası (kavşak, korunan hat)."""
    p = [np.asarray(q, float) for q in pts]
    if kapali and np.hypot(*(p[0] - p[-1])) < 0.5:
        p = p[:-1]
    n = len(p)
    if n < 3:
        return [tuple(q) for q in pts]
    sabit = set(sabit)

    def pay(k_kom, l_):
        uc = not kapali and k_kom in (0, n - 1)
        return 0.9 * l_ if uc or (k_kom % n) in sabit else 0.5 * l_

    out = []
    for k in range(n):
        if not kapali and k in (0, n - 1):
            out.append(tuple(p[k]))
            continue
        a, b, c = p[(k - 1) % n], p[k], p[(k + 1) % n]
        u, v = b - a, c - b
        lu, lv = math.hypot(*u), math.hypot(*v)
        if k in sabit or lu < 1e-6 or lv < 1e-6:
            out.append(tuple(b))
            continue
        u, v = u / lu, v / lv
        th = math.acos(max(-1.0, min(1.0, float(u @ v))))     # dönüş açısı
        if th < math.radians(1.0):
            out.append(tuple(b))
            continue
        t = min(R * math.tan(th / 2), pay(k - 1, lu), pay(k + 1, lv))
        r = t / math.tan(th / 2)
        P1 = b - u * t
        sol = 1.0 if (u[0] * v[1] - u[1] * v[0]) > 0 else -1.0
        O = P1 + np.array([-u[1], u[0]]) * sol * r
        a1 = math.atan2(P1[1] - O[1], P1[0] - O[0])
        m_ = max(2, int(math.ceil(r * th / adim)) + 1)
        for q in np.linspace(0, 1, m_):
            aa = a1 + sol * th * q
            out.append((O[0] + r * math.cos(aa), O[1] + r * math.sin(aa)))
    if kapali:
        out.append(out[0])
    return out


EGRI_SIGMA = {"ana": 14.0, "ara": 12.0, "sokak": 6.0, "gecit": 5.0, "toprak": 10.0, "patika": 5.0}   # DENEME (m)


def egri_yumusat(pts, sigma, kapali=False, adim=2.0, uc_pay=None):
    """Çizgi 2 m'de bir örneklenir, koordinatlar yol boyunca Gauss ile yumuşatılır (sigma m): ızgaranın 10–30 m'lik
    kırıkları söner, yüzlerce metrelik kıvrım kalır. Açık çizgide uçlar ve uç_pay kadarı yerinde kalır (kavşak)."""
    p = np.asarray(pts, float)
    if len(p) < 3 or sigma <= 0:
        return [tuple(q) for q in p]
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    if s[-1] < 4 * adim:
        return [tuple(q) for q in p]
    t = np.linspace(0, s[-1], int(math.ceil(s[-1] / adim)) + 1)
    x, y = np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])
    if kapali:
        xs = ndimage.gaussian_filter1d(x[:-1], sigma / adim, mode="wrap")
        ys = ndimage.gaussian_filter1d(y[:-1], sigma / adim, mode="wrap")
        q = np.column_stack([np.r_[xs, xs[:1]], np.r_[ys, ys[:1]]])
    else:
        xs = ndimage.gaussian_filter1d(x, sigma / adim, mode="nearest")
        ys = ndimage.gaussian_filter1d(y, sigma / adim, mode="nearest")
        up = 2.5 * sigma if uc_pay is None else uc_pay
        w = smooth_adim(np.minimum(t, s[-1] - t) / max(up, 1e-6))
        q = np.column_stack([x + w * (xs - x), y + w * (ys - y)])
        q[0], q[-1] = p[0], p[-1]
    g = LineString(q).simplify(0.2)
    return [tuple(c) for c in g.coords]


def smooth_adim(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def _egim_dizisi(q, adim=2.0):
    """2 m'de bir noktalar: zemin (10 m yumuşatılmış) 20 m pencerede eğim, her nokta için (yolun gördüğü)."""
    z = ndimage.gaussian_filter1d(ornek(ZR, q[:, 0], q[:, 1]), 10.0 / adim, mode="nearest")
    k = int(20.0 / adim)
    if len(z) <= k:
        return np.zeros(len(z))
    g = np.abs(z[k:] - z[:-k]) / (k * adim)
    e = np.zeros(len(z))
    for o in range(k + 1):        # her nokta, içinde bulunduğu pencerelerin en dikini alır
        e[o:o + len(g)] = np.maximum(e[o:o + len(g)], g)
    return e


def egim_koru(yol, ref, sinir, kapali=False, adim=2.0):
    """Yumuşatılmış hat bir yerde ip germe hattından (ref) daha dik olursa (viraj ya da yumuşatma kıvrımı kısaltıp
    yamaca bindirdiyse) o yerde hat ref'e doğru geri çekilir; geçiş yumuşak (kavşak ve virajda kırık kalmaz)."""
    p = np.asarray(yol, float)
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    if s[-1] < 30:
        return yol
    t = np.linspace(0, s[-1], int(math.ceil(s[-1] / adim)) + 1)
    q = np.column_stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])])
    R_ = LineString(ref)
    r = np.array([R_.interpolate(R_.project(Point(c))).coords[0] for c in q])
    e_ref = _egim_dizisi(r)
    w = np.ones(len(q))
    mod = "wrap" if kapali else "nearest"
    for _ in range(8):
        ws = np.clip(ndimage.gaussian_filter1d(w, 6.0, mode=mod), 0, 1)
        c = r + ws[:, None] * (q - r)
        e = _egim_dizisi(c)
        fazla = e > np.maximum(sinir, e_ref + 0.005)
        if not fazla.any():
            break
        w = np.where(ndimage.binary_dilation(fazla, iterations=15), w * 0.4, w)
    if not kapali:
        c[0], c[-1] = p[0], p[-1]
    else:
        c[-1] = c[0]
    return [tuple(x) for x in LineString(c).simplify(0.2).coords]


def dirsek_yerleri(q, adim=2.0, pencere=20.0, esik=60.0):
    """2 m'de bir noktalar: 20 m içinde 60°'den çok dönen yerlerin sırası (denetimdeki ölçüyle aynı)."""
    h = np.unwrap(np.arctan2(np.diff(q[:, 1]), np.diff(q[:, 0])))
    k = int(pencere / adim)
    if len(h) <= k:
        return np.zeros(len(q), bool)
    d = np.degrees(np.abs(h[k:] - h[:-k])) > esik
    out = np.zeros(len(q), bool)
    for o in range(k + 1):
        out[o:o + len(d)] |= d
    return out


def dirsek_temizle(yol, sigma, kapali=False, uc_pay=None, adim=2.0):
    """Eğim yüzünden geri çekilen yerde kalan keskin dirsekler (dik yamaçta, yol eğimi sınırı tutamıyor): yalnız
    oralarda hat daha çok yumuşatılır; eğim aşılırsa yumuşak kural (ASIM_HAT, yatak orada daha dik)."""
    p = np.asarray(yol, float)
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    if s[-1] < 40:
        return yol
    t = np.linspace(0, s[-1], int(math.ceil(s[-1] / adim)) + 1)
    q = np.column_stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])])
    mod = "wrap" if kapali else "nearest"
    up = 2.5 * sigma if uc_pay is None else uc_pay
    uc = np.ones(len(q)) if kapali else smooth_adim(np.minimum(t, s[-1] - t) / max(up, 1e-6))
    degisti = np.zeros(len(q), bool)
    for _ in range(4):
        d = dirsek_yerleri(q) & (uc > 0.5)
        if not d.any():
            break
        w = np.clip(ndimage.gaussian_filter1d(ndimage.binary_dilation(d, iterations=12).astype(float), 4.0, mode=mod) * 1.5, 0, 1) * uc
        qs = np.column_stack([ndimage.gaussian_filter1d(q[:, 0], 2 * sigma / adim, mode=mod),
                              ndimage.gaussian_filter1d(q[:, 1], 2 * sigma / adim, mode=mod)])
        q = q + w[:, None] * (qs - q)
        degisti |= w > 0.3
    if degisti.any():
        et, n_ = ndimage.label(degisti)
        for e_ in range(1, n_ + 1):
            ix = np.nonzero(et == e_)[0]
            c = q[ix]
            for a_ in range(0, len(c) - 1, 5):
                ASIM_HAT.append(LineString([c[a_], c[min(a_ + 5, len(c) - 1)]]))
    if not kapali:
        q[0], q[-1] = p[0], p[-1]
    else:
        q[-1] = q[0]
    return [tuple(x) for x in LineString(q).simplify(0.2).coords]


def dogal_hat(ham, tur, sinir, yasak=None, ad=None, tut=(), kapali=False, uc_pay=None):
    """Arama hattından doğal yol çizgisi: ip germe + büyük yarıçaplı viraj + yumuşatma. Uçlar yerinde kalır."""
    ham = [tuple(q) for q in ham]
    if len(ham) < 3:
        return ham
    # yol yatağının boy kesiti ana ve arada sınırın %85'iyle çizilir (bölüm 8): ip germe de ona göre
    s_y = sinir * (0.85 if tur in ("ana", "ara") else 0.93)
    ger = ip_ger(ham, s_y, SAPMA.get(tur, 20.0), yasak=yasak, tut=tut,
                 asim=None if tur in ("patika", "merdiven") else s_y * ASIM_ORAN)
    yol = viraj_yuvarla(ger, VIRAJ_R.get(tur, 30.0), kapali=kapali)
    if not kapali:
        yol[0], yol[-1] = ham[0], ham[-1]
    # (3) kalan kısa kırıklar (dik yerde ip germe kısa kalınca) yol boyunca yumuşatılır; uçlar ve teğet payı yerinde
    yol = egri_yumusat(yol, EGRI_SIGMA.get(tur, 8.0), kapali=kapali, uc_pay=uc_pay)
    if tur not in ("patika", "merdiven"):
        yol = egim_koru(yol, ger, s_y, kapali=kapali)
        yol = dirsek_temizle(yol, EGRI_SIGMA.get(tur, 8.0), kapali=kapali, uc_pay=uc_pay)
        e = en_buyuk_egim(LineString(yol))
        if e > sinir * 1.02:
            DOGAL_UYARI.append(f"{ad or tur}: en dik %{100 * e:.1f} (sınır %{100 * sinir:.0f})")
    return yol


def _yon(a, b):
    v = np.subtract(b, a, dtype=float)
    return v / max(np.hypot(*v), 1e-9)


def dogal_ara(ham, bas_yon=None, son_yon=None, tur="ana", yasak=None, ad=None, teget=25.0):
    """İki sabit hattın arasındaki arama hattından doğal hat. bas_yon / son_yon verilirse yol o uçta sabit hattın
    yönünde girer çıkar (uçtan teget kadar ötede bir nokta tutulur): kavşakta kırık kalmaz."""
    ham = [tuple(map(float, q)) for q in ham]
    a, b = ham[0], ham[-1]
    orta = ham[1:-1]
    # teğet noktasının gerisinde ya da yakınında kalan baştaki / sondaki arama noktaları atılır (kanca kalmasın)
    if bas_yon is not None:
        while orta and (orta[0][0] - a[0]) * bas_yon[0] + (orta[0][1] - a[1]) * bas_yon[1] < teget * 1.5:
            orta = orta[1:]
    if son_yon is not None:
        while orta and (b[0] - orta[-1][0]) * son_yon[0] + (b[1] - orta[-1][1]) * son_yon[1] < teget * 1.5:
            orta = orta[:-1]
    pts, tut = [a], []
    if bas_yon is not None:
        pts.append((a[0] + teget * bas_yon[0], a[1] + teget * bas_yon[1]))
        tut.append(1)
    pts += orta
    if son_yon is not None:
        pts.append((b[0] - teget * son_yon[0], b[1] - teget * son_yon[1]))
        tut.append(len(pts) - 1)
    pts.append(b)
    return dogal_hat(pts, tur, EGIM[tur], yasak=yasak, ad=ad, tut=tut, uc_pay=teget)


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
             sinir_carpan=1.0, kes=True):
    yol = yol_ara(bas, hedef_maske, EGIM[tur] * sinir_carpan, carpan=carpan, yasak=yasak, pay=pay,
                  donus=0.0 if tur == "patika" else DONUS_CEZA)
    if yol is None:
        print(f"  UYARI: yol bulunamadı ({ad or tur}, {bas[0]:.0f},{bas[1]:.0f})")
        return None
    if tur == "patika":
        # patika (yaya yolu) eskisi gibi: ızgara kırığı yalnız sadeleştirme ve köşe kesmeyle (dar ve kıvrımlı kalır)
        yol = ucu_aga_bagla(yumusat(yol, tur=2, sade=9.0))
    else:
        # uç önce ağa oturur, sonra doğal hat (kavşakta kırık kalmasın; Kemal 24 Kasım)
        yol = dogal_hat(ucu_aga_bagla(yol), tur, EGIM[tur] * sinir_carpan, yasak=yasak, ad=ad)
        if kes:
            yol = ilk_degmede_kes(yol)
    if ters:
        yol = yol[::-1]
    return ekle(LineString(yol), tur, ad, cikmaz=cikmaz)


def ilk_degmede_kes(yol, yakin=6.0, bas_pay=40.0):
    """Doğal hat ağa ilk yaklaştığı yerde biter (ağdaki yolun yanında koşut giden kuyruk kalmasın: iki yol yan yana
    değil, kavşakta birleşir). Son nokta ağdaki en yakın yolun üstüne oturur."""
    g = LineString(yol)
    ag = [y["geom"] for y in YOLLAR if y["tur"] in ("ana", "ara") and y["geom"].length > 1]   # bağlı ana ağ
    if not ag or g.length < bas_pay + 20:
        return yol
    agu = unary_union(ag)
    for t in np.arange(bas_pay, g.length - 15.0, 2.0):
        P = g.interpolate(t)
        if agu.distance(P) < yakin:
            h = min(ag, key=lambda h_: h_.distance(P))
            # ağdaki yola gidiş yönünde, 12 m ileride yumuşakça katılır (dik sıçrama dirsek olurdu)
            d = np.subtract(P.coords[0], g.interpolate(max(0.0, t - 8.0)).coords[0])
            u = h.project(P)
            a_, b_ = h.interpolate(max(0.0, u - 1.0)).coords[0], h.interpolate(min(h.length, u + 1.0)).coords[0]
            isaret = 1.0 if float(np.dot(d, np.subtract(b_, a_))) >= 0 else -1.0
            q = h.interpolate(min(h.length, max(0.0, u + isaret * 12.0)))
            parca = list(substring(g, 0, t).coords)
            if math.dist(parca[-1], (q.x, q.y)) > 0.05:
                parca.append((q.x, q.y))
            return [tuple(c) for c in parca]
    return yol


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
    # kıyı köyünün ilk durağı 1. adımdaki yeri (zemin yumuşatmasının merkezi): hattın köy dışındaki kesimleri
    # aynen kalsın; köyün önündeki kesim aşağıda eski hattın küçültülmüşüyle yeniden çizilir
    q = m(YERLESIM[yid]["yumusatmaNokta"]) if "yumusatmaNokta" in YERLESIM[yid] else YERLESIM[yid]["xy"]
    s = kiyi.project(Point(q))
    duraklar = [d_ for d_ in duraklar if min(abs(d_[0] - s), kiyi.length - abs(d_[0] - s)) > 650]
    duraklar.append((s, q))
duraklar.sort()
_imp = Point(OTEL.centroid)
carpan_sahil = np.where(D_KARA > 160, 1 + ((D_KARA - 160) / 140) ** 2,
                        np.where(D_KARA < 70, 1 + ((70 - D_KARA) / 20) ** 2, 1.0))
carpan_sahil = carpan_sahil * np.where(np.hypot(GX - _imp.x, GY - _imp.y) < 230, 4.0, 1.0)
def sahil_halka(donus):
    """Duraklar arası eğim sınırlı aramalar, sırayla (kapalı halkanın ham noktaları)."""
    kullanilan = np.zeros(Z.shape, bool)
    halka = []
    i, atlanan = 0, 0
    while i < len(nok):
        a = nok[i]
        yol = None
        for dene in range(3):
            b_ = nok[(i + 1 + dene) % len(nok)]
            c_ = carpan_sahil * np.where(kullanilan & ~disk(a, 60) & ~disk(b_, 60), 8.0, 1.0)
            yol = yol_ara(a, disk(b_, 12), EGIM["ana"], carpan=c_, pay=600, donus=donus)
            if yol is not None:
                atlanan += dene
                break
        if yol is None:
            sys.exit(f"HATA: Sahil Yolu {a} noktasından ilerleyemedi")
        yol[-1] = b_
        halka.extend(yol[:-1])
        kullanilan |= cizgi_maske([LineString(yol)], 3)
        i += 1 + dene
    return halka, atlanan


nok = [d_[1] for d_ in duraklar]
# halkanın araması dönüş cezasız (İskele'nin içinde kalan kısmı eskisiyle aynı olsun; dışarıda kırıkları doğal hat siler)
halka, atlanan = sahil_halka(0.0)
_ham_halka = list(halka)
# doğal hat (24 Kasım): duraklar arası aramaların kırıkları ip germeyle atlanır, köşeler büyük yarıçapla dönülür.
# İskele'nin sokak dokusu Sahil Yolu'na göre kurulur (köyün ortası yolun üstünde, sokaklar ondan uzak durur):
# köyün içinde Sahil Yolu eski hâliyle kalır (sokak dokusu ayrı iş), yeni hat ona onun yönünde bağlanır.
halka = yumusat(halka, kapali=True, tur=2, sade=3.5)
from shapely.ops import nearest_points, substring  # noqa: E402
_R = LineString(halka + [halka[0]])
_isk = YERLESIM["yerlesim_iskele"]
# korunan yer: köy dokusunun sınırı (koy_dokusu'ndaki gibi, aynı rastgele sayılarla) ve 25 m payı (sokaklar
# Sahil Yolu'ndan 22 m uzak durur)
_rng = np.random.default_rng(sum(map(ord, "yerlesim_iskele")))
_f1, _f2 = _rng.uniform(0, 2 * np.pi, 2)
_th = np.linspace(0, 2 * np.pi, 72, endpoint=False)
_rr = _isk["yaricapM"] * 1.05 * (1 + 0.12 * np.sin(3 * _th + _f1) + 0.07 * np.sin(5 * _th + _f2))
_ci = nearest_points(_R, Point(_isk["xy"]))[0] if _R.distance(Point(_isk["xy"])) < 40 else Point(_isk["xy"])
_koru = Polygon(np.column_stack([_ci.x + _rr * np.cos(_th), _ci.y + _rr * np.sin(_th)])).buffer(25.0)


def _halka_dondur(R, t):
    """Kapalı halkayı t konumundan başlat."""
    t = t % R.length
    a, b = substring(R, t, R.length), substring(R, 0, t)
    return LineString(list(a.coords) + list(b.coords)[1:])


_R = _halka_dondur(_R, _R.project(Point(_isk["xy"])) + _R.length / 2)
_P = _R.intersection(_koru)
_P = max(getattr(_P, "geoms", [_P]), key=lambda g: g.length)
_R = _halka_dondur(_R, min(_R.project(Point(_P.coords[0])), _R.project(Point(_P.coords[-1]))))
_Lp = _P.length
_KORU_HAT = substring(_R, 0, _Lp)
_pe, _ps = _KORU_HAT.coords[-1], _KORU_HAT.coords[0]
# yeni aramanın noktaları kendi sırasıyla: korunan hattın sonundan başına (halkanın köy dışındaki kısmı)
_hh = np.asarray(_ham_halka)
_ie = int(np.argmin(np.hypot(_hh[:, 0] - _pe[0], _hh[:, 1] - _pe[1])))
_is = int(np.argmin(np.hypot(_hh[:, 0] - _ps[0], _hh[:, 1] - _ps[1])))
_sira = [(_ie + k) % len(_hh) for k in range((_is - _ie) % len(_hh) + 1)]
_kb = _koru.buffer(10.0)
_serbest = [tuple(_hh[k]) for k in _sira if not _kb.contains(Point(_hh[k]))]
_yeni = dogal_ara([_pe] + _serbest + [_ps], _yon(_KORU_HAT.interpolate(_Lp - 10).coords[0], _pe),
                  _yon(_ps, _KORU_HAT.interpolate(10).coords[0]), ad="Sahil Yolu", teget=50.0)
halka = [tuple(c) for c in _KORU_HAT.coords] + [tuple(c) for c in _yeni[1:-1]]
# halka eskisi gibi ilk duraktan başlar (yol yatağının boy kesiti halkanın iki ucunda kesilir; İskele'de kalmasın)
_R = _halka_dondur(LineString(halka + [halka[0]]), LineString(halka + [halka[0]]).project(Point(nok[0])))
halka = [tuple(c) for c in _R.coords][:-1]
SAHIL = LineString(halka + [halka[0]])
if not SAHIL.is_simple:
    # kendi üstüne dönen küçük ilmekleri ayıkla: halkanın çokgen dış sınırını al
    SAHIL = Polygon(SAHIL.coords).buffer(0)
    SAHIL = max(SAHIL.geoms, key=lambda g: g.area) if SAHIL.geom_type == "MultiPolygon" else SAHIL
    SAHIL = LineString(SAHIL.exterior.coords)
print(f"  {len(nok)} durak, {atlanan} atlandı, uzunluk {SAHIL.length / 1000:.1f} km, basit: {SAHIL.is_simple}")
# ------------------------------------------------------------------ kıyı köyü (Kemal, 20 Kasım akşam)
# Birahanenin olduğu köy bugünkü haritadaki sokak hatlarıyla aynı: KKM Kurucu'nun kalıcı hâlindeki
# (o günkü src/data/kurucuGomulu.ts; 23 Kasım'dan beri dondurulmuş girdiden, gen/kompakt_eski.py) dokuz yolu (dördü köyü Sahil Yolu'ndan Sahil Yolu'na dolanan kuşak, beşi içteki
# sokaklar) ve Taraftar Birahanesi'nin binası adanın küçültmesiyle (kucult: 0,70, aynı odak) taşınır. Kompakt
# kıyı burada eski kıyının küçültülmüşüdür; köyün kıyıya uzaklığı da 0,70 oranında kalır. Biçim, sıra ve
# bağlanış aynı, yalnız ölçek ve yer değişir. Zemin değişmez (sokaklar eğim sınırının içinde): teras yok,
# kumsal ve kıyı şeridi aynen. Sahil Yolu köyün önünde eski hattının küçültülmüşünden geçer; köyün iki ucu
# ona eski yerlerinden bağlanır. Hattın köy dışındaki kesimleri aynen kalır.
from shapely.ops import nearest_points, substring  # noqa: E402

KK_ID = "yerlesim_stadyum_kiyi"
# (Kurucu kimliği, kademe): kuşak köyü Sahil Yolu'na bağlar (ara), içtekiler köy sokağı
KK_ESKI = [("kurucu_yol_muqydtwz", "ara"), ("kurucu_yol_muqyfr79", "ara"), ("kurucu_yol_muqyfdcj", "ara"),
           ("kurucu_yol_muqygcwx", "ara"), ("kurucu_yol_muqyfdcj_1", "sokak"), ("kurucu_yol_muqyfdcj_2", "sokak"),
           ("kurucu_yol_muqyfdcj_3", "sokak"), ("kurucu_yol_muqyghd4", "sokak"), ("kurucu_yol_muqyh31i", "sokak")]
KK_BIRAHANE_ESKI = "kurucu_bina_mw1zb16h"      # Taraftar Birahanesi (Kurucu'daki madde bağı)


# Kemal 21 Kasım: köy kıyıya doğru bütünüyle kayar (gen/kompakt_zemin.py → duzada-sinirlar.geojson "kaymaM")
KK_KAYMA = tuple(YERLESIM[KK_ID].get("kaymaM", (0.0, 0.0)))


def kk_tasi(x, y):
    """Eski haritadaki kıyı köyü noktası → kompakt adada: küçültme (0,70, aynı odak) + köyün kıyıya kayması."""
    k = kucult(x, y)
    return (k[0] + KK_KAYMA[0], k[1] + KK_KAYMA[1])


def _eskiden(n):
    """Kurucu'nun düz [boylam, enlem, ...] dizisi → kompakt adada metre noktaları."""
    return [kk_tasi(*m((n[i], n[i + 1]))) for i in range(0, len(n), 2)]


KK_HAT = {k: LineString(_eskiden(EK.KIYI_KOYU_YOLLARI[k]["n"])) for k, _ in KK_ESKI}
_ESKI_UZ = {k: LineString([m((n[i], n[i + 1])) for i in range(0, len(n), 2)]).length
            for k, n in ((k, EK.KIYI_KOYU_YOLLARI[k]["n"]) for k, _ in KK_ESKI)}
_es = EK.SAHIL_YOLU
ESKI_SAHIL_K = LineString(_eskiden(_es))          # bugünkü Sahil Yolu'nun küçültülmüşü
# köyün iki ucu: kuşağın ilk ve son yolunun Sahil Yolu'ndaki ucu (eskisinde de orada bağlanır)
_u1 = Point(KK_HAT["kurucu_yol_muqydtwz"].coords[0])
_u2 = Point(KK_HAT["kurucu_yol_muqygcwx"].coords[0])
_t1, _t2 = sorted((ESKI_SAHIL_K.project(_u1), ESKI_SAHIL_K.project(_u2)))
KK_SAHIL_PAY = 100.0                               # köyün iki yanında eski hat bu kadar daha izlenir
CEKIRDEK = substring(ESKI_SAHIL_K, _t1 - KK_SAHIL_PAY, _t2 + KK_SAHIL_PAY)
# Sahil Yolu'nun yönüne çevir
if SAHIL.project(Point(CEKIRDEK.coords[0])) > SAHIL.project(Point(CEKIRDEK.coords[-1])):
    CEKIRDEK = LineString(list(CEKIRDEK.coords)[::-1])
# köy yollarının uçları değdikleri yolun üstüne oturur (küçültmede kayan milimetreler, J1'de eski 4 m'lik açıklık)
for _k in KK_HAT:
    _c = list(KK_HAT[_k].coords)
    for _ui in (0, -1):
        _P = Point(_c[_ui])
        _ad = [g for k2, g in KK_HAT.items() if k2 != _k] + [CEKIRDEK]
        _g = min(_ad, key=lambda g: g.distance(_P))
        if _g.distance(_P) < 4.0:
            _q = _g.interpolate(_g.project(_P))
            _c[_ui] = (_q.x, _q.y)
    KK_HAT[_k] = LineString(_c)
KK_KUSAK = Polygon(list(KK_HAT["kurucu_yol_muqydtwz"].coords) + list(KK_HAT["kurucu_yol_muqyfr79"].coords)[1:]
                   + list(KK_HAT["kurucu_yol_muqyfdcj"].coords)[1:]
                   + list(KK_HAT["kurucu_yol_muqygcwx"].coords)[::-1][1:]).buffer(0)
_kc = unary_union(list(KK_HAT.values())).centroid
print(f"Kıyı köyü: eski haritadaki {len(KK_HAT)} yol 0,70 ile taşındı, köyün ortası kıyıya "
      f"{kiyi.distance(_kc):.0f} m, kuşak {KK_KUSAK.area / 1e4:.2f} ha")

# Sahil Yolu'nun köy kesimi: eski hattın küçültülmüşü (köyün iki yanında 100 m daha) ve iki yanda ilk hatta
# eğim sınırlı arama. Kesim, ilk hattın köy durağına yaptığı kıvrımı da kapsar.
_sk0 = SAHIL.project(Point(m(YERLESIM[KK_ID].get("yumusatmaNokta")) if "yumusatmaNokta" in YERLESIM[KK_ID]
                          else YERLESIM[KK_ID]["xy"]))
_ca, _cb = SAHIL.project(Point(CEKIRDEK.coords[0])), SAHIL.project(Point(CEKIRDEK.coords[-1]))
_sa = min(_sk0 - 550.0, _ca - 300.0)
_sb = 2.0 * round(max(_sk0 + 550.0, _cb + 300.0) / 2.0)   # çift metre: kesim sonrası hücreler aynı kalır
if _sa < 0 or _sb > SAHIL.length:
    sys.exit("HATA: kıyı köyü kesimi Sahil Yolu'nun başlangıcına denk geldi")
_pa, _pb = SAHIL.interpolate(_sa), SAHIL.interpolate(_sb)
_kyasak = YASAK_TEMEL | maske(KK_KUSAK, 8)
_c0, _c1 = CEKIRDEK.coords[0], CEKIRDEK.coords[-1]
_y1 = yol_ara((_pa.x, _pa.y), disk(_c0, 8), EGIM["ana"], pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_kyasak & ~disk(_c0, 20))
_y2 = yol_ara(_c1, disk((_pb.x, _pb.y), 12), EGIM["ana"], pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_kyasak & ~disk(_c1, 20))
if _y1 is None or _y2 is None:
    sys.exit("HATA: Sahil Yolu'nun kıyı köyü kesimi bulunamadı")
# doğal hat (24 Kasım): arama hattı iki yandaki sabit hatlara onların yönünde bağlanır; Sahil Yolu'nun dışarıdaki
# hattından 120 m daha birlikte yeniden çizilir (kavşakta kırık kalmasın)
_BAG = 120.0
_ona = [tuple(c) for c in substring(SAHIL, _sa - _BAG, _sa).coords]
_ard = [tuple(c) for c in substring(SAHIL, _sb, _sb + _BAG).coords]
_cy = _yon(CEKIRDEK.coords[0], CEKIRDEK.interpolate(10).coords[0])
_cy2 = _yon(CEKIRDEK.interpolate(CEKIRDEK.length - 10).coords[0], CEKIRDEK.coords[-1])
_y1 = dogal_ara(_ona[:-1] + list(_y1[:-1]) + [_c0], _yon(_ona[0], SAHIL.interpolate(_sa - _BAG + 10).coords[0]), _cy,
                yasak=_kyasak & ~disk(_c0, 20), ad="Sahil Yolu (kıyı köyü batısı)")
_y2 = dogal_ara([_c1] + list(_y2[1:-1]) + _ard, _cy2, _yon(SAHIL.interpolate(_sb + _BAG - 10).coords[0], _ard[-1]),
                yasak=_kyasak & ~disk(_c1, 20), ad="Sahil Yolu (kıyı köyü doğusu)")
_sa, _sb = _sa - _BAG, _sb + _BAG
_yk = [tuple(c) for c in _y1[:-1]] + list(CEKIRDEK.coords) + [tuple(c) for c in _y2[1:]]
_p1, _p3 = substring(SAHIL, 0, _sa), substring(SAHIL, _sb, SAHIL.length)
SAHIL = LineString(list(_p1.coords)[:-1] + _yk + list(_p3.coords)[1:])
_L0, _Lk = _p1.length + (_sb - _sa) + _p3.length, LineString(_yk).length
_s0 = np.linspace(0, _L0, max(2, int(math.ceil(_L0 / 2.0)) + 1))      # yol yatağının eski örnek noktaları
SAHIL_PARCALAR[id(SAHIL)] = [_p1, LineString(_yk), _p3]
SAHIL_ORNEK = {id(SAHIL): np.r_[_s0[_s0 < _sa], _sa + np.linspace(0, _Lk, max(2, int(math.ceil(_Lk / 2.0)) + 1)),
                                _s0[_s0 > _sb] - _sb + _sa + _Lk]}
print(f"  kıyı köyü kesimi yeniden: {LineString(_yk).length:.0f} m (eski hattın küçültülmüşü {CEKIRDEK.length:.0f} m), "
      f"basit: {SAHIL.is_simple}")
# köyün yeri artık taşınan sokakların ortası (bağlantılar buna göre)
YERLESIM[KK_ID]["xy"] = (_kc.x, _kc.y)

# ------------------------------------------------------------------ Liman kasabası (Kemal, 22 Kasım)
# Liman'ın sokakları eski haritadaki hâliyle aynı (gen/kompakt_liman.py: Kemal'in Kurucu'daki son hâli, oran 0,70,
# odak Dondurmacı Kızlar). Sokaklar köy dokusu üretilmeden olduğu gibi taşınır; eski meydancıklar da. Sahil Yolu
# kasabanın içinden eski hattının taşınmışından geçer (eskisinde de kasabanın ortasından geçiyordu); iki yanda
# ilk hatta eğim sınırlı arama, hattın geri kalanı aynen kalır.
import kompakt_liman as LM  # noqa: E402

LM_ID = "yerlesim_liman"
_lm_sokak, _lm_meydan, _lm_sahil = LM.eski_liman()
LM_HAT = {k: LineString([LM.tasi(*c) for c in hat]) for k, (ad, hat) in _lm_sokak.items()}
LM_AD = {k: ad for k, (ad, hat) in _lm_sokak.items()}
LM_MEYDAN = [Polygon([LM.tasi(*c) for c in p]) for p in _lm_meydan]
LM_ALAN = unary_union(list(LM_HAT.values())).convex_hull
_es = LineString([LM.tasi(*c) for c in _lm_sahil]).intersection(LM_ALAN.buffer(LM.SAHIL_PAY))
LM_CEKIRDEK = max(getattr(_es, "geoms", [_es]), key=lambda g: g.length)
if SAHIL.project(Point(LM_CEKIRDEK.coords[0])) > SAHIL.project(Point(LM_CEKIRDEK.coords[-1])):
    LM_CEKIRDEK = LineString(list(LM_CEKIRDEK.coords)[::-1])
# sokak uçları değdikleri yolun üstüne oturur (eskisinde birkaç metrelik açıklıklar)
for _k in LM_HAT:
    _c = list(LM_HAT[_k].coords)
    for _ui in (0, -1):
        _P = Point(_c[_ui])
        _ad = [g for k2, g in LM_HAT.items() if k2 != _k] + [LM_CEKIRDEK]
        _g = min(_ad, key=lambda g: g.distance(_P))
        if 0.0 < _g.distance(_P) < 4.0:
            _q = _g.interpolate(_g.project(_P))
            _c[_ui] = (_q.x, _q.y)
    LM_HAT[_k] = LineString(_c)
_lc = unary_union(list(LM_HAT.values())).centroid
print(f"Liman: eski haritadaki {len(LM_HAT)} sokak ve {len(LM_MEYDAN)} meydancık oran {LM.ORAN:.2f} ile taşındı, "
      f"kasabanın ortası kıyıya {kiyi.distance(_lc):.0f} m; Sahil Yolu'nun eski hattı kasabada {LM_CEKIRDEK.length:.0f} m")

# Sahil Yolu'nun Liman kesimi: eski hattın taşınmışı ve iki yanda ilk hatta eğim sınırlı arama
_ca, _cb = SAHIL.project(Point(LM_CEKIRDEK.coords[0])), SAHIL.project(Point(LM_CEKIRDEK.coords[-1]))
_sk0 = SAHIL.project(Point(YERLESIM[LM_ID]["xy"]))
_sa = 2.0 * round(min(_sk0 - 550.0, _ca - 300.0) / 2.0)
_sb = 2.0 * round(max(_sk0 + 550.0, _cb + 300.0) / 2.0)
if _sa < 0 or _sb > SAHIL.length:
    sys.exit("HATA: Liman kesimi Sahil Yolu'nun başlangıcına denk geldi")
_pa, _pb = SAHIL.interpolate(_sa), SAHIL.interpolate(_sb)
_lyasak = YASAK_TEMEL | maske(LM_ALAN, 8)
_c0, _c1 = LM_CEKIRDEK.coords[0], LM_CEKIRDEK.coords[-1]
_y1 = yol_ara((_pa.x, _pa.y), disk(_c0, 8), EGIM["ana"], pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_lyasak & ~disk(_c0, 20))
_y2 = yol_ara(_c1, disk((_pb.x, _pb.y), 12), EGIM["ana"], pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_lyasak & ~disk(_c1, 20))
if _y1 is None or _y2 is None:
    sys.exit("HATA: Sahil Yolu'nun Liman kesimi bulunamadı")
# kasabanın 20 m dışına kadar eski hat birebir; ötesindeki uzantı bağlantıyla birlikte yumuşatılır (kavşakta kırık kalmasın)
_tam = LM_CEKIRDEK.intersection(LM_ALAN.buffer(20.0))
_tam = max(getattr(_tam, "geoms", [_tam]), key=lambda g: g.length)
_t0 = min(LM_CEKIRDEK.project(Point(_tam.coords[0])), LM_CEKIRDEK.project(Point(_tam.coords[-1])))
_t1 = max(LM_CEKIRDEK.project(Point(_tam.coords[0])), LM_CEKIRDEK.project(Point(_tam.coords[-1])))
_e0, _e1 = substring(LM_CEKIRDEK, 0, _t0), substring(LM_CEKIRDEK, _t1, LM_CEKIRDEK.length)
_tam = substring(LM_CEKIRDEK, _t0, _t1)
# doğal hat (24 Kasım): kıyı köyündeki gibi; kasabanın eski hattına onun yönünde girer, dışarıda 120 m birlikte
_ona = [tuple(c) for c in substring(SAHIL, _sa - _BAG, _sa).coords]
_ard = [tuple(c) for c in substring(SAHIL, _sb, _sb + _BAG).coords]
_ty = _yon(_tam.coords[0], _tam.interpolate(10).coords[0])
_ty2 = _yon(_tam.interpolate(_tam.length - 10).coords[0], _tam.coords[-1])
_y1 = dogal_ara(_ona[:-1] + list(_y1[:-1]) + list(_e0.coords), _yon(_ona[0], SAHIL.interpolate(_sa - _BAG + 10).coords[0]),
                _ty, yasak=_lyasak, ad="Sahil Yolu (Liman batısı)")
_y2 = dogal_ara(list(_e1.coords) + list(_y2[1:-1]) + _ard, _ty2, _yon(SAHIL.interpolate(_sb + _BAG - 10).coords[0], _ard[-1]),
                yasak=_lyasak, ad="Sahil Yolu (Liman doğusu)")
_sa, _sb = _sa - _BAG, _sb + _BAG
_yk = [tuple(c) for c in _y1[:-1]] + list(_tam.coords) + [tuple(c) for c in _y2[1:]]
SAHIL_ONCEKI, LM_KESIM = SAHIL, (_sa, _sb)     # Liman kesiminden önceki hat (ana daldaki) ve değişen aralık
_eski_par = SAHIL_PARCALAR.pop(id(SAHIL))
_eski_orn = SAHIL_ORNEK.pop(id(SAHIL))
SAHIL_ONCEKI_ORNEK = _eski_orn
_yeni_par, _t = [], 0.0
for _q in _eski_par:          # kıyı köyü kesimi dışındaki parçalardan Liman aralığı çıkar
    _a, _b = _t, _t + _q.length
    if _b <= _sa or _a >= _sb:
        _yeni_par.append(_q)
    else:
        if _sa > _a:
            _yeni_par.append((_q, -1.0, _sa - _a))
        if _a <= _sa:
            _yeni_par.append(LineString(_yk))
        if _sb < _b:
            _yeni_par.append((_q, _sb - _a, math.inf))
    _t = _b
_p1, _p3 = substring(SAHIL, 0, _sa), substring(SAHIL, _sb, SAHIL.length)
SAHIL = LineString(list(_p1.coords)[:-1] + _yk + list(_p3.coords)[1:])
_Lk = LineString(_yk).length
LIMAN_KESIM_BOY = _Lk
SAHIL_PARCALAR[id(SAHIL)] = _yeni_par
SAHIL_ORNEK[id(SAHIL)] = np.r_[_eski_orn[_eski_orn < _sa], _sa + np.linspace(0, _Lk, max(2, int(math.ceil(_Lk / 2.0)) + 1)),
                               _eski_orn[_eski_orn > _sb] - _sb + _sa + _Lk]
print(f"  Liman kesimi yeniden: {_Lk:.0f} m (eski hattın taşınmışı {LM_CEKIRDEK.length:.0f} m), basit: {SAHIL.is_simple}")
YERLESIM[LM_ID]["xy"] = (_lc.x, _lc.y)
SAHIL_KATMAN = [dict(onceki=SAHIL_ONCEKI, ornek=SAHIL_ONCEKI_ORNEK, kesim=LM_KESIM, boy=LIMAN_KESIM_BOY, ad="Liman")]

# ------------------------------------------------------------------ İskele köyü (Kemal, 24 Kasım)
# İskele'nin sokakları eski haritadaki hâliyle aynı (gen/kompakt_iskele.py: Kemal'in Kurucu'daki son hâli, adanın
# küçültmesiyle, oran 0,70). Sokaklar köy dokusu üretilmeden olduğu gibi taşınır; eski meydancıklar da. Sahil Yolu köyün
# içinden eski hattının taşınmışından geçer (eskisinde köyün kuzeyinden, sokaklar ona göre kurulmuştu); iki yanda ilk hatta
# eğim sınırlı arama ve doğal hat, hattın geri kalanı aynen kalır (Liman'daki gibi). Liman kesiminden sonra yapılır:
# Sahil Yolu'nun Liman'daki hâli değişmez.
import kompakt_iskele as IS  # noqa: E402

IS_ID = "yerlesim_iskele"
if any(abs(a - b) > 1e-6 for a, b in zip(IS.ODAK + (IS.ORAN,), tuple(B["odak"]) + (B["olcek"],))):
    sys.exit("HATA: gen/kompakt_iskele.py'deki küçültme zeminin küçültmesiyle aynı değil")
_is_sokak, _is_meydan, _is_sahil = IS.eski_iskele()
IS_HAT = {k: LineString([IS.tasi(*c) for c in hat]) for k, (ad, kd, hat) in _is_sokak.items()}
IS_AD = {k: ad for k, (ad, kd, hat) in _is_sokak.items()}
IS_KADEME = {k: kd for k, (ad, kd, hat) in _is_sokak.items()}
IS_MEYDAN = [Polygon([IS.tasi(*c) for c in p]) for p in _is_meydan]
# köyün alanı seyreltmeden önceki bütün sokaklarla (Sahil Yolu'nun köydeki eski hattı aynı kalsın; 24 Kasım)
IS_ALAN = unary_union([LineString([IS.tasi(*c) for c in hat]) for _, _, hat in IS.eski_iskele(hepsi=True)[0].values()]).convex_hull
_es = LineString([IS.tasi(*c) for c in _is_sahil]).intersection(IS_ALAN.buffer(IS.SAHIL_PAY))
IS_CEKIRDEK = max(getattr(_es, "geoms", [_es]), key=lambda g: g.length)
if SAHIL.project(Point(IS_CEKIRDEK.coords[0])) > SAHIL.project(Point(IS_CEKIRDEK.coords[-1])):
    IS_CEKIRDEK = LineString(list(IS_CEKIRDEK.coords)[::-1])
# sokak uçları değdikleri yolun üstüne oturur (eskisinde birkaç metrelik açıklıklar)
for _k in IS_HAT:
    _c = list(IS_HAT[_k].coords)
    for _ui in (0, -1):
        _P = Point(_c[_ui])
        _ad = [g for k2, g in IS_HAT.items() if k2 != _k] + [IS_CEKIRDEK]
        _g = min(_ad, key=lambda g: g.distance(_P))
        if 0.0 < _g.distance(_P) < 4.0:
            _q = _g.interpolate(_g.project(_P))
            _c[_ui] = (_q.x, _q.y)
    IS_HAT[_k] = LineString(_c)
_ic = unary_union(list(IS_HAT.values())).centroid
print(f"İskele: eski haritadaki {len(IS_HAT)} sokak ve {len(IS_MEYDAN)} meydancık oran {IS.ORAN:.2f} ile taşındı, "
      f"köyün ortası kıyıya {kiyi.distance(_ic):.0f} m, sokaklar kıyıya en az "
      f"{kiyi.distance(unary_union(list(IS_HAT.values()))):.0f} m; Sahil Yolu'nun eski hattı köyde {IS_CEKIRDEK.length:.0f} m")


def _parca_bol(parcalar_, sa, sb, yeni):
    """Sahil Yolu'nun kesim listesinden [sa, sb] aralığını çıkarıp yerine yeni kesimi koyar. Kesim ya çizgidir ya
    (çizgi, baş, son): çizginin yalnız [baş, son] aralığı (cizgi_maske eski örnek noktalarını korur)."""
    out, t, kondu = [], 0.0, False
    for q in parcalar_:
        g_, lo, hi = q if isinstance(q, tuple) else (q, -1.0, math.inf)
        a0, a1 = max(lo, 0.0), min(hi, g_.length)
        A, Bb = t, t + (a1 - a0)
        if Bb <= sa or A >= sb:
            out.append(q)
        else:
            if sa > A:
                out.append((g_, lo, a0 + (sa - A)))
            if not kondu:
                out.append(yeni)
                kondu = True
            if sb < Bb:
                out.append((g_, a0 + (sb - A), hi))
        t = Bb
    return out


# Sahil Yolu'nun İskele kesimi: eski hattın taşınmışı ve iki yanda ilk hatta eğim sınırlı arama (Liman'daki gibi)
_ca, _cb = SAHIL.project(Point(IS_CEKIRDEK.coords[0])), SAHIL.project(Point(IS_CEKIRDEK.coords[-1]))
_sk0 = SAHIL.project(Point(YERLESIM[IS_ID]["xy"]))
_sa = 2.0 * round(min(_sk0 - 550.0, _ca - 300.0) / 2.0)
# doğu ucu: eski hat köyün doğusunda yüksekte (46 m) biter, The Imperial koyunun yamacından inilir. Kesim eski hattın
# ucundan 500 m sonra ilk hatta katılır ve iniş araması sınırın 1,5 katıyla yapılır (yumuşak kural, doğal hat): yoksa
# yamaçta U dönüşü (keskin dirsek) ve derin yarma oluyordu (DENEME)
_sb = 2.0 * round(max(_sk0 + 550.0, _cb + 500.0) / 2.0)
if _sa - _BAG < 0 or _sb + _BAG > SAHIL.length:
    sys.exit("HATA: İskele kesimi Sahil Yolu'nun başlangıcına denk geldi")
_pa, _pb = SAHIL.interpolate(_sa), SAHIL.interpolate(_sb)
_iyasak = YASAK_TEMEL | maske(IS_ALAN, 8)
_c0, _c1 = IS_CEKIRDEK.coords[0], IS_CEKIRDEK.coords[-1]
_y1 = yol_ara((_pa.x, _pa.y), disk(_c0, 8), EGIM["ana"], pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_iyasak & ~disk(_c0, 20))
_y2 = yol_ara(_c1, disk((_pb.x, _pb.y), 12), EGIM["ana"] * 1.5, pay=600, donus=DONUS_CEZA, carpan=carpan_sahil, yasak=_iyasak & ~disk(_c1, 20))
if _y1 is None or _y2 is None:
    sys.exit("HATA: Sahil Yolu'nun İskele kesimi bulunamadı")
# köyün 20 m dışına kadar eski hat birebir; ötesindeki uzantı bağlantıyla birlikte yumuşatılır (kavşakta kırık kalmasın)
_tam = IS_CEKIRDEK.intersection(IS_ALAN.buffer(20.0))
_tam = max(getattr(_tam, "geoms", [_tam]), key=lambda g: g.length)
_t0 = min(IS_CEKIRDEK.project(Point(_tam.coords[0])), IS_CEKIRDEK.project(Point(_tam.coords[-1])))
_t1 = max(IS_CEKIRDEK.project(Point(_tam.coords[0])), IS_CEKIRDEK.project(Point(_tam.coords[-1])))
_e0, _e1 = substring(IS_CEKIRDEK, 0, _t0), substring(IS_CEKIRDEK, _t1, IS_CEKIRDEK.length)
_tam = substring(IS_CEKIRDEK, _t0, _t1)
_ona = [tuple(c) for c in substring(SAHIL, _sa - _BAG, _sa).coords]
_ard = [tuple(c) for c in substring(SAHIL, _sb, _sb + _BAG).coords]
_ty = _yon(_tam.coords[0], _tam.interpolate(10).coords[0])
_ty2 = _yon(_tam.interpolate(_tam.length - 10).coords[0], _tam.coords[-1])
_y1 = dogal_ara(_ona[:-1] + list(_y1[:-1]) + list(_e0.coords), _yon(_ona[0], SAHIL.interpolate(_sa - _BAG + 10).coords[0]),
                _ty, yasak=_iyasak, ad="Sahil Yolu (İskele batısı)")
_y2 = dogal_ara(list(_e1.coords) + list(_y2[1:-1]) + _ard, _ty2, _yon(SAHIL.interpolate(_sb + _BAG - 10).coords[0], _ard[-1]),
                yasak=_iyasak, ad="Sahil Yolu (İskele doğusu)")
_sa, _sb = _sa - _BAG, _sb + _BAG
_yk = [tuple(c) for c in _y1[:-1]] + list(_tam.coords) + [tuple(c) for c in _y2[1:]]
_onceki, _onceki_orn = SAHIL, SAHIL_ORNEK.pop(id(SAHIL))
_eski_par = SAHIL_PARCALAR.pop(id(SAHIL))
_p1, _p3 = substring(SAHIL, 0, _sa), substring(SAHIL, _sb, SAHIL.length)
SAHIL = LineString(list(_p1.coords)[:-1] + _yk + list(_p3.coords)[1:])
_Lk = LineString(_yk).length
SAHIL_PARCALAR[id(SAHIL)] = _parca_bol(_eski_par, _sa, _sb, LineString(_yk))
SAHIL_ORNEK[id(SAHIL)] = np.r_[_onceki_orn[_onceki_orn < _sa], _sa + np.linspace(0, _Lk, max(2, int(math.ceil(_Lk / 2.0)) + 1)),
                               _onceki_orn[_onceki_orn > _sb] - _sb + _sa + _Lk]
SAHIL_KATMAN.append(dict(onceki=_onceki, ornek=_onceki_orn, kesim=(_sa, _sb), boy=_Lk, ad="İskele"))
print(f"  İskele kesimi yeniden: {_Lk:.0f} m (eski hattın taşınmışı {IS_CEKIRDEK.length:.0f} m), basit: {SAHIL.is_simple}")
YERLESIM[IS_ID]["xy"] = (_ic.x, _ic.y)
ekle(SAHIL, "ana", "Sahil Yolu", genislik=9.0)

# ================================================================== 2. köy dokuları (Ege köyü)
print("Köy dokuları ...")
from contourpy import contour_generator  # noqa: E402


def kontur_acisi(xy):
    Zs = ndimage.gaussian_filter(Z0, 15)
    gy_, gx_ = np.gradient(Zs, H)
    gx, gy = float(ornek(gx_, *xy)), float(ornek(gy_, *xy))
    return math.degrees(math.atan2(gx, -gy))     # eş yükselti yönü (eğime dik)


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
# Liman ve İskele köy dokusuyla üretilmez: eski haritadaki sokakları taşınır (aşağıda, Kemal 22 ve 24 Kasım)
for _yid, _ara in (("yerlesim_ciftlik", 90.0),):
    koy_dokusu(_yid, _ara)

# ------------------------------------------------------------------ kıyı köyü (Taraftar Birahanesi)
# Bugünkü haritadaki köyün sokakları, taşınmış hâliyle (yukarıda KK_HAT). Birahanenin yeri: modelinin tabanı
# (Kemal 21 Kasım: ayrılan yer modele göre büyüsün; taraftar-birahanesi.glb 20 x 27,5 m, DENEME), önündeki
# kuşak yolunun aynı yerinde ve aynı yanında (Kuzey Plajı'na bakar; eskisi 22 x 15 m idi). Eskisinde
# bina yolun kenarına bitişikti; ölçek küçülünce bina yola binmesin diye ön yüzü yol kenarından 1,5 m geride
# durur (yol boyundaki yeri değişmez). Bina 3. adımda.
_ky = KK_ID
for _k, _kd in KK_ESKI:
    kaynak_ekle(KK_HAT[_k], _ky, _kd, "kiyi")
_bb = dict(EK.KIYI_KOYU_BIRAHANE)   # Kurucu'daki KK_BIRAHANE_ESKI
_bb["en"], _bb["boy"] = 20.0, 27.5     # DENEME: modelin tabanı (cephe x derinlik)
KK_BIRAHANE_TASINMIS = Point(kk_tasi(*m((_bb["x"], _bb["y"]))))
_on = KK_HAT["kurucu_yol_muqyfdcj"]
_P = _on.interpolate(_on.project(KK_BIRAHANE_TASINMIS))
_tt = np.subtract(_on.coords[-1], _on.coords[0])
_tt = _tt / np.hypot(*_tt)
_nn = np.array([-_tt[1], _tt[0]])
if np.dot(_nn, [KK_BIRAHANE_TASINMIS.x - _P.x, KK_BIRAHANE_TASINMIS.y - _P.y]) < 0:
    _nn = -_nn                                                  # eskisindeki yanına
_bm = np.array([_P.x, _P.y]) + _nn * (GENISLIK["ara"] / 2 + 1.5 + _bb["boy"] / 2)
BIRAHANE_YERI = Polygon([tuple(_bm + a_ * _bb["en"] / 2 * _tt + b_ * _bb["boy"] / 2 * _nn)
                         for a_, b_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
_bc = min((k["geom"].distance(BIRAHANE_YERI) - k["genislik"] / 2,) for k in KOY_HAT if k["koy"] == _ky)
YASAK_TEMEL = YASAK_TEMEL | maske(BIRAHANE_YERI, 3)
print(f"  birahane yeri: {_bb['en']:.0f} x {_bb['boy']:.0f} m, taşınmış eski yerinden "
      f"{BIRAHANE_YERI.centroid.distance(KK_BIRAHANE_TASINMIS):.1f} m geride, kıyıya {BIRAHANE_YERI.distance(kiyi):.0f} m, "
      f"Sahil Yolu'na {BIRAHANE_YERI.distance(SAHIL):.0f} m, en yakın yol kenarına {_bc[0]:.1f} m")
for _k, _kd in KK_ESKI:
    print(f"  {_k}: {_kd}, eski {_ESKI_UZ[_k]:.0f} m → {KK_HAT[_k].length:.0f} m, en dik %{100 * en_buyuk_egim(KK_HAT[_k]):.1f}")
print(f"  Sahil Yolu'nun köy önü (eski hattın küçültülmüşü): {CEKIRDEK.length:.0f} m, en dik %{100 * en_buyuk_egim(CEKIRDEK):.1f}")

# ------------------------------------------------------------------ Liman kasabası (Kemal, 22 Kasım)
# Eski haritadaki sokaklar ve meydancıklar, taşınmış hâliyle (yukarıda LM_HAT). Hepsi köy sokağı; adı olan
# (Liman Kordonu, geçici ad) adıyla gelir. Kavşaktan taşan kısa uçlar da kalır (eskisinde de öyleydi).
for _k, _g in LM_HAT.items():
    kaynak_ekle(_g, LM_ID, "sokak", "liman", ad=LM_AD[_k])
for _g in LM_MEYDAN:
    MEYDANCIK.append(dict(koy=LM_ID, geom=_g))
_lm_dik = sorted(((en_buyuk_egim(g), k) for k, g in LM_HAT.items()), reverse=True)
print(f"  Liman: {len(LM_HAT)} sokak, en dik %{100 * _lm_dik[0][0]:.1f} ({_lm_dik[0][1]}), "
      f"%15'i aşan {sum(1 for e, _ in _lm_dik if e > EGIM['sokak'])}; Sahil Yolu'nun kasabadaki eski hattı en dik "
      f"%{100 * en_buyuk_egim(LM_CEKIRDEK):.1f}")

# ------------------------------------------------------------------ İskele köyü (Kemal, 24 Kasım)
# Eski haritadaki sokaklar ve meydancıklar, taşınmış hâliyle (yukarıda IS_HAT). Kemsköy Caddesi adıyla, ara kademe
# asfalt (eskisinde de köyün caddesiydi; genişliği bugünkü adlı caddeyle aynı); Kemal'in köye çizdiği iki ana yol ara
# kademe; öbürleri köy sokağı. Kavşaktan taşan kısa uçlar da kalır (eskisinde de öyleydi).
for _k, _g in IS_HAT.items():
    if IS_AD[_k] == "Kemsköy Caddesi":
        kaynak_ekle(_g, IS_ID, "ara", "iskele", yuzey="asfalt", genislik=10.0, ad=IS_AD[_k])
    else:
        kaynak_ekle(_g, IS_ID, IS_KADEME[_k], "iskele", ad=IS_AD[_k])
for _g in IS_MEYDAN:
    MEYDANCIK.append(dict(koy=IS_ID, geom=_g))
# Kemsköy Caddesi'nin doğu ucu eskisinde Kemal'in The Imperial'e inen yoluna bağlanıyordu; o yolun Sahil Yolu'na kadarki
# başı eski hattıyla gelir (otele Otel Yolu iner): cadde çıkmaz kalmaz
for _k, _kd, _hat in IS.sahile_kadar():
    _g = LineString([IS.tasi(*c) for c in _hat])
    _x = _g.intersection(SAHIL)
    _xs = sorted((_g.project(q) for q in getattr(_x, "geoms", [_x]) if not _x.is_empty), key=float)
    if _xs:
        _q = _g.interpolate(_xs[0])
        _gk = substring(_g, 0, _xs[0])
        _gk = LineString(list(_gk.coords)[:-1] + [SAHIL.interpolate(SAHIL.project(_q)).coords[0]])
        _e = en_buyuk_egim(_gk)
        if _e > 0.93 * EGIM["sokak"]:       # koyun yamacı: basamaklı geçit (zemin düzlenmez; DENEME)
            kaynak_ekle(_gk, IS_ID, "gecit", "iskele", yuzey="basamak", genislik=2.5)
        else:
            kaynak_ekle(_gk, IS_ID, _kd if _e <= 0.9 * EGIM[_kd] else "sokak", "iskele")
        print(f"  İskele: {_k} Sahil Yolu'na kadar {_gk.length:.0f} m (eski hattı), en dik %{100 * _e:.0f}")
_is_dik = sorted(((en_buyuk_egim(g), k) for k, g in IS_HAT.items()), reverse=True)
print(f"  İskele: {len(IS_HAT)} sokak, en dik %{100 * _is_dik[0][0]:.1f} ({_is_dik[0][1]}), "
      f"%15'i aşan {sum(1 for e, _ in _is_dik if e > EGIM['sokak'])}; Sahil Yolu'nun köydeki eski hattı en dik "
      f"%{100 * en_buyuk_egim(IS_CEKIRDEK):.1f}")


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


# Kemsköy Caddesi eski haritadaki hattıyla gelir (yukarıda, İskele köyü; Kemal 24 Kasım)
# Liman Caddesi ve Liman Bağlantısı Kemal'in Kurucu'daki son hâlinde gizliydi; Liman eski sokaklarıyla gelince
# ad bir sokağa konmaz (Kemal 22 Kasım; karar Kemal'in)
LIMAN_CADDESI = None


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
    kalan = [k for k, b_ in zip(SOKAK_KENAR, bu) if k.get("ad") or k["aile"] in ("halka", "liman", "iskele")
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
# Liman'ın ve İskele'nin eski sokakları kendi sayı akışlarıyla; öbür köyler ana daldaki akışla: ana dalda (#266) Merkez ve
# Stadyum'dan sonra üretilmiş Liman sokaklarının çektiği 85 sayı ve İskele'nin eski köy dokusunun çektiği 33 sayı (24 Kasım,
# İskele eski sokaklarıyla gelmeden önceki hâl) atlanır: Çiftlik ve kıyı köyünün daralan sokakları aynı kalır.
_rng, _lm_rng, _is_rng = np.random.default_rng(11), np.random.default_rng(22), np.random.default_rng(33)
_atla = 85 + 33
for k in SOKAK_KENAR:
    if _atla and k["koy"] not in ("yerlesim_merkez", "yerlesim_stadyum", LM_ID, IS_ID):
        _rng.random(_atla)
        _atla = 0
    if k["kademe"] == "sokak" and not k.get("ad") and (_lm_rng if k["koy"] == LM_ID else _is_rng if k["koy"] == IS_ID
                                                          else _rng).random() < 0.3:
        k["genislik"] = 4.0
# İskele'nin eski sokaklarından kıyı yamacına inen dik parçalar (kavşaktan kavşağa) basamaklı geçit olur: hattı aynı, zemin
# düzlenmez (Kemal 24 Kasım: zemin düzleme yok); Ege köylerindeki gibi merdivenli sokak (DENEME)
_is_bas = [k for k in SOKAK_KENAR if k["koy"] == IS_ID and k["kademe"] == "sokak" and not k.get("ad")
           and en_buyuk_egim(k["geom"]) > 0.93 * EGIM["sokak"]]
for k in _is_bas:
    k.update(kademe="gecit", yuzey="basamak", genislik=2.5)
print(f"  İskele: {len(_is_bas)} dik sokak parçası basamaklı ({sum(k['geom'].length for k in _is_bas):.0f} m)")
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
# sekiden çıkış noktası köyün kaymadan önceki yerine göre seçilir: stat çevresi ve stat köyü aynı kalsın (Kemal 21 Kasım)
ky_cikis = (ky[0] - KK_KAYMA[0], ky[1] - KK_KAYMA[1])
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
    _puan = abs(float(ornek(_Zilk, *_dis)) - SEKI_KOT) + 0.01 * Point(ky_cikis).distance(_q)
    if _puan < _en_iyi:
        _sq, _en_iyi = _q, _puan
# eskisinde köyün batı ucunun Sahil Yolu'na bağlandığı yere iner
_j1 = KK_HAT["kurucu_yol_muqydtwz"].coords[0]
_sbg = baglanti((_sq.x, _sq.y), disk(_j1, 10),
                "ana", "Stadyum Bağlantısı", pay=1200, sinir_carpan=0.8, kes=False)   # sekiden inişte yatağa uysun
if _sbg is not None and Point(_sbg["geom"].coords[-1]).distance(Point(_j1)) < 12.0:
    _sbg["geom"] = LineString(list(_sbg["geom"].coords)[:-1] + [_j1])   # köyün kuşak yoluyla aynı kavşakta
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
    yol = yol_ara(hd, ag_maske(), EGIM["toprak"], pay=500, donus=DONUS_CEZA)
    if yol is None:
        continue
    yol = dogal_hat(ucu_aga_bagla(yol), "toprak", EGIM["toprak"], yasak=YASAK_TEMEL & ~disk(hd, 20), ad="tarla yolu")[::-1]
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
    kalan = [y for y, b_ in zip(YOLLAR, bu) if y["ad"] or y["tur"] not in ("ara", "sokak", "gecit") or y["grup"] == LM_ID
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
    """z'yi hiçbir yerde aşmayan, eğimi lim'i geçmeyen en yüksek profil (yol zemini kazar, doldurmaz).
    lim tek sayı ya da kesim başına dizi (yumuşak kuralla aşılan yerde daha büyük)."""
    z = z.copy()
    lim = np.broadcast_to(np.asarray(lim, float), (len(z),))
    for i_ in range(1, len(z)):
        z[i_] = min(z[i_], z[i_ - 1] + lim[i_] * ds[i_ - 1])
    for i_ in range(len(z) - 2, -1, -1):
        z[i_] = min(z[i_], z[i_ + 1] + lim[i_] * ds[i_])
    return z


def sinirla_sabit(z, ds, lim, sabit):
    """Kavşakta (sabit) kot öbür yolunki kalır; aradaki noktalar eğim sınırına çekilir."""
    z = z.copy()
    lim = np.broadcast_to(np.asarray(lim, float), (len(z),))
    for _ in range(3):
        for i_ in range(1, len(z)):
            if not sabit[i_]:
                z[i_] = min(max(z[i_], z[i_ - 1] - lim[i_] * ds[i_ - 1]), z[i_ - 1] + lim[i_] * ds[i_ - 1])
        for i_ in range(len(z) - 2, -1, -1):
            if not sabit[i_]:
                z[i_] = min(max(z[i_], z[i_ + 1] - lim[i_] * ds[i_]), z[i_ + 1] + lim[i_] * ds[i_])
    return z


def sinirla(z, ds, lim):
    lim = np.broadcast_to(np.asarray(lim, float), (len(z),))
    zf = z.copy()
    for i_ in range(1, len(z)):
        zf[i_] = min(max(zf[i_], zf[i_ - 1] - lim[i_] * ds[i_ - 1]), zf[i_ - 1] + lim[i_] * ds[i_ - 1])
    zb = z.copy()
    for i_ in range(len(z) - 2, -1, -1):
        zb[i_] = min(max(zb[i_], zb[i_ + 1] - lim[i_] * ds[i_]), zb[i_ + 1] + lim[i_] * ds[i_])
    return 0.5 * (zf + zb)


ASIM_AGAC = STRtree(ASIM_HAT) if ASIM_HAT else None


def asim_bolgesi(p):
    """Yolun örnek noktalarından doğal hattın yumuşak kuralla aştığı düz kesime (8 m yakın, koşut) düşenler."""
    n = len(p)
    if ASIM_AGAC is None or n < 2:
        return np.zeros(n, bool)
    yon = np.gradient(p, axis=0)
    yon = yon / np.maximum(np.hypot(*yon.T), 1e-9)[:, None]
    out = np.zeros(n, bool)
    for k in range(n):
        P = Point(p[k])
        for j in ASIM_AGAC.query(P, predicate="dwithin", distance=8.0):
            c = np.asarray(ASIM_HAT[int(j)].coords)
            v = (c[1] - c[0]) / max(np.hypot(*(c[1] - c[0])), 1e-9)
            if abs(float(v @ yon[k])) > 0.94:
                out[k] = True
                break
    return out


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
    if id(g) in SAHIL_ORNEK and y["ad"] == "Sahil Yolu":
        y["sahil_i"] = i_       # profil katman katman: ana daldaki hat, Liman kesimi, İskele kesimi (sahil_profili)

def _lim_dizisi(y, p, ds, lim):
    """Boy kesitinin eğim sınırı, nokta başına. Yumuşak kural (24 Kasım): doğal hattın sınırı aştığı düz kesimde
    boy kesiti de o kadar dik olabilir (sınırın ASIM_ORAN katına kadar), geçiş ~30 m; yoksa yatak derin yarma olurdu."""
    if y["tur"] not in EGIM or y["tur"] == "patika" or len(p) < 3:
        return lim
    az = asim_bolgesi(p)
    if not az.any():
        return lim
    w = np.clip(ndimage.gaussian_filter1d(az.astype(float), 15.0 / max(float(np.median(ds)), 0.5), mode="nearest") * 2.0, 0, 1)
    return lim + w * (EGIM[y["tur"]] * ASIM_ORAN * 0.97 - lim)


def _profil(y, s, p):
    """Yolun boy kesiti (yol yatağının profili), köprü kesimleri ve zemin kotu: (zp, kop, zg)."""
    n = len(s)
    ds = np.diff(s)
    lim = _lim_dizisi(y, p, ds, EGIM[y["tur"]] * (0.85 if y["tur"] in ("ana", "ara") else 0.93))
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
    return zp, kop, zg


def _katman_ornegi(i_, k):
    """k. değişiklikten önceki Sahil Yolu hattı, o hattın örnek noktalarıyla (kavşaklar dahil)."""
    go_ = SAHIL_KATMAN[k]["onceki"]
    eko = [go_.project(Point(c)) for j_, c in UCLAR if j_ != i_ and go_.distance(Point(c)) < 0.3]
    so_ = np.unique(np.r_[np.clip(SAHIL_KATMAN[k]["ornek"], 0, go_.length), eko])
    so_ = so_[np.r_[True, np.diff(so_) > 0.05]]
    return so_, np.array([go_.interpolate(t).coords[0] for t in so_])


def sahil_profili(y, k, s, p):
    """Sahil Yolu'nun k değişiklikten sonraki hattının boy kesiti: (zp, kop, zg, p). Değişen kesimin dışında profil, nokta
    ve köprü bir önceki hattınki (aynı örnek noktaları, aynı zemin); kesimin içinde yeni hat, uçlarda 60 m'de öncekine
    bağlanır. Katmanlar sırayla: ana daldaki hat → Liman kesimi (22 Kasım) → İskele kesimi (24 Kasım)."""
    zp, kop, zg = _profil(y, s, p)
    if k == 0:
        return zp, kop, zg, p
    so, po = _katman_ornegi(y["sahil_i"], k - 1)
    zo, ko, go, po = sahil_profili(y, k - 1, so, po)
    _sa, _sb = SAHIL_KATMAN[k - 1]["kesim"]
    _boy = SAHIL_KATMAN[k - 1]["boy"]
    _dk = (_sa + _boy) - _sb
    sol, sag = s < _sa - 1e-3, s > _sa + _boy + 1e-3     # kesimin iki ucu kesimin içinde sayılır
    io = np.where(sol, np.searchsorted(so, s - 1e-6), np.searchsorted(so, s - _dk - 1e-6)).clip(0, len(so) - 1)
    dis = (sol | sag) & (np.abs(np.where(sol, s, s - _dk) - so[io]) < 1e-3)
    zb0, zb1 = zo[io[sol][-1]], zo[io[sag][0]]
    zn0, zn1 = zp[np.nonzero(sol)[0][-1]], zp[np.nonzero(sag)[0][0]]
    ic = ~(sol | sag)
    d0, d1 = s - _sa, _sa + _boy - s
    zp = np.where(ic, zp + (zb0 - zn0) * np.clip(1 - d0 / 60.0, 0, 1) + (zb1 - zn1) * np.clip(1 - d1 / 60.0, 0, 1), zp)
    zp = np.where(dis, zo[io], zp)
    _lim = np.broadcast_to(_lim_dizisi(y, p, np.diff(s), EGIM[y["tur"]] * 0.85), (len(s),))
    zp = sinirla_sabit(zp, np.diff(s), _lim, dis)     # kesimin içi eğim sınırına çekilir, dışı sabit
    kop = np.where(dis, ko[io], kop)
    zg = np.where(dis, go[io], zg)
    p = np.where(dis[:, None], po[io], p)
    if (~dis & (sol | sag)).any():
        print(f"  UYARI: Sahil Yolu'nun {int((~dis & (sol | sag)).sum())} örnek noktası {SAHIL_KATMAN[k - 1]['ad']} "
              f"kesiminden önceki hatla eşleşmedi (s: {', '.join(f'{v:.1f}' for v in s[~dis & (sol | sag)][:5])}; hat {s[-1]:.1f})")
    return zp, kop, zg, p


for y in YOLLAR:
    s, p = y["s"], y["p"]
    n = len(s)
    if y["tur"] in ("patika", "merdiven") or y["yuzey"] == "basamak":
        continue
    ds = np.diff(s)
    zp, kop, zg = _profil(y, s, p)
    if "sahil_i" in y:
        # Sahil Yolu: değişen kesimlerin (Liman, İskele) dışında profil, nokta ve köprü ana daldaki hattınki
        zp, kop, zg, p = sahil_profili(y, len(SAHIL_KATMAN), s, p)
        y["p"] = p
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
# Sahil Yolu: son değişen kesimin (İskele, 24 Kasım) dışındaki noktalar ana daldakiyle aynı (gen/kompakt-sahil-ana.json;
# Liman kesimi o dosyada zaten var); yalnız İskele kesimi yeni. Böylece öbür köylerin arsaları yeniden dizilmez (Kemal,
# 22 Kasım). Kesimin iki ucunda 30 m pay.
SAHIL_ANA = json.load(open(os.path.join(BURASI, "kompakt-sahil-ana.json"), encoding="utf-8"))["koordinatlar"]
_say = next(y for y in YOLLAR if y["ad"] == "Sahil Yolu")
_SON = SAHIL_KATMAN[-1]
_so = [_SON["onceki"].project(Point(m(c[:2]))) for c in SAHIL_ANA]
_so[0], _so[-1] = 0.0, _SON["onceki"].length          # kapalı halka: baş ve son aynı noktada
_pay, (_sa, _sb) = 30.0, _SON["kesim"]
_sol = [c for c, t in zip(SAHIL_ANA, _so) if t < _sa - _pay]
_sag = [c for c, t in zip(SAHIL_ANA, _so) if t > _sb + _pay]
if len(_sol) + len(_sag) >= len(SAHIL_ANA) or not _sol or not _sag:
    sys.exit(f"HATA: Sahil Yolu'nun ana daldaki noktaları {_SON['ad']} kesimine göre bölünemedi")
_d = _say["geom"].length - _SON["onceki"].length                  # kesimin boyu ne kadar değişti
_w0 = max(t for t in _so if t < _sa - _pay)
_w1 = min(t for t in _so if t > _sb + _pay) + _d
_orta = [i_ for i_ in _say["ix"] if _w0 + 0.5 < _say["s"][i_] < _w1 - 0.5]
if os.environ.get("SAHIL_ANA_YENILE"):
    # tek seferlik (24 Kasım, doğal hat): Sahil Yolu'nun yeni hâli dondurulmuş dosyaya yazılır; ikinci çalışmada
    # Liman dışındaki noktalar bununla aynı kalır
    _yeni = [ll(*_say["p"][i_]) + [round(float(_say["z"][i_]), 1)] for i_ in _say["ix"]]
    _kay = json.load(open(os.path.join(BURASI, "kompakt-sahil-ana.json"), encoding="utf-8"))
    _kay["koordinatlar"] = _yeni
    with open(os.path.join(BURASI, "kompakt-sahil-ana.json"), "w", encoding="utf-8") as f:
        json.dump(_kay, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Sahil Yolu: dondurulmuş dosya yenilendi ({len(_yeni)} nokta); şimdi bir kez daha çalıştır")
    _say["cikti"] = _yeni
else:
    _say["cikti"] = (_sol + [ll(*_say["p"][i_]) + [round(float(_say["z"][i_]), 1)] for i_ in _orta] + _sag)
_say["g_out"] = LineString([m(c[:2]) for c in _say["cikti"]])
print(f"  Sahil Yolu: {_SON['ad']} dışında ana daldaki {len(_sol) + len(_sag)} nokta aynen, {_SON['ad']} kesiminde {len(_orta)} yeni nokta "
      f"(ana dalda {len(SAHIL_ANA) - len(_sol) - len(_sag)})")
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
    "egimAsimi": "yumuşak kural: kademe eğim sınırının aşıldığı yerler, yol boyunca [baş, son] metre (uyarı; en çok sınırın 2 katı)",
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
    koord = y.get("cikti") or [ll(*y["p"][i_]) + [round(float(y["z"][i_]), 1)] for i_ in ix]
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
    # yumuşak kural (24 Kasım): doğal hattın eğim sınırını aştığı yerler, yol boyunca metre aralığı (geçişle)
    _go = LineString([m(c[:2]) for c in koord])
    if ASIM_AGAC is not None and tur in EGIM and tur != "patika" and _go.length > 20:
        _ss = np.arange(0, _go.length + 0.01, 2.0)
        _az = asim_bolgesi(np.array([_go.interpolate(t).coords[0] for t in _ss]))
        if _az.any():
            _et, _sy = ndimage.label(_az)
            pr["egimAsimi"] = [[round(max(0.0, float(_ss[_et == e_].min()) - 30.0)), round(min(_go.length, float(_ss[_et == e_].max()) + 30.0))]
                               for e_ in range(1, _sy + 1)]
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
if BIRAHANE_YERI is not None:
    ozellik.append({"type": "Feature", "properties": {
        "katman": "korunan", "tur": "birahane-yeri",
        "not": "Taraftar Birahanesi için ayrılan yer: bugünkü haritadaki binanın taşınmış yeri (önündeki yolun kenarından 1,5 m geride), ölçüsü 20 x 27,5 m (modelin tabanı; Kemal 21 Kasım, DENEME); bina 4. adımda. Yola kapalı"},
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
print("Doğal hat, eğim uyarısı (yumuşak kural):", "; ".join(DOGAL_UYARI) or "yok")
print("Adlı yollar:", ", ".join(sorted({y['ad'] for y in YOLLAR if y['ad']})))
print(f"Yazıldı: {os.path.relpath(CIKTI, KOK)} ({os.path.getsize(CIKTI) / 1e6:.2f} MB), zemin güncellendi")
