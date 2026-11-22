import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BookOpen, Feather, History, Image as GorselSimgesi, ImageOff, Map as HaritaSimgesi, Maximize2, Minimize2, Mountain, X } from 'lucide-react';
import type { Item } from '../../types';
import { ESLEME, kisaGiris } from '../../lib/yasayanHarita';
import { maddeGorseli } from '../../lib/maddeGorseli';
import { GorselImg } from '../GorselImg';
import { GOK } from './haritaStili';
import { DenizKatmani } from './tek/denizKatmani';
import { geoOku, indirme, kumIsaretle, rakim, yapilariOku, zeminOku, type Yapi, type Zemin } from './tek/tekVeri';
import { ZeminKatmani } from './tek/zeminKatmani';
import { YolKatmani } from './tek/yolKatmani';
import { YapiKatmani } from './tek/yapiKatmani';
import { SinirKatmani, type Etiket } from './tek/sinirKatmani';
import { AgacKatmani, agaclariOku } from './tek/agacKatmani';

/**
 * Tek harita (6. adım, 21 Kasım; Kemal'in 20 Kasım kararları): eski 3B, yeni 3B
 * ve 2B "kur" haritalarının yerine gelecek tek harita. Kompakt adanın verisi
 * `public/harita/` altındaki statik dosyalardan iner (zemin, yollar, mahalleler,
 * yapılar); modeller yalnız KKM'nin kendi modelleri (`public/modeller/`).
 *
 * - Açılış 3B (eğik); "Tepeden" düğmesi üstten bakış (anlık mahalle haritası).
 * - Hafif mod (telefon): zemin daha kaba, modeller daha dar çevrede, gölge yok.
 *   Seçim bu tarayıcıda hatırlanır.
 * - Viki bağlı yapıya (ya da adına) dokununca kart: ad, kısa giriş, görsel, "Vikide aç".
 *
 * Yalnız okuma: Firestore'a, harita kaydına, Kurucu taslağına hiçbir şey yazılmaz;
 * Kurucu kayıtları da okunmaz. Viki maddeleri yalnız kart için okunur.
 */

type Props = {
  className?: string;
  items?: Item[];
  onMaddeAc?: (id: string) => void;
  /** Eski haritalara geçiş (11. adıma kadar duruyorlar) */
  onEskiHarita?: () => void;
};

type Olcum = { yuklemeMs: number; mb: number; ucgen: number; modelli: number; fps: number };

const HAFIF_ANAHTARI = 'kems_tek_harita_hafif';
const EGIM_3B = THREE.MathUtils.degToRad(52);

/** Telefon mu (dokunmatik ve dar ekran): hafif mod buna göre açılır */
const telefonMu = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;

export const TekHarita: React.FC<Props> = ({ className, items, onMaddeAc, onEskiHarita }) => {
  const kap = useRef<HTMLDivElement>(null);
  const etiketKabi = useRef<HTMLDivElement>(null);
  const [hata, setHata] = useState('');
  const [hazir, setHazir] = useState(false);
  const [tepeden, setTepeden] = useState(false);
  const [hafif, setHafif] = useState<boolean>(() => {
    try { const v = localStorage.getItem(HAFIF_ANAHTARI); if (v === '1' || v === '0') return v === '1'; } catch { /* yok */ }
    return telefonMu();
  });
  const [tamEkran, setTamEkran] = useState(false);
  const [secili, setSecili] = useState<string | null>(null);
  const [olcum, setOlcum] = useState<Olcum>({ yuklemeMs: 0, mb: 0, ucgen: 0, modelli: 0, fps: 0 });
  const [etiketler, setEtiketler] = useState<Etiket[]>([]);
  const [yapilar, setYapilar] = useState<Map<string, Yapi>>(new Map());

  // Sahneye dışarıdan erişim (düğmeler): kurulunca dolar
  const sahneRef = useRef<{ tepeden: (a: boolean) => void; hafif: (a: boolean) => void; adaya: () => void; yapiyaUc: (y: Yapi) => void } | null>(null);
  // Telefonda kartın görseli dokununca açılır (21 Kasım, Kemal)
  const [gorselAcik, setGorselAcik] = useState(false);
  const [mahalleAdlari, setMahalleAdlari] = useState<Map<string, string>>(new Map());
  const hafifRef = useRef(hafif);

  const kart = useMemo(() => {
    const y = secili ? yapilar.get(secili) : undefined;
    if (!y) return null;
    const madde = y.vikiId ? items?.find(i => i.id === y.vikiId && !i.archived) : undefined;
    const ikinci = (ESLEME[y.id]?.ikinci ?? []).map(id => items?.find(i => i.id === id)).filter((i): i is Item => !!i && i.id !== madde?.id);
    // Mahalle ve tür satırı (21 Kasım, Kemal): mahalle haritadan, tür vikiden
    const altSatir = [mahalleAdlari.get(y.mahalle), madde?.type].filter(Boolean).join(' · ');
    return { ad: madde?.title ?? y.ad ?? '', madde, ikinci, giris: madde ? kisaGiris(madde) : '', altSatir };
  }, [secili, yapilar, items, mahalleAdlari]);
  // Kart açılınca kamera yapıya yumuşakça yaklaşır (21 Kasım, Kemal)
  useEffect(() => {
    setGorselAcik(false);
    const y = secili ? yapilar.get(secili) : undefined;
    if (y) sahneRef.current?.yapiyaUc(y);
  }, [secili, yapilar]);
  const kartGorseli = useMemo(() => (kart?.madde ? maddeGorseli(kart.madde, items ?? []) : undefined), [kart, items]);

  useEffect(() => {
    const kab = kap.current;
    if (!kab) return;
    const basla = performance.now();
    const masaustu = window.matchMedia('(pointer: fine)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: masaustu, powerPreference: 'high-performance' });
    const pikselOrani = () => (hafifRef.current ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setPixelRatio(pikselOrani());
    renderer.setSize(kab.clientWidth, kab.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    kab.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const sahne = new THREE.Scene();
    sahne.background = new THREE.Color(GOK.pus);
    const sis = new THREE.Fog(GOK.pus, 10000, 40000);
    sahne.fog = sis;
    const kamera = new THREE.PerspectiveCamera(45, kab.clientWidth / Math.max(1, kab.clientHeight), 2, 80000);
    const kontrol = new OrbitControls(kamera, renderer.domElement);
    kontrol.enableDamping = true;
    kontrol.dampingFactor = 0.08;
    kontrol.screenSpacePanning = false;
    kontrol.minDistance = 25;
    kontrol.maxDistance = 22000;
    kontrol.maxPolarAngle = THREE.MathUtils.degToRad(80);

    sahne.add(new THREE.HemisphereLight('#F4F1EA', '#8a7a5c', 1.15));
    const gunes = new THREE.DirectionalLight('#fff4e0', 2.4);
    const gunesYonu = new THREE.Vector3(-0.55, 1, 0.4).normalize();
    gunes.shadow.mapSize.set(2048, 2048);
    gunes.shadow.bias = -0.0004;
    gunes.shadow.normalBias = 0.6;
    sahne.add(gunes, gunes.target);

    // Deniz: saydam yüzey (sığ dip görünür) ve altında koyu düzlem
    const denizYuzu = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#5C9DBE', transparent: true, opacity: 0.72, depthWrite: false }));
    denizYuzu.renderOrder = 10;
    const denizDibi = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3B7BA3' }));
    denizDibi.position.y = -30;
    sahne.add(denizDibi, denizYuzu);

    let kapandi = false;
    let agac: AgacKatmani | null = null;
    let zemin: ZeminKatmani | null = null, yol: YolKatmani | null = null, yapi: YapiKatmani | null = null, sinir: SinirKatmani | null = null, deniz: DenizKatmani | null = null;
    let etiketListesi: Etiket[] = [];
    let zv: Zemin | null = null;
    const sinirAlt = new THREE.Vector3(), sinirUst = new THREE.Vector3();
    let bekleme: ReturnType<typeof setTimeout> | undefined;
    const durdur = new AbortController();

    const derinlikAyari = () => {
      const u = kamera.position.distanceTo(kontrol.target);
      kamera.near = THREE.MathUtils.clamp(u / 400, 1, 40);
      kamera.far = u + 40000;
      kamera.updateProjectionMatrix();
      sis.near = u * 1.6;
      sis.far = u * 1.6 + Math.max(9000, u * 3);
    };
    const golgeAcik = () => !hafifRef.current && kamera.position.distanceTo(kontrol.target) < 2600;
    const golgeAyari = () => {
      const u = kamera.position.distanceTo(kontrol.target);
      const acik = golgeAcik();
      gunes.castShadow = acik;
      const s = THREE.MathUtils.clamp(u * 0.7, 120, 900);
      const c = gunes.shadow.camera;
      c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 10; c.far = 4000;
      c.updateProjectionMatrix();
      gunes.target.position.copy(kontrol.target);
      gunes.position.copy(kontrol.target).addScaledVector(gunesYonu, 1800);
    };
    const guncelle = () => {
      if (kapandi || !zemin || !yapi) return;
      const u = kamera.position.distanceTo(kontrol.target);
      zemin.guncelle(kamera.position, hafifRef.current, golgeAcik());
      yapi.guncelle(kontrol.target, u, hafifRef.current, golgeAcik());
      agac?.guncelle(kontrol.target, u, hafifRef.current, golgeAcik(), zemin.ucgen + (yol?.ucgen ?? 0) + yapi.ucgen);
    };
    const kayma = new THREE.Vector3();
    kontrol.addEventListener('change', () => {
      if (zv) {
        kayma.copy(kontrol.target).clamp(sinirAlt, sinirUst).sub(kontrol.target);
        // Hedef zeminde dursun (tepede yakınlaşınca kamera yamaca girmesin)
        kayma.y = Math.max(0, rakim(zv, kontrol.target.x, kontrol.target.z)) - kontrol.target.y;
        if (kayma.lengthSq() > 0.25) { kontrol.target.add(kayma); kamera.position.add(kayma); }
        const alt = Math.max(0, rakim(zv, kamera.position.x, kamera.position.z)) + 6;
        if (kamera.position.y < alt) kamera.position.y = alt;
      }
      derinlikAyari();
      golgeAyari();
      if (bekleme) clearTimeout(bekleme);
      bekleme = setTimeout(guncelle, 120);
    });

    // Kamera: hedef, uzaklık, eğim (dikeyden), yön (kuzeyden saat yönü)
    const bak = (x: number, z: number, u: number, egim = EGIM_3B, aci = 0) => {
      const y = zv ? Math.max(0, rakim(zv, x, z)) : 0;
      kontrol.target.set(x, y, z);
      kamera.position.set(x + u * Math.sin(egim) * Math.sin(aci), y + u * Math.cos(egim), z + u * Math.sin(egim) * Math.cos(aci));
      kontrol.update();
      derinlikAyari();
      golgeAyari();
      guncelle();
    };
    let adaMerkezi = new THREE.Vector3(), adaUzakligi = 12000;
    const adaya = () => bak(adaMerkezi.x, adaMerkezi.z, adaUzakligi, tepedenMi ? 0.0001 : EGIM_3B);

    // Tepeden bakış: eğim kilitlenir, tek parmak kaydırır
    let tepedenMi = false;
    let gecis: { bas: number; e0: number; e1: number } | null = null;
    // Yapıya uçuş: hedef ve kamera birlikte kayar, bakış yönü korunur
    let ucus: { bas: number; t0: THREE.Vector3; t1: THREE.Vector3; p0: THREE.Vector3; p1: THREE.Vector3 } | null = null;
    const yapiyaUc = (y: Yapi) => {
      const t1 = new THREE.Vector3(y.merkez[0], Math.max(0, y.kot), y.merkez[1]);
      const fark = kamera.position.clone().sub(kontrol.target);
      const u = THREE.MathUtils.clamp(fark.length(), 160, Math.max(160, Math.min(fark.length(), 320)));
      ucus = { bas: performance.now(), t0: kontrol.target.clone(), t1, p0: kamera.position.clone(), p1: t1.clone().add(fark.setLength(u)) };
    };
    const tepedenAyarla = (acik: boolean) => {
      tepedenMi = acik;
      const sph = new THREE.Spherical().setFromVector3(kamera.position.clone().sub(kontrol.target));
      kontrol.minPolarAngle = 0; kontrol.maxPolarAngle = THREE.MathUtils.degToRad(80);
      gecis = { bas: performance.now(), e0: sph.phi, e1: acik ? 0.0001 : EGIM_3B };
      kontrol.enableRotate = !acik;
      kontrol.mouseButtons.LEFT = acik ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      kontrol.touches.ONE = acik ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      kontrol.screenSpacePanning = acik;
    };

    // Dokunma: viki bağlı yapının görünmez kutusu
    const isin = new THREE.Raycaster();
    const ekran = new THREE.Vector2();
    let basis: { x: number; y: number; t: number; id: number } | null = null;
    const basildi = (e: PointerEvent) => { ucus = null; basis = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null; };
    const birakildi = (e: PointerEvent) => {
      const b = basis; basis = null;
      if (!b || b.id !== e.pointerId || e.button > 0 || !yapi) return;
      if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > 6 || performance.now() - b.t > 600) return;
      const k = renderer.domElement.getBoundingClientRect();
      ekran.set(((e.clientX - k.left) / k.width) * 2 - 1, -((e.clientY - k.top) / k.height) * 2 + 1);
      isin.setFromCamera(ekran, kamera);
      const v = isin.intersectObjects(yapi.secim.children, false)[0];
      setSecili(v ? String(v.object.userData.yapi) : null);
    };
    renderer.domElement.addEventListener('pointerdown', basildi);
    renderer.domElement.addEventListener('pointerup', birakildi);

    // Veri: hepsi birlikte iner
    Promise.all([zeminOku(durdur.signal), geoOku('duzada-sinirlar.geojson', durdur.signal), geoOku('duzada-yollar.geojson', durdur.signal), geoOku('duzada-yapilar.geojson', durdur.signal)])
      .then(([z, sinirlar, yollar, yapiVerisi]) => {
        if (kapandi) return;
        kumIsaretle(z, sinirlar);
        zv = z;
        zemin = new ZeminKatmani(z);
        yol = new YolKatmani(z, yollar);
        const liste = yapilariOku(z, yapiVerisi);
        yapi = new YapiKatmani(liste, () => { /* model indi: sahne bir sonraki karede çizer */ });
        sinir = new SinirKatmani(z, sinirlar, liste);
        deniz = new DenizKatmani(z.b, yapiVerisi);
        sahne.add(zemin.grup, yol.grup, yapi.grup, sinir.grup, deniz.grup);
        etiketListesi = sinir.etiketler;
        setEtiketler(sinir.etiketler);
        setYapilar(new Map(liste.map(y => [y.id, y])));
        setMahalleAdlari(new Map(sinirlar.features.filter(f => f.properties.katman === 'mahalle').map(f => [String(f.properties.id), String(f.properties.ad ?? '')])));

        // Kara sınırı: ada ızgarada rakımı 0'dan büyük hücreler
        const { b, h } = z;
        let i0 = b.en, i1 = 0, j0 = b.boy, j1 = 0;
        for (let j = 0; j < b.boy; j += 2) for (let i = 0; i < b.en; i += 2) if (h[j * b.en + i] > 0) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
        sinirAlt.set(b.x0 + i0 * b.hucre, 0, -(b.y0 + j1 * b.hucre));
        sinirUst.set(b.x0 + i1 * b.hucre, 800, -(b.y0 + j0 * b.hucre));
        adaMerkezi = sinirAlt.clone().add(sinirUst).multiplyScalar(0.5).setY(0);
        const gen = sinirUst.x - sinirAlt.x, der = sinirUst.z - sinirAlt.z;
        const dy = THREE.MathUtils.degToRad(kamera.fov / 2), dx = Math.atan(Math.tan(dy) * kamera.aspect);
        adaUzakligi = Math.min(kontrol.maxDistance, 1.05 * Math.max((der / 2) / Math.tan(dy) * 0.8, (gen / 2) / Math.tan(dx)));
        adaya();
        // Ağaçlar ayrı iner; inmezse harita ağaçsız açılır
        agaclariOku(durdur.signal).then(v => {
          if (kapandi || !zemin) return;
          agac = new AgacKatmani(z, v, () => { /* model indi */ });
          agac.zemineBoya(zemin);
          sahne.add(agac.grup);
          guncelle();
        }).catch(e => { if (!(e instanceof DOMException && e.name === 'AbortError')) console.warn('[tek harita] ağaçlar inmedi', e); });
        setOlcum(o => ({ ...o, yuklemeMs: performance.now() - basla, mb: indirme.bayt / 1e6 }));
        setHazir(true);
      })
      .catch(e => {
        if (kapandi || (e instanceof DOMException && e.name === 'AbortError')) return;
        setHata(`Harita verisi inmedi: ${e instanceof Error ? e.message : String(e)}`);
      });

    sahneRef.current = {
      tepeden: tepedenAyarla,
      hafif: (a: boolean) => { hafifRef.current = a; renderer.setPixelRatio(pikselOrani()); golgeAyari(); guncelle(); },
      adaya,
      yapiyaUc
    };

    // Adların ekrandaki yeri her karede (yalnız birkaç düzine)
    const v = new THREE.Vector3();
    const etiketleriYerlestir = () => {
      const kab2 = etiketKabi.current;
      if (!kab2) return;
      const u = kamera.position.distanceTo(kontrol.target);
      const w = kab.clientWidth, hh = kab.clientHeight;
      const ogeler = kab2.children;
      for (let n = 0; n < etiketListesi.length && n < ogeler.length; n++) {
        const e = etiketListesi[n];
        const el = ogeler[n] as HTMLElement;
        const goster = e.tur === 'mahalle' ? u > 1400 : e.tur === 'zirve' ? u > 900 && u < 16000
          : u < 3000 && Math.hypot(e.x - kontrol.target.x, e.z - kontrol.target.z) < Math.max(700, u * 0.9);
        v.set(e.x, e.y, e.z).project(kamera);
        if (!goster || v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { el.style.display = 'none'; continue; }
        el.style.display = '';
        el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hh}px) translate(-50%, -100%)`;
      }
    };

    let kare = 0, son = performance.now();
    renderer.setAnimationLoop(() => {
      if (ucus) {
        const t = Math.min(1, (performance.now() - ucus.bas) / 900);
        const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        kontrol.target.lerpVectors(ucus.t0, ucus.t1, k);
        kamera.position.lerpVectors(ucus.p0, ucus.p1, k);
        if (t >= 1) { ucus = null; guncelle(); }
      }
      if (gecis) {
        const t = Math.min(1, (performance.now() - gecis.bas) / 600);
        const e = gecis.e0 + (gecis.e1 - gecis.e0) * (1 - (1 - t) ** 3);
        const sph = new THREE.Spherical().setFromVector3(kamera.position.clone().sub(kontrol.target));
        sph.phi = e;
        kamera.position.copy(kontrol.target).add(new THREE.Vector3().setFromSpherical(sph));
        if (t >= 1) {
          gecis = null;
          if (tepedenMi) { kontrol.minPolarAngle = 0; kontrol.maxPolarAngle = 0.0001; }
          guncelle();
        }
      }
      kontrol.update();
      renderer.render(sahne, kamera);
      etiketleriYerlestir();
      kare++;
      const simdi = performance.now();
      if (simdi - son >= 1000) {
        const ucgen = renderer.info.render.triangles;
        const fps = (kare * 1000) / (simdi - son);
        setOlcum(o => ({ ...o, ucgen, fps, modelli: yapi?.modelli ?? 0, mb: indirme.bayt / 1e6 }));
        if (import.meta.env.DEV) (window as unknown as { __tekHarita?: unknown }).__tekHarita = {
          hazir: !!zemin, iniyor: yapi?.iniyor ?? true, ucgen, fps, modelli: yapi?.modelli ?? 0,
          zeminUcgen: zemin?.ucgen ?? 0, agac: agac ? { ucgen: agac.ucgen, modelli: agac.modelli, obekli: agac.obekli } : null, yolUcgen: yol?.ucgen ?? 0, indirme: { ...indirme, dosyalar: { ...indirme.dosyalar } },
          bak, adaya, tepeden: tepedenAyarla
        };
        kare = 0; son = simdi;
      }
    });

    const boyut = new ResizeObserver(() => {
      const g = kab.clientWidth, y = kab.clientHeight;
      if (!g || !y) return;
      renderer.setSize(g, y);
      kamera.aspect = g / y;
      kamera.updateProjectionMatrix();
    });
    boyut.observe(kab);

    return () => {
      kapandi = true;
      sahneRef.current = null;
      if (bekleme) clearTimeout(bekleme);
      durdur.abort();
      boyut.disconnect();
      renderer.domElement.removeEventListener('pointerdown', basildi);
      renderer.domElement.removeEventListener('pointerup', birakildi);
      renderer.setAnimationLoop(null);
      kontrol.dispose();
      agac?.dispose(); zemin?.dispose(); yol?.dispose(); yapi?.dispose(); sinir?.dispose(); deniz?.dispose();
      denizYuzu.geometry.dispose(); denizDibi.geometry.dispose();
      sahne.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  const tepedenDegistir = useCallback(() => setTepeden(t => { sahneRef.current?.tepeden(!t); return !t; }), []);
  const hafifDegistir = useCallback(() => setHafif(h => {
    const y = !h;
    hafifRef.current = y;
    try { localStorage.setItem(HAFIF_ANAHTARI, y ? '1' : '0'); } catch { /* yok */ }
    sahneRef.current?.hafif(y);
    return y;
  }), []);
  useEffect(() => {
    if (!tamEkran) return;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setTamEkran(false); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [tamEkran]);

  const dugme = 'pointer-events-auto inline-flex items-center gap-1.5 min-h-10 lg:min-h-0 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer';
  const bos = `${dugme} bg-[#FAF8F5]/95 text-[#0E1C4F] border-[#CFC5B4] hover:border-[#F26B6F]`;
  const dolu = `${dugme} bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent`;
  return (
    <div className={tamEkran ? 'fixed inset-0 z-[95] font-sans' : `relative font-sans ${className || ''}`} style={{ background: GOK.pus }}>
      <div ref={kap} className="absolute inset-0 touch-none" />
      {/* Adlar: mahalleler uzaktan, zirveler, yakında viki bağlı yapılar (dokununca kart) */}
      <div ref={etiketKabi} className="absolute inset-0 pointer-events-none overflow-hidden">
        {etiketler.map(e => e.tur === 'yapi' ? (
          <button key={e.anahtar} type="button" style={{ display: 'none' }} onClick={() => setSecili(e.yapi!)}
            className="absolute left-0 top-0 pointer-events-auto whitespace-nowrap px-1.5 py-0.5 rounded-md bg-[#FAF8F5]/90 border border-[#CFC5B4] text-[10.5px] font-semibold text-[#0E1C4F] shadow-sm cursor-pointer hover:border-[#F26B6F]">
            {e.ad}
          </button>
        ) : (
          <span key={e.anahtar} style={{ display: 'none' }}
            className={`absolute left-0 top-0 whitespace-nowrap select-none ${e.tur === 'mahalle'
              ? 'text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] text-[#0E1C4F] [text-shadow:0_0_3px_#F3EFE8,0_0_6px_#F3EFE8]'
              : 'text-[10.5px] font-semibold text-[#4A3F30] [text-shadow:0_0_3px_#F3EFE8]'}`}>
            {e.tur === 'zirve' ? `▲ ${e.ad}` : e.ad}
          </span>
        ))}
      </div>

      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-start gap-1.5 pointer-events-none">
        <button type="button" onClick={tepedenDegistir} className={tepeden ? dolu : bos} aria-pressed={tepeden} title={tepeden ? '3B eğik bakışa dön' : 'Üstten bak (mahalle haritası)'}>
          {tepeden ? <Mountain className="w-3.5 h-3.5" /> : <HaritaSimgesi className="w-3.5 h-3.5" />} {tepeden ? '3B' : 'Tepeden'}
        </button>
        <button type="button" onClick={hafifDegistir} className={hafif ? dolu : bos} aria-pressed={hafif} title="Telefon için daha az ayrıntı: uzak evler kutu, gölge yok">
          <Feather className="w-3.5 h-3.5" /> Hafif mod
        </button>
        <button type="button" onClick={() => sahneRef.current?.adaya()} className={bos} title="Bütün adayı göster">
          Bütün ada
        </button>
        <button type="button" onClick={() => setTamEkran(t => !t)} className={bos} title={tamEkran ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'}>
          {tamEkran ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{tamEkran ? 'Küçült' : 'Tam ekran'}</span>
        </button>
        {onEskiHarita && (
          <button type="button" onClick={onEskiHarita} className={bos} title="Eski haritalar (11. adıma kadar duruyor)">
            <History className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Eski haritalar</span><span className="sm:hidden">Eski</span>
          </button>
        )}
      </div>
      {!hazir && !hata && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-xs text-[#0E1C4F]">Tek harita yükleniyor…</div>
      )}
      {hata && <div className="absolute left-3 top-16 px-2.5 py-1.5 rounded-lg bg-[#FAF8F5]/90 border border-[#CFC5B4] text-[11px] text-[#0E1C4F]">{hata}</div>}
      {import.meta.env.DEV && hazir && (
        <div className="absolute right-3 bottom-3 pointer-events-none px-2 py-1 rounded-md bg-[#FAF8F5]/85 border border-[#CFC5B4] text-[10px] leading-[1.4] text-[#0E1C4F] tabular-nums">
          {(olcum.yuklemeMs / 1000).toFixed(1)} sn · {olcum.mb.toFixed(1)} MB · {Math.round(olcum.ucgen / 1000)} bin üçgen · {olcum.modelli} model
        </div>
      )}

      {kart ? (
        <div role="dialog" aria-label={kart.ad}
          className="absolute left-3 bottom-3 w-[min(19rem,calc(100%-1.5rem))] p-2.5 rounded-xl bg-[#FAF8F5]/95 dark:bg-[#13204A]/95 border border-[#CFC5B4] dark:border-[#2C3C72] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] text-[#0E1C4F] dark:text-[#F3EFE8]">
          {/* Telefonda görsel kapalı başlar (küçük kart); masaüstünde hep görünür */}
          <div className={gorselAcik ? 'relative' : 'relative hidden sm:block'}>
            {kartGorseli ? (
              <GorselImg src={kartGorseli} alt={kart.ad} className={`w-full aspect-[16/9] ${kart.madde && ['kulüp', 'marka'].includes(kart.madde.type) ? 'object-contain p-2' : 'object-cover'} rounded-lg bg-[#F3EFE8] dark:bg-[#17345A]`} />
            ) : (
              <div className="w-full aspect-[16/9] rounded-lg border border-dashed border-[#CFC5B4] dark:border-[#2C3C72] bg-[#F3EFE8] dark:bg-[#17345A] flex flex-col items-center justify-center gap-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
                <ImageOff className="w-4 h-4" /> Görsel yok
              </div>
            )}
            <button type="button" onClick={() => setSecili(null)} aria-label="Kartı kapat" title="Kapat"
              className="absolute right-1.5 top-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-[#FAF8F5]/90 dark:bg-[#13204A]/90 border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer hover:border-[#F26B6F]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className={`${gorselAcik ? 'mt-2' : 'sm:mt-2'} flex items-start gap-2`}>
            <div className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{kart.ad}</div>
            {!gorselAcik && (
              <button type="button" onClick={() => setSecili(null)} aria-label="Kartı kapat" title="Kapat"
                className="sm:hidden -mr-1 -mt-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {kart.altSatir && <div className="text-[11px] font-medium text-[#8A7C66] dark:text-[#A6B0C9]">{kart.altSatir}</div>}
          {kart.giris && <p className="mt-0.5 text-[12px] leading-[1.45] text-[#6A5E4C] dark:text-[#A6B0C9] line-clamp-2 sm:line-clamp-3">{kart.giris}</p>}
          {kart.madde && onMaddeAc && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onMaddeAc(kart.madde!.id)}
                className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#0E1C4F] dark:bg-[#2C3C72] text-white cursor-pointer">
                <BookOpen className="w-3.5 h-3.5" /> Vikide aç
              </button>
              {!gorselAcik && kartGorseli && (
                <button type="button" onClick={() => setGorselAcik(true)}
                  className="sm:hidden inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer">
                  <GorselSimgesi className="w-3.5 h-3.5" /> Görsel
                </button>
              )}
              {kart.ikinci.map(m => (
                <button key={m.id} type="button" onClick={() => onMaddeAc(m.id)} title={`${m.title}: vikide aç`}
                  className="inline-flex items-center min-h-9 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-[#CFC5B4] dark:border-[#2C3C72] cursor-pointer hover:border-[#F26B6F]">
                  {m.title}
                </button>
              ))}
            </div>
          )}
          {!kart.madde && <p className="mt-0.5 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">Vikide maddesi bulunamadı.</p>}
        </div>
      ) : hazir && (
        <div className="absolute left-3 bottom-3 pointer-events-none px-2.5 py-1.5 rounded-lg bg-[#FAF8F5]/90 dark:bg-[#13204A]/90 border border-[#CFC5B4] dark:border-[#2C3C72] text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
          Yakınlaşıp adı yazan bir yapıya dokun: kartı açılır
        </div>
      )}
    </div>
  );
};

export default TekHarita;
