import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PurchaseInvoice, Supplier, Product, SerialItem, InvoiceItem, PaymentMethod, Brand } from '../types';
import { formatCurrency, generateId, getTodayStr, paymentMethodLabel, statusLabel, statusColor, printElement, normalizeForCompare } from '../utils/helpers';
import { Plus, Search, Printer, Eye, X, Trash2, Edit, AlertCircle, Camera, Upload, Download } from 'lucide-react';
import BarcodeScanner, { ScanFeedback } from '../components/BarcodeScanner';
import * as XLSX from 'xlsx';

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
  onCompletePendingPurchase?: (
    serialId: string,
    newCostPrice: number,
    supplierId: string,
    supplierName: string,
    paymentMethod: 'cash' | 'bank' | 'credit',
    paidAmount: number,
    invoiceNumber: string
  ) => { success: boolean; message?: string };
  preselectedSupplierId?: string | null;
  onPreselectedHandled?: () => void;
  preselectedPendingSerialId?: string | null;
  onPreselectedPendingSerialHandled?: () => void;
  // ✅ لفتح قائمة فواتير يوم معيّن مباشرة (مثلاً "مشتريات اليوم" في الرئيسية)
  preselectedDateFilter?: string | null;
  onPreselectedDateFilterHandled?: () => void;
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
  onUpdatePurchaseInvoice, onDeletePurchaseInvoice, onCompletePendingPurchase,
  preselectedSupplierId, onPreselectedHandled,
  preselectedPendingSerialId, onPreselectedPendingSerialHandled,
  preselectedDateFilter, onPreselectedDateFilterHandled,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<PurchaseInvoice | null>(null);
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', type: 'supplier' as Supplier['type'] });
  const [showNewProductModal, setShowNewProductModal] = useState<string | null>(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '', sku: '', upc: '', category: 'phones' as Product['category'],
    brand: 'Apple', productType: 'serial' as Product['productType'],
    costPrice: '', salePrice: ''
  });
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const [showCompletePendingModal, setShowCompletePendingModal] = useState(false);
  const [pendingSerialToComplete, setPendingSerialToComplete] = useState<SerialItem | null>(null);
  const [completePendingForm, setCompletePendingForm] = useState({
    supplierId: '',
    supplierSearch: '',
    newCostPrice: '',
    paymentMethod: 'cash' as 'cash' | 'bank' | 'credit',
    paidAmount: '',
  });
  const [showCompleteSupDrop, setShowCompleteSupDrop] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeSuccess, setCompleteSuccess] = useState<string | null>(null);

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

  // ✅ سكانر الباركود: تحديد نوع وهدف المسح الحالي + رسالة التغذية الراجعة أثناء المسح المستمر
  const [scanTarget, setScanTarget] = useState<
    | { type: 'product'; itemId: string }
    | { type: 'serial'; itemId: string }
    | null
  >(null);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);

  const [showExcelImport, setShowExcelImport] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    supplierName: string; supplier?: Supplier; date: string; invoiceNumber?: string; paymentMethod: PaymentMethod; paid: number;
    rows: Array<{row:number; productId:string; product:Product; productName:string; sku:string; upc:string; quantity:number; unitPrice:number; serials:{serial:string; imei1:string; imei2:string}[]}>;
    missingProducts:string[]; errors:string[]; pendingPriceRows:number;
  } | null>(null);
  const purchaseImportRef = useRef<HTMLInputElement | null>(null);

  const downloadPurchaseTemplate = () => {
    const rows = [{
      'رقم الفاتورة': 'اختياري - مثال PO-1001',
      'التاريخ *': getTodayStr(),
      'اسم المورد / التاجر *': 'ABC Trading',
      'طريقة الدفع': 'cash',
      'المدفوع': 0,
      'UPC': '0194250000000',
      'اسم المنتج *': 'iPad Pro M5 256GB WiFi',
      'SKU': 'IPAD-M5-256-WIFI',
      'الكمية *': 1,
      'سعر الشراء': 0,
      'Serial / IMEI': 'SN-EXAMPLE-001',
      'IMEI1': '',
      'IMEI2': '',
      'ملاحظات': '',
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [22,16,28,15,14,18,34,22,12,16,24,20,20,30].map(w=>({width:w}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PurchaseImport');
    XLSX.writeFile(wb, 'purchase_invoice_import_template.xlsx');
  };

  const normalize = (v:any) => normalizeForCompare(String(v ?? '').trim());
  const findImportProduct = (upc:string, sku:string, name:string) => {
    const nUpc = String(upc || '').trim().toLowerCase();
    const nSku = String(sku || '').trim().toLowerCase();
    const nName = normalize(name);
    return products.find(p =>
      (nUpc && String(p.upc || '').trim().toLowerCase() === nUpc) ||
      (nSku && String(p.sku || '').trim().toLowerCase() === nSku) ||
      (nName && normalize(p.name) === nName)
    );
  };

  const parsePurchaseExcel = async (file: File) => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array', raw:false});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {defval:''});
    const get = (row: Record<string, any>, keys:string[]) => {
      const key = Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));
      return key ? row[key] : '';
    };
    const errors:string[]=[]; const missingSet=new Set<string>(); let pendingPriceRows=0;
    let supplierName=''; let date=getTodayStr(); let invoiceNumber=''; let paymentMethod:PaymentMethod='cash'; let paid=0;
    const rows: Array<{row:number; productId:string; product:Product; productName:string; sku:string; upc:string; quantity:number; unitPrice:number; serials:{serial:string; imei1:string; imei2:string}[]}> = [];
    const serialsInFile = new Set<string>();
    rawRows.forEach((raw,i)=>{
      const rowNo=i+2;
      const rowSupplier=String(get(raw,['اسم المورد / التاجر *','اسم المورد / التاجر','اسم المورد','supplier name','supplier'])||'').trim();
      if (rowSupplier) { if (!supplierName) supplierName=rowSupplier; else if (normalize(rowSupplier)!==normalize(supplierName)) errors.push(`السطر ${rowNo}: ملف الفاتورة يجب أن يحتوي موردًا واحدًا فقط`); }
      const rowDate=String(get(raw,['التاريخ *','التاريخ','date'])||'').trim(); if (rowDate) { if (!date || date===getTodayStr()) date=rowDate; else if (date!==rowDate) errors.push(`السطر ${rowNo}: يوجد أكثر من تاريخ داخل نفس الفاتورة`); }
      const rowInv=String(get(raw,['رقم الفاتورة','invoice number','invoicenumber'])||'').trim(); if (rowInv) { if (!invoiceNumber) invoiceNumber=rowInv; else if (invoiceNumber!==rowInv) errors.push(`السطر ${rowNo}: يوجد أكثر من رقم فاتورة داخل نفس الملف`); }
      const pm=String(get(raw,['طريقة الدفع','payment method','paymentmethod'])||'').trim().toLowerCase(); if (pm) paymentMethod = (['cash','bank','credit','card','instapay','transfer','check'].includes(pm) ? pm : paymentMethod) as PaymentMethod;
      const rowPaid=Number(get(raw,['المدفوع','paid'])||''); if (!Number.isNaN(rowPaid) && rowPaid>0) paid=rowPaid;
      const productName=String(get(raw,['اسم المنتج *','اسم المنتج','product name','name'])||'').trim();
      const upc=String(get(raw,['upc','UPC','الـUPC','كود UPC'])||'').trim();
      const sku=String(get(raw,['sku','SKU'])||'').trim();
      const quantity=Number(get(raw,['الكمية *','الكمية','quantity','qty'])||0);
      const unitRaw=String(get(raw,['سعر الشراء','سعر الشراء *','سعر التكلفة','unit price','unitprice','cost'])||'').trim();
      const unitPrice=unitRaw===''?0:Number(unitRaw);
      const serial=String(get(raw,['Serial / IMEI','serial','السيريال','imei'])||'').trim();
      const imei1=String(get(raw,['IMEI1','imei1'])||'').trim();
      const imei2=String(get(raw,['IMEI2','imei2'])||'').trim();
      if (!productName && !upc && !sku) { errors.push(`السطر ${rowNo}: لا يوجد منتج أو UPC أو SKU`); return; }
      if (!Number.isFinite(quantity) || quantity<=0) { errors.push(`السطر ${rowNo}: الكمية غير صحيحة`); return; }
      if (!Number.isFinite(unitPrice) || unitPrice<0) { errors.push(`السطر ${rowNo}: سعر الشراء غير صحيح`); return; }
      const product=findImportProduct(upc,sku,productName);
      if (!product) { missingSet.add(upc || sku || productName); return; }
      if (unitPrice===0 && product.productType==='serial' && serial) pendingPriceRows++;
      if (product.productType==='serial') {
        if (quantity !== 1) { errors.push(`السطر ${rowNo}: منتج السيريال يجب أن تكون كميته 1 لكل سيريال (كرر السطر لكل جهاز)`); return; }
        if (!serial) { errors.push(`السطر ${rowNo}: المنتج "${product.name}" سيريال ويحتاج Serial/IMEI`); return; }
        const key=serial.toLowerCase(); if (serialsInFile.has(key)) { errors.push(`السطر ${rowNo}: السيريال ${serial} مكرر داخل الملف`); return; }
        if (serials.some(s=>String(s.serial).trim().toLowerCase()===key && !s.purchasePricePending)) { errors.push(`السطر ${rowNo}: السيريال ${serial} موجود بالفعل في المخزون`); return; }
        serialsInFile.add(key);
      }
      rows.push({row:rowNo,productId:product.id,product,productName:product.name,sku:product.sku,upc:product.upc||'',quantity,unitPrice,serials:serial?[{serial,imei1,imei2}]:[]});
    });
    if (!supplierName) errors.push('اسم المورد / التاجر مطلوب');
    const supplier = suppliers.find(s=>normalize(s.name)===normalize(supplierName));
    if (!supplier && supplierName) errors.push(`المورد غير موجود: ${supplierName} — أضفه أولًا من صفحة الموردين والتجار`);
    setImportPreview({supplierName,supplier,date,invoiceNumber:invoiceNumber||undefined,paymentMethod,paid,rows,missingProducts:[...missingSet],errors,pendingPriceRows});
    setShowExcelImport(true);
  };

  const handlePurchaseExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; e.target.value=''; if(!file) return;
    try { await parsePurchaseExcel(file); } catch { setImportPreview({supplierName:'',date:getTodayStr(),paymentMethod:'cash',paid:0,rows:[],missingProducts:[],errors:['ملف Excel غير صالح أو لا يمكن قراءته.'],pendingPriceRows:0}); setShowExcelImport(true); }
  };

  const commitPurchaseImport = () => {
    if (!importPreview) return;
    if (importPreview.errors.length || importPreview.missingProducts.length || !importPreview.supplier || !importPreview.rows.length) return;
    const grouped = new Map<string, typeof importPreview.rows[number]>();
    importPreview.rows.forEach(r=>{
      const key=r.productId;
      const existing=grouped.get(key);
      if (!existing) grouped.set(key,{...r,serials:[...r.serials]});
      else { existing.quantity += r.quantity; existing.serials.push(...r.serials); }
    });
    const invoiceId=generateId();
    const existingNums=purchaseInvoices.map(inv=>parseInt(inv.invoiceNumber.split('-').pop()||'0',10)).filter(n=>!Number.isNaN(n));
    const next=Math.max(settings.lastPurchaseInvoiceNum,...existingNums,1000)+1;
    const invoiceNumber=importPreview.invoiceNumber || `${settings.purchasePrefix}-${String(next).padStart(4,'0')}`;
    const items:InvoiceItem[]=[...grouped.values()].map(r=>({id:generateId(),productId:r.productId,productName:r.productName,sku:r.sku,quantity:r.quantity,unitPrice:r.unitPrice,discount:0,discountType:'fixed' as const,taxRate:0,total:r.quantity*r.unitPrice,serials:r.serials.filter(s=>s.serial)}));
    const subtotal=items.reduce((s,i)=>s+i.total,0);
    const paidAmount=Math.max(0,Math.min(importPreview.paid,subtotal));
    const remaining=Math.max(0,subtotal-paidAmount);
    const invoice:PurchaseInvoice={id:invoiceId,invoiceNumber,supplierId:importPreview.supplier!.id,supplierName:importPreview.supplier!.name,date:importPreview.date||getTodayStr(),items,subtotal,taxTotal:0,discount:0,total:subtotal,paid:paidAmount,remaining,status:subtotal===0?'unpaid':remaining<=0?'paid':paidAmount>0?'partial':'unpaid',paymentMethod:importPreview.paymentMethod,createdAt:new Date().toISOString()};
    const newSerials:SerialItem[]=[];
    items.forEach(item=>item.serials?.forEach(sl=>newSerials.push({id:generateId(),productId:item.productId,productName:item.productName,serial:sl.serial,imei1:sl.imei1||undefined,imei2:sl.imei2||undefined,status:'available',purchaseInvoiceId:invoiceId,costPrice:item.unitPrice,salePrice:undefined,createdAt:new Date().toISOString(),purchasePricePending:item.unitPrice===0})));
    onAddPurchaseInvoice(invoice); if(newSerials.length) onAddSerials(newSerials);
    setShowExcelImport(false); setImportPreview(null);
  };


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

  const openCompletePendingModal = useCallback((serialId: string) => {
    const serial = serials.find(s => s.id === serialId);
    if (!serial) return;
    setPendingSerialToComplete(serial);
    setCompletePendingForm({
      supplierId: '',
      supplierSearch: '',
      newCostPrice: '',
      paymentMethod: 'cash',
      paidAmount: '',
    });
    setCompleteError(null);
    setCompleteSuccess(null);
    setShowCompletePendingModal(true);
  }, [serials]);

  useEffect(() => {
    if (preselectedPendingSerialId) {
      openCompletePendingModal(preselectedPendingSerialId);
      onPreselectedPendingSerialHandled?.();
    }
  }, [preselectedPendingSerialId]);

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

  useEffect(() => {
    if (preselectedDateFilter) {
      setDateFilter(preselectedDateFilter);
      setSearch('');
      onPreselectedDateFilterHandled?.();
    }
  }, [preselectedDateFilter]);

  const handleCompletePending = () => {
    if (!pendingSerialToComplete) return;
    if (!completePendingForm.supplierId) {
      setCompleteError('اختر المورد أولاً');
      return;
    }
    const newPrice = parseFloat(completePendingForm.newCostPrice);
    if (!newPrice || newPrice <= 0) {
      setCompleteError('أدخل سعر الشراء الحقيقي');
      return;
    }

    const paidAmount = parseFloat(completePendingForm.paidAmount) || 0;
    const selectedSupplier = suppliers.find(s => s.id === completePendingForm.supplierId);

    const existingNumbers = purchaseInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextNum = Math.max(settings.lastPurchaseInvoiceNum, ...existingNumbers, 1000) + 1;
    const invoiceNumber = `${settings.purchasePrefix}-${String(nextNum).padStart(4, '0')}`;

    if (onCompletePendingPurchase) {
      const result = onCompletePendingPurchase(
        pendingSerialToComplete.id,
        newPrice,
        completePendingForm.supplierId,
        selectedSupplier?.name || '',
        completePendingForm.paymentMethod,
        paidAmount,
        invoiceNumber
      );

      if (result && !result.success) {
        setCompleteError(result.message || 'حدث خطأ');
        return;
      }
    }

    setCompleteSuccess(`✅ تم تحديد سعر شراء ${pendingSerialToComplete.productName} بـ ${formatCurrency(newPrice)} بنجاح`);
    setTimeout(() => {
      setShowCompletePendingModal(false);
      setPendingSerialToComplete(null);
      setCompleteSuccess(null);
    }, 2000);
  };

  const filtered = purchaseInvoices.filter(inv => {
    if (dateFilter && inv.date !== dateFilter) return false;
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

  const filteredSuppliersForComplete = suppliers.filter(s =>
    s.name.toLowerCase().includes(completePendingForm.supplierSearch.toLowerCase()) ||
    (s.phone || '').includes(completePendingForm.supplierSearch)
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
      const existingSerial = serials.find(s => s.serial.trim().toLowerCase() === normalized);
      if (existingSerial?.purchasePricePending) return false;
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

  // ✅ البحث عن منتج بالكود الممسوح (UPC أو SKU) - يُستخدم مع سكانر الباركود
  const findProductByCode = (code: string): Product | undefined => {
    const normalized = code.trim().toLowerCase();
    return products.find(p =>
      (p.upc && p.upc.trim().toLowerCase() === normalized) ||
      p.sku.trim().toLowerCase() === normalized
    );
  };

  // ✅ لما الكاميرا تمسح كود لتحديد منتج (وضع "single" - يقفل نفسه تلقائياً بعد المسح)
  const handleProductScan = (code: string) => {
    if (!scanTarget || scanTarget.type !== 'product') return;
    const product = findProductByCode(code);
    if (product) {
      selectProduct(scanTarget.itemId, product);
    } else {
      // مفيش منتج مسجل بهذا الكود - نفتح فورم إضافة منتج جديد ونعبي الـ UPC تلقائياً
      setShowNewProductModal(scanTarget.itemId);
      setNewProductForm(p => ({ ...p, upc: code }));
      setQuickAddError(null);
    }
  };

  // ✅ لما الكاميرا تمسح سيريال/IMEI (وضع "continuous" - يفضل شغال لحد ما يتقفل يدوياً)
  const handleSerialScan = (code: string) => {
    if (!scanTarget || scanTarget.type !== 'serial') return;
    const itemId = scanTarget.itemId;
    const item = purchItems.find(i => i.id === itemId);
    if (!item) return;

    const emptyIndex = item.serials.findIndex(s => !s.serial.trim());
    const targetIndex = emptyIndex >= 0 ? emptyIndex : item.serials.length;

    if (isDuplicateSerial(code, itemId, targetIndex)) {
      setScanFeedback({ id: Date.now(), type: 'error', message: `⚠️ السيريال ${code} مكرر أو موجود بالفعل في المخزون` });
      return;
    }

    if (emptyIndex >= 0) {
      updateSerialField(itemId, emptyIndex, 'serial', code);
    } else {
      setPurchItems(prev => prev.map(it => {
        if (it.id !== itemId) return it;
        const newSerials = [...it.serials, { serial: code, imei1: '', imei2: '' }];
        return { ...it, serials: newSerials, quantity: newSerials.length, total: Math.max(0, it.unitPrice * newSerials.length - it.discount) };
      }));
    }

    setScanFeedback({ id: Date.now(), type: 'success', message: `✅ تمت إضافة السيريال ${code}` });
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
        status: subtotal === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        paymentMethod,
        notes,
      };
      onUpdatePurchaseInvoice(updatedInvoice);
      resetForm();
      setShowForm(false);
      return;
    }

    const invoiceId = generateId();
    const existingPurchNumbers = purchaseInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextPurchNum = Math.max(settings.lastPurchaseInvoiceNum, ...existingPurchNumbers, 1000) + 1;
    const invoiceNumber = `${settings.purchasePrefix}-${String(nextPurchNum).padStart(4, '0')}`;
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
            purchasePricePending: item.unitPrice === 0 ? true : false,
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
      status: subtotal === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
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
    const costPrice = parseFloat(newProductForm.costPrice) || 0;
    const product: Product = {
      id: generateId(),
      name: newProductForm.name,
      sku: newProductForm.sku,
      upc: newProductForm.upc || undefined,
      category: newProductForm.category,
      brand: newProductForm.brand,
      productType: newProductForm.productType,
      costPrice,
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
    setNewProductForm({ name: '', sku: '', upc: '', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: '', salePrice: '' });
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
        <div className="flex items-center gap-2">
          <button onClick={downloadPurchaseTemplate} className="btn-secondary flex items-center gap-2"><Download size={14} /> نموذج Excel</button>
          <button onClick={() => purchaseImportRef.current?.click()} className="btn-secondary flex items-center gap-2"><Upload size={14} /> استيراد Excel</button>
          <input ref={purchaseImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePurchaseExcel} />
          <button onClick={openNewForm} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> فاتورة شراء جديدة
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث برقم الفاتورة أو اسم المورد..."
          className="input-dark w-full pr-9"
        />
      </div>

      {dateFilter && (
        <div className="flex items-center justify-between bg-blue-900/20 border border-blue-700/30 rounded-xl px-4 py-2 text-sm">
          <span className="text-blue-300">📅 بيتم عرض فواتير يوم {dateFilter} فقط ({filtered.length} فاتورة)</span>
          <button onClick={() => setDateFilter(null)} className="text-xs text-red-400 hover:underline">إلغاء الفلتر (عرض الكل)</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-elevated border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-blue-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.total, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المشتريات</div>
        </div>
        <div className="bg-elevated border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.paid, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المدفوع</div>
        </div>
        <div className="bg-elevated border border-red-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{formatCurrency(purchaseInvoices.reduce((s, i) => s + i.remaining, 0))}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي المتبقي</div>
        </div>
      </div>

      <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-hidden">
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
                    <button onClick={() => openEditForm(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400" title="تعديل"><Edit size={14} /></button>
                    <button onClick={() => setConfirmDeleteInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400" title="حذف"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══ مودال فاتورة الشراء ══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-4xl my-4">
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
                  <div className="absolute top-full mt-1 right-0 left-0 bg-muted-bg border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
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
                    <div key={item.id} className={`bg-muted-bg border rounded-xl p-4 ${
                      isSerialProduct ? 'border-blue-700/30' : 'border-violet-900/20'
                    }`}>
                      <div className="grid grid-cols-12 gap-2 items-end mb-3">
                        <div className="col-span-12 md:col-span-5 relative">
                          <div className="flex items-center justify-between mb-1">
                            <label className="form-label text-xs !mb-0">المنتج</label>
                            <button
                              type="button"
                              onClick={() => setScanTarget({ type: 'product', itemId: item.id })}
                              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                            >
                              <Camera size={12} /> مسح UPC
                            </button>
                          </div>
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
                            <div className="absolute top-full mt-1 right-0 left-0 bg-elevated border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto">
                              {getFilteredProducts(itemSearch[item.id] || '').length === 0 && (
                                <div className="px-3 py-2 text-xs text-gray-500 text-center">
                                  لا يوجد منتج بهذا الاسم
                                </div>
                              )}
                              {getFilteredProducts(itemSearch[item.id] || '').map(p => (
                                <button key={p.id} onClick={() => selectProduct(item.id, p)}
                                  className="block w-full text-right px-3 py-2 text-xs text-gray-300 hover:bg-violet-700/20">
                                  <div className="font-medium">{p.name}</div>
                                  <div className="text-gray-500">
                                    {p.sku} • مخزون متاح: {getAvailableStock(p.id)}
                                    {p.productType === 'serial' && <span className="text-blue-400 mr-2">• بسيريال</span>}
                                  </div>
                                </button>
                              ))}
                              <button
                                onClick={() => {
                                  setShowNewProductModal(item.id);
                                  setShowItemDrop(prev => ({ ...prev, [item.id]: false }));
                                  setQuickAddError(null);
                                  setNewProductForm(p => ({ ...p, name: itemSearch[item.id] || '' }));
                                }}
                                className="block w-full text-right px-3 py-2.5 text-sm text-violet-300 hover:bg-violet-900/30 border-t border-violet-700/30 font-bold bg-violet-900/10"
                              >
                                ➕ منتج جديد غير موجود؟ اضغط هنا لإضافته
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

                      {item.productId && item.unitPrice === 0 && (
                        <div className="mb-3 flex items-center gap-2 bg-orange-900/10 border border-orange-700/20 rounded-lg px-3 py-2">
                          <AlertCircle size={14} className="text-orange-400 shrink-0" />
                          <span className="text-xs text-orange-300">
                            سعر الشراء = 0 ⟵ سيُسجَّل كـ <strong>سعر معلّق</strong>، يمكن تحديثه لاحقاً من لوحة التحكم
                          </span>
                        </div>
                      )}

                      {isSerialProduct && (
                        <div className="mb-3 flex items-center gap-2 bg-blue-900/10 border border-blue-700/20 rounded-lg px-3 py-2">
                          <AlertCircle size={14} className="text-blue-400 shrink-0" />
                          <span className="text-xs text-blue-300">
                            هذا المنتج <strong>بسيريال</strong> — إدخال السيريالات إلزامي
                          </span>
                        </div>
                      )}

                      {(linkedProduct?.productType === 'serial' || item.serials.length > 0) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="text-xs text-gray-400 font-medium">
                              السيريالات ({item.serials.filter(s => s.serial).length} / {item.quantity}):
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setScanTarget({ type: 'serial', itemId: item.id })}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              >
                                <Camera size={12} /> مسح بالكاميرا
                              </button>
                              <div className="text-xs text-violet-400">
                                💡 Enter للتالي يدوياً
                              </div>
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
                                  <div className="text-xs text-red-400 mt-1">⚠️ هذا السيريال موجود بالفعل</div>
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
                ⚠️ السيريال "{duplicateSerialWarning}" مكرر أو موجود بالفعل.
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

      {/* ══ مودال استكمال سعر شراء سيريال معلّق ══ */}
      {showCompletePendingModal && pendingSerialToComplete && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-elevated border border-orange-700/40 rounded-2xl p-5 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">💰</span>
              <div>
                <h3 className="font-bold text-white">تحديد سعر الشراء</h3>
                <p className="text-xs text-gray-400">استكمال سعر شراء سيريال معلّق</p>
              </div>
            </div>

            <div className="bg-orange-900/10 border border-orange-700/20 rounded-xl p-3 mb-4">
              <div className="text-sm font-medium text-white mb-1">{pendingSerialToComplete.productName}</div>
              <div className="text-xs text-gray-400 font-mono">
                Serial: {pendingSerialToComplete.serial}
                {pendingSerialToComplete.imei1 && ` | IMEI1: ${pendingSerialToComplete.imei1}`}
              </div>
              <div className="text-xs text-orange-400 mt-1">⏳ سعر الشراء الحالي: معلّق (0)</div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <label className="form-label">المورد *</label>
                <input
                  type="text"
                  value={completePendingForm.supplierSearch}
                  onChange={e => setCompletePendingForm(p => ({ ...p, supplierSearch: e.target.value, supplierId: '' }))}
                  onFocus={() => setShowCompleteSupDrop(true)}
                  placeholder="ابحث عن مورد..."
                  className="input-dark w-full"
                />
                {showCompleteSupDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-muted-bg border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
                    {filteredSuppliersForComplete.slice(0, 8).map(s => (
                      <button key={s.id}
                        onClick={() => {
                          setCompletePendingForm(p => ({ ...p, supplierId: s.id, supplierSearch: s.name }));
                          setShowCompleteSupDrop(false);
                        }}
                        className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">سعر الشراء الحقيقي *</label>
                <input
                  type="number"
                  value={completePendingForm.newCostPrice}
                  onChange={e => setCompletePendingForm(p => ({ ...p, newCostPrice: e.target.value }))}
                  className="input-dark w-full"
                  placeholder="أدخل سعر الشراء الفعلي"
                />
              </div>

              <div>
                <label className="form-label">طريقة الدفع</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'bank', 'credit'] as const).map(method => (
                    <button key={method}
                      onClick={() => setCompletePendingForm(p => ({ ...p, paymentMethod: method }))}
                      className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                        completePendingForm.paymentMethod === method
                          ? 'bg-violet-700/30 border-violet-500/50 text-violet-300'
                          : 'border-white/10 text-gray-400'
                      }`}>
                      {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' : '⏳ آجل'}
                    </button>
                  ))}
                </div>
              </div>

              {completePendingForm.paymentMethod !== 'credit' && (
                <div>
                  <label className="form-label">المبلغ المدفوع</label>
                  <input
                    type="number"
                    value={completePendingForm.paidAmount}
                    onChange={e => setCompletePendingForm(p => ({ ...p, paidAmount: e.target.value }))}
                    className="input-dark w-full"
                    placeholder={`من ${formatCurrency(parseFloat(completePendingForm.newCostPrice) || 0)}`}
                  />
                </div>
              )}
            </div>

            {completeError && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-red-400">
                ⚠️ {completeError}
              </div>
            )}

            {completeSuccess && (
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl px-3 py-2 text-sm mt-3 text-green-400">
                {completeSuccess}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={handleCompletePending} className="btn-primary flex-1">
                💾 تأكيد وحفظ السعر
              </button>
              <button
                onClick={() => {
                  setShowCompletePendingModal(false);
                  setPendingSerialToComplete(null);
                  setCompleteError(null);
                }}
                className="btn-secondary flex-1"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال إضافة منتج جديد */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">➕ إضافة منتج جديد</h3>
            <div className="space-y-3">
              <input type="text" value={newProductForm.name}
                onChange={e => setNewProductForm(p => ({ ...p, name: e.target.value }))}
                className="input-dark w-full" placeholder="اسم المنتج *" />
              <input type="text" value={newProductForm.sku}
                onChange={e => setNewProductForm(p => ({ ...p, sku: e.target.value }))}
                className="input-dark w-full" placeholder="SKU *" />
              <input type="text" value={newProductForm.upc}
                onChange={e => setNewProductForm(p => ({ ...p, upc: e.target.value }))}
                className="input-dark w-full" placeholder="UPC / الباركود (اختياري - أو امسحه بالكاميرا)" />
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
              <p className="text-xs text-gray-500">
                💡 لو السعر غير معروف، اتركه صفراً وسيُسجَّل كـ "سعر معلّق" يمكن تحديثه لاحقاً
              </p>
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

      {/* مودال عرض الفاتورة */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
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

      {/* مودال إضافة مورد */}
      {addSupplierModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-5 w-full max-w-sm">
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

      {showExcelImport && importPreview && (
        <div className="fixed inset-0 bg-black/85 z-[70] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-5xl my-4">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-xl font-bold text-white">📥 استيراد فاتورة شراء من Excel</h2><p className="text-xs text-gray-500 mt-1">لن يتم حفظ أي شيء حتى تضغط استيراد بعد نجاح التحقق.</p></div>
              <button onClick={() => { setShowExcelImport(false); setImportPreview(null); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="bg-muted-bg rounded-xl p-3"><div className="text-xs text-gray-500">المورد</div><div className="font-bold text-white text-sm">{importPreview.supplierName || '-'}</div></div>
              <div className="bg-muted-bg rounded-xl p-3"><div className="text-xs text-gray-500">التاريخ</div><div className="font-bold text-white text-sm">{importPreview.date || '-'}</div></div>
              <div className="bg-muted-bg rounded-xl p-3"><div className="text-xs text-gray-500">البنود</div><div className="font-bold text-white text-sm">{importPreview.rows.length}</div></div>
              <div className="bg-muted-bg rounded-xl p-3"><div className="text-xs text-gray-500">منتجات غير موجودة</div><div className="font-bold text-red-400 text-sm">{importPreview.missingProducts.length}</div></div>
              <div className="bg-muted-bg rounded-xl p-3"><div className="text-xs text-gray-500">سيريالات بسعر معلق</div><div className="font-bold text-yellow-400 text-sm">{importPreview.pendingPriceRows}</div></div>
            </div>
            {importPreview.missingProducts.length > 0 && <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 mb-3"><div className="font-bold text-red-300">منتجات غير موجودة</div><div className="text-xs text-red-200 mt-1">أنشئ هذه المنتجات أولًا من صفحة المنتجات ثم أعد استيراد الملف:</div><div className="mt-2 flex flex-wrap gap-2">{importPreview.missingProducts.map(x => <span key={x} className="px-2 py-1 rounded-lg bg-red-950/40 text-xs text-red-200">{x}</span>)}</div></div>}
            {importPreview.errors.length > 0 && <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 mb-3"><div className="font-bold text-red-300">مشاكل تحتاج مراجعة</div><div className="mt-2 text-xs text-red-200 space-y-1 max-h-40 overflow-auto">{importPreview.errors.map((x, i) => <div key={i}>• {x}</div>)}</div></div>}
            {importPreview.pendingPriceRows > 0 && <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-3 mb-3 text-sm text-yellow-200">الصفوف التي بها سعر شراء = 0 ستُسجل كسيريالات <b>بسعر شراء معلّق</b> ويمكن إكمال سعرها لاحقًا.</div>}
            <div className="overflow-x-auto border border-white/10 rounded-xl">
              <table className="w-full text-sm"><thead className="bg-violet-900/20"><tr><th className="text-right p-2">السطر</th><th className="text-right p-2">المنتج</th><th className="text-center p-2">الكمية</th><th className="text-center p-2">السعر</th><th className="text-center p-2">السيريالات</th></tr></thead>
              <tbody>{importPreview.rows.map(r => <tr key={`${r.row}-${r.productId}`} className="border-t border-white/5"><td className="p-2 text-gray-500">{r.row}</td><td className="p-2 text-white">{r.productName}<div className="text-xs text-gray-500">{r.upc || r.sku || '-'}</div></td><td className="p-2 text-center">{r.quantity}</td><td className={`p-2 text-center ${r.unitPrice === 0 ? 'text-yellow-400' : 'text-white'}`}>{formatCurrency(r.unitPrice)}</td><td className="p-2 text-center font-mono text-xs">{r.serials.length ? r.serials.map(s => s.serial).join(', ') : '-'}</td></tr>)}{importPreview.rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">لا توجد بنود صالحة للاستيراد</td></tr>}</tbody></table>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4"><button onClick={() => { setShowExcelImport(false); setImportPreview(null); }} className="btn-secondary">إغلاق</button><button disabled={!!importPreview.errors.length || !!importPreview.missingProducts.length || !importPreview.supplier || !importPreview.rows.length} onClick={commitPurchaseImport} className="btn-primary disabled:opacity-40">استيراد الفاتورة</button></div>
          </div>
        </div>
      )}

      {/* مودال تأكيد الحذف */}
      {confirmDeleteInvoice && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-elevated border border-red-700/40 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-2">🗑️ حذف فاتورة الشراء</h3>
            <p className="text-gray-400 text-sm mb-4">
              هل أنت متأكد من حذف فاتورة{' '}
              <span className="text-white font-medium font-mono">{confirmDeleteInvoice.invoiceNumber}</span>؟
              <br />
              سيتم خصم الكمية من المخزون وحذف السيريالات المرتبطة وتصحيح رصيد المورد والخزينة تلقائيًا.
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

      {/* ✅ سكانر الباركود - يفتح لتحديد منتج (مسح واحد يقفل نفسه) أو لإدخال عدة سيريالات (مسح مستمر) */}
      {scanTarget && (
        <BarcodeScanner
          title={scanTarget.type === 'product' ? '📷 امسح UPC / باركود المنتج' : '📷 امسح السيريال / IMEI'}
          mode={scanTarget.type === 'product' ? 'single' : 'continuous'}
          onDetected={(code) => {
            if (scanTarget.type === 'product') handleProductScan(code);
            else handleSerialScan(code);
          }}
          onClose={() => { setScanTarget(null); setScanFeedback(null); }}
          feedback={scanFeedback}
        />
      )}
    </div>
  );
}