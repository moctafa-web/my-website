import React, { useState } from 'react';
import { AppState } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Props {
  state: AppState;
}

export default function Reports({ state }: Props) {
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const days = parseInt(period);

  const getPeriodData = () => {
    return Array.from({ length: Math.min(days, 30) }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (Math.min(days, 30) - 1 - i));
      const dateStr = d.toISOString().split('T')[0];
      const sales = state.saleInvoices.filter(inv => inv.date === dateStr).reduce((s, inv) => s + inv.total, 0);
      const purchases = state.purchaseInvoices.filter(inv => inv.date === dateStr).reduce((s, inv) => s + inv.total, 0);
      const expenses = state.expenses.filter(e => e.date === dateStr).reduce((s, e) => s + e.amount, 0);
      return {
        date: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
        مبيعات: sales,
        مشتريات: purchases,
        مصروفات: expenses,
        صافي: sales - purchases - expenses,
      };
    });
  };

  const chartData = getPeriodData();

  // Category breakdown
  const categoryData = ['phones', 'tablets', 'laptops', 'accessories', 'other'].map(cat => {
    const catProducts = state.products.filter(p => p.category === cat);
    const catSales = state.saleInvoices.flatMap(inv => inv.items).filter(item =>
      catProducts.some(p => p.id === item.productId)
    ).reduce((s, item) => s + item.total, 0);
    return {
      name: cat === 'phones' ? 'موبايلات' : cat === 'tablets' ? 'تابلت' : cat === 'laptops' ? 'لابتوب' : cat === 'accessories' ? 'إكسسوارات' : 'أخرى',
      value: catSales,
    };
  }).filter(c => c.value > 0);

  const COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  // ✅ ربح المحل (offline) الصافي = مبيعات - تكلفة المنتجات المباعة فعليًا (costPrice وقت البيع، وليس فقط مبيعات - مشتريات بشكل عام)
  const calcOfflineProfit = (invoices: typeof state.saleInvoices) => {
    return invoices.reduce((sum, inv) => {
      const invoiceCost = inv.items.reduce((s, item) => {
        if (item.pendingCost) return s; // بيع معلّق بدون تكلفة معروفة بعد - لا يُحسب ربحه حتى تُسجل تكلفته
        const cost = item.costPrice ?? (state.products.find(p => p.id === item.productId)?.costPrice || 0);
        return s + cost * item.quantity;
      }, 0);
      return sum + (inv.total - invoiceCost);
    }, 0);
  };

  const totalSales = state.saleInvoices.reduce((s, i) => s + i.total, 0);
  const totalPurchases = state.purchaseInvoices.reduce((s, i) => s + i.total, 0);
  const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
  const totalOfflineProfit = calcOfflineProfit(state.saleInvoices);
  const totalNoonProfit = state.noonOrders.filter(o => o.platform === 'noon').reduce((s, o) => s + (o.settlementProfit || 0), 0);
  const totalAmazonProfit = state.noonOrders.filter(o => o.platform === 'amazon').reduce((s, o) => s + (o.settlementProfit || 0), 0);
  const totalOtherPlatformProfit = state.noonOrders.filter(o => o.platform !== 'noon' && o.platform !== 'amazon').reduce((s, o) => s + (o.settlementProfit || 0), 0);
  const netProfit = totalOfflineProfit - totalExpenses + totalNoonProfit + totalAmazonProfit + totalOtherPlatformProfit;
  const totalDebt = state.customers.reduce((s, c) => {
    const invs = state.saleInvoices.filter(i => i.customerId === c.id);
    return s + invs.reduce((x, i) => x + i.remaining, 0);
  }, 0);

  // ربح الشهر/اليوم الحالي: مفصّل بين المحل (offline)، نون، أمازون - كل عنصر محسوب بتاريخه الفعلي
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayKey = getTodayStr();
  const getMonthKey = (dateStr: string) => dateStr.slice(0, 7);

  const buildPeriodSummary = (filterFn: (dateStr: string) => boolean) => {
    const periodSales = state.saleInvoices.filter(i => filterFn(i.date));
    const periodPurchases = state.purchaseInvoices.filter(i => filterFn(i.date)).reduce((s, i) => s + i.total, 0);
    const periodExpenses = state.expenses.filter(e => filterFn(e.date)).reduce((s, e) => s + e.amount, 0);
    const offlineSalesTotal = periodSales.reduce((s, i) => s + i.total, 0);
    const offlineProfit = calcOfflineProfit(periodSales);

    // ربح نون وأمازون يُحسبان بتاريخ التسوية البنكية الفعلي (settledDate)، فهو التاريخ الذي تحقق فيه الربح فعليًا
    const settledOrders = state.noonOrders.filter(o => o.settledDate && filterFn(o.settledDate));
    const noonOrdersInPeriod = settledOrders.filter(o => o.platform === 'noon');
    const amazonOrdersInPeriod = settledOrders.filter(o => o.platform === 'amazon');
    const noonProfit = noonOrdersInPeriod.reduce((s, o) => s + (o.settlementProfit || 0), 0);
    const noonAmount = noonOrdersInPeriod.reduce((s, o) => s + (o.settledAmount || 0), 0);
    const amazonProfit = amazonOrdersInPeriod.reduce((s, o) => s + (o.settlementProfit || 0), 0);
    const amazonAmount = amazonOrdersInPeriod.reduce((s, o) => s + (o.settledAmount || 0), 0);

    const totalNet = offlineProfit - periodExpenses + noonProfit + amazonProfit;
    return {
      offlineSales: offlineSalesTotal,
      offlineProfit,
      purchases: periodPurchases,
      expenses: periodExpenses,
      noonProfit, noonAmount,
      amazonProfit, amazonAmount,
      onlineProfit: noonProfit + amazonProfit,
      net: totalNet,
    };
  };

  const todaySummary = buildPeriodSummary(d => d === todayKey);
  const currentMonthSummary = buildPeriodSummary(d => getMonthKey(d) === currentMonthKey);

  const buildMonthSummary = (monthKey: string) => {
    const s = buildPeriodSummary(d => getMonthKey(d) === monthKey);
    return { monthKey, ...s };
  };
  const last6MonthsKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthlyHistory = last6MonthsKeys.map(buildMonthSummary);
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  };

  // Top products
  const productSales: Record<string, { name: string; qty: number; total: number }> = {};
  state.saleInvoices.forEach(inv => {
    inv.items.forEach(item => {
      if (!productSales[item.productId]) productSales[item.productId] = { name: item.productName, qty: 0, total: 0 };
      productSales[item.productId].qty += item.quantity;
      productSales[item.productId].total += item.total;
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 5);

  // Top customers
  const topCustomers = state.customers.map(c => ({
    name: c.name,
    total: state.saleInvoices.filter(i => i.customerId === c.id).reduce((s, i) => s + i.total, 0),
  })).sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">📊 التقارير والإحصائيات</h2>
        <div className="flex gap-2">
          {(['7', '30', '90'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm border transition-colors ${period === p ? 'bg-violet-700/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>
              آخر {p} يوم
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-900/40 to-green-900/10 border border-green-700/30 rounded-2xl p-4">
          <div className="text-xs text-green-400 mb-1">إجمالي المبيعات</div>
          <div className="text-xl font-black text-white">{formatCurrency(totalSales)}</div>
          <div className="text-xs text-gray-500 mt-1">{state.saleInvoices.length} فاتورة</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/10 border border-blue-700/30 rounded-2xl p-4">
          <div className="text-xs text-blue-400 mb-1">إجمالي المشتريات</div>
          <div className="text-xl font-black text-white">{formatCurrency(totalPurchases)}</div>
          <div className="text-xs text-gray-500 mt-1">{state.purchaseInvoices.length} فاتورة</div>
        </div>
        <div className={`bg-gradient-to-br ${netProfit >= 0 ? 'from-violet-900/40 to-violet-900/10 border-violet-700/30' : 'from-red-900/40 to-red-900/10 border-red-700/30'} border rounded-2xl p-4`}>
          <div className={`text-xs mb-1 ${netProfit >= 0 ? 'text-violet-400' : 'text-red-400'}`}>صافي الربح الإجمالي</div>
          <div className={`text-xl font-black ${netProfit >= 0 ? 'text-white' : 'text-red-400'}`}>{formatCurrency(netProfit)}</div>
          <div className="text-xs text-gray-500 mt-1">شامل ربح أوردرات نون/أمازون</div>
        </div>
        <div className="bg-gradient-to-br from-red-900/40 to-red-900/10 border border-red-700/30 rounded-2xl p-4">
          <div className="text-xs text-red-400 mb-1">مديونيات العملاء</div>
          <div className="text-xl font-black text-white">{formatCurrency(totalDebt)}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المتبقي</div>
        </div>
      </div>

      {/* Sales Chart */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">📈 المبيعات والمشتريات (آخر {Math.min(days, 30)} يوم)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1a1a35', border: '1px solid #7c3aed40', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            <Area type="monotone" dataKey="مبيعات" stroke="#7c3aed" fill="url(#sGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="مشتريات" stroke="#3b82f6" fill="url(#pGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Pie */}
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">🗂️ توزيع المبيعات بالفئة</h3>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                    {categoryData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {categoryData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}></div>
                      <span className="text-xs text-gray-300">{item.name}</span>
                    </div>
                    <span className="text-xs text-white font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">لا توجد بيانات مبيعات بعد</div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">🏆 أكثر المنتجات مبيعاً</h3>
          {topProducts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">لا توجد مبيعات بعد</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-900/40 flex items-center justify-center text-xs font-bold text-violet-400">#{i + 1}</div>
                    <span className="text-sm text-gray-300 truncate max-w-[180px]">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white font-bold">{formatCurrency(p.total)}</div>
                    <div className="text-xs text-gray-500">{p.qty} قطعة</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">👥 أكثر العملاء شراءً</h3>
        {topCustomers.filter(c => c.total > 0).length === 0 ? (
          <div className="text-center text-gray-500 py-6">لا توجد مبيعات بعد</div>
        ) : (
          <div className="space-y-2">
            {topCustomers.filter(c => c.total > 0).map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-violet-700/40 flex items-center justify-center text-xs font-bold text-violet-300">#{i + 1}</div>
                  <span className="text-sm text-white">{c.name}</span>
                </div>
                <span className="text-sm font-bold text-green-400">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ربح اليوم - مفصّل بين المحل ونون وأمازون */}
      <div className="bg-gradient-to-br from-green-900/20 to-[#1a1a35] border border-green-700/30 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-1">📆 ربح اليوم</h3>
        <p className="text-xs text-gray-500 mb-4">ربح المحل (أوفلاين) + ربح أوردرات نون وأمازون المحوّلة بنكيًا اليوم، كل قناة على حدة</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-blue-300">{formatCurrency(todaySummary.offlineProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح المحل (أوفلاين)</div>
          </div>
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-yellow-300">{formatCurrency(todaySummary.noonProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح نون</div>
          </div>
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-orange-300">{formatCurrency(todaySummary.amazonProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح أمازون</div>
          </div>
          <div className={`rounded-xl p-3 text-center border ${todaySummary.net >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
            <div className={`text-lg font-black ${todaySummary.net >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(todaySummary.net)}</div>
            <div className="text-xs text-gray-500 mt-1">صافي ربح اليوم</div>
          </div>
        </div>
      </div>

      {/* ربح الشهر الحالي - مفصّل بين المحل ونون وأمازون */}
      <div className="bg-gradient-to-br from-violet-900/30 to-[#1a1a35] border border-violet-700/40 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-1">📅 ربح شهر {monthLabel(currentMonthKey)}</h3>
        <p className="text-xs text-gray-500 mb-4">ربح كل قناة بيع على حدة، عشان تعرف فين بتكسب أكتر وقد إيه</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-blue-300">{formatCurrency(currentMonthSummary.offlineProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح المحل (أوفلاين)</div>
            <div className="text-xs text-gray-600 mt-0.5">من {formatCurrency(currentMonthSummary.offlineSales)} مبيعات</div>
          </div>
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-yellow-300">{formatCurrency(currentMonthSummary.noonProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح نون</div>
            <div className="text-xs text-gray-600 mt-0.5">من {formatCurrency(currentMonthSummary.noonAmount)} محوّل</div>
          </div>
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-orange-300">{formatCurrency(currentMonthSummary.amazonProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">ربح أمازون</div>
            <div className="text-xs text-gray-600 mt-0.5">من {formatCurrency(currentMonthSummary.amazonAmount)} محوّل</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-cyan-300">{formatCurrency(currentMonthSummary.onlineProfit)}</div>
            <div className="text-xs text-gray-500 mt-1">إجمالي ربح الأونلاين (نون+أمازون)</div>
          </div>
          <div className="bg-[#252545] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-orange-400">{formatCurrency(currentMonthSummary.expenses)}</div>
            <div className="text-xs text-gray-500 mt-1">مصروفات الشهر</div>
          </div>
          <div className={`rounded-xl p-3 text-center border ${currentMonthSummary.net >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
            <div className={`text-lg font-black ${currentMonthSummary.net >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(currentMonthSummary.net)}</div>
            <div className="text-xs text-gray-500 mt-1">صافي ربح الشهر الإجمالي</div>
          </div>
        </div>
      </div>

      {/* جدول مقارنة آخر 6 شهور - مفصّل بين المحل ونون وأمازون */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5 overflow-x-auto">
        <h3 className="font-bold text-white mb-4">📊 مقارنة آخر 6 شهور</h3>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-2 px-3 text-gray-400">الشهر</th>
              <th className="text-center py-2 px-3 text-gray-400">ربح المحل</th>
              <th className="text-center py-2 px-3 text-gray-400">ربح نون</th>
              <th className="text-center py-2 px-3 text-gray-400">ربح أمازون</th>
              <th className="text-center py-2 px-3 text-gray-400">المصروفات</th>
              <th className="text-center py-2 px-3 text-gray-400">صافي الربح</th>
            </tr>
          </thead>
          <tbody>
            {monthlyHistory.map(m => (
              <tr key={m.monthKey} className={`border-t border-white/5 ${m.monthKey === currentMonthKey ? 'bg-violet-900/10' : ''}`}>
                <td className="py-2 px-3 text-white font-medium">{monthLabel(m.monthKey)}</td>
                <td className="py-2 px-3 text-center text-blue-300">{formatCurrency(m.offlineProfit)}</td>
                <td className="py-2 px-3 text-center text-yellow-300">{formatCurrency(m.noonProfit)}</td>
                <td className="py-2 px-3 text-center text-orange-300">{formatCurrency(m.amazonProfit)}</td>
                <td className="py-2 px-3 text-center text-orange-400">{formatCurrency(m.expenses)}</td>
                <td className={`py-2 px-3 text-center font-bold ${m.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Noon Stats */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">🏪 أوردرات المنصات</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'إجمالي الأوردرات', value: state.noonOrders.length, color: 'text-white' },
            { label: 'معلق', value: state.noonOrders.filter(o => o.status === 'pending').length, color: 'text-yellow-400' },
            { label: 'تم الشحن', value: state.noonOrders.filter(o => o.status === 'shipped').length, color: 'text-blue-400' },
            { label: 'تم التوصيل', value: state.noonOrders.filter(o => o.status === 'delivered').length, color: 'text-green-400' },
            { label: 'محول بنكيًا', value: state.noonOrders.filter(o => o.status === 'settled').length, color: 'text-violet-400' },
          ].map((s, i) => (
            <div key={i} className="bg-[#252545] rounded-xl p-3 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        {state.noonOrders.some(o => o.status === 'settled') && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500">إجمالي المبالغ المحولة بنكيًا</div>
              <div className="font-bold text-blue-300 text-lg">{formatCurrency(state.noonOrders.reduce((s, o) => s + (o.settledAmount || 0), 0))}</div>
            </div>
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500">إجمالي ربح أوردرات المنصات</div>
              <div className="font-bold text-green-300 text-lg">{formatCurrency(state.noonOrders.reduce((s, o) => s + (o.settlementProfit || 0), 0))}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
