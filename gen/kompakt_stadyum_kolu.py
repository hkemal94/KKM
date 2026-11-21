"""Stadyum'un Merkez ile Çiftlik arasında güneye inen kolu Çiftlik'e geçer (Kemal, 21 Kasım 2026).

Kemal: Merkez'in küçülmüş hâli onaylı; tek düzeltme, Stadyum'un Merkez'den alıp Merkez ile Çiftlik
arasında güneye uzanan ince kolu Çiftlik'in olsun. Stadyum–Çiftlik sınırı doğal hatta (sırt, dere)
otursun, Stadyum kuzeydeki kazancını korusun. Merkez'in sınırı değişmez.

Yöntem: kompakt_merkez_sinirlari.py'nin ızgarası ve yürüme maliyeti (sırt ve dere geçmek pahalı)
ödünç alınır. Stadyum'un, onaylı Stadyum–Çiftlik hattının iç ucundan güneyde (Merkez'e yakın) kalan
toprağı yeniden paylaşılır: Çiftlik bütün toprağından, Stadyum bu kuşağın dışındaki (kuzeydeki)
toprağından büyür; her hücre en ucuz ulaşana düşer; Çiftlik'e, kolun tamamı geçene kadar artan bir öncelik payı verilir. Yeni sınır eşit maliyet
çizgisinde, yani bir sırtta ya da derede kalır. Stadyum–Çiftlik'in 20 Kasım'daki onaylı kesimi ve çevresi korunur.

Tek seferlik: yaptığı sınıra not düşer; ikinci çalıştırmada bir şey yapmaz.

Sıra: kompakt_merkez_sinirlari.py → bu dosya → kompakt_mahalle_yerlesim.py → kompakt_parseller.py

  python gen/kompakt_stadyum_kolu.py
"""
import os, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
_kaynak = open(os.path.join(BURASI, "kompakt_merkez_sinirlari.py"), encoding="utf-8").read()
_kes = _kaynak.index("# ------------------------------------------------------------------ Merkez payı")
exec(compile(_kaynak[:_kes], "kompakt_merkez_sinirlari.py", "exec"))   # ızgara, maliyet, yardımcılar

from shapely.ops import polygonize  # noqa: E402

STADYUM, CIFTLIK = "yer_stadyum", "yer_ciftlik"
KOL_GENISLIK = 1500.0    # DENEME: kol Merkez'den en çok bu kadar genişler (m)
KUZEY_PAY = 700.0        # DENEME: onaylı hattın iç ucunun bu kadar kuzeyine kadarki Stadyum toprağı yeniden paylaşılır (m)
ONAYLI_PAY = 200.0       # DENEME: Stadyum–Çiftlik'in onaylı kesiminin bu kadar çevresi değişmez (m)
NOT_KOL = "Kemal 21 Kasım: Stadyum'un güneye inen kolu Çiftlik'e geçti; Stadyum–Çiftlik sınırı doğal hatta"

if any(NOT_KOL in f["properties"].get("not", "") for f in sabit["features"]):
    print("Stadyum kolu zaten Çiftlik'te; sınırlar aynı kaldı.")
    sys.exit(0)

S, C, M = ESKI[STADYUM], ESKI[CIFTLIK], ESKI[MERKEZ]
onayli = [f for f in sabit["features"] if f["properties"]["katman"] == "sinir"
          and sorted(f["properties"]["mahalleler"]) == sorted([STADYUM, CIFTLIK]) and "not" not in f["properties"]]
onayli_g = unary_union([transform(mt, shape(f["geometry"])) for f in onayli])
# kol, onaylı Stadyum–Çiftlik hattının iç (batı) ucunun güneyinde kalan Stadyum toprağıdır; Stadyum'un
# eski toprağı ve kuzeydeki kazancı bu ucun kuzeyinde
_uclar = [Point(h.coords[0]) for h in getattr(onayli_g, "geoms", [onayli_g])] + \
    [Point(h.coords[-1]) for h in getattr(onayli_g, "geoms", [onayli_g])]
UC = max(_uclar, key=lambda q: ADA.exterior.distance(q))          # kıyıdan uzak uç
_x0, _y0, _x1, _y1 = S.bounds
GUNEY = Polygon([(_x0 - 10, _y0 - 10), (_x1 + 10, _y0 - 10), (_x1 + 10, UC.y + KUZEY_PAY), (_x0 - 10, UC.y + KUZEY_PAY)])
KUSAK = S.intersection(GUNEY).intersection(M.buffer(KOL_GENISLIK)) \
    .difference(onayli_g.buffer(ONAYLI_PAY)).buffer(0)
KUSAK = unary_union([q for q in poligonlar(KUSAK) if q.area > 1e4])
if KUSAK.is_empty:
    print("Stadyum'un Merkez ile Çiftlik arasında kolu yok; sınırlar aynı kaldı.")
    sys.exit(0)

KUS = icinde(KUSAK) & KARA
S_C = icinde(S) & KARA & ~KUS
C_C = icinde(C) & KARA
dS, dC = uzaklik(S_C), uzaklik(C_C)
NS, NC = 0, 1
ETK = np.full(Zk.shape, -1)
# Çiftlik'e öncelik payı: kolun tamamı (onaylı hattın iç ucunun güneyi) Çiftlik'e geçene kadar artar;
# sınır yine eşit maliyet çizgisinde, yani sırtta ya da derede kalır
GUNEYDE = KUS & (GY < UC.y)
alt, ust = 0.0, 50000.0
for _ in range(40):
    pay = (alt + ust) / 2
    if ((dC - pay >= dS) & GUNEYDE).sum() * hk * hk > 2000.0:
        alt = pay
    else:
        ust = pay
PAY_C = ust
ETK[KUS] = np.where(dC[KUS] - PAY_C < dS[KUS], NC, NS)
print(f"Çiftlik öncelik payı: {PAY_C:.0f} (maliyet birimi)")
# kopuk parça karşı tarafa
for n, tohum in ((NS, S_C), (NC, C_C)):
    lab, _ = ndimage.label(ETK == n, structure=np.ones((3, 3)))
    iyi = set(np.unique(lab[ndimage.binary_dilation(tohum) & (ETK == n)])) - {0}
    ETK[(ETK == n) & ~np.isin(lab, list(iyi))] = 1 - n


def _chaikin(p, tur=3):
    p = np.asarray(p, float)
    for _ in range(tur):
        q = 0.75 * p[:-1] + 0.25 * p[1:]
        r = 0.25 * p[:-1] + 0.75 * p[1:]
        y = np.empty((2 * len(q), 2))
        y[0::2], y[1::2] = q, r
        p = np.vstack([p[:1], y, p[-1:]])
    return p


# sınır: kuşağın içinde etiketi farklı iki komşu hücrenin arası; kuşağın kendi kenarı aynen
seg = []
x0_, y0_ = GX[0, 0], GY[0, 0]
for j, i in zip(*np.nonzero(KUS[:, :-1] & KUS[:, 1:] & (ETK[:, :-1] != ETK[:, 1:]))):
    x = x0_ + (i + 0.5) * hk
    seg.append(((x, y0_ + (j - 0.5) * hk), (x, y0_ + (j + 0.5) * hk)))
for j, i in zip(*np.nonzero(KUS[:-1, :] & KUS[1:, :] & (ETK[:-1, :] != ETK[1:, :]))):
    y = y0_ + (j + 0.5) * hk
    seg.append(((x0_ + (i - 0.5) * hk, y), (x0_ + (i + 0.5) * hk, y)))
hatlar = [LineString(r.coords) for p_ in poligonlar(KUSAK) for r in [p_.exterior, *p_.interiors]]
if seg:
    z_ = linemerge(MultiLineString(seg))
    for z in getattr(z_, "geoms", [z_]):
        c = _chaikin(list(z.coords)) if len(z.coords) > 2 else np.asarray(z.coords)
        c = list(LineString(c).simplify(1.0).coords)
        for uc, ic in ((0, 1), (-1, -2)):
            if KUSAK.boundary.distance(Point(c[uc])) < 2.5 * hk:
                vx, vy = c[uc][0] - c[ic][0], c[uc][1] - c[ic][1]
                n_ = math.hypot(vx, vy) or 1.0
                ek = (c[uc][0] + 4 * hk * vx / n_, c[uc][1] + 4 * hk * vy / n_)
                c = [ek] + c if uc == 0 else c + [ek]
        hatlar.append(LineString(c))
yuzler = [f_ for f_ in polygonize(unary_union(hatlar)) if KUSAK.contains(f_.representative_point())]
kus_xy = np.column_stack([GX[KUS], GY[KUS]])
kus_et = ETK[KUS]
gecen = []
for f_ in yuzler:
    m = Path(np.asarray(f_.exterior.coords)).contains_points(kus_xy)
    if m.any():
        n = int(np.bincount(kus_et[m], minlength=2).argmax())
    else:
        q = f_.representative_point()
        n = int(kus_et[np.argmin(np.hypot(kus_xy[:, 0] - q.x, kus_xy[:, 1] - q.y))])
    if n == NC:
        gecen.append(f_)
GECEN = unary_union(gecen) if gecen else Polygon()
YENI = dict(ESKI)
YENI[STADYUM] = S.difference(GECEN).buffer(0)
YENI[CIFTLIK] = unary_union([C, GECEN]).buffer(0)
# Stadyum tek parça kalır; kopan küçük parçası Çiftlik'e
_sp = poligonlar(YENI[STADYUM])
if len(_sp) > 1:
    ana = max(_sp, key=lambda q: q.area)
    for q in _sp:
        if q is not ana:
            YENI[CIFTLIK] = unary_union([YENI[CIFTLIK], q]).buffer(0)
    YENI[STADYUM] = ana

# ------------------------------------------------------------------ sınır kayıtları
DEGISEN = {STADYUM, CIFTLIK}
yeni = []
for f in sabit["features"]:
    p = f["properties"]
    if p["katman"] == "mahalle":
        if p["id"] in DEGISEN:
            yeni.append({"type": "Feature", "properties": dict(p, alanKm2=round(YENI[p["id"]].area / 1e6, 1)),
                         "geometry": cokgen_ll(YENI[p["id"]])})
        else:
            yeni.append(f)
    elif p["katman"] == "sinir" and len(DEGISEN & set(p["mahalleler"])) and "not" in p:
        continue        # bu turun hesapladığı hatlar yeniden yazılır; 20 Kasım'ın onaylı hatları kalır
    else:
        yeni.append(f)
for a in sorted(YENI):
    for b in sorted(YENI):
        if a >= b or not ({a, b} & DEGISEN):
            continue
        eskiler = [f for f in sabit["features"] if f["properties"]["katman"] == "sinir"
                   and sorted(f["properties"]["mahalleler"]) == [a, b] and "not" not in f["properties"]]
        eski_g = unary_union([transform(mt, shape(f["geometry"])) for f in eskiler]) if eskiler else None
        onceki = next((f["properties"] for f in sabit["features"] if f["properties"]["katman"] == "sinir"
                       and sorted(f["properties"]["mahalleler"]) == [a, b] and "not" in f["properties"]), None)
        for h in ortak_hat(YENI[a], YENI[b]):
            ek = h if eski_g is None else h.difference(eski_g.buffer(2.0))
            if ek.geom_type == "MultiLineString":
                ek = linemerge(ek)
            for q in getattr(ek, "geoms", [ek]):
                if q.geom_type != "LineString" or q.length <= 30:
                    continue
                dr, sr = dogallik(q)
                not_ = NOT_KOL if {a, b} == DEGISEN else (onceki or {}).get("not", NOT_KOL)
                yeni.append({"type": "Feature", "properties": {
                    "katman": "sinir", "mahalleler": [a, b], "dereOrani": dr, "sirtOrani": sr, "not": not_},
                    "geometry": {"type": "LineString", "coordinates": [ll(*c) for c in q.coords]}})
sabit["features"] = yeni
with open(SABIT, "w", encoding="utf-8") as f:
    json.dump(sabit, f, ensure_ascii=False, separators=(",", ":"))
oz = [f for f in geo["features"] if f["properties"]["katman"] not in ("mahalle", "sinir")]
geo["features"] = [f for f in oz if f["properties"]["katman"] == "ada"] + yeni + \
    [f for f in oz if f["properties"]["katman"] != "ada"]
with open(SINIR, "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))

# yolların mahalle alanı (kimlik ve çizgi aynı)
yd = json.load(open(YOLLAR, encoding="utf-8"))
degisen_yol = []
for f in yd["features"]:
    p = f["properties"]
    if p["katman"] != "yol":
        continue
    orta = transform(mt, shape(f["geometry"])).interpolate(0.5, normalized=True)
    yeni_m = next((k for k, v in YENI.items() if v.contains(orta)), p.get("mahalle"))
    if yeni_m != p.get("mahalle"):
        degisen_yol.append((p["id"], p.get("mahalle"), yeni_m))
        p["mahalle"] = yeni_m
if degisen_yol:
    with open(YOLLAR, "w", encoding="utf-8") as f:
        json.dump(yd, f, ensure_ascii=False, separators=(",", ":"))

print(f"Çiftlik'e geçen: {GECEN.area / 1e4:.0f} ha")
for k in sorted(DEGISEN):
    print(f"  {k:12s} {ESKI[k].area / 1e4:8.0f} → {YENI[k].area / 1e4:8.0f} ha")
for h in [f for f in yeni if f["properties"]["katman"] == "sinir" and NOT_KOL in f["properties"].get("not", "")]:
    print(f"  yeni Stadyum–Çiftlik kesimi: dere %{100 * h['properties']['dereOrani']:.0f}, "
          f"sırt %{100 * h['properties']['sirtOrani']:.0f}")
print(f"Yolların mahalle alanı değişti: {len(degisen_yol)} yol")
for a in sorted(degisen_yol):
    print("   ", a)
