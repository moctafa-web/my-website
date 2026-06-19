import React, { useState } from 'react';
import { Product, SerialItem } from '../types';
import { formatCurrency, categoryLabel, printElement, getTodayStr } from '../utils/helpers';
import { Search, Printer } from 'lucide-react';

interface Props {
  products: Product[];
  serials: SerialItem[];
}

export default function Inventory({ products, serials }: Props) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showSerials, setShowSerials] = useState<string | null>(null);

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()) || p.brand.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const getAvailableSerials = (productId: string) => serials.filter(s => s.productId === productId && s.status === 'available');
  const getSoldSerials = (productId: string) => serials.filter(s => s.productId === productId && s.status === 'sold');
  const getTransferredSerials = (productId: string) => serials.filter(s => s.productId === productId && s.status === 'transferred');

  const totalValue = products.reduce((s, p) => s + p.costPrice * p.stock, 0);
  const totalSaleValue = products.reduce((s, p) => s + p.salePrice * p.stock, 0);

  const printInventory = () => {
    const rows = filtered.map(p => {
      const avail = p.productType === 'serial' ? getAvailableSerials(p.id).length : p.stock;
      return `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.brand}</td><td>${categoryLabel(p.category)}</td><td style="text-align:center">${avail}</td><td style="text-align:center">${formatCurrency(p.costPrice)}</td><td style="text-align:center">${formatCurrency(p.salePrice)}</td></tr>`;
    }).join('');
    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>تقرير المخزون</strong></div><div>التاريخ: ${getTodayStr()}</div></div>
      </div>
      <p style="margin-bottom:10px;font-size:12px">إجمالي القيمة بالشراء: ${formatCurrency(totalValue)} | إجمالي القيمة بالبيع: ${formatCurrency(totalSaleValue)}</p>
      <table>
        <thead><tr><th>المنتج</th><th>SKU</th><th>البراند</th><th>الفئة</th><th>المخزون</th><th>سعر الشراء</th><th>سعر البيع</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-xl font-bold text-white">📦 المخزون</h2><p className="text-gray-500 text-sm">{products.length} منتج</p></div>
        <button onClick={printInventory} className="btn-secondary flex items-center gap-2"><Printer size={16} /> طباعة المخزون</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-violet-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-violet-400">{products.reduce((s, p) => s + p.stock, 0)}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي القطع</div>
        </div>
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-xl font-black text-blue-400">{formatCurrency(totalValue)}</div>
          <div className="text-xs text-gray-500 mt-1">قيمة المخزون (شراء)</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-xl font-black text-green-400">{formatCurrency(totalSaleValue)}</div>
          <div className="text-xs text-gray-500 mt-1">قيمة المخزون (بيع)</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="input-dark w-full pr-9" />
        </div>
        <div className="flex gap-2">
          {['all', 'phones', 'tablets', 'laptops', 'accessories', 'other'].map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${filterCat === cat ? 'bg-violet-700/40 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>
              {cat === 'all' ? 'الكل' : categoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">المنتج</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">المخزون</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">متاح</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">مباع</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">محول</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر الشراء</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر البيع</th>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">لا توجد منتجات</td></tr>
            ) : filtered.map(p => {
              const avail = getAvailableSerials(p.id).length;
              const sold = getSoldSerials(p.id).length;
              const transferred = getTransferredSerials(p.id).length;
              const stock = p.productType === 'serial' ? avail : p.stock;
              return (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.sku} • {p.brand} • {categoryLabel(p.category)}</div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-lg font-black ${stock === 0 ? 'text-red-400' : stock <= 2 ? 'text-yellow-400' : 'text-green-400'}`}>{stock}</span>
                  </td>
                  <td className="py-3 px-3 text-center text-green-400 text-sm hidden md:table-cell">{p.productType === 'serial' ? avail : p.stock}</td>
                  <td className="py-3 px-3 text-center text-purple-400 text-sm hidden md:table-cell">{p.productType === 'serial' ? sold : '-'}</td>
                  <td className="py-3 px-3 text-center text-blue-400 text-sm hidden md:table-cell">{p.productType === 'serial' ? transferred : '-'}</td>
                  <td className="py-3 px-3 text-center text-gray-300 text-sm">{formatCurrency(p.costPrice)}</td>
                  <td className="py-3 px-3 text-center text-white font-medium text-sm">{formatCurrency(p.salePrice)}</td>
                  <td className="py-3 px-3 text-center">
                    {p.productType === 'serial' && (
                      <button onClick={() => setShowSerials(showSerials === p.id ? null : p.id)} className="text-xs text-violet-400 hover:text-violet-300">
                        {showSerials === p.id ? '▲ إخفاء' : '▼ سيريالات'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Serial Details */}
        {showSerials && (
          <div className="border-t border-violet-900/30 bg-violet-900/10 p-4">
            <h4 className="text-sm font-bold text-violet-300 mb-3">سيريالات المنتج المتاحة</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {getAvailableSerials(showSerials).map(s => (
                <div key={s.id} className="bg-[#252545] rounded-xl p-3">
                  <div className="text-sm font-mono text-white">{s.serial}</div>
                  {s.imei1 && <div className="text-xs text-gray-500">IMEI1: {s.imei1}</div>}
                  {s.imei2 && <div className="text-xs text-gray-500">IMEI2: {s.imei2}</div>}
                  <div className="text-xs text-green-400 mt-1">✅ متاح</div>
                </div>
              ))}
              {getAvailableSerials(showSerials).length === 0 && (
                <div className="text-gray-500 text-sm col-span-3">لا توجد سيريالات متاحة</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
