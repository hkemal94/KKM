import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Image as ImageIcon, Plus } from 'lucide-react';
import type { Item } from '../../types';
import { KisaListe } from '../kabuk/KisaListe';
import { GorselImg } from '../GorselImg';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { kimdeAdi } from '../../lib/isler';
import { ASAMA_RENGI, KANALLAR, asamasi, gonderiBilgisi, gonderiler } from '../../lib/sosyal';
import {
  ajansGonderisindenKayit, alinmisMi, durumEsi, gonderileriOku, kanalEsi, type AjansGonderisi
} from '../../lib/ajansGonderileri';
import { DUGME_BOS, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * Sosyal medya → Gönderiler (3 Kasım, Kemal: "her gönderi ayrı olsun",
 * "gönderi kartı + Canva tasarımı"). Her gönderi bir kart: kanal, metin,
 * etiketler, Canva bağlantısı, görsel önizleme, tarih, aşama. Karta basınca
 * gönderi kartı açılır. Üstte ajansın taslakları (`kkm/gonderiler.json`):
 * yalnız okunur, "Benim listeme al" basılınca Kemal'in gönderisi olur.
 * KKM hiçbir şey paylaşmaz; "Paylaşıldı"yı Kemal işaretler.
 */

type YeniKayit = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;

const kanalKisa = (id: string) => KANALLAR.find(k => k.id === id)?.kisa || id;
const kanalAdi = (id: string) => KANALLAR.find(k => k.id === id)?.ad || id;
const tarihYazisi = (t: string) => new Date(`${t}T12:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
const CIP = 'font-bold px-1.5 rounded border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A]';

function Onizleme({ gorsel }: { gorsel?: string }) {
  return (
    <div className="w-14 h-14 shrink-0 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] overflow-hidden bg-[#F3EFE8] dark:bg-[#17345A] flex items-center justify-center">
      {gorsel ? <GorselImg src={gorsel} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <ImageIcon className="w-4 h-4 text-[#CFC5B4]" />}
    </div>
  );
}

function CanvaBag({ adres }: { adres: string }) {
  return (
    <a href={adres} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[#D6484C] dark:text-[#F26B6F] underline">
      Canva <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

export function GonderiListesi({ items, onAddItem, onAc, onYeni }: {
  items: Item[];
  onAddItem: (item: YeniKayit & { id?: string }) => Promise<void>;
  /** Gönderi kartını aç */
  onAc: (id: string) => void;
  onYeni: () => void;
}) {
  const anahtar = anahtariOku();
  const [taslaklar, setTaslaklar] = useState<AjansGonderisi[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [aliniyor, setAliniyor] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    gonderileriOku(anahtar)
      .then(l => { if (!iptal) setTaslaklar(l); })
      .catch(e => { if (!iptal) setHata(e instanceof Error ? e.message : String(e)); });
    return () => { iptal = true; };
  }, [anahtar]);

  // Tarihliler önce (yakın tarih üstte), sonra tarihsizler (yeniden eskiye)
  const benim = useMemo(() => gonderiler(items).sort((a, b) => {
    const ta = gonderiBilgisi(a).tarih, tb = gonderiBilgisi(b).tarih;
    if (ta && tb) return tb.localeCompare(ta);
    if (ta || tb) return ta ? -1 : 1;
    return b.createdAt - a.createdAt;
  }), [items]);

  const al = async (g: AjansGonderisi) => {
    if (aliniyor) return;
    setAliniyor(g.id);
    const id = `sosyal_gonderi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try { await onAddItem({ ...ajansGonderisindenKayit(g), id }); }
    finally { setAliniyor(null); }
  };

  return (
    <div className="space-y-4">
      {(taslaklar.length > 0 || hata) && (
        <section className={`${KART} p-3 space-y-2`}>
          <div className={ETIKET}>Ajansın taslakları{taslaklar.length ? ` · ${taslaklar.length}` : ''}</div>
          {hata && <p className={`text-[12px] ${IKINCIL}`}>Okunamadı ({hata}).</p>}
          <KisaListe className="space-y-1.5">
            {taslaklar.map(g => {
              const kanal = kanalEsi(g.kanal);
              const alinmis = alinmisMi(items, g);
              const asama = durumEsi(g.durum);
              return (
                <li key={g.id} className="rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white/60 dark:bg-[#17345A]/60 px-2.5 py-2">
                  <div className={`flex flex-wrap items-center gap-1 text-[10.5px] ${IKINCIL}`}>
                    <span className={CIP} title={kanal ? kanalAdi(kanal) : g.kanal}>{kanal ? kanalKisa(kanal) : (g.kanal || 'kanal yok')}</span>
                    <span className={`font-bold uppercase tracking-wide px-1 rounded ${ASAMA_RENGI[asama]}`}>{asama}</span>
                    {g.tarih && <span>· {tarihYazisi(g.tarih)}</span>}
                    {g.ajan && <span>· {kimdeAdi(g.ajan)}</span>}
                    {g.canva && <span>· <CanvaBag adres={g.canva} /></span>}
                  </div>
                  <p className={`mt-1 text-[12.5px] leading-snug whitespace-pre-line line-clamp-4 ${YAZI}`}>{g.metin}</p>
                  {g.etiketler.length > 0 && <p className={`mt-0.5 text-[11px] ${IKINCIL}`}>{g.etiketler.map(e => (e.startsWith('#') ? e : `#${e}`)).join(' ')}</p>}
                  <div className="mt-1.5">
                    {alinmis ? (
                      <button type="button" onClick={() => onAc(alinmis.id)} className={DUGME_BOS}><Check className="w-3 h-3" /> Listende · aç</button>
                    ) : (
                      <button type="button" onClick={() => void al(g)} disabled={!!aliniyor} className={DUGME_BOS}>
                        <Plus className="w-3 h-3" /> {aliniyor === g.id ? 'Alınıyor…' : 'Benim listeme al'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </KisaListe>
          <p className={`text-[11px] ${IKINCIL}`}>Ajansın hazırladığı gönderiler. Listene aldığın taslak senin gönderin olur; ajansın dosyası değişmez.</p>
        </section>
      )}

      <section className={`${KART} p-3 space-y-2`}>
        <div className="flex items-center gap-2">
          <div className={`flex-1 ${ETIKET}`}>Gönderilerim{benim.length ? ` · ${benim.length}` : ''}</div>
          <button type="button" onClick={onYeni} className={`${DUGME_BOS} inline-flex items-center gap-1`}><Plus className="w-3 h-3" /> Gönderi</button>
        </div>
        {benim.length === 0 && <p className={`text-[12px] ${IKINCIL}`}>Henüz gönderi yok.</p>}
        <KisaListe className="space-y-1.5">
          {benim.map(g => {
            const b = gonderiBilgisi(g);
            const asama = asamasi(g);
            return (
              <li key={g.id}>
                <div role="button" tabIndex={0} onClick={() => onAc(g.id)} onKeyDown={e => { if (e.key === 'Enter') onAc(g.id); }}
                  className="w-full text-left flex gap-2.5 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] hover:border-[#F26B6F] px-2.5 py-2 cursor-pointer">
                  <Onizleme gorsel={g.images?.[0]} />
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate text-[13px] font-semibold ${YAZI}`}>{g.title}</span>
                    <span className={`flex flex-wrap items-center gap-1 mt-0.5 text-[10.5px] ${IKINCIL}`}>
                      {b.kanallar.map(k => (
                        <span key={k} title={kanalAdi(k)} className={b.paylasilan.includes(k) ? 'font-bold px-1.5 rounded border border-transparent bg-[#0E1C4F] text-white dark:bg-[#2C3C72]' : CIP}>{kanalKisa(k)}</span>
                      ))}
                      <span className={`font-bold uppercase tracking-wide px-1 rounded ${ASAMA_RENGI[asama]}`}>{asama}</span>
                      <span>· {b.tarih ? tarihYazisi(b.tarih) : 'tarihsiz'}</span>
                      {b.canva && <span>· <CanvaBag adres={b.canva} /></span>}
                    </span>
                    {g.notes && <span className={`block mt-1 text-[12px] leading-snug line-clamp-2 ${YAZI}`}>{g.notes}</span>}
                    {b.hashtag && <span className={`block mt-0.5 truncate text-[11px] ${IKINCIL}`}>{b.hashtag}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </KisaListe>
        <p className={`text-[11px] ${IKINCIL}`}>Aşama: Fikir → Taslak → Onayda → Onaylandı → Paylaşıldı. Paylaşımı sen yaparsın; "Paylaşıldı"yı kartta sen işaretlersin.</p>
      </section>
    </div>
  );
}

export default GonderiListesi;
