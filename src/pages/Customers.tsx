import React, { useState, useMemo } from 'react';
import { Customer, SaleInvoice, Payment } from '../types';
import { formatCurrency, generateId, getTodayStr, printElement } from '../utils/helpers';
import { Plus, Search, X, Printer, DollarSign, Eye, Trash2, Edit, FilePlus2, Calendar } from 'lucide-react';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

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
  onUpdateSaleInvoice: (inv: SaleInvoice) => void;
  onNavigateToSales?: (customerId: string) => void;
}

export default function Customers({ customers, saleInvoices, payments, onAddCustomer, onUpdateCustomer, onDeleteCustomer, onAddPayment, onUpdateSaleInvoice, onNavigateToSales }: Props) {
  const [viewMode, setViewMode] = useViewMode('customers');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [showPayment, setShowPayment] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayStr());
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', type: 'individual' as Customer['type'], notes: '', openingBalance: 0 });
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null);
  const [editingInvoiceDate, setEditingInvoiceDate] = useState<string | null>(null);
  const [tempInvoiceDate, setTempInvoiceDate] = useState('');
  // فلتر الفترة الزمنية لحركة الحساب
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const handleDelete = () => {
    if (!confirmDelete) return;
    onDeleteCustomer(confirmDelete.id);
    if (viewCustomer?.id === confirmDelete.id) setViewCustomer(null);
    setConfirmDelete(null);
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
      date: paymentDate || getTodayStr(),
      notes: paymentNotes,
      createdAt: new Date().toISOString(),
    });
    setPaymentAmount('');
    setPaymentNotes('');
    setPaymentDate(getTodayStr());
    setShowPayment(null);
  };

  const openPaymentModal = (c: Customer) => {
    setPaymentDate(getTodayStr());
    setShowPayment(c);
  };

  // تعديل تاريخ فاتورة مباشرة من كشف الحساب (مفيد لإغلاق حساب شهر أو تصحيح تاريخ منسي)
  const startEditInvoiceDate = (inv: SaleInvoice) => {
    setEditingInvoiceDate(inv.id);
    setTempInvoiceDate(inv.date);
  };
  const saveInvoiceDate = (inv: SaleInvoice) => {
    if (tempInvoiceDate) onUpdateSaleInvoice({ ...inv, date: tempInvoiceDate });
    setEditingInvoiceDate(null);
  };

  const getCustomerInvoices = (customerId: string) => saleInvoices.filter(inv => inv.customerId === customerId);
  const getCustomerPayments = (customerId: string) => payments.filter(p => p.type === 'sale' && p.referenceId === customerId);

  const getBalance = (c: Customer) => {
    const totalInv = getCustomerInvoices(c.id).reduce((s, i) => s + i.total, 0) + c.openingBalance;
    const totalPaid = getCustomerInvoices(c.id).reduce((s, i) => s + i.paid, 0);
    return totalInv - totalPaid;
  };

  // كل حركات الحساب مجمّعة ومرتبة بالتاريخ (فواتير + دفعات) لعرضها بالتفصيل في الشاشة
  // مع إمكانية فلترة فترة زمنية محددة (من-إلى) لعرض/طباعة جزء من الحساب فقط
  const getFullStatementRows = (c: Customer, filterDates = true) => {
    const invs = getCustomerInvoices(c.id);
    const pmts = getCustomerPayments(c.id);
    const rows = [
      ...invs.map(inv => ({ date: inv.date, desc: `فاتورة ${inv.invoiceNumber}`, debit: inv.total, credit: 0, type: 'invoice' as const, ref: inv })),
      ...pmts.map(p => ({ date: p.date, desc: `دفعة (تحصيل) - ${p.paymentMethod === 'cash' ? 'كاش' : 'بنك'}${p.notes ? ' - ' + p.notes : ''}`, debit: 0, credit: p.amount, type: 'payment' as const, ref: p })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // نحسب الرصيد الجاري على كل الحركات بترتيبها الطبيعي أولًا (حتى لو هنفلتر العرض بعدين)
    let running = c.openingBalance;
    const withRunning = rows.map(r => {
      running += r.debit - r.credit;
      return { ...r, runningBalance: running };
    });

    if (!filterDates || (!dateFrom && !dateTo)) return withRunning;
    return withRunning.filter(r => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo));
  };

  const printStatement = (c: Customer) => {
    const rowsToPrint = getFullStatementRows(c);
    const periodLabel = (dateFrom || dateTo) ? `من ${dateFrom || '...'} إلى ${dateTo || getTodayStr()}` : `حتى تاريخ: ${getTodayStr()}`;
    const periodTotalDebit = rowsToPrint.reduce((s, r) => s + r.debit, 0);
    const periodTotalCredit = rowsToPrint.reduce((s, r) => s + r.credit, 0);
    const openingForPeriod = (dateFrom || dateTo) ? (rowsToPrint[0] ? rowsToPrint[0].runningBalance - rowsToPrint[0].debit + rowsToPrint[0].credit : c.openingBalance) : c.openingBalance;
    const finalBalance = rowsToPrint.length > 0 ? rowsToPrint[rowsToPrint.length - 1].runningBalance : getBalance(c);

    const rows = rowsToPrint.map(t =>
      `<tr><td>${t.date}</td><td>${t.desc}</td><td>${t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td><td>${t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td><td>${t.runningBalance.toLocaleString('ar-EG')}</td></tr>`
    ).join('');

    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>كشف حساب عميل</strong></div><div>${c.name}</div><div>${c.phone || ''}</div><div>${periodLabel}</div></div>
      </div>
      ${(dateFrom || dateTo) ? `<p style="margin-bottom:10px;font-size:13px">الرصيد قبل الفترة المحددة: ${openingForPeriod.toLocaleString('ar-EG')} ج.م</p>` : (c.openingBalance > 0 ? `<p style="margin-bottom:10px;font-size:13px">الرصيد الافتتاحي: ${c.openingBalance.toLocaleString('ar-EG')} ج.م</p>` : '')}
      <table>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals"><table>
        <tr><td>إجمالي حركة المدين في الفترة</td><td>${periodTotalDebit.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>إجمالي حركة الدائن في الفترة</td><td>${periodTotalCredit.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr class="total-row"><td>الرصيد ${(dateFrom || dateTo) ? 'في نهاية الفترة' : 'النهائي (مستحق منه)'}</td><td>${finalBalance.toLocaleString('ar-EG')} ج.م</td></tr>
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
                    {c.type === 'individual' ? 'فرد' : c.type === 'company' ? 'شركة' : c.type === 'wholesale' ? 'جملة' : 'تاجر'}
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
                  <button onClick={() => { setViewCustomer(c); setDateFrom(''); setDateTo(''); }} className="flex-1 py-1.5 text-xs bg-violet-900/20 border border-violet-700/30 rounded-xl text-violet-300 hover:bg-violet-900/40 flex items-center justify-center gap-1"><Eye size={12} /> كشف حساب</button>
                  <button onClick={() => openPaymentModal(c)} className="flex-1 py-1.5 text-xs bg-green-900/20 border border-green-700/30 rounded-xl text-green-300 hover:bg-green-900/40 flex items-center justify-center gap-1"><DollarSign size={12} /> تحصيل</button>
                  <button onClick={() => openEdit(c)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-violet-400"><Edit size={12} /></button>
                  <button onClick={() => setConfirmDelete(c)} className="py-1.5 px-2 text-xs bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="col-span-full text-center text-gray-500 py-12">لا يوجد عملاء</div>}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.map(c => {
            const balance = getBalance(c);
            const invCount = getCustomerInvoices(c.id).length;
            return (
              <div key={c.id} className="bg-[#1a1a35] border border-violet-900/30 rounded-xl px-4 py-3 flex items-center justify-between hover:border-violet-700/50 transition-all flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-900/40 flex items-center justify-center text-sm font-bold text-violet-300">{c.name.charAt(0)}</div>
                  <div>
                    <div className="font-medium text-white text-sm">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.phone || 'لا يوجد هاتف'} • {c.type === 'individual' ? 'فرد' : c.type === 'company' ? 'شركة' : c.type === 'wholesale' ? 'جملة' : 'تاجر'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-center"><div className="text-xs text-gray-500">الفواتير</div><div className="text-sm font-bold text-white">{invCount}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">الرصيد</div><div className={`text-sm font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</div></div>
                  <div className="flex gap-1">
                    <button onClick={() => { setViewCustomer(c); setDateFrom(''); setDateTo(''); }} className="p-1.5 rounded-lg text-violet-400 hover:bg-violet-900/20"><Eye size={14} /></button>
                    <button onClick={() => openPaymentModal(c)} className="p-1.5 rounded-lg text-green-400 hover:bg-green-900/20"><DollarSign size={14} /></button>
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400"><Edit size={14} /></button>
                    <button onClick={() => setConfirmDelete(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-gray-500 py-12">لا يوجد عملاء</div>}
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
                <th className="text-center py-3 px-3 text-gray-400 font-medium">الرصيد</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const balance = getBalance(c);
                return (
                  <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-white text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.phone || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-400 text-xs hidden md:table-cell">{c.type === 'individual' ? 'فرد' : c.type === 'company' ? 'شركة' : c.type === 'wholesale' ? 'جملة' : 'تاجر'}</td>
                    <td className="py-2.5 px-3 text-center text-white">{getCustomerInvoices(c.id).length}</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>{balance.toLocaleString('ar-EG')}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setViewCustomer(c); setDateFrom(''); setDateTo(''); }} className="p-1 rounded text-violet-400 hover:bg-violet-900/20"><Eye size={13} /></button>
                        <button onClick={() => openPaymentModal(c)} className="p-1 rounded text-green-400 hover:bg-green-900/20"><DollarSign size={13} /></button>
                        <button onClick={() => openEdit(c)} className="p-1 rounded text-gray-400 hover:text-violet-400"><Edit size={13} /></button>
                        <button onClick={() => setConfirmDelete(c)} className="p-1 rounded text-gray-400 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-500">لا يوجد عملاء</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Statement Modal - عرض كامل بالشاشة */}
      {viewCustomer && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-xl font-bold text-white">📊 كشف حساب - {viewCustomer.name}</h2>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setViewCustomer(null); onNavigateToSales?.(viewCustomer.id); }} className="btn-primary text-sm flex items-center gap-1"><FilePlus2 size={14} /> فاتورة جديدة</button>
                <button onClick={() => openPaymentModal(viewCustomer)} className="btn-secondary text-sm flex items-center gap-1"><DollarSign size={14} /> تحصيل دفعة</button>
                <button onClick={() => printStatement(viewCustomer)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> طباعة PDF</button>
                <button onClick={() => setViewCustomer(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>

            {/* بيانات أساسية */}
            <div className="bg-[#252545] rounded-xl p-3 mb-4 flex items-center gap-4 flex-wrap text-sm">
              <span className="text-gray-400">📞 {viewCustomer.phone || '-'}</span>
              {viewCustomer.email && <span className="text-gray-400">✉️ {viewCustomer.email}</span>}
              {viewCustomer.address && <span className="text-gray-400">📍 {viewCustomer.address}</span>}
              {viewCustomer.notes && <span className="text-gray-400">📝 {viewCustomer.notes}</span>}
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

            {/* فلتر فترة زمنية لحركة الحساب - مفيد لو حابب تطبع/تعرض جزء معين من الحساب بس */}
            <div className="bg-[#252545] rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-violet-300 text-sm font-medium"><Calendar size={14} /> فترة محددة:</div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-dark text-sm" placeholder="من تاريخ" />
              <span className="text-gray-500 text-sm">إلى</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-dark text-sm" placeholder="إلى تاريخ" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-red-400 hover:underline">إلغاء الفلتر (عرض الكل)</button>
              )}
              <span className="text-xs text-gray-500 mr-auto">سيتم تطبيق هذه الفترة على العرض والطباعة معًا</span>
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
                  {getFullStatementRows(viewCustomer).map((t, idx) => (
                    <tr key={idx} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-gray-400 text-xs">
                        {t.type === 'invoice' && editingInvoiceDate === (t.ref as SaleInvoice).id ? (
                          <div className="flex items-center gap-1">
                            <input type="date" value={tempInvoiceDate} onChange={e => setTempInvoiceDate(e.target.value)} className="input-dark text-xs py-0.5 px-1 w-32" autoFocus />
                            <button onClick={() => saveInvoiceDate(t.ref as SaleInvoice)} className="text-green-400 text-xs">✔</button>
                            <button onClick={() => setEditingInvoiceDate(null)} className="text-red-400 text-xs">✕</button>
                          </div>
                        ) : (
                          <span className={t.type === 'invoice' ? 'cursor-pointer hover:text-violet-300 hover:underline' : ''} onClick={() => t.type === 'invoice' && startEditInvoiceDate(t.ref as SaleInvoice)} title={t.type === 'invoice' ? 'اضغط لتعديل تاريخ الفاتورة' : ''}>
                            {t.date} {t.type === 'invoice' && '✎'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-white">
                        {t.type === 'invoice' ? (
                          <button onClick={() => setViewInvoice(t.ref as SaleInvoice)} className="text-violet-300 hover:underline text-right">{t.desc}</button>
                        ) : t.desc}
                      </td>
                      <td className="py-2 px-3 text-center text-red-400">{t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-green-400">{t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-white font-medium">{t.runningBalance.toLocaleString('ar-EG')}</td>
                    </tr>
                  ))}
                  {getFullStatementRows(viewCustomer).length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">لا توجد حركات {(dateFrom || dateTo) ? 'في هذه الفترة' : ''}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* عرض جميع فواتير المبيعات لهذا العميل - يمكن الضغط على كل فاتورة لعرض تفاصيلها كاملة */}
            <h3 className="text-sm font-bold text-violet-300 mb-2">🧾 جميع فواتير المبيعات ({getCustomerInvoices(viewCustomer.id).length})</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {getCustomerInvoices(viewCustomer.id).map(inv => (
                <button key={inv.id} onClick={() => setViewInvoice(inv)} className="w-full text-right bg-[#252545] hover:bg-[#2d2d5a] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 transition-colors">
                  <div>
                    <div className="font-medium text-white text-sm font-mono">{inv.invoiceNumber}</div>
                    <div className="text-xs text-gray-500">{inv.date} • {inv.items.length} منتج</div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <div className="font-bold text-white">{formatCurrency(inv.total)}</div>
                      {inv.remaining > 0 ? <div className="text-xs text-red-400">متبقي: {formatCurrency(inv.remaining)}</div> : <div className="text-xs text-green-400">✓ مدفوعة بالكامل</div>}
                    </div>
                    <Eye size={14} className="text-violet-400" />
                  </div>
                </button>
              ))}
              {getCustomerInvoices(viewCustomer.id).length === 0 && <div className="text-center text-gray-500 py-8">لا توجد فواتير</div>}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal - عرض تفاصيل الفاتورة كاملة بدل النص فقط */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📄 فاتورة {viewInvoice.invoiceNumber}</h2>
              <button onClick={() => setViewInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
              <div><div className="text-xs text-gray-500">العميل</div><div className="font-bold text-white">{viewInvoice.customerName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
              <div><div className="text-xs text-gray-500">طريقة الدفع</div><div className="font-bold text-white">{viewInvoice.paymentMethod === 'cash' ? 'كاش' : viewInvoice.paymentMethod === 'bank' ? 'بنك' : 'انستاباي'}</div></div>
            </div>
            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
              {viewInvoice.items.map(item => (
                <div key={item.id} className="bg-[#252545] rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">{item.productName}</div>
                    <div className="text-xs text-gray-500">{item.sku} • الكمية: {item.quantity} × {formatCurrency(item.unitPrice)}</div>
                    {item.serials && item.serials.length > 0 && (
                      <div className="text-xs text-gray-500 font-mono">{item.serials.map(s => s.serial).join(', ')}</div>
                    )}
                  </div>
                  <div className="font-bold text-white">{formatCurrency(item.total)}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-white/10 pt-3">
              <div className="flex justify-between text-sm"><span className="text-gray-400">المجموع</span><span className="text-white">{formatCurrency(viewInvoice.subtotal)}</span></div>
              {viewInvoice.discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">الخصم</span><span className="text-red-400">- {formatCurrency(viewInvoice.discount)}</span></div>}
              <div className="flex justify-between font-bold"><span className="text-white">الإجمالي</span><span className="text-violet-400 text-lg">{formatCurrency(viewInvoice.total)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">المدفوع</span><span className="text-green-400">{formatCurrency(viewInvoice.paid)}</span></div>
              {viewInvoice.remaining > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">المتبقي</span><span className="text-red-400">{formatCurrency(viewInvoice.remaining)}</span></div>}
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
              <div>
                <label className="form-label">تاريخ الدفعة</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-dark w-full" />
                <p className="text-xs text-gray-500 mt-1">يمكنك تغيير التاريخ لو الدفعة متأخرة أو منسية من شهر سابق</p>
              </div>
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

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف العميل</h3>
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
