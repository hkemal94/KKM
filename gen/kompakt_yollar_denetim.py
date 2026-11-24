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
from kompakt_taslak_uygula import elle_cikar  # noqa: E402  (KKM Düzenle'nin elle öğeleri bu üretecin girdisi değil)

KOK = os.path.dirname(BURASI)
YOLLAR = os.path.join(KOK, "public", "harita", "duzada-yollar.geojson")
EGIM = {"ana": 0.10, "ara": 0.10, "sokak": 0.15, "gecit": 0.15, "toprak": 0.15}
SERBEST = ("patika", "merdiven", "basamak")   # eğim sınırı yok (basamaklı geçit dahil)
PENCERE = 20.0      # m; eğim bu uzunlukta ölçülür
ASIM_ORAN = 2.0     # gen/kompakt_yollar.py ile aynı: yumuşak kuralla (egimAsimi) en çok sınırın bu katı
OTURMA = 1.0        # m; yol yüzeyi ile zemin arasında en çok fark (köprü dışında)
KIYI_PAY = 15.0     # m; yol kıyıya bundan çok yaklaşmaz (merdiven hariç)


def dirsek_yerleri(xy, adim=2.0, pencere=20.0, esik=60.0):
    """Keskin dirsekler: yol 2 m'de bir örneklenir; 20 m içinde yönü 60°'den çok dönen yer bir dirsek (sonra 20 m atlanır).
    Döner: dirseklerin metre noktaları."""
    q = np.asarray(xy, float)
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(q, axis=0).T))]
    if s[-1] < pencere + 2 * adim:
        return []
    t = np.arange(0, s[-1], adim)
    r = np.column_stack([np.interp(t, s, q[:, 0]), np.interp(t, s, q[:, 1])])
    h = np.unwrap(np.arctan2(np.diff(r[:, 1]), np.diff(r[:, 0])))
    k = int(pencere / adim)
    out, i = [], 0
    while i + k < len(h):
        if math.degrees(abs(h[i + k] - h[i])) > esik:
            out.append(tuple(r[i + k // 2]))
            i += k
        else:
            i += 1
    return out


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
    d = elle_cikar(json.load(open(YOLLAR, encoding="utf-8")), "yollar")   # elle yollar: gen/kompakt_taslak_denetim.py
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

    # 1) eğim: yol yüzeyinin yüksekliği boyunca, 20 m pencerede. Zemini elle değişen yoldan geçen yol
    # (KKM Düzenle → Zemin; gen/tek-harita-elle.json → yolOnceki) yumuşak kural: aşımı yalnız bilgi
    import kompakt_taslak_uygula as _U
    elle_yol = set((_U.birikmis_oku().get("yolOnceki") or {}).keys()) if os.path.exists(_U.ELLE) else set()
    yum_m, yum_en = {}, {}
    for tur, lim in EGIM.items():
        en, asan, top = 0.0, 0.0, 0.0
        kim = ""
        bilgi_elle = []
        for y in G:
            if y["p"]["k"] != tur:
                continue
            if y["p"]["id"] in elle_yol:
                g = LineString(np.column_stack([y["xy"], y["z"]]))
                s = np.arange(0, y["g"].length + 0.01, 2.0)
                pts = np.array([g.interpolate(t).coords[0] for t in s])
                k = int(PENCERE / 2.0)
                if len(s) > k:
                    e = float(np.max(np.abs(pts[k:, 2] - pts[:-k, 2]) / (s[k:] - s[:-k])))
                    if e > lim + 1e-3:
                        bilgi_elle.append(f"{y['p'].get('ad') or y['p']['id']} %{e * 100:.0f}")
                continue
            g = LineString(np.column_stack([y["xy"], y["z"]]))
            L = y["g"].length
            s = np.arange(0, L + 0.01, 2.0)
            pts = np.array([g.interpolate(t).coords[0] for t in s])
            k = int(PENCERE / 2.0)
            if len(s) <= k:
                continue
            e = np.abs(pts[k:, 2] - pts[:-k, 2]) / (s[k:] - s[:-k])
            # yumuşak kural (24 Kasım, doğal hat): yolun egimAsimi aralıklarında sınırın ASIM_ORAN katına kadar bilgi
            sm = 0.5 * (s[k:] + s[:-k])
            yum = np.zeros(len(e), bool)
            for a_, b_ in y["p"].get("egimAsimi", []):
                yum |= (sm >= a_ - 1.0) & (sm <= b_ + 1.0)
            if yum.any():
                ey = e[yum]
                yum_m[tur] = yum_m.get(tur, 0.0) + float((ey > lim + 1e-3).sum() * 2.0)
                yum_en[tur] = max(yum_en.get(tur, 0.0), float(ey.max()))
                e = np.where(yum & (e <= lim * ASIM_ORAN + 1e-3), 0.0, e)
            top += L
            asan += (e > lim + 1e-3).sum() * 2.0
            if e.max() > en:
                en, kim = float(e.max()), y["p"].get("ad") or y["p"]["id"]
                q = pts[np.argmax(e)]
                kim += f" @ {q[0]:.0f},{q[1]:.0f}"
        yaz(f"Eğim, {tur} (sınır %{lim * 100:.0f})", asan == 0,
            f"en dik %{en * 100:.1f} ({kim}); sınırı aşan {asan:.0f} m")
        if yum_m.get(tur):
            print(f"  [bilgi] Eğim, {tur}, yumuşak kural (doğal hat, sınırın {ASIM_ORAN:g} katına kadar): "
                  f"{yum_m[tur]:.0f} m sınırı aşıyor, en dik %{yum_en[tur] * 100:.1f}")
        if bilgi_elle:
            print(f"  [bilgi] Eğim, {tur}, elle zemindeki yol (yumuşak kural): {', '.join(bilgi_elle)}")
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

    # 1b) keskin dirsek / zikzak (Kemal 24 Kasım: "düzgün, doğal bir yol olsun"): yol boyunca 20 m içinde 60°'den
    # çok yön değişimi bir dirsek sayılır (2 m'de bir örnek; sayıldıktan sonra 20 m atlanır). Adlı ana ve ara yollarda
    # (Sahil Yolu, bağlantılar) hiç olmamalı; köy sokaklarında ve merdivende yalnız bilgi (sokak dokusu ayrı iş).
    say, adli_d = {}, []
    for y in G:
        n_ = len(dirsek_yerleri(y["xy"]))
        say[y["p"]["kademe"]] = say.get(y["p"]["kademe"], 0) + n_
        if n_ and y["p"].get("ad") and y["p"]["kademe"] in ("ana", "ara"):
            adli_d.append(f"{y['p']['ad']} {n_}")
    yaz("Keskin dirsek / zikzak, adlı ana ve ara yollar (20 m içinde 60°'den çok dönüş)", not adli_d,
        ", ".join(adli_d) or "yok")
    tum = json.load(open(YOLLAR, encoding="utf-8"))
    elle_d = [f"{f['properties']['id']} {len(dirsek_yerleri(np.column_stack(mt(*np.asarray(f['geometry']['coordinates'], float)[:, :2].T))))}"
              for f in tum["features"] if f["properties"].get("katman") == "yol" and f["properties"].get("elle")]
    print(f"  [bilgi] Keskin dirsek / zikzak, kademe başına: {sum(say.values())} "
          f"({', '.join(f'{k} {v}' for k, v in say.items() if v) or '-'}); elle yollar: {', '.join(elle_d) or '-'}")

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
    # 10) kıyı köyü: bugünkü haritadaki sokak hatları, 0,70 ile taşınmış (Kemal, 20 Kasım akşam), bütünüyle kıyıya
    #     kaymış (Kemal, 21 Kasım)
    import kompakt_eski as EK      # eski haritanın dondurulmuş girdileri (tek harita 11. adım)
    ox, oy = b["odak"]

    # Kemal 21 Kasım: köy kıyıya doğru bütünüyle kaydı (duzada-sinirlar.geojson "kaymaM")
    _kay = next((f["properties"].get("kaymaM") for f in yer if f["properties"]["id"] == "yerlesim_stadyum_kiyi"), None) or (0.0, 0.0)

    def tasi(lng, lat):
        x, y = mt(lng, lat)
        return (ox + b["olcek"] * (x - ox) + _kay[0], oy + b["olcek"] * (y - oy) + _kay[1])
    kk = ["kurucu_yol_muqydtwz", "kurucu_yol_muqyfr79", "kurucu_yol_muqyfdcj", "kurucu_yol_muqygcwx",
          "kurucu_yol_muqyfdcj_1", "kurucu_yol_muqyfdcj_2", "kurucu_yol_muqyfdcj_3", "kurucu_yol_muqyghd4",
          "kurucu_yol_muqyh31i"]
    agu = unary_union([y["g"] for y in G])
    sap = []
    for k_ in kk:
        n_ = EK.KIYI_KOYU_YOLLARI[k_]["n"]
        g_ = LineString([tasi(n_[i], n_[i + 1]) for i in range(0, len(n_), 2)])
        uc = 5.0 if g_.length > 12 else 0.0     # uçlar değdikleri yola oturtulur (birkaç metre)
        ds = [agu.distance(g_.interpolate(t)) for t in np.arange(uc, g_.length - uc + 0.01, 4.0)]
        sap.append(max(ds) if ds else 0.0)
    yaz("Kıyı köyü sokakları bugünkü haritadakiyle aynı hat (0,70 ile taşınmış)", max(sap) <= 1.0,
        f"{len(kk)} yol, taşınmış eski hattan en çok {max(sap):.2f} m sapma")
    if "birahane-yeri" in korunan:
        bb = EK.KIYI_KOYU_BIRAHANE      # Kurucu'daki kurucu_bina_mw1zb16h
        bq = Point(tasi(bb["x"], bb["y"]))
        # ölçek küçülünce bina yola binmesin diye ön yüzü yol kenarından 1,5 m geri çekilir (en çok birkaç metre).
        # Kemal 21 Kasım: yer modele göre derinleşti (15 → 27,5 m); ön yüz yerinde, merkez derinlik farkının yarısı kadar geride
        _rk = list(korunan["birahane-yeri"].minimum_rotated_rectangle.exterior.coords)
        _derin = max(math.dist(_rk[0], _rk[1]), math.dist(_rk[1], _rk[2]))
        _pay = 6.0 + max(0.0, (_derin - bb["boy"]) / 2)
        yaz("Birahane yeri eski binanın taşınmış yerinde", korunan["birahane-yeri"].centroid.distance(bq) <= _pay,
            f"fark {korunan['birahane-yeri'].centroid.distance(bq):.2f} m, kıyıya {kiyi.distance(korunan['birahane-yeri']):.0f} m")
        sy = next((y["g"] for y in G if y["p"].get("ad") == "Sahil Yolu"), None)
        if sy is not None:
            q_ = sy.interpolate(sy.project(bq))
            yaz("Kıyı köyü Sahil Yolu'nun deniz yanında", kiyi.distance(korunan["birahane-yeri"]) < kiyi.distance(q_),
                f"birahane yeri kıyıya {kiyi.distance(korunan['birahane-yeri']):.0f} m, Sahil Yolu {kiyi.distance(q_):.0f} m")
    # 11) Liman kasabası: eski haritadaki sokaklar, gen/kompakt_liman.py'nin taşımasıyla (Kemal, 22 Kasım)
    import kompakt_liman as LM
    lm_sokak, _, _ = LM.eski_liman()
    sap, kayip = [], []
    for k_, (ad_, hat_) in lm_sokak.items():
        g_ = LineString([LM.tasi(*c) for c in hat_])
        uc = 5.0 if g_.length > 12 else 0.0
        ds = [agu.distance(g_.interpolate(t)) for t in np.arange(uc, g_.length - uc + 0.01, 4.0)]
        if ds and max(ds) > 4.0:      # eskisinde değdiği yola 4 m'den yakın biten uç o yolun üstüne oturtulur
            kayip.append(k_)
        sap.append(max(ds) if ds else 0.0)
    yaz("Liman sokakları eski haritadakiyle aynı hat (oran 0,70, odak Dondurmacı Kızlar)", not kayip,
        f"{len(lm_sokak)} sokak, {len(lm_sokak) - len(kayip)} tanesi taşınmış eski hattan en çok "
        f"{max(s_ for s_, k_ in zip(sap, lm_sokak) if k_ not in kayip):.2f} m sapmayla (uçlar değdikleri yola oturtulur); "
        f"hattından kayan: {', '.join(kayip) or '-'}")
    lm_u = unary_union([LineString([LM.tasi(*c) for c in hat_]) for _, hat_ in lm_sokak.values()])
    yaz("Liman sokakları kıyıya 20 m'den yaklaşmaz", kiyi.distance(lm_u) >= 20.0, f"en yakın {kiyi.distance(lm_u):.0f} m")
    # 12) İskele köyü: eski haritadaki sokaklar, gen/kompakt_iskele.py'nin taşımasıyla (Kemal, 24 Kasım)
    import kompakt_iskele as IS
    is_sokak, _, is_sahil = IS.eski_iskele()
    sap, kayip = [], []
    for k_, (ad_, kd_, hat_) in is_sokak.items():
        g_ = LineString([IS.tasi(*c) for c in hat_])
        uc = 5.0 if g_.length > 12 else 0.0
        ds = [agu.distance(g_.interpolate(t)) for t in np.arange(uc, g_.length - uc + 0.01, 4.0)]
        if ds and max(ds) > 4.0:
            kayip.append(k_)
        sap.append(max(ds) if ds else 0.0)
    yaz("İskele sokakları eski haritadakiyle aynı hat (oran 0,70, kara yönüne kayma)", not kayip,
        f"{len(is_sokak)} sokak, {len(is_sokak) - len(kayip)} tanesi taşınmış eski hattan en çok "
        f"{max(s_ for s_, k_ in zip(sap, is_sokak) if k_ not in kayip):.2f} m sapmayla; hattından kayan: {', '.join(kayip) or '-'}")
    is_u = unary_union([LineString([IS.tasi(*c) for c in hat_]) for _, _, hat_ in is_sokak.values()])
    yaz("İskele sokakları kıyıya 20 m'den yaklaşmaz", kiyi.distance(is_u) >= IS.KIYI_EN_AZ, f"en yakın {kiyi.distance(is_u):.0f} m")
    kc_ = next((y["g"] for y in G if y["p"].get("ad") == "Kemsköy Caddesi"), None)
    yaz("Kemsköy Caddesi eski haritadaki hattıyla", kc_ is not None and kc_.hausdorff_distance(
        LineString([IS.tasi(*c) for c in is_sokak["yol_kemskoy"][2]])) <= 4.0,
        f"taşınmış eski hattan en çok {kc_.hausdorff_distance(LineString([IS.tasi(*c) for c in is_sokak['yol_kemskoy'][2]])):.2f} m"
        if kc_ is not None else "yok")
    sy_g = next((y["g"] for y in G if y["p"].get("ad") == "Sahil Yolu"), None)
    es_ = LineString([IS.tasi(*c) for c in is_sahil]).intersection(is_u.convex_hull)
    es_ = max(getattr(es_, "geoms", [es_]), key=lambda g: g.length)
    ds_ = [sy_g.distance(es_.interpolate(t)) for t in np.arange(0, es_.length + 0.01, 4.0)] if sy_g is not None else [99.0]
    yaz("Sahil Yolu İskele'nin içinde eski haritadaki hattından", max(ds_) <= 1.0,
        f"köyün içindeki {es_.length:.0f} m'de taşınmış eski hattan en çok {max(ds_):.2f} m")
    # Sahil Yolu'nun Liman ve İskele dışındaki noktaları ana daldakiyle aynı (gen/kompakt-sahil-ana.json)
    sa_ = json.load(open(os.path.join(BURASI, "kompakt-sahil-ana.json"), encoding="utf-8"))["koordinatlar"]
    sy_ = next((f["geometry"]["coordinates"] for f in yollar if f["properties"].get("ad") == "Sahil Yolu"), [])
    nl = 0
    while nl < min(len(sa_), len(sy_)) and sa_[nl] == sy_[nl]:
        nl += 1
    nr = 0
    while nr < min(len(sa_), len(sy_)) - nl and sa_[-1 - nr] == sy_[-1 - nr]:
        nr += 1
    disari = [mt(*c[:2]) for c in sa_[nl:len(sa_) - nr]]
    uzak = max((Point(q).distance(is_u) for q in disari), default=0.0)
    yaz("Sahil Yolu Liman ve İskele dışında ana daldakiyle aynı nokta nokta (Liman kesimi dosyada)", uzak <= 1200.0,
        f"{nl + nr} / {len(sa_)} nokta aynı; değişenlerin İskele sokaklarına en uzağı {uzak:.0f} m")
    print("Zemin denetimi (yol yatağıyla):")
    sorun += zd.main()
    print("Sonuç:", "hepsi temiz" if sorun == 0 else f"{sorun} sorun")
    return 1 if sorun else 0


if __name__ == "__main__":
    sys.exit(main())
