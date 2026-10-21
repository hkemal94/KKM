import { TYPE_LABELS } from './wiki/wikiSchema';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { takmaAdlar } from '../lib/alanSablonu';
import { 
  Bold, Italic, Heading2, Quote, Sparkles, Check, 
  Link, X, Maximize2, Minimize2 
} from 'lucide-react';
import { Item, ItemType } from '../types';

interface SharedEditorProps {
  key?: string;
  initialValue: string;
  onSave: (val: string) => Promise<void>;
  placeholder?: string;
  entities: Item[];
  linkedEntityIds?: string[];
  onLinkEntity: (entityId: string) => void;
  onUnlinkEntity: (entityId: string) => void;
  onAddEntityProposal: (name: string, type: 'kisi' | 'mekan' | 'marka') => Promise<void>;
  dismissedNames?: string[];
  onDismissName?: (name: string) => Promise<void>;
}

export default function SharedEditor({
  initialValue,
  onSave,
  placeholder = 'Yazmaya başlayın...',
  entities,
  linkedEntityIds = [],
  onLinkEntity,
  onUnlinkEntity,
  onAddEntityProposal,
  dismissedNames = [],
  onDismissName
}: SharedEditorProps) {
  const [localText, setLocalText] = useState(initialValue);
  const [isSaved, setIsSaved] = useState(true);
  // Kayıt sunucuya ulaşmazsa "Yazılıyor..."da takılı kalmasın (12 Ekim)
  const [kayitHatasi, setKayitHatasi] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [streak, setStreak] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track initial word count of session to show session gains
  const initialWordCount = useRef(initialValue.trim().split(/\s+/).filter(Boolean).length);
  const hasChanged = useRef(false);

  useEffect(() => {
    // Read writing streak from localStorage
    const savedStreak = localStorage.getItem('duzada_writing_streak_count');
    if (savedStreak) {
      setStreak(parseInt(savedStreak, 10));
    }
  }, []);

  const updateStreak = () => {
    const todayStr = new Date().toDateString();
    const lastDateStr = localStorage.getItem('duzada_writing_streak_last_date');
    const savedStreak = localStorage.getItem('duzada_writing_streak_count');
    
    let currentStreak = savedStreak ? parseInt(savedStreak, 10) : 0;
    
    if (lastDateStr === todayStr) {
      return;
    }
    
    if (lastDateStr) {
      const lastDate = new Date(lastDateStr);
      const today = new Date(todayStr);
      const diffTime = Math.abs(today.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    
    localStorage.setItem('duzada_writing_streak_count', currentStreak.toString());
    localStorage.setItem('duzada_writing_streak_last_date', todayStr);
    setStreak(currentStreak);
  };

  // Mark text as changed once the user types
  useEffect(() => {
    if (localText !== initialValue) {
      hasChanged.current = true;
    }
  }, [localText, initialValue]);

  // Debounced Autosave
  useEffect(() => {
    if (!hasChanged.current) return;

    setIsSaved(false);
    setKayitHatasi(false);
    const delayDebounce = setTimeout(async () => {
      try {
        await onSave(localText);
        setIsSaved(true);
        updateStreak();
      } catch (err) {
        console.error("Autosave error:", err);
        setKayitHatasi(true);
      }
    }, 1200); // 1.2 second debounce delay

    return () => clearTimeout(delayDebounce);
  }, [localText, onSave]);

  // Live Counts
  const wordCount = useMemo(() => {
    return localText.trim().split(/\s+/).filter(Boolean).length;
  }, [localText]);

  const charCount = localText.length;

  const sessionWords = useMemo(() => {
    const diff = wordCount - initialWordCount.current;
    return diff > 0 ? diff : 0;
  }, [wordCount]);

  // Markdown Selection Helper
  const applyFormat = (format: 'bold' | 'italic' | 'heading' | 'quote') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = '';
    let selectionOffset = 0;
    let selectionLength = 0;

    switch (format) {
      case 'bold':
        replacement = `**${selected || 'kalın'}**`;
        selectionOffset = 2;
        selectionLength = selected ? selected.length : 5;
        break;
      case 'italic':
        replacement = `*${selected || 'eğik'}*`;
        selectionOffset = 1;
        selectionLength = selected ? selected.length : 4;
        break;
      case 'heading':
        replacement = `\n\n## ${selected || 'Başlık'}\n`;
        selectionOffset = 4;
        selectionLength = selected ? selected.length : 6;
        break;
      case 'quote':
        replacement = `\n> ${selected || 'Alıntı'}\n`;
        selectionOffset = 4;
        selectionLength = selected ? selected.length : 6;
        break;
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setLocalText(newValue);
    setIsSaved(false);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + selectionOffset, start + selectionOffset + selectionLength);
    }, 50);
  };

  // Capitalized Name Extraction Regex for Entity Detection
  const extractCapitalizedNames = (text: string) => {
    // Strip markdown-style bracketed links first to avoid matching words that are already connected or proposed
    const strippedText = text.replace(/\[[^\]]+\](?:\([^)]+\))?/g, ' ');
    const regex = /\b([A-ZÇĞİÖŞÜ\u00C0-\u00DC][a-zçğıöşü\u00E0-\u00FCa-zA-Z]*(?:\s+[A-ZÇĞİÖŞÜ\u00C0-\u00DC][a-zçğıöşü\u00E0-\u00FCa-zA-Z]*){0,3})\b/g;
    const matches: string[] = [];
    let match;

    const stopWords = [
      'Zira', 'Çünkü', 'Hatta', 'Oysa', 'Halbuki', 'Madem', 'Meğer', 'Kendi', 
      'Böyle', 'Şöyle', 'Böylece', 'Gibi', 'İçin', 'Göre', 'Kadar', 'Beri', 
      'Önce', 'Sonra', 'Karşı', 'Doğru', 'Düzada', 'Imperial', 'The', 'Otel', 
      'Kat', 'Oda', 'Sarı', 'Mavi', 'Yeşil', 'Yeni', 'Ekim', 'Mesela', 'Ada',
      'Her', 'Sonraki', 'Bir', 'Bu', 'O', 'Şu', 'Herkes', 'Kimse', 'Biri', 
      'Bazı', 'Tüm', 'Bütün', 'Şimdi', 'Daha', 'En', 'Çok', 'Az', 'Hep', 
      'Hiç', 'Asla', 'Yine', 'Eski', 'Büyük', 'Küçük', 'Olan', 'Olarak',
      'Veya', 'Ve', 'Ama', 'Fakat', 'Lakin', 'Ancak', 'Yalnız', 'Oysaki',
      'Belki', 'Sanki', 'Güzel', 'Kötü', 'Uzun', 'Kısa', 'Genç', 'Yaşlı',
      'Zengin', 'Fakir', 'Sıcak', 'Soğuk', 'İlk', 'Son', 'Yavaş', 'Hızlı',
      'Zor', 'Kolay', 'Aynı', 'Farklı', 'Başka', 'Diğer', 'Bugün',
      'Yarın', 'Dün', 'Sabah', 'Akşam', 'Gece', 'Gündüz', 'Hafta', 'Ay', 'Yıl',
      'Yani', 'Ayrıca', 'Üstelik', 'Özellikle', 'Genelde', 'Sadece', 'Tek', 'Çoktan',
      'Neden', 'Nasıl', 'Hangi', 'Kim', 'Ne', 'Nerede', 'Nereden', 'Nereye'
    ];

    while ((match = regex.exec(strippedText)) !== null) {
      const name = match[1].trim();
      const words = name.split(/\s+/);
      
      // Per Rule 3: Only suggest multi-word proper names for new proposals!
      // (Single words are ignored unless they exact-match an existing entity, which is handled separately)
      if (words.length < 2) continue;

      const firstWord = words[0];
      const hasStopWord = words.some(w => stopWords.includes(w)) || stopWords.includes(firstWord);

      if (!hasStopWord && name.length > 2 && !matches.includes(name)) {
        matches.push(name);
      }
    }
    return matches;
  };

  // Real-time suggestions state
  const [suggestions, setSuggestions] = useState<Array<{ name: string; entity?: Item; type: 'link' | 'propose' }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!localText) {
        setSuggestions([]);
        return;
      }

      const isDismissed = (name: string) => {
        return (dismissedNames || []).some(dn => dn.toLowerCase() === name.toLowerCase());
      };

      const newSuggestions: typeof suggestions = [];

      // Step 1: MATCH FIRST against existing entities (Kişi, Mekan, Marka) by name.
      const strippedText = localText.replace(/\[[^\]]+\](?:\([^)]+\))?/g, ' ');
      
      // Sort entities by title length desc to match longer names (like "The Imperial Kemsköy") before shorter ones (like "Imperial")
      const sortedEnts = [...entities]
        .filter(e => !e.isProposal)
        .sort((a, b) => b.title.length - a.title.length);

      sortedEnts.forEach(ent => {
        const isLinked = linkedEntityIds.includes(ent.id);
        if (isLinked) return;
        if (isDismissed(ent.title)) return;

        // Başlık ve takma adlar (4. gece, metinde tanıma)
        const adlar = [ent.title, ...takmaAdlar(ent)].map(a => a.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        const regex = new RegExp(`(?<![\\wğüşıöçĞÜŞİÖÇ])(?:${adlar.join('|')})(?![\\wğüşıöçĞÜŞİÖÇ])`, 'gi');

        if (regex.test(strippedText) || localText.includes(`[${ent.title}]`)) {
          regex.lastIndex = 0;
          const originalMatch = localText.match(regex);
          const nameInText = originalMatch ? originalMatch[0] : ent.title;
          
          if (isDismissed(nameInText)) return;

          if (!newSuggestions.some(s => s.entity?.id === ent.id)) {
            newSuggestions.push({ name: nameInText, entity: ent, type: 'link' });
          }
        }
      });

      // Step 2: Extract other capitalized names (proposals)
      const names = extractCapitalizedNames(localText);
      names.forEach(name => {
        if (isDismissed(name)) return;
        // Skip if it matches any entity we already suggested as a link, or any already created entity
        const isAlreadyEntity = entities.some(e => e.title.toLowerCase() === name.toLowerCase());
        const isAlreadySuggested = newSuggestions.some(s => s.name.toLowerCase() === name.toLowerCase());
        
        if (!isAlreadyEntity && !isAlreadySuggested) {
          newSuggestions.push({ name, type: 'propose' });
        }
      });

      // Keep max 3 suggestions to maintain UI elegance
      setSuggestions(newSuggestions.slice(0, 3));
    }, 700);

    return () => clearTimeout(timer);
  }, [localText, entities, linkedEntityIds, dismissedNames]);

  // Apply Link Replacement in Text
  const handleConnectLink = (name: string, entityId: string, title: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
    const updatedText = localText.replace(regex, `[${title}]`);
    setLocalText(updatedText);
    onLinkEntity(entityId);
    
    // Remove the handled suggestion
    setSuggestions(prev => prev.filter(s => s.name !== name));
  };

  // Handle Proposing New Entity
  const handleConnectProposal = async (name: string, type: 'kisi' | 'mekan' | 'marka') => {
    const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
    const updatedText = localText.replace(regex, `[${name}]`);
    setLocalText(updatedText);
    await onAddEntityProposal(name, type);
    
    // Remove the handled suggestion
    setSuggestions(prev => prev.filter(s => s.name !== name));
  };

  // Handle Dismissing Proposal or Link suggestion
  const handleDismissSuggestion = async (name: string) => {
    setSuggestions(prev => prev.filter(s => s.name.toLowerCase() !== name.toLowerCase() && s.entity?.title.toLowerCase() !== name.toLowerCase()));
    if (onDismissName) {
      await onDismissName(name);
    }
  };

  return (
    <div className={`flex flex-col flex-1 transition-all duration-300 ${focusMode ? 'fixed inset-0 z-50 bg-[#FAF7F2] dark:bg-[#0E1726] p-4 md:p-12 paper-grain overflow-y-auto' : 'space-y-4'}`}>
      
      {/* Editor Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#CFC5B4]/50 dark:border-stone-800">
        
        {/* Formatting Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyFormat('bold')}
            className="p-1.5 hover:bg-[#FAF6EE] dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300 transition-colors"
            title="Kalın (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('italic')}
            className="p-1.5 hover:bg-[#FAF6EE] dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300 transition-colors"
            title="Eğik (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('heading')}
            className="p-1.5 hover:bg-[#FAF6EE] dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300 transition-colors"
            title="Büyük Başlık"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('quote')}
            className="p-1.5 hover:bg-[#FAF6EE] dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300 transition-colors"
            title="Alıntı Kutusu"
          >
            <Quote className="w-4 h-4" />
          </button>

          <span className="w-px h-4 bg-[#CFC5B4]/50 mx-1" />

          {/* Distraction-Free Focus Toggle */}
          <button
            type="button"
            onClick={() => setFocusMode(!focusMode)}
            className={`p-1.5 rounded transition-all flex items-center gap-1.5 text-xs font-mono font-bold ${focusMode ? 'bg-[#F26B6F] text-white' : 'bg-[#0E1C4F]/5 hover:bg-[#0E1C4F]/10 text-[#0E1C4F] dark:text-[#A6B0C9]'}`}
            title="Odak / Dikkat Dağıtmayan Mod"
          >
            {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{focusMode ? 'Odaktan Çık' : 'Odak Modu'}</span>
          </button>
        </div>

        {/* Live Autosave & Session Status Indicator */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {sessionWords > 0 && (
            <span className="text-[#3E8E5E] font-bold animate-pulse">
              +{sessionWords} kelime (oturum)
            </span>
          )}

          <div className="flex items-center gap-1.5 bg-white/40 dark:bg-stone-900/40 px-2.5 py-1 rounded-full border border-[#CFC5B4]/30">
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#3E8E5E]" />
                <span className="text-[#3E8E5E] text-[10px] font-bold uppercase tracking-wider">Kaydedildi</span>
              </>
            ) : kayitHatasi ? (
              <span className="text-[#B23A40] dark:text-[#F26B6F] text-[10px] font-bold uppercase tracking-wider">Kaydedilemedi</span>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">Yazılıyor...</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Inline Entity Detector Prompts */}
      {suggestions.length > 0 && (
        <div className="bg-[#FFFDF9] dark:bg-stone-900/80 border border-amber-200 dark:border-amber-950/40 p-2.5 rounded-lg flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#F26B6F]" />
            <span className="text-[10px] font-mono text-amber-800 dark:text-amber-300 uppercase font-bold tracking-wider">Kurgu Kancaları ve Bağlantı Önerileri</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, idx) => (
              <div 
                key={idx}
                className="flex flex-wrap items-center gap-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-3 py-1.5 rounded-md shadow-2xs text-xs"
              >
                {s.type === 'link' ? (
                  <>
                    <span className="text-stone-700 dark:text-stone-300">
                      Metindeki <strong className="text-[#0E1C4F] dark:text-[#F3EFE8]">{s.name}</strong> ismini <strong className="text-[#F26B6F]">{s.entity?.title} ({(s.entity && (TYPE_LABELS[s.entity.type as ItemType] || s.entity.type))})</strong> ile bağla?
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConnectLink(s.name, s.entity!.id, s.entity!.title)}
                      className="px-2 py-1 bg-[#F26B6F] hover:bg-[#b04046] text-white text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Link className="w-3 h-3" /> 🔗 Bağla
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissSuggestion(s.entity?.title || s.name)}
                      className="px-2 py-1 border border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:text-red-500 hover:border-red-200 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                      title="Bu öneriyi bir daha gösterme"
                    >
                      <X className="w-3 h-3" /> Reddet
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-stone-700 dark:text-stone-300">
                      <strong>{s.name}</strong> ismi yeni bir varlık mı?
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleConnectProposal(s.name, 'kisi')}
                        className="px-2 py-1 bg-[#0E1C4F] dark:bg-[#1E293B] hover:opacity-90 text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all"
                        title="Kişi/Karakter olarak kurgu evrenine ekle"
                      >
                        👤 Kişi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnectProposal(s.name, 'mekan')}
                        className="px-2 py-1 bg-[#3E8E5E] hover:opacity-90 text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all"
                        title="Mekan olarak kurgu evrenine ekle"
                      >
                        📍 Mekan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnectProposal(s.name, 'marka')}
                        className="px-2 py-1 bg-amber-600 hover:opacity-90 text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all"
                        title="Marka/Öge olarak kurgu evrenine ekle"
                      >
                        🏷️ Marka
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissSuggestion(s.name)}
                        className="px-2 py-1 border border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:text-red-500 hover:border-red-200 text-[10px] font-mono font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all"
                        title="Bu ismi bir daha önerme"
                      >
                        <X className="w-3 h-3" /> Reddet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Writing Canvas */}
      <div className={`flex-1 flex flex-col ${focusMode ? 'max-w-3xl mx-auto w-full pt-8' : ''}`}>
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
              e.preventDefault();
              applyFormat('bold');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
              e.preventDefault();
              applyFormat('italic');
            }
          }}
          className={`w-full flex-1 bg-transparent text-[#0E1C4F] dark:text-[#F3EFE8] font-serif leading-relaxed whitespace-pre-wrap focus:outline-hidden p-2 resize-none ${focusMode ? 'text-lg md:text-xl min-h-[500px]' : 'text-sm min-h-[300px]'}`}
          placeholder={placeholder}
          id="rich_text_shared_editor"
        />
      </div>

      {/* Foot counts and indicators */}
      <div className={`flex items-center justify-between text-[10px] font-mono text-stone-500 dark:text-stone-500 pt-2 border-t border-[#CFC5B4]/30 dark:border-stone-800 ${focusMode ? 'max-w-3xl mx-auto w-full' : ''}`}>
        <div className="flex gap-4 items-center flex-wrap">
          <span className="bg-stone-100 dark:bg-stone-900 px-2 py-0.5 rounded font-bold text-stone-600 dark:text-stone-300">{wordCount} kelime</span>
          <span className="bg-stone-100 dark:bg-stone-900 px-2 py-0.5 rounded font-bold text-stone-600 dark:text-stone-300">{charCount} karakter</span>
          {streak > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-200/50 dark:border-amber-900/30">
              🔥 {streak} Günlük Yazma Serisi!
            </span>
          )}
        </div>
        {focusMode && (
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="text-[#F26B6F] font-bold uppercase tracking-wider hover:underline cursor-pointer"
          >
            Odaktan Çık
          </button>
        )}
      </div>

    </div>
  );
}
