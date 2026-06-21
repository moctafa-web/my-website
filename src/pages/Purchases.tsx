import React, { useState, useEffect, useRef } from 'react';
import { PurchaseInvoice, Supplier, Product, SerialItem, InvoiceItem, PaymentMethod, Brand } from '../types';
import { formatCurrency, generateId, getTodayStr, paymentMethodLabel, statusLabel, statusColor, printElement } from '../utils/helpers';
import { Plus, Search, Printer, Eye, X, Trash2, Edit } from 'lucide-react';

interface Props {
  purchaseInvoices: PurchaseInvoice[];
  suppliers: Supplier[];
  products: Product[];
  serials: SerialItem[];
  brands: Brand[];
  settings: { lastPurchaseInvoiceNum: number; purchasePrefix: string; companyName: string };
  onAddPurchaseInvoice: (inv: PurchaseInvoice) => void;
  onAddSupplier: (s: Supplier) => void;
  onAddProduct: (p: Product) => void;
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
  isNew?: boolean;
  newProductData?: Partial<Product>;
}

export default function Purchases({ purchaseInvoices, suppliers, products, serials, brands, settings, onAddPurchaseInvoice, onAddSupplier, onAddProduct, onAddSerials, onUpdatePurchaseInvoice, onDeletePurchaseInvoice, preselectedSupplierId, onPreselectedHandled }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<PurchaseInvoice | null>(null);
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', type: 'supplier' as Supplier['type'] });
  const [showNewProductModal, setShowNewProductModal] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({ name: '', sku: '', category: 'phones' as Product['category'], brand: 'Apple', productType: 'serial' as Product['productType'], costPrice: '', salePrice: '' });

  // Form state
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
  // مراجع حقول السيريال للتركيز التلقائي على الخانة التالية عند الإدخال المتتابع بالباركود
  const serialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const makeEmptyItem = (): PurchItem => ({
    id: generateId(), productId: '', productName: '', sku: '', quantity: 1, unitPrice: 0, discount: 0,
    serials: [{ serial: '', imei1: '', imei2: '' }], total: 0,
  });

  // فتح فورم فاتورة جديدة: يبدأ بسطر منتج واحد جاهز للتعبئة فورًا (بدل فورم فاضي تمامًا)
  const openNewForm = () => {
    resetForm();
    const firstItem = makeEmptyItem();
    setPurchItems([firstItem]);
    setItemSearch({ [firstItem.id]: '' });
    setShowForm(true);
  };

  // فتح فورم تعديل فاتورة موجودة: يحمّل كل بياناتها في نفس الفورم
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
      serials: item.serials && item.serials.length > 0 ? item.serials.map(s => ({ serial: s.serial, imei1: s.imei1 || '', imei2: s.imei2 || '' })) : [{ serial: '', imei1: '', imei2: '' }],
      total: item.total,
    }));
    setPurchItems(items);
    const searches: Record<string, string> = {};
    items.forEach(it => { searches[it.id] = it.productName; });
    setItemSearch(searches);
    setShowForm(true);
  };

  // عند القدوم من كشف حساب مورد بزرار "فاتورة شراء جديدة": يفتح الفورم تلقائيًا مع تحديد المورد
  useEffect(() => {
    if (preselectedSupplierId) {
      const supplier = suppliers.find(s => s.id === preselectedSupplierId);
      if (supplier) {
        setSupplierId(supplier.id);
        setSupplierSearch(supplier.name);
      }
      setShowForm(true);
      onPreselectedHandled?.();
    }
  }, [preselectedSupplierId]);

  const filtered = purchaseInvoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    inv.supplierName.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

  // كل السيريالات المستخدمة فعليًا في النظام (لمنع تكرار سيريال موجود بالفعل في المخزون)
  const existingSerialsSet = new Set(serials.map(s => s.serial.trim().toLowerCase()).filter(Boolean));

  const isDuplicateSerial = (serial: string, currentItemId: string, currentIndex: number): boolean => {
    const normalized = serial.trim().toLowerCase();
    if (!normalized) return false;
    // تحقق من التكرار داخل الفاتورة الحالية (كل السطور والخانات)
    for (const item of purchItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.id === currentItemId && i === currentIndex) continue;
        if (item.serials[i].serial.trim().toLowerCase() === normalized) return true;
      }
    }
    // تحقق من التكرار مع سيريالات موجودة بالفعل في المخزون (إلا لو هي نفس الفاتورة اللي بنعدلها)
    if (existingSerialsSet.has(normalized)) {
      if (editingInvoice) {
        const wasInThisInvoice = editingInvoice.items.some(it => it.serials?.some(s => s.serial.trim().toLowerCase() === normalized));
        if (wasInThisInvoice) return false;
      }
      return true;
    }
    return false;
  };

  // تحديث خانة سيريال واحدة مع: التحقق من التكرار + مزامنة الكمية مع عدد السيريالات
  const updateSerialField = (itemId: string, index: number, field: 'serial' | 'imei1' | 'imei2', value: string) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const ns = [...item.serials];
      ns[index] = { ...ns[index], [field]: value };
      return { ...item, serials: ns };
    }));
    if (field === 'serial') {
      if (isDuplicateSerial(value, itemId, index)) {
        setDuplicateSerialWarning(value);
      } else if (duplicateSerialWarning === value) {
        setDuplicateSerialWarning(null);
      }
    }
  };

  // إضافة خانة سيريال جديدة (يدويًا أو تلقائيًا بعد إدخال متتابع) + رفع الكمية تلقائيًا لتطابق عدد السيريالات
  const addSerialSlot = (itemId: string, focusAfter = false) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newSerials = [...item.serials, { serial: '', imei1: '', imei2: '' }];
      return { ...item, serials: newSerials, quantity: newSerials.length, total: Math.max(0, item.unitPrice * newSerials.length - item.discount) };
    }));
    if (focusAfter) {
      setTimeout(() => {
        const key = `${itemId}-${(purchItems.find(i => i.id === itemId)?.serials.length || 0)}`;
        serialInputRefs.current[key]?.focus();
      }, 30);
    }
  };

  // الإدخال المتتابع بقارئ الباركود: بعد كتابة السيريال والضغط Enter،
  // يضيف خانة جديدة فاضية تلقائيًا ويركّز عليها بدون الحاجة للضغط على "إضافة سيريال" كل مرة
  const handleSerialKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: string, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const item = purchItems.find(i => i.id === itemId);
    if (!item) return;
    const currentValue = item.serials[index]?.serial || '';
    if (!currentValue.trim()) return; // لا تضيف خانة جديدة إذا كانت الخانة الحالية فاضية
    if (isDuplicateSerial(currentValue, itemId, index)) return; // لا تكمل لو السيريال مكرر

    const isLastSlot = index === item.serials.length - 1;
    if (isLastSlot) {
      addSerialSlot(itemId, true);
    } else {
      const key = `${itemId}-${index + 1}`;
      serialInputRefs.current[key]?.focus();
    }
  };

  // مزامنة الكمية اليدوية مع عدد خانات السيريال (زيادة الكمية تضيف خانات، تقليلها تحذف من الآخر)
  const syncSerialsWithQuantity = (itemId: string, newQuantity: number) => {
    setPurchItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const isSerialProduct = item.serials.length > 0;
      if (!isSerialProduct) return { ...item, quantity: newQuantity, total: Math.max(0, item.unitPrice * newQuantity - item.discount) };
      let newSerials = [...item.serials];
      if (newQuantity > newSerials.length) {
        while (newSerials.length < newQuantity) newSerials.push({ serial: '', imei1: '', imei2: '' });
      } else if (newQuantity < newSerials.length && newQuantity >= 1) {
        newSerials = newSerials.slice(0, newQuantity);
      }
      return { ...item, quantity: newSerials.length, serials: newSerials, total: Math.max(0, item.unitPrice * newSerials.length - item.discount) };
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
  };

  const getFilteredProducts = (search: string) => {
    if (!search) return products.slice(0, 10);
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.upc || '').includes(q)
    ).slice(0, 10);
  };

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const handleSave = () => {
    if (!supplierId || purchItems.length === 0) return;

    // تحقق نهائي: منع الحفظ لو فيه سيريال مكرر في أي مكان قبل الحفظ
    for (const item of purchItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.serials[i].serial && isDuplicateSerial(item.serials[i].serial, item.id, i)) {
          setDuplicateSerialWarning(item.serials[i].serial);
          return;
        }
      }
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
      // وضع التعديل: نحدّث الفاتورة الموجودة بنفس رقمها وتاريخ إنشائها الأصلي
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

    // وضع الإضافة: فاتورة جديدة + سيريالات جديدة للمخزون
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
            costPrice: item.unitPrice,
            createdAt: new Date().toISOString(),
          });
        });
      }
    });

    if (newSerials.length > 0) onAddSerials(newSerials);

    const invoice: PurchaseInvoice = {
      id: generateId(),
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
    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setPurchItems([]); setSupplierId(''); setSupplierSearch(''); setPaid(''); setNotes(''); setPaymentMethod('cash'); setFormDate(getTodayStr()); setEditingInvoice(null); setDuplicateSerialWarning(null); setItemSearch({});
  };

  const handleDeleteInvoice = () => {
    if (!confirmDeleteInvoice) return;
    onDeletePurchaseInvoice(confirmDeleteInvoice.id);
    setConfirmDeleteInvoice(null);
  };

  const handleAddSupplier = () => {
    if (!newSupplier.name) return;
    const s: Supplier = { id: generateId(), name: newSupplier.name, phone: newSupplier.phone, type: newSupplier.type, openingBalance: 0, totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString() };
    onAddSupplier(s);
    setSupplierId(s.id);
    setSupplierSearch(s.name);
    setAddSupplierModal(false);
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
    onAddProduct(product);
    selectProduct(itemId, product);
    setShowNewProductModal(null);
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
      ${item.serials?.map(s => `<tr><td colspan="4" style="font-size:11px;color:#666;padding-right:20px">السيريال: ${s.serial}${s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}${s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}</td></tr>`).join('') || ''}
    `).join('');
    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info"><div><strong>فاتورة مشتريات</strong></div><div>رقم: ${inv.invoiceNumber}</div><div>التاريخ: ${inv.date}</div><div>المورد: ${inv.supplierName}</div></div>
      </div>
      <table><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${itemsHtml}</tbody></table>
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
        <div><h2 className="text-xl font-bold text-white">📦 المشتريات</h2><p className="text-gray-500 text-sm">{purchaseInvoices.length} فاتورة</p></div>
        <button onClick={openNewForm} className="btn-primary flex items-center gap-2"><Plus size={16} /> فاتورة شراء جديدة</button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الفاتورة أو المورد..." className="input-dark w-full pr-9" />
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
              <tr key={inv.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 font-mono text-blue-400 text-sm">{inv.invoiceNumber}</td>
                <td className="py-3 px-4 text-white">{inv.supplierName}</td>
                <td className="py-3 px-4 text-center text-gray-400 text-xs">{inv.date}</td>
                <td className="py-3 px-4 text-center font-bold text-white">{formatCurrency(inv.total)}</td>
                <td className="py-3 px-4 text-center text-green-400">{formatCurrency(inv.paid)}</td>
                <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>{statusLabel(inv.status)}</span></td>
                <td className="py-3 px-4">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setViewInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400" title="عرض"><Eye size={14} /></button>
                    <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-green-400" title="طباعة"><Printer size={14} /></button>
                    <button onClick={() => openEditForm(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400" title="تعديل"><Edit size={14} /></button>
                    <button onClick={() => setConfirmDeleteInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400" title="حذف"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Purchase Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">📦 {editingInvoice ? `تعديل فاتورة ${editingInvoice.invoiceNumber}` : 'فاتورة شراء جديدة'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="relative">
                <label className="form-label">المورد *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={e => { setSupplierSearch(e.target.value); setShowSupDrop(true); setSupplierId(''); }}
                    onFocus={() => setShowSupDrop(true)}
                    placeholder="ابحث عن مورد..."
                    className="input-dark w-full"
                  />
                  {showSupDrop && (
                    <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                      {filteredSuppliers.slice(0, 8).map(s => (
                        <button key={s.id} onClick={() => { setSupplierId(s.id); setSupplierSearch(s.name); setShowSupDrop(false); }}
                          className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">{s.name}</button>
                      ))}
                      <button onClick={() => { setAddSupplierModal(true); setShowSupDrop(false); }}
                        className="block w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                        + إضافة مورد جديد
                      </button>
                    </div>
                  )}
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
                <h3 className="font-bold text-white text-sm">المنتجات المشتراة</h3>
                <button onClick={addItem} className="btn-secondary text-xs flex items-center gap-1"><Plus size={13} /> إضافة منتج</button>
              </div>

              <div className="space-y-4">
                {purchItems.map((item) => {
                  const linkedProduct = products.find(p => p.id === item.productId);
                  return (
                    <div key={item.id} className="bg-[#252545] border border-violet-900/20 rounded-xl p-4">
                      <div className="grid grid-cols-12 gap-2 items-end mb-3">
                        <div className="col-span-12 md:col-span-5 relative">
                          <label className="form-label text-xs">المنتج</label>
                          <input
                            type="text"
                            value={itemSearch[item.id] || ''}
                            onChange={e => { setItemSearch(prev => ({ ...prev, [item.id]: e.target.value })); setShowItemDrop(prev => ({ ...prev, [item.id]: true })); }}
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
                                  <div className="text-gray-500">{p.sku} • مخزون: {p.stock}</div>
                                </button>
                              ))}
                              <button onClick={() => { setShowNewProductModal(item.id); setShowItemDrop(prev => ({ ...prev, [item.id]: false })); }}
                                className="block w-full text-right px-3 py-2 text-xs text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                                + إضافة منتج جديد
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">الكمية</label>
                          <input type="number" min="1" value={item.quantity} onChange={e => syncSerialsWithQuantity(item.id, Math.max(1, parseInt(e.target.value) || 1))} className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">سعر الشراء</label>
                          <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-3 md:col-span-2 flex items-end">
                          <div className="w-full">
                            <label className="form-label text-xs">الإجمالي</label>
                            <div className="text-sm font-bold text-white py-2">{item.total.toLocaleString('ar-EG')}</div>
                          </div>
                        </div>
                        <div className="col-span-1 flex items-end pb-1 justify-end">
                          <button onClick={() => setPurchItems(prev => prev.filter(i => i.id !== item.id))} className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20"><X size={14} /></button>
                        </div>
                      </div>

                      {/* Serials */}
                      {(linkedProduct?.productType === 'serial' || item.serials.length > 0) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-400 font-medium">السيريالات والـ IMEI ({item.serials.filter(s => s.serial).length} / {item.quantity}):</div>
                            <div className="text-xs text-violet-400">💡 اكتب السيريال واضغط Enter للانتقال للتالي تلقائيًا (مفيد مع قارئ الباركود)</div>
                          </div>
                          {item.serials.map((sl, si) => {
                            const isDup = sl.serial && isDuplicateSerial(sl.serial, item.id, si);
                            return (
                              <div key={si}>
                                <div className="grid grid-cols-3 gap-2">
                                  <input
                                    ref={el => { serialInputRefs.current[`${item.id}-${si}`] = el; }}
                                    type="text"
                                    value={sl.serial}
                                    onChange={e => updateSerialField(item.id, si, 'serial', e.target.value)}
                                    onKeyDown={e => handleSerialKeyDown(e, item.id, si)}
                                    className={`input-dark w-full text-xs ${isDup ? 'border-red-500/60 bg-red-900/10' : ''}`}
                                    placeholder={`Serial ${si + 1}`}
                                  />
                                  <input type="text" value={sl.imei1} onChange={e => updateSerialField(item.id, si, 'imei1', e.target.value)} className="input-dark w-full text-xs" placeholder="IMEI 1" />
                                  <div className="flex gap-1">
                                    <input type="text" value={sl.imei2} onChange={e => updateSerialField(item.id, si, 'imei2', e.target.value)} className="input-dark flex-1 text-xs" placeholder="IMEI 2" />
                                    {item.serials.length > 1 && (
                                      <button onClick={() => {
                                        const newSerials = item.serials.filter((_, i) => i !== si);
                                        updateItem(item.id, { serials: newSerials, quantity: newSerials.length });
                                      }} className="p-1 text-red-400"><X size={12} /></button>
                                    )}
                                  </div>
                                </div>
                                {isDup && <div className="text-xs text-red-400 mt-1">⚠️ هذا السيريال موجود بالفعل، لا يمكن إضافته مرة أخرى</div>}
                              </div>
                            );
                          })}
                          <button onClick={() => addSerialSlot(item.id, true)}
                            className="text-xs text-violet-400 hover:text-violet-300">+ إضافة سيريال آخر (الكمية ستزيد تلقائيًا)</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 border-t border-white/10 pt-4">
                <div className="flex justify-between text-sm"><span className="text-gray-400">الإجمالي</span><span className="font-bold text-white text-lg">{formatCurrency(subtotal)}</span></div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'credit'] as PaymentMethod[]).map(method => (
                      <button key={method} onClick={() => setPaymentMethod(method)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-colors ${paymentMethod === method ? 'bg-violet-700/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'}`}>
                        {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' : '⏳ آجل'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">المبلغ المدفوع</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)} className="input-dark w-full" placeholder={`من ${formatCurrency(subtotal)}`} />
                </div>
                {remaining > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2 text-sm">
                    <span className="text-yellow-400">⏳ متبقي آجل: {formatCurrency(remaining)}</span>
                  </div>
                )}
              </div>
            </div>

            {duplicateSerialWarning && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mb-3 text-red-400">
                ⚠️ السيريال "{duplicateSerialWarning}" مكرر أو موجود بالفعل في المخزون. يرجى تصحيحه قبل الحفظ.
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1">💾 {editingInvoice ? 'حفظ التعديلات' : 'حفظ الفاتورة'}</button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">➕ إضافة منتج جديد سريع</h3>
            <div className="space-y-3">
              <input type="text" value={newProductForm.name} onChange={e => setNewProductForm(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="اسم المنتج *" />
              <input type="text" value={newProductForm.sku} onChange={e => setNewProductForm(p => ({ ...p, sku: e.target.value }))} className="input-dark w-full" placeholder="SKU *" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newProductForm.category} onChange={e => setNewProductForm(p => ({ ...p, category: e.target.value as Product['category'] }))} className="input-dark w-full">
                  <option value="phones">موبايلات</option>
                  <option value="tablets">تابلت</option>
                  <option value="laptops">لابتوب</option>
                  <option value="accessories">إكسسوارات</option>
                  <option value="other">أخرى</option>
                </select>
                <select value={newProductForm.brand} onChange={e => setNewProductForm(p => ({ ...p, brand: e.target.value }))} className="input-dark w-full">
                  <option>Apple</option><option>Samsung</option><option>DJI</option><option>Others</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setNewProductForm(p => ({ ...p, productType: 'serial' }))} className={`py-2 rounded-xl border text-xs ${newProductForm.productType === 'serial' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}>🔢 بسيريال</button>
                <button onClick={() => setNewProductForm(p => ({ ...p, productType: 'normal' }))} className={`py-2 rounded-xl border text-xs ${newProductForm.productType === 'normal' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}>📦 عادي</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={newProductForm.costPrice} onChange={e => setNewProductForm(p => ({ ...p, costPrice: e.target.value }))} className="input-dark w-full" placeholder="سعر الشراء" />
                <input type="number" value={newProductForm.salePrice} onChange={e => setNewProductForm(p => ({ ...p, salePrice: e.target.value }))} className="input-dark w-full" placeholder="سعر البيع" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleAddNewProduct(showNewProductModal)} className="btn-primary flex-1">إضافة وتحديد</button>
              <button onClick={() => setShowNewProductModal(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice */}
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
              <div><div className="text-xs text-gray-500">المورد</div><div className="font-bold text-white">{viewInvoice.supplierName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead className="bg-violet-900/20"><tr><th className="text-right py-2 px-3 text-gray-400">المنتج</th><th className="text-center py-2 px-3 text-gray-400">الكمية</th><th className="text-center py-2 px-3 text-gray-400">السعر</th><th className="text-center py-2 px-3 text-gray-400">الإجمالي</th></tr></thead>
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
                      <tr key={i} className="bg-violet-900/10"><td colSpan={4} className="py-1 px-6 text-xs text-gray-500">🔢 {s.serial}{s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}{s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}</td></tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between font-bold border-t border-white/10 pt-3">
              <span className="text-white">الإجمالي</span>
              <span className="text-blue-400 text-lg">{formatCurrency(viewInvoice.total)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-400">المدفوع</span>
              <span className="text-green-400">{formatCurrency(viewInvoice.paid)}</span>
            </div>
            {viewInvoice.remaining > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-400">المتبقي</span>
                <span className="text-red-400">{formatCurrency(viewInvoice.remaining)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {addSupplierModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">➕ إضافة مورد جديد</h3>
            <div className="space-y-3">
              <input type="text" value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="اسم المورد *" />
              <input type="text" value={newSupplier.phone} onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))} className="input-dark w-full" placeholder="رقم الهاتف" />
              <select value={newSupplier.type} onChange={e => setNewSupplier(p => ({ ...p, type: e.target.value as Supplier['type'] }))} className="input-dark w-full">
                <option value="supplier">مورد</option>
                <option value="trader">تاجر</option>
                <option value="both">مورد وتاجر</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddSupplier} className="btn-primary flex-1">إضافة</button>
              <button onClick={() => setAddSupplierModal(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Invoice Confirmation */}
      {confirmDeleteInvoice && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف فاتورة الشراء</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل أنت متأكد من حذف فاتورة <span className="text-white font-medium font-mono">{confirmDeleteInvoice.invoiceNumber}</span>؟
              سيتم خصم الكمية من المخزون، حذف السيريالات المرتبطة بها (إن لم تكن مباعة)، وتصحيح رصيد المورد والخزينة تلقائيًا. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDeleteInvoice} className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">🗑️ تأكيد الحذف</button>
              <button onClick={() => setConfirmDeleteInvoice(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
