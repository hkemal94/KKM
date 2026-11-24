import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * Büyük görünümde yakınlaşan görsel (24 Kasım, Kemal: pulu büyük incelemek).
 * Tekerlek ya da çift tıklama (telefonda çift dokunuş) yakınlaştırır, telefonda iki parmak. Yakınken
 * sürükleyince kayar; yakın değilken yana kaydırma `onKaydir`'ı çağırır
 * (öbür pula geçiş). Görselin dışındaki boşluğa tıklama `onBosTik`'i çağırır.
 * Görsel kendi dosyasından çizilir; büyütme tarayıcıda olur, kayda bir şey yazılmaz.
 */

const EN_AZ = 1;
const EN_COK = 6;
const sinirla = (s: number) => Math.min(EN_COK, Math.max(EN_AZ, s));

export interface YakinlasanGorselTutamagi {
  yakinlastir: (carpan: number) => void;
  sifirla: () => void;
}

interface Ozellikler {
  adres: string;
  alt: string;
  onKaydir?: (yon: 1 | -1) => void;
  onBosTik?: () => void;
  onOlcek?: (olcek: number) => void;
  className?: string;
}

export const YakinlasanGorsel = React.forwardRef<YakinlasanGorselTutamagi, Ozellikler>(
  ({ adres, alt, onKaydir, onBosTik, onOlcek, className = '' }, ref) => {
    const sahne = useRef<HTMLDivElement>(null);
    const resim = useRef<HTMLImageElement>(null);
    const [d, setD] = useState({ s: 1, x: 0, y: 0 });
    const dRef = useRef(d);
    dRef.current = d;
    // Ekrandaki parmaklar / fare: pointerId → konum
    const isaretler = useRef(new Map<number, { x: number; y: number }>());
    // Çift dokunuş / çift tıklama: son tıklamanın zamanı ve yeri (telefonda dblclick gelmeyebilir)
    const sonTik = useRef<{ t: number; x: number; y: number } | null>(null);
    const hareket = useRef<{ baslangic: { x: number; y: number }; kaydi: boolean; tutam?: { mesafe: number; s: number } } | null>(null);

    /** Sahnenin ortasına göre bir noktanın konumu */
    const ortayaGore = (x: number, y: number) => {
      const r = sahne.current?.getBoundingClientRect();
      return r ? { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) } : { x: 0, y: 0 };
    };

    /** Ölçeği değiştir; (px, py) noktasının altındaki yer yerinde kalsın */
    const olcekle = useCallback((yeniS: number, px = 0, py = 0) => {
      setD(o => {
        const s = sinirla(yeniS);
        if (s === 1) return { s: 1, x: 0, y: 0 };
        const k = s / o.s;
        return { s, x: px - (px - o.x) * k, y: py - (py - o.y) * k };
      });
    }, []);

    useImperativeHandle(ref, () => ({
      yakinlastir: (carpan: number) => olcekle(dRef.current.s * carpan),
      sifirla: () => setD({ s: 1, x: 0, y: 0 }),
    }), [olcekle]);

    // Yeni görselde yakınlık sıfırlanır
    useEffect(() => { setD({ s: 1, x: 0, y: 0 }); }, [adres]);
    useEffect(() => { onOlcek?.(d.s); }, [d.s, onOlcek]);

    // Tekerlek: sayfa kaymasın diye pasif olmayan dinleyici
    useEffect(() => {
      const el = sahne.current;
      if (!el) return;
      const tekerlek = (e: WheelEvent) => {
        e.preventDefault();
        const p = ortayaGore(e.clientX, e.clientY);
        olcekle(dRef.current.s * Math.exp(-e.deltaY * 0.0022), p.x, p.y);
      };
      el.addEventListener('wheel', tekerlek, { passive: false });
      return () => el.removeEventListener('wheel', tekerlek);
    }, [olcekle]);

    const asagi = (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      isaretler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const n = [...isaretler.current.values()];
      if (n.length === 1) {
        hareket.current = { baslangic: { x: e.clientX, y: e.clientY }, kaydi: false };
      } else if (n.length === 2 && hareket.current) {
        hareket.current.tutam = { mesafe: Math.hypot(n[0].x - n[1].x, n[0].y - n[1].y) || 1, s: dRef.current.s };
        hareket.current.kaydi = true;
      }
    };

    const tasi = (e: React.PointerEvent) => {
      const onceki = isaretler.current.get(e.pointerId);
      if (!onceki || !hareket.current) return;
      isaretler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const n = [...isaretler.current.values()];
      const h = hareket.current;
      if (n.length >= 2 && h.tutam) {
        const mesafe = Math.hypot(n[0].x - n[1].x, n[0].y - n[1].y);
        const orta = ortayaGore((n[0].x + n[1].x) / 2, (n[0].y + n[1].y) / 2);
        olcekle(h.tutam.s * (mesafe / h.tutam.mesafe), orta.x, orta.y);
        return;
      }
      if (Math.hypot(e.clientX - h.baslangic.x, e.clientY - h.baslangic.y) > 6) h.kaydi = true;
      if (dRef.current.s > 1) {
        const dx = e.clientX - onceki.x, dy = e.clientY - onceki.y;
        setD(o => ({ ...o, x: o.x + dx, y: o.y + dy }));
      }
    };

    const yukari = (e: React.PointerEvent) => {
      const h = hareket.current;
      isaretler.current.delete(e.pointerId);
      if (isaretler.current.size > 0) {
        // İki parmaktan biri kalktı: kalanla kaydırma sürer, yana geçiş sayılmaz
        if (h) h.tutam = undefined;
        return;
      }
      hareket.current = null;
      if (!h) return;
      const dx = e.clientX - h.baslangic.x, dy = e.clientY - h.baslangic.y;
      // Yakın değilken yana kaydırma: öbür pul
      if (dRef.current.s === 1 && !h.tutam && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onKaydir?.(dx < 0 ? 1 : -1);
        return;
      }
      // Kaymadan bırakılan tıklama: görselin dışındaysa kapat
      if (h.kaydi) return;
      const r = resim.current?.getBoundingClientRect();
      const icinde = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!icinde) { sonTik.current = null; onBosTik?.(); return; }
      // Görselin üstünde iki tıklama arka arkaya: yakınlaş ya da geri dön
      const simdi = performance.now(), once = sonTik.current;
      if (once && simdi - once.t < 320 && Math.hypot(e.clientX - once.x, e.clientY - once.y) < 30) {
        sonTik.current = null;
        const p = ortayaGore(e.clientX, e.clientY);
        olcekle(dRef.current.s > 1 ? 1 : 2.5, p.x, p.y);
      } else {
        sonTik.current = { t: simdi, x: e.clientX, y: e.clientY };
      }
    };

    return (
      <div ref={sahne} onPointerDown={asagi} onPointerMove={tasi} onPointerUp={yukari}
        onPointerCancel={e => { isaretler.current.delete(e.pointerId); hareket.current = null; }}
        className={`relative overflow-hidden flex items-center justify-center select-none touch-none ${d.s > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} ${className}`}>
        <img ref={resim} src={adres} alt={alt} draggable={false}
          className="pointer-events-none max-w-full max-h-full object-contain rounded-sm shadow-2xl will-change-transform"
          style={{ transform: `translate(${d.x}px, ${d.y}px) scale(${d.s})`, transition: hareket.current ? 'none' : 'transform 120ms ease-out' }} />
      </div>
    );
  },
);
YakinlasanGorsel.displayName = 'YakinlasanGorsel';
