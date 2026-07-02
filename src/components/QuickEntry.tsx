import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Product, Customer, Supplier, SaleInvoice, PurchaseInvoice, NoonOrder,
  SerialItem, InvoiceItem, PaymentMethod, AppSettings,
} from '../types';
import { formatCurrency, generateId, getTodayStr, normalizeForCompare } from '../utils/helpers';
import { X, Zap, ShoppingCart, PackagePlus, Truck, Plus, Trash2, Check } from 'lucide-react';

interface Props {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  serials: SerialItem[];
  saleInvoices: SaleInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  settings: AppSettings;
  onAddSaleInvoice: (invoice: SaleInvoice) => void;
  onAddPurchaseInvoice: (invoice: PurchaseInvoice) => void;
  onAddNoonOrder: (order: NoonOrder) => { success: boolean; message?: string; merged?: boolean };
  onAddCustomer: (c: Customer) => { success: boolean; message?: string } | void;
  onAddSupplier: (s: Supplier) => { success: boolean; message?: string } | void;
  onAddSerials: (serials: SerialItem[]) => void;
  onClose: () => void;
}

type Mode = 'sale' | 'purchase' | 'noon';

interface QuickLine {
  rowId: string;
  productId: string;
  productName: string;
  search: string;
  quantity: string;
  unitPrice: string;
  selectedSerialId: string; // for sale of serial-type products
  serialInput: string;      // for purchase of serial-type products
  imei1Input: string;
}

const emptyLine = (): QuickLine => ({
  rowId: generateId(), productId: '', productName: '', search: '',
  quantity: '1', unitPrice: '', selectedSerialId: '', serialInput: '', imei1Input: '',
});

const CASH_CUSTOMER_NAME = 'عميل نقدي';

export default function QuickEntry({
  products, customers, suppliers, serials, saleInvoices, purchaseInvoices, settings,
  onAddSaleInvoice, onAddPurchaseInvoice, onAddNoonOrder, onAddCustomer, onAddSupplier, onAddSerials,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [lines, setLines] = useState<QuickLine[]>([emptyLine()]);
  const [partyName, setPartyName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paid, setPaid] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [activeDropdownRow, setActiveDropdownRow] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (mode) setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [mode]);

  const resetEntryFields = () => {
    setLines([emptyLine()]);
    setPartyName('');
    setPaymentMethod('cash');
    setPaid('');
    setOrderNumber('');
    setError(null);
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  };

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = parseFloat(l.quantity) || 0;
      const p = parseFloat(l.unitPrice) || 0;
      return sum + q * p;
    }, 0);
  }, [lines]);

  const productSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8);
  };

  const updateLine = (rowId: string, patch: Partial<QuickLine>) => {
    setLines(prev => prev.map(l => (l.rowId === rowId ? { ...l, ...patch } : l)));
  };

  const selectProduct = (rowId: string, product: Product) => {
    const price = mode === 'purchase' ? product.costPrice : product.salePrice;
    const availableSerials = serials.filter(s => s.productId === product.id && s.status === 'available');
    updateLine(rowId, {
      productId: product.id,
      productName: product.name,
      search: product.name,
      unitPrice: String(price || ''),
      selectedSerialId: mode === 'sale' && availableSerials.length === 1 ? availableSerials[0].id : '',
    });
    setActiveDropdownRow(null);
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (rowId: string) => setLines(prev => (prev.length > 1 ? prev.filter(l => l.rowId !== rowId) : prev));

  const resolveCustomer = (name: string): { id: string; name: string } => {
    const trimmed = name.trim() || CASH_CUSTOMER_NAME;
    const existing = customers.find(c => normalizeForCompare(c.name) === normalizeForCompare(trimmed));
    if (existing) return { id: existing.id, name: existing.name };
    const newCustomer: Customer = {
      id: generateId(), name: trimmed, type: 'individual', openingBalance: 0,
      totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString(),
    };
    onAddCustomer(newCustomer);
    return { id: newCustomer.id, name: newCustomer.name };
  };

  const resolveSupplier = (name: string): { id: string; name: string } | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = suppliers.find(s => normalizeForCompare(s.name) === normalizeForCompare(trimmed));
    if (existing) return { id: existing.id, name: existing.name };
    const newSupplier: Supplier = {
      id: generateId(), name: trimmed, type: 'supplier', openingBalance: 0,
      totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString(),
    };
    onAddSupplier(newSupplier);
    return { id: newSupplier.id, name: newSupplier.name };
  };

  const validLines = () => lines.filter(l => l.productId && (parseFloat(l.quantity) || 0) > 0);

  const handleSaveSale = () => {
    const valid = validLines();
    if (valid.length === 0) { setError('اختار منتج واحد على الأقل'); return; }

    for (const l of valid) {
      const product = products.find(p => p.id === l.productId);
      if (product?.productType === 'serial' && !l.selectedSerialId) {
        setError(`لازم تختار سيريال لـ "${product.name}"`);
        return;
      }
    }

    const party = resolveCustomer(partyName);
    const existingNumbers = saleInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextNum = Math.max(settings.lastSaleInvoiceNum, ...existingNumbers, 1000) + 1;
    const invoiceNumber = `${settings.invoicePrefix}-${String(nextNum).padStart(4, '0')}`;

    const items: InvoiceItem[] = valid.map(l => {
      const product = products.find(p => p.id === l.productId)!;
      const qty = parseFloat(l.quantity) || 1;
      const price = parseFloat(l.unitPrice) || 0;
      const serial = product.productType === 'serial' ? serials.find(s => s.id === l.selectedSerialId) : null;
      return {
        id: generateId(), productId: product.id, productName: product.name, sku: product.sku,
        quantity: qty, unitPrice: price, discount: 0, discountType: 'fixed', taxRate: 0,
        total: qty * price,
        serials: serial ? [{ serial: serial.serial, imei1: serial.imei1, imei2: serial.imei2 }] : undefined,
      };
    });

    const invoiceTotal = items.reduce((s, i) => s + i.total, 0);
    const paidAmount = paid.trim() === '' ? invoiceTotal : (parseFloat(paid) || 0);
    const invoice: SaleInvoice = {
      id: generateId(), invoiceNumber, customerId: party.id, customerName: party.name,
      date: getTodayStr(), items, subtotal: invoiceTotal, taxTotal: 0, discount: 0,
      total: invoiceTotal, paid: paidAmount, remaining: Math.max(0, invoiceTotal - paidAmount),
      status: paidAmount >= invoiceTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      paymentMethod, notes: '', createdAt: new Date().toISOString(),
    };

    onAddSaleInvoice(invoice);
    setFlash(`✅ اتسجل بيع ${invoiceNumber} — ${formatCurrency(invoiceTotal)}`);
    setSavedCount(c => c + 1);
    resetEntryFields();
  };

  const handleSavePurchase = () => {
    const valid = validLines();
    if (valid.length === 0) { setError('اختار منتج واحد على الأقل'); return; }

    for (const l of valid) {
      const product = products.find(p => p.id === l.productId);
      const qty = parseFloat(l.quantity) || 0;
      if (product?.productType === 'serial' && qty > 1) {
        setError(`"${product.name}" منتج بسيريال — سجل كل وحدة لوحدها (كمية 1) في الإدخال السريع`);
        return;
      }
      if (product?.productType === 'serial' && !l.serialInput.trim()) {
        setError(`لازم تكتب السيريال/IMEI لـ "${product.name}"`);
        return;
      }
    }

    const party = resolveSupplier(partyName);
    if (!party) { setError('اكتب اسم المورد/التاجر'); return; }

    const existingNumbers = purchaseInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextNum = Math.max(settings.lastPurchaseInvoiceNum, ...existingNumbers, 1000) + 1;
    const invoiceNumber = `${settings.purchasePrefix}-${String(nextNum).padStart(4, '0')}`;
    const invoiceId = generateId();

    const newSerials: SerialItem[] = [];
    const items: InvoiceItem[] = valid.map(l => {
      const product = products.find(p => p.id === l.productId)!;
      const qty = parseFloat(l.quantity) || 1;
      const price = parseFloat(l.unitPrice) || 0;
      if (product.productType === 'serial') {
        newSerials.push({
          id: generateId(), productId: product.id, productName: product.name,
          serial: l.serialInput.trim(), imei1: l.imei1Input.trim() || undefined,
          status: 'available', purchaseInvoiceId: invoiceId, costPrice: price,
          purchasePricePending: price === 0, createdAt: new Date().toISOString(),
        });
      }
      return {
        id: generateId(), productId: product.id, productName: product.name, sku: product.sku,
        quantity: qty, unitPrice: price, discount: 0, discountType: 'fixed', taxRate: 0,
        total: qty * price,
      };
    });

    const invoiceTotal = items.reduce((s, i) => s + i.total, 0);
    const paidAmount = paid.trim() === '' ? invoiceTotal : (parseFloat(paid) || 0);
    const invoice: PurchaseInvoice = {
      id: invoiceId, invoiceNumber, supplierId: party.id, supplierName: party.name,
      date: getTodayStr(), items, subtotal: invoiceTotal, taxTotal: 0, discount: 0,
      total: invoiceTotal, paid: paidAmount, remaining: Math.max(0, invoiceTotal - paidAmount),
      status: invoiceTotal === 0 ? 'unpaid' : paidAmount >= invoiceTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      paymentMethod, notes: '', createdAt: new Date().toISOString(),
    };

    onAddPurchaseInvoice(invoice);
    if (newSerials.length > 0) onAddSerials(newSerials);
    setFlash(`✅ اتسجل شراء ${invoiceNumber} — ${formatCurrency(invoiceTotal)}`);
    setSavedCount(c => c + 1);
    resetEntryFields();
  };

  const handleSaveNoon = () => {
    const valid = validLines();
    if (!orderNumber.trim()) { setError('اكتب رقم الأوردر'); return; }
    if (valid.length === 0) { setError('اختار منتج واحد على الأقل'); return; }

    const order: NoonOrder = {
      id: generateId(), orderNumber: orderNumber.trim(), platform: 'noon',
      date: getTodayStr(),
      items: valid.map(l => {
        const product = products.find(p => p.id === l.productId)!;
        return {
          productId: product.id, productName: product.name,
          price: parseFloat(l.unitPrice) || 0, costPrice: product.costPrice,
        };
      }),
      status: 'pending', createdAt: new Date().toISOString(),
    };

    const result = onAddNoonOrder(order);
    if (result.success === false) { setError(result.message || 'حصل خطأ'); return; }
    setFlash(result.merged ? `✅ اتضاف الصنف لأوردر ${orderNumber} الموجود` : `✅ اتسجل أوردر نون ${orderNumber}`);
    setSavedCount(c => c + 1);
    resetEntryFields();
  };

  const handleSave = () => {
    setError(null);
    if (mode === 'sale') handleSaveSale();
    else if (mode === 'purchase') handleSavePurchase();
    else if (mode === 'noon') handleSaveNoon();
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const modeConfig = {
    sale: { label: 'بيع سريع', icon: ShoppingCart, color: 'green' },
    purchase: { label: 'شراء سريع', icon: PackagePlus, color: 'blue' },
    noon: { label: 'أوردر نون سريع', icon: Truck, color: 'violet' },
  } as const;

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div
        className="bg-[#1a1a35] border border-violet-700/40 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" />
            <h3 className="font-bold text-white">
              {mode ? modeConfig[mode].label : 'إدخال سريع'}
            </h3>
            {savedCount > 0 && (
              <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">
                سجّلت {savedCount} النهارده
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {mode && (
              <button
                onClick={() => { setMode(null); resetEntryFields(); }}
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10"
              >
                تغيير النوع
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {/* Mode selection screen */}
          {!mode && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(Object.keys(modeConfig) as Mode[]).map(m => {
                const cfg = modeConfig[m];
                const Icon = cfg.icon;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-violet-700/20 hover:border-violet-600/40 transition-colors"
                  >
                    <Icon size={26} className="text-violet-400" />
                    <span className="text-white font-medium text-sm">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {mode && (
            <div className="space-y-4">
              {flash && (
                <div className="bg-green-900/30 border border-green-700/40 text-green-300 text-sm rounded-xl px-3 py-2 flex items-center gap-2">
                  <Check size={16} /> {flash}
                </div>
              )}
              {error && (
                <div className="bg-red-900/30 border border-red-700/40 text-red-300 text-sm rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              {/* Party name */}
              {mode !== 'noon' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">
                    {mode === 'sale' ? 'العميل (سيبها فاضية = عميل نقدي)' : 'المورد / التاجر'}
                  </label>
                  <input
                    ref={firstFieldRef}
                    type="text"
                    value={partyName}
                    onChange={e => setPartyName(e.target.value)}
                    list={mode === 'sale' ? 'qe-customers' : 'qe-suppliers'}
                    placeholder={mode === 'sale' ? CASH_CUSTOMER_NAME : 'اسم المورد'}
                    className="w-full bg-[#252545] border border-violet-900/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500"
                  />
                  <datalist id="qe-customers">
                    {customers.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                  <datalist id="qe-suppliers">
                    {suppliers.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
              )}

              {mode === 'noon' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">رقم الأوردر</label>
                  <input
                    ref={firstFieldRef}
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="رقم أوردر نون"
                    className="w-full bg-[#252545] border border-violet-900/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500"
                  />
                </div>
              )}

              {/* Items */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 block">الأصناف</label>
                {lines.map(line => {
                  const suggestions = activeDropdownRow === line.rowId ? productSuggestions(line.search) : [];
                  const product = products.find(p => p.id === line.productId);
                  const isSerialProduct = product?.productType === 'serial';
                  const availableSerials = product ? serials.filter(s => s.productId === product.id && s.status === 'available') : [];

                  return (
                    <div key={line.rowId} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={line.search}
                            onChange={e => { updateLine(line.rowId, { search: e.target.value, productId: '' }); setActiveDropdownRow(line.rowId); }}
                            onFocus={() => setActiveDropdownRow(line.rowId)}
                            placeholder="دور على منتج بالاسم أو SKU..."
                            className="w-full bg-[#252545] border border-violet-900/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-violet-500"
                          />
                          {suggestions.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-[#1f1f40] border border-violet-700/40 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {suggestions.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => selectProduct(line.rowId, p)}
                                  className="w-full text-right px-3 py-2 text-sm text-white hover:bg-violet-700/20 flex justify-between"
                                >
                                  <span>{p.name}</span>
                                  <span className="text-gray-500 text-xs">{p.sku} • مخزون {p.stock}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(line.rowId)} className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg flex-shrink-0">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      {product && (
                        <div className="flex flex-wrap gap-2 items-center">
                          {!isSerialProduct && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">كمية</span>
                              <input
                                type="number"
                                value={line.quantity}
                                onChange={e => updateLine(line.rowId, { quantity: e.target.value })}
                                className="w-16 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1.5 text-white text-sm text-center outline-none"
                                min={1}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">السعر</span>
                            <input
                              type="number"
                              value={line.unitPrice}
                              onChange={e => updateLine(line.rowId, { unitPrice: e.target.value })}
                              className="w-24 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1.5 text-white text-sm text-center outline-none"
                            />
                          </div>

                          {mode === 'sale' && isSerialProduct && (
                            availableSerials.length > 0 ? (
                              <select
                                value={line.selectedSerialId}
                                onChange={e => updateLine(line.rowId, { selectedSerialId: e.target.value })}
                                className="bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1.5 text-white text-xs outline-none flex-1 min-w-[140px]"
                              >
                                <option value="">اختار سيريال</option>
                                {availableSerials.map(s => (
                                  <option key={s.id} value={s.id}>{s.serial}{s.imei1 ? ` • ${s.imei1}` : ''}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-red-400">⚠️ مفيش سيريالات متاحة لهذا المنتج</span>
                            )
                          )}

                          {mode === 'purchase' && isSerialProduct && (
                            <>
                              <input
                                type="text"
                                value={line.serialInput}
                                onChange={e => updateLine(line.rowId, { serialInput: e.target.value })}
                                placeholder="السيريال"
                                className="w-28 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1.5 text-white text-xs outline-none"
                              />
                              <input
                                type="text"
                                value={line.imei1Input}
                                onChange={e => updateLine(line.rowId, { imei1Input: e.target.value })}
                                placeholder="IMEI (اختياري)"
                                className="w-28 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1.5 text-white text-xs outline-none"
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button onClick={addLine} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 px-1">
                  <Plus size={14} /> إضافة صنف تاني
                </button>
              </div>

              {/* Payment (sale/purchase only) */}
              {mode !== 'noon' && (
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">طريقة الدفع</label>
                    <div className="flex gap-1">
                      {(['cash', 'bank', 'instapay', 'credit'] as PaymentMethod[]).map(pm => (
                        <button
                          key={pm}
                          onClick={() => setPaymentMethod(pm)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs border ${
                            paymentMethod === pm
                              ? 'bg-violet-700/30 border-violet-500 text-violet-200'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          {pm === 'cash' ? 'كاش' : pm === 'bank' ? 'تحويل' : pm === 'instapay' ? 'انستاباي' : 'آجل'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">المدفوع (فاضي = دفع الكل)</label>
                    <input
                      type="number"
                      value={paid}
                      onChange={e => setPaid(e.target.value)}
                      placeholder={String(total)}
                      className="w-32 bg-[#252545] border border-violet-900/30 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                    />
                  </div>
                  <div className="text-sm text-gray-300 mr-auto">
                    الإجمالي: <span className="font-bold text-white">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {mode && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-gray-600">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded">Esc</kbd> للإغلاق
            </span>
            <button onClick={handleSave} className="btn-primary text-sm px-6">
              حفظ ({formatCurrency(total)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
