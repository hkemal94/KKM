import React, { useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { useHaritaDuzeni } from '../lib/haritaDuzeni';
import { haritaGocu, haritaGocuGerekli, haritaGocuOzeti } from '../lib/merkezGocu';
import { bozukYollar, yolAdi, yollariOnar } from '../lib/haritaOnarim';

/**
 * Harita yenilendi (8 Ekim): eski Merkez'den ve eski ev dizilişinden kalan
 * Kurucu kayıtları. Yalnız kayıt eski haritaya göreyse görünür; basınca
 * temizlenir, kayıt yeni haritaya göre işaretlenir ve kart bir daha çıkmaz.
 */
export const HaritaGocuKarti: React.FC = () => {
  const harita = useHaritaDuzeni();
  const gerekli = haritaGocuGerekli(harita.duzen);
  const say = useMemo(() => (harita.duzen && gerekli ? haritaGocuOzeti(harita.duzen) : null), [harita.duzen, gerekli]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!harita.ilkYukleme || !harita.duzen || !gerekli || !say) return null;

  const satirlar = [
    say.evDuzeni && `${say.evDuzeni} ev taşıması (eski evlere aitti)`,
    say.gizlenen && `${say.gizlenen} kaldırılmış eski ev ya da sokak`,
    say.sokakDuzeni && `${say.sokakDuzeni} eski sokak düzeni`,
    say.bag && `${say.bag} eski eve madde bağı`,
    say.kamu && `Belediye, okul, pazar gibi ${say.kamu} yapının eski köydeki konum ayarı`,
    say.kendiYol && `eski köyün yerinde çizdiğin ${say.kendiYol} yol`,
    say.kendiYapi && `eski köyün yerinde koyduğun ${say.kendiYapi} yapı`
  ].filter(Boolean) as string[];

  const isle = async () => {
    if (calisiyor || !harita.duzen) return;
    setCalisiyor(true);
    try {
      const tamam = await harita.kaydet(haritaGocu(harita.duzen));
      setRapor(tamam
        ? 'Kurucu kaydı yeni haritaya uyarlandı. Eski Merkez\'den kalanlar silindi; yeni Merkez Kurucu\'da ve haritada.'
        : 'Bu tarayıcıya yazıldı ama buluta ulaşamadı; bağlantı gelince kendiliğinden gönderilir.');
    } catch (e) {
      setRapor(`Yazılamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <MapPinned className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Harita yenilendi: Kurucu kaydını uyarla</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Merkez dört yol ağzında yeniden kuruldu, evler arsalarıyla yeniden dizildi. Kurucu kaydında eski haritaya ait şunlar
            duruyor; artık yanlış eve uygulanıyor ya da boş yerde duruyorlar. Basınca silinir, sonraki düzenlemelerine dokunulmaz.
            Kurucu açıksa önce kapat.
          </p>
          {satirlar.length ? (
            <ul className="mt-1.5 list-disc pl-5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
              {satirlar.map(s => <li key={s}>{s}</li>)}
            </ul>
          ) : (
            <p className="mt-1.5 text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">Silinecek eski kayıt yok; kayıt yalnız yeni haritaya göre işaretlenir.</p>
          )}
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void isle()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Uyarla'}
        </button>
      </div>
    </div>
  );
};

/**
 * Bozulan yollar (8 Ekim): kayıtta 0 metreye inmiş yol düzenleri. Basınca
 * silinir, yol üreteçteki hâline döner (`lib/haritaOnarim.ts`).
 */
export const HaritaOnarimKarti: React.FC = () => {
  const harita = useHaritaDuzeni();
  const bozuk = useMemo(() => bozukYollar(harita.duzen), [harita.duzen]);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<string | null>(null);

  if (rapor) return <p className="mb-2.5 px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#13204A] text-[13px] text-[#336659] dark:text-[#8FC4A8]">{rapor}</p>;
  if (!harita.ilkYukleme || !harita.duzen || !bozuk.length) return null;
  const adlar = bozuk.map(yolAdi);

  const onar = async () => {
    if (calisiyor || !harita.duzen) return;
    setCalisiyor(true);
    try {
      const tamam = await harita.kaydet(yollariOnar(harita.duzen));
      setRapor(tamam ? `${adlar.join(', ')} haritaya geri döndü.` : 'Bu tarayıcıya yazıldı ama buluta ulaşamadı; bağlantı gelince kendiliğinden gönderilir.');
    } catch (e) {
      setRapor(`Yazılamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
    } finally { setCalisiyor(false); }
  };

  return (
    <div className="mb-2.5 px-4 py-3 rounded-xl border border-[#F26B6F]/40 bg-[#FAF8F5] dark:bg-[#13204A]">
      <div className="flex items-start gap-3">
        <MapPinned className="w-4 h-4 mt-0.5 shrink-0 text-[#D6484C] dark:text-[#F26B6F]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8]">Haritadan kaybolan yol: {adlar.join(', ')}</p>
          <p className="mt-0.5 text-[12px] text-[#6A5E4C] dark:text-[#A6B0C9]">
            Kurucu'da bu yola dokunulunca kayıtta tek bir noktaya (0 metreye) indi; kapalı halkalarda kayıt küçülten araçtaki bir hatadan.
            Hata düzeldi. Basınca bozuk kayıt silinir, yol eski hâline döner. Bu yolda yaptığın düzenleme kayıtta kalmadığı için geri gelmez.
            Kurucu açıksa önce kapat.
          </p>
        </div>
        <button type="button" disabled={calisiyor} onClick={() => void onar()}
          className="shrink-0 min-h-9 px-3 rounded-lg bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[12px] font-semibold disabled:opacity-40 cursor-pointer">
          {calisiyor ? 'Yazılıyor…' : 'Geri getir'}
        </button>
      </div>
    </div>
  );
};

export default HaritaGocuKarti;
