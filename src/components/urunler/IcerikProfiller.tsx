import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { anahtariOku } from '../../lib/oyunAyarlari';
import {
  ASAMALAR, asamaDegistir, icerikDegistir, icerikOku, PLATFORM_ADI, TUR_ADI, yeniIcerikKimligi,
  type Asama, type Icerik, type IcerikDosyasi, type IcerikTuru, type Platform, type Profil
} from '../../lib/icerikProfilleri';
import { ajanAdi } from '../../lib/geceTuru';
import { DUGME_BOS, DUGME_LAC, ETIKET, IKINCIL, KART, YAZI } from '../anasayfa/stil';

/**
 * İçerik → Profiller (12 Kasım, Kemal). Önce profil kartları (Kems Company,
 * Eylül Altunkaya); profile basınca kanalları ve Fikir · Taslak · Hazır ·
 * Paylaşıldı panosu, türe ve kanala göre süzülür. Veri `lib/icerikProfilleri.ts`.
 */

const cip = (on: boolean) => `min-h-9 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer ${on ? 'bg-[#0E1C4F] dark:bg-[#2C3C72] border-transparent text-[#F3EFE8]' : `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI}`}`;
const hata = (e: unknown) => (e instanceof Error ? e.message : String(e));

const KanalCipi: React.FC<{ k: Profil['kanallar'][number] }> = ({ k }) => {
  const ic = <>{PLATFORM_ADI[k.platform]} {k.acik ? <span className="font-normal opacity-80">{k.hesap}</span> : <span className="font-normal">· açılacak</span>}</>;
  const sinif = `inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border ${k.acik ? `border-[#CFC5B4] dark:border-[#2C3C72] ${YAZI}` : `border-dashed border-[#CFC5B4] dark:border-[#2C3C72] ${IKINCIL}`}`;
  return k.adres && k.acik
    ? <a href={k.adres} target="_blank" rel="noreferrer" className={`${sinif} hover:border-[#F26B6F]`}>{ic}<ExternalLink className="w-3 h-3" /></a>
    : <span className={sinif}>{ic}</span>;
};

export const IcerikProfiller: React.FC<{ onAjans: () => void }> = ({ onAjans }) => {
  const anahtar = anahtariOku();
  const [veri, setVeri] = useState<IcerikDosyasi | null>(null);
  const [profilId, setProfilId] = useState<string | null>(null);
  const [tur, setTur] = useState<IcerikTuru | 'hepsi'>('hepsi');
  const [kanal, setKanal] = useState<Platform | 'hepsi'>('hepsi');
  const [telefonAsama, setTelefonAsama] = useState<Asama>('fikir');
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [yeni, setYeni] = useState<{ baslik: string; tur: IcerikTuru; kanallar: Platform[] } | null>(null);

  useEffect(() => {
    if (!anahtar) return;
    let iptal = false;
    void icerikOku(anahtar).then(d => { if (!iptal) setVeri(d); });
    return () => { iptal = true; };
  }, [anahtar]);

  const profil = veri?.profiller.find(p => p.id === profilId) || null;
  const liste = useMemo(() => (veri?.icerikler || []).filter(i => i.profil === profilId
    && (tur === 'hepsi' || i.tur === tur) && (kanal === 'hepsi' || i.kanallar.includes(kanal))), [veri, profilId, tur, kanal]);

  const calistir = async (ad: string, f: () => Promise<IcerikDosyasi>, tamam?: string) => {
    if (!anahtar) return;
    setMesgul(ad); setMesaj(null);
    try { setVeri(await f()); if (tamam) setMesaj(tamam); } catch (e) { setMesaj(`Yazılamadı: ${hata(e)}`); } finally { setMesgul(null); }
  };

  if (!anahtar) {
    return (
      <section className={`${KART} p-4 text-[13px] ${YAZI}`}>
        Profiller ajansın deposundan okunur; bu tarayıcıda Ajans bağlantısı yok.{' '}
        <button type="button" onClick={onAjans} className="underline cursor-pointer">Ajans bağlantısı</button>
      </section>
    );
  }
  if (!veri) return <p className={`text-[13px] ${IKINCIL}`}>Profiller okunuyor…</p>;

  // ---------------------------------------------------------------- profil kartları
  if (!profil) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {veri.profiller.map(p => {
          const ic = veri.icerikler.filter(i => i.profil === p.id);
          return (
            <button key={p.id} type="button" onClick={() => { setProfilId(p.id); setTur('hepsi'); setKanal('hepsi'); }}
              className={`${KART} p-4 text-left space-y-2.5 cursor-pointer hover:ring-2 hover:ring-[#F26B6F]/40`}>
              <span className="flex items-center gap-2">
                <span className={`flex-1 text-[16px] font-bold ${YAZI}`}>{p.ad}</span>
                <ArrowRight className={`w-4 h-4 ${IKINCIL}`} />
              </span>
              <span className="flex flex-wrap gap-1.5">{p.kanallar.map(k => <KanalCipi key={k.platform} k={k} />)}</span>
              <span className="grid grid-cols-4 gap-1.5">
                {ASAMALAR.map(a => (
                  <span key={a.id} className="rounded-lg bg-[#F3EFE8] dark:bg-[#0B132B] px-2 py-1.5 text-center">
                    <b className={`block text-[15px] tabular-nums ${YAZI}`}>{ic.filter(i => i.asama === a.id).length}</b>
                    <span className={`block text-[10.5px] ${IKINCIL}`}>{a.ad}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------- profil sayfası
  const platformlar = profil.kanallar.map(k => k.platform);
  const kart = (i: Icerik) => {
    const sira = ASAMALAR.findIndex(a => a.id === i.asama);
    const sonraki = ASAMALAR[sira + 1], onceki = ASAMALAR[sira - 1];
    return (
      <li key={i.id} className="rounded-xl border border-[#CFC5B4]/80 dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A] p-2.5 space-y-1.5">
        <div className={`text-[13px] font-semibold leading-snug ${YAZI}`}>{i.baslik}</div>
        <div className={`text-[11px] ${IKINCIL}`}>{TUR_ADI[i.tur]} · {i.kanallar.map(k => PLATFORM_ADI[k]).join(', ')}{i.kaynak ? ` · ${i.kaynak === 'kemal' ? 'senin' : ajanAdi(i.kaynak)}` : ''}</div>
        {i.ozet && <p className={`text-[12px] leading-snug ${YAZI} line-clamp-3`}>{i.ozet}</p>}
        {i.baglanti && <a href={i.baglanti} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[11px] font-semibold ${YAZI} underline`}>Taslağı aç <ExternalLink className="w-3 h-3" /></a>}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {onceki && <button type="button" disabled={!!mesgul} onClick={() => void calistir(i.id, () => asamaDegistir(anahtar, i, onceki.id, profil.ad))} className={DUGME_BOS} title={`${onceki.ad}'e geri`}><ArrowLeft className="w-3 h-3" /></button>}
          {sonraki && (
            <button type="button" disabled={!!mesgul} onClick={() => void calistir(i.id, () => asamaDegistir(anahtar, i, sonraki.id, profil.ad),
              i.asama === 'fikir' ? `"${i.baslik}" taslağa alındı; ajan bu gece taslağını hazırlar.` : undefined)} className={DUGME_LAC}>
              {mesgul === i.id ? '…' : <>{sonraki.ad} <ArrowRight className="w-3 h-3" /></>}
            </button>
          )}
          {silinecek === i.id ? (
            <>
              <button type="button" disabled={!!mesgul} onClick={() => void calistir(i.id, () => icerikDegistir(anahtar, `KKM içerik: "${i.baslik}" silindi`, d => ({ ...d, icerikler: d.icerikler.filter(x => x.id !== i.id) })))} className={`${DUGME_BOS} text-[#D6484C]`}>Sil</button>
              <button type="button" onClick={() => setSilinecek(null)} className={DUGME_BOS}>Vazgeç</button>
            </>
          ) : <button type="button" onClick={() => setSilinecek(i.id)} className={DUGME_BOS} aria-label="Sil"><Trash2 className="w-3 h-3" /></button>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <section className={`${KART} p-3.5 space-y-2.5`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setProfilId(null)} className={DUGME_BOS} aria-label="Profillere dön"><ArrowLeft className="w-3.5 h-3.5" /></button>
          <span className={`flex-1 text-[17px] font-bold ${YAZI}`}>{profil.ad}</span>
          <button type="button" onClick={() => setYeni({ baslik: '', tur: 'video', kanallar: [platformlar[0]] })} className={DUGME_LAC}><Plus className="w-3.5 h-3.5" /> Fikir</button>
        </div>
        <div className="flex flex-wrap gap-1.5">{profil.kanallar.map(k => <KanalCipi key={k.platform} k={k} />)}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ETIKET}>Tür</span>
          {(['hepsi', 'video', 'short', 'gonderi', 'hikaye'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTur(t)} aria-pressed={tur === t} className={cip(tur === t)}>{t === 'hepsi' ? 'Hepsi' : TUR_ADI[t]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ETIKET}>Kanal</span>
          {(['hepsi', ...platformlar] as const).map(k => (
            <button key={k} type="button" onClick={() => setKanal(k)} aria-pressed={kanal === k} className={cip(kanal === k)}>{k === 'hepsi' ? 'Hepsi' : PLATFORM_ADI[k]}</button>
          ))}
        </div>
      </section>

      {yeni && (
        <form className={`${KART} p-3 space-y-2`} onSubmit={e => {
          e.preventDefault();
          if (!yeni.baslik.trim() || !yeni.kanallar.length) return;
          const ic: Icerik = { id: yeniIcerikKimligi(), profil: profil.id, tur: yeni.tur, kanallar: yeni.kanallar, baslik: yeni.baslik.trim(), asama: 'fikir', kaynak: 'kemal', tarih: new Date().toISOString() };
          void calistir('yeni', () => icerikDegistir(anahtar, `KKM içerik: yeni fikir "${ic.baslik}"`, d => ({ ...d, icerikler: [...d.icerikler, ic] })), 'Fikir eklendi.').then(() => setYeni(null));
        }}>
          <div className="flex items-center gap-2">
            <input autoFocus value={yeni.baslik} onChange={e => setYeni({ ...yeni, baslik: e.target.value })} placeholder="Fikrin kısaca…"
              className={`flex-1 min-w-0 min-h-11 px-3 rounded-lg text-[13px] bg-[#F3EFE8] dark:bg-[#0B132B] ${YAZI} focus:outline-hidden`} />
            <button type="button" onClick={() => setYeni(null)} aria-label="Vazgeç" className={`w-11 h-11 flex items-center justify-center ${IKINCIL} cursor-pointer`}><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['video', 'short', 'gonderi', 'hikaye'] as const).map(t => <button key={t} type="button" onClick={() => setYeni({ ...yeni, tur: t })} aria-pressed={yeni.tur === t} className={cip(yeni.tur === t)}>{TUR_ADI[t]}</button>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {platformlar.map(k => {
              const on = yeni.kanallar.includes(k);
              return <button key={k} type="button" onClick={() => setYeni({ ...yeni, kanallar: on ? yeni.kanallar.filter(x => x !== k) : [...yeni.kanallar, k] })} aria-pressed={on} className={cip(on)}>{PLATFORM_ADI[k]}</button>;
            })}
          </div>
          <button type="submit" disabled={!yeni.baslik.trim() || !yeni.kanallar.length || !!mesgul} className={DUGME_LAC}>{mesgul === 'yeni' ? 'Ekleniyor…' : 'Fikirlere ekle'}</button>
        </form>
      )}

      {mesaj && <p className={`px-3 py-2 rounded-lg bg-[#F3EFE8] dark:bg-[#17345A] text-[12px] ${YAZI}`}>{mesaj} <button type="button" onClick={() => setMesaj(null)} className="underline cursor-pointer">tamam</button></p>}

      {/* Telefonda aşama sekmeleri, masaüstünde dört sütun */}
      <div className="flex gap-1.5 overflow-x-auto lg:hidden">
        {ASAMALAR.map(a => (
          <button key={a.id} type="button" onClick={() => setTelefonAsama(a.id)} aria-pressed={telefonAsama === a.id} className={cip(telefonAsama === a.id)}>
            {a.ad} · {liste.filter(i => i.asama === a.id).length}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {ASAMALAR.map(a => {
          const l = liste.filter(i => i.asama === a.id);
          return (
            <section key={a.id} className={`${KART} p-2.5 min-w-0 ${telefonAsama === a.id ? '' : 'hidden lg:block'}`}>
              <div className={`hidden lg:flex items-center gap-2 px-1 pb-2 ${ETIKET}`}><span className="flex-1">{a.ad}</span><span className="tabular-nums">{l.length}</span></div>
              {l.length ? <ul className="space-y-2">{l.map(kart)}</ul>
                : <p className={`px-1 py-2 text-[12px] ${IKINCIL}`}>{a.id === 'fikir' ? 'Henüz fikir yok. Ajan getirince ya da "+ Fikir" ile eklenince burada.' : 'Boş.'}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default IcerikProfiller;
