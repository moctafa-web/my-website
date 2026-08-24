import React, { useState } from 'react';
import { Product, SerialItem, StockTransfer, WarehouseLocation } from '../types';
import { formatCurrency, generateId, getTodayStr } from '../utils/helpers';
import { Plus, Trash2, CheckCircle, Clock, X, Download } from 'lucide-react';

interface StockTransferProps {
  products: Product[];
  serials: SerialItem[];
  stockTransfers: StockTransfer[];
  onAddTransfer: (transfer: StockTransfer) => void;
  onUpdateTransfer: (transfer: StockTransfer) => void;
}

export default function StockTransferPage({
  products,
  serials,
  stockTransfers,
  onAddTransfer,
  onUpdateTransfer,
}: StockTransferProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'received' | 'canceled'>('all');
  
  const [form, setForm] = useState({
    fromLocation: 'warehouse' as WarehouseLocation,
    toLocation: 'store' as WarehouseLocation,
    date: getTodayStr(),
    items: [] as Array<{ productId: string; quantity: number; serials: string[] }>,
    notes: '',
  });

  const [selectedProduct, setSelectedProduct] = useState('');
  const [transferQty, setTransferQty] = useState('');

  // إضافة منتج للحوالة
  const addItemToTransfer = () => {
    if (!selectedProduct || !transferQty) return;
    
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const existingItem = form.items.find(i => i.productId === selectedProduct);
    if (existingItem) {
      existingItem.quantity += parseInt(transferQty);
    } else {
      form.items.push({
        productId: selectedProduct,
        quantity: parseInt(transferQty),
        serials: [],
      });
    }

    setForm({ ...form, items: [...form.items] });
    setSelectedProduct('');
    setTransferQty('');
  };

  // حفظ الحوالة
  const saveTransfer = () => {
    if (form.items.length === 0) return;

    const newTransfer: StockTransfer = {
      id: generateId(),
      transferNumber: `TR-${generateId()}`,
      fromLocation: form.fromLocation,
      toLocation: form.toLocation,
      date: form.date,
      items: form.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: product?.name || '',
          quantity: item.quantity,
        };
      }),
      notes: form.notes,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    onAddTransfer(newTransfer);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      fromLocation: 'warehouse',
      toLocation: 'store',
      date: getTodayStr(),
      items: [],
      notes: '',
    });
    setShowForm(false);
  };

  // تأكيد استلام الحوالة
  const confirmReceipt = (transfer: StockTransfer) => {
    onUpdateTransfer({
      ...transfer,
      status: 'received',
      receivedBy: 'Current User',
    });
  };

  const filtered = (stockTransfers || []).filter(t =>
    statusFilter === 'all' || t.status === statusFilter
  );

  const locationLabel = (location: WarehouseLocation) =>
    location === 'warehouse' ? '🏭 المستودع' : '🏪 المحل';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📦 تحويلات المخزون</h2>
          <p className="text-gray-500 text-sm">إدارة الحركات بين المستودع والمحل</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> حوالة جديدة
        </button>
      </div>

      {/* الفلترة */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'received', 'canceled'] as const).map(status => (
          <button key={status} onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              statusFilter === status
                ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                : 'border-white/10 text-gray-400 hover:border-white/20'
            }`}>
            {status === 'all' ? 'الكل' : status === 'pending' ? '⏳ معلقة' : status === 'received' ? '✅ مستقبلة' : '❌ ملغاة'}
            ({filtered.length})
          </button>
        ))}
      </div>

      {/* نموذج الحوالة الجديدة */}
      {showForm && (
        <div className="bg-elevated border border-violet-900/30 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">حوالة مخزون جديدة</h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">من</label>
              <select value={form.fromLocation} onChange={e => setForm({ ...form, fromLocation: e.target.value as WarehouseLocation })}
                className="input-dark w-full">
                <option value="warehouse">المستودع</option>
                <option value="store">المحل</option>
              </select>
            </div>
            <div>
              <label className="form-label">إلى</label>
              <select value={form.toLocation} onChange={e => setForm({ ...form, toLocation: e.target.value as WarehouseLocation })}
                className="input-dark w-full">
                <option value="warehouse">المستودع</option>
                <option value="store">المحل</option>
              </select>
            </div>
          </div>

          {/* إضافة منتجات */}
          <div className="space-y-2">
            <label className="form-label">المنتجات</label>
            <div className="flex gap-2">
              <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
                className="input-dark flex-1">
                <option value="">اختر منتج</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="number" value={transferQty} onChange={e => setTransferQty(e.target.value)}
                placeholder="الكمية" className="input-dark w-20" min="1" />
              <button onClick={addItemToTransfer} className="btn-primary">إضافة</button>
            </div>

            {form.items.length > 0 && (
              <div className="bg-white/5 rounded-lg p-3 space-y-2">
                {form.items.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-white">{product?.name} × {item.quantity}</span>
                      <button onClick={() => {
                        setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
                      }} className="text-red-400 hover:text-red-300">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="form-label">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="ملاحظات إضافية..." className="input-dark w-full h-20 resize-none" />
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={resetForm} className="btn-secondary">إلغاء</button>
            <button onClick={saveTransfer} className="btn-primary">حفظ الحوالة</button>
          </div>
        </div>
      )}

      {/* قائمة الحوالات */}
      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map(transfer => (
            <div key={transfer.id} className="bg-elevated border border-violet-900/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    {locationLabel(transfer.fromLocation)} → {locationLabel(transfer.toLocation)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{transfer.date} • {transfer.transferNumber}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                    transfer.status === 'received' ? 'bg-green-900/30 text-green-300' :
                    transfer.status === 'pending' ? 'bg-yellow-900/30 text-yellow-300' :
                    'bg-red-900/30 text-red-300'
                  }`}>
                    {transfer.status === 'received' ? '✅ مستقبلة' : transfer.status === 'pending' ? '⏳ معلقة' : '❌ ملغاة'}
                  </span>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-3 mb-3 text-xs">
                <div className="font-medium text-white mb-2">المنتجات ({transfer.items.length}):</div>
                <div className="space-y-1 text-gray-300">
                  {transfer.items.map((item, idx) => (
                    <div key={idx}>• {item.productName} × {item.quantity}</div>
                  ))}
                </div>
              </div>

              {transfer.status === 'pending' && (
                <button onClick={() => confirmReceipt(transfer)} 
                  className="btn-primary text-xs w-full flex items-center justify-center gap-1">
                  <CheckCircle size={14} /> تأكيد الاستلام
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="bg-elevated border border-white/10 rounded-2xl p-8 text-center text-gray-500">
            <span>لا توجد حوالات</span>
          </div>
        )}
      </div>
    </div>
  );
}
