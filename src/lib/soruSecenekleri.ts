import type { Item } from '../types';
import type { Bosluk } from '../components/Bosluklar';
import { getKunyeFields, getArticleBody, TYPE_LABELS } from '../components/wiki/wikiSchema';
import { ADA_KIMLIGI } from './vikiSifirlama';
import { aiCagir, AiHatasi } from './aiCagir';

/**
 * Atölye sorusu için yapay zekâ seçenekleri (Paket 4).
 * 29 Eylül akşamı stüdyoya taşındı: ana sayfa artık kendiliğinden yapay
 * zekâya sormuyor (kota oradan doluyordu). Seçenekler stüdyoda getirilir,
 * bu önbelleğe yazılır; soru kartı önbellekten okur.
 */

const ONBELLEK = 'kems_soru_secenekleri';
/** Seçenek yazılınca soru kartları yeniden okusun */
export const SECENEK_OLAYI = 'kems-soru-secenegi';

/**
 * Seçenekler üç gün geçerli. Eski biçimde (tarihsiz) saklananlar da
 * okunmaz: Kemal, 30 Eylül: "yanındaki yapay zekâ seçenekleri eski".
 */
const GECERLILIK = 3 * 86_400_000;

export function secenekleriOku(anahtar: string): string[] | null {
  try {
    const k = JSON.parse(localStorage.getItem(ONBELLEK) || '{}')[anahtar];
    if (!k || Array.isArray(k) || !Array.isArray(k.s) || Date.now() - (k.t || 0) > GECERLILIK) return null;
    return k.s;
  } catch { return null; }
}

function secenekleriYaz(anahtar: string, s: string[]) {
  try {
    const t = JSON.parse(localStorage.getItem(ONBELLEK) || '{}');
    t[anahtar] = { s, t: Date.now() };
    localStorage.setItem(ONBELLEK, JSON.stringify(t));
  } catch { /* yok */ }
  try { window.dispatchEvent(new Event(SECENEK_OLAYI)); } catch { /* yok */ }
}

function ayikla(ham: unknown): string[] {
  let v = ham;
  if (typeof v === 'string') {
    try { v = JSON.parse(v.replace(/^```(json)?|```$/gm, '').trim()); } catch { return []; }
  }
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()).slice(0, 3)
    : [];
}

/** Seçenekleri getirir ve önbelleğe yazar */
export async function secenekGetir(bosluk: Bosluk, items: Item[]): Promise<string[]> {
  const ada = items.find(i => i.id === ADA_KIMLIGI);
  const sonuc = await aiCagir('kanon-sorusu-secenek', {
    madde: bosluk.item.title,
    etiket: bosluk.etiket,
    soru: bosluk.soru,
    baglam: {
      tur: TYPE_LABELS[bosluk.item.type] || bosluk.item.type,
      kunye: getKunyeFields(bosluk.item).map(f => `${f.label}: ${f.value}`),
      metin: getArticleBody(bosluk.item).map(b => b.text).join('\n').slice(0, 1200)
    },
    ada: ada ? [getKunyeFields(ada).map(f => `${f.label}: ${f.value}`).join('; '), (ada.notes || '').slice(0, 1500)].join('\n') : ''
  });
  const s = ayikla(sonuc);
  if (!s.length) throw new AiHatasi('Seçenek gelmedi; kendin yazabilirsin.');
  secenekleriYaz(bosluk.anahtar, s);
  return s;
}
