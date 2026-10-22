import React, { useState } from 'react';
import { Send } from 'lucide-react';
import type { Item } from '../types';
import { anahtariOku } from '../lib/oyunAyarlari';
import { yaziTuru, yaziyiGonder } from '../lib/yaziAjansa';

/**
 * "Yazı Editörü'ne gönder" düğmesi (Blog ve Kitap ekranlarında, `lib/yaziAjansa.ts`).
 * Yalnız Kemal basınca çalışır; gönderilince yazının kaydına
 * `metadata.yaziEditorunuGonderildi` yazılır ve düğme "Yeniden gönder" olur.
 */
export const YaziEditorunuGonder: React.FC<{ yazi: Item; onUpdateItem: (item: Item) => Promise<void> }> = ({ yazi, onUpdateItem }) => {
  const [gidiyor, setGidiyor] = useState(false);
  const [hata, setHata] = useState('');
  const tur = yaziTuru(yazi);
  if (!tur) return null;

  const onceki = yazi.metadata?.yaziEditorunuGonderildi as string | undefined;
  const anahtar = anahtariOku();

  const gonder = async () => {
    if (!anahtar) { setHata('Önce ajans bağlantısını kur (Durum → Ajans\'taki GitHub anahtarı).'); return; }
    setGidiyor(true);
    setHata('');
    try {
      const { zaman } = await yaziyiGonder(anahtar, yazi, tur);
      await onUpdateItem({ ...yazi, metadata: { ...(yazi.metadata || {}), yaziEditorunuGonderildi: zaman } });
    } catch (e) {
      setHata(`Gönderilemedi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGidiyor(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void gonder()}
        disabled={gidiyor}
        className="px-3 py-1.5 bg-[#FAF7F2] hover:bg-[#FAF6EE] dark:bg-stone-900 border border-[#CFC5B4] dark:border-stone-850 text-stone-700 dark:text-[#A6B0C9] hover:text-[#F26B6F] text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        title="Metin ajansın gizli deposuna gider; Yazı Editörü yazım ve akış notu bırakır, metni yeniden yazmaz"
      >
        <Send className="w-3.5 h-3.5" />
        <span>
          {gidiyor ? 'Gönderiliyor…' : onceki ? `Gönderildi · ${new Date(onceki).toLocaleDateString('tr-TR')} · Yeniden gönder` : 'Yazı Editörü\'ne gönder'}
        </span>
      </button>
      {hata && <span className="text-[11px] text-[#B23A40] font-sans max-w-60">{hata}</span>}
    </div>
  );
};
