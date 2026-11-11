import { belgeyiOku, hamAdres, YOL_HARITASI_YOLLARI } from './depoBelgesi';
import { EKRAN_KLASORU, LISTE_YOLU } from './ekranGoruntuleri';

/**
 * Oyunun kapağı, logosu ve durum özeti (11 Kasım, Kemal: "eski görselleri
 * silecek, yeni ekran görsellerinden profil resmi seçecek"; "ilham yerine
 * oyunun logosunun bulunduğu görselleri koy"). Hepsi oyunun deposundan her
 * açılışta okunur; KKM kayıtlarına ve depoya hiçbir şey yazılmaz.
 *
 * Kaynaklar:
 *   docs/ekran-goruntuleri/liste.json — `kapak: true` işaretli görüntü (yoksa
 *     ilk telefon görüntüsü), `logo` (deponun köküne göre yol), `kaynak`
 *     (oyunun yayındaki adresi)
 *   docs/yol-haritasi.md — "Neredeyiz", "Sıra / Sıradaki" ve "…bekleyenler"
 *     bölümlerinin ilk maddeleri
 */

export interface OyunKimligi { kapak?: string; logo?: string; oyunAdresi?: string }
export interface DurumOzeti { guncelleme?: string; neredeyiz: string[]; siradaki: string[]; bekleyen: string[] }

const kimlikOnbellek = new Map<string, Promise<OyunKimligi>>();

/** liste.json'dan kapak, logo ve oyunun adresi; okunamazsa boş */
export function oyunKimligiCoz(depo: string, metin: string): OyunKimligi {
  const veri = JSON.parse(metin) as { goruntuler?: unknown; logo?: unknown; kaynak?: unknown };
  const satirlar = Array.isArray(veri.goruntuler) ? veri.goruntuler as Array<Record<string, unknown>> : [];
  const gecerli = satirlar.filter(s => s && typeof s.dosya === 'string');
  const secilen = gecerli.find(s => s.kapak === true)
    ?? gecerli.find(s => String(s.cihaz || s.dosya).toLocaleLowerCase('tr').includes('telefon'))
    ?? gecerli[0];
  const temiz = (y: string) => y.replace(/^\.?\//, '');
  return {
    kapak: secilen ? hamAdres(depo, `${EKRAN_KLASORU}${temiz(String(secilen.dosya))}`) : undefined,
    logo: typeof veri.logo === 'string' && veri.logo.trim() ? hamAdres(depo, temiz(veri.logo.trim())) : undefined,
    oyunAdresi: typeof veri.kaynak === 'string' && /^https:\/\//.test(veri.kaynak) ? veri.kaynak : undefined,
  };
}

export function oyunKimliginiOku(depo: string): Promise<OyunKimligi> {
  let p = kimlikOnbellek.get(depo);
  if (!p) {
    p = belgeyiOku(depo, [LISTE_YOLU]).then(({ metin }) => oyunKimligiCoz(depo, metin)).catch(() => ({}));
    kimlikOnbellek.set(depo, p);
  }
  return p;
}

/** Markdown süsünü atar: üstü çizili parça, kalın, kod, bağlantı → düz yazı */
const duzYazi = (s: string) => s
  .replace(/~~[^~]*~~\s*(\([^)]*\))?\s*[,·]?/g, '')                  // üstü çizili (bitmiş) parçalar
  .replace(/\s*\((öneri|bu PR)[^)]*\)/g, '')                          // "(öneri; ajans/…)" iş notu
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*|__|`/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const kisalt = (s: string, n = 170) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Bir bölümün maddeleri: "- " ile başlayan satırlar ya da tablo satırları.
 * İki sütunlu tablo "Aşama: …" olur; çok sütunlu tabloda başlık satırı ve
 * son sütunu "Bitti" olan satır atlanır, "İş: İçerik" gösterilir.
 */
function maddeler(govde: string, enFazla: number): string[] {
  const sonuc: string[] = [];
  const satirlar = govde.split('\n');
  satirlar.forEach((satir, i) => {
    const m = satir.match(/^[-*] (.+)$/);
    if (m) { sonuc.push(kisalt(duzYazi(m[1]))); return; }
    if (!/^\|.*\|\s*$/.test(satir)) return;
    const hucre = satir.trim().slice(1, -1).split('|').map(h => duzYazi(h));
    if (hucre.every(h => /^-*$/.test(h))) return;                      // ayraç ya da boş başlık
    if (/^\|[\s|:-]+\|\s*$/.test(satirlar[i + 1] || '')) return;       // başlık satırı
    if (hucre.length === 2) { sonuc.push(kisalt(`${hucre[0]}: ${hucre[1]}`)); return; }
    if (/^bitti/i.test(hucre[hucre.length - 1])) return;
    sonuc.push(kisalt(`${hucre[1]}: ${hucre[2] || ''}`.replace(/: $/, '')));
  });
  return sonuc.slice(0, enFazla);
}

export function yolHaritasiniOzetle(md: string): DurumOzeti {
  const bolumler = md.split(/^## /m).slice(1).map(b => {
    const i = b.indexOf('\n');
    return { baslik: b.slice(0, i).trim(), govde: b.slice(i + 1) };
  });
  const bul = (sinama: RegExp) => bolumler.find(b => sinama.test(b.baslik));
  const g = md.match(/Son güncelleme:\s*\*\*([^*]+)\*\*/);
  return {
    guncelleme: g ? g[1].trim() : undefined,
    neredeyiz: maddeler(bul(/^Neredeyiz/i)?.govde || '', 3),
    siradaki: maddeler(bul(/^S[ıi]ra(daki)?\b/i)?.govde || '', 3),
    bekleyen: maddeler(bul(/bekleyen/i)?.govde || '', 4),
  };
}

export async function durumOzetiniOku(depo: string): Promise<DurumOzeti | null> {
  try {
    const { metin } = await belgeyiOku(depo, YOL_HARITASI_YOLLARI);
    return yolHaritasiniOzetle(metin);
  } catch {
    return null;
  }
}
