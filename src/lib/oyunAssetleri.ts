import { anahtarBasligi, hamAdres } from './depoBelgesi';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Oyunların assetleri (2 Kasım, Kemal: "bunların hepsiyle oynayabilmek,
 * değiştirebilmek ve yeni çalışmalar yapabilmek istiyorum"; "assetler oyun
 * kısmında olmalı").
 *
 * - Oyun sekmesi: oyunun deposundaki `public/` altında duran görseller ve 3B
 *   modeller, oyunun güncel hâlinden okunur (depoya hiçbir şey yazılmaz).
 * - Ortak: birden fazla yerde kullanılan assetler. Bugün ajansın
 *   `assetler/` klasörü (logolar, önizlemeler); binalar ortak bina
 *   kütüphanesiyle gelecek.
 * - Değişiklik ve yeni çalışma `kkm/istekler.json`'a istek olarak gider;
 *   oyuna Oyun Geliştiricisi'nin PR'ıyla, Kemal'in onayıyla girer.
 */

export type AssetTuru = 'gorsel' | 'model';
export interface Asset { yol: string; ad: string; tur: AssetTuru; grup: string; adres: string; gizli: boolean }

const GORSEL = /\.(png|jpe?g|webp|gif|svg)$/i;
const MODEL = /\.(glb|gltf)$/i;

/** Ortak assetlerin bugünkü yeri: ajansın gizli deposu */
export const ORTAK_DEPO = AJANS_DEPOSU;
export const ORTAK_KLASOR = 'assetler/';

interface Agac { tree: Array<{ path: string; type: string }>; truncated?: boolean }

async function agacOku(depo: string): Promise<Agac> {
  const r = await fetch(`https://api.github.com/repos/${depo}/git/trees/HEAD?recursive=1`, {
    cache: 'no-cache', headers: { Accept: 'application/vnd.github+json', ...anahtarBasligi() }
  });
  if (r.status === 404) throw new Error('depo bulunamadı ya da bu tarayıcının GitHub anahtarı onu göremiyor');
  if (r.status === 403) throw new Error('GitHub şu an okumaya izin vermiyor (saatlik sınır); biraz sonra yenile');
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json() as Promise<Agac>;
}

/** Klasör adını okunur gruba çevirir: "public/gorseller/urunler/x.png" → "gorseller / urunler" */
function grupAdi(yol: string, kok: string): string {
  const parca = yol.slice(kok.length).split('/').slice(0, -1).filter(p => p && !/^textures?$/i.test(p));
  return parca.length ? parca.join(' / ') : 'genel';
}

/** `kok` altındaki görsel ve modeller; `gizli` ise dosyalar anahtarla okunur */
export async function assetleriListele(depo: string, kok = 'public/', gizli = false): Promise<Asset[]> {
  const agac = await agacOku(depo);
  return agac.tree
    .filter(d => d.type === 'blob' && d.path.startsWith(kok) && (GORSEL.test(d.path) || MODEL.test(d.path)))
    // Modelin doku dosyaları (Textures/) ayrı asset değil
    .filter(d => !/\/textures?\//i.test(d.path))
    .map(d => ({
      yol: d.path,
      ad: d.path.split('/').pop() || d.path,
      tur: (MODEL.test(d.path) ? 'model' : 'gorsel') as AssetTuru,
      grup: grupAdi(d.path, kok),
      adres: hamAdres(depo, d.path),
      gizli,
    }))
    .sort((a, b) => a.grup.localeCompare(b.grup, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
}

const blobOnbellek = new Map<string, string>();

/** Gizli depodaki dosyayı anahtarla indirip tarayıcı içi adres verir (önbellekli) */
export async function gizliAdres(depo: string, yol: string): Promise<string> {
  const k = `${depo}:${yol}`;
  const var_ = blobOnbellek.get(k);
  if (var_) return var_;
  const r = await fetch(`https://api.github.com/repos/${depo}/contents/${yol}`, {
    headers: { Accept: 'application/vnd.github.raw+json', ...anahtarBasligi() }
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const adres = URL.createObjectURL(await r.blob());
  blobOnbellek.set(k, adres);
  return adres;
}

/** Assetleri gruplar (sıra korunur) */
export function grupla(liste: Asset[]): Array<{ grup: string; assetler: Asset[] }> {
  const m = new Map<string, Asset[]>();
  for (const a of liste) m.set(a.grup, [...(m.get(a.grup) || []), a]);
  return [...m.entries()].map(([grup, assetler]) => ({ grup, assetler }));
}

/** İstek metni: hangi oyun, hangi dosyalar, Kemal'in notu */
export function istekMetni(kaynak: string, tur: 'degistir' | 'yeni', assetler: Asset[], not: string): string {
  const bas = tur === 'degistir' ? `Asset değişikliği · ${kaynak}` : `Yeni çalışma · ${kaynak}`;
  const dosyalar = assetler.map(a => `- ${a.yol}`).join('\n');
  return `${bas}\n${dosyalar}\nNot: ${not.trim()}`;
}
