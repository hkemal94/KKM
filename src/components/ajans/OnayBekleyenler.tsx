import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Pencil, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react';
import type { Item } from '../../types';
import { bekleyenAdaylar } from '../../lib/adaylar';
import { eksikleriCikar } from '../../lib/eksikler';
import { anahtariOku } from '../../lib/oyunAyarlari';
import {
  TUR_ETIKETI, ajanAnahtari, kararYaz, kararlariOku, onayKaydinaCevir, onerileriOku, prBirlestir,
  type AjanOnerisi, type OneriKarari
} from '../../lib/ajanOnerileri';
import { kimdeAdi } from '../../lib/isler';
import { tepsiDosyasi, tepsiyiGonder } from '../../lib/tepsiAjansa';
import {
  AJANSA_YOLLA_NOTU, HAZIR_SECENEKLER, bugun, gorunum, gunEkle, onayKayitlari, onaylariYaz, oneriAnahtari, tarihYaz,
  type Gorunum, type OnayKaydi
} from '../../lib/onaylar';
import { useBekleyenIsler } from '../anasayfa/BekleyenIsler';
import { EksikOzeti } from '../anasayfa/EksikOzeti';
import { ISLEM_ADI, useAjansKararlari } from '../anasayfa/AjansKararlariKarti';
import { maddeTuru } from '../../lib/ajansKararlari';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { oneriTuru, useOneriIslemleri } from '../studyo/OneriTepsisi';
import type { StudyoIslemleri } from '../studyo/StudyoBaglami';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';
import { ASAMALAR, takipListesi, useAjansta, type TakipSatiri } from '../../lib/ajansta';
import { TakipGovdesi } from './AsamaSeridi';

/**
 * Ajans → Onay bekleyenler (2 Kasım, Kemal'in yeni yerleşimi).
 * KKM'nin açılış ekranı. Kemal'in kararını bekleyen her şey tek listede:
 * tek seferlik işler, öneri tepsisi ve ajansın kararları; en yeni üstte.
 *
 * 3. adım (2 Kasım): her satırda ortak düğmeler — Uygula · Düzenle ·
 * Arşivle · Sil — ve tarihe kadar Beklet. Birkaç satır seçilip toplu
 * uygulanır ya da arşivlenir. Bekletilen ve arşivdekiler kendi
 * süzgecinde; oradan listeye geri alınır. Arşiv / bekletme / not bilgisi
 * `kkm_ayar` kaydında (`lib/onaylar.ts`), yalnız düğmeye basınca yazılır.
 * Düzenleme notu "Tepsiyi ajansa gönder"le ajansa gider; ajans revize eder.
 * Eksikler listede değil, altta kendi özetinde (onay değil, yapılacak iş).
 *
 * 5. adım (2 Kasım, onaylı yazma): ajanların işleri (`kkm/oneriler.json`,
 * `lib/ajanOnerileri.ts`) de aynı düğmelerle burada. Onların kararı
 * `kkm_ayar`'a değil ajansın deposuna (`kkm/oneri-kararlari.json`) yazılır;
 * Kems okur. PR olan işte Uygula, sorduktan sonra PR'ı birleştirir.
 *
 * Ajansta (3 Kasım, Kemal): Düzenle denen satır listeden kalkar, "Ajansta"
 * süzgecine geçer; orada aşaması görünür (Sırada → Kems aldı → Ajanda →
 * Onayına düştü, `lib/ajansta.ts`). Yeni hâli ajansın dosyasına `kaynak`ıyla
 * gelince eski satır kapanır. Kemal'in ajan düğmesiyle verdiği istekler de
 * aynı süzgeçte, yalnız okunur. KKM ajansın dosyalarına bunun için yazmaz.
 *
 * Onay ayarları (3 Kasım, Kemal'in soru turu): en yeni üstte; arşiv süresiz
 * (kendiliğinden silinmez, Kemal siler); "Hepsini uygula" ve "Seçilenleri
 * uygula" her türde, her satırda o türün kendi Uygula'sı çalışır (PR'larda
 * tek "emin misin"); kapalı satırda başlığın altında kısa özet ve varsa
 * küçük görsel, tam içerik satır açılınca.
 *
 * Ajansa yolla (3 Kasım, Kemal): not yazmadan "olduğu gibi yeniden yap".
 * Düzenle'nin kaydının aynısı hazır notla yazılır (`AJANSA_YOLLA_NOTU`), satır
 * Ajansta'ya geçer. Ajansın yeniden yapabileceği satırlarda var: öneri tepsisi,
 * ajanların işleri ("yapamadım" türü hariç) ve ajansın kararları; tek seferlik
 * işlerde yok (KKM'nin kendi düğmeleri, ajans yapmıyor).
 */

type Suzgec = 'hepsi' | 'isler' | 'oneriler' | 'ajanlar' | 'kararlar' | 'ajansta' | 'bekletilen' | 'arsiv' | 'eksikler';
type Kaynak = 'is' | 'oneri' | 'ajan' | 'karar';

interface Satir {
  anahtar: string;
  kaynak: Kaynak;
  etiket: string;
  baslik: string;
  /** Sıralama için (ms); tek seferlik işlerde şimdi */
  zaman: number;
  zamanYazi?: string;
  /** Kapalı satırda başlığın altındaki 1-2 satırlık özet */
  ozet?: string;
  /** Kapalı satırdaki küçük önizleme görseli */
  gorsel?: string;
  govde: React.ReactNode;
  /** Uygula; seçim gerektiren öneride null (seçim gövdede). `soruldu`: toplu uygulamada "emin misin" bir kez soruldu */
  uygula: { ad: string; calistir: (soruldu?: boolean) => Promise<void> } | null;
  /** Uygula bir PR birleştirecek mi (toplu uygulamada tek soru için) */
  pr?: boolean;
  /** Sil: öneride kaydı siler; işte ve kararda satırı listeden kalıcı kaldırır */
  sil: () => Promise<void>;
  silAciklama: string;
  /** "Ajansa yolla" var mı: ajansın yeniden yapabileceği satır */
  yolla?: boolean;
}

interface Props {
  items: Item[];
  studyo: StudyoIslemleri;
  /** Bekleyen tek seferlik düğmelerin adları (zildeki liste) */
  dugmeler: string[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
  /** Eksikler sayfasını açar (başlık verilirse o liste açık gelir) */
  onEksikler: (anahtar: string | null) => void;
  /** Durum → Ajans (GitHub anahtarı orada girilir) */
  onAjans: () => void;
}

/** Satır başlığındaki aşama adı (Ajanda'da ajanın adı) */
const asamaAdi = (t: TakipSatiri) => (t.durum.asama === 'ajanda' && t.durum.kimde ? kimdeAdi(t.durum.kimde) : ASAMALAR.find(a => a.id === t.durum.asama)?.ad || '');
const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Bağlantı doğrudan bir görsel mi (önizleme için) */
const GORSEL_ADRESI = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;
const KUTU = `rounded-lg bg-white dark:bg-[#17345A] border border-[#CFC5B4] dark:border-[#2C3C72] p-2.5 text-[12px] leading-relaxed ${YAZI}`;
const CIP = (aktif: boolean) => `shrink-0 min-h-9 px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer border ${aktif ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#0E1C4F] dark:text-[#F3EFE8] hover:border-[#F26B6F]'}`;

export const OnayBekleyenler: React.FC<Props> = ({
  items, studyo, dugmeler, onUpdateItem, onAddItem, onDeleteItem, onAlanSil, onEksikler, onAjans
}) => {
  const [suzgec, setSuzgec] = useState<Suzgec>('hepsi');
  /** "Yenile": ajansın kararları depodan yeniden okunur */
  const [tur, setTur] = useState(0);
  const [acik, setAcik] = useState<string | null>(null);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  /** Açık alt pano: düzenle / beklet / sil onayı */
  const [panel, setPanel] = useState<{ anahtar: string; tur: 'duzenle' | 'beklet' | 'sil' } | null>(null);
  const [not, setNot] = useState('');
  const [secenekler, setSecenekler] = useState<string[]>([]);
  const [bekletGun, setBekletGun] = useState(() => gunEkle(bugun(), 7));
  const [calisan, setCalisan] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);

  const anahtar = anahtariOku();
  const isler = useBekleyenIsler({ items, onUpdateItem, onAddItem, onDeleteItem, onAlanSil });
  const oneri = useOneriIslemleri(studyo);
  const kararlar = useAjansKararlari({ items, anahtar: anahtar || '', tur, onUpdateItem, onDeleteItem, onAddItem });
  /** Ajanların işleri ve Kemal'in onlara verdiği kararlar (ajansın deposundan) */
  const [ajan, setAjan] = useState<{ oneriler: AjanOnerisi[]; kararlar: Record<string, OneriKarari>; hata?: string } | null>(null);
  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    Promise.all([onerileriOku(anahtar), kararlariOku(anahtar)])
      .then(([oneriler, kararlar]) => { if (!iptal) setAjan({ oneriler, kararlar }); })
      .catch(e => { if (!iptal) setAjan({ oneriler: [], kararlar: {}, hata: hataYazi(e) }); });
    return () => { iptal = true; };
  }, [anahtar, tur]);
  const kayitlar = useMemo(() => {
    const k = onayKayitlari(items);
    for (const [id, karar] of Object.entries(ajan?.kararlar ?? {}) as Array<[string, OneriKarari]>) k[ajanAnahtari(id)] = onayKaydinaCevir(karar);
    return k;
  }, [items, ajan]);
  /** Aşamalar için ajansın iş listesi, istekleri ve son tepsi (yalnız okunur) */
  const ajansta = useAjansta(anahtar, tur);
  const takip = useMemo(() => {
    const v = ajansta.veri;
    return takipListesi(items, {
      istekler: v?.istekler || [], isler: v?.isler || [], tepsiOnaylar: v?.tepsiOnaylar ?? null,
      oneriler: ajan?.oneriler || v?.oneriler || [], kararlar: ajan?.kararlar || v?.kararlar || {}
    });
  }, [items, ajansta.veri, ajan]);
  const takipBul = useMemo(() => new Map(takip.map(t => [t.kaynak, t])), [takip]);
  const takipIstekler = takip.filter(t => t.tur === 'istek');
  const adaylar = useMemo(() => bekleyenAdaylar(items), [items]);
  const eksikler = useMemo(() => eksikleriCikar(items), [items]);
  const eksikSayisi = eksikler.reduce((t, e) => t + e.sayi, 0);
  const gun = bugun();

  // ---------------------------------------------------------------- onay bilgisi yazma

  /** Ajan işlerinin kararını ajansın deposuna yazar ve ekranda hemen gösterir */
  const ajanaYaz = async (degisim: Record<string, OneriKarari | null>) => {
    if (!anahtar) throw new Error('bu tarayıcıda GitHub anahtarı yok');
    const kararlar = await kararYaz(anahtar, degisim);
    setAjan(a => (a ? { ...a, kararlar } : a));
  };

  /**
   * Onay bilgilerini yazar: ajan işleri ajansın deposuna, gerisi kkm_ayar'a;
   * silinmiş önerilerin eski bilgisi düşer
   */
  const yaz = async (degisim: Record<string, OnayKaydi | null>) => {
    const ajanDegisim: Record<string, OneriKarari | null> = {};
    const kkmDegisim: Record<string, OnayKaydi | null> = {};
    for (const [k, v] of Object.entries(degisim)) {
      if (k.startsWith('ajan:')) ajanDegisim[k.slice(5)] = v ? { ...v } : null;
      else kkmDegisim[k] = v;
    }
    if (Object.keys(ajanDegisim).length) await ajanaYaz(ajanDegisim);
    if (!Object.keys(kkmDegisim).length) return {};
    const adayVar = new Set(adaylar.map(a => oneriAnahtari(a.id)));
    const r = onaylariYaz(items, kkmDegisim, k => !k.startsWith('oneri:') || adayVar.has(k));
    if (r.guncel) await onUpdateItem(r.guncel);
    else if (r.yeni) await onAddItem(r.yeni);
    return r;
  };

  /** Kaydın hemen yazılmış hâliyle öğeler (ajansa gidecek tepsi için) */
  const yazilmisItems = (r: { guncel?: Item; yeni?: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> }): Item[] => {
    if (r.guncel) return items.map(i => (i.id === r.guncel!.id ? r.guncel! : i));
    if (r.yeni) return [...items, { ...r.yeni, id: 'kkm_ayar_yeni', createdAt: Date.now(), updatedAt: Date.now(), userId: '' } as Item];
    return items;
  };

  // ---------------------------------------------------------------- satırlar

  // Kaynakların işleri her açılışta yeniden kurulur; liste küçük olduğu için önbellek yok
  const satirlar: Satir[] = (() => {
    const simdi = Date.now();
    const liste: Satir[] = [];

    for (const is of isler.bekleyen) {
      liste.push({
        anahtar: `is:${is.id}:${is.ad}`, kaynak: 'is', etiket: 'İŞ', baslik: is.ad, zaman: simdi,
        ozet: isler.raporlar[is.id] ?? is.aciklama,
        govde: <p className={`text-[12px] leading-snug ${IKINCIL}`}>{isler.raporlar[is.id] ?? is.aciklama}</p>,
        uygula: { ad: 'Yap', calistir: async () => { await isler.calistir(is); } },
        sil: async () => { await yaz({ [`is:${is.id}:${is.ad}`]: { durum: 'silindi', zaman: Date.now() } }); },
        silAciklama: 'İş listeden kalkar; iş değişirse (sayısı artarsa) yeniden görünür. Kayıtlara dokunulmaz.'
      });
    }

    for (const a of adaylar) {
      const oz = oneri.ozet(a);
      liste.push({
        anahtar: oneriAnahtari(a.id), kaynak: 'oneri', etiket: oneriTuru(a), baslik: a.title,
        zaman: a.createdAt, zamanYazi: neZaman(a.createdAt),
        ozet: oz.metin || undefined, gorsel: oz.gorsel,
        govde: oneri.govde(a, true),
        uygula: oneri.uygula(a), yolla: true,
        sil: async () => { await oneri.sil(a); },
        silAciklama: 'Öneri silinir, geri gelmez. Hiçbir maddeye dokunulmaz.'
      });
    }

    for (const o of ajan?.oneriler || []) {
      const k = ajanAnahtari(o.id);
      const karar = ajan?.kararlar[o.id];
      if (karar?.durum === 'uygula') continue;
      const zaman = Date.parse(o.tarih) || simdi;
      liste.push({
        anahtar: k, kaynak: 'ajan', etiket: TUR_ETIKETI[o.tur], baslik: o.baslik, zaman, zamanYazi: neZaman(zaman),
        ozet: `${kimdeAdi(o.ajan)}${o.ozet ? ` · ${o.ozet}` : ''}`,
        gorsel: o.baglanti && GORSEL_ADRESI.test(o.baglanti) ? o.baglanti : undefined,
        pr: o.tur === 'pr' && !!o.baglanti,
        // "Yapamadım" diyen işte yeniden yap anlamsız: eksik yetenek gelmeden aynı sonuç çıkar
        yolla: o.tur !== 'eksik',
        govde: (
          <>
            <p className={`text-[12px] leading-snug ${IKINCIL}`}>
              <b className={YAZI}>{kimdeAdi(o.ajan)}</b>{o.ozet ? ` · ${o.ozet}` : ''}
            </p>
            {o.baglanti && (
              <a href={o.baglanti} target="_blank" rel="noreferrer" className={DUGME_BOS}>
                <ExternalLink className="w-3.5 h-3.5" /> {o.tur === 'pr' ? 'PR\'ı aç' : o.tur === 'drive' ? 'Belgeyi aç' : 'Dosyayı aç'}
              </a>
            )}
            {o.tur === 'pr' && <p className={`text-[11px] ${IKINCIL}`}>Uygula bu PR'ı birleştirir (önce sorar).</p>}
            {o.tur === 'eksik' && <p className={`text-[11px] ${IKINCIL}`}>Ajan bunu yapamadı; hazırlığı yaptı. "Gördüm" deyince listeden kalkar, ajanın kartında durmaya devam eder.</p>}
          </>
        ),
        uygula: {
          ad: o.tur === 'pr' ? 'Birleştir' : o.tur === 'eksik' ? 'Gördüm' : 'Onayla',
          calistir: async (soruldu?: boolean) => {
            let sonuc: string | undefined;
            if (o.tur === 'pr' && o.baglanti) {
              if (!soruldu && !window.confirm(`"${o.baslik}" PR'ı birleştirilsin mi? Bu geri alınamaz.`)) throw new Error('vazgeçildi');
              sonuc = await prBirlestir(anahtar || '', o.baglanti);
            }
            await ajanaYaz({ [o.id]: { durum: 'uygula', zaman: Date.now(), ...(sonuc ? { sonuc } : {}) } });
          }
        },
        sil: async () => { await ajanaYaz({ [o.id]: { durum: 'silindi', zaman: Date.now() } }); },
        silAciklama: 'Ajansa "istemiyorum" diye gider; Kems işi kapatır. Hiçbir kayda, PR\'a ya da dosyaya dokunulmaz.'
      });
    }

    const d = kararlar.dosya;
    if (anahtar && d && typeof d === 'object' && 'islemler' in d && kararlar.islemler.length && !kararlar.sonuc) {
      const k = `karar:${d.olusturuldu || 'dosya'}`;
      const zaman = Date.parse(d.olusturuldu) || simdi;
      const { silSayisi, yazSayisi } = kararlar;
      liste.push({
        anahtar: k, kaynak: 'karar', etiket: 'KARAR', zaman, zamanYazi: neZaman(zaman),
        baslik: `Ajansın kararları: ${kararlar.islemler.length} iş`,
        ozet: [
          [silSayisi ? `${silSayisi} öneri silinecek` : '', yazSayisi ? `${yazSayisi} düzeltme vikiye` : ''].filter(Boolean).join(', '),
          kararlar.islemler.slice(0, 3).map(i => i.baslik).join(' · ')
        ].filter(Boolean).join(' · '),
        govde: (
          <>
            <p className={`text-[12px] ${IKINCIL}`}>
              {silSayisi ? `${silSayisi} öneri tepsiden silinecek` : ''}{silSayisi && yazSayisi ? ', ' : ''}{yazSayisi ? `${yazSayisi} düzeltme vikiye işlenecek` : ''}.
              Uygula hepsini birden işler; makbuz ajansın deposuna düşer.
            </p>
            <ul className={`${KUTU} space-y-1.5 max-h-72 overflow-y-auto`}>
              {kararlar.islemler.map(i => (
                <li key={i.kimlik}>
                  <span className="font-semibold">{ISLEM_ADI[i.tur]}:</span> {i.baslik}
                  {(i.tur === 'alanaYaz' || i.tur === 'takmaAdEkle' || i.tur === 'metneEkle' || i.tur === 'metniDegistir') && <> → <b>{i.deger}</b></>}
                  {i.tur === 'gorselEkle' && <> → <img src={i.deger} alt="" loading="lazy" className="inline-block h-10 max-w-20 object-cover rounded align-middle" /> <b>{i.deger}</b></>}
                  {i.tur === 'alaniDegistir' && <> → <b>{i.alan}: {i.eski ? `${i.eski} → ` : ''}{i.deger}</b></>}
                  {(i.tur === 'takmaAdSil' || i.tur === 'metindenSil') && <> → <b className="line-through">{i.tur === 'takmaAdSil' ? i.deger : i.eski}</b></>}
                  {i.tur === 'bagKur' && <> → <b>{i.kaynak} · {i.bag} · {i.hedef}{i.ikiYonlu ? ' (iki tarafta)' : ''}</b></>}
                  {i.tur === 'yeniMadde' && <> · <b>{TYPE_LABELS[maddeTuru(i.maddeTur)!] || i.maddeTur}</b>{i.metin ? <> → {i.metin}</> : null}{i.baglar?.length ? <> · bağlar: {i.baglar.map(b => `${b.bag} ${b.hedef}`).join(', ')}</> : null}</>}
                  <span className={`block text-[11px] ${IKINCIL}`}>{i.neden}</span>
                </li>
              ))}
            </ul>
          </>
        ),
        uygula: { ad: 'Uygula', calistir: () => kararlar.uygula() }, yolla: true,
        sil: async () => { await yaz({ [k]: { durum: 'silindi', zaman: Date.now() } }); },
        silAciklama: 'Bu karar dosyası listeden kalkar ve ajansa "istemiyorum" diye gider. Kayıtlara dokunulmaz; ajans yeni dosya yazarsa yeniden görünür.'
      });
    }

    return liste.sort((x, y) => y.zaman - x.zaman);
  })();

  const nerede = (s: Satir): Gorunum => gorunum(kayitlar[s.anahtar], gun);
  const listede = satirlar.filter(s => nerede(s) === 'liste');
  const bekletilen = satirlar.filter(s => nerede(s) === 'bekletilen');
  const arsivde = satirlar.filter(s => nerede(s) === 'arsiv');
  // Yeni hâli onaya düşmüş olan eski satır hiçbir yerde görünmez (takip listesinde yok)
  const ajanstaki = satirlar.filter(s => nerede(s) === 'ajansta' && takipBul.has(s.anahtar));
  const ajanstaSayisi = ajanstaki.length + takipIstekler.length;
  const say = (k: Kaynak) => listede.filter(s => s.kaynak === k).length || undefined;

  const gorunen = suzgec === 'bekletilen' ? bekletilen
    : suzgec === 'arsiv' ? arsivde
    : suzgec === 'ajansta' ? ajanstaki
    : suzgec === 'eksikler' ? []
    : suzgec === 'hepsi' ? listede
    : listede.filter(s => s.kaynak === ({ isler: 'is', oneriler: 'oneri', ajanlar: 'ajan', kararlar: 'karar' } as const)[suzgec]);
  const listeGorunumu = suzgec !== 'bekletilen' && suzgec !== 'arsiv' && suzgec !== 'ajansta';
  const seciliSatirlar = gorunen.filter(s => secili.has(s.anahtar));

  const SUZGECLER: Array<{ id: Suzgec; ad: string; sayi?: number }> = [
    { id: 'hepsi', ad: 'Hepsi', sayi: listede.length || undefined },
    { id: 'isler', ad: 'Tek seferlik işler', sayi: say('is') },
    { id: 'oneriler', ad: 'Öneriler', sayi: say('oneri') },
    { id: 'ajanlar', ad: 'Ajanların işleri', sayi: say('ajan') },
    { id: 'kararlar', ad: 'Ajansın kararları', sayi: say('karar') },
    { id: 'ajansta', ad: 'Ajansta', sayi: ajanstaSayisi || undefined },
    { id: 'bekletilen', ad: 'Bekletilen', sayi: bekletilen.length || undefined },
    { id: 'arsiv', ad: 'Arşiv', sayi: arsivde.length || undefined },
    { id: 'eksikler', ad: 'Eksikler', sayi: eksikSayisi || undefined }
  ];

  // ---------------------------------------------------------------- düğmeler

  const calistir = async (ad: string, is: () => Promise<string | void>) => {
    setCalisan(ad);
    setMesaj(null);
    try {
      const m = await is();
      if (m) setMesaj(m);
    } catch (e) {
      setMesaj(hataYazi(e) === 'vazgeçildi' ? 'Vazgeçildi; hiçbir şey değişmedi.' : `Olmadı: ${hataYazi(e)}. Tekrar basabilirsin.`);
    } finally { setCalisan(null); }
  };

  const panelAc = (s: Satir, t: 'duzenle' | 'beklet' | 'sil') => {
    if (panel?.anahtar === s.anahtar && panel.tur === t) { setPanel(null); return; }
    const k = kayitlar[s.anahtar];
    setNot(k?.durum === 'duzenle' ? k.not || '' : '');
    setSecenekler(k?.durum === 'duzenle' ? k.secenekler || [] : []);
    setBekletGun(gunEkle(gun, 7));
    setPanel({ anahtar: s.anahtar, tur: t });
  };

  const uygula = (s: Satir) => calistir(s.anahtar, async () => {
    if (!s.uygula) return;
    await s.uygula.calistir();
    if (s.kaynak !== 'ajan' && kayitlar[s.anahtar]) await yaz({ [s.anahtar]: null });
    setPanel(null);
    return s.kaynak === 'oneri' ? undefined : s.kaynak === 'ajan' ? `"${s.baslik}" onaylandı; Kems gereğini yapar.` : `${s.baslik}: yapıldı.`;
  });

  const arsivle = (liste: Satir[]) => calistir('arsiv', async () => {
    const z = Date.now();
    await yaz(Object.fromEntries(liste.map(s => [s.anahtar, { durum: 'arsiv' as const, zaman: z }])));
    setSecili(new Set());
    setPanel(null);
    return liste.length > 1 ? `${liste.length} satır arşive kalktı.` : `"${liste[0].baslik}" arşive kalktı.`;
  });

  const beklet = (s: Satir) => calistir(s.anahtar, async () => {
    if (!bekletGun || bekletGun <= gun) throw new Error('bugünden sonraki bir gün seç');
    await yaz({ [s.anahtar]: { durum: 'bekle', tarih: bekletGun, zaman: Date.now() } });
    setPanel(null);
    return `"${s.baslik}" ${tarihYaz(bekletGun)} gününe kadar bekliyor; o gün listeye döner.`;
  });

  const geriAl = (s: Satir) => calistir(s.anahtar, async () => {
    await yaz({ [s.anahtar]: null });
    return `"${s.baslik}" listeye döndü.`;
  });

  const sil = (s: Satir) => calistir(s.anahtar, async () => {
    await s.sil();
    if (s.kaynak === 'oneri' && kayitlar[s.anahtar]) await yaz({ [s.anahtar]: null });
    setPanel(null);
    setSecili(x => { const y = new Set(x); y.delete(s.anahtar); return y; });
    return `"${s.baslik}" silindi.`;
  });

  /**
   * KKM kaydına yazılan notları tepsiyle ajansa gönderir (ajan işlerinin notu
   * zaten ajansın dosyasında). Dönen yazı mesajın ikinci yarısıdır.
   */
  const tepsiyleGonder = async (r: { guncel?: Item; yeni?: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> }): Promise<string> => {
    if (!anahtar) return 'Bu tarayıcıda GitHub anahtarı olmadığı için ajansa gitmedi; Ajans bağlantısı\'nda anahtar girince "Tepsiyi ajansa gönder" ile gider.';
    try {
      await tepsiyiGonder(anahtar, tepsiDosyasi(yazilmisItems(r)));
      setTur(t => t + 1); // aşama için tepsiyi yeniden oku
      return 'Tepsiyle ajansa gitti; ajans bir sonraki çalışmasında ele alır.';
    } catch (e) {
      return `Ama ajansa gönderilemedi (${hataYazi(e)}); Ajans bağlantısı → "Tepsiyi ajansa gönder"le yeniden dene.`;
    }
  };

  const duzenle = (s: Satir) => calistir(s.anahtar, async () => {
    if (!not.trim() && !secenekler.length) throw new Error('bir not yaz ya da bir seçenek seç');
    const r = await yaz({ [s.anahtar]: { durum: 'duzenle', not, secenekler, zaman: Date.now() } });
    setPanel(null);
    setAcik(null);
    if (s.kaynak === 'ajan') return 'Not ajansa gitti; iş "Ajansta" süzgecine geçti. Kems işi notunla ilgili ajana geri verir; yeni hâli buraya gelir.';
    return `Not kaydedildi; iş "Ajansta" süzgecine geçti. ${await tepsiyleGonder(r)}`;
  });

  /** Ajansa yolla: not yazmadan "olduğu gibi yeniden yap"; Düzenle'nin kaydı, hazır notla */
  const ajansaYolla = (liste: Satir[]) => calistir(liste.length === 1 ? `yolla:${liste[0].anahtar}` : 'yolla', async () => {
    const yollanan = liste.filter(s => s.yolla);
    if (!yollanan.length) throw new Error('seçilenlerin hiçbiri ajansa yollanamıyor');
    const z = Date.now();
    const r = await yaz(Object.fromEntries(yollanan.map(s => [s.anahtar, { durum: 'duzenle' as const, not: AJANSA_YOLLA_NOTU, zaman: z }])));
    setSecili(new Set());
    setPanel(null);
    setAcik(null);
    const atlanan = liste.length - yollanan.length;
    const ne = yollanan.length > 1 ? `${yollanan.length} satır ajansa yollandı` : `"${yollanan[0].baslik}" ajansa yollandı`;
    const parcalar = [`${ne}; "Ajansta" süzgecine geçti. Ajans olduğu gibi yeniden yapar, yeni hâli buraya gelir.`];
    if (yollanan.some(s => s.kaynak !== 'ajan')) parcalar.push(await tepsiyleGonder(r));
    if (atlanan) parcalar.push(`${atlanan} satır ajansa yollanamadığı için atlandı.`);
    return parcalar.join(' ');
  });

  /**
   * Toplu uygula (3 Kasım: her türde). Her satırda o türün kendi Uygula'sı
   * çalışır; PR birleştirecekse ya da "Hepsini uygula"ysa önce tek soru.
   */
  const topluUygula = (liste: Satir[], hepsi = false) => calistir('toplu', async () => {
    let oldu = 0, olmadi = 0;
    const secimli = liste.filter(s => !s.uygula).length;
    const prSayisi = liste.filter(s => s.uygula && s.pr).length;
    if (hepsi || prSayisi) {
      const uygulanacak = liste.length - secimli;
      const soru = `${uygulanacak} satır uygulansın mı?${prSayisi ? ` Bunların ${prSayisi} tanesi PR; birleştirilir, geri alınamaz.` : ''}`;
      if (!window.confirm(soru)) throw new Error('vazgeçildi');
    }
    const temizle: Record<string, null> = {};
    for (const s of liste) {
      if (!s.uygula) continue;
      try {
        await s.uygula.calistir(true);
        oldu++;
        if (s.kaynak !== 'ajan' && kayitlar[s.anahtar]) temizle[s.anahtar] = null;
      } catch { olmadi++; }
    }
    if (Object.keys(temizle).length) await yaz(temizle);
    setSecili(new Set());
    return [`${oldu} satır uygulandı`, olmadi ? `${olmadi} olmadı (tek tek dene)` : '', secimli ? `${secimli} öneri seçim istediği için atlandı (açıp içinden seç)` : '']
      .filter(Boolean).join(', ') + '.';
  });

  const sec = (k: string) => setSecili(x => { const y = new Set(x); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  /** "Hepsini uygula"nın sayısı: seçim isteyen öneriler hariç */
  const uygulanabilir = gorunen.filter(s => s.uygula).length;
  const hepsiSecili = gorunen.length > 0 && gorunen.every(s => secili.has(s.anahtar));

  // ---------------------------------------------------------------- görünüm

  const satirGoster = (s: Satir) => {
    const buAcik = acik === s.anahtar;
    const k = kayitlar[s.anahtar];
    const bu = calisan === s.anahtar;
    const mesgul = !!calisan;
    const p = panel?.anahtar === s.anahtar ? panel.tur : null;
    const t = suzgec === 'ajansta' ? takipBul.get(s.anahtar) : undefined;
    return (
      <li key={s.anahtar} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72]">
        <div className="flex items-center gap-2">
          {listeGorunumu && (
            <input
              type="checkbox" checked={secili.has(s.anahtar)} onChange={() => sec(s.anahtar)}
              aria-label={`${s.baslik} seç`} className="w-4 h-4 shrink-0 accent-[#F26B6F] cursor-pointer"
            />
          )}
          <button type="button" onClick={() => setAcik(buAcik ? null : s.anahtar)} className="flex-1 min-w-0 min-h-11 flex items-center gap-2.5 py-2 text-left cursor-pointer">
            <i className="not-italic shrink-0 px-1.5 py-0.5 rounded bg-[#F3EFE8] dark:bg-[#17345A] text-[9px] font-mono font-bold tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">{s.etiket}</i>
            <span className="flex-1 min-w-0">
              <span className={`block truncate text-[13px] ${YAZI}`}>{s.baslik}</span>
              {!buAcik && s.ozet && <span className={`block text-[11px] leading-snug line-clamp-2 ${IKINCIL}`}>{s.ozet}</span>}
            </span>
            {!buAcik && s.gorsel && <img src={s.gorsel} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded-md object-cover border border-[#CFC5B4] dark:border-[#2C3C72]" />}
            {k?.durum === 'duzenle' && <Pencil className="w-3.5 h-3.5 shrink-0 text-[#F26B6F]" aria-label="Düzenleme notu var" />}
            {suzgec === 'bekletilen' && k?.tarih && <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{tarihYaz(k.tarih)}</span>}
            {suzgec === 'ajansta' && t && <span className={`shrink-0 text-[10px] font-semibold text-[#F26B6F]`}>{asamaAdi(t)}</span>}
            {suzgec !== 'bekletilen' && suzgec !== 'ajansta' && s.zamanYazi && <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{s.zamanYazi}</span>}
            {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
          </button>
        </div>

        {buAcik && (
          <div className="pb-3 space-y-2">
            {t && <TakipGovdesi s={t} notGizle />}
            {s.govde}

            {k?.durum === 'duzenle' && (
              <p className={`text-[11px] ${IKINCIL}`}>
                <b className={YAZI}>Düzenleme notun:</b> {[...(k.secenekler || []), k.not].filter(Boolean).join(' · ')}
              </p>
            )}

            {listeGorunumu ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={mesgul || !s.uygula} onClick={() => void uygula(s)} className={DUGME_LAC}
                  title={s.uygula ? s.uygula.ad : 'Bu öneride seçim var: yukarıdan seç'}>
                  <Check className="w-3.5 h-3.5" /> {bu ? 'Yapılıyor…' : s.uygula?.ad || 'Uygula'}
                </button>
                <button type="button" disabled={mesgul} onClick={() => panelAc(s, 'duzenle')} className={DUGME_BOS} aria-pressed={p === 'duzenle'}>
                  <Pencil className="w-3.5 h-3.5" /> Düzenle
                </button>
                {s.yolla && (
                  <button type="button" disabled={mesgul} onClick={() => void ajansaYolla([s])} className={DUGME_BOS} title="Not yazmadan ajansa geri yollar: olduğu gibi yeniden yap">
                    <Send className="w-3.5 h-3.5" /> {calisan === `yolla:${s.anahtar}` ? 'Yollanıyor…' : 'Ajansa yolla'}
                  </button>
                )}
                <button type="button" disabled={mesgul} onClick={() => void arsivle([s])} className={DUGME_BOS}>
                  <Archive className="w-3.5 h-3.5" /> Arşivle
                </button>
                <button type="button" disabled={mesgul} onClick={() => panelAc(s, 'sil')} className={DUGME_BOS} aria-pressed={p === 'sil'}>
                  <Trash2 className="w-3.5 h-3.5" /> Sil
                </button>
                <button type="button" disabled={mesgul} onClick={() => panelAc(s, 'beklet')} className={DUGME_BOS} aria-pressed={p === 'beklet'}>
                  <Clock className="w-3.5 h-3.5" /> Beklet
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={mesgul} onClick={() => void geriAl(s)} className={DUGME_LAC}>
                  <Undo2 className="w-3.5 h-3.5" /> Listeye geri al
                </button>
                <button type="button" disabled={mesgul} onClick={() => panelAc(s, 'sil')} className={DUGME_BOS} aria-pressed={p === 'sil'}>
                  <Trash2 className="w-3.5 h-3.5" /> Sil
                </button>
              </div>
            )}

            {p === 'duzenle' && (
              <div className={`${KUTU} space-y-2`}>
                <p className={IKINCIL}>Ne değişsin? Not yaz ya da hazır seçeneklerden seç (ikisi birden olur). Ajans notuna göre yeniden hazırlar; yeni hâli buraya gelir.</p>
                <div className="flex flex-wrap gap-1.5">
                  {HAZIR_SECENEKLER.map(h => {
                    const on = secenekler.includes(h);
                    return (
                      <button key={h} type="button" aria-pressed={on} onClick={() => setSecenekler(x => (on ? x.filter(y => y !== h) : [...x, h]))}
                        className={`min-h-9 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer ${on ? 'bg-[#F26B6F] border-transparent text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`}>
                        {h}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  rows={3} value={not} onChange={e => setNot(e.target.value)} placeholder="Örnek: ikinci paragrafı çıkar, daha sade anlat"
                  className={`w-full text-[13px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg p-2 focus:outline-hidden focus:border-[#F26B6F]`}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={mesgul} onClick={() => void duzenle(s)} className={DUGME_LAC}>
                    {bu ? 'Kaydediliyor…' : anahtar ? 'Kaydet ve ajansa gönder' : 'Kaydet'}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={DUGME_BOS}>Vazgeç</button>
                </div>
              </div>
            )}

            {p === 'beklet' && (
              <div className={`${KUTU} space-y-2`}>
                <p className={IKINCIL}>Seçtiğin güne kadar listeden kalkar, o gün kendiliğinden geri gelir. Hiçbir şey çalışmaz, limit harcanmaz.</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[{ ad: 'Yarın', n: 1 }, { ad: '1 hafta', n: 7 }, { ad: '1 ay', n: 30 }].map(x => {
                    const g = gunEkle(gun, x.n);
                    return (
                      <button key={x.ad} type="button" aria-pressed={bekletGun === g} onClick={() => setBekletGun(g)}
                        className={`min-h-9 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer ${bekletGun === g ? 'bg-[#F26B6F] border-transparent text-white' : 'border-[#CFC5B4] dark:border-[#2C3C72] hover:border-[#F26B6F]'}`}>
                        {x.ad}
                      </button>
                    );
                  })}
                  <input type="date" value={bekletGun} min={gunEkle(gun, 1)} onChange={e => setBekletGun(e.target.value)}
                    aria-label="Hangi güne kadar"
                    className={`min-h-9 px-2 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={mesgul} onClick={() => void beklet(s)} className={DUGME_LAC}>
                    {bekletGun > gun ? `${tarihYaz(bekletGun)} gününe kadar beklet` : 'Beklet'}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={DUGME_BOS}>Vazgeç</button>
                </div>
              </div>
            )}

            {p === 'sil' && (
              <div className={`${KUTU} space-y-2`}>
                <p className={IKINCIL}>{s.silAciklama}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={mesgul} onClick={() => void sil(s)} className="min-h-11 lg:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F26B6F] text-white disabled:opacity-40 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> {bu ? 'Siliniyor…' : 'Evet, sil'}
                  </button>
                  <button type="button" onClick={() => setPanel(null)} className={DUGME_BOS}>Vazgeç</button>
                </div>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const istekGoster = (t: TakipSatiri) => {
    const buAcik = acik === `takip:${t.kaynak}`;
    return (
      <li key={t.kaynak} className="border-t border-[#CFC5B4]/70 dark:border-[#2C3C72]">
        <button type="button" onClick={() => setAcik(buAcik ? null : `takip:${t.kaynak}`)} className="w-full min-h-11 flex items-center gap-2.5 py-2 text-left cursor-pointer">
          <i className="not-italic shrink-0 px-1.5 py-0.5 rounded bg-[#F3EFE8] dark:bg-[#17345A] text-[9px] font-mono font-bold tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9]">İSTEK</i>
          <span className={`flex-1 min-w-0 text-[13px] leading-snug line-clamp-2 ${YAZI}`}>{t.baslik}</span>
          <span className="shrink-0 text-[10px] font-semibold text-[#F26B6F]">{asamaAdi(t)}</span>
          {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
        </button>
        {buAcik && <div className="pb-3"><TakipGovdesi s={t} /></div>}
      </li>
    );
  };

  const kararlarGorunur = suzgec === 'hepsi' || suzgec === 'kararlar' || suzgec === 'ajanlar';
  const d = kararlar.dosya;

  return (
    <div className="space-y-3 lg:space-y-4 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`font-bold tracking-tight leading-tight text-[20px] lg:text-[28px] ${YAZI}`}>Onay bekleyenler</h1>
          <p className={`mt-1 text-[13px] ${IKINCIL}`}>Kararını bekleyen her şey burada. Sen basmadan hiçbir kayıt değişmez.</p>
        </div>
        <button type="button" onClick={() => setTur(t => t + 1)} className={`${DUGME_BOS} shrink-0`} title="Ajansın kararlarını ve ajanların işlerini yeniden oku">
          <RefreshCw className="w-3.5 h-3.5" /> Yenile
        </button>
      </div>

      {/* Süzgeç: telefonda yana kayar */}
      <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {SUZGECLER.map(s => {
          const aktif = suzgec === s.id;
          return (
            <button key={s.id} type="button" onClick={() => { setSuzgec(s.id); setSecili(new Set()); setPanel(null); }} aria-pressed={aktif} className={CIP(aktif)}>
              {s.ad}
              {s.sayi ? <span className={`px-1.5 rounded-full text-[10px] font-bold ${aktif ? 'bg-[#F26B6F] text-white' : 'bg-[#F3EFE8] dark:bg-[#0B132B]'}`}>{s.sayi}</span> : null}
            </button>
          );
        })}
      </div>

      {(mesaj || oneri.rapor) && (
        <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>
          {mesaj || oneri.rapor}{' '}
          <button type="button" onClick={() => { setMesaj(null); oneri.setRapor(null); }} className="underline cursor-pointer">tamam</button>
        </p>
      )}

      {/* Ajansın kararları: anahtar yoksa, okunamadıysa ya da yeni uygulandıysa */}
      {kararlarGorunur && (
        !anahtar ? (
          <section className={`${KART} p-4 space-y-2`}>
            <p className={`text-[13px] font-semibold ${YAZI}`}>Ajansın kararları</p>
            <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; ajansın kararları ve ajanların işleri okunamıyor. Anahtar Ajanlar ve otomasyonlar → Ajans bağlantısı'nda bir kez girilir.</p>
            <button type="button" onClick={onAjans} className={DUGME_BOS}>Ajans bağlantısı</button>
          </section>
        ) : kararlar.sonuc ? (
          <section className={`${KART} p-4 space-y-2`}>
            <p className={`text-[13px] ${YAZI}`}>
              <Check className="inline w-4 h-4 text-[#F26B6F]" /> Ajansın kararları: {kararlar.sonuc.u.uygulanan.length} işlendi
              {kararlar.sonuc.u.atlanan.length ? `, ${kararlar.sonuc.u.atlanan.length} atlandı (${[...new Set(kararlar.sonuc.u.atlanan.map(a => a.neden))].join('; ')})` : ''}.
            </p>
            {kararlar.sonuc.makbuz && <a href={kararlar.sonuc.makbuz} target="_blank" rel="noreferrer" className={DUGME_BOS}><ExternalLink className="w-3.5 h-3.5" /> Makbuz</a>}
            {kararlar.sonuc.makbuzHata && <p className={`text-[12px] ${YAZI}`}>Makbuz yazılamadı ({kararlar.sonuc.makbuzHata}); ajansa "uyguladım" diye haber ver.</p>}
          </section>
        ) : ajan?.hata ? (
          <p className={`${KART} p-4 text-[12px] ${YAZI}`}>
            Ajanların işleri okunamadı ({ajan.hata}). <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button>
          </p>
        ) : d && typeof d === 'object' && 'hata' in d ? (
          <p className={`${KART} p-4 text-[12px] ${YAZI}`}>
            Ajansın kararları okunamadı ({d.hata}). <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button>
          </p>
        ) : suzgec === 'kararlar' && d === 'yukleniyor' ? (
          <p className={`${KART} p-4 text-[12px] ${IKINCIL}`}>Ajansın kararları okunuyor…</p>
        ) : null
      )}

      {suzgec !== 'eksikler' && (
        <section className={`${KART} p-4`}>
          {listeGorunumu && gorunen.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <label className={`flex items-center gap-2 text-[12px] ${IKINCIL} cursor-pointer`}>
                <input type="checkbox" checked={hepsiSecili} onChange={() => setSecili(hepsiSecili ? new Set() : new Set(gorunen.map(s => s.anahtar)))} className="w-4 h-4 accent-[#F26B6F] cursor-pointer" />
                {seciliSatirlar.length ? `${seciliSatirlar.length} seçili` : 'Hepsini seç'}
              </label>
              {seciliSatirlar.length === 0 && uygulanabilir > 0 && (
                <button type="button" disabled={!!calisan} onClick={() => void topluUygula(gorunen, true)} className={`ml-auto ${DUGME_BOS}`}
                  title="Listedeki her satırın kendi Uygula'sı çalışır; önce bir kez sorar">
                  <Check className="w-3.5 h-3.5" /> {calisan === 'toplu' ? 'Uygulanıyor…' : `Hepsini uygula (${uygulanabilir})`}
                </button>
              )}
              {seciliSatirlar.length > 0 && (
                <span className="ml-auto flex flex-wrap gap-2">
                  <button type="button" disabled={!!calisan} onClick={() => void topluUygula(seciliSatirlar)} className={DUGME_LAC}>
                    <Check className="w-3.5 h-3.5" /> {calisan === 'toplu' ? 'Uygulanıyor…' : 'Seçilenleri uygula'}
                  </button>
                  {seciliSatirlar.some(s => s.yolla) && (
                    <button type="button" disabled={!!calisan} onClick={() => void ajansaYolla(seciliSatirlar)} className={DUGME_BOS}
                      title="Not yazmadan ajansa geri yollar: olduğu gibi yeniden yap (tek seferlik işler ve 'yapamadım' işleri atlanır)">
                      <Send className="w-3.5 h-3.5" /> {calisan === 'yolla' ? 'Yollanıyor…' : 'Seçilenleri ajansa yolla'}
                    </button>
                  )}
                  <button type="button" disabled={!!calisan} onClick={() => void arsivle(seciliSatirlar)} className={DUGME_BOS}>
                    <Archive className="w-3.5 h-3.5" /> Seçilenleri arşivle
                  </button>
                </span>
              )}
            </div>
          )}
          {suzgec === 'bekletilen' && <p className={`pb-2 text-[12px] ${IKINCIL}`}>Tarihi gelen kendiliğinden listeye döner.</p>}
          {suzgec === 'arsiv' && <p className={`pb-2 text-[12px] ${IKINCIL}`}>Arşiv süresiz: sen silmeden hiçbir şey kendiliğinden kalkmaz. "Listeye geri al" deyince yeniden onayına gelir.</p>}
          {suzgec === 'ajansta' && <p className={`pb-2 text-[12px] ${IKINCIL}`}>Düzenle ya da Ajansa yolla dediğin işler ajansta. Yeni hâli gelince buradan kalkar, listeye yeni satır olarak düşer. "Listeye geri al" notu geri çeker.</p>}
          {gorunen.length ? <ul>{gorunen.map(satirGoster)}</ul> : (
            <p className={`text-[12px] ${IKINCIL}`}>
              {suzgec === 'bekletilen' ? 'Bekletilen yok.' : suzgec === 'arsiv' ? 'Arşiv boş.' : suzgec === 'ajansta' ? 'Ajansa geri verdiğin bir iş yok.' : 'Onayını bekleyen bir şey yok.'}
            </p>
          )}
          {/* Bu açılışta biten tek seferlik işler */}
          {listeGorunumu && isler.raporSatirlari.map(([id, r]) => (
            <p key={id} className={`mt-2 flex items-center gap-2 text-[12px] ${IKINCIL}`}>
              <Check className="w-3.5 h-3.5 text-[#2F7A45] dark:text-[#9FD3A9]" /> {r}
            </p>
          ))}
        </section>
      )}

      {/* Ajansta: Kemal'in ajan düğmesiyle ve Yapılacak ekle'den verdikleri (yalnız okunur) */}
      {suzgec === 'ajansta' && (
        <section className={`${KART} p-4`}>
          <div className={ETIKET}>Ajana verdiklerin · {takipIstekler.length}</div>
          {ajansta.hata && <p className={`mt-2 text-[12px] ${YAZI}`}>Ajansın iş listesi okunamadı ({ajansta.hata}); aşamalar "Sırada" görünür.</p>}
          {!anahtar ? <p className={`mt-2 text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; istekler okunamıyor.</p>
            : takipIstekler.length ? <ul className="mt-1">{takipIstekler.map(t => istekGoster(t))}</ul>
            : <p className={`mt-2 text-[12px] ${IKINCIL}`}>Ajansta bekleyen isteğin yok.</p>}
        </section>
      )}

      {/* Galeri görselleri: indirip eklemesi kendi kartında (görselleri tek tek çeker) */}

      {(suzgec === 'hepsi' || suzgec === 'eksikler') && <EksikOzeti eksikler={eksikler} dugmeler={dugmeler} onAc={onEksikler} />}
    </div>
  );
};

export default OnayBekleyenler;
