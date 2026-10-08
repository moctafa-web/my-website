import { AppState } from '../types';

export type Channel = 'offline' | 'noon' | 'amazon' | 'other';

export interface ProfitRow {
  key: string;
  date: string;
  channel: Channel;
  docId: string;
  docNumber: string;
  party?: string;
  product: string;
  serial?: string;
  qty: number;
  revenue: number;
  cost: number;
  commission: number | null; // null = لسه ما اتسوّاش (العمولة مجهولة)
  profit: number;
  status?: string;
  estimated?: boolean; // ربح متوقع (أوردر منصة لسه ما اتسوّاش)
  pendingCost?: boolean; // التكلفة لسه معلّقة: مش بنحسب ربحه
}

export interface ProfitFilter {
  from: string; // YYYY-MM-DD أو ''
  to: string;
  channel: Channel | 'all';
}

export const channelLabel = (c: Channel) =>
  c === 'offline' ? 'المحل' : c === 'noon' ? 'نون' : c === 'amazon' ? 'أمازون' : 'أخرى';

const inRange = (d: string, f: ProfitFilter) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
const day = (d?: string) => (d || '').slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ProfitResult {
  rows: ProfitRow[]; // صف لكل جهاز / سطر
  excludedCount: number; // أوردرات ملغاة/مرتجعة مستبعدة
}

export const buildProfitRows = (state: AppState, f: ProfitFilter): ProfitResult => {
  const rows: ProfitRow[] = [];
  let excludedCount = 0;

  // ===== المحل (فواتير البيع) =====
  if (f.channel === 'all' || f.channel === 'offline') {
    state.saleInvoices.forEach(inv => {
      if (inv.status === 'canceled') return;
      const date = day(inv.date);
      if (!inRange(date, f)) return;
      const itemsTotal = inv.items.reduce((s, it) => s + (it.total || 0), 0);
      inv.items.forEach((it, idx) => {
        // نوزع إجمالي الفاتورة (بعد الخصم/الضريبة) على الأصناف بنسبة إجمالي كل صنف
        const share = itemsTotal > 0 ? (it.total || 0) / itemsTotal : 1 / Math.max(inv.items.length, 1);
        const lineRevenue = inv.total * share;
        const qty = it.quantity || 1;
        const unitCost = it.costPrice ?? (state.products.find(p => p.id === it.productId)?.costPrice || 0);
        const serials = it.serials || [];
        const splitBySerial = serials.length > 0 && serials.length === qty;
        const pieces = splitBySerial ? serials.map(s => s.serial) : [undefined];
        pieces.forEach((sn, k) => {
          const q = splitBySerial ? 1 : qty;
          const revenue = splitBySerial ? lineRevenue / qty : lineRevenue;
          const cost = unitCost * q;
          const pending = !!it.pendingCost;
          rows.push({
            key: `s-${inv.id}-${idx}-${k}`,
            date, channel: 'offline', docId: inv.id, docNumber: inv.invoiceNumber, party: inv.customerName,
            product: it.productName, serial: sn, qty: q,
            revenue: r2(revenue), cost: r2(cost), commission: 0,
            profit: pending ? 0 : r2(revenue - cost),
            pendingCost: pending,
          });
        });
      });
    });
  }

  // ===== أوردرات المنصات =====
  state.noonOrders.forEach(o => {
    const ch: Channel = o.platform === 'noon' ? 'noon' : o.platform === 'amazon' ? 'amazon' : 'other';
    if (f.channel !== 'all' && f.channel !== ch) return;
    const settled = o.status === 'settled';
    const date = settled && o.settledDate ? day(o.settledDate) : day(o.date);
    if (!inRange(date, f)) return;
    if (o.status === 'canceled' || o.status === 'returned') { excludedCount++; return; }

    const revenueTotal = o.items.reduce((s, it) => s + (it.price || 0), 0);
    const commissionTotal = settled ? Math.max(0, revenueTotal - (o.settledAmount || 0)) : null;
    o.items.forEach((it, idx) => {
      const share = revenueTotal > 0 ? (it.price || 0) / revenueTotal : 1 / Math.max(o.items.length, 1);
      const commission = commissionTotal === null ? null : commissionTotal * share;
      const cost = it.costPrice || 0;
      const revenue = it.price || 0;
      // المحقق: اللي اتسوّى فعلاً = (المبلغ المحوّل − التكلفة). المتوقع = السعر − التكلفة قبل العمولة.
      const profit = commission === null ? revenue - cost : revenue - commission - cost;
      rows.push({
        key: `n-${o.id}-${idx}`,
        date, channel: ch, docId: o.id, docNumber: o.orderNumber, party: o.customerName,
        product: it.productName, serial: it.serial, qty: 1,
        revenue: r2(revenue), cost: r2(cost),
        commission: commission === null ? null : r2(commission),
        profit: r2(profit), status: o.status, estimated: commission === null,
      });
    });
  });

  return { rows, excludedCount };
};

// تجميع حسب الفاتورة/الأوردر
export const groupByDocument = (rows: ProfitRow[]): ProfitRow[] => {
  const map = new Map<string, ProfitRow>();
  rows.forEach(r => {
    const k = `${r.channel}-${r.docId}`;
    const g = map.get(k);
    if (!g) {
      map.set(k, { ...r, key: `g-${k}`, product: r.product, serial: undefined });
    } else {
      g.qty += r.qty;
      g.revenue = r2(g.revenue + r.revenue);
      g.cost = r2(g.cost + r.cost);
      g.profit = r2(g.profit + r.profit);
      g.commission = g.commission === null || r.commission === null ? (g.commission ?? r.commission) : r2(g.commission + r.commission);
      g.pendingCost = g.pendingCost || r.pendingCost;
      g.estimated = g.estimated || r.estimated;
      g.product = g.product.includes(r.product) ? g.product : `${g.product} + ${r.product}`;
    }
  });
  return [...map.values()];
};

export interface ProfitTotals {
  revenue: number;
  cost: number;
  commission: number;
  realizedProfit: number;
  estimatedProfit: number;
  pendingCostCount: number;
}

export const totalsOf = (rows: ProfitRow[]): ProfitTotals => {
  const t: ProfitTotals = { revenue: 0, cost: 0, commission: 0, realizedProfit: 0, estimatedProfit: 0, pendingCostCount: 0 };
  rows.forEach(r => {
    if (r.pendingCost) { t.pendingCostCount++; return; } // مش بنحسبه لحد ما تتسجل تكلفته
    t.revenue += r.revenue;
    t.cost += r.cost;
    t.commission += r.commission || 0;
    if (r.estimated) t.estimatedProfit += r.profit; else t.realizedProfit += r.profit;
  });
  (Object.keys(t) as (keyof ProfitTotals)[]).forEach(k => { t[k] = r2(t[k]); });
  return t;
};
