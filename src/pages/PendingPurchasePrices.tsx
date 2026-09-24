// src/pages/PendingPurchasePrices.tsx
// صفحة مستقلة لعرض كل السيريالات اللي دخلت المخزون بسعر شراء معلّق،
// وتسمح بكتابة السعر الحقيقي لكل واحد لوحده أو لعدة سيريالات مرة واحدة.
// أي سيريال جاله من فاتورة شراء حقيقية بيفضل مربوط بنفس المورد وبنفس تاريخ
// الفاتورة القديمة، والحقل الوحيد المطلوب هو السعر (المورد ميتسألش عنه تاني).
import React, { useMemo, useState } from 'react';
import { PurchaseInvoice, SerialItem, Supplier } from '../types';
import { formatCurrency } from '../utils/helpers';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  serials: SerialItem[];
  purchaseInvoices: PurchaseInvoice[];
  suppliers: Supplier[];
  settings: { lastPurchaseInvoiceNum: number; purchasePrefix: string };
  onCompletePendingPurchase: (
    serialId: string,
    newCostPrice: number,
    supplierId: string,
    supplierName: string,
    paymentMethod: 'cash' | 'bank' | 'credit',
    paidAmount: number,
    invoiceNumber: string
  ) => { success: boolean; message?: string } | void;
  onNavigate: (page: string) => void;
}

interface RowState {
  price: string;
  supplierId: string;
  supplierSearch: string;
  showSupplierDrop: boolean;
  paymentMethod: 'cash' | 'bank' | 'credit';
  paidAmount: string;
  showPayment: boolean;
  status: 'idle' | 'saving' | 'done' | 'error';
  error?: string;
}

const emptyRow: RowState = {
  price: '',
  supplierId: '',
  supplierSearch: '',
  showSupplierDrop: false,
  paymentMethod: 'credit',
  paidAmount: '',
  showPayment: false,
  status: 'idle',
};

export default function PendingPurchasePrices({
  serials, purchaseInvoices, suppliers, settings, onCompletePendingPurchase, onNavigate,
}: Props) {
  const pendingSerials = useMemo(
    () =>
      serials
        .filter(s => s.purchasePricePending === true || s.costPrice === 0)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [serials]
  );

  const invoiceById = useMemo(() => {
    const map: Record<string, PurchaseInvoice> = {};
    purchaseInvoices.forEach(inv => { map[inv.id] = inv; });
    return map;
  }, [purchaseInvoices]);

  const [rows, setRows] = useState<Record<string, RowState>>({});

  const getRow = (id: string): RowState => rows[id] || emptyRow;
  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows(prev => ({ ...prev, [id]: { ...getRow(id), ...patch } }));
  };

  // رقم فاتورة جديد بيتحسب بس لو السيريال مالوش فاتورة أصلية (حالة نادرة).
  // بنضيف offset عشان لو أكتر من سيريال من غير فاتورة بيتحفظوا مع بعض في دفعة واحدة.
  const makeInvoiceNumber = (offset: number) => {
    const existingNumbers = purchaseInvoices
      .map(inv => parseInt(inv.invoiceNumber.split('-').pop() || '0', 10))
      .filter(n => !isNaN(n));
    const nextNum = Math.max(settings.lastPurchaseInvoiceNum, ...existingNumbers, 1000) + 1 + offset;
    return `${settings.purchasePrefix}-${String(nextNum).padStart(4, '0')}`;
  };

  const saveRow = (serial: SerialItem, invoiceOffset: number): boolean => {
    const row = getRow(serial.id);
    const price = parseFloat(row.price);
    if (!price || price <= 0) {
      updateRow(serial.id, { status: 'error', error: 'أدخل سعر شراء صحيح' });
      return false;
    }

    const originInvoice = serial.purchaseInvoiceId ? invoiceById[serial.purchaseInvoiceId] : null;
    const supplierId = originInvoice?.supplierId || row.supplierId;
    const supplierName =
      originInvoice?.supplierName || suppliers.find(s => s.id === row.supplierId)?.name || '';

    if (!originInvoice && !supplierId) {
      updateRow(serial.id, { status: 'error', error: 'اختر المورد أولاً (السيريال ده مالوش فاتورة أصلية)' });
      return false;
    }

    updateRow(serial.id, { status: 'saving', error: undefined });
    const paidAmount = parseFloat(row.paidAmount) || 0;
    const result = onCompletePendingPurchase(
      serial.id,
      price,
      supplierId,
      supplierName,
      row.paymentMethod,
      paidAmount,
      originInvoice ? originInvoice.invoiceNumber : makeInvoiceNumber(invoiceOffset)
    );

    if (result && 'success' in result && !result.success) {
      updateRow(serial.id, { status: 'error', error: result.message || 'حدث خطأ' });
      return false;
    }

    updateRow(serial.id, { status: 'done', error: undefined });
    return true;
  };

  const saveAll = () => {
    let offset = 0;
    pendingSerials.forEach(serial => {
      const row = getRow(serial.id);
      if (row.status === 'done') return;
      if (!row.price || parseFloat(row.price) <= 0) return; // بس اللي اتكتب لهم سعر
      const originInvoice = serial.purchaseInvoiceId ? invoiceById[serial.purchaseInvoiceId] : null;
      const ok = saveRow(serial, offset);
      if (ok && !originInvoice) offset += 1;
    });
  };

  const filledCount = pendingSerials.filter(s => {
    const r = getRow(s.id);
    return r.status !== 'done' && r.price && parseFloat(r.price) > 0;
  }).length;

  const doneCount = pendingSerials.filter(s => getRow(s.id).status === 'done').length;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="btn-secondary text-sm flex items-center gap-1.5">
            <ArrowRight size={16} /> رجوع للرئيسية
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">سيريالات بسعر شراء معلّق</h1>
            <p className="text-xs text-gray-500">
              {pendingSerials.length === 0
                ? 'كل السيريالات لها سعر شراء محدد'
                : `${pendingSerials.length} سيريال يحتاج تحديد سعر الشراء الحقيقي${doneCount ? ` — تم حفظ ${doneCount}` : ''}`}
            </p>
          </div>
        </div>
        {filledCount > 0 && (
          <button onClick={saveAll} className="btn-primary text-sm">
            💾 حفظ كل الأسعار المكتوبة ({filledCount})
          </button>
        )}
      </div>

      {pendingSerials.length === 0 ? (
        <div className="bg-elevated border border-green-700/30 rounded-2xl p-8 text-center text-green-400">
          ✅ كل السيريالات لها سعر شراء محدد
        </div>
      ) : (
        <div className="space-y-3">
          {pendingSerials.map(serial => {
            const row = getRow(serial.id);
            const originInvoice = serial.purchaseInvoiceId ? invoiceById[serial.purchaseInvoiceId] : null;
            const isDone = row.status === 'done';
            return (
              <div
                key={serial.id}
                className={`bg-elevated border rounded-2xl p-4 transition-colors ${
                  isDone ? 'border-green-700/30 opacity-60' : 'border-orange-700/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[200px]">
                    <div className="text-sm font-medium text-white">{serial.productName}</div>
                    <div className="text-xs text-gray-500 font-mono">
                      {serial.serial}
                      {serial.imei1 ? ` | IMEI: ${serial.imei1}` : ''}
                    </div>
                    {originInvoice ? (
                      <div className="text-xs text-violet-400 mt-1">
                        فاتورة {originInvoice.invoiceNumber} — {originInvoice.supplierName} — {originInvoice.date}
                      </div>
                    ) : (
                      <div className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} /> لا توجد فاتورة أصلية — لازم تختار مورد
                      </div>
                    )}
                  </div>

                  {isDone ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                      <CheckCircle2 size={16} /> تم الحفظ
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        value={row.price}
                        onChange={e => updateRow(serial.id, { price: e.target.value, status: 'idle', error: undefined })}
                        placeholder="سعر الشراء"
                        className="input-dark w-32"
                      />

                      {!originInvoice && (
                        <div className="relative">
                          <input
                            type="text"
                            value={row.supplierSearch}
                            onChange={e =>
                              updateRow(serial.id, { supplierSearch: e.target.value, supplierId: '', showSupplierDrop: true })
                            }
                            onFocus={() => updateRow(serial.id, { showSupplierDrop: true })}
                            placeholder="اختر مورد..."
                            className="input-dark w-40"
                          />
                          {row.showSupplierDrop && (
                            <div className="absolute top-full mt-1 right-0 left-0 bg-muted-bg border border-violet-900/40 rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
                              {suppliers
                                .filter(s => s.name.toLowerCase().includes(row.supplierSearch.toLowerCase()))
                                .slice(0, 8)
                                .map(s => (
                                  <button
                                    key={s.id}
                                    onClick={() =>
                                      updateRow(serial.id, { supplierId: s.id, supplierSearch: s.name, showSupplierDrop: false })
                                    }
                                    className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20"
                                  >
                                    {s.name}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => updateRow(serial.id, { showPayment: !row.showPayment })}
                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                      >
                        دفعة {row.showPayment ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      <button
                        onClick={() => saveRow(serial, 0)}
                        disabled={row.status === 'saving'}
                        className="btn-primary text-xs px-3 py-2"
                      >
                        {row.status === 'saving' ? '...' : 'حفظ'}
                      </button>
                    </div>
                  )}
                </div>

                {row.showPayment && !isDone && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    {(['cash', 'bank', 'credit'] as const).map(method => (
                      <button
                        key={method}
                        onClick={() => updateRow(serial.id, { paymentMethod: method })}
                        className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                          row.paymentMethod === method
                            ? 'bg-violet-700/30 border-violet-500/50 text-violet-300'
                            : 'border-white/10 text-gray-400'
                        }`}
                      >
                        {method === 'cash' ? '💵 كاش' : method === 'bank' ? '🏦 بنك' : '⏳ آجل'}
                      </button>
                    ))}
                    {row.paymentMethod !== 'credit' && (
                      <input
                        type="number"
                        value={row.paidAmount}
                        onChange={e => updateRow(serial.id, { paidAmount: e.target.value })}
                        placeholder={`من ${formatCurrency(parseFloat(row.price) || 0)}`}
                        className="input-dark w-32"
                      />
                    )}
                  </div>
                )}

                {row.error && (
                  <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} /> {row.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
