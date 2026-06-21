import React, { useState, useRef, useMemo } from 'react';
import { NoonOrder, NoonOrderItem, Product, SerialItem, OrderStatus, OrderPlatform } from '../types';
import { formatCurrency, generateId, getTodayStr, statusLabel, statusColor } from '../utils/helpers';
import { Plus, Search, X, Upload, Download, CheckSquare, Square, Banknote } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  noonOrders: NoonOrder[];
  products: Product[];
  serials: SerialItem[];
  onAddNoonOrder: (o: NoonOrder) => void;
  onUpdateNoonOrder: (o: NoonOrder) => void;
  onAddNoonOrders: (os: NoonOrder[]) => void;
  onSettleNoonOrders: (settlements: { orderId: string; settledAmount: number; settledDate?: string }[]) => void;
}

const PLATFORMS: { id: OrderPlatform; label: string; emoji: string; color: string }[] = [
  { id: 'noon', label: 'Noon', emoji: '🟡', color: 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300' },
  { id: 'amazon', label: 'Amazon', emoji: '🟠', color: 'bg-orange-900/30 border-orange-700/40 text-orange-300' },
  { id: 'other', label: 'أخرى', emoji: '🔵', color: 'bg-blue-900/30 border-blue-700/40 text-blue-300' },
];

export default function NoonOrders({ noonOrders, products, serials, onAddNoonOrder, onUpdateNoonOrder, onAddNoonOrders, onSettleNoonOrders }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
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

  // Bulk settlement state (تسوية التحويل البنكي الجماعي)
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmounts, setSettleAmounts] = useState<Record<string, string>>({});
  const [settleDate, setSettleDate] = useState(getTodayStr());

  const filtered = noonOrders.filter(o => {
    const matchSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const availableProducts = products.filter(p => {
    if (!productSearch) return p.stock > 0;
    const q = productSearch.toLowerCase();
    return p.stock > 0 && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.upc || '').includes(q));
  }).slice(0, 10);

  const addItemFromProduct = (product: Product) => {
    const availSerial = serials.find(s => s.productId === product.id && s.status === 'available');
    setOrderItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      upc: product.upc,
      serial: '',
      imei1: availSerial?.imei1 || '',
      imei2: availSerial?.imei2 || '',
      price: product.salePrice,
      costPrice: product.costPrice,
      tempSerial: availSerial?.serial || '',
      tempImei1: availSerial?.imei1 || '',
      tempImei2: availSerial?.imei2 || '',
    }]);
    setProductSearch('');
    setShowProductDrop(false);
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
    }));
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
    onAddNoonOrder(order);
    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setOrderNumber(''); setShipmentNumber(''); setCustomerName(''); setOrderNotes('');
    setOrderItems([]); setOrderDate(getTodayStr()); setPlatform('noon');
  };

  const updateStatus = (orderId: string, status: OrderStatus) => {
    const order = noonOrders.find(o => o.id === orderId);
    if (order) onUpdateNoonOrder({ ...order, status });
  };

  const bulkUpdateStatus = (status: OrderStatus) => {
    selected.forEach(id => {
      const order = noonOrders.find(o => o.id === id);
      if (order) onUpdateNoonOrder({ ...order, status });
    });
    setSelected([]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ==================== EXCEL TEMPLATE & IMPORT/EXPORT (بدل CSV) ====================
  const downloadTemplate = () => {
    const data = [
      { orderNumber: 'NNN-001', shipmentNumber: 'SHP-001', platform: 'noon', customerName: 'أحمد محمد', date: getTodayStr(), productName: 'iPhone 15 Pro', upc: '195949035951', serial: 'F2LXQ7H2QP', imei1: '352938113456789', imei2: '', price: 52000 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
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
      rows.forEach(row => {
        const key = String(row.orderNumber || '');
        if (!key) return;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      });

      const orders: NoonOrder[] = Object.entries(grouped).map(([orderNum, orderRows]) => {
        const first = orderRows[0];
        const items: NoonOrderItem[] = orderRows.map(row => {
          const product = products.find(p => p.upc === String(row.upc) || p.name === row.productName);
          return {
            productId: product?.id || '',
            productName: String(row.productName || ''),
            upc: String(row.upc || ''),
            serial: String(row.serial || ''),
            imei1: String(row.imei1 || ''),
            imei2: String(row.imei2 || ''),
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
          date: String(first.date || getTodayStr()),
          items,
          status: 'pending',
          notes: '',
          createdAt: new Date().toISOString(),
        };
      });
      onAddNoonOrders(orders);
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  // ==================== BULK BANK SETTLEMENT (تسوية تحويل بنكي جماعي) ====================
  const eligibleForSettlement = filtered.filter(o => o.status === 'delivered' || o.status === 'shipped');
  const selectedEligible = selected.filter(id => eligibleForSettlement.some(o => o.id === id));

  const openSettleModal = () => {
    const initial: Record<string, string> = {};
    selectedEligible.forEach(id => { initial[id] = ''; });
    setSettleAmounts(initial);
    setShowSettleModal(true);
  };

  const handleConfirmSettlement = () => {
    const settlements = selectedEligible
      .filter(id => settleAmounts[id] && parseFloat(settleAmounts[id]) > 0)
      .map(id => ({ orderId: id, settledAmount: parseFloat(settleAmounts[id]), settledDate: settleDate }));
    if (settlements.length === 0) return;
    onSettleNoonOrders(settlements);
    setShowSettleModal(false);
    setSelected([]);
    setSettleAmounts({});
  };

  // استيراد ملف Excel لتسوية جماعية: عمودين orderNumber + settledAmount
  const handleImportSettlement = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const settlements: { orderId: string; settledAmount: number; settledDate?: string }[] = [];
      rows.forEach(row => {
        const orderNum = String(row.orderNumber || '').trim();
        const amount = parseFloat(row.settledAmount);
        if (!orderNum || !amount) return;
        const order = noonOrders.find(o => o.orderNumber === orderNum);
        if (order) settlements.push({ orderId: order.id, settledAmount: amount, settledDate: getTodayStr() });
      });
      if (settlements.length > 0) onSettleNoonOrders(settlements);
      if (settleFileRef.current) settleFileRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const downloadSettlementTemplate = () => {
    const data = eligibleForSettlement.length > 0
      ? eligibleForSettlement.map(o => ({ orderNumber: o.orderNumber, settledAmount: '' }))
      : [{ orderNumber: 'NNN-001', settledAmount: '' }];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Settlement');
    XLSX.writeFile(wb, 'noon_settlement_template.xlsx');
  };

  const platformInfo = (p: OrderPlatform) => PLATFORMS.find(x => x.id === p) || PLATFORMS[2];

  const statusCounts = {
    all: noonOrders.length,
    pending: noonOrders.filter(o => o.status === 'pending').length,
    shipped: noonOrders.filter(o => o.status === 'shipped').length,
    delivered: noonOrders.filter(o => o.status === 'delivered').length,
    canceled: noonOrders.filter(o => o.status === 'canceled').length,
    settled: noonOrders.filter(o => o.status === 'settled').length,
  };

  const totalSettlementAmount = useMemo(
    () => selectedEligible.reduce((sum, id) => sum + (parseFloat(settleAmounts[id]) || 0), 0),
    [selectedEligible, settleAmounts]
  );
  const totalSettlementProfit = useMemo(() => {
    return selectedEligible.reduce((sum, id) => {
      const order = noonOrders.find(o => o.id === id);
      if (!order) return sum;
      const cost = order.items.reduce((s, it) => s + (it.costPrice || 0), 0);
      const amount = parseFloat(settleAmounts[id]) || 0;
      return sum + (amount - cost);
    }, 0);
  }, [selectedEligible, settleAmounts, noonOrders]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-xl font-bold text-white">🏪 أوردرات نون / أمازون</h2><p className="text-gray-500 text-sm">{noonOrders.length} أوردر</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1"><Download size={14} /> نموذج Excel</button>
          <label className="btn-secondary text-sm flex items-center gap-1 cursor-pointer"><Upload size={14} /> استيراد Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          </label>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> أوردر جديد</button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'shipped', 'delivered', 'settled', 'canceled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-violet-700/40 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
            {s === 'all' ? 'الكل' : statusLabel(s)} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="bg-violet-900/20 border border-violet-700/30 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-violet-300 text-sm font-medium">تم تحديد {selected.length} أوردر</span>
          <button onClick={() => bulkUpdateStatus('shipped')} className="px-3 py-1.5 bg-blue-700/30 border border-blue-500/40 rounded-lg text-xs text-blue-300">📦 شحن الكل</button>
          <button onClick={() => bulkUpdateStatus('delivered')} className="px-3 py-1.5 bg-green-700/30 border border-green-500/40 rounded-lg text-xs text-green-300">✅ تم التوصيل</button>
          {selectedEligible.length > 0 && (
            <button onClick={openSettleModal} className="px-3 py-1.5 bg-violet-700/30 border border-violet-500/40 rounded-lg text-xs text-violet-300 flex items-center gap-1"><Banknote size={13} /> تسوية تحويل بنكي ({selectedEligible.length})</button>
          )}
          <button onClick={() => bulkUpdateStatus('canceled')} className="px-3 py-1.5 bg-red-700/30 border border-red-500/40 rounded-lg text-xs text-red-300">❌ إلغاء</button>
          <button onClick={() => setSelected([])} className="text-xs text-gray-500 mr-auto">إلغاء التحديد</button>
        </div>
      )}

      {/* Settlement Import shortcut */}
      <div className="bg-[#1a1a35] border border-violet-900/20 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
        <Banknote size={16} className="text-violet-400" />
        <span className="text-gray-400">تسوية جماعية بملف Excel (رقم الأوردر + المبلغ المحول):</span>
        <button onClick={downloadSettlementTemplate} className="text-violet-300 hover:underline">نموذج التسوية</button>
        <label className="text-violet-300 hover:underline cursor-pointer">
          استيراد ملف التسوية
          <input ref={settleFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportSettlement} />
        </label>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الأوردر أو العميل..." className="input-dark w-full pr-9" />
      </div>

      {/* Orders Table */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="py-3 px-4 w-8">
                <button onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map(o => o.id))}>
                  {selected.length === filtered.length && filtered.length > 0 ? <CheckSquare size={14} className="text-violet-400" /> : <Square size={14} className="text-gray-500" />}
                </button>
              </th>
              <th className="text-right py-3 px-3 text-gray-400 font-medium">رقم الأوردر</th>
              <th className="text-right py-3 px-3 text-gray-400 font-medium hidden md:table-cell">العميل</th>
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
                <tr key={o.id} className={`border-t border-white/5 hover:bg-white/5 ${selected.includes(o.id) ? 'bg-violet-900/10' : ''}`}>
                  <td className="py-3 px-4">
                    <button onClick={() => toggleSelect(o.id)}>
                      {selected.includes(o.id) ? <CheckSquare size={14} className="text-violet-400" /> : <Square size={14} className="text-gray-500" />}
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono text-violet-400 text-sm">{o.orderNumber}</div>
                    {o.shipmentNumber && <div className="text-xs text-gray-500">{o.shipmentNumber}</div>}
                  </td>
                  <td className="py-3 px-3 text-white hidden md:table-cell">{o.customerName || '-'}</td>
                  <td className="py-3 px-3 text-center hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${pInfo.color}`}>
                      {pInfo.emoji} {pInfo.label}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-400 text-xs">{o.date}</td>
                  <td className="py-3 px-3 text-center text-white">{o.items.length}</td>
                  <td className="py-3 px-3 text-center">
                    {o.status === 'settled' ? (
                      <span className={`text-xs px-2 py-1 rounded-lg border ${statusColor(o.status)}`}>🏦 {statusLabel(o.status)}</span>
                    ) : (
                      <select
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value as OrderStatus)}
                        className={`text-xs rounded-lg border px-2 py-1 cursor-pointer bg-transparent ${statusColor(o.status)}`}
                      >
                        <option value="pending">⏳ معلق</option>
                        <option value="shipped">📦 تم الشحن</option>
                        <option value="delivered">✅ تم التوصيل</option>
                        <option value="canceled">❌ ملغي</option>
                      </select>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center hidden lg:table-cell">
                    {o.settledAmount != null ? <span className="text-blue-300 font-medium">{formatCurrency(o.settledAmount)}</span> : '-'}
                  </td>
                  <td className="py-3 px-3 text-center hidden lg:table-cell">
                    {o.settlementProfit != null ? (
                      <span className={`font-medium ${o.settlementProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(o.settlementProfit)}</span>
                    ) : '-'}
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-xs text-gray-500">
                      {o.items.slice(0, 2).map((item, i) => (
                        <div key={i}>{item.productName.substring(0, 20)}... {item.serial ? `(${item.serial.substring(0, 6)}...)` : ''}</div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Order Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">🏪 إضافة أوردر جديد</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
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
                <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="input-dark w-full" placeholder="NNN-20240115-001" />
              </div>
              <div>
                <label className="form-label">رقم الشحنة</label>
                <input type="text" value={shipmentNumber} onChange={e => setShipmentNumber(e.target.value)} className="input-dark w-full" placeholder="SHP-001" />
              </div>
              <div>
                <label className="form-label">التاريخ</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">اسم العميل</label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="input-dark w-full" placeholder="اسم العميل" />
              </div>
              <div className="col-span-2">
                <label className="form-label">ملاحظات</label>
                <input type="text" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="input-dark w-full" />
              </div>
            </div>

            {/* Products */}
            <div className="mb-4">
              <label className="form-label">اختر الأجهزة من المخزون</label>
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDrop(true); }}
                  onFocus={() => setShowProductDrop(true)}
                  placeholder="بحث بالمنتج أو UPC..."
                  className="input-dark w-full"
                />
                {showProductDrop && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-[#252545] border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-44 overflow-y-auto">
                    {availableProducts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-500 text-sm">لا توجد منتجات في المخزون</div>
                    ) : availableProducts.map(p => (
                      <button key={p.id} onClick={() => addItemFromProduct(p)}
                        className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.sku} • مخزون: {p.stock} • {p.upc}</div>
                      </button>
                    ))}
                    <button onClick={() => setShowProductDrop(false)} className="block w-full text-right px-3 py-2 text-xs text-gray-500 hover:bg-white/5 border-t border-white/10">إغلاق</button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">⚠️ يمكن فقط اختيار منتجات متوفرة في المخزون</p>
            </div>

            {/* Order Items */}
            <div className="space-y-3 mb-4">
              {orderItems.map((item, idx) => (
                <div key={idx} className="bg-[#252545] border border-violet-900/20 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-white text-sm">{item.productName}</div>
                    <button onClick={() => setOrderItems(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded-lg text-red-400 hover:bg-red-900/20"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" value={item.tempSerial} onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempSerial: e.target.value } : it))} className="input-dark w-full text-xs" placeholder="Serial Number" />
                    <input type="text" value={item.tempImei1} onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei1: e.target.value } : it))} className="input-dark w-full text-xs" placeholder="IMEI 1" />
                    <input type="text" value={item.tempImei2} onChange={e => setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, tempImei2: e.target.value } : it))} className="input-dark w-full text-xs" placeholder="IMEI 2" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">UPC: {item.upc || '-'}</span>
                    <span className="text-xs text-gray-500">السعر: {formatCurrency(item.price)}</span>
                  </div>
                </div>
              ))}
              {orderItems.length === 0 && (
                <div className="text-center text-gray-500 py-4 border border-dashed border-white/10 rounded-xl text-sm">أضف منتجات من قائمة المخزون أعلاه</div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleSaveOrder} className="btn-primary flex-1">💾 حفظ الأوردر</button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Settlement Modal - تسوية تحويل بنكي جماعي */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">🏦 تسوية تحويل بنكي جماعي</h2>
              <button onClick={() => setShowSettleModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10"><X size={18} /></button>
            </div>

            <p className="text-gray-400 text-sm mb-4">أدخل المبلغ الصافي المحول فعليًا لكل أوردر (بعد خصم عمولة المنصة والضريبة). النظام سيحسب الربح تلقائيًا = المبلغ المحول − تكلفة المنتجات.</p>

            <div className="mb-4">
              <label className="form-label">تاريخ التحويل</label>
              <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} className="input-dark w-full md:w-48" />
            </div>

            <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
              {selectedEligible.map(id => {
                const order = noonOrders.find(o => o.id === id);
                if (!order) return null;
                const cost = order.items.reduce((s, it) => s + (it.costPrice || 0), 0);
                const amount = parseFloat(settleAmounts[id]) || 0;
                const profit = amount - cost;
                return (
                  <div key={id} className="bg-[#252545] rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
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

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">إجمالي المبالغ المحولة</div>
                <div className="font-bold text-blue-300 text-lg">{formatCurrency(totalSettlementAmount)}</div>
              </div>
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">إجمالي الربح المتوقع</div>
                <div className={`font-bold text-lg ${totalSettlementProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(totalSettlementProfit)}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleConfirmSettlement} className="btn-primary flex-1">✅ تأكيد التسوية وتحويل الحالة</button>
              <button onClick={() => setShowSettleModal(false)} className="btn-secondary px-4">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
