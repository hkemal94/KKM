import type { Item } from '../types';
import { PdfYazici, PDF_RENK } from './pdfYazici';
import { ADA_OLCULERI, evrenRaporu, kisiTanimi, type EvrenRaporu, type RaporMaddesi } from './evrenRaporu';
import {
  ASAMALAR, GDD_BOLUMLERI, KONSEPT_BOLUMLERI, MEKANIK_BOLUMLERI, KUNYE_SATIRLARI, FIKIR_KATEGORILERI, ILK_OYUN_ID,
  gddBolumleri, oyunAdi, oyunFikirleri, oyunIsleri, projeAsamasi, kunyeDegeri, secimSatirlari, serbestYazi
} from '../components/oyun/OyunSureci';

/**
 * Evren Raporu ve oyun PDF'i (7 Ekim). İkisi de `PdfYazici` ile aynı
 * görünümde; içerik yalnız kayıtlardan gelir, boş olan "boş" yazar.
 */

const ALT_BILGI = 'Kems Komuta Merkezi · Düzada';
const gun = () => new Date().toISOString().slice(0, 10);
const dosyaAdi = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '') || 'belge';

function maddeListesi(p: PdfYazici, x: RaporMaddesi[]) {
  if (!x.length) { p.bos(); return; }
  for (const m of x) p.madde(m.ad, [m.tur, m.mahalle].filter(Boolean).join(' · '), m.ozet || undefined);
}

/** Ada ölçüleri ve mahalleler; oyun PDF'inin "Düzada özeti" de bunu kullanır */
function adaVeMahalleler(p: PdfYazici, r: EvrenRaporu, kisa: boolean) {
  p.bolum(kisa ? 'Düzada özeti' : 'Ada');
  p.alanlar([...ADA_OLCULERI, ...(kisa ? [] : (r.ada?.kunye || []).map(f => [f.label, f.value] as [string, string]))]);
  if (!kisa) {
    if (r.ada?.ozet) p.paragraf(r.ada.ozet);
    p.bolum('Mahalleler');
  }
  if (!r.mahalleler.length) p.bos();
  for (const m of r.mahalleler) {
    p.altBaslik(m.ad, kisa ? undefined : `${m.maddeSayisi} madde`);
    if (!kisa && m.kunye.length) p.alanlar(m.kunye.map(f => [f.label, f.value]), 36);
    if (m.ozet) p.paragraf(m.ozet, 8.5);
    else p.bos();
    p.bosluk(1);
  }
}

export async function evrenRaporuPdf(items: Item[]): Promise<void> {
  const r = evrenRaporu(items);
  const p = await PdfYazici.ac('Kems Company · Düzada Evren Raporu', ALT_BILGI);
  p.kapak({
    etiket: 'Evren raporu',
    baslik: 'Düzada Evren Raporu',
    alt: 'Ada, mahalleler, kurumlar, mekânlar, kişiler ve tarihçe — vikideki kayıtlardan',
    bilgiler: [['Tarih', r.tarih]]
  });
  p.sayilar([['Viki maddesi', r.sayilar.toplam], ['Kişi', r.sayilar.kisi], ['Mekân ve kurum', r.sayilar.mekan + r.sayilar.kurum], ['Mahalle', r.mahalleler.length]]);
  adaVeMahalleler(p, r, false);

  p.bolum(`Kurumlar (${r.kurumlar.length})`);
  maddeListesi(p, r.kurumlar);
  p.bolum(`Mekânlar (${r.mekanlar.length})`);
  maddeListesi(p, r.mekanlar);
  p.bolum(`Cadde, meydan ve yer adları (${r.yerler.length})`);
  maddeListesi(p, r.yerler);
  p.bolum(`Aileler (${r.aileler.length})`);
  maddeListesi(p, r.aileler);
  p.bolum(`Olaylar (${r.olaylar.length})`);
  maddeListesi(p, r.olaylar);

  p.bolum(`Kişiler (${r.kisiler.length})`);
  if (!r.kisiler.length) p.bos();
  for (const k of r.kisiler) p.madde(k.ad, [kisiTanimi(k), k.mahalle].filter(Boolean).join(' · '));

  p.bolum('Tarihçe');
  p.paragraf('Maddelerin künyesindeki tarihler.', 8, PDF_RENK.gri);
  if (!r.tarihce.length) p.bos();
  else p.alanlar(r.tarihce.map(t => [t.tarih, `${t.madde} (${t.alan.toLocaleLowerCase('tr')})`]), 44);

  p.bolum('Durum');
  p.alanlar([
    ['Viki maddesi', String(r.sayilar.toplam)],
    ['Taslak', String(r.sayilar.taslak)]
  ]);
  p.kaydet(`duzada-evren-raporu-${gun()}.pdf`);
}

/**
 * Oyun PDF'i (Kemal, 7 Ekim): künye ve konsept, mekanikler ve notlar,
 * Düzada özeti. Evren Raporu'yla aynı görünüm, ayrı dosya.
 */
export async function oyunPdf(items: Item[], oyunId: string = ILK_OYUN_ID): Promise<void> {
  const tanitim = items.find(i => i.id === oyunId && !i.archived);
  const meta = (tanitim?.metadata || {}) as { ozet?: string; aciklama?: string };
  const belgeler = gddBolumleri(items, oyunId);
  const asama = projeAsamasi(items, oyunId);
  const ad = oyunAdi(tanitim) || 'Adsız oyun';
  const p = await PdfYazici.ac(`Kems Company · ${ad}`, ALT_BILGI);
  p.kapak({
    etiket: 'Oyun dosyası',
    baslik: ad,
    alt: asama ? `Aşama: ${asama.ad} (${asama.terim})` : 'Aşama: başlamadı',
    bilgiler: [['Tarih', new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })]]
  });

  const bolumYaz = (id: string) => {
    const b = GDD_BOLUMLERI.find(x => x.id === id);
    if (!b) return;
    const k = belgeler.find(x => (x.metadata as { bolumId?: string } | undefined)?.bolumId === id);
    p.altBaslik(b.ad);
    const secim = secimSatirlari(k?.notes || '').split('\n').map(l => l.replace(/^\*\s*/, '')).filter(Boolean)
      .map(l => { const i = l.indexOf(':'); return (i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l]) as [string, string]; });
    const yazi = serbestYazi(k?.notes || '');
    if (!secim.length && !yazi) { p.bos(); return; }
    if (secim.length) p.alanlar(secim, 40);
    if (yazi) p.paragraf(yazi, 8.5);
  };

  p.bolum('Künye ve konsept');
  p.alanlar([
    ['Ad', oyunAdi(tanitim) || 'boş'],
    ...KUNYE_SATIRLARI.map(k => [k.etiket, kunyeDegeri(belgeler, k) || 'boş'] as [string, string]),
    ['Özet', meta.ozet?.trim() || 'boş']
  ], 40);
  p.altBaslik('Açıklama');
  if (meta.aciklama?.trim()) p.paragraf(meta.aciklama.trim(), 8.5); else p.bos();
  for (const id of KONSEPT_BOLUMLERI.filter(id => id !== 'kunye')) bolumYaz(id);

  p.bolum('Mekanikler ve notlar');
  for (const id of MEKANIK_BOLUMLERI) bolumYaz(id);
  for (const id of GDD_BOLUMLERI.map(b => b.id).filter(id => id !== 'kunye' && !KONSEPT_BOLUMLERI.includes(id) && !MEKANIK_BOLUMLERI.includes(id))) bolumYaz(id);

  p.altBaslik('Fikir notları');
  const fikirler = oyunFikirleri(items, oyunId);
  if (!fikirler.length) p.bos();
  for (const kat of FIKIR_KATEGORILERI) {
    const bunlar = fikirler.filter(f => {
      const k = (f.metadata as { kategori?: string } | undefined)?.kategori;
      return k === kat || (kat === 'Diğer' && !FIKIR_KATEGORILERI.includes(k as typeof kat));
    });
    for (const f of bunlar) p.madde(f.title, kat, f.notes?.trim() || undefined);
  }

  p.altBaslik('Yapım aşaması ve işler');
  const isler = oyunIsleri(items, oyunId);
  if (!isler.length) p.bos();
  for (const a of ASAMALAR) {
    const bunlar = isler.filter(i => String((i.metadata as { asama?: string } | undefined)?.asama || 'konsept') === a.id);
    for (const i of bunlar) p.madde(i.title, a.ad);
  }

  adaVeMahalleler(p, evrenRaporu(items), true);
  p.kaydet(`${dosyaAdi(ad)}-oyun-dosyasi-${gun()}.pdf`);
}
