import React, { useState, useMemo } from 'react';
import { Product, SerialItem, WarehouseLocation } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Package, Warehouse, Store } from 'lucide-react';

interface LocationReportProps {
  products: Product[];
  serials: SerialItem[];
}

export default function LocationReport({ products, serials }: LocationReportProps) {
  const [viewMode, setViewMode] = useState<'warehouse' | 'store' | 'all'>('all');
  const [productTypeFilter, setProductTypeFilter] = useState<'all' | 'serial' | 'normal'>('all');

  // حساب المنتجات حسب الموقع
  const locationStats = useMemo(() => {
    const warehouseProducts = products.filter(p => (p.location === 'warehouse' || !p.location) && (productTypeFilter === 'all' || p.productType === productTypeFilter));
    const storeProducts = products.filter(p => p.location === 'store' && (productTypeFilter === 'all' || p.productType === productTypeFilter));

    const warehouseSerials = serials.filter(s => (s.location === 'warehouse' || !s.location) && s.status === 'available');
    const storeSerials = serials.filter(s => s.location === 'store' && s.status === 'available');

    return {
      warehouse: {
        products: warehouseProducts,
        serials: warehouseSerials,
        totalValue: warehouseProducts.reduce((sum, p) => {
          if (p.productType === 'serial') {
            return sum + (p.stock * p.salePrice);
          }
          return sum + (p.stock * p.salePrice);
        }, 0),
        totalItems: warehouseProducts.reduce((sum, p) => sum + p.stock, 0),
      },
      store: {
        products: storeProducts,
        serials: storeSerials,
        totalValue: storeProducts.reduce((sum, p) => sum + (p.stock * p.salePrice), 0),
        totalItems: storeProducts.reduce((sum, p) => sum + p.stock, 0),
      },
    };
  }, [products, serials, productTypeFilter]);

  const renderLocationSection = (location: 'warehouse' | 'store') => {
    const data = locationStats[location];
    const title = location === 'warehouse' ? '🏭 المستودع (الدور الأرضي)' : '🏪 المحل (الدور العلوي)';

    return (
      <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          {title}
          <span className="text-sm text-gray-400">({data.totalItems} منتج)</span>
        </h3>

        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-2 text-center text-xs">
            <div className="text-blue-300 font-mono">{data.totalItems}</div>
            <div className="text-gray-500">إجمالي الكمية</div>
          </div>
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-2 text-center text-xs">
            <div className="text-green-300 font-mono">{formatCurrency(data.totalValue)}</div>
            <div className="text-gray-500">القيمة الإجمالية</div>
          </div>
        </div>

        {/* جدول المنتجات */}
        {data.products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-right px-2 py-1 text-gray-400">المنتج</th>
                  <th className="text-center px-2 py-1 text-gray-400">SKU</th>
                  <th className="text-center px-2 py-1 text-gray-400">الكمية</th>
                  <th className="text-center px-2 py-1 text-gray-400">القيمة</th>
                  <th className="text-center px-2 py-1 text-gray-400">النوع</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map(product => (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-2 py-1 text-white truncate">{product.name}</td>
                    <td className="px-2 py-1 text-center text-gray-400">{product.sku}</td>
                    <td className="px-2 py-1 text-center text-blue-300 font-mono">{product.stock}</td>
                    <td className="px-2 py-1 text-center text-green-300">{formatCurrency(product.stock * product.salePrice)}</td>
                    <td className="px-2 py-1 text-center text-xs">
                      <span className={`px-1 rounded ${product.productType === 'serial' ? 'bg-purple-900/30 text-purple-300' : 'bg-gray-900/30 text-gray-300'}`}>
                        {product.productType === 'serial' ? 'سيريال' : 'عادي'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-4">لا توجد منتجات</div>
        )}

        {/* المنتجات بالسيريال */}
        {data.serials.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-white/10">
            <div className="text-xs font-bold text-purple-300">الأجهزة بالسيريال ({data.serials.length})</div>
            <div className="flex flex-wrap gap-1">
              {data.serials.map(serial => (
                <span key={serial.id} className="bg-purple-900/30 border border-purple-700/30 rounded px-2 py-1 text-xs text-purple-300">
                  {serial.serial}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">📍 تقرير مواقع المخزون</h2>
        <p className="text-gray-500 text-sm">متابعة موقع كل منتج بين المستودع والمحل</p>
      </div>

      {/* فلترة */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="form-label">نوع المنتج</label>
        <div className="flex gap-2">
          {(['all', 'serial', 'normal'] as const).map(type => (
            <button key={type} onClick={() => setProductTypeFilter(type)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                productTypeFilter === type
                  ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                  : 'border-white/10 text-gray-400 hover:border-white/20'
              }`}>
              {type === 'all' ? 'الكل' : type === 'serial' ? '🔗 سيريال' : '📦 عادي'}
            </button>
          ))}
        </div>
      </div>

      {/* الملخص العام */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-center">
          <div className="text-amber-300 font-mono text-lg">{locationStats.warehouse.totalItems}</div>
          <div className="text-xs text-gray-500">مستودع</div>
        </div>
        <div className="bg-cyan-900/20 border border-cyan-700/30 rounded-xl p-3 text-center">
          <div className="text-cyan-300 font-mono text-lg">{locationStats.store.totalItems}</div>
          <div className="text-xs text-gray-500">محل</div>
        </div>
      </div>

      {/* الأقسام */}
      <div className="space-y-4">
        {(viewMode === 'warehouse' || viewMode === 'all') && renderLocationSection('warehouse')}
        {(viewMode === 'store' || viewMode === 'all') && renderLocationSection('store')}
      </div>
    </div>
  );
}
