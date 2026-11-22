import { doc, getDoc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import { taslakCoz, taslakYazisi, TASLAK_SURUMU } from './taslak';
import { VERI_SINIRI, yereldenOku, yereleYaz, type TaslakDeposu, type TaslakKaydi } from './taslakDeposu';

/**
 * Taslağın KKM kaydı: Firestore `duzada/tekHaritaTaslak` (7. adım). Belge:
 * { surum, guncelleme, sayac, veri } — `veri` taslağın JSON yazısı (yalnız değişiklikler).
 * Harita kaydına (`duzada/haritaDuzeni`) dokunmaz. Kural `firestore.rules`'ta.
 *
 * Yazma tek işlemde (transaction): kayıttaki sayaç bu sekmenin bildiğinden büyükse başka
 * bir sekme ya da cihaz yazmış demektir; yazmaz, ekran "sayfayı yenile" der.
 */

const belge = () => doc(db, 'duzada', 'tekHaritaTaslak');

const zamanla = <T,>(s: Promise<T>, ms: number) => Promise.race([s, new Promise<never>((_, ret) => setTimeout(() => ret({ code: 'zaman-asimi' }), ms))]);

const kod = (e: unknown) => String((e as { code?: string })?.code ?? e);

export const firestoreDeposu: TaslakDeposu = {
  ad: 'KKM kaydı',
  async oku(): Promise<TaslakKaydi | null> {
    const yerel = yereldenOku();
    try {
      const s = await zamanla(getDocFromServer(belge()).catch(() => getDoc(belge())), 8000);
      if (!s.exists()) return yerel;
      const d = s.data() as { veri?: string; sayac?: number; guncelleme?: number };
      const bulut: TaslakKaydi = { taslak: taslakCoz(JSON.parse(String(d.veri ?? '{}'))), sayac: Number(d.sayac) || 0, guncelleme: Number(d.guncelleme) || 0 };
      // Bu tarayıcıda buluta ulaşamamış daha yeni bir taslak varsa o (sayaç bulutunki)
      if (yerel && yerel.guncelleme > bulut.guncelleme && yerel.sayac >= bulut.sayac) return { ...yerel, sayac: bulut.sayac };
      return bulut;
    } catch {
      return yerel;
    }
  },
  async yaz(t, sayac) {
    const veri = taslakYazisi(t);
    const simdi = Date.now();
    yereleYaz(veri, sayac, simdi);
    if (veri.length > VERI_SINIRI) return { sonuc: { durum: 'yerel', neden: 'buyuk' }, sayac };
    try {
      const yeni = await zamanla(runTransaction(db, async is => {
        const s = await is.get(belge());
        const buluttaki = s.exists() ? Number((s.data() as { sayac?: number }).sayac) || 0 : 0;
        if (buluttaki > sayac) return null;
        const n = sayac + 1;
        is.set(belge(), { surum: TASLAK_SURUMU, guncelleme: simdi, sayac: n, veri });
        return n;
      }), 12000);
      if (yeni === null) return { sonuc: { durum: 'cakisma' }, sayac };
      yereleYaz(veri, yeni, simdi);
      return { sonuc: { durum: 'bulut' }, sayac: yeni };
    } catch (e) {
      const c = kod(e);
      return { sonuc: { durum: 'yerel', neden: /permission/i.test(c) ? 'kural' : /unavailable|zaman-asimi|offline/i.test(c) ? 'baglanti' : c }, sayac };
    }
  }
};

export default firestoreDeposu;
