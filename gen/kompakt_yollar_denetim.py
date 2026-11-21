"""Kompakt yol ağı denetimi — public/harita/duzada-yollar.geojson ve yol yatağı açılmış zemin.

Yalnız okur. Her madde "temiz" ya da "SORUN" yazar; sorun varsa çıkış kodu 1 olur.
Sonunda zeminin kendi denetimini de çalıştırır (yol yatağından sonra da temiz olmalı).

  python gen/kompakt_yollar_denetim.py
"""
import json, math, os, sys

import numpy as np
from scipy import ndimage
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_zemin_denetim as zd  # noqa: E402

KOK = os.path.dirname(BURASI)
YOLLAR = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")
EGIM = {"ana": 0.10, "ara": 0.10, "sokak": 0.15, "gecit": 0.15, "toprak": 0.15}
SERBEST = ("patika", "merdiven", "basamak")   # eğim sınırı yok (basamaklı geçit dahil)
PENCERE = 20.0      # m; eğim bu uzunlukta ölçülür
OTURMA = 1.0        # m; yol yüzeyi ile zemin arasında en çok fark (köprü dışında)
KIYI_PAY = 15.0     # m; yol kıyıya bundan çok yaklaşmaz (merdiven hariç)


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    b, ham = zd.oku()
    h = b["hucre"]
    Z = ham.astype(float) * b["birim"]

    def mt(x, y, z=None):
        return ((np.asarray(x) - b["lng0"]) * b["mPerLng"], (np.asarray(y) - b["lat0"]) * b["mPerLat"])

    def zemin(x, y):
        return ndimage.map_coordinates(Z, [(np.asarray(y) - b["y0"]) / h, (np.asarray(x) - b["x0"]) / h], order=1)

    geo = json.load(open(zd.SINIR, encoding="utf-8"))
    ada = transform(mt, shape(next(f for f in geo["features"] if f["properties"]["katman"] == "ada")["geometry"]))
    imp = {f["properties"]["tur"]: transform(mt, shape(f["geometry"])) for f in geo["features"]
           if f["properties"]["katman"] == "imperial"}
    yer = [f for f in geo["features"] if f["properties"]["katman"] == "yerlesim"]
    d = json.load(open(YOLLAR, encoding="utf-8"))
    yollar = [f for f in d["features"] if f["properties"]["katman"] == "yol"]
    kopru = [f for f in d["features"] if f["properties"]["katman"] == "kopru"]
    korunan = {f["properties"]["tur"]: transform(mt, shape(f["geometry"])) for f in d["features"]
               if f["properties"]["katman"] == "korunan"}
    print(f"Yol: {len(yollar)} kayıt, köprü: {len(kopru)}; zemin başlığında yol yatağı: "
          f"{'var' if b.get('yolYatagi') else 'YOK'}")

    G = []
    for f in yollar:
        c = np.asarray(f["geometry"]["coordinates"], float)
        x, y = mt(c[:, 0], c[:, 1])
        p_ = dict(f["properties"])
        p_["k"] = "basamak" if p_["kademe"] == "gecit" and p_["tur"] == "basamak" else p_["kademe"]
        G.append(dict(p=p_, xy=np.column_stack([x, y]), z=c[:, 2], g=LineString(np.column_stack([x, y]))))

    # köprü kesimleri (yolun üstünde, uzunluk boyunca)
    kop_g = {}
    for f in kopru:
        c = np.asarray(f["geometry"]["coordinates"], float)
        kop_g.setdefault(f["properties"]["yol"], []).append(LineString(np.column_stack(mt(c[:, 0], c[:, 1]))).buffer(1.0))

    uz = {}
    for y in G:
        uz[y["p"]["kademe"]] = uz.get(y["p"]["kademe"], 0.0) + y["g"].length
    T = sum(uz.values())
    sira = ["ana", "ara", "sokak", "gecit", "toprak", "patika", "merdiven"]
    print("Uzunluk (kademe):", ", ".join(f"{k} {uz[k] / 1000:.1f} km (%{100 * uz[k] / T:.0f})" for k in sira if k in uz),
          f"· toplam {T / 1000:.1f} km")
    yaz("Toprak yol payı (uzunluk)", uz.get("toprak", 0) / T <= 0.12,
        f"%{100 * uz.get('toprak', 0) / T:.1f} (patikayla %{100 * (uz.get('toprak', 0) + uz.get('patika', 0)) / T:.1f})")

    # 1) eğim: yol yüzeyinin yüksekliği boyunca, 20 m pencerede
    for tur, lim in EGIM.items():
        en, asan, top = 0.0, 0.0, 0.0
        kim = ""
        for y in G:
            if y["p"]["k"] != tur:
                continue
            g = LineString(np.column_stack([y["xy"], y["z"]]))
            L = y["g"].length
            s = np.arange(0, L + 0.01, 2.0)
            pts = np.array([g.interpolate(t).coords[0] for t in s])
            k = int(PENCERE / 2.0)
            if len(s) <= k:
                continue
            e = np.abs(pts[k:, 2] - pts[:-k, 2]) / (s[k:] - s[:-k])
            top += L
            asan += (e > lim + 1e-3).sum() * 2.0
            if e.max() > en:
                en, kim = float(e.max()), y["p"].get("ad") or y["p"]["id"]
                q = pts[np.argmax(e)]
                kim += f" @ {q[0]:.0f},{q[1]:.0f}"
        yaz(f"Eğim, {tur} (sınır %{lim * 100:.0f})", asan == 0,
            f"en dik %{en * 100:.1f} ({kim}); sınırı aşan {asan:.0f} m")
    for tur in SERBEST:
        en = 0.0
        for y in G:
            if y["p"]["k"] == tur and y["g"].length > PENCERE:
                g = LineString(np.column_stack([y["xy"], y["z"]]))
                s = np.arange(0, y["g"].length + 0.01, 2.0)
                pts = np.array([g.interpolate(t).coords[0] for t in s])
                k = int(PENCERE / 2.0)
                en = max(en, float(np.max(np.abs(pts[k:, 2] - pts[:-k, 2]) / (s[k:] - s[:-k]))))
        print(f"  [bilgi] Eğim, {tur} (sınır yok): en dik %{en * 100:.0f}")

    # 2) yol zemine oturuyor mu (köprü dışında)
    en, kim, top_k = 0.0, "", 0.0
    for y in G:
        g3 = LineString(np.column_stack([y["xy"], y["z"]]))
        s = np.arange(0, y["g"].length + 0.01, 2.0)
        pts = np.array([g3.interpolate(t).coords[0] for t in s])
        fark = pts[:, 2] - zemin(pts[:, 0], pts[:, 1])
        kp = kop_g.get(y["p"]["id"])
        if kp:
            u = unary_union(kp)
            ic = np.array([u.contains(Point(q[0], q[1])) for q in pts])
            if (fark[ic] < -0.5).any():
                en = max(en, 99.0)
            fark = fark[~ic]
        if fark.size and np.abs(fark).max() > en:
            en, kim = float(np.abs(fark).max()), y["p"].get("ad") or y["p"]["id"]
            q = pts[~ic][np.argmax(np.abs(fark))] if kp else pts[np.argmax(np.abs(fark))]
            kim += f" @ {q[0]:.0f},{q[1]:.0f}"
    yaz("Yol zemine oturuyor (köprü dışında)", en <= OTURMA, f"en büyük fark {en:.2f} m ({kim}); sınır {OTURMA} m")
    for f in kopru:
        pass
    kl = [f["properties"]["uzunlukM"] for f in kopru]
    for f in kopru:
        if f["properties"]["uzunlukM"] > 60:
            c = f["geometry"]["coordinates"][0]
            print(f"    uzun köprü: {f['properties']['yol']} {f['properties']['uzunlukM']} m @ {mt(c[0], c[1])[0]:.0f},{mt(c[0], c[1])[1]:.0f}")
    yaz("Köprüler kısa (≤ 60 m)", all(k_ <= 60 for k_ in kl),
        f"{len(kl)} köprü, uzunluklar {', '.join(f'{k_:.0f} m' for k_ in kl) or '-'}")

    # 3) kıyıya / denize taşma
    kiyi = ada.exterior
    en_y, kim = 1e9, ""
    for y in G:
        if y["p"]["k"] in ("merdiven", "basamak"):
            if not ada.buffer(0.5).contains(y["g"]):
                yaz("Merdiven karada", False, "merdivenin bir kısmı denizde")
            continue
        dd = min(kiyi.distance(Point(q)) for q in np.asarray(y["g"].segmentize(5.0).coords))
        if not ada.contains(y["g"]):
            dd = -1
        if dd < en_y:
            en_y, kim = dd, y["p"].get("ad") or y["p"]["id"]
    yaz("Kıyıya taşma (merdiven ve basamaklı geçit hariç)", en_y >= KIYI_PAY, f"kıyıya en yakın yol {en_y:.0f} m ({kim}); sınır {KIYI_PAY:.0f} m")

    # 4) kendi kendini kesme
    kesen = [y["p"].get("ad") or y["p"]["id"] for y in G if not y["g"].is_simple]
    yaz("Kendi kendini kesen yol", not kesen, ", ".join(kesen) or "yok")

    # 5) kopuk uç
    geoms = [y["g"] for y in G]
    agac = STRtree(geoms)
    sah = imp["sahanlik"].buffer(3)
    kopuk = []
    cikmaz = 0
    for i, y in enumerate(G):
        c = list(y["p"].get("cikmaz", [False, False]))
        if np.hypot(*(y["xy"][0] - y["xy"][-1])) < 0.5:
            c = [True, True]        # kapalı halka (Sahil Yolu): iki ucu birbirine değer
            cikmaz -= 2
        for k_, q in enumerate((y["xy"][0], y["xy"][-1])):
            P = Point(q)
            if c[k_]:
                cikmaz += 1
                continue
            yakin = [j for j in agac.query(P, predicate="dwithin", distance=0.5) if j != i]
            kendi = geoms[i].distance(P) < 0.5 and False
            if yakin or sah.contains(P) or kendi:
                continue
            kopuk.append(f"{y['p'].get('ad') or y['p']['id']} ({'baş' if k_ == 0 else 'son'})")
    yaz("Kopuk uç (çıkmaz diye işaretli olmayan)", not kopuk, ", ".join(kopuk[:12]) or f"yok; işaretli çıkmaz uç {cikmaz}")

    # 6) bağlılık: tek ağ, her köy ağa bağlı
    ata = list(range(len(G)))

    def bul(a):
        while ata[a] != a:
            ata[a] = ata[ata[a]]
            a = ata[a]
        return a
    for i, g in enumerate(geoms):
        for j in agac.query(g, predicate="dwithin", distance=0.5):
            ata[bul(i)] = bul(int(j))
    ic = [i for i, g in enumerate(geoms) if sah.intersects(g)]
    for a in ic[1:]:
        ata[bul(a)] = bul(ic[0])
    kokler = {bul(i) for i in range(len(G))}
    yaz("Tek parça ağ", len(kokler) == 1, f"{len(kokler)} parça")
    ana_kok = bul(next(i for i, y in enumerate(G) if y["p"].get("ad") == "Sahil Yolu"))
    for f in yer:
        q = Point(mt(*f["geometry"]["coordinates"]))
        r = f["properties"]["yaricapM"]
        say = sum(1 for i, g in enumerate(geoms) if bul(i) == ana_kok and g.distance(q) <= r)
        yaz(f"Köy ağa bağlı: {f['properties']['tanim']}", say > 0, f"{say} yol köyün {r} m çevresinde")

    # 7) korunan alanlar
    for ad, alan in (("Stat alanı", korunan.get("stat")), ("Merkez Meydanı", korunan.get("meydan")),
                     ("The Imperial binası", imp.get("otel"))):
        if alan is None:
            yaz(ad, False, "alan bulunamadı")
            continue
        ic_ = alan.buffer(-0.5)
        giren = [y["p"].get("ad") or y["p"]["id"] for y in G if y["g"].intersects(ic_)]
        yaz(f"{ad} yola kapalı", not giren, ", ".join(giren) or "içinden yol geçmiyor")
    sah_i = imp["sahanlik"].buffer(-0.5)
    giren = [y["p"].get("ad") or y["p"]["id"] for y in G if y["g"].intersects(sah_i)]
    yaz("Sahanlığa yalnız Otel Yolu ve Sahil Merdiveni değer", set(giren) <= {"Otel Yolu", "Sahil Merdiveni"},
        ", ".join(giren) or "-")
    oy = next((y for y in G if y["p"].get("ad") == "Otel Yolu"), None)
    yaz("Otel Yolu sahanlığa çıkıyor", oy is not None and imp["sahanlik"].buffer(3).contains(Point(oy["xy"][-1])),
        f"son nokta sahanlığa {imp['sahanlik'].distance(Point(oy['xy'][-1])):.1f} m" if oy else "yok")

    # 8) alanlar: her yolda kalıcı kimlik, kademe, tür, ad, viki, genişlik
    gerek = ("id", "kademe", "tur", "kurucuTuru", "ad", "vikiId", "genislik")
    eksik = [y["p"].get("id", "?") for y in G if any(k_ not in y["p"] for k_ in gerek)]
    idler = [y["p"]["id"] for y in G]
    yaz("Her yolda alanlar (id, kademe, tur, kurucuTuru, ad, vikiId, genislik)", not eksik, ", ".join(eksik[:5]) or "tam")
    yaz("Kimlikler tekil", len(idler) == len(set(idler)), f"{len(idler)} yol, {len(set(idler))} kimlik")
    adli = {y["p"]["ad"]: y["p"]["id"] for y in G if y["p"]["ad"]}
    yaz("Adlı yol kimliği addan (kalıcı)", all(v.startswith("yol_") for v in adli.values()) and len(adli) == sum(1 for y in G if y["p"]["ad"]),
        f"{len(adli)} adlı yol")
    # 9) stat sekisi düz, birahane yeri yola kapalı
    if "seki" in korunan:
        gx_ = b["x0"] + np.arange(Z.shape[1]) * h
        gy_ = b["y0"] + np.arange(Z.shape[0]) * h
        from matplotlib.path import Path as _P
        XX, YY = np.meshgrid(gx_, gy_)
        sk = korunan["seki"].buffer(-h)
        m_ = _P(np.asarray(sk.exterior.coords)).contains_points(np.column_stack([XX.ravel(), YY.ravel()])).reshape(Z.shape)
        yaz("Stat sekisi düz", float(np.ptp(Z[m_])) <= 0.3, f"içinde fark {np.ptp(Z[m_]):.2f} m, kot {Z[m_].mean():.1f} m")
    else:
        yaz("Stat sekisi", False, "yok")
    if "birahane-yeri" in korunan:
        giren = [y["p"].get("ad") or y["p"]["id"] for y in G if y["g"].intersects(korunan["birahane-yeri"].buffer(-0.5))]
        yaz("Birahane yeri yola kapalı", not giren, ", ".join(giren) or "içinden yol geçmiyor")
    else:
        yaz("Birahane yeri", False, "yok")
    # 10) kıyı köyü: bugünkü haritadaki sokak hatları, 0,70 ile taşınmış (Kemal, 20 Kasım akşam)
    gs = open(os.path.join(KOK, "src", "data", "kurucuGomulu.ts"), encoding="utf-8").read()
    gi = gs.index("JSON.parse(", gs.index("GOMULU_DUZEN")) + len("JSON.parse(")
    kur = json.loads(json.loads(gs[gi:gs.index('");', gi) + 1]))["kurucuIslenen"]
    ox, oy = b["odak"]

    def tasi(lng, lat):
        x, y = mt(lng, lat)
        return (ox + b["olcek"] * (x - ox), oy + b["olcek"] * (y - oy))
    kk = ["kurucu_yol_muqydtwz", "kurucu_yol_muqyfr79", "kurucu_yol_muqyfdcj", "kurucu_yol_muqygcwx",
          "kurucu_yol_muqyfdcj_1", "kurucu_yol_muqyfdcj_2", "kurucu_yol_muqyfdcj_3", "kurucu_yol_muqyghd4",
          "kurucu_yol_muqyh31i"]
    agu = unary_union([y["g"] for y in G])
    sap = []
    for k_ in kk:
        n_ = kur["yeniYollar"][k_]["n"]
        g_ = LineString([tasi(n_[i], n_[i + 1]) for i in range(0, len(n_), 2)])
        uc = 5.0 if g_.length > 12 else 0.0     # uçlar değdikleri yola oturtulur (birkaç metre)
        ds = [agu.distance(g_.interpolate(t)) for t in np.arange(uc, g_.length - uc + 0.01, 4.0)]
        sap.append(max(ds) if ds else 0.0)
    yaz("Kıyı köyü sokakları bugünkü haritadakiyle aynı hat (0,70 ile taşınmış)", max(sap) <= 1.0,
        f"{len(kk)} yol, taşınmış eski hattan en çok {max(sap):.2f} m sapma")
    if "birahane-yeri" in korunan:
        bb = kur["yeniBinalar"]["kurucu_bina_mw1zb16h"]
        bq = Point(tasi(bb["x"], bb["y"]))
        # ölçek küçülünce bina yola binmesin diye ön yüzü yol kenarından 1,5 m geri çekilir (en çok birkaç metre)
        yaz("Birahane yeri eski binanın taşınmış yerinde", korunan["birahane-yeri"].centroid.distance(bq) <= 6.0,
            f"fark {korunan['birahane-yeri'].centroid.distance(bq):.2f} m, kıyıya {kiyi.distance(korunan['birahane-yeri']):.0f} m")
        sy = next((y["g"] for y in G if y["p"].get("ad") == "Sahil Yolu"), None)
        if sy is not None:
            q_ = sy.interpolate(sy.project(bq))
            yaz("Kıyı köyü Sahil Yolu'nun deniz yanında", kiyi.distance(korunan["birahane-yeri"]) < kiyi.distance(q_),
                f"birahane yeri kıyıya {kiyi.distance(korunan['birahane-yeri']):.0f} m, Sahil Yolu {kiyi.distance(q_):.0f} m")
    print("Zemin denetimi (yol yatağıyla):")
    sorun += zd.main()
    print("Sonuç:", "hepsi temiz" if sorun == 0 else f"{sorun} sorun")
    return 1 if sorun else 0


if __name__ == "__main__":
    sys.exit(main())
