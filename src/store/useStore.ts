import { useState, useEffect, useCallback } from 'react';
import { AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice, Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing, SerialItem, Brand, AppSettings } from '../types';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';

const STORAGE_KEY = 'one_erp_data';

// ==================== Firebase Helper Functions ====================

// ✅ تنظيف undefined قبل الحفظ في Firebase
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
    { id: 'p1', name: 'iPhone 15 Pro Max 256GB Natural', sku: 'IP15PM-256-NT', upc: '195949035951', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: 45000, salePrice: 52000, quantity: 0, stock: 5, createdAt: now, updatedAt: now },
    { id: 'p2', name: 'iPad Pro 11 M4 256GB WiFi', sku: 'IPADPRO11-256', upc: '195949078279', category: 'tablets', brand: 'Apple', productType: 'serial', costPrice: 35000, salePrice: 42000, quantity: 0, stock: 3, createdAt: now, updatedAt: now },
    { id: 'p3', name: 'MacBook Air M3 13 256GB', sku: 'MBA-M3-256', upc: '195949056147', category: 'laptops', brand: 'Apple', productType: 'serial', costPrice: 55000, salePrice: 65000, quantity: 0, stock: 2, createdAt: now, updatedAt: now },
    { id: 'p4', name: 'AirPods Pro 2nd Gen', sku: 'APP2-USB', upc: '195949077813', category: 'accessories', brand: 'Apple', productType: 'serial', costPrice: 8000, salePrice: 10500, quantity: 0, stock: 8, createdAt: now, updatedAt: now },
    { id: 'p5', name: 'Samsung Galaxy S24 Ultra 256GB', sku: 'SGS24U-256', upc: '8806095194585', category: 'phones', brand: 'Samsung', productType: 'serial', costPrice: 38000, salePrice: 45000, quantity: 0, stock: 4, createdAt: now, updatedAt: now },
    { id: 'p6', name: 'iPhone 15 128GB Black', sku: 'IP15-128-BK', upc: '195949034862', category: 'phones', brand: 'Apple', productType: 'serial', costPrice: 32000, salePrice: 38000, quantity: 0, stock: 6, createdAt: now, updatedAt: now },
    { id: 'p7', name: 'iPad Air M2 11 256GB', sku: 'IPADAIR-M2-256', upc: '195949052613', category: 'tablets', brand: 'Apple', productType: 'serial', costPrice: 28000, salePrice: 34000, quantity: 0, stock: 4, createdAt: now, updatedAt: now },
    { id: 'p8', name: 'Apple Watch Series 9 45mm', sku: 'AWS9-45', upc: '194253921660', category: 'accessories', brand: 'Apple', productType: 'serial', costPrice: 12000, salePrice: 15000, quantity: 0, stock: 5, createdAt: now, updatedAt: now },
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

  // ==================== SYNC PRODUCT QUANTITIES ====================
  // مزامنة كمية كل منتج بعدد السيريالات المتاحة (غير المباعين)
  const syncProductQuantities = useCallback(() => {
    setState(prev => {
      const updatedProducts = prev.products.map(product => {
        // احسب عدد السيريالات المتاحة لهذا المنتج
        const availableCount = prev.serials.filter(
          s => s.productId === product.id && s.status !== 'sold'
        ).length;
        
        // لو الكمية نفسها، متغيرش حاجة
        if (product.quantity === availableCount) {
          return product;
        }
        
        return {
          ...product,
          quantity: availableCount
        };
      });
      
      // لو مفيش تغيير، ارجع نفس الـ prev
      const hasChanges = updatedProducts.some((p, idx) => 
        p.quantity !== prev.products[idx].quantity
      );
      
      if (!hasChanges) {
        return prev;
      }
      
      return {
        ...prev,
        products: updatedProducts
      };
    });
  }, []);

  // 🔥 Load from Firebase on start
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
          console.log('Firebase is empty, using local data');
          // زامن حتى لو محلي
          syncProductQuantities();
          setIsLoading(false);
          return;
        }

        // ✅ حماية: خذ المنتجات بس خلي quantity = 0، الـ sync هيصلحه
        const products = productsSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            ...data,
            id: d.id,
            quantity: 0 // هنصلحه تلقائيًا بالـ sync
          } as Product;
        });
        
        const serials = serialsSnap.docs.map(d => ({ ...d.data(), id: d.id } as SerialItem));
        const customers = customersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Customer));
        const suppliers = suppliersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Supplier));
        const saleInvoices = saleInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as SaleInvoice));
        const purchaseInvoices = purchaseInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as PurchaseInvoice));
        const payments = paymentsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Payment));
        const expenses = expensesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Expense));
        const noonOrders = noonOrdersSnap.docs.map(d => ({ ...d.data(), id: d.id } as NoonOrder));
        const brands = brandsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Brand));

        setState(prev => ({
          ...prev,
          products: products.length ? products : prev.products,
          serials: serials.length ? serials : prev.serials,
          customers: customers.length ? customers : prev.customers,
          suppliers: suppliers.length ? suppliers : prev.suppliers,
          saleInvoices,
          purchaseInvoices,
          payments,
          expenses,
          noonOrders,
          brands: brands.length ? brands : prev.brands,
        }));
        
        // زامن الكميات فورًا بعد التحميل
        syncProductQuantities();
        console.log('✅ Data loaded from Firebase successfully!');
      } catch (error) {
        console.error('Error loading from Firebase:', error);
        // حتى لو فيه خطأ، زامن
        syncProductQuantities();
      } finally {
        setIsLoading(false);
      }
    };
    loadDataFromFirebase();
  }, [syncProductQuantities]);

  // Save to localStorage as backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { }
  }, [state]);

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  // ==================== PRODUCTS ====================
  const addProduct = useCallback((product: Product) => {
    setState(prev => ({ ...prev, products: [...prev.products, product] }));
    saveToFirebase('products', product.id, product);
  }, []);

  const updateProduct = useCallback((product: Product) => {
    setState(prev => ({ ...prev, products: prev.products.map(p => p.id === product.id ? product : p) }));
    saveToFirebase('products', product.id, product);
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
    deleteFromFirebase('products', id);
  }, []);

  // ==================== SERIALS ====================
  const addSerial = useCallback((serial: SerialItem) => {
    setState(prev => ({ ...prev, serials: [...prev.serials, serial] }));
    saveToFirebase('serials', serial.id, serial);
    // زامن بعد إضافة سيريال
    syncProductQuantities();
  }, [syncProductQuantities]);

  const updateSerial = useCallback((serial: SerialItem) => {
    setState(prev => ({ ...prev, serials: prev.serials.map(s => s.id === serial.id ? serial : s) }));
    saveToFirebase('serials', serial.id, serial);
    syncProductQuantities();
  }, [syncProductQuantities]);

  const addSerials = useCallback((newSerials: SerialItem[]) => {
    setState(prev => ({ ...prev, serials: [...prev.serials, ...newSerials] }));
    newSerials.forEach(s => saveToFirebase('serials', s.id, s));
    syncProductQuantities();
  }, [syncProductQuantities]);

  // ==================== CUSTOMERS ====================
  const addCustomer = useCallback((customer: Customer) => {
    setState(prev => ({ ...prev, customers: [...prev.customers, customer] }));
    saveToFirebase('customers', customer.id, customer);
  }, []);

  const updateCustomer = useCallback((customer: Customer) => {
    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === customer.id ? customer : c) }));
    saveToFirebase('customers', customer.id, customer);
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setState(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
    deleteFromFirebase('customers', id);
  }, []);

  // ==================== SUPPLIERS ====================
  const addSupplier = useCallback((supplier: Supplier) => {
    setState(prev => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
    saveToFirebase('suppliers', supplier.id, supplier);
  }, []);

  const updateSupplier = useCallback((supplier: Supplier) => {
    setState(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
    saveToFirebase('suppliers', supplier.id, supplier);
  }, []);

  const deleteSupplier = useCallback((id: string) => {
    setState(prev => ({ ...prev, suppliers: prev.suppliers.filter(s => s.id !== id) }));
    deleteFromFirebase('suppliers', id);
  }, []);

  // ==================== SALE INVOICES ====================
  const addSaleInvoice = useCallback((invoice: SaleInvoice) => {
    setState(prev => {
      const newState = { ...prev, saleInvoices: [...prev.saleInvoices, invoice] };
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

      saveToFirebase('saleInvoices', invoice.id, invoice);
      if (updatedCustomer) saveToFirebase('customers', updatedCustomer.id, updatedCustomer);
      updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));

      return newState;
    });
    // زامن بعد البيع
    syncProductQuantities();
  }, [syncProductQuantities]);

  const updateSaleInvoice = useCallback((invoice: SaleInvoice) => {
    setState(prev => ({ ...prev, saleInvoices: prev.saleInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    saveToFirebase('saleInvoices', invoice.id, invoice);
    syncProductQuantities();
  }, [syncProductQuantities]);

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
    // زامن بعد الحذف
    syncProductQuantities();
  }, [syncProductQuantities]);

  // ==================== PURCHASE INVOICES ====================
  const addPurchaseInvoice = useCallback((invoice: PurchaseInvoice) => {
    setState(prev => {
      const newState = { ...prev, purchaseInvoices: [...prev.purchaseInvoices, invoice] };
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

      // فقط المنتجات العادية
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

      saveToFirebase('purchaseInvoices', invoice.id, invoice);
      if (updatedSupplier) saveToFirebase('suppliers', updatedSupplier.id, updatedSupplier);
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));

      return newState;
    });
    // السيريالات بتتضاف من addSerials، فـ sync هناك
  }, []);

  const updatePurchaseInvoice = useCallback((invoice: PurchaseInvoice) => {
    setState(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    saveToFirebase('purchaseInvoices', invoice.id, invoice);
    syncProductQuantities();
  }, [syncProductQuantities]);

  const deletePurchaseInvoice = useCallback((invoiceId: string) => {
    setState(prev => {
      const invoice = prev.purchaseInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;
      const newState = { ...prev, purchaseInvoices: prev.purchaseInvoices.filter(i => i.id !== invoiceId) };

      const updatedProducts: Product[] = [];

      // فقط المنتجات العادية
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

      // حذف السيريالات المرتبطة
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
    // زامن بعد الحذف
    syncProductQuantities();
  }, [syncProductQuantities]);

  // ==================== PAYMENTS (FIFO) ====================
  const addPayment = useCallback((payment: Payment) => {
    setState(prev => {
      const newState = { ...prev, payments: [...prev.payments, payment] };
      // ... باقي الكود زي ما هو
      return newState;
    });
  }, []);

  // ==================== EXPENSES ====================
  const addExpense = useCallback((expense: Expense) => {
    setState(prev => {
      const newState = { ...prev, expenses: [...prev.expenses, expense] };
      // ... باقي الكود
      return newState;
    });
    saveToFirebase('expenses', expense.id, expense);
  }, []);

  // ==================== NOON ORDERS ====================
  const addNoonOrder = useCallback((order: NoonOrder) => {
    setState(prev => {
      // ... باقي الكود
      return newState;
    });
    syncProductQuantities();
  }, [syncProductQuantities]);

  const updateNoonOrder = useCallback((order: NoonOrder) => {
    setState(prev => {
      // ... باقي الكود
      return newState;
    });
    syncProductQuantities();
  }, [syncProductQuantities]);

  const addNoonOrders = useCallback((orders: NoonOrder[]) => {
    setState(prev => {
      // ... باقي الكود
      return newState;
    });
    syncProductQuantities();
  }, [syncProductQuantities]);

  const settleNoonOrders = useCallback((settlements: { orderId: string; settledAmount: number; settledDate?: string }[]) => {
    setState(prev => {
      // ... باقي الكود
      return newState;
    });
  }, []);

  // ==================== BRANDS ====================
  const addBrand = useCallback((brand: Brand) => {
    setState(prev => ({ ...prev, brands: [...prev.brands, brand] }));
    saveToFirebase('brands', brand.id, brand);
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
      // ... باقي الكود
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