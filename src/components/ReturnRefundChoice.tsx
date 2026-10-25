import React from 'react';
import { Payment, PaymentMethod } from '../types';
import { formatCurrency, generateId, getTodayStr } from '../utils/helpers';

// اختيار مصير الفلوس المدفوعة عند مرتجع فاتورة: تفضل رصيد في الحساب، أو تتردّ فعليًا بدفعة
export interface RefundChoice {
  choice: '' | 'keep' | 'refund';
  amount: string;
  method: 'cash' | 'bank' | 'instapay';
}

export const EMPTY_REFUND_CHOICE: RefundChoice = { choice: '', amount: '', method: 'cash' };

// الطريقة الافتراضية للرد = طريقة دفع الفاتورة الأصلية (لو معروفة)
export const defaultRefundMethod = (original?: PaymentMethod): RefundChoice['method'] =>
  original === 'instapay' ? 'instapay' : original === 'cash' || !original ? 'cash' : 'bank';

export const refundReady = (c: RefundChoice, paid: number): boolean => {
  if (paid <= 0) return true;
  if (c.choice === 'keep') return true;
  const amt = Number(c.amount);
  return c.choice === 'refund' && amt > 0 && amt <= paid;
};

/**
 * دفعة الرد: مرتجع بيع = دفعة خارجة للعميل (type 'sale')، ومرتجع شراء = دفعة واردة من المورد (type 'purchase').
 * النوع متعمد: دفعات الرد ما بتتوزعش على فواتير تانية للطرف (لو كان عميل ومورد في نفس الوقت).
 */
export const buildRefundPayment = (
  mode: 'sale' | 'purchase',
  invoice: { invoiceNumber: string },
  party: { id: string; name: string },
  c: RefundChoice,
): Payment => ({
  id: generateId(),
  type: mode === 'sale' ? 'sale' : 'purchase',
  referenceId: party.id,
  referenceName: party.name,
  amount: Math.round(Number(c.amount)),
  paymentMethod: c.method,
  direction: mode === 'sale' ? 'out' : 'in',
  date: getTodayStr(),
  notes: mode === 'sale' ? `رد فلوس مرتجع فاتورة ${invoice.invoiceNumber}` : `استرداد فلوس مرتجع فاتورة شراء ${invoice.invoiceNumber}`,
  createdAt: new Date().toISOString(),
});

interface Props {
  mode: 'sale' | 'purchase';
  paid: number;
  value: RefundChoice;
  onChange: (v: RefundChoice) => void;
}

const METHODS: { id: RefundChoice['method']; label: string }[] = [
  { id: 'cash', label: '💵 كاش' }, { id: 'bank', label: '🏦 بنك' }, { id: 'instapay', label: '📱 انستا باي' },
];

export default function ReturnRefundChoice({ mode, paid, value, onChange }: Props) {
  if (paid <= 0) return null;
  const sale = mode === 'sale';
  const amt = Number(value.amount);
  const btn = (active: boolean) =>
    `w-full text-right p-3 rounded-xl border text-sm transition-colors ${active ? 'bg-fuchsia-700/25 border-fuchsia-500/60 text-white' : 'border-white/10 text-gray-300 hover:border-white/25'}`;
  return (
    <div className="mb-4 space-y-2">
      <div className="text-xs text-gray-400">
        {sale ? 'العميل دفع' : 'اتدفع للمورد'} <b className="text-white">{formatCurrency(paid)}</b> — اختار إيه يحصل فيهم (لازم تختار):
      </div>
      <button type="button" onClick={() => onChange({ ...value, choice: 'keep' })} className={btn(value.choice === 'keep')}>
        <div className="font-medium">تفضل رصيد {sale ? 'للعميل' : 'لينا عند المورد'}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {sale ? 'بتتخصم من فاتورة جاية، أو ترجّعها له بعدين من كشف الحساب.' : 'بتتخصم من فاتورة جاية منه، أو تسجّل استلامها بعدين من كشف الحساب.'}
        </div>
      </button>
      <button type="button" onClick={() => onChange({ ...value, choice: 'refund', amount: value.amount || String(paid) })} className={btn(value.choice === 'refund')}>
        <div className="font-medium">{sale ? 'رجّع الفلوس للعميل دلوقتي' : 'المورد رجّع الفلوس دلوقتي'}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {sale ? 'بيتسجل دفعة خارجة وتتخصم من الخزنة، ورصيد العميل يبقى صفر.' : 'بيتسجل دفعة واردة وتدخل الخزنة، ورصيد المورد يبقى صفر.'}
        </div>
      </button>
      {value.choice === 'refund' && (
        <div className="p-3 rounded-xl bg-black/20 border border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-14">المبلغ</label>
            <input type="number" min="1" max={paid} value={value.amount}
              onChange={e => onChange({ ...value, amount: e.target.value })} className="input-dark flex-1" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(m => (
              <button key={m.id} type="button" onClick={() => onChange({ ...value, method: m.id })}
                className={`py-1.5 rounded-lg border text-xs ${value.method === m.id ? 'bg-violet-700/30 border-violet-500/50 text-violet-200' : 'border-white/10 text-gray-400'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {amt > paid && <div className="text-xs text-red-400">المبلغ أكبر من اللي اتدفع ({formatCurrency(paid)}).</div>}
          {amt > 0 && amt < paid && <div className="text-xs text-orange-300">رد جزئي: الباقي ({formatCurrency(paid - amt)}) يفضل رصيد.</div>}
        </div>
      )}
    </div>
  );
}
