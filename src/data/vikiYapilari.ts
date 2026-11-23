/**
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

export const VIKI_YAPILARI: VikiYapisi[] = [
  {
    "id": "bina_stad_tribun",
    "vikiId": "viki_mekan_dirlik_stadi",
    "ad": "Dirlik Stadı",
    "mahalle": "yer_stadyum"
  },
  {
    "id": "bina_imperial",
    "vikiId": "kemskoy_hotel",
    "ad": "The Imperial Kemsköy",
    "mahalle": "yer_iskele"
  },
  {
    "id": "kurucu_bina_mw1zb16h",
    "vikiId": "mekan_1791406293719_6ki1i",
    "ad": "Taraftar Birahanesi",
    "mahalle": "yer_stadyum"
  },
  {
    "id": "bina_pazar",
    "vikiId": "mekan_pazar",
    "ad": "Merkez Pazarı",
    "mahalle": "yer_merkez"
  },
  {
    "id": "bina_belediye",
    "vikiId": "viki_mekan_belediye",
    "ad": "Belediye Binası",
    "mahalle": "yer_merkez"
  },
  {
    "id": "bina_kahvehane",
    "vikiId": "mekan_1791406291022_hotli",
    "ad": "Merkez Kahvehanesi",
    "mahalle": "yer_merkez"
  },
  {
    "id": "bina_apt1",
    "vikiId": "mekan_1791406291488_7jtvw",
    "ad": "Düzada Jandarma Karakolu",
    "mahalle": "yer_merkez"
  },
  {
    "id": "bina_surek",
    "vikiId": "marka_1782600611254_j7gg5",
    "ad": "Küçükçetmi Sürek Kulübü",
    "mahalle": "yer_ciftlik"
  },
  {
    "id": "bina_fener",
    "vikiId": "viki_mekan_fener",
    "ad": "Deniz Feneri",
    "mahalle": "yer_liman"
  },
  {
    "id": "bina_zeytinyagi",
    "vikiId": "madde_1794596168449_degzx",
    "ad": "Yağ Fabrikası",
    "mahalle": "yer_ciftlik"
  },
  {
    "id": "bina_okul",
    "vikiId": "mekan_okul",
    "ad": "Düzada İlkokulu",
    "mahalle": "yer_merkez"
  },
  {
    "id": "ek_balik_hali",
    "vikiId": "mekan_1791406293152_5flp7",
    "ad": "Liman Balık Hali",
    "mahalle": "yer_liman"
  },
  {
    "id": "bina_liman_ofis",
    "vikiId": "viki_mekan_liman_idare",
    "ad": "Liman İdare Binası",
    "mahalle": "yer_liman"
  },
  {
    "id": "bina_meyhane",
    "vikiId": "viki_mekan_meyhane",
    "ad": "Sade Meyhane",
    "mahalle": "yer_iskele"
  },
  {
    "id": "ek_balik_lokantasi",
    "vikiId": "mekan_1791406293432_jmrl9",
    "ad": "Liman Balık Lokantası",
    "mahalle": "yer_liman"
  },
  {
    "id": "kurucu_bina_muzkrwr7",
    "vikiId": "marka_dirlik",
    "ad": "Dirlik Spor Kulübü",
    "mahalle": "yer_stadyum"
  },
  {
    "id": "ek_eski_kilise",
    "vikiId": "mekan_1791406292605_gha8n",
    "ad": "Eski Kilise",
    "mahalle": "yer_iskele"
  },
  {
    "id": "bina_liman_kafe",
    "vikiId": "viki_mekan_liman_kafe",
    "ad": "Dondurmacı Kızlar",
    "mahalle": "yer_liman"
  },
  {
    "id": "yapi_merkez_camii",
    "vikiId": "mekan_1791406290403_o0m2j",
    "ad": "Düzada Merkez Camii",
    "mahalle": "yer_merkez"
  },
  {
    "id": "yapi_saglik_ocagi",
    "vikiId": "mekan_1791406292051_49pt1",
    "ad": "Düzada Sağlık Ocağı",
    "mahalle": "yer_merkez"
  },
  {
    "id": "yapi_merkez_postanesi",
    "vikiId": "mekan_1791406291758_f8hzx",
    "ad": "Merkez Postanesi",
    "mahalle": "yer_merkez"
  },
  {
    "id": "yapi_merkez_eczanesi",
    "vikiId": "mekan_1791406292321_vti5e",
    "ad": "Merkez Eczanesi",
    "mahalle": "yer_merkez"
  },
  {
    "id": "yapi_efendi_kuruyemis",
    "vikiId": "madde_1791557701651",
    "ad": "Efendi Kuruyemiş",
    "mahalle": "yer_liman"
  },
  {
    "id": "yapi_iskele_mescidi",
    "vikiId": "madde_1794596168679_jaq4c",
    "ad": "İskele Mescidi",
    "mahalle": "yer_iskele"
  },
  {
    "id": "yapi_rum_mezarligi",
    "vikiId": "mekan_1791406292869_vkdn7",
    "ad": "Rum Mezarlığı",
    "mahalle": "yer_iskele"
  }
];
