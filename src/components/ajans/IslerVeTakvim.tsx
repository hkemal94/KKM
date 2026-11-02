import React from 'react';
import { GomuluSayfa, SayfaBasi } from '../kabuk/SayfaBasi';
import { SayfaRayi } from '../SayfaRayi';
import { KimdeNeVar } from './KimdeNeVar';
import { YapilacakEkle } from './YapilacakEkle';

/**
 * Ajans → İşler ve takvim (2 Kasım, yol haritası 3. adım; Kemal'in yerleşimi).
 * Üç bölüm: Kimde ne var · Takvim · Yol haritası. Takvim ve Yol haritası
 * Durum'dan buraya taşındı; çizimleri değişmedi.
 * 7. adım (2 Kasım): Kimde ne var'ın üstünde "Yapılacak ekle".
 */
export type IslerSekmesi = 'kimde' | 'takvim' | 'yolharitasi';

interface Props {
  sekme: IslerSekmesi;
  onSekme: (s: IslerSekmesi) => void;
  takvim: React.ReactNode;
  yolHaritasi: React.ReactNode;
  onAjans: () => void;
}

const BOLUMLER = [
  { id: 'kimde', label: 'Kimde ne var' },
  { id: 'takvim', label: 'Takvim' },
  { id: 'yolharitasi', label: 'Yol haritası' }
];

export const IslerVeTakvim: React.FC<Props> = ({ sekme, onSekme, takvim, yolHaritasi, onAjans }) => (
  <div className="space-y-5 animate-in fade-in duration-300">
    <SayfaBasi baslik="İşler ve takvim" />
    <SayfaRayi baslik="İşler ve takvim" bolumler={BOLUMLER} aktifId={sekme} onSec={id => onSekme(id as IslerSekmesi)} />
    {sekme === 'kimde' && <><YapilacakEkle /><KimdeNeVar onAjans={onAjans} /></>}
    <GomuluSayfa.Provider value={true}>
      {sekme === 'takvim' && takvim}
      {sekme === 'yolharitasi' && yolHaritasi}
    </GomuluSayfa.Provider>
  </div>
);

export default IslerVeTakvim;
