"""Eski haritanın tek haritaya giren girdileri, dondurulmuş hâliyle (tek harita 11. adım, KKM-A; 23 Kasım 2026).

Tek haritanın üreteçleri (kompakt_zemin.py, kompakt_yollar.py, kompakt_liman.py ve denetimleri) eskiden bu
bilgileri doğrudan eski haritanın dosyalarından okuyordu: gen/duzada.py'yi yarıya kadar çalıştırıp, src/data/
duzadaGeo.ts ve src/data/kurucuGomulu.ts'i açıp. Eski haritalar silinecek (Kemal, 20 ve 23 Kasım); onlardan
gerekenler bir kez gen/kompakt-eski-girdiler.json'a yazıldı, üreteçler artık yalnız bunu okur. Çıktılar aynı
(public/harita/* bayt bayt aynı, PR'da sağlaması).

Eski arazinin yükseltisi (kompakt_zemin.py kıyı türünü seçerken kıyının 400 m gerisine bakar) ızgara değil,
eski formülün kendisi: kıyıdan uzaklık profili + uçurum + beş sırt; değişmezleri dosyada, kıyı noktaları
dosyadaki kıyıdan aynı biçimde sıklaştırılır. Böylece değerler eskisiyle birebir aynı çıkar.

Elle düzenlenmez. Yalnız okur; hiçbir dosyaya yazmaz.
"""
import json, math, os

import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Polygon

BURASI = os.path.dirname(os.path.abspath(__file__))
DOSYA = os.path.join(BURASI, "kompakt-eski-girdiler.json")

_V = json.load(open(DOSYA, encoding="utf-8"))

# ---------------------------------------------------------------- koordinat düzlemi (eski haritayla aynı)
LAT0 = _V["koordinat"]["LAT0"]
LNG0 = _V["koordinat"]["LNG0"]
M_PER_LAT = _V["koordinat"]["M_PER_LAT"]
M_PER_LNG = _V["koordinat"]["M_PER_LNG"]

# ---------------------------------------------------------------- eski ada (metre)
ADA = Polygon([tuple(c) for c in _V["ada"]])
# (id, ad, (x, y), rakım, sırt uzunluğu, sırt genişliği, sırt yönü°)
ZIRVELER = [(z[0], z[1], tuple(z[2]), z[3], z[4], z[5], z[6]) for z in _V["zirveler"]]
MAHALLE_ADI = dict(_V["mahalleAdi"])
MERKEZ_MEYDANI = tuple(_V["merkezMeydani"])
# eski mahalle çokgenleri ve The Imperial yerleşkesi: GeoJSON geometrisi (boylam, enlem)
MAHALLELER = _V["mahalleler"]
IMPERIAL = _V["imperial"]
STAT_DUZLUGU = _V["stadDuzlugu"]

# ---------------------------------------------------------------- eski yükselti formülü
_Y = _V["yukselti"]
_kiyi_hat = ADA.exterior
_kiyi_sik = np.array([_kiyi_hat.interpolate(t, normalized=True).coords[0]
                      for t in np.linspace(0, 1, _Y["kiyiOrnek"], endpoint=False)])
_kiyi_agac = cKDTree(_kiyi_sik)
_GENLIK = _Y["zirveGenlik"]


def _kiyiya_uzaklik(x, y):
    noktalar = np.column_stack([np.ravel(x), np.ravel(y)])
    d, _ = _kiyi_agac.query(noktalar, workers=-1)
    return d.reshape(np.shape(x))


def _taban_profili(d):
    d = np.asarray(d, dtype=float)
    kayalik = _Y["KAYALIK_YUKSEK"] * (1.0 - np.exp(-d / _Y["KAYALIK_OLCEK"]))
    plato = _Y["PLATO_YUKSEK"] * np.clip((d - _Y["PLATO_BASLANGIC"]) / _Y["PLATO_OLCEK"], 0.0, 1.0) ** 1.15
    return kayalik + plato


def _ucurum_katkisi(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    th = np.arctan2(y, x)
    d = _kiyiya_uzaklik(x, y)
    alin = 1.0 - np.exp(-d / _Y["UCURUM_ALIN"])
    toplam = np.zeros(np.shape(x), dtype=float)
    for merkez, gen, yuk in _Y["UCURUMLAR"]:
        sapma = (th - merkez + np.pi) % (2 * np.pi) - np.pi
        toplam = toplam + yuk * np.exp(-(sapma / gen) ** 2) * alin
    return toplam


def _sirt_katkisi(x, y, zirve, genlik):
    _, _, (px, py), _, uzun, genis, aci = zirve
    a = math.radians(aci)
    dx, dy = np.asarray(x) - px, np.asarray(y) - py
    u = dx * math.cos(a) + dy * math.sin(a)
    v = -dx * math.sin(a) + dy * math.cos(a)
    return genlik * np.exp(-0.5 * ((u / uzun) ** 2 + (v / genis) ** 2))


def yukselti(x, y):
    """Eski adada bir noktanın (ya da dizinin) rakımı, metre (gen/duzada.py → yukselti ile aynı)."""
    d = _kiyiya_uzaklik(x, y)
    e = _taban_profili(d) + _ucurum_katkisi(x, y)
    for z in ZIRVELER:
        e = e + _sirt_katkisi(x, y, z, _GENLIK[z[0]])
    return e


# ---------------------------------------------------------------- Kurucu'nun son hâli (Kemal'in)
def _ciftler(n):
    return [(n[i], n[i + 1]) for i in range(0, len(n), 2)]


SAHIL_YOLU = _V["sahilYolu"]                  # düz [boylam, enlem, …] (Kurucu'daki Sahil Yolu)
KIYI_KOYU_YOLLARI = _V["kiyiKoyu"]["yollar"]   # kimlik → {"n": düz [boylam, enlem, …]}
KIYI_KOYU_BIRAHANE = _V["kiyiKoyu"]["birahane"]


def liman():
    """Eski haritadaki Liman: sokaklar {kimlik: (ad, [(boylam, enlem)…])}, meydancıklar [[(boylam, enlem)…]],
    Sahil Yolu [(boylam, enlem)…] (Kemal'in Kurucu'daki son hâli; gen/kompakt_liman.py → eski_liman)."""
    sokak = {k: (ad, [tuple(c) for c in hat]) for k, ad, hat in _V["liman"]["sokaklar"]}
    meydan = [[tuple(c) for c in p] for p in _V["liman"]["meydancik"]]
    return sokak, meydan, _ciftler(SAHIL_YOLU)
