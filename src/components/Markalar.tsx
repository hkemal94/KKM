import React, { useState, useMemo, useEffect } from 'react';
import { LogoKutusu } from './LogoKutusu';
import {
  Shield,
  Plus,
  Trash2,
  Edit3,
  PlusCircle,
  Palette,
  Users,
  MapPin,
  ShoppingBag,
  X,
  Upload,
  Layers,
  Images,
  Search,
} from 'lucide-react';
import { StudyodaAc } from './studyo/StudyodaAc';
import { Item, ItemType, AreaType } from '../types';
import { compressImageBase64 } from '../lib/imageCompressor';
import { resolveAllRelations, cleanupRelationsOnDelete } from '../utils/relations';
import { GomuluSayfa, SayfaBasi } from './kabuk/SayfaBasi';
import { KatlanirBolum } from './kabuk/KatlanirBolum';
import {
  MARKA_KUNYELERI, markayiBul, kunyeyiBirlestir, kunyedenYeni
} from '../data/markaKunyeleri';
import { SayfaRayi } from './SayfaRayi';
import { markaYapisi, kurumMu, dropBaglari } from '../lib/markaYapisi';
import { KurumOzeti } from './marka/KurumOzeti';
import { Kanallar } from './marka/Kanallar';
import { ANA_MARKA_KIMLIKLERI } from '../lib/markaYapisi';
import { maddeGorseli } from '../lib/maddeGorseli';
import { useGorselSurumu } from '../lib/gorselOnbellek';

interface MarkalarProps {
  items: Item[];
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onSelectArea: (area: AreaType, itemId?: string) => void;
  /** 7 Ekim: Galeri Markalar'ın sekmesi; içeriği App çizer */
  galeri?: React.ReactNode;
  galeriAcik?: boolean;
  onGaleri?: (acik: boolean) => void;
}

/** Raydaki Galeri satırının kimliği (marka kimlikleriyle karışmasın) */
const GALERI_SEKMESI = '__galeri';

export default function Markalar({
  items,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onSelectArea,
  galeri,
  galeriAcik = false,
  onGaleri
}: MarkalarProps) {
  const gorselSurumu = useGorselSurumu(); // galeri görselleri çözülünce yenilenir (21 Ekim)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  /**
   * M1 · Canva künyelerini uygula.
   *
   * Dirlik ve Küçükçetmi'nin armaları, renkleri ve tipografisi Canva'da
   * duruyordu; uygulamada boş kayıtlardı. Bu düğme ikisini birleştiriyor.
   * Birleştirme eksiltmez: yüklenmiş logo, moodboard ve notlar korunur.
   * Tek istisna renk paleti — Kemal'in kararı gereği Canva kazanır.
   */
  const [kunyeDurumu, setKunyeDurumu] =
    useState<'bos' | 'calisiyor' | 'bitti'>('bos');
  const [kunyeRaporu, setKunyeRaporu] = useState<string[]>([]);

  const kunyeleriUygula = async () => {
    if (kunyeDurumu === 'calisiyor') return;
    setKunyeDurumu('calisiyor');
    const rapor: string[] = [];
    try {
      for (const kunye of MARKA_KUNYELERI) {
        const mevcut = markayiBul(items, kunye);
        if (mevcut) {
          await onUpdateItem(kunyeyiBirlestir(mevcut, kunye));
          rapor.push(`${kunye.ad} · künye birleştirildi`);
        } else {
          await onAddItem(kunyedenYeni(kunye));
          rapor.push(`${kunye.ad} · kuruldu`);
        }
      }
      setKunyeRaporu(rapor);
      setKunyeDurumu('bitti');
    } catch (e) {
      setKunyeRaporu([
        `Hata: ${e instanceof Error ? e.message : 'bilinmeyen'}`,
        ...rapor
      ]);
      setKunyeDurumu('bitti');
    }
  };
  
  // Brand creation states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBrandTitle, setNewBrandTitle] = useState('');
  const [newBrandNotes, setNewBrandNotes] = useState('');
  
  // Selected Brand state edits
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [editBrandTitle, setEditBrandTitle] = useState('');
  const [editBrandNotes, setEditBrandNotes] = useState('');

  // Deep Brand Kit edit states (for draft/temp editing)
  const [editSlogan, setEditSlogan] = useState('');
  const [editVoiceTone, setEditVoiceTone] = useState('');
  const [editSelectedFont, setEditSelectedFont] = useState('Inter');
  const [editLogoBase64, setEditLogoBase64] = useState('');
  const [editSelectedLogo, setEditSelectedLogo] = useState('');
  const [editIdeaLogos, setEditIdeaLogos] = useState<string[]>([]);
  const [editColorPalette, setEditColorPalette] = useState<string[]>([]);
  const [editExexemplaryWorks, setEditExexemplaryWorks] = useState<string[]>([]);
  const [editAtmosphereMoodboard, setEditAtmosphereMoodboard] = useState<string[]>([]);
  const [editUsageRulesDo, setEditUsageRulesDo] = useState<string[]>([]);
  const [editUsageRulesDont, setEditUsageRulesDont] = useState<string[]>([]);
  const [newDoRule, setNewDoRule] = useState('');
  const [newDontRule, setNewDontRule] = useState('');
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  // Brand Kit input states
  const [newColor, setNewColor] = useState('#0E1C4F');
  const [newExemplar, setNewExemplar] = useState('');

  // Child entity creation modal/form
  const [showAddEntityForm, setShowAddEntityForm] = useState<ItemType | null>(null);
  const [newEntityTitle, setNewEntityTitle] = useState('');
  const [newEntityNotes, setNewEntityNotes] = useState('');
  const [newEntityPlaceId, setNewEntityPlaceId] = useState(''); // optionally belong to a place
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Helper to open the add entity interface
  const handleOpenAddEntity = (type: ItemType) => {
    setSearchQuery('');
    setIsCreatingNew(false);
    setShowAddEntityForm(type);
  };
  
  // Merch creation form state
  const [showMerchForm, setShowMerchForm] = useState(false);
  const [newThemeTitle, setNewThemeTitle] = useState('');
  const [newThemeNotes, setNewThemeNotes] = useState('');

  // AI Recommendation loading

  /**
   * Marka yapısı (7. madde). Kems Company tek marka; kulüpler kurgu içi
   * kurum. Ekran ikisini ayrı listeliyor ama gezinme tek liste üzerinden
   * yürüdüğü için `brands` ikisinin birleşimi kalıyor — aşağıdaki bütün
   * bağlama, seçme ve künye mantığı olduğu gibi çalışsın diye.
   */
  const yapi = useMemo(() => markaYapisi(items), [items]);
  /** Logo galerisi (1 Ekim): üstte büyük görünen logo ve denemelerin açıklığı */
  const [buyukLogo, setBuyukLogo] = useState<string | null>(null);
  const [denemelerAcik, setDenemelerAcik] = useState(false);
  useEffect(() => { setBuyukLogo(null); setDenemelerAcik(false); }, [selectedBrandId]);
  const brands = yapi.hepsi;

  // If no selectedBrandId, default to first brand, or null
  const activeBrandId = selectedBrandId || (brands.length > 0 ? brands[0].id : null) || null;

  const isUnassignedSelected = activeBrandId === 'unassigned';

  const activeBrand = useMemo(() => {
    if (activeBrandId === 'unassigned') {
      return {
        id: 'unassigned',
        title: 'Bağımsız / Markasız Varlıklar',
        area: 'duzada',
        type: 'marka',
        status: 'Bitti',
        priority: 'orta',
        tags: [],
        links: [],
        notes: 'Herhangi bir markaya bağlı olmayan, bağımsız dünya varlıkları (karakterler, mekânlar, olaylar, taslaklar vb.). Bu varlıkları detay sayfasından veya listedeki seçim kutularından istediğiniz markaya bağlayabilirsiniz.',
        images: [],
        isProposal: false,
        archived: false,
        metadata: {}
      } as Item;
    }
    if (!activeBrandId) return null;
    return brands.find(b => b.id === activeBrandId) || null;
  }, [activeBrandId, brands]);

  /** Marka kılavuzunu düzenlemeye aç; alanlar kayıttan doldurulur */
  const kitiDuzenle = () => {
    if (!activeBrand) return;
    setIsEditingBrand(true);
    setEditBrandTitle(activeBrand.title);
    setEditBrandNotes(activeBrand.notes || '');
    const bk = activeBrand.metadata?.brandKit || {};
    setEditSlogan(bk.slogan || '');
    setEditVoiceTone(bk.voiceTone || '');
    setEditSelectedFont(bk.selectedFont || 'Inter');
    setEditLogoBase64(bk.logoBase64 || '');
    setEditSelectedLogo(bk.selectedLogo || '');
    setEditIdeaLogos(bk.ideaLogos || []);
    setEditColorPalette(bk.colorPalette || []);
    setEditExexemplaryWorks(bk.exemplaryWorks || []);
    setEditAtmosphereMoodboard(bk.atmosphereMoodboard || []);
    setEditUsageRulesDo(bk.usageRulesDo || []);
    setEditUsageRulesDont(bk.usageRulesDont || []);
  };

  // Get existing entities of the chosen type that are not currently linked to this brand
  const existingEntitiesToLink = useMemo(() => {
    if (!showAddEntityForm || !activeBrandId) return [];
    
    let candidateTypes: string[] = [];
    if (showAddEntityForm === 'kisi') {
      candidateTypes = ['kisi', 'karakter'];
    } else if (showAddEntityForm === 'yer') {
      candidateTypes = ['yer', 'cadde', 'meydan', 'yer_adi', 'mekân', 'dükkân', 'oda'];
    } else {
      candidateTypes = [showAddEntityForm];
    }

    return items.filter(i => 
      !i.archived && 
      candidateTypes.includes(i.type) && 
      i.metadata?.brandId !== activeBrandId
    );
  }, [items, showAddEntityForm, activeBrandId]);

  // Filter existing entities by search query
  const filteredExistingEntities = useMemo(() => {
    if (!searchQuery.trim()) return existingEntitiesToLink;
    const query = searchQuery.toLowerCase();
    return existingEntitiesToLink.filter(i => 
      i.title.toLowerCase().includes(query) || 
      (i.notes && i.notes.toLowerCase().includes(query)) ||
      (i.tags && i.tags.some(t => t.toLowerCase().includes(query)))
    );
  }, [existingEntitiesToLink, searchQuery]);

  // Handle linking an existing entity to the brand (two-way)
  const handleLinkExistingEntity = async (entity: Item) => {
    if (!activeBrandId) return;
    const updated = {
      ...entity,
      metadata: {
        ...entity.metadata,
        brandId: activeBrandId === 'unassigned' ? undefined : activeBrandId
      }
    };
    await onUpdateItem(updated);
    setSearchQuery('');
    setShowAddEntityForm(null);
    setIsCreatingNew(false);
  };

  /**
   * Bu markaya / kuruma bağlı mı? Kurumlar (Dirlik → Dirlik Stadı) vikide
   * bağlantıyla bağlı, `brandId` ile değil; ikisi de sayılır (29 Eylül).
   */
  const bagliMi = (i: Item) => {
    if (!activeBrandId || isUnassignedSelected) return false;
    if (i.metadata?.brandId === activeBrandId) return true;
    if ((i.links || []).includes(activeBrandId)) return true;
    return (activeBrand?.links || []).includes(i.id);
  };

  // Get children entities (Kişiler, Yerler, Olaylar) belonging to activeBrand
  const brandKisiler = useMemo(() => {
    return items.filter(i => 
      !i.archived && 
      (i.type === 'kisi' || i.type === 'karakter') && 
      (isUnassignedSelected ? !i.metadata?.brandId : bagliMi(i))
    );
  }, [items, activeBrandId, isUnassignedSelected, activeBrand]);

  // Bağımsız görünümünde mahalleler (type 'yer') listelenmez: mahalle bir
  // markaya bağlanacak "varlık" değil, adanın kendisi (Kemal, 29 Eylül).
  const brandYerler = useMemo(() => {
    return items.filter(i => 
      !i.archived && 
      (isUnassignedSelected
        ? (i.type === 'mekân' || i.type === 'dükkân') && !i.metadata?.brandId
        : (i.type === 'yer' || i.type === 'mekân' || i.type === 'dükkân') && bagliMi(i))
    );
  }, [items, activeBrandId, isUnassignedSelected, activeBrand]);

  // Merch items for this brand.
  // Tema katmanı kaldırıldı (34 cevabın 16. maddesi): droplar doğrudan
  // markaya bağlı, araya başka bir halka girmiyor.
  const brandDroplar = useMemo(() => {
    return items.filter(i => 
      !i.archived && 
      i.type === 'drop' && 
      (isUnassignedSelected 
        ? !i.metadata?.brandId
        : i.metadata?.brandId === activeBrandId
      )
    );
  }, [items, activeBrandId, isUnassignedSelected]);

  // Products for this brand:
  const brandUrunler = useMemo(() => {
    const dropIds = brandDroplar.map(d => d.id);
    return items.filter(i => 
      !i.archived && 
      i.type === 'merch_urun' && 
      (isUnassignedSelected
        ? (!i.metadata?.brandId && !dropIds.includes(i.metadata?.dropId || ''))
        : (i.metadata?.brandId === activeBrandId || dropIds.includes(i.metadata?.dropId || ''))
      )
    );
  }, [items, activeBrandId, brandDroplar, isUnassignedSelected]);

  // Create a brand
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandTitle.trim()) return;

    const id = `marka_${Date.now()}`;
    const newBrand: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: newBrandTitle,
      area: 'duzada',
      type: 'marka',
      status: 'Fikir',
      priority: 'orta',
      tags: ['marka', 'brand'],
      links: [],
      notes: newBrandNotes,
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        brandKit: {
          selectedLogo: '',
          ideaLogos: [],
          colorPalette: ['#0E1C4F', '#F26B6F'],
          exemplaryWorks: [],
          selectedFont: 'Inter'
        }
      }
    };

    await onAddItem(newBrand);
    setNewBrandTitle('');
    setNewBrandNotes('');
    setShowCreateForm(false);
    setSelectedBrandId(id);
    alert('Yeni Marka başarıyla oluşturuldu!');
  };

  // Add child entity (Kişi, Yer, Olay)
  const handleAddChildEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntityTitle.trim() || !showAddEntityForm || !activeBrandId) return;

    const newItem: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: newEntityTitle,
      area: 'duzada',
      type: showAddEntityForm,
      status: 'Fikir',
      priority: 'orta',
      tags: [showAddEntityForm],
      links: [],
      notes: newEntityNotes,
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        brandId: activeBrandId === 'unassigned' ? undefined : activeBrandId,
        placeId: newEntityPlaceId || undefined,
        wikiSections: [],
        haritaKonum: null,
        region: 'merkez'
      }
    };

    await onAddItem(newItem);
    setNewEntityTitle('');
    setNewEntityNotes('');
    setNewEntityPlaceId('');
    setShowAddEntityForm(null);
    alert(activeBrandId === 'unassigned' ? 'Yeni bağımsız varlık başarıyla oluşturuldu!' : 'Yeni varlık markaya bağlı olarak oluşturuldu!');
  };

  // "Merch yap" — markanın kitiyle doğrudan bir DROP açar (tema yok).
  // Kurum sayfasından açılırsa drop Kems Company'nin olur, kurum yalnızca
  // "adada kimden çıktığı" olarak işaretlenir (bkz. markaYapisi.dropBaglari).
  const handleCreateBrandMerch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThemeTitle.trim() || !activeBrandId || !activeBrand) return;

    const itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: newThemeTitle,
      area: 'merch',
      type: 'drop',
      status: 'Konsept',
      priority: 'orta',
      tags: ['merch', 'drop'],
      links: [],
      notes: newThemeNotes,
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        ...dropBaglari(activeBrand, yapi),
        editionCount: 1,
        editionNotes: '1. Edisyon başlangıcı.'
      }
    };

    await onAddItem(itemData);
    setNewThemeTitle('');
    setNewThemeNotes('');
    setShowMerchForm(false);
    
    /*
     * Eskiden burada yerel bir `id` üretilip onSelectArea'ya veriliyordu; ama
     * kaydın gerçek kimliğini onAddItem üretiyor, yani o kimlik hiçbir zaman
     * tutmuyordu — açılan sayfa boş geliyordu. Artık drop listesine gidiyoruz.
     */
    onSelectArea('merch');
  };


  /**
   * Yan listedeki tek satır. Marka ve kurum aynı satırı kullanıyor; ayrım
   * listenin başlığında, satırın kendisinde değil. Kurumun logosu yoksa
   * kalkan yerine rozet simgesi çıkıyor.
   */
  const markaSatiri = (b: Item) => {
    const isActive = b.id === activeBrandId;
    const logo = maddeGorseli(b, items);
    const hasLogo = !!logo;
    const kurum = kurumMu(b);
    return (
      <div
        key={b.id}
        onClick={() => setSelectedBrandId(b.id)}
        className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${isActive ? 'bg-[#E7EBE6] dark:bg-[#17345A] border-[#9DB0A4] dark:border-[#2C3C72] shadow-xs font-semibold' : 'bg-white dark:bg-[#112440] border-[#E3DCCF] dark:border-[#2C3C72]/30 hover:bg-stone-50'}`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {hasLogo ? (
            <img src={logo} alt="" className="w-5 h-5 rounded object-cover border border-stone-200 shrink-0" referrerPolicy="no-referrer" />
          ) : kurum ? (
            <Users className="w-3.5 h-3.5 text-[#6A5E4C] dark:text-[#A6B0C9] shrink-0" />
          ) : (
            <Shield className="w-3.5 h-3.5 text-[#F26B6F] shrink-0" />
          )}
          <span className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8] truncate">{b.title}</span>
        </div>
        {b.isProposal && (
          <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-mono shrink-0">Öneri</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Sade başlık (1 Ekim, K-2); tutarlılık denetimi stüdyoda */}
      <SayfaBasi baslik="Markalar">
          {!galeriAcik && (<>
          {/* M1 · Canva'daki gerçek künyeleri uygulamaya birleştir */}
          <button
            onClick={kunyeleriUygula}
            disabled={kunyeDurumu === 'calisiyor'}
            title="Canva'daki arma, palet ve tipografi bilgilerini markalara işler. Yüklenmiş logolar korunur."
            className="flex items-center gap-1.5 text-xs font-mono px-3.5 py-2 bg-[#FAF8F5] hover:bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9] rounded-lg cursor-pointer transition-all disabled:opacity-40"
          >
            <Palette className="w-4 h-4" />
            <span>
              {kunyeDurumu === 'calisiyor' ? 'İşleniyor…' : 'Canva künyelerini uygula'}
            </span>
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 text-xs font-mono px-3.5 py-2 bg-[#F26B6F] text-white rounded-lg hover:bg-[#B23A40] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Marka Oluştur</span>
          </button>
          </>)}
      </SayfaBasi>

      {/*
        Sayfa rayı: burada "bölüm" markanın kendisi. Markalar ekranında
        gezinilecek başka bir şey yok — hangi markadaysan ana rayın altında
        görünür, oradan da geçilir.
      */}
      <SayfaRayi
        baslik="Markalar"
        bolumler={[...brands.map(b => ({ id: b.id, label: b.title })), ...(galeri ? [{ id: GALERI_SEKMESI, label: 'Galeri' }] : [])]}
        aktifId={galeriAcik ? GALERI_SEKMESI : activeBrandId ?? undefined}
        onSec={id => {
          if (id === GALERI_SEKMESI) { onGaleri?.(true); return; }
          onGaleri?.(false);
          setSelectedBrandId(id);
        }}
      />

      {galeriAcik ? <GomuluSayfa.Provider value={true}>{galeri}</GomuluSayfa.Provider> : (<>

      {kunyeDurumu === 'bitti' && kunyeRaporu.length > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-lg border border-[#CFC5B4] dark:border-[#2C3C72] bg-[#FAF8F5] dark:bg-[#13204A]">
          <Palette className="w-4 h-4 mt-0.5 shrink-0 text-[#6A5E4C] dark:text-[#A6B0C9]" />
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
              {kunyeRaporu.join(' · ')}
            </p>
            <p className="mt-1 text-[11px] text-[#6A5E4C] dark:text-[#95A1C2]">
              Renk paleti Canva'daki marka kitine göre güncellendi. Yüklediğin
              logolar ve moodboard'lar olduğu gibi duruyor.
            </p>
          </div>
          <button
            onClick={() => { setKunyeDurumu('bos'); setKunyeRaporu([]); }}
            className="ml-auto shrink-0 text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* LEFT BAR: BRAND NAVIGATION */}
        <div className="lg:col-span-1 space-y-4">
          {/* Telefonda bu iki liste gizli: aynı seçim üstteki çiplerde (1 Ekim, K-4) */}
          {/*
            7. madde · adım 1: tek liste yerine iki liste.
            Üstte marka (Kems Company), altta kurgu içi kurumlar. Kurum
            drop serisi açabilir; satan yine de her zaman marka.
          */}
          <div className="hidden lg:block bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-4 archive-shadow paper-grain space-y-3">
            <h3 className="text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
              Marka
            </h3>

            <div className="space-y-1.5">
              {yapi.anaMarka && markaSatiri(yapi.anaMarka)}
              {yapi.digerMarkalar.map(markaSatiri)}

              {!yapi.anaMarka && yapi.digerMarkalar.length === 0 && (
                <div className="text-center py-6 text-[11px] text-stone-500 dark:text-stone-400 italic">
                  Henüz marka bulunmuyor.
                </div>
              )}
            </div>

            {yapi.digerMarkalar.length > 0 && (
              <p className="text-[10px] text-[#6A5E4C] dark:text-[#95A1C2] leading-snug">
                Karar gereği tek marka var: Kems Company. Buradaki fazladan
                kayıt ya yeni bir marka ya da kurum olması gereken bir kulüp.
              </p>
            )}
          </div>

          <div className="hidden lg:block bg-[#FAF8F5] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-4 archive-shadow paper-grain space-y-3">
            <h3 className="text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
              Kurumlar · kurgu içi ({yapi.kurumlar.length})
            </h3>

            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {yapi.kurumlar.map(markaSatiri)}

              {yapi.kurumlar.length === 0 && (
                <div className="text-center py-5 text-[11px] text-stone-500 dark:text-stone-400 italic leading-snug">
                  Kurum kaydı yok.<br />Kulüpler henüz marka olarak duruyor.
                </div>
              )}
            </div>

            <p className="text-[10px] text-[#6A5E4C] dark:text-[#95A1C2] leading-snug">
              Kulüpler adanın kurumları: kendi arması, rengi ve künyesi var,
              altında drop serisi açılabilir. Ama gerçekte satan tek marka
              Kems Company — kurumun serileri onun ürünü olarak kaydedilir.
            </p>
          </div>

          {/* Bağımsız Varlıklar (Special Section) */}
          <div className="bg-[#FAF8F5] dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72]/60 rounded-xl p-4 archive-shadow paper-grain">
            <div
              onClick={() => setSelectedBrandId('unassigned')}
              className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${activeBrandId === 'unassigned' ? 'bg-[#E7EBE6] dark:bg-[#17345A] border-[#9DB0A4] dark:border-[#2C3C72] shadow-xs font-semibold' : 'bg-white dark:bg-[#112440] border-transparent hover:bg-stone-50'}`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                <span className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8]">Bağımsız Varlıklar</span>
              </div>
              <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-[#13204A] px-1.5 py-0.5 rounded-full">
                {items.filter(i => !i.archived && (i.type === 'kisi' || i.type === 'karakter' || i.type === 'mekân' || i.type === 'dükkân' || i.type === 'olay') && !i.metadata?.brandId).length}
              </span>
            </div>
            {/* 7 Ekim: Galeri Markalar'ın içinde */}
            {galeri && (
              <button type="button" onClick={() => onGaleri?.(true)}
                className="mt-1.5 w-full p-2.5 rounded-lg border border-transparent bg-white dark:bg-[#112440] hover:bg-stone-50 dark:hover:bg-[#17345A] cursor-pointer flex items-center gap-2 text-left">
                <Images className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                <span className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8]">Galeri</span>
              </button>
            )}
          </div>
        </div>

        {/* RIGHT WORKSPACE: DETAILED ACTIVE BRAND CONTAINER */}
        <div className="lg:col-span-3 space-y-6">
          {activeBrand ? (
            <div className="bg-[#E7EBE6] dark:bg-[#13204A] border-2 border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-6 archive-shadow paper-grain space-y-6">
              
              {/* Brand Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-[#CFC5B4]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-white px-2 py-0.5 rounded">
                      {activeBrand.id === 'unassigned'
                        ? 'BAĞIMSIZ SÜREÇ'
                        : kurumMu(activeBrand) ? 'KURUM / KİMLİK' : 'MARKA / KİMLİK'}
                    </span>
                    {activeBrand.isProposal && (
                      <span className="text-[10px] font-mono bg-amber-500 text-white px-2 py-0.5 rounded animate-pulse">
                        ÖNERİ SÜRECİNDE
                      </span>
                    )}
                  </div>
                  
                  {isEditingBrand ? (
                    <div className="space-y-2 mt-2">
                      <input
                        type="text"
                        value={editBrandTitle}
                        onChange={(e) => setEditBrandTitle(e.target.value)}
                        className="text-lg font-serif font-bold bg-white border border-[#CFC5B4] rounded px-2 py-1 focus:outline-hidden"
                      />
                    </div>
                  ) : (
                    <h2 className="font-sans font-bold text-2xl text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                      {activeBrand.title}
                    </h2>
                  )}
                </div>

                {activeBrand.id !== 'unassigned' && (
                  <div className="flex items-center gap-2">
                    {/* Merch yap button directly bound to Brand Kit! */}
                    <button
                      onClick={() => setShowMerchForm(true)}
                      className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-xs px-3.5 py-2 rounded-lg cursor-pointer shadow-xs"
                      title={kurumMu(activeBrand)
                        ? `${activeBrand.title} serisi olarak yeni bir drop — ürün Kems Company'nin olur`
                        : 'Bu markanın kitiyle yeni bir drop açın'}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{kurumMu(activeBrand) ? 'Seri Aç' : 'Merch Yap'}</span>
                    </button>

                    {isEditingBrand ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            await onUpdateItem({
                              ...activeBrand,
                              title: editBrandTitle,
                              notes: editBrandNotes,
                              metadata: {
                                ...activeBrand.metadata,
                                brandKit: {
                                  slogan: editSlogan,
                                  voiceTone: editVoiceTone,
                                  selectedFont: editSelectedFont,
                                  logoBase64: editLogoBase64,
                                  selectedLogo: editSelectedLogo,
                                  ideaLogos: editIdeaLogos,
                                  colorPalette: editColorPalette,
                                  exemplaryWorks: editExexemplaryWorks,
                                  atmosphereMoodboard: editAtmosphereMoodboard,
                                  usageRulesDo: editUsageRulesDo,
                                  usageRulesDont: editUsageRulesDont
                                }
                              }
                            });
                            setIsEditingBrand(false);
                          }}
                          className="px-3.5 py-2 bg-indigo-600 text-white text-xs font-mono rounded-lg hover:bg-indigo-700 cursor-pointer shadow-xs"
                        >
                          Kaydet
                        </button>
                        <button
                          onClick={() => setIsEditingBrand(false)}
                          className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-mono rounded-lg cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={kitiDuzenle}
                        className="p-2 bg-white dark:bg-[#17345A] border border-[#CFC5B4] rounded-lg hover:text-[#F26B6F] transition-all cursor-pointer"
                        title="Tüm Marka Kılavuzunu Düzenle"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {activeBrand.id !== 'kems_company' && (
                      <button
                        onClick={async () => {
                          if (deleteConfirmId === activeBrand.id) {
                            const activeRelations = resolveAllRelations(activeBrand, items);
                            if (activeRelations.length > 0) {
                              const proceed = window.confirm(`"${activeBrand.title}" markası ${activeRelations.length} diğer varlığa doğrudan bağlıdır. Markayı sildiğinizde bu bağlantılar da kesilecektir. Devam etmek istiyor musunuz?`);
                              if (!proceed) return;
                            }
                            await cleanupRelationsOnDelete(activeBrand.id, items, onUpdateItem);
                            await onDeleteItem(activeBrand.id);
                            setSelectedBrandId(null);
                            setDeleteConfirmId(null);
                          } else {
                            setDeleteConfirmId(activeBrand.id);
                            setTimeout(() => setDeleteConfirmId(prev => prev === activeBrand.id ? null : prev), 4000);
                          }
                        }}
                        className={`p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-mono ${
                          deleteConfirmId === activeBrand.id
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'bg-red-100 text-red-600 hover:bg-red-600 hover:text-white'
                        }`}
                        title="Markayı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleteConfirmId === activeBrand.id && 'Emin misiniz?'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Brand Proposals Flow Actions */}
              {activeBrand.isProposal && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border-2 border-dashed border-amber-300 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-amber-800 dark:text-amber-300">
                    ⚠️ Bu marka henüz taslak / öneri aşamasındadır. Resmi onay vererek kiti aktifleştirin.
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        await onUpdateItem({ ...activeBrand, isProposal: false, status: 'Bitti' });
                        alert('Marka resmileştirildi ve onaylandı!');
                      }}
                      className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                    >
                      Resmileştir / Onayla
                    </button>
                    <button
                      onClick={async () => {
                        if (deleteConfirmId === `proposal_${activeBrand.id}`) {
                          await cleanupRelationsOnDelete(activeBrand.id, items, onUpdateItem);
                          await onDeleteItem(activeBrand.id);
                          setSelectedBrandId(null);
                          setDeleteConfirmId(null);
                        } else {
                          setDeleteConfirmId(`proposal_${activeBrand.id}`);
                          setTimeout(() => setDeleteConfirmId(prev => prev === `proposal_${activeBrand.id}` ? null : prev), 4000);
                        }
                      }}
                      className={`px-3 py-1 rounded cursor-pointer ${
                        deleteConfirmId === `proposal_${activeBrand.id}`
                          ? 'bg-red-600 text-white animate-pulse font-bold'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {deleteConfirmId === `proposal_${activeBrand.id}` ? '⚠️ Emin misiniz?' : 'Reddet ve Sil'}
                    </button>
                  </div>
                </div>
              )}


              {/* MARKA KİTİ (Brand Kit) */}
              {activeBrand.id !== 'unassigned' && (() => {
                const bk = activeBrand.metadata?.brandKit || {
                  selectedLogo: '',
                  ideaLogos: [],
                  colorPalette: [],
                  exemplaryWorks: [],
                  selectedFont: 'Inter',
                  voiceTone: '',
                  atmosphereMoodboard: [],
                  usageRulesDo: [],
                  usageRulesDont: [],
                  slogan: ''
                };

                const fontMap: Record<string, string> = {
                  'Inter': '"Inter", sans-serif',
                  'Space Grotesk': '"Space Grotesk", sans-serif',
                  'Playfair Display': '"Playfair Display", serif',
                  'JetBrains Mono': '"JetBrains Mono", monospace',
                  'Outfit': '"Outfit", sans-serif'
                };

                const activeFont = fontMap[bk.selectedFont || 'Inter'] || '"Inter", sans-serif';

                return (
                  <div className="bg-white dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] p-6 rounded-xl space-y-6">
                    
                    {/* Slogan Banner */}
                    {!isEditingBrand ? (
                      <div 
                        onClick={() => {
                          if (!bk.slogan) {
                            setIsEditingBrand(true);
                            setEditSlogan('');
                          }
                        }}
                        className={`text-center py-4 border-b border-stone-100 dark:border-stone-800 cursor-pointer group transition-all`}
                      >
                        {bk.slogan ? (
                          <p className="font-serif italic text-lg text-[#F26B6F] transition-all group-hover:scale-[1.02]">
                            “{bk.slogan}”
                          </p>
                        ) : (
                          <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 group-hover:text-[#F26B6F] transition-colors flex items-center justify-center gap-1">
                            ✨ Slogan / Manifesto Ekle
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 pb-4 border-b border-stone-100">
                        <label className="block text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase">
                          Slogan / Manifesto / Misyon
                        </label>
                        <input
                          type="text"
                          value={editSlogan}
                          onChange={(e) => setEditSlogan(e.target.value)}
                          placeholder="Markanın felsefesini özetleyen çarpıcı bir slogan..."
                          className="w-full text-xs bg-stone-50 dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-300 rounded p-2 focus:outline-hidden focus:border-[#F26B6F]"
                        />
                      </div>
                    )}

                    {/* TWO-COLUMN GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      
                      {/* LEFT COLUMN */}
                      <div className="space-y-6">
                        
                        {/* 1. LOGO & EMBLEM GUIDE */}
                        <KatlanirBolum baslik="1. Logolar ve Amblemler" bos={false} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                          
                          {!isEditingBrand ? (
                            <div className="space-y-4">
                              {/*
                                Logo galerisi (1 Ekim, Kemal: "diğer logolara basınca yukarıdaki
                                logo tıkladığım logoya dönsün; birincil ve ikincil belli, kalanlar
                                denemeydi"). Basmak yalnız gösterir; "Birincil yap" / "İkincil yap"
                                düğmeleri kayda yazar.
                              */}
                              {(() => {
                                // Depodaki logolar da geçerli (8 Ekim: "/galeri/logolar/…")
                                const gecerli = (l: unknown): l is string => typeof l === 'string' && (l.startsWith('data:') || l.startsWith('http') || l.startsWith('/'));
                                const fikirler = (bk.ideaLogos || []) as string[];
                                const birincil = maddeGorseli(activeBrand, items) || '';
                                const ikincilSira = typeof bk.ikincilLogoSira === 'number' && gecerli(fikirler[bk.ikincilLogoSira]) ? bk.ikincilLogoSira : -1;
                                const ikincil = ikincilSira >= 0 ? fikirler[ikincilSira] : '';
                                // Alternatif (8 Ekim, Kemal: "birincil, ikincil ve alternatif")
                                const alternatifSira = typeof bk.alternatifLogoSira === 'number' && bk.alternatifLogoSira !== ikincilSira && gecerli(fikirler[bk.alternatifLogoSira]) ? bk.alternatifLogoSira : -1;
                                const alternatif = alternatifSira >= 0 ? fikirler[alternatifSira] : '';
                                const denemeler = fikirler.map((l, i) => ({ l, i })).filter(x => gecerli(x.l) && x.i !== ikincilSira && x.i !== alternatifSira && x.l !== birincil);
                                const gosterilen = buyukLogo && (buyukLogo === birincil || fikirler.includes(buyukLogo)) ? buyukLogo : birincil;
                                const rol = gosterilen === birincil ? 'Birincil' : gosterilen === ikincil ? 'İkincil' : gosterilen === alternatif ? 'Alternatif' : 'Deneme';
                                const kucuk = (src: string, etiket: string, anahtar: string) => (
                                  <button key={anahtar} type="button" onClick={() => setBuyukLogo(src)} title={`${etiket} · büyük göster`}
                                    className={`w-16 shrink-0 text-center cursor-pointer group/kucuk`}>
                                    <LogoKutusu src={src} alt={etiket} className={`w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden border-2 ${gosterilen === src ? 'border-[#F26B6F]' : 'border-transparent group-hover/kucuk:border-[#F26B6F]'}`} />
                                    <span className="block mt-1 text-[11px] text-stone-500 dark:text-stone-400">{etiket}</span>
                                  </button>
                                );
                                const yaz = async (degisen: Record<string, unknown>) => onUpdateItem({ ...activeBrand, metadata: { ...activeBrand.metadata, brandKit: { ...bk, ...degisen } }, updatedAt: Date.now() });
                                return (
                                  <>
                                    <div className="p-4 bg-stone-50 dark:bg-[#112440]/30 rounded-xl flex flex-col items-center justify-center min-h-[180px] relative">
                                      {gosterilen ? (
                                        <LogoKutusu src={gosterilen} alt={`${rol} logo`} zemin="" className="p-3 rounded-xl max-w-[184px] max-h-[184px] flex items-center justify-center" imgClassName="max-w-[160px] max-h-[160px] object-contain pointer-events-none select-none" />
                                      ) : (
                                        <div className="text-center space-y-1.5 text-stone-500 dark:text-stone-400">
                                          <Upload className="w-8 h-8 mx-auto stroke-1" />
                                          <span className="text-[12px] block font-sans">Henüz logo yok.</span>
                                        </div>
                                      )}
                                      <span className="absolute bottom-2 left-2 text-[11px] font-mono text-stone-500 dark:text-stone-400 uppercase tracking-widest bg-white dark:bg-stone-900 px-1.5 py-0.5 rounded">{rol}</span>
                                      {(rol === 'Deneme' || rol === 'Alternatif' || rol === 'İkincil') && (
                                        <span className="absolute bottom-2 right-2 flex gap-1.5">
                                          <button type="button" onClick={() => { if (window.confirm('Bu logo birincil logo olsun mu?')) void yaz({ logoBase64: gosterilen }); }} className="text-[12px] px-2.5 py-1.5 rounded bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] cursor-pointer">Birincil yap</button>
                                          {rol !== 'İkincil' && <button type="button" onClick={() => void yaz({ ikincilLogoSira: fikirler.indexOf(gosterilen) })} className="text-[12px] px-2.5 py-1.5 rounded border border-stone-300 dark:border-[#2C3C72] bg-white dark:bg-stone-900 cursor-pointer">İkincil yap</button>}
                                          {rol !== 'Alternatif' && <button type="button" onClick={() => void yaz({ alternatifLogoSira: fikirler.indexOf(gosterilen) })} className="text-[12px] px-2.5 py-1.5 rounded border border-stone-300 dark:border-[#2C3C72] bg-white dark:bg-stone-900 cursor-pointer">Alternatif yap</button>}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                                      {birincil && kucuk(birincil, 'Birincil', 'birincil')}
                                      {ikincil ? kucuk(ikincil, 'İkincil', 'ikincil') : (
                                        <span className="w-16 shrink-0 text-center text-[11px] text-stone-500 dark:text-stone-400 pt-4">İkincil seçilmedi</span>
                                      )}
                                      {alternatif && kucuk(alternatif, 'Alternatif', 'alternatif')}
                                      {denemelerAcik && denemeler.map(x => kucuk(x.l, 'Deneme', `d${x.i}`))}
                                    </div>
                                    {denemeler.length > 0 && (
                                      <button type="button" onClick={() => setDenemelerAcik(a => !a)} className="text-[12px] font-mono text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] cursor-pointer">
                                        {denemelerAcik ? 'Denemeleri gizle' : `Denemeleri göster (${denemeler.length})`}
                                      </button>
                                    )}
                                  </>
                                );
                              })()}

                              <div className="space-y-1.5">
                                {/*
                                  Armanın sözle tarifi. Görsel alanına metin
                                  yazınca kırık görsel çıkıyordu; tarif artık
                                  kendi yerinde, metin olarak duruyor.
                                */}
                                {Array.isArray(activeBrand.metadata?.armaTarifi)
                                  && activeBrand.metadata.armaTarifi.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-stone-200 dark:border-[#2C3C72]">
                                    <span className="block text-[9px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1.5">
                                      Arma Tarifi
                                    </span>
                                    <ul className="space-y-1">
                                      {activeBrand.metadata.armaTarifi.map((t: string) => (
                                        <li key={t} className="text-[11px] leading-snug text-[#6A5E4C] dark:text-[#A6B0C9]">
                                          · {t}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 bg-stone-50 dark:bg-[#112440]/30 p-4 border border-stone-200 rounded-xl">
                              
                              {/* Main logo inputs */}
                              <div className="space-y-1.5">
                                <label className="block text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase font-bold">
                                  Resmi Amblem Seçin
                                </label>
                                <div className="flex items-center gap-3">
                                  {editLogoBase64 ? (
                                    <div className="w-14 h-14 bg-white border border-stone-300 rounded flex items-center justify-center shrink-0 relative group">
                                      <img src={editLogoBase64} alt="Önizleme" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                      <button
                                        type="button"
                                        onClick={() => setEditLogoBase64('')}
                                        className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-mono flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                                      >
                                        Kaldır
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="w-14 h-14 bg-stone-100 border border-dashed border-stone-300 rounded flex items-center justify-center shrink-0 text-stone-500 dark:text-stone-400 text-xs">
                                      Boş
                                    </div>
                                  )}
                                  <div className="flex-1 space-y-1">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = async (evt) => {
                                          if (evt.target?.result) {
                                            const base64 = evt.target.result as string;
                                            const comp = await compressImageBase64(base64);
                                            setEditLogoBase64(comp);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }}
                                      className="text-[10px] text-stone-500 dark:text-stone-400 block w-full"
                                    />
                                    <span className="text-[9px] text-stone-500 dark:text-stone-400 block leading-tight">Yüklenen görsel resmi marka logosu olarak belirlenecektir.</span>
                                  </div>
                                </div>
                              </div>

                              {/* Idea Logos array editor */}
                              <div className="space-y-1.5 pt-2 border-t border-stone-200/50">
                                <label className="block text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase font-bold">
                                  Alternatif Fikir / Taslak Havuzu
                                </label>
                                <div className="flex gap-2 flex-wrap items-center">
                                  {editIdeaLogos.map((idea, idx) => (
                                    <div key={idx} className="w-12 h-12 bg-white border border-stone-300 rounded flex items-center justify-center shrink-0 relative group">
                                      <img src={idea} alt="Fikir" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                      <button
                                        type="button"
                                        onClick={() => setEditIdeaLogos(prev => prev.filter((_, i) => i !== idx))}
                                        className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-mono flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                                      >
                                        Kaldır
                                      </button>
                                    </div>
                                  ))}
                                  <label className="w-12 h-12 border-2 border-dashed border-stone-300 hover:border-[#F26B6F] rounded flex flex-col items-center justify-center cursor-pointer text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] transition-all">
                                    <Plus className="w-4 h-4" />
                                    <span className="text-[7px] font-mono uppercase font-bold">Yükle</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = async (evt) => {
                                          if (evt.target?.result) {
                                            const base64 = evt.target.result as string;
                                            const comp = await compressImageBase64(base64);
                                            setEditIdeaLogos(prev => [...prev, comp]);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </KatlanirBolum>

                        {/* 2. COLOR PALETTE WITH CLICK-TO-COPY */}
                        <KatlanirBolum baslik="2. Kurumsal Renk Paleti" ek={<><StudyodaAc
                              arac="marka-renk"
                              hedefId={activeBrand.id}
                              etiket="Renk önerisi · stüdyoda"
                              className="text-[9px] font-mono text-[#F26B6F] hover:underline flex items-center gap-1 cursor-pointer font-bold"
                            /></>} bos={!(bk.colorPalette || []).length} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>

                          {!isEditingBrand ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {(bk.colorPalette || []).map((color, idx) => {
                                const hex = color.split(' ')[0] || '';
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => {
                                      navigator.clipboard.writeText(hex);
                                      setCopiedColor(hex);
                                      setTimeout(() => setCopiedColor(null), 1200);
                                    }}
                                    className="p-2 bg-stone-50 dark:bg-[#112440]/20 border border-stone-200 dark:border-[#2C3C72]/30 rounded-xl flex items-center gap-2 cursor-pointer hover:scale-[1.03] active:scale-[0.98] transition-all relative overflow-hidden group select-none"
                                    title="Kodu Kopyala"
                                  >
                                    <span 
                                      className="w-7 h-7 rounded-lg border border-stone-200 shrink-0 inline-block" 
                                      style={{ backgroundColor: hex }} 
                                    />
                                    <div className="min-w-0 flex-1 leading-tight">
                                      <span className="block text-[10px] font-mono font-bold text-stone-700 dark:text-[#F3EFE8] uppercase truncate">{hex}</span>
                                      <span className="text-[8px] font-mono text-stone-500 dark:text-stone-400 block tracking-widest">KOPYALA</span>
                                    </div>
                                    
                                    {copiedColor === hex && (
                                      <div className="absolute inset-0 bg-[#E8F5E9] dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[8px] font-mono font-bold flex items-center justify-center animate-fade-in uppercase">
                                        ✓ KOPYALANDI
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {(bk.colorPalette || []).length === 0 && (
                                <p className="text-[11px] text-stone-500 dark:text-stone-400 italic py-2 col-span-full">Henüz renk paleti tanımlanmadı.</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3 bg-stone-50 dark:bg-[#112440]/30 p-3.5 border border-stone-200 rounded-xl">
                              <div className="flex gap-2 flex-wrap">
                                {editColorPalette.map((color, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 bg-white dark:bg-[#17345A] border border-stone-200 px-2 py-1 rounded shadow-xs text-[10px] font-mono">
                                    <span className="w-3.5 h-3.5 rounded-full border border-stone-300 inline-block shrink-0" style={{ backgroundColor: color }} />
                                    <span className="text-[#0E1C4F] dark:text-[#F3EFE8] truncate">{color}</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditColorPalette(prev => prev.filter((_, i) => i !== idx))}
                                      className="text-red-500 hover:text-red-700 font-bold shrink-0 text-xs ml-1"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 pt-2 border-t border-dashed border-stone-200">
                                <input
                                  type="color"
                                  value={newColor}
                                  onChange={(e) => setNewColor(e.target.value)}
                                  className="w-7 h-7 rounded cursor-pointer border border-stone-300 shrink-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!editColorPalette.includes(newColor)) {
                                      setEditColorPalette(prev => [...prev, newColor]);
                                    }
                                  }}
                                  className="px-3 py-1 bg-stone-200 text-stone-700 rounded text-xs hover:bg-stone-300 font-mono"
                                >
                                  Palete Ekle
                                </button>
                              </div>
                            </div>
                          )}
                        </KatlanirBolum>

                      </div>

                      {/* RIGHT COLUMN */}
                      <div className="space-y-6">
                        
                        {/* 3. TYPOGRAPHY PREVIEW */}
                        <KatlanirBolum baslik="3. Tipografi ve Karakter Yüzü" bos={!bk.selectedFont} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                          
                          {!isEditingBrand ? (
                            <div className="p-4 bg-stone-50 dark:bg-[#112440]/30 border border-stone-200 rounded-xl space-y-3">
                              <div className="flex items-center justify-between text-xs border-b border-stone-200/50 pb-1.5">
                                <span className="font-mono text-stone-500 dark:text-stone-400">Tercih Edilen Yazı Tipi:</span>
                                <span className="font-bold font-serif text-[#F26B6F]">{bk.selectedFont || 'Inter'}</span>
                              </div>
                              <div className="py-4 text-center select-none overflow-hidden">
                                <span 
                                  style={{ fontFamily: activeFont }} 
                                  className="text-2xl font-bold tracking-tight text-stone-800 dark:text-stone-100 block truncate"
                                >
                                  {activeBrand.title}
                                </span>
                                <span 
                                  style={{ fontFamily: activeFont }} 
                                  className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-widest block mt-1"
                                >
                                  ABCDEFGHIJKLMNOPQRSTUVWXYZ
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="block text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase">
                                Tercih Edilen Font Seçin
                              </label>
                              <select
                                value={editSelectedFont}
                                onChange={(e) => setEditSelectedFont(e.target.value)}
                                className="w-full text-xs bg-stone-50 dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-300 rounded p-2 focus:outline-hidden"
                              >
                                <option value="Inter">Inter (Swiss/Modern Sans-serif)</option>
                                <option value="Space Grotesk">Space Grotesk (Tech-forward Display)</option>
                                <option value="Playfair Display">Playfair Display (Editorial/Serif)</option>
                                <option value="JetBrains Mono">JetBrains Mono (Technical Minimalist)</option>
                                <option value="Outfit">Outfit (Clean Sans Display)</option>
                              </select>
                            </div>
                          )}
                        </KatlanirBolum>

                        {/* 4. VOICE AND TONE */}
                        <KatlanirBolum baslik="4. Ton ve Ses Kılavuzu (Voice & Tone)" bos={!bk.voiceTone} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                          
                          {!isEditingBrand ? (
                            <div className="p-4 bg-stone-50 dark:bg-[#112440]/30 border border-stone-200 rounded-xl leading-relaxed">
                              {bk.voiceTone ? (
                                <p className="text-xs text-stone-700 dark:text-stone-300 whitespace-pre-wrap font-sans">
                                  {bk.voiceTone}
                                </p>
                              ) : (
                                <span 
                                  onClick={() => setIsEditingBrand(true)}
                                  className="text-[10px] font-mono text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] cursor-pointer block text-center py-2"
                                >
                                  ✨ Ton ve Ses Kılavuzu Ekle...
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="block text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase">
                                Ton ve Ses Tanımı (Nasıl Konuşur, Nasıl İfade Eder?)
                              </label>
                              <textarea
                                rows={3}
                                value={editVoiceTone}
                                onChange={(e) => setEditVoiceTone(e.target.value)}
                                placeholder="Örn: Resmi, soğuk ama entelektüel; gizemli ve kışkırtıcı; her zaman rasyonel..."
                                className="w-full text-xs bg-stone-50 dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-300 rounded p-2 focus:outline-hidden font-sans"
                              />
                            </div>
                          )}
                        </KatlanirBolum>

                        {/* 5. USAGE RULES (DO & DONT) */}
                        <KatlanirBolum baslik="5. Marka Kullanım Kuralları" bos={!(bk.usageRulesDo || []).length && !(bk.usageRulesDont || []).length} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                          
                          {!isEditingBrand ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Do list */}
                              <div className="p-3 bg-emerald-50/35 dark:bg-emerald-950/10 border border-emerald-200/40 rounded-xl space-y-2">
                                <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  ✓ YAPIN (DO)
                                </span>
                                <ul className="space-y-1.5 text-[11px] font-sans text-stone-700 dark:text-stone-300">
                                  {(bk.usageRulesDo || []).map((rule, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5 leading-tight">
                                      <span className="text-emerald-500 text-xs mt-0.5 shrink-0">✓</span>
                                      <span>{rule}</span>
                                    </li>
                                  ))}
                                  {(bk.usageRulesDo || []).length === 0 && (
                                    <span className="text-[10px] text-stone-500 dark:text-stone-400 italic font-sans block text-center py-1">Kural belirtilmedi.</span>
                                  )}
                                </ul>
                              </div>

                              {/* Dont list */}
                              <div className="p-3 bg-red-50/35 dark:bg-red-950/10 border border-red-200/40 rounded-xl space-y-2">
                                <span className="text-[9px] font-mono uppercase tracking-wider text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                                  ✕ YAPMAYIN (DON'T)
                                </span>
                                <ul className="space-y-1.5 text-[11px] font-sans text-stone-700 dark:text-stone-300">
                                  {(bk.usageRulesDont || []).map((rule, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5 leading-tight">
                                      <span className="text-red-500 text-xs mt-0.5 shrink-0">✕</span>
                                      <span>{rule}</span>
                                    </li>
                                  ))}
                                  {(bk.usageRulesDont || []).length === 0 && (
                                    <span className="text-[10px] text-stone-500 dark:text-stone-400 italic font-sans block text-center py-1">Kural belirtilmedi.</span>
                                  )}
                                </ul>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 border border-stone-200 rounded-xl">
                              
                              {/* Edit Do rules */}
                              <div className="space-y-2">
                                <label className="block text-[9px] font-mono font-bold uppercase text-emerald-700 dark:text-emerald-400">✓ YAPIN (DO)</label>
                                <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                                  {editUsageRulesDo.map((rule, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-1 rounded border text-[10px] font-sans">
                                      <span className="truncate flex-1 pr-1">{rule}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => setEditUsageRulesDo(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-red-500 font-bold hover:text-red-700"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    value={newDoRule}
                                    onChange={(e) => setNewDoRule(e.target.value)}
                                    placeholder="Yeni Yap kuralı..."
                                    className="flex-1 text-[10px] bg-white text-stone-800 border rounded p-1 focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (newDoRule.trim()) {
                                        setEditUsageRulesDo(prev => [...prev, newDoRule.trim()]);
                                        setNewDoRule('');
                                      }
                                    }}
                                    className="px-2 py-1 bg-emerald-600 text-white font-mono text-[9px] rounded uppercase"
                                  >
                                    Ekle
                                  </button>
                                </div>
                              </div>

                              {/* Edit Dont rules */}
                              <div className="space-y-2">
                                <label className="block text-[9px] font-mono font-bold uppercase text-red-600">✕ YAPMAYIN (DON'T)</label>
                                <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                                  {editUsageRulesDont.map((rule, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-1 rounded border text-[10px] font-sans">
                                      <span className="truncate flex-1 pr-1">{rule}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => setEditUsageRulesDont(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-red-500 font-bold hover:text-red-700"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    value={newDontRule}
                                    onChange={(e) => setNewDontRule(e.target.value)}
                                    placeholder="Yeni Yapma kuralı..."
                                    className="flex-1 text-[10px] bg-white text-stone-800 border rounded p-1 focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (newDontRule.trim()) {
                                        setEditUsageRulesDont(prev => [...prev, newDontRule.trim()]);
                                        setNewDontRule('');
                                      }
                                    }}
                                    className="px-2 py-1 bg-red-600 text-white font-mono text-[9px] rounded uppercase"
                                  >
                                    Ekle
                                  </button>
                                </div>
                              </div>

                            </div>
                          )}
                        </KatlanirBolum>

                      </div>

                    </div>

                    {/* 6. SAMPLE GALLERY & MOODBOARD (IMAGE SECTIONS) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-stone-100 dark:border-stone-800">
                      
                      {/* Exemplary Works Archive */}
                      <KatlanirBolum baslik="6. Tasarım Örnekleri & İlham Arşivi" bos={!(bk.exemplaryWorks || []).length} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                        
                        {!isEditingBrand ? (
                          <div className="grid grid-cols-3 gap-2.5">
                            {(bk.exemplaryWorks || []).map((work, idx) => (
                              <div key={idx} className="aspect-square bg-stone-50 border border-stone-200 rounded-xl overflow-hidden relative group/work select-none">
                                {work.startsWith('data:image') || work.startsWith('http') ? (
                                  <img src={work} alt={`Örnek Çalışma ${idx+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="p-2 text-[10px] font-sans text-stone-500 dark:text-stone-400 flex items-center justify-center h-full text-center break-words leading-tight bg-stone-100">
                                    {work}
                                  </div>
                                )}
                              </div>
                            ))}
                            {(bk.exemplaryWorks || []).length === 0 && (
                              <span 
                                onClick={() => setIsEditingBrand(true)}
                                className="text-[10px] font-mono text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] cursor-pointer block text-center py-4 col-span-full"
                              >
                                ➕ Tasarım Örnekleri Ekle...
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 bg-stone-50 p-3.5 border border-stone-200 rounded-xl">
                            <div className="grid grid-cols-4 gap-2">
                              {editExexemplaryWorks.map((work, idx) => (
                                <div key={idx} className="aspect-square bg-white border rounded relative group">
                                  {work.startsWith('data:image') || work.startsWith('http') ? (
                                    <img src={work} alt="Arşiv" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="p-1 text-[8px] flex items-center justify-center h-full text-center overflow-hidden font-sans text-stone-500 dark:text-stone-400 leading-tight">
                                      {work}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditExexemplaryWorks(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-mono flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                                  >
                                    Kaldır
                                  </button>
                                </div>
                              ))}
                              <label className="aspect-square border-2 border-dashed border-stone-300 hover:border-[#F26B6F] rounded flex flex-col items-center justify-center cursor-pointer text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] transition-all">
                                <Plus className="w-4 h-4" />
                                <span className="text-[8px] font-mono font-bold uppercase mt-1">Yükle</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = async (evt) => {
                                      if (evt.target?.result) {
                                        const base64 = evt.target.result as string;
                                        const comp = await compressImageBase64(base64);
                                        setEditExexemplaryWorks(prev => [...prev, comp]);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            </div>
                            
                            <div className="flex gap-1 pt-1.5 border-t border-dashed border-stone-200">
                              <input
                                type="text"
                                value={newExemplar}
                                onChange={(e) => setNewExemplar(e.target.value)}
                                placeholder="Alternatif metin referansı..."
                                className="flex-1 text-[10px] bg-white border rounded p-1 focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (newExemplar.trim()) {
                                    setEditExexemplaryWorks(prev => [...prev, newExemplar.trim()]);
                                    setNewExemplar('');
                                  }
                                }}
                                className="px-2 py-1 bg-stone-300 text-stone-700 rounded text-[10px] hover:bg-stone-400 font-mono"
                              >
                                Ekle
                              </button>
                            </div>
                          </div>
                        )}
                      </KatlanirBolum>

                      {/* Atmosphere & Moodboard */}
                      <KatlanirBolum baslik="7. Moodboard & Atmosfer Kataloğu" bos={!(bk.atmosphereMoodboard || []).length} duzenleniyor={isEditingBrand} onEkle={kitiDuzenle}>
                        
                        {!isEditingBrand ? (
                          <div className="grid grid-cols-3 gap-2.5">
                            {(bk.atmosphereMoodboard || []).map((img, idx) => (
                              <div key={idx} className="aspect-square bg-stone-50 border border-stone-200 rounded-xl overflow-hidden relative group/atmosphere select-none">
                                <img src={img} alt={`Moodboard ${idx+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ))}
                            {(bk.atmosphereMoodboard || []).length === 0 && (
                              <span 
                                onClick={() => setIsEditingBrand(true)}
                                className="text-[10px] font-mono text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] cursor-pointer block text-center py-4 col-span-full"
                              >
                                ➕ Moodboard Görseli Ekle...
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 bg-stone-50 p-3.5 border border-stone-200 rounded-xl">
                            <div className="grid grid-cols-4 gap-2">
                              {editAtmosphereMoodboard.map((img, idx) => (
                                <div key={idx} className="aspect-square bg-white border rounded relative group">
                                  <img src={img} alt="Mood" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  <button
                                    type="button"
                                    onClick={() => setEditAtmosphereMoodboard(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute inset-0 bg-red-600/80 text-white text-[9px] font-mono flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer"
                                  >
                                    Kaldır
                                  </button>
                                </div>
                              ))}
                              <label className="aspect-square border-2 border-dashed border-stone-300 hover:border-[#F26B6F] rounded flex flex-col items-center justify-center cursor-pointer text-stone-500 dark:text-stone-400 hover:text-[#F26B6F] transition-all">
                                <Plus className="w-4 h-4" />
                                <span className="text-[8px] font-mono font-bold uppercase mt-1">Yükle</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = async (evt) => {
                                      if (evt.target?.result) {
                                        const base64 = evt.target.result as string;
                                        const comp = await compressImageBase64(base64);
                                        setEditAtmosphereMoodboard(prev => [...prev, comp]);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            </div>
                            <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400 block leading-tight">İlham verici atmosfer paneli için Base64 görseller ekleyin.</span>
                          </div>
                        )}
                      </KatlanirBolum>

                    </div>

                  </div>
                );
              })()}

              {/* Kanallar (29 Eylül): Durum sayfasından buraya taşındı; yalnız Kems Company */}
              {!isUnassignedSelected && activeBrand && ANA_MARKA_KIMLIKLERI.includes(activeBrand.id) && (
                <Kanallar items={items} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />
              )}

              {/* Viki özeti: künye, bilgiler, sayfa metni (29 Eylül) */}
              {!isEditingBrand && !isUnassignedSelected ? (
                <KurumOzeti item={activeBrand} items={items} onVikideAc={id => onSelectArea('duzada', id)} />
              ) : (
              <div className="bg-white/80 dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-2">
                <h4 className="text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] tracking-wider font-bold">
                  Marka Hikayesi & Kapsamı
                </h4>
                {isEditingBrand ? (
                  <textarea
                    rows={3}
                    value={editBrandNotes}
                    onChange={(e) => setEditBrandNotes(e.target.value)}
                    className="w-full text-xs bg-stone-50 dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-300 rounded p-2 focus:outline-hidden focus:border-[#F26B6F]"
                  />
                ) : (
                  <p className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8] leading-relaxed">
                    {activeBrand.notes || 'Bu marka için henüz bir tanıtım yazılmadı.'}
                  </p>
                )}
              </div>
              )}

              {/* CHILD ENTITIES SEGMENT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* 1. KİŞİLER */}
                <div className="bg-white dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-stone-100">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-500" />
                      <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Kişiler ({brandKisiler.length})</h4>
                    </div>
                    <button 
                      onClick={() => handleOpenAddEntity('kisi')}
                      className="p-1 hover:bg-stone-100 rounded text-[#F26B6F]"
                      title="Yeni kişi ekle"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {brandKisiler.map(k => (
                      <div 
                        key={k.id} 
                        className="p-1.5 bg-stone-50 dark:bg-[#112440]/40 rounded hover:bg-[#E7EBE6] dark:hover:bg-[#17345A] border border-transparent hover:border-stone-200 transition-all text-xs flex justify-between items-center gap-1"
                      >
                        <span 
                          onClick={() => onSelectArea('duzada', k.id)}
                          className="font-medium text-[#0E1C4F] dark:text-[#F3EFE8] truncate max-w-[120px] hover:underline cursor-pointer flex-1"
                        >
                          {k.title}
                        </span>
                        <select
                          value={k.metadata?.brandId || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            await onUpdateItem({
                              ...k,
                              metadata: {
                                ...k.metadata,
                                brandId: e.target.value || undefined
                              }
                            });
                          }}
                          className="text-[9px] bg-white dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-200 dark:border-[#2C3C72] rounded px-1 py-0.5 max-w-[90px] focus:outline-hidden shrink-0"
                        >
                          <option value="">Bağımsız</option>
                          {brands.map(b => (
                            <option key={b.id} value={b.id}>{b.title}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {brandKisiler.length === 0 && (
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 italic">Bu markaya bağlı kişi tanımlanmadı.</p>
                    )}
                  </div>
                </div>

                {/* 2. MEKANLAR */}
                <div className="bg-white dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-stone-100">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-red-500" />
                      <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Mekanlar ({brandYerler.length})</h4>
                    </div>
                    <button 
                      onClick={() => handleOpenAddEntity('yer')}
                      className="p-1 hover:bg-stone-100 rounded text-[#F26B6F]"
                      title="Yeni mekan ekle"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {brandYerler.map(y => (
                      <div 
                        key={y.id} 
                        className="p-1.5 bg-stone-50 dark:bg-[#112440]/40 rounded hover:bg-[#E7EBE6] dark:hover:bg-[#17345A] border border-transparent hover:border-stone-200 transition-all text-xs flex justify-between items-center gap-1"
                      >
                        <span 
                          onClick={() => onSelectArea('duzada', y.id)}
                          className="font-medium text-[#0E1C4F] dark:text-[#F3EFE8] truncate max-w-[120px] hover:underline cursor-pointer flex-1"
                        >
                          {y.title}
                        </span>
                        <select
                          value={y.metadata?.brandId || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            await onUpdateItem({
                              ...y,
                              metadata: {
                                ...y.metadata,
                                brandId: e.target.value || undefined
                              }
                            });
                          }}
                          className="text-[9px] bg-white dark:bg-[#112440] text-[#0E1C4F] dark:text-[#F3EFE8] border border-stone-200 dark:border-[#2C3C72] rounded px-1 py-0.5 max-w-[90px] focus:outline-hidden shrink-0"
                        >
                          <option value="">Bağımsız</option>
                          {brands.map(b => (
                            <option key={b.id} value={b.id}>{b.title}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {brandYerler.length === 0 && (
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 italic">Bu markaya bağlı mekan tanımlanmadı.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* MERCHANDISING SECTION */}
              <div className="bg-stone-50 dark:bg-[#17345A]/50 border border-[#CFC5B4] dark:border-[#2C3C72]/50 p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-stone-200">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4.5 h-4.5 text-[#F26B6F]" />
                    <h3 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                      Marka Merch & Tasarımları
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400">
                    Tema → Drop → Ürün Zinciri
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Drop List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 block">
                      📦 Droplar ({brandDroplar.length})
                    </span>
                    <div className="space-y-1">
                      {brandDroplar.map(d => (
                        <div 
                          key={d.id} 
                          onClick={() => onSelectArea('merch', d.id)}
                          className="p-2 bg-white dark:bg-[#112440] border border-stone-200 rounded-lg text-xs hover:border-[#F26B6F] transition-all flex justify-between items-center cursor-pointer"
                        >
                          <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8] truncate max-w-[120px]">{d.title}</span>
                          <span className="text-[9px] font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950 px-1 py-0.5 rounded">{d.status}</span>
                        </div>
                      ))}
                      {brandDroplar.length === 0 && (
                        <span className="text-[11px] text-stone-500 dark:text-stone-400 italic block">Aktif Drop bulunmuyor.</span>
                      )}
                    </div>
                  </div>

                  {/* Ürün List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 block">
                      👕 Ürünler ({brandUrunler.length})
                    </span>
                    <div className="space-y-1">
                      {brandUrunler.map(u => (
                        <div 
                          key={u.id} 
                          onClick={() => onSelectArea('merch', u.id)}
                          className="p-2 bg-white dark:bg-[#112440] border border-stone-200 rounded-lg text-xs hover:border-[#F26B6F] transition-all flex justify-between items-center cursor-pointer"
                        >
                          <span className="font-semibold text-[#0E1C4F] dark:text-[#F3EFE8] truncate max-w-[110px]">{u.title}</span>
                          <span className="text-[9px] font-mono text-[#F26B6F] shrink-0">{u.metadata?.category || 'giyim'}</span>
                        </div>
                      ))}
                      {brandUrunler.length === 0 && (
                        <span className="text-[11px] text-stone-500 dark:text-stone-400 italic block">Oluşturulmuş ürün bulunmuyor.</span>
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          ) : (
            <div className="bg-[#E7EBE6] border-2 border-dashed border-[#CFC5B4] rounded-xl p-12 text-center text-[#6A5E4C]">
              Sol menüden bir marka seçin veya çatı markayı aktifleştirin.
            </div>
          )}
        </div>

      </div>

      {/* MODAL / FORM OVERLAYS */}
      
      {/* 1. BRAND CREATION MODAL */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-[#0E1C4F] dark:bg-[#2C3C72]/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="max-w-md w-full bg-[#F3EFE8] border-2 border-[#CFC5B4] rounded-2xl shadow-2xl p-6 space-y-4 paper-grain">
            <div className="flex items-center justify-between pb-2 border-b border-[#CFC5B4]">
              <h3 className="font-sans font-bold text-lg text-[#0E1C4F] tracking-tight">Yeni Yaratıcı Marka</h3>
              <button onClick={() => setShowCreateForm(false)} className="p-1 text-stone-500 dark:text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBrand} className="space-y-4 font-mono text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-[#6A5E4C]">Marka Adı / Başlık *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Küçükçetmi Sürek Kulübü, Ada Dükkânı..."
                  value={newBrandTitle}
                  onChange={(e) => setNewBrandTitle(e.target.value)}
                  className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#6A5E4C]">Tanıtım & Kurgusal Hikayesi</label>
                <textarea
                  rows={4}
                  placeholder="Bu markanın evrendeki yeri, felsefesi ve faaliyetleri hakkında özet..."
                  value={newBrandNotes}
                  onChange={(e) => setNewBrandNotes(e.target.value)}
                  className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-2 border border-[#CFC5B4] rounded-lg hover:bg-stone-100"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#F26B6F] text-white rounded-lg hover:bg-[#B23A40]"
                >
                  Markayı Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MERCH YAP FORM MODAL */}
      {showMerchForm && activeBrand && (
        <div className="fixed inset-0 bg-[#0E1C4F] dark:bg-[#2C3C72]/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="max-w-md w-full bg-[#F3EFE8] border-2 border-[#CFC5B4] rounded-2xl shadow-2xl p-6 space-y-4 paper-grain">
            <div className="flex items-center justify-between pb-2 border-b border-[#CFC5B4]">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="w-5 h-5 text-[#F26B6F]" />
                <h3 className="font-sans font-bold text-lg text-[#0E1C4F] tracking-tight">{activeBrand.title} Merch Yap</h3>
              </div>
              <button onClick={() => setShowMerchForm(false)} className="p-1 text-stone-500 dark:text-stone-400 hover:text-stone-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {kurumMu(activeBrand) ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-mono">
                Drop <strong>{activeBrand.title}</strong> serisi olarak açılır ve
                kurumun arması, rengi, fontuyla çalışır. Satan ise{' '}
                <strong>{yapi.anaMarka?.title ?? 'ana marka'}</strong>: ürün onun ürünü olarak
                kaydedilir. Zincir: marka → kurum → drop → ürün.
              </p>
            ) : (
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-mono">
                Bu işlem, <strong>{activeBrand.title}</strong> markasının kurumsal logosunu, fontunu ve
                renk paletini kullanarak yeni bir drop başlatır. Zincir: marka → drop → ürün.
              </p>
            )}

            <form onSubmit={handleCreateBrandMerch} className="space-y-4 font-mono text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-[#6A5E4C]">Yeni Drop Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Basics 2, Ekinoks Özel..."
                  value={newThemeTitle}
                  onChange={(e) => setNewThemeTitle(e.target.value)}
                  className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#6A5E4C]">Drop Açıklaması / Konsept</label>
                <textarea
                  rows={3}
                  placeholder="Koleksiyonun esin kaynakları, stil rehberi ve hedefleri..."
                  value={newThemeNotes}
                  onChange={(e) => setNewThemeNotes(e.target.value)}
                  className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMerchForm(false)}
                  className="px-3 py-2 border border-[#CFC5B4] rounded-lg hover:bg-stone-100"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Drop Oluştur ve Atölyeye Git
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. CHILD ENTITY ADD MODAL (Search & Link Existing, with Create New option) */}
      {showAddEntityForm && activeBrand && (
        <div className="fixed inset-0 bg-[#0E1C4F] dark:bg-[#2C3C72]/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="max-w-md w-full bg-[#F3EFE8] border-2 border-[#CFC5B4] rounded-2xl shadow-2xl p-6 space-y-4 paper-grain">
            <div className="flex items-center justify-between pb-2 border-b border-[#CFC5B4]">
              <div className="flex items-center gap-1.5">
                <PlusCircle className="w-5 h-5 text-indigo-500" />
                <h3 className="font-sans font-bold text-lg text-[#0E1C4F] tracking-tight">
                  {isCreatingNew 
                    ? `Yeni ${showAddEntityForm === 'kisi' ? 'Kişi' : showAddEntityForm === 'yer' ? 'Yer/Mekân' : 'Olay'} Oluştur`
                    : `${showAddEntityForm === 'kisi' ? 'Mevcut Kişi' : showAddEntityForm === 'yer' ? 'Mevcut Yer/Mekân' : 'Mevcut Olay'} İlişkilendir`
                  }
                </h3>
              </div>
              <button 
                onClick={() => {
                  setShowAddEntityForm(null);
                  setIsCreatingNew(false);
                  setSearchQuery('');
                }} 
                className="p-1 text-stone-500 dark:text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isCreatingNew ? (
              // SEARCH & SELECT INTERFACE (Primary option)
              <div className="space-y-4">
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-mono">
                  Sistemde kayıtlı olan <strong>{showAddEntityForm === 'kisi' ? 'kişilerden' : 'yer ve mekânlardan'}</strong> birini seçerek doğrudan <strong>{activeBrand.title}</strong> markasına bağlayabilirsiniz.
                </p>

                <div className="space-y-1.5 font-mono">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6A5E4C]">Varlık Ara</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={`${showAddEntityForm === 'kisi' ? 'Kişi adı, ünvanı...' : 'Mekân adı, konumu...'} ara...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2.5 pl-8 focus:outline-hidden"
                    />
                    <Search className="w-4 h-4 text-stone-500 dark:text-stone-400 absolute left-2.5 top-3" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6A5E4C] block">
                    Seçilebilir Varlıklar ({filteredExistingEntities.length})
                  </span>
                  
                  <div className="border border-[#CFC5B4] rounded-xl bg-white/50 dark:bg-[#13204A]/50 max-h-[220px] overflow-y-auto divide-y divide-stone-200/60 p-1.5">
                    {filteredExistingEntities.map(ent => (
                      <div
                        key={ent.id}
                        onClick={() => handleLinkExistingEntity(ent)}
                        className="p-2.5 hover:bg-[#E7E0D2] dark:hover:bg-stone-100 rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-serif font-bold text-xs text-[#0E1C4F] truncate">{ent.title}</div>
                          {ent.notes && (
                            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate font-mono mt-0.5">{ent.notes}</div>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold shrink-0">
                          Bağla &rarr;
                        </span>
                      </div>
                    ))}
                    {filteredExistingEntities.length === 0 && (
                      <div className="p-4 text-center text-xs text-stone-500 dark:text-stone-400 italic font-mono">
                        Seçilebilir varlık bulunamadı.
                      </div>
                    )}
                  </div>
                </div>

                {/* Secondary Option: Create New */}
                <div className="pt-2 border-t border-dashed border-[#CFC5B4] text-center">
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 font-mono mb-2">
                    Aradığınız varlık listede yok mu?
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(true)}
                    className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-[#0E1C4F] border border-[#CFC5B4] rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#F26B6F]" />
                    Sıfırdan Yeni Varlık Oluştur &rarr;
                  </button>
                </div>
              </div>
            ) : (
              // CREATE NEW INTERFACE (Secondary option)
              <form onSubmit={handleAddChildEntity} className="space-y-4 font-mono text-xs">
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Bu yeni varlık otomatik olarak oluşturulacak ve <strong>{activeBrand.title}</strong> markasına bağlanacaktır.
                </p>

                <div className="space-y-1">
                  <label className="block font-bold text-[#6A5E4C]">Varlık Adı / Başlık *</label>
                  <input
                    type="text"
                    required
                    placeholder={showAddEntityForm === 'kisi' ? 'Örn: Kamil Efendi, Leyla Hanım...' : showAddEntityForm === 'yer' ? 'Örn: Taş Konak Atölye, Zeytinlik Limanı...' : 'Örn: Sürek Festivali 2026...'}
                    value={newEntityTitle}
                    onChange={(e) => setNewEntityTitle(e.target.value)}
                    className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-[#6A5E4C]">Detaylı Açıklama / Hikaye</label>
                  <textarea
                    rows={3}
                    placeholder="Karakter özellikleri, mekân lore özetleri veya etkinlik takvimi..."
                    value={newEntityNotes}
                    onChange={(e) => setNewEntityNotes(e.target.value)}
                    className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                  />
                </div>

                {showAddEntityForm === 'kisi' && (
                  <div className="space-y-1">
                    <label className="block font-bold text-[#6A5E4C]">Bulunduğu Yer / Mekân (Opsiyonel)</label>
                    <select
                      value={newEntityPlaceId}
                      onChange={(e) => setNewEntityPlaceId(e.target.value)}
                      className="w-full text-xs bg-white text-[#0E1C4F] border border-[#CFC5B4] rounded-lg p-2 focus:outline-hidden"
                    >
                      <option value="">-- Bir Yer Seçin --</option>
                      {items.filter(i => (i.type === 'yer' || i.type === 'mekân' || i.type === 'dükkân') && !i.archived).map(y => (
                        <option key={y.id} value={y.id}>{y.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-[#CFC5B4]">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="text-xs text-indigo-600 hover:underline font-bold"
                  >
                    &larr; Mevcutlardan Seç
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddEntityForm(null);
                        setIsCreatingNew(false);
                      }}
                      className="px-3 py-2 border border-[#CFC5B4] rounded-lg hover:bg-stone-100"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold"
                    >
                      Varlığı Oluştur &amp; Bağla
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      </>)}
    </div>
  );
}
