// src/pages/PendingPurchasePrices.tsx
// صفحة مستقلة لعرض كل السيريالات اللي دخلت المخزون بسعر شراء معلّق،
// وتسمح بكتابة السعر الحقيقي لكل واحد لوحده أو لعدة سيريالات مرة واحدة.
// أي سيريال جاله من فاتورة شراء حقيقية بيفضل مربوط بنفس المورد وبنفس تاريخ
// الفاتورة القديمة، والحقل الوحيد المطلوب هو السعر (المورد ميتسألش عنه تاني).
import React, { useMemo, useState } from 'react';
import { PurchaseInvoice, SerialItem, Supplier } from '../types';
import { formatCurrency, printElement } from '../utils/helpers';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Printer, Search } from 'lucide-react';
import { useGlobalDropdownDismiss } from '../utils/useGlobalDropdownDismiss';

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

  useGlobalDropdownDismiss(() => {
    setRows(prev => {
      let changed = false;
      const next: Record<string, RowState> = {};
      Object.entries(prev).forEach(([id, row]) => {
        if (row.showSupplierDrop) changed = true;
        next[id] = row.showSupplierDrop ? { ...row, showSupplierDrop: false } : row;
      });
      return changed ? next : prev;
    });
  });

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

  // ===== بحث + تجميع في شكل فواتير + تحديد وتسعير جماعي =====
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // كل كلمة في البحث لازم تتلاقي (اسم المنتج / السيريال / IMEI / رقم الفاتورة / المورد)
  const filteredSerials = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return pendingSerials;
    return pendingSerials.filter(s => {
      const inv = s.purchaseInvoiceId ? invoiceById[s.purchaseInvoiceId] : null;
      const hay = [s.productName, s.serial, s.imei1, s.imei2, inv?.invoiceNumber, inv?.supplierName].filter(Boolean).join(' ').toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }, [pendingSerials, search, invoiceById]);

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; invoice: PurchaseInvoice | null; serials: SerialItem[] }>();
    filteredSerials.forEach(sr => {
      const inv = sr.purchaseInvoiceId ? invoiceById[sr.purchaseInvoiceId] || null : null;
      const key = inv ? inv.id : '__none__';
      if (!m.has(key)) m.set(key, { key, invoice: inv, serials: [] });
      m.get(key)!.serials.push(sr);
    });
    const arr = [...m.values()];
    arr.forEach(g => g.serials.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ar') || a.serial.localeCompare(b.serial)));
    arr.sort((a, b) => !a.invoice ? 1 : !b.invoice ? -1
      : (b.invoice.date || '').localeCompare(a.invoice.date || '') || b.invoice.invoiceNumber.localeCompare(a.invoice.invoiceNumber));
    return arr;
  }, [filteredSerials, invoiceById]);

  const isDoneId = (id: string) => getRow(id).status === 'done';
  const selectableIds = filteredSerials.filter(sr => !isDoneId(sr.id)).map(sr => sr.id);
  const selectedIds = selectableIds.filter(id => selected[id]); // المحدد والظاهر حالياً بس
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;

  const toggleOne = (id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleMany = (ids: string[]) => setSelected(prev => {
    const all = ids.length > 0 && ids.every(id => prev[id]);
    const next = { ...prev };
    ids.forEach(id => { next[id] = !all; });
    return next;
  });

  const applyBulkPrice = () => {
    const price = parseFloat(bulkPrice);
    if (!(price > 0) || selectedIds.length === 0) return;
    setRows(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => { next[id] = { ...(prev[id] || emptyRow), price: String(price), status: 'idle', error: undefined }; });
      return next;
    });
    setBulkMsg(`✅ اتكتب السعر ${formatCurrency(price)} لـ ${selectedIds.length} سيريال. راجعهم واضغط «حفظ كل الأسعار المكتوبة».`);
    setSelected({});
    setBulkPrice('');
  };

  const filledCount = pendingSerials.filter(s => {
    const r = getRow(s.id);
    return r.status !== 'done' && r.price && parseFloat(r.price) > 0;
  }).length;

  const doneCount = pendingSerials.filter(s => getRow(s.id).status === 'done').length;

  const printPendingSerials = () => {
    if (pendingSerials.length === 0) {
      alert('لا توجد سيريالات بسعر شراء معلّق للطباعة.');
      return;
    }

    const rows = pendingSerials.map((serial, index) => {
      const originInvoice = serial.purchaseInvoiceId ? invoiceById[serial.purchaseInvoiceId] : null;
      const serialValue = serial.serial || '-';
      const imei = serial.imei1 || serial.imei2 || '';
      const supplier = originInvoice?.supplierName || '-';
      const date = originInvoice?.date || (serial.createdAt ? serial.createdAt.slice(0, 10) : '-');
      return `
        <tr>
          <td>${index + 1}</td>
          <td style="text-align:right;font-weight:700">${serial.productName || '-'}</td>
          <td style="font-family:monospace;font-size:13px;direction:ltr">${serialValue}</td>
          <td style="font-family:monospace;font-size:12px;direction:ltr">${imei || '-'}</td>
          <td>${supplier}</td>
          <td>${date}</td>
          <td style="min-width:110px;height:38px"></td>
        </tr>`;
    }).join('');

    printElement(`
      <div dir="rtl" style="font-family:Arial,sans-serif;padding:20px;color:#111">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:14px">
          <div>
            <h1 style="margin:0 0 6px;font-size:22px">ONE — كشف سيريالات بسعر شراء معلّق</h1>
            <div style="font-size:13px;color:#555">السيريالات التي تحتاج تحديد سعر الشراء بواسطة المدير</div>
          </div>
          <div style="text-align:left;font-size:12px;color:#555">
            <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
            <div style="margin-top:4px">الإجمالي: <b style="color:#111">${pendingSerials.length}</b> سيريال</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f1f1f1">
              <th style="border:1px solid #999;padding:8px;width:38px">#</th>
              <th style="border:1px solid #999;padding:8px">المنتج</th>
              <th style="border:1px solid #999;padding:8px">Serial</th>
              <th style="border:1px solid #999;padding:8px">IMEI</th>
              <th style="border:1px solid #999;padding:8px">المورد</th>
              <th style="border:1px solid #999;padding:8px">تاريخ الدخول</th>
              <th style="border:1px solid #999;padding:8px">سعر الشراء</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:18px;border:1px solid #999;padding:10px;font-size:12px">
          <b>تعليمات:</b> اكتب سعر الشراء الحقيقي في خانة «سعر الشراء» أمام كل سيريال، ثم أدخل الأسعار في النظام من صفحة السيريالات المعلّقة.
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:28px;font-size:12px">
          <span>اعتماد المدير: ____________________</span>
          <span>التوقيع: ____________________</span>
        </div>
      </div>
    `, 'سيريالات بسعر شراء معلّق');
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={printPendingSerials}
            disabled={pendingSerials.length === 0}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer size={16} /> طباعة السيريالات ({pendingSerials.length})
          </button>
          {filledCount > 0 && (
            <button onClick={saveAll} className="btn-primary text-sm">
              💾 حفظ كل الأسعار المكتوبة ({filledCount})
            </button>
          )}
        </div>
      </div>

      {pendingSerials.length === 0 ? (
        <div className="bg-elevated border border-green-700/30 rounded-2xl p-8 text-center text-green-400">
          ✅ كل السيريالات لها سعر شراء محدد
        </div>
      ) : (
        <>
          {/* بحث */}
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم المنتج (مثلاً Airpods) أو السيريال أو رقم الفاتورة أو المورد..."
              className="input-dark w-full pr-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-gray-400">
            <span>
              {search.trim() ? <>ظاهر <b className="text-white">{filteredSerials.length}</b> من {pendingSerials.length} سيريال</> : <>{pendingSerials.length} سيريال في {groups.length} فاتورة</>}
            </span>
            {selectableIds.length > 0 && (
              <button onClick={() => toggleMany(selectableIds)} className="text-violet-300 hover:underline">
                {allSelected ? 'إلغاء تحديد الكل' : `تحديد كل الظاهر (${selectableIds.length})`}
              </button>
            )}
          </div>

          {/* تسعير جماعي للمحدد */}
          {selectedIds.length > 0 && (
            <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-500/40 bg-violet-950/90 backdrop-blur px-4 py-3">
              <span className="text-sm text-white font-medium">محدد {selectedIds.length} سيريال</span>
              <input
                type="number"
                value={bulkPrice}
                onChange={e => setBulkPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyBulkPrice(); }}
                placeholder="سعر الشراء الموحد"
                className="input-dark w-40"
              />
              <button onClick={applyBulkPrice} disabled={!(parseFloat(bulkPrice) > 0)} className="btn-primary text-sm disabled:opacity-50">
                تطبيق السعر على المحدد
              </button>
              <button onClick={() => setSelected({})} className="text-xs text-gray-400 hover:text-white">إلغاء التحديد</button>
            </div>
          )}
          {bulkMsg && (
            <div className="mb-3 rounded-xl border border-green-700/30 bg-green-900/20 px-4 py-2 text-sm text-green-300 flex justify-between gap-2">
              <span>{bulkMsg}</span>
              <button onClick={() => setBulkMsg('')} className="text-green-200">×</button>
            </div>
          )}

          {filteredSerials.length === 0 ? (
            <div className="bg-elevated border border-white/10 rounded-2xl p-8 text-center text-gray-400">مفيش سيريالات مطابقة للبحث</div>
          ) : (
            <div className="space-y-4">
              {groups.map(g => {
                const inv = g.invoice;
                const ids = g.serials.filter(sr => !isDoneId(sr.id)).map(sr => sr.id);
                const groupAll = ids.length > 0 && ids.every(id => selected[id]);
                const isCollapsed = !!collapsed[g.key];
                const counts = new Map<string, number>();
                g.serials.forEach(sr => counts.set(sr.productName, (counts.get(sr.productName) || 0) + 1));
                const summary = [...counts.entries()].map(([n, c]) => `${n} ×${c}`).join(' · ');
                return (
                  <div key={g.key} className={`rounded-2xl border overflow-hidden bg-elevated ${inv ? 'border-violet-700/40' : 'border-yellow-700/40'}`}>
                    {/* رأس الفاتورة */}
                    <div
                      className={`flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer select-none ${inv ? 'bg-violet-900/25' : 'bg-yellow-900/15'}`}
                      onClick={() => setCollapsed(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                    >
                      <input
                        type="checkbox"
                        checked={groupAll}
                        disabled={ids.length === 0}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleMany(ids)}
                        title="تحديد كل سيريالات الفاتورة دي"
                      />
                      <div className="flex-1 min-w-[220px]">
                        {inv ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono font-bold text-violet-300">فاتورة {inv.invoiceNumber}</span>
                            <span className="text-sm text-white">{inv.supplierName}</span>
                            <span className="text-xs text-gray-400">{inv.date}</span>
                          </div>
                        ) : (
                          <div className="text-sm text-yellow-400 flex items-center gap-1.5">
                            <AlertTriangle size={14} /> سيريالات بدون فاتورة أصلية — لازم تختار مورد لكل سيريال
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{summary}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-lg border border-orange-600/40 bg-orange-900/20 text-orange-300 whitespace-nowrap">
                        {g.serials.length} معلّق
                      </span>
                      {isCollapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
                    </div>

                    {!isCollapsed && (
                      <div className="divide-y divide-white/5">
                        {g.serials.map(serial => {
                          const row = getRow(serial.id);
                          const originInvoice = inv;
                          const isDone = row.status === 'done';
                          return (
                            <div key={serial.id} className={`p-4 transition-colors ${isDone ? 'opacity-60' : ''} ${selected[serial.id] && !isDone ? 'bg-violet-900/15' : ''}`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-[200px]">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={!!selected[serial.id] && !isDone}
                                    disabled={isDone}
                                    onChange={() => toggleOne(serial.id)}
                                  />
                                  <div>
                                    <div className="text-sm font-medium text-white">{serial.productName}</div>
                                    <div className="text-xs text-gray-500 font-mono">
                                      {serial.serial}
                                      {serial.imei1 ? ` | IMEI: ${serial.imei1}` : ''}
                                    </div>
                                  </div>
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
                                              .filter(sp => sp.name.toLowerCase().includes(row.supplierSearch.toLowerCase()))
                                              .slice(0, 8)
                                              .map(sp => (
                                                <button
                                                  key={sp.id}
                                                  onClick={() =>
                                                    updateRow(serial.id, { supplierId: sp.id, supplierSearch: sp.name, showSupplierDrop: false })
                                                  }
                                                  className="block w-full text-right px-3 py-2 text-sm text-gray-300 hover:bg-violet-700/20"
                                                >
                                                  {sp.name}
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
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
