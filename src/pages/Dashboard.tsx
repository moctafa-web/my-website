import React, { useState } from 'react';
import { AppState, DailyClosing, TreasuryTransaction } from '../types';
import { formatCurrency, generateId, getTodayStr } from '../utils/helpers';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';

interface Props {
  state: AppState;
  onNavigate: (page: string) => void;
  onNewSale: () => void;
  onNewPurchase: () => void;
  onAddDailyClosing: (c: DailyClosing) => void;
  adjustTreasury: (type: 'cash' | 'bank', amount: number, dir: 'in' | 'out', desc: string) => void;
}

export default function Dashboard({ state, onNavigate, onNewSale, onNewPurchase, onAddDailyClosing, adjustTreasury }: Props) {
  const [showClosing, setShowClosing] = useState(false);
  const [closingData, setClosingData] = useState({
    closingCash: '',
    closingBank: '',
    notes: '',
  });
  const [showTreasury, setShowTreasury] = useState(false);
  const [treasuryForm, setTreasuryForm] = useState({
    type: 'cash' as 'cash' | 'bank',
    amount: '',
    direction: 'in' as 'in' | 'out',
    description: '',
  });

  const today = getTodayStr();

  // Today's stats
  const todaySales = state.saleInvoices.filter(i => i.date === today);
  const todayPurchases = state.purchaseInvoices.filter(i => i.date === today);
  const todayExpenses = state.expenses.filter(e => e.date === today);

  const todaySalesTotal = todaySales.reduce((s, i) => s + i.paid, 0);
  const todayPurchasesTotal = todayPurchases.reduce((s, i) => s + i.paid, 0);
  const todayExpensesTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);

  const totalProducts = state.products.length;
  const lowStock = state.products.filter(p => p.stock <= (p.minStock || 2) && p.stock > 0);
  const outOfStock = state.products.filter(p => p.stock === 0);
  const totalCustomers = state.customers.length;
  const pendingOrders = state.noonOrders.filter(o => o.status === 'pending');

  // Chart data - last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const sales = state.saleInvoices.filter(inv => inv.date === dateStr).reduce((s, inv) => s + inv.total, 0);
    const purchases = state.purchaseInvoices.filter(inv => inv.date === dateStr).reduce((s, inv) => s + inv.total, 0);
    return {
      date: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
      مبيعات: sales,
      مشتريات: purchases,
    };
  });

  const handleDailyClosing = () => {
    const closing: DailyClosing = {
      id: generateId(),
      date: today,
      openingCash: state.cashBalance,
      closingCash: parseFloat(closingData.closingCash) || 0,
      openingBank: state.bankBalance,
      closingBank: parseFloat(closingData.closingBank) || 0,
      totalSales: todaySalesTotal,
      totalPurchases: todayPurchasesTotal,
      totalExpenses: todayExpensesTotal,
      cashDifference: (parseFloat(closingData.closingCash) || 0) - state.cashBalance,
      bankDifference: (parseFloat(closingData.closingBank) || 0) - state.bankBalance,
      notes: closingData.notes,
      createdAt: new Date().toISOString(),
    };
    onAddDailyClosing(closing);
    setShowClosing(false);
    setClosingData({ closingCash: '', closingBank: '', notes: '' });
  };

  const handleTreasuryAdjust = () => {
    if (!treasuryForm.amount || !treasuryForm.description) return;
    adjustTreasury(treasuryForm.type, parseFloat(treasuryForm.amount), treasuryForm.direction, treasuryForm.description);
    setTreasuryForm({ type: 'cash', amount: '', direction: 'in', description: '' });
    setShowTreasury(false);
  };

  const cashDiff = closingData.closingCash ? parseFloat(closingData.closingCash) - state.cashBalance : null;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={onNewSale}
          className="bg-gradient-to-br from-violet-700 to-purple-900 hover:from-violet-600 hover:to-purple-800 border border-violet-500/40 rounded-2xl p-5 text-right transition-all hover:scale-105 hover:shadow-xl hover:shadow-violet-900/40 group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">🛒</div>
            <span className="text-violet-300 text-xs">سريع</span>
          </div>
          <div className="text-xl font-bold text-white">فاتورة بيع</div>
          <div className="text-violet-300 text-sm mt-1">إنشاء فاتورة مبيعات جديدة</div>
        </button>

        <button
          onClick={onNewPurchase}
          className="bg-gradient-to-br from-blue-800 to-indigo-900 hover:from-blue-700 hover:to-indigo-800 border border-blue-500/40 rounded-2xl p-5 text-right transition-all hover:scale-105 hover:shadow-xl hover:shadow-blue-900/40 group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">📦</div>
            <span className="text-blue-300 text-xs">شراء</span>
          </div>
          <div className="text-xl font-bold text-white">فاتورة شراء</div>
          <div className="text-blue-300 text-sm mt-1">استلام شحنة من مورد</div>
        </button>

// ✅ بعد - بيفتح صفحة DailyJournal
<button
  onClick={() => onNavigate('daily-journal')}
  className="bg-gradient-to-br from-slate-700 to-gray-900 hover:from-slate-600 hover:to-gray-800 border border-gray-600/40 rounded-2xl p-5 text-right transition-all hover:scale-105 hover:shadow-xl group"
>
  <div className="flex items-center justify-between mb-3">
    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">📒</div>
    <span className="text-gray-400 text-xs">يومي</span>
  </div>
  <div className="text-xl font-bold text-white">تقفيل اليومية</div>
  <div className="text-gray-400 text-sm mt-1">مراجعة وتقفيل حسابات اليوم</div>
</button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="مبيعات اليوم" value={formatCurrency(todaySalesTotal)} sub={`${todaySales.length} فاتورة`} icon="💰" color="green" />
        <StatCard title="مشتريات اليوم" value={formatCurrency(todayPurchasesTotal)} sub={`${todayPurchases.length} فاتورة`} icon="📦" color="blue" />
        <StatCard title="الكاش" value={formatCurrency(state.cashBalance)} sub="الرصيد الحالي" icon="💵" color="violet" onClick={() => setShowTreasury(true)} />
        <StatCard title="البنك" value={formatCurrency(state.bankBalance)} sub="الرصيد الحالي" icon="🏦" color="cyan" onClick={() => setShowTreasury(true)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المنتجات" value={totalProducts.toString()} sub={`${outOfStock.length} نفد من المخزون`} icon="📱" color="orange" onClick={() => onNavigate('inventory')} />
        <StatCard title="العملاء" value={totalCustomers.toString()} sub="إجمالي العملاء" icon="👥" color="teal" onClick={() => onNavigate('customers')} />
        <StatCard title="أوردرات نون" value={pendingOrders.length.toString()} sub="في انتظار الشحن" icon="🏪" color="yellow" onClick={() => onNavigate('noon')} />
        <StatCard title="مصروفات اليوم" value={formatCurrency(todayExpensesTotal)} sub={`${todayExpenses.length} عملية`} icon="💸" color="red" onClick={() => onNavigate('expenses')} />
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">📊 المبيعات والمشتريات - آخر 7 أيام</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={last7Days} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1a35', border: '1px solid #7c3aed40', borderRadius: 8, color: '#fff' }} formatter={(v: unknown) => [`${Number(v).toLocaleString('ar-EG')} ج.م`, '']} />
              <Area type="monotone" dataKey="مبيعات" stroke="#7c3aed" fill="url(#salesGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="مشتريات" stroke="#3b82f6" fill="url(#purchGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">⚠️ تنبيهات المخزون</h3>
          <div className="space-y-3 max-h-[220px] overflow-y-auto">
            {outOfStock.length === 0 && lowStock.length === 0 ? (
              <div className="text-center text-gray-500 py-8">✅ المخزون ممتاز</div>
            ) : (
              <>
                {outOfStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">
                    <span className="text-red-400 text-xs font-medium">{p.name}</span>
                    <span className="text-red-300 text-xs bg-red-900/40 px-2 py-0.5 rounded">نفد</span>
                  </div>
                ))}
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2">
                    <span className="text-yellow-400 text-xs font-medium">{p.name}</span>
                    <span className="text-yellow-300 text-xs">{p.stock} قطعة</span>
                  </div>
                ))}
              </>
            )}
          </div>
          {(outOfStock.length > 0 || lowStock.length > 0) && (
            <button onClick={() => onNavigate('inventory')} className="mt-3 w-full text-xs text-violet-400 hover:text-violet-300 py-1">عرض الكل →</button>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">🧾 آخر المبيعات</h3>
            <button onClick={() => onNavigate('sales')} className="text-xs text-violet-400 hover:text-violet-300">عرض الكل →</button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {state.saleInvoices.length === 0 ? (
              <div className="text-center text-gray-500 py-6">لا توجد فواتير بعد</div>
            ) : (
              state.saleInvoices.slice(-5).reverse().map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-white">{inv.customerName}</div>
                    <div className="text-xs text-gray-500">{inv.invoiceNumber} • {inv.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-400">{formatCurrency(inv.total)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                      {inv.status === 'paid' ? 'مدفوع' : inv.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">📦 آخر المشتريات</h3>
            <button onClick={() => onNavigate('purchases')} className="text-xs text-violet-400 hover:text-violet-300">عرض الكل →</button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {state.purchaseInvoices.length === 0 ? (
              <div className="text-center text-gray-500 py-6">لا توجد فواتير مشتريات بعد</div>
            ) : (
              state.purchaseInvoices.slice(-5).reverse().map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-white">{inv.supplierName}</div>
                    <div className="text-xs text-gray-500">{inv.invoiceNumber} • {inv.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-400">{formatCurrency(inv.total)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                      {inv.remaining > 0 ? `متبقي ${inv.remaining.toLocaleString('ar-EG')}` : 'مدفوع'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Daily Closing Modal */}
      {showClosing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowClosing(false)}>
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-5">🔒 تقفيل اليومية - {today}</h2>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-green-400 mb-1">مبيعات اليوم</div>
                <div className="text-sm font-bold text-green-300">{formatCurrency(todaySalesTotal)}</div>
              </div>
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-400 mb-1">مشتريات</div>
                <div className="text-sm font-bold text-blue-300">{formatCurrency(todayPurchasesTotal)}</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-red-400 mb-1">مصروفات</div>
                <div className="text-sm font-bold text-red-300">{formatCurrency(todayExpensesTotal)}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">رصيد الكاش النظام</div>
                  <div className="text-lg font-bold text-white">{formatCurrency(state.cashBalance)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">رصيد الكاش الفعلي (الدرج)</label>
                  <input
                    type="number"
                    value={closingData.closingCash}
                    onChange={e => setClosingData(p => ({ ...p, closingCash: e.target.value }))}
                    className="input-dark w-full"
                    placeholder="0"
                  />
                </div>
              </div>

              {cashDiff !== null && (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${Math.abs(cashDiff) < 1 ? 'bg-green-900/30 border border-green-700/30' : 'bg-red-900/30 border border-red-700/30'}`}>
                  {Math.abs(cashDiff) < 1 ? <CheckCircle size={16} className="text-green-400" /> : <AlertTriangle size={16} className="text-red-400" />}
                  <span className={Math.abs(cashDiff) < 1 ? 'text-green-400' : 'text-red-400'}>
                    {Math.abs(cashDiff) < 1 ? '✅ الكاش مضبوط' : `${cashDiff > 0 ? '📈 زيادة' : '⚠️ عجز'} ${Math.abs(cashDiff).toLocaleString('ar-EG')} ج.م`}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">رصيد البنك النظام</div>
                  <div className="text-lg font-bold text-white">{formatCurrency(state.bankBalance)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">رصيد البنك الفعلي</label>
                  <input
                    type="number"
                    value={closingData.closingBank}
                    onChange={e => setClosingData(p => ({ ...p, closingBank: e.target.value }))}
                    className="input-dark w-full"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">ملاحظات</label>
                <textarea
                  value={closingData.notes}
                  onChange={e => setClosingData(p => ({ ...p, notes: e.target.value }))}
                  className="input-dark w-full h-20 resize-none"
                  placeholder="أي ملاحظات..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={handleDailyClosing} className="btn-primary flex-1">🔒 تأكيد التقفيل</button>
              <button onClick={() => setShowClosing(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Treasury Adjust Modal */}
      {showTreasury && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowTreasury(false)}>
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-5">💰 إضافة حركة للخزنة</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, type: 'cash' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${treasuryForm.type === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}
                >
                  💵 كاش
                </button>
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, type: 'bank' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${treasuryForm.type === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}
                >
                  🏦 بنك
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, direction: 'in' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${treasuryForm.direction === 'in' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}
                >
                  + إيداع
                </button>
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, direction: 'out' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${treasuryForm.direction === 'out' ? 'bg-red-700/30 border-red-500/50 text-red-300' : 'border-white/10 text-gray-400'}`}
                >
                  - سحب
                </button>
              </div>
              <input type="number" value={treasuryForm.amount} onChange={e => setTreasuryForm(p => ({ ...p, amount: e.target.value }))} className="input-dark w-full" placeholder="المبلغ" />
              <input type="text" value={treasuryForm.description} onChange={e => setTreasuryForm(p => ({ ...p, description: e.target.value }))} className="input-dark w-full" placeholder="الوصف / السبب" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleTreasuryAdjust} className="btn-primary flex-1">تأكيد</button>
              <button onClick={() => setShowTreasury(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, sub, icon, color, onClick }: { title: string; value: string; sub: string; icon: string; color: string; onClick?: () => void }) {
  const colors: Record<string, string> = {
    green: 'from-green-900/40 to-green-900/10 border-green-700/30',
    blue: 'from-blue-900/40 to-blue-900/10 border-blue-700/30',
    violet: 'from-violet-900/40 to-violet-900/10 border-violet-700/30',
    cyan: 'from-cyan-900/40 to-cyan-900/10 border-cyan-700/30',
    orange: 'from-orange-900/40 to-orange-900/10 border-orange-700/30',
    teal: 'from-teal-900/40 to-teal-900/10 border-teal-700/30',
    yellow: 'from-yellow-900/40 to-yellow-900/10 border-yellow-700/30',
    red: 'from-red-900/40 to-red-900/10 border-red-700/30',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4 ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-gray-400 mb-1">{title}</div>
          <div className="text-lg font-bold text-white leading-tight">{value}</div>
          <div className="text-xs text-gray-500 mt-1">{sub}</div>
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  );
}
