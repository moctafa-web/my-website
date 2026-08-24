import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice,
  Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing,
  DailyJournal, SerialItem, Brand, AppSettings, Partner, ProfitDistribution,
  WeeklyInventoryCount, StockTransfer, DailyOperationEntry, DailyInventoryScan
} from '../types';
import { normalizeForCompare, generateId } from '../utils/helpers';
import { makeTransactionId } from './domains/id.store';
import { applyTreasuryChange } from './domains/treasury.store';
import { completePendingPurchaseState } from './domains/purchases.store';
import { generateDemoData, STORAGE_KEY, hydrateState } from '../lib/demo-data';
import { saveToFirebase, deleteFromFirebase, loadCollection } from '../services/firebasePersistence';

export function useStore() {
  const [state, setState] = useState<AppState>(() => generateDemoData());
  const [hydrated, setHydrated] = useState(false);
  const treasurySyncRef = useRef<{ ready: boolean; syncedTxIds: Set<string>; syncedClosingIds: Set<string> }>({
    ready: false,
    syncedTxIds: new Set(),
    syncedClosingIds: new Set(),
  });

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        // Local cache is used immediately so the UI stays responsive, then
        // Firestore becomes the source of truth when it is reachable.
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) setState(hydrateState(JSON.parse(raw)));
      } catch (error) {
        console.error('Error loading local cache:', error);
      }

      try {
        const [
          products, serials, customers, suppliers, saleInvoices, purchaseInvoices,
          payments, expenses, noonOrders, brands, dailyJournals, partners,
          profitDistributions, treasuryTransactions, dailyClosings, weeklyInventoryCounts,
          stockTransfers, dailyOperations, dailyInventoryScans,
          settingsRows, treasuryRows,
        ] = await Promise.all([
          loadCollection<Product>('products'),
          loadCollection<SerialItem>('serials'),
          loadCollection<Customer>('customers'),
          loadCollection<Supplier>('suppliers'),
          loadCollection<SaleInvoice>('saleInvoices'),
          loadCollection<PurchaseInvoice>('purchaseInvoices'),
          loadCollection<Payment>('payments'),
          loadCollection<Expense>('expenses'),
          loadCollection<NoonOrder>('noonOrders'),
          loadCollection<Brand>('brands'),
          loadCollection<DailyJournal>('dailyJournals'),
          loadCollection<Partner>('partners'),
          loadCollection<ProfitDistribution>('profitDistributions'),
          loadCollection<TreasuryTransaction>('treasuryTransactions'),
          loadCollection<DailyClosing>('dailyClosings'),
          loadCollection<WeeklyInventoryCount>('weeklyInventoryCounts'),
          loadCollection<StockTransfer>('stockTransfers'),
          loadCollection<DailyOperationEntry>('dailyOperations'),
          loadCollection<DailyInventoryScan>('dailyInventoryScans'),
          loadCollection<AppSettings>('settings'),
          loadCollection<{ cashBalance: number; bankBalance: number }>('treasury'),
        ]);

        if (cancelled) return;

        const savedSettings = settingsRows.find(item => item.id === 'main');
        const savedTreasury = treasuryRows.find(item => item.id === 'main');

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
          partners,
          profitDistributions,
          treasuryTransactions,
          dailyClosings,
          weeklyInventoryCounts,
          stockTransfers,
          dailyOperations,
          dailyInventoryScans,
          settings: savedSettings || prev.settings,
          cashBalance: savedTreasury?.cashBalance ?? prev.cashBalance,
          bankBalance: savedTreasury?.bankBalance ?? prev.bankBalance,
        }));

        treasurySyncRef.current = {
          ready: true,
          syncedTxIds: new Set(treasuryTransactions.map(t => t.id)),
          syncedClosingIds: new Set(dailyClosings.map(c => c.id)),
        };

        console.info('[Firebase] ERP data loaded successfully');
      } catch (error) {
        console.error('[Firebase] loading failed; keeping local cache/demo state:', error);
        treasurySyncRef.current.ready = true;
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void loadData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving local data:', error);
    }
  }, [state, hydrated]);

  useEffect(() => {
    if (!treasurySyncRef.current.ready) return;
    const newTx = state.treasuryTransactions.filter(t => !treasurySyncRef.current.syncedTxIds.has(t.id));
    newTx.forEach(t => {
      treasurySyncRef.current.syncedTxIds.add(t.id);
      void saveToFirebase('treasuryTransactions', t.id, t);
    });
  }, [state.treasuryTransactions]);

  useEffect(() => {
    if (!treasurySyncRef.current.ready) return;
    const newClosings = state.dailyClosings.filter(c => !treasurySyncRef.current.syncedClosingIds.has(c.id));
    newClosings.forEach(c => {
      treasurySyncRef.current.syncedClosingIds.add(c.id);
      void saveToFirebase('dailyClosings', c.id, c);
    });
  }, [state.dailyClosings]);

  useEffect(() => {
    if (!treasurySyncRef.current.ready) return;
    void saveToFirebase('treasury', 'main', {
      cashBalance: state.cashBalance,
      bankBalance: state.bankBalance,
    });
  }, [state.cashBalance, state.bankBalance]);

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

  // ==================== PURCHASES DOMAIN ====================
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
      const completed = completePendingPurchaseState(prev, {
        serialId, newCostPrice, supplierId, supplierName, paymentMethod, paidAmount, invoiceNumber,
      }, { save: saveToFirebase });
      result = completed.result;
      return completed.state;
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
          id: makeTransactionId(),
          type: 'sale',
          description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerName}`,
          amount: invoice.paid,
          treasury,
          direction: 'in',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
        // ✅ نسجل دفعة تلقائية عشان تظهر في كشف حساب العميل/المورد (مدين/دائن) بدل ما تفضل مختفية جوه الفاتورة بس
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'sale',
          referenceId: invoice.customerId,
          referenceName: invoice.customerName,
          amount: invoice.paid,
          paymentMethod: invoice.paymentMethod,
          direction: 'in',
          date: invoice.date,
          notes: `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: new Date().toISOString(),
        };
        newState.payments = [...newState.payments, autoPayment];
        saveToFirebase('payments', autoPayment.id, autoPayment);
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
      // ✅ نشيل الدفعة التلقائية القديمة المرتبطة بالفاتورة عشان نعيد بناءها بالقيمة الجديدة
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoice.id}`);

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
          id: makeTransactionId(),
          type: 'sale',
          description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerName}`,
          amount: invoice.paid,
          treasury: newTreasury,
          direction: 'in',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'sale',
          referenceId: invoice.customerId,
          referenceName: invoice.customerName,
          amount: invoice.paid,
          paymentMethod: invoice.paymentMethod,
          direction: 'in',
          date: invoice.date,
          notes: `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: new Date().toISOString(),
        };
        newState.payments = [...newState.payments, autoPayment];
        saveToFirebase('payments', autoPayment.id, autoPayment);
      } else {
        deleteFromFirebase('payments', `paid_${invoice.id}`);
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
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoiceId}`);
      deleteFromFirebase('payments', `paid_${invoiceId}`);

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
          id: makeTransactionId(),
          type: 'purchase',
          description: `فاتورة مشتريات ${invoice.invoiceNumber} - ${invoice.supplierName}`,
          amount: invoice.paid,
          treasury,
          direction: 'out',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
        // ✅ نسجل دفعة تلقائية عشان تظهر في كشف حساب المورد (مدين/دائن) بدل ما تفضل مختفية جوه الفاتورة بس
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'purchase',
          referenceId: invoice.supplierId,
          referenceName: invoice.supplierName,
          amount: invoice.paid,
          paymentMethod: invoice.paymentMethod,
          direction: 'out',
          date: invoice.date,
          notes: `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: new Date().toISOString(),
        };
        newState.payments = [...newState.payments, autoPayment];
        saveToFirebase('payments', autoPayment.id, autoPayment);
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
    setState(prev => {
      const oldInvoice = prev.purchaseInvoices.find(i => i.id === invoice.id);
      if (!oldInvoice) {
        const newState = { ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) };
        saveToFirebase('purchaseInvoices', invoice.id, invoice);
        return newState;
      }

      const newState = { ...prev, purchaseInvoices: prev.purchaseInvoices.map(i => i.id === invoice.id ? invoice : i) };
      let updatedSupplier: Supplier | null = null;

      // ✅ نلغي أثر القديم ونطبق أثر الجديد على رصيد المورد والخزينة، عشان كشف الحساب والأرصدة يفضلوا مطابقين للفاتورة الفعلية
      newState.suppliers = newState.suppliers.map((s): Supplier => {
        if (s.id !== oldInvoice.supplierId && s.id !== invoice.supplierId) return s;
        let updated = { ...s };
        if (s.id === oldInvoice.supplierId) {
          updated.totalInvoices = Math.max(0, (updated.totalInvoices || 0) - oldInvoice.total);
          updated.totalPaid = Math.max(0, (updated.totalPaid || 0) - oldInvoice.paid);
        }
        if (s.id === invoice.supplierId) {
          updated.totalInvoices = (updated.totalInvoices || 0) + invoice.total;
          updated.totalPaid = (updated.totalPaid || 0) + invoice.paid;
        }
        updatedSupplier = updated;
        return updated;
      });

      if (oldInvoice.paid > 0) {
        const oldTreasury = oldInvoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = oldTreasury === 'cash' ? newState.cashBalance + oldInvoice.paid : newState.cashBalance;
        newState.bankBalance = oldTreasury === 'bank' ? newState.bankBalance + oldInvoice.paid : newState.bankBalance;
      }
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== oldInvoice.id);
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoice.id}`);

      if (invoice.paid > 0) {
        const newTreasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = newTreasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
        newState.bankBalance = newTreasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: makeTransactionId(),
          type: 'purchase',
          description: `فاتورة مشتريات ${invoice.invoiceNumber} - ${invoice.supplierName}`,
          amount: invoice.paid,
          treasury: newTreasury,
          direction: 'out',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: new Date().toISOString(),
        }];
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'purchase',
          referenceId: invoice.supplierId,
          referenceName: invoice.supplierName,
          amount: invoice.paid,
          paymentMethod: invoice.paymentMethod,
          direction: 'out',
          date: invoice.date,
          notes: `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: new Date().toISOString(),
        };
        newState.payments = [...newState.payments, autoPayment];
        saveToFirebase('payments', autoPayment.id, autoPayment);
      } else {
        deleteFromFirebase('payments', `paid_${invoice.id}`);
      }

      saveToFirebase('purchaseInvoices', invoice.id, invoice);
      if (updatedSupplier !== null) saveToFirebase('suppliers', (updatedSupplier as Supplier).id, updatedSupplier as Supplier);

      return newState;
    });
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
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoiceId}`);
      deleteFromFirebase('payments', `paid_${invoiceId}`);

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
        id: makeTransactionId(),
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
        id: makeTransactionId(),
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
          id: makeTransactionId(),
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
  // الأنواع اللي فعلاً بيتم تحميلها وتزامنها مع Firebase بشكل كامل عند بدء التشغيل
  // (لسه فيه أنواع بيانات تانية زي الخزنة والجرد الأسبوعي وحركات التحويل مش متزامنة بالكامل حالياً - بند منفصل)
  const restoreFullState = useCallback(async (restored: AppState) => {
    setState(hydrateState(restored));
  }, []);

  const resetAllData = useCallback(async () => {
    treasurySyncRef.current = { ready: true, syncedTxIds: new Set(), syncedClosingIds: new Set() };
    setState(prev => ({ ...generateDemoData(), settings: prev.settings }));
  }, []);

  const deleteAllNoonOrders = useCallback(async () => {
    setState(prev => ({ ...prev, noonOrders: [] }));
  }, []);

  // ✅ إصلاح لمرة واحدة: يضيف سجلات دفعات مفقودة للفواتير القديمة (اللي اتسجلت مدفوعة قبل إصلاح كشف الحساب)
  // من غير ما يلمس أي أرصدة أو خزينة، لأن دي كانت محسوبة صح من الأول - بس كانت مش ظاهرة كسطر في كشف الحساب
  const backfillPaymentRecords = useCallback((): { added: number } => {
    let added = 0;
    setState(prev => {
      const existingIds = new Set(prev.payments.map(p => p.id));
      const newPayments: Payment[] = [];

      prev.saleInvoices.forEach(inv => {
        const pid = `paid_${inv.id}`;
        if (inv.paid > 0 && !existingIds.has(pid)) {
          newPayments.push({
            id: pid, type: 'sale', referenceId: inv.customerId, referenceName: inv.customerName,
            amount: inv.paid, paymentMethod: inv.paymentMethod, direction: 'in', date: inv.date,
            notes: `دفعة مسجلة مع فاتورة ${inv.invoiceNumber}`, createdAt: new Date().toISOString(),
          });
        }
      });

      prev.purchaseInvoices.forEach(inv => {
        const pid = `paid_${inv.id}`;
        if (inv.paid > 0 && !existingIds.has(pid)) {
          newPayments.push({
            id: pid, type: 'purchase', referenceId: inv.supplierId, referenceName: inv.supplierName,
            amount: inv.paid, paymentMethod: inv.paymentMethod, direction: 'out', date: inv.date,
            notes: `دفعة مسجلة مع فاتورة ${inv.invoiceNumber}`, createdAt: new Date().toISOString(),
          });
        }
      });

      added = newPayments.length;
      newPayments.forEach(p => saveToFirebase('payments', p.id, p));
      return { ...prev, payments: [...prev.payments, ...newPayments] };
    });
    return { added };
  }, []);

  // ✅ إصلاح لمرة واحدة: يعيد حساب totalInvoices/totalPaid المخزنة على كل عميل ومورد من الفواتير الفعلية
  // مفيد لو الأرقام اتلخبطت بسبب أي تعديل/حذف قديم قبل ما نصلح الكود
  const recalculatePartyTotals = useCallback((): { fixedCustomers: number; fixedSuppliers: number } => {
    let fixedCustomers = 0;
    let fixedSuppliers = 0;
    setState(prev => {
      const newState = { ...prev };

      newState.customers = prev.customers.map(c => {
        const invs = prev.saleInvoices.filter(i => i.customerId === c.id);
        const correctTotalInvoices = invs.reduce((s, i) => s + i.total, 0);
        const correctTotalPaid = invs.reduce((s, i) => s + i.paid, 0);
        if (correctTotalInvoices !== (c.totalInvoices || 0) || correctTotalPaid !== (c.totalPaid || 0)) {
          fixedCustomers++;
          const updated = { ...c, totalInvoices: correctTotalInvoices, totalPaid: correctTotalPaid };
          saveToFirebase('customers', updated.id, updated);
          return updated;
        }
        return c;
      });

      newState.suppliers = prev.suppliers.map(s => {
        const invs = prev.purchaseInvoices.filter(i => i.supplierId === s.id);
        const correctTotalInvoices = invs.reduce((sum, i) => sum + i.total, 0);
        const correctTotalPaid = invs.reduce((sum, i) => sum + i.paid, 0);
        if (correctTotalInvoices !== (s.totalInvoices || 0) || correctTotalPaid !== (s.totalPaid || 0)) {
          fixedSuppliers++;
          const updated = { ...s, totalInvoices: correctTotalInvoices, totalPaid: correctTotalPaid };
          saveToFirebase('suppliers', updated.id, updated);
          return updated;
        }
        return s;
      });

      return newState;
    });
    return { fixedCustomers, fixedSuppliers };
  }, []);

  // ==================== TREASURY ====================
  const adjustTreasury = useCallback((type: 'cash' | 'bank', amount: number, direction: 'in' | 'out', description: string) => {
    setState(prev => applyTreasuryChange(prev, type, amount, direction, description));
  }, []);

  // ==================== Phase 1: Weekly Inventory Count ====================
  const addWeeklyInventoryCount = useCallback((count: WeeklyInventoryCount) => {
    updateState(prev => {
      const newState = { ...prev, weeklyInventoryCounts: [...(prev.weeklyInventoryCounts || []), count] };
      saveToFirebase?.('weeklyInventoryCounts', count.id, count);
      return newState;
    });
  }, [updateState]);

  const updateWeeklyInventoryCount = useCallback((count: WeeklyInventoryCount) => {
    updateState(prev => ({
      ...prev,
      weeklyInventoryCounts: (prev.weeklyInventoryCounts || []).map(c => c.id === count.id ? count : c),
    }));
    saveToFirebase?.('weeklyInventoryCounts', count.id, count);
  }, [updateState]);

  // ==================== Phase 2: Stock Transfers ====================
  const addStockTransfer = useCallback((transfer: StockTransfer) => {
    updateState(prev => {
      const newState = { ...prev, stockTransfers: [...(prev.stockTransfers || []), transfer] };
      saveToFirebase?.('stockTransfers', transfer.id, transfer);
      return newState;
    });
  }, [updateState]);

  const updateStockTransfer = useCallback((transfer: StockTransfer) => {
    updateState(prev => ({
      ...prev,
      stockTransfers: (prev.stockTransfers || []).map(t => t.id === transfer.id ? transfer : t),
    }));
    saveToFirebase?.('stockTransfers', transfer.id, transfer);
  }, [updateState]);

  // ==================== Daily Barcode Inventory ====================
  const addDailyInventoryScan = useCallback((session: DailyInventoryScan) => {
    updateState(prev => ({ ...prev, dailyInventoryScans: [...(prev.dailyInventoryScans || []), session] }));
    saveToFirebase('dailyInventoryScans', session.id, session);
  }, [updateState]);

  const updateDailyInventoryScan = useCallback((session: DailyInventoryScan) => {
    updateState(prev => ({
      ...prev,
      dailyInventoryScans: (prev.dailyInventoryScans || []).map(s => s.id === session.id ? session : s),
    }));
    saveToFirebase('dailyInventoryScans', session.id, session);
  }, [updateState]);

    // ==================== Phase 3: Daily Operations ====================
  const addDailyOperation = useCallback((operation: DailyOperationEntry) => {
    updateState(prev => {
      const newState = { ...prev, dailyOperations: [...(prev.dailyOperations || []), operation] };
      saveToFirebase?.('dailyOperations', operation.id, operation);
      return newState;
    });
  }, [updateState]);

  const deleteDailyOperation = useCallback((operationId: string) => {
    updateState(prev => ({
      ...prev,
      dailyOperations: (prev.dailyOperations || []).filter(op => op.id !== operationId),
    }));
    deleteFromFirebase?.('dailyOperations', operationId);
  }, [updateState]);

  return {
    state,
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
    // ✅ Phase 1: Weekly Inventory
    addWeeklyInventoryCount, updateWeeklyInventoryCount,
    // ✅ Phase 2: Stock Transfers
    addStockTransfer, updateStockTransfer,
    // ✅ Phase 3: Daily Operations
    addDailyOperation, deleteDailyOperation,
    addDailyInventoryScan, updateDailyInventoryScan,
    resetAllData,
    restoreFullState,
    deleteAllNoonOrders,
    backfillPaymentRecords,
    recalculatePartyTotals,
    adjustTreasury,
  };
}
