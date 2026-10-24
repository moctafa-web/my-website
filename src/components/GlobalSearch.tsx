import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState } from '../types';
import { Search, X, Package, Users, FileText, Hash, ArrowLeft, Store } from 'lucide-react';
import { ResultType, SearchResult, searchAll } from '../utils/globalSearch';

interface Props {
  state: AppState;
  /** بيفتح العنصر نفسه (فاتورة / كشف حساب / كارت سيريال / منتج) مش بس الصفحة */
  onOpenResult: (result: { type: ResultType; id: string }) => void;
  onClose: () => void;
}

// بحث شامل سريع (Ctrl+K): يبحث في المنتجات، الأطراف، فواتير البيع والشراء، والسيريالات
// والضغط على النتيجة يفتح العنصر مباشرة
export default function GlobalSearch({ state, onOpenResult, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results: SearchResult[] = useMemo(() => searchAll(state, query), [query, state]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleSelect = (result: SearchResult) => {
    onOpenResult({ type: result.type, id: result.id });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIndex]) { e.preventDefault(); handleSelect(results[selectedIndex]); }
  };

  const iconFor = (type: ResultType) => {
    switch (type) {
      case 'product': return <Package size={16} className="text-blue-400" />;
      case 'party': return <Users size={16} className="text-green-400" />;
      case 'saleInvoice': return <FileText size={16} className="text-violet-400" />;
      case 'purchaseInvoice': return <FileText size={16} className="text-cyan-400" />;
      case 'serial': return <Hash size={16} className="text-pink-400" />;
      case 'noonOrder': return <Store size={16} className="text-yellow-400" />;
    }
  };

  const typeLabel = (type: ResultType) => {
    switch (type) {
      case 'product': return 'منتج';
      case 'party': return 'حساب';
      case 'saleInvoice': return 'فاتورة بيع';
      case 'purchaseInvoice': return 'فاتورة شراء';
      case 'serial': return 'سيريال';
      case 'noonOrder': return 'أوردر منصة';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="bg-elevated border border-violet-700/40 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="بحث عن سيريال، IMEI، منتج، حساب، فاتورة، أو أوردر نون..."
            className="flex-1 bg-transparent text-white outline-none placeholder:text-gray-500"
          />
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              ابدأ الكتابة للبحث في كل النظام
              <div className="mt-2 text-xs text-gray-600">سيريالات • أوردرات نون • منتجات • حسابات • فواتير</div>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">لا توجد نتائج لـ "{query}"</div>
          ) : (
            results.map((r, idx) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors ${idx === selectedIndex ? 'bg-violet-700/20' : 'hover:bg-white/5'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {iconFor(r.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{r.title}</div>
                  <div className="text-xs text-gray-500 truncate">{r.subtitle}</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
                  <span>{typeLabel(r.type)}</span>
                  <ArrowLeft size={12} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/10 flex items-center gap-4 text-xs text-gray-600">
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">↑↓</kbd> للتنقل</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">Enter</kbd> لفتح النتيجة</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
