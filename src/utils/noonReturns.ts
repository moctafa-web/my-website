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
// الرسوم اللاحقة (deferred) مش بتدخل هنا: بتتخصم من أرباح الفترة اللي اتخصمت فيها (deferredCharges)
export const orderFees = (o: NoonOrder) =>
  r2((o.adjustments || []).filter(a => a.kind !== 'return_clawback' && !a.deferred).reduce((s, a) => s + a.amount, 0) + (o.settlementExtraFee || 0));

export interface DeferredCharge { order: NoonOrder; adj: NoonAdjustment }

// رسوم لاحقة على أوردرات اتسوّت قبل كده: بتتحسب على الفترة اللي اتخصمت فيها (تاريخ الخصم)
export const deferredCharges = (orders: NoonOrder[], inPeriod: (date: string) => boolean, platform?: (o: NoonOrder) => boolean): DeferredCharge[] => {
  const out: DeferredCharge[] = [];
  orders.forEach(o => {
    if (platform && !platform(o)) return;
    (o.adjustments || []).forEach(a => { if (a.deferred && inPeriod(a.date)) out.push({ order: o, adj: a }); });
  });
  return out;
};

export const deferredTotal = (charges: DeferredCharge[]) => r2(charges.reduce((s, c) => s + c.adj.amount, 0));

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
