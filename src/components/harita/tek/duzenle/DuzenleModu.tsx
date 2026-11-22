import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3 } from 'three';
import {
  AlertTriangle, Building2, CloudUpload, Grid2x2, LayoutGrid, MousePointer2, Redo2, RotateCcw, RotateCw, Route, Scissors,
  Send, Trash2, Undo2, X
} from 'lucide-react';
import type { Item } from '../../../../types';
import { BINA_MODELLERI, modelinTurleri, type BinaModeli } from '../../../../lib/binaKutuphanesi';
import { anahtariOku } from '../../../../lib/oyunAyarlari';
import { ESLEME } from '../../../../lib/yasayanHarita';
import { modelYukle } from '../../../../lib/modelYukle';
import { rakim, sahneye, type Nokta, type Yapi } from '../tekVeri';
import type { SahneApi } from './sahneApi';
import { birlestir, verininKucukleri, type Birlesik } from './birlesik';
import { cografyaya, exAcisi, kesimeUzaklik, ondenEx, acidanEx, dikdortgen, icinde } from './geometri';
import { gruplariOku, grupOgeleri, grupCizimi, kirpilmis, yerlesim, type Cesit, type GrupVerisi } from './gruplar';
import { kareBul, kareleriOku, type KareVerisi } from './kareler';
import {
  BOYALAR, KADEME, KADEMELER, YUZEYLER, bosTaslak, taslakSayilari, taslakYazisi, toplamDegisiklik, yeniKimlik,
  type BoyaTuru, type Kademe, type TekTaslak, type YeniTur, type Yuzey
} from './taslak';
import { TaslakKatmani } from './taslakKatmani';
import type { TaslakDeposu, YazmaSonucu } from './taslakDeposu';
import { uyarilariBul, type Uyari } from './uyarilar';
import { cakismaSay, Doluluk, kiyidaYerlestir, seritteYerlestir, yoldaYerlestir, type Yerlestirme } from './yerlestir';

/**
 * Tek harita → Düzenle (7. adım, 22 Kasım; Kemal: "hepsi tek seferde", Cities Skylines gibi).
 *
 * Araçlar: Seç (bina ve yol: taşı, döndür, sil; yol kartı, nokta taşı, böl), Bina koy (KKM'nin
 * modelleri), Yol çiz (kademe seçilir), Hazır grup (katalogdan; sığmazsa kenar kareleri kırpılır),
 * Kare boya (park, bahçe, meydancık, ağaç, boş). Geri al / ileri al. Drive'a yedek. Haritaya işle.
 *
 * Yumuşak kural: yol eğimi, üst üste binme, kıyı şeridi engellemez; uyarı olur.
 * Viki maddesine bağlı ya da evinde oturan olan yapı silinmez (taşınabilir).
 *
 * Telefon: bakma, bina taşı / döndür, kare boyama. Yol çizme, bina ve grup koyma bilgisayarda.
 *
 * Kayıt: taslak yalnız değişiklikleri tutar; Kemal düzenledikçe 20 sn biriktirilip yazılır
 * (`taslakDeposu.ts`). Sayfa açılınca kendiliğinden hiçbir şey yazılmaz.
 */

type Arac = 'sec' | 'bina' | 'yol' | 'grup' | 'boya';
type Secim = { tur: 'yapi'; id: string } | { tur: 'kucuk'; id: string } | { tur: 'yol'; id: string } | null;
type KayitDurumu = { durum: 'temiz' } | { durum: 'bekliyor' } | { durum: 'yaziliyor' } | (YazmaSonucu & { zaman: number; bayt: number });

const BIRIKTIRME_MS = 20_000;
const GECMIS_SINIRI = 100;
const DONUS = (15 * Math.PI) / 180;

const telefonMu = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;

/** Katalog: Bina koy'da görünen modeller (yol döşeme parçaları ve araçlar yok) */
const KATALOG: Array<{ baslik: string; modeller: BinaModeli[] }> = (() => {
  const uygun = BINA_MODELLERI.filter(m => !['deniz', 'arac'].includes(m.grup) && !/^(yol-|merdivenli-sokak|merkez-meydani)/.test(m.kimlik));
  const g = (ad: string, f: (m: BinaModeli) => boolean) => ({ baslik: ad, modeller: uygun.filter(f) });
  return [
    g('Evler ve yapılar', m => m.grup === 'bina'),
    g('Özel yapılar', m => m.grup === 'imperial' || m.grup === 'dirlik'),
    g('Ağaçlar', m => m.grup === 'bitki'),
    g('Bahçe ve sokak', m => m.grup === 'bahce' || m.grup === 'sokak')
  ].filter(x => x.modeller.length);
})();

/** Modelin okunur adı (galeri başlığı; tür adı, özel ad değil) */
const MODEL_ADI = new Map(BINA_MODELLERI.flatMap(m => [[m.dosya, m.baslik] as const, ...(m.renkler ?? []).map(r => [r.dosya, m.baslik] as const)]));
const yapiAdi = (y: { ad?: string | null; dosya?: string | null; tur?: string }) =>
  y.ad || (y.dosya ? MODEL_ADI.get(y.dosya) : undefined) || (y.tur === 'agac' ? 'Ağaç' : y.tur === 'donati' ? 'Donatı' : 'Yapı');

const KURUCU_TURLERI = new Set(['ev', 'dukkanli', 'ciftlik', 'yazlik', 'depo', 'kamu']);
const modelTuru = (m: BinaModeli): YeniTur =>
  m.grup === 'bitki' ? 'agac' : m.grup === 'bahce' || m.grup === 'sokak' ? 'donati'
    : ((modelinTurleri(m.dosya).find(t => KURUCU_TURLERI.has(t)) as YeniTur | undefined) ?? 'ozel');

/** Modelin taban ölçüsü: hazır grupların ölçü tablosundan, yoksa modelden ölçülür */
const olcuOnbellegi = new Map<string, number[]>();
async function modelOlcusu(dosya: string, tablo?: Record<string, number[]>): Promise<number[]> {
  const t = tablo?.[dosya];
  if (t) return t;
  const v = olcuOnbellegi.get(dosya);
  if (v) return v;
  const g = await modelYukle(dosya);
  const k = new Box3().setFromObject(g.scene);
  const o = [Math.max(0.5, k.max.x - k.min.x), Math.max(0.5, k.max.z - k.min.z), Math.max(0.5, k.max.y)];
  olcuOnbellegi.set(dosya, o);
  return o;
}

const saat = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const kb = (b: number) => `${(b / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;

type Props = {
  api: SahneApi;
  items?: Item[];
  depo?: TaslakDeposu;
  onKapat: () => void;
};

export const DuzenleModu: React.FC<Props> = ({ api, items, depo: verilenDepo, onKapat }) => {
  const telefon = useMemo(telefonMu, []);
  const z = api.z;
  const [depo, setDepo] = useState<TaslakDeposu | null>(verilenDepo ?? null);
  const [taslak, setTaslak] = useState<TekTaslak>(bosTaslak);
  const [yuklendi, setYuklendi] = useState(false);
  const [gecmis, setGecmis] = useState<{ geri: TekTaslak[]; ileri: TekTaslak[] }>({ geri: [], ileri: [] });
  const [arac, setArac] = useState<Arac>('sec');
  const [secim, setSecim] = useState<Secim>(null);
  const [seciliNokta, setSeciliNokta] = useState<number | null>(null);
  const [model, setModel] = useState<BinaModeli | null>(null);
  const [koyAci, setKoyAci] = useState(0);
  const [kademe, setKademe] = useState<Kademe>('sokak');
  const [boya, setBoya] = useState<BoyaTuru>('park');
  const [cesitId, setCesitId] = useState<string | null>(null);
  const [cizilen, setCizilen] = useState<Nokta[]>([]);
  const [bolAcik, setBolAcik] = useState(false);
  const [kareler, setKareler] = useState<KareVerisi | null>(null);
  const [gruplar, setGruplar] = useState<GrupVerisi | null>(null);
  const [kayit, setKayit] = useState<KayitDurumu>({ durum: 'temiz' });
  const [not, setNot] = useState<string>('');
  const [grupDurumu, setGrupDurumu] = useState<string>('');
  const [isle, setIsle] = useState<'' | 'gidiyor' | { adres: string } | { hata: string }>('');
  const [drive, setDrive] = useState<'' | 'gidiyor' | { adres: string } | { hata: string }>('');
  const [temizleOnayi, setTemizleOnayi] = useState(false);

  const taslakRef = useRef(taslak); taslakRef.current = taslak;
  const sayacRef = useRef(0);
  const kirliRef = useRef(false);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const katman = useRef<TaslakKatmani | null>(null);

  // Taslak deposu: verilmediyse KKM kaydı (Firestore; yalnız Düzenle açılınca iner)
  useEffect(() => {
    if (verilenDepo) return;
    let iptal = false;
    void import('./firestoreDeposu').then(m => { if (!iptal) setDepo(m.firestoreDeposu); });
    return () => { iptal = true; };
  }, [verilenDepo]);
  // Taslak okunur (yazma yok)
  useEffect(() => {
    if (!depo) return;
    let iptal = false;
    depo.oku().then(k => {
      if (iptal) return;
      if (k) { setTaslak(k.taslak); sayacRef.current = k.sayac; }
      setYuklendi(true);
    }).catch(() => { if (!iptal) setYuklendi(true); });
    return () => { iptal = true; };
  }, [depo]);
  // Kareler ve hazır gruplar (yalnız Düzenle'de iner)
  useEffect(() => {
    const d = new AbortController();
    kareleriOku(z.b, d.signal).then(setKareler).catch(e => { if (!d.signal.aborted) console.warn('[düzenle] kareler inmedi', e); });
    gruplariOku(d.signal).then(setGruplar).catch(e => { if (!d.signal.aborted) console.warn('[düzenle] gruplar inmedi', e); });
    return () => d.abort();
  }, [z]);

  // Silinemeyen yapılar: viki maddesine bağlı ya da evinde oturan var (CLAUDE.md → kurucuBina kuralı gibi)
  const bagli = useMemo(() => {
    const s = new Set<string>(Object.keys(ESLEME));
    for (const f of api.temel.yapiVerisi.features) {
      const p = f.properties;
      if (p.vikiId || p.bag) s.add(String(p.id));
    }
    return s;
  }, [api]);
  const temelBoyali = useMemo(() => {
    const s = new Set<string>();
    for (const f of api.temel.yollar.features) if (f.properties.katman === 'alan' && typeof f.properties.kare === 'string') s.add(f.properties.kare);
    return s;
  }, [api]);
  const temelIdler = useMemo(() => new Set([
    ...api.temel.yapiVerisi.features.map(f => String(f.properties.id ?? '')),
    ...api.temel.yollar.features.map(f => String(f.properties.id ?? ''))
  ]), [api]);

  // Taslağın zaten haritaya işlenmiş yenileri (ajans PR'ı birleşti): ikinci kez çizilmez
  const gorunenTaslak = useMemo<TekTaslak>(() => {
    const t = taslak;
    const yy = suz(t.yeniYapilar, id => !temelIdler.has(id));
    const yl = suz(t.yeniYollar, id => !temelIdler.has(id));
    const gr = suz(t.gruplar, id => !temelIdler.has(id));
    return { ...t, yeniYapilar: yy, yeniYollar: yl, gruplar: gr };
  }, [taslak, temelIdler]);

  const temel = useMemo(() => ({
    yapilar: api.temel.yapilar, yollar: api.temel.yollar,
    kucukler: verininKucukleri(z, api.temel.yapiVerisi)
  }), [api, z]);
  const birlesik: Birlesik = useMemo(() => birlestir(z, temel, gorunenTaslak, { gruplar, kareler }), [z, temel, gorunenTaslak, gruplar, kareler]);
  const doluluk = useMemo(() => new Doluluk(z, birlesik.yapilar, birlesik.yollar), [z, birlesik]);

  // Grupların sığmayan kareleri (uyarı)
  const grupSigmadi = useMemo(() => {
    const out: Record<string, number> = {};
    if (!gruplar) return out;
    const gt: TekTaslak = gorunenTaslak;
    for (const [id, g] of Object.entries(gt.gruplar)) {
      const c0 = gruplar.cesit.get(g.sablon);
      if (!c0) continue;
      // Şerit grubu yalnız boş karelere konur; yolun ve kıyının grupları dolu yere düşebilir
      if (g.yer === 'serit') continue;
      const c = kirpilmis(c0, g.kirp);
      if (!c) continue;
      const d = new Doluluk(z, birlesik.yapilar, birlesik.yollar, `${id}_`);
      out[id] = cakismaSay(d, c, yerlesim(sahneye(z.b, g.o), g.aci, g.yan), g.yer === 'kiyi');
    }
    return out;
  }, [gruplar, gorunenTaslak, birlesik, z]);
  const uyarilar: Uyari[] = useMemo(() => uyarilariBul(z, gorunenTaslak, birlesik, grupSigmadi, yapiAdi), [z, gorunenTaslak, birlesik, grupSigmadi]);

  // Sahne: katman kurulur; çıkarken harita yalnız veriyle çizilir
  useEffect(() => {
    const k = new TaslakKatmani(z, () => { /* model indi */ });
    katman.current = k;
    api.sahne.add(k.grup);
    return () => {
      api.sahne.remove(k.grup);
      k.dispose();
      katman.current = null;
      api.isaretci = null;
      api.goster(null);
    };
  }, [api, z]);
  // Taslak çizimi (art arda değişiklikte tek yeniden kurulum)
  useEffect(() => {
    if (!yuklendi) return;
    const t = setTimeout(() => api.goster(birlesik), 120);
    return () => clearTimeout(t);
  }, [api, birlesik, yuklendi]);

  // ---- kayıt ---------------------------------------------------------------
  const yaz = useCallback(async () => {
    if (!depo || !kirliRef.current) return;
    if (zamanlayici.current) { clearTimeout(zamanlayici.current); zamanlayici.current = null; }
    kirliRef.current = false;
    const t = taslakRef.current;
    setKayit({ durum: 'yaziliyor' });
    const { sonuc, sayac } = await depo.yaz(t, sayacRef.current);
    sayacRef.current = sayac;
    if (sonuc.durum !== 'bulut' && sonuc.durum !== 'cakisma') kirliRef.current = sonuc.durum === 'yerel' && sonuc.neden === 'baglanti';
    setKayit({ ...sonuc, zaman: Date.now(), bayt: new TextEncoder().encode(taslakYazisi(t)).length });
  }, [depo]);
  const yazRef = useRef(yaz); yazRef.current = yaz;
  // Çıkarken bekleyen değişiklik yazılır (Kemal'in düzenlemesinin kaydı)
  useEffect(() => () => { if (kirliRef.current) void yazRef.current(); }, []);
  useEffect(() => {
    const kapan = () => { if (kirliRef.current) void yazRef.current(); };
    window.addEventListener('pagehide', kapan);
    return () => window.removeEventListener('pagehide', kapan);
  }, []);

  /** Taslağı değiştirir: geçmişe girer, 20 sn sonra kayda yazılır */
  const degistir = useCallback((f: (t: TekTaslak) => TekTaslak) => {
    const eski = taslakRef.current;
    const yeni = f(eski);
    if (yeni === eski) return;
    taslakRef.current = yeni;
    setTaslak(yeni);
    setGecmis(g => ({ geri: [...g.geri, eski].slice(-GECMIS_SINIRI), ileri: [] }));
    kirliRef.current = true;
    setKayit({ durum: 'bekliyor' });
    if (!zamanlayici.current) zamanlayici.current = setTimeout(() => { zamanlayici.current = null; void yazRef.current(); }, BIRIKTIRME_MS);
  }, []);
  const geriAl = useCallback(() => setGecmis(g => {
    if (!g.geri.length) return g;
    const onceki = g.geri[g.geri.length - 1];
    const simdi = taslakRef.current;
    taslakRef.current = onceki; setTaslak(onceki);
    kirliRef.current = true; setKayit({ durum: 'bekliyor' });
    if (!zamanlayici.current) zamanlayici.current = setTimeout(() => { zamanlayici.current = null; void yazRef.current(); }, BIRIKTIRME_MS);
    return { geri: g.geri.slice(0, -1), ileri: [simdi, ...g.ileri] };
  }), []);
  const ileriAl = useCallback(() => setGecmis(g => {
    if (!g.ileri.length) return g;
    const sonraki = g.ileri[0];
    const simdi = taslakRef.current;
    taslakRef.current = sonraki; setTaslak(sonraki);
    kirliRef.current = true; setKayit({ durum: 'bekliyor' });
    if (!zamanlayici.current) zamanlayici.current = setTimeout(() => { zamanlayici.current = null; void yazRef.current(); }, BIRIKTIRME_MS);
    return { geri: [...g.geri, simdi], ileri: g.ileri.slice(1) };
  }), []);

  // ---- seçimin bilgisi -------------------------------------------------------
  const seciliYapi: Yapi | undefined = secim?.tur === 'yapi' ? birlesik.yapilar.find(y => y.id === secim.id) : undefined;
  const seciliKucuk = secim?.tur === 'kucuk' ? birlesik.kucukler.find(k => k.id === secim.id) : undefined;
  const seciliYol = useMemo(() => {
    if (secim?.tur !== 'yol') return null;
    const f = birlesik.yollar.features.find(x => x.properties.id === secim.id && x.properties.katman === 'yol');
    if (!f) return null;
    const c = (f.geometry.coordinates as number[][]).map(q => [(q[0] - z.b.lng0) * z.b.mPerLng, -(q[1] - z.b.lat0) * z.b.mPerLat] as Nokta);
    return { id: secim.id, p: f.properties, c, yeni: secim.id in taslak.yeniYollar };
  }, [secim, birlesik, z, taslak.yeniYollar]);
  const grupEtiketi = (id: string) => taslak.yeniYapilar[id]?.grup ?? taslak.yeniYollar[id]?.grup;

  // ---- değişiklik işleri ---------------------------------------------------------
  const yapiyiTasi = useCallback((id: string, m: Nokta, ex: Nokta) => degistir(t => {
    const mm = cografyaya(z.b, m[0], m[1]);
    if (t.yeniYapilar[id]) return { ...t, yeniYapilar: { ...t.yeniYapilar, [id]: { ...t.yeniYapilar[id], m: mm, ex: [ex[0], ex[1]] } } };
    return { ...t, yapilar: { ...t.yapilar, [id]: { m: mm, ex: [ex[0], ex[1]] } } };
  }), [degistir, z]);
  const yapiyiSil = useCallback((id: string) => {
    if (bagli.has(id)) { setNot('Bu yapı viki maddesine bağlı ya da evinde oturan var: silinmez. Taşıyabilir, döndürebilirsin.'); return; }
    degistir(t => {
      if (t.yeniYapilar[id]) { const { [id]: _s, ...kalan } = t.yeniYapilar; return { ...t, yeniYapilar: kalan }; }
      return { ...t, yapilar: { ...t.yapilar, [id]: { sil: true } } };
    });
    setSecim(null);
  }, [bagli, degistir]);
  const yerineDondur = useCallback((id: string) => degistir(t => {
    if (!t.yapilar[id]) return t;
    const { [id]: _s, ...kalan } = t.yapilar; return { ...t, yapilar: kalan };
  }), [degistir]);
  const dondur = useCallback((aci: number) => {
    const y = seciliYapi ?? null;
    if (y) { const a = exAcisi(y.ex) + aci; yapiyiTasi(y.id, y.merkez, acidanEx(a)); return; }
    if (seciliKucuk) { const a = exAcisi(seciliKucuk.ex) + aci; yapiyiTasi(seciliKucuk.id, seciliKucuk.merkez, acidanEx(a)); }
  }, [seciliYapi, seciliKucuk, yapiyiTasi]);

  const yolNoktalari = useCallback((id: string, c: Nokta[]) => degistir(t => {
    const n = c.flatMap(([x, sz]) => cografyaya(z.b, x, sz));
    if (t.yeniYollar[id]) return { ...t, yeniYollar: { ...t.yeniYollar, [id]: { ...t.yeniYollar[id], n } } };
    return { ...t, yollar: { ...t.yollar, [id]: { ...t.yollar[id], n } } };
  }), [degistir, z]);
  const yolAlani = useCallback((id: string, alan: { kademe?: Kademe; ad?: string; tur?: Yuzey }) => degistir(t => {
    if (t.yeniYollar[id]) return { ...t, yeniYollar: { ...t.yeniYollar, [id]: { ...t.yeniYollar[id], ...alan } } };
    return { ...t, yollar: { ...t.yollar, [id]: { ...t.yollar[id], ...alan } } };
  }), [degistir]);
  const yoluSil = useCallback((id: string, vikiId: unknown) => {
    if (vikiId) { setNot('Bu yol viki maddesine bağlı: silinmez. Güzergâhını noktalarını taşıyarak değiştirebilirsin.'); return; }
    degistir(t => {
      if (t.yeniYollar[id]) { const { [id]: _s, ...kalan } = t.yeniYollar; return { ...t, yeniYollar: kalan }; }
      return { ...t, yollar: { ...t.yollar, [id]: { sil: true } } };
    });
    setSecim(null);
  }, [degistir]);
  const yoluBol = useCallback((id: string, c: Nokta[], p: Nokta) => {
    let en = { d: Infinity, i: 0, x: 0, z: 0 };
    for (let i = 1; i < c.length; i++) { const u = kesimeUzaklik(p, c[i - 1], c[i]); if (u.d < en.d) en = { d: u.d, i, x: u.x, z: u.z }; }
    if (en.d > 15) return;
    const k: Nokta = [en.x, en.z];
    const a = [...c.slice(0, en.i), k], b = [k, ...c.slice(en.i)];
    const yeniId = yeniKimlik('yol');
    const pr = seciliYol?.p ?? {};
    degistir(t => {
      const ilk = a.flatMap(([x, sz]) => cografyaya(z.b, x, sz)), ikinci = b.flatMap(([x, sz]) => cografyaya(z.b, x, sz));
      const eski = t.yeniYollar[id];
      const kad = (eski?.kademe ?? (pr.kademe as Kademe)) || 'sokak';
      const yeniYollar = { ...t.yeniYollar, [yeniId]: { kademe: kad, tur: (eski?.tur ?? (pr.tur as Yuzey)) || KADEME[kad].yuzey, ad: eski?.ad ?? String(pr.ad ?? ''), n: ikinci, bolundu: id } };
      if (eski) return { ...t, yeniYollar: { ...yeniYollar, [id]: { ...eski, n: ilk } } };
      return { ...t, yeniYollar, yollar: { ...t.yollar, [id]: { ...t.yollar[id], n: ilk } } };
    });
    setBolAcik(false);
    setNot('Yol ikiye bölündü; ikinci parça yeni bir yol.');
  }, [degistir, seciliYol, z]);

  const boyaKare = useCallback((t: TekTaslak, id: string, tur: BoyaTuru): TekTaslak => {
    const var_ = t.kareler[id];
    if (tur === 'bos' && !temelBoyali.has(id)) {
      if (!var_) return t;
      const { [id]: _s, ...kalan } = t.kareler; return { ...t, kareler: kalan };
    }
    if (var_ === tur) return t;
    return { ...t, kareler: { ...t.kareler, [id]: tur } };
  }, [temelBoyali]);

  const grupKoy = useCallback((y: Yerlestirme) => {
    if (!gruplar) return;
    const kimlik = yeniKimlik('grup');
    const og = grupOgeleri(z.b, y.cesit, y.yer, kimlik, gruplar.modelOlcu);
    degistir(t => ({
      ...t,
      gruplar: { ...t.gruplar, [kimlik]: { sablon: y.cesit.id, kirp: y.kirp, o: cografyaya(z.b, y.yer.o[0], y.yer.o[1]), aci: y.aci, yan: y.yan, yer: y.cesit.yer, ...(y.dayanak ? { dayanak: y.dayanak } : {}), arsalar: y.arsalar } },
      yeniYapilar: { ...t.yeniYapilar, ...og.yapilar },
      yeniYollar: { ...t.yeniYollar, ...og.yollar }
    }));
    const k = y.kirp;
    setNot(`Grup kondu${k.sol + k.sag + k.arka ? ` (kırpıldı: soldan ${k.sol}, sağdan ${k.sag}, arkadan ${k.arka} kare)` : ''}. Her öğesi ayrı seçilir.`);
  }, [degistir, gruplar, z]);
  const grubuSil = useCallback((kimlik: string) => {
    degistir((t: TekTaslak) => {
      const { [kimlik]: _g, ...gr } = t.gruplar;
      return {
        ...t, gruplar: gr,
        yeniYapilar: suz(t.yeniYapilar, (_, v) => v.grup?.kimlik !== kimlik),
        yeniYollar: suz(t.yeniYollar, (_, v) => v.grup?.kimlik !== kimlik)
      };
    });
    setSecim(null);
  }, [degistir]);

  // ---- dokunma ------------------------------------------------------------------
  const yapiBul = useCallback((p: Nokta): Secim => {
    let en: { id: string; tur: 'kucuk' | 'yapi'; d: number } | null = null;
    for (const k of birlesik.kucukler) {
      if (k.kaynak === 'boya') continue;
      const d = Math.hypot(k.merkez[0] - p[0], k.merkez[1] - p[1]);
      if (d < 3 && (!en || d < en.d)) en = { id: k.id, tur: 'kucuk', d };
    }
    if (en) return { tur: en.tur, id: en.id };
    for (const y of birlesik.yapilar) {
      if (Math.abs(y.merkez[0] - p[0]) > 150 || Math.abs(y.merkez[1] - p[1]) > 150) continue;
      if (icinde(p, y.taban)) return { tur: 'yapi', id: y.id };
    }
    const yl = doluluk.enYakinYol(p, 6);
    if (yl && yl.d <= yl.s.yari + 2 && yl.s.id) return { tur: 'yol', id: yl.s.id };
    return null;
  }, [birlesik, doluluk]);

  /** Yol noktalarının ekrandaki yerine en yakın tutamak (14 piksel içinde) */
  const tutamakBul = useCallback((e: PointerEvent | MouseEvent): number | null => {
    if (!seciliYol || telefon) return null;
    const kab = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - kab.left, py = e.clientY - kab.top;
    let en: { i: number; d: number } | null = null;
    seciliYol.c.forEach(([x, sz], i) => {
      const s = api.ekrana(x, Math.max(0, rakim(z, x, sz)) + 1.2, sz);
      if (!s) return;
      const d = Math.hypot(s[0] - px, s[1] - py);
      if (d < 14 && (!en || d < en.d)) en = { i, d };
    });
    return (en as { i: number; d: number } | null)?.i ?? null;
  }, [api, seciliYol, telefon, z]);

  /** Çizilen yolun noktası: yakın yol noktasına (6 m) oturur */
  const yapis = useCallback((p: Nokta): Nokta => {
    let en: { q: Nokta; d: number } | null = null;
    for (const f of birlesik.yollar.features) {
      if (f.geometry.type !== 'LineString' || f.properties.katman !== 'yol') continue;
      const c = f.geometry.coordinates as number[][];
      for (const q of [c[0], c[c.length - 1]]) {
        const s: Nokta = [(q[0] - z.b.lng0) * z.b.mPerLng, -(q[1] - z.b.lat0) * z.b.mPerLat];
        const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
        if (d < 6 && (!en || d < en.d)) en = { q: s, d };
      }
    }
    if (en) return en.q;
    const y = doluluk.enYakinYol(p, 4);
    return y ? [y.x, y.z] : p;
  }, [birlesik, doluluk, z]);

  const grupYerlestir = useCallback((c: Cesit, p: Nokta): Yerlestirme | null => {
    if (c.yer === 'serit') return kareler ? seritteYerlestir(kareler, taslakRef.current, c, p) : null;
    if (c.yer === 'kiyi') return kiyidaYerlestir(doluluk, c, p, kareler);
    return yoldaYerlestir(doluluk, c, p, kareler);
  }, [doluluk, kareler]);

  // Sürükleme durumu (React dışında: her harekette yeniden çizim yok)
  const surukle = useRef<
    | { tur: 'yapi'; id: string; bas: Nokta; m: Nokta; ex: Nokta; en: number; boy: number; son: Nokta }
    | { tur: 'nokta'; id: string; i: number; c: Nokta[] }
    | { tur: 'boya'; t: TekTaslak; eski: TekTaslak }
    | null>(null);
  const sonGrup = useRef<Yerlestirme | null>(null);
  const sonBina = useRef<{ m: Nokta; ex: Nokta; en: number; boy: number } | null>(null);
  const [binaOlcu, setBinaOlcu] = useState<number[] | null>(null);
  useEffect(() => {
    setBinaOlcu(null);
    if (!model) return;
    let iptal = false;
    modelOlcusu(model.dosya, gruplar?.modelOlcu).then(o => { if (!iptal) setBinaOlcu(o); }).catch(() => { if (!iptal) setBinaOlcu([10, 10, 8]); });
    return () => { iptal = true; };
  }, [model, gruplar]);

  const cesit = cesitId ? gruplar?.cesit.get(cesitId) ?? null : null;

  // İşaretçi: her durum değişikliğinde yenilenir
  useEffect(() => {
    const k = katman.current;
    api.isaretci = {
      basildi: (e, p) => {
        if (!p) return false;
        if (arac === 'boya') {
          const kr = kareler && kareBul(kareler, p);
          if (!kr) return false;
          const t0 = taslakRef.current;
          surukle.current = { tur: 'boya', t: kr.bos ? boyaKare(t0, kr.id, boya) : t0, eski: t0 };
          if (!kr.bos) setNot('Bu kare bir arsanın: yalnız boş kareler boyanır.');
          else { taslakRef.current = surukle.current.t; setTaslak(surukle.current.t); }
          return true;
        }
        if (arac !== 'sec') return false;
        const ti = tutamakBul(e);
        if (ti !== null && seciliYol) {
          surukle.current = { tur: 'nokta', id: seciliYol.id, i: ti, c: seciliYol.c.map(q => [q[0], q[1]] as Nokta) };
          setSeciliNokta(ti);
          return true;
        }
        const y = seciliYapi ?? (seciliKucuk ? { id: seciliKucuk.id, merkez: seciliKucuk.merkez, ex: seciliKucuk.ex, en: 3, boy: 3, taban: dikdortgen(seciliKucuk.merkez, seciliKucuk.ex, 3, 3) } : null);
        if (y && (icinde(p, y.taban) || Math.hypot(p[0] - y.merkez[0], p[1] - y.merkez[1]) < 3)) {
          surukle.current = { tur: 'yapi', id: y.id, bas: p, m: y.merkez, ex: y.ex, en: y.en, boy: y.boy, son: y.merkez };
          return true;
        }
        return false;
      },
      tasindi: (_e, p) => {
        const s = surukle.current;
        if (!s || !p) return;
        if (s.tur === 'yapi') {
          s.son = [s.m[0] + p[0] - s.bas[0], s.m[1] + p[1] - s.bas[1]];
          k?.onizleme({ halkalar: [{ h: dikdortgen(s.son, s.ex, s.en, s.boy), renk: '#0E1C4F', opak: 0.25 }] });
        } else if (s.tur === 'nokta') {
          s.c[s.i] = p;
          k?.onizleme({ cizgiler: [{ c: s.c, renk: '#0E1C4F' }] });
          k?.tutamaklar(s.c, s.i, Math.max(1, api.kameraUzakligi() / 260));
        } else if (s.tur === 'boya' && kareler) {
          const kr = kareBul(kareler, p);
          if (!kr || !kr.bos) return;
          const yeni = boyaKare(s.t, kr.id, boya);
          if (yeni !== s.t) { s.t = yeni; taslakRef.current = yeni; setTaslak(yeni); }
        }
      },
      birakildi: () => {
        const s = surukle.current;
        surukle.current = null;
        k?.onizleme(null);
        if (!s) return;
        if (s.tur === 'yapi') {
          if (Math.hypot(s.son[0] - s.m[0], s.son[1] - s.m[1]) > 0.3) yapiyiTasi(s.id, s.son, s.ex);
        } else if (s.tur === 'nokta') {
          yolNoktalari(s.id, s.c);
        } else if (s.tur === 'boya') {
          // Boyama tek adım olarak geçmişe girer
          taslakRef.current = s.eski;
          degistir(() => s.t);
        }
      },
      tiklandi: (e, p) => {
        if (!p) return;
        setNot('');
        if (arac === 'sec') {
          if (bolAcik && seciliYol) { yoluBol(seciliYol.id, seciliYol.c, p); return; }
          if (tutamakBul(e) !== null) return;
          setSecim(yapiBul(p)); setSeciliNokta(null);
        } else if (arac === 'bina' && model && sonBina.current) {
          const b = sonBina.current;
          const id = yeniKimlik('yapi');
          const tur = modelTuru(model);
          degistir(t => ({ ...t, yeniYapilar: { ...t.yeniYapilar, [id]: { tur, dosya: model.dosya, m: cografyaya(z.b, b.m[0], b.m[1]), ex: [b.ex[0], b.ex[1]], en: b.en, boy: b.boy, yukseklik: binaOlcu?.[2] ?? 8 } } }));
        } else if (arac === 'yol') {
          setCizilen(c => [...c, yapis(p)]);
        } else if (arac === 'grup' && cesit) {
          const y = grupYerlestir(cesit, p);
          if (y) grupKoy(y); else setNot(cesit.yer === 'serit' ? 'Bu grup boş karelere konur: bir yolun yanındaki boş karelere gel.' : cesit.yer === 'kiyi' ? 'Bu grup kıyıya konur: kıyı çizgisine yakın bir yere gel.' : 'Bu grup bir yolun yanına konur: yola yakın bir yere gel.');
        } else if (arac === 'boya') {
          // Tek dokunma basildi/birakildi ile işlendi
        }
      },
      ciftTiklandi: (_e, p) => {
        if (arac === 'yol') { yolBitir(); return; }
        // Seçili yolun üstüne çift tık: nokta eklenir
        if (arac === 'sec' && seciliYol && p && !telefon) {
          const c = seciliYol.c;
          let en = { d: Infinity, i: 0 };
          for (let i = 1; i < c.length; i++) { const u = kesimeUzaklik(p, c[i - 1], c[i]); if (u.d < en.d) en = { d: u.d, i }; }
          if (en.d < 10) yolNoktalari(seciliYol.id, [...c.slice(0, en.i), p, ...c.slice(en.i)]);
        }
      },
      uzerinde: (_e, p) => {
        if (!k) return;
        if (!p) { k.onizleme(null); return; }
        if (arac === 'bina' && model) {
          const o = binaOlcu ?? [10, 10, 8];
          // Önü en yakın yola döner (30 m içinde); R ile 15° döner
          const y = doluluk.enYakinYol(p, 30);
          const taban = y ? ondenEx([y.x - p[0], y.z - p[1]]) : acidanEx(0);
          const ex = acidanEx(exAcisi(taban) + koyAci);
          sonBina.current = { m: p, ex, en: o[0], boy: o[1] };
          k.onizleme({ halkalar: [{ h: dikdortgen(p, ex, o[0], o[1]), renk: '#0E1C4F', opak: 0.25 }] });
        } else if (arac === 'yol') {
          const c = [...cizilen, yapis(p)];
          k.onizleme({ cizgiler: c.length > 1 ? [{ c, renk: '#0E1C4F' }] : [], halkalar: [{ h: halkaYap(c[c.length - 1], 2), renk: '#F26B6F' }] });
        } else if (arac === 'grup' && cesit) {
          const y = grupYerlestir(cesit, p);
          sonGrup.current = y;
          if (!y) { k.onizleme(null); setGrupDurumu(''); return; }
          const { kutu } = grupCizimi(y.cesit, y.yer);
          k.onizleme({ halkalar: [{ h: kutu, renk: y.cakisma ? '#D9822B' : '#0E1C4F', opak: 0.22 }] });
          const kr = y.kirp;
          setGrupDurumu(`${y.cesit.en} × ${y.cesit.boy} kare${kr.sol + kr.sag + kr.arka ? ` · kırpıldı (sol ${kr.sol}, sağ ${kr.sag}, arka ${kr.arka})` : ' · tam hâli'}${y.cakisma ? ` · ${y.cakisma} kare dolu: uyarı olur` : ' · sığıyor'}`);
        } else if (arac === 'boya' && kareler) {
          const kr = kareBul(kareler, p);
          k.onizleme(kr ? { halkalar: [{ h: kr.koseler, renk: kr.bos ? '#0E1C4F' : '#D9822B', opak: kr.bos ? 0.25 : 0.12 }] } : null);
        } else k.onizleme(null);
      }
    };
  });

  const yolBitir = useCallback(() => {
    setCizilen(c => {
      if (c.length >= 2) {
        const id = yeniKimlik('yol');
        degistir(t => ({ ...t, yeniYollar: { ...t.yeniYollar, [id]: { kademe, tur: KADEME[kademe].yuzey, ad: '', n: c.flatMap(([x, sz]) => cografyaya(z.b, x, sz)) } } }));
        setNot('Yol çizildi. Seç aracıyla yola dokununca yol kartı açılır.');
      }
      return [];
    });
    katman.current?.onizleme(null);
  }, [degistir, kademe, z]);

  // Vurgu, tutamaklar, uyarı halkaları
  useEffect(() => {
    const k = katman.current;
    if (!k) return;
    if (seciliYapi) k.vurgu({ halkalar: [seciliYapi.taban] });
    else if (seciliKucuk) k.vurgu({ halkalar: [halkaYap(seciliKucuk.merkez, 2.5)] });
    else if (seciliYol) k.vurgu({ cizgiler: [seciliYol.c] });
    else k.vurgu(null);
    k.tutamaklar(seciliYol && !telefon ? seciliYol.c : [], seciliNokta, Math.max(1, api.kameraUzakligi() / 260));
    k.uyarilar(uyarilar.map(u => [u.x, u.z] as Nokta), 9);
  }, [api, seciliYapi, seciliKucuk, seciliYol, seciliNokta, uyarilar, telefon]);
  useEffect(() => { katman.current?.onizleme(null); setCizilen([]); setBolAcik(false); setGrupDurumu(''); if (arac !== 'sec') { setSecim(null); setSeciliNokta(null); } }, [arac]);

  // Klavye
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement;
      if (hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'SELECT' || hedef.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ileriAl(); else geriAl(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); ileriAl(); return; }
      if (e.key === 'Escape') { if (cizilen.length) setCizilen([]); else if (bolAcik) setBolAcik(false); else setSecim(null); katman.current?.onizleme(null); }
      if (e.key === 'Enter' && arac === 'yol') yolBitir();
      if (e.key === 'Backspace' && arac === 'yol' && cizilen.length) setCizilen(c => c.slice(0, -1));
      if (e.key.toLowerCase() === 'r') { if (arac === 'bina') setKoyAci(a => a + (e.shiftKey ? -DONUS : DONUS)); else dondur(e.shiftKey ? -DONUS : DONUS); }
      if ((e.key === 'Delete') && secim) {
        if (secim.tur === 'yol' && seciliYol) yoluSil(seciliYol.id, seciliYol.p.vikiId);
        else yapiyiSil(secim.id);
      }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [arac, bolAcik, cizilen, dondur, geriAl, ileriAl, secim, seciliYol, yapiyiSil, yolBitir, yoluSil]);

  // ---- düğmeler ---------------------------------------------------------------------
  const haritayaIsleBas = async () => {
    const anahtar = anahtariOku();
    if (!anahtar || isle === 'gidiyor') return;
    setIsle('gidiyor');
    try {
      await yaz();
      const m = await import('./haritayaIsle');
      setIsle({ adres: await m.haritayaIsle(anahtar, taslakRef.current) });
    } catch (e) { setIsle({ hata: e instanceof Error ? e.message : String(e) }); }
  };
  const driveBas = async () => {
    if (drive === 'gidiyor') return;
    setDrive('gidiyor');
    try {
      const m = await import('./driveYedegi');
      setDrive({ adres: await m.driveYedegiAl(items ?? [], taslakRef.current) });
    } catch (e) { setDrive({ hata: e instanceof Error ? (('metin' in e) ? String((e as { metin: string }).metin) : e.message) : String(e) }); }
  };
  const temizle = () => { setTemizleOnayi(false); degistir(() => bosTaslak()); setSecim(null); };

  const sayilar = taslakSayilari(taslak);
  const toplam = toplamDegisiklik(taslak);
  const anahtar = anahtariOku();
  const dugme = 'inline-flex items-center justify-center gap-1.5 min-h-9 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
  const bos = `${dugme} bg-[#FAF8F5] text-[#0E1C4F] border-[#CFC5B4] hover:border-[#F26B6F]`;
  const dolu = `${dugme} bg-[#0E1C4F] dark:bg-[#2C3C72] text-white border-transparent`;
  const baslik = 'text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A7C66]';
  const secimAdi = seciliYapi ? yapiAdi(seciliYapi) : seciliKucuk ? yapiAdi(seciliKucuk) : '';
  const etiket = secim ? grupEtiketi(secim.id) : undefined;
  const araclar: Array<{ id: Arac; ad: string; ikon: React.ReactNode; telefonda: boolean }> = [
    { id: 'sec', ad: 'Seç', ikon: <MousePointer2 className="w-3.5 h-3.5" />, telefonda: true },
    { id: 'bina', ad: 'Bina koy', ikon: <Building2 className="w-3.5 h-3.5" />, telefonda: false },
    { id: 'yol', ad: 'Yol çiz', ikon: <Route className="w-3.5 h-3.5" />, telefonda: false },
    { id: 'grup', ad: 'Hazır grup', ikon: <LayoutGrid className="w-3.5 h-3.5" />, telefonda: false },
    { id: 'boya', ad: 'Kare boya', ikon: <Grid2x2 className="w-3.5 h-3.5" />, telefonda: true }
  ];
  const kayitYazisi = !yuklendi ? 'Taslak okunuyor…'
    : kayit.durum === 'temiz' ? (toplam ? `Taslakta ${toplam} değişiklik` : 'Taslak boş')
      : kayit.durum === 'bekliyor' ? 'Kaydedilecek (20 sn biriktirilir)'
        : kayit.durum === 'yaziliyor' ? 'Kaydediliyor…'
          : kayit.durum === 'bulut' ? `${depo?.ad === 'KKM kaydı' ? 'KKM kaydına yazıldı' : `Kaydedildi (${depo?.ad})`} · ${saat(kayit.zaman)} · ${kb(kayit.bayt)}`
            : kayit.durum === 'cakisma' ? 'Taslak başka bir sekmede ya da cihazda değişti: üstüne yazılmadı. Sayfayı yenile.'
              : kayit.neden === 'kural' ? 'Bu tarayıcıda duruyor: Firebase kuralı yayımlanınca buluta da yazılır.'
                : kayit.neden === 'buyuk' ? 'Taslak çok büyüdü (400 bin harf): buluta yazılmadı, bu tarayıcıda duruyor. Haritaya işle.'
                  : `Bu tarayıcıda duruyor (buluta yazılamadı: ${kayit.neden}).`;

  return (
    <div className={telefon
      ? 'absolute left-2 right-2 bottom-2 max-h-[46%] overflow-y-auto rounded-xl bg-[#FAF8F5]/97 dark:bg-[#13204A]/97 border border-[#CFC5B4] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] p-2 text-[#0E1C4F] dark:text-[#F3EFE8] font-sans'
      : 'absolute right-3 top-14 max-h-[calc(100%-4.25rem)] w-[19.5rem] overflow-y-auto rounded-xl bg-[#FAF8F5]/97 dark:bg-[#13204A]/97 border border-[#CFC5B4] shadow-[0_8px_24px_-12px_rgba(14,28,79,0.5)] p-2.5 text-[#0E1C4F] dark:text-[#F3EFE8] font-sans'}
      onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <div className="text-[13px] font-semibold flex-1">Düzenle</div>
        <button type="button" onClick={geriAl} disabled={!gecmis.geri.length} className={bos} title="Geri al (Ctrl+Z)" aria-label="Geri al"><Undo2 className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={ileriAl} disabled={!gecmis.ileri.length} className={bos} title="İleri al (Ctrl+Y)" aria-label="İleri al"><Redo2 className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onKapat} className={bos} title="Düzenlemeyi bitir (taslak kayıtlı kalır)" aria-label="Kapat"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="mt-1 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">{kayitYazisi}</div>

      <div className="mt-2 flex flex-wrap gap-1">
        {araclar.filter(a => !telefon || a.telefonda).map(a => (
          <button key={a.id} type="button" onClick={() => setArac(a.id)} className={arac === a.id ? dolu : bos} aria-pressed={arac === a.id}>{a.ikon} {a.ad}</button>
        ))}
      </div>
      {telefon && <div className="mt-1 text-[11px] text-[#6A5E4C]">Telefonda: bakma, bina taşı ve döndür, kare boyama. Yol çizme, bina ve grup koyma bilgisayarda.</div>}

      {/* Araç ayrıntısı */}
      {arac === 'sec' && !secim && <p className="mt-2 text-[12px] leading-snug text-[#6A5E4C] dark:text-[#A6B0C9]">Bir yapıya, ağaca ya da yola dokun. Seçili yapıyı sürükleyerek taşırsın; R ile döner.</p>}
      {arac === 'bina' && (
        <div className="mt-2">
          <div className={baslik}>KKM'nin modelleri</div>
          <div className="mt-1 max-h-52 overflow-y-auto pr-1 space-y-1.5">
            {KATALOG.map(g => (
              <div key={g.baslik}>
                <div className="text-[11px] font-semibold text-[#6A5E4C]">{g.baslik}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {g.modeller.map(m => (
                    <button key={m.dosya} type="button" onClick={() => setModel(m)} className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer ${model?.dosya === m.dosya ? 'bg-[#0E1C4F] text-white border-transparent' : 'border-[#CFC5B4] hover:border-[#F26B6F]'}`}>{m.baslik}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[#6A5E4C]">{model ? `${model.baslik}: haritaya dokun, konur. Önü en yakın yola döner; R ile 15° çevir.` : 'Bir model seç.'}</p>
        </div>
      )}
      {arac === 'yol' && (
        <div className="mt-2">
          <div className={baslik}>Kademe</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {KADEMELER.map(k => <button key={k.id} type="button" onClick={() => setKademe(k.id)} className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer ${kademe === k.id ? 'bg-[#0E1C4F] text-white border-transparent' : 'border-[#CFC5B4] hover:border-[#F26B6F]'}`}>{k.ad}</button>)}
          </div>
          <p className="mt-1.5 text-[11px] text-[#6A5E4C]">Haritaya dokunarak noktaları koy; yakın yolun ucuna oturur. Çift tık ya da Enter bitirir, Esc vazgeçer. Ad boş kalır (ad Kemal'in).</p>
          {cizilen.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              <button type="button" onClick={yolBitir} disabled={cizilen.length < 2} className={dolu}>Yolu bitir ({cizilen.length} nokta)</button>
              <button type="button" onClick={() => setCizilen([])} className={bos}>Vazgeç</button>
            </div>
          )}
        </div>
      )}
      {arac === 'grup' && (
        <div className="mt-2">
          <div className={baslik}>Hazır gruplar (taslak)</div>
          {!gruplar ? <p className="text-[11px] mt-1">Gruplar iniyor…</p> : (
            <div className="mt-1 max-h-56 overflow-y-auto pr-1 space-y-1.5">
              {gruplar.gruplar.map(g => (
                <div key={g.id}>
                  <div className="text-[11px] font-semibold text-[#6A5E4C]">{g.ad}</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {g.cesitler.map(c => (
                      <button key={c.id} type="button" onClick={() => setCesitId(c.id)} title={c.tarif} data-cesit={c.id}
                        className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer ${cesitId === c.id ? 'bg-[#0E1C4F] text-white border-transparent' : 'border-[#CFC5B4] hover:border-[#F26B6F]'}`}>
                        {c.cesit.toUpperCase()} · {c.en}×{c.boy}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-[#6A5E4C]">{cesit ? `${cesit.ad}: ${cesit.yer === 'serit' ? 'boş karelere' : cesit.yer === 'kiyi' ? 'kıyıya' : 'bir yolun yanına'} gel, dokun. Sığmazsa kenar kareleri kırpılır.` : 'Bir çeşit seç.'}</p>
          {grupDurumu && <p className="mt-0.5 text-[11px] font-medium">{grupDurumu}</p>}
          {!kareler && <p className="text-[11px]">Kareler iniyor…</p>}
        </div>
      )}
      {arac === 'boya' && (
        <div className="mt-2">
          <div className={baslik}>Boş kareleri boya</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {BOYALAR.map(b => (
              <button key={b.id} type="button" onClick={() => setBoya(b.id)} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border cursor-pointer ${boya === b.id ? 'bg-[#0E1C4F] text-white border-transparent' : 'border-[#CFC5B4] hover:border-[#F26B6F]'}`}>
                <span className="w-2.5 h-2.5 rounded-sm border border-[#CFC5B4]" style={{ background: b.renk }} /> {b.ad}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[#6A5E4C]">Yolların yanındaki boş karelere dokun ya da sürükle. Arsa kareleri boyanmaz. {kareler ? '' : 'Kareler iniyor…'}</p>
        </div>
      )}

      {/* Seçimin kartı */}
      {arac === 'sec' && (seciliYapi || seciliKucuk) && (
        <div className="mt-2 p-2 rounded-lg border border-[#CFC5B4] bg-white/60 dark:bg-[#17345A]/60">
          <div className="text-[13px] font-semibold">{secimAdi}</div>
          <div className="text-[11px] text-[#8A7C66]">
            {(seciliYapi?.dosya ?? seciliKucuk?.dosya ?? 'modelsiz').split('/').pop()?.replace(/\.glb$/, '')}
            {bagli.has(secim!.id) ? ' · viki bağlı' : ''}{taslak.yapilar[secim!.id] ? ' · taşındı' : ''}{taslak.yeniYapilar[secim!.id] ? ' · yeni' : ''}
          </div>
          {etiket && <div className="text-[11px] text-[#8A7C66]">Grup: {gruplar?.cesit.get(etiket.sablon)?.ad ?? etiket.sablon} · öğe {etiket.yerel}</div>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button type="button" onClick={() => dondur(-DONUS)} className={bos} title="15° sola"><RotateCcw className="w-3.5 h-3.5" /> 15°</button>
            <button type="button" onClick={() => dondur(DONUS)} className={bos} title="15° sağa"><RotateCw className="w-3.5 h-3.5" /> 15°</button>
            <button type="button" onClick={() => dondur(Math.PI / 2)} className={bos} title="90° çevir">90°</button>
            {taslak.yapilar[secim!.id] && <button type="button" onClick={() => yerineDondur(secim!.id)} className={bos}>Eski yerine</button>}
            <button type="button" onClick={() => yapiyiSil(secim!.id)} disabled={bagli.has(secim!.id)} className={bos}
              title={bagli.has(secim!.id) ? 'Viki maddesine bağlı ya da evinde oturan var: silinmez' : 'Sil'}><Trash2 className="w-3.5 h-3.5" /> Sil</button>
            {etiket && !telefon && <button type="button" onClick={() => grubuSil(etiket.kimlik)} className={bos}>Bütün grubu sil</button>}
          </div>
          {bagli.has(secim!.id) && <p className="mt-1 text-[11px] text-[#6A5E4C]">Viki maddesine bağlı ya da evinde oturan var: silinmez, taşınabilir.</p>}
          <p className="mt-1 text-[11px] text-[#6A5E4C]">Taşımak için sürükle.</p>
        </div>
      )}
      {arac === 'sec' && seciliYol && (
        <div className="mt-2 p-2 rounded-lg border border-[#CFC5B4] bg-white/60 dark:bg-[#17345A]/60">
          <div className="flex items-center gap-1.5"><Route className="w-3.5 h-3.5" /><div className="text-[13px] font-semibold flex-1">Yol kartı</div></div>
          <label className="mt-1.5 block text-[11px] text-[#6A5E4C]">Ad
            <input type="text" value={String(seciliYol.p.ad ?? '')} placeholder="Adsız (ad Kemal'in)" maxLength={80}
              onChange={e => yolAlani(seciliYol.id, { ad: e.target.value })}
              className="mt-0.5 w-full px-2 py-1 rounded-md border border-[#CFC5B4] bg-white dark:bg-[#13204A] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]" />
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <label className="block text-[11px] text-[#6A5E4C]">Kademe
              <select value={String(seciliYol.p.kademe ?? 'sokak')} onChange={e => yolAlani(seciliYol.id, { kademe: e.target.value as Kademe })}
                className="mt-0.5 w-full px-1.5 py-1 rounded-md border border-[#CFC5B4] bg-white dark:bg-[#13204A] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
                {KADEMELER.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </select>
            </label>
            <label className="block text-[11px] text-[#6A5E4C]">Tür (yüzey)
              <select value={String(seciliYol.p.tur ?? 'taş')} onChange={e => yolAlani(seciliYol.id, { tur: e.target.value as Yuzey })}
                className="mt-0.5 w-full px-1.5 py-1 rounded-md border border-[#CFC5B4] bg-white dark:bg-[#13204A] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8]">
                {YUZEYLER.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-1 text-[11px] text-[#8A7C66]">{seciliYol.c.length} nokta · {Math.round(seciliYol.c.reduce((s, q, i) => s + (i ? Math.hypot(q[0] - seciliYol.c[i - 1][0], q[1] - seciliYol.c[i - 1][1]) : 0), 0))} m{seciliYol.yeni ? ' · yeni' : taslak.yollar[seciliYol.id] ? ' · değişti' : ''}{seciliYol.p.vikiId ? ' · viki bağlı' : ''}</div>
          {!telefon && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button type="button" onClick={() => setBolAcik(b => !b)} className={bolAcik ? dolu : bos} title="Yolun üstünde bölünecek yere dokun"><Scissors className="w-3.5 h-3.5" /> Böl</button>
              <button type="button" disabled={seciliNokta === null || seciliYol.c.length <= 2}
                onClick={() => { if (seciliNokta !== null) { yolNoktalari(seciliYol.id, seciliYol.c.filter((_, i) => i !== seciliNokta)); setSeciliNokta(null); } }} className={bos}>Noktayı sil</button>
              <button type="button" onClick={() => yoluSil(seciliYol.id, seciliYol.p.vikiId)} disabled={!!seciliYol.p.vikiId} className={bos}><Trash2 className="w-3.5 h-3.5" /> Yolu sil</button>
            </div>
          )}
          <p className="mt-1 text-[11px] text-[#6A5E4C]">{telefon ? 'Yolun güzergâhı bilgisayarda düzenlenir.' : bolAcik ? 'Yolun üstünde bölünecek yere dokun.' : 'Noktaları sürükleyerek taşı; yolun üstüne çift tık nokta ekler.'}</p>
        </div>
      )}
      {not && <p className="mt-2 text-[11px] font-medium text-[#0E1C4F] dark:text-[#F3EFE8]">{not}</p>}

      {/* Uyarılar */}
      {uyarilar.length > 0 && (
        <div className="mt-2">
          <div className={`${baslik} flex items-center gap-1`}><AlertTriangle className="w-3 h-3 text-[#D9822B]" /> Uyarılar ({uyarilar.length}) · engellemez</div>
          <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto pr-1">
            {uyarilar.map((u, i) => (
              <li key={`${u.id}-${u.tur}-${i}`}>
                <button type="button" onClick={() => { api.uc(u.x, u.z); setArac('sec'); setSecim(taslak.yeniYollar[u.id] || taslak.yollar[u.id] ? { tur: 'yol', id: u.id } : taslak.gruplar[u.id] ? null : { tur: 'yapi', id: u.id }); }}
                  className="w-full text-left text-[11px] leading-snug px-1.5 py-1 rounded-md hover:bg-[#F3EFE8] dark:hover:bg-[#17345A] cursor-pointer">
                  <span className="font-semibold">{u.ogeAdi}</span>: {u.metin}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Taslak ve işleme */}
      <div className="mt-2 pt-2 border-t border-[#E4D9C4] dark:border-[#2C3C72]">
        <div className={baslik}>Taslak</div>
        <div className="mt-0.5 text-[11px] text-[#6A5E4C] dark:text-[#A6B0C9]">
          {toplam ? [
            sayilar.tasinan && `${sayilar.tasinan} taşınan`, sayilar.silinen && `${sayilar.silinen} silinen`, sayilar.yeniYapi && `${sayilar.yeniYapi} yeni yapı`,
            sayilar.yol && `${sayilar.yol} değişen yol`, sayilar.yeniYol && `${sayilar.yeniYol} yeni yol`, sayilar.kare && `${sayilar.kare} boyalı kare`, sayilar.grup && `${sayilar.grup} grup`
          ].filter(Boolean).join(' · ') : 'Henüz değişiklik yok.'}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {!telefon && <button type="button" onClick={() => void haritayaIsleBas()} disabled={!anahtar || !toplam || isle === 'gidiyor'} className={dolu}
            title={!anahtar ? "GitHub anahtarı yok: Ajanlar ve otomasyonlar → Ajans bağlantısı'nda girilir" : 'Taslak ajansa gider; ajans haritaya işleyip KKM\'ye öneri PR\'ı açar'}>
            <Send className="w-3.5 h-3.5" /> {isle === 'gidiyor' ? 'Gönderiliyor…' : 'Haritaya işle'}
          </button>}
          <button type="button" onClick={() => void driveBas()} disabled={drive === 'gidiyor' || !!verilenDepo} className={bos}
            title={verilenDepo ? 'Deneme sayfasında yok' : 'Harita kaydı ve bu taslak Drive\'daki "KKM Yedekleri" klasörüne'}>
            <CloudUpload className="w-3.5 h-3.5" /> {drive === 'gidiyor' ? 'Yükleniyor…' : "Drive'a yedek"}
          </button>
          {kirliRef.current && <button type="button" onClick={() => void yaz()} className={bos}>Şimdi kaydet</button>}
          {!telefon && toplam > 0 && (temizleOnayi
            ? <><button type="button" onClick={temizle} className={bos}>Evet, taslağı boşalt</button><button type="button" onClick={() => setTemizleOnayi(false)} className={bos}>Vazgeç</button></>
            : <button type="button" onClick={() => setTemizleOnayi(true)} className={bos} title="Bütün değişiklikleri siler (geri al ile döner)">Taslağı boşalt</button>)}
        </div>
        {typeof isle === 'object' && 'adres' in isle && <p className="mt-1 text-[11px]">Ajansa gitti. Ajans haritaya işleyip KKM'ye PR açacak; birleştirince harita yeni hâliyle açılır. <a href={isle.adres} target="_blank" rel="noreferrer" className="underline">Dosya</a></p>}
        {typeof isle === 'object' && 'hata' in isle && <p className="mt-1 text-[11px]">Gönderilemedi: {isle.hata}</p>}
        {typeof drive === 'object' && 'adres' in drive && <p className="mt-1 text-[11px]">Yedek Drive'da. <a href={drive.adres} target="_blank" rel="noreferrer" className="underline">Klasör</a></p>}
        {typeof drive === 'object' && 'hata' in drive && <p className="mt-1 text-[11px]">Drive'a yazılamadı: {drive.hata}</p>}
        {!anahtar && !telefon && <p className="mt-1 text-[11px] text-[#8A7C66]">"Haritaya işle" için bu tarayıcıda GitHub anahtarı gerekir (Ajanlar ve otomasyonlar → Ajans bağlantısı).</p>}
      </div>
    </div>
  );
};

/** Kaydın süzülmüş kopyası */
function suz<T>(r: Record<string, T>, f: (id: string, v: T) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of Object.keys(r)) if (f(id, r[id])) out[id] = r[id];
  return out;
}

/** Noktanın çevresinde küçük halka */
function halkaYap(m: Nokta, r: number): Nokta[] {
  const h: Nokta[] = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; h.push([m[0] + Math.cos(a) * r, m[1] + Math.sin(a) * r]); }
  return h;
}

export default DuzenleModu;
