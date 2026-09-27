import type {
  AppState,
  AppSettings,
  Brand,
  Customer,
  Expense,
  NoonOrder,
  Partner,
  Employee,
  Payment,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  SerialItem,
  Supplier,
  TreasuryTransaction,
} from "../types";

export const STORAGE_KEY = "one-erp-state-v1";

export const defaultSettings: AppSettings = {
  companyName: "ONE",
  companyPhone: "01000000000",
  companyAddress: "القاهرة، مصر",
  currency: "EGP",
  taxRate: 0,
  invoicePrefix: "INV",
  purchasePrefix: "PUR",
  lastSaleInvoiceNum: 1018,
  lastPurchaseInvoiceNum: 1008,
};

export const defaultBrands: Brand[] = [
  { id: "b1", name: "Apple", createdAt: iso(20) },
  { id: "b2", name: "Samsung", createdAt: iso(20) },
  { id: "b3", name: "Xiaomi", createdAt: iso(20) },
  { id: "b4", name: "DJI", createdAt: iso(18) },
  { id: "b5", name: "Ray-Ban", createdAt: iso(18) },
  { id: "b6", name: "AirPods", createdAt: iso(16) },
  { id: "b7", name: "Insta360", createdAt: iso(16) },
  { id: "b8", name: "Anker", createdAt: iso(14) },
  { id: "b9", name: "Others", createdAt: iso(14) },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function utcTodayParts() {
  const d = new Date();
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}

/** Stable calendar date relative to today (UTC noon — identical on server and client). */
export function iso(daysAgo: number): string {
  const { y, m, day } = utcTodayParts();
  const d = new Date(Date.UTC(y, m, day, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isoTime(daysAgo: number, hour = 11): string {
  const { y, m, day } = utcTodayParts();
  const d = new Date(Date.UTC(y, m, day, hour, 0, 0));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

export function hydrateState(raw: Partial<AppState>): AppState {
  const base = generateDemoData();
  return {
    ...base,
    ...raw,
    products: raw.products ?? base.products,
    serials: raw.serials ?? base.serials,
    customers: raw.customers ?? base.customers,
    suppliers: raw.suppliers ?? base.suppliers,
    saleInvoices: raw.saleInvoices ?? base.saleInvoices,
    purchaseInvoices: raw.purchaseInvoices ?? base.purchaseInvoices,
    payments: raw.payments ?? base.payments,
    expenses: raw.expenses ?? base.expenses,
    treasuryTransactions: raw.treasuryTransactions ?? base.treasuryTransactions,
    noonOrders: raw.noonOrders ?? base.noonOrders,
    dailyClosings: raw.dailyClosings ?? [],
    dailyJournals: raw.dailyJournals ?? [],
    brands: raw.brands?.length ? raw.brands : base.brands,
    partners: raw.partners ?? base.partners,
    employees: raw.employees ?? base.employees,
    profitDistributions: raw.profitDistributions ?? [],
    weeklyInventoryCounts: raw.weeklyInventoryCounts ?? [],
    stockTransfers: raw.stockTransfers ?? [],
    dailyOperations: raw.dailyOperations ?? [],
    dailyInventoryScans: raw.dailyInventoryScans ?? [],
    cashBalance: raw.cashBalance ?? base.cashBalance,
    bankBalance: raw.bankBalance ?? base.bankBalance,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
  };
}

export function generateDemoData(): AppState {
  const products: Product[] = [
    { id: "p1", name: "iPhone 15 Pro Max 256GB Natural", sku: "IP15PM-256-NT", upc: "195949035951", category: "phones", brand: "Apple", productType: "serial", costPrice: 45000, salePrice: 52000, stock: 4, minStock: 2, location: "store", createdAt: isoTime(30), updatedAt: isoTime(2) },
    { id: "p2", name: "iPad Pro 11 M4 256GB WiFi", sku: "IPADPRO11-256", upc: "195949078279", category: "tablets", brand: "Apple", productType: "serial", costPrice: 35000, salePrice: 42000, stock: 2, minStock: 1, location: "warehouse", createdAt: isoTime(28), updatedAt: isoTime(4) },
    { id: "p3", name: "MacBook Air M3 13 256GB", sku: "MBA-M3-256", upc: "195949056147", category: "laptops", brand: "Apple", productType: "serial", costPrice: 55000, salePrice: 65000, stock: 1, minStock: 1, location: "store", createdAt: isoTime(25), updatedAt: isoTime(6) },
    { id: "p4", name: "AirPods Pro 2 USB-C", sku: "APP2-USB", upc: "195949077813", category: "accessories", brand: "Apple", productType: "serial", costPrice: 8000, salePrice: 10500, stock: 6, minStock: 3, location: "store", createdAt: isoTime(22), updatedAt: isoTime(1) },
    { id: "p5", name: "Samsung Galaxy S24 Ultra 256GB", sku: "SGS24U-256", upc: "8806095194585", category: "phones", brand: "Samsung", productType: "serial", costPrice: 38000, salePrice: 45000, stock: 3, minStock: 2, location: "store", createdAt: isoTime(20), updatedAt: isoTime(3) },
    { id: "p6", name: "iPhone 15 128GB Black", sku: "IP15-128-BK", upc: "195949034862", category: "phones", brand: "Apple", productType: "serial", costPrice: 32000, salePrice: 38000, stock: 5, minStock: 2, location: "warehouse", createdAt: isoTime(18), updatedAt: isoTime(2) },
    { id: "p7", name: "iPad Air M2 11 256GB", sku: "IPADAIR-M2-256", upc: "195949052613", category: "tablets", brand: "Apple", productType: "serial", costPrice: 28000, salePrice: 34000, stock: 3, minStock: 1, location: "store", createdAt: isoTime(16), updatedAt: isoTime(5) },
    { id: "p8", name: "Apple Watch Series 9 45mm", sku: "AWS9-45", upc: "194253921660", category: "accessories", brand: "Apple", productType: "serial", costPrice: 12000, salePrice: 15000, stock: 4, minStock: 2, location: "store", createdAt: isoTime(14), updatedAt: isoTime(1) },
    { id: "p9", name: "Anker 737 Power Bank 140W", sku: "ANK-737", upc: "194644128001", category: "accessories", brand: "Anker", productType: "normal", costPrice: 2200, salePrice: 3200, stock: 18, minStock: 6, location: "warehouse", createdAt: isoTime(12), updatedAt: isoTime(0) },
    { id: "p10", name: "كيبل USB-C سريع 2م", sku: "CBL-USBC-2M", upc: "010000000001", category: "accessories", brand: "Others", productType: "normal", costPrice: 80, salePrice: 180, stock: 1, minStock: 10, location: "store", createdAt: isoTime(10), updatedAt: isoTime(0) },
    { id: "p11", name: "Xiaomi Redmi Note 13 Pro", sku: "RN13P-256", upc: "6934177770001", category: "phones", brand: "Xiaomi", productType: "serial", costPrice: 10500, salePrice: 12900, stock: 0, minStock: 3, location: "store", createdAt: isoTime(9), updatedAt: isoTime(1) },
    { id: "p12", name: "DJI Osmo Pocket 3", sku: "DJI-OP3", upc: "694156595001", category: "other", brand: "DJI", productType: "serial", costPrice: 18500, salePrice: 22900, stock: 2, minStock: 1, location: "warehouse", createdAt: isoTime(8), updatedAt: isoTime(2) },
  ];

  const serials: SerialItem[] = [
    { id: "s1", productId: "p1", productName: products[0].name, serial: "F2LXQ7H2QP", imei1: "352938113456789", imei2: "352938113456790", status: "available", costPrice: 45000, location: "store", createdAt: isoTime(20) },
    { id: "s2", productId: "p1", productName: products[0].name, serial: "F3KYR8I3RQ", imei1: "352938113456791", imei2: "352938113456792", status: "available", costPrice: 45000, location: "store", createdAt: isoTime(20) },
    { id: "s3", productId: "p1", productName: products[0].name, serial: "F4MZS9J4SR", imei1: "352938113456793", imei2: "352938113456794", status: "sold", saleInvoiceId: "si1", salePrice: 52000, costPrice: 45000, location: "store", createdAt: isoTime(18) },
    { id: "s4", productId: "p2", productName: products[1].name, serial: "DLXC4R9H2G", status: "available", costPrice: 35000, location: "warehouse", createdAt: isoTime(16) },
    { id: "s5", productId: "p3", productName: products[2].name, serial: "C02ZC1L4MD6M", status: "available", costPrice: 55000, location: "store", createdAt: isoTime(15) },
    { id: "s6", productId: "p4", productName: products[3].name, serial: "H6QT2VLXP5", status: "available", costPrice: 8000, location: "store", createdAt: isoTime(12) },
    { id: "s7", productId: "p5", productName: products[4].name, serial: "R58NC0YX3KL", imei1: "358491234567890", status: "sold", saleInvoiceId: "si2", salePrice: 45000, costPrice: 38000, createdAt: isoTime(10) },
    { id: "s8", productId: "p6", productName: products[5].name, serial: "DN8K2P1Q0A", imei1: "353112223334445", status: "sold", saleInvoiceId: "si3", salePrice: 38000, costPrice: 32000, createdAt: isoTime(8) },
    { id: "s9", productId: "p6", productName: products[5].name, serial: "DN9L3Q2R1B", imei1: "353112223334446", status: "available", costPrice: 32000, location: "warehouse", createdAt: isoTime(8) },
    { id: "s10", productId: "p8", productName: products[7].name, serial: "G7AW9X2K11", status: "sold", saleInvoiceId: "si4", salePrice: 15000, costPrice: 12000, location: "store", createdAt: isoTime(6) },
    { id: "s11", productId: "p12", productName: products[11].name, serial: "OP3-88A21C", status: "available", costPrice: 18500, location: "warehouse", createdAt: isoTime(5) },
    { id: "s12", productId: "p1", productName: products[0].name, serial: "F9PENDING01", imei1: "352938119999001", status: "available", costPrice: 0, purchasePricePending: true, location: "store", createdAt: isoTime(1) },
    { id: "s13", productId: "p4", productName: products[3].name, serial: "H7RU3WMYQ8", status: "sold", saleInvoiceId: "si5", salePrice: 10500, costPrice: 8000, createdAt: isoTime(3) },
    { id: "s14", productId: "p7", productName: products[6].name, serial: "AIRM2-4410K", status: "available", costPrice: 28000, location: "store", createdAt: isoTime(4) },
  ];

  const customers: Customer[] = [
    { id: "c1", name: "أحمد محمد علي", phone: "01012345678", type: "individual", openingBalance: 0, totalInvoices: 52000, totalPaid: 52000, createdAt: isoTime(40), notes: "عميل تجزئة منتظم" },
    { id: "c2", name: "شركة الفجر للتقنية", phone: "01098765432", email: "fajr@example.com", type: "company", openingBalance: 0, totalInvoices: 107000, totalPaid: 65000, createdAt: isoTime(35) },
    { id: "c3", name: "محل نوفل موبايل", phone: "01155667788", type: "wholesale", openingBalance: 5000, totalInvoices: 76000, totalPaid: 38000, createdAt: isoTime(30) },
    { id: "c4", name: "سارة حسن", phone: "01233445566", type: "individual", openingBalance: 0, totalInvoices: 10500, totalPaid: 10500, createdAt: isoTime(12) },
    { id: "c5", name: "تاجر العتبة — كريم", phone: "01066778899", type: "trader", openingBalance: 0, totalInvoices: 45000, totalPaid: 20000, createdAt: isoTime(20) },
    { id: "c6", name: "منى عبد الرحمن", phone: "01122334455", type: "individual", openingBalance: 0, totalInvoices: 3200, totalPaid: 3200, createdAt: isoTime(4) },
  ];

  const suppliers: Supplier[] = [
    { id: "sup1", name: "الموزع المعتمد Apple", phone: "01011223344", type: "supplier", openingBalance: 0, totalInvoices: 188000, totalPaid: 138000, createdAt: isoTime(50) },
    { id: "sup2", name: "تاجر إلكترونيات الجملة", phone: "01099887766", type: "both", openingBalance: 10000, totalInvoices: 44000, totalPaid: 44000, createdAt: isoTime(45) },
    { id: "sup3", name: "Samsung الشرق الأوسط", phone: "01055443322", type: "supplier", openingBalance: 0, totalInvoices: 76000, totalPaid: 76000, createdAt: isoTime(40) },
    { id: "sup4", name: "أنكر مصر", phone: "01044556677", type: "supplier", openingBalance: 0, totalInvoices: 19800, totalPaid: 10000, createdAt: isoTime(15) },
  ];

  const saleInvoices: SaleInvoice[] = [
    {
      id: "si1", invoiceNumber: "INV-1001", customerId: "c1", customerName: "أحمد محمد علي", date: iso(6),
      items: [{ id: "si1i1", productId: "p1", productName: products[0].name, sku: "IP15PM-256-NT", quantity: 1, unitPrice: 52000, discount: 0, discountType: "fixed", taxRate: 0, total: 52000, serials: [{ serial: "F4MZS9J4SR", imei1: "352938113456793" }], costPrice: 45000 }],
      subtotal: 52000, taxTotal: 0, discount: 0, total: 52000, paid: 52000, remaining: 0, status: "paid", paymentMethod: "cash", createdAt: isoTime(6, 13),
    },
    {
      id: "si2", invoiceNumber: "INV-1002", customerId: "c2", customerName: "شركة الفجر للتقنية", date: iso(5),
      items: [{ id: "si2i1", productId: "p5", productName: products[4].name, sku: "SGS24U-256", quantity: 1, unitPrice: 45000, discount: 0, discountType: "fixed", taxRate: 0, total: 45000, serials: [{ serial: "R58NC0YX3KL" }], costPrice: 38000 }],
      subtotal: 45000, taxTotal: 0, discount: 0, total: 45000, paid: 25000, remaining: 20000, status: "partial", paymentMethod: "bank", createdAt: isoTime(5, 15),
    },
    {
      id: "si3", invoiceNumber: "INV-1003", customerId: "c3", customerName: "محل نوفل موبايل", date: iso(4),
      items: [{ id: "si3i1", productId: "p6", productName: products[5].name, sku: "IP15-128-BK", quantity: 1, unitPrice: 38000, discount: 0, discountType: "fixed", taxRate: 0, total: 38000, serials: [{ serial: "DN8K2P1Q0A" }], costPrice: 32000 }],
      subtotal: 38000, taxTotal: 0, discount: 0, total: 38000, paid: 0, remaining: 38000, status: "unpaid", paymentMethod: "credit", createdAt: isoTime(4, 16),
    },
    {
      id: "si4", invoiceNumber: "INV-1004", customerId: "c2", customerName: "شركة الفجر للتقنية", date: iso(3),
      items: [
        { id: "si4i1", productId: "p9", productName: products[8].name, sku: "ANK-737", quantity: 4, unitPrice: 3200, discount: 0, discountType: "fixed", taxRate: 0, total: 12800, costPrice: 2200 },
        { id: "si4i2", productId: "p8", productName: products[7].name, sku: "AWS9-45", quantity: 1, unitPrice: 15000, discount: 0, discountType: "fixed", taxRate: 0, total: 15000, serials: [{ serial: "G7AW9X2K11" }], costPrice: 12000 },
      ],
      subtotal: 27800, taxTotal: 0, discount: 0, total: 27800, paid: 27800, remaining: 0, status: "paid", paymentMethod: "instapay", instapayPerson: "محمد", createdAt: isoTime(3, 12),
    },
    {
      id: "si5", invoiceNumber: "INV-1005", customerId: "c4", customerName: "سارة حسن", date: iso(2),
      items: [{ id: "si5i1", productId: "p4", productName: products[3].name, sku: "APP2-USB", quantity: 1, unitPrice: 10500, discount: 0, discountType: "fixed", taxRate: 0, total: 10500, serials: [{ serial: "H7RU3WMYQ8" }], costPrice: 8000 }],
      subtotal: 10500, taxTotal: 0, discount: 0, total: 10500, paid: 10500, remaining: 0, status: "paid", paymentMethod: "cash", createdAt: isoTime(2, 17),
    },
    {
      id: "si6", invoiceNumber: "INV-1006", customerId: "c5", customerName: "تاجر العتبة — كريم", date: iso(1),
      items: [{ id: "si6i1", productId: "p5", productName: products[4].name, sku: "SGS24U-256", quantity: 1, unitPrice: 45000, discount: 0, discountType: "fixed", taxRate: 0, total: 45000, costPrice: 38000 }],
      subtotal: 45000, taxTotal: 0, discount: 0, total: 45000, paid: 20000, remaining: 25000, status: "partial", paymentMethod: "cash", createdAt: isoTime(1, 14),
    },
    {
      id: "si7", invoiceNumber: "INV-1007", customerId: "c6", customerName: "منى عبد الرحمن", date: iso(0),
      items: [
        { id: "si7i1", productId: "p9", productName: products[8].name, sku: "ANK-737", quantity: 1, unitPrice: 3200, discount: 0, discountType: "fixed", taxRate: 0, total: 3200, costPrice: 2200 },
      ],
      subtotal: 3200, taxTotal: 0, discount: 0, total: 3200, paid: 3200, remaining: 0, status: "paid", paymentMethod: "cash", createdAt: isoTime(0, 10),
    },
    {
      id: "si8", invoiceNumber: "INV-1008", customerId: "c3", customerName: "محل نوفل موبايل", date: iso(0),
      items: [{ id: "si8i1", productId: "p6", productName: products[5].name, sku: "IP15-128-BK", quantity: 1, unitPrice: 38000, discount: 0, discountType: "fixed", taxRate: 0, total: 38000, costPrice: 32000 }],
      subtotal: 38000, taxTotal: 0, discount: 0, total: 38000, paid: 38000, remaining: 0, status: "paid", paymentMethod: "bank", createdAt: isoTime(0, 11),
    },
  ];

  const purchaseInvoices: PurchaseInvoice[] = [
    {
      id: "pi1", invoiceNumber: "PUR-1001", supplierId: "sup1", supplierName: "الموزع المعتمد Apple", date: iso(12),
      items: [
        { id: "pi1i1", productId: "p1", productName: products[0].name, sku: "IP15PM-256-NT", quantity: 3, unitPrice: 45000, discount: 0, discountType: "fixed", taxRate: 0, total: 135000, costPrice: 45000 },
        { id: "pi1i2", productId: "p3", productName: products[2].name, sku: "MBA-M3-256", quantity: 1, unitPrice: 55000, discount: 0, discountType: "fixed", taxRate: 0, total: 55000, costPrice: 55000 },
      ],
      subtotal: 190000, taxTotal: 0, discount: 2000, total: 188000, paid: 138000, remaining: 50000, status: "partial", paymentMethod: "bank", createdAt: isoTime(12, 9),
    },
    {
      id: "pi2", invoiceNumber: "PUR-1002", supplierId: "sup3", supplierName: "Samsung الشرق الأوسط", date: iso(9),
      items: [{ id: "pi2i1", productId: "p5", productName: products[4].name, sku: "SGS24U-256", quantity: 2, unitPrice: 38000, discount: 0, discountType: "fixed", taxRate: 0, total: 76000, costPrice: 38000 }],
      subtotal: 76000, taxTotal: 0, discount: 0, total: 76000, paid: 76000, remaining: 0, status: "paid", paymentMethod: "bank", createdAt: isoTime(9, 10),
    },
    {
      id: "pi3", invoiceNumber: "PUR-1003", supplierId: "sup4", supplierName: "أنكر مصر", date: iso(7),
      items: [{ id: "pi3i1", productId: "p9", productName: products[8].name, sku: "ANK-737", quantity: 9, unitPrice: 2200, discount: 0, discountType: "fixed", taxRate: 0, total: 19800, costPrice: 2200 }],
      subtotal: 19800, taxTotal: 0, discount: 0, total: 19800, paid: 10000, remaining: 9800, status: "partial", paymentMethod: "cash", createdAt: isoTime(7, 11),
    },
    {
      id: "pi4", invoiceNumber: "PUR-1004", supplierId: "sup2", supplierName: "تاجر إلكترونيات الجملة", date: iso(2),
      items: [{ id: "pi4i1", productId: "p10", productName: products[9].name, sku: "CBL-USBC-2M", quantity: 40, unitPrice: 80, discount: 0, discountType: "fixed", taxRate: 0, total: 3200, costPrice: 80 }],
      subtotal: 3200, taxTotal: 0, discount: 0, total: 3200, paid: 3200, remaining: 0, status: "paid", paymentMethod: "cash", createdAt: isoTime(2, 9),
    },
  ];

  const payments: Payment[] = [
    { id: "paid_si1", type: "sale", referenceId: "c1", referenceName: "أحمد محمد علي", amount: 52000, paymentMethod: "cash", direction: "in", date: iso(6), notes: "دفعة مع فاتورة INV-1001", createdAt: isoTime(6, 13) },
    { id: "paid_si2", type: "sale", referenceId: "c2", referenceName: "شركة الفجر للتقنية", amount: 25000, paymentMethod: "bank", direction: "in", date: iso(5), notes: "دفعة مع فاتورة INV-1002", createdAt: isoTime(5, 15) },
    { id: "paid_si4", type: "sale", referenceId: "c2", referenceName: "شركة الفجر للتقنية", amount: 27800, paymentMethod: "instapay", direction: "in", date: iso(3), notes: "دفعة مع فاتورة INV-1004", createdAt: isoTime(3, 12) },
    { id: "paid_si5", type: "sale", referenceId: "c4", referenceName: "سارة حسن", amount: 10500, paymentMethod: "cash", direction: "in", date: iso(2), notes: "دفعة مع فاتورة INV-1005", createdAt: isoTime(2, 17) },
    { id: "paid_si6", type: "sale", referenceId: "c5", referenceName: "تاجر العتبة — كريم", amount: 20000, paymentMethod: "cash", direction: "in", date: iso(1), notes: "دفعة مع فاتورة INV-1006", createdAt: isoTime(1, 14) },
    { id: "paid_si7", type: "sale", referenceId: "c6", referenceName: "منى عبد الرحمن", amount: 3200, paymentMethod: "cash", direction: "in", date: iso(0), notes: "دفعة مع فاتورة INV-1007", createdAt: isoTime(0, 10) },
    { id: "paid_si8", type: "sale", referenceId: "c3", referenceName: "محل نوفل موبايل", amount: 38000, paymentMethod: "bank", direction: "in", date: iso(0), notes: "دفعة مع فاتورة INV-1008", createdAt: isoTime(0, 11) },
    { id: "paid_pi1", type: "purchase", referenceId: "sup1", referenceName: "الموزع المعتمد Apple", amount: 138000, paymentMethod: "bank", direction: "out", date: iso(12), notes: "دفعة مع فاتورة PUR-1001", createdAt: isoTime(12, 9) },
    { id: "paid_pi2", type: "purchase", referenceId: "sup3", referenceName: "Samsung الشرق الأوسط", amount: 76000, paymentMethod: "bank", direction: "out", date: iso(9), notes: "دفعة مع فاتورة PUR-1002", createdAt: isoTime(9, 10) },
    { id: "paid_pi3", type: "purchase", referenceId: "sup4", referenceName: "أنكر مصر", amount: 10000, paymentMethod: "cash", direction: "out", date: iso(7), notes: "دفعة مع فاتورة PUR-1003", createdAt: isoTime(7, 11) },
    { id: "paid_pi4", type: "purchase", referenceId: "sup2", referenceName: "تاجر إلكترونيات الجملة", amount: 3200, paymentMethod: "cash", direction: "out", date: iso(2), notes: "دفعة مع فاتورة PUR-1004", createdAt: isoTime(2, 9) },
  ];

  const expenses: Expense[] = [
    { id: "e1", description: "إيجار المحل", amount: 12000, paymentMethod: "bank", category: "إيجار", date: iso(8), createdAt: isoTime(8, 9) },
    { id: "e2", description: "إعلانات فيسبوك", amount: 2500, paymentMethod: "instapay", category: "تسويق", date: iso(4), createdAt: isoTime(4, 18) },
    { id: "e3", description: "كهرباء واتصالات", amount: 1800, paymentMethod: "cash", category: "مرافق", date: iso(3), createdAt: isoTime(3, 10) },
    { id: "e4", description: "بدل انتقال مندوب", amount: 600, paymentMethod: "cash", category: "تشغيل", date: iso(0), createdAt: isoTime(0, 9) },
  ];

  const treasuryTransactions: TreasuryTransaction[] = [
    { id: "tr1", type: "sale", description: "فاتورة مبيعات INV-1001 - أحمد محمد علي", amount: 52000, treasury: "cash", direction: "in", referenceId: "si1", date: iso(6), createdAt: isoTime(6, 13) },
    { id: "tr2", type: "sale", description: "فاتورة مبيعات INV-1002 - شركة الفجر", amount: 25000, treasury: "bank", direction: "in", referenceId: "si2", date: iso(5), createdAt: isoTime(5, 15) },
    { id: "tr3", type: "expense", description: "إيجار المحل", amount: 12000, treasury: "bank", direction: "out", referenceId: "e1", date: iso(8), createdAt: isoTime(8, 9) },
    { id: "tr4", type: "purchase", description: "فاتورة مشتريات PUR-1002", amount: 76000, treasury: "bank", direction: "out", referenceId: "pi2", date: iso(9), createdAt: isoTime(9, 10) },
    { id: "tr5", type: "sale", description: "فاتورة مبيعات INV-1007 - منى عبد الرحمن", amount: 3200, treasury: "cash", direction: "in", referenceId: "si7", date: iso(0), createdAt: isoTime(0, 10) },
    { id: "tr6", type: "sale", description: "فاتورة مبيعات INV-1008 - نوفل موبايل", amount: 38000, treasury: "bank", direction: "in", referenceId: "si8", date: iso(0), createdAt: isoTime(0, 11) },
    { id: "tr7", type: "expense", description: "بدل انتقال مندوب", amount: 600, treasury: "cash", direction: "out", referenceId: "e4", date: iso(0), createdAt: isoTime(0, 9) },
  ];

  const noonOrders: NoonOrder[] = [
    {
      id: "n1", orderNumber: "N-88421", shipmentNumber: "SH-10021", platform: "noon", customerName: "عميل نون", date: iso(5),
      items: [{ productId: "p4", productName: products[3].name, serial: "H6QT2VLXP5", price: 9900, costPrice: 8000 }],
      status: "shipped", createdAt: isoTime(5, 8),
    },
    {
      id: "n2", orderNumber: "N-88502", shipmentNumber: "SH-10088", platform: "noon", customerName: "عميل نون", date: iso(3),
      items: [{ productId: "p8", productName: products[7].name, price: 14200, costPrice: 12000 }],
      status: "delivered", createdAt: isoTime(3, 9),
    },
    {
      id: "n3", orderNumber: "A-12011", platform: "amazon", customerName: "عميل أمازون", date: iso(8),
      items: [{ productId: "p9", productName: products[8].name, price: 3100, costPrice: 2200 }],
      status: "settled", settledAmount: 2850, settledDate: iso(2), settlementProfit: 650, createdAt: isoTime(8, 11),
    },
    {
      id: "n4", orderNumber: "N-88640", platform: "noon", date: iso(1),
      items: [{ productId: "p6", productName: products[5].name, price: 36500, costPrice: 32000 }],
      status: "pending", createdAt: isoTime(1, 19),
    },
  ];

  const employees: Employee[] = [];

  const partners: Partner[] = [
    { id: "pt1", name: "الشريك الأول", capitalAmount: 400000, isActive: true, createdAt: isoTime(60), updatedAt: isoTime(10) },
    { id: "pt2", name: "الشريك الثاني", capitalAmount: 250000, isActive: true, createdAt: isoTime(60), updatedAt: isoTime(10) },
  ];

  return {
    products,
    serials,
    customers,
    suppliers,
    saleInvoices,
    purchaseInvoices,
    payments,
    expenses,
    treasuryTransactions,
    noonOrders,
    dailyClosings: [],
    dailyJournals: [
      {
        id: iso(1),
        date: iso(1),
        openingBalance: 82000,
        inEntries: [{ id: "j1in", label: "مبيعات نقدية", amount: 20000 }],
        outEntries: [{ id: "j1out", label: "مصروفات تشغيل", amount: 600 }],
        actualBalance: 101400,
        actualBalanceBank: 176000,
        closingTime: "23:40",
        closingNote: "تم التقفيل بدون فروقات",
        updatedAt: isoTime(1, 23),
      },
    ],
    brands: defaultBrands,
    partners,
    employees,
    profitDistributions: [],
    weeklyInventoryCounts: [],
    stockTransfers: [],
    dailyOperations: [],
    dailyInventoryScans: [],
    cashBalance: 87500,
    bankBalance: 214000,
    settings: defaultSettings,
  };
}
