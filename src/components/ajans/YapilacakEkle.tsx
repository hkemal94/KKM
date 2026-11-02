import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { kimdeAdi } from '../../lib/isler';
import { istekEkle, istekleriOku, type KemalIstegi } from '../../lib/kemalIstekleri';
import { DUGME_LAC, IKINCIL, KART, YAZI, neZaman } from '../anasayfa/stil';

/**
 * İşler ve takvim → Yapılacak ekle (2 Kasım, Kemal: "Kems'in limiti yoksa
 * bile not alabilmek isterim"). Not ajansın deposuna hemen yazılır
 * (`lib/kemalIstekleri.ts`); Kems'in o an çalışması gerekmez. Altta Kems'in
 * henüz almadığı notlar ve ajan düğmesinden gelen istekler durur; Kems
 * alınca listeden kalkar ve "Kimde ne var"da iş olarak görünür.
 */
export const YapilacakEkle: React.FC = () => {
  const anahtar = anahtariOku();
  const [metin, setMetin] = useState('');
  const [bekleyen, setBekleyen] = useState<KemalIstegi[] | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    istekleriOku(anahtar).then(l => { if (!iptal) setBekleyen(l); }).catch(() => { if (!iptal) setBekleyen([]); });
    return () => { iptal = true; };
  }, [anahtar]);

  if (!anahtar) return null; // Kimde ne var anahtar yokken zaten söylüyor

  const ekle = async () => {
    setCalisiyor(true);
    setMesaj(null);
    try {
      setBekleyen(await istekEkle(anahtar, { tur: 'yapilacak', metin }));
      setMetin('');
      setMesaj('Not ajansa yazıldı. Kems sonraki oturumunda panoya ve iş listesine alır.');
    } catch (e) {
      setMesaj(`Yazılamadı: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setCalisiyor(false); }
  };

  return (
    <section className={`${KART} p-4 space-y-2`}>
      <p className={`text-[13px] font-semibold ${YAZI}`}>Yapılacak ekle</p>
      <div className="flex gap-2">
        <input value={metin} onChange={e => setMetin(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && metin.trim() && !calisiyor) void ekle(); }}
          placeholder="Aklına geleni yaz; Kems'in limiti dolu olsa da kaybolmaz"
          className={`flex-1 min-w-0 min-h-11 lg:min-h-9 px-3 rounded-lg text-[13px] bg-[#FAF8F5] dark:bg-[#13204A] ${YAZI} border border-[#CFC5B4] dark:border-[#2C3C72] focus:outline-hidden focus:border-[#F26B6F]`} />
        <button type="button" disabled={calisiyor || !metin.trim()} onClick={() => void ekle()} className={DUGME_LAC}>
          <Plus className="w-3.5 h-3.5" /> {calisiyor ? 'Yazılıyor…' : 'Ekle'}
        </button>
      </div>
      {mesaj && <p className={`text-[12px] ${YAZI}`}>{mesaj}</p>}
      {bekleyen && bekleyen.length > 0 && (
        <div>
          <p className={`text-[11px] ${IKINCIL}`}>Kems'in henüz almadıkları ({bekleyen.length})</p>
          <ul className="mt-1 space-y-1">
            {bekleyen.slice().reverse().map(i => (
              <li key={i.id} className={`text-[12px] ${YAZI}`}>
                {i.metin}
                <span className={`block text-[11px] ${IKINCIL}`}>
                  {i.tur === 'istek' ? `Ajan düğmesi · ${i.ekran || ''}${i.ajan ? ` · ${kimdeAdi(i.ajan)}` : ''}` : 'Not'} · {neZaman(Date.parse(i.tarih))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
