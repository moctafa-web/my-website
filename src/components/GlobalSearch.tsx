import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppState } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Search, X, Package, Users, Truck, FileText, Hash, ArrowLeft } from 'lucide-react';

interface Props {
  state: AppState;
  onNavigate: (page: string) => void;
  onClose: () => void;
}

type ResultType = 'product' | 'customer' | 'supplier' | 'saleInvoice' | 'purchaseInvoice' | 'serial';

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  page: string;
}

// بحث شامل سريع (Ctrl+K): يبحث في المنتجات، العملاء، الموردين، فواتير البيع والشراء، والسيريالات
// من أي صفحة في النظام بدون الحاجة للتنقل اليدوي
export default function GlobalSearch({ state, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];

    // منتجات
    state.products.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.upc || '').includes(q)) {
        out.push({
          type: 'product', id: p.id, title: p.name,
          subtitle: `${p.sku} • ${formatCurrency(p.salePrice)} • مخزون: ${p.stock}`,
          page: 'products',
        });
      }
    });

    // سيريالات (بحث دقيق بالسيريال أو IMEI، يربط للمخزون)
    state.serials.forEach(s => {
      if (s.serial.toLowerCase().includes(q) || (s.imei1 || '').includes(q) || (s.imei2 || '').includes(q)) {
        const statusLabel = s.status === 'available' ? '🟢 متاح' : s.status === 'sold' ? '🔵 مباع' : s.status === 'transferred' ? '🟣 محول (نون/أمازون)' : s.status;
        out.push({
          type: 'serial', id: s.id, title: `${s.serial} — ${s.productName}`,
          subtitle: statusLabel,
          page: 'inventory',
        });
      }
    });

    // عملاء
    state.customers.forEach(c => {
      if (c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) {
        const balance = (c.totalInvoices || 0) - (c.totalPaid || 0) + (c.openingBalance || 0);
        out.push({
          type: 'customer', id: c.id, title: c.name,
          subtitle: `${c.phone || 'بدون هاتف'} • الرصيد: ${formatCurrency(balance)}`,
          page: 'customers',
        });
      }
    });

    // موردين
    state.suppliers.forEach(s => {
      if (s.name.toLowerCase().includes(q) || (s.phone || '').includes(q)) {
        const balance = (s.totalInvoices || 0) - (s.totalPaid || 0) + (s.openingBalance || 0);
        out.push({
          type: 'supplier', id: s.id, title: s.name,
          subtitle: `${s.phone || 'بدون هاتف'} • الرصيد: ${formatCurrency(balance)}`,
          page: 'suppliers',
        });
      }
    });

    // فواتير بيع
    state.saleInvoices.forEach(inv => {
      if (inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q)) {
        out.push({
          type: 'saleInvoice', id: inv.id, title: `فاتورة بيع ${inv.invoiceNumber}`,
          subtitle: `${inv.customerName} • ${formatCurrency(inv.total)} • ${inv.date}`,
          page: 'sales',
        });
      }
    });

    // فواتير شراء
    state.purchaseInvoices.forEach(inv => {
      if (inv.invoiceNumber.toLowerCase().includes(q) || inv.supplierName.toLowerCase().includes(q)) {
        out.push({
          type: 'purchaseInvoice', id: inv.id, title: `فاتورة شراء ${inv.invoiceNumber}`,
          subtitle: `${inv.supplierName} • ${formatCurrency(inv.total)} • ${inv.date}`,
          page: 'purchases',
        });
      }
    });

    return out.slice(0, 30);
  }, [query, state]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.page);
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
      case 'customer': return <Users size={16} className="text-green-400" />;
      case 'supplier': return <Truck size={16} className="text-orange-400" />;
      case 'saleInvoice': return <FileText size={16} className="text-violet-400" />;
      case 'purchaseInvoice': return <FileText size={16} className="text-cyan-400" />;
      case 'serial': return <Hash size={16} className="text-pink-400" />;
    }
  };

  const typeLabel = (type: ResultType) => {
    switch (type) {
      case 'product': return 'منتج';
      case 'customer': return 'عميل';
      case 'supplier': return 'مورد';
      case 'saleInvoice': return 'فاتورة بيع';
      case 'purchaseInvoice': return 'فاتورة شراء';
      case 'serial': return 'سيريال';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="bg-[#1a1a35] border border-violet-700/40 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="بحث عن منتج، عميل، مورد، فاتورة، أو سيريال..."
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
              <div className="mt-2 text-xs text-gray-600">منتجات • عملاء • موردين • فواتير • سيريالات</div>
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
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">Enter</kbd> للفتح</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded">Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
