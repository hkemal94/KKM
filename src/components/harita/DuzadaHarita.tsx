import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isaretle } from '../../lib/olcumler';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DUZADA_GEO, DUZADA_MERKEZ, DUZADA_ALAN_KM2 } from '../../data/duzadaGeo';
import {
  GOK, KARA, YOL, YAPI, ZEMIN,
  MAHALLE_TONU
} from './haritaStili';
import { PusulaGulu, OlcekCubugu } from './haritaSusleri';
import {
  araziProtokolunuKur, araziKaynagi, ARAZI_KAYNAK, ARAZI_ABARTI
} from './duzadaArazi';
import { duzeniUygula, type HaritaDuzeni } from './duzenKatmani';
import { ayrintiVerisi } from './ayrintiKatmani';
import type { FeatureCollection } from 'geojson';
import { yolEtiketleri } from './yolEtiketleri';
import { DEM_SINIR } from '../../data/duzadaDem';
import { Atmosfer, atmosferVerisi, ATMOSFER_KAPALI, type AtmosferAyari } from './atmosfer';
import { KATMANLAR_ACIK, type KatmanAyari, type HaritaIsareti } from '../../lib/haritaIsaretleri';
import type { Item } from '../../types';
import { evMi, evNumarasi, evSakinleri, oturanlariOku } from '../../lib/evSakinleri';
import { kisiMi } from '../../lib/adaSakini';

/**
 * Düzada haritası.
 *
 * Dışarıdan hiçbir harita servisi kullanılmaz — ne karo, ne font, ne
 * anahtar, ne hesap. Deniz, kara, yükselti bantları, dalga çizgileri,
 * yollar ve binalar tamamen `duzadaGeo.ts` içindeki kendi verimizden
 * çizilir.
 *
 * Görsel dil marka briefindeki "antik/vintage kartografi" tarifine göre:
 * kâğıt zemin, hipsometrik yükselti tonları, kıyıdan dışa açılan dalga
 * çizgileri, kaplamalı yollar, pusula gülü ve ölçek çubuğu.
 *
 * Etiketler harita katmanı değil, HTML işaretçileridir. Böylece dışarıdan
 * font indirilmesi gerekmez ve markanın kendi yazı tipleri kullanılır.
 */

/** Adayı kareye oturtan başlangıç görünümü */
/**
 * En uzak bakış (8 Ekim, Kemal: "kameranın biraz daha uzaklaşmasına izin
 * ver"): eskiden 9,5 — ada ve hemen çevresi. Şimdi Bozcaada, Babakale,
 * Edremit Körfezi ve Midilli de görünür.
 */
const EN_UZAK = 8.4;
const BASLANGIC = { zoom: 11.35, pitch: 46, bearing: -17 } as const;


/**
 * Etiket türlerinin görünür olduğu yakınlık aralıkları.
 *
 * Harita üzerinde çakışma çözümü yok (metin katmanı kullanmıyoruz), o yüzden
 * kalabalığı yakınlığa göre yönetiyoruz: uzaktayken yalnızca deniz ve
 * mahalle adları, yaklaştıkça koylar, zirveler ve en sonda yapılar.
 */
const ETIKET_ARALIK: Record<string, [number, number]> = {
  deniz: [9, 12.6],
  mahalle: [10.2, 15.2],
  su: [10.8, 14.4],
  zirve: [10.9, 15.6],
  yapi: [13.2, 22],
  // maddesi olan küçük mekânlar: Sade Meyhane, Dondurmacı Kızlar, Belediye…
  // Mahalle adları söndükten (15.2) hemen sonra açılır.
  mekan: [15.2, 22],
  // otel yerleşkesindeki ikincil yapılar en son açılır
  yerleske: [16.7, 22],
  // yol adları (H6): kalabalık yapmasın diye kademeli açılır —
  // önce ana yol, sonra cadde, en son sokak ve merdiven
  anayol: [12.6, 22],
  cadde: [14.2, 22],
  sokak: [16.2, 22]
};

interface DuzadaHaritaProps {
  /** Bir binaya veya mahalleye tıklandığında ilgili wiki maddesini açar */
  onSelect?: (wikiId: string) => void;
  className?: string;
  /** Elle yapılmış düzenlemeler (H1) — üretilmiş verinin üstüne biner */
  duzen?: HaritaDuzeni | null;
  /** 2D ↔ 3D geçişinde kamera aynı yere baksın diye (H, 29 Eylül) */
  bakis?: HaritaBakisi | null;
  onBakis?: (b: HaritaBakisi) => void;
  /**
   * Site anasayfası (29 Eylül gece): düğme, kart, etiket yok; dokunulmaz,
   * ada kendi kendine yavaşça döner. Hareket azaltma açıksa dönmez.
   */
  vitrin?: boolean;
  /**
   * Trafik, gerçek saat, takvim mevsimi (30 Eylül). Sitede hep açık, KKM'de
   * düğmeyle. Verilmezse kapalı.
   */
  atmosfer?: AtmosferAyari;
  /** Not ve madde işaretleri (5. gece; 2D'de konur, burada iğne olarak görünür) */
  isaretler?: HaritaIsareti[];
  /** Görünen katmanlar (5. gece; Atölye tutar, 2D ile ortak) */
  katmanlar?: KatmanAyari;
  /**
   * Kayıtlar (3 Kasım): evde oturan kişiler buradan okunur, dolu evler açık
   * renkte görünür. Yalnız okunur.
   */
  items?: Item[];
  /**
   * Ev kartındaki "Oturan ekle" (3 Kasım): Kemal kişileri seçip "Kaydet"e
   * basınca evin oturanlarını yazar. Verilmezse kart yalnız gösterir.
   */
  onOturanlariKaydet?: (evId: string, kisiIdleri: string[]) => Promise<void>;
}

/** Haritanın baktığı yer: merkez (boylam, enlem) ve MapLibre yakınlığı */
export interface HaritaBakisi {
  merkez: [number, number];
  zoom: number;
}

interface SecimBilgisi {
  wikiId: string;
  ad: string;
  tur: string;
  detay?: string;
  /** Ev seçiliyse evin kimliği: oturanlar güncel kayıttan okunur */
  evId?: string;
}

/** Mahalle kimliği → adı (ev kartındaki adres satırı için) */
const MAHALLE_ADI = new Map<string, string>(
  DUZADA_GEO.features
    .filter(f => f.properties?.katman === 'mahalle')
    .map(f => [String(f.properties?.id), String(f.properties?.ad ?? '')] as [string, string])
);

/** Eğik bakışın açısı; "yukarıdan" 0 */
const EGIK = 46;

/**
 * Etiket işaretçisinin DOM'unu kurar.
 *
 * İki katmanlı: dıştaki kök MapLibre'ye ait — kütüphane işaretçinin
 * `opacity` değerini kendisi yönetiyor ve dışarıdan yazılanı eziyor.
 * Bu yüzden görünürlüğü içteki katmandan sürüyoruz.
 */
function etiketElemani(p: Record<string, unknown>): {
  kok: HTMLElement;
  ic: HTMLElement;
} {
  const tur = String(p.tur);
  const kok = document.createElement('div');
  const ic = document.createElement('div');
  ic.className = 'duzada-etiket';
  ic.dataset.tur = tur;
  kok.appendChild(ic);

  const ad = document.createElement('span');
  ad.className = 'duzada-etiket-ad';
  ad.textContent = String(p.ad);
  ic.appendChild(ad);

  if (tur === 'zirve') {
    const ucgen = document.createElement('span');
    ucgen.className = 'duzada-zirve-isareti';
    ic.insertBefore(ucgen, ad);
    const rakim = document.createElement('span');
    rakim.className = 'duzada-etiket-alt';
    rakim.textContent = `${p.rakim} m`;
    ic.appendChild(rakim);
  }

  return { kok, ic };
}

export const DuzadaHarita: React.FC<DuzadaHaritaProps> = ({ onSelect, className, duzen, bakis, onBakis, vitrin, atmosfer = ATMOSFER_KAPALI, isaretler, katmanlar, items, onOturanlariKaydet }) => {
  const kapsayici = useRef<HTMLDivElement | null>(null);
  const harita = useRef<MLMap | null>(null);
  /** Düzen değişince etiketleri yeniden kuran işlev — kurulum sırasında dolar */
  const etiketleriKurRef = useRef<((geo: FeatureCollection) => void) | null>(null);
  const [secim, setSecim] = useState<SecimBilgisi | null>(null);
  const [hazir, setHazir] = useState(false);
  const [yon, setYon] = useState(BASLANGIC.bearing);
  const [zoom, setZoom] = useState(BASLANGIC.zoom);
  const [egim, setEgim] = useState<number>(BASLANGIC.pitch);
  /** Şu an çizili (düzen uygulanmış) veri: dolu evleri bulmak için */
  const [cizili, setCizili] = useState<FeatureCollection | null>(null);
  /** Ev kartında oturan ekleme: seçilenler Kaydet'e kadar yalnız burada */
  const [oturanDuzen, setOturanDuzen] = useState<{ ara: string; secilen: string[] } | null>(null);
  const [oturanYaziliyor, setOturanYaziliyor] = useState(false);
  const [oturanHata, setOturanHata] = useState<string | null>(null);
  const doluRef = useRef<Set<string>>(new Set());
  // Kurulumda da düzenli hâlle başlasın (harita bir kez kuruluyor)
  const ilkDuzen = useRef(duzen ?? null);
  const ilkBakis = useRef(bakis ?? null);
  const atmosferAyari = useRef(atmosfer);
  const atmosferNesnesi = useRef<Atmosfer | null>(null);
  const onBakisRef = useRef(onBakis);
  useEffect(() => { onBakisRef.current = onBakis; }, [onBakis]);

  useEffect(() => {
    if (!kapsayici.current || harita.current) return;

    // Arazi karolarını üreten protokol harita kurulmadan önce kayıtlı olmalı
    araziProtokolunuKur();
    // Vitrinde ada ekranın ~%85'ini kaplasın (ölçü: 11.57 yakınlıkta ada ~970 px)
    const vitrinGenislik = Math.min(kapsayici.current.clientWidth || 1440, (kapsayici.current.clientHeight || 900) * 1.5);
    const vitrinZoom = 11.57 + Math.log2((0.85 * Math.max(320, vitrinGenislik)) / 970);

    const map = new maplibregl.Map({
      container: kapsayici.current,
      style: {
        version: 8,
        // glyphs tanımlanmıyor: harita üzerinde metin katmanı yok, etiketler
        // HTML işaretçisi olarak çiziliyor. Böylece dışarıdan font çekilmiyor.
        sources: {
          duzada: {
            type: 'geojson',
            data: atmosferVerisi(duzeniUygula(DUZADA_GEO, ilkDuzen.current)) as never,
            promoteId: 'id'
          },
          [ARAZI_KAYNAK]: araziKaynagi()
        },
        layers: [{ id: 'deniz', type: 'background', paint: { 'background-color': '#1C4E8C' } }]
      },
      center: ilkBakis.current?.merkez ?? DUZADA_MERKEZ,
      zoom: vitrin ? Math.max(EN_UZAK, vitrinZoom) : Math.max(EN_UZAK, ilkBakis.current?.zoom ?? BASLANGIC.zoom),
      pitch: vitrin ? 52 : BASLANGIC.pitch,
      interactive: !vitrin,
      bearing: BASLANGIC.bearing,
      minZoom: EN_UZAK,
      // Kamera çevrenin dışına kaçmasın (kıyılar gen/cevre.py çerçevesinde)
      maxBounds: [[24.4, 38.6], [27.6, 40.75]],
      maxZoom: 19,
      maxPitch: 72,
      attributionControl: false
    });

    harita.current = map;
    map.on('moveend', () => {
      const c = map.getCenter();
      onBakisRef.current?.({ merkez: [c.lng, c.lat], zoom: map.getZoom() });
    });
    (window as unknown as { __duzadaHarita?: MLMap }).__duzadaHarita = map;
    if (!vitrin) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('error', e => console.error('[harita]', e && (e as { error?: unknown }).error));

    // ---- etiketler: HTML işaretçisi ----
    const isaretciler: maplibregl.Marker[] = [];
    const etiketKayitlari: Array<{ el: HTMLElement; tur: string }> = [];
    /**
     * Yapı adları binanın tepesinde dursun (30 Eylül, Kemal: "koordinasyon
     * problemleri"). Etiket zemindeki noktaya bağlı; eğik bakışta bina
     * yukarı uzadığı için ad yanında kalıyordu. Binanın boyu kadar
     * (ekranda) yukarı itilir; eğim ve yakınlık değiştikçe yeniden hesaplanır.
     */
    const yuksekEtiketler: Array<{ m: maplibregl.Marker; h: number; taban: number; enlem: number }> = [];
    const etiketleriYukselt = () => {
      const z = map.getZoom(), egim = (map.getPitch() * Math.PI) / 180;
      for (const e of yuksekEtiketler) {
        const mpp = (78271.517 * Math.cos((e.enlem * Math.PI) / 180)) / 2 ** z;
        e.m.setOffset([0, e.taban - (e.h / mpp) * Math.sin(egim)]);
      }
    };

    /**
     * Çakışan etiketler (29 Eylül gece, Kemal'in telefon görüntüsü: "MERKEZ"
     * ile "ÇİFTLİK", "LİMAN" ile "Kuzey Sırtı" üst üste). Hareket bitince
     * ekrandaki kutular karşılaştırılır; önce önemli olan yerleşir, ona
     * binen gizlenir. Yakınlaşınca yer açılır, geri gelir.
     */
    const ONCELIK: Record<string, number> = { mahalle: 0, deniz: 1, zirve: 2, su: 3, mekan: 4, yapi: 5, anayol: 6, cadde: 7, yerleske: 8, sokak: 9 };
    const carpisanlar = new Set<HTMLElement>();
    const carpismaCoz = () => {
      carpisanlar.clear();
      const z = map.getZoom();
      const adaylar = etiketKayitlari
        .filter(({ tur }) => { const a = ETIKET_ARALIK[tur]; return !a || (z >= a[0] && z <= a[1]); })
        .sort((a, b) => (ONCELIK[a.tur] ?? 9) - (ONCELIK[b.tur] ?? 9));
      const yerlesen: DOMRect[] = [];
      const pay = 3;
      for (const { el } of adaylar) {
        const k = el.getBoundingClientRect();
        if (!k.width) continue;
        const carpar = yerlesen.some(y => k.left < y.right + pay && k.right > y.left - pay && k.top < y.bottom + pay && k.bottom > y.top - pay);
        if (carpar) carpisanlar.add(el); else yerlesen.push(k);
      }
      etiketGorunurluk(z);
    };

    const etiketGorunurluk = (z: number) => {
      etiketKayitlari.forEach(({ el, tur }) => {
        const aralik = ETIKET_ARALIK[tur];
        const gorunur = (!aralik || (z >= aralik[0] && z <= aralik[1])) && !carpisanlar.has(el);
        el.style.opacity = gorunur ? '1' : '0';
        el.style.pointerEvents =
          gorunur && (tur === 'yapi' || tur === 'mekan' || tur === 'yerleske')
            ? 'auto' : 'none';
      });
    };

    /*
     * Etiketler HTML işaretçisi olduğu için harita kaynağıyla birlikte
     * kendiliğinden güncellenmiyor. Düzen değişince (mekân eklendi, adı
     * değişti, taşındı) yeniden kurulmaları gerekiyor — bu yüzden dışarıdan
     * çağrılabilir ve eskileri temizleyerek başlıyor.
     */
    const etiketleriKur = (geo: FeatureCollection = DUZADA_GEO) => {
      isaretciler.forEach(m => m.remove());
      isaretciler.length = 0;
      etiketKayitlari.length = 0;
      yuksekEtiketler.length = 0;
      // Madde bağlı binaların boyu (etiketi tepesine çıkarmak için)
      const binaBoyu = new Map<string, number>();
      for (const f of geo.features) {
        const q = f.properties as Record<string, unknown> | null;
        if (q?.katman === 'bina' && q.wikiId) binaBoyu.set(String(q.wikiId), Number(q.yukseklik) || 0);
      }
      geo.features
        .filter(f => f.properties?.katman === 'etiket')
        .forEach(f => {
          const p = f.properties as Record<string, unknown>;
          if (f.geometry.type !== 'Point') return;
          const koordinat = f.geometry.coordinates as [number, number];
          const tur = String(p.tur);
          const { kok, ic } = etiketElemani(p);
          ic.style.transition = 'opacity 240ms ease';

          // 'mekan' ve 'yerleske' etiketleri de tıklanabilir olsun
          if (p.wikiId && (tur === 'yapi' || tur === 'mekan' || tur === 'yerleske')) {
            ic.style.cursor = 'pointer';
            ic.addEventListener('click', ev => {
              ev.stopPropagation();
              setSecim({ wikiId: String(p.wikiId), ad: String(p.ad), tur: 'Yapı' });
            });
          }

          // Yapı adı binanın üstünde dursun, üzerine binmesin
          const m = new maplibregl.Marker({
            element: kok,
            // yapı ve mekân adları kendi binalarının üstünde dursun,
            // üzerine binip küçük kütleyi gizlemesin
            anchor: tur === 'yapi' || tur === 'mekan' ? 'bottom' : 'center',
            offset: tur === 'yapi' ? [0, -14] : tur === 'mekan' ? [0, -10] : [0, 0]
          })
            .setLngLat(koordinat)
            .addTo(map);

          const h = p.wikiId ? binaBoyu.get(String(p.wikiId)) : undefined;
          if (h && (tur === 'yapi' || tur === 'mekan')) yuksekEtiketler.push({ m, h, taban: tur === 'yapi' ? -14 : -10, enlem: koordinat[1] });
          isaretciler.push(m);
          etiketKayitlari.push({ el: ic, tur });
        });

      // ---- yol adları (H6) ----
      // Üreteçte yok, çizim anında yoldan hesaplanıyor. Yazı yola paralel
      // dursun diye döndürülüyor; eğik haritada okunaklı kalsın diye
      // eğim hizası ekran düzleminde bırakılıyor.
      for (const y of yolEtiketleri(geo)) {
        const { kok, ic } = etiketElemani({ ad: y.ad, tur: y.tur });
        ic.style.transition = 'opacity 240ms ease';
        const m = new maplibregl.Marker({
          element: kok,
          anchor: 'center',
          rotation: y.aci,
          rotationAlignment: 'map',
          pitchAlignment: 'viewport'
        })
          .setLngLat(y.konum)
          .addTo(map);
        isaretciler.push(m);
        etiketKayitlari.push({ el: ic, tur: y.tur });
      }

      etiketGorunurluk(map.getZoom());
      etiketleriYukselt();
      // İşaretçiler yerine oturduktan sonra çakışmaları çöz
      requestAnimationFrame(carpismaCoz);
    };
    etiketleriKurRef.current = etiketleriKur;
    map.on('moveend', carpismaCoz);

    const katmanlariKur = () => {
      if (map.getLayer('ada')) return;
      const src = 'duzada';

      // ---- 3B arazi ----
      // Bütün çizim katmanları bu araziye giydiriliyor: yükselti bantları,
      // yollar, mahalle sınırları hep yamaca oturuyor. Abartı katsayısı
      // için duzadaArazi.ts'deki nota bak.
      map.setTerrain({ source: ARAZI_KAYNAK, exaggeration: ARAZI_ABARTI });

      // Arazi açıkken eğimli bakışta ufuk görünüyor. Gökyüzü mavi değil,
      // kâğıdın kendi tonu: harita bir sayfa gibi dursun, pencere gibi değil.
      map.setSky({
        'sky-color': GOK.ust,
        'horizon-color': GOK.ufuk,
        'fog-color': GOK.pus,
        'sky-horizon-blend': 0.9,
        'horizon-fog-blend': 0.55,
        'fog-ground-blend': 0.72,
        'atmosphere-blend': [
          'interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 0.28, 16, 0.1
        ]
      });

      // ---- fiziki ada (29 Eylül) ----
      // Kemal: "fiziki bir ada yaratabilirsin; bu görsel içimi darlatıyor."
      // Kâğıt harita (yükselti bantları, eşyükselti çizgileri, dalga
      // halkaları, kıyı çizgisi) kalktı. Yerine adanın yükselti verisinden
      // üretilmiş fiziki doku: kumsal, kuru çayır, maki, çam, kaya, sığ su.
      // Doku araziye giydirilir; yollar ve yapılar üstüne oturur.
      map.addSource('ada-fiziki', {
        type: 'image',
        url: `${import.meta.env.BASE_URL || '/'}ada-fiziki.webp`,
        coordinates: [
          [DEM_SINIR[0], DEM_SINIR[3]], [DEM_SINIR[2], DEM_SINIR[3]],
          [DEM_SINIR[2], DEM_SINIR[1]], [DEM_SINIR[0], DEM_SINIR[1]]
        ]
      });
      map.addLayer({ id: 'ada-fiziki', type: 'raster', source: 'ada-fiziki', paint: { 'raster-fade-duration': 0 } });

      /*
       * Yakın doku (30 Eylül, Kemal: yakından bulanık). Zemin görseli bir
       * pikselde birkaç metre gösteriyor; yakınlaşınca üstüne ekranla aynı
       * ölçekte ince bir çim / toprak benekleri dokusu biner, keskinlik verir.
       */
      if (!map.hasImage('zemin-doku')) {
        const N = 96, tuval = document.createElement('canvas');
        tuval.width = N; tuval.height = N;
        const c = tuval.getContext('2d')!;
        let t = 7;
        const r = () => { t = (t * 16807) % 2147483647; return t / 2147483647; };
        for (let i = 0; i < 520; i++) {
          const koyu = r() < 0.6;
          c.fillStyle = koyu ? `rgba(40,52,24,${0.10 + r() * 0.16})` : `rgba(255,250,225,${0.06 + r() * 0.1})`;
          const x = r() * N, y = r() * N, w = 1 + r() * 2.2;
          c.fillRect(x, y, w, w * (0.6 + r() * 0.8));
        }
        map.addImage('zemin-doku', c.getImageData(0, 0, N, N));
      }
      map.addLayer({
        id: 'zemin-doku', type: 'fill', source: src, minzoom: 14.5,
        filter: ['==', ['get', 'katman'], 'ada'],
        paint: {
          'fill-pattern': 'zemin-doku',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 16, 0.85]
        }
      });

      // Kara katmanı görünmez: tıklama ve katman sırası için duruyor
      map.addLayer({
        id: 'ada',
        type: 'fill',
        source: src,
        filter: ['==', ['get', 'katman'], 'ada'],
        paint: { 'fill-color': KARA.taban, 'fill-opacity': 0 }
      });

      // ---- mahalle sınırları ----
      map.addLayer({
        id: 'mahalle-dolgu',
        type: 'fill',
        source: src,
        filter: ['==', ['get', 'katman'], 'mahalle'],
        paint: {
          'fill-color': [
            'match', ['get', 'id'],
            ...Object.entries(MAHALLE_TONU).flat(),
            '#8a7757'
          ] as unknown as maplibregl.ExpressionSpecification,
          // Sınır çizilmez; mahalle zeminde çok hafif bir tonla anlaşılır
          // (Kemal, 30 Eylül: "ad + zeminde çok hafif renk"). Üzerine
          // gelince biraz koyulaşır — tıklanabilir olduğu anlaşılsın.
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'uzerinde'], false], 0.2,
            0.08
          ]
        }
      });


      // ---- yollar ----
      // Dört kademe: ana yol (aynı zamanda mahalle sınırı), cadde, yol,
      // sokak. Kalınlık kademeyle değişiyor ki ağ ilk bakışta okunsun.
      const kademe = (anaYol: number, cadde: number, yol: number, sokak: number) => ([
        'case',
        ['==', ['get', 'tur'], 'ana yol'], anaYol,
        ['==', ['get', 'tur'], 'cadde'], cadde,
        ['==', ['get', 'tur'], 'sokak'], sokak,
        yol
      ] as unknown as maplibregl.ExpressionSpecification);

      // Yol genişliği gerçek metre (2 Ekim gece, Kemal: "yol ölçeği bir
      // türlü oturmadı"). Eskiden piksel sabitti: yaklaşınca yollar evlere
      // göre inceliyordu. 15. yakınlıktan sonra genişlik metreyle büyür
      // (2 tabanlı üstel = haritanın kendi ölçeği); uzakta okunur kalsın diye
      // 11'de en az piksel.
      const pikselMetre = (z: number) => (512 * 2 ** z) / (40075016.686 * Math.cos((39.6 * Math.PI) / 180));
      const metreyle = (enAz: number | maplibregl.ExpressionSpecification, m: number | maplibregl.ExpressionSpecification) => ([
        'interpolate', ['exponential', 2], ['zoom'],
        11, enAz,
        15, typeof m === 'number' ? m * pikselMetre(15) : ['*', m, pikselMetre(15)],
        22, typeof m === 'number' ? m * pikselMetre(22) : ['*', m, pikselMetre(22)]
      ] as unknown as maplibregl.ExpressionSpecification);

      const surulebilir: maplibregl.FilterSpecification = [
        'all', ['==', ['get', 'katman'], 'yol'],
        ['!', ['in', ['get', 'tur'], ['literal', ['merdiven', 'toprak', 'patika']]]]
      ];

      map.addLayer({
        id: 'yol-kaplama',
        type: 'line',
        source: src,
        filter: surulebilir,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': YOL.kaplama,
          'line-opacity': 0.7,
          // metre: ana yol 10, cadde 8, yol 7, sokak 5
          'line-width': metreyle(kademe(4.2, 2.6, 2.2, 1.3), kademe(10, 8, 7, 5))
        }
      });

      map.addLayer({
        id: 'yol-dolgu',
        type: 'line',
        source: src,
        filter: surulebilir,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': YOL.dolgu,
          'line-opacity': 0.88,
          'line-width': metreyle(kademe(2.2, 1.3, 1.0, 0.6), kademe(8.4, 6.6, 5.6, 3.8))
        }
      });

      // ---- merdiven: basamakları andıran kesikli çizgi ----
      map.addLayer({
        id: 'merdiven',
        type: 'line',
        source: src,
        filter: ['all', ['==', ['get', 'katman'], 'yol'],
                 ['==', ['get', 'tur'], 'merdiven']],
        layout: { 'line-cap': 'butt' },
        paint: {
          'line-color': KARA.kiyiCizgi,
          'line-opacity': 0.75,
          'line-width': metreyle(1, 2.5),
          'line-dasharray': [0.6, 0.5]
        }
      });

      // ---- Kurucu'dan gelen toprak yol ve patika ----
      map.addLayer({
        id: 'toprak-yol',
        type: 'line',
        source: src,
        filter: ['all', ['==', ['get', 'katman'], 'yol'], ['==', ['get', 'tur'], 'toprak']],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#B08F72',
          'line-opacity': 0.85,
          'line-width': metreyle(1, 4),
          'line-dasharray': [3, 1.5]
        }
      });
      map.addLayer({
        id: 'patika',
        type: 'line',
        source: src,
        filter: ['all', ['==', ['get', 'katman'], 'yol'], ['==', ['get', 'tur'], 'patika']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#6F5E48',
          'line-opacity': 0.75,
          'line-width': metreyle(0.8, 1.5),
          'line-dasharray': [1, 1.6]
        }
      });

      // ---- zemin öğeleri: teras ve bahçe ----
      // Düz plaka DEĞİL, araziye giydirilen dolgu. Uçurumun başındaki
      // teras prizma olarak çizilince tabanı düz kalıyor ve yamacın
      // üstünde havada bir çıkma gibi sarkıyordu; `fill` araziyi birebir
      // takip ediyor.
      map.addLayer({
        id: 'zemin-plaka',
        type: 'fill',
        source: src,
        filter: ['==', ['get', 'katman'], 'zemin'],
        paint: {
          'fill-color': [
            'case', ['==', ['get', 'tur'], 'bahçe'], ZEMIN.bahce,
            ['==', ['get', 'tur'], 'saha'], '#A9C08F',
            ['==', ['get', 'tur'], 'avlu'], ZEMIN.avlu,
            ['==', ['get', 'tur'], 'meydan'], ZEMIN.meydan,
            ['==', ['get', 'tur'], 'tarla'], ZEMIN.tarla,
            ['==', ['get', 'tur'], 'bağ'], ZEMIN.bag,
            // Doğa alanları (Kurucu, 29 Eylül)
            ['==', ['get', 'tur'], 'zeytinlik'], '#8FA25E',
            ['==', ['get', 'tur'], 'orman'], '#4F6F42',
            ['==', ['get', 'tur'], 'kumsal'], '#EBDDB0',
            ZEMIN.teras
          ],
          'fill-opacity': 0.92
        }
      });

      map.addLayer({
        id: 'zemin-kenar',
        type: 'line',
        source: src,
        filter: ['==', ['get', 'katman'], 'zemin'],
        paint: {
          'line-color': [
            'case', ['==', ['get', 'tur'], 'bahçe'], ZEMIN.bahceKenar,
            ['==', ['get', 'tur'], 'meydan'], ZEMIN.meydanKenar,
            ['in', ['get', 'tur'], ['literal', ['tarla', 'bağ', 'zeytinlik']]], ZEMIN.bolmeKenar,
            ZEMIN.terasKenar
          ],
          // Avlunun kenar çizgisi evlerin dibinde gürültü yapıyor: yok
          'line-opacity': ['case', ['==', ['get', 'tur'], 'avlu'], 0, 1],
          'line-width': 1.1
        }
      });

      // ---- bahçe duvarları (2 Ekim gece): parseller arası alçak taş duvar ----
      map.addLayer({
        id: 'bahce-duvari',
        type: 'line',
        source: src,
        minzoom: 15,
        filter: ['==', ['get', 'katman'], 'duvar'],
        paint: {
          'line-color': ZEMIN.duvar,
          'line-opacity': 0.9,
          'line-width': metreyle(0.4, 0.6)
        }
      });

      // ---- binalar: prizmalar ----
      map.addLayer({
        id: 'bina-golge',
        type: 'fill',
        source: src,
        filter: ['==', ['get', 'katman'], 'bina'],
        paint: {
          'fill-color': 'rgba(90, 76, 56, 0.30)',
          'fill-translate': [3, 3],
          'fill-translate-anchor': 'viewport'
        }
      });

      map.addLayer({
        id: 'binalar',
        type: 'fill-extrusion',
        source: src,
        filter: ['==', ['get', 'katman'], 'bina'],
        paint: {
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'uzerinde'], false], YAPI.vurgu,
            ['==', ['get', 'tur'], 'otel'], YAPI.otel,
            ['==', ['get', 'tur'], 'kule'], YAPI.kule,
            ['==', ['get', 'tur'], 'fener'], YAPI.fener,
            ['==', ['get', 'tur'], 'stadyum'], YAPI.stadyum,
            ['==', ['get', 'tur'], 'kulüp'], YAPI.kulup,
            ['==', ['get', 'tur'], 'direk'], '#9AA0A6',
            ['==', ['get', 'tur'], 'iskele'], YAPI.iskele,
            ['==', ['get', 'tur'], 'Özel yapı'], '#EDE3D1',
            // Dolu ev (3 Kasım): içinde kayıtlı biri oturuyorsa kâğıt beyazı,
            // boş evlerden bir ton açık. Durum yalnız evlere konuyor.
            ['boolean', ['feature-state', 'dolu'], false], '#FAF8F5',
            // Evler: badana, krem, taş ve soluk mavi (2 Ekim, ayrıntı)
            // Kurucu'da konan ev ve "Mahalle doldur" evleri de aynı renkleri alır
            ['any', ['==', ['get', 'tur'], 'ev'], ['in', ['get', 'kurucuTur'], ['literal', ['ev', 'dukkanli', 'yazlik']]]],
            ['step', ['get', 'sans'], '#EDE7DA', 0.38, '#E4D9C4', 0.62, '#D6C7A8', 0.82, '#C9B48F', 0.93, '#C8D2D6'],
            YAPI.genel
          ],
          // Haritada gerçek 3B arazi yok: prizmalar kâğıdın üstünde durur.
          // Arazi kotu `taban` özelliğinde saklı ve künyede rakım olarak
          // gösteriliyor; buraya taşınırsa yapı havada asılı kalıyor.
          'fill-extrusion-base': 0,
          'fill-extrusion-height': ['get', 'yukseklik'],
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true
        }
      });

      // ---- ayrıntı: çatılar, fenerin tepesi, ağaçlar (2 Ekim) ----
      // Süs katmanı; tıklanmaz. Ağaçlar yakına gelince görünür.
      map.addSource('ayrinti', { type: 'geojson', data: ayrintiVerisi(duzeniUygula(DUZADA_GEO, ilkDuzen.current)) as never });
      map.addLayer({
        id: 'ayrinti-yapi', type: 'fill-extrusion', source: 'ayrinti',
        filter: ['!=', ['get', 'tur'], 'agac'],
        paint: {
          'fill-extrusion-color': ['get', 'renk'],
          'fill-extrusion-base': ['get', 'alt'],
          'fill-extrusion-height': ['get', 'ust'],
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true
        }
      });
      map.addLayer({
        id: 'ayrinti-agac', type: 'fill-extrusion', source: 'ayrinti', minzoom: 13.2,
        filter: ['==', ['get', 'tur'], 'agac'],
        paint: {
          'fill-extrusion-color': ['get', 'renk'],
          'fill-extrusion-base': ['get', 'alt'],
          'fill-extrusion-height': ['get', 'ust'],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 14, 0.95],
          'fill-extrusion-vertical-gradient': true
        }
      });

      if (!vitrin) etiketleriKur();
      try {
        atmosferNesnesi.current = new Atmosfer(map, duzeniUygula(DUZADA_GEO, ilkDuzen.current), atmosferAyari.current);
      } catch (e) {
        // Atmosfer süstür: kurulamazsa harita yine çalışır
        console.error('[harita] atmosfer kurulamadı', e);
      }
      setHazir(true);
      if (vitrin) donmeyeBasla();
      setZoom(map.getZoom());
    };

    // Vitrin: ada yavaşça döner (turu ~4 dakika). Hareket azaltma açıksa durur.
    const donmeyeBasla = () => {
      let azalt = false;
      try { azalt = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* yok */ }
      if (azalt) return;
      const don = () => { if (harita.current === map) map.rotateTo(map.getBearing() + 90, { duration: 60000, easing: t => t }); };
      map.on('rotateend', don);
      don();
    };

    /**
     * React StrictMode efekti iki kez çalıştırır ve stil ikinci turda çoktan
     * yüklenmiş olabilir; o durumda `once('load')` hiç tetiklenmez. Bu yüzden
     * yüklüyse doğrudan kuruyoruz.
     */
    // Açılış hızı (3. gece): 3B haritanın ilk tam çizimi
    map.once('idle', () => isaretle('harita-hazir'));
    if (map.isStyleLoaded()) katmanlariKur();
    else map.once('load', katmanlariKur);

    // ---- etkileşim ----
    let uzerindeki: string | number | null = null;

    const uzerineGel = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      if (uzerindeki !== null) {
        map.setFeatureState({ source: 'duzada', id: uzerindeki }, { uzerinde: false });
      }
      const kimlik = (f.id ?? f.properties?.id) as string | number | undefined;
      if (kimlik !== undefined) {
        uzerindeki = kimlik;
        map.setFeatureState({ source: 'duzada', id: kimlik }, { uzerinde: true });
      }
    };

    const uzerindenCik = () => {
      map.getCanvas().style.cursor = '';
      if (uzerindeki !== null) {
        map.setFeatureState({ source: 'duzada', id: uzerindeki }, { uzerinde: false });
      }
      uzerindeki = null;
    };

    ['binalar', 'mahalle-dolgu'].forEach(katman => {
      map.on('mousemove', katman, uzerineGel);
      map.on('mouseleave', katman, uzerindenCik);
    });

    map.on('click', e => {
      const bulunan = map.queryRenderedFeatures(e.point, {
        layers: ['binalar', 'mahalle-dolgu']
      });
      const f = bulunan[0];
      if (!f) {
        setSecim(null);
        return;
      }
      const p = f.properties || {};
      const detay =
        p.katman === 'bina'
          ? [
              p.kat ? `${p.kat} kat` : null,
              p.yukseklik ? `${p.yukseklik} m yükseklik` : null,
              // arazi kotu: prizmalar kâğıdın üstünde duruyor, rakım burada
              typeof p.taban === 'number' && p.taban >= 1
                ? `${Math.round(p.taban)} m rakım` : null
            ].filter(Boolean).join(' · ')
          : p.alanKm2 ? `${p.alanKm2} km²` : undefined;

      if (evMi(p)) {
        // Ev kartı (3 Kasım): numara, mahalle, oturanlar
        const no = evNumarasi(p.id);
        const wikiId = typeof p.wikiId === 'string' && p.wikiId ? p.wikiId : '';
        const mahalle = p.mahalle ? MAHALLE_ADI.get(String(p.mahalle)) : undefined;
        setSecim({
          wikiId,
          ad: no ? `Ev no. ${no}` : 'Ev',
          tur: [mahalle, p.ad && p.ad !== 'Ev' ? String(p.ad) : null].filter(Boolean).join(' · ') || 'Ev',
          detay: detay || undefined,
          evId: String(p.id ?? '')
        });
        return;
      }

      setSecim({
        // H8: wikiId yoksa yoktur. Eskiden kimliğe düşülüyordu; o yüzden
        // apartmana tıklayınca "Maddeye git" çıkıyor, basınca hiçbir şey
        // olmuyordu. Artık düğme yalnız gerçek madde varsa görünüyor.
        wikiId: typeof p.wikiId === 'string' && p.wikiId ? p.wikiId : '',
        ad: String(p.ad || ''),
        tur: p.katman === 'bina' ? String(p.tur || 'yapı') : 'Mahalle',
        detay
      });
    });

    const hareket = () => {
      setYon(map.getBearing());
      setZoom(map.getZoom());
      setEgim(map.getPitch());
      etiketGorunurluk(map.getZoom());
      etiketleriYukselt();
    };
    map.on('move', hareket);

    return () => {
      isaretciler.forEach(m => m.remove());
      atmosferNesnesi.current?.kaldir();
      atmosferNesnesi.current = null;
      map.remove();
      harita.current = null;
    };
  }, []);

  // Düzen değişince (buluttan geldi ya da düzenleyiciden kaydedildi) yeniden çiz
  useEffect(() => {
    const map = harita.current;
    if (!map || !hazir) return;
    const uygulanan = duzeniUygula(DUZADA_GEO, duzen ?? null);
    setCizili(uygulanan);
    (map.getSource('duzada') as maplibregl.GeoJSONSource | undefined)
      ?.setData(atmosferVerisi(uygulanan) as never);
    (map.getSource('ayrinti') as maplibregl.GeoJSONSource | undefined)
      ?.setData(ayrintiVerisi(uygulanan) as never);
    // Etiketler işaretçi olduğu için kaynakla birlikte güncellenmiyor
    if (!vitrin) etiketleriKurRef.current?.(uygulanan);
  }, [duzen, hazir, vitrin]);

  // Dolu evler (3 Kasım): kayıtlardan okunur, haritada yalnız görünüm durumu
  // olarak işaretlenir (kayda yazılmaz)
  const oturanlar = useMemo(() => oturanlariOku(duzen), [duzen]);
  const sakinler = useMemo(
    () => (items && cizili ? evSakinleri(items, cizili, oturanlar) : null),
    [items, cizili, oturanlar]
  );
  useEffect(() => {
    const map = harita.current;
    if (!map || !hazir || !cizili) return;
    const yeni = new Set<string>();
    if (sakinler) {
      for (const f of cizili.features) {
        const p = f.properties as Record<string, unknown> | null;
        if (evMi(p) && sakinler.evlere.get(String(p?.id ?? ''))?.length) yeni.add(String(p?.id));
      }
    }
    for (const id of doluRef.current) if (!yeni.has(id)) map.setFeatureState({ source: 'duzada', id }, { dolu: false });
    for (const id of yeni) map.setFeatureState({ source: 'duzada', id }, { dolu: true });
    doluRef.current = yeni;
  }, [sakinler, cizili, hazir]);
  const doluEvSayisi = useMemo(() => (sakinler ? [...sakinler.evlere.values()].filter(l => l.length).length : 0), [sakinler]);
  const oturanSayisi = useMemo(() => (sakinler ? new Set([...sakinler.evlere.values()].flat().map(s => s.id)).size : 0), [sakinler]);

  // Ev kartı (3 Kasım): seçili evin oturanları ve "Oturan ekle"
  const seciliOturanlar = secim?.evId ? (sakinler?.evlere.get(secim.evId) ?? []) : [];
  /** Bu eve Kurucu'da / ev kartında eklenmiş kişiler (çıkarılabilenler) */
  const ekliOturanlar = secim?.evId ? (oturanlar[secim.evId] ?? []) : [];
  const evKisileri = useMemo(() => (items ?? []).filter(i => kisiMi(i) && !i.archived && !i.isProposal), [items]);
  useEffect(() => { setOturanDuzen(null); setOturanHata(null); }, [secim?.evId]);
  const oturanlariKaydet = async () => {
    if (!onOturanlariKaydet || !secim?.evId || !oturanDuzen || oturanYaziliyor) return;
    setOturanYaziliyor(true);
    setOturanHata(null);
    try {
      await onOturanlariKaydet(secim.evId, oturanDuzen.secilen);
      setOturanDuzen(null);
    } catch (e) {
      setOturanHata(e instanceof Error && e.message ? e.message : 'Kaydedilemedi; yeniden dene.');
    } finally {
      setOturanYaziliyor(false);
    }
  };

  // Atmosfer düğmeleri (KKM) değişince
  useEffect(() => {
    atmosferAyari.current = atmosfer;
    atmosferNesnesi.current?.ayarla(atmosfer);
  }, [atmosfer.trafik, atmosfer.saat, atmosfer.mevsim]); // eslint-disable-line react-hooks/exhaustive-deps

  // Katmanlar (5. gece): yollar, yapılar, doğa açılıp kapanır; adlar sınıfla gizlenir
  const katman = katmanlar ?? KATMANLAR_ACIK;
  useEffect(() => {
    const map = harita.current;
    if (!map || !hazir) return;
    const gruplar: Array<[boolean, string[]]> = [
      [katman.yollar, ['yol-kaplama', 'yol-dolgu', 'merdiven', 'toprak-yol', 'patika']],
      [katman.binalar, ['binalar', 'bina-golge', 'ayrinti-yapi', 'zemin-plaka', 'zemin-kenar', 'bahce-duvari']],
      [katman.doga, ['ayrinti-agac']]
    ];
    for (const [acik, kimlikler] of gruplar) {
      for (const id of kimlikler) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', acik ? 'visible' : 'none');
    }
  }, [hazir, katman.yollar, katman.binalar, katman.doga]);

  // İşaretler (5. gece): not hardal, madde kiremit iğne; basınca seçim kartı
  useEffect(() => {
    const map = harita.current;
    if (!map || !hazir || vitrin) return;
    const konanlar: maplibregl.Marker[] = [];
    for (const i of isaretler || []) {
      if (i.tur === 'not' ? !katman.notlar : !katman.maddeler) continue;
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
      const ad = document.createElement('span');
      ad.textContent = i.ad;
      ad.style.cssText = 'font:600 11px Poppins,sans-serif;color:#FAF8F5;text-shadow:0 0 3px rgba(14,28,79,.9),0 0 2px rgba(14,28,79,.9);white-space:nowrap;margin-bottom:2px;';
      el.appendChild(ad);
      const renk = i.tur === 'not' ? '#C99A2E' : '#F26B6F';
      el.insertAdjacentHTML('beforeend', `<svg width="22" height="30" viewBox="-11 -29 22 30" aria-hidden="true"><path d="M0,0 C-4.5,-9 -10,-13 -10,-20 A10,10 0 1 1 10,-20 C10,-13 4.5,-9 0,0Z" fill="${renk}" stroke="#0E1C4F" stroke-width="1.4"/><circle cy="-20" r="3.8" fill="#FAF8F5"/></svg>`);
      el.title = i.metin ? `${i.ad} — ${i.metin}` : i.ad;
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        setSecim({ wikiId: i.maddeId || '', ad: i.ad, tur: i.tur === 'not' ? 'Not' : 'Madde işareti', detay: i.metin || undefined });
      });
      konanlar.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(i.konum).addTo(map));
    }
    return () => konanlar.forEach(m => m.remove());
  }, [hazir, vitrin, isaretler, katman.notlar, katman.maddeler]);

  const gorunumuSifirla = () => {
    harita.current?.easeTo({ center: DUZADA_MERKEZ, ...BASLANGIC, duration: 1000 });
  };

  // Yukarıdan ↔ eğik bakış (3 Kasım): açılış eğik; düğme kamerayı dikleştirir, yeniden basınca geri eğer
  const yukaridan = egim < 5;
  const bakisiDegistir = () => {
    harita.current?.easeTo({ pitch: yukaridan ? EGIK : 0, duration: 700 });
  };

  return (
    // `relative` her zaman kalmalı: bilgi kartı, seçim kartı ve sıfırlama
    // düğmesi buna göre konumlanıyor. Dışarıdan sınıf verilince düşerse
    // kutular sayfanın kendisine yapışıyordu.
    <div className={`relative ${className ?? 'w-full h-full min-h-[520px]'}`}>
      <div
        ref={kapsayici}
        className={`w-full h-full overflow-hidden duzada-harita ${vitrin ? '' : 'rounded-lg'} ${katman.adlar ? '' : '[&_.duzada-etiket]:!opacity-0 [&_.duzada-etiket]:!pointer-events-none'}`}
      />


      {!vitrin && <>
      {/* Başlık kartuşu */}
      <div className="hidden sm:block absolute top-[4.25rem] left-4 px-4 py-3 rounded-sm bg-[#f4efe4]/94 backdrop-blur-[2px] border border-[#8a7757]/45 shadow-[2px_3px_0_0_rgba(90,76,56,0.14)] pointer-events-none">
        <p className="font-serif text-xl leading-none text-[#0e1c4f] tracking-wide">Düzada</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6f6047] mt-1.5">
          Ege Denizi
        </p>
        <div className="h-px bg-[#8a7757]/35 my-2" />
        <p className="font-mono text-[10px] text-[#6f6047] leading-relaxed">
          {DUZADA_ALAN_KM2} km²<br />
          zirve 742 m
        </p>
      </div>

      <PusulaGulu yon={yon} />
      <OlcekCubugu harita={harita} zoom={zoom} hazir={hazir} />

      {/* Seçim kartı */}
      {secim && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 p-4 rounded-sm bg-[#f4efe4]/96 backdrop-blur-[2px] border border-[#8a7757]/45 shadow-[2px_3px_0_0_rgba(90,76,56,0.14)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6f6047]">
            {secim.tur}
          </p>
          <p className="font-serif text-xl text-[#0e1c4f] leading-snug mt-1">{secim.ad}</p>
          {secim.detay && (
            <p className="font-mono text-[11px] text-[#6f6047] mt-1">{secim.detay}</p>
          )}
          {secim.evId !== undefined && (
            <div className="mt-2 pt-2 border-t border-[#8a7757]/30">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6f6047]">Oturanlar</p>
              {seciliOturanlar.length ? (
                <ul className="mt-1 space-y-0.5">
                  {seciliOturanlar.map(k => (
                    <li key={k.id} className="flex items-center justify-between gap-2 text-[13px] text-[#0e1c4f]">
                      <span className="truncate">{k.ad}</span>
                      {onSelect && (
                        <button type="button" onClick={() => onSelect(k.id)}
                          className="shrink-0 text-[11px] px-2 py-0.5 rounded-sm border border-[#0e1c4f]/35 hover:bg-[#0e1c4f] hover:text-[#f3efe8] transition-colors">
                          vikide aç
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[12px] text-[#6f6047]">Kayıtlı oturan yok.</p>
              )}
              {onOturanlariKaydet && secim.evId && !oturanDuzen && (
                <button type="button" onClick={() => setOturanDuzen({ ara: '', secilen: [...ekliOturanlar] })}
                  className="mt-2 text-[11px] px-2 py-0.5 rounded-sm border border-[#0e1c4f]/35 text-[#0e1c4f] hover:bg-[#0e1c4f] hover:text-[#f3efe8] transition-colors">
                  Oturan ekle
                </button>
              )}
              {oturanDuzen && (() => {
                const q = oturanDuzen.ara.trim().toLocaleLowerCase('tr');
                const adi = (id: string) => evKisileri.find(k => k.id === id)?.title ?? 'kişi bulunamadı';
                const liste = q ? evKisileri.filter(k => !oturanDuzen.secilen.includes(k.id) && k.title.toLocaleLowerCase('tr').includes(q)).slice(0, 6) : [];
                return (
                  <div className="mt-2">
                    {oturanDuzen.secilen.length > 0 && (
                      <ul className="space-y-0.5">
                        {oturanDuzen.secilen.map(id => (
                          <li key={id} className="flex items-center justify-between gap-2 text-[12px] text-[#0e1c4f]">
                            <span className="truncate">{adi(id)}</span>
                            <button type="button" onClick={() => setOturanDuzen(o => o && { ...o, secilen: o.secilen.filter(x => x !== id) })}
                              className="shrink-0 text-[11px] px-1.5 text-[#6f6047] hover:text-[#D6484C]">
                              çıkar
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input
                      value={oturanDuzen.ara}
                      onChange={e => setOturanDuzen(o => o && { ...o, ara: e.target.value })}
                      placeholder="Kişi ara…"
                      className="mt-1.5 w-full text-[12px] rounded-sm border border-[#8a7757]/45 bg-[#faf8f5] px-2 py-1 text-[#0e1c4f] focus:outline-hidden focus:border-[#F26B6F]"
                    />
                    {q && (
                      <ul className="mt-1 max-h-32 overflow-y-auto">
                        {liste.map(k => (
                          <li key={k.id}>
                            <button type="button" onClick={() => setOturanDuzen(o => o && { ara: '', secilen: [...o.secilen, k.id] })}
                              className="w-full text-left px-1.5 py-0.5 rounded-sm text-[12px] text-[#0e1c4f] hover:bg-[#e9e1d0]">
                              {k.title}
                            </button>
                          </li>
                        ))}
                        {!liste.length && <li className="px-1.5 py-0.5 text-[11px] text-[#6f6047]">Eşleşen kişi yok.</li>}
                      </ul>
                    )}
                    {oturanHata && <p className="mt-1 text-[11px] text-[#D6484C]">{oturanHata}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => void oturanlariKaydet()} disabled={oturanYaziliyor}
                        className="text-[12px] px-3 py-1 rounded-sm bg-[#0E1C4F] text-[#f3efe8] disabled:opacity-40">
                        {oturanYaziliyor ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                      <button type="button" onClick={() => setOturanDuzen(null)}
                        className="text-[12px] px-2 py-1 text-[#6f6047] hover:text-[#0e1c4f]">
                        vazgeç
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-[#6f6047] leading-snug">Viki maddesinden "Bulunduğu yer" bağıyla gelenler burada değişmez.</p>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            {secim.wikiId && onSelect && (
              <button
                type="button"
                onClick={() => onSelect(secim.wikiId)}
                className="text-[12px] px-3 py-1.5 rounded-sm border border-[#0e1c4f]/45 text-[#0e1c4f] hover:bg-[#0e1c4f] hover:text-[#f3efe8] transition-colors"
              >
                Viki maddesini aç
              </button>
            )}
            <button
              type="button"
              onClick={() => setSecim(null)}
              className="text-[12px] px-2 py-1.5 text-[#6f6047] hover:text-[#0e1c4f] transition-colors"
            >
              kapat
            </button>
          </div>
        </div>
      )}

      {hazir && sakinler && (
        <div className="hidden sm:block absolute bottom-[3.75rem] right-4 max-w-[15rem] px-3 py-2 rounded-sm bg-[#f4efe4]/94 backdrop-blur-[2px] border border-[#8a7757]/45 text-[#6f6047] pointer-events-none">
          <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-[#FAF8F5] border border-[#8a7757]/60" />dolu ev</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-[#D6C7A8] border border-[#8a7757]/60" />boş ev</span>
          </p>
          <p className="font-mono text-[10px] mt-1">{doluEvSayisi} dolu ev · {oturanSayisi} kişi</p>
          {sakinler.baglanamayan > 0 && (
            <p className="text-[10px] mt-0.5 leading-snug">{sakinler.baglanamayan} kişinin künyesinde ev yazılı, haritada bir eve bağlı değil.</p>
          )}
        </div>
      )}

      {hazir && (
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={bakisiDegistir}
          aria-pressed={yukaridan}
          title={yukaridan ? 'Eğik 3B bakışa dön' : 'Haritaya tam yukarıdan bak'}
          className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-2 rounded-sm bg-[#f4efe4]/94 backdrop-blur-[2px] border border-[#8a7757]/45 text-[#6f6047] hover:text-[#0e1c4f] transition-colors"
        >
          {yukaridan ? 'eğik bak' : 'yukarıdan bak'}
        </button>
        <button
          type="button"
          onClick={gorunumuSifirla}
          className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-2 rounded-sm bg-[#f4efe4]/94 backdrop-blur-[2px] border border-[#8a7757]/45 text-[#6f6047] hover:text-[#0e1c4f] transition-colors"
        >
          görünümü sıfırla
        </button>
        </div>
      )}
      </>}
    </div>
  );
};
