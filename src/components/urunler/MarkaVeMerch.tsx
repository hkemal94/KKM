import React from 'react';
import { SekmeCipleri } from './SekmeCipleri';

/**
 * Ürünler → Marka ve merch (2 Kasım, yol haritası 6. adım; Kemal: "merch ve
 * marka birleşir"). Markalar (galeri dahil) ve Merch (droplar, ürünler) tek
 * sayfada; ekranların içi değişmedi.
 */
export type MarkaSekmesi = 'markalar' | 'merch';

const SEKMELER: Array<{ id: MarkaSekmesi; ad: string }> = [
  { id: 'markalar', ad: 'Markalar ve galeri' },
  { id: 'merch', ad: 'Droplar ve ürünler' }
];

export default function MarkaVeMerch({ sekme, onSekme, markalar, merch }: {
  sekme: MarkaSekmesi;
  onSekme: (s: MarkaSekmesi) => void;
  markalar: React.ReactNode;
  merch: React.ReactNode;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SekmeCipleri etiket="Marka ve merch" sekmeler={SEKMELER} aktif={sekme} onSec={onSekme} />
      {sekme === 'markalar' ? markalar : merch}
    </div>
  );
}
