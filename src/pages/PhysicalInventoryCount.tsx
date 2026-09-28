import React, { useEffect, useMemo, useState } from 'react';
import { Product, SerialItem, WeeklyInventoryCount, InventoryCountLine } from '../types';
import { getTodayStr } from '../utils/helpers';
import { makeInventoryCountId } from '../store/domains/id.store';
import { loadCollection } from '../services/firebasePersistence';
type ScanFeedback = { id: number; type: 'success' | 'error'; message: string };
import { Plus, AlertCircle, Save, X, Printer, RefreshCw } from 'lucide-react';

interface PhysicalInventoryCountProps {
  products: Product[];
  serials: SerialItem[];
  weeklyInventoryCounts: WeeklyInventoryCount[];
  onAddCount: (count: WeeklyInventoryCount) => void;
  onUpdateCount: (count: WeeklyInventoryCount) => void;
}

type CountCategory = InventoryCountLine['category'] | 'pending';

type WorkingLine = Omit<InventoryCountLine, 'category'> & { category: CountCategory };

const getWeekNumber = (date: Date = new Date()) => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

const finalCategory = (theoreticalQty: number, physicalQty: number): InventoryCountLine['category'] => {
  if (physicalQty === theoreticalQty) return 'matched';
  if (physicalQty < theoreticalQty) return 'shortage';
  return 'surplus';
};

const emptyWorkingCategory = (): CountCategory => 'pending';

export default function PhysicalInventoryCount({
  products,
  serials,
  weeklyInventoryCounts,
  onAddCount,
  onUpdateCount,
}: PhysicalInventoryCountProps) {
  const [viewMode, setViewMode] = useState<'list' | 'count'>('list');
  const [visibleCounts, setVisibleCounts] = useState<WeeklyInventoryCount[]>(weeklyInventoryCounts || []);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCount, setSelectedCount] = useState<WeeklyInventoryCount | null>(null);
  const [countLines, setCountLines] = useState<WorkingLine[]>([]);
  const [scannerInput, setScannerInput] = useState('');
  const [unrecognizedScans, setUnrecognizedScans] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [countedSerials, setCountedSerials] = useState<Set<string>>(new Set());

  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();

  useEffect(() => setVisibleCounts(weeklyInventoryCounts || []), [weeklyInventoryCounts]);

  const refreshCounts = async () => {
    setRefreshing(true);
    try {
      const fresh = await loadCollection<WeeklyInventoryCount>('weeklyInventoryCounts');
      fresh.sort((a, b) => `${b.year}-${String(b.weekNumber).padStart(2, '0')}-${b.endDate || b.startDate}`.localeCompare(`${a.year}-${String(a.weekNumber).padStart(2, '0')}-${a.endDate || a.startDate}`));
      setVisibleCounts(fresh);
    } catch (error) {
      console.error('[Firebase] refresh weekly inventory counts failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (viewMode !== 'list') return;
    void refreshCounts();
    const timer = window.setInterval(() => { void refreshCounts(); }, 15000);
    return () => window.clearInterval(timer);
  }, [viewMode]);
  const isEditingSavedCount = !!selectedCount;

  const buildNewLines = (): WorkingLine[] => products
    .map(product => {
      const theoreticalQty = product.productType === 'serial'
        ? serials.filter(s => s.productId === product.id && s.status === 'available').length
        : product.stock || 0;
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        theoreticalQty,
        physicalQty: 0,
        difference: 0,
        category: emptyWorkingCategory(),
        notes: '',
      };
    })
    .filter(line => line.theoreticalQty > 0);

  const startNewCount = () => {
    setSelectedCount(null);
    setCountLines(buildNewLines());
    setCountedSerials(new Set());
    setUnrecognizedScans([]);
    setShowReport(false);
    setScanFeedback(null);
    setScannerInput('');
    setViewMode('count');
  };

  const openSavedCountForEdit = (count: WeeklyInventoryCount) => {
    setSelectedCount(count);
    // أثناء التعديل نعيد الحالة إلى محايدة حتى لا نعرض نتيجة قديمة قبل إعادة الحفظ.
    setCountLines(count.lines.map(line => ({ ...line, category: emptyWorkingCategory() })));
    setCountedSerials(new Set(count.countedSerialIds || []));
    setUnrecognizedScans([...(count.unrecognizedScans || [])]);
    setShowReport(false);
    setScanFeedback(null);
    setScannerInput('');
    setViewMode('count');
  };

  const scanSerialIntoCount = (code: string) => {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return;
    const serial = serials.find(s =>
      s.status === 'available' &&
      [s.serial, s.imei1, s.imei2].filter(Boolean).some(value => String(value).toLowerCase() === normalized)
    );
    if (!serial) {
      setUnrecognizedScans(prev => prev.includes(code.trim()) ? prev : [...prev, code.trim()]);
      setScanFeedback({ id: Date.now(), type: 'error', message: `⚠️ زيادة/غير موجود بالنظام: ${code.trim()}` });
      return;
    }
    if (countedSerials.has(serial.id)) {
      setScanFeedback({ id: Date.now(), type: 'error', message: `↩️ تم تسجيل ${serial.serial} بالفعل في هذا الجرد` });
      return;
    }
    setCountedSerials(prev => new Set(prev).add(serial.id));
    setCountLines(lines => lines.map(line => {
      if (line.productId !== serial.productId) return line;
      const physicalQty = line.physicalQty + 1;
      return {
        ...line,
        physicalQty,
        difference: physicalQty - line.theoreticalQty,
        category: emptyWorkingCategory(),
        notes: line.notes ? `${line.notes}, ${serial.serial}` : serial.serial,
      };
    }));
    setScanFeedback({ id: Date.now(), type: 'success', message: `✅ تم جرد ${serial.serial}` });
  };

  const updatePhysicalQty = (productId: string, physicalQty: number) => {
    const safeQty = Math.max(0, Number.isFinite(physicalQty) ? physicalQty : 0);
    setCountLines(lines => lines.map(line => line.productId === productId ? {
      ...line,
      physicalQty: safeQty,
      difference: safeQty - line.theoreticalQty,
      category: emptyWorkingCategory(),
    } : line));
  };

  const finalizeLines = (lines: WorkingLine[]): InventoryCountLine[] => lines.map(line => {
    const category = finalCategory(line.theoreticalQty, line.physicalQty);
    let notes = line.notes || '';
    if (category === 'shortage' && line.productId) {
      const missing = serials
        .filter(s => s.productId === line.productId && s.status === 'available' && !countedSerials.has(s.id))
        .map(s => s.serial)
        .filter(Boolean);
      if (missing.length) notes = `سيريالات لم يتم جردها: ${missing.join(', ')}`;
    }
    return { ...line, category, notes };
  });

  const saveCount = () => {
    if (!countLines.length) return;
    const finalizedLines = finalizeLines(countLines);
    const totalTheoretical = finalizedLines.reduce((sum, l) => sum + l.theoreticalQty, 0);
    const totalPhysical = finalizedLines.reduce((sum, l) => sum + l.physicalQty, 0);
    const totalDifference = totalPhysical - totalTheoretical;
    const matchedCount = finalizedLines.filter(l => l.category === 'matched').length;
    const shortageItems = finalizedLines.filter(l => l.category === 'shortage').length;
    const surplusItems = finalizedLines.filter(l => l.category === 'surplus').length;
    const accuracyPercentage = finalizedLines.length ? (matchedCount / finalizedLines.length) * 100 : 0;
    const now = new Date().toISOString();

    const saved: WeeklyInventoryCount = selectedCount
      ? {
          ...selectedCount,
          lines: finalizedLines,
          unrecognizedScans: [...unrecognizedScans],
          countedSerialIds: Array.from(countedSerials),
          status: 'completed',
          endDate: getTodayStr(),
          totalTheoretical,
          totalPhysical,
          totalDifference,
          accuracyPercentage,
          shortageItems,
          surplusItems,
        }
      : {
          id: makeInventoryCountId(),
          weekNumber: currentWeek,
          year: currentYear,
          startDate: getTodayStr(),
          endDate: getTodayStr(),
          lines: finalizedLines,
          unrecognizedScans: [...unrecognizedScans],
          countedSerialIds: Array.from(countedSerials),
          status: 'completed',
          totalTheoretical,
          totalPhysical,
          totalDifference,
          accuracyPercentage,
          shortageItems,
          surplusItems,
          createdAt: now,
        };

    if (selectedCount) onUpdateCount(saved);
    else onAddCount(saved);
    setVisibleCounts(prev => [saved, ...prev.filter(c => c.id !== saved.id)]);
    setSelectedCount(saved);
    setCountLines(finalizedLines.map(line => ({ ...line })));
    setShowReport(true);
    setScanFeedback(null);
  };

  const matchedLines = useMemo(() => countLines.filter(l => l.category === 'matched'), [countLines]);
  const shortageLines = useMemo(() => countLines.filter(l => l.category === 'shortage'), [countLines]);
  const surplusLines = useMemo(() => countLines.filter(l => l.category === 'surplus'), [countLines]);
  const pendingLines = useMemo(() => countLines.filter(l => l.category === 'pending'), [countLines]);

  const resetToList = () => {
    setViewMode('list');
    setSelectedCount(null);
    setCountLines([]);
    setShowReport(false);
    setUnrecognizedScans([]);
    setCountedSerials(new Set());
    setScannerInput('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📦 الجرد الأسبوعي الفيزيائي</h2>
          <p className="text-gray-500 text-sm">أسبوع {currentWeek} - {currentYear}</p>
        </div>
        {viewMode === 'list' && (
          <div className="flex items-center gap-2">
          <button onClick={refreshCounts} disabled={refreshing} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/> تحديث الجردات</button>
          <button onClick={startNewCount} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> جرد جديد
          </button>
          </div>
        )}
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-3">
          {(visibleCounts || []).length > 0 ? visibleCounts.map(count => (
            <div key={count.id} className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-white">أسبوع {count.weekNumber} - {count.year}</div>
                  <div className="text-xs text-gray-500">{count.startDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${count.status === 'approved' ? 'bg-green-900/30 text-green-300' : count.status === 'completed' ? 'bg-blue-900/30 text-blue-300' : 'bg-yellow-900/30 text-yellow-300'}`}>
                    {count.status === 'approved' ? '✅ معتمد' : count.status === 'completed' ? '✓ مكتمل' : '📝 مسودة'}
                  </span>
                  <button onClick={() => openSavedCountForEdit(count)} className="btn-secondary text-xs">عرض / تعديل</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="bg-blue-900/20 rounded-lg p-2 text-center"><div className="text-blue-300 font-mono">{count.totalTheoretical}</div><div className="text-gray-500">نظري</div></div>
                <div className="bg-green-900/20 rounded-lg p-2 text-center"><div className="text-green-300 font-mono">{count.totalPhysical}</div><div className="text-gray-500">فعلي</div></div>
                <div className={`rounded-lg p-2 text-center ${count.totalDifference === 0 ? 'bg-emerald-900/20' : count.totalDifference < 0 ? 'bg-red-900/20' : 'bg-orange-900/20'}`}><div className={`font-mono ${count.totalDifference === 0 ? 'text-emerald-300' : count.totalDifference < 0 ? 'text-red-300' : 'text-orange-300'}`}>{count.totalDifference > 0 ? '+' : ''}{count.totalDifference}</div><div className="text-gray-500">فرق</div></div>
                <div className="bg-purple-900/20 rounded-lg p-2 text-center"><div className="text-purple-300 font-mono">{count.accuracyPercentage.toFixed(1)}%</div><div className="text-gray-500">دقة</div></div>
              </div>
            </div>
          )) : (
            <div className="bg-elevated border border-white/10 rounded-2xl p-8 text-center text-gray-500"><AlertCircle size={32} className="mx-auto mb-3 opacity-50" /><p>لا توجد جردات أسبوعية بعد</p></div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-elevated border border-emerald-700/30 rounded-2xl p-4">
            <div className="font-bold text-white">🔗 الجرد بالسكانر اللاسلكي</div>
            <div className="text-xs text-gray-500 mt-1">وصل Deli S228W بالموبايل أو اللابتوب بوضع Keyboard/HID. السكانر يكتب الكود في الخانة ويضغط Enter تلقائيًا.</div>
            <input autoFocus value={scannerInput} onChange={e => setScannerInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanSerialIntoCount(scannerInput); setScannerInput(''); } }} placeholder="جاهز لاستقبال Serial / IMEI من السكانر..." className="input-dark w-full mt-3" />
            {scanFeedback && <div className={`text-xs mt-2 ${scanFeedback.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{scanFeedback.message}</div>}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 text-center"><div className="text-emerald-300 font-mono text-lg">{matchedLines.length}</div><div className="text-xs text-gray-500">مطابق</div></div>
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center"><div className="text-red-300 font-mono text-lg">{shortageLines.length}</div><div className="text-xs text-gray-500">ناقص</div></div>
            <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3 text-center"><div className="text-orange-300 font-mono text-lg">{surplusLines.length + unrecognizedScans.length}</div><div className="text-xs text-gray-500">زيادة</div></div>
            <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3 text-center"><div className="text-gray-300 font-mono text-lg">{pendingLines.length}</div><div className="text-xs text-gray-500">لم يُحسم</div></div>
          </div>

          <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-violet-900/30"><th className="text-right px-3 py-2 text-gray-400">#</th><th className="text-right px-3 py-2 text-gray-400">المنتج</th><th className="text-center px-3 py-2 text-gray-400">SKU</th><th className="text-center px-3 py-2 text-gray-400">نظري</th><th className="text-center px-3 py-2 text-gray-400">فعلي</th><th className="text-center px-3 py-2 text-gray-400">فرق</th><th className="text-center px-3 py-2 text-gray-400">الحالة</th></tr></thead>
              <tbody>{countLines.map((line, idx) => (
                <tr key={line.productId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-white truncate">{line.productName}</td>
                  <td className="px-3 py-2 text-center text-gray-400 text-xs">{line.sku}</td>
                  <td className="px-3 py-2 text-center text-blue-300 font-mono">{line.theoreticalQty}</td>
                  <td className="px-3 py-2 text-center"><input type="number" value={line.physicalQty || ''} onChange={e => updatePhysicalQty(line.productId, parseInt(e.target.value) || 0)} className="input-dark w-16 text-center" min="0" /></td>
                  <td className="px-3 py-2 text-center font-mono font-bold text-gray-400">{line.difference > 0 ? '+' : ''}{line.difference}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${line.category === 'matched' ? 'bg-emerald-900/30 text-emerald-300' : line.category === 'shortage' ? 'bg-red-900/30 text-red-300' : line.category === 'surplus' ? 'bg-orange-900/30 text-orange-300' : 'bg-gray-700/50 text-gray-300'}`}>
                      {line.category === 'matched' ? '✓ مطابق' : line.category === 'shortage' ? '− ناقص' : line.category === 'surplus' ? '+ زيادة' : '— لم يُحسم'}
                    </span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {showReport && (
            <div className="print-area bg-white text-black rounded-2xl p-6 border border-violet-700/40">
              <div className="flex items-center justify-between gap-2 border-b pb-4">
                <div><h3 className="font-bold text-2xl">ONE — تقرير نتيجة الجرد الأسبوعي</h3><div className="text-sm mt-1">أسبوع {selectedCount?.weekNumber || currentWeek} - {selectedCount?.year || currentYear} • التاريخ: {selectedCount?.endDate || getTodayStr()}</div></div>
                <button onClick={() => window.print()} className="btn-primary flex items-center gap-2 print:hidden"><Printer size={16}/> طباعة التقرير</button>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-5">
                <div className="p-3 rounded-lg bg-emerald-50 text-center"><div className="font-bold text-lg">{matchedLines.length}</div><div className="text-sm">مطابق</div></div>
                <div className="p-3 rounded-lg bg-red-50 text-center"><div className="font-bold text-lg">{shortageLines.length}</div><div className="text-sm">ناقص</div></div>
                <div className="p-3 rounded-lg bg-orange-50 text-center"><div className="font-bold text-lg">{surplusLines.length + unrecognizedScans.length}</div><div className="text-sm">زيادة / غير موجود</div></div>
                <div className="p-3 rounded-lg bg-blue-50 text-center"><div className="font-bold text-lg">{countLines.length}</div><div className="text-sm">إجمالي الأصناف</div></div>
              </div>

              <section className="mt-6"><h4 className="font-bold text-lg mb-2">✅ المطابق</h4>{matchedLines.length ? <table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2 text-right">المنتج</th><th className="p-2">SKU</th><th className="p-2">نظري</th><th className="p-2">فعلي</th><th className="p-2">فرق</th><th className="p-2">الحالة</th></tr></thead><tbody>{matchedLines.map(l => <tr key={l.productId} className="border-b"><td className="p-2">{l.productName}</td><td className="p-2 text-center">{l.sku || '-'}</td><td className="p-2 text-center">{l.theoreticalQty}</td><td className="p-2 text-center">{l.physicalQty}</td><td className="p-2 text-center">0</td><td className="p-2 text-center">مطابق</td></tr>)}</tbody></table> : <div className="text-sm">لا توجد أصناف مطابقة.</div>}</section>

              <section className="mt-6"><h4 className="font-bold text-lg mb-2">🔴 الناقص</h4>{shortageLines.length ? <table className="w-full text-sm border-collapse"><thead><tr className="border-b-2"><th className="p-2 text-right">المنتج</th><th className="p-2">SKU</th><th className="p-2">نظري</th><th className="p-2">فعلي</th><th className="p-2">فرق</th><th className="p-2 text-right">السيريالات غير المجردة</th></tr></thead><tbody>{shortageLines.map(l => <tr key={l.productId} className="border-b"><td className="p-2">{l.productName}</td><td className="p-2 text-center">{l.sku || '-'}</td><td className="p-2 text-center">{l.theoreticalQty}</td><td className="p-2 text-center">{l.physicalQty}</td><td className="p-2 text-center">{l.difference}</td><td className="p-2 text-xs">{l.notes || '-'}</td></tr>)}</tbody></table> : <div className="text-sm">لا توجد أصناف ناقصة.</div>}</section>

              <section className="mt-6"><h4 className="font-bold text-lg mb-2">🟠 الزيادة / غير موجود بالنظام</h4>{surplusLines.length || unrecognizedScans.length ? <>
                {surplusLines.length ? <table className="w-full text-sm border-collapse mb-3"><thead><tr className="border-b-2"><th className="p-2 text-right">المنتج</th><th className="p-2">SKU</th><th className="p-2">نظري</th><th className="p-2">فعلي</th><th className="p-2">فرق</th></tr></thead><tbody>{surplusLines.map(l => <tr key={l.productId} className="border-b"><td className="p-2">{l.productName}</td><td className="p-2 text-center">{l.sku || '-'}</td><td className="p-2 text-center">{l.theoreticalQty}</td><td className="p-2 text-center">{l.physicalQty}</td><td className="p-2 text-center">+{l.difference}</td></tr>)}</tbody></table> : null}
                {unrecognizedScans.length ? <div><div className="font-semibold mb-1">أكواد تم مسحها وغير موجودة في النظام:</div><div className="flex flex-wrap gap-2">{unrecognizedScans.map(code => <span key={code} className="px-2 py-1 rounded bg-orange-50 font-mono text-sm">{code}</span>)}</div></div> : null}
              </> : <div className="text-sm">لا توجد زيادة أو أكواد غير معروفة.</div>}</section>

              <div className="mt-8 pt-4 border-t text-sm grid grid-cols-3 gap-4"><div><strong>إجمالي نظري:</strong> {countLines.reduce((s,l) => s + l.theoreticalQty, 0)}</div><div><strong>إجمالي فعلي:</strong> {countLines.reduce((s,l) => s + l.physicalQty, 0)}</div><div><strong>الفرق:</strong> {countLines.reduce((s,l) => s + l.difference, 0)}</div></div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button onClick={resetToList} className="btn-secondary flex items-center gap-1"><X size={14} /> إلغاء</button>
            <button onClick={saveCount} className="btn-primary flex items-center gap-1"><Save size={14} /> {isEditingSavedCount ? 'حفظ التعديلات' : 'حفظ الجرد'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
