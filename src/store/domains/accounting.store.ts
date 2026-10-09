import { AppState, Customer, Supplier, Party, TreasuryTransaction } from '../../types';

export interface PartyBalance {
  id: string;
  name: string;
  phone?: string;
  balance: number;
  type: 'customer' | 'supplier';
  oldestDueDate?: string;
}

export interface BalanceSnapshot {
  customersOwing: PartyBalance[];
  suppliersWithCredit: PartyBalance[];
  suppliersOwed: PartyBalance[];
  customersWithDebit: PartyBalance[];
  totalOwing: number;
  totalOwed: number;
}

export interface DailySummary {
  date: string;
  salesTotal: number;
  salesPaid: number;
  salesRemaining: number;
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesRemaining: number;
  expensesTotal: number;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  cashNet: number;
  bankNet: number;
}

export interface HealthIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'invoice' | 'treasury' | 'party' | 'inventory' | 'closing';
  title: string;
  details: string;
  referenceId?: string;
}

const EPSILON = 0.01;
const sum = (values: number[]) => values.reduce((total, value) => total + (Number(value) || 0), 0);

export const calculateCustomerBalance = (saleInvoices: AppState['saleInvoices'], customer: Pick<Customer, 'id' | 'openingBalance'>): number => {
  const invoices = saleInvoices.filter(invoice => invoice.customerId === customer.id);
  return sum(invoices.map(invoice => invoice.total)) + (customer.openingBalance || 0) - sum(invoices.map(invoice => invoice.paid));
};
export const getCustomerBalance = (state: AppState, customer: Pick<Customer | Supplier, 'id' | 'openingBalance'>): number => calculateCustomerBalance(state.saleInvoices, customer as Customer);

export const calculateSupplierBalance = (purchaseInvoices: AppState['purchaseInvoices'], supplier: Pick<Supplier, 'id' | 'openingBalance'>): number => {
  const invoices = purchaseInvoices.filter(invoice => invoice.supplierId === supplier.id);
  return sum(invoices.map(invoice => invoice.total)) + (supplier.openingBalance || 0) - sum(invoices.map(invoice => invoice.paid));
};
export const getSupplierBalance = (state: AppState, supplier: Pick<Customer | Supplier, 'id' | 'openingBalance'>): number => calculateSupplierBalance(state.purchaseInvoices, supplier as Supplier);

export const calculatePartyBalance = (
  state: Pick<AppState, 'saleInvoices' | 'purchaseInvoices' | 'payments'>,
  party: Pick<Customer | Supplier, 'id' | 'openingBalance'>
): number => {
  const sales = state.saleInvoices.filter(i => i.customerId === party.id);
  const purchases = state.purchaseInvoices.filter(i => i.supplierId === party.id);
  const payments = state.payments.filter(p => p.referenceId === party.id);
  return (party.openingBalance || 0)
    + sum(sales.map(i => i.total))
    - sum(purchases.map(i => i.total))
    - sum(payments.filter(p => p.direction === 'in').map(p => p.amount))
    + sum(payments.filter(p => p.direction === 'out').map(p => p.amount));
};

export const getPartyBalance = (state: AppState, party: Pick<Customer | Supplier, 'id' | 'openingBalance'>): number => calculatePartyBalance(state, party);

export const getPartyBalances = (state: AppState): BalanceSnapshot => {
  // نجمع أي سجلات قديمة بنفس الاسم قبل التصنيف حتى لا يظهر الطرف مرتين.
  const grouped = new Map<string, { id: string; name: string; phone?: string; balance: number; oldestDueDate?: string }>();
  (state.parties || []).forEach(party => {
    const key = party.name.trim().replace(/\s+/g, ' ').toLowerCase();
    const balance = getPartyBalance(state, party);
    const dueDates = [
      ...state.saleInvoices.filter(i => i.customerId === party.id && i.remaining > EPSILON).map(i => i.date),
      ...state.purchaseInvoices.filter(i => i.supplierId === party.id && i.remaining > EPSILON).map(i => i.date),
    ].sort();
    const current = grouped.get(key);
    if (current) {
      current.balance += balance;
      current.phone ||= party.phone;
      const oldest = dueDates[0];
      if (oldest && (!current.oldestDueDate || oldest < current.oldestDueDate)) current.oldestDueDate = oldest;
    } else {
      grouped.set(key, { id: party.id, name: party.name, phone: party.phone, balance, oldestDueDate: dueDates[0] });
    }
  });
  const positive = [...grouped.values()].filter(x => x.balance > EPSILON).map(x => ({ ...x, balance: x.balance, type: 'customer' as const }));
  const negative = [...grouped.values()].filter(x => x.balance < -EPSILON).map(x => ({ ...x, balance: Math.abs(x.balance), type: 'supplier' as const }));
  return {
    customersOwing: positive,
    suppliersWithCredit: [],
    suppliersOwed: negative,
    customersWithDebit: [],
    totalOwing: sum(positive.map(x => x.balance)),
    totalOwed: sum(negative.map(x => x.balance)),
  };
};

export const getDailySummary = (state: AppState, date: string): DailySummary => {
  const sales = state.saleInvoices.filter(invoice => invoice.date === date);
  const purchases = state.purchaseInvoices.filter(invoice => invoice.date === date);
  const expenses = state.expenses.filter(expense => expense.date === date);
  const transactions = state.treasuryTransactions.filter(transaction => transaction.date === date);

  const cashIn = sum(transactions.filter(t => t.treasury === 'cash' && t.direction === 'in').map(t => t.amount));
  const cashOut = sum(transactions.filter(t => t.treasury === 'cash' && t.direction === 'out').map(t => t.amount));
  const bankIn = sum(transactions.filter(t => t.treasury === 'bank' && t.direction === 'in').map(t => t.amount));
  const bankOut = sum(transactions.filter(t => t.treasury === 'bank' && t.direction === 'out').map(t => t.amount));

  return {
    date,
    salesTotal: sum(sales.map(invoice => invoice.total)),
    salesPaid: sum(sales.map(invoice => invoice.paid)),
    salesRemaining: sum(sales.map(invoice => invoice.remaining)),
    purchasesTotal: sum(purchases.map(invoice => invoice.total)),
    purchasesPaid: sum(purchases.map(invoice => invoice.paid)),
    purchasesRemaining: sum(purchases.map(invoice => invoice.remaining)),
    expensesTotal: sum(expenses.map(expense => expense.amount)),
    cashIn,
    cashOut,
    bankIn,
    bankOut,
    cashNet: cashIn - cashOut,
    bankNet: bankIn - bankOut,
  };
};

const validateInvoiceMath = (state: AppState, issues: HealthIssue[]) => {
  const invoices = [
    ...state.saleInvoices.map(invoice => ({ ...invoice, kind: 'فاتورة بيع' })),
    ...state.purchaseInvoices.map(invoice => ({ ...invoice, kind: 'فاتورة شراء' })),
  ];
  for (const invoice of invoices) {
    const expectedRemaining = Math.max(0, invoice.total - invoice.paid);
    if (Math.abs((invoice.paid + invoice.remaining) - invoice.total) > EPSILON || Math.abs(invoice.remaining - expectedRemaining) > EPSILON) {
      issues.push({
        id: `invoice:${invoice.id}`,
        severity: 'error',
        category: 'invoice',
        title: `${invoice.kind} بها تضارب حسابي`,
        details: `${invoice.invoiceNumber}: الإجمالي ${invoice.total}، المدفوع ${invoice.paid}، المتبقي ${invoice.remaining}`,
        referenceId: invoice.id,
      });
    }
    if (invoice.paid < -EPSILON || invoice.paid - invoice.total > EPSILON) {
      issues.push({
        id: `invoice-paid:${invoice.id}`,
        severity: 'error',
        category: 'invoice',
        title: 'مبلغ مدفوع غير منطقي',
        details: `${invoice.invoiceNumber}: المدفوع يتجاوز إجمالي الفاتورة أو أقل من صفر.`,
        referenceId: invoice.id,
      });
    }
  }
};

const validateTreasury = (state: AppState, issues: HealthIssue[]) => {
  const balanceMap: Record<'cash' | 'bank', number> = { cash: state.cashBalance, bank: state.bankBalance };
  for (const treasury of ['cash', 'bank'] as const) {
    const transactions = state.treasuryTransactions.filter(t => t.treasury === treasury);
    const opening = [...transactions].reverse().find(t => t.type === 'opening');
    if (!opening) continue;
    const afterOpening = transactions.filter(t => new Date(t.createdAt).getTime() >= new Date(opening.createdAt).getTime());
    const calculated = opening.amount * (opening.direction === 'in' ? 1 : -1) + sum(afterOpening.filter(t => t.id !== opening.id).map(t => t.direction === 'in' ? t.amount : -t.amount));
    if (Math.abs(calculated - balanceMap[treasury]) > EPSILON) {
      issues.push({
        id: `treasury:${treasury}`, severity: 'error', category: 'treasury',
        title: `رصيد ${treasury === 'cash' ? 'الكاش' : 'البنك'} لا يطابق الحركات`,
        details: `الرصيد الحالي ${balanceMap[treasury]} مقابل الرصيد المحسوب من نقطة البداية ${calculated}.`,
      });
    }
  }
};

const validatePendingAndStock = (state: AppState, issues: HealthIssue[]) => {
  const pendingSerials = state.serials.filter(serial => serial.purchasePricePending || serial.costPrice === 0);
  if (pendingSerials.length > 0) {
    issues.push({
      id: 'pending-costs', severity: 'warning', category: 'inventory',
      title: `${pendingSerials.length} سيريال سعر الشراء فيه معلّق`,
      details: pendingSerials.slice(0, 5).map(s => `${s.serial} — ${s.productName}`).join(' | '),
    });
  }

  const now = Date.now();
  const oldUnpaid = [...state.saleInvoices, ...state.purchaseInvoices].filter(invoice => {
    if (invoice.remaining <= EPSILON) return false;
    const age = now - new Date(invoice.date).getTime();
    return Number.isFinite(age) && age > 3 * 24 * 60 * 60 * 1000;
  });
  if (oldUnpaid.length > 0) {
    issues.push({
      id: 'old-unpaid', severity: 'warning', category: 'party',
      title: `${oldUnpaid.length} فاتورة غير مدفوعة قديمة`,
      details: oldUnpaid.slice(0, 5).map(i => `${i.invoiceNumber} — متبقي ${i.remaining}`).join(' | '),
    });
  }
};

export const runHealthCheck = (state: AppState): HealthIssue[] => {
  const issues: HealthIssue[] = [];
  validateInvoiceMath(state, issues);
  validateTreasury(state, issues);
  validatePendingAndStock(state, issues);
  return issues;
};

export const getDailyClosingChecklist = (state: AppState, date: string) => {
  const summary = getDailySummary(state, date);
  const pendingCosts = state.serials.filter(serial => serial.purchasePricePending || serial.costPrice === 0);
  const oldUnpaid = [...state.saleInvoices, ...state.purchaseInvoices].filter(invoice => {
    const age = Date.now() - new Date(invoice.date).getTime();
    return invoice.remaining > EPSILON && Number.isFinite(age) && age > 3 * 24 * 60 * 60 * 1000;
  });
  const journal = state.dailyJournals.find(item => item.date === date);
  const actualCash = journal?.actualBalance;
  const theoreticalCash = journal == null ? null : (journal.openingBalance + summary.cashNet);
  const cashDifference = actualCash == null || theoreticalCash == null ? null : theoreticalCash - actualCash;

  return {
    summary,
    pendingCosts,
    oldUnpaid,
    cashDifference,
    hasCashDifference: cashDifference != null && Math.abs(cashDifference) > EPSILON,
    healthIssues: runHealthCheck(state),
    hasBlockingIssues: pendingCosts.length > 0 || oldUnpaid.length > 0 || (cashDifference != null && Math.abs(cashDifference) > EPSILON),
  };
};

export const formatDailySummaryForWhatsApp = (summary: DailySummary, companyName = 'ONE') => {
  const money = (value: number) => `${value.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج.م`;
  return [
    `📋 *ملخص نهاية اليوم — ${companyName}*`,
    `📅 ${summary.date}`,
    '',
    `🛒 المبيعات: ${money(summary.salesTotal)}`,
    `   مدفوع: ${money(summary.salesPaid)} | آجل: ${money(summary.salesRemaining)}`,
    `📦 المشتريات: ${money(summary.purchasesTotal)}`,
    `   مدفوع: ${money(summary.purchasesPaid)} | متبقي: ${money(summary.purchasesRemaining)}`,
    `💸 المصروفات: ${money(summary.expensesTotal)}`,
    '',
    `💵 الكاش: +${money(summary.cashIn)} / -${money(summary.cashOut)} | صافي ${money(summary.cashNet)}`,
    `🏦 البنك: +${money(summary.bankIn)} / -${money(summary.bankOut)} | صافي ${money(summary.bankNet)}`,
  ].join('\n');
};
