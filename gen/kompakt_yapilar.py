"""Kompakt Düzada yapıları — tek harita, 4. adım (21 Kasım 2026, Kemal'in 20 Kasım kararları).

Girdi : public/harita/duzada-zemin.bin, duzada-sinirlar.geojson, duzada-yollar.geojson, duzada-parseller.geojson,
        gen/kompakt-yapilar-eski.json (eski haritadaki viki bağlı yapılar; tek seferlik çıkarıldı),
        src/data/binaKatalogu.json ve public/modeller/ (KKM'nin kendi modelleri ve ölçüleri)
Çıktı : public/harita/duzada-yapilar.geojson   yapıların tabanı (koordinatlar [boylam, enlem])

Kurallar:
  - Viki bağlı yapılar (vikide maddesi, madde bağı ya da evde oturanı olan) eski haritadaki yerlerinin kompakt
    adadaki karşılığına taşınır: eski yer adanın küçültmesiyle (0,70, aynı odak) ve yerleşimin kayması kadar
    taşınır, yapı oraya en yakın uygun yere oturur (önü bir yola bakar, yola, öbür yapılara, korunan alana
    taşmaz, kendi mahallesinde kalır). Merkez Meydanı'na bakanlar yine meydana bakar; kıyıdakiler kıyıda
    kalır. The Imperial, Dirlik Stadı ve Taraftar Birahanesi 1.–2. adımda ayrılan yerlerine oturur.
    Kimlikleri eskisiyle aynı: Kurucu'daki madde bağı, evde oturanlar ve 3B haritanın eşlemesi kopmaz.
  - Öbür yapılar parsellere yeniden dizilir: her parsele türüne uygun bir ev (bitişikte sıra ev, avlulu
    parselde avlulu ev, büyükte büyük yapı / dükkân); önü yola bakar, parselin içinde avlu payı kalır.
    Bir kısmı boş kalır (seyrek köy). Hangi parselin boş kalacağı ve hangi modelin konacağı yapının
    kimliğinden gelir (KKM'deki sabitSec / sans ile aynı hesap): yeniden üretimde aynı sonuç.
  - Yalnız KKM'nin kendi modelleri (binaKatalogu.json'daki Kurucu türleri ve özel yapılar). Modeli
    olmayan viki yapısı bugünkü gibi kutu kalır (dosya: null).
  - Ad yok: yalnız vikide adı olan yapı adını taşır; adsız yapıya ad konmaz.
  - Dondurmacı Kızlar iskelenin önünde (Kemal, 22 Kasım: "Dondurmacı Kızlar bir iskelenin önünde olmalı"; Liman
    değişmeden kalır): eski haritadaki Liman İskelesi'nin kıyıdaki kökü öbür liman yapıları gibi taşınır; iskele
    orada kıyıya dik denize uzanır, dükkân onun dibinde, önü denize (ölçüler Dondurmacı Kızlar oyununun belgesi 0.10).
    Mendirek oyundaki biçimiyle koyun ağzına konur; karaya ya da iskeleye değerse konmaz. İkisi bu dosyada
    katman "iskele" / "mendirek" öğeleri olarak yazılır (yapı değil, suyun üstünde).
  - Kayda yazmaz; yalnız dosya üretir. 6. adımda 3B harita bunu okur.

Bütün ölçüler ve oranlar Kemal onaylamadı: hepsi DENEME.

Çalıştırma: python gen/kompakt_yapilar.py      (parseller üretilmiş olmalı)
Denetim   : python gen/kompakt_yapilar_denetim.py
"""
import json, math, os, struct, sys, warnings

import numpy as np
from shapely.geometry import LineString, Point, Polygon, shape, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely import prepared

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
from kompakt_zemin_denetim import oku  # noqa: E402
import kompakt_liman as LM  # noqa: E402
import kompakt_iskele as IS  # noqa: E402
from kompakt_taslak_uygula import elle_cikar  # noqa: E402  (KKM Düzenle'nin elle öğeleri bu üretecin girdisi değil)

warnings.filterwarnings("ignore", category=DeprecationWarning)   # shapely.ops.transform (öbür üreteçlerle aynı)

HARITA = os.path.join(KOK, "public", "harita")
IZGARA = os.path.join(HARITA, "duzada-zemin.bin")
SINIR = os.path.join(HARITA, "duzada-sinirlar.geojson")
YOLLAR = os.path.join(HARITA, "duzada-yollar.geojson")
PARSEL = os.path.join(HARITA, "duzada-parseller.geojson")
ESKI = os.path.join(BURASI, "kompakt-yapilar-eski.json")
KARELER = os.path.join(HARITA, "duzada-kareler.json")
KATALOG = os.path.join(KOK, "src", "data", "binaKatalogu.json")
MODELLER = os.path.join(KOK, "public", "modeller")
CIKTI = os.path.join(HARITA, "duzada-yapilar.geojson")

# ------------------------------------------------------------------ ölçüler (hepsi DENEME)
BOS_ORANI = {   # DENEME: arsanın boş kalma oranı (seyrek köy hissi; 21 Kasım: arsa sayısı düştü, oranlar da düştü;
                #  boş kareler ileride park / bahçe ile dolacak, Stadyum'un seyrekliği sorun değil)
    "bitisik": 0.03,
    "buyuk": 0.20,
    "avlulu": {"yerlesim_merkez": 0.15, "yerlesim_liman": 0.22, "yerlesim_iskele": 0.0,
               "yerlesim_stadyum": 0.35, "yerlesim_stadyum_kiyi": 0.20, "yerlesim_ciftlik": 0.35},
}   # İskele 0 (Kemal, 24 Kasım: "daha az ev olabilir ama dolu olsun"; sokaklar seyreldi, arsalar boş kalmaz)
DAR_CEPHE = 8.5          # 1 kare cepheli (dar) avlulu arsa: dar ev konur
DAR_YAN_PAY = 0.5        # DENEME: dar evin iki yanında kalan pay (m)
SIRA_EV_GOVDE = 1.22     # DENEME (Kemal, 21 Kasım: sıra ev gövdeleri değsin): bitişik arsadaki evin modeli tabanından bu
                         # kadar geniş çizilir (modelin kendi yan bahçe payı taşar, gövdeler değer); taban aynı kalır
SIRA_EV_EN_DAR = 6.0     # DENEME: bitişik parsel bundan darsa yanındakiyle tek sıra ev olur (m)
ON_PAY = {"bitisik": 0.0, "avlulu": 1.5, "buyuk": 2.0}     # DENEME: parsel önünden geri çekilme (m)
YAN_PAY = {"avlulu": 1.0}                                   # DENEME: avlulu evin yan sınırdan payı (m)
ARKA_PAY = {"bitisik": 2.0, "avlulu": 4.0, "buyuk": 4.0}    # DENEME: evin arkasında kalan en az avlu (m)
LIMAN_SIG_ARKA = 2.0     # DENEME: Liman'ın ve İskele'nin (24 Kasım) sığ (16 m) arsasında evin arkasında kalan en az avlu (m)
EV_ALAN_ORANI = {"avlulu": 0.50, "buyuk": 0.55}            # DENEME: ev tabanı parselin en çok bu kadarı (gerisi avlu)
KIYI_ORANI = 0.15        # DENEME: kıyıya yakın avlulu parselde yazlık oranı
KIYI_YAKIN_M = 200.0     # DENEME: "kıyıya yakın" sınırı (m)
CIFTLIK_ORANI = 0.6      # DENEME: Çiftlik'te avlulu parselde çiftlik evi oranı
DEPO_ORANI = 0.15        # DENEME: büyük parselde depo / atölye oranı (Liman, Çiftlik)
UZUN_EV_ORANI = 0.15     # DENEME: büyük parselde uzun ev oranı
MEYDAN_DUKKAN_ORANI = 0.6  # DENEME: meydana / meydancığa bakan bitişik parselde dükkânlı ev oranı
# Viki bağlı yapıların yer araması
ARAMA_M = 320.0          # DENEME: hedef yerin çevresinde aranan yarıçap (m)
ADIM_M = 2.0             # DENEME: yol boyunca örnek aralığı (m)
KALDIRIM = 1.0           # parsellerle aynı (3. adım)
YAPI_ARASI = 1.5         # DENEME: viki yapısının öbür yapılara en az uzaklığı (m)
EGIM_VIKI = 0.20         # DENEME: viki yapısının tabanındaki en çok eğim (yükseklik farkı / köşegen)
KIYI_EN_AZ = {"liman": 3.0, "diger": 10.0}   # DENEME: tabanın kıyı çizgisine en az uzaklığı (m)
MEYDAN_BAKAR_M = 30.0    # eski haritada Merkez Meydanı'na bu kadar yakın olan meydana bakar
KIYI_BAGLI_M = 60.0      # eski haritada kıyıya bu kadar yakın olan kıyıda kalır

# ------------------------------------------------------------------ yardımcılar
B, HAM = oku(IZGARA)
Z = HAM.astype(float) * B["birim"]
H = B["hucre"]


def m(p):
    return ((p[0] - B["lng0"]) * B["mPerLng"], (p[1] - B["lat0"]) * B["mPerLat"])


def ll(x, y):
    return [round(B["lng0"] + x / B["mPerLng"], 7), round(B["lat0"] + y / B["mPerLat"], 7)]


def gm(g):
    return transform(lambda x, y, z=None: ((np.asarray(x) - B["lng0"]) * B["mPerLng"],
                                           (np.asarray(y) - B["lat0"]) * B["mPerLat"]), shape(g))


def kucult(x, y):
    ox, oy = B["odak"]
    return (ox + B["olcek"] * (x - ox), oy + B["olcek"] * (y - oy))


def kot(x, y):
    """Zeminden çift doğrusal yükseklik (m)."""
    fx = (np.asarray(x, float) - B["x0"]) / H
    fy = (np.asarray(y, float) - B["y0"]) / H
    i = np.clip(np.floor(fy).astype(int), 0, B["boy"] - 2)
    j = np.clip(np.floor(fx).astype(int), 0, B["en"] - 2)
    ty, tx = np.clip(fy - i, 0, 1), np.clip(fx - j, 0, 1)
    return (Z[i, j] * (1 - tx) * (1 - ty) + Z[i, j + 1] * tx * (1 - ty)
            + Z[i + 1, j] * (1 - tx) * ty + Z[i + 1, j + 1] * tx * ty)


def sans(kimlik):
    """KKM'deki `sans` (lib/binaKutuphanesi.ts) ile birebir: kimlikten tekrar üretilebilir 0–1 sayı."""
    h = 2166136261
    b = kimlik.encode("utf-16-le")
    for k in range(0, len(b), 2):
        h ^= b[k] | (b[k + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    h ^= h >> 16; h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13; h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h / 4294967296


def sabit_sec(kimlik, liste):
    return liste[int(sans(kimlik) * len(liste)) % len(liste)]


def model_olcusu(dosya):
    """glb'nin tabanı (metre; ön +Z). Sıkıştırılmış konumlar (KHR_mesh_quantization) açılır."""
    ham = open(os.path.join(MODELLER, dosya), "rb").read()
    n = struct.unpack("<I", ham[12:16])[0]
    js = json.loads(ham[20:20 + n])
    acc, dugum, ag = js["accessors"], js.get("nodes", []), js.get("meshes", [])

    def matris(d):
        if "matrix" in d:
            return np.array(d["matrix"]).reshape(4, 4).T
        x, y, z, w = d.get("rotation", [0, 0, 0, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R @ np.diag(d.get("scale", [1, 1, 1])); M[:3, 3] = d.get("translation", [0, 0, 0])
        return M
    alt, ust = np.full(3, np.inf), np.full(3, -np.inf)

    def yuru(i, P):
        nonlocal alt, ust
        d = dugum[i]; M = P @ matris(d)
        if "mesh" in d:
            for pr in ag[d["mesh"]]["primitives"]:
                a = acc[pr["attributes"]["POSITION"]]
                mn, mx = np.array(a["min"], float), np.array(a["max"], float)
                if a.get("normalized"):
                    bol = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[a["componentType"]]
                    mn, mx = mn / bol, mx / bol
                for k in range(8):
                    v = M @ np.array([mn[0] if k & 1 else mx[0], mn[1] if k & 2 else mx[1], mn[2] if k & 4 else mx[2], 1])
                    alt, ust = np.minimum(alt, v[:3]), np.maximum(ust, v[:3])
        for c in d.get("children", []):
            yuru(c, M)
    for r in js["scenes"][js.get("scene", 0)]["nodes"]:
        yuru(r, np.eye(4))
    return round(float(ust[0] - alt[0]), 1), round(float(ust[2] - alt[2]), 1), round(float(ust[1] - alt[1]), 1)


def dikdortgen(c, u, en, boy):
    """Merkez c, en ekseni u (birim), boyu ona dik. Köşeler saat yönünün tersine."""
    v = (-u[1], u[0])
    a, b = en / 2, boy / 2
    return Polygon([(c[0] - u[0] * a - v[0] * b, c[1] - u[1] * a - v[1] * b),
                    (c[0] + u[0] * a - v[0] * b, c[1] + u[1] * a - v[1] * b),
                    (c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b),
                    (c[0] - u[0] * a + v[0] * b, c[1] - u[1] * a + v[1] * b)])


def pusula(v):
    """Metre düzlemindeki yön (x doğu, y kuzey) → pusula açısı (kuzey 0, saat yönünde)."""
    return round(math.degrees(math.atan2(v[0], v[1])) % 360, 1)


# ------------------------------------------------------------------ veri
SF = json.load(open(SINIR, encoding="utf-8"))["features"]
YF = elle_cikar(json.load(open(YOLLAR, encoding="utf-8")), "yollar")["features"]   # Düzenle'nin elle yolları girdi değil
PF = json.load(open(PARSEL, encoding="utf-8"))["features"]
ESKI_J = json.load(open(ESKI, encoding="utf-8"))
KAT = json.load(open(KATALOG, encoding="utf-8"))

ADA = gm(next(f["geometry"] for f in SF if f["properties"]["katman"] == "ada"))
KIYI = ADA.exterior
MAHALLE = {f["properties"]["id"]: gm(f["geometry"]) for f in SF if f["properties"]["katman"] == "mahalle"}
YERLESIM = {f["properties"]["id"]: f["properties"] | {"m": m(f["geometry"]["coordinates"])}
            for f in SF if f["properties"]["katman"] == "yerlesim"}
IMPERIAL = {f["properties"]["tur"]: gm(f["geometry"]) for f in SF
            if f["properties"]["katman"] == "imperial" and f["geometry"]["type"] == "Polygon"}
ZIRVE = {f["properties"]["ad"]: m(f["geometry"]["coordinates"]) for f in SF if f["properties"]["katman"] == "zirve"}

YOL = [(f["properties"], gm(f["geometry"])) for f in YF if f["properties"]["katman"] == "yol"]
YOL_ALAN = [g.buffer(p["genislik"] / 2, cap_style=2) for p, g in YOL]
YOL_AGACI = STRtree(YOL_ALAN)
KORUNAN = [(f["properties"], gm(f["geometry"])) for f in YF if f["properties"]["katman"] in ("korunan", "meydancik")]
MEYDAN = next(g for p, g in KORUNAN if p.get("tur") == "meydan")
MEYDANCIK = [g for p, g in KORUNAN if p["katman"] == "meydancik"]
STAT = next(g for p, g in KORUNAN if p.get("tur") == "stat")
BIRAHANE_YERI = next(g for p, g in KORUNAN if p.get("tur") == "birahane-yeri")
ENGEL_SABIT = [g for p, g in KORUNAN if p.get("tur") != "seki"] + [IMPERIAL[k] for k in ("sahanlik", "otel", "dip-teras") if k in IMPERIAL]

PARSELLER = []
for f in PF:
    p = f["properties"]
    if p["katman"] != "parsel":
        continue
    c = [m(q) for q in f["geometry"]["coordinates"][0]]
    PARSELLER.append({**p, "kose": c, "g": Polygon(c)})
PARSELLER.sort(key=lambda p: p["id"])
PARSEL_AGACI = STRtree([p["g"] for p in PARSELLER])

# Kare ızgara (3. adım düzeltmesi): her arsanın kareleri; ev arsasının karelerinin içinde kalır
KJ = json.load(open(KARELER, encoding="utf-8"))
ARSA_KARE = {}
for _s in KJ["seritler"]:
    _o, _u, _n = np.array(m(_s["o"])), np.array(_s["u"]) * [B["mPerLng"], B["mPerLat"]], np.array(_s["n"]) * [B["mPerLng"], B["mPerLat"]]
    for _j, _metre, _dk, _ai, _ad in _s["s"]:
        if _ai < 0:
            continue
        for _r in range(_ad):
            _q = [_o + _j * _u + _r * _n, _o + (_j + 1) * _u + _r * _n, _o + (_j + 1) * _u + (_r + 1) * _n, _o + _j * _u + (_r + 1) * _n]
            ARSA_KARE.setdefault(KJ["arsalar"][_ai], []).append((f"k_{_s['yol']}_{_s['taraf']}_{_metre:g}_{_r}", Polygon(_q)))
ARSA_ALAN = {k: unary_union([g for _, g in v]) for k, v in ARSA_KARE.items()}


def kapladigi_kareler(taban, arsalar):
    return sorted(kid for a in arsalar for kid, g in ARSA_KARE.get(a, []) if g.intersection(taban).area > 4.0)

# Kurucu türleri → modeller (KKM'deki KURUCU_MODELLERI ile aynı süzgeç)
DISARIDA = {"binalar/haydarpasa-buyuk-olcek.glb"}
KURUCU = {t: [d for d in l if d not in DISARIDA] for t, l in KAT["kurucu_turleri"].items()}
OLCU = {}


def olcu(dosya):
    if dosya not in OLCU:
        OLCU[dosya] = model_olcusu(dosya)
    return OLCU[dosya]


IMPERIAL_VE_OZEL = sorted(set(KAT["ozel"].values()) | set(KAT.get("kaliplar", {}).values()) - DISARIDA)
EV = KURUCU["ev"]
DUKKANLI = [d for d in KURUCU["dukkanli"] if d != "binalar/kahvehane-meyhane.glb"]   # türün kahvehane modeli bir mekân gibi görünmesin
CIFTLIK = KURUCU["ciftlik"]
YAZLIK = KURUCU["yazlik"]
DEPO = KURUCU["depo"]
UZUN_EV = ["binalar/ev-karisik-uzun.glb"]
DAR_EV = None   # en dar üç ev modeli (aşağıda, ölçüler okununca)
TUR_ADI = {}
for t, l in KURUCU.items():
    for d in l:
        TUR_ADI.setdefault(d, t)


def _dar_ev():
    return sorted(EV, key=lambda d: (olcu(d)[0], d))[:3]


def tur_of(dosya):
    return TUR_ADI.get(dosya, "ozel")


# ------------------------------------------------------------------ yapı kaydı
YAPILAR = []          # çıktı
DOLU = []             # yerleşmiş tabanlar (çakışma için)
TUKENEN = set()       # viki yapısının üstüne geldiği parseller


def yapi_ekle(kimlik, taban, u_on, dosya, tur, ozellik):
    """taban: metre çokgeni; u_on: önün baktığı yön (birim, x doğu y kuzey)."""
    for tolerans in (0.0, 0.05, 0.1, 0.2, 0.4):     # yuvarlanmış koordinatlarla da geçerli çokgen kalsın
        t = taban.simplify(tolerans) if tolerans else taban
        if t.geom_type == "Polygon" and Polygon([m(ll(x, y)) for x, y in t.exterior.coords]).is_valid:
            taban = t
            break
    c = taban.centroid
    rr = taban.minimum_rotated_rectangle
    k = list(rr.exterior.coords)
    # en: öne dik kenar (cephe boyunca), boy: öne koşut
    e1 = np.subtract(k[1], k[0]); e2 = np.subtract(k[2], k[1])
    if abs(np.dot(e1, u_on)) < abs(np.dot(e2, u_on)):
        en_v, boy_v = e1, e2
    else:
        en_v, boy_v = e2, e1
    en, boy = float(np.hypot(*en_v)), float(np.hypot(*boy_v))
    ex = en_v / en
    if ex[0] * (-u_on[1]) + ex[1] * u_on[0] < 0:    # ex, önden bakınca sağa doğru (yoldan bakınca sol)
        ex = -ex
    kc = [(x, y) for x, y in taban.exterior.coords]
    z = kot([q[0] for q in kc], [q[1] for q in kc])
    p = {
        "katman": "yapi", "id": kimlik, "tur": tur, "dosya": dosya,
        **ozellik,
        "merkez": ll(c.x, c.y),
        # KKM'deki ModelYeri ile aynı eksenler: x doğu, y güney (Kurucu düzlemi)
        "ex": [round(float(ex[0]), 4), round(float(-ex[1]), 4)],
        "yol": [round(float(u_on[0]), 4), round(float(-u_on[1]), 4)],
        "en": round(en, 1), "boy": round(boy, 1),
        "cepheYonu": pusula(u_on),
        "kotM": round(float(np.mean(z)), 1), "kotFarkiM": round(float(np.max(z) - np.min(z)), 1),
    }
    if dosya:
        me, mb, myu = olcu(dosya)
        p["modelOlcusu"] = [me, mb, myu]
        if ozellik.get("parselTuru") == "bitisik":
            p["modelEn"] = round(en * SIRA_EV_GOVDE, 1)
    arsalar = [PARSELLER[i]["id"] for i in PARSEL_AGACI.query(taban) if PARSELLER[i]["g"].intersection(taban).area > 4.0]
    p["kareler"] = kapladigi_kareler(taban, arsalar)
    YAPILAR.append({"type": "Feature", "properties": p,
                    "geometry": {"type": "Polygon", "coordinates": [[ll(x, y) for x, y in taban.exterior.coords]]}})
    DOLU.append(taban)


def mahalle_of(g):
    c = g.centroid
    for k, mg in MAHALLE.items():
        if mg.contains(c):
            return k
    return min(MAHALLE, key=lambda k: MAHALLE[k].distance(c))


# ------------------------------------------------------------------ 1. viki bağlı yapılar
ESKI_MEYDAN = m(ESKI_J["eskiMerkezMeydani"])
_km = kucult(*ESKI_MEYDAN)
KAYMA = {k: (v["m"][0] - kucult(*m(v["eskiNokta"]))[0], v["m"][1] - kucult(*m(v["eskiNokta"]))[1])
         for k, v in YERLESIM.items()}
KAYMA["yerlesim_merkez"] = (MEYDAN.centroid.x - _km[0], MEYDAN.centroid.y - _km[1])   # meydan çapası
MAH_YERLESIM = {}
for k, v in YERLESIM.items():
    MAH_YERLESIM.setdefault(v["mahalle"], []).append(k)


LIMAN_KAYMASI = {}    # kıyıdaki öbek (Liman dışındaki kıyı yapıları): birlikte kıyıya kayar


def eski_limanda(e):
    """Liman kasabasındaki viki yapısı (Fener burunda, kendi kuralıyla): sokaklarla birlikte taşınır (Kemal, 22 Kasım)."""
    return e["mahalle"] == "yer_liman" and e["id"] != "bina_fener" and e.get("eskiKonum") is not None


def eski_iskelede(e):
    """İskele köyündeki viki yapısı (The Imperial kendi ayrılan yerinde): sokaklarla birlikte taşınır (Kemal, 24 Kasım)."""
    return not e.get("ozelYer") and e.get("eskiKonum") is not None and IS.eski_iskelede(e["eskiKonum"], e["mahalle"])


def hedef(e):
    """Eski yerin kompakt adadaki karşılığı: küçültme + yerleşimin kayması (+ kıyı öbeğinin kayması).
    Liman kasabasındakiler sokaklarla aynı taşımayla (gen/kompakt_liman.py: oran 0,70, odak Dondurmacı Kızlar);
    İskele köyündekiler de (gen/kompakt_iskele.py: oran 0,70, köyün kara yönüne kayması)."""
    if eski_limanda(e):
        return LM.tasi(*e["eskiKonum"]), "yerlesim_liman"
    if eski_iskelede(e):
        return IS.tasi(*e["eskiKonum"]), "yerlesim_iskele"
    p = m(e["eskiKonum"])
    k = kucult(*p)
    adaylar = MAH_YERLESIM.get(e["mahalle"], [])
    ys = min(adaylar, key=lambda y: math.dist(k, YERLESIM[y]["m"])) if adaylar else None
    d = KAYMA.get(ys, (0.0, 0.0))
    g = LIMAN_KAYMASI.get(e["id"], (0.0, 0.0))
    return (k[0] + d[0] + g[0], k[1] + d[1] + g[1]), ys


def isaretli_kiyi(q):
    """Kıyıya uzaklık: karada artı, denizde eksi (m)."""
    d = KIYI.distance(Point(q))
    return d if ADA.contains(Point(q)) else -d


def liman_obekleri():
    """Eski haritada kıyıda duran viki yapıları (liman kıyısı) yerleşim yerleşim bir öbek: öbek bütün olarak,
    eski kıyı uzaklığının 0,70'i kıyıda kalacak kadar kıyıya dik kayar; yapılar birbirine göre yerini korur."""
    LIMAN_KAYMASI.clear()
    obek = {}
    for e in ESKI_J["yapilar"]:
        if e["ozelYer"] or e["bag"] != "viki" or e["eskiKiyiM"] > KIYI_BAGLI_M or eski_limanda(e) or eski_iskelede(e):
            continue
        T, ys = hedef(e)
        obek.setdefault(ys, []).append((e, T))
    for ys, l in sorted(obek.items(), key=lambda kv: str(kv[0])):
        G = np.mean([T for e, T in l], axis=0)
        istenen = B["olcek"] * float(np.mean([e["eskiKiyiM"] for e, T in l]))
        Q = KIYI.interpolate(KIYI.project(Point(G))).coords[0]
        v = np.subtract(Q, G); v = v / np.hypot(*v)
        if isaretli_kiyi(G) < 0:
            v = -v                                   # denizdeyse karaya doğru
        en_iyi = min(np.arange(-500.0, 500.1, 2.0), key=lambda t: (round(abs(isaretli_kiyi(G - v * t) - istenen) / 4), abs(t)))
        for e, T in l:
            LIMAN_KAYMASI[e["id"]] = (float(-v[0] * en_iyi), float(-v[1] * en_iyi))


def uygun(taban, mah, kiyi_en_az):
    if not MAHALLE[mah].contains(taban):
        return False
    if not ADA.buffer(-kiyi_en_az).contains(taban):
        return False
    for i in YOL_AGACI.query(taban):
        if YOL_ALAN[i].intersection(taban).area > 0.05:
            return False
    for g in ENGEL_SABIT:
        if g.intersects(taban):
            return False
    for g in DOLU:
        if g.distance(taban) < YAPI_ARASI:
            return False
    kc = list(taban.exterior.coords) + [taban.centroid.coords[0]]
    z = kot([q[0] for q in kc], [q[1] for q in kc])
    kosegen = math.hypot(*np.subtract(taban.bounds[2:], taban.bounds[:2]))
    if np.min(z) < 0.5 or (np.max(z) - np.min(z)) / kosegen > EGIM_VIKI:
        return False
    return True


def yol_kenari_adaylari(T, en, boy, meydana):
    """Yol boyunca, iki yanda, önü yola bakan taban adayları (merkez, ön yönü, yol kimliği)."""
    alan = Point(T).buffer(ARAMA_M)
    for i, (p, g) in enumerate(YOL):
        if not g.intersects(alan):
            continue
        if meydana and g.distance(MEYDAN) > 6:
            continue
        L = g.length
        s = 0.0
        while s <= L:
            q = g.interpolate(s)
            if q.distance(Point(T)) <= ARAMA_M:
                a = g.interpolate(max(0, s - 1)); b = g.interpolate(min(L, s + 1))
                t = np.subtract(b.coords[0], a.coords[0]); tl = np.hypot(*t)
                if tl > 1e-6:
                    t = t / tl
                    if meydana and q.distance(MEYDAN) > 9.0:
                        s += ADIM_M
                        continue
                    for yan in (1, -1):
                        n = np.array([-t[1], t[0]]) * yan     # yoldan yapıya
                        uz = p["genislik"] / 2 + KALDIRIM + boy / 2
                        c = np.array(q.coords[0]) + n * uz
                        if meydana and MEYDAN.distance(Point(c)) < MEYDAN.distance(q):
                            continue    # meydanın içine değil, karşısına
                        yield c, -n, t, p["id"]
            s += ADIM_M


def yerlestir_viki(e):
    T, ys = hedef(e)
    en, boy = e["olcu"]["en"], e["olcu"]["boy"]
    liman = e["eskiKiyiM"] <= KIYI_BAGLI_M
    kiyi_en_az = KIYI_EN_AZ["liman" if liman else "diger"]
    meydana = e.get("eskiMeydanM") is not None and e["eskiMeydanM"] <= MEYDAN_BAKAR_M
    if e["id"] == "bina_fener":
        return T, ys, fener_yeri(e, T, kiyi_en_az), meydana, liman
    en_iyi = None
    for c, on, t, yid in yol_kenari_adaylari(T, en, boy, meydana):
        puan = math.dist(c, T)
        if liman and e["id"] not in LIMAN_KAYMASI and not eski_limanda(e) and not eski_iskelede(e):
            puan += 3.0 * max(0.0, KIYI.distance(Point(c)) - max(boy, B["olcek"] * e["eskiKiyiM"]))
        if en_iyi and puan >= en_iyi[0]:
            continue
        taban = dikdortgen(c, t, en, boy)
        if not uygun(taban, e["mahalle"], kiyi_en_az):
            continue
        en_iyi = (puan, taban, on, yid)
    if en_iyi is None and e["id"] == "bina_fener":
        en_iyi = fener_yeri(e, T, kiyi_en_az)
    return T, ys, en_iyi, meydana, liman


def fener_yeri(e, T, kiyi_en_az):
    """Fener yol kenarında değil, burunda: hedefin çevresinde ızgara; önü denize bakar."""
    en, boy = e["olcu"]["en"], e["olcu"]["boy"]
    burun = ZIRVE.get("Fener Burnu", T)       # eski fener de bu burundaydı (künye: Liman'ın kuzeybatı ucu)
    en_iyi = None
    for dx in np.arange(-250, 251, 5.0):
        for dy in np.arange(-250, 251, 5.0):
            c = (burun[0] + dx, burun[1] + dy)
            q = KIYI.interpolate(KIYI.project(Point(c)))
            on = np.subtract(q.coords[0], c); ol = np.hypot(*on)
            if ol < 1e-6:
                continue
            on = on / ol
            puan = 0.3 * math.dist(c, burun) + abs(ol - B["olcek"] * e["eskiKiyiM"])
            if en_iyi and puan >= en_iyi[0]:
                continue
            taban = dikdortgen(c, (on[1], -on[0]), en, boy)
            if uygun(taban, e["mahalle"], kiyi_en_az):
                en_iyi = (puan, taban, on, None)
    return en_iyi


def ayrilan_yer(e, g):
    """1.–2. adımda ayrılan yer: taban o çokgen; önü en yakın yola."""
    for i in YOL_AGACI.query(g):                     # ayrılan yere değen yol ucu (stat kapısı) tabandan çıkar
        g = g.difference(YOL_ALAN[i])
    if g.geom_type != "Polygon":
        g = max(g.geoms, key=lambda q: q.area)
    c = g.centroid
    yakin = min(YOL, key=lambda pg: pg[1].distance(c))
    q = yakin[1].interpolate(yakin[1].project(c))
    on = np.subtract(q.coords[0], (c.x, c.y)); on = on / np.hypot(*on)
    return g, on, yakin[0]["id"]


                                             # bina_liman_iskele); Kurucu'da dükkân bu kökün 37 m gerisinde, 14 m yanında
DK_KUMSAL = 23.6        # oyun belgesi 0.10 (~25 m kumsal; oyun kodunda dükkânın önü ile su arası 23,6 m); sığmazsa kısalır (DENEME)
DK_KUMSAL_EN_AZ = 8.0   # DENEME: dükkânın önü ile su arası en az
DK_TERAS = 6.2          # oyun kodu: iskele dükkânın önündeki terasın ucundan başlar (dükkân önünden 6,2 m)
DK_ISKELE_BOY = 101.0   # oyun belgesi 0.10: kıyıdan ~100 m (oyun kodu: sudan 101 m)
DK_ISKELE_EN = 4.0      # oyun kodu
DK_T = (44.0, 7.0)      # oyun belgesi 0.10: ~45 m T başı (oyun kodu 44 x 7 m)
DK_MENDIREK = [(239, -95), (227, -142), (209, -176), (183, -206), (149, -233), (101, -248), (39, -248),
               (-11, -242), (-49, -236), (-85, -223), (-120, -208)]   # oyun kodu; oyunun çerçevesi: dükkân (0, 0),
                                                                      # su -26, -z deniz, +x denize bakınca sağ
DK_MENDIREK_EN = 8.0    # oyun kodu
DK_ISKELE = {}          # iskele ve mendirek (uret() yazar)


def dk_iskele_kok():
    """İskelenin kökü ve oradaki kıyı noktası, deniz yönü. Kök #266'da eski iskele kökünün taşınmış yeriydi; Liman
    eski sokaklarıyla gelince (22 Kasım) dükkân ve iskele yerinde kalır: kök #266'daki yerinde (gen/kompakt_liman.py)."""
    T = Point(m(LM.ISKELE_KOK))
    s = KIYI.project(T)
    S = KIYI.interpolate(s)
    a, b = KIYI.interpolate(s - 40.0), KIYI.interpolate(s + 40.0)
    t = np.array([b.x - a.x, b.y - a.y]); t /= np.hypot(*t)
    n = np.array([-t[1], t[0]])
    if ADA.contains(Point(S.x + n[0] * 5, S.y + n[1] * 5)):
        n = -n
    return (T.x, T.y), np.array([S.x, S.y]), n


def dk_dukkan(e):
    """Dükkân iskelenin dibinde, önü denize; önü ile su arası DK_KUMSAL, sığmazsa kısalır."""
    _, S, n = dk_iskele_kok()
    en, boy = e["olcu"]["en"], e["olcu"]["boy"]
    u = (n[1], -n[0])
    for kumsal in np.arange(DK_KUMSAL, DK_KUMSAL_EN_AZ - 0.01, -0.4):
        c = S - n * (kumsal + boy / 2)
        taban = dikdortgen(c, u, en, boy)
        if uygun(taban, e["mahalle"], 0.0):
            return taban, float(kumsal)
    return None, None


def dk_iskele_ve_mendirek(taban, kumsal):
    _, S, n = dk_iskele_kok()
    sag = np.array([n[1], -n[0]])
    on = S - n * kumsal                                   # dükkânın önü (kıyı hattında)
    bas, uc = on + n * DK_TERAS, S + n * DK_ISKELE_BOY
    govde = LineString([tuple(bas), tuple(uc + n * DK_T[1] / 2)])
    y, ty, td = DK_ISKELE_EN / 2, DK_T[0] / 2, DK_T[1]
    iskele = Polygon([tuple(bas - sag * y), tuple(uc - sag * y), tuple(uc - sag * ty), tuple(uc - sag * ty + n * td),
                      tuple(uc + sag * ty + n * td), tuple(uc + sag * ty), tuple(uc + sag * y), tuple(bas + sag * y)])
    DK_ISKELE["iskele"] = (iskele, govde)
    O = S - n * 26.0                                      # oyunun başlangıcı: sudan 26 m içeri
    pts = [tuple(O + sag * x - n * z) for x, z in DK_MENDIREK]
    # kök: oyunun ilk noktası denizdeyse kıyıya uzatılır; mendirek kıyı boyunca karaya biniyorsa karadaki kısmı kesilir,
    # kök suya çıktığı yerde kıyıya oturur (2 m karaya girer)
    hat = LineString(pts)
    k = 0.0
    if ADA.contains(Point(pts[0])):
        deniz_ = hat.difference(ADA)
        parca = max(getattr(deniz_, "geoms", [deniz_]), key=lambda q: q.length)
        a0, a1 = np.array(parca.coords[0]), np.array(parca.coords[1])
        v = (a0 - a1) / np.hypot(*(a0 - a1))
        hat = LineString([tuple(a0 + v * 2.0)] + list(parca.coords))
    else:
        p0, p1 = np.array(pts[0]), np.array(pts[1])
        v = (p0 - p1) / np.hypot(*(p0 - p1))
        while not ADA.contains(Point(p0 + v * k)) and k < 300:
            k += 0.5
        hat = LineString([tuple(p0 + v * (k + 2.0))] + pts)
    kok = hat.coords[0]
    g = hat.buffer(DK_MENDIREK_EN / 2, cap_style=1, join_style=1).simplify(0.05)
    kara = g.difference(Point(kok).buffer(DK_MENDIREK_EN * 2)).intersection(ADA).area   # kökün kıyıya giren ucu sayılmaz
    sorun = []
    if k >= 300:
        sorun.append("kökü kıyıya ulaşmıyor")
    if kara > 1.0:
        sorun.append(f"karaya {kara:.0f} m² giriyor")
    if g.distance(iskele) < 20:
        sorun.append("iskeleye 20 m'den yakın")
    if any(g.intersects(d) for d in DOLU):
        sorun.append("bir yapıya değiyor")
    DK_ISKELE["mendirek"] = (g, hat, sorun)


def eski_feribot_iskelesi():
    """Eski feribot iskelesi (Kemal, 24 Kasım; yer tahmini, gen/kompakt_iskele.py → FERIBOT_*): Eski Kilise'nin taşınmış
    eski yerinin kıyıdaki en yakın noktasından kıyıya dik, taş. (çokgen, orta çizgisi, sorunlar)."""
    T = Point(IS.tasi(*IS.FERIBOT_HIZA))
    s = KIYI.project(T)
    S = KIYI.interpolate(s)
    a, b = KIYI.interpolate(s - 40.0), KIYI.interpolate(s + 40.0)
    t = np.array([b.x - a.x, b.y - a.y]); t /= np.hypot(*t)
    n = np.array([-t[1], t[0]])
    if ADA.contains(Point(S.x + n[0] * 5, S.y + n[1] * 5)):
        n = -n
    S = np.array([S.x, S.y])
    hat = LineString([tuple(S - n * IS.FERIBOT_KARAYA), tuple(S + n * IS.FERIBOT_BOY)])
    g = hat.buffer(IS.FERIBOT_EN / 2, cap_style=2, join_style=2)
    sorun = []
    if any(g.intersects(d) for d in DOLU):
        sorun.append("bir yapıya değiyor")
    return g, hat, sorun


KAYITLAR = []        # rapor için: viki bağlı yapının eski ve yeni yeri
YERLESEMEYEN = []


def viki_yapilari():
    liman_obekleri()
    sira = sorted(ESKI_J["yapilar"], key=lambda e: (e["ozelYer"] is None,
                                                   not (e.get("eskiMeydanM") is not None and e["eskiMeydanM"] <= MEYDAN_BAKAR_M),
                                                   -(e["olcu"]["en"] * e["olcu"]["boy"] if e["olcu"] else 0), e["id"]))
    for e in sira:
        dosya = e["dosya"]
        if e["bag"] == "oturan" or (not dosya and e.get("kurucuTur") in KURUCU and e["bag"] == "viki"):
            dosya = sabit_sec(e["id"], KURUCU[e["kurucuTur"] or "ev"])    # bugünkü haritanın seçtiği model
        if e["olcu"] is None:
            me, mb, _ = olcu(dosya)
            e = {**e, "olcu": {"en": me, "boy": mb}}
        ozel = {"vikiId": e["vikiId"], "ad": e["ad"], "bag": e["bag"], "eskiKonum": e["eskiKonum"]}
        if e["ozelYer"]:
            g = {"imperial-otel": IMPERIAL.get("otel"), "stat": STAT, "birahane-yeri": BIRAHANE_YERI}[e["ozelYer"]]
            taban, on, yid = ayrilan_yer(e, g)
            T, ys = hedef(e)
            yontem = "ayrılan yer (" + e["ozelYer"] + ")"
        elif e["bag"] == "oturan":
            # Evde oturanı olan ev: hedefe en yakın uygun parselde, parselin evi olarak
            T, ys = hedef(e)
            sonuc = oturan_parseli(e, T, dosya)
            if sonuc is None:
                YERLESEMEYEN.append((e, "hedefin çevresinde boş, uygun parsel yok"))
                continue
            taban, on, yid, prs, dosya = sonuc
            TUKENEN.add(prs["id"])
            ozel["parsel"] = prs["id"]
            yontem = "en yakın parsel"
        elif e["id"] == "bina_liman_kafe":
            T, ys = hedef(e)
            taban, kumsal = dk_dukkan(e)
            if taban is None:
                YERLESEMEYEN.append((e, "iskelenin dibinde yer yok"))
                continue
            _, S, n = dk_iskele_kok()
            on = tuple(n)
            yid = min(YOL, key=lambda pg: pg[1].distance(taban))[0]["id"]
            yontem = f"eski Liman İskelesi'nin dibinde, önü denize, kumsal {kumsal:.1f} m"
            dk_iskele_ve_mendirek(taban, kumsal)
        else:
            T, ys, sonuc, meydana, liman = yerlestir_viki(e)
            if sonuc is None:
                YERLESEMEYEN.append((e, "hedefin çevresinde uygun yer yok"))
                continue
            _, taban, on, yid = sonuc
            yontem = ("Fener Burnu'nda, kıyıya eskisinin 0,70'i uzaklıkta" if e["id"] == "bina_fener" else
                      "eski Liman'daki yeri (sokaklarla aynı taşıma, oran 0,70)" if eski_limanda(e) else
                      "eski İskele'deki yeri (sokaklarla aynı taşıma, oran 0,70)" if eski_iskelede(e) else
                      "oranla karşılığı" + (", meydana bakar" if meydana else "")
                      + (", kıyıda (liman öbeği birlikte kıyıya kaydı)" if e["id"] in LIMAN_KAYMASI else ", kıyıda" if liman else ""))
        ozel["yol"] = yid
        ozel["tasima"] = {"yontem": yontem, "hedef": ll(*T), "hedeftenM": round(taban.centroid.distance(Point(T)), 1)}
        ozel["mahalle"] = mahalle_of(taban)
        ozel["yerlesim"] = ys
        if e.get("bak") or (e.get("eskiMeydanM") is not None and e["eskiMeydanM"] <= MEYDAN_BAKAR_M):
            q = MEYDAN.exterior.interpolate(MEYDAN.exterior.project(taban.centroid))
            ozel["bak"] = ll(*q.coords[0])          # önü meydana (KKM'deki `bak` alanı gibi)
        if e["ozelYer"] != "imperial-otel" and e["ozelYer"] != "stat":
            for i in PARSEL_AGACI.query(taban.buffer(YAPI_ARASI)):
                if PARSELLER[i]["g"].intersects(taban.buffer(YAPI_ARASI)):
                    TUKENEN.add(PARSELLER[i]["id"])
        yapi_ekle(e["id"], taban, tuple(on), dosya, tur_of(dosya) if dosya else (e.get("kurucuTur") or "kutu"), ozel)
        KAYITLAR.append((e, YAPILAR[-1]["properties"]))
    kemal_secti()


# Eski haritada yeri olmayan yedi yapı: Kemal 21 Kasım'da ajansın 1. adaylarını seçti. Nokta, adayın arsasının
# (ya da boş yerin) merkezi; yapı oradaki arsaya oturur, arsadaki ev kalkar. Kimlik yapi_<maddenin başlığı>.
KEMAL_SECTI = [   # (kimlik, vikiId, vikideki adı, model, nasıl, nokta [boylam, enlem], taban (m, DENEME))
    ("yapi_merkez_camii", "mekan_1791406290403_o0m2j", "Düzada Merkez Camii", "binalar/merkez-camii.glb", "arsa", (25.8732724, 39.6039286), None),
    ("yapi_saglik_ocagi", "mekan_1791406292051_49pt1", "Düzada Sağlık Ocağı", "binalar/saglik-ocagi.glb", "arsa", (25.8768161, 39.6027212), None),
    ("yapi_merkez_postanesi", "mekan_1791406291758_f8hzx", "Merkez Postanesi", "binalar/merkez-postanesi.glb", "arsa", (25.8743975, 39.6060943), None),
    ("yapi_merkez_eczanesi", "mekan_1791406292321_vti5e", "Merkez Eczanesi", None, "dukkanli", (25.8745293, 39.6044842), None),
    ("yapi_efendi_kuruyemis", "madde_1791557701651", "Efendi Kuruyemiş", None, "dukkanli", (25.8227675, 39.6148875), None),
    ("yapi_iskele_mescidi", "madde_1794596168679_jaq4c", "İskele Mescidi", None, "arsa", (25.8176895, 39.5869425), (10.0, 12.0)),
    ("yapi_rum_mezarligi", "mekan_1791406292869_vkdn7", "Rum Mezarlığı", None, "bos-yer", (25.8196917, 39.5828715), (20.0, 24.0)),
]
KEMAL_YONTEM = "Kemal seçti (aday 1, 21 Kasım)"
RUM_MEZARLIGI_KILISEYE = (-21.33, 14.86)   # Rum Mezarlığı'nın Eski Kilise'ye göre yeri (m; 21 Kasım'daki seçimden, 24 Kasım)


def arsa_bul(nokta):
    q = Point(m(nokta))
    return min(PARSELLER, key=lambda p: p["g"].distance(q) + 0.01 * p["g"].centroid.distance(q))


def arsaya_oturt(prs, en, boy):
    """Arsanın ortasına, önü yola (1 m geri); arsadan büyükse arsaya sığacak kadar daralır (DENEME)."""
    a, b, u, n = parsel_cercevesi(prs)
    L = float(np.dot(b - a, u)); D = prs["derinlikM"]
    en, boy = min(en, L - 1.0), min(boy, D - 2.0)
    s0 = (L - en) / 2
    return ev_tabani(a, u, n, s0, s0 + en, 1.0, 1.0 + boy), -n


def kemal_secti():
    for kimlik, viki, ad, dosya, nasil, nokta, olcu_ in KEMAL_SECTI:
        oz = {"vikiId": viki, "ad": ad, "bag": "viki", "eskiKonum": None}
        if nasil == "bos-yer":
            # Rum Mezarlığı: Eski Kilise'nin yanındaki boş yer; kiliseyle aynı yöne. İskele eski sokaklarıyla gelince
            # (24 Kasım) kilise eski yerine döner; mezarlık kiliseye göre aynı yerde kalır (Kemal'in seçtiği noktanın
            # kiliseye göre yeri: kilisenin ekseni boyunca RUM_MEZARLIGI_KILISEYE[0], yanına [1] m)
            kil_f = next(f for f in YAPILAR if f["properties"]["id"] == "ek_eski_kilise")
            kil = kil_f["properties"]
            ex = np.array([kil["ex"][0], -kil["ex"][1]])
            kc = gm(kil_f["geometry"]).centroid
            nx = np.array([kc.x, kc.y]) + RUM_MEZARLIGI_KILISEYE[0] * ex + RUM_MEZARLIGI_KILISEYE[1] * np.array([-ex[1], ex[0]])
            # sokağa ya da yapıya değerse kiliseye göre yerinin en yakın boş yerine (2 m'lik ızgara, 60 m içinde)
            aday = sorted(((float(np.hypot(dx, dy)), (nx[0] + dx, nx[1] + dy)) for dx in np.arange(-60.0, 60.1, 2.0)
                           for dy in np.arange(-60.0, 60.1, 2.0) if np.hypot(dx, dy) <= 60.0))
            # (çevresindeki servi sırası tabandan 1,5 m dışarıda: yola değmesin diye 2,5 m pay)
            yer = next((q for _, q in aday if uygun(dikdortgen(q, ex, olcu_[0] + 5.0, olcu_[1] + 5.0), "yer_iskele",
                                                    KIYI_EN_AZ["diger"])), tuple(nx))
            nokta = tuple(ll(*nx))                   # hedef: kiliseye göre yeri (raporda hedefe uzaklık)
            taban = dikdortgen(yer, ex, *olcu_)
            on = np.array([kil["yol"][0], -kil["yol"][1]])
            tur, yid = "alan", None
        else:
            prs = arsa_bul(nokta)
            TUKENEN.add(prs["id"])
            yid = prs["yol"]
            oz["parsel"] = prs["id"]
            if nasil == "dukkanli":
                dosya = sabit_sec(kimlik, DUKKANLI)
                me, mb, _ = olcu(dosya)
                taban, on = parsel_evi(prs, [prs], me, mb)
                if taban is None:                    # arsa sığ (Liman'da 2 kare derin arsa): arsaya sığacak kadar daralır
                    taban, on = arsaya_oturt(prs, me, mb)
            else:
                me, mb = olcu_ if olcu_ else olcu(dosya)[:2]
                taban, on = arsaya_oturt(prs, me, mb)
            tur = tur_of(dosya) if dosya else "kutu"
        for i in PARSEL_AGACI.query(taban.buffer(YAPI_ARASI)):
            if PARSELLER[i]["g"].intersects(taban.buffer(YAPI_ARASI)):
                TUKENEN.add(PARSELLER[i]["id"])
        oz.update({"yol": yid, "tasima": {"yontem": KEMAL_YONTEM, "hedef": [round(nokta[0], 7), round(nokta[1], 7)],
                                         "hedeftenM": round(taban.centroid.distance(Point(m(nokta))), 1)},
                   "mahalle": mahalle_of(taban), "yerlesim": None})
        yapi_ekle(kimlik, taban, tuple(on), dosya, tur, oz)
        KAYITLAR.append(({"id": kimlik, "ad": ad}, YAPILAR[-1]["properties"]))


# ------------------------------------------------------------------ 2. parsellere evler
def parsel_cercevesi(prs):
    """Parselin önü (ilk kenar), yönleri: u yol boyunca, n_ic yoldan içeri."""
    a, b = np.array(prs["kose"][0]), np.array(prs["kose"][1])
    u = b - a; u = u / np.hypot(*u)
    n = np.array([-u[1], u[0]])
    if np.dot(np.array(prs["g"].centroid.coords[0]) - a, n) < 0:
        n = -n
    return a, b, u, n


def ev_tabani(a, u, n, s0, s1, t0, t1):
    return Polygon([tuple(a + u * s0 + n * t0), tuple(a + u * s1 + n * t0),
                    tuple(a + u * s1 + n * t1), tuple(a + u * s0 + n * t1)])


def oturan_parseli(e, T, dosya):
    """Evde oturanı olan ev: hedefe en yakın boş parsel (büyük parsel dışında). Bitişik parselde en dar ev
    modeli konur (geniş model dar parsele sıkışmasın)."""
    adaylar = sorted((p for p in PARSELLER if p["mahalle"] == e["mahalle"] and p["id"] not in TUKENEN
                      and p["tur"] != "buyuk"), key=lambda p: p["g"].centroid.distance(Point(T)))
    dar = min(EV, key=lambda d: (olcu(d)[0], d))
    for prs in adaylar[:40]:
        d = dar if prs["tur"] == "bitisik" else dosya
        me, mb, _ = olcu(d)
        taban, on = parsel_evi(prs, [prs], me, mb)
        if taban is not None and not any(g.intersects(taban) for g in DOLU):
            return taban, on, prs["yol"], prs, d
    return None


def parsel_evi(prs, grup, en, boy):
    """Parselin (ya da sıra ev grubunun) içinde ev tabanı. Sığmazsa None."""
    tur = prs["tur"]
    a, _, u, n = parsel_cercevesi(grup[0])
    _, b, _, _ = parsel_cercevesi(grup[-1])
    L = float(np.dot(b - a, u))
    D = min(p["derinlikM"] for p in grup)
    alan = unary_union([ARSA_ALAN.get(p["id"], p["g"]) for p in grup])
    on = ON_PAY[tur]
    # Liman'ın 2 kare derin (16 m) arsalarında arka avlu daha dar (gen/kompakt_parseller.py → LIMAN_SIG)
    arka = LIMAN_SIG_ARKA if prs["yerlesim"] in ("yerlesim_liman", "yerlesim_iskele") and D <= 16.5 else ARKA_PAY[tur]
    if tur == "bitisik":
        # ortak duvar: cephe boyunca tam; eğri yolda parselin kendi biçimini izler
        t1 = on + min(boy, D - on - ARKA_PAY[tur])
        if t1 - on < 6.0:
            return None, None
        serit = ev_tabani(a, u, n, -60.0, L + 60.0, on + 0.02, t1)
        taban = alan.intersection(serit)
        if taban.geom_type != "Polygon" or taban.area < 0.8 * L * (t1 - on):
            return None, None
        taban = taban.simplify(0.05)
        for d in DOLU[-4:]:                          # eğride komşu parseller hafifçe biniyor: ortak duvara kırp
            if d.intersects(taban):
                taban = taban.difference(d.buffer(0.02))
        if taban.geom_type != "Polygon" or taban.area < 0.8 * L * (t1 - on):
            return None, None
        return taban, -n
    if tur == "avlulu" and L <= DAR_CEPHE:
        # dar avlulu arsa (1 kare cephe): dar ev, cepheye sığacak kadar daralır; arkada avlu
        en = L - 2 * DAR_YAN_PAY
        boy = min(boy, D - on - arka)
        if boy < 6.0:
            return None, None
        taban = ev_tabani(a, u, n, DAR_YAN_PAY, DAR_YAN_PAY + en, on, on + boy)
        return (taban, -n) if alan.buffer(0.05).contains(taban) else (None, None)
    if boy > D - on - arka or en * boy > EV_ALAN_ORANI[tur] * prs["alanM2"]:
        return None, None
    yan = YAN_PAY.get(tur, 1.0)
    if en > L - 2 * yan:
        return None, None
    if tur == "avlulu":
        sola = sans(prs["id"] + "#yan") < 0.5
        denemeler = np.arange(yan, L - yan - en + 1e-6, 1.0)
        denemeler = denemeler if sola else denemeler[::-1]
    else:
        orta = (L - en) / 2
        denemeler = sorted(np.arange(yan, L - yan - en + 1e-6, 1.0), key=lambda s: abs(s - orta))
    ic = alan.buffer(0.05)
    for geri in (on, on + 1.0, on + 2.0):
        if boy > D - geri - arka:
            break
        for s0 in denemeler:
            taban = ev_tabani(a, u, n, s0, s0 + en, geri, geri + boy)
            if ic.contains(taban):
                return taban, -n
    return None, None


def model_listesi(prs, meydana):
    """Parselin türüne ve yerine göre model havuzu (yalnız KKM'nin modelleri)."""
    tur, kim, ys = prs["tur"], prs["id"], prs["yerlesim"]
    if tur == "avlulu" and prs["cepheM"] <= DAR_CEPHE:
        return DAR_EV
    if tur == "bitisik":
        if meydana and sans(kim + "#dukkan") < MEYDAN_DUKKAN_ORANI:
            return DUKKANLI
        return [d for d in EV if d not in UZUN_EV]
    if tur == "buyuk":
        r = sans(kim + "#buyuk")
        if ys in ("yerlesim_liman", "yerlesim_ciftlik") and r < DEPO_ORANI:
            return DEPO
        if r > 1 - UZUN_EV_ORANI:
            return UZUN_EV
        return DUKKANLI
    if ys == "yerlesim_ciftlik" and sans(kim + "#ciftlik") < CIFTLIK_ORANI:
        return CIFTLIK
    if ys != "yerlesim_ciftlik" and KIYI.distance(prs["g"]) < KIYI_YAKIN_M and sans(kim + "#yazlik") < KIYI_ORANI:
        return YAZLIK
    return EV


SAYAC = {"bos": {}, "sigmadi": {}, "viki": 0}


def say(k, tur):
    SAYAC[k][tur] = SAYAC[k].get(tur, 0) + 1


def parsel_evleri():
    yanlar = {}
    for p in PARSELLER:
        yanlar.setdefault((p["yol"], p["taraf"]), []).append(p)
    meydan_cevre = unary_union([MEYDAN] + MEYDANCIK).buffer(14)
    for anahtar in sorted(yanlar):
        sira = sorted(yanlar[anahtar], key=lambda p: p["konumM"])
        # bitişik dar parseller yan yana birleşir (tek sıra ev)
        gruplar, i = [], 0
        while i < len(sira):
            g = [sira[i]]
            while (g[0]["tur"] == "bitisik" and sum(p["cepheM"] for p in g) < SIRA_EV_EN_DAR and i + 1 < len(sira)
                   and sira[i + 1]["tur"] == "bitisik" and sira[i + 1]["konumM"] - (g[-1]["konumM"] + g[-1]["cepheM"]) < 0.6):
                i += 1; g.append(sira[i])
            gruplar.append(g); i += 1
        onceki = None
        onceki_mah = None
        for g in gruplar:
            prs = g[0]
            tur = prs["tur"]
            # Liman yeniden üretildi (22 Kasım): Liman'dan öbür mahalleye geçen sırada komşu model sayılmaz; öbür
            # köylerin evleri Liman'daki evden etkilenmesin
            if onceki_mah == "yer_liman" and prs["mahalle"] != "yer_liman":
                onceki = None
            onceki_mah = prs["mahalle"]
            if any(p["id"] in TUKENEN for p in g):
                SAYAC["viki"] += len(g)
                onceki = None
                continue
            oran = BOS_ORANI[tur] if tur != "avlulu" else BOS_ORANI["avlulu"][prs["yerlesim"]]
            if sans(prs["id"] + "#bos") < oran:
                say("bos", tur); onceki = None
                continue
            meydana = prs["g"].intersects(meydan_cevre)
            havuz = model_listesi(prs, meydana)
            kimlik = "ev_" + prs["id"][4:]
            ilk = sabit_sec(kimlik, havuz)
            sirali = havuz[havuz.index(ilk):] + havuz[:havuz.index(ilk)]
            if onceki in sirali and len(sirali) > 1:          # yan yana aynı model olmasın
                sirali.remove(onceki); sirali.append(onceki)
            yerlesti = False
            for dosya in sirali:
                me, mb, _ = olcu(dosya)
                taban, on = parsel_evi(prs, g, me, mb)
                if taban is None:
                    continue
                if any(d.intersects(taban) and d.intersection(taban).area > 0.05 for d in DOLU[-3:]):
                    continue
                yapi_ekle(kimlik, taban, tuple(on), dosya, tur_of(dosya),
                          {"parsel": prs["id"], **({"parseller": [p["id"] for p in g]} if len(g) > 1 else {}),
                           "parselTuru": tur, "yol": prs["yol"], "mahalle": prs["mahalle"], "yerlesim": prs["yerlesim"]})
                onceki, yerlesti = dosya, True
                break
            if not yerlesti and tur != "bitisik":
                for dosya in sorted(EV + YAZLIK, key=lambda d: (olcu(d)[0] * olcu(d)[1], d)):
                    me, mb, _ = olcu(dosya)
                    taban, on = parsel_evi(prs, g, me, mb)
                    if taban is not None:
                        yapi_ekle(kimlik, taban, tuple(on), dosya, tur_of(dosya),
                                  {"parsel": prs["id"], "parselTuru": tur, "yol": prs["yol"], "mahalle": prs["mahalle"],
                                   "yerlesim": prs["yerlesim"]})
                        onceki, yerlesti = dosya, True
                        break
            if not yerlesti:
                say("sigmadi", tur); onceki = None


def uret():
    global DAR_EV
    DAR_EV = _dar_ev()
    global YAPILAR, DOLU, TUKENEN, KAYITLAR, YERLESEMEYEN, SAYAC
    YAPILAR, DOLU, TUKENEN, KAYITLAR, YERLESEMEYEN = [], [], set(), [], []
    SAYAC = {"bos": {}, "sigmadi": {}, "viki": 0}
    DK_ISKELE.clear()
    viki_yapilari()
    parsel_evleri()
    deniz = []
    _not = "Dondurmacı Kızlar oyunuyla uyumlu (oyun belgesi 0.10); taslak, Kemal onaylamadı"
    if "iskele" in DK_ISKELE:
        g, hat = DK_ISKELE["iskele"]
        deniz.append({"type": "Feature", "properties": {
            "katman": "iskele", "id": "iskele_dondurmaci", "tur": "ahşap", "genislik": DK_ISKELE_EN,
            "uzunlukM": round(hat.length), "tBasiM": list(DK_T),
            "modeller": ["deniz/ahsap-iskele-duz.glb", "deniz/ahsap-iskele-t.glb"],
            "not": "T iskele: eski haritadaki Liman İskelesi'nin yerinde, kıyıya dik; dibinde Dondurmacı Kızlar. " + _not},
            "geometry": {"type": "Polygon", "coordinates": [[ll(x, y) for x, y in g.exterior.coords]]}})
    if "mendirek" in DK_ISKELE and not DK_ISKELE["mendirek"][2]:
        g, hat, _ = DK_ISKELE["mendirek"]
        deniz.append({"type": "Feature", "properties": {
            "katman": "mendirek", "id": "mendirek_liman", "tur": "taş", "genislik": DK_MENDIREK_EN,
            "uzunlukM": round(hat.length), "hat": [ll(x, y) for x, y in hat.coords], "modeller": ["deniz/mendirek-duz.glb"],
            "not": "Mendirek: oyundaki biçimiyle koyun ağzında; sağda kıyıdan başlar, solda açık biter. " + _not},
            "geometry": {"type": "Polygon", "coordinates": [[ll(x, y) for x, y in g.exterior.coords]]}})
    g, hat, sorun = eski_feribot_iskelesi()
    DK_ISKELE["feribot"] = sorun
    if not sorun:
        deniz.append({"type": "Feature", "properties": {
            "katman": "iskele", "id": "iskele_eski_feribot", "tur": "taş", "genislik": IS.FERIBOT_EN,
            "uzunlukM": round(hat.length), "hat": [ll(x, y) for x, y in hat.coords], "modeller": ["deniz/mendirek-duz.glb"],
            "not": "Eski feribot iskelesi (Kemal, 24 Kasım; künye: feribot İskele'den yeni limana taşındı). Yeri ve ölçüleri "
                   "tahmin, DENEME: eski haritada yok, Eski Kilise hizasında kıyıya dik; taslak, Kemal onaylamadı"},
            "geometry": {"type": "Polygon", "coordinates": [[ll(x, y) for x, y in g.exterior.coords]]}})
    return arsa_koseleri({
        "type": "FeatureCollection",
        "not": "Kompakt ada yapıları, taslak (Kemal onaylamadı). gen/kompakt_yapilar.py üretir.",
        "alanlar": {
            "id": "kararlı kimlik. Viki bağlı yapıda eski haritadaki kimliği (Kurucu bağı, evde oturanlar, 3B eşlemesi "
                  "kopmasın); parsel evinde ev_<parsel kimliği>",
            "tur": "KKM Kurucu türü (ev | dukkanli | ciftlik | yazlik | depo | kamu) ya da ozel (yapının kendi modeli) "
                   "ya da kutu (modeli yok, bugünkü gibi kutu)",
            "dosya": "public/modeller/ altındaki model; null: modeli yok",
            "merkez": "taban merkezi [boylam, enlem]",
            "ex": "modelin +X ekseni, x doğu y güney (KKM'deki ModelYeri.ex gibi)",
            "yol": "önün baktığı yön, x doğu y güney (ModelYeri.yol gibi); model ön = +Z",
            "en": "ex boyunca taban (m)", "boy": "ona dik taban (m)",
            "modelOlcusu": "modelin kendi tabanı ve yüksekliği [en, boy, yükseklik] (m); en/boy farklıysa harita "
                           "modeli tabana uydurur (bugünkü harita gibi)",
            "modelEn": "yalnız bitişik arsadaki evde: model bu genişliğe uydurulur (tabandan geniş; modelin yan bahçe "
                       "payı komşuya taşar, gövdeler değer). Taban, kareler ve denetim en ile çalışır",
            "cepheYonu": "önün pusula yönü (kuzey 0, saat yönünde)",
            "kotM": "tabanın ortalama rakımı (m)", "kotFarkiM": "tabandaki en yüksek ile en alçak nokta farkı (m)",
            "parsel": "oturduğu arsa (duzada-parseller.geojson); parseller: birden çok arsayı kaplayan sıra ev",
            "arsa": "oturduğu arsanın köşeleri [[boylam, enlem], ...] (kapanış noktası yok); tek harita evin bahçesini "
                    "ve duvarını bununla çizer, arsa dosyasını ayrıca indirmez (23 Kasım, Kemal: ev ve bahçesi birlikte)",
            "kareler": "tabanın kapladığı kareler (duzada-kareler.json kimlikleri)",
            "vikiId": "vikideki maddesi (viki bağlı yapıda)", "ad": "vikideki adı (yalnız viki bağlı yapıda)",
            "bag": "viki: maddesi / madde bağı var; oturan: evde oturanı var (kişiler yalnız kayıtta)",
            "eskiKonum": "eski haritadaki yeri [boylam, enlem]",
            "eskiKonum_": "eski haritada yeri olmayan yapıda null (Kemal'in seçtiği aday yer)",
            "tasima": "nasıl taşındı: yöntem, eski yerin kompakt adadaki karşılığı (hedef) ve yapının ona uzaklığı",
            "bak": "önü bu noktaya bakar (meydana bakan yapılar)",
            "katman": "yapi; iskele ve mendirek: suyun üstündeki liman öğeleri (çokgen; mendirekte ve taş iskelede hat: orta çizgisi)",
        },
        "olculer": {"not": "Hepsi DENEME (Kemal onaylamadı)", "bosOrani": BOS_ORANI, "siraEvEnDar": SIRA_EV_EN_DAR,
                    "siraEvGovdeCarpani": SIRA_EV_GOVDE,
                    "darCephe": DAR_CEPHE, "darYanPay": DAR_YAN_PAY, "onPay": ON_PAY, "yanPay": YAN_PAY, "arkaPay": ARKA_PAY, "evAlanOrani": EV_ALAN_ORANI, "kiyiOrani": KIYI_ORANI,
                    "kiyiYakinM": KIYI_YAKIN_M, "ciftlikOrani": CIFTLIK_ORANI, "depoOrani": DEPO_ORANI,
                    "uzunEvOrani": UZUN_EV_ORANI, "meydanDukkanOrani": MEYDAN_DUKKAN_ORANI, "aramaM": ARAMA_M,
                    "yapiArasi": YAPI_ARASI, "egimViki": EGIM_VIKI, "kiyiEnAz": KIYI_EN_AZ},
        "features": YAPILAR + deniz,
    })


def arsa_koseleri(fc):
    """Evin arsasının köşeleri yapıya yazılır (23 Kasım): tek harita bahçeyi bununla çizer"""
    koseler = {f["properties"]["id"]: f["geometry"]["coordinates"][0][:-1] for f in PF if f["properties"]["katman"] == "parsel"}
    for f in fc["features"]:
        p = f["properties"]
        a = p.get("parsel")
        if p.get("katman") == "yapi" and a in koseler and not p.get("parseller"):
            p["arsa"] = [[round(q[0], 7), round(q[1], 7)] for q in koseler[a]]
    return fc


if __name__ == "__main__":
    fc = uret()
    with open(CIKTI, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    import kompakt_viki_yapilar as VY   # vikinin "Haritada" kutusunun kısa listesi (11. adım)
    VY.yaz(fc)
    from collections import Counter
    print(f"{len(YAPILAR)} yapı yazıldı → {os.path.relpath(CIKTI, KOK)}")
    print("  türe göre:", dict(Counter(f["properties"]["tur"] for f in YAPILAR)))
    print("  mahalleye göre:", dict(Counter(f["properties"]["mahalle"] for f in YAPILAR)))
    print("  boş bırakılan parsel:", SAYAC["bos"], " sığmayan:", SAYAC["sigmadi"], " viki yapısının altında kalan:", SAYAC["viki"])
    for e, p in KAYITLAR:
        print(f"  {e['id']:26s} {(e['ad'] or '(evde oturan)'):26s} {p['tasima']['yontem']:40s} hedeften {p['tasima']['hedeftenM']:6.1f} m  {p['mahalle']}")
    if "mendirek" in DK_ISKELE:
        print("  mendirek:", "kondu" if not DK_ISKELE["mendirek"][2] else "KONMADI (" + ", ".join(DK_ISKELE["mendirek"][2]) + ")")
    print("  eski feribot iskelesi:", "kondu" if not DK_ISKELE.get("feribot") else "KONMADI (" + ", ".join(DK_ISKELE["feribot"]) + ")")
    for e, neden in YERLESEMEYEN:
        print(f"  YERLEŞEMEDİ: {e['id']} ({e['ad']}): {neden}")
