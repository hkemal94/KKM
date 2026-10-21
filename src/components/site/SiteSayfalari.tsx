import React, { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, AtSign, Mail } from 'lucide-react';
import type { Item } from '../../types';
import { GorselImg } from '../GorselImg';
import { DuzadaHarita } from '../harita/DuzadaHarita';
import type { HaritaDuzeni } from '../harita/duzenTipi';
import { ATMOSFER_ACIK } from '../harita/atmosferAyari';
import { TYPE_LABELS } from '../wiki/wikiSchema';
import { sitedeGorselVar, sitedeGovde, sitedeKunye, sitedeTakmaAdlar } from '../../lib/siteGizleme';
import { fanzinBilgisi } from '../../lib/studyo';
import { DergiGorunumu } from '../fanzin/Fanzin';

/**
 * Site sayfaları (30 Eylül). Kemal: "Siteye ait örneklerin yapılarını
 * inceledin, ona uygun boş bile olsa site sayfalarına ait temayı hazırla."
 *
 * Kaynak: Canva "Başlık" panosu (DAHWBjgxb_4). Her sayfanın notu oradan:
 *   Düzada    — evrenin haritası; tıklanan yer vikiye gider
 *   Viki      — fandom ekranı, evrene ait ayrıntılar
 *   Ürünler   — satış yok; dropları ve hikâyelerini tanıtır, ürün dış
 *               mağazaya bağlanır
 *   Haberler  — blog ve bülten
 *   Projeler  — merch dışındaki işler, yana kayan ekranda
 *   Hakkında  — bir iki cümle
 *   İletişim  — sosyal medya hesapları ve e-posta
 *
 * Buradaki bütün yazılar düzen yazısıdır (sayfa adı, "yakında"). Kurgu
 * metni yok: boş yer "yakında" çerçevesiyle boş görünür. Sitede yalnız
 * Kemal'in "sitede göster" dediği kayıtlar çıkar.
 */

export type SayfaTonu = 'krem' | 'lacivert' | 'gok';

const TON: Record<SayfaTonu, { zemin: string; yazi: string; ikincil: string; cizgi: string; bos: string }> = {
  krem: { zemin: 'bg-[#F3EFE8]', yazi: 'text-[#0E1C4F]', ikincil: 'text-[#6A5E4C]', cizgi: 'border-[#CFC5B4]', bos: 'border-[#CFC5B4] text-[#9C8F7A] bg-[#FAF8F5]' },
  lacivert: { zemin: 'bg-[#0E1C4F]', yazi: 'text-[#F3EFE8]', ikincil: 'text-[#A6B0C9]', cizgi: 'border-[#2C3C72]', bos: 'border-[#2C3C72] text-[#6F7BA0] bg-[#13204A]' },
  gok: { zemin: 'bg-[linear-gradient(180deg,#9CC7E6_0%,#D7E8F2_42%,#E8EBD2_62%,#9DB86A_100%)]', yazi: 'text-[#0E1C4F]', ikincil: 'text-[#35507A]', cizgi: 'border-[#0E1C4F]/15', bos: 'border-[#0E1C4F]/20 text-[#35507A] bg-white/55' }
};

/** Boş yer: çerçeve + "yakında". Kemal doldurana kadar boş olduğu görünür */
const Bos: React.FC<{ ton: SayfaTonu; etiket?: string; className?: string }> = ({ ton, etiket = 'yakında', className = '' }) => (
  <div className={`rounded-2xl border border-dashed flex items-center justify-center text-[11px] font-semibold uppercase tracking-[0.2em] ${TON[ton].bos} ${className}`}>
    {etiket}
  </div>
);

/** Bütün iç sayfaların ortak kabuğu: üst başlık bandı, içerik, alt bilgi */
export const SayfaKabugu: React.FC<{
  ton: SayfaTonu; ust: React.ReactNode; baslik: string; alt?: string; children: React.ReactNode; genis?: boolean;
  /** Site düzenlemesinde seçilen sayfa görseli (Galeri'den) */
  gorsel?: string;
}> = ({ ton, ust, baslik, alt, children, genis, gorsel: kapak }) => {
  const t = TON[ton];
  return (
    <div className={`min-h-full flex flex-col ${t.zemin} ${t.yazi}`}>
      <div className={`${genis ? 'max-w-6xl' : 'max-w-5xl'} w-full mx-auto px-4 sm:px-10 pt-28 sm:pt-36 pb-10`}>
        <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${t.ikincil}`}>{ust}</div>
        <h1 className="mt-2 text-[40px] sm:text-[64px] leading-[0.95] font-extrabold tracking-tight">{baslik}</h1>
        {alt && <p className={`mt-4 max-w-xl text-[15px] sm:text-[17px] ${t.ikincil}`}>{alt}</p>}
        {kapak
          ? <GorselImg src={kapak} alt="" className="mt-8 sm:mt-10 w-full aspect-[21/9] object-cover rounded-2xl" />
          : <div className={`mt-8 sm:mt-10 border-t ${t.cizgi}`} />}
      </div>
      <div className={`${genis ? 'max-w-6xl' : 'max-w-5xl'} w-full flex-1 mx-auto px-4 sm:px-10 pb-28`}>{children}</div>
      <footer className={`border-t ${t.cizgi}`}>
        <div className={`${genis ? 'max-w-6xl' : 'max-w-5xl'} mx-auto px-4 sm:px-10 py-8 flex flex-wrap items-end justify-between gap-4`}>
          <div>
            <div className="font-extrabold text-[20px] leading-none tracking-tight">KEMS</div>
            <div className="mt-1 w-max bg-[#F26B6F] text-white text-[9px] font-bold tracking-[0.3em] pl-2 pr-1.5 py-px">COMPANY</div>
          </div>
          <div className={`text-[11px] uppercase tracking-[0.2em] ${t.ikincil}`}><span lang="en">Made with Culture · Est. 2025</span> · Düzada, TR</div>
        </div>
      </footer>
    </div>
  );
};

const Bolum: React.FC<{ ton: SayfaTonu; baslik: string; sag?: React.ReactNode; children: React.ReactNode }> = ({ ton, baslik, sag, children }) => (
  <section className="mt-12 first:mt-0">
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <h2 className={`text-[11px] font-bold uppercase tracking-[0.24em] ${TON[ton].ikincil}`}>{baslik}</h2>
      {sag}
    </div>
    {children}
  </section>
);

// Görseli sitede gizlenen madde görselsiz görünür (6. gece)
const gorsel = (i: Item) => (sitedeGorselVar(i) ? i.images?.find(s => typeof s === 'string' && s) || '' : '');

// ---- Düzada: tıklanabilir harita -------------------------------------------

export const DuzadaSayfasi: React.FC<{ items: Item[]; duzen: HaritaDuzeni | null; onMadde: (id: string) => void }> = ({ items, duzen, onMadde }) => {
  const sitede = useMemo(() => new Set(items.map(i => i.id)), [items]);
  return (
    <div className="absolute inset-x-0 bottom-0 top-[68px] sm:top-[82px]">
      {/* Yalnız sitedeki maddeye gidilir; öbür yapılar haritada durur ama açılmaz */}
      <DuzadaHarita duzen={duzen} atmosfer={ATMOSFER_ACIK} onSelect={id => { if (sitede.has(id)) onMadde(id); }} className="absolute inset-0 w-full h-full" />
      <div className="absolute left-4 sm:left-7 bottom-16 z-10 max-w-[calc(100%-2rem)] sm:max-w-xs rounded-2xl bg-[#0E1C4F]/85 backdrop-blur-md text-[#F3EFE8] p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#A6B0C9]">Düzada · Ege Denizi</div>
        <div className="mt-1 text-[22px] font-extrabold tracking-tight">Adanın haritası</div>
        {items.length > 0 ? (
          <ul className="mt-3 max-h-40 overflow-y-auto space-y-1">
            {items.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => onMadde(i.id)} className="w-full flex items-center justify-between gap-2 text-left text-[13px] hover:text-[#F26B6F] cursor-pointer">
                  {i.title}<ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              </li>
            ))}
          </ul>
        ) : <Bos ton="lacivert" className="mt-3 h-16" etiket="yerler yakında" />}
      </div>
    </div>
  );
};

// ---- Viki: giriş ve madde ---------------------------------------------------

export const VikiSayfasi: React.FC<{ items: Item[]; onMadde: (id: string) => void; kapak?: string }> = ({ items, onMadde, kapak }) => {
  const son = useMemo(() => [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [items]);
  const gruplar = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) {
      const k = TYPE_LABELS[i.type] || 'Diğer';
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [items]);
  return (
    <SayfaKabugu ton="krem" ust={<>Düzada, TR — <span lang="en">Made with Culture</span></>} baslik="Viki" genis gorsel={kapak}>
      <Bolum ton="krem" baslik="Son eklenenler">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {son.map(i => (
            <button key={i.id} type="button" onClick={() => onMadde(i.id)} className="group text-left rounded-2xl bg-[#FAF8F5] border border-[#CFC5B4] overflow-hidden hover:border-[#F26B6F] cursor-pointer">
              {gorsel(i)
                ? <img src={gorsel(i)} alt="" className="w-full aspect-[4/3] object-cover" />
                : <div className="w-full aspect-[4/3] bg-[#E4DCCD]" />}
              <div className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6A5E4C]">{TYPE_LABELS[i.type] || i.type}</div>
                <div className="mt-1 text-[19px] font-bold group-hover:text-[#D6484C]">{i.title}</div>
              </div>
            </button>
          ))}
          {Array.from({ length: Math.max(0, 3 - son.length) }, (_, k) => <Bos key={k} ton="krem" className="aspect-[4/3] sm:aspect-auto sm:min-h-[240px]" />)}
        </div>
      </Bolum>
      <Bolum ton="krem" baslik="Kategoriler">
        {gruplar.length ? (
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {gruplar.map(([ad, liste]) => (
              <div key={ad}>
                <div className="text-[15px] font-bold border-b border-[#CFC5B4] pb-2">{ad} <span className="text-[#6A5E4C] font-medium">· {liste.length}</span></div>
                <ul className="mt-2 space-y-1">
                  {liste.map(i => (
                    <li key={i.id}><button type="button" onClick={() => onMadde(i.id)} className="text-[14px] hover:text-[#D6484C] cursor-pointer">{i.title}</button></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(k => <Bos key={k} ton="krem" className="h-32" />)}</div>
        )}
      </Bolum>
    </SayfaKabugu>
  );
};

export const MaddeSayfasi: React.FC<{ madde: Item; onViki: () => void }> = ({ madde, onViki }) => {
  // Sitede gizlenen alanlar ve bölümler çıkar (6. gece); öneri bölümleri kanon değil, zaten görünmez
  const kunye = sitedeKunye(madde);
  const govde = sitedeGovde(madde);
  const takma = sitedeTakmaAdlar(madde);
  return (
    <SayfaKabugu ton="krem" ust={TYPE_LABELS[madde.type] || 'Madde'} baslik={madde.title} genis>
      <button type="button" onClick={onViki} className="mb-6 inline-flex items-center gap-1 text-[12px] font-semibold text-[#6A5E4C] hover:text-[#D6484C] cursor-pointer">← Viki</button>
      {takma.length > 0 && <p className="-mt-3 mb-6 text-[14px] text-[#6A5E4C]">Diğer adları: {takma.join(', ')}</p>}
      <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        <article className="space-y-6">
          {govde.length ? govde.map((b, k) => (
            <div key={k}>
              {b.heading && <h2 className="text-[22px] font-bold mb-2">{b.heading}</h2>}
              <div className="text-[16px] leading-relaxed whitespace-pre-line">{b.text}</div>
            </div>
          )) : <Bos ton="krem" className="h-48" etiket="metin yakında" />}
        </article>
        <aside className="rounded-2xl bg-[#FAF8F5] border border-[#CFC5B4] overflow-hidden lg:sticky lg:top-28">
          {gorsel(madde)
            ? <img src={gorsel(madde)} alt="" className="w-full aspect-square object-cover" />
            : <div className="w-full aspect-square bg-[#E4DCCD]" />}
          <dl className="divide-y divide-[#E4DCCD]">
            {kunye.map(f => (
              <div key={f.label} className="px-4 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6A5E4C]">{f.label}</dt>
                <dd className="mt-0.5 text-[14px]">{f.value}</dd>
              </div>
            ))}
            {!kunye.length && <div className="px-4 py-3 text-[12px] text-[#9C8F7A]">Künye yakında</div>}
          </dl>
        </aside>
      </div>
    </SayfaKabugu>
  );
};

// ---- Ürünler: dropların hikâyesi, satış yok ----------------------------------

export const UrunlerSayfasi: React.FC<{ droplar: Item[]; urunler: Item[]; kurumAdi: (id?: string) => string | undefined; kapak?: string }> = ({ droplar, urunler, kurumAdi, kapak }) => (
  <SayfaKabugu ton="lacivert" ust="Kems Company · Droplar" baslik="Ürünler" genis gorsel={kapak}>
    <div className="space-y-16">
      {(droplar.length ? droplar : [null, null]).map((d, k) => {
        const ait = d ? urunler.filter(u => u.metadata?.dropId === d.id) : [];
        return (
          <section key={d?.id ?? k} className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-center">
            {d && gorsel(d)
              ? <img src={gorsel(d)} alt="" className={`w-full aspect-[4/3] object-cover rounded-2xl ${k % 2 ? 'lg:order-2' : ''}`} />
              : <Bos ton="lacivert" className={`aspect-[4/3] ${k % 2 ? 'lg:order-2' : ''}`} etiket="görsel yakında" />}
            <div>
              {d ? (
                <>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#A6B0C9]">{kurumAdi(d.metadata?.kurumId as string | undefined) ?? 'Kems Company'}</div>
                  <h2 className="mt-2 text-[34px] sm:text-[44px] font-extrabold tracking-tight leading-none">{d.title}</h2>
                  <div className="mt-3 text-[12px] font-semibold text-[#F26B6F]">{d.status}</div>
                </>
              ) : (
                <>
                  <Bos ton="lacivert" className="h-6 w-40" etiket="" />
                  <Bos ton="lacivert" className="mt-3 h-12 w-72 max-w-full" etiket="drop yakında" />
                </>
              )}
              <Bos ton="lacivert" className="mt-5 h-24" etiket="hikâye yakında" />
              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {(ait.length ? ait.slice(0, 3) : [null, null, null]).map((u, j) => u ? (
                  <span key={u.id} title="Mağaza bağlanınca açılır" className="rounded-xl bg-[#13204A] border border-[#2C3C72] p-2 opacity-70">
                    {gorsel(u) ? <img src={gorsel(u)} alt="" className="w-full aspect-square object-cover rounded-lg" /> : <span className="block w-full aspect-square rounded-lg bg-[#1B2B5C]" />}
                    <span className="mt-1.5 flex items-center justify-between gap-1 text-[11px] font-semibold truncate">{u.title}<ArrowUpRight className="w-3 h-3 shrink-0" /></span>
                  </span>
                ) : <Bos key={j} ton="lacivert" className="aspect-square" etiket="" />)}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  </SayfaKabugu>
);

// ---- Haberler: blog ve bülten --------------------------------------------------

export const HaberlerSayfasi: React.FC<{ yazilar: Item[]; kapak?: string; onYazi?: (id: string) => void }> = ({ yazilar, kapak, onYazi }) => {
  const [ilk, ...kalan] = yazilar;
  return (
    <SayfaKabugu ton="krem" ust="Blog" baslik="Haberler" gorsel={kapak} genis>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {ilk ? (
          <article onClick={() => onYazi?.(ilk.id)} className="rounded-2xl bg-[#FAF8F5] border border-[#CFC5B4] overflow-hidden cursor-pointer hover:border-[#F26B6F]">
            {gorsel(ilk) ? <img src={gorsel(ilk)} alt="" className="w-full aspect-[16/9] object-cover" /> : <div className="w-full aspect-[16/9] bg-[#E4DCCD]" />}
            <div className="p-5"><h2 className="text-[26px] font-bold">{ilk.title}</h2></div>
          </article>
        ) : <Bos ton="krem" className="aspect-[16/10]" etiket="ilk yazı yakında" />}
        <div className="grid gap-4">
          {(kalan.length ? kalan.slice(0, 3) : [null, null, null]).map((y, k) => y ? (
            <article key={y.id} onClick={() => onYazi?.(y.id)} className="flex gap-3 rounded-2xl bg-[#FAF8F5] border border-[#CFC5B4] p-3 cursor-pointer hover:border-[#F26B6F]">
              {gorsel(y) ? <img src={gorsel(y)} alt="" className="w-24 h-20 object-cover rounded-lg" /> : <span className="w-24 h-20 rounded-lg bg-[#E4DCCD] shrink-0" />}
              <h3 className="text-[16px] font-bold">{y.title}</h3>
            </article>
          ) : <Bos key={k} ton="krem" className="h-24" />)}
        </div>
      </div>
    </SayfaKabugu>
  );
};

/** Tek yazı: fanzinse dergi görünümü, değilse metin */
export const YaziSayfasi: React.FC<{ yazi: Item; onGeri: () => void }> = ({ yazi, onGeri }) => {
  const f = fanzinBilgisi(yazi);
  return (
    <SayfaKabugu ton="krem" ust={<button type="button" onClick={onGeri} className="hover:text-[#D6484C] cursor-pointer">← Haberler</button>} baslik={f ? 'Fanzin' : yazi.title} genis={!!f}>
      {f ? <DergiGorunumu baslik={yazi.title} f={f} /> : (
        <div className="max-w-2xl space-y-4 text-[16px] leading-relaxed">
          {(yazi.notes || '').split(/\n{2,}/).filter(Boolean).map((p, k) => <p key={k}>{p}</p>)}
        </div>
      )}
    </SayfaKabugu>
  );
};

// ---- Projeler: yana kayan koyu ekran ------------------------------------------

/** Canva panosundaki üç proje (yapisal-2, 32): adlar var, içerik boş */
const PROJELER = ['Hotel Game', 'Golf Game', 'Card Game'];

export const ProjelerSayfasi: React.FC<{ kapak?: string }> = ({ kapak }) => (
  <SayfaKabugu ton="lacivert" ust="Merch dışındaki işler" baslik="Projeler" genis gorsel={kapak}>
    <div className="-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-4 overflow-x-auto snap-x pb-3">
      {PROJELER.map(ad => (
        <div key={ad} className="snap-start shrink-0 w-[78vw] sm:w-[340px] rounded-2xl border border-[#2C3C72] bg-[#13204A] overflow-hidden">
          <div className="aspect-[4/5] bg-[#1B2B5C] flex items-center justify-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6F7BA0]">yakında</div>
          <div className="p-4 flex items-center justify-between">
            <span lang="en" className="text-[17px] font-bold">{ad}</span>
            <span title="İçerik gelince açılır" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#6F7BA0] opacity-60">Keşfet <ArrowRight className="w-3.5 h-3.5" /></span>
          </div>
        </div>
      ))}
    </div>
  </SayfaKabugu>
);

// ---- Hakkında -------------------------------------------------------------------

export const HakkindaSayfasi: React.FC<{ metin?: string; kapak?: string }> = ({ metin, kapak }) => (
  <SayfaKabugu ton="lacivert" ust="Kems Company" baslik="Hakkında" gorsel={kapak}>
    {metin?.trim() ? (
      <div className="max-w-2xl space-y-4 text-[17px] sm:text-[20px] leading-relaxed">
        {metin.trim().split(/\n{2,}/).map((p, k) => <p key={k}>{p}</p>)}
      </div>
    ) : (
      <div className="max-w-2xl space-y-3">
        <Bos ton="lacivert" className="h-8" etiket="" />
        <Bos ton="lacivert" className="h-8 w-4/5" etiket="bir iki cümle · yakında" />
      </div>
    )}
  </SayfaKabugu>
);

// ---- İletişim: hesaplar ve e-posta ---------------------------------------------

export const IletisimSayfasi: React.FC<{ kanallar: Item[]; eposta?: string; kapak?: string }> = ({ kanallar, eposta, kapak }) => (
  <SayfaKabugu ton="gok" ust="Kems Company" baslik="İletişim" gorsel={kapak}>
    <div className="grid gap-4 sm:grid-cols-2">
      {kanallar.map(k => {
        const adres = /^https?:\/\//.test((k.notes || '').trim()) ? k.notes!.trim() : undefined;
        const icerik = (
          <>
            <AtSign className="w-5 h-5 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#35507A]">{String(k.metadata?.platform || 'hesap')}</span>
              <span className="block text-[17px] font-bold truncate">{k.title}</span>
            </span>
            {adres && <ArrowUpRight className="w-4 h-4 shrink-0" />}
          </>
        );
        return adres
          ? <a key={k.id} href={adres} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white/70 backdrop-blur p-4 hover:bg-white">{icerik}</a>
          : <div key={k.id} className="flex items-center gap-3 rounded-2xl bg-white/70 backdrop-blur p-4">{icerik}</div>;
      })}
      {!kanallar.length && <Bos ton="gok" className="h-20" etiket="hesaplar yakında" />}
      {eposta?.trim() ? (
        <a href={`mailto:${eposta.trim()}`} className="flex items-center gap-3 rounded-2xl bg-white/70 backdrop-blur p-4 hover:bg-white">
          <Mail className="w-5 h-5 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#35507A]">e-posta</span>
            <span className="block text-[17px] font-bold truncate">{eposta.trim()}</span>
          </span>
        </a>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-white/45 border border-dashed border-[#0E1C4F]/20 p-4 text-[#35507A]">
          <Mail className="w-5 h-5" /><span className="text-[12px] font-semibold uppercase tracking-[0.2em]">e-posta yakında</span>
        </div>
      )}
    </div>
  </SayfaKabugu>
);
