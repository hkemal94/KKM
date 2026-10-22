import React, { useMemo, useRef, useState } from 'react';
import {
  Lightbulb, X, ArrowRight, Archive, Clock, Check, Plus, Send
} from 'lucide-react';
import type { Item, ItemType, AreaType } from '../types';
import { anahtariOku } from '../lib/oyunAyarlari';
import { ajansaGonder, fikirDosyasiMetni } from '../lib/ajansaGonder';

/**
 * Hızlı fikir — her sayfanın köşesinde duran gelen kutusu.
 *
 * Kemal: "Brainstorm ekranı kalksın, hızlı nota dönüşsün."
 *
 * Neden ekran değil de köşe: fikir çalışırken aklına geliyor. Ayrı bir
 * sekmeye gitmek, fikrin unutulması için yeterli bir engel — eski
 * Brainstorm ekranının işe yaramamasının sebebi buydu. Burada tek satır
 * yazıp Enter'a basıyorsun, bulunduğun sayfadan çıkmıyorsun.
 *
 * Eski ekranın işe yarayan kısmı korundu: her fikrin tek bir işi var,
 * bir şeye dönüşmek. Dönüşünce kutudan çıkıyor ama silinmiyor.
 *
 * Hiçbir yere metin üretilmiyor: fikrin kendi cümlesi yeni kaydın başlığı
 * oluyor, üstüne bir şey eklenmiyor.
 */

const BAYATLAMA_GUNU = 30;

/** Fikrin dönüşebileceği hedefler — evrenin gerçek tipleri */
const HEDEFLER: Array<{
  id: string; ad: string; tip: ItemType; alan: AreaType; durum: string; etiket: string[];
}> = [
  { id: 'kisi',   ad: 'Kişi',        tip: 'kisi',      alan: 'duzada', durum: 'Fikir',   etiket: ['duzada'] },
  { id: 'mekan',  ad: 'Mekân',       tip: 'mekân',     alan: 'duzada', durum: 'Fikir',   etiket: ['duzada'] },
  { id: 'olay',   ad: 'Olay',        tip: 'olay',      alan: 'duzada', durum: 'Fikir',   etiket: ['duzada'] },
  { id: 'drop',   ad: 'Drop',        tip: 'drop',      alan: 'merch',  durum: 'Konsept', etiket: ['merch', 'drop'] },
  { id: 'yazi',   ad: 'Blog yazısı', tip: 'blog_post', alan: 'blog',   durum: 'Taslak',  etiket: ['blog'] },
  { id: 'oyunis', ad: 'Oyun işi',    tip: 'oyun_is',   alan: 'oyun',   durum: 'Konsept', etiket: ['oyun', 'is'] }
];

const gunFarki = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000);

export interface HizliFikirProps {
  items: Item[];
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onUpdateItem: (item: Item) => Promise<void>;
  /** Pano açık mı (1 Ekim: ampul köşeden kalktı, üst çubuktaki "+" açar) */
  acik: boolean;
  onAcikDegis: (acik: boolean) => void;
  /** Ajans bağlantısı (GitHub anahtarı) yoksa kurulan yere götürür */
  onAjansBaglantisi: () => void;
}

export const HizliFikir: React.FC<HizliFikirProps> = ({ items, onAddItem, onUpdateItem, acik, onAcikDegis, onAjansBaglantisi }) => {
  const setAcik = onAcikDegis;
  const [metin, setMetin] = useState('');
  const [yaziliyor, setYaziliyor] = useState(false);
  const [donusturulen, setDonusturulen] = useState<string | null>(null);
  const [rapor, setRapor] = useState<string | null>(null);
  const [gonderilen, setGonderilen] = useState<string | null>(null);
  const girdi = useRef<HTMLInputElement | null>(null);

  const fikirler = useMemo(
    () => items
      // Günlük not da 'fikir' olarak kaydediliyor ama fikir değil
      .filter(i => i.type === 'fikir' && !i.archived
        && !(i.metadata as any)?.donusenId
        && !(i.tags || []).includes('gunluk-not'))
      .sort((a, b) => b.createdAt - a.createdAt),
    [items]
  );

  const bayatSayisi = useMemo(
    () => fikirler.filter(f => gunFarki(f.createdAt) >= BAYATLAMA_GUNU).length,
    [fikirler]
  );

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = metin.trim();
    if (!d || yaziliyor) return;
    setYaziliyor(true);
    try {
      await onAddItem({
        title: d,             // fikrin kendi cümlesi; kısaltılmıyor
        area: 'brainstorm',
        type: 'fikir',
        status: 'Fikir',
        priority: 'orta',
        tags: ['fikir'],
        links: [],
        notes: '',
        images: [],
        isProposal: false,
        archived: false,
        metadata: {}
      });
      setMetin('');
      girdi.current?.focus();
    } finally {
      setYaziliyor(false);
    }
  };

  const donustur = async (fikir: Item, hedefId: string) => {
    const h = HEDEFLER.find(x => x.id === hedefId);
    if (!h) return;
    await onAddItem({
      title: fikir.title,
      area: h.alan,
      type: h.tip,
      status: h.durum,
      priority: fikir.priority,
      tags: [...h.etiket, 'fikirden'],
      links: [],
      notes: fikir.notes || '',
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        fikirKimligi: fikir.id,
        ...(h.id === 'oyunis' ? { asama: 'konsept' } : {})
      }
    });
    await onUpdateItem({
      ...fikir,
      metadata: {
        ...((fikir.metadata || {}) as any),
        donusenId: `${h.id}_${Date.now()}`,
        donusenTur: h.ad
      },
      updatedAt: Date.now()
    });
    setDonusturulen(null);
    setRapor(`${h.ad} olarak açıldı.`);
  };

  /** Fikri ajansın gizli deposuna yazar; kayda yalnız gönderim zamanı işlenir (Kemal bastığı için) */
  const ajansaYolla = async (f: Item) => {
    if (gonderilen || (f.metadata as any)?.ajansaGonderildi) return; // ikinci basış yeni dosya açmaz
    if (!anahtariOku()) {
      setRapor('Önce ajans bağlantısını kur: GitHub anahtarı Durum → Ajans\'ta.');
      onAjansBaglantisi();
      return;
    }
    setGonderilen(f.id);
    setRapor(null);
    try {
      const zaman = new Date();
      await ajansaGonder(anahtariOku(), f.title, fikirDosyasiMetni(f, zaman), zaman);
      await onUpdateItem({
        ...f,
        metadata: { ...((f.metadata || {}) as any), ajansaGonderildi: zaman.toISOString() },
        updatedAt: Date.now()
      });
      setRapor('Ajansa gönderildi.');
    } catch (e) {
      setRapor(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGonderilen(null);
    }
  };

  const arsivle = async (f: Item) =>
    onUpdateItem({ ...f, archived: true, updatedAt: Date.now() });

  // Kapalıyken köşede düğme durmaz (1 Ekim, Kemal: "ampul + düğmesine")
  if (!acik) return null;

  /* --- açık hâl: köşedeki pano --- */
  return (
    <div
      className="fixed bottom-20 right-4 lg:bottom-5 lg:right-5 z-40 w-[min(92vw,380px)] rounded-xl overflow-hidden
                 border shadow-2xl flex flex-col"
      style={{
        background: '#FAF8F5', borderColor: '#CFC5B4', maxHeight: 'min(78vh, 560px)'
      }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: '#CFC5B4' }}>
        <Lightbulb className="w-4 h-4" style={{ color: '#F26B6F' }} />
        <span className="font-mono uppercase flex-1"
              style={{ fontSize: 10, letterSpacing: '0.16em', color: '#0E1C4F' }}>
          Fikirler · {fikirler.length}
        </span>
        <button onClick={() => setAcik(false)}
                className="cursor-pointer" style={{ color: '#6A5E4C' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={ekle} className="flex items-center gap-2 px-3 py-2.5 border-b"
            style={{ borderColor: 'rgba(207,197,180,0.6)' }}>
        <input
          ref={girdi}
          autoFocus
          value={metin}
          onChange={e => setMetin(e.target.value)}
          placeholder="Aklına geleni yaz, Enter'a bas…"
          className="flex-1 bg-white rounded-lg px-2.5 py-2 focus:outline-hidden"
          style={{ fontSize: 13, border: '1px solid #CFC5B4', color: '#0E1C4F' }}
        />
        <button type="submit" disabled={!metin.trim() || yaziliyor}
                className="p-2 rounded-lg cursor-pointer disabled:opacity-30"
                style={{ background: '#0E1C4F', color: '#F3EFE8' }}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>

      {rapor && (
        <p className="px-4 py-1.5 flex items-center gap-1.5"
           style={{ fontSize: 11, color: '#6A5E4C', background: '#F3EFE8' }}>
          <Check className="w-3 h-3" style={{ color: '#4A5E68' }} /> {rapor}
        </p>
      )}

      <div className="overflow-y-auto flex-1">
        {fikirler.length === 0 ? (
          <p className="px-4 py-5" style={{ fontSize: 12.5, color: '#9A8C76' }}>
            Kutu boş. Bu iyi bir şey — dolmuş kutu, işlenmemiş fikir demek.
          </p>
        ) : fikirler.map(f => {
          const gun = gunFarki(f.createdAt);
          const bayat = gun >= BAYATLAMA_GUNU;
          const secili = donusturulen === f.id;
          const gonderimZamani = (f.metadata as any)?.ajansaGonderildi as string | undefined;
          return (
            <div key={f.id} className="px-4 py-2.5 border-b"
                 style={{ borderColor: 'rgba(207,197,180,0.4)' }}>
              <div className="flex items-start gap-2">
                <span className="flex-1" style={{ fontSize: 12.5, color: '#0E1C4F' }}>
                  {f.title}
                </span>
                <span className="font-mono shrink-0 flex items-center gap-1"
                      style={{ fontSize: 9.5, color: bayat ? '#F26B6F' : '#9A8C76' }}>
                  <Clock className="w-2.5 h-2.5" />
                  {gun === 0 ? 'bugün' : `${gun}g`}
                </span>
              </div>

              {secili ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {HEDEFLER.map(h => (
                    <button key={h.id} onClick={() => void donustur(f, h.id)}
                            className="px-2 py-0.5 rounded-md cursor-pointer font-mono"
                            style={{ fontSize: 10, border: '1px solid #CFC5B4', color: '#6A5E4C' }}>
                      {h.ad}
                    </button>
                  ))}
                  <button onClick={() => setDonusturulen(null)}
                          className="px-2 py-0.5 cursor-pointer font-mono"
                          style={{ fontSize: 10, color: '#9A8C76' }}>
                    vazgeç
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-3">
                  <button onClick={() => setDonusturulen(f.id)}
                          className="flex items-center gap-1 cursor-pointer font-mono"
                          style={{ fontSize: 10, color: '#F26B6F' }}>
                    dönüştür <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={() => void arsivle(f)}
                          className="flex items-center gap-1 cursor-pointer font-mono"
                          style={{ fontSize: 10, color: '#9A8C76' }}
                          title="Silinmez, arşive kalkar">
                    <Archive className="w-2.5 h-2.5" /> arşive
                  </button>
                  {gonderimZamani ? (
                    <span className="flex items-center gap-1 font-mono" style={{ fontSize: 10, color: '#9A8C76' }}>
                      <Check className="w-2.5 h-2.5" /> Ajansa gönderildi · {new Date(gonderimZamani).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                    </span>
                  ) : (
                    <button onClick={() => void ajansaYolla(f)} disabled={gonderilen === f.id}
                            className="flex items-center gap-1 cursor-pointer font-mono disabled:opacity-40"
                            style={{ fontSize: 10, color: '#0E1C4F' }}>
                      <Send className="w-2.5 h-2.5" /> {gonderilen === f.id ? 'gönderiliyor…' : 'Ajansa gönder'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bayatSayisi > 0 && (
        <p className="px-4 py-2 border-t"
           style={{ fontSize: 10.5, color: '#9A8C76', borderColor: '#CFC5B4' }}>
          {bayatSayisi} fikir {BAYATLAMA_GUNU} günden uzun bekliyor — ya dönüştür
          ya arşive kaldır.
        </p>
      )}
    </div>
  );
};

export default HizliFikir;
