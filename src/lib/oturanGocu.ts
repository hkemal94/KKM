import type { Item } from '../types';
import { kisiMi } from './adaSakini';

/**
 * Evde oturanlar tek haritaya (tek harita 11. adım, KKM-A; Kemal, 23 Kasım:
 * "taşınsın"). Tek seferlik göç, yalnız Durum → Eksikler'deki kartın
 * düğmesiyle yazar.
 *
 * Eskiden kimin hangi evde oturduğu yalnız eski haritanın kaydında
 * (`duzada/haritaDuzeni` → Kurucu taslağının `oturanlar`'ı: ev → kişiler)
 * duruyordu. Eski haritalar silinecek; bağ kişinin kendi maddesine geçer:
 * `metadata.haritaEvi` = tek haritadaki evin kimliği (ev kimlikleri tek
 * haritada aynı). Tek haritanın yapı kartı "Oturanlar"ı buradan okur.
 *
 * Saf iş: hiçbir şey yazmaz. İkinci basışta yazılacak bir şey kalmaz
 * (kişide aynı ev zaten yazılıysa atlanır).
 */

/** Kişi maddesindeki ev bağının alanı */
export const HARITA_EVI = 'haritaEvi';

/** Kişinin tek haritadaki evi (yoksa null) */
export function haritaEvi(i: Item): string | null {
  const v = i.metadata?.[HARITA_EVI];
  return typeof v === 'string' && v ? v : null;
}

/** Tek haritada bu evde oturan kişiler (ada göre) */
export function evdeOturanlar(items: Item[] | undefined, evId: string): Item[] {
  return (items ?? [])
    .filter(i => !i.archived && !i.isProposal && kisiMi(i) && haritaEvi(i) === evId)
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

export interface OturanGocu {
  /** Yazılacak kişi maddeleri (evi eklenmiş yeni hâli) */
  yazilacak: Array<{ kisi: Item; evId: string }>;
  /** Taşınamayanlar ve nedeni (bilgi; yazılmaz) */
  atlanan: Array<{ kisiId: string; ad: string; evId: string; neden: string }>;
}

/**
 * `oturanlar`: eski kayıttaki ev → kişi kimlikleri. Kişi maddesi yoksa,
 * kişinin maddesinde başka bir ev yazılıysa ya da kişi iki eve bağlıysa
 * atlanır (üstüne yazılmaz; Kemal görür).
 */
export function oturanGocu(items: Item[], oturanlar: Record<string, string[]>, simdi: number = Date.now()): OturanGocu {
  const kisiler = new Map(items.filter(i => !i.archived && kisiMi(i)).map(i => [i.id, i] as const));
  const evleri = new Map<string, string[]>();
  for (const [evId, liste] of Object.entries(oturanlar)) {
    for (const k of new Set((Array.isArray(liste) ? liste : []).filter(x => typeof x === 'string' && x))) {
      evleri.set(k, [...(evleri.get(k) ?? []), evId]);
    }
  }
  const sonuc: OturanGocu = { yazilacak: [], atlanan: [] };
  for (const [kisiId, evler] of [...evleri.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const kisi = kisiler.get(kisiId);
    const evId = evler[0];
    if (!kisi) { sonuc.atlanan.push({ kisiId, ad: kisiId, evId: evler.join(', '), neden: 'kişi maddesi bulunamadı' }); continue; }
    if (evler.length > 1) { sonuc.atlanan.push({ kisiId, ad: kisi.title, evId: evler.join(', '), neden: 'iki ayrı evde kayıtlı' }); continue; }
    const var_ = haritaEvi(kisi);
    if (var_ === evId) continue;
    if (var_) { sonuc.atlanan.push({ kisiId, ad: kisi.title, evId, neden: `maddesinde başka ev yazılı (${var_})` }); continue; }
    sonuc.yazilacak.push({ kisi: { ...kisi, metadata: { ...(kisi.metadata || {}), [HARITA_EVI]: evId }, updatedAt: simdi }, evId });
  }
  return sonuc;
}
