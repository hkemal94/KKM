import React, { useMemo, useState } from 'react';
import { Archive, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Pencil, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import type { Item } from '../../types';
import { bekleyenAdaylar } from '../../lib/adaylar';
import { eksikleriCikar } from '../../lib/eksikler';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { tepsiDosyasi, tepsiyiGonder } from '../../lib/tepsiAjansa';
import {
  HAZIR_SECENEKLER, bugun, gorunum, gunEkle, onayKayitlari, onaylariYaz, oneriAnahtari, tarihYaz,
  type Gorunum, type OnayKaydi
} from '../../lib/onaylar';
import { useBekleyenIsler } from '../anasayfa/BekleyenIsler';
import { GaleriYedegiKarti } from '../GaleriYedegiKarti';
import { EksikOzeti } from '../anasayfa/EksikOzeti';
import { ISLEM_ADI, useAjansKararlari } from '../anasayfa/AjansKararlariKarti';
import { oneriTuru, useOneriIslemleri } from '../studyo/OneriTepsisi';
import type { StudyoIslemleri } from '../studyo/StudyoBaglami';
import { DUGME_BOS, DUGME_LAC, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';

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
 */

type Suzgec = 'hepsi' | 'isler' | 'oneriler' | 'kararlar' | 'bekletilen' | 'arsiv' | 'eksikler';
type Kaynak = 'is' | 'oneri' | 'karar';

interface Satir {
  anahtar: string;
  kaynak: Kaynak;
  etiket: string;
  baslik: string;
  /** Sıralama için (ms); tek seferlik işlerde şimdi */
  zaman: number;
  zamanYazi?: string;
  govde: React.ReactNode;
  /** Uygula; seçim gerektiren öneride null (seçim gövdede) */
  uygula: { ad: string; calistir: () => Promise<void> } | null;
  /** Sil: öneride kaydı siler; işte ve kararda satırı listeden kalıcı kaldırır */
  sil: () => Promise<void>;
  silAciklama: string;
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

const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e));
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
  const kararlar = useAjansKararlari({ items, anahtar: anahtar || '', tur, onUpdateItem, onDeleteItem });
  const kayitlar = useMemo(() => onayKayitlari(items), [items]);
  const adaylar = useMemo(() => bekleyenAdaylar(items), [items]);
  const eksikler = useMemo(() => eksikleriCikar(items), [items]);
  const eksikSayisi = eksikler.reduce((t, e) => t + e.sayi, 0);
  const gun = bugun();

  // ---------------------------------------------------------------- onay bilgisi yazma

  /** Onay bilgilerini kkm_ayar'a yazar; silinmiş önerilerin eski bilgisi düşer */
  const yaz = async (degisim: Record<string, OnayKaydi | null>) => {
    const adayVar = new Set(adaylar.map(a => oneriAnahtari(a.id)));
    const r = onaylariYaz(items, degisim, k => !k.startsWith('oneri:') || adayVar.has(k));
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
        govde: <p className={`text-[12px] leading-snug ${IKINCIL}`}>{isler.raporlar[is.id] ?? is.aciklama}</p>,
        uygula: { ad: 'Yap', calistir: async () => { await isler.calistir(is); } },
        sil: async () => { await yaz({ [`is:${is.id}:${is.ad}`]: { durum: 'silindi', zaman: Date.now() } }); },
        silAciklama: 'İş listeden kalkar; iş değişirse (sayısı artarsa) yeniden görünür. Kayıtlara dokunulmaz.'
      });
    }

    for (const a of adaylar) {
      liste.push({
        anahtar: oneriAnahtari(a.id), kaynak: 'oneri', etiket: oneriTuru(a), baslik: a.title,
        zaman: a.createdAt, zamanYazi: neZaman(a.createdAt),
        govde: oneri.govde(a, true),
        uygula: oneri.uygula(a),
        sil: async () => { await oneri.sil(a); },
        silAciklama: 'Öneri silinir, geri gelmez. Hiçbir maddeye dokunulmaz.'
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
                  {i.tur === 'alaniDegistir' && <> → <b>{i.alan}: {i.eski ? `${i.eski} → ` : ''}{i.deger}</b></>}
                  {(i.tur === 'takmaAdSil' || i.tur === 'metindenSil') && <> → <b className="line-through">{i.tur === 'takmaAdSil' ? i.deger : i.eski}</b></>}
                  {i.tur === 'bagKur' && <> → <b>{i.kaynak} · {i.bag} · {i.hedef}{i.ikiYonlu ? ' (iki tarafta)' : ''}</b></>}
                  <span className={`block text-[11px] ${IKINCIL}`}>{i.neden}</span>
                </li>
              ))}
            </ul>
          </>
        ),
        uygula: { ad: 'Uygula', calistir: kararlar.uygula },
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
  const say = (k: Kaynak) => listede.filter(s => s.kaynak === k).length || undefined;

  const gorunen = suzgec === 'bekletilen' ? bekletilen
    : suzgec === 'arsiv' ? arsivde
    : suzgec === 'eksikler' ? []
    : suzgec === 'hepsi' ? listede
    : listede.filter(s => s.kaynak === ({ isler: 'is', oneriler: 'oneri', kararlar: 'karar' } as const)[suzgec]);
  const listeGorunumu = suzgec !== 'bekletilen' && suzgec !== 'arsiv';
  const seciliSatirlar = gorunen.filter(s => secili.has(s.anahtar));

  const SUZGECLER: Array<{ id: Suzgec; ad: string; sayi?: number }> = [
    { id: 'hepsi', ad: 'Hepsi', sayi: listede.length || undefined },
    { id: 'isler', ad: 'Tek seferlik işler', sayi: say('is') },
    { id: 'oneriler', ad: 'Öneriler', sayi: say('oneri') },
    { id: 'kararlar', ad: 'Ajansın kararları', sayi: say('karar') },
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
      setMesaj(`Olmadı: ${hataYazi(e)}. Tekrar basabilirsin.`);
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
    if (kayitlar[s.anahtar]) await yaz({ [s.anahtar]: null });
    setPanel(null);
    return s.kaynak === 'oneri' ? undefined : `${s.baslik}: yapıldı.`;
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

  const duzenle = (s: Satir) => calistir(s.anahtar, async () => {
    if (!not.trim() && !secenekler.length) throw new Error('bir not yaz ya da bir seçenek seç');
    const r = await yaz({ [s.anahtar]: { durum: 'duzenle', not, secenekler, zaman: Date.now() } });
    setPanel(null);
    if (!anahtar) return 'Not kaydedildi. Bu tarayıcıda GitHub anahtarı olmadığı için ajansa gitmedi; Durum → Ajans\'ta anahtar girince "Tepsiyi ajansa gönder" ile gider.';
    try {
      await tepsiyiGonder(anahtar, tepsiDosyasi(yazilmisItems(r)));
      return 'Not kaydedildi ve tepsiyle ajansa gitti. Ajans bir sonraki çalışmasında notuna göre revize eder.';
    } catch (e) {
      return `Not kaydedildi ama ajansa gönderilemedi (${hataYazi(e)}). Durum → Ajans → "Tepsiyi ajansa gönder"le yeniden dene.`;
    }
  });

  const topluUygula = () => calistir('toplu', async () => {
    let oldu = 0, olmadi = 0;
    const secimli = seciliSatirlar.filter(s => !s.uygula).length;
    const temizle: Record<string, null> = {};
    for (const s of seciliSatirlar) {
      if (!s.uygula) continue;
      try {
        await s.uygula.calistir();
        oldu++;
        if (kayitlar[s.anahtar]) temizle[s.anahtar] = null;
      } catch { olmadi++; }
    }
    if (Object.keys(temizle).length) await yaz(temizle);
    setSecili(new Set());
    return [`${oldu} satır uygulandı`, olmadi ? `${olmadi} olmadı (tek tek dene)` : '', secimli ? `${secimli} öneri seçim istediği için atlandı (açıp içinden seç)` : '']
      .filter(Boolean).join(', ') + '.';
  });

  const sec = (k: string) => setSecili(x => { const y = new Set(x); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  const hepsiSecili = gorunen.length > 0 && gorunen.every(s => secili.has(s.anahtar));

  // ---------------------------------------------------------------- görünüm

  const satirGoster = (s: Satir) => {
    const buAcik = acik === s.anahtar;
    const k = kayitlar[s.anahtar];
    const bu = calisan === s.anahtar;
    const mesgul = !!calisan;
    const p = panel?.anahtar === s.anahtar ? panel.tur : null;
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
            <span className={`flex-1 min-w-0 truncate text-[13px] ${YAZI}`}>{s.baslik}</span>
            {k?.durum === 'duzenle' && <Pencil className="w-3.5 h-3.5 shrink-0 text-[#F26B6F]" aria-label="Düzenleme notu var" />}
            {suzgec === 'bekletilen' && k?.tarih && <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{tarihYaz(k.tarih)}</span>}
            {suzgec !== 'bekletilen' && s.zamanYazi && <span className={`shrink-0 text-[10px] ${IKINCIL}`}>{s.zamanYazi}</span>}
            {buAcik ? <ChevronDown className="w-4 h-4 text-[#F26B6F] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#CFC5B4] shrink-0" />}
          </button>
        </div>

        {buAcik && (
          <div className="pb-3 space-y-2">
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

  const kararlarGorunur = suzgec === 'hepsi' || suzgec === 'kararlar';
  const d = kararlar.dosya;

  return (
    <div className="space-y-3 lg:space-y-4 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`font-bold tracking-tight leading-tight text-[20px] lg:text-[28px] ${YAZI}`}>Onay bekleyenler</h1>
          <p className={`mt-1 text-[13px] ${IKINCIL}`}>Kararını bekleyen her şey burada. Sen basmadan hiçbir kayıt değişmez.</p>
        </div>
        <button type="button" onClick={() => setTur(t => t + 1)} className={`${DUGME_BOS} shrink-0`} title="Ajansın kararlarını yeniden oku">
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
            <p className={`text-[12px] ${IKINCIL}`}>Bu tarayıcıda GitHub anahtarı yok; ajansın kararları okunamıyor. Anahtar Durum → Ajans sayfasında bir kez girilir.</p>
            <button type="button" onClick={onAjans} className={DUGME_BOS}>Durum → Ajans</button>
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
        ) : d && typeof d === 'object' && 'hata' in d ? (
          <p className={`${KART} p-4 text-[12px] ${YAZI}`}>
            Ajansın kararları okunamadı ({d.hata}). <button type="button" onClick={onAjans} className="underline cursor-pointer">Durum → Ajans</button>
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
              {seciliSatirlar.length > 0 && (
                <span className="ml-auto flex flex-wrap gap-2">
                  <button type="button" disabled={!!calisan} onClick={() => void topluUygula()} className={DUGME_LAC}>
                    <Check className="w-3.5 h-3.5" /> {calisan === 'toplu' ? 'Uygulanıyor…' : 'Seçilenleri uygula'}
                  </button>
                  <button type="button" disabled={!!calisan} onClick={() => void arsivle(seciliSatirlar)} className={DUGME_BOS}>
                    <Archive className="w-3.5 h-3.5" /> Seçilenleri arşivle
                  </button>
                </span>
              )}
            </div>
          )}
          {suzgec === 'bekletilen' && <p className={`pb-2 text-[12px] ${IKINCIL}`}>Tarihi gelen kendiliğinden listeye döner.</p>}
          {suzgec === 'arsiv' && <p className={`pb-2 text-[12px] ${IKINCIL}`}>Arşivdekiler bekler; "Listeye geri al" deyince yeniden onayına gelir.</p>}
          {gorunen.length ? <ul>{gorunen.map(satirGoster)}</ul> : (
            <p className={`text-[12px] ${IKINCIL}`}>
              {suzgec === 'bekletilen' ? 'Bekletilen yok.' : suzgec === 'arsiv' ? 'Arşiv boş.' : 'Onayını bekleyen bir şey yok.'}
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

      {/* Galeri görselleri: indirip eklemesi kendi kartında (görselleri tek tek çeker) */}
      {(suzgec === 'hepsi' || suzgec === 'isler') && isler.galeri.length > 0 && <GaleriYedegiKarti items={items} onAddItem={onAddItem} />}

      {(suzgec === 'hepsi' || suzgec === 'eksikler') && <EksikOzeti eksikler={eksikler} dugmeler={dugmeler} onAc={onEksikler} />}
    </div>
  );
};

export default OnayBekleyenler;
