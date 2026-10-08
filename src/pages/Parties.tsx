import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Party, SaleInvoice, PurchaseInvoice, Payment } from '../types';
import { generateId, getTodayStr, formatCurrency, printElement, normalizeDateValue, paymentMethodLabel } from '../utils/helpers';
import { Plus, Search, Edit, Pencil, Trash2, Eye, DollarSign, X, Printer, Copy, Check, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { buildStatementHtml, exportStatementExcel, detailLineText, ExportInput, DetailLevel, DetailLine } from '../utils/statementExport';
import { calculatePartyBalance } from '../store/domains/accounting.store';

interface Props {
  parties: Party[];
  saleInvoices: SaleInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
  onAddParty: (p: Party) => { success: boolean; message?: string } | void;
  onUpdateParty: (p: Party) => void;
  onDeleteParty: (id: string) => { success: boolean; message?: string } | void;
  onAddPayment: (p: Payment) => void;
  onDeletePayment?: (id: string) => { success: boolean; message?: string } | void;
  onUpdatePayment?: (id: string, patch: Partial<Pick<Payment, 'amount' | 'paymentMethod' | 'date' | 'notes' | 'instapayPerson'>>) => void;
  onUpdatePaymentDate?: (id: string, date: string) => void;
  onUpdateSaleInvoiceDate?: (id: string, date: string) => void;
  onUpdatePurchaseInvoiceDate?: (id: string, date: string) => void;
  onNavigateToSales?: (id: string) => void;
  onNavigateToPurchases?: (id: string) => void;
  onOpenInvoice?: (type: 'sale' | 'purchase', id: string, partyId?: string) => void;
  preselectedStatementId?: string | null;
  onPreselectedStatementHandled?: () => void;
}

type Filter = 'all' | 'owing' | 'owed';

type StatementRow = {
  date: string;
  createdAt?: string;
  text: string;
  debit: number;
  credit: number;
  reference?: string;
  kind?: 'invoice' | 'payment';
  method?: string;
  notes?: string;
  person?: string;
  lines?: DetailLine[];
};

export default function Parties({ parties, saleInvoices, purchaseInvoices, payments, onAddParty, onUpdateParty, onDeleteParty, onAddPayment, onDeletePayment, onUpdatePayment, onUpdatePaymentDate, onUpdateSaleInvoiceDate, onUpdatePurchaseInvoiceDate, onNavigateToSales, onNavigateToPurchases, onOpenInvoice, preselectedStatementId, onPreselectedStatementHandled }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Party | null>(null);
  const [view, setView] = useState<Party | null>(null);
  const [paymentParty, setPaymentParty] = useState<Party | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDirection, setPaymentDirection] = useState<'in'|'out'>('in');
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'bank'|'instapay'>('cash');
  const [paymentPerson, setPaymentPerson] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const savingRef = useRef(false);
  const [editPay, setEditPay] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState<Payment['paymentMethod']>('cash');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPerson, setEditPerson] = useState('');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('brief');
  const [rowFilter, setRowFilter] = useState<'all'|'invoices'|'payments'>('all');
  const [paymentDate, setPaymentDate] = useState(getTodayStr());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ name:'', phone:'', email:'', address:'', customer:true, supplier:true, openingBalance:'', notes:'' });

  const balance = (p: Party) => calculatePartyBalance({ saleInvoices, purchaseInvoices, payments }, p);

  useEffect(() => {
    if (!preselectedStatementId) return;
    const p = parties.find(x => x.id === preselectedStatementId);
    if (p) setView(p);
    onPreselectedStatementHandled?.();
  }, [preselectedStatementId, parties, onPreselectedStatementHandled]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter(p => {
      const b = balance(p);
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.phone || '').includes(q);
      const matchesFilter = filter === 'all' || (filter === 'owing' && b > 0.01) || (filter === 'owed' && b < -0.01);
      return matchesSearch && matchesFilter;
    });
  }, [parties, search, filter, saleInvoices, purchaseInvoices, payments]);

  const openAdd = () => { setEdit(null); setError(''); setForm({name:'',phone:'',email:'',address:'',customer:true,supplier:true,openingBalance:'',notes:''}); setShowForm(true); };
  const openEdit = (p: Party) => { setEdit(p); setError(''); setForm({name:p.name,phone:p.phone||'',email:p.email||'',address:p.address||'',customer:p.roles.customer,supplier:p.roles.supplier,openingBalance:String(p.openingBalance || 0),notes:p.notes||''}); setShowForm(true); };

  const save = () => {
    if (!form.name.trim() || (!form.customer && !form.supplier)) { setError('اكتب الاسم واختر عميل أو مورد على الأقل.'); return; }
    const p: Party = { id: edit?.id || generateId(), name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), roles:{customer:form.customer,supplier:form.supplier}, openingBalance:Number(form.openingBalance)||0, notes:form.notes.trim(), createdAt: edit?.createdAt || new Date().toISOString() };
    if (edit) onUpdateParty(p); else {
      const result = onAddParty(p);
      if (result && result.success === false) { setError(result.message || 'تعذر حفظ الحساب'); return; }
    }
    setShowForm(false);
  };

  const openPayment = (party: Party, direction?: 'in'|'out') => {
    const b = balance(party);
    setPaymentParty(party);
    setPaymentDirection(direction || (b >= 0 ? 'in' : 'out'));
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentDate(getTodayStr());
    setPaymentNotes('');
    setError('');
  };

  const submitPayment = () => {
    if (savingRef.current) return; // منع الضغطة المزدوجة
    const amount = Number(paymentAmount);
    if (!paymentParty || !(amount > 0)) { setError('اكتب مبلغًا أكبر من صفر.'); return; }
    savingRef.current = true;
    setSavingPayment(true);
    setTimeout(() => { savingRef.current = false; setSavingPayment(false); }, 1500);
    // الاتجاه هو الذي يحدد هل نسدد فواتير البيع أم الشراء داخل store.addPayment.
    onAddPayment({
      id: generateId(),
      type: paymentDirection === 'in' ? 'sale' : 'purchase',
      referenceId: paymentParty.id,
      referenceName: paymentParty.name,
      amount,
      paymentMethod,
      ...(paymentMethod === 'instapay' && paymentPerson.trim() ? { instapayPerson: paymentPerson.trim() } : {}),
      direction: paymentDirection,
      date: paymentDate || getTodayStr(),
      notes: paymentNotes.trim(),
      createdAt: new Date().toISOString(),
    });
    setPaymentParty(null); setPaymentAmount(''); setPaymentNotes(''); setPaymentPerson(''); setError('');
  };

  const statementRows = useMemo(() => {
    if (!view) return [] as StatementRow[];
    const rows: StatementRow[] = [
      ...saleInvoices.filter(i=>i.customerId===view.id).map(i=>({date:normalizeDateValue(i.date), createdAt:i.createdAt, text:`فاتورة بيع ${i.invoiceNumber}`, debit:i.total, credit:0, reference:i.id, kind:'invoice' as const, lines:(i.items||[]).map(it=>({qty:it.quantity,name:it.productName,price:it.unitPrice,serials:(it.serials||[]).map(sr=>[sr.serial,sr.imei1&&`IMEI ${sr.imei1}`,sr.imei2&&`IMEI2 ${sr.imei2}`].filter(Boolean).join(' · ')).filter(Boolean)}))})),
      ...purchaseInvoices.filter(i=>i.supplierId===view.id).map(i=>({date:normalizeDateValue(i.date), createdAt:i.createdAt, text:`فاتورة شراء ${i.invoiceNumber}`, debit:0, credit:i.total, reference:i.id, kind:'invoice' as const, lines:(i.items||[]).map(it=>({qty:it.quantity,name:it.productName,price:it.unitPrice,serials:(it.serials||[]).map(sr=>[sr.serial,sr.imei1&&`IMEI ${sr.imei1}`,sr.imei2&&`IMEI2 ${sr.imei2}`].filter(Boolean).join(' · ')).filter(Boolean)}))})),
      ...payments.filter(p=>p.referenceId===view.id).map(p=>({date:normalizeDateValue(p.date), createdAt:p.createdAt, text:`${p.direction==='in'?'دفعة واردة':'دفعة خارجة'} — ${paymentMethodLabel(p.paymentMethod)}`, debit:p.direction==='out'?p.amount:0, credit:p.direction==='in'?p.amount:0, reference:p.id, kind:'payment' as const, method:p.paymentMethod, notes:p.notes, person:p.instapayPerson})),
    ];
    return rows.sort((a,b)=>a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '') || (a.reference || '').localeCompare(b.reference || ''));
  }, [view, saleInvoices, purchaseInvoices, payments]);

  const periodRows = useMemo(() => statementRows.filter(r => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)), [statementRows, dateFrom, dateTo]);
  const openingForPeriod = useMemo(() => {
    if (!view) return 0;
    return (view.openingBalance || 0) + statementRows.filter(r => dateFrom && r.date < dateFrom).reduce((b,r)=>b+r.debit-r.credit,0);
  }, [view, statementRows, dateFrom]);
  // الرصيد بعد كل حركة (شامل الحركة نفسها)
  const rowsWithBalance = useMemo(() => {
    let run = openingForPeriod;
    return periodRows.map(r => { run += r.debit - r.credit; return { ...r, balanceAfter: Math.round(run * 100) / 100 }; });
  }, [periodRows, openingForPeriod]);
  const closingBalance = rowsWithBalance.length ? rowsWithBalance[rowsWithBalance.length - 1].balanceAfter : openingForPeriod;
  const visibleRows = useMemo(() => rowsWithBalance.filter(r => rowFilter === 'all' || (rowFilter === 'payments' ? r.kind === 'payment' : r.kind === 'invoice')), [rowsWithBalance, rowFilter]);
  const balText = (b: number) => `${formatCurrency(Math.abs(b))} ${Math.abs(b) < 0.005 ? '' : b > 0 ? 'لنا' : 'له'}`.trim();
  const balClass = (b: number) => Math.abs(b) < 0.005 ? 'text-gray-400' : b > 0 ? 'text-red-300' : 'text-green-300';
  const methodBadge = (m?: string) => m === 'cash' ? 'bg-green-900/40 text-green-300 border-green-600/40' : m === 'instapay' ? 'bg-violet-900/40 text-violet-300 border-violet-600/40' : 'bg-blue-900/40 text-blue-300 border-blue-600/40';
  const methodIcon = (m?: string) => m === 'cash' ? '💵' : m === 'instapay' ? '📱' : '🏦';
  const currentBalance = view ? balance(view) : 0;
  const periodDebit = periodRows.reduce((s,r)=>s+r.debit,0);
  const periodCredit = periodRows.reduce((s,r)=>s+r.credit,0);

  const changeRowDate = (r: StatementRow, date: string) => {
    const normalized = normalizeDateValue(date);
    if (!normalized || !r.reference) return;
    if (saleInvoices.some(i => i.id === r.reference)) onUpdateSaleInvoiceDate?.(r.reference, normalized);
    else if (purchaseInvoices.some(i => i.id === r.reference)) onUpdatePurchaseInvoiceDate?.(r.reference, normalized);
    else onUpdatePaymentDate?.(r.reference, normalized);
  };

  const cancelPayment = (r: StatementRow) => {
    const pay = payments.find(x => x.id === r.reference);
    if (!pay || !onDeletePayment) return;
    const where = pay.paymentMethod === 'cash' ? 'الكاش' : 'البنك';
    const effect = pay.direction === 'in' ? `هيتخصم ${formatCurrency(pay.amount)} من ${where}` : `هيترجع ${formatCurrency(pay.amount)} إلى ${where}`;
    if (!window.confirm(`إلغاء ${r.text} بقيمة ${formatCurrency(pay.amount)} بتاريخ ${r.date}؟\n${effect}، وهيتعدل رصيد الحساب والفواتير.`)) return;
    const res = onDeletePayment(pay.id) as { success: boolean; message?: string } | undefined;
    if (res?.success === false) window.alert(res.message || 'تعذر إلغاء الدفعة');
  };

  const openEditPayment = (r: StatementRow) => {
    const pay = payments.find(x => x.id === r.reference);
    if (!pay) return;
    setEditPay(pay); setEditAmount(String(pay.amount)); setEditMethod(pay.paymentMethod);
    setEditDate(normalizeDateValue(pay.date)); setEditNotes(pay.notes || ''); setEditPerson(pay.instapayPerson || ''); setError('');
  };
  const saveEditPayment = () => {
    const amt = Number(editAmount);
    if (!editPay || !(amt > 0)) { setError('اكتب مبلغًا أكبر من صفر.'); return; }
    onUpdatePayment?.(editPay.id, { amount: amt, paymentMethod: editMethod, date: editDate || editPay.date, notes: editNotes.trim(), instapayPerson: editMethod === 'instapay' ? editPerson.trim() : undefined });
    setEditPay(null); setError('');
  };

  const openStatement = (p: Party) => { setView(p); setDateFrom(''); setDateTo(''); setCopied(false); };

  // نفس بيانات الشاشة بالظبط: الفترة + الفلتر + الرصيد بعد كل حركة
  const exportData = (): ExportInput | null => {
    if (!view) return null;
    return {
      name: view.name, phone: view.phone, dateFrom, dateTo,
      detailLevel,
      filterLabel: rowFilter === 'all' ? 'كل الحركات' : rowFilter === 'invoices' ? 'الفواتير فقط' : 'الدفعات فقط',
      opening: openingForPeriod,
      rows: visibleRows,
      totalDebit: visibleRows.reduce((s, r) => s + r.debit, 0),
      totalCredit: visibleRows.reduce((s, r) => s + r.credit, 0),
      closing: closingBalance,
    };
  };

  // PDF: بيفتح نافذة الطباعة، اختار منها Save as PDF (النص بيفضل عربي ومتحدد)
  const printStatement = () => {
    const d = exportData(); if (!d) return;
    printElement(buildStatementHtml(d), `كشف حساب ${d.name}`);
  };
  const excelStatement = () => {
    const d = exportData(); if (!d) return;
    exportStatementExcel(d);
  };

  const copyStatement = async () => {
    if (!view) return;
    let running = openingForPeriod;
    const lines = [`📋 كشف حساب — ${view.name}`, `الرصيد الافتتاحي: ${formatCurrency(openingForPeriod)} ج.م`, `الفترة: ${dateFrom||'من البداية'} → ${dateTo||'اليوم'}`, ''];
    periodRows.forEach(r => { running += r.debit-r.credit; lines.push(`${r.date} — ${r.text}${r.notes?' ('+r.notes+')':''}: مدين ${r.debit?formatCurrency(r.debit):'-'} | دائن ${r.credit?formatCurrency(r.credit):'-'} | الرصيد ${formatCurrency(Math.abs(running))} ${running>=0?'لنا':'له'}`); if (detailLevel !== 'brief') (r.lines||[]).forEach(l => { lines.push(`      • ${detailLineText(l, detailLevel)}`); if (detailLevel === 'full') l.serials.forEach(sn => lines.push(`          ${sn}`)); }); });
    lines.push('', `الرصيد الجاري: ${formatCurrency(Math.abs(currentBalance))} ${currentBalance>=0?'مستحق لنا':'مستحق له'}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(()=>setCopied(false),1800); } catch { setError('تعذر نسخ الكشف.'); }
  };

  return <div className="p-4 md:p-6 space-y-5 h-full overflow-auto" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-white">👥 الأطراف والحسابات</h2><p className="text-sm text-gray-500">حساب واحد للشخص أو الشركة مهما كان يتعامل معك كعميل أو مورد</p></div>
      <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus size={16}/> حساب جديد</button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="bg-surface border border-border rounded-xl p-4"><div className="text-xs text-muted">إجمالي الحسابات</div><div className="text-2xl font-black text-white mt-1">{parties.length}</div></div>
      <div className="bg-surface border border-border rounded-xl p-4"><div className="text-xs text-muted">عملاء + موردون</div><div className="text-2xl font-black text-violet-300 mt-1">{parties.filter(p=>p.roles.customer&&p.roles.supplier).length}</div></div>
      <div className="bg-surface border border-border rounded-xl p-4"><div className="text-xs text-muted">إجمالي الأرصدة الصافية</div><div className="text-2xl font-black text-white mt-1">{formatCurrency(parties.reduce((a,p)=>a+Math.abs(balance(p)),0))}</div></div>
    </div>

    <div className="flex flex-wrap gap-2">
      {([['all','كل الناس'],['owing','اللي عليهم فلوس'],['owed','اللي ليهم فلوس']] as [Filter,string][]).map(([key,label]) => <button key={key} onClick={()=>setFilter(key)} className={`px-4 py-2 rounded-xl text-sm border ${filter===key?'bg-violet-700/30 border-violet-500/50 text-violet-200':'border-border text-gray-400 hover:bg-white/5'}`}>{label}</button>)}
    </div>
    <div className="relative"><Search className="absolute right-3 top-3 text-gray-500" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف..." className="input-dark w-full pr-10"/></div>
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200"><ShieldCheck size={15}/><span>النظام يمنع إنشاء حساب موحد بنفس الاسم، وأي حسابات قديمة مكررة بنفس الاسم يتم توحيدها تلقائيًا عند تحميل البيانات مع الحفاظ على الفواتير والدفعات.</span></div>

    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="p-3 text-right">الحساب</th><th className="p-3">الدور</th><th className="p-3">الرصيد</th><th className="p-3">الحركات</th><th className="p-3">إجراءات</th></tr></thead>
      <tbody>{filtered.map(p=>{const b=balance(p); const count=saleInvoices.filter(i=>i.customerId===p.id).length+purchaseInvoices.filter(i=>i.supplierId===p.id).length+payments.filter(x=>x.referenceId===p.id).length; return <tr key={p.id} className="border-b border-border/60 hover:bg-white/[.02]"><td className="p-3"><div className="font-bold text-white">{p.name}</div><div className="text-xs text-muted">{p.phone||''}</div></td><td className="p-3 text-center"><span className="text-xs">{p.roles.customer?'عميل':''}{p.roles.customer&&p.roles.supplier?' + ':''}{p.roles.supplier?'مورد':''}</span></td><td className={`p-3 text-center font-bold ${b>0?'text-red-400':b<0?'text-green-400':'text-gray-400'}`}>{formatCurrency(Math.abs(b))} <span className="text-[10px] font-normal">{b>0?'مستحق لنا':b<0?'مستحق له':'متطابق'}</span></td><td className="p-3 text-center">{count}</td><td className="p-3"><div className="flex justify-center gap-1"><button onClick={()=>openStatement(p)} className="p-2 rounded-lg text-violet-300 hover:bg-violet-900/20" title="كشف الحساب"><Eye size={15}/></button><button onClick={()=>openPayment(p)} className="p-2 rounded-lg text-green-300 hover:bg-green-900/20" title="دفعة"><DollarSign size={15}/></button><button onClick={()=>openEdit(p)} className="p-2 rounded-lg text-blue-300 hover:bg-blue-900/20"><Edit size={15}/></button><button onClick={()=>{const r=onDeleteParty(p.id) as {success:boolean;message?:string}|undefined; if(r?.success===false) setError(r.message||'لا يمكن حذف الحساب');}} className="p-2 rounded-lg text-red-300 hover:bg-red-900/20"><Trash2 size={15}/></button></div></td></tr>})}</tbody></table></div>
      {filtered.length===0&&<div className="text-center text-muted py-12">لا توجد حسابات مطابقة</div>}
    </div>

    {showForm&&<div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-auto"><div className="w-full max-w-xl bg-surface border border-border rounded-2xl p-5 mt-4"><div className="flex justify-between items-center mb-5"><h3 className="font-bold text-white">{edit?'تعديل الحساب':'إضافة حساب موحد'}</h3><button onClick={()=>setShowForm(false)}><X size={18}/></button></div><div className="grid md:grid-cols-2 gap-3"><input className="input-dark" placeholder="الاسم *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className="input-dark" placeholder="الهاتف" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input className="input-dark" placeholder="البريد الإلكتروني" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className="input-dark" placeholder="العنوان" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input className="input-dark" type="number" placeholder="الرصيد الافتتاحي (+ لنا / - عليه)" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})}/></div><textarea className="input-dark w-full mt-3" placeholder="ملاحظات" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><div className="flex gap-4 mt-4"><label className="text-sm text-white"><input type="checkbox" checked={form.customer} onChange={e=>setForm({...form,customer:e.target.checked})}/> عميل</label><label className="text-sm text-white"><input type="checkbox" checked={form.supplier} onChange={e=>setForm({...form,supplier:e.target.checked})}/> مورد / تاجر</label></div>{error&&<div className="text-red-400 text-sm mt-3">{error}</div>}<div className="flex justify-end gap-2 mt-5"><button onClick={()=>setShowForm(false)} className="btn-secondary">إلغاء</button><button onClick={save} className="btn-primary">حفظ الحساب</button></div></div></div>}

    {paymentParty&&<div className="fixed inset-0 z-[9999] bg-black/70 flex items-start justify-center p-4" onClick={()=>setPaymentParty(null)}><div className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 mt-12" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><h3 className="font-bold text-white">تسجيل دفعة — {paymentParty.name}</h3><button onClick={()=>setPaymentParty(null)}><X size={18}/></button></div><div className="grid grid-cols-2 gap-2 mt-4"><button onClick={()=>setPaymentDirection('in')} className={`py-2 rounded-xl border ${paymentDirection==='in'?'bg-green-700/30 border-green-500/50 text-green-300':'border-white/10 text-gray-400'}`}>⬅️ دخول دفعة</button><button onClick={()=>setPaymentDirection('out')} className={`py-2 rounded-xl border ${paymentDirection==='out'?'bg-red-700/30 border-red-500/50 text-red-300':'border-white/10 text-gray-400'}`}>➡️ خروج دفعة</button></div><input className="input-dark w-full mt-3" type="number" min="0" placeholder="المبلغ" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/><div className="grid grid-cols-3 gap-2 mt-3"><button onClick={()=>setPaymentMethod('cash')} className={`py-2 rounded-xl border ${paymentMethod==='cash'?'bg-green-700/30 border-green-500/50 text-green-300':'border-white/10 text-gray-400'}`}>💵 كاش</button><button onClick={()=>setPaymentMethod('bank')} className={`py-2 rounded-xl border ${paymentMethod==='bank'?'bg-blue-700/30 border-blue-500/50 text-blue-300':'border-white/10 text-gray-400'}`}>🏦 تحويل بنكي</button><button onClick={()=>setPaymentMethod('instapay')} className={`py-2 rounded-xl border ${paymentMethod==='instapay'?'bg-violet-700/30 border-violet-500/50 text-violet-300':'border-white/10 text-gray-400'}`}>📱 انستا باي</button></div>{paymentMethod==='instapay'&&<input className="input-dark w-full mt-3" placeholder="اسم صاحب حساب انستا باي (اختياري)" value={paymentPerson} onChange={e=>setPaymentPerson(e.target.value)}/>}<input className="input-dark w-full mt-3" type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/><input className="input-dark w-full mt-3" placeholder="ملاحظات" value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)}/>{error&&<div className="text-red-400 text-sm mt-3">{error}</div>}<button onClick={submitPayment} disabled={savingPayment||!(Number(paymentAmount)>0)} className="btn-primary w-full mt-4 disabled:opacity-50">{savingPayment?'⏳ جاري الحفظ...':'✅ تأكيد الدفعة'}</button></div></div>}
    {editPay&&<div className="fixed inset-0 z-[9999] bg-black/70 flex items-start justify-center p-4" onClick={()=>setEditPay(null)}><div className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 mt-12" onClick={e=>e.stopPropagation()}>
      <div className="flex justify-between"><h3 className="font-bold text-white">تعديل دفعة — {editPay.referenceName}</h3><button onClick={()=>setEditPay(null)}><X size={18}/></button></div>
      <div className="text-xs text-muted mt-1">{editPay.direction==='in'?'دفعة واردة':'دفعة خارجة'} — هيتعدل رصيد الكاش/البنك والفواتير تلقائيًا.</div>
      <input className="input-dark w-full mt-4" type="number" min="0" placeholder="المبلغ" value={editAmount} onChange={e=>setEditAmount(e.target.value)}/>
      <div className="grid grid-cols-3 gap-2 mt-3">{([['cash','💵 كاش','green'],['bank','🏦 تحويل بنكي','blue'],['instapay','📱 انستا باي','violet']] as [Payment['paymentMethod'],string,string][]).map(([m,l])=><button key={m} onClick={()=>setEditMethod(m)} className={`py-2 rounded-xl border text-sm ${editMethod===m?'bg-violet-700/30 border-violet-500/50 text-violet-200':'border-white/10 text-gray-400'}`}>{l}</button>)}</div>
      {editMethod==='instapay'&&<input className="input-dark w-full mt-3" placeholder="اسم صاحب حساب انستا باي (اختياري)" value={editPerson} onChange={e=>setEditPerson(e.target.value)}/>}
      <input className="input-dark w-full mt-3" type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}/>
      <input className="input-dark w-full mt-3" placeholder="ملاحظات" value={editNotes} onChange={e=>setEditNotes(e.target.value)}/>
      {error&&<div className="text-red-400 text-sm mt-3">{error}</div>}
      <button onClick={saveEditPayment} disabled={!(Number(editAmount)>0)} className="btn-primary w-full mt-4 disabled:opacity-50">💾 حفظ التعديل</button>
    </div></div>}

    {view&&<div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-auto" onClick={()=>setView(null)}><div className="w-full max-w-5xl bg-surface border border-border rounded-2xl p-5 mt-4" onClick={e=>e.stopPropagation()}><div className="flex flex-wrap justify-between items-center gap-3"><div><h3 className="text-xl font-bold text-white">كشف حساب — {view.name}</h3><div className="text-sm text-muted mt-1">{view.phone||''}</div></div><div className="flex gap-2"><button onClick={copyStatement} className="btn-secondary flex items-center gap-1">{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'تم النسخ':'نسخ لواتساب'}</button><button onClick={printStatement} className="btn-secondary flex items-center gap-1" title="اختار Save as PDF من نافذة الطباعة"><Printer size={15}/> طباعة / PDF</button><button onClick={excelStatement} className="btn-secondary flex items-center gap-1"><FileSpreadsheet size={15}/> Excel</button><button onClick={()=>setView(null)} className="p-2"><X size={18}/></button></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5"><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">الرصيد الافتتاحي</div><div className="font-black text-white">{formatCurrency(openingForPeriod)}</div></div><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">حركة مدين</div><div className="font-bold text-white">{formatCurrency(periodDebit)}</div></div><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">حركة دائن</div><div className="font-bold text-white">{formatCurrency(periodCredit)}</div></div><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">الرصيد الجاري</div><div className={`font-black ${currentBalance>=0?'text-red-300':'text-green-300'}`}>{formatCurrency(Math.abs(currentBalance))} {currentBalance>=0?'لنا':'له'}</div></div></div>
      <div className="flex flex-wrap gap-2 items-center mb-4"><span className="text-xs text-muted">الفترة:</span><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="input-dark"/><span className="text-gray-500">إلى</span><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="input-dark"/><button onClick={()=>{setDateFrom('');setDateTo('')}} className="btn-secondary text-xs">كل الفترة</button><button onClick={()=>openPayment(view)} className="btn-primary text-xs">💰 تسجيل دفعة</button></div>
      <div className="overflow-auto">
        <div className="flex flex-wrap gap-2 mb-3">{([['all','كل الحركات'],['invoices','الفواتير فقط'],['payments','الدفعات فقط']] as ['all'|'invoices'|'payments',string][]).map(([k,l])=><button key={k} onClick={()=>setRowFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs border ${rowFilter===k?'bg-violet-700/30 border-violet-500/50 text-violet-200':'border-border text-gray-400 hover:bg-white/5'}`}>{l}</button>)}<span className="mx-1 text-border">|</span><span className="text-xs text-muted self-center">البيان:</span>{([['brief','مختصر'],['items','الأصناف'],['items_price','الأصناف + السعر'],['full','كل التفاصيل (+ السيريال)']] as [DetailLevel,string][]).map(([k,l])=><button key={k} onClick={()=>setDetailLevel(k)} className={`px-3 py-1.5 rounded-lg text-xs border ${detailLevel===k?'bg-blue-700/30 border-blue-500/50 text-blue-200':'border-border text-gray-400 hover:bg-white/5'}`}>{l}</button>)}</div>
        <table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="p-2">التاريخ</th><th className="p-2 text-right">البيان</th><th className="p-2">مدين</th><th className="p-2">دائن</th><th className="p-2">الرصيد الجاري</th><th className="p-2">إجراءات</th></tr></thead>
        <tbody>
          <tr className="border-b border-border/40 bg-white/[.03]"><td className="p-2 text-center text-xs text-muted">{dateFrom||'—'}</td><td className="p-2 font-bold text-gray-300">الرصيد الافتتاحي</td><td className="p-2 text-center">-</td><td className="p-2 text-center">-</td><td className={`p-2 text-center font-bold ${balClass(openingForPeriod)}`}>{balText(openingForPeriod)}</td><td className="p-2"></td></tr>
          {visibleRows.map((r,i)=>{ const isManual = r.kind==='payment' && payments.some(x=>x.id===r.reference && !x.id.startsWith('paid_')); return <tr key={`${r.reference||r.text}-${i}`} className="border-b border-border/40">
            <td className="p-2"><input type="date" value={normalizeDateValue(r.date)} onChange={e=>changeRowDate(r,e.target.value)} className="bg-transparent border border-border/60 hover:border-violet-400 rounded px-1 text-white text-xs" title="تعديل التاريخ" /></td>
            <td className="p-2">{(() => { const sale = saleInvoices.find(inv => inv.id === r.reference); const purchase = purchaseInvoices.find(inv => inv.id === r.reference); if (sale) return <button onClick={() => onOpenInvoice?.('sale', sale.id, view?.id)} className="text-violet-300 hover:text-violet-200 hover:underline font-medium" title="فتح الفاتورة">{r.text}</button>; if (purchase) return <button onClick={() => onOpenInvoice?.('purchase', purchase.id, view?.id)} className="text-violet-300 hover:text-violet-200 hover:underline font-medium" title="فتح الفاتورة">{r.text}</button>; return <div className="flex flex-wrap items-center gap-2"><span>{r.debit>0?'دفعة خارجة':'دفعة واردة'}</span><span className={`text-xs px-2 py-0.5 rounded-full border ${methodBadge(r.method)}`}>{methodIcon(r.method)} {paymentMethodLabel(r.method||'')}</span>{r.person&&<span className="text-xs text-gray-400">({r.person})</span>}</div>; })()}{detailLevel!=='brief'&&r.lines&&r.lines.length>0&&<ul className="mt-1.5 space-y-1 text-xs text-gray-300 border-r-2 border-violet-500/40 pr-2">{r.lines.map((l,idx)=><li key={idx}><div dir="auto" style={{unicodeBidi:'plaintext'}}>{detailLineText(l,detailLevel)}</div>{detailLevel==='full'&&l.serials.length>0&&<div dir="ltr" className="font-mono text-[11px] text-gray-400 text-right">{l.serials.map((sn,k)=><div key={k}>{sn}</div>)}</div>}</li>)}</ul>}{r.notes&&<div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}</td>
            <td className="p-2 text-center">{r.debit?formatCurrency(r.debit):'-'}</td><td className="p-2 text-center">{r.credit?formatCurrency(r.credit):'-'}</td>
            <td className={`p-2 text-center font-bold ${balClass(r.balanceAfter)}`}>{balText(r.balanceAfter)}</td>
            <td className="p-2 text-center whitespace-nowrap">{isManual && <>{onUpdatePayment&&<button onClick={()=>openEditPayment(r)} className="p-1.5 rounded-lg text-blue-300 hover:bg-blue-900/30" title="تعديل الدفعة"><Pencil size={14}/></button>}{onDeletePayment&&<button onClick={()=>cancelPayment(r)} className="p-1.5 rounded-lg text-red-300 hover:bg-red-900/30" title="حذف الدفعة"><Trash2 size={14}/></button>}</>}{r.kind==='payment'&&!isManual&&<span className="text-[10px] text-gray-500">من الفاتورة</span>}</td>
          </tr>})}
          <tr className="bg-white/[.04] font-bold"><td className="p-2" colSpan={2}>الإجمالي / الرصيد الختامي</td><td className="p-2 text-center">{formatCurrency(periodDebit)}</td><td className="p-2 text-center">{formatCurrency(periodCredit)}</td><td className={`p-2 text-center ${balClass(closingBalance)}`}>{balText(closingBalance)}</td><td className="p-2"></td></tr>
        </tbody></table>{!periodRows.length&&<div className="text-center text-muted py-10">لا توجد حركات في الفترة المحددة.</div>}</div>
      <div className="flex justify-end gap-2 mt-5"><button onClick={()=>onNavigateToSales?.(view.id)} className="btn-secondary">فواتير البيع</button><button onClick={()=>onNavigateToPurchases?.(view.id)} className="btn-primary">فواتير الشراء</button></div>
    </div></div>}
  </div>;
}
