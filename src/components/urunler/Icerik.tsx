import React from 'react';
import { GomuluSayfa } from '../kabuk/SayfaBasi';
import { SekmeCipleri } from './SekmeCipleri';
import { IcerikVideo } from './IcerikVideo';

/**
 * Ürünler → İçerik (2 Kasım, yol haritası 6. adım; Kemal: "tek içerik ekranı
 * çok önemli", "Fanzin İçerik'e"). Sosyal medya · Blog · Fanzin · Video.
 * İçeriğin onayı Ajans → Onay bekleyenler'de.
 */
export type IcerikSekmesi = 'sosyal' | 'blog' | 'fanzin' | 'video';

const SEKMELER: Array<{ id: IcerikSekmesi; ad: string }> = [
  { id: 'sosyal', ad: 'Sosyal medya' },
  { id: 'blog', ad: 'Blog' },
  { id: 'fanzin', ad: 'Fanzin' },
  { id: 'video', ad: 'Video' }
];

export default function Icerik({ sekme, onSekme, sosyal, blog, fanzin, onAjans }: {
  sekme: IcerikSekmesi;
  onSekme: (s: IcerikSekmesi) => void;
  sosyal: React.ReactNode;
  blog: React.ReactNode;
  fanzin: React.ReactNode;
  /** Ajans bağlantısı (GitHub anahtarı orada girilir) */
  onAjans: () => void;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SekmeCipleri etiket="İçerik" sekmeler={SEKMELER} aktif={sekme} onSec={onSekme} />
      {sekme === 'sosyal' && sosyal}
      {sekme === 'blog' && blog}
      {sekme === 'fanzin' && <GomuluSayfa.Provider value={true}>{fanzin}</GomuluSayfa.Provider>}
      {sekme === 'video' && <IcerikVideo onAjans={onAjans} />}
    </div>
  );
}
