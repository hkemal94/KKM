import type { Nokta } from '../harita/sinirBolgeleri';

/**
 * Anıt kalıpları (H, 29 Eylül). Kemal: "Özel binalarımı nasıl yapacağımı
 * düşünüyorum, The Imperial gibi" — seçimi: köşe köşe çizmek ya da hazır
 * anıt kalıbı. Kalıp yalnız bir taban şekli ve varsayılan kat sayısıdır;
 * ad koymaz. Konduktan sonra köşeleri, katı ve yönü değiştirilebilir.
 *
 * Köşeler metre, merkez (0, 0), kuzey yukarı (SVG: y aşağı).
 */
export interface AnitKalibi {
  id: string;
  ad: string;
  kat: number;
  koseler: Nokta[];
  aciklama: string;
}

const cember = (r: number, n = 16): Nokta[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as Nokta;
  });

const oval = (rx: number, ry: number, n = 20): Nokta[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry] as Nokta;
  });

/** Ön köşedeki ø 8 m kulenin dış yayı (metre, SVG: y aşağı). a0 → a1 derece, y yukarı ölçülür. */
const kuleYayi = (cx: number, cy: number, a0: number, a1: number, n = 8): Nokta[] =>
  Array.from({ length: n - 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * (i + 1)) / n) * Math.PI) / 180;
    return [cx + 4 * Math.cos(a), cy - 4 * Math.sin(a)] as Nokta;
  });

export const ANIT_KALIPLARI: AnitKalibi[] = [
  {
    // Kemal'in ölçüleri (4 Kasım): ön cephe 48 m, kollar 48 m, kol ve ön blok 12 m, avlu 24 × 36 m,
    // önde 10 m orta çıkma (1,2 m), ön köşelerde ø 8 m kule; giriş katı + 4 oda katı.
    // Ön (deniz) güneyde: SVG'de y aşağı, avlunun ağzı kuzeyde.
    id: 'otel', ad: 'Otel (avlulu)', kat: 5,
    aciklama: 'U biçimli, ortada avlu, ön köşelerde kule — 48 × 48 m',
    koseler: [
      [-5, 24], [-5, 25.2], [5, 25.2], [5, 24], [20, 24],
      ...kuleYayi(24, 24, 180, 450),
      [24, 20], [24, -24], [12, -24], [12, 12], [-12, 12], [-12, -24], [-24, -24], [-24, 20],
      ...kuleYayi(-24, 24, 90, 360),
      [-20, 24]
    ]
  },
  {
    id: 'fener', ad: 'Fener', kat: 6,
    aciklama: 'Yuvarlak kule — çap 7 m',
    koseler: cember(3.5, 14)
  },
  {
    id: 'stat', ad: 'Stat', kat: 2,
    aciklama: 'Oval tribün — 110 × 76 m',
    koseler: oval(55, 38, 28)
  },
  {
    id: 'cami', ad: 'Cami', kat: 2,
    aciklama: 'Kare harim ve avlu — 26 × 40 m',
    koseler: [[-13, -20], [13, -20], [13, 20], [-13, 20]]
  },
  {
    id: 'iskele', ad: 'İskele binası', kat: 1,
    aciklama: 'Kıyıya paralel uzun yapı — 44 × 14 m',
    koseler: [[-22, -7], [22, -7], [22, 7], [-22, 7]]
  },
  {
    id: 'okul', ad: 'Okul', kat: 2,
    aciklama: 'L biçimli — 42 × 34 m',
    koseler: [[-21, -17], [21, -17], [21, -3], [-7, -3], [-7, 17], [-21, 17]]
  },
  {
    id: 'kule', ad: 'Kule', kat: 8,
    aciklama: 'Kare kule — 9 × 9 m',
    koseler: [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]]
  }
];

export const kalipBul = (id?: string) => ANIT_KALIPLARI.find(k => k.id === id);

/** Kalıbı merkeze, açıya ve ölçeğe göre yerleştirir (metre) */
export function kalibiYerlestir(k: AnitKalibi, merkez: Nokta, aci = 0, olcek = 1): Nokta[] {
  const c = Math.cos(aci), s = Math.sin(aci);
  return k.koseler.map(([x, y]) => [merkez[0] + (x * c - y * s) * olcek, merkez[1] + (x * s + y * c) * olcek] as Nokta);
}

/** Çokgenin alanı (m²) — taban ölçüsü için */
export function alan(k: Nokta[]): number {
  let a = 0;
  for (let i = 0; i < k.length; i++) {
    const [x1, y1] = k[i], [x2, y2] = k[(i + 1) % k.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Çokgenin ağırlık merkezi (köşe ortalaması yeterli) */
export const merkez = (k: Nokta[]): Nokta => [
  k.reduce((t, p) => t + p[0], 0) / k.length,
  k.reduce((t, p) => t + p[1], 0) / k.length
];

/** İki doğru parçası kesişiyor mu */
function parcalarKesisir(a: Nokta, b: Nokta, c: Nokta, d: Nokta): boolean {
  const yon = (p: Nokta, q: Nokta, r: Nokta) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = yon(c, d, a), d2 = yon(c, d, b), d3 = yon(a, b, c), d4 = yon(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Yol çizgisi çokgenin içinden geçiyor ya da kenarını kesiyor mu */
export function yolCokgeneBiniyor(yol: Nokta[], k: Nokta[]): boolean {
  if (yol.some(p => icindeMi(p, k))) return true;
  for (let i = 0; i + 1 < yol.length; i++) {
    for (let j = 0; j < k.length; j++) {
      if (parcalarKesisir(yol[i], yol[i + 1], k[j], k[(j + 1) % k.length])) return true;
    }
  }
  return false;
}

/** Noktayı çokgenin içinde mi (ışın yöntemi) */
export function icindeMi(p: Nokta, k: Nokta[]): boolean {
  let ic = false;
  for (let i = 0, j = k.length - 1; i < k.length; j = i++) {
    const [xi, yi] = k[i], [xj, yj] = k[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}
