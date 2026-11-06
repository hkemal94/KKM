import { base64Coz, GithubHatasi, github } from './oyunAyarlari';
import { AJANS_DEPOSU } from './ajansDeposu';

/**
 * Ajansın dizileri (6 Kasım, Kemal: "İçerik'e Video sekmesinde dizi kartı").
 *
 * Ajans hazırladığı animasyon dizilerini (ör. Resepsiyon dizisi) gizli
 * deposunda `kkm/diziler.json` olarak yazar. KKM yalnız okur; kayda hiçbir
 * şey yazmaz. Dosya önce ana dalda aranır; yoksa ajansın çalışma dalında
 * (`YEDEK_DALLAR`). İkisinde de yoksa dizi yoktur.
 */

export const DIZILER_YOLU = 'kkm/diziler.json';
/** Dosya ana dala girmeden önce durduğu dal (6 Kasım) */
const YEDEK_DALLAR = ['claude/resepsiyon-dizisi'];

export interface DiziBolumu { no: number; baslik: string; mevsim?: string; durum?: string }
export interface DiziSezonu { no: number; ad?: string; bolumler: DiziBolumu[] }
export interface DiziKarakteri { ad: string; not?: string }
export interface DiziDenemesi { ad: string; dosya?: string; not?: string }

export interface Dizi {
  id: string;
  ad: string;
  taslak?: boolean;
  ozet?: string;
  bicim?: string;
  durum?: string;
  /** Ajans deposunda dosya yolları */
  senaryo?: string;
  iskelet?: string;
  soruCevap?: string;
  canva?: string;
  sezonlar: DiziSezonu[];
  karakterler: DiziKarakteri[];
  denemeler: DiziDenemesi[];
}

export interface DiziDosyasi {
  guncellendi: string;
  diziler: Dizi[];
  /** Dosyanın okunduğu dal; bağlantılar bu dala gider */
  dal: string;
}

const dizi = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const metin = (x: unknown) => (typeof x === 'string' ? x : '');

/** Ham dosyayı ekranın biçimine çevirir; eksik ya da bozuk satırlar düşer (saf iş) */
export function diziDosyasiniCoz(ham: unknown, dal: string): DiziDosyasi {
  const j = (ham && typeof ham === 'object' ? ham : {}) as Record<string, unknown>;
  const diziler = dizi<Record<string, unknown>>(j.diziler)
    .filter(d => d && typeof d.id === 'string' && typeof d.ad === 'string')
    .map(d => ({
      id: d.id as string, ad: d.ad as string, taslak: d.taslak !== false,
      ozet: metin(d.ozet), bicim: metin(d.bicim), durum: metin(d.durum),
      senaryo: metin(d.senaryo), iskelet: metin(d.iskelet), soruCevap: metin(d.soruCevap), canva: metin(d.canva),
      sezonlar: dizi<Record<string, unknown>>(d.sezonlar).filter(s => s && typeof s.no === 'number').map(s => ({
        no: s.no as number, ad: metin(s.ad),
        bolumler: dizi<Record<string, unknown>>(s.bolumler).filter(b => b && typeof b.no === 'number' && typeof b.baslik === 'string')
          .map(b => ({ no: b.no as number, baslik: b.baslik as string, mevsim: metin(b.mevsim), durum: metin(b.durum) })),
      })),
      karakterler: dizi<Record<string, unknown>>(d.karakterler).filter(k => k && typeof k.ad === 'string').map(k => ({ ad: k.ad as string, not: metin(k.not) })),
      denemeler: dizi<Record<string, unknown>>(d.denemeler).filter(k => k && typeof k.ad === 'string').map(k => ({ ad: k.ad as string, dosya: metin(k.dosya), not: metin(k.not) })),
    }));
  return { guncellendi: metin(j.guncellendi), diziler, dal };
}

/** Ajans deposundaki bir dosyanın GitHub adresi (dal bilinmiyorsa main) */
export function ajansDosyaAdresi(yol: string, dal = 'main'): string {
  return `https://github.com/${AJANS_DEPOSU}/blob/${dal.split('/').map(encodeURIComponent).join('/')}/${yol.split('/').map(encodeURIComponent).join('/')}`;
}

/** Dizi dosyasını okur; hiçbir dalda yoksa null. Anahtar depoyu göremiyorsa hata. */
export async function dizileriOku(anahtar: string): Promise<DiziDosyasi | null> {
  for (const dal of [null, ...YEDEK_DALLAR]) {
    try {
      const d = await github<{ content: string }>(anahtar, `/repos/${AJANS_DEPOSU}/contents/${DIZILER_YOLU}${dal ? `?ref=${encodeURIComponent(dal)}` : ''}`);
      return diziDosyasiniCoz(JSON.parse(base64Coz(d.content)), dal || 'main');
    } catch (e) {
      if (!(e instanceof GithubHatasi) || e.durum !== 404) throw e;
    }
  }
  // Hiçbir dalda yok: dosya mı yok, yoksa anahtar depoyu mu göremiyor
  try { await github(anahtar, `/repos/${AJANS_DEPOSU}`); }
  catch { throw new Error('anahtar Kems-Ajans deposunu göremiyor; GitHub\'da anahtarın ayarlarına bu depoyu ekle'); }
  return null;
}
