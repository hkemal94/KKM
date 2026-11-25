"""Stadyum köyü eski haritadaki sokaklarıyla — tek harita (Kemal, 24 Kasım 2026).

Kemal (24 Kasım, Stadyum'un önizlemesine yorum): "Stadyum çok kötü: uzun düz paralel yollar; daha küçük, evler yakın,
daha az sokak." Köy dokusu üretilmez; köyün sokakları eski haritadaki hâliyle (İskele ve Liman'daki gibi): Kemal'in
Kurucu'daki son hâli (gizlenenler çıkar, yolDuzeni'yle değişen hat ve Kemal'in köyün çevresine ve stada çizdiği yollar
girer), dondurulmuş girdiden (gen/kompakt_eski.py, gen/kompakt-eski-girdiler.json → "stadyum"). Biçim, sıra ve bağlanış
aynı; yeni sokak yok. Numaralı adlar taşınmaz.

Oran: adanın küçültmesinin kendisi (0,70, aynı odak), döndürme ve kayma yok: stat da aynı küçültmeyle yerinde (ölçüsü
aynı), köy statın batısında eskisi gibi. Eski ızgaranın adaları 0,70'te ~55 m; köy küçülür, evler yakın.
Tepeler aynı yükseklikte kaldığı için yamaç dikleşti: eğim sınırını (%15) aşan sokak basamaklı geçit olur
(gen/kompakt_yollar.py; zemin düzlenmez, İskele'deki gibi). Seyreltme aşağıda (GIDEN; Kemal onayladı, 25 Kasım).
Öbür ölçüler DENEME.

Üreteçler bunu okur: gen/kompakt_yollar.py (sokaklar), gen/kompakt_yollar_denetim.py, gen/kompakt_yapilar_denetim.py.
"""
import os, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_eski as E  # noqa: E402

ORAN = 0.70
ODAK = (3855.0, -660.0)        # adanın küçültmesinin odağı (1. adım; duzada-zemin.bin başlığı "odak", "olcek")
KAYMA = (0.0, 0.0)             # köy kaydırılmaz (stat da aynı küçültmeyle yerinde)

_MLNG, _MLAT, _LNG0, _LAT0 = 85773.5342, 111132.0, 25.85, 39.6   # eski haritayla aynı


def _m(lng, lat):
    return ((lng - _LNG0) * _MLNG, (lat - _LAT0) * _MLAT)


def tasi_m(x, y):
    """Eski haritadaki metre noktası → tek haritada: adanın küçültmesi."""
    return (ODAK[0] + ORAN * (x - ODAK[0]) + KAYMA[0], ODAK[1] + ORAN * (y - ODAK[1]) + KAYMA[1])


def tasi(lng, lat):
    return tasi_m(*_m(lng, lat))


# Seyreltme (Kemal: "daha az sokak"): aşağıdaki hatlar kaldırılır, kalanlar aynı hatta (yeni sokak, birleştirme yok).
# Seçim bir kez hesaplanıp donduruldu (Kemal onayladı, 25 Kasım: "Stadyum'un uzun yolları böyle kalsın"); gerekçesi
# her satırda.
# Izgaranın kuzeydoğu-güneybatı yönündeki uzun paralel sokaklarından (8 tane, aralarında ~40 m) üçü gider: kalanlar
# arasında ~80 m kalır, iki yandan dört sıra ev (8 m kare) adayı doldurur, boş ada kalmaz. Kısa çapraz sokaklar aynı hatta
# kalır, gidenin yerinde iki ucu birbirine değer (eskisinde de öyleydi).
GIDEN = frozenset([
    "sokak_yer_stadyum_46",   # kuzeyden 2. uzun sokak (551 m); 53 ile 31'in arası 80 m olur
    "sokak_yer_stadyum_1",    # 4. uzun sokak (588 m, köyün ortası); 31 ile 32'nin arası 80 m olur
    "sokak_yer_stadyum_33",   # 6. uzun sokak (444 m); 32 ile 34'ün arası 80 m olur
])


def eski_stadyum(hepsi=False):
    """Eski haritadaki Stadyum köyü: sokaklar {kimlik: (ad, kademe, [(boylam, enlem)…])}. hepsi=False: GIDEN çıkar."""
    sok = E.stadyum()
    if not hepsi:
        sok = {k: v for k, v in sok.items() if k not in GIDEN}
    return sok
