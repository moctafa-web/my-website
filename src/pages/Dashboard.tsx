// src/pages/Dashboard.tsx
import React, { useState } from 'react';
import { AppState } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { X, TrendingUp, TrendingDown, Copy, Printer, Check } from 'lucide-react';

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
  const [showTreasury, setShowTreasury] = useState(false);
  const [showDebtBook, setShowDebtBook] = useState(false);
  const [copied, setCopied]             = useState(false);

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

  /* ─── دفتر الديون - عملاء وموردين معاً ─── */

  // اللي لينا عندهم (عملاء + موردين عليهم فلوس)
  const customersOwing = state.customers
    .map(c => {
      const balance =
        (c.totalInvoices || 0) -
        (c.totalPaid || 0) +
        (c.openingBalance || 0);
      return { id: c.id, name: c.name, phone: c.phone || '', balance, type: 'customer' as const };
    })
    .filter(c => c.balance > 0);

  const suppliersWithCredit = state.suppliers
    .map(s => {
      const balance =
        (s.totalInvoices || 0) -
        (s.totalPaid || 0) +
        (s.openingBalance || 0);
      // لو الرصيد سالب = نحن دفعنا أكتر = المورد عنده فلوس لينا
      return { id: s.id, name: s.name, phone: s.phone || '', balance: -balance, type: 'supplier' as const };
    })
    .filter(s => s.balance > 0);

  // كل اللي لينا عندهم مجتمعين مرتبين
  const allOwingUs = [...customersOwing, ...suppliersWithCredit]
    .sort((a, b) => b.balance - a.balance);

  // اللي ليهم عندنا (موردين + عملاء لهم فلوس)
  const suppliersOwed = state.suppliers
    .map(s => {
      const balance =
        (s.totalInvoices || 0) -
        (s.totalPaid || 0) +
        (s.openingBalance || 0);
      return { id: s.id, name: s.name, phone: s.phone || '', balance, type: 'supplier' as const };
    })
    .filter(s => s.balance > 0);

  const customersWithDebit = state.customers
    .map(c => {
      const balance =
        (c.totalInvoices || 0) -
        (c.totalPaid || 0) +
        (c.openingBalance || 0);
      // لو الرصيد سالب = العميل دفع أكتر = نحن عندنا فلوس ليه
      return { id: c.id, name: c.name, phone: c.phone || '', balance: -balance, type: 'customer' as const };
    })
    .filter(c => c.balance > 0);

  // كل اللي ليهم عندنا مجتمعين مرتبين
  const allWeOwe = [...suppliersOwed, ...customersWithDebit]
    .sort((a, b) => b.balance - a.balance);

  const totalOwing = allOwingUs.reduce((s, c) => s + c.balance, 0);
  const totalOwed  = allWeOwe.reduce((s, c) => s + c.balance, 0);
  const netBalance = totalOwing - totalOwed;

  /* ─── بيانات الرسم البياني ─── */
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
      مبيعات: state.saleInvoices.filter(inv => inv.date === dateStr)
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

  /* ─── طباعة دفتر الديون ─── */
  const printDebtBook = () => {
    const printDate = new Date().toLocaleDateString('ar-EG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const owingRows = allOwingUs.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${c.name}</td>
        <td>${c.phone || '-'}</td>
        <td style="color:#16a34a;font-weight:bold">${c.balance.toLocaleString('ar-EG')} ج.م</td>
      </tr>
    `).join('');

    const owedRows = allWeOwe.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${s.name}</td>
        <td>${s.phone || '-'}</td>
        <td style="color:#dc2626;font-weight:bold">${s.balance.toLocaleString('ar-EG')} ج.م</td>
      </tr>
    `).join('');

    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>دفتر الديون - ONE</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; padding: 24px; color: #1a1a2e; }
          .header { display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 20px; }
          .company { font-size: 26px; font-weight: 900; color: #7c3aed; }
          .title { font-size: 18px; font-weight: 700; color: #1a1a2e; }
          .date { font-size: 12px; color: #666; margin-top: 4px; }
          .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .sum-card { border: 2px solid; border-radius: 8px; padding: 12px; text-align: center; }
          .sum-card.green { border-color: #16a34a; background: #f0fdf4; }
          .sum-card.red { border-color: #dc2626; background: #fef2f2; }
          .sum-card.blue { border-color: #2563eb; background: #eff6ff; }
          .sum-label { font-size: 12px; color: #666; margin-bottom: 4px; }
          .sum-value { font-size: 18px; font-weight: 900; }
          .sum-card.green .sum-value { color: #16a34a; }
          .sum-card.red .sum-value { color: #dc2626; }
          .sum-card.blue .sum-value { color: #2563eb; }
          .section-title { font-size: 15px; font-weight: 700; margin: 20px 0 10px;
                           padding: 8px 12px; border-radius: 6px; }
          .section-title.green { background: #f0fdf4; color: #16a34a; border-right: 4px solid #16a34a; }
          .section-title.red { background: #fef2f2; color: #dc2626; border-right: 4px solid #dc2626; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #1a1a2e; color: white; padding: 8px 12px; text-align: right; font-size: 13px; }
          td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .empty { text-align: center; color: #9ca3af; padding: 20px; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb;
                    font-size: 11px; color: #9ca3af; text-align: center; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">ONE</div>
            <div style="font-size:12px;color:#666">نظام الإدارة المتكامل</div>
          </div>
          <div style="text-align:left">
            <div class="title">📒 دفتر الديون</div>
            <div class="date">${printDate}</div>
          </div>
        </div>
        <div class="summary">
          <div class="sum-card green">
            <div class="sum-label">💚 لينا عندهم</div>
            <div class="sum-value">${totalOwing.toLocaleString('ar-EG')} ج.م</div>
            <div style="font-size:11px;color:#16a34a;margin-top:4px">${allOwingUs.length} جهة</div>
          </div>
          <div class="sum-card red">
            <div class="sum-label">❤️ ليهم عندنا</div>
            <div class="sum-value">${totalOwed.toLocaleString('ar-EG')} ج.م</div>
            <div style="font-size:11px;color:#dc2626;margin-top:4px">${allWeOwe.length} جهة</div>
          </div>
          <div class="sum-card blue">
            <div class="sum-label">📊 الصافي</div>
            <div class="sum-value">${Math.abs(netBalance).toLocaleString('ar-EG')} ج.م</div>
            <div style="font-size:11px;color:#2563eb;margin-top:4px">
              ${netBalance >= 0 ? 'لصالحنا ✅' : 'علينا ⚠️'}
            </div>
          </div>
        </div>
        <div class="section-title green">💚 اللي لينا عندهم</div>
        ${allOwingUs.length === 0
          ? '<div class="empty">🎉 ما فيش ديون لينا</div>'
          : `<table>
              <thead><tr><th>#</th><th>الاسم</th><th>التليفون</th><th>المبلغ المستحق</th></tr></thead>
              <tbody>${owingRows}</tbody>
              <tfoot>
                <tr style="background:#f0fdf4;font-weight:bold">
                  <td colspan="3" style="text-align:center">الإجمالي</td>
                  <td style="color:#16a34a;font-weight:900">${totalOwing.toLocaleString('ar-EG')} ج.م</td>
                </tr>
              </tfoot>
            </table>`
        }
        <div class="section-title red">❤️ اللي ليهم عندنا</div>
        ${allWeOwe.length === 0
          ? '<div class="empty">🎉 ما فيش ديون علينا</div>'
          : `<table>
              <thead><tr><th>#</th><th>الاسم</th><th>التليفون</th><th>المبلغ المستحق</th></tr></thead>
              <tbody>${owedRows}</tbody>
              <tfoot>
                <tr style="background:#fef2f2;font-weight:bold">
                  <td colspan="3" style="text-align:center">الإجمالي</td>
                  <td style="color:#dc2626;font-weight:900">${totalOwed.toLocaleString('ar-EG')} ج.م</td>
                </tr>
              </tfoot>
            </table>`
        }
        <div class="footer">ONE ERP • تم الطباعة بتاريخ ${printDate}</div>
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `);
    w.document.close();
  };

  /* ─── نسخ للواتساب ─── */
  const copyForWhatsapp = () => {
    const date = new Date().toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'numeric', day: 'numeric'
    });
    const fmt = (num: number) => num.toLocaleString('ar-EG');

    let msg = `📒 تقرير حسابات التجار\n`;
    msg += `🗓️ ${date}\n\n`;

    msg += `✅ لنا عندهم فلوس:\n`;
    if (allOwingUs.length === 0) {
      msg += `ما فيش ديون لينا\n`;
    } else {
      allOwingUs.forEach((c, i) => {
        msg += `${i + 1}) ${c.name} - ${fmt(c.balance)} ج.م\n`;
      });
      msg += `الإجمالي: ${fmt(totalOwing)} ج.م\n`;
    }

    msg += `\n`;

    msg += `💸 لهم عندنا فلوس:\n`;
    if (allWeOwe.length === 0) {
      msg += `ما فيش ديون علينا\n`;
    } else {
      allWeOwe.forEach((s, i) => {
        msg += `${i + 1}) ${s.name} - ${fmt(s.balance)} ج.م\n`;
      });
      msg += `الإجمالي: ${fmt(totalOwed)} ج.م\n`;
    }

    msg += `\n`;
    msg += `📌 الصافي ${netBalance >= 0 ? 'لصالحنا' : 'علينا'}: ${fmt(Math.abs(netBalance))} ج.م`;

    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ① Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* ② دفتر الديون + أجهزة بدون سعر - فوق الإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* دفتر الديون */}
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
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp size={12} className="text-green-400" />
                <span className="text-xs text-green-400">لينا عندهم</span>
              </div>
              <div className="text-base font-bold text-green-300">{formatCurrency(totalOwing)}</div>
              <div className="text-xs text-green-500 mt-0.5">{allOwingUs.length} جهة</div>
            </div>
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingDown size={12} className="text-red-400" />
                <span className="text-xs text-red-400">ليهم عندنا</span>
              </div>
              <div className="text-base font-bold text-red-300">{formatCurrency(totalOwed)}</div>
              <div className="text-xs text-red-500 mt-0.5">{allWeOwe.length} جهة</div>
            </div>
          </div>
        </button>

        {/* أجهزة بدون سعر شراء */}
        <div className={`rounded-2xl p-5 border transition-all ${
          noCostProducts.length > 0
            ? 'bg-gradient-to-br from-red-900/20 to-rose-900/10 border-red-600/30'
            : 'bg-gradient-to-br from-green-900/10 to-emerald-900/5 border-green-700/20'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
              noCostProducts.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'
            }`}>
              {noCostProducts.length > 0 ? '⚠️' : '✅'}
            </div>
            {noCostProducts.length > 0 && (
              <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded-lg animate-pulse font-bold">
                {noCostProducts.length} منتج بدون سعر
              </span>
            )}
          </div>
          <div className="text-base font-bold text-white mb-3">أجهزة بدون سعر شراء</div>
          {noCostProducts.length === 0 ? (
            <div className="text-sm text-green-400">✅ جميع المنتجات لها سعر شراء</div>
          ) : (
            <div className="space-y-2 max-h-[120px] overflow-y-auto">
              {noCostProducts.map(p => (
                <div key={p.id}
                  className="flex items-center justify-between bg-red-900/20 border border-red-700/20 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm text-white font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.sku}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{p.stock} قطعة</span>
                    <button onClick={() => onNavigate('products')}
                      className="text-xs text-violet-400 hover:text-violet-300 bg-violet-900/20 px-2 py-1 rounded-lg">
                      تعديل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {noCostProducts.length > 0 && (
            <button onClick={() => onNavigate('products')}
              className="mt-3 w-full text-xs text-violet-400 hover:text-violet-300 py-1.5 border border-violet-700/30 rounded-xl">
              الذهاب لصفحة المنتجات →
            </button>
          )}
        </div>
      </div>

      {/* ③ Stats - نزلت تحت */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="مبيعات اليوم" value={formatCurrency(todaySalesTotal)}
          sub={`${todaySales.length} فاتورة`} icon="💰" color="green" />
        <StatCard title="مشتريات اليوم" value={formatCurrency(todayPurchasesTotal)}
          sub={`${todayPurchases.length} فاتورة`} icon="📦" color="blue" />
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="الكاش" value={formatCurrency(state.cashBalance)}
            sub="الرصيد الحالي" icon="💵" color="violet" onClick={() => setShowTreasury(true)} />
          <StatCard title="البنك" value={formatCurrency(state.bankBalance)}
            sub="الرصيد الحالي" icon="🏦" color="cyan" onClick={() => setShowTreasury(true)} />
        </div>
      </div>

      {/* ④ Chart + Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">📊 المبيعات والمشتريات - آخر 7 أيام</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={last7Days} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1a1a35', border: '1px solid #7c3aed40', borderRadius: 8, color: '#fff' }}
                formatter={(v: unknown) => [`${Number(v).toLocaleString('ar-EG')} ج.م`, '']}
              />
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
                  <div key={p.id}
                    className="flex items-center justify-between bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">
                    <span className="text-red-400 text-xs font-medium">{p.name}</span>
                    <span className="text-red-300 text-xs bg-red-900/40 px-2 py-0.5 rounded">نفد</span>
                  </div>
                ))}
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id}
                    className="flex items-center justify-between bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2">
                    <span className="text-yellow-400 text-xs font-medium">{p.name}</span>
                    <span className="text-yellow-300 text-xs">{p.stock} قطعة</span>
                  </div>
                ))}
              </>
            )}
          </div>
          {(outOfStock.length > 0 || lowStock.length > 0) && (
            <button onClick={() => onNavigate('inventory')}
              className="mt-3 w-full text-xs text-violet-400 hover:text-violet-300 py-1">
              عرض الكل →
            </button>
          )}
        </div>
      </div>

      {/* ⑤ Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">🧾 آخر المبيعات</h3>
            <button onClick={() => onNavigate('sales')} className="text-xs text-violet-400 hover:text-violet-300">
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
                    <div className="text-xs text-gray-500">{inv.invoiceNumber} • {inv.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-400">{formatCurrency(inv.total)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === 'paid' ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'
                    }`}>
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
            <button onClick={() => onNavigate('purchases')} className="text-xs text-violet-400 hover:text-violet-300">
              عرض الكل →
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {state.purchaseInvoices.length === 0 ? (
              <div className="text-center text-gray-500 py-6">لا توجد فواتير مشتريات بعد</div>
            ) : (
              state.purchaseInvoices.slice(-5).reverse().map(inv => (
                <div key={inv.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-white">{inv.supplierName}</div>
                    <div className="text-xs text-gray-500">{inv.invoiceNumber} • {inv.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-400">{formatCurrency(inv.total)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === 'paid' ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'
                    }`}>
                      {inv.remaining > 0 ? `متبقي ${inv.remaining.toLocaleString('ar-EG')}` : 'مدفوع'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ══ MODAL: دفتر الديون ══ */}
      {showDebtBook && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDebtBook(false)}>
          <div className="bg-[#12122a] border border-amber-700/30 rounded-2xl w-full max-w-2xl
                         max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-amber-700/20 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📒</span>
                <div>
                  <h2 className="text-xl font-bold text-white">دفتر الديون</h2>
                  <p className="text-xs text-gray-400">
                    {new Date().toLocaleDateString('ar-EG', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyForWhatsapp}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
                             transition-all border ${copied
                    ? 'bg-green-700/30 border-green-500/50 text-green-300'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'تم النسخ!' : 'نسخ للواتساب'}
                </button>
                <button
                  onClick={printDebtBook}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
                             bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
                >
                  <Printer size={14} />
                  طباعة
                </button>
                <button onClick={() => setShowDebtBook(false)}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 p-4 border-b border-white/5 shrink-0">
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-green-400 mb-1">💚 إجمالي لينا</div>
                <div className="text-lg font-black text-green-300">{formatCurrency(totalOwing)}</div>
                <div className="text-xs text-green-600">{allOwingUs.length} جهة</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-red-400 mb-1">❤️ إجمالي ليهم</div>
                <div className="text-lg font-black text-red-300">{formatCurrency(totalOwed)}</div>
                <div className="text-xs text-red-600">{allWeOwe.length} جهة</div>
              </div>
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-400 mb-1">📊 الصافي</div>
                <div className={`text-lg font-black ${netBalance >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatCurrency(Math.abs(netBalance))}
                </div>
                <div className={`text-xs ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netBalance >= 0 ? 'لصالحنا ✅' : 'علينا ⚠️'}
                </div>
              </div>
            </div>

            {/* قائمة موحدة بتابات */}
            <div className="flex gap-2 p-4 pb-2 shrink-0">
              <button
                onClick={() => setShowDebtBook(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-green-700/30 border border-green-500/40 text-green-300"
              >
                💚 لينا عندهم ({allOwingUs.length})
              </button>
              <button
                onClick={() => setShowDebtBook(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-700/30 border border-red-500/40 text-red-300"
              >
                ❤️ ليهم عندنا ({allWeOwe.length})
              </button>
            </div>

            {/* List - اللي لينا */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* قسم لينا عندهم */}
              {allOwingUs.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-green-400 mb-2 px-1">
                    💚 لينا عندهم — {allOwingUs.length} جهة
                  </div>
                  <div className="space-y-2">
                    {allOwingUs.map((c, idx) => (
                      <div key={`owing-${c.id}`}
                        className="flex items-center justify-between bg-white/5 hover:bg-white/8
                                   border border-white/5 hover:border-green-700/30 rounded-xl px-4 py-3
                                   transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/30
                                          flex items-center justify-center text-xs font-bold text-green-400">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{c.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                                c.type === 'supplier'
                                  ? 'bg-blue-900/30 text-blue-400'
                                  : 'bg-violet-900/30 text-violet-400'
                              }`}>
                                {c.type === 'supplier' ? 'مورد' : 'عميل'}
                              </span>
                            </div>
                            {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-black text-green-400">{formatCurrency(c.balance)}</div>
                            <div className="text-xs text-gray-500">مستحق لنا</div>
                          </div>
                          <button
                            onClick={() => {
                              setShowDebtBook(false);
                              onNavigate(c.type === 'supplier' ? 'suppliers' : 'customers');
                            }}
                            className="text-xs text-violet-400 hover:text-violet-300 bg-violet-900/20
                                       hover:bg-violet-900/40 px-3 py-1.5 rounded-lg transition-colors
                                       opacity-0 group-hover:opacity-100">
                            كشف حساب
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allOwingUs.length === 0 && (
                <div className="text-center text-gray-500 py-6">
                  <div className="text-3xl mb-2">🎉</div>
                  <div className="text-sm">ما فيش ديون لينا</div>
                </div>
              )}

              {/* فاصل */}
              {allOwingUs.length > 0 && allWeOwe.length > 0 && (
                <div className="border-t border-white/10 my-2" />
              )}

              {/* قسم ليهم عندنا */}
              {allWeOwe.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-red-400 mb-2 px-1">
                    ❤️ ليهم عندنا — {allWeOwe.length} جهة
                  </div>
                  <div className="space-y-2">
                    {allWeOwe.map((s, idx) => (
                      <div key={`owed-${s.id}`}
                        className="flex items-center justify-between bg-white/5 hover:bg-white/8
                                   border border-white/5 hover:border-red-700/30 rounded-xl px-4 py-3
                                   transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-900/30 border border-red-700/30
                                          flex items-center justify-center text-xs font-bold text-red-400">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{s.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                                s.type === 'customer'
                                  ? 'bg-violet-900/30 text-violet-400'
                                  : 'bg-blue-900/30 text-blue-400'
                              }`}>
                                {s.type === 'customer' ? 'عميل' : 'مورد'}
                              </span>
                            </div>
                            {s.phone && <div className="text-xs text-gray-500">{s.phone}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-black text-red-400">{formatCurrency(s.balance)}</div>
                            <div className="text-xs text-gray-500">مستحق لهم</div>
                          </div>
                          <button
                            onClick={() => {
                              setShowDebtBook(false);
                              onNavigate(s.type === 'customer' ? 'customers' : 'suppliers');
                            }}
                            className="text-xs text-violet-400 hover:text-violet-300 bg-violet-900/20
                                       hover:bg-violet-900/40 px-3 py-1.5 rounded-lg transition-colors
                                       opacity-0 group-hover:opacity-100">
                            كشف حساب
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allWeOwe.length === 0 && (
                <div className="text-center text-gray-500 py-6">
                  <div className="text-3xl mb-2">🎉</div>
                  <div className="text-sm">ما فيش ديون علينا</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 shrink-0">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  صافي المركز المالي:{' '}
                  <span className={`font-bold ${netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(Math.abs(netBalance))}
                    {netBalance >= 0 ? ' لصالحنا ✅' : ' علينا ⚠️'}
                  </span>
                </span>
                <button onClick={() => setShowDebtBook(false)}
                  className="text-gray-400 hover:text-white transition-colors">
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: تعديل الخزينة ══ */}
      {showTreasury && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTreasury(false)}>
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-5">💰 إضافة حركة للخزنة</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTreasuryForm(p => ({ ...p, type: 'cash' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${
                    treasuryForm.type === 'cash'
                      ? 'bg-green-700/30 border-green-500/50 text-green-300'
                      : 'border-white/10 text-gray-400'
                  }`}>💵 كاش</button>
                <button onClick={() => setTreasuryForm(p => ({ ...p, type: 'bank' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${
                    treasuryForm.type === 'bank'
                      ? 'bg-blue-700/30 border-blue-500/50 text-blue-300'
                      : 'border-white/10 text-gray-400'
                  }`}>🏦 بنك</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTreasuryForm(p => ({ ...p, direction: 'in' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${
                    treasuryForm.direction === 'in'
                      ? 'bg-green-700/30 border-green-500/50 text-green-300'
                      : 'border-white/10 text-gray-400'
                  }`}>+ إيداع</button>
                <button onClick={() => setTreasuryForm(p => ({ ...p, direction: 'out' }))}
                  className={`py-2 rounded-xl border text-sm font-medium transition-colors ${
                    treasuryForm.direction === 'out'
                      ? 'bg-red-700/30 border-red-500/50 text-red-300'
                      : 'border-white/10 text-gray-400'
                  }`}>- سحب</button>
              </div>
              <input type="number" value={treasuryForm.amount}
                onChange={e => setTreasuryForm(p => ({ ...p, amount: e.target.value }))}
                className="input-dark w-full" placeholder="المبلغ" />
              <input type="text" value={treasuryForm.description}
                onChange={e => setTreasuryForm(p => ({ ...p, description: e.target.value }))}
                className="input-dark w-full" placeholder="الوصف / السبب" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleTreasuryAdjust} className="btn-primary flex-1">تأكيد</button>
              <button onClick={() => setShowTreasury(false)} className="btn-secondary flex-1">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ StatCard ══ */
function StatCard({ title, value, sub, icon, color, onClick }: {
  title: string; value: string; sub: string; icon: string; color: string; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    green:  'from-green-900/40  to-green-900/10  border-green-700/30',
    blue:   'from-blue-900/40   to-blue-900/10   border-blue-700/30',
    violet: 'from-violet-900/40 to-violet-900/10 border-violet-700/30',
    cyan:   'from-cyan-900/40   to-cyan-900/10   border-cyan-700/30',
    orange: 'from-orange-900/40 to-orange-900/10 border-orange-700/30',
    red:    'from-red-900/40    to-red-900/10    border-red-700/30',
  };
  return (
    <div onClick={onClick}
      className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4 ${
        onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''
      }`}>
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