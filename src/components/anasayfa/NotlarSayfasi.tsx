import React from 'react';
import type { Item } from '../../types';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { NotDefteri } from './NotDefteri';

/**
 * Notlar (2 Kasım, yol haritası 1. adım: Ana sayfa kalktı). Not defteri
 * eskiden Ana sayfanın içindeydi; artık Yaz tuşundaki "Notlar" bu sayfayı
 * açar. Notların kendisi değişmedi.
 */
interface Props {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onMaddeAc: (item: Item) => void;
  /** Yaz tuşundaki "Hızlı not" ile yeni not sayfası isteği */
  yeniSayfaBekliyor: boolean;
  onYeniSayfaAcildi: () => void;
}

export const NotlarSayfasi: React.FC<Props> = ({ items, onAddItem, onUpdateItem, onMaddeAc, yeniSayfaBekliyor, onYeniSayfaAcildi }) => (
  <div className="space-y-3 lg:space-y-4 animate-in fade-in duration-300">
    <SayfaBasi baslik="Notlar" />
    <NotDefteri items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onMaddeAc={onMaddeAc} uzun yeniSayfaBekliyor={yeniSayfaBekliyor} onYeniSayfaAcildi={onYeniSayfaAcildi} />
  </div>
);

export default NotlarSayfasi;
