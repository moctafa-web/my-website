import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PurchaseInvoice, Supplier, Product, SerialItem, InvoiceItem, PaymentMethod, Brand } from '../types';
import { formatCurrency, generateId, getTodayStr, paymentMethodLabel, statusLabel, statusColor, printElement } from '../utils/helpers';
import { Plus, Search, Printer, Eye, X, Trash2, Edit, AlertCircle } from 'lucide-react';

interface Props {
  purchaseInvoices: PurchaseInvoice[];
  suppliers: Supplier[];
  products: Product[];
  serials: SerialItem[];
  brands: Brand[];
  settings: { lastPurchaseInvoiceNum: number; purchasePrefix: string; companyName: string };
  onAddPurchaseInvoice: (inv: PurchaseInvoice) => void;
  onAddSupplier: (s: Supplier) => { success: boolean; message?: string } | void;
  onAddProduct: (p: Product) => { success: boolean; message?: string } | void;
  onAddSerials: (serials: SerialItem[]) => void;
  onUpdatePurchaseInvoice: (inv: PurchaseInvoice) => void;
  onDeletePurchaseInvoice: (invoiceId: string) => void;
  preselectedSupplierId?: string | null;
  onPreselectedHandled?: () => void;
}

interface PurchItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  serials: { serial: string; imei1: string; imei2: string }[];
  total: number;
}

export default function Purchases({
  purchaseInvoices, suppliers, products, serials, brands, settings,
  onAddPurchaseInvoice, onAddSupplier, onAddProduct, onAddSerials,
  onUpdatePurchaseInvoice, onDeletePurchaseInvoice,
  preselectedSupplierId, onPreselectedHandled
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<PurchaseInvoice | null>(null);
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', type: 'supplier' as Supplier['type'] });
  const [showNewProductModal, setShowNewProductModal] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '', sku: '', category: 'phones' as Product['category'],
    brand: 'Apple', productType: 'serial' as Product['productType'],
    costPrice: '', salePrice: ''
  });

  const [formDate, setFormDate] = useState(getTodayStr());
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupDrop, setShowSupDrop] = useState(false);
  const [purchItems, setPurchItems] = useState<PurchItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});
  const [showItemDrop, setShowItemDrop] = useState<Record<string, boolean>>({});
  const [duplicateSerialWarning, setDuplicateSerialWarning] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const serialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getAvailableStock = useCallback((productId: string): number => {
    return serials.filter(s => s.productId === productId && s.status === 'available').length;
  }, [serials]);

  const makeEmptyItem = (): PurchItem => ({
    id: generateId(), productId: '', productName: '', sku: '',
    quantity: 1, unitPrice: 0, discount: 0,
    serials: [{ serial: '', imei1: '', imei2: '' }], total: 0,
  });

  const openNewForm = () => {
    resetForm();
    const firstItem = makeEmptyItem();
    setPurchItems([firstItem]);
    setItemSearch({ [firstItem.id]: '' });
    setShowForm(true);
  };

  const openEditForm = (inv: PurchaseInvoice) => {
    setEditingInvoice(inv);
    setSupplierId(inv.supplierId);
    setSupplierSearch(inv.supplierName);
    setFormDate(inv.date);
    setNotes(inv.notes || '');
    setPaymentMethod(inv.paymentMethod);
    setPaid(String(inv.paid));
    const items: PurchItem[] = inv.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      serials: item.serials && item.serials.length > 0
        ? item.serials.map(s => ({ serial: s.serial, imei1: s.imei1 || '', imei2: s.imei2 || '' }))
        : [{ serial: '', imei1: '', imei2: '' }],
      total: item.total,
    }));
    setPurchItems(items);
    const searches: Record<string, string> = {};
    items.forEach(it => { searches[it.id] = it.productName; });
    setItemSearch(searches);
    setShowForm(true);
  };

  useEffect(() => {
    if (preselectedSupplierId) {
      const supplier = suppliers.find(s => s.id === preselectedSupplierId);
      if (supplier) {
        setSupplierId(supplier.id);
        setSupplierSearch(supplier.name);
      }
      const firstItem = makeEmptyItem();
      setPurchItems([firstItem]);
      setItemSearch({ [firstItem.id]: '' });
      setShowForm(true);
      onPreselectedHandled?.();
    }
  }, [preselectedSupplierId]);

  const filtered = purchaseInvoices.filter(inv => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const supplierName = suppliers.find(s => s.id === inv.supplierId)?.name || '';
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.supplierName.toLowerCase().includes(q) ||
      supplierName.toLowerCase().includes(q)
    );
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone || '').includes(supplierSearch)
  );

  const subtotal = purchItems.reduce((s, item) => s + item.total, 0);
  const paidAmount = parseFloat(paid) || 0;
  const remaining = subtotal - paidAmount;

  const addItem = () => {
    const newItem = makeEmptyItem();
    setPurchItems(prev => [...prev, newItem]);
    setItemSearch(prev => ({ ...prev, [newItem.id]: '' }));
  };

  const existingSerialsSet = new Set(
    serials.map(s => s.serial.trim().toLowerCase()).filter(Boolean)
  );

  const isDuplicateSerial = (serial: string, currentItemId: string, currentIndex: number): boolean => {
    const normalized = serial.trim().toLowerCase();
    if (!normalized) return false;
    for (const item of purchItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.id === currentItemId && i === currentIndex) continue;
        if (item.serials[i].serial.trim().toLowerCase() === normalized) return true;
      }
    }
    if (existingSerialsSet.has(normalized)) {
      if (editingInvoice) {
        const wasInThisInvoice = editingInvoice.items.some(it =>
          it.serials?.some(s => s.serial.trim().toLowerCase() === normalized)
        );
        if (wasInThisInvoice) return false;
      }
      return true;
    }
    return false;
  };

  const updateSerialField = (itemId: string, index: number, field: 'serial' | 'imei1' | 'imei2', value: string) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const ns = [...item.serials];
      ns[index] = { ...ns[index], [field]: value };
      return { ...item, serials: ns };
    }));
    if (field === 'serial') {
      if (value && isDuplicateSerial(value, itemId, index)) {
        setDuplicateSerialWarning(value);
      } else {
        setDuplicateSerialWarning(null);
      }
    }
  };

  const addSerialSlot = (itemId: string, focusAfter = false) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newSerials = [...item.serials, { serial: '', imei1: '', imei2: '' }];
      return {
        ...item, serials: newSerials, quantity: newSerials.length,
        total: Math.max(0, item.unitPrice * newSerials.length - item.discount)
      };
    }));
    if (focusAfter) {
      setTimeout(() => {
        const currentLen = purchItems.find(i => i.id === itemId)?.serials.length || 0;
        serialInputRefs.current[`${itemId}-${currentLen}`]?.focus();
      }, 30);
    }
  };

  const handleSerialKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: string, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const item = purchItems.find(i => i.id === itemId);
    if (!item) return;
    const currentValue = item.serials[index]?.serial || '';
    if (!currentValue.trim()) return;
    if (isDuplicateSerial(currentValue, itemId, index)) return;
    const isLastSlot = index === item.serials.length - 1;
    if (isLastSlot) {
      addSerialSlot(itemId, true);
    } else {
      serialInputRefs.current[`${itemId}-${index + 1}`]?.focus();
    }
  };

  const syncSerialsWithQuantity = (itemId: string, newQuantity: number) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const linkedProduct = products.find(p => p.id === item.productId);
      const isSerialProduct = linkedProduct?.productType === 'serial' || item.serials.length > 0;

      if (!isSerialProduct) {
        return {
          ...item,
          quantity: newQuantity,
          total: Math.max(0, item.unitPrice * newQuantity - item.discount)
        };
      }

      let newSerials = [...item.serials];
      if (newQuantity > newSerials.length) {
        while (newSerials.length < newQuantity) newSerials.push({ serial: '', imei1: '', imei2: '' });
      } else if (newQuantity < newSerials.length && newQuantity >= 1) {
        newSerials = newSerials.slice(0, newQuantity);
      }
      return {
        ...item,
        quantity: newSerials.length,
        serials: newSerials,
        total: Math.max(0, item.unitPrice * newSerials.length - item.discount)
      };
    }));
  };

  const updateItem = (id: string, updates: Partial<PurchItem>) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      updated.total = Math.max(0, updated.unitPrice * updated.quantity - updated.discount);
      return updated;
    }));
  };

  const selectProduct = (itemId: string, product: Product) => {
    updateItem(itemId, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.costPrice,
      serials: product.productType === 'serial' ? [{ serial: '', imei1: '', imei2: '' }] : [],
    });
    setItemSearch(prev => ({ ...prev, [itemId]: product.name }));
    setShowItemDrop(prev => ({ ...prev, [itemId]: false }));
    setValidationError(null);
  };

  const getFilteredProducts = (searchStr: string) => {
    if (!searchStr) return products.slice(0, 10);
    const q = searchStr.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.upc || '').includes(q)
    ).slice(0, 10);
  };

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  // ✅ تحقق إلزامي للسيريالات في فاتورة الشراء
  const validatePurchaseItems = (): string | null => {
    for (const item of purchItems) {
      if (!item.productId) return 'يوجد بند بدون اختيار منتج';

      const product = products.find(p => p.id === item.productId);
      if (!product) continue;

      if (product.productType === 'serial') {
        const filledSerials = item.serials.filter(s => s.serial.trim());

        if (filledSerials.length === 0) {
          return `المنتج "${product.name}" بسيريال، ولا يمكن شراؤه بدون إدخال السيريال`;
        }

        if (filledSerials.length < item.quantity) {
          return `المنتج "${product.name}" يحتاج ${item.quantity} سيريال، والمُدخل حالياً ${filledSerials.length} فقط`;
        }

        for (let i = 0; i < item.serials.length; i++) {
          const sl = item.serials[i];
          if (!sl.serial.trim()) {
            return `أكمل كل السيريالات للمنتج "${product.name}" قبل حفظ الفاتورة`;
          }
          if (isDuplicateSerial(sl.serial, item.id, i)) {
            return `السيريال "${sl.serial}" مكرر أو موجود بالفعل في المخزون`;
          }
        }
      }
    }

    return null;
  };

  const handleSave = () => {
    if (!supplierId || purchItems.length === 0) return;

    setValidationError(null);

    for (const item of purchItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.serials[i].serial && isDuplicateSerial(item.serials[i].serial, item.id, i)) {
          setDuplicateSerialWarning(item.serials[i].serial);
          return;
        }
      }
    }

    const validationMsg = validatePurchaseItems();
    if (validationMsg) {
      setValidationError(validationMsg);
      return;
    }

    const items: InvoiceItem[] = purchItems.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: 'fixed' as const,
      taxRate: 0,
      total: item.total,
      serials: item.serials.filter(s => s.serial),
    }));

    if (editingInvoice) {
      const updatedInvoice: PurchaseInvoice = {
        ...editingInvoice,
        supplierId,
        supplierName: selectedSupplier?.name || '',
        date: formDate,
        items,
        subtotal,
        total: subtotal,
        paid: paidAmount,
        remaining,
        status: remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        paymentMethod,
        notes,
      };
      onUpdatePurchaseInvoice(updatedInvoice);
      resetForm();
      setShowForm(false);
      return;
    }

    const invoiceId = generateId();
    const invoiceNumber = `${settings.purchasePrefix}-${String(settings.lastPurchaseInvoiceNum + 1).padStart(4, '0')}`;
    const newSerials: SerialItem[] = [];

    purchItems.forEach(item => {
      if (item.productId) {
        item.serials.filter(s => s.serial).forEach(sl => {
          newSerials.push({
            id: generateId(),
            productId: item.productId,
            productName: item.productName,
            serial: sl.serial,
            imei1: sl.imei1 || undefined,
            imei2: sl.imei2 || undefined,
            status: 'available',
            purchaseInvoiceId: invoiceId,
            costPrice: item.unitPrice,
            createdAt: new Date().toISOString(),
          });
        });
      }
    });

    const invoice: PurchaseInvoice = {
      id: invoiceId,
      invoiceNumber,
      supplierId,
      supplierName: selectedSupplier?.name || '',
      date: formDate,
      items,
      subtotal,
      taxTotal: 0,
      discount: 0,
      total: subtotal,
      paid: paidAmount,
      remaining,
      status: remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      paymentMethod,
      notes,
      createdAt: new Date().toISOString(),
    };

    onAddPurchaseInvoice(invoice);
    if (newSerials.length > 0) onAddSerials(newSerials);

    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setPurchItems([]);
    setSupplierId('');
    setSupplierSearch('');
    setPaid('');
    setNotes('');
    setPaymentMethod('cash');
    setFormDate(getTodayStr());
    setEditingInvoice(null);
    setDuplicateSerialWarning(null);
    setValidationError(null);
    setItemSearch({});
  };

  const handleDeleteInvoice = () => {
    if (!confirmDeleteInvoice) return;
    onDeletePurchaseInvoice(confirmDeleteInvoice.id);
    setConfirmDeleteInvoice(null);
    setViewInvoice(null);
  };

  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const handleAddSupplier = () => {
    if (!newSupplier.name) return;
    const s: Supplier = {
      id: generateId(), name: newSupplier.name, phone: newSupplier.phone,
      type: newSupplier.type, openingBalance: 0, totalInvoices: 0, totalPaid: 0,
      createdAt: new Date().toISOString()
    };
    const result = onAddSupplier(s);
    if (result && result.success === false) {
      setQuickAddError(result.message || 'هذا المورد موجود بالفعل');
      return;
    }
    setSupplierId(s.id);
    setSupplierSearch(s.name);
    setAddSupplierModal(false);
    setQuickAddError(null);
    setNewSupplier({ name: '', phone: '', type: 'supplier' });
  };

  const handleAddNewProduct = (itemId: string) => {
    if (!newProductForm.name || !newProductForm.sku) return;
    const now = new Date().toISOString();
    const product: Product = {
      id: generateId(),
      name: newProductForm.name,
      sku: newProductForm.sku,
      category: newProductForm.category,
      brand: newProductForm.brand,
      productType: newProductForm.productType,
      costPrice: parseFloat(newProductForm.costPrice) || 0,
      salePrice: parseFloat(newProductForm.salePrice) || 0,
      stock: 0,
      createdAt: now, updatedAt: now,
    };
    const result = onAddProduct(product);
    if (result && result.success === false) {
      setQuickAddError(result.message || 'هذا المنتج موجود بالفعل');
      return;
    }
    selectProduct(itemId, product);
    setShowNewProductModal(null);
    setQuickAddError(null);
    setNewProductForm({ name: '', sku: '', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: '', salePrice: '' });
  };

  const printInvoice = (inv: PurchaseInvoice) => {
    const itemsHtml = inv.items.map(item => `
      <tr>
        <td>${item.productName}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:center">${item.unitPrice.toLocaleString('ar-EG')}</td>
        <td style="text-align:center">${item.total.toLocaleString('ar-EG')}</td>
      </tr>
      ${item.serials?.map(s => `
        <tr><td colspan="4" style="font-size:11px;color:#666;padding-right:20px">
          السيريال: ${s.serial}${s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}${s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}
        </td></tr>`).join('') || ''}
    `).join('');
    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info">
          <div><strong>فاتورة مشتريات</strong></div>
          <div>رقم: ${inv.invoiceNumber}</div>
          <div>التاريخ: ${inv.date}</div>
          <div>المورد: ${inv.supplierName}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="totals"><table>
        <tr class="total-row"><td>الإجمالي</td><td>${inv.total.toLocaleString('ar-EG')} ج.م</td></tr>
        <tr><td>المدفوع</td><td>${inv.paid.toLocaleString('ar-EG')} ج.م</td></tr>
        ${inv.remaining > 0 ? `<tr><td>المتبقي</td><td>${inv.remaining.toLocaleString('ar-EG')} ج.م</td></tr>` : ''}
      </table></div>
    `);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">📦 المشتريات</h2>
          <p className="text-gray-500 text-sm">{purchaseInvoices.length} فاتورة</p>
        </div>
        <button onClick={openNewForm} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> فاتورة شراء جديدة
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث برقم الفاتورة أو اسم المورد..."
          className="input-dark w-full pr-9"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.total, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المشتريات</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.paid, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المدفوع</div>
        </div>
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.remaining, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المتبقي</div>
        </div>
      </div>

      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">رقم الفاتورة</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">المورد</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">التاريخ</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">الإجمالي</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">المدفوع</th>
              <th className="text-center py-3 px-4 text-gray-400 font-medium">الحالة</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">لا توجد فواتير مشتريات بعد</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                onClick={() => setViewInvoice(inv)}>
                <td className="py-3 px-4 font-mono text-blue-400 text-sm">{inv.invoiceNumber}</td>
                <td className="py-3 px-4 text-white">{inv.supplierName}</td>
                <td className="py-3 px-4 text-center text-gray-400 text-xs">{inv.date}</td>
                <td className="py-3 px-4 text-center font-bold text-white">{formatCurrency(inv.total)}</td>
                <td className="py-3 px-4 text-center text-green-400">{formatCurrency(inv.paid)}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>
                    {statusLabel(inv.status)}
                  </span>
                </td>
                <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setViewInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400" title="عرض"><Eye size={14} /></button>
                    <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-400" title="طباعة"><Printer size={14} /></button>
                    <button onClick={() => { openEditForm(inv); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400" title="تعديل"><Edit size={14} /></button>
                    <button onClick={() => setConfirmDeleteInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400" title="حذف"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">
                📦 {editingInvoice ? `تعديل فاتورة ${editingInvoice.invoiceNumber}` : 'فاتورة شراء جديدة'}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="relative">
                <label className="form-label">المورد *</label>
                <input
                  type="text" value={supplierSearch}
                  onChange={e => { setSupplierSearch(e.target.value); setShowSupDrop(true); setSupplierId(''); }}
                  onFocus={() => setShowSupDrop(true)}
                  placeholder="ابحث عن مورد..."
                  className="input-dark w-full"
                />
                {showSupDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                    {filteredSuppliers.slice(0, 8).map(s => (
                      <button key={s.id}
                        onClick={() => { setSupplierId(s.id); setSupplierSearch(s.name); setShowSupDrop(false); }}
                        className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                        {s.name}
                      </button>
                    ))}
                    <button onClick={() => { setAddSupplierModal(true); setShowSupDrop(false); setQuickAddError(null); }}
                      className="block w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                      + إضافة مورد جديد
                    </button>
                  </div>
                )}
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

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white text-sm">المنتجات المشتراة</h3>
                <button onClick={addItem} className="btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> إضافة منتج
                </button>
              </div>

              <div className="space-y-4">
                {purchItems.map((item) => {
                  const linkedProduct = products.find(p => p.id === item.productId);
                  const isSerialProduct = linkedProduct?.productType === 'serial';

                  return (
                    <div key={item.id} className={`bg-[#252545] border rounded-xl p-4 ${
                      isSerialProduct ? 'border-blue-700/30' : 'border-violet-900/20'
                    }`}>
                      <div className="grid grid-cols-12 gap-2 items-end mb-3">
                        <div className="col-span-12 md:col-span-5 relative">
                          <label className="form-label text-xs">المنتج</label>
                          <input
                            type="text" value={itemSearch[item.id] || ''}
                            onChange={e => {
                              setItemSearch(prev => ({ ...prev, [item.id]: e.target.value }));
                              setShowItemDrop(prev => ({ ...prev, [item.id]: true }));
                            }}
                            onFocus={() => setShowItemDrop(prev => ({ ...prev, [item.id]: true }))}
                            placeholder="ابحث أو أكتب SKU..."
                            className="input-dark w-full text-sm"
                          />
                          {showItemDrop[item.id] && (
                            <div className="absolute top-full mt-1 right-0 left-0 bg-[#1a1a35] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                              {getFilteredProducts(itemSearch[item.id] || '').map(p => (
                                <button key={p.id} onClick={() => selectProduct(item.id, p)}
                                  className="block w-full text-right px-3 py-2 text-xs text-gray-300 hover:bg-violet-700/20">
                                  <div className="font-medium">{p.name}</div>
                                  <div className="text-gray-500">
                                    {p.sku} • مخزون متاح: {getAvailableStock(p.id)}
                                    {p.productType === 'serial' && <span className="text-blue-400 mr-2">• منتج بسيريال</span>}
                                  </div>
                                </button>
                              ))}
                              <button
                                onClick={() => { setShowNewProductModal(item.id); setShowItemDrop(prev => ({ ...prev, [item.id]: false })); setQuickAddError(null); }}
                                className="block w-full text-right px-3 py-2 text-xs text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                                + إضافة منتج جديد
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">الكمية</label>
                          <input type="number" min="1" value={item.quantity}
                            onChange={e => syncSerialsWithQuantity(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                            className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">سعر الشراء</label>
                          <input type="number" value={item.unitPrice}
                            onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-3 md:col-span-2 flex items-end">
                          <div className="w-full">
                            <label className="form-label text-xs">الإجمالي</label>
                            <div className="text-sm font-bold text-white py-2">{item.total.toLocaleString('ar-EG')}</div>
                          </div>
                        </div>
                        <div className="col-span-1 flex items-end pb-1 justify-end">
                          <button onClick={() => setPurchItems(prev => prev.filter(i => i.id !== item.id))}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20"><X size={14} /></button>
                        </div>
                      </div>

                      {isSerialProduct && (
                        <div className="mb-3 flex items-center gap-2 bg-blue-900/10 border border-blue-700/20 rounded-lg px-3 py-2">
                          <AlertCircle size={14} className="text-blue-400 shrink-0" />
                          <span className="text-xs text-blue-300">
                            هذا المنتج <strong>بسيريال</strong> — إدخال السيريالات إلزامي ولن يتم حفظ الفاتورة بدونها
                          </span>
                        </div>
                      )}

                      {(linkedProduct?.productType === 'serial' || item.serials.length > 0) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-400 font-medium">
                              السيريالات ({item.serials.filter(s => s.serial).length} / {item.quantity}):
                            </div>
                            <div className="text-xs text-violet-400">
                              💡 اضغط Enter بعد كل سيريال للانتقال للتالي
                            </div>
                          </div>
                          {item.serials.map((sl, si) => {
                            const isDup = sl.serial ? isDuplicateSerial(sl.serial, item.id, si) : false;
                            return (
                              <div key={si}>
                                <div className="grid grid-cols-3 gap-2">
                                  <input
                                    ref={el => { serialInputRefs.current[`${item.id}-${si}`] = el; }}
                                    type="text" value={sl.serial}
                                    onChange={e => updateSerialField(item.id, si, 'serial', e.target.value)}
                                    onKeyDown={e => handleSerialKeyDown(e, item.id, si)}
                                    className={`input-dark w-full text-xs font-mono ${isDup ? 'border-red-500/60 bg-red-900/10' : ''}`}
                                    placeholder={`Serial ${si + 1}`}
                                  />
                                  <input type="text" value={sl.imei1}
                                    onChange={e => updateSerialField(item.id, si, 'imei1', e.target.value)}
                                    className="input-dark w-full text-xs" placeholder="IMEI 1" />
                                  <div className="flex gap-1">
                                    <input type="text" value={sl.imei2}
                                      onChange={e => updateSerialField(item.id, si, 'imei2', e.target.value)}
                                      className="input-dark flex-1 text-xs" placeholder="IMEI 2" />
                                    {item.serials.length > 1 && (
                                      <button onClick={() => {
                                        const newSerials = item.serials.filter((_, i) => i !== si);
                                        updateItem(item.id, { serials: newSerials, quantity: newSerials.length });
                                      }} className="p-1 text-red-400 hover:text-red-300"><X size={12} /></button>
                                    )}
                                  </div>
                                </div>
                                {isDup && (
                                  <div className="text-xs text-red-400 mt-1">
                                    ⚠️ هذا السيريال موجود بالفعل
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <button onClick={() => addSerialSlot(item.id, true)}
                            className="text-xs text-violet-400 hover:text-violet-300">
                            + إضافة سيريال آخر
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-t border-white/10 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">الإجمالي</span>
                  <span className="font-bold text-white text-lg">{formatCurrency(subtotal)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'credit'] as PaymentMethod[]).map(method => (
                      <button key={method} onClick={() => setPaymentMethod(method)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                          paymentMethod === method
                            ? 'bg-violet-700/30 border-violet-500/50 text-violet-300'
                            : 'border-white/10 text-gray-400'
                        }`}>
                        {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' : '⏳ آجل'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">المبلغ المدفوع</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)}
                    className="input-dark w-full" placeholder={`من ${formatCurrency(subtotal)}`} />
                </div>
                {remaining > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2 text-sm">
                    <span className="text-yellow-400">⏳ متبقي: {formatCurrency(remaining)}</span>
                  </div>
                )}
              </div>
            </div>

            {duplicateSerialWarning && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-4 text-red-400">
                ⚠️ السيريال "{duplicateSerialWarning}" مكرر أو موجود بالفعل في المخزون.
              </div>
            )}

            {validationError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-4 text-red-400 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {validationError}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1">
                💾 {editingInvoice ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">➕ إضافة منتج جديد سريع</h3>
            <div className="space-y-3">
              <input type="text" value={newProductForm.name}
                onChange={e => setNewProductForm(p => ({ ...p, name: e.target.value }))}
                className="input-dark w-full" placeholder="اسم المنتج *" />
              <input type="text" value={newProductForm.sku}
                onChange={e => setNewProductForm(p => ({ ...p, sku: e.target.value }))}
                className="input-dark w-full" placeholder="SKU *" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newProductForm.category}
                  onChange={e => setNewProductForm(p => ({ ...p, category: e.target.value as Product['category'] }))}
                  className="input-dark w-full">
                  <option value="phones">موبايلات</option>
                  <option value="tablets">تابلت</option>
                  <option value="laptops">لابتوب</option>
                  <option value="accessories">إكسسوارات</option>
                  <option value="other">أخرى</option>
                </select>
                <select value={newProductForm.brand}
                  onChange={e => setNewProductForm(p => ({ ...p, brand: e.target.value }))}
                  className="input-dark w-full">
                  <option>Apple</option><option>Samsung</option><option>DJI</option><option>Others</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setNewProductForm(p => ({ ...p, productType: 'serial' }))}
                  className={`py-2 rounded-xl border text-xs ${newProductForm.productType === 'serial' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>
                  🔢 بسيريال
                </button>
                <button onClick={() => setNewProductForm(p => ({ ...p, productType: 'normal' }))}
                  className={`py-2 rounded-xl border text-xs ${newProductForm.productType === 'normal' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>
                  📦 عادي
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={newProductForm.costPrice}
                  onChange={e => setNewProductForm(p => ({ ...p, costPrice: e.target.value }))}
                  className="input-dark w-full" placeholder="سعر الشراء" />
                <input type="number" value={newProductForm.salePrice}
                  onChange={e => setNewProductForm(p => ({ ...p, salePrice: e.target.value }))}
                  className="input-dark w-full" placeholder="سعر البيع" />
              </div>
            </div>
            {quickAddError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {quickAddError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleAddNewProduct(showNewProductModal)} className="btn-primary flex-1">إضافة وتحديد</button>
              <button onClick={() => { setShowNewProductModal(null); setQuickAddError(null); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {viewInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📄 {viewInvoice.invoiceNumber}</h2>
              <div className="flex gap-2">
                <button onClick={() => { openEditForm(viewInvoice); setViewInvoice(null); }}
                  className="btn-secondary flex items-center gap-1 text-sm">
                  <Edit size={14} /> تعديل
                </button>
                <button onClick={() => printInvoice(viewInvoice)}
                  className="btn-secondary flex items-center gap-1 text-sm">
                  <Printer size={14} /> طباعة
                </button>
                <button onClick={() => setViewInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><div className="text-xs text-gray-500">المورد</div><div className="font-bold text-white">{viewInvoice.supplierName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
              <div><div className="text-xs text-gray-500">طريقة الدفع</div><div className="text-gray-300">{paymentMethodLabel(viewInvoice.paymentMethod)}</div></div>
              <div>
                <div className="text-xs text-gray-500">الحالة</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(viewInvoice.status)}`}>
                  {statusLabel(viewInvoice.status)}
                </span>
              </div>
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
                      <td className="py-2 px-3 text-center text-gray-300">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2 px-3 text-center font-bold text-white">{formatCurrency(item.total)}</td>
                    </tr>
                    {item.serials?.map((s, i) => (
                      <tr key={i} className="bg-violet-900/10">
                        <td colSpan={4} className="py-1 px-6 text-xs text-gray-500 font-mono">
                          🔢 {s.serial}{s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}{s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t border-white/10 pt-3">
              <div className="flex justify-between font-bold">
                <span className="text-white">الإجمالي</span>
                <span className="text-blue-400 text-lg">{formatCurrency(viewInvoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">المدفوع</span>
                <span className="text-green-400">{formatCurrency(viewInvoice.paid)}</span>
              </div>
              {viewInvoice.remaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">المتبقي</span>
                  <span className="text-red-400">{formatCurrency(viewInvoice.remaining)}</span>
                </div>
              )}
              {viewInvoice.notes && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <span className="text-gray-500 text-xs">ملاحظات: </span>
                  <span className="text-gray-300 text-xs">{viewInvoice.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {addSupplierModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">➕ إضافة مورد جديد</h3>
            <div className="space-y-3">
              <input type="text" value={newSupplier.name}
                onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))}
                className="input-dark w-full" placeholder="اسم المورد *" />
              <input type="text" value={newSupplier.phone}
                onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))}
                className="input-dark w-full" placeholder="رقم الهاتف" />
              <select value={newSupplier.type}
                onChange={e => setNewSupplier(p => ({ ...p, type: e.target.value as Supplier['type'] }))}
                className="input-dark w-full">
                <option value="supplier">مورد</option>
                <option value="trader">تاجر</option>
                <option value="both">مورد وتاجر</option>
              </select>
            </div>
            {quickAddError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {quickAddError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddSupplier} className="btn-primary flex-1">إضافة</button>
              <button onClick={() => { setAddSupplierModal(false); setQuickAddError(null); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteInvoice && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف فاتورة الشراء</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل أنت متأكد من حذف فاتورة{' '}
              <span className="text-white font-medium font-mono">{confirmDeleteInvoice.invoiceNumber}</span>؟
              <br />
              سيتم خصم الكمية من المخزون وحذف السيريالات المرتبطة وتصحيح رصيد المورد والخزينة تلقائيًا.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteInvoice}
                className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">
                🗑️ تأكيد الحذف
              </button>
              <button
                onClick={() => setConfirmDeleteInvoice(null)}
                className="btn-secondary flex-1">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}