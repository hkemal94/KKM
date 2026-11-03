import React, { useEffect, useState } from 'react';
import { KisaListe } from '../kabuk/KisaListe';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import { DURUM_ADI, isleriOku, kimdeAdi, type AjansIsi } from '../../lib/isler';
import { DUGME_BOS, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * İçerik → Video (2 Kasım, Kemal: "sade bir sekme"). Eylül Altunkaya'nın
 * vlog süreci: ham çekim Drive'daki "Eylül Vlog Ham" klasörüne gider, Kems
 * yazıya döker ve başlık, açıklama, bölüm hazırlar; çıktılar Drive'da
 * videonun yanına. Burada klasörün bağlantısı ve ajansın iş dosyasındaki
 * video işleri durur. Yalnız okur; onay Onay bekleyenler'de.
 */
const HAM_KLASOR = 'https://drive.google.com/drive/folders/1YyvsvBbtaMT8nA9jP_9VcoH_ImjKD9VV';
const VIDEO_ISI = /video|vlog|youtube|eylül|eylul/i;

export function IcerikVideo({ onAjans }: { onAjans: () => void }) {
  const anahtar = anahtariOku();
  const [isler, setIsler] = useState<AjansIsi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    isleriOku(anahtar)
      .then(d => { if (!iptal) setIsler((d?.isler || []).filter(i => VIDEO_ISI.test(`${i.metin} ${i.konu || ''}`) || i.kimde.startsWith('video-'))); })
      .catch(e => { if (!iptal) setHata(e instanceof Error ? e.message : String(e)); });
    return () => { iptal = true; };
  }, [anahtar]);

  return (
    <div className="space-y-3">
      <section className={`${KART} p-4 space-y-2`}>
        <p className={`text-[13px] font-semibold ${YAZI}`}>Eylül Altunkaya vlogları</p>
        <p className={`text-[12px] leading-relaxed ${IKINCIL}`}>
          Çekimi Drive'daki "Eylül Vlog Ham" klasörüne at, Kems'e "video geldi" de. Kems yazıya döker; başlık adayları,
          açıklama ve bölümler Drive'da videonun yanına gelir. Hiçbir şey yayınlanmaz, yüklemeyi sen yaparsın.
        </p>
        <a href={HAM_KLASOR} target="_blank" rel="noreferrer" className={DUGME_BOS}>
          <FolderOpen className="w-3.5 h-3.5" /> Eylül Vlog Ham klasörü <ExternalLink className="w-3 h-3" />
        </a>
      </section>

      <section className={`${KART} p-4 space-y-2`}>
        <p className={`text-[13px] font-semibold ${YAZI}`}>Ajanstaki video işleri</p>
        {!anahtar ? (
          <p className={`text-[12px] ${IKINCIL}`}>
            Bu tarayıcıda GitHub anahtarı yok; ajansın iş listesi okunamıyor.{' '}
            <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button>
          </p>
        ) : hata ? (
          <p className={`text-[12px] ${YAZI}`}>Okunamadı ({hata}).</p>
        ) : !isler ? (
          <p className={`text-[12px] ${IKINCIL}`}>Okunuyor…</p>
        ) : !isler.length ? (
          <p className={`text-[12px] ${IKINCIL}`}>Şu an video işi yok.</p>
        ) : (
          <KisaListe className="space-y-1.5">
            {isler.map(i => (
              <li key={i.id} className={`text-[12px] ${YAZI}`}>
                <span className="font-semibold">{DURUM_ADI[i.durum]}</span> · {i.metin}
                <span className={`block text-[11px] ${IKINCIL}`}>{kimdeAdi(i.kimde)}{i.not ? ` · ${i.not}` : ''}</span>
              </li>
            ))}
          </KisaListe>
        )}
      </section>
    </div>
  );
}
