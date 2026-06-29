import { useState, useEffect, useCallback } from 'react';
import {
  AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice,
  Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing,
  DailyJournal, SerialItem, Brand, AppSettings, Partner, ProfitDistribution
} from '../types';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { normalizeForCompare } from '../utils/helpers';

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
    dailyClosings: [], dailyJournals: [], brands: defaultBrands,
    // ✅ جديد
    partners: [],
    profitDistributions: [],
    cashBalance: 25000, bankBalance: 150000, settings: defaultSettings,
  };
};

export function useStore() {
  const [state, setState] = useState<AppState>(() => generateDemoData());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDataFromFirebase = async () => {
      try {
        setIsLoading(true);
        const [
          productsSnap, serialsSnap, customersSnap, suppliersSnap,
          saleInvoicesSnap, purchaseInvoicesSnap, paymentsSnap,
          expensesSnap, noonOrdersSnap, brandsSnap, settingsSnap,
          dailyJournalsSnap, partnersSnap, profitDistributionsSnap,
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
          getDocs(collection(db, 'settings')),
          getDocs(collection(db, 'dailyJournals')),
          getDocs(collection(db, 'partners')),
          getDocs(collection(db, 'profitDistributions')),
        ]);

        const products = productsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
        const serials = serialsSnap.docs.map(d => ({ ...d.data(), id: d.id } as SerialItem));
        const customers = customersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Customer));
        const suppliers = suppliersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Supplier));
        const saleInvoices = saleInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as SaleInvoice));
        const purchaseInvoices = purchaseInvoicesSnap.docs.map(d => ({ ...d.data(), id: d.id } as PurchaseInvoice));
        const payments = paymentsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Payment));
        const expenses = expensesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Expense));
        const noonOrders = noonOrdersSnap.docs.map(d => ({ ...d.data(), id: d.id } as NoonOrder));
        const brands = brandsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Brand));
        const dailyJournals = dailyJournalsSnap.docs.map(d => ({ ...d.data(), id: d.id } as DailyJournal));
        const partners = partnersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Partner));
        const profitDistributions = profitDistributionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as ProfitDistribution));
        const settingsDoc = settingsSnap.docs.find(d => d.id === 'main');
        const savedSettings = settingsDoc ? (settingsDoc.data() as AppSettings) : null;

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
          dailyJournals,
          brands: brands.length ? brands : prev.brands,
          settings: savedSettings || prev.settings,
          partners,
          profitDistributions,
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

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  // ==================== PRODUCTS ====================
  const addProduct = useCallback((product: Product): { success: boolean; message?: string } => {
    const normalizedSku = normalizeForCompare(product.sku);
    let isDuplicate = false;
    setState(prev => {
      const exists = prev.products.some(p => normalizeForCompare(p.sku) === normalizedSku);
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, products: [...prev.products, product] };
    });
    if (isDuplicate) return { success: false, message: `يوجد منتج بنفس الكود (SKU): ${product.sku}` };
    saveToFirebase('products', product.id, product);
    return { success: true };
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
  }, []);

  const updateSerial = useCallback((serial: SerialItem) => {
    setState(prev => ({ ...prev, serials: prev.serials.map(s => s.id === serial.id ? serial : s) }));
    saveToFirebase('serials', serial.id, serial);
  }, []);

  const addSerials = useCallback((newSerials: SerialItem[]) => {
    setState(prev => ({ ...prev, serials: [...prev.serials, ...newSerials] }));
    newSerials.forEach(s => saveToFirebase('serials', s.id, s));
  }, []);

  // ==================== COMPLETE PENDING PURCHASE ====================
  const completePendingPurchase = useCallback((
    serialId: string,
    newCostPrice: number,
    supplierId: string,
    supplierName: string,
    paymentMethod: 'cash' | 'bank' | 'credit',
    paidAmount: number,
    invoiceNumber: string
  ): { success: boolean; message?: string } => {
    let result: { success: boolean; message?: string } = { success: true };

    setState(prev => {
      const serial = prev.serials.find(s => s.id === serialId);
      if (!serial) {
        result = { success: false, message: 'السيريال غير موجود' };
        return prev;
      }
      if (!serial.purchasePricePending && serial.costPrice !== 0) {
        result = { success: false, message: 'هذا السيريال لديه سعر شراء مسجل بالفعل' };
        return prev;
      }

      const newState = { ...prev };
      const updatedSerial: SerialItem = {
        ...serial,
        costPrice: newCostPrice,
        purchasePricePending: false,
      };
      newState.serials = newState.serials.map(s => s.id === serialId ? updatedSerial : s);

      let updatedPurchaseInvoice: PurchaseInvoice | null = null;
      if (serial.purchaseInvoiceId) {
        const oldInvoice = newState.purchaseInvoices.find(inv => inv.id === serial.purchaseInvoiceId);
        if (oldInvoice) {
          const updatedItems = oldInvoice.items.map(item => {
            const hasThisSerial = item.serials?.some(sl => sl.serial === serial.serial);
            if (!hasThisSerial) return item;
            const newTotal = newCostPrice * item.quantity - item.discount;
            return { ...item, unitPrice: newCostPrice, total: newTotal };
          });
          const newSubtotal = updatedItems.reduce((s, i) => s + i.total, 0);
          const newRemaining = newSubtotal - oldInvoice.paid;
          updatedPurchaseInvoice = {
            ...oldInvoice,
            items: updatedItems,
            subtotal: newSubtotal,
            total: newSubtotal,
            remaining: Math.max(0, newRemaining),
            status: newRemaining <= 0 ? 'paid' : oldInvoice.paid > 0 ? 'partial' : 'unpaid',
          };
          newState.purchaseInvoices = newState.purchaseInvoices.map(inv =>
            inv.id === serial.purchaseInvoiceId ? updatedPurchaseInvoice! : inv
          );
          const priceDiff = newCostPrice - serial.costPrice;
          if (priceDiff !== 0) {
            newState.suppliers = newState.suppliers.map(s => {
              if (s.id !== oldInvoice.supplierId) return s;
              return { ...s, totalInvoices: (s.totalInvoices || 0) + priceDiff };
            });
          }
        }
      } else {
        const product = newState.products.find(p => p.id === serial.productId);
        const invoiceId = `inv_pending_${Date.now()}`;
        const total = newCostPrice;
        const remaining = total - paidAmount;
        const newInvoice: PurchaseInvoice = {
          id: invoiceId,
          invoiceNumber,
          supplierId,
          supplierName,
          date: new Date().toISOString().split('T')[0],
          items: [{
            id: `item_${Date.now()}`,
            productId: serial.productId,
            productName: serial.productName,
            sku: product?.sku || '',
            quantity: 1,
            unitPrice: newCostPrice,
            discount: 0,
            discountType: 'fixed',
            taxRate: 0,
            total: newCostPrice,
            serials: [{ serial: serial.serial, imei1: serial.imei1, imei2: serial.imei2 }],
            costPrice: newCostPrice,
          }],
          subtotal: total,
          taxTotal: 0,
          discount: 0,
          total,
          paid: paidAmount,
          remaining: Math.max(0, remaining),
          status: remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          paymentMethod,
          createdAt: new Date().toISOString(),
        };
        newState.purchaseInvoices = [...newState.purchaseInvoices, newInvoice];
        updatedPurchaseInvoice = newInvoice;
        if (newState.suppliers.some(s => s.id === supplierId)) {
          newState.suppliers = newState.suppliers.map(s => {
            if (s.id !== supplierId) return s;
            return {
              ...s,
              totalInvoices: (s.totalInvoices || 0) + total,
              totalPaid: (s.totalPaid || 0) + paidAmount,
            };
          });
        }
        if (paidAmount > 0 && paymentMethod !== 'credit') {
          const treasury = paymentMethod === 'cash' ? 'cash' : 'bank';
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance - paidAmount : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance - paidAmount : newState.bankBalance;
          newState.treasuryTransactions = [...newState.treasuryTransactions, {
            id: `tr_${Date.now()}`,
            type: 'purchase',
            description: `استكمال سعر شراء ${serial.productName} - سيريال ${serial.serial}`,
            amount: paidAmount,
            treasury,
            direction: 'out',
            referenceId: invoiceId,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          }];
        }
      }

      newState.products = newState.products.map(p => {
        if (p.id !== serial.productId) return p;
        return { ...p, costPrice: newCostPrice, updatedAt: new Date().toISOString() };
      });

      saveToFirebase('serials', updatedSerial.id, updatedSerial);
      if (updatedPurchaseInvoice) saveToFirebase('purchaseInvoices', updatedPurchaseInvoice.id, updatedPurchaseInvoice);
      const updatedProduct = newState.products.find(p => p.id === serial.productId);
      if (updatedProduct) saveToFirebase('products', updatedProduct.id, updatedProduct);
      const updatedSupplier = newState.suppliers.find(s =>
        s.id === supplierId ||
        s.id === prev.purchaseInvoices.find(inv => inv.id === serial.purchaseInvoiceId)?.supplierId
      );
      if (updatedSupplier) saveToFirebase('suppliers', updatedSupplier.id, updatedSupplier);

      return newState;
    });

    return result;
  }, []);

  // ==================== CUSTOMERS ====================
  const addCustomer = useCallback((customer: Customer): { success: boolean; message?: string } => {
    const normalizedName = normalizeForCompare(customer.name);
    const normalizedPhone = normalizeForCompare(customer.phone || '');
    let isDuplicate = false;
    setState(prev => {
      const exists = prev.customers.some(c =>
        normalizeForCompare(c.name) === normalizedName &&
        normalizeForCompare(c.phone || '') === normalizedPhone
      );
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, customers: [...prev.customers, customer] };
    });
    if (isDuplicate) return { success: false, message: `يوجد عميل بنفس الاسم ورقم الهاتف: ${customer.name}` };
    saveToFirebase('customers', customer.id, customer);
    return { success: true };
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
  const addSupplier = useCallback((supplier: Supplier): { success: boolean; message?: string } => {
    const normalizedName = normalizeForCompare(supplier.name);
    let isDuplicate = false;
    setState(prev => {
      const exists = prev.suppliers.some(s => normalizeForCompare(s.name) === normalizedName);
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, suppliers: [...prev.suppliers, supplier] };
    });
    if (isDuplicate) return { success: false, message: `يوجد مورد/تاجر بنفس الاسم بالفعل: ${supplier.name}` };
    saveToFirebase('suppliers', supplier.id, supplier);
    return { success: true };
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
      let updatedSupplier: Supplier | null = null;
      const updatedSerials: SerialItem[] = [];
      const updatedProducts: Product[] = [];

      const custIdx = newState.customers.findIndex(c => c.id === invoice.customerId);
      if (custIdx >= 0) {
        const customer = { ...newState.customers[custIdx] };
        customer.totalInvoices = (customer.totalInvoices || 0) + invoice.total;
        customer.totalPaid = (customer.totalPaid || 0) + invoice.paid;
        newState.customers = newState.customers.map(c => c.id === invoice.customerId ? customer : c);
        updatedCustomer = customer;
      } else {
        const supIdx = newState.suppliers.findIndex(s => s.id === invoice.customerId);
        if (supIdx >= 0) {
          const supplier = { ...newState.suppliers[supIdx] };
          supplier.totalInvoices = (supplier.totalInvoices || 0) - invoice.total;
          supplier.totalPaid = (supplier.totalPaid || 0) - invoice.paid;
          newState.suppliers = newState.suppliers.map(s => s.id === invoice.customerId ? supplier : s);
          updatedSupplier = supplier;
        }
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
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
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
        } else {
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

      newState.settings = { ...newState.settings, lastSaleInvoiceNum: newState.settings.lastSaleInvoiceNum + 1 };

      saveToFirebase('saleInvoices', invoice.id, invoice);
      saveToFirebase('settings', 'main', newState.settings);
      if (updatedCustomer) saveToFirebase('customers', updatedCustomer.id, updatedCustomer);
      if (updatedSupplier) saveToFirebase('suppliers', updatedSupplier.id, updatedSupplier);
      updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));

      return newState;
    });
  }, []);

  const updateSaleInvoice = useCallback((invoice: SaleInvoice) => {
    setState(prev => {
      const oldInvoice = prev.saleInvoices.find(i => i.id === invoice.id);
      if (!oldInvoice) {
        const newState = { ...prev, saleInvoices: prev.saleInvoices.map(i => i.id === invoice.id ? invoice : i) };
        saveToFirebase('saleInvoices', invoice.id, invoice);
        return newState;
      }

      let newState = { ...prev };
      const changedCustomers = new Map<string, Customer>();
      const changedSuppliers = new Map<string, Supplier>();
      const changedProducts = new Map<string, Product>();
      const changedSerials = new Map<string, SerialItem>();

      const touchParty = (partyId: string, delta: { invoices: number; paid: number }) => {
        const custExists = newState.customers.some(c => c.id === partyId);
        if (custExists) {
          newState.customers = newState.customers.map(c => {
            if (c.id !== partyId) return c;
            const updated = {
              ...c,
              totalInvoices: Math.max(0, (c.totalInvoices || 0) + delta.invoices),
              totalPaid: Math.max(0, (c.totalPaid || 0) + delta.paid),
            };
            changedCustomers.set(updated.id, updated);
            return updated;
          });
          return;
        }
        const supExists = newState.suppliers.some(s => s.id === partyId);
        if (supExists) {
          newState.suppliers = newState.suppliers.map(s => {
            if (s.id !== partyId) return s;
            const updated = {
              ...s,
              totalInvoices: (s.totalInvoices || 0) + (-delta.invoices),
              totalPaid: (s.totalPaid || 0) + (-delta.paid),
            };
            changedSuppliers.set(updated.id, updated);
            return updated;
          });
        }
      };

      const touchProduct = (productId: string, updater: (p: Product) => Product) => {
        newState.products = newState.products.map(p => {
          if (p.id !== productId) return p;
          const updated = updater(p);
          changedProducts.set(updated.id, updated);
          return updated;
        });
      };

      const touchSerialByValue = (serialValue: string, updater: (s: SerialItem) => SerialItem) => {
        newState.serials = newState.serials.map(s => {
          if (s.serial !== serialValue) return s;
          const updated = updater(s);
          changedSerials.set(updated.id, updated);
          return updated;
        });
      };

      touchParty(oldInvoice.customerId, { invoices: -(oldInvoice.total), paid: -(oldInvoice.paid) });

      if (oldInvoice.paid > 0) {
        const oldTreasury = oldInvoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = oldTreasury === 'cash' ? newState.cashBalance - oldInvoice.paid : newState.cashBalance;
        newState.bankBalance = oldTreasury === 'bank' ? newState.bankBalance - oldInvoice.paid : newState.bankBalance;
      }

      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== oldInvoice.id);

      oldInvoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
          (item.serials || []).forEach(sl => {
            touchSerialByValue(sl.serial, s => ({ ...s, status: 'available', saleInvoiceId: undefined, salePrice: undefined }));
          });
        } else {
          touchProduct(item.productId, p => ({ ...p, stock: p.stock + item.quantity }));
        }
      });

      touchParty(invoice.customerId, { invoices: invoice.total, paid: invoice.paid });

      if (invoice.paid > 0) {
        const newTreasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = newTreasury === 'cash' ? newState.cashBalance + invoice.paid : newState.cashBalance;
        newState.bankBalance = newTreasury === 'bank' ? newState.bankBalance + invoice.paid : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: `tr_${Date.now()}`,
          type: 'sale',
          description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerName}`,
          amount: invoice.paid,
          treasury: newTreasury,
          direction: 'in',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
      }

      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
          (item.serials || []).forEach(sl => {
            touchSerialByValue(sl.serial, s => ({ ...s, status: 'sold', saleInvoiceId: invoice.id, salePrice: item.unitPrice }));
          });
        } else {
          touchProduct(item.productId, p => ({ ...p, stock: Math.max(0, p.stock - item.quantity) }));
        }
      });

      newState.saleInvoices = newState.saleInvoices.map(i => i.id === invoice.id ? invoice : i);

      saveToFirebase('saleInvoices', invoice.id, invoice);
      changedCustomers.forEach(c => saveToFirebase('customers', c.id, c));
      changedSuppliers.forEach(s => saveToFirebase('suppliers', s.id, s));
      changedProducts.forEach(p => saveToFirebase('products', p.id, p));
      changedSerials.forEach(s => saveToFirebase('serials', s.id, s));

      return newState;
    });
  }, []);

  const deleteSaleInvoice = useCallback((invoiceId: string) => {
    setState(prev => {
      const invoice = prev.saleInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;

      const newState = { ...prev, saleInvoices: prev.saleInvoices.filter(i => i.id !== invoiceId) };
      const restoredSerials: SerialItem[] = [];
      const restoredProducts: Product[] = [];

      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
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
        } else {
          newState.products = newState.products.map(p => {
            if (p.id === item.productId) {
              const updated = { ...p, stock: p.stock + item.quantity };
              restoredProducts.push(updated);
              return updated;
            }
            return p;
          });
        }
      });

      const custExists = newState.customers.some(c => c.id === invoice.customerId);
      if (custExists) {
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
        if (updatedCustomer !== null) {
          const cs = updatedCustomer as Customer;
          saveToFirebase('customers', cs.id, cs);
        }
      } else {
        let updatedSupplier: Supplier | null = null;
        newState.suppliers = newState.suppliers.map((s): Supplier => {
          if (s.id === invoice.customerId) {
            const updated: Supplier = {
              ...s,
              totalInvoices: (s.totalInvoices || 0) + invoice.total,
              totalPaid: (s.totalPaid || 0) + invoice.paid,
            };
            updatedSupplier = updated;
            return updated;
          }
          return s;
        });
        if (updatedSupplier !== null) {
          const ss = updatedSupplier as Supplier;
          saveToFirebase('suppliers', ss.id, ss);
        }
      }

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
      }

      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== invoiceId);

      deleteFromFirebase('saleInvoices', invoiceId);
      restoredSerials.forEach(s => saveToFirebase('serials', s.id, s));
      restoredProducts.forEach(p => saveToFirebase('products', p.id, p));

      return newState;
    });
  }, []);

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

      newState.settings = { ...newState.settings, lastPurchaseInvoiceNum: newState.settings.lastPurchaseInvoiceNum + 1 };

      saveToFirebase('purchaseInvoices', invoice.id, invoice);
      saveToFirebase('settings', 'main', newState.settings);
      if (updatedSupplier) saveToFirebase('suppliers', updatedSupplier.id, updatedSupplier);
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));

      return newState;
    });
  }, []);

  const updatePurchaseInvoice = useCallback((invoice: PurchaseInvoice) => {
    setState(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) }));
    saveToFirebase('purchaseInvoices', invoice.id, invoice);
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
        const ss = updatedSupplier as Supplier;
        saveToFirebase('suppliers', ss.id, ss);
      }
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      removedSerialIds.forEach(id => deleteFromFirebase('serials', id));

      return newState;
    });
  }, []);

  // ==================== PAYMENTS (FIFO) ====================
  const addPayment = useCallback((payment: Payment) => {
    setState(prev => {
      const newState = { ...prev, payments: [...prev.payments, payment] };
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

      saveToFirebase('payments', payment.id, payment);
      if (changedCustomer !== null) { const c = changedCustomer as Customer; saveToFirebase('customers', c.id, c); }
      if (changedSupplier !== null) { const s = changedSupplier as Supplier; saveToFirebase('suppliers', s.id, s); }
      changedSaleInvoices.forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      changedPurchaseInvoices.forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));

      return newState;
    });
  }, []);

  // ==================== EXPENSES ====================
  const addExpense = useCallback((expense: Expense) => {
    setState(prev => {
      const newState = { ...prev, expenses: [...prev.expenses, expense] };
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
    saveToFirebase('expenses', expense.id, expense);
  }, []);

  // ==================== NOON ORDERS ====================
  const addNoonOrder = useCallback((order: NoonOrder): { success: boolean; message?: string; merged?: boolean } => {
    let result: { success: boolean; message?: string; merged?: boolean } = { success: true };
    setState(prev => {
      const normalizedOrderNum = normalizeForCompare(order.orderNumber);
      const existingOrder = prev.noonOrders.find(o => normalizeForCompare(o.orderNumber) === normalizedOrderNum);
      const itemsWithCost: NoonOrder['items'] = order.items.map(item => {
        const product = prev.products.find(p => p.id === item.productId);
        return { ...item, costPrice: product?.costPrice ?? item.costPrice ?? 0 };
      });
      const finalOrder: NoonOrder = existingOrder
        ? { ...existingOrder, items: [...existingOrder.items, ...itemsWithCost] }
        : { ...order, items: itemsWithCost };
      result = existingOrder
        ? { success: true, merged: true, message: `الأوردر ${order.orderNumber} موجود بالفعل، تم إضافة المنتج له` }
        : { success: true };
      const newState = {
        ...prev,
        noonOrders: existingOrder
          ? prev.noonOrders.map(o => o.id === existingOrder.id ? finalOrder : o)
          : [...prev.noonOrders, finalOrder],
      };
      const updatedProducts: Product[] = [];
      const updatedSerials: SerialItem[] = [];
      itemsWithCost.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
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
    return result;
  }, []);

  const updateNoonOrder = useCallback((order: NoonOrder) => {
    setState(prev => {
      const oldOrder = prev.noonOrders.find(o => o.id === order.id);
      const newState = { ...prev, noonOrders: prev.noonOrders.map(o => o.id === order.id ? order : o) };
      const updatedProducts: Product[] = [];
      const updatedSerials: SerialItem[] = [];
      const justCanceled = oldOrder && oldOrder.status !== 'canceled' && order.status === 'canceled';
      const justReactivated = oldOrder && oldOrder.status === 'canceled' && order.status !== 'canceled';
      if (justCanceled) {
        order.items.forEach(item => {
          const product = newState.products.find(p => p.id === item.productId);
          if (product?.productType === 'serial') {
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
      saveToFirebase('noonOrders', order.id, order);
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));
      return newState;
    });
  }, []);

  const addNoonOrders = useCallback((orders: NoonOrder[]): { addedCount: number; mergedCount: number } => {
    let addedCount = 0;
    let mergedCount = 0;
    setState(prev => {
      const newState = { ...prev };
      const updatedProducts: Product[] = [];
      const updatedSerials: SerialItem[] = [];
      let workingOrders = [...prev.noonOrders];
      orders.forEach(order => {
        const itemsWithCost = order.items.map(item => {
          const product = prev.products.find(p => p.id === item.productId);
          return { ...item, costPrice: product?.costPrice ?? item.costPrice ?? 0 };
        });
        const normalizedOrderNum = normalizeForCompare(order.orderNumber);
        const existingIdx = workingOrders.findIndex(o => normalizeForCompare(o.orderNumber) === normalizedOrderNum);
        let finalOrder: NoonOrder;
        if (existingIdx >= 0) {
          finalOrder = { ...workingOrders[existingIdx], items: [...workingOrders[existingIdx].items, ...itemsWithCost] };
          workingOrders[existingIdx] = finalOrder;
          mergedCount++;
        } else {
          finalOrder = { ...order, items: itemsWithCost };
          workingOrders.push(finalOrder);
          addedCount++;
        }
        itemsWithCost.forEach(item => {
          const product = newState.products.find(p => p.id === item.productId);
          if (product?.productType === 'serial') {
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
      });
      newState.noonOrders = workingOrders;
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      updatedSerials.forEach(s => saveToFirebase('serials', s.id, s));
      return newState;
    });
    return { addedCount, mergedCount };
  }, []);

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
        const updated = {
          ...order,
          status: 'settled' as const,
          settledAmount: settlement.settledAmount,
          settledDate: settlement.settledDate || today,
          settlementProfit: profit,
        };
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
    setState(prev => ({ ...prev, brands: [...prev.brands, brand] }));
    saveToFirebase('brands', brand.id, brand);
  }, []);

  // ==================== DAILY CLOSING ====================
  const addDailyClosing = useCallback((closing: DailyClosing) => {
    setState(prev => ({ ...prev, dailyClosings: [...prev.dailyClosings, closing] }));
  }, []);

  // ==================== DAILY JOURNAL ====================
  const saveDailyJournal = useCallback((journal: DailyJournal) => {
    setState(prev => {
      const exists = prev.dailyJournals.some(j => j.id === journal.id);
      const dailyJournals = exists
        ? prev.dailyJournals.map(j => j.id === journal.id ? journal : j)
        : [...prev.dailyJournals, journal];
      return { ...prev, dailyJournals };
    });
    saveToFirebase('dailyJournals', journal.id, journal);
  }, []);

  // ==================== SETTINGS ====================
  const updateSettings = useCallback(async (settings: AppSettings) => {
    setState(prev => ({ ...prev, settings }));
    await saveToFirebase('settings', 'main', settings);
  }, []);

  // ==================== PARTNERS (الشركاء) ====================
  const addPartner = useCallback((partner: Partner): { success: boolean; message?: string } => {
    let isDuplicate = false;
    setState(prev => {
      const exists = prev.partners.some(p => p.name.trim().toLowerCase() === partner.name.trim().toLowerCase());
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, partners: [...prev.partners, partner] };
    });
    if (isDuplicate) return { success: false, message: `يوجد شريك بنفس الاسم: ${partner.name}` };
    saveToFirebase('partners', partner.id, partner);
    return { success: true };
  }, []);

  const updatePartner = useCallback((partner: Partner) => {
    setState(prev => ({ ...prev, partners: prev.partners.map(p => p.id === partner.id ? partner : p) }));
    saveToFirebase('partners', partner.id, partner);
  }, []);

  const deletePartner = useCallback((id: string) => {
    setState(prev => ({ ...prev, partners: prev.partners.filter(p => p.id !== id) }));
    deleteFromFirebase('partners', id);
  }, []);

  // ==================== PROFIT DISTRIBUTION (توزيع الأرباح) ====================
  const saveDistribution = useCallback((distribution: ProfitDistribution) => {
    setState(prev => {
      const exists = prev.profitDistributions.some(d => d.id === distribution.id);
      const profitDistributions = exists
        ? prev.profitDistributions.map(d => d.id === distribution.id ? distribution : d)
        : [...prev.profitDistributions, distribution];
      return { ...prev, profitDistributions };
    });
    saveToFirebase('profitDistributions', distribution.id, distribution);
  }, []);

  const deleteDistribution = useCallback((id: string) => {
    setState(prev => ({ ...prev, profitDistributions: prev.profitDistributions.filter(d => d.id !== id) }));
    deleteFromFirebase('profitDistributions', id);
  }, []);

  // ==================== DANGEROUS OPERATIONS ====================
  const resetAllData = useCallback(async () => {
    const collections = [
      'products', 'serials', 'customers', 'suppliers', 'saleInvoices',
      'purchaseInvoices', 'payments', 'expenses', 'noonOrders',
      'treasuryTransactions', 'dailyClosings', 'dailyJournals',
    ];
    for (const col of collections) {
      const snap = await getDocs(collection(db, col));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
    }
    setState(prev => ({ ...generateDemoData(), settings: prev.settings }));
  }, []);

  const deleteAllNoonOrders = useCallback(async () => {
    const snap = await getDocs(collection(db, 'noonOrders'));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'noonOrders', d.id))));
    setState(prev => ({ ...prev, noonOrders: [] }));
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
    completePendingPurchase,
    addPayment,
    addExpense,
    addNoonOrder, updateNoonOrder, addNoonOrders, settleNoonOrders,
    addBrand,
    addDailyClosing,
    saveDailyJournal,
    updateSettings,
    // ✅ الشركاء
    addPartner, updatePartner, deletePartner,
    // ✅ توزيع الأرباح
    saveDistribution, deleteDistribution,
    resetAllData,
    deleteAllNoonOrders,
    adjustTreasury,
  };
}