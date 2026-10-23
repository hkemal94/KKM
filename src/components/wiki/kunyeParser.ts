import { Item } from '../../types';

/**
 * Künye ayrıştırıcı.
 *
 * İçe aktarılan karakterlerin bütün bilgisi `notes` içinde düzyazı olarak
 * duruyor (kemskoyData.ts → formatKunye):
 *
 *     Esra Gezgin (38) — Başaşçı
 *     * Fizik: 1,75 boyunda, 65 kilo...
 *     * Kişilik: Yetenekli, disiplinli...
 *     * Ayrıntı: 15 yıldır profesyonel olarak...
 *
 * Bu yüzden künye kutusu boş kalıyor, gövde metni şişiyor ve 94 karakterin
 * hepsi "taslak" görünüyor. Burada o blok okunur, alanlara ayrılır ve
 * geri kalan gerçek düzyazı ayrı döner.
 *
 * Veri DEĞİŞTİRİLMEZ — bu çalışma anında olur. Firestore'a kalıcı yazmak
 * istersen `migrateKunye` aşağıda.
 */

export interface ParsedKunye {
  /** Başlıktan gelenler */
  yas?: string;
  rol?: string;
  /** '* Alan: değer' satırları, sırası korunur */
  fields: Array<{ label: string; value: string }>;
  /** Künye bloğu çıkarıldıktan sonra kalan gerçek metin */
  body: string;
  /** Tek satırlık tanıtım — listelerde kullanılır */
  ozet: string;
  /** Kemal'in kendi metni (künye satırları ve künyeden gelen biyografi hariç) */
  kendiMetni: string;
  /** Notlarda kendi metne ait satırların sırası (madde düzenleyici için) */
  govdeSatirlari: number[];
}

/** '* Fizik: ...' veya '- Fizik: ...' satırlarını yakalar */
const FIELD_RE = /^\s*[*\-•]\s*([^:]{2,40}?)\s*:\s*(.+)$/;

/** 'Esra Gezgin (38) — Başaşçı' veya 'Ad — Rol' başlığı */
const HEADER_RE = /^(.+?)(?:\s*\((\d{1,3})\))?\s*[—–-]\s*(.+)$/;

/** Listelerde kullanılacak kısa tanıtım için tercih sırası */
const OZET_ONCELIK = ['kişilik', 'ayrıntı', 'fizik', 'hobiler', 'sevdikleri'];

/**
 * Bu alanlar künye satırı değil, düzyazıdır. "Ayrıntı" aslında karakterin
 * biyografisi — künye kutusuna sıkıştırılınca hem kutu uzuyor hem gövde
 * boş kalıyor. Bunlar gövdeye gider.
 */
const BODY_LABELS = new Set(['ayrıntı', 'ayrinti', 'geçmiş', 'hikaye', 'hikâye', 'özgeçmiş']);

const norm = (s: string) => s.trim().toLocaleLowerCase('tr');

export function parseKunye(item: Item): ParsedKunye {
  const raw = item.notes || '';
  const lines = raw.split('\n');

  const fields: Array<{ label: string; value: string }> = [];
  const bodyLines: string[] = [];
  const govdeSatirlari: number[] = [];
  const narrative: string[] = [];
  let yas: string | undefined;
  let rol: string | undefined;
  let headerConsumed = false;

  lines.forEach((line, idx) => {
    const fm = line.match(FIELD_RE);
    if (fm) {
      const label = fm[1].trim();
      const value = fm[2].trim();
      if (value && norm(value) !== 'belirtilmedi') {
        if (BODY_LABELS.has(norm(label))) narrative.push(value);
        else fields.push({ label, value });
      }
      return;
    }

    // Başlık satırı: yalnızca en baştaki (veya '---' sonrasındaki) ilk satırda ara
    if (!headerConsumed && line.trim()) {
      const prev = idx > 0 ? lines[idx - 1].trim() : '';
      const atStart = idx === 0 || prev === '' || prev === '---';
      if (atStart) {
        const hm = line.match(HEADER_RE);
        // Başlık, maddenin kendi adıyla başlıyorsa gerçekten künye başlığıdır
        if (hm && norm(hm[1]).startsWith(norm(item.title).slice(0, 8))) {
          yas = hm[2];
          rol = hm[3].trim();
          headerConsumed = true;
          return;
        }
      }
    }

    bodyLines.push(line);
    govdeSatirlari.push(idx);
  });

  const ownProse = bodyLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .trim();

  // Kendi metni varsa önce o, sonra künyeden çıkan biyografi
  const body = [ownProse, narrative.join(' ').trim()]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // Özet: öncelik listesine göre ilk dolu alanın ilk cümlesi
  let ozet = '';
  for (const key of OZET_ONCELIK) {
    const hit = fields.find(f => norm(f.label) === key);
    if (hit) {
      ozet = hit.value.split(/(?<=[.!?])\s/)[0].trim();
      break;
    }
  }
  if (!ozet && body) {
    ozet = body.split(/(?<=[.!?])\s/)[0].trim();
  }
  if (ozet.length > 120) ozet = ozet.slice(0, 117).trimEnd() + '…';

  return { yas, rol, fields, body, ozet, kendiMetni: ownProse, govdeSatirlari };
}

/**
 * Notlardaki kendi metni yenisiyle değiştirir (1 Ekim, madde düzenleyicide
 * giriş metni). Künye satırları ve başlık yerinde kalır; eski metin
 * satırları çıkar, yeni metin sona eklenir.
 */
export function kendiMetniYaz(item: Item, yeni: string): string {
  const p = parseKunye(item);
  const govde = new Set(p.govdeSatirlari);
  const kalan = (item.notes || '').split('\n').filter((_, i) => !govde.has(i)).join('\n').trim();
  return [kalan, yeni.trim()].filter(Boolean).join('\n\n');
}

/**
 * Düzenleyicideki "Diğer bilgiler" (23 Ekim): künyeye girmeyen satırlar
 * yenileriyle değişir. Eski satırlar notlardan çıkar; yeniler ilk eski
 * satırın yerine (yoksa sona) '* Ad: değer' olarak yazılır. Başlık satırı
 * ve öbür künye satırları yerinde kalır. Yalnız Kemal "Kaydet"e basınca.
 */
export function ekSatirlariYaz(item: Item, eskiler: Array<{ label: string; value: string }>, yeniler: Array<{ label: string; value: string }>): string {
  const satirlar = (item.notes || '').split('\n');
  const cikan = new Set<number>();
  for (const e of eskiler) {
    const i = satirlar.findIndex((s, n) => {
      if (cikan.has(n)) return false;
      const m = s.match(FIELD_RE);
      return !!m && m[1].trim() === e.label && m[2].trim() === e.value;
    });
    if (i >= 0) cikan.add(i);
  }
  const yeniSatirlar = yeniler.map(y => `* ${y.label}: ${y.value}`);
  const ilk = cikan.size ? Math.min(...cikan) : -1;
  const sonuc: string[] = [];
  satirlar.forEach((s, n) => {
    if (n === ilk) sonuc.push(...yeniSatirlar);
    if (!cikan.has(n)) sonuc.push(s);
  });
  if (ilk < 0 && yeniSatirlar.length) {
    while (sonuc.length && !sonuc[sonuc.length - 1].trim()) sonuc.pop();
    if (sonuc.length) sonuc.push('');
    sonuc.push(...yeniSatirlar);
  }
  return sonuc.join('\n').trim();
}

/** "Diğer bilgiler" satırının adı künye satırı olarak okunabiliyor mu */
export const ekAdiGecerli = (ad: string) => /^[^:\n]{2,40}$/.test(ad.trim());

/**
 * Kişinin rolünü bulur: önce yapılandırılmış alan, sonra künye başlığı,
 * sonra etiketler.
 */
export function getRol(item: Item): string {
  const structured = item.metadata?.profile?.profession;
  if (typeof structured === 'string' && structured.trim()) return structured.trim();

  const parsed = parseKunye(item);
  if (parsed.rol) return parsed.rol;

  if (item.tags.includes('personel')) return 'Personel';
  if (item.tags.includes('misafir')) return 'Misafir';
  if (item.tags.includes('eskort')) return 'Eskort';
  return '';
}

/** Kişileri kabaca sınıflandırır — mekân sayfasında gruplama için */
export type KisiGrubu = 'personel' | 'misafir' | 'eskort' | 'diğer';

export function getKisiGrubu(item: Item): KisiGrubu {
  if (item.tags.includes('personel')) return 'personel';
  if (item.tags.includes('eskort')) return 'eskort';
  if (item.tags.includes('misafir')) return 'misafir';
  return 'diğer';
}

export const GRUP_BASLIK: Record<KisiGrubu, string> = {
  personel: 'Kadro',
  misafir: 'Misafirler',
  eskort: 'Eskortlar',
  diğer: 'Diğer'
};

