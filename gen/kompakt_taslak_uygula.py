"""Tek harita 7. adım: KKM'deki "Düzenle" taslağını harita dosyalarına uygular (ajans tarafı).

Kemal KKM → Harita → Düzenle'de değişiklik yapar, "Haritaya işle"ye basar; taslak Kems Ajans'a
`kkm/tek-harita-taslak.json` olarak gider. Kems bu betikle haritaya işler ve KKM'ye öneri PR'ı açar:

    python gen/kompakt_taslak_uygula.py <ajans>/kkm/tek-harita-taslak.json
    python gen/kompakt_agaclar.py              # ağaçlar yeni yapı, yol ve zemine göre
    python gen/kompakt_taslak_denetim.py       # denetim (zemin değiştiyse kompakt_zemin_denetim ve
                                               # kompakt_yollar_denetim de çalıştırılır)

Taslak yalnız değişiklikleri taşır (taşınan / silinen / yeni yapı, yol, boyalı kare, hazır grup, zemin).
Değişiklikler birikir: `gen/tek-harita-elle.json` (elle düzen). Betik her çalışmada önceki elle
öğeleri dosyalardan çıkarıp (eski hâllerini geri koyup) birikmiş düzeni baştan uygular: iki kez
çalışınca aynı sonuç. Taslak dosyası verilmezse yalnız birikmiş düzen yeniden uygulanır (bir üreteç
yeniden çalıştıktan sonra).

Dosyalardaki işaret: `elle: "yeni"` (taslaktan gelen öğe), `"tasindi"` (taşınan / döndürülen yapı),
`"duzenlendi"` (noktaları, kademesi ya da adı değişen yol). Öbür üreteçler ve denetimleri elle
öğeleri `elle_cikar` ile ayıklayıp yalnız kendi ürettiklerine bakar (kompakt_agaclar.py hariç: ağaçlar
elle yapı ve yollardan kaçar).

Hazır gruplar: kırpma KKM'dekinin aynısı (`kirp_ogeler`: Kemal ekranda ne gördüyse); alanlar (katman "alan")
ve duvarlar buradan, bina, yol, ağaç, donatı taslaktaki hâliyle (Kemal tek tek düzenlemiş olabilir). Kırpmanın
kurala uyduğunu üretecin kendisi denetler (gen/hazir_gruplar.py → kirpilmis kuramıyorsa grup atlanır). Grubun kapladığı yer "grupAlani", altında kalan arsalar "avluKalkan" alanı olur:
tek harita oradaki kendiliğinden ağaçları (arsada yalnız avlu ağaçlarını) çizmez.

Zemin (8. adım, Kemal 20 ve 22 Kasım): taslağın `zemin`i değişen hücrelerin mutlak rakımıdır (64 × 64 hücrelik
parçalar, deflate-raw + base64; KKM duzenle/zemin.ts). Betik önce dosyadaki eski elle zemini geri alır
(`zeminOnceki`: dokunulan hücrelerin ilk değerleri, birikmiş dosyada), sonra birikmiş zemini koyar ve o bölgedeki
yolların yatağını yeniden açar (`yatak_ac`: yolun o kesimi 10 m'de bir noktaya bölünür, şekli aynı; noktalar yol
boyunca yumuşatılmış yeni zemine, şerit ve omzu bu profile; yolların ilk hâli `yolOnceki`). Kıyı çizgisi değiştiyse sınır dosyasında ada, kıyı çizgileri ve mahalleler de güncellenir (eski
hâlleri `sinirOnceki`). Zemin değişince arsalar ve kareler (kompakt_parseller.py), yapılar (kompakt_yapilar.py) yeni
zeminle yeniden üretilir, sonra elle düzen yeniden uygulanır (ZINCIR_YOK=1 ile atlanır); ağaçlar ardından
kompakt_agaclar.py ile. Elle zeminde yamaç, çukur ve yol eğimi aşımı denetimlerde yalnız bilgidir (yumuşak kural).

Yumuşak kurallar (yol eğimi, üst üste binme, kıyı şeridi) engellemez; denetim bilgi olarak yazar.
Kurallar: viki bağlı ya da evinde oturan olan yapı silinmez (atlanır, denetim yazar); ad Kemal'in
(taslaktaki ad olduğu gibi, boşsa boş); yalnız KKM'nin modelleri. Ölçüler DENEME.
"""
import base64, copy, gzip, json, math, os, struct, subprocess, sys, zlib

import numpy as np

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
HARITA = os.path.join(KOK, "public", "harita")
ELLE = os.environ.get("ELLE_DOSYASI") or os.path.join(BURASI, "tek-harita-elle.json")
YAPILAR = os.path.join(HARITA, "duzada-yapilar.geojson")
YOLLAR = os.path.join(HARITA, "duzada-yollar.geojson")
IZGARA = os.path.join(HARITA, "duzada-zemin.bin")
SINIRLAR = os.path.join(HARITA, "duzada-sinirlar.geojson")

KADEME = {   # gen/kompakt_yollar.py ile aynı (KKM: tek/duzenle/taslak.ts → KADEMELER)
    "ana": {"genislik": 8.0, "egim": 0.10, "yuzey": "asfalt", "kurucu": "ana"},
    "ara": {"genislik": 6.5, "egim": 0.10, "yuzey": "asfalt", "kurucu": "ana"},
    "sokak": {"genislik": 5.0, "egim": 0.15, "yuzey": "taş", "kurucu": "sokak"},
    "gecit": {"genislik": 3.0, "egim": 0.15, "yuzey": "taş", "kurucu": "sokak"},
    "toprak": {"genislik": 4.0, "egim": 0.15, "yuzey": "toprak", "kurucu": "toprak"},
    "patika": {"genislik": 1.5, "egim": 0.45, "yuzey": "toprak", "kurucu": "patika"},
    "merdiven": {"genislik": 2.5, "egim": None, "yuzey": "basamak", "kurucu": "patika"},
}
BOYA_ALANI = {"park": "park", "bahce": "bahce", "meydancik": "meydancik", "agac": "agacli"}
BOYA_AGACI = "bitkiler/zeytin-yasli.glb"   # KKM: tek/duzenle/birlesik.ts → BOYA_AGACI
KARE = 8.0


# ------------------------------------------------------------------ zemin
def zemin_oku():
    b = gzip.decompress(open(IZGARA, "rb").read())
    assert b[:4] == b"DZZ1"
    n = struct.unpack("<I", b[4:8])[0]
    bas = json.loads(b[8:8 + n])
    h = struct.unpack(f"<{bas['en'] * bas['boy']}h", b[8 + n:8 + n + 2 * bas["en"] * bas["boy"]])
    return bas, h


def zemin_baytlari(bas, H):
    """Zemin dosyasının içeriği (gzip; kompakt_yollar.py ile aynı biçim)"""
    import io
    _b = json.dumps(bas, ensure_ascii=False).encode("utf-8")
    t = io.BytesIO()
    with gzip.GzipFile(filename=os.path.basename(IZGARA), fileobj=t, mode="wb", compresslevel=9, mtime=0) as f:
        f.write(b"DZZ1" + struct.pack("<I", len(_b)) + _b + H.astype("<i2").tobytes())
    return t.getvalue()


class Zemin:
    def __init__(self, bas=None, H=None):
        if bas is None:
            self.b, self.h = zemin_oku()
        else:
            self.b, self.h = bas, H.ravel().tolist()

    def sahne(self, p):
        """[boylam, enlem] → sahne x (doğu), z (güney), metre (KKM tekVeri.sahneye)"""
        b = self.b
        return ((p[0] - b["lng0"]) * b["mPerLng"], -(p[1] - b["lat0"]) * b["mPerLat"])

    def cog(self, x, z):
        b = self.b
        return [round(b["lng0"] + x / b["mPerLng"], 7), round(b["lat0"] - z / b["mPerLat"], 7)]

    def rakim(self, x, z):
        """KKM tekVeri.rakim ile aynı iki doğrusal ara değer"""
        b, h = self.b, self.h
        fi, fj = (x - b["x0"]) / b["hucre"], (-z - b["y0"]) / b["hucre"]
        i = max(0, min(b["en"] - 2, math.floor(fi)))
        j = max(0, min(b["boy"] - 2, math.floor(fj)))
        u, w = max(0, min(1, fi - i)), max(0, min(1, fj - j))
        k = j * b["en"] + i
        bi = b["birim"]
        return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - w) + (h[k + b["en"]] * (1 - u) + h[k + b["en"] + 1] * u) * w) * bi


def dikdortgen(m, ex, en, boy):
    """KKM duzenle/geometri.ts → dikdortgen (ön = (−ex.z, ex.x))"""
    ax, az = ex
    bx, bz = -az, ax
    e, d = en / 2, boy / 2
    return [(m[0] - ax * e - bx * d, m[1] - az * e - bz * d), (m[0] + ax * e - bx * d, m[1] + az * e - bz * d),
            (m[0] + ax * e + bx * d, m[1] + az * e + bz * d), (m[0] - ax * e + bx * d, m[1] - az * e + bz * d)]


# ------------------------------------------------------------------ birikmiş elle düzen
def birikmis_oku():
    if not os.path.exists(ELLE):
        return {"taslak": bos_taslak(), "onceki": {"yapilar": {}, "yollar": {}}, "silinen": {"yapilar": {}, "yollar": {}},
                "uygulananlar": []}
    return json.load(open(ELLE, encoding="utf-8"))


def bos_taslak():
    return {"surum": 1, "yapilar": {}, "yeniYapilar": {}, "yollar": {}, "yeniYollar": {}, "kareler": {}, "gruplar": {}}


# ------------------------------------------------------------------ zemin taslağı (8. adım)
PARCA = 64           # KKM duzenle/zemin.ts → PARCA
DEGISMEDI = -32768   # değişmeyen hücre
YATAK_BOLGE = 6      # hücre; değişen hücrelerin çevresinde yol yatağının yeniden açıldığı pay


def parca_coz(s):
    return np.frombuffer(zlib.decompress(base64.b64decode(s), -15), dtype="<i2").reshape(PARCA, PARCA).copy()


def parca_kodla(a):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return base64.b64encode(c.compress(a.astype("<i2").tobytes()) + c.flush()).decode("ascii")


def parcalari_ac(p, boy, en):
    """{"i_j": base64} → bütün ızgara (değişmeyen DEGISMEDI)"""
    A = np.full((boy, en), DEGISMEDI, dtype=np.int16)
    for a, s in (p or {}).items():
        ti, tj = map(int, a.split("_"))
        d = parca_coz(s)
        j1, i1 = min(boy, (tj + 1) * PARCA), min(en, (ti + 1) * PARCA)
        blok = d[:j1 - tj * PARCA, :i1 - ti * PARCA]
        hedef = A[tj * PARCA:j1, ti * PARCA:i1]
        hedef[blok != DEGISMEDI] = blok[blok != DEGISMEDI]
    return A


def parcalara_bol(A):
    """bütün ızgara → {"i_j": base64}, yalnız dolu parçalar"""
    boy, en = A.shape
    out = {}
    for tj in range(math.ceil(boy / PARCA)):
        for ti in range(math.ceil(en / PARCA)):
            blok = A[tj * PARCA:(tj + 1) * PARCA, ti * PARCA:(ti + 1) * PARCA]
            if not (blok != DEGISMEDI).any():
                continue
            d = np.full((PARCA, PARCA), DEGISMEDI, dtype=np.int16)
            d[:blok.shape[0], :blok.shape[1]] = blok
            out[f"{ti}_{tj}"] = parca_kodla(d)
    return out


def zemin_birlestir(eski, yeni, boy, en):
    """Birikmiş zemin taslağının üstüne yenisi: hücre hücre yenisi geçerli; kıyı parçaları birleşir"""
    if not yeni:
        return eski
    if not eski:
        return copy.deepcopy(yeni)
    A = parcalari_ac(eski.get("p"), boy, en)
    Y = parcalari_ac(yeni.get("p"), boy, en)
    A[Y != DEGISMEDI] = Y[Y != DEGISMEDI]
    p = parcalara_bol(A)
    return {"parca": PARCA, "p": p, "kiyi": sorted(set(eski.get("kiyi", [])) | set(yeni.get("kiyi", [])) & set(p)),
            "hucre": int((A != DEGISMEDI).sum()), "vurus": int(eski.get("vurus", 0)) + int(yeni.get("vurus", 0))}


def kiyi_parca_maskesi(zt, boy, en):
    """Kıyının değişebildiği parçaların hücreleri"""
    M = np.zeros((boy, en), bool)
    for a in (zt or {}).get("kiyi", []):
        ti, tj = map(int, a.split("_"))
        M[tj * PARCA:(tj + 1) * PARCA, ti * PARCA:(ti + 1) * PARCA] = True
    return M


def zemin_uygula(t, bir, yollar_temel, rapor):
    """Birikmiş zemini dosyanın (geri alınmış) ilk hâline koyar, yol yatağını açar.
    Döner: (başlık, yeni ızgara int16, ilk ızgara int16, değişen maske); yolların köşeleri yerinde değişir"""
    from scipy import ndimage
    bas, h = zemin_oku()
    boy, en = bas["boy"], bas["en"]
    H = np.array(h, dtype=np.int16).reshape(boy, en)
    zo = bir.get("zeminOnceki") or {}
    O = parcalari_ac(zo.get("p"), boy, en)
    Om = O != DEGISMEDI
    H[Om] = O[Om]                                   # eski elle zemin geri alınır
    zt = t.get("zemin")
    D = parcalari_ac((zt or {}).get("p"), boy, en)
    Dm = D != DEGISMEDI
    bas = {k: v for k, v in bas.items() if k != "elleZemin"}
    if not Dm.any():
        if Om.any():
            bir.pop("zeminOnceki", None)
        yatak_ac(bas, H, H.copy(), Dm, yollar_temel, bir, rapor)
        return bas, H, H.copy(), Dm
    bolge = ndimage.binary_dilation(Dm, structure=np.ones((3, 3), bool), iterations=YATAK_BOLGE)
    yeni = bolge & ~Om
    O[yeni] = H[yeni]
    Om |= yeni
    bir["zeminOnceki"] = {"parca": PARCA, "not": "Zemin aracının dokunduğu hücrelerin ilk rakımı (×10); geri almak için", "p": parcalara_bol(O)}
    H_ilk = H.copy()
    H[Dm] = D[Dm]
    yatak_ac(bas, H, H_ilk, Dm, yollar_temel, bir, rapor)
    bas["elleZemin"] = "gen/kompakt_taslak_uygula.py (KKM Düzenle → Zemin)"
    return bas, H, H_ilk, Dm


def yatak_ac(bas, H, H_ilk, Dm, yollar, bir, rapor):
    """Zemini değişen yerden geçen yolların yatağı. Yolun o kesimi 10 m'de bir noktaya bölünür (şekli aynı),
    noktaların kotu yol boyunca yumuşatılmış yeni zemin; değişmeyen yerde yol eski kotunda kalır (ağırlık yol
    boyunca yumuşakça geçer). Şerit ve 7,5 m'si bu profile, sonraki 6 m omuz yumuşakça zemine bağlanır.
    H yerinde değişir (int16); yolların köşeleri yerinde değişir. Dokunulan yolların ilk köşeleri `yolOnceki`."""
    from scipy import ndimage
    from scipy.spatial import cKDTree
    hc, birim = bas["hucre"], bas["birim"]
    boy, en = H.shape
    Zf = H.astype(float) * birim
    yakin = ndimage.binary_dilation(Dm, structure=np.ones((3, 3), bool), iterations=2) if Dm.any() else Dm
    bolge = ndimage.binary_dilation(Dm, structure=np.ones((3, 3), bool), iterations=YATAK_BOLGE) if Dm.any() else Dm
    once = bir.get("yolOnceki") or {}
    for f in yollar["features"]:
        p = f["properties"]
        if p.get("katman") == "yol" and p.get("id") in once and not p.get("elle"):
            f["geometry"]["coordinates"] = copy.deepcopy(once[p["id"]])
    if not Dm.any():
        bir.pop("yolOnceki", None)
        rapor["yatak"] = 0
        return

    def metre(q):
        return ((q[0] - bas["lng0"]) * bas["mPerLng"], (q[1] - bas["lat0"]) * bas["mPerLat"])

    def ll(x, y):
        return [round(bas["lng0"] + x / bas["mPerLng"], 6), round(bas["lat0"] + y / bas["mPerLat"], 6)]

    def ornek(A, x, y):
        fi, fj = (x - bas["x0"]) / hc, (y - bas["y0"]) / hc
        i = np.clip(np.floor(fi).astype(int), 0, en - 2)
        j = np.clip(np.floor(fj).astype(int), 0, boy - 2)
        u, w = np.clip(fi - i, 0, 1), np.clip(fj - j, 0, 1)
        return (A[j, i] * (1 - u) + A[j, i + 1] * u) * (1 - w) + (A[j + 1, i] * (1 - u) + A[j + 1, i + 1] * u) * w

    def hucrede(M, x, y):
        i = np.clip(np.round((x - bas["x0"]) / hc).astype(int), 0, en - 1)
        j = np.clip(np.round((y - bas["y0"]) / hc).astype(int), 0, boy - 1)
        return M[j, i]

    bj, bi = np.nonzero(bolge)
    bx, by = bas["x0"] + bi * hc, bas["y0"] + bj * hc
    yeni_once = {}
    for f in yollar["features"]:
        p = f["properties"]
        if p.get("katman") != "yol" or f["geometry"]["type"] != "LineString" or p.get("elle"):
            continue
        ilk = f["geometry"]["coordinates"]
        c = np.array([metre(q) for q in ilk])
        if len(c) < 2:
            continue
        zc = np.array([q[2] if len(q) > 2 else 0.0 for q in ilk], float)
        sc = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
        # 2 m'de bir örnek
        sd = np.unique(np.r_[np.arange(0, sc[-1], 2.0), sc])
        xd, yd = np.interp(sd, sc, c[:, 0]), np.interp(sd, sc, c[:, 1])
        icerde = hucrede(yakin, xd, yd)
        if not icerde.any():
            continue
        wd = np.maximum(icerde.astype(float), ndimage.gaussian_filter1d(icerde.astype(float), 6, mode="nearest") * 1.5).clip(0, 1)
        wd[wd < 0.01] = 0
        yeni_d = ndimage.gaussian_filter1d(ornek(Zf, xd, yd), 4, mode="nearest")
        # köşeler: dokunulan kesim 10 m'de bir bölünür
        sv = [sc[0]]
        for k in range(1, len(sc)):
            ic = (sd > sc[k - 1]) & (sd <= sc[k])
            if wd[ic].max(initial=0) > 0:
                n = max(1, math.ceil((sc[k] - sc[k - 1]) / 10.0))
                sv.extend(sc[k - 1] + (sc[k] - sc[k - 1]) * np.arange(1, n) / n)
            sv.append(sc[k])
        sv = np.array(sv)
        wv = np.interp(sv, sd, wd)
        zv = wv * np.interp(sv, sd, yeni_d) + (1 - wv) * np.interp(sv, sc, zc)
        prof = np.interp(sd, sv, zv)
        yari = float(p.get("genislik", 4)) / 2
        agac = cKDTree(np.column_stack([xd, yd]))
        d, ix = agac.query(np.column_stack([bx, by]), distance_upper_bound=yari + 13.5)
        tamam = np.isfinite(d)
        if tamam.any():
            d_, ix_ = d[tamam], ix[tamam]
            jj, ii = bj[tamam], bi[tamam]
            t = np.clip((d_ - yari - 7.5) / 6.0, 0, 1)
            g = np.where(Zf[jj, ii] > 0, wd[ix_] * (1 - t), 0)
            Zf[jj, ii] = Zf[jj, ii] + g * (prof[ix_] - Zf[jj, ii])
        yeni = []
        kose = {round(float(v), 6): n for n, v in enumerate(sc)}
        for v, w_, z_ in zip(sv, wv, zv):
            n = kose.get(round(float(v), 6))
            q = list(ilk[n][:2]) if n is not None else ll(np.interp(v, sc, c[:, 0]), np.interp(v, sc, c[:, 1]))
            zz = round(max(0.0, float(z_)), 1) if w_ > 0 else (ilk[n][2] if n is not None and len(ilk[n]) > 2 else round(float(z_), 1))
            yeni.append(q + [zz])
        yeni_once[p["id"]] = copy.deepcopy(ilk)
        f["geometry"]["coordinates"] = yeni
    H[:] = np.round(Zf / birim).astype(np.int16)
    bir["yolOnceki"] = yeni_once
    rapor["yatak"] = len(yeni_once)


def sinir_uygula(bas, H, H_ilk, bir, rapor):
    """Kıyı çizgisi değiştiyse sınır dosyası: ada, kıyı çizgileri, mahalleler (ilk hâlleri `sinirOnceki`)"""
    import shapely
    from shapely.geometry import MultiPolygon, Point, Polygon, box, shape, mapping
    from shapely.ops import nearest_points, unary_union
    from scipy import ndimage
    geo = json.load(open(SINIRLAR, encoding="utf-8"))
    KATMAN = ("ada", "kiyi", "mahalle")
    onceki = bir.get("sinirOnceki")
    if onceki:
        ogeler = iter(onceki["ogeler"])
        geo["features"] = [copy.deepcopy(next(ogeler)) if f["properties"].get("katman") in KATMAN else f for f in geo["features"]]
    kiyi = (H > 0) != (H_ilk > 0)
    if not kiyi.any():
        bir.pop("sinirOnceki", None)
        rapor["kiyi"] = 0
        return geo
    if not onceki:
        bir["sinirOnceki"] = {"not": "Zemin aracıyla kıyı değişmeden önceki ada, kıyı ve mahalle öğeleri (sırayla)",
                              "ogeler": [copy.deepcopy(f) for f in geo["features"] if f["properties"].get("katman") in KATMAN]}
    hc = bas["hucre"]
    m = lambda q: ((q[0] - bas["lng0"]) * bas["mPerLng"], (q[1] - bas["lat0"]) * bas["mPerLat"])
    ll = lambda x, y: [round(bas["lng0"] + x / bas["mPerLng"], 6), round(bas["lat0"] + y / bas["mPerLat"], 6)]
    gm = lambda g: shapely.transform(g, lambda a: np.column_stack([(a[:, 0] - bas["lng0"]) * bas["mPerLng"], (a[:, 1] - bas["lat0"]) * bas["mPerLat"]]))
    gl = lambda g: shapely.transform(g, lambda a: np.column_stack([bas["lng0"] + a[:, 0] / bas["mPerLng"], bas["lat0"] + a[:, 1] / bas["mPerLat"]]))
    jj, ii = np.nonzero(ndimage.binary_dilation(kiyi, iterations=8))
    x0, x1 = bas["x0"] + ii.min() * hc - hc / 2, bas["x0"] + ii.max() * hc + hc / 2
    y0, y1 = bas["y0"] + jj.min() * hc - hc / 2, bas["y0"] + jj.max() * hc + hc / 2
    kutu = box(x0, y0, x1, y1)
    # kutudaki kara: hücre kareleri (merkez karadaysa kare adanın içinde), 2,5 m sadeleştirme
    kj, ki = np.nonzero(H > 0)
    sec = (bas["x0"] + ki * hc >= x0) & (bas["x0"] + ki * hc <= x1) & (bas["y0"] + kj * hc >= y0) & (bas["y0"] + kj * hc <= y1)
    kareler = [box(bas["x0"] + i * hc - hc / 2, bas["y0"] + j * hc - hc / 2, bas["x0"] + i * hc + hc / 2, bas["y0"] + j * hc + hc / 2)
               for i, j in zip(ki[sec], kj[sec])]
    kara_kutu = unary_union(kareler).intersection(kutu).simplify(2.5)
    ada_f = next(f for f in geo["features"] if f["properties"]["katman"] == "ada")
    ada_eski = gm(shape(ada_f["geometry"]))
    ada = unary_union([ada_eski.difference(kutu), kara_kutu]).buffer(0)
    if ada.geom_type == "MultiPolygon":
        ada = max(ada.geoms, key=lambda g: g.area)
    ada = Polygon(ada.exterior)
    ada_f["geometry"] = mapping(gl(ada))
    eklenen, giden = ada.difference(ada_eski), ada_eski.difference(ada)
    # mahalleler: yeni kara en yakın mahalleye, giden kara hepsinden düşer
    mah = [f for f in geo["features"] if f["properties"]["katman"] == "mahalle"]
    mg = [gm(shape(f["geometry"])) for f in mah]
    parcalar = list(eklenen.geoms) if hasattr(eklenen, "geoms") else ([eklenen] if not eklenen.is_empty else [])
    for pr in parcalar:
        if pr.area < 0.5:
            continue
        k = min(range(len(mg)), key=lambda n: mg[n].distance(pr.representative_point()))
        mg[k] = unary_union([mg[k], pr]).buffer(0)
    for n, f in enumerate(mah):
        g = mg[n].difference(giden).buffer(0) if not giden.is_empty else mg[n]
        g = MultiPolygon([g]) if g.geom_type == "Polygon" else MultiPolygon([x for x in g.geoms if x.geom_type == "Polygon"])
        f["geometry"] = mapping(gl(g))
    # kıyı çizgileri: kutudaki köşeler yeni kıyıya oturur
    sinir = ada.exterior
    for f in geo["features"]:
        if f["properties"]["katman"] != "kiyi":
            continue
        yeni = []
        for q in f["geometry"]["coordinates"]:
            x, y = m(q)
            if x0 <= x <= x1 and y0 <= y <= y1:
                pn = nearest_points(sinir, Point(x, y))[0]
                yeni.append(ll(pn.x, pn.y))
            else:
                yeni.append(q)
        f["geometry"]["coordinates"] = yeni
    rapor["kiyi"] = int(kiyi.sum())
    return geo


def elle_cikar(fc, ad, birikmis=None):
    """Dosyadaki elle öğeleri çıkarır, eski hâllerini geri koyar: üretecin çıktısı (ad: yapilar | yollar)"""
    b = birikmis or birikmis_oku()
    onceki = b["onceki"].get(ad, {})
    silinen = b["silinen"].get(ad, {})
    out = []
    for f in fc["features"]:
        e = f["properties"].get("elle")
        if e == "yeni":
            continue
        if e in ("tasindi", "duzenlendi"):
            out.append(copy.deepcopy(onceki[f["properties"]["id"]]))
            continue
        out.append(f)
    var = {f["properties"].get("id") for f in out}
    for kim, s in sorted(silinen.items(), key=lambda kv: kv[1]["sira"]):
        if kim.startswith("kopru:"):
            # köprünün kimliği yok: dosyada aynısı varsa (üreteç yeniden çalıştı) yeniden konmaz
            if any(f["properties"].get("katman") == "kopru" and f == s["oge"] for f in out):
                continue
        elif kim in var:
            continue
        out.insert(min(s["sira"], len(out)), copy.deepcopy(s["oge"]))
    temiz = {k: v for k, v in fc.items() if k not in ("features", "elleDuzen")}
    temiz["features"] = out
    return temiz


def taslak_birlestir(eski, yeni):
    """Yeni taslak birikmişin üstüne: her öğede yenisi geçerli"""
    t = copy.deepcopy(eski)
    if yeni.get("zemin") or t.get("zemin"):
        b, _ = zemin_oku()
        t["zemin"] = zemin_birlestir(t.get("zemin"), yeni.get("zemin"), b["boy"], b["en"])
        if not t["zemin"]:
            t.pop("zemin")
    for k in ("yapilar", "yeniYapilar", "yollar", "yeniYollar", "kareler", "gruplar"):
        t.setdefault(k, {})
        for kim, v in (yeni.get(k) or {}).items():
            if k == "yollar" and kim in t[k] and not v.get("sil"):
                t[k][kim] = {**t[k][kim], **v}
            else:
                t[k][kim] = v
    return t


# ------------------------------------------------------------------ uygulama
def _mahalleler(Z, sinirlar=None):
    import shapely
    from shapely.geometry import shape, Point
    sf = (sinirlar or json.load(open(SINIRLAR, encoding="utf-8")))["features"]
    b = Z.b
    cevir = lambda a: [[(x - b["lng0"]) * b["mPerLng"], -(y - b["lat0"]) * b["mPerLat"]] for x, y in a]
    m = [(f["properties"]["id"], shapely.transform(shape(f["geometry"]), cevir))
         for f in sf if f["properties"].get("katman") == "mahalle"]

    def bul(x, z):
        p = Point(x, z)
        for kim, g in m:
            if g.contains(p):
                return kim
        return ""
    return bul


def _uzunluk(c):
    return sum(math.dist(c[i - 1], c[i]) for i in range(1, len(c)))


def _yon_pusula(on):
    """önün pusula yönü (kuzey 0, saat yönü); on: sahne x doğu, z güney"""
    return round((math.degrees(math.atan2(on[0], -on[1])) + 360) % 360, 1)


def uygula(taslak_ham=None, yaz=True):
    bir = birikmis_oku()
    if taslak_ham is not None:
        yeni = taslak_ham.get("taslak", taslak_ham)
        bir["taslak"] = taslak_birlestir(bir.get("taslak") or bos_taslak(), yeni)
        bir.setdefault("uygulananlar", []).append({"olusturuldu": taslak_ham.get("olusturuldu"), "sayilar": taslak_ham.get("sayilar")})
    t = bir["taslak"]
    yapilar = elle_cikar(json.load(open(YAPILAR, encoding="utf-8")), "yapilar", bir)
    yollar = elle_cikar(json.load(open(YOLLAR, encoding="utf-8")), "yollar", bir)
    onceki = {"yapilar": dict(bir["onceki"].get("yapilar", {})), "yollar": dict(bir["onceki"].get("yollar", {}))}
    silinen = {"yapilar": dict(bir["silinen"].get("yapilar", {})), "yollar": dict(bir["silinen"].get("yollar", {}))}
    rapor = {"atlanan": [], "grup": []}

    # 0. Zemin (8. adım): eski elle zemin geri, birikmiş zemin, yol yatağı, kıyı değiştiyse sınırlar
    zbas, ZH, ZH_ilk, Dm = zemin_uygula(t, bir, yollar, rapor)
    sinirlar = sinir_uygula(zbas, ZH, ZH_ilk, bir, rapor)
    rapor["zemin"] = int(Dm.sum())
    Z = Zemin(zbas, ZH)
    mahalle = _mahalleler(Z, sinirlar)

    def ilk_hal(ad, f):
        kim = f["properties"]["id"]
        if kim not in onceki[ad]:
            onceki[ad][kim] = copy.deepcopy(f)

    # 1. Yeni yapılar (ağaç ve donatı nokta; yapı taban)
    for kim, y in t.get("yeniYapilar", {}).items():
        m = Z.sahne(y["m"])
        ex = y["ex"]
        ozel = {"id": kim, "dosya": y["dosya"], "elle": "yeni"}
        if y.get("grup"):
            ozel["grup"] = y["grup"]
        if y["tur"] in ("agac", "donati"):
            yapilar["features"].append({"type": "Feature", "properties": {"katman": y["tur"], **ozel, "ex": [round(ex[0], 4), round(ex[1], 4)],
                                        "yukseklik": y.get("yukseklik", 3)}, "geometry": {"type": "Point", "coordinates": y["m"]}})
            continue
        taban = dikdortgen(m, ex, y["en"], y["boy"])
        kotlar = [Z.rakim(*q) for q in taban]
        on = (-ex[1], ex[0])
        p = {"katman": "yapi", "id": kim, "tur": y["tur"], "dosya": y["dosya"], "vikiId": None, "ad": None,
             "mahalle": mahalle(*m), "merkez": y["m"], "ex": [round(ex[0], 4), round(ex[1], 4)],
             "yol": [round(on[0], 4), round(on[1], 4)], "en": round(y["en"], 2), "boy": round(y["boy"], 2),
             "cepheYonu": _yon_pusula(on), "kotM": round(sum(kotlar) / 4, 1), "kotFarkiM": round(max(kotlar) - min(kotlar), 1),
             "modelOlcusu": [round(y["en"], 2), round(y["boy"], 2), round(y.get("yukseklik", 8), 1)], "kareler": [], "elle": "yeni"}
        if y.get("modelEn"):
            p["modelEn"] = y["modelEn"]
        if y.get("grup"):
            p["grup"] = y["grup"]
        yapilar["features"].append({"type": "Feature", "properties": p,
                                    "geometry": {"type": "Polygon", "coordinates": [[Z.cog(*q) for q in taban + [taban[0]]]]}})

    # 2. Var olan yapılar: taşı / döndür / sil (viki bağlı ya da oturanlı yapı silinmez)
    dizin = {f["properties"].get("id"): i for i, f in enumerate(yapilar["features"])}
    for kim, d in t.get("yapilar", {}).items():
        i = dizin.get(kim)
        if i is None:
            rapor["atlanan"].append(f"yapı {kim}: haritada yok")
            continue
        f = yapilar["features"][i]
        p = f["properties"]
        if d.get("sil"):
            if p.get("vikiId") or p.get("bag"):
                rapor["atlanan"].append(f"yapı {kim}: viki bağlı ya da evinde oturan var, silinmedi")
                continue
            if p.get("elle") != "yeni":
                silinen["yapilar"][kim] = {"sira": i, "oge": copy.deepcopy(onceki["yapilar"].get(kim, f))}
            yapilar["features"][i] = None
            continue
        if not (d.get("m") and d.get("ex")):
            continue
        if p.get("elle") != "yeni":
            ilk_hal("yapilar", f)
            p["elle"] = "tasindi"
        m, ex = Z.sahne(d["m"]), d["ex"]
        if f["geometry"]["type"] == "Point":
            p["ex"] = [round(ex[0], 4), round(ex[1], 4)]
            f["geometry"]["coordinates"] = d["m"]
            continue
        taban = dikdortgen(m, ex, p["en"], p["boy"])
        kotlar = [Z.rakim(*q) for q in taban]
        on = (-ex[1], ex[0])
        p.update({"merkez": d["m"], "ex": [round(ex[0], 4), round(ex[1], 4)], "yol": [round(on[0], 4), round(on[1], 4)],
                  "cepheYonu": _yon_pusula(on), "kotM": round(sum(kotlar) / 4, 1), "kotFarkiM": round(max(kotlar) - min(kotlar), 1)})
        if "mahalle" in p and not p.get("vikiId"):
            p["mahalle"] = mahalle(*m) or p["mahalle"]
        f["geometry"] = {"type": "Polygon", "coordinates": [[Z.cog(*q) for q in taban + [taban[0]]]]}
    yapilar["features"] = [f for f in yapilar["features"] if f is not None]

    # 3. Yollar: yeni, sonra var olanların değişikliği
    def yol_coords(n):
        c = [(n[i], n[i + 1]) for i in range(0, len(n) - 1, 2)]
        return [[q[0], q[1], round(max(0.0, Z.rakim(*Z.sahne(q))), 1)] for q in c]

    for kim, y in t.get("yeniYollar", {}).items():
        k = KADEME.get(y["kademe"], KADEME["sokak"])
        c = yol_coords(y["n"])
        sm = [Z.sahne(q) for q in c]
        p = {"katman": "yol", "id": kim, "kademe": y["kademe"], "tur": y.get("tur") or k["yuzey"], "kurucuTuru": k["kurucu"],
             "ad": y.get("ad", ""), "vikiId": "", "genislik": k["genislik"], "uzunlukM": round(_uzunluk(sm)),
             "mahalle": mahalle(*sm[len(sm) // 2]), "elle": "yeni"}
        if y.get("grup"):
            p["grup"] = y["grup"]
        if y.get("bolundu"):
            p["bolundu"] = y["bolundu"]
        yollar["features"].append({"type": "Feature", "properties": p, "geometry": {"type": "LineString", "coordinates": c}})
    dizin = {f["properties"].get("id"): i for i, f in enumerate(yollar["features"]) if f["properties"].get("katman") == "yol"}
    for kim, d in t.get("yollar", {}).items():
        i = dizin.get(kim)
        if i is None:
            rapor["atlanan"].append(f"yol {kim}: haritada yok")
            continue
        f = yollar["features"][i]
        p = f["properties"]
        if d.get("sil"):
            if p.get("vikiId"):
                rapor["atlanan"].append(f"yol {kim}: viki bağlı, silinmedi")
                continue
            if p.get("elle") != "yeni":
                silinen["yollar"][kim] = {"sira": i, "oge": copy.deepcopy(onceki["yollar"].get(kim, f))}
            yollar["features"][i] = None
            continue
        if p.get("elle") != "yeni":
            ilk_hal("yollar", f)
            p["elle"] = "duzenlendi"
        if d.get("kademe"):
            k = KADEME[d["kademe"]]
            p.update({"kademe": d["kademe"], "genislik": k["genislik"], "kurucuTuru": k["kurucu"]})
        if d.get("tur"):
            p["tur"] = d["tur"]
        if "ad" in d:
            p["ad"] = d["ad"]
        if d.get("n"):
            c = yol_coords(d["n"])
            f["geometry"] = {"type": "LineString", "coordinates": c}
            p["uzunlukM"] = round(_uzunluk([Z.sahne(q) for q in c]))
    # Köprü / menfez kendi yolunun parçası: yol silinince ya da güzergâhı değişince kalkar
    for i, f in enumerate(yollar["features"]):
        if f is None or f["properties"].get("katman") != "kopru":
            continue
        d = t.get("yollar", {}).get(f["properties"].get("yol"))
        if d and (d.get("sil") or d.get("n")):
            silinen["yollar"][f"kopru:{i}"] = {"sira": i, "oge": copy.deepcopy(f)}
            yollar["features"][i] = None
    yollar["features"] = [f for f in yollar["features"] if f is not None]

    # 4. Boyalı kareler
    kj = json.load(open(os.path.join(HARITA, "duzada-kareler.json"), encoding="utf-8"))
    kareler = _kareler(Z, kj)
    for kim, tur in sorted(t.get("kareler", {}).items()):
        if tur == "bos" or kim not in kareler:
            if kim not in kareler:
                rapor["atlanan"].append(f"kare {kim}: ızgarada yok")
            continue
        k = kareler[kim]
        yollar["features"].append({"type": "Feature", "properties": {"katman": "alan", "id": f"alan_{kim}", "tur": BOYA_ALANI[tur], "kare": kim,
                                                                     "kaynak": "boya", "elle": "yeni"},
                                   "geometry": {"type": "Polygon", "coordinates": [[Z.cog(*q) for q in k["koseler"] + [k["koseler"][0]]]]}})
        if tur == "agac":
            yapilar["features"].append({"type": "Feature", "properties": {"katman": "agac", "id": f"boya_{kim}", "dosya": BOYA_AGACI, "ex": [1, 0],
                                                                          "yukseklik": 4, "kaynak": "boya", "elle": "yeni"},
                                        "geometry": {"type": "Point", "coordinates": Z.cog(*k["merkez"])}})

    # 5. Hazır gruplar: alanlar, duvarlar, kapladığı yer, altında kalan arsalar
    if t.get("gruplar"):
        sys.path.insert(0, BURASI)
        import hazir_gruplar as HG
        cesitler = {c["id"]: c for gr in json.load(open(os.path.join(HARITA, "hazir-gruplar.json"), encoding="utf-8"))["gruplar"] for c in gr["cesitler"]}
        parsel = {f["properties"]["id"]: f["geometry"] for f in
                  json.load(open(os.path.join(HARITA, "duzada-parseller.geojson"), encoding="utf-8"))["features"]
                  if f["properties"].get("katman") == "parsel"}
        for kim, g in t["gruplar"].items():
            g_id, c_harf = g["sablon"].split("/")
            k = g["kirp"]
            uk = HG.kirpilmis(g_id, c_harf, k.get("sol", 0), k.get("sag", 0), k.get("arka", 0))
            tam = cesitler.get(g["sablon"])
            c = kirp_ogeler(tam, k) if tam else None
            if uk is None or c is None:
                rapor["atlanan"].append(f"grup {kim}: kırpma kuralın dışında ({g['sablon']} {k})")
                continue
            o = Z.sahne(g["o"])
            U = (math.cos(g["aci"]), math.sin(g["aci"]))
            N = (-U[1] * g["yan"], U[0] * g["yan"])
            yer = lambda x, y: (o[0] + x * U[0] + y * N[0], o[1] + x * U[1] + y * N[1])
            etiket = lambda yerel: {"kimlik": kim, "sablon": g["sablon"], "yerel": yerel}
            say = lambda ogeler: {tip: sum(1 for o in ogeler if o["tip"] == tip) for tip in ("bina", "agac", "donati", "yol")}
            taslakta = [v for v in list(t.get("yeniYapilar", {}).values()) if v.get("grup", {}).get("kimlik") == kim]
            rapor["grup"].append({"kimlik": kim, "sablon": g["sablon"], "kirp": k, "boy": [c["en"], c["boy"]],
                                  "ekrandaki": say(c["ogeler"]), "uretecinKirpmasi": say(uk["ogeler"]),
                                  "taslakta": {"bina": sum(1 for v in taslakta if v["tur"] not in ("agac", "donati")),
                                               "agac": sum(1 for v in taslakta if v["tur"] == "agac"), "donati": sum(1 for v in taslakta if v["tur"] == "donati")}})
            for og in c["ogeler"]:
                if og["tip"] == "alan" and og.get("tur") != "bos":
                    for (i, j) in og["kareler"]:
                        q = [yer(i * KARE, j * KARE), yer((i + 1) * KARE, j * KARE), yer((i + 1) * KARE, (j + 1) * KARE), yer(i * KARE, (j + 1) * KARE)]
                        yollar["features"].append({"type": "Feature", "properties": {"katman": "alan", "id": f"{kim}_{og['yerel']}_{i}_{j}", "tur": og["tur"],
                                                                                     "grup": etiket(og["yerel"]), "elle": "yeni"},
                                                   "geometry": {"type": "Polygon", "coordinates": [[Z.cog(*p) for p in q + [q[0]]]]}})
                elif og["tip"] == "duvar":
                    yapilar["features"].append({"type": "Feature", "properties": {"katman": "duvar", "id": f"{kim}_{og['yerel']}", "grup": etiket(og["yerel"]), "elle": "yeni"},
                                                "geometry": {"type": "LineString", "coordinates": [Z.cog(*yer(*p)) for p in og["hat"]]}})
            W, D = c["en"] * KARE, c["boy"] * KARE
            q = [yer(0, 0), yer(W, 0), yer(W, D), yer(0, D)]
            yollar["features"].append({"type": "Feature", "properties": {"katman": "alan", "id": kim, "tur": "grupAlani", "sablon": g["sablon"],
                                                                         "kirp": k, "elle": "yeni"},
                                       "geometry": {"type": "Polygon", "coordinates": [[Z.cog(*p) for p in q + [q[0]]]]}})
            for a in g.get("arsalar", []):
                if a in parsel:
                    yollar["features"].append({"type": "Feature", "properties": {"katman": "alan", "id": f"{kim}_avlu_{a}", "tur": "avluKalkan", "parsel": a, "elle": "yeni"},
                                               "geometry": parsel[a]})

    ozet = {"dosya": os.path.relpath(ELLE, KOK), "not": "Kemal'in KKM → Düzenle'de yaptığı değişiklikler (elle: yeni | tasindi | duzenlendi). gen/kompakt_taslak_uygula.py işler.",
            "sayilar": {"yapi": sum(1 for f in yapilar["features"] if f["properties"].get("elle")),
                        "yol": sum(1 for f in yollar["features"] if f["properties"].get("elle") and f["properties"].get("katman") == "yol"),
                        "alan": sum(1 for f in yollar["features"] if f["properties"].get("katman") == "alan")}}
    for fc in (yapilar, yollar):
        feats = fc.pop("features")
        fc["elleDuzen"] = ozet
        fc["features"] = feats
    bir["onceki"], bir["silinen"] = onceki, silinen
    zemin_icerik = zemin_baytlari(zbas, ZH)
    rapor["zeminIcerik"] = zemin_icerik
    rapor["sinirlar"] = sinirlar
    if yaz:
        for yol, fc in ((YAPILAR, yapilar), (YOLLAR, yollar)):
            with open(yol, "w", encoding="utf-8") as f:
                json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
        if gzip.decompress(zemin_icerik) != gzip.decompress(open(IZGARA, "rb").read()):
            with open(IZGARA, "wb") as f:
                f.write(zemin_icerik)
        sinir_metni = json.dumps(sinirlar, ensure_ascii=False, separators=(",", ":"))
        if sinir_metni != open(SINIRLAR, encoding="utf-8").read():
            with open(SINIRLAR, "w", encoding="utf-8") as f:
                f.write(sinir_metni)
        with open(ELLE, "w", encoding="utf-8") as f:
            json.dump(bir, f, ensure_ascii=False, indent=1)
            f.write("\n")
    return yapilar, yollar, bir, rapor


KORUNAN_HARF = set("MP#R")   # gen/hazir_gruplar.py ile aynı


def kirp_ogeler(c, k):
    """KKM'deki kırpmanın aynısı (tek/duzenle/gruplar.ts → kirpilmis): öğeler kutuya göre süzülür, sol kadar kayar.
    Kemal ekranda ne gördüyse o işlenir; üretecin kırpması (hazir_gruplar.kirpilmis) yalnız kuralın denetimi."""
    sol, sag, arka = k.get("sol", 0), k.get("sag", 0), k.get("arka", 0)
    H, W, D = c["harita"], c["en"], c["boy"]
    if sol or sag or arka:
        s = c.get("kirpma") or {"sol": 0, "sag": 0, "arka": 0}
        if sol > s["sol"] or sag > s["sag"] or arka > s["arka"] or sol + sag >= W or arka >= D:
            return None
        if any(H[j][i] in KORUNAN_HARF for j in range(D) for i in range(W) if i < sol or i >= W - sag or j >= D - arka):
            return None
    x0, x1, y1, e = sol * KARE, (W - sag) * KARE, (D - arka) * KARE, 0.01
    kutuda = lambda p: x0 - e <= p[0] <= x1 + e and -e <= p[1] <= y1 + e
    kare_kutuda = lambda q: sol <= q[0] < W - sag and q[1] < D - arka
    kay = lambda p: [p[0] - x0, p[1]]
    atilan = {o["yerel"] for o in c["ogeler"] if o["tip"] == "arsa" and not all(kare_kutuda(q) for q in o["kareler"])}
    ogeler = []
    for o in c["ogeler"]:
        if o["tip"] == "arsa" or (o.get("arsa") and o["arsa"] in atilan):
            continue
        if o["tip"] == "alan":
            kr = [[q[0] - sol, q[1]] for q in o["kareler"] if kare_kutuda(q)]
            if kr:
                ogeler.append({**o, "kareler": kr})
        elif o["tip"] == "duvar":
            if all(kutuda(p) for p in o["hat"]):
                ogeler.append({**o, "hat": [kay(p) for p in o["hat"]]})
        elif o["tip"] == "bina":
            if o.get("arsa") or kutuda(o["merkez"]):
                ogeler.append({**o, "merkez": kay(o["merkez"])})
        elif o["tip"] in ("agac", "donati"):
            if kutuda(o["m"]):
                ogeler.append({**o, "m": kay(o["m"])})
        elif o["tip"] == "yol":
            if any(kutuda(s_[0]) and kutuda(s_[1]) for s_ in o.get("kenarlar", [])):
                ogeler.append(o)
    return {**c, "en": W - sol - sag, "boy": D - arka, "ogeler": ogeler}


def _kareler(Z, kj):
    """duzada-kareler.json → kare kimliği → köşeler ve merkez (sahne); KKM duzenle/kareler.ts ile aynı"""
    b = Z.b
    out = {}
    for s in kj["seritler"]:
        o = Z.sahne(s["o"])
        u = (s["u"][0] * b["mPerLng"], -s["u"][1] * b["mPerLat"])
        n = (s["n"][0] * b["mPerLng"], -s["n"][1] * b["mPerLat"])
        for j, metre, adet, arsa, derinlik in s["s"]:
            for r in range(adet):
                k = lambda a, c: (o[0] + a * u[0] + c * n[0], o[1] + a * u[1] + c * n[1])
                q = [k(j, r), k(j + 1, r), k(j + 1, r + 1), k(j, r + 1)]
                m = ((q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2)
                kim = f"k_{s['yol']}_{s['taraf']}_{int(metre) if float(metre).is_integer() else metre}_{r}"
                out[kim] = {"koseler": q, "merkez": m, "bos": arsa < 0 or r >= derinlik}
    return out


def main():
    ham = None
    if len(sys.argv) > 1:
        ham = json.load(open(sys.argv[1], encoding="utf-8"))
    zemin_once = open(IZGARA, "rb").read()
    yapilar, yollar, bir, rapor = uygula(ham)
    if rapor.get("zemin") or b"elleZemin" in gzip.decompress(zemin_once)[:4096]:
        print(f"Zemin: {rapor.get('zemin', 0)} hücre taslaktan, {rapor.get('yatak', 0)} yolun yatağı yeniden açıldı, "
              f"kıyı {rapor.get('kiyi', 0)} hücrede değişti")
    if gzip.decompress(open(IZGARA, "rb").read()) != gzip.decompress(zemin_once) and os.environ.get("ZINCIR_YOK") != "1":
        # zemin değişti: arsalar, kareler ve yapılar yeni zeminle; sonra elle düzen yeniden
        for betik in ("kompakt_parseller.py", "kompakt_yapilar.py"):
            print(f"  zincir: python gen/{betik}")
            subprocess.run([sys.executable, os.path.join(BURASI, betik)], check=True, stdout=subprocess.DEVNULL)
        yapilar, yollar, bir, rapor = uygula(None)
    s = yapilar["elleDuzen"]["sayilar"]
    print(f"Elle düzen uygulandı → {os.path.relpath(YAPILAR, KOK)}, {os.path.relpath(YOLLAR, KOK)} "
          f"({s['yapi']} yapı / öğe, {s['yol']} yol, {s['alan']} alan); birikmiş: {os.path.relpath(ELLE, KOK)}")
    for a in rapor["atlanan"]:
        print("  atlandı:", a)
    for g in rapor["grup"]:
        print(f"  grup {g['kimlik']} {g['sablon']} {g['boy'][0]}x{g['boy'][1]} kırpma {g['kirp']}: ekrandaki kırpma {g['ekrandaki']}, "
              f"taslakta {g['taslakta']} (Kemal tek tek değiştirmiş olabilir); üretecin kendi kırpması {g['uretecinKirpmasi']} (bilgi)")
    print("Sonra: python gen/kompakt_agaclar.py && python gen/kompakt_taslak_denetim.py")


if __name__ == "__main__":
    main()
