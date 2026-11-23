"""Tek harita eklemeleri: modeli olmayan üç yapıya Blender modeli (23 Kasım 2026, Kemal'in seçtiği adaylar).

Künyede olup haritada olmayan öğelerden üçü için KKM'de uygun model yoktu (yalnız künye
`docs/03-duzada-kunyesi.md`; ad, yazı, tabela, arma yok):

- Yangın gözetleme kulesi (`yapi_gozetleme_kulesi`, Ada Tepesi'nin zirvesinin yanı, 6 x 6 m): künye "tepede
  yangın gözetleme kulesi", belediyede çalışan orman memurları nöbet tutar. Model: beton ayak kaideleri,
  yukarı doğru daralan dört çelik ayak ve çapraz bağlar, zikzak çelik merdiven, üstte dört yanı camlı
  gözetleme kabini, dar balkon ve korkuluk, sac piramit dam, ince anten direği. Ölçüler DENEME.
- Antik duvar kalıntısı (`yapi_antik_surlar`, zirveyi saran ~200 x 200 m halka): künye "antik kalıntılar,
  Bizans ağırlıklı, yer yer Antik Yunan izleri". Model: halka boyunca alçak, yer yer kopuk, kalın taş duvar
  (yükseklik 0,2–1,8 m); yüksek kalan yerlerde Bizans usulü tuğla hatıl; köşelerde üç kule temeli; içeride
  birkaç yıkık yapı temeli; çevrede dökülmüş taşlar. Patikanın geçtiği yerde duvar açık. Ölçüler DENEME.
- Merkez mezarlığı (`yapi_merkez_mezarligi`, Merkez'in batısında, zeytinlikte, 90 x 60 m): künye "Mezarlık
  Merkez'in dışında, zeytinliklerde". Müslüman mezarlığı; Rum Mezarlığı'ndan farklı: sade baş ve ayak taşları
  (yazısız), taş ya da beyaz çerçeveli mezarlar ve eski toprak mezarlar, mezarlar kıbleye göre (baş kuzeydoğuda),
  serviler ve zeytinler, alçak kuru taş duvar, badanalı iki ayaklı kapısız giriş, girişte su musluğu. Ölçüler DENEME.

Modeller yapının yerindeki yamaca göre yapılır (`blender_uc_yapi.py` → `yer`: tek haritanın zemininden okunur):
duvar, mezar ve ayaklar yere uyar. Yapının yeri harita dosyasından okunur; bu yüzden önce ekleme taslağı
işlenir (`gen/kompakt_taslak_uygula.py gen/taslaklar/ekleme-23-11-2026.json`), sonra bu betik.

Kullanım:  python3 gen/blender_tek_eklemeler.py <çıktı klasörü> [kule|sur|mezar ...]
Kayda yazmaz; yalnız .glb dosyası yazar. Ham dosya; KKM'ye meshopt ile sıkıştırılıp girer.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_uc_yapi as B  # noqa: E402  (yardımcılar: kutu, ekle, yer, servi, zeytin_agaci, kuru_tas_duvar, disari)

B.RENK.update({
    "celik": "#7C7F7E", "celik_koyu": "#55595A", "beton": "#C8C2B6", "tugla": "#A65A3E", "tugla2": "#B86A4A",
    "kabin": "#E9E4D8", "toprak2": "#B59F78", "mermer2": "#D8D3C8", "yesil_toprak": "#7F8C55",
})
kutu, ekle, yer = B.kutu, B.ekle, B.yer

YAPILAR = os.path.join(B.KOK, "public", "harita", "duzada-yapilar.geojson")
YOLLAR = os.path.join(B.KOK, "public", "harita", "duzada-yollar.geojson")


def ozellik(kimlik):
    return next(f for f in json.load(open(YAPILAR, encoding="utf-8"))["features"] if f["properties"]["id"] == kimlik)


def yerel(kimlik):
    """Sahne noktası (boylam, enlem) → yapının Blender düzlemi (x, y); yer() ile aynı dönüşüm"""
    Bz, _ = B._zemin()
    p = ozellik(kimlik)["properties"]
    sah = lambda c: ((c[0] - Bz["lng0"]) * Bz["mPerLng"], -(c[1] - Bz["lat0"]) * Bz["mPerLat"])  # noqa: E731
    mx, mz = sah(p["merkez"])
    ex = p["ex"]

    def cevir(c):
        dx, dz = sah(c)[0] - mx, sah(c)[1] - mz
        # sahne = merkez + bx·ex + by·(ex1, −ex0)
        return (dx * ex[0] + dz * ex[1], dx * ex[1] - dz * ex[0])
    cevir.ex = ex
    return cevir


def obox(cx, cy, L, W, z0, z1, a, renk):
    """Döndürülmüş kutu: merkez (cx, cy), uzunluk L a yönünde, genişlik W"""
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    k = [(cx + s * ux * L / 2 + t * vx * W / 2, cy + s * uy * L / 2 + t * vy * W / 2) for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    v = [(x, y, z0) for x, y in k] + [(x, y, z1) for x, y in k]
    ekle(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], renk)


def cubuk(p0, p1, r, renk):
    """İki nokta arasında kare kesitli çubuk (çelik ayak, bağ)"""
    d = [p1[i] - p0[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d))
    u = [c / L for c in d]
    a = [0, 0, 1] if abs(u[2]) < 0.9 else [1, 0, 0]
    v = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]]
    n = math.sqrt(sum(c * c for c in v)); v = [c / n for c in v]
    w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    kose = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    verts = [tuple(p[i] + r * (s * v[i] + t * w[i]) for i in range(3)) for p in (p0, p1) for s, t in kose]
    ekle(verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], renk)


def levha(p0, p1, en, kal, renk):
    """İki nokta arasında yatık levha (merdiven kolu): genişlik yatay, kalınlık aşağı"""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L * en / 2, dx / L * en / 2
    v = [(p0[0] - nx, p0[1] - ny, p0[2] - kal), (p0[0] + nx, p0[1] + ny, p0[2] - kal), (p1[0] + nx, p1[1] + ny, p1[2] - kal), (p1[0] - nx, p1[1] - ny, p1[2] - kal),
         (p0[0] - nx, p0[1] - ny, p0[2]), (p0[0] + nx, p0[1] + ny, p0[2]), (p1[0] + nx, p1[1] + ny, p1[2]), (p1[0] - nx, p1[1] - ny, p1[2])]
    ekle(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], renk)


# ------------------------------------------------------------------ yangın gözetleme kulesi
def gozetleme_kulesi():
    B.temizle()
    h = yer("yapi_gozetleme_kulesi")
    E = h.en / 2   # 3
    alt, ust = 2.3, 1.45          # ayakların yarı açıklığı: dipte, kabin altında (DENEME)
    Hk = 11.0                     # kabin tabanı (DENEME)
    zt = max(h(x, y) for x in (-alt, alt) for y in (-alt, alt))
    # beton kaideler: her ayak yerin içinden çıkar
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * alt, sy * alt
            kutu(x - 0.45, y - 0.45, h(x, y) - 0.6, x + 0.45, y + 0.45, zt + 0.35, "beton")
    z0 = zt + 0.35
    # ayaklar ve çapraz bağlar
    ayak = lambda sx, sy, t: (sx * (alt + (ust - alt) * t), sy * (alt + (ust - alt) * t), z0 + (Hk - z0) * t)  # noqa: E731
    for sx in (-1, 1):
        for sy in (-1, 1):
            cubuk(ayak(sx, sy, 0), ayak(sx, sy, 1), 0.1, "celik")
    kat = [0.0, 0.3, 0.58, 0.8, 1.0]
    yuzler = [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]
    for (a, b) in yuzler:
        for i in range(len(kat) - 1):
            t0, t1 = kat[i], kat[i + 1]
            cubuk(ayak(*a, t0), ayak(*b, t1), 0.045, "celik_koyu")
            cubuk(ayak(*b, t0), ayak(*a, t1), 0.045, "celik_koyu")
            cubuk(ayak(*a, t1), ayak(*b, t1), 0.05, "celik")
    # zikzak çelik merdiven (önde, -Y yüzünde, ayakların dışında): kollar ve sahanlıklar
    kol = 4
    yd = -alt - 0.9
    for i in range(kol):
        za, zb = z0 + (Hk - z0) * i / kol, z0 + (Hk - z0) * (i + 1) / kol
        xa, xb = (-1.6, 1.6) if i % 2 == 0 else (1.6, -1.6)
        t_a, t_b = za, zb
        yk = yd + (0.55 * (i / kol)) + (alt - ust) * ((i + 0.5) / kol) * 0.0
        levha((xa, yk, t_a), (xb, yk, t_b), 0.85, 0.08, "celik")
        for xx, zz in ((xa, t_a), (xb, t_b)):
            kutu(xx - 0.55, yk - 0.5, zz - 0.08, xx + 0.55, yk + 0.5, zz, "celik")   # sahanlık
        # korkuluk: dış kenarda çubuk
        cubuk((xa, yk - 0.45, t_a + 0.9), (xb, yk - 0.45, t_b + 0.9), 0.025, "celik_koyu")
        for xx, zz in ((xa, t_a), (xb, t_b)):
            cubuk((xx, yk - 0.45, zz), (xx, yk - 0.45, zz + 0.95), 0.025, "celik_koyu")
            # sahanlıktan kuleye bağ
            cubuk((xx, yk + 0.5, zz - 0.05), (max(-ust, min(ust, xx)), -alt + (alt - ust) * (zz - z0) / (Hk - z0), zz - 0.05), 0.035, "celik_koyu")
    # merdivenin dibi: iki basamak yerden çıkar
    xa = -1.6
    zg = h(xa, yd)
    kutu(xa - 0.55, yd - 0.5, zg - 0.3, xa + 0.55, yd + 0.5, z0, "beton")
    # kabin: balkon tabanı, alt duvar, cam bant, üst kuşak, piramit dam
    b = 2.15   # balkon yarı genişliği
    kutu(-b, -b, Hk - 0.18, b, b, Hk, "beton")
    for sx in (-1, 1):
        cubuk((sx * b, -b, Hk + 1.0), (sx * b, b, Hk + 1.0), 0.03, "celik_koyu")
        cubuk((-b, sx * b, Hk + 1.0), (b, sx * b, Hk + 1.0), 0.03, "celik_koyu")
        for t in range(-2, 3):
            cubuk((sx * b, t * b / 2.2, Hk), (sx * b, t * b / 2.2, Hk + 1.0), 0.022, "celik_koyu")
            cubuk((t * b / 2.2, sx * b, Hk), (t * b / 2.2, sx * b, Hk + 1.0), 0.022, "celik_koyu")
    k = 1.55   # kabin yarı genişliği
    kutu(-k, -k, Hk, k, k, Hk + 0.95, "kabin")
    kutu(-k + 0.03, -k + 0.03, Hk + 0.95, k - 0.03, k - 0.03, Hk + 2.05, "cam")
    for sx in (-1, 1):
        for sy in (-1, 1):
            kutu(sx * k - 0.07, sy * k - 0.07, Hk + 0.95, sx * k + 0.07, sy * k + 0.07, Hk + 2.05, "kabin")
        for t in (-0.5, 0.5):
            kutu(t * k - 0.04, sx * k - 0.05, Hk + 0.95, t * k + 0.04, sx * k + 0.05, Hk + 2.05, "kabin")
            kutu(sx * k - 0.05, t * k - 0.04, Hk + 0.95, sx * k + 0.05, t * k + 0.04, Hk + 2.05, "kabin")
    kutu(-k, -k, Hk + 2.05, k, k, Hk + 2.35, "kabin")
    # kapı (önde, balkona)
    kutu(0.35, -k - 0.04, Hk, 1.05, -k + 0.02, Hk + 2.0, "ahsap_koyu")
    # piramit dam
    s = k + 0.35
    zd, zu = Hk + 2.35, Hk + 3.35
    ekle([(-s, -s, zd), (s, -s, zd), (s, s, zd), (-s, s, zd), (0, 0, zu)],
         [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], "sac")
    # anten direği
    cubuk((0.0, 0.0, zu - 0.1), (0.0, 0.0, zu + 2.2), 0.03, "celik_koyu")
    cubuk((-0.35, 0.0, zu + 1.6), (0.35, 0.0, zu + 1.6), 0.015, "celik_koyu")
    B.disari("yangin-gozetleme-kulesi")


# ------------------------------------------------------------------ antik duvar kalıntısı
def antik_surlar():
    r = random.Random(1054)
    B.temizle()
    kim = "yapi_antik_surlar"
    h = yer(kim)
    E, Bo = h.en / 2, h.boy / 2
    cev = yerel(kim)
    hal = [cev(c) for c in ozellik(kim)["properties"]["hat"]]   # halkanın çizgisi (taslakta `hat`)
    # kule (halkanın içinde): temeller ondan uzak
    kule = cev(ozellik("yapi_gozetleme_kulesi")["properties"]["merkez"])
    # patika: halkayı kestiği yerde duvar açık
    yol = next(f for f in json.load(open(YOLLAR, encoding="utf-8"))["features"] if f["properties"].get("id") == "yol_ada_tepesi_patika")
    pat = [cev(c) for c in yol["geometry"]["coordinates"]]

    def patikaya(x, y):
        en = 1e9
        for (ax, ay), (bx, by) in zip(pat, pat[1:]):
            L2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1e-9
            t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2))
            en = min(en, math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)))
        return en
    # halka boyunca 2,2 m'lik parçalar, düşük frekanslı dalga (köşe noktaları yerinde)
    nok = []
    for (ax, ay), (bx, by) in zip(hal, hal[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, round(L / 2.2))
        for k in range(n):
            t = k / n
            nok.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    nok.append(nok[0])
    # hafif kıvrım: duvar dümdüz gitmesin (yamaçta yer yer içeri, dışarı; ±2 m)
    dal = r.uniform(0, 6.28)
    kiv = []
    s_ = 0.0
    for i, (x, y) in enumerate(nok[:-1]):
        (px, py), (nx_, ny_) = nok[i - 1], nok[i + 1]
        tx, ty = nx_ - px, ny_ - py
        tl = math.hypot(tx, ty) or 1.0
        o = 2.0 * math.sin(s_ / 23.0 + dal) * math.sin(s_ / 61.0 + 1.1)
        kiv.append((x - ty / tl * o, y + tx / tl * o))
        s_ += math.hypot(nx_ - x, ny_ - y)
    nok = kiv + [kiv[0]]
    faz = [r.uniform(0, 6.28) for _ in range(3)]
    s_top = 0.0
    kal = 2.0
    for i in range(len(nok) - 1):
        (ax, ay), (bx, by) = nok[i], nok[i + 1]
        L = math.hypot(bx - ax, by - ay)
        s_top += L
        cx, cy = (ax + bx) / 2, (ay + by) / 2
        # kenarda kutu dışına taşmasın (model kutusu = taban)
        cx = max(-E + kal / 2, min(E - kal / 2, cx)); cy = max(-Bo + kal / 2, min(Bo - kal / 2, cy))
        a = math.atan2(by - ay, bx - ax)
        if patikaya(cx, cy) < 4.0:
            continue
        # yükseklik: yavaş değişen dalga; kopuk yerlerde yalnız moloz
        d = (math.sin(s_top / 37 + faz[0]) + 0.6 * math.sin(s_top / 13 + faz[1]) + 0.35 * math.sin(s_top / 5.3 + faz[2])) / 1.95
        yuk = 0.3 + 1.9 * max(0.0, (d + 0.35) / 1.35) ** 1.3
        lo = min(h(ax, ay), h(bx, by), h(cx, cy))
        hi = max(h(ax, ay), h(bx, by), h(cx, cy))
        zt = (lo + hi) / 2
        if d < -0.55:
            # yıkılmış kesim: alçak moloz
            for _ in range(3):
                x, y = cx + r.uniform(-1.0, 1.0), cy + r.uniform(-1.0, 1.0)
                w = r.uniform(0.25, 0.5)
                zz = h(x, y)
                obox(x, y, w * 2, w * 1.6, zz - 0.15, zz + r.uniform(0.15, 0.35), r.uniform(0, 3.14), r.choice(B.TASLAR))
            continue
        obox(cx, cy, L + 0.12, kal, lo - 0.5, zt + yuk, a, "tas_koyu")
        # üst sıra: tek tek taşlar, düzensiz
        s = -L / 2
        while s < L / 2 - 0.1:
            w = r.uniform(0.5, 0.9)
            e = min(s + w, L / 2)
            m = (s + e) / 2
            obox(cx + math.cos(a) * m, cy + math.sin(a) * m, e - s, kal + 0.06, zt + yuk - 0.05, zt + yuk + r.uniform(0.08, 0.22), a, r.choice(B.TASLAR))
            s = e + 0.04
        # Bizans usulü tuğla hatıl (yüksek kalan yerlerde)
        if yuk > 1.15:
            obox(cx, cy, L + 0.14, kal + 0.08, zt + 0.72, zt + 0.86, a, r.choice(["tugla", "tugla2"]))
        # dökülmüş taşlar (iki yana)
        if r.random() < 0.55:
            yan = r.choice((-1, 1))
            x = cx - math.sin(a) * yan * r.uniform(1.3, 3.2)
            y = cy + math.cos(a) * yan * r.uniform(1.3, 3.2)
            if -E < x < E and -Bo < y < Bo:
                zz = h(x, y)
                w = r.uniform(0.25, 0.45)
                obox(x, y, w * 2, w * 1.5, zz - 0.15, zz + r.uniform(0.15, 0.4), r.uniform(0, 3.14), r.choice(B.TASLAR))
    # köşelerde kule temelleri (üç köşe)
    for idx in (1, 3, 5):
        x, y = hal[idx]
        x = max(-E + 3.0, min(E - 3.0, x)); y = max(-Bo + 3.0, min(Bo - 3.0, y))
        if patikaya(x, y) < 6:
            continue
        K = 3.6
        lo = min(h(x + sx * K, y + sy * K) for sx in (-1, 1) for sy in (-1, 1))
        yk = r.uniform(1.6, 2.6)
        kutu(x - K, y - K, lo - 0.5, x + K, y + K, lo + yk, "tas_koyu")
        kutu(x - K - 0.06, y - K - 0.06, lo + yk * 0.55, x + K + 0.06, y + K + 0.06, lo + yk * 0.55 + 0.16, "tugla")
        for _ in range(14):
            xx, yy = x + r.uniform(-K + 0.3, K - 0.3), y + r.uniform(-K + 0.3, K - 0.3)
            kutu(xx - 0.3, yy - 0.25, lo + yk - 0.05, xx + 0.3, yy + 0.25, lo + yk + r.uniform(0.1, 0.3), r.choice(B.TASLAR))
    # içeride yıkık yapı temelleri (alçak taş çerçeveler)
    konan = 0
    for _ in range(120):
        if konan >= 14:
            break
        x, y = r.uniform(-E * 0.6, E * 0.6), r.uniform(-Bo * 0.6, Bo * 0.6)
        if math.hypot(x - kule[0], y - kule[1]) < 14 or patikaya(x, y) < 5:
            continue
        w, d = r.uniform(5, 9), r.uniform(4, 7)
        a = r.uniform(-0.3, 0.3) + r.choice((0, 1.5708))
        for (ox, oy, L, W, aa) in ((0, -d / 2, w, 0.7, a), (0, d / 2, w, 0.7, a), (-w / 2, 0, d, 0.7, a + 1.5708), (w / 2, 0, d, 0.7, a + 1.5708)):
            if r.random() < 0.2:
                continue
            px = x + ox * math.cos(a) - oy * math.sin(a)
            py = y + ox * math.sin(a) + oy * math.cos(a)
            zz = h(px, py)
            obox(px, py, L, W + 0.3, zz - 0.3, zz + r.uniform(0.25, 0.7), aa, r.choice(["tas_koyu", "tas_koyu", "tas3"]))
        konan += 1
    # model kutusu = taban: dört köşede yere gömülü küçük taş (kutu ortası yapının merkezi olsun)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (E - 0.15), sy * (Bo - 0.15)
            zz = h(x, y)
            kutu(x - 0.15, y - 0.15, zz - 0.3, x + 0.15, y + 0.15, zz - 0.05, "tas_koyu")
    B.disari("antik-sur-kalintisi")


# ------------------------------------------------------------------ Merkez mezarlığı
def merkez_mezarligi():
    r = random.Random(1923 + 102)
    B.temizle()
    kim = "yapi_merkez_mezarligi"
    h = yer(kim)
    E, Bo = h.en / 2, h.boy / 2   # 45 x 30
    ex = ozellik(kim)["properties"]["ex"]
    # kıble: baş kuzeydoğuda (pusula 60°); sahne yönü → Blender düzlemi
    d = (math.sin(math.radians(60)), -math.cos(math.radians(60)))
    bx, by = d[0] * ex[0] + d[1] * ex[1], d[0] * ex[1] - d[1] * ex[0]
    a_bas = math.atan2(by, bx)
    ua, va = (math.cos(a_bas), math.sin(a_bas)), (-math.sin(a_bas), math.cos(a_bas))
    B.yer_ortusu(h, -E, -Bo, E, Bo, 3.0, "kuru_ot", ust=0.08)
    # alçak kuru taş duvar; giriş önde ortada (kapısız, badanalı iki ayak)
    dd = 0.3
    kose = [(-E + dd, -Bo + dd), (E - dd, -Bo + dd), (E - dd, Bo - dd), (-E + dd, Bo - dd), (-E + dd, -Bo + dd)]
    gx = (-2.0, 2.0)
    B.kuru_tas_duvar(h, kose, r, yuk=0.85, kal=0.5, bos=[(gx[0], -Bo, gx[1], -Bo + 0.9)])
    for x in gx:
        zk = h(x, -Bo + dd)
        kutu(x - 0.35, -Bo + dd - 0.35, zk - 0.4, x + 0.35, -Bo + dd + 0.35, zk + 1.6, "badana")
        kutu(x - 0.42, -Bo + dd - 0.42, zk + 1.6, x + 0.42, -Bo + dd + 0.42, zk + 1.75, "tas_koyu")
    # yollar: girişten içeri ve enine (toprak)
    B.yer_ortusu(lambda x, y: h(x, y) + 0.02, gx[0] + 0.3, -Bo + dd, gx[1] - 0.3, Bo - 3.0, 2.0, "toprak", ust=0.1)
    B.yer_ortusu(lambda x, y: h(x, y) + 0.02, -E + 3.0, -1.2, E - 3.0, 1.2, 2.0, "toprak", ust=0.1)
    # girişin yanında su musluğu (taş gövde, yazısız)
    mx_, my_ = gx[1] + 2.2, -Bo + 2.2
    zm = h(mx_, my_)
    kutu(mx_ - 0.5, my_ - 0.3, zm - 0.3, mx_ + 0.5, my_ + 0.3, zm + 1.1, "tas2")
    kutu(mx_ - 0.6, my_ - 0.38, zm + 1.1, mx_ + 0.6, my_ + 0.38, zm + 1.2, "tas_koyu")
    kutu(mx_ - 0.45, my_ - 0.75, zm - 0.1, mx_ + 0.45, my_ - 0.3, zm + 0.25, "tas_koyu")
    kutu(mx_ - 0.03, my_ - 0.42, zm + 0.7, mx_ + 0.03, my_ - 0.3, zm + 0.78, "demir")

    def yolda(x, y):
        return (gx[0] - 0.8 < x < gx[1] + 0.8) or (-2.0 < y < 2.0)

    # ağaçlar: serviler yollar boyunca ve duvar diplerinde, zeytinler öbek öbek (mezarlar aralarında)
    agac = []
    for y in range(-int(Bo) + 6, int(Bo) - 3, 7):
        for x in (gx[0] - 1.6, gx[1] + 1.6):
            agac.append(("servi", x + r.uniform(-0.2, 0.2), y + r.uniform(-0.5, 0.5)))
    for x in range(-int(E) + 5, int(E) - 3, 9):
        if gx[0] - 3 < x < gx[1] + 3:
            continue
        agac.append(("servi", x + r.uniform(-0.5, 0.5), 2.8 + r.uniform(-0.2, 0.2)))
    for _ in range(9):
        x, y = r.uniform(-E + 3, E - 3), Bo - r.uniform(1.6, 2.4)
        agac.append(("servi", x, y))
    zeytin = [(-E + 9, Bo - 9), (-E + 22, -Bo + 9), (E - 10, -Bo + 11), (E - 15, Bo - 8), (-E + 7, -Bo + 6), (E - 5, 8.0),
              (-14.0, 13.0), (15.0, -14.0), (27.0, 17.0), (-30.0, -16.0), (8.0, 20.0), (-22.0, 8.0), (34.0, -4.0)]
    for x, y in zeytin:
        agac.append(("zeytin", x + r.uniform(-1, 1), y + r.uniform(-1, 1)))
    for tur, x, y in agac:
        if tur == "servi":
            B.servi(x, y, h(x, y), r.uniform(7.0, 10.0))
        else:
            B.zeytin_agaci(x, y, h(x, y), r, r.uniform(1.1, 1.5))

    def agaca_yakin(x, y):
        return any(math.hypot(x - ax, y - ay) < (1.4 if t == "servi" else 3.2) for t, ax, ay in agac)

    # mezarlar: kıbleye göre sıralar; önde (girişe yakın) yeni, çerçeveli; arkada eski toprak mezar
    adim_u, adim_v = 2.9, 1.55
    R_ = int(max(E, Bo) * 1.6 / adim_v)
    for i in range(-R_, R_ + 1):
        for j in range(-R_, R_ + 1):
            x = i * adim_u * ua[0] + j * adim_v * va[0]
            y = i * adim_u * ua[1] + j * adim_v * va[1]
            x += r.uniform(-0.12, 0.12); y += r.uniform(-0.12, 0.12)
            if not (-E + 2.0 < x < E - 2.0 and -Bo + 2.4 < y < Bo - 1.8):
                continue
            if yolda(x, y) or agaca_yakin(x, y):
                continue
            # boş kalan yerler (öbek öbek dolu)
            yog = 0.55 + 0.35 * math.sin(x / 9.0 + 1.3) * math.cos(y / 7.0)
            if r.random() > yog:
                continue
            yeni = y < -Bo * 0.25 + r.uniform(-6, 6)
            lo = min(h(x + ua[0] * s, y + ua[1] * s) for s in (-1.0, 1.0))
            hi = max(h(x + ua[0] * s, y + ua[1] * s) for s in (-1.0, 1.0))
            zb = h(x + ua[0] * 0.95, y + ua[1] * 0.95)     # baş
            za = h(x - ua[0] * 0.95, y - ua[1] * 0.95)     # ayak
            if yeni and r.random() < 0.8:
                cer = r.choice(["mermer", "mermer2", "badana", "tas4"])
                ic = r.choice(["toprak2", "yesil_toprak", "yesil_toprak", "toprak"])
                obox(x, y, 2.0, 0.95, lo - 0.25, hi + 0.22, a_bas, cer)          # çerçeve
                obox(x, y, 1.78, 0.73, hi + 0.18, hi + 0.25, a_bas, ic)          # içi (toprak ya da ot)
                ht = r.uniform(0.85, 1.25)
                tas = r.choice(["mermer", "mermer2", "tas4"])
                hx, hy = x + ua[0] * 0.92, y + ua[1] * 0.92
                obox(hx, hy, 0.1, 0.48, hi + 0.2, hi + 0.2 + ht, a_bas, tas)     # baş taşı (yazısız)
                obox(hx, hy, 0.1, 0.32, hi + 0.2 + ht, hi + 0.32 + ht, a_bas, tas)  # sivri baş
                fx, fy = x - ua[0] * 0.92, y - ua[1] * 0.92
                obox(fx, fy, 0.09, 0.4, hi + 0.2, hi + 0.2 + ht * 0.55, a_bas, tas)  # ayak taşı
            else:
                # eski toprak mezar: alçak tümsek, iki kaba taş
                obox(x, y, 1.9, 0.85, lo - 0.2, (lo + hi) / 2 + r.uniform(0.12, 0.25), a_bas, r.choice(["toprak", "toprak2", "kuru_ot"]))
                tas = r.choice(B.TASLAR)
                ht = r.uniform(0.45, 0.85)
                hx, hy = x + ua[0] * 0.95, y + ua[1] * 0.95
                obox(hx, hy, 0.16, 0.42, zb - 0.2, zb + ht, a_bas + r.uniform(-0.15, 0.15), tas)
                fx, fy = x - ua[0] * 0.95, y - ua[1] * 0.95
                obox(fx, fy, 0.15, 0.34, za - 0.2, za + ht * 0.6, a_bas + r.uniform(-0.15, 0.15), r.choice(B.TASLAR))
    B.disari("merkez-mezarligi")


if __name__ == "__main__":
    gozetleme_kulesi()
    antik_surlar()
    merkez_mezarligi()
    print("tamam")
