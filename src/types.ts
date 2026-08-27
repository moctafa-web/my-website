// ==================== CORE TYPES ====================

export type PaymentMethod = 'cash' | 'bank' | 'instapay' | 'credit' | 'card' | 'check' | 'transfer';
export type CustomerType = 'individual' | 'company' | 'wholesale' | 'trader';
export type SupplierType = 'supplier' | 'trader' | 'both';
export type ProductCategory = 'phones' | 'tablets' | 'laptops' | 'accessories' | 'other';
export type ProductType = 'serial' | 'normal';
export type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'canceled' | 'settled' | 'returned' | 'paid';
export type OrderPlatform = 'noon' | 'amazon' | 'other';
export type InvoiceStatus = 'draft' | 'paid' | 'partial' | 'unpaid' | 'canceled';
export type ViewMode = 'grid' | 'list' | 'compact';

// ==================== PRODUCT ====================
export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  upc?: string;
  barcode?: string;
  category: ProductCategory;
  brand: string;
  productType: ProductType;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock?: number;
  location?: WarehouseLocation;  // Phase 2: مكان تخزين المنتج
  createdAt: string;
  updatedAt: string;
}

export interface SerialItem {
  id: string;
  productId: string;
  productName: string;
  serial: string;
  imei1?: string;
  imei2?: string;
  status: 'available' | 'sold' | 'transferred' | 'returned';
  purchaseInvoiceId?: string;
  saleInvoiceId?: string;
  noonOrderId?: string;
  costPrice: number;
  salePrice?: number;
  location?: WarehouseLocation;   // Phase 2: مكان الجهاز الحالي
  createdAt: string;
  purchasePricePending?: boolean;
}

// ==================== CUSTOMER ====================
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  type: CustomerType;
  openingBalance: number;
  totalInvoices: number;
  totalPaid: number;
  notes?: string;
  createdAt: string;
}

// ==================== SUPPLIER ====================
export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  type: SupplierType;
  openingBalance: number;
  totalInvoices: number;
  totalPaid: number;
  notes?: string;
  createdAt: string;
}

// ==================== INVOICE ITEMS ====================
export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  taxRate: number;
  total: number;
  serials?: SerialItemLine[];
  costPrice?: number;
  pendingCost?: boolean;
}

export interface SerialItemLine {
  serial: string;
  imei1?: string;
  imei2?: string;
}

// ==================== SALE INVOICE ====================
export interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod;
  instapayPerson?: string;
  notes?: string;
  createdAt: string;
}

// ==================== PURCHASE INVOICE ====================
export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdAt: string;
}

// ==================== PAYMENT DETAILS ====================
export interface CardDetails {
  last4: string;
  bank: string;
  expiry: string;
}

export interface TransferDetails {
  bankName: string;
  referenceNo: string;
  accountName: string;
}

export interface CheckDetails {
  checkNo: string;
  bank: string;
  dueDate: string;
}

// ==================== PAYMENT ====================
export interface Payment {
  id: string;
  type: 'sale' | 'purchase' | 'expense' | 'opening';
  referenceId: string;
  referenceName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  instapayPerson?: string;
  direction: 'in' | 'out';
  date: string;
  notes?: string;
  // ✅ تفاصيل الدفع حسب الطريقة
  cardDetails?: CardDetails;
  transferDetails?: TransferDetails;
  checkDetails?: CheckDetails;
  relatedInvoiceIds?: string[]; // الفواتير المدفوعة بهذه الدفعة
  createdAt: string;
}

// ==================== EXPENSE ====================
export interface Expense {
  id: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  category?: string;
  date: string;
  notes?: string;
  createdAt: string;
}

// ==================== TREASURY ====================
export interface TreasuryTransaction {
  id: string;
  type: 'sale' | 'purchase' | 'expense' | 'transfer' | 'opening' | 'payment_in' | 'payment_out' | 'adjustment' | 'partner_in' | 'partner_out' | 'employee_in' | 'employee_out';
  description: string;
  amount: number;
  treasury: 'cash' | 'bank';
  direction: 'in' | 'out';
  referenceId?: string;
  partyType?: 'partner' | 'employee';
  partyName?: string;
  date: string;
  createdAt: string;
}

// ==================== INVOICE DETAIL (لاستعراض التفاصيل من الكشف) ====================
export interface InvoiceDetail extends SaleInvoice {
  // نفس بيانات SaleInvoice لكن قد نضيف حقول إضافية لاحقاً
}

// ==================== RETURN DETAIL ====================
export interface ReturnDetail {
  id: string;
  returnNumber: string;
  date: string;
  invoiceId: string;
  items: InvoiceItem[];
  reason: string;
  refundedAmount: number;
  status: 'processed' | 'pending' | 'rejected';
  notes?: string;
  createdAt: string;
}

// ==================== ACCOUNT STATEMENT ROW ====================
export interface StatementRow {
  date: string;
  desc: string;
  debit: number;
  credit: number;
  type: 'invoice' | 'payment' | 'return' | 'note';
  ref: SaleInvoice | Payment | ReturnDetail;
  runningBalance: number;
}

// ==================== ACCOUNT STATEMENT ====================
export interface AccountStatement {
  customerId: string;
  customerName: string;
  customerType: CustomerType;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
  summary: {
    totalInvoices: number;
    totalPaid: number;
    totalPending: number;
    totalDebit: number;
    totalCredit: number;
    averagePaymentDays: number;
    paymentPercentage: number;
    pendingInvoicesCount: number;
    largestInvoice: number;
  };
}

// ==================== NOON ORDER ====================
export interface NoonOrderItem {
  productId: string;
  productName: string;
  upc?: string;
  serial?: string;
  imei1?: string;
  imei2?: string;
  price: number;
  costPrice?: number;
}

export interface NoonOrder {
  id: string;
  orderNumber: string;
  shipmentNumber?: string;
  platform: OrderPlatform;
  customerName?: string;
  date: string;
  items: NoonOrderItem[];
  status: OrderStatus;
  notes?: string;
  settledAmount?: number;
  settledDate?: string;
  settlementProfit?: number;
  createdAt: string;
}

// ==================== DAILY CLOSING ====================
export interface DailyClosing {
  id: string;
  date: string;
  openingCash: number;
  closingCash: number;
  openingBank: number;
  closingBank: number;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  cashDifference: number;
  bankDifference: number;
  notes?: string;
  createdAt: string;
}

// ==================== DAILY JOURNAL ====================
export interface JournalEntry {
  id: string;
  label: string;
  amount: number;
}

export interface DailyJournal {
  id: string;
  date: string;
  openingBalance: number;
  inEntries: JournalEntry[];
  outEntries: JournalEntry[];
  actualBalance: number;
  actualBalanceBank?: number;
  closingTime?: string;
  closingNote?: string;
  updatedAt: string;
}

// ==================== BRAND ====================
export interface Brand {
  id: string;
  name: string;
  createdAt: string;
}

// ==================== PARTNERS (الشركاء) ====================
export interface Employee {
  id: string;
  name: string;
  phone?: string;
  role?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Partner {
  id: string;
  name: string;
  capitalAmount: number;   // مبلغ رأس المال بالجنيه
  isActive: boolean;       // نشط = يدخل في التوزيع
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== PROFIT DISTRIBUTION (توزيع الأرباح) ====================
export interface ProfitDistributionLine {
  partnerId: string;
  partnerName: string;
  capitalAmount: number;    // رأس مال الشريك وقت الاعتماد
  capitalPercent: number;   // نسبته من إجمالي رأس المال وقت الاعتماد
  shareAmount: number;      // نصيبه من الربح/الخسارة
}

export interface ProfitDistribution {
  id: string;               // مثال: "2026-06"
  month: string;            // مثال: "2026-06"
  totalCapital: number;     // إجمالي رأس المال وقت الاعتماد
  netProfit: number;        // صافي الربح أو الخسارة (سالب = خسارة)
  salesProfit: number;      // ربح المبيعات
  noonProfit: number;       // ربح نون/أمازون
  totalExpenses: number;    // إجمالي المصروفات
  lines: ProfitDistributionLine[];
  notes?: string;
  createdAt: string;
}

// ==================== PHASE 1: WEEKLY PHYSICAL INVENTORY COUNT ====================
export interface InventoryCountLine {
  productId: string;
  productName: string;
  sku: string;
  theoreticalQty: number;      // الكمية النظرية من النظام
  physicalQty: number;           // الكمية الفعلية المحسوبة يدوياً
  difference: number;            // الفرق (negative = ناقص، positive = زيادة)
  category: 'matched' | 'shortage' | 'surplus'; // مطابق/ناقص/زيادة
  notes?: string;
  countedBy?: string;            // من قام بالجرد
}

export interface DailyInventoryScanLine {
  id: string;
  code: string;
  serialId?: string;
  productId?: string;
  productName: string;
  serial?: string;
  countedAt: string;
  result: 'matched' | 'unknown' | 'duplicate' | 'not-available';
  note?: string;
}

export interface DailyInventoryScan {
  id: string;
  date: string;
  location?: WarehouseLocation;
  status: 'draft' | 'completed';
  lines: DailyInventoryScanLine[];
  startedAt: string;
  completedAt?: string;
  createdBy?: string;
  notes?: string;
}

export interface WeeklyInventoryCount {
  id: string;
  weekNumber: number;            // أسبوع السنة
  year: number;
  startDate: string;             // بداية الأسبوع
  endDate: string;               // نهاية الأسبوع
  lines: InventoryCountLine[];
  status: 'draft' | 'completed' | 'approved';
  totalTheoretical: number;      // إجمالي القيمة النظرية
  totalPhysical: number;         // إجمالي القيمة الفعلية
  totalDifference: number;       // الفرق الإجمالي
  accuracyPercentage: number;    // نسبة دقة الجرد
  shortageItems: number;         // عدد الأصناف الناقصة
  surplusItems: number;          // عدد الأصناف الزائدة
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
}

// ==================== PHASE 2: WAREHOUSE/STORE LOCATION MANAGEMENT ====================
export type WarehouseLocation = 'warehouse' | 'store' | 'both';

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromLocation: WarehouseLocation;   // من أين
  toLocation: WarehouseLocation;     // إلى أين
  date: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    serials?: SerialItemLine[];      // في حالة المنتجات بالسيريال
  }[];
  sentBy?: string;
  receivedBy?: string;
  notes?: string;
  status: 'pending' | 'received' | 'canceled';
  createdAt: string;
}

// ==================== PHASE 3: ENHANCED DAILY OPERATIONS ====================
export interface DailyOperationEntry {
  id: string;
  date: string;
  operationType: 'sale' | 'purchase' | 'transfer' | 'adjustment' | 'return';
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reference?: string;            // رقم الفاتورة أو الحوالة
  location?: WarehouseLocation;  // الموقع المتأثر
  notes?: string;
  createdAt: string;
}

export interface DailyOperationReport {
  date: string;
  sales: DailyOperationEntry[];
  purchases: DailyOperationEntry[];
  transfers: DailyOperationEntry[];
  adjustments: DailyOperationEntry[];
  returns: DailyOperationEntry[];
  totalSalesQty: number;
  totalPurchasesQty: number;
  totalSalesValue: number;
  totalPurchasesValue: number;
  netMovement: number;
}

// ==================== APP STATE ====================
export interface AppState {
  products: Product[];
  serials: SerialItem[];
  customers: Customer[];
  suppliers: Supplier[];
  saleInvoices: SaleInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
  expenses: Expense[];
  treasuryTransactions: TreasuryTransaction[];
  noonOrders: NoonOrder[];
  dailyClosings: DailyClosing[];
  dailyJournals: DailyJournal[];
  brands: Brand[];
  partners: Partner[];
  employees: Employee[];
  profitDistributions: ProfitDistribution[];
  // ✅ Phase 1: Weekly Physical Counts
  weeklyInventoryCounts: WeeklyInventoryCount[];
  // ✅ Phase 2: Stock Transfers
  stockTransfers: StockTransfer[];
  // ✅ Phase 3: Daily Operations
  dailyOperations: DailyOperationEntry[];
  // ✅ Daily barcode inventory sessions
  dailyInventoryScans: DailyInventoryScan[];
  cashBalance: number;
  bankBalance: number;
  settings: AppSettings;
}

export interface AppSettings {
  companyName: string;
  companyPhone?: string;
  companyAddress?: string;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  purchasePrefix: string;
  lastSaleInvoiceNum: number;
  lastPurchaseInvoiceNum: number;
}
