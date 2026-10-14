// src/pages/InventoryReports.tsx
// أرشيف المخزون اليومي: لقطة كاملة لكل يوم (منتج بمنتج + السيريالات) محفوظة في Firebase.
// بتتحدّث تلقائياً مع كل حركة في المخزون، فآخر لقطة في اليوم = مخزون نهاية اليوم.
import React, { useEffect, useMemo, useState } from 'react';
import { Product, SerialItem } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Download, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { loadCollection } from '../services/firebasePersistence';
import { buildInventorySnapshot, localDateStr, InventorySnapshotDoc, InventorySnapshotItem } from '../utils/inventoryArchive';

interface Props {
  products: Product[];
  serials: SerialItem[];
}

type Mode = 'archive' | 'day' | 'compare';

const Delta = ({ v }: { v: number }) =>
  v === 0 ? <span className="text-gray-600">—</span>
    : <span className={v > 0 ? 'text-green-300' : 'text-red-300'}>{v > 0 ? `+${v}` : v}</span>;

export default function InventoryReports({ products, serials }: Props) {
  const today = localDateStr();
  const [mode, setMode] = useState<Mode>('archive');
  const [selectedDate, setSelectedDate] = useState(today);
  const [saved, setSaved] = useState<InventorySnapshotDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [openSerials, setOpenSerials] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoading(true); setLoadError('');
    try {
      setSaved(await loadCollection<InventorySnapshotDoc>('inventorySnapshots'));
    } catch (e) {
      console.error('[Firebase] load inventorySnapshots failed:', e);
      setLoadError('تعذر تحميل الأرشيف من Firebase');
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  // لقطة النهارده بتتحسب حية من المخزون الحالي، وباقي الأيام من الأرشيف المحفوظ
  const liveToday = useMemo(() => buildInventorySnapshot(products, serials, today), [products, serials, today]);
  const days = useMemo(() => {
    const map = new Map<string, InventorySnapshotDoc>();
    saved.forEach(d => { if (d?.date) map.set(d.date, d); });
    map.set(today, liveToday);
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [saved, liveToday, today]);

  const dayByDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days]);
  const prevOf = (date: string) => days.find(d => d.date < date);
  const current = dayByDate.get(selectedDate);
  const previous = current ? prevOf(current.date) : undefined;
  const maxQty = Math.max(1, ...days.slice(0, 30).map(d => d.totalQty));

  const openDay = (date: string, m: Mode = 'day') => { setSelectedDate(date); setSearch(''); setMode(m); };

  const rows = useMemo(() => {
    if (!current) return [];
    const prevQty = new Map((previous?.items || []).map(i => [i.productId, i.qty]));
    const q = search.trim().toLowerCase();
    return current.items
      .filter(i => !q || `${i.name} ${i.sku}`.toLowerCase().includes(q) || (i.serials || []).some(s => s.toLowerCase().includes(q)))
      .map(i => ({ ...i, delta: previous ? i.qty - (prevQty.get(i.productId) || 0) : 0 }));
  }, [current, previous, search]);

  // مقارنة اليوم المختار باليوم المحفوظ اللي قبله
  const comparison = useMemo(() => {
    if (!current || !previous) return null;
    const prevMap = new Map(previous.items.map(i => [i.productId, i]));
    const curMap = new Map(current.items.map(i => [i.productId, i]));
    const changed: { item: InventorySnapshotItem; before: number; after: number; outSerials: string[]; inSerials: string[] }[] = [];
    current.items.forEach(i => {
      const p = prevMap.get(i.productId);
      const before = p?.qty || 0;
      const prevSet = new Set(p?.serials || []);
      const curSet = new Set(i.serials || []);
      const inSerials = [...curSet].filter(s => !prevSet.has(s));
      const outSerials = [...prevSet].filter(s => !curSet.has(s));
      if (before !== i.qty || inSerials.length || outSerials.length) changed.push({ item: i, before, after: i.qty, outSerials, inSerials });
    });
    previous.items.forEach(p => {
      if (!curMap.has(p.productId)) changed.push({ item: p, before: p.qty, after: 0, outSerials: p.serials || [], inSerials: [] });
    });
    changed.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
    return changed;
  }, [current, previous]);

  const downloadDay = () => {
    if (!current) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(current.items.map(i => ({
      'المنتج': i.name, 'الكود': i.sku, 'النوع': i.type === 'serial' ? 'سيريال' : 'عادي',
      'الكمية': i.qty, 'قيمة التكلفة': Math.round(i.cost), 'قيمة البيع': Math.round(i.sale),
    }))), 'مخزون اليوم');
    const serialRows = current.items.flatMap(i => (i.serials || []).map(s => ({ 'المنتج': i.name, 'السيريال': s })));
    if (serialRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serialRows), 'السيريالات');
    XLSX.writeFile(wb, `inventory-${current.date}.xlsx`);
  };

  const tab = (m: Mode, label: string) => (
    <button key={m} onClick={() => setMode(m)}
      className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${mode === m ? 'border-violet-500 text-violet-300' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
      {label}
    </button>
  );

  const dateLabel = (d: string) => (d === today ? `${d} (اليوم)` : d);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📅 أرشيف المخزون اليومي</h2>
          <p className="text-gray-500 text-sm">
            {days.length} يوم محفوظ — النظام بيحفظ مخزون كل يوم تلقائياً، وآخر نسخة في اليوم هي مخزون نهاية اليوم.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="input-dark">
            {days.map(d => <option key={d.date} value={d.date}>{dateLabel(d.date)}</option>)}
          </select>
          <button onClick={refresh} disabled={loading} className="btn-secondary flex items-center gap-1 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
        </div>
      </div>
      {loadError && <div className="text-sm text-red-300 bg-red-900/20 border border-red-700/30 rounded-xl p-3">⚠️ {loadError}</div>}

      <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
        {tab('archive', '📆 الأرشيف اليومي')}
        {tab('day', '📦 مخزون يوم بالتفصيل')}
        {tab('compare', '🔄 مقارنة بالأمس')}
      </div>

      {/* ============ الأرشيف: آخر 30 يوم، الضغط على أي يوم يفتح مخزونه ============ */}
      {mode === 'archive' && (
        <div className="space-y-4">
          {current && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">القطع ({dateLabel(current.date)})</div>
                <div className="text-2xl font-bold text-blue-300 mt-2">{current.totalQty}</div>
              </div>
              <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">عدد المنتجات</div>
                <div className="text-2xl font-bold text-violet-300 mt-2">{current.productCount}</div>
              </div>
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">قيمة بالتكلفة</div>
                <div className="text-2xl font-bold text-amber-300 mt-2">{formatCurrency(current.totalCost)}</div>
              </div>
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-500">قيمة بسعر البيع</div>
                <div className="text-2xl font-bold text-green-300 mt-2">{formatCurrency(current.totalSale)}</div>
              </div>
            </div>
          )}

          <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
            <h3 className="font-bold text-white mb-1">📊 آخر 30 يوم</h3>
            <p className="text-xs text-gray-500 mb-3">اضغط على أي يوم عشان تفتح مخزونه بالتفصيل (كل منتج وسيريالاته).</p>
            <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
              {days.slice(0, 30).map(d => {
                const prev = prevOf(d.date);
                const diff = prev ? d.totalQty - prev.totalQty : 0;
                return (
                  <button key={d.date} onClick={() => openDay(d.date)}
                    className={`w-full text-right p-2.5 rounded-lg border transition-all hover:border-violet-500/60 ${selectedDate === d.date ? 'bg-violet-900/30 border-violet-500/60' : 'bg-muted-bg border-white/10'}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-white font-medium w-36 shrink-0">{dateLabel(d.date)}</span>
                      <span className="text-blue-300 w-20 shrink-0">{d.totalQty} قطعة</span>
                      <span className="text-gray-400 flex-1 hidden sm:block">تكلفة {formatCurrency(d.totalCost)}</span>
                      <span className="w-14 text-left shrink-0 text-xs">{prev ? <Delta v={diff} /> : <span className="text-gray-600">أول يوم</span>}</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/5 mt-2 overflow-hidden">
                      <div className="h-full bg-blue-500/60" style={{ width: `${Math.max(2, (d.totalQty / maxQty) * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-600 mt-3">
              الأيام اللي النظام ما اتفتحش فيها مش بتظهر (المخزون فيها = آخر يوم محفوظ قبلها). الأرشيف بيبدأ من أول يوم اشتغلت فيه النسخة دي.
            </p>
          </div>
        </div>
      )}

      {/* ============ مخزون يوم بالتفصيل ============ */}
      {mode === 'day' && (
        <div className="space-y-3">
          {!current ? (
            <div className="text-center text-gray-500 py-10">مفيش لقطة محفوظة للتاريخ ده.</div>
          ) : <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-white">📦 مخزون {dateLabel(current.date)}</h3>
                <p className="text-xs text-gray-500">{current.totalQty} قطعة • {current.productCount} منتج • تكلفة {formatCurrency(current.totalCost)} • آخر حفظ {new Date(current.savedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <button onClick={downloadDay} className="btn-secondary text-sm flex items-center gap-1"><Download size={14} /> تحميل Excel</button>
            </div>
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم المنتج أو الكود أو السيريال..." className="input-dark w-full pr-9" />
            </div>
            <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-violet-900/20">
                  <tr>
                    <th className="text-right py-3 px-4 text-gray-400">المنتج</th>
                    <th className="text-center py-3 px-3 text-gray-400">الكمية</th>
                    {previous && <th className="text-center py-3 px-3 text-gray-400">عن {previous.date}</th>}
                    <th className="text-center py-3 px-3 text-gray-400">تكلفة</th>
                    <th className="text-center py-3 px-3 text-gray-400">بيع</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <React.Fragment key={r.productId}>
                      <tr className="border-t border-white/5 hover:bg-white/5">
                        <td className="py-2.5 px-4">
                          <div className="text-white">{r.name}</div>
                          <div className="text-xs text-gray-500 font-mono">{r.sku}</div>
                          {r.serials && r.serials.length > 0 && (
                            <button onClick={() => setOpenSerials(p => ({ ...p, [r.productId]: !p[r.productId] }))} className="text-xs text-violet-300 mt-1 flex items-center gap-1">
                              {openSerials[r.productId] ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {r.serials.length} سيريال
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-white font-semibold">{r.qty}</td>
                        {previous && <td className="py-2.5 px-3 text-center text-xs"><Delta v={r.delta} /></td>}
                        <td className="py-2.5 px-3 text-center text-gray-400">{formatCurrency(r.cost)}</td>
                        <td className="py-2.5 px-3 text-center text-gray-400">{formatCurrency(r.sale)}</td>
                      </tr>
                      {openSerials[r.productId] && r.serials && (
                        <tr className="bg-black/20"><td colSpan={previous ? 5 : 4} className="px-4 py-2">
                          <div className="flex flex-wrap gap-1" dir="ltr">
                            {r.serials.map(s => <span key={s} className="bg-purple-900/30 border border-purple-700/30 rounded px-2 py-0.5 text-xs text-purple-200 font-mono">{s}</span>)}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="text-center text-gray-500 py-8">مفيش نتائج.</td></tr>}
                </tbody>
              </table>
            </div>
          </>}
        </div>
      )}

      {/* ============ مقارنة باليوم المحفوظ اللي قبله ============ */}
      {mode === 'compare' && (
        <div className="space-y-3">
          {!current ? (
            <div className="text-center text-gray-500 py-10">مفيش لقطة محفوظة للتاريخ ده.</div>
          ) : !previous || !comparison ? (
            <div className="text-center text-gray-500 py-10">مفيش يوم محفوظ قبل {current.date} للمقارنة. المقارنة هتشتغل من تاني يوم.</div>
          ) : <>
            <div>
              <h3 className="font-bold text-white">🔄 {dateLabel(current.date)} مقارنةً بـ {previous.date}</h3>
              <p className="text-xs text-gray-500 mt-1">
                الإجمالي: {previous.totalQty} → {current.totalQty} قطعة ({current.totalQty - previous.totalQty >= 0 ? '+' : ''}{current.totalQty - previous.totalQty}) • بيظهر بس اللي اتغيّر.
              </p>
            </div>
            {comparison.length === 0 && <div className="text-center text-gray-500 py-8">مفيش أي تغيير في المخزون بين اليومين.</div>}
            <div className="space-y-2">
              {comparison.map(c => (
                <div key={c.item.productId} className="bg-elevated border border-white/10 rounded-xl p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white font-medium">{c.item.name}</span>
                    <span className="text-xs">
                      <span className="text-gray-400">{c.before} → {c.after}</span>{' '}
                      <Delta v={c.after - c.before} />
                    </span>
                  </div>
                  {(c.outSerials.length > 0 || c.inSerials.length > 0) && (
                    <div className="mt-1.5 text-xs space-y-1" dir="ltr">
                      {c.inSerials.length > 0 && <div className="text-green-300 font-mono">+ {c.inSerials.join('  ')}</div>}
                      {c.outSerials.length > 0 && <div className="text-red-300 font-mono">− {c.outSerials.join('  ')}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
