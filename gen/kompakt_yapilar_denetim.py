"""Kompakt Düzada yapılarının denetimi (tek harita, 4. adım).

Bakılanlar:
  - üst üste binme yok (iki yapının tabanı kesişmez; bitişik sıra evlerde ortak duvar değmesi serbest)
  - yola taşma yok (taban hiçbir yolun şeridine girmez; korunan alana ve meydancığa girmez, kendi ayrılan yeri
    hariç; statın sekisinde yalnız viki bağlı yapı durabilir)
  - parsel evi kendi arsasının karelerinin (ya da sıra ev grubunun) dışına taşmaz
  - her yapı karada ve kendi mahallesinde (yazılan mahalle, tabanın merkezinin bulunduğu mahalle)
  - eski haritadaki her viki bağlı yapı ve Kemal'in seçtiği yedi yapı yerleşti
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
from kompakt_taslak_uygula import elle_cikar  # noqa: E402  (KKM Düzenle'nin elle öğeleri bu üretecin girdisi değil)


def main():
    sorun = 0

    def yaz(ad, temiz, deger):
        nonlocal sorun
        sorun += 0 if temiz else 1
        print(f"  [{'temiz' if temiz else 'SORUN'}] {ad}: {deger}")

    dosya = elle_cikar(json.load(open(Y.CIKTI, encoding="utf-8")), "yapilar")   # elle öğeler: gen/kompakt_taslak_denetim.py
    F = [f for f in dosya["features"] if f["properties"]["katman"] == "yapi"]
    DZ = [f for f in dosya["features"] if f["properties"]["katman"] in ("iskele", "mendirek")]
    G = [Y.gm(f["geometry"]) for f in F]
    P = [f["properties"] for f in F]
    print(f"{len(F)} yapı, suyun üstünde {len(DZ)} öğe ({', '.join(f['properties']['id'] for f in DZ) or '-'})")

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
        alan = unary_union([Y.ARSA_ALAN[k] for k in ids]).buffer(0.1)   # arsanın kareleri
        if not alan.contains(g):
            disari.append(P[i]["id"])
    yaz("parsel evi kendi arsasının karelerinin içinde", not disari, disari[:5] or "hepsi")

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

    secilen = [k[0] for k in Y.KEMAL_SECTI if k[0] not in var]
    yaz("Kemal'in seçtiği 7 yapı (aday 1, 21 Kasım) yerleşti", not secilen, f"{len(Y.KEMAL_SECTI) - len(secilen)} / {len(Y.KEMAL_SECTI)}"
        + (f", eksik: {secilen}" if secilen else ""))

    # yalnız KKM'nin modelleri
    katalog = set(Y.IMPERIAL_VE_OZEL) | {d for l in Y.KURUCU.values() for d in l}
    yabanci = sorted({p["dosya"] for p in P if p["dosya"] and (p["dosya"] not in katalog
                      or not os.path.exists(os.path.join(Y.MODELLER, p["dosya"])))})
    yaz("yalnız KKM'nin modelleri", not yabanci, yabanci or f"{len({p['dosya'] for p in P if p['dosya']})} model")

    # iskele ve mendirek (Dondurmacı Kızlar, 22 Kasım): suyun üstünde, yapılara değmez, dükkân iskelenin dibinde
    agac_y = STRtree(G)
    for f in DZ:
        g = Y.gm(f["geometry"])
        yaz(f"{f['properties']['id']} geçerli çokgen", g.is_valid, "geçerli" if g.is_valid else "geçersiz")
        g = g.buffer(0)
        karada = g.intersection(Y.ADA).area / g.area
        degen = [P[j]["id"] for j in agac_y.query(g) if G[j].intersection(g).area > 0.05]
        yaz(f"{f['properties']['id']} suyun üstünde (karada en çok %15), yapıya değmez", karada <= 0.15 and not degen,
            f"karada %{100 * karada:.0f}" + (f", değen: {degen}" if degen else ""))
    isk = next((Y.gm(f["geometry"]).buffer(0) for f in DZ if f["properties"]["katman"] == "iskele"), None)
    dk = next((g for g, p in zip(G, P) if p["id"] == "bina_liman_kafe"), None)
    if isk is not None and dk is not None:
        yaz("Dondurmacı Kızlar iskelenin dibinde (en çok 10 m)", dk.distance(isk) <= 10.0, f"{dk.distance(isk):.1f} m")
    # Liman eski sokaklarıyla (22 Kasım): dükkân #266'daki yerinde; balık yerleri ona eski uzaklıklarının 0,70'ine yakın
    if dk is not None:
        dkm = Y.m(Y.LM.DK_YENI)
        yaz("Dondurmacı Kızlar #266'daki yerinde (en çok 1 m)", dk.centroid.distance(Point(dkm)) <= 1.0,
            f"{dk.centroid.distance(Point(dkm)):.2f} m")
        eski_dk = Point(Y.m(Y.LM.CAPA_ESKI))
        for kim in ("ek_balik_hali", "ek_balik_lokantasi", "bina_liman_ofis"):
            e = next((e for e in Y.ESKI_J["yapilar"] if e["id"] == kim), None)
            g = next((g for g, p in zip(G, P) if p["id"] == kim), None)
            if e is None or g is None:
                yaz(f"{kim} Dondurmacı Kızlar'a eski uzaklığında", False, "yok")
                continue
            eski_u, yeni_u = Point(Y.m(e["eskiKonum"])).distance(eski_dk), g.centroid.distance(dk.centroid)
            hedef_u = Y.LM.ORAN * eski_u
            yaz(f"{e['ad']} Dondurmacı Kızlar'a eski uzaklığının {Y.LM.ORAN:.2f} katında (en çok %20 fark)",
                abs(yeni_u - hedef_u) <= 0.2 * hedef_u, f"eski {eski_u:.0f} m, hedef {hedef_u:.0f} m, yeni {yeni_u:.0f} m")

    # kararlı
    a = json.dumps(Y.uret(), ensure_ascii=False, separators=(",", ":"))
    b = json.dumps(Y.uret(), ensure_ascii=False, separators=(",", ":"))
    c = json.dumps(dosya, ensure_ascii=False, separators=(",", ":"))
    yaz("kararlı çıktı (iki üretim aynı, dosyayla aynı)", a == b == c, "aynı" if a == b == c else "farklı")

    print("sonuç:", "temiz" if not sorun else f"{sorun} sorun")
    return sorun


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
