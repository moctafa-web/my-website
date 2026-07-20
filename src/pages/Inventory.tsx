import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, SerialItem, SaleInvoice, PurchaseInvoice, NoonOrder, Customer } from '../types';
import { formatCurrency, categoryLabel, printElement, getTodayStr } from '../utils/helpers';
import { Search, Printer, Package, Hash, Eye, CheckCircle2, X } from 'lucide-react';
import PasswordConfirmModal from '../components/PasswordConfirmModal';

interface Props {
  products: Product[];
  serials: SerialItem[];
  saleInvoices?: SaleInvoice[];
  purchaseInvoices?: PurchaseInvoice[];
  noonOrders?: NoonOrder[];
  customers?: Customer[];
  onUpdateProduct?: (p: Product) => void;
}

type UnifiedResultType = 'serial' | 'product' | 'saleInvoice' | 'purchaseInvoice';
interface UnifiedSuggestion {
  type: UnifiedResultType;
  data: SerialItem | Product | SaleInvoice | PurchaseInvoice;
  title: string;
  subtitle: string;
  searchLabel: string;
  typeLabel: string;
}

export default function Inventory({ products, serials, saleInvoices = [], purchaseInvoices = [], noonOrders = [], customers = [], onUpdateProduct }: Props) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showSerials, setShowSerials] = useState<string | null>(null);

  const [showJrard, setShowJrard] = useState(false);
  const [jrardData, setJrardData] = useState<Record<string, string>>({});

  // ==================== بحث موحّد ====================
  const [unifiedSearch, setUnifiedSearch] = useState('');
  const [unifiedResult, setUnifiedResult] = useState<UnifiedSuggestion | null>(null);
  const [showUnifiedSuggestions, setShowUnifiedSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowUnifiedSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unifiedSuggestions = useMemo((): UnifiedSuggestion[] => {
    const q = unifiedSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: UnifiedSuggestion[] = [];

    // سيريالات (بحث بالسيريال أو IMEI)
    serials.filter(s =>
      s.serial.toLowerCase().includes(q) ||
      (s.imei1 || '').toLowerCase().includes(q) ||
      (s.imei2 || '').toLowerCase().includes(q)
    ).slice(0, 6).forEach(s => {
      const statusLabel = s.status === 'available' ? '🟢 متاح' : s.status === 'sold' ? '🔵 مباع' : s.status === 'transferred' ? '🟣 محوّل' : '↩️ مرتجع';
      results.push({ type: 'serial', data: s, title: s.serial, subtitle: `${s.productName} • ${statusLabel}`, searchLabel: s.serial, typeLabel: 'سيريال' });
    });

    // منتجات
    products.filter(p =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    ).slice(0, 4).forEach(p => {
      results.push({ type: 'product', data: p, title: p.name, subtitle: `${p.sku} • مخزون: ${serials.filter(s => s.productId === p.id && s.status === 'available').length}`, searchLabel: p.name, typeLabel: 'منتج' });
    });

    // فواتير بيع (برقم الفاتورة أو اسم العميل)
    saleInvoices.filter(i =>
      i.invoiceNumber.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)
    ).slice(0, 3).forEach(i => {
      results.push({ type: 'saleInvoice', data: i, title: i.invoiceNumber, subtitle: `${i.customerName} • ${i.date} • ${formatCurrency(i.total)}`, searchLabel: i.invoiceNumber, typeLabel: 'فاتورة بيع' });
    });

    // فواتير شراء
    purchaseInvoices.filter(i =>
      i.invoiceNumber.toLowerCase().includes(q) || i.supplierName.toLowerCase().includes(q)
    ).slice(0, 3).forEach(i => {
      results.push({ type: 'purchaseInvoice', data: i, title: i.invoiceNumber, subtitle: `${i.supplierName} • ${i.date} • ${formatCurrency(i.total)}`, searchLabel: i.invoiceNumber, typeLabel: 'فاتورة شراء' });
    });

    return results;
  }, [unifiedSearch, serials, products, saleInvoices, purchaseInvoices]);

  // ==================== بيانات قديمة (مستخدمة في أقسام أخرى) ====================
  const [trackTab, setTrackTab] = useState<'serial' | 'product'>('serial');
  const [serialSearch, setSerialSearch] = useState('');
  const [productTrackId, setProductTrackId] = useState('');
  const [productTrackSearch, setProductTrackSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  const [viewSaleInvoice, setViewSaleInvoice] = useState<SaleInvoice | null>(null);
  const [viewPurchaseInvoice, setViewPurchaseInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewNoonOrder, setViewNoonOrder] = useState<NoonOrder | null>(null);

  const [confirmApplyCorrections, setConfirmApplyCorrections] = useState(false);
  const [correctionsToast, setCorrectionsToast] = useState<string | null>(null);

  const serialSuggestions = serialSearch.trim().length > 0
    ? serials.filter(s =>
        s.serial.toLowerCase().includes(serialSearch.trim().toLowerCase()) ||
        (s.imei1 || '').toLowerCase().includes(serialSearch.trim().toLowerCase()) ||
        (s.imei2 || '').toLowerCase().includes(serialSearch.trim().toLowerCase())
      ).slice(0, 8)
    : [];

  const [selectedSerialId, setSelectedSerialId] = useState<string | null>(null);
  const [showSerialSuggestions, setShowSerialSuggestions] = useState(false);

  const trackedSerial = selectedSerialId
    ? serials.find(s => s.id === selectedSerialId)
    : serialSuggestions.length === 1 ? serialSuggestions[0] : null;

  const getSerialHistory = (serial: SerialItem) => ({
    purchase: serial.purchaseInvoiceId ? purchaseInvoices.find(i => i.id === serial.purchaseInvoiceId) ?? null : null,
    sale: serial.saleInvoiceId ? saleInvoices.find(i => i.id === serial.saleInvoiceId) ?? null : null,
    noonOrder: serial.noonOrderId ? noonOrders.find(o => o.id === serial.noonOrderId) ?? null : null,
  });

  const productSuggestions = productTrackSearch.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(productTrackSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productTrackSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const selectedProduct = productTrackId ? products.find(p => p.id === productTrackId) : null;

  const getProductHistory = (productId: string) => ({
    purchases: purchaseInvoices.filter(inv => inv.items.some(item => item.productId === productId)),
    sales: saleInvoices.filter(inv => inv.items.some(item => item.productId === productId)),
    noon: noonOrders.filter(o => o.items.some(item => item.productId === productId) && o.status !== 'canceled'),
  });

  const filtered = products.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.brand.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const getAvailableSerials = (productId: string) =>
    serials.filter(s => s.productId === productId && s.status === 'available');
  const getSoldSerials = (productId: string) =>
    serials.filter(s => s.productId === productId && s.status === 'sold');
  const getTransferredSerials = (productId: string) =>
    serials.filter(s => s.productId === productId && s.status === 'transferred');

  const getRealStock = (p: Product) => {
    if (p.productType === 'serial') return getAvailableSerials(p.id).length;
    return p.stock;
  };

  const getSoldCount = (p: Product) => {
    if (p.productType === 'serial') return getSoldSerials(p.id).length;
    return saleInvoices.reduce((sum, inv) =>
      sum + inv.items.filter(item => item.productId === p.id).reduce((s, item) => s + item.quantity, 0), 0);
  };

  const getTransferredCount = (p: Product) => {
    if (p.productType === 'serial') return getTransferredSerials(p.id).length;
    return noonOrders
      .filter(o => o.status !== 'canceled')
      .reduce((sum, o) => sum + o.items.filter(item => item.productId === p.id).length, 0);
  };

  const totalValue = products.reduce((s, p) => s + p.costPrice * getRealStock(p), 0);
  const totalSaleValue = products.reduce((s, p) => s + p.salePrice * getRealStock(p), 0);
  const totalStock = products.reduce((s, p) => s + getRealStock(p), 0);

  // ✅ طباعة المخزون العام
  const printInventory = () => {
    const rows = filtered.map(p => {
      const avail = getRealStock(p);
      return `<tr>
        <td>${p.name}</td><td>${p.sku}</td><td>${p.brand}</td>
        <td style="text-align:center">${categoryLabel(p.category)}</td>
        <td style="text-align:center">${avail}</td>
        <td style="text-align:center">${formatCurrency(p.costPrice)}</td>
        <td style="text-align:center">${formatCurrency(p.salePrice)}</td>
      </tr>`;
    }).join('');
    printElement(`
      <div class="header">
        <div><div class="company-name">ONE</div></div>
        <div class="invoice-info">
          <div><strong>تقرير المخزون</strong></div>
          <div>التاريخ: ${getTodayStr()}</div>
        </div>
      </div>
      <p style="margin-bottom:10px;font-size:12px">
        إجمالي القيمة بالشراء: ${formatCurrency(totalValue)} |
        إجمالي القيمة بالبيع: ${formatCurrency(totalSaleValue)}
      </p>
      <table>
        <thead>
          <tr>
            <th>المنتج</th><th>SKU</th><th>البراند</th>
            <th>الفئة</th><th>المخزون</th><th>سعر الشراء</th><th>سعر البيع</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  };

  // ✅ المنتجات اللي ممكن نصحح رصيدها أوتوماتيك (المنتجات العادية بس، مش السيريالات لأن كل قطعة سيريال ليها سجل مستقل)
  const correctableProducts = filtered.filter(p => {
    if (p.productType !== 'normal') return false;
    const val = jrardData[p.id];
    if (val === undefined || val === '') return false;
    const actual = parseInt(val);
    return !isNaN(actual) && actual !== p.stock;
  });

  const applyCorrections = () => {
    if (!onUpdateProduct) { setConfirmApplyCorrections(false); return; }
    correctableProducts.forEach(p => {
      const actual = parseInt(jrardData[p.id]);
      onUpdateProduct({ ...p, stock: actual, updatedAt: new Date().toISOString() });
    });
    setCorrectionsToast(`✅ اتصحح رصيد ${correctableProducts.length} منتج حسب الجرد`);
    setJrardData(prev => {
      const next = { ...prev };
      correctableProducts.forEach(p => { delete next[p.id]; });
      return next;
    });
    setConfirmApplyCorrections(false);
    setTimeout(() => setCorrectionsToast(null), 4000);
  };

  // ✅ طباعة الجرد - الحل الصحيح بدل window.print()
  const printJrard = () => {
    const today = getTodayStr();
    const rows = filtered.map(p => {
      const inSystem = getRealStock(p);
      const actualVal = jrardData[p.id] !== undefined ? parseInt(jrardData[p.id]) : NaN;
      const diffVal = !isNaN(actualVal) ? actualVal - inSystem : NaN;

      const diffCell = !isNaN(diffVal)
        ? diffVal === 0
          ? `<span style="color:#16a34a;font-weight:bold">✓ تطابق</span>`
          : diffVal < 0
          ? `<span style="color:#dc2626;font-weight:bold">⚠️ عجز ${Math.abs(diffVal)}</span>`
          : `<span style="color:#d97706;font-weight:bold">📈 زيادة ${diffVal}</span>`
        : '<span style="color:#9ca3af">—</span>';

      return `<tr>
        <td>
          <div style="font-weight:600">${p.name}</div>
          <div style="font-size:11px;color:#6b7280">${p.sku} • ${p.brand}</div>
        </td>
        <td style="text-align:center;font-weight:bold">${inSystem}</td>
        <td style="text-align:center;color:#6b7280">${!isNaN(actualVal) ? actualVal : '—'}</td>
        <td style="text-align:center">${diffCell}</td>
      </tr>`;
    }).join('');

    // حساب ملخص الجرد
    const filledCount = filtered.filter(p => jrardData[p.id] !== undefined && jrardData[p.id] !== '').length;
    const matchCount  = filtered.filter(p => {
      const actual = parseInt(jrardData[p.id]);
      return !isNaN(actual) && actual === getRealStock(p);
    }).length;
    const deficitCount = filtered.filter(p => {
      const actual = parseInt(jrardData[p.id]);
      return !isNaN(actual) && actual < getRealStock(p);
    }).length;
    const surplusCount = filtered.filter(p => {
      const actual = parseInt(jrardData[p.id]);
      return !isNaN(actual) && actual > getRealStock(p);
    }).length;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>جرد المخزون - ONE - ${today}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; direction: rtl; padding: 24px; color: #111; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 20px; }
          .company { font-size: 28px; font-weight: 900; color: #7c3aed; }
          .title-box { text-align: left; }
          .title-box h2 { font-size: 18px; font-weight: 700; }
          .title-box p { font-size: 12px; color: #666; margin-top: 4px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .sum-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
          .sum-card .num { font-size: 22px; font-weight: 900; }
          .sum-card .lbl { font-size: 11px; color: #6b7280; margin-top: 2px; }
          .green { color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; }
          .red   { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
          .yellow{ color: #d97706; border-color: #fde68a; background: #fffbeb; }
          .blue  { color: #2563eb; border-color: #bfdbfe; background: #eff6ff; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #1a1a2e; color: white; padding: 10px 12px; text-align: right; font-size: 13px; }
          td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
          tr:nth-child(even) td { background: #f9fafb; }
          .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb;
                    font-size: 11px; color: #9ca3af; text-align: center; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">ONE</div>
            <div style="font-size:12px;color:#666;margin-top:2px">نظام الإدارة المتكامل</div>
          </div>
          <div class="title-box">
            <h2>📋 جرد المخزون</h2>
            <p>تاريخ الجرد: ${today}</p>
          </div>
        </div>

        <div class="summary">
          <div class="sum-card blue">
            <div class="num">${filtered.length}</div>
            <div class="lbl">إجمالي المنتجات</div>
          </div>
          <div class="sum-card green">
            <div class="num">${matchCount}</div>
            <div class="lbl">✓ تطابق</div>
          </div>
          <div class="sum-card red">
            <div class="num">${deficitCount}</div>
            <div class="lbl">⚠️ عجز</div>
          </div>
          <div class="sum-card yellow">
            <div class="num">${surplusCount}</div>
            <div class="lbl">📈 زيادة</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>المنتج</th>
              <th style="text-align:center">في النظام</th>
              <th style="text-align:center">المتبقي الحقيقي</th>
              <th style="text-align:center">الفرق</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="footer">
          ONE ERP • جرد المخزون بتاريخ ${today} • تم الجرد لـ ${filledCount} من ${filtered.length} منتج
        </div>
        <script>window.onload = () => window.print();<\/script>
      </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ==================== قسم تتبع المنتجات (محدّث) ==================== */}
      <div className="bg-[#1a1a35] border border-violet-700/40 rounded-2xl p-4 space-y-4">
        <h3 className="text-base font-bold text-violet-300 flex items-center gap-2">
          🔍 تتبع الأجهزة
          <span className="text-xs text-gray-500 font-normal">ابحث بالسيريال أو IMEI أو اسم المنتج أو رقم الفاتورة</span>
        </h3>

        {/* ===== حقل بحث موحّد ===== */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            value={unifiedSearch}
            onChange={e => {
              setUnifiedSearch(e.target.value);
              setUnifiedResult(null);
              setShowUnifiedSuggestions(true);
            }}
            onFocus={() => setShowUnifiedSuggestions(true)}
            placeholder="سيريال / IMEI / اسم المنتج / رقم فاتورة..."
            className="input-dark w-full pr-9 font-mono"
          />
          {unifiedSearch.trim() && showUnifiedSuggestions && unifiedSuggestions.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-50 bg-[#1a1a35] border border-violet-700/40 rounded-xl mt-1 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {unifiedSuggestions.map((s, i) => (
                <button key={i} onClick={() => { setUnifiedResult(s); setUnifiedSearch(s.searchLabel); setShowUnifiedSuggestions(false); }}
                  className="w-full text-right px-4 py-2.5 hover:bg-violet-900/30 border-b border-white/5 last:border-0 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    s.type === 'serial' ? 'bg-blue-900/40 text-blue-300' :
                    s.type === 'product' ? 'bg-violet-900/40 text-violet-300' :
                    s.type === 'saleInvoice' ? 'bg-green-900/40 text-green-300' :
                    'bg-orange-900/40 text-orange-300'
                  }`}>{s.typeLabel}</span>
                  <div className="min-w-0">
                    <div className="text-white text-sm font-mono truncate">{s.title}</div>
                    <div className="text-gray-500 text-xs truncate">{s.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {unifiedSearch.trim() && !showUnifiedSuggestions && !unifiedResult && (
            <button onClick={() => setShowUnifiedSuggestions(true)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</button>
          )}
        </div>

        {/* ===== نتيجة: سيريال ===== */}
        {unifiedResult?.type === 'serial' && (() => {
          const serial = unifiedResult.data as SerialItem;
          const { purchase, sale, noonOrder } = getSerialHistory(serial);
          const saleItem = sale?.items.find(i => i.productId === serial.productId || i.serials?.some(s => s.serial === serial.serial));
          const salePrice = saleItem?.unitPrice ?? 0;
          const profit = sale ? salePrice - serial.costPrice
            : noonOrder?.settledAmount ? (noonOrder.settledAmount / Math.max(noonOrder.items.length, 1)) - serial.costPrice
            : null;
          const customer = sale ? customers?.find(c => c.id === sale.customerId) : null;

          const printSerialReport = () => {
            printElement(`
              <div style="font-family:Arial,sans-serif;direction:rtl;padding:20px">
                <h2 style="text-align:center;margin-bottom:4px">ONE — تقرير تتبع الجهاز</h2>
                <p style="text-align:center;color:#666;margin-bottom:20px">تاريخ الطباعة: ${getTodayStr()}</p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <tr style="background:#f3f4f6"><td colspan="2" style="padding:8px;font-weight:bold">بيانات الجهاز</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">المنتج</td><td style="padding:6px;border:1px solid #eee">${serial.productName}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">السيريال</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${serial.serial}</td></tr>
                  ${serial.imei1 ? `<tr><td style="padding:6px;border:1px solid #eee;color:#666">IMEI 1</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${serial.imei1}</td></tr>` : ''}
                  ${serial.imei2 ? `<tr><td style="padding:6px;border:1px solid #eee;color:#666">IMEI 2</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${serial.imei2}</td></tr>` : ''}
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">الحالة</td><td style="padding:6px;border:1px solid #eee">${serial.status === 'available' ? '✅ متاح' : serial.status === 'sold' ? '🛒 مباع' : serial.status === 'transferred' ? '📦 محوّل' : '↩️ مرتجع'}</td></tr>
                </table>
                ${purchase ? `
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <tr style="background:#eff6ff"><td colspan="2" style="padding:8px;font-weight:bold;color:#1d4ed8">📦 بيانات الشراء</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">المورد</td><td style="padding:6px;border:1px solid #eee">${purchase.supplierName}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">رقم الفاتورة</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${purchase.invoiceNumber}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">التاريخ</td><td style="padding:6px;border:1px solid #eee">${purchase.date}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">سعر الشراء</td><td style="padding:6px;border:1px solid #eee;font-weight:bold">${formatCurrency(serial.costPrice)}</td></tr>
                </table>` : ''}
                ${sale ? `
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <tr style="background:#f0fdf4"><td colspan="2" style="padding:8px;font-weight:bold;color:#166534">🛒 بيانات البيع</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">العميل</td><td style="padding:6px;border:1px solid #eee">${sale.customerName}</td></tr>
                  ${customer?.phone ? `<tr><td style="padding:6px;border:1px solid #eee;color:#666">التليفون</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${customer.phone}</td></tr>` : ''}
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">رقم الفاتورة</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${sale.invoiceNumber}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">التاريخ</td><td style="padding:6px;border:1px solid #eee">${sale.date}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">سعر البيع</td><td style="padding:6px;border:1px solid #eee;font-weight:bold">${formatCurrency(salePrice)}</td></tr>
                  ${profit !== null ? `<tr style="background:#f0fdf4"><td style="padding:6px;border:1px solid #eee;color:#666">الربح</td><td style="padding:6px;border:1px solid #eee;font-weight:bold;color:${profit >= 0 ? '#16a34a' : '#dc2626'}">${profit >= 0 ? '+' : ''}${formatCurrency(profit)}</td></tr>` : ''}
                </table>` : ''}
                ${noonOrder ? `
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                  <tr style="background:#fff7ed"><td colspan="2" style="padding:8px;font-weight:bold;color:#c2410c">🛍️ بيانات نون/أمازون</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">المنصة</td><td style="padding:6px;border:1px solid #eee">${noonOrder.platform}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">رقم الأوردر</td><td style="padding:6px;border:1px solid #eee;font-family:monospace">${noonOrder.orderNumber}</td></tr>
                  <tr><td style="padding:6px;border:1px solid #eee;color:#666">التاريخ</td><td style="padding:6px;border:1px solid #eee">${noonOrder.date}</td></tr>
                </table>` : ''}
              </div>
            `);
          };

          return (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold">{serial.productName}</span>
                  <span className="font-mono text-violet-400 text-sm bg-violet-900/30 px-2 py-0.5 rounded">{serial.serial}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    serial.status === 'available' ? 'bg-green-900/40 text-green-400' :
                    serial.status === 'sold' ? 'bg-purple-900/40 text-purple-400' :
                    serial.status === 'transferred' ? 'bg-blue-900/40 text-blue-400' :
                    'bg-gray-900/40 text-gray-400'
                  }`}>
                    {serial.status === 'available' ? '✅ متاح' : serial.status === 'sold' ? '🛒 مباع' :
                     serial.status === 'transferred' ? '📦 محوّل' : '↩️ مرتجع'}
                  </span>
                  {serial.purchasePricePending && (
                    <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full">⏳ سعر معلّق</span>
                  )}
                </div>
                <button onClick={printSerialReport} className="btn-secondary text-xs flex items-center gap-1">
                  <Printer size={13} /> طباعة التقرير
                </button>
              </div>

              {(serial.imei1 || serial.imei2) && (
                <div className="flex gap-4 text-xs text-gray-400 font-mono bg-[#12122a] px-3 py-2 rounded-xl">
                  {serial.imei1 && <span>IMEI1: <span className="text-gray-300">{serial.imei1}</span></span>}
                  {serial.imei2 && <span>IMEI2: <span className="text-gray-300">{serial.imei2}</span></span>}
                </div>
              )}

              {/* Timeline مرئي */}
              <div className="relative pr-6">
                {/* خط عمودي */}
                <div className="absolute right-2.5 top-4 bottom-4 w-0.5 bg-violet-900/50" />

                {/* حدث الشراء */}
                <div className="relative mb-4">
                  <div className="absolute right-0 top-1 w-5 h-5 rounded-full bg-blue-700 border-2 border-[#1a1a35] flex items-center justify-center -translate-x-0.5">
                    <span className="text-[9px]">📦</span>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 mr-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-blue-400 font-bold text-sm">الشراء</div>
                      {purchase && (
                        <button onClick={() => setViewPurchaseInvoice(purchase)}
                          className="text-xs text-blue-300 flex items-center gap-1 bg-blue-900/30 px-2 py-0.5 rounded-lg">
                          <Eye size={11} /> {purchase.invoiceNumber}
                        </button>
                      )}
                    </div>
                    {purchase ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="text-gray-400">المورد</div><div className="text-white">{purchase.supplierName}</div>
                        <div className="text-gray-400">التاريخ</div><div className="text-gray-300">{purchase.date}</div>
                        <div className="text-gray-400">سعر الشراء</div>
                        <div className="text-blue-300 font-bold">
                          {serial.purchasePricePending ? <span className="text-yellow-400">معلّق ⏳</span> : formatCurrency(serial.costPrice)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm flex items-center gap-2">
                        <span className="text-red-400">⚠️</span> لا توجد فاتورة شراء مسجّلة لهذا السيريال
                      </div>
                    )}
                  </div>
                </div>

                {/* حالة المخزون */}
                {serial.status === 'available' && (
                  <div className="relative mb-4">
                    <div className="absolute right-0 top-1 w-5 h-5 rounded-full bg-green-700 border-2 border-[#1a1a35] flex items-center justify-center -translate-x-0.5">
                      <span className="text-[9px]">✅</span>
                    </div>
                    <div className="bg-green-900/10 border border-green-700/20 rounded-xl p-3 mr-6">
                      <div className="text-green-400 text-sm font-medium">متاح في المخزون حالياً</div>
                    </div>
                  </div>
                )}

                {/* حدث البيع (فاتورة مباشرة) */}
                {sale && (
                  <div className="relative mb-4">
                    <div className="absolute right-0 top-1 w-5 h-5 rounded-full bg-green-600 border-2 border-[#1a1a35] flex items-center justify-center -translate-x-0.5">
                      <span className="text-[9px]">🛒</span>
                    </div>
                    <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 mr-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-green-400 font-bold text-sm">البيع — فاتورة مباشرة</div>
                        <button onClick={() => setViewSaleInvoice(sale)}
                          className="text-xs text-green-300 flex items-center gap-1 bg-green-900/30 px-2 py-0.5 rounded-lg">
                          <Eye size={11} /> {sale.invoiceNumber}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="text-gray-400">العميل</div>
                        <div className="text-white font-medium">{sale.customerName}</div>
                        {customer?.phone && (
                          <><div className="text-gray-400">التليفون</div>
                          <div className="text-gray-300 font-mono">{customer.phone}</div></>
                        )}
                        {customer?.address && (
                          <><div className="text-gray-400">العنوان</div>
                          <div className="text-gray-300 text-xs">{customer.address}</div></>
                        )}
                        <div className="text-gray-400">التاريخ</div><div className="text-gray-300">{sale.date}</div>
                        <div className="text-gray-400">سعر البيع</div><div className="text-green-300 font-bold">{formatCurrency(salePrice)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* حدث نون/أمازون */}
                {noonOrder && (
                  <div className="relative mb-4">
                    <div className="absolute right-0 top-1 w-5 h-5 rounded-full bg-orange-600 border-2 border-[#1a1a35] flex items-center justify-center -translate-x-0.5">
                      <span className="text-[9px]">🛍️</span>
                    </div>
                    <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3 mr-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-orange-400 font-bold text-sm capitalize">البيع — {noonOrder.platform}</div>
                        <button onClick={() => setViewNoonOrder(noonOrder)}
                          className="text-xs text-orange-300 flex items-center gap-1 bg-orange-900/30 px-2 py-0.5 rounded-lg">
                          <Eye size={11} /> {noonOrder.orderNumber}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="text-gray-400">التاريخ</div><div className="text-gray-300">{noonOrder.date}</div>
                        {noonOrder.shipmentNumber && (
                          <><div className="text-gray-400">الشحنة</div><div className="font-mono text-orange-300 text-xs">{noonOrder.shipmentNumber}</div></>
                        )}
                        <div className="text-gray-400">الحالة</div>
                        <div className={`text-xs px-2 py-0.5 rounded-full w-fit ${
                          noonOrder.status === 'settled' ? 'bg-green-900/40 text-green-400' :
                          noonOrder.status === 'delivered' ? 'bg-blue-900/40 text-blue-400' :
                          'bg-yellow-900/40 text-yellow-400'
                        }`}>
                          {noonOrder.status === 'settled' ? 'محوّل بنكياً' : noonOrder.status === 'delivered' ? 'مسلّم' : 'قيد التنفيذ'}
                        </div>
                        {noonOrder.settledAmount && (
                          <><div className="text-gray-400">المبلغ المحوّل</div><div className="text-green-300 font-bold">{formatCurrency(noonOrder.settledAmount)}</div></>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* الربح */}
                {profit !== null && !serial.purchasePricePending && (
                  <div className="relative">
                    <div className={`absolute right-0 top-1 w-5 h-5 rounded-full border-2 border-[#1a1a35] flex items-center justify-center -translate-x-0.5 ${profit >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                      <span className="text-[9px]">💰</span>
                    </div>
                    <div className={`border rounded-xl p-3 mr-6 flex items-center justify-between ${profit >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                      <span className="text-gray-400 text-sm">الربح الصافي</span>
                      <span className={`font-black text-xl ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ===== نتيجة: منتج ===== */}
        {unifiedResult?.type === 'product' && (() => {
          const product = unifiedResult.data as Product;
          const { purchases, sales, noon } = getProductHistory(product.id);
          const productSerials = serials.filter(s => s.productId === product.id);
          const availableCount = productSerials.filter(s => s.status === 'available').length;
          const soldCount = productSerials.filter(s => s.status === 'sold').length;
          const transferredCount = productSerials.filter(s => s.status === 'transferred').length;
          const pendingCount = productSerials.filter(s => s.purchasePricePending).length;

          const totalRevenue = sales.reduce((sum, inv) => {
            const item = inv.items.find(i => i.productId === product.id);
            return sum + (item ? item.unitPrice * item.quantity : 0);
          }, 0);
          const totalCost = productSerials.filter(s => s.status !== 'available').reduce((sum, s) => sum + (s.costPrice || 0), 0);

          // كشف الفجوات: سيريالات بدون فاتورة شراء أو بدون فاتورة بيع رغم انها "مباعة"
          const gapSerials = productSerials.filter(s =>
            !s.purchaseInvoiceId || (s.status === 'sold' && !s.saleInvoiceId) || (s.status === 'transferred' && !s.noonOrderId)
          );

          return (
            <div className="space-y-3">
              {/* Header */}
              <div className="bg-[#12122a] border border-violet-900/40 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <div className="font-bold text-white text-base">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.sku} • {product.brand}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-green-900/20 rounded-xl p-2">
                    <div className="text-green-400 font-black text-lg">{availableCount}</div>
                    <div className="text-xs text-gray-500">متاح</div>
                  </div>
                  <div className="bg-purple-900/20 rounded-xl p-2">
                    <div className="text-purple-400 font-black text-lg">{soldCount}</div>
                    <div className="text-xs text-gray-500">مباع</div>
                  </div>
                  <div className="bg-blue-900/20 rounded-xl p-2">
                    <div className="text-blue-400 font-black text-lg">{transferredCount}</div>
                    <div className="text-xs text-gray-500">محوّل</div>
                  </div>
                  <div className="bg-yellow-900/20 rounded-xl p-2">
                    <div className="text-yellow-400 font-black text-lg">{pendingCount}</div>
                    <div className="text-xs text-gray-500">سعر معلّق</div>
                  </div>
                </div>
                {(soldCount + transferredCount) > 0 && (
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                    <span className="text-gray-400 text-sm">إجمالي الربح المحقق</span>
                    <span className={`font-black text-lg ${totalRevenue - totalCost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(totalRevenue - totalCost)}
                    </span>
                  </div>
                )}
              </div>

              {/* كشف الفجوات */}
              {gapSerials.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3">
                  <div className="text-red-400 font-bold text-sm mb-2">⚠️ فجوات مكتشفة ({gapSerials.length})</div>
                  <div className="space-y-1">
                    {gapSerials.map(s => (
                      <div key={s.id} className="text-xs bg-red-900/20 rounded-lg px-3 py-1.5 flex items-center justify-between">
                        <span className="font-mono text-red-300">{s.serial}</span>
                        <span className="text-red-400">
                          {!s.purchaseInvoiceId ? 'بدون فاتورة شراء' :
                           s.status === 'sold' && !s.saleInvoiceId ? 'مباع بدون فاتورة بيع' :
                           s.status === 'transferred' && !s.noonOrderId ? 'محوّل بدون أوردر' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* كل السيريالات */}
              {productSerials.length > 0 && (
                <div className="bg-[#12122a] border border-violet-900/30 rounded-xl p-3">
                  <div className="text-violet-300 font-bold text-sm mb-2">📋 كل السيريالات ({productSerials.length})</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {productSerials.map(s => {
                      const sPurchase = s.purchaseInvoiceId ? purchaseInvoices.find(i => i.id === s.purchaseInvoiceId) : null;
                      const sSale = s.saleInvoiceId ? saleInvoices.find(i => i.id === s.saleInvoiceId) : null;
                      const sNoon = s.noonOrderId ? noonOrders.find(o => o.id === s.noonOrderId) : null;
                      return (
                        <button key={s.id}
                          onClick={() => { setUnifiedResult({ type: 'serial', data: s, title: s.serial, searchLabel: s.serial, subtitle: s.productName, typeLabel: 'سيريال' }); setUnifiedSearch(s.serial); }}
                          className="w-full text-right bg-[#1a1a35] hover:bg-violet-900/20 rounded-lg px-3 py-2 flex items-center gap-3 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            s.status === 'available' ? 'bg-green-400' :
                            s.status === 'sold' ? 'bg-purple-400' :
                            s.status === 'transferred' ? 'bg-blue-400' : 'bg-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-white">{s.serial}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {sPurchase ? `شراء: ${sPurchase.supplierName} ${sPurchase.date}` : '⚠️ بدون شراء'}
                              {sSale ? ` ← بيع: ${sSale.customerName}` : sNoon ? ` ← ${sNoon.platform}: ${sNoon.orderNumber}` : ''}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {s.purchasePricePending ? '⏳' : formatCurrency(s.costPrice)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* حركة فواتير الشراء */}
              {purchases.length > 0 && (
                <div className="bg-[#12122a] border border-blue-900/30 rounded-xl p-3">
                  <div className="text-blue-400 font-bold text-sm mb-2">📦 فواتير الشراء ({purchases.length})</div>
                  <div className="space-y-1.5">
                    {purchases.map(inv => {
                      const item = inv.items.find(i => i.productId === product.id)!;
                      return (
                        <div key={inv.id} className="flex items-center justify-between bg-blue-900/10 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="text-violet-300 font-mono">{inv.invoiceNumber}</span>
                            <span className="text-gray-500 text-xs mr-2">{inv.date}</span>
                            <span className="text-gray-400 text-xs">{inv.supplierName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-300">×{item.quantity} @ {formatCurrency(item.unitPrice)}</span>
                            <button onClick={() => setViewPurchaseInvoice(inv)} className="p-1 rounded text-blue-400 hover:bg-blue-900/30"><Eye size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* حركة فواتير البيع */}
              {sales.length > 0 && (
                <div className="bg-[#12122a] border border-green-900/30 rounded-xl p-3">
                  <div className="text-green-400 font-bold text-sm mb-2">🛒 فواتير البيع ({sales.length})</div>
                  <div className="space-y-1.5">
                    {sales.map(inv => {
                      const item = inv.items.find(i => i.productId === product.id)!;
                      return (
                        <div key={inv.id} className="flex items-center justify-between bg-green-900/10 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="text-violet-300 font-mono">{inv.invoiceNumber}</span>
                            <span className="text-gray-500 text-xs mr-2">{inv.date}</span>
                            <span className="text-gray-400 text-xs">{inv.customerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-green-300">×{item.quantity} @ {formatCurrency(item.unitPrice)}</span>
                            <button onClick={() => setViewSaleInvoice(inv)} className="p-1 rounded text-green-400 hover:bg-green-900/30"><Eye size={13} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* أوردرات نون/أمازون */}
              {noon.length > 0 && (
                <div className="bg-[#12122a] border border-orange-900/30 rounded-xl p-3">
                  <div className="text-orange-400 font-bold text-sm mb-2">🛍️ أوردرات نون/أمازون ({noon.length})</div>
                  <div className="space-y-1.5">
                    {noon.map(order => (
                      <div key={order.id} className="flex items-center justify-between bg-orange-900/10 rounded-lg px-3 py-2 text-sm">
                        <div>
                          <span className="text-orange-300 font-mono">{order.orderNumber}</span>
                          <span className="text-gray-500 text-xs mr-2">{order.date}</span>
                          <span className="capitalize text-gray-400 text-xs">{order.platform}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${order.status === 'settled' ? 'bg-green-900/40 text-green-400' : order.status === 'delivered' ? 'bg-blue-900/40 text-blue-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                            {order.status === 'settled' ? 'محوّل' : order.status === 'delivered' ? 'مسلّم' : 'جاري'}
                          </span>
                          <button onClick={() => setViewNoonOrder(order)} className="p-1 rounded text-orange-400 hover:bg-orange-900/30"><Eye size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ===== نتيجة: فاتورة بيع ===== */}
        {unifiedResult?.type === 'saleInvoice' && (() => {
          const inv = unifiedResult.data as SaleInvoice;
          const customer = customers?.find(c => c.id === inv.customerId);
          return (
            <div className="bg-[#12122a] border border-green-900/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{inv.invoiceNumber}</div>
                  <div className="text-gray-400 text-sm">{inv.customerName} • {inv.date}</div>
                  {customer?.phone && <div className="text-gray-500 text-xs font-mono">{customer.phone}</div>}
                </div>
                <button onClick={() => setViewSaleInvoice(inv)} className="btn-secondary text-xs flex items-center gap-1"><Eye size={13} /> فتح الفاتورة</button>
              </div>
              <div className="space-y-2">
                {inv.items.map(item => {
                  const itemSerials = item.serials?.map(sl => serials.find(s => s.serial === sl.serial)).filter(Boolean) as SerialItem[];
                  return (
                    <div key={item.id} className="bg-[#1a1a35] rounded-lg px-3 py-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white">{item.productName}</span>
                        <span className="text-green-300">{formatCurrency(item.unitPrice)} × {item.quantity}</span>
                      </div>
                      {itemSerials.map(s => s && (
                        <button key={s.id} onClick={() => { setUnifiedResult({ type: 'serial', data: s, title: s.serial, searchLabel: s.serial, subtitle: s.productName, typeLabel: 'سيريال' }); setUnifiedSearch(s.serial); }}
                          className="text-xs font-mono text-violet-400 hover:text-violet-300 hover:underline mr-2">
                          {s.serial}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ===== نتيجة: فاتورة شراء ===== */}
        {unifiedResult?.type === 'purchaseInvoice' && (() => {
          const inv = unifiedResult.data as PurchaseInvoice;
          return (
            <div className="bg-[#12122a] border border-blue-900/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{inv.invoiceNumber}</div>
                  <div className="text-gray-400 text-sm">{inv.supplierName} • {inv.date}</div>
                </div>
                <button onClick={() => setViewPurchaseInvoice(inv)} className="btn-secondary text-xs flex items-center gap-1"><Eye size={13} /> فتح الفاتورة</button>
              </div>
              <div className="space-y-2">
                {inv.items.map(item => {
                  const itemSerials = item.serials?.map(sl => serials.find(s => s.serial === sl.serial)).filter(Boolean) as SerialItem[];
                  return (
                    <div key={item.id} className="bg-[#1a1a35] rounded-lg px-3 py-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white">{item.productName}</span>
                        <span className="text-blue-300">{formatCurrency(item.unitPrice)} × {item.quantity}</span>
                      </div>
                      {itemSerials.map(s => s && (
                        <button key={s.id} onClick={() => { setUnifiedResult({ type: 'serial', data: s, title: s.serial, searchLabel: s.serial, subtitle: s.productName, typeLabel: 'سيريال' }); setUnifiedSearch(s.serial); }}
                          className="text-xs font-mono text-violet-400 hover:text-violet-300 hover:underline mr-2">
                          {s.serial}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ===== لا توجد نتائج ===== */}
        {unifiedSearch.trim() && !showUnifiedSuggestions && !unifiedResult && unifiedSuggestions.length === 0 && (
          <div className="bg-[#12122a] border border-red-900/30 rounded-xl p-4 text-center text-red-400 text-sm">
            ❌ لم يتم العثور على نتيجة لـ: <span className="font-mono">{unifiedSearch}</span>
          </div>
        )}
      </div>

      {/* ==================== جرد المخزون ==================== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">📦 المخزون</h2>
          <p className="text-gray-500 text-sm">{products.length} منتج</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJrard(!showJrard)}
            className={`btn-secondary flex items-center gap-2 text-sm ${
              showJrard ? 'bg-yellow-700/20 border-yellow-700/40 text-yellow-300' : ''
            }`}
          >
            📋 {showJrard ? 'إخفاء الجرد' : 'جرد المخزون'}
          </button>
          <button onClick={printInventory} className="btn-secondary flex items-center gap-2">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* ✅ جرد المخزون */}
      {showJrard && (
        <div className="bg-[#1a1a35] border border-yellow-700/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-bold text-yellow-300">📋 جرد المخزون - مقارنة النظام بالواقع</h3>
            <div className="flex items-center gap-2">
              {onUpdateProduct && (
                <button
                  onClick={() => setConfirmApplyCorrections(true)}
                  disabled={correctableProducts.length === 0}
                  className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={14} /> تطبيق التصحيحات ({correctableProducts.length})
                </button>
              )}
              {/* ✅ استبدلنا window.print() بدالة printJrard الصحيحة */}
              <button onClick={printJrard} className="btn-secondary text-sm flex items-center gap-2">
                <Printer size={14} /> 🖨️ طباعة الجرد
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            ملحوظة: التصحيح التلقائي بيشتغل بس على المنتجات العادية (الإكسسوارات). المنتجات بسيريال (موبايلات/تابلت) لازم تتصحح يدويًا من صفحة المخزون لأن كل قطعة ليها سيريال مستقل.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-white/10">
                  <th className="text-right py-2 px-3">المنتج</th>
                  <th className="text-center py-2 px-3">في النظام</th>
                  <th className="text-center py-2 px-3">المتبقي الحقيقي</th>
                  <th className="text-center py-2 px-3">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const inSystem = getRealStock(p);
                  const actualVal = jrardData[p.id] !== undefined ? parseInt(jrardData[p.id]) : NaN;
                  const diffVal = !isNaN(actualVal) ? actualVal - inSystem : NaN;
                  return (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3">
                        <div className="font-medium text-white">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.sku} • {p.brand}</div>
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-white">{inSystem}</td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          value={jrardData[p.id] || ''}
                          onChange={e => setJrardData(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1 text-center text-white text-sm"
                          placeholder="?"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        {!isNaN(diffVal) ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            diffVal === 0 ? 'bg-green-900/40 text-green-400' :
                            diffVal < 0 ? 'bg-red-900/40 text-red-400' :
                            'bg-yellow-900/40 text-yellow-400'
                          }`}>
                            {diffVal === 0 ? '✓ تطابق' :
                             diffVal < 0 ? `⚠️ عجز ${Math.abs(diffVal)}` :
                             `📈 زيادة ${diffVal}`}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {correctionsToast && (
        <div className="bg-green-900/30 border border-green-700/40 text-green-300 text-sm rounded-xl px-4 py-2">
          {correctionsToast}
        </div>
      )}

      {confirmApplyCorrections && (
        <PasswordConfirmModal
          title="تطبيق تصحيحات الجرد"
          message={`هيتحدث رصيد ${correctableProducts.length} منتج ليطابق العدد اللي كتبته في الجرد. الإجراء ده مش هينعكس تلقائيًا.`}
          confirmLabel="تطبيق التصحيحات"
          onConfirm={applyCorrections}
          onCancel={() => setConfirmApplyCorrections(false)}
        />
      )}

      {/* إجمالي المخزون */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a35] border border-violet-700/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-violet-400">{totalStock}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي القطع المتاحة</div>
        </div>
        <div className="bg-[#1a1a35] border border-blue-700/30 rounded-xl p-4 text-center">
          <div className="text-xl font-black text-blue-400">{formatCurrency(totalValue)}</div>
          <div className="text-xs text-gray-500 mt-1">قيمة المخزون (شراء)</div>
        </div>
        <div className="bg-[#1a1a35] border border-green-700/30 rounded-xl p-4 text-center">
          <div className="text-xl font-black text-green-400">{formatCurrency(totalSaleValue)}</div>
          <div className="text-xs text-gray-500 mt-1">قيمة المخزون (بيع)</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث..." className="input-dark w-full pr-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'phones', 'tablets', 'laptops', 'accessories', 'other'].map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs border transition-colors ${
                filterCat === cat
                  ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                  : 'border-white/10 text-gray-400'
              }`}>
              {cat === 'all' ? 'الكل' : categoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== جدول المخزون ==================== */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/20">
            <tr>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">المنتج</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">المخزون</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">متاح</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">مباع</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium hidden md:table-cell">محول</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر الشراء</th>
              <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر البيع</th>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">لا توجد منتجات</td></tr>
            ) : filtered.map(p => {
              const avail = getAvailableSerials(p.id).length;
              const sold = getSoldCount(p);
              const transferred = getTransferredCount(p);
              const stock = getRealStock(p);
              return (
                <React.Fragment key={p.id}>
                  <tr className="border-t border-white/5 hover:bg-white/5">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.sku} • {p.brand} • {categoryLabel(p.category)}</div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-lg font-black ${
                        stock === 0 ? 'text-red-400' : stock <= 2 ? 'text-yellow-400' : 'text-green-400'
                      }`}>{stock}</span>
                    </td>
                    <td className="py-3 px-3 text-center text-green-400 text-sm hidden md:table-cell">
                      {p.productType === 'serial' ? avail : p.stock}
                    </td>
                    <td className="py-3 px-3 text-center text-purple-400 text-sm hidden md:table-cell">{sold}</td>
                    <td className="py-3 px-3 text-center text-blue-400 text-sm hidden md:table-cell">{transferred}</td>
                    <td className="py-3 px-3 text-center text-gray-300 text-sm">{formatCurrency(p.costPrice)}</td>
                    <td className="py-3 px-3 text-center text-white font-medium text-sm">{formatCurrency(p.salePrice)}</td>
                    <td className="py-3 px-3 text-center">
                      {p.productType === 'serial' && (
                        <button onClick={() => setShowSerials(showSerials === p.id ? null : p.id)}
                          className="text-xs text-violet-400 hover:text-violet-300">
                          {showSerials === p.id ? '▲ إخفاء' : '▼ سيريالات'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {showSerials === p.id && (
                    <tr>
                      <td colSpan={8}>
                        <div className="border-t border-violet-900/30 bg-violet-900/10 p-4">
                          <h4 className="text-sm font-bold text-violet-300 mb-3">سيريالات المنتج المتاحة</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {getAvailableSerials(p.id).map(s => (
                              <div key={s.id} className="bg-[#252545] rounded-xl p-3">
                                <div className="text-sm font-mono text-white">{s.serial}</div>
                                {s.imei1 && <div className="text-xs text-gray-500">IMEI1: {s.imei1}</div>}
                                {s.imei2 && <div className="text-xs text-gray-500">IMEI2: {s.imei2}</div>}
                                <div className="text-xs text-green-400 mt-1">✅ متاح</div>
                              </div>
                            ))}
                            {getAvailableSerials(p.id).length === 0 && (
                              <div className="text-gray-500 text-sm col-span-3">لا توجد سيريالات متاحة</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ==================== Modal: عرض فاتورة مبيعات ==================== */}
      {viewSaleInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">🛒 {viewSaleInvoice.invoiceNumber}</h2>
              <button onClick={() => setViewSaleInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><span className="text-gray-500">العميل: </span><span className="text-white">{viewSaleInvoice.customerName}</span></div>
              <div><span className="text-gray-500">التاريخ: </span><span className="text-white">{viewSaleInvoice.date}</span></div>
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
                {viewSaleInvoice.items.map(item => (
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
            <div className="border-t border-white/10 pt-3 space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-white">الإجمالي</span>
                <span className="text-green-400 text-lg">{formatCurrency(viewSaleInvoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">المدفوع</span>
                <span className="text-green-400">{formatCurrency(viewSaleInvoice.paid)}</span>
              </div>
              {viewSaleInvoice.remaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">المتبقي</span>
                  <span className="text-red-400">{formatCurrency(viewSaleInvoice.remaining)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== Modal: عرض فاتورة مشتريات ==================== */}
      {viewPurchaseInvoice && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-blue-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📦 {viewPurchaseInvoice.invoiceNumber}</h2>
              <button onClick={() => setViewPurchaseInvoice(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><span className="text-gray-500">المورد: </span><span className="text-white">{viewPurchaseInvoice.supplierName}</span></div>
              <div><span className="text-gray-500">التاريخ: </span><span className="text-white">{viewPurchaseInvoice.date}</span></div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead className="bg-blue-900/20">
                <tr>
                  <th className="text-right py-2 px-3 text-gray-400">المنتج</th>
                  <th className="text-center py-2 px-3 text-gray-400">الكمية</th>
                  <th className="text-center py-2 px-3 text-gray-400">السعر</th>
                  <th className="text-center py-2 px-3 text-gray-400">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {viewPurchaseInvoice.items.map(item => (
                  <React.Fragment key={item.id}>
                    <tr className="border-t border-white/5">
                      <td className="py-2 px-3 text-white">{item.productName}</td>
                      <td className="py-2 px-3 text-center text-gray-300">{item.quantity}</td>
                      <td className="py-2 px-3 text-center text-gray-300">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-2 px-3 text-center font-bold text-white">{formatCurrency(item.total)}</td>
                    </tr>
                    {item.serials?.map((s, i) => (
                      <tr key={i} className="bg-blue-900/10">
                        <td colSpan={4} className="py-1 px-6 text-xs text-gray-500 font-mono">
                          🔢 {s.serial}{s.imei1 ? ` | IMEI1: ${s.imei1}` : ''}{s.imei2 ? ` | IMEI2: ${s.imei2}` : ''}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="border-t border-white/10 pt-3 space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-white">الإجمالي</span>
                <span className="text-blue-400 text-lg">{formatCurrency(viewPurchaseInvoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">المدفوع</span>
                <span className="text-green-400">{formatCurrency(viewPurchaseInvoice.paid)}</span>
              </div>
              {viewPurchaseInvoice.remaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">المتبقي</span>
                  <span className="text-red-400">{formatCurrency(viewPurchaseInvoice.remaining)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== Modal: عرض أوردر نون ==================== */}
      {viewNoonOrder && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1a1a35] border border-orange-900/40 rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">🛍️ {viewNoonOrder.orderNumber}</h2>
              <button onClick={() => setViewNoonOrder(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><span className="text-gray-500">المنصة: </span><span className="text-white capitalize">{viewNoonOrder.platform}</span></div>
              <div><span className="text-gray-500">التاريخ: </span><span className="text-white">{viewNoonOrder.date}</span></div>
              {viewNoonOrder.customerName && (
                <div><span className="text-gray-500">العميل: </span><span className="text-white">{viewNoonOrder.customerName}</span></div>
              )}
              {viewNoonOrder.shipmentNumber && (
                <div><span className="text-gray-500">رقم الشحنة: </span><span className="text-white font-mono">{viewNoonOrder.shipmentNumber}</span></div>
              )}
            </div>
            <div className="space-y-2 mb-4">
              {viewNoonOrder.items.map((item, i) => (
                <div key={i} className="bg-[#252545] rounded-xl p-3">
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
            <div className="border-t border-white/10 pt-3">
              <div className="flex justify-between font-bold">
                <span className="text-white">إجمالي السعر</span>
                <span className="text-orange-400">{formatCurrency(viewNoonOrder.items.reduce((s, i) => s + i.price, 0))}</span>
              </div>
              {viewNoonOrder.settledAmount && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-400">المبلغ المحول</span>
                  <span className="text-blue-400">{formatCurrency(viewNoonOrder.settledAmount)}</span>
                </div>
              )}
              {viewNoonOrder.settlementProfit != null && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-400">الربح</span>
                  <span className={viewNoonOrder.settlementProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatCurrency(viewNoonOrder.settlementProfit)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}