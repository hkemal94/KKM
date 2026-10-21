import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Copy, Download, Trash2, Image as ImageIcon, Link2 } from 'lucide-react';
import type { Item } from '../../types';
import { GorselImg } from '../GorselImg';
import { gorselOku } from '../../lib/gorselDeposu';
import {
  ASAMALAR, BAG_TURLERI, BICIMLER, KANALLAR, TURLER, asamasi, gonderiBilgisi, gonderiGuncelle,
  kanalHesabi, seriler, type GonderiBilgisi
} from '../../lib/sosyal';
import { DUGME_BOS, ETIKET, IKINCIL, YAZI } from '../anasayfa/stil';

/**
 * Gönderi kartı: takvimde bir gönderiye basınca sağdan açılır (telefonda
 * tam ekran). Yazdıkça kaydeder (kısa bir beklemeyle); hiçbir şey
 * paylaşılmaz — paylaşımı Kemal yapar, sonra kanalı "paylaşıldı" işaretler.
 */

interface Props {
  item: Item;
  items: Item[];
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onKapat: () => void;
}

const KUTU = `w-full text-[13px] bg-white dark:bg-[#17345A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-[#F26B6F]`;
const cip = (on: boolean) => `px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI}`}`;

export const GonderiKarti: React.FC<Props> = ({ item, items, onUpdateItem, onDeleteItem, onKapat }) => {
  const [taslak, setTaslak] = useState<Item>(item);
  const [galeriAcik, setGaleriAcik] = useState(false);
  const [silOnay, setSilOnay] = useState(false);
  const son = useRef(item);

  // Başka yerden değişirse (ör. stüdyodan "Ekle") taslak da güncellensin
  useEffect(() => { if (item.updatedAt > son.current.updatedAt) { setTaslak(item); son.current = item; } }, [item]);

  // Yazdıkça kaydet: 700 ms bekler
  useEffect(() => {
    if (taslak === son.current) return;
    const z = setTimeout(() => { son.current = taslak; void onUpdateItem(taslak); }, 700);
    return () => clearTimeout(z);
  }, [taslak, onUpdateItem]);

  const b = gonderiBilgisi(taslak);
  const guncelle = (d: Partial<GonderiBilgisi>, ek: Partial<Item> = {}) => setTaslak(t => gonderiGuncelle(t, d, ek));
  const tumSeriler = useMemo(() => seriler(items), [items]);
  const galeri = useMemo(() => items.filter(i => i.type === 'ilham_gorsel' && !i.archived && i.images?.[0]), [items]);
  const baglar = taslak.links.map(id => items.find(i => i.id === id)).filter((x): x is Item => !!x);
  const gorsel = taslak.images?.[0];

  // Kanal kaldırılınca "paylaşıldı" işareti de gider
  const kanalAc = (id: string) => b.kanallar.includes(id)
    ? guncelle({ kanallar: b.kanallar.filter(k => k !== id), paylasilan: b.paylasilan.filter(k => k !== id) })
    : guncelle({ kanallar: [...b.kanallar, id] });
  const paylasildi = (id: string) => {
    const p = b.paylasilan.includes(id) ? b.paylasilan.filter(k => k !== id) : [...b.paylasilan, id];
    const hepsi = b.kanallar.length > 0 && b.kanallar.every(k => p.includes(k));
    guncelle({ paylasilan: p }, hepsi ? { status: 'Paylaşıldı' } : asamasi(taslak) === 'Paylaşıldı' ? { status: 'Hazır' } : {});
  };

  const kopyala = () => {
    const m = [taslak.notes, b.hashtag].filter(Boolean).join('\n\n');
    try { void navigator.clipboard.writeText(m); } catch { /* yok */ }
  };

  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/30" onClick={onKapat}>
      <aside onClick={e => e.stopPropagation()} className="w-full lg:max-w-[500px] h-full overflow-y-auto bg-[#FAF8F5] dark:bg-[#13204A] lg:border-l border-[#CFC5B4] dark:border-[#2C3C72] shadow-2xl p-4 lg:p-5 space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className={ETIKET}>{b.tarih ? `Gönderi · ${new Date(b.tarih + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}` : 'Fikir · tarihsiz'}</div>
            <input value={taslak.title} onChange={e => setTaslak(t => ({ ...t, title: e.target.value, updatedAt: Date.now() }))} className={`mt-1 w-full bg-transparent text-[18px] font-bold ${YAZI} focus:outline-hidden`} />
          </div>
          <button type="button" onClick={onKapat} title="Kapat" className={`w-9 h-9 rounded-full flex items-center justify-center ${IKINCIL} hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer`}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ASAMALAR.map(a => <button key={a} type="button" onClick={() => setTaslak(t => ({ ...t, status: a, updatedAt: Date.now() }))} className={cip(asamasi(taslak) === a)}>{a}</button>)}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Tarih</span>
            <input type="date" value={b.tarih} onChange={e => guncelle({ tarih: e.target.value })} className={KUTU} /></label>
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Saat</span>
            <input type="time" value={b.saat} onChange={e => guncelle({ saat: e.target.value })} className={KUTU} /></label>
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Tür · yalnız KKM</span>
            <select value={b.tur} onChange={e => guncelle({ tur: e.target.value })} className={KUTU}>
              <option value="">—</option>{TURLER.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
            </select></label>
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Seri</span>
            <select value={b.seriId} onChange={e => guncelle({ seriId: e.target.value })} className={KUTU}>
              <option value="">Seri yok</option>{tumSeriler.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select></label>
        </div>

        <div>
          <div className={`mb-1 ${ETIKET}`}>Biçim</div>
          <div className="flex flex-wrap gap-1.5">{BICIMLER.map(f => <button key={f.id} type="button" onClick={() => guncelle({ bicim: f.id })} className={cip(b.bicim === f.id)}>{f.ad}</button>)}</div>
        </div>

        <div>
          <div className={`mb-1 ${ETIKET}`}>Kanallar · her biri ayrı işaretlenir</div>
          <div className="space-y-1.5">
            {KANALLAR.map(k => {
              const secili = b.kanallar.includes(k.id);
              const hesap = kanalHesabi(k, items);
              return (
                <div key={k.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-white dark:bg-[#17345A]">
                  <input type="checkbox" checked={secili} onChange={() => kanalAc(k.id)} className="w-4 h-4 accent-[#0E1C4F] cursor-pointer" />
                  <span className={`flex-1 min-w-0 text-[12.5px] ${YAZI}`}>{k.ad}{hesap && <span className={`ml-1 text-[11px] ${IKINCIL}`}>· {hesap}</span>}</span>
                  {secili && (
                    <button type="button" onClick={() => paylasildi(k.id)} className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md cursor-pointer ${b.paylasilan.includes(k.id) ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] text-white' : `border border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL}`}`}>
                      {b.paylasilan.includes(k.id) ? 'Paylaşıldı ✓' : 'Paylaşıldı mı?'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className={`mb-1 ${ETIKET}`}>Görsel</div>
          <div className="flex gap-2 items-start">
            <div className="w-28 h-28 shrink-0 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] overflow-hidden bg-[repeating-linear-gradient(45deg,#e9e2d5,#e9e2d5_10px,#f1ece3_10px,#f1ece3_20px)] flex items-center justify-center">
              {gorsel ? <img src={gorsel} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <ImageIcon className="w-6 h-6 text-[#CFC5B4]" />}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <button type="button" onClick={() => setGaleriAcik(g => !g)} className={`${DUGME_BOS} w-full`}>{galeriAcik ? 'Galeriyi kapat' : 'Galeriden seç'}</button>
              {gorsel && <button type="button" onClick={() => setTaslak(t => ({ ...t, images: [], updatedAt: Date.now() }))} className={`${DUGME_BOS} w-full`}>Görseli kaldır</button>}
              <input value={b.canva} onChange={e => guncelle({ canva: e.target.value })} placeholder="Canva bağlantısı" className={KUTU} />
              {b.canva && <a href={b.canva} target="_blank" rel="noreferrer" className="text-[11px] text-[#D6484C] dark:text-[#F26B6F] underline">Canva'da aç</a>}
            </div>
          </div>
          {galeriAcik && (
            <div className="mt-2 grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto">
              {galeri.length === 0 && <p className={`col-span-4 text-[12px] ${IKINCIL}`}>Galeride görsel yok.</p>}
              {galeri.map(g => (
                <button key={g.id} type="button" title={g.title} onClick={() => { void gorselOku(g.images[0]).then(v => { if (v) setTaslak(t => ({ ...t, images: [v], updatedAt: Date.now() })); }); setGaleriAcik(false); }} className="aspect-square rounded-md overflow-hidden border border-[#CFC5B4] hover:border-[#F26B6F] cursor-pointer">
                  <GorselImg src={g.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block"><span className={`block mb-1 ${ETIKET}`}>Metin</span>
          <textarea rows={4} value={taslak.notes} onChange={e => setTaslak(t => ({ ...t, notes: e.target.value, updatedAt: Date.now() }))} placeholder="Gönderi metni — senin yazın." className={KUTU} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Hashtag</span>
            <input value={b.hashtag} onChange={e => guncelle({ hashtag: e.target.value })} className={KUTU} /></label>
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>İlham · Pinterest</span>
            <input value={b.ilham} onChange={e => guncelle({ ilham: e.target.value })} placeholder="pin bağlantısı" className={KUTU} /></label>
        </div>

        <div>
          <div className={`mb-1 ${ETIKET}`}>Bağlar</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {baglar.map(x => (
              <span key={x.id} className={`inline-flex items-center gap-1 ${cip(false)}`}>
                <Link2 className="w-3 h-3" />{x.title}
                <button type="button" onClick={() => setTaslak(t => ({ ...t, links: t.links.filter(l => l !== x.id), updatedAt: Date.now() }))} className="ml-0.5 cursor-pointer" title="Bağı kaldır">×</button>
              </span>
            ))}
          </div>
          <select value="" onChange={e => { const id = e.target.value; if (id) setTaslak(t => ({ ...t, links: [...new Set([...t.links, id])], updatedAt: Date.now() })); }} className={KUTU}>
            <option value="">+ Bağ ekle…</option>
            {BAG_TURLERI.map(g => (
              <optgroup key={g.ad} label={g.ad}>
                {items.filter(i => g.turler.includes(i.type) && !i.archived && !i.isProposal && !taslak.links.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Not</span>
            <input value={b.not} onChange={e => guncelle({ not: e.target.value })} placeholder="müzik, çekim fikri…" className={KUTU} /></label>
          <label className="block"><span className={`block mb-1 ${ETIKET}`}>Paylaşılan bağlantı</span>
            <input value={b.baglanti} onChange={e => guncelle({ baglanti: e.target.value })} placeholder="paylaşınca" className={KUTU} /></label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={kopyala} className={`${DUGME_BOS} inline-flex items-center gap-1`}><Copy className="w-3 h-3" /> Metni kopyala</button>
          {gorsel && <a href={gorsel} download target="_blank" rel="noreferrer" className={`${DUGME_BOS} inline-flex items-center gap-1`}><Download className="w-3 h-3" /> Görseli indir</a>}
          <span title="İkinci adımda: Buffer hesabı ve anahtarı gerekiyor" className={`${DUGME_BOS} opacity-40 cursor-not-allowed`}>Buffer'a gönder · 2. adım</span>
        </div>

        <div className="pt-3 border-t border-[#CFC5B4] dark:border-[#2C3C72]">
          {silOnay ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#B23A40] dark:text-[#F26B6F]">Gönderi silinsin mi? Geri gelmez.</span>
              <button type="button" onClick={() => setSilOnay(false)} className={DUGME_BOS}>Vazgeç</button>
              <button type="button" onClick={async () => { await onDeleteItem(taslak.id); onKapat(); }} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F26B6F] text-white cursor-pointer">Evet, sil</button>
            </div>
          ) : (
            <button type="button" onClick={() => setSilOnay(true)} className={`inline-flex items-center gap-1 text-[11px] ${IKINCIL} hover:text-[#D6484C] cursor-pointer`}><Trash2 className="w-3.5 h-3.5" /> Gönderiyi sil</button>
          )}
        </div>
      </aside>
    </div>
  );
};

export default GonderiKarti;
