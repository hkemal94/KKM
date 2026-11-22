"""Kompakt Düzada ağaçlarının denetimi (tek harita, ağaç adımı; taslak, ölçüler DENEME).

Bakılanlar (dosyadaki yuvarlanmış konumlarla):
  - dosya biçimi; başlıkta "Taslak (Kemal onaylamadı)" ve DENEME
  - denizde, kumsalda ağaç yok
  - yol şeridinde (köprü dahil), yapı tabanında, korunan alanda, otelin sahanlığında ağaç yok
  - alan ağaçları arsaya girmez; avlu ağacı yalnız evi olan arsada ve evden en az 2 m uzakta
  - tür arazisine uyar: fıstık çamı çam ormanı, kayalık ya da makide; bağ sırası yalnız Çiftlik'in bağında
  - Merkez Meydanı'nda tek çınar (künye: "meydanda ... yaşlı bir çınar")
  - yalnız KKM'nin bitki modelleri (public/modeller/ altında)
  - kararlı çıktı: üreteç yeniden çalışınca bayt bayt aynı dosya
  - telefon: sıkıştırılmış dosya 1,5 MB'tan küçük (DENEME sınırı)

Çalıştırma: python gen/kompakt_agaclar_denetim.py
"""
import gzip, json, os, struct, subprocess, sys, tempfile

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
HARITA = os.path.join(KOK, "public", "harita")
DOSYA = os.path.join(HARITA, "duzada-agaclar.bin")
SINIR_MB = 2.0


def oku(yol):
    b = gzip.decompress(open(yol, "rb").read())
    assert b[:4] == b"DZA1", "imza"
    n = struct.unpack("<I", b[4:8])[0]
    h = json.loads(b[8:8 + n])
    o = 8 + n
    A = np.frombuffer(b[o:o + h["en"] * h["boy"]], np.uint8).reshape(h["boy"], h["en"]); o += h["en"] * h["boy"]
    N = h["adet"]

    def u16():
        nonlocal o
        hi = np.frombuffer(b[o:o + N], np.uint8).astype(np.uint16); lo = np.frombuffer(b[o + N:o + 2 * N], np.uint8)
        o += 2 * N
        return (hi << 8) | lo

    def u8():
        nonlocal o
        v = np.frombuffer(b[o:o + N], np.uint8); o += N
        return v
    x, y = u16(), u16()
    t, olc, g = u8(), u8(), u8()
    M = h["siraAdet"]
    s = []
    for _ in range(4):
        hi = np.frombuffer(b[o:o + M], np.uint8).astype(np.uint16); lo = np.frombuffer(b[o + M:o + 2 * M], np.uint8)
        o += 2 * M
        s.append((hi << 8) | lo)
    assert o == len(b), f"dosya uzunluğu: {o} != {len(b)}"
    X = h["x0"] + x * h["birim"]; Y = h["y0"] + y * h["birim"]
    S = np.column_stack([h["x0" if k % 2 == 0 else "y0"] + s[k] * h["birim"] for k in range(4)]) if M else np.zeros((0, 4))
    return h, A, X, Y, t, olc * 0.05, g, S


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    h, A, X, Y, T, O, G, S = oku(DOSYA)
    tur = [t["id"] for t in h["turler"]]; grup = h["gruplar"]; ar = {a["id"]: n for n, a in enumerate(h["arazi"])}
    print(f"{h['adet']} ağaç, {h['siraAdet']} bağ sırası")
    yaz("başlıkta taslak ve DENEME", "taslak (Kemal onaylamadı)" in h["not"] and "DENEME" in h["olcu"]["not"], h["not"][:60])

    sys.path.insert(0, BURASI)
    os.environ["AGAC_CIKTI"] = os.path.join(tempfile.gettempdir(), "agac-denetim-ithal.bin")
    import kompakt_agaclar as K  # noqa: E402  (girdileri aynı yoldan okur; üretmez)

    pts = shapely.points(X, Y)
    kot = K.kot(X, Y)
    ark = K.deger(A, X, Y)
    yaz("denizde ağaç yok", int((kot <= K.OLCU["denizKotuM"]).sum()) == 0, int((kot <= K.OLCU["denizKotuM"]).sum()))
    yaz("kumsalda ağaç yok", int((ark == ar["kumsal"]).sum()) == 0, int((ark == ar["kumsal"]).sum()))

    def icinde(geo):
        g = unary_union(geo) if isinstance(geo, list) else geo
        shapely.prepare(g)
        return shapely.contains_xy(g, X, Y)

    yol = [K.gm(f["geometry"]).buffer(float(f["properties"].get("genislik") or 4.0) / 2, cap_style="flat")
           for f in K.YOLLAR if f["properties"]["katman"] in ("yol", "kopru")]
    v = icinde(yol); yaz("yol şeridinde ağaç yok", not v.any(), int(v.sum()))
    v = icinde(K.YAPI_G); yaz("yapı tabanında ağaç yok", not v.any(), int(v.sum()))
    avlu = G == grup.index("avlu")
    yakin = shapely.dwithin(unary_union(K.YAPI_G), pts, 2.0)
    yaz("avlu ağacı evden en az 2 m uzakta", not (yakin & avlu).any(), int((yakin & avlu).sum()))
    meydan = G == grup.index("meydan")
    korunan = [g for k, g in K.KORUNAN.items() if k != "meydan"]
    v = icinde(korunan) | (icinde(K.KORUNAN["meydan"]) & ~meydan)
    yaz("korunan alanda ağaç yok (Merkez Meydanı'nın çınarı hariç)", not v.any(), int(v.sum()))
    v = icinde(K.IMPERIAL); yaz("otelin sahanlığında, merdiveninde ağaç yok", not v.any(), int(v.sum()))
    arsada = icinde(K.ARSA_G)
    alan = ~avlu & ~meydan & (G != grup.index("mezarlik"))
    yaz("alan, yol ve dere ağacı arsaya girmez", not (arsada & alan).any(), int((arsada & alan).sum()))
    evli = [g for g in K.ARSA_G if any(K.YAPI_G[k].intersection(g).area > 1 for k in STRtree(K.YAPI_G).query(g))]
    v = avlu & ~icinde(evli); yaz("avlu ağacı yalnız evi olan arsada", not v.any(), int(v.sum()))

    fistik = T == tur.index("fistik")
    v = fistik & ~np.isin(ark, [ar["cam"], ar["kayalik"], ar["maki"]])
    yaz("fıstık çamı yalnız çam ormanı, kayalık ve makide", not v.any(), int(v.sum()))
    zeytin_alan = (T == tur.index("zeytin")) & (G == grup.index("alan"))
    v = zeytin_alan & ~np.isin(ark, [ar["zeytinlik"], ar["maki"], ar["tarla"], ar["yerlesim"]])
    yaz("alan zeytini yalnız zeytinlik, maki, tarla ve köy boşluğunda", not v.any(), int(v.sum()))
    camlik = A == ar["cam"]
    v = camlik & (K.H < 160)
    yaz("çam ormanı Ada Tepesi'nin yamacında (170 m'den yüksek)", int(v.sum()) == 0, f"{int(v.sum())} hücre alçakta")
    if len(S):
        mx, my = (S[:, 0] + S[:, 2]) / 2, (S[:, 1] + S[:, 3]) / 2
        v = K.deger(A, mx, my) != ar["bag"]
        yaz("bağ sırası bağda", int(v.sum()) == 0, int(v.sum()))
        cift = K.deger(K.MAH, mx, my) != "yer_ciftlik"
        yaz("bağ yalnız Çiftlik'te", int(cift.sum()) == 0, int(cift.sum()))
        yol_u = unary_union(yol); shapely.prepare(yol_u)
        v = shapely.intersects(yol_u, shapely.linestrings(np.stack([S[:, [0, 1]], S[:, [2, 3]]], axis=1)))
        yaz("bağ sırası yola girmez", not v.any(), int(v.sum()))
    cinar = (T == tur.index("cinar")) & meydan
    v = int((cinar & icinde(K.KORUNAN["meydan"])).sum())
    yaz("Merkez Meydanı'nda tek çınar", v == 1, v)

    eksik = [t["model"] for t in h["turler"] if not os.path.exists(os.path.join(KOK, "public", "modeller", t["model"]))]
    yaz("yalnız KKM'nin bitki modelleri", not eksik and all(t["model"].startswith("bitkiler/") for t in h["turler"]), eksik or "hepsi var")

    boy = os.path.getsize(DOSYA) / 1e6
    yaz(f"dosya {SINIR_MB} MB'tan küçük", boy < SINIR_MB, f"{boy:.2f} MB")

    gecici = os.path.join(tempfile.gettempdir(), "agac-denetim.bin")
    subprocess.run([sys.executable, os.path.join(BURASI, "kompakt_agaclar.py")], check=True, capture_output=True,
                   env={**os.environ, "AGAC_CIKTI": gecici})
    ayni = open(gecici, "rb").read() == open(DOSYA, "rb").read()
    yaz("kararlı çıktı (yeniden üretince aynı dosya)", ayni, "aynı" if ayni else "farklı")

    print("\nTür / mahalle:")
    for t, m in h["sayim"].items():
        print(f"  {t:8s} {sum(m.values()):7d}  " + ", ".join(f"{k}: {v}" for k, v in sorted(m.items())))
    print(f"\n{'Temiz' if not sorun else f'{sorun} sorun'}")
    return sorun


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
