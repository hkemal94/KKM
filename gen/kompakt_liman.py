"""Liman kasabası eski haritadaki sokaklarıyla — tek harita (Kemal, 22 Kasım 2026).

Kemal: "Liman kısmını gerçekten beğenmedim. Bir önceki Liman'ın sokak çizimleri çok hoştu ve balık yeri bu
kadar yakın değildi." Liman kasabasının sokakları bugünkü (eski) haritadaki hâliyle aynı: Kemal'in Kurucu'daki
son hâli (o günkü src/data/kurucuGomulu.ts: gizlenenler çıkar, yolDuzeni'yle değişen hat ve Kemal'in çizdiği sokaklar
girer) eski üretilmiş haritanın (o günkü src/data/duzadaGeo.ts) Liman sokaklarıyla birlikte kompakt adaya taşınır.
23 Kasım (tek harita 11. adım): eski sokaklar dondurulmuş girdiden okunur (gen/kompakt_eski.py,
gen/kompakt-eski-girdiler.json); eski haritanın dosyaları okunmaz.
Biçim, sıra ve bağlanış aynı; yeni sokak yok.

Oran: 0,70 (Kemal, 22 Kasım: "adanın geri kalanı gibi"; kıyı köyündeki gibi). Döndürme yok (aynı yön).

Odak: Dondurmacı Kızlar. Dükkân, iskele ve mendirek #266'daki yerinde kalır (Kemal'in B kararı: Liman
İskelesi'nin dibinde, önü denize). Eski haritada dükkân Kemal'in çizdiği kıyı sokağının üstündeydi; önü denize
döndüğü için kasaba, sokaklar dükkânın içinden geçmeyecek kadar kayar (Kemal, 22 Kasım): dükkâna göre 18 m kara
yönüne (en küçük kayma; sokak dükkândan 1,5 m açıkta), kıyı boyunca 6 m (bu kayma içinde Balık Hali, Balık
Lokantası ve Liman İdare'nin dükkâna uzaklığı eskisinin 0,70'ine en yakın). Sokaklar kıyıya 20 m'den yaklaşmaz,
kasaba Liman mahallesine sığar. DENEME.

Üreteçler bunu okur: gen/kompakt_yollar.py (sokaklar, meydancıklar, Sahil Yolu'nun kasabadaki kesimi),
gen/kompakt_yapilar.py (Liman'daki viki yapılarının hedefi, iskelenin kökü).
"""
import os, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
sys.path.insert(0, BURASI)
import kompakt_eski as E  # noqa: E402

ORAN = 0.70
CAPA_ESKI = (25.7890969, 39.6250236)    # Dondurmacı Kızlar eski haritada (gen/kompakt-yapilar-eski.json eskiKonum)
DK_YENI = (25.8209328, 39.6158244)      # Dondurmacı Kızlar tek haritada (#266, iskelenin dibinde; değişmez)
ISKELE_KOK = (25.8206085, 39.6159392)   # #266'daki iskelenin kıyıdaki kökü (dükkânın önünden 23,6 m kumsal + 7 m)
CAPA_YENI = (25.8210943, 39.6157078)    # kasabanın taşınmış odağı: dükkândan 18 m kara yönüne, 6 m kıyı boyunca (DENEME)
SAHIL_PAY = 100.0                       # Sahil Yolu'nun eski hattı kasabanın bu kadar çevresinde izlenir (m)

_MLNG, _MLAT, _LNG0, _LAT0 = 85773.5342, 111132.0, 25.85, 39.6   # eski haritayla aynı (duzada.py, zemin başlığı)


def _m(lng, lat):
    return ((lng - _LNG0) * _MLNG, (lat - _LAT0) * _MLAT)


_CE, _CY = _m(*CAPA_ESKI), _m(*CAPA_YENI)


def tasi_m(x, y):
    """Eski haritadaki metre noktası → tek haritada (aynı metre düzlemi)."""
    return (_CY[0] + ORAN * (x - _CE[0]), _CY[1] + ORAN * (y - _CE[1]))


def tasi(lng, lat):
    return tasi_m(*_m(lng, lat))


def eski_liman():
    """Eski haritadaki Liman: sokaklar {kimlik: (ad, [(boylam, enlem)…])}, meydancıklar [[(boylam, enlem)…]],
    Sahil Yolu [(boylam, enlem)…] (Kemal'in Kurucu'daki son hâli; dondurulmuş girdiden)."""
    return E.liman()
