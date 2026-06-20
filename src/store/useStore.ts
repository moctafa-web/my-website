import { useState, useEffect, useCallback } from 'react';
import { AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice, Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing, SerialItem, Brand, AppSettings } from '../types';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc,
  writeBatch,
  query,
  where
} from 'firebase/firestore';

const STORAGE_KEY = 'one_erp_data';

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

// Demo data
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
    products,
    serials,
    customers,
    suppliers,
    saleInvoices: [],
    purchaseInvoices: [],
    payments: [],
    expenses: [],
    treasuryTransactions: [],
    noonOrders: [],
    dailyClosings: [],
    brands: defaultBrands,
    cashBalance: 25000,
    bankBalance: 150000,
    settings: defaultSettings,
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
    } catch { /* ignore */ }
    return generateDemoData();
  });

  const [isLoading, setIsLoading] = useState(true);

  // 🔥 Load data from Firebase on first load
  useEffect(() => {
    const loadDataFromFirebase = async () => {
      try {
        setIsLoading(true);
        
        // Load all collections
        const [
          productsSnap,
          serialsSnap,
          customersSnap,
          suppliersSnap,
          saleInvoicesSnap,
          purchaseInvoicesSnap,
          paymentsSnap,
          expensesSnap,
          noonOrdersSnap,
          brandsSnap,
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

        // If Firebase is empty, use demo data
        if (productsSnap.empty) {
          console.log('Firebase is empty, using demo data');
          setIsLoading(false);
          return;
        }

        // Convert to arrays
        const products = productsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
        const serials = serialsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as SerialItem));
        const customers = customersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));
        const suppliers = suppliersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Supplier));
        const saleInvoices = saleInvoicesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as SaleInvoice));
        const purchaseInvoices = purchaseInvoicesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as PurchaseInvoice));
        const payments = paymentsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Payment));
        const expenses = expensesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Expense));
        const noonOrders = noonOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as NoonOrder));
        const brands = brandsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Brand));

        setState(prev => ({
          ...prev,
          products,
          serials,
          customers,
          suppliers,
          saleInvoices,
          purchaseInvoices,
          payments,
          expenses,
          noonOrders,
          brands: brands.length > 0 ? brands : defaultBrands,
        }));

        console.log('✅ Data loaded from Firebase successfully!');
      } catch (error) {
        console.error('Error loading from Firebase:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDataFromFirebase();
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  // ==================== PRODUCTS ====================
  const addProduct = useCallback(async (product: Product) => {
    try {
      const docRef = await addDoc(collection(db, 'products'), product);
      setState(prev => ({ ...prev, products: [...prev.products, { ...product, id: docRef.id }] }));
      console.log('✅ Product added to Firebase');
    } catch (error) {
      console.error('Error adding product:', error);
      setState(prev => ({ ...prev, products: [...prev.products, product] }));
    }
  }, []);

  const updateProduct = useCallback(async (product: Product) => {
    try {
      await updateDoc(doc(db, 'products', product.id), { ...product });
      setState(prev => ({ ...prev, products: prev.products.map(p => p.id === product.id ? product : p) }));
      console.log('✅ Product updated in Firebase');
    } catch (error) {
      console.error('Error updating product:', error);
      setState(prev => ({ ...prev, products: prev.products.map(p => p.id === product.id ? product : p) }));
    }
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      setState(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
      console.log('✅ Product deleted from Firebase');
    } catch (error) {
      console.error('Error deleting product:', error);
      setState(prev => ({ ...prev, products: prev.products.filter(p => p.id !== id) }));
    }
  }, []);

  // ==================== SERIALS ====================
  const addSerial = useCallback(async (serial: SerialItem) => {
    try {
      const docRef = await addDoc(collection(db, 'serials'), serial);
      setState(prev => ({ ...prev, serials: [...prev.serials, { ...serial, id: docRef.id }] }));
    } catch (error) {
      console.error('Error adding serial:', error);
      setState(prev => ({ ...prev, serials: [...prev.serials, serial] }));
    }
  }, []);

  const updateSerial = useCallback(async (serial: SerialItem) => {
    try {
      await updateDoc(doc(db, 'serials', serial.id), { ...serial });
      setState(prev => ({ ...prev, serials: prev.serials.map(s => s.id === serial.id ? serial : s) }));
    } catch (error) {
      console.error('Error updating serial:', error);
      setState(prev => ({ ...prev, serials: prev.serials.map(s => s.id === serial.id ? serial : s) }));
    }
  }, []);

  const addSerials = useCallback(async (newSerials: SerialItem[]) => {
    try {
      const batch = writeBatch(db);
      const serialsWithIds: SerialItem[] = [];
      
      for (const serial of newSerials) {
        const docRef = doc(collection(db, 'serials'));
        batch.set(docRef, serial);
        serialsWithIds.push({ ...serial, id: docRef.id });
      }
      
      await batch.commit();
      setState(prev => ({ ...prev, serials: [...prev.serials, ...serialsWithIds] }));
    } catch (error) {
      console.error('Error adding serials:', error);
      setState(prev => ({ ...prev, serials: [...prev.serials, ...newSerials] }));
    }
  }, []);

  // ==================== CUSTOMERS ====================
  const addCustomer = useCallback(async (customer: Customer) => {
    try {
      const docRef = await addDoc(collection(db, 'customers'), customer);
      setState(prev => ({ ...prev, customers: [...prev.customers, { ...customer, id: docRef.id }] }));
    } catch (error) {
      console.error('Error adding customer:', error);
      setState(prev => ({ ...prev, customers: [...prev.customers, customer] }));
    }
  }, []);

  const updateCustomer = useCallback(async (customer: Customer) => {
    try {
      await updateDoc(doc(db, 'customers', customer.id), { ...customer });
      setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === customer.id ? customer : c) }));
    } catch (error) {
      console.error('Error updating customer:', error);
      setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === customer.id ? customer : c) }));
    }
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customers', id));
      setState(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
    } catch (error) {
      console.error('Error deleting customer:', error);
      setState(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
    }
  }, []);

  // ==================== SUPPLIERS ====================
  const addSupplier = useCallback(async (supplier: Supplier) => {
    try {
      const docRef = await addDoc(collection(db, 'suppliers'), supplier);
      setState(prev => ({ ...prev, suppliers: [...prev.suppliers, { ...supplier, id: docRef.id }] }));
    } catch (error) {
      console.error('Error adding supplier:', error);
      setState(prev => ({ ...prev, suppliers: [...prev.suppliers, supplier] }));
    }
  }, []);

  const updateSupplier = useCallback(async (supplier: Supplier) => {
    try {
      await updateDoc(doc(db, 'suppliers', supplier.id), { ...supplier });
      setState(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
    } catch (error) {
      console.error('Error updating supplier:', error);
      setState(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
    }
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      setState(prev => ({ ...prev, suppliers: prev.suppliers.filter(s => s.id !== id) }));
    } catch (error) {
      console.error('Error deleting supplier:', error);
      setState(prev => ({ ...prev, suppliers: prev.suppliers.filter(s => s.id !== id) }));
    }
  }, []);

  // ==================== SALE INVOICES ====================
  const addSaleInvoice = useCallback(async (invoice: SaleInvoice) => {
    try {
      await addDoc(collection(db, 'saleInvoices'), invoice);
      
      setState(prev => {
        const newState = { ...prev, saleInvoices: [...prev.saleInvoices, invoice] };
        const custIdx = newState.customers.findIndex(c => c.id === invoice.customerId);
        if (custIdx >= 0) {
          const customer = { ...newState.customers[custIdx] };
          customer.totalInvoices = (customer.totalInvoices || 0) + invoice.total;
          customer.totalPaid = (customer.totalPaid || 0) + invoice.paid;
          newState.customers = newState.customers.map(c => c.id === invoice.customerId ? customer : c);
          updateDoc(doc(db, 'customers', invoice.customerId), { ...customer });
        }
        
        if (invoice.paid > 0) {
          const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance + invoice.paid : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance + invoice.paid : newState.bankBalance;
        }
        
        invoice.items.forEach(item => {
          if (item.serials && item.serials.length > 0) {
            item.serials.forEach(sl => {
              const serial = newState.serials.find(s => s.serial === sl.serial);
              if (serial) {
                const updatedSerial = { ...serial, status: 'sold' as const, saleInvoiceId: invoice.id, salePrice: item.unitPrice };
                updateDoc(doc(db, 'serials', serial.id), updatedSerial);
                newState.serials = newState.serials.map(s => s.serial === sl.serial ? updatedSerial : s);
              }
            });
          }
        });
        
        newState.settings = { ...newState.settings, lastSaleInvoiceNum: newState.settings.lastSaleInvoiceNum + 1 };
        return newState;
      });
    } catch (error) {
      console.error('Error adding sale invoice:', error);
    }
  }, []);

  const updateSaleInvoice = useCallback(async (invoice: SaleInvoice) => {
    try {
      await updateDoc(doc(db, 'saleInvoices', invoice.id), { ...invoice });
      setState(prev => ({ ...prev, saleInvoices: prev.saleInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    } catch (error) {
      console.error('Error updating sale invoice:', error);
      setState(prev => ({ ...prev, saleInvoices: prev.saleInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    }
  }, []);

  // ==================== PURCHASE INVOICES ====================
  const addPurchaseInvoice = useCallback(async (invoice: PurchaseInvoice) => {
    try {
      await addDoc(collection(db, 'purchaseInvoices'), invoice);
      
      setState(prev => {
        const newState = { ...prev, purchaseInvoices: [...prev.purchaseInvoices, invoice] };
        const supIdx = newState.suppliers.findIndex(s => s.id === invoice.supplierId);
        if (supIdx >= 0) {
          const supplier = { ...newState.suppliers[supIdx] };
          supplier.totalInvoices = (supplier.totalInvoices || 0) + invoice.total;
          supplier.totalPaid = (supplier.totalPaid || 0) + invoice.paid;
          newState.suppliers = newState.suppliers.map(s => s.id === invoice.supplierId ? supplier : s);
          updateDoc(doc(db, 'suppliers', invoice.supplierId), { ...supplier });
        }
        
        if (invoice.paid > 0) {
          const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
        }
        
        invoice.items.forEach(item => {
          const product = newState.products.find(p => p.id === item.productId);
          if (product) {
            const updatedProduct = { ...product, stock: product.stock + item.quantity };
            updateDoc(doc(db, 'products', item.productId), updatedProduct);
            newState.products = newState.products.map(p => p.id === item.productId ? updatedProduct : p);
          }
        });
        
        newState.settings = { ...newState.settings, lastPurchaseInvoiceNum: newState.settings.lastPurchaseInvoiceNum + 1 };
        return newState;
      });
    } catch (error) {
      console.error('Error adding purchase invoice:', error);
    }
  }, []);

  const updatePurchaseInvoice = useCallback(async (invoice: PurchaseInvoice) => {
    try {
      await updateDoc(doc(db, 'purchaseInvoices', invoice.id), { ...invoice });
      setState(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    } catch (error) {
      console.error('Error updating purchase invoice:', error);
      setState(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    }
  }, []);

  // ==================== PAYMENTS ====================
  const addPayment = useCallback(async (payment: Payment) => {
    try {
      await addDoc(collection(db, 'payments'), payment);
      
      setState(prev => {
        const newState = { ...prev, payments: [...prev.payments, payment] };
        const treasury = payment.paymentMethod === 'cash' ? 'cash' : 'bank';
        
        if (payment.direction === 'in') {
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance + payment.amount : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance + payment.amount : newState.bankBalance;
          
          if (payment.type === 'sale') {
            newState.customers = newState.customers.map(c => {
              if (c.id === payment.referenceId) {
                const updated = { ...c, totalPaid: (c.totalPaid || 0) + payment.amount };
                updateDoc(doc(db, 'customers', c.id), updated);
                return updated;
              }
              return c;
            });
          }
        } else {
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance - payment.amount : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance - payment.amount : newState.bankBalance;
          
          if (payment.type === 'purchase') {
            newState.suppliers = newState.suppliers.map(s => {
              if (s.id === payment.referenceId) {
                const updated = { ...s, totalPaid: (s.totalPaid || 0) + payment.amount };
                updateDoc(doc(db, 'suppliers', s.id), updated);
                return updated;
              }
              return s;
            });
          }
        }
        
        return newState;
      });
    } catch (error) {
      console.error('Error adding payment:', error);
    }
  }, []);

  // ==================== EXPENSES ====================
  const addExpense = useCallback(async (expense: Expense) => {
    try {
      await addDoc(collection(db, 'expenses'), expense);
      
      setState(prev => {
        const newState = { ...prev, expenses: [...prev.expenses, expense] };
        const treasury = expense.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - expense.amount : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - expense.amount : newState.bankBalance;
        return newState;
      });
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  }, []);

  // ==================== NOON ORDERS ====================
  const addNoonOrder = useCallback(async (order: NoonOrder) => {
    try {
      await addDoc(collection(db, 'noonOrders'), order);
      
      setState(prev => {
        const newState = { ...prev, noonOrders: [...prev.noonOrders, order] };
        
        order.items.forEach(item => {
          const product = newState.products.find(p => p.id === item.productId);
          if (product) {
            const updatedProduct = { ...product, stock: Math.max(0, product.stock - 1) };
            updateDoc(doc(db, 'products', item.productId), updatedProduct);
            newState.products = newState.products.map(p => p.id === item.productId ? updatedProduct : p);
          }
          
          if (item.serial) {
            const serial = newState.serials.find(s => s.serial === item.serial);
            if (serial) {
              const updatedSerial = { ...serial, status: 'transferred' as const, noonOrderId: order.id };
              updateDoc(doc(db, 'serials', serial.id), updatedSerial);
              newState.serials = newState.serials.map(s => s.serial === item.serial ? updatedSerial : s);
            }
          }
        });
        
        return newState;
      });
    } catch (error) {
      console.error('Error adding noon order:', error);
    }
  }, []);

  const updateNoonOrder = useCallback(async (order: NoonOrder) => {
    try {
      await updateDoc(doc(db, 'noonOrders', order.id), { ...order });
      setState(prev => ({ ...prev, noonOrders: prev.noonOrders.map(o => o.id === order.id ? order : o) }));
    } catch (error) {
      console.error('Error updating noon order:', error);
      setState(prev => ({ ...prev, noonOrders: prev.noonOrders.map(o => o.id === order.id ? order : o) }));
    }
  }, []);

  const addNoonOrders = useCallback(async (orders: NoonOrder[]) => {
    try {
      const batch = writeBatch(db);
      orders.forEach(order => {
        const docRef = doc(collection(db, 'noonOrders'));
        batch.set(docRef, order);
      });
      await batch.commit();
      
      setState(prev => {
        const newState = { ...prev, noonOrders: [...prev.noonOrders, ...orders] };
        orders.forEach(order => {
          order.items.forEach(item => {
            const product = newState.products.find(p => p.id === item.productId);
            if (product) {
              newState.products = newState.products.map(p =>
                p.id === item.productId ? { ...p, stock: Math.max(0, p.stock - 1) } : p
              );
            }
            
            if (item.serial) {
              newState.serials = newState.serials.map(s =>
                s.serial === item.serial ? { ...s, status: 'transferred' as const, noonOrderId: order.id } : s
              );
            }
          });
        });
        return newState;
      });
    } catch (error) {
      console.error('Error adding noon orders:', error);
    }
  }, []);

  // ==================== BRANDS ====================
  const addBrand = useCallback(async (brand: Brand) => {
    try {
      const docRef = await addDoc(collection(db, 'brands'), brand);
      setState(prev => ({ ...prev, brands: [...prev.brands, { ...brand, id: docRef.id }] }));
    } catch (error) {
      console.error('Error adding brand:', error);
      setState(prev => ({ ...prev, brands: [...prev.brands, brand] }));
    }
  }, []);

  // ==================== DAILY CLOSING ====================
  const addDailyClosing = useCallback((closing: DailyClosing) => {
    setState(prev => ({ ...prev, dailyClosings: [...prev.dailyClosings, closing] }));
  }, []);

  // ==================== SETTINGS ====================
  const updateSettings = useCallback((settings: AppSettings) => {
    setState(prev => ({ ...prev, settings }));
  }, []);

  // ==================== TREASURY ADJUSTMENTS ====================
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
    addSaleInvoice, updateSaleInvoice,
    addPurchaseInvoice, updatePurchaseInvoice,
    addPayment,
    addExpense,
    addNoonOrder, updateNoonOrder, addNoonOrders,
    addBrand,
    addDailyClosing,
    updateSettings,
    adjustTreasury,
  };
}