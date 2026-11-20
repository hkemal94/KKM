"""Kompakt Düzada zemini — tek parça yükseklik haritası ve mahalle sınırları.

Tek harita, 1. adım (20 Kasım 2026, Kemal'in kararları):
  - Bütün ada eşit küçülür: en ve boyda 0,70. Küçültmenin merkezi Merkez meydanı
    ile Çiftlik merkezinin ortası; böylece ikisi de eşit, en az kayar.
  - Tepeler aynı yükseklikte kalır (Ada Tepesi 742 m ...).
  - Zemin tek ızgara: parça, dikiş, birleşim yeri yok.
  - Kıyı sade: koylarda kum şeridi, burunlarda kayalık. Kıyıda dik duvar yok.
  - Mahalle sınırları doğal hatlara oturur (sırt ve dere yatağı), yerleri büyük
    ölçüde korunur. Yol, ev, yapı bu adımda yok.

Çıktılar:
  public/harita/duzada-zemin.bin        yükseklik ızgarası (gzip; içinde başlık + int16)
  public/harita/duzada-sinirlar.geojson kıyı, mahalleler, sınırlar, dereler, zirveler

Izgara dosyasının biçimi (gzip açılınca):
  4 bayt  "DZZ1"
  4 bayt  başlık uzunluğu (uint32, küçük uçlu)
  başlık  UTF-8 JSON: en, boy, hucre (m), x0, y0 (sol alt hücrenin merkezi, metre),
          lat0, lng0, mPerLat, mPerLng, birim (0.1 m), satirSirasi ("guneyden-kuzeye")
  veri    en*boy adet int16 (küçük uçlu); rakım = değer * birim (metre). Deniz eksi.

Çalıştırma: python gen/kompakt_zemin.py   (shapely, numpy, scipy, matplotlib)
Denetim   : python gen/kompakt_zemin_denetim.py
"""
import gzip, heapq, io, json, math, os, struct, sys

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString, Point, Polygon, shape, mapping
from shapely.ops import linemerge, polygonize, unary_union
from shapely import affinity

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
CIKTI_KLASOR = os.path.join(KOK, "public", "harita")
IZGARA_DOSYASI = os.path.join(CIKTI_KLASOR, "duzada-zemin.bin")
SINIR_DOSYASI = os.path.join(CIKTI_KLASOR, "duzada-sinirlar.geojson")

# ---------------------------------------------------------------- bugünkü ada
# duzada.py'nin kıyı ve zirve tanımını ödünç al (dem.py ile aynı yol): dosyayı
# yerleşke bölümüne kadar çalıştırıp kesiyoruz. Bina ve yol üretimi çalışmaz.
_kaynak = open(os.path.join(BURASI, "duzada.py"), encoding="utf-8").read()
_kes = _kaynak.index("# The Imperial Kemsköy yerleşkesi")
_kes = _kaynak.rindex("# ---", 0, _kes)
ESKI = {"__name__": "duzada_kompakt", "__file__": os.path.join(BURASI, "duzada.py")}
_yedek = sys.stdout
sys.stdout = io.StringIO()
exec(compile(_kaynak[:_kes], "duzada.py", "exec"), ESKI)
sys.stdout = _yedek

LAT0, LNG0 = ESKI["LAT0"], ESKI["LNG0"]
M_PER_LAT, M_PER_LNG = ESKI["M_PER_LAT"], ESKI["M_PER_LNG"]
ESKI_ADA = ESKI["ada"]
ZIRVELER = ESKI["ZIRVELER"]
MAHALLE_ADI = ESKI["MAHALLE_ADI"]


def _metre(p):
    return ((p[0] - LNG0) * M_PER_LNG, (p[1] - LAT0) * M_PER_LAT)


def _ll(x, y):
    return [round(LNG0 + x / M_PER_LNG, 6), round(LAT0 + y / M_PER_LAT, 6)]


# Bugünkü mahalle çokgenleri: yayındaki veriden (elle düzenlenmiş sınırlar dahil).
_ts = open(os.path.join(KOK, "src", "data", "duzadaGeo.ts"), encoding="utf-8").read()
_bas = _ts.index('JSON.parse("') + len("JSON.parse(")
_son = _ts.index('");\n', _bas) + 1
_geo = json.loads(json.loads(_ts[_bas:_son]))
ESKI_MAHALLE = {}
for _f in _geo["features"]:
    if _f["properties"].get("katman") == "mahalle":
        _g = shape(_f["geometry"])
        ESKI_MAHALLE[_f["properties"]["id"]] = Polygon(
            [_metre(p) for p in _g.exterior.coords],
            [[_metre(p) for p in r.coords] for r in _g.interiors])

# ---------------------------------------------------------------- küçültme
OLCEK = 0.70
MERKEZ_MEYDANI = ESKI["MERKEZ_MEYDANI"]
CIFTLIK_MERKEZI = (6280.0, -2330.0)          # duzada.py → CIFTLIK_MERKEZI
ODAK = ((MERKEZ_MEYDANI[0] + CIFTLIK_MERKEZI[0]) / 2,
        (MERKEZ_MEYDANI[1] + CIFTLIK_MERKEZI[1]) / 2)


def kucult(x, y):
    return ODAK[0] + OLCEK * (x - ODAK[0]), ODAK[1] + OLCEK * (y - ODAK[1])


def _kucult_geom(g):
    return affinity.scale(g, OLCEK, OLCEK, origin=ODAK)


ADA = _kucult_geom(ESKI_ADA)
# Kıyı, GeoJSON'a yazılacak (6 basamak yuvarlanmış) hâliyle kullanılır: denetim aynı
# çizgiyle karayı ayırınca hücre hücre aynı sonucu bulsun.
ADA = Polygon([_metre(_ll(x, y)) for x, y in ADA.exterior.coords])
MAHALLE_KABA = {k: _kucult_geom(v) for k, v in ESKI_MAHALLE.items()}

# ---------------------------------------------------------------- The Imperial
# Kemal (20 Kasım): otel bir tepede, uçurum üstünde; kıyısına merdivenle inilir,
# dipte küçük bir kum cebi ve iskele. Yapılar küçülmez (ölçüleri aynı), yalnız yeri
# taşınır: kum cebinin küçültülmüş yerine oturtulur, sonra sahanlığın önü kıyıdan
# en az IMP_ON_PAY metre olsun diye içeri itilir (yamaç yumuşasın, duvar olmasın).
def _ozellik_m(fid):
    f = next(f for f in _geo["features"] if f["properties"].get("id") == fid)
    c = f["geometry"]["coordinates"]
    while isinstance(c[0][0], list):
        c = c[0]
    return [_metre(q) for q in c]


_imp_eski = {k: _ozellik_m(v) for k, v in {
    "otel": "bina_imperial", "teras": "zemin_teras", "kum": "zemin_otel_kum",
    "merdiven": "yol_merdiven", "iskele": "bina_otel_iskele"}.items()}
_kum_eski = Polygon(_imp_eski["kum"]).centroid if len(_imp_eski["kum"]) > 3 else \
    LineString(_imp_eski["kum"]).centroid
_oc = Polygon(_imp_eski["otel"]).centroid
# Otelin bugünkü yerindeki yükselti (duzada.py'nin arazisi): sahanlık kotu bu kalır.
IMP_KOT = round(float(ESKI["yukselti"](_oc.x, _oc.y)), 1)
IMP_ON_PAY = 75.0
IMP_KUM_KAYMA = 45.0      # kum cebi, dip terasın kıyı boyunca bu kadar yanında (m)
_kx, _ky = kucult(_kum_eski.x, _kum_eski.y)
_kq = ADA.exterior.interpolate(ADA.exterior.project(Point(_kx, _ky)))
_dx, _dy = _kq.x - _kum_eski.x, _kq.y - _kum_eski.y
_nx_, _ny_ = _oc.x + _dx - _kq.x, _oc.y + _dy - _kq.y
_nn = math.hypot(_nx_, _ny_)
_nx_, _ny_ = _nx_ / _nn, _ny_ / _nn          # kıyıdan içeri yön
for _it in range(60):
    _sah = unary_union([Polygon([(x + _dx, y + _dy) for x, y in _imp_eski[k]]) for k in ("otel", "teras")])
    if ADA.contains(_sah) and ADA.exterior.distance(_sah) >= IMP_ON_PAY:
        break
    _dx += 5 * _nx_
    _dy += 5 * _ny_
IMP = {k: [(x + _dx, y + _dy) for x, y in v] for k, v in _imp_eski.items()}
IMP["kum"] = [(x - _dx + _kq.x - _kum_eski.x, y - _dy + _kq.y - _kum_eski.y) for x, y in IMP["kum"]]
IMP_KUM_NOKTA = (_kq.x, _kq.y)
IMP_SAHANLIK = unary_union([Polygon(IMP["otel"]), Polygon(IMP["teras"])]).buffer(12)
# Kemal'in örneği (20 Kasım): dipte kayaların arasında düz bir güneşlenme terası,
# ondan denize dar uzun bir iskele; yamaçtan zikzak inen tek merdiven. Kum yok.
# Teras kayası kıyıdan IMP_TERAS_GERI m içeride, IMP_TERAS_KOT kotunda düz bir basamak.
IMP_TERAS_KOT = 1.8
IMP_TERAS_GERI = 14.0
_ic = Polygon(IMP["otel"]).centroid
_vx, _vy = _ic.x - _kq.x, _ic.y - _kq.y
_vn = math.hypot(_vx, _vy)
IMP_DIP_TERAS = (_kq.x + _vx / _vn * IMP_TERAS_GERI, _kq.y + _vy / _vn * IMP_TERAS_GERI)
# Merdivenin geçeceği hat (öneri, ince çizgi): sahanlığın kıyıya en yakın ucundan
# dip terasa beş kollu zikzak. Merdivenin kendisi 2. adımda.
_sah0 = unary_union([Polygon(IMP["otel"]), Polygon(IMP["teras"])])
_bas_m = _sah0.exterior.interpolate(_sah0.exterior.project(Point(*IMP_DIP_TERAS)))
_ddx, _ddy = IMP_DIP_TERAS[0] - _bas_m.x, IMP_DIP_TERAS[1] - _bas_m.y
_dl = math.hypot(_ddx, _ddy)
_px, _py = -_ddy / _dl, _ddx / _dl
_zz = [(_bas_m.x, _bas_m.y)]
for _k, _t in enumerate((0.18, 0.36, 0.54, 0.72, 0.88)):
    _yan = 22.0 if _k % 2 == 0 else -22.0
    _zz.append((_bas_m.x + _ddx * _t + _px * _yan, _bas_m.y + _ddy * _t + _py * _yan))
_zz.append(IMP_DIP_TERAS)
IMP_MERDIVEN = LineString(_zz)
IMP_MERKEZ = (Polygon(IMP["otel"]).centroid.x, Polygon(IMP["otel"]).centroid.y)
IMP_ALAN_R = 320.0
print(f"The Imperial   : sahanlık {IMP_KOT} m, kıyıdan {ADA.exterior.distance(IMP_SAHANLIK.buffer(-12)):.0f} m, "
      f"merdiven hattı {IMP_MERDIVEN.length:.0f} m")

# ---------------------------------------------------------------- yerleşimler
# Kemal (20 Kasım): yerleşimler kompakt adaya göre taşınabilir; köyler sahile yaklaşır.
# Eski yerler bugünkü verideki ev kümelerinin ortası (gen/duzada.py'nin evleri).
# (id, tanım, mahalle, eski merkez, eski alan ha, kıyıya hedef uzaklık m ya da None = yerinde)
YERLESIM_ESKI = [
    ("yerlesim_merkez", "Merkez (meydan çevresi)", "yer_merkez", (1422.0, 962.0), 24.7, None),
    ("yerlesim_liman", "Liman kasabası", "yer_liman", (-4882.0, 2596.0), 88.1, 200.0),
    ("yerlesim_iskele", "İskele (Kemsköy)", "yer_iskele", (-5481.0, -2246.0), 51.3, 160.0),
    ("yerlesim_stadyum", "Stadyum yerleşimi (stat çevresi)", "yer_stadyum", (4621.0, 2996.0), 52.6, None),
    ("yerlesim_stadyum_kiyi", "Stadyum kıyı köyü (Taraftar Birahanesi)", "yer_stadyum", (5790.0, 3850.0), 3.6, 90.0),
    ("yerlesim_ciftlik", "Çiftlik yerleşimi", "yer_ciftlik", (5811.0, -3089.0), 58.6, None),
]
# Stadyum Bağlantısı'nın bugün kıyıya ulaştığı yer: kıyı köyü ve Kuzey Plajı oraya.
STADYUM_BAG_KIYI = (5464.0, 4003.0)
YERLESIMLER = []
for _yid, _tanim, _mid, (_ex_, _ey_), _ha, _hedef in YERLESIM_ESKI:
    _yx, _yy = kucult(_ex_, _ey_)
    if _yid == "yerlesim_stadyum_kiyi":
        _yx, _yy = kucult(*STADYUM_BAG_KIYI)
    _q = ADA.exterior.interpolate(ADA.exterior.project(Point(_yx, _yy)))
    if _hedef is not None:
        _vx, _vy = _yx - _q.x, _yy - _q.y
        _vn = math.hypot(_vx, _vy)
        if not ADA.contains(Point(_yx, _yy)) or _vn < 1:
            _c = ADA.centroid
            _vx, _vy, _vn = _c.x - _q.x, _c.y - _q.y, math.hypot(_c.x - _q.x, _c.y - _q.y)
        _yx, _yy = _q.x + _vx / _vn * _hedef, _q.y + _vy / _vn * _hedef
    YERLESIMLER.append({
        "id": _yid, "tanim": _tanim, "mahalle": _mid, "eski": (_ex_, _ey_), "yeni": (_yx, _yy),
        "yaricap": math.sqrt(_ha * 1e4 / math.pi), "kiyiNokta": (_q.x, _q.y),
        "eskiKiyi": ESKI_ADA.exterior.distance(Point(_ex_, _ey_)),
        "yeniKiyi": ADA.exterior.distance(Point(_yx, _yy))})
KUZEY_PLAJI_NOKTA = next(y["kiyiNokta"] for y in YERLESIMLER if y["id"] == "yerlesim_stadyum_kiyi")

# ---------------------------------------------------------------- ızgara
HUCRE = 10.0
PAY = 700.0
_bx0, _by0, _bx1, _by1 = ADA.bounds
EN = int(math.ceil((_bx1 - _bx0 + 2 * PAY) / HUCRE))
BOY = int(math.ceil((_by1 - _by0 + 2 * PAY) / HUCRE))
X0 = _bx0 - PAY + HUCRE / 2
Y0 = _by0 - PAY + HUCRE / 2
gx = X0 + np.arange(EN) * HUCRE
gy = Y0 + np.arange(BOY) * HUCRE
GX, GY = np.meshgrid(gx, gy)          # satır 0 = en güney
print(f"Izgara         : {EN} x {BOY}, hücre {HUCRE:.0f} m")

from matplotlib.path import Path as _Yol
KARA = _Yol(np.asarray(ADA.exterior.coords)).contains_points(
    np.column_stack([GX.ravel(), GY.ravel()])).reshape(GX.shape)
# Kara içi uzaklık (kıyıya) ve deniz içi uzaklık, metre
D_KARA = ndimage.distance_transform_edt(KARA) * HUCRE
D_DENIZ = ndimage.distance_transform_edt(~KARA) * HUCRE


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- kıyı türü
# Kıyı her 20 m'de örneklenir. Koy (içbükey) → kum; burun (dışbükey) ve arkası
# yüksek kıyı → kayalık. Sonra kıyı boyunca yumuşatılır, kısa parçalar kalmaz.
_kh = ADA.exterior
_n = int(_kh.length / 20.0)
KIYI_NOKTA = np.array([_kh.interpolate(t, normalized=True).coords[0]
                       for t in np.linspace(0, 1, _n, endpoint=False)])
_ileri = np.roll(KIYI_NOKTA, -20, axis=0) - KIYI_NOKTA
_geri = KIYI_NOKTA - np.roll(KIYI_NOKTA, 20, axis=0)
_don = np.arctan2(_ileri[:, 1], _ileri[:, 0]) - np.arctan2(_geri[:, 1], _geri[:, 0])
_don = (_don + np.pi) % (2 * np.pi) - np.pi
if ADA.exterior.is_ccw is False:
    _don = -_don
# Saat yönü tersine giden kıyıda sola dönüş dışbükey (burun), sağa dönüş içbükey (koy)
_egrilik = ndimage.gaussian_filter1d(_don, 12, mode="wrap")
# Eski arazide kıyının 400 m gerisinin rakımı (küçültmeden önceki yerde)
_ex = ODAK[0] + (KIYI_NOKTA[:, 0] - ODAK[0]) / OLCEK
_ey = ODAK[1] + (KIYI_NOKTA[:, 1] - ODAK[1]) / OLCEK
_merk = np.array(ADA.centroid.coords[0])
_ic = KIYI_NOKTA + 400 * (_merk - KIYI_NOKTA) / np.linalg.norm(_merk - KIYI_NOKTA, axis=1)[:, None]
_arka = np.asarray(ESKI["yukselti"](ODAK[0] + (_ic[:, 0] - ODAK[0]) / OLCEK,
                                    ODAK[1] + (_ic[:, 1] - ODAK[1]) / OLCEK))
_puan = -_egrilik * 9.0 - (_arka - 45.0) / 25.0
# Kemal (20 Kasım): kıyının yaklaşık üçte biri kum (koylar ve alçak kıyılar).
KUM_HEDEF = 0.33
_puan = _puan - np.quantile(ndimage.gaussian_filter1d(_puan, 8, mode="wrap"), 1 - KUM_HEDEF)
_kum0 = 1 / (1 + np.exp(-3 * _puan))
_uz_imp = np.hypot(KIYI_NOKTA[:, 0] - IMP_KUM_NOKTA[0], KIYI_NOKTA[:, 1] - IMP_KUM_NOKTA[1])
_uz_kp = np.hypot(KIYI_NOKTA[:, 0] - KUZEY_PLAJI_NOKTA[0], KIYI_NOKTA[:, 1] - KUZEY_PLAJI_NOKTA[1])
_kum0 = np.where(_uz_imp < 400, 0.0, _kum0)           # otel tepesinin çevresi kayalık
# Kemal (20 Kasım): dipte terasın ve iskelenin yanında, kayaların arasında küçük bir
# kum cebi; iki yanı kayalık kalır.
_s_imp = ADA.exterior.project(Point(*IMP_KUM_NOKTA))
_kc = ADA.exterior.interpolate((_s_imp + IMP_KUM_KAYMA) % ADA.exterior.length)
IMP_KUM_CEBI = (_kc.x, _kc.y)
_uz_cep = np.hypot(KIYI_NOKTA[:, 0] - _kc.x, KIYI_NOKTA[:, 1] - _kc.y)
_kum0 = np.where(_uz_cep < 30, 1.0, _kum0)
_kum0 = np.where(_uz_kp < 260, 1.0, _kum0)            # Kuzey Plajı (Stadyum kıyısı)
KUM_AGIRLIK = ndimage.gaussian_filter1d(_kum0, 2.5, mode="wrap")
KUM_AGIRLIK = np.maximum(KUM_AGIRLIK, np.clip(1.6 - _uz_cep / 35.0, 0, 1))   # kum cebi tam kum
KUM_MI = KUM_AGIRLIK > 0.5
_agac = cKDTree(KIYI_NOKTA)
_, _en_yakin = _agac.query(np.column_stack([GX.ravel(), GY.ravel()]), workers=-1)
# En yakın kıyı noktasının türü; ada içinde iki kıyının ortasında sıçramasın diye
# 200 m'lik yumuşatma.
_w_yakin = KUM_AGIRLIK[_en_yakin].reshape(GX.shape)
W_KUM = ndimage.gaussian_filter(_w_yakin, 200.0 / HUCRE)
_karisim = smoothstep(60.0, 350.0, ndimage.distance_transform_edt(
    _Yol(np.asarray(ADA.exterior.coords)).contains_points(
        np.column_stack([GX.ravel(), GY.ravel()])).reshape(GX.shape)) * HUCRE)
W_KUM = _w_yakin * (1 - _karisim) + W_KUM * _karisim
print(f"Kıyı           : {_kh.length / 1000:.1f} km, kum {KUM_MI.mean() * 100:.0f} %, "
      f"kayalık {(1 - KUM_MI.mean()) * 100:.0f} %")

# ---------------------------------------------------------------- taban
d = D_KARA
kum_profil = 0.3 + 3.5 * (1 - np.exp(-d / 90.0)) + 0.012 * d
kaya_profil = 0.3 + 20.0 * (1 - np.exp(-d / 45.0)) + 0.01 * d
taban_kiyi = W_KUM * kum_profil + (1 - W_KUM) * kaya_profil
# İç plato (uzaklıklar 0,7 ölçekli)
plato = 60.0 * np.clip((d - 140.0) / 2100.0, 0, 1) ** 1.15
TABAN = np.minimum(taban_kiyi, 30.0) + plato


def _ornek(Z, x, y):
    """Izgaradan çift doğrusal örnek."""
    i = (np.asarray(x) - X0) / HUCRE
    j = (np.asarray(y) - Y0) / HUCRE
    return ndimage.map_coordinates(Z, [np.atleast_1d(j), np.atleast_1d(i)], order=1, mode="nearest")


# ---------------------------------------------------------------- sırtlar
# Kemal (20 Kasım): öbür sırtlar biraz yükselebilir. Ada Tepesi 742 m kalır.
YENI_RAKIM = {"tepe_kuzey": 440, "tepe_ciftlik": 290}
# Sırt kesiti: Gauss yerine biraz sivri (üs 0,75) — doruk düz kubbe gibi durmasın.
SIRT_US = 0.75
ZIRVE_YENI = []
for zid, ad, (px, py), rakim, uzun, genis, aci in ZIRVELER:
    nx, ny = kucult(px, py)
    ZIRVE_YENI.append((zid, ad, (nx, ny), YENI_RAKIM.get(zid, rakim), uzun * OLCEK, genis * OLCEK, aci))


def _sirt(z, genlik):
    _, _, (px, py), _, uzun, genis, aci = z
    a = math.radians(aci)
    dx, dy = GX - px, GY - py
    u = dx * math.cos(a) + dy * math.sin(a)
    v = -dx * math.sin(a) + dy * math.cos(a)
    return genlik * np.exp(-(0.5 * ((u / uzun) ** 2 + (v / genis) ** 2)) ** SIRT_US)


def _sirt_noktada(z, x, y):
    _, _, (px, py), _, uzun, genis, aci = z
    a = math.radians(aci)
    dx, dy = x - px, y - py
    u = dx * math.cos(a) + dy * math.sin(a)
    v = -dx * math.sin(a) + dy * math.cos(a)
    return math.exp(-(0.5 * ((u / uzun) ** 2 + (v / genis) ** 2)) ** SIRT_US)


def _sirtlari_coz(alt):
    n = len(ZIRVE_YENI)
    A = np.zeros((n, n))
    b = np.zeros(n)
    for i, zi in enumerate(ZIRVE_YENI):
        x, y = zi[2]
        b[i] = zi[3] - float(_ornek(alt, x, y)[0])
        for j, zj in enumerate(ZIRVE_YENI):
            A[i, j] = _sirt_noktada(zj, x, y)
    g = np.linalg.solve(A, b)
    return sum(_sirt(z, gi) for z, gi in zip(ZIRVE_YENI, g))


# ---------------------------------------------------------------- doku (gürültü)
_rng = np.random.default_rng(20261120)


def _katman(sigma_m):
    n = ndimage.gaussian_filter(_rng.standard_normal(GX.shape), sigma_m / HUCRE, mode="reflect")
    return n / n.std()


_n1, _n2, _n3, _n4 = _katman(700), _katman(260), _katman(110), _katman(45)
DUZ_GURULTU = 0.55 * _n1 + 0.30 * _n2 + 0.12 * _n3 + 0.05 * _n4
# Sırtlı (dağ) doku: 1-|n| keskin sırtlar ve vadiler verir
SIRTLI = (1 - np.abs(_n2)) * 0.6 + (1 - np.abs(_n3)) * 0.3 + (1 - np.abs(_n4)) * 0.1
SIRTLI = SIRTLI - SIRTLI.mean()

R0 = _sirtlari_coz(TABAN)
_dag = np.clip(R0, 0, None)
_kiyi_soluk = smoothstep(30.0, 450.0, D_KARA)
GURULTU = _kiyi_soluk * (6.0 * DUZ_GURULTU + 0.03 * _dag * SIRTLI / SIRTLI.std()
                         + 0.015 * _dag * DUZ_GURULTU)
# Zirvelerin çevresinde doku söner: tepe kayıtlı rakımında kalsın, yanında
# ondan yüksek bir tümsek çıkmasın.
for _z in ZIRVE_YENI:
    GURULTU = GURULTU * (1 - np.exp(-0.5 * (np.hypot(GX - _z[2][0], GY - _z[2][1]) / 220.0) ** 2))
R = _sirtlari_coz(TABAN + GURULTU)
Z = TABAN + GURULTU + R

# ---------------------------------------------------------------- deniz tabanı
_dd = D_DENIZ
_kum_eg, _kaya_eg = 0.03, 0.12
_ham = (W_KUM * _kum_eg + (1 - W_KUM) * _kaya_eg) * _dd + 0.25
DENIZ = -45.0 * (1 - np.exp(-_ham / 45.0))
Z = np.where(KARA, Z, DENIZ)


# ---------------------------------------------------------------- yardımcılar
KOMSU = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def cukur_doldur(Z, kara, eps=0.005):
    """Kara üstündeki kapalı çukurları taşma kotuna kadar doldurur (öncelikli
    taşma). Sonunda her kara hücresinin suyu denize akar; çukur kalmaz."""
    Z = Z.copy()
    boy, en = Z.shape
    islendi = ~kara.copy()
    yigin = []
    # Tohum: denize komşu kara hücreleri
    kenar = kara & ndimage.binary_dilation(~kara, structure=np.ones((3, 3)))
    for j, i in zip(*np.nonzero(kenar)):
        heapq.heappush(yigin, (Z[j, i], j, i))
        islendi[j, i] = True
    Zl = Z
    while yigin:
        h, j, i = heapq.heappop(yigin)
        for dj, di in KOMSU:
            a, b = j + dj, i + di
            if 0 <= a < boy and 0 <= b < en and not islendi[a, b]:
                islendi[a, b] = True
                if Zl[a, b] <= h + eps:
                    Zl[a, b] = h + eps
                heapq.heappush(yigin, (Zl[a, b], a, b))
    return Zl


def akis(Z, kara):
    """D8 akış: her kara hücresinin alıcısı ve toplanan alan (hücre sayısı)."""
    boy, en = Z.shape
    P = np.pad(Z, 1, mode="edge")
    en_iyi = np.full(Z.shape, -1, dtype=np.int64)
    en_egim = np.zeros(Z.shape)
    for k, (dj, di) in enumerate(KOMSU):
        komsu = P[1 + dj:1 + dj + boy, 1 + di:1 + di + en]
        egim = (Z - komsu) / math.hypot(dj, di)
        daha = egim > en_egim
        en_egim = np.where(daha, egim, en_egim)
        en_iyi = np.where(daha, k, en_iyi)
    jj, ii = np.indices(Z.shape)
    dj = np.array([k[0] for k in KOMSU])[np.clip(en_iyi, 0, 7)]
    di = np.array([k[1] for k in KOMSU])[np.clip(en_iyi, 0, 7)]
    alici = np.where(en_iyi >= 0, (jj + dj) * en + (ii + di), -1)
    alici = np.where(kara, alici, -1)
    alan = np.where(kara, 1.0, 0.0).ravel()
    sira = np.argsort(-Z.ravel())
    al = alici.ravel()
    for k in sira:
        hedef = al[k]
        if hedef >= 0:
            alan[hedef] += alan[k]
    return alici, alan.reshape(Z.shape)


# ---------------------------------------------------------------- dereler
Z = cukur_doldur(Z, KARA)
ALICI, ALAN = akis(Z, KARA)
alan_km2 = ALAN * HUCRE * HUCRE / 1e6
# Dere yatağı: toplanan alan 0,15 km²'yi geçince yatak oyulur.
_derin = np.where(KARA, np.clip(3.2 * np.sqrt(np.clip(alan_km2 - 0.15, 0, None)) * 2.2, 0, 11.0), 0.0)
_derin *= smoothstep(20.0, 160.0, D_KARA) * 0.7 + 0.3 * smoothstep(0.0, 40.0, D_KARA)
_yatak = _derin > 0.3
_uz, (_jy, _iy) = ndimage.distance_transform_edt(~_yatak, return_indices=True)
_uz = _uz * HUCRE
_d0 = _derin[_jy, _iy]
_yari = 25.0 + 7.0 * _d0                    # vadinin yarı genişliği (m)
OYUK = _d0 * np.clip(1 - _uz / _yari, 0, 1) ** 1.6
Z = np.where(KARA, Z - OYUK, Z)

_XY = np.column_stack([GX.ravel(), GY.ravel()])


def _icinde(g):
    return _Yol(np.asarray(g.exterior.coords)).contains_points(_XY).reshape(GX.shape)


# Yerleşim terasları: yerleşimin alanında yerel pürüz bastırılır (büyük eğim kalır,
# küçük tümsek ve oyuklar yumuşar). Ev yerleri 2. adımda bu yumuşak zemine oturur.
for _y in YERLESIMLER:
    _r = _y["yaricap"]
    _uz = np.hypot(GX - _y["yeni"][0], GY - _y["yeni"][1])
    _w = (1 - smoothstep(0.8 * _r, 1.4 * _r, _uz)) * KARA
    _lp = ndimage.gaussian_filter(Z, max(4.0, _r / 2.5 / HUCRE))
    Z = Z * (1 - _w) + (_lp + 0.3 * (Z - _lp)) * _w

# The Imperial tepesi: sahanlık düz (IMP_KOT), çevresi her yönde inen bir tepe;
# arkada hafif bir boyun kalır, otel kendi tepesinde durur.
SAHANLIK = _icinde(IMP_SAHANLIK)
_dp = ndimage.distance_transform_edt(~SAHANLIK) * HUCRE
_w = (1 - smoothstep(110.0, 280.0, _dp)) * KARA
Z = Z * (1 - _w) + (IMP_KOT - 0.13 * _dp) * _w
Z = np.where(SAHANLIK, IMP_KOT, Z)
# Merdiven yamacı: hattın üstünde zemin terastan kum cebine düzgün iner
_hat = np.asarray(IMP_MERDIVEN.coords)
_ornekler = [IMP_MERDIVEN.interpolate(t, normalized=True) for t in np.linspace(0, 1, 120)]
_op = np.array([(q.x, q.y) for q in _ornekler])
_ust = float(_ornek(Z, *_op[0])[0])
_kot_h = _ust + (IMP_TERAS_KOT - _ust) * np.linspace(0, 1, 120)
_ag2 = cKDTree(_op)
_dm_, _im_ = _ag2.query(_XY)
_dm_ = _dm_.reshape(GX.shape)
_wm = (1 - smoothstep(4.0, 14.0, _dm_)) * KARA * ~SAHANLIK
Z = Z * (1 - 0.5 * _wm) + _kot_h[_im_].reshape(GX.shape) * 0.5 * _wm
# Dip teras: kayaların arasında düz bir basamak (güneşlenme terası 2. adımda)
_uk = np.hypot(GX - IMP_DIP_TERAS[0], GY - IMP_DIP_TERAS[1])
DIP_TERAS = (_uk < 16.0) & KARA
_wk = (1 - smoothstep(16.0, 40.0, _uk)) * KARA
Z = Z * (1 - _wk) + np.minimum(Z, IMP_TERAS_KOT + 0.6 * np.clip(_uk - 16.0, 0, None)) * _wk
Z = np.where(DIP_TERAS, IMP_TERAS_KOT, Z)
_uc = np.hypot(GX - IMP_KUM_CEBI[0], GY - IMP_KUM_CEBI[1])
_wc = (1 - smoothstep(30.0, 60.0, _uc)) * KARA
Z = Z * (1 - _wc) + np.minimum(Z, 0.3 + 0.05 * D_KARA) * _wc
IMP_ALANI = np.hypot(GX - IMP_MERKEZ[0], GY - IMP_MERKEZ[1]) < IMP_ALAN_R

# Basamaklı kayalık: kayalık kıyının 0–70 m bandında zemin 2,5 m'lik basamaklara
# yakınlaşır ve küçük kaya pürüzü alır. Eğim sınırı aşağıda yine geçerli.
_rng_kaya = np.random.default_rng(1954)
_kp = ndimage.gaussian_filter(_rng_kaya.standard_normal(GX.shape), 1.2)
_kp = _kp / _kp.std()
_bant = (1 - W_KUM) * (1 - smoothstep(35.0, 75.0, D_KARA)) * KARA * ~SAHANLIK \
    * smoothstep(16.0, 30.0, _uk) * smoothstep(32.0, 55.0, _uc)
_t = Z / 2.5
_bs = 2.5 * (np.floor(_t) + smoothstep(0.55, 0.85, _t - np.floor(_t)))
Z = Z + _bant * (0.75 * (_bs - Z) + 0.7 * _kp)


# ---------------------------------------------------------------- eğim sınırı
def egim_derece(Z):
    gy_, gx_ = np.gradient(Z, HUCRE)
    return np.degrees(np.arctan(np.hypot(gx_, gy_)))


EGIM_SINIRI = 36.0          # izin verilen en dik yamaç (derece, yüzeyin gerçek eğimi)
# Komşu hücre çifti başına sınır: iki yönde birden bu eğim olsa bile yüzey
# eğimi EGIM_SINIRI'nı geçmesin diye kökü 2'ye bölünür.
_tan = math.tan(math.radians(EGIM_SINIRI)) / math.sqrt(2.0)
# The Imperial tepesinde (Kemal: tepe + merdiven için kural burada esnetilebilir)
EGIM_SINIRI_IMPERIAL = 46.0
_tan = np.where(IMP_ALANI, math.tan(math.radians(EGIM_SINIRI_IMPERIAL)) / math.sqrt(2.0), _tan)
# Kıyı çizgisi kıpırdamaz: deniz hücresi 0'ın üstüne, kara hücresi altına geçemez.
# Bu yüzden fazla eğim kıyıda karayı aşındırarak giderilir (duvar kalmaz).
def egim_sinirla(Z, tur_sayisi=1200):
    """Komşu hücre çiftleri arasındaki fazla eğimi yumuşakça dağıtır."""
    _tur = 0
    for _tur in range(tur_sayisi):
        degisti = False
        Z = np.where(KARA, np.maximum(Z, 0.3), np.minimum(Z, -0.2))
        Z = np.where(SAHANLIK, IMP_KOT, Z)
        Z = np.where(DIP_TERAS, IMP_TERAS_KOT, Z)
        P = np.pad(Z, 1, mode="edge")
        tasi = np.zeros_like(Z)
        for dj, di in ((0, 1), (1, 0), (1, 1), (1, -1)):
            uz = HUCRE * math.hypot(dj, di)
            komsu = P[1 + dj:1 + dj + Z.shape[0], 1 + di:1 + di + Z.shape[1]]
            fark = Z - komsu
            fazla = np.abs(fark) - _tan * uz
            m = fazla > 0
            if (fazla > 0.02).any():
                degisti = True
                pay = np.where(m, np.sign(fark) * fazla * 0.2, 0.0)
                tasi -= pay
                # komşuya ekle
                ek = np.zeros_like(P)
                ek[1 + dj:1 + dj + Z.shape[0], 1 + di:1 + di + Z.shape[1]] += pay
                tasi += ek[1:-1, 1:-1]
        if not degisti:
            break
        Z = Z + tasi
    Z = np.where(KARA, np.maximum(Z, 0.3), np.minimum(Z, -0.2))
    Z = np.where(SAHANLIK, IMP_KOT, Z)
    Z = np.where(DIP_TERAS, IMP_TERAS_KOT, Z)
    return Z, _tur


Z, _tur = egim_sinirla(Z)
print(f"Eğim düzeltme  : {_tur} tur")

# ---------------------------------------------------------------- kıyı ve zirve son ayar
# Kıyı kenarı: kara, kıyıdan içeri en çok belli bir eğimle yükselebilir (yumuşak alt sınır);
# kıyıda basamak ya da duvar kalmaz.
# Kum kıyıda 0,25; kayalıkta 0,8; Imperial tepesinde 0,95 m/m.
_tavan = 0.3 + np.where(IMP_ALANI, 0.95, 0.25 * W_KUM + 0.8 * (1 - W_KUM)) * D_KARA
_k = 2.0
_hh = np.clip(0.5 + 0.5 * (_tavan - Z) / _k, 0, 1)
Z = np.where(KARA, _tavan * (1 - _hh) + Z * _hh - _k * _hh * (1 - _hh), Z)
Z = np.where(KARA, np.maximum(Z, 0.3), np.minimum(Z, -0.2))
Z = cukur_doldur(Z, KARA)

# Zirveler kayıtlı rakımına: 250 m çevredeki en yüksek nokta = rakım. Fark küçük;
# yumuşak bir kubbe ile verilir.
for zid, ad, (px, py), rakim, *_ in ZIRVE_YENI:
    yakin = np.hypot(GX - px, GY - py) < 250
    j, i = np.unravel_index(np.argmax(np.where(yakin, Z, -1e9)), Z.shape)
    fark = rakim - Z[j, i]
    Z = Z + fark * np.exp(-0.5 * (np.hypot(GX - GX[j, i], GY - GY[j, i]) / 260.0) ** 2)
Z = np.where(KARA, np.maximum(Z, 0.3), Z)
# Kıyı tavanı ve zirve ayarı küçük yerel dikleşme bırakabilir: kısa ikinci geçiş
Z, _tur2 = egim_sinirla(Z, 400)
print(f"Eğim düzeltme 2: {_tur2} tur")
Z = cukur_doldur(Z, KARA)
for zid, ad, (px, py), rakim, *_ in ZIRVE_YENI:
    yakin = np.hypot(GX - px, GY - py) < 250
    print(f"  {ad:14s} kayıt {rakim:4d} m, ızgarada {np.where(yakin, Z, -1e9).max():6.1f} m")
ALICI, ALAN = akis(Z, KARA)
alan_km2 = ALAN * HUCRE * HUCRE / 1e6

# ---------------------------------------------------------------- yaz: ızgara
KAYIT = np.round(Z * 10.0).astype("<i2")
Z = KAYIT.astype(float) / 10.0         # sonraki her şey kayıttakiyle aynı
baslik = {
    "en": EN, "boy": BOY, "hucre": HUCRE, "x0": round(X0, 3), "y0": round(Y0, 3),
    "lat0": LAT0, "lng0": LNG0, "mPerLat": M_PER_LAT, "mPerLng": round(M_PER_LNG, 4),
    "birim": 0.1, "satirSirasi": "guneyden-kuzeye", "olcek": OLCEK,
    "odak": [round(ODAK[0], 1), round(ODAK[1], 1)],
    "not": "Kompakt ada zemini, taslak (Kemal onaylamadı). gen/kompakt_zemin.py üretir.",
}
_b = json.dumps(baslik, ensure_ascii=False).encode("utf-8")
os.makedirs(CIKTI_KLASOR, exist_ok=True)
with gzip.GzipFile(IZGARA_DOSYASI, "wb", compresslevel=9, mtime=0) as f:
    f.write(b"DZZ1" + struct.pack("<I", len(_b)) + _b + KAYIT.tobytes())
print(f"Izgara dosyası : {os.path.getsize(IZGARA_DOSYASI) / 1e6:.2f} MB")

# ---------------------------------------------------------------- dere çizgileri
DERE_ESIGI = 0.35       # km²; bundan büyük alan toplayan yatak çizilir
dere = (alan_km2 > DERE_ESIGI) & KARA
al = ALICI.ravel()
dere_f = dere.ravel()
bagis = np.zeros(al.size, dtype=np.int32)
for k in np.nonzero(dere_f)[0]:
    if al[k] >= 0 and dere_f[al[k]]:
        bagis[al[k]] += 1
DERELER = []
for k in np.nonzero(dere_f & (bagis != 1))[0]:
    yol = [k]
    while True:
        s = al[yol[-1]]
        if s < 0:
            break
        yol.append(s)
        if not dere_f[s] or bagis[s] != 1:
            break
    if len(yol) < 3:
        continue
    pts = [(gx[p % EN], gy[p // EN]) for p in yol]
    DERELER.append((LineString(pts).simplify(6.0), float(alan_km2.ravel()[yol[-2]])))
print(f"Dereler        : {len(DERELER)} parça")

# ---------------------------------------------------------------- sabit sınırlar
# Kemal (20 Kasım): Liman–Merkez ve öbür sınırlar onaylı hâliyle kalır. Arazi
# değişse de sınırlar gen/kompakt-sinirlar.json'dan olduğu gibi okunur. Yeniden
# hesap yalnız --sinirlari-yeniden-hesapla ile (aşağıdaki doğal hat yöntemi).
SABIT_DOSYA = os.path.join(BURASI, "kompakt-sinirlar.json")
SABIT = None
if os.path.exists(SABIT_DOSYA) and "--sinirlari-yeniden-hesapla" not in sys.argv:
    SABIT = json.load(open(SABIT_DOSYA, encoding="utf-8"))["features"]
    print(f"Sınırlar       : sabit dosyadan ({len(SABIT)} parça)")
if SABIT is None:
    # ---------------------------------------------------------------- mahalle sınırları
    # Bugünkü mahalleler küçültülür, her birinin çekirdeği (sınırdan 300 m içerisi)
    # sabit tutulur. Aradaki şeritte hücreler, çekirdeklerden "doğal engeli" (sırt ve
    # dere yatağı) aşmanın pahalı olduğu bir yol uzaklığıyla paylaşılır. Böylece sınır
    # kendiliğinden bir sırta ya da dere yatağına oturur ve 300 m'den fazla kaymaz.
    K = 2                                   # 20 m'lik ızgarada çalışılır
    Zk = Z[::K, ::K]
    Kk = KARA[::K, ::K]
    GXk, GYk = GX[::K, ::K], GY[::K, ::K]
    hk = HUCRE * K
    _blur = ndimage.gaussian_filter(Zk, 160 / hk)
    SIRT01 = np.clip((Zk - _blur) / 8.0, 0, 1)
    _alank = ndimage.maximum_filter(alan_km2, size=3)[::K, ::K]
    DERE01 = np.clip(np.log10(np.clip(_alank, 1e-4, None) / 0.08) / 1.2, 0, 1)
    ENGEL = np.clip(SIRT01 + DERE01, 0, 1)
    ADIM_MALIYET = 1.0 + 14.0 * ENGEL ** 1.5

    ids = list(MAHALLE_KABA)
    from matplotlib.path import Path as _P
    etiket0 = np.full(Zk.shape, -1, dtype=np.int32)
    pts = np.column_stack([GXk.ravel(), GYk.ravel()])
    for n, mid in enumerate(ids):
        g = MAHALLE_KABA[mid]
        icinde = _P(np.asarray(g.exterior.coords)).contains_points(pts).reshape(Zk.shape)
        etiket0[icinde & Kk & (etiket0 < 0)] = n
    etiket0[Kk & (etiket0 < 0)] = -2
    CEKIRDEK_M = 300.0
    etiket = np.full(Zk.shape, -1, dtype=np.int32)
    for n in range(len(ids)):
        m = etiket0 == n
        ic = ndimage.distance_transform_edt(m) * hk
        etiket[m & (ic > CEKIRDEK_M)] = n
    mesafe = np.full(Zk.shape, np.inf)
    yigin = []
    for j, i in zip(*np.nonzero(etiket >= 0)):
        mesafe[j, i] = 0.0
        yigin.append((0.0, j, i, etiket[j, i]))
    heapq.heapify(yigin)
    bb, ee = Zk.shape
    while yigin:
        m0, j, i, lab = heapq.heappop(yigin)
        if m0 > mesafe[j, i]:
            continue
        for dj, di in KOMSU:
            a, b = j + dj, i + di
            if 0 <= a < bb and 0 <= b < ee and Kk[a, b]:
                m1 = m0 + math.hypot(dj, di) * 0.5 * (ADIM_MALIYET[j, i] + ADIM_MALIYET[a, b])
                if m1 < mesafe[a, b]:
                    mesafe[a, b] = m1
                    etiket[a, b] = lab
                    heapq.heappush(yigin, (m1, a, b, lab))
    # Kopuk küçük parçalar komşusuna katılır
    for n in range(len(ids)):
        parca, say = ndimage.label(etiket == n)
        if say > 1:
            boyut = ndimage.sum(np.ones_like(parca), parca, range(1, say + 1))
            buyuk = 1 + int(np.argmax(boyut))
            for p in range(1, say + 1):
                if p != buyuk:
                    m = parca == p
                    kom = etiket[ndimage.binary_dilation(m) & ~m]
                    kom = kom[(kom >= 0) & (kom != n)]
                    etiket[m] = np.bincount(kom).argmax() if kom.size else n
    # Merdiven görünmesin: çoğunluk süzgeci
    for _ in range(2):
        oy = np.stack([ndimage.uniform_filter((etiket == n).astype(float), 5) for n in range(len(ids))])
        yeni = oy.argmax(0)
        etiket = np.where(Kk, yeni, -1)

    # Etiket sınırlarını çizgiye çevir: hücre kenarlarından parçalar, sonra birleştir.
    parcalar = {}
    for (dj, di) in ((0, 1), (1, 0)):
        A = etiket[:bb - dj, :ee - di]
        B = etiket[dj:, di:]
        m = (A >= 0) & (B >= 0) & (A != B)
        for j, i in zip(*np.nonzero(m)):
            x, y = GXk[j, i], GYk[j, i]
            if di:   # dikey kenar
                p, q = (x + hk / 2, y - hk / 2), (x + hk / 2, y + hk / 2)
            else:
                p, q = (x - hk / 2, y + hk / 2), (x + hk / 2, y + hk / 2)
            p = (round(p[0], 2), round(p[1], 2))
            q = (round(q[0], 2), round(q[1], 2))
            cift = tuple(sorted((int(A[j, i]), int(B[j, i]))))
            parcalar.setdefault(cift, []).append((p, q))


    def _chaikin(p, tur=4):
        p = np.asarray(p)
        for _ in range(tur):
            q = 0.75 * p[:-1] + 0.25 * p[1:]
            r = 0.25 * p[:-1] + 0.75 * p[1:]
            y = np.empty((2 * len(q), 2))
            y[0::2], y[1::2] = q, r
            p = np.vstack([p[:1], y, p[-1:]])
        return p


    _kiyi_hat = ADA.exterior
    SINIR_HATLARI = {}
    for cift, seg in parcalar.items():
        birlesik = linemerge(MultiLineString(seg))
        hatlar = list(birlesik.geoms) if hasattr(birlesik, "geoms") else [birlesik]
        hatlar = [h for h in hatlar if h.length > 3 * hk]
        duz = []
        for h in hatlar:
            c = list(h.coords)
            # kıyıya değen uç kıyıya oturtulur
            for k in (0, -1):
                if _kiyi_hat.distance(Point(c[k])) < 3 * hk:
                    s = _kiyi_hat.interpolate(_kiyi_hat.project(Point(c[k])))
                    c[k] = (s.x, s.y)
            p = list(LineString(c).simplify(hk * 0.8).coords)
            p = [tuple(v) for v in _chaikin(p)]
            # kıyıdaki uç 25 m denize uzatılır ki kıyı çizgisini kesip düğümlensin
            for k, k2 in ((0, 1), (-1, -2)):
                if _kiyi_hat.distance(Point(p[k])) < 1.0:
                    vx, vy = p[k][0] - p[k2][0], p[k][1] - p[k2][1]
                    n_ = math.hypot(vx, vy) or 1.0
                    ek_ = (p[k][0] + 25 * vx / n_, p[k][1] + 25 * vy / n_)
                    p = [ek_] + p if k == 0 else p + [ek_]
            duz.append(LineString(p))
        SINIR_HATLARI[cift] = duz

    # Doğal hatta oturtma: her sınırın iki ucu sabit kalır, arası en ucuz yoldan yeniden
    # çizilir. Dere yatağı ve sırt üstü ucuz, bugünkü (küçültülmüş) sınırdan uzaklaşmak
    # pahalı (300 m'de 4 kat, 600 m'de 13 kat). Böylece sınır yerinde kalır ama
    # yakınındaki dereyi ya da sırtı izler.
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra as _dijkstra
    DERE_HUCRE = (ndimage.maximum_filter(alan_km2, size=3)[::K, ::K] > 0.35) & Kk
    SIRT_HUCRE = (SIRT01 > 0.35) & Kk & ~DERE_HUCRE
    DOGAL = DERE_HUCRE | SIRT_HUCRE


    def _dogal_yol(hat, koridor=300.0, ceza=2.5):
        c = list(hat.coords)
        # kıyıdaki uzatma parçalarını çıkar (kara içindeki uçlar)
        while len(c) > 2 and not ADA.contains(Point(c[0])):
            c = c[1:]
        while len(c) > 2 and not ADA.contains(Point(c[-1])):
            c = c[:-1]
        x0_, y0_, x1_, y1_ = LineString(c).buffer(2.7 * koridor).bounds
        i0 = max(0, int((x0_ - GXk[0, 0]) / hk)); i1 = min(ee, int((x1_ - GXk[0, 0]) / hk) + 1)
        j0 = max(0, int((y0_ - GYk[0, 0]) / hk)); j1 = min(bb, int((y1_ - GYk[0, 0]) / hk) + 1)
        pen = Kk[j0:j1, i0:i1]
        bh, be = pen.shape
        orj = np.zeros(pen.shape, bool)
        for (xa, ya), (xb, yb) in zip(c[:-1], c[1:]):
            n_ = max(2, int(math.hypot(xb - xa, yb - ya) / (hk / 2)))
            for t in np.linspace(0, 1, n_):
                jj_ = int(round((ya + (yb - ya) * t - GYk[0, 0]) / hk)) - j0
                ii_ = int(round((xa + (xb - xa) * t - GXk[0, 0]) / hk)) - i0
                if 0 <= jj_ < bh and 0 <= ii_ < be:
                    orj[jj_, ii_] = True
        uz = ndimage.distance_transform_edt(~orj) * hk
        maliyet = 1.0 + 3.0 * (uz / koridor) ** 2 + np.where(DOGAL[j0:j1, i0:i1], 0.0, ceza)
        maliyet = np.where(pen, maliyet, np.inf)
        idx = np.arange(bh * be).reshape(bh, be)
        sat, sut, ag = [], [], []
        for dj, di in ((0, 1), (1, 0), (1, 1), (1, -1)):
            a = idx[max(0, -dj):bh - max(0, dj), max(0, -di):be - max(0, di)]
            bq = idx[max(0, dj):, max(0, di):][:a.shape[0], :a.shape[1]] if di >= 0 else \
                idx[dj:, :be + di][:a.shape[0], :a.shape[1]]
            if di < 0:
                a = idx[:bh - dj, 1:]
                bq = idx[dj:, :be - 1]
            w = 0.5 * (maliyet.ravel()[a.ravel()] + maliyet.ravel()[bq.ravel()]) * math.hypot(dj, di)
            ok = np.isfinite(w)
            sat += [a.ravel()[ok], bq.ravel()[ok]]
            sut += [bq.ravel()[ok], a.ravel()[ok]]
            ag += [w[ok], w[ok]]
        G = coo_matrix((np.concatenate(ag), (np.concatenate(sat), np.concatenate(sut))),
                       shape=(bh * be, bh * be)).tocsr()

        def hucre(pt):
            jj_ = int(round((pt[1] - GYk[0, 0]) / hk)) - j0
            ii_ = int(round((pt[0] - GXk[0, 0]) / hk)) - i0
            jj_, ii_ = min(max(jj_, 0), bh - 1), min(max(ii_, 0), be - 1)
            if not pen[jj_, ii_]:   # karaya en yakın hücre
                kj, ki = np.nonzero(pen)
                k_ = np.argmin((kj - jj_) ** 2 + (ki - ii_) ** 2)
                jj_, ii_ = kj[k_], ki[k_]
            return jj_ * be + ii_

        bas_, son_ = hucre(c[0]), hucre(c[-1])
        _, onc = _dijkstra(G, indices=bas_, return_predecessors=True)
        yol = [son_]
        while yol[-1] != bas_ and onc[yol[-1]] >= 0:
            yol.append(onc[yol[-1]])
        yol = yol[::-1]
        pts = [(GXk[0, 0] + (i0 + q % be) * hk, GYk[0, 0] + (j0 + q // be) * hk) for q in yol]
        pay_dere = float(np.mean([DERE_HUCRE[j0 + q // be, i0 + q % be] for q in yol]))
        pay_sirt = float(np.mean([SIRT_HUCRE[j0 + q // be, i0 + q % be] for q in yol]))
        pts = [tuple(c[0])] + pts[1:-1] + [tuple(c[-1])]
        pts = [tuple(v) for v in _chaikin(list(LineString(pts).simplify(hk * 0.6).coords), 3)]
        return pts, pay_dere, pay_sirt


    IZLEDIGI = {}
    for cift, hl in SINIR_HATLARI.items():
        yeni_ = []
        for h in hl:
            c = list(h.coords)
            bas_uz = c[0] if not ADA.contains(Point(c[0])) else None
            son_uz = c[-1] if not ADA.contains(Point(c[-1])) else None
            # Liman–Merkez (Kemal: "cetvelle çekilmiş gibi değil"): daha geniş
            # koridor, doğal hat dışı daha pahalı.
            lm_ = {ids[cift[0]], ids[cift[1]]} == {"yer_liman", "yer_merkez"}
            pts, pd, ps = _dogal_yol(h, 550.0, 7.0) if lm_ else _dogal_yol(h)
            if bas_uz:
                pts = [bas_uz] + pts
            if son_uz:
                pts = pts + [son_uz]
            L_ = LineString(pts)
            yeni_.append(L_)
            IZLEDIGI.setdefault(cift, []).append((L_.length, pd, ps))
        SINIR_HATLARI[cift] = yeni_
        print(f"  sınır {ids[cift[0]]}-{ids[cift[1]]}: " + ", ".join(
            f"{u / 1000:.1f} km (dere %{pd * 100:.0f}, sırt %{ps * 100:.0f})" for u, pd, ps in IZLEDIGI[cift]))

    # Mahalle çokgenleri: sınır çizgileri + kıyı ile tam örtüşen parçalar
    _tum = unary_union([h for hl in SINIR_HATLARI.values() for h in hl] + [_kiyi_hat])
    # GeoJSON'a giden hatlar kıyıda kesilir
    SINIR_HATLARI = {c: [h.intersection(ADA.buffer(0.5)) for h in hl] for c, hl in SINIR_HATLARI.items()}
    yuzler = list(polygonize(_tum))
    MAHALLE_YENI = {mid: [] for mid in ids}
    for y in yuzler:
        if not ADA.buffer(1).contains(y.representative_point()):
            continue
        # yüzün içindeki 20 m hücrelerin çoğunluk etiketi
        x0_, y0_, x1_, y1_ = y.bounds
        i0 = max(0, int((x0_ - GXk[0, 0]) / hk)); i1 = min(ee, int((x1_ - GXk[0, 0]) / hk) + 2)
        j0 = max(0, int((y0_ - GYk[0, 0]) / hk)); j1 = min(bb, int((y1_ - GYk[0, 0]) / hk) + 2)
        ic_ = _Yol(np.asarray(y.exterior.coords)).contains_points(
            np.column_stack([GXk[j0:j1, i0:i1].ravel(), GYk[j0:j1, i0:i1].ravel()]))
        pencere = etiket[j0:j1, i0:i1].ravel()[ic_]
        if pencere.size == 0:
            rp = y.representative_point()
            pencere = etiket[min(bb - 1, int(round((rp.y - GYk[0, 0]) / hk))),
                             min(ee - 1, int(round((rp.x - GXk[0, 0]) / hk)))].reshape(1)
        pencere = pencere[pencere >= 0]
        lab = np.bincount(pencere).argmax() if pencere.size else 0
        MAHALLE_YENI[ids[lab]].append(y)
    MAHALLE_YENI = {k: unary_union(v) for k, v in MAHALLE_YENI.items()}
    for mid, g in MAHALLE_YENI.items():
        print(f"  {MAHALLE_ADI[mid]:20s} {ESKI_MAHALLE[mid].area / 1e6:5.1f} → {g.area / 1e6:5.1f} km²")

# ---------------------------------------------------------------- yaz: sınırlar
def _ll_hat(g):
    return [_ll(x, y) for x, y in g.coords]


def _ll_cokgen(g):
    parcalar_ = [g] if g.geom_type == "Polygon" else list(g.geoms)
    return {"type": "MultiPolygon",
            "coordinates": [[[_ll(x, y) for x, y in p.exterior.coords]]
                            + [[_ll(x, y) for x, y in r.coords] for r in p.interiors]
                            for p in parcalar_]}


ozellik = [{"type": "Feature", "properties": {"katman": "ada", "ad": "Düzada",
                                              "alanKm2": round(ADA.area / 1e6, 1)},
            "geometry": {"type": "Polygon", "coordinates": [[_ll(x, y) for x, y in ADA.exterior.coords]]}}]
if SABIT is not None:
    ozellik.extend(SABIT)
    MAHALLE_YENI, SINIR_HATLARI = {}, {}
for mid, g in MAHALLE_YENI.items():
    ozellik.append({"type": "Feature", "properties": {
        "katman": "mahalle", "id": mid, "ad": MAHALLE_ADI[mid], "alanKm2": round(g.area / 1e6, 1)},
        "geometry": _ll_cokgen(g)})
for (a, b), hl in SINIR_HATLARI.items():
    for h in [q for g_ in hl for q in (list(g_.geoms) if hasattr(g_, "geoms") else [g_])
              if q.geom_type == "LineString" and q.length > 30]:
        _u = sum(q[0] for q in IZLEDIGI[(a, b)])
        ozellik.append({"type": "Feature", "properties": {
            "katman": "sinir", "mahalleler": [ids[a], ids[b]],
            "dereOrani": round(sum(q[0] * q[1] for q in IZLEDIGI[(a, b)]) / _u, 2),
            "sirtOrani": round(sum(q[0] * q[2] for q in IZLEDIGI[(a, b)]) / _u, 2)},
            "geometry": {"type": "LineString", "coordinates": _ll_hat(h)}})
for h, a in DERELER:
    ozellik.append({"type": "Feature", "properties": {"katman": "dere", "alanKm2": round(a, 2)},
                    "geometry": {"type": "LineString", "coordinates": _ll_hat(h)}})
# Kıyı türü: kum ve kayalık parçaları
_sira = np.r_[KUM_MI, KUM_MI[:1]]
_bas = 0
for k in range(1, len(KUM_MI) + 1):
    if k == len(KUM_MI) or KUM_MI[k] != KUM_MI[_bas]:
        p = np.vstack([KIYI_NOKTA[_bas:k + 1], KIYI_NOKTA[:1]])[:k + 1 - _bas]
        if len(p) >= 2:
            ozellik.append({"type": "Feature", "properties": {
                "katman": "kiyi", "tur": "kum" if KUM_MI[_bas] else "kayalik"},
                "geometry": {"type": "LineString", "coordinates": [_ll(x, y) for x, y in p]}})
        _bas = k
# The Imperial: sahanlık, merdiven hattı (öneri), dip teras, iskele yeri, esnek alan
def _p(g):
    return {"type": "Polygon", "coordinates": [[_ll(x, y) for x, y in g.exterior.coords]]}


ozellik += [
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "alan", "yaricapM": IMP_ALAN_R,
     "not": "Eğim ve kıyı kuralı burada tepe + merdiven için esnek (Kemal, 20 Kasım)"},
     "geometry": _p(Point(*IMP_MERKEZ).buffer(IMP_ALAN_R, 32))},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "sahanlik", "kotM": IMP_KOT},
     "geometry": _p(IMP_SAHANLIK)},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "otel"}, "geometry": _p(Polygon(IMP["otel"]))},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "merdiven-hatti", "oneri": True},
     "geometry": {"type": "LineString", "coordinates": _ll_hat(IMP_MERDIVEN)}},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "dip-teras", "kotM": IMP_TERAS_KOT},
     "geometry": _p(Point(*IMP_DIP_TERAS).buffer(16, 16))},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "kum-cebi"},
     "geometry": {"type": "Point", "coordinates": _ll(*IMP_KUM_CEBI)}},
    {"type": "Feature", "properties": {"katman": "imperial", "tur": "iskele-yeri"},
     "geometry": {"type": "Point", "coordinates": _ll(*IMP_KUM_NOKTA)}},
]
for _y in YERLESIMLER:
    ozellik.append({"type": "Feature", "properties": {
        "katman": "yerlesim", "id": _y["id"], "tanim": _y["tanim"], "mahalle": _y["mahalle"],
        "yaricapM": round(_y["yaricap"]), "kiyiyaUzaklikM": round(_y["yeniKiyi"]),
        "eskiKiyiyaUzaklikM": round(_y["eskiKiyi"]), "eskiNokta": _ll(*_y["eski"])},
        "geometry": {"type": "Point", "coordinates": _ll(*_y["yeni"])}})
    print(f"  {_y['tanim']:42s} kıyıya {_y['eskiKiyi']:5.0f} → {_y['yeniKiyi']:4.0f} m, yarıçap {_y['yaricap']:.0f} m")
ozellik.append({"type": "Feature", "properties": {"katman": "yer", "id": "kuzey_plaji_kiyi",
                "tanim": "Kuzey Plajı kıyısı (Stadyum Bağlantısı'nın kıyıya ulaştığı kesim)"},
                "geometry": {"type": "Point", "coordinates": _ll(*KUZEY_PLAJI_NOKTA)}})
for zid, ad, (px, py), rakim, *_ in ZIRVE_YENI:
    ozellik.append({"type": "Feature", "properties": {"katman": "zirve", "id": zid, "ad": ad, "rakim": rakim},
                    "geometry": {"type": "Point", "coordinates": _ll(px, py)}})
with open(SINIR_DOSYASI, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": ozellik}, f, ensure_ascii=False,
              separators=(",", ":"))
print(f"Sınır dosyası  : {os.path.getsize(SINIR_DOSYASI) / 1e3:.0f} KB")

# Önizleme ve denetim için ara bilgi (geçici klasöre; depoya girmez)
ARA = os.environ.get("KOMPAKT_ARA")
if ARA:
    np.savez_compressed(ARA, Z=Z.astype(np.float32), kara=KARA, wkum=W_KUM.astype(np.float32),
                        alan=alan_km2.astype(np.float32), x0=X0, y0=Y0, hucre=HUCRE)
