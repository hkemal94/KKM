import { hamAdres } from './depoBelgesi';

/**
 * Oyunun ayar dosyası (15 Ekim; oyunun deposunda belge 0.12, 7. adım).
 * Dondurmacı Kızlar'daki bütün fiyat, süre ve oranlar oyunun deposunda
 * `src/oyun/ayarlar.json`'da. Ayarlar sekmesi dosyayı canlı okur; Kemal
 * sayıları değiştirip "Oyuna gönder" deyince oyunun deposunda yeni bir dalda
 * dosya güncellenir ve PR açılır. Birleştirmeyi Kemal GitHub'da yapar.
 *
 * Yazma yolu (Kemal, 15 Ekim: "GitHub anahtarı"): GitHub'ın ince ayarlı
 * anahtarı yalnız bu tarayıcıda (localStorage) durur; KKM kayıtlarına
 * (Firestore) hiç yazılmaz, başka yere gönderilmez, yalnız api.github.com'a gider.
 */

export const AYAR_YOLU = 'src/oyun/ayarlar.json';

export interface Ayar { ad: string; deger: number; birim?: string; not?: string }
export interface AyarBolumu { ad: string; aciklama?: string; ayarlar: Record<string, Ayar> }
export interface AyarDosyasi { _aciklama?: string; bolumler: Record<string, AyarBolumu> }

/** Depodaki ayar dosyasını okur (ham metin de döner: gönderirken kıyaslanır) */
export async function ayarlariOku(depo: string): Promise<{ dosya: AyarDosyasi; ham: string }> {
  const r = await fetch(hamAdres(depo, AYAR_YOLU), { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Oyunun deposunda ayar dosyası yok' : `${r.status}`);
  const ham = await r.text();
  const dosya = JSON.parse(ham) as AyarDosyasi;
  if (!dosya || typeof dosya.bolumler !== 'object') throw new Error('Ayar dosyası tanınmadı');
  return { dosya, ham };
}

/** Değişiklikler: "bolum.anahtar" → yeni değer */
export type Degisiklikler = Record<string, number>;

export interface DegisiklikSatiri { bolum: string; anahtar: string; ad: string; eski: number; yeni: number; birim?: string }

export function degisiklikListesi(dosya: AyarDosyasi, d: Degisiklikler): DegisiklikSatiri[] {
  const liste: DegisiklikSatiri[] = [];
  if (!dosya?.bolumler) return liste;
  for (const [bolum, b] of Object.entries(dosya.bolumler)) {
    if (!b?.ayarlar) continue;
    for (const [anahtar, a] of Object.entries(b.ayarlar)) {
      const yeni = d[`${bolum}.${anahtar}`];
      if (yeni !== undefined && yeni !== a.deger) liste.push({ bolum: b.ad, anahtar, ad: a.ad, eski: a.deger, yeni, birim: a.birim });
    }
  }
  return liste;
}

/** Yeni dosya metni: yalnız değerler değişir; biçim oyunun deposundakiyle aynı (2 boşluk girinti) */
export function yeniDosya(dosya: AyarDosyasi, d: Degisiklikler): string {
  const kopya = JSON.parse(JSON.stringify(dosya)) as AyarDosyasi;
  if (!kopya?.bolumler) return JSON.stringify(kopya, null, 2) + '\n';
  for (const [bolum, b] of Object.entries(kopya.bolumler)) {
    if (!b?.ayarlar) continue;
    for (const [anahtar, a] of Object.entries(b.ayarlar)) {
      const yeni = d[`${bolum}.${anahtar}`];
      if (yeni !== undefined) a.deger = yeni;
    }
  }
  return JSON.stringify(kopya, null, 2) + '\n';
}

/** Kutudaki yazı → sayı; virgül de olur (4,5). Geçersizse null */
export function sayiyaCevir(yazi: string): number | null {
  const s = yazi.trim().replace(',', '.');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---- GitHub anahtarı (yalnız bu tarayıcıda) ----
const ANAHTAR_YERI = 'kkm-github-anahtari';
export function anahtariOku(): string {
  try { return localStorage.getItem(ANAHTAR_YERI) || ''; } catch { return ''; }
}
export function anahtariYaz(anahtar: string) {
  try {
    if (anahtar) localStorage.setItem(ANAHTAR_YERI, anahtar.trim());
    else localStorage.removeItem(ANAHTAR_YERI);
  } catch { /* tarayıcı izin vermezse yalnız bu açılışta */ }
}

/** GitHub'a anahtarla istek (Ajansa gönder de kullanır, `lib/ajansaGonder.ts`) */
export async function github<T>(anahtar: string, yol: string, secenek: { method?: string; govde?: unknown } = {}): Promise<T> {
  const r = await fetch(`https://api.github.com${yol}`, {
    method: secenek.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${anahtar}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(secenek.govde ? { 'Content-Type': 'application/json' } : {}),
    },
    body: secenek.govde ? JSON.stringify(secenek.govde) : undefined,
    cache: 'no-store',
  });
  if (!r.ok) {
    if (r.status === 401) throw new Error('GitHub anahtarı geçersiz ya da süresi dolmuş');
    if (r.status === 403 || r.status === 404) throw new Error('Anahtarın bu depoya yazma izni yok (Contents ve Pull requests: Read and write)');
    let ayrinti = '';
    try { ayrinti = ((await r.json()) as { message?: string }).message || ''; } catch { /* boş */ }
    throw new Error(`GitHub ${r.status}${ayrinti ? `: ${ayrinti}` : ''}`);
  }
  return r.json() as Promise<T>;
}

/** UTF-8 metni base64'e (Türkçe harfler bozulmasın) */
export function base64(metin: string): string {
  const baytlar = new TextEncoder().encode(metin);
  let ikili = '';
  for (const b of baytlar) ikili += String.fromCharCode(b);
  return btoa(ikili);
}
export function base64Coz(b64: string): string {
  const ikili = atob(b64.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(ikili, c => c.charCodeAt(0)));
}

/**
 * Yeni dalda ayar dosyasını günceller ve PR açar; PR adresini döner.
 * Okunduktan sonra depoda dosya değiştiyse durur (üstüne yazılmasın).
 */
export async function oyunaGonder(anahtar: string, depo: string, okunanHam: string, yeniMetin: string, satirlar: DegisiklikSatiri[]): Promise<string> {
  const bilgi = await github<{ default_branch: string }>(anahtar, `/repos/${depo}`);
  const ana = bilgi.default_branch;
  const dosya = await github<{ sha: string; content: string }>(anahtar, `/repos/${depo}/contents/${AYAR_YOLU}?ref=${encodeURIComponent(ana)}`);
  const depodaki = base64Coz(dosya.content).replace(/\r\n/g, '\n').trim();
  const okunan = okunanHam.replace(/\r\n/g, '\n').trim();
  if (depodaki !== okunan) throw new Error('Ayar dosyası sen okuduktan sonra depoda değişmiş. Yenile, sonra yeniden dene.');
  const ref = await github<{ object: { sha: string } }>(anahtar, `/repos/${depo}/git/ref/heads/${encodeURIComponent(ana)}`);
  const zaman = new Date();
  const iki = (n: number) => String(n).padStart(2, '0');
  const dal = `kkm-ayarlar-${zaman.getFullYear()}${iki(zaman.getMonth() + 1)}${iki(zaman.getDate())}-${iki(zaman.getHours())}${iki(zaman.getMinutes())}${iki(zaman.getSeconds())}`;
  await github(anahtar, `/repos/${depo}/git/refs`, { method: 'POST', govde: { ref: `refs/heads/${dal}`, sha: ref.object.sha } });
  const ozet = satirlar.length === 1 ? `${satirlar[0].ad}: ${satirlar[0].eski} → ${satirlar[0].yeni}` : `${satirlar.length} ayar değişti`;
  await github(anahtar, `/repos/${depo}/contents/${AYAR_YOLU}`, {
    method: 'PUT',
    govde: { message: `Ayarlar (KKM): ${ozet}`, content: base64(yeniMetin), sha: dosya.sha, branch: dal },
  });
  const govde = [
    'KKM → Oyun → **Ayarlar** sekmesinden gönderildi. Yalnız `src/oyun/ayarlar.json`\'daki değerler değişti.',
    '',
    '| Bölüm | Ayar | Eski | Yeni |',
    '|---|---|---|---|',
    ...satirlar.map(s => `| ${s.bolum} | ${s.ad} | ${s.eski} | **${s.yeni}**${s.birim ? ` ${s.birim}` : ''} |`),
    '',
    'Birleştirince oyun bu değerlerle yeniden kurulur.',
  ].join('\n');
  const pr = await github<{ html_url: string }>(anahtar, `/repos/${depo}/pulls`, {
    method: 'POST',
    govde: { title: `Ayarlar: ${ozet}`, head: dal, base: ana, body: govde },
  });
  return pr.html_url;
}
