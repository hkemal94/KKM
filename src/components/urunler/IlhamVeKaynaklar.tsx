import React, { useMemo, useRef, useState } from 'react';
import { Bot, ExternalLink, Image as ImageIcon, Link2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import type { Item } from '../../types';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { KisaListe } from '../kabuk/KisaListe';
import { GorselImg } from '../GorselImg';
import { gorselSil, gorselYaz } from '../../lib/gorselDeposu';
import { basvurulari } from '../../lib/gorselBasvuru';
import { compressImageBase64, compressPngKeepAlpha, dosyayiOku } from '../../lib/imageCompressor';
import { ayrilmayaIzinVar, useKaydedilmemis } from '../../lib/kaydedilmemis';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { istekEkle } from '../../lib/kemalIstekleri';
import {
  BAG_GRUBU_ADI, ILHAM_TURU_ADI, alanAdi, bagGrubu, bagHedefleri, baglantiDuzelt, etiketleriAyir,
  ilhamBasligi, ilhamBilgisi, ilhamlar as ilhamlariAl, pinterestMi, tamamlatmaIstegi,
  type BagGrubu, type IlhamTuru
} from '../../lib/ilhamlar';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Ürünler → İlham ve kaynaklar (3 Kasım, Kemal: "kaynaklarımı ve
 * ilhamlarımı madde madde, marka, ürün gibi köprüleyebileceğim ekran").
 * Bağlantı yapıştır, görsel yükle ya da not yaz; türü (ilham / kaynak),
 * yönelimi (etiket) seç; viki maddesine, markaya, drop ve ürüne bağla.
 * Bağlama Galeri'deki "Bir kayda bağla" kalıbıyla (kayıt seç listesi) yapılır,
 * ama görsel hedefe kopyalanmaz: bağ yalnız ilham kaydında durur.
 *
 * Kayıt yalnız "Kaydet"e basınca yazılır. Görsel de o an görsel deposuna
 * (`users/{uid}/gorseller`) girer; kayıtta `gorsel:<id>` kalır.
 * "Ajana ilham tamamlat" Merch Konseptçisi'ne istek gönderir (ajansın
 * deposuna); kayda hiçbir şey yazmaz, sonuç Onay bekleyenler'e düşer.
 */

// Galeri ile aynı sınır: görsel başına en çok 350 KB
const AZAMI_BAYT = 350_000;
const kabaBoyut = (d: string) => { const i = d.indexOf(','); return i < 0 ? d.length : Math.floor((d.length - i - 1) * 0.75); };

const GIRDI = `w-full text-[13px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-[#F26B6F]`;
const CIP = (secili: boolean) => `min-h-9 lg:min-h-0 px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition-colors ${secili
  ? 'border-[#F26B6F] text-[#F26B6F]'
  : 'border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#F26B6F]'}`;

const PinterestRozeti: React.FC = () => (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#F26B6F] text-white">Pinterest</span>
);

interface Taslak {
  baglanti: string;
  not: string;
  tur: IlhamTuru;
  etiketler: string;
  /** Kayıttaki görsel (başvuru) ya da yeni seçilen (data:) */
  gorsel: string;
  baglar: string[];
}

const BOS: Taslak = { baglanti: '', not: '', tur: 'ilham', etiketler: '', gorsel: '', baglar: [] };

function taslakYap(i: Item): Taslak {
  const b = ilhamBilgisi(i);
  return { baglanti: b.baglanti, not: i.notes || '', tur: b.tur, etiketler: (i.tags || []).join(', '), gorsel: i.images?.[0] || '', baglar: b.baglar };
}

const ayni = (a: Taslak, b: Taslak) => a.baglanti === b.baglanti && a.not === b.not && a.tur === b.tur
  && a.etiketler === b.etiketler && a.gorsel === b.gorsel && a.baglar.join('|') === b.baglar.join('|');

/** Ekle ve ayrıntı ekranının ortak formu */
const IlhamFormu: React.FC<{
  ilk: Taslak;
  items: Item[];
  hedefler: Item[];
  kaydediliyor: boolean;
  onKaydet: (t: Taslak) => void;
  onVazgec: () => void;
  onMaddeAc?: (id: string) => void;
  ekDugmeler?: React.ReactNode;
}> = ({ ilk, items, hedefler, kaydediliyor, onKaydet, onVazgec, onMaddeAc, ekDugmeler }) => {
  const [t, setT] = useState<Taslak>(ilk);
  const [gorselNotu, setGorselNotu] = useState<string | null>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const girdi = useRef<HTMLInputElement | null>(null);
  const degisti = !ayni(t, ilk);
  useKaydedilmemis(degisti);

  const gruplu = useMemo(() => {
    const g: Record<BagGrubu, Item[]> = { marka: [], urun: [], madde: [] };
    for (const h of hedefler) { const k = bagGrubu(h.type); if (k && !t.baglar.includes(h.id)) g[k].push(h); }
    return g;
  }, [hedefler, t.baglar]);

  const gorselSec = async (dosya: File | undefined) => {
    if (!dosya) return;
    setGorselNotu(null);
    if (!dosya.type.startsWith('image/')) { setGorselNotu(`${dosya.name}: görsel değil`); return; }
    setOkunuyor(true);
    try {
      const ham = await dosyayiOku(dosya);
      let kucuk = dosya.type === 'image/png' ? await compressPngKeepAlpha(ham) : await compressImageBase64(ham);
      if (kabaBoyut(kucuk) > AZAMI_BAYT) kucuk = await compressImageBase64(ham, 900, 900, 0.7);
      if (kabaBoyut(kucuk) > AZAMI_BAYT) { setGorselNotu(`${dosya.name}: çok büyük, alınmadı`); return; }
      setT(s => ({ ...s, gorsel: kucuk }));
    } catch (e) {
      setGorselNotu(`Görsel okunamadı: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
    } finally {
      setOkunuyor(false);
      if (girdi.current) girdi.current.value = '';
    }
  };

  const adres = baglantiDuzelt(t.baglanti);
  const bos = !t.not.trim() && !adres && !t.gorsel;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        {/* Görsel */}
        <div className="space-y-1.5">
          <div className="w-full aspect-square rounded-xl overflow-hidden border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#F3EFE8] flex items-center justify-center">
            {t.gorsel
              ? <GorselImg src={t.gorsel} alt="" className="w-full h-full object-contain" />
              : <ImageIcon className="w-6 h-6 text-[#CFC5B4]" />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => girdi.current?.click()} disabled={okunuyor} className={DUGME_BOS}>
              <Upload className="w-3.5 h-3.5" /> {okunuyor ? 'Okunuyor…' : t.gorsel ? 'Değiştir' : 'Görsel yükle'}
            </button>
            {t.gorsel && (
              <button type="button" onClick={() => setT(s => ({ ...s, gorsel: '' }))} className={DUGME_BOS} aria-label="Görseli kaldır">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input ref={girdi} type="file" accept="image/*" className="hidden" onChange={e => void gorselSec(e.target.files?.[0])} />
          {gorselNotu && <p className="text-[11px] text-[#F26B6F]">{gorselNotu}</p>}
        </div>

        <div className="space-y-2.5">
          <label className="block">
            <span className={ETIKET}>Bağlantı</span>
            <input value={t.baglanti} onChange={e => setT(s => ({ ...s, baglanti: e.target.value }))}
              placeholder="Bağlantıyı yapıştır (isteğe bağlı)" inputMode="url" className={`${GIRDI} mt-1`} />
            {adres && (
              <span className={`mt-1 flex items-center gap-1.5 text-[11px] ${IKINCIL}`}>
                {pinterestMi(adres) && <PinterestRozeti />}
                <a href={adres} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[#F26B6F]">
                  {alanAdi(adres)} <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            )}
          </label>
          <label className="block">
            <span className={ETIKET}>Kısa not</span>
            <textarea rows={3} value={t.not} onChange={e => setT(s => ({ ...s, not: e.target.value }))}
              placeholder="Neyi sevdin, nerede kullanırsın? İlk satır kartın başlığı olur." className={`${GIRDI} mt-1`} />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={ETIKET}>Tür</span>
            {(Object.keys(ILHAM_TURU_ADI) as IlhamTuru[]).map(k => (
              <button key={k} type="button" onClick={() => setT(s => ({ ...s, tur: k }))} className={CIP(t.tur === k)}>{ILHAM_TURU_ADI[k]}</button>
            ))}
          </div>
          <label className="block">
            <span className={ETIKET}>Etiket / yönelim</span>
            <input value={t.etiketler} onChange={e => setT(s => ({ ...s, etiketler: e.target.value }))}
              placeholder="Virgülle ayır: Basics, Varsity & Preppy, Lokal" className={`${GIRDI} mt-1`} />
          </label>
        </div>
      </div>

      {/* Bağlar: Galeri'deki "Bir kayda bağla" kalıbı */}
      <div className="space-y-1.5">
        <span className={ETIKET}>Bağlar · viki maddesi, marka, drop ve ürün</span>
        {t.baglar.length > 0 && (
          <KisaListe className="flex flex-wrap gap-1.5" dugmeClassName="mt-1">
            {t.baglar.map(id => {
              const k = items.find(i => i.id === id);
              return (
                <li key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px]">
                  {k && onMaddeAc
                    ? <button type="button" onClick={() => onMaddeAc(id)} className={`${YAZI} hover:text-[#F26B6F] cursor-pointer`}>{k.title}</button>
                    : <span className={k ? YAZI : IKINCIL}>{k ? k.title : 'silinmiş kayıt'}</span>}
                  {k && <span className={`text-[9px] ${IKINCIL}`}>{BAG_GRUBU_ADI[bagGrubu(k.type) || 'madde']}</span>}
                  <button type="button" onClick={() => setT(s => ({ ...s, baglar: s.baglar.filter(x => x !== id) }))}
                    aria-label="Bağı kaldır" className={`p-1 rounded-full ${IKINCIL} hover:text-[#F26B6F] cursor-pointer`}>
                    <X className="w-3 h-3" />
                  </button>
                </li>
              );
            })}
          </KisaListe>
        )}
        <select value="" onChange={e => { const v = e.target.value; if (v) setT(s => ({ ...s, baglar: [...s.baglar, v] })); }}
          aria-label="Bir kayda bağla" className={`${GIRDI} sm:max-w-sm`}>
          <option value="">Bağla: kayıt seç…</option>
          {(Object.keys(BAG_GRUBU_ADI) as BagGrubu[]).map(g => gruplu[g].length > 0 && (
            <optgroup key={g} label={BAG_GRUBU_ADI[g]}>
              {gruplu[g].map(h => <option key={h.id} value={h.id}>{h.title}{h.archived ? ' (arşiv)' : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {ekDugmeler}
        <button type="button" onClick={onVazgec} className={`${DUGME_BOS} ml-auto`}>Vazgeç</button>
        <button type="button" disabled={kaydediliyor || okunuyor || bos || !degisti} onClick={() => onKaydet({ ...t, baglanti: adres })} className={DUGME_LAC}>
          <Save className="w-3.5 h-3.5" /> {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
      {bos && <p className={`text-[11px] ${IKINCIL}`}>Kaydetmek için bağlantı, görsel ya da not gerekir.</p>}
    </div>
  );
};

export interface IlhamVeKaynaklarProps {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  /** Bağlı kaydı açar (marka, madde, drop, ürün) */
  onMaddeAc?: (id: string) => void;
}

export default function IlhamVeKaynaklar({ items, onAddItem, onUpdateItem, onDeleteItem, onMaddeAc }: IlhamVeKaynaklarProps) {
  const [ekleAcik, setEkleAcik] = useState(false);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);
  const [turSuzgeci, setTurSuzgeci] = useState<IlhamTuru | 'hepsi'>('hepsi');
  const [etiketSuzgeci, setEtiketSuzgeci] = useState<string | null>(null);
  const [markaSuzgeci, setMarkaSuzgeci] = useState('');
  const [istekGidiyor, setIstekGidiyor] = useState(false);
  const [istekMesaji, setIstekMesaji] = useState<string | null>(null);

  const hepsi = useMemo(() => ilhamlariAl(items), [items]);
  const hedefler = useMemo(() => bagHedefleri(items), [items]);
  const secili = seciliId ? hepsi.find(i => i.id === seciliId) ?? null : null;

  const etiketler = useMemo(() => {
    const say = new Map<string, number>();
    for (const i of hepsi) for (const e of i.tags || []) say.set(e, (say.get(e) || 0) + 1);
    return [...say.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [hepsi]);

  /** Süzgeçte yalnız ilhamı olan markalar */
  const bagliMarkalar = useMemo(() => {
    const idler = new Set(hepsi.flatMap(i => ilhamBilgisi(i).baglar));
    return items.filter(i => idler.has(i.id) && bagGrubu(i.type) === 'marka').sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  }, [hepsi, items]);

  const suzulmus = useMemo(() => hepsi.filter(i => {
    const b = ilhamBilgisi(i);
    if (turSuzgeci !== 'hepsi' && b.tur !== turSuzgeci) return false;
    if (etiketSuzgeci && !(i.tags || []).includes(etiketSuzgeci)) return false;
    if (markaSuzgeci && !b.baglar.includes(markaSuzgeci)) return false;
    return true;
  }), [hepsi, turSuzgeci, etiketSuzgeci, markaSuzgeci]);

  /** Yeni seçilen görsel (data:) depoya yazılır; olmazsa Galeri gibi kaydın içine konur */
  const gorseliYaz = async (gorsel: string): Promise<{ deger: string; yeniRef: string | null }> => {
    if (!gorsel.startsWith('data:')) return { deger: gorsel, yeniRef: null };
    try {
      const ref = await gorselYaz(gorsel);
      return { deger: ref, yeniRef: ref };
    } catch (e) {
      console.warn('Görsel belgesi yazılamadı, görsel kaydın içine konuyor:', e);
      return { deger: gorsel, yeniRef: null };
    }
  };

  /** Artık hiçbir kaydın kullanmadığı eski görsel belgesi silinir */
  const eskiGorseliSil = async (eski: string | undefined, haric: string) => {
    if (!eski) return;
    const baskalari = new Set(items.filter(i => i.id !== haric).flatMap(i => basvurulari(i.images)));
    const sil = basvurulari([eski]).filter(r => !baskalari.has(r));
    if (sil.length) { try { await gorselSil(sil); } catch (e) { console.warn('Eski görsel belgesi silinemedi:', e); } }
  };

  const kayitAlanlari = (t: Taslak, gorsel: string) => {
    const etiket = etiketleriAyir(t.etiketler);
    return {
      title: ilhamBasligi(t.not, t.baglanti, gorsel ? 'Görsel' : 'İlham'),
      notes: t.not.trim(),
      tags: etiket,
      images: gorsel ? [gorsel] : [],
      metadata: { ilhamTuru: t.tur, baglar: t.baglar, ...(t.baglanti ? { baglanti: t.baglanti } : {}) }
    };
  };

  const yeniKaydet = async (t: Taslak) => {
    setKaydediliyor(true);
    setRapor(null);
    let yeniRef: string | null = null;
    try {
      const g = await gorseliYaz(t.gorsel);
      yeniRef = g.yeniRef;
      await onAddItem({
        area: 'ilham', type: 'ilham_madde', status: 'Fikir', priority: 'orta', links: [],
        isProposal: false, archived: false, ...kayitAlanlari(t, g.deger)
      });
      setEkleAcik(false);
      setRapor('Kaydedildi.');
    } catch (e) {
      if (yeniRef) void gorselSil([yeniRef]).catch(() => {});
      setRapor(`Kaydedilemedi: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
    } finally { setKaydediliyor(false); }
  };

  const duzenleKaydet = async (k: Item, t: Taslak) => {
    setKaydediliyor(true);
    setRapor(null);
    let yeniRef: string | null = null;
    try {
      const g = await gorseliYaz(t.gorsel);
      yeniRef = g.yeniRef;
      const eski = k.images?.[0];
      // metadata baştan yazılır: boşaltılan bağlantı alanı kayıttan çıksın
      const { baglanti: _b, ilhamTuru: _t, baglar: _g, ...kalan } = (k.metadata || {}) as Record<string, unknown>;
      const alanlar = kayitAlanlari(t, g.deger);
      await onUpdateItem({ ...k, ...alanlar, metadata: { ...kalan, ...alanlar.metadata }, updatedAt: Date.now() });
      if (eski && eski !== g.deger) await eskiGorseliSil(eski, k.id);
      setSeciliId(null);
      setRapor('Kaydedildi.');
    } catch (e) {
      if (yeniRef) void gorselSil([yeniRef]).catch(() => {});
      setRapor(`Kaydedilemedi: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
    } finally { setKaydediliyor(false); }
  };

  const sil = async (k: Item) => {
    if (!window.confirm(`"${k.title}" silinsin mi? Görseli de silinir.`)) return;
    setKaydediliyor(true);
    try {
      // Görsel belgesini App siler (Galeri kaydındaki gibi)
      await onDeleteItem(k.id);
      setSeciliId(null);
      setRapor('Silindi.');
    } catch (e) {
      setRapor(`Silinemedi: ${e instanceof Error ? e.message : 'bilinmeyen'}`);
    } finally { setKaydediliyor(false); }
  };

  /** Kaydedilmemiş değişiklik varsa sorup kapatır */
  const ayrintiyiKapat = () => { if (ayrilmayaIzinVar()) setSeciliId(null); };
  const ekleyiKapat = () => { if (ayrilmayaIzinVar()) setEkleAcik(false); };

  const anahtar = anahtariOku();
  const tamamlat = async () => {
    if (!anahtar) return;
    setIstekGidiyor(true);
    setIstekMesaji(null);
    try {
      const metin = tamamlatmaIstegi(etiketSuzgeci ? [etiketSuzgeci] : [], suzulmus);
      await istekEkle(anahtar, { tur: 'istek', metin, ekran: 'ilham', ajan: 'merch-konseptcisi' });
      setIstekMesaji(`Gönderildi${etiketSuzgeci ? ` (${etiketSuzgeci})` : ''}. Merch Konseptçisi bağlantılı adaylar hazırlar; sonuç Onay bekleyenler'e düşer, buraya sen eklersin.`);
    } catch (e) {
      setIstekMesaji(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}. Tekrar dene.`);
    } finally { setIstekGidiyor(false); }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <SayfaBasi baslik="İlham ve kaynaklar">
        <button type="button" onClick={() => void tamamlat()} disabled={!anahtar || istekGidiyor} className={DUGME_BOS}
          title={anahtar ? 'Seçili yönelim için eksik ilhamları ajana tamamlat' : "GitHub anahtarı yok: Ajanlar ve otomasyonlar → Ajans bağlantısı'nda girilir"}>
          <Bot className="w-3.5 h-3.5" /> {istekGidiyor ? 'Gönderiliyor…' : 'Ajana ilham tamamlat'}
        </button>
        {!ekleAcik && (
          <button type="button" onClick={() => { setEkleAcik(true); setRapor(null); }} className={DUGME_LAC}>
            <Plus className="w-3.5 h-3.5" /> Ekle
          </button>
        )}
      </SayfaBasi>

      {istekMesaji && <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{istekMesaji}</p>}
      {!anahtar && <p className={`text-[11px] ${IKINCIL}`}>"Ajana ilham tamamlat" için bu tarayıcıda GitHub anahtarı gerekir (Ajanlar ve otomasyonlar → Ajans bağlantısı).</p>}

      {ekleAcik && (
        <section className={`${KART} p-4 space-y-2`}>
          <p className={`text-[13px] font-semibold ${YAZI}`}>Yeni ilham ya da kaynak</p>
          <p className={`text-[11px] ${IKINCIL}`}>Bağlantı yapıştır, görsel yükle ya da yalnız not yaz. Pinterest panosu gerekmez.</p>
          <IlhamFormu ilk={BOS} items={items} hedefler={hedefler} kaydediliyor={kaydediliyor}
            onKaydet={t => void yeniKaydet(t)} onVazgec={ekleyiKapat} />
        </section>
      )}

      {rapor && <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{rapor}</p>}

      {/* Süzgeç */}
      {hepsi.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setTurSuzgeci('hepsi')} className={CIP(turSuzgeci === 'hepsi')}>Hepsi ({hepsi.length})</button>
            {(Object.keys(ILHAM_TURU_ADI) as IlhamTuru[]).map(k => {
              const n = hepsi.filter(i => ilhamBilgisi(i).tur === k).length;
              return n ? <button key={k} type="button" onClick={() => setTurSuzgeci(k)} className={CIP(turSuzgeci === k)}>{ILHAM_TURU_ADI[k]} ({n})</button> : null;
            })}
            {bagliMarkalar.length > 0 && (
              <select value={markaSuzgeci} onChange={e => setMarkaSuzgeci(e.target.value)} aria-label="Bağlı marka"
                className={`min-h-9 lg:min-h-0 ml-auto px-2 py-1 rounded-lg text-[12px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72]`}>
                <option value="">Bütün markalar</option>
                {bagliMarkalar.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}
          </div>
          {etiketler.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={ETIKET}>Yönelim</span>
              <KisaListe as="div" className="contents" sinir={12}>
                {etiketler.map(([e, n]) => (
                  <button key={e} type="button" onClick={() => setEtiketSuzgeci(s => (s === e ? null : e))} className={CIP(etiketSuzgeci === e)}>{e} ({n})</button>
                ))}
              </KisaListe>
            </div>
          )}
        </div>
      )}

      {/* Izgara */}
      {suzulmus.length === 0 ? (
        <div className={`${KART} flex items-center gap-2.5 px-4 py-6`}>
          <Link2 className="w-4 h-4 text-[#CFC5B4] shrink-0" />
          <p className={`text-[13px] ${IKINCIL}`}>
            {hepsi.length ? 'Bu süzgece uyan kayıt yok.' : 'Henüz ilham ya da kaynak yok. "Ekle" ile bağlantı, görsel ya da not kaydedebilirsin.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {suzulmus.map(k => {
            const b = ilhamBilgisi(k);
            const bagSayisi = b.baglar.filter(id => items.some(i => i.id === id)).length;
            return (
              <button key={k.id} type="button" onClick={() => { setSeciliId(k.id); setRapor(null); }}
                className={`${KART} overflow-hidden text-left cursor-pointer hover:border-[#F26B6F] transition-colors`}>
                <div className="relative bg-[#F3EFE8] flex items-center justify-center" style={{ height: 150 }}>
                  {k.images?.[0]
                    ? <GorselImg src={k.images[0]} alt={k.title} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="px-3 text-center text-[12px] text-[#6A5E4C]">{b.baglanti ? alanAdi(b.baglanti) : 'Not'}</span>}
                  {b.baglanti && pinterestMi(b.baglanti) && <span className="absolute top-2 left-2"><PinterestRozeti /></span>}
                </div>
                <div className="px-3 py-2 border-t border-[#CFC5B4]/60 dark:border-[#2C3C72] space-y-0.5">
                  <p className={`text-[12px] font-semibold truncate ${YAZI}`}>{k.title}</p>
                  <p className={`text-[10px] truncate ${IKINCIL}`}>
                    {ILHAM_TURU_ADI[b.tur]}
                    {(k.tags || []).length ? ` · ${(k.tags || []).join(', ')}` : ''}
                    {bagSayisi ? ` · ${bagSayisi} bağ` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Ayrıntı */}
      {secili && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/50 overflow-y-auto" onClick={ayrintiyiKapat}>
          <div className={`${KART} max-w-2xl w-full p-4 my-4 space-y-3`} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-semibold truncate ${YAZI}`}>{secili.title}</p>
                <p className={`text-[11px] ${IKINCIL}`}>{ILHAM_TURU_ADI[ilhamBilgisi(secili).tur]} · Değiştir, bağla, sonra Kaydet</p>
              </div>
              <button type="button" onClick={ayrintiyiKapat} aria-label="Kapat" className={`p-1.5 rounded-lg cursor-pointer ${IKINCIL} hover:text-[#F26B6F]`}><X className="w-4 h-4" /></button>
            </div>
            <IlhamFormu key={secili.id} ilk={taslakYap(secili)} items={items} hedefler={hedefler} kaydediliyor={kaydediliyor}
              onKaydet={t => void duzenleKaydet(secili, t)} onVazgec={ayrintiyiKapat}
              onMaddeAc={onMaddeAc ? id => { if (!ayrilmayaIzinVar()) return; setSeciliId(null); onMaddeAc(id); } : undefined}
              ekDugmeler={
                <button type="button" onClick={() => void sil(secili)} disabled={kaydediliyor} className={DUGME_BOS}>
                  <Trash2 className="w-3.5 h-3.5" /> Sil
                </button>
              } />
          </div>
        </div>
      )}
    </div>
  );
}
