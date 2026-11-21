"""Hazır gruplar — tek harita, 5. adım (Kemal'in 20 ve 21 Kasım kararları). TASLAK (Kemal onaylamadı).

Çıktı : public/harita/hazir-gruplar.json

Ne üretir:
  Kurucu'nun eski on şablonunun yenisi, altı yeni grup ve açık alan grupları (park, bahçe, meydancık, çeşme
  başı, oyun alanı); her grubun 2–3 çeşidi. Her çeşit 8 m'lik kare ızgaraya oturur (duzada-kareler.json ile
  aynı kare): i yol boyunca, j yoldan içeri. Çeşidin 0. sırası konduğu yola (ya da kıyıya) bitişiktir; grup
  döndürülünce öğeleri yola göre yönlenir. Yerel metre: x = 8·i (yol boyunca), y = 8·j (yoldan içeri).

  Her çeşit kare haritasıyla yazılır (bir harf = bir kare); arsalar haritadan kendiliğinden bölünür, evlerin
  önü arsanın baktığı yola ya da meydana döner. Grup konunca her öğe kendi kaydı olur, iz alanıyla
  (grup: { kimlik, sablon, yerel }); 7. adımdaki yönetim ekranı bunu kullanır. Bu dosya kayda yazmaz.

Kurallar: yalnız KKM'nin kendi modelleri (public/modeller); ad yok (grup adları tür tarifi); ölçüler DENEME.
Kaynaklar: Kems Ajans oneriler/hazir-gruplar/arastirma-20-11-2026.md (K1–K8) ve Kemal'in Pinterest Düzada panosu.

Çalıştırma: python gen/hazir_gruplar.py
Denetim   : python gen/hazir_gruplar_denetim.py
"""
import json, math, os

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
CIKTI = os.path.join(KOK, "public", "harita", "hazir-gruplar.json")

KARE = 8.0  # duzada-kareler.json ile aynı (Kemal: 8 m kalsın)

# ------------------------------------------------------------------ kare harfleri
YOL = {"a": "ara", "s": "sokak", "g": "gecit", "m": "merdiven", "t": "toprak", "p": "patika"}
YOL_GENISLIK = {"ara": 6.0, "sokak": 4.0, "gecit": 2.0, "merdiven": 2.5, "toprak": 4.0, "patika": 1.5}  # 2. adımla aynı
YOL_EGIM = {"ara": 10, "sokak": 15, "toprak": 15, "gecit": 30, "patika": 30, "merdiven": 60}            # % (2. adım; geçit, patika DENEME)
ALAN = {"M": "meydan", "Y": "yesil", "B": "bostan", "Z": "zeytinlik", "V": "bag", "K": "oyun", "O": "otopark",
        "X": "mezarlik", "R": "rihtim", "S": "saha", "P": "pazar", "D": "avlu", ".": "bos"}
ARSA = {"b": "bitisik", "v": "avlulu", "c": "ciftlik", "y": "yazlik", "d": "depo"}
OZEL = "#"
CEPHE_ONCELIK = {"M": 0, "P": 0, "D": 1, "R": 1, "a": 2, "s": 3, "t": 4, "g": 5, "m": 6, "p": 7, "Y": 8, "K": 8, "O": 8, "^": 9}

# Arsa biçimleri (cephe x derinlik, kare). duzada-kareler.json → arsaKare ile aynı aile. DENEME.
ARSA_BICIM = {
    "bitisik": [(1, 2), (1, 1)],
    "avlulu": [(2, 3), (2, 2), (1, 3), (1, 2)],
    "ciftlik": [(3, 3), (3, 2), (2, 3), (2, 2)],
    "yazlik": [(2, 3), (2, 2)],
    "depo": [(2, 2), (3, 2), (2, 1)],
}

# ------------------------------------------------------------------ modeller (yalnız KKM'nin kendileri)
M = {
    "ev_dar": ["binalar/balikci-evi.glb", "binalar/tas-ev.glb", "binalar/cumbali-ev.glb", "binalar/ev-uc-katli.glb"],
    "ev_tas": ["binalar/tas-ev.glb", "binalar/ev-tas-balkonlu.glb", "binalar/ev-tas-dis-merdivenli.glb",
               "binalar/ev-tas-tek-katli.glb", "binalar/koy-evi-dis-merdivenli.glb"],
    "ev_badana": ["binalar/ev-badana-kirma.glb", "binalar/ev-badana-iki-katli.glb", "binalar/ev-badana-dam.glb",
                  "binalar/balikci-evi.glb"],
    "ev_karisik": ["binalar/ev-karisik-cumbali.glb", "binalar/cumbali-ev.glb", "binalar/ev-tas-balkonlu.glb",
                   "binalar/ev-badana-kirma.glb", "binalar/ev-uc-katli.glb"],
    "dukkanli": ["binalar/dukkanli-ev.glb", "binalar/dukkanli-ev-tas.glb", "binalar/dukkanli-ev-iki-dukkan.glb"],
    "ciftlik": ["binalar/ciftlik-evi-tas.glb", "binalar/koy-evi-dis-merdivenli.glb"],
    "yazlik": ["binalar/yazlik.glb", "binalar/yazlik-iki-katli.glb"],
    "depo": ["binalar/depo-atolye.glb"],
}
OZEL_MODEL = {   # tür → model. Özel yapının kendi modeli tür örneği olarak kullanılır; viki maddesine bağlanmaz.
    "kahvehane": "binalar/merkez-kahvehanesi.glb", "kahvehane2": "binalar/kahvehane-meyhane.glb",
    "cami": "binalar/merkez-camii.glb", "kilise": "binalar/eski-kilise.glb", "sapel": "binalar/eski-kilise.glb",
    "okul": "binalar/okul.glb", "saglik": "binalar/saglik-ocagi.glb", "karakol": "binalar/karakol.glb",
    "belediye": "binalar/belediye.glb", "fabrika": "binalar/zeytinyagi-fabrikasi.glb",
    "saraphane": "binalar/depo-atolye.glb", "depo": "binalar/depo-atolye.glb", "tribun": "binalar/tribun.glb",
    "dukkanli": "binalar/dukkanli-ev-iki-dukkan.glb", "ciftlik": "binalar/ciftlik-evi-tas.glb",
    "ev_uzun": "binalar/ev-karisik-uzun.glb", "postane": "binalar/merkez-postanesi.glb",
}
DONATI = {
    "cinar": ("bitkiler/cinar-yasli.glb", 10.6), "zeytin": ("bitkiler/zeytin-yasli.glb", 3.7),
    "servi": ("bitkiler/servi.glb", 9.9), "incir": ("bitkiler/incir.glb", 3.7), "limon": ("bitkiler/limon.glb", 2.5),
    "fistik": ("bitkiler/fistik-cami.glb", 9.1), "begonvil": ("bitkiler/begonvil.glb", 2.6),
    "lavanta": ("bitkiler/lavanta.glb", 0.7), "zakkum": ("bitkiler/cali-zakkum.glb", 1.3),
    "cesme": ("sokak/cesme.glb", 3.6), "bank": ("sokak/bank.glb", 0.9), "lamba": ("sokak/sokak-lambasi.glb", 3.7),
    "tezgah": ("sokak/pazar-tezgahi.glb", 2.4), "cardak": ("bahce/cardak-asmali.glb", 3.1),
    "kuyu": ("bahce/kuyu.glb", 2.2), "oturma": ("bahce/oturma-kosesi.glb", 0.8), "sebze": ("bahce/sebze-tarhi.glb", 1.1),
    "kumes": ("bahce/tavuk-kumesi.glb", 1.4), "odun": ("bahce/odun-yigini.glb", 0.9), "camasir": ("bahce/camasir-ipi.glb", 1.9),
    "sandal": ("deniz/sandal-mavi.glb", 1.0), "sandal2": ("deniz/sandal-yesil.glb", 1.0), "sandal3": ("deniz/sandal-sari.glb", 1.0),
    "cekek": ("deniz/cekek-yeri.glb", 7.2), "kapi": ("bahce/bahce-kapisi-ahsap.glb", 1.7),
}
AGAC_TURLERI = {"cinar", "zeytin", "servi", "incir", "limon", "fistik"}

# ------------------------------------------------------------------ ölçüler (hepsi DENEME)
OLCU = {
    "not": "Hepsi DENEME (Kemal onaylamadı)",
    "bitisikEvDerinlik": 11.0,      # sıra evin derinliği (m); önü sokağa sıfır, arkada avlu
    "avluluOnPay": 1.5,             # avlulu evin sokaktan geri çekilmesi (m)
    "avluluYanPay": 1.0,
    "avluluEvDerinlik": 12.5,
    "ciftlikOnPay": 3.0,
    "yazlikOnPay": 3.0,
    "ozelPay": 1.0,                  # özel yapının kendi karelerinden içeri payı (m)
    "duvarYukseklik": 1.6,
    "siraEvGovdeCarpani": 1.22,     # Kemal 21 Kasım: sıra ev gövdeleri değsin; model tabandan bu kadar geniş (kompakt_yapilar.py ile aynı)
    "dukkanOrani": 0.6,
    "carsiDukkanOrani": 0.85,       # çarşı sokağında ve kordonda             # meydana / pazara bakan sıra evde dükkânlı ev oranı
    "bodrumKotFarki": 1.5,          # taban bu kadardan çok eğimliyse ev kademeli (alt kat yamaca gömülü)
}


# ------------------------------------------------------------------ yardımcılar
def sans(s):
    """FNV-1a tabanlı kararlı rastgele [0, 1)."""
    h = 2166136261
    for ch in s.encode("utf-8"):
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xFFFFFFFF
    h ^= h >> 15
    return h / 4294967296


def sec(s, liste):
    return liste[int(sans(s) * len(liste)) % len(liste)]


YON = {"on": (0, -1), "arka": (0, 1), "sol": (-1, 0), "sag": (1, 0)}
YON_ADI = {v: k for k, v in YON.items()}


def r1(v):
    return round(v, 2)


# ------------------------------------------------------------------ tanımlar
# Her çeşit: harita (satır 0 = yol / kıyı tarafı), ozel (kare dikdörtgeni [i, j, en, boy] + tür + ön yönü),
# donati (tür, x, y kare biriminde), egim (% aralığı; "arka" yöne yükselir), yer (yol | kiyi | serit).
GRUPLAR = [
    # ---------------------------------------------------------- yenilenen on şablon
    {"id": "liman-kasabasi", "ad": "Liman kasabası", "eski": "liman", "ev": "ev_badana",
     "aciklama": "Kıyıda kordon; kordona dizili dükkânlı sıra evler; kordona dik kısa sokaklar, arkada avlulu ikinci sıra.",
     "kaynak": ["K3", "K8"], "ilham": ["iskele 02", "liman 02", "iskele 01"],
     "cesitler": [
         {"c": "a", "tarif": "dik sokaklar", "yer": "kiyi", "egim": [0, 10],
          "harita": ["RRRRRRRRRRRRRR",
                     "bbbbsbbbbbsbbb",
                     "bbbbsbbbbbsbbb",
                     "vvv.svvvv.svvv",
                     "vvv.svvvv.svvv",
                     "vvv.svvvv.svvv",
                     "ttttsttttttttt"],
          "donati": [("lamba", 2, 0.5), ("lamba", 6, 0.5), ("lamba", 10, 0.5), ("bank", 3.2, 0.3), ("bank", 8.2, 0.3),
                     ("sandal", 1.2, -0.4), ("sandal2", 7.5, -0.4), ("begonvil", 4.0, 1.1)]},
         {"c": "b", "tarif": "çift sıra, arka sokak", "yer": "kiyi", "egim": [0, 10],
          "harita": ["RRRRRRRRRRRRRR",
                     "bbbbbbsbbbbbbb",
                     "bbbbbbsbbbbbbb",
                     "sssssssssssssa",
                     "bbbbb.sbbbbb.a",
                     "bbbbb.sbbbbb.a",
                     "vvvv..svvvv..a",
                     "vvvv..svvvv..a",
                     "vvvv..svvvv..a"],
          "donati": [("lamba", 1.5, 0.5), ("lamba", 5, 0.5), ("lamba", 9, 0.5), ("lamba", 12.5, 0.5),
                     ("bank", 3, 0.3), ("bank", 10.5, 0.3), ("sandal3", 4, -0.4), ("sandal", 11, -0.4),
                     ("cinar", 5.5, 4.4)]},
     ]},
    {"id": "koy-meydani", "ad": "Köy meydanı", "eski": "meydan", "ev": "ev_karisik",
     "aciklama": "Meydan çevresinde bitişik evler (kapı meydana), dışa doğru avlulu evler; çınar, çeşme, kahvehane.",
     "kaynak": ["K1", "K2", "K3", "K8"], "ilham": ["merkez 01", "merkez 02", "merkez 03", "pano 05"],
     "cesitler": [
         {"c": "a", "tarif": "çınarlı yıldız", "yer": "yol", "egim": [0, 8],
          "harita": ["vvvvbbbsbbbvvvv",
                     "vvvvbbbsbbbvvvv",
                     "vvvvbbbsbbbvvvv",
                     "bbbbbMMMMMbbbbb",
                     "ssssMMMMMMMssss",
                     "bbbbMMMMMMM##bb",
                     "vvvbbMMMMMM##vv",
                     "vvvvsbbMbbbsvvv",
                     "vvvsvbbsbbvvsvv",
                     "vvsvvvvsvvvvvsv",
                     "vsvvvvvsvvvvvvs",
                     "svvvvvvsvvvvvvv"],
          "ozel": [((11, 5, 2, 2), "kahvehane", "sol")],
          "donati": [("cinar", 7.6, 5.2), ("cesme", 5.4, 4.6), ("bank", 9.2, 6.4), ("bank", 6.4, 6.4),
                     ("begonvil", 10.5, 3.1), ("lamba", 7.5, 3.2), ("lamba", 10.6, 6.6)]},
         {"c": "b", "tarif": "yol genişlemesi", "yer": "yol", "egim": [0, 8],
          "harita": ["vvvbbbsbbbvvvvv",
                     "vvvbbbsbbbvvvvv",
                     "vvvvvbsbvvvvvvv",
                     "bbbbbbMMbbbbbbb",
                     "ssssMMMMMMMMsss",
                     "bbbbMMMMMMMMbbb",
                     "bbbb##bbsbbbbbb",
                     "vvvv##vvsvvvvvv",
                     "vvvvvvvvsvvvvvv",
                     "vvvvvvvvsvvvvvv"],
          "ozel": [((4, 6, 2, 2), "kilise", "on")],
          "donati": [("cinar", 6.5, 4.6), ("cinar", 9.5, 4.7), ("cesme", 8.0, 4.5), ("bank", 5.3, 5.6),
                     ("bank", 10.7, 5.6), ("lamba", 7.0, 3.3)]},
         {"c": "c", "tarif": "üçgen kavşak", "yer": "yol", "egim": [0, 8],
          "harita": ["vvvbbbbsbbbbvvv",
                     "vvvbbbbsbbbbvvv",
                     "vvvvbbbMbbbvvvv",
                     "vvvv##MMMbbbvvv",
                     "vvvv##MMMMbbvvv",
                     "vvvbbMMMMMMbbvv",
                     "vvvvsbbbbbbsvvv",
                     "vvvsvbbbbbbvsvv",
                     "vvsvvvvvvvvvvsv",
                     "vsvvvvvvvvvvvvs"],
          "ozel": [((4, 3, 2, 2), "kahvehane", "sag")],
          "donati": [("cinar", 7.9, 4.5), ("cesme", 9.4, 5.4), ("bank", 6.8, 5.6), ("begonvil", 6.6, 3.1), ("lamba", 7.5, 2.9)]},
     ]},
    {"id": "daginik-ciftlik", "ad": "Dağınık çiftlik", "eski": "ciftlik", "ev": "ev_tas",
     "aciklama": "Toprak yol ucunda çakıllı avlulu taş ev ve ek binalar; zeytinlik, bağ, bostan; sınırda taş duvar.",
     "kaynak": ["K1"], "ilham": ["çiftlik 02", "çiftlik 01", "pano 13"],
     "cesitler": [
         {"c": "a", "tarif": "tek avlu, zeytinlik", "yer": "yol", "egim": [0, 15],
          "harita": ["ZZZZtZZZZ",
                     "ZZZZtZZZZ",
                     "ZZZZtZZZZ",
                     "ZZZDDDBBZ",
                     "ZZZ###BBZ",
                     "ZZZ###ddZ",
                     "ZZZ###ddZ",
                     "ZZZZZZZZZ"],
          "ozel": [((3, 4, 3, 3), "ciftlik", "on")],
          "donati": [("kuyu", 5.4, 3.5), ("odun", 3.3, 3.6), ("kumes", 7.6, 4.7), ("incir", 3.6, 3.3),
                     ("oturma", 4.0, 3.4)]},
         {"c": "b", "tarif": "iki avlu, bağ ve bostan", "yer": "yol", "egim": [0, 15],
          "harita": ["VVVVVtZZZZZZ",
                     "VVVVVtZZZZZZ",
                     "VVVVVttttttZ",
                     "VVcccDDBBccc",
                     "VVcccDDBBccc",
                     "VVcccZZZZccc",
                     "VVVVVZZZZZZZ"],
          "donati": [("kuyu", 6.0, 3.5), ("zeytin", 5.5, 4.2)]},
     ]},
    {"id": "stat-cevresi", "ad": "Stat çevresi", "eski": "stat", "ev": "ev_karisik",
     "aciklama": "Statın yanına: otopark, ağaç sırası, alçak ev dizisi; ya da tribünlü küçük mahalle sahası.",
     "kaynak": [], "ilham": ["stadyum 01", "stadyum 04", "liman 01"],
     "cesitler": [
         {"c": "a", "tarif": "otopark ve ağaç sırası", "yer": "yol", "egim": [0, 8],
          "harita": ["YYYYYaaYYYYY",
                     "OOOOOaaOOOOO",
                     "OOOOOaaOOOOO",
                     "YYYYYaaYYYYY",
                     "ssssssssssss",
                     "bbbbbbbbbbbb",
                     "bbbbbbbbbbbb"],
          "donati": [(("fistik" if k % 2 else "cinar"), 0.5 + k, 0.5) for k in range(12) if k not in (5, 6)]
                    + [("fistik", 0.5 + k, 3.5) for k in range(0, 12, 2) if k not in (5, 6)] + [("lamba", 3, 1.5), ("lamba", 9, 1.5)]},
         {"c": "b", "tarif": "mahalle sahası", "yer": "yol", "egim": [0, 5],
          "harita": ["YYYYYYYYYY",
                     "##########",
                     "##########",
                     "SSSSSSSSSS",
                     "SSSSSSSSSS",
                     "SSSSSSSSSS",
                     "SSSSSSSSSS",
                     "YYYYYYYYYY"],
          "ozel": [((0, 1, 10, 2), "tribun", "arka")],
          "donati": [("servi", 0.4 + k, 7.5) for k in range(10)] + [("bank", 2, 0.5), ("bank", 7, 0.5)]},
     ]},
    {"id": "tepe-koyu", "ad": "Tepe köyü", "eski": "tepe", "ev": "ev_tas",
     "aciklama": "Yamaçta sık taş evler; yamaca göre üç çeşit. Evler farklı kotlardan girilir, alt kat yamaca gömülü.",
     "kaynak": ["K1", "K2", "K4", "K6"], "ilham": ["iskele 01", "iskele 03", "pano 01", "pano 16"],
     "cesitler": [
         {"c": "a", "tarif": "eş yükselti sokakları", "yer": "yol", "egim": [15, 25],
          "harita": ["bbbbbbbmbbbbbb",
                     "bbbbbbbmbbbbbb",
                     "vvvvvvvmvvvvvv",
                     "vvvvvvvmvvvvvv",
                     "vvvvvvvmvvvvvv",
                     "ssssssssssssss",
                     "bbbmbbbbbbbbbb",
                     "bbbmbbbbbbbbbb",
                     "vvvmvvvvvvvvvv",
                     "vvvmvvvvvvvvvv",
                     "ssssssssssssss",
                     "bbbbbMMMbbbbbb",
                     "ZZZZZ###ZZZZZZ",
                     "ZZZZZ###ZZZZZZ",
                     "ZZZZZ###ZZZZZZ"],
          "ozel": [((5, 12, 3, 3), "cami", "on")],
          "donati": [("cinar", 5.6, 11.5), ("cesme", 7.6, 11.4), ("servi", 4.6, 12.4), ("servi", 8.4, 12.4)]},
         {"c": "b", "tarif": "sırt omurgası", "yer": "yol", "egim": [8, 14],
          "harita": ["vvvvbbsbbvvvv",
                     "vvvvbbsbbvvvv",
                     "ggggggsgggggg",
                     "vvvvbbsbbvvvv",
                     "vvvvbbsbbvvvv",
                     "vvggggsggggvv",
                     "vvvvbbsbbvvvv",
                     "vvvvbbsbbvvvv",
                     "vvvvbMMMbvvvv",
                     "....bM##b...."],
          "ozel": [((6, 9, 2, 1), "sapel", "on")],
          "donati": [("cinar", 5.6, 8.6), ("cesme", 7.4, 8.4), ("servi", 8.3, 9.6), ("servi", 4.7, 9.6)]},
         {"c": "c", "tarif": "zikzak yol, basamaklı ara", "yer": "yol", "egim": [15, 21],
          "harita": ["vvvvvvvvvvvvvs",
                     "vvvvvvvvvvvvs.",
                     "..ssssssssss..",
                     ".sbbbbbmbbbbb.",
                     "s.vvvvvmvvvvv.",
                     ".svvvvvmvvvvv.",
                     "..sssssssssss.",
                     "vvbbbbbmbbbbbs",
                     "vvbbbbbmbbbbMM",
                     "ZZZZZZZmZZZZMM"],
          "donati": [("cinar", 12.9, 8.9), ("cesme", 13.5, 8.3), ("servi", 0.6, 7.5), ("servi", 0.6, 8.5)]},
     ]},
    {"id": "sahil-yazliklari", "ad": "Sahil yazlıkları", "eski": "sahil", "ev": "ev_badana",
     "aciklama": "Kıyıya koşut yolun deniz yanında geniş bahçeli yazlıklar; aralarda denize inen dar geçitler.",
     "kaynak": ["K4"], "ilham": ["iskele 03", "pano 12"],
     "cesitler": [
         {"c": "a", "tarif": "tek sıra, geçitli", "yer": "yol", "egim": [0, 12], "arka": "kiyi",
          "harita": ["yyyyyygyyyyyygyyyy",
                     "yyyyyygyyyyyygyyyy",
                     "yyyyyygyyyyyygyyyy",
                     "YYYYYYgYYYYYYgYYYY"],
          "donati": [("servi", 0.3, 0.3), ("servi", 17.7, 0.3), ("zakkum", 6.0, 0.3), ("zakkum", 13.0, 0.3)]},
         {"c": "b", "tarif": "çift sıra, kıyı patikası", "yer": "yol", "egim": [0, 12], "arka": "kiyi",
          "harita": ["yyyyyysyyyyyy",
                     "yyyyyysyyyyyy",
                     "yyyyyysyyyyyy",
                     "pppppppppppps",
                     "yyyyyypyyyyyy",
                     "yyyyyypyyyyyy",
                     "YYYYYYpYYYYYY"],
          "donati": [("fistik", 4.5, 6.5), ("zakkum", 3, 3.5), ("zakkum", 10, 3.5)]},
     ]},
    {"id": "balikci-mahallesi", "ad": "Balıkçı mahallesi", "eski": "balikci", "ev": "ev_badana",
     "aciklama": "Kıyıda çekek yeri ve sandallar; kıyıya inen merdivenli geçitler; dar sokaklarda sık küçük evler.",
     "kaynak": ["K4", "K6"], "ilham": ["iskele 02", "liman 03", "pano 12"],
     "cesitler": [
         {"c": "a", "tarif": "çekek yeri ve merdivenler", "yer": "kiyi", "egim": [5, 18],
          "harita": ["RRRRRRRRRRRR",
                     "bbbmbbbbmbbb",
                     "bbbmbbbbmbbb",
                     "ssssssssssss",
                     "bbbbbmbbbbbb",
                     "vvvvvmvvvvvv",
                     "ssssssssssss"],
          "donati": [("cekek", 1.2, -0.7), ("sandal", 4.5, -0.3), ("sandal2", 6.0, -0.3), ("sandal3", 10, -0.3),
                     ("bank", 7, 0.3), ("camasir", 9.6, 2.7)]},
         {"c": "b", "tarif": "kıyı boyu tek dizi", "yer": "kiyi", "egim": [0, 12],
          "harita": ["RRRRRRRRRRRRRR",
                     "RRRRRRRRRRRRRR",
                     "bbbbgbbbbbgbbb",
                     "bbbbgbbbbbgbbb",
                     "ttttttttttttta"],
          "donati": [("sandal", 1.5, 0.5), ("sandal2", 3, 0.6), ("sandal3", 8, 0.5), ("sandal", 12, 0.6),
                     ("cekek", 6.2, -0.7), ("lamba", 4, 1.6), ("lamba", 10, 1.6), ("bank", 5.5, 1.6)]},
     ]},
    {"id": "kamu-cevresi", "ad": "Kamu çevresi", "eski": "kamu", "ev": "ev_karisik",
     "aciklama": "Küçük ağaçlı meydanın çevresinde okul, sağlık ocağı, karakol; ya da yol boyunca kamu yapıları.",
     "kaynak": [], "ilham": ["merkez 01", "liman 01"],
     "cesitler": [
         {"c": "a", "tarif": "ağaçlı meydan çevresi", "yer": "yol", "egim": [0, 8],
          "harita": ["####sMMs####",
                     "####MMMM####",
                     "####MMMM####",
                     "bbbbMMMM####",
                     "bbbbssss####",
                     "vvvvvvvvvvvv"],
          "ozel": [((0, 0, 4, 3), "okul", "sag"), ((8, 0, 4, 2), "saglik", "sol"), ((8, 2, 4, 3), "karakol", "sol")],
          "donati": [("cinar", 5.3, 1.6), ("cinar", 6.8, 2.6), ("bank", 6.0, 0.8), ("bank", 5.0, 3.3),
                     ("lamba", 4.2, 0.2), ("lamba", 7.8, 0.2)]},
         {"c": "b", "tarif": "yol boyu", "yer": "yol", "egim": [0, 8],
          "harita": ["YYYsYYYYYsYYYYYY",
                     "###s####Ms######",
                     "###s####Ms######",
                     "vvvsvvvvvsvvvvvv"],
          "ozel": [((0, 1, 3, 2), "belediye", "on"), ((4, 1, 4, 2), "okul", "on"), ((10, 1, 3, 2), "saglik", "on"),
                   ((13, 1, 3, 2), "postane", "on")],
          "donati": [("fistik", 0.5 + 2 * k, 0.5) for k in range(8)] + [("bank", 8.4, 1.5)]},
     ]},
    {"id": "liman-arkasi", "ad": "Liman arkası", "eski": "liman-arkasi", "ev": "ev_badana",
     "aciklama": "Depo ve atölye arsaları, yük yolu ve manevra alanı, kapalı arka avlular.",
     "kaynak": [], "ilham": ["liman 01"],
     "cesitler": [
         {"c": "a", "tarif": "depo dizisi, manevra alanı", "yer": "yol", "egim": [0, 8],
          "harita": ["dddOOOdddddd",
                     "dddOOOdddddd",
                     "aaaaaaaaaaaa",
                     "dddddddddddd",
                     "dddddddddddd"],
          "donati": [("lamba", 4, 1.5)]},
         {"c": "b", "tarif": "atölye avluları", "yer": "yol", "egim": [0, 8],
          "harita": ["ddDDddDDdd",
                     "ddDDddDDdd",
                     "bbsbbbsbbb",
                     "bbsbbbsbbb"],
          "donati": [("odun", 2.5, 0.8), ("odun", 6.5, 1.2)]},
     ]},
    {"id": "bag-evleri", "ad": "Bağ evleri", "eski": "bag", "ev": "ev_tas",
     "aciklama": "Toprak yolun iki yanında büyük bağ parselleri; parsel köşesinde tek katlı taş ev; patikalar.",
     "kaynak": ["K1"], "ilham": ["çiftlik 03", "pano 15"],
     "cesitler": [
         {"c": "a", "tarif": "toprak yol, köşe evleri", "yer": "yol", "egim": [0, 15],
          "harita": ["vvVVVVtVVVVvv",
                     "vvVVVVtVVVVvv",
                     "VVVVVVtVVVVVV",
                     "VVVVVVtVVVVVV",
                     "VVVVvvtvvVVVV",
                     "VVVVvvtvvVVVV",
                     "VVVVVVpVVVVVV"],
          "donati": [("zeytin", 5.5, 3.5), ("zeytin", 7.5, 2.5)]},
         {"c": "b", "tarif": "patikalı, zeytin sınırlı", "yer": "yol", "egim": [0, 18],
          "harita": ["vvZVVVVVpVVVV",
                     "vvZVVVVVpVVVV",
                     "ZZZVVVVVpVVVV",
                     "VVVVVVVVppppv",
                     "VVVVVVVVVVVVv",
                     "ZZZZZZZZZZZZZ"],
          "donati": []},
     ]},
    # ---------------------------------------------------------- altı yeni grup (20 Kasım)
    {"id": "zeytinyagi-fabrikasi", "ad": "Zeytinyağı fabrikası çevresi", "ev": "ev_tas",
     "aciklama": "Fabrika ve önünde yük avlusu, yanında depo; yolun karşısında işçi evleri dizisi; arkada zeytinlik.",
     "kaynak": ["künye: iki fabrika (İskele'de eski, Çiftlik'te kooperatif)"], "ilham": ["çiftlik 02", "pano 14"],
     "cesitler": [
         {"c": "a", "tarif": "avlu ve işçi evleri", "yer": "yol", "egim": [0, 8],
          "harita": ["DDDDDDDDdd",
                     "#####DDDdd",
                     "#####DDDdd",
                     "#####DDDdd",
                     "ssssssssss",
                     "bbbbbbbbbb",
                     "bbbbbbbbbb"],
          "ozel": [((0, 1, 5, 3), "fabrika", "sag")],
          "donati": [("zeytin", 6.5, 0.5), ("zeytin", 9.5, 0.5), ("lamba", 5.5, 4.2)]},
         {"c": "b", "tarif": "zeytinlik içinde", "yer": "yol", "egim": [0, 12],
          "harita": ["ZZZtZZZZZZ",
                     "ZZZtZZZZZZ",
                     "ZZvtDDDDZZ",
                     "ZZvt#####Z",
                     "ZZZt#####Z",
                     "ZZZt#####Z",
                     "ZZZZZZZZZZ"],
          "ozel": [((4, 3, 5, 3), "fabrika", "on")],
          "donati": []},
     ]},
    {"id": "kilise-sapel", "ad": "Eski kilise ve şapel çevresi", "ev": "ev_tas",
     "aciklama": "Kilise ve önünde taş döşeli avlu, servi; dar sokaklar; ya da bağ içinde tek başına şapel.",
     "kaynak": ["künye: İskele'de boş duran eski kilise"], "ilham": ["çiftlik 03", "pano 16", "pano 15"],
     "cesitler": [
         {"c": "a", "tarif": "avlulu kilise, dar sokaklar", "yer": "yol", "egim": [0, 12],
          "harita": ["vvvbbgDDDDgbbvv",
                     "vvvbbgD###gbbvv",
                     "vvvvvgD###gvvvv",
                     "vvvvvgD###gvvvv",
                     "vvvvvgggggggvvv"],
          "ozel": [((7, 1, 3, 3), "kilise", "on")],
          "donati": [("servi", 6.4, 0.5), ("servi", 6.4, 3.5), ("servi", 9.6, 0.3), ("zeytin", 8.5, 0.5),
                     ("bank", 7.5, 0.3)]},
         {"c": "b", "tarif": "bağ içinde şapel", "yer": "yol", "egim": [0, 18],
          "harita": ["VVVVpVVVV",
                     "VVVVpVVVV",
                     "VVVDDDVVV",
                     "VVVD##VVV",
                     "VVVVVVVVV"],
          "ozel": [((4, 3, 2, 1), "sapel", "on")],
          "donati": [("zeytin", 3.4, 2.4), ("servi", 6.6, 3.3), ("servi", 3.3, 3.6)]},
     ]},
    {"id": "cami-kahvehane", "ad": "Cami ve kahvehane meydanı", "ev": "ev_karisik",
     "aciklama": "Cami avlusu ve çeşme (şadırvan), karşısında meydana bakan kahvehane, ortada çınar.",
     "kaynak": ["K2", "künye: Merkez'de cami ve kahvehane"], "ilham": ["merkez 01", "merkez 03"],
     "cesitler": [
         {"c": "a", "tarif": "avlulu cami, çınarlı meydan", "yer": "yol", "egim": [0, 8],
          "harita": ["bbbbMMMMMbbbb",
                     "bbbbMMMMM##bb",
                     "vvvvDDDDDsvvv",
                     "vvvv####Dsvvv",
                     "vvvv####Dsvvv",
                     "vvvv####Dsvvv",
                     "vvvvvvvvvsvvv"],
          "ozel": [((4, 3, 4, 3), "cami", "on"), ((9, 1, 2, 1), "kahvehane", "sol")],
          "donati": [("cinar", 6.5, 0.9), ("cesme", 6.0, 2.4), ("bank", 5.0, 1.5), ("bank", 8.0, 0.5),
                     ("servi", 8.5, 2.5), ("servi", 8.5, 5.5)]},
         {"c": "b", "tarif": "yol üstü, karşılıklı", "yer": "yol", "egim": [0, 8],
          "harita": ["bbb###MMM##bbb",
                     "bbb###MMM##bbb",
                     "bbb###MMMbbbbb",
                     "vvvvvvsvvvvvvv",
                     "vvvvvvsvvvvvvv"],
          "ozel": [((3, 0, 3, 3), "cami", "sag"), ((9, 0, 2, 2), "kahvehane", "sol")],
          "donati": [("cinar", 7.5, 1.0), ("cesme", 6.4, 2.2), ("bank", 8.5, 2.3)]},
     ]},
    {"id": "carsi-sokagi", "ad": "Çarşı sokağı", "ev": "ev_karisik",
     "aciklama": "İki yanı bitişik dükkânlı evler; sokağın ucunda haftalık pazar alanı; lamba ve bank dizisi.",
     "kaynak": ["K3", "K8", "künye: çarşıda kahvehane, bakkal, fırın; haftada bir pazar"],
     "ilham": ["liman 02", "merkez 02", "merkez 03", "iskele 01"],
     "cesitler": [
         {"c": "a", "tarif": "düz çarşı, uçta pazar", "yer": "yol", "egim": [0, 8],
          "harita": ["bbbsbbb",
                     "bbbsbbb",
                     "bbbsbbb",
                     "bbbsbbb",
                     "bbbsbbb",
                     "bbbsbbb",
                     "PPPPPPP",
                     "PPPPPPP",
                     "vvvvvvv"],
          "donati": [("lamba", 3.5, 0.6), ("lamba", 3.5, 2.6), ("lamba", 3.5, 4.6), ("bank", 3.2, 1.6),
                     ("bank", 3.8, 3.6), ("cinar", 3.5, 7.0), ("begonvil", 2.95, 3.0)]
                    + [("tezgah", 0.6 + 1.2 * k, 6.4) for k in range(6)] + [("tezgah", 0.6 + 1.2 * k, 7.6) for k in range(6) if k != 3]},
         {"c": "b", "tarif": "kıvrık çarşı, ortada pazar", "yer": "yol", "egim": [0, 10],
          "harita": ["bbbsbbbbb",
                     "bbbsbbbbb",
                     "bbbbsbbbb",
                     "bbPPPPPbb",
                     "bbPPPPPbb",
                     "bbbbbsbbb",
                     "bbbbbbsbb",
                     "vvvvvvsvv"],
          "donati": [("tezgah", 2.6 + 1.1 * k, 3.4) for k in range(4)] + [("tezgah", 2.6 + 1.1 * k, 4.6) for k in range(4)]
                    + [("cesme", 4.5, 4.0), ("lamba", 3.5, 0.5), ("lamba", 4.5, 2.5), ("lamba", 5.5, 5.5)]},
     ]},
    {"id": "mezarlik-zeytinlik", "ad": "Mezarlık ve zeytinlik kenarı", "ev": "ev_tas",
     "aciklama": "Taş duvarla çevrili mezarlık, servi sırası; zeytinlik yolu.",
     "kaynak": ["künye: mezarlık Merkez'in dışında, zeytinliklerde"], "ilham": ["pano 16"],
     "cesitler": [
         {"c": "a", "tarif": "duvarlı mezarlık, servi sırası", "yer": "yol", "egim": [0, 15],
          "harita": ["ZtZXXXXXXZZZ",
                     "ZtZXXXXXXZZZ",
                     "ZtZXXXXXXZZZ",
                     "ZtZXXXXXXZZZ",
                     "tttttttttttt",
                     "ZZZZZZZZZZZZ"],
          "donati": [("servi", 3.3 + 0.9 * k, 0.3) for k in range(7)] + [("servi", 3.3 + 0.9 * k, 3.7) for k in range(7)]
                    + [("kapi", 6.0, 0.05)]},
         {"c": "b", "tarif": "küçük mezarlık, yol ağzı", "yer": "yol", "egim": [0, 15],
          "harita": ["XXXXtZZZZ",
                     "XXXXtZZZZ",
                     "XXXXtZZZZ",
                     "ZZZZtZZZZ"],
          "donati": [("servi", 0.3, 0.3), ("servi", 3.7, 0.3), ("servi", 0.3, 2.7), ("servi", 3.7, 2.7), ("servi", 2.0, 1.5),
                     ("kapi", 2.0, 0.05)]},
     ]},
    {"id": "saraphane-avlusu", "ad": "Şaraphane avlusu", "ev": "ev_tas",
     "aciklama": "Taş çiftlik evi ve şaraphane binası ortak avluya bakar; çevresi bağ.",
     "kaynak": ["künye: Çiftlik'te küçük aile şaraphaneleri"], "ilham": ["çiftlik 01", "çiftlik 02", "çiftlik 03"],
     "cesitler": [
         {"c": "a", "tarif": "ev ve şaraphane karşılıklı", "yer": "yol", "egim": [0, 12],
          "harita": ["VVVVtVVVV",
                     "VVVVtVVVV",
                     "VV##DD##V",
                     "VV##DD##V",
                     "VVDDDDDDV",
                     "VVVVVVVVV"],
          "ozel": [((2, 2, 2, 2), "ciftlik", "sag"), ((6, 2, 2, 2), "saraphane", "sol")],
          "donati": [("cardak", 4.5, 4.3), ("oturma", 4.0, 4.6), ("zeytin", 5.5, 3.0), ("kuyu", 3.0, 4.5)]},
         {"c": "b", "tarif": "U avlu", "yer": "yol", "egim": [0, 12],
          "harita": ["VVVVtVVVVVV",
                     "VVVVtVVVVVV",
                     "VV##DDDD##V",
                     "VV##DDDD##V",
                     "VV##DDDD##V",
                     "VV########V",
                     "VV########V",
                     "VVVVVVVVVVV"],
          "ozel": [((2, 2, 2, 3), "saraphane", "sag"), ((8, 2, 2, 3), "depo", "sol"), ((2, 5, 8, 2), "ev_uzun", "on")],
          "donati": [("cardak", 6.0, 3.6), ("zeytin", 5.0, 4.4), ("oturma", 6.6, 4.2), ("kuyu", 7.2, 2.6)]},
     ]},
    # ---------------------------------------------------------- açık alan grupları (21 Kasım: boş kareler)
    {"id": "park", "ad": "Park", "ev": None,
     "aciklama": "Boş karelere: çimen, ağaç kümeleri, yürüyüş yolu, banklar, lambalar.",
     "kaynak": [], "ilham": ["stadyum 04", "liman 01", "merkez 01"],
     "cesitler": [
         {"c": "a", "tarif": "patikalı çimen", "yer": "serit", "egim": [0, 15],
          "harita": ["YYpYYY",
                     "YYpppY",
                     "YYYYpY",
                     "YYYYpY"],
          "donati": [("cinar", 0.8, 0.9), ("fistik", 4.6, 0.6), ("zeytin", 1.2, 3.0), ("zeytin", 3.0, 3.2),
                     ("servi", 5.6, 3.5), ("bank", 2.5, 1.3), ("bank", 4.0, 2.3), ("lamba", 2.0, 0.2), ("lamba", 4.0, 1.6)]},
         {"c": "b", "tarif": "ağaç sıralı dikdörtgen", "yer": "serit", "egim": [0, 10],
          "harita": ["YYYYYYYY",
                     "YYYYYYYY",
                     "YYYYYYYY"],
          "donati": [("cinar", 0.5 + k, 0.5) for k in range(8)] + [("fistik", 0.5 + k, 2.5) for k in range(0, 8, 2)]
                    + [("bank", 1.5 + 2 * k, 1.5) for k in range(4)] + [("lamba", 1 + 2 * k, 1.05) for k in range(4)]},
         {"c": "c", "tarif": "sekili yamaç parkı", "yer": "serit", "egim": [12, 30], "seki": True,
          "harita": ["YYmYY",
                     "YYmYY",
                     "YYmYY",
                     "YYmYY"],
          "donati": [("zeytin", 0.6, 0.5), ("zeytin", 4.3, 1.5), ("servi", 0.4, 2.5), ("fistik", 3.8, 3.4), ("cinar", 1.0, 3.4),
                     ("bank", 1.6, 1.4), ("bank", 3.4, 2.4), ("bank", 1.6, 3.5), ("lavanta", 3.6, 0.5), ("lavanta", 0.8, 1.6),
                     ("lamba", 2.4, 0.15), ("lamba", 2.4, 2.0)]},
     ]},
    {"id": "bahce", "ad": "Bahçe", "ev": None,
     "aciklama": "Boş karelere duvarlı bahçe: bostan, meyve bahçesi ya da zeytinli bahçe.",
     "kaynak": ["K1"], "ilham": ["çiftlik 01", "iskele 03", "pano 13"],
     "cesitler": [
         {"c": "a", "tarif": "bostan", "yer": "serit", "egim": [0, 15], "duvar": True,
          "harita": ["BBB",
                     "BBB",
                     "BBB"],
          "donati": [("kuyu", 2.5, 0.5), ("kumes", 0.6, 2.5), ("incir", 2.5, 2.5)]},
         {"c": "b", "tarif": "meyve bahçesi, çardaklı", "yer": "serit", "egim": [0, 15], "duvar": True,
          "harita": ["YYYY",
                     "YYYY",
                     "YYYY"],
          "donati": [("limon", 0.5 + k, 0.6) for k in range(4)] + [("incir", 0.7, 2.3), ("limon", 3.3, 2.4),
                     ("cardak", 2.0, 2.1), ("oturma", 2.0, 2.6), ("begonvil", 2.0, 0.05)]},
         {"c": "c", "tarif": "sekili zeytin ve bostan", "yer": "serit", "egim": [10, 30], "seki": True,
          "harita": ["BBBp",
                     "ZZZp",
                     "ZZZp"],
          "donati": [("kuyu", 3.5, 0.4), ("odun", 3.6, 2.6)]},
     ]},
    {"id": "meydancik", "ad": "Meydancık", "ev": None,
     "aciklama": "Sokak ağzında küçük taş döşeli alan; çınar, bank.",
     "kaynak": ["K2"], "ilham": ["merkez 01", "merkez 03"],
     "cesitler": [
         {"c": "a", "tarif": "çınar ve bank", "yer": "serit", "egim": [0, 8],
          "harita": ["MM",
                     "MM"],
          "donati": [("cinar", 1.0, 1.0), ("bank", 0.4, 1.6), ("bank", 1.6, 0.5), ("lamba", 0.2, 0.2)]},
         {"c": "b", "tarif": "köşe meydancığı, çeşmeli", "yer": "serit", "egim": [0, 8],
          "harita": ["MMM",
                     "MMM"],
          "donati": [("cinar", 2.2, 0.9), ("cesme", 0.9, 1.6), ("bank", 1.5, 0.4), ("begonvil", 0.2, 1.9)]},
     ]},
    {"id": "cesme-basi", "ad": "Çeşme başı", "ev": None,
     "aciklama": "Taş çeşme ve önünde döşeli alan; ağaç, bank; pazar günü tezgâh.",
     "kaynak": ["K2"], "ilham": ["merkez 03"],
     "cesitler": [
         {"c": "a", "tarif": "duvara yaslı çeşme", "yer": "serit", "egim": [0, 12],
          "harita": ["MM",
                     "YY"],
          "donati": [("cesme", 1.0, 1.0), ("cinar", 1.6, 1.5), ("bank", 0.4, 0.6)]},
         {"c": "b", "tarif": "ortada çeşme, tezgâhlı", "yer": "serit", "egim": [0, 8],
          "harita": ["MMM",
                     "MMM",
                     "MMM"],
          "donati": [("cesme", 1.5, 1.5), ("tezgah", 0.4, 0.5), ("tezgah", 0.4, 2.5), ("tezgah", 2.6, 2.5),
                     ("bank", 2.6, 0.5), ("begonvil", 1.5, 2.95), ("lamba", 2.9, 1.5)]},
     ]},
    {"id": "oyun-alani", "ad": "Oyun alanı", "ev": None,
     "aciklama": "Kum alanı ya da küçük top sahası; ağaç gölgesi, bank. Oyun aleti modeli yok.",
     "kaynak": [], "ilham": ["stadyum 04"],
     "cesitler": [
         {"c": "a", "tarif": "kum alanı", "yer": "serit", "egim": [0, 8],
          "harita": ["YKKY",
                     "YKKY",
                     "YYYY"],
          "donati": [("cinar", 0.5, 0.5), ("fistik", 3.5, 2.5), ("bank", 0.5, 1.6), ("bank", 3.5, 0.6),
                     ("lamba", 2.0, 2.5)]},
         {"c": "b", "tarif": "küçük top sahası", "yer": "serit", "egim": [0, 5],
          "harita": ["SSSSY",
                     "SSSSY",
                     "SSSSY"],
          "donati": [("cinar", 4.5, 0.5), ("cinar", 4.5, 2.5), ("bank", 4.4, 1.5)]},
     ]},
]
ESKI_SABLON = {"liman", "meydan", "ciftlik", "stat", "tepe", "sahil", "balikci", "kamu", "liman-arkasi", "bag"}


# ------------------------------------------------------------------ üretici
def uret_cesit(g, c):
    sid = f"{g['id']}/{c['c']}"
    H = c["harita"]
    D, W = len(H), len(H[0])
    assert all(len(r) == W for r in H), f"{sid}: satırlar eşit değil"

    def harf(i, j):
        if j == -1 and 0 <= i < W:
            return "^"        # konduğu yol / kıyı
        if 0 <= i < W and 0 <= j < D:
            return H[j][i]
        return None

    ogeler = []
    sayac = {}

    def yerel(on):
        sayac[on] = sayac.get(on, 0) + 1
        return f"{on}{sayac[on]}"

    # --- yollar: aynı kademenin komşu kareleri; çapraz yalnız dik komşu yoksa
    yol_kare = {(i, j): YOL[H[j][i]] for j in range(D) for i in range(W) if H[j][i] in YOL}
    gorulen = set()
    for k0 in sorted(yol_kare, key=lambda k: (k[1], k[0])):
        if k0 in gorulen:
            continue
        kademe = yol_kare[k0]
        kume, yigin = [], [k0]
        gorulen.add(k0)
        while yigin:
            k = yigin.pop()
            kume.append(k)
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    n = (k[0] + di, k[1] + dj)
                    if (di or dj) and n not in gorulen and yol_kare.get(n) == kademe:
                        if di and dj and (yol_kare.get((k[0] + di, k[1])) or yol_kare.get((k[0], k[1] + dj))):
                            continue
                        gorulen.add(n)
                        yigin.append(n)
        kume_s = set(kume)
        kenar, uclar = [], []
        for k in sorted(kume):
            for di, dj in ((1, 0), (0, 1), (1, 1), (-1, 1)):
                n = (k[0] + di, k[1] + dj)
                if n not in kume_s:
                    continue
                if di and dj and ((k[0] + di, k[1]) in yol_kare or (k[0], k[1] + dj) in yol_kare):
                    continue
                kenar.append([[k[0] * KARE + 4, k[1] * KARE + 4], [n[0] * KARE + 4, n[1] * KARE + 4]])
        # uçlar: konduğu yola, meydana ya da başka yola bağlanan kenarlar
        for k in sorted(kume):
            for di, dj in ((0, -1), (1, 0), (0, 1), (-1, 0)):
                n = (k[0] + di, k[1] + dj)
                h = harf(*n)
                dar = h in YOL and YOL[h] != kademe and YOL_GENISLIK[YOL[h]] >= YOL_GENISLIK[kademe]
                if h == "^" or dar or h in ("M", "P", "R", "D", "O"):
                    a = [k[0] * KARE + 4, k[1] * KARE + 4]
                    uclar.append([a, [a[0] + di * 4, a[1] + dj * 4]])
            for di, dj in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
                n = (k[0] + di, k[1] + dj)
                if harf(*n) in ("M", "P") and not any(harf(k[0] + a, k[1] + b) in YOL or harf(k[0] + a, k[1] + b) in ("M", "P")
                                                     for a, b in ((di, 0), (0, dj))):
                    a = [k[0] * KARE + 4, k[1] * KARE + 4]
                    uclar.append([a, [a[0] + di * 5, a[1] + dj * 5]])
        ogeler.append({"yerel": yerel("y"), "tip": "yol", "kademe": kademe, "genislik": YOL_GENISLIK[kademe],
                       "kareler": sorted([list(k) for k in kume]), "kenarlar": kenar, "uclar": uclar})
    yol_yereli = {}
    for o in ogeler:
        for k in o["kareler"]:
            yol_yereli[tuple(k)] = o["yerel"]

    # --- açık alanlar (bitişik aynı harf bir alan)
    gorulen = set()
    for j in range(D):
        for i in range(W):
            h = H[j][i]
            if h not in ALAN or (i, j) in gorulen:
                continue
            kume, yigin = [], [(i, j)]
            gorulen.add((i, j))
            while yigin:
                k = yigin.pop()
                kume.append(list(k))
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (k[0] + di, k[1] + dj)
                    if harf(*n) == h and n not in gorulen:
                        gorulen.add(n)
                        yigin.append(n)
            ogeler.append({"yerel": yerel("a"), "tip": "alan", "tur": ALAN[h], "kareler": sorted(kume)})

    # --- özel yapılar
    ozel_kare = set()
    for (i0, j0, w, d), tur, yon in c.get("ozel", []):
        kar = [(i, j) for j in range(j0, j0 + d) for i in range(i0, i0 + w)]
        for k in kar:
            assert harf(*k) == OZEL, f"{sid}: özel {tur} karesi {k} '#' değil"
            ozel_kare.add(k)
        ogeler.append({"yerel": yerel("o"), "tip": "arsa", "duzen": "ozel", "kareler": [list(k) for k in kar],
                       "cephe": yon, "on": _on_komsu(kar, yon, harf, yol_yereli)})
        ogeler.append(_ozel_bina(ogeler[-1], tur, (i0, j0, w, d), yon, yerel("b")))
    tum_ozel = {(i, j) for j in range(D) for i in range(W) if H[j][i] == OZEL}
    assert tum_ozel == ozel_kare, f"{sid}: '#' kareleri özel yapılarla uyuşmuyor: {sorted(tum_ozel ^ ozel_kare)}"

    # --- arsalar: haritadan kendiliğinden
    atanan = set()
    arsa_kareleri = [(i, j) for j in range(D) for i in range(W) if H[j][i] in ARSA]

    def cephe_bul(i, j):
        en_iyi = None
        for ad, (di, dj) in YON.items():
            h = harf(i + di, j + dj)
            if h == "^" and c["yer"] == "kiyi":
                continue
            if h in CEPHE_ONCELIK:
                p = CEPHE_ONCELIK[h]
                if en_iyi is None or p < en_iyi[0]:
                    en_iyi = (p, ad)
        return en_iyi

    sira = sorted(arsa_kareleri, key=lambda k: ((cephe_bul(*k) or (99,))[0], k[1], k[0]))
    for k in sira:
        if k in atanan:
            continue
        cb = cephe_bul(*k)
        if not cb:
            continue
        duzen = ARSA[H[k[1]][k[0]]]
        on_ad = cb[1]
        f = YON[on_ad]
        ic = (-f[0], -f[1])
        yanlar = [(f[1], -f[0]), (-f[1], f[0])]
        for (w, d) in ARSA_BICIM[duzen]:
            bulundu = None
            for yv in yanlar:
                kar = [(k[0] + a * yv[0] + b * ic[0], k[1] + a * yv[1] + b * ic[1]) for a in range(w) for b in range(d)]
                if all(harf(*q) == H[k[1]][k[0]] and q not in atanan for q in kar) and \
                        all(cephe_bul(k[0] + a * yv[0], k[1] + a * yv[1]) and
                            harf(k[0] + a * yv[0] + f[0], k[1] + a * yv[1] + f[1]) in CEPHE_ONCELIK for a in range(w)):
                    bulundu = kar
                    break
            if bulundu:
                atanan.update(bulundu)
                a = {"yerel": yerel("p"), "tip": "arsa", "duzen": duzen, "kareler": sorted([list(q) for q in bulundu]),
                     "cephe": on_ad, "on": _on_komsu(bulundu, on_ad, harf, yol_yereli), "bicim": [w, d]}
                ogeler.append(a)
                ogeler.extend(_arsa_icerigi(g, c, a, yerel, sid))
                break
    bos = sorted(set(arsa_kareleri) - atanan)
    if bos:
        ogeler.append({"yerel": yerel("a"), "tip": "alan", "tur": "bos", "kareler": [list(k) for k in bos],
                       "not": "arsaya bölünemeyen kare; boş kalır (ileride park, bahçe)"})

    # --- kendiliğinden donatı: zeytinlik, bostan, pazar; mezarlık ve bahçe duvarı
    for o in list(ogeler):
        if o["tip"] != "alan":
            continue
        for (i, j) in o["kareler"]:
            r = sans(f"{sid}/{i}/{j}")
            if o["tur"] == "zeytinlik":
                ogeler.append(_donati(yerel("d"), "zeytin", i + 0.5 + (r - 0.5) * 0.35, j + 0.5 + (sans(f"{sid}{i}{j}z") - 0.5) * 0.35))
            elif o["tur"] == "bostan":
                ogeler.append(_donati(yerel("d"), "sebze", i + 0.3, j + 0.5))
                ogeler.append(_donati(yerel("d"), "sebze", i + 0.72, j + 0.5))
        if o["tur"] == "mezarlik" or (c.get("duvar") and o["tur"] in ("bostan", "yesil", "zeytinlik")):
            for d_ in _cevre_duvari(o["kareler"], yerel, bosluk=("on", 0.5) if True else None):
                ogeler.append(d_)
    if c.get("seki"):   # yamaçta istinat (seki) duvarı: her sıra arası; geçit / merdiven karesinde açık
        for j in range(1, D):
            i = 0
            while i < W:
                if H[j][i] in YOL or H[j - 1][i] in YOL:
                    i += 1
                    continue
                i0 = i
                while i < W and H[j][i] not in YOL and H[j - 1][i] not in YOL:
                    i += 1
                ogeler.append({"yerel": yerel("w"), "tip": "duvar", "seki": True,
                               "hat": [[i0 * KARE, j * KARE], [i * KARE, j * KARE]]})
    for t in c.get("donati", []):
        tur, x, y = t[0], t[1], t[2]
        ogeler.append(_donati(yerel("d"), tur, x, y, t[3] if len(t) > 3 else None))

    # elle konan donatı bir evin tabanına düştüyse en yakın kenarın 1 m dışına itilir
    tabanlar = []
    for o in ogeler:
        if o["tip"] == "bina":
            cx, cy = o["merkez"]
            ex, ey = (o["en"] / 2, o["boy"] / 2) if o["yon"] in ("on", "arka") else (o["boy"] / 2, o["en"] / 2)
            tabanlar.append((cx - ex, cy - ey, cx + ex, cy + ey))
    for o in ogeler:
        if o["tip"] in ("agac", "donati"):
            x, y = o["m"]
            for (x0, y0, x1, y1) in tabanlar:
                if x0 < x < x1 and y0 < y < y1:
                    secenek = [(x - x0, (x0 - 1.0, y)), (x1 - x, (x1 + 1.0, y)), (y - y0, (x, y0 - 1.0)), (y1 - y, (x, y1 + 1.0))]
                    x, y = min(secenek)[1]
            o["m"] = [r1(x), r1(y)]
    # yamaçta ev: tabandaki kot farkı (çeşidin en dik eğimiyle) büyükse ev kademeli (alt kat yamaca gömülü; K1, K2)
    for o in ogeler:
        if o["tip"] == "bina":
            derin = o["boy"] if o["yon"] in ("on", "arka") else o["en"]
            fark = c["egim"][1] / 100 * derin
            if fark > OLCU["bodrumKotFarki"]:
                o["kademeli"] = True
                o["kotFarkiM"] = r1(fark)
    # komşu arsaların ortak duvarı bir kez
    gorulen_d, temiz = set(), []
    for o in ogeler:
        if o["tip"] == "duvar":
            a_ = tuple(sorted((tuple(o["hat"][0]), tuple(o["hat"][1]))))
            if a_ in gorulen_d:
                continue
            gorulen_d.add(a_)
        temiz.append(o)
    ogeler = temiz
    ozet = {}
    for o in ogeler:
        anahtar = o["tip"] if o["tip"] not in ("alan",) else f"alan:{o['tur']}"
        ozet[anahtar] = ozet.get(anahtar, 0) + 1
    modeller = sorted({o["model"] for o in ogeler if o.get("model")})
    return {"id": sid, "grup": g["id"], "cesit": c["c"], "ad": f"{g['ad']} {c['c'].upper()} · {c['tarif']}",
            "tarif": c["tarif"], "yer": c["yer"], "arka": c.get("arka"), "en": W, "boy": D,
            "egim": {"enAz": c["egim"][0], "enCok": c["egim"][1], "yukselir": "iki yana" if c.get("seki") else "arka"},
            "seki": bool(c.get("seki")),
            "harita": H, "ogeler": ogeler, "ozet": ozet, "modeller": modeller,
            "ogeSayisi": len(ogeler)}


def _on_komsu(kar, yon, harf, yol_yereli):
    f = YON[yon]
    for (i, j) in kar:
        n = (i + f[0], j + f[1])
        h = harf(*n)
        if h is not None and h != "#" and not (n in [tuple(q) for q in kar]):
            if h == "^":
                return "yol:konan"
            if n in yol_yereli:
                return yol_yereli[n]
            if h in ALAN:
                return "alan:" + ALAN[h]
    return None


def _cerceve(kar):
    i0 = min(k[0] for k in kar); j0 = min(k[1] for k in kar)
    i1 = max(k[0] for k in kar) + 1; j1 = max(k[1] for k in kar) + 1
    return i0 * KARE, j0 * KARE, i1 * KARE, j1 * KARE


def _taban(cer, yon, en, boy, on_pay):
    """Çerçevenin `yon` kenarına yaslı, ortalanmış taban: merkez, en (cepheye koşut), boy (derinlik)."""
    x0, y0, x1, y1 = cer
    f = YON[yon]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if f == (0, -1):
        cy = y0 + on_pay + boy / 2
    elif f == (0, 1):
        cy = y1 - on_pay - boy / 2
    elif f == (-1, 0):
        cx = x0 + on_pay + boy / 2
    else:
        cx = x1 - on_pay - boy / 2
    return [r1(cx), r1(cy)]


def _ozel_bina(arsa, tur, rect, yon, yer):
    model = OZEL_MODEL[tur]
    i0, j0, w, d = rect
    f = YON[yon]
    cephe_m = (w if f[1] else d) * KARE - 2 * OLCU["ozelPay"]
    derin_m = (d if f[1] else w) * KARE - 2 * OLCU["ozelPay"]
    me, mb, mh = MODEL_OLCU.get(model, (cephe_m, derin_m, 8))
    s = min(cephe_m / me, derin_m / mb, 1.0 if tur not in ("sapel",) else 0.75)
    if tur == "tribun":   # tribün tabana uydurulur (boyu uzar)
        en, boy, s = cephe_m, derin_m, cephe_m / me
    else:
        en, boy = me * s, mb * s
    merkez = _taban(_cerceve(arsa["kareler"]), yon, en, boy, OLCU["ozelPay"])
    return {"yerel": yer, "tip": "bina", "tur": tur, "model": model, "arsa": arsa["yerel"], "merkez": merkez,
            "en": r1(en), "boy": r1(boy), "yon": yon, "olcek": r1(s),
            "not": "tür örneği olarak özel yapının modeli; viki maddesine bağlanmaz"}


def _arsa_icerigi(g, c, a, yerel, sid):
    out = []
    w, d = a["bicim"]
    cer = _cerceve(a["kareler"])
    yon = a["cephe"]
    cephe_m, derin_m = w * KARE, d * KARE
    anahtar = f"{sid}/{a['yerel']}"
    duzen = a["duzen"]
    havuz = M[g.get("ev") or "ev_karisik"]
    if duzen == "bitisik":
        on_meydan = (a["on"] or "").startswith("alan:meydan") or (a["on"] or "").startswith("alan:pazar")
        carsi = g["id"] == "carsi-sokagi" or (g["id"] == "liman-kasabasi" and a["on"] == "alan:rihtim")
        dukkan = (on_meydan and sans(anahtar + "d") < OLCU["dukkanOrani"]) or (carsi and sans(anahtar + "d") < OLCU["carsiDukkanOrani"])
        model = sec(anahtar, M["dukkanli"] if dukkan else M["ev_dar"] if g["id"] != "tepe-koyu" else M["ev_tas"])
        en, boy = cephe_m, min(OLCU["bitisikEvDerinlik"], derin_m - (2.0 if d > 1 else 0))
        merkez = _taban(cer, yon, en, boy, 0.0)
        out.append({"yerel": yerel("b"), "tip": "bina", "tur": "dukkanli" if dukkan else "ev", "model": model,
                    "arsa": a["yerel"], "merkez": merkez, "en": r1(en), "boy": r1(boy), "yon": yon, "bitisik": True,
                    "modelEn": r1(en * OLCU["siraEvGovdeCarpani"])})
        return out
    if duzen == "depo":
        model = M["depo"][0]
        me, mb, _ = MODEL_OLCU[model]
        s = min((cephe_m - 2) / me, (derin_m - 2) / mb, 1.0)
        merkez = _taban(cer, yon, me * s, mb * s, 1.0)
        out.append({"yerel": yerel("b"), "tip": "bina", "tur": "depo", "model": model, "arsa": a["yerel"],
                    "merkez": merkez, "en": r1(me * s), "boy": r1(mb * s), "yon": yon})
        return out
    # avlulu, çiftlik, yazlık
    if duzen == "ciftlik":
        model = sec(anahtar, M["ciftlik"]); on_pay = OLCU["ciftlikOnPay"]
    elif duzen == "yazlik":
        model = sec(anahtar, M["yazlik"]); on_pay = OLCU["yazlikOnPay"]
    else:
        model = sec(anahtar, havuz if w > 1 else M["ev_dar"]); on_pay = OLCU["avluluOnPay"]
    me, mb, _ = MODEL_OLCU[model]
    en_sinir = cephe_m - 2 * OLCU["avluluYanPay"]
    boy_sinir = min(derin_m - on_pay - 4.0, OLCU["avluluEvDerinlik"] if duzen == "avlulu" else 99)
    s = min(en_sinir / me, boy_sinir / mb, 1.0)
    en, boy = me * s, mb * s
    merkez = _taban(cer, yon, en, boy, on_pay)
    out.append({"yerel": yerel("b"), "tip": "bina", "tur": {"avlulu": "ev", "ciftlik": "ciftlik", "yazlik": "yazlik"}[duzen],
                "model": model, "arsa": a["yerel"], "merkez": merkez, "en": r1(en), "boy": r1(boy), "yon": yon})
    # avlu duvarı (evin önü hariç; kapı payı)
    x0, y0, x1, y1 = cer
    kenarlar = {"on": [[x0, y0], [x1, y0]], "arka": [[x0, y1], [x1, y1]], "sol": [[x0, y0], [x0, y1]], "sag": [[x1, y0], [x1, y1]]}
    for ad, hat in kenarlar.items():
        if ad == yon:
            # ön duvar: evin iki yanında kalan parçalar
            f = YON[yon]
            if f[1]:
                parcalar = [[[x0, hat[0][1]], [merkez[0] - en / 2, hat[0][1]]], [[merkez[0] + en / 2, hat[0][1]], [x1, hat[0][1]]]]
            else:
                parcalar = [[[hat[0][0], y0], [hat[0][0], merkez[1] - en / 2]], [[hat[0][0], merkez[1] + en / 2], [hat[0][0], y1]]]
            for p in parcalar:
                if math.dist(*p) > 2.5:
                    out.append({"yerel": yerel("w"), "tip": "duvar", "arsa": a["yerel"], "hat": [[r1(q[0]), r1(q[1])] for q in p],
                                "kapi": True})
        else:
            out.append({"yerel": yerel("w"), "tip": "duvar", "arsa": a["yerel"], "hat": hat})
    # arka avluda ağaç ve bahçe donatısı
    f = YON[yon]
    ax = merkez[0] - f[0] * (boy / 2 + (derin_m - on_pay - boy) / 2)
    ay = merkez[1] - f[1] * (boy / 2 + (derin_m - on_pay - boy) / 2)
    r = sans(anahtar + "a")
    agac = "zeytin" if duzen == "ciftlik" else ("incir" if r < 0.4 else "limon" if r < 0.7 else "zeytin")
    yan = (f[1], -f[0])
    kay = (sans(anahtar + "k") - 0.5) * (cephe_m - 6)
    out.append(_donati(yerel("d"), agac, (ax + yan[0] * kay) / KARE, (ay + yan[1] * kay) / KARE))
    if sans(anahtar + "c") < 0.3 and derin_m - on_pay - boy > 8:
        out.append(_donati(yerel("d"), "cardak", (ax - yan[0] * kay * 0.8) / KARE, (ay - yan[1] * kay * 0.8) / KARE))
    if duzen == "ciftlik":
        out.append(_donati(yerel("d"), "kuyu", (ax - yan[0] * 5) / KARE, (ay - yan[1] * 5) / KARE))
        out.append(_donati(yerel("d"), "kumes", (ax + yan[0] * 7 - f[0] * 3) / KARE, (ay + yan[1] * 7 - f[1] * 3) / KARE))
    return out


def _donati(yer, tur, x, y, yon=None):
    model, h = DONATI[tur]
    o = {"yerel": yer, "tip": "agac" if tur in AGAC_TURLERI else "donati", "tur": tur, "model": model,
         "m": [r1(x * KARE), r1(y * KARE)], "yukseklik": h}
    if yon:
        o["yon"] = yon
    return o


def _cevre_duvari(kareler, yerel, bosluk=None):
    s = {tuple(k) for k in kareler}
    parca = []
    for (i, j) in sorted(s):
        for (di, dj), hat in (((0, -1), [[i, j], [i + 1, j]]), ((0, 1), [[i, j + 1], [i + 1, j + 1]]),
                              ((-1, 0), [[i, j], [i, j + 1]]), ((1, 0), [[i + 1, j], [i + 1, j + 1]])):
            if (i + di, j + dj) not in s:
                parca.append([[p[0] * KARE, p[1] * KARE] for p in hat])
    # kapı: yola bakan (j en küçük) ön kenarın ortasındaki parça yarım kalır
    on = [p for p in parca if p[0][1] == p[1][1] == min(q[0][1] for q in parca)]
    kapi = on[len(on) // 2] if on else None
    out = []
    for p in parca:
        if p is kapi:
            mx = (p[0][0] + p[1][0]) / 2
            for q in ([p[0], [mx - 1.2, p[0][1]]], [[mx + 1.2, p[0][1]], p[1]]):
                out.append({"yerel": yerel("w"), "tip": "duvar", "hat": q, "kapi": True})
        else:
            out.append({"yerel": yerel("w"), "tip": "duvar", "hat": p})
    return out


def _model_olculeri():
    """Modellerin tabanı (m): kompakt_yapilar.py → model_olcusu ile aynı hesap."""
    import struct
    import numpy as np
    sonuc = {}
    dosyalar = set(OZEL_MODEL.values()) | {d for l in M.values() for d in l}
    for dosya in sorted(dosyalar):
        ham = open(os.path.join(KOK, "public", "modeller", dosya), "rb").read()
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
            Mx = np.eye(4); Mx[:3, :3] = R @ np.diag(d.get("scale", [1, 1, 1])); Mx[:3, 3] = d.get("translation", [0, 0, 0])
            return Mx
        alt, ust = np.full(3, np.inf), np.full(3, -np.inf)

        def yuru(i, P):
            nonlocal alt, ust
            d = dugum[i]; Mx = P @ matris(d)
            if "mesh" in d:
                for pr in ag[d["mesh"]]["primitives"]:
                    a = acc[pr["attributes"]["POSITION"]]
                    mn, mx = np.array(a["min"], float), np.array(a["max"], float)
                    if a.get("normalized"):
                        bol = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[a["componentType"]]
                        mn, mx = mn / bol, mx / bol
                    for k in range(8):
                        v = Mx @ np.array([mn[0] if k & 1 else mx[0], mn[1] if k & 2 else mx[1], mn[2] if k & 4 else mx[2], 1])
                        alt, ust = np.minimum(alt, v[:3]), np.maximum(ust, v[:3])
            for ch in d.get("children", []):
                yuru(ch, Mx)
        for r in js["scenes"][js.get("scene", 0)]["nodes"]:
            yuru(r, np.eye(4))
        sonuc[dosya] = (round(float(ust[0] - alt[0]), 1), round(float(ust[2] - alt[2]), 1), round(float(ust[1] - alt[1]), 1))
    return sonuc


MODEL_OLCU = {}


def _kurali(g, c):
    tam = uret_cesit(g, c)
    tam["kirpma"] = kirpma_kurali(g, c, tam)
    return tam


# ------------------------------------------------------------------ kırpma (Kemal, 21 Kasım: grup sığmazsa kenar kareleri kırpılır)
KORUNAN_HARF = set("MP#R")   # meydan, pazar, özel yapı, rıhtım kırpılmaz


def kirp_tanim(c, sol, sag, arka):
    """Çeşit tanımının sol / sağ sütunları ve arka sıraları atılmış hâli (0. sıra hiç atılmaz). Olmazsa None."""
    H = c["harita"]
    D, W = len(H), len(H[0])
    if sol + sag >= W or arka >= D:
        return None
    atilan = [H[j][i] for j in range(D) for i in range(W) if i < sol or i >= W - sag or j >= D - arka]
    if any(h in KORUNAN_HARF for h in atilan):
        return None
    yeni = dict(c)
    yeni["harita"] = [r[sol:W - sag] for r in H[:D - arka]]
    yeni["ozel"] = [((i0 - sol, j0, w, d), t, y) for (i0, j0, w, d), t, y in c.get("ozel", [])]
    W2, D2 = W - sol - sag, D - arka
    yeni["donati"] = [(t[0], t[1] - sol, t[2]) + tuple(t[3:]) for t in c.get("donati", [])
                      if 0 <= t[1] - sol <= W2 and t[2] <= D2]
    return yeni


def kirpma_kurali(g, c, tam):
    """Her kenardan en çok kaç kare atılabilir; kutunun içindeki her birleşim denetimden geçer."""
    import itertools
    import hazir_gruplar_denetim as hd
    var = _modeller_var()

    def gecerli(sol, sag, arka):
        if sol == sag == arka == 0:
            return True
        t = kirp_tanim(c, sol, sag, arka)
        if t is None:
            return False
        try:
            k = uret_cesit(g, t)
        except AssertionError:
            return False
        if hd.cesit_denetimi(k, YOL_EGIM, var)[0]:
            return False
        if c["yer"] == "yol" and not any(h in "astgpmMP" for h in k["harita"][0]):
            return False                                   # girişsiz kalmasın
        if tam["ozet"].get("bina") and k["ozet"].get("bina", 0) < 1:
            return False
        if k["en"] < 2 or k["boy"] < 2:
            return False
        return True
    W, D = tam["en"], tam["boy"]
    yarim = lambda n: max(0, n // 2)
    en_cok = {"sol": 0, "sag": 0, "arka": 0}
    for ad, f in (("sol", lambda k: (k, 0, 0)), ("sag", lambda k: (0, k, 0)), ("arka", lambda k: (0, 0, k))):
        sinir = yarim(W) if ad != "arka" else yarim(D)
        k = 0
        while k + 1 <= sinir and gecerli(*f(k + 1)):
            k += 1
        en_cok[ad] = k
    onbellek = {}
    while True:
        bozuk = None
        for a, b, d in itertools.product(range(en_cok["sol"] + 1), range(en_cok["sag"] + 1), range(en_cok["arka"] + 1)):
            if (a, b, d) not in onbellek:
                onbellek[(a, b, d)] = gecerli(a, b, d)
            if not onbellek[(a, b, d)]:
                bozuk = (a, b, d)
                break
        if not bozuk:
            break
        ad = max(en_cok, key=en_cok.get)
        en_cok[ad] -= 1
    return {"sol": en_cok["sol"], "sag": en_cok["sag"], "arka": en_cok["arka"],
            "enKucuk": [W - en_cok["sol"] - en_cok["sag"], D - en_cok["arka"]],
            "kural": "0. sıra (konduğu yol / kıyı) atılmaz; sol, sağ sütunlardan ve arka sıralardan en çok bu kadar atılır, "
                     "kutunun içindeki her birleşim denetimden geçer; meydan, pazar, özel yapı ve rıhtım karesi atılmaz; "
                     "arsalar ve evler kırpılmış haritadan yeniden kurulur"}


def kirpilmis(g_id, c_harf, sol, sag, arka):
    """7. adım ve denetim için: kırpılmış çeşidi üretir (kuralın dışındaysa None)."""
    g = next(x for x in GRUPLAR if x["id"] == g_id)
    c = next(x for x in g["cesitler"] if x["c"] == c_harf)
    if not MODEL_OLCU:
        MODEL_OLCU.update(_model_olculeri())
    t = kirp_tanim(c, sol, sag, arka)
    if t is None:
        return None
    k = uret_cesit(g, t)
    k["kirpildi"] = {"sol": sol, "sag": sag, "arka": arka}
    return k


def _modeller_var():
    var = set()
    for kok, _, dosyalar in os.walk(os.path.join(KOK, "public", "modeller")):
        for d in dosyalar:
            var.add(os.path.relpath(os.path.join(kok, d), os.path.join(KOK, "public", "modeller")).replace(os.sep, "/"))
    return var


def main():
    MODEL_OLCU.update(_model_olculeri())
    cikti_gruplar = []
    for g in GRUPLAR:
        cikti_gruplar.append({
            "id": g["id"], "ad": g["ad"], "aciklama": g["aciklama"], "eskiSablon": g.get("eski"),
            "kaynak": g["kaynak"], "ilham": g["ilham"],
            "cesitler": [_kurali(g, c) for c in g["cesitler"]],
        })
    veri = {
        "not": "Hazır gruplar, taslak (Kemal onaylamadı). gen/hazir_gruplar.py üretir. Kayda yazılmaz; 7. adımdaki "
               "yönetim ekranı bir çeşidi bir yol kesimine, kıyıya ya da boş karelere koyar, her öğe ayrı kayıt olur.",
        "kareM": KARE,
        "alanlar": {
            "harita": "çeşidin kare haritası; satır 0 konduğu yola (yer: yol, serit) ya da kıyıya (yer: kiyi) bitişik",
            "yer": "yol: bir yol kesiminin yanına, kendi sokaklarıyla açık araziye uzanır; serit: yalnız boş karelere "
                   "(en çok 4 sıra, duzada-kareler.json şeridi); kiyi: 0. sıra kıyı çizgisinde",
            "en": "yol boyunca kare sayısı (i)", "boy": "yoldan içeri kare sayısı (j)",
            "egim": "uygun yamaç (%); yukselir: arka = yoldan içeri doğru yükselir, iki yana = sekili grup yokuş yukarı da aşağı da konur",
            "seki": "yamaçta her sıra arasında istinat (seki) duvarı",
            "kirpma": "grup sığmazsa kenar kareleri kırpılır (Kemal, 21 Kasım): sol, sag (sütun), arka (sıra) en çok; "
                      "enKucuk en küçük geçerli boy; kırpılmış hâli üreteç kurar (gen/hazir_gruplar.py → kirpilmis)",
            "modelEn": "sıra evde (bitisik) model bu genişliğe uydurulur; taban en ile kalır (gövdeler değsin)",
            "ogeler": "yerel metre: x = 8·i yol boyunca, y = 8·j yoldan içeri; yön adları on (konduğu yola), arka, sol, sag",
            "yerel": "öğenin çeşit içindeki kimliği; konunca kayıtta grup: { kimlik, sablon, yerel }",
            "tip": "yol (kareler, kenarlar), alan (meydan, yesil, bostan, zeytinlik, bag, oyun, otopark, mezarlik, rihtim, "
                   "saha, pazar, avlu, bos), arsa (duzen, cephe, on), bina (model, merkez, en, boy, yon), agac, donati, duvar",
        },
        "olculer": OLCU | {"yolGenislik": YOL_GENISLIK, "yolEgimSiniri": YOL_EGIM, "arsaBicim": ARSA_BICIM},
        "modelOlcu": {k: list(v) for k, v in sorted(MODEL_OLCU.items())},
        "gruplar": cikti_gruplar,
    }
    with open(CIKTI, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, separators=(",", ":"))
    n_c = sum(len(g["cesitler"]) for g in cikti_gruplar)
    n_o = sum(c["ogeSayisi"] for g in cikti_gruplar for c in g["cesitler"])
    print(f"{len(cikti_gruplar)} grup, {n_c} çeşit, {n_o} öğe → {os.path.relpath(CIKTI, KOK)} "
          f"({os.path.getsize(CIKTI) / 1024:.0f} KB)")
    for g in cikti_gruplar:
        for c in g["cesitler"]:
            print(f"  {c['id']:<28} {c['en']}x{c['boy']} kare  {c['ogeSayisi']} öğe  {c['ozet']}")


if __name__ == "__main__":
    main()
