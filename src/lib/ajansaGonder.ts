import type { Item } from '../types';
import {
  GDD_BOLUMLERI, KONSEPT_BOLUMLERI, MEKANIK_BOLUMLERI, KUNYE_SATIRLARI, FIKIR_KATEGORILERI, ASAMALAR,
  gddBolumleri, oyunAdi, oyunFikirleri, oyunIsleri, projeAsamasi, kunyeDegeri, secimSatirlari, serbestYazi
} from '../components/oyun/OyunSureci';
import { base64, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Ajansa gönder (21 Ekim, Kemal: "düğmeyi bir sonraki iş olarak düşünebiliriz").
 * Oyunun dosyası (oyun PDF'indeki bilgiler) Markdown olarak Kems Ajans'ın
 * deposuna `isler/gelen/` altına yazılır; ajansın sabah planı oradan okur ve
 * işi oyun departmanına dağıtır.
 *
 * - Yazma yolu "Oyuna gönder" ile aynı: GitHub anahtarı yalnız bu tarayıcıda
 *   durur (`lib/oyunAyarlari.ts`); anahtarın Kems-Ajans deposuna da izni olmalı.
 * - Kemal bastığı için doğrudan ajansın ana dalına yazılır; PR açılmaz.
 * - KKM kayıtlarına hiçbir şey yazılmaz; yazma sınırı yemez.
 */

export const GELEN_KLASORU = 'isler/gelen';

const iki = (n: number) => String(n).padStart(2, '0');
/** 21-10-2026 (ajansın dosya adı biçimi) */
const gunAdi = (t: Date) => `${iki(t.getDate())}-${iki(t.getMonth() + 1)}-${t.getFullYear()}`;
const kisaAd = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'is';

/** Oyun PDF'indeki bilgiler, Markdown olarak; boş alan "boş" yazar */
export function oyunDosyasiMetni(items: Item[], oyunId: string, not: string, zaman = new Date()): string {
  const tanitim = items.find(i => i.id === oyunId && !i.archived);
  const meta = (tanitim?.metadata || {}) as { ozet?: string; aciklama?: string };
  const belgeler = gddBolumleri(items, oyunId);
  const asama = projeAsamasi(items, oyunId);
  const ad = oyunAdi(tanitim) || 'Adsız oyun';
  const s: string[] = [];

  s.push(`# ${ad} — KKM'den gelen oyun dosyası`, '');
  s.push(`- Gönderen: Kemal (KKM → Oyun → Ajansa gönder)`);
  s.push(`- Tarih: ${zaman.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`);
  s.push(`- Aşama: ${asama ? `${asama.ad} (${asama.terim})` : 'başlamadı'}`);
  s.push(`- Departman: Oyun Müdürü (CEO dağıtır)`, '');
  s.push(`## Kemal'in notu`, '', not.trim() || 'boş', '');

  const bolumYaz = (id: string) => {
    const b = GDD_BOLUMLERI.find(x => x.id === id);
    if (!b) return;
    const k = belgeler.find(x => (x.metadata as { bolumId?: string } | undefined)?.bolumId === id);
    s.push(`### ${b.ad}`, '');
    const secim = secimSatirlari(k?.notes || '').split('\n').map(l => l.replace(/^\*\s*/, '')).filter(Boolean);
    const yazi = serbestYazi(k?.notes || '');
    if (!secim.length && !yazi) { s.push('boş', ''); return; }
    for (const l of secim) s.push(`- ${l}`);
    if (secim.length) s.push('');
    if (yazi) s.push(yazi, '');
  };

  s.push('## Künye ve konsept', '');
  s.push(`- Ad: ${ad}`);
  for (const k of KUNYE_SATIRLARI) s.push(`- ${k.etiket}: ${kunyeDegeri(belgeler, k) || 'boş'}`);
  s.push(`- Özet: ${meta.ozet?.trim() || 'boş'}`, '');
  s.push('### Açıklama', '', meta.aciklama?.trim() || 'boş', '');
  for (const id of KONSEPT_BOLUMLERI.filter(id => id !== 'kunye')) bolumYaz(id);

  s.push('## Mekanikler ve notlar', '');
  for (const id of MEKANIK_BOLUMLERI) bolumYaz(id);
  for (const id of GDD_BOLUMLERI.map(b => b.id).filter(id => id !== 'kunye' && !KONSEPT_BOLUMLERI.includes(id) && !MEKANIK_BOLUMLERI.includes(id))) bolumYaz(id);

  s.push('## Fikir notları', '');
  const fikirler = oyunFikirleri(items, oyunId);
  if (!fikirler.length) s.push('boş');
  for (const kat of FIKIR_KATEGORILERI) {
    for (const f of fikirler.filter(f => {
      const k = (f.metadata as { kategori?: string } | undefined)?.kategori;
      return k === kat || (kat === 'Diğer' && !FIKIR_KATEGORILERI.includes(k as typeof kat));
    })) s.push(`- **${f.title}** (${kat})${f.notes?.trim() ? `: ${f.notes.trim().replace(/\s*\n\s*/g, ' ')}` : ''}`);
  }
  s.push('');

  s.push('## Yapım aşaması ve işler', '');
  const isler = oyunIsleri(items, oyunId);
  if (!isler.length) s.push('boş');
  for (const a of ASAMALAR) {
    for (const i of isler.filter(i => String((i.metadata as { asama?: string } | undefined)?.asama || 'konsept') === a.id)) s.push(`- ${i.title} (${a.ad})`);
  }
  s.push('');
  return s.join('\n');
}

/** Dosyayı ajansın deposuna yazar; aynı adda dosya varsa sonuna -2, -3 ekler. Dosyanın GitHub adresini döner. */
export async function ajansaGonder(anahtar: string, baslik: string, metin: string, zaman = new Date()): Promise<string> {
  const bilgi = await github<{ default_branch: string }>(anahtar, `/repos/${AJANS_DEPOSU}`);
  const temel = `${GELEN_KLASORU}/${gunAdi(zaman)}-${kisaAd(baslik)}`;
  let yol = `${temel}.md`;
  for (let n = 2; n < 20; n++) {
    try {
      await github(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}?ref=${encodeURIComponent(bilgi.default_branch)}`);
      yol = `${temel}-${n}.md`;
    } catch {
      break; // dosya yok: bu ad boş
    }
  }
  const sonuc = await github<{ content: { html_url: string } }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${yol}`, {
    method: 'PUT',
    govde: { message: `KKM'den iş: ${baslik}`, content: base64(metin), branch: bilgi.default_branch },
  });
  return sonuc.content.html_url;
}
