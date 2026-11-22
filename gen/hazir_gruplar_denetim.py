"""Hazır gruplar denetimi — public/harita/hazir-gruplar.json (taslak, Kemal onaylamadı).

Yalnız okur. Her madde "temiz" ya da "SORUN" yazar; sorun varsa çıkış kodu 1 olur.

Çeşidin kendi içinde:
  - kareler: her kare tek bir öğenin (yol, alan, arsa); harita dışına taşan yok
  - evler: arsasının içinde, birbirinin üstüne binmez (sıra evler yalnız kenardan değer), önü bir yola / meydana bakar
  - ağaç ve donatı: evin içinde değil, ağaç yol bandının üstünde değil
  - yollar: kademesinin eğim sınırını aşmaz (çeşidin en dik yamacıyla), konduğu yola / kıyıya bağlanır
  - şerit grupları en çok 4 sıra (duzada-kareler.json'daki derinlik); modeller KKM'de var
Adada (konabilirlik): her çeşidin adada kaç yol kesimine ya da boş kare öbeğine oturduğu sayılır
  (yol, yapı, korunan alan, kıyı engeli; eğim aralığı; şerit grubu yalnız boş karelere).

  python gen/hazir_gruplar_denetim.py           # denetim
  python gen/hazir_gruplar_denetim.py --yerler  # her çeşidin uygun yerlerinin ilk birkaçını da yazar
"""
import json, math, os, sys, warnings
from collections import defaultdict

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely import prepared

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_zemin_denetim as zd  # noqa: E402
from kompakt_taslak_uygula import elle_cikar  # noqa: E402  (KKM Düzenle'nin elle öğeleri bu üretecin girdisi değil)

warnings.filterwarnings("ignore", category=DeprecationWarning)
KOK = os.path.dirname(BURASI)
HARITA = os.path.join(KOK, "public", "harita")
GRUP = os.path.join(HARITA, "hazir-gruplar.json")
YON = {"on": (0, -1), "arka": (0, 1), "sol": (-1, 0), "sag": (1, 0)}
EGIM_CAPRAZ = 8.0     # DENEME: konan grubun yola koşut eğimi en çok (%)
KIYI_PAYI = 6.0       # DENEME: kıyı grubunun 0. sırası kıyı çizgisine en çok bu kadar uzak (m)
YOLA_PAY = 4.0        # DENEME: 0. sıradaki karenin önü konduğu yolun kenarına en çok bu kadar uzak (m)
ON_ORANI = 0.6        # DENEME: 0. sıranın en az bu kadarı konduğu yola değer (girişler her zaman)


def bina_tabani(b):
    cx, cy = b["merkez"]
    ex, ey = (b["en"] / 2, b["boy"] / 2) if b["yon"] in ("on", "arka") else (b["boy"] / 2, b["en"] / 2)
    return box(cx - ex, cy - ey, cx + ex, cy + ey)


def cesit_denetimi(c, yol_egim, modeller_var):
    """Bir çeşidin iç denetimi; sorun listesi döner."""
    sorun = []
    K = 8.0
    W, D = c["en"], c["boy"]
    sahip = {}
    for o in c["ogeler"]:
        if o["tip"] in ("yol", "alan", "arsa"):
            for k in o["kareler"]:
                k = tuple(k)
                if not (0 <= k[0] < W and 0 <= k[1] < D):
                    sorun.append(f"{o['yerel']} harita dışında {k}")
                if k in sahip:
                    sorun.append(f"kare {k} iki öğede: {sahip[k]}, {o['yerel']}")
                sahip[k] = o["yerel"]
    if len(sahip) != W * D:
        sorun.append(f"{W * D - len(sahip)} kare sahipsiz")
    arsa = {o["yerel"]: o for o in c["ogeler"] if o["tip"] == "arsa"}
    binalar = [o for o in c["ogeler"] if o["tip"] == "bina"]
    tabanlar = []
    for b in binalar:
        t = bina_tabani(b)
        a = arsa[b["arsa"]]
        xs = [k[0] for k in a["kareler"]]; ys = [k[1] for k in a["kareler"]]
        cer = box(min(xs) * K, min(ys) * K, (max(xs) + 1) * K, (max(ys) + 1) * K)
        if not cer.buffer(0.05).contains(t):
            sorun.append(f"{b['yerel']} arsasından taşıyor")
        if not a.get("on"):
            sorun.append(f"{b['yerel']} önü bir yola / meydana bakmıyor")
        tabanlar.append((b, t))
        if b["model"] not in modeller_var:
            sorun.append(f"{b['yerel']} modeli yok: {b['model']}")
    for i in range(len(tabanlar)):
        for j in range(i + 1, len(tabanlar)):
            if tabanlar[i][1].intersection(tabanlar[j][1]).area > 0.5:
                sorun.append(f"{tabanlar[i][0]['yerel']} ile {tabanlar[j][0]['yerel']} üst üste")
    yol_bant = unary_union([LineString(e).buffer(o["genislik"] / 2) for o in c["ogeler"] if o["tip"] == "yol"
                            for e in o["kenarlar"]] or [Point(-99, -99).buffer(0.1)])
    for o in c["ogeler"]:
        if o["tip"] in ("agac", "donati"):
            p = Point(o["m"])
            if o["model"] not in modeller_var:
                sorun.append(f"{o['yerel']} modeli yok: {o['model']}")
            for b, t in tabanlar:
                if t.buffer(-0.3).contains(p):
                    sorun.append(f"{o['yerel']} ({o['tur']}) {b['yerel']} evinin içinde")
            if o["tip"] == "agac" and yol_bant.buffer(-0.3).contains(p):
                sorun.append(f"{o['yerel']} ({o['tur']}) yolun üstünde")
    # yol eğimi ve bağlantı
    en_dik = c["egim"]["enCok"]
    ulasir = set()
    gecis = {tuple(k) for o in c["ogeler"] if o["tip"] == "yol" for k in o["kareler"]} | \
            {tuple(k) for o in c["ogeler"] if o["tip"] == "alan" and o["tur"] in ("meydan", "pazar", "rihtim", "avlu", "otopark")
             for k in o["kareler"]}
    yigin = [k for k in gecis if k[1] == 0]
    ulasir.update(yigin)
    while yigin:
        k = yigin.pop()
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                n = (k[0] + di, k[1] + dj)
                if n in gecis and n not in ulasir:
                    ulasir.add(n); yigin.append(n)
    acik_uc = 0
    for o in c["ogeler"]:
        if o["tip"] != "yol":
            continue
        for (a, b) in o["kenarlar"]:
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-6:
                continue
            e = en_dik * abs(dy) / L
            if e > yol_egim[o["kademe"]] + 1e-6:
                sorun.append(f"{o['yerel']} ({o['kademe']}) eğimi %{e:.0f} > %{yol_egim[o['kademe']]}")
                break
        if not any(tuple(k) in ulasir for k in o["kareler"]):
            sorun.append(f"{o['yerel']} ({o['kademe']}) konduğu yola bağlanmıyor")
        for k in o["kareler"]:
            if (k[0] in (0, W - 1) and k[1] > 0) or k[1] == D - 1:
                acik_uc += 1
                break
    if c["yer"] == "serit" and D > 4:
        sorun.append(f"şerit grubu {D} sıra (en çok 4)")
    if c["egim"]["enCok"] > 30:
        sorun.append("yamaç %30'dan dik (kare yok)")
    for o in c["ogeler"]:
        for ad in ("ad", "adi"):
            if ad in o:
                sorun.append(f"{o['yerel']} ad taşıyor")
    return sorun, acik_uc


# ------------------------------------------------------------------ ada: konabilirlik
class Ada:
    """Adanın verisi; çeşidi bir şeride yerleştirir ve uygun mu diye bakar."""

    def __init__(self):
        self.b, ham = zd.oku()
        self.Z = ham.astype(float) * self.b["birim"]
        b = self.b
        sf = json.load(open(os.path.join(HARITA, "duzada-sinirlar.geojson"), encoding="utf-8"))["features"]
        yf = elle_cikar(json.load(open(os.path.join(HARITA, "duzada-yollar.geojson"), encoding="utf-8")), "yollar")["features"]
        yp = elle_cikar(json.load(open(os.path.join(HARITA, "duzada-yapilar.geojson"), encoding="utf-8")), "yapilar")["features"]
        pf = json.load(open(os.path.join(HARITA, "duzada-parseller.geojson"), encoding="utf-8"))["features"]
        self.kj = json.load(open(os.path.join(HARITA, "duzada-kareler.json"), encoding="utf-8"))
        self.ada = self.gm(next(f["geometry"] for f in sf if f["properties"]["katman"] == "ada"))
        self.ada_ic = prepared.prep(self.ada.buffer(-3))
        self.kiyi = self.ada.exterior
        self.mahalle = {f["properties"]["id"]: self.gm(f["geometry"]) for f in sf if f["properties"]["katman"] == "mahalle"}
        self.yollar = {f["properties"]["id"]: (f["properties"], self.gm(f["geometry"])) for f in yf if f["properties"]["katman"] == "yol"}
        self.yol_alan = {k: g.buffer(p["genislik"] / 2 + 1.0, cap_style=2) for k, (p, g) in self.yollar.items()}
        self.yol_ids = list(self.yol_alan)
        self.yol_agac = STRtree([self.yol_alan[k] for k in self.yol_ids])
        engel = [self.gm(f["geometry"]) for f in yf if f["properties"]["katman"] in ("korunan", "meydancik")]
        engel += [self.gm(f["geometry"]) for f in sf if f["properties"]["katman"] == "imperial"]
        self.yapilar = [(f["properties"], self.gm(f["geometry"])) for f in yp]
        engel += [g for _, g in self.yapilar]
        self.engel = engel
        self.engel_agac = STRtree(engel)
        dolu_arsa = set()
        for p, _ in self.yapilar:
            if p.get("parsel"):
                dolu_arsa.add(p["parsel"])
            for q in p.get("parseller", []) or []:
                dolu_arsa.add(q)
        self.dolu_arsa = dolu_arsa
        self.parsel = {f["properties"].get("id"): f for f in pf}

    def gm(self, g):
        b = self.b
        return transform(lambda x, y, z=None: ((np.asarray(x) - b["lng0"]) * b["mPerLng"],
                                               (np.asarray(y) - b["lat0"]) * b["mPerLat"]), shape(g))

    def m(self, p):
        b = self.b
        return np.array([(p[0] - b["lng0"]) * b["mPerLng"], (p[1] - b["lat0"]) * b["mPerLat"]])

    def vek(self, d):
        b = self.b
        return np.array([d[0] * b["mPerLng"], d[1] * b["mPerLat"]])

    def kot(self, x, y):
        b, Z, H = self.b, self.Z, self.b["hucre"]
        fx = (np.asarray(x, float) - b["x0"]) / H
        fy = (np.asarray(y, float) - b["y0"]) / H
        i = np.clip(np.floor(fy).astype(int), 0, b["boy"] - 2)
        j = np.clip(np.floor(fx).astype(int), 0, b["en"] - 2)
        ty, tx = np.clip(fy - i, 0, 1), np.clip(fx - j, 0, 1)
        return (Z[i, j] * (1 - tx) * (1 - ty) + Z[i, j + 1] * tx * (1 - ty) + Z[i + 1, j] * (1 - tx) * ty + Z[i + 1, j + 1] * tx * ty)

    def serit_cercevesi(self, s, c0):
        """Şeridin c0. sütunundan başlayan yerel çerçeve: başlangıç (m), u ve n birim adımları (8 m)."""
        o = self.m(s["o"]); u = self.vek(s["u"]); n = self.vek(s["n"])
        return o + c0 * u, u, n

    def dunya(self, cer, x, y):
        o, u, n = cer
        return o + (x / 8.0) * u + (y / 8.0) * n

    def bos_kareler(self, s):
        """Şeridin sütunlarında boş karelerin derinliği: sütun no → boş sıraların kümesi."""
        bos = {}
        for (j, metre, derin, arsa_i, arsa_d) in s["s"]:
            arsa_id = self.kj["arsalar"][arsa_i] if arsa_i >= 0 else None
            dolu = arsa_d if (arsa_id and arsa_id in self.dolu_arsa) else 0
            bos[j] = set(range(dolu, derin))
        return bos

    def uygun(self, c, s, c0, ayrinti=False):
        """Çeşit bu şeridin c0. sütununa konabilir mi? (sebep listesi; boşsa uygun)"""
        W, D = c["en"], c["boy"]
        sebep = []
        sutun = {col[0]: col for col in s["s"]}
        if c["yer"] == "serit":
            bos = self.bos_kareler(s)
            for i in range(W):
                if (c0 + i) not in bos or not all(j in bos[c0 + i] for j in range(D)):
                    return ["boş kare yetmiyor"]
        else:
            if not all((c0 + i) in sutun for i in range(min(W, 2))):
                return ["şerit kısa"]
        cer = self.serit_cercevesi(s, c0)
        return self.uygun_cer(c, cer, s["yol"], ayrinti)

    def uygun_cer(self, c, cer, haric_yol=None, ayrinti=False):
        W, D = c["en"], c["boy"]
        sebep = []
        kose = [self.dunya(cer, 0, 0), self.dunya(cer, W * 8, 0), self.dunya(cer, W * 8, D * 8), self.dunya(cer, 0, D * 8)]
        P = Polygon(kose)
        if c["yer"] == "kiyi":
            on = LineString([kose[0], kose[1]])
            if on.hausdorff_distance(self.kiyi.intersection(on.buffer(KIYI_PAYI + 4))) > KIYI_PAYI + 4 \
                    or P.difference(self.ada).area > 0.04 * P.area:
                return ["kıyıya oturmuyor"]
        else:
            if not self.ada_ic.contains(P):
                return ["adanın dışına taşıyor"]
        if c["yer"] == "yol" and haric_yol in self.yollar:
            yp, yg = self.yollar[haric_yol]
            on = [(i, self.dunya(cer, i * 8 + 4, 0)) for i in range(W)]
            uzak = {i for i, q in on if yg.distance(Point(q)) > yp["genislik"] / 2 + YOLA_PAY}
            giris = {i for i in range(W) if c["harita"][0][i] in "astgpmMP"}
            if uzak & giris:
                return ["giriş konduğu yola değmiyor"]
            if len(uzak) > (1 - ON_ORANI) * W:
                return ["yol kesimi grubun önü kadar uzun değil"]
        if c["yer"] != "serit":
            ic = P.buffer(-1.0)
            for i in self.yol_agac.query(ic):
                k = self.yol_ids[i]
                if k == haric_yol:
                    continue
                if self.yol_alan[k].intersects(ic):
                    return [f"başka yol: {k}"]
            for i in self.engel_agac.query(ic):
                if self.engel[i].intersects(ic):
                    return ["yapı / korunan alan"]
        # eğim: düzleme uydur
        xs = [self.dunya(cer, x, y) for x in np.linspace(2, W * 8 - 2, 5) for y in np.linspace(2, D * 8 - 2, 5)]
        xs = np.array(xs)
        z = self.kot(xs[:, 0], xs[:, 1])
        A = np.column_stack([xs[:, 0], xs[:, 1], np.ones(len(xs))])
        (gx, gy, _), *_ = np.linalg.lstsq(A, z, rcond=None)
        o, u, n = cer
        nu, uu = n / np.linalg.norm(n), u / np.linalg.norm(u)
        ic_egim = (gx * nu[0] + gy * nu[1]) * 100     # yoldan içeri (+ yükselir)
        capraz = abs(gx * uu[0] + gy * uu[1]) * 100
        e = c["egim"]
        if e["enAz"] > 0:
            ie = abs(ic_egim) if c.get("seki") else ic_egim
            if not (e["enAz"] <= ie <= e["enCok"]):
                sebep.append(f"yamaç %{ic_egim:.0f} (gereken %{e['enAz']}–{e['enCok']}, içeri yükselen)")
        elif math.hypot(ic_egim, capraz) > e["enCok"]:
            sebep.append(f"eğim %{math.hypot(ic_egim, capraz):.0f} > %{e['enCok']}")
        if capraz > max(EGIM_CAPRAZ, e["enCok"] if e["enAz"] == 0 else 0):
            sebep.append(f"yola koşut eğim %{capraz:.0f}")
        if ayrinti:
            return sebep, {"polygon": P, "icEgim": ic_egim, "capraz": capraz, "cer": cer}
        return sebep

    def kiyi_cerceveleri(self, adim=24.0):
        """Kıyı boyunca her `adim` metrede bir çerçeve: 0. sıra kıyı çizgisinin 2 m içinde, n karaya doğru."""
        L = self.kiyi.length
        out = []
        for t in np.arange(0, L, adim):
            p0 = np.array(self.kiyi.interpolate(t).coords[0]); p1 = np.array(self.kiyi.interpolate(t + 8).coords[0])
            u = p1 - p0
            if np.linalg.norm(u) < 1e-6:
                continue
            u = u / np.linalg.norm(u) * 8.0
            n = np.array([-u[1], u[0]])
            if not self.ada.contains(Point(p0 + n * 0.5 + u * 0.5)):
                n = -n
            out.append((p0 + n / 8.0 * 2.0, u, n))
        return out

    def mahalle_of(self, p):
        for k, g in self.mahalle.items():
            if g.contains(Point(p)):
                return k
        return None

    def yerler(self, c, adim=2, sinir=None):
        out = []
        if c["yer"] == "kiyi":
            for cer in self.kiyi_cerceveleri():
                if not self.uygun_cer(c, cer):
                    out.append((None, cer))
            return out
        for s in self.kj["seritler"]:
            cols = [col[0] for col in s["s"]]
            if not cols:
                continue
            for c0 in range(min(cols), max(cols) + 1, adim):
                if not self.uygun(c, s, c0):
                    out.append((s, c0))
                    if sinir and len(out) >= sinir:
                        return out
                    break   # şerit başına bir yer yeter
        return out


def main():
    sorun = 0

    def yaz(ad, temiz, deger=""):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    if not os.path.exists(GRUP):
        print("Dosya yok. Önce: python gen/hazir_gruplar.py"); sys.exit(1)
    v = json.load(open(GRUP, encoding="utf-8"))
    var = set()
    for kok, _, dosyalar in os.walk(os.path.join(KOK, "public", "modeller")):
        for d in dosyalar:
            var.add(os.path.relpath(os.path.join(kok, d), os.path.join(KOK, "public", "modeller")).replace(os.sep, "/"))
    cesitler = [c for g in v["gruplar"] for c in g["cesitler"]]
    print(f"{len(v['gruplar'])} grup, {len(cesitler)} çeşit")
    yaz("her grupta 2–3 çeşit", all(2 <= len(g["cesitler"]) <= 3 for g in v["gruplar"]),
        ", ".join(f"{g['id']} {len(g['cesitler'])}" for g in v["gruplar"] if not 2 <= len(g["cesitler"]) <= 3) or "hepsi")
    eski = {g.get("eskiSablon") for g in v["gruplar"]} - {None}
    yaz("eski on Kurucu şablonunun hepsi yenilendi", len(eski) == 10, f"{len(eski)} / 10")
    km = {c["cesit"] for c in cesitler if c["grup"] == "koy-meydani"}
    tk = {c["cesit"] for c in cesitler if c["grup"] == "tepe-koyu"}
    yaz("köy meydanı A/B/C ve tepe köyü A/B/C", km == tk == {"a", "b", "c"}, f"{sorted(km)} {sorted(tk)}")
    toplam_acik = 0
    for c in cesitler:
        s_, acik = cesit_denetimi(c, v["olculer"]["yolEgimSiniri"], var)
        toplam_acik += acik
        yaz(f"{c['id']} ({c['en']}x{c['boy']} kare, {c['ogeSayisi']} öğe)", not s_, "; ".join(s_[:4]) or "kareler, evler, yollar, eğim")
    print(f"  bilgi: kenarda açık biten yol {toplam_acik} (konunca yönetim ekranında komşu yola bağlanır)")
    import hazir_gruplar as hg
    kirp_sorun = []
    for c in cesitler:
        k = c["kirpma"]
        for (a, b, d) in {(k["sol"], k["sag"], k["arka"]), (k["sol"], 0, 0), (0, k["sag"], 0), (0, 0, k["arka"])}:
            if a == b == d == 0:
                continue
            kc = hg.kirpilmis(c["grup"], c["cesit"], a, b, d)
            s_ = ["kural dışı"] if kc is None else cesit_denetimi(kc, v["olculer"]["yolEgimSiniri"], var)[0]
            if kc is not None and [kc["en"], kc["boy"]] != [c["en"] - a - b, c["boy"] - d]:
                s_.append("boy tutmuyor")
            if s_:
                kirp_sorun.append(f"{c['id']} {a}/{b}/{d}: {s_[0]}")
    yaz("kırpılmış hâller (her çeşidin en çok kırpılmış köşeleri) denetimden geçer", not kirp_sorun,
        "; ".join(kirp_sorun[:4]) or f"{sum(1 for c in cesitler if any(c['kirpma'][x] for x in ('sol', 'sag', 'arka')))} çeşit kırpılabilir")
    yaz("Kemsköy yazımı", "Kemskoy" not in json.dumps(v, ensure_ascii=False), "ö ile")

    print("Adada konabilirlik (her yol kesiminin yanı, şerit başına bir yer; DENEME eşikler):")
    ada = Ada()
    ayrinti = "--yerler" in sys.argv
    for c in cesitler:
        yer = ada.yerler(c)
        mh = defaultdict(int)
        for s, c0 in yer:
            o, u, n = ada.serit_cercevesi(s, c0) if s else c0
            mh[(ada.mahalle_of(o + u * c["en"] / 2 + n * c["boy"] / 2) or "?").replace("yer_", "")] += 1
        ek = ""
        if len(yer) < 3 and any(c["kirpma"][x] for x in ("sol", "sag", "arka")):
            import itertools
            kp = c["kirpma"]
            birlesim = sorted(itertools.product(range(kp["sol"] + 1), range(kp["sag"] + 1), range(kp["arka"] + 1)),
                              key=lambda t: (-(c["en"] - t[0] - t[1]) * (c["boy"] - t[2]), t))
            bulunan, en_buyuk = set(), None
            for (a, b, d) in birlesim:
                if a == b == d == 0:
                    continue
                kc = hg.kirpilmis(c["grup"], c["cesit"], a, b, d)
                for s, c0 in ada.yerler(kc):
                    anahtar = (s["yol"], s["taraf"], s["kesim"]) if s else tuple(np.round(c0[0], 0))
                    if anahtar not in bulunan:
                        bulunan.add(anahtar)
                        en_buyuk = en_buyuk or f"{kc['en']}x{kc['boy']}"
                        if ayrinti:
                            print(f"      kırpılmış {a}/{b}/{d} ({kc['en']}x{kc['boy']}): {s['yol']} {s['taraf']} kesim {s['kesim']} sütun {c0}" if s else "")
                if len(bulunan) >= 6:
                    break
            ek = f"  · kırpılarak +{len(bulunan)} yer" + (f" (en büyüğü {en_buyuk})" if en_buyuk else "")
        print(f"  {c['id']:<28} {len(yer):>4} yer  " + ", ".join(f"{k} {n}" for k, n in sorted(mh.items(), key=lambda t: -t[1])) + ek)
        if ayrinti:
            for s, c0 in yer[:3]:
                print(f"      {s['yol']} {s['taraf']} kesim {s['kesim']} sütun {c0}" if s else f"      kıyı {c0[0].round(0)}")
    print("SORUN VAR" if sorun else "Hepsi temiz.")
    sys.exit(1 if sorun else 0)


if __name__ == "__main__":
    main()
