import React, { useState } from 'react';
import { AppState } from '../types';
import { formatCurrency } from '../utils/helpers';
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

  const totalSales = state.saleInvoices.reduce((s, i) => s + i.total, 0);
  const totalPurchases = state.purchaseInvoices.reduce((s, i) => s + i.total, 0);
  const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalSales - totalPurchases - totalExpenses;
  const totalDebt = state.customers.reduce((s, c) => {
    const invs = state.saleInvoices.filter(i => i.customerId === c.id);
    return s + invs.reduce((x, i) => x + i.remaining, 0);
  }, 0);

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
          <div className={`text-xs mb-1 ${netProfit >= 0 ? 'text-violet-400' : 'text-red-400'}`}>صافي الربح</div>
          <div className={`text-xl font-black ${netProfit >= 0 ? 'text-white' : 'text-red-400'}`}>{formatCurrency(netProfit)}</div>
          <div className="text-xs text-gray-500 mt-1">بعد خصم المصروفات</div>
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

      {/* Noon Stats */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">🏪 أوردرات المنصات</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الأوردرات', value: state.noonOrders.length, color: 'text-white' },
            { label: 'معلق', value: state.noonOrders.filter(o => o.status === 'pending').length, color: 'text-yellow-400' },
            { label: 'تم الشحن', value: state.noonOrders.filter(o => o.status === 'shipped').length, color: 'text-blue-400' },
            { label: 'تم التوصيل', value: state.noonOrders.filter(o => o.status === 'delivered').length, color: 'text-green-400' },
          ].map((s, i) => (
            <div key={i} className="bg-[#252545] rounded-xl p-3 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
