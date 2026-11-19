/**
 * Haritada maddesi olması gereken yapılar: `duzadaGeo.ts`'teki binalardan
 * wikiId'si olanlar (künye için gereken özellikleriyle). Bu dosya
 * `gen/duzada.py` ile üretilir; elle düzenlenmez.
 */
export interface HaritaYapisi {
  id: string; wikiId: string; ad: string; tur: string | null; mahalle: string | null;
  kat: number | null; yukseklik: number | null; taban: number | null;
  merkez: { x: number; y: number } | null;
}

export const HARITA_YAPILARI: HaritaYapisi[] =
  [
  {
    "id": "bina_imperial",
    "wikiId": "kemskoy_hotel",
    "ad": "The Imperial Kemsköy",
    "tur": "otel",
    "mahalle": "yer_iskele",
    "kat": 4,
    "yukseklik": 19,
    "taban": 57.6,
    "merkez": {
      "x": 25.7909814,
      "y": 39.571852199999995
    }
  },
  {
    "id": "bina_fener",
    "wikiId": "viki_mekan_fener",
    "ad": "Deniz Feneri",
    "tur": "fener",
    "mahalle": "yer_liman",
    "kat": null,
    "yukseklik": 30,
    "taban": 69.1,
    "merkez": {
      "x": 25.785535040000003,
      "y": 39.64029292
    }
  },
  {
    "id": "bina_stad_tribun",
    "wikiId": "viki_mekan_dirlik_stadi",
    "ad": "Dirlik Stadı",
    "tur": "stadyum",
    "mahalle": "yer_stadyum",
    "kat": null,
    "yukseklik": 5.3,
    "taban": 147.3,
    "merkez": {
      "x": 25.906991600000005,
      "y": 39.628033800000004
    }
  },
  {
    "id": "bina_surek",
    "wikiId": "mekan_kucukcetmi",
    "ad": "Küçükçetmi Sürek Kulübü",
    "tur": "kulüp",
    "mahalle": "yer_ciftlik",
    "kat": null,
    "yukseklik": 9,
    "taban": 190.2,
    "merkez": {
      "x": 25.923616,
      "y": 39.5791076
    }
  },
  {
    "id": "bina_meyhane",
    "wikiId": "viki_mekan_meyhane",
    "ad": "Sade Meyhane",
    "tur": "meyhane",
    "mahalle": "yer_iskele",
    "kat": 2,
    "yukseklik": 9,
    "taban": 74.8,
    "merkez": {
      "x": 25.7914966,
      "y": 39.5703158
    }
  },
  {
    "id": "bina_liman_ofis",
    "wikiId": "viki_mekan_liman_idare",
    "ad": "Liman İdare Binası",
    "tur": "yapı",
    "mahalle": "yer_liman",
    "kat": 3,
    "yukseklik": 11,
    "taban": 14.8,
    "merkez": {
      "x": 25.788888000000004,
      "y": 39.624921
    }
  },
  {
    "id": "bina_liman_kafe",
    "wikiId": "viki_mekan_liman_kafe",
    "ad": "Dondurmacı Kızlar",
    "tur": "kafe",
    "mahalle": "yer_liman",
    "kat": 1,
    "yukseklik": 5,
    "taban": 13.9,
    "merkez": {
      "x": 25.788491599999997,
      "y": 39.62451020000001
    }
  },
  {
    "id": "bina_belediye",
    "wikiId": "viki_mekan_belediye",
    "ad": "Belediye Binası",
    "tur": "yapı",
    "mahalle": "yer_merkez",
    "kat": 3,
    "yukseklik": 12,
    "taban": 169.8,
    "merkez": {
      "x": 25.866492800000003,
      "y": 39.609396
    }
  },
  {
    "id": "bina_pazar",
    "wikiId": "mekan_pazar",
    "ad": "Merkez Pazarı",
    "tur": "yapı",
    "mahalle": "yer_merkez",
    "kat": 1,
    "yukseklik": 7,
    "taban": 173.8,
    "merkez": {
      "x": 25.866886,
      "y": 39.608808599999996
    }
  },
  {
    "id": "bina_apt1",
    "wikiId": "mekan_1791406291488_7jtvw",
    "ad": "Düzada Jandarma Karakolu",
    "tur": "yapı",
    "mahalle": "yer_merkez",
    "kat": 2,
    "yukseklik": 7,
    "taban": 171.0,
    "merkez": {
      "x": 25.866319400000002,
      "y": 39.608924
    }
  },
  {
    "id": "bina_okul",
    "wikiId": "mekan_okul",
    "ad": "Düzada İlkokulu",
    "tur": "yapı",
    "mahalle": "yer_merkez",
    "kat": 2,
    "yukseklik": 9,
    "taban": 174.6,
    "merkez": {
      "x": 25.8682386,
      "y": 39.610108600000004
    }
  },
  {
    "id": "bina_kahvehane",
    "wikiId": "mekan_1791406291022_hotli",
    "ad": "Merkez Kahvehanesi",
    "tur": "yapı",
    "mahalle": "yer_merkez",
    "kat": 1,
    "yukseklik": 5,
    "taban": 172.6,
    "merkez": {
      "x": 25.867037399999997,
      "y": 39.6091684
    }
  }
];
