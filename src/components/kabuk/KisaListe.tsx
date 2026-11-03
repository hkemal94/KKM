import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Kısa liste (3 Kasım, Kemal: "uzun listeler basınca açılıp kapansın, PC ve
 * mobil"). Kart içindeki listede ilk 5 satır görünür, altında "Hepsini
 * göster (n)"; basınca hepsi açılır, "Daha az göster" ile yine kapanır.
 * Açık / kapalı yalnız ekranda durur, hiçbir kayda yazılmaz.
 *
 * Kullanım: listenin dış etiketi yerine konur, satırlar aynen içine yazılır.
 *   <KisaListe as="ul" className="space-y-1">{liste.map(x => <li …/>)}</KisaListe>
 * Ana içerik listelerinde (viki madde listesi, galeri, kitap bölümleri)
 * kullanılmaz; yalnız kart içindeki uzun listelerde.
 */
export const KisaListe: React.FC<{
  /** Dış etiket: liste ise ul / ol, değilse div */
  as?: 'ul' | 'ol' | 'div';
  className?: string;
  /** Kapalıyken görünen satır sayısı */
  sinir?: number;
  /** Düğmenin ek sınıfı (ör. iç boşluk) */
  dugmeClassName?: string;
  children: React.ReactNode;
}> = ({ as = 'ul', className, sinir = 5, dugmeClassName = '', children }) => {
  const [acik, setAcik] = useState(false);
  const satirlar = React.Children.toArray(children);
  const uzun = satirlar.length > sinir;
  const Etiket = as;
  return (
    <>
      <Etiket className={className}>{uzun && !acik ? satirlar.slice(0, sinir) : satirlar}</Etiket>
      {uzun && (
        <button
          type="button"
          onClick={() => setAcik(a => !a)}
          aria-expanded={acik}
          className={`min-h-9 inline-flex items-center gap-1 text-[12px] font-semibold text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] dark:hover:text-[#F26B6F] cursor-pointer ${dugmeClassName}`}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${acik ? 'rotate-180' : ''}`} />
          {acik ? 'Daha az göster' : `Hepsini göster (${satirlar.length})`}
        </button>
      )}
    </>
  );
};

export default KisaListe;
