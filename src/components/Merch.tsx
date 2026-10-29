import React, { useState, useMemo } from 'react';
import { ShoppingBag, Sparkles, FolderDot, ChevronRight, ChevronLeft, ChevronDown, Image, Plus, Layers, Check, Trash2, Archive, Edit3 } from 'lucide-react';
import { StudyodaAc } from './studyo/StudyodaAc';
import { Item, ItemType, AreaType } from '../types';
import { hazirFotosuz, merchYedekGorseli } from '../lib/gorselSecimi';
import { useGorselSurumu } from '../lib/gorselOnbellek';
import { compressImageBase64 } from '../lib/imageCompressor';
import { SayfaBasi } from './kabuk/SayfaBasi';
import { tuvaldeAc } from '../lib/tuval';
import { DropKunyesi } from './DropKunyesi';
import { SayfaRayi, type RayBolumu } from './SayfaRayi';
import { markaYapisi, KURUM_ALANI } from '../lib/markaYapisi';
import { KurumOzeti } from './marka/KurumOzeti';
import { MerchPano } from './merch/MerchPano';
import { AsamaYapilacaklari } from './merch/AsamaYapilacaklari';
import { dropTarihi } from '../lib/takvim';


/** Merch ekranının bölümleri — bunlar sekme, kaydırma değil */
// Arşiv kalır (Kemal, 1 Ekim): işi biten droplar arşive geçer, bir gün
// devamı gelebilir. Temizlik kartı arşivdeki drop / ürünü silmez.
const RAY_BOLUMLERI: RayBolumu[] = [
  { id: 'home', label: 'Genel bakış' },
  { id: 'pano', label: 'Pano' },
  { id: 'droplar', label: 'Dropler' },
  { id: 'urunler', label: 'Ürünler' },
  { id: 'arsiv', label: 'Arşiv' }
];

interface MerchProps {
  items: Item[];
  activeItemId?: string | null;
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  /** Kurumun viki sayfasına gitmek için (kanon kutusu) */
  onSelectArea?: (area: AreaType, itemId?: string) => void;
}

export default function Merch({
  items: hamItems,
  activeItemId,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onSelectArea
}: MerchProps) {
  useGorselSurumu(); // galeri görselleri çözülünce yenilenir (21 Ekim)
  // Hazır internet fotoğrafları gösterilmez (29 Eylül); görseli olmayan
  // drop/ürüne kurumun arması konur (merchYedekGorseli).
  const items = useMemo(() => hamItems.map(hazirFotosuz), [hamItems]);
  const kapak = (i: Item) => (i.images && i.images[0]) || merchYedekGorseli(i, items);
  const [activeTab, setActiveTab] = useState<'home' | 'pano' | 'droplar' | 'urunler' | 'arsiv'>('home');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  
  const [isAiOneriOpen, setIsAiOneriOpen] = useState(true);

  // Creation State
  const [showCreateForm, setShowCreateForm] = useState<ItemType | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [selectedParentId, setSelectedParentId] = useState(''); // themeId for drops, dropId for products
  const [newVariantColor, setNewVariantColor] = useState('');
  const [newCategory, setNewCategory] = useState('giyim');
  const [createFormBrandId, setCreateFormBrandId] = useState('');
  /** Drop'un evrendeki kurumu (isteğe bağlı) — bkz. markaYapisi.dropBaglari */
  const [createFormKurumId, setCreateFormKurumId] = useState('');

  // Local State for active item inputs to prevent re-render cursor jumping
  const [localNotes, setLocalNotes] = useState('');
  const [localEditionNotes, setLocalEditionNotes] = useState('');
  const [localVariantColor, setLocalVariantColor] = useState('');
  const [localCategory, setLocalCategory] = useState('');

  // Gallery Active Image Index state
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // Active workspace detail tab & fullscreen lookbook presentation mode
  const [activeDetailTab, setActiveDetailTab] = useState<'vitrin' | 'editor'>('vitrin');
  const [isFullScreenBrochure, setIsFullScreenBrochure] = useState(false);

  // Collapsed states for drop categories under catalog
  const [collapsedDrops, setCollapsedDrops] = useState<Record<string, boolean>>({});

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBrandId, setEditBrandId] = useState('');
  const [editKurumId, setEditKurumId] = useState('');
  const [editParentId, setEditParentId] = useState(''); // themeId for drops, dropId for products
  const [editNotes, setEditNotes] = useState('');
  const [editVariantColor, setEditVariantColor] = useState('');
  const [editCategory, setEditCategory] = useState('giyim');
  const [editPriority, setEditPriority] = useState('orta');
  const [editStatus, setEditStatus] = useState('');

  const startEditing = () => {
    if (!activeItem) return;
    setActiveDetailTab('editor');
    setEditTitle(activeItem.title);
    setEditBrandId(activeItem.metadata?.brandId || '');
    setEditKurumId((activeItem.metadata as any)?.[KURUM_ALANI] || '');
    setEditParentId(activeItem.type === 'drop' ? (activeItem.metadata?.themeId || '') : (activeItem.metadata?.dropId || ''));
    setEditNotes(activeItem.notes || '');
    setEditVariantColor(activeItem.metadata?.variantColor || '');
    setEditCategory(activeItem.metadata?.category || 'giyim');
    setEditPriority(activeItem.priority || 'orta');
    setEditStatus(activeItem.status || '');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!activeItem) return;
    
    // Prepare updated activeItem metadata
    const updatedMetadata = { 
      ...(activeItem.metadata || {}),
      brandId: editBrandId,
      notes: editNotes,
    };
    
    if (activeItem.type === 'drop') {
      // Kurum bağı: seçilmediyse anahtar silinir (undefined yazılmaz)
      if (editKurumId) (updatedMetadata as any)[KURUM_ALANI] = editKurumId;
      else delete (updatedMetadata as any)[KURUM_ALANI];
      updatedMetadata.themeId = editParentId;
      const parentTheme = items.find(t => t.id === editParentId);
      if (parentTheme) {
        updatedMetadata.brandId = parentTheme.metadata?.brandId || editBrandId;
      }
    } else if (activeItem.type === 'merch_urun') {
      updatedMetadata.dropId = editParentId;
      updatedMetadata.variantColor = editVariantColor;
      updatedMetadata.category = editCategory;
      const parentDrop = items.find(d => d.id === editParentId);
      if (parentDrop) {
        updatedMetadata.brandId = parentDrop.metadata?.brandId || editBrandId;
      }
    }
    
    const updatedItem = {
      ...activeItem,
      title: editTitle,
      notes: editNotes,
      priority: editPriority,
      status: editStatus,
      metadata: updatedMetadata
    };
    
    // Save activeItem
    await onUpdateItem(updatedItem);
    
    // Cascade if Drop
    if (activeItem.type === 'drop') {
      const childProducts = items.filter(p => p.area === 'merch' && p.type === 'merch_urun' && p.metadata?.dropId === activeItem.id);
      for (const p of childProducts) {
        await onUpdateItem({
          ...p,
          metadata: { ...p.metadata, brandId: updatedMetadata.brandId }
        });
      }
    }
    
    // Sync local states to match
    setLocalNotes(editNotes);
    setLocalEditionNotes(updatedMetadata.editionNotes || '');
    setLocalVariantColor(updatedMetadata.variantColor || '');
    setLocalCategory(updatedMetadata.category || 'giyim');
    
    setIsEditing(false);
  };

  // AI Merchandise Recommendation states

  /*
   * Marka yapısı (7. madde, adım 3).
   *
   * Satan tek marka var: Kems Company. Eskiden buradaki "Marka" süzgeci
   * kulüpleri de marka sayıyordu. Artık:
   *   - `brands`   → yalnız gerçek marka(lar). Drop'un brandId'si buradan.
   *   - `kurumlar` → kurgu içi kurumlar. Drop'un kurumId'si buradan.
   *   - Üstteki süzgeç kuruma göre: Tümü / Kurumsuz / her kurum.
   * Ürün kurumunu kendi drop'undan alır.
   */
  const yapi = useMemo(() => markaYapisi(items), [items]);
  const brands = useMemo(
    () => [yapi.anaMarka, ...yapi.digerMarkalar].filter((b): b is Item => !!b),
    [yapi]
  );
  const kurumlar = yapi.kurumlar;
  const KURUMSUZ = '__kurumsuz';
  const [seciliKurum, setSeciliKurum] = useState<string>('all');

  /** Kaydın kurumu: drop'ta kendi alanı, üründe drop'unun alanı */
  const kurumuNe = (i: Item): string => {
    const m = i.metadata as any;
    if (i.type === 'drop') return m?.[KURUM_ALANI] || '';
    const drop = items.find(d => d.id === m?.dropId);
    return (drop?.metadata as any)?.[KURUM_ALANI] || '';
  };
  const kurumaUyar = (i: Item) => {
    if (seciliKurum === 'all') return true;
    const k = kurumuNe(i);
    return seciliKurum === KURUMSUZ ? !k : k === seciliKurum;
  };

  React.useEffect(() => {
    if (showCreateForm) {
      setCreateFormBrandId(brands[0]?.id || '');
      setCreateFormKurumId(seciliKurum !== 'all' && seciliKurum !== KURUMSUZ ? seciliKurum : '');
    } else {
      setCreateFormBrandId('');
      setCreateFormKurumId('');
    }
  }, [showCreateForm, seciliKurum, brands]);

  // Synchronize local edit states with currently selected active item
  React.useEffect(() => {
    setIsEditing(false);
    setDeleteConfirmId(null);
    setArchiveConfirmId(null);
    setActiveImageIdx(0);
    setActiveDetailTab('vitrin');
    setIsFullScreenBrochure(false);
    
    const activeObj = items.find(i => i.id === activeItemId);
    if (activeObj) {
      setLocalNotes(activeObj.notes || '');
      setLocalEditionNotes(activeObj.metadata?.editionNotes || '');
      setLocalVariantColor(activeObj.metadata?.variantColor || '');
      setLocalCategory(activeObj.metadata?.category || 'giyim');
    } else {
      setLocalNotes('');
      setLocalEditionNotes('');
      setLocalVariantColor('');
      setLocalCategory('');
    }
  }, [activeItemId]);

  // Compute local changes state for activeItem details
  const hasLocalChanges = useMemo(() => {
    const activeObj = items.find(i => i.id === activeItemId);
    if (!activeObj) return false;
    return localNotes !== (activeObj.notes || '') ||
           localEditionNotes !== (activeObj.metadata?.editionNotes || '') ||
           localVariantColor !== (activeObj.metadata?.variantColor || '') ||
           localCategory !== (activeObj.metadata?.category || 'giyim');
  }, [activeItemId, items, localNotes, localEditionNotes, localVariantColor, localCategory]);

  const handleSaveLocalChanges = async () => {
    const activeObj = items.find(i => i.id === activeItemId);
    if (!activeObj) return;
    
    const updatedMetadata = {
      ...(activeObj.metadata || {}),
      editionNotes: localEditionNotes,
      variantColor: localVariantColor,
      category: localCategory
    };
    
    const updatedItem = {
      ...activeObj,
      notes: localNotes,
      metadata: updatedMetadata
    };
    
    await onUpdateItem(updatedItem);
  };

  // Mapping duplicate drop IDs to primary drop IDs for seamless product and progress merging
  const dropIdMapping = useMemo(() => {
    const rawDrops = items.filter(i => i.area === 'merch' && i.type === 'drop');
    const mapping: Record<string, string> = {};
    const titleToPrimaryId: Record<string, string> = {};

    rawDrops.forEach(drop => {
      const key = drop.title.trim().toLowerCase();
      if (!titleToPrimaryId[key]) {
        titleToPrimaryId[key] = drop.id;
      }
    });

    rawDrops.forEach(drop => {
      const key = drop.title.trim().toLowerCase();
      mapping[drop.id] = titleToPrimaryId[key];
    });

    return mapping;
  }, [items]);

  // Sub-items computation with automatic deduplication by lowercased title to enforce exactly 1 drop = 1 unique record
  const activeDrops = useMemo(() => {
    const rawDrops = items.filter(i => i.area === 'merch' && i.type === 'drop' && !i.archived);
    const uniqueMap = new Map<string, Item>();
    rawDrops.forEach(drop => {
      const key = drop.title.trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, drop);
      } else {
        const existing = uniqueMap.get(key)!;
        if (existing.isProposal && !drop.isProposal) {
          uniqueMap.set(key, drop);
        }
      }
    });
    const uniqueList = Array.from(uniqueMap.values());
    return uniqueList.filter(kurumaUyar);
  }, [items, seciliKurum]);

  const archivedDrops = useMemo(() => {
    const rawDrops = items.filter(i => i.area === 'merch' && i.type === 'drop' && i.archived);
    const uniqueMap = new Map<string, Item>();
    rawDrops.forEach(drop => {
      const key = drop.title.trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, drop);
      }
    });
    const uniqueList = Array.from(uniqueMap.values());
    return uniqueList.filter(kurumaUyar);
  }, [items, seciliKurum]);

  const products = useMemo(() => {
    const rawProducts = items.filter(i => i.area === 'merch' && i.type === 'merch_urun' && !i.archived);
    const mapped = rawProducts.map(p => {
      const originalDropId = p.metadata?.dropId || '';
      const primaryDropId = dropIdMapping[originalDropId] || originalDropId;
      return {
        ...p,
        metadata: {
          ...p.metadata,
          dropId: primaryDropId
        }
      };
    });
    return mapped.filter(kurumaUyar);
  }, [items, dropIdMapping, seciliKurum]);

  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    return items.find(i => i.id === activeItemId) || null;
  }, [activeItemId, items]);

  /**
   * Ürün durumundan ilerleme yüzdesi.
   *
   * Dört adım: Konsept → Tasarım → Üretim → Satışta.
   * Eski kayıtlarda 'Fikir' ve 'Örnek/numune' de geçebiliyor; listeden
   * kalktılar ama veride duran bir kayıt arayüzü bozmasın diye burada
   * hâlâ karşılıkları var. 'Örnek/numune' tasarımdan sonra, üretimden
   * önceydi — yüzdesi de oraya düşüyor.
   */
  const getProductProgressPercent = (status: string) => {
    switch (status) {
      case 'Konsept': return 15;
      case 'Tasarım': return 45;
      case 'Üretim': return 80;
      case 'Satışta': return 100;
      // eski değerler
      case 'Fikir': return 15;
      case 'Örnek/numune': return 60;
      default: return 15;
    }
  };

  // Compute drop progress automatically from its live product statuses (fixes %0 stuck issue)
  const getDropProgress = (dropId: string) => {
    const primaryDropId = dropIdMapping[dropId] || dropId;
    const dropProducts = products.filter(p => p.metadata?.dropId === primaryDropId);
    if (dropProducts.length === 0) return 0;
    
    const sum = dropProducts.reduce((acc, p) => acc + getProductProgressPercent(p.status), 0);
    return Math.round(sum / dropProducts.length);
  };

  // Auto-flip drop status to "Satışta" and archive if all products are Satışta
  const triggerDropAutoArchiving = async (dropId: string) => {
    const drop = items.find(i => i.id === dropId);
    if (!drop || drop.archived) return;

    const primaryDropId = dropIdMapping[dropId] || dropId;
    const dropProducts = products.filter(p => p.metadata?.dropId === primaryDropId);
    if (dropProducts.length > 0 && dropProducts.every(p => p.status === 'Satışta')) {
      // Auto-flip and Archive drop
      await onUpdateItem({
        ...drop,
        status: 'Satışta',
        archived: true
      });
    }
  };

  // Create Tema, Drop, or Ürün
  const handleCreateMerch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !showCreateForm) return;

    const id = `merch_${Date.now()}`;
    // Zincir artık Marka → Drop → Ürün; drop'un ebeveyni doğrudan marka.
    const parentDrop = showCreateForm === 'merch_urun' ? items.find(d => d.id === selectedParentId) : null;
    const resolvedBrandId = createFormBrandId
      || (showCreateForm === 'drop'
        ? (brands[0]?.id || '')
        : (parentDrop?.metadata?.brandId || ''));

    const itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: newTitle,
      area: 'merch',
      type: showCreateForm,
      status: showCreateForm === 'drop' || showCreateForm === 'merch_urun' ? 'Konsept' : 'Çalışılıyor',
      priority: 'orta',
      tags: ['merch', showCreateForm],
      links: selectedParentId ? [selectedParentId] : [],
      notes: newNotes,
      images: showCreateForm === 'drop'
        ? [] 
        : showCreateForm === 'merch_urun'
        ? []
        : [],
      isProposal: false,
      archived: false,
      metadata: {
        brandId: resolvedBrandId,
        // Kurum yalnız drop'ta tutulur; boşsa anahtar hiç yazılmaz (Firestore)
        ...(showCreateForm === 'drop' && createFormKurumId ? { [KURUM_ALANI]: createFormKurumId } : {}),
        ...(showCreateForm === 'drop' ? {
          editionCount: 1,
          editionNotes: "1. Edisyon başlangıcı."
        } : {}),
        ...(showCreateForm === 'merch_urun' ? {
          dropId: selectedParentId,
          variantColor: newVariantColor,
          category: newCategory
        } : {})
      }
    };

    await onAddItem(itemData);
    setNewTitle('');
    setNewNotes('');
    setSelectedParentId('');
    setNewVariantColor('');
    setShowCreateForm(null);
    onSelectItem(id);
  };

  // 2nd Edition creator
  const handleCreateSecondEdition = async (drop: Item) => {
    if (drop.type !== 'drop') return;
    const newId = `drop_ed2_${Date.now()}`;
    
    // Copy drop configuration with +1 edition notes
    const newDrop: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: `${drop.title} (2. Edisyon)`,
      area: 'merch',
      type: 'drop',
      status: 'Konsept',
      priority: 'orta',
      tags: [...drop.tags, '2-edition'],
      links: [...(drop.links || [])],
      notes: `Eski edisyon notları: ${drop.notes}`,
      images: drop.images,
      isProposal: false,
      archived: false,
      metadata: {
        ...drop.metadata,
        editionCount: (drop.metadata?.editionCount || 1) + 1,
        editionNotes: `2. Edisyon Notları: Tasarımlar gözden geçirildi.`
      }
    };

    await onAddItem(newDrop);
    onSelectItem(newId);
    setActiveTab('droplar');
  };


  const handleUpdateProductStatus = async (p: Item, status: string) => {
    await onUpdateItem({ ...p, status });
    if (p.metadata?.dropId) {
      // check if all products are sold -> archives drop
      await triggerDropAutoArchiving(p.metadata.dropId);
    }
  };

  return (
    <div className="space-y-6">
      
      <SayfaRayi
        baslik="Merch"
        bolumler={RAY_BOLUMLERI}
        aktifId={activeTab}
        onSec={id => { setActiveTab(id as typeof activeTab); onSelectItem(null); }}
      />

      {/* Sade başlık (1 Ekim, K-2) */}
      <SayfaBasi baslik="Merch">
          {/* Brand select filter (Rule 4) */}
          <div className="flex items-center bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] rounded-lg p-1.5">
            <span className="text-[9px] font-mono font-bold uppercase text-[#6A5E4C] dark:text-[#A6B0C9] px-2">Kurum:</span>
            <select
              value={seciliKurum}
              onChange={(e) => setSeciliKurum(e.target.value)}
              className="bg-transparent text-xs font-serif font-bold py-0.5 outline-hidden border-none text-[#0E1C4F] dark:text-[#F3EFE8] cursor-pointer"
              title="Satan her zaman Kems Company. Burada ürünün evrende hangi kurumdan geldiğine göre süzülür."
            >
              <option value="all" className="bg-[#F3EFE8] dark:bg-[#13204A] text-[#0E1C4F] dark:text-white">Tümü</option>
              <option value={KURUMSUZ} className="bg-[#F3EFE8] dark:bg-[#13204A] text-[#0E1C4F] dark:text-white">Kurumsuz ({brands[0]?.title || 'marka'})</option>
              {kurumlar.map(k => (
                <option key={k.id} value={k.id} className="bg-[#F3EFE8] dark:bg-[#13204A] text-[#0E1C4F] dark:text-white">{k.title}</option>
              ))}
            </select>
          </div>

          {/* Sekmeler sayfa rayında (masaüstünde solda, telefonda üstte) — burada tekrar edilmez */}
      </SayfaBasi>

      {/* PANO (Paket 5): Konsept → Tasarım → Üretim → Satışta */}
      {activeTab === 'pano' && !activeItem && (
        <MerchPano
          urunler={products.filter(kurumaUyar)}
          items={items}
          kapak={kapak}
          onUpdateItem={onUpdateItem}
          onAddItem={onAddItem}
          onAc={id => { onSelectItem(id); setActiveTab('urunler'); }}
        />
      )}

      {/* MERCH HOME DASHBOARD */}
      {activeTab === 'home' && !activeItem && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* Quick stats & welcome */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Tasarım Bekleyen Ürünler */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl paper-grain space-y-3 archive-shadow">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#F26B6F] font-bold">
                Tasarım bekleyen ürünler
              </h3>
              <div className="space-y-2">
                {products.filter(p => p.status === 'Konsept' || p.status === 'Tasarım' || p.status === 'Fikir').slice(0, 4).map(p => (
                  <div key={p.id} className="flex justify-between items-center text-xs">
                    <span 
                      onClick={() => { onSelectItem(p.id); setActiveTab('urunler'); }}
                      className="text-[#0E1C4F] dark:text-[#F3EFE8] font-bold hover:underline cursor-pointer"
                    >
                      {p.title}
                    </span>
                    <span className="text-[10px] bg-[#CFC5B4]/30 dark:bg-[#2C3C72] px-2 py-0.5 font-mono rounded text-[#6A5E4C] dark:text-[#A6B0C9]">
                      {p.status}
                    </span>
                  </div>
                ))}
                {products.filter(p => p.status === 'Konsept' || p.status === 'Tasarım' || p.status === 'Fikir').length === 0 && (
                  <span className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Konsept veya Tasarım aşamasında bekleyen ürün yok.</span>
                )}
              </div>
            </div>

            {/* Drop İlerlemeleri bar box */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl paper-grain space-y-3 archive-shadow">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#0E1C4F] dark:text-[#F3EFE8] font-bold">
                Aktif Drop İlerlemeleri
              </h3>
              <div className="space-y-3">
                {activeDrops.slice(0, 3).map(d => {
                  const progress = getDropProgress(d.id);
                  return (
                    <div key={d.id} className="space-y-1">
                      <div className="flex justify-between items-center text-[11px] font-mono">
                        <span 
                          onClick={() => { onSelectItem(d.id); setActiveTab('droplar'); }}
                          className="font-bold hover:underline cursor-pointer"
                        >
                          {d.title}
                        </span>
                        <span>%{progress}</span>
                      </div>
                      <div className="w-full bg-[#CFC5B4]/30 dark:bg-[#17345A] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#F26B6F] h-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
                {activeDrops.length === 0 && (
                  <span className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Şu an aktif bir drop taslağı bulunmuyor.</span>
                )}
              </div>
            </div>

            {/* Son Eklenenler */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl paper-grain space-y-3 archive-shadow">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
                Son Eklenenler (Merch)
              </h3>
              <div className="space-y-2">
                {[...items].filter(i => i.area === 'merch').slice(0, 4).map(i => (
                  <div key={i.id} className="flex justify-between items-center text-xs">
                    <span 
                      onClick={() => { onSelectItem(i.id); setActiveTab(i.type === 'drop' ? 'droplar' : 'urunler'); }}
                      className="text-[#0E1C4F] dark:text-[#F3EFE8] font-medium hover:underline cursor-pointer"
                    >
                      {i.title}
                    </span>
                    <span className="text-[9px] font-mono capitalize opacity-70">
                      [{i.type}]
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Active Merch Showcase */}
          <div className="space-y-4">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
              Aktif Drops Lookbook
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeDrops.map(drop => {
                const progress = getDropProgress(drop.id);
                return (
                  <div 
                    key={drop.id}
                    onClick={() => { onSelectItem(drop.id); setActiveTab('droplar'); }}
                    className="group bg-[#F6F1E7] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl overflow-hidden cursor-pointer hover:scale-[1.01] transition-all archive-shadow"
                  >
                    <div className="h-40 bg-gradient-to-r from-[#F26B6F] to-[#B23A40] relative flex items-end p-4">
                      {kapak(drop) && (
                        <img 
                          src={kapak(drop)} 
                          alt={drop.title} 
                          className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-55"
                        />
                      )}
                      <div className="relative space-y-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] px-2 py-0.5 rounded uppercase tracking-wider font-bold">
                            DROP
                          </span>
                          {drop.isProposal && (
                            <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 rounded uppercase tracking-wider font-bold animate-pulse">
                              ✨ AI Önerisi
                            </span>
                          )}
                        </div>
                        <h4 className="font-sans font-bold text-lg text-[#F3EFE8] group-hover:text-amber-200 transition-colors tracking-tight">
                          {drop.title}
                        </h4>
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] line-clamp-2">
                        {drop.notes || "Bu drop için henüz bir kurgu notu yazılmadı."}
                      </p>
                      <div className="space-y-1 pt-1 border-t border-[#CFC5B4]/30">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                          <span>Ürün İlerlemesi</span>
                          <span>%{progress}</span>
                        </div>
                        <div className="w-full bg-[#CFC5B4]/30 dark:bg-[#2C3C72] h-1.5 rounded-full overflow-hidden">
                          <div className="bg-[#F26B6F] h-full" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ürün fikri yapay zekâdan: stüdyoda (29 Eylül akşamı) */}
          <div className="flex flex-wrap items-center gap-3 bg-[#F3EFE8]/80 dark:bg-[#13204A]/60 border border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-4">
            <p className="flex-1 min-w-[220px] text-xs text-[#6A5E4C] dark:text-[#A6B0C9]">
              Bir drop için ürün fikri stüdyoda. Eklediğin fikir drop'a "Konsept" olarak girer; fiyat önerilmez.
            </p>
            <StudyodaAc arac="merch-oner" />
          </div>

        </div>
      )}

      {/* VIEW 3: DROPLAR TAB */}
      {activeTab === 'droplar' && !activeItem && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/50">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
              Drop Listesi ({activeDrops.length})
            </h3>
            <button
              onClick={() => setShowCreateForm('drop')}
              className="text-xs font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] px-3 py-1.5 rounded-lg hover:opacity-90 transition-all cursor-pointer"
            >
              + Drop Tasarla
            </button>
          </div>

          <div className="space-y-4">
            {activeDrops.map(d => {
              const progress = getDropProgress(d.id);
              return (
                <div 
                  key={d.id} 
                  className="bg-[#F6F1E7] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl flex flex-col md:flex-row gap-5 items-center justify-between paper-grain archive-shadow"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-[#F26B6F] text-white px-2 py-0.5 rounded uppercase font-bold">
                        {d.status}
                      </span>
                      {d.isProposal && (
                        <span className="text-[10px] font-mono bg-red-600 text-white px-2 py-0.5 rounded uppercase font-bold animate-pulse">
                          ✨ AI Önerisi
                        </span>
                      )}
                      <span className="text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                        Edisyon {d.metadata?.editionCount || 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <h4 
                        onClick={() => onSelectItem(d.id)}
                        className="font-serif font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] hover:text-[#F26B6F] cursor-pointer"
                      >
                        {d.title}
                      </h4>
                      <button 
                        onClick={() => { onSelectItem(d.id); setTimeout(() => startEditing(), 100); }}
                        className="text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] p-1 rounded transition-colors cursor-pointer"
                        title="Düzenle"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] line-clamp-2">
                      {d.notes}
                    </p>
                  </div>

                  <div className="w-full md:w-64 space-y-2 shrink-0">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                        <span>Gelişim İlerlemesi</span>
                        <span>%{progress}</span>
                      </div>
                      <div className="w-full bg-[#CFC5B4]/30 dark:bg-[#2C3C72] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#F26B6F] h-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end text-[10px] font-mono">
                      <button
                        onClick={() => handleCreateSecondEdition(d)}
                        className="px-2 py-1 bg-white border border-[#CFC5B4] hover:bg-stone-50 rounded cursor-pointer"
                      >
                        2. Ed. Oluştur
                      </button>
                      <button
                        onClick={() => onSelectItem(d.id)}
                        className="px-2.5 py-1 bg-[#F26B6F] text-white hover:bg-[#B23A40] rounded cursor-pointer"
                      >
                        Yönet →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: ÜRÜNLER TAB */}
      {activeTab === 'urunler' && !activeItem && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/50">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
              Tüm Ürün Kataloğu ({products.length})
            </h3>
            <button
              onClick={() => setShowCreateForm('merch_urun')}
              className="text-xs font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] px-3 py-1.5 rounded-lg hover:opacity-90 transition-all cursor-pointer"
            >
              + Ürün Ekle
            </button>
          </div>

          {/* Categorized by Drops */}
          <div className="space-y-8">
            {activeDrops.map(drop => {
              const dropProducts = products.filter(p => p.metadata?.dropId === drop.id);
              if (dropProducts.length === 0) return null; // Only show drops that have products
              const isCollapsed = collapsedDrops[drop.id];
              return (
                <div key={drop.id} className="bg-[#FAF8F5]/60 dark:bg-[#172554]/20 border border-[#CFC5B4] rounded-xl p-5 space-y-4 shadow-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/30">
                    <div 
                      className="flex items-center gap-2 cursor-pointer select-none group"
                      onClick={() => {
                        setCollapsedDrops(prev => ({
                          ...prev,
                          [drop.id]: !prev[drop.id]
                        }));
                      }}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-[#F26B6F] transition-transform" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#F26B6F] transition-transform" />
                      )}
                      <FolderDot className="w-4 h-4 text-[#F26B6F]" />
                      <h4 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#F26B6F] transition-colors tracking-tight">
                        {drop.title}
                      </h4>
                      <span className="text-[10px] font-mono bg-[#F26B6F]/10 text-[#F26B6F] px-2 py-0.5 rounded-sm font-bold">
                        {dropProducts.length} Ürün
                      </span>
                    </div>
                    <button
                      onClick={() => { setShowCreateForm('merch_urun'); setSelectedParentId(drop.id); }}
                      className="text-xs font-mono text-[#F26B6F] hover:underline cursor-pointer"
                    >
                      + Bu Droba Ürün Ekle
                    </button>
                  </div>
                  
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
                      {dropProducts.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => onSelectItem(p.id)}
                          className="group bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl overflow-hidden cursor-pointer hover:border-[#F26B6F] transition-all archive-shadow p-3.5 space-y-3"
                        >
                          <div className="h-32 bg-stone-100 rounded-lg overflow-hidden relative">
                            {kapak(p) ? (
                              <img src={kapak(p)} alt={p.title} className="w-full h-full object-contain p-2" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-stone-200">
                                <ShoppingBag className="w-8 h-8 text-stone-500 dark:text-stone-400" />
                              </div>
                            )}
                            <span className="absolute top-2 right-2 text-[9px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-white px-1.5 py-0.5 rounded capitalize">
                              {p.metadata?.category || 'Ürün'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="uppercase text-[#F26B6F] font-bold">
                                {p.status}
                              </span>
                              {p.isProposal && (
                                <span className="bg-red-600 text-white px-1 py-0.5 rounded text-[8px] uppercase font-bold animate-pulse shrink-0">
                                  ✨ AI Önerisi
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center gap-1.5">
                              <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-1 group-hover:text-[#F26B6F] flex-1 tracking-tight">
                                {p.title}
                              </h4>
                              <button 
                                onClick={(e) => { e.stopPropagation(); onSelectItem(p.id); setTimeout(() => startEditing(), 100); }}
                                className="text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] p-0.5 rounded transition-colors cursor-pointer shrink-0"
                                title="Düzenle"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {p.metadata?.variantColor && (
                              <span className="text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                                Renk: {p.metadata.variantColor}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned / Other Products */}
            {products.filter(p => !p.metadata?.dropId).length > 0 && (
              <div className="bg-[#FAF8F5]/60 dark:bg-[#172554]/20 border border-[#CFC5B4] rounded-xl p-5 space-y-4 shadow-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/30">
                  <div 
                    className="flex items-center gap-2 cursor-pointer select-none group"
                    onClick={() => {
                      setCollapsedDrops(prev => ({
                        ...prev,
                        unassigned: !prev.unassigned
                      }));
                    }}
                  >
                    {collapsedDrops['unassigned'] ? (
                      <ChevronRight className="w-4 h-4 text-stone-500 dark:text-stone-400 transition-transform" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-stone-500 dark:text-stone-400 transition-transform" />
                    )}
                    <FolderDot className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                    <h4 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#F26B6F] transition-colors tracking-tight">
                      Diğer / Bağımsız Ürünler
                    </h4>
                    <span className="text-[10px] font-mono bg-stone-200 text-stone-700 px-2 py-0.5 rounded-sm font-bold">
                      {products.filter(p => !p.metadata?.dropId).length} Ürün
                    </span>
                  </div>
                </div>
                
                {!collapsedDrops['unassigned'] && (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
                    {products.filter(p => !p.metadata?.dropId).map(p => (
                      <div 
                        key={p.id}
                        onClick={() => onSelectItem(p.id)}
                        className="group bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl overflow-hidden cursor-pointer hover:border-[#F26B6F] transition-all archive-shadow p-3.5 space-y-3"
                      >
                        <div className="h-32 bg-stone-100 rounded-lg overflow-hidden relative">
                          {kapak(p) ? (
                            <img src={kapak(p)} alt={p.title} className="w-full h-full object-contain p-2" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-stone-200">
                              <ShoppingBag className="w-8 h-8 text-stone-500 dark:text-stone-400" />
                            </div>
                          )}
                          <span className="absolute top-2 right-2 text-[9px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-white px-1.5 py-0.5 rounded capitalize">
                            {p.metadata?.category || 'Ürün'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="uppercase text-[#F26B6F] font-bold">
                              {p.status}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-1.5">
                            <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-1 group-hover:text-[#F26B6F] flex-1 tracking-tight">
                              {p.title}
                            </h4>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSelectItem(p.id); setTimeout(() => startEditing(), 100); }}
                              className="text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] p-0.5 rounded transition-colors cursor-pointer shrink-0"
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {p.metadata?.variantColor && (
                            <span className="text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                              Renk: {p.metadata.variantColor}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {products.length === 0 && (
              <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Sistemde henüz kayıtlı ürün bulunmuyor.</p>
            )}
          </div>
        </div>
      )}

      {/* VIEW 5: ARŞİV TAB (For archived items drops/products) */}
      {activeTab === 'arsiv' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="border-b border-[#CFC5B4] pb-2">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] flex items-center gap-2 tracking-tight">
              <Archive className="w-5 h-5 text-[#F26B6F]" />
              Geçmiş / Arşivlenmiş Drops ({archivedDrops.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {archivedDrops.map(d => (
              <div key={d.id} className="bg-white/40 dark:bg-[#13204A]/40 border border-[#CFC5B4] rounded-xl p-5 opacity-75 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-start">
                  <h4 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                    {d.title}
                  </h4>
                  <span className="text-[10px] font-mono bg-[#3E8E5E]/10 text-[#3E8E5E] px-2 py-0.5 rounded uppercase">
                    {d.status}
                  </span>
                </div>
                <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] mt-2 line-clamp-2">
                  {d.notes}
                </p>
                <div className="pt-3 border-t border-[#CFC5B4]/30 flex justify-end gap-2 text-[10px] font-mono">
                  <button
                    onClick={() => onUpdateItem({ ...d, archived: false })}
                    className="text-[#F26B6F] hover:underline"
                  >
                    Arşivden Çıkar
                  </button>
                </div>
              </div>
            ))}
            {archivedDrops.length === 0 && (
              <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Arşivlenmiş drop bulunmuyor.</p>
            )}
          </div>
        </div>
      )}

      {/* Render Brochure/Showcase/Lookbook mode for Active Item */}
      {(() => {
        if (!activeItem) return null;
        const isDrop = activeItem.type === 'drop';
        const activeProducts = products.filter(p => p.metadata?.dropId === activeItem.id);
        const brandName = brands.find(b => b.id === activeItem.metadata?.brandId)?.title || "Genel Serisi";

        (globalThis as any).renderBrochureView = () => {
          return (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* A beautiful lookbook hero header */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left: Beautiful large image with gallery controls */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="aspect-square bg-stone-100 dark:bg-stone-900 rounded-2xl overflow-hidden relative border border-[#CFC5B4]/60 flex items-center justify-center group/showcase shadow-md">
                    {activeItem.images && activeItem.images.length > 0 ? (
                      <>
                        <img 
                          src={activeItem.images[Math.min(activeImageIdx, activeItem.images.length - 1)] || activeItem.images[0]} 
                          alt={activeItem.title} 
                          className="w-full h-full object-cover transition-all duration-300" 
                        />
                        
                        {/* Gallery Navigation overlay */}
                        {activeItem.images.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveImageIdx(prev => (prev - 1 + activeItem.images.length) % activeItem.images.length);
                              }}
                              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 dark:bg-[#13204A]/95 border border-[#CFC5B4] text-[#0E1C4F] dark:text-[#F3EFE8] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer opacity-100 lg:opacity-0 lg:group-hover/showcase:opacity-100 shadow-md z-10"
                              title="Önceki Görsel"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => {
                                setActiveImageIdx(prev => (prev + 1) % activeItem.images.length);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 dark:bg-[#13204A]/95 border border-[#CFC5B4] text-[#0E1C4F] dark:text-[#F3EFE8] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer opacity-100 lg:opacity-0 lg:group-hover/showcase:opacity-100 shadow-md z-10"
                              title="Sonraki Görsel"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                            
                            {/* Bottom pill indicator */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0E1C4F]/80 dark:bg-stone-900/80 backdrop-blur-xs text-white font-mono text-[10px] px-3 py-1 rounded-full border border-white/10 shadow-sm">
                              {Math.min(activeImageIdx, activeItem.images.length - 1) + 1} / {activeItem.images.length}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      kapak(activeItem) ? (
                        // Görsel yok: kurumun arması (Canva) — hazır fotoğraf değil
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-10 bg-[#F3EFE8]">
                          <img src={kapak(activeItem)} alt="" className="max-h-[70%] object-contain" />
                          <p className="text-[11px] text-stone-500 font-mono">Bu drop'un kendi görseli yok · kurum arması gösteriliyor</p>
                        </div>
                      ) : (
                      <div className="text-center p-8 space-y-3">
                        <Image className="w-16 h-16 mx-auto text-stone-300" />
                        <p className="text-sm text-stone-500 dark:text-stone-400 font-mono">Bu koleksiyon için henüz görsel bulunmuyor.</p>
                      </div>
                      )
                    )}
                  </div>

                  {/* Thumbnails */}
                  {activeItem.images && activeItem.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {activeItem.images.map((img, idx) => {
                        const isSelected = idx === Math.min(activeImageIdx, activeItem.images.length - 1);
                        return (
                          <button
                            type="button"
                            key={idx} 
                            onClick={() => setActiveImageIdx(idx)}
                            className={`relative w-20 h-20 border rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all ${
                              isSelected 
                                ? 'border-[#F26B6F] ring-4 ring-[#F26B6F]/20 shadow-xs' 
                                : 'border-[#CFC5B4] hover:border-[#F26B6F]'
                            }`}
                          >
                            <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Editorial Typography, Vision Block, and Collection Properties */}
                <div className="lg:col-span-6 space-y-6 text-left">
                  {/* Brand & Theme Header */}
                  <div className="border-b border-[#CFC5B4]/50 pb-4 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-[#F26B6F] text-white px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                        {isDrop ? 'Koleksiyon Drop' : 'Ürün Tasarımı'}
                      </span>
                      <span className="text-xs font-mono font-bold uppercase text-[#0E1C4F] dark:text-[#A6B0C9] bg-[#CFC5B4]/30 dark:bg-[#2C3C72] px-2.5 py-0.5 rounded">
                        {activeItem.status}
                      </span>
                    </div>
                    <h1 className="font-sans font-bold text-3xl text-[#0E1C4F] dark:text-[#F3EFE8] leading-tight tracking-tight">
                      {activeItem.title}
                    </h1>
                    <p className="text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                      Marka Serisi: <span className="font-bold text-[#F26B6F]">{brandName}</span>
                    </p>
                    {isDrop && (
                      <button type="button" onClick={() => tuvaldeAc(activeItem.id)}
                        className="text-[11px] font-mono underline underline-offset-2 decoration-[#0E1C4F]/30 text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] cursor-pointer">
                        drop panosu · tuvalde aç
                      </button>
                    )}
                  </div>

                  {/* Editorial Story Blockquote */}
                  <div className="bg-[#FAF8F5]/80 dark:bg-[#172554]/10 border-l-4 border-[#F26B6F] p-5 rounded-r-xl relative shadow-xs overflow-hidden">
                    <div className="absolute top-1 right-3 text-7xl font-serif text-[#CFC5B4]/15 pointer-events-none select-none">“</div>
                    <h4 className="font-mono text-[10px] uppercase text-[#F26B6F] font-bold tracking-widest mb-2">KURGU VİZYON HİKAYESİ</h4>
                    <p className="font-serif italic text-sm leading-relaxed text-[#0E1C4F] dark:text-[#F3EFE8] relative z-10">
                      {localNotes || "Bu kreasyonun ardında yatan vizyoner hikaye henüz detaylandırılmadı. Gelişmiş Editör sekmesinden dilediğiniz zaman açıklama ekleyebilirsiniz."}
                    </p>
                  </div>

                  {/* Edisyon Notu */}
                  {localEditionNotes && (
                    <div className="p-4 bg-[#BBA591]/10 border border-[#BBA591]/50 rounded-xl space-y-1.5">
                      <span className="block text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] uppercase font-bold tracking-wider">
                        📜 EDİSYON PLANLAMASI VE ÖZEL DEPARTMAN NOTLARI
                      </span>
                      <p className="text-xs text-[#0E1C4F] dark:text-[#F3EFE8] leading-relaxed">
                        {localEditionNotes}
                      </p>
                    </div>
                  )}

                  {/* Specification Grid */}
                  <div className="bg-[#FAF8F5]/40 dark:bg-[#172554]/5 border border-[#CFC5B4] rounded-xl p-5 space-y-3">
                    <h3 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] border-b border-[#CFC5B4]/30 pb-2 tracking-tight">
                      Koleksiyon Öznitelikleri
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">Koleksiyon Adı</span>
                        <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{activeItem.title}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">Öncelik Seviyesi</span>
                        <span className="font-bold text-[#F26B6F] uppercase">{activeItem.priority} Öncelikli</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">Süreç Takibi</span>
                        <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{activeItem.status}</span>
                      </div>
                      {!isDrop && (
                        <>
                          <div className="space-y-0.5">
                            <span className="block text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">Varyant / Renk</span>
                            <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{localVariantColor || 'Standart'}</span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="block text-[10px] font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9]">Ürün Kategorisi</span>
                            <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8] capitalize">{localCategory || 'Diğer'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* INTERACTIVE SHOWCASE SHOP WINDOW / PRODUCTS CATALOG INSIDE DROP */}
              {isDrop && (
                <div className="pt-6 border-t border-[#CFC5B4]/50 space-y-4 text-left">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="font-sans font-bold text-xl text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                        🛍️ Koleksiyon Parçaları & Modeller
                      </h2>
                      <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9]">
                        Bu drop serisine bağlı tasarlanan tüm fiziksel ürünler ve çizimler.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDetailTab('editor');
                        setShowCreateForm('merch_urun');
                        setSelectedParentId(activeItem.id);
                      }}
                      className="px-3.5 py-1.5 bg-[#F26B6F] text-white hover:bg-[#B23A40] text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Yeni Ürün Ekle</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {activeProducts.map(p => (
                      <div 
                        key={p.id}
                        onClick={() => onSelectItem(p.id)}
                        className="group bg-[#FAF8F5] dark:bg-[#15234F] border border-[#CFC5B4] rounded-2xl overflow-hidden cursor-pointer hover:border-[#F26B6F] hover:shadow-lg transition-all duration-300 p-3 space-y-3 flex flex-col"
                      >
                        {/* Polaroid style image stage */}
                        <div className="aspect-square bg-stone-100 dark:bg-stone-950 rounded-xl overflow-hidden relative shadow-inner">
                          {p.images && p.images[0] ? (
                            <img 
                              src={p.images[0]} 
                              alt={p.title} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-slate-800">
                              <ShoppingBag className="w-10 h-10 text-stone-300" />
                            </div>
                          )}
                          <span className="absolute top-2 right-2 text-[9px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72]/90 backdrop-blur-xs text-white px-2 py-0.5 rounded capitalize">
                            {p.metadata?.category || 'Ürün'}
                          </span>
                        </div>

                        <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-mono uppercase text-[#F26B6F] font-bold tracking-wider">
                              {p.status}
                            </span>
                            <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] group-hover:text-[#F26B6F] transition-colors line-clamp-1 tracking-tight">
                              {p.title}
                            </h4>
                          </div>
                          
                          <div className="flex justify-between items-center pt-2 border-t border-[#CFC5B4]/30">
                            <span className="text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                              {p.metadata?.variantColor || 'Standart Varyant'}
                            </span>
                            <span className="text-[10px] text-[#F26B6F] font-mono font-bold group-hover:underline flex items-center gap-0.5">
                              Vitrine Git <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {activeProducts.length === 0 && (
                      <div className="col-span-full py-8 text-center bg-white/20 dark:bg-stone-900/10 border border-dashed border-[#CFC5B4] rounded-2xl">
                        <ShoppingBag className="w-10 h-10 mx-auto text-[#6A5E4C] dark:text-[#A6B0C9] opacity-60 mb-2" />
                        <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic font-serif">
                          Bu drop koleksiyonunda henüz ürün bulunmuyor. Düzenleme kısmından veya yukarıdaki butondan hemen yeni bir ürün tasarımı ekleyebilirsiniz.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        };
        return null;
      })()}

      {/* IN-DEPTH ACTIVE ITEM WORKSPACE VIEW (Section 4C) */}
      {activeItem && (
        <div className="bg-[#F3EFE8] dark:bg-[#13204A] border-2 border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl overflow-hidden shadow-xl paper-grain space-y-6 animate-in zoom-in-95 duration-200">
          
          {/* Cover style panel */}
          <div className="h-44 bg-gradient-to-r from-[#F26B6F] to-[#B23A40] relative flex items-end p-6">
            {kapak(activeItem) && (
              <img 
                src={kapak(activeItem)} 
                alt={activeItem.title} 
                className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50"
              />
            )}
            <div className="relative space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono bg-[#0E1C4F] dark:bg-[#2C3C72] text-white px-2 py-0.5 rounded-sm uppercase font-bold tracking-widest">
                  {activeItem.type}
                </span>
                <span className="text-xs font-mono text-[#F3EFE8] opacity-80">
                  {activeItem.status}
                </span>
              </div>
              <h2 className="font-sans font-bold text-2xl text-white tracking-tight">
                {activeItem.title}
              </h2>
            </div>
            
            {/* Archive or restore button */}
            <button
              onClick={() => onSelectItem(null)}
              className="absolute top-4 right-4 text-white hover:text-amber-200 text-xs font-mono bg-black/20 px-2.5 py-1 rounded"
            >
              ← Geri Dön
            </button>
          </div>

          <div className="p-6 space-y-6">

            {/* MR1 · Drop künyesi — yıl, edisyon, beden seti, bakım etiketi */}
            {activeItem.type === 'drop' && (
              <DropKunyesi
                drop={activeItem}
                urunler={items.filter(
                  i => i.type === 'merch_urun' && !i.archived
                    && i.metadata?.dropId === activeItem.id
                )}
                onUpdateItem={onUpdateItem}
              />
            )}

            {/* Kanon: drop'un (ya da ürünün drop'unun) kurumu — 29 Eylül */}
            {(() => {
              const kurumId = kurumuNe(activeItem);
              const kurum = kurumId ? items.find(i => i.id === kurumId && !i.archived) : undefined;
              return kurum ? (
                <KurumOzeti item={kurum} items={items} onVikideAc={id => onSelectArea?.('duzada', id)} />
              ) : null;
            })()}

            {/* VIEW TAB SELECTOR - GÖSTERİM VE EDİTÖR SEKMELERİ */}
            <div className="flex border-b border-[#CFC5B4] pb-px justify-between items-center gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('vitrin')}
                  className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 -mb-px transition-all cursor-pointer ${
                    activeDetailTab === 'vitrin'
                      ? 'border-[#F26B6F] text-[#F26B6F]'
                      : 'border-transparent text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F]'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>📖 Koleksiyon Vitrini (Brochure)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('editor')}
                  className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 -mb-px transition-all cursor-pointer ${
                    activeDetailTab === 'editor'
                      ? 'border-[#F26B6F] text-[#F26B6F]'
                      : 'border-transparent text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F]'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>⚙️ Süreç Yönetimi & Editör</span>
                </button>
              </div>

              {/* Tam Ekran Sunum Modu butonu */}
              {activeDetailTab === 'vitrin' && (
                <button
                  type="button"
                  onClick={() => setIsFullScreenBrochure(true)}
                  className="px-3 py-1.5 bg-[#0E1C4F]/10 hover:bg-[#F26B6F]/10 dark:bg-stone-800 text-[11px] font-mono text-[#0E1C4F] dark:text-[#F3EFE8] rounded-md border border-[#CFC5B4] hover:border-[#F26B6F] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F26B6F]" />
                  <span>Tam Ekran Broşür Modu</span>
                </button>
              )}
            </div>

            {activeDetailTab === 'vitrin' ? (
              (globalThis as any).renderBrochureView ? (globalThis as any).renderBrochureView() : null
            ) : (
              <div className="space-y-6">
            
            {/* Yapay Zeka Önerisi Karar Paneli (G2 & Rule 2) */}
            {activeItem.isProposal && (
              <div className="bg-red-50 dark:bg-red-950/20 border-2 border-dashed border-[#F26B6F] p-5 rounded-xl space-y-3.5">
                <div 
                  className="flex items-center justify-between border-b border-[#F26B6F]/15 pb-2 cursor-pointer select-none group"
                  onClick={() => setIsAiOneriOpen(!isAiOneriOpen)}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#F26B6F] shrink-0" />
                    <div>
                      <h4 className="font-sans font-bold text-sm text-[#F26B6F] uppercase tracking-tight">
                        ✨ YAPAY ZEKA ÖNERİSİ DETAYI
                      </h4>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#F26B6F] hover:underline bg-[#F26B6F]/10 px-2 py-0.5 rounded font-bold">
                    {isAiOneriOpen ? 'Detayı Gizle [-]' : 'Detayı Göster [+]'}
                  </span>
                </div>

                {isAiOneriOpen && (
                  <>
                    <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] mt-0.5">
                      Bu {activeItem.type === 'drop' ? 'drop koleksiyonu' : 'ürün tasarımı'} yapay zeka tarafından üretilmiştir. Resmileştirmek için kabul edin veya kaldırın.
                    </p>
                    <div className="flex gap-2 font-mono text-xs">
                      <button
                        onClick={async () => {
                          await onUpdateItem({
                            ...activeItem,
                            title: activeItem.title.replace(/\s*\(Öneri\)/i, ''),
                            isProposal: false,
                            status: 'Konsept'
                          });
                        }}
                        className="px-4 py-2 bg-[#F26B6F] text-white font-bold rounded-lg hover:bg-[#b04046] transition-colors cursor-pointer"
                      >
                        Öneriyi Kabul Et (Resmileştir)
                      </button>
                      <button
                        onClick={async () => {
                          await onDeleteItem(activeItem.id);
                          onSelectItem(null);
                        }}
                        className="px-4 py-2 bg-stone-200 text-[#0E1C4F] rounded-lg hover:bg-stone-300 transition-colors cursor-pointer font-semibold"
                      >
                        Vazgeç (Reddet & Sil)
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Status Stepper (Merch-specific stepper) */}
            <div className="space-y-3">
              <span className="block text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] tracking-wider">
                Süreç Takip Aşaması
              </span>
              
              {activeItem.type === 'drop' ? (
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  {['Konsept', 'Tasarım', 'Üretim', 'Satışta'].map(st => {
                    const isActive = activeItem.status === st;
                    return (
                      <button
                        key={st}
                        onClick={async () => await onUpdateItem({ ...activeItem, status: st })}
                        className={`py-2 rounded-lg border cursor-pointer transition-colors ${isActive ? 'bg-[#F26B6F] text-white border-transparent font-bold' : 'bg-white dark:bg-[#17345A] border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              ) : activeItem.type === 'merch_urun' ? (
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-mono">
                  {['Konsept', 'Tasarım', 'Üretim', 'Satışta'].map(st => {
                    const isActive = activeItem.status === st;
                    return (
                      <button
                        key={st}
                        onClick={() => handleUpdateProductStatus(activeItem, st)}
                        className={`py-2 rounded-md border cursor-pointer transition-colors ${isActive ? 'bg-[#F26B6F] text-white border-transparent font-bold' : 'bg-white dark:bg-[#17345A] border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {/* Drop'un çıkış tarihi (yapisal-4, 35): Takvim ve sosyal medya takviminde görünür */}
              {activeItem.type === 'drop' && (
                <label className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                  <span className="font-bold uppercase tracking-wider">Çıkış tarihi</span>
                  <input
                    type="date"
                    value={dropTarihi(activeItem)}
                    onChange={e => void onUpdateItem({ ...activeItem, metadata: { ...activeItem.metadata, cikisTarihi: e.target.value || '' }, updatedAt: Date.now() })}
                    className="bg-white dark:bg-[#17345A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded px-2 py-1 text-[#0E1C4F] dark:text-[#F3EFE8]"
                  />
                  {!dropTarihi(activeItem) && <span className="text-[#A99C87]">boş · takvimde görünmez</span>}
                </label>
              )}
              {activeItem.type === 'merch_urun' && <AsamaYapilacaklari urun={activeItem} onUpdateItem={onUpdateItem} />}
            </div>

            {/* Düzenle (Edit) Button Bar */}
            <div className="flex justify-between items-center bg-white/50 dark:bg-[#1E294B]/20 p-3.5 rounded-xl border border-[#CFC5B4]/30">
              <div className="text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                Bağlı Olduğu Marka: <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{brands.find(b => b.id === activeItem.metadata?.brandId)?.title || "Marka Seçilmemiş"}</span>
                {kurumuNe(activeItem) && (
                  <> · Kurum: <span className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{kurumlar.find(k => k.id === kurumuNe(activeItem))?.title || '—'}</span></>
                )}
              </div>
              <button
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false);
                  } else {
                    startEditing();
                  }
                }}
                className="px-3.5 py-1.5 bg-[#0E1C4F] dark:bg-stone-200 text-white dark:text-[#0E1C4F] hover:opacity-90 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer shadow-xs"
              >
                {isEditing ? '❌ İptal Et' : '✍️ Düzenle (Edit)'}
              </button>
            </div>

            {isEditing ? (
              <div className="bg-white/80 dark:bg-[#1E294B]/45 border border-[#CFC5B4]/50 p-5 rounded-xl space-y-4 animate-in fade-in duration-200 text-left">
                <h3 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] border-b border-[#CFC5B4]/30 pb-2 tracking-tight">
                  Detayları Düzenle ({activeItem.type})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">İsim / Başlık *</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2 focus:outline-hidden focus:border-[#F26B6F]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Bağlı Olduğu Marka *</label>
                    <select
                      value={editBrandId}
                      onChange={(e) => setEditBrandId(e.target.value)}
                      className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                    >
                      <option value="">Seçiniz...</option>
                      {brands.map(b => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                  </div>

                  {activeItem.type === 'drop' && (
                    <div>
                      <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Kurum (evrende)</label>
                      <select
                        value={editKurumId}
                        onChange={(e) => setEditKurumId(e.target.value)}
                        className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                      >
                        <option value="">Kurumsuz — doğrudan marka</option>
                        {kurumlar.map(k => (
                          <option key={k.id} value={k.id}>{k.title}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Öncelik *</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                    >
                      <option value="düşük">Düşük</option>
                      <option value="orta">Orta</option>
                      <option value="yüksek">Yüksek</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Durum *</label>
                    {activeItem.type === 'drop' ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                      >
                        {['Konsept', 'Tasarım', 'Üretim', 'Satışta'].map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    ) : activeItem.type === 'merch_urun' ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                      >
                        {['Konsept', 'Tasarım', 'Üretim', 'Satışta'].map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                      />
                    )}
                  </div>

                  {activeItem.type === 'merch_urun' && (
                    <>
                      <div>
                        <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Bağlı Olduğu Drop / Koleksiyon</label>
                        <select
                          value={editParentId}
                          onChange={(e) => setEditParentId(e.target.value)}
                          className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                        >
                          <option value="">Seçiniz...</option>
                          {activeDrops.map(d => (
                            <option key={d.id} value={d.id}>{d.title}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Renk / Varyant</label>
                        <input
                          type="text"
                          value={editVariantColor}
                          onChange={(e) => setEditVariantColor(e.target.value)}
                          className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Kategori</label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                        >
                          <option value="giyim">Giyim</option>
                          <option value="baskı">Baskı / Poster</option>
                          <option value="aksesuar">Aksesuar</option>
                          <option value="diğer">Diğer</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1 font-bold">Kurgu / Vizyon Notları</label>
                  <textarea
                    rows={4}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full text-xs bg-[#F6F1E7] dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2 focus:outline-hidden focus:border-[#F26B6F]"
                  />
                </div>

                <div className="flex justify-end gap-2 text-xs font-mono pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9] rounded hover:bg-stone-100 dark:hover:bg-slate-800 cursor-pointer font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-4 py-1.5 bg-[#3E8E5E] text-white rounded hover:opacity-95 cursor-pointer font-bold"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Left Column: Rich Visuals & Gallery */}
                <div className="space-y-6">
                  <div className="bg-white/40 dark:bg-[#172554]/10 p-4 border border-[#CFC5B4] rounded-xl space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/30">
                      <span className="block text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
                        📷 Kapak & Mockup Galerisi
                      </span>
                      {/* Quick visual upload when not in editing mode */}
                      <div className="flex items-center gap-2">
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
                                const compressed = await compressImageBase64(base64);
                                await onUpdateItem({
                                  ...activeItem,
                                  images: [...(activeItem.images || []), compressed]
                                });
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="hidden"
                          id="showcase-file-upload-input"
                        />
                        <label
                          htmlFor="showcase-file-upload-input"
                          className="text-[10px] font-mono bg-[#F26B6F] text-white px-2 py-1 rounded cursor-pointer hover:bg-[#b04046]"
                        >
                          + Görsel Yükle
                        </label>
                      </div>
                    </div>

                    {/* Large active visual showcase */}
                    <div className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative border border-[#CFC5B4]/30 flex items-center justify-center group/showcase">
                      {activeItem.images && activeItem.images.length > 0 ? (
                        <>
                          <img 
                            src={activeItem.images[Math.min(activeImageIdx, activeItem.images.length - 1)] || activeItem.images[0]} 
                            alt={activeItem.title} 
                            className="w-full h-full object-cover transition-all" 
                          />
                          
                          {/* Navigation buttons */}
                          {activeItem.images.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveImageIdx(prev => (prev - 1 + activeItem.images.length) % activeItem.images.length);
                                }}
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-[#13204A]/90 border border-[#CFC5B4] text-[#0E1C4F] dark:text-[#F3EFE8] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer opacity-0 group-hover/showcase:opacity-100 shadow-md z-10"
                                title="Önceki Görsel"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveImageIdx(prev => (prev + 1) % activeItem.images.length);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-[#13204A]/90 border border-[#CFC5B4] text-[#0E1C4F] dark:text-[#F3EFE8] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer opacity-0 group-hover/showcase:opacity-100 shadow-md z-10"
                                title="Sonraki Görsel"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                              
                              {/* Bottom pill indicator */}
                              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#0E1C4F]/80 dark:bg-stone-900/80 backdrop-blur-xs text-white font-mono text-[10px] px-2.5 py-1 rounded-full border border-white/10 shadow-xs">
                                {Math.min(activeImageIdx, activeItem.images.length - 1) + 1} / {activeItem.images.length}
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-6 space-y-2">
                          <Image className="w-12 h-12 mx-auto text-stone-300" />
                          <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Bu drop için görsel bulunmuyor.</p>
                        </div>
                      )}
                    </div>

                    {/* Small thumbnails */}
                    {activeItem.images && activeItem.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pt-1">
                        {activeItem.images.map((img, idx) => {
                          const isSelected = idx === Math.min(activeImageIdx, activeItem.images.length - 1);
                          return (
                            <div 
                              key={idx} 
                              onClick={() => setActiveImageIdx(idx)}
                              className={`relative w-16 h-16 border rounded-lg overflow-hidden shrink-0 cursor-pointer group transition-all ${
                                isSelected 
                                  ? 'border-[#F26B6F] ring-2 ring-[#F26B6F]/30' 
                                  : 'border-[#CFC5B4] hover:border-[#F26B6F]'
                              }`}
                            >
                              <img src={img} alt="mockup thumbnail" className="w-full h-full object-cover" />
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const updatedImgs = activeItem.images.filter((_, i) => i !== idx);
                                  await onUpdateItem({ ...activeItem, images: updatedImgs });
                                  if (activeImageIdx >= updatedImgs.length) {
                                    setActiveImageIdx(Math.max(0, updatedImgs.length - 1));
                                  }
                                }}
                                className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Görseli Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  </div>

                {/* Right Column: Beautifully Spaced Metadata & Notes */}
                <div className="space-y-6 text-left">
                  {/* Local Unsaved Changes Banner */}
                  {hasLocalChanges && (
                    <div className="bg-[#3E8E5E]/10 border border-[#3E8E5E] p-3.5 rounded-lg flex justify-between items-center animate-in slide-in-from-top-2">
                      <span className="text-xs font-mono text-[#3E8E5E] font-bold">
                        💾 Kaydedilmemiş değişiklikler var!
                      </span>
                      <button
                        onClick={handleSaveLocalChanges}
                        className="px-3 py-1 bg-[#3E8E5E] text-white text-xs font-mono rounded-md hover:bg-emerald-600 transition-colors font-bold cursor-pointer"
                      >
                        Şimdi Kaydet
                      </button>
                    </div>
                  )}

                  {/* Drop/Product Notes */}
                  <div className="space-y-2">
                    <label className="block text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] font-bold tracking-wider">
                      Koleksiyon / Kurgu Açıklaması
                    </label>
                    <div className="bg-white dark:bg-[#172554]/10 border border-[#CFC5B4] rounded-xl p-4 min-h-[120px] relative">
                      <textarea
                        rows={5}
                        value={localNotes}
                        onChange={(e) => setLocalNotes(e.target.value)}
                        className="w-full text-xs bg-transparent border-none focus:outline-hidden text-[#0E1C4F] dark:text-[#F3EFE8] leading-relaxed font-serif italic"
                        placeholder="Bu kreasyon veya tasarımın ardındaki vizyonu detaylandırın..."
                      />
                      <div className="absolute bottom-2 right-2 text-[10px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                        {hasLocalChanges ? "Değişiklikleri kaydetmek için sağ alttaki butona tıklayın." : "Doğrudan düzenleyebilirsiniz."}
                      </div>
                    </div>
                  </div>

                  {/* Edition Plan & Notes */}
                  {activeItem.type === 'drop' && (
                    <div className="p-4 bg-[#BBA591]/10 border border-[#BBA591] rounded-xl space-y-2">
                      <span className="block text-[11px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] uppercase font-bold">
                        Edisyon Planlamaları & Notlar
                      </span>
                      <textarea
                        rows={3}
                        value={localEditionNotes}
                        onChange={(e) => setLocalEditionNotes(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-[#17345A]/25 border border-[#BBA591]/40 rounded p-2"
                        placeholder="Bu edisyona özel notlar ekleyin..."
                      />
                    </div>
                  )}

                  {/* Product Variant Details */}
                  {activeItem.type === 'merch_urun' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
                          Renk / Varyant
                        </label>
                        <input
                          type="text"
                          placeholder="Örn: Zeytin Yeşili, Ekru..."
                          value={localVariantColor}
                          onChange={(e) => setLocalVariantColor(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] font-bold">
                          Ürün Kategorisi
                        </label>
                        <select
                          value={localCategory}
                          onChange={(e) => setLocalCategory(e.target.value)}
                          className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
                        >
                          <option value="giyim">Giyim</option>
                          <option value="baskı">Baskı / Poster</option>
                          <option value="aksesuar">Aksesuar</option>
                          <option value="diğer">Diğer</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Explicit Save button for outstanding reassurance */}
                  <div className="flex gap-2 pt-2 justify-end">
                    <button
                      onClick={handleSaveLocalChanges}
                      disabled={!hasLocalChanges}
                      className={`px-5 py-2.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        hasLocalChanges
                          ? "bg-[#3E8E5E] text-white cursor-pointer hover:bg-emerald-600"
                          : "bg-stone-200 text-stone-500 dark:text-stone-400 cursor-not-allowed"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>Değişiklikleri Kaydet (Save)</span>
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* List products inside drop / Two way linkage */}
            {activeItem.type === 'drop' && (
              <div className="pt-4 border-t border-[#CFC5B4]/40 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                    Bu Droptaki Tüm Ürünler
                  </h4>
                  <button
                    onClick={() => { setShowCreateForm('merch_urun'); setSelectedParentId(activeItem.id); }}
                    className="text-xs font-mono text-[#F26B6F] hover:underline"
                  >
                    + Ürün Ekle
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {products.filter(p => p.metadata?.dropId === activeItem.id).map(p => (
                    <div 
                      key={p.id}
                      onClick={() => onSelectItem(p.id)}
                      className="p-3 bg-white dark:bg-[#17345A] border border-[#CFC5B4] hover:border-[#F26B6F] rounded-lg cursor-pointer flex justify-between items-center text-xs"
                    >
                      <div>
                        <h5 className="font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">{p.title}</h5>
                        <span className="text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9] font-mono capitalize">{p.metadata?.variantColor || 'Standart Varyant'}</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase text-[#F26B6F]">
                        {p.status}
                      </span>
                    </div>
                  ))}
                  {products.filter(p => p.metadata?.dropId === activeItem.id).length === 0 && (
                    <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Bu dropa bağlı henüz bir ürün eklenmedi.</p>
                  )}
                </div>
              </div>
            )}

            {/* Delete / Archive Drop Action */}
            <div className="pt-4 border-t border-[#CFC5B4]/30 flex justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={async () => {
                  if (archiveConfirmId === activeItem.id) {
                    await onUpdateItem({ ...activeItem, archived: true });
                    onSelectItem(null);
                  } else {
                    setArchiveConfirmId(activeItem.id);
                    setDeleteConfirmId(null);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  archiveConfirmId === activeItem.id
                    ? "bg-amber-500 text-white font-bold hover:bg-amber-600"
                    : "bg-[#CFC5B4]/30 dark:bg-[#2C3C72] text-[#6A5E4C] hover:bg-[#CFC5B4]/50"
                }`}
              >
                {archiveConfirmId === activeItem.id ? "⚠️ Emin misiniz?" : "Arşivle"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (deleteConfirmId === activeItem.id) {
                    await onDeleteItem(activeItem.id);
                    onSelectItem(null);
                  } else {
                    setDeleteConfirmId(activeItem.id);
                    setArchiveConfirmId(null);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  deleteConfirmId === activeItem.id
                    ? "bg-red-600 text-white font-bold hover:bg-red-700"
                    : "bg-red-100 text-red-600 hover:bg-red-600 hover:text-white"
                }`}
              >
                {deleteConfirmId === activeItem.id ? "⚠️ Emin misiniz?" : "Sil"}
              </button>
            </div>

              </div>
            )}

            {/* FULL-SCREEN DIGITAL LOOKBOOK / BROCHURE MODAL OVERLAY */}
            {isFullScreenBrochure && (
              <div className="fixed inset-0 bg-stone-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
                {/* Close button */}
                <button
                  type="button"
                  onClick={() => setIsFullScreenBrochure(false)}
                  className="absolute top-6 right-6 text-white hover:text-[#F26B6F] font-mono flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full cursor-pointer transition-all z-50 shadow-md"
                >
                  <span>✕ Kapat</span>
                </button>

                {/* Book container */}
                <div className="max-w-6xl w-full bg-[#FAF8F5] text-[#0E1C4F] rounded-3xl overflow-hidden shadow-2xl flex flex-col lg:flex-row border border-[#CFC5B4]/60 paper-grain max-h-[90vh]">
                  
                  {/* Left page: Visual showcase */}
                  <div className="lg:w-1/2 bg-stone-100 flex flex-col justify-between p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-[#CFC5B4]/40 overflow-y-auto">
                    <div className="flex-1 flex items-center justify-center min-h-[300px] relative group/modal-showcase">
                      {activeItem.images && activeItem.images.length > 0 ? (
                        <>
                          <img 
                            src={activeItem.images[Math.min(activeImageIdx, activeItem.images.length - 1)] || activeItem.images[0]} 
                            alt={activeItem.title} 
                            className="max-h-[50vh] object-contain rounded-2xl shadow-md" 
                          />
                          
                          {activeItem.images.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveImageIdx(prev => (prev - 1 + activeItem.images.length) % activeItem.images.length);
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 border border-[#CFC5B4] text-[#0E1C4F] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer shadow-md z-10"
                              >
                                <ChevronLeft className="w-6 h-6" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveImageIdx(prev => (prev + 1) % activeItem.images.length);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 border border-[#CFC5B4] text-[#0E1C4F] flex items-center justify-center hover:bg-[#F26B6F] hover:text-white transition-all cursor-pointer shadow-md z-10"
                              >
                                <ChevronRight className="w-6 h-6" />
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-8">
                          <Image className="w-16 h-16 mx-auto text-stone-300 mb-2" />
                          <p className="text-sm text-stone-500 dark:text-stone-400 font-mono">Bu koleksiyon için görsel bulunmuyor.</p>
                        </div>
                      )}
                    </div>

                    {/* Thumbnail carousel inside modal */}
                    {activeItem.images && activeItem.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto justify-center pt-4">
                        {activeItem.images.map((img, idx) => (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setActiveImageIdx(idx)}
                            className={`relative w-14 h-14 border rounded-lg overflow-hidden shrink-0 cursor-pointer transition-all ${
                              idx === Math.min(activeImageIdx, activeItem.images.length - 1)
                                ? "border-[#F26B6F] ring-2 ring-[#F26B6F]/30"
                                : "border-[#CFC5B4]/50 hover:border-[#F26B6F]"
                            }`}
                          >
                            <img src={img} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right page: Editorial content */}
                  <div className="lg:w-1/2 p-6 sm:p-10 flex flex-col justify-between overflow-y-auto max-h-[90vh]">
                    <div className="space-y-6 text-left">
                      {/* Brand and Series */}
                      <div className="border-b border-[#CFC5B4]/40 pb-4 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-[#F26B6F] font-bold uppercase">
                          <span>Kems Collection</span>
                          <span>•</span>
                          <span>{brands.find(b => b.id === activeItem.metadata?.brandId)?.title || "Genel Serisi"}</span>
                        </div>
                        <h2 className="font-sans font-bold text-3xl text-[#0E1C4F] tracking-tight leading-tight">
                          {activeItem.title}
                        </h2>
                        <div className="inline-flex items-center gap-2 font-mono text-[10px] bg-stone-100 px-2.5 py-1 rounded-sm text-[#0E1C4F] border border-[#CFC5B4]/40 font-semibold">
                          DURUM: {activeItem.status}
                        </div>
                      </div>

                      {/* Editorial Vision Story */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-mono font-bold tracking-widest text-[#F26B6F] uppercase">VİZYON VE KURGU</h4>
                        <p className="font-serif italic text-base leading-relaxed text-[#0E1C4F]/90 bg-[#FAF8F5]/80 p-5 border-l-2 border-[#F26B6F] rounded-r-lg relative">
                          {localNotes || "Kurgu detayları henüz işlenmedi."}
                        </p>
                      </div>

                      {/* Edisyon Notları */}
                      {localEditionNotes && (
                        <div className="p-4 bg-[#BBA591]/10 border border-[#BBA591]/30 rounded-xl space-y-1 text-xs">
                          <span className="block font-mono text-[10px] font-bold uppercase text-[#6A5E4C]">EDİSYON DEPARTMAN PLANLAMASI</span>
                          <p className="leading-relaxed italic text-[#0E1C4F]/80">{localEditionNotes}</p>
                        </div>
                      )}

                      {/* Catalog pieces list inside fullscreen modal */}
                      {activeItem.type === 'drop' && (
                        <div className="space-y-3 pt-4 border-t border-[#CFC5B4]/30">
                          <h4 className="font-sans font-bold text-sm text-[#0E1C4F] tracking-tight">Koleksiyondaki Modeller ({products.filter(p => p.metadata?.dropId === activeItem.id).length})</h4>
                          <div className="grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                            {products.filter(p => p.metadata?.dropId === activeItem.id).map(p => (
                              <div
                                key={p.id}
                                className="p-2.5 bg-white border border-[#CFC5B4] rounded-xl flex gap-2.5 items-center text-left cursor-pointer hover:border-[#F26B6F] transition-all"
                                onClick={() => {
                                  setIsFullScreenBrochure(false);
                                  onSelectItem(p.id);
                                }}
                              >
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-stone-100 shrink-0">
                                  {p.images && p.images[0] ? (
                                    <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-stone-300" /></div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="font-serif font-bold text-xs text-[#0E1C4F] truncate">{p.title}</h5>
                                  <p className="text-[9px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] capitalize truncate">{p.metadata?.category || 'Ürün'} • {p.metadata?.variantColor || 'Standart'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Decorative footer stamp */}
                    <div className="pt-8 border-t border-[#CFC5B4]/20 flex justify-between items-center text-[9px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                      <span>KEMS KOMUTA MERKEZİ • KOLEKSİYON BÜLTENİ</span>
                      <span className="font-bold">EDİSYON: 2026</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Creation form modal overlays (Tema, Drop, Urun) */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateMerch} className="bg-[#F3EFE8] border-2 border-[#CFC5B4] rounded-xl max-w-md w-full p-6 space-y-4 paper-grain animate-in zoom-in-95 duration-200">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] border-b border-[#CFC5B4]/50 pb-2 capitalize tracking-tight">
              Yeni {showCreateForm === 'drop' ? 'Drop' : 'Ürün'} Tasarla
            </h3>

            <div>
              <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                İsim / Başlık *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2 focus:outline-hidden focus:border-[#F26B6F]"
                placeholder="Başlığı giriniz..."
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                Bağlı Olduğu Marka *
              </label>
              <select
                required
                value={createFormBrandId}
                onChange={(e) => setCreateFormBrandId(e.target.value)}
                className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
              >
                <option value="">Seçiniz...</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>

            {showCreateForm === 'drop' && kurumlar.length > 0 && (
              <div>
                <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                  Kurum (evrende) — isteğe bağlı
                </label>
                <select
                  value={createFormKurumId}
                  onChange={(e) => setCreateFormKurumId(e.target.value)}
                  className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
                >
                  <option value="">Kurumsuz — doğrudan marka</option>
                  {kurumlar.map(k => (
                    <option key={k.id} value={k.id}>{k.title}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-[#6A5E4C] dark:text-[#A6B0C9] leading-snug">
                  Satan yine marka. Kurum, serinin adada kimden çıktığı.
                </p>
              </div>
            )}

            {showCreateForm === 'merch_urun' && (
              <>
                <div>
                  <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                    Bağlı Olduğu Drop / Koleksiyon
                  </label>
                  <select
                    required
                    value={selectedParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
                  >
                    <option value="">Drop Seçin...</option>
                    {activeDrops.map(d => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                      Renk / Varyant
                    </label>
                    <input
                      type="text"
                      value={newVariantColor}
                      onChange={(e) => setNewVariantColor(e.target.value)}
                      className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
                      placeholder="Ekru, Lacivert vb."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                      Kategori
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
                    >
                      <option value="giyim">Giyim</option>
                      <option value="baskı">Baskı / Poster</option>
                      <option value="aksesuar">Aksesuar</option>
                      <option value="diğer">Diğer</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-mono text-[#6A5E4C] mb-1">
                Kurgu / Vizyon Notları
              </label>
              <textarea
                rows={3}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full text-xs bg-[#F6F1E7] text-[#0E1C4F] border border-[#CFC5B4] rounded p-2"
                placeholder="Marka vizyonu ve tasarımı hakkında notlar ekleyin..."
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setShowCreateForm(null)}
                className="px-3 py-1.5 border border-[#CFC5B4] rounded hover:bg-stone-100"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#F26B6F] text-white rounded hover:bg-[#B23A40]"
              >
                Oluştur
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
