"""Tek haritanın viki yapı listesi → src/data/vikiYapilari.ts (tek harita 11. adım, KKM-A; Kemal, 23 Kasım 2026).

Kemal: vikideki "Haritada" kutusu tek harita verisinden okusun. Kutu ve Durum → Eksikler'deki "yapının maddesi
yok" satırı bütün yapı dosyasını (public/harita/duzada-yapilar.geojson, ~1 MB) indirmesin diye vikide maddesi
olan yapıların kısa listesi: yapının tek harita kimliği, maddesi, haritadaki adı, mahallesi.

Kendiliğinden çağrılır: gen/kompakt_yapilar.py ve gen/kompakt_taslak_uygula.py yapı dosyasını yazınca bunu da
yazar (elle düzen dahil son hâl). Tek başına da çalışır: python gen/kompakt_viki_yapilar.py
public/harita/'ya dokunmaz. Elle düzenlenmez.
"""
import json, os

BURASI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(BURASI)
YAPILAR = os.path.join(KOK, "public", "harita", "duzada-yapilar.geojson")
CIKTI = os.path.join(KOK, "src", "data", "vikiYapilari.ts")

BASLIK = """/**
 * Tek haritada vikide maddesi olan yapılar (tek harita 11. adım, 23 Kasım 2026).
 * `gen/kompakt_viki_yapilar.py` üretir (public/harita/duzada-yapilar.geojson'dan); elle düzenlenmez.
 * Okuyan: vikideki "Haritada" kutusu, Eksikler'deki "yapının maddesi yok" satırı, haritadan madde açma.
 */
export interface VikiYapisi {
  /** Tek haritadaki yapı kimliği (maddenin `haritaBinaId`'si) */
  id: string;
  /** Maddenin kimliği */
  vikiId: string;
  /** Haritadaki adı (boş olabilir) */
  ad: string;
  /** Mahallenin kimliği (yer_merkez …) */
  mahalle: string | null;
}

export const VIKI_YAPILARI: VikiYapisi[] = """


def liste(fc):
    cikti, gorulen = [], set()
    for f in fc["features"]:
        p = f["properties"]
        v = p.get("vikiId")
        if not v or not isinstance(v, str):
            continue
        anahtar = (p["id"], v)
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        cikti.append({"id": p["id"], "vikiId": v, "ad": p.get("ad") or "", "mahalle": p.get("mahalle") or None})
    return cikti


def yaz(fc=None):
    if fc is None:
        fc = json.load(open(YAPILAR, encoding="utf-8"))
    metin = BASLIK + json.dumps(liste(fc), ensure_ascii=False, indent=2) + ";\n"
    eski = open(CIKTI, encoding="utf-8").read() if os.path.exists(CIKTI) else None
    if metin != eski:
        with open(CIKTI, "w", encoding="utf-8") as f:
            f.write(metin)
    return CIKTI


if __name__ == "__main__":
    yol = yaz()
    print(f"Viki yapı listesi → {os.path.relpath(yol, KOK)}")
