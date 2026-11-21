"""Kompakt Düzada yapılarının denetimi (tek harita, 4. adım).

Bakılanlar:
  - üst üste binme yok (iki yapının tabanı kesişmez; bitişik sıra evlerde ortak duvar değmesi serbest)
  - yola taşma yok (taban hiçbir yolun şeridine girmez; korunan alana ve meydancığa girmez, kendi ayrılan yeri
    hariç; statın sekisinde yalnız viki bağlı yapı durabilir)
  - parsel evi kendi parselinin (ya da sıra ev grubunun) dışına taşmaz
  - her yapı karada ve kendi mahallesinde (yazılan mahalle, tabanın merkezinin bulunduğu mahalle)
  - eski haritadaki her viki bağlı yapı yerleşti
  - yalnız KKM'nin modelleri (her dosya public/modeller/ altında ve katalogda)
  - kararlı çıktı: üreteç iki kez çalışınca aynı sonuç, dosyadakiyle de aynı

Çalıştırma: python gen/kompakt_yapilar_denetim.py
"""
import json, os, sys

from shapely.geometry import Point, Polygon, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
import kompakt_yapilar as Y  # noqa: E402


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    dosya = json.load(open(Y.CIKTI, encoding="utf-8"))
    F = dosya["features"]
    G = [Y.gm(f["geometry"]) for f in F]
    P = [f["properties"] for f in F]
    print(f"{len(F)} yapı")

    # üst üste binme
    agac = STRtree(G)
    cakisan = []
    for i, g in enumerate(G):
        for j in agac.query(g):
            if j <= i:
                continue
            a = g.intersection(G[j]).area
            if a > 0.05:
                cakisan.append((P[i]["id"], P[j]["id"], round(a, 2)))
    yaz("üst üste binen yapı yok", not cakisan, cakisan[:5] or "yok")

    # yola, korunan alana taşma
    yola = []
    for i, g in enumerate(G):
        for k in Y.YOL_AGACI.query(g):
            a = Y.YOL_ALAN[k].intersection(g).area
            if a > 0.05:
                yola.append((P[i]["id"], Y.YOL[k][0]["id"], round(a, 2)))
    yaz("yol şeridine taşan yapı yok", not yola, yola[:5] or "yok")
    ayrilan = {"bina_imperial", "bina_stad_tribun", "kurucu_bina_mw1zb16h"}
    korunana = [(P[i]["id"], p.get("tur") or p["katman"]) for i, g in enumerate(G) if P[i]["id"] not in ayrilan
                for p, k in Y.KORUNAN if k.intersection(g).area > 0.05
                and not (p.get("tur") == "seki" and P[i].get("bag"))]   # viki yapısı statın sekisinde durabilir
    yaz("korunan alana / meydancığa giren yapı yok", not korunana, korunana[:5] or "yok")

    # parsel içinde
    parsel = {p["id"]: p["g"] for p in Y.PARSELLER}
    disari = []
    for i, g in enumerate(G):
        if P[i].get("bag"):
            continue
        ids = P[i].get("parseller") or [P[i]["parsel"]]
        alan = unary_union([parsel[k] for k in ids]).buffer(0.1)
        if not alan.contains(g):
            disari.append(P[i]["id"])
    yaz("parsel evi parselinin içinde", not disari, disari[:5] or "hepsi")

    # karada, kendi mahallesinde
    denizde = [P[i]["id"] for i, g in enumerate(G) if not Y.ADA.contains(g)]
    yaz("bütün yapılar karada", not denizde, denizde[:5] or "hepsi")
    mah = []
    for i, g in enumerate(G):
        c = g.centroid
        bulunan = next((k for k, mg in Y.MAHALLE.items() if mg.contains(c)), None)
        if bulunan != P[i]["mahalle"]:
            mah.append((P[i]["id"], P[i]["mahalle"], bulunan))
    yaz("her yapı kendi mahallesinde", not mah, mah[:5] or "hepsi")
    eski_mah = [(p["id"], e["mahalle"], p["mahalle"]) for e in Y.ESKI_J["yapilar"] for p in P
                if p["id"] == e["id"] and p["mahalle"] != e["mahalle"]]
    yaz("viki bağlı yapı eski mahallesinde", not eski_mah, eski_mah or "hepsi")

    # viki bağlı her yapı yerleşti
    var = {p["id"] for p in P}
    eksik = [e["id"] for e in Y.ESKI_J["yapilar"] if e["id"] not in var]
    yaz("eski haritadaki viki bağlı her yapı yerleşti", not eksik, f"{len(Y.ESKI_J['yapilar']) - len(eksik)} / "
        f"{len(Y.ESKI_J['yapilar'])}" + (f", eksik: {eksik}" if eksik else ""))

    # yalnız KKM'nin modelleri
    katalog = set(Y.IMPERIAL_VE_OZEL) | {d for l in Y.KURUCU.values() for d in l}
    yabanci = sorted({p["dosya"] for p in P if p["dosya"] and (p["dosya"] not in katalog
                      or not os.path.exists(os.path.join(Y.MODELLER, p["dosya"])))})
    yaz("yalnız KKM'nin modelleri", not yabanci, yabanci or f"{len({p['dosya'] for p in P if p['dosya']})} model")

    # kararlı
    a = json.dumps(Y.uret(), ensure_ascii=False, separators=(",", ":"))
    b = json.dumps(Y.uret(), ensure_ascii=False, separators=(",", ":"))
    c = json.dumps(dosya, ensure_ascii=False, separators=(",", ":"))
    yaz("kararlı çıktı (iki üretim aynı, dosyayla aynı)", a == b == c, "aynı" if a == b == c else "farklı")

    print("sonuç:", "temiz" if not sorun else f"{sorun} sorun")
    return sorun


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
