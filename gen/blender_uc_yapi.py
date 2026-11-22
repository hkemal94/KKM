"""Tek harita: modeli olmayan üç yapıya Blender modeli (22 Kasım 2026, Kemal: "tek haritada modeli
olmayan 3 yapı için Blender'da yeni model, önce vitrin resmiyle").

Yapılar ve dayanakları (yalnız künye `docs/03-duzada-kunyesi.md` ve viki; ad, yazı, logo yok):

- Küçükçetmi Sürek Kulübü (`bina_surek`, Çiftlik, 54 x 26 m): künye "çiftlik evi kulüp evi", "Çiftlik'in
  iç tarafında, tepeye yakın", "Kangal yetiştiriciliği", "buluşma yeri". Viki: "Ali Eskibey ... çiftlikte,
  kulüp evinin yanındaki ayrı bir evde yaşar". Model: iki katlı taş çiftlik evi (kulüp evi), yanında tek
  katlı ayrı ev, Kangal barınağı ve çitli koşu yeri, kuru taş avlu duvarı, ahşap avlu kapısı, zeytinler,
  ağaç altında masa. Tabela, arma, Kangal amblemi konmadı.
- İskele Mescidi (`yapi_iskele_mescidi`, İskele, 7 x 12 m): viki "eski balıkçı evlerinin arasındaki küçük
  bir mescit", 1923 sonrası, Diyanet. Künye ve vikinin metninde minare yok: model minaresiz, badanalı,
  kırma kiremit çatılı küçük mescit; önünde taş döşeli avlucuk, yanda abdest çeşmesi.
  `--minareli` ile vikideki çizimdeki gibi küçük tek şerefeli minareli sürümü de üretilir (Kemal seçer).
- Rum Mezarlığı (`yapi_rum_mezarligi`, İskele, 20 x 24 m): künye "Eski Kilise'nin yanında eski bir Rum
  mezarlığı", "belediye bakar ama kapalı", 1923'te cemaat gitti. Model: alçak kuru taş duvar, kapalı demir
  kapı, yazısız sade mezar taşları (yatık taş ve baş taşı), iki servi, yaşlı bir zeytin, kuru ot.
  Duvarın dışındaki servi halkası haritanın ağaç katında zaten var (`gen/kompakt_agaclar.py`), modele
  girmez.

Yamaç: tek harita modeli tabanın en alçak noktasına oturtur (`tekVeri.ts` → `kot`). Sürek Kulübü'nün
tabanında 7,2 m, mezarlıkta 6,9 m fark var; düz model yamaca gömülürdü. Betik bu yüzden yerin rakımını
`public/harita/duzada-zemin.bin`'den okur: avlu zemini, duvar ve mezar taşları yere uyar, binalar yamaçtaki
en yüksek noktalarında taş kaideye oturur. Model yalnız kendi yerine göre yapılır.

Model ön = Blender -Y (glTF +Z), en Blender X boyunca, boy Y boyunca; taban kutusu tam en x boy.
Stil: KKM bina dili (low-poly, düz renk, mat; ajansın `blender_binalar.py` yardımcılarının kopyası).

Kullanım:  python3 gen/blender_uc_yapi.py <çıktı klasörü> [surek|mescit|mezarlik ...] [--minareli]
Kayda yazmaz; yalnız .glb dosyası yazar. Ham dosya; KKM'ye meshopt ile sıkıştırılıp girer.
"""
import gzip
import json
import math
import os
import random
import struct
import sys

import bpy  # noqa

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARG = [a for a in sys.argv[1:] if not a.endswith(".py")]
MINARELI = "--minareli" in ARG
ARG = [a for a in ARG if not a.startswith("--")]
KLASOR = ARG[0] if ARG else "."
SECILEN = set(ARG[1:])

KAT = 3.2
SACAK = 0.45
EGIM = math.radians(30)

RENK = {
    "harc": "#B9AA8C", "tas1": "#D6C7A8", "tas2": "#C9B48F", "tas3": "#BFA987", "tas4": "#DDD0B4",
    "tas_koyu": "#A8977A", "badana": "#EDE7DA", "badana_kir": "#D9CFBE", "kiremit1": "#B5603F",
    "kiremit2": "#A9553A", "kiremit3": "#C06C48", "kiremit4": "#9E4E36",
    "kepenk": "#4D767C", "yesil_kepenk": "#5A7550", "ahsap": "#826A53",
    "ahsap_koyu": "#5E4A38", "zeytin": "#5A7550", "asma": "#67833F", "asma2": "#587236",
    "cam": "#33474B", "demir": "#3F3B36", "zemin": "#BDB09A", "saksi": "#B0694A",
    "cicek": "#C8423C", "cicek2": "#E2B23C", "mavi_kapi": "#3F6E8C", "sac": "#8E8B84",
    "toprak": "#C8B48C", "kuru_ot": "#ABA571", "zeytin_yaprak": "#7E8D5C", "ot": "#8F9B5C", "servi": "#3E5A3A", "mermer": "#E4DED2",
}
TASLAR = ["tas1", "tas2", "tas3", "tas4"]
KIREMITLER = ["kiremit1", "kiremit2", "kiremit3", "kiremit4"]

# ---------------- yer (tek haritanın zemini) ----------------

_ZEMIN = None


def _zemin():
    global _ZEMIN
    if _ZEMIN is None:
        b = gzip.decompress(open(os.path.join(KOK, "public/harita/duzada-zemin.bin"), "rb").read())
        n = struct.unpack("<I", b[4:8])[0]
        B = json.loads(b[8:8 + n])
        h = struct.unpack(f"<{B['en'] * B['boy']}h", b[8 + n:8 + n + B["en"] * B["boy"] * 2])
        _ZEMIN = (B, h)
    return _ZEMIN


def _rakim(x, sz):
    """tekVeri.ts → rakim ile aynı: sahne x, z'de ızgaradan iki doğrusal ara değer"""
    B, h = _zemin()
    fi, fj = (x - B["x0"]) / B["hucre"], (-sz - B["y0"]) / B["hucre"]
    i, j = int(math.floor(fi)), int(math.floor(fj))
    a, c = fi - i, fj - j
    g = lambda jj, ii: h[jj * B["en"] + ii] * B["birim"]  # noqa: E731
    return g(j, i) * (1 - a) * (1 - c) + g(j, i + 1) * a * (1 - c) + g(j + 1, i) * (1 - a) * c + g(j + 1, i + 1) * a * c


def yer(kimlik):
    """Yapının tabanında yerel rakım: h(x, y) → model z (tabanın en alçak noktası 0)"""
    B, _ = _zemin()
    d = json.load(open(os.path.join(KOK, "public/harita/duzada-yapilar.geojson")))
    f = next(f for f in d["features"] if f["properties"]["id"] == kimlik)
    p = f["properties"]
    sah = lambda c: ((c[0] - B["lng0"]) * B["mPerLng"], -(c[1] - B["lat0"]) * B["mPerLat"])  # noqa: E731
    mx, mz = sah(p["merkez"])
    ex = p["ex"]
    kot = min([_rakim(mx, mz)] + [_rakim(*sah(c)) for c in f["geometry"]["coordinates"][0]])

    def h(x, y):
        # Blender (x, y) → model (X = x, Z = -y) → sahne (tek harita donus())
        X, Z = x, -y
        return _rakim(mx + X * ex[0] - Z * ex[1], mz + X * ex[1] + Z * ex[0]) - kot
    h.en, h.boy = p["en"], p["boy"]
    return h


def yer_bandi(h, x0, y0, x1, y1, n=5):
    """Dikdörtgende yerin en alçağı ve en yükseği"""
    v = [h(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * j / n) for i in range(n + 1) for j in range(n + 1)]
    return min(v), max(v)


# ---------------- örgü ----------------

MAT = {}
PARCA = {}
OFSET = [0.0, 0.0, 0.0]


def rgb(hx):
    hx = hx.lstrip("#")
    s = [int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s] + [1.0]


def mat(ad):
    if ad not in MAT:
        m = bpy.data.materials.new(ad)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = rgb(RENK[ad])
        b.inputs["Roughness"].default_value = 1.0
        b.inputs["Metallic"].default_value = 0.0
        MAT[ad] = m
    return MAT[ad]


def ekle(verts, faces, renk):
    v, f = PARCA.setdefault(renk, ([], []))
    n = len(v)
    ox, oy, oz = OFSET
    v.extend((a + ox, b + oy, c + oz) for (a, b, c) in verts)
    f.extend(tuple(i + n for i in fc) for fc in faces)


def kutu(x0, y0, z0, x1, y1, z1, renk):
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    ekle(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], renk)


def silindir(x, y, z0, z1, r, renk, n=8):
    v = []
    for z in (z0, z1):
        for i in range(n):
            a = 2 * math.pi * i / n
            v.append((x + r * math.cos(a), y + r * math.sin(a), z))
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    ekle(v, f, renk)


def koni(x, y, z0, z1, r, renk, n=8):
    v = [(x + r * math.cos(2 * math.pi * i / n), y + r * math.sin(2 * math.pi * i / n), z0) for i in range(n)] + [(x, y, z1)]
    ekle(v, [tuple(range(n - 1, -1, -1))] + [(i, (i + 1) % n, n) for i in range(n)], renk)


def kesik(alt, ust, z0, z1, renk):
    """Alt dikdörtgenden üst dikdörtgene kesik piramit. alt/ust: (x0,y0,x1,y1)."""
    a, b = alt, ust
    v = [(a[0], a[1], z0), (a[2], a[1], z0), (a[2], a[3], z0), (a[0], a[3], z0),
         (b[0], b[1], z1), (b[2], b[1], z1), (b[2], b[3], z1), (b[0], b[3], z1)]
    ekle(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], renk)


def yer_ortusu(h, x0, y0, x1, y1, adim, renk, ust=0.1):
    """Yere uyan ızgara yüzey (avlu toprağı, kuru ot); yerin `ust` m üstünde"""
    nx, ny = max(1, round((x1 - x0) / adim)), max(1, round((y1 - y0) / adim))
    v = [(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, 0.0) for j in range(ny + 1) for i in range(nx + 1)]
    v = [(x, y, h(x, y) + ust) for (x, y, _) in v]
    f = [(j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i)
         for j in range(ny) for i in range(nx)]
    ekle(v, f, renk)


def temizle():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MAT.clear()
    PARCA.clear()
    OFSET[:] = [0.0, 0.0, 0.0]


def disari(ad):
    if SECILEN and not any(s in ad for s in SECILEN):
        PARCA.clear()
        return
    for renk, (v, f) in PARCA.items():
        me = bpy.data.meshes.new(renk)
        me.from_pydata(v, [], f)
        me.update()
        o = bpy.data.objects.new(renk, me)
        o.data.materials.append(mat(renk))
        bpy.context.collection.objects.link(o)
    os.makedirs(KLASOR, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=f"{KLASOR}/{ad}.glb", export_format="GLB", export_yup=True)
    print("yazildi", ad, sum(len(f) for (_, f) in PARCA.values()), "yuz")


# ---------------- cephe ----------------

class Cephe:
    """Dikdörtgen yapının bir yüzü. u: cephe boyunca, z: yukarı, d: dışarı."""

    def __init__(self, ox, oy, ux, uy, nx, ny, en, z0=0.0):
        self.o, self.u, self.n, self.en, self.z0 = (ox, oy), (ux, uy), (nx, ny), en, z0
        self.bosluk = []

    def p(self, u, z, d):
        return (self.o[0] + u * self.u[0] + d * self.n[0], self.o[1] + u * self.u[1] + d * self.n[1], self.z0 + z)

    def kutu(self, u0, u1, z0, z1, d0, d1, renk):
        a, b = self.p(u0, z0, d0), self.p(u1, z1, d1)
        kutu(a[0], a[1], a[2], b[0], b[1], b[2], renk)

    def bos_mu(self, u0, u1, z0, z1, pay=0.12):
        return all(u1 < b[0] - pay or u0 > b[1] + pay or z1 < b[2] - pay or z0 > b[3] + pay for b in self.bosluk)


def dort_cephe(en, boy, z0=0.0):
    return {
        "on": Cephe(0, 0, 1, 0, 0, -1, en, z0),
        "arka": Cephe(en, boy, -1, 0, 0, 1, en, z0),
        "sol": Cephe(0, boy, 0, -1, -1, 0, boy, z0),
        "sag": Cephe(en, 0, 0, 1, 1, 0, boy, z0),
    }


def tas_orgu(c, yuk, r, z_bas=0.0, yogun=1.0):
    """Cepheye tek tek taş örer (pencere/kapı boşluklarını atlar)."""
    z = z_bas + 0.02
    while z < yuk - 0.12:
        h = r.uniform(0.3, 0.46)
        u = r.uniform(-0.25, 0.0)
        while u < c.en - 0.05:
            w = r.uniform(0.5, 1.0)
            a, b = max(u, 0.02), min(u + w, c.en - 0.02)
            if b - a > 0.12 and c.bos_mu(a, b, z, z + h, 0.04) and r.random() < yogun:
                c.kutu(a, b, z, min(z + h, yuk - 0.02), 0.0, r.uniform(0.025, 0.06), r.choice(TASLAR))
            u += w + 0.04
        z += h + 0.04


def kose_taslari(c, yuk, r, z_bas=0.0):
    z, i = z_bas, 0
    while z + 0.3 < yuk:
        for (u0, u1) in ([(0, 0.55), (c.en - 0.35, c.en)] if i % 2 == 0 else [(0, 0.35), (c.en - 0.55, c.en)]):
            c.kutu(u0, u1, z, z + 0.3, 0.0, 0.075, r.choice(["tas2", "tas3"]))
        z += 0.33
        i += 1


def badana_kir(c, yuk, r, dokuk=2):
    """Dipte kir şeridi + sıvası dökülmüş, taşı görünen birkaç yama."""
    c.kutu(0, c.en, 0, r.uniform(0.35, 0.5), 0.0, 0.008, "badana_kir")
    for _ in range(dokuk):
        w, hh = r.uniform(0.5, 1.0), r.uniform(0.4, 0.8)
        u, z = r.uniform(0.3, c.en - w - 0.3), r.uniform(0.6, yuk - hh - 0.3)
        if c.bos_mu(u, u + w, z, z + hh, 0.15):
            c.kutu(u, u + w, z, z + hh, 0.0, 0.012, "badana_kir")
            for k in range(3):
                uu = u + 0.08 + k * (w - 0.16) / 3
                c.kutu(uu, uu + (w - 0.2) / 3, z + 0.1, z + hh - 0.1, 0.012, 0.03, r.choice(TASLAR))


def pencere(c, u, z, r, en=1.0, boy=1.4, kepenk="acik", sove="tas", kemer=False, kafes=False):
    """Söve, denizlik, cam, kayıt, kepenk kanatları (pervazlı); kafes: mescit penceresi."""
    c.bosluk.append((u - en / 2 - 0.15, u + en / 2 + 0.15, z - 0.2, z + boy + 0.2))
    sr = "tas2" if sove == "tas" else "badana_kir"
    s = 0.14
    c.kutu(u - en / 2 - s, u + en / 2 + s, z - 0.12, z + boy + s, 0.0, 0.06, sr)
    if kemer:
        for i, k in enumerate((0.0, 0.12, 0.2)):
            c.kutu(u - en / 2 - s + k * 1.4, u + en / 2 + s - k * 1.4, z + boy + s + i * 0.1, z + boy + s + (i + 1) * 0.1, 0.0, 0.06, sr)
            c.kutu(u - en / 2 + k * 1.4, u + en / 2 - k * 1.4, z + boy + i * 0.1, z + boy + (i + 1) * 0.1 + 0.02, 0.0, 0.065, "cam")
    c.kutu(u - en / 2 - 0.2, u + en / 2 + 0.2, z - 0.16, z - 0.06, 0.0, 0.2, "tas_koyu")
    c.kutu(u - en / 2, u + en / 2, z, z + boy, 0.0, 0.065, "cam")
    if kafes:
        for k in range(1, 4):
            uu = u - en / 2 + en * k / 4
            c.kutu(uu - 0.02, uu + 0.02, z, z + boy, 0.06, 0.085, "demir")
        for k in range(1, 5):
            zz = z + boy * k / 5
            c.kutu(u - en / 2, u + en / 2, zz - 0.02, zz + 0.02, 0.06, 0.085, "demir")
        return
    for (a, b, za, zb) in ((u - en / 2, u + en / 2, z, z + 0.06), (u - en / 2, u + en / 2, z + boy - 0.06, z + boy),
                           (u - en / 2, u - en / 2 + 0.06, z, z + boy), (u + en / 2 - 0.06, u + en / 2, z, z + boy),
                           (u - 0.025, u + 0.025, z, z + boy)):
        c.kutu(a, b, za, zb, 0.06, 0.09, "ahsap")
    renk = r.choice(["kepenk", "yesil_kepenk", "yesil_kepenk"]) if kepenk != "yok" else None
    if kepenk == "acik":
        for sgn in (-1, 1):
            a = u + sgn * (en / 2 + s + 0.02)
            b = a + sgn * en / 2
            lo, hi = min(a, b), max(a, b)
            c.kutu(lo, hi, z, z + boy, 0.06, 0.1, renk)
            zz = z + 0.12
            while zz < z + boy - 0.1:
                c.kutu(lo + 0.05, hi - 0.05, zz, zz + 0.04, 0.1, 0.125, renk)
                zz += 0.2
    elif kepenk == "kapali":
        c.kutu(u - en / 2, u + en / 2, z, z + boy, 0.09, 0.13, renk)
        zz = z + 0.12
        while zz < z + boy - 0.1:
            c.kutu(u - en / 2 + 0.05, u + en / 2 - 0.05, zz, zz + 0.04, 0.13, 0.155, renk)
            zz += 0.2


def kapi(c, u, r, en=1.1, boy=2.25, renk="ahsap", cift=True, kemer=True, basamak=True, z=0.0):
    c.bosluk.append((u - en / 2 - 0.2, u + en / 2 + 0.2, z - 0.1, z + boy + 0.5))
    s = 0.18
    c.kutu(u - en / 2 - s, u - en / 2, z, z + boy, 0.0, 0.08, "tas2")
    c.kutu(u + en / 2, u + en / 2 + s, z, z + boy, 0.0, 0.08, "tas2")
    if kemer:
        for i, k in enumerate((0.0, 0.1, 0.22, 0.36)):
            c.kutu(u - en / 2 - s + k, u + en / 2 + s - k, z + boy + i * 0.09, z + boy + (i + 1) * 0.09, 0.0, 0.085, "tas2" if i % 2 else "tas3")
        c.kutu(u - 0.12, u + 0.12, z + boy + 0.3, z + boy + 0.48, 0.0, 0.1, "tas4")
    else:
        c.kutu(u - en / 2 - s, u + en / 2 + s, z + boy, z + boy + 0.18, 0.0, 0.08, "tas2")
    c.kutu(u - en / 2, u + en / 2, z, z + boy, 0.0, 0.04, "ahsap_koyu")
    kanat = [(u - en / 2 + 0.03, u - 0.01), (u + 0.01, u + en / 2 - 0.03)] if cift else [(u - en / 2 + 0.03, u + en / 2 - 0.03)]
    for (a, b) in kanat:
        c.kutu(a, b, z + 0.02, z + boy - 0.03, 0.04, 0.07, renk)
        for (za, zb) in ((0.15, 0.95), (1.1, boy - 0.2)):
            c.kutu(a + 0.08, b - 0.08, z + za, z + zb, 0.07, 0.09, renk)
    c.kutu(u + 0.05, u + 0.09, z + 1.0, z + 1.12, 0.07, 0.12, "demir")
    if basamak:
        c.kutu(u - en / 2 - 0.35, u + en / 2 + 0.35, z - 0.18, z, 0.0, 0.5, "tas_koyu")


def cati(en, boy, z, r, tip="besik", sacak=SACAK, adim=0.4):
    """Kiremit sıralarıyla çatı. besik: mahya x yönünde; kirma: dört yön."""
    x0, y0, x1, y1 = -sacak, -sacak, en + sacak, boy + sacak
    yari = (y1 - y0) / 2 if tip == "besik" else min((x1 - x0), (y1 - y0)) / 2
    h_top = yari * math.tan(EGIM)
    k, a, zc = 0, (x0, y0, x1, y1), z
    while True:
        ic = adim * (k + 1)
        if ic >= yari - 0.05:
            break
        b = (x0, y0 + ic, x1, y1 - ic) if tip == "besik" else (x0 + ic, y0 + ic, x1 - ic, y1 - ic)
        z1 = z + ic * math.tan(EGIM)
        lip = 0.035
        aa = (a[0] - (lip if tip == "kirma" else 0), a[1] - lip, a[2] + (lip if tip == "kirma" else 0), a[3] + lip)
        kesik(aa, b, zc - 0.03, z1, r.choice(KIREMITLER) if r.random() < 0.35 else "kiremit1")
        a, zc = b, z1
        k += 1
    if tip == "besik":
        kesik(a, (a[0], (a[1] + a[3]) / 2 - 0.01, a[2], (a[1] + a[3]) / 2 + 0.01), zc - 0.03, z + h_top, "kiremit1")
        ym = (y0 + y1) / 2
        kutu(x0 - 0.05, ym - 0.13, z + h_top - 0.08, x1 + 0.05, ym + 0.13, z + h_top + 0.12, "kiremit4")
    else:
        kesik(a, (a[0] + 0.01, a[1] + 0.01, a[2] - 0.01, a[3] - 0.01) if (a[2] - a[0]) > 0.1 else a, zc - 0.03, z + h_top, "kiremit1")
        kutu(a[0], (a[1] + a[3]) / 2 - 0.12, z + h_top - 0.05, a[2], (a[1] + a[3]) / 2 + 0.12, z + h_top + 0.12, "kiremit4")
    kutu(x0, y0 - 0.02, z - 0.16, x1, y0 + 0.04, z + 0.02, "ahsap")
    kutu(x0, y1 - 0.04, z - 0.16, x1, y1 + 0.02, z + 0.02, "ahsap")
    if tip == "kirma":
        kutu(x0 - 0.02, y0, z - 0.16, x0 + 0.04, y1, z + 0.02, "ahsap")
        kutu(x1 - 0.04, y0, z - 0.16, x1 + 0.02, y1, z + 0.02, "ahsap")
    return h_top


def alin(en, boy, z, h, r, renk="harc", tas=True):
    """Beşik çatının üçgen alınları (iki yan duvarın üstü)"""
    for (x, sgn) in ((0.0, -1), (en, 1)):
        n = 8
        for i in range(n):
            ya = boy / 2 * i / n
            za, zb = z + h * (i / n) - 0.02, z + h * ((i + 1) / n)
            kutu(x, ya, za, x + sgn * 0.05, boy - ya, zb, r.choice(TASLAR) if tas else renk)
            kutu(x - sgn * 0.3, ya, za, x, boy - ya, zb, renk)


def baca(x, y, z_alt, z_ust, renk="tas2"):
    kutu(x - 0.32, y - 0.32, z_alt, x + 0.32, y + 0.32, z_ust, renk)
    kutu(x - 0.4, y - 0.4, z_ust, x + 0.4, y + 0.4, z_ust + 0.08, "tas_koyu")
    kutu(x - 0.12, y - 0.3, z_ust + 0.08, x + 0.12, y + 0.3, z_ust + 0.3, "kiremit2")
    kutu(x - 0.38, y - 0.38, z_ust + 0.3, x + 0.38, y + 0.38, z_ust + 0.36, "kiremit4")


def zeytin_agaci(x, y, z, r, olcek=1.0):
    """Yaşlı zeytin: eğri gövde, gri-yeşil öbekler"""
    o = olcek
    kutu(x - 0.22 * o, y - 0.22 * o, z - 0.3, x + 0.22 * o, y + 0.22 * o, z + 1.2 * o, "ahsap_koyu")
    kutu(x - 0.15 * o + 0.2 * o, y - 0.15 * o, z + 1.1 * o, x + 0.15 * o + 0.35 * o, y + 0.15 * o, z + 2.0 * o, "ahsap_koyu")
    for _ in range(12):
        w = r.uniform(0.45, 0.8) * o
        a, u = r.uniform(0, 2 * math.pi), r.uniform(0.2, 1.9) * o
        xx, yy = x + 0.25 * o + u * math.cos(a), y + u * math.sin(a)
        zz = z + r.uniform(2.0, 2.9) * o - 0.25 * u
        kutu(xx - w, yy - w * 0.8, zz, xx + w, yy + w * 0.8, zz + w * 0.9, r.choice(["zeytin_yaprak", "zeytin_yaprak", "zeytin"]))


def servi(x, y, z, boy=8.0, n=7):
    """Servi: tek parça iğ biçimi (dönel yüzey), dipte kısa gövde"""
    silindir(x, y, z - 0.3, z + 0.7, 0.16, "ahsap_koyu", 6)
    profil = [(0.55, 0.5), (0.9, 0.16), (0.95, 0.32), (0.82, 0.55), (0.55, 0.78), (0.25, 0.94), (0.0, 1.0)]
    v = []
    for (rr, t) in profil[:-1]:
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * (len(v) // n % 2)) / n
            v.append((x + rr * boy / 8.5 * math.cos(a), y + rr * boy / 8.5 * math.sin(a), z + t * boy))
    v.append((x, y, z + boy))
    k = len(profil) - 1
    f = [tuple(range(n - 1, -1, -1))]
    for j in range(k - 1):
        for i in range(n):
            f.append((j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i))
    f += [((k - 1) * n + i, (k - 1) * n + (i + 1) % n, k * n) for i in range(n)]
    ekle(v, f, "servi")


def calilik(x, y, z, r, w=0.5):
    for _ in range(3):
        a = r.uniform(0.6, 1.0) * w
        xx, yy = x + r.uniform(-w, w) * 0.6, y + r.uniform(-w, w) * 0.6
        kutu(xx - a, yy - a, z - 0.1, xx + a, yy + a, z + a * r.uniform(0.8, 1.3), r.choice(["ot", "asma2", "zeytin"]))


def kuru_tas_duvar(h, noktalar, r, yuk=1.0, kal=0.55, bos=()):
    """Yere uyan kuru taş duvar: köşe noktaları boyunca, her 1,6 m'de bir kademe; üstte tek tek taşlar.
    bos: duvarda açıklık (x0, y0, x1, y1) dikdörtgenleri (kapı)."""
    for (ax, ay), (bx, by) in zip(noktalar, noktalar[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, round(L / 1.6))
        ux, uy = (bx - ax) / L, (by - ay) / L
        for k in range(n):
            t0, t1 = k * L / n, (k + 1) * L / n
            x0, y0 = ax + ux * t0, ay + uy * t0
            x1, y1 = ax + ux * t1, ay + uy * t1
            xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
            if any(q[0] <= xm <= q[2] and q[1] <= ym <= q[3] for q in bos):
                continue
            lo, hi = yer_bandi(h, min(x0, x1) - 0.01, min(y0, y1) - 0.01, max(x0, x1) + 0.01, max(y0, y1) + 0.01, 2)
            zt = (lo + hi) / 2 + yuk
            # duvarın gövdesi (yamaçta altı yere gömülür)
            px, py = -uy * kal / 2, ux * kal / 2
            kutu(min(x0, x1) - abs(px), min(y0, y1) - abs(py), lo - 0.4, max(x0, x1) + abs(px), max(y0, y1) + abs(py), zt, "tas_koyu")
            # yüzde ve üstte tek tek taşlar
            s = 0.0
            while s < t1 - t0 - 0.1:
                w = r.uniform(0.55, 0.95)
                e = min(s + w, t1 - t0)
                xa, ya = x0 + ux * s, y0 + uy * s
                xb, yb = x0 + ux * e, y0 + uy * e
                kutu(min(xa, xb) - abs(px) - 0.03, min(ya, yb) - abs(py) - 0.03, zt - 0.05,
                     max(xa, xb) + abs(px) + 0.03, max(ya, yb) + abs(py) + 0.03, zt + r.uniform(0.12, 0.22), r.choice(TASLAR))
                for yan in (-1, 1):
                    zz = lo + r.uniform(0.1, 0.4)
                    if zz < zt - 0.3 and r.random() < 0.5:
                        qx, qy = yan * (abs(px) + 0.02) * (1 if abs(uy) > 0.5 else 0), yan * (abs(py) + 0.02) * (1 if abs(ux) > 0.5 else 0)
                        kutu(min(xa, xb) + qx - 0.02, min(ya, yb) + qy - 0.02, zz, max(xa, xb) + qx + 0.02, max(ya, yb) + qy + 0.02,
                             zz + r.uniform(0.25, 0.4), r.choice(TASLAR))
                s = e + 0.05


def kaide(x0, y0, x1, y1, z_alt, z_ust, r):
    """Binanın yamaçtaki taş kaidesi (alt: yerin en alçağının biraz altı)"""
    kutu(x0, y0, z_alt, x1, y1, z_ust, "tas_koyu")
    C = {"on": Cephe(x0, y0, 1, 0, 0, -1, x1 - x0, z_alt), "arka": Cephe(x1, y1, -1, 0, 0, 1, x1 - x0, z_alt),
         "sol": Cephe(x0, y1, 0, -1, -1, 0, y1 - y0, z_alt), "sag": Cephe(x1, y0, 0, 1, 1, 0, y1 - y0, z_alt)}
    if z_ust - z_alt > 1.0:
        for c in C.values():
            tas_orgu(c, z_ust - z_alt, r, z_bas=0.25, yogun=0.45)


def tas_ev(en, boy, kat, r, kapi_u=None, cift_kapi=True, baca_x=None, yogun=0.75, kirma=False, pencereler=None):
    """Taş ev: (0,0)-(en,boy) üstünde, OFSET'e göre. Pencereler cephe başına (u, kat, kepenk)."""
    yuk = kat * KAT
    kutu(0.02, 0.02, 0, en - 0.02, boy - 0.02, yuk, "harc")
    C = dort_cephe(en, boy)
    kapi(C["on"], kapi_u if kapi_u is not None else en / 2, r, cift=cift_kapi)
    for s_, liste in (pencereler or {}).items():
        for (u, k, kp) in liste:
            pencere(C[s_], u, k * KAT + 0.9, r, kepenk=kp)
    for c in C.values():
        tas_orgu(c, yuk, r, yogun=yogun)
        kose_taslari(c, yuk, r)
    if kat > 1:
        for c in C.values():
            c.kutu(-0.06, c.en + 0.06, KAT - 0.12, KAT + 0.04, 0.0, 0.09, "tas_koyu")
    h = cati(en, boy, yuk, r, tip="kirma" if kirma else "besik")
    if not kirma:
        alin(en, boy, yuk, h - SACAK * math.tan(EGIM), r)
    if baca_x is not None:
        baca(baca_x, boy / 2 + 0.8, yuk, yuk + h + 0.6)
    return yuk


# ---------------- yapılar ----------------

def surek_kulubu():
    """Küçükçetmi Sürek Kulübü: çiftlik evi = kulüp evi, yanında ayrı ev, Kangal barınağı, kuru taş avlu."""
    r = random.Random(2211)
    temizle()
    h = yer("bina_surek")
    E, Bo = h.en / 2, h.boy / 2   # 27 x 13
    # avlu toprağı (taban kutusunu da belirler: tam en x boy)
    yer_ortusu(h, -E, -Bo, E, Bo, 2.0, "toprak", ust=0.12)
    # avlu duvarı: kapı önde, ortada
    d = 0.35
    kose = [(-E + d, -Bo + d), (E - d, -Bo + d), (E - d, Bo - d), (-E + d, Bo - d), (-E + d, -Bo + d)]
    kapi_x = (-2.0, 2.0)
    kuru_tas_duvar(h, kose, r, yuk=1.05, bos=[(kapi_x[0], -Bo, kapi_x[1], -Bo + 1.0)])
    # kapı ayakları ve ahşap çift kanat
    zk = h(0, -Bo + d)
    for x in kapi_x:
        kutu(x - 0.4, -Bo + d - 0.4, zk - 0.4, x + 0.4, -Bo + d + 0.4, zk + 1.7, "tas2")
        kutu(x - 0.5, -Bo + d - 0.5, zk + 1.7, x + 0.5, -Bo + d + 0.5, zk + 1.9, "tas_koyu")
    for (a, b) in ((kapi_x[0] + 0.4, -0.03), (0.03, kapi_x[1] - 0.4)):
        xx = a
        while xx < b - 0.05:
            kutu(xx, -Bo + d - 0.05, zk + 0.1, min(xx + 0.17, b), -Bo + d + 0.05, zk + 1.45 + r.uniform(-0.03, 0.03), "ahsap")
            xx += 0.2
        for zz in (0.35, 1.15):
            kutu(a, -Bo + d - 0.1, zk + zz, b, -Bo + d - 0.05, zk + zz + 0.12, "ahsap_koyu")
    # kapıdan eve taş yol (yere uyan basamaklar)
    y = -Bo + 1.0
    while y < 0.6:
        zz = h(0, y)
        for x in (-0.9, 0.0, 0.9):
            kutu(x - 0.42 + r.uniform(-0.05, 0.05), y, zz - 0.2, x + 0.42, y + 0.55, zz + 0.22, r.choice(TASLAR))
        y += 0.62

    # kulüp evi (çiftlik evi): iki katlı taş, arka ortada; yamaçta taş kaideye oturur
    en, boy = 15.0, 8.0
    x0, y0 = -8.5, 1.5
    lo, hi = yer_bandi(h, x0 - 1.5, y0 - 2.4, x0 + en + 1.5, y0 + boy + 1.0)
    z = (lo + hi) / 2 + 0.6   # arkası yamaca gömülü (yamaç evi), önü taş sekide
    kaide(x0 - 1.5, y0 - 2.4, x0 + en + 1.5, y0 + boy + 1.0, lo - 0.4, z, r)   # önünde taş seki
    for i in range(int((z - h(0, y0 - 3.4)) / 0.3) + 1):   # sekiye basamak
        zz = z - i * 0.3
        kutu(x0 + en / 2 - 1.3, y0 - 2.4 - (i + 1) * 0.34, lo - 0.4, x0 + en / 2 + 1.3, y0 - 2.4 - i * 0.34, zz, "tas_koyu")
    OFSET[:] = [x0, y0, z]
    p = {"on": [(1.8, 0, "acik"), (4.6, 0, "acik"), (10.4, 0, "acik"), (13.2, 0, "acik"),
                (1.8, 1, "acik"), (4.6, 1, "kapali"), (7.5, 1, "acik"), (10.4, 1, "acik"), (13.2, 1, "acik")],
         "arka": [(3.0, 1, "acik"), (7.5, 1, "acik"), (12.0, 1, "kapali")],
         "sol": [(4.0, 0, "acik"), (4.0, 1, "acik")], "sag": [(4.0, 0, "kapali"), (4.0, 1, "acik")]}
    yuk = tas_ev(en, boy, 2, r, kapi_u=en / 2, baca_x=3.2, yogun=0.55, pencereler=p)
    baca(en - 3.2, boy / 2 + 0.8, yuk, yuk + 4.2)
    # sekide ağaç altında masa ve sandalyeler (buluşma yeri)
    for (mx, my) in ((3.0, -1.3), (12.0, -1.3)):
        kutu(mx - 0.9, my - 0.45, 0.72, mx + 0.9, my + 0.45, 0.78, "ahsap")
        for dx in (-0.75, 0.75):
            kutu(mx + dx - 0.06, my - 0.4, 0, mx + dx + 0.06, my + 0.4, 0.72, "ahsap_koyu")
        for sx in (-0.6, 0.0, 0.6):
            for sy in (-0.75, 0.75):
                kutu(mx + sx - 0.2, my + sy - 0.2, 0, mx + sx + 0.2, my + sy + 0.2, 0.45, "ahsap_koyu")
                kutu(mx + sx - 0.2, my + sy + (0.17 if sy > 0 else -0.21), 0.45, mx + sx + 0.2, my + sy + (0.21 if sy > 0 else -0.17), 0.95, "ahsap_koyu")
    for px in (0.6, 6.2, 8.8, 14.4):
        kutu(px - 0.2, -2.2, 0, px + 0.2, -1.8, 0.4, "saksi")
        kutu(px - 0.3, -2.3, 0.4, px + 0.3, -1.7, 0.9, r.choice(["asma", "zeytin"]))
    # cepheye tırmanan asma
    for _ in range(26):
        u, zz = r.uniform(8.6, 10.0), r.uniform(0.8, 5.5)
        w = r.uniform(0.15, 0.32)
        if not (9.6 < u + w and u - w < 11.2 and zz < 2.4):
            kutu(u - w, -0.2, zz - w, u + w, 0.0, zz + w, r.choice(["asma", "asma2"]))
    OFSET[:] = [0.0, 0.0, 0.0]

    # ayrı ev (vikide: kulüp evinin yanındaki ayrı ev): tek katlı taş
    en2, boy2 = 7.0, 6.0
    x0, y0 = 12.0, -2.5
    lo, hi = yer_bandi(h, x0 - 0.6, y0 - 1.2, x0 + en2 + 0.6, y0 + boy2 + 0.6)
    z = (lo + hi) / 2 + 0.5
    kaide(x0 - 0.6, y0 - 1.2, x0 + en2 + 0.6, y0 + boy2 + 0.6, lo - 0.4, z, r)
    for i in range(int((z - lo) / 0.3) + 1):
        kutu(x0 + 2.2, y0 - 1.2 - (i + 1) * 0.32, lo - 0.4, x0 + 3.8, y0 - 1.2 - i * 0.32, z - i * 0.3, "tas_koyu")
    OFSET[:] = [x0, y0, z]
    tas_ev(en2, boy2, 1, r, kapi_u=3.0, cift_kapi=False, baca_x=en2 - 1.5, yogun=0.55,
           pencereler={"on": [(1.2, 0, "acik"), (5.4, 0, "kapali")], "sag": [(2.0, 0, "acik")],
                       "sol": [(4.0, 0, "acik")]})
    for i in range(3):
        kutu(4.3 + i * 0.5, -0.8, 0, 4.6 + i * 0.5, -0.5, 0.35, "saksi")
        kutu(4.2 + i * 0.5, -0.9, 0.35, 4.7 + i * 0.5, -0.4, 0.75, r.choice(["asma", "zeytin"]))
        kutu(4.38 + i * 0.5, -0.7, 0.75, 4.52 + i * 0.5, -0.6, 0.85, r.choice(["cicek", "cicek2"]))
    OFSET[:] = [0.0, 0.0, 0.0]

    # Kangal barınağı: arkası taş, önü açık ahşap sundurma; önünde çitli koşu yeri
    x0, x1, y0, y1 = -24.5, -13.5, 2.5, 6.0
    lo, hi = yer_bandi(h, x0, y0, x1, y1)
    z = hi + 0.15
    kaide(x0, y0, x1, y1, lo - 0.4, z, r)
    kutu(x0, y1 - 0.45, z, x1, y1, z + 2.3, "tas2")                    # arka taş duvar
    for xx in (x0, x1 - 0.45):
        kutu(xx, y0, z, xx + 0.45, y1, z + 2.3, "tas2")                 # yan duvarlar
    for k in range(5):
        xx = x0 + 0.4 + k * (x1 - x0 - 0.8) / 4
        kutu(xx - 0.09, y0 + 0.1, z, xx + 0.09, y0 + 0.28, z + 1.9, "ahsap_koyu")
    # bölmeler
    for k in range(1, 4):
        xx = x0 + k * (x1 - x0) / 4
        kutu(xx - 0.05, y0 + 0.3, z, xx + 0.05, y1 - 0.45, z + 1.0, "ahsap")
    kesik((x0 - 0.3, y0 - 0.6, x1 + 0.3, y0 - 0.5), (x0 - 0.3, y1 + 0.1, x1 + 0.3, y1 + 0.2), z + 1.95, z + 2.6, "kiremit2")
    xx = x0 - 0.3
    while xx < x1 + 0.3:
        kutu(xx, y0 - 0.62, z + 1.95, xx + 0.22, y1 + 0.2, z + 2.64, "kiremit1")
        xx += 0.5
    for k in range(4):   # samanlı yatak yerleri
        xx = x0 + 0.6 + k * (x1 - x0) / 4
        kutu(xx, y0 + 1.6, z, xx + 1.4, y1 - 0.8, z + 0.18, "cicek2")
    # koşu yeri: ahşap direk ve iki sıra kuşak
    cx0, cx1, cy0, cy1 = -25.0, -13.0, -9.0, y0
    direk = []
    for t in range(0, 13):
        direk.append((cx0 + (cx1 - cx0) * t / 12, cy0))
    for t in range(1, 7):
        direk.append((cx0, cy0 + (cy1 - cy0) * t / 6))
        direk.append((cx1, cy0 + (cy1 - cy0) * t / 6))
    for (px, py) in direk:
        zz = h(px, py)
        kutu(px - 0.07, py - 0.07, zz - 0.3, px + 0.07, py + 0.07, zz + 1.35, "ahsap_koyu")
    for (ax, ay, bx, by) in ((cx0, cy0, cx1, cy0), (cx0, cy0, cx0, cy1), (cx1, cy0, cx1, cy1)):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, round(L / 2.0))
        for k in range(n):
            xa, ya = ax + (bx - ax) * k / n, ay + (by - ay) * k / n
            xb, yb = ax + (bx - ax) * (k + 1) / n, ay + (by - ay) * (k + 1) / n
            zz = (h(xa, ya) + h(xb, yb)) / 2
            for kz in (0.55, 1.15):
                kutu(min(xa, xb) - 0.03, min(ya, yb) - 0.03, zz + kz, max(xa, xb) + 0.03, max(ya, yb) + 0.03, zz + kz + 0.09, "ahsap")
    # koşu yerinde su yalağı
    zz = h(-15.0, -6.0)
    kutu(-16.2, -6.4, zz - 0.2, -14.2, -5.6, zz + 0.45, "tas2")
    kutu(-16.0, -6.25, zz + 0.3, -14.4, -5.75, zz + 0.46, "kepenk")

    # zeytinler ve çalılar (avlu)
    for (x, y, o) in ((-9.0, -6.5, 1.0), (7.5, -7.0, 1.1), (21.5, -9.0, 0.9), (-3.5, 10.6, 0.8), (23.0, 9.0, 1.0)):
        zeytin_agaci(x, y, h(x, y), r, o)
    for _ in range(18):
        x, y = r.uniform(-E + 1.5, E - 1.5), r.uniform(-Bo + 1.5, Bo - 1.5)
        if -26 < x < -12.5 and -9.5 < y < 6.5:
            continue
        if -10.5 < x < 8.5 and -1.5 < y < 10.5:
            continue
        if 11 < x < 20 and -4.5 < y < 4.5:
            continue
        if -1.5 < x < 1.5 and y < 1:
            continue
        calilik(x, y, h(x, y), r, r.uniform(0.35, 0.6))
    disari("kucukcetmi-surek-kulubu")


def iskele_mescidi(minareli=False):
    """İskele Mescidi: badanalı küçük mescit, kırma kiremit çatı, kemerli kafesli pencereler, önde taş avlucuk."""
    r = random.Random(1923)
    temizle()
    h = yer("yapi_iskele_mescidi")
    E, Bo = h.en / 2, h.boy / 2   # 3.5 x 6
    lo, hi = yer_bandi(h, -E, -Bo, E, Bo)
    z = hi + 0.2
    # taş döşeli taban (bütün taban kutusu): yamaçta kaide
    kaide(-E, -Bo, E, Bo, lo - 0.4, z, r)
    y = -Bo + 0.45
    while y < -Bo + 3.35:   # döşeme taşları: sıra sıra, aralarında derz
        x = -E + 0.08 + r.uniform(0, 0.25)
        while x < E - 0.5:
            w = r.uniform(0.38, 0.62)
            kutu(x, y, z, min(x + w, E - 0.45), y + 0.4, z + r.uniform(0.03, 0.05), r.choice(["tas3", "tas1", "tas4"]))
            x += w + 0.05
        y += 0.45
    # önde tek basamak (taban kutusunun içinde)
    kutu(-1.2, -Bo, lo - 0.4, 1.2, -Bo + 0.4, z - 0.16, "tas_koyu")
    # gövde: 6 x 8,4 m, duvar 4,4 m
    en, boy, yuk = 6.0, 8.4, 4.4
    x0, y0 = -3.0, -Bo + 3.4
    OFSET[:] = [x0, y0, z]
    kutu(0.02, 0.02, 0, en - 0.02, boy - 0.02, yuk, "badana")
    C = dort_cephe(en, boy)
    kapi(C["on"], en / 2, r, en=1.2, boy=2.4, renk="ahsap", cift=True, kemer=True, basamak=True)
    for s_ in ("sol", "sag"):
        for u in (2.2, 6.2):
            pencere(C[s_], u, 1.3, r, en=0.85, boy=1.5, kepenk="yok", kemer=True, kafes=True)
        pencere(C[s_], 4.2, 3.2, r, en=0.5, boy=0.6, kepenk="yok", kemer=True, kafes=True)
    for u in (1.4, 4.6):
        pencere(C["on"], u, 1.3, r, en=0.7, boy=1.3, kepenk="yok", kemer=True, kafes=True)
    pencere(C["arka"], en / 2, 3.0, r, en=0.6, boy=0.7, kepenk="yok", kemer=True, kafes=True)
    for c in C.values():
        badana_kir(c, yuk, r, dokuk=1)
        c.kutu(0, c.en, 0, 0.55, 0.0, 0.05, "tas2")         # taş eteği
        c.kutu(-0.05, c.en + 0.05, yuk - 0.25, yuk, 0.0, 0.08, "badana_kir")   # saçak silmesi
    cati(en, boy, yuk, r, tip="kirma", sacak=0.55)
    # kapının üstünde küçük saçak
    kesik((en / 2 - 1.3, -1.1, en / 2 + 1.3, -1.0), (en / 2 - 1.3, -0.05, en / 2 + 1.3, 0.0), 2.95, 3.45, "kiremit2")
    for xx in (en / 2 - 1.2, en / 2 + 1.1):
        kutu(xx - 0.05, -1.05, 2.6, xx + 0.05, -0.2, 2.98, "ahsap_koyu")
    OFSET[:] = [0.0, 0.0, z]
    # abdest çeşmesi: avlucuğun sol duvarında taş tekne ve musluklar, önünde taburelerin yeri
    kutu(-E + 0.05, -Bo + 0.6, 0, -E + 0.55, -Bo + 2.9, 1.5, "tas2")
    kutu(-E + 0.55, -Bo + 0.7, 0, -E + 0.95, -Bo + 2.8, 0.35, "tas_koyu")
    for k in range(3):
        yy = -Bo + 1.1 + k * 0.7
        kutu(-E + 0.55, yy - 0.03, 0.85, -E + 0.75, yy + 0.03, 0.91, "demir")
        kutu(-E + 1.3, yy - 0.17, 0, -E + 1.62, yy + 0.17, 0.32, "tas3")
    # sağda kısa parapet ve saksılar
    kutu(E - 0.4, -Bo + 0.1, 0, E - 0.05, -Bo + 3.3, 0.8, "badana")
    for k in range(3 if not minareli else 2):
        yy = -Bo + 0.6 + k * 0.9
        kutu(E - 0.75, yy - 0.18, 0, E - 0.45, yy + 0.18, 0.34, "saksi")
        kutu(E - 0.85, yy - 0.28, 0.34, E - 0.35, yy + 0.28, 0.8, r.choice(["asma", "zeytin"]))
    if minareli:
        # vikideki çizim gibi: küçük, tek şerefeli taş minare, kurşun külah (ön sağ köşe)
        mx, my = E - 1.0, -Bo + 1.0 + 3.4 - 1.0
        kutu(mx - 0.75, my - 0.75, 0, mx + 0.75, my + 0.75, 2.6, "tas2")
        silindir(mx, my, 2.6, 9.0, 0.55, "badana", 10)
        silindir(mx, my, 7.4, 7.7, 0.85, "tas_koyu", 10)
        for i in range(10):
            a = 2 * math.pi * i / 10
            kutu(mx + 0.8 * math.cos(a) - 0.04, my + 0.8 * math.sin(a) - 0.04, 7.7, mx + 0.8 * math.cos(a) + 0.04, my + 0.8 * math.sin(a) + 0.04, 8.3, "badana_kir")
        silindir(mx, my, 9.0, 9.25, 0.62, "tas_koyu", 10)
        koni(mx, my, 9.25, 11.6, 0.62, "sac", 10)
        silindir(mx, my, 11.6, 12.0, 0.035, "demir", 6)
    OFSET[:] = [0.0, 0.0, 0.0]
    disari("iskele-mescidi-minareli" if minareli else "iskele-mescidi")


def rum_mezarligi():
    """Rum Mezarlığı: alçak kuru taş duvar, kapalı demir kapı, yazısız sade mezar taşları, iki servi, zeytin."""
    r = random.Random(1923 + 65)
    temizle()
    h = yer("yapi_rum_mezarligi")
    E, Bo = h.en / 2, h.boy / 2   # 10 x 12
    yer_ortusu(h, -E, -Bo, E, Bo, 2.0, "kuru_ot", ust=0.1)
    d = 0.3
    kose = [(-E + d, -Bo + d), (E - d, -Bo + d), (E - d, Bo - d), (-E + d, Bo - d), (-E + d, -Bo + d)]
    kx = (3.0, 5.0)   # kapı önde, Eski Kilise tarafına yakın
    kuru_tas_duvar(h, kose, r, yuk=1.0, kal=0.5, bos=[(kx[0], -Bo, kx[1], -Bo + 0.9)])
    zk = h((kx[0] + kx[1]) / 2, -Bo + d)
    for x in kx:
        kutu(x - 0.3, -Bo + d - 0.3, zk - 0.4, x + 0.3, -Bo + d + 0.3, zk + 1.55, "tas2")
        kutu(x - 0.38, -Bo + d - 0.38, zk + 1.55, x + 0.38, -Bo + d + 0.38, zk + 1.7, "tas_koyu")
    # kapalı demir kapı: iki kanat, dikey çubuklar, iki kuşak
    a, b = kx[0] + 0.3, kx[1] - 0.3
    for zz in (0.15, 0.75, 1.3):
        kutu(a, -Bo + d - 0.03, zk + zz, b, -Bo + d + 0.03, zk + zz + 0.06, "demir")
    xx = a + 0.05
    while xx < b - 0.03:
        kutu(xx - 0.018, -Bo + d - 0.02, zk + 0.05, xx + 0.018, -Bo + d + 0.02, zk + 1.45, "demir")
        xx += 0.14
    kutu((a + b) / 2 - 0.04, -Bo + d - 0.06, zk + 0.7, (a + b) / 2 + 0.04, -Bo + d + 0.06, zk + 0.95, "demir")  # zincir/kilit
    # kapıdan içeri toprak yol
    yer_ortusu(lambda x, y: h(x, y) + 0.03, kx[0] + 0.2, -Bo + d, kx[1] - 0.2, 4.0, 1.0, "toprak", ust=0.1)
    # mezarlar: sıralar (yatık taş ve baş taşı), yer yer eğilmiş, bazısı yalnız baş taşı
    sira_y = [-8.6, -5.4, -2.2, 1.0, 4.2, 7.4]
    for j, yy in enumerate(sira_y):
        for i, xx in enumerate((-7.6, -5.2, -2.8, -0.4, 6.8)):
            if r.random() < 0.28:
                continue
            x = xx + r.uniform(-0.25, 0.25)
            y = yy + r.uniform(-0.2, 0.2)
            lo, hi = yer_bandi(h, x - 0.45, y - 0.1, x + 0.45, y + 2.0, 2)
            tas = r.choice(["mermer", "tas1", "tas4", "mermer"])
            if r.random() < 0.75:
                kutu(x - 0.45, y, lo - 0.2, x + 0.45, y + 1.95, hi + 0.22, tas)                     # yatık taş
                kutu(x - 0.38, y + 0.08, hi + 0.22, x + 0.38, y + 1.87, hi + 0.27, r.choice(TASLAR))
            zb = h(x, y + 2.05)
            egik = r.uniform(-0.12, 0.12) if r.random() < 0.4 else 0.0
            tb = r.uniform(0.75, 1.05)
            # baş taşı: dikdörtgen gövde + kesik üst (yuvarlağa yakın), yazısız
            kutu(x - 0.32, y + 1.98, zb - 0.3, x + 0.32, y + 2.12, zb + tb, tas)
            kesik((x - 0.32, y + 1.98, x + 0.32, y + 2.12), (x - 0.14, y + 1.98, x + 0.14, y + 2.12), zb + tb, zb + tb + 0.16, tas)
            if egik:
                # eğik baş taşı: üst kısmı biraz öne kaykılmış (yaşanmışlık)
                kutu(x - 0.3 + egik, y + 2.0, zb + tb * 0.6, x + 0.3 + egik, y + 2.1, zb + tb, tas)
    # bir köşede yığılmış eski taşlar
    for _ in range(7):
        x, y = r.uniform(7.0, 8.8), r.uniform(8.6, 10.6)
        zz = h(x, y)
        kutu(x - 0.3, y - 0.2, zz - 0.1, x + 0.3, y + 0.2, zz + r.uniform(0.2, 0.4), r.choice(TASLAR))
    # iki servi (içeride), yaşlı zeytin, maki ve kuru ot öbekleri
    for (x, y, b) in ((2.0, 9.6, 8.5), (-8.4, -1.0, 7.0)):
        servi(x, y, h(x, y), b)
    zeytin_agaci(3.6, -5.5, h(3.6, -5.5), r, 1.25)
    for _ in range(26):
        x, y = r.uniform(-E + 1.0, E - 1.0), r.uniform(-Bo + 1.2, Bo - 1.0)
        if kx[0] - 0.3 < x < kx[1] + 0.3 and y < 4.5:
            continue
        calilik(x, y, h(x, y), r, r.uniform(0.2, 0.42))
    disari("rum-mezarligi")


if __name__ == "__main__":
    surek_kulubu()
    iskele_mescidi(False)
    if MINARELI:
        iskele_mescidi(True)
    rum_mezarligi()
    print("tamam")
