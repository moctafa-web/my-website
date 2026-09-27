import React, { useState } from 'react';
import { Customer, SaleInvoice, Payment, StatementRow, AccountStatement } from '../types';
import { formatCurrency, getTodayStr, printElement } from '../utils/helpers';
import { X, Printer, Download, Send, Clock, Eye } from 'lucide-react';

interface Props {
  isOpen: boolean;
  customer: Customer | null;
  statement: AccountStatement | null;
  onClose: () => void;
  onPrint: (customer: Customer, statement: AccountStatement) => void;
  onExportPDF: (customer: Customer, statement: AccountStatement) => void;
  onSendEmail?: (customer: Customer, statement: AccountStatement) => void;
  onShowTransactionDetail?: (row: StatementRow) => void;
}

export default function StatementModal({
  isOpen,
  customer,
  statement,
  onClose,
  onPrint,
  onExportPDF,
  onSendEmail,
  onShowTransactionDetail,
}: Props) {
  const [showScheduler, setShowScheduler] = useState(false);

  if (!isOpen || !customer || !statement) return null;

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      paid: { text: 'مدفوع', color: 'bg-green-900/30 text-green-300' },
      partial: { text: 'مدفوع جزئي', color: 'bg-yellow-900/30 text-yellow-300' },
      unpaid: { text: 'غير مدفوع', color: 'bg-red-900/30 text-red-300' },
    };
    return statusMap[status] || { text: status, color: 'bg-gray-900/30 text-gray-300' };
  };

  const getPaymentMethodIcon = (method: string) => {
    const icons: Record<string, string> = {
      cash: '💵',
      bank: '🏦',
      card: '💳',
      transfer: '📤',
      check: '📋',
      instapay: '📱',
      credit: '💰',
    };
    return icons[method] || '💰';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-950 rounded-lg shadow-2xl max-w-5xl w-full max-h-screen overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-white">كشف الحساب</h2>
            <p className="text-gray-400 mt-1">{customer.name}</p>
            <p className="text-sm text-gray-500 mt-2">
              من {statement.startDate} إلى {statement.endDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Summary Section */}
        <div className="p-6 bg-slate-900/50 border-b border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">الرصيد الافتتاحي</p>
            <p className={`text-lg font-bold ${statement.openingBalance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {formatCurrency(Math.abs(statement.openingBalance))}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">الرصيد الختامي</p>
            <p className={`text-lg font-bold ${statement.closingBalance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {formatCurrency(Math.abs(statement.closingBalance))}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">إجمالي الفواتير</p>
            <p className="text-lg font-bold text-blue-400">{formatCurrency(statement.summary.totalDebit)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">إجمالي الدفعات</p>
            <p className="text-lg font-bold text-green-400">{formatCurrency(statement.summary.totalCredit)}</p>
          </div>
        </div>

        {/* Advanced Statistics */}
        <div className="p-6 border-b border-slate-700 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded p-3">
            <p className="text-xs text-gray-400">الفواتير المعلقة</p>
            <p className="text-base font-bold text-yellow-400 mt-1">{statement.summary.pendingInvoicesCount}</p>
          </div>
          <div className="bg-slate-800 rounded p-3">
            <p className="text-xs text-gray-400">نسبة الدفع</p>
            <p className="text-base font-bold text-blue-400 mt-1">{statement.summary.paymentPercentage.toFixed(1)}%</p>
          </div>
          <div className="bg-slate-800 rounded p-3">
            <p className="text-xs text-gray-400">أكبر فاتورة</p>
            <p className="text-base font-bold text-purple-400 mt-1">{formatCurrency(statement.summary.largestInvoice)}</p>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="p-6">
          <h3 className="text-lg font-bold text-white mb-4">حركات الحساب</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-200">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="text-right p-3">التاريخ</th>
                  <th className="text-right p-3">البيان</th>
                  <th className="text-center p-3">مدين (من العميل)</th>
                  <th className="text-center p-3">دائن (للعميل)</th>
                  <th className="text-center p-3">الرصيد</th>
                  <th className="text-center p-3">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {statement.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 text-gray-300">{row.date}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getPaymentMethodIcon(row.type)}</span>
                        <span className="text-gray-100">{row.desc}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {row.debit > 0 && <span className="text-red-400">{formatCurrency(row.debit)}</span>}
                    </td>
                    <td className="p-3 text-center">
                      {row.credit > 0 && <span className="text-green-400">{formatCurrency(row.credit)}</span>}
                    </td>
                    <td className="p-3 text-center font-bold">
                      <span className={row.runningBalance >= 0 ? 'text-red-400' : 'text-green-400'}>
                        {formatCurrency(Math.abs(row.runningBalance))}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onShowTransactionDetail?.(row)}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        title="عرض التفاصيل"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-6 flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => onPrint(customer, statement)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            <Printer size={18} />
            طباعة
          </button>
          <button
            onClick={() => onExportPDF(customer, statement)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors"
          >
            <Download size={18} />
            تحميل PDF
          </button>
          <button
            onClick={() => onSendEmail?.(customer, statement)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
          >
            <Send size={18} />
            إرسال بريد
          </button>
          <button
            onClick={() => setShowScheduler(true)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded transition-colors"
          >
            <Clock size={18} />
            جدولة
          </button>
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
