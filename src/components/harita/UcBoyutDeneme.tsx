import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X } from 'lucide-react';
import { GOK } from './haritaStili';
import { parcaKoku } from '../../lib/parcaKaynagi';
import { IptalHatasi, ParcaYukleyici } from '../../lib/parcaYukle';

/**
 * 3B deneme (8 Kasım, Kemal): Blender'da üretilen Düzada arazi parçalarını
 * MapLibre'den bağımsız, tam ekran gösteren hafif görünüm. Telefonda denemek için.
 * Yalnız görünüm: kayda, harita durumuna, Firestore'a hiçbir şey yazılmaz.
 *
 * Parçalar 1 km'lik ızgara (`parcalar.json`: ad, i, j, kara_m2). Blender'da parça
 * (i, j) x = i·1000…(i+1)·1000, y = j·1000…(j+1)·1000 metre; glTF Y yukarı olduğu
 * için sahnede x aynı, z = −y (kuzey −z).
 *
 * Akış: karası olan parçaların hepsinin "uzak" sürümü (kaba) yakından uzağa iner ve
 * ekranda kalır. Kamera 4 km'den yakınken hedefe 1,5 km'den yakın parçaların "yakın"
 * sürümü (ayrıntılı) iner, uzak sürüm gizlenir; hedeften 3 km uzaklaşan yakın parça
 * boşaltılır, uzak sürüm geri gelir. Aynı anda en çok 12 yakın parça.
 */

type ParcaSatiri = { ad: string; i: number; j: number; kara_m2: number };

type Parca = ParcaSatiri & {
  /** Parça merkezinin sahnedeki x, z'si */
  cx: number;
  cz: number;
  uzak?: THREE.Group;
  yakin?: THREE.Group;
  /** Yakın sürüm istendi (iniyor ya da yüklü) */
  yakinIstendi: boolean;
};

type Sayac = { mb: number; yakin: number; uzak: number; toplam: number; ucgen: number; fps: number };

const PARCA = 1000;
const YAKIN_KAMERA = 4000;
const YAKIN_YARICAP = 1500;
const BIRAK_YARICAP = 3000;
const EN_COK_YAKIN = 12;
const BEKLEME_MS = 150;

const uzakDosya = (p: ParcaSatiri) => `parca/${p.ad}-uzak.glb`;
const yakinDosya = (p: ParcaSatiri) => `parca/${p.ad}-yakin.glb`;

const sayi = (n: number, basamak = 0) => n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });

export const UcBoyutDeneme: React.FC<{ onKapat: () => void }> = ({ onKapat }) => {
  const kap = useRef<HTMLDivElement>(null);
  const [sayac, setSayac] = useState<Sayac>({ mb: 0, yakin: 0, uzak: 0, toplam: 0, ucgen: 0, fps: 0 });
  const [hata, setHata] = useState('');

  useEffect(() => {
    const kab = kap.current;
    if (!kab) return;
    const masaustu = window.matchMedia('(pointer: fine)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: masaustu, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(kab.clientWidth, kab.clientHeight);
    renderer.shadowMap.enabled = false;
    kab.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const sahne = new THREE.Scene();
    sahne.background = new THREE.Color(GOK.pus);
    const sis = new THREE.Fog(GOK.pus, 10000, 40000);
    sahne.fog = sis;

    const kamera = new THREE.PerspectiveCamera(50, kab.clientWidth / Math.max(1, kab.clientHeight), 5, 80000);
    const kontrol = new OrbitControls(kamera, renderer.domElement);
    kontrol.enableDamping = true;
    kontrol.dampingFactor = 0.08;
    kontrol.screenSpacePanning = false;
    kontrol.minDistance = 60;
    kontrol.maxDistance = 25000;
    kontrol.minPolarAngle = THREE.MathUtils.degToRad(5);
    kontrol.maxPolarAngle = THREE.MathUtils.degToRad(85);

    sahne.add(new THREE.HemisphereLight(GOK.ust, '#8a7a5c', 1.4));
    const gunes = new THREE.DirectionalLight('#fff4e0', 1.8);
    gunes.position.set(-0.5, 1, 0.35).multiplyScalar(1000);
    sahne.add(gunes);

    const yukleyici = new ParcaYukleyici(parcaKoku());
    const parcalar: Parca[] = [];
    const sinirAlt = new THREE.Vector3(0, 0, 0);
    const sinirUst = new THREE.Vector3(0, 300, 0);
    let kapandi = false;
    let bekleme: ReturnType<typeof setTimeout> | undefined;
    const listeDurdur = new AbortController();

    // Kamera hedefi ada sınırları içinde kalır; kamera hedefle birlikte kayar
    const kayma = new THREE.Vector3();
    const sinirla = () => {
      if (!parcalar.length) return;
      kayma.copy(kontrol.target).clamp(sinirAlt, sinirUst).sub(kontrol.target);
      if (kayma.lengthSq() > 0) { kontrol.target.add(kayma); kamera.position.add(kayma); }
    };

    // Yakınlığa göre ön düzlem, sis ve uzak düzlem
    const derinlikAyari = () => {
      const u = kamera.position.distanceTo(kontrol.target);
      kamera.near = THREE.MathUtils.clamp(u / 300, 1, 50);
      kamera.far = u + 40000;
      kamera.updateProjectionMatrix();
      sis.near = u * 1.5;
      sis.far = u * 1.5 + Math.max(8000, u * 3);
    };

    const hedefUzakligi = (p: Parca) => Math.hypot(p.cx - kontrol.target.x, p.cz - kontrol.target.z);

    const yakinIste = (p: Parca, oncelik: number) => {
      p.yakinIstendi = true;
      yukleyici.iste(yakinDosya(p), oncelik).then(g => {
        if (kapandi) return;
        if (!p.yakinIstendi) { yukleyici.birak(yakinDosya(p)); return; }
        p.yakin = g;
        sahne.add(g);
        if (p.uzak) p.uzak.visible = false;
      }).catch(e => {
        p.yakinIstendi = false;
        if (!(e instanceof IptalHatasi) && !kapandi) console.warn('[3B deneme] yakın parça inmedi', p.ad, e);
      });
    };

    const yakinBirak = (p: Parca) => {
      yukleyici.birak(yakinDosya(p));
      p.yakin = undefined;
      p.yakinIstendi = false;
      if (p.uzak) p.uzak.visible = true;
    };

    // Kamera durunca (150 ms) yakın parçaları güncelle; her karede değil
    const guncelle = () => {
      if (kapandi || !parcalar.length) return;
      for (const p of parcalar) if (p.yakinIstendi && hedefUzakligi(p) > BIRAK_YARICAP) yakinBirak(p);

      const kameraUzakligi = kamera.position.distanceTo(kontrol.target);
      const hedef = kameraUzakligi < YAKIN_KAMERA
        ? parcalar.filter(p => hedefUzakligi(p) < YAKIN_YARICAP).sort((a, b) => hedefUzakligi(a) - hedefUzakligi(b)).slice(0, EN_COK_YAKIN)
        : [];
      const istenen = new Set(hedef);
      // Henüz inmemiş ve artık istenmeyen istek sıradan düşer
      for (const p of parcalar) if (p.yakinIstendi && !p.yakin && !istenen.has(p)) { yukleyici.iptal(yakinDosya(p)); p.yakinIstendi = false; }

      const eksik = hedef.filter(p => !p.yakinIstendi);
      const aktif = parcalar.filter(p => p.yakinIstendi);
      let bos = EN_COK_YAKIN - aktif.length;
      if (eksik.length > bos) {
        const atilabilir = aktif.filter(p => !istenen.has(p)).sort((a, b) => hedefUzakligi(b) - hedefUzakligi(a));
        for (const p of atilabilir) { if (eksik.length <= bos) break; yakinBirak(p); bos++; }
      }
      for (const p of eksik.slice(0, Math.max(0, bos))) yakinIste(p, hedefUzakligi(p));
    };

    kontrol.addEventListener('change', () => {
      sinirla();
      derinlikAyari();
      if (bekleme) clearTimeout(bekleme);
      bekleme = setTimeout(guncelle, BEKLEME_MS);
    });

    // Deniz bir kez iner
    yukleyici.iste('parca/deniz.glb', 0).then(g => { if (!kapandi) sahne.add(g); })
      .catch(e => { if (!(e instanceof IptalHatasi) && !kapandi) console.warn('[3B deneme] deniz inmedi', e); });

    const basla = performance.now();
    fetch(`${parcaKoku()}parcalar.json`, { signal: listeDurdur.signal })
      .then(y => { if (!y.ok) throw new Error(`parça listesi: ${y.status}`); return y.json() as Promise<ParcaSatiri[]>; })
      .then(liste => {
        if (kapandi) return;
        for (const s of liste) {
          if (!(s.kara_m2 > 0)) continue;
          parcalar.push({ ...s, cx: (s.i + 0.5) * PARCA, cz: -(s.j + 0.5) * PARCA, yakinIstendi: false });
        }
        if (!parcalar.length) { setHata('Parça listesi boş.'); return; }
        const xs = parcalar.map(p => p.i), js = parcalar.map(p => p.j);
        sinirAlt.set(Math.min(...xs) * PARCA, 0, -(Math.max(...js) + 1) * PARCA);
        sinirUst.set((Math.max(...xs) + 1) * PARCA, 300, -Math.min(...js) * PARCA);

        // Başlangıç: ada tamamen görünür, hafif eğik kuşbakışı
        const merkez = sinirAlt.clone().add(sinirUst).multiplyScalar(0.5).setY(0);
        const genislik = sinirUst.x - sinirAlt.x, derinlik = sinirUst.z - sinirAlt.z;
        const dikeyYari = THREE.MathUtils.degToRad(kamera.fov / 2);
        const yatayYari = Math.atan(Math.tan(dikeyYari) * kamera.aspect);
        const uzaklik = Math.min(kontrol.maxDistance, 1.1 * Math.max((derinlik / 2) / Math.tan(dikeyYari), (genislik / 2) / Math.tan(yatayYari)));
        const egim = THREE.MathUtils.degToRad(35);
        kontrol.target.copy(merkez);
        kamera.position.set(merkez.x, uzaklik * Math.cos(egim), merkez.z + uzaklik * Math.sin(egim));
        // Yerel denemede (yalnız `npm run dev`) `?bakis=x,z,uzaklık` ile başka bir yerden açılır
        const bakis = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('bakis')?.split(',').map(Number) : undefined;
        if (bakis && bakis.length === 3 && bakis.every(Number.isFinite)) {
          kontrol.target.set(bakis[0], 0, bakis[1]);
          kamera.position.set(bakis[0], bakis[2] * Math.cos(egim), bakis[1] + bakis[2] * Math.sin(egim));
        }
        kontrol.update();
        derinlikAyari();

        // Uzak sürümler: kameraya yakından uzağa, hepsi iner ve kalır
        let kalan = parcalar.length;
        const denetim = { uyan: 0, enCokTasma: 0, uymayan: [] as string[] };
        const kutu = new THREE.Box3();
        for (const p of parcalar) {
          const oncelik = 1e6 + Math.hypot(p.cx - kamera.position.x, p.cz - kamera.position.z);
          yukleyici.iste(uzakDosya(p), oncelik).then(g => {
            if (kapandi) return;
            p.uzak = g;
            g.visible = !p.yakin;
            sahne.add(g);
            if (import.meta.env.DEV) {
              // Koordinat denetimi: parça beklenen 1 km'lik karede mi
              g.updateMatrixWorld(true);
              kutu.setFromObject(g);
              // Karenin dışına taşma (metre); kıyı ve yapı kenarı için 50 m pay
              const tasma = Math.max(p.i * PARCA - kutu.min.x, kutu.max.x - (p.i + 1) * PARCA,
                -(p.j + 1) * PARCA - kutu.min.z, kutu.max.z + p.j * PARCA, 0);
              denetim.enCokTasma = Math.max(denetim.enCokTasma, tasma);
              if (tasma <= 50) denetim.uyan++; else denetim.uymayan.push(`${p.ad} (${Math.round(tasma)} m)`);
              if (p.i === 0 && p.j === 0) {
                console.info('[3B deneme] koordinat örneği', p.ad, 'kutu', kutu.min.toArray().map(Math.round), kutu.max.toArray().map(Math.round),
                  'beklenen x', [p.i * PARCA, (p.i + 1) * PARCA], 'z', [-(p.j + 1) * PARCA, -p.j * PARCA]);
              }
            }
          }).catch(e => {
            if (!(e instanceof IptalHatasi) && !kapandi) console.warn('[3B deneme] uzak parça inmedi', p.ad, e);
          }).finally(() => {
            if (--kalan === 0 && !kapandi && import.meta.env.DEV) {
              console.info(`[3B deneme] uzak parçalar indi: ${((performance.now() - basla) / 1000).toFixed(1)} sn, ${(yukleyici.indirilen / 1e6).toFixed(1)} MB`);
              console.info(`[3B deneme] koordinat denetimi: ${denetim.uyan}/${parcalar.length} parça beklenen karede, en çok taşma ${Math.round(denetim.enCokTasma)} m`, denetim.uymayan.slice(0, 10));
            }
          });
        }
        guncelle();
      })
      .catch(e => {
        if (kapandi || (e instanceof DOMException && e.name === 'AbortError')) return;
        setHata(`Parçalar inmedi: ${e instanceof Error ? e.message : String(e)}`);
      });

    // Çizim döngüsü ve saniyede bir sayaç
    let kare = 0, son = performance.now();
    renderer.setAnimationLoop(() => {
      kontrol.update();
      renderer.render(sahne, kamera);
      kare++;
      const simdi = performance.now();
      if (simdi - son >= 1000) {
        setSayac({
          mb: yukleyici.indirilen / 1e6,
          yakin: parcalar.filter(p => p.yakin).length,
          uzak: parcalar.filter(p => p.uzak?.visible).length,
          toplam: parcalar.length,
          ucgen: renderer.info.render.triangles,
          fps: (kare * 1000) / (simdi - son)
        });
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
      if (bekleme) clearTimeout(bekleme);
      listeDurdur.abort();
      boyut.disconnect();
      renderer.setAnimationLoop(null);
      kontrol.dispose();
      yukleyici.kapat();
      sahne.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat(); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [onKapat]);

  return (
    <div className="fixed inset-0 z-[95] font-sans" style={{ background: GOK.pus }}>
      <div ref={kap} className="absolute inset-0 touch-none" />
      <div className="absolute left-3 top-3 flex items-start gap-2 pointer-events-none">
        <button type="button" onClick={onKapat}
          className="pointer-events-auto inline-flex items-center gap-1.5 min-h-11 lg:min-h-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#FAF8F5]/95 text-[#0E1C4F] border border-[#CFC5B4] cursor-pointer hover:border-[#F26B6F]">
          <X className="w-3.5 h-3.5" /> Kapat
        </button>
        <div className="px-2.5 py-1.5 rounded-lg bg-[#FAF8F5]/90 border border-[#CFC5B4] text-[11px] leading-[1.45] text-[#0E1C4F] tabular-nums">
          <div className="font-semibold">3B deneme</div>
          {hata ? <div>{hata}</div> : (
            <>
              <div>İndirilen: {sayi(sayac.mb, 1)} MB</div>
              <div>Parça: yakın {sayac.yakin} · uzak {sayac.uzak}{sayac.toplam ? ` / ${sayac.toplam}` : ''}</div>
              <div>Üçgen: {sayi(sayac.ucgen)}</div>
              <div>Akıcılık: {sayi(sayac.fps)} kare/sn</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UcBoyutDeneme;
