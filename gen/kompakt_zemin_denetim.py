"""Kompakt zemin denetimi — public/harita/duzada-zemin.bin ve duzada-sinirlar.geojson.

Yalnız okur, hiçbir dosyaya yazmaz. Her madde "temiz" ya da "SORUN" yazar;
sorun varsa çıkış kodu 1 olur.

  python gen/kompakt_zemin_denetim.py
"""
import gzip, heapq, json, math, os, struct, sys

import numpy as np
from matplotlib.path import Path
from scipy import ndimage

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IZGARA = os.path.join(KOK, "public", "harita", "duzada-zemin.bin")
SINIR = os.path.join(KOK, "public", "harita", "duzada-sinirlar.geojson")

EGIM_SINIRI = 38.0        # derece; en dik yamaç bunu geçmemeli
KIYI_SICRAMA = 6.0        # m; kıyıda komşu iki hücre arası en çok fark
DIKEN = 1.0               # m; bir hücre 8 komşusunun hepsinden bu kadar yüksek olamaz


def oku(yol=IZGARA):
    ham = gzip.open(yol).read()
    assert ham[:4] == b"DZZ1", "dosya imzası tanınmadı"
    n = struct.unpack("<I", ham[4:8])[0]
    b = json.loads(ham[8:8 + n].decode("utf-8"))
    veri = np.frombuffer(ham[8 + n:], dtype="<i2")
    assert veri.size == b["en"] * b["boy"], "veri boyu başlıkla uyuşmuyor"
    return b, veri.reshape(b["boy"], b["en"])


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    b, ham = oku()
    h = b["hucre"]
    Z = ham.astype(float) * b["birim"]
    gx = b["x0"] + np.arange(b["en"]) * h
    gy = b["y0"] + np.arange(b["boy"]) * h
    GX, GY = np.meshgrid(gx, gy)
    geo = json.load(open(SINIR, encoding="utf-8"))
    ada = next(f for f in geo["features"] if f["properties"]["katman"] == "ada")
    halka = np.array([((p[0] - b["lng0"]) * b["mPerLng"], (p[1] - b["lat0"]) * b["mPerLat"])
                      for p in ada["geometry"]["coordinates"][0]])
    kara = Path(halka).contains_points(np.column_stack([GX.ravel(), GY.ravel()])).reshape(Z.shape)

    print(f"Izgara {b['en']} x {b['boy']}, hücre {h} m, dosya "
          f"{os.path.getsize(IZGARA) / 1e6:.2f} MB; kara {kara.sum() * h * h / 1e6:.1f} km²")

    yaz("Boş / bozuk hücre", int((ham == -32768).sum()) == 0 and np.isfinite(Z).all(),
        f"{int((ham == -32768).sum())} hücre")
    kenar = np.r_[Z[0], Z[-1], Z[:, 0], Z[:, -1]]
    yaz("Izgaranın kenarı açık deniz", bool((kenar < 0).all()), f"en yüksek kenar {kenar.max():.1f} m")

    gy_, gx_ = np.gradient(Z, h)
    egim = np.degrees(np.arctan(np.hypot(gx_, gy_)))
    yaz("En dik yamaç (kara)", egim[kara].max() <= EGIM_SINIRI,
        f"{egim[kara].max():.1f}° (sınır {EGIM_SINIRI:.0f}°); 30°'yi geçen kara "
        f"{(egim[kara] > 30).mean() * 100:.2f} %")

    yaz("Deniz seviyesinin altında kara hücresi", int((Z[kara] <= 0).sum()) == 0,
        f"{int((Z[kara] <= 0).sum())} hücre; en alçak kara {Z[kara].min():.1f} m")
    yaz("Kıyının dışında deniz üstüne çıkan hücre", int((Z[~kara] > 0).sum()) == 0,
        f"{int((Z[~kara] > 0).sum())} hücre")

    # Kapalı çukur: suyu denize akamayan kara hücresi (öncelikli taşma ile)
    F = Z.copy()
    islendi = ~kara.copy()
    kenar_k = kara & ndimage.binary_dilation(~kara, structure=np.ones((3, 3)))
    yig = [(F[j, i], j, i) for j, i in zip(*np.nonzero(kenar_k))]
    heapq.heapify(yig)
    islendi[kenar_k] = True
    B, E = F.shape
    while yig:
        z, j, i = heapq.heappop(yig)
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                a, c = j + dj, i + di
                if (dj or di) and 0 <= a < B and 0 <= c < E and not islendi[a, c]:
                    islendi[a, c] = True
                    if F[a, c] < z:
                        F[a, c] = z
                    heapq.heappush(yig, (F[a, c], a, c))
    derin = F - Z
    cuk, say = ndimage.label(derin > 0.15)
    yaz("Kara içinde kapalı çukur (>15 cm)", say == 0,
        f"{say} çukur, en derini {derin.max():.2f} m")

    # Kıyıda ani sıçrama: kara–deniz komşu çiftlerinde fark
    en_buyuk = 0.0
    for dj, di in ((0, 1), (1, 0)):
        a, c = kara[:B - dj, :E - di], kara[dj:, di:]
        za, zc = Z[:B - dj, :E - di], Z[dj:, di:]
        m = a != c
        if m.any():
            en_buyuk = max(en_buyuk, float(np.abs(za - zc)[m].max()))
    yaz("Kıyıda ani sıçrama (kara–deniz komşu)", en_buyuk <= KIYI_SICRAMA,
        f"en çok {en_buyuk:.1f} m (sınır {KIYI_SICRAMA:.0f} m)")
    kiyi_bant = kara & (ndimage.distance_transform_edt(kara) * h <= 30)
    yaz("Kıyının 30 m içinde en yüksek nokta", Z[kiyi_bant].max() <= 30,
        f"{Z[kiyi_bant].max():.1f} m")

    ayak = np.ones((3, 3), bool)
    ayak[1, 1] = False
    komsu_en_yuksek = ndimage.maximum_filter(Z, footprint=ayak, mode="nearest")
    diken = Z - komsu_en_yuksek
    yaz("Sivri diken (8 komşudan da yüksek tek hücre)", diken[kara].max() <= DIKEN,
        f"en çok {max(0.0, diken[kara].max()):.2f} m (sınır {DIKEN:.0f} m)")

    print("Zirveler:")
    for f in geo["features"]:
        p = f["properties"]
        if p["katman"] != "zirve":
            continue
        x = (f["geometry"]["coordinates"][0] - b["lng0"]) * b["mPerLng"]
        y = (f["geometry"]["coordinates"][1] - b["lat0"]) * b["mPerLat"]
        yakin = np.hypot(GX - x, GY - y) < 250
        z = Z[yakin].max()
        yaz(f"{p['ad']} rakımı", abs(z - p["rakim"]) <= 1.0, f"kayıt {p['rakim']} m, ızgara {z:.1f} m")
    yaz("Adanın en yüksek noktası Ada Tepesi", abs(Z.max() - 742) <= 1.0, f"{Z.max():.1f} m")

    # Mahalleler adayı boşluksuz ve çakışmasız kaplıyor mu
    from shapely.geometry import shape
    from shapely.ops import unary_union
    mah = [shape(f["geometry"]) for f in geo["features"] if f["properties"]["katman"] == "mahalle"]
    ada_g = shape(ada["geometry"])
    bos = ada_g.difference(unary_union(mah)).area
    cakisan = sum(a.intersection(c).area for i, a in enumerate(mah) for c in mah[i + 1:])
    m2 = (b["mPerLng"] * b["mPerLat"])
    yaz("Mahalleler adayı tam kaplıyor", bos * m2 < 2000 and cakisan * m2 < 2000,
        f"boşluk {bos * m2:.0f} m², çakışma {cakisan * m2:.0f} m²")

    print("Sonuç:", "hepsi temiz" if sorun == 0 else f"{sorun} sorun")
    return 1 if sorun else 0


if __name__ == "__main__":
    sys.exit(main())
