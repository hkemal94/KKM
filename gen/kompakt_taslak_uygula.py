"""Tek harita 7. adım: KKM'deki "Düzenle" taslağını harita dosyalarına uygular (ajans tarafı).

Kemal KKM → Harita → Düzenle'de değişiklik yapar, "Haritaya işle"ye basar; taslak Kems Ajans'a
`kkm/tek-harita-taslak.json` olarak gider. Kems bu betikle haritaya işler ve KKM'ye öneri PR'ı açar:

    python gen/kompakt_taslak_uygula.py <ajans>/kkm/tek-harita-taslak.json
    python gen/kompakt_agaclar.py              # ağaçlar yeni yapı ve yollara göre
    python gen/kompakt_taslak_denetim.py       # denetim

Taslak yalnız değişiklikleri taşır (taşınan / silinen / yeni yapı, yol, boyalı kare, hazır grup).
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

Yumuşak kurallar (yol eğimi, üst üste binme, kıyı şeridi) engellemez; denetim bilgi olarak yazar.
Kurallar: viki bağlı ya da evinde oturan olan yapı silinmez (atlanır, denetim yazar); ad Kemal'in
(taslaktaki ad olduğu gibi, boşsa boş); yalnız KKM'nin modelleri. Ölçüler DENEME.
"""
import copy, gzip, json, math, os, struct, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
HARITA = os.path.join(KOK, "public", "harita")
ELLE = os.environ.get("ELLE_DOSYASI") or os.path.join(BURASI, "tek-harita-elle.json")
YAPILAR = os.path.join(HARITA, "duzada-yapilar.geojson")
YOLLAR = os.path.join(HARITA, "duzada-yollar.geojson")

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
    b = gzip.decompress(open(os.path.join(HARITA, "duzada-zemin.bin"), "rb").read())
    assert b[:4] == b"DZZ1"
    n = struct.unpack("<I", b[4:8])[0]
    bas = json.loads(b[8:8 + n])
    h = struct.unpack(f"<{bas['en'] * bas['boy']}h", b[8 + n:8 + n + 2 * bas["en"] * bas["boy"]])
    return bas, h


class Zemin:
    def __init__(self):
        self.b, self.h = zemin_oku()

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
    for k in ("yapilar", "yeniYapilar", "yollar", "yeniYollar", "kareler", "gruplar"):
        t.setdefault(k, {})
        for kim, v in (yeni.get(k) or {}).items():
            if k == "yollar" and kim in t[k] and not v.get("sil"):
                t[k][kim] = {**t[k][kim], **v}
            else:
                t[k][kim] = v
    return t


# ------------------------------------------------------------------ uygulama
def _mahalleler(Z):
    import shapely
    from shapely.geometry import shape, Point
    sf = json.load(open(os.path.join(HARITA, "duzada-sinirlar.geojson"), encoding="utf-8"))["features"]
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
    Z = Zemin()
    mahalle = _mahalleler(Z)
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
    if yaz:
        for yol, fc in ((YAPILAR, yapilar), (YOLLAR, yollar)):
            with open(yol, "w", encoding="utf-8") as f:
                json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
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
    yapilar, yollar, bir, rapor = uygula(ham)
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
