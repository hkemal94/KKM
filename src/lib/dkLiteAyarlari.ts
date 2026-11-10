import { hamAdres } from './depoBelgesi';
import { base64, base64Coz, github } from './oyunAyarlari';

/**
 * DK Lite paneli (Kemal, 9 Kasım: KKM'de "bölümler, arka planlar şu bu değiştirebileceğim; hediyeleri,
 * yeni açılacak şeyleri ... sürükle bırakla bir şeyleri bir yerlere koyabileceğim"; yeri Oyunlar ekranı,
 * ilk etapta hediyeler, lokasyonlar, mağaza, bölüm ayarları).
 *
 * DK Lite'ın ayar dosyası (`src/veri/oyun-ayarlari.json`) her açılışta canlı okunur. Kemal panelde
 * değiştirir, "Oyuna gönder" deyince DK Lite deposunda yeni dalda dosya güncellenir ve PR açılır;
 * birleştiren Kemal. KKM kayıtlarına hiçbir şey yazılmaz. Dosyanın biçimi DK Lite deposunda
 * `docs/ayar-dosyasi.md`; buradaki denetim oradaki kuralların tarayıcıda yapılabilen kısmı (resim ve
 * tema görünüşü DK Lite'ın kendi denetiminde, derlemeden önce bakılır).
 */

export const DK_AYAR_YOLU = 'src/veri/oyun-ayarlari.json';

export type UrunTuru = 'dondurma' | 'tatli' | 'icecek';
export interface DkUrun { id: string; ad: string; tur: UrunTuru; renk: string }
export interface DkLokasyon { ad: string; renk: string; resim?: string }
export interface DkIlkBolum { sutun: number; cesit: number; musteri: number; istekEnAz: number; istekEnCok: number; bantYeri: number; ikiCesitOrani: number }
export interface Basamak { bolumden: number; deger: number }
export interface DkAyar {
  aciklama?: string;
  surum?: number;
  bolumSayisi: number;
  lokasyon: { bolumSayisi: number; acmaYildizi: number; liste: DkLokasyon[] };
  urunler: DkUrun[];
  baslangicUrunleri: string[];
  hediyeler: { urun: string; bolum: number }[];
  yeniUrun: { sayi: number; sure: number };
  para: { yildiz: number; sandik: [number, number]; gunluk: number; gunluk7: number; kart: number };
  magaza: {
    yardimciFiyati: number; canFiyati: number; temaFiyati: number; kostumFiyati: number;
    temalar: { id: string; ad: string }[];
    kostumler: { id: string; ad: string }[];
  };
  bolumler: {
    ilkBolumler: DkIlkBolum[];
    kural: {
      musteri: { baslangic: number; herKacBolumdeBir: number; enCok: number };
      cesit: Basamak[]; bantYeri: Basamak[]; ikiCesitOrani: Basamak[];
      istekEnAz: number; istekEnCok: number; sutun: number;
    };
    zor: { musteri: number; bantEksik: number; ikiCesit: number };
    cokZor: { musteri: number; bantEksik: number; ikiCesit: number };
    rahatGeri: number; bantEnAz: number; ikiCesitEnCok: number;
    yeniOgeler: {
      buzluTop: { bolum: number; oran: number };
      gizliTop: { bolum: number; oran: number };
      aceleciMusteri: { bolum: number; oran: number };
      kilitliSutun: { bolum: number };
    };
  };
}

/** DK Lite deposu mu (Oyunlar → Ayarlar sekmesi bu paneli açar) */
export const dkLiteMi = (depo: string) => /dk-?lite/i.test(depo);

/** Depodaki dosya; ham metin gönderirken "bu arada değişti mi" diye kıyaslanır */
export async function dkAyarOku(depo: string): Promise<{ dosya: DkAyar; ham: string }> {
  const r = await fetch(hamAdres(depo, DK_AYAR_YOLU), { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status === 404 ? 'DK Lite deposunda ayar dosyası yok (DK Lite\'ın "Ayarlar tek dosyada" önerisi birleşince gelir)' : `${r.status}`);
  const ham = await r.text();
  const dosya = JSON.parse(ham) as DkAyar;
  if (!dosya || !Array.isArray(dosya.hediyeler) || !dosya.lokasyon) throw new Error('Ayar dosyası tanınmadı');
  return { dosya, ham };
}

/** Ürünün resmi (oyunun deposundan) */
export const urunResmi = (depo: string, id: string) => hamAdres(depo, `public/gorseller/urunler/${id}.webp`);
/** Kostümün resmi: ilki önlüklü hâl */
export const kostumResmi = (depo: string, id: string, sira: number) =>
  hamAdres(depo, sira === 0 ? 'public/gorseller/tezgah/dondurmaci.webp' : `public/gorseller/tezgah/dondurmaci-${id}.webp`);

/** Hediye sırasını değiştirir: ürünler yer değiştirir, bölüm numaraları yerinde kalır */
export function hediyeTasi(h: DkAyar['hediyeler'], nereden: number, nereye: number): DkAyar['hediyeler'] {
  if (nereden === nereye || nereden < 0 || nereye < 0 || nereden >= h.length || nereye >= h.length) return h;
  const urunler = h.map(x => x.urun);
  const [u] = urunler.splice(nereden, 1);
  urunler.splice(nereye, 0, u);
  return h.map((x, i) => ({ ...x, urun: urunler[i] }));
}

const tam = (x: unknown): x is number => Number.isInteger(x);
const pozitif = (x: unknown) => tam(x) && (x as number) > 0;
const oran = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
const renk = (x: unknown) => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);

/** Göndermeden önce denetim (DK Lite'ın araclar/ayar-denetimi.mjs kurallarının dosyaya bakanları). Boşsa temiz. */
export function dkDenetle(a: DkAyar): string[] {
  const s: string[] = [];
  const lok = a.lokasyon;
  if (!pozitif(a.bolumSayisi)) s.push('Bölüm sayısı pozitif tam sayı olmalı');
  if (!pozitif(lok.bolumSayisi)) s.push('Lokasyondaki bölüm sayısı pozitif tam sayı olmalı');
  if (!pozitif(lok.acmaYildizi)) s.push('Lokasyon açma yıldızı pozitif tam sayı olmalı');
  else if (lok.acmaYildizi > lok.bolumSayisi * 3) s.push(`Bir lokasyonda en çok ${lok.bolumSayisi * 3} yıldız var; açma yıldızı ${lok.acmaYildizi} olamaz`);
  const gereken = Math.ceil(a.bolumSayisi / (lok.bolumSayisi || 1));
  if (lok.liste.length < gereken) s.push(`${gereken} lokasyon gerekiyor (bölüm sayısı ÷ lokasyondaki bölüm), ${lok.liste.length} var`);
  lok.liste.forEach((l, i) => {
    if (!l.ad?.trim()) s.push(`${i + 1}. lokasyonun adı boş`);
    if (!renk(l.renk)) s.push(`${l.ad || i + 1}: renk geçersiz`);
  });
  const ids = new Set(a.urunler.map(u => u.id));
  const hediyeBolumu = new Map<string, number>();
  let onceki = -1;
  a.hediyeler.forEach((h, i) => {
    const ad = a.urunler.find(u => u.id === h.urun)?.ad || h.urun;
    if (!ids.has(h.urun)) s.push(`Hediye ${i + 1}: "${h.urun}" ürünlerde yok`);
    if (a.baslangicUrunleri.includes(h.urun)) s.push(`${ad} başlangıç ürünü; hediye olamaz`);
    if (hediyeBolumu.has(h.urun)) s.push(`${ad} iki kez hediye`);
    if (!tam(h.bolum) || h.bolum < 0 || h.bolum >= a.bolumSayisi) s.push(`${ad}: bölüm 0 ile ${a.bolumSayisi - 1} arasında olmalı`);
    if (h.bolum <= onceki) s.push(`${ad} (${h.bolum}. bölüm): hediye bölümleri artan sırada olmalı, bir bölüme bir hediye`);
    onceki = h.bolum;
    hediyeBolumu.set(h.urun, h.bolum);
  });
  for (const u of a.urunler) if (!a.baslangicUrunleri.includes(u.id) && !hediyeBolumu.has(u.id)) s.push(`${u.ad} ne başlangıçta ne hediyede; oyunda hiç gelmez`);
  const acikSayisi = (no: number) => a.urunler.filter(u => a.baslangicUrunleri.includes(u.id) || (hediyeBolumu.has(u.id) && no > hediyeBolumu.get(u.id)!)).length;
  if (!pozitif(a.yeniUrun.sayi) || !pozitif(a.yeniUrun.sure)) s.push('Yeni ürün sayısı ve süresi pozitif tam sayı olmalı');
  const p = a.para;
  for (const [k, ad] of [['yildiz', 'Yıldız parası'], ['gunluk', 'Günlük para'], ['gunluk7', '7. gün parası'], ['kart', 'Kart parası']] as const)
    if (!tam(p[k]) || p[k] < 0) s.push(`${ad} 0 ya da pozitif tam sayı olmalı`);
  if (!(tam(p.sandik[0]) && tam(p.sandik[1]) && p.sandik[0] <= p.sandik[1])) s.push('Sandık parası: en az, en çoktan büyük olamaz');
  const m = a.magaza;
  for (const [k, ad] of [['yardimciFiyati', 'Yardımcı fiyatı'], ['canFiyati', 'Can fiyatı'], ['temaFiyati', 'Tema fiyatı'], ['kostumFiyati', 'Kostüm fiyatı']] as const)
    if (!pozitif(m[k])) s.push(`${ad} pozitif tam sayı olmalı`);
  for (const [liste, ad] of [[m.temalar, 'Tema'], [m.kostumler, 'Kostüm']] as const) liste.forEach((x, i) => { if (!x.ad?.trim()) s.push(`${ad} ${i + 1}: adı boş`); });
  const b = a.bolumler;
  b.ilkBolumler.forEach((z, i) => {
    const no = i + 1;
    for (const k of ['sutun', 'cesit', 'musteri', 'istekEnAz', 'istekEnCok', 'bantYeri'] as const) if (!pozitif(z[k])) s.push(`${no}. bölüm: ${k} pozitif tam sayı olmalı`);
    if (z.istekEnAz > z.istekEnCok) s.push(`${no}. bölüm: istek en az, en çoktan büyük olamaz`);
    if (!oran(z.ikiCesitOrani)) s.push(`${no}. bölüm: iki çeşit oranı 0 ile 1 arasında olmalı`);
    if (z.cesit > acikSayisi(no)) s.push(`${no}. bölüm: çeşit ${z.cesit}, ama bu bölümde açılmış ürün ${acikSayisi(no)}`);
  });
  const k = b.kural;
  if (!pozitif(k.musteri.baslangic) || !pozitif(k.musteri.herKacBolumdeBir) || !pozitif(k.musteri.enCok)) s.push('Müşteri kuralı: sayılar pozitif tam sayı olmalı');
  for (const [satir, ad] of [[k.cesit, 'Çeşit'], [k.bantYeri, 'Bant yeri'], [k.ikiCesitOrani, 'İki çeşit oranı']] as const) {
    if (!satir.length) s.push(`${ad} kuralında satır yok`);
    satir.forEach((x, i) => {
      if (i > 0 && x.bolumden <= satir[i - 1].bolumden) s.push(`${ad} kuralı: bölümler artan sırada olmalı`);
      if (ad === 'İki çeşit oranı' ? !oran(x.deger) : !pozitif(x.deger)) s.push(`${ad} kuralı: ${x.bolumden}. bölümdeki değer geçersiz`);
    });
  }
  for (const [ad, y] of [['Buzlu top', b.yeniOgeler.buzluTop], ['Gizli top', b.yeniOgeler.gizliTop], ['Aceleci müşteri', b.yeniOgeler.aceleciMusteri], ['Kilitli sütun', b.yeniOgeler.kilitliSutun]] as const) {
    if (!pozitif(y.bolum) || y.bolum > a.bolumSayisi) s.push(`${ad}: bölüm 1 ile ${a.bolumSayisi} arasında olmalı`);
    if ('oran' in y && !oran(y.oran)) s.push(`${ad}: oran 0 ile 1 arasında olmalı`);
  }
  return [...new Set(s)];
}

/** Değişiklik listesi (PR'a ve ekranın altına): ayrıntılı ama okunur */
export function dkDegisiklikler(eski: DkAyar, yeni: DkAyar): string[] {
  const satir: string[] = [];
  const urunAdi = (id: string) => yeni.urunler.find(u => u.id === id)?.ad || id;
  const dene = (ad: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) satir.push(`${ad}: ${yaz(x)} → ${yaz(y)}`);
  };
  dene('Bölüm sayısı', eski.bolumSayisi, yeni.bolumSayisi);
  dene('Lokasyondaki bölüm', eski.lokasyon.bolumSayisi, yeni.lokasyon.bolumSayisi);
  dene('Lokasyon açma yıldızı', eski.lokasyon.acmaYildizi, yeni.lokasyon.acmaYildizi);
  const n = Math.max(eski.lokasyon.liste.length, yeni.lokasyon.liste.length);
  for (let i = 0; i < n; i++) {
    const x = eski.lokasyon.liste[i];
    const y = yeni.lokasyon.liste[i];
    if (!x) satir.push(`Yeni lokasyon ${i + 1}: ${y.ad} (${y.renk})`);
    else if (!y) satir.push(`Lokasyon silindi: ${x.ad}`);
    else {
      dene(`${i + 1}. lokasyonun adı`, x.ad, y.ad);
      dene(`${y.ad} rengi`, x.renk, y.renk);
      dene(`${y.ad} resmi`, x.resim || '', y.resim || '');
    }
  }
  yeni.hediyeler.forEach((h, i) => {
    const x = eski.hediyeler[i];
    if (!x) satir.push(`Yeni hediye: ${h.bolum}. bölüm → ${urunAdi(h.urun)}`);
    else if (x.urun !== h.urun || x.bolum !== h.bolum)
      satir.push(`Hediye ${i + 1}: ${x.bolum}. bölüm ${urunAdi(x.urun)} → ${h.bolum}. bölüm ${urunAdi(h.urun)}`);
  });
  if (eski.hediyeler.length > yeni.hediyeler.length) satir.push(`${eski.hediyeler.length - yeni.hediyeler.length} hediye çıkarıldı`);
  dene('Yeni ürün (kaç tane, kaç bölüm)', eski.yeniUrun, yeni.yeniUrun);
  for (const k of Object.keys(yeni.para) as (keyof DkAyar['para'])[]) dene(`Para · ${k}`, eski.para[k], yeni.para[k]);
  for (const k of ['yardimciFiyati', 'canFiyati', 'temaFiyati', 'kostumFiyati'] as const) dene(`Mağaza · ${k}`, eski.magaza[k], yeni.magaza[k]);
  for (const [ad, x, y] of [['Tema', eski.magaza.temalar, yeni.magaza.temalar], ['Kostüm', eski.magaza.kostumler, yeni.magaza.kostumler]] as const) {
    if (x.map(t => t.id).join() !== y.map(t => t.id).join()) satir.push(`${ad} sırası: ${x.map(t => t.ad).join(', ')} → ${y.map(t => t.ad).join(', ')}`);
    else y.forEach((t, i) => dene(`${ad} adı`, x[i].ad, t.ad));
  }
  const b0 = eski.bolumler;
  const b1 = yeni.bolumler;
  b1.ilkBolumler.forEach((z, i) => {
    for (const k of Object.keys(z) as (keyof DkIlkBolum)[]) dene(`${i + 1}. bölüm · ${k}`, b0.ilkBolumler[i]?.[k], z[k]);
  });
  dene('Kural · müşteri', b0.kural.musteri, b1.kural.musteri);
  dene('Kural · çeşit', b0.kural.cesit, b1.kural.cesit);
  dene('Kural · bant yeri', b0.kural.bantYeri, b1.kural.bantYeri);
  dene('Kural · iki çeşit oranı', b0.kural.ikiCesitOrani, b1.kural.ikiCesitOrani);
  dene('Kural · istek (en az, en çok)', [b0.kural.istekEnAz, b0.kural.istekEnCok], [b1.kural.istekEnAz, b1.kural.istekEnCok]);
  dene('Zor bölüm', b0.zor, b1.zor);
  dene('Çok zor bölüm', b0.cokZor, b1.cokZor);
  dene('Yeni öğeler', b0.yeniOgeler, b1.yeniOgeler);
  return satir;
}
function yaz(x: unknown): string {
  if (x === undefined || x === '') return '(yok)';
  if (typeof x === 'number') return String(x).replace('.', ',');
  if (typeof x === 'string') return x;
  return JSON.stringify(x).replace(/"/g, '');
}

/** Dosyanın yeni metni: DK Lite'taki biçim (2 boşluk girinti, Türkçe harfler olduğu gibi) */
export const dkMetin = (a: DkAyar) => JSON.stringify(a, null, 2) + '\n';

/** Yeni dalda dosyayı günceller, PR açar; PR adresini döner. Okunduktan sonra depoda değiştiyse durur. */
export async function dkGonder(anahtar: string, depo: string, okunanHam: string, yeni: DkAyar, satirlar: string[]): Promise<string> {
  const bilgi = await github<{ default_branch: string }>(anahtar, `/repos/${depo}`);
  const ana = bilgi.default_branch;
  const dosya = await github<{ sha: string; content: string }>(anahtar, `/repos/${depo}/contents/${DK_AYAR_YOLU}?ref=${encodeURIComponent(ana)}`);
  if (base64Coz(dosya.content).replace(/\r\n/g, '\n').trim() !== okunanHam.replace(/\r\n/g, '\n').trim())
    throw new Error('Ayar dosyası sen okuduktan sonra depoda değişmiş. Yenile, sonra yeniden dene.');
  const ref = await github<{ object: { sha: string } }>(anahtar, `/repos/${depo}/git/ref/heads/${encodeURIComponent(ana)}`);
  const z = new Date();
  const iki = (n: number) => String(n).padStart(2, '0');
  // DK Lite'ın kuralı: her değişiklik ajans/<konu> dalında
  const dal = `ajans/panel-${z.getFullYear()}${iki(z.getMonth() + 1)}${iki(z.getDate())}-${iki(z.getHours())}${iki(z.getMinutes())}${iki(z.getSeconds())}`;
  await github(anahtar, `/repos/${depo}/git/refs`, { method: 'POST', govde: { ref: `refs/heads/${dal}`, sha: ref.object.sha } });
  const ozet = satirlar.length === 1 ? satirlar[0] : `${satirlar.length} ayar değişti`;
  await github(anahtar, `/repos/${depo}/contents/${DK_AYAR_YOLU}`, {
    method: 'PUT',
    govde: { message: `Panel (KKM): ${ozet}`.slice(0, 200), content: base64(dkMetin(yeni)), sha: dosya.sha, branch: dal },
  });
  const govde = [
    '## Ne istendi',
    '',
    'KKM → Oyunlar → DK Lite → **Ayarlar** (DK Lite paneli) üzerinden Kemal değiştirdi. Yalnız `src/veri/oyun-ayarlari.json` değişti.',
    '',
    '## Ekranda ne değişti',
    '',
    ...satirlar.map(s => `- ${s}`),
    '',
    '## Denendi / denenmedi',
    '',
    '- Panel göndermeden önce dosyayı denetledi (sıra, sayılar, ürünler).',
    '- DK Lite\'ın kendi ayar denetimi (resimler, tema görünüşü) bu PR\'ın derlemesinde çalışır; sorun varsa derleme durur, oyun yayına çıkmaz.',
    '- Bölüm sayısı ya da hediye düzeni gibi büyük değişikliklerde oyun ekibi birleştirmeden önce bölümlerin kazanılabilir kurulduğunu dener.',
    '- Gerçek telefonda denenmedi.',
    '',
    'Birleştirince oyun bu ayarlarla yeniden kurulur. Yol haritası notu gerekiyorsa oyun ekibi ekler.',
  ].join('\n');
  const pr = await github<{ html_url: string }>(anahtar, `/repos/${depo}/pulls`, {
    method: 'POST',
    govde: { title: `Panel: ${ozet}`.slice(0, 120), head: dal, base: ana, body: govde },
  });
  return pr.html_url;
}
