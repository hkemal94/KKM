"""Mahalle 2B haritaları — tek harita 9. adım (22 Kasım 2026, Kemal).

Her mahalle için iki resim (Kemal, 22 Kasım: "ikisi de"):
  A: sade şehir planı (başlık, lejant, künye satırı). Vikide mahalle maddesinde görünür.
  B: poster tabanı (eski seyahat haritası havası). Başlık alanı boş (başlığı Kemal koyar);
     harita dışında yazı yok, yalnız ölçek ve kuzey oku.
İkisinde de sağ üstte (sığmazsa başka köşede) mahallenin en büyük yerleşiminin (kasaba,
köy, meydan) büyütülmüş penceresi.

Kurallar:
  - Yalnız verideki adlar yazılır: adlı yol, vikide maddesi olan yapı (kiremit), zirve,
    mahalle. Adsız yola ve adsız yapıya hiçbir şey yazılmaz; ad uydurulmaz.
  - Yazılar çakışmaz (yazı kutuları ve bağ çizgileri birbirini kesmez).
  - Rakım verinin. Uydurma sayı yok.

Veri: public/harita/ (duzada-zemin.bin, duzada-agaclar.bin, duzada-sinirlar.geojson,
duzada-yollar.geojson, duzada-parseller.geojson, duzada-yapilar.geojson).
Çıktı: public/harita/mahalle-2b/<mahalle-kimliği>-A.png ve -B.png (1600 px genişlik,
256 renk) ve yazilar.json (her resimde yazılan her yazı; denetim bunu okur).

Harita değişince resimler yeniden üretilir:
  python gen/kompakt_mahalle_2b.py              (bütün mahalleler)
  python gen/kompakt_mahalle_2b.py yer_liman    (yalnız biri)
Denetim: python gen/kompakt_mahalle_2b_denetim.py
Gerekir: shapely, numpy, scipy, matplotlib, pillow; Poppins yazı tipi (yoksa uyarır).
"""
import datetime, gzip, io, json, math, os, struct, sys

import numpy as np
import shapely
from shapely.geometry import shape, box, LineString, Polygon, MultiPolygon
from shapely.ops import unary_union, linemerge
from scipy import ndimage
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager, patheffects
from matplotlib.colors import LightSource, to_rgb
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties
from matplotlib.patches import PathPatch, Rectangle, FancyBboxPatch
from matplotlib.patches import Polygon as MPolygon
from matplotlib.path import Path as MPath
from PIL import Image

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERI = os.path.join(KOK, "public", "harita")
CIKTI = os.path.join(VERI, "mahalle-2b")

# ------------------------------------------------------------------ yazı tipi
_poppins = False
for ad in ("Poppins-Regular.ttf", "Poppins-SemiBold.ttf", "Poppins-Bold.ttf"):
    for kl in ("/root/.fonts", os.path.expanduser("~/.fonts"), "/usr/share/fonts/truetype/poppins",
               os.path.join(KOK, "public", "fonts")):
        p = os.path.join(kl, ad)
        if os.path.exists(p):
            font_manager.fontManager.addfont(p)
            _poppins = True
            break
if not _poppins:
    print("UYARI: Poppins bulunamadı; yazılar başka yazı tipiyle çizilir.")
plt.rcParams["font.family"] = "Poppins"

# ------------------------------------------------------------------ marka renkleri
KREM, LACI, KIREMIT, KAGIT = "#F3EFE8", "#0E1C4F", "#F26B6F", "#FAF8F5"
AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim",
         "Kasım", "Aralık"]

GEN_PX = 1600      # resim genişliği
DPI = 200
PX = DPI / 72.0    # bir puntonun piksel karşılığı
S0 = 4.987         # Liman önizlemesinin (Kemal onayladı) m/px ölçeği; ağaç sıklığı buna göre


# ------------------------------------------------------------------ veri
def zemin_oku():
    b = gzip.decompress(open(os.path.join(VERI, "duzada-zemin.bin"), "rb").read())
    assert b[:4] == b"DZZ1"
    n = struct.unpack("<I", b[4:8])[0]
    bas = json.loads(b[8:8 + n])
    h = np.frombuffer(b[8 + n:], dtype="<i2").astype(np.float32).reshape(bas["boy"], bas["en"]) * bas["birim"]
    return bas, h


B, H = zemin_oku()
EN, BOY, HUC, X0, Y0 = B["en"], B["boy"], B["hucre"], B["x0"], B["y0"]
LAT0, LNG0, MLAT, MLNG = B["lat0"], B["lng0"], B["mPerLat"], B["mPerLng"]


def agac_oku():
    b = gzip.decompress(open(os.path.join(VERI, "duzada-agaclar.bin"), "rb").read())
    assert b[:4] == b"DZA1"
    n = struct.unpack("<I", b[4:8])[0]
    bas = json.loads(b[8:8 + n])
    v = b[8 + n:]
    arazi = np.frombuffer(v[:EN * BOY], dtype=np.uint8).reshape(BOY, EN)
    v = v[EN * BOY:]
    a = bas["adet"]

    def u16(k):
        ust = np.frombuffer(v[k:k + a], dtype=np.uint8).astype(np.int32)
        alt = np.frombuffer(v[k + a:k + 2 * a], dtype=np.uint8).astype(np.int32)
        return ust * 256 + alt
    x = bas["x0"] + u16(0) * bas["birim"]
    y = bas["y0"] + u16(2 * a) * bas["birim"]
    tur = np.frombuffer(v[4 * a:5 * a], dtype=np.uint8)
    return bas, arazi, x, y, tur


AB, ARAZI, AX, AY, ATUR = agac_oku()
ARAZI_ID = [a["id"] for a in AB["arazi"]]


def gm(g):
    """GeoJSON geometrisi → metre (x doğu, y kuzey)"""
    return shapely.force_2d(shapely.transform(
        shape(g), lambda a: np.column_stack([(a[:, 0] - LNG0) * MLNG, (a[:, 1] - LAT0) * MLAT])))


def oku(ad):
    return json.load(open(os.path.join(VERI, ad), encoding="utf-8"))["features"]


SINIR = oku("duzada-sinirlar.geojson")
YOLLAR = [(f["properties"], gm(f["geometry"])) for f in oku("duzada-yollar.geojson")]
PARSEL = [(f["properties"], gm(f["geometry"])) for f in oku("duzada-parseller.geojson")]
YAPI = [(f["properties"], gm(f["geometry"])) for f in oku("duzada-yapilar.geojson")]

ADA = next(gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "ada")
MAHALLE = {f["properties"]["id"]: (f["properties"]["ad"], gm(f["geometry"]))
           for f in SINIR if f["properties"]["katman"] == "mahalle"}
ZIRVE = [(f["properties"]["ad"], f["properties"].get("rakim"), gm(f["geometry"]))
         for f in SINIR if f["properties"]["katman"] == "zirve"]
DERE = [gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "dere"]
SINIRLAR = [gm(f["geometry"]) for f in SINIR if f["properties"]["katman"] == "sinir"]
YERLESIMLER = [(f["properties"], gm(f["geometry"])) for f in SINIR if f["properties"]["katman"] == "yerlesim"]

# Verideki bütün adlar (denetim de bunları kullanır)
YOL_ADLARI = {p["ad"] for p, g in YOLLAR if p.get("ad")}
YAPI_ADLARI = {p["ad"] for p, g in YAPI if p.get("ad")}


def viki_yapisi(p):
    """Vikide maddesi olan yapı: veride viki kimliği var (adı da veriden)"""
    return bool(p.get("vikiId")) and bool(p.get("ad"))


# ------------------------------------------------------------------ o an çizilen mahalle
MID = MAH_AD = MAH = None
PENCERE = None      # (cx, cy, w, h) metre: büyütülmüş pencerenin kaynağı
YAZILAR = []        # bu resimde yazılan her yazı: {"tur", "metin"}
SIGMAYAN = []


# ------------------------------------------------------------------ çizim yardımcıları
def poligonlar(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]


def cizgiler(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    out = []
    for p in getattr(g, "geoms", []):
        out += cizgiler(p)
    return out


def poli_yol(p):
    """shapely çokgen → matplotlib yolu (delikler dahil)"""
    kod, nok = [], []
    for halka in [p.exterior] + list(p.interiors):
        c = np.asarray(halka.coords)[:, :2]
        nok.append(c)
        kod += [MPath.MOVETO] + [MPath.LINETO] * (len(c) - 2) + [MPath.CLOSEPOLY]
    return MPath(np.concatenate(nok), kod)


def doldur(ax, g, **kw):
    for p in poligonlar(g):
        ax.add_patch(PathPatch(poli_yol(p), **kw))


def hat(ax, g, **kw):
    for l in cizgiler(g):
        c = np.asarray(l.coords)
        ax.plot(c[:, 0], c[:, 1], solid_capstyle="round", solid_joinstyle="round", **kw)


def buyuk(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def hale(r, w=2.2):
    return [patheffects.withStroke(linewidth=w, foreground=r)]


def tarih_yazisi(t=None):
    t = t or datetime.date.today()
    return f"{t.day} {AYLAR[t.month - 1]} {t.year}"


# ------------------------------------------------------------------ yazı yerleşimi (çakışma denetimi)
class Yerlesim:
    """Piksel kutuları; yazı ve bağ çizgisi birbirini kesmesin"""

    def __init__(self, ax, pay=6):
        self.ax, self.kutular = ax, []
        # eksenin dışı dolu: yazı resmin ya da pencerenin kenarından taşmaz
        (x0, y0), (x1, y1) = ax.transAxes.transform((0, 0)), ax.transAxes.transform((1, 1))
        B_ = 1e5
        self.kutular += [(-B_, -B_, x0 + pay, B_), (x1 - pay, -B_, B_, B_),
                         (-B_, -B_, B_, y0 + pay), (-B_, y1 - pay, B_, B_)]

    def bos(self, kutu):
        x0, y0, x1, y1 = kutu
        return all(x1 < a or x0 > c or y1 < b or y0 > d for a, b, c, d in self.kutular)

    def cizgi_bos(self, p, q):
        """p → q doğru parçası hiçbir kutuyu kesmiyor mu"""
        seg = LineString([p, q])
        return all(not seg.intersects(box(a, b, c, d)) for a, b, c, d in self.kutular)

    def al(self, kutu):
        self.kutular.append(kutu)

    def cizgi_al(self, p, q, kalinlik=2.0):
        n = max(2, int(math.hypot(q[0] - p[0], q[1] - p[1]) / 6))
        for t in np.linspace(0, 1, n):
            x, y = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
            self.kutular.append((x - kalinlik, y - kalinlik, x + kalinlik, y + kalinlik))


def metin_genisligi(s, punto, agirlik="normal"):
    fp = FontProperties(family="Poppins", weight=agirlik)
    return TextPath((0, 0), s, size=punto, prop=fp).get_extents().width


def yol_boyunca(ax, yer, cizgi, s, punto, renk, halo, agirlik="normal", aralik=0.04, zorder=20, sinir_bukum=0.9):
    """Yazıyı çizginin üstüne harf harf dizer. Sığmazsa ya da çakışırsa False."""
    tr = ax.transData
    c = tr.transform(np.asarray(cizgi.coords)[:, :2])            # piksel
    if len(c) < 2:
        return False
    fp = FontProperties(family="Poppins", weight=agirlik)
    gen = [TextPath((0, 0), ch, size=punto, prop=fp).get_extents().width if ch != " " else punto * 0.3 for ch in s]
    adim = [(g + aralik * punto) * PX for g in gen]
    toplam = sum(adim)
    en_iyi = None
    # iki yön de denenir; yazının kendi kesiminde soldan sağa okunan (baş aşağı olmayan) yön alınır
    for c in (c, c[::-1]):
        d = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
        if toplam > d[-1] * 0.9:
            return False
        for t in np.linspace(0.5, 0.15, 6).tolist() + np.linspace(0.55, 0.85, 6).tolist():
            bas = d[-1] * t - toplam / 2
            if bas < 0 or bas + toplam > d[-1]:
                continue
            ss = np.linspace(bas, bas + toplam, 12)
            xs, ys = np.interp(ss, d, c[:, 0]), np.interp(ss, d, c[:, 1])
            if xs[-1] < xs[0]:
                continue        # bu yönde baş aşağı okunur
            acilar = np.unwrap(np.arctan2(np.diff(ys), np.diff(xs)))
            bukum = np.ptp(acilar)
            if bukum > sinir_bukum:
                continue
            # eğik ya da kıvrık yazının kutusu tek büyük dikdörtgen değil, harf boyu küçük kutular
            ss2 = np.linspace(bas, bas + toplam, max(4, int(toplam / (punto * PX * 0.6))))
            xs2, ys2 = np.interp(ss2, d, c[:, 0]), np.interp(ss2, d, c[:, 1])
            r_ = punto * PX * 0.62
            kutu = [(x - r_, y - r_, x + r_, y + r_) for x, y in zip(xs2, ys2)]
            if not all(yer.bos(k) for k in kutu):
                continue
            if en_iyi is None or bukum < en_iyi[0]:
                en_iyi = (bukum, bas, kutu, c, d)
    if en_iyi is None:
        return False
    _, bas, kutu, c, d = en_iyi
    for k in kutu:
        yer.al(k)
    ters = tr.inverted()
    s0 = bas
    for ch, a in zip(s, adim):
        m = s0 + a / 2
        x, y = np.interp(m, d, c[:, 0]), np.interp(m, d, c[:, 1])
        x1, y1 = np.interp(m + 3, d, c[:, 0]), np.interp(m + 3, d, c[:, 1])
        x0_, y0_ = np.interp(m - 3, d, c[:, 0]), np.interp(m - 3, d, c[:, 1])
        aci = math.degrees(math.atan2(y1 - y0_, x1 - x0_))
        r = math.radians(aci)
        kay = -0.36 * punto * PX
        X, Y = ters.transform((x - math.sin(r) * kay, y + math.cos(r) * kay))
        for rk, pe, zo in ((halo, hale(halo, 2.0), zorder), (renk, None, zorder + 0.5)):
            ax.text(X, Y, ch, fontsize=punto, color=rk, rotation=aci, rotation_mode="anchor",
                    ha="center", va="baseline", fontweight=agirlik, path_effects=pe, zorder=zo)
        s0 += a
    return True


def nokta_yazisi(ax, yer, xy, s, punto, renk, halo, agirlik="normal", zorder=22, aday=None, disari=None):
    """Nokta yanına yazı: aday yönlerden ilk boş olanı; yakında yer yoksa uzağa, ince bağ çizgisiyle.
    Bağ çizgisi başka bir yazıyı kesmez."""
    w = metin_genisligi(s, punto, agirlik) * PX
    h = punto * PX * 1.25
    P = ax.transData.transform(xy)
    aday = aday or [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1),
                    (1, 0.5), (-1, 0.5), (1, -0.5), (-1, -0.5)]
    if disari is not None:
        # önce yerleşimin dışına bakan yönler (kalabalık sokakların üstüne değil, boşluğa)
        aday = sorted(aday, key=lambda d: -(d[0] * disari[0] + d[1] * disari[1]) / (math.hypot(*d) or 1))
    pay = 7
    uzaklar = [0] if aday == [(0, 0)] else [0, 14, 30, 48, 70, 95, 125, 160, 200, 240]
    for uz in uzaklar:
        for dx, dy in aday:
            n = math.hypot(dx, dy) or 1
            cx = P[0] + dx * (w / 2 + pay) + dx / n * uz
            cy = P[1] + dy * (h / 2 + pay * 0.6) + dy / n * uz
            kutu = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
            if not yer.bos(kutu):
                continue
            if uz:
                ex = min(max(P[0], kutu[0]), kutu[2]); ey = min(max(P[1], kutu[1]), kutu[3])
                # çizginin ucunu yazının kenarından biraz geri çek: kendi kutusuna değmesin
                L = math.hypot(ex - P[0], ey - P[1]) or 1
                q = (P[0] + (ex - P[0]) * (L - 2) / L, P[1] + (ey - P[1]) * (L - 2) / L)
                bas_ = min(12, L / 2)    # noktanın dibi (kendi yapısının yazısı orada olabilir) sayılmaz
                p0 = (P[0] + (ex - P[0]) * bas_ / L, P[1] + (ey - P[1]) * bas_ / L)
                if not yer.cizgi_bos(p0, q):
                    continue
            yer.al(kutu)
            ters = ax.transData.inverted()
            X, Y = ters.transform((cx, cy))
            ax.text(X, Y, s, fontsize=punto, color=renk, ha="center", va="center", fontweight=agirlik,
                    path_effects=hale(halo, 2.4), zorder=zorder)
            if uz:
                yer.cizgi_al(p0, q)
                (x0, y0), (x1, y1) = ters.transform((P[0], P[1])), ters.transform((ex, ey))
                ax.plot([x0, x1], [y0, y1], color=renk, linewidth=0.4, zorder=zorder - 0.5,
                        path_effects=hale(halo, 1.4))
            return True
    return False


# ------------------------------------------------------------------ ızgara yardımcıları
def kirp(kutu):
    """Izgaradan kutuyu kesen dilim ve onun metre kapsamı"""
    x0, y0, x1, y1 = kutu
    i0 = min(EN - 2, max(0, int((x0 - X0) / HUC) - 2)); i1 = max(i0 + 2, min(EN, int((x1 - X0) / HUC) + 3))
    j0 = min(BOY - 2, max(0, int((y0 - Y0) / HUC) - 2)); j1 = max(j0 + 2, min(BOY, int((y1 - Y0) / HUC) + 3))
    kap = (X0 + i0 * HUC, X0 + (i1 - 1) * HUC, Y0 + j0 * HUC, Y0 + (j1 - 1) * HUC)
    return (slice(j0, j1), slice(i0, i1)), kap


def izgara_xy(dilim):
    js, is_ = dilim
    xs = X0 + np.arange(is_.start, is_.stop) * HUC
    ys = Y0 + np.arange(js.start, js.stop) * HUC
    return np.meshgrid(xs, ys)


# ------------------------------------------------------------------ ölçek ve kuzey
def olcek_cubugu(ax, bx, by, S, renk, halo, punto=6.5, hedef_px=200, yuk_px=13):
    """Ölçek çubuğu; (bx, by) sol alt köşe (metre), S: bir pikselin metresi. Uzunluk yuvarlak."""
    hedef = hedef_px * S
    uz = max([v for v in (50, 100, 200, 250, 500, 1000, 2000) if v <= hedef] or [50])
    yuk = yuk_px * S
    for k in range(4):
        ax.add_patch(Rectangle((bx + k * uz / 4, by), uz / 4, yuk, facecolor=renk if k % 2 == 0 else halo,
                               edgecolor=renk, linewidth=0.6, zorder=30))
    for v in (0, uz / 2, uz):
        etiket = f"{int(v)}" if uz < 1000 else f"{v / 1000:g}"
        ax.text(bx + v, by + yuk * 2.2, etiket, fontsize=punto, color=renk, ha="center", va="bottom",
                path_effects=hale(halo, 2), zorder=30)
    ax.text(bx + uz + 19 * S, by + yuk / 2, "m" if uz < 1000 else "km", fontsize=punto, color=renk,
            ha="left", va="center", path_effects=hale(halo, 2), zorder=30)


def kuzey_oku(ax, xy, boy, renk, halo, punto=8):
    x, y = xy
    g = boy * 0.32
    for noktalar, fc in (([(x, y + boy), (x - g, y), (x, y + boy * 0.28)], renk),
                         ([(x, y + boy), (x + g, y), (x, y + boy * 0.28)], halo)):
        ax.add_patch(MPolygon(noktalar, closed=True, facecolor=fc, edgecolor=renk, linewidth=0.7, zorder=31))
    ax.text(x, y + boy * 1.08, "K", fontsize=punto, color=renk, ha="center", va="bottom", fontweight="semibold",
            path_effects=hale(halo, 2), zorder=31)


# ------------------------------------------------------------------ lejant
KADEME_A = {"ana": 2.1, "ara": 1.45, "sokak": 0.85, "gecit": 0.55, "toprak": 0.7, "patika": 0.5, "merdiven": 0.6}
YOL_SIRA = ["patika", "toprak", "merdiven", "gecit", "sokak", "ara", "ana"]
ALAN_A = {"kumsal": ("#EADBB3", None, None), "maki": ("#E2E4CC", None, None), "tarla": ("#F0E9D4", None, None),
          "zeytinlik": ("#DCE3C3", "....", "#AFBD8C"), "cam": ("#C9D7B6", "xxx", "#9DB38A"),
          "bag": ("#E1E2C2", "||||", "#B9BE8E"), "kayalik": ("#E3DDD2", None, None)}
ALAN_ADI = {"zeytinlik": "Zeytinlik", "maki": "Maki", "tarla": "Tarla", "kumsal": "Kumsal", "cam": "Çam ormanı",
            "bag": "Bağ", "kayalik": "Çıplak kayalık"}
LEJ_SATIR = 41      # px
LEJ_UST = 140       # başlık ve alt başlık için px


def lejant_kalemleri():
    """Mahallede bulunan arazi türleri ve çizgi türleri"""
    k = [("cizgi", "ana", "Ana yol"), ("cizgi", "ara", "Ara yol"), ("cizgi", "sokak", "Sokak"),
         ("cizgi", "gecit", "Geçit"), ("cizgi", "patika", "Patika, toprak yol"),
         ("yapi", None, "Yapı"), ("viki", None, "Vikide maddesi olan yapı (adı yazılı)")]
    dilim, _ = kirp(MAH.bounds)
    X, Y = izgara_xy(dilim)
    icerde = shapely.contains_xy(MAH, X, Y)
    var = set(np.unique(ARAZI[dilim][icerde]).tolist())
    for ad in ("zeytinlik", "maki", "tarla", "cam", "bag", "kayalik", "kumsal"):
        if ARAZI_ID.index(ad) in var:
            k.append(("alan", ALAN_A[ad], ALAN_ADI[ad]))
    k += [("es", None, "Eş yükselti: 20 m, kalın 100 m"), ("sinir", None, "Mahalle sınırı")]
    return k


def lejant_boyutu():
    """A'nın başlık ve lejant bloğu (px): genişlik, yükseklik"""
    baslik = metin_genisligi(" ".join(buyuk(MAH_AD)), 15, "semibold") * PX
    satir = max(metin_genisligi(y, 6.3) for _, _, y in lejant_kalemleri()) * PX + 66 + 18
    return max(baslik, satir) + 10, LEJ_UST + len(lejant_kalemleri()) * LEJ_SATIR


def baslik_ve_lejant(ax, x, y, S):
    """A: (x, y) bloğun sol üstü (metre). Lejant yazıları açıklamadır, ad değil."""
    ax.text(x, y, " ".join(buyuk(MAH_AD)), fontsize=15, color=LACI, fontweight="semibold", ha="left", va="top",
            zorder=45)
    ax.text(x, y - 66 * S, "Düzada", fontsize=8.5, color=LACI, ha="left", va="top", alpha=0.8, zorder=45)
    YAZILAR.append({"tur": "baslik", "metin": MAH_AD})
    for n, (tur, v, yazi) in enumerate(lejant_kalemleri()):
        yy = y - (LEJ_UST + 10 + n * LEJ_SATIR) * S
        a0, a1 = x + 2 * S, x + 66 * S
        if tur == "cizgi":
            if v == "ana":
                ax.plot([a0, a1], [yy, yy], color=LACI, linewidth=3.1, zorder=45, solid_capstyle="butt")
                ax.plot([a0, a1], [yy, yy], color="#FFFFFF", linewidth=1.45, zorder=45.1, solid_capstyle="butt")
            elif v == "patika":
                ax.plot([a0, a1], [yy, yy], color=LACI, linewidth=0.6, linestyle=(0, (2.5, 1.6)), zorder=45)
            else:
                ax.plot([a0, a1], [yy, yy], color=LACI, linewidth=KADEME_A[v], zorder=45, solid_capstyle="butt")
        elif tur in ("yapi", "viki"):
            ax.add_patch(Rectangle((a0 + 22 * S, yy - 11 * S), 22 * S, 22 * S,
                                   facecolor="#3B4566" if tur == "yapi" else KIREMIT,
                                   edgecolor="none" if tur == "yapi" else LACI, linewidth=0.3, zorder=45))
        elif tur == "alan":
            fc, ht, hc = v
            if ht:
                plt.rcParams["hatch.linewidth"] = 0.35
                plt.rcParams["hatch.color"] = hc
            ax.add_patch(Rectangle((a0, yy - 15 * S), a1 - a0, 30 * S, facecolor=fc, edgecolor=LACI, linewidth=0.3,
                                   hatch=ht, zorder=45))
        elif tur == "es":
            ax.plot([a0, a1], [yy - 8 * S, yy - 8 * S], color=LACI, linewidth=0.22, alpha=0.5, zorder=45)
            ax.plot([a0, a1], [yy + 8 * S, yy + 8 * S], color=LACI, linewidth=0.5, alpha=0.6, zorder=45)
        elif tur == "sinir":
            ax.plot([a0, a1], [yy, yy], color=KAGIT, linewidth=2.6, zorder=45)
            ax.plot([a0, a1], [yy, yy], color=LACI, linewidth=0.9, linestyle=(0, (4, 2, 1, 2)), zorder=45.1)
        ax.text(a1 + 18 * S, yy, yazi, fontsize=6.3, color=LACI, va="center", ha="left", zorder=45)
        YAZILAR.append({"tur": "lejant", "metin": yazi})


# ------------------------------------------------------------------ büyütülmüş pencere
def pencere_kaynagi():
    """Mahallenin en büyük yerleşimi (en çok yapı; eşitse yarıçap): merkezi ve pencere ölçüsü (metre)"""
    adaylar = []
    for p, g in YERLESIMLER:
        if p.get("mahalle") != MID:
            continue
        yapilar = [yg.centroid for yp, yg in YAPI if yp.get("yerlesim") == p["id"] and yp.get("katman") == "yapi"]
        adaylar.append((len(yapilar), p.get("yaricapM") or 0, p, g, yapilar))
    if not adaylar:
        return None
    adet, r, p, g, yapilar = max(adaylar, key=lambda a: (a[0], a[1]))
    if yapilar:
        xy = np.array([(c.x, c.y) for c in yapilar])
        cx, cy = np.median(xy[:, 0]), np.median(xy[:, 1])
        uz = np.hypot(xy[:, 0] - cx, xy[:, 1] - cy)
        r_eff = float(np.percentile(uz, 95)) + 70
    else:
        cx, cy, r_eff = g.x, g.y, r
    w = max(900.0, 2.35 * r_eff)
    # vikide maddesi olan yapılar pencerenin kenarına sıkışmasın: pencere biraz onlara doğru kayar (adlarına yer)
    viki = [g.centroid for yp, g in YAPI if viki_yapisi(yp) and yp.get("yerlesim") == p["id"]]
    if viki:
        vx, vy = np.mean([c.x for c in viki]), np.mean([c.y for c in viki])
        cx, cy = cx + 0.4 * (vx - cx), cy + 0.4 * (vy - cy)
    if yapilar:
        # yerleşimin yapıları (uçtaki birkaçı dışında) pencerenin içinde kalır
        bx0, bx1 = np.percentile(xy[:, 0], [2, 98]); by0, by1 = np.percentile(xy[:, 1], [2, 98])
        w = max(w, bx1 - bx0 + 160, (by1 - by0 + 160) / 0.784)
        h = w * 0.784
        cx = min(max(cx, bx1 + 80 - w / 2), bx0 - 80 + w / 2)
        cy = min(max(cy, by1 + 80 - h / 2), by0 - 80 + h / 2)
    return (float(cx), float(cy), float(w), float(w) * 0.784, p["id"])


IW_PX = 672         # pencerenin resimdeki genişliği
KENAR_PX = 36       # resim kenarından boşluk
OK_BLOK = (270, 240)    # ölçek + kuzey bloğu (px)


def plan_kur():
    """Resmin kapsamını ve pencere, lejant, ölçek bloklarının yerini bulur.
    Bloklar mahalleye ve pencerenin kaynağına binmez; gerekirse resim kuzeye ya da güneye uzar."""
    x0, y0, x1, y1 = MAH.bounds
    pad_px = 52
    W = (x1 - x0) / (1 - 2 * pad_px / GEN_PX)
    S = W / GEN_PX
    ex0, ex1 = x0 - pad_px * S, x1 + pad_px * S
    cx, cy, pw, ph, _ = PENCERE
    pkutu = box(cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2)
    engel = unary_union([MAH, pkutu]).buffer(10 * S)
    IH_PX = IW_PX * ph / pw
    lw, lh = lejant_boyutu()

    def rect(kose, wpx, hpx, ust, alt, dx=0):
        """kose: 'su' sağ üst, 'so' sol üst, 'sa' sağ alt, 'oa' sol alt → metre kutusu"""
        if kose[0] == "s" and kose != "so":
            xa = ex1 - (KENAR_PX + dx) * S - wpx * S
        else:
            xa = ex0 + (KENAR_PX + dx) * S
        if kose in ("su", "so"):
            ya = ust - KENAR_PX * S - hpx * S
        else:
            ya = alt + KENAR_PX * S
        return box(xa, ya, xa + wpx * S, ya + hpx * S)

    # pencere hep sağ üstte (Kemal, 22 Kasım: "sağ üstteki pencere kalsın"); gerekirse resim kuzeye uzar.
    # Lejant (B'de başlık alanı): önce sol üst, yoksa sol kenarda yukarıdan aşağı boş bir yer; bulunamazsa
    # resim biraz daha kuzeye uzar (en çok 800 px); yine olmazsa resim güneye uzar, lejant sol alta gelir.
    alt = y0 - pad_px * S

    def lejant_yeri(ust, pr):
        adaylar = [rect("so", lw, lh, ust, alt, dx=24)]
        yy = ust - KENAR_PX * S - lh * S
        while yy > alt + KENAR_PX * S:
            adaylar.append(box(ex0 + (KENAR_PX + 24) * S, yy, ex0 + (KENAR_PX + 24 + lw) * S, yy + lh * S))
            yy -= 20 * S
        for a in adaylar:
            if not a.intersects(engel) and not a.intersects(pr):
                return a
        return None

    D = 0
    while rect("su", IW_PX, IH_PX, y1 + pad_px * S + D * S, alt).intersects(engel):
        D += 20
    D_pencere, lr, taraf = D, None, "ust"
    while D <= D_pencere + 800:
        ust = y1 + pad_px * S + D * S
        pr = rect("su", IW_PX, IH_PX, ust, alt)
        lr = lejant_yeri(ust, pr)
        if lr is not None:
            break
        D += 20
    if lr is None:
        D = D_pencere
        ust = y1 + pad_px * S + D * S
        pr = rect("su", IW_PX, IH_PX, ust, alt)
        alt -= (lh + KENAR_PX) * S
        lr = rect("oa", lw, lh, ust, alt, dx=24)
        taraf = "ust+alt"

    # ölçek ve kuzey bloğu: kalan boş yerde, önce sol kenar (aşağıdan yukarı), sonra sağ kenar, sonra alt
    bw, bh = OK_BLOK
    kunye = box(ex1 - 420 * S, alt, ex1, alt + 60 * S)
    kb_ = box(ex0, alt, ex1, y1 + pad_px * S + D * S)
    komsu_yapilar = [g.buffer(40) for p_, g in YAPI if g.intersects(kb_)]     # komşu köyün üstüne de binmez
    dolu = unary_union([engel, pr, lr, kunye] + komsu_yapilar)

    def blok_ara(alt_, ust_):
        adaylar = []
        for xa in (ex0 + KENAR_PX * S, ex1 - (KENAR_PX + bw) * S):
            y = alt_ + KENAR_PX * S
            while y + bh * S < ust_ - KENAR_PX * S:
                adaylar.append(box(xa, y, xa + bw * S, y + bh * S))
                y += 20 * S
        x = ex0 + KENAR_PX * S
        while x + bw * S < ex1:
            adaylar.append(box(x, alt_ + KENAR_PX * S, x + bw * S, alt_ + (KENAR_PX + bh) * S))
            x += 20 * S
        for a in adaylar:
            if not a.intersects(dolu):
                return a
        return None

    ok = blok_ara(alt, ust)
    if ok is None:          # yer yoksa resim güneye uzar
        alt -= (bh + KENAR_PX) * S
        ok = box(ex0 + KENAR_PX * S, alt + KENAR_PX * S, ex0 + (KENAR_PX + bw) * S, alt + (KENAR_PX + bh) * S)
    kutu = (ex0, alt, ex1, ust)
    return dict(kutu=kutu, S=S, pencere=pr, lejant=lr, ok=ok, taraf=taraf, D=D)


# ------------------------------------------------------------------ katmanlar
def yollar_kutuda(kutu):
    k = box(*kutu)
    return [(p, g) for p, g in YOLLAR if p["katman"] == "yol" and g.intersects(k)]


def yapilar_kutuda(kutu):
    k = box(*kutu)
    return [(p, g) for p, g in YAPI if g.intersects(k)]


def arazi_maskesi(dilim, ad, sigma=1.0):
    k = ARAZI_ID.index(ad)
    m = (ARAZI[dilim] == k).astype(float)
    return ndimage.gaussian_filter(m, sigma) if sigma else m


ZEY = "#6F7C3E"


def harita_katmanlari(ax, kutu, A, kara, deniz, ana=True, olcek_m_px=5.0):
    """olcek_m_px: bir pikselin metre karşılığı (ayrıntıda yol gerçek genişliğiyle çizilir)"""
    dilim, kap = kirp(kutu)
    z = H[dilim]
    X, Y = izgara_xy(dilim)
    ada_k = ADA.intersection(box(*kutu).buffer(50))
    kat = olcek_m_px / S0 if ana else 1.0

    # deniz: kıyıdan uzaklaşan ince dalga çizgileri (B) ya da derinlik tonu (A)
    if A:
        derin = np.clip(-z, 0, 40)
        ax.contourf(X, Y, ndimage.gaussian_filter(derin, 4), levels=[-1, 6, 18], colors=["#D2E3EA", "#C7DCE4"],
                    zorder=1)
    else:
        ad = (22, 50, 85, 130, 185, 250, 330, 420) if ana else (8, 18, 31, 47, 66, 88, 113, 141)
        for i, d in enumerate(ad):
            d = d * kat
            r = d * 0.6          # köşeleri yuvarlat (iç bükey koyda dalga çizgisi kırılmasın)
            dalga = ADA.buffer(d + r, quad_segs=16).buffer(-r, quad_segs=16)
            hat(ax, dalga.simplify(4 if ana else 0.8).boundary.intersection(box(*kutu)), color=LACI,
                linewidth=0.42, alpha=max(0.06, 0.42 - i * 0.05), zorder=1)

    # kara
    doldur(ax, ada_k, facecolor=kara, edgecolor="none", zorder=2)

    # tepe gölgesi (B)
    if not A:
        ls = LightSource(azdeg=315, altdeg=40)
        zk = np.where(z > 0, z, 0)
        hs = ls.hillshade(ndimage.gaussian_filter(zk, 0.8), vert_exag=2.2, dx=HUC, dy=HUC)
        golge = np.clip((0.72 - hs) / 0.72, 0, 1) ** 1.1
        rgba = np.zeros(z.shape + (4,))
        rgba[..., :3] = to_rgb(LACI)
        rgba[..., 3] = golge * 0.42 * (z > 0)
        isik = np.clip((hs - 0.78) / 0.22, 0, 1)
        rgba2 = np.ones(z.shape + (4,)); rgba2[..., 3] = isik * 0.35 * (z > 0)
        ext = (kap[0] - HUC / 2, kap[1] + HUC / 2, kap[2] - HUC / 2, kap[3] + HUC / 2)
        kirpma = MPath.make_compound_path(*[poli_yol(p) for p in poligonlar(ada_k)])
        for r_ in (rgba, rgba2):
            im = ax.imshow(r_, origin="lower", extent=ext, interpolation="bilinear", zorder=4)
            im.set_clip_path(PathPatch(kirpma, transform=ax.transData))
        ax.set_xlim(kutu[0], kutu[2]); ax.set_ylim(kutu[1], kutu[3])

    # arazi: kumsal, zeytinlik, çam, maki, bağ
    if A:
        sitil = ALAN_A
    else:
        sitil = {"kumsal": ("#F3E6C4", "....", "#D2BC88"), "zeytinlik": ("#DCD6AE", None, None),
                 "cam": ("#C9C79C", None, None), "bag": ("#DCD6AE", "||", ZEY)}
    for ad, (fc, ht, hc) in sitil.items():
        m = arazi_maskesi(dilim, ad, 1.1)
        if m.max() < 0.5:
            continue
        ax.contourf(X, Y, m, levels=[0.5, 2], colors=[fc], zorder=3)
        if ht:
            plt.rcParams["hatch.linewidth"] = 0.35
            plt.rcParams["hatch.color"] = hc
            cs2 = ax.contourf(X, Y, m, levels=[0.5, 2], colors="none", hatches=[ht], zorder=3.2)
            for c in getattr(cs2, "collections", [cs2]):
                c.set_edgecolor(hc); c.set_linewidth(0)

    # poster: ağaç simgeleri (seyrek; gerçek alanın üstüne, sayı değil doku)
    if not A:
        rng = np.random.default_rng(7)
        for ad, aralik, boy, renk in (("zeytinlik", 62 * kat if ana else 26, 2.3 if ana else 2.6, ZEY),
                                      ("maki", 95 * kat if ana else 40, 1.2 if ana else 1.5, "#9AA06A"),
                                      ("cam", 50 * kat if ana else 22, 2.6, "#56603A")):
            m = arazi_maskesi(dilim, ad, 0.8)
            gx = np.arange(kutu[0], kutu[2], aralik); gy = np.arange(kutu[1], kutu[3], aralik * 0.87)
            PXg, PYg = np.meshgrid(gx, gy)
            PXg = PXg + (np.arange(len(gy))[:, None] % 2) * aralik / 2 + rng.uniform(-0.2, 0.2, PXg.shape) * aralik
            PYg = PYg + rng.uniform(-0.2, 0.2, PYg.shape) * aralik
            ii = np.clip(((PXg - kap[0]) / HUC).round().astype(int), 0, m.shape[1] - 1)
            jj = np.clip(((PYg - kap[2]) / HUC).round().astype(int), 0, m.shape[0] - 1)
            icerde = (PXg >= kap[0]) & (PXg <= kap[1]) & (PYg >= kap[2]) & (PYg <= kap[3])
            k = (m[jj, ii] > 0.6) & icerde
            ax.scatter(PXg[k], PYg[k], s=boy ** 2, facecolor="none" if ad == "zeytinlik" else renk,
                       edgecolor=renk, linewidths=0.45, zorder=3.4)
            if ad == "zeytinlik":
                ax.scatter(PXg[k] + aralik * 0.06, PYg[k] - aralik * 0.06, s=(boy * 0.35) ** 2, c=renk,
                           linewidths=0, zorder=3.4)

    # eş yükselti
    zs = ndimage.gaussian_filter(np.where(z > 0, z, -5), 1.6)
    if A:
        ax.contour(X, Y, zs, levels=np.arange(20, 800, 20), colors=LACI, linewidths=0.22, alpha=0.28, zorder=5)
        ax.contour(X, Y, zs, levels=np.arange(100, 800, 100), colors=LACI, linewidths=0.45, alpha=0.38, zorder=5)
    else:
        ax.contour(X, Y, zs, levels=np.arange(50, 800, 50), colors="#6B5E3E", linewidths=0.25, alpha=0.30, zorder=5)

    # dereler
    for d in DERE:
        hat(ax, d.intersection(box(*kutu)), color="#7FA8BE" if A else LACI, linewidth=0.5,
            alpha=0.8 if A else 0.35, zorder=5.5)

    # kıyı çizgisi
    if A:
        hat(ax, ADA.boundary.intersection(box(*kutu)), color=LACI, linewidth=0.7, alpha=0.75, zorder=7)
    else:
        hat(ax, ADA.boundary.intersection(box(*kutu)), color=LACI, linewidth=1.9, zorder=7)
        hat(ax, ADA.buffer(-14).boundary.intersection(box(*kutu)), color=LACI, linewidth=0.4, alpha=0.6, zorder=7)

    # parseller (yalnız A, çok ince, yalnız bu mahallenin)
    if A:
        k = box(*kutu)
        for p, g in PARSEL:
            if p.get("mahalle") == MID and p.get("katman") == "parsel" and g.intersects(k):
                doldur(ax, g, facecolor="none", edgecolor=LACI, linewidth=0.12, alpha=0.35, zorder=8)

    # yollar
    yl = yollar_kutuda(kutu)
    for kd in YOL_SIRA:
        for p, g in yl:
            if p.get("kademe") != kd:
                continue
            w = KADEME_A.get(kd, 0.6) if ana else max(0.35, (p.get("genislik") or 3) / olcek_m_px * 72 / DPI)
            stil = dict(color=LACI, linewidth=w, zorder=9 + YOL_SIRA.index(kd) * 0.1)
            if kd in ("toprak", "patika"):
                stil.update(linestyle=(0, (2.5, 1.6)) if kd == "toprak" else (0, (1, 1.4)), linewidth=w * 0.9)
            if kd == "merdiven":
                stil.update(linestyle=(0, (0.6, 0.6)), linewidth=w * 2.2)
            if kd in ("ana", "ara") and not A:
                # poster: ana yol çift çizgi (lacivert kenar, krem iç)
                hat(ax, g, color=LACI, linewidth=w * 1.6, zorder=9 + YOL_SIRA.index(kd) * 0.1)
                hat(ax, g, color=KREM, linewidth=w * 0.75, zorder=9.05 + YOL_SIRA.index(kd) * 0.1)
                continue
            if kd == "ana" and A:
                hat(ax, g, color=LACI, linewidth=w * 1.5, zorder=9 + 0.6)
                hat(ax, g, color="#FFFFFF", linewidth=w * 0.7, zorder=9.65)
                continue
            hat(ax, g, **stil)
    # poster: adanın sahil yolu ince kiremit iç çizgi (az kiremit)
    if not A:
        for p, g in yl:
            if p.get("ad") == "Sahil Yolu":
                hat(ax, g, color=KIREMIT, linewidth=KADEME_A["ana"] * 0.55, zorder=9.9)
    # meydancık
    for p, g in YOLLAR:
        if p["katman"] == "meydancik" and g.intersects(box(*kutu)):
            doldur(ax, g, facecolor=(KAGIT if A else "#EDE4CF"), edgecolor=LACI, linewidth=0.3, zorder=8.5)

    # yapılar (vikide maddesi olan kiremit)
    for p, g in yapilar_kutuda(kutu):
        kt = p["katman"]
        if kt == "mendirek":
            doldur(ax, g, facecolor="#9C9C9C" if A else LACI, edgecolor=LACI, linewidth=0.4, zorder=10)
        elif kt == "iskele":
            doldur(ax, g, facecolor="#B8956A" if A else KREM, edgecolor=LACI, linewidth=0.4, zorder=10)
        elif p.get("hat"):
            # asıl çizgisi olan yapı (ör. halka biçimli kalıntı duvarı, 23 Kasım): taban kutusu değil, çizgisi kesik çizgiyle
            hat(ax, gm({"type": "LineString", "coordinates": p["hat"]}), color="#3B4566" if A else LACI, linewidth=1.1, linestyle=(0, (2.2, 1.4)), zorder=11)
        else:
            fc = KIREMIT if viki_yapisi(p) else ("#3B4566" if A else LACI)
            doldur(ax, g, facecolor=fc, edgecolor=LACI if not A else "none", linewidth=0.25, zorder=11)

    # ağaçlar: yalnız ayrıntı penceresinde nokta nokta
    if not ana:
        k = (AX > kutu[0]) & (AX < kutu[2]) & (AY > kutu[1]) & (AY < kutu[3])
        renk = "#8FA36E" if A else "#5F6B3A"
        ax.scatter(AX[k], AY[k], s=0.9 if A else 1.0, c=renk, linewidths=0, alpha=0.75, zorder=8.8)

    # komşu mahalleler soluk (yolları ve yapılarıyla)
    disari = ada_k.difference(MAH)
    doldur(ax, disari, facecolor=(KAGIT if A else KREM), edgecolor="none", alpha=0.62 if A else 0.66, zorder=11.5)

    # mahalle sınırı
    for s in SINIRLAR:
        g = s.intersection(box(*kutu))
        if g.is_empty or not g.buffer(30).intersects(MAH.boundary):
            continue
        hat(ax, g, color=KREM if not A else KAGIT, linewidth=2.6, zorder=12)
        hat(ax, g, color=LACI, linewidth=0.9, linestyle=(0, (4, 2, 1, 2)), zorder=12.1)


def yazilar(ax, yer, kutu, A, ana=True, S=5.0):
    """Yalnız verideki adlar yazılır: adlı yol, viki bağlı yapı (ad), zirve, mahalle. Adsıza yazı yok."""
    halo = KAGIT if A else KREM
    kb = box(*kutu)
    ic = kb.buffer(-15 * (S if ana else 1))
    kat = S / S0 if ana else 1.0
    cx, cy, pw, ph, _ = PENCERE
    pkutu = box(cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2)
    yer_ad = "ana" if ana else "pencere"
    gec = []        # yola oturmayan adlı yollar: en sonda düz yazı

    def adli_yollar():
        # 1) adlı yollar
        adli_yol = {}
        for p, g in yollar_kutuda(kutu):
            if p.get("ad"):
                adli_yol.setdefault(p["ad"], []).append(g)
        for ad, gs in adli_yol.items():
            if ana and not any(x.intersects(MAH) for x in gs):
                continue        # ana haritada yalnız bu mahallenin yolları
            if ana and all(x.within(pkutu.buffer(150)) for x in gs):
                continue        # yerleşimin içindeki yol ayrıntı penceresinde yazılır
            u = unary_union(gs)
            g = linemerge(u) if not isinstance(u, LineString) else u
            alan = MAH.buffer(40).intersection(ic) if ana else ic
            parcalar = sorted(cizgiler(g.intersection(alan)), key=lambda l: -l.length)
            hedef = 2 if (ana and ad == "Sahil Yolu" and sum(l.length for l in parcalar) > 1800 * kat * 2) else 1
            konan = 0
            for l in parcalar:
                l = l.simplify(6 * kat if ana else 2)
                if yol_boyunca(ax, yer, l, ad, 6.2 if ana else 6.8, LACI, halo, "semibold" if A else "normal",
                               sinir_bukum=0.9 if ana else 1.6):
                    konan += 1
                    YAZILAR.append({"tur": "yol", "metin": ad, "yer": yer_ad})
                if konan >= hedef:
                    break
            if konan == 0 and parcalar:
                gec.append((ad, parcalar[0]))

    def adli_yapilar():
        # 2) vikide maddesi olan yapılar (verideki ad)
        adli = [(p, g) for p, g in yapilar_kutuda(kutu) if viki_yapisi(p) and p.get("mahalle") == MID]
        adli.sort(key=lambda a: -a[1].centroid.y)
        goruldu = set()
        for p, g in adli:
            if p["ad"] in goruldu:
                continue        # aynı maddeye bağlı birden çok kütle: bir kez yazılır
            c = g.centroid
            if ana and c.within(pkutu):
                continue        # pencerede yazılır
            if not ana and not c.within(ic):
                continue
            goruldu.add(p["ad"])
            v = (c.x - cx, c.y - cy)
            if nokta_yazisi(ax, yer, (c.x, c.y), p["ad"], 6.3 if ana else 6.6, LACI, halo, "semibold",
                            disari=None if ana else v):
                YAZILAR.append({"tur": "yapi", "metin": p["ad"], "yer": yer_ad})
            else:
                SIGMAYAN.append(f"{yer_ad}: {p['ad']}")

    # önce yollar (yol adı yola oturur), sonra yapılar: kuzeyden güneye, yerleşimin dışına doğru;
    # yer yoksa uzağa, bağ çizgisiyle (bağ çizgisi hiçbir yazıyı kesmez)
    adli_yollar()
    adli_yapilar()

    # 3) zirveler (yalnız bu mahalledeki; rakım verinin)
    if ana:
        for ad, rakim, g in ZIRVE:
            if not g.within(MAH) or not g.within(kb):
                continue
            ax.plot(g.x, g.y, marker="^", markersize=4.5, color=LACI if A else KIREMIT, markeredgecolor=LACI,
                    markeredgewidth=0.5, zorder=21)
            s = f"{ad}  {rakim} m" if rakim is not None else ad
            if nokta_yazisi(ax, yer, (g.x, g.y), s, 6.0, LACI, halo, "normal",
                            aday=[(1, 0), (-1, 0), (1, 1), (-1, 1), (0, 1), (0, -1), (1, -1), (-1, -1)]):
                YAZILAR.append({"tur": "zirve", "metin": ad, "rakim": rakim, "yer": yer_ad})
            else:
                SIGMAYAN.append(f"{yer_ad}: {s}")

    # 4) yola sığmayan adlı yollar: yanına düz, küçük
    for ad, l in gec:
        m = l.interpolate(0.5, normalized=True)
        if nokta_yazisi(ax, yer, (m.x, m.y), ad, 5.6, LACI, halo, "normal"):
            YAZILAR.append({"tur": "yol", "metin": ad, "yer": yer_ad})
        else:
            SIGMAYAN.append(f"{yer_ad}: {ad}")

    # 5) komşu mahalle adları (soluk; yapılardan uzak noktaya)
    if ana:
        yapi_alani = unary_union([g.buffer(220 * kat) for p, g in yapilar_kutuda(kutu)])
        for mid, (ad, g) in MAHALLE.items():
            if mid == MID:
                continue        # A'da başlıkta, B'de başlık Kemal'in alanı
            gk = g.intersection(kb.buffer(-200 * kat))
            if gk.is_empty or gk.area < 6e5 * kat * kat:
                continue
            bos = gk.difference(yapi_alani).buffer(-150 * kat)
            rp = (bos if not bos.is_empty else gk).representative_point()
            if nokta_yazisi(ax, yer, (rp.x, rp.y), buyuk(ad), 6.5, "#5A6385", halo, "normal", aday=[(0, 0)]):
                YAZILAR.append({"tur": "mahalle", "metin": ad, "yer": yer_ad})


def kasaba_penceresi(fig, ax, plan, A, kara, deniz, yer_ana):
    """Yerleşimin büyütülmüş hâli: planın seçtiği köşede"""
    cx, cy, w, h, _ = PENCERE
    ik = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    kutu = plan["kutu"]
    gen = kutu[2] - kutu[0]; yuk = kutu[3] - kutu[1]
    px0, py0, px1, py1 = plan["pencere"].bounds
    ex, ey = (px0 - kutu[0]) / gen, (py0 - kutu[1]) / yuk
    ew, eh = (px1 - px0) / gen, (py1 - py0) / yuk
    m_px = w / IW_PX
    axi = fig.add_axes([ex, ey, ew, eh])
    axi.set_xlim(ik[0], ik[2]); axi.set_ylim(ik[1], ik[3]); axi.set_aspect("equal"); axi.axis("off")
    axi.set_facecolor(deniz)
    axi.add_patch(Rectangle((0, 0), 1, 1, transform=axi.transAxes, facecolor=deniz, edgecolor="none", zorder=0))
    harita_katmanlari(axi, ik, A, kara, deniz, ana=False, olcek_m_px=m_px)
    axi.set_xlim(ik[0], ik[2]); axi.set_ylim(ik[1], ik[3])
    yi = Yerlesim(axi)
    # pencerenin ölçeği sol üstte: yeri önce ayrılır
    sol_ust = axi.transAxes.transform((0, 1))
    yi.al((sol_ust[0], sol_ust[1] - 72, sol_ust[0] + 210, sol_ust[1]))
    yazilar(axi, yi, ik, A, ana=False)
    axi.add_patch(Rectangle((0, 0), 1, 1, transform=axi.transAxes, fill=False, edgecolor=LACI, linewidth=1.3, zorder=50))
    olcek_cubugu(axi, ik[0] + 24 * m_px, ik[3] - 52 * m_px, m_px, LACI, KREM, punto=5.5, hedef_px=140, yuk_px=6)
    # ana haritada pencerenin kapsadığı alan
    ax.add_patch(Rectangle((ik[0], ik[1]), w, h, fill=False, edgecolor=LACI, linewidth=0.8,
                           linestyle=(0, (3, 2)), zorder=25))
    return axi


def piksel_kutusu(ax, g):
    x0, y0, x1, y1 = g.bounds
    P0 = ax.transData.transform((x0, y0)); P1 = ax.transData.transform((x1, y1))
    return (P0[0], P0[1], P1[0], P1[1])


def ciz(gorunus, dosya):
    A = gorunus == "A"
    YAZILAR.clear()
    plan = PLAN
    kutu, S = plan["kutu"], plan["S"]
    boy_px = int(round((kutu[3] - kutu[1]) / S))
    fig = plt.figure(figsize=(GEN_PX / DPI, boy_px / DPI), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(kutu[0], kutu[2]); ax.set_ylim(kutu[1], kutu[3])
    ax.set_aspect("auto"); ax.axis("off")
    yer = Yerlesim(ax)

    deniz = "#BDD5DF" if A else KREM
    kara = KREM if A else "#EADFC6"
    fig.patch.set_facecolor(deniz)
    ax.set_facecolor(deniz)
    harita_katmanlari(ax, kutu, A, kara, deniz, ana=True, olcek_m_px=S)
    ax.set_xlim(kutu[0], kutu[2]); ax.set_ylim(kutu[1], kutu[3])

    # bloklar yazı almaz: pencere, lejant (B'de başlık alanı), ölçek ve kuzey, künye satırı
    for g in (plan["pencere"], plan["lejant"], plan["ok"]):
        yer.al(piksel_kutusu(ax, g))
    kunye = f"Düzada · tek harita, {tarih_yazisi()}"
    if A:
        kw = metin_genisligi(kunye, 5.5) * PX
        yer.al((GEN_PX - 24 - kw - 6, 0, GEN_PX, 24 + 5.5 * PX * 1.4))
    else:
        # B'nin çift çerçevesi: kenara yazı binmesin
        yer.al((0, 0, GEN_PX, 40)); yer.al((0, boy_px - 40, GEN_PX, boy_px))
        yer.al((0, 0, 40, boy_px)); yer.al((GEN_PX - 40, 0, GEN_PX, boy_px))

    kasaba_penceresi(fig, ax, plan, A, kara, deniz, yer)
    yazilar(ax, yer, kutu, A, ana=True, S=S)

    # ölçek ve kuzey
    bx0, by0, bx1, by1 = plan["ok"].bounds
    olcek_cubugu(ax, bx0 + 10 * S, by0 + 18 * S, S, LACI, KREM, punto=6.5)
    kuzey_oku(ax, (bx0 + 40 * S, by0 + 130 * S), 76 * S, LACI, KREM)
    if A:
        lx0, ly0, lx1, ly1 = plan["lejant"].bounds
        if plan["lejant"].intersects(ADA):
            # karaya düşen lejantın altı kâğıt rengi (okunsun)
            ax.add_patch(FancyBboxPatch((lx0 - 14 * S, ly0 - 4 * S), lx1 - lx0 + 28 * S, ly1 - ly0 + 18 * S,
                                        boxstyle=f"round,pad=0,rounding_size={10 * S}", facecolor=KAGIT,
                                        edgecolor=LACI, linewidth=0.4, alpha=0.9, zorder=44))
        baslik_ve_lejant(ax, lx0, ly1, S)
        ax.add_patch(Rectangle((0, 0), 1, 1, transform=ax.transAxes, fill=False, edgecolor=LACI, linewidth=1.2,
                               zorder=40))
        ax.text(1 - 24 / GEN_PX, 24 / boy_px, kunye, transform=ax.transAxes, fontsize=5.5, color=LACI,
                alpha=0.75, ha="right", va="bottom", zorder=41)
        YAZILAR.append({"tur": "kunye", "metin": kunye})
    else:
        for kenar, w in ((19, 2.2), (32, 0.6)):
            ax.add_patch(Rectangle((kenar / GEN_PX, kenar / boy_px), 1 - 2 * kenar / GEN_PX, 1 - 2 * kenar / boy_px,
                                   transform=ax.transAxes, fill=False, edgecolor=LACI, linewidth=w, zorder=40))
    tampon = io.BytesIO()
    fig.savefig(tampon, dpi=DPI, facecolor=fig.get_facecolor(), format="png")
    plt.close(fig)
    # 256 renge indir: dosya küçük kalsın (telefonda hızlı açılır)
    im = renge_indir(Image.open(tampon).convert("RGB"))
    im.save(dosya, optimize=True)
    return {"dosya": os.path.basename(dosya), "en": im.size[0], "boy": im.size[1],
            "bayt": os.path.getsize(dosya), "yazilar": list(YAZILAR)}


SABIT_RENKLER = [KIREMIT, LACI, KREM, KAGIT, "#FFFFFF", "#3B4566", "#BDD5DF", "#EADFC6"]


def renge_indir(im):
    """256 renk; marka renkleri (kiremit, lacivert, krem…) paletinde kesin durur, solmaz"""
    n = 256 - len(SABIT_RENKLER)
    q = im.quantize(n, method=Image.Quantize.FASTOCTREE)
    pal = q.getpalette()[:3 * n]
    pal += [0] * (3 * n - len(pal))
    for h in SABIT_RENKLER:
        pal += [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    p = Image.new("P", (1, 1))
    p.putpalette(pal)
    return im.quantize(palette=p, dither=Image.Dither.FLOYDSTEINBERG)


def mahalle_ciz(mid):
    global MID, MAH_AD, MAH, PENCERE, PLAN
    MID = mid
    MAH_AD, MAH = MAHALLE[mid]
    PENCERE = pencere_kaynagi()
    if PENCERE is None:
        c = MAH.representative_point()
        PENCERE = (c.x, c.y, 1000.0, 784.0, None)
    # Pencerede bir ad sığmazsa pencere biraz büyür ya da küçülür: en az adın kaybolduğu ölçü seçilir
    temel = PENCERE
    denemeler = []
    for k in (1.0, 1.12, 0.9, 1.25):
        PENCERE = (temel[0], temel[1], temel[2] * k, temel[3] * k, temel[4])
        PLAN = plan_kur()
        SIGMAYAN.clear()
        r_a = ciz("A", os.path.join(CIKTI, f"{mid}-A.png"))
        eksik = sum(x.startswith("pencere:") for x in SIGMAYAN)
        denemeler.append((eksik, k))
        if eksik == 0:
            break
    eksik, k = min(denemeler)
    if (eksik, k) != denemeler[-1]:
        PENCERE = (temel[0], temel[1], temel[2] * k, temel[3] * k, temel[4])
        PLAN = plan_kur()
        SIGMAYAN.clear()
        r_a = ciz("A", os.path.join(CIKTI, f"{mid}-A.png"))
    print(f"{mid}: {MAH_AD}  pencere={PENCERE[4]} ({PENCERE[2]:.0f} m)  yer={PLAN['taraf']}+{PLAN['D']}px  "
          f"1 px = {PLAN['S']:.2f} m")
    sonuc = {"ad": MAH_AD, "yerlesim": PENCERE[4]}
    sigmayan_a = list(SIGMAYAN)
    r_b = ciz("B", os.path.join(CIKTI, f"{mid}-B.png"))
    SIGMAYAN[:0] = sigmayan_a
    for g, r in (("A", r_a), ("B", r_b)):
        sonuc[g] = r
        print(f"  {g}: {r['en']}x{r['boy']} px, {r['bayt'] / 1e6:.2f} MB, {len(r['yazilar'])} yazı")
    sonuc["sigmayan"] = sorted(set(SIGMAYAN))
    for s in sonuc["sigmayan"]:
        print("  yazı sığmadı:", s)
    return sonuc


if __name__ == "__main__":
    os.makedirs(CIKTI, exist_ok=True)
    secilen = sys.argv[1:] or sorted(MAHALLE)
    kayit_yolu = os.path.join(CIKTI, "yazilar.json")
    kayit = json.load(open(kayit_yolu, encoding="utf-8")) if os.path.exists(kayit_yolu) else {}
    kayit = {k: v for k, v in kayit.items() if k in MAHALLE}
    for mid in secilen:
        kayit[mid] = mahalle_ciz(mid)
    kayit = dict(sorted(kayit.items()))
    with open(kayit_yolu, "w", encoding="utf-8") as f:
        json.dump(kayit, f, ensure_ascii=False, indent=1)
        f.write("\n")
