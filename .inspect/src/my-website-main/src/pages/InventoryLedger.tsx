import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Filter, Search } from 'lucide-react';
import { DailyOperationEntry, NoonOrder, Product, PurchaseInvoice, SaleInvoice, SerialItem, StockTransfer, WeeklyInventoryCount } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';

type LedgerKind = 'purchase' | 'sale' | 'transfer-in' | 'transfer-out' | 'count';
interface LedgerRow {
  id: string;
  date: string;
  kind: LedgerKind;
  productId: string;
  productName: string;
  quantity: number;
  unitValue?: number;
  value?: number;
  reference: string;
  party?: string;
  location?: string;
  serials?: string[];
  note?: string;
}

interface Props {
  products: Product[];
  serials: SerialItem[];
  purchaseInvoices: PurchaseInvoice[];
  saleInvoices: SaleInvoice[];
  stockTransfers: StockTransfer[];
  weeklyInventoryCounts: WeeklyInventoryCount[];
  dailyOperations: DailyOperationEntry[];
  noonOrders: NoonOrder[];
}

export default function InventoryLedger({ products, serials, purchaseInvoices, saleInvoices, stockTransfers, weeklyInventoryCounts, dailyOperations, noonOrders }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | LedgerKind>('all');
  const [date, setDate] = useState('');
  const rows = useMemo<LedgerRow[]>(() => {
    const out: LedgerRow[] = [];
    purchaseInvoices.forEach(inv => inv.items.forEach(item => out.push({
      id: `p-${inv.id}-${item.id}`, date: inv.date, kind: 'purchase', productId: item.productId, productName: item.productName,
      quantity: item.quantity, unitValue: item.unitPrice, value: item.total, reference: inv.invoiceNumber, party: inv.supplierName,
      serials: item.serials?.map(s => s.serial),
    })));
    saleInvoices.filter(inv => inv.status !== 'canceled').forEach(inv => inv.items.forEach(item => out.push({
      id: `s-${inv.id}-${item.id}`, date: inv.date, kind: 'sale', productId: item.productId, productName: item.productName,
      quantity: item.quantity, unitValue: item.unitPrice, value: item.total, reference: inv.invoiceNumber, party: inv.customerName,
      serials: item.serials?.map(s => s.serial),
    })));
    noonOrders.filter(o => o.status !== 'canceled').forEach(o => o.items.forEach((item, idx) => out.push({
      id: `noon-${o.id}-${idx}`, date: o.date, kind: 'sale', productId: item.productId, productName: item.productName,
      quantity: 1, unitValue: item.price, value: item.price, reference: o.orderNumber, party: o.platform,
      serials: item.serial ? [item.serial] : [], note: 'خروج عبر المنصة'
    })));
    stockTransfers.forEach(t => t.items.forEach(item => {
      out.push({ id: `to-${t.id}-${item.productId}`, date: t.date, kind: 'transfer-out', productId: item.productId, productName: item.productName,
        quantity: item.quantity, reference: t.transferNumber, location: `${t.fromLocation} → ${t.toLocation}`, serials: item.serials?.map(s => s.serial), note: 'خروج من الموقع' });
      out.push({ id: `ti-${t.id}-${item.productId}`, date: t.date, kind: 'transfer-in', productId: item.productId, productName: item.productName,
        quantity: item.quantity, reference: t.transferNumber, location: `${t.fromLocation} → ${t.toLocation}`, serials: item.serials?.map(s => s.serial), note: 'دخول للموقع' });
    }));
    weeklyInventoryCounts.forEach(count => count.lines.forEach(line => {
      if (!line.difference) return;
      out.push({ id: `c-${count.id}-${line.productId}`, date: count.endDate, kind: 'count', productId: line.productId, productName: line.productName,
        quantity: line.difference, reference: `جرد ${count.startDate}`, value: Math.abs(line.difference) * (products.find(p => p.id === line.productId)?.costPrice || 0), note: line.notes || 'تسوية فرق جرد' });
    }));
    dailyOperations.forEach(op => {
      if (op.operationType === 'adjustment' || op.operationType === 'return') out.push({ id: `op-${op.id}`, date: op.date, kind: 'count', productId: op.productId, productName: op.productName,
        quantity: op.quantity, unitValue: op.unitPrice, value: op.total, reference: op.reference || op.id, location: op.location, note: op.notes || op.operationType });
    });
    return out.sort((a,b)=> b.date.localeCompare(a.date));
  }, [purchaseInvoices, saleInvoices, stockTransfers, weeklyInventoryCounts, dailyOperations, products]);
  const filtered = rows.filter(r => {
    const q = query.trim().toLowerCase();
    const hitQ = !q || [r.productName, r.reference, r.party, r.location, ...(r.serials || [])].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    const hitKind = kind === 'all' || r.kind === kind;
    const hitDate = !date || r.date === date;
    return hitQ && hitKind && hitDate;
  });
  const netQty = filtered.reduce((s,r)=>s + (r.kind === 'purchase' || r.kind === 'transfer-in' ? r.quantity : r.kind === 'sale' || r.kind === 'transfer-out' ? -r.quantity : r.quantity), 0);
  const value = filtered.reduce((s,r)=>s + (r.value || 0), 0);
  const label = (k: LedgerKind) => ({ purchase:'شراء', sale:'بيع', 'transfer-in':'تحويل دخول','transfer-out':'تحويل خروج', count:'تسوية جرد' }[k]);
  return <div className="space-y-4">
    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
      <div><h2 className="text-lg font-bold text-white">Inventory Ledger — سجل حركة المخزون</h2><p className="text-xs text-muted mt-1">كل حركة دخول وخروج وتسوية في مكان واحد.</p></div>
      <div className="text-xs text-muted">آخر تحديث: {getTodayStr()}</div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="card p-3"><div className="text-xs text-muted">الحركات</div><div className="text-xl font-bold">{filtered.length}</div></div>
      <div className="card p-3"><div className="text-xs text-muted">صافي الكمية</div><div className="text-xl font-bold">{netQty > 0 ? '+' : ''}{netQty}</div></div>
      <div className="card p-3"><div className="text-xs text-muted">قيمة العمليات</div><div className="text-xl font-bold">{formatCurrency(value)}</div></div>
      <div className="card p-3"><div className="text-xs text-muted">السيريالات المسجلة</div><div className="text-xl font-bold">{filtered.reduce((s,r)=>s+(r.serials?.length||0),0)}</div></div>
    </div>
    <div className="card p-3 flex flex-col lg:flex-row gap-2">
      <div className="relative flex-1"><Search size={16} className="absolute right-3 top-3 text-muted"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالسيريال، المنتج، الفاتورة، المورد أو العميل" className="input-dark w-full pr-9"/></div>
      <div className="flex items-center gap-2"><Filter size={15} className="text-muted"/><select value={kind} onChange={e=>setKind(e.target.value as any)} className="input-dark"><option value="all">كل الحركات</option><option value="purchase">شراء</option><option value="sale">بيع</option><option value="transfer-in">تحويل دخول</option><option value="transfer-out">تحويل خروج</option><option value="count">تسوية جرد</option></select></div>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input-dark"/>
    </div>
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted"><th className="text-right p-3">التاريخ</th><th className="text-right p-3">الحركة</th><th className="text-right p-3">المنتج</th><th className="text-center p-3">الكمية</th><th className="text-right p-3">المرجع</th><th className="text-right p-3">الطرف/المكان</th><th className="text-right p-3">السيريال</th><th className="text-right p-3">القيمة</th></tr></thead><tbody>
      {filtered.map(r => <tr key={r.id} className="border-b border-border/60 hover:bg-white/5"><td className="p-3 text-xs text-muted whitespace-nowrap">{r.date}</td><td className="p-3"><span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${r.kind==='sale'||r.kind==='transfer-out'?'bg-red-900/30 text-red-300':'bg-emerald-900/30 text-emerald-300'}`}>{r.kind==='sale'||r.kind==='transfer-out'?<ArrowUpRight size={12}/>:<ArrowDownLeft size={12}/>} {label(r.kind)}</span></td><td className="p-3"><div className="font-medium">{r.productName}</div><div className="text-[11px] text-muted">{products.find(p=>p.id===r.productId)?.sku}</div></td><td className="p-3 text-center font-mono font-bold">{r.quantity > 0 && (r.kind==='purchase'||r.kind==='transfer-in')?'+':''}{r.quantity}</td><td className="p-3 font-mono text-violet-300">{r.reference}</td><td className="p-3 text-xs text-muted">{r.party || r.location || r.note || '—'}</td><td className="p-3 max-w-[220px]"><div className="flex flex-wrap gap-1">{(r.serials||[]).slice(0,5).map(x=><span key={x} className="font-mono text-[11px] bg-white/5 px-1.5 py-0.5 rounded">{x}</span>)}{(r.serials?.length||0)>5&&<span className="text-[11px] text-muted">+{r.serials!.length-5}</span>}</div></td><td className="p-3 font-mono">{r.value != null ? formatCurrency(r.value) : '—'}</td></tr>)}
      {!filtered.length && <tr><td colSpan={8} className="p-10 text-center text-muted">لا توجد حركات مطابقة.</td></tr>}
    </tbody></table></div></div>
  </div>;
}
