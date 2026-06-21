import React, { useState } from 'react';
import { Supplier, PurchaseInvoice, Payment } from '../types';
import { formatCurrency, generateId, getTodayStr, printElement } from '../utils/helpers';
import { Plus, Search, X, Printer, DollarSign, Eye, Trash2, Edit, FilePlus2 } from 'lucide-react';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Props {
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
  onAddSupplier: (s: Supplier) => void;
  onUpdateSupplier: (s: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onAddPayment: (p: Payment) => void;
  onNavigateToPurchases?: (supplierId: string) => void;
}

export default function Suppliers({ suppliers, purchaseInvoices, payments, onAddSupplier, onUpdateSupplier, onDeleteSupplier, onAddPayment, onNavigateToPurchases }: Props) {
  const [viewMode, setViewMode] = useViewMode('suppliers');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [showPayment, setShowPayment] = useState<Supplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', type: 'supplier' as Supplier['type'], notes: '', openingBalance: 0 });

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search)
  );

  const getSupplierInvoices = (id: string) => purchaseInvoices.filter(i => i.supplierId === id);
  const getSupplierPayments = (id: string) => payments.filter(p => p.type === 'purchase' && p.referenceId === id);

  const getBalance = (s: Supplier) => {
    const totalInv = getSupplierInvoices(s.id).reduce((x, i) => x + i.total, 0) + s.openingBalance;
    const totalPaid = getSupplierInvoices(s.id).reduce((x, i) => x + i.paid, 0);
    return totalInv - totalPaid;
  };

  // كل حركات الحساب مجمّعة ومرتبة بالتاريخ (فواتير + دفعات) مع رصيد جاري - لعرضها بالتفصيل في الشاشة
  const getFullStatementRows = (s: Supplier) => {
    const invs = getSupplierInvoices(s.id);
    const pmts = getSupplierPayments(s.id);
    const rows = [
      ...invs.map(inv => ({ date: inv.date, desc: `فاتورة ${inv.invoiceNumber}`, debit: inv.total, credit: 0 })),
      ...pmts.map(p => ({ date: p.date, desc: `دفعة - ${p.paymentMethod === 'cash' ? 'كاش' : 'بنك'}${p.notes ? ' - ' + p.notes : ''}`, debit: 0, credit: p.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = s.openingBalance;
    return rows.map(r => {
      running += r.debit - r.credit;
      return { ...r, runningBalance: running };
    });
  };

  const openAdd = () => { setEditSupplier(null); setForm({ name: '', phone: '', email: '', address: '', type: 'supplier', notes: '', openingBalance: 0 }); setShowForm(true); };
  const openEdit = (s: Supplier) => { setEditSupplier(s); setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', type: s.type, notes: s.notes || '', openingBalance: s.openingBalance }); setShowForm(true); };

  const handleSave = () => {
    if (!form.name) return;
    if (editSupplier) {
      onUpdateSupplier({ ...editSupplier, ...form });
    } else {
      onAddSupplier({ id: generateId(), ...form, totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString() });
    }
    setShowForm(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    onDeleteSupplier(confirmDelete.id);
    if (viewSupplier?.id === confirmDelete.id) setViewSupplier(null);
    setConfirmDelete(null);
  };

  const handlePayment = () => {
    if (!showPayment || !paymentAmount) return;
    onAddPayment({
      id: generateId(),
      type: 'purchase',
      referenceId: showPayment.id,
      referenceName: showPayment.name,
      amount: parseFloat(paymentAmount),
      paymentMethod,
      direction: 'out',
      date: getTodayStr(),
      notes: paymentNotes,
      createdAt: new Date().toISOString(),
    });
    setPaymentAmount('');
    setPaymentNotes('');
    setShowPayment(null);
  };

  const printStatement = (s: Supplier) => {
    const invs = getSupplierInvoices(s.id);
    const balance = getBalance(s);
    const rows = getFullStatementRows(s).map(t =>
      `<tr><td>${t.date}</td><td>${t.desc}</td><td>${t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td><td>${t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td><td>${t.runningBalance.toLocaleString('ar-EG')}</td></tr>`
    ).join('');

    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>كشف حساب مورد</strong></div><div>${s.name}</div><div>${s.phone || ''}</div><div>حتى تاريخ: ${getTodayStr()}</div></div>
      </div>
      ${s.openingBalance > 0 ? `<p style="margin-bottom:10px;font-size:13px">الرصيد الافتتاحي: ${s.openingBalance.toLocaleString('ar-EG')} ج.م</p>` : ''}
      <table>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals"><table>
        <tr><td>إجمالي الفواتير</td><td>${invs.reduce((x, i) => x + i.total, 0).toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>إجمالي المدفوع</td><td>${invs.reduce((x, i) => x + i.paid, 0).toLocaleString('ar-EG')} ج.م</td></tr>
        <tr class="total-row"><td>الرصيد النهائي (مستحق له)</td><td>${balance.toLocaleString('ar-EG')} ج.م</td></tr>
      </table></div>
    `);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">🚚 الموردون والتجار</h2><p className="text-gray-500 text-sm">{suppliers.length} مورد</p></div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus size={16} /> مورد جديد</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{suppliers.length}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي الموردين</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.total, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المشتريات</div>
        </div>
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(suppliers.reduce((s, sup) => s + Math.max(0, getBalance(sup)), 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المستحق للموردين</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." className="input-dark w-full pr-9" />
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const balance = getBalance(s);
            const invCount = getSupplierInvoices(s.id).length;
            return (
              <div key={s.id} className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 hover:border-violet-700/50 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-900/40 flex items-center justify-center text-lg font-bold text-blue-300">
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.phone || 'لا يوجد هاتف'}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.type === 'supplier' ? 'bg-blue-900/40 text-blue-400' : s.type === 'trader' ? 'bg-orange-900/40 text-orange-400' : 'bg-purple-900/40 text-purple-400'}`}>
                    {s.type === 'supplier' ? 'مورد' : s.type === 'trader' ? 'تاجر' : 'مورد وتاجر'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#252545] rounded-xl p-2 text-center">
                    <div className="text-xs text-gray-500">الفواتير</div>
                    <div className="font-bold text-white">{invCount}</div>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${balance > 0 ? 'bg-red-900/20' : 'bg-green-900/20'}`}>
                    <div className="text-xs text-gray-500">مستحق له</div>
                    <div className={`font-bold text-sm ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setViewSupplier(s)} className="flex-1 py-1.5 text-xs bg-violet-900/20 border border-violet-700/30 rounded-xl text-violet-300 hover:bg-violet-900/40 flex items-center justify-center gap-1"><Eye size={12} /> كشف حساب</button>
                  <button onClick={() => setShowPayment(s)} className="flex-1 py-1.5 text-xs bg-blue-900/20 border border-blue-700/30 rounded-xl text-blue-300 hover:bg-blue-900/40 flex items-center justify-center gap-1"><DollarSign size={12} /> دفع</button>
                  <button onClick={() => openEdit(s)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-violet-400"><Edit size={12} /></button>
                  <button onClick={() => setConfirmDelete(s)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="col-span-full text-center text-gray-500 py-12">لا يوجد موردون</div>}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.map(s => {
            const balance = getBalance(s);
            const invCount = getSupplierInvoices(s.id).length;
            return (
              <div key={s.id} className="bg-[#1a1a35] border border-violet-900/30 rounded-xl px-4 py-3 flex items-center justify-between hover:border-violet-700/50 transition-all flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-300">{s.name.charAt(0)}</div>
                  <div>
                    <div className="font-medium text-white text-sm">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.phone || 'لا يوجد هاتف'} • {s.type === 'supplier' ? 'مورد' : s.type === 'trader' ? 'تاجر' : 'مورد وتاجر'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-center"><div className="text-xs text-gray-500">الفواتير</div><div className="text-sm font-bold text-white">{invCount}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">مستحق له</div><div className={`text-sm font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</div></div>
                  <div className="flex gap-1">
                    <button onClick={() => setViewSupplier(s)} className="p-1.5 rounded-lg text-violet-400 hover:bg-violet-900/20"><Eye size={14} /></button>
                    <button onClick={() => setShowPayment(s)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-900/20"><DollarSign size={14} /></button>
                    <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400"><Edit size={14} /></button>
                    <button onClick={() => setConfirmDelete(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-gray-500 py-12">لا يوجد موردون</div>}
        </div>
      )}

      {/* Compact View */}
      {viewMode === 'compact' && (
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-violet-900/20">
              <tr>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">الاسم</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">النوع</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">الفواتير</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">مستحق له</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const balance = getBalance(s);
                return (
                  <tr key={s.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-white text-sm">{s.name}</div>
                      <div className="text-xs text-gray-500">{s.phone || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-400 text-xs hidden md:table-cell">{s.type === 'supplier' ? 'مورد' : s.type === 'trader' ? 'تاجر' : 'مورد وتاجر'}</td>
                    <td className="py-2.5 px-3 text-center text-white">{getSupplierInvoices(s.id).length}</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setViewSupplier(s)} className="p-1 rounded text-violet-400 hover:bg-violet-900/20"><Eye size={13} /></button>
                        <button onClick={() => setShowPayment(s)} className="p-1 rounded text-blue-400 hover:bg-blue-900/20"><DollarSign size={13} /></button>
                        <button onClick={() => openEdit(s)} className="p-1 rounded text-gray-400 hover:text-violet-400"><Edit size={13} /></button>
                        <button onClick={() => setConfirmDelete(s)} className="p-1 rounded text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-500">لا يوجد موردون</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Supplier Statement Modal - عرض كامل بالشاشة بدون الحاجة للطباعة */}
      {viewSupplier && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-xl font-bold text-white">📊 كشف حساب - {viewSupplier.name}</h2>
              <div className="flex gap-2">
                <button onClick={() => { setViewSupplier(null); onNavigateToPurchases?.(viewSupplier.id); }} className="btn-primary text-sm flex items-center gap-1"><FilePlus2 size={14} /> فاتورة شراء جديدة</button>
                <button onClick={() => setShowPayment(viewSupplier)} className="btn-secondary text-sm flex items-center gap-1"><DollarSign size={14} /> إضافة دفعة</button>
                <button onClick={() => printStatement(viewSupplier)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> طباعة PDF</button>
                <button onClick={() => setViewSupplier(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>

            <div className="bg-[#252545] rounded-xl p-3 mb-4 flex items-center gap-4 flex-wrap text-sm">
              <span className="text-gray-400">📞 {viewSupplier.phone || '-'}</span>
              {viewSupplier.email && <span className="text-gray-400">✉️ {viewSupplier.email}</span>}
              {viewSupplier.address && <span className="text-gray-400">📍 {viewSupplier.address}</span>}
              {viewSupplier.notes && <span className="text-gray-400">📝 {viewSupplier.notes}</span>}
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-[#252545] rounded-xl p-3 text-center"><div className="text-xs text-gray-500">الرصيد الافتتاحي</div><div className="font-bold text-white">{viewSupplier.openingBalance.toLocaleString('ar-EG')}</div></div>
              <div className="bg-[#252545] rounded-xl p-3 text-center"><div className="text-xs text-gray-500">إجمالي الفواتير</div><div className="font-bold text-blue-400">{formatCurrency(getSupplierInvoices(viewSupplier.id).reduce((s, i) => s + i.total, 0))}</div></div>
              <div className="bg-[#252545] rounded-xl p-3 text-center"><div className="text-xs text-gray-500">المدفوع</div><div className="font-bold text-green-400">{formatCurrency(getSupplierInvoices(viewSupplier.id).reduce((s, i) => s + i.paid, 0))}</div></div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center"><div className="text-xs text-gray-500">الرصيد النهائي</div><div className="font-bold text-red-400">{formatCurrency(getBalance(viewSupplier))}</div></div>
            </div>

            {/* حركة الحساب الكاملة بالتفصيل: فواتير + دفعات مرتبة بالتاريخ مع رصيد جاري */}
            <h3 className="text-sm font-bold text-violet-300 mb-2">📜 حركة الحساب بالتفصيل</h3>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-violet-900/20">
                  <tr>
                    <th className="text-right py-2 px-3 text-gray-400">التاريخ</th>
                    <th className="text-right py-2 px-3 text-gray-400">البيان</th>
                    <th className="text-center py-2 px-3 text-gray-400">مدين</th>
                    <th className="text-center py-2 px-3 text-gray-400">دائن</th>
                    <th className="text-center py-2 px-3 text-gray-400">الرصيد الجاري</th>
                  </tr>
                </thead>
                <tbody>
                  {getFullStatementRows(viewSupplier).map((t, idx) => (
                    <tr key={idx} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-gray-400 text-xs">{t.date}</td>
                      <td className="py-2 px-3 text-white">{t.desc}</td>
                      <td className="py-2 px-3 text-center text-red-400">{t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-green-400">{t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-white font-medium">{t.runningBalance.toLocaleString('ar-EG')}</td>
                    </tr>
                  ))}
                  {getFullStatementRows(viewSupplier).length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">لا توجد حركات</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* عرض جميع فواتير الشراء لهذا المورد */}
            <h3 className="text-sm font-bold text-violet-300 mb-2">🧾 جميع فواتير الشراء ({getSupplierInvoices(viewSupplier.id).length})</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {getSupplierInvoices(viewSupplier.id).map(inv => (
                <div key={inv.id} className="bg-[#252545] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-white text-sm font-mono">{inv.invoiceNumber}</div>
                    <div className="text-xs text-gray-500">{inv.date} • {inv.items.length} منتج</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{formatCurrency(inv.total)}</div>
                    {inv.remaining > 0 ? <div className="text-xs text-red-400">متبقي: {formatCurrency(inv.remaining)}</div> : <div className="text-xs text-green-400">✓ مدفوعة بالكامل</div>}
                  </div>
                </div>
              ))}
              {getSupplierInvoices(viewSupplier.id).length === 0 && <div className="text-center text-gray-500 py-8">لا توجد فواتير</div>}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-1">💰 دفع للمورد</h3>
            <p className="text-gray-400 text-sm mb-4">{showPayment.name} • مستحق له: {formatCurrency(getBalance(showPayment))}</p>
            <div className="space-y-3">
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="input-dark w-full" placeholder="المبلغ" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPaymentMethod('cash')} className={`py-2 rounded-xl border text-sm ${paymentMethod === 'cash' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>💵 كاش</button>
                <button onClick={() => setPaymentMethod('bank')} className={`py-2 rounded-xl border text-sm ${paymentMethod === 'bank' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🏦 بنك</button>
              </div>
              <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="input-dark w-full" placeholder="ملاحظات" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handlePayment} className="btn-primary flex-1">✅ تأكيد الدفع</button>
              <button onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">{editSupplier ? '✏️ تعديل مورد' : '➕ إضافة مورد'}</h3>
            <div className="space-y-3">
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="اسم المورد *" />
              <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input-dark w-full" placeholder="رقم الهاتف" />
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input-dark w-full" placeholder="البريد الإلكتروني" />
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Supplier['type'] }))} className="input-dark w-full">
                <option value="supplier">مورد</option>
                <option value="trader">تاجر</option>
                <option value="both">مورد وتاجر</option>
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

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف المورد</h3>
            <p className="text-gray-400 text-sm mb-4">هل أنت متأكد من حذف <span className="text-white font-medium">{confirmDelete.name}</span>؟ لن يتم حذف الفواتير المرتبطة به، لكن لن تتمكن من الرجوع لهذا الإجراء.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">🗑️ تأكيد الحذف</button>
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
