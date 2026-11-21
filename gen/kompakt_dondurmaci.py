"""Dondurmacı Kızlar çevresi — tek haritada oyunla uyumlu liman düzeni (21 Kasım 2026, Kemal:
"Dondurmacı Kızlar'ın haritasının oyunu etkileyeceğini biliyorsun değil mi, o yüzden onun yeri çok önemli").

Kaynak: Dondurmacı Kızlar oyununun tasarım belgesi 0.10 (Liman haritası, Kemal 14 Ekim) ve oyunun liman
sahnesini kuran kod (src/sahne/Liman.tsx, Disari.tsx, oyun/dekorasyon.ts). Bu dosya oyun deposuna yazmaz,
yalnız oradaki ölçüleri kullanır. Ölçünün yanında kaynağı yazar: "oyun belgesi 0.10" (belgedeki karar),
"oyun kodu" (belgedeki kararın oyundaki sayısı) ya da "DENEME" (ajansın seçimi; Kemal onaylamadı).

Oyunun çerçevesi (metre): dükkân başlangıçta (0, 0); -z denize doğru (dükkânın önü denize bakar), +x sağ
(oyun belgesi 0.10: "oyunda sağ = kuzeydoğu, kıyı boyunca"). Tek haritada bu çerçeve kıyıya oturtulur:
Liman kıyısında, oyunun kıyı çizgisine (solda düz, sağda denize doğru kıvrılan) en iyi uyan yer aranır;
dükkân oradaki kıyıdan oyundaki kadar (26 m) içeride durur.

Kullanan üreteçler:
  gen/kompakt_yollar.py    araba yolu, yürüyüş yolu, iskele, mendirek ve liman kumsalı (duzada-yollar.geojson)
  gen/kompakt_parseller.py liman kumsalında arsa yok; araba yolunun arkasında arsa var (kumsal payı kısalır)
  gen/kompakt_yapilar.py   Dondurmacı Kızlar, Liman İdare Binası ve liman deposu oyundaki yerlerinde

Kayda yazmaz; yalnız geometri verir.
"""
import math

import numpy as np
from shapely.geometry import LineString, Point, Polygon

# ------------------------------------------------------------------ oyunun ölçüleri
SU_KENARI = -26.0          # oyun kodu (Liman.tsx): dükkânın önünde suyun kenarı; belge 0.10 "~25 m kumsal"
OYUN_KIYI = [(-500, -26), (80, -26), (150, -42), (200, -78), (240, -104), (300, -118), (500, -125)]  # oyun kodu
DUKKAN_ONU = -2.4          # oyun kodu (dekorasyon.ts Z0): dükkânın ön yüzü
DUKKAN_OLCU = 16.0         # oyun belgesi 0.10 "~15–18 m kare"; 16 m DENEME
TERAS_ONU = -8.6           # oyun kodu: terasın deniz kenarı (iskele buradan başlar)
YURUYUS_Z = -7.3           # oyun kodu (dekorasyon.ts): taş yürüyüş yolu, dükkânın önünde
YURUYUS_ENI = 1.7          # oyun kodu (Disari.tsx)
YURUYUS_UCU = 46.0         # oyun kodu (Disari.tsx TERAS_UCU): yürüyüş yolu terasla iki yana 46 m
YOL_ON = 15.0              # oyun kodu: araba yolunun ön kenarı (yürüyüş yolundan ~20 m geride, belge 0.10)
YOL_ENI = 7.0              # oyun kodu
ISKELE_ENI = 4.0           # oyun kodu
ISKELE_UCU = -127.0        # oyun kodu: kıyıdan ~100 m (belge 0.10)
T_ENI = 44.0               # oyun kodu (belge 0.10 "~45 m T başı")
T_DERINLIGI = 7.0          # oyun kodu
MENDIREK = [(239, -95), (227, -142), (209, -176), (183, -206), (149, -233), (101, -248), (39, -248),
            (-11, -242), (-49, -236), (-85, -223), (-120, -208)]   # oyun kodu: sağda kıyıdan, ~250 m açıkta döner,
                                                                   # solda açık biter (giriş solda; belge 0.10)
MENDIREK_ENI = 8.0         # oyun kodu
IDARE = (159.0, -15.0)     # oyun kodu: Liman İdare Binası (belge 0.10 "sağda kumsalda ~160 m"); önü denize
DEPO = (207.0, -61.0)      # oyun kodu: Liman Deposu (belge 0.10 "~210 m"); önü (kapısı) denize
DEPO_OLCU = (24.0, 13.0)   # oyun kodu: deponun tabanı (x boyunca, z boyunca)

# ------------------------------------------------------------------ ajansın seçimleri (hepsi DENEME)
ARAMA_M = 700.0            # DENEME: Liman yerleşimine en yakın kıyı noktasının iki yanında aranan kıyı (m)
ARAMA_ADIM = 5.0           # DENEME
UYUM_X = range(-200, 301, 20)   # DENEME: kıyı uyumu bu x'lerde ölçülür (oyunda görünen kıyı)
YOL_SOL, YOL_SAG = -220.0, 300.0   # DENEME: araba yolunun düz kesimi (sağda kumsal bitince en yakın kavşağa döner) ve arkasındaki arsa şeridi
KUMSAL_SOL, KUMSAL_SAG = -200.0, 260.0   # DENEME: liman kumsalı (yol ile deniz arası boş; yalnız üç yapı)
ARKA_ARSA_M = 4.0          # DENEME: araba yolunun arkasında arsa bu kadar sonra başlayabilir (kaldırım payıyla)


def oyun_kiyisi(x):
    return float(np.interp(x, [p[0] for p in OYUN_KIYI], [p[1] for p in OYUN_KIYI]))


class Cerceve:
    """Oyunun çerçevesi tek haritada: O başlangıç, sag (+x), deniz (-z yönü), metre."""

    def __init__(self, O, sag, deniz, kiyi):
        self.O = np.asarray(O, float)
        self.sag = np.asarray(sag, float)
        self.deniz = np.asarray(deniz, float)
        self.kiyi = kiyi

    def h(self, x, z):
        """Oyundaki (x, z) → haritada metre (x, y)."""
        q = self.O + self.sag * x - self.deniz * z
        return (float(q[0]), float(q[1]))

    def o(self, p):
        """Haritadaki nokta → oyundaki (x, z)."""
        d = np.asarray(p, float) - self.O
        return (float(d @ self.sag), float(-(d @ self.deniz)))

    def kiyi_z(self, x):
        """Haritadaki gerçek kıyının oyundaki z'si (x hattında, oyunun kıyısına en yakın kesişim)."""
        hat = LineString([self.h(x, 60.0), self.h(x, -450.0)])
        k = hat.intersection(self.kiyi)
        pts = [k] if k.geom_type == "Point" else list(getattr(k, "geoms", []))
        if not pts:
            return None
        zs = [self.o((p.x, p.y))[1] for p in pts]
        return min(zs, key=lambda z: abs(z - oyun_kiyisi(x)))

    @property
    def sag_pusula(self):
        return math.degrees(math.atan2(self.sag[0], self.sag[1])) % 360

    @property
    def on_pusula(self):
        return math.degrees(math.atan2(self.deniz[0], self.deniz[1])) % 360

    def poligon(self, noktalar):
        return Polygon([self.h(x, z) for x, z in noktalar])

    def hat(self, noktalar):
        return LineString([self.h(x, z) for x, z in noktalar])


def _cerceve_kur(ada, s):
    kiyi = ada.exterior
    L = kiyi.length
    q = kiyi.interpolate(s % L)
    a, b = kiyi.interpolate((s - 40) % L), kiyi.interpolate((s + 40) % L)
    t = np.array([b.x - a.x, b.y - a.y])
    t /= np.hypot(*t)
    n = np.array([-t[1], t[0]])
    if ada.contains(Point(q.x + n[0] * 5, q.y + n[1] * 5)):
        n = -n                                   # n denize doğru
    sag = np.array([n[1], -n[0]])                # denize bakarken sağ
    O = np.array([q.x, q.y]) + n * SU_KENARI     # kıyıdan 26 m içeri
    return Cerceve(O, sag, n, kiyi)


def cerceve(ada, liman_xy):
    """Liman yerleşimine en yakın kıyının iki yanında, oyunun kıyısına en iyi uyan yer. Kararlı (aynı girdi aynı sonuç)."""
    kiyi = ada.exterior
    s0 = kiyi.project(Point(liman_xy))
    en_iyi = None
    for ds in np.arange(-ARAMA_M, ARAMA_M + 0.1, ARAMA_ADIM):
        c = _cerceve_kur(ada, s0 + ds)
        hata = []
        for x in UYUM_X:
            z = c.kiyi_z(x)
            hata.append(300.0 if z is None else min(300.0, abs(z - oyun_kiyisi(x))))
        # iskele ve mendirek suda kalmalı
        if any(ada.contains(Point(c.h(0, z))) for z in np.arange(SU_KENARI - 4, ISKELE_UCU - T_DERINLIGI, -5)):
            continue
        if any(ada.contains(Point(c.h(x, z))) for x, z in MENDIREK[1:]):
            continue
        rms = float(np.sqrt(np.mean(np.square(hata))))
        if en_iyi is None or rms < en_iyi[0] - 1e-9:
            en_iyi = (rms, float(ds), c)
    rms, ds, c = en_iyi
    c.uyum_rms = rms
    return c


# ------------------------------------------------------------------ öğeler (haritada metre)
def dukkan_tabani(c):
    y = DUKKAN_OLCU / 2
    return c.poligon([(-y, DUKKAN_ONU), (y, DUKKAN_ONU), (y, DUKKAN_ONU + DUKKAN_OLCU), (-y, DUKKAN_ONU + DUKKAN_OLCU)])


def araba_yolu(c):
    z = YOL_ON + YOL_ENI / 2
    return c.hat([(YOL_SOL, z), (YOL_SAG, z)])


def yuruyus_yolu(c):
    """Dükkânın önündeki taş yol ve iki ucundan araba yoluna inen iki kısa bağlantı (ağdan kopmasın; DENEME)."""
    zy = YOL_ON + YOL_ENI / 2
    on = c.hat([(-YURUYUS_UCU, YURUYUS_Z), (YURUYUS_UCU, YURUYUS_Z)])
    sol = c.hat([(-YURUYUS_UCU, YURUYUS_Z), (-YURUYUS_UCU, zy)])
    sag = c.hat([(YURUYUS_UCU, YURUYUS_Z), (YURUYUS_UCU, zy)])
    return on, sol, sag


def iskele(c, ada):
    """T iskele: terasın önünden (kumsalın üstünden ahşap yol) açığa; ucunda T başı."""
    y = ISKELE_ENI / 2
    govde = c.poligon([(-y, TERAS_ONU), (y, TERAS_ONU), (y, ISKELE_UCU), (-y, ISKELE_UCU)])
    t = T_ENI / 2
    bas = c.poligon([(-t, ISKELE_UCU), (t, ISKELE_UCU), (t, ISKELE_UCU - T_DERINLIGI), (-t, ISKELE_UCU - T_DERINLIGI)])
    return govde.union(bas), c.hat([(0, TERAS_ONU), (0, ISKELE_UCU - T_DERINLIGI / 2)])


def mendirek(c, ada):
    """Mendireğin orta hattı: oyunun noktaları; kökü haritanın gerçek kıyısına uzatılır (DENEME: 2 m karaya girer)."""
    pts = [c.h(x, z) for x, z in MENDIREK]
    p0, p1 = np.array(pts[0]), np.array(pts[1])
    u = (p0 - p1) / np.hypot(*(p0 - p1))
    if ada.contains(Point(p0)):
        # kök karadaysa geri çek: kıyıya 2 m kalana kadar
        k = 0.0
        while ada.contains(Point(p0 - u * k)) and k < 200:
            k += 0.5
        kok = p0 - u * (k - 2.0)
    else:
        k = 0.0
        while not ada.contains(Point(p0 + u * k)) and k < 200:
            k += 0.5
        kok = p0 + u * (k + 2.0)
    hat = LineString([tuple(kok)] + pts)
    return hat.buffer(MENDIREK_ENI / 2, cap_style=1, join_style=1), hat


def kiyiya_gore(c, x, z):
    """Oyundaki (x, z) noktası; z oyunun kıyısına göre ölçülüp haritanın gerçek kıyısına taşınır (kumsaldaki yapılar)."""
    kz = c.kiyi_z(x)
    fark = (kz - oyun_kiyisi(x)) if kz is not None else 0.0
    return x, z + fark


def idare_yeri(c):
    x, z = kiyiya_gore(c, *IDARE)
    return c.h(x, z), z


def depo_yeri(c):
    x, z = kiyiya_gore(c, *DEPO)
    return c.h(x, z), z


def kumsal_alani(c, ada):
    """Liman kumsalı: araba yolunun deniz kenarından denize, KUMSAL_SOL..KUMSAL_SAG arası (karada kalan kısmı)."""
    g = c.poligon([(KUMSAL_SOL, YOL_ON), (KUMSAL_SAG, YOL_ON), (KUMSAL_SAG, -450.0), (KUMSAL_SOL, -450.0)])
    return g.intersection(ada)


def arka_serit(c):
    """Araba yolunun arkası: kumsal payının (gen/kompakt_parseller.py KUMSAL_PAY) burada kalktığı şerit."""
    z0 = YOL_ON + YOL_ENI
    return c.poligon([(YOL_SOL, z0), (YOL_SAG, z0), (YOL_SAG, z0 + 200.0), (YOL_SOL, z0 + 200.0)])
