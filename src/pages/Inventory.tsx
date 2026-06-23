import React, { useState } from 'react';
import { Product, SerialItem, SaleInvoice, PurchaseInvoice, NoonOrder } from '../types';
import { formatCurrency, categoryLabel, printElement, getTodayStr } from '../utils/helpers';
import { Search, Printer, Package, Hash, Eye } from 'lucide-react';

interface Props {
  products: Product[];
  serials: SerialItem[];
  saleInvoices?: SaleInvoice[];
  purchaseInvoices?: PurchaseInvoice[];
  noonOrders?: NoonOrder[];
}

export default function Inventory({ products, serials, saleInvoices = [], purchaseInvoices = [], noonOrders = [] }: Props) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showSerials, setShowSerials] = useState<string | null>(null);

  // ==================== جرد المخزون ====================
  const [showJrard, setShowJrard] = useState(false);
  const [jrardData, setJrardData] = useState<Record<string, string>>({});

  // ==================== تتبع المنتجات ====================
  const [trackTab, setTrackTab] = useState<'serial' | 'product'>('serial');
  const [serialSearch, setSerialSearch] = useState('');
  const [productTrackId, setProductTrackId] = useState('');
  const [productTrackSearch, setProductTrackSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  const [viewSaleInvoice, setViewSaleInvoice] = useState<SaleInvoice | null>(null);
  const [viewPurchaseInvoice, setViewPurchaseInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewNoonOrder, setViewNoonOrder] = useState<NoonOrder | null>(null);

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
    : serialSuggestions.length === 1
    ? serialSuggestions[0]
    : null;

  const getSerialHistory = (serial: SerialItem) => {
    const purchase = serial.purchaseInvoiceId
      ? purchaseInvoices.find(i => i.id === serial.purchaseInvoiceId)
      : null;
    const sale = serial.saleInvoiceId
      ? saleInvoices.find(i => i.id === serial.saleInvoiceId)
      : null;
    const noonOrder = serial.noonOrderId
      ? noonOrders.find(o => o.id === serial.noonOrderId)
      : null;
    return { purchase, sale, noonOrder };
  };

  const productSuggestions = productTrackSearch.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(productTrackSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productTrackSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const selectedProduct = productTrackId ? products.find(p => p.id === productTrackId) : null;

  const getProductHistory = (productId: string) => {
    const purchases = purchaseInvoices.filter(inv =>
      inv.items.some(item => item.productId === productId)
    );
    const sales = saleInvoices.filter(inv =>
      inv.items.some(item => item.productId === productId)
    );
    const noon = noonOrders.filter(o =>
      o.items.some(item => item.productId === productId) && o.status !== 'canceled'
    );
    return { purchases, sales, noon };
  };

  // ==================== المخزون ====================
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
    if (p.productType === 'serial') {
      return getAvailableSerials(p.id).length;
    }
    return p.stock;
  };

  // ✅ حساب المباع للمنتجات العادية من فواتير البيع
  const getSoldCount = (p: Product) => {
    if (p.productType === 'serial') {
      return getSoldSerials(p.id).length;
    }
    // المنتجات العادية: نحسب من فواتير البيع
    return saleInvoices.reduce((sum, inv) => {
      return sum + inv.items
        .filter(item => item.productId === p.id)
        .reduce((s, item) => s + item.quantity, 0);
    }, 0);
  };

  // ✅ حساب المحول للمنتجات العادية من أوردرات نون
  const getTransferredCount = (p: Product) => {
    if (p.productType === 'serial') {
      return getTransferredSerials(p.id).length;
    }
    // المنتجات العادية: نحسب من أوردرات نون
    return noonOrders
      .filter(o => o.status !== 'canceled')
      .reduce((sum, o) => {
        return sum + o.items.filter(item => item.productId === p.id).length;
      }, 0);
  };

  const totalValue = products.reduce((s, p) => s + p.costPrice * getRealStock(p), 0);
  const totalSaleValue = products.reduce((s, p) => s + p.salePrice * getRealStock(p), 0);
  const totalStock = products.reduce((s, p) => s + getRealStock(p), 0);

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

  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ==================== قسم تتبع المنتجات ==================== */}
      <div className="bg-[#1a1a35] border border-violet-700/40 rounded-2xl p-4 space-y-4">
        <h3 className="text-base font-bold text-violet-300 flex items-center gap-2">
          🔍 تتبع المنتجات
        </h3>

        <div className="flex gap-2">
          <button
            onClick={() => setTrackTab('serial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${
              trackTab === 'serial'
                ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                : 'border-white/10 text-gray-400 hover:border-white/20'
            }`}
          >
            <Hash size={14} /> بحث بالسيريال
          </button>
          <button
            onClick={() => setTrackTab('product')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${
              trackTab === 'product'
                ? 'bg-violet-700/40 border-violet-500/50 text-violet-300'
                : 'border-white/10 text-gray-400 hover:border-white/20'
            }`}
          >
            <Package size={14} /> بحث بالمنتج
          </button>
        </div>

        {/* ===== بحث بالسيريال ===== */}
        {trackTab === 'serial' && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={serialSearch}
                onChange={e => {
                  setSerialSearch(e.target.value);
                  setSelectedSerialId(null);
                  setShowSerialSuggestions(true);
                }}
                onFocus={() => setShowSerialSuggestions(true)}
                placeholder="اكتب جزء من السيريال أو IMEI..."
                className="input-dark w-full font-mono"
              />
              {showSerialSuggestions && serialSearch.trim() && serialSuggestions.length > 1 && (
                <div className="absolute top-full right-0 left-0 z-50 bg-[#1a1a35] border border-violet-700/40 rounded-xl mt-1 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {serialSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSerialId(s.id);
                        setSerialSearch(s.serial);
                        setShowSerialSuggestions(false);
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-violet-900/30 border-b border-white/5 last:border-0"
                    >
                      <div className="font-mono text-violet-300 text-sm">{s.serial}</div>
                      <div className="text-xs text-gray-500">{s.productName} •
                        <span className={`mr-1 ${
                          s.status === 'available' ? 'text-green-400' :
                          s.status === 'sold' ? 'text-purple-400' :
                          'text-blue-400'
                        }`}>
                          {s.status === 'available' ? 'متاح' : s.status === 'sold' ? 'مباع' : 'محول'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {serialSearch.trim() && (
              <div>
                {trackedSerial ? (() => {
                  const { purchase, sale, noonOrder } = getSerialHistory(trackedSerial);
                  const profit = sale
                    ? (sale.items.find(i => i.productId === trackedSerial.productId)?.unitPrice ?? 0) - trackedSerial.costPrice
                    : noonOrder?.settledAmount
                    ? noonOrder.settledAmount / noonOrder.items.length - trackedSerial.costPrice
                    : null;

                  return (
                    <div className="bg-[#12122a] border border-violet-900/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/10 flex-wrap">
                        <span className="text-white font-bold">{trackedSerial.productName}</span>
                        <span className="font-mono text-violet-400 text-sm bg-violet-900/30 px-2 py-0.5 rounded">
                          {trackedSerial.serial}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${
                          trackedSerial.status === 'available' ? 'bg-green-900/40 text-green-400' :
                          trackedSerial.status === 'sold' ? 'bg-purple-900/40 text-purple-400' :
                          trackedSerial.status === 'transferred' ? 'bg-blue-900/40 text-blue-400' :
                          'bg-gray-900/40 text-gray-400'
                        }`}>
                          {trackedSerial.status === 'available' ? '✅ متاح' :
                           trackedSerial.status === 'sold' ? '🛒 مباع' :
                           trackedSerial.status === 'transferred' ? '📦 محول' : '↩️ مرتجع'}
                        </span>
                      </div>

                      {(trackedSerial.imei1 || trackedSerial.imei2) && (
                        <div className="flex gap-4 text-xs text-gray-400 font-mono">
                          {trackedSerial.imei1 && <span>IMEI1: {trackedSerial.imei1}</span>}
                          {trackedSerial.imei2 && <span>IMEI2: {trackedSerial.imei2}</span>}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-blue-400 font-bold text-sm">📦 الشراء</div>
                            {purchase && (
                              <button
                                onClick={() => setViewPurchaseInvoice(purchase)}
                                className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1 bg-blue-900/30 px-2 py-0.5 rounded-lg">
                                <Eye size={11} /> فتح الفاتورة
                              </button>
                            )}
                          </div>
                          {purchase ? (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">المورد</span>
                                <span className="text-white">{purchase.supplierName}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">الفاتورة</span>
                                <span className="text-violet-300 font-mono">{purchase.invoiceNumber}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">التاريخ</span>
                                <span className="text-gray-300">{purchase.date}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">سعر الشراء</span>
                                <span className="text-blue-300 font-bold">{formatCurrency(trackedSerial.costPrice)}</span>
                              </div>
                            </>
                          ) : (
                            <div className="text-gray-500 text-sm">لا توجد بيانات شراء</div>
                          )}
                        </div>

                        <div className={`border rounded-xl p-3 space-y-1.5 ${
                          noonOrder ? 'bg-orange-900/20 border-orange-700/30' : 'bg-green-900/20 border-green-700/30'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className={`font-bold text-sm ${noonOrder ? 'text-orange-400' : 'text-green-400'}`}>
                              {noonOrder ? '🛍️ نون / أمازون' : '🛒 البيع'}
                            </div>
                            {sale && (
                              <button
                                onClick={() => setViewSaleInvoice(sale)}
                                className="text-xs text-green-300 hover:text-green-200 flex items-center gap-1 bg-green-900/30 px-2 py-0.5 rounded-lg">
                                <Eye size={11} /> فتح الفاتورة
                              </button>
                            )}
                            {noonOrder && (
                              <button
                                onClick={() => setViewNoonOrder(noonOrder)}
                                className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1 bg-orange-900/30 px-2 py-0.5 rounded-lg">
                                <Eye size={11} /> فتح الأوردر
                              </button>
                            )}
                          </div>

                          {sale && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">العميل</span>
                                <span className="text-white">{sale.customerName}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">الفاتورة</span>
                                <span className="text-violet-300 font-mono">{sale.invoiceNumber}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">التاريخ</span>
                                <span className="text-gray-300">{sale.date}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">سعر البيع</span>
                                <span className="text-green-300 font-bold">
                                  {formatCurrency(sale.items.find(i => i.productId === trackedSerial.productId)?.unitPrice ?? 0)}
                                </span>
                              </div>
                            </>
                          )}

                          {noonOrder && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">المنصة</span>
                                <span className="text-white capitalize">{noonOrder.platform}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">رقم الأوردر</span>
                                <span className="text-orange-300 font-mono text-xs">{noonOrder.orderNumber}</span>
                              </div>
                              {noonOrder.shipmentNumber && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-400">رقم الشحنة</span>
                                  <span className="text-orange-300 font-mono text-xs">{noonOrder.shipmentNumber}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">التاريخ</span>
                                <span className="text-gray-300">{noonOrder.date}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-400">الحالة</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  noonOrder.status === 'settled' ? 'bg-green-900/40 text-green-400' :
                                  noonOrder.status === 'delivered' ? 'bg-blue-900/40 text-blue-400' :
                                  'bg-yellow-900/40 text-yellow-400'
                                }`}>
                                  {noonOrder.status === 'settled' ? 'محول بنكياً' :
                                   noonOrder.status === 'delivered' ? 'مسلّم' :
                                   noonOrder.status === 'shipped' ? 'شحن' : 'قيد الانتظار'}
                                </span>
                              </div>
                              {noonOrder.settledAmount && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-400">المبلغ المحول</span>
                                  <span className="text-green-300 font-bold">{formatCurrency(noonOrder.settledAmount)}</span>
                                </div>
                              )}
                            </>
                          )}

                          {!sale && !noonOrder && (
                            <div className="text-gray-500 text-sm">لم يُباع بعد</div>
                          )}
                        </div>
                      </div>

                      {profit !== null && profit !== undefined && (
                        <div className={`flex items-center justify-between p-3 rounded-xl border ${
                          profit >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'
                        }`}>
                          <span className="text-gray-400 text-sm">💰 الربح</span>
                          <span className={`font-black text-lg ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  serialSuggestions.length > 1 ? (
                    <div className="bg-[#12122a] border border-violet-900/30 rounded-xl p-3 text-center text-violet-400 text-sm">
                      وجدنا {serialSuggestions.length} نتيجة - اختر من القائمة أعلاه
                    </div>
                  ) : (
                    <div className="bg-[#12122a] border border-red-900/30 rounded-xl p-4 text-center text-red-400 text-sm">
                      ❌ لم يتم العثور على سيريال يحتوي على: <span className="font-mono">{serialSearch}</span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== بحث بالمنتج ===== */}
        {trackTab === 'product' && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={productTrackSearch}
                onChange={e => {
                  setProductTrackSearch(e.target.value);
                  setProductTrackId('');
                  setShowProductSuggestions(true);
                }}
                onFocus={() => setShowProductSuggestions(true)}
                placeholder="اكتب اسم المنتج أو SKU..."
                className="input-dark w-full"
              />
              {showProductSuggestions && productSuggestions.length > 0 && (
                <div className="absolute top-full right-0 left-0 z-50 bg-[#1a1a35] border border-violet-700/40 rounded-xl mt-1 shadow-xl overflow-hidden">
                  {productSuggestions.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProductTrackId(p.id);
                        setProductTrackSearch(p.name);
                        setShowProductSuggestions(false);
                      }}
                      className="w-full text-right px-4 py-2.5 hover:bg-violet-900/30 text-sm border-b border-white/5 last:border-0"
                    >
                      <span className="text-white">{p.name}</span>
                      <span className="text-gray-500 text-xs mr-2">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct && (() => {
              const { purchases, sales, noon } = getProductHistory(selectedProduct.id);
              const totalPurchased = purchases.reduce((sum, inv) =>
                sum + inv.items.filter(i => i.productId === selectedProduct.id).reduce((s, i) => s + i.quantity, 0), 0);
              const totalSold = sales.reduce((sum, inv) =>
                sum + inv.items.filter(i => i.productId === selectedProduct.id).reduce((s, i) => s + i.quantity, 0), 0);
              const totalNoon = noon.reduce((sum, o) =>
                sum + o.items.filter(i => i.productId === selectedProduct.id).length, 0);

              return (
                <div className="space-y-3">
                  <div className="bg-[#12122a] border border-violet-900/40 rounded-xl p-4">
                    <div className="font-bold text-white mb-3">{selectedProduct.name}</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center bg-blue-900/20 rounded-xl p-2">
                        <div className="text-blue-400 font-black text-xl">{totalPurchased}</div>
                        <div className="text-xs text-gray-500">إجمالي الشراء</div>
                      </div>
                      <div className="text-center bg-green-900/20 rounded-xl p-2">
                        <div className="text-green-400 font-black text-xl">{totalSold + totalNoon}</div>
                        <div className="text-xs text-gray-500">إجمالي المبيعات</div>
                      </div>
                      <div className="text-center bg-violet-900/20 rounded-xl p-2">
                        <div className="text-violet-400 font-black text-xl">{getRealStock(selectedProduct)}</div>
                        <div className="text-xs text-gray-500">المخزون الحالي</div>
                      </div>
                    </div>
                  </div>

                  {purchases.length > 0 && (
                    <div className="bg-[#12122a] border border-blue-900/30 rounded-xl p-3">
                      <div className="text-blue-400 font-bold text-sm mb-2">📦 فواتير الشراء ({purchases.length})</div>
                      <div className="space-y-2">
                        {purchases.map(inv => {
                          const item = inv.items.find(i => i.productId === selectedProduct.id)!;
                          return (
                            <div key={inv.id} className="bg-blue-900/10 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-violet-300 font-mono text-sm">{inv.invoiceNumber}</span>
                                  <span className="text-gray-500 text-xs mr-2">{inv.date}</span>
                                  <span className="text-gray-400 text-xs mr-2">{inv.supplierName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-300 text-sm">×{item.quantity} @ {formatCurrency(item.unitPrice)}</span>
                                  <button onClick={() => setViewPurchaseInvoice(inv)}
                                    className="p-1 rounded-lg text-blue-400 hover:bg-blue-900/30">
                                    <Eye size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sales.length > 0 && (
                    <div className="bg-[#12122a] border border-green-900/30 rounded-xl p-3">
                      <div className="text-green-400 font-bold text-sm mb-2">🛒 فواتير البيع ({sales.length})</div>
                      <div className="space-y-2">
                        {sales.map(inv => {
                          const item = inv.items.find(i => i.productId === selectedProduct.id)!;
                          return (
                            <div key={inv.id} className="bg-green-900/10 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-violet-300 font-mono text-sm">{inv.invoiceNumber}</span>
                                  <span className="text-gray-500 text-xs mr-2">{inv.date}</span>
                                  <span className="text-gray-400 text-xs mr-2">{inv.customerName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-green-300 text-sm">×{item.quantity} @ {formatCurrency(item.unitPrice)}</span>
                                  <button onClick={() => setViewSaleInvoice(inv)}
                                    className="p-1 rounded-lg text-green-400 hover:bg-green-900/30">
                                    <Eye size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {noon.length > 0 && (
                    <div className="bg-[#12122a] border border-orange-900/30 rounded-xl p-3">
                      <div className="text-orange-400 font-bold text-sm mb-2">🛍️ أوردرات نون/أمازون ({noon.length})</div>
                      <div className="space-y-2">
                        {noon.map(order => (
                          <div key={order.id} className="bg-orange-900/10 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-orange-300 font-mono text-sm">{order.orderNumber}</span>
                                <span className="text-gray-500 text-xs mr-2">{order.date}</span>
                                <span className="capitalize text-gray-400 text-xs mr-2">{order.platform}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  order.status === 'settled' ? 'bg-green-900/40 text-green-400' :
                                  order.status === 'delivered' ? 'bg-blue-900/40 text-blue-400' :
                                  'bg-yellow-900/40 text-yellow-400'
                                }`}>
                                  {order.status === 'settled' ? 'محول' :
                                   order.status === 'delivered' ? 'مسلّم' : 'قيد التنفيذ'}
                                </span>
                                <button onClick={() => setViewNoonOrder(order)}
                                  className="p-1 rounded-lg text-orange-400 hover:bg-orange-900/30">
                                  <Eye size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {purchases.length === 0 && sales.length === 0 && noon.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-4">لا توجد حركات لهذا المنتج</div>
                  )}
                </div>
              );
            })()}
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
            className={`btn-secondary flex items-center gap-2 text-sm ${showJrard ? 'bg-yellow-700/20 border-yellow-700/40 text-yellow-300' : ''}`}
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-yellow-300">📋 جرد المخزون - مقارنة النظام بالواقع</h3>
            <button onClick={() => window.print()} className="btn-secondary text-sm">🖨️ طباعة الجرد</button>
          </div>
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
                  const actual = jrardData[p.id] !== undefined ? parseInt(jrardData[p.id]) : NaN;
                  const diff = !isNaN(actual) ? actual - inSystem : NaN;
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
                        {!isNaN(diff) ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            diff === 0 ? 'bg-green-900/40 text-green-400' :
                            diff < 0 ? 'bg-red-900/40 text-red-400' :
                            'bg-yellow-900/40 text-yellow-400'
                          }`}>
                            {diff === 0 ? '✓ تطابق' : diff < 0 ? `⚠️ عجز ${Math.abs(diff)}` : `📈 زيادة ${diff}`}
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
                filterCat === cat ? 'bg-violet-700/40 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400'
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
              const sold = getSoldCount(p);       // ✅ يشمل المنتجات العادية
              const transferred = getTransferredCount(p); // ✅ يشمل المنتجات العادية
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
                      {/* ✅ متاح: للمنتجات بسيريالات نعرض عدد السيريالات، للعادية نعرض stock */}
                      {p.productType === 'serial' ? avail : p.stock}
                    </td>
                    <td className="py-3 px-3 text-center text-purple-400 text-sm hidden md:table-cell">
                      {/* ✅ مباع: دايماً بيظهر رقم */}
                      {sold}
                    </td>
                    <td className="py-3 px-3 text-center text-blue-400 text-sm hidden md:table-cell">
                      {/* ✅ محول: دايماً بيظهر رقم */}
                      {transferred}
                    </td>
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