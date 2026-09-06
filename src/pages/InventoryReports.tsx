import React, { useState, useMemo, useEffect } from 'react';
import { Product, SerialItem } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import { Download, Calendar, AlertCircle, TrendingDown, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface InventorySnapshot {
  date: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  minStock: number;
  value: number;
  status: 'low' | 'critical' | 'normal';
}

interface DailyInventoryChange {
  date: string;
  productId: string;
  productName: string;
  changeType: 'purchase' | 'sale' | 'return' | 'adjustment';
  quantityChange: number;
  previousQty: number;
  newQty: number;
  notes?: string;
}

interface Props {
  products: Product[];
  serials: SerialItem[];
}

export default function InventoryReports({ products, serials }: Props) {
  const [viewMode, setViewMode] = useState<'calendar' | 'snapshots' | 'changes'>('calendar');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [snapshots, setSnapshots] = useState<InventorySnapshot[]>(() => {
    const stored = localStorage.getItem('inventorySnapshots');
    return stored ? JSON.parse(stored) : [];
  });
  const [changes, setChanges] = useState<DailyInventoryChange[]>(() => {
    const stored = localStorage.getItem('inventoryChanges');
    return stored ? JSON.parse(stored) : [];
  });

  // Auto-save snapshot at midnight (يومياً تلقائياً)
  useEffect(() => {
    const today = getTodayStr();
    const alreadySavedToday = snapshots.some(s => s.date === today);
    
    if (!alreadySavedToday) {
      const todaySnapshot = calculateInventorySnapshot(today);
      setSnapshots(prev => {
        const updated = [...prev, ...todaySnapshot];
        localStorage.setItem('inventorySnapshots', JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  // Save snapshots to localStorage
  useEffect(() => {
    localStorage.setItem('inventorySnapshots', JSON.stringify(snapshots));
  }, [snapshots]);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('inventoryChanges', JSON.stringify(changes));
  }, [changes]);

  // حساب لقطة المخزون الحالية (فقط المتاح)
  const calculateInventorySnapshot = (date: string): InventorySnapshot[] => {
    return products
      .map(product => {
        let quantity = 0;
        let value = 0;

        if (product.productType === 'serial') {
          const availableSerials = serials.filter(
            s => s.productId === product.id && s.status === 'available'
          );
          quantity = availableSerials.length;
          value = quantity * product.salePrice;
        } else {
          quantity = product.stock || 0;
          value = quantity * product.salePrice;
        }

        const minStock = product.minStock || 0;
        let status: 'low' | 'critical' | 'normal' = 'normal';
        if (quantity === 0) status = 'critical';
        else if (quantity <= minStock) status = 'low';

        return {
          date,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity,
          minStock,
          value,
          status,
        };
      })
      .filter(s => s.quantity > 0); // حفظ فقط المخزون المتاح (quantity > 0)
  };

  // الحصول على لقطة محددة
  const getSnapshotForDate = (date: string) => {
    return snapshots.filter(s => s.date === date);
  };

  // مقارنة التغييرات بين يومين
  const getInventoryChanges = (currentDate: string) => {
    const currentSnapshot = getSnapshotForDate(currentDate);
    const previousDates = datesWithSnapshots.filter(d => d < currentDate);
    const previousDate = previousDates.length > 0 ? previousDates[0] : null;
    const previousSnapshot = previousDate ? getSnapshotForDate(previousDate) : [];

    const currentIds = new Set(currentSnapshot.map(s => s.productId));
    const previousIds = new Set(previousSnapshot.map(s => s.productId));

    // المتكرر (موجود في الأمس واليوم)
    const repeated = currentSnapshot.filter(s => previousIds.has(s.productId)).map(s => ({
      type: 'repeated',
      productId: s.productId,
      productName: s.productName,
      sku: s.sku,
      quantity: s.quantity,
      previousQty: previousSnapshot.find(p => p.productId === s.productId)?.quantity || 0,
    }));

    // الجديد (لم يكن موجوداً بالأمس)
    const added = currentSnapshot.filter(s => !previousIds.has(s.productId)).map(s => ({
      type: 'added',
      productId: s.productId,
      productName: s.productName,
      sku: s.sku,
      quantity: s.quantity,
    }));

    // المحذوف (كان موجوداً بالأمس وليس اليوم)
    const removed = previousSnapshot.filter(s => !currentIds.has(s.productId)).map(s => ({
      type: 'removed',
      productId: s.productId,
      productName: s.productName,
      sku: s.sku,
      quantity: s.quantity,
    }));

    return { repeated, added, removed, previousDate };
  };

  // إحصائيات اليوم المختار
  const todayStats = useMemo(() => {
    const daySnapshots = getSnapshotForDate(selectedDate);
    if (daySnapshots.length === 0) return null;

    const totalItems = daySnapshots.reduce((sum, s) => sum + s.quantity, 0);
    const totalValue = daySnapshots.reduce((sum, s) => sum + s.value, 0);
    const lowStockCount = daySnapshots.filter(s => s.status === 'low').length;
    const criticalCount = daySnapshots.filter(s => s.status === 'critical').length;

    return {
      totalItems,
      totalValue,
      lowStockCount,
      criticalCount,
      averagePrice: daySnapshots.length > 0 ? (totalValue / totalItems).toFixed(2) : '0',
    };
  }, [snapshots, selectedDate]);

  // تغييرات اليوم
  const todayChanges = useMemo(() => {
    return changes.filter(c => c.date === selectedDate);
  }, [changes, selectedDate]);

  // كل الأيام التي لديها لقطات
  const datesWithSnapshots = useMemo(() => {
    return [...new Set(snapshots.map(s => s.date))].sort().reverse();
  }, [snapshots]);

  // كل الأيام التي لديها تغييرات
  const datesWithChanges = useMemo(() => {
    return [...new Set(changes.map(c => c.date))].sort().reverse();
  }, [changes]);

  // احصائيات التاريخية
  const historicalStats = useMemo(() => {
    if (snapshots.length === 0) return null;

    const uniqueDates = [...new Set(snapshots.map(s => s.date))];
    const dates = uniqueDates.sort().reverse().slice(0, 30); // آخر 30 يوم

    return dates.map(date => {
      const daySnaps = snapshots.filter(s => s.date === date);
      return {
        date,
        totalValue: daySnaps.reduce((sum, s) => sum + s.value, 0),
        totalItems: daySnaps.reduce((sum, s) => sum + s.quantity, 0),
        criticalCount: daySnaps.filter(s => s.status === 'critical').length,
        lowCount: daySnaps.filter(s => s.status === 'low').length,
      };
    });
  }, [snapshots]);

  // تحميل Excel
  const downloadReport = (type: 'snapshots' | 'changes') => {
    const wb = XLSX.utils.book_new();

    if (type === 'snapshots') {
      const dayData = getSnapshotForDate(selectedDate);
      const ws = XLSX.utils.json_to_sheet(
        dayData.map(s => ({
          'تاريخ اللقطة': s.date,
          'اسم المنتج': s.productName,
          'الكود': s.sku,
          'الكمية المتاحة': s.quantity,
          'الحد الأدنى': s.minStock,
          'القيمة الإجمالية': formatCurrency(s.value),
          'الحالة': s.status === 'critical' ? 'حرج ❌' : s.status === 'low' ? 'منخفض ⚠️' : 'عادي ✅',
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, 'لقطة اليوم');
    } else {
      const dayChanges = todayChanges;
      const ws = XLSX.utils.json_to_sheet(
        dayChanges.map(c => ({
          'التاريخ': c.date,
          'المنتج': c.productName,
          'نوع التغيير': c.changeType === 'purchase' ? 'شراء' : c.changeType === 'sale' ? 'بيع' : c.changeType === 'return' ? 'مرتجع' : 'تعديل',
          'التغيير': c.quantityChange > 0 ? `+${c.quantityChange}` : `${c.quantityChange}`,
          'من': c.previousQty,
          'إلى': c.newQty,
          'الملاحظات': c.notes || '-',
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws, 'تغييرات اليوم');
    }

    XLSX.writeFile(wb, `inventory-${type}-${selectedDate}.xlsx`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📅 تقارير المخزون المتقدمة</h2>
          <p className="text-gray-500 text-sm">{snapshots.length} لقطة مخزون محفوظة</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="input-dark" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        <button onClick={() => setViewMode('calendar')} 
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            viewMode === 'calendar'
              ? 'border-violet-500 text-violet-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}>
          📆 تقويم المخزون
        </button>
        <button onClick={() => setViewMode('snapshots')} 
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            viewMode === 'snapshots'
              ? 'border-violet-500 text-violet-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}>
          📸 لقطات اليوم
        </button>
        <button onClick={() => setViewMode('changes')} 
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            viewMode === 'changes'
              ? 'border-violet-500 text-violet-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}>
          📝 التغييرات اليومية
        </button>
      </div>

      {/* ==================== CALENDAR VIEW ==================== */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {todayStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">إجمالي الأصناف</div>
                <div className="text-2xl font-bold text-blue-300 mt-2">{todayStats.totalItems}</div>
              </div>
              <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">القيمة الإجمالية</div>
                <div className="text-2xl font-bold text-purple-300 mt-2">{formatCurrency(todayStats.totalValue)}</div>
              </div>
              <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">منخفض ⚠️</div>
                <div className="text-2xl font-bold text-orange-300 mt-2">{todayStats.lowStockCount}</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">حرج ❌</div>
                <div className="text-2xl font-bold text-red-300 mt-2">{todayStats.criticalCount}</div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
            <h3 className="font-bold text-white mb-4">📅 التاريخ المحفوظ</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {datesWithSnapshots.map(date => (
                <button key={date} onClick={() => setSelectedDate(date)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    selectedDate === date
                      ? 'bg-violet-900/40 border-violet-500 text-violet-300'
                      : 'bg-muted-bg border-white/10 text-gray-400 hover:border-white/20'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span>{date}</span>
                    <span className="text-xs">
                      {snapshots.filter(s => s.date === date).filter(s => s.status === 'critical').length} حرج
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Historical Chart */}
          {historicalStats && (
            <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
              <h3 className="font-bold text-white mb-4">📊 الاتجاه التاريخي (آخر 30 يوم)</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto text-sm">
                {historicalStats.map((stat, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-muted-bg rounded-lg">
                    <span className="text-gray-400">{stat.date}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">القيمة: {formatCurrency(stat.totalValue)}</span>
                      <span className="text-blue-300">العدد: {stat.totalItems}</span>
                      {stat.criticalCount > 0 && <span className="text-red-300">حرج: {stat.criticalCount}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SNAPSHOTS VIEW ==================== */}
      {viewMode === 'snapshots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">📸 لقطة المخزون بتاريخ {selectedDate}</h3>
            <button onClick={() => downloadReport('snapshots')} 
              className="btn-secondary text-sm flex items-center gap-1">
              <Download size={14} /> تحميل Excel
            </button>
          </div>

          {todayStats && (
            <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-violet-900/20">
                  <tr>
                    <th className="text-right py-3 px-4 text-gray-400">اسم المنتج</th>
                    <th className="text-center py-3 px-4 text-gray-400">الكود</th>
                    <th className="text-center py-3 px-4 text-gray-400">الكمية</th>
                    <th className="text-center py-3 px-4 text-gray-400">الحد الأدنى</th>
                    <th className="text-center py-3 px-4 text-gray-400">القيمة</th>
                    <th className="text-center py-3 px-4 text-gray-400">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {getSnapshotForDate(selectedDate).map((snap, idx) => (
                    <tr key={idx} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-white">{snap.productName}</td>
                      <td className="py-3 px-4 text-center text-gray-400 font-mono text-xs">{snap.sku}</td>
                      <td className="py-3 px-4 text-center text-white font-semibold">{snap.quantity}</td>
                      <td className="py-3 px-4 text-center text-gray-400">{snap.minStock}</td>
                      <td className="py-3 px-4 text-center text-gray-400">{formatCurrency(snap.value)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          snap.status === 'critical' ? 'bg-red-900/30 text-red-300 border border-red-700/50' :
                          snap.status === 'low' ? 'bg-orange-900/30 text-orange-300 border border-orange-700/50' :
                          'bg-green-900/30 text-green-300 border border-green-700/50'
                        }`}>
                          {snap.status === 'critical' ? '❌ حرج' : snap.status === 'low' ? '⚠️ منخفض' : '✅ عادي'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== CHANGES VIEW ==================== */}
      {viewMode === 'changes' && (() => {
        const { repeated, added, removed, previousDate } = getInventoryChanges(selectedDate);
        
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">📝 التغييرات بتاريخ {selectedDate}</h3>
                {previousDate && <p className="text-xs text-gray-500 mt-1">مقارنة مع {previousDate}</p>}
              </div>
            </div>

            {/* متكرر من الأمس */}
            <div className="bg-elevated border border-blue-900/30 rounded-2xl p-4">
              <h4 className="font-bold text-blue-300 mb-3 flex items-center gap-2">
                <span>↔️ المخزون المتكرر من الأمس</span>
                <span className="text-sm text-blue-200">({repeated.length})</span>
              </h4>
              {repeated.length > 0 ? (
                <div className="space-y-2">
                  {repeated.map((item, idx) => (
                    <div key={idx} className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{item.productName}</span>
                        <span className="text-blue-300 font-mono">{item.sku}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        الأمس: <span className="text-yellow-300">{item.previousQty}</span> 
                        {' → '} اليوم: <span className="text-blue-300">{item.quantity}</span>
                        {item.quantity !== item.previousQty && (
                          <span className={`ml-2 font-semibold ${item.quantity > item.previousQty ? 'text-green-300' : 'text-red-300'}`}>
                            ({item.quantity > item.previousQty ? '+' : ''}{item.quantity - item.previousQty})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">لا توجد منتجات متكررة</p>
              )}
            </div>

            {/* جديد */}
            <div className="bg-elevated border border-green-900/30 rounded-2xl p-4">
              <h4 className="font-bold text-green-300 mb-3 flex items-center gap-2">
                <span>✨ مخزون جديد أضيف اليوم</span>
                <span className="text-sm text-green-200">({added.length})</span>
              </h4>
              {added.length > 0 ? (
                <div className="space-y-2">
                  {added.map((item, idx) => (
                    <div key={idx} className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{item.productName}</span>
                        <span className="text-green-300 font-mono">{item.sku}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        الكمية: <span className="text-green-300 font-semibold">{item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">لم يتم إضافة منتجات جديدة</p>
              )}
            </div>

            {/* محذوف */}
            <div className="bg-elevated border border-red-900/30 rounded-2xl p-4">
              <h4 className="font-bold text-red-300 mb-3 flex items-center gap-2">
                <span>🗑️ مخزون محذوف (انتهى)</span>
                <span className="text-sm text-red-200">({removed.length})</span>
              </h4>
              {removed.length > 0 ? (
                <div className="space-y-2">
                  {removed.map((item, idx) => (
                    <div key={idx} className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium line-through opacity-75">{item.productName}</span>
                        <span className="text-red-300 font-mono">{item.sku}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        كان موجود بكمية: <span className="text-red-300 font-semibold">{item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">لم يتم حذف منتجات</p>
              )}
            </div>

            {/* ملخص التغييرات */}
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-2xl p-4">
              <h4 className="font-bold text-purple-300 mb-3">📊 ملخص التغييرات</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center">
                  <div className="text-purple-300 font-mono">{repeated.length}</div>
                  <div className="text-xs text-gray-400">متكرر</div>
                </div>
                <div className="text-center">
                  <div className="text-green-300 font-mono">+{added.length}</div>
                  <div className="text-xs text-gray-400">جديد</div>
                </div>
                <div className="text-center">
                  <div className="text-red-300 font-mono">-{removed.length}</div>
                  <div className="text-xs text-gray-400">محذوف</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
