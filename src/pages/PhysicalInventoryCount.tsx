import React, { useState, useMemo } from 'react';
import { Product, SerialItem, WeeklyInventoryCount, InventoryCountLine } from '../types';
import { getTodayStr } from '../utils/helpers';
import { makeInventoryCountId } from '../store/domains/id.store';
import BarcodeScanner, { ScanFeedback } from '../components/BarcodeScanner';
import { Plus, Trash2, CheckCircle, AlertCircle, Download, Save, X } from 'lucide-react';

interface PhysicalInventoryCountProps {
  products: Product[];
  serials: SerialItem[];
  weeklyInventoryCounts: WeeklyInventoryCount[];
  onAddCount: (count: WeeklyInventoryCount) => void;
  onUpdateCount: (count: WeeklyInventoryCount) => void;
}

export default function PhysicalInventoryCount({
  products,
  serials,
  weeklyInventoryCounts,
  onAddCount,
  onUpdateCount,
}: PhysicalInventoryCountProps) {
  const [viewMode, setViewMode] = useState<'list' | 'count'>('list');
  const [selectedCount, setSelectedCount] = useState<WeeklyInventoryCount | null>(null);
  const [countLines, setCountLines] = useState<InventoryCountLine[]>([]);
  const [newCountName, setNewCountName] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [countedSerials, setCountedSerials] = useState<Set<string>>(new Set());

  // احسب أسبوع السنة الحالي
  const getWeekNumber = (date: Date = new Date()) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();

  // بدء جرد جديد
  // ملاحظة: الجرد بيشمل بس المنتجات اللي فعلاً موجود لها رصيد (قطعة واحدة على الأقل)
  // عشان منعرضش مئات المنتجات الفاضية ونعقّد عملية الجرد بدون فايدة
  const startNewCount = () => {
    const lines = products
      .map(product => {
        let theoreticalQty = 0;
        if (product.productType === 'serial') {
          theoreticalQty = serials.filter(
            s => s.productId === product.id && s.status === 'available'
          ).length;
        } else {
          theoreticalQty = product.stock || 0;
        }

        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          theoreticalQty,
          physicalQty: 0,
          difference: 0,
          category: 'matched' as const,
          notes: '',
        };
      })
      .filter(line => line.theoreticalQty > 0);

    setCountLines(lines);
    setCountedSerials(new Set());
    setViewMode('count');
    setSelectedCount(null);
  };

  // البحث بالسيريال/IMEI وتثبيت قطعة واحدة فوراً
  const scanSerialIntoCount = (code: string) => {
    const normalized = code.trim().toLowerCase();
    const serial = serials.find(s =>
      s.status === 'available' &&
      [s.serial, s.imei1, s.imei2].filter(Boolean).some(value => String(value).toLowerCase() === normalized)
    );
    if (!serial) {
      setScanFeedback({ id: Date.now(), type: 'error', message: `⚠️ لم يتم العثور على سيريال متاح: ${code}` });
      return;
    }
    if (countedSerials.has(serial.id)) {
      setScanFeedback({ id: Date.now(), type: 'error', message: `↩️ تم تسجيل ${serial.serial} بالفعل في هذا الجرد` });
      return;
    }
    setCountedSerials(prev => new Set(prev).add(serial.id));
    setCountLines(lines => lines.map(line => {
      if (line.productId !== serial.productId) return line;
      const physicalQty = Math.min(line.physicalQty + 1, Math.max(line.theoreticalQty, line.physicalQty + 1));
      const difference = physicalQty - line.theoreticalQty;
      const category = difference === 0 ? 'matched' : difference < 0 ? 'shortage' : 'surplus';
      return { ...line, physicalQty, difference, category, notes: line.notes ? `${line.notes}, ${serial.serial}` : serial.serial };
    }));
    setScanFeedback({ id: Date.now(), type: 'success', message: `✅ تم جرد ${serial.serial}` });
  };

  // تحديث كمية الجرد الفعلي
  const updatePhysicalQty = (productId: string, physicalQty: number) => {
    setCountLines(lines =>
      lines.map(line => {
        if (line.productId !== productId) return line;
        const difference = physicalQty - line.theoreticalQty;
        const category = difference === 0 ? 'matched' : difference < 0 ? 'shortage' : 'surplus';
        return { ...line, physicalQty, difference, category };
      })
    );
  };

  // حفظ الجرد
  const saveCount = () => {
    if (countLines.length === 0) return;

    const totalTheoretical = countLines.reduce((sum, l) => sum + l.theoreticalQty, 0);
    const totalPhysical = countLines.reduce((sum, l) => sum + l.physicalQty, 0);
    const totalDifference = totalPhysical - totalTheoretical;
    const matchedCount = countLines.filter(l => l.category === 'matched').length;
    const accuracyPercentage = (matchedCount / countLines.length) * 100;
    const shortageItems = countLines.filter(l => l.category === 'shortage').length;
    const surplusItems = countLines.filter(l => l.category === 'surplus').length;

    const newCount: WeeklyInventoryCount = {
      id: makeInventoryCountId(),
      weekNumber: currentWeek,
      year: currentYear,
      startDate: getTodayStr(),
      endDate: getTodayStr(),
      lines: countLines,
      status: 'draft',
      totalTheoretical,
      totalPhysical,
      totalDifference,
      accuracyPercentage,
      shortageItems,
      surplusItems,
      createdAt: new Date().toISOString(),
    };

    onAddCount(newCount);
    setCountLines([]);
    setViewMode('list');
  };

  const matchedCount = useMemo(
    () => countLines.filter(l => l.category === 'matched').length,
    [countLines]
  );

  const shortageCount = useMemo(
    () => countLines.filter(l => l.category === 'shortage').length,
    [countLines]
  );

  const surplusCount = useMemo(
    () => countLines.filter(l => l.category === 'surplus').length,
    [countLines]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📦 الجرد الأسبوعي الفيزيائي</h2>
          <p className="text-gray-500 text-sm">أسبوع {currentWeek} - {currentYear}</p>
        </div>
        {viewMode === 'list' && (
          <div className="flex items-center gap-2">
            <button onClick={startNewCount} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> جرد جديد
            </button>
          </div>
        )}
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-3">
          {(weeklyInventoryCounts || []).length > 0 ? (
            (weeklyInventoryCounts || []).map(count => (
              <div key={count.id} className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-white">
                      أسبوع {count.weekNumber} - {count.year}
                    </div>
                    <div className="text-xs text-gray-500">{count.startDate}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      count.status === 'approved' ? 'bg-green-900/30 text-green-300' :
                      count.status === 'completed' ? 'bg-blue-900/30 text-blue-300' :
                      'bg-yellow-900/30 text-yellow-300'
                    }`}>
                      {count.status === 'approved' ? '✅ معتمد' : count.status === 'completed' ? '✓ مكتمل' : '📝 مسودة'}
                    </span>
                    <button onClick={() => { setSelectedCount(count); setViewMode('count'); }}
                      className="btn-secondary text-xs">عرض التفاصيل</button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="bg-blue-900/20 rounded-lg p-2 text-center">
                    <div className="text-blue-300 font-mono">{count.totalTheoretical}</div>
                    <div className="text-gray-500">نظري</div>
                  </div>
                  <div className="bg-green-900/20 rounded-lg p-2 text-center">
                    <div className="text-green-300 font-mono">{count.totalPhysical}</div>
                    <div className="text-gray-500">فعلي</div>
                  </div>
                  <div className={`rounded-lg p-2 text-center ${count.totalDifference === 0 ? 'bg-emerald-900/20' : count.totalDifference < 0 ? 'bg-red-900/20' : 'bg-orange-900/20'}`}>
                    <div className={`font-mono ${count.totalDifference === 0 ? 'text-emerald-300' : count.totalDifference < 0 ? 'text-red-300' : 'text-orange-300'}`}>
                      {count.totalDifference > 0 ? '+' : ''}{count.totalDifference}
                    </div>
                    <div className="text-gray-500">فرق</div>
                  </div>
                  <div className="bg-purple-900/20 rounded-lg p-2 text-center">
                    <div className="text-purple-300 font-mono">{count.accuracyPercentage.toFixed(1)}%</div>
                    <div className="text-gray-500">دقة</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-elevated border border-white/10 rounded-2xl p-8 text-center text-gray-500">
              <AlertCircle size={32} className="mx-auto mb-3 opacity-50" />
              <p>لا توجد جردات أسبوعية بعد</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {showScanner && (
            <BarcodeScanner
              title="سكانر الجرد"
              mode="continuous"
              feedback={scanFeedback}
              onDetected={scanSerialIntoCount}
              onClose={() => setShowScanner(false)}
            />
          )}
          {/* إحصائيات سريعة */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 text-center">
              <div className="text-emerald-300 font-mono text-lg">{matchedCount}</div>
              <div className="text-xs text-gray-500">مطابق</div>
            </div>
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
              <div className="text-red-300 font-mono text-lg">{shortageCount}</div>
              <div className="text-xs text-gray-500">ناقص</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3 text-center">
              <div className="text-orange-300 font-mono text-lg">{surplusCount}</div>
              <div className="text-xs text-gray-500">زيادة</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 text-center">
              <div className="text-purple-300 font-mono text-lg">
                {countLines.length > 0 ? ((matchedCount / countLines.length) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-xs text-gray-500">نسبة دقة</div>
            </div>
          </div>

          {/* جدول الجرد */}
          <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-violet-900/30">
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">#</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">المنتج</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">SKU</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">نظري</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">فعلي</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">فرق</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {countLines.map((line, idx) => (
                  <tr key={line.productId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-white truncate">{line.productName}</td>
                    <td className="px-3 py-2 text-center text-gray-400 text-xs">{line.sku}</td>
                    <td className="px-3 py-2 text-center text-blue-300 font-mono">{line.theoreticalQty}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        value={line.physicalQty || ''}
                        onChange={e => updatePhysicalQty(line.productId, parseInt(e.target.value) || 0)}
                        className="input-dark w-16 text-center"
                        min="0"
                      />
                    </td>
                    <td className={`px-3 py-2 text-center font-mono font-bold ${
                      line.category === 'matched' ? 'text-emerald-300' :
                      line.category === 'shortage' ? 'text-red-300' : 'text-orange-300'
                    }`}>
                      {line.difference > 0 ? '+' : ''}{line.difference}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        line.category === 'matched' ? 'bg-emerald-900/30 text-emerald-300' :
                        line.category === 'shortage' ? 'bg-red-900/30 text-red-300' :
                        'bg-orange-900/30 text-orange-300'
                      }`}>
                        {line.category === 'matched' ? '✓' : line.category === 'shortage' ? '-' : '+'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* أزرار العمل */}
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowScanner(true)} className="btn-secondary flex items-center gap-1">📷 سكانر</button>
                        <button onClick={() => { setViewMode('list'); setCountLines([]); }} 
              className="btn-secondary flex items-center gap-1">
              <X size={14} /> إلغاء
            </button>
            <button onClick={() => setShowScanner(true)} className="btn-secondary flex items-center gap-1">📷 سكانر</button>
            <button onClick={saveCount} 
              className="btn-primary flex items-center gap-1">
              <Save size={14} /> حفظ الجرد
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
