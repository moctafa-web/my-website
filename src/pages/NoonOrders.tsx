import React, { useState, useRef, useMemo } from 'react';
import { NoonOrder, NoonOrderItem, NoonAdjustment, Product, SerialItem, OrderStatus, OrderPlatform } from '../types';
import { ADJ_KIND_LABEL, clawbackDone, clawbackPending, returnState } from '../utils/noonReturns';
import { formatCurrency, generateId, getTodayStr, statusLabel, statusColor, getProductUPCs, productHasUPC, normalizeDateValue } from '../utils/helpers';
import { parseImportDate } from '../utils/importDate';
import NoonPasteImport from '../components/NoonPasteImport';
import { Plus, Search, X, Upload, Download, CheckSquare, Square, Banknote, Edit } from 'lucide-react';
import * as XLSX from 'xlsx';
import NoonSyncModal from '../components/NoonSyncModal';
import { useGlobalDropdownDismiss } from '../utils/useGlobalDropdownDismiss';

interface Props {
  noonOrders: NoonOrder[];
  products: Product[];
  serials: SerialItem[];
  onAddNoonOrder: (o: NoonOrder) => { success: boolean; message?: string; merged?: boolean } | void;
  onUpdateNoonOrder: (o: NoonOrder) => void;
  onAddNoonOrders: (os: NoonOrder[]) => { addedCount: number; mergedCount: number } | void;
  onSettleNoonOrders: (settlements: { orderId: string; settledAmount: number; settledDate?: string }[], opts?: { actualTotal?: number; adjustments?: { orderId: string; amount: number; kind: NoonAdjustment['kind']; note?: string }[] }) => void;
  onReturnNoonOrders: (ids: string[], opts: { date?: string; restock: boolean }) => void;
}

const PLATFORMS: { id: OrderPlatform; label: string; emoji: string; color: string }[] = [
  { id: 'noon', label: 'Noon', emoji: '🟡', color: 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300' },
  { id: 'amazon', label: 'Amazon', emoji: '🟠', color: 'bg-orange-900/30 border-orange-700/40 text-orange-300' },
  { id: 'other', label: 'أخرى', emoji: '🔵', color: 'bg-blue-900/30 border-blue-700/40 text-blue-300' },
];

// اختيار سيريال: بحث بجزء من السيريال/IMEI، وتحته قايمة تعلّم منها الجهاز (زي فاتورة البيع)
function SerialPicker({ candidates, value, usedElsewhere, onPick }: {
  candidates: SerialItem[];
  value: string;
  usedElsewhere: Set<string>;
  onPick: (s: SerialItem | null) => void;
}) {
  const [q, setQ] = useState('');
  const LIMIT = 30;
  const term = q.trim().toLowerCase();
  const matches = candidates.filter(s =>
    !usedElsewhere.has(s.serial) &&
    (!term || s.serial.toLowerCase().includes(term) || (s.imei1 || '').toLowerCase().includes(term) || (s.imei2 || '').toLowerCase().includes(term)));
  const shown = matches.slice(0, LIMIT);
  const chosen = candidates.find(s => s.serial === value);
  return (
    <div className="mb-2">
      <label className="text-xs text-gray-500 mb-1 block">السيريال ({candidates.length} متاح لهذا المنتج):</label>
      {value && (
        <div className="flex items-center justify-between gap-2 mb-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-1.5">
          <div className="text-xs">
            <span className="text-green-300 font-mono" dir="ltr">✓ {value}</span>
            {chosen?.imei1 ? <span className="text-gray-400 font-mono mr-2" dir="ltr">IMEI: {chosen.imei1}</span> : null}
          </div>
          <button type="button" onClick={() => onPick(null)} className="text-xs text-red-300 hover:underline">إلغاء الاختيار</button>
        </div>
      )}
      <input type="text" value={q} onChange={e => setQ(e.target.value)} dir="ltr"
        className="input-dark w-full text-xs font-mono" placeholder="اكتب جزء من السيريال أو IMEI للتصفية..." />
      <div className="mt-1 max-h-40 overflow-y-auto border border-border rounded-lg">
        {shown.length === 0 ? (
          <div className="p-2 text-xs text-gray-500 text-center">لا يوجد سيريال مطابق</div>
        ) : shown.map(s => (
          <button type="button" key={s.id} onClick={() => { onPick(s); setQ(''); }}
            className={`w-full text-right px-3 py-1.5 text-xs font-mono flex items-center justify-between gap-2 border-b border-border/40 last:border-0 hover:bg-white/5 ${s.serial === value ? 'bg-green-900/20 text-green-300' : 'text-gray-200'}`}>
            <span dir="ltr">{s.serial}</span>
            <span className="text-gray-500" dir="ltr">{s.imei1 ? `IMEI: ${s.imei1}` : ''}{s.serial === value ? '  ✓' : ''}</span>
          </button>
        ))}
        {matches.length > LIMIT && <div className="p-1.5 text-[11px] text-gray-500 text-center">و {matches.length - LIMIT} كمان، اكتب أكتر لتضييق القايمة</div>}
      </div>
    </div>
  );
}

export default function NoonOrders({ noonOrders, products, serials, onAddNoonOrder, onUpdateNoonOrder, onAddNoonOrders, onSettleNoonOrders, onReturnNoonOrders }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<NoonOrder | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [viewOrder, setViewOrder] = useState<NoonOrder | null>(null);
  const [viewMode, setViewMode] = useState<'orders' | 'reports'>('orders');
  const [selectedReportMonth, setSelectedReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const settleFileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [platform, setPlatform] = useState<OrderPlatform>('noon');
  const [orderNumber, setOrderNumber] = useState('');
  const [shipmentNumber, setShipmentNumber] = useState('');
  const [orderDate, setOrderDate] = useState(getTodayStr());
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderItems, setOrderItems] = useState<(NoonOrderItem & { tempSerial: string; tempImei1: string; tempImei2: string })[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDrop, setShowProductDrop] = useState(false);

  useGlobalDropdownDismiss(() => {
    setShowProductDrop(false);
  });

  // Bulk settlement state
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmounts, setSettleAmounts] = useState<Record<string, string>>({});
  const [settleIds, setSettleIds] = useState<string[]>([]);
  const [actualTotal, setActualTotal] = useState('');
  const [importNote, setImportNote] = useState('');
  const [adjRows, setAdjRows] = useState<{ orderNumber: string; kind: NoonAdjustment['kind']; amount: string; note: string }[]>([]);
  const [returnIds, setReturnIds] = useState<string[] | null>(null);
  const [returnDate, setReturnDate] = useState(getTodayStr());
  const [returnRestock, setReturnRestock] = useState(true);
  const [settleDate, setSettleDate] = useState(getTodayStr());

  const filtered = noonOrders.filter(o => {
    const matchSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      o.items.some(it => (it.productName || '').toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const od = normalizeDateValue(o.date);
    const matchDate = (!dateFrom || od >= dateFrom) && (!dateTo || od <= dateTo);
    return (matchSearch || (o.shipmentNumber || '').toLowerCase().includes(search.toLowerCase())) && matchStatus && matchDate;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // تقرير الشهر
  const monthReportStats = useMemo(() => {
    const isInMonth = (dateStr: string) => {
      const d = new Date(dateStr);
      const [year, month] = selectedReportMonth.split('-').map(Number);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    };

    const monthOrders = noonOrders.filter(o => isInMonth(o.date));
    const statusCounts = {
      pending: monthOrders.filter(o => o.status === 'pending').length,
      shipped: monthOrders.filter(o => o.status === 'shipped').length,
      delivered: monthOrders.filter(o => o.status === 'delivered').length,
      returned: monthOrders.filter(o => o.status === 'returned').length,
      paid: monthOrders.filter(o => o.status === 'paid').length,
      canceled: monthOrders.filter(o => o.status === 'canceled').length,
      settled: monthOrders.filter(o => o.status === 'settled').length,
    };

    const totalItems = monthOrders.reduce((sum, o) => sum + o.items.length, 0);
    const totalCost = monthOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + (i.costPrice || 0), 0), 0);
    const totalRevenue = monthOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price, 0), 0);
    const totalProfit = monthOrders.reduce((sum, o) => sum + (o.settlementProfit || 0), 0);

    return {
      totalOrders: monthOrders.length,
      statusCounts,
      totalItems,
      totalCost,
      totalRevenue,
      totalProfit,
      profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0',
    };
  }, [noonOrders, selectedReportMonth]);

  // ✅ حساب المخزون الحقيقي لأي منتج (سيريالات متاحة فعليًا للمنتجات بسيريالات، أو stock للمنتجات العادية)
  const getAvailableStock = (product: Product): number => {
    if (product.productType === 'serial') {
      return serials.filter(s => s.productId === product.id && s.status === 'available').length;
    }
    return product.stock || 0;
  };

  // نفس طريقة فواتير البيع: السيريال وحده يحدد الجهاز من المخزون.
  const findAvailableSerial = (value: string): SerialItem | undefined => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    return serials.find(s => s.serial.trim().toLowerCase() === normalized && s.status === 'available');
  };

  const availableProducts = products.filter(p => {
    const stock = getAvailableStock(p);
    if (!productSearch) return stock > 0;
    const q = productSearch.toLowerCase();
    return stock > 0 && (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      getProductUPCs(p).some(u => u.includes(q))
    );
  }).slice(0, 10);

  // ✅ لما نضيف منتج، لو بسيريالات نختار أول سيريال متاح تلقائيًا (يقدر المستخدم يغيّره من dropdown بعدين)
  const addItemFromProduct = (product: Product, selectedSerial?: SerialItem) => {
    let autoSerial = '', autoImei1 = '', autoImei2 = '';
    if (product.productType === 'serial') {
      const availSerial = selectedSerial || serials.find(s => s.productId === product.id && s.status === 'available');
      autoSerial = availSerial?.serial || '';
      autoImei1 = availSerial?.imei1 || '';
      autoImei2 = availSerial?.imei2 || '';
    }
    setOrderItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      upc: product.upc,
      serial: '',
      imei1: autoImei1,
      imei2: autoImei2,
      price: product.salePrice,
      costPrice: product.costPrice,
      tempSerial: autoSerial,
      tempImei1: autoImei1,
      tempImei2: autoImei2,
    }]);
    setProductSearch('');
    setShowProductDrop(false);
  };

  // ✅ فتح فورم التعديل
  const openEditForm = (order: NoonOrder) => {
    setEditingOrder(order);
    setPlatform(order.platform);
    setOrderNumber(order.orderNumber);
    setShipmentNumber(order.shipmentNumber || '');
    setOrderDate(order.date);
    setCustomerName(order.customerName || '');
    setOrderNotes(order.notes || '');
    setOrderItems(order.items.map(item => ({
      ...item,
      tempSerial: item.serial || '',
      tempImei1: item.imei1 || '',
      tempImei2: item.imei2 || '',
    })));
    setShowForm(true);
    setViewOrder(null);
  };

  const handleSaveOrder = () => {
    if (!orderNumber || orderItems.length === 0) return;

    const items: NoonOrderItem[] = orderItems.map(item => ({
      productId: item.productId,
      productName: item.productName,
      upc: item.upc,
      serial: item.tempSerial,
      imei1: item.tempImei1,
      imei2: item.tempImei2,
      price: item.price,
      costPrice: item.costPrice,
    }));

    if (editingOrder) {
      // ✅ تعديل أوردر موجود
      const updatedOrder: NoonOrder = {
        ...editingOrder,
        platform,
        orderNumber,
        shipmentNumber,
        date: orderDate,
        customerName,
        notes: orderNotes,
        items,
      };
      onUpdateNoonOrder(updatedOrder);
    } else {
      // إضافة أوردر جديد
      const order: NoonOrder = {
        id: generateId(),
        orderNumber,
        shipmentNumber,
        platform,
        customerName,
        date: orderDate,
        items,
        status: 'pending',
        notes: orderNotes,
        createdAt: new Date().toISOString(),
      };
      const result = onAddNoonOrder(order);
      if (result && result.merged) {
        setInfoToast(result.message || `الأوردر ${orderNumber} موجود بالفعل، تم إضافة المنتج له`);
        setTimeout(() => setInfoToast(null), 4000);
      }
    }

    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setOrderNumber('');
    setShipmentNumber('');
    setCustomerName('');
    setOrderNotes('');
    setOrderItems([]);
    setOrderDate(getTodayStr());
    setPlatform('noon');
    setEditingOrder(null);
  };

  const updateStatus = (orderId: string, status: OrderStatus) => {
    const order = noonOrders.find(o => o.id === orderId);
    if (status === 'returned') { setReturnIds([orderId]); setReturnDate(getTodayStr()); setReturnRestock(true); return; }
    if (order) onUpdateNoonOrder({ ...order, status });
  };

  const bulkUpdateStatus = (status: OrderStatus) => {
    if (status === 'returned') { setReturnIds(selected); setReturnDate(getTodayStr()); setReturnRestock(true); return; }
    selected.forEach(id => {
      const order = noonOrders.find(o => o.id === id);
      if (order) onUpdateNoonOrder({ ...order, status });
    });
    setSelected([]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const downloadTemplate = () => {
    const data = [
      { orderNumber: 'NNN-001', shipmentNumber: 'SHP-001', platform: 'noon', customerName: 'أحمد محمد', date: getTodayStr(), productName: '', upc: '195949035951', serial: '', imei1: '', imei2: '', price: 52000 },
      { orderNumber: 'NNN-002', shipmentNumber: 'SHP-002', platform: 'noon', customerName: 'محمد علي', date: getTodayStr(), productName: '', upc: '', serial: 'F2LXQ7H2QP', imei1: '', imei2: '', price: 52000 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    const instructions = [
      ['طريقة الاستخدام'],
      ['منتج بسيريال', 'اكتب serial فقط. النظام سيعرف المنتج واسم المنتج وIMEI وUPC من المخزون تلقائيًا.'],
      ['منتج بدون سيريال', 'اكتب UPC فقط + السعر. اترك serial فارغًا. اسم المنتج في الملف غير مطلوب للمطابقة.'],
      ['UPC', 'يجب أن يكون UPC موجودًا في النظام، ويمكن استخدام أي UPC من الـ UPCs المتعددة للمنتج.'],
      ['الكمية', 'كل صف يمثل قطعة واحدة. لإضافة 3 قطع من منتج بدون سيريال، كرر الصف 3 مرات.'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');
    XLSX.writeFile(wb, 'noon_orders_template.xlsx');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const grouped: Record<string, typeof rows> = {};
      const importErrors: string[] = [];
      rows.forEach((row, rowIndex) => {
        const key = String(row.orderNumber || '').trim();
        if (!key) return;
        const serialValue = String(row.serial || '').trim();
        const upcValue = String(row.upc || '').trim();
        const matchedSerial = serialValue
          ? serials.find(s => s.serial.trim().toLowerCase() === serialValue.toLowerCase() && s.status === 'available')
          : undefined;
        const product = matchedSerial
          ? products.find(p => p.id === matchedSerial.productId)
          : products.find(p => productHasUPC(p, upcValue));
        if (!product) {
          importErrors.push(`الصف ${rowIndex + 2}: ${serialValue ? `السيريال ${serialValue} غير موجود/غير متاح` : `الـ UPC ${upcValue || '(فارغ)'} غير موجود في النظام`}`);
          return;
        }
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      });
      const orders: NoonOrder[] = Object.entries(grouped).map(([orderNum, orderRows]) => {
        const first = orderRows[0];
        const items: NoonOrderItem[] = orderRows.map(row => {
          const serialValue = String(row.serial || '').trim();
          const upcValue = String(row.upc || '').trim();
          const matchedSerial = serialValue
            ? serials.find(s => s.serial.trim().toLowerCase() === serialValue.toLowerCase() && s.status === 'available')
            : undefined;
          const product = matchedSerial
            ? products.find(p => p.id === matchedSerial.productId)
            : products.find(p => productHasUPC(p, upcValue));
          return {
            productId: product?.id || '',
            productName: product?.name || '',
            upc: product ? (upcValue && productHasUPC(product, upcValue) ? upcValue : (product.upc || '')) : upcValue,
            serial: matchedSerial?.serial || serialValue,
            imei1: matchedSerial?.imei1 || String(row.imei1 || ''),
            imei2: matchedSerial?.imei2 || String(row.imei2 || ''),
            price: parseFloat(row.price) || 0,
            costPrice: product?.costPrice ?? 0,
          };
        });
        return {
          id: generateId(),
          orderNumber: orderNum,
          shipmentNumber: String(first.shipmentNumber || ''),
          platform: (first.platform as OrderPlatform) || 'noon',
          customerName: String(first.customerName || ''),
          date: parseImportDate(first.date, getTodayStr()),
          items,
          status: 'pending',
          notes: '',
          createdAt: new Date().toISOString(),
        };
      });
      const result = orders.length > 0 ? onAddNoonOrders(orders) : undefined;
      const parts: string[] = [];
      if (result?.addedCount) parts.push(`${result.addedCount} أوردر جديد`);
      if (result?.mergedCount) parts.push(`${result.mergedCount} منتج تم دمجه في أوردرات موجودة بالفعل`);
      if (importErrors.length > 0) parts.push(`⚠️ تم تجاهل ${importErrors.length} صف غير صالح`);
      if (parts.length > 0) {
        setInfoToast(`✅ ${parts.join(' + ')}`);
        setTimeout(() => setInfoToast(null), 7000);
      }
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const eligibleForSettlement = filtered.filter(o => o.status === 'delivered' || o.status === 'shipped' || (o.status === 'returned' && o.settledAmount == null));
  const selectedEligible = selected.filter(id => eligibleForSettlement.some(o => o.id === id));

  const openSettleModal = () => {
    const initial: Record<string, string> = {};
    selectedEligible.forEach(id => { initial[id] = ''; });
    setSettleAmounts(initial);
    setSettleIds(selectedEligible);
    setAdjRows([]);
    setActualTotal('');
    setImportNote('');
    setShowSettleModal(true);
  };

  const findOrderByRef = (ref: string) => {
    const k = ref.trim().toLowerCase();
    return k ? noonOrders.find(o => o.orderNumber.trim().toLowerCase() === k || (o.shipmentNumber || '').trim().toLowerCase() === k) : undefined;
  };
  const resolvedAdjs = adjRows.map(r => ({ ...r, order: findOrderByRef(r.orderNumber), amountNum: parseFloat(r.amount) }))
    .filter(r => r.order && r.amountNum > 0);

  const handleConfirmSettlement = () => {
    const settlements = settleIds
      .filter(id => settleAmounts[id] && parseFloat(settleAmounts[id]) > 0)
      .map(id => ({ orderId: id, settledAmount: parseFloat(settleAmounts[id]), settledDate: settleDate }));
    if (settlements.length === 0 && resolvedAdjs.length === 0) return;
    const actual = actualTotal.trim() !== '' ? parseFloat(actualTotal) : undefined;
    onSettleNoonOrders(settlements, {
      ...(actual !== undefined && !Number.isNaN(actual) ? { actualTotal: actual } : {}),
      adjustments: resolvedAdjs.map(r => ({ orderId: r.order!.id, amount: r.amountNum, kind: r.kind, note: r.note || undefined })),
    });
    setAdjRows([]);
    setShowSettleModal(false);
    setSelected([]);
    setSettleAmounts({});
    setSettleIds([]);
  };

  // استيراد ملف التسوية: بيفتح نافذة التسوية معبّأة عشان تراجع الأرقام قبل التأكيد
  const handleImportSettlement = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const num = (v: any) => parseFloat(String(v ?? '').replace(/,/g, '').trim());
      const amounts: Record<string, string> = {};
      const ids: string[] = [];
      const skipped: string[] = [];
      const adjImported: { orderNumber: string; kind: NoonAdjustment['kind']; amount: string; note: string }[] = [];
      let fileTotal: number | undefined;
      let fileDate = '';
      rows.forEach(row => {
        const t = num(row.totalTransfer);
        if (fileTotal === undefined && t > 0) fileTotal = t;
        if (!fileDate && String(row.transferDate || '').trim()) fileDate = parseImportDate(row.transferDate, '');
        const key = String(row.orderNumber || '').trim().toLowerCase();
        const amount = num(row.settledAmount);
        const deduction = num(row.deduction);
        if (key && deduction > 0) {
          const typeTxt = String(row.deductionType || '').toLowerCase();
          const kind: NoonAdjustment['kind'] = /شحن|ship/.test(typeTxt) ? 'shipping' : /مرتجع|return|استرجاع/.test(typeTxt) ? 'return_clawback'
            : /رسوم|عمولة|fee/.test(typeTxt) ? 'fee' : (findOrderByRef(key)?.status === 'returned' ? 'return_clawback' : 'other');
          adjImported.push({ orderNumber: String(row.orderNumber).trim(), kind, amount: String(deduction), note: String(row.deductionType || '').trim() });
          return;
        }
        if (!key || !(amount > 0)) return;
        const order = noonOrders.find(o => o.orderNumber.trim().toLowerCase() === key || (o.shipmentNumber || '').trim().toLowerCase() === key);
        if (!order) { skipped.push(`${row.orderNumber} (مش موجود)`); return; }
        if (order.status !== 'delivered' && order.status !== 'shipped' && !(order.status === 'returned' && order.settledAmount == null)) { skipped.push(`${row.orderNumber} (حالته ${statusLabel(order.status)})`); return; }
        if (!ids.includes(order.id)) ids.push(order.id);
        amounts[order.id] = String(amount);
      });
      if (settleFileRef.current) settleFileRef.current.value = '';
      if (ids.length === 0 && adjImported.length === 0) {
        setInfoToast(`⚠️ مفيش أوردرات صالحة للتسوية في الملف${skipped.length ? `: ${skipped.slice(0, 5).join('، ')}` : ''}`);
        setTimeout(() => setInfoToast(null), 8000);
        return;
      }
      setSettleAmounts(amounts);
      setSettleIds(ids);
      setAdjRows(adjImported);
      setActualTotal(fileTotal !== undefined ? String(fileTotal) : '');
      if (fileDate) setSettleDate(fileDate);
      setImportNote(skipped.length ? `⚠️ اتخطى ${skipped.length}: ${skipped.slice(0, 8).join('، ')}${skipped.length > 8 ? '...' : ''}` : '');
      setShowSettleModal(true);
    };
    reader.readAsBinaryString(file);
  };

  const downloadSettlementTemplate = () => {
    const base = eligibleForSettlement.length > 0
      ? eligibleForSettlement.map(o => ({ orderNumber: o.orderNumber, settledAmount: '' as string | number, deduction: '' as string | number, deductionType: '' as string, totalTransfer: '' as string | number, transferDate: '' as string }))
      : [{ orderNumber: 'NNN-001', settledAmount: '', deduction: '', deductionType: '', totalTransfer: '', transferDate: '' }];
    const ws = XLSX.utils.json_to_sheet(base);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Settlement');
    const info = XLSX.utils.aoa_to_sheet([
      ['orderNumber', 'رقم الأوردر (أو رقم الشحنة)'],
      ['settledAmount', 'صافي سعر الأوردر بعد عمولة نون والضريبة'],
      ['deduction', 'خصم على أوردر (حتى لو قديم أو اتسوّى قبل كده): اكتب رقم الأوردر في orderNumber والمبلغ المخصوم هنا، وسيب settledAmount فاضي'],
      ['deductionType', 'نوع الخصم: شحن / رسوم / مرتجع / أخرى (لو الأوردر مرتجع بيتحسب خصم مرتجع تلقائي)'],
      ['totalTransfer', 'اختياري: اكتبه في أي صف واحد. إجمالي التحويل الفعلي للدفعة. الفرق بينه وبين مجموع الأوردرات = مصاريف الدفعة (شحن/عمولات أخرى) وبتتوزع على الأوردرات'],
      ['transferDate', 'اختياري: تاريخ التحويل (يكتب في صف واحد)'],
    ]);
    XLSX.utils.book_append_sheet(wb, info, 'Instructions');
    XLSX.writeFile(wb, 'noon_settlement_template.xlsx');
  };

  const platformInfo = (p: OrderPlatform) => PLATFORMS.find(x => x.id === p) || PLATFORMS[2];

  // ✅ تحديث الحالات لتشمل 6 حالات جديدة
  const statusCounts = {
    all: noonOrders.length,
    pending: noonOrders.filter(o => o.status === 'pending').length,
    shipped: noonOrders.filter(o => o.status === 'shipped').length,
    delivered: noonOrders.filter(o => o.status === 'delivered').length,
    returned: noonOrders.filter(o => o.status === 'returned').length,
    paid: noonOrders.filter(o => o.status === 'paid').length,
    canceled: noonOrders.filter(o => o.status === 'canceled').length,
    settled: noonOrders.filter(o => o.status === 'settled').length,
  };

  const totalSettlementAmount = useMemo(
    () => settleIds.reduce((sum, id) => sum + (parseFloat(settleAmounts[id]) || 0), 0),
    [settleIds, settleAmounts]
  );
  const actualNum = actualTotal.trim() !== '' && !Number.isNaN(parseFloat(actualTotal)) ? parseFloat(actualTotal) : null;
  const adjTotal = resolvedAdjs.reduce((sum, r) => sum + r.amountNum, 0);
  const expectedIn = totalSettlementAmount - adjTotal;
  const extraFees = actualNum !== null ? Math.max(0, expectedIn - actualNum) : 0;

  const totalSettlementProfit = useMemo(() => {
    return settleIds.reduce((sum, id) => {
      const order = noonOrders.find(o => o.id === id);
      if (!order) return sum;
      const cost = order.items.reduce((s, it) => s + (it.costPrice || 0), 0);
      const amount = parseFloat(settleAmounts[id]) || 0;
      return sum + (amount - cost);
    }, 0);
  }, [settleIds, settleAmounts, noonOrders]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {infoToast && (
        <div className="bg-blue-900/30 border border-blue-700/40 rounded-xl px-4 py-3 text-blue-300 text-sm flex items-center justify-between">
          <span>ℹ️ {infoToast}</span>
          <button onClick={() => setInfoToast(null)} className="text-blue-400 hover:text-blue-200">✕</button>
        </div>
      )}
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        <button onClick={() => setViewMode('orders')} 
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            viewMode === 'orders'
              ? 'border-violet-500 text-violet-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}>
          📋 الأوردرات
        </button>
        <button onClick={() => setViewMode('reports')} 
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            viewMode === 'reports'
              ? 'border-violet-500 text-violet-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}>
          📊 التقارير
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{viewMode === 'orders' ? '🏪 أوردرات نون / أمازون' : '📊 تقارير المبيعات'}</h2>
          <p className="text-gray-500 text-sm">{viewMode === 'orders' ? `${noonOrders.length} أوردر` : `${monthReportStats.totalOrders} أوردر في الشهر`}</p>
        </div>
        {viewMode === 'orders' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowSync(true)} className="btn-secondary text-sm flex items-center gap-1 border-yellow-600/50 text-yellow-300">🔄 مزامنة من شيت نون</button>
            <button onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1">
              <Download size={14} /> نموذج Excel
            </button>
            <label className="btn-secondary text-sm flex items-center gap-1 cursor-pointer">
              <Upload size={14} /> استيراد Excel
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
            </label>
            <button onClick={() => setShowPaste(true)} className="btn-secondary text-sm flex items-center gap-1 border-green-600/50 text-green-300">📋 لصق من Google Sheet</button>
            <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> أوردر جديد
            </button>
          </div>
        )}
      </div>

      {/* ==================== REPORTS VIEW ==================== */}
      {viewMode === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="form-label">اختر الشهر</label>
            <input type="month" value={selectedReportMonth} onChange={e => setSelectedReportMonth(e.target.value)}
              className="input-dark w-48" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-500">إجمالي الأوردرات</div>
              <div className="text-2xl font-bold text-blue-300 mt-2">{monthReportStats.totalOrders}</div>
            </div>
            <div className="bg-cyan-900/20 border border-cyan-700/30 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-500">إجمالي المنتجات</div>
              <div className="text-2xl font-bold text-cyan-300 mt-2">{monthReportStats.totalItems}</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-500">التكلفة الكلية</div>
              <div className="text-2xl font-bold text-orange-300 mt-2">{formatCurrency(monthReportStats.totalCost)}</div>
            </div>
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-500">الربح الكلي</div>
              <div className={`text-2xl font-bold ${monthReportStats.totalProfit >= 0 ? 'text-green-300' : 'text-red-300'} mt-2`}>
                {formatCurrency(monthReportStats.totalProfit)}
              </div>
            </div>
          </div>

          {/* Revenue & Margin */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4">
              <div className="text-sm text-gray-500">إجمالي المبيعات</div>
              <div className="text-3xl font-bold text-purple-300 mt-2">{formatCurrency(monthReportStats.totalRevenue)}</div>
            </div>
            <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl p-4">
              <div className="text-sm text-gray-500">هامش الربح</div>
              <div className="text-3xl font-bold text-violet-300 mt-2">{monthReportStats.profitMargin}%</div>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
            <h3 className="font-bold text-white mb-4">توزيع الحالات</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(monthReportStats.statusCounts).map(([status, count]) => (
                <div key={status} className="bg-muted-bg rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">
                    {status === 'pending' ? '⏳ معلق' : status === 'shipped' ? '📦 شحن' : status === 'delivered' ? '✅ توصيل' : status === 'returned' ? '↩️ مرتجع' : status === 'paid' ? '💳 مدفوع' : status === 'canceled' ? '❌ ملغي' : '🏦 مسوى'}
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== ORDERS VIEW ==================== */}
      {viewMode === 'orders' && (
        <div className="space-y-4">
          {(() => {
            const pend = noonOrders.filter(o => clawbackPending(o) > 0.005);
            if (!pend.length) return null;
            const total = pend.reduce((sum, o) => sum + clawbackPending(o), 0);
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-orange-900/20 border border-orange-700/40 rounded-xl px-4 py-3 text-sm">
                <span className="text-orange-200">↩️ {pend.length} مرتجع فلوسه نزلت ونون لسه ماخصمتهاش: إجمالي <b>{formatCurrency(total)}</b> هيتخصم من دفعات جاية</span>
                <button onClick={() => { setStatusFilter('returned'); setSearch(''); }} className="btn-secondary px-3 py-1 text-xs">عرض المرتجعات</button>
              </div>
            );
          })()}
          {/* فلتر التاريخ */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">📅 من</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSelected([]); }} className="input-dark text-sm" />
            <span className="text-xs text-gray-400">إلى</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSelected([]); }} className="input-dark text-sm" />
            {([
              ['اليوم', 0, 0], ['أمس', 1, 1], ['آخر 7 أيام', 6, 0], ['آخر 30 يوم', 29, 0],
            ] as [string, number, number][]).map(([l, a, b]) => {
              const f = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
              return <button key={l} onClick={() => { setDateFrom(f(a)); setDateTo(f(b)); setSelected([]); }} className="px-3 py-1.5 rounded-lg text-xs border border-border text-gray-400 hover:bg-white/5">{l}</button>;
            })}
            <button onClick={() => { const t = getTodayStr(); setDateFrom(t.slice(0, 8) + '01'); setDateTo(t); setSelected([]); }} className="px-3 py-1.5 rounded-lg text-xs border border-border text-gray-400 hover:bg-white/5">هذا الشهر</button>
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); setSelected([]); }} className="px-3 py-1.5 rounded-lg text-xs border border-red-700/40 text-red-300">كل التواريخ</button>}
            <span className="text-xs text-blue-300">{filtered.length} أوردر ظاهر</span>
          </div>
          {/* Status Filter - ✅ 6 حالات جديدة */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'pending', 'shipped', 'delivered', 'returned', 'paid', 'canceled'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    statusFilter === s
                      ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                      : 'border-white/10 text-gray-400 hover:border-white/20'
                  }`}>
                  {s === 'all' ? 'الكل' : s === 'pending' ? 'معلق' : s === 'shipped' ? 'تم الشحن' : s === 'delivered' ? 'تم التوصيل' : s === 'returned' ? 'مرتجع' : s === 'paid' ? 'مدفوع' : 'ملغي'} ({statusCounts[s as OrderStatus] || 0})
                </button>
              ))}
            </div>

          {/* Bulk Actions - ✅ مع الحالات الجديدة */}
          {selected.length > 0 && (
            <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-violet-300 text-sm font-medium">تم تحديد {selected.length} أوردر</span>
              <button onClick={() => bulkUpdateStatus('shipped')} className="px-3 py-1.5 bg-blue-700/30 border border-blue-500/40 rounded-lg text-xs text-blue-300">📦 شحن الكل</button>
              <button onClick={() => bulkUpdateStatus('delivered')} className="px-3 py-1.5 bg-green-700/30 border border-green-500/40 rounded-lg text-xs text-green-300">✅ تم التوصيل</button>
              <button onClick={() => bulkUpdateStatus('returned')} className="px-3 py-1.5 bg-orange-700/30 border border-orange-500/40 rounded-lg text-xs text-orange-300">↩️ مرتجع</button>
              <button onClick={() => bulkUpdateStatus('paid')} className="px-3 py-1.5 bg-cyan-700/30 border border-cyan-500/40 rounded-lg text-xs text-cyan-300">💳 مدفوع</button>
              {selectedEligible.length > 0 && (
                <button onClick={openSettleModal} className="px-3 py-1.5 bg-violet-700/30 border border-violet-500/40 rounded-lg text-xs text-violet-300 flex items-center gap-1">
                  <Banknote size={13} /> تسوية بنكية ({selectedEligible.length})
                </button>
              )}
              <button onClick={() => bulkUpdateStatus('canceled')} className="px-3 py-1.5 bg-red-700/30 border border-red-500/40 rounded-lg text-xs text-red-300">❌ إلغاء</button>
              <button onClick={() => setSelected([])} className="text-xs text-gray-500 mr-auto">إلغاء التحديد</button>
            </div>
          )}

          {/* Settlement Import */}
          <div className="bg-elevated border border-violet-900/20 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
            <Banknote size={16} className="text-violet-400" />
            <span className="text-gray-400">تسوية جماعية بملف Excel:</span>
            <button onClick={downloadSettlementTemplate} className="text-violet-300 hover:underline">نموذج التسوية</button>
            <label className="text-violet-300 hover:underline cursor-pointer">
              استيراد ملف التسوية
              <input ref={settleFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportSettlement} />
            </label>
          </div>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث برقم الأوردر أو اسم المنتج..."
              className="input-dark w-full pr-9" />
          </div>

          {/* Orders Table */}
          <div className="bg-elevated border border-violet-900/30 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="py-3 px-4 w-8">
                <button onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map(o => o.id))}>
                  {selected.length === filtered.length && filtered.length > 0
                    ? <CheckSquare size={14} className="text-violet-400" />
                    : <Square size={14} className="text-gray-500" />}
                </button>
              </th>
              <th className="text-right py-3 px-3 text-gray-400 font-medium">رقم الأوردر</th>
              <th className="text-right py-3 px-3 text-gray-400 font-medium hidden md:table-cell">المنتج</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">المنصة</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">التاريخ</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">المنتجات</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">الحالة</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden lg:table-cell">المبلغ المحول</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden lg:table-cell">الربح</th>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-500">لا توجد أوردرات</td></tr>
            ) : filtered.map(o => {
              const pInfo = platformInfo(o.platform);
              return (
                <tr key={o.id}
                  className={`border-t border-white/5 hover:bg-white/5 cursor-pointer ${selected.includes(o.id) ? 'bg-violet-900/10' : ''}`}
                  onClick={() => setViewOrder(o)}>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(o.id)}>
                      {selected.includes(o.id)
                        ? <CheckSquare size={14} className="text-violet-400" />
                        : <Square size={14} className="text-gray-500" />}
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono text-violet-400 text-sm">{o.orderNumber}</div>
                    {o.shipmentNumber && <div className="text-xs text-gray-500 font-mono">{o.shipmentNumber}</div>}
                  </td>
                  <td className="py-3 px-3 text-white hidden md:table-cell">
                    {o.items.length === 0 ? '-' : (
                      <>
                        {o.items.slice(0, 2).map((it, i) => (
                          <div key={i} className="text-sm leading-snug">{it.productName || '-'}</div>
                        ))}
                        {o.items.length > 2 && <div className="text-xs text-gray-500">+{o.items.length - 2} أصناف أخرى</div>}
                      </>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${pInfo.color}`}>
                      {pInfo.emoji} {pInfo.label}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-400 text-xs">{o.date}</td>
                  <td className="py-3 px-3 text-center text-white">{o.items.length}</td>
                  <td className="py-3 px-3 text-center" onClick={e => e.stopPropagation()}>
                    {o.status === 'settled' ? (
                      <span className={`text-xs px-2 py-1 rounded-lg border ${statusColor(o.status)}`}>
                        🏦 {statusLabel(o.status)}
                      </span>
                    ) : (
                      <select
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value as OrderStatus)}
                        className={`text-xs rounded-lg border px-2 py-1 cursor-pointer bg-transparent ${statusColor(o.status)}`}>
                        <option value="pending">⏳ معلق</option>
                        <option value="shipped">📦 تم الشحن</option>
                        <option value="delivered">✅ تم التوصيل</option>
                        <option value="returned">↩️ مرتجع</option>
                        <option value="paid">💳 مدفوع</option>
                        <option value="canceled">❌ ملغي</option>
                      </select>
                    )}
                    {o.status === 'returned' && (() => {
                      const st = returnState(o);
                      return (
                        <div className={`mt-1 text-[10px] ${st === 'pending_clawback' ? 'text-orange-300' : 'text-gray-400'}`}>
                          {st === 'pending_clawback' ? `⏳ مستني خصم نون ${formatCurrency(clawbackPending(o))}` : st === 'closed_clawed' ? '✔ اتخصم من نون' : 'الفلوس ماجتش'}
                          {!o.returnRestocked && <div className="text-red-300">الجهاز مش في المخزون</div>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-3 text-center hidden lg:table-cell">
                    {o.settledAmount != null
                      ? <span className="text-blue-300 font-medium">{formatCurrency(o.settledAmount)}</span>
                      : '-'}
                  </td>
                  <td className="py-3 px-3 text-center hidden lg:table-cell">
                    {o.settlementProfit != null ? (
                      <span className={`font-medium ${o.settlementProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(o.settlementProfit)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => openEditForm(o)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/20"
                      title="تعديل">
                      <Edit size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ==================== View Order Modal ==================== */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {platformInfo(viewOrder.platform).emoji} {viewOrder.orderNumber}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditForm(viewOrder)}
                  className="btn-secondary flex items-center gap-1 text-sm">
                  <Edit size={14} /> تعديل
                </button>
                <button onClick={() => setViewOrder(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><div className="text-xs text-gray-500">المنصة</div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${platformInfo(viewOrder.platform).color}`}>
                  {platformInfo(viewOrder.platform).emoji} {platformInfo(viewOrder.platform).label}
                </span>
              </div>
              <div><div className="text-xs text-gray-500">التاريخ</div><div className="text-white">{viewOrder.date}</div></div>
              {viewOrder.customerName && (
                <div><div className="text-xs text-gray-500">العميل</div><div className="text-white">{viewOrder.customerName}</div></div>
              )}
              {viewOrder.shipmentNumber && (
                <div><div className="text-xs text-gray-500">رقم الشحنة</div><div className="font-mono text-gray-300">{viewOrder.shipmentNumber}</div></div>
              )}
              <div><div className="text-xs text-gray-500">الحالة</div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(viewOrder.status)}`}>
                  {statusLabel(viewOrder.status)}
                </span>
              </div>
              {viewOrder.settledAmount != null && (
                <div><div className="text-xs text-gray-500">المبلغ المحول</div>
                  <div className="text-blue-300 font-bold">{formatCurrency(viewOrder.settledAmount)}</div>
                </div>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-sm font-bold text-white mb-2">المنتجات ({viewOrder.items.length})</div>
              {viewOrder.items.map((item, i) => (
                <div key={i} className="bg-muted-bg rounded-xl p-3">
                  <div className="font-medium text-white text-sm">{item.productName}</div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {item.serial && <span>Serial: {item.serial} </span>}
                    {item.imei1 && <span>| IMEI1: {item.imei1} </span>}
                    {item.imei2 && <span>| IMEI2: {item.imei2}</span>}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500">UPC: {item.upc || '-'}</span>
                    <span className="text-sm text-green-400">{formatCurrency(item.price)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold border-t border-white/10 pt-3">
              <span className="text-gray-400">إجمالي السعر</span>
              <span className="text-white">{formatCurrency(viewOrder.items.reduce((s, i) => s + i.price, 0))}</span>
            </div>
            {((viewOrder.adjustments || []).length > 0 || viewOrder.status === 'returned') && (
              <div className="mt-3 bg-muted-bg rounded-xl p-3 text-sm space-y-1">
                {viewOrder.status === 'returned' && (
                  <div className="text-orange-200">
                    ↩️ مرتجع{viewOrder.returnedDate ? ` بتاريخ ${viewOrder.returnedDate}` : ''} —{' '}
                    {returnState(viewOrder) === 'pending_clawback' ? `الفلوس نزلت وفاضل ${formatCurrency(clawbackPending(viewOrder))} يتخصموا من نون`
                      : returnState(viewOrder) === 'closed_clawed' ? 'نون خصمت الفلوس بالكامل' : 'الفلوس ماجتش، مفيش حاجة تتخصم'}
                  </div>
                )}
                {(viewOrder.adjustments || []).map(a => (
                  <div key={a.id} className="flex justify-between text-xs">
                    <span className="text-gray-400">{a.date} — {ADJ_KIND_LABEL[a.kind]}{a.note ? ` (${a.note})` : ''}</span>
                    <span className="text-red-300">- {formatCurrency(a.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {['delivered', 'shipped', 'settled', 'paid'].includes(viewOrder.status) && (
              <button onClick={() => { setReturnIds([viewOrder.id]); setReturnDate(getTodayStr()); setReturnRestock(true); setViewOrder(null); }} className="mt-3 w-full btn-secondary text-sm text-orange-300">↩️ تسجيل مرتجع</button>
            )}
            {viewOrder.status === 'returned' && !viewOrder.returnRestocked && (
              <button onClick={() => { onReturnNoonOrders([viewOrder.id], { restock: true }); setViewOrder(null); }} className="mt-3 w-full btn-secondary text-sm text-green-300">📦 رجّع الجهاز للمخزون</button>
            )}
            {viewOrder.settlementProfit != null && (
              <div className="flex justify-between mt-1">
                <span className="text-gray-400 text-sm">الربح</span>
                <span className={`font-bold ${viewOrder.settlementProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(viewOrder.settlementProfit)}
                </span>
              </div>
            )}
            {viewOrder.notes && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <span className="text-gray-500 text-xs">ملاحظات: </span>
                <span className="text-gray-300 text-xs">{viewOrder.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== New/Edit Order Modal ==================== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">
                🏪 {editingOrder ? `تعديل أوردر ${editingOrder.orderNumber}` : 'إضافة أوردر جديد'}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            {/* Platform */}
            <div className="mb-4">
              <label className="form-label">المنصة</label>
              <div className="flex gap-3">
                {PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${platform === p.id ? p.color : 'border-white/10 text-gray-400'}`}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">رقم الأوردر *</label>
                <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
                  className="input-dark w-full" placeholder="NNN-20240115-001" />
              </div>
              <div>
                <label className="form-label">رقم الشحنة</label>
                <input type="text" value={shipmentNumber} onChange={e => setShipmentNumber(e.target.value)}
                  className="input-dark w-full" placeholder="SHP-001" />
              </div>
              <div>
                <label className="form-label">التاريخ</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">اسم العميل</label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                  className="input-dark w-full" placeholder="اسم العميل" />
              </div>
              <div className="col-span-2">
                <label className="form-label">ملاحظات</label>
                <input type="text" value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                  className="input-dark w-full" />
              </div>
            </div>

            {/* Products Search */}
            <div className="mb-4">
              <label className="form-label">اختر الأجهزة من المخزون</label>
              <div className="relative">
                <input
                  type="text" value={productSearch}
                  onChange={e => {
                    const value = e.target.value;
                    const matchedSerial = findAvailableSerial(value);
                    if (matchedSerial) {
                      const matchedProduct = products.find(p => p.id === matchedSerial.productId);
                      if (matchedProduct) {
                        addItemFromProduct(matchedProduct, matchedSerial);
                        return;
                      }
                    }
                    setProductSearch(value);
                    setShowProductDrop(true);
                  }}
                  onFocus={() => setShowProductDrop(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const matchedSerial = findAvailableSerial(productSearch);
                      if (matchedSerial) {
                        const matchedProduct = products.find(p => p.id === matchedSerial.productId);
                        if (matchedProduct) {
                          e.preventDefault();
                          addItemFromProduct(matchedProduct, matchedSerial);
                        }
                      }
                    }
                  }}
                  placeholder="بحث بالمنتج أو UPC أو أدخل السيريال مباشرة..."
                  className="input-dark w-full"
                />
                {showProductDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-muted-bg border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                    {availableProducts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-500 text-sm">لا توجد منتجات في المخزون</div>
                    ) : availableProducts.map(p => {
                      // ✅ نعرض المخزون الحقيقي لكل منتج
                      const availStock = getAvailableStock(p);
                      return (
                        <button key={p.id} onClick={() => addItemFromProduct(p)}
                          className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">
                            {p.sku} • متاح: {availStock} قطعة
                            {p.productType === 'serial' && ' 🔑'}
                          </div>
                        </button>
                      );
                    })}
                    <button onClick={() => setShowProductDrop(false)}
                      className="block w-full text-right px-3 py-2 text-xs text-gray-500 hover:bg-white/5 border-t border-white/10">
                      إغلاق
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-3 mb-4">
              {orderItems.map((item, idx) => {
                // السيريالات المتاحة + السيريال المختار حالياً (في التعديل بيكون حالته "محوّل" مش "متاح")
                const availableSerials = serials.filter(
                  s => s.productId === item.productId && (s.status === 'available' || s.serial === item.tempSerial)
                );
                const usedElsewhere = new Set(orderItems.filter((_, i) => i !== idx).map(it => it.tempSerial).filter(Boolean));
                const isSerialProduct = products.find(p => p.id === item.productId)?.productType === 'serial';

                return (
                  <div key={idx} className="bg-muted-bg border border-violet-900/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-white text-sm">{item.productName}</div>
                      <button onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 rounded-lg text-red-400 hover:bg-red-900/20"><X size={14} /></button>
                    </div>

                    {/* ✅ لو المنتج بسيريالات، اعرض dropdown للسيريالات المتاحة فعليًا */}
                    {isSerialProduct && availableSerials.length > 0 ? (
                      <SerialPicker
                        candidates={availableSerials}
                        value={item.tempSerial}
                        usedElsewhere={usedElsewhere}
                        onPick={chosen => setOrderItems(prev => prev.map((it, i) => i === idx ? {
                          ...it,
                          tempSerial: chosen?.serial || '',
                          tempImei1: chosen?.imei1 || '',
                          tempImei2: chosen?.imei2 || '',
                        } : it))}
                      />
                    ) : (
                      // منتج عادي (بدون سيريالات) - إدخال يدوي اختياري
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <input type="text" value={item.tempSerial}
                          onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempSerial: e.target.value } : it))}
                          className="input-dark w-full text-xs font-mono" placeholder="Serial Number" />
                        <input type="text" value={item.tempImei1}
                          onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei1: e.target.value } : it))}
                          className="input-dark w-full text-xs" placeholder="IMEI 1" />
                        <input type="text" value={item.tempImei2}
                          onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei2: e.target.value } : it))}
                          className="input-dark w-full text-xs" placeholder="IMEI 2" />
                      </div>
                    )}

                    {/* IMEI fields بعد اختيار السيريال (للمنتجات بسيريالات، للمراجعة/التعديل) */}
                    {isSerialProduct && item.tempSerial && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-xs text-gray-500">IMEI 1</label>
                          <input type="text" value={item.tempImei1}
                            onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei1: e.target.value } : it))}
                            className="input-dark w-full text-xs" placeholder="IMEI 1" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">IMEI 2</label>
                          <input type="text" value={item.tempImei2}
                            onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei2: e.target.value } : it))}
                            className="input-dark w-full text-xs" placeholder="IMEI 2" />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">UPC: {item.upc || '-'}</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, price: parseFloat(e.target.value) || 0 } : it))}
                        className="input-dark text-xs w-28"
                        placeholder="السعر"
                      />
                    </div>
                  </div>
                );
              })}
              {orderItems.length === 0 && (
                <div className="text-center text-gray-500 py-4 border border-dashed border-white/10 rounded-xl text-sm">
                  أضف منتجات من ��ائمة المخزون أعلاه
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleSaveOrder} className="btn-primary flex-1">
                💾 {editingOrder ? 'حفظ التعديلات' : 'حفظ الأوردر'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Bulk Settlement Modal ==================== */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-elevated border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">🏦 تسوية تحويل بنكي جماعي</h2>
              <button onClick={() => setShowSettleModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              أدخل صافي سعر كل أوردر (بعد عمولة نون والضريبة). النظام سيحسب الربح = الصافي − تكلفة المنتجات. لو في مصاريف على الدفعة كلها (شحن/عمولات أخرى) اكتب إجمالي التحويل الفعلي تحت وهتتوزع على الأوردرات.
            </p>

            <div className="mb-4">
              <label className="form-label">تاريخ التحويل</label>
              <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)}
                className="input-dark w-full md:w-48" />
            </div>

            <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
              {settleIds.map(id => {
                const order = noonOrders.find(o => o.id === id);
                if (!order) return null;
                const cost = order.items.reduce((s, it) => s + (it.costPrice || 0), 0);
                const amount = parseFloat(settleAmounts[id]) || 0;
                const profit = amount - cost;
                return (
                  <div key={id} className="bg-muted-bg rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-mono text-violet-300 text-sm">{order.orderNumber}</div>
                      <div className="text-xs text-gray-500">{order.items.length} منتج • تكلفة: {formatCurrency(cost)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={settleAmounts[id] || ''}
                        onChange={e => setSettleAmounts(prev => ({ ...prev, [id]: e.target.value }))}
                        className="input-dark w-32 text-sm"
                        placeholder="المبلغ المحول"
                      />
                      {amount > 0 && (
                        <span className={`text-xs font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ربح: {formatCurrency(profit)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {importNote && <div className="mb-3 text-xs text-orange-300">{importNote}</div>}
            <div className="mb-4 bg-muted-bg rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-white">➖ خصومات على أوردرات (جديدة أو قديمة)</div>
                <button onClick={() => setAdjRows(r => [...r, { orderNumber: '', kind: 'return_clawback', amount: '', note: '' }])} className="text-xs text-violet-300 hover:underline">+ إضافة خصم</button>
              </div>
              <div className="text-[11px] text-gray-500 mb-2">لو نون خصمت من الدفعة دي مبلغ على أوردر اتسوّى قبل كده (مرتجع، شحن، رسوم)، اكتب رقم الأوردر والمبلغ. بيتسجل على الأوردر نفسه وبيتحسب في ربحه.</div>
              <datalist id="noon-orders-list">{noonOrders.map(o => <option key={o.id} value={o.orderNumber} />)}</datalist>
              {adjRows.map((r, i) => {
                const ord = findOrderByRef(r.orderNumber);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
                    <input list="noon-orders-list" value={r.orderNumber} onChange={e => setAdjRows(rows => rows.map((x, k) => k === i ? { ...x, orderNumber: e.target.value } : x))} placeholder="رقم الأوردر" className={`input-dark text-sm w-44 ${r.orderNumber && !ord ? 'border-red-500/60' : ''}`} dir="ltr" />
                    <select value={r.kind} onChange={e => setAdjRows(rows => rows.map((x, k) => k === i ? { ...x, kind: e.target.value as NoonAdjustment['kind'] } : x))} className="input-dark text-sm">
                      {(Object.keys(ADJ_KIND_LABEL) as NoonAdjustment['kind'][]).map(k => <option key={k} value={k}>{ADJ_KIND_LABEL[k]}</option>)}
                    </select>
                    <input type="number" value={r.amount} onChange={e => setAdjRows(rows => rows.map((x, k) => k === i ? { ...x, amount: e.target.value } : x))} placeholder="المبلغ المخصوم" className="input-dark text-sm w-32" />
                    <button onClick={() => setAdjRows(rows => rows.filter((_, k) => k !== i))} className="text-red-400 text-xs">حذف</button>
                    {r.orderNumber && !ord && <span className="text-xs text-red-400">أوردر مش موجود</span>}
                    {ord && <span className="text-[11px] text-gray-500">{ord.items.map(it => it.productName).filter(Boolean).slice(0, 2).join('، ')} · {statusLabel(ord.status)}{ord.status === 'returned' && clawbackPending(ord) > 0 ? ` · مستني خصم ${formatCurrency(clawbackPending(ord))}` : ''}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mb-4">
              <label className="form-label">إجمالي التحويل الفعلي للدفعة (اختياري)</label>
              <input type="number" value={actualTotal} onChange={e => setActualTotal(e.target.value)} className="input-dark w-full md:w-64" placeholder={`المتوقع: ${expectedIn}`} />
              <div className="text-[11px] text-gray-500 mt-1">اللي دخل البنك فعلاً. لو أقل من مجموع الأوردرات، الفرق يتحسب مصاريف (شحن/عمولات أخرى).</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">مجموع الأوردرات ({settleIds.length})</div>
                <div className="font-bold text-blue-300 text-lg">{formatCurrency(totalSettlementAmount)}</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">خصومات أوردرات سابقة</div>
                <div className="font-bold text-red-300 text-lg">{formatCurrency(adjTotal)}</div>
              </div>
              <div className="bg-cyan-900/20 border border-cyan-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">هيدخل البنك</div>
                <div className="font-bold text-cyan-300 text-lg">{formatCurrency(actualNum ?? expectedIn)}</div>
              </div>
              <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">مصاريف الدفعة</div>
                <div className="font-bold text-orange-300 text-lg">{formatCurrency(extraFees)}</div>
              </div>
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">إجمالي الربح</div>
                <div className={`font-bold text-lg ${totalSettlementProfit - extraFees >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatCurrency(totalSettlementProfit - extraFees)}
                </div>
              </div>
            </div>
            {actualNum !== null && actualNum > expectedIn && (
              <div className="mb-3 text-xs text-orange-300">⚠️ التحويل الفعلي أكبر من المتوقع بـ {formatCurrency(actualNum - expectedIn)}. هيدخل البنك المبلغ الفعلي، راجع الأرقام.</div>
            )}

            <div className="flex gap-3">
              <button onClick={handleConfirmSettlement} className="btn-primary flex-1">
                ✅ تأكيد التسوية
              </button>
              <button onClick={() => setShowSettleModal(false)} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
      {returnIds && (() => {
        const list = returnIds.map(id => noonOrders.find(o => o.id === id)).filter((o): o is NoonOrder => !!o && o.status !== 'canceled');
        return (
          <div className="fixed inset-0 z-[9999] bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setReturnIds(null)}>
            <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-5 my-10" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white text-lg">↩️ تسجيل مرتجع ({list.length})</h3>
                <button onClick={() => setReturnIds(null)} className="p-2 text-gray-400"><X size={18} /></button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto mb-3 text-sm">
                {list.map(o => (
                  <div key={o.id} className="bg-muted-bg rounded-lg px-3 py-2 flex justify-between gap-2">
                    <span className="font-mono text-violet-300">{o.orderNumber}</span>
                    <span className={o.settledAmount ? 'text-orange-300 text-xs' : 'text-gray-400 text-xs'}>
                      {o.settledAmount ? `الفلوس نزلت ${formatCurrency(o.settledAmount)} ← هتستنى خصم نون` : 'الفلوس ماجتش ← مفيش خصم'}
                    </span>
                  </div>
                ))}
              </div>
              <label className="form-label">تاريخ المرتجع</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="input-dark w-full md:w-48" />
              <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                <input type="checkbox" checked={returnRestock} onChange={e => setReturnRestock(e.target.checked)} />
                الجهاز رجع فعلاً (يرجع للمخزون)
              </label>
              <div className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                لو فلوس الأوردر نزلت قبل كده، هتفضل في البنك وتظهر "مستني خصم نون" لحد ما الخصم ينزل في دفعة جاية (تسجله من التسوية ← خصومات). لو ماجتش أصلاً، الأوردر بيتقفل كمرتجع من غير أي أثر مالي.
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => { onReturnNoonOrders(list.map(o => o.id), { date: returnDate, restock: returnRestock }); setReturnIds(null); setSelected([]); }} disabled={!list.length} className="btn-primary flex-1 disabled:opacity-50">تأكيد المرتجع</button>
                <button onClick={() => setReturnIds(null)} className="btn-secondary px-4">إلغاء</button>
              </div>
            </div>
          </div>
        );
      })()}
      {showPaste && <NoonPasteImport noonOrders={noonOrders} products={products} serials={serials} onAdd={onAddNoonOrders} onUpdateOrder={onUpdateNoonOrder} onReturnOrders={onReturnNoonOrders} onClose={() => setShowPaste(false)} />}
      {showSync && <NoonSyncModal orders={noonOrders} onUpdateOrder={onUpdateNoonOrder} onReturnOrders={onReturnNoonOrders} onClose={() => setShowSync(false)} />}
    </div>
  );
}
