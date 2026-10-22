import { YazimPaneli } from './wiki/YazimPaneli';
import { TYPE_LABELS } from './wiki/wikiSchema';
import { Fanzin } from './fanzin/Fanzin';
import { fanzinBilgisi } from '../lib/studyo';
import React, { useState, useMemo } from 'react';
import { BeklemeliMetin } from './kabuk/BeklemeliMetin';
import { BookOpen, Trash2, Compass, RefreshCw, FileText } from 'lucide-react';
import { StudyodaAc } from './studyo/StudyodaAc';
import { Item, ItemType } from '../types';
import { getCachedAccessToken } from '../lib/firebase';
import { createGoogleDoc } from '../lib/googleApi';
import SharedEditor from './SharedEditor';
import { YaziEditorunuGonder } from './YaziEditorunuGonder';

interface BlogProps {
  items: Item[];
  activeItemId?: string | null;
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  /** Yazım panelinden maddeyi vikide açar (7. gece) */
  onMaddeAc?: (id: string) => void;
}

export default function Blog({
  items,
  activeItemId,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onMaddeAc
}: BlogProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'editor'>(
    () => (activeItemId && items.some(i => i.id === activeItemId && i.type === 'blog_post') ? 'editor' : 'home'));
  // Başka sayfadan bir yazıya basılınca yazının kendisi açılsın (30 Eylül)
  React.useEffect(() => {
    if (activeItemId && items.some(i => i.id === activeItemId && i.type === 'blog_post')) setActiveTab('editor');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);
  
  // Editorial and AI help states

  // Creation State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'lore yazısı' | 'duyuru' | 'kişisel' | 'rehber'>('lore yazısı');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Link selector state
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Send to Book states
  const [showSendToBookModal, setShowSendToBookModal] = useState(false);
  const [sendToBookSelectedBookId, setSendToBookSelectedBookId] = useState('');
  const [sendToBookSelectedChapterId, setSendToBookSelectedChapterId] = useState(''); // 'new' or chapter ID
  const [sendToBookNewChapterTitle, setSendToBookNewChapterTitle] = useState('');
  const [isSendingToBook, setIsSendingToBook] = useState(false);

  // Google Doc Export state
  const [isExportingDoc, setIsExportingDoc] = useState(false);

  const handleSendPostToBook = async () => {
    if (!activePost) return;
    if (!sendToBookSelectedBookId) {
      alert("Lütfen bir kitap seçin.");
      return;
    }

    setIsSendingToBook(true);
    try {
      if (sendToBookSelectedChapterId === 'new') {
        const title = sendToBookNewChapterTitle.trim() || activePost.title;
        
        await onAddItem({
          title,
          area: 'kitap',
          type: 'kitap_bolum',
          status: 'Taslak',
          priority: 'orta',
          tags: ['blog-aktarimi'],
          links: [sendToBookSelectedBookId],
          notes: activePost.notes,
          images: [],
          isProposal: false,
          archived: false,
          metadata: {
            bookId: sendToBookSelectedBookId,
            chapterNumber: 1
          }
        });
        alert(`"${title}" isimli yeni bölüm başarıyla "${sendToBookSelectedBookId}" kitabına eklendi!`);
      } else {
        const targetChapter = items.find(i => i.id === sendToBookSelectedChapterId);
        if (!targetChapter) {
          alert("Seçilen bölüm bulunamadı.");
          return;
        }

        const separator = "\n\n---\n\n";
        await onUpdateItem({
          ...targetChapter,
          notes: (targetChapter.notes || "") + separator + `**${activePost.title}**\n\n` + activePost.notes
        });
        alert(`Yazı başarıyla "${targetChapter.title}" bölümünün sonuna eklendi!`);
      }
      setShowSendToBookModal(false);
      setSendToBookNewChapterTitle('');
    } catch (err) {
      console.error(err);
      alert("Bölüm aktarılırken bir hata oluştu.");
    } finally {
      setIsSendingToBook(false);
    }
  };

  const handleExportPostToDoc = async () => {
    if (!activePost) return;
    const token = getCachedAccessToken();
    if (!token) {
      alert("Google Workspace bağlantısı aktif değil. Lütfen sol taraftaki 'Google Workspace' sekmesinden bağlantınızı kurun.");
      return;
    }
    
    setIsExportingDoc(true);
    try {
      await createGoogleDoc(activePost.title, activePost.notes || '');
      alert(`"${activePost.title}" başarıyla Google Dokümanı olarak aktarıldı! Google Drive klasörünüzde bulabilirsiniz.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Google Dokümanı oluşturulurken hata oluştu.");
    } finally {
      setIsExportingDoc(false);
    }
  };

  // Blog posts lists
  const posts = useMemo(() => items.filter(i => i.area === 'blog' && i.type === 'blog_post' && !i.archived), [items]);
  
  const entities = useMemo(() => items.filter(i => i.area === 'duzada' && !i.archived && !i.isProposal), [items]);

  const activePost = useMemo(() => {
    if (!activeItemId) return null;
    return posts.find(p => p.id === activeItemId) || null;
  }, [activeItemId, posts]);

  // Derived lists for home view
  const drafts = useMemo(() => posts.filter(p => p.status === 'Taslak'), [posts]);
  const readyToPublish = useMemo(() => posts.filter(p => p.status === 'Yayında'), [posts]);
  const linkedToEntities = useMemo(() => posts.filter(p => (p.links || []).length > 0), [posts]);

  // Create new Blog post
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const id = `blog_${Date.now()}`;
    const newPost: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
      title: newTitle,
      area: 'blog',
      type: 'blog_post',
      status: 'Taslak',
      priority: 'orta',
      tags: ['yazı', newCategory],
      links: [],
      notes: 'Yeni blog yazınıza buraya kelimeler ekleyerek başlayın...',
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        categoryType: newCategory,
        isWikiHooked: true
      }
    };

    await onAddItem(newPost);
    setNewTitle('');
    setShowCreateForm(false);
    onSelectItem(id);
    setActiveTab('editor');
  };

  // Copy to Blog action (simulates external blog export and flips status to Yayında!)
  const handleCopyToBlog = async () => {
    if (!activePost) return;
    
    // Simulate successful copy
    alert(`"${activePost.title}" yazısı başarıyla 'Kemsinblogu' (Kems Blog) paneline kopyalandı ve yayına alındı!`);
    
    await onUpdateItem({
      ...activePost,
      status: 'Yayında'
    });
  };

  const handleLinkEntity = async () => {
    if (!activePost || !selectedEntityId) return;
    const currentLinks = activePost.links || [];
    if (currentLinks.includes(selectedEntityId)) return;

    const ent = entities.find(e => e.id === selectedEntityId);
    const dismissed = activePost.metadata?.dismissedSuggestions || [];
    const newDismissed = ent ? dismissed.filter((n: string) => n.toLowerCase() !== ent.title.toLowerCase()) : dismissed;

    await onUpdateItem({
      ...activePost,
      links: [...currentLinks, selectedEntityId],
      metadata: {
        ...(activePost.metadata || {}),
        dismissedSuggestions: newDismissed
      }
    });
    setSelectedEntityId('');
  };

  const handleUnlinkEntity = async (entityId: string) => {
    if (!activePost) return;
    const currentLinks = activePost.links || [];
    await onUpdateItem({
      ...activePost,
      links: currentLinks.filter(id => id !== entityId)
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Breadcrumb & toggles */}
      {/* Görünüm düğmeleri (1 Ekim, K-2: başlık sayfa rayında; tutarlılık denetimi stüdyoda) */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('home'); onSelectItem(null); }}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${activeTab === 'home' ? 'bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8]' : 'bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
          >
            Yazı Havuzu
          </button>
          {activePost && (
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${activeTab === 'editor' ? 'bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8]' : 'bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
            >
              Masaüstü Editör
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: BLOG HOME / WRITE GRID */}
      {activeTab === 'home' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          <div className="flex justify-between items-center pb-2 border-b border-[#CFC5B4]/40">
            <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
              Yazı Masası ve Taslaklar ({posts.length})
            </h3>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="text-xs font-mono bg-[#F26B6F] text-white px-3 py-1.5 rounded-lg hover:bg-[#B23A40] transition-all cursor-pointer"
            >
              + Yeni Yazı Kaleme Al
            </button>
          </div>

          {/* Create Post overlay/form */}
          {showCreateForm && (
            <form onSubmit={handleCreatePost} className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl max-w-md space-y-4 shadow-md paper-grain">
              <h4 className="font-sans font-bold text-[#0E1C4F] dark:text-[#F3EFE8] border-b border-[#CFC5B4]/50 pb-2 tracking-tight">
                Yeni Yazı Başlat
              </h4>
              <div>
                <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1">
                  Yazı Başlığı *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Başlığı giriniz..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1">
                  Yazı Türü / Kategorisi
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                >
                  <option value="lore yazısı">Lore Yazısı</option>
                  <option value="duyuru">Duyuru / Haber</option>
                  <option value="kişisel">Kişisel Deneme</option>
                  <option value="rehber">Rehber / Kitapçık</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 border border-[#CFC5B4] rounded"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#F26B6F] text-white rounded"
                >
                  Yazı Başlat
                </button>
              </div>
            </form>
          )}

          {/* Post Folders Category rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Taslaklar */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl p-5 paper-grain space-y-3 archive-shadow">
              <span className="text-[10px] font-mono text-[#F26B6F] font-bold block uppercase">
                Devam Eden Taslaklar ({drafts.length})
              </span>
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {drafts.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => { onSelectItem(p.id); setActiveTab('editor'); }}
                    className="p-2 bg-white/60 dark:bg-[#17345A]/40 border border-[#E3DCCF] dark:border-[#2C3C72] rounded hover:border-[#F26B6F] cursor-pointer transition-all flex items-center justify-between gap-2 group/item"
                  >
                    <div className="flex-1 min-w-0">
                      <h5 className="font-serif font-bold text-xs text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-1">{p.title}</h5>
                      <span className="text-[9px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9] capitalize block mt-0.5">{p.metadata?.categoryType}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(p.id);
                      }}
                      className="text-stone-500 dark:text-stone-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {drafts.length === 0 && <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Taslak bulunmuyor.</p>}
              </div>
            </div>

            {/* Yayına Hazır */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl p-5 paper-grain space-y-3 archive-shadow">
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold block uppercase">
                Yayına Hazır / Yayında ({readyToPublish.length})
              </span>
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {readyToPublish.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => { onSelectItem(p.id); setActiveTab('editor'); }}
                    className="p-2 bg-white/60 dark:bg-[#17345A]/40 border border-[#E3DCCF] dark:border-[#2C3C72] rounded hover:border-emerald-600 cursor-pointer transition-all flex items-center justify-between gap-2 group/item"
                  >
                    <div className="flex-1 min-w-0">
                      <h5 className="font-serif font-bold text-xs text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-1">{p.title}</h5>
                      <span className="text-[9px] font-mono text-emerald-700 dark:text-emerald-400 block mt-0.5">Yayınlandı</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(p.id);
                      }}
                      className="text-stone-500 dark:text-stone-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {readyToPublish.length === 0 && <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Yayınlanan yazı yok.</p>}
              </div>
            </div>

            {/* Varlığa Bağlı Yazılar */}
            <div className="bg-[#E7EBE6] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-5 paper-grain space-y-3 archive-shadow">
              <span className="text-[10px] font-mono text-[#4A5E68] dark:text-[#A6B0C9] font-bold block uppercase">
                Varlığa Bağlı Yazılar ({linkedToEntities.length})
              </span>
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {linkedToEntities.map(p => {
                  const connected = entities.filter(e => (p.links || []).includes(e.id));
                  return (
                    <div 
                      key={p.id}
                      onClick={() => { onSelectItem(p.id); setActiveTab('editor'); }}
                      className="p-2 bg-white/60 dark:bg-[#17345A]/40 border border-[#CFC5B4] rounded hover:border-[#4A5E68] cursor-pointer transition-all flex items-center justify-between gap-2 group/item"
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="font-serif font-bold text-xs text-[#0E1C4F] dark:text-[#F3EFE8] line-clamp-1">{p.title}</h5>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {connected.map(c => (
                            <span key={c.id} className="text-[8px] bg-stone-200 px-1 py-0.2 rounded text-stone-700 font-mono">
                              {c.title}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(p.id);
                        }}
                        className="text-stone-500 dark:text-stone-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {linkedToEntities.length === 0 && <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Lore bağlı yazı yok.</p>}
              </div>
            </div>

            {/* Tüm Listesi Grid */}
            <div className="bg-[#F6F1E7] dark:bg-[#13204A] border border-[#CFC5B4] rounded-xl p-5 paper-grain space-y-3 archive-shadow">
              <span className="text-[10px] font-mono text-[#4A5E68] dark:text-[#A6B0C9] font-bold block uppercase">
                Kemsinblogu Son Aktivite
              </span>
              <div className="space-y-1.5 text-xs">
                <p className="text-[#6A5E4C] dark:text-[#A6B0C9]">Kems Company kişisel blog istatistiğidir. Tüm yazılar wiki kancalıdır.</p>
                <div className="p-3 bg-white/40 dark:bg-[#13204A]/50 border border-[#CFC5B4] rounded-lg">
                  <span className="font-mono text-[10px] block text-[#6A5E4C] dark:text-[#A6B0C9]">TOPLAM KELİME:</span>
                  <span className="text-base font-serif font-bold text-[#0E1C4F] dark:text-[#F3EFE8]">
                    {posts.reduce((sum, p) => sum + (p.notes?.split(/\s+/).length || 0), 0)} Kelime
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* VIEW 2: MASAÜSTÜ EDİTÖR (Section 4D) */}
      {/* Fanzin (yapisal-4): kendi ekranı — dergi görünümü, bölüm tonları, çıktılar */}
      {activeTab === 'editor' && activePost && fanzinBilgisi(activePost) && (
        <Fanzin yazi={activePost} onUpdateItem={onUpdateItem} items={items} onMaddeAc={onMaddeAc} onAddItem={onAddItem} />
      )}

      {activeTab === 'editor' && activePost && !fanzinBilgisi(activePost) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in-95 duration-200">
          
          {/* LEFT: Massive editorial letter on paper #F6F1E7 */}
          <div className="lg:col-span-2 bg-[#F6F1E7] dark:bg-[#13204A]/90 border-2 border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-6 md:p-10 paper-grain archive-shadow space-y-6 flex flex-col min-h-[600px]">
            
            {/* Editor Header */}
            <div className="flex justify-between items-start pb-4 border-b border-[#CFC5B4]/50">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-[#0E1C4F] dark:bg-[#2C3C72]/10 text-[#0E1C4F] dark:text-[#F3EFE8] px-2 py-0.5 rounded capitalize">
                    {activePost.status}
                  </span>
                  <span className="text-xs font-mono uppercase bg-[#F26B6F]/15 text-[#F26B6F] px-2.5 py-0.5 rounded">
                    {activePost.metadata?.categoryType}
                  </span>
                </div>
                
                {/* Editable Title */}
                <BeklemeliMetin
                  deger={activePost.title}
                  onKaydet={t => onUpdateItem({ ...activePost, title: t })}
                  className="font-serif font-bold text-2xl md:text-3xl text-[#0E1C4F] dark:text-[#F3EFE8] italic bg-transparent focus:outline-hidden border-b border-transparent focus:border-[#CFC5B4]"
                />
              </div>

              {/* Status selectors & Action */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const books = items.filter(i => i.area === 'kitap' && i.type === 'kitap_proje' && !i.archived);
                    if (books.length === 0) {
                      alert("Kitap ve Kityap bölümünde henüz bir Kitap Projesi bulunmuyor. Lütfen önce bir Kitap oluşturun.");
                      return;
                    }
                    setSendToBookSelectedBookId(books[0].id);
                    const bookChapters = items.filter(i => i.area === 'kitap' && i.type === 'kitap_bolum' && !i.archived && (i.links || []).includes(books[0].id));
                    if (bookChapters.length > 0) {
                      setSendToBookSelectedChapterId(bookChapters[0].id);
                    } else {
                      setSendToBookSelectedChapterId('new');
                    }
                    setShowSendToBookModal(true);
                  }}
                  className="px-3 py-1.5 bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] hover:bg-slate-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Yazıyı Kitap veya Kityap Bölümüne Gönder"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Kitaba Gönder</span>
                </button>

                <YaziEditorunuGonder yazi={activePost} onUpdateItem={onUpdateItem} />

                <button
                  type="button"
                  onClick={handleExportPostToDoc}
                  disabled={isExportingDoc}
                  className="px-3 py-1.5 bg-[#F26B6F] hover:bg-[#B23A40] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Google Dokümanı Olarak Dışa Aktar"
                >
                  {isExportingDoc ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>Docs'a Aktar</span>
                </button>

                <select
                  value={activePost.status}
                  onChange={async (e) => await onUpdateItem({ ...activePost, status: e.target.value })}
                  className="bg-white text-xs border border-[#CFC5B4] rounded p-1.5 focus:outline-hidden text-[#0E1C4F]"
                >
                  <option value="Taslak">Taslak</option>
                  <option value="Yayında">Yayında</option>
                </select>

                <button
                  onClick={handleCopyToBlog}
                  className="px-3.5 py-2 bg-white dark:bg-[#0E1C4F] border border-[#CFC5B4] text-[#0E1C4F] dark:text-[#F3EFE8] hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Bloguna Kopyala
                </button>
              </div>
            </div>

            {/* Editorial Line-based body editor */}
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] uppercase tracking-wider block mb-2">
                Yazı Gövdesi (Edebi Paragraf satırları)
              </label>
              <SharedEditor
                key={activePost.id}
                initialValue={activePost.notes || ''}
                onSave={async (val) => {
                  await onUpdateItem({ ...activePost, notes: val });
                }}
                placeholder="Ada efsanelerini, Küçükçetmi anılarını satırlara dökün..."
                entities={entities}
                linkedEntityIds={activePost.links || []}
                onLinkEntity={async (entId) => {
                  const currentLinks = activePost.links || [];
                  if (!currentLinks.includes(entId)) {
                    await onUpdateItem({
                      ...activePost,
                      links: [...currentLinks, entId]
                    });
                  }
                }}
                onUnlinkEntity={async (entId) => {
                  const currentLinks = activePost.links || [];
                  await onUpdateItem({
                    ...activePost,
                    links: currentLinks.filter(id => id !== entId)
                  });
                }}
                onAddEntityProposal={async (name, type) => {
                  const proposalId = `duzada_proposal_${Date.now()}`;
                  let tags = ['kitap_oneri'];
                  let notes = `"${activePost.title}" yazısında geçen ve otomatik olarak önerilen yeni bir varlık.`;
                  if (type === 'kisi') {
                    tags.push('karakter');
                    notes = `"${activePost.title}" yazısında geçen ve otomatik olarak önerilen yeni bir karakter.`;
                  } else if (type === 'mekan') {
                    tags.push('mekan');
                    notes = `"${activePost.title}" yazısında geçen ve otomatik olarak önerilen yeni bir mekan.`;
                  } else if (type === 'marka') {
                    tags.push('marka');
                    notes = `"${activePost.title}" yazısında geçen ve otomatik olarak önerilen yeni bir marka.`;
                  }

                  await onAddItem({
                    id: proposalId,
                    title: name,
                    area: 'duzada',
                    type: type,
                    status: 'Fikir',
                    priority: 'orta',
                    tags: tags,
                    links: [activePost.id],
                    notes: notes,
                    images: [],
                    isProposal: true,
                    archived: false,
                    metadata: {}
                  } as any);

                  const currentLinks = activePost.links || [];
                  await onUpdateItem({
                    ...activePost,
                    links: [...currentLinks, proposalId]
                  });
                }}
                dismissedNames={activePost.metadata?.dismissedSuggestions || []}
                onDismissName={async (name) => {
                  const dismissed = activePost.metadata?.dismissedSuggestions || [];
                  if (!dismissed.includes(name)) {
                    await onUpdateItem({
                      ...activePost,
                      metadata: {
                        ...(activePost.metadata || {}),
                        dismissedSuggestions: [...dismissed, name]
                      }
                    });
                  }
                }}
              />
            </div>

            {/* Linked Entity chips */}
            <div className="pt-4 border-t border-[#CFC5B4]/50 space-y-2">
              <span className="block text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] tracking-wider">
                Yazıda Geçen Bağlı Varlıklar (Kancalar)
              </span>
              <div className="flex flex-wrap gap-2">
                {entities.filter(e => (activePost.links || []).includes(e.id)).map(e => (
                  <span 
                    key={e.id}
                    className="flex items-center gap-1.5 text-xs bg-[#0E1C4F] dark:bg-[#2C3C72] text-[#F3EFE8] px-2.5 py-1 rounded-full font-mono"
                  >
                    <Compass className="w-3 h-3" />
                    <span>{e.title}</span>
                    <button 
                      onClick={() => handleUnlinkEntity(e.id)}
                      className="hover:text-red-400 font-bold ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(activePost.links || []).length === 0 && (
                  <span className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Herhangi bir varlık kancalanmadı.</span>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT SIDE: AI Tools & linkage selection panel */}
          <div className="space-y-6">

            {/* Kanon: yazıda geçen maddeler ve tarih uyarıları (29 Eylül) */}
            <YazimPaneli metin={activePost.notes || ''} items={items} onMaddeAc={onMaddeAc} onAddItem={onAddItem} kaynakId={activePost.id} className="lg:sticky lg:top-4" />
            
            {/* Yapay zekâ işleri stüdyoda (29 Eylül akşamı) */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-2">
              <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Yapay zekâ</h4>
              <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] leading-relaxed">
                Devam et, başlık, ton ve lore bağı stüdyoda. Sonuç öneri tepsisine düşer; sen eklemeden yazıya girmez.
              </p>
              <StudyodaAc grup="yazi" hedefId={activePost.id} />
            </div>

            {/* Hook an entity to this post manual selector */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-3">
              <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                Varlık Kancası Ekle
              </h4>
              <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9]">
                Yazıyı Düzada'daki bir karakter, mekan veya olayla bağlayarak wikiye kancalayın.
              </p>
              
              <div className="flex gap-2">
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="flex-1 text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded p-2"
                >
                  <option value="">Varlık Seçin...</option>
                  {entities.filter(e => !(activePost.links || []).includes(e.id)).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({TYPE_LABELS[e.type as ItemType] || e.type})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLinkEntity}
                  disabled={!selectedEntityId}
                  className="px-3.5 py-1.5 bg-[#0E1C4F] dark:bg-[#F26B6F] text-white text-xs rounded-lg hover:opacity-90 cursor-pointer"
                >
                  Bağla
                </button>
              </div>

              {/* Dismissed list for un-dismissing in Blog */}
              {activePost.metadata?.dismissedSuggestions?.length > 0 && (
                <div className="pt-2.5 border-t border-[#CFC5B4]/40 space-y-1">
                  <span className="text-[10px] font-mono text-[#F26B6F] uppercase font-bold tracking-wider block">Yoksayılan Öneriler:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activePost.metadata.dismissedSuggestions.map((name: string) => (
                      <span 
                        key={name}
                        className="inline-flex items-center gap-1.5 text-[10px] bg-white dark:bg-stone-900 text-[#0E1C4F] dark:text-[#A6B0C9] border border-[#CFC5B4]/50 dark:border-stone-800 px-2 py-0.5 rounded-md shadow-3xs"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const dismissed = activePost.metadata?.dismissedSuggestions || [];
                            await onUpdateItem({
                              ...activePost,
                              metadata: {
                                ...activePost.metadata,
                                dismissedSuggestions: dismissed.filter((n: string) => n !== name)
                              }
                            });
                          }}
                          className="text-stone-500 dark:text-stone-400 hover:text-red-500 font-bold ml-1 transition-colors cursor-pointer text-xs"
                          title="Öneriyi Geri Al (Yoksaymayı Kaldır)"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Delete / Archive Post */}
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-between text-xs font-mono text-red-700 dark:text-red-400">
              <span>Yazıyı tamamen kaldırın</span>
              <button
                onClick={async () => {
                  await onDeleteItem(activePost.id);
                  onSelectItem(null);
                  setActiveTab('home');
                }}
                className="px-2.5 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Sil
              </button>
            </div>

          </div>

        </div>
      )}

      {/* SEND TO BOOK OVERLAY MODAL */}
      {showSendToBookModal && activePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#F6F1E7] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-6 rounded-2xl w-full max-w-md archive-shadow space-y-4 text-[#0E1C4F] dark:text-[#F3EFE8] relative mx-4 paper-grain">
            <h3 className="font-sans font-bold text-lg text-[#F26B6F] flex items-center gap-1.5 border-b border-[#CFC5B4]/50 pb-2.5 tracking-tight">
              <BookOpen className="w-5 h-5 text-[#F26B6F]" />
              <span>Yazıyı Kitaba Gönder</span>
            </h3>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1">
                  Hedef Kitap / Proje Seçin
                </label>
                <select
                  value={sendToBookSelectedBookId}
                  onChange={(e) => {
                    const bkId = e.target.value;
                    setSendToBookSelectedBookId(bkId);
                    const bookChapters = items.filter(i => i.area === 'kitap' && i.type === 'kitap_bolum' && !i.archived && (i.links || []).includes(bkId));
                    if (bookChapters.length > 0) {
                      setSendToBookSelectedChapterId(bookChapters[0].id);
                    } else {
                      setSendToBookSelectedChapterId('new');
                    }
                  }}
                  className="w-full text-xs bg-white dark:bg-[#17345A] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                >
                  {items.filter(i => i.area === 'kitap' && i.type === 'kitap_proje' && !i.archived).map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1">
                  Bölüm / Kısım Seçimi
                </label>
                <select
                  value={sendToBookSelectedChapterId}
                  onChange={(e) => setSendToBookSelectedChapterId(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-[#17345A] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                >
                  <option value="new">+ Yeni Bölüm Olarak Ekle</option>
                  {items.filter(i => i.area === 'kitap' && i.type === 'kitap_bolum' && !i.archived && (i.links || []).includes(sendToBookSelectedBookId)).map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              </div>

              {sendToBookSelectedChapterId === 'new' && (
                <div className="animate-in slide-in-from-top-1 duration-150">
                  <label className="block text-xs font-mono text-[#6A5E4C] dark:text-[#A6B0C9] mb-1">
                    Yeni Bölüm Başlığı
                  </label>
                  <input
                    type="text"
                    value={sendToBookNewChapterTitle}
                    onChange={(e) => setSendToBookNewChapterTitle(e.target.value)}
                    placeholder={activePost.title}
                    className="w-full text-xs bg-white dark:bg-[#17345A] border border-[#CFC5B4] rounded p-2 focus:outline-hidden"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#CFC5B4]/50 text-xs font-mono">
              <button
                type="button"
                onClick={() => setShowSendToBookModal(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-[#0E1C4F] rounded-lg transition-colors cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSendPostToBook}
                disabled={isSendingToBook}
                className="px-4 py-2 bg-[#F26B6F] hover:bg-[#B23A40] text-white rounded-lg transition-colors font-bold cursor-pointer"
              >
                {isSendingToBook ? "Gönderiliyor..." : "Kitaba Aktar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
