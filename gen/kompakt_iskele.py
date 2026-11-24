"""İskele köyü eski haritadaki sokaklarıyla — tek harita (Kemal, 24 Kasım 2026).

Kemal (24 Kasım, İskele'nin önizlemesine yorum): İskele'nin sokakları tümden değişmiş; eski haritadaki sokak hatlarına
dönsün, 0,70 ölçekle (Liman'daki gibi). Sahil Yolu İskele'nin içinde de eski hattından geçer (sokaklar ona göre
kurulmuştu). Köyün sokakları eski haritadaki hâliyle aynı: Kemal'in Kurucu'daki son hâli (gizlenenler çıkar, yolDuzeni'yle
değişen hat ve Kemal'in köyün içine çizdiği yollar girer; The Imperial çevresindekiler girmez, otelin yolları ayrı),
dondurulmuş girdiden (gen/kompakt_eski.py, gen/kompakt-eski-girdiler.json → "iskele"). Biçim, sıra ve bağlanış aynı;
yeni sokak yok. Numaralı adlar ("İskele 12. Sokak") geçicidir, taşınmaz; adı olan yol (Kemsköy Caddesi) adıyla gelir.

Oran: adanın küçültmesinin kendisi (0,70, aynı odak; kıyı köyündeki gibi), döndürme yok. İskele'de kompakt adanın kıyısı
eski kıyının küçültülmüşüdür; ama tepeler aynı yükseklikte kaldığı için kıyının arkasındaki yamaç 0,70'te dikleşti: köy
yalnız küçültülünce Kemsköy Caddesi kıyı yamacına biniyor (%26) ve kıyıya bakan kısa sokaklar %25–50 eğimde kalıyordu.
Köy bütün olarak kara yönüne (kuzeye) KAYMA kadar kayar: Kemsköy Caddesi'nin eğim sınırının (%10) içinde kaldığı en
küçük kayma (Liman'daki 18 m'lik kaymaya benzer). Sokaklar kıyıya en az 54 m (eskisinde 42 m). Zemin düzlenmez.
Yerleşimin 1. adımdaki kayması (yerleşim noktası, 36 m güneye) uygulanmaz: o kaymayla köyün kıyı sokağı denize düşüyordu.
Köyün adlı yapıları (Sade Meyhane, Eski Kilise ve evinde oturanı olan ev) aynı taşımayla eski yerlerine döner
(gen/kompakt_yapilar.py). Kayma ve ölçüler DENEME.

Üreteçler bunu okur: gen/kompakt_yollar.py (sokaklar, meydancıklar, Sahil Yolu'nun köydeki kesimi),
gen/kompakt_yapilar.py (İskele'deki viki yapılarının hedefi), gen/kompakt_yollar_denetim.py.
"""
import os, sys

BURASI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BURASI)
import kompakt_eski as E  # noqa: E402

ORAN = 0.70
ODAK = (3855.0, -660.0)        # adanın küçültmesinin odağı (1. adım; duzada-zemin.bin başlığı "odak", "olcek")
KAYMA = (0.0, 26.0)            # köyün kara yönüne kayması (m, DENEME; yukarıda)
SAHIL_PAY = 100.0              # Sahil Yolu'nun eski hattı köyün bu kadar çevresinde izlenir (m)
KIYI_EN_AZ = 20.0              # köyün sokakları kıyıya bundan yaklaşmaz (denetim; Liman'la aynı)

_MLNG, _MLAT, _LNG0, _LAT0 = 85773.5342, 111132.0, 25.85, 39.6   # eski haritayla aynı


def _m(lng, lat):
    return ((lng - _LNG0) * _MLNG, (lat - _LAT0) * _MLAT)


def tasi_m(x, y):
    """Eski haritadaki metre noktası → tek haritada (aynı metre düzlemi): adanın küçültmesi ve köyün kayması."""
    return (ODAK[0] + ORAN * (x - ODAK[0]) + KAYMA[0], ODAK[1] + ORAN * (y - ODAK[1]) + KAYMA[1])


def tasi(lng, lat):
    return tasi_m(*_m(lng, lat))


def eski_iskele():
    """Eski haritadaki İskele: sokaklar {kimlik: (ad, kademe, [(boylam, enlem)…])}, meydancıklar [[(boylam, enlem)…]],
    Sahil Yolu [(boylam, enlem)…] (Kemal'in Kurucu'daki son hâli; dondurulmuş girdiden)."""
    return E.iskele()


def sahile_kadar():
    """Köyden çıkıp Sahil Yolu'nu kesen eski yollar (yalnız Sahil Yolu'na kadarki başı): [(kimlik, kademe, hat)]."""
    return E.iskele_sahile_kadar()


def eski_iskelede(eski_konum, mahalle):
    """Eski haritadaki bir yapı İskele köyünde mi (köyün sokaklarının kapladığı alanın 40 m yakınında)."""
    from shapely.geometry import LineString, Point
    from shapely.ops import unary_union
    global _ALAN
    if mahalle != "yer_iskele":
        return False
    if _ALAN is None:
        sok, _, _ = E.iskele()
        _ALAN = unary_union([LineString([_m(*c) for c in hat]) for _, _, hat in sok.values()]).convex_hull
    return _ALAN.distance(Point(_m(*eski_konum))) <= 40.0


_ALAN = None
