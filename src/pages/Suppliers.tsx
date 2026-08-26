import React, { useState, useRef } from 'react';
import { Supplier, PurchaseInvoice, Payment } from '../types';
import { formatCurrency, generateId, getTodayStr, printElement } from '../utils/helpers';
import { calculateSupplierBalance } from '../store/domains/accounting.store';
import { Plus, Search, X, Printer, DollarSign, Eye, Trash2, Edit, FilePlus2, Calendar, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

interface Props {
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
  onAddSupplier: (s: Supplier) => { success: boolean; message?: string } | void;
  onUpdateSupplier: (s: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onAddPayment: (p: Payment) => void;
  onUpdatePurchaseInvoice: (inv: PurchaseInvoice) => void;
  onNavigateToPurchases?: (supplierId: string) => void;
  // ✅ لفتح كشف حساب مورد/تاجر معيّن مباشرة (مثلاً من دفتر الديون في الرئيسية)
  preselectedStatementSupplierId?: string | null;
  onPreselectedStatementHandled?: () => void;
}

export default function Suppliers({ suppliers, purchaseInvoices, payments, onAddSupplier, onUpdateSupplier, onDeleteSupplier, onAddPayment, onUpdatePurchaseInvoice, onNavigateToPurchases, preselectedStatementSupplierId, onPreselectedStatementHandled }: Props) {
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
  const [paymentDate, setPaymentDate] = useState(getTodayStr());
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', type: 'supplier' as Supplier['type'], notes: '', openingBalance: 0 });
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoiceDate, setEditingInvoiceDate] = useState<string | null>(null);
  const [tempInvoiceDate, setTempInvoiceDate] = useState('');
  // فلتر الفترة الزمنية لحركة الحساب
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [importingSuppliers, setImportingSuppliers] = useState(false);
  const [importSummary, setImportSummary] = useState<{added:number; skipped:number; errors:string[]} | null>(null);
  const supplierImportRef = useRef<HTMLInputElement | null>(null);

  // ✅ فتح كشف حساب مورد/تاجر تلقائيًا لو جاي طلب من صفحة تانية (زي دفتر الديون بالرئيسية)
  React.useEffect(() => {
    if (preselectedStatementSupplierId) {
      const s = suppliers.find(x => x.id === preselectedStatementSupplierId);
      if (s) {
        setViewSupplier(s);
        setDateFrom('');
        setDateTo('');
      }
      onPreselectedStatementHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedStatementSupplierId]);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search)
  );

  const getSupplierInvoices = (id: string) => purchaseInvoices.filter(i => i.supplierId === id);
  const getSupplierPayments = (id: string) => payments.filter(p => p.type === 'purchase' && p.referenceId === id);

  const getBalance = (s: Supplier) => calculateSupplierBalance(purchaseInvoices, s);

  // ✅ لو الرصيد موجب: لسه إحنا مديونين للمورد (متبقي له عندنا)
  // ✅ لو الرصيد سالب: يبقى دفعنا له أكتر من المستحق (متبقي عليه هو - فرق حساب لصالحنا)
  const balanceLabel = (balance: number): { text: string; amount: number; colorClass: string; bgClass: string } => {
    if (balance > 0) return { text: 'متبقي له', amount: balance, colorClass: 'text-red-400', bgClass: 'bg-red-900/20' };
    if (balance < 0) return { text: 'متبقي عليه (فرق حساب)', amount: Math.abs(balance), colorClass: 'text-green-400', bgClass: 'bg-green-900/20' };
    return { text: 'متطابق', amount: 0, colorClass: 'text-gray-400', bgClass: 'bg-white/5' };
  };

  // كل حركات الحساب مجمّعة ومرتبة بالتاريخ (فواتير + دفعات) مع رصيد جاري
  // مع إمكانية فلترة فترة زمنية محددة (من-إلى) لعرض/طباعة جزء من الحساب فقط
  const getFullStatementRows = (s: Supplier) => {
    const invs = getSupplierInvoices(s.id);
    const pmts = getSupplierPayments(s.id);
    const rows = [
      ...invs.map(inv => ({ date: inv.date, desc: `فاتورة ${inv.invoiceNumber}`, debit: inv.total, credit: 0, type: 'invoice' as const, ref: inv })),
      ...pmts.map(p => ({ date: p.date, desc: `دفعة - ${p.paymentMethod === 'cash' ? 'كاش' : 'بنك'}${p.notes ? ' - ' + p.notes : ''}`, debit: 0, credit: p.amount, type: 'payment' as const, ref: p })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let running = s.openingBalance;
    const withRunning = rows.map(r => {
      running += r.debit - r.credit;
      return { ...r, runningBalance: running };
    });
    if (!dateFrom && !dateTo) return withRunning;
    return withRunning.filter(r => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo));
  };

  const downloadSupplierTemplate = () => {
    const rows = [{
      'اسم المورد / التاجر *': 'ABC Trading',
      'الهاتف': '01000000000',
      'البريد الإلكتروني': '',
      'العنوان': '',
      'النوع': 'supplier',
      'الرصيد الافتتاحي': 0,
      'ملاحظات': '',
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [28, 18, 28, 30, 14, 18, 30].map(w => ({ width: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    XLSX.writeFile(wb, 'suppliers_import_template.xlsx');
  };

  const handleImportSuppliers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingSuppliers(true); setImportSummary(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      let added = 0, skipped = 0; const errors: string[] = [];
      const existingNames = new Set(suppliers.map(s => s.name.trim().toLowerCase()));
      const get = (row: Record<string, any>, keys: string[]) => {
        const key = Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));
        return key ? row[key] : '';
      };
      const typeMap: Record<string, Supplier['type']> = {
        supplier: 'supplier', 'مورد': 'supplier', 'suppliers': 'supplier',
        trader: 'trader', 'تاجر': 'trader',
        both: 'both', 'كلاهما': 'both', 'مورد وتاجر': 'both',
      };
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(get(row, ['اسم المورد / التاجر *','اسم المورد / التاجر','اسم المورد','supplier name','name']) || '').trim();
        if (!name) { errors.push(`السطر ${i + 2}: اسم المورد/التاجر فارغ`); skipped++; continue; }
        if (existingNames.has(name.toLowerCase())) { errors.push(`السطر ${i + 2}: الاسم موجود بالفعل (${name})`); skipped++; continue; }
        const typeRaw = String(get(row, ['النوع','type']) || 'supplier').trim().toLowerCase();
        const now = new Date().toISOString();
        const result = onAddSupplier({
          id: generateId(),
          name,
          phone: String(get(row, ['الهاتف','phone','mobile']) || '').trim(),
          email: String(get(row, ['البريد الإلكتروني','email']) || '').trim(),
          address: String(get(row, ['العنوان','address']) || '').trim(),
          type: typeMap[typeRaw] || 'supplier',
          openingBalance: Number(get(row, ['الرصيد الافتتاحي','opening balance','openingbalance']) || 0) || 0,
          totalInvoices: 0,
          totalPaid: 0,
          notes: String(get(row, ['ملاحظات','notes']) || '').trim(),
          createdAt: now,
        });
        if (result && result.success === false) { errors.push(`السطر ${i + 2}: ${result.message || 'تعذر إضافة المورد'}`); skipped++; continue; }
        existingNames.add(name.toLowerCase()); added++;
      }
      setImportSummary({ added, skipped, errors: errors.slice(0, 100) });
    } catch { setImportSummary({ added: 0, skipped: 0, errors: ['ملف Excel غير صالح أو لا يمكن قراءته.'] }); }
    finally { setImportingSuppliers(false); }
  };

  const openAdd = () => { setEditSupplier(null); setForm({ name: '', phone: '', email: '', address: '', type: 'supplier', notes: '', openingBalance: 0 }); setDuplicateError(null); setShowForm(true); };
  const openEdit = (s: Supplier) => { setEditSupplier(s); setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', type: s.type, notes: s.notes || '', openingBalance: s.openingBalance }); setShowForm(true); };

  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const handleSave = () => {
    if (!form.name) return;
    if (editSupplier) {
      onUpdateSupplier({ ...editSupplier, ...form });
      setShowForm(false);
    } else {
      const result = onAddSupplier({ id: generateId(), ...form, totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString() });
      if (result && result.success === false) {
        setDuplicateError(result.message || 'هذا المورد موجود بالفعل');
        return;
      }
      setShowForm(false);
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    onDeleteSupplier(confirmDelete.id);
    if (viewSupplier?.id === confirmDelete.id) setViewSupplier(null);
    setConfirmDelete(null);
  };

  const openPaymentModal = (s: Supplier) => {
    setPaymentDate(getTodayStr());
    setShowPayment(s);
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
      date: paymentDate || getTodayStr(),
      notes: paymentNotes,
      createdAt: new Date().toISOString(),
    });
    setPaymentAmount('');
    setPaymentNotes('');
    setPaymentDate(getTodayStr());
    setShowPayment(null);
  };

  // تعديل تاريخ فاتورة شراء مباشرة من كشف الحساب
  const startEditInvoiceDate = (inv: PurchaseInvoice) => {
    setEditingInvoiceDate(inv.id);
    setTempInvoiceDate(inv.date);
  };
  const saveInvoiceDate = (inv: PurchaseInvoice) => {
    if (tempInvoiceDate) onUpdatePurchaseInvoice({ ...inv, date: tempInvoiceDate });
    setEditingInvoiceDate(null);
  };

  const printStatement = (s: Supplier) => {
    const rowsToPrint = getFullStatementRows(s);
    const periodLabel = (dateFrom || dateTo) ? `من ${dateFrom || '...'} إلى ${dateTo || getTodayStr()}` : `حتى تاريخ: ${getTodayStr()}`;
    const periodTotalDebit = rowsToPrint.reduce((x, r) => x + r.debit, 0);
    const periodTotalCredit = rowsToPrint.reduce((x, r) => x + r.credit, 0);
    const openingForPeriod = (dateFrom || dateTo) ? (rowsToPrint[0] ? rowsToPrint[0].runningBalance - rowsToPrint[0].debit + rowsToPrint[0].credit : s.openingBalance) : s.openingBalance;
    const finalBalance = rowsToPrint.length > 0 ? rowsToPrint[rowsToPrint.length - 1].runningBalance : getBalance(s);
    const finalLabel = (dateFrom || dateTo)
      ? 'الرصيد في نهاية الفترة'
      : finalBalance > 0 ? 'الرصيد النهائي (متبقي له)' : finalBalance < 0 ? 'الرصيد النهائي (متبقي عليه - فرق حساب)' : 'الرصيد النهائي (متطابق)';
    const finalDisplayAmount = (dateFrom || dateTo) ? finalBalance : Math.abs(finalBalance);

    const rows = rowsToPrint.map(t =>
      `<tr><td>${t.date}</td><td>${t.desc}</td><td>${t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td><td>${t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td><td>${t.runningBalance.toLocaleString('ar-EG')}</td></tr>`
    ).join('');

    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>كشف حساب مورد</strong></div><div>${s.name}</div><div>${s.phone || ''}</div><div>${periodLabel}</div></div>
      </div>
      ${(dateFrom || dateTo) ? `<p style="margin-bottom:10px;font-size:13px">الرصيد قبل الفترة المحددة: ${openingForPeriod.toLocaleString('ar-EG')} ج.م</p>` : (s.openingBalance > 0 ? `<p style="margin-bottom:10px;font-size:13px">الرصيد الافتتاحي: ${s.openingBalance.toLocaleString('ar-EG')} ج.م</p>` : '')}
      <table>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals"><table>
        <tr><td>إجمالي حركة المدين في الفترة</td><td>${periodTotalDebit.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>إجمالي حركة الدائن في الفترة</td><td>${periodTotalCredit.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr class="total-row"><td>${finalLabel}</td><td>${finalDisplayAmount.toLocaleString('ar-EG')} ج.م</td></tr>
      </table></div>
    `);
  };

  // ✅ طباعة فاتورة شراء منفردة (من كشف الحساب أو من قائمة الفواتير)
  const printPurchaseInvoice = (inv: PurchaseInvoice) => {
    const rows = inv.items.map(item => `
      <tr>
        <td>${item.productName}${item.serials && item.serials.length ? `<br/><span style="font-size:11px;color:#666">${item.serials.map(s => s.serial).join(', ')}</span>` : ''}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${item.unitPrice.toLocaleString('ar-EG')}</td>
        <td style="text-align:center">${item.total.toLocaleString('ar-EG')}</td>
      </tr>
    `).join('');
    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info">
          <div><strong>فاتورة مشتريات ${inv.invoiceNumber}</strong></div>
          <div>${inv.supplierName}</div>
          <div>${inv.date}</div>
          <div>طريقة الدفع: ${inv.paymentMethod === 'cash' ? 'كاش' : inv.paymentMethod === 'bank' ? 'بنك' : inv.paymentMethod}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals"><table>
        <tr><td>المجموع</td><td>${inv.subtotal.toLocaleString('ar-EG')} ج.م</td></tr>
        ${inv.discount > 0 ? `<tr><td>الخصم</td><td>${inv.discount.toLocaleString('ar-EG')} ج.م</td></tr>` : ''}
        <tr class="total-row"><td>الإجمالي</td><td>${inv.total.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>المدفوع</td><td>${inv.paid.toLocaleString('ar-EG')} ج.م</td></tr>
        ${inv.remaining > 0 ? `<tr><td>المتبقي</td><td>${inv.remaining.toLocaleString('ar-EG')} ج.م</td></tr>` : ''}
      </table></div>
    `, `فاتورة ${inv.invoiceNumber}`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-white">🚚 الموردون والتجار</h2><p className="text-gray-500 text-sm">{suppliers.length} مورد / تاجر</p></div>
        <div className="flex items-center gap-2">
          <button onClick={downloadSupplierTemplate} className="btn-secondary text-sm flex items-center gap-2"><Download size={14} /> نموذج Excel</button>
          <button onClick={() => supplierImportRef.current?.click()} disabled={importingSuppliers} className="btn-secondary text-sm flex items-center gap-2"><Upload size={14} /> {importingSuppliers ? 'جاري الاستيراد...' : 'استيراد Excel'}</button>
          <input ref={supplierImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportSuppliers} />
          <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus size={16} /> مورد جديد</button>
        </div>
      </div>
      {importSummary && (
        <div className="bg-elevated border border-violet-700/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-violet-300">نتيجة استيراد الموردين</h3><button onClick={() => setImportSummary(null)} className="text-gray-500 hover:text-white">×</button></div>
          <div className="text-sm text-gray-300">تمت إضافة <b className="text-green-400">{importSummary.added}</b> سجل، وتم تخطي <b className="text-yellow-400">{importSummary.skipped}</b>.</div>
          {importSummary.errors.length > 0 && <div className="mt-2 text-xs text-red-300 space-y-1 max-h-40 overflow-auto">{importSummary.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-elevated border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{suppliers.length}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي الموردين</div>
        </div>
        <div className="bg-elevated border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.total, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المشتريات</div>
        </div>
        <div className="bg-elevated border border-red-700/30 rounded-xl p-4 text-center">
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
              <div key={s.id} className="bg-elevated border border-violet-900/30 rounded-2xl p-4 hover:border-violet-700/50 transition-all">
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
                  <div className="bg-muted-bg rounded-xl p-2 text-center">
                    <div className="text-xs text-gray-500">الفواتير</div>
                    <div className="font-bold text-white">{invCount}</div>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${balanceLabel(balance).bgClass}`}>
                    <div className="text-xs text-gray-500">{balanceLabel(balance).text}</div>
                    <div className={`font-bold text-sm ${balanceLabel(balance).colorClass}`}>{balanceLabel(balance).amount.toLocaleString('ar-EG')}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setViewSupplier(s); setDateFrom(''); setDateTo(''); }} className="flex-1 py-1.5 text-xs bg-violet-900/20 border border-violet-700/30 rounded-xl text-violet-300 hover:bg-violet-900/40 flex items-center justify-center gap-1"><Eye size={12} /> كشف حساب</button>
                  <button onClick={() => openPaymentModal(s)} className="flex-1 py-1.5 text-xs bg-blue-900/20 border border-blue-700/30 rounded-xl text-blue-300 hover:bg-blue-900/40 flex items-center justify-center gap-1"><DollarSign size={12} /> دفع</button>
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
              <div key={s.id} className="bg-elevated border border-violet-900/30 rounded-xl px-4 py-3 flex items-center justify-between hover:border-violet-700/50 transition-all flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-900/40 flex items-center justify-center text-sm font-bold text-blue-300">{s.name.charAt(0)}</div>
                  <div>
                    <div className="font-medium text-white text-sm">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.phone || 'لا يوجد هاتف'} • {s.type === 'supplier' ? 'مورد' : s.type === 'trader' ? 'تاجر' : 'مورد وتاجر'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-center"><div className="text-xs text-gray-500">الفواتير</div><div className="text-sm font-bold text-white">{invCount}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">{balanceLabel(balance).text}</div><div className={`text-sm font-bold ${balanceLabel(balance).colorClass}`}>{balanceLabel(balance).amount.toLocaleString('ar-EG')}</div></div>
                  <div className="flex gap-1">
                    <button onClick={() => { setViewSupplier(s); setDateFrom(''); setDateTo(''); }} className="p-1.5 rounded-lg text-violet-400 hover:bg-violet-900/20"><Eye size={14} /></button>
                    <button onClick={() => openPaymentModal(s)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-900/20"><DollarSign size={14} /></button>
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
        <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-hidden">
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
                    <td className={`py-2.5 px-3 text-center font-bold ${balanceLabel(balance).colorClass}`}>{balanceLabel(balance).amount.toLocaleString('ar-EG')}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setViewSupplier(s); setDateFrom(''); setDateTo(''); }} className="p-1 rounded text-violet-400 hover:bg-violet-900/20"><Eye size={13} /></button>
                        <button onClick={() => openPaymentModal(s)} className="p-1 rounded text-blue-400 hover:bg-blue-900/20"><DollarSign size={13} /></button>
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
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-xl font-bold text-white">📊 كشف حساب - {viewSupplier.name}</h2>
              <div className="flex gap-2">
                <button onClick={() => { setViewSupplier(null); onNavigateToPurchases?.(viewSupplier.id); }} className="btn-primary text-sm flex items-center gap-1"><FilePlus2 size={14} /> فاتورة شراء جديدة</button>
                <button onClick={() => openPaymentModal(viewSupplier)} className="btn-secondary text-sm flex items-center gap-1"><DollarSign size={14} /> إضافة دفعة</button>
                <button onClick={() => printStatement(viewSupplier)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> طباعة PDF</button>
                <button onClick={() => setViewSupplier(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>

            <div className="bg-muted-bg rounded-xl p-3 mb-4 flex items-center gap-4 flex-wrap text-sm">
              <span className="text-gray-400">📞 {viewSupplier.phone || '-'}</span>
              {viewSupplier.email && <span className="text-gray-400">✉️ {viewSupplier.email}</span>}
              {viewSupplier.address && <span className="text-gray-400">📍 {viewSupplier.address}</span>}
              {viewSupplier.notes && <span className="text-gray-400">📝 {viewSupplier.notes}</span>}
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-muted-bg rounded-xl p-3 text-center"><div className="text-xs text-gray-500">الرصيد الافتتاحي</div><div className="font-bold text-white">{viewSupplier.openingBalance.toLocaleString('ar-EG')}</div></div>
              <div className="bg-muted-bg rounded-xl p-3 text-center"><div className="text-xs text-gray-500">إجمالي الفواتير</div><div className="font-bold text-blue-400">{formatCurrency(getSupplierInvoices(viewSupplier.id).reduce((s, i) => s + i.total, 0))}</div></div>
              <div className="bg-muted-bg rounded-xl p-3 text-center"><div className="text-xs text-gray-500">المدفوع</div><div className="font-bold text-green-400">{formatCurrency(getSupplierInvoices(viewSupplier.id).reduce((s, i) => s + i.paid, 0))}</div></div>
              <div className={`${balanceLabel(getBalance(viewSupplier)).bgClass} border ${getBalance(viewSupplier) > 0 ? 'border-red-700/30' : 'border-green-700/30'} rounded-xl p-3 text-center`}><div className="text-xs text-gray-500">{balanceLabel(getBalance(viewSupplier)).text}</div><div className={`font-bold ${balanceLabel(getBalance(viewSupplier)).colorClass}`}>{formatCurrency(balanceLabel(getBalance(viewSupplier)).amount)}</div></div>
            </div>

            {/* فلتر فترة زمنية لحركة الحساب */}
            <div className="bg-muted-bg rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
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
                  {getFullStatementRows(viewSupplier).map((t, idx) => (
                    <tr key={idx} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-gray-400 text-xs">
                        {t.type === 'invoice' && editingInvoiceDate === (t.ref as PurchaseInvoice).id ? (
                          <div className="flex items-center gap-1">
                            <input type="date" value={tempInvoiceDate} onChange={e => setTempInvoiceDate(e.target.value)} className="input-dark text-xs py-0.5 px-1 w-32" autoFocus />
                            <button onClick={() => saveInvoiceDate(t.ref as PurchaseInvoice)} className="text-green-400 text-xs">✔</button>
                            <button onClick={() => setEditingInvoiceDate(null)} className="text-red-400 text-xs">✕</button>
                          </div>
                        ) : (
                          <span className={t.type === 'invoice' ? 'cursor-pointer hover:text-violet-300 hover:underline' : ''} onClick={() => t.type === 'invoice' && startEditInvoiceDate(t.ref as PurchaseInvoice)} title={t.type === 'invoice' ? 'اضغط لتعديل تاريخ الفاتورة' : ''}>
                            {t.date} {t.type === 'invoice' && '✎'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-white">
                        {t.type === 'invoice' ? (
                          <button onClick={() => setViewInvoice(t.ref as PurchaseInvoice)} className="text-violet-300 hover:underline text-right">{t.desc}</button>
                        ) : t.desc}
                      </td>
                      <td className="py-2 px-3 text-center text-red-400">{t.debit > 0 ? t.debit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-green-400">{t.credit > 0 ? t.credit.toLocaleString('ar-EG') : '-'}</td>
                      <td className="py-2 px-3 text-center text-white font-medium">{t.runningBalance.toLocaleString('ar-EG')}</td>
                    </tr>
                  ))}
                  {getFullStatementRows(viewSupplier).length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">لا توجد حركات {(dateFrom || dateTo) ? 'في هذه الفترة' : ''}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* عرض جميع فواتير الشراء لهذا المورد - يمكن الضغط على كل فاتورة لعرض تفاصيلها كاملة */}
            <h3 className="text-sm font-bold text-violet-300 mb-2">🧾 جميع فواتير الشراء ({getSupplierInvoices(viewSupplier.id).length})</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {getSupplierInvoices(viewSupplier.id).map(inv => (
                <button key={inv.id} onClick={() => setViewInvoice(inv)} className="w-full text-right bg-muted-bg hover:bg-[#2d2d5a] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 transition-colors">
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
              {getSupplierInvoices(viewSupplier.id).length === 0 && <div className="text-center text-gray-500 py-8">لا توجد فواتير</div>}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal - عرض تفاصيل فاتورة الشراء كاملة بدل النص فقط */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📄 فاتورة {viewInvoice.invoiceNumber}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => printPurchaseInvoice(viewInvoice)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> طباعة</button>
                <button onClick={() => setViewInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
              <div><div className="text-xs text-gray-500">المورد</div><div className="font-bold text-white">{viewInvoice.supplierName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
              <div><div className="text-xs text-gray-500">طريقة الدفع</div><div className="font-bold text-white">{viewInvoice.paymentMethod === 'cash' ? 'كاش' : viewInvoice.paymentMethod === 'bank' ? 'بنك' : 'انستاباي'}</div></div>
            </div>
            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
              {viewInvoice.items.map(item => (
                <div key={item.id} className="bg-muted-bg rounded-xl p-3 flex items-center justify-between">
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
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-1">💰 دفع للمورد</h3>
            <p className="text-gray-400 text-sm mb-4">{showPayment.name} • {balanceLabel(getBalance(showPayment)).text}: {formatCurrency(balanceLabel(getBalance(showPayment)).amount)}</p>
            <div className="space-y-3">
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="input-dark w-full" placeholder="المبلغ" />
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
              <button onClick={handlePayment} className="btn-primary flex-1">✅ تأكيد الدفع</button>
              <button onClick={() => setShowPayment(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
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
            {duplicateError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {duplicateError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">💾 حفظ</button>
              <button onClick={() => { setShowForm(false); setDuplicateError(null); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-elevated border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
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
