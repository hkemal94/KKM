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


# Seyreltme (Kemal, 24 Kasım, #286'ya cevap: "Sokakları azalt; daha az ev olabilir ama dolu olsun"). Eski ızgaranın
# adaları 0,70'te küçük kalıyordu (yol kenarları arası ~20 m): iki yanına arsa sığmıyor, adaların içi boş görünüyordu.
# Kurucu'daki hatlardan bir kısmı kaldırılır, kalanlar aynı hatta kalır (yeni sokak yok, birleştirme yok):
#   - doğu-batı uzanan dört ara sokak (48, 50, 52, 54): kalanlar Kemsköy Caddesi, 49, 51, 53 (aralar ~32 m'den ~65 m'ye);
#   - bu sokaklara inip öbür yanda devam etmeyen kısa bağlantılar (çıkmaz kalırdı);
#   - her kuşakta kuzey-güney bağlantılar birbirine 65 m'den yakın olmasın (ara yol 1072, Eski Kilise'nin önündeki 14 kalır);
#   - batı uçta ve kuzeyde (Sahil Yolu'nun öbür yanı) küçük adaları bölen birkaç kısa sokak;
#   - Kemsköy Caddesi'nin güneyindeki kıyı sokakları (46, 47 ve bağlantıları): caddeyle aralarında ~18 m kalıyordu, iki
#     yandan da arsa sığmıyordu (boş ada). Caddenin güneyi tek sıra arsa olur; Sade Meyhane caddenin güney yanında
#     (eski yerinde; arkası caddeye bakar, önü kumsala).
# Kalanlar: Kemsköy Caddesi, Sahil Yolu'nun köy içi hattı, ara yollar, Eski Kilise'nin önündeki 14, köyün çevresindeki
# halka. Seçim bir kez hesaplanıp donduruldu (DENEME, Kemal onaylamadı).
GIDEN = frozenset(
    [f"sokak_yer_iskele_{n}" for n in [1, 2, 3, 4, 6, 7, 10, 16, 18, 20, 26, 28, 29, 30, 33, 34, 35, 36, 39, 40, 42, 44, 45, 46, 47, 48, 50, 52, 54, 55, 56, 57, 58, 59, 60, 61, 64, 65, 68, 70, 72, 73, 75, 77, 79, 82, 84, 85, 87, 90, 92, 93, 94, 95, 97, 98]]
    + [f"kurucu_yol_{k}" for k in ['muqyomuq', 'muqyp0xl', 'muqyp4bg', 'muqyprn5', 'muqyr3tr', 'muqyr8ke', 'muqyrsy8', 'muqyt2ia', 'muqytenz', 'muqz63od', 'muqz6zky', 'muqz78yy', 'muqz7eki', 'muqz81ho', 'muqza110', 'muqzakd5']])


def eski_iskele(hepsi=False):
    """Eski haritadaki İskele: sokaklar {kimlik: (ad, kademe, [(boylam, enlem)…])}, meydancıklar [[(boylam, enlem)…]],
    Sahil Yolu [(boylam, enlem)…] (Kemal'in Kurucu'daki son hâli; dondurulmuş girdiden). hepsi=False: GIDEN çıkar."""
    sok, meydan, sahil = E.iskele()
    if not hepsi:
        sok = {k: v for k, v in sok.items() if k not in GIDEN}
    return sok, meydan, sahil


# Eski feribot iskelesi (Kemal, 24 Kasım: "Eski feribotun yanaştığı iskele vardı"). Künye: "Kemsköy — otelden (1954)
# önce köyün iskelesi"; "Feribot İskele'den yeni limana taşındı" (Liman 1980–1990'lar); balık hali de önce İskele'deydi.
# Eski haritada, vikide ve Kurucu kayıtlarında yeri yok (git geçmişi tarandı: eski haritada İskele'de yalnız The
# Imperial'in Otel İskelesi vardı). YER TAHMİNİ (DENEME): köyün önünde, Eski Kilise hizasında kıyıya dik (Sade Meyhane
# ile kilisenin arası; köyün en eski yapıları); orada kıyı düz ve su doğuya göre daha çabuk derinleşir. Taş iskele
# (artık feribot yanaşmaz). Ölçüler DENEME: 80 m (ucu ~4 m derin), 8 m en.
# Kemal (24 Kasım, #286'ya son cevap): yeri Eski Kilise hizasında KALSIN; mendirek B (doğudan kısa, iskelenin önüne
# kıvrılan); iskeleye inen ayrı yol (aşağıda MENDIREK_B ve ISKELE_YOLU_*).
FERIBOT_HIZA = (25.787494, 39.5779193)   # Eski Kilise'nin eski haritadaki yeri (taşınınca kıyıdaki karşılığı kök olur)
FERIBOT_BOY = 80.0     # DENEME: kıyıdan denize (m)
FERIBOT_EN = 8.0       # DENEME
FERIBOT_KARAYA = 2.0   # kök kıyıdan bu kadar karaya girer (m)

# Mendirek B (Kemal, 24 Kasım: "doğudan kısa, iskelenin önüne kıvrılan"; PR'daki 2-mendirek-secenekleri.jpg → B). Taş,
# Liman'daki mendirek gibi (8 m en, aynı model). Noktalar iskelenin kökünden (doğuya m, denize m): kıyıdan iskelenin
# 70 m doğusunda başlar, denize iner, iskelenin ucunun önüne kıvrılır; ağzı batıya açık. Köşeler yumuşatılır. Ölçüler DENEME.
MENDIREK_B = [(70.0, 0.0), (80.0, 45.0), (55.0, 95.0), (15.0, 112.0)]
MENDIREK_EN = 8.0      # DENEME (Liman'daki mendirekle aynı)
MENDIREK_ISKELEYE_EN_AZ = 20.0   # mendirek iskeleden bu kadar uzak durur (tekne geçsin; Liman'daki gibi)


def feribot_koku(kiyi, ada):
    """Eski feribot iskelesinin kıyıdaki yeri: (S kıyı noktası, n denize doğru birim yön). Eski Kilise'nin taşınmış eski
    yerinin kıyıdaki en yakın noktası; yön kıyının 80 m'lik kirişine dik. Yollar (iskeleye inen yol) ve yapılar aynısını
    kullanır."""
    import numpy as np
    from shapely.geometry import Point
    T = Point(tasi(*FERIBOT_HIZA))
    s = kiyi.project(T)
    S = kiyi.interpolate(s)
    a, b = kiyi.interpolate(s - 40.0), kiyi.interpolate(s + 40.0)
    t = np.array([b.x - a.x, b.y - a.y]); t /= np.hypot(*t)
    n = np.array([-t[1], t[0]])
    if ada.contains(Point(S.x + n[0] * 5, S.y + n[1] * 5)):
        n = -n
    return np.array([S.x, S.y]), n


def mendirek_b_noktalari(kiyi, ada):
    """Mendirek B'nin ham noktaları (metre), kökten uca; köşeler Chaikin'le yumuşak."""
    import numpy as np
    S, n = feribot_koku(kiyi, ada)
    kok = S - n * FERIBOT_KARAYA
    dogu = np.array([n[1], -n[0]])
    if dogu[0] < 0:          # doğuya bakan yön (x artan)
        dogu = -dogu
    p = np.array([kok + dogu * a + n * b for a, b in MENDIREK_B])
    for _ in range(3):
        q = [p[0]]
        for i in range(len(p) - 1):
            q += [0.75 * p[i] + 0.25 * p[i + 1], 0.25 * p[i] + 0.75 * p[i + 1]]
        q.append(p[-1])
        p = np.array(q)
    return [tuple(c) for c in p]


ISKELE_KUMSAL_PAY = 15.0   # DENEME: köyün önünde kumsal şeridi (öbür kıyılarda gen/kompakt_parseller.py → KUMSAL_PAY)


def kumsal_dar_alan():
    """Kumsal şeridinin dar olduğu alan (Kemal, 24 Kasım: "boş ada kalmasın"; Kemsköy Caddesi'nin güneyindeki adalara
    da arsa düşsün; 8 Ekim: evler plaj kenarında olabilir): köyün seyreltmeden önceki bütün sokaklarının çevresi."""
    from shapely.geometry import LineString
    from shapely.ops import unary_union
    return unary_union([LineString([tasi(*c) for c in hat]) for _, _, hat in eski_iskele(hepsi=True)[0].values()]
                       ).convex_hull.buffer(30.0)


def kumsal_seridi(kum, kiyi_seridi, kumsal_pay):
    """Kumlu kıyıların kumsal şeridi (kum: kıyı çizgileri); İskele köyünün önünde dar."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    if not kum:
        return Polygon()
    alan = kumsal_dar_alan()
    genis = unary_union([k.buffer(kiyi_seridi + kumsal_pay) for k in kum])
    dar = unary_union([k.buffer(kiyi_seridi + ISKELE_KUMSAL_PAY) for k in kum])
    return unary_union([genis.difference(alan), dar.intersection(alan)])


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
