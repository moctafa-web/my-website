import React from 'react';
import { StatementRow } from '../types';

interface Props {
  rows: StatementRow[];
  onRowClick?: (row: StatementRow) => void;
}

export default function Timeline({ rows, onRowClick }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">لا توجد حركات للعرض</p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    const icons: Record<string, string> = {
      invoice: '📄',
      payment: '💳',
      return: '↩️',
      note: '📝',
    };
    return icons[type] || '📌';
  };

  const getColor = (type: string) => {
    const colors: Record<string, string> = {
      invoice: 'border-l-red-500 bg-red-900/10',
      payment: 'border-l-green-500 bg-green-900/10',
      return: 'border-l-orange-500 bg-orange-900/10',
      note: 'border-l-blue-500 bg-blue-900/10',
    };
    return colors[type] || 'border-l-gray-500 bg-gray-900/10';
  };

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => (
        <div
          key={idx}
          onClick={() => onRowClick?.(row)}
          className={`border-l-4 ${getColor(row.type)} p-4 rounded-lg cursor-pointer hover:shadow-lg transition-all ${
            onRowClick ? 'hover:bg-white/5' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <span className="text-2xl mt-1">{getIcon(row.type)}</span>
              <div>
                <p className="font-semibold text-white">{row.desc}</p>
                <p className="text-sm text-gray-400">{row.date}</p>
              </div>
            </div>
            <div className="text-right">
              {row.debit > 0 && (
                <p className="text-sm text-red-400 font-medium">
                  {row.debit.toLocaleString('ar-EG')}
                </p>
              )}
              {row.credit > 0 && (
                <p className="text-sm text-green-400 font-medium">
                  +{row.credit.toLocaleString('ar-EG')}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                الرصيد: {row.runningBalance.toLocaleString('ar-EG')}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
