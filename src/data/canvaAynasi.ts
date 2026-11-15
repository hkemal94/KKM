/**
 * Galeri'nin Canva aynası (Paket 5, 29 Eylül). Kemal (yapısal 1. set,
 * 5. tur): galeri "ikisi — kayıtlara bağlı görsel arşiv + Canva aynası".
 *
 * Kemal'in Canva hesabındaki Kems / Düzada tasarımları (Canva bağlantısından
 * 29 Eylül'de alındı; düğün davetiyesi gibi kişisel tasarımlar alınmadı).
 * Küçük resimler Canva'nın adresinden gelir; adres süresi dolarsa kartta
 * yalnız başlık kalır. Tıklayınca tasarım Canva'da açılır. Liste Claude
 * oturumunda Canva'dan yenilenir.
 */
export interface CanvaTasarimi { id: string; baslik: string; tur: 'viki' | 'site' | 'mekân' | 'merch' | 'marka' | 'harita'; kucukResim: string; adres: string; guncelleme: number }

export const CANVA_AYNASI: CanvaTasarimi[] = [
  // 15 Kasım (Kemal: tech pack "proje belgesi + KKM"): şablon ve dolu örnek
  { id: 'DAHa755XcHA', baslik: 'Kems Company · Tech pack şablonu (taslak)', tur: 'merch', kucukResim: 'https://design.canva.ai/KKmQR6GKSZKBiXS', adres: 'https://www.canva.com/d/SNppqBdBfQsefKP', guncelleme: 1794699530 },
  { id: 'DAHa71mrInM', baslik: 'Kems Company · Tech pack · Basics 1 Basic Hoodie (örnek)', tur: 'merch', kucukResim: 'https://design.canva.ai/hrm5rcL68Cj3l0B', adres: 'https://www.canva.com/d/ywTYpQkuAk6nQS5', guncelleme: 1794702123 },
  { id: 'DAHWhVrx3o4', baslik: 'Düzada Künye Kalıpları 1', tur: 'viki', kucukResim: 'https://design.canva.ai/hy5AnpQZpwxNCGf', adres: 'https://www.canva.com/d/Vg9kMdOqhOhCskc', guncelleme: 1790630921 },
  { id: 'DAHWhXnuKDs', baslik: 'Düzada Künye Örnekleri', tur: 'viki', kucukResim: 'https://design.canva.ai/KrbYLQkWztYdOOm', adres: 'https://www.canva.com/d/wdEpPFGOcazL1dv', guncelleme: 1790631903 },
  { id: 'DAHWhRlBAyQ', baslik: 'Düzada Künye Kalıpları', tur: 'viki', kucukResim: 'https://design.canva.ai/gO6z3qnEYiI-ixK', adres: 'https://www.canva.com/d/-rvgzqxXYI-1ScT', guncelleme: 1790629682 },
  { id: 'DAHWBjgxb_4', baslik: 'Başlık (site şablonu)', tur: 'site', kucukResim: 'https://design.canva.ai/OwAHlTErC-w7zHq', adres: 'https://www.canva.com/d/7syjEo5YtHKrg5l', guncelleme: 1790664386 },
  { id: 'DAG6dvI0Z6E', baslik: 'The Imperial', tur: 'mekân', kucukResim: 'https://design.canva.ai/mtOcC6-OFoxOjfZ', adres: 'https://www.canva.com/d/EW44XVjR51tchO8', guncelleme: 1790664421 },
  { id: 'DAHVbgwPv-8', baslik: 'İskele Mahallesi örnek', tur: 'viki', kucukResim: 'https://design.canva.ai/M-IyLGPYn7sRDwG', adres: 'https://www.canva.com/d/F2Y_r_7Gzk3fPpg', guncelleme: 1790610690 },
  { id: 'DAHO5s9PTLQ', baslik: 'Drop - Basics 1', tur: 'merch', kucukResim: 'https://design.canva.ai/it7N2hyK_6_Kklg', adres: 'https://www.canva.com/d/geGoCL2X0BSjTtK', guncelleme: 1790578770 },
  { id: 'DAHO5lQDFBc', baslik: 'Kems Company - Basics I', tur: 'merch', kucukResim: 'https://design.canva.ai/jiHIz19VEuWfMsF', adres: 'https://www.canva.com/d/F5Ru68-ueD4EIqX', guncelleme: 1790389353 },
  { id: 'DAHNGTjgeNE', baslik: 'No Name Drop.1', tur: 'merch', kucukResim: 'https://design.canva.ai/Ok796E-YzFTz7QB', adres: 'https://www.canva.com/d/iSsWCMaAjqQVnhH', guncelleme: 1790350369 },
  { id: 'DAG0ZImBV_Q', baslik: 'Kems Company', tur: 'marka', kucukResim: 'https://design.canva.ai/GEGkWbxcnbRIJud', adres: 'https://www.canva.com/d/ZRSlVGkw8XT9h5S', guncelleme: 1790387090 },
  { id: 'DAHVz3LaBYE', baslik: 'Düzada iskambil destesi', tur: 'merch', kucukResim: 'https://design.canva.ai/z0f-n01WlHKider', adres: 'https://www.canva.com/d/vZzC7btniLV30Ni', guncelleme: 1789976072 },
  { id: 'DAHUz8DF85o', baslik: 'Düzada Kopyası', tur: 'harita', kucukResim: 'https://design.canva.ai/Qw4Xeb48jstEjkl', adres: 'https://www.canva.com/d/Qk-_bF_HDNy6oh2', guncelleme: 1789055718 },
  { id: 'DAG3WS9XyHs', baslik: 'Düzada Harita', tur: 'harita', kucukResim: 'https://design.canva.ai/3cfkdPz2P4jh3Im', adres: 'https://www.canva.com/d/rCT0IacXQ5iXzu0', guncelleme: 1789056432 },
  { id: 'DAG0VxV3BWI', baslik: 'Ürün Çalışma', tur: 'merch', kucukResim: 'https://design.canva.ai/siIGy8-w5fvfHKr', adres: 'https://www.canva.com/d/nbWuwcZpAUgyI2i', guncelleme: 1772027662 },
  { id: 'DAGzCwLxaKo', baslik: 'Kems Company’s', tur: 'marka', kucukResim: 'https://design.canva.ai/O8tcODdSNLMSK83', adres: 'https://www.canva.com/d/xMYPapxUC5Jkb2j', guncelleme: 1770647880 },
  { id: 'DAHAQe-_l7g', baslik: 'Kems', tur: 'marka', kucukResim: 'https://design.canva.ai/rDDgJj2myHbIjug', adres: 'https://www.canva.com/d/imvG2iEIlNHuofd', guncelleme: 1770648102 },
  { id: 'DAG0Vmd4rlY', baslik: 'Kems Company Brand Board', tur: 'marka', kucukResim: 'https://design.canva.ai/LCxPMHQGFdv5vAL', adres: 'https://www.canva.com/d/pPE4R5VFZvJxZ7n', guncelleme: 1759757296 },
  { id: 'DAGzxv1qf1Q', baslik: 'Kems Company Board', tur: 'marka', kucukResim: 'https://design.canva.ai/77V0LN8rv5bYZ3L', adres: 'https://www.canva.com/d/x14XF-DO-OhLaSx', guncelleme: 1758612085 },
  { id: 'DAGgF_yeEWk', baslik: 'Items', tur: 'merch', kucukResim: 'https://design.canva.ai/nfwVxdgGiyt1wjv', adres: 'https://www.canva.com/d/-DL9tHR1DNKvrfh', guncelleme: 1763228255 },
  { id: 'DAGpNZh1WO0', baslik: 'Ürünler', tur: 'merch', kucukResim: 'https://design.canva.ai/SC3dxCtDtyrfUsy', adres: 'https://www.canva.com/d/MeX_bZAjadNt67Z', guncelleme: 1753177003 },
];
