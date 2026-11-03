import React, { useMemo, useState } from 'react';
import { Bot, Download, ImageOff, ImagePlus, Trash2 } from 'lucide-react';
import type { Item } from '../types';
import { GorselImg } from './GorselImg';
import { gorselOku } from '../lib/gorselDeposu';
import {
  kesinAdaylar, belirsizAdaylar, galeriBasvurulari, galeriIcerikKimlikleri, temizlenmisKayitlar,
  vikiMaddeleri, gorselIsteyenler, gorselIstegi, turAdi, type Aday
} from '../lib/vikiGorselTemizligi';
import { anahtariOku } from '../lib/oyunAyarlari';
import { istekEkle } from '../lib/kemalIstekleri';

/**
 * Durum → Eksikler (3 Kasım, Kemal: "Görselleri galeriden sildim ama vikide kaldı,
 * onları da kaldıralım; viki görselleri benden talep etsin, ajanlar da bunun için
 * önerilerde bulunsun gerekirse Canva'dan"). İki kart:
 *   1. Vikide kalan silinmiş galeri görselleri: liste, kutucuklar, tek düğme.
 *      Kesin olanlar seçili gelir, "emin değil" olanlar seçili gelmez.
 *      Kemal basmadan hiçbir şey silinmez; basınca onay penceresi çıkar.
 *   2. Görsel istiyor: görseli olmayan viki maddeleri (yalnız gösterim) ve
 *      "Ajana öneri hazırlat" (ajansa istek gider, kayda yazılmaz).
 * Saf kısım: `lib/vikiGorselTemizligi.ts`.
 */

const KART = 'mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]';
const BASLIK = 'text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]';
const ACIKLAMA = 'mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]';
const DOLU = 'shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer';
const BOS = 'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] text-[#6A5E4C] dark:text-[#A6B0C9] hover:border-[#0E1C4F] cursor-pointer';

const SilinmisGaleriKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onMaddeAc?: (id: string) => void;
}> = ({ items, onUpdateItem, onMaddeAc }) => {
  const kesin = useMemo(() => kesinAdaylar(items), [items]);
  /** Galeride duranların içerik kimlikleri: "Denetle"ye basınca okunur */
  const [galeriKimlikleri, setGaleriKimlikleri] = useState<Set<string> | null>(null);
  const [okunamayan, setOkunamayan] = useState(0);
  const [denetleniyor, setDenetleniyor] = useState(false);
  const belirsiz = useMemo(
    () => galeriKimlikleri ? belirsizAdaylar(items, galeriKimlikleri) : [],
    [items, galeriKimlikleri]
  );
  /** Kemal'in değiştirdiği kutucuklar; değişmeyen kesin seçili, belirsiz seçili değil */
  const [secim, setSecim] = useState<Record<string, boolean>>({});
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);
  const [yedeklendi, setYedeklendi] = useState(false);

  /** Vikide galeriden gelmiş olabilecek görsel var mı (kart yalnız o zaman görünür) */
  const isVar = useMemo(() => vikiMaddeleri(items).some(i => (i.images || []).some(g =>
    typeof g === 'string' && (g.startsWith('data:image/') || g.startsWith('/')))), [items]);

  const hepsi = useMemo(() => [...kesin, ...belirsiz], [kesin, belirsiz]);
  const seciliMi = (a: Aday) => secim[a.anahtar] ?? a.kesin;
  const secilen = hepsi.filter(seciliMi);

  const denetle = async () => {
    if (denetleniyor) return;
    setDenetleniyor(true);
    setRapor(null);
    try {
      const okunan = new Map<string, string>();
      let olmayan = 0;
      await Promise.all(galeriBasvurulari(items).map(async r => {
        const v = await gorselOku(r);
        if (v) okunan.set(r, v); else olmayan++;
      }));
      setOkunamayan(olmayan);
      setGaleriKimlikleri(galeriIcerikKimlikleri(items, okunan));
    } finally {
      setDenetleniyor(false);
    }
  };

  const yedekIndir = () => {
    const kayitlar = [...new Map(secilen.map(a => [a.item.id, a.item])).values()];
    const dosya = new Blob([JSON.stringify({
      uygulama: 'Kems Komuta Merkezi', tur: 'viki-gorsel-temizligi-oncesi-yedek',
      tarih: new Date().toISOString(), items: kayitlar
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(dosya);
    a.download = `kkm-viki-gorsel-yedegi-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setYedeklendi(true);
  };

  const kaldir = async () => {
    if (calisiyor || !secilen.length) return;
    const maddeSayisi = new Set(secilen.map(a => a.item.id)).size;
    if (!window.confirm(`${secilen.length} görsel ${maddeSayisi} viki maddesinden kaldırılacak. Geri alınmaz (yedek indirdiysen oradan dönebilir). Devam edilsin mi?`)) return;
    setCalisiyor(true);
    setRapor(null);
    let yazilan = 0;
    try {
      for (const k of temizlenmisKayitlar(secilen)) {
        await onUpdateItem(k);
        yazilan++;
      }
      setSecim({});
      setRapor(`${secilen.length} görsel ${yazilan} maddeden kaldırıldı.`);
    } catch (e) {
      setRapor(`Yarıda kaldı (${yazilan} madde yazıldı): ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCalisiyor(false);
    }
  };

  if (!isVar && !rapor) return null;

  const satir = (a: Aday) => (
    <label key={a.anahtar} className="flex items-center gap-2.5 py-1.5 border-t border-[#CFC5B4]/50 dark:border-[#2C3C72]/60 cursor-pointer">
      <input type="checkbox" checked={seciliMi(a)} disabled={calisiyor}
        onChange={e => setSecim(s => ({ ...s, [a.anahtar]: e.target.checked }))}
        className="accent-[#F26B6F] shrink-0" />
      <GorselImg src={a.gorsel} alt="" className="w-10 h-10 rounded-md object-cover shrink-0 bg-[#F3EFE8]" />
      <span className="flex-1 min-w-0 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] truncate">
        {onMaddeAc
          ? <button type="button" onClick={e => { e.preventDefault(); onMaddeAc(a.item.id); }} className="underline decoration-[#CFC5B4] hover:text-[#F26B6F] cursor-pointer">{a.item.title}</button>
          : a.item.title}
        <span className="ml-1.5 text-[#6A5E4C] dark:text-[#A6B0C9]">· {turAdi(a.item)}</span>
      </span>
    </label>
  );

  return (
    <div className={KART}>
      <div className="flex items-start gap-3">
        <ImageOff className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>Vikide kalan silinmiş galeri görselleri</p>
          <p className={ACIKLAMA}>
            Galeriden silinen görselin vikideki kopyası kalıyordu. Yalnız galeriden gelmiş ve galeride artık olmayanlar listelenir;
            maddeye doğrudan yüklediklerine dokunulmaz. Sen basmadan hiçbir şey silinmez.
          </p>
          {rapor && <p className="mt-1.5 text-[12px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>}
        </div>
        <button type="button" disabled={denetleniyor || calisiyor} onClick={() => void denetle()} className={DOLU}>
          {denetleniyor ? 'Denetleniyor…' : galeriKimlikleri ? 'Yeniden denetle' : 'Denetle'}
        </button>
      </div>

      {kesin.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#6A5E4C] dark:text-[#A6B0C9]">Kesin galeriden gelmiş · {kesin.length}</p>
          {kesin.map(satir)}
        </div>
      )}

      {galeriKimlikleri && (
        <div className="mt-2.5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#6A5E4C] dark:text-[#A6B0C9]">Emin değil · {belirsiz.length}</p>
          <p className={ACIKLAMA}>
            Bu görsellerin nereden geldiği kayıtlı değil (eski bağlamalar iz bırakmıyordu); galeride aynısı yok. Galeriden silinmiş de olabilir,
            maddeye doğrudan yüklenmiş de. Seçili gelmez; tanıdıklarını kendin işaretle.
            {okunamayan > 0 && ` ${okunamayan} galeri görseli okunamadı; onların vikideki kopyası burada yanlışlıkla görünebilir.`}
          </p>
          {belirsiz.length === 0 && <p className="mt-1 text-[12px] text-[#336659] dark:text-[#8FC4A8]">Yok.</p>}
          {belirsiz.map(satir)}
        </div>
      )}

      {!galeriKimlikleri && !kesin.length && (
        <p className="mt-2 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">Kesin olan yok. Eski bağlamaları bulmak için "Denetle"ye bas (galeri görselleri okunur, hiçbir şey yazılmaz).</p>
      )}

      {hepsi.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={calisiyor || !secilen.length} onClick={() => void kaldir()}
            className="flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-[#F26B6F] text-white text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> {calisiyor ? 'Kaldırılıyor…' : `Seçilenleri vikiden kaldır (${secilen.length})`}
          </button>
          <button type="button" disabled={!secilen.length} onClick={yedekIndir} className={BOS}>
            <Download className="w-3.5 h-3.5" /> {yedeklendi ? 'Yedek indi ✓' : 'Seçilenlerin yedeğini indir · isteğe bağlı'}
          </button>
        </div>
      )}
    </div>
  );
};

const GorselIsteyenKarti: React.FC<{ items: Item[]; onMaddeAc?: (id: string) => void }> = ({ items, onMaddeAc }) => {
  const liste = useMemo(() => gorselIsteyenler(items), [items]);
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);

  const iste = async () => {
    // Gönderim sürerken ikinci basış ikinci isteği yazmasın
    if (durum === 'Gönderiliyor…') return;
    const anahtar = anahtariOku();
    if (!anahtar) { setDurum("Önce Ajans bağlantısı'nda GitHub anahtarını gir."); return; }
    setDurum('Gönderiliyor…');
    try {
      await istekEkle(anahtar, { tur: 'istek', metin: gorselIstegi(liste), ekran: 'viki', ajan: 'merch-tasarimcisi' });
      setDurum("Gönderildi. Öneriler Onay bekleyenler'e düşer; görsel maddeye sen onaylayınca girer.");
    } catch (h) {
      setDurum(`Gönderilemedi: ${h instanceof Error ? h.message : String(h)}`);
    }
  };

  if (!liste.length) return null;

  return (
    <div className={KART}>
      <div className="flex items-start gap-3">
        <ImagePlus className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className={BASLIK}>Görsel istiyor · {liste.length} viki maddesi</p>
          <p className={ACIKLAMA}>Bu maddelerin görseli yok. Ajandan Canva'dan uygun görsel önerisi isteyebilirsin; öneri Onay bekleyenler'e düşer.</p>
          {durum && <p className="mt-1.5 text-[12px] text-[#336659] dark:text-[#8FC4A8]">{durum}</p>}
          <button type="button" onClick={() => setAcik(a => !a)} className="mt-1.5 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9] underline cursor-pointer">
            {acik ? 'Listeyi gizle' : 'Listeyi göster'}
          </button>
          {acik && (
            <ul className="mt-1.5 max-h-64 overflow-y-auto text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
              {liste.map(i => (
                <li key={i.id} className="py-0.5">
                  {onMaddeAc
                    ? <button type="button" onClick={() => onMaddeAc(i.id)} className="hover:text-[#F26B6F] cursor-pointer text-left">{i.title}</button>
                    : i.title}
                  <span className="ml-1.5 text-[#6A5E4C] dark:text-[#A6B0C9]">· {turAdi(i)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" disabled={durum === 'Gönderiliyor…'} onClick={() => void iste()} className={`${DOLU} flex items-center gap-1.5`}>
          <Bot className="w-3.5 h-3.5" /> Ajana öneri hazırlat
        </button>
      </div>
    </div>
  );
};

/** Eksikler'e tek satırla giren iki kart */
export const VikiGorselKarti: React.FC<{
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onMaddeAc?: (id: string) => void;
}> = props => (
  <>
    <SilinmisGaleriKarti {...props} />
    <GorselIsteyenKarti items={props.items} onMaddeAc={props.onMaddeAc} />
  </>
);

export default VikiGorselKarti;
