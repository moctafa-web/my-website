// src/pages/Dashboard.tsx
import React, { useState } from 'react';
import { AppState } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface Props {
  state: AppState;
  onNavigate: (page: string) => void;
  onNewSale: () => void;
  onNewPurchase: () => void;
  adjustTreasury: (
    type: 'cash' | 'bank',
    amount: number,
    dir: 'in' | 'out',
    desc: string
  ) => void;
}

export default function Dashboard({
  state,
  onNavigate,
  onNewSale,
  onNewPurchase,
  adjustTreasury,
}: Props) {
  const [showTreasury, setShowTreasury]     = useState(false);
  const [showDebtBook, setShowDebtBook]     = useState(false);   // ← دفتر الديون
  const [debtTab, setDebtTab]               = useState<'owed' | 'owing'>('owed'); // owed=لينا، owing=ليهم

  const [treasuryForm, setTreasuryForm] = useState({
    type: 'cash' as 'cash' | 'bank',
    amount: '',
    direction: 'in' as 'in' | 'out',
    description: '',
  });

  const today = getTodayStr();

  /* ─── إحصائيات اليوم ─── */
  const todaySales     = state.saleInvoices.filter(i => i.date === today);
  const todayPurchases = state.purchaseInvoices.filter(i => i.date === today);

  const todaySalesTotal     = todaySales.reduce((s, i) => s + i.paid, 0);
  const todayPurchasesTotal = todayPurchases.reduce((s, i) => s + i.paid, 0);

  const outOfStock = state.products.filter(p => p.stock === 0);
  const lowStock   = state.products.filter(
    p => p.stock > 0 && p.stock <= (p.minStock || 2)
  );

  /* ─── الأجهزة بدون سعر شراء ─── */
  const noCostProducts = state.products.filter(
    p => !p.costPrice || p.costPrice === 0
  );

  /* ─── دفتر الديون ─── */
  // لينا عندهم: عملاء عليهم رصيد (totalInvoices - totalPaid + openingBalance > 0)
  const customersOwing = state.customers
    .map(c => {
      const balance =
        (c.totalInvoices || 0) -
        (c.totalPaid    || 0) +
        (c.openingBalance || 0);
      return { ...c, balance };
    })
    .filter(c => c.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // ليهم عندنا: موردين لهم رصيد (totalInvoices - totalPaid + openingBalance > 0)
  const suppliersOwed = state.suppliers
    .map(s => {
      const balance =
        (s.totalInvoices || 0) -
        (s.totalPaid    || 0) +
        (s.openingBalance || 0);
      return { ...s, balance };
    })
    .filter(s => s.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalOwing = customersOwing.reduce((s, c) => s + c.balance, 0);
  const totalOwed  = suppliersOwed.reduce((s, c) => s + c.balance, 0);

  /* ─── بيانات الرسم البياني ─── */
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
      مبيعات:  state.saleInvoices.filter(inv => inv.date === dateStr)
                 .reduce((s, inv) => s + inv.total, 0),
      مشتريات: state.purchaseInvoices.filter(inv => inv.date === dateStr)
                 .reduce((s, inv) => s + inv.total, 0),
    };
  });

  /* ─── تعديل الخزينة ─── */
  const handleTreasuryAdjust = () => {
    if (!treasuryForm.amount || !treasuryForm.description) return;
    adjustTreasury(
      treasuryForm.type,
      parseFloat(treasuryForm.amount),
      treasuryForm.direction,
      treasuryForm.description
    );
    setTreasuryForm({ type: 'cash', amount: '', direction: 'in', description: '' });
    setShowTreasury(false);
  };

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* فاتورة بيع */}
        <button
          onClick={onNewSale}
          className="bg-gradient-to-br from-violet-700 to-purple-900 hover:from-violet-600 hover:to-purple-800
                     border border-violet-500/40 rounded-2xl p-5 text-right transition-all
                     hover:scale-105 hover:shadow-xl hover:shadow-violet-900/40 group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl
                            group-hover:scale-110 transition-transform">🛒</div>
            <span className="text-violet-300 text-xs">سريع</span>
          </div>
          <div className="text-xl font-bold text-white">فاتورة بيع</div>
          <div className="text-violet-300 text-sm mt-1">إنشاء فاتورة مبيعات جديدة</div>
        </button>

        {/* فاتورة شراء */}
        <button
          onClick={onNewPurchase}
          className="bg-gradient-to-br from-blue-800 to-indigo-900 hover:from-blue-700 hover:to-indigo-800
                     border border-blue-500/40 rounded-2xl p-5 text-right transition-all
                     hover:scale-105 hover:shadow-xl hover:shadow-blue-900/40 group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl
                            group-hover:scale-110 transition-transform">📦</div>
            <span className="text-blue-300 text-xs">شراء</span>
          </div>
          <div className="text-xl font-bold text-white">فاتورة شراء</div>
          <div className="text-blue-300 text-sm mt-1">استلام شحنة من مورد</div>
        </button>

        {/* تقفيل اليومية */}
        <button
          onClick={() => onNavigate('journal')}
          className="bg-gradient-to-br from-slate-700 to-gray-900 hover:from-slate-600 hover:to-gray-800
                     border border-gray-600/40 rounded-2xl p-5 text-right transition-all
                     hover:scale-105 hover:shadow-xl group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl
                            group-hover:scale-110 transition-transform">🔒</div>
            <span className="text-gray-400 text-xs">يومي</span>
          </div>
          <div className="text-xl font-bold text-white">تقفيل اليومية</div>
          <div className="text-gray-400 text-sm mt-1">مراجعة وتقفيل حسابات اليوم</div>
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="مبيعات اليوم"
          value={formatCurrency(todaySalesTotal)}
          sub={`${todaySales.length} فاتورة`}
          icon="💰" color="green"
        />
        <StatCard
          title="مشتريات اليوم"
          value={formatCurrency(todayPurchasesTotal)}
          sub={`${todayPurchases.length} فاتورة`}
          icon="📦" color="blue"
        />
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="الكاش"
            value={formatCurrency(state.cashBalance)}
            sub="الرصيد الحالي"
            icon="💵" color="violet"
            onClick={() => setShowTreasury(true)}
          />
          <StatCard
            title="البنك"
            value={formatCurrency(state.bankBalance)}
            sub="الرصيد الحالي"
            icon="🏦" color="cyan"
            onClick={() => setShowTreasury(true)}
          />
        </div>
      </div>

      {/* ══ دفتر الديون + الأجهزة بدون سعر (صف واحد) ══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── دفتر الديون ── */}
        <button
          onClick={() => setShowDebtBook(true)}
          className="bg-gradient-to-br from-amber-900/30 to-orange-900/20
                     border border-amber-600/30 rounded-2xl p-5 text-right
                     hover:border-amber-500/50 hover:scale-[1.02] transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center
                            text-2xl group-hover:scale-110 transition-transform">📒</div>
            <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-1 rounded-lg">
              اضغط للتفاصيل
            </span>
          </div>

          <div className="text-xl font-bold text-white mb-3">دفتر الديون</div>

          <div className="grid grid-cols-2 gap-3">
            {/* لينا */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp size={12} className="text-green-400" />
                <span className="text-xs text-green-400">لينا عندهم</span>
              </div>
              <div className="text-base font-bold text-green-300">
                {formatCurrency(totalOwing)}
              </div>
              <div className="text-xs text-green-500 mt-0.5">
                {customersOwing.length} عميل
              </div>
            </div>

            {/* ليهم */}
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingDown size={12} className="text-red-400" />
                <span className="text-xs text-red-400">ليهم عندنا</span>
              </div>
              <div className="text-base font-bold text-red-300">
                {formatCurrency(totalOwed)}
              </div>
              <div className="text-xs text-red-500 mt-0.5">
                {suppliersOwed.length} مورد
              </div>
            </div>
          </div>
        </button>

        {/* ── أجهزة بدون سعر شراء ── */}
        <div className={`rounded-2xl p-5 border transition-all
          ${noCostProducts.length > 0
            ? 'bg-gradient-to-br from-red-900/20 to-rose-900/10 border-red-600/30'
            : 'bg-gradient-to-br from-green-900/10 to-emerald-900/5 border-green-700/20'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl
              ${noCostProducts.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
              {noCostProducts.length > 0 ? '⚠️' : '✅'}
            </div>
            {noCostProducts.length > 0 && (
              <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded-lg
                               animate-pulse font-bold">
                {noCostProducts.length} منتج بدون سعر
              </span>
            )}
          </div>

          <div className="text-base font-bold text-white mb-3">
            أجهزة بدون سعر شراء
          </div>

          {noCostProducts.length === 0 ? (
            <div className="text-sm text-green-400">
              ✅ جميع المنتجات لها سعر شراء
            </div>
          ) : (
            <div className="space-y-2 max-h-[120px] overflow-y-auto">
              {noCostProducts.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between
                             bg-red-900/20 border border-red-700/20 rounded-xl px-3 py-2"
                >
                  <div>
                    <div className="text-sm text-white font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.sku}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{p.stock} قطعة</span>
                    <button
                      onClick={() => onNavigate('products')}
                      className="text-xs text-violet-400 hover:text-violet-300
                                 bg-violet-900/20 px-2 py-1 rounded-lg transition-colors"
                    >
                      تعديل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {noCostProducts.length > 0 && (
            <button
              onClick={() => onNavigate('products')}
              className="mt-3 w-full text-xs text-violet-400 hover:text-violet-300
                         py-1.5 border border-violet-700/30 rounded-xl transition-colors"
            >
              الذهاب لصفحة المنتجات →
            </button>
          )}
        </div>
      </div>

      {/* ── Chart + Stock Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">
            📊 المبيعات والمشتريات - آخر 7 أيام
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={last7Days} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a35',
                  border: '1px solid #7c3aed40',
                  borderRadius: 8,
                  color: '#fff',
                }}
                formatter={(v: unknown) => [
                  `${Number(v).toLocaleString('ar-EG')} ج.م`, '',
                ]}
              />
              <Area
                type="monotone" dataKey="مبيعات"
                stroke="#7c3aed" fill="url(#salesGrad)" strokeWidth={2}
              />
              <Area
                type="monotone" dataKey="مشتريات"
                stroke="#3b82f6" fill="url(#purchGrad)" strokeWidth={2}
              />
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
                  <div key={p.id}
                    className="flex items-center justify-between
                               bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">
                    <span className="text-red-400 text-xs font-medium">{p.name}</span>
                    <span className="text-red-300 text-xs bg-red-900/40 px-2 py-0.5 rounded">نفد</span>
                  </div>
                ))}
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id}
                    className="flex items-center justify-between
                               bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2">
                    <span className="text-yellow-400 text-xs font-medium">{p.name}</span>
                    <span className="text-yellow-300 text-xs">{p.stock} قطعة</span>
                  </div>
                ))}
              </>
            )}
          </div>
          {(outOfStock.length > 0 || lowStock.length > 0) && (
            <button
              onClick={() => onNavigate('inventory')}
              className="mt-3 w-full text-xs text-violet-400 hover:text-violet-300 py-1"
            >
              عرض الكل →
            </button>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* آخر المبيعات */}
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">🧾 آخر المبيعات</h3>
            <button
              onClick={() => onNavigate('sales')}
              className="text-xs text-violet-400 hover:text-violet-300"
            >
              عرض الكل →
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {state.saleInvoices.length === 0 ? (
              <div className="text-center text-gray-500 py-6">لا توجد فواتير بعد</div>
            ) : (
              state.saleInvoices.slice(-5).reverse().map(inv => (
                <div key={inv.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-white">{inv.customerName}</div>
                    <div className="text-xs text-gray-500">
                      {inv.invoiceNumber} • {inv.date}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-400">
                      {formatCurrency(inv.total)}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${inv.status === 'paid'
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-yellow-900/40 text-yellow-400'}`}>
                      {inv.status === 'paid' ? 'مدفوع'
                        : inv.status === 'partial' ? 'جزئي' : 'غير مدفوع'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* آخر المشتريات */}
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">📦 آخر المشتريات</h3>
            <button
              onClick={() => onNavigate('purchases')}
              className="text-xs text-violet-400 hover:text-violet-300"
            >
              عرض الكل →
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {state.purchaseInvoices.length === 0 ? (
              <div className="text-center text-gray-500 py-6">
                لا توجد فواتير مشتريات بعد
              </div>
            ) : (
              state.purchaseInvoices.slice(-5).reverse().map(inv => (
                <div key={inv.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-white">{inv.supplierName}</div>
                    <div className="text-xs text-gray-500">
                      {inv.invoiceNumber} • {inv.date}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-400">
                      {formatCurrency(inv.total)}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${inv.status === 'paid'
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-yellow-900/40 text-yellow-400'}`}>
                      {inv.remaining > 0
                        ? `متبقي ${inv.remaining.toLocaleString('ar-EG')}`
                        : 'مدفوع'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL: دفتر الديون
      ══════════════════════════════════════════════════════════ */}
      {showDebtBook && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDebtBook(false)}
        >
          <div
            className="bg-[#12122a] border border-amber-700/30 rounded-2xl w-full max-w-2xl
                       max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5
                            border-b border-amber-700/20 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📒</span>
                <div>
                  <h2 className="text-xl font-bold text-white">دفتر الديون</h2>
                  <p className="text-xs text-gray-400">
                    {new Date().toLocaleDateString('ar-EG', {
                      weekday: 'long', year: 'numeric',
                      month: 'long', day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDebtBook(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-gray-400
                           hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Bar */}
            <div className="grid grid-cols-2 gap-3 p-4 border-b border-white/5 shrink-0">
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-green-400 mb-1">💚 إجمالي لينا</div>
                <div className="text-lg font-black text-green-300">
                  {formatCurrency(totalOwing)}
                </div>
                <div className="text-xs text-green-600">
                  من {customersOwing.length} عميل
                </div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-red-400 mb-1">❤️ إجمالي ليهم</div>
                <div className="text-lg font-black text-red-300">
                  {formatCurrency(totalOwed)}
                </div>
                <div className="text-xs text-red-600">
                  من {suppliersOwed.length} مورد
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-4 pb-0 shrink-0">
              <button
                onClick={() => setDebtTab('owed')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                  ${debtTab === 'owed'
                    ? 'bg-green-700/30 border border-green-500/40 text-green-300'
                    : 'border border-white/10 text-gray-400 hover:bg-white/5'}`}
              >
                💚 لينا عندهم ({customersOwing.length})
              </button>
              <button
                onClick={() => setDebtTab('owing')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                  ${debtTab === 'owing'
                    ? 'bg-red-700/30 border border-red-500/40 text-red-300'
                    : 'border border-white/10 text-gray-400 hover:bg-white/5'}`}
              >
                ❤️ ليهم عندنا ({suppliersOwed.length})
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">

              {/* لينا عندهم - عملاء */}
              {debtTab === 'owed' && (
                <>
                  {customersOwing.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">
                      <div className="text-4xl mb-3">🎉</div>
                      <div>ما فيش عملاء عليهم ديون</div>
                    </div>
                  ) : (
                    customersOwing.map((c, idx) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between
                                   bg-white/5 hover:bg-white/8 border border-white/5
                                   hover:border-green-700/30 rounded-xl px-4 py-3
                                   transition-all group"
                      >
                        {/* رقم + اسم */}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/30
                                          flex items-center justify-center text-xs font-bold text-green-400">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{c.name}</div>
                            {c.phone && (
                              <div className="text-xs text-gray-500">{c.phone}</div>
                            )}
                          </div>
                        </div>

                        {/* المبلغ + زر */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-black text-green-400">
                              {formatCurrency(c.balance)}
                            </div>
                            <div className="text-xs text-gray-500">مستحق</div>
                          </div>
                          <button
                            onClick={() => {
                              setShowDebtBook(false);
                              onNavigate('customers');
                            }}
                            className="text-xs text-violet-400 hover:text-violet-300
                                       bg-violet-900/20 hover:bg-violet-900/40
                                       px-3 py-1.5 rounded-lg transition-colors opacity-0
                                       group-hover:opacity-100"
                          >
                            كشف حساب
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ليهم عندنا - موردين */}
              {debtTab === 'owing' && (
                <>
                  {suppliersOwed.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">
                      <div className="text-4xl mb-3">🎉</div>
                      <div>ما فيش موردين لهم ديون</div>
                    </div>
                  ) : (
                    suppliersOwed.map((s, idx) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between
                                   bg-white/5 hover:bg-white/8 border border-white/5
                                   hover:border-red-700/30 rounded-xl px-4 py-3
                                   transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-900/30 border border-red-700/30
                                          flex items-center justify-center text-xs font-bold text-red-400">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{s.name}</div>
                            {s.phone && (
                              <div className="text-xs text-gray-500">{s.phone}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-black text-red-400">
                              {formatCurrency(s.balance)}
                            </div>
                            <div className="text-xs text-gray-500">مستحق لهم</div>
                          </div>
                          <button
                            onClick={() => {
                              setShowDebtBook(false);
                              onNavigate('suppliers');
                            }}
                            className="text-xs text-violet-400 hover:text-violet-300
                                       bg-violet-900/20 hover:bg-violet-900/40
                                       px-3 py-1.5 rounded-lg transition-colors opacity-0
                                       group-hover:opacity-100"
                          >
                            كشف حساب
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 shrink-0">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  صافي المركز المالي:{' '}
                  <span className={`font-bold ${
                    totalOwing - totalOwed >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatCurrency(Math.abs(totalOwing - totalOwed))}
                    {totalOwing - totalOwed >= 0 ? ' لصالحنا ✅' : ' علينا ⚠️'}
                  </span>
                </span>
                <button
                  onClick={() => setShowDebtBook(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: تعديل الخزينة
      ══════════════════════════════════════════════════════════ */}
      {showTreasury && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTreasury(false)}
        >
          <div
            className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-5">💰 إضافة حركة للخزنة</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, type: 'cash' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors
                    ${treasuryForm.type === 'cash'
                      ? 'bg-green-700/30 border-green-500/50 text-green-300'
                      : 'border-white/10 text-gray-400'}`}
                >
                  💵 كاش
                </button>
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, type: 'bank' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors
                    ${treasuryForm.type === 'bank'
                      ? 'bg-blue-700/30 border-blue-500/50 text-blue-300'
                      : 'border-white/10 text-gray-400'}`}
                >
                  🏦 بنك
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, direction: 'in' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors
                    ${treasuryForm.direction === 'in'
                      ? 'bg-green-700/30 border-green-500/50 text-green-300'
                      : 'border-white/10 text-gray-400'}`}
                >
                  + إيداع
                </button>
                <button
                  onClick={() => setTreasuryForm(p => ({ ...p, direction: 'out' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors
                    ${treasuryForm.direction === 'out'
                      ? 'bg-red-700/30 border-red-500/50 text-red-300'
                      : 'border-white/10 text-gray-400'}`}
                >
                  - سحب
                </button>
              </div>
              <input
                type="number"
                value={treasuryForm.amount}
                onChange={e => setTreasuryForm(p => ({ ...p, amount: e.target.value }))}
                className="input-dark w-full"
                placeholder="المبلغ"
              />
              <input
                type="text"
                value={treasuryForm.description}
                onChange={e => setTreasuryForm(p => ({ ...p, description: e.target.value }))}
                className="input-dark w-full"
                placeholder="الوصف / السبب"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleTreasuryAdjust} className="btn-primary flex-1">
                تأكيد
              </button>
              <button onClick={() => setShowTreasury(false)} className="btn-secondary flex-1">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   StatCard Component
══════════════════════════════════════════════════════════ */
function StatCard({
  title, value, sub, icon, color, onClick,
}: {
  title: string;
  value: string;
  sub: string;
  icon: string;
  color: string;
  onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    green:  'from-green-900/40  to-green-900/10  border-green-700/30',
    blue:   'from-blue-900/40   to-blue-900/10   border-blue-700/30',
    violet: 'from-violet-900/40 to-violet-900/10 border-violet-700/30',
    cyan:   'from-cyan-900/40   to-cyan-900/10   border-cyan-700/30',
    orange: 'from-orange-900/40 to-orange-900/10 border-orange-700/30',
    teal:   'from-teal-900/40   to-teal-900/10   border-teal-700/30',
    yellow: 'from-yellow-900/40 to-yellow-900/10 border-yellow-700/30',
    red:    'from-red-900/40    to-red-900/10    border-red-700/30',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4
        ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
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