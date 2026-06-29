// ==================== CORE TYPES ====================

export type PaymentMethod = 'cash' | 'bank' | 'instapay' | 'credit';
export type CustomerType = 'individual' | 'company' | 'wholesale' | 'trader';
export type SupplierType = 'supplier' | 'trader' | 'both';
export type ProductCategory = 'phones' | 'tablets' | 'laptops' | 'accessories' | 'other';
export type ProductType = 'serial' | 'normal';
export type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'canceled' | 'settled';
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
  type: 'sale' | 'purchase' | 'expense' | 'transfer' | 'opening' | 'payment_in' | 'payment_out' | 'adjustment';
  description: string;
  amount: number;
  treasury: 'cash' | 'bank';
  direction: 'in' | 'out';
  referenceId?: string;
  date: string;
  createdAt: string;
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
  // ✅ جديد
  partners: Partner[];
  profitDistributions: ProfitDistribution[];
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