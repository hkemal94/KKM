"""Düzada harita geometrisi — kıyı, mahalleler, zirveler, binalar, yollar.

Çıktı: src/data/duzadaGeo.ts (tiplenmiş GeoJSON modülü)

Koordinatlar gerçek enlem/boylam. Ada kurgusal ama Ege'de açık suya
yerleştirildi ki mesafeler ve alanlar metre cinsinden doğru çıksın.
Kanon: 100-180 km², zirve 600-800 m.
"""
import math, json, os
import shapely as _shapely
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely.ops import unary_union, polygonize
from shapely.algorithms.polylabel import polylabel

LAT0, LNG0 = 39.60, 25.85   # 29 Eylül 2026: 39.005, 25.805'ten taşındı (W3 52–53. tur)
M_PER_LAT = 111_132.0
M_PER_LNG = 111_320.0 * math.cos(math.radians(LAT0))
R = 6                      # koordinat ondalık basamağı


def ll(x, y):
    return [round(LNG0 + x / M_PER_LNG, R), round(LAT0 + y / M_PER_LAT, R)]


def ring_ll(coords):
    r = [ll(x, y) for x, y in coords]
    if r[0] != r[-1]:
        r.append(r[0])
    return r


def poly_ll(geom):
    """Shapely çokgeni → GeoJSON koordinat dizisi (delikler dahil)"""
    rings = [ring_ll(list(geom.exterior.coords))]
    for hole in geom.interiors:
        rings.append(ring_ll(list(hole.coords)))
    return rings


# ---------------------------------------------------------------- kıyı çizgisi
def radius(theta):
    rx, ry = 9200.0, 6100.0
    base = 1.0 / math.hypot(math.cos(theta) / rx, math.sin(theta) / ry)
    girinti = (0.055 * math.sin(3 * theta + 0.7)
               + 0.040 * math.sin(5 * theta + 2.1)
               + 0.028 * math.sin(8 * theta + 0.3)
               + 0.018 * math.sin(13 * theta + 1.9))
    return base * (1.0 + girinti)


KOYLAR = [
    (math.radians(152), math.radians(13), 0.30),   # Liman körfezi
    (math.radians(208), math.radians(11), 0.26),   # İskele koyu
    (math.radians(20), math.radians(11), 0.13),    # doğu koyu
]

# Burunlar: kıyıyı dışa doğru çıkaran çıkıntılar. Güney Burnu, İskele
# koyunun güney kolu — koyun hemen bitişiğinde denize çıkan bir çıkıntı.
# Otel bu burnun koya bakan kuzey yamacında durur, koyun içinde değil.
BURUNLAR = [
    (math.radians(219), math.radians(6), 0.16),    # Güney Burnu (güneybatı)
]


def kiyi_r(th):
    """Verilen açıda kıyı yarıçapı — koylar ve burunlar uygulanmış hâli."""
    r = radius(th)
    for merkez, gen, der in KOYLAR:
        d = (th - merkez + math.pi) % (2 * math.pi) - math.pi
        r *= (1.0 - der * math.exp(-(d / gen) ** 2))
    for merkez, gen, cik in BURUNLAR:
        d = (th - merkez + math.pi) % (2 * math.pi) - math.pi
        r *= (1.0 + cik * math.exp(-(d / gen) ** 2))
    return r


kiyi = [(kiyi_r(2 * math.pi * i / 360) * math.cos(2 * math.pi * i / 360),
         kiyi_r(2 * math.pi * i / 360) * math.sin(2 * math.pi * i / 360))
        for i in range(360)]

ada = Polygon(kiyi)
print(f"Ada alanı      : {ada.area / 1e6:.1f} km²")
xs = [p[0] for p in kiyi]
ys = [p[1] for p in kiyi]
print(f"Doğu-batı      : {(max(xs) - min(xs)) / 1000:.1f} km")
print(f"Kuzey-güney    : {(max(ys) - min(ys)) / 1000:.1f} km")
print(f"Kıyı uzunluğu  : {ada.exterior.length / 1000:.1f} km")

# ---------------------------------------------------------------- yükseltiler
#
# Rakım alanı üç katmandan oluşuyor:
#
#   1. Kıyı kayalığı — kıyıdan içeri doğru hızla yükselen dik profil.
#      Ege adalarının çoğunda kıyı düz kum değil, birkaç on metrelik
#      kayalık bir sekidir; otelin uçurumu da buradan çıkıyor.
#   2. İç plato — kayalığın üstünde yavaşça yükselen taban.
#   3. Sırtlar — zirveler dairesel tümsek değil, yönü olan sırtlar
#      (anizotropik Gauss). Gerçek adalar böyledir.
#
# Kanon: en yüksek nokta 600-800 m arası.

KAYALIK_YUKSEK = 30.0     # kıyı sekisinin yüksekliği (m)
KAYALIK_OLCEK = 60.0      # bu mesafede sekinin çoğu tamamlanır (m)
PLATO_YUKSEK = 70.0       # sekinin üstündeki iç platonun katkısı (m)
PLATO_BASLANGIC = 200.0   # plato bu mesafeden sonra yükselmeye başlar (m)
PLATO_OLCEK = 3000.0      # ve bu mesafede tamamlanır (m)

# (id, ad, konum, rakım, sırt uzunluğu, sırt genişliği, sırt yönü°)
#
# Güney Burnu, İskele koyunun güneyindeki çıkıntının sırtı. Otel bu sırtın
# üstünde durur ve koya yukarıdan hâkimdir; konumu aşağıda burnun ekseninden
# hesaplanıyor.
_GUNE_YON = 219.0
# Sırtın omurgası burnun boynunda; koya bakan kuzey yamacı otelin sahanlığı.
_GUNE_TEPE = (-5250.0, -4350.0)

ZIRVELER = [
    ("tepe_ana",     "Ada Tepesi", (1400, -2500), 742, 2700, 1450,  28),
    ("tepe_kuzey",   "Kuzey Sırtı",   (2300,  3000), 386, 2000,  900, -18),
    ("tepe_ciftlik", "Çetmi Sırtı",   (5600, -2600), 254, 1600,  820,  62),
    ("tepe_bati",    "Fener Burnu",   (-5100, 4200), 118,  760,  460,  35),
    ("tepe_gune",    "Güney Burnu",    _GUNE_TEPE,     96, 1300,  560, _GUNE_YON),
]


def _taban_profili(d):
    """Kıyıdan `d` metre içerideki zemin kotu (zirveler hariç).
    numpy dizisiyle de tek sayıyla da çalışır."""
    import numpy as _np
    d = _np.asarray(d, dtype=float)
    kayalik = KAYALIK_YUKSEK * (1.0 - _np.exp(-d / KAYALIK_OLCEK))
    plato = PLATO_YUKSEK * _np.clip((d - PLATO_BASLANGIC) / PLATO_OLCEK, 0.0, 1.0) ** 1.15
    return kayalik + plato


# Uçurumlar. Taban profili kıyıda sıfırdan başlıyor: her yerde kumsal gibi
# yumuşak bir yükseliş. Oysa otelin durduğu yer bir uçurum başı — kara
# kıyıya yüksek kotla varıp denize dikey iniyor. Aşağıdaki terim belirli
# kıyı yaylarında bunu kuruyor.
#
# (kıyı açısı merkezi rad, yarım genişlik rad, uçurum yüksekliği m)
UCURUMLAR = [
    (math.radians(213.0), math.radians(8.0), 18.0),   # Güney Burnu, koya bakan yüz
]
# Uçurum alnı bu mesafede tam yüksekliğine ulaşıyor (m)
UCURUM_ALIN = 26.0


def _ucurum_katkisi(x, y):
    """Uçurum yaylarında kıyıya yüksek kotla varan ek kütle."""
    import numpy as _np
    x = _np.asarray(x, dtype=float)
    y = _np.asarray(y, dtype=float)
    th = _np.arctan2(y, x)
    d = kiyiya_uzaklik(x, y)
    # Alında hızla yüksel, içeride sabit kal
    alin = 1.0 - _np.exp(-d / UCURUM_ALIN)
    toplam = _np.zeros(_np.shape(x), dtype=float)
    for merkez, gen, yuk in UCURUMLAR:
        sapma = (th - merkez + _np.pi) % (2 * _np.pi) - _np.pi
        toplam = toplam + yuk * _np.exp(-(sapma / gen) ** 2) * alin
    return toplam


def kiyi_gecis_mesafesi(x, y):
    """Arazi modelinde kıyı kotunun sıfıra indirileceği mesafe (m).

    Normalde 140 m — kıyı suya değdiği yerde deniz seviyesinde olsun ve
    silüet testere dişi gibi çıkmasın. Uçurum yaylarında ise 50 m: orada
    kara neredeyse dikey iniyor, uzun bir geçiş uçurumu yok ederdi. Daha
    kısası (22 m denendi) 20 m'lik ızgarada tek hücreye sıkışıp kıyıyı
    yeniden testere dişine çeviriyor. `gen/dem.py` bu değeri kullanıyor."""
    import numpy as _np
    th = _np.arctan2(_np.asarray(y, dtype=float), _np.asarray(x, dtype=float))
    mesafe = _np.full(_np.shape(th), 140.0)
    for merkez, gen, _ in UCURUMLAR:
        sapma = (th - merkez + _np.pi) % (2 * _np.pi) - _np.pi
        agirlik = _np.exp(-(sapma / gen) ** 2)
        mesafe = mesafe * (1.0 - agirlik) + 50.0 * agirlik
    return mesafe


def _sirt_katkisi(x, y, zirve, genlik):
    """Yönü olan (anizotropik) Gauss tümsek."""
    import numpy as _np
    _, _, (px, py), _, uzun, genis, aci = zirve
    a = math.radians(aci)
    dx, dy = _np.asarray(x) - px, _np.asarray(y) - py
    u = dx * math.cos(a) + dy * math.sin(a)      # sırt boyunca
    v = -dx * math.sin(a) + dy * math.cos(a)     # sırta dik
    return genlik * _np.exp(-0.5 * ((u / uzun) ** 2 + (v / genis) ** 2))


import numpy as np
from scipy.spatial import cKDTree

# Kıyıya uzaklık, çokgen mesafesi yerine sıklaştırılmış kıyı noktalarına
# en yakın komşu ile hesaplanıyor — on binlerce örnek için tek yol bu.
_kiyi_hat = ada.exterior
_kiyi_sik = np.array([
    _kiyi_hat.interpolate(t, normalized=True).coords[0]
    for t in np.linspace(0, 1, 4000, endpoint=False)
])
_kiyi_agac = cKDTree(_kiyi_sik)


def kiyiya_uzaklik(x, y):
    """Kıyı çizgisine en kısa mesafe (işaretsiz)."""
    noktalar = np.column_stack([np.ravel(x), np.ravel(y)])
    d, _ = _kiyi_agac.query(noktalar, workers=-1)
    return d.reshape(np.shape(x))


# Zirve genlikleri küçük bir doğrusal sistemle çözülüyor. Sırtlar birbirine
# karışıyor: komşu sırtın katkısı da hesaba katılmazsa bir zirve kayıtlı
# rakımından yüksek okunuyor. A·a = h - taban çözülünce her zirve tam
# kendi değerini veriyor.
_n = len(ZIRVELER)
_A = np.zeros((_n, _n))
_hedef = np.zeros(_n)
for _i, _zi in enumerate(ZIRVELER):
    _px, _py = _zi[2]
    _hedef[_i] = (_zi[3] - float(_taban_profili(kiyiya_uzaklik(_px, _py)))
                  - float(_ucurum_katkisi(_px, _py)))
    for _j, _zj in enumerate(ZIRVELER):
        _A[_i, _j] = float(_sirt_katkisi(_px, _py, _zj, 1.0))
_cozum = np.linalg.solve(_A, _hedef)
_ZIRVE_GENLIK = {_z[0]: float(_g) for _z, _g in zip(ZIRVELER, _cozum)}


def yukselti(x, y):
    """Bir noktanın (veya dizinin) deniz seviyesinden rakımı, metre."""
    d = kiyiya_uzaklik(x, y)
    e = _taban_profili(d) + _ucurum_katkisi(x, y)
    for _z in ZIRVELER:
        e = e + _sirt_katkisi(x, y, _z, _ZIRVE_GENLIK[_z[0]])
    return e


print("\nRakım denetimi:")
for _z in ZIRVELER:
    _hesap = float(yukselti(_z[2][0], _z[2][1]))
    print(f"  {_z[1]:16s} kayıt {_z[3]:4d} m   alan {_hesap:6.1f} m")

# ------------------------------------------- su bölümü, sınırlar ve yol ağı
#
# İdari sınırlar iki şeyi birden izliyor:
#
#   coğrafya : Beş sırt hattı, adanın su bölümü düğümünden kıyıya iniyor.
#              Yağmurun hangi yöne aktığını belirleyen çizgiler bunlar ve
#              Ege adalarında belediye sınırları da tam olarak buradan
#              geçer — bir vadinin suyu hangi limana iniyorsa orası o
#              beldenindir.
#   yol      : Bu sırtların üçünün üstünde gerçekten yol var (Sırt
#              Yolları). O üç sınır hem sırt hem yol; kalan ikisi yalnızca
#              sırt.
#
# Önceki denemede sınır tek bir "Çember Yolu" idi: 200 m eşyükseltisini
# izleyen 32 km'lik kapalı halka. Eğimi doğruydu ama adanın ortasına
# çizilmiş bir çember gibi duruyordu, kimse öyle yol yapmaz. Sırt hatları
# hem gerçek hem de haritada kabartmanın üstünden okunuyor.
#
# Yol ağının kuralı: hiçbir yol havada bitmez. Sahil Yolu kapalı bir
# halka, Sırt Yolları onu içeriden düğüme bağlıyor, yerleşim bağlantıları
# da Sahil Yolu'na oturuyor. Aşağıda bu bağlantı bir çizge denetimiyle
# doğrulanıyor.

BUYUK = 40000.0

# Su bölümü düğümü: beş sırtın buluştuğu nokta. Düzada Tepesi'nin kuzey
# omzunda — kütlenin ağırlık merkezi orada ve beş vadi oradan ayrılıyor.
SUBOLUMU = (1500.0, -1800.0)

# Sahil Yolu kıyıdan bu kadar içeride. Kıyı sekisinin üstünde kalıyor:
# ortalama eğim %1.5, en dik nokta %11.
SAHIL_ICERI = 460.0


def _yumusat_halka(nokta_dizisi, gecis=3, pencere=7, adet=260):
    """Kapalı halkayı yumuşatıp yay uzunluğuna göre eşit aralıklı örnekler."""
    p = np.asarray(nokta_dizisi, dtype=float)
    if np.hypot(*(p[0] - p[-1])) < 1e-6:
        p = p[:-1]
    for _ in range(gecis):
        cek = np.ones(pencere) / pencere
        p = np.column_stack([
            np.convolve(np.r_[p[-pencere:, k], p[:, k], p[:pencere, k]],
                        cek, mode="same")[pencere:-pencere]
            for k in (0, 1)
        ])
    kenar = np.hypot(*np.diff(np.r_[p, p[:1]], axis=0).T)
    yay = np.r_[0.0, np.cumsum(kenar)]
    hedef = np.linspace(0, yay[-1], adet, endpoint=False)
    return [(float(np.interp(t, yay, np.r_[p[:, 0], p[0, 0]])),
             float(np.interp(t, yay, np.r_[p[:, 1], p[0, 1]]))) for t in hedef]


_sahil_halka = ada.buffer(-SAHIL_ICERI)
if _sahil_halka.geom_type == "MultiPolygon":
    _sahil_halka = max(_sahil_halka.geoms, key=lambda g: g.area)
SAHIL_YOLU = _yumusat_halka(list(_sahil_halka.exterior.coords))
sahil_hat = LineString(SAHIL_YOLU + [SAHIL_YOLU[0]])

print(f"\nSahil Yolu     : {sahil_hat.length / 1000:.1f} km, "
      f"kıyıdan {SAHIL_ICERI:.0f} m içeride")


# --- sırt hatları ---------------------------------------------------------

def _kiyi_noktasi(aci):
    """Düğümden verilen açıda atılan ışının kıyıyla kesiştiği nokta."""
    th = math.radians(aci)
    isin = LineString([SUBOLUMU, (SUBOLUMU[0] + BUYUK * math.cos(th),
                                  SUBOLUMU[1] + BUYUK * math.sin(th))])
    kes = isin.intersection(ada.exterior)
    noktalar = [k for k in (list(kes.geoms) if hasattr(kes, "geoms") else [kes])
                if k.geom_type == "Point"]
    if not noktalar:
        raise SystemExit(f"HATA: {aci:.0f}° ışını kıyıyı kesmiyor")
    return max(noktalar, key=lambda k: math.hypot(k.x - SUBOLUMU[0],
                                                  k.y - SUBOLUMU[1]))


# Sırt hatları bir yol arama problemi olarak çözülüyor: düğümden hedef
# kıyı noktasına giden, ORTALAMA YÜKSEKLİĞİ EN BÜYÜK yol. Maliyet
# "tepe kotu eksi buradaki kot" olduğu için Dijkstra doğal olarak sırtı
# takip ediyor, vadiye inmiyor.
#
# Önce açgözlü bir yürüyüş denendi ("her adımda hedefe yaklaş, koni
# içindeki en yüksek noktayı seç"): hedefe yaklaşma koşulu yolu cetvel
# gibi düzleştiriyordu, koşul gevşetilince de beş hattın dördü aynı ana
# sırta yapışıp doğuya akıyordu. Küresel arama ikisini de çözüyor.

_SIRT_IZGARA = 110.0          # arama ızgarası hücresi (m)
_SIRT_UZUNLUK_CEZASI = 45.0   # yol uzunluğunun maliyete katkısı


def _sirt_izgarasi():
    x0, y0, x1, y1 = ada.bounds
    nx = int((x1 - x0) / _SIRT_IZGARA) + 1
    ny = int((y1 - y0) / _SIRT_IZGARA) + 1
    gx = x0 + np.arange(nx) * _SIRT_IZGARA
    gy = y0 + np.arange(ny) * _SIRT_IZGARA
    GX, GY = np.meshgrid(gx, gy)
    Z = np.asarray(yukselti(GX, GY), dtype=float)
    from shapely.prepared import prep
    hazir = prep(ada)
    icinde = np.fromiter(
        (hazir.contains(Point(a, b)) for a, b in zip(GX.ravel(), GY.ravel())),
        dtype=bool, count=GX.size).reshape(GX.shape)
    return gx, gy, np.where(icinde, Z, -1e6)


_SGX, _SGY, _SZ = _sirt_izgarasi()
_SZMAX = float(_SZ.max())


def _izgara_hucresi(nokta):
    """Noktanın en yakın KARA ızgara hücresi."""
    i = int(round((nokta[0] - _SGX[0]) / _SIRT_IZGARA))
    j = int(round((nokta[1] - _SGY[0]) / _SIRT_IZGARA))
    i = max(0, min(len(_SGX) - 1, i))
    j = max(0, min(len(_SGY) - 1, j))
    if _SZ[j, i] > -1e5:
        return (j, i)
    # Kıyı noktaları ızgarada denize düşebiliyor; en yakın kara hücresine kay
    for halka in range(1, 8):
        en = None
        for dj in range(-halka, halka + 1):
            for di in range(-halka, halka + 1):
                nj, ni = j + dj, i + di
                if not (0 <= nj < _SZ.shape[0] and 0 <= ni < _SZ.shape[1]):
                    continue
                if _SZ[nj, ni] <= -1e5:
                    continue
                d = math.hypot(_SGX[ni] - nokta[0], _SGY[nj] - nokta[1])
                if en is None or d < en[0]:
                    en = (d, nj, ni)
        if en:
            return (en[1], en[2])
    raise SystemExit(f"HATA: {nokta} için kara ızgara hücresi yok")


_SIRT_ZREF = 450.0          # bu kotun altı "vadi" sayılıyor
_SIRT_TIRMANMA = 1.6        # alçak yolun metre başına ek maliyeti
_SIRT_AYRIM = 30.0          # başka bir sırtın kullandığı hücrenin cezası


def _en_yuksek_yol(baslangic, hedef, dolu):
    """Sırtı izleyen en iyi yol: maliyet, kot düştükçe artan bir metre
    ücreti. `dolu` başka sırtların geçtiği hücreler — oralardan geçmek
    çok pahalı, böylece hatlar birbirine yapışmıyor.

    Ceza olmadan beş hattın hepsi ana omurgayı paylaşıyor ve ada üç
    parçaya bölünüyordu: su bölümleri gerçekte de ana sırttan dallanır ama
    haritada beş ayrı sınır çizgisi gerekiyor."""
    import heapq
    d = np.full(_SZ.shape, np.inf)
    onceki = {}
    bj, bi = baslangic
    d[bj, bi] = 0.0
    kuyruk = [(0.0, bj, bi)]
    while kuyruk:
        c, j, i = heapq.heappop(kuyruk)
        if c > d[j, i]:
            continue
        if (j, i) == hedef:
            break
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if dj == 0 and di == 0:
                    continue
                nj, ni = j + dj, i + di
                if not (0 <= nj < _SZ.shape[0] and 0 <= ni < _SZ.shape[1]):
                    continue
                if _SZ[nj, ni] <= -1e5:
                    continue
                boy = _SIRT_IZGARA * math.hypot(dj, di)
                kot = (_SZ[j, i] + _SZ[nj, ni]) / 2.0
                birim = 1.0 + _SIRT_TIRMANMA * max(0.0, _SIRT_ZREF - kot) / _SIRT_ZREF
                if (nj, ni) in dolu:
                    birim += _SIRT_AYRIM
                agirlik = birim * boy
                if c + agirlik < d[nj, ni]:
                    d[nj, ni] = c + agirlik
                    onceki[(nj, ni)] = (j, i)
                    heapq.heappush(kuyruk, (c + agirlik, nj, ni))
    if d[hedef] == np.inf:
        raise SystemExit(f"HATA: {hedef} hücresine sırt yolu bulunamadı")
    adim = [hedef]
    while adim[-1] != baslangic:
        adim.append(onceki[adim[-1]])
    hucreler = list(reversed(adim))
    return hucreler, [(float(_SGX[i]), float(_SGY[j])) for j, i in hucreler]


# --- eğim bilen yol güzergâhı ---------------------------------------------
#
# Sırt hatları coğrafya; yol başka bir şey. Düz çizgiyle bağlanan yollar
# %20-23 eğim veriyordu (kimse öyle yol yapmaz) çünkü hepsi 687 metredeki
# su bölümü düğümüne tırmanıyordu. Gerçek yol eğimi gözetir ve gerekirse
# uzar: aşağıdaki arama metre başına maliyeti eğimle cezalandırıyor, o da
# kendiliğinden viraj ve serpantin üretiyor.

_YOL_IZGARA = 60.0            # yol araması daha ince ızgarada
_YOL_HEDEF_EGIM = 0.07        # bu eğime kadar ceza yok
_YOL_EGIM_CEZASI = 260.0      # aşınca metre başına ceza katsayısı


def _yol_izgarasi():
    x0, y0, x1, y1 = ada.bounds
    nx = int((x1 - x0) / _YOL_IZGARA) + 1
    ny = int((y1 - y0) / _YOL_IZGARA) + 1
    gx = x0 + np.arange(nx) * _YOL_IZGARA
    gy = y0 + np.arange(ny) * _YOL_IZGARA
    GX, GY = np.meshgrid(gx, gy)
    Z = np.asarray(yukselti(GX, GY), dtype=float)
    from shapely.prepared import prep
    hazir = prep(ada.buffer(-40))
    icinde = np.fromiter(
        (hazir.contains(Point(a, b)) for a, b in zip(GX.ravel(), GY.ravel())),
        dtype=bool, count=GX.size).reshape(GX.shape)
    return gx, gy, np.where(icinde, Z, np.nan)


_YGX, _YGY, _YZ = _yol_izgarasi()


def _yol_hucresi(nokta):
    i = int(round((nokta[0] - _YGX[0]) / _YOL_IZGARA))
    j = int(round((nokta[1] - _YGY[0]) / _YOL_IZGARA))
    i = max(0, min(len(_YGX) - 1, i))
    j = max(0, min(len(_YGY) - 1, j))
    if not np.isnan(_YZ[j, i]):
        return (j, i)
    for halka in range(1, 10):
        en = None
        for dj in range(-halka, halka + 1):
            for di in range(-halka, halka + 1):
                nj, ni = j + dj, i + di
                if not (0 <= nj < _YZ.shape[0] and 0 <= ni < _YZ.shape[1]):
                    continue
                if np.isnan(_YZ[nj, ni]):
                    continue
                d = math.hypot(_YGX[ni] - nokta[0], _YGY[nj] - nokta[1])
                if en is None or d < en[0]:
                    en = (d, nj, ni)
        if en:
            return (en[1], en[2])
    raise SystemExit(f"HATA: {nokta} için yol ızgara hücresi yok")


def yol_guzergahi(bas_nokta, son_noktalar):
    """Eğimi gözeten güzergâh(lar). `son_noktalar` birden çok olabilir;
    hepsi tek Dijkstra ile çözülüyor."""
    import heapq
    bas = _yol_hucresi(bas_nokta)
    hedefler = {_yol_hucresi(p): p for p in son_noktalar}
    d = np.full(_YZ.shape, np.inf)
    onceki = {}
    d[bas] = 0.0
    kuyruk = [(0.0, bas[0], bas[1])]
    kalan = set(hedefler)
    while kuyruk and kalan:
        c, j, i = heapq.heappop(kuyruk)
        if c > d[j, i]:
            continue
        kalan.discard((j, i))
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if dj == 0 and di == 0:
                    continue
                nj, ni = j + dj, i + di
                if not (0 <= nj < _YZ.shape[0] and 0 <= ni < _YZ.shape[1]):
                    continue
                if np.isnan(_YZ[nj, ni]):
                    continue
                boy = _YOL_IZGARA * math.hypot(dj, di)
                egim = abs(_YZ[nj, ni] - _YZ[j, i]) / boy
                asim = max(0.0, egim - _YOL_HEDEF_EGIM)
                agirlik = boy * (1.0 + _YOL_EGIM_CEZASI * asim * asim)
                if c + agirlik < d[nj, ni]:
                    d[nj, ni] = c + agirlik
                    onceki[(nj, ni)] = (j, i)
                    heapq.heappush(kuyruk, (c + agirlik, nj, ni))
    cikti = {}
    for h, p in hedefler.items():
        if d[h] == np.inf:
            raise SystemExit(f"HATA: {p} için yol güzergâhı bulunamadı")
        adim = [h]
        while adim[-1] != bas:
            adim.append(onceki[adim[-1]])
        yol = [(float(_YGX[i]), float(_YGY[j])) for j, i in reversed(adim)]
        cikti[p] = _hat_yumusat(yol, gecis=2, pencere=5)
    return cikti


_SIRT_ZREF = 450.0          # bu kotun altı "vadi" sayılıyor
_SIRT_TIRMANMA = 1.6        # alçak yolun metre başına ek maliyeti
_SIRT_AYRIM = 30.0          # başka bir sırtın kullandığı hücrenin cezası


def _en_yuksek_yol(baslangic, hedef, dolu):
    """Sırtı izleyen en iyi yol: maliyet, kot düştükçe artan bir metre
    ücreti. `dolu` başka sırtların geçtiği hücreler — oralardan geçmek
    çok pahalı, böylece hatlar birbirine yapışmıyor.

    Ceza olmadan beş hattın hepsi ana omurgayı paylaşıyor ve ada üç
    parçaya bölünüyordu: su bölümleri gerçekte de ana sırttan dallanır ama
    haritada beş ayrı sınır çizgisi gerekiyor."""
    import heapq
    d = np.full(_SZ.shape, np.inf)
    onceki = {}
    bj, bi = baslangic
    d[bj, bi] = 0.0
    kuyruk = [(0.0, bj, bi)]
    while kuyruk:
        c, j, i = heapq.heappop(kuyruk)
        if c > d[j, i]:
            continue
        if (j, i) == hedef:
            break
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if dj == 0 and di == 0:
                    continue
                nj, ni = j + dj, i + di
                if not (0 <= nj < _SZ.shape[0] and 0 <= ni < _SZ.shape[1]):
                    continue
                if _SZ[nj, ni] <= -1e5:
                    continue
                boy = _SIRT_IZGARA * math.hypot(dj, di)
                kot = (_SZ[j, i] + _SZ[nj, ni]) / 2.0
                birim = 1.0 + _SIRT_TIRMANMA * max(0.0, _SIRT_ZREF - kot) / _SIRT_ZREF
                if (nj, ni) in dolu:
                    birim += _SIRT_AYRIM
                agirlik = birim * boy
                if c + agirlik < d[nj, ni]:
                    d[nj, ni] = c + agirlik
                    onceki[(nj, ni)] = (j, i)
                    heapq.heappush(kuyruk, (c + agirlik, nj, ni))
    if d[hedef] == np.inf:
        raise SystemExit(f"HATA: {hedef} hücresine sırt yolu bulunamadı")
    adim = [hedef]
    while adim[-1] != baslangic:
        adim.append(onceki[adim[-1]])
    hucreler = list(reversed(adim))
    return hucreler, [(float(_SGX[i]), float(_SGY[j])) for j, i in hucreler]


# --- eğim bilen yol güzergâhı ---------------------------------------------
#
# Sırt hatları coğrafya; yol başka bir şey. Düz çizgiyle bağlanan yollar
# %20-23 eğim veriyordu (kimse öyle yol yapmaz) çünkü hepsi 687 metredeki
# su bölümü düğümüne tırmanıyordu. Gerçek yol eğimi gözetir ve gerekirse
# uzar: aşağıdaki arama metre başına maliyeti eğimle cezalandırıyor, o da
# kendiliğinden viraj ve serpantin üretiyor.

_YOL_IZGARA = 60.0            # yol araması daha ince ızgarada
_YOL_HEDEF_EGIM = 0.07        # bu eğime kadar ceza yok
_YOL_EGIM_CEZASI = 260.0      # aşınca metre başına ceza katsayısı


def _yol_izgarasi():
    x0, y0, x1, y1 = ada.bounds
    nx = int((x1 - x0) / _YOL_IZGARA) + 1
    ny = int((y1 - y0) / _YOL_IZGARA) + 1
    gx = x0 + np.arange(nx) * _YOL_IZGARA
    gy = y0 + np.arange(ny) * _YOL_IZGARA
    GX, GY = np.meshgrid(gx, gy)
    Z = np.asarray(yukselti(GX, GY), dtype=float)
    from shapely.prepared import prep
    hazir = prep(ada.buffer(-40))
    icinde = np.fromiter(
        (hazir.contains(Point(a, b)) for a, b in zip(GX.ravel(), GY.ravel())),
        dtype=bool, count=GX.size).reshape(GX.shape)
    return gx, gy, np.where(icinde, Z, np.nan)


_YGX, _YGY, _YZ = _yol_izgarasi()


def _yol_hucresi(nokta):
    i = int(round((nokta[0] - _YGX[0]) / _YOL_IZGARA))
    j = int(round((nokta[1] - _YGY[0]) / _YOL_IZGARA))
    i = max(0, min(len(_YGX) - 1, i))
    j = max(0, min(len(_YGY) - 1, j))
    if not np.isnan(_YZ[j, i]):
        return (j, i)
    for halka in range(1, 10):
        en = None
        for dj in range(-halka, halka + 1):
            for di in range(-halka, halka + 1):
                nj, ni = j + dj, i + di
                if not (0 <= nj < _YZ.shape[0] and 0 <= ni < _YZ.shape[1]):
                    continue
                if np.isnan(_YZ[nj, ni]):
                    continue
                d = math.hypot(_YGX[ni] - nokta[0], _YGY[nj] - nokta[1])
                if en is None or d < en[0]:
                    en = (d, nj, ni)
        if en:
            return (en[1], en[2])
    raise SystemExit(f"HATA: {nokta} için yol ızgara hücresi yok")


def yol_guzergahi(bas_nokta, son_noktalar):
    """Eğimi gözeten güzergâh(lar). `son_noktalar` birden çok olabilir;
    hepsi tek Dijkstra ile çözülüyor."""
    import heapq
    bas = _yol_hucresi(bas_nokta)
    hedefler = {_yol_hucresi(p): p for p in son_noktalar}
    d = np.full(_YZ.shape, np.inf)
    onceki = {}
    d[bas] = 0.0
    kuyruk = [(0.0, bas[0], bas[1])]
    kalan = set(hedefler)
    while kuyruk and kalan:
        c, j, i = heapq.heappop(kuyruk)
        if c > d[j, i]:
            continue
        kalan.discard((j, i))
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if dj == 0 and di == 0:
                    continue
                nj, ni = j + dj, i + di
                if not (0 <= nj < _YZ.shape[0] and 0 <= ni < _YZ.shape[1]):
                    continue
                if np.isnan(_YZ[nj, ni]):
                    continue
                boy = _YOL_IZGARA * math.hypot(dj, di)
                egim = abs(_YZ[nj, ni] - _YZ[j, i]) / boy
                asim = max(0.0, egim - _YOL_HEDEF_EGIM)
                agirlik = boy * (1.0 + _YOL_EGIM_CEZASI * asim * asim)
                if c + agirlik < d[nj, ni]:
                    d[nj, ni] = c + agirlik
                    onceki[(nj, ni)] = (j, i)
                    heapq.heappush(kuyruk, (c + agirlik, nj, ni))
    cikti = {}
    for h, p in hedefler.items():
        if d[h] == np.inf:
            raise SystemExit(f"HATA: {p} için yol güzergâhı bulunamadı")
        adim = [h]
        while adim[-1] != bas:
            adim.append(onceki[adim[-1]])
        yol = [(float(_YGX[i]), float(_YGY[j])) for j, i in reversed(adim)]
        cikti[p] = _hat_yumusat(yol, gecis=2, pencere=5)
    return cikti


def _hat_yumusat(noktalar, gecis=1, pencere=3):
    """Izgara merdivenini yumuşat; uçları yerinde kalsın."""
    p = np.asarray(noktalar, dtype=float)
    if len(p) < pencere + 2:
        return [tuple(q) for q in p]
    for _ in range(gecis):
        yeni = p.copy()
        yarim = pencere // 2
        for k in range(yarim, len(p) - yarim):
            yeni[k] = p[k - yarim:k + yarim + 1].mean(axis=0)
        yeni[0], yeni[-1] = p[0], p[-1]
        p = yeni
    return [tuple(q) for q in p]


# Sırt hatları. Bunlar artık SINIR değil — yalnızca Sırt Yolları'nın
# hizasını veriyorlar. İdari sınırlar aşağıda ayrıca kuruluyor ve hiçbir
# yolla çakışmıyor: Kemal sınırların yoldan bağımsız olmasını istedi.
#
# (id, ad, hedef kıyı açısı°, üstünde yol var mı)
SIRTLAR = [
    ("sirt_dogu",  "Çetmi Sırtı hattı",  25.0,  True),
    ("sirt_kuzey", "Kuzey Sırtı hattı",  86.0,  True),
    ("sirt_bati",  "Merkez sırtı",      134.0,  False),
    ("sirt_gbati", "Güney sırtı",       168.0,  True),
    # Güney Burnu sırtı artık "Güney sırtı" olduğu için bu hat ayırt edilsin
    # diye yeniden adlandırıldı; üstünde yol yok, dışarı da verilmiyor.
    ("sirt_guney", "Güneydoğu sırtı",   268.0,  False),
]

_sirt_hedefleri = {}
for _sid, _, _a, _ in SIRTLAR:
    _k = _kiyi_noktasi(_a)
    _sirt_hedefleri[_sid] = ((_k.x, _k.y), _izgara_hucresi((_k.x, _k.y)))

_dugum_hucre = _izgara_hucresi(SUBOLUMU)
_dolu = set()
_ham_yollar = {}
for _sid, _, _, _ in SIRTLAR:
    _kiyi_nok, _hucre = _sirt_hedefleri[_sid]
    _hucreler, _yol = _en_yuksek_yol(_dugum_hucre, _hucre, _dolu)
    _ham_yollar[_sid] = _yol
    # Düğümün hemen çevresi ortak kalsın, gerisi başkasına kapansın.
    # Komşu hücreler de kapanıyor: hatlar en az iki hücre (220 m) aralı
    # kalsın, yoksa yumuşatma onları birbirine yapıştırıyor ve iki sınır
    # ortak bir parça paylaşınca ayrıştırma bozuluyor.
    for _h in _hucreler:
        if abs(_h[0] - _dugum_hucre[0]) + abs(_h[1] - _dugum_hucre[1]) <= 2:
            continue
        for _dj in (-1, 0, 1):
            for _di in (-1, 0, 1):
                _dolu.add((_h[0] + _dj, _h[1] + _di))

sirt_geom = {}
for _sid, (_kiyi_nok, _hucre) in _sirt_hedefleri.items():
    _hat = _hat_yumusat(_ham_yollar[_sid])
    _hat[0] = SUBOLUMU
    # Son nokta ada çokgeninin ÜSTÜNDE olmalı: polygonize ancak o zaman
    # dilimleri kapatabiliyor.
    _snap = ada.exterior.interpolate(ada.exterior.project(Point(*_kiyi_nok)))
    _hat.append((_snap.x, _snap.y))
    sirt_geom[_sid] = _hat

# ------------------------------------------------------- idari sınırlar
#
# Sınırlar yoldan BAĞIMSIZ. Bir ara sınır çizgilerini yolların üstüne
# oturtmuştuk ("Çember Yolu" + dört radyal); sınır olarak okunuşu iyiydi
# ama o halkayı yol saymak gerçekçi değildi — kimse adanın ortasına
# pergelle yol yapmaz. Şimdi aynı geometri duruyor, ama bunlar yalnızca
# idari çizgi: yerde karşılıkları bir yol değil, kot ve yön.
#
#   Çember Sınırı : 235 m eşyükseltisi. İçinde kalan yayla Merkez
#                   Mahallesi. Yükselti sınırı gerçek bir idari ölçüttür
#                   (orman ve yayla sınırları böyle çizilir).
#   Dört radyal   : çemberden kıyıya inen sınırlar. Aralarındaki dört
#                   dilim öbür dört mahalle.

CEMBER_KOTU = 235.0


def _esyukselti_halkasi(kot):
    """Verilen kottaki en uzun kapalı eşyükselti eğrisi."""
    import matplotlib as _mpl
    _mpl.use("Agg")
    import matplotlib.pyplot as _plt
    x0, y0, x1, y1 = ada.bounds
    GX, GY = np.meshgrid(np.linspace(x0, x1, 460), np.linspace(y0, y1, 330))
    Z = np.asarray(yukselti(GX, GY))
    cs = _plt.contour(GX, GY, Z, levels=[kot])
    segler = [sg for sg in cs.allsegs[0] if len(sg) > 40]
    _plt.clf()
    if not segler:
        raise SystemExit(f"HATA: {kot} m eşyükseltisi bulunamadı")
    return max(segler, key=lambda sg: Polygon(sg).area if len(sg) > 3 else 0)


# Elle düzenleme dosyası varsa hesaplanan sınırın yerine o geçiyor.
# `harita-duzenle.html` sayfasında sürüklenen çizgiler buraya iniyor;
# üretecin geri kalanı (mahalle çokgenleri, bina denetimi, etiketler)
# değişmeden onların üstünde çalışıyor.
SINIR_DUZENLEME = None
_duzenleme_yolu = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "sinir-duzenleme.json")
if os.path.exists(_duzenleme_yolu):
    with open(_duzenleme_yolu, encoding="utf-8") as _f:
        SINIR_DUZENLEME = json.load(_f)
    print(f"Sınır düzenleme: {_duzenleme_yolu} okundu "
          f"({len(SINIR_DUZENLEME.get('hatlar', {}))} hat)")


# Kemal'in Kurucu taslağı (Ege dokusu, 2 Ekim): yollar, taşıdığı yapılar.
# `gen/kurucu_aktar.py` yedekten çıkarır. Yollar yalnız sokak ağı olarak
# kullanılır (haritada yine Kurucu katmanından çizilir).
_KURUCU = {}
_kurucu_dosyasi = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "kurucu-yollari.json")
if os.path.exists(_kurucu_dosyasi):
    with open(_kurucu_dosyasi, encoding="utf-8") as _f:
        _KURUCU = json.load(_f)
    print(f"Kurucu yolları : {_KURUCU.get('kaynak', '?')} — "
          f"{len(_KURUCU.get('yollar', []))} yol, "
          f"{len(_KURUCU.get('tasinanEvler', []))} taşınan ev")


def _dm(p):
    """[boylam, enlem] → üretecin metresi"""
    return ((p[0] - LNG0) * M_PER_LNG, (p[1] - LAT0) * M_PER_LAT)


def _parcala(g):
    """Her türlü geometriden çokgen listesi"""
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if hasattr(g, "geoms"):
        return [p for h in g.geoms for p in _parcala(h)]
    return []


def _kurucu_tasi(geom, d):
    """Kurucu'nun yapı düzenini (dx, dy metre, y aşağı; aci radyan) uygular"""
    from shapely import affinity
    g = affinity.rotate(geom, -d.get("aci", 0.0), origin=geom.centroid, use_radians=True)
    # Kurucu metresi enlemde 111.320 m/derece, üreteçinki M_PER_LAT (7 Ekim:
    # oran tersti; 844 m taşınan meyhane 3 m kayık çıkıyordu)
    return affinity.translate(g, d.get("dx", 0.0), -d.get("dy", 0.0) * M_PER_LAT / 111320.0)


def catmull_rom(kontrol, kapali, bolme=8):
    """Kontrol noktalarından geçen yumuşak eğri.

    `src/components/harita/sinirBolgeleri.ts` içindeki `catmullRom` ile
    BİREBİR aynı olmalı: düzenleyicide görülen eğri ile üretecin kullandığı
    eğri aynı şey olsun."""
    n = len(kontrol)
    if n < 3:
        return list(kontrol)

    def al(i):
        if kapali:
            return kontrol[i % n]
        return kontrol[max(0, min(n - 1, i))]

    cikti = []
    for i in range(n if kapali else n - 1):
        p0, p1, p2, p3 = al(i - 1), al(i), al(i + 1), al(i + 2)
        for j in range(bolme):
            t = j / bolme
            t2, t3 = t * t, t * t * t
            cikti.append(tuple(
                0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
                       + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)))
    if not kapali:
        cikti.append(tuple(kontrol[-1]))
    return cikti


def _duzenlenmis(hat_id):
    """Elle düzenlenmiş hattı metre koordinatlarında verir, yoksa None.

    Düzenleyici seyrek bir kontrol çokgeni kaydediyor (çember 30, radyal 10
    nokta); buradaki eğri onunla aynı Catmull-Rom'dan geçiyor."""
    if not SINIR_DUZENLEME:
        return None
    ham = SINIR_DUZENLEME.get("hatlar", {}).get(hat_id)
    if not ham:
        return None
    kontrol = [((lng - LNG0) * M_PER_LNG, (lat - LAT0) * M_PER_LAT)
               for lng, lat in ham]
    return catmull_rom(kontrol, kapali=(hat_id == "sinir_cember"))


_cember_duzenli = _duzenlenmis("sinir_cember")
MAHALLE_CEMBERI = _cember_duzenli or _yumusat_halka(
    _esyukselti_halkasi(CEMBER_KOTU), gecis=8, pencere=15, adet=180)
cember_poly = Polygon(MAHALLE_CEMBERI)
_cember_sinir = cember_poly.exterior
ODAK = (cember_poly.centroid.x, cember_poly.centroid.y)

print(f"Çember Sınırı  : "
      + ("elle düzenlenmiş" if _cember_duzenli
         else f"{CEMBER_KOTU:.0f} m eşyükseltisi")
      + f", iç alan {ada.intersection(cember_poly).area / 1e6:.1f} km²")


def _odaktan_isin(aci):
    th = math.radians(aci)
    return LineString([ODAK, (ODAK[0] + BUYUK * math.cos(th),
                              ODAK[1] + BUYUK * math.sin(th))])


def _isin_kesisimi(aci, hat):
    kes = _odaktan_isin(aci).intersection(hat)
    if kes.is_empty:
        raise SystemExit(f"HATA: {aci:.0f}° ışını hattı kesmiyor")
    noktalar = [k for k in (list(kes.geoms) if hasattr(kes, "geoms") else [kes])
                if k.geom_type == "Point"]
    return max(noktalar,
               key=lambda k: math.hypot(k.x - ODAK[0], k.y - ODAK[1]))


# (id, ad, açı°, yanal salınım m)
SINIR_RADYALLERI = [
    ("sinir_dogu",  "Doğu sınırı",    20.0,  170.0),
    ("sinir_kuzey", "Kuzey sınırı",  104.0, -210.0),
    ("sinir_bati",  "Batı sınırı",   169.0,  230.0),
    ("sinir_guney", "Güney sınırı",  265.0, -180.0),
]


def _sinir_radyali(aci, salinim, n=40):
    """Çember Sınırı'ndan kıyıya inen sınır çizgisi. Cetvel çizgisi değil:
    ortada yanal salınımı olan, iki ucu tam yerine oturan yumuşak bir eğri.

    Burada eğim derdi yok — bu bir yol değil, sınır."""
    bas = _isin_kesisimi(aci, _cember_sinir)
    son = _isin_kesisimi(aci, ada.exterior)
    th = math.radians(aci)
    ct, st = math.cos(th), math.sin(th)
    dx, dy = son.x - bas.x, son.y - bas.y
    return [(bas.x + dx * (i / n) - salinim * math.sin(math.pi * i / n) * st,
             bas.y + dy * (i / n) + salinim * math.sin(math.pi * i / n) * ct)
            for i in range(n + 1)]


sinir_geom = {sid: (_duzenlenmis(sid) or _sinir_radyali(a, sal))
              for sid, _, a, sal in SINIR_RADYALLERI}


def _radyal_tam(sid, aci):
    """Dilim çokgeni için: odaktan BUYUK'e uzanan tam hat."""
    th = math.radians(aci)
    return ([ODAK] + sinir_geom[sid]
            + [(ODAK[0] + BUYUK * math.cos(th), ODAK[1] + BUYUK * math.sin(th))])


# Merkez kasabası: çemberin içinde, sırtın üstünde. Eski köyün yeri; Merkez
# Bağlantısı ve Dağ Yolu hâlâ buradan geçiyor.
MERKEZ_KASABA = (820.0, -430.0)
# Yeni Merkez (8 Ekim, Kemal: "Merkez mahallesini ana yolların çevresine kur,
# yuvarlak şehir yapısını sil"): kuzeydeki dört yol ağzı. Batı–Doğu sırt
# yolu, Kuzey Sırtı Yolu ve Kemal'in Kurucu'da çizdiği ana yol burada kesişir.
# Kesin nokta yollar düzenlendikten sonra hesaplanır (`MERKEZ_KAVSAK`).
MERKEZ_MEYDANI = (1430.0, 1010.0)

YERLESIM_NOKTASI = {
    "yer_merkez":  MERKEZ_KASABA,
    "yer_liman":   (-4500.0, 2450.0),
    "yer_iskele":  (-5080.0, -2060.0),
    "yer_stadyum": (4550.0, 2950.0),
    "yer_ciftlik": (6280.0, -2330.0),
}
MAHALLE_ADI = {
    "yer_merkez": "Merkez Mahallesi", "yer_liman": "Liman Mahallesi",
    "yer_iskele": "İskele Mahallesi", "yer_stadyum": "Stadyum Mahallesi",
    "yer_ciftlik": "Çiftlik Mahallesi",
}

# Merkez yaylanın yanında dört yol ağzını da içine alır (8 Ekim): kavşak
# 235 m eşyükseltisinin hemen dışında kalıyordu, kolları Liman'a düşüyordu.
_merkez_alani = unary_union([cember_poly, Point(*MERKEZ_MEYDANI).buffer(720, 64)])
mahalle_geom = {
    "yer_merkez": ("Merkez Mahallesi", MERKEZ_MEYDANI,
                   ada.intersection(_merkez_alani)),
}

_dis = ada.difference(_merkez_alani)
_dilimler = []
DILIM_SIRASI = [None] * len(SINIR_RADYALLERI)   # i. dilim hangi mahalle
for _i, (_sid, _, _a0, _) in enumerate(SINIR_RADYALLERI):
    _sid2, _, _a1, _ = SINIR_RADYALLERI[(_i + 1) % len(SINIR_RADYALLERI)]
    if _a1 <= _a0:
        _a1 += 360.0
    _sektor = Polygon(_radyal_tam(_sid, _a0)
                      + list(reversed(_radyal_tam(_sid2, _a1))))
    if not _sektor.is_valid:
        _sektor = _sektor.buffer(0)
    _hucre = _dis.intersection(_sektor)
    if _hucre.geom_type == "MultiPolygon":
        _hucre = max(_hucre.geoms, key=lambda g: g.area)
    _dilimler.append((_i, _hucre))

for _mid, _nokta in YERLESIM_NOKTASI.items():
    if _mid == "yer_merkez":
        continue
    _es = next((d for d in _dilimler if d[1].buffer(30).contains(Point(*_nokta))),
               None)
    if _es is None:
        raise SystemExit(f"HATA: {MAHALLE_ADI[_mid]} hiçbir dilime düşmedi "
                         f"— sınır radyallerini gözden geçir")
    _dilimler.remove(_es)
    DILIM_SIRASI[_es[0]] = _mid
    mahalle_geom[_mid] = (MAHALLE_ADI[_mid], _nokta, _es[1])

# Kıyı girintilerinde artıklar kalabiliyor; boşluk bırakmamak için her
# artığı en çok komşu olduğu mahalleye katıyoruz.
_artik = ada.difference(unary_union([g for _, _, g in mahalle_geom.values()]))
for _p in (list(_artik.geoms) if hasattr(_artik, "geoms") else [_artik]):
    if _p.is_empty or _p.area < 1.0:
        continue
    _sahip = max(mahalle_geom,
                 key=lambda k: mahalle_geom[k][2].buffer(2)
                 .intersection(_p.buffer(2)).area)
    _ad, _n, _g = mahalle_geom[_sahip]
    _b = unary_union([_g, _p.buffer(0.5)])
    if _b.geom_type == "MultiPolygon":
        _b = max(_b.geoms, key=lambda g: g.area)
    mahalle_geom[_sahip] = (_ad, _n, _b)

# Etiket noktası: yerleşimin kendisi. Coğrafi ağırlık merkezi boş kırsala
# düşüyor, insanın olduğu yer daha okunur.
MAHALLELER = [(mid, ad, n) for mid, (ad, n, _) in mahalle_geom.items()]

_toplam = sum(g.area for _, _, g in mahalle_geom.values())
for _mid, (_ad, _, _g) in mahalle_geom.items():
    print(f"  {_ad:20s} {_g.area / 1e6:6.1f} km²")
assert abs(_toplam - ada.area) / ada.area < 0.004, \
    f"mahalleler adayı kaplamıyor: {_toplam / 1e6:.1f} / {ada.area / 1e6:.1f} km²"


# ---------------------------------------------------------------- binalar
def dikdortgen(cx, cy, w, h, aci_derece=0.0):
    a = math.radians(aci_derece)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        pts.append((cx + dx * ca - dy * sa, cy + dx * sa + dy * ca))
    return Polygon(pts)


def daire(cx, cy, r, n=24):
    return Polygon([(cx + r * math.cos(2 * math.pi * i / n),
                     cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)])


def elips(cx, cy, rx, ry, aci_derece=0.0, n=36):
    a = math.radians(aci_derece)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return Polygon(pts)


def kiyi_yaricapi(derece):
    return kiyi_r(math.radians(derece))


def _hat_seyrelt(noktalar, adim):
    """Hattı yaklaşık `adim` m aralıklı noktalara indirger (son nokta korunur)."""
    hat = LineString(noktalar)
    n = max(int(hat.length // adim), 1)
    return [hat.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]


def kara(derece, oran):
    """Verilen yönde, kıyı yarıçapının `oran` katında bir kara noktası.
    oran 1'e yaklaştıkça kıyıya, 0'a yaklaştıkça iç kesime gider."""
    th = math.radians(derece)
    r = kiyi_yaricapi(derece) * oran
    return (r * math.cos(th), r * math.sin(th))


binalar = []


def bina(bid, ad, geom, yukseklik, tur, mahalle, wiki_id=None, kat=None,
         taban=None):
    """Yapıyı kaydeder.

    `wiki_id` VERİLMEZSE yapının wiki maddesi yok demektir (null). Eskiden
    kimliğin kendisi wikiId olarak yazılıyordu; o yüzden haritada bir
    apartmana tıklayınca var olmayan bir maddeye gidiliyor, hiçbir şey
    açılmıyordu. Kemal'in 16 Eylül kararı (H8): madde alacak yapı açıkça
    işaretlenir, geri kalanı bilerek bağlantısızdır.

    `taban`, yapının oturduğu arazi kotu — verilmezse
    ağırlık merkezindeki rakımdan örneklenir. Prizma bu kottan yükselir,
    böylece yamaçtaki yapı havada durmuyor."""
    if not ada.contains(geom):
        raise SystemExit(f"HATA: {ad} denizde veya kıyıyı aşıyor")
    if taban is None:
        c = geom.centroid
        taban = float(yukselti(c.x, c.y))
    binalar.append({
        "id": bid, "ad": ad, "geom": geom, "yukseklik": yukseklik,
        "tur": tur, "mahalle": mahalle, "wikiId": wiki_id, "kat": kat,
        "taban": round(taban, 1),
    })


# --------------------------------------------------------------------------
# The Imperial Kemsköy yerleşkesi
#
# Kaynaklar: Kemal'in otel programı dokümanı (Drive → Haydarpaşa) ve
# Canva'daki izometrik diorama. İkisi de birebir alınmadı, biçim verdi.
#
# Ana bina Haydarpaşa Garı'nın yerleşimini izler: denize bakan yüz KAPALI
# ve görkemli cephedir, iki kule o cephenin köşelerinde durur. U'nun açık
# ağzı karaya bakar, avlu içeride kalır. Kanatlar denize değil, karaya
# doğru uzanır.
#
# Otel 20 odalıdır; spa/havuz gibi büyük ek yapı yoktur.
# --------------------------------------------------------------------------

# Otel koyun İÇİNDE değil, koyun güney kolunu oluşturan Güney Burnu'nun
# üstündedir — ve uçurumun ta kenarındadır.
#
# Önceki sürümde yerleşke kıyıdan 236 metre içerideydi: haritada denizle
# ilgisi olmayan bir yapı gibi duruyordu. Otelin bütün fikri koyu tepeden
# izlemek; o yüzden teras uçurum alnından 20 metre geride duruyor ve
# sahile tek bir merdivenle iniliyor.

_UCURUM_ACI = 211.0        # uçurum alnının kıyı üzerindeki açısı
_KIYIDAN_GERI = 74.0       # yerleşke merkezinin alından geri çekilmesi (m)

_th_ucurum = math.radians(_UCURUM_ACI)
_alin_r = kiyi_r(_th_ucurum)
UCURUM_ALNI = (_alin_r * math.cos(_th_ucurum), _alin_r * math.sin(_th_ucurum))

# Cephe koyun suyuna döner
_KOY_YON = 208.0                      # koyun ekseni
_koy_su_r = kiyi_r(math.radians(_KOY_YON)) + 300.0
_koy_x = _koy_su_r * math.cos(math.radians(_KOY_YON))
_koy_y = _koy_su_r * math.sin(math.radians(_KOY_YON))
OTEL_YON = math.degrees(math.atan2(_koy_y - UCURUM_ALNI[1],
                                   _koy_x - UCURUM_ALNI[0]))

# Merkez, alından cephe yönünün TERSİNE (karaya doğru) geri çekiliyor
ox = UCURUM_ALNI[0] - math.cos(math.radians(OTEL_YON)) * _KIYIDAN_GERI
oy = UCURUM_ALNI[1] - math.sin(math.radians(OTEL_YON)) * _KIYIDAN_GERI
OTEL_MERKEZ = (ox, oy)

# Cephe yönünde kıyıya kaç metre var? Teras, merdiven ve iskele buna göre
# yerleşiyor — otelin kendi uçurumu bu doğrultuda.
_ileri0 = (math.cos(math.radians(OTEL_YON)), math.sin(math.radians(OTEL_YON)))
ON_KIYI = 0.0
for _adim in range(10, 1200, 2):
    if not ada.contains(Point(ox + _ileri0[0] * _adim, oy + _ileri0[1] * _adim)):
        ON_KIYI = float(_adim)
        break

# Terasın ön kenarı bu kadar ileride duracak (aşağıda kullanılıyor)
TERAS_ON = ON_KIYI - 20.0
_otel_kot = float(yukselti(ox, oy))
_alin_kot = float(yukselti(*UCURUM_ALNI))

print(f"\nOtel yerleşimi (Güney Burnu uçurumu):")
print(f"  Otel merkezi     : ({ox:.0f}, {oy:.0f})")
print(f"  Cephe yönü       : {OTEL_YON:.0f}°  (koya bakıyor)")
print(f"  Uçurum alnı      : {ON_KIYI:.0f} m ileride, teras alından "
      f"{ON_KIYI - TERAS_ON:.0f} m geride")
print(f"  Sahanlık kotu    : {_otel_kot:.0f} m  (alın {_alin_kot:.0f} m)")
print(f"  Koy suyu         : {math.hypot(_koy_x - ox, _koy_y - oy):.0f} m ileride")
if not (40 <= _otel_kot <= 80):
    raise SystemExit(f"HATA: otel kotu beklenen aralıkta değil ({_otel_kot:.0f} m)")
if not (55 <= ON_KIYI <= 110):
    raise SystemExit(f"HATA: otel uçurumdan uzaklaştı ({ON_KIYI:.0f} m)")

# --- otelin sahanlığı ---
# Yerleşke eğimli bir yamaçta duruyor; bina, teras ve bahçe araziye
# giydirilince eğri duruyordu. Gerçekte de böyle bir otel kaz-doldur ile
# düzlenmiş bir sahanlığa oturur; arazi modelinde o sahanlığı biz
# açıyoruz (gen/dem.py okuyor). Sahanlık uçurum alnında bitiyor: eteği
# denize taşmasın diye ön sınır TERAS_ON.
OTEL_SAHANLIK = {
    "x": ox, "y": oy, "yon": OTEL_YON,
    "ileri_min": -88.0, "ileri_max": TERAS_ON + 4.0, "yan_yari": 52.0,
    "kot": round(_otel_kot, 1), "etek": 46.0,
}

# Kemal oteli Kurucu'da taşıdıysa (2 Ekim: kuleler biri aşağıda biri yukarıda
# kaldı, teras yamaca serildi) sahanlık, teras ve bahçe otelle birlikte
# yeni yerine gider. Binaların kendisi Kurucu'nun yapı düzeniyle taşınıyor;
# burada yalnız altındaki zemin onlara uyduruluyor.
_OTEL_DUZENI = _KURUCU.get("yapiDuzeni", {}).get("bina_imperial")


def _otel_tasi(g):
    """Zemini otelin Kurucu'daki düzeniyle taşır (otel yoksa olduğu gibi)"""
    if not _OTEL_DUZENI:
        return g
    from shapely import affinity
    g = affinity.rotate(g, -_OTEL_DUZENI.get("aci", 0.0), origin=(ox, oy), use_radians=True)
    return affinity.translate(g, _OTEL_DUZENI.get("dx", 0.0),
                              -_OTEL_DUZENI.get("dy", 0.0) * 111320.0 / M_PER_LAT)


if _OTEL_DUZENI:
    _yeni_merkez = _otel_tasi(Point(ox, oy))
    OTEL_SAHANLIK["x"], OTEL_SAHANLIK["y"] = _yeni_merkez.x, _yeni_merkez.y
    OTEL_SAHANLIK["yon"] = OTEL_YON - math.degrees(_OTEL_DUZENI.get("aci", 0.0))
    OTEL_SAHANLIK["kot"] = round(float(yukselti(_yeni_merkez.x, _yeni_merkez.y)), 1)
    print(f"  Sahanlık         : Kurucu'daki otelle taşındı "
          f"({_yeni_merkez.x - ox:+.0f}, {_yeni_merkez.y - oy:+.0f}) m")

# --- seyir terası (7 Ekim) ---
# Kemal: "otelin ön terası aşağıya kayan şekilde, bu doğru değil; gerekirse
# terası incelt, uçurumun kenarında seyir terası gibi görünsün; gerekirse
# altına kaide koy." Otel taşındığı yerde uçurum değil yumuşak bir yamaç
# var; eski geniş teras sahanlığı denize doğru 26 m dolguyla uzatıyordu.
# Artık teras binanın önünde dar bir şerit; sahanlık terasın ön kenarında
# biter ve önü dik bir kaide duvarıyla iner (gen/dem.py → "etek_on").
_S = OTEL_SAHANLIK
_sa = math.radians(_S["yon"])
ON_KIYI_YENI = ON_KIYI
for _adim in range(10, 1200, 2):
    if not ada.contains(Point(_S["x"] + math.cos(_sa) * _adim, _S["y"] + math.sin(_sa) * _adim)):
        ON_KIYI_YENI = float(_adim)
        break
TERAS_ARKA = 30.0                                   # binanın ön yüzü 27 m'de
# Arazi 20 m'lik karelerle çiziliyor ve sahanlık kıyıya 24 m kala alçalmaya
# başlıyor (dem.py); teras o inişin bir kare gerisinde kalmalı ki kaymasın
TERAS_ON_YENI = max(TERAS_ARKA + 6.0, min(TERAS_ARKA + 10.0, ON_KIYI_YENI - 30.0))
OTEL_SAHANLIK["ileri_max"] = ON_KIYI_YENI          # düzlük kıyıya dek; önü uçurum gibi iner
OTEL_SAHANLIK["etek_on"] = 4.0
_on_kot = float(yukselti(_S["x"] + math.cos(_sa) * (TERAS_ON_YENI + 6), _S["y"] + math.sin(_sa) * (TERAS_ON_YENI + 6)))
print(f"  Seyir terası     : {TERAS_ARKA:.0f}–{TERAS_ON_YENI:.0f} m önde; kıyı {ON_KIYI_YENI:.0f} m; "
      f"kaide ~{_S['kot'] - _on_kot:.0f} m")


def _sahanlik_dortgeni(s_):
    """Sahanlığın düz kısmı (çokgen) — evler buraya konmaz"""
    a = math.radians(s_["yon"])
    ix, iy = math.cos(a), math.sin(a)
    k = [(s_["x"] + ix * u - iy * v, s_["y"] + iy * u + ix * v)
         for u, v in ((s_["ileri_min"], -s_["yan_yari"]), (s_["ileri_max"], -s_["yan_yari"]),
                      (s_["ileri_max"], s_["yan_yari"]), (s_["ileri_min"], s_["yan_yari"]))]
    return Polygon(k)


OTEL_YERLESKESI = _sahanlik_dortgeni(OTEL_SAHANLIK)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "otel_sahanlik.json"), "w", encoding="utf-8") as _f:
    json.dump(OTEL_SAHANLIK, _f, ensure_ascii=False, indent=1)

_ort = math.radians(OTEL_YON)
_ileri = (math.cos(_ort), math.sin(_ort))          # denize doğru
_yan = (-math.sin(_ort), math.cos(_ort))           # kıyıya paralel


def yerleske(ileri_m, yan_m):
    """Otel merkezine göre yerel koordinat: ileri = denize doğru."""
    return (ox + _ileri[0] * ileri_m + _yan[0] * yan_m,
            oy + _ileri[1] * ileri_m + _yan[1] * yan_m)


def yerlesim_dikdortgen(ileri_m, yan_m, uzunluk, genislik, ek_aci=0.0):
    """Yerleşke eksenine hizalı dikdörtgen (uzunluk = denize doğru derinlik)."""
    cx, cy = yerleske(ileri_m, yan_m)
    return dikdortgen(cx, cy, uzunluk, genislik, OTEL_YON + ek_aci)


# --- ana bina: denize bakan kapalı cephe + karaya uzanan iki kanat ---
# Kanatlar ön bloğa birkaç metre bindiriliyor: tam bitişik dikdörtgenler
# döndürüldükten sonra kayan noktada aynı kenarı paylaşmıyor ve birleşme
# yerine iki ayrı parça çıkıyor.
_on = yerlesim_dikdortgen(16, 0, 22, 66)             # denize bakan ana cephe
_kanat_sol = yerlesim_dikdortgen(-10, -24, 34, 18)   # karaya uzanan sol kanat
_kanat_sag = yerlesim_dikdortgen(-10, 24, 34, 18)    # karaya uzanan sağ kanat
otel = unary_union([_on, _kanat_sol, _kanat_sag])
if isinstance(otel, MultiPolygon):
    raise SystemExit("HATA: ana bina tek parça olmadı")
bina("bina_imperial", "The Imperial Kemsköy", otel, 19, "otel", "yer_iskele",
     wiki_id="kemskoy_hotel", kat=4)

# --- kuleler: denize bakan cephenin iki köşesinde ---
for _yan_isaret, _kid, _kad in ((-1, "bati", "Batı Kulesi"), (1, "dogu", "Doğu Kulesi")):
    _kx, _ky = yerleske(24, _yan_isaret * 28)
    bina(f"bina_imperial_kule_{_kid}", _kad, daire(_kx, _ky, 7), 30,
         "kule", "yer_iskele", wiki_id="kemskoy_hotel")

# Restoran, bar, meyhane ve kafe haritada ayrı yapı olarak durmuyor:
# hepsi otelin kendi içindeki mekânlar. Wiki'de otelin altında yaşıyorlar,
# harita yalnızca ana binayı, terası ve suya inen merdiveni gösteriyor.

# --- teras ve bahçe: bina değil, zemin öğeleri ---
zemin = []

# taş korkuluklu seyir terası — binanın önünde dar şerit, kaidenin üstünde
_TERAS_EN = 70.0
zemin.append({
    "id": "zemin_teras", "ad": "Otel Terası", "tur": "teras",
    "geom": yerlesim_dikdortgen((TERAS_ARKA + TERAS_ON_YENI) / 2, 0, TERAS_ON_YENI - TERAS_ARKA, _TERAS_EN),
})

# otel bahçesi — arkada, ağaçlıklı
zemin.append({
    "id": "zemin_bahce", "ad": "Otel Bahçesi", "tur": "bahçe",
    "geom": yerlesim_dikdortgen(-56, 6, 40, 92),
})

# Kemal'in Kurucu'da çizdiği yollar (7 Ekim: "otel bahçesinin altından hâlâ
# yol geçiyor"). Otel taşınınca bahçe yolların üstüne gelmişti; bahçe ve
# teras artık bu yolların bir buçuk metre gerisinde biter.
_kur_yol_alani = unary_union([
    LineString([_dm(q) for q in _y["n"]]).buffer({"ana": 4.5, "patika": 1.2}.get(_y["tur"], 3.0) + 1.5)
    for _y in _KURUCU.get("yollar", []) if len(_y.get("n", [])) >= 2
])

for z in zemin:
    if _OTEL_DUZENI:
        # otelle birlikte taşınır; uçurumun ötesine taşan kısmı kırpılır
        _g = _otel_tasi(z["geom"]).intersection(ada.buffer(-6))
        z["geom"] = max(_parcala(_g) if _g.geom_type != "Polygon" else [_g], key=lambda p: p.area)
    if not _kur_yol_alani.is_empty and z["geom"].intersects(_kur_yol_alani):
        _once = z["geom"].area
        _g = z["geom"].difference(_kur_yol_alani)
        z["geom"] = max(_parcala(_g), key=lambda p: p.area)
        print(f"  {z['ad']:<16} : yollardan geri çekildi ({_once:.0f} → {z['geom'].area:.0f} m²)")
    if not ada.contains(z["geom"]):
        raise SystemExit(f"HATA: {z['ad']} karada değil")
    _c = z["geom"].centroid
    z["taban"] = round(float(yukselti(_c.x, _c.y)), 1)


# --- merdiven ve iskele ---------------------------------------------------
#
# Sahile tek bir merdivenle iniliyor. Uçurum ~59 metre; merdiven alnı
# dikine inemeyeceği için kaya yüzünde zikzak çiziyor ve kıyıya alnın
# yaklaşık 80 metre yanından varıyor.
#
# İskele kıyıdan denize DİK uzanıyor (yerleşkenin eksenine değil — kıyı
# çizgisinin kendi normaline) ve ucunda enine bir baş var: T biçimi.

_kiyi_hatti = ada.exterior
_alin_s = _kiyi_hatti.project(Point(*UCURUM_ALNI))
_AYAK_KAYMA = 80.0                      # merdiven ayağı alından bu kadar yanda


def _kiyi_noktasi_s(s_degeri):
    n = _kiyi_hatti.interpolate(s_degeri % _kiyi_hatti.length)
    return (n.x, n.y)


MERDIVEN_AYAGI = _kiyi_noktasi_s(_alin_s + _AYAK_KAYMA)

# Kıyı teğeti ve dışa (denize) bakan normali
_t1 = _kiyi_noktasi_s(_alin_s + _AYAK_KAYMA - 45.0)
_t2 = _kiyi_noktasi_s(_alin_s + _AYAK_KAYMA + 45.0)
_tx, _ty = _t2[0] - _t1[0], _t2[1] - _t1[1]
_tn = math.hypot(_tx, _ty)
_tx, _ty = _tx / _tn, _ty / _tn
_nx, _ny = -_ty, _tx                      # teğetin dikeyi
# Hangi taraf deniz?
if ada.contains(Point(MERDIVEN_AYAGI[0] + _nx * 25, MERDIVEN_AYAGI[1] + _ny * 25)):
    _nx, _ny = -_nx, -_ny
KIYI_NORMALI = (_nx, _ny)


def _iskele_noktasi(disari, yan):
    """İskele yerel koordinatı: disari = denize doğru, yan = kıyıya paralel."""
    return (MERDIVEN_AYAGI[0] + _nx * disari + _tx * yan,
            MERDIVEN_AYAGI[1] + _ny * disari + _ty * yan)


# Tahta iskele ve kum cebi (8 Ekim, Kemal'in görseli: Galeri → The Imperial
# Kemskoy): merdivenin dibinde küçük bir kum cebi, oradan denize uzanan dar
# tahta iskele. Eskiden 58 m'lik beton T iskeleydi.
ISKELE_BOY = 26.0       # denize uzanma mesafesi
ISKELE_EN = 3.2
ISKELE_YAN = 9.0        # merdiven ayağından kıyı boyunca kayma (merdivenle çakışmasın)

_iskele_aci = math.degrees(math.atan2(_ny, _nx))
_govde_merkez = _iskele_noktasi(ISKELE_BOY / 2 - 4.0, ISKELE_YAN)
_iskele = dikdortgen(_govde_merkez[0], _govde_merkez[1], ISKELE_BOY + 8.0, ISKELE_EN,
                     _iskele_aci)

binalar.append({
    "id": "bina_otel_iskele", "ad": "Otel İskelesi",
    "geom": _iskele,
    "yukseklik": 1.0, "tur": "iskele", "mahalle": "yer_iskele",
    "wikiId": "kemskoy_hotel", "kat": None, "taban": 0.0,
})

# Kum cebi: merdiven ayağında kıyıya yaslanan yarım ay; uçurumun dibi
_KUM_YARI = 34.0        # kıyı boyunca yarı genişlik
_KUM_DERIN = 14.0       # karaya doğru derinlik
_kum = Polygon([_iskele_noktasi(-_KUM_DERIN * math.sqrt(max(0.0, 1 - (y / _KUM_YARI) ** 2)) * 0.98, y)
                for y in [(-1 + 2 * i / 24) * _KUM_YARI for i in range(25)]]
               + [_iskele_noktasi(4.0, _KUM_YARI), _iskele_noktasi(4.0, -_KUM_YARI)])
_kum = _kum.buffer(0).intersection(ada.buffer(2.0))
if not _kum.is_empty:
    zemin.append({"id": "zemin_otel_kum", "ad": "", "tur": "kumsal", "geom": _kum})

# Merdiven: teras ucundan uçurum yüzünde zikzak inip iskelenin başına varır.
_mer_bas = yerleske(TERAS_ON - 2, 10)
_dx, _dy = MERDIVEN_AYAGI[0] - _mer_bas[0], MERDIVEN_AYAGI[1] - _mer_bas[1]
_yan_bir = (-_dy / math.hypot(_dx, _dy), _dx / math.hypot(_dx, _dy))
merdiven_noktalari = [
    (_mer_bas[0] + _dx * t + _yan_bir[0] * g,
     _mer_bas[1] + _dy * t + _yan_bir[1] * g)
    for t, g in ((0.0, 0.0), (0.18, -26.0), (0.40, 18.0),
                 (0.62, -14.0), (0.84, 8.0), (1.0, 0.0))
]

_merdiven_boy = sum(
    math.hypot(merdiven_noktalari[i + 1][0] - merdiven_noktalari[i][0],
               merdiven_noktalari[i + 1][1] - merdiven_noktalari[i][1])
    for i in range(len(merdiven_noktalari) - 1))
print(f"  Merdiven         : {_merdiven_boy:.0f} m yolla {_otel_kot:.0f} m iniş "
      f"(~%{_otel_kot / _merdiven_boy * 100:.0f})")
print(f"  İskele           : tahta, {ISKELE_BOY:.0f} m; kum cebi {_kum.area:.0f} m²")

# Deniz feneri — adanın kuzeybatı ucunda, Liman'ı yukarıdan görür
fx, fy = kara(141, 0.985)
# Boy 30 m (Kemal, 30 Eylül: "deniz feneri çok kısa"; uzun seçildi)
bina("bina_fener", "Deniz Feneri", daire(fx, fy, 7), 30, "fener", "yer_liman",
     wiki_id="viki_mekan_fener")
# Fener bekçisinin evi (Kemal, 28 Eylül): fenerin hemen yanında, karaya doğru
_fe = (fx * 0.994, fy * 0.994)
bina("bina_fener_evi", "Fener Evi", dikdortgen(_fe[0], _fe[1], 11, 8,
     math.degrees(math.atan2(fy, fx))), 5, "yapı", "yer_liman", kat=1)

# Dirlik Stadı — küçük bir ilçe statı (Kemal, 2 Ekim: "küçük bir belde
# veya ilçe stadı olmalıydı"; kanon: iki tribün, en fazla ~1.000 kişi).
# Çim saha, çevresinde beton zemin; batıda kapalı ana tribün, doğuda açık
# tribün, köşede soyunma binası, dört ışık direği. Yeri ve yönü Kemal'in
# Kurucu'da eski statı taşıdığı yer (yapı düzeni bu parçalara işlendi).
_STAD = {"merkez": (4750.0, 3150.0), "aci": 15.0}
_sd = _KURUCU.get("yapiDuzeni", {}).get("bina_stad")
if _sd:
    _yeni = _kurucu_tasi(Point(*_STAD["merkez"]).buffer(1), _sd).centroid
    _STAD = {"merkez": (_yeni.x, _yeni.y), "aci": _STAD["aci"] - math.degrees(_sd.get("aci", 0.0))}


def _stad_parca(u, v, uzun, en):
    a = math.radians(_STAD["aci"])
    cx = _STAD["merkez"][0] + u * math.cos(a) - v * math.sin(a)
    cy = _STAD["merkez"][1] + u * math.sin(a) + v * math.cos(a)
    return dikdortgen(cx, cy, uzun, en, _STAD["aci"])


# Statın kaidesi (2 Ekim gece, Kemal: "altında bir kaide olması lazım ki
# stat tek durabilsin"): otelin sahanlığı gibi düzlenmiş bir seki;
# gen/dem.py araziyi bu dikdörtgende statın kotuna düzler, eteği yamaca
# yumuşak iner.
DUZLUKLER = [{"ad": "Dirlik Stadı", "x": _STAD["merkez"][0], "y": _STAD["merkez"][1],
              "yon": _STAD["aci"], "ileri_min": -66.0, "ileri_max": 66.0, "yan_yari": 50.0,
              "kot": round(float(yukselti(*_STAD["merkez"])), 1), "etek": 35.0}]
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "duzlukler.json"), "w", encoding="utf-8") as _f:
    json.dump(DUZLUKLER, _f, ensure_ascii=False, indent=1)
print(f"Stat kaidesi   : {DUZLUKLER[0]['kot']:.0f} m kotunda, 132x100 m")

STAD_ZEMIN = [("stad_cevre", "teras", _stad_parca(0, 0, 124, 92)),
              ("stad_saha", "saha", _stad_parca(0, 0, 100, 64))]
for _zid, _ztur, _zg in STAD_ZEMIN:
    zemin.append({"id": _zid, "ad": "", "tur": _ztur, "geom": _zg})
bina("bina_stad_tribun", "Dirlik Stadı", _stad_parca(0, -40.5, 72, 9), 7.5, "stadyum",
     "yer_stadyum", wiki_id="viki_mekan_dirlik_stadi")
bina("bina_stad_cati", "Dirlik Stadı · ana tribün", _stad_parca(0, -44.0, 72, 3), 9.5,
     "stadyum", "yer_stadyum")
bina("bina_stad_acik", "Dirlik Stadı · açık tribün", _stad_parca(0, 38.5, 54, 7), 4.2,
     "stadyum", "yer_stadyum")
# Soyunma ışık direğine biniyordu (7 Ekim çakışma denetimi); biraz içeride
bina("bina_stad_soyunma", "Dirlik Stadı · soyunma", _stad_parca(-46, -34, 16, 8), 4.4,
     "yapı", "yer_stadyum", kat=1)
for _i, (_u, _v) in enumerate(((-55, -41), (55, -41), (-55, 41), (55, 41)), 1):
    bina(f"bina_stad_isik_{_i}", "Işık direği", _stad_parca(_u, _v, 1.2, 1.2), 20,
         "direk", "yer_stadyum")

# Küçükçetmi Sürek Kulübü — çiftlik yerleşkesi
bina("bina_surek", "Küçükçetmi Sürek Kulübü", dikdortgen(6320, -2320, 54, 26, -8),
     9, "kulüp", "yer_ciftlik", wiki_id="mekan_kucukcetmi")

# Kooperatifin zeytinyağı fabrikası (Kemal, 28 Eylül): 1950–70'ler, modern
# ve küçük çaplı; adı yok, tür adıyla duruyor.
bina("bina_zeytinyagi", "Zeytinyağı Fabrikası", dikdortgen(6560, -2560, 40, 20, 24),
     8, "yapı", "yer_ciftlik", kat=1)

# Merkez Mahallesi — kamu binaları ve iki ev
# Son sütun: wiki maddesi. Belediye, Okul ve Pazar madde alacak (H8);
# apartmanlar bilerek bağlantısız — adaya doku katıyorlar, anlatacak
# hikâyeleri yok.
merkez_yapilar = [
    ("bina_belediye", "Belediye Binası", (-100, 220), 44, 24, 12, 3, "viki_mekan_belediye"),
    ("bina_okul", "Düzada İlkokulu", (220, -50), 52, 20, 9, 2, "mekan_okul"),
    ("bina_pazar", "Merkez Pazarı", (-260, -140), 36, 30, 7, 1, "mekan_pazar"),
    # Kemal (28 Eylül): Merkez'de apartman yok; ikisi dükkânlı / müstakil ev.
    # Adlar tür adı; eski geçici adlar (Çarşı / Zeytinli Apartmanı) kalktı.
    ("bina_apt1", "Dükkânlı Ev", (120, 270), 14, 12, 7, 2, None),
    ("bina_apt2", "Müstakil Ev", (-200, 50), 12, 11, 6, 2, None),
]
# Yerleri yeni Merkez kurulurken, kavşağın çevresinde seçilir (8 Ekim);
# buradaki konum sütunu yalnız eski köyün düzeniydi, kullanılmıyor.

# Kemsköy Caddesi boyunca sıra yapılar (İskele Mahallesi).
# Cadde koyun kuzey kıyısını izler; otel koyun karşı kolunda kalır.
#
# Eskiden iki nokta arasında cetvelle çekilmiş bir çizgiydi. Artık kıyıdan
# sabit bir mesafe içeride, kıyının kıvrımını izliyor — bir liman caddesi
# denize paralel akar (Kemal: "liman caddesi aşağıda düz, arka sokaklar
# yamaçta yukarı tırmanır").
from shapely.ops import substring as _substring

cadde_baslangic = kara(199, 0.86)
cadde_bitis = kara(206, 0.80)
KEMSKOY_ICERI = 85.0       # caddenin kıyıdan uzaklığı (m)


def _kiyi_paralel(bas, bit, iceri):
    """Kıyıdan `iceri` m içeride, iki noktanın izdüşümleri arasındaki kısa yay."""
    halka = LineString(ada.buffer(-iceri).exterior.coords)
    L = halka.length
    a, b = halka.project(Point(*bas)), halka.project(Point(*bit))
    ters = a > b
    if ters:
        a, b = b, a
    if b - a <= L / 2:
        parca = list(_substring(halka, a, b).coords)
    else:
        parca = list(_substring(halka, b, L).coords) + list(_substring(halka, 0, a).coords)[1:]
        ters = not ters
    return parca[::-1] if ters else parca


KEMSKOY_HATTI = LineString(_hat_seyrelt(
    _kiyi_paralel(cadde_baslangic, cadde_bitis, KEMSKOY_ICERI), 25.0))
cadde_baslangic = KEMSKOY_HATTI.coords[0]
cadde_bitis = KEMSKOY_HATTI.coords[-1]

for i in range(7):
    t = (i + 0.5) / 7
    _p = KEMSKOY_HATTI.interpolate(t, normalized=True)
    _q = KEMSKOY_HATTI.interpolate(min(t + 0.02, 1.0), normalized=True)
    cx, cy = _p.x, _p.y
    aci = math.degrees(math.atan2(_q.y - cy, _q.x - cx))
    # caddenin iki yanı
    for yan, isim in ((90, "kuzey"), (-90, "güney")):
        # DİKKAT: ox/oy modül düzeyinde otelin merkezidir — burada gölgelenmemeli.
        kx = 26 * math.cos(math.radians(aci + yan))
        ky = 26 * math.sin(math.radians(aci + yan))
        bina(f"bina_kemskoy_{i}_{isim}", f"Kemsköy Caddesi No. {i * 2 + (1 if isim == 'kuzey' else 2)}",
             dikdortgen(cx + kx, cy + ky, 20, 14, aci), 5 + (i % 2) * 3, "yapı",
             "yer_iskele", kat=1 + (i % 2))
# Kemal (28 Eylül): cadde alçak kalsın, 1–2 kat — alt kat dükkân, üstü ev.
# Ada çoğunlukla müstakil evlerden oluşacak; nüfus düşük kalmalı.

# Tarihi Meyhane — otelin yanında, otele ait değil.
# Kemal: "otel ile homojen bir bağı yok ama yıllardır birlikte anılıyorlar."
# Yerleşkenin karaya bakan ucunda, bahçenin gerisinde ayrı bir kütle.
# Kemal (28 Eylül): bina, İskele tarafındaki eski zeytinyağı fabrikası
# (19. yy sonu – 1920'ler; 1950–70'lerde kapandı). Taş, uzun bir kütle.
bina("bina_meyhane", "Sade Meyhane",
     yerlesim_dikdortgen(-150, 96, 34, 17, 18.0), 9, "meyhane", "yer_iskele",
     wiki_id="viki_mekan_meyhane", kat=2)

# Liman Mahallesi — liman yapıları rıhtımda, suyun hemen kıyısında.
# (Eskiden kara(152, 0.88) ile konuyordu; bu nokta denizden ~700 m
# içeride kalıyordu. Kemal: "liman binalarını kıyıya taşı".)
# Rıhtım: kasabanın omurgası olan Sahil Yolu'ndan denize en yakın kıyı.
from shapely.ops import nearest_points as _en_yakin
LIMAN_KASABA = (-4500.0, 2450.0)
_liman_yol = sahil_hat.interpolate(sahil_hat.project(Point(*LIMAN_KASABA)))
_rihtim = _en_yakin(ada.exterior, _liman_yol)[0]
_kiyi_s = ada.exterior.project(_rihtim)
_r0 = ada.exterior.interpolate(_kiyi_s - 30)
_r1 = ada.exterior.interpolate(_kiyi_s + 30)
_rt = math.atan2(_r1.y - _r0.y, _r1.x - _r0.x)       # kıyı boyunca
RIHTIM_ACI = math.degrees(_rt)
_rn = (_liman_yol.x - _rihtim.x, _liman_yol.y - _rihtim.y)
_rn = (_rn[0] / math.hypot(*_rn), _rn[1] / math.hypot(*_rn))  # karaya doğru


def rihtim(boyunca, iceri):
    """Rıhtımdan kıyı boyunca `boyunca`, karaya doğru `iceri` m ötesi."""
    return (_rihtim.x + math.cos(_rt) * boyunca + _rn[0] * iceri,
            _rihtim.y + math.sin(_rt) * boyunca + _rn[1] * iceri)


lx, ly = rihtim(-45, 24)
bina("bina_liman_depo", "Liman Deposu", dikdortgen(lx, ly, 46, 22, RIHTIM_ACI), 8,
     "yapı", "yer_liman", kat=1)
lx2, ly2 = rihtim(20, 30)
bina("bina_liman_ofis", "Liman İdare Binası", dikdortgen(lx2, ly2, 24, 20, RIHTIM_ACI), 11,
     "yapı", "yer_liman", wiki_id="viki_mekan_liman_idare", kat=3)
# Dondurmacı Kızlar: önce otelin iskelesindeydi, Kemal Liman Mahallesine
# taşıdı. Adını 16 Eylül'de koydu.
lx3, ly3 = rihtim(75, 20)
bina("bina_liman_kafe", "Dondurmacı Kızlar", dikdortgen(lx3, ly3, 18, 14, RIHTIM_ACI), 5,
     "kafe", "yer_liman", wiki_id="viki_mekan_liman_kafe", kat=1)

# Liman yapıları: mendirek ve iskele (Kemal, 28 Eylül: "mendirek + iskele",
# Küçükkuyu limanı gibi). Rıhtımın önünde koyu saran bir dalgakıran; kökü
# kıyıda, ağzı öbür uçta açık. Feribot iskelesi rıhtımın ortasından denize uzanır.
_deniz = lambda boyunca, disari: rihtim(boyunca, -disari)
_mendirek_hat = LineString(catmull_rom([
    _deniz(-230, -10), _deniz(-235, 60), _deniz(-200, 150),
    _deniz(-90, 185), _deniz(40, 185), _deniz(120, 160)
], False, 6))
_mendirek = _mendirek_hat.buffer(7, cap_style=1).difference(ada.buffer(-2))
if _mendirek.geom_type == "MultiPolygon":
    _mendirek = max(_mendirek.geoms, key=lambda g: g.area)
binalar.append({
    "id": "bina_liman_mendirek", "ad": "Mendirek", "geom": _mendirek,
    "yukseklik": 3, "tur": "iskele", "mahalle": "yer_liman",
    "wikiId": None, "kat": None, "taban": 0.0,
})
_iskele_l = unary_union([
    LineString([_deniz(0, -8), _deniz(0, 95)]).buffer(6, cap_style=2),
    LineString([_deniz(-22, 95), _deniz(22, 95)]).buffer(6, cap_style=2),
])
binalar.append({
    "id": "bina_liman_iskele", "ad": "Liman İskelesi", "geom": _iskele_l,
    "yukseklik": 3, "tur": "iskele", "mahalle": "yer_liman",
    "wikiId": None, "kat": None, "taban": 0.0,
})
# Denetim: iki yapı da suda, birbirine ve kıyıdan ötesine taşmıyor
for _ad, _g in (("Mendirek", _mendirek), ("Liman İskelesi", _iskele_l)):
    _kara = _g.intersection(ada).area / _g.area
    if _kara > 0.15:
        raise SystemExit(f"HATA: {_ad} karaya taşıyor (%{_kara * 100:.0f})")
if _mendirek.distance(_iskele_l) < 25:
    raise SystemExit("HATA: iskele mendireğe çok yakın")

assert (ox, oy) == OTEL_MERKEZ, "ox/oy gölgelendi — yerleske() bozulur"

# Her yapı iddia ettiği mahallenin içinde mi? Sınırlar artık yollara
# oturduğu için eskiden doğru olan bir atama yanlış düşmüş olabilir.
_yanlis = []
for _b in binalar:
    _m = _b["mahalle"]
    if not _m or _b["tur"] == "iskele":
        continue           # iskele bilerek suyun üstünde
    _c = _b["geom"].centroid
    if not mahalle_geom[_m][2].buffer(5).contains(_c):
        _dogru = next((k for k, (_, _, g) in mahalle_geom.items()
                       if g.buffer(5).contains(_c)), "?")
        _yanlis.append(f"{_b['ad']}: {_m} yazıyor, {_dogru} içinde")
if _yanlis:
    raise SystemExit("HATA: mahalle ataması tutmuyor\n  " + "\n  ".join(_yanlis))
print(f"\nBina sayısı    : {len(binalar)}")

# ---------------------------------------------------------------- yollar
#
# Beş kademe, haritada kalınlıkla ayrışıyor:
#
#   ana yol : Sahil Yolu — adayı dolanan kapalı halka, ağın omurgası
#   yol     : Sırt Yolları (düğümden sahile) ve yerleşim bağlantıları
#   cadde   : yerleşimlerin omurgası
#   sokak   : mahalle içi ara sokaklar, numaralı
#   merdiven: yayaya ait, basamaklı
#
# Sokak adları bilerek jenerik: "İskele 3. Sokak". Asıl adları Kemal
# koyacak; o zamana kadar numara duruyor.

YOLLAR = [
    ("yol_sahil", "Sahil Yolu", SAHIL_YOLU + [SAHIL_YOLU[0]], "ana yol", None),
]


def _sahile_kadar(noktalar):
    """Bir hattı Sahil Yolu'nu ilk kestiği yerde bitirir.

    Sırt Yolları kıyıya kadar inmiyor: sahil halkasına bağlanıp orada
    bitiyorlar. Yol ağında kopuk uç kalmasının önüne bu geçiyor."""
    hat = LineString(noktalar)
    kesisim = hat.intersection(sahil_hat)
    if kesisim.is_empty:
        return noktalar
    adaylar = (list(kesisim.geoms) if hasattr(kesisim, "geoms") else [kesisim])
    adaylar = [c for c in adaylar if c.geom_type == "Point"]
    if not adaylar:
        return noktalar
    # hat boyunca en erken kesişim
    kes = min(adaylar, key=lambda c: hat.project(c))
    mesafe = hat.project(kes)
    kirpik = [p for p in noktalar if hat.project(Point(*p)) < mesafe]
    kirpik.append((kes.x, kes.y))
    return kirpik if len(kirpik) > 1 else noktalar


# Dağ kavşağı: iç yolların buluştuğu yer. Su bölümü düğümü 687 metrede,
# oraya çıkan her yol %20'nin üstünde eğim istiyordu; kavşak bu yüzden
# kuzey yamacında, yolun taşıyabileceği bir kotta.
DAG_KAVSAGI = (1250.0, 350.0)
print(f"Dağ kavşağı    : {float(yukselti(*DAG_KAVSAGI)):.0f} m")

# Üç sırtın üstünde gerçekten yol var; sınırın hem sırt hem yol olduğu
# yerler bunlar. Kalan iki sınır yalnızca coğrafi.
#
# Yol sırtın kendisini değil, sırtın indiği kıyı ucunu hedef alıyor ve
# oraya eğimi gözeten bir güzergâhla iniyor: sırtın alt kesiminde zaten
# sırtla çakışıyor, üst kesimde yol dağa tırmanmak yerine kavşağa
# bağlanıyor. Böylece hem sınır yolla okunuyor hem de eğim insanca.
_sirt_yolu_hedefleri = {}
for _sid, _ad, _, _yol_var in SIRTLAR:
    if not _yol_var:
        continue
    _uc = sirt_geom[_sid][-1]
    _yakin = sahil_hat.interpolate(sahil_hat.project(Point(*_uc)))
    _sirt_yolu_hedefleri[_sid] = (_yakin.x, _yakin.y)

_sirt_yollari = yol_guzergahi(DAG_KAVSAGI, list(_sirt_yolu_hedefleri.values()))
for _sid, _ad, _, _yol_var in SIRTLAR:
    if not _yol_var:
        continue
    _hat = _sirt_yollari[_sirt_yolu_hedefleri[_sid]]
    YOLLAR.append((f"yol_{_sid}", _ad.replace(" hattı", " Yolu").replace(
        "sırtı", "Sırt Yolu"), _hat, "yol", None))

YOLLAR += [
    # --- yerleşim omurgaları ---
    ("yol_kemskoy", "Kemsköy Caddesi", list(KEMSKOY_HATTI.coords),
     "cadde", "yer_iskele"),
    ("yol_liman", "Liman Caddesi",
     [kara(155, 0.86), kara(148, 0.80), kara(142, 0.72)], "cadde", "yer_liman"),

    # --- bağlantılar ---
    # Otel Yolu ve yerleşim bağlantıları aşağıda, _kivrimli tanımlandıktan
    # sonra ekleniyor.
    ("yol_merdiven", "Sahil Merdiveni", merdiven_noktalari, "merdiven",
     "yer_iskele"),
]


# --- yerleşim sokakları ---------------------------------------------------
#
# Sokaklar adanın tamamına serpilmiyor: her yerleşimin çevresinde kendi
# dokusunu kuruyorlar, aradaki kırsal boş kalıyor. Gerçek bir ada haritası
# böyle okunur — yol ağı nerede sıklaşıyorsa orada insan yaşıyor.
#
# Adlar bilerek numaralı: "İskele 3. Sokak". Asıl adları Kemal koyacak.


def _hat_kirp(noktalar, alan):
    """Bir hattı verilen alanın içinde kalan EN UZUN parçasına indirger.

    Nokta nokta eleyip kalanları birleştirmek olmuyordu: aradan düşen
    noktalar yüzünden hat uzak iki ucu birleştiren keskin köşeler
    yapıyordu. Doğrusu geometrik kesişim almak."""
    if len(noktalar) < 2:
        return None
    kesisim = LineString(noktalar).intersection(alan)
    if kesisim.is_empty:
        return None
    parcalar = (list(kesisim.geoms)
                if kesisim.geom_type == "MultiLineString" else [kesisim])
    parcalar = [p for p in parcalar if p.geom_type == "LineString"]
    if not parcalar:
        return None
    en_uzun = max(parcalar, key=lambda p: p.length)
    if en_uzun.length < 140:
        return None
    return [(x, y) for x, y in en_uzun.coords]


def _kivrimli(p0, p1, salinim, n=10):
    """İki nokta arasında hafif kıvrımlı hat — cetvel çizgisi olmasın."""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    boy = math.hypot(dx, dy)
    if boy < 1:
        return [p0, p1]
    nx, ny = -dy / boy, dx / boy
    return [(x0 + dx * (i / n) + nx * salinim * math.sin(math.pi * i / n),
             y0 + dy * (i / n) + ny * salinim * math.sin(math.pi * i / n))
            for i in range(n + 1)]


# --- yardımcılar: eğri, eğim, eşyükselti omurgası --------------------------


def _chaikin(noktalar, tur=3):
    """Köşe kesme: kırık hattı yumuşak eğriye çevirir, uçları korur."""
    for _ in range(tur):
        yeni = [noktalar[0]]
        for (x0, y0), (x1, y1) in zip(noktalar, noktalar[1:]):
            yeni += [(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1),
                     (0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)]
        yeni.append(noktalar[-1])
        noktalar = yeni
    return noktalar


def _egim_yonu(x, y, h=12.0):
    gx = (yukselti(x + h, y) - yukselti(x - h, y)) / (2 * h)
    gy = (yukselti(x, y + h) - yukselti(x, y - h)) / (2 * h)
    n = math.hypot(gx, gy)
    return (gx / n, gy / n, n) if n > 1e-6 else (0.0, 0.0, 0.0)


def _esyukselti_omurga(merkez, yarim_boy, adim=20.0):
    """Merkezden iki yöne, eğime dik yürüyerek yatay bir omurga çizer."""
    uclar = []
    for yon in (1, -1):
        x, y = merkez
        hat = []
        for _ in range(int(yarim_boy // adim)):
            ux, uy, e = _egim_yonu(x, y)
            if e == 0.0:
                break
            x, y = x - yon * uy * adim, y + yon * ux * adim
            if not ada.buffer(-80).contains(Point(x, y)):
                break
            hat.append((x, y))
        uclar.append(hat)
    return uclar[1][::-1] + [merkez] + uclar[0]


# --- Ege adası dokusu (Bozcaada / Cunda tarzı) ------------------------------
#
# Kemal (29 Eylül gece): "Bu yol ağları gerçeklikten çok uzak ... Bozcaada
# ve Cunda gibi olsun." Eski doku iki türlüydü: meydandan dışarı dağılan
# kollar (örümcek ağı) ve tuğla gibi kaydırılmış kısa ara sokaklar (çizgi
# yığını). İkisi de kalktı.
#
# Bozcaada ve Cunda'da doku şöyle okunur:
#   - bir omurga (kıyıdaki cadde ya da yamacı yatay kesen ana sokak);
#   - ona paralel, yamacı eşyükselti boyunca izleyen sokak sıraları
#     (40–60 m arayla, hafif kıvrımlı);
#   - bu sıraları dik kesen ara sokaklar — rastgele değil, aşağı yukarı
#     aynı hizada devam eden "sütunlar"; yer yer bir ada birleşir;
#   - ortada limana / meydana inen kesintisiz bir çarşı sokağı;
#   - dik yerde ara sokak merdivene döner;
#   - kenarlara doğru doku seyrelir, eliptik bir leke olarak biter.
# Hesap omurgaya göre yapılır: s = omurga boyunca, d = içeri doğru.
# Adlar numaralı ve geçici ("İskele 3. Sokak"); asıl adları Kemal koyacak.

def _ege_dokusu(mid, kok, omurga, merkez, yari_boy, kara_derinlik,
                deniz_derinlik, sira_arasi, ada_boyu, duzensizlik,
                omurgayi_ekle=False, tutma=0.9):
    import random as _random
    rnd = _random.Random(mid + "-ege")
    alan = mahalle_geom[mid][2].buffer(40).intersection(ada.buffer(-30))
    L = omurga.length
    s_m = omurga.project(Point(*merkez))
    kiyi = ada.exterior
    ic = 1

    def nokta(s, d):
        sa = min(max(s, 0.0), L)
        p = omurga.interpolate(sa)
        q0 = omurga.interpolate(max(sa - 40, 0.0))
        q1 = omurga.interpolate(min(sa + 40, L))
        tx, ty = q1.x - q0.x, q1.y - q0.y
        n = math.hypot(tx, ty) or 1.0
        tx, ty = tx / n, ty / n
        nx, ny = -ty * ic, tx * ic
        fazla = s - sa
        return (p.x + tx * fazla + nx * d, p.y + ty * fazla + ny * d)

    # içerisi hangi yan: kıyıdan uzaklaşan
    a = nokta(s_m, 150.0)
    ic = -1
    b = nokta(s_m, 150.0)
    ic = 1 if kiyi.distance(Point(*a)) > kiyi.distance(Point(*b)) else -1

    engel = unary_union([b_["geom"].buffer(4) for b_ in binalar])
    yollar = []           # (hat, tur)

    def ekle(hat, tur=None, en_kisa=35):
        if len(hat) < 2:
            return
        kes = LineString(hat).intersection(alan).difference(engel)
        if kes.is_empty:
            return
        parcalar = (list(kes.geoms) if hasattr(kes, "geoms") else [kes])
        for hl in parcalar:
            if hl.geom_type != "LineString" or hl.length < en_kisa:
                continue
            h = [(x, y) for x, y in hl.coords]
            t = tur
            if t is None:
                dz = abs(float(yukselti(*h[-1])) - float(yukselti(*h[0])))
                t = "merdiven" if dz / max(hl.length, 1) > 0.18 else "sokak"
            yollar.append((h, t))

    def derinlik(d):
        return kara_derinlik if d >= 0 else deniz_derinlik

    def genislik(d):
        """Bu içerilikte doku omurga boyunca ne kadar uzanıyor (elips)."""
        oran = min(abs(d) / max(derinlik(d), 1.0), 1.0)
        return yari_boy * max(0.0, 1.0 - oran ** 2) ** 0.6

    # --- sıralar: omurgaya paralel sokaklar
    siralar = [{"d": 0.0, "s0": s_m - yari_boy, "s1": s_m + yari_boy,
                "faz": 0.0, "omurga": True}]
    for yon in (1, -1):
        d = 0.0
        while True:
            d += sira_arasi * rnd.uniform(0.88, 1.12)
            if d > derinlik(yon) * 0.97:
                break
            w = genislik(yon * d)
            if w < ada_boyu * 1.2:
                break
            siralar.append({"d": yon * d,
                            "s0": s_m - w * rnd.uniform(0.85, 1.05),
                            "s1": s_m + w * rnd.uniform(0.85, 1.05),
                            "faz": rnd.uniform(0, 6.28), "omurga": False})
    siralar.sort(key=lambda r: r["d"])

    def sira_d(r, s):
        if r["omurga"]:
            return 0.0
        return r["d"] + 3.5 * duzensizlik * math.sin(s / 85.0 + r["faz"])

    for r in siralar:
        if r["omurga"] and not omurgayi_ekle:
            continue
        s, hat = r["s0"], []
        while s <= r["s1"]:
            hat.append(nokta(s, sira_d(r, s)))
            s += 20.0
        ekle(hat, "sokak")

    # --- sütunlar: sıraları dik kesen ara sokaklar, aynı hizada devam eder
    sutunlar = [s_m]
    for yon in (1, -1):
        s = s_m
        while abs(s - s_m) < yari_boy * 1.05:
            s += yon * ada_boyu * rnd.uniform(0.85, 1.15)
            sutunlar.append(s)
    sutunlar.sort()
    kayma = {s0: 0.0 for s0 in sutunlar}
    for alt, ust in zip(siralar, siralar[1:]):
        for s0 in sutunlar:
            kayma[s0] += rnd.uniform(-1, 1) * 5.0 * duzensizlik
            s = s0 + kayma[s0]
            if not (max(alt["s0"], ust["s0"]) + 8 < s < min(alt["s1"], ust["s1"]) - 8):
                continue
            carsi = s0 == s_m
            if not carsi and rnd.random() > tutma:
                continue                      # iki ada birleşir
            p0 = nokta(s, sira_d(alt, s))
            p1 = nokta(s + rnd.uniform(-3, 3) * duzensizlik, sira_d(ust, s))
            ekle([p0, p1])

    # --- dışta seyrek uzantılar: son sıradan tarlaya çıkan kısa sokaklar
    dis = siralar[-1]
    for _ in range(rnd.randint(2, 4)):
        s = rnd.uniform(dis["s0"] + 20, dis["s1"] - 20)
        d = sira_d(dis, s)
        hat = [nokta(s, d)]
        kay = rnd.uniform(-0.25, 0.25)
        for _k in range(rnd.randint(4, 8)):
            d += 25.0
            s += 25.0 * kay
            hat.append(nokta(s, d))
        ekle(_chaikin(hat), "sokak")

    # --- omurgaya bağlı olmayan kopuk parçalar atılır
    bagli = [LineString(omurga.coords)]
    kalan = [LineString(h) for h, _ in yollar]
    turler = {id(k): t for k, (_, t) in zip(kalan, yollar)}
    secilen = []
    degisti = True
    while degisti:
        degisti = False
        for k in kalan[:]:
            if any(k.distance(b_) < 6 for b_ in bagli):
                bagli.append(k)
                secilen.append(k)
                kalan.remove(k)
                degisti = True

    for i, k in enumerate(secilen, 1):
        YOLLAR.append((f"sokak_{mid}_{i}", f"{kok} {i}. Sokak",
                       [(x, y) for x, y in k.coords], turler[id(k)], mid))
    # evler yalnız sokak dokusunun içinde: sokakların 45 m yakını
    DOKU_ALANI[mid] = unary_union([k.buffer(45) for k in secilen]).intersection(alan)
    print(f"{kok:8s} dokusu : {len(siralar)} sıra, {len(sutunlar)} sütun, "
          f"{len(secilen)} sokak ({len(kalan)} kopuk parça atıldı)")


DOKU_ALANI = {}

# İskele — omurga Kemsköy Caddesi; denize doğru yer dar (Bozcaada çarşısı)
_kasaba_merkezi = KEMSKOY_HATTI.interpolate(0.45, normalized=True).coords[0]
_ege_dokusu("yer_iskele", "İskele", KEMSKOY_HATTI, _kasaba_merkezi,
            470.0, 380.0, 55.0, sira_arasi=44.0, ada_boyu=50.0,
            duzensizlik=1.0)

# Liman — omurga Sahil Yolu'nun kasabadan geçen kesimi
_s_liman = sahil_hat.project(Point(-4500.0, 2450.0))
_liman_omurga = _substring(sahil_hat, max(_s_liman - 1100, 0.0),
                           min(_s_liman + 1100, sahil_hat.length))
_ege_dokusu("yer_liman", "Liman", _liman_omurga, LIMAN_KASABA,
            560.0, 400.0, _liman_yol.distance(_rihtim) - 60.0,
            sira_arasi=52.0, ada_boyu=62.0, duzensizlik=0.9)

# Rıhtım boyunca kordon: liman yapılarının kara tarafından geçer
YOLLAR.append(("sokak_yer_liman_kordon", "Liman Kordonu",
               [rihtim(b_, 58 + 6 * math.sin(b_ / 90.0))
                for b_ in range(-260, 281, 30)], "sokak", "yer_liman"))

# İç yerleşim: omurga meydandan geçen eşyükselti hattı (Cunda'nın
# yamacı yatay kesen sokakları gibi); omurganın kendisi de sokak olur.
for _mid, _kok, _mey, _yari, _kara, _deniz, _sira, _ada, _duz, _tut in [
    # Merkez artık dört yol ağzının çevresinde (aşağıda, `_merkez_dokusu`)
    # Stadyum — sonradan büyüyen, daha düzenli ve seyrek
    ("yer_stadyum", "Stadyum", (4550.0, 2950.0),   420.0, 260.0, 260.0, 62.0, 75.0, 0.6, 0.92),
]:
    _omurga = LineString(_esyukselti_omurga(_mey, _yari * 1.1))
    _ege_dokusu(_mid, _kok, _omurga, _mey, _yari, _kara, _deniz,
                sira_arasi=_sira, ada_boyu=_ada, duzensizlik=_duz,
                omurgayi_ekle=True, tutma=_tut)


# --- Çiftlik: toprak yollar ve çiftlik kompleksleri --------------------------
#
# Kemal: "Çiftlik mahallesindeki ev arazileri minimum 3-4 dönümlük arazilere
# kurulan evler olsun, hatta 8-10'a kadar çıkabilir; tek ev değil, belki bir
# kompleks." Kasaba dokusu yok. Eşyükselti boyunca giden bir ana toprak yol
# ve ondan yamaca inen / çıkan kollar; arazi yolların iki yanında. Arazi
# zemin öğesi (zeytinlik) olarak çizilir, içinde ana ev + ahır + depo.

CIFTLIK_MERKEZI = (6280.0, -2330.0)
CIFTLIK_ARAZILERI = []      # (arazi çokgeni, cephe noktası, yol yönü)


def _ciftlik_dokusu():
    import random as _random
    rnd = _random.Random("yer_ciftlik-arazi")
    mid = "yer_ciftlik"
    alan = mahalle_geom[mid][2].buffer(-20).intersection(ada.buffer(-120))
    engel = unary_union([b_["geom"].buffer(30) for b_ in binalar])
    sayac = [0]
    yollar = []

    def ekle(hat):
        hat = _hat_kirp(hat, alan)
        if not hat:
            return None
        kes = LineString(_hat_seyrelt(_chaikin(hat), 20.0)).difference(engel)
        parca = max((list(kes.geoms) if hasattr(kes, "geoms") else [kes]),
                    key=lambda g: g.length if g.geom_type == "LineString" else 0)
        if parca.geom_type != "LineString" or parca.length < 150:
            return None
        h = [(x, y) for x, y in parca.coords]
        sayac[0] += 1
        YOLLAR.append((f"toprak_{mid}_{sayac[0]}", f"Çiftlik {sayac[0]}. Yolu",
                       h, "toprak", mid))
        yollar.append(LineString(h))
        return LineString(h)

    ana = ekle(_esyukselti_omurga(CIFTLIK_MERKEZI, 1500.0, adim=25.0))
    if ana is None:
        raise SystemExit("HATA: Çiftlik ana yolu kurulamadı")
    # kollar: ana yoldan yamaç aşağı ve yukarı, eğimi yumuşatarak
    s = rnd.uniform(120, 260)
    while s < ana.length - 120:
        p = ana.interpolate(s)
        for yon in (1, -1):
            if rnd.random() < 0.35:
                continue
            x, y = p.x, p.y
            hat = [(x, y)]
            for _ in range(rnd.randint(14, 28)):
                ux, uy, e = _egim_yonu(x, y)
                if e == 0.0:
                    break
                # yamaç boyunca değil, çaprazlama: eğim yönüyle yan yön karışımı
                dx, dy = yon * ux * 0.75 - uy * 0.35, yon * uy * 0.75 + ux * 0.35
                n = math.hypot(dx, dy) or 1.0
                x, y = x + dx / n * 25.0, y + dy / n * 25.0
                hat.append((x, y))
            ekle(hat)
        s += rnd.uniform(330, 480)

    # araziler: yolların iki yanına dizilir (cephe 60–100 m, derinlik 55–100 m)
    dolu = [b_["geom"].buffer(25) for b_ in binalar]
    yol_engel = unary_union([y.buffer(6) for y in yollar])
    for yol in yollar:
        for yan in (1, -1):
            s = rnd.uniform(10, 60)
            while s < yol.length - 40:
                cephe = rnd.uniform(60, 100)
                derin = rnd.uniform(55, 100)
                if s + cephe > yol.length:
                    break
                p0, p1 = yol.interpolate(s), yol.interpolate(s + cephe)
                tx, ty = p1.x - p0.x, p1.y - p0.y
                n = math.hypot(tx, ty) or 1.0
                tx, ty = tx / n, ty / n
                nx, ny = -ty * yan, tx * yan
                geri = 8.0
                k = [(p0.x + nx * geri, p0.y + ny * geri),
                     (p1.x + nx * geri, p1.y + ny * geri),
                     (p1.x + nx * (geri + derin), p1.y + ny * (geri + derin)),
                     (p0.x + nx * (geri + derin), p0.y + ny * (geri + derin))]
                arazi = Polygon(k)
                s_sonraki = s + cephe + rnd.uniform(4, 30)
                if (arazi.is_valid and alan.contains(arazi)
                        and not arazi.intersects(yol_engel)
                        and not any(arazi.intersects(d_) for d_ in dolu)
                        and 3000 <= arazi.area <= 10000
                        and rnd.random() < 0.8):
                    dolu.append(arazi.buffer(2))
                    CIFTLIK_ARAZILERI.append((arazi, (tx, ty), (nx, ny),
                                              ((p0.x + p1.x) / 2, (p0.y + p1.y) / 2)))
                s = s_sonraki
    print(f"Çiftlik        : {sayac[0]} toprak yol, {len(CIFTLIK_ARAZILERI)} arazi "
          f"({sum(a[0].area for a in CIFTLIK_ARAZILERI) / 1000 / len(CIFTLIK_ARAZILERI or [1]):.1f} dönüm ortalama)")


_ciftlik_dokusu()


# --- otele çıkan yol ---
# Köyün güney ucundan Güney Burnu'nun sırtına tırmanan tek şerit. Köşeli
# değil: yamaç yolları gibi tek bir yayla dönüyor.
_otel_giris = yerleske(-70, -22)
YOLLAR.append((
    "yol_otel", "Otel Yolu",
    _kivrimli(cadde_bitis, _otel_giris, 230.0, n=18) + [yerleske(-34, -6)],
    "yol", "yer_iskele"
))

# --- yerleşim bağlantıları ------------------------------------------------
# Her yerleşim Sahil Yolu'na bağlanıyor. Ağ böyle kapanıyor:
# Sahil Yolu (halka) → bağlantı → yerleşim sokakları, ve
# Sahil Yolu → Sırt Yolu → su bölümü düğümü.

BAGLANTILAR = [
    ("yol_bag_liman",   "Liman Bağlantısı",   (-4500.0,  2450.0), "yer_liman"),
    ("yol_bag_stadyum", "Stadyum Bağlantısı", ( 4550.0,  2950.0), "yer_stadyum"),
    ("yol_bag_ciftlik", "Çiftlik Bağlantısı", ( 6280.0, -2330.0), "yer_ciftlik"),
    ("yol_bag_iskele",  "İskele Bağlantısı",  (-5080.0, -2060.0), "yer_iskele"),
    # Merkez bağlantısı aşağıda, ayrıca ele alınıyor
]

# Bağlantılar da eğimi gözeten güzergâhla kuruluyor: düz çizgi Stadyum ve
# Çiftlik'te %12'ye çıkıyordu, yamacı dolanınca yarıya iniyor.
for _yid, _ad, _nok, _mid in BAGLANTILAR:
    _hedef = sahil_hat.interpolate(sahil_hat.project(Point(*_nok)))
    _hat = yol_guzergahi(_nok, [(_hedef.x, _hedef.y)])[(_hedef.x, _hedef.y)]
    _hat = _hat_kirp(_hat, ada.buffer(-25))
    if _hat:
        YOLLAR.append((_yid, _ad, _hat, "yol", _mid))

# Merkez kasabası içeride ve yüksekte; düz çizgiyle bağlanınca yol
# Düzada Tepesi'nin üstünden geçip %20 eğime çıkıyordu. Hem sahile hem
# dağ kavşağına eğimi gözeten güzergâhla bağlanıyor.
_merkez_sahil = sahil_hat.interpolate(sahil_hat.project(Point(820, -430)))
_merkez_yollari = yol_guzergahi(
    MERKEZ_KASABA, [(_merkez_sahil.x, _merkez_sahil.y), DAG_KAVSAGI])
YOLLAR.append(("yol_bag_merkez", "Merkez Bağlantısı",
               _merkez_yollari[(_merkez_sahil.x, _merkez_sahil.y)],
               "yol", "yer_merkez"))
YOLLAR.append(("yol_merkez_dag", "Merkez Dağ Yolu",
               _merkez_yollari[DAG_KAVSAGI], "yol", "yer_merkez"))


# --- fener patikası ----------------------------------------------------------
# Kemal, 30 Eylül: "deniz fenerinin yolu yok". En yakın yoldan fenerin
# kapısına kısa bir toprak patika; eğimi gözeten güzergâhla. Kurucu'da
# öteki yollar gibi düzenlenir.
_fener_kapi = (fx * 0.9975, fy * 0.9975)
_aday_yollar = [LineString(n) for _, _, n, t, _ in YOLLAR if t != "merdiven" and len(n) > 1]
_fener_yakin = min(_aday_yollar, key=lambda h: h.distance(Point(*_fener_kapi)))
_fener_uc = _fener_yakin.interpolate(_fener_yakin.project(Point(*_fener_kapi)))
try:
    _fener_hat = yol_guzergahi(_fener_kapi, [(_fener_uc.x, _fener_uc.y)])[(_fener_uc.x, _fener_uc.y)]
except Exception:
    _fener_hat = [_fener_kapi, (_fener_uc.x, _fener_uc.y)]
if len(_fener_hat) >= 2:
    YOLLAR.append(("toprak_fener", "Fener Patikası", list(_fener_hat), "toprak", "yer_liman"))
    print(f"  Fener patikası   : {LineString(_fener_hat).length:.0f} m")

# --- ağ bağlantı denetimi -------------------------------------------------
# "Yollar adanın sonuna kadar gidip kesilen şeyler olamaz." Bütün yolların
# tek bir ağ oluşturduğunu burada doğruluyoruz: uçları ve gövdeleri 140 m
# içinde birbirine değen yollar aynı bileşende sayılıyor.

def _ag_denetimi(yollar, tolerans=140.0):
    hatlar = [(y[0], y[1], LineString(y[2])) for y in yollar if len(y[2]) > 1]
    n = len(hatlar)
    ebeveyn = list(range(n))

    def bul(a):
        while ebeveyn[a] != a:
            ebeveyn[a] = ebeveyn[ebeveyn[a]]
            a = ebeveyn[a]
        return a

    for i in range(n):
        for j in range(i + 1, n):
            if hatlar[i][2].distance(hatlar[j][2]) <= tolerans:
                ra, rb = bul(i), bul(j)
                if ra != rb:
                    ebeveyn[ra] = rb

    bilesenler = {}
    for i in range(n):
        bilesenler.setdefault(bul(i), []).append(hatlar[i][1])
    return bilesenler


# --- eğim denetimi --------------------------------------------------------
# Merdiven hariç hiçbir yolun ortalama eğimi %13'ü aşmamalı. Gerçek dağ
# yolları %10 civarında kalır; aşan bir yol ya güzergâhını değiştirmeli ya
# da uzamalı.
def _yol_egimi(noktalar):
    z = [float(yukselti(*p)) for p in noktalar]
    toplam_d = toplam_dz = 0.0
    for i in range(len(noktalar) - 1):
        d = math.hypot(noktalar[i + 1][0] - noktalar[i][0],
                       noktalar[i + 1][1] - noktalar[i][1])
        toplam_d += d
        toplam_dz += abs(z[i + 1] - z[i])
    return (toplam_dz / toplam_d * 100.0) if toplam_d else 0.0


# --- elle düzenlenmiş yollar ---
# Düzenleyicinin "Yollar" sekmesinde sürüklenen hatlar burada devreye
# giriyor. Denetimler (karada mı, eğim, ağ bütünlüğü) düzenlenmiş yolun
# üstünde de çalışıyor ama HATA değil UYARI veriyorlar: Kemal'in dosyası
# yüzünden üretecin durması yerine neyin bozulduğunu söylemesi daha
# kullanışlı.
_duzenli_yollar = (SINIR_DUZENLEME or {}).get("yollar", {})
if _duzenli_yollar:
    _degisen = 0
    for _i, (_yid, _ad, _nok, _tur, _mid) in enumerate(YOLLAR):
        _ham = _duzenli_yollar.get(_yid)
        if not _ham:
            continue
        _kontrol = [((lng - LNG0) * M_PER_LNG, (lat - LAT0) * M_PER_LAT)
                    for lng, lat in _ham]
        _kapali = (len(_nok) > 3
                   and math.dist(_nok[0], _nok[-1]) < 1e-6)
        _yeni = catmull_rom(_kontrol, kapali=_kapali)
        if _kapali:
            _yeni = _yeni + [_yeni[0]]
        YOLLAR[_i] = (_yid, _ad, _yeni, _tur, _mid)
        _degisen += 1
    print(f"Yol düzenleme  : {_degisen} yol elle düzenlenmiş hâliyle alındı")

    _sorun = []
    for _yid, _ad, _nok, _tur, _ in YOLLAR:
        if _yid not in _duzenli_yollar:
            continue
        _disari = sum(1 for q in _nok if not ada.contains(Point(*q)))
        if _disari and _tur != "merdiven":
            _sorun.append(f"{_ad}: {_disari} nokta karada değil")
        _e = _yol_egimi(_nok)
        if _tur != "merdiven" and _e > 13.0:
            _sorun.append(f"{_ad}: ortalama eğim %{_e:.0f}")
    if _sorun:
        print("  UYARI: düzenlenmiş yollarda —\n    "
              + "\n    ".join(_sorun))

# --- Merkez: dört yol ağzının çevresi (8 Ekim) -------------------------------
#
# Kemal: "Merkez mahallesini ana yolların çevresine kur, şu an olan yuvarlak
# şehir yapısını sil ... Ana yol boyu devam etmesin ama ana yolların
# etrafında biraz daha geniş ve dağınık bir mahalle düzeni olabilir."
#
# Eski Merkez, eski köyün yerinde eşyükselti sıralarıyla kurulmuş yuvarlak
# bir dokuydu. Yenisi kuzeydeki dört yol ağzında:
#   - kavşaktan çıkan her kol 300–460 m boyunca evlenir, sonra kır başlar;
#   - kollardan kısa, kıvrımlı yan sokaklar ayrılır (kavşağa yakın uzun,
#     uzakta kısa); bazısından bir kol daha çıkar;
#   - kavşağın çevresinde kolları birbirine bağlayan birkaç sokak çekirdeği
#     kurar;
#   - evler kavşaktan uzaklaştıkça seyrelir (EV_AYARI `seyrek`);
#   - kamu yapıları ve meydan kavşağın köşelerinde.
# Yollar Kemal'in son hâliyle okunur: kaldırdıkları yok, düzenledikleri
# düzenlenmiş hâliyle, Kurucu'da çizdiği ana yol da kol sayılır.
# Kimlikler yeni (`sokak_merkez_*`, `konut_merkez_*`): eski Merkez'in evlerine
# ve sokaklarına Kemal'in yaptığı taşıma ve gizlemeler yenilerine bulaşmasın.

# Kamu yapılarının bahçesi (7 Ekim, Kemal: "okul, devlet binaları gibi özel
# binaları büyük bahçeli yap, dip dibe olmasın"): yapının çevresinde bu kadar
# metre ev girmez; yollar çıkınca kalan yer bahçe olarak çizilir. Bahçe
# yapının Kurucu'daki son yerinde; yapı yeniden taşınırsa üreteç yeniden çalışır.
OZEL_BAHCE = {"bina_okul": 20.0, "bina_belediye": 15.0, "bina_pazar": 10.0,
              "bina_liman_ofis": 10.0, "bina_liman_depo": 8.0, "bina_meyhane": 10.0}
import random as _random

MERKEZ_KAMU = ("bina_belediye", "bina_okul", "bina_pazar", "bina_apt1", "bina_apt2")


def _gorunen_hatlar():
    """Haritada görünen yollar (Kemal'in son hâli): (kimlik, tür, hat)"""
    gizli = set(_KURUCU.get("gizlenen", []))
    duzen = _KURUCU.get("yolDuzeni", {})
    cikti = []
    for yid, _a, nok, tur, _m in YOLLAR:
        if yid in gizli or len(nok) < 2:
            continue
        for p in ([[_dm(q) for q in k] for k in duzen[yid]] if yid in duzen else [nok]):
            if len(p) >= 2:
                cikti.append((yid, tur, LineString(p)))
    for y in _KURUCU.get("yollar", []):
        k = [_dm(q) for q in y["n"]]
        if len(k) >= 2:
            cikti.append((y["id"], "yol" if y["tur"] == "ana" else y["tur"],
                          LineString(catmull_rom(k, kapali=False, bolme=6))))
    return cikti


def _merkez_dokusu():
    rnd = _random.Random("yer_merkez-kavsak")
    alan = mahalle_geom["yer_merkez"][2].intersection(ada.buffer(-30))
    yaklasik = Point(*MERKEZ_MEYDANI)
    hatlar = [(i, t, h) for i, t, h in _gorunen_hatlar()
              if t in ("ana yol", "yol", "cadde") and h.distance(yaklasik) < 80]
    kes = []
    for a in range(len(hatlar)):
        for b in range(a + 1, len(hatlar)):
            x = hatlar[a][2].intersection(hatlar[b][2])
            for q in (x.geoms if hasattr(x, "geoms") else [x]):
                if q.geom_type == "Point" and q.distance(yaklasik) < 120:
                    kes.append(q)
    J = (Point(sum(q.x for q in kes) / len(kes), sum(q.y for q in kes) / len(kes))
         if kes else yaklasik)

    # --- kollar: kavşaktan dışarı, yönü aynı olan iki hattan uzun olanı
    adaylar = []
    for _i, _t, h in hatlar:
        s0 = h.project(J)
        for yon in (1, -1):
            s1 = min(max(s0 + yon * 600.0, 0.0), h.length)
            if abs(s1 - s0) < 120:
                continue
            k = _substring(h, min(s0, s1), max(s0, s1))
            k = LineString([(J.x, J.y)] + (list(k.coords) if yon > 0 else list(k.coords)[::-1])[1:])
            u = k.interpolate(60.0)
            adaylar.append((math.atan2(u.y - J.y, u.x - J.x), k))
    adaylar.sort(key=lambda a: -a[1].length)
    kollar = []
    for aci, k in adaylar:
        if all(abs((aci - b + math.pi) % (2 * math.pi) - math.pi) > math.radians(30) for b, _ in kollar):
            kollar.append((aci, k))
    kollar.sort(key=lambda a: a[0])
    kollar = [(aci, _substring(k, 0, min(k.length, rnd.uniform(300, 460)))) for aci, k in kollar]
    kol_hatlari = [k for _, k in kollar]

    # --- kamu yapıları: kavşağın köşelerinde, kolların arasında
    def _yon(k, s):
        a, b = k.interpolate(max(s - 15, 0)), k.interpolate(min(s + 15, k.length))
        return math.degrees(math.atan2(b.y - a.y, b.x - a.x))

    yol_payi = unary_union([k.buffer(9) for k in kol_hatlari])
    konan = []

    def _koy(bid, ad, w, h, yuk, kat, wid, adaylar_):
        for (x, y), aci in adaylar_:
            g = dikdortgen(x, y, w, h, aci)
            if (ada.buffer(-10).contains(g) and not g.intersects(yol_payi)
                    and all(g.distance(o) > 14 for o in konan)):
                bina(bid, ad, g, yuk, "yapı", "yer_merkez", wiki_id=wid, kat=kat)
                konan.append(g)
                return g
        raise SystemExit(f"HATA: {ad} yeni Merkez'de yer bulamadı")

    araliklar = []                       # (genişlik, açıortay, sağdaki kol)
    for n, (a0, k0) in enumerate(kollar):
        a1 = kollar[(n + 1) % len(kollar)][0]
        gen = (a1 - a0) % (2 * math.pi) or 2 * math.pi
        araliklar.append((gen, a0 + gen / 2, k0))
    araliklar.sort(key=lambda a: -a[0])

    def _kose(ara, uzak):
        gen, b, k = ara
        return [((J.x + d * math.cos(b), J.y + d * math.sin(b)), _yon(k, 40.0))
                for d in range(uzak, uzak + 120, 6)]

    yapilar = {y[0]: y for y in merkez_yapilar}
    for bid, ara, uzak in (("bina_belediye", araliklar[0], 42), ("bina_pazar", araliklar[1 % len(araliklar)], 40),
                           ("bina_apt1", araliklar[2 % len(araliklar)], 30), ("bina_apt2", araliklar[3 % len(araliklar)], 30)):
        _b, ad, _c, w, h, yuk, kat, wid = yapilar[bid]
        _koy(bid, ad, w, h, yuk, kat, wid, _kose(ara, uzak))
    # Okul kavşaktan biraz uzakta, en geniş aralığın kolu boyunca; büyük bahçesi var
    _b, ad, _c, w, h, yuk, kat, wid = yapilar["bina_okul"]
    _k = araliklar[0][2]
    _okul = []
    for s in range(170, 300, 10):
        p, a = _k.interpolate(s), _yon(_k, s)
        for yan in (1, -1):
            nx, ny = -math.sin(math.radians(a)) * yan, math.cos(math.radians(a)) * yan
            _okul.append(((p.x + nx * 42, p.y + ny * 42), a))
    _koy("bina_okul", ad, w, h, yuk, kat, wid, _okul)
    engel = unary_union([g.buffer(OZEL_BAHCE.get(b, 8.0) + 4.0) for b, g in
                         zip(("bina_belediye", "bina_pazar", "bina_apt1", "bina_apt2", "bina_okul"), konan)])

    # --- sokaklar
    sokaklar = []

    def _uygun(hat, kendi_kolu):
        """Sokak karada mı, yapılardan uzak mı, öteki sokaklara yapışmıyor mu"""
        if len(hat) < 2:
            return None
        h = LineString(hat).intersection(alan)
        if h.is_empty or h.geom_type != "LineString" or h.length < 45:
            return None
        if h.intersects(engel):
            return None
        # başka bir kolu ya da sokağı keserse orada biter (kavşak olur)
        diger = [k for k in kol_hatlari if k is not kendi_kolu] + sokaklar
        bas = Point(h.coords[0])
        kesim = h.length
        for o in diger:
            x = h.intersection(o)
            for q in (x.geoms if hasattr(x, "geoms") else [x]):
                if q.geom_type == "Point" and q.distance(bas) > 12:
                    kesim = min(kesim, h.project(q))
        if kesim < h.length:
            h = _substring(h, 0, kesim)
        if h.length < 45:
            return None
        # öteki sokaklara paralel ve çok yakın gitmesin (ince şerit kalmasın)
        govde = _substring(h, min(20.0, h.length / 3), h.length)
        for o in sokaklar + [k for k in kol_hatlari if k is not kendi_kolu]:
            if govde.buffer(24).intersection(o).length > 30:
                return None
        if _yol_egimi(list(h.coords)) > 15.0:
            return None
        return h

    # kavşak çekirdeği: komşu kolları birbirine bağlayan yay sokaklar
    for n, (a0, k0) in enumerate(kollar):
        a1, k1 = kollar[(n + 1) % len(kollar)]
        if rnd.random() > 0.75:
            continue
        p0 = k0.interpolate(rnd.uniform(120, 200))
        p1 = k1.interpolate(rnd.uniform(120, 200))
        bombe = -rnd.uniform(18, 35)
        h = _uygun(_kivrimli((p0.x, p0.y), (p1.x, p1.y), bombe, n=14), k0)
        if h is not None:
            sokaklar.append(h)
    # kollardan ayrılan yan sokaklar; elenen aday başka açıyla yeniden denenir
    def _dal(bas, aci_, uz_, kendi):
        q = (bas.x + math.cos(aci_) * uz_, bas.y + math.sin(aci_) * uz_)
        return _uygun(_kivrimli((bas.x, bas.y), q, rnd.uniform(-12, 12), n=10), kendi)

    for _a, k in kollar:
        s = rnd.uniform(45, 70)
        taraf = rnd.choice((1, -1))
        while s < k.length - 40:
            p = k.interpolate(s)
            a = math.radians(_yon(k, s))
            oran = s / k.length
            yanlar = [taraf] + ([-taraf] if rnd.random() < 0.45 else [])
            for yan in yanlar:
                h = None
                for _deneme in range(3):
                    uz = rnd.uniform(120, 270) * (1.0 - 0.6 * oran)
                    h = _dal(p, a + yan * math.pi / 2 + math.radians(rnd.uniform(-30, 30)), uz, k)
                    if h is not None:
                        break
                if h is None:
                    continue
                sokaklar.append(h)
                if rnd.random() < 0.55 and h.length > 80:
                    # uçtan bir kol daha: dağınık köy sokağı
                    c = h.interpolate(h.length * rnd.uniform(0.6, 0.9))
                    t0, t1 = h.interpolate(max(h.project(c) - 10, 0)), h.interpolate(min(h.project(c) + 10, h.length))
                    ha = math.atan2(t1.y - t0.y, t1.x - t0.x)
                    for _deneme in range(2):
                        h2 = _dal(c, ha + rnd.choice((1, -1)) * math.radians(rnd.uniform(60, 90)),
                                  rnd.uniform(60, 150), h)
                        if h2 is not None:
                            sokaklar.append(h2)
                            break
            s += rnd.uniform(50, 95)
            if rnd.random() < 0.7:
                taraf = -taraf

    for i, h in enumerate(sokaklar, 1):
        YOLLAR.append((f"sokak_merkez_{i}", f"Merkez {i}. Sokak",
                       [(x, y) for x, y in h.coords], "sokak", "yer_merkez"))
    DOKU_ALANI["yer_merkez"] = unary_union(
        [k.buffer(46) for k in kol_hatlari] + [h.buffer(44) for h in sokaklar]).intersection(alan)
    print(f"Merkez dokusu  : dört yol ağzında ({J.x:.0f}, {J.y:.0f}), {len(kollar)} kol "
          f"({', '.join(f'{k.length:.0f}' for k in kol_hatlari)} m), {len(sokaklar)} sokak")
    return (J.x, J.y)


MERKEZ_KAVSAK = _merkez_dokusu()

_bilesen = _ag_denetimi(YOLLAR)
if len(_bilesen) > 1:
    _ayrik = sorted(_bilesen.values(), key=len)[:-1]
    raise SystemExit(
        "HATA: yol ağı kopuk — şu yollar ana ağa bağlı değil:\n  "
        + "\n  ".join("; ".join(g) for g in _ayrik))
print(f"Yol ağı        : tek parça ({len(YOLLAR)} yol)")


_dik = [(ad, _yol_egimi(nok)) for _, ad, nok, tur, _ in YOLLAR
        if tur not in ("merdiven", "sokak") and _yol_egimi(nok) > 13.0]
if _dik:
    print("  UYARI: dik yollar — " + ", ".join(
        f"{ad} %{e:.0f}" for ad, e in _dik))

print(f"Yol sayısı     : {len(YOLLAR)}"
      f"  ({sum(1 for y in YOLLAR if y[3] == 'sokak')} sokak)")

# Hiçbir yol denize taşmasın
for _yid, _ad, _nok, _tur, _ in YOLLAR:
    if _tur == "merdiven":
        continue           # merdiven bilerek iskeleye, suya kadar iniyor
    _disari = [p for p in _nok if not ada.contains(Point(*p))]
    if _disari:
        raise SystemExit(f"HATA: {_ad} karadan çıkıyor ({len(_disari)} nokta)")

# ---------------------------------------------------------------- evler
#
# Kemal (29 Eylül gece): "Yapıları ilk etapta boş bile olsa sen ekle, dolu
# görünsün." Evler adsızdır ("Ev" yalnız türün adı), maddeleri yok.
#
# Ege dokusu (2 Ekim, Kemal: "Senin yollarınla üret"): sokak ağı, üretilen
# yollara Kemal'in Kurucu'da çizdiği yollar eklenerek kurulur
# (`gen/kurucu-yollari.json`, `gen/kurucu_aktar.py` ile yedekten çıkar).
# Kaldırdığı yollar ağa girmez. Ağın arasında kalan her yapı adası
# (blok) sokağa bakan kenarlarından parsellere bölünür: evler sokağa
# yaslanır, İskele ve Liman'da bitişik nizam, aralarda dar geçitler;
# evlerin arkası avlu (kasabada) ya da bahçe (köyde); blokların içi
# Merkez ve Stadyum'da tarla / bağ / bahçe bölmeleri. Meydanlar açık
# kalır, evler meydana da bakar. Elle taşınan evler eski kimlikleriyle
# yerinde kalır. Yöntem Watabou'nun Medieval Fantasy City Generator'ındaki
# blok bölme fikrinden uyarlandı (kod alınmadı).

import random as _random
from shapely.prepared import prep as _hazirla



_YOL_YARI_EN = {"ana yol": 6.0, "yol": 4.5, "cadde": 4.5, "sokak": 3.0,
                "merdiven": 2.2, "toprak": 3.0}
_KURUCU_YARI_EN = {"ana": 4.5, "sokak": 3.0, "toprak": 3.0, "patika": 1.2}
_CEPHESIZ = ("merdiven", "toprak", "patika")    # bunlara ev dizilmez

_kur_gizli = set(_KURUCU.get("gizlenen", []))
_kur_duzen = _KURUCU.get("yolDuzeni", {})
_ag = []            # (hat, yarı en, cephe alır mı)
for _yid, _ad, _nok, _tur, _ymid in YOLLAR:
    if _yid in _kur_gizli or len(_nok) < 2:
        continue
    _yari = _YOL_YARI_EN.get(_tur, 3.0)
    _parcalar = ([[_dm(q) for q in _p] for _p in _kur_duzen[_yid]]
                 if _yid in _kur_duzen else [_nok])
    for _p in _parcalar:
        if len(_p) >= 2:
            _ag.append((LineString(_p), _yari, _tur not in _CEPHESIZ))
_kurucu_sokaklari = []
for _y in _KURUCU.get("yollar", []):
    _h = LineString([_dm(q) for q in _y["n"]])
    _ag.append((_h, _KURUCU_YARI_EN.get(_y["tur"], 3.0), _y["tur"] not in _CEPHESIZ))
    if _y["tur"] == "sokak":
        _kurucu_sokaklari.append(_h)

_yol_alani = unary_union([h.buffer(y + 0.8) for h, y, _ in _ag])
_yol_engel = _hazirla(_yol_alani)
_ada_ici = _hazirla(ada.buffer(-8))
_IZGARA = 40.0
_yerlesen = {}          # ızgara hücresi → çokgenler


def _hucreler(g):
    x0, y0, x1, y1 = g.bounds
    for i in range(int(x0 // _IZGARA), int(x1 // _IZGARA) + 1):
        for j in range(int(y0 // _IZGARA), int(y1 // _IZGARA) + 1):
            yield (i, j)


def _bos_mu(g):
    return not any(g.intersects(o) for h in _hucreler(g) for o in _yerlesen.get(h, ()))


def _yerlestir(g):
    for h in _hucreler(g):
        _yerlesen.setdefault(h, []).append(g)


def _bol(g, hedef, rnd, sonuc, derinlik=0):
    """Çokgeni uzun ekseninde ikiye bölerek `hedef` alanına iner"""
    if g.area <= hedef or derinlik > 9:
        sonuc.append(g)
        return
    k = list(g.minimum_rotated_rectangle.exterior.coords)
    e1 = (k[1][0] - k[0][0], k[1][1] - k[0][1])
    e2 = (k[2][0] - k[1][0], k[2][1] - k[1][1])
    uzun = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
    boy = math.hypot(*uzun) or 1.0
    a = math.atan2(uzun[1], uzun[0]) + math.radians(rnd.uniform(-8, 8))
    ux, uy = math.cos(a), math.sin(a)
    c = g.centroid
    px, py = c.x + ux * boy * rnd.uniform(-0.15, 0.15), c.y + uy * boy * rnd.uniform(-0.15, 0.15)
    L = boy * 2 + 10
    yari = Polygon([(px - uy * L, py + ux * L), (px + uy * L, py - ux * L),
                    (px + uy * L + ux * L, py - ux * L + uy * L),
                    (px - uy * L + ux * L, py + ux * L + uy * L)])
    for p in _parcala(g.intersection(yari)) + _parcala(g.difference(yari)):
        if p.area > 4:
            _bol(p, hedef, rnd, sonuc, derinlik + 1)


# Engeller: özel yapılar, Kemal'in Kurucu yapıları, taşıdığı evler
# Merkez'in kamu yapıları yeni Merkez'de yeniden yerleşti (8 Ekim); eski
# köydeki taşıma ayarları onlara uygulanmaz (Durum → Eksikler kartı siler)
_yapi_duzeni = {k: v for k, v in _KURUCU.get("yapiDuzeni", {}).items() if k not in MERKEZ_KAMU}
_engeller = []
_ozel_bahceler = []
for _b in binalar:
    _g = _b["geom"]
    if _b["id"] in _yapi_duzeni:          # Kurucu'da taşınan yapı: yeni yeri
        _g = _kurucu_tasi(_g, _yapi_duzeni[_b["id"]])
    _pay = OZEL_BAHCE.get(_b["id"], 2.5)
    _yerlestir(_g.buffer(_pay))
    _engeller.append(_g.buffer(_pay))
    if _b["id"] in OZEL_BAHCE:
        _ozel_bahceler.append((_b["id"], _g, len(_engeller) - 1))
for _z in STAD_ZEMIN:
    _yerlestir(_z[2].buffer(2.0))
    _engeller.append(_z[2].buffer(2.0))
# Otel yerleşkesi (2 Ekim, Kemal: "otel bahçesinde binalar var"): sahanlık,
# teras ve bahçe; otel Kurucu'da taşındıysa eski yeri de otelin arazisi
_otel_arazi = [OTEL_YERLESKESI, _sahanlik_dortgeni({**OTEL_SAHANLIK, "x": ox, "y": oy, "yon": OTEL_YON})]
_otel_arazi += [z["geom"] for z in zemin if z["id"] in ("zemin_teras", "zemin_bahce")]
for _g in _otel_arazi:
    _yerlestir(_g.buffer(6.0))
    _engeller.append(_g.buffer(6.0))
_kurucu_meydanlari = []
for _y in _KURUCU.get("yapilar", []):
    _cx, _cy = _dm(_y["merkez"])
    _g = dikdortgen(_cx, _cy, _y["en"], _y["boy"], -math.degrees(_y.get("aci", 0)))
    if _y["tur"] == "meydan":
        _kurucu_meydanlari.append(_g)
    _engeller.append(_g.buffer(2.0))
    _yerlestir(_g.buffer(2.0))

_tasinan = 0
for _t in _KURUCU.get("tasinanEvler", []):
    if _t["mahalle"] == "yer_merkez":
        continue                          # eski Merkez'in evleri kalktı (8 Ekim)
    _ilk = Polygon([_dm(q) for q in _t["halka"]])
    _son = Polygon([_dm(q) for q in _t["yeniHalka"]])
    bina(_t["id"], "Ev", _ilk, _t["yukseklik"], "ev", _t["mahalle"],
         kat=_t["kat"], taban=_t["taban"])
    _engeller.append(_son.buffer(0.5))
    _yerlestir(_son.buffer(0.5))
    _tasinan += 1

# Kamu yapılarının bahçeleri: yollar, öteki yapılar ve kıyı çıkar
_ozel_engel = {i for _, _, i in _ozel_bahceler}
for _bid, _g, _i in _ozel_bahceler:
    _ic = _g.buffer(OZEL_BAHCE[_bid] - 1.0, join_style=2)
    _ic = _ic.intersection(ada.buffer(-8)).difference(_yol_alani).difference(_g.buffer(0.3))
    _yakin = [e for j, e in enumerate(_engeller) if j not in _ozel_engel and e.distance(_ic) < 1]
    _yakin += [g.buffer(2.5) for b, g, j in _ozel_bahceler if j != _i and g.distance(_ic) < 5]
    if _yakin:
        _ic = _ic.difference(unary_union(_yakin))
    # Yalnız yapıya değen parçalar; yolun karşısına düşen şerit bahçe değil
    _ic = [p for p in _parcala(_ic) if p.area > 20 and p.distance(_g) < 3]
    for _k, _p in enumerate(sorted(_ic, key=lambda p: -p.area)):
        zemin.append({"id": f"bahce_{_bid[5:]}" + (f"_{_k}" if _k else ""),
                      "ad": "", "tur": "bahçe", "geom": _p})

# Meydanlar: Merkez'de taş çeşme ve çınarın meydanı, İskele'de caddenin
# ortasındaki küçük açıklık, Liman'da kasabanın ortası; Stadyum'da Kemal'in
# Kurucu'da koyduğu meydan. Yolları örtmesin diye yol alanı çıkarılır.
def _kavsak_merkezi(mid):
    """Mahalle dokusunun ortasına en yakın, en az üç sokağın buluştuğu kavşak"""
    from collections import Counter
    say = Counter()
    for _yid, _ad, _nok, _tur, _ymid in YOLLAR:
        if _ymid != mid or _yid in _kur_gizli:
            continue
        for q in {(round(x), round(y)) for x, y in _nok}:
            say[q] += 1
    adaylar = [q for q, n in say.items() if n >= 3] or [q for q, n in say.items() if n >= 2]
    hedef = DOKU_ALANI[mid].centroid
    return min(adaylar, key=lambda q: math.hypot(q[0] - hedef.x, q[1] - hedef.y))


# Liman'ın meydanı kasabanın içinde, sokakların buluştuğu yerde (2 Ekim
# gece, Kemal: kenarda boş bir leke gibi duruyordu)
_MEYDANLAR = [("yer_merkez", MERKEZ_KAVSAK, 34.0),
              ("yer_iskele", _kasaba_merkezi, 20.0),
              ("yer_liman", _kavsak_merkezi("yer_liman"), 22.0)]
if not any(mahalle_geom["yer_stadyum"][2].contains(_g.centroid) for _g in _kurucu_meydanlari):
    _MEYDANLAR.append(("yer_stadyum", (4550.0, 2950.0), 22.0))
_meydan_alani = []
for _mid, _mey, _r in _MEYDANLAR:
    _rnd = _random.Random(_mid + "-meydan")
    _daire = Polygon([(_mey[0] + _r * (1 + _rnd.uniform(-0.12, 0.12)) * math.cos(2 * math.pi * i / 14),
                       _mey[1] + _r * (1 + _rnd.uniform(-0.12, 0.12)) * math.sin(2 * math.pi * i / 14))
                      for i in range(14)])
    _yerlestir(_daire)
    _meydan_alani.append(_daire)
    _g = _daire.intersection(ada.buffer(-8))
    _g = _g.difference(unary_union([h.buffer(y) for h, y, _ in _ag if h.distance(_daire) < 10] or [Point(0, 0).buffer(0.01)]))
    _g = _g.difference(unary_union(_engeller))
    for _k, _p in enumerate(sorted(_parcala(_g), key=lambda p: -p.area)):
        if _p.area > 15:
            zemin.append({"id": f"meydan_{_mid}" + (f"_{_k}" if _k else ""),
                          "ad": "", "tur": "meydan", "geom": _p})
_meydan_alani += [g.buffer(1.0) for g in _kurucu_meydanlari]
_engel_birlesik = unary_union(_engeller + [g.buffer(0.5) for g in _meydan_alani])
_cephe_alani = unary_union([h.buffer(y + 0.8) for h, y, c in _ag if c] + _meydan_alani)
_cephe = _hazirla(_cephe_alani.buffer(1.6))


# Parsel düzeni (2 Ekim gece, Kemal: "çok fazla dip dibe ev var; müstakilse
# birer ufak bahçeleri olmalı", "bahçeler de görünsün, bahçelerle bitişik
# görünebilir evler, daha nizami, Bodrum gibi"). Sokak cephesi parsellere
# bölünür; her parselde bir ev ve kendi bahçesi, parseller arasında bahçe
# duvarı. Bir cephe boyunca evin yoldan geriliği ve derinliği sabit: sıra
# nizamlı durur. İskele ve Liman bitişik (birkaç ev yan yana, sonra bir
# bahçe parseli), Merkez ve Stadyum müstakil (yanlarda bahçe payı).
#
# mahalle: parsel cephesi, ev yan payı (her yan), ön bahçe, ev derinliği,
#          arka bahçe, bitişik sıra uzunluğu (ev) ya da None, geçit aralığı,
#          kat seçenekleri, boş parsel oranı, iç bölme alanı m² ya da None
#
# 7 Ekim (Kemal: "ilçelerin içindeki evler çok dip dibe, nüfusu çok
# artırıyor; evleri yarı yarıya azaltıp arsalarını büyüt"; düzen "hafif Ege
# düzensizliği"): parseller iki kat geniş, bahçeler derin, bitişik sıralar
# kısa; her evin yoldan geriliği ve derinliği sıra içinde biraz oynar
# (`oyna`, m), cephe yine yola paralel.
EV_AYARI = {
    "yer_iskele":  dict(parsel=(12, 16), yan=(0, 1.0), on=(0.5, 1.5), derin=(9, 12), arka=12.0,
                        sira=(2, 4), gecit=(45, 75), katlar=(2, 2, 3), bos=0.1, bolme=None, oyna=0.8),
    "yer_liman":   dict(parsel=(13, 17), yan=(0, 1.5), on=(1.0, 2.5), derin=(9, 12), arka=13.0,
                        sira=(2, 4), gecit=(55, 85), katlar=(1, 2, 2, 3), bos=0.1, bolme=None, oyna=1.0),
    # Merkez (8 Ekim): kavşakta sık, kollarda seyrek (`seyrek`: r0–r1 m arası
    # boş arsa oranı `bos`tan şuna çıkar)
    "yer_merkez":  dict(parsel=(22, 30), yan=(3.0, 6.0), on=(4.0, 7.0), derin=(8, 11), arka=16.0,
                        sira=None, gecit=None, katlar=(1, 2, 2), bos=0.12, bolme=2200.0, oyna=1.8,
                        seyrek=(90.0, 430.0, 0.65)),
    "yer_stadyum": dict(parsel=(24, 30), yan=(4.0, 6.0), on=(5.0, 7.0), derin=(9, 12), arka=15.0,
                        sira=None, gecit=None, katlar=(2, 2, 1), bos=0.15, bolme=2800.0, oyna=1.5),
}

_ev_sayisi = {}
_ek_sayisi = {"bahçe": 0, "aralik": 0, "bolme": 0, "parsel": 0}
duvarlar = []           # bahçe duvarları: (kimlik, çizgi)
# Seyir terasının korkuluğu (7 Ekim): binaya bakan arka kenar açık, öteki
# kenarlar kaidenin üstünde taş korkuluk
for _z in zemin:
    if _z["id"] != "zemin_teras":
        continue
    _k = list(_z["geom"].exterior.coords)
    _kenar = [LineString([_k[_i], _k[_i + 1]]) for _i in range(len(_k) - 1)]
    _uz = [_c.interpolate(0.5, normalized=True).distance(Point(OTEL_SAHANLIK["x"], OTEL_SAHANLIK["y"])) for _c in _kenar]
    _korkuluk = [_c for _c, _d in zip(_kenar, _uz) if _d > min(_uz) + 3.0]
    if _korkuluk:
        duvarlar.append(("duvar_otel_teras", unary_union(_korkuluk), None))
for _mid, _A in EV_AYARI.items():
    _rnd = _random.Random(_mid + "-ev")
    _mpoly = mahalle_geom[_mid][2]
    _alan = DOKU_ALANI[_mid]
    _ek = [h.buffer(45) for h in _kurucu_sokaklari if h.intersects(_mpoly)
           # eski Merkez'de çizilmiş sokaklar yeni Merkez'e ev getirmez
           and (_mid != "yer_merkez" or h.distance(_alan) < 30)]
    if _ek:
        _alan = unary_union([_alan] + _ek).intersection(_mpoly)
    _alan = _alan.intersection(ada.buffer(-8)).difference(_yol_alani).difference(_engel_birlesik)
    # Bloklar sıradan bağımsız (8 Ekim): uzaktaki bir yapı değişince (yeni
    # Merkez) birleşimin köşe sırası değişip bu mahallenin evleri kaymasın
    _bloklar = sorted((_shapely.normalize(p) for p in _parcala(_alan) if p.area > 40),
                      key=lambda p: (round(p.centroid.x), round(p.centroid.y)))
    _n = 0
    _arka_n = 0
    for _bn, _blok in enumerate(_bloklar):
        _blok_evleri = []
        _ev_parselleri = []     # (ev kimliği, arsa, ev): ev ve arsası tek yapı
        _parseller = []
        _gecitler = []
        _halkalar = [_blok.simplify(0.8).exterior] + list(_blok.simplify(0.8).interiors)
        _sonraki_gecit = _rnd.uniform(*_A["gecit"]) if _A["gecit"] else None
        _yol_boyu = 0.0
        for _halka in _halkalar:
            # Sokağa bakan kenarlar ardışık koşulara toplanır: kıvrımlı
            # sokakta ve köşede cephe kesilmesin
            _k = list(_halka.coords)[:-1]
            _on = [_cephe.contains(Point((_k[i][0] + _k[(i + 1) % len(_k)][0]) / 2,
                                         (_k[i][1] + _k[(i + 1) % len(_k)][1]) / 2))
                   for i in range(len(_k))]
            if not any(_on):
                continue
            _bas = next((i for i in range(len(_k)) if _on[i] and not _on[i - 1]), 0)
            _kosular, _kosu = [], []
            for _j in range(len(_k)):
                _i = (_bas + _j) % len(_k)
                if _on[_i]:
                    if not _kosu:
                        _kosu = [_k[_i]]
                    _kosu.append(_k[(_i + 1) % len(_k)])
                elif _kosu:
                    _kosular.append(_kosu)
                    _kosu = []
            if _kosu:
                _kosular.append(_kosu)
            for _kosu in _kosular:
                _hat = LineString(_kosu)
                _L = _hat.length
                # cephe boyunca sabit: nizamlı sıra
                _g0 = _rnd.uniform(*_A["on"])
                _d = _rnd.uniform(*_A["derin"])
                _D = _g0 + _d + _A["arka"]
                _sira_kalan = _rnd.randint(*_A["sira"]) if _A["sira"] else None
                _s = 0.0
                while _s < _L - 4:
                    _c = _rnd.uniform(*_A["parsel"])
                    if _s + _c > _L:
                        if _L - _s < _A["parsel"][0] * 0.6:
                            break
                        _c = _L - _s
                    _p0 = _hat.interpolate(_s)
                    _p1 = _hat.interpolate(_s + _c)
                    _tx, _ty = _p1.x - _p0.x, _p1.y - _p0.y
                    _tn = math.hypot(_tx, _ty)
                    if _tn < _c * 0.6:              # keskin dönemeç
                        _s += 2.0
                        continue
                    _tx, _ty = _tx / _tn, _ty / _tn
                    _nx, _ny = -_ty, _tx
                    _o = Point((_p0.x + _p1.x) / 2 + _nx * 0.8, (_p0.y + _p1.y) / 2 + _ny * 0.8)
                    if not _blok.contains(_o):
                        _nx, _ny = -_nx, -_ny

                    def _dortgen(a, b, u, v):
                        return Polygon([(_p0.x + _tx * a + _nx * u, _p0.y + _ty * a + _ny * u),
                                        (_p0.x + _tx * b + _nx * u, _p0.y + _ty * b + _ny * u),
                                        (_p0.x + _tx * b + _nx * v, _p0.y + _ty * b + _ny * v),
                                        (_p0.x + _tx * a + _nx * v, _p0.y + _ty * a + _ny * v)])

                    # dar ara sokak: bitişik sıralarda belli aralıkla bir geçit
                    if _sonraki_gecit is not None and _yol_boyu >= _sonraki_gecit and _s < _L - 10:
                        _g_en = _rnd.uniform(2.6, 3.4)
                        _gecitler += _parcala(_dortgen(0, _g_en, -1, _D).intersection(_blok))
                        _s += _g_en
                        _yol_boyu = 0.0
                        _sonraki_gecit = _rnd.uniform(*_A["gecit"])
                        continue
                    _ham = _dortgen(0, _c, 0, _D)
                    _parsel = _ham.intersection(_blok)
                    # bloğun bütün parselleri ve geçitleri: köşede ve
                    # kıvrımda arsalar üst üste binmesin (7 Ekim)
                    for _o in _parseller + _gecitler:
                        if _parsel.intersects(_o):
                            _parsel = _parsel.difference(_o)
                    _parsel = max(_parcala(_parsel), key=lambda p: p.area, default=None)
                    _s += _c
                    _yol_boyu += _c
                    if _parsel is None or _parsel.area < _ham.area * 0.55:
                        continue
                    _parsel = _parsel.simplify(0.05).buffer(0)
                    _parsel = max(_parcala(_parsel), key=lambda p: p.area, default=None)
                    if _parsel is None:
                        continue
                    _parseller.append(_parsel)
                    # bitişik sırada her birkaç evden sonra bir bahçe parseli
                    if _sira_kalan is not None:
                        if _sira_kalan <= 0:
                            _sira_kalan = _rnd.randint(*_A["sira"])
                            continue
                        _sira_kalan -= 1
                    _bos = _A["bos"]
                    if "seyrek" in _A:
                        _r0, _r1, _b1 = _A["seyrek"]
                        _u = math.hypot((_p0.x + _p1.x) / 2 - MERKEZ_KAVSAK[0], (_p0.y + _p1.y) / 2 - MERKEZ_KAVSAK[1])
                        _bos += (_b1 - _bos) * min(max((_u - _r0) / (_r1 - _r0), 0.0), 1.0)
                    if _rnd.random() < _bos:
                        if "seyrek" in _A:
                            _parseller.pop()      # dağınık köy: boş arsa tarlaya karışır
                        continue
                    _yan = _rnd.uniform(*_A["yan"])
                    # hafif Ege düzensizliği: gerilik ve derinlik ev ev oynar
                    _oy = _A.get("oyna", 0.0)
                    _ge = max(0.2, _g0 + _rnd.uniform(-_oy, _oy))
                    _de = max(7.0, _d + _rnd.uniform(-_oy, _oy))
                    _ev = _dortgen(_yan, _c - _yan, _ge, _ge + _de).intersection(_parsel)
                    _ev = max(_parcala(_ev), key=lambda p: p.area, default=None)
                    if _ev is None or _ev.area < (_c - 2 * _yan) * _de * 0.8 or not _ada_ici.contains(_ev):
                        continue
                    _ev = _ev.simplify(0.05)
                    _kat = _rnd.choice(_A["katlar"])
                    _n += 1
                    _evid = f"konut_merkez_{_n}" if _mid == "yer_merkez" else f"konut_{_mid}_{_n}"
                    bina(_evid, "Ev", _ev, round(_kat * 3.1 + 1.4, 1), "ev", _mid, kat=_kat)
                    _blok_evleri.append(_ev)
                    _ev_parselleri.append((_evid, _parsel, _ev))
                    _yerlestir(_ev.buffer(0.3))
        if not _parseller:
            continue
        _ek_sayisi["parsel"] += len(_parseller)
        _ek_sayisi["aralik"] += len(_gecitler)
        # Ev ve arsası tek yapı (8 Ekim, Kemal: "evleri bahçeleriyle birleştir,
        # onlar ayrı birer yapı değil; ev yapısında arsası, belki duvarı ve
        # olacaksa ağaçları da olsun"). Her evin arsası (parsel eksi ev) ve
        # duvarı `ev` alanıyla eve bağlı: Kurucu'da ev taşınınca, dönünce ya da
        # kaldırılınca arsası ve duvarı da onunla gider. Ağaçlar harita
        # açılırken arsanın içine konur, arsayla birlikte gelir.
        def _arsa_parcalari(g):
            for _p in _parcala(g):
                if _p.area > 8:
                    # sadeleşince sınırı kendi üstüne katlanmasın (7 Ekim: 290 bahçe
                    # bozuktu, haritada üst üste binen arsa gibi görünüyordu)
                    for _q in _parcala(_p.simplify(0.3).buffer(0)):
                        if _q.area > 8:
                            yield _q
        _evli = set()
        for _evid, _ps, _evg in _ev_parselleri:
            _evli.add(id(_ps))
            for _k, _q in enumerate(_arsa_parcalari(_ps.difference(_evg.buffer(0.1)))):
                _ek_sayisi["bahçe"] += 1
                zemin.append({"id": f"arsa_{_evid}" + (f"_{_k}" if _k else ""), "ad": "",
                              "tur": "bahçe", "geom": _q, "ev": _evid})
            _dv = _ps.exterior.difference(_evg.buffer(0.2))
            if not _dv.is_empty:
                duvarlar.append((f"duvar_{_evid}", _dv.simplify(0.2), _evid))
        # evi olmayan parseller (bitişik sıradaki bahçe parseli): bloğun ortak bahçesi
        _bos_parseller = [p for p in _parseller if id(p) not in _evli]
        if _bos_parseller:
            for _q in _arsa_parcalari(unary_union(_bos_parseller)):
                _arka_n += 1
                _ek_sayisi["bahçe"] += 1
                zemin.append({"id": f"bahce_{_mid}_{_arka_n}", "ad": "", "tur": "bahçe",
                              "geom": _q})
            _duvar = unary_union([p.exterior for p in _bos_parseller])
            if _blok_evleri:
                _duvar = _duvar.difference(unary_union(_blok_evleri).buffer(0.2))
            if not _duvar.is_empty:
                duvarlar.append((f"duvar_{_mid}_{_bn}", _duvar.simplify(0.2), None))
        _parsel_alani = unary_union(_parseller)
        # bloğun içi: tarla, bağ, bahçe bölmeleri (köyde)
        if _A["bolme"]:
            _bolme = _A["bolme"]
            _ic = _blok.difference(_parsel_alani.buffer(1.0))
            for _p in _parcala(_ic):
                if _p.area < _bolme * 0.6:
                    continue
                _parsel = []
                _bol(_p, _bolme * _rnd.uniform(0.8, 1.4), _rnd, _parsel)
                for _q in _parsel:
                    _q = _q.buffer(-0.8)          # bölmeler arası taş duvar / sınır
                    for _r in _parcala(_q):
                        # ince şerit tarla olmaz: alan / çevre ≥ 5,5 (en ≈ 11 m)
                        if _r.area < 150 or _r.area / _r.length < 5.5:
                            continue
                        _arka_n += 1
                        _ek_sayisi["bolme"] += 1
                        _x = _rnd.random()
                        zemin.append({"id": f"bolme_{_mid}_{_arka_n}", "ad": "",
                                      "tur": "tarla" if _x < 0.35 else "bağ" if _x < 0.6
                                      else "zeytinlik" if _x < 0.8 else "bahçe",
                                      "geom": _r.simplify(0.5)})
    _ev_sayisi[_mid] = _n

# Çiftlik kompleksleri: arazinin yola yakın yarısında ana ev, yanında ahır
# ve depo; bazılarında ikinci ev. Arazi bölmelere ayrılır (2 Ekim, Ege
# dokusu): çoğu zeytinlik, bir kısmı bağ ve tarla; aralarda taş duvar payı.
_rnd = _random.Random("yer_ciftlik-kompleks")
_rnd_bolme = _random.Random("yer_ciftlik-bolme")
_kompleks = 0
for _i, (_arazi, (_tx, _ty), (_nx, _ny), (_cx, _cy)) in enumerate(CIFTLIK_ARAZILERI, 1):
    _parsel = []
    _bol(_arazi, _rnd_bolme.uniform(2500, 4500), _rnd_bolme, _parsel)
    _k = 0
    for _q in _parsel:
        for _r in _parcala(_q.buffer(-1.0)):
            if _r.area < 200:
                continue
            _k += 1
            _x = _rnd_bolme.random()
            zemin.append({"id": f"zemin_ciftlik_{_i}_{_k}", "ad": "Çiftlik arazisi",
                          "tur": "zeytinlik" if _x < 0.5 else "bağ" if _x < 0.8 else "tarla",
                          "geom": _r.simplify(0.5)})
        _ek_sayisi["bolme"] += 1
    _aci = math.degrees(math.atan2(_ty, _tx))
    _ic = 20.0 + _rnd.uniform(0, 12)          # yoldan içeri
    _yan = _rnd.uniform(-12, 12)
    _parcalar = [("Ev", "ev", (12, 16), (9, 11), 2, 0.0, 0.0),
                 ("Ahır", "ahir", (18, 24), (8, 10), 1, _rnd.choice((-1, 1)) * 22.0, 6.0),
                 ("Depo", "depo", (6, 10), (5, 7), 1, _rnd.choice((-1, 1)) * 12.0, 18.0)]
    if _rnd.random() < 0.35:
        _parcalar.append(("Ev", "ev", (9, 12), (8, 9), 1, _rnd.choice((-1, 1)) * 16.0, 20.0))
    _konan = 0
    for _j, (_ad, _tur, _gen, _der, _kat, _dy, _dx) in enumerate(_parcalar):
        _ox = _cx + _nx * (_ic + _dx) + _tx * (_yan + _dy)
        _oy = _cy + _ny * (_ic + _dx) + _ty * (_yan + _dy)
        _g = dikdortgen(_ox, _oy, _rnd.uniform(*_gen), _rnd.uniform(*_der),
                        _aci + _rnd.uniform(-4, 4))
        if _arazi.buffer(-3).contains(_g) and _bos_mu(_g):
            bina(f"ciftlik_{_i}_{_j}", _ad, _g, round(_kat * 3.1 + 1.6, 1),
                 _tur, "yer_ciftlik", kat=_kat)
            _yerlestir(_g.buffer(2))
            _konan += 1
    _kompleks += 1 if _konan else 0

# Son denetim (7 Ekim, Kemal: "çakışan bina olursa da sil"): üretilen bir ev
# uygulamadaki son hâlde başka bir yapıya biniyorsa silinir. Kemal'in
# taşıdığı yapılar yeni yerleriyle, Kurucu'da koyduğu yapılar da sayılır;
# kaldırdığı (gizlediği) yapılar sayılmaz. Kemal'in yapılarına dokunulmaz.
from shapely.strtree import STRtree as _STRtree
_son_yer = {_t["id"]: Polygon([_dm(q) for q in _t["yeniHalka"]]) for _t in _KURUCU.get("tasinanEvler", [])}
_son_liste = []
for _b in binalar:
    if _b["id"] in _kur_gizli:
        continue
    _g = _son_yer.get(_b["id"]) or (_kurucu_tasi(_b["geom"], _yapi_duzeni[_b["id"]])
                                    if _b["id"] in _yapi_duzeni else _b["geom"])
    _son_liste.append((_b["id"], _g))
for _y in _KURUCU.get("yapilar", []):
    if _y["tur"] != "meydan":
        _cx, _cy = _dm(_y["merkez"])
        _son_liste.append(("kurucu", dikdortgen(_cx, _cy, _y["en"], _y["boy"], -math.degrees(_y.get("aci", 0)))))
_son_tur = {_b["id"]: _b["tur"] for _b in binalar}
_agac = _STRtree([g for _, g in _son_liste])
_silinecek = set()
for _i, (_id, _g) in enumerate(_son_liste):
    if not _id.startswith(("konut_", "ciftlik_")) or _son_tur.get(_id) != "ev":
        continue
    for _j in _agac.query(_g):
        _oid = _son_liste[_j][0]
        if _j == _i or _oid in _silinecek:
            continue
        if _g.intersection(_son_liste[_j][1]).area > 0.5:
            _silinecek.add(_id)
            break
binalar[:] = [_b for _b in binalar if _b["id"] not in _silinecek]
print(f"Çakışma denetimi: {len(_silinecek)} ev silindi" + (f" ({', '.join(sorted(_silinecek))})" if _silinecek else ""))

for z in zemin:
    if "taban" not in z:
        _c = z["geom"].centroid
        z["taban"] = round(float(yukselti(_c.x, _c.y)), 1)

print("Evler          : " + ", ".join(f"{m.replace('yer_', '')} {n}" for m, n in _ev_sayisi.items())
      + f"; Çiftlik {_kompleks} kompleks")
print(f"Ege dokusu     : {_tasinan} taşınan ev yerinde, {_ek_sayisi['parsel']} parsel, "
      f"{_ek_sayisi['bahçe']} bahçe, {_ek_sayisi['aralik']} geçit, {_ek_sayisi['bolme']} bölme, "
      f"{len(_MEYDANLAR)} meydan")


# ---------------------------------------------------------------- rölyef
# Eşyükselti bantları yukarıda tanımlanan `yukselti()` alanından çıkarılıyor.
# Izgara, kıyı kayalığını çözebilecek kadar sık: hücre yaklaşık 40 m.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path as MplPath

gx = np.linspace(min(xs) - 300, max(xs) + 300, 470)
gy = np.linspace(min(ys) - 300, max(ys) + 300, 330)
GX, GY = np.meshgrid(gx, gy)

# Deniz tarafını maskele: contour yalnızca karada çalışsın
_kiyi_yol = MplPath(np.array(ada.exterior.coords))
_icinde = _kiyi_yol.contains_points(
    np.column_stack([GX.ravel(), GY.ravel()])
).reshape(GX.shape)

E = yukselti(GX, GY)
E = np.where(_icinde, E, 0.0)

print(f"Alanın en yüksek noktası: {E.max():.0f} m  "
      f"(kayıtta {max(z[3] for z in ZIRVELER)} m)")

# Alçak kotlarda sık, yükseklerde seyrek: kıyı sekisi de okunsun.
BANTLAR = [10, 25, 50, 90, 150, 230, 330, 450, 580, 690]


def path_to_polys(path):
    """matplotlib Path → shapely çokgen listesi (MOVETO ile ayrılmış halkalar,
    yönelime göre kabuk/delik)."""
    verts = path.vertices
    codes = path.codes
    rings = []
    cur = []
    for v, c in zip(verts, codes):
        if c == MplPath.MOVETO:
            if len(cur) >= 3:
                rings.append(cur)
            cur = [tuple(v)]
        elif c == MplPath.CLOSEPOLY:
            if len(cur) >= 3:
                rings.append(cur)
            cur = []
        else:
            cur.append(tuple(v))
    if len(cur) >= 3:
        rings.append(cur)

    shells, holes = [], []
    for r in rings:
        pg = Polygon(r)
        if not pg.is_valid:
            pg = pg.buffer(0)
        if pg.is_empty:
            continue
        # contourf'ta dış halkalar saat yönünün tersi, delikler saat yönünde
        a = 0.0
        for k in range(len(r)):
            x1, y1 = r[k]
            x2, y2 = r[(k + 1) % len(r)]
            a += x1 * y2 - x2 * y1
        (shells if a > 0 else holes).append(pg)

    out = []
    for sh in shells:
        g = sh
        for h in holes:
            if sh.contains(h.representative_point()):
                g = g.difference(h)
        out.append(g)
    return out


bant_geom = []
fig = plt.figure()
for t in BANTLAR:
    cs = plt.contourf(GX, GY, E, levels=[t, 1e6])
    polys = []
    for coll_path in cs.get_paths():
        polys.extend(path_to_polys(coll_path))
    if not polys:
        continue
    g = unary_union(polys).buffer(90).buffer(-90).intersection(ada)
    if g.is_empty:
        continue
    bant_geom.append((t, g))
    plt.clf()
plt.close(fig)
print(f"Yükselti bandı : {len(bant_geom)}")

# ---------------------------------------------------------------- dalga çizgileri
# Eski haritaların "su çizgileri": kıyıdan dışa doğru seyrelen halkalar.
DALGALAR = [170, 400, 700, 1080, 1550]
dalga_geom = []
for i, d in enumerate(DALGALAR):
    ring = ada.buffer(d, join_style=1).exterior.simplify(25)
    dalga_geom.append((i, d, ring))

# ---------------------------------------------------------------- etiketler
# Harita üstünde metin katmanı yok (dışarıdan font çekmemek için); etiketler
# React tarafında bu noktalara yerleştiriliyor.
etiketler = []


def zirveden_kac(x, y, en_az=1500.0):
    """Mahalle adı bir zirve işaretinin üstüne oturmasın diye iter."""
    for _z in ZIRVELER:
        px, py = _z[2]
        dx, dy = x - px, y - py
        d = math.hypot(dx, dy)
        if d < en_az:
            if d < 1e-6:
                dx, dy, d = 1.0, 0.0, 1.0
            x = px + dx / d * en_az
            y = py + dy / d * en_az
    return x, y


for mid, (ad, merkez, geom) in mahalle_geom.items():
    c = geom.centroid
    nokta = c if geom.contains(c) else geom.representative_point()
    lx_, ly_ = zirveden_kac(nokta.x, nokta.y)
    # itilen nokta mahallenin dışına taşarsa geri al
    if not geom.contains(Point(lx_, ly_)):
        lx_, ly_ = nokta.x, nokta.y
    etiketler.append({"id": f"etk_{mid}", "ad": ad.replace(" Mahallesi", ""), "tur": "mahalle",
                      "xy": (lx_, ly_), "wikiId": mid, "oncelik": 1})
for tid, ad, (x, y), rakim in ((z[0], z[1], z[2], z[3]) for z in ZIRVELER):
    etiketler.append({"id": f"etk_{tid}", "ad": ad, "tur": "zirve", "xy": (x, y),
                      "rakim": rakim, "oncelik": 2 if rakim > 300 else 3})
for b in binalar:
    if b["tur"] in ("otel", "fener", "stadyum", "kulüp") and (b["tur"] != "stadyum" or b["wikiId"]):
        c = b["geom"].centroid
        etiketler.append({"id": f"etk_{b['id']}", "ad": b["ad"], "tur": "yapi",
                          "xy": (c.x, c.y), "wikiId": b["wikiId"], "oncelik": 2})
    elif b["wikiId"]:
        # Maddesi olan ama simge yapı olmayanlar: Sade Meyhane, Dondurmacı
        # Kızlar, Belediye, Okul, Pazar. Adları haritada görünmüyordu, o
        # yüzden Kemal koyduğu adları haritada bulamıyordu. "mekan" türü
        # yaklaşınca açılır — kalabalık yapmaz.
        c = b["geom"].centroid
        etiketler.append({"id": f"etk_{b['id']}", "ad": b["ad"], "tur": "mekan",
                          "xy": (c.x, c.y), "wikiId": b["wikiId"], "oncelik": 3})

# Otel yerleşkesindeki ikincil yapılar — yalnızca iyice yaklaşınca görünür
YERLESKE_ETIKET = {
    "bina_imperial_kule_bati", "bina_imperial_kule_dogu", "bina_otel_iskele",
}
_etiketli = {e["id"] for e in etiketler}
for b in binalar:
    # maddesi olan yapı zaten etiketli: ikinci kez yazılmasın (2 Ekim gece)
    if b["id"] in YERLESKE_ETIKET and f"etk_{b['id']}" not in _etiketli:
        c = b["geom"].centroid
        etiketler.append({"id": f"etk_{b['id']}", "ad": b["ad"], "tur": "yerleske",
                          "xy": (c.x, c.y), "wikiId": b["wikiId"], "oncelik": 4})
for z in zemin:
    if z["id"].startswith("zemin_ciftlik_") or not z["ad"]:
        continue                     # arazilerin, avluların, bölmelerin adı yok
    c = z["geom"].centroid
    etiketler.append({"id": f"etk_{z['id']}", "ad": z["ad"], "tur": "yerleske",
                      "xy": (c.x, c.y), "oncelik": 4})
etiketler.append({"id": "etk_deniz", "ad": "Ege Denizi", "tur": "deniz",
                  "xy": (-2000, -9200), "oncelik": 1})
# Su adları kıyıya binmesin diye biraz açığa alındı
etiketler.append({"id": "etk_liman_koy", "ad": "Liman Körfezi", "tur": "su",
                  "xy": kara(154, 1.26), "oncelik": 3})
etiketler.append({"id": "etk_iskele_koy", "ad": "İskele Koyu", "tur": "su",
                  "xy": kara(206, 1.24), "oncelik": 3})
print(f"Etiket         : {len(etiketler)}")

# Plaj kasabaya uzanır (8 Ekim, Kemal: "plajların yaşam alanlarına, özellikle
# İskele Mahallesi'ne uzamasını sağla"; "evler direkt plaj kenarı olabilir,
# evleri kaldırmak zorunda değilsin"). İskele'de bahçe ve duvarların kıyıya
# PLAJ_BANDI metreden yakın kısmı kum şeridine bırakılır; evler yerinde kalır.
# Kum rengi `gen/ada_fiziki.py`'de aynı şeritte.
PLAJ_BANDI = 20.0
_plaj = ada.exterior.buffer(PLAJ_BANDI)
_plaj_kalan = []
for z in zemin:
    if "yer_iskele" in z["id"] and z["tur"] == "bahçe" and z["geom"].intersects(_plaj):
        _k = z["geom"].difference(_plaj)
        _k = max(_parcala(_k), key=lambda p: p.area, default=None) if not _k.is_empty else None
        if _k is None or _k.area < 8:
            continue
        z = {**z, "geom": _k}
    _plaj_kalan.append(z)
_plaj_silinen = len(zemin) - len(_plaj_kalan)
zemin[:] = _plaj_kalan
duvarlar[:] = [(_i, (_g.difference(_plaj) if "yer_iskele" in _i else _g), _e) for _i, _g, _e in duvarlar]
print(f"Plaj (İskele)  : {PLAJ_BANDI:.0f} m kum şeridi, {_plaj_silinen} bahçe tümden kum oldu")

# Liman kumsalı (21 Ekim, yol haritası `liman-plaj`): Liman Mahallesi'nin
# kıyısında aynı PLAJ_BANDI genişliğinde kum şeridi. Taş rıhtımın önü kum
# olmaz: kıyı boyunca RIHTIM_ARA aralığı, liman binaları, mendirek ve iskele
# (etraflarında LIMAN_PAY m) şeritten çıkarılır. Ev, bina ve kimlik değişmez;
# yalnız bahçe ve duvarın kıyıya yakın kısmı kuma kalır. Kum alanın adı boştur.
RIHTIM_ARA = (-110.0, 120.0)     # rıhtımdan kıyı boyunca, m (binalar -68..+84)
LIMAN_PAY = 18.0
_r_ara = LineString([ada.exterior.interpolate(_kiyi_s + RIHTIM_ARA[0] + (RIHTIM_ARA[1] - RIHTIM_ARA[0]) * _i / 40)
                     for _i in range(41)]).buffer(60, cap_style=2)
_r_yapilar = unary_union([b["geom"] for b in binalar
                          if b["mahalle"] == "yer_liman" and b["id"].startswith("bina_liman")]).buffer(LIMAN_PAY)
_rihtim_bolgesi = unary_union([_r_ara, _r_yapilar])
_liman_kum = (_plaj.intersection(mahalle_geom["yer_liman"][2]).intersection(ada)
              .difference(_rihtim_bolgesi))
_liman_kum_parca = [q for q in _parcala(_liman_kum) if q.area > 40]
for _qi, _q in enumerate(_liman_kum_parca):
    zemin.append({"id": "zemin_liman_kum" + ("" if _qi == 0 else f"_{_qi}"), "ad": "",
                  "tur": "kumsal", "geom": _q,
                  "taban": round(float(yukselti(_q.centroid.x, _q.centroid.y)), 1)})
_liman_kum = unary_union(_liman_kum_parca)
_lz = []
_lz_kirpilan = 0
for z in zemin:
    if "yer_liman" in z["id"] and z["tur"] == "bahçe" and z["geom"].intersects(_liman_kum):
        _k = z["geom"].difference(_liman_kum)
        _k = max(_parcala(_k), key=lambda p: p.area, default=None) if not _k.is_empty else None
        if _k is None or _k.area < 8:
            continue
        z = {**z, "geom": _k}
        _lz_kirpilan += 1
    _lz.append(z)
_lz_tumden = len(zemin) - len(_lz)
zemin[:] = _lz
_dv_kirpilan = sum(1 for _i, _g, _e in duvarlar if "yer_liman" in _i and _g.intersects(_liman_kum))
duvarlar[:] = [(_i, (_g.difference(_liman_kum) if "yer_liman" in _i else _g), _e) for _i, _g, _e in duvarlar]
print(f"Plaj (Liman)   : {PLAJ_BANDI:.0f} m kum şeridi, ~{_liman_kum.area / PLAJ_BANDI:.0f} m kıyı boyunca "
      f"({len(_liman_kum_parca)} parça), rıhtım önü kum değil; {_lz_kirpilan} bahçe kırpıldı, "
      f"{_lz_tumden} bahçe tümden kum oldu, {_dv_kirpilan} duvar kırpıldı")

# ---------------------------------------------------------------- GeoJSON
def feature(geom_json, props):
    return {"type": "Feature", "geometry": geom_json, "properties": props}


features = []

features.append(feature(
    {"type": "Polygon", "coordinates": [ring_ll(kiyi)]},
    {"katman": "ada", "ad": "Düzada", "alanKm2": round(ada.area / 1e6, 1)}
))

for mid, (ad, merkez, geom) in mahalle_geom.items():
    features.append(feature(
        {"type": "Polygon", "coordinates": poly_ll(geom)},
        {"katman": "mahalle", "id": mid, "ad": ad, "wikiId": mid,
         "alanKm2": round(geom.area / 1e6, 1)}
    ))

for z in zemin:
    # 6 basamağa yuvarlanınca dar bir bahçenin sınırı kendi üstüne
    # katlanabiliyordu (7 Ekim: 201 bahçe; haritada üst üste binen arsa gibi
    # görünüyordu). Yuvarlanmış hâli bozuksa onarılır, parçaları ayrı yazılır.
    _koord = poly_ll(z["geom"])
    _g = Polygon(_koord[0], _koord[1:])
    _parcalar = [_koord] if _g.is_valid else [
        [[[round(a, R), round(b, R)] for a, b in h] for h in
         [list(q.exterior.coords)] + [list(i.coords) for i in q.interiors]]
        for q in _parcala(_shapely.set_precision(_g.buffer(0), 10 ** -R)) if q.area > 1e-10]
    for _pi, _pk in enumerate(_parcalar):
        features.append(feature(
            {"type": "Polygon", "coordinates": _pk},
            {"katman": "zemin", "id": z["id"] if _pi == 0 else f"{z['id']}_{_pi}", "ad": z["ad"], "tur": z["tur"],
             "taban": z["taban"], **({"ev": z["ev"]} if z.get("ev") else {})}
        ))

# Bahçe duvarları (2 Ekim gece): blok başına tek çizgi öğesi
def _cizgiler(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if hasattr(g, "geoms"):
        return [c for h in g.geoms for c in _cizgiler(h)]
    return []


for _did, _dg, _dev in duvarlar:
    _parca = [[ll(x, y) for x, y in c.coords] for c in _cizgiler(_dg) if c.length > 0.8]
    if _parca:
        features.append(feature({"type": "MultiLineString", "coordinates": _parca},
                                {"katman": "duvar", "id": _did, **({"ev": _dev} if _dev else {})}))

for b in binalar:
    parcalar = b["geom"].geoms if isinstance(b["geom"], MultiPolygon) else [b["geom"]]
    for k, pg in enumerate(parcalar):
        features.append(feature(
            {"type": "Polygon", "coordinates": poly_ll(pg)},
            {"katman": "bina",
             "id": b["id"] if len(parcalar) == 1 else f"{b['id']}_{k}",
             "ad": b["ad"], "wikiId": b["wikiId"],
             "yukseklik": b["yukseklik"], "taban": b["taban"],
             "tur": b["tur"], "mahalle": b["mahalle"], "kat": b["kat"]}
        ))

for tid, ad, (x, y), rakim in ((z[0], z[1], z[2], z[3]) for z in ZIRVELER):
    if not ada.contains(Point(x, y)):
        raise SystemExit(f"HATA: {ad} adanın dışında")
    features.append(feature(
        {"type": "Point", "coordinates": ll(x, y)},
        {"katman": "zirve", "id": tid, "ad": ad, "rakim": rakim}
    ))

# --- idari sınır hatları ---
# Mahalle çokgenlerinin kenarı zaten sınırı çiziyor ama düzenleyicinin
# sürükleyeceği şey çokgen değil, hattın kendisi. Bu yüzden hatlar ayrıca
# yazılıyor: harita onları çizmiyor, `harita-duzenle.html` okuyor.
features.append(feature(
    {"type": "LineString",
     "coordinates": [ll(x, y) for x, y in MAHALLE_CEMBERI + [MAHALLE_CEMBERI[0]]]},
    {"katman": "sinir", "id": "sinir_cember", "ad": "Çember Sınırı",
     "tur": "cember", "kapali": True}
))
for _sid, _ad, _, _ in SINIR_RADYALLERI:
    features.append(feature(
        {"type": "LineString",
         "coordinates": [ll(x, y) for x, y in sinir_geom[_sid]]},
        {"katman": "sinir", "id": _sid, "ad": _ad, "tur": "radyal",
         "kapali": False}
    ))

for yid, ad, noktalar, tur, mahalle in YOLLAR:
    features.append(feature(
        {"type": "LineString", "coordinates": [ll(x, y) for x, y in noktalar]},
        {"katman": "yol", "id": yid, "ad": ad, "tur": tur, "mahalle": mahalle}
    ))

# --- yükselti bantları (alçaktan yükseğe; harita üst üste boyar) ---
for sira, (t, g) in enumerate(bant_geom):
    parcalar = g.geoms if isinstance(g, MultiPolygon) else [g]
    for k, pg in enumerate(parcalar):
        if pg.is_empty or pg.area < 40000:
            continue
        features.append(feature(
            {"type": "Polygon", "coordinates": poly_ll(pg.simplify(30))},
            {"katman": "rolyef", "id": f"rolyef_{t}_{k}", "esik": t, "sira": sira}
        ))

# --- kıyı dalga çizgileri ---
for i, d, ring in dalga_geom:
    features.append(feature(
        {"type": "LineString", "coordinates": ring_ll(list(ring.coords))},
        {"katman": "dalga", "id": f"dalga_{i}", "sira": i, "mesafe": d}
    ))

# --- etiket noktaları ---
for e in etiketler:
    props = {"katman": "etiket", "id": e["id"], "ad": e["ad"], "tur": e["tur"],
             "oncelik": e["oncelik"]}
    if "wikiId" in e:
        props["wikiId"] = e["wikiId"]
    if "rakim" in e:
        props["rakim"] = e["rakim"]
    features.append(feature({"type": "Point", "coordinates": ll(*e["xy"])}, props))

geojson = {"type": "FeatureCollection", "features": features}

# Elle ayarlanmış etiket konumları (uygulamadaki düzenleyiciden). Üretilen
# konumun üstüne yazılır; yoksa her üretimde kaybolurlar.
# (Merkez'in yapıları 8 Ekim'de yeni Merkez'e geçti; eski elle konumları kalktı)
ETIKET_ELLE = {"etk_bina_meyhane": [25.791486, 39.570317]}
for _f in geojson["features"]:
    _eid = _f["properties"].get("id")
    if _eid in ETIKET_ELLE:
        _f["geometry"]["coordinates"] = ETIKET_ELLE[_eid]

ts = f'''import type {{ FeatureCollection }} from 'geojson';

/**
 * Düzada harita geometrisi.
 *
 * Ada kurgusaldır ama gerçek enlem/boylam kullanır: böylece mesafeler,
 * alanlar ve MapLibre'in kamera davranışı doğru çalışır. Ada Ege'de açık
 * suya, {LAT0}°K {LNG0}°D civarına yerleştirilmiştir.
 *
 * Kanon ölçüleri:
 *   alan          {ada.area / 1e6:.1f} km²
 *   doğu-batı     {(max(xs) - min(xs)) / 1000:.1f} km
 *   kuzey-güney   {(max(ys) - min(ys)) / 1000:.1f} km
 *   kıyı          {ada.exterior.length / 1000:.1f} km
 *   zirve         {max(z[3] for z in ZIRVELER)} m ({[z[1] for z in ZIRVELER if z[3] == max(x[3] for x in ZIRVELER)][0]})
 *
 * Katmanlar `properties.katman` ile ayrılır: ada, mahalle, sinir, bina,
 * zirve, yol.
 * Binalarda `wikiId` o yapının wiki maddesine işaret eder — haritada bir
 * binaya tıklandığında bu kimlik kullanılır.
 *
 * Bu dosya üretilmiştir; elle düzenlemek yerine yeni bina/yol eklemek için
 * aşağıdaki diziye kayıt eklemek yeterlidir.
 */

export const DUZADA_MERKEZ: [number, number] = [{LNG0}, {LAT0}];
/**
 * i. dilim hangi mahalle: `SINIR_RADYALLERI[i]` ile `[i+1]` arasında kalan
 * bölgenin kimliği. Sınır düzenleyicisi mahalleleri buna göre boyuyor.
 */
export const DUZADA_DILIM_SIRASI: string[] =
  {json.dumps(DILIM_SIRASI, ensure_ascii=False)};

export const DUZADA_ALAN_KM2 = {ada.area / 1e6:.1f};

// Veri metin olarak duruyor: ~4.000 ev eklenince (29 Eylül gece) TypeScript
// dev nesne değişmezinin türünü çözemiyordu. JSON.parse hem hızlı hem türsüz.
export const DUZADA_GEO: FeatureCollection = JSON.parse({json.dumps(json.dumps(geojson, ensure_ascii=False, separators=(",", ":")), ensure_ascii=False)});
'''

yol = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'duzadaGeo.ts')
open(yol, 'w').write(ts)

# Maddesi olması gereken yapılar (1 Ekim, K-3): Neyin Eksik ve Durum bu kısa
# listeyle sayar; ana sayfa açılırken bütün harita verisi inmesin diye ayrı dosya.
yapilar = []
for f_ in features:
    p_ = f_["properties"]
    if p_.get("katman") != "bina" or not p_.get("wikiId"):
        continue
    if any(y["wikiId"] == p_["wikiId"] for y in yapilar):
        continue  # otelin kuleleri
    g_ = f_["geometry"]
    if g_["type"] == "Point":
        merkez = {"x": g_["coordinates"][0], "y": g_["coordinates"][1]}
    else:
        # haritaMaddesi.ts'teki poligonMerkezi ile aynı: ilk halkanın köşe ortalaması
        halka = g_["coordinates"][0] if g_["type"] == "Polygon" else g_["coordinates"][0][0]
        sx = sy = 0.0
        for k_ in halka:
            sx += k_[0]; sy += k_[1]
        merkez = {"x": sx / len(halka), "y": sy / len(halka)} if halka else None
    yapilar.append({
        "id": p_.get("id"), "wikiId": p_["wikiId"], "ad": str(p_.get("ad") or ""),
        "tur": p_.get("tur"), "mahalle": p_.get("mahalle"), "kat": p_.get("kat"),
        "yukseklik": p_.get("yukseklik"), "taban": p_.get("taban"), "merkez": merkez
    })
ts_yapi = f'''/**
 * Haritada maddesi olması gereken yapılar: `duzadaGeo.ts`'teki binalardan
 * wikiId'si olanlar (künye için gereken özellikleriyle). Bu dosya
 * `gen/duzada.py` ile üretilir; elle düzenlenmez.
 */
export interface HaritaYapisi {{
  id: string; wikiId: string; ad: string; tur: string | null; mahalle: string | null;
  kat: number | null; yukseklik: number | null; taban: number | null;
  merkez: {{ x: number; y: number }} | null;
}}

export const HARITA_YAPILARI: HaritaYapisi[] =
  {json.dumps(yapilar, ensure_ascii=False, indent=2)};
'''
yol_yapi = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'haritaYapilari.ts')
open(yol_yapi, 'w').write(ts_yapi)
print(f"Toplam öğe     : {len(features)}")
print(f"Yazıldı        : {yol}")
