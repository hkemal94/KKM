import type { Item } from '../../types';

/**
 * Öneri işlerinin ortak bilgileri. Stüdyo ekranı ve "Stüdyoda aç" düğmeleri
 * 3 Kasım'da kalktı (Kemal: "kalksın"); bu tanımı yalnız Onay bekleyenler
 * kullanıyor.
 */
export interface StudyoIslemleri {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onMaddeyiAc: (item: Item) => void;
}
