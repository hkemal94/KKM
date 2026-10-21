import { useEffect, useState } from 'react';
import { doc, getDoc, getDocFromServer, setDoc, deleteDoc } from 'firebase/firestore';
import { db, sunucuyaUlas } from './firebase';
import type { Item } from '../types';
import {
  basvuruMu, basvuruKimligi, basvuruYap, rastgeleKimlik, basvurulari
} from './gorselBasvuru';
import { gorselAnlik, gorselOnbellegeKoy } from './gorselOnbellek';

/**
 * Görsel deposu (21 Ekim, paket K): `users/{uid}/gorseller/{id}`.
 * Belge `{ id, veri, userId, olusturma }`; bir kez yazılır, değişmez
 * (kural güncellemeye izin vermez). Kayıtlarda yalnız `gorsel:<id>` durur.
 * Eski değerler (`data:`, `http`, `/`) olduğu gibi çalışır.
 */

/** Etkin alanın kimliği: App, çalışma alanı açılınca bildirir */
let etkinUid: string | null = null;
export const gorselUidAyarla = (uid: string | null) => { etkinUid = uid; };

export type YazmaNedeni = 'kural' | 'zaman' | 'diger';

export class GorselYazmaHatasi extends Error {
  neden: YazmaNedeni;
  constructor(neden: YazmaNedeni, ayrinti?: string) {
    super(ayrinti || neden);
    this.neden = neden;
  }
}

function hataNedeni(e: unknown): GorselYazmaHatasi {
  if (e instanceof GorselYazmaHatasi) return e;
  const kod = (e as { code?: string } | null)?.code;
  const ileti = e instanceof Error ? e.message : String(e);
  if (kod === 'permission-denied' || /permission|insufficient/i.test(ileti)) return new GorselYazmaHatasi('kural', ileti);
  if (ileti === 'zaman-asimi') return new GorselYazmaHatasi('zaman', ileti);
  return new GorselYazmaHatasi('diger', ileti);
}

const belge = (uid: string, kimlik: string) => doc(db, 'users', uid, 'gorseller', kimlik);
const uidAl = (uid?: string) => {
  const u = uid || etkinUid;
  if (!u) throw new GorselYazmaHatasi('diger', 'alan kimliği yok');
  return u;
};

/**
 * Görseli depoya yazar, başvurusunu döner. `kimlik` verilirse (göç) belge
 * zaten varsa ve aynıysa yeniden yazılmaz. Reddedilirse GorselYazmaHatasi.
 */
export async function gorselYaz(dataUrl: string, kimlik?: string, uid?: string): Promise<string> {
  const id = kimlik || rastgeleKimlik();
  const ref = basvuruYap(id);
  try {
    const u = uidAl(uid);
    if (kimlik) {
      const var_ = await sunucuyaUlas(getDoc(belge(u, id)));
      if (var_.exists() && var_.data().veri === dataUrl) {
        gorselOnbellegeKoy(ref, dataUrl);
        return ref;
      }
    }
    await sunucuyaUlas(setDoc(belge(u, id), { id, veri: dataUrl, userId: u, olusturma: Date.now() }));
  } catch (e) {
    throw hataNedeni(e);
  }
  gorselOnbellegeKoy(ref, dataUrl);
  return ref;
}

/** Yazılan belgeyi sunucudan okuyup aynı mı diye bakar (önbelleğe güvenmez) */
export async function gorselDogrula(ref: string, beklenen: string, uid?: string): Promise<boolean> {
  try {
    const s = await sunucuyaUlas(getDocFromServer(belge(uidAl(uid), basvuruKimligi(ref))));
    return s.exists() && s.data().veri === beklenen;
  } catch { return false; }
}

const bekleyen = new Map<string, Promise<string | null>>();

/** Başvuruyu görüntülenecek adrese çevirir (önbellekli, aynı istek bir kez) */
export function gorselOku(ref: string, uid?: string): Promise<string | null> {
  if (!basvuruMu(ref)) return Promise.resolve(ref);
  const hazir = gorselAnlik(ref);
  if (hazir) return Promise.resolve(hazir);
  const u = uid || etkinUid;
  if (!u) return Promise.resolve(null);
  let p = bekleyen.get(ref);
  if (!p) {
    p = getDoc(belge(u, basvuruKimligi(ref)))
      .then(s => {
        const v = s.exists() ? s.data().veri : null;
        if (typeof v === 'string') { gorselOnbellegeKoy(ref, v); return v; }
        return null;
      })
      .catch(e => { console.warn('Görsel okunamadı:', ref, e); return null; })
      .finally(() => { bekleyen.delete(ref); });
    bekleyen.set(ref, p);
  }
  return p;
}

/** Depodaki belgeleri siler (kayıt silinince) */
export async function gorselSil(refler: string[], uid?: string): Promise<void> {
  const u = uidAl(uid);
  for (const r of refler) {
    if (!basvuruMu(r)) continue;
    await sunucuyaUlas(deleteDoc(belge(u, basvuruKimligi(r))));
  }
}

/**
 * React kancası: `src` bir başvuruysa çözer. undefined = yükleniyor,
 * null = bulunamadı, dize = görüntülenecek adres. Eski değerler hemen döner.
 */
export function useGorsel(src: string | undefined): string | null | undefined {
  const dogrudan = !src || !basvuruMu(src);
  const [, yenile] = useState(0);
  const [yok, setYok] = useState<string | null>(null);
  const hazir = dogrudan ? src : gorselAnlik(src);
  useEffect(() => {
    if (dogrudan || !src || hazir) return;
    let iptal = false;
    void gorselOku(src).then(v => {
      if (iptal) return;
      if (v === null) setYok(src); else yenile(n => n + 1);
    });
    return () => { iptal = true; };
  }, [src, dogrudan, hazir]);
  if (dogrudan) return src;
  if (hazir) return hazir;
  return yok === src ? null : undefined;
}

/** Maddelere bağlı galeri görselleri önceden yüklenir (logo, künye) */
export function bagliGorselleriYukle(items: Item[]) {
  for (const g of items) {
    if (g.type !== 'ilham_gorsel' || g.archived) continue;
    if (!(g.metadata as Record<string, unknown> | undefined)?.bagliId) continue;
    const r = g.images?.[0];
    if (basvuruMu(r)) void gorselOku(r);
  }
}

/** Yedek için: kayıtlardaki bütün başvuruların görselleri { kimlik: veri } */
export async function gorselYedegi(items: Item[]): Promise<Record<string, string>> {
  const cikti: Record<string, string> = {};
  const hepsi = new Set<string>();
  for (const i of items) basvurulari(i.images).forEach(r => hepsi.add(r));
  await Promise.all([...hepsi].map(async r => {
    const v = await gorselOku(r);
    if (v) cikti[basvuruKimligi(r)] = v;
  }));
  return cikti;
}

/** Yedekten geri yükleme: olmayan belgeler yazılır, olanlara dokunulmaz */
export async function gorselleriGeriYaz(yedek: Record<string, string>): Promise<number> {
  let yazilan = 0;
  for (const [id, veri] of Object.entries(yedek)) {
    if (typeof veri !== 'string' || !veri.startsWith('data:image/')) continue;
    const s = await getDoc(belge(uidAl(), id));
    if (s.exists()) continue;
    await gorselYaz(veri, id);
    yazilan++;
  }
  return yazilan;
}
