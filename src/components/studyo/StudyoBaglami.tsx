import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Item } from '../../types';
import type { Bosluk } from '../Bosluklar';

/**
 * Stüdyoyu her sayfadan açmanın yolu (29 Eylül akşamı).
 * Sayfalar yalnız `useStudyo().ac({...})` çağırır; yan paneli App kurar.
 */

export interface StudyoIstegi {
  /** Açılacak araç; yoksa gruptaki araçlar listelenir */
  arac?: string;
  grup?: 'viki' | 'yazi' | 'marka' | 'kanon';
  hedefId?: string;
  /** Serbest kutunun ilk yazısı (fanzin bölümü: "3 · Sade") */
  serbest?: string;
  /** Atölye sorusu için seçenek */
  bosluk?: Bosluk;
}

export interface StudyoIslemleri {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAcceptProposal: (id: string) => Promise<void>;
  onMaddeyiAc: (item: Item) => void;
  /** Stüdyo sayfasına git (tepsinin tamamı) */
  onStudyoSayfasi: () => void;
}

interface Baglam {
  istek: StudyoIstegi | null;
  ac: (i: StudyoIstegi) => void;
  kapat: () => void;
}

const StudyoBaglami = createContext<Baglam>({ istek: null, ac: () => {}, kapat: () => {} });

export const StudyoSaglayici: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [istek, setIstek] = useState<StudyoIstegi | null>(null);
  const ac = useCallback((i: StudyoIstegi) => setIstek(i), []);
  const kapat = useCallback(() => setIstek(null), []);
  const deger = useMemo(() => ({ istek, ac, kapat }), [istek, ac, kapat]);
  return <StudyoBaglami.Provider value={deger}>{children}</StudyoBaglami.Provider>;
};

export const useStudyo = () => useContext(StudyoBaglami);
