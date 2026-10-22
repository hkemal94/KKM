import { KitapIndir } from './KitapIndir';
import { YazimPaneli } from './wiki/YazimPaneli';
import { tuvaldeAc } from '../lib/tuval';
import { TYPE_LABELS } from './wiki/wikiSchema';
import React, { useState, useMemo } from 'react';
import { BeklemeliMetin } from './kabuk/BeklemeliMetin';
import { anilanKimlikler, buildLinkIndex } from './wiki/autoLink';
import { FileText, Trash2, Compass, ListTodo, RefreshCw } from 'lucide-react';
import { StudyodaAc } from './studyo/StudyodaAc';
import { Item, ItemType } from '../types';
import { getCachedAccessToken } from '../lib/firebase';
import { createGoogleDoc } from '../lib/googleApi';
import SharedEditor from './SharedEditor';
import { YaziEditorunuGonder } from './YaziEditorunuGonder';

interface KitapProps {
  items: Item[];
  activeItemId?: string | null;
  onSelectItem: (itemId: string | null) => void;
  onUpdateItem: (item: Item) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  /** Yazım panelinden maddeyi vikide açar (7. gece) */
  onMaddeAc?: (id: string) => void;
}

export default function Kitap({
  items,
  activeItemId,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onMaddeAc
}: KitapProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'bölüm_editör'>(
    () => (activeItemId && items.some(i => i.id === activeItemId && i.type === 'kitap_bolum') ? 'bölüm_editör' : 'home'));
  // Başka sayfadan bir bölüme basılınca bölümün kendisi açılsın (30 Eylül)
  React.useEffect(() => {
    if (activeItemId && items.some(i => i.id === activeItemId && i.type === 'kitap_bolum')) setActiveTab('bölüm_editör');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);
  
  // Selection and editing states
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCreateBook, setShowCreateBook] = useState(false);
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  
  // Manual TODO state
  const [newTodoText, setNewTodoText] = useState('');

  // AI responses

  // Connected entities selection
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Google Doc Export state
  const [isExportingDoc, setIsExportingDoc] = useState(false);

  const handleExportChapterToDoc = async () => {
    if (!activeChapter) return;
    const token = getCachedAccessToken();
    if (!token) {
      alert("Google Workspace bağlantısı aktif değil. Lütfen sol taraftaki 'Google Workspace' sekmesinden bağlantınızı kurun.");
      return;
    }
    
    setIsExportingDoc(true);
    try {
      await createGoogleDoc(activeChapter.title, activeChapter.notes || '');
      alert(`"${activeChapter.title}" başarıyla Google Dokümanı olarak aktarıldı! Google Drive klasörünüzde bulabilirsiniz.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Google Dokümanı oluşturulurken hata oluştu.");
    } finally {
      setIsExportingDoc(false);
    }
  };

  // Book and chapters selector
  const books = useMemo(() => items.filter(i => i.area === 'kitap' && i.type === 'kitap_proje' && !i.archived), [items]);
  const chapters = useMemo(() => items.filter(i => i.area === 'kitap' && i.type === 'kitap_bolum' && !i.archived), [items]);
  const entities = useMemo(() => items.filter(i => i.area === 'duzada' && !i.archived && !i.isProposal), [items]);
  const linkIndex = useMemo(() => buildLinkIndex(entities), [entities]);

  // Handle active chapter
  const activeChapter = useMemo(() => {
    if (!activeItemId) return null;
    return chapters.find(c => c.id === activeItemId) || null;
  }, [activeItemId, chapters]);

  // Compute mentioned or linked entities for the active chapter
  const mentionedOrLinkedIds = useMemo(() => {
    if (!activeChapter) return [];
    const links = activeChapter.links || [];
    const text = activeChapter.notes || '';
    const resultIds = new Set<string>(links);
    
    // Strip markdown-style bracket links [Name] or [Name](id)
    const strippedText = text.replace(/\[[^\]]+\](?:\([^)]+\))?/g, ' ');
    
    const dismissed = activeChapter.metadata?.dismissedSuggestions || [];
    const isDismissed = (name: string) => {
      return dismissed.some((dn: string) => dn.toLowerCase() === name.toLowerCase());
    };

    // Metinde tanıma (4. gece): başlık ve takma adlarla, viki bağlantı kurallarıyla
    for (const id of anilanKimlikler(strippedText + ' ' + text, linkIndex)) {
      const ent = entities.find(e => e.id === id);
      if (ent && (links.includes(ent.id) || !isDismissed(ent.title))) resultIds.add(ent.id);
    }
    return Array.from(resultIds);
  }, [activeChapter?.notes, activeChapter?.links, activeChapter?.metadata?.dismissedSuggestions, entities, linkIndex]);

  // If no book selected, select first book automatically
  React.useEffect(() => {
    if (!selectedBookId && books.length > 0) {
      setSelectedBookId(books[0].id);
    }
  }, [books, selectedBookId]);

  const activeBook = useMemo(() => {
    return books.find(b => b.id === selectedBookId) || null;
  }, [books, selectedBookId]);

  // Current active book's chapters
  const currentChapters = useMemo(() => {
    if (!selectedBookId) return [];
    return chapters
      .filter(ch => ch.metadata?.bookId === selectedBookId)
      .sort((a, b) => (a.metadata?.chapterIndex || 0) - (b.metadata?.chapterIndex || 0));
  }, [chapters, selectedBookId]);

  // % per chapter helper
  const getChapterPercent = (status: string) => {
    switch (status) {
      case 'düzeltildi': return 100;
      case 'yazıldı': return 70;
      case 'taslak': return 20;
      default: return 20;
    }
  };

  // Overall book % (average of chapters)
  const bookProgressPercent = useMemo(() => {
    if (currentChapters.length === 0) return 0;
    const sum = currentChapters.reduce((acc, ch) => acc + getChapterPercent(ch.status), 0);
    return Math.round(sum / currentChapters.length);
  }, [currentChapters]);

  // Create Book project
  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookTitle.trim()) return;

    const id = `book_${Date.now()}`;
    await onAddItem({
      title: newBookTitle,
      area: 'kitap',
      type: 'kitap_proje',
      status: 'Planlandı',
      priority: 'orta',
      tags: ['roman', 'kitap-projesi'],
      links: [],
      notes: 'Yeni kitap kurgusu notları...',
      images: [],
      isProposal: false,
      archived: false,
      metadata: {}
    });

    setNewBookTitle('');
    setShowCreateBook(false);
    setSelectedBookId(id);
  };

  // Create chapter
  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim() || !selectedBookId) return;

    const nextIndex = currentChapters.length + 1;
    const id = `chapter_${Date.now()}`;
    
    await onAddItem({
      title: `Bölüm ${nextIndex}: ${newChapterTitle}`,
      area: 'kitap',
      type: 'kitap_bolum',
      status: 'taslak',
      priority: 'orta',
      tags: ['bölüm', 'kitap-bölümü'],
      links: [selectedBookId],
      notes: 'Bölüm yazı satırları buraya gelecek...',
      images: [],
      isProposal: false,
      archived: false,
      metadata: {
        bookId: selectedBookId,
        chapterIndex: nextIndex,
        chapterTodos: []
      }
    });

    setNewChapterTitle('');
    setShowCreateChapter(false);
    onSelectItem(id);
    setActiveTab('bölüm_editör');
  };

  // Add Manual Chapter Todo Task
  const handleAddTodo = async () => {
    if (!activeChapter || !newTodoText.trim()) return;
    const currentTodos = activeChapter.metadata?.chapterTodos || [];
    
    await onUpdateItem({
      ...activeChapter,
      metadata: {
        ...activeChapter.metadata,
        chapterTodos: [...currentTodos, `[ ] ${newTodoText}`] // Custom checkbox representation
      }
    });

    setNewTodoText('');
  };

  const handleToggleTodo = async (idx: number) => {
    if (!activeChapter) return;
    const currentTodos = [...(activeChapter.metadata?.chapterTodos || [])];
    const todo = currentTodos[idx];
    
    if (todo.startsWith('[ ] ')) {
      currentTodos[idx] = todo.replace('[ ] ', '[x] ');
    } else {
      currentTodos[idx] = todo.replace('[x] ', '[ ] ');
    }

    await onUpdateItem({
      ...activeChapter,
      metadata: {
        ...activeChapter.metadata,
        chapterTodos: currentTodos
      }
    });
  };

  const handleDeleteTodo = async (idx: number) => {
    if (!activeChapter) return;
    const currentTodos = (activeChapter.metadata?.chapterTodos || []).filter((_, i) => i !== idx);

    await onUpdateItem({
      ...activeChapter,
      metadata: {
        ...activeChapter.metadata,
        chapterTodos: currentTodos
      }
    });
  };

  const handleLinkEntity = async () => {
    if (!activeChapter || !selectedEntityId) return;
    const currentLinks = activeChapter.links || [];
    if (currentLinks.includes(selectedEntityId)) return;

    const ent = entities.find(e => e.id === selectedEntityId);
    const dismissed = activeChapter.metadata?.dismissedSuggestions || [];
    const newDismissed = ent ? dismissed.filter((n: string) => n.toLowerCase() !== ent.title.toLowerCase()) : dismissed;

    await onUpdateItem({
      ...activeChapter,
      links: [...currentLinks, selectedEntityId],
      metadata: {
        ...(activeChapter.metadata || {}),
        dismissedSuggestions: newDismissed
      }
    });
    setSelectedEntityId('');
  };

  const handleUnlinkEntity = async (entityId: string) => {
    if (!activeChapter) return;
    const currentLinks = activeChapter.links || [];
    await onUpdateItem({
      ...activeChapter,
      links: currentLinks.filter(id => id !== entityId)
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Breadcrumb row */}
      {/* Görünüm düğmeleri (1 Ekim, K-2: başlık sayfa rayında; tutarlılık denetimi stüdyoda) */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('home'); onSelectItem(null); }}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${activeTab === 'home' ? 'bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8]' : 'bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
          >
            Kitap Rafı
          </button>
          {activeChapter && (
            <button
              onClick={() => setActiveTab('bölüm_editör')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${activeTab === 'bölüm_editör' ? 'bg-[#0E1C4F] dark:bg-[#F26B6F] text-[#F3EFE8]' : 'bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] text-[#6A5E4C] dark:text-[#A6B0C9]'}`}
            >
              Masaüstü Daktilo
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: HOME BOOKSHELF */}
      {activeTab === 'home' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/*
            Nereden başlasam (Paket 5, 29 Eylül). Kemal (yapısal 1. set, 8. tur):
            yazıyı durduran "nereden başlayacağını bilmemek, telefonda zor, vakit
            yok". Rafın en üstünde tek bir sonraki adım: kitap yoksa aç, bölüm
            yoksa ilk bölümü aç, varsa kaldığın bölüme dön.
          */}
          {(() => {
            const kitaplar = books.filter(b => !(b.tags || []).includes('oyun-tasarimi'));
            const bolumler = chapters.filter(c => !(c.tags || []).includes('oyun-tasarimi'));
            const son = [...bolumler].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            const kelime = (t: string) => (t || '').trim().split(/\s+/).filter(Boolean).length;
            const toplamKelime = bolumler.reduce((n, c) => n + kelime(c.notes), 0);
            const gun = son ? Math.floor((Date.now() - son.updatedAt) / 86_400_000) : 0;
            const kutu = 'rounded-2xl bg-[#0E1C4F] dark:bg-[#13204A] dark:border dark:border-[#2C3C72] text-[#F3EFE8] p-4 lg:p-5 flex flex-wrap items-center gap-4';
            const dugme = 'px-4 py-2.5 rounded-xl bg-[#F26B6F] text-white text-[13px] font-semibold hover:opacity-90 cursor-pointer';
            return (
              <div className={kutu}>
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#A6B0C9]">Nereden başlasam</div>
                  {!kitaplar.length ? (
                    <p className="mt-1 text-[15px] font-semibold">Henüz kitap yok. Önce kitabı aç; adını sen koyarsın.</p>
                  ) : !son ? (
                    <p className="mt-1 text-[15px] font-semibold">Kitap açık, bölüm yok. İlk bölümü aç — bir paragraf bile yeter.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-[15px] font-semibold">Kaldığın yer: {son.title}</p>
                      <p className="text-[12px] text-[#C9D0E3]">
                        {kelime(son.notes)} kelime · {gun === 0 ? 'bugün' : gun === 1 ? 'dün' : `${gun} gün önce`} dokundun · toplam {bolumler.length} bölüm, {toplamKelime} kelime
                      </p>
                    </>
                  )}
                </div>
                {!kitaplar.length ? (
                  <button type="button" onClick={() => setShowCreateBook(true)} className={dugme}>Kitabı aç</button>
                ) : !son ? (
                  <button type="button" onClick={() => { setSelectedBookId(kitaplar[0].id); setShowCreateChapter(true); }} className={dugme}>İlk bölümü aç</button>
                ) : (
                  <button type="button" onClick={() => { onSelectItem(son.id); setActiveTab('bölüm_editör'); }} className={dugme}>Devam et</button>
                )}
              </div>
            );
          })()}
          
          {/* Book selector panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#CFC5B4]/50">
            <div className="flex items-center gap-3">
              <label className="text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] shrink-0">
                Aktif Kitap:
              </label>
              <select
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="bg-[#F3EFE8] dark:bg-[#13204A] text-[#0E1C4F] dark:text-[#F3EFE8] text-sm border border-[#CFC5B4] dark:border-[#2C3C72] font-serif font-semibold rounded px-3 py-1.5 focus:outline-hidden"
              >
                {books.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateBook(true)}
                className="text-xs font-mono px-3 py-1.5 border border-[#CFC5B4] rounded-lg hover:bg-stone-50 cursor-pointer"
              >
                + Kitap Projesi Ekle
              </button>
              {activeBook && (
                <button
                  onClick={() => setShowCreateChapter(true)}
                  className="text-xs font-mono px-3 py-1.5 bg-[#F26B6F] text-white rounded-lg hover:bg-[#B23A40] cursor-pointer"
                >
                  + Yeni Bölüm Yaz
                </button>
              )}
            </div>
          </div>

          {/* Overlays for creations */}
          {showCreateBook && (
            <form onSubmit={handleCreateBook} className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl max-w-sm space-y-3 paper-grain">
              <h4 className="font-sans font-bold text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Yeni Kitap Projesi</h4>
              <input
                type="text"
                required
                placeholder="Roman adı..."
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
              />
              <div className="flex justify-end gap-2 text-xs font-mono">
                <button type="button" onClick={() => setShowCreateBook(false)} className="px-2 py-1 border rounded">Vazgeç</button>
                <button type="submit" className="px-3 py-1 bg-[#F26B6F] text-white rounded">Ekle</button>
              </div>
            </form>
          )}

          {showCreateChapter && (
            <form onSubmit={handleCreateChapter} className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl max-w-sm space-y-3 paper-grain">
              <h4 className="font-sans font-bold text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Yeni Bölüm Ekle</h4>
              <input
                type="text"
                required
                placeholder="Bölüm Adı..."
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                className="w-full text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] rounded p-2"
              />
              <div className="flex justify-end gap-2 text-xs font-mono">
                <button type="button" onClick={() => setShowCreateChapter(false)} className="px-2 py-1 border rounded">Vazgeç</button>
                <button type="submit" className="px-3 py-1 bg-[#F26B6F] text-white rounded">Ekle</button>
              </div>
            </form>
          )}

          {/* Active Book Progress and Chapters Grid */}
          {activeBook ? (
            <div className="space-y-6">
              
              {/* Overall Book progress */}
              <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] p-5 rounded-xl paper-grain archive-shadow space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans font-bold text-lg text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                        {activeBook.title}
                      </h3>
                      <button type="button" onClick={() => tuvaldeAc(activeBook.id)} title="Kitap planı (Atölye → Tuval)"
                        className="text-[11px] font-mono underline underline-offset-2 decoration-[#0E1C4F]/30 text-[#6A5E4C] dark:text-[#A6B0C9] hover:text-[#F26B6F] cursor-pointer">
                        kitap planı · tuvalde aç
                      </button>
                      <KitapIndir kitap={activeBook} bolumler={currentChapters} onUpdateItem={onUpdateItem} />
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (deleteConfirmId === activeBook.id) {
                            // Delete chapters
                            for (const ch of currentChapters) {
                              await onDeleteItem(ch.id);
                            }
                            await onDeleteItem(activeBook.id);
                            setSelectedBookId('');
                            setDeleteConfirmId(null);
                          } else {
                            setDeleteConfirmId(activeBook.id);
                            setTimeout(() => setDeleteConfirmId(prev => prev === activeBook.id ? null : prev), 4000);
                          }
                        }}
                        className={`p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-mono ${
                          deleteConfirmId === activeBook.id
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'text-stone-500 dark:text-stone-400 hover:text-red-600 hover:bg-stone-100 dark:hover:bg-red-950/45'
                        }`}
                        title="Kitap Projesini Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleteConfirmId === activeBook.id && 'Kataloğu Sil?'}
                      </button>
                    </div>
                    <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] mt-0.5">{activeBook.notes}</p>
                  </div>
                  <span className="text-base font-bold font-mono text-[#F26B6F]">%{bookProgressPercent}</span>
                </div>
                
                <div className="w-full bg-[#CFC5B4]/30 dark:bg-[#2C3C72] h-2 rounded-full overflow-hidden">
                  <div className="bg-[#F26B6F] h-full" style={{ width: `${bookProgressPercent}%` }} />
                </div>
              </div>

              {/* Chapters list */}
              <div className="space-y-3">
                <h4 className="text-xs font-mono uppercase text-[#6A5E4C] tracking-wider">
                  BÖLÜM TASLAKLARI ({currentChapters.length})
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentChapters.map(ch => {
                    const percent = getChapterPercent(ch.status);
                    return (
                      <div 
                        key={ch.id}
                        onClick={() => { onSelectItem(ch.id); setActiveTab('bölüm_editör'); }}
                        className="p-4 bg-[#F6F1E7] dark:bg-[#13204A]/55 border border-[#CFC5B4] hover:border-[#F26B6F] rounded-xl cursor-pointer transition-all space-y-3 paper-grain archive-shadow group/chapter"
                      >
                        <div className="flex justify-between items-start">
                          <h5 className="font-serif font-bold text-[#0E1C4F] dark:text-[#F3EFE8] text-sm hover:text-[#F26B6F] flex-1 min-w-0 pr-2">
                            {ch.title}
                          </h5>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-mono capitalize px-1.5 py-0.5 rounded bg-stone-200 dark:bg-[#17345A] text-stone-700 dark:text-stone-300">
                              {ch.status}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (deleteConfirmId === ch.id) {
                                  onDeleteItem(ch.id);
                                  setDeleteConfirmId(null);
                                } else {
                                  setDeleteConfirmId(ch.id);
                                  setTimeout(() => setDeleteConfirmId(prev => prev === ch.id ? null : prev), 4000);
                                }
                              }}
                              className={`p-1 rounded transition-colors flex items-center gap-1 text-[9px] font-mono ${
                                deleteConfirmId === ch.id
                                  ? 'bg-red-600 text-white animate-pulse'
                                  : 'text-stone-500 dark:text-stone-400 hover:text-red-600 hover:bg-stone-100 dark:hover:bg-red-950/40'
                              }`}
                              title="Bölümü Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {deleteConfirmId === ch.id && 'Sil?'}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] line-clamp-2 italic leading-relaxed">
                          {ch.notes || "Henüz satırlar yazılmadı..."}
                        </p>

                        <div className="space-y-1.5 pt-2 border-t border-[#CFC5B4]/30">
                          <div className="flex justify-between items-center text-[9px] font-mono text-[#6A5E4C] dark:text-[#A6B0C9]">
                            <span>Yazım İlerlemesi</span>
                            <span>%{percent}</span>
                          </div>
                          <div className="w-full bg-[#CFC5B4]/30 dark:bg-[#2C3C72] h-1 rounded-full overflow-hidden">
                            <div className="bg-[#BBA591] h-full" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {currentChapters.length === 0 && (
                    <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] italic">Kitaba bağlı henüz bölüm yazılmadı.</p>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="py-20 text-center text-[#6A5E4C] dark:text-[#A6B0C9] italic">
              Lütfen sol panelden bir kitap projesi seçin veya yeni bir proje ekleyerek yazar masasını başlatın.
            </div>
          )}

        </div>
      )}

      {/* VIEW 2: MASAÜSTÜ DAKTİLO (Story writer workspace) */}
      {activeTab === 'bölüm_editör' && activeChapter && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in-95 duration-200">
          
          {/* LEFT: Massive editorial letter on paper */}
          <div className="lg:col-span-2 bg-[#F6F1E7] dark:bg-[#13204A] border-2 border-[#CFC5B4] dark:border-[#2C3C72] rounded-xl p-6 md:p-10 paper-grain archive-shadow space-y-6 flex flex-col min-h-[600px]">
            
            {/* Header edit info */}
            <div className="flex flex-col 2xl:flex-row 2xl:items-start justify-between gap-4 pb-4 border-b border-[#CFC5B4]/50">
              <div className="space-y-1 flex-1 min-w-0">
                <span className="text-xs font-mono uppercase text-[#F26B6F] font-bold">
                  BÖLÜM YAZIM MASASI
                </span>
                
                <BeklemeliMetin
                  cokSatir
                  rows={2}
                  deger={activeChapter.title}
                  onKaydet={t => onUpdateItem({ ...activeChapter, title: t })}
                  className="font-serif font-bold text-xl md:text-2xl text-[#0E1C4F] dark:text-[#F3EFE8] italic bg-transparent focus:outline-hidden border-b border-transparent focus:border-[#CFC5B4] w-full resize-none leading-tight py-1 overflow-hidden"
                  placeholder="Bölüm Başlığı"
                />
              </div>

              {/* Status Chapter selector */}
              <div className="shrink-0 flex items-center gap-2 font-mono flex-wrap">
                <YaziEditorunuGonder yazi={activeChapter} onUpdateItem={onUpdateItem} />

                <button
                  type="button"
                  onClick={handleExportChapterToDoc}
                  disabled={isExportingDoc}
                  className="px-3 py-1.5 bg-[#FAF7F2] hover:bg-[#FAF6EE] dark:bg-stone-900 border border-[#CFC5B4] dark:border-stone-850 text-stone-700 dark:text-[#A6B0C9] hover:text-[#F26B6F] text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Google Dokümanı Olarak Dışa Aktar"
                >
                  {isExportingDoc ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>Docs'a Aktar</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const nextStatus = activeChapter.status === 'Yayında' ? 'taslak' : 'Yayında';
                    await onUpdateItem({ ...activeChapter, status: nextStatus });
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    activeChapter.status === 'Yayında'
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-500'
                      : 'bg-[#F26B6F] hover:bg-[#b04046] text-white border border-[#c43b42] animate-pulse'
                  }`}
                  title={activeChapter.status === 'Yayında' ? "Bölümü taslak durumuna geri çek" : "Bölümü evrene bağla ve Düzada'da yayınla!"}
                >
                  {activeChapter.status === 'Yayında' ? '✨ Evrene Bağlandı (Yayında)' : '📖 Evrene Yayınla'}
                </button>

                <select
                  value={activeChapter.status}
                  onChange={async (e) => await onUpdateItem({ ...activeChapter, status: e.target.value })}
                  className="bg-white dark:bg-[#17345A] text-xs border border-[#CFC5B4] dark:border-[#2C3C72] rounded p-1.5 focus:outline-hidden text-[#0E1C4F] dark:text-[#F3EFE8] font-bold"
                >
                  <option value="taslak">Taslak</option>
                  <option value="yazıldı">Yazıldı</option>
                  <option value="düzeltildi">Düzeltildi</option>
                  <option value="Yayında">Yayında (Evrene Bağla)</option>
                </select>
              </div>
            </div>

            {/* Editor Text area */}
            <div className="flex-1 flex flex-col">
              <SharedEditor
                key={activeChapter.id}
                initialValue={activeChapter.notes || ''}
                onSave={async (val) => {
                  await onUpdateItem({ ...activeChapter, notes: val });
                }}
                placeholder="Can, Küçükçetmi köyünün ulu çınarına doğru ağır adımlarla yaklaşıyordu..."
                entities={entities}
                linkedEntityIds={activeChapter.links || []}
                onLinkEntity={async (entId) => {
                  const currentLinks = activeChapter.links || [];
                  if (!currentLinks.includes(entId)) {
                    await onUpdateItem({
                      ...activeChapter,
                      links: [...currentLinks, entId]
                    });
                  }
                }}
                onUnlinkEntity={async (entId) => {
                  const currentLinks = activeChapter.links || [];
                  await onUpdateItem({
                    ...activeChapter,
                    links: currentLinks.filter(id => id !== entId)
                  });
                }}
                onAddEntityProposal={async (name, type) => {
                  const proposalId = `duzada_proposal_${Date.now()}`;
                  let tags = ['kitap_oneri'];
                  let notes = `"${activeChapter.title}" bölümünde geçen ve otomatik olarak önerilen yeni bir varlık.`;
                  if (type === 'kisi') {
                    tags.push('karakter');
                    notes = `"${activeChapter.title}" bölümünde geçen ve otomatik olarak önerilen yeni bir karakter.`;
                  } else if (type === 'mekan') {
                    tags.push('mekan');
                    notes = `"${activeChapter.title}" bölümünde geçen ve otomatik olarak önerilen yeni bir mekan.`;
                  } else if (type === 'marka') {
                    tags.push('marka');
                    notes = `"${activeChapter.title}" bölümünde geçen ve otomatik olarak önerilen yeni bir marka.`;
                  }

                  await onAddItem({
                    id: proposalId,
                    title: name,
                    area: 'duzada',
                    type: type,
                    status: 'Fikir',
                    priority: 'orta',
                    tags: tags,
                    links: [activeChapter.id],
                    notes: notes,
                    images: [],
                    isProposal: true,
                    archived: false,
                    metadata: {}
                  } as any);

                  const currentLinks = activeChapter.links || [];
                  await onUpdateItem({
                    ...activeChapter,
                    links: [...currentLinks, proposalId]
                  });
                }}
                dismissedNames={activeChapter.metadata?.dismissedSuggestions || []}
                onDismissName={async (name) => {
                  const dismissed = activeChapter.metadata?.dismissedSuggestions || [];
                  if (!dismissed.includes(name)) {
                    await onUpdateItem({
                      ...activeChapter,
                      metadata: {
                        ...(activeChapter.metadata || {}),
                        dismissedSuggestions: [...dismissed, name]
                      }
                    });
                  }
                }}
              />
            </div>

            {/* Auto list of entities appearing in this chapter */}
            <div className="pt-4 border-t border-[#CFC5B4]/50 space-y-2">
              <span className="block text-xs font-mono uppercase text-[#6A5E4C] dark:text-[#A6B0C9] tracking-wider">
                Bu bölümde geçenler (Varlık Kancaları)
              </span>
              <div className="flex flex-wrap gap-2">
                {entities.filter(e => mentionedOrLinkedIds.includes(e.id)).map(e => {
                  const isExplicitlyLinked = (activeChapter.links || []).includes(e.id);
                  return (
                    <span 
                      key={e.id}
                      onClick={() => onSelectItem(e.id)}
                      className={`group flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-mono cursor-pointer transition-all duration-200 border ${
                        isExplicitlyLinked 
                          ? 'bg-[#0E1C4F] text-white border-transparent hover:bg-[#F26B6F]' 
                          : 'bg-white hover:bg-[#F3EFE8] dark:bg-stone-900 dark:hover:bg-[#0E1C4F] text-stone-700 dark:text-[#A6B0C9] border-[#CFC5B4] hover:border-[#F26B6F]'
                      }`}
                      title={isExplicitlyLinked ? "Varlık sayfasına gitmek için tıklayın (Doğrudan kancalanmış)" : "Metinde tespit edildi. Kancalamak veya detayını görmek için tıklayın."}
                    >
                      <Compass className="w-3 h-3 text-[#F26B6F] group-hover:animate-spin" />
                      <span>{e.title}</span>
                      <span className="text-[9px] opacity-75">
                        ({TYPE_LABELS[e.type as ItemType] || e.type})
                      </span>
                      {isExplicitlyLinked ? (
                        <button 
                          onClick={(evt) => {
                            evt.stopPropagation();
                            handleUnlinkEntity(e.id);
                          }}
                          className="hover:text-red-300 font-bold ml-1 text-xs"
                          title="Bağlantıyı Kaldır"
                        >
                          ×
                        </button>
                      ) : (
                        <button
                          onClick={async (event) => {
                            event.stopPropagation();
                            const currentLinks = activeChapter.links || [];
                            if (!currentLinks.includes(e.id)) {
                              await onUpdateItem({
                                ...activeChapter,
                                links: [...currentLinks, e.id]
                              });
                            }
                          }}
                          className="hover:text-[#F26B6F] font-mono text-[9px] border border-[#CFC5B4] px-1 rounded hover:bg-[#0E1C4F] dark:bg-[#2C3C72] hover:text-white ml-1 transition-all font-bold"
                          title="Resmi olarak bölüme kancala"
                        >
                          + Kancala
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RIGHT PANEL: Manual Todos & AI checkouts */}
          <div className="space-y-6">

            {/* Kanon: bölümde geçen maddeler ve tarih uyarıları (29 Eylül) */}
            <YazimPaneli metin={activeChapter.notes || ''} items={items} onMaddeAc={onMaddeAc} onAddItem={onAddItem} kaynakId={activeChapter.id} />
            
            {/* MANUAL TODOS - Kalan işler */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl paper-grain space-y-4">
              <div className="flex items-center gap-2 border-b border-[#CFC5B4]/50 pb-2">
                <ListTodo className="w-5 h-5 text-[#F26B6F]" />
                <h4 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                  Kalan İşler / Yapılacaklar
                </h4>
              </div>

              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {(activeChapter.metadata?.chapterTodos || []).map((todo, idx) => {
                  const isChecked = todo.startsWith('[x] ');
                  const text = todo.replace('[ ] ', '').replace('[x] ', '');
                  
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs p-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTodo(idx)}
                          className="rounded border-[#CFC5B4] text-[#F26B6F] focus:ring-[#F26B6F]"
                        />
                        <span className={`text-stone-700 ${isChecked ? 'line-through opacity-55' : ''}`}>
                          {text}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteTodo(idx)} className="text-red-500 hover:underline">
                        Sil
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="Görev satırı..."
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  className="flex-1 text-xs bg-white border border-[#CFC5B4] rounded p-1.5"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); }}
                />
                <button
                  onClick={handleAddTodo}
                  className="px-3 bg-[#0E1C4F] dark:bg-[#2C3C72] text-white text-xs rounded hover:opacity-90"
                >
                  Ekle
                </button>
              </div>
            </div>

            {/* Yapay zekâ işleri stüdyoda (29 Eylül akşamı) */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-2">
              <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">Yapay zekâ</h4>
              <p className="text-xs text-[#6A5E4C] dark:text-[#A6B0C9] leading-relaxed">
                Bölüm özeti, sonraki bölüm için fikir, devam et ve tutarlılık kontrolü stüdyoda.
              </p>
              <StudyodaAc grup="yazi" hedefId={activeChapter.id} />
            </div>

            {/* Link varlık kancası */}
            <div className="bg-[#F3EFE8] dark:bg-[#13204A] border border-[#CFC5B4] dark:border-[#2C3C72] p-5 rounded-xl space-y-3 w-full overflow-hidden box-border">
              <h4 className="font-sans font-bold text-sm text-[#0E1C4F] dark:text-[#F3EFE8] truncate tracking-tight">
                Bölüme Karakter/Yer Kancala
              </h4>
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="flex-1 text-xs bg-white dark:bg-[#17345A] text-[#0E1C4F] dark:text-[#F3EFE8] border border-[#CFC5B4] dark:border-[#2C3C72] rounded p-2 min-w-0 max-w-full truncate"
                >
                  <option value="">Varlık Seçin...</option>
                  {entities.filter(e => !(activeChapter.links || []).includes(e.id)).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({TYPE_LABELS[e.type as ItemType] || e.type})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLinkEntity}
                  disabled={!selectedEntityId}
                  className="px-3.5 py-2 bg-[#0E1C4F] hover:bg-slate-800 dark:bg-[#F26B6F] dark:hover:bg-[#b04046] text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shrink-0"
                >
                  Kancala
                </button>
              </div>

              {/* Dismissed list for un-dismissing */}
              {activeChapter.metadata?.dismissedSuggestions?.length > 0 && (
                <div className="pt-2.5 border-t border-[#CFC5B4]/40 space-y-1">
                  <span className="text-[10px] font-mono text-[#F26B6F] uppercase font-bold tracking-wider block">Yoksayılan Öneriler:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeChapter.metadata.dismissedSuggestions.map((name: string) => (
                      <span 
                        key={name}
                        className="inline-flex items-center gap-1.5 text-[10px] bg-white dark:bg-stone-900 text-[#0E1C4F] dark:text-[#A6B0C9] border border-[#CFC5B4]/50 dark:border-stone-800 px-2 py-0.5 rounded-md shadow-3xs"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const dismissed = activeChapter.metadata?.dismissedSuggestions || [];
                            await onUpdateItem({
                              ...activeChapter,
                              metadata: {
                                ...activeChapter.metadata,
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

          </div>

        </div>
      )}

    </div>
  );
}
