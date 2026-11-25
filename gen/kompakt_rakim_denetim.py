"""Tek harita yapılarının zemine oturması denetimi (24 Kasım, Kemal: "binalar havada asılı, bazıları yarı gömülü").

Yalnız okur, hiçbir dosyaya yazmaz. Her yapı (`duzada-yapilar.geojson`, katman `yapi`; iskele ve mendirek
denizde kalır, denetime girmez) için tabanın altındaki **çizilen** zemini ölçer ve tabanın kotunu onunla karşılaştırır:

- Çizilen zemin: KKM'nin zemin katının en ayrıntılı çizimi (`zeminKatmani.ts`): kıyı şeridi yumuşatılmış rakım
  (`kiyiYumusat`), her 10 m'lik kare yükseklikleri birbirine yakın iki köşeden iki üçgene bölünmüş.
- Tabanın kotu üç türlü:
  - `veri`: verideki `kotM` (üretecin tabanın dört köşesinde ham rakım ortalaması; harita bunu kullanmaz),
  - `eski`: 24 Kasım'dan önce haritanın kullandığı (ham rakım, tabanın orta ve köşelerinin en alçağı),
  - `yeni`: bugün haritanın kullandığı (`tekVeri.ts` → `tabanKotu`; aynı kural burada da).
- Ölçüler (taban içinde ~2 m aralıklı noktalar, kenarlar dahil):
  - **havada**: kot − çizilen zeminin en alçağı (taban bir yerde yerden kopuk; yeni kuralda bu aralığı taş kaide
    kapatır, havada sayılmaz),
  - **gömülü**: çizilen zeminin ortalaması − kot (yapının yarısından fazlası toprağın altında mı).
  - **yokuş yukarı kenarı**: çizilen zeminin en yükseği − kot (yamaç tarafında yapının ne kadarı toprakta; bilgi).
  Eşik: havada > 0,3 m (kaidesiz), gömülü > 1,0 m. Ölçüler DENEME.
- Kendi zemini olan modeller (yamaca göre yapılan Blender modelleri: Sürek Kulübü, İskele Mescidi, Rum Mezarlığı,
  kule, antik duvar, mezarlık; kendi temeliyle The Imperial) eski kuralla durur (tabanın en alçak noktası; zemini,
  temeli kendi içinde): eşiğe sayılmaz, ayrı satırda yazılır. The Imperial 25 Kasım'dan beri verideki kotuyla
  (`modelKot`; tekVeri.ts → tabanKotu gibi).

  python gen/kompakt_rakim_denetim.py [--liste N]

Çıkış kodu: yeni kuralda eşiği aşan yapı varsa 1.
"""
import gzip, json, math, os, struct, sys

import numpy as np
from matplotlib.path import Path

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IZGARA = os.path.join(KOK, "public", "harita", "duzada-zemin.bin")
YAPILAR = os.path.join(KOK, "public", "harita", "duzada-yapilar.geojson")

HAVADA_ESIGI = 0.3
GOMULU_ESIGI = 1.0
# tekVeri.ts ile aynı (DENEME): taban, çizilen zeminin ortalamasına; yokuş yukarı tarafta en çok bu kadar gömülür
GOMME_SINIRI = 0.6
KAIDE_ESIGI = 0.15
# modelEsleme.ts / veri: yamaca göre yapılmış modeller (tabanın en alçak noktası 0)
YAMAC_MODELLERI = {
    "binalar/kucukcetmi-surek-kulubu.glb", "binalar/iskele-mescidi.glb", "binalar/rum-mezarligi.glb",
    "binalar/yangin-gozetleme-kulesi.glb", "binalar/antik-sur-kalintisi.glb", "binalar/merkez-mezarligi.glb",
    "binalar/the-imperial-kemskoy.glb",
}
TABANA_UYAR = {"ev", "dukkanli", "ciftlik", "yazlik", "depo"}
MODEL_ESLEME = {
    "bina_liman_kafe": "binalar/dondurmaci-kizlar.glb", "bina_surek": "binalar/kucukcetmi-surek-kulubu.glb",
    "yapi_iskele_mescidi": "binalar/iskele-mescidi.glb", "yapi_rum_mezarligi": "binalar/rum-mezarligi.glb",
}


def zemin_oku():
    ham = gzip.open(IZGARA).read()
    assert ham[:4] == b"DZZ1"
    n = struct.unpack("<I", ham[4:8])[0]
    b = json.loads(ham[8:8 + n].decode("utf-8"))
    # KKM gibi: çarpım çift duyarlıkla, sonra float32 (eşit köşegenlerde aynı üçgen seçilsin)
    h = (np.frombuffer(ham[8 + n:], dtype="<i2").astype(np.float64) * b["birim"]).astype(np.float32)
    return b, h.reshape(b["boy"], b["en"])


def _icinde(c, x, y):
    ic = False
    for a in range(len(c)):
        b = a - 1
        if (c[a][1] > y) != (c[b][1] > y) and x < (c[b][0] - c[a][0]) * (y - c[a][1]) / (c[b][1] - c[a][1]) + c[a][0]:
            ic = not ic
    return ic


def kiyi_yumusat(h, bas=None):
    """zeminKatmani.ts → kiyiBolgesi: kıyı şeridinde (5 x 5 içinde hem deniz hem kara, 4 m'den alçak) ağırlıklı ortalama"""
    R = 2
    boy, en = h.shape
    w1 = np.array([R + 1 - abs(d) for d in range(-R, R + 1)], np.float32)
    w = np.outer(w1, w1)
    top = np.zeros_like(h); kara = np.zeros(h.shape, bool); deniz = np.zeros(h.shape, bool)
    for dj in range(-R, R + 1):
        for di in range(-R, R + 1):
            v = np.roll(np.roll(h, -dj, 0), -di, 1)
            top += v * w[dj + R, di + R]
            kara |= v > 0; deniz |= v <= 0
    c = h.copy()
    m = (h < 4) & (h >= -6) & kara & deniz
    m[:R, :] = m[-R:, :] = False; m[:, :R] = m[:, -R:] = False
    c[m] = (top / w.sum())[m]
    if bas and bas.get("kiyiYumusatmaYok"):          # tekVeri.ts gibi: kara hücresi yumuşatılmaz, deniz yalnız alçak komşularla
        for j, i in zip(*np.nonzero(m)):
            if any(_icinde(cc, bas["x0"] + i * bas["hucre"], bas["y0"] + j * bas["hucre"]) for cc in bas["kiyiYumusatmaYok"]):
                if h[j, i] > 0:
                    c[j, i] = h[j, i]
                else:
                    t_ = a_ = 0.0
                    for dj in range(-R, R + 1):
                        for di in range(-R, R + 1):
                            v = h[j + dj, i + di]
                            if v < 4:
                                t_ += v * w[dj + R, di + R]; a_ += w[dj + R, di + R]
                    c[j, i] = t_ / a_
    return c


class Zemin:
    def __init__(self):
        self.b, self.ham = zemin_oku()
        # float32 değerler (KKM gibi), farklar float64 ile (KKM tarayıcıda çift duyarlıkla karşılaştırır)
        self.cizim = kiyi_yumusat(self.ham, self.b).astype(np.float64)
        self.ham = self.ham.astype(np.float64)

    def sahneye(self, p):
        b = self.b
        return ((p[0] - b["lng0"]) * b["mPerLng"], -(p[1] - b["lat0"]) * b["mPerLat"])

    def _ij(self, x, sz):
        b = self.b
        fi = (x - b["x0"]) / b["hucre"]; fj = (-sz - b["y0"]) / b["hucre"]
        i = np.clip(np.floor(fi).astype(int), 0, b["en"] - 2); j = np.clip(np.floor(fj).astype(int), 0, b["boy"] - 2)
        return i, j, np.clip(fi - i, 0, 1), np.clip(fj - j, 0, 1)

    def ham_rakim(self, x, sz):
        """tekVeri.ts → rakim: ham ızgaradan iki doğrusal ara değer"""
        h = self.ham; i, j, u, w = self._ij(np.asarray(x, float), np.asarray(sz, float))
        return (h[j, i] * (1 - u) + h[j, i + 1] * u) * (1 - w) + (h[j + 1, i] * (1 - u) + h[j + 1, i + 1] * u) * w

    def cizilen(self, x, sz):
        """tekVeri.ts → cizilenRakim: kıyısı yumuşatılmış ızgara, karenin iki üçgeni (zeminKatmani.ts'teki bölme)"""
        h = self.cizim; i, j, u, w = self._ij(np.asarray(x, float), np.asarray(sz, float))
        a, bb, c, d = h[j, i], h[j, i + 1], h[j + 1, i], h[j + 1, i + 1]
        ad = np.abs(a - d) < np.abs(bb - c)
        r1 = np.where(u >= w, a + u * (bb - a) + w * (d - bb), a + w * (c - a) + u * (d - c))
        r2 = np.where(u + w <= 1, a + u * (bb - a) + w * (c - a), d + (1 - u) * (c - d) + (1 - w) * (bb - d))
        return np.where(ad, r1, r2)


def taban_noktalari(z, halka, merkez, ex, en, boy):
    """Tabanın içinde ~2 m aralıklı noktalar, kenarlar dahil (tekVeri.ts → tabanOrnekleri ile aynı)"""
    nx = max(2, math.ceil(en / 2) + 1); nz = max(2, math.ceil(boy / 2) + 1)
    xs = []; zs = []
    for a in range(nx):
        for c in range(nz):
            s = (a / (nx - 1) - 0.5) * en; t = (c / (nz - 1) - 0.5) * boy
            xs.append(merkez[0] + s * ex[0] - t * ex[1]); zs.append(merkez[1] + s * ex[1] + t * ex[0])
    return np.array(xs), np.array(zs)


def main():
    liste = 15
    if "--liste" in sys.argv:
        liste = int(sys.argv[sys.argv.index("--liste") + 1])
    z = Zemin()
    yapilar = json.load(open(YAPILAR, encoding="utf-8"))["features"]
    satirlar = []
    for f in yapilar:
        p = f["properties"]
        if p.get("katman") != "yapi" or f["geometry"]["type"] != "Polygon":
            continue
        halka = [z.sahneye(c) for c in f["geometry"]["coordinates"][0]]
        merkez = z.sahneye(p["merkez"])
        ex = p["ex"]; en = float(p.get("en") or 6); boy = float(p.get("boy") or 6)
        if p.get("tur") in TABANA_UYAR and isinstance(p.get("modelEn"), (int, float)):
            en = float(p["modelEn"])  # sıra evde model tabandan geniş (yapiKatmani.ts)
        dosya = p.get("dosya") or MODEL_ESLEME.get(str(p["id"]))
        xs, zs = taban_noktalari(z, halka, merkez, ex, en, boy)
        cz = z.cizilen(xs, zs)
        dmin, dort, dmax = float(cz.min()), float(cz.mean()), float(cz.max())
        hx = np.array([merkez[0]] + [q[0] for q in halka]); hz = np.array([merkez[1]] + [q[1] for q in halka])
        eski = float(z.ham_rakim(hx, hz).min())
        yamac = dosya in YAMAC_MODELLERI
        yeni = eski if yamac else max(dort, dmax - GOMME_SINIRI)
        if isinstance(p.get("modelKot"), (int, float)):     # kendi kayalığıyla gelen model (The Imperial, 25 Kasım)
            yamac, yeni = True, float(p["modelKot"])
        kaide = 0.0 if yamac else max(0.0, yeni - dmin)
        satirlar.append(dict(id=p["id"], ad=p.get("ad"), tur=p.get("tur"), mahalle=p.get("mahalle"), dosya=dosya,
                             yamac=yamac, dmin=dmin, dort=dort, dmax=dmax, veri=p.get("kotM"), eski=eski, yeni=yeni, kaide=kaide,
                             x=merkez[0], z=merkez[1]))

    def olc(kot, s, kaideli):
        havada = kot - s["dmin"]
        if kaideli and s["kaide"] > KAIDE_ESIGI:
            havada = 0.0
        return havada, s["dort"] - kot, s["dmax"] - kot

    print(f"Tek harita yapıları: {len(satirlar)}; kendi zemini olan model (eşiğe sayılmaz): {sum(s['yamac'] for s in satirlar)}")
    print(f"Eşik: havada > {HAVADA_ESIGI} m (kaidesiz), gömülü (zemin ortalaması kotun üstünde) > {GOMULU_ESIGI} m\n")
    sonuc = {}
    for ad, alan, kaideli in [("veri (kotM)", "veri", False), ("eski (harita, 24 Kasım öncesi)", "eski", False), ("yeni (harita)", "yeni", True)]:
        h = g = y = 0; hm = gm = ym = 0.0; hl = []; gl = []
        for s in satirlar:
            if s[alan] is None or s["yamac"]:
                continue
            hv, gv, yv = olc(float(s[alan]), s, kaideli)
            if yv > GOMULU_ESIGI: y += 1
            ym = max(ym, yv)
            if hv > HAVADA_ESIGI: h += 1; hl.append((hv, s))
            if gv > GOMULU_ESIGI: g += 1; gl.append((gv, s))
            hm = max(hm, hv); gm = max(gm, gv)
        sonuc[alan] = (h, g, hl, gl)
        print(f"{ad:34s} havada {h:4d} (en çok {hm:5.1f} m) · gömülü {g:4d} (en çok {gm:5.1f} m)"
              f" · yokuş yukarı kenarı {GOMULU_ESIGI} m'den derin {y:4d} (en çok {ym:5.1f} m)")
    kaideli = [s for s in satirlar if s["kaide"] > KAIDE_ESIGI]
    print(f"\nYeni kuralda taş kaidesi görünen yapı: {len(kaideli)}; kaide en çok {max([s['kaide'] for s in kaideli] or [0]):.1f} m, "
          f"ortanca {float(np.median([s['kaide'] for s in kaideli] or [0])):.1f} m")

    def yazdir(baslik, l):
        print(f"\n{baslik}")
        for v, s in sorted(l, key=lambda t: -t[0])[:liste]:
            print(f"  {v:5.1f} m  {s['id']:28s} {str(s['ad'] or ''):28s} {s['tur']:9s} {s['mahalle']:20s} "
                  f"zemin {s['dmin']:.1f}/{s['dort']:.1f}/{s['dmax']:.1f} · veri {s['veri']} · eski {s['eski']:.1f} · yeni {s['yeni']:.1f}")

    yazdir("Eski kuralda havada (ilk {}):".format(liste), sonuc["eski"][2])
    yazdir("Eski kuralda gömülü (ilk {}):".format(liste), sonuc["eski"][3])
    if sonuc["yeni"][2] or sonuc["yeni"][3]:
        yazdir("Yeni kuralda havada:", sonuc["yeni"][2])
        yazdir("Yeni kuralda gömülü:", sonuc["yeni"][3])
    adli = [s for s in satirlar if s["ad"]]
    print("\nAdı olan yapılar (eski → yeni, çizilen zemin en alçak / ortalama / en yüksek):")
    for s in sorted(adli, key=lambda s: str(s["ad"])):
        print(f"  {str(s['ad']):32s} eski {s['eski']:6.1f} · yeni {s['yeni']:6.1f} · zemin {s['dmin']:.1f}/{s['dort']:.1f}/{s['dmax']:.1f}"
              f"{' · kaide %.1f m' % s['kaide'] if s['kaide'] > KAIDE_ESIGI else ''}{' · kendi zemini' if s['yamac'] else ''}")
    y = sonuc["yeni"]
    print(f"\n[{'temiz' if not (y[0] or y[1]) else 'SORUN'}] yeni kuralda eşiği aşan: havada {y[0]}, gömülü {y[1]}")
    return 1 if (y[0] or y[1]) else 0


if __name__ == "__main__":
    sys.exit(main())
