import React, { useState } from 'react';
import { Customer, SaleInvoice, Payment } from '../types';
import { formatCurrency, generateId, getTodayStr, printElement } from '../utils/helpers';
import { Plus, Search, X, Printer, DollarSign, Eye } from 'lucide-react';

interface Props {
  customers: Customer[];
  saleInvoices: SaleInvoice[];
  payments: Payment[];
  cashBalance: number;
  bankBalance: number;
  onAddCustomer: (c: Customer) => void;
  onUpdateCustomer: (c: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onAddPayment: (p: Payment) => void;
}

export default function Customers({ customers, saleInvoices, payments, onAddCustomer, onUpdateCustomer, onDeleteCustomer, onAddPayment }: Props) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [showPayment, setShowPayment] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', type: 'individual' as Customer['type'], notes: '', openingBalance: 0 });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  const openAdd = () => { setEditCustomer(null); setForm({ name: '', phone: '', email: '', address: '', type: 'individual', notes: '', openingBalance: 0 }); setShowForm(true); };
  const openEdit = (c: Customer) => { setEditCustomer(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', type: c.type, notes: c.notes || '', openingBalance: c.openingBalance }); setShowForm(true); };

  const handleSave = () => {
    if (!form.name) return;
    if (editCustomer) {
      onUpdateCustomer({ ...editCustomer, ...form });
    } else {
      onAddCustomer({ id: generateId(), ...form, totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString() });
    }
    setShowForm(false);
  };

  const handlePayment = () => {
    if (!showPayment || !paymentAmount) return;
    onAddPayment({
      id: generateId(),
      type: 'sale',
      referenceId: showPayment.id,
      referenceName: showPayment.name,
      amount: parseFloat(paymentAmount),
      paymentMethod,
      direction: 'in',
      date: getTodayStr(),
      notes: paymentNotes,
      createdAt: new Date().toISOString(),
    });
    setPaymentAmount('');
    setPaymentNotes('');
    setShowPayment(null);
  };

  const getCustomerInvoices = (customerId: string) => saleInvoices.filter(inv => inv.customerId === customerId);
  const getCustomerPayments = (customerId: string) => payments.filter(p => p.type === 'sale' && p.referenceId === customerId);

  const getBalance = (c: Customer) => {
    const totalInv = getCustomerInvoices(c.id).reduce((s, i) => s + i.total, 0) + c.openingBalance;
    const totalPaid = getCustomerInvoices(c.id).reduce((s, i) => s + i.paid, 0);
    return totalInv - totalPaid;
  };

  const printStatement = (c: Customer) => {
    const invs = getCustomerInvoices(c.id);
    const pmts = getCustomerPayments(c.id);
    const balance = getBalance(c);

    let running = c.openingBalance;
    const allTrans = [
      ...invs.map(inv => ({ date: inv.date, desc: `فاتورة ${inv.invoiceNumber}`, debit: inv.total, credit: 0, ref: inv.invoiceNumber })),
      ...pmts.map(p => ({ date: p.date, desc: `دفعة - ${p.paymentMethod === 'cash' ? 'كاش' : 'بنك'}`, debit: 0, credit: p.amount, ref: '' })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const rows = allTrans.map(t => {
      running += t.debit - t.credit;
      return `<tr><td>${t.date}</td><td>${t.desc}</td><td>${t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td><td>${t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td><td>${running.toLocaleString('ar-EG')}</td></tr>`;
    }).join('');

    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>كشف حساب عميل</strong></div><div>${c.name}</div><div>${c.phone || ''}</div><div>حتى تاريخ: ${getTodayStr()}</div></div>
      </div>
      ${c.openingBalance > 0 ? `<p style="margin-bottom:10px;font-size:13px">الرصيد الافتتاحي: ${c.openingBalance.toLocaleString('ar-EG')} ج.م</p>` : ''}
      <table>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals"><table>
        <tr><td>إجمالي الفواتير</td><td>${invs.reduce((s, i) => s + i.total, 0).toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>إجمالي المدفوع</td><td>${invs.reduce((s, i) => s + i.paid, 0).toLocaleString('ar-EG')} ج.م</td></tr>
        <tr class="total-row"><td>الرصيد النهائي (مستحق منه)</td><td>${balance.toLocaleString('ar-EG')} ج.م</td></tr>
      </table></div>
    `);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">👥 العملاء</h2><p className="text-gray-500 text-sm">{customers.length} عميل</p></div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus size={16} /> عميل جديد</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-violet-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-violet-400">{customers.length}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي العملاء</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(customers.reduce((s, c) => s + (getCustomerInvoices(c.id).reduce((x, i) => x + i.total, 0)), 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المبيعات</div>
        </div>
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(customers.reduce((s, c) => s + Math.max(0, getBalance(c)), 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المديونيات</div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." className="input-dark w-full pr-9" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => {
          const balance = getBalance(c);
          const invCount = getCustomerInvoices(c.id).length;
          return (
            <div key={c.id} className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 hover:border-violet-700/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-violet-900/40 flex items-center justify-center text-lg font-bold text-violet-300">
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.phone || 'لا يوجد هاتف'}</div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.type === 'individual' ? 'bg-blue-900/40 text-blue-400' : c.type === 'company' ? 'bg-purple-900/40 text-purple-400' : 'bg-orange-900/40 text-orange-400'}`}>
                  {c.type === 'individual' ? 'فرد' : c.type === 'company' ? 'شركة' : 'تاجر'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-[#252545] rounded-xl p-2 text-center">
                  <div className="text-xs text-gray-500">عدد الفواتير</div>
                  <div className="font-bold text-white">{invCount}</div>
                </div>
                <div className={`rounded-xl p-2 text-center ${balance > 0 ? 'bg-red-900/20' : 'bg-green-900/20'}`}>
                  <div className="text-xs text-gray-500">الرصيد المستحق</div>
                  <div className={`font-bold text-sm ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewCustomer(c)} className="flex-1 py-1.5 text-xs bg-violet-900/20 border border-violet-700/30 rounded-xl text-violet-300 hover:bg-violet-900/40 flex items-center justify-center gap-1"><Eye size={12} /> كشف حساب</button>
                <button onClick={() => setShowPayment(c)} className="flex-1 py-1.5 text-xs bg-green-900/20 border border-green-700/30 rounded-xl text-green-300 hover:bg-green-900/40 flex items-center justify-center gap-1"><DollarSign size={12} /> تحصيل</button>
                <button onClick={() => printStatement(c)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white"><Printer size={12} /></button>
                <button onClick={() => openEdit(c)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-violet-400">✏️</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Statement Modal */}
      {viewCustomer && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-3xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📊 كشف حساب - {viewCustomer.name}</h2>
              <div className="flex gap-2">
                <button onClick={() => printStatement(viewCustomer)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> طباعة PDF</button>
                <button onClick={() => setViewCustomer(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-[#252545] rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">الرصيد الافتتاحي</div>
                <div className="font-bold text-white">{viewCustomer.openingBalance.toLocaleString('ar-EG')}</div>
              </div>
              <div className="bg-[#252545] rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">إجمالي الفواتير</div>
                <div className="font-bold text-green-400">{formatCurrency(getCustomerInvoices(viewCustomer.id).reduce((s, i) => s + i.total, 0))}</div>
              </div>
              <div className="bg-[#252545] rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">المدفوع</div>
                <div className="font-bold text-blue-400">{formatCurrency(getCustomerInvoices(viewCustomer.id).reduce((s, i) => s + i.paid, 0))}</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">الرصيد النهائي</div>
                <div className="font-bold text-red-400">{formatCurrency(getBalance(viewCustomer))}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-violet-900/20">
                  <tr>
                    <th className="text-right py-2 px-3 text-gray-400">التاريخ</th>
                    <th className="text-right py-2 px-3 text-gray-400">البيان</th>
                    <th className="text-center py-2 px-3 text-gray-400">مدين</th>
                    <th className="text-center py-2 px-3 text-gray-400">دائن</th>
                    <th className="text-center py-2 px-3 text-gray-400">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {getCustomerInvoices(viewCustomer.id).map(inv => (
                    <tr key={inv.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-gray-400 text-xs">{inv.date}</td>
                      <td className="py-2 px-3 text-white">فاتورة {inv.invoiceNumber}</td>
                      <td className="py-2 px-3 text-center text-red-400">{inv.total.toLocaleString('ar-EG')}</td>
                      <td className="py-2 px-3 text-center text-green-400">{inv.paid.toLocaleString('ar-EG')}</td>
                      <td className="py-2 px-3 text-center text-white">{inv.remaining.toLocaleString('ar-EG')}</td>
                    </tr>
                  ))}
                  {getCustomerInvoices(viewCustomer.id).length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">لا توجد فواتير</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-1">💰 تحصيل دفعة</h3>
            <p className="text-gray-400 text-sm mb-4">{showPayment.name} • الرصيد: {formatCurrency(getBalance(showPayment))}</p>
            <div className="space-y-3">
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="input-dark w-full" placeholder="المبلغ المحصل" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPaymentMethod('cash')} className={`py-2 rounded-xl border text-sm ${paymentMethod === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 كاش</button>
                <button onClick={() => setPaymentMethod('bank')} className={`py-2 rounded-xl border text-sm ${paymentMethod === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 بنك</button>
              </div>
              <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="input-dark w-full" placeholder="ملاحظات" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handlePayment} className="btn-primary flex-1">✅ تأكيد التحصيل</button>
              <button onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">{editCustomer ? '✏️ تعديل عميل' : '➕ إضافة عميل'}</h3>
            <div className="space-y-3">
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="اسم العميل *" />
              <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input-dark w-full" placeholder="رقم الهاتف" />
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input-dark w-full" placeholder="البريد الإلكتروني" />
              <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="input-dark w-full" placeholder="العنوان" />
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Customer['type'] }))} className="input-dark w-full">
                <option value="individual">فرد</option>
                <option value="company">شركة</option>
                <option value="wholesale">تاجر جملة</option>
                <option value="trader">تاجر</option>
              </select>
              <input type="number" value={form.openingBalance} onChange={e => setForm(p => ({ ...p, openingBalance: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" placeholder="الرصيد الافتتاحي" />
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input-dark w-full h-16 resize-none" placeholder="ملاحظات" />
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
