import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelYukle } from '../../lib/modelYukle';

/**
 * 3B model önizlemesi (4 Kasım, bina kütüphanesi galerisi). Parmakla / fareyle
 * döner, iki parmakla / tekerlekle yakınlaşır.
 *
 * Bütün kartlar tek bir çizici paylaşır (tarayıcı aynı anda ancak birkaç 3B
 * yüzeye izin veriyor): çizici kartın sahnesini çizer, görüntü kartın kendi
 * tuvaline kopyalanır. Yalnız bir şey değişince çizilir; boşta işlemci yemez.
 * Model kart ekrana girince iner.
 */

let ortakCizici: THREE.WebGLRenderer | null = null;
function cizici(): THREE.WebGLRenderer {
  if (!ortakCizici) {
    ortakCizici = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    ortakCizici.setClearColor(0x000000, 0);
  }
  return ortakCizici;
}

interface Props {
  dosya: string;
  baslik: string;
  /** Büyük görünüm: sayfa kaymaz, parmak yalnız modeli çevirir */
  buyuk?: boolean;
  className?: string;
}

const ModelOnizleme: React.FC<Props> = ({ dosya, baslik, buyuk, className }) => {
  const tuval = useRef<HTMLCanvasElement | null>(null);
  const [gorunur, setGorunur] = useState(!!buyuk);
  const [durum, setDurum] = useState<'bekliyor' | 'yukleniyor' | 'hazir' | 'hata'>('bekliyor');

  // Kart ekrana girince yükle
  useEffect(() => {
    if (gorunur || !tuval.current) return;
    const g = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) setGorunur(true); }, { rootMargin: '200px' });
    g.observe(tuval.current);
    return () => g.disconnect();
  }, [gorunur]);

  useEffect(() => {
    const el = tuval.current;
    if (!gorunur || !el) return;
    let iptal = false;
    let temizle = () => {};
    setDurum('yukleniyor');
    modelYukle(dosya).then(gltf => {
      if (iptal) return;
      const sahne = new THREE.Scene();
      sahne.add(new THREE.HemisphereLight(0xfffaf0, 0x8c7a5c, 2.2));
      const gunes = new THREE.DirectionalLight(0xffffff, 1.8);
      gunes.position.set(-4, 8, 6);
      sahne.add(gunes);
      const model = gltf.scene.clone(true);
      sahne.add(model);

      const kutu = new THREE.Box3().setFromObject(model);
      const kure = kutu.getBoundingSphere(new THREE.Sphere());
      const kamera = new THREE.PerspectiveCamera(35, 1, Math.max(0.05, kure.radius / 100), kure.radius * 20);
      const uzaklik = kure.radius / Math.sin(((35 / 2) * Math.PI) / 180) * 1.05;
      kamera.position.copy(kure.center).add(new THREE.Vector3(0.75, 0.62, 1).normalize().multiplyScalar(uzaklik));

      const kontrol = new OrbitControls(kamera, el);
      kontrol.target.copy(kure.center);
      kontrol.minDistance = kure.radius * 0.3;
      kontrol.maxDistance = uzaklik * 3;
      kontrol.maxPolarAngle = Math.PI * 0.495;
      kontrol.update();
      // Kartta dikey kaydırma sayfayı kaydırsın; yatay sürükleme ve iki parmak modeli
      if (!buyuk) el.style.touchAction = 'pan-y';

      const ctx = el.getContext('2d');
      const ciz = () => {
        if (!ctx) return;
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
        const r = cizici();
        r.setPixelRatio(dpr);
        r.setSize(w, h, false);
        kamera.aspect = w / h;
        kamera.updateProjectionMatrix();
        r.render(sahne, kamera);
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.drawImage(r.domElement, 0, 0, el.width, el.height);
      };
      kontrol.addEventListener('change', ciz);
      const boyut = new ResizeObserver(ciz);
      boyut.observe(el);
      ciz();
      setDurum('hazir');
      temizle = () => {
        boyut.disconnect();
        kontrol.removeEventListener('change', ciz);
        kontrol.dispose();
      };
    }).catch(() => { if (!iptal) setDurum('hata'); });
    return () => { iptal = true; temizle(); };
  }, [gorunur, dosya, buyuk]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <canvas ref={tuval} aria-label={`${baslik} · 3B önizleme`} className="w-full h-full block cursor-grab active:cursor-grabbing" />
      {durum !== 'hazir' && (
        <span className="absolute inset-0 flex items-center justify-center text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9] pointer-events-none">
          {durum === 'hata' ? '3B önizleme açılamadı' : 'Model yükleniyor…'}
        </span>
      )}
    </div>
  );
};

export default ModelOnizleme;
