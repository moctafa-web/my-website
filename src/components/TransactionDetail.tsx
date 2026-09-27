import React from 'react';
import { SaleInvoice, Payment, StatementRow } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';
import { X, ArrowRight, ArrowLeft, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  row: StatementRow | null;
  onClose: () => void;
}

export default function TransactionDetail({ isOpen, row, onClose }: Props) {
  if (!isOpen || !row) return null;

  const getPaymentMethodLabel = (method: string): string => {
    const labels: Record<string, string> = {
      cash: 'كاش',
      bank: 'تحويل بنكي',
      card: 'بطاقة ائتمان',
      transfer: 'تحويل',
      check: 'شيك',
      instapay: 'إنستابي',
      credit: 'ائتمان',
    };
    return labels[method] || method;
  };

  const renderContent = () => {
    if (row.type === 'invoice') {
      const inv = row.ref as SaleInvoice;
      return (
        <div className="space-y-6">
          {/* Invoice Header */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-400 uppercase">رقم الفاتورة</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{inv.invoiceNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase">التاريخ</p>
                <p className="text-lg font-bold text-gray-200 mt-1">{inv.date}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">الحالة</p>
                <p className={`text-lg font-bold mt-1 ${
                  inv.status === 'paid' ? 'text-green-400' :
                  inv.status === 'partial' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>{inv.status === 'paid' ? 'مدفوع' : inv.status === 'partial' ? 'مدفوع جزئي' : 'غير مدفوع'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase">تاريخ الاستحقاق</p>
                <p className="text-lg font-bold text-gray-200 mt-1">{inv.dueDate || '-'}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h4 className="text-lg font-bold text-white mb-3">المنتجات</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-200 bg-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="text-right p-3">المنتج</th>
                    <th className="text-center p-3">الكمية</th>
                    <th className="text-center p-3">السعر</th>
                    <th className="text-center p-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                      <td className="p-3 text-right">
                        <p className="font-semibold">{item.productName}</p>
                        <p className="text-xs text-gray-500">{item.sku}</p>
                      </td>
                      <td className="p-3 text-center">{item.quantity}</td>
                      <td className="p-3 text-center">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-3 text-center font-bold">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded p-4 border border-slate-700">
              <p className="text-xs text-gray-400">الإجمالي الفرعي</p>
              <p className="text-xl font-bold text-gray-200 mt-2">{formatCurrency(inv.subtotal)}</p>
            </div>
            <div className="bg-slate-800 rounded p-4 border border-slate-700">
              <p className="text-xs text-gray-400">الضرائب</p>
              <p className="text-xl font-bold text-gray-200 mt-2">{formatCurrency(inv.taxTotal)}</p>
            </div>
            <div className="bg-slate-800 rounded p-4 border border-slate-700">
              <p className="text-xs text-gray-400">الخصم</p>
              <p className="text-xl font-bold text-gray-200 mt-2">{formatCurrency(inv.discount)}</p>
            </div>
            <div className="bg-blue-900/30 rounded p-4 border border-blue-700/50">
              <p className="text-xs text-blue-300">الإجمالي</p>
              <p className="text-2xl font-bold text-blue-300 mt-2">{formatCurrency(inv.total)}</p>
            </div>
            <div className="bg-green-900/30 rounded p-4 border border-green-700/50">
              <p className="text-xs text-green-300">المدفوع</p>
              <p className="text-2xl font-bold text-green-300 mt-2">{formatCurrency(inv.paid)}</p>
            </div>
            <div className="bg-red-900/30 rounded p-4 border border-red-700/50">
              <p className="text-xs text-red-300">المتبقي</p>
              <p className="text-2xl font-bold text-red-300 mt-2">{formatCurrency(inv.remaining)}</p>
            </div>
          </div>

          {/* Notes */}
          {inv.notes && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-gray-400 uppercase">الملاحظات</p>
              <p className="text-gray-200 mt-2">{inv.notes}</p>
            </div>
          )}
        </div>
      );
    }

    if (row.type === 'payment') {
      const pmt = row.ref as Payment;
      return (
        <div className="space-y-6">
          {/* Payment Header */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-400 uppercase">طريقة الدفع</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{getPaymentMethodLabel(pmt.paymentMethod)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase">التاريخ</p>
                <p className="text-lg font-bold text-gray-200 mt-1">{pmt.date}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">المبلغ</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(pmt.amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase">النوع</p>
                <p className="text-lg font-bold text-gray-200 mt-1">{pmt.type}</p>
              </div>
            </div>
          </div>

          {/* Payment Details by Method */}
          {pmt.paymentMethod === 'card' && pmt.cardDetails && (
            <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-700/50">
              <h4 className="text-lg font-bold text-blue-300 mb-3">تفاصيل البطاقة</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">آخر 4 أرقام</p>
                  <p className="text-lg font-bold text-blue-300 mt-1">****{pmt.cardDetails.last4}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">البنك</p>
                  <p className="text-lg font-bold text-blue-300 mt-1">{pmt.cardDetails.bank}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">تاريخ الانتهاء</p>
                  <p className="text-lg font-bold text-blue-300 mt-1">{pmt.cardDetails.expiry}</p>
                </div>
              </div>
            </div>
          )}

          {pmt.paymentMethod === 'transfer' && pmt.transferDetails && (
            <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/50">
              <h4 className="text-lg font-bold text-purple-300 mb-3">تفاصيل التحويل</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400">البنك</p>
                  <p className="text-lg font-bold text-purple-300 mt-1">{pmt.transferDetails.bankName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">رقم المرجع</p>
                  <p className="text-lg font-bold text-purple-300 mt-1">{pmt.transferDetails.referenceNo}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">اسم الحساب</p>
                  <p className="text-lg font-bold text-purple-300 mt-1">{pmt.transferDetails.accountName}</p>
                </div>
              </div>
            </div>
          )}

          {pmt.paymentMethod === 'check' && pmt.checkDetails && (
            <div className="bg-orange-900/20 rounded-lg p-4 border border-orange-700/50">
              <h4 className="text-lg font-bold text-orange-300 mb-3">تفاصيل الشيك</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400">رقم الشيك</p>
                  <p className="text-lg font-bold text-orange-300 mt-1">{pmt.checkDetails.checkNo}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">البنك</p>
                  <p className="text-lg font-bold text-orange-300 mt-1">{pmt.checkDetails.bank}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">تاريخ الاستحقاق</p>
                  <p className="text-lg font-bold text-orange-300 mt-1">{pmt.checkDetails.dueDate}</p>
                </div>
              </div>
            </div>
          )}

          {/* Related Invoices */}
          {pmt.relatedInvoiceIds && pmt.relatedInvoiceIds.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h4 className="text-lg font-bold text-white mb-3">الفواتير المرتبطة</h4>
              <div className="space-y-2">
                {pmt.relatedInvoiceIds.map((invId, idx) => (
                  <div key={idx} className="p-2 bg-slate-700 rounded text-gray-200 flex items-center gap-2">
                    <ArrowRight size={16} className="text-blue-400" />
                    <span>{invId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {pmt.notes && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-xs text-gray-400 uppercase">الملاحظات</p>
              <p className="text-gray-200 mt-2">{pmt.notes}</p>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-950 rounded-lg shadow-2xl max-w-3xl w-full max-h-screen overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            {row.type === 'invoice' ? '📄 تفاصيل الفاتورة' : '💳 تفاصيل الدفعة'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
