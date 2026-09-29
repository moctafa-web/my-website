import React, { useEffect, useMemo, useState } from 'react';
import { Party, SaleInvoice, PurchaseInvoice, Payment } from '../types';
import { generateId, getTodayStr, formatCurrency } from '../utils/helpers';
import { Plus, Search, Edit, Trash2, Eye, DollarSign, X } from 'lucide-react';
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
  onNavigateToSales?: (id: string) => void;
  onNavigateToPurchases?: (id: string) => void;
  preselectedStatementId?: string | null;
  onPreselectedStatementHandled?: () => void;
}

export default function Parties({ parties, saleInvoices, purchaseInvoices, payments, onAddParty, onUpdateParty, onDeleteParty, onAddPayment, onNavigateToSales, onNavigateToPurchases, preselectedStatementId, onPreselectedStatementHandled }: Props) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Party | null>(null);
  const [view, setView] = useState<Party | null>(null);
  const [paymentParty, setPaymentParty] = useState<Party | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDirection, setPaymentDirection] = useState<'in'|'out'>('in');
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'bank'|'transfer'>('cash');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name:'', phone:'', email:'', address:'', customer:true, supplier:true, openingBalance:'', notes:'' });

  useEffect(() => {
    if (!preselectedStatementId) return;
    const p = parties.find(x => x.id === preselectedStatementId);
    if (p) setView(p);
    onPreselectedStatementHandled?.();
  }, [preselectedStatementId, parties, onPreselectedStatementHandled]);

  const filtered = useMemo(() => parties.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone || '').includes(search)), [parties, search]);
  const balance = (p: Party) => calculatePartyBalance({ saleInvoices, purchaseInvoices, payments }, p);
  const openAdd = () => { setEdit(null); setError(''); setForm({name:'',phone:'',email:'',address:'',customer:true,supplier:true,openingBalance:'',notes:''}); setShowForm(true); };
  const openEdit = (p: Party) => { setEdit(p); setError(''); setForm({name:p.name,phone:p.phone||'',email:p.email||'',address:p.address||'',customer:p.roles.customer,supplier:p.roles.supplier,openingBalance:String(p.openingBalance || 0),notes:p.notes||''}); setShowForm(true); };
  const save = () => {
    if (!form.name.trim() || (!form.customer && !form.supplier)) { setError('اكتب الاسم واختر عميل أو مورد على الأقل.'); return; }
    const p: Party = { id: edit?.id || generateId(), name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), roles:{customer:form.customer,supplier:form.supplier}, openingBalance:Number(form.openingBalance)||0, notes:form.notes.trim(), createdAt: edit?.createdAt || new Date().toISOString() };
    const result = edit ? (onUpdateParty(p), {success:true}) : onAddParty(p);
    if (result && result.success === false) { setError(result.message || 'تعذر حفظ الحساب'); return; }
    setShowForm(false);
  };
  const submitPayment = () => {
    if (!paymentParty || !(Number(paymentAmount) > 0)) return;
    onAddPayment({ id:generateId(), type:'opening', referenceId:paymentParty.id, referenceName:paymentParty.name, amount:Number(paymentAmount), paymentMethod, direction:paymentDirection, date:getTodayStr(), createdAt:new Date().toISOString() });
    setPaymentParty(null); setPaymentAmount('');
  };
  const statement = view ? [
    ...saleInvoices.filter(i=>i.customerId===view.id).map(i=>({date:i.date, text:`فاتورة بيع ${i.invoiceNumber}`, debit:i.total, credit:0})),
    ...purchaseInvoices.filter(i=>i.supplierId===view.id).map(i=>({date:i.date, text:`فاتورة شراء ${i.invoiceNumber}`, debit:0, credit:i.total})),
    ...payments.filter(p=>p.referenceId===view.id).map(p=>({date:p.date, text:p.direction==='in'?'دفعة واردة':'دفعة خارجة', debit:p.direction==='out'?p.amount:0, credit:p.direction==='in'?p.amount:0})),
  ].sort((a,b)=>a.date.localeCompare(b.date)) : [];

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
    <div className="relative"><Search className="absolute right-3 top-3 text-gray-500" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف..." className="input-dark w-full pr-10"/></div>
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="p-3 text-right">الحساب</th><th className="p-3">الدور</th><th className="p-3">الرصيد</th><th className="p-3">الحركات</th><th className="p-3">إجراءات</th></tr></thead>
      <tbody>{filtered.map(p=>{const b=balance(p); const count=saleInvoices.filter(i=>i.customerId===p.id).length+purchaseInvoices.filter(i=>i.supplierId===p.id).length+payments.filter(x=>x.referenceId===p.id).length; return <tr key={p.id} className="border-b border-border/60 hover:bg-white/[.02]"><td className="p-3"><div className="font-bold text-white">{p.name}</div><div className="text-xs text-muted">{p.phone||''}</div></td><td className="p-3 text-center"><span className="text-xs">{p.roles.customer?'عميل':''}{p.roles.customer&&p.roles.supplier?' + ':''}{p.roles.supplier?'مورد':''}</span></td><td className={`p-3 text-center font-bold ${b>0?'text-red-400':b<0?'text-green-400':'text-gray-400'}`}>{formatCurrency(Math.abs(b))} <span className="text-[10px] font-normal">{b>0?'مستحق لنا':b<0?'مستحق له':'متطابق'}</span></td><td className="p-3 text-center">{count}</td><td className="p-3"><div className="flex justify-center gap-1"><button onClick={()=>setView(p)} className="p-2 rounded-lg text-violet-300 hover:bg-violet-900/20" title="كشف الحساب"><Eye size={15}/></button><button onClick={()=>setPaymentParty(p)} className="p-2 rounded-lg text-green-300 hover:bg-green-900/20" title="دفعة"><DollarSign size={15}/></button><button onClick={()=>openEdit(p)} className="p-2 rounded-lg text-blue-300 hover:bg-blue-900/20"><Edit size={15}/></button><button onClick={()=>{const r=onDeleteParty(p.id); if(r?.success===false) setError(r.message||'لا يمكن حذف الحساب');}} className="p-2 rounded-lg text-red-300 hover:bg-red-900/20"><Trash2 size={15}/></button></div></td></tr>})}</tbody></table></div>
      {filtered.length===0&&<div className="text-center text-muted py-12">لا توجد حسابات مطابقة</div>}
    </div>

    {showForm&&<div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-auto"><div className="w-full max-w-xl bg-surface border border-border rounded-2xl p-5 mt-4"><div className="flex justify-between items-center mb-5"><h3 className="font-bold text-white">{edit?'تعديل الحساب':'إضافة حساب موحد'}</h3><button onClick={()=>setShowForm(false)}><X size={18}/></button></div><div className="grid md:grid-cols-2 gap-3"><input className="input-dark" placeholder="الاسم *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className="input-dark" placeholder="الهاتف" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input className="input-dark" placeholder="البريد الإلكتروني" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className="input-dark" placeholder="العنوان" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input className="input-dark" type="number" placeholder="الرصيد الافتتاحي (+ لنا / - عليه)" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})}/></div><textarea className="input-dark w-full mt-3" placeholder="ملاحظات" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><div className="flex gap-4 mt-4"><label className="text-sm text-white"><input type="checkbox" checked={form.customer} onChange={e=>setForm({...form,customer:e.target.checked})}/> عميل</label><label className="text-sm text-white"><input type="checkbox" checked={form.supplier} onChange={e=>setForm({...form,supplier:e.target.checked})}/> مورد / تاجر</label></div>{error&&<div className="text-red-400 text-sm mt-3">{error}</div>}<div className="flex justify-end gap-2 mt-5"><button onClick={()=>setShowForm(false)} className="btn-secondary">إلغاء</button><button onClick={save} className="btn-primary">حفظ الحساب</button></div></div></div>}
    {paymentParty&&<div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4"><div className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 mt-12"><div className="flex justify-between"><h3 className="font-bold text-white">دفعة — {paymentParty.name}</h3><button onClick={()=>setPaymentParty(null)}><X size={18}/></button></div><input className="input-dark w-full mt-4" type="number" placeholder="المبلغ" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/><div className="grid grid-cols-2 gap-2 mt-3"><select className="input-dark" value={paymentDirection} onChange={e=>setPaymentDirection(e.target.value as any)}><option value="in">وارد — قبضت منه</option><option value="out">صادر — دفعت له</option></select><select className="input-dark" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as any)}><option value="cash">كاش</option><option value="bank">بنك</option><option value="transfer">تحويل</option></select></div><button onClick={submitPayment} className="btn-primary w-full mt-4">تسجيل الدفعة</button></div></div>}
    {view&&<div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-auto"><div className="w-full max-w-4xl bg-surface border border-border rounded-2xl p-5 mt-4"><div className="flex justify-between items-center"><div><h3 className="text-xl font-bold text-white">كشف حساب — {view.name}</h3><div className="text-sm text-muted mt-1">{view.phone||''}</div></div><button onClick={()=>setView(null)}><X size={18}/></button></div><div className="grid grid-cols-3 gap-3 my-5"><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">الرصيد</div><div className="font-black text-white">{formatCurrency(Math.abs(balance(view)))}</div></div><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">مبيعات</div><div className="font-bold text-white">{formatCurrency(saleInvoices.filter(i=>i.customerId===view.id).reduce((a,i)=>a+i.total,0))}</div></div><div className="bg-elevated rounded-xl p-3"><div className="text-xs text-muted">مشتريات</div><div className="font-bold text-white">{formatCurrency(purchaseInvoices.filter(i=>i.supplierId===view.id).reduce((a,i)=>a+i.total,0))}</div></div></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="p-2">التاريخ</th><th className="p-2 text-right">البيان</th><th className="p-2">مدين</th><th className="p-2">دائن</th></tr></thead><tbody>{statement.map((r,i)=><tr key={i} className="border-b border-border/40"><td className="p-2">{r.date}</td><td className="p-2">{r.text}</td><td className="p-2 text-center">{r.debit?formatCurrency(r.debit):'-'}</td><td className="p-2 text-center">{r.credit?formatCurrency(r.credit):'-'}</td></tr>)}</tbody></table></div><div className="flex justify-end gap-2 mt-5"><button onClick={()=>onNavigateToSales?.(view.id)} className="btn-secondary">فواتير البيع</button><button onClick={()=>onNavigateToPurchases?.(view.id)} className="btn-primary">فواتير الشراء</button></div></div></div>}
  </div>;
}
