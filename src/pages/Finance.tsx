import React, { useState, useMemo } from 'react';
import { TreasuryTransaction, DailyClosing, Partner, ProfitDistribution, SaleInvoice, PurchaseInvoice, Expense, NoonOrder } from '../types';
import { formatCurrency, formatDateTime, generateId } from '../utils/helpers';
import { Plus, Edit, Trash2, X, Check, Users, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  cashBalance: number;
  bankBalance: number;
  transactions: TreasuryTransaction[];
  dailyClosings: DailyClosing[];
  adjustTreasury: (type: 'cash' | 'bank', amount: number, dir: 'in' | 'out', desc: string) => void;
  // ✅ الشركاء
  partners: Partner[];
  onAddPartner: (p: Partner) => { success: boolean; message?: string };
  onUpdatePartner: (p: Partner) => void;
  onDeletePartner: (id: string) => void;
  // ✅ توزيع الأرباح
  profitDistributions: ProfitDistribution[];
  onSaveDistribution: (d: ProfitDistribution) => void;
  onDeleteDistribution: (id: string) => void;
  // ✅ بيانات لحساب الربح
  saleInvoices: SaleInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  expenses: Expense[];
  noonOrders: NoonOrder[];
}

export default function Finance({
  cashBalance, bankBalance, transactions, dailyClosings,
  adjustTreasury,
  partners, onAddPartner, onUpdatePartner, onDeletePartner,
  profitDistributions, onSaveDistribution, onDeleteDistribution,
  saleInvoices, expenses, noonOrders,
}: Props) {

  const [activeTab, setActiveTab] = useState<'treasury' | 'closings' | 'partners' | 'profit'>('treasury');
  const [treasuryType, setTreasuryType] = useState<'cash' | 'bank'>('cash');
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjForm, setAdjForm] = useState({ type: 'cash' as 'cash' | 'bank', amount: '', dir: 'in' as 'in' | 'out', desc: '' });

  // ── شركاء ──
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerForm, setPartnerForm] = useState({ name: '', capitalAmount: '', notes: '' });
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [confirmDeletePartner, setConfirmDeletePartner] = useState<Partner | null>(null);

  // ── توزيع الأرباح ──
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [distributionNotes, setDistributionNotes] = useState('');
  const [expandedDistribution, setExpandedDistribution] = useState<string | null>(null);
  const [confirmDeleteDist, setConfirmDeleteDist] = useState<ProfitDistribution | null>(null);

  // ── حسابات الخزينة ──
  const cashTrans = transactions.filter(t => t.treasury === 'cash').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bankTrans = transactions.filter(t => t.treasury === 'bank').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── حسابات الشركاء ──
  const activePartners = partners.filter(p => p.isActive);
  const totalCapital = activePartners.reduce((s, p) => s + p.capitalAmount, 0);

  const partnersWithPercent = activePartners.map(p => ({
    ...p,
    percent: totalCapital > 0 ? (p.capitalAmount / totalCapital) * 100 : 0,
  }));

  // ── حساب ربح/خسارة الشهر المختار ──
  const monthlyStats = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);

    const isInMonth = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    };

    // ربح المبيعات = سعر البيع - التكلفة للمنتجات المباعة في الشهر
    let salesProfit = 0;
    saleInvoices
      .filter(inv => isInMonth(inv.date))
      .forEach(inv => {
        inv.items.forEach(item => {
          const itemProfit = item.total - ((item.costPrice || 0) * item.quantity);
          salesProfit += itemProfit;
        });
      });

    // ربح نون = settlementProfit للأوردرات المسواة في الشهر
    const noonProfit = noonOrders
      .filter(o => o.status === 'settled' && o.settledDate && isInMonth(o.settledDate))
      .reduce((s, o) => s + (o.settlementProfit || 0), 0);

    // المصروفات
    const totalExpenses = expenses
      .filter(e => isInMonth(e.date))
      .reduce((s, e) => s + e.amount, 0);

    const netProfit = salesProfit + noonProfit - totalExpenses;

    return { salesProfit, noonProfit, totalExpenses, netProfit };
  }, [selectedMonth, saleInvoices, noonOrders, expenses]);

  // ── حساب نصيب كل شريك ──
  const distributionPreview = partnersWithPercent.map(p => ({
    ...p,
    shareAmount: (monthlyStats.netProfit * p.percent) / 100,
  }));

  // ── هل الشهر ده اتعمله توزيع قبل كده؟ ──
  const existingDistribution = profitDistributions.find(d => d.month === selectedMonth);

  // ── اعتماد التوزيع ──
  const handleSaveDistribution = () => {
    if (activePartners.length === 0) return;

    const lines = distributionPreview.map(p => ({
      partnerId: p.id,
      partnerName: p.name,
      capitalAmount: p.capitalAmount,
      capitalPercent: p.percent,
      shareAmount: p.shareAmount,
    }));

    const distribution: ProfitDistribution = {
      id: selectedMonth,
      month: selectedMonth,
      totalCapital,
      netProfit: monthlyStats.netProfit,
      salesProfit: monthlyStats.salesProfit,
      noonProfit: monthlyStats.noonProfit,
      totalExpenses: monthlyStats.totalExpenses,
      lines,
      notes: distributionNotes,
      createdAt: new Date().toISOString(),
    };

    onSaveDistribution(distribution);
    setDistributionNotes('');
  };

  // ── فورم الشريك ──
  const openAddPartner = () => {
    setEditingPartner(null);
    setPartnerForm({ name: '', capitalAmount: '', notes: '' });
    setPartnerError(null);
    setShowPartnerForm(true);
  };

  const openEditPartner = (p: Partner) => {
    setEditingPartner(p);
    setPartnerForm({ name: p.name, capitalAmount: String(p.capitalAmount), notes: p.notes || '' });
    setPartnerError(null);
    setShowPartnerForm(true);
  };

  const handleSavePartner = () => {
    if (!partnerForm.name.trim()) { setPartnerError('اسم الشريك مطلوب'); return; }
    const capital = parseFloat(partnerForm.capitalAmount) || 0;
    if (capital <= 0) { setPartnerError('رأس المال لازم يكون أكبر من صفر'); return; }

    const now = new Date().toISOString();
    if (editingPartner) {
      onUpdatePartner({
        ...editingPartner,
        name: partnerForm.name.trim(),
        capitalAmount: capital,
        notes: partnerForm.notes,
        updatedAt: now,
      });
    } else {
      const result = onAddPartner({
        id: generateId(),
        name: partnerForm.name.trim(),
        capitalAmount: capital,
        isActive: true,
        notes: partnerForm.notes,
        createdAt: now,
        updatedAt: now,
      });
      if (!result.success) { setPartnerError(result.message || 'خطأ'); return; }
    }

    setShowPartnerForm(false);
    setPartnerError(null);
  };

  const handleAdjust = () => {
    if (!adjForm.amount || !adjForm.desc) return;
    adjustTreasury(adjForm.type, parseFloat(adjForm.amount), adjForm.dir, adjForm.desc);
    setAdjForm({ type: 'cash', amount: '', dir: 'in', desc: '' });
    setShowAdjust(false);
  };

  // ── اسم الشهر بالعربي ──
  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">💰 المالية والخزينة</h2></div>
        <button onClick={() => setShowAdjust(true)} className="btn-primary text-sm">+ إضافة حركة</button>
      </div>

      {/* Treasury Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-900/40 to-green-900/10 border border-green-700/40 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-green-400 text-4xl">💵</div>
            <div className="text-right">
              <div className="text-xs text-green-400 font-medium">خزنة الكاش</div>
              <div className="text-3xl font-black text-white mt-1">{formatCurrency(cashBalance)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-green-900/20 rounded-xl p-2">
              <div className="text-xs text-green-400">إجمالي الدخل</div>
              <div className="font-bold text-white text-sm">{formatCurrency(cashTrans.filter(t => t.direction === 'in').reduce((s, t) => s + t.amount, 0))}</div>
            </div>
            <div className="bg-green-900/20 rounded-xl p-2">
              <div className="text-xs text-green-400">إجمالي الخروج</div>
              <div className="font-bold text-white text-sm">{formatCurrency(cashTrans.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0))}</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/10 border border-blue-700/40 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-blue-400 text-4xl">🏦</div>
            <div className="text-right">
              <div className="text-xs text-blue-400 font-medium">خزنة البنك</div>
              <div className="text-3xl font-black text-white mt-1">{formatCurrency(bankBalance)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-blue-900/20 rounded-xl p-2">
              <div className="text-xs text-blue-400">إجمالي الدخل</div>
              <div className="font-bold text-white text-sm">{formatCurrency(bankTrans.filter(t => t.direction === 'in').reduce((s, t) => s + t.amount, 0))}</div>
            </div>
            <div className="bg-blue-900/20 rounded-xl p-2">
              <div className="text-xs text-blue-400">إجمالي الخروج</div>
              <div className="font-bold text-white text-sm">{formatCurrency(bankTrans.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0))}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'treasury', label: 'حركات الخزينة' },
          { key: 'closings', label: 'تقفيلات اليومية' },
          { key: 'partners', label: '👥 الشركاء' },
          { key: 'profit', label: '📊 توزيع الأرباح' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              activeTab === tab.key
                ? 'bg-violet-700/30 border-violet-500/50 text-violet-300'
                : 'border-white/10 text-gray-400 hover:border-white/20'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ==================== تاب الخزينة ==================== */}
      {activeTab === 'treasury' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTreasuryType('cash')}
              className={`px-4 py-2 rounded-xl text-sm border transition-colors ${treasuryType === 'cash' ? 'bg-green-900/30 border-green-700/40 text-green-300' : 'border-white/10 text-gray-400'}`}>
              💵 الكاش ({cashTrans.length})
            </button>
            <button onClick={() => setTreasuryType('bank')}
              className={`px-4 py-2 rounded-xl text-sm border transition-colors ${treasuryType === 'bank' ? 'bg-blue-900/30 border-blue-700/40 text-blue-300' : 'border-white/10 text-gray-400'}`}>
              🏦 البنك ({bankTrans.length})
            </button>
          </div>
          <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-violet-900/20">
                <tr>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">التاريخ</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">البيان</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">النوع</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {(treasuryType === 'cash' ? cashTrans : bankTrans).length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-gray-500">لا توجد حركات بعد</td></tr>
                ) : (treasuryType === 'cash' ? cashTrans : bankTrans).map(t => (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="py-3 px-4 text-gray-400 text-xs">{t.date}</td>
                    <td className="py-3 px-4 text-white">{t.description}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.direction === 'in' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {t.direction === 'in' ? '⬆️ دخل' : '⬇️ خروج'}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-center font-bold ${t.direction === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.direction === 'in' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== تاب التقفيلات ==================== */}
      {activeTab === 'closings' && (
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-violet-900/20">
              <tr>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">التاريخ</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">الكاش (نظام)</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">الكاش (فعلي)</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">الفرق</th>
                <th className="text-center py-3 px-4 text-gray-400 font-medium">المبيعات</th>
              </tr>
            </thead>
            <tbody>
              {dailyClosings.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-500">لا توجد تقفيلات بعد</td></tr>
              ) : dailyClosings.sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4 text-white font-medium">{c.date}</td>
                  <td className="py-3 px-4 text-center text-gray-300">{formatCurrency(c.openingCash)}</td>
                  <td className="py-3 px-4 text-center text-white">{formatCurrency(c.closingCash)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      Math.abs(c.cashDifference) < 1
                        ? 'bg-green-900/40 text-green-400'
                        : c.cashDifference > 0
                        ? 'bg-yellow-900/40 text-yellow-400'
                        : 'bg-red-900/40 text-red-400'
                    }`}>
                      {Math.abs(c.cashDifference) < 1 ? '✓ مضبوط' : c.cashDifference > 0 ? `+${c.cashDifference}` : `${c.cashDifference}`}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-green-400">{formatCurrency(c.totalSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== تاب الشركاء ==================== */}
      {activeTab === 'partners' && (
        <div className="space-y-4">

          {/* ملخص رأس المال */}
          {partners.length > 0 && (
            <div className="bg-gradient-to-br from-violet-900/30 to-purple-900/20 border border-violet-700/30 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Users size={20} className="text-violet-400" />
                <h3 className="font-bold text-white">ملخص رأس المال</h3>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-violet-900/20 rounded-xl p-3">
                  <div className="text-xs text-violet-400 mb-1">إجمالي رأس المال</div>
                  <div className="text-lg font-black text-white">{formatCurrency(totalCapital)}</div>
                </div>
                <div className="bg-violet-900/20 rounded-xl p-3">
                  <div className="text-xs text-violet-400 mb-1">عدد الشركاء النشطين</div>
                  <div className="text-lg font-black text-white">{activePartners.length}</div>
                </div>
                <div className="bg-violet-900/20 rounded-xl p-3">
                  <div className="text-xs text-violet-400 mb-1">إجمالي الشركاء</div>
                  <div className="text-lg font-black text-white">{partners.length}</div>
                </div>
              </div>
            </div>
          )}

          {/* زر إضافة */}
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white">قائمة الشركاء</h3>
            <button onClick={openAddPartner} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} /> إضافة شريك
            </button>
          </div>

          {/* قائمة الشركاء */}
          {partners.length === 0 ? (
            <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">👥</div>
              <div className="text-gray-400">لا يوجد شركاء بعد</div>
              <div className="text-gray-600 text-sm mt-1">اضغط "إضافة شريك" لإضافة أول شريك</div>
            </div>
          ) : (
            <div className="space-y-3">
              {partners.map(partner => {
                const percent = totalCapital > 0 ? (partner.capitalAmount / totalCapital) * 100 : 0;
                return (
                  <div key={partner.id}
                    className={`bg-[#1a1a35] border rounded-2xl p-4 ${
                      partner.isActive ? 'border-violet-900/30' : 'border-white/5 opacity-60'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black ${
                          partner.isActive ? 'bg-violet-700/30 text-violet-300' : 'bg-gray-700/30 text-gray-400'
                        }`}>
                          {partner.name[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{partner.name}</span>
                            {!partner.isActive && (
                              <span className="text-xs bg-gray-700/40 text-gray-400 px-2 py-0.5 rounded-full">موقوف</span>
                            )}
                          </div>
                          {partner.notes && <div className="text-xs text-gray-500 mt-0.5">{partner.notes}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-black text-white text-lg">{formatCurrency(partner.capitalAmount)}</div>
                          <div className="text-xs text-violet-400">{percent.toFixed(1)}% من رأس المال</div>
                        </div>
                        <div className="flex gap-1">
                          {/* زر تفعيل/إيقاف */}
                          <button
                            onClick={() => onUpdatePartner({ ...partner, isActive: !partner.isActive, updatedAt: new Date().toISOString() })}
                            className={`p-1.5 rounded-lg text-xs transition-colors ${
                              partner.isActive
                                ? 'text-green-400 hover:bg-green-900/20'
                                : 'text-gray-400 hover:bg-white/10'
                            }`}
                            title={partner.isActive ? 'إيقاف' : 'تفعيل'}
                          >
                            {partner.isActive ? <Check size={14} /> : <X size={14} />}
                          </button>
                          <button onClick={() => openEditPartner(partner)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 transition-colors">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => setConfirmDeletePartner(partner)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* شريط النسبة */}
                    {partner.isActive && totalCapital > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-600 to-purple-500 rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== تاب توزيع الأرباح ==================== */}
      {activeTab === 'profit' && (
        <div className="space-y-4">

          {/* اختيار الشهر */}
          <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-violet-400" />
              حساب نتيجة الشهر
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="form-label">الشهر</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="input-dark w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={distributionNotes}
                  onChange={e => setDistributionNotes(e.target.value)}
                  className="input-dark w-full"
                  placeholder="مثال: ربح شهر يونيو 2026 بعد حساب المصروفات"
                />
              </div>
            </div>

            {/* تفاصيل النتيجة */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-green-400 mb-1">ربح المبيعات</div>
                <div className={`text-lg font-black ${monthlyStats.salesProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(monthlyStats.salesProfit)}
                </div>
              </div>
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-400 mb-1">ربح نون/أمازون</div>
                <div className={`text-lg font-black ${monthlyStats.noonProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {formatCurrency(monthlyStats.noonProfit)}
                </div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-red-400 mb-1">المصروفات</div>
                <div className="text-lg font-black text-red-400">
                  - {formatCurrency(monthlyStats.totalExpenses)}
                </div>
              </div>
              <div className={`border rounded-xl p-3 text-center ${
                monthlyStats.netProfit >= 0
                  ? 'bg-violet-900/20 border-violet-700/30'
                  : 'bg-red-900/30 border-red-700/40'
              }`}>
                <div className="text-xs text-violet-400 mb-1">
                  {monthlyStats.netProfit >= 0 ? '✅ صافي الربح' : '🔴 صافي الخسارة'}
                </div>
                <div className={`text-lg font-black ${monthlyStats.netProfit >= 0 ? 'text-violet-300' : 'text-red-400'}`}>
                  {formatCurrency(Math.abs(monthlyStats.netProfit))}
                </div>
              </div>
            </div>

            {/* جدول التوزيع */}
            {activePartners.length === 0 ? (
              <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-4 text-center text-orange-400 text-sm">
                ⚠️ لا يوجد شركاء نشطين — أضف شركاء من تاب "الشركاء" أولاً
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-white/5 mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-violet-900/20">
                      <tr>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">الشريك</th>
                        <th className="text-center py-3 px-4 text-gray-400 font-medium">رأس المال</th>
                        <th className="text-center py-3 px-4 text-gray-400 font-medium">النسبة</th>
                        <th className="text-center py-3 px-4 text-gray-400 font-medium">
                          {monthlyStats.netProfit >= 0 ? 'نصيبه من الربح' : 'نصيبه من الخسارة'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {distributionPreview.map(p => (
                        <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-violet-700/30 flex items-center justify-center text-xs font-black text-violet-300">
                                {p.name[0]}
                              </div>
                              <span className="text-white font-medium">{p.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-300">{formatCurrency(p.capitalAmount)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="bg-violet-900/30 text-violet-300 px-2 py-0.5 rounded-full text-xs font-bold">
                              {p.percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-black text-base ${p.shareAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {p.shareAmount >= 0 ? '+' : ''}{formatCurrency(p.shareAmount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-violet-700/30 bg-violet-900/10">
                        <td className="py-3 px-4 font-bold text-white">الإجمالي</td>
                        <td className="py-3 px-4 text-center font-bold text-white">{formatCurrency(totalCapital)}</td>
                        <td className="py-3 px-4 text-center font-bold text-violet-400">100%</td>
                        <td className={`py-3 px-4 text-center font-black text-lg ${monthlyStats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(monthlyStats.netProfit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* زر الاعتماد */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveDistribution}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Check size={16} />
                    {existingDistribution ? 'تحديث اعتماد الشهر' : 'اعتماد توزيع الشهر'}
                  </button>
                  {existingDistribution && (
                    <span className="text-xs text-green-400 bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-xl">
                      ✅ هذا الشهر تم اعتماده من قبل
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* سجل التوزيعات السابقة */}
          {profitDistributions.length > 0 && (
            <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4">📋 سجل التوزيعات السابقة</h3>
              <div className="space-y-3">
                {[...profitDistributions]
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map(dist => (
                  <div key={dist.id}
                    className="border border-white/5 rounded-xl overflow-hidden">
                    {/* Header */}
                    <button
                      onClick={() => setExpandedDistribution(expandedDistribution === dist.id ? null : dist.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-white font-bold">{getMonthName(dist.month)}</span>
                        <span className={`text-sm font-bold ${dist.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {dist.netProfit >= 0 ? '▲ ربح' : '▼ خسارة'} {formatCurrency(Math.abs(dist.netProfit))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDeleteDist(dist); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                        {expandedDistribution === dist.id
                          ? <ChevronUp size={16} className="text-gray-400" />
                          : <ChevronDown size={16} className="text-gray-400" />
                        }
                      </div>
                    </button>

                    {/* Details */}
                    {expandedDistribution === dist.id && (
                      <div className="px-4 pb-4 border-t border-white/5">
                        {/* ملخص */}
                        <div className="grid grid-cols-3 gap-2 my-3">
                          <div className="bg-white/5 rounded-lg p-2 text-center">
                            <div className="text-xs text-gray-500">ربح المبيعات</div>
                            <div className="text-sm font-bold text-green-400">{formatCurrency(dist.salesProfit)}</div>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 text-center">
                            <div className="text-xs text-gray-500">ربح نون</div>
                            <div className="text-sm font-bold text-blue-400">{formatCurrency(dist.noonProfit)}</div>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 text-center">
                            <div className="text-xs text-gray-500">المصروفات</div>
                            <div className="text-sm font-bold text-red-400">- {formatCurrency(dist.totalExpenses)}</div>
                          </div>
                        </div>

                        {/* جدول الشركاء */}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-500 text-xs">
                              <th className="text-right pb-2">الشريك</th>
                              <th className="text-center pb-2">رأس المال</th>
                              <th className="text-center pb-2">النسبة</th>
                              <th className="text-center pb-2">النصيب</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dist.lines.map(line => (
                              <tr key={line.partnerId} className="border-t border-white/5">
                                <td className="py-2 text-white">{line.partnerName}</td>
                                <td className="py-2 text-center text-gray-400">{formatCurrency(line.capitalAmount)}</td>
                                <td className="py-2 text-center text-violet-400">{line.capitalPercent.toFixed(1)}%</td>
                                <td className={`py-2 text-center font-bold ${line.shareAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {line.shareAmount >= 0 ? '+' : ''}{formatCurrency(line.shareAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {dist.notes && (
                          <div className="mt-3 text-xs text-gray-500 bg-white/5 rounded-lg px-3 py-2">
                            📝 {dist.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ مودال تعديل الخزينة ══ */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">💰 إضافة حركة للخزينة</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAdjForm(p => ({ ...p, type: 'cash' }))}
                  className={`py-2 rounded-xl border text-sm ${adjForm.type === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>
                  💵 كاش
                </button>
                <button onClick={() => setAdjForm(p => ({ ...p, type: 'bank' }))}
                  className={`py-2 rounded-xl border text-sm ${adjForm.type === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>
                  🏦 بنك
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAdjForm(p => ({ ...p, dir: 'in' }))}
                  className={`py-2 rounded-xl border text-sm ${adjForm.dir === 'in' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>
                  + إيداع
                </button>
                <button onClick={() => setAdjForm(p => ({ ...p, dir: 'out' }))}
                  className={`py-2 rounded-xl border text-sm ${adjForm.dir === 'out' ? 'bg-red-700/30 border-red-500/50 text-red-300' : 'border-white/10 text-gray-400'}`}>
                  - سحب
                </button>
              </div>
              <input type="number" value={adjForm.amount}
                onChange={e => setAdjForm(p => ({ ...p, amount: e.target.value }))}
                className="input-dark w-full" placeholder="المبلغ" />
              <input type="text" value={adjForm.desc}
                onChange={e => setAdjForm(p => ({ ...p, desc: e.target.value }))}
                className="input-dark w-full" placeholder="وصف / سبب الحركة" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAdjust} className="btn-primary flex-1">تأكيد</button>
              <button onClick={() => setShowAdjust(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ مودال إضافة/تعديل شريك ══ */}
      {showPartnerForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">
              {editingPartner ? '✏️ تعديل بيانات الشريك' : '👤 إضافة شريك جديد'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="form-label">اسم الشريك *</label>
                <input type="text" value={partnerForm.name}
                  onChange={e => setPartnerForm(p => ({ ...p, name: e.target.value }))}
                  className="input-dark w-full" placeholder="مثال: أحمد محمد" autoFocus />
              </div>
              <div>
                <label className="form-label">مبلغ رأس المال *</label>
                <input type="number" value={partnerForm.capitalAmount}
                  onChange={e => setPartnerForm(p => ({ ...p, capitalAmount: e.target.value }))}
                  className="input-dark w-full" placeholder="مثال: 100000" />
                <p className="text-xs text-gray-500 mt-1">
                  💡 النسبة ستُحسب تلقائياً من مجموع رأس المال
                </p>
              </div>
              <div>
                <label className="form-label">ملاحظات (اختياري)</label>
                <input type="text" value={partnerForm.notes}
                  onChange={e => setPartnerForm(p => ({ ...p, notes: e.target.value }))}
                  className="input-dark w-full" placeholder="أي ملاحظات..." />
              </div>

              {/* معاينة النسبة */}
              {partnerForm.capitalAmount && parseFloat(partnerForm.capitalAmount) > 0 && (
                <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl px-3 py-2 text-sm">
                  <div className="text-violet-400 text-xs mb-1">معاينة النسبة:</div>
                  <div className="text-white font-bold">
                    {(() => {
                      const newCapital = parseFloat(partnerForm.capitalAmount) || 0;
                      const otherCapital = activePartners
                        .filter(p => p.id !== editingPartner?.id)
                        .reduce((s, p) => s + p.capitalAmount, 0);
                      const newTotal = otherCapital + newCapital;
                      const percent = newTotal > 0 ? (newCapital / newTotal) * 100 : 0;
                      return `${percent.toFixed(1)}% من إجمالي ${formatCurrency(newTotal)}`;
                    })()}
                  </div>
                </div>
              )}
            </div>

            {partnerError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {partnerError}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={handleSavePartner} className="btn-primary flex-1">
                {editingPartner ? 'حفظ التعديلات' : 'إضافة'}
              </button>
              <button onClick={() => { setShowPartnerForm(false); setPartnerError(null); }}
                className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ تأكيد حذف شريك ══ */}
      {confirmDeletePartner && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف شريك</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل أنت متأكد من حذف الشريك{' '}
              <span className="text-white font-bold">"{confirmDeletePartner.name}"</span>؟
              <br />
              <span className="text-red-400 text-xs">لن يؤثر على التوزيعات السابقة المعتمدة.</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { onDeletePartner(confirmDeletePartner.id); setConfirmDeletePartner(null); }}
                className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">
                🗑️ تأكيد الحذف
              </button>
              <button onClick={() => setConfirmDeletePartner(null)} className="btn-secondary flex-1">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ تأكيد حذف توزيع ══ */}
      {confirmDeleteDist && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف توزيع الشهر</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل تريد حذف توزيع شهر{' '}
              <span className="text-white font-bold">"{getMonthName(confirmDeleteDist.month)}"</span>؟
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { onDeleteDistribution(confirmDeleteDist.id); setConfirmDeleteDist(null); }}
                className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">
                🗑️ تأكيد الحذف
              </button>
              <button onClick={() => setConfirmDeleteDist(null)} className="btn-secondary flex-1">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}