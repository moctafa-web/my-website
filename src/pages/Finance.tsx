import React, { useState } from 'react';
import { TreasuryTransaction, DailyClosing } from '../types';
import { formatCurrency, formatDateTime } from '../utils/helpers';

interface Props {
  cashBalance: number;
  bankBalance: number;
  transactions: TreasuryTransaction[];
  dailyClosings: DailyClosing[];
  adjustTreasury: (type: 'cash' | 'bank', amount: number, dir: 'in' | 'out', desc: string) => void;
}

export default function Finance({ cashBalance, bankBalance, transactions, dailyClosings, adjustTreasury }: Props) {
  const [activeTab, setActiveTab] = useState<'treasury' | 'closings'>('treasury');
  const [treasuryType, setTreasuryType] = useState<'cash' | 'bank'>('cash');
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjForm, setAdjForm] = useState({ type: 'cash' as 'cash' | 'bank', amount: '', dir: 'in' as 'in' | 'out', desc: '' });

  const cashTrans = transactions.filter(t => t.treasury === 'cash').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bankTrans = transactions.filter(t => t.treasury === 'bank').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const handleAdjust = () => {
    if (!adjForm.amount || !adjForm.desc) return;
    adjustTreasury(adjForm.type, parseFloat(adjForm.amount), adjForm.dir, adjForm.desc);
    setAdjForm({ type: 'cash', amount: '', dir: 'in', desc: '' });
    setShowAdjust(false);
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
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('treasury')} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${activeTab === 'treasury' ? 'bg-violet-700/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>حركات الخزينة</button>
        <button onClick={() => setActiveTab('closings')} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${activeTab === 'closings' ? 'bg-violet-700/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>تقفيلات اليومية</button>
      </div>

      {activeTab === 'treasury' && (
        <div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTreasuryType('cash')} className={`px-4 py-2 rounded-xl text-sm border transition-colors ${treasuryType === 'cash' ? 'bg-green-900/30 border-green-700/40 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 الكاش ({cashTrans.length})</button>
            <button onClick={() => setTreasuryType('bank')} className={`px-4 py-2 rounded-xl text-sm border transition-colors ${treasuryType === 'bank' ? 'bg-blue-900/30 border-blue-700/40 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 البنك ({bankTrans.length})</button>
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
                    <span className={`text-xs px-2 py-0.5 rounded-full ${Math.abs(c.cashDifference) < 1 ? 'bg-green-900/40 text-green-400' : c.cashDifference > 0 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'}`}>
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

      {/* Adjust Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">💰 إضافة حركة للخزينة</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAdjForm(p => ({ ...p, type: 'cash' }))} className={`py-2 rounded-xl border text-sm ${adjForm.type === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 كاش</button>
                <button onClick={() => setAdjForm(p => ({ ...p, type: 'bank' }))} className={`py-2 rounded-xl border text-sm ${adjForm.type === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 بنك</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAdjForm(p => ({ ...p, dir: 'in' }))} className={`py-2 rounded-xl border text-sm ${adjForm.dir === 'in' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>+ إيداع</button>
                <button onClick={() => setAdjForm(p => ({ ...p, dir: 'out' }))} className={`py-2 rounded-xl border text-sm ${adjForm.dir === 'out' ? 'bg-red-700/30 border-red-500/50 text-red-300' : 'border-white/10 text-gray-400'}`}>- سحب</button>
              </div>
              <input type="number" value={adjForm.amount} onChange={e => setAdjForm(p => ({ ...p, amount: e.target.value }))} className="input-dark w-full" placeholder="المبلغ" />
              <input type="text" value={adjForm.desc} onChange={e => setAdjForm(p => ({ ...p, desc: e.target.value }))} className="input-dark w-full" placeholder="وصف / سبب الحركة" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAdjust} className="btn-primary flex-1">تأكيد</button>
              <button onClick={() => setShowAdjust(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
