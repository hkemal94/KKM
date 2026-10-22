import React, { useEffect, useMemo, useState } from 'react';
import { SayfaBasi } from '../kabuk/SayfaBasi';
import { Globe, ExternalLink, X, Eye, EyeOff, Send, Save, Image as ImageIcon } from 'lucide-react';
import type { Item } from '../../types';
import { GorselImg } from '../GorselImg';
import { maddeninSayfasi, sitedekiMaddeler, TASLAK_ONIZLEME_ANAHTARI } from './siteOrtak';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';
import { siteHatasiniSadelestir } from '../../lib/siteHatasi';
import { StudyodaAc } from '../studyo/StudyodaAc';
import {
  SITE_SAYFALARI, ayniMi, siteAyariniYaz, siteKaydi, taslakAyar, yayindakiAyar, type SiteAyari
} from '../../lib/siteAyari';

type Sekme = 'sayfalar' | 'hakkinda' | 'iletisim' | 'maddeler';
const SEKMELER: { id: Sekme; ad: string }[] = [
  { id: 'sayfalar', ad: 'Sayfalar' },
  { id: 'hakkinda', ad: 'Hakkında' },
  { id: 'iletisim', ad: 'İletişim' },
  { id: 'maddeler', ad: 'Maddeler' }
];

/**
 * Site (KKM tarafı, 29 Eylül gece). Kemal: "Sitede görünenler listesi olsun."
 * Burası yalnız Kemal'in; ziyaretçinin gördüğü sitede böyle düğmeler yok.
 * Maddeyi siteye viki sayfasındaki "sitede göster" ekler; buradan kaldırılır.
 */

const EKLENEBILIR_TUR: Record<string, string> = {
  drop: 'Drop · Ürünler', merch_urun: 'Ürün · Ürünler', blog_post: 'Yazı · Haberler', channel: 'Hesap · İletişim'
};

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onOnizleme: () => void;
  onMaddeyiAc: (item: Item) => void;
  /** Google ile bağlı mı; değilse kayıt yazılamaz ve "Yayınlandı" denmez */
  oturumVar: boolean;
}

export const SiteYonetimi: React.FC<Props> = ({ items, onUpdateItem, onAddItem, onOnizleme, onMaddeyiAc, oturumVar }) => {
  const [kaldiriliyor, setKaldiriliyor] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>('sayfalar');
  const kayit = siteKaydi(items);
  const kayitliTaslak = useMemo(() => taslakAyar(items), [items]);
  const yayinda = useMemo(() => yayindakiAyar(items), [items]);
  // Ekrandaki düzenleme; "Taslağı kaydet" demeden kayda gitmez
  const [ayar, setAyar] = useState<SiteAyari>(kayitliTaslak);
  const [yaziliyor, setYaziliyor] = useState(false);
  const [gorselSecilen, setGorselSecilen] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  // Stüdyodan "Ekle" gelince (taslak dışarıda değişti) ekran da yenilensin
  const kayitliImza = JSON.stringify(kayitliTaslak);
  useEffect(() => { setAyar(kayitliTaslak); }, [kayitliImza]); // eslint-disable-line react-hooks/exhaustive-deps

  const kaydedilmemis = !ayniMi(ayar, kayitliTaslak);
  const yayinlanmamis = !ayniMi(ayar, yayinda) || !kayit?.metadata?.yayinda;
  const galeri = useMemo(() => items.filter(i => i.type === 'ilham_gorsel' && (i.images || []).length > 0), [items]);
  const kemsKaydi = items.find(i => i.type === 'marka' && !i.archived && /kems/i.test(i.title));

  /** Sayfalar listesinde "sitede · 3 madde" (22 Ekim, site-8); yalnız madde gösteren sayfalar */
  const maddeSayisi = useMemo(() => {
    const s: Record<string, number> = { viki: 0, urunler: 0, haberler: 0 };
    for (const i of sitedekiMaddeler(items)) s[maddeninSayfasi(i)]++;
    return s;
  }, [items]);

  const yaz = async (yayinla: boolean) => {
    setYaziliyor(true); setMesaj(null);
    try {
      if (!oturumVar) throw new Error('oturum-yok');
      const s = siteAyariniYaz(items, ayar, yayinla);
      if (s.guncel) await onUpdateItem(s.guncel);
      if (s.yeni) await onAddItem(s.yeni);
      // Yayından sonra eski taslak kopyası önizlemede takılı kalmasın (22 Ekim, site-6)
      if (yayinla) { try { sessionStorage.removeItem(TASLAK_ONIZLEME_ANAHTARI); } catch { /* yok */ } }
      setMesaj(yayinla ? 'Yayınlandı: site bu hâliyle görünüyor.' : 'Taslak kaydedildi. Sitede henüz görünmüyor.');
    } catch (e) {
      setMesaj(`${yayinla ? 'Yayınlanmadı' : 'Kaydedilemedi'}: ${siteHatasiniSadelestir(e)}`);
    } finally {
      setYaziliyor(false);
    }
  };
  const onizle = (taslak: boolean) => {
    try {
      if (taslak) sessionStorage.setItem(TASLAK_ONIZLEME_ANAHTARI, JSON.stringify(ayar));
      else sessionStorage.removeItem(TASLAK_ONIZLEME_ANAHTARI);
    } catch { /* gizli pencerede olmayabilir */ }
    onOnizleme();
  };
  const sayfaAcik = (id: string) => !ayar.gizli.includes(id);
  const sayfaDegistir = (id: string) => setAyar(a => ({ ...a, gizli: sayfaAcik(id) ? [...a.gizli, id] : a.gizli.filter(x => x !== id) }));
  const gorselSec = (sayfa: string, galeriId: string | null) => {
    setAyar(a => {
      const g = { ...a.gorseller };
      if (galeriId) g[sayfa] = galeriId; else delete g[sayfa];
      return { ...a, gorseller: g };
    });
    setGorselSecilen(null);
  };
  const girdi = `w-full text-[14px] bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-3 py-2 focus:outline-hidden focus:border-[#F26B6F]`;
  const liste = sitedekiMaddeler(items).sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  /**
   * Vikide olmayan ama sitenin sayfalarında yeri olan kayıtlar (30 Eylül):
   * droplar ve ürünler (Ürünler), blog yazıları (Haberler), hesaplar
   * (İletişim). Bunların kendi sayfasında "sitede göster" yok; buradan eklenir.
   */
  const eklenebilir = items.filter(i => !i.archived && !i.isProposal && i.metadata?.sitede !== true
    && EKLENEBILIR_TUR[i.type]).sort((a, b) => a.title.localeCompare(b.title, 'tr'));

  const sitedeYaz = async (i: Item, acik: boolean) => {
    setKaldiriliyor(i.id);
    try {
      // Alanı silmek yetmiyor (kayıt üstüne eklenerek yazılıyor); false yazılır
      await onUpdateItem({ ...i, metadata: { ...(i.metadata || {}), sitede: acik } as Item['metadata'], updatedAt: Date.now() });
    } finally {
      setKaldiriliyor(null);
    }
  };
  const kaldir = (i: Item) => sitedeYaz(i, false);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Sade başlık (1 Ekim, K-1/K-2): telefonda açıklama sıkışıyordu, kalktı */}
      <SayfaBasi baslik="Site">
        <button type="button" onClick={() => onizle(true)} className={`${DUGME_BOS} inline-flex items-center gap-1.5`}>
          <Eye className="w-3.5 h-3.5" /> Taslağı önizle
        </button>
        <button type="button" onClick={() => onizle(false)} className={`${DUGME_BOS} inline-flex items-center gap-1.5`}>
          <ExternalLink className="w-3.5 h-3.5" /> Yayındakini aç
        </button>
      </SayfaBasi>

      {/* taslak / yayın şeridi */}
      <div className={`${KART} p-3 flex flex-wrap items-center gap-2`}>
        <span className={`flex-1 min-w-[200px] text-[12px] ${IKINCIL}`}>
          {kaydedilmemis ? <b className="text-[#D6484C]">Kaydedilmemiş değişiklik var.</b>
            : yayinlanmamis ? <b className={YAZI}>Taslak yayındakinden farklı.</b>
              : 'Taslak ile yayındaki aynı.'}
          {kayit?.metadata?.yayinTarihi ? ` · Son yayın ${neZaman(kayit.metadata.yayinTarihi)}` : ' · Henüz yayınlanmadı'}
        </span>
        <button type="button" disabled={yaziliyor || !kaydedilmemis} onClick={() => void yaz(false)} className={`${DUGME_BOS} inline-flex items-center gap-1.5`}>
          <Save className="w-3.5 h-3.5" /> Taslağı kaydet
        </button>
        <button type="button" disabled={yaziliyor || (!kaydedilmemis && !yayinlanmamis)} onClick={() => void yaz(true)} className={`${DUGME_LAC} inline-flex items-center gap-1.5`}>
          <Send className="w-3.5 h-3.5" /> Yayınla
        </button>
        {mesaj && <span className={`w-full text-[11px] ${IKINCIL}`}>{mesaj}</span>}
      </div>

      {/* sekmeler */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#CFC5B4] dark:border-[#2C3C72]">
        {SEKMELER.map(k => (
          <button key={k.id} type="button" onClick={() => setSekme(k.id)}
            className={`px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px cursor-pointer ${sekme === k.id ? 'border-[#F26B6F] text-[#0E1C4F] dark:text-[#F3EFE8]' : `border-transparent ${IKINCIL} hover:text-[#0E1C4F] dark:hover:text-[#F3EFE8]`}`}>
            {k.ad}
          </button>
        ))}
      </div>

      {sekme === 'sayfalar' && (
        <section className={`${KART} p-4`}>
          <div className={`${ETIKET} mb-1`}>Keşfet menüsü</div>
          <p className={`text-[12px] mb-3 ${IKINCIL}`}>Sıra sabit. Gizlenen sayfa menüden ve siteden kalkar. Sayfa görseli başlığın altında görünür; Galeri'den seçilir (Canva'dakiler önce Galeri'ye yüklenir).</p>
          <ul className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
            {SITE_SAYFALARI.map(sf => {
              const acik = sayfaAcik(sf.id);
              const gorselId = ayar.gorseller[sf.id];
              const gorsel = galeri.find(g => g.id === gorselId)?.images?.[0];
              return (
                <li key={sf.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`w-14 h-10 rounded-md overflow-hidden shrink-0 border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#F3EFE8] dark:bg-[#17345A] flex items-center justify-center`}>
                      {gorsel ? <GorselImg src={gorsel} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-[#A99C87]" />}
                    </span>
                    <span className={`flex-1 min-w-0 ${acik ? '' : 'opacity-45'}`}>
                      <span className={`block text-[14px] font-semibold ${YAZI}`}>{sf.ad}</span>
                      <span className={`block text-[11px] ${IKINCIL}`}>{acik ? 'sitede' : 'gizli'}{sf.id in maddeSayisi ? ` · ${maddeSayisi[sf.id]} madde` : ''}{sf.alt ? ` · ${sf.alt}` : ''}</span>
                    </span>
                    <button type="button" onClick={() => setGorselSecilen(gorselSecilen === sf.id ? null : sf.id)} className={`${DUGME_BOS} shrink-0`}>
                      Görsel
                    </button>
                    <button type="button" onClick={() => sayfaDegistir(sf.id)} className={`${DUGME_BOS} inline-flex items-center gap-1 shrink-0 w-[84px] justify-center`}>
                      {acik ? <><EyeOff className="w-3 h-3" /> Gizle</> : <><Eye className="w-3 h-3" /> Göster</>}
                    </button>
                  </div>
                  {gorselSecilen === sf.id && (
                    <div className="mt-2 grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-12 gap-1.5 max-h-44 overflow-y-auto">
                      <button type="button" onClick={() => gorselSec(sf.id, null)} className={`aspect-square rounded-md border border-dashed border-[#CFC5B4] text-[10px] ${IKINCIL}`}>görsel yok</button>
                      {galeri.map(g => (
                        <button key={g.id} type="button" title={g.title} onClick={() => gorselSec(sf.id, g.id)}
                          className={`aspect-square rounded-md overflow-hidden border ${g.id === gorselId ? 'border-[#F26B6F] border-2' : 'border-[#CFC5B4] dark:border-[#2C3C72]'} bg-[#F3EFE8]`}>
                          <GorselImg src={g.images![0]} alt={g.title} className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {galeri.length === 0 && <p className={`col-span-4 text-[11px] ${IKINCIL}`}>Galeri'de görsel yok.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sekme === 'hakkinda' && (
        <section className={`${KART} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={ETIKET}>Hakkında metni</div>
            {kemsKaydi && <StudyodaAc arac="site-hakkinda" hedefId={kemsKaydi.id} etiket="Stüdyoda taslak iste" />}
          </div>
          <p className={`text-[12px] ${IKINCIL}`}>Bir iki cümle. Stüdyonun taslağı öneri tepsisine düşer; "Ekle" deyince buraya gelir, düzeltip yayınlarsın.</p>
          <textarea value={ayar.hakkinda} onChange={e => setAyar(a => ({ ...a, hakkinda: e.target.value }))} rows={6}
            placeholder="Boş kalırsa sitede &quot;yakında&quot; görünür." className={girdi} />
        </section>
      )}

      {sekme === 'iletisim' && (
        <section className={`${KART} p-4 space-y-3`}>
          <div className={ETIKET}>E-posta</div>
          <input type="email" value={ayar.eposta} onChange={e => setAyar(a => ({ ...a, eposta: e.target.value }))}
            placeholder="ornek@kems.company" className={girdi} />
          <p className={`text-[12px] ${IKINCIL}`}>Boş kalırsa İletişim sayfasında "e-posta yakında" görünür. Hesaplar "Maddeler" sekmesinden siteye eklenir.</p>
        </section>
      )}

      {sekme === 'maddeler' && (<>

      <section className={`${KART} p-4`}>
        <div className={`${ETIKET} mb-2`}>Sitede görünenler{liste.length ? ` · ${liste.length}` : ''}</div>
        {liste.length === 0 ? (
          <p className={`text-[13px] ${IKINCIL}`}>
            Sitede henüz madde yok. Vikide bir maddeyi açıp başlığın yanındaki <span className="inline-flex items-center gap-1 font-semibold"><Globe className="w-3 h-3" /> sitede göster</span>'e bas.
          </p>
        ) : (
          <ul className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
            {liste.map(i => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <button type="button" onClick={() => onMaddeyiAc(i)} className={`flex-1 min-w-0 text-left cursor-pointer hover:text-[#D6484C]`}>
                  <span className={`block truncate text-[14px] font-semibold ${YAZI}`}>{i.title}</span>
                  <span className={`block text-[11px] ${IKINCIL}`}>{TYPE_LABELS[i.type] || EKLENEBILIR_TUR[i.type] || i.type}</span>
                </button>
                <button type="button" disabled={kaldiriliyor === i.id} onClick={() => void kaldir(i)} className={`${DUGME_BOS} inline-flex items-center gap-1 shrink-0`}>
                  <X className="w-3 h-3" /> {kaldiriliyor === i.id ? 'Kaldırılıyor…' : 'Siteden kaldır'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${KART} p-4`}>
        <div className={`${ETIKET} mb-1`}>Siteye eklenebilecekler</div>
        <p className={`text-[12px] mb-2 ${IKINCIL}`}>Droplar ve ürünler Ürünler sayfasında, yazılar Haberler'de, hesaplar İletişim'de görünür. Viki maddeleri vikiden eklenir.</p>
        {eklenebilir.length === 0 ? (
          <p className={`text-[13px] ${IKINCIL}`}>Eklenecek drop, ürün, yazı ya da hesap yok.</p>
        ) : (
          <ul className="divide-y divide-[#E4DCCD] dark:divide-[#2C3C72]">
            {eklenebilir.map(i => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className={`block truncate text-[14px] font-semibold ${YAZI}`}>{i.title}</span>
                  <span className={`block text-[11px] ${IKINCIL}`}>{EKLENEBILIR_TUR[i.type]}</span>
                </span>
                <button type="button" disabled={kaldiriliyor === i.id} onClick={() => void sitedeYaz(i, true)} className={`${DUGME_BOS} inline-flex items-center gap-1 shrink-0`}>
                  <Globe className="w-3 h-3" /> {kaldiriliyor === i.id ? 'Ekleniyor…' : 'Sitede göster'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>)}
    </div>
  );
};

export default SiteYonetimi;
