import React, { useState } from 'react';
import { Expense } from '../types';
import { formatCurrency, generateId, getTodayStr } from '../utils/helpers';
import { Plus, Search } from 'lucide-react';

interface Props {
  expenses: Expense[];
  onAddExpense: (e: Expense) => void;
}

const EXPENSE_CATEGORIES = ['مصاريف تشغيل', 'إيجار', 'رواتب', 'مواصلات', 'اتصالات', 'كهرباء', 'صيانة', 'تسويق', 'أخرى'];

export default function Expenses({ expenses, onAddExpense }: Props) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    paymentMethod: 'cash' as 'cash' | 'bank',
    category: 'مصاريف تشغيل',
    date: getTodayStr(),
    notes: '',
  });

  const filtered = expenses.filter(e =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    (e.category || '').toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const cashExpenses = expenses.filter(e => e.paymentMethod === 'cash').reduce((s, e) => s + e.amount, 0);
  const bankExpenses = expenses.filter(e => e.paymentMethod === 'bank').reduce((s, e) => s + e.amount, 0);

  const handleSave = () => {
    if (!form.description || !form.amount) return;
    onAddExpense({
      id: generateId(),
      description: form.description,
      amount: parseFloat(form.amount),
      paymentMethod: form.paymentMethod,
      category: form.category,
      date: form.date,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    });
    setForm({ description: '', amount: '', paymentMethod: 'cash', category: 'مصاريف تشغيل', date: getTodayStr(), notes: '' });
    setShowForm(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">💸 المصروفات</h2><p className="text-gray-500 text-sm">{expenses.length} عملية</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> إضافة مصروف</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(totalExpenses)}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المصروفات</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(cashExpenses)}</div>
          <div className="text-xs text-gray-500 mt-1">مصروفات كاش</div>
        </div>
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{formatCurrency(bankExpenses)}</div>
          <div className="text-xs text-gray-500 mt-1">مصروفات بنك</div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المصروفات..." className="input-dark w-full pr-9" />
      </div>

      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">التاريخ</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">البيان</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium hidden md:table-cell">التصنيف</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">طريقة الدفع</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">لا توجد مصروفات بعد</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-gray-400 text-xs">{e.date}</td>
                <td className="py-3 px-4 text-white">{e.description}</td>
                <td className="py-3 px-4 text-gray-400 text-xs hidden md:table-cell">{e.category || '-'}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${e.paymentMethod === 'cash' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                    {e.paymentMethod === 'cash' ? '💵 كاش' : '🏦 بنك'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center font-bold text-red-400">{formatCurrency(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">💸 إضافة مصروف جديد</h3>
            <div className="space-y-3">
              <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-dark w-full" placeholder="وصف المصروف *" />
              <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="input-dark w-full" placeholder="المبلغ *" />
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="input-dark w-full">
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="input-dark w-full" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm(p => ({ ...p, paymentMethod: 'cash' }))} className={`py-2 rounded-xl border text-sm ${form.paymentMethod === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 كاش</button>
                <button onClick={() => setForm(p => ({ ...p, paymentMethod: 'bank' }))} className={`py-2 rounded-xl border text-sm ${form.paymentMethod === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 بنك</button>
              </div>
              <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input-dark w-full" placeholder="ملاحظات" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">💾 حفظ</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
