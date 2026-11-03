import React, { useEffect, useState } from 'react';
import { panoPinleri, pinterestAdresi, type PanoSonucu } from '../../lib/pinterestPano';
import { ETIKET, IKINCIL } from '../anasayfa/stil';

/**
 * İlham kaydının bağlantısı Pinterest panosuysa panodaki pinlerin küçük
 * resimleri (3 Kasım, Kemal). İlk 12 kare, "Tümünü gör" ile hepsi; resme
 * basınca pin Pinterest'te yeni sekmede açılır. Yalnız okuma, kayda yazmaz.
 */
const ILK = 12;
const NOT = `text-[11px] ${IKINCIL}`;

export const PinterestPanoOnizleme: React.FC<{ adres: string }> = ({ adres }) => {
  // Yazarken her harfte okumasın: bağlantı yarım saniye durunca okunur
  const [bekleyen, setBekleyen] = useState(adres);
  useEffect(() => { const t = window.setTimeout(() => setBekleyen(adres), 500); return () => window.clearTimeout(t); }, [adres]);

  const a = pinterestAdresi(bekleyen);
  const anahtar = a.tur === 'pano' ? `${a.kullanici}/${a.pano}/${a.bolum || ''}` : '';
  const [sonuc, setSonuc] = useState<{ anahtar: string; s: PanoSonucu } | null>(null);
  const [hepsi, setHepsi] = useState(false);

  useEffect(() => {
    setHepsi(false);
    if (a.tur !== 'pano') return;
    let iptal = false;
    void panoPinleri(a.kullanici, a.pano, a.bolum).then(s => { if (!iptal) setSonuc({ anahtar, s }); });
    return () => { iptal = true; };
    // a, anahtar'dan türüyor
  }, [anahtar]);

  if (a.tur === 'kisa') {
    return <p className={NOT}>Kısa bağlantı: panonun tam adresini yapıştır (pinterest.com/…). Pinler kısa bağlantıdan okunamıyor.</p>;
  }
  if (a.tur !== 'pano') return null;

  const s = sonuc?.anahtar === anahtar ? sonuc.s : null;

  if (!s) {
    return (
      <div className="space-y-1.5" aria-busy="true">
        <span className={ETIKET}>Panodaki pinler · yükleniyor</span>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (s.durum === 'yok') return <p className={NOT}>Pano okunamadı: herkese açık mı?</p>;
  if (s.durum === 'hata') return <p className={NOT}>Pano şu an okunamadı (bağlantı kurulamadı). Sonra yeniden açınca tekrar denenir.</p>;
  if (s.pinler.length === 0) return <p className={NOT}>Panoda gösterilecek pin yok.</p>;

  const gorunen = hepsi ? s.pinler : s.pinler.slice(0, ILK);
  return (
    <div className="space-y-1.5 min-w-0">
      <span className={ETIKET}>Panodaki pinler · {s.panoAdi}</span>
      {s.bolumOkunamadi && <p className={NOT}>Bölüm ayrı okunamıyor; panonun tamamı gösteriliyor.</p>}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {gorunen.map(p => (
          <a key={p.id} href={p.adres} target="_blank" rel="noopener noreferrer" title={p.aciklama || 'Pinterest\'te aç'}
            className="block aspect-square rounded-lg overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#F3EFE8] hover:border-[#F26B6F]">
            <img src={p.resim} alt={p.aciklama} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.pinler.length > ILK && (
          <button type="button" onClick={() => setHepsi(h => !h)}
            className="min-h-9 lg:min-h-0 px-2.5 py-1 text-[11px] font-semibold rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F] cursor-pointer">
            {hepsi ? 'Daha az göster' : `Tümünü gör (${s.pinler.length})`}
          </button>
        )}
        {s.toplam !== undefined && s.toplam > s.pinler.length && (
          <span className={NOT}>Pinterest panoda {s.toplam} pin bildiriyor; buraya {s.pinler.length} tanesi geldi.</span>
        )}
      </div>
    </div>
  );
};
