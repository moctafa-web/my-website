import React from 'react';
import { PaymentMethod } from '../types';

interface Props {
  method: PaymentMethod;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function PaymentMethodBadge({ method, size = 'md', showLabel = true }: Props) {
  const getMethodInfo = (m: PaymentMethod): { icon: string; label: string; color: string; bgColor: string } => {
    const methods: Record<PaymentMethod, { icon: string; label: string; color: string; bgColor: string }> = {
      cash: { icon: '💵', label: 'كاش', color: 'text-green-400', bgColor: 'bg-green-900/20' },
      bank: { icon: '🏦', label: 'بنك', color: 'text-blue-400', bgColor: 'bg-blue-900/20' },
      card: { icon: '💳', label: 'بطاقة', color: 'text-purple-400', bgColor: 'bg-purple-900/20' },
      transfer: { icon: '📤', label: 'تحويل', color: 'text-cyan-400', bgColor: 'bg-cyan-900/20' },
      check: { icon: '📋', label: 'شيك', color: 'text-orange-400', bgColor: 'bg-orange-900/20' },
      instapay: { icon: '📱', label: 'إنستابي', color: 'text-indigo-400', bgColor: 'bg-indigo-900/20' },
      credit: { icon: '💰', label: 'ائتمان', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20' },
    };
    return methods[m] || { icon: '💰', label: m, color: 'text-gray-400', bgColor: 'bg-gray-900/20' };
  };

  const info = getMethodInfo(method);
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-2 text-sm gap-2',
    lg: 'px-4 py-2 text-base gap-2',
  };

  const iconSizes = {
    sm: '14px',
    md: '16px',
    lg: '18px',
  };

  return (
    <div className={`inline-flex items-center rounded-full ${info.bgColor} ${sizeClasses[size]}`}>
      <span style={{ fontSize: iconSizes[size] }}>{info.icon}</span>
      {showLabel && <span className={`font-medium ${info.color}`}>{info.label}</span>}
    </div>
  );
}
