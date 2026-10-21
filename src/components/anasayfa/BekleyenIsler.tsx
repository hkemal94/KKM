import React, { useMemo, useState } from 'react';
import { Check, Loader2, Play } from 'lucide-react';
import type { Item } from '../../types';
import { useHaritaDuzeni, haritaKaydiDurumu } from '../../lib/haritaDuzeni';
import { silinecekler, eskiAlanlar, silmeOzeti } from '../../lib/temizlik';
import { mahalleAdDuzeltmeleri } from '../../lib/vikiTemizligi';
import { boslukDoldurma } from '../../lib/boslukDoldurma';
import { GaleriYedegiKarti, galeridenEksikler } from '../GaleriYedegiKarti';
import { gocIsleri, gocOzeti, kbYaz } from '../../lib/galeriGocu';
import { galeriyiTasi, gocRaporuYaz } from '../../lib/galeriGocuCalistir';

/**
 * Bekleyen işler (3 Ekim, Kemal: "hepsi, işte onlara buton ver, aratma
 * bana"). Neyin Eksik'te dağınık duran tek seferlik işler ana sayfada,
 * her biri kendi düğmesiyle; "Hepsini yap" hepsini sırayla çalıştırır.
 * İş kalmayınca satır, hiç iş yoksa kart kaybolur. Kayıt yalnız Kemal
 * düğmeye basınca değişir.
 */

interface Props {
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  onAlanSil?: (id: string, yollar: string[]) => Promise<void>;
}

interface Is { id: string; ad: string; aciklama: string; calistir: () => Promise<string> }

const KART = 'rounded-2xl border border-[#F26B6F]/50 bg-[#FAF8F5] dark:bg-[#13204A]';
const IKINCIL = 'text-[#6A5E4C] dark:text-[#A6B0C9]';
const YAZI = 'text-[#0E1C4F] dark:text-[#F3EFE8]';

export const BekleyenIsler: React.FC<Props> = ({ items, onUpdateItem, onAddItem, onDeleteItem, onAlanSil }) => {
  const harita = useHaritaDuzeni();
  const durum = useMemo(() => haritaKaydiDurumu(harita.duzen), [harita.duzen]);
  const silinecek = useMemo(() => (onDeleteItem ? silinecekler(items) : []), [items, onDeleteItem]);
  const eskiAlan = useMemo(() => (onAlanSil ? eskiAlanlar(items) : []), [items, onAlanSil]);
  const bosluk = useMemo(() => boslukDoldurma(items), [items]);
  const adDuzeltme = useMemo(() => mahalleAdDuzeltmeleri(items), [items]);
  const galeri = useMemo(() => galeridenEksikler(items), [items]);
  const goc = useMemo(() => gocIsleri(items), [items]);

  const [calisan, setCalisan] = useState<string | null>(null);
  const [raporlar, setRaporlar] = useState<Record<string, string>>({});
  const [hepsiOnay, setHepsiOnay] = useState(false);
  /** Bu açılışta bitirilen işler: veri yenilenene kadar yeniden görünmesin */
  const [bitenler, setBitenler] = useState<Set<string>>(new Set());

  const isler: Is[] = [];
  if (harita.ilkYukleme && harita.duzen && (durum.sisik || durum.islenmemis)) {
    isler.push({
      id: 'harita',
      ad: durum.islenmemis ? 'Kurucu taslağını haritaya işle' : 'Harita kaydını küçült',
      aciklama: durum.islenmemis
        ? 'Kurucu\'da bekleyen değişiklikler haritaya geçer; kayıt da küçülür (şişmiş yollar sadeleşir).'
        : 'Şişmiş yollar sadeleşir, kayıt birkaç kat küçülür; haritada hiçbir şey değişmez.',
      calistir: async () => {
        const d = harita.duzen!;
        const oldu = await harita.kaydet({ ...d, guncelleme: Date.now(), ...(d.kurucu ? { kurucuIslenen: d.kurucu } : {}) });
        if (!oldu) throw new Error('sunucuya yazılamadı (bu tarayıcıda duruyor, sonra yine dene)');
        return durum.islenmemis ? 'Taslak haritaya işlendi.' : 'Harita kaydı küçüldü.';
      }
    });
  }
  if (adDuzeltme.length) {
    isler.push({
      id: 'mahalle-adlari',
      ad: `${adDuzeltme.length} mahalle adındaki parantezi kaldır`,
      aciklama: adDuzeltme.map(a => `${a.item.title} → ${a.yeniAd}`).join(' · ') + '. Eski ad maddeye "Eski adı …" cümlesiyle yazılır.',
      calistir: async () => {
        for (const a of adDuzeltme) await onUpdateItem(a.guncel);
        return `${adDuzeltme.length} mahalle adı kısaldı.`;
      }
    });
  }
  if (eskiAlan.length && onAlanSil) {
    isler.push({
      id: 'eski-alan',
      ad: `${eskiAlan.length} kayıttaki eski alanları sil`,
      aciklama: 'Eski metinler, oyun arşivi, eski öneri işaretleri, kitap bölümlerindeki otel simülasyonu günleri. Kayıtlar kalır.',
      calistir: async () => {
        for (const e of eskiAlan) await onAlanSil(e.item.id, e.alanlar.map(a => `metadata.${a}`));
        return `${eskiAlan.length} kayıt temizlendi.`;
      }
    });
  }
  if (silinecek.length && onDeleteItem) {
    isler.push({
      id: 'temizlik',
      ad: `${silinecek.length} kullanılmayan kaydı sil`,
      aciklama: `${silmeOzeti(silinecek)}. Merch arşivi kalır; silinen geri gelmez. Yedek istersen önce Durum → Eksikler → Temizlik.`,
      calistir: async () => {
        for (const s of silinecek) await onDeleteItem(s.item.id);
        return `${silinecek.length} kayıt silindi.`;
      }
    });
  }
  if (bosluk.length) {
    isler.push({
      id: 'bosluk',
      ad: `${bosluk.length} maddede boşlukları künyeden doldur`,
      aciklama: 'Künyede cevabı yazılı olan boş alanlar dolar; dolu alana ve metne dokunulmaz.',
      calistir: async () => {
        for (const b of bosluk) await onUpdateItem(b.item);
        return `${bosluk.length} madde güncellendi.`;
      }
    });
  }

  if (goc.length) {
    const o = gocOzeti(goc);
    isler.push({
      id: 'galeri-disari',
      ad: 'Galeri görsellerini kayıtların dışına taşı',
      aciklama: `${o.gorsel} görsel (${o.kayit} kayıt) ayrı belgelere geçer, kayıtlar yaklaşık ${kbYaz(o.kazanilanBayt)} küçülür. Önce görseller yazılıp doğrulanır, sonra kayıt güncellenir. Önce firestore.rules yayımlanmış olmalı.`,
      calistir: async () => {
        const r = await galeriyiTasi(items, onUpdateItem);
        // Kural ya da bağlantı sorunuysa iş bitmedi: satır kalsın, sebebi görünsün
        if (r.durdu) throw new Error(gocRaporuYaz(r));
        return gocRaporuYaz(r);
      }
    });
  }

  const bekleyen = isler.filter(i => !bitenler.has(i.id));

  const calistir = async (is: Is) => {
    setCalisan(is.id);
    try {
      const r = await is.calistir();
      setRaporlar(x => ({ ...x, [is.id]: r }));
      setBitenler(b => new Set([...b, is.id]));
    } catch (e) {
      setRaporlar(x => ({ ...x, [is.id]: `Olmadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}. Tekrar basabilirsin.` }));
      throw e;
    } finally {
      setCalisan(null);
    }
  };

  const hepsiniYap = async () => {
    setHepsiOnay(false);
    for (const is of bekleyen) {
      try { await calistir(is); } catch { break; }
    }
  };

  const raporSatirlari = Object.entries(raporlar).filter(([id]) => bitenler.has(id));
  if (!bekleyen.length && !galeri.length && !raporSatirlari.length) return null;

  return (
    <section className={`${KART} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-mono uppercase tracking-[0.16em] ${IKINCIL}`}>Bekleyen işler</span>
        {bekleyen.length > 1 && (
          hepsiOnay ? (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#D6484C] dark:text-[#F26B6F]">{bekleyen.length} iş sırayla yapılsın mı?</span>
              <button type="button" onClick={() => setHepsiOnay(false)} className={`px-2.5 py-1 text-[11px] rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL} cursor-pointer`}>Vazgeç</button>
              <button type="button" onClick={() => void hepsiniYap()} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#F26B6F] text-white cursor-pointer">Evet</button>
            </span>
          ) : (
            <button type="button" disabled={!!calisan} onClick={() => setHepsiOnay(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] disabled:opacity-40 cursor-pointer">
              <Play className="w-3.5 h-3.5" /> Hepsini yap
            </button>
          )
        )}
      </div>

      {bekleyen.map(is => (
        <div key={is.id} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className={`text-[13px] font-semibold ${YAZI}`}>{is.ad}</div>
            <div className={`text-[11px] leading-snug ${IKINCIL}`}>{raporlar[is.id] ?? is.aciklama}</div>
          </div>
          <button type="button" disabled={!!calisan} onClick={() => void calistir(is).catch(() => {})}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-[#F26B6F] text-[#D6484C] dark:text-[#F26B6F] hover:bg-[#F26B6F]/10 disabled:opacity-40 cursor-pointer">
            {calisan === is.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {calisan === is.id ? 'Yapılıyor…' : 'Yap'}
          </button>
        </div>
      ))}

      {raporSatirlari.map(([id, r]) => (
        <div key={id} className={`flex items-center gap-2 text-[12px] ${IKINCIL}`}>
          <Check className="w-3.5 h-3.5 text-[#2F7A45] dark:text-[#9FD3A9]" /> {r}
        </div>
      ))}

      {/* Galeri görselleri: indirip eklemesi kendi kartında (görselleri tek tek çeker) */}
      {galeri.length > 0 && <GaleriYedegiKarti items={items} onAddItem={onAddItem} />}
    </section>
  );
};

export default BekleyenIsler;
