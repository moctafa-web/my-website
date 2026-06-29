// src/pages/Sales.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SaleInvoice, Customer, Product, SerialItem, InvoiceItem, PaymentMethod, Brand, Supplier, PurchaseInvoice } from '../types';
import { formatCurrency, generateId, getTodayStr, paymentMethodLabel, statusLabel, statusColor } from '../utils/helpers';
import { Plus, Search, Printer, Eye, X, Trash2, Edit, ShoppingCart, AlertCircle } from 'lucide-react';

interface Props {
  saleInvoices: SaleInvoice[];
  customers: Customer[];
  products: Product[];
  serials: SerialItem[];
  brands: Brand[];
  settings: {
    lastSaleInvoiceNum: number;
    invoicePrefix: string;
    companyName: string;
    lastPurchaseInvoiceNum: number;
    purchasePrefix: string;
  };
  suppliers?: Supplier[];
  onAddSaleInvoice: (inv: SaleInvoice) => void;
  onAddCustomer: (c: Customer) => { success: boolean; message?: string } | void;
  onUpdateSaleInvoice: (inv: SaleInvoice) => void;
  onDeleteSaleInvoice: (invoiceId: string) => void;
  preselectedCustomerId?: string | null;
  onPreselectedHandled?: () => void;
  onAddProduct?: (p: Product) => { success: boolean; message?: string } | void;
  onAddSupplier?: (s: Supplier) => { success: boolean; message?: string } | void;
  onAddPurchaseInvoice?: (inv: PurchaseInvoice) => void;
  onAddSerials?: (serials: SerialItem[]) => void;
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

export default function Sales({
  saleInvoices, customers, products, serials, settings,
  suppliers = [], onAddSaleInvoice, onAddCustomer, onUpdateSaleInvoice, onDeleteSaleInvoice,
  preselectedCustomerId, onPreselectedHandled,
  onAddProduct, onAddSupplier, onAddPurchaseInvoice, onAddSerials,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<SaleInvoice | null>(null);
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<SaleInvoice | null>(null);
  const [addCustomerModal, setAddCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', type: 'individual' as Customer['type'] });
  const [customerDupError, setCustomerDupError] = useState<string | null>(null);

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
  const [duplicateSerialWarning, setDuplicateSerialWarning] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const serialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Quick Purchase states
  const [showQuickPurchase, setShowQuickPurchase] = useState(false);
  const [quickPurchTargetItemId, setQuickPurchTargetItemId] = useState<string | null>(null);
  const [qpSupplierId, setQpSupplierId] = useState('');
  const [qpSupplierSearch, setQpSupplierSearch] = useState('');
  const [qpShowSupDrop, setQpShowSupDrop] = useState(false);
  const [qpDate, setQpDate] = useState(getTodayStr());
  const [qpNotes, setQpNotes] = useState('');
  const [qpPayMethod, setQpPayMethod] = useState<PaymentMethod>('cash');
  const [qpPaid, setQpPaid] = useState('');
  const [qpItems, setQpItems] = useState<PurchItem[]>([]);
  const [qpItemSearch, setQpItemSearch] = useState<Record<string, string>>({});
  const [qpShowItemDrop, setQpShowItemDrop] = useState<Record<string, boolean>>({});
  const [qpDupWarning, setQpDupWarning] = useState<string | null>(null);
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', type: 'supplier' as Supplier['type'] });
  const [showNewProductModal, setShowNewProductModal] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '', sku: '', category: 'phones' as Product['category'],
    brand: 'Apple', productType: 'serial' as Product['productType'],
    costPrice: '', salePrice: '',
  });
  const [qpQuickAddError, setQpQuickAddError] = useState<string | null>(null);
  const qpSerialRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getAvailableStock = useCallback((productId: string): number => {
    const product = products.find(p => p.id === productId);
    if (product?.productType === 'serial') {
      return serials.filter(s => s.productId === productId && s.status === 'available').length;
    }
    return product?.stock || 0;
  }, [serials, products]);

  const getAvailableSerials = useCallback((productId: string): SerialItem[] => {
    return serials.filter(s => s.productId === productId && s.status === 'available');
  }, [serials]);

  const makeEmptySaleItem = (): SaleItem => ({
    id: generateId(), productId: '', productName: '', sku: '', description: '',
    quantity: 1, unitPrice: 0, discount: 0, discountType: 'percent', taxRate: 0,
    serials: [], total: 0,
  });

  const makeEmptyPurchItem = (): PurchItem => ({
    id: generateId(), productId: '', productName: '', sku: '',
    quantity: 1, unitPrice: 0, discount: 0,
    serials: [{ serial: '', imei1: '', imei2: '' }], total: 0,
  });

  const openNewForm = () => {
    resetForm();
    const firstItem = makeEmptySaleItem();
    setSaleItems([firstItem]);
    setItemSearch({ [firstItem.id]: '' });
    setShowForm(true);
  };

  const openEditForm = (inv: SaleInvoice) => {
    setEditingInvoice(inv);
    setCustomerId(inv.customerId);
    setCustomerSearch(inv.customerName);
    setFormDate(inv.date);
    setNotes(inv.notes || '');
    setPaymentMethod(inv.paymentMethod);
    setInstapayPerson(inv.instapayPerson || '');
    setPaid(String(inv.paid));
    setDiscount(inv.discount);
    const items: SaleItem[] = inv.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      description: item.description || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: item.discountType,
      taxRate: item.taxRate,
      serials: item.serials
        ? item.serials.map(s => ({ serial: s.serial, imei1: s.imei1 || '', imei2: s.imei2 || '' }))
        : [],
      total: item.total,
    }));
    setSaleItems(items);
    const searches: Record<string, string> = {};
    items.forEach(it => { searches[it.id] = it.productName; });
    setItemSearch(searches);
    setShowForm(true);
  };

  useEffect(() => {
    if (preselectedCustomerId) {
      const customer = customers.find(c => c.id === preselectedCustomerId);
      const supplier = suppliers.find(s => s.id === preselectedCustomerId);
      const party = customer || supplier;
      if (party) { setCustomerId(party.id); setCustomerSearch(party.name); }
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

  const allParties = [
    ...customers.map(c => ({ ...c, partyType: 'customer' as const })),
    ...suppliers.map(s => ({ ...s, partyType: 'supplier' as const })),
  ];

  const filteredCustomers = allParties.filter(p =>
    p.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (p.phone || '').includes(customerSearch)
  );

  const subtotal = saleItems.reduce((s, item) => s + item.total, 0);
  const totalAfterDiscount = Math.max(0, subtotal - discount);
  const paidAmount = parseFloat(paid) || 0;
  const remaining = totalAfterDiscount - paidAmount;

  const addItem = () => {
    const newItem = makeEmptySaleItem();
    setSaleItems(prev => [...prev, newItem]);
    setItemSearch(prev => ({ ...prev, [newItem.id]: '' }));
  };

  const isDuplicateSaleSerial = (serial: string, currentItemId: string, currentIndex: number): boolean => {
    const normalized = serial.trim().toLowerCase();
    if (!normalized) return false;
    for (const item of saleItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.id === currentItemId && i === currentIndex) continue;
        if (item.serials[i].serial.trim().toLowerCase() === normalized) return true;
      }
    }
    return false;
  };

  const isValidAvailableSerial = (serial: string, productId: string): boolean => {
    const normalized = serial.trim().toLowerCase();
    if (!normalized) return true;
    const record = serials.find(s => s.serial.trim().toLowerCase() === normalized);
    if (!record) return false;
    if (record.status === 'available') return true;
    if (editingInvoice && record.saleInvoiceId === editingInvoice.id) return true;
    return false;
  };

  const updateSerialField = (itemId: string, index: number, field: 'serial' | 'imei1' | 'imei2', value: string) => {
    setSaleItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const ns = [...item.serials];
      ns[index] = { ...ns[index], [field]: value };
      return { ...item, serials: ns };
    }));
    if (field === 'serial' && isDuplicateSaleSerial(value, itemId, index)) {
      setDuplicateSerialWarning(value);
    } else if (duplicateSerialWarning === value) {
      setDuplicateSerialWarning(null);
    }
  };

  const selectSerialFromDrop = (itemId: string, index: number, serial: SerialItem) => {
    setSaleItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const ns = [...item.serials];
      ns[index] = { serial: serial.serial, imei1: serial.imei1 || '', imei2: serial.imei2 || '' };
      return { ...item, serials: ns };
    }));
  };

  const addSerialSlot = (itemId: string, focusAfter = false) => {
    let newLength = 0;
    setSaleItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newSerials = [...item.serials, { serial: '', imei1: '', imei2: '' }];
      newLength = newSerials.length;
      const discountAmt = item.discountType === 'percent'
        ? (item.unitPrice * newSerials.length * item.discount / 100)
        : item.discount;
      return { ...item, serials: newSerials, quantity: newSerials.length, total: Math.max(0, item.unitPrice * newSerials.length - discountAmt) };
    }));
    if (focusAfter) {
      setTimeout(() => { serialInputRefs.current[`${itemId}-${newLength - 1}`]?.focus(); }, 30);
    }
  };

  const handleSerialKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: string, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const item = saleItems.find(i => i.id === itemId);
    if (!item) return;
    const currentValue = item.serials[index]?.serial || '';
    if (!currentValue.trim()) return;
    if (isDuplicateSaleSerial(currentValue, itemId, index)) return;
    if (!isValidAvailableSerial(currentValue, item.productId)) return;
    const isLastSlot = index === item.serials.length - 1;
    if (isLastSlot) addSerialSlot(itemId, true);
    else serialInputRefs.current[`${itemId}-${index + 1}`]?.focus();
  };

  const syncSerialsWithQuantity = (itemId: string, newQuantity: number) => {
    setSaleItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.productId);
      const isSerialProduct = product?.productType === 'serial';
      if (item.id !== itemId) return item;
      if (!isSerialProduct) {
        const discountAmt = item.discountType === 'percent'
          ? (item.unitPrice * newQuantity * item.discount / 100) : item.discount;
        return { ...item, quantity: newQuantity, total: Math.max(0, item.unitPrice * newQuantity - discountAmt) };
      }
      let newSerials = [...item.serials];
      if (newQuantity > newSerials.length) {
        while (newSerials.length < newQuantity) newSerials.push({ serial: '', imei1: '', imei2: '' });
      } else if (newQuantity < newSerials.length && newQuantity >= 1) {
        newSerials = newSerials.slice(0, newQuantity);
      }
      const discountAmt = item.discountType === 'percent'
        ? (item.unitPrice * newSerials.length * item.discount / 100) : item.discount;
      return { ...item, quantity: newSerials.length, serials: newSerials, total: Math.max(0, item.unitPrice * newSerials.length - discountAmt) };
    }));
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
      serials: product.productType === 'serial'
        ? [{ serial: availSerial?.serial || '', imei1: availSerial?.imei1 || '', imei2: availSerial?.imei2 || '' }]
        : [],
    });
    setItemSearch(prev => ({ ...prev, [itemId]: product.name }));
    setShowItemDrop(prev => ({ ...prev, [itemId]: false }));
    setStockError(null);
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

  const selectedParty = allParties.find(p => p.id === customerId);

const validateStock = (): string | null => {
  for (const item of saleItems) {
    if (!item.productId) continue;
    const product = products.find(p => p.id === item.productId);
    if (!product) continue;

    if (product.productType === 'serial') {
      const filledSerials = item.serials.filter(s => s.serial.trim());

      if (filledSerials.length === 0) {
        return `منتج "${product.name}" يحتاج سيريال - لا يمكن البيع بدون سيريال`;
      }

      if (filledSerials.length < item.quantity) {
        return `منتج "${product.name}" - الكمية ${item.quantity} تحتاج ${item.quantity} سيريال، أدخلت ${filledSerials.length} فقط`;
      }

      for (const sl of filledSerials) {
        if (!isValidAvailableSerial(sl.serial, item.productId)) {
          return `السيريال "${sl.serial}" غير متاح في المخزون لمنتج "${product.name}"`;
        }
      }

      // ✅ مهم جداً: في حالة التعديل على نفس الفاتورة، نضيف سيريالات الفاتورة القديمة
      // لأنها متباعة بالفعل على نفس الفاتورة وليست "ناقصة من المخزون" بالنسبة للتعديل
      const availableCount = getAvailableStock(item.productId);
      let usedInThisInvoice = 0;

      if (editingInvoice) {
        const originalItem = editingInvoice.items.find(i => i.productId === item.productId);
        usedInThisInvoice = originalItem?.quantity || 0;
      }

      const effectiveAvailable = availableCount + usedInThisInvoice;

      if (item.quantity > effectiveAvailable) {
        return `منتج "${product.name}" - المطلوب ${item.quantity} والمتاح ${availableCount} فقط`;
      }
    } else {
      const availableStock = getAvailableStock(item.productId);
      let usedInThisInvoice = 0;

      if (editingInvoice) {
        const originalItem = editingInvoice.items.find(i => i.productId === item.productId);
        usedInThisInvoice = originalItem?.quantity || 0;
      }

      const effectiveAvailable = availableStock + usedInThisInvoice;

      if (item.quantity > effectiveAvailable) {
        return `منتج "${product.name}" - المطلوب ${item.quantity} والمتاح ${availableStock} فقط`;
      }
    }
  }

  return null;
};

  const handleSave = () => {
    if (!customerId || saleItems.length === 0) return;

    // ✅ تحقق: كل البنود لازم يكون فيها productId
    const emptyItem = saleItems.find(item => !item.productId);
    if (emptyItem) {
      setStockError('يوجد بند بدون منتج محدد - اختر منتجاً من القائمة أو احذف البند');
      return;
    }

    for (const item of saleItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.serials[i].serial && isDuplicateSaleSerial(item.serials[i].serial, item.id, i)) {
          setDuplicateSerialWarning(item.serials[i].serial);
          return;
        }
      }
    }

    const stockErr = validateStock();
    if (stockErr) {
      setStockError(stockErr);
      return;
    }
    setStockError(null);

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
      costPrice: products.find(p => p.id === item.productId)?.costPrice ?? 0,
    }));

    if (editingInvoice) {
      const updatedInvoice: SaleInvoice = {
        ...editingInvoice,
        customerId,
        customerName: selectedParty?.name || '',
        date: formDate,
        items,
        subtotal,
        discount,
        total: totalAfterDiscount,
        paid: paidAmount,
        remaining,
        status: totalAfterDiscount === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        paymentMethod,
        instapayPerson: paymentMethod === 'instapay' ? instapayPerson : undefined,
        notes,
      };
      onUpdateSaleInvoice(updatedInvoice);
      resetForm();
      setShowForm(false);
      return;
    }

    const existingNumbers = saleInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextNum = Math.max(settings.lastSaleInvoiceNum, ...existingNumbers, 1000) + 1;
    const invoiceNumber = `${settings.invoicePrefix}-${String(nextNum).padStart(4, '0')}`;

    const invoice: SaleInvoice = {
      id: generateId(),
      invoiceNumber,
      customerId,
      customerName: selectedParty?.name || '',
      date: formDate,
      items,
      subtotal,
      taxTotal: 0,
      discount,
      total: totalAfterDiscount,
      paid: paidAmount,
      remaining,
      status: totalAfterDiscount === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
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
    setEditingInvoice(null); setDuplicateSerialWarning(null); setItemSearch({});
    setStockError(null);
  };

  const handleDeleteInvoice = () => {
    if (!confirmDeleteInvoice) return;
    onDeleteSaleInvoice(confirmDeleteInvoice.id);
    setConfirmDeleteInvoice(null);
  };

  const handleAddCustomer = () => {
    if (!newCustomer.name) return;
    const c: Customer = {
      id: generateId(), name: newCustomer.name, phone: newCustomer.phone,
      type: newCustomer.type, openingBalance: 0,
      totalInvoices: 0, totalPaid: 0, createdAt: new Date().toISOString(),
    };
    const result = onAddCustomer(c);
    if (result && result.success === false) {
      setCustomerDupError(result.message || 'هذا العميل موجود بالفعل');
      return;
    }
    setCustomerId(c.id); setCustomerSearch(c.name);
    setAddCustomerModal(false); setCustomerDupError(null);
    setNewCustomer({ name: '', phone: '', type: 'individual' });
  };

  const openQuickPurchase = (saleItemId: string, searchText: string) => {
    setQuickPurchTargetItemId(saleItemId);
    setShowItemDrop(prev => ({ ...prev, [saleItemId]: false }));
    const firstItem = makeEmptyPurchItem();
    setQpItems([{ ...firstItem }]);
    setQpItemSearch({ [firstItem.id]: searchText });
    setQpShowItemDrop({}); setQpSupplierId(''); setQpSupplierSearch('');
    setQpDate(getTodayStr()); setQpNotes(''); setQpPayMethod('cash');
    setQpPaid(''); setQpDupWarning(null);
    setShowQuickPurchase(true);
  };

  const existingSerialsSet = new Set(serials.map(s => s.serial.trim().toLowerCase()).filter(Boolean));

  const isDuplicateQpSerial = (serial: string, currentItemId: string, currentIndex: number): boolean => {
    const normalized = serial.trim().toLowerCase();
    if (!normalized) return false;
    for (const item of qpItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.id === currentItemId && i === currentIndex) continue;
        if (item.serials[i].serial.trim().toLowerCase() === normalized) return true;
      }
    }
    return existingSerialsSet.has(normalized);
  };

  const updateQpSerialField = (itemId: string, index: number, field: 'serial' | 'imei1' | 'imei2', value: string) => {
    setQpItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const ns = [...item.serials];
      ns[index] = { ...ns[index], [field]: value };
      return { ...item, serials: ns };
    }));
    if (field === 'serial') {
      setQpDupWarning(value && isDuplicateQpSerial(value, itemId, index) ? value : null);
    }
  };

  const addQpSerialSlot = (itemId: string, focusAfter = false) => {
    setQpItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newSerials = [...item.serials, { serial: '', imei1: '', imei2: '' }];
      return { ...item, serials: newSerials, quantity: newSerials.length, total: Math.max(0, item.unitPrice * newSerials.length - item.discount) };
    }));
    if (focusAfter) {
      const currentLen = qpItems.find(i => i.id === itemId)?.serials.length || 0;
      setTimeout(() => { qpSerialRefs.current[`${itemId}-${currentLen}`]?.focus(); }, 30);
    }
  };

  const handleQpSerialKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: string, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const item = qpItems.find(i => i.id === itemId);
    if (!item) return;
    const val = item.serials[index]?.serial || '';
    if (!val.trim() || isDuplicateQpSerial(val, itemId, index)) return;
    if (index === item.serials.length - 1) addQpSerialSlot(itemId, true);
    else qpSerialRefs.current[`${itemId}-${index + 1}`]?.focus();
  };

  const syncQpSerials = (itemId: string, newQuantity: number) => {
    setQpItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      let newSerials = [...item.serials];
      if (newQuantity > newSerials.length) {
        while (newSerials.length < newQuantity) newSerials.push({ serial: '', imei1: '', imei2: '' });
      } else if (newQuantity < newSerials.length && newQuantity >= 1) {
        newSerials = newSerials.slice(0, newQuantity);
      }
      return { ...item, quantity: newSerials.length, serials: newSerials, total: Math.max(0, item.unitPrice * newSerials.length - item.discount) };
    }));
  };

  const updateQpItem = (id: string, updates: Partial<PurchItem>) => {
    setQpItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      updated.total = Math.max(0, updated.unitPrice * updated.quantity - updated.discount);
      return updated;
    }));
  };

  const selectQpProduct = (itemId: string, product: Product) => {
    updateQpItem(itemId, {
      productId: product.id, productName: product.name, sku: product.sku,
      unitPrice: product.costPrice,
      serials: product.productType === 'serial' ? [{ serial: '', imei1: '', imei2: '' }] : [],
    });
    setQpItemSearch(prev => ({ ...prev, [itemId]: product.name }));
    setQpShowItemDrop(prev => ({ ...prev, [itemId]: false }));
  };

  const filteredQpSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(qpSupplierSearch.toLowerCase()) ||
    (s.phone || '').includes(qpSupplierSearch)
  );

  const qpSubtotal = qpItems.reduce((s, i) => s + i.total, 0);
  const qpPaidAmount = parseFloat(qpPaid) || 0;
  const qpRemaining = qpSubtotal - qpPaidAmount;
  const selectedQpSupplier = suppliers.find(s => s.id === qpSupplierId);

  const handleAddSupplier = () => {
    if (!newSupplier.name || !onAddSupplier) return;
    const s: Supplier = {
      id: generateId(), name: newSupplier.name, phone: newSupplier.phone,
      type: newSupplier.type, openingBalance: 0, totalInvoices: 0, totalPaid: 0,
      createdAt: new Date().toISOString(),
    };
    const result = onAddSupplier(s);
    if (result && result.success === false) {
      setQpQuickAddError(result.message || 'هذا المورد موجود بالفعل');
      return;
    }
    setQpSupplierId(s.id); setQpSupplierSearch(s.name);
    setAddSupplierModal(false); setQpQuickAddError(null);
    setNewSupplier({ name: '', phone: '', type: 'supplier' });
  };

  const handleAddNewProduct = (itemId: string) => {
    if (!newProductForm.name || !onAddProduct) return;
    const now = new Date().toISOString();
    const product: Product = {
      id: generateId(), name: newProductForm.name,
      sku: newProductForm.sku || ('SKU-' + Date.now()),
      category: newProductForm.category, brand: newProductForm.brand,
      productType: newProductForm.productType,
      costPrice: parseFloat(newProductForm.costPrice) || 0,
      salePrice: parseFloat(newProductForm.salePrice) || 0,
      stock: 0, createdAt: now, updatedAt: now,
    };
    const result = onAddProduct(product);
    if (result && result.success === false) {
      setQpQuickAddError(result.message || 'هذا المنتج موجود بالفعل');
      return;
    }
    selectQpProduct(itemId, product);
    setShowNewProductModal(null); setQpQuickAddError(null);
    setNewProductForm({ name: '', sku: '', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: '', salePrice: '' });
  };

  const handleQpSave = () => {
    if (!qpSupplierId || qpItems.length === 0 || !onAddPurchaseInvoice || !onAddSerials) return;
    for (const item of qpItems) {
      for (let i = 0; i < item.serials.length; i++) {
        if (item.serials[i].serial && isDuplicateQpSerial(item.serials[i].serial, item.id, i)) {
          setQpDupWarning(item.serials[i].serial); return;
        }
      }
    }
    const invoiceId = generateId();
    const invoiceNumber = `${settings.purchasePrefix}-${String((settings.lastPurchaseInvoiceNum || 1000) + 1).padStart(4, '0')}`;
    const items: InvoiceItem[] = qpItems.map(item => ({
      id: item.id, productId: item.productId, productName: item.productName, sku: item.sku,
      quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount,
      discountType: 'fixed' as const, taxRate: 0, total: item.total,
      serials: item.serials.filter(s => s.serial),
    }));
    const newSerials: SerialItem[] = [];
    qpItems.forEach(item => {
      if (item.productId) {
        item.serials.filter(s => s.serial).forEach(sl => {
          newSerials.push({
            id: generateId(), productId: item.productId, productName: item.productName,
            serial: sl.serial, imei1: sl.imei1 || undefined, imei2: sl.imei2 || undefined,
            status: 'available', purchaseInvoiceId: invoiceId,
            costPrice: item.unitPrice,
            // ✅ لو السعر صفر = سعر معلّق
            purchasePricePending: item.unitPrice === 0 ? true : false,
            createdAt: new Date().toISOString(),
          });
        });
      }
    });
    onAddPurchaseInvoice({
      id: invoiceId, invoiceNumber, supplierId: qpSupplierId,
      supplierName: selectedQpSupplier?.name || '',
      date: qpDate, items, subtotal: qpSubtotal, taxTotal: 0, discount: 0,
      total: qpSubtotal, paid: qpPaidAmount, remaining: qpRemaining,
      status: qpRemaining <= 0 ? 'paid' : qpPaidAmount > 0 ? 'partial' : 'unpaid',
      paymentMethod: qpPayMethod, notes: qpNotes, createdAt: new Date().toISOString(),
    });
    if (newSerials.length > 0) onAddSerials(newSerials);
    if (quickPurchTargetItemId && qpItems[0]?.productId) {
      const boughtProduct = products.find(p => p.id === qpItems[0].productId);
      if (boughtProduct) {
        const firstSerial = newSerials[0];
        updateItem(quickPurchTargetItemId, {
          productId: boughtProduct.id, productName: boughtProduct.name,
          sku: boughtProduct.sku, unitPrice: boughtProduct.salePrice,
          serials: boughtProduct.productType === 'serial' && firstSerial
            ? [{ serial: firstSerial.serial, imei1: firstSerial.imei1 || '', imei2: firstSerial.imei2 || '' }]
            : [],
        });
        setItemSearch(prev => ({ ...prev, [quickPurchTargetItemId]: boughtProduct.name }));
      }
    }
    setShowQuickPurchase(false);
  };

  const printInvoice = (inv: SaleInvoice) => {
    const itemsHtml = inv.items.map(item => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-weight:600;font-size:14px;color:#111;">${item.productName}</div>
          ${item.serials?.map(s => `
            <div style="font-size:11px;color:#666;margin-top:3px;font-family:monospace;">
              SN: ${s.serial}${s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}${s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}
            </div>
          `).join('') || ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;">${item.unitPrice.toLocaleString('ar-EG')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;">${item.discount > 0 ? item.discount.toLocaleString('ar-EG') : '-'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:14px;font-weight:700;">${item.total.toLocaleString('ar-EG')}</td>
      </tr>
    `).join('');

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>فاتورة ${inv.invoiceNumber}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          @media print { body { margin: 0; } .no-print { display: none !important; } }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #111; background: #fff; font-size: 14px; line-height: 1.6; padding: 30px; max-width: 210mm; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid #111; margin-bottom: 24px; }
          .shop-name { font-size: 32px; font-weight: 900; letter-spacing: 2px; color: #111; }
          .invoice-title h1 { font-size: 22px; font-weight: 800; color: #111; margin-bottom: 6px; }
          .invoice-number { font-family: monospace; font-size: 16px; font-weight: 700; color: #444; }
          .invoice-date { font-size: 13px; color: #666; margin-top: 4px; }
          .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; padding: 16px 20px; background: #f9f9f9; border-radius: 8px; border: 1px solid #e5e7eb; }
          .info-label { font-size: 11px; color: #888; margin-bottom: 3px; }
          .info-value { font-size: 15px; font-weight: 600; color: #111; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          .items-table thead tr { background: #111; color: #fff; }
          .items-table thead th { padding: 12px; font-size: 13px; font-weight: 600; text-align: center; }
          .items-table thead th:first-child { text-align: right; }
          .items-table tbody tr:nth-child(even) { background: #f9f9f9; }
          .summary-section { display: flex; justify-content: flex-start; margin-bottom: 28px; }
          .summary-box { width: 320px; margin-right: auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
          .summary-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
          .summary-row:last-child { border-bottom: none; }
          .summary-row .label { color: #666; }
          .summary-row .value { font-weight: 600; color: #111; }
          .summary-row.total { background: #111; color: #fff; }
          .summary-row.total .label { color: #fff; font-weight: 700; font-size: 16px; }
          .summary-row.total .value { color: #fff; font-weight: 900; font-size: 18px; }
          .footer { text-align: center; padding-top: 20px; border-top: 2px solid #111; color: #666; font-size: 13px; }
          .footer .thank-you { font-size: 18px; font-weight: 700; color: #111; margin-bottom: 6px; }
          .print-btn { display: block; margin: 24px auto 0; padding: 12px 40px; background: #111; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-family: inherit; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-name">ONE</div>
          <div class="invoice-title">
            <h1>فاتورة مبيعات</h1>
            <div class="invoice-number"># ${inv.invoiceNumber}</div>
            <div class="invoice-date">📅 ${inv.date}</div>
          </div>
        </div>
        <div class="info-section">
          <div><div class="info-label">العميل / الجهة</div><div class="info-value">${inv.customerName}</div></div>
          <div><div class="info-label">طريقة الدفع</div><div class="info-value">${paymentMethodLabel(inv.paymentMethod)}${inv.instapayPerson ? ` - ${inv.instapayPerson}` : ''}</div></div>
          <div><div class="info-label">حالة الفاتورة</div><div class="info-value">${inv.status === 'paid' ? '✅ مدفوعة' : inv.status === 'partial' ? '🔶 جزئياً' : '🔴 غير مدفوعة'}</div></div>
          <div><div class="info-label">رقم المرجع</div><div class="info-value" style="font-family:monospace;">${inv.invoiceNumber}</div></div>
        </div>
        <table class="items-table">
          <thead><tr><th style="text-align:right;width:45%;">المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="summary-section">
          <div class="summary-box">
            <div class="summary-row"><span class="label">المجموع الفرعي</span><span class="value">${inv.subtotal.toLocaleString('ar-EG')} ج.م</span></div>
            ${inv.discount > 0 ? `<div class="summary-row"><span class="label">الخصم</span><span class="value" style="color:#c00;">- ${inv.discount.toLocaleString('ar-EG')} ج.م</span></div>` : ''}
            <div class="summary-row total"><span class="label">الإجمالي النهائي</span><span class="value">${inv.total.toLocaleString('ar-EG')} ج.م</span></div>
            <div class="summary-row"><span class="label">المدفوع</span><span class="value" style="color:#16a34a;">${inv.paid.toLocaleString('ar-EG')} ج.م</span></div>
            ${inv.remaining > 0 ? `<div class="summary-row"><span class="label" style="color:#c00;">المتبقي</span><span class="value" style="color:#c00;">${inv.remaining.toLocaleString('ar-EG')} ج.م</span></div>` : ''}
          </div>
        </div>
        ${inv.notes ? `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:24px;background:#fffef0;"><div style="font-size:12px;color:#888;margin-bottom:6px;">📝 ملاحظات</div><div style="font-size:14px;color:#333;">${inv.notes}</div></div>` : ''}
        <div class="footer">
          <div class="thank-you">شكراً لتعاملكم معنا</div>
          <div>للاستفسار - 01220125121</div>
        </div>
        <div class="no-print"><button class="print-btn" onclick="window.print();">🖨️ طباعة الفاتورة</button></div>
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">🛒 المبيعات</h2>
          <p className="text-gray-500 text-sm">{saleInvoices.length} فاتورة</p>
        </div>
        <button onClick={openNewForm} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> فاتورة بيع جديدة
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث برقم الفاتورة أو العميل..."
          className="input-dark w-full pr-9" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">
            {formatCurrency(saleInvoices.reduce((s, i) => s + i.total, 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المبيعات</div>
        </div>
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">
            {formatCurrency(saleInvoices.reduce((s, i) => s + i.paid, 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المحصل</div>
        </div>
        <div className="bg-[#1a1a35] border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">
            {formatCurrency(saleInvoices.reduce((s, i) => s + i.remaining, 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المتبقي</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">رقم الفاتورة</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">العميل / الجهة</th>
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
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(inv.status)}`}>
                    {statusLabel(inv.status)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setViewInvoice(inv)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-900/20">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => printInvoice(inv)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-900/20">
                      <Printer size={14} />
                    </button>
                    <button onClick={() => openEditForm(inv)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/20">
                      <Edit size={14} />
                    </button>
                    <button onClick={() => setConfirmDeleteInvoice(inv)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ==================== New/Edit Invoice Modal ==================== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">
                {editingInvoice ? `✏️ تعديل فاتورة ${editingInvoice.invoiceNumber}` : '➕ فاتورة بيع جديدة'}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="relative">
                <label className="form-label">العميل / الجهة *</label>
                <input type="text" value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustDrop(true); setCustomerId(''); }}
                  onFocus={() => setShowCustDrop(true)}
                  placeholder="ابحث عن عميل أو مورد..."
                  className="input-dark w-full"
                />
                {showCustDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto">
                    {filteredCustomers.slice(0, 10).map(p => (
                      <button key={p.id}
                        onClick={() => { setCustomerId(p.id); setCustomerSearch(p.name); setShowCustDrop(false); }}
                        className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                        <div className="flex items-center justify-between">
                          <span>
                            {p.name}
                            {p.phone && <span className="text-gray-500 text-xs mr-1">({p.phone})</span>}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-md mr-2 shrink-0 ${
                            p.partyType === 'supplier'
                              ? 'bg-blue-900/40 text-blue-400'
                              : 'bg-violet-900/40 text-violet-400'
                          }`}>
                            {p.partyType === 'supplier' ? 'مورد/تاجر' : 'عميل'}
                          </span>
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={() => { setAddCustomerModal(true); setShowCustDrop(false); setCustomerDupError(null); }}
                      className="block w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                      + إضافة عميل جديد
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">تاريخ الفاتورة</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  className="input-dark w-full" placeholder="ملاحظات اختيارية..." />
              </div>
            </div>

            {/* البنود */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white text-sm">البنود</h3>
                <button onClick={addItem} className="btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> إضافة بند
                </button>
              </div>

              <div className="space-y-3">
                {saleItems.map((item) => {
                  const product = products.find(p => p.id === item.productId);
                  const isSerial = product?.productType === 'serial';
                  const availStock = item.productId ? getAvailableStock(item.productId) : 0;
                  const availSers = item.productId ? getAvailableSerials(item.productId) : [];

                  return (
                    <div key={item.id} className="bg-[#252545] border border-violet-900/20 rounded-xl p-3">
                      <div className="grid grid-cols-12 gap-2 items-start">
                        {/* البند - البحث عن منتج */}
                        <div className="col-span-12 md:col-span-4 relative">
                          <label className="form-label text-xs">البند</label>
                          <input type="text" value={itemSearch[item.id] || ''}
                            onChange={e => {
                              setItemSearch(prev => ({ ...prev, [item.id]: e.target.value }));
                              setShowItemDrop(prev => ({ ...prev, [item.id]: true }));
                            }}
                            onFocus={() => setShowItemDrop(prev => ({ ...prev, [item.id]: true }))}
                            placeholder="ابحث عن منتج..."
                            className="input-dark w-full text-sm"
                          />
                          {showItemDrop[item.id] && (
                            <div className="absolute top-full mt-1 right-0 left-0 bg-[#1a1a35] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto">
                              {getFilteredProducts(itemSearch[item.id] || '').map(p => {
                                const avail = getAvailableStock(p.id);
                                const outOfStock = avail === 0;
                                return (
                                  <button key={p.id}
                                    onClick={() => !outOfStock && selectProduct(item.id, p)}
                                    className={`block w-full text-right px-3 py-2 text-xs transition-colors ${
                                      outOfStock
                                        ? 'opacity-50 cursor-not-allowed text-gray-500'
                                        : 'text-gray-300 hover:bg-violet-700/20'
                                    }`}
                                  >
                                    <div className="font-medium">{p.name}</div>
                                    <div className={`text-xs ${outOfStock ? 'text-red-400' : 'text-gray-500'}`}>
                                      {p.sku} • {formatCurrency(p.salePrice)} • متاح:{' '}
                                      <span className={outOfStock ? 'text-red-400 font-bold' : 'text-green-400'}>
                                        {avail}
                                      </span>
                                      {outOfStock && ' ❌'}
                                    </div>
                                  </button>
                                );
                              })}
                              {/* ✅ فقط هذا الزر يبقى - بيع بدون شراء اتشال نهائياً */}
                              {onAddPurchaseInvoice && onAddSerials && (
                                <button
                                  onClick={() => openQuickPurchase(item.id, itemSearch[item.id] || '')}
                                  className="w-full text-right px-3 py-2.5 text-xs text-orange-400 hover:bg-orange-900/20 border-t border-white/10 font-medium flex items-center gap-2">
                                  <ShoppingCart size={13} />
                                  📦 منتج مش موجود؟ افتح فاتورة شراء
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">الكمية</label>
                          <input type="number" min="1"
                            value={item.quantity}
                            onChange={e => syncSerialsWithQuantity(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                            className="input-dark w-full text-sm"
                          />
                          {item.productId && !isSerial && item.quantity > availStock && (
                            <div className="text-xs text-red-400 mt-1">⚠️ المتاح {availStock}</div>
                          )}
                        </div>

                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">سعر الوحدة</label>
                          <input type="number" value={item.unitPrice}
                            onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="input-dark w-full text-sm" />
                        </div>

                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">الخصم (ج.م)</label>
                          <input type="number" value={item.discount}
                            onChange={e => updateItem(item.id, { discount: parseFloat(e.target.value) || 0, discountType: 'fixed' })}
                            className="input-dark w-full text-sm" />
                        </div>

                        <div className="col-span-8 md:col-span-1 flex items-end">
                          <div className="w-full">
                            <label className="form-label text-xs">الإجمالي</label>
                            <div className="text-sm font-bold text-white py-2">
                              {item.total.toLocaleString('ar-EG')}
                            </div>
                          </div>
                        </div>

                        <div className="col-span-4 md:col-span-1 flex items-end pb-2 justify-end">
                          <button onClick={() => setSaleItems(prev => prev.filter(i => i.id !== item.id))}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20">
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      {/* تنبيه نفاد المخزون */}
                      {item.productId && availStock === 0 && (
                        <div className="mt-2 flex items-center gap-2 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                          <AlertCircle size={14} className="text-red-400 shrink-0" />
                          <span className="text-xs text-red-400">هذا المنتج غير متاح في المخزون</span>
                        </div>
                      )}

                      {/* السيريالات */}
                      {isSerial && item.serials.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-400 font-medium">
                              السيريالات ({item.serials.filter(s => s.serial).length} / {item.quantity}):
                            </div>
                            <div className="text-xs text-violet-400">💡 اختر من المتاح أو اكتب يدوياً</div>
                          </div>

                          {availSers.length > 0 && (
                            <div className="bg-green-900/10 border border-green-700/20 rounded-lg p-2 mb-2">
                              <div className="text-xs text-green-400 mb-1.5 font-medium">
                                ✅ السيريالات المتاحة ({availSers.length}):
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {availSers.map((s) => {
                                  const isSelected = item.serials.some(sl =>
                                    sl.serial.trim().toLowerCase() === s.serial.trim().toLowerCase()
                                  );
                                  return (
                                    <button key={s.id}
                                      onClick={() => {
                                        if (isSelected) return;
                                        const emptyIdx = item.serials.findIndex(sl => !sl.serial.trim());
                                        if (emptyIdx >= 0) {
                                          selectSerialFromDrop(item.id, emptyIdx, s);
                                        } else {
                                          setSaleItems(prev => prev.map(it => {
                                            if (it.id !== item.id) return it;
                                            const newSerials = [...it.serials, { serial: s.serial, imei1: s.imei1 || '', imei2: s.imei2 || '' }];
                                            const discountAmt = it.discountType === 'percent'
                                              ? (it.unitPrice * newSerials.length * it.discount / 100) : it.discount;
                                            return { ...it, serials: newSerials, quantity: newSerials.length, total: Math.max(0, it.unitPrice * newSerials.length - discountAmt) };
                                          }));
                                        }
                                      }}
                                      className={`text-xs px-2 py-1 rounded-lg border font-mono transition-colors ${
                                        isSelected
                                          ? 'bg-green-700/30 border-green-500/50 text-green-300 cursor-default'
                                          : 'border-green-700/30 text-green-400 hover:bg-green-700/20 cursor-pointer'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : ''}{s.serial}
                                      {s.imei1 && <span className="text-green-600 text-xs"> ({s.imei1.slice(-4)})</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {item.serials.map((sl, si) => {
                            const isDup = sl.serial && isDuplicateSaleSerial(sl.serial, item.id, si);
                            const isInvalid = sl.serial && !isDup && !isValidAvailableSerial(sl.serial, item.productId);
                            return (
                              <div key={si}>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="form-label text-xs">السيريال {si + 1}</label>
                                    <input
                                      ref={el => { serialInputRefs.current[`${item.id}-${si}`] = el; }}
                                      type="text" value={sl.serial}
                                      onChange={e => updateSerialField(item.id, si, 'serial', e.target.value)}
                                      onKeyDown={e => handleSerialKeyDown(e, item.id, si)}
                                      className={`input-dark w-full text-xs font-mono ${isDup || isInvalid ? 'border-red-500/60 bg-red-900/10' : ''}`}
                                      placeholder="Serial Number"
                                    />
                                  </div>
                                  <div>
                                    <label className="form-label text-xs">IMEI 1</label>
                                    <input type="text" value={sl.imei1}
                                      onChange={e => updateSerialField(item.id, si, 'imei1', e.target.value)}
                                      className="input-dark w-full text-xs" />
                                  </div>
                                  <div className="flex gap-1">
                                    <div className="flex-1">
                                      <label className="form-label text-xs">IMEI 2</label>
                                      <input type="text" value={sl.imei2}
                                        onChange={e => updateSerialField(item.id, si, 'imei2', e.target.value)}
                                        className="input-dark w-full text-xs" />
                                    </div>
                                    {item.serials.length > 1 && (
                                      <button onClick={() => {
                                        const newSerials = item.serials.filter((_, i) => i !== si);
                                        updateItem(item.id, { serials: newSerials, quantity: newSerials.length });
                                      }} className="p-1 text-red-400 self-end mb-0.5"><X size={12} /></button>
                                    )}
                                  </div>
                                </div>
                                {isDup && <div className="text-xs text-red-400 mt-1">⚠️ هذا السيريال مكرر في الفاتورة</div>}
                                {isInvalid && <div className="text-xs text-red-400 mt-1">⚠️ هذا السيريال غير متاح في المخزون</div>}
                              </div>
                            );
                          })}
                          <button onClick={() => addSerialSlot(item.id, true)}
                            className="mt-1 text-xs text-violet-400 hover:text-violet-300">
                            + إضافة سيريال آخر
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <input type="number" value={discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                    className="input-dark w-28 text-left" />
                </div>
                <div className="flex items-center justify-between py-2 border-t border-violet-700/30">
                  <span className="font-bold text-white text-lg">الإجمالي النهائي</span>
                  <span className="font-black text-violet-400 text-xl">{formatCurrency(totalAfterDiscount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['cash', 'bank', 'instapay', 'credit'] as PaymentMethod[]).map(method => (
                      <button key={method} onClick={() => setPaymentMethod(method)}
                        className={`py-2 px-1 rounded-xl border text-xs font-medium transition-colors ${
                          paymentMethod === method
                            ? 'bg-violet-700/30 border-violet-500/50 text-violet-300'
                            : 'border-white/10 text-gray-400'
                        }`}>
                        {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' :
                         method === 'instapay' ? '📱 انستا' : '⏳ آجل'}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentMethod === 'instapay' && (
                  <input type="text" value={instapayPerson}
                    onChange={e => setInstapayPerson(e.target.value)}
                    className="input-dark w-full" placeholder="اسم صاحب الاستا باي" />
                )}
                <div>
                  <label className="form-label">المبلغ المدفوع</label>
                  <input type="number" value={paid} onChange={e => setPaid(e.target.value)}
                    className="input-dark w-full"
                    placeholder={`من ${formatCurrency(totalAfterDiscount)}`} />
                </div>
                {remaining > 0 && (
                  <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm">
                    <span className="text-red-400">المتبقي: {formatCurrency(remaining)}</span>
                  </div>
                )}
              </div>
            </div>

            {duplicateSerialWarning && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ السيريال "{duplicateSerialWarning}" مكرر في هذه الفاتورة
              </div>
            )}
            {stockError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {stockError}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1">
                {editingInvoice ? '💾 حفظ التعديلات' : '💾 حفظ الفاتورة'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">
                إلغاء
              </button>
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
                <button onClick={() => printInvoice(viewInvoice)}
                  className="btn-secondary flex items-center gap-1 text-sm">
                  <Printer size={14} /> طباعة
                </button>
                <button onClick={() => setViewInvoice(null)}
                  className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><div className="text-xs text-gray-500">العميل</div><div className="font-bold text-white">{viewInvoice.customerName}</div></div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white">{viewInvoice.date}</div></div>
              <div><div className="text-xs text-gray-500">طريقة الدفع</div><div className="font-bold text-white">{paymentMethodLabel(viewInvoice.paymentMethod)}</div></div>
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
                      <td className="py-2 px-3 text-center text-gray-300">{item.unitPrice.toLocaleString('ar-EG')}</td>
                      <td className="py-2 px-3 text-center font-bold text-white">{item.total.toLocaleString('ar-EG')}</td>
                    </tr>
                    {item.serials?.map((s, i) => (
                      <tr key={i} className="border-t border-white/5 bg-violet-900/10">
                        <td colSpan={4} className="py-1 px-6 text-xs text-gray-500 font-mono">
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

      {/* Add Customer */}
      {addCustomerModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">➕ إضافة عميل جديد</h3>
            <div className="space-y-3">
              <input type="text" value={newCustomer.name}
                onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                className="input-dark w-full" placeholder="اسم العميل *" />
              <input type="text" value={newCustomer.phone}
                onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                className="input-dark w-full" placeholder="رقم الهاتف" />
              <select value={newCustomer.type}
                onChange={e => setNewCustomer(p => ({ ...p, type: e.target.value as Customer['type'] }))}
                className="input-dark w-full">
                <option value="individual">فرد</option>
                <option value="company">شركة</option>
                <option value="wholesale">تاجر جملة</option>
                <option value="trader">تاجر</option>
              </select>
            </div>
            {customerDupError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {customerDupError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddCustomer} className="btn-primary flex-1">إضافة</button>
              <button onClick={() => { setAddCustomerModal(false); setCustomerDupError(null); }}
                className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDeleteInvoice && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف فاتورة المبيعات</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل أنت متأكد من حذف فاتورة{' '}
              <span className="text-white font-medium font-mono">{confirmDeleteInvoice.invoiceNumber}</span>؟
              سيتم إرجاع السيريالات وتصحيح رصيد العميل والخزينة تلقائياً.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDeleteInvoice}
                className="flex-1 py-2 rounded-xl bg-red-700/30 border border-red-500/50 text-red-300 hover:bg-red-700/50 text-sm font-medium">
                🗑️ تأكيد الحذف
              </button>
              <button onClick={() => setConfirmDeleteInvoice(null)} className="btn-secondary flex-1">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Quick Purchase ==================== */}
      {showQuickPurchase && (
        <div className="fixed inset-0 bg-black/85 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-orange-700/40 rounded-2xl p-6 w-full max-w-3xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ShoppingCart size={20} className="text-orange-400" />
                فاتورة شراء سريعة
              </h2>
              <button onClick={() => setShowQuickPurchase(false)}
                className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <p className="text-orange-400/70 text-xs mb-4 bg-orange-900/20 border border-orange-700/30 rounded-xl px-3 py-2">
              💡 بعد حفظ فاتورة الشراء، المنتج هيتضاف تلقائياً لفاتورة البيع
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="relative">
                <label className="form-label">المورد *</label>
                <input type="text" value={qpSupplierSearch}
                  onChange={e => { setQpSupplierSearch(e.target.value); setQpShowSupDrop(true); setQpSupplierId(''); }}
                  onFocus={() => setQpShowSupDrop(true)}
                  placeholder="ابحث عن مورد..." className="input-dark w-full" />
                {qpShowSupDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                    {filteredQpSuppliers.slice(0, 8).map(s => (
                      <button key={s.id}
                        onClick={() => { setQpSupplierId(s.id); setQpSupplierSearch(s.name); setQpShowSupDrop(false); }}
                        className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                        {s.name}
                      </button>
                    ))}
                    <button onClick={() => { setAddSupplierModal(true); setQpShowSupDrop(false); setQpQuickAddError(null); }}
                      className="block w-full text-right px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                      + إضافة مورد جديد
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">التاريخ</label>
                <input type="date" value={qpDate} onChange={e => setQpDate(e.target.value)} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <input type="text" value={qpNotes} onChange={e => setQpNotes(e.target.value)} className="input-dark w-full" placeholder="اختياري..." />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white text-sm">المنتجات المشتراة</h3>
                <button onClick={() => {
                  const newItem = makeEmptyPurchItem();
                  setQpItems(prev => [...prev, newItem]);
                  setQpItemSearch(prev => ({ ...prev, [newItem.id]: '' }));
                }} className="btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> إضافة منتج
                </button>
              </div>
              <div className="space-y-3">
                {qpItems.map((item) => {
                  const linkedProduct = products.find(p => p.id === item.productId);
                  return (
                    <div key={item.id} className="bg-[#252545] border border-orange-900/20 rounded-xl p-3">
                      <div className="grid grid-cols-12 gap-2 items-end mb-3">
                        <div className="col-span-12 md:col-span-5 relative">
                          <label className="form-label text-xs">المنتج</label>
                          <input type="text" value={qpItemSearch[item.id] || ''}
                            onChange={e => { setQpItemSearch(prev => ({ ...prev, [item.id]: e.target.value })); setQpShowItemDrop(prev => ({ ...prev, [item.id]: true })); }}
                            onFocus={() => setQpShowItemDrop(prev => ({ ...prev, [item.id]: true }))}
                            placeholder="ابحث أو اكتب اسم المنتج..." className="input-dark w-full text-sm" />
                          {qpShowItemDrop[item.id] && (
                            <div className="absolute top-full mt-1 right-0 left-0 bg-[#1a1a35] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                              {getFilteredProducts(qpItemSearch[item.id] || '').map(p => (
                                <button key={p.id} onClick={() => selectQpProduct(item.id, p)}
                                  className="block w-full text-right px-3 py-2 text-xs text-gray-300 hover:bg-violet-700/20">
                                  <div className="font-medium">{p.name}</div>
                                  <div className="text-gray-500">{p.sku}</div>
                                </button>
                              ))}
                              <button onClick={() => {
                                setShowNewProductModal(item.id);
                                setQpShowItemDrop(prev => ({ ...prev, [item.id]: false }));
                                setQpQuickAddError(null);
                              }}
                                className="block w-full text-right px-3 py-2 text-xs text-violet-400 hover:bg-violet-900/20 border-t border-white/10 font-medium">
                                + إضافة منتج جديد للنظام
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">الكمية</label>
                          <input type="number" min="1" value={item.quantity}
                            onChange={e => syncQpSerials(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                            className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className="form-label text-xs">سعر الشراء</label>
                          <input type="number" value={item.unitPrice}
                            onChange={e => updateQpItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="input-dark w-full text-sm" />
                        </div>
                        <div className="col-span-3 md:col-span-2 flex items-end">
                          <div className="w-full">
                            <label className="form-label text-xs">الإجمالي</label>
                            <div className="text-sm font-bold text-white py-2">{item.total.toLocaleString('ar-EG')}</div>
                          </div>
                        </div>
                        <div className="col-span-1 flex items-end pb-1 justify-end">
                          {qpItems.length > 1 && (
                            <button onClick={() => setQpItems(prev => prev.filter(i => i.id !== item.id))}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {(linkedProduct?.productType === 'serial' || item.serials.length > 0) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-400">
                              السيريالات ({item.serials.filter(s => s.serial).length} / {item.quantity}):
                            </div>
                            <div className="text-xs text-violet-400">💡 Enter للتالي</div>
                          </div>
                          {item.serials.map((sl, si) => {
                            const isDup = sl.serial ? isDuplicateQpSerial(sl.serial, item.id, si) : false;
                            return (
                              <div key={si}>
                                <div className="grid grid-cols-3 gap-2">
                                  <input
                                    ref={el => { qpSerialRefs.current[`${item.id}-${si}`] = el; }}
                                    type="text" value={sl.serial}
                                    onChange={e => updateQpSerialField(item.id, si, 'serial', e.target.value)}
                                    onKeyDown={e => handleQpSerialKeyDown(e, item.id, si)}
                                    className={`input-dark w-full text-xs font-mono ${isDup ? 'border-red-500/60 bg-red-900/10' : ''}`}
                                    placeholder={`Serial ${si + 1}`} />
                                  <input type="text" value={sl.imei1}
                                    onChange={e => updateQpSerialField(item.id, si, 'imei1', e.target.value)}
                                    className="input-dark w-full text-xs" placeholder="IMEI 1" />
                                  <div className="flex gap-1">
                                    <input type="text" value={sl.imei2}
                                      onChange={e => updateQpSerialField(item.id, si, 'imei2', e.target.value)}
                                      className="input-dark flex-1 text-xs" placeholder="IMEI 2" />
                                    {item.serials.length > 1 && (
                                      <button onClick={() => {
                                        const ns = item.serials.filter((_, i) => i !== si);
                                        updateQpItem(item.id, { serials: ns, quantity: ns.length });
                                      }} className="p-1 text-red-400"><X size={12} /></button>
                                    )}
                                  </div>
                                </div>
                                {isDup && <div className="text-xs text-red-400 mt-1">⚠️ هذا السيريال موجود بالفعل</div>}
                              </div>
                            );
                          })}
                          <button onClick={() => addQpSerialSlot(item.id, true)}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">الإجمالي</span>
                  <span className="font-bold text-white text-lg">{formatCurrency(qpSubtotal)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">طريقة الدفع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'credit'] as PaymentMethod[]).map(method => (
                      <button key={method} onClick={() => setQpPayMethod(method)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                          qpPayMethod === method
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
                  <input type="number" value={qpPaid} onChange={e => setQpPaid(e.target.value)}
                    className="input-dark w-full" placeholder={`من ${formatCurrency(qpSubtotal)}`} />
                </div>
                {qpRemaining > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2 text-sm">
                    <span className="text-yellow-400">⏳ متبقي: {formatCurrency(qpRemaining)}</span>
                  </div>
                )}
              </div>
            </div>

            {qpDupWarning && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mb-3 text-red-400">
                ⚠️ السيريال "{qpDupWarning}" موجود بالفعل في المخزون.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleQpSave}
                disabled={!qpSupplierId || qpItems.length === 0}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
                ✅ حفظ فاتورة الشراء وإضافة المنتج للبيع
              </button>
              <button onClick={() => setShowQuickPurchase(false)} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Product Modal */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">➕ إضافة منتج جديد للنظام</h3>
            <div className="space-y-3">
              <input type="text" value={newProductForm.name}
                onChange={e => setNewProductForm(p => ({ ...p, name: e.target.value }))}
                className="input-dark w-full" placeholder="اسم المنتج *" autoFocus />
              <input type="text" value={newProductForm.sku}
                onChange={e => setNewProductForm(p => ({ ...p, sku: e.target.value }))}
                className="input-dark w-full" placeholder="SKU (اتركه فاضي للتوليد التلقائي)" />
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
              <div className="grid grid-cols-2 gap-2">
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
            {qpQuickAddError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {qpQuickAddError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleAddNewProduct(showNewProductModal)} className="btn-primary flex-1">إضافة وتحديد</button>
              <button onClick={() => { setShowNewProductModal(null); setQpQuickAddError(null); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {addSupplierModal && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
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
            {qpQuickAddError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {qpQuickAddError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddSupplier} className="btn-primary flex-1">إضافة</button>
              <button onClick={() => { setAddSupplierModal(false); setQpQuickAddError(null); }} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}