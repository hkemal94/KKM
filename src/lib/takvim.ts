import type { Item } from '../types';
import { gonderiBilgisi, gonderiler } from './sosyal';

/**
 * Tek takvim (yapisal-4, 35–36). Drop çıkış tarihleri sosyal medya
 * takvimiyle aynı yerde; genel Takvim sayfası (Araçlar) hepsini gösterir.
 *
 * Drop'un çıkış tarihi `metadata.cikisTarihi` ('YYYY-MM-DD'); Merch'te drop
 * sayfasındaki tarih kutusundan Kemal girer. Uydurma tarih yok: boşsa
 * takvimde görünmez.
 */

export type TakvimTuru = 'drop' | 'gonderi';

export interface TakvimOlayi {
  tur: TakvimTuru;
  id: string;
  baslik: string;
  tarih: string;
  saat?: string;
}

export const dropTarihi = (d: Item): string => {
  const t = d.metadata?.cikisTarihi;
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
};

/** Bir ayın bütün olayları, tarihe göre */
export function takvimOlaylari(items: Item[], y: number, a: number, turler: TakvimTuru[] = ['drop', 'gonderi']): Map<string, TakvimOlayi[]> {
  const on = `${y}-${String(a + 1).padStart(2, '0')}-`;
  const m = new Map<string, TakvimOlayi[]>();
  const ekle = (o: TakvimOlayi) => { if (!o.tarih.startsWith(on)) return; m.set(o.tarih, [...(m.get(o.tarih) || []), o]); };
  const canli = items.filter(i => !i.archived && !i.isProposal);
  if (turler.includes('drop')) {
    for (const d of canli.filter(i => i.type === 'drop')) {
      const t = dropTarihi(d);
      if (t) ekle({ tur: 'drop', id: d.id, baslik: d.title, tarih: t });
    }
  }
  if (turler.includes('gonderi')) {
    for (const g of gonderiler(canli)) {
      const b = gonderiBilgisi(g);
      if (b.tarih) ekle({ tur: 'gonderi', id: g.id, baslik: g.title, tarih: b.tarih, saat: b.saat || undefined });
    }
  }
  for (const [k, v] of m) m.set(k, v.sort((x, z) => (x.saat || '').localeCompare(z.saat || '')));
  return m;
}
