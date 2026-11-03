import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Info, Check, X, RefreshCw } from 'lucide-react';
import { Item } from '../types';
import { 
  ConsistencyIssue, 
  checkKisiConsistency, 
  checkMarkaConsistency, 
  checkMerchConsistency, 
  checkKitapConsistency, 
  checkBlogConsistency, 
  checkDuzadaConsistency, 
  checkOyunConsistency 
} from '../utils/consistencyEngine';

interface ConsistencyCheckerProps {
  module: 'kisi' | 'marka' | 'merch' | 'kitap' | 'blog' | 'duzada' | 'oyun';
  items: Item[];
  onUpdateItem: (item: any) => Promise<void>;
  onAddItem: (item: any) => Promise<void>;
  buttonClassName?: string;
  /** Düğme yazısı; stüdyoda bölüm adı yazar (1 Ekim) */
  etiket?: string;
}

export default function ConsistencyChecker({
  module,
  items,
  onUpdateItem,
  onAddItem,
  buttonClassName = '',
  etiket = 'Tutarlılık Kontrolü'
}: ConsistencyCheckerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const runCheck = async () => {
    setIsLoading(true);
    setDismissedIds(new Set());
    
    // Mimic real scan delay for satisfying UX
    await new Promise((resolve) => setTimeout(resolve, 800));

    let scanResults: ConsistencyIssue[] = [];
    switch (module) {
      case 'kisi':
        scanResults = checkKisiConsistency(items);
        break;
      case 'marka':
        scanResults = checkMarkaConsistency(items);
        break;
      case 'merch':
        scanResults = checkMerchConsistency(items);
        break;
      case 'kitap':
        scanResults = checkKitapConsistency(items);
        break;
      case 'blog':
        scanResults = checkBlogConsistency(items);
        break;
      case 'duzada':
        scanResults = checkDuzadaConsistency(items);
        break;
      case 'oyun':
        scanResults = checkOyunConsistency(items);
        break;
    }

    setIssues(scanResults);
    setIsLoading(false);
    setIsOpen(true);
  };

  const handleAcceptFix = async (issue: ConsistencyIssue) => {
    try {
      if (issue.fixAction.type === 'update') {
        await onUpdateItem(issue.fixAction.item);
      } else if (issue.fixAction.type === 'create') {
        await onAddItem(issue.fixAction.item);
      } else if (issue.fixAction.type === 'batch') {
        for (const action of issue.fixAction.actions) {
          if (action.type === 'update') {
            await onUpdateItem(action.item);
          } else if (action.type === 'create') {
            await onAddItem(action.item);
          }
        }
      }
      
      // Dismiss after successful accept
      setDismissedIds(prev => {
        const next = new Set(prev);
        next.add(issue.id);
        return next;
      });
    } catch (err) {
      console.error('Tutarlılık düzeltmesi uygulanırken hata:', err);
    }
  };

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const activeIssues = issues.filter(issue => !dismissedIds.has(issue.id));

  return (
    <div className="relative inline-block">
      <button
        onClick={runCheck}
        disabled={isLoading}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
          isLoading 
            ? 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-600 cursor-not-allowed'
            : buttonClassName || 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 text-[#F26B6F] dark:text-[#EFA39F] border border-amber-200/50 dark:border-amber-900/40'
        }`}
      >
        {isLoading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5" />
        )}
        <span>{etiket}</span>
      </button>

      {/* OVERLAY PANEL / DRAWER */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-fadeIn">
          {/* Backdrop closer */}
          <div className="flex-1" onClick={() => setIsOpen(false)} />

          {/* Drawer body */}
          <div className="w-full max-w-lg bg-[#FAF8F5] dark:bg-[#151311] h-full flex flex-col shadow-2xl border-l border-[#CFC5B4] dark:border-stone-800 animate-slideLeft">
            
            {/* Header */}
            <div className="p-5 border-b border-[#CFC5B4] dark:border-stone-800 flex items-center justify-between bg-[#F3EFE8] dark:bg-[#1a1816]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#F26B6F] dark:text-[#EFA39F]" />
                <div>
                  <h3 className="font-sans font-bold text-base text-[#0E1C4F] dark:text-[#F3EFE8] tracking-tight">
                    {module.toUpperCase()} Tutarlılık Denetimi
                  </h3>
                  <p className="text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase">KEMS EVREN ENTEGRASYON PROTOKOLÜ</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Scan summary banner */}
              <div className="p-4 rounded-lg bg-[#FAF5EC] dark:bg-[#201c18] border border-amber-200 dark:border-amber-950 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 font-sans">Otomatik Lore Taraması Tamamlandı</h4>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed font-serif">
                    Bu tarama; seçili modül verileri ile adanın geri kalan sakinleri, tescilli markaları, merchandise lansmanları ve ana kurgu kitap bölümleri arasındaki çelişkileri denetler.
                  </p>
                </div>
              </div>

              {/* LIST OF ISSUES */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-2">
                  <h4 className="text-xs font-bold text-[#0E1C4F] dark:text-[#F3EFE8] uppercase tracking-wider font-mono">
                    Tespit Edilen Çelişki ve Öneriler ({activeIssues.length})
                  </h4>
                </div>

                {isLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-500 dark:text-stone-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#F26B6F]" />
                    <span className="text-xs font-mono">Kems Veritabanı taranıyor...</span>
                  </div>
                ) : activeIssues.length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl space-y-2">
                    <ShieldCheck className="w-10 h-10 text-green-600 dark:text-green-400 mx-auto" />
                    <div className="text-xs font-bold text-stone-800 dark:text-stone-200">Kusursuz Entegrasyon!</div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 max-w-xs mx-auto">
                      Bu modül bünyesinde herhangi bir mantıksal veya kurgusal çelişki tespit edilmedi.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeIssues.map((issue) => {
                      const isError = issue.type === 'error';
                      const isWarning = issue.type === 'warning';
                      return (
                        <div 
                          key={issue.id}
                          className={`p-4 rounded-xl border transition-all duration-200 bg-white dark:bg-[#1a1816] ${
                            isError 
                              ? 'border-red-200 dark:border-red-950/50 shadow-sm shadow-red-500/5' 
                              : isWarning 
                                ? 'border-amber-200 dark:border-amber-950/50 shadow-sm shadow-amber-500/5' 
                                : 'border-stone-200 dark:border-stone-800/80'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {isError ? (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            ) : isWarning ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Info className="w-4 h-4 text-blue-500" />
                            )}
                            <strong className={`text-xs font-sans ${isError ? 'text-red-700 dark:text-red-400' : isWarning ? 'text-amber-700 dark:text-amber-400' : 'text-stone-800 dark:text-stone-300'}`}>
                              {issue.title}
                            </strong>
                            <span className="ml-auto text-[8px] font-mono uppercase bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">
                              {issue.type}
                            </span>
                          </div>

                          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed font-serif mb-3">
                            {issue.message}
                          </p>

                          {/* Proposed Fix Block */}
                          <div className="p-3 rounded bg-stone-50 dark:bg-stone-900/60 border border-stone-100 dark:border-stone-800/60 text-[11px] mb-4 space-y-1">
                            <span className="font-mono text-[9px] font-bold text-[#F26B6F] block uppercase">Önerilen Çözüm:</span>
                            <p className="text-stone-800 dark:text-stone-300 font-sans">{issue.proposedFix}</p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-900/60">
                            <button
                              onClick={() => handleDismiss(issue.id)}
                              className="px-2.5 py-1 text-[10px] font-bold text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              Vazgeç
                            </button>
                            <button
                              onClick={() => handleAcceptFix(issue)}
                              className="px-3 py-1 text-[10px] font-bold bg-[#F26B6F] hover:bg-[#B23A40] text-white rounded transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <Check className="w-3 h-3" />
                              {issue.fixAction.type === 'batch' && issue.fixAction.actions.length === 0 ? 'Anladım' : 'Kabul Et'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#CFC5B4] dark:border-stone-800 bg-[#FAF8F5] dark:bg-[#151311] text-center text-[10px] font-mono text-stone-500 dark:text-stone-400">
              KEMS® KONSİSTANS PROTOKOLÜ 4.2 • DÜZADA, TR
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
