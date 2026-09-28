import { Customer, Supplier, SaleInvoice, PurchaseInvoice, Payment, AccountStatement, StatementRow } from '../types';

export const StatementService = {
  /**
   * حساب كشف الحساب الكامل للعميل ضمن فترة زمنية
   */
  calculateStatement(
    customer: Customer,
    invoices: SaleInvoice[],
    payments: Payment[],
    startDate: string = '',
    endDate: string = ''
  ): AccountStatement {
    // فلترة الفواتير والدفعات الخاصة بهذا العميل
    const customerInvoices = invoices.filter(inv => inv.customerId === customer.id);
    const customerPayments = payments.filter(p => p.type === 'sale' && p.referenceId === customer.id);

    // دمج كل الحركات (فواتير + دفعات)
    const rows: StatementRow[] = [
      ...customerInvoices.map(inv => ({
        date: inv.date,
        desc: `فاتورة ${inv.invoiceNumber}`,
        debit: inv.total,
        credit: 0,
        type: 'invoice' as const,
        ref: inv,
        runningBalance: 0,
      })),
      ...customerPayments.map(p => ({
        date: p.date,
        desc: `دفعة (${this.getPaymentMethodLabel(p.paymentMethod)})${p.notes ? ' - ' + p.notes : ''}`,
        debit: 0,
        credit: p.amount,
        type: 'payment' as const,
        ref: p,
        runningBalance: 0,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // حساب الرصيد الجاري
    let runningBalance = customer.openingBalance;
    rows.forEach(row => {
      runningBalance += row.debit - row.credit;
      row.runningBalance = runningBalance;
    });

    // فلترة حسب الفترة الزمنية إن وجدت
    let filteredRows = rows;
    if (startDate || endDate) {
      filteredRows = rows.filter(r => {
        const afterStart = !startDate || r.date >= startDate;
        const beforeEnd = !endDate || r.date <= endDate;
        return afterStart && beforeEnd;
      });
    }

    // حساب الإحصائيات
    const totalDebit = filteredRows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = filteredRows.reduce((s, r) => s + r.credit, 0);

    const pendingInvoices = customerInvoices.filter(inv => inv.status !== 'paid');
    const totalPending = pendingInvoices.reduce((s, inv) => s + inv.remaining, 0);

    // متوسط فترة الدفع (عدد الأيام بين الفاتورة والدفع)
    const avgPaymentDays = this.calculateAveragePaymentDays(customerInvoices, customerPayments);

    const closingBalance = filteredRows.length > 0 
      ? filteredRows[filteredRows.length - 1].runningBalance 
      : customer.openingBalance;

    // معدل التحصيل (نسبة ما تم دفعه من إجمالي الفواتير)
    const totalInvoiced = customerInvoices.reduce((s, inv) => s + inv.total, 0);
    const totalPaid = customerInvoices.reduce((s, inv) => s + inv.paid, 0);
    const paymentPercentage = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    const largestInvoice = customerInvoices.length > 0 
      ? Math.max(...customerInvoices.map(inv => inv.total))
      : 0;

    const today = new Date().toISOString().split('T')[0];

    return {
      customerId: customer.id,
      customerName: customer.name,
      customerType: customer.type,
      startDate: startDate || '2020-01-01',
      endDate: endDate || today,
      openingBalance: customer.openingBalance,
      closingBalance,
      rows: filteredRows,
      summary: {
        totalInvoices: customerInvoices.length,
        totalPaid,
        totalPending,
        totalDebit,
        totalCredit,
        averagePaymentDays: avgPaymentDays,
        paymentPercentage,
        pendingInvoicesCount: pendingInvoices.length,
        largestInvoice,
      },
    };
  },

  /**
   * حساب متوسط فترة الدفع بالأيام
   */
  calculateAveragePaymentDays(invoices: SaleInvoice[], payments: Payment[]): number {
    if (invoices.length === 0) return 0;

    const paymentDays: number[] = [];

    invoices.forEach(inv => {
      const paidAmount = inv.paid;
      if (paidAmount > 0) {
        // البحث عن الدفعات المرتبطة بهذه الفاتورة
        const relatedPayments = payments.filter(p => {
          // سيتم تحديثها عندما نضيف relatedInvoiceIds
          return p.date >= inv.date;
        });

        if (relatedPayments.length > 0) {
          const invDate = new Date(inv.date);
          const paymentDate = new Date(relatedPayments[0].date);
          const days = Math.floor((paymentDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
          paymentDays.push(Math.max(0, days));
        }
      }
    });

    if (paymentDays.length === 0) return 0;
    const avg = paymentDays.reduce((s, d) => s + d, 0) / paymentDays.length;
    return Math.round(avg);
  },

  /**
   * الحصول على تسمية طريقة الدفع
   */
  getPaymentMethodLabel(method: string): string {
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
  },

  /**
   * حساب حالة الدفع للفاتورة
   */
  getPaymentStatus(remaining: number, total: number): 'paid' | 'partial' | 'unpaid' {
    if (remaining === 0) return 'paid';
    if (remaining === total) return 'unpaid';
    return 'partial';
  },

  /**
   * حساب أيام التأخر عن الاستحقاق
   */
  calculateDaysOverdue(dueDate: string | undefined): number {
    if (!dueDate) return 0;
    const due = new Date(dueDate);
    const today = new Date();
    const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  },

  /**
   * توليد ملخص نصي لكشف الحساب
   */
  generateSummaryText(statement: AccountStatement): string {
    return `
كشف الحساب: ${statement.customerName}
الفترة: من ${statement.startDate} إلى ${statement.endDate}

الرصيد الافتتاحي: ${statement.openingBalance}
الرصيد الختامي: ${statement.closingBalance}

إجمالي الفواتير: ${statement.summary.totalDebit}
إجمالي الدفعات: ${statement.summary.totalCredit}

الفواتير المعلقة: ${statement.summary.pendingInvoicesCount}
المبلغ المعلق: ${statement.summary.totalPending}

معدل الدفع: ${statement.summary.paymentPercentage.toFixed(1)}%
متوسط فترة الدفع: ${statement.summary.averagePaymentDays} أيام
    `;
  },

  /**
   * كشف حساب موحّد لأي طرف: بيع + شراء + قبض + دفع.
   * موجب = مستحق لنا، سالب = مستحق للطرف.
   */
  calculatePartyStatement(
    party: Customer | Supplier,
    saleInvoices: SaleInvoice[],
    purchaseInvoices: PurchaseInvoice[],
    payments: Payment[],
    startDate: string = '',
    endDate: string = ''
  ): AccountStatement {
    const sales = saleInvoices.filter(inv => inv.customerId === party.id);
    const purchases = purchaseInvoices.filter(inv => inv.supplierId === party.id);
    const partyPayments = payments.filter(p => p.referenceId === party.id);

    const rows: StatementRow[] = [
      ...sales.map(inv => ({
        date: inv.date,
        desc: `فاتورة بيع ${inv.invoiceNumber}`,
        debit: inv.total,
        credit: 0,
        type: 'invoice' as const,
        ref: inv,
        runningBalance: 0,
      })),
      ...purchases.map(inv => ({
        date: inv.date,
        desc: `فاتورة شراء ${inv.invoiceNumber}`,
        debit: 0,
        credit: inv.total,
        type: 'invoice' as const,
        ref: inv as any,
        runningBalance: 0,
      })),
      ...partyPayments.map(p => ({
        date: p.date,
        desc: `${p.direction === 'in' ? 'دفعة واردة' : 'دفعة خارجة'} (${this.getPaymentMethodLabel(p.paymentMethod)})${p.notes ? ' - ' + p.notes : ''}`,
        debit: p.direction === 'out' ? p.amount : 0,
        credit: p.direction === 'in' ? p.amount : 0,
        type: 'payment' as const,
        ref: p,
        runningBalance: 0,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // نحسب الرصيد الكامل أولًا، ثم نحدد رصيد ما قبل بداية الفترة.
    // بذلك لا يبدأ كشف الفترة من الرصيد الافتتاحي الأصلي إذا كانت هناك
    // حركات أقدم من تاريخ البداية.
    let runningBalance = party.openingBalance || 0;
    rows.forEach(row => {
      runningBalance += row.debit - row.credit;
      row.runningBalance = runningBalance;
    });

    const filteredRows = (startDate || endDate)
      ? rows.filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate))
      : rows;

    const openingForPeriod = startDate
      ? rows.filter(r => r.date < startDate).reduce(
          (balance, r) => balance + r.debit - r.credit,
          party.openingBalance || 0
        )
      : (party.openingBalance || 0);

    // إعادة حساب الرصيد الجاري داخل الفترة من رصيد ما قبل الفترة.
    let periodRunning = openingForPeriod;
    filteredRows.forEach(row => {
      periodRunning += row.debit - row.credit;
      row.runningBalance = periodRunning;
    });

    const totalDebit = filteredRows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = filteredRows.reduce((s, r) => s + r.credit, 0);
    const closingBalance = filteredRows.length
      ? filteredRows[filteredRows.length - 1].runningBalance
      : openingForPeriod;

    return {
      customerId: party.id,
      customerName: party.name,
      customerType: 'individual',
      startDate: startDate || '2020-01-01',
      endDate: endDate || new Date().toISOString().split('T')[0],
      openingBalance: openingForPeriod,
      closingBalance,
      rows: filteredRows,
      summary: {
        totalInvoices: sales.length + purchases.length,
        totalPaid: partyPayments.reduce((s, p) => s + (p.direction === 'in' ? p.amount : 0), 0),
        totalPending: sales.reduce((s, i) => s + i.remaining, 0) + purchases.reduce((s, i) => s + i.remaining, 0),
        totalDebit,
        totalCredit,
        averagePaymentDays: 0,
        paymentPercentage: 0,
        pendingInvoicesCount: [...sales, ...purchases].filter(i => i.status !== 'paid').length,
        largestInvoice: Math.max(0, ...[...sales, ...purchases].map(i => i.total)),
      },
    };
  },

};
