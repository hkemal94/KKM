import type { Item } from '../types';
import { adiCoz } from './alanSablonu';

/**
 * Bir kişi hangi ailelerde görünür (21 Ekim, Kemal: "Yılmaz ailesinde
 * Zeynep gözükmüyor; evlenince geçiyor olmalı, iki yerde de görünebilmeli").
 *
 * Her şey ekranda hesaplanır, kayda yazılmaz:
 *  - üye: künyedeki "Aile", "Soyadı" (aile adıyla aynıysa) ya da "üyesi" bağı
 *  - doğduğu aile: künyedeki "Doğduğu aile" ya da "Doğumdaki soyadı"
 *  - evlilik: üye olan birinin eşi (eşi bağı iki yönde okunur)
 * Kişi aynı anda birkaç ailede görünebilir.
 */

export type UyelikYolu = 'uye' | 'dogum' | 'evlilik';
export interface AileUyeligi { kisi: Item; yol: UyelikYolu; es?: Item }

const KISI = new Set(['kisi', 'karakter']);
const canli = (i: Item) => !i.archived && !i.isProposal;

const profil = (i: Item, anahtar: string): string => {
  const v = (i.metadata?.profile as Record<string, unknown> | undefined)?.[anahtar];
  return typeof v === 'string' ? v.trim() : '';
};

type Bag = { targetId?: string; type?: string; isProposal?: boolean };
const baglar = (i: Item): Bag[] => (Array.isArray(i.metadata?.relations) ? (i.metadata!.relations as Bag[]) : []);

/** Eşleri: "eşi" bağı hangi kişinin kaydında yazılmış olursa olsun iki tarafta da görünür */
export function esleri(kisi: Item, items: Item[]): Item[] {
  const ids = new Set<string>();
  for (const r of baglar(kisi)) if (r?.type === 'eşi' && r.targetId && !r.isProposal) ids.add(r.targetId);
  for (const o of items) {
    if (o.id === kisi.id) continue;
    if (baglar(o).some(r => r?.type === 'eşi' && r.targetId === kisi.id && !r.isProposal)) ids.add(o.id);
  }
  ids.delete(kisi.id);
  return items.filter(i => ids.has(i.id) && canli(i) && KISI.has(i.type));
}

const adaEslesir = (ad: string, aile: Item) => !!ad && adiCoz(ad, [aile])?.id === aile.id;

/** Kişinin bu aileye künyeden/bağdan doğrudan bağı: üye, doğduğu aile ya da hiçbiri */
export function dogrudanUyelik(kisi: Item, aile: Item): 'uye' | 'dogum' | null {
  const uyeBagi = baglar(kisi).some(r => r?.type === 'üyesi' && r.targetId === aile.id && !r.isProposal);
  if (uyeBagi || adaEslesir(profil(kisi, 'aile'), aile) || adaEslesir(profil(kisi, 'soyadi'), aile)) return 'uye';
  if (adaEslesir(profil(kisi, 'dogumAilesi'), aile) || adaEslesir(profil(kisi, 'dogumSoyadi'), aile)) return 'dogum';
  return null;
}

/** Ailenin kişileri: üyeler, doğduğu aile olanlar, evlilikle bağlı olanlar (bu sırayla, ada göre) */
export function aileUyeleri(aile: Item, items: Item[]): AileUyeligi[] {
  const kisiler = items.filter(i => canli(i) && KISI.has(i.type));
  const dogrudan = new Map<string, 'uye' | 'dogum'>();
  for (const k of kisiler) { const y = dogrudanUyelik(k, aile); if (y) dogrudan.set(k.id, y); }
  const cikti: AileUyeligi[] = [];
  for (const k of kisiler) {
    const y = dogrudan.get(k.id);
    if (y) { cikti.push({ kisi: k, yol: y }); continue; }
    // Ailenin üyesinin eşi: evlilikle bağlı. Doğduğu aile olarak anılan kişinin eşi sayılmaz
    // (Kaya'da doğup evlenerek ayrılan kadının kocası Kaya ailesinde görünmez).
    const es = esleri(k, items).find(e => dogrudan.get(e.id) === 'uye');
    if (es) cikti.push({ kisi: k, yol: 'evlilik', es });
  }
  const sira: Record<UyelikYolu, number> = { uye: 0, dogum: 1, evlilik: 2 };
  return cikti.sort((a, b) => sira[a.yol] - sira[b.yol] || a.kisi.title.localeCompare(b.kisi.title, 'tr'));
}
