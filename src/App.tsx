import { kayitBoyutu } from './lib/buyukKayitlar';
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { sablonuOku, sablonuUygula } from './lib/alanSablonu';
import { isaretle } from './lib/olcumler';
import { 
  auth, 
  signInWithGoogle,
  logoutUser,
  driveIzniniYenile,
  subscribeToAllItemsWithArchived, 
  subscribeToSettings, 
  saveSettings, 
  saveItem, 
  deleteItemDoc,
  alanlariSil,
  askidakiYazilariDinle,
} from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { geceHazirliginiYap, yapilacaklar } from './lib/geceHazirligi';
import { Item, UserSettings, AreaType, ItemType } from './types';
import { maddeGorseli } from './lib/maddeGorseli';
import {
  ShoppingBag,
  Search,
  Compass,
  PenTool,
  Shield,
  Menu,
  Gamepad2,
  Home,
  Percent,
  Sparkles,
  Hammer,
  Sun,
  Moon,
  UserRound,
  KeyRound,
  LogOut,
  Megaphone,
  Globe,
  ArrowLeft,
} from 'lucide-react';
import { SAYFA_RAYI_YUVASI } from './components/SayfaRayi';
import { Studyo, StudyoPaneli } from './components/studyo/Studyo';
import { StudyoSaglayici, type StudyoIslemleri } from './components/studyo/StudyoBaglami';
import HizliFikir from './components/HizliFikir';
import ArtiMenu from './components/kabuk/ArtiMenu';
import HesapMenusu from './components/kabuk/HesapMenusu';
import { HataKapsayici } from './components/kabuk/HataKapsayici';
import { ayrilmayaIzinVar } from './lib/kaydedilmemis';

/**
 * Dinamik modül yükleyici: Ağ gecikmesi veya Vite önbellek yenilenmesi
 * durumunda modülü güvenle tekrar dener.
 */
function lazyYukle<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (ilkHata: any) {
      console.warn('Dinamik modül yüklenemedi, yeniden deneniyor...', ilkHata);
      await new Promise(r => setTimeout(r, 300));
      try {
        return await factory();
      } catch (ikinciHata: any) {
        const anahtar = 'kems_chunk_reload';
        const reloaded = sessionStorage.getItem(anahtar);
        if (!reloaded) {
          sessionStorage.setItem(anahtar, '1');
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
        sessionStorage.removeItem(anahtar);
        throw ikinciHata;
      }
    }
  });
}

/*
 * Sayfalar açılınca yüklenir (1 Ekim, K-3 Hız). Uygulama açılırken yalnız
 * kabuk ve ana sayfa iner; harita verisi, Oyun, Markalar… ilk girişte
 * bir an "yükleniyor" der, sonra hep hazırdır.
 */
const Durum = lazyYukle(() => import('./components/Durum'));
import type { DurumSekmesi } from './components/Durum';
import type { SeritHedefi } from './components/anasayfa/YuzdeSeridi';
const Duzada = lazyYukle(() => import('./components/Duzada'));
import type { DuzadaSekmesi } from './components/Duzada';
import type { AtolyeHedefi } from './components/Atolye';
const Merch = lazyYukle(() => import('./components/Merch'));
const Atolye = lazyYukle(() => import('./components/Atolye'));
const YaziAtolyesi = lazyYukle(() => import('./components/YaziAtolyesi'));
const Galeri = lazyYukle(() => import('./components/Galeri'));
const Sosyal = lazyYukle(() => import('./components/sosyal/Sosyal'));
const Site = lazyYukle(() => import('./components/site/Site'));
const SiteYonetimi = lazyYukle(() => import('./components/site/SiteYonetimi'));
const Takvim = lazyYukle(() => import('./components/takvim/Takvim'));
const FanzinSayfasi = lazyYukle(() => import('./components/fanzin/FanzinSayfasi'));
const YolHaritasiSayfasi = lazyYukle(() => import('./components/anasayfa/YolHaritasiSayfasi'));
const OyunEkrani = lazyYukle(() => import('./components/oyun/OyunEkrani'));
const Markalar = lazyYukle(() => import('./components/Markalar'));

/** Sayfa ilk kez yüklenirken */
const SayfaYukleniyor = () => (
  <div className="py-24 flex justify-center">
    <span className="text-[12px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] animate-pulse">Yükleniyor…</span>
  </div>
);
import { Yedekleme } from './components/Yedekleme';
import HizliNotModal from './components/HizliNotModal';
import AramaModal from './components/AramaModal';
import { Anasayfa, type TelSekmesi } from './components/anasayfa/Anasayfa';
import { Zil } from './components/kabuk/Zil';
import { useBildirimler, KANON_YOKSAY, type Bildirim, type KanonSatiri } from './lib/bildirimler';

/** Uygulamanın sayfaları. 'komuta' ana sayfa; eski Komuta Merkezi 'durum'. */
type Sayfa = 'komuta' | 'durum' | 'markalar' | 'duzada' | 'atolye' | 'merch' | 'yazi' | 'oyun' | 'studyo' | 'sosyal' | 'site';
/** 7 Ekim'de başka sayfanın sekmesi olanlar: eski adla gelen istek oraya yönlenir */
const SEKMEYE_GECENLER = ['fanzin', 'takvim', 'yolharitasi', 'galeri'];

export interface WorkspaceUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export default function App() {
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ theme: 'arşiv' });
  
  // A ref lock to prevent infinite loops of room de-duplication on items real-time updates
  
  // Navigation & interaction states
  const [activeTab, setActiveTab] = useState<Sayfa>('komuta');
  /** Paket 4: alt sekmeye doğrudan gitme istekleri (telefonda Harita, Kurucu, Kitap) */
  const [duzadaIstek, setDuzadaIstek] = useState<{ sekme: DuzadaSekmesi; n: number } | null>(null);
  const [atolyeIstek, setAtolyeIstek] = useState<{ sekme: AtolyeHedefi; n: number; aile?: string; madde?: string } | null>(null);
  const [yaziIstek, setYaziIstek] = useState<{ sekme: 'blog' | 'kitap' | 'fanzin'; n: number } | null>(null);
  /** Neyin Eksik sayfası açılırken açık gelecek başlık */
  const [eksikAcik, setEksikAcik] = useState<string | null>(null);
  /** Durum'un sekmesi (1 Ekim: Neyin Eksik Durum'a katıldı) */
  const [durumSekme, setDurumSekme] = useState<DurumSekmesi>('yuzdeler');
  /** Ana sayfanın yüzde şeridinden Durum'a gelince açılacak madde listesi (7 Ekim) */
  const [durumListe, setDurumListe] = useState<{ h: SeritHedefi; n: number } | null>(null);
  /** Markalar'da Galeri sekmesi açık mı (7 Ekim: Galeri Markalar'ın sekmesi) */
  const [markaGaleri, setMarkaGaleri] = useState(false);
  /** Telefonda ana sayfa sekmesi; açılışta Bugün */
  const [telSekme, setTelSekme] = useState<TelSekmesi>('bugun');
  /** Telefonda "Diğer" listesi */
  const [digerAcik, setDigerAcik] = useState(false);
  /** "+" ile gelen yeni not sayfası isteği */
  const [yeniNotBekliyor, setYeniNotBekliyor] = useState(false);
  const [bildirimNabzi, setBildirimNabzi] = useState(0);
  /** Site önizlemesi (29 Eylül gece): adres `#site` iken KKM yerine tam sayfa site */
  const siteAdresiMi = () => typeof location !== 'undefined' && /^#site(\/|$)/.test(location.hash);
  const [siteAcik, setSiteAcik] = useState(siteAdresiMi);
  useEffect(() => {
    const degisti = () => setSiteAcik(siteAdresiMi());
    window.addEventListener('hashchange', degisti);
    return () => window.removeEventListener('hashchange', degisti);
  }, []);
  /**
   * Google ile girilmiş mi (29 Eylül). Veriler 14 Eylül'e kadar Google
   * hesabının alanına yazıldı; girişsiz açılınca uygulama o kimliği yalnız
   * tarayıcının hafızasından hatırlıyor. Hafıza yoksa ortak alana
   * (kems_public) düşülüyor — veriler orada değil.
   */
  const [girisli, setGirisli] = useState(false);
  /** Tarayıcı Kemal'i hiç tanımıyor: giriş ekranı (ortak alan yok) */
  const [girisGerekli, setGirisGerekli] = useState(false);
  const [baglanmaHatasi, setBaglanmaHatasi] = useState<string | null>(null);
  const googleIleBaglan = async () => {
    setBaglanmaHatasi(null);
    try { await signInWithGoogle(); } catch (e: any) {
      setBaglanmaHatasi(e?.code === 'auth/popup-blocked'
        ? 'Tarayıcı açılan pencereyi engelledi; izin verip yeniden dene.'
        : e?.code === 'auth/unauthorized-domain'
          ? 'Bu adres Firebase girişinde izinli değil (yetkili alan adları listesine eklenmeli).'
          : `Bağlanılamadı: ${e?.code || e?.message || 'bilinmeyen'}`);
    }
  };
  /**
   * Çıkış (1 Ekim, Kemal: "çıkış butonu yok"). Bir kez sorar. Tarayıcının
   * hatırladığı hesap da unutulur; yeniden "Google ile bağlan" ekranı
   * çıkar. Kayıtlar Google hesabının alanında durur, silinmez.
   */
  const cikisYap = async () => {
    if (!window.confirm("Google hesabından çıkılsın mı? Kayıtların silinmez; yeniden bağlanınca hepsi yerinde olur.")) return;
    try { localStorage.removeItem('kems_last_uid'); } catch { /* yok */ }
    await logoutUser();
    setDigerAcik(false);
  };
  const driveIzni = async () => {
    setBaglanmaHatasi(null);
    try { await driveIzniniYenile(); } catch (e: any) { setBaglanmaHatasi(`İzin alınamadı: ${e?.code || e?.message || 'bilinmeyen'}`); }
  };
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHizliNotOpen, setIsHizliNotOpen] = useState(false);
  const [fikirAcik, setFikirAcik] = useState(false);
  const [digerAra, setDigerAra] = useState('');
  /** Sosyal medya → Seriler → "Takvimde gör" */
  const [takvimSeri, setTakvimSeri] = useState<{ id: string; n: number } | null>(null);
  /** Üst köşedeki logo yüklenemediyse o adres (tekrar denenmez) */
  const [logoHatasi, setLogoHatasi] = useState<string | null>(null);

  // Authentication & Settings observer (Açık erişim modu: Google girişi zorunlu değil)
  useEffect(() => {
    let unsubItems: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const setupWorkspaceForUser = async (activeUid: string, profile?: { displayName?: string | null; email?: string | null; photoURL?: string | null }) => {
      setUser({
        uid: activeUid,
        displayName: profile?.displayName || 'Açık Arşiv',
        email: profile?.email || 'acik@kems.local',
        photoURL: profile?.photoURL || null
      });

      // Clean up previous subscriptions if any
      if (unsubItems) {
        unsubItems();
        unsubItems = null;
      }
      if (unsubSettings) {
        unsubSettings();
        unsubSettings = null;
      }

      /*
       * Örnek veri tohumlama KALDIRILDI (29 Eylül). Boş bir alan açılınca
       * ilk günün örnek kayıtlarıyla (Kamil Efendi, Küçükçetmi Köy Meydanı…)
       * dolduruluyordu; Kemal ortak alana düşünce verileri "kaybolmuş" ve
       * yerine yabancı kayıtlar gelmiş gibi göründü. Boş alan boş kalır.
       */

      try {
        // Canlı dinleme; açılış ilk cevabını bekler (8 Ekim denetimi: önceden
        // kayıtlar önce bir kez tek seferde, hemen ardından dinlemeyle ikinci
        // kez okunuyordu). Bağlantı yavaşsa 8 sn sonra yine de açılır.
        await new Promise<void>(bitti => {
          let ilk = true;
          const zaman = setTimeout(bitti, 8000);
          unsubItems = subscribeToAllItemsWithArchived(activeUid, (fetchedItems) => {
            setItems(fetchedItems);
            if (ilk) { ilk = false; clearTimeout(zaman); bitti(); }
          });
        });

        // Listen to Firestore settings
        unsubSettings = subscribeToSettings(activeUid, (fetchedSettings) => {
          setSettings(fetchedSettings);
        });
      } catch (error) {
        console.error("Firestore abonelikleri baslatilirken hata olustu:", error);
      }
      
      setLoading(false);
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setGirisli(!!currentUser);
      if (currentUser) {
        setGirisGerekli(false);
        try {
          localStorage.setItem('kems_last_uid', currentUser.uid);
        } catch (_) {}
        await setupWorkspaceForUser(currentUser.uid, {
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL
        });
      } else {
        // Açık erişim modu: Google girişi zorunlu değil, doğrudan ortak alan (kems_public) açılır
        let storedUid: string | null = null;
        try {
          storedUid = localStorage.getItem('kems_last_uid');
        } catch (_) {}
        
        setGirisGerekli(false);
        const activeUid = storedUid || 'kems_public';
        await setupWorkspaceForUser(activeUid, {
          displayName: 'Kemal',
          email: 'kemal@kems.company',
          photoURL: null
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubItems) unsubItems();
      if (unsubSettings) unsubSettings();
    };
  }, []);

  // Manuel ve periyodik canlı veri çekimi
  /*
   * Kayıtlar canlı dinleniyor (`subscribeToAllItemsWithArchived`, bağlantı
   * koparsa kendini yeniden kurar). Pencereye her dönüşte bütün kayıtları
   * baştan çekmek kalktı (8 Ekim denetimi): her dönüş iki kez 149 okuma ve
   * ~7 MB indirme demekti, canlı dinleme zaten aynı veriyi getiriyor.
   */

  // Theme support
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      // Alt+N or Cmd+J for quick note
      if ((e.altKey && e.key === 'n') || ((e.metaKey || e.ctrlKey) && e.key === 'j')) {
        e.preventDefault();
        setIsHizliNotOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // K (28 Eylül 2026): açılışta oda kopyalarını birleştiren kod kaldırıldı.
  // Kopyaları SİLİYOR, odalara kendiliğinden "Deluxe" tipi ve 203/304'e
  // "bakımda" yazıyordu — ikisi de Kemal'in kararıyla vikiden kalktı.
  // Odalar W1'de arşive kalktı; eski simülasyonun verisi, viki değil.

  const handleToggleTheme = async () => {
    if (!user) return;
    const newTheme = settings.theme === 'arşiv' ? 'dark' : 'arşiv';
    await saveSettings(user.uid, { theme: newTheme });
  };

  // Firestore DB operations wrapper passed down
  /**
   * Kayıt sunucuya yazılamadıysa açıkça söylenir (2 Ekim gece, Kemal:
   * "düzenlediklerim anlık kaydoluyor, yenileyince eski hâline dönüyor").
   * Ekran değişikliği hemen gösteriyordu ama yazma reddedilince hiçbir şey
   * demiyordu; o gün veritabanının günlük yazma kotası dolmuştu.
   */
  const [kayitHatasi, setKayitHatasi] = useState<string | null>(null);
  // Uyarı "sunucuya ulaşmadı" türündeyse kuyruktaki yazılar ulaşınca kendiliğinden kalkar
  const [kayitAskida, setKayitAskida] = useState(false);
  const kayitHatasiGoster = (e: unknown) => {
    const metin = e instanceof Error ? e.message : String(e);
    const askida = /zaman-asimi/.test(metin);
    setKayitAskida(askida);
    setKayitHatasi(askida
      ? 'Kayıt 15 saniyedir sunucuya ulaşmadı: bağlantı kopmuş ya da veritabanının günlük yazma sınırı dolmuş olabilir. Değişiklik bu ekranda duruyor, tarayıcı göndermeyi deniyor; ulaşınca bu uyarı kendiliğinden kalkar. O zamana kadar sayfayı yenileme, sekmeyi kapatma; yoksa değişiklik kaybolur.'
      : /quota|resource.?exhausted/i.test(metin)
      ? 'Kaydedilemedi: veritabanının günlük yazma sınırı doldu. Değişiklik bu ekranda duruyor ama sayfayı yenilersen kaybolur. Sınır her gün Türkiye saatiyle 10:00\'da sıfırlanır.'
      : /maximum allowed size|exceeds the maximum|too large|1 ?MB|1048576|cok-buyuk/i.test(metin)
        ? 'Kaydedilemedi: bu madde 1 MB sınırını aşıyor (içindeki görseller büyük). Durum → Eksikler → "Büyük kayıtlar" kartıyla görselleri küçült, sonra yeniden kaydet. Değişiklik bu ekranda duruyor ama sayfayı yenilersen kaybolur.'
        : 'Kaydedilemedi: sunucu yazmayı kabul etmedi. Değişiklik bu ekranda duruyor ama sayfayı yenilersen kaybolur.');
  };

  const kayitAskidaRef = useRef(false);
  kayitAskidaRef.current = kayitAskida;
  useEffect(() => askidakiYazilariDinle((askida, gecHata) => {
    if (gecHata) kayitHatasiGoster(gecHata);
    else if (askida === 0 && kayitAskidaRef.current) { setKayitHatasi(null); setKayitAskida(false); }
  }), []);

  const handleAddItem = async (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { id?: string }) => {
    if (!user) return;
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    let id = itemData.id || `${itemData.type}_${Date.now()}_${randomSuffix}`;
    // Sanitize id to be safe for Firestore rules regex
    id = id
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/û/g, 'u')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-zA-Z0-9_\-]/g, '');

    const newItem: Item = {
      ...itemData,
      id,
      userId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    // İyimser anlık güncelleme: Sayılar ve liste sunucu turunu beklemeden anında yenilenir
    setItems(prev => [newItem, ...prev.filter(i => i.id !== id)]);
    try {
      await saveItem(user.uid, newItem);
    } catch (e) {
      kayitHatasiGoster(e);
      throw e;
    }
  };

  const handleUpdateItem = async (updatedItemHam: Item) => {
    if (!user) return;
    // Ad değişince eski ad maddenin eski adları arasına girer (8 Ekim, Kemal:
    // "Stadyum Plajı'nı Kuzey Plajı yaptım, her yerden değişmeli"): madde
    // eski adıyla da bulunur, soru turu onu yeniden açmaz, Eksikler'deki
    // "Ad değişikliği" kartı eski adı öbür maddelerde yenisiyle değiştirir.
    const onceki = items.find(i => i.id === updatedItemHam.id);
    const eskiAd = onceki?.title?.trim() || '';
    const yeniAd = updatedItemHam.title?.trim() || '';
    const eskiAdlar = Array.isArray(updatedItemHam.metadata?.eskiAdlar) ? (updatedItemHam.metadata!.eskiAdlar as string[]) : [];
    // `adYayilacak`: yalnız bu yoldan gelen değişiklikler yayılır; tarihî eski
    // adlar (İskele'nin "Kemsköy"ü gibi) eskiAdlar'da durur, metinde kalır.
    const yayilacak = Array.isArray(updatedItemHam.metadata?.adYayilacak) ? (updatedItemHam.metadata!.adYayilacak as string[]) : [];
    const updatedItem: Item = eskiAd && yeniAd && eskiAd !== yeniAd
      ? { ...updatedItemHam, metadata: {
          ...(updatedItemHam.metadata || {}),
          eskiAdlar: [...eskiAdlar.filter(a => a !== yeniAd && a !== eskiAd), eskiAd],
          adYayilacak: [...yayilacak.filter(a => a !== yeniAd && a !== eskiAd), eskiAd]
        } }
      : updatedItemHam;
    // 1 MB'ı aşan kayıt sunucuda reddedilir; önceden açık uyarı (8 Ekim)
    if (kayitBoyutu(updatedItem) > 1_040_000) {
      const e = new Error('cok-buyuk');
      kayitHatasiGoster(e);
      throw e;
    }
    // İyimser anlık güncelleme
    setItems(prev => prev.map(i => i.id === updatedItem.id ? { ...updatedItem, updatedAt: Date.now() } : i));
    try {
      await saveItem(user.uid, updatedItem);
    } catch (e) {
      kayitHatasiGoster(e);
      throw e;
    }
  };

  /** Kayıttan alan siler (eski alan temizliği, 2 Ekim gece) */
  const handleAlanSil = async (itemId: string, yollar: string[]) => {
    if (!user) return;
    const anahtarlar = yollar.map(y => y.replace(/^metadata\./, ''));
    setItems(prev => prev.map(i => {
      if (i.id !== itemId || !i.metadata) return i;
      const m = { ...i.metadata } as Record<string, unknown>;
      anahtarlar.forEach(k => { delete m[k]; });
      return { ...i, metadata: m as Item['metadata'] };
    }));
    try {
      await alanlariSil(user.uid, itemId, yollar);
    } catch (e) {
      kayitHatasiGoster(e);
      throw e;
    }
  };

  /**
   * "Sil" düğmelerinin hepsi buraya gelir. 29 Eylül, kural değişti (Kemal:
   * "arka tarafta kullanmadığımız ne varsa sil, arşiv işi beni
   * sinirlendirdi"): kayıt gerçekten silinir, arşive kalkmaz. Diğer
   * kayıtlardaki bağlar da temizlenir.
   */
  const handleDeleteItem = async (itemId: string) => {
    if (!user) return;
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await deleteItemDoc(user.uid, itemId);
    } catch (e) {
      kayitHatasiGoster(e);
      throw e;
    }
    for (const k of items) {
      if (k.id !== itemId && (k.links || []).includes(itemId)) {
        await handleUpdateItem({ ...k, links: k.links.filter(l => l !== itemId) });
      }
    }
  };

  /*
   * Gece hazırlığı (kural istisnası, Kemal 30 Eylül — yapisal-4, 17):
   * günde bir kez 3 üretim önerisi, ayın ilk günü fanzin taslağı; yalnız
   * öneri tepsisine. Yalnız Google ile girilmişken çalışır. Uygulama açık
   * kaldıkça 15 dakikada bir "yapılacak var mı" diye bakar; kota dolduysa bir
   * saat sonra yeniden dener (lib/geceHazirligi.ts).
   */
  const geceRef = useRef({ calisiyor: false, items, islem: { onAddItem: handleAddItem, onUpdateItem: handleUpdateItem } });
  geceRef.current.items = items;
  geceRef.current.islem = { onAddItem: handleAddItem, onUpdateItem: handleUpdateItem };
  useEffect(() => {
    if (loading || !user || !girisli) return;
    const dene = async () => {
      const g = geceRef.current;
      if (g.calisiyor || g.items.length === 0) return;
      const is = yapilacaklar(g.items);
      if (!is.oneriler && !is.fanzin) return;
      g.calisiyor = true;
      try {
        const rapor = await geceHazirliginiYap(g.items, g.islem);
        if (rapor) console.info(rapor);
      } catch (e) {
        console.warn('Gece hazırlığı yapılamadı:', e);
      } finally {
        g.calisiyor = false;
      }
    };
    const ilk = setTimeout(dene, 8000);
    const aralik = setInterval(dene, 15 * 60 * 1000);
    return () => { clearTimeout(ilk); clearInterval(aralik); };
  }, [loading, user, girisli]);

  /*
   * Sayfa her açıldığında kayıtlara kendiliğinden yazan eski kodlar SİLİNDİ
   * (29 Eylül): "yeni varlık" arşivleme, odaları otele bağlama, otel
   * kopyalarını birleştirme, olay temizliği, bağsız maddelere otomatik
   * ilişki önerisi. Kemal: "Google yapay zekâsı onları bulup bulup geri
   * getiriyor, bunu sevmiyorum." Artık kayıtlar yalnız Kemal bir düğmeye
   * bastığında değişir.
   */

  /**
   * Kems Company kaydı yoksa kurulur (boş notla, uydurma metin yok).
   *
   * 29 Eylül: Bu etki eskiden her açılışta marka kitine yapay zekânın
   * ürettiği bir SVG logo yazıyordu; logo tarayıcıda açılmıyordu ve üst
   * köşede, vikide kırık görünüyordu (Kemal: "wikide hâlâ kulüp ve marka
   * logoları görünmüyor"). Logo artık yazılmıyor; görsel `maddeGorseli`
   * sırasıyla bulunuyor (yüklenen → galeri → Canva yedeği).
   */
  useEffect(() => {
    if (!user || items.length === 0) return;
    const kemsCompanyItem = items.find(b => b.type === 'marka' && (b.id === 'kems_company' || b.title.toLowerCase() === 'kems company'));
    if (!kemsCompanyItem) {
      handleAddItem({
        id: 'kems_company',
        title: 'Kems Company',
        area: 'duzada',
        type: 'marka',
        status: 'Bitti',
        priority: 'yüksek',
        tags: ['marka'],
        links: [],
        notes: '',
        images: [],
        isProposal: false,
        archived: false,
        metadata: {
          brandKit: {
            selectedLogo: '',
            ideaLogos: [],
            colorPalette: ['#0E1C4F', '#F26B6F', '#F3EFE8'],
            exemplaryWorks: [],
            selectedFont: 'Poppins'
          }
        }
      });
    }
  }, [user, items]);

  const handleSelectResult = (item: Item) => {
    setActiveItemId(item.id);
    // Switch to correct tab based on item type
    if (item.type === 'drop' || item.type === 'merch_urun') {
      setActiveTab('merch');
    } else if (item.type === 'marka') {
      setMarkaGaleri(false);
      setActiveTab('markalar');
    } else if (item.type === 'blog_post') {
      setYaziIstek({ sekme: 'blog', n: Date.now() });
      setActiveTab('yazi');
    } else if (item.type === 'kitap_proje' || item.type === 'kitap_bolum') {
      setYaziIstek({ sekme: 'kitap', n: Date.now() });
      setActiveTab('yazi');
    } else if (item.type === 'sosyal_gonderi' || item.type === 'sosyal_seri') {
      // "Son dokunulanlar"dan gönderiye basınca vikiye düşüyordu (30 Eylül)
      setActiveTab('sosyal');
    } else if (item.type === 'ilham_gorsel' || item.type === 'ilham_kaynak') {
      setMarkaGaleri(true);
      setActiveTab('markalar');
    } else if (item.type === 'oyun_is' || item.type === 'gdd_bolum' || item.type === 'oyun_tanitim' || item.type === 'oyun_fikir') {
      setActiveTab('oyun');
    } else if (item.type === 'aday') {
      setActiveTab('studyo');
    } else if (item.type === 'tuval') {
      // Tuval panosu (6. gece): Atölye'de
      setAtolyeIstek({ sekme: 'tuval', n: Date.now(), madde: String(item.metadata?.bagliId || '') || undefined });
      setActiveTab('atolye');
    } else if (item.type === 'map_pin') {
      // Harita notu (5. gece): Atölye'de haritada
      setAtolyeIstek({ sekme: 'harita', n: Date.now() });
      setActiveTab('atolye');
    } else if (item.type === 'fikir') {
      /*
       * Brainstorm sekmesi kalktı (28 Eylül kararı). Fikirler köşedeki
       * hızlı fikir panosunda yaşıyor; ayrı bir sayfaya gitmek yok.
       * Fikre tıklanınca Düzada'ya düşüyor, orası evrenin ana ekranı.
       */
      setActiveTab('duzada');
      setDuzadaIstek({ sekme: 'wiki', n: Date.now() });
    } else {
      // Harita açıkken seçilen madde görünmüyordu (29 Eylül gece): vikiye geç
      setActiveTab('duzada');
      setDuzadaIstek({ sekme: 'wiki', n: Date.now() });
    }
  };

  /**
   * Sayılabilir varlıklar: arşivlenmemiş, öneri olmayan, ve gerçekten bir
   * "varlık" olanlar. Harita ayarı, kanal kaydı ve günlük not varlık değil —
   * bunlar uygulamanın kendi iç kayıtları.
   */
  /**
   * Alan şablonu (3. gece): Kemal'in kkm_ayar kaydındaki şablonu künye
   * okuyan bütün saf fonksiyonlara verir. Kayıt yoksa başlangıç şablonu.
   */
  // Açılış hızı (3. gece): kayıtların ekrana ilk geldiği an
  useEffect(() => { if (items.length) isaretle('kayitlar'); }, [items.length]);

  useMemo(() => {
    sablonuUygula(sablonuOku(items.find(i => i.type === 'kkm_ayar')?.metadata?.vikiSablonu));
  }, [items]);

  const SAYILMAZ_TIP = new Set(['map_settings', 'map_pin', 'tuval', 'channel', 'aday']);
  const varlikSayisi = useMemo(
    () => items.filter(
      i => !i.archived && !i.isProposal
        && !SAYILMAZ_TIP.has(i.type)
        && !i.tags?.includes('gunluk-not')
    ).length,
    [items]
  );

  /** Menüdeki kırmızı noktalar ve zil (Paket 4) */
  const bildirimler = useBildirimler(items, bildirimNabzi);
  const bildirimVar = (t: Bildirim['tur']) => bildirimler.some(b => b.tur === t);
  const bekleyenDugmeListesi = bildirimler.find(b => b.tur === 'dugme')?.ayrinti.split(' · ') ?? [];

  /**
   * Tek gezinme kapısı (Paket 4): menü, "Diğer" listesi, yüzde şeridi,
   * zil hepsi buradan geçer.
   */
  const git = (hedef: string, ayrinti?: string | null) => {
    if (!ayrilmayaIzinVar()) return;
    setDigerAcik(false);
    setActiveItemId(null);
    const n = Date.now();
    if (!hedef.startsWith('durum-')) setDurumListe(null);
    switch (hedef) {
      // 4. gece: Harita ve Kurucu Atölye'de
      case 'harita': case 'kurucu': setAtolyeIstek({ sekme: 'harita', n }); setActiveTab('atolye'); break;
      // Atölye'nin kendisi önce başlangıç ekranını açar (8 Ekim)
      case 'atolye': setAtolyeIstek({ sekme: 'giris', n }); setActiveTab('atolye'); break;
      case 'bagagi': setAtolyeIstek({ sekme: 'ag', n }); setActiveTab('atolye'); break;
      case 'zaman': setAtolyeIstek({ sekme: 'zaman', n }); setActiveTab('atolye'); break;
      case 'tuval': setAtolyeIstek({ sekme: 'tuval', n, ...(ayrinti ? { madde: ayrinti } : {}) }); setActiveTab('atolye'); break;
      case 'soyagaci': setAtolyeIstek({ sekme: 'soy', n, ...(ayrinti ? { aile: ayrinti } : {}) }); setActiveTab('atolye'); break;
      case 'viki': case 'kunye': case 'duzada': setDuzadaIstek({ sekme: 'wiki', n }); setActiveTab('duzada'); break;
      case 'kitap': setYaziIstek({ sekme: 'kitap', n }); setActiveTab('yazi'); break;
      case 'blog': setYaziIstek({ sekme: 'blog', n }); setActiveTab('yazi'); break;
      case 'bosluk': case 'bosluklar': setDurumSekme('bosluklar'); setActiveTab('durum'); break;
      case 'eksikler': setEksikAcik(ayrinti ?? null); setDurumSekme('eksikler'); setActiveTab('durum'); break;
      case 'durum': setDurumSekme('yuzdeler'); setActiveTab('durum'); break;
      // 7 Ekim: Fanzin Yazı'da; Takvim ve Yol haritası Durum'da; Galeri Markalar'da
      case 'fanzin': setYaziIstek({ sekme: 'fanzin', n }); setActiveTab('yazi'); break;
      case 'takvim': setDurumSekme('takvim'); setActiveTab('durum'); break;
      case 'yolharitasi': setDurumSekme('yolharitasi'); setActiveTab('durum'); break;
      case 'galeri': setMarkaGaleri(true); setActiveTab('markalar'); break;
      case 'markalar': setMarkaGaleri(false); setActiveTab('markalar'); break;
      case 'durum-kunye': case 'durum-kitap': case 'durum-harita':
        setDurumListe({ h: hedef.slice(6) as SeritHedefi, n }); setDurumSekme('yuzdeler'); setActiveTab('durum'); break;
      case 'site-onizleme': location.hash = 'site'; return;
      default: setActiveTab(hedef as Sayfa);
    }
    try { window.scrollTo({ top: 0 }); } catch { /* yok */ }
  };

  const maddeyiAc = (item: Item) => { handleSelectResult(item); };

  /** Bir maddenin "Tuvalde aç"ı (6. gece): lib/tuval → tuvaldeAc olayı */
  const gitRef = useRef(git);
  gitRef.current = git;
  useEffect(() => {
    const ac = (e: Event) => gitRef.current('tuval', (e as CustomEvent<{ maddeId?: string }>).detail?.maddeId ?? null);
    window.addEventListener('kems-tuval-ac', ac);
    return () => window.removeEventListener('kems-tuval-ac', ac);
  }, []);

  /* Eski adla gelen sayfa isteği (ör. bir alt ekrandan 'galeri') yeni yerine gider */
  useEffect(() => {
    if (SEKMEYE_GECENLER.includes(activeTab as string)) git(activeTab as string);
    else if ((activeTab as string) === 'araclar') setActiveTab('komuta');
  }, [activeTab]);

  /*
   * Geri tuşu (7 Ekim, Kemal: "telefonda geri tuşu yok, direkt uygulamadan
   * çıkıyor"). Her ekran değişimi tarayıcı geçmişine bir adım yazılır;
   * telefonun geri tuşu bir önceki ekrana döner, açık "Diğer" listesini
   * kapatır. Kaydedilmemiş yazı varsa önce sorulur. Site önizlemesi ayrı.
   */
  const sonEkran = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (siteAcik) return;
    const yeni: Record<string, unknown> = {
      kkm: true, tab: activeTab, item: activeItemId ?? null, durum: durumSekme,
      duzada: activeTab === 'duzada' ? (duzadaIstek?.sekme ?? 'wiki') : null,
      diger: digerAcik, galeri: activeTab === 'markalar' && markaGaleri
    };
    const eski = history.state as Record<string, unknown> | null;
    const ayni = !!eski?.kkm && ['tab', 'item', 'durum', 'duzada', 'diger', 'galeri'].every(k => (eski[k] ?? null) === (yeni[k] ?? null));
    if (ayni) { sonEkran.current = eski; return; }
    const kayit = { ...yeni, derinlik: eski?.kkm ? Number(eski.derinlik ?? 0) + 1 : 0 };
    if (eski?.kkm) history.pushState(kayit, '', location.pathname + location.search);
    else history.replaceState(kayit, '');
    sonEkran.current = kayit;
  }, [activeTab, activeItemId, durumSekme, duzadaIstek?.sekme, digerAcik, markaGaleri, siteAcik]);
  useEffect(() => {
    const geri = (e: PopStateEvent) => {
      const d = e.state as Record<string, any> | null;
      if (!d?.kkm) return;
      if (!ayrilmayaIzinVar()) {
        // Kaldığı ekranda kalsın: geri alınan adımı yeniden yaz
        if (sonEkran.current) history.pushState(sonEkran.current, '', location.pathname + location.search);
        return;
      }
      sonEkran.current = d;
      setActiveTab(d.tab as Sayfa);
      setActiveItemId(d.item ?? null);
      setDurumSekme((d.durum as DurumSekmesi) ?? 'yuzdeler');
      setDigerAcik(!!d.diger);
      setMarkaGaleri(!!d.galeri);
      if (d.tab === 'duzada' && (d.duzada === 'wiki' || d.duzada === 'rapor')) setDuzadaIstek({ sekme: d.duzada, n: Date.now() });
    };
    window.addEventListener('popstate', geri);
    return () => window.removeEventListener('popstate', geri);
  }, []);
  /** "Diğer"i kapatmak geçmişte bir adım geri gitmek demek (yeni adım yazılmaz) */
  const digeriKapat = () => {
    const d = history.state as Record<string, unknown> | null;
    if (d?.kkm && d.diger && Number(d.derinlik ?? 0) > 0) history.back();
    else setDigerAcik(false);
  };
  /** Ekrandaki geri oku: geçmişte KKM adımı varsa geri, yoksa ana sayfa */
  const geriGit = () => {
    const d = history.state as Record<string, unknown> | null;
    if (d?.kkm && Number(d.derinlik ?? 0) > 0) history.back();
    else git('komuta');
  };

  /** Kanon uyarısında "Yanlış alarm": anahtar maddeye yazılır (Kemal'in düğmesiyle) */
  const kanonYoksay = (k: KanonSatiri) => {
    const eski = (k.madde.metadata?.[KANON_YOKSAY] as string[] | undefined) || [];
    if (eski.includes(k.uyari.anahtar)) return;
    void handleUpdateItem({ ...k.madde, metadata: { ...k.madde.metadata, [KANON_YOKSAY]: [...eski, k.uyari.anahtar] }, updatedAt: Date.now() });
  };

  const bildirimSec = (b: Bildirim, madde?: Item) => {
    if (madde) { maddeyiAc(madde); return; }
    if (b.tur === 'dugme') { setTelSekme('bugun'); git('komuta'); }  // tek seferlik işler ana sayfanın üstünde
    else if (b.tur === 'kanon') { if (b.maddeler?.[0]) maddeyiAc(b.maddeler[0]); }
    else if (b.tur === 'aday') git('studyo');
    else if (b.tur === 'yedek') window.dispatchEvent(new Event('kems-yedek-ac', { cancelable: true }));
    else { setTelSekme('bugun'); git('komuta'); }
  };

  const handleSelectArea = (area: AreaType, itemId?: string) => {
    // 'blog' ve 'kitap' artık tek sekme: Yazı İşleri
    // Boşluklar artık Durum sayfasının içinde (29 Eylül)
    if (area === 'bosluklar') { git('bosluklar'); return; }
    const sekme = area === 'blog' || area === 'kitap' ? 'yazi' : area;
    setActiveTab(sekme as any);
    // Düzada'da bir madde seçildiyse harita değil viki açılsın (29 Eylül gece)
    if (sekme === 'duzada' && itemId) setDuzadaIstek({ sekme: 'wiki', n: Date.now() });
    if (itemId) {
      setActiveItemId(itemId);
    } else {
      setActiveItemId(null);
    }
  };

  const handleAcceptProposal = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      if (itemId.endsWith('_proposal')) {
        const originalId = itemId.slice(0, -9);
        const originalItem = items.find(i => i.id === originalId);
        if (originalItem) {
          // Merge proposal fields into the original item
          await handleUpdateItem({
            ...originalItem,
            title: item.title.replace(/\s*\(Öneri\)/i, ''),
            notes: item.notes,
            tags: item.tags.filter(t => t !== 'öneri'),
            metadata: item.metadata,
            links: item.links,
            priority: item.priority,
            status: item.type === 'drop' ? 'Konsept' : 'Bitti'
          });
          // Delete the proposal item
          await handleDeleteItem(itemId);
          return;
        }
      }
      
      // Standard accept logic
      await handleUpdateItem({
        ...item,
        title: item.title.replace(/\s*\(Öneri\)/i, ''),
        isProposal: false,
        status: item.type === 'drop' ? 'Konsept' : 'Bitti'
      });
    }
  };

  const handleSaveHizliNot = async (title: string, notes: string, area: AreaType, type: ItemType) => {
    await handleAddItem({
      title,
      notes,
      area,
      type,
      status: type === 'drop' || type === 'merch_urun' ? 'Konsept' : type === 'blog_post' ? 'Taslak' : type === 'kitap_bolum' ? 'taslak' : 'Fikir',
      priority: 'orta',
      tags: ['hızlı-not'],
      links: [],
      images: [],
      isProposal: false,
      archived: false,
      metadata: {}
    });
  };

  /** "+" menüsünün iki yolu (1 Ekim): Not → not defterinde yeni sayfa; Fikir → fikir kutusu */
  const yeniNot = () => { setTelSekme('notlar'); setYeniNotBekliyor(true); git('komuta'); };
  const bekleyenFikir = useMemo(
    () => items.filter(i => i.type === 'fikir' && !i.archived && !(i.metadata as any)?.donusenId && !(i.tags || []).includes('gunluk-not')).length,
    [items]
  );

  /** Stüdyonun işlemleri: sayfa, yan panel ve öneri tepsisi aynı işlemleri kullanır */
  // Düz nesne: işlemler her çizimde güncel kalsın (useMemo([items]) eski oturum bilgisini tutuyordu)
  const studyoIslemleri: StudyoIslemleri = {
    items,
    onAddItem: handleAddItem,
    onUpdateItem: handleUpdateItem,
    onDeleteItem: handleDeleteItem,
    onAcceptProposal: handleAcceptProposal,
    onMaddeyiAc: maddeyiAc,
    onStudyoSayfasi: () => git('studyo')
  };

  if (girisGerekli && !user) {
    return (
      <div className="min-h-screen bg-[#F3EFE8] dark:bg-[#0B132B] flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-6 text-center space-y-4">
          <div className="font-extrabold text-[28px] leading-none tracking-tight text-[#0E1C4F] dark:text-[#F3EFE8]">KEMS</div>
          <div className="mx-auto -mt-2 w-max bg-[#F26B6F] text-white text-[10px] font-bold tracking-[0.3em] pl-2.5 pr-2 py-0.5">COMPANY</div>
          <p className="text-[13px] leading-relaxed text-[#6A5E4C] dark:text-[#A6B0C9]">Komuta Merkezi Google hesabınla açılır. Kayıtların o hesabın alanında.</p>
          <button type="button" onClick={googleIleBaglan} className="w-full py-2.5 rounded-xl bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] text-[13px] font-semibold hover:opacity-90 cursor-pointer">
            Google ile bağlan
          </button>
          {baglanmaHatasi && <p className="text-[12px] text-[#B23A40] dark:text-[#F26B6F]">{baglanmaHatasi}</p>}
        </div>
      </div>
    );
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#F3EFE8] flex items-center justify-center font-mono text-xs text-[#6A5E4C]">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-[#F26B6F] border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Kems Komuta Merkezi Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Site önizlemesi: KKM'nin yerine tam sayfa (açılır pencere değil)
  if (siteAcik) {
    return (
      <Suspense fallback={<SayfaYukleniyor />}>
      <Site
        items={items}
        onKapat={() => { history.pushState(null, '', location.pathname + location.search); setSiteAcik(false); }}
      />
      </Suspense>
    );
  }

  // 2. MAIN LOGGED-IN VIEW
  const kemsCompanyItem = items.find(b => b.type === 'marka' && (b.id === 'kems_company' || b.title.toLowerCase() === 'kems company'));
  const kemsLogo = kemsCompanyItem ? maddeGorseli(kemsCompanyItem, items) : undefined;
  // Logo adresi yüklenemezse kırık resim yerine yazı logosu görünsün
  const hasKemsLogo = !!(kemsLogo && (kemsLogo.startsWith('http') || kemsLogo.startsWith('data:') || kemsLogo.startsWith('/'))) && logoHatasi !== kemsLogo;

  /*
   * Menü (Paket 4, Kemal 29 Eylül): masaüstünde solda ince simge çubuğu,
   * telefonda altta beş düğme — Ana sayfa · Viki · Harita · Merch · Diğer.
   * "Diğer" işe göre gruplu: Evren · Marka · Araçlar.
   *
   * 30 Eylül (Kemal: "sol menü kalabalık, anlaşılmıyor"): masaüstünde de
   * aynı gruplar. Kapalıyken yalnız simgeler; üstüne gelince çubuk açılır,
   * grup başlıkları ve adlar görünür.
   */
  const arti = (ek?: Partial<React.ComponentProps<typeof ArtiMenu>>) => (
    <ArtiMenu onNot={yeniNot} onFikir={() => setFikirAcik(true)} fikirSayisi={bekleyenFikir} {...ek} />
  );

  const RAY: Array<{ grup?: string; satirlar: Array<{ id: Sayfa; ad: string; alt?: string; simge: React.ElementType; nokta?: boolean }> }> = [
    { satirlar: [
      { id: 'komuta', ad: 'Ana sayfa', simge: Home, nokta: bildirimVar('aday') || bildirimVar('soru') }
    ] },
    { grup: 'Evren', satirlar: [
      { id: 'duzada', ad: 'Düzada', alt: 'viki ve Evren Raporu', simge: Compass, nokta: bildirimVar('kanon') },
      { id: 'atolye', ad: 'Atölye', alt: 'harita, bağ ağı, zaman, soy ağacı, tuval', simge: Hammer },
      { id: 'yazi', ad: 'Yazı', alt: 'kitap, blog, fanzin', simge: PenTool },
      { id: 'oyun', ad: 'Oyun', simge: Gamepad2 }
    ] },
    { grup: 'Marka', satirlar: [
      { id: 'markalar', ad: 'Markalar', alt: 'markalar ve galeri', simge: Shield },
      { id: 'merch', ad: 'Merch', alt: 'droplar ve ürünler', simge: ShoppingBag }
    ] },
    { grup: 'Araçlar', satirlar: [
      { id: 'studyo', ad: 'Yapay zekâ', alt: 'stüdyo ve öneri tepsisi', simge: Sparkles, nokta: bildirimVar('aday') },
      { id: 'sosyal', ad: 'Sosyal medya', alt: 'fikirler, seriler, ızgara', simge: Megaphone },
      { id: 'site', ad: 'Site', alt: 'kems.company önizlemesi', simge: Globe },
      { id: 'durum', ad: 'Durum', alt: 'yüzdeler, eksikler, takvim, yol haritası', simge: Percent, nokta: bildirimVar('dugme') }
    ] }
  ];

  /** Menü açılınca görünen yazılar (kapalıyken gizli, yer kaplamaz) */
  const RAY_ADI = 'min-w-0 whitespace-nowrap opacity-0 group-hover/ray:opacity-100 group-has-[:focus-visible]/ray:opacity-100 transition-opacity duration-150';

  /**
   * Telefonda "Diğer" (30 Eylül, Kemal: "büyük şeyler çok derine saklanmış").
   * 7 Ekim (Kemal: "çok fazla buton var, daha az başlık"; "Harita'yı Diğer'in
   * içine al, elim çarpıyor"): Harita buraya geldi; Fanzin Yazı'da, Takvim ve
   * Yol haritası Durum'da, Galeri Markalar'da. Arama sekme adlarını da bulur.
   */
  const DIGER: Array<{ grup: string; satirlar: Array<{ hedef: string; ad: string; alt?: string; simge: React.ElementType; nokta?: boolean }> }> = [
    { grup: 'Evren', satirlar: [
      { hedef: 'atolye', ad: 'Atölye', alt: 'harita, bağ ağı, zaman, soy ağacı, tuval', simge: Hammer },
      { hedef: 'yazi', ad: 'Yazı', alt: 'kitap, blog, fanzin', simge: PenTool },
      { hedef: 'oyun', ad: 'Oyun', simge: Gamepad2 }
    ] },
    { grup: 'Araçlar', satirlar: [
      { hedef: 'studyo', ad: 'Yapay zekâ', simge: Sparkles, nokta: bildirimVar('aday') },
      { hedef: 'sosyal', ad: 'Sosyal medya', simge: Megaphone },
      { hedef: 'site', ad: 'Site', simge: Globe },
      { hedef: 'durum', ad: 'Durum', alt: 'yüzdeler, eksikler, takvim, yol haritası', simge: Percent, nokta: bildirimVar('dugme') }
    ] },
    { grup: 'Marka', satirlar: [
      { hedef: 'markalar', ad: 'Markalar', alt: 'markalar ve galeri', simge: Shield }
    ] }
  ];
  /** Diğer'deki arama kutusu (1 Ekim): yazınca gruplar süzülür; alt yazı da aranır */
  const aranan = digerAra.trim().toLocaleLowerCase('tr');
  const digerSuzulmus = DIGER
    .map(g => ({ ...g, satirlar: g.satirlar.filter(r => !aranan || `${r.ad} ${r.alt ?? ''}`.toLocaleLowerCase('tr').includes(aranan)) }))
    .filter(g => g.satirlar.length > 0);

  const haritada = activeTab === 'atolye';
  const ALT: Array<{ id: string; ad: string; simge: React.ElementType; aktif: boolean; nokta?: boolean }> = [
    { id: 'komuta', ad: 'Ana sayfa', simge: Home, aktif: activeTab === 'komuta', nokta: bildirimVar('aday') || bildirimVar('soru') },
    { id: 'viki', ad: 'Viki', simge: Compass, aktif: activeTab === 'duzada' && !haritada, nokta: bildirimVar('kanon') },
    { id: 'merch', ad: 'Merch', simge: ShoppingBag, aktif: activeTab === 'merch' },
    { id: 'diger', ad: 'Diğer', simge: Menu, aktif: digerAcik || haritada || !['komuta', 'duzada', 'merch'].includes(activeTab), nokta: bildirimVar('dugme') || bildirimVar('aday') }
  ];

  const SAYFA_ADI: Record<Sayfa, string> = {
    komuta: 'Ana sayfa', duzada: 'Düzada', atolye: 'Atölye', markalar: 'Markalar', merch: 'Merch', yazi: 'Yazı',
    oyun: 'Oyun', durum: 'Durum', studyo: 'Yapay zekâ', sosyal: 'Sosyal medya', site: 'Site'
  };

  const logo = hasKemsLogo ? (
    <img
      src={kemsLogo}
      alt="Kems Company"
      className="w-10 h-10 rounded-lg object-contain bg-[#F3EFE8] shrink-0"
      referrerPolicy="no-referrer"
      onError={() => setLogoHatasi(kemsLogo || null)}
    />
  ) : (
    <span className="w-10 h-10 rounded-lg bg-[#F3EFE8] flex flex-col items-center justify-center shrink-0 leading-none">
      <span className="text-[#0E1C4F] font-extrabold text-[10px] tracking-tighter">KEMS</span>
      <span className="mt-0.5 px-0.5 bg-[#F26B6F] text-white font-bold text-[4.5px] tracking-wider">COMPANY</span>
    </span>
  );

  const temaSimgesi = settings.theme === 'dark' ? Sun : Moon;
  const TemaSimgesi = temaSimgesi;

  return (
    <StudyoSaglayici>
    <StudyoPaneli {...studyoIslemleri} />
    <div className="min-h-screen bg-[#F3EFE8] dark:bg-[#0B132B] text-[#0E1C4F] dark:text-[#F3EFE8] font-sans transition-colors duration-200 paper-grain selection:bg-[#F26B6F] selection:text-white">

      {kayitHatasi && (
        <div role="alert" className="fixed z-[60] top-3 left-3 right-3 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:max-w-xl flex items-start gap-2 rounded-xl bg-[#F26B6F] text-white px-4 py-3 text-[13px] font-medium shadow-[0_10px_26px_-10px_rgba(0,0,0,0.5)]">
          <span className="flex-1">{kayitHatasi}</span>
          <button type="button" onClick={() => { setKayitHatasi(null); setKayitAskida(false); }} aria-label="Kapat" className="shrink-0 px-1 font-bold cursor-pointer">×</button>
        </div>
      )}

      {/* MASAÜSTÜ: ince simge çubuğu; üstüne gelince açılır, adlar görünür */}
      <nav className="group/ray hidden lg:flex fixed inset-y-0 left-0 z-40 w-16 hover:w-60 has-[:focus-visible]:w-60 hover:delay-150 transition-[width,box-shadow] duration-200 hover:shadow-2xl flex-col py-3 overflow-x-hidden overflow-y-auto [scrollbar-width:none] bg-[#0E1C4F] dark:bg-[#081029]">
        <button type="button" onClick={() => git('komuta')} aria-label="Ana sayfa" className="mx-3 mb-2 flex items-center gap-3 cursor-pointer">
          {logo}
          <span className={RAY_ADI}><b className="block text-[13px] text-white">Kems Komuta</b><span className="block text-[10px] text-[#A6B0C9]">Merkezi</span></span>
        </button>
        {RAY.map((g, gi) => (
          <div key={gi} className={gi ? 'relative mt-2 pt-2 border-t border-white/10 mx-2.5' : 'mx-2.5'}>
            {/* Grup adı çizginin üstünde; kapalıyken yer kaplamaz */}
            {g.grup && <div className={`${RAY_ADI} absolute -top-[7px] left-2 px-1.5 bg-[#0E1C4F] dark:bg-[#081029] text-[9px] leading-[14px] font-bold uppercase tracking-[0.18em] text-[#6F7BA0]`}>{g.grup}</div>}
            {g.satirlar.map(r => {
              const Simge = r.simge;
              const aktif = activeTab === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => git(r.id)}
                  aria-label={r.ad}
                  className={`relative w-full h-11 rounded-xl flex items-center gap-3 px-3 cursor-pointer transition-colors ${aktif ? 'bg-[#F26B6F] text-white' : 'text-[#A6B0C9] hover:text-white hover:bg-white/10'}`}
                >
                  <Simge className="w-[18px] h-[18px] shrink-0" />
                  <span className={`${RAY_ADI} text-left leading-tight`}>
                    <span className="block text-[13px] font-semibold">{r.ad}</span>
                    {r.alt && <span className={`block text-[10px] ${aktif ? 'text-white/80' : 'text-[#6F7BA0]'}`}>{r.alt}</span>}
                  </span>
                  {r.nokta && <span className="absolute top-2 left-7 w-2 h-2 rounded-full bg-[#F26B6F] ring-2 ring-[#0E1C4F] dark:ring-[#081029]" />}
                </button>
              );
            })}
          </div>
        ))}
        <div className="mt-auto pt-2 mx-2.5 flex flex-col gap-1">
          {arti({
            yon: 'sag',
            tetikSinifi: 'w-full h-11 rounded-xl flex items-center gap-3 px-3 bg-[#F26B6F] text-white hover:opacity-90 cursor-pointer',
            etiket: <span className={`${RAY_ADI} text-[13px] font-semibold`}>Yeni not / fikir</span>
          })}
          <button type="button" onClick={() => setIsSearchOpen(true)} aria-label="Ara" className="w-full h-11 rounded-xl flex items-center gap-3 px-3 text-[#A6B0C9] hover:text-white hover:bg-white/10 cursor-pointer">
            <Search className="w-[18px] h-[18px] shrink-0" /><span className={`${RAY_ADI} text-[13px] font-semibold`}>Ara <kbd className="ml-1 text-[10px] text-[#6F7BA0]">⌘K</kbd></span>
          </button>
          {/* Bütün satır düğme: yazıya basınca da açılır (1 Ekim) */}
          <Zil bildirimler={bildirimler} onSec={bildirimSec} onKanonYoksay={kanonYoksay} yon="sag" etiket={<span className={`${RAY_ADI} text-[13px] font-semibold`}>Bildirimler</span>} />
          {user && (
            <Yedekleme
              items={items}
              settings={settings}
              onKayit={async kayit => { await saveItem(user.uid, kayit); }}
              etiket={<span className={`${RAY_ADI} text-[13px] font-semibold`}>Yedek</span>}
              tetikSinifi="relative w-full h-11 rounded-xl flex items-center gap-3 px-3 text-[#A6B0C9] hover:text-white hover:bg-white/10 cursor-pointer"
            />
          )}
          <HesapMenusu
            girisli={girisli}
            eposta={user?.email}
            foto={user?.photoURL}
            yaziSinifi={RAY_ADI}
            onBaglan={googleIleBaglan}
            onCikis={() => void cikisYap()}
            onDriveIzni={() => void driveIzni()}
          />
          <button type="button" onClick={handleToggleTheme} aria-label="Aydınlık / karanlık" className="w-full h-11 rounded-xl flex items-center gap-3 px-3 text-[#A6B0C9] hover:text-white hover:bg-white/10 cursor-pointer">
            <TemaSimgesi className="w-[18px] h-[18px] shrink-0" /><span className={`${RAY_ADI} text-[13px] font-semibold`}>{settings.theme === 'dark' ? 'Aydınlık' : 'Karanlık'}</span>
          </button>
        </div>
      </nav>

      <div className="lg:pl-16">
        {/* TELEFON: ana sayfa dışında ince üst çubuk */}
        {activeTab !== 'komuta' && (
          <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 px-4 py-2 bg-[#F3EFE8]/95 dark:bg-[#13204A]/95 backdrop-blur-xs border-b border-[#CFC5B4] dark:border-[#2C3C72]">
            <button type="button" onClick={geriGit} aria-label="Geri" className="-ml-2 w-11 h-11 rounded-full flex items-center justify-center text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer active:bg-[#E4DCCD] dark:active:bg-[#17345A]">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => git('komuta')} aria-label="Ana sayfa" className="mr-1 cursor-pointer">{logo}</button>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-[#6A5E4C] dark:text-[#A6B0C9] truncate">Komuta Merkezi</span>
              <span className="block truncate font-bold text-[16px]">{SAYFA_ADI[activeTab]}</span>
            </span>
            <button type="button" onClick={() => setIsSearchOpen(true)} title="Ara" className="w-11 h-11 rounded-full flex items-center justify-center text-[#6A5E4C] dark:text-[#A6B0C9] cursor-pointer">
              <Search className="w-[18px] h-[18px]" />
            </button>
            <Zil bildirimler={bildirimler} onSec={bildirimSec} onKanonYoksay={kanonYoksay} />
            {arti()}
          </header>
        )}

        <div className="max-w-[1500px] mx-auto w-full px-4 lg:px-6 pt-4 lg:pt-6 pb-28 lg:pb-12 flex flex-col lg:flex-row gap-3 lg:gap-6">
          {/*
            Sayfanın kendi rayı (SayfaRayi portal ile buraya basar). Masaüstünde
            menünün yanında dar bir sütun, telefonda sayfanın üstünde yana
            kayan bir şerit. Sayfanın rayı yoksa yer kaplamaz.
          */}
          <div id={SAYFA_RAYI_YUVASI} className="lg:w-48 lg:shrink-0 lg:sticky lg:top-6 lg:self-start empty:hidden min-w-0" />

          <main className="flex-1 min-w-0 overflow-x-clip">
            {/* Google girişi şimdilik kapatıldı */}

            {activeTab === 'komuta' && (
              <Anasayfa
                items={items}
                bugunDugmeler={bekleyenDugmeListesi}
                onGit={git}
                onMaddeyiAc={maddeyiAc}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAlanSil={handleAlanSil}
                studyo={studyoIslemleri}
                onOpenSearch={() => setIsSearchOpen(true)}
                onBildirimYenile={() => setBildirimNabzi(n => n + 1)}
                zil={<Zil bildirimler={bildirimler} onSec={bildirimSec} onKanonYoksay={kanonYoksay} />}
                yeniNotBekliyor={yeniNotBekliyor}
                arti={arti()}
                onYeniNotAcildi={() => setYeniNotBekliyor(false)}
                sekme={telSekme}
                onSekme={setTelSekme}
              />
            )}

            <HataKapsayici onReset={() => git('komuta')}>
            <Suspense fallback={<SayfaYukleniyor />}>
            {activeTab === 'durum' && (
              <Durum
                items={items}
                sekme={durumSekme}
                onSekme={setDurumSekme}
                onSec={h => git(h)}
                onSelectArea={handleSelectArea}
                onUpdateItem={handleUpdateItem}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
                onAlanSil={handleAlanSil}
                eksikAcik={eksikAcik}
                eposta={girisli ? user?.email : null}
                onMaddeAc={maddeyiAc}
                listeIstegi={durumListe}
                takvim={
                  <Takvim
                    items={items}
                    onAc={o => {
                      if (o.tur === 'fanzin') { git('fanzin'); return; }
                      const k = items.find(i => i.id === o.id);
                      if (k) handleSelectResult(k);
                    }}
                    onAddItem={handleAddItem}
                    onUpdateItem={handleUpdateItem}
                    onDeleteItem={handleDeleteItem}
                    seriIstegi={takvimSeri}
                  />
                }
                yolHaritasi={<YolHaritasiSayfasi items={items} eposta={girisli ? user?.email : null} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} />}
              />
            )}

            {activeTab === 'markalar' && (
              <Markalar
                items={items}
                onSelectItem={setActiveItemId}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onSelectArea={handleSelectArea}
                galeriAcik={markaGaleri}
                onGaleri={setMarkaGaleri}
                galeri={
                  <Galeri
                    items={items}
                    onAddItem={handleAddItem}
                    onUpdateItem={handleUpdateItem}
                    onDeleteItem={handleDeleteItem}
                    onSelectItem={(id) => {
                      const it = items.find(i => i.id === id);
                      if (it) handleSelectResult(it);
                    }}
                  />
                }
              />
            )}

            {activeTab === 'duzada' && (
              <Duzada
                items={items}
                activeItemId={activeItemId}
                onSelectItem={setActiveItemId}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                istek={duzadaIstek}
                onAtolye={() => git('atolye')}
                onSoyAgaci={aileId => git('soyagaci', aileId)}
              />
            )}

            {activeTab === 'atolye' && (
              <Atolye
                items={items}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onKayitAc={maddeyiAc}
                istek={atolyeIstek}
                onMaddeAc={id => { setDuzadaIstek({ sekme: 'wiki', n: Date.now() }); setActiveItemId(id); setActiveTab('duzada'); }}
              />
            )}

            {activeTab === 'merch' && (
              <Merch
                items={items}
                activeItemId={activeItemId}
                onSelectItem={setActiveItemId}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onSelectArea={handleSelectArea}
              />
            )}

            {activeTab === 'yazi' && (
              <YaziAtolyesi
                items={items}
                activeItemId={activeItemId}
                onSelectItem={setActiveItemId}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onMaddeAc={id => { const k = items.find(i => i.id === id); if (k) maddeyiAc(k); }}
                istek={yaziIstek}
                fanzin={<FanzinSayfasi items={items} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} onStudyo={() => git('studyo')} onMaddeAc={id => { const k = items.find(i => i.id === id); if (k) maddeyiAc(k); }} />}
              />
            )}

            {activeTab === 'oyun' && (
              <OyunEkrani
                items={items}
                activeItemId={activeItemId}
                onSelectItem={setActiveItemId}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddItem={handleAddItem}
                onNavigateToTab={(tab, itemId) => {
                  setActiveTab(tab as Sayfa);
                  setActiveItemId(itemId || null);
                }}
                onSelectArea={(area, itemId) => {
                  setActiveTab(area as Sayfa);
                  setActiveItemId(itemId || null);
                }}
              />
            )}

            {activeTab === 'studyo' && (
              <Studyo {...studyoIslemleri} onTemizlik={() => git('eksikler')} />
            )}

            {activeTab === 'site' && (
              <SiteYonetimi items={items} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} onOnizleme={() => git('site-onizleme')} onMaddeyiAc={maddeyiAc} />
            )}


            {activeTab === 'sosyal' && (
              <Sosyal
                items={items}
                acilacakId={activeItemId}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onTakvim={seriId => { git('takvim'); if (seriId) setTakvimSeri({ id: seriId, n: Date.now() }); }}
              />
            )}

            </Suspense>
            </HataKapsayici>

          </main>
        </div>
      </div>

      {/* TELEFON: alt menü */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-16 pb-[env(safe-area-inset-bottom)] flex items-stretch justify-around px-1 bg-[#0E1C4F] dark:bg-[#081029]">
        {ALT.map(a => {
          const Simge = a.simge;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => (a.id === 'diger' ? (setDigerAra(''), digerAcik ? digeriKapat() : setDigerAcik(true)) : git(a.id))}
              className={`relative flex-1 my-1.5 mx-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${a.aktif ? 'bg-[#F26B6F] text-white' : 'text-[#A6B0C9]'}`}
            >
              <Simge className="w-5 h-5" />
              {a.ad}
              {a.nokta && !a.aktif && <span className="absolute top-1.5 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-[#F26B6F]" />}
            </button>
          );
        })}
      </nav>

      {/* TELEFON: "Diğer" listesi — işe göre gruplu */}
      {digerAcik && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={digeriKapat}>
          <div
            className="absolute inset-x-0 bottom-16 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-[#FAF8F5] dark:bg-[#13204A] p-4 pb-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Arama kutusu (1 Ekim): yazınca düğmeler süzülür */}
            <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] text-[#6A5E4C] dark:text-[#A6B0C9]">
              <Search className="w-4 h-4 shrink-0" />
              <input
                value={digerAra}
                onChange={e => setDigerAra(e.target.value)}
                placeholder="Sayfa ara…"
                className="flex-1 min-w-0 bg-transparent text-[14px] text-[#0E1C4F] dark:text-[#F3EFE8] focus:outline-hidden"
              />
            </label>
            {digerSuzulmus.length === 0 && (
              <p className="text-[13px] text-[#6A5E4C] dark:text-[#A6B0C9]">Bu adla sayfa yok. Bütün kayıtlarda aramak için üstteki büyüteç.</p>
            )}
            {digerSuzulmus.map(g => (
              <div key={g.grup}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#F26B6F]" />
                  <span className="flex-1 text-[12px] font-bold uppercase tracking-[0.16em] text-[#6A5E4C] dark:text-[#A6B0C9]">{g.grup}</span>
                  <span className="text-[12px] tabular-nums text-[#6A5E4C] dark:text-[#A6B0C9]">{g.satirlar.length}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {g.satirlar.map(r => {
                    const Simge = r.simge;
                    return (
                      <button
                        key={r.hedef}
                        type="button"
                        onClick={() => git(r.hedef)}
                        className="relative flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[#F3EFE8] dark:bg-[#0B132B] text-[12px] font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer active:bg-[#E4DCCD] dark:active:bg-[#17345A]"
                      >
                        <Simge className="w-5 h-5 text-[#D6484C] dark:text-[#F26B6F]" />
                        {r.ad}
                        {r.nokta && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F26B6F]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleToggleTheme} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer">
                <TemaSimgesi className="w-4 h-4" /> {settings.theme === 'dark' ? 'Aydınlık' : 'Karanlık'}
              </button>
              {user && (
                <Yedekleme
                  items={items}
                  settings={settings}
                  onKayit={async kayit => { await saveItem(user.uid, kayit); }}
                  etiket="Yedek"
                  tetikSinifi="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer"
                />
              )}
            </div>
            {/* Hesap (1 Ekim): çıkış ve Drive izni telefonda da */}
            {girisli ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => void driveIzni()} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer">
                  <KeyRound className="w-4 h-4" /> Drive iznini yenile
                </button>
                <button type="button" onClick={() => void cikisYap()} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[#CFC5B4] dark:border-[#2C3C72] text-[12px] text-[#B23A40] dark:text-[#F26B6F] cursor-pointer">
                  <LogOut className="w-4 h-4" /> Çıkış yap
                </button>
              </div>
            ) : (
              <div className="w-full py-2.5 rounded-xl bg-[#0E1C4F]/5 dark:bg-[#2C3C72]/20 text-[#6A5E4C] dark:text-[#A6B0C9] text-[12px] font-medium text-center">
                Açık Erişim Modu
              </div>
            )}
            <p className="text-center text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
              {varlikSayisi} kayıtlı varlık · {girisli ? `Google: ${user?.email || ''}` : 'tarayıcı hatırlıyor'}
            </p>
            <p className="text-center text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
              Sürüm: {import.meta.env.VITE_SURUM || 'bilinmiyor'}
            </p>
          </div>
        </div>
      )}

      {/* Fikir kutusu: "+" menüsünden açılır */}
      <HizliFikir
        acik={fikirAcik}
        onAcikDegis={setFikirAcik}
        items={items}
        onAddItem={handleAddItem}
        onUpdateItem={handleUpdateItem}
      />

      <AramaModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={items}
        onSelectResult={handleSelectResult}
      />

      <HizliNotModal
        isOpen={isHizliNotOpen}
        onClose={() => setIsHizliNotOpen(false)}
        onSave={handleSaveHizliNot}
      />

    </div>
    </StudyoSaglayici>
  );
}
