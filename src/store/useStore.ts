import { useState, useEffect, useCallback } from 'react';
import { AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice, Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing, SerialItem, Brand, AppSettings } from '../types';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';

const STORAGE_KEY = 'one_erp_data';

// ==================== Helper Functions ====================
const cleanForFirebase = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanForFirebase);
  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanForFirebase(val);
      }
    });
    return cleaned;
  }
  return obj;
};

const saveToFirebase = async (collectionName: string, id: string, data: any) => {
  try {
    await setDoc(doc(db, collectionName, id), cleanForFirebase(data));
  } catch (error) {
    console.error(`Error saving to ${collectionName}:`, error);
  }
};

const deleteFromFirebase = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`Error deleting from ${collectionName}:`, error);
  }
};

// ==================== Default Data ====================
const defaultSettings: AppSettings = {
  companyName: 'ONE',
  companyPhone: '',
  companyAddress: '',
  currency: 'EGP',
  taxRate: 0,
  invoicePrefix: 'INV',
  purchasePrefix: 'PUR',
  lastSaleInvoiceNum: 1000,
  lastPurchaseInvoiceNum: 1000,
};

const defaultBrands: Brand[] = [
  { id: 'b1', name: 'Apple', createdAt: new Date().toISOString() },
  { id: 'b2', name: 'Samsung', createdAt: new Date().toISOString() },
  { id: 'b3', name: 'Xiaomi', createdAt: new Date().toISOString() },
  { id: 'b4', name: 'DJI', createdAt: new Date().toISOString() },
  { id: 'b5', name: 'RAY-BAN', createdAt: new Date().toISOString() },
  { id: 'b6', name: 'AirPods', createdAt: new Date().toISOString() },
  { id: 'b7', name: 'Insta360', createdAt: new Date().toISOString() },
  { id: 'b8', name: 'Magic Keyboard', createdAt: new Date().toISOString() },
  { id: 'b9', name: 'Others', createdAt: new Date().toISOString() },
];

const generateDemoData = (): AppState => {
  const now = new Date().toISOString();
  const products: Product[] = [
    { id: 'p1', name: 'iPhone 15 Pro Max 256GB Natural', sku: 'IP15PM-256-NT', upc: '195949035951', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: 45000, salePrice: 52000, stock: 5, createdAt: now, updatedAt: now },
    { id: 'p2', name: 'iPad Pro 11 M4 256GB WiFi', sku: 'IPADPRO11-256', upc: '195949078279', category: 'tablets', brand: 'Apple', productType: 'serial', costPrice: 35000, salePrice: 42000, stock: 3, createdAt: now, updatedAt: now },
    { id: 'p3', name: 'MacBook Air M3 13 256GB', sku: 'MBA-M3-256', upc: '195949056147', category: 'laptops', brand: 'Apple', productType: 'serial', costPrice: 55000, salePrice: 65000, stock: 2, createdAt: now, updatedAt: now },
    { id: 'p4', name: 'AirPods Pro 2nd Gen', sku: 'APP2-USB', upc: '195949077813', category: 'accessories', brand: 'Apple', productType: 'serial', costPrice: 8000, salePrice: 10500, stock: 8, createdAt: now, updatedAt: now },
    { id: 'p5', name: 'Samsung Galaxy S24 Ultra 256GB', sku: 'SGS24U-256', upc: '8806095194585', category: 'phones', brand: 'Samsung', productType: 'serial', costPrice: 38000, salePrice: 45000, stock: 4, createdAt: now, updatedAt: now },
    { id: 'p6', name: 'iPhone 15 128GB Black', sku: 'IP15-128-BK', upc: '195949034862', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: 32000, salePrice: 38000, stock: 6, createdAt: now, updatedAt: now },
    { id: 'p7', name: 'iPad Air M2 11 256GB', sku: 'IPADAIR-M2-256', upc: '195949052613', category: 'tablets', brand: 'Apple', productType: 'serial', costPrice: 28000, salePrice: 34000, stock: 4, createdAt: now, updatedAt: now },
    { id: 'p8', name: 'Apple Watch Series 9 45mm', sku: 'AWS9-45', upc: '194253921660', category: 'accessories', brand: 'Apple', productType: 'serial', costPrice: 12000, salePrice: 15000, stock: 5, createdAt: now, updatedAt: now },
  ];

  const serials: SerialItem[] = [
    { id: 's1', productId: 'p1', productName: 'iPhone 15 Pro Max 256GB Natural', serial: 'F2LXQ7H2QP', imei1: '352938113456789', imei2: '352938113456790', status: 'available', costPrice: 45000, createdAt: now },
    { id: 's2', productId: 'p1', productName: 'iPhone 15 Pro Max 256GB Natural', serial: 'F3KYR8I3RQ', imei1: '352938113456791', imei2: '352938113456792', status: 'available', costPrice: 45000, createdAt: now },
    { id: 's3', productId: 'p2', productName: 'iPad Pro 11 M4 256GB WiFi', serial: 'DLXC4R9H2G', status: 'available', costPrice: 35000, createdAt: now },
    { id: 's4', productId: 'p3', productName: 'MacBook Air M3 13 256GB', serial: 'C02ZC1L4MD6M', status: 'available', costPrice: 55000, createdAt: now },
    { id: 's5', productId: 'p4', productName: 'AirPods Pro 2nd Gen', serial: 'H6QT2VLXP5', status: 'available', costPrice: 8000, createdAt: now },
    { id: 's6', productId: 'p5', productName: 'Samsung Galaxy S24 Ultra 256GB', serial: 'R58NC0YX3KL', imei1: '358491234567890', status: 'available', costPrice: 38000, createdAt: now },
  ];

  const customers: Customer[] = [
    { id: 'c1', name: 'أحمد محمد علي', phone: '01012345678', type: 'individual', openingBalance: 0, totalInvoices: 52000, totalPaid: 52000, createdAt: now },
    { id: 'c2', name: 'شركة الفجر للتقنية', phone: '01098765432', type: 'company', openingBalance: 0, totalInvoices: 120000, totalPaid: 80000, createdAt: now },
    { id: 'c3', name: 'محل نوفل موبايل', phone: '01155667788', type: 'wholesale', openingBalance: 5000, totalInvoices: 85000, totalPaid: 60000, createdAt: now },
  ];

  const suppliers: Supplier[] = [
    { id: 'sup1', name: 'الموزع المعتمد Apple', phone: '01011223344', type: 'supplier', openingBalance: 0, totalInvoices: 500000, totalPaid: 450000, createdAt: now },
    { id: 'sup2', name: 'تاجر إلكترونيات الجملة', phone: '01099887766', type: 'both', openingBalance: 10000, totalInvoices: 200000, totalPaid: 180000, createdAt: now },
    { id: 'sup3', name: 'Samsung الشرق الأوسط', phone: '01055443322', type: 'supplier', openingBalance: 0, totalInvoices: 150000, totalPaid: 150000, createdAt: now },
  ];

  return {
    products, serials, customers, suppliers,
    saleInvoices: [], purchaseInvoices: [], payments: [],
    expenses: [], treasuryTransactions: [], noonOrders: [],
    dailyClosings: [], brands: defaultBrands,
    cashBalance: 25000, bankBalance: 150000, settings: defaultSettings,
  };
};

// ==================== useStore Hook ====================
export function useStore() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...generateDemoData(), ...parsed };
      }
    } catch { }
    return generateDemoData();
  });

  const [isLoading, setIsLoading] = useState(true);

  // 🔥 Load data from Firebase, merge with localStorage (keep the newest version)
  useEffect(() => {
    const loadDataFromFirebase = async () => {
      try {
        setIsLoading(true);
        const [
          productsSnap, serialsSnap, customersSnap, suppliersSnap,
          saleInvoicesSnap, purchaseInvoicesSnap, paymentsSnap,
          expensesSnap, noonOrdersSnap, brandsSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'serials')),
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'suppliers')),
          getDocs(collection(db, 'saleInvoices')),
          getDocs(collection(db, 'purchaseInvoices')),
          getDocs(collection(db, 'payments')),
          getDocs(collection(db, 'expenses')),
          getDocs(collection(db, 'noonOrders')),
          getDocs(collection(db, 'brands')),
        ]);

        if (productsSnap.empty && customersSnap.empty && saleInvoicesSnap.empty) {
          console.log('Firebase is empty, keeping local data');
          setIsLoading(false);
          return;
        }

        // Helper to merge array by id, keep the one with newer updatedAt (or createdAt if missing)
        const mergeByNewest = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
          localArr: T[],
          fbArr: T[]
        ): T[] => {
          const map = new Map<string, T>();
          localArr.forEach(item => map.set(item.id, item));
          fbArr.forEach(item => {
            const existing = map.get(item.id);
            if (!existing) {
              map.set(item.id, item);
            } else {
              // Compare updatedAt if exists, else compare createdAt
              const localTime = existing.updatedAt || existing.createdAt || '0';
              const fbTime = item.updatedAt || item.createdAt || '0';
              if (fbTime > localTime) {
                map.set(item.id, item);
              }
              // else keep local
            }
          });
          return Array.from(map.values());
        };

        const fbProducts = productsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
        const fbSerials = serialsSnap.docs.map(d => ({ ...d.data(), id: d.id } as SerialItem));
        const fbCustomers = customersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Customer));
        const fbSuppliers = suppliersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Supplier));
        const fbSaleInvs = saleInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as SaleInvoice));
        const fbPurchaseInvs = purchaseInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as PurchaseInvoice));
        const fbPayments = paymentsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Payment));
        const fbExpenses = expensesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Expense));
        const fbNoonOrders = noonOrdersSnap.docs.map(d => ({ ...d.data(), id: d.id } as NoonOrder));
        const fbBrands = brandsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Brand));

        setState(prev => ({
          ...prev,
          products: mergeByNewest(prev.products, fbProducts),
          serials: mergeByNewest(prev.serials, fbSerials),
          customers: mergeByNewest(prev.customers, fbCustomers),
          suppliers: mergeByNewest(prev.suppliers, fbSuppliers),
          saleInvoices: mergeByNewest(prev.saleInvoices, fbSaleInvs),
          purchaseInvoices: mergeByNewest(prev.purchaseInvoices, fbPurchaseInvs),
          payments: mergeByNewest(prev.payments, fbPayments),
          expenses: mergeByNewest(prev.expenses, fbExpenses),
          noonOrders: mergeByNewest(prev.noonOrders, fbNoonOrders),
          brands: mergeByNewest(prev.brands, fbBrands),
        }));
        console.log('✅ Data loaded from Firebase and merged successfully');
      } catch (error) {
        console.error('Error loading from Firebase:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDataFromFirebase();
  }, []);

  // Save to localStorage as backup (always up to date)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { }
  }, [state]);

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  // Helper to set updatedAt on any object
  const touch = (obj: any) => ({ ...obj, updatedAt: new Date().toISOString() });

  // ==================== PRODUCTS ====================
  const addProduct = useCallback((product: Product) => {
    const newProduct = touch(product);
    setState(prev => ({ ...prev, products: [...prev.products, newProduct] }));
    saveToFirebase('products', newProduct.id, newProduct);
  }, []);

  const updateProduct = useCallback((product: Product) => {
    const updated = touch(product);
    setState(prev => ({ ...prev, products: prev.products.map(p => p.id === product.id ? updated : p) }));
    saveToFirebase('products', updated.id, updated);
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
    deleteFromFirebase('products', id);
  }, []);

  // ==================== SERIALS ====================
  const addSerial = useCallback((serial: SerialItem) => {
    const updated = touch(serial);
    setState(prev => ({ ...prev, serials: [...prev.serials, updated] }));
    saveToFirebase('serials', updated.id, updated);
  }, []);

  const updateSerial = useCallback((serial: SerialItem) => {
    const updated = touch(serial);
    setState(prev => ({ ...prev, serials: prev.serials.map(s => s.id === serial.id ? updated : s) }));
    saveToFirebase('serials', updated.id, updated);
  }, []);

  const addSerials = useCallback((newSerials: SerialItem[]) => {
    const touched = newSerials.map(s => touch(s));
    setState(prev => ({ ...prev, serials: [...prev.serials, ...touched] }));
    touched.forEach(s => saveToFirebase('serials', s.id, s));
  }, []);

  // ==================== CUSTOMERS ====================
  const addCustomer = useCallback((customer: Customer) => {
    const updated = touch(customer);
    setState(prev => ({ ...prev, customers: [...prev.customers, updated] }));
    saveToFirebase('customers', updated.id, updated);
  }, []);

  const updateCustomer = useCallback((customer: Customer) => {
    const updated = touch(customer);
    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === customer.id ? updated : c) }));
    saveToFirebase('customers', updated.id, updated);
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setState(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
    deleteFromFirebase('customers', id);
  }, []);

  // ==================== SUPPLIERS ====================
  const addSupplier = useCallback((supplier: Supplier) => {
    const updated = touch(supplier);
    setState(prev => ({ ...prev, suppliers: [...prev.suppliers, updated] }));
    saveToFirebase('suppliers', updated.id, updated);
  }, []);

  const updateSupplier = useCallback((supplier: Supplier) => {
    const updated = touch(supplier);
    setState(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === supplier.id ? updated : s) }));
    saveToFirebase('suppliers', updated.id, updated);
  }, []);

  const deleteSupplier = useCallback((id: string) => {
    setState(prev => ({ ...prev, suppliers: prev.suppliers.filter(s => s.id !== id) }));
    deleteFromFirebase('suppliers', id);
  }, []);

  // ==================== SALE INVOICES ====================
  const addSaleInvoice = useCallback((invoice: SaleInvoice) => {
    const touched = touch(invoice);
    setState(prev => {
      const newState = { ...prev, saleInvoices: [...prev.saleInvoices, touched] };
      let updatedCustomer: Customer | null = null;
      const updatedSerials: SerialItem[] = [];

      const custIdx = newState.customers.findIndex(c => c.id === invoice.customerId);
      if (custIdx >= 0) {
        const customer = { ...newState.customers[custIdx] };
        customer.totalInvoices = (customer.totalInvoices || 0) + invoice.total;
        customer.totalPaid = (customer.totalPaid || 0) + invoice.paid;
        newState.customers = newState.customers.map(c => c.id === invoice.customerId ? customer : c);
        updatedCustomer = customer;
      }

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance + invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance + invoice.paid : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: `tr_${Date.now()}`,
          type: 'sale',
          description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerName}`,
          amount: invoice.paid,
          treasury,
          direction: 'in',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
      }

      invoice.items.forEach(item => {
        if (item.serials && item.serials.length > 0) {
          item.serials.forEach(sl => {
            newState.serials = newState.serials.map(s => {
              if (s.serial === sl.serial) {
                const updated = { ...s, status: 'sold' as const, saleInvoiceId: invoice.id, salePrice: item.unitPrice };
                updatedSerials.push(updated);
                return updated;
              }
              return s;
            });
          });
        }
      });

      newState.settings = { ...newState.settings, lastSaleInvoiceNum: newState.settings.lastSaleInvoiceNum + 1 };

      saveToFirebase('saleInvoices', touched.id, touched);
      if (updatedCustomer) saveToFirebase('customers', updatedCustomer.id, updatedCustomer);
      updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));

      return newState;
    });
  }, []);

  const updateSaleInvoice = useCallback((invoice: SaleInvoice) => {
    const touched = touch(invoice);
    setState(prev => ({ ...prev, saleInvoices: prev.saleInvoices.map(i => i.id === invoice.id ? touched : i) }));
    saveToFirebase('saleInvoices', touched.id, touched);
  }, []);

  const deleteSaleInvoice = useCallback((invoiceId: string) => {
    setState(prev => {
      const invoice = prev.saleInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;
      const newState = { ...prev, saleInvoices: prev.saleInvoices.filter(i => i.id !== invoiceId) };

      const restoredSerials: SerialItem[] = [];
      invoice.items.forEach(item => {
        if (item.serials && item.serials.length > 0) {
          item.serials.forEach(sl => {
            newState.serials = newState.serials.map(s => {
              if (s.serial === sl.serial && s.saleInvoiceId === invoiceId) {
                const updated = { ...s, status: 'available' as const, saleInvoiceId: undefined, salePrice: undefined };
                restoredSerials.push(updated);
                return updated;
              }
              return s;
            });
          });
        }
      });

      let updatedCustomer: Customer | null = null;
      newState.customers = newState.customers.map((c): Customer => {
        if (c.id === invoice.customerId) {
          const updated: Customer = {
            ...c,
            totalInvoices: Math.max(0, (c.totalInvoices || 0) - invoice.total),
            totalPaid: Math.max(0, (c.totalPaid || 0) - invoice.paid),
          };
          updatedCustomer = updated;
          return updated;
        }
        return c;
      });

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
      }
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== invoiceId);

      deleteFromFirebase('saleInvoices', invoiceId);
      if (updatedCustomer !== null) {
        const c = updatedCustomer as Customer;
        saveToFirebase('customers', c.id, c);
      }
      restoredSerials.forEach(s => saveToFirebase('serials', s.id, s));

      return newState;
    });
  }, []);

  // ==================== PURCHASE INVOICES ====================
  const addPurchaseInvoice = useCallback((invoice: PurchaseInvoice) => {
    const touched = touch(invoice);
    setState(prev => {
      const newState = { ...prev, purchaseInvoices: [...prev.purchaseInvoices, touched] };
      let updatedSupplier: Supplier | null = null;
      const updatedProducts: Product[] = [];

      const supIdx = newState.suppliers.findIndex(s => s.id === invoice.supplierId);
      if (supIdx >= 0) {
        const supplier = { ...newState.suppliers[supIdx] };
        supplier.totalInvoices = (supplier.totalInvoices || 0) + invoice.total;
        supplier.totalPaid = (supplier.totalPaid || 0) + invoice.paid;
        newState.suppliers = newState.suppliers.map(s => s.id === invoice.supplierId ? supplier : s);
        updatedSupplier = supplier;
      }

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: `tr_${Date.now()}`,
          type: 'purchase',
          description: `فاتورة مشتريات ${invoice.invoiceNumber} - ${invoice.supplierName}`,
          amount: invoice.paid,
          treasury,
          direction: 'out',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
      }

      // ✅ فقط المنتجات العادية - المنتجات بسيريال مخزونها من عدد السيريالات
      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product && product.productType === 'normal') {
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: p.stock + item.quantity };
              updatedProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });

      newState.settings = {
        ...newState.settings,
        lastPurchaseInvoiceNum: newState.settings.lastPurchaseInvoiceNum + 1
      };

      saveToFirebase('purchaseInvoices', touched.id, touched);
      if (updatedSupplier) saveToFirebase('suppliers', updatedSupplier.id, updatedSupplier);
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));

      return newState;
    });
  }, []);

  const updatePurchaseInvoice = useCallback((invoice: PurchaseInvoice) => {
    const touched = touch(invoice);
    setState(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? touched : i) }));
    saveToFirebase('purchaseInvoices', touched.id, touched);
  }, []);

  const deletePurchaseInvoice = useCallback((invoiceId: string) => {
    setState(prev => {
      const invoice = prev.purchaseInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;
      const newState = { ...prev, purchaseInvoices: prev.purchaseInvoices.filter(i => i.id !== invoiceId) };

      const updatedProducts: Product[] = [];
      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product && product.productType === 'normal') {
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: Math.max(0, p.stock - item.quantity) };
              updatedProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });

      const removedSerialIds: string[] = [];
      newState.serials = newState.serials.filter(s => {
        if (s.purchaseInvoiceId === invoiceId && s.status === 'available') {
          removedSerialIds.push(s.id);
          return false;
        }
        return true;
      });

      let updatedSupplier: Supplier | null = null;
      newState.suppliers = newState.suppliers.map((s): Supplier => {
        if (s.id === invoice.supplierId) {
          const updated: Supplier = {
            ...s,
            totalInvoices: Math.max(0, (s.totalInvoices || 0) - invoice.total),
            totalPaid: Math.max(0, (s.totalPaid || 0) - invoice.paid),
          };
          updatedSupplier = updated;
          return updated;
        }
        return s;
      });

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance + invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance + invoice.paid : newState.bankBalance;
      }
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== invoiceId);

      deleteFromFirebase('purchaseInvoices', invoiceId);
      if (updatedSupplier !== null) {
        const s = updatedSupplier as Supplier;
        saveToFirebase('suppliers', s.id, s);
      }
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      removedSerialIds.forEach(id => deleteFromFirebase('serials', id));

      return newState;
    });
  }, []);

  // ==================== PAYMENTS (FIFO) ====================
  const addPayment = useCallback((payment: Payment) => {
    const touched = touch(payment);
    setState(prev => {
      const newState = { ...prev, payments: [...prev.payments, touched] };
      const treasury = payment.paymentMethod === 'cash' ? 'cash' : 'bank';
      let changedCustomer: Customer | null = null;
      let changedSupplier: Supplier | null = null;
      const changedSaleInvoices: SaleInvoice[] = [];
      const changedPurchaseInvoices: PurchaseInvoice[] = [];

      if (payment.direction === 'in') {
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance + payment.amount : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance + payment.amount : newState.bankBalance;
        if (payment.type === 'sale') {
          newState.customers = newState.customers.map(c => {
            if (c.id === payment.referenceId) {
              changedCustomer = { ...c, totalPaid: (c.totalPaid || 0) + payment.amount };
              return changedCustomer;
            }
            return c;
          });
          let remaining = payment.amount;
          const sortedInvoices = [...newState.saleInvoices]
            .filter(inv => inv.customerId === payment.referenceId && inv.remaining > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
          const updates = new Map<string, { paid: number; remaining: number; status: SaleInvoice['status'] }>();
          for (const inv of sortedInvoices) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, inv.remaining);
            const newPaid = inv.paid + applied;
            const newRemaining = inv.total - newPaid;
            updates.set(inv.id, { paid: newPaid, remaining: newRemaining, status: newRemaining <= 0 ? 'paid' : 'partial' });
            remaining -= applied;
          }
          if (updates.size > 0) {
            newState.saleInvoices = newState.saleInvoices.map(inv => {
              if (updates.has(inv.id)) {
                const updated = { ...inv, ...updates.get(inv.id)! };
                changedSaleInvoices.push(updated);
                return updated;
              }
              return inv;
            });
          }
        }
      } else {
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - payment.amount : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - payment.amount : newState.bankBalance;
        if (payment.type === 'purchase') {
          newState.suppliers = newState.suppliers.map(s => {
            if (s.id === payment.referenceId) {
              changedSupplier = { ...s, totalPaid: (s.totalPaid || 0) + payment.amount };
              return changedSupplier;
            }
            return s;
          });
          let remaining = payment.amount;
          const sortedInvoices = [...newState.purchaseInvoices]
            .filter(inv => inv.supplierId === payment.referenceId && inv.remaining > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
          const updates = new Map<string, { paid: number; remaining: number; status: PurchaseInvoice['status'] }>();
          for (const inv of sortedInvoices) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, inv.remaining);
            const newPaid = inv.paid + applied;
            const newRemaining = inv.total - newPaid;
            updates.set(inv.id, { paid: newPaid, remaining: newRemaining, status: newRemaining <= 0 ? 'paid' : 'partial' });
            remaining -= applied;
          }
          if (updates.size > 0) {
            newState.purchaseInvoices = newState.purchaseInvoices.map(inv => {
              if (updates.has(inv.id)) {
                const updated = { ...inv, ...updates.get(inv.id)! };
                changedPurchaseInvoices.push(updated);
                return updated;
              }
              return inv;
            });
          }
        }
      }

      newState.treasuryTransactions = [...newState.treasuryTransactions, {
        id: `tr_${Date.now()}`,
        type: payment.direction === 'in' ? 'payment_in' : 'payment_out',
        description: payment.notes || `دفعة - ${payment.referenceName}`,
        amount: payment.amount,
        treasury,
        direction: payment.direction,
        referenceId: payment.referenceId,
        date: payment.date,
        createdAt: new Date().toISOString(),
      }];

      saveToFirebase('payments', touched.id, touched);
      if (changedCustomer !== null) {
        const c = changedCustomer as Customer;
        saveToFirebase('customers', c.id, c);
      }
      if (changedSupplier !== null) {
        const s = changedSupplier as Supplier;
        saveToFirebase('suppliers', s.id, s);
      }
      changedSaleInvoices.forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      changedPurchaseInvoices.forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));

      return newState;
    });
  }, []);

  // ==================== EXPENSES ====================
  const addExpense = useCallback((expense: Expense) => {
    const touched = touch(expense);
    setState(prev => {
      const newState = { ...prev, expenses: [...prev.expenses, touched] };
      const treasury = expense.paymentMethod === 'cash' ? 'cash' : 'bank';
      newState.cashBalance = treasury === 'cash' ? newState.cashBalance - expense.amount : newState.cashBalance;
      newState.bankBalance = treasury === 'bank' ? newState.bankBalance - expense.amount : newState.bankBalance;
      newState.treasuryTransactions = [...newState.treasuryTransactions, {
        id: `tr_${Date.now()}`,
        type: 'expense',
        description: expense.description,
        amount: expense.amount,
        treasury,
        direction: 'out',
        referenceId: expense.id,
        date: expense.date,
        createdAt: new Date().toISOString(),
      }];
      return newState;
    });
    saveToFirebase('expenses', touched.id, touched);
  }, []);

// ==================== NOON ORDERS ====================
const addNoonOrder = useCallback((order: NoonOrder) => {
  const itemsWithCost: NoonOrder['items'] = order.items.map(item => {
    const product = state.products.find(p => p.id === item.productId);
    return { ...item, costPrice: product?.costPrice ?? item.costPrice ?? 0 };
  });
  const finalOrder = touch({ ...order, items: itemsWithCost });
  setState(prev => {
    const newState = { ...prev, noonOrders: [...prev.noonOrders, finalOrder] };
    const updatedProducts: Product[] = [];
    const updatedSerials: SerialItem[] = [];

    finalOrder.items.forEach(item => {
      const product = newState.products.find(p => p.id === item.productId);
      
      if (product?.productType === 'serial') {
        // ✅ منتج بسيريالات: نغير status السيريال لـ transferred
        // نبحث بالـ serial number أو بالـ productId لو مفيش serial محدد
        const serialToTransfer = item.serial
          ? newState.serials.find(s => s.serial === item.serial && s.status === 'available')
          : newState.serials.find(s => s.productId === item.productId && s.status === 'available');
        
        if (serialToTransfer) {
          newState.serials = newState.serials.map(s => {
            if (s.id === serialToTransfer.id) {
              const updated = { ...s, status: 'transferred' as const, noonOrderId: finalOrder.id };
              updatedSerials.push(updated);
              return updated;
            }
            return s;
          });
        }
      } else {
        // ✅ منتج عادي: نخصم من stock
        newState.products = newState.products.map(p => {
          if (p.id === item.productId) {
            const updated = { ...p, stock: Math.max(0, p.stock - 1) };
            updatedProducts.push(updated);
            return updated;
          }
          return p;
        });
      }
    });

    saveToFirebase('noonOrders', finalOrder.id, finalOrder);
    updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
    updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));

    return newState;
  });
}, [state.products]);

const updateNoonOrder = useCallback((order: NoonOrder) => {
  const touched = touch(order);
  setState(prev => {
    const oldOrder = prev.noonOrders.find(o => o.id === order.id);
    const newState = { ...prev, noonOrders: prev.noonOrders.map(o => o.id === order.id ? touched : o) };
    const updatedProducts: Product[] = [];
    const updatedSerials: SerialItem[] = [];

    const justCanceled = oldOrder && oldOrder.status !== 'canceled' && order.status === 'canceled';
    const justReactivated = oldOrder && oldOrder.status === 'canceled' && order.status !== 'canceled';

    if (justCanceled) {
      // ✅ لما الأوردر يتلغي: نرجع المخزون
      order.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        
        if (product?.productType === 'serial') {
          // نرجع السيريال لـ available
          const serialRecord = item.serial
            ? newState.serials.find(s => s.serial === item.serial)
            : newState.serials.find(s => s.productId === item.productId && s.status === 'transferred' && s.noonOrderId === order.id);
          
          if (serialRecord) {
            newState.serials = newState.serials.map(s => {
              if (s.id === serialRecord.id) {
                const updated = { ...s, status: 'available' as const, noonOrderId: undefined };
                updatedSerials.push(updated);
                return updated;
              }
              return s;
            });
          }
        } else {
          // نرجع stock للمنتج العادي
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: p.stock + 1 };
              updatedProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });
    } else if (justReactivated) {
      // ✅ لما الأوردر يترجع من ملغي: نخصم تاني
      order.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        
        if (product?.productType === 'serial') {
          const serialToTransfer = item.serial
            ? newState.serials.find(s => s.serial === item.serial && s.status === 'available')
            : newState.serials.find(s => s.productId === item.productId && s.status === 'available');
          
          if (serialToTransfer) {
            newState.serials = newState.serials.map(s => {
              if (s.id === serialToTransfer.id) {
                const updated = { ...s, status: 'transferred' as const, noonOrderId: order.id };
                updatedSerials.push(updated);
                return updated;
              }
              return s;
            });
          }
        } else {
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: Math.max(0, p.stock - 1) };
              updatedProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });
    }

    saveToFirebase('noonOrders', touched.id, touched);
    updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
    updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));

    return newState;
  });
}, []);

const addNoonOrders = useCallback((orders: NoonOrder[]) => {
  const ordersWithCost = orders.map(order => ({
    ...order,
    items: order.items.map(item => {
      const product = state.products.find(p => p.id === item.productId);
      return { ...item, costPrice: product?.costPrice ?? item.costPrice ?? 0 };
    }),
  }));
  const touchedOrders = ordersWithCost.map(o => touch(o));
  setState(prev => {
    const newState = { ...prev, noonOrders: [...prev.noonOrders, ...touchedOrders] };
    const updatedProducts: Product[] = [];
    const updatedSerials: SerialItem[] = [];

    touchedOrders.forEach(order => {
      order.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        
        if (product?.productType === 'serial') {
          // ✅ منتج بسيريالات
          const serialToTransfer = item.serial
            ? newState.serials.find(s => s.serial === item.serial && s.status === 'available')
            : newState.serials.find(s => s.productId === item.productId && s.status === 'available');
          
          if (serialToTransfer) {
            newState.serials = newState.serials.map(s => {
              if (s.id === serialToTransfer.id) {
                const updated = { ...s, status: 'transferred' as const, noonOrderId: order.id };
                updatedSerials.push(updated);
                return updated;
              }
              return s;
            });
          }
        } else {
          // ✅ منتج عادي
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: Math.max(0, p.stock - 1) };
              updatedProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });
    });

    touchedOrders.forEach(o => saveToFirebase('noonOrders', o.id, o));
    updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
    updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));

    return newState;
  });
}, [state.products]);

  const settleNoonOrders = useCallback((settlements: { orderId: string; settledAmount: number; settledDate?: string }[]) => {
    setState(prev => {
      const newState = { ...prev };
      let totalSettled = 0;
      const today = new Date().toISOString().split('T')[0];
      const updatedOrders: NoonOrder[] = [];

      newState.noonOrders = newState.noonOrders.map(order => {
        const settlement = settlements.find(s => s.orderId === order.id);
        if (!settlement) return order;
        const totalCost = order.items.reduce((sum, it) => sum + (it.costPrice || 0), 0);
        const profit = settlement.settledAmount - totalCost;
        totalSettled += settlement.settledAmount;
        const updated = touch({
          ...order,
          status: 'settled' as const,
          settledAmount: settlement.settledAmount,
          settledDate: settlement.settledDate || today,
          settlementProfit: profit,
        });
        updatedOrders.push(updated);
        return updated;
      });

      if (totalSettled > 0) {
        newState.bankBalance = newState.bankBalance + totalSettled;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: `tr_${Date.now()}`,
          type: 'sale' as const,
          description: `تسوية تحويل بنكي جماعي - ${settlements.length} أوردر`,
          amount: totalSettled,
          treasury: 'bank' as const,
          direction: 'in' as const,
          date: today,
          createdAt: new Date().toISOString(),
        }];
      }

      updatedOrders.forEach(o => saveToFirebase('noonOrders', o.id, o));
      return newState;
    });
  }, []);

  // ==================== BRANDS ====================
  const addBrand = useCallback((brand: Brand) => {
    const touched = touch(brand);
    setState(prev => ({ ...prev, brands: [...prev.brands, touched] }));
    saveToFirebase('brands', touched.id, touched);
  }, []);

  // ==================== DAILY CLOSING ====================
  const addDailyClosing = useCallback((closing: DailyClosing) => {
    setState(prev => ({ ...prev, dailyClosings: [...prev.dailyClosings, closing] }));
  }, []);

  // ==================== SETTINGS ====================
  const updateSettings = useCallback((settings: AppSettings) => {
    setState(prev => ({ ...prev, settings }));
  }, []);

  // ==================== TREASURY ====================
  const adjustTreasury = useCallback((type: 'cash' | 'bank', amount: number, direction: 'in' | 'out', description: string) => {
    setState(prev => {
      const newState = { ...prev };
      if (type === 'cash') {
        newState.cashBalance = direction === 'in' ? newState.cashBalance + amount : newState.cashBalance - amount;
      } else {
        newState.bankBalance = direction === 'in' ? newState.bankBalance + amount : newState.bankBalance - amount;
      }
      newState.treasuryTransactions = [...newState.treasuryTransactions, {
        id: `tr_${Date.now()}`,
        type: 'adjustment',
        description,
        amount,
        treasury: type,
        direction,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      }];
      return newState;
    });
  }, []);

  return {
    state,
    isLoading,
    updateState,
    addProduct, updateProduct, deleteProduct,
    addSerial, updateSerial, addSerials,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addSaleInvoice, updateSaleInvoice, deleteSaleInvoice,
    addPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice,
    addPayment,
    addExpense,
    addNoonOrder, updateNoonOrder, addNoonOrders, settleNoonOrders,
    addBrand,
    addDailyClosing,
    updateSettings,
    adjustTreasury,
  };
}