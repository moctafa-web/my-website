import { NoonAdjustment, NoonOrder } from '../types';

export const ADJ_KIND_LABEL: Record<NoonAdjustment['kind'], string> = {
  shipping: 'رسوم شحن',
  fee: 'عمولة/رسوم أخرى',
  return_clawback: 'خصم مرتجع',
  other: 'أخرى',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export const orderCost = (o: NoonOrder) => o.items.reduce((s, it) => s + (it.costPrice || 0), 0);

// الخصومات اللي نزلت على الأوردر في دفعات لاحقة
export const clawbackDone = (o: NoonOrder) =>
  r2((o.adjustments || []).filter(a => a.kind === 'return_clawback').reduce((s, a) => s + a.amount, 0));

// مصاريف الأوردر (شحن/عمولات أخرى) غير خصم المرتجع، + حصته من مصاريف الدفعة
export const orderFees = (o: NoonOrder) =>
  r2((o.adjustments || []).filter(a => a.kind !== 'return_clawback').reduce((s, a) => s + a.amount, 0) + (o.settlementExtraFee || 0));

// مرتجع وفلوسه نزلت لنا (settledAmount) ونون لسه ماخصمتهاش بالكامل
export const clawbackPending = (o: NoonOrder) =>
  o.status === 'returned' && (o.settledAmount || 0) > 0 ? Math.max(0, r2((o.settledAmount || 0) - clawbackDone(o))) : 0;

export type ReturnState = 'none' | 'pending_clawback' | 'closed_clawed' | 'closed_no_money';
export const returnState = (o: NoonOrder): ReturnState => {
  if (o.status !== 'returned') return 'none';
  if ((o.settledAmount || 0) > 0) return clawbackPending(o) > 0.005 ? 'pending_clawback' : 'closed_clawed';
  return 'closed_no_money';
};

// صافي ربح الأوردر بعد التسوية (بيتحدّث كل ما تتسجل تسوية أو خصم)
export const netProfit = (o: NoonOrder): number => {
  const fees = orderFees(o);
  if (o.status === 'returned') {
    // المرتجع: الفلوس لازم تتخصم، فالمتبقي = - المصاريف، ولو الجهاز مارجعش المخزون بنخسر تكلفته
    return r2(-fees - (o.returnRestocked ? 0 : orderCost(o)));
  }
  return r2((o.settledAmount || 0) - orderCost(o) - fees);
};
