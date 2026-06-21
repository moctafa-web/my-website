import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SaleInvoice, Customer, Product, SerialItem, InvoiceItem, PaymentMethod, Brand } from '../types';
import { formatCurrency, generateId, getTodayStr, paymentMethodLabel, statusLabel, statusColor, printElement } from '../utils/helpers';
import { Plus, Search, Printer, Eye, X, ChevronDown } from 'lucide-react';

interface Props {
  saleInvoices: SaleInvoice[];
  customers: Customer[];
  products: Product[];
  serials: SerialItem[];
  brands: Brand[];
  settings: { lastSaleInvoiceNum: number; invoicePrefix: string; companyName: string };
  onAddSaleInvoice: (inv: SaleInvoice) => void;
  onAddCustomer: (c: Customer) => void;
  onUpdateSaleInvoice: (inv: SaleInvoice) => void;
  preselectedCustomerId?: string | null;
  onPreselectedHandled?: () => void;
}

interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  taxRate: number;
  serials: { serial: string; imei1: string; imei2: string }[];
  total: number;
}

export default function Sales({ saleInvoices, customers, products, serials, settings, onAddSaleInvoice, onAddCustomer, onUpdateSaleInvoice, preselectedCustomerId, onPreselectedHandled }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null);
  const [addCustomerModal, setAddCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', type: 'individual' as Customer['type'] });

  // Form state
  const [formDate, setFormDate] = useState(getTodayStr());
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [instapayPerson, setInstapayPerson] = useState('');
  const [paid, setPaid] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});
  const [showItemDrop, setShowItemDrop] = useState<Record<string, boolean>>({});

  // عند القدوم من كشف حساب عميل بزرار "فاتورة جديدة": يفتح الفورم تلقائيًا مع تحديد العميل
  useEffect(() => {
    if (preselectedCustomerId) {
      const customer = customers.find(c => c.id === preselectedCustomerId);
      if (customer) {
        setCustomerId(customer.id);
        setCustomerSearch(customer.name);
      }
      setShowForm(true);
      onPreselectedHandled?.();
    }
  }, [preselectedCustomerId]);

  const searchQuery = search.toLowerCase();
  const filtered = saleInvoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(searchQuery) ||
    inv.customerName.toLowerCase().includes(searchQuery) ||
    inv.date.includes(searchQuery)
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone || '').includes(customerSearch)
  );

  const subtotal = saleItems.reduce((s, item) => s + item.total, 0);
  const totalAfterDiscount = Math.max(0, subtotal - discount);
  const paidAmount = parseFloat(paid) || 0;
  const remaining = totalAfterDiscount - paidAmount;

  const addItem = () => {
    const id = generateId();
    setSaleItems(prev => [...prev, {
      id, productId: '', productName: '', sku: '', description: '',
      quantity: 1, unitPrice: 0, discount: 0, discountType: 'percent', taxRate: 0,
      serials: [], total: 0,
    }]);
    setItemSearch(prev => ({ ...prev, [id]: '' }));
  };

  const updateItem = (id: string, updates: Partial<SaleItem>) => {
    setSaleItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      const discountAmt = updated.discountType === 'percent'
        ? (updated.unitPrice * updated.quantity * updated.discount / 100)
        : updated.discount;
      updated.total = Math.max(0, updated.unitPrice * updated.quantity - discountAmt);
      return updated;
    }));
  };

  const selectProduct = (itemId: string, product: Product) => {
    const availSerial = serials.find(s => s.productId === product.id && s.status === 'available');
    updateItem(itemId, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.salePrice,
      serials: product.productType === 'serial' ? [{ serial: availSerial?.serial || '', imei1: availSerial?.imei1 || '', imei2: availSerial?.imei2 || '' }] : [],
    });
    setItemSearch(prev => ({ ...prev, [itemId]: product.name }));
    setShowItemDrop(prev => ({ ...prev, [itemId]: false }));
  };

  const getFilteredProducts = (search: string) => {
    if (!search) return products.slice(0, 10);
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.upc || '').includes(q)
    ).slice(0, 10);
  };

  const selectedCustomer = customers.find(c => c.id === customerId);

  const handleSave = () => {
    if (!customerId || saleItems.length === 0) return;
    const invoiceNumber = `${settings.invoicePrefix}-${String(settings.lastSaleInvoiceNum + 1).padStart(4, '0')}`;
    const items: InvoiceItem[] = saleItems.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: item.discountType,
      taxRate: item.taxRate,
      total: item.total,
      serials: item.serials.filter(s => s.serial),
    }));

    const invoice: SaleInvoice = {
      id: generateId(),
      invoiceNumber,
      customerId,
      customerName: selectedCustomer?.name || '',
      date: formDate,
      items,
      subtotal,
      taxTotal: 0,
      discount,
      total: totalAfterDiscount,
      paid: paidAmount,
      remaining,
      status: remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      paymentMethod,
      instapayPerson: paymentMethod === 'instapay' ? instapayPerson : undefined,
      notes,
      createdAt: new Date().toISOString(),
    };

    onAddSaleInvoice(invoice);
    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setSaleItems([]); setCustomerId(''); setCustomerSearch(''); setPaid(''); setDiscount(0);
    setNotes(''); setPaymentMethod('cash'); setInstapayPerson(''); setFormDate(getTodayStr());
  };

  const handleAddCustomer = () => {
    if (!newCustomer.name) return;
    const c: Customer = {
      id: generateId(), name: newCustomer.name, phone: newCustomer.phone,
      type: newCustomer.type as Customer['type'], openingBalance: 0,
      totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString(),
    };
    onAddCustomer(c);
    setCustomerId(c.id);
    setCustomerSearch(c.name);
    setAddCustomerModal(false);
    setNewCustomer({ name: '', phone: '', type: 'individual' });
  };

  const printInvoice = (inv: SaleInvoice) => {
    const itemsHtml = inv.items.map(item => `
      <tr>
        <td>${item.productName}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${item.unitPrice.toLocaleString('ar-EG')}</td>
        <td style="text-align:center">${item.discount > 0 ? item.discount : '-'}</td>
        <td style="text-align:center">${item.total.toLocaleString('ar-EG')}</td>
      </tr>
      ${item.serials?.map(s => `<tr><td colspan="5" style="font-size:11px;color:#666;padding-right:20px">السيريال: ${s.serial}${s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}${s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}</td></tr>`).join('') || ''}
    `).join('');

    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div><div style="font-size:12px;color:#666">نظام الإدارة المتكامل</div></div>
        <div class="invoice-info">
          <div><strong>فاتورة مبيعات</strong></div>
          <div>رقم: ${inv.invoiceNumber}</div>
          <div>التاريخ: ${inv.date}</div>
          <div>العميل: ${inv.customerName}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="totals">
        <table>
          <tr><td>المجموع الفرعي</td><td>${inv.subtotal.toLocaleString('ar-EG')} ج.م</td></tr>
          ${inv.discount > 0 ? `<tr><td>الخصم</td><td>- ${inv.discount.toLocaleString('ar-EG')} ج.م</td></tr>` : ''}
          <tr class="total-row"><td>الإجمالي</td><td>${inv.total.toLocaleString('ar-EG')} ج.م</td></tr>
          <tr><td>المدفوع</td><td>${inv.paid.toLocaleString('ar-EG')} ج.م</td></tr>
          ${inv.remaining > 0 ? `<tr><td style="color:#ef4444">المتبقي</td><td style="color:#ef4444">${inv.remaining.toLocaleString('ar-EG')} ج.م</td></tr>` : ''}
          <tr><td>طريقة الدفع</td><td>${paymentMethodLabel(inv.paymentMethod)}</td></tr>
        </table>
      </div>
      ${inv.notes ? `<p style="margin-top:15px;font-size:12px;color:#666">ملاحظات: ${inv.notes}</p>` : ''}
    `);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">🛒 المبيعات</h2><p className="text-gray-500 text-sm">{saleInvoices.length} فاتورة</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> فاتورة بيع جديدة</button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل..." className="input-dark w-full pr-9" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(saleInvoices.reduce((s, i) => s + i.total, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المبيعات</div>
        </div>
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{formatCurrency(saleInvoices.reduce((s, i) => s + i.paid, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المحصل</div>
        </div>
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(saleInvoices.reduce((s, i) => s + i.remaining, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المتبقي</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">رقم الفاتورة</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">العميل</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">التاريخ</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">الإجمالي</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">المدفوع</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">الحالة</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">لا توجد فواتير بعد</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 font-mono text-violet-400 text-sm">{inv.invoiceNumber}</td>
                <td className="py-3 px-4 text-white">{inv.customerName}</td>
                <td className="py-3 px-4 text-center text-gray-400 text-xs">{inv.date}</td>
                <td className="py-3 px-4 text-center font-bold text-white">{formatCurrency(inv.total)}</td>
                <td className="py-3 px-4 text-center text-green-400">{formatCurrency(inv.paid)}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>{statusLabel(inv.status)}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setViewInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-900/20"><Eye size={14} /></button>
                    <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-900/20"><Printer size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">➕ فاتورة بيع جديدة</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {/* Customer */}
              <div className="relative">
                <label className="form-label">العميل *</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustDrop(true); setCustomerId(''); }}
                      onFocus={() => setShowCustDrop(true)}
                      placeholder="ابحث عن عميل..."
                      className="input-dark w-full"
                    />
                    {showCustDrop && (
                      <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto">
                        {filteredCustomers.slice(0, 8).map(c => (
                          <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); setShowCustDrop(false); }}
                            className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                            {c.name} {c.phone && <span className="text-gray-500 text-xs">({c.phone})</span>}
                          </button>
                        ))}
                        <button onClick={() => { setAddCustomerModal(true); setShowCustDrop(false); }}
                          className="block w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                          + إضافة عميل جديد
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">تاريخ الفاتورة</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input-dark w-full" placeholder="ملاحظات اختيارية..." />
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white text-sm">البنود</h3>
                <button onClick={addItem} className="btn-secondary text-xs flex items-center gap-1"><Plus size={13} /> إضافة بند</button>
              </div>

              <div className="space-y-3">
                {saleItems.map((item, idx) => (
                  <div key={item.id} className="bg-[#252545] border border-violet-900/20 rounded-xl p-3">
                    <div className="grid grid-cols-12 gap-2 items-start">
                      {/* Product Search */}
                      <div className="col-span-12 md:col-span-4 relative">
                        <label className="form-label text-xs">البند</label>
                        <input
                          type="text"
                          value={itemSearch[item.id] || ''}
                          onChange={e => {
                            setItemSearch(prev => ({ ...prev, [item.id]: e.target.value }));
                            setShowItemDrop(prev => ({ ...prev, [item.id]: true }));
                          }}
                          onFocus={() => setShowItemDrop(prev => ({ ...prev, [item.id]: true }))}
                          placeholder="ابحث عن منتج..."
                          className="input-dark w-full text-sm"
                        />
                        {showItemDrop[item.id] && (
                          <div className="absolute top-full mt-1 right-0 left-0 bg-[#1a1a35] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                            {getFilteredProducts(itemSearch[item.id] || '').map(p => (
                              <button key={p.id} onClick={() => selectProduct(item.id, p)}
                                className="block w-full text-right px-3 py-2 text-xs text-gray-300 hover:bg-violet-700/20">
                                <div className="font-medium">{p.name}</div>
                                <div className="text-gray-500">{p.sku} • {formatCurrency(p.salePrice)} • مخزون: {p.stock}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="col-span-4 md:col-span-2">
                        <label className="form-label text-xs">الكمية</label>
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })} className="input-dark w-full text-sm" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="form-label text-xs">سعر الوحدة</label>
                        <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} className="input-dark w-full text-sm" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="form-label text-xs">الخصم (ج.م)</label>
                        <input type="number" value={item.discount} onChange={e => updateItem(item.id, { discount: parseFloat(e.target.value) || 0, discountType: 'fixed' })} className="input-dark w-full text-sm" />
                      </div>
                      <div className="col-span-8 md:col-span-1 flex items-end">
                        <div className="w-full">
                          <label className="form-label text-xs">الإجمالي</label>
                          <div className="text-sm font-bold text-white py-2">{item.total.toLocaleString('ar-EG')}</div>
                        </div>
                      </div>
                      <div className="col-span-4 md:col-span-1 flex items-end pb-2 justify-end">
                        <button onClick={() => setSaleItems(prev => prev.filter(i => i.id !== item.id))} className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20"><X size={14} /></button>
                      </div>
                    </div>

                    {/* Serials */}
                    {item.serials.map((sl, si) => (
                      <div key={si} className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/5">
                        <div>
                          <label className="form-label text-xs">السيريال {si + 1}</label>
                          <input type="text" value={sl.serial} onChange={e => {
                            const newSerials = [...item.serials];
                            newSerials[si] = { ...sl, serial: e.target.value };
                            updateItem(item.id, { serials: newSerials });
                          }} className="input-dark w-full text-xs" placeholder="Serial Number" />
                        </div>
                        <div>
                          <label className="form-label text-xs">IMEI 1</label>
                          <input type="text" value={sl.imei1} onChange={e => {
                            const newSerials = [...item.serials];
                            newSerials[si] = { ...sl, imei1: e.target.value };
                            updateItem(item.id, { serials: newSerials });
                          }} className="input-dark w-full text-xs" />
                        </div>
                        <div>
                          <label className="form-label text-xs">IMEI 2</label>
                          <input type="text" value={sl.imei2} onChange={e => {
                            const newSerials = [...item.serials];
                            newSerials[si] = { ...sl, imei2: e.target.value };
                            updateItem(item.id, { serials: newSerials });
                          }} className="input-dark w-full text-xs" />
                        </div>
                      </div>
                    ))}
                    {item.productId && products.find(p => p.id === item.productId)?.productType === 'serial' && (
                      <button onClick={() => updateItem(item.id, { serials: [...item.serials, { serial: '', imei1: '', imei2: '' }] })}
                        className="mt-2 text-xs text-violet-400 hover:text-violet-300">+ إضافة سيريال آخر</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Totals & Payment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-gray-400">المجموع الفرعي</span>
                  <span className="font-bold text-white">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">خصم إجمالي (ج.م)</span>
                  <input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="input-dark w-28 text-left" />
                </div>
                <div className="flex items-center justify-between py-2 border-t border-violet-700/30">
                  <span className="font-bold text-white text-lg">الإجمالي النهائي</span>
                  <span className="font-black text-violet-400 text-xl">{formatCurrency(totalAfterDiscount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'instapay', 'credit'] as PaymentMethod[]).map(method => (
                      <button key={method} onClick={() => setPaymentMethod(method)}
                        className={`py-2 px-2 rounded-xl border text-xs font-medium transition-colors ${paymentMethod === method ? 'bg-violet-700/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>
                        {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' : method === 'instapay' ? '📱 انستاباي' : '⏳ آجل'}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentMethod === 'instapay' && (
                  <input type="text" value={instapayPerson} onChange={e => setInstapayPerson(e.target.value)} className="input-dark w-full" placeholder="اسم صاحب الاستا باي" />
                )}
                <div>
                  <label className="form-label">المبلغ المدفوع</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)} className="input-dark w-full" placeholder={`من ${formatCurrency(totalAfterDiscount)}`} />
                </div>
                {remaining > 0 && (
                  <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm">
                    <span className="text-red-400">المتبقي: {formatCurrency(remaining)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1">🖨️ حفظ وطباعة</button>
              <button onClick={handleSave} className="btn-secondary flex-1">💾 حفظ فقط</button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📄 {viewInvoice.invoiceNumber}</h2>
              <div className="flex gap-2">
                <button onClick={() => printInvoice(viewInvoice)} className="btn-secondary flex items-center gap-1 text-sm"><Printer size={14} /> طباعة</button>
                <button onClick={() => setViewInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><div className="text-xs text-gray-500">العميل</div><div className="font-bold text-white">{viewInvoice.customerName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
              <div><div className="text-xs text-gray-500">طريقة الدفع</div><div className="font-bold text-white">{paymentMethodLabel(viewInvoice.paymentMethod)}</div></div>
              <div><div className="text-xs text-gray-500">الحالة</div><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(viewInvoice.status)}`}>{statusLabel(viewInvoice.status)}</span></div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead className="bg-violet-900/20">
                <tr>
                  <th className="text-right py-2 px-3 text-gray-400">المنتج</th>
                  <th className="text-center py-2 px-3 text-gray-400">الكمية</th>
                  <th className="text-center py-2 px-3 text-gray-400">السعر</th>
                  <th className="text-center py-2 px-3 text-gray-400">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {viewInvoice.items.map(item => (
                  <React.Fragment key={item.id}>
                    <tr className="border-t border-white/5">
                      <td className="py-2 px-3 text-white">{item.productName}</td>
                      <td className="py-2 px-3 text-center text-gray-300">{item.quantity}</td>
                      <td className="py-2 px-3 text-center text-gray-300">{item.unitPrice.toLocaleString('ar-EG')}</td>
                      <td className="py-2 px-3 text-center font-bold text-white">{item.total.toLocaleString('ar-EG')}</td>
                    </tr>
                    {item.serials?.map((s, i) => (
                      <tr key={i} className="border-t border-white/5 bg-violet-900/10">
                        <td colSpan={4} className="py-1 px-6 text-xs text-gray-500">
                          🔢 {s.serial}{s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}{s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex justify-between text-sm"><span className="text-gray-400">المجموع</span><span className="text-white">{formatCurrency(viewInvoice.subtotal)}</span></div>
              {viewInvoice.discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">الخصم</span><span className="text-red-400">- {formatCurrency(viewInvoice.discount)}</span></div>}
              <div className="flex justify-between font-bold"><span className="text-white">الإجمالي</span><span className="text-violet-400 text-lg">{formatCurrency(viewInvoice.total)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">المدفوع</span><span className="text-green-400">{formatCurrency(viewInvoice.paid)}</span></div>
              {viewInvoice.remaining > 0 && <div className="flex justify-between text-sm"><span className="text-gray-400">المتبقي</span><span className="text-red-400">{formatCurrency(viewInvoice.remaining)}</span></div>}
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {addCustomerModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">➕ إضافة عميل جديد</h3>
            <div className="space-y-3">
              <input type="text" value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="اسم العميل *" />
              <input type="text" value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} className="input-dark w-full" placeholder="رقم الهاتف" />
              <select value={newCustomer.type} onChange={e => setNewCustomer(p => ({ ...p, type: e.target.value as Customer['type'] }))} className="input-dark w-full">
                <option value="individual">فرد</option>
                <option value="company">شركة</option>
                <option value="wholesale">تاجر جملة</option>
                <option value="trader">تاجر</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddCustomer} className="btn-primary flex-1">إضافة</button>
              <button onClick={() => setAddCustomerModal(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
