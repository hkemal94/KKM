"""Tek harita 7. adım: KKM Düzenle taslağının haritaya işlenişinin denetimi (gen/kompakt_taslak_uygula.py).

Bakılanlar:
  - birikmiş elle düzen okunur; taslakta iç içe dizi yok (yollar düz [boylam, enlem, …] dizisi)
  - kararlı: betik yeniden çalışınca dosyalar bayt bayt aynı (önceki elle öğeler çıkar, baştan uygulanır)
  - taslağın her değişikliği dosyada (taşınan yerinde, silinen yok, yeni yapı ve yol var, boyalı kare var,
    grubun alanı var)
  - viki bağlı ya da evinde oturan olan yapı silinmedi; viki bağlı yol silinmedi
  - yalnız KKM'nin modelleri (public/modeller/ altında)
  - grupların kırpması kuralın içinde (hazir-gruplar.json → kirpma; üreteç kırpılmış hâli kurabiliyor)
  - elle öğeler çıkınca dosyalar üreteçlerin çıktısıyla aynı yapı ve yollar (elle_cikar geri döner)
Bilgi (engellemez; Kemal, 22 Kasım "yumuşak kural"): yol eğimi, üst üste binme, yola taşma, kıyı şeridi.

Çalıştırma: python gen/kompakt_taslak_denetim.py
"""
import json, math, os, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_taslak_uygula as U  # noqa: E402

KIYI_SERIDI_M = 25.0   # duzada-kareler.json → kiyiSeridiM (KKM duzenle/uyarilar.ts ile aynı)


def main():
    sorun = 0

    def yaz(ad, temiz, deger=""):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}{': ' + str(deger) if deger != '' else ''}")

    def bilgi(ad, deger):
        print(f"  [bilgi] {ad}: {deger}")

    if not os.path.exists(U.ELLE):
        print("Elle düzen yok (gen/tek-harita-elle.json): denetlenecek bir şey yok.")
        return 0
    bir = U.birikmis_oku()
    t = bir["taslak"]
    yapilar = json.load(open(U.YAPILAR, encoding="utf-8"))
    yollar = json.load(open(U.YOLLAR, encoding="utf-8"))
    Z = U.Zemin()

    def ic_ice(v):
        if isinstance(v, list):
            return any(isinstance(x, list) or (isinstance(x, dict) and ic_ice(x)) for x in v)
        if isinstance(v, dict):
            return any(ic_ice(x) for x in v.values())
        return False
    yaz("taslakta iç içe dizi yok", not ic_ice(t))
    tek = [k for k, y in list(t.get("yollar", {}).items()) + list(t.get("yeniYollar", {}).items()) if y.get("n") and len(y["n"]) % 2]
    yaz("yol noktaları çift sayı (boylam, enlem)", not tek, tek or "hepsi")

    # kararlı
    y2, l2, _, _ = U.uygula(None, yaz=False)
    a = json.dumps(y2, ensure_ascii=False, separators=(",", ":")) == json.dumps(yapilar, ensure_ascii=False, separators=(",", ":"))
    b = json.dumps(l2, ensure_ascii=False, separators=(",", ":")) == json.dumps(yollar, ensure_ascii=False, separators=(",", ":"))
    yaz("kararlı (yeniden uygulayınca dosyalar aynı)", a and b, "aynı" if a and b else f"yapılar {'aynı' if a else 'farklı'}, yollar {'aynı' if b else 'farklı'}")

    YF = {f["properties"].get("id"): f for f in yapilar["features"]}
    LF = {f["properties"].get("id"): f for f in yollar["features"]}
    eksik = []
    for kim, d in t.get("yapilar", {}).items():
        f = YF.get(kim)
        if d.get("sil"):
            if f and not (f["properties"].get("vikiId") or f["properties"].get("bag")):
                eksik.append(f"silinmedi: {kim}")
        elif f is None or (f["geometry"]["type"] == "Polygon" and [round(v, 6) for v in f["properties"]["merkez"]] != [round(v, 6) for v in d["m"]]):
            eksik.append(f"taşınmadı: {kim}")
    for kim in t.get("yeniYapilar", {}):
        if kim not in YF:
            eksik.append(f"yeni yapı yok: {kim}")
    for kim, d in t.get("yollar", {}).items():
        f = LF.get(kim)
        if d.get("sil"):
            if f and not f["properties"].get("vikiId"):
                eksik.append(f"yol silinmedi: {kim}")
            continue
        if f is None:
            eksik.append(f"yol yok: {kim}")
            continue
        if d.get("n"):
            c = [v for q in f["geometry"]["coordinates"] for v in q[:2]]
            if [round(v, 6) for v in c] != [round(v, 6) for v in d["n"]]:
                eksik.append(f"yolun noktaları değişmedi: {kim}")
        if d.get("kademe") and f["properties"].get("kademe") != d["kademe"]:
            eksik.append(f"kademe değişmedi: {kim}")
        if "ad" in d and f["properties"].get("ad") != d["ad"]:
            eksik.append(f"ad değişmedi: {kim}")
    for kim in t.get("yeniYollar", {}):
        if kim not in LF:
            eksik.append(f"yeni yol yok: {kim}")
    for kim, tur in t.get("kareler", {}).items():
        if tur != "bos" and f"alan_{kim}" not in LF:
            eksik.append(f"boyalı kare yok: {kim}")
    for kim in t.get("gruplar", {}):
        if kim not in LF:
            eksik.append(f"grubun alanı yok: {kim}")
    yaz("taslağın her değişikliği dosyada", not eksik, eksik[:8] or "hepsi")

    # silinmemesi gerekenler
    sil_y = [k for k, d in t.get("yapilar", {}).items() if d.get("sil")]
    korunan = [k for k in sil_y if k in YF and (YF[k]["properties"].get("vikiId") or YF[k]["properties"].get("bag"))]
    kayip = [k for k in sil_y if k not in YF and (bir["silinen"]["yapilar"].get(k, {}).get("oge", {}).get("properties", {}).get("vikiId")
                                                    or bir["silinen"]["yapilar"].get(k, {}).get("oge", {}).get("properties", {}).get("bag"))]
    yaz("viki bağlı ya da oturanlı yapı silinmedi", not kayip, f"{len(korunan)} silme isteği atlandı (yapı yerinde)" if korunan else "silme isteği yok" if not sil_y else "yok")

    # modeller
    yok = sorted({f["properties"]["dosya"] for f in yapilar["features"] if f["properties"].get("elle") and f["properties"].get("dosya")
                  and not os.path.exists(os.path.join(U.KOK, "public", "modeller", f["properties"]["dosya"]))})
    yaz("yalnız KKM'nin modelleri (public/modeller/)", not yok, yok or "hepsi var")

    # gruplar
    hg = json.load(open(os.path.join(U.HARITA, "hazir-gruplar.json"), encoding="utf-8"))
    cesit = {c["id"]: c for g in hg["gruplar"] for c in g["cesitler"]}
    disari = []
    if t.get("gruplar"):
        import hazir_gruplar as HG
        for kim, g in t["gruplar"].items():
            c = cesit.get(g["sablon"])
            k = g["kirp"]
            s = (c or {}).get("kirpma") or {"sol": 0, "sag": 0, "arka": 0}
            if not c or k["sol"] > s["sol"] or k["sag"] > s["sag"] or k["arka"] > s["arka"]:
                disari.append(f"{kim}: {g['sablon']} {k} (sınır {s})")
                continue
            gi, ch = g["sablon"].split("/")
            if HG.kirpilmis(gi, ch, k["sol"], k["sag"], k["arka"]) is None:
                disari.append(f"{kim}: üreteç kuramadı")
    yaz("grupların kırpması kuralın içinde", not disari, disari or f"{len(t.get('gruplar', {}))} grup")

    # elle_cikar geri döner: çıkınca hiçbir elle öğe kalmaz
    c1 = U.elle_cikar(yapilar, "yapilar", bir)
    c2 = U.elle_cikar(yollar, "yollar", bir)
    kalan = sum(1 for f in c1["features"] + c2["features"] if f["properties"].get("elle"))
    yaz("elle öğeler çıkınca üreteçlerin çıktısı kalır", kalan == 0, f"{len(c1['features'])} yapı / öğe, {len(c2['features'])} yol / alan")

    # ------------------------------------------------------------ bilgi: yumuşak kurallar
    from shapely.geometry import LineString, Point, Polygon
    from shapely.strtree import STRtree

    def poly(f):
        return Polygon([Z.sahne(q) for q in f["geometry"]["coordinates"][0]])
    taban = [(f["properties"]["id"], poly(f)) for f in yapilar["features"] if f["properties"].get("katman") == "yapi"]
    agac = STRtree([g for _, g in taban])
    yol_g = [(f["properties"], LineString([Z.sahne(q) for q in f["geometry"]["coordinates"]])) for f in yollar["features"]
             if f["properties"].get("katman") == "yol" and f["geometry"]["type"] == "LineString"]
    yol_alan = [g.buffer(p.get("genislik", 4) / 2 - 0.3, cap_style=2) for p, g in yol_g]
    yol_agac = STRtree(yol_alan)
    binme, yolda, kiyi = [], [], []
    for kim, g in taban:
        f = YF[kim]
        if not f["properties"].get("elle"):
            continue
        for i in agac.query(g):
            o, og = taban[i]
            if o != kim and g.intersection(og).area > 0.5:
                binme.append(f"{kim} ↔ {o}")
                break
        if any(g.intersection(yol_alan[i]).area > 0.5 for i in yol_agac.query(g)):
            yolda.append(kim)
        m = g.centroid
        r = max(math.dist((m.x, m.y), q) for q in g.exterior.coords) + KIYI_SERIDI_M
        if any(Z.rakim(m.x + math.cos(a) * r, m.y + math.sin(a) * r) <= 0.8 for a in [k * math.pi / 8 for k in range(16)]):
            kiyi.append(kim)
    egim = []
    for p, g in yol_g:
        if not p.get("elle"):
            continue
        sinir = U.KADEME.get(p.get("kademe"), {}).get("egim")
        if sinir is None:
            continue
        L = g.length
        ornek = [(s, max(0.0, Z.rakim(*g.interpolate(s).coords[0]))) for s in [i * 5.0 for i in range(int(L // 5) + 1)] + [L]]
        en = 0.0
        for i in range(len(ornek)):
            for j in range(i + 1, len(ornek)):
                if ornek[j][0] - ornek[i][0] >= 20:
                    en = max(en, abs(ornek[j][1] - ornek[i][1]) / (ornek[j][0] - ornek[i][0]))
                    break
        if en > sinir + 0.005:
            egim.append(f"{p.get('ad') or p['id']} %{en * 100:.0f} (sınır %{sinir * 100:.0f})")
    bilgi("üst üste binen elle yapı", binme or "yok")
    bilgi("yola taşan elle yapı", yolda or "yok")
    bilgi(f"kıyı şeridinde ({KIYI_SERIDI_M:.0f} m) elle yapı", kiyi or "yok")
    bilgi("eğim sınırını aşan elle yol", egim or "yok")

    print("Sonuç:", "hepsi temiz" if sorun == 0 else f"{sorun} sorun")
    return sorun


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
