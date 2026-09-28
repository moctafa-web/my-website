import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState, Product, Customer, Supplier, SaleInvoice, PurchaseInvoice,
  Payment, Expense, TreasuryTransaction, NoonOrder, DailyClosing, InvoiceItem,
  DailyJournal, SerialItem, Brand, AppSettings, Partner, ProfitDistribution,
  WeeklyInventoryCount, StockTransfer, DailyOperationEntry, DailyInventoryScan, Employee
} from '../types';
import { normalizeForCompare, generateId } from '../utils/helpers';
import { makeTransactionId } from './domains/id.store';
import { applyTreasuryChange } from './domains/treasury.store';
import { completePendingPurchaseState } from './domains/purchases.store';
import { generateDemoData } from '../lib/demo-data';
import { saveToFirebase, saveToFirebaseStrict, deleteFromFirebase, loadCollection, deleteCollectionFromFirebase } from '../services/firebasePersistence';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export function useStore() {
  const [state, setState] = useState<AppState>(() => generateDemoData());
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const treasurySyncRef = useRef<{ ready: boolean; syncedTxIds: Set<string>; syncedClosingIds: Set<string> }>({
    ready: false,
    syncedTxIds: new Set(),
    syncedClosingIds: new Set(),
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const loadData = async () => {
      try {
        const [
          products, serials, customers, suppliers, saleInvoices, purchaseInvoices,
          payments, expenses, noonOrders, brands, dailyJournals, partners,
          profitDistributions, employees, treasuryTransactions, dailyClosings, weeklyInventoryCounts,
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
          loadCollection<Employee>('employees'),
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

        // Keep the loaded products unchanged; import logic determines product type explicitly.
        const normalizedProducts = products;

        // تنظيف السيريالات اليتيمة: السيريال المتاح لا يُعتبر مخزوناً إلا إذا كانت
        // فاتورة الشراء الأصلية ما زالت موجودة. هذا يعالج السيريالات القديمة التي
        // بقيت في Firebase بعد حذف فاتورة شراء في نسخة سابقة من النظام.
        // السيريالات المباعة/المحوّلة بدون فاتورة شراء لا نحذفها لأنها قد تكون
        // سجلات تاريخية لازمة لتتبع الجهاز.
        const purchaseInvoiceIds = new Set(purchaseInvoices.map(invoice => invoice.id));
        const orphanAvailableSerials = serials.filter(serial =>
          (serial.status === 'available' || serial.purchasePricePending) &&
          (!serial.purchaseInvoiceId || !purchaseInvoiceIds.has(serial.purchaseInvoiceId))
        );
        const cleanedSerials = serials.filter(serial => !orphanAvailableSerials.some(orphan => orphan.id === serial.id));
        orphanAvailableSerials.forEach(serial => {
          void deleteFromFirebase('serials', serial.id);
        });

        const savedSettings = settingsRows.find(item => (item as AppSettings & { id?: string }).id === 'main');
        const savedTreasury = treasuryRows.find(item => (item as { id?: string }).id === 'main');

        setState(prev => ({
          ...prev,
          products: normalizedProducts,
          serials: cleanedSerials,
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
          employees,
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
        console.error('[Firebase] loading failed; refusing to show demo data:', error);
        if (!cancelled) {
          setLoadError('تعذر تحميل البيانات من Firebase. لم يتم عرض بيانات تجريبية.');
          setHydrated(true);
        }
        treasurySyncRef.current.ready = false;
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void loadData();
      else if (!cancelled) setHydrated(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

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
    setState(prev => {
      const oldProduct = prev.products.find(p => p.id === product.id);
      const newState = {
        ...prev,
        products: prev.products.map(p => p.id === product.id ? product : p),
        // المنتج هو المرجع الأساسي للاسم؛ نزامن الاسم في كل السجلات التاريخية أيضًا.
        serials: prev.serials.map(s => s.productId === product.id ? { ...s, productName: product.name } : s),
        saleInvoices: prev.saleInvoices.map(inv => ({
          ...inv,
          items: inv.items.map(item => item.productId === product.id ? { ...item, productName: product.name, sku: product.sku } : item),
        })),
        purchaseInvoices: prev.purchaseInvoices.map(inv => ({
          ...inv,
          items: inv.items.map(item => item.productId === product.id ? { ...item, productName: product.name, sku: product.sku } : item),
        })),
        noonOrders: prev.noonOrders.map(order => ({
          ...order,
          items: order.items.map(item => item.productId === product.id ? { ...item, productName: product.name, upc: product.upc } : item),
        })),
        stockTransfers: (prev.stockTransfers || []).map(t => ({
          ...t,
          items: t.items.map(item => item.productId === product.id ? { ...item, productName: product.name } : item),
        })),
        weeklyInventoryCounts: (prev.weeklyInventoryCounts || []).map(c => ({
          ...c,
          lines: c.lines.map(line => line.productId === product.id ? { ...line, productName: product.name, sku: product.sku } : line),
        })),
        dailyInventoryScans: (prev.dailyInventoryScans || []).map(scan => ({
          ...scan,
          lines: scan.lines.map(line => line.productId === product.id ? { ...line, productName: product.name } : line),
        })),
      };
      if (oldProduct && oldProduct.name !== product.name) {
        console.info(`[Product] propagated rename: ${oldProduct.name} -> ${product.name}`);
      }
      saveToFirebase('products', product.id, product);
      newState.serials.filter(s => s.productId === product.id).forEach(s => saveToFirebase('serials', s.id, s));
      newState.saleInvoices.forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      newState.purchaseInvoices.forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));
      newState.noonOrders.forEach(order => saveToFirebase('noonOrders', order.id, order));
      (newState.stockTransfers || []).forEach(t => saveToFirebase('stockTransfers', t.id, t));
      (newState.weeklyInventoryCounts || []).forEach(c => saveToFirebase('weeklyInventoryCounts', c.id, c));
      (newState.dailyInventoryScans || []).forEach(scan => saveToFirebase('dailyInventoryScans', scan.id, scan));
      return newState;
    });
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState(prev => {
      const serialIds = prev.serials.filter(s => s.productId === id).map(s => s.id);
      serialIds.forEach(serialId => deleteFromFirebase('serials', serialId));
      return {
        ...prev,
        products: prev.products.filter(p => p.id !== id),
        serials: prev.serials.filter(s => s.productId !== id),
      };
    });
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
    setState(prev => {
      const incomingKeys = new Set(newSerials.map(s => normalizeForCompare(s.serial)).filter(Boolean));
      const activeKeys = new Set(
        prev.serials
          .filter(s => s.status === 'available' || s.status === 'transferred' || s.purchasePricePending)
          .map(s => normalizeForCompare(s.serial))
          .filter(Boolean)
      );
      // السيريال المباع/المرتجع تاريخيًا ليس حجزًا حاليًا؛ يمكن شراء الجهاز مرة أخرى بنفس الرقم.
      const batchKeys = new Set<string>();
      const accepted = newSerials.filter(s => {
        const key = normalizeForCompare(s.serial);
        if (!key || activeKeys.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });
      const rejected = newSerials.filter(s => {
        const key = normalizeForCompare(s.serial);
        return !key || activeKeys.has(key);
      });
      rejected.forEach(s => console.warn(`[Serial] skipped active duplicate: ${s.serial}`));
      accepted.forEach(s => saveToFirebase('serials', s.id, s));
      return { ...prev, serials: [...prev.serials, ...accepted] };
    });
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
    setState(prev => {
      const newState = {
        ...prev,
        customers: prev.customers.map(c => c.id === customer.id ? customer : c),
        saleInvoices: prev.saleInvoices.map(inv => inv.customerId === customer.id ? { ...inv, customerName: customer.name } : inv),
        purchaseInvoices: prev.purchaseInvoices.map(inv => inv.supplierId === customer.id ? { ...inv, supplierName: customer.name } : inv),
        payments: prev.payments.map(p => p.referenceId === customer.id ? { ...p, referenceName: customer.name } : p),
        treasuryTransactions: prev.treasuryTransactions.map(t => t.referenceId === customer.id
          ? { ...t, description: t.description.replace(/- .*$/, `- ${customer.name}`), partyName: customer.name }
          : t),
      };
      saveToFirebase('customers', customer.id, customer);
      newState.saleInvoices.filter(inv => inv.customerId === customer.id).forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      newState.purchaseInvoices.filter(inv => inv.supplierId === customer.id).forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));
      newState.payments.filter(p => p.referenceId === customer.id).forEach(p => saveToFirebase('payments', p.id, p));
      newState.treasuryTransactions.filter(t => t.referenceId === customer.id).forEach(t => saveToFirebase('treasuryTransactions', t.id, t));
      return newState;
    });
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
    setState(prev => {
      const newState = {
        ...prev,
        suppliers: prev.suppliers.map(s => s.id === supplier.id ? supplier : s),
        purchaseInvoices: prev.purchaseInvoices.map(inv => inv.supplierId === supplier.id ? { ...inv, supplierName: supplier.name } : inv),
        saleInvoices: prev.saleInvoices.map(inv => inv.customerId === supplier.id ? { ...inv, customerName: supplier.name } : inv),
        payments: prev.payments.map(p => p.referenceId === supplier.id ? { ...p, referenceName: supplier.name } : p),
        treasuryTransactions: prev.treasuryTransactions.map(t => t.referenceId === supplier.id
          ? { ...t, description: t.description.replace(/- .*$/, `- ${supplier.name}`), partyName: supplier.name }
          : t),
      };
      saveToFirebase('suppliers', supplier.id, supplier);
      newState.purchaseInvoices.filter(inv => inv.supplierId === supplier.id).forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));
      newState.saleInvoices.filter(inv => inv.customerId === supplier.id).forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      newState.payments.filter(p => p.referenceId === supplier.id).forEach(p => saveToFirebase('payments', p.id, p));
      newState.treasuryTransactions.filter(t => t.referenceId === supplier.id).forEach(t => saveToFirebase('treasuryTransactions', t.id, t));
      return newState;
    });
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
          supplier.totalInvoices = (supplier.totalInvoices || 0) + invoice.total;
          supplier.totalPaid = (supplier.totalPaid || 0) + invoice.paid;
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
              const normalizedSerial = normalizeForCompare(sl.serial);
              const serialToSell = [...newState.serials].reverse().find(s =>
                normalizeForCompare(s.serial) === normalizedSerial && s.status === 'available'
              );
              if (!serialToSell) return;
              newState.serials = newState.serials.map(s => {
                if (s.id !== serialToSell.id) return s;
                const updated = { ...s, status: 'sold' as const, saleInvoiceId: invoice.id, salePrice: item.unitPrice };
                updatedSerials.push(updated);
                return updated;
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

      const touchSerialByValue = (
        serialValue: string,
        predicate: (s: SerialItem) => boolean,
        updater: (s: SerialItem) => SerialItem
      ) => {
        const target = [...newState.serials].reverse().find(s =>
          normalizeForCompare(s.serial) === normalizeForCompare(serialValue) && predicate(s)
        );
        if (!target) return;
        const updated = updater(target);
        newState.serials = newState.serials.map(s => s.id === target.id ? updated : s);
        changedSerials.set(updated.id, updated);
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
            touchSerialByValue(
              sl.serial,
              s => s.saleInvoiceId === oldInvoice.id,
              s => ({ ...s, status: 'available', saleInvoiceId: undefined, salePrice: undefined })
            );
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
            touchSerialByValue(
              sl.serial,
              s => s.status === 'available',
              s => ({ ...s, status: 'sold', saleInvoiceId: invoice.id, salePrice: item.unitPrice })
            );
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
      const removedSerialIds: string[] = [];
      const restoredProducts: Product[] = [];

      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'serial') {
          (item.serials || []).forEach(sl => {
            const serialRecord = newState.serials.find(s =>
              normalizeForCompare(s.serial) === normalizeForCompare(sl.serial) &&
              s.saleInvoiceId === invoiceId
            );
            if (!serialRecord) return;

            // لو فاتورة الشراء الأصلية ما زالت موجودة، يرجع الجهاز للمخزون.
            // لو فاتورة الشراء حُذفت بالفعل، نحذف سجل السيريال بدل إنشاء مخزون وهمي.
            const purchaseStillExists = !serialRecord.purchaseInvoiceId ||
              newState.purchaseInvoices.some(p => p.id === serialRecord.purchaseInvoiceId);

            if (purchaseStillExists) {
              const updated = { ...serialRecord, status: 'available' as const, saleInvoiceId: undefined, salePrice: undefined };
              newState.serials = newState.serials.map(s => s.id === serialRecord.id ? updated : s);
              restoredSerials.push(updated);
            } else {
              newState.serials = newState.serials.filter(s => s.id !== serialRecord.id);
              removedSerialIds.push(serialRecord.id);
            }
          });
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

      // حذف أثر الفاتورة من الحساب والخزينة. إجمالي المدفوع يُعاد حسابه
      // من الدفعات الفعلية، لأن دفعة يدوية قد تكون ما زالت رصيدًا للطرف.
      const salePartyId = invoice.customerId;
      const salePartyInvoiceTotal = newState.saleInvoices
        .filter(i => i.customerId === salePartyId)
        .reduce((sum, i) => sum + i.total, 0);
      const salePartyPaidTotal = newState.payments
        .filter(p => p.referenceId === salePartyId)
        .reduce((sum, p) => sum + p.amount, 0);
      newState.customers = newState.customers.map(c => c.id === salePartyId ? {
        ...c,
        totalInvoices: salePartyInvoiceTotal + newState.purchaseInvoices.filter(i => i.supplierId === salePartyId).reduce((sum, i) => sum + i.total, 0),
        totalPaid: salePartyPaidTotal,
      } : c);
      newState.suppliers = newState.suppliers.map(s => s.id === salePartyId ? {
        ...s,
        totalInvoices: salePartyInvoiceTotal + newState.purchaseInvoices.filter(i => i.supplierId === salePartyId).reduce((sum, i) => sum + i.total, 0),
        totalPaid: salePartyPaidTotal,
      } : s);

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - invoice.paid : newState.bankBalance;
      }

      const removedTreasuryIds = newState.treasuryTransactions
        .filter(t => t.referenceId === invoiceId)
        .map(t => t.id);
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== invoiceId);
      removedTreasuryIds.forEach(id => deleteFromFirebase('treasuryTransactions', id));
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoiceId}`);

      deleteFromFirebase('saleInvoices', invoiceId);
      deleteFromFirebase('payments', `paid_${invoiceId}`);
      newState.customers.filter(c => c.id === invoice.customerId).forEach(c => saveToFirebase('customers', c.id, c));
      newState.suppliers.filter(s => s.id === invoice.customerId).forEach(s => saveToFirebase('suppliers', s.id, s));
      restoredSerials.forEach(s => saveToFirebase('serials', s.id, s));
      removedSerialIds.forEach(id => deleteFromFirebase('serials', id));
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
      } else {
        const customerIdx = newState.customers.findIndex(c => c.id === invoice.supplierId);
        if (customerIdx >= 0) {
          const customer = { ...newState.customers[customerIdx] };
          customer.totalInvoices = (customer.totalInvoices || 0) + invoice.total;
          customer.totalPaid = (customer.totalPaid || 0) + invoice.paid;
          newState.customers = newState.customers.map(c => c.id === invoice.supplierId ? customer : c);
        }
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
      const updatedCustomerParty = newState.customers.find(c => c.id === invoice.supplierId);
      if (updatedCustomerParty) saveToFirebase('customers', updatedCustomerParty.id, updatedCustomerParty);
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
      const changedProducts: Product[] = [];
      const changedSerials: SerialItem[] = [];
      const removedSerialIds: string[] = [];

      // 1) نعكس كمية المنتجات العادية من الفاتورة القديمة ثم نطبق الجديدة.
      oldInvoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'normal') {
          newState.products = newState.products.map(p => p.id === item.productId
            ? { ...p, stock: Math.max(0, p.stock - item.quantity) }
            : p);
        }
      });
      invoice.items.forEach(item => {
        const product = newState.products.find(p => p.id === item.productId);
        if (product?.productType === 'normal') {
          newState.products = newState.products.map(p => {
            if (p.id !== item.productId) return p;
            const updated = { ...p, stock: p.stock + item.quantity };
            changedProducts.push(updated);
            return updated;
          });
        }
      });

      // 2) نزامن سيريالات الفاتورة: المتاح القديم الذي أزيل من الفاتورة يُحذف،
      // والسيريالات الجديدة تُضاف، والمباع يحتفظ بحالته التاريخية.
      const requestedSerials = new Map<string, { item: InvoiceItem; line: NonNullable<InvoiceItem['serials']>[number] }>();
      invoice.items.forEach(item => (item.serials || []).forEach(line => {
        requestedSerials.set(normalizeForCompare(line.serial), { item, line });
      }));

      const existingForInvoice = newState.serials.filter(s => s.purchaseInvoiceId === invoice.id);
      newState.serials = newState.serials.filter(s => {
        if (s.purchaseInvoiceId !== invoice.id) return true;
        const key = normalizeForCompare(s.serial);
        if (requestedSerials.has(key)) return true;
        if (s.status === 'available' || s.status === 'returned') {
          removedSerialIds.push(s.id);
          return false;
        }
        return true;
      });

      requestedSerials.forEach(({ item, line }) => {
        const existing = newState.serials.find(s =>
          s.purchaseInvoiceId === invoice.id &&
          normalizeForCompare(s.serial) === normalizeForCompare(line.serial)
        );
        const product = newState.products.find(p => p.id === item.productId);
        if (existing) {
          const updated = {
            ...existing,
            productId: item.productId,
            productName: product?.name || item.productName,
            serial: line.serial,
            imei1: line.imei1 || undefined,
            imei2: line.imei2 || undefined,
            costPrice: item.unitPrice,
            purchasePricePending: item.unitPrice === 0,
          };
          newState.serials = newState.serials.map(s => s.id === existing.id ? updated : s);
          changedSerials.push(updated);
        } else {
          const created: SerialItem = {
            id: generateId(),
            productId: item.productId,
            productName: product?.name || item.productName,
            serial: line.serial,
            imei1: line.imei1 || undefined,
            imei2: line.imei2 || undefined,
            status: 'available',
            purchaseInvoiceId: invoice.id,
            costPrice: item.unitPrice,
            purchasePricePending: item.unitPrice === 0,
            createdAt: new Date().toISOString(),
          };
          newState.serials.push(created);
          changedSerials.push(created);
        }
      });

      // 3) نعكس أثر الخزينة القديمة ونبني أثر الفاتورة الجديدة.
      if (oldInvoice.paid > 0) {
        const oldTreasury = oldInvoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = oldTreasury === 'cash' ? newState.cashBalance + oldInvoice.paid : newState.cashBalance;
        newState.bankBalance = oldTreasury === 'bank' ? newState.bankBalance + oldInvoice.paid : newState.bankBalance;
      }
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== oldInvoice.id);
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoice.id}`);
      deleteFromFirebase('payments', `paid_${invoice.id}`);

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
        newState.payments.push(autoPayment);
        saveToFirebase('payments', autoPayment.id, autoPayment);
      }

      // 4) totals للطرف تُحسب من الحركات الفعلية، فلا يهم هل الطرف عميل أم مورد.
      const partyIds = new Set([oldInvoice.supplierId, invoice.supplierId]);
      partyIds.forEach(id => {
        const salesTotal = newState.saleInvoices.filter(i => i.customerId === id).reduce((sum, i) => sum + i.total, 0);
        const purchasesTotal = newState.purchaseInvoices.filter(i => i.supplierId === id).reduce((sum, i) => sum + i.total, 0);
        const paidTotal = newState.payments.filter(p => p.referenceId === id).reduce((sum, p) => sum + p.amount, 0);
        newState.customers = newState.customers.map(c => c.id === id ? { ...c, totalInvoices: salesTotal + purchasesTotal, totalPaid: paidTotal } : c);
        newState.suppliers = newState.suppliers.map(s => s.id === id ? { ...s, totalInvoices: salesTotal + purchasesTotal, totalPaid: paidTotal } : s);
      });

      saveToFirebase('purchaseInvoices', invoice.id, invoice);
      changedProducts.forEach(p => saveToFirebase('products', p.id, p));
      changedSerials.forEach(s => saveToFirebase('serials', s.id, s));
      removedSerialIds.forEach(id => deleteFromFirebase('serials', id));
      partyIds.forEach(id => {
        const c = newState.customers.find(x => x.id === id);
        const s = newState.suppliers.find(x => x.id === id);
        if (c) saveToFirebase('customers', c.id, c);
        if (s) saveToFirebase('suppliers', s.id, s);
      });

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

      // حذف فاتورة الشراء يجب أن يزيل الجهاز من المخزون، لكن لا نمسح
      // السجل التاريخي لو كان الجهاز قد تم بيعه بالفعل. في هذه الحالة
      // نفصل السيريال عن فاتورة الشراء المحذوفة ونبقيه مرتبطًا بفاتورة البيع،
      // حتى يظل التتبع التاريخي سليمًا، ثم عند حذف فاتورة البيع يمكن تنظيفه.
      const removedSerialIds: string[] = [];
      const changedSerialsAfterPurchaseDelete: SerialItem[] = [];
      newState.serials = newState.serials.filter(s => {
        if (s.purchaseInvoiceId !== invoiceId) return true;

        if (s.status === 'sold' || s.status === 'transferred') {
          const historical = {
            ...s,
            purchaseInvoiceId: undefined,
          };
          changedSerialsAfterPurchaseDelete.push(historical);
          return true;
        }

        removedSerialIds.push(s.id);
        return false;
      });

      let updatedSupplier: Supplier | null = null;
      const purchasePartyId = invoice.supplierId;
      const purchasePartyInvoiceTotal = newState.purchaseInvoices
        .filter(i => i.supplierId === purchasePartyId)
        .reduce((sum, i) => sum + i.total, 0);
      const purchasePartySalesTotal = newState.saleInvoices
        .filter(i => i.customerId === purchasePartyId)
        .reduce((sum, i) => sum + i.total, 0);
      const purchasePartyPaidTotal = newState.payments
        .filter(p => p.referenceId === purchasePartyId)
        .reduce((sum, p) => sum + p.amount, 0);
      newState.suppliers = newState.suppliers.map((s): Supplier => {
        if (s.id === purchasePartyId) {
          const updated: Supplier = {
            ...s,
            totalInvoices: purchasePartyInvoiceTotal + purchasePartySalesTotal,
            totalPaid: purchasePartyPaidTotal,
          };
          updatedSupplier = updated;
          return updated;
        }
        return s;
      });
      newState.customers = newState.customers.map(c => c.id === purchasePartyId ? {
        ...c,
        totalInvoices: purchasePartyInvoiceTotal + purchasePartySalesTotal,
        totalPaid: purchasePartyPaidTotal,
      } : c);

      if (invoice.paid > 0) {
        const treasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance + invoice.paid : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance + invoice.paid : newState.bankBalance;
      }
      const removedTreasuryIds = newState.treasuryTransactions
        .filter(t => t.referenceId === invoiceId)
        .map(t => t.id);
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== invoiceId);
      removedTreasuryIds.forEach(id => deleteFromFirebase('treasuryTransactions', id));
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoiceId}`);
      deleteFromFirebase('payments', `paid_${invoiceId}`);

      deleteFromFirebase('purchaseInvoices', invoiceId);
      if (updatedSupplier !== null) {
        const ss = updatedSupplier as Supplier;
        saveToFirebase('suppliers', ss.id, ss);
      }
      const updatedCustomerParty = newState.customers.find(c => c.id === invoice.supplierId);
      if (updatedCustomerParty) saveToFirebase('customers', updatedCustomerParty.id, updatedCustomerParty);
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      changedSerialsAfterPurchaseDelete.forEach(s => saveToFirebase('serials', s.id, s));
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

      // كشف الحساب الموحد يعتمد على الحركة نفسها، لذلك الدفعة تعدل الطرف
      // سواء كان محفوظًا في العملاء أو الموردين.
      newState.customers = newState.customers.map(c => c.id === payment.referenceId
        ? { ...c, totalPaid: (c.totalPaid || 0) + payment.amount }
        : c);
      newState.suppliers = newState.suppliers.map(s => s.id === payment.referenceId
        ? { ...s, totalPaid: (s.totalPaid || 0) + payment.amount }
        : s);

      if (payment.direction === 'in') {
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance + payment.amount : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance + payment.amount : newState.bankBalance;
        if (payment.type === 'sale') {
          changedCustomer = newState.customers.find(c => c.id === payment.referenceId) || null;
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
          changedSupplier = newState.suppliers.find(s => s.id === payment.referenceId) || null;
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
      const partyCustomer = newState.customers.find(c => c.id === payment.referenceId);
      const partySupplier = newState.suppliers.find(s => s.id === payment.referenceId);
      if (partyCustomer) saveToFirebase('customers', partyCustomer.id, partyCustomer);
      if (partySupplier) saveToFirebase('suppliers', partySupplier.id, partySupplier);
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

  // ==================== EMPLOYEES (العاملين) ====================
  const addEmployee = useCallback((employee: Employee): { success: boolean; message?: string } => {
    let isDuplicate = false;
    setState(prev => {
      const exists = prev.employees.some(e => e.name.trim().toLowerCase() === employee.name.trim().toLowerCase());
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, employees: [...prev.employees, employee] };
    });
    if (isDuplicate) return { success: false, message: `يوجد عامل بنفس الاسم: ${employee.name}` };
    saveToFirebase('employees', employee.id, employee);
    return { success: true };
  }, []);

  const updateEmployee = useCallback((employee: Employee) => {
    setState(prev => ({ ...prev, employees: prev.employees.map(e => e.id === employee.id ? employee : e) }));
    saveToFirebase('employees', employee.id, employee);
  }, []);

  const deleteEmployee = useCallback((id: string) => {
    setState(prev => ({ ...prev, employees: prev.employees.filter(e => e.id !== id) }));
    deleteFromFirebase('employees', id);
  }, []);

  const addPartyMoneyMovement = useCallback((
    partyType: 'partner' | 'employee',
    partyId: string,
    partyName: string,
    treasury: 'cash' | 'bank',
    direction: 'in' | 'out',
    amount: number,
    note: string,
  ): { success: boolean; message?: string } => {
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من صفر' };
    let result: { success: boolean; message?: string } = { success: true };
    setState(prev => {
      const currentBalance = treasury === 'cash' ? prev.cashBalance : prev.bankBalance;
      if (direction === 'out' && amount > currentBalance) {
        result = { success: false, message: `الرصيد المتاح في ${treasury === 'cash' ? 'الخزينة' : 'البنك'} غير كافٍ` };
        return prev;
      }
      const type: TreasuryTransaction['type'] = partyType === 'partner'
        ? (direction === 'in' ? 'partner_in' : 'partner_out')
        : (direction === 'in' ? 'employee_in' : 'employee_out');
      const transaction: TreasuryTransaction = {
        id: `tr_${generateId()}`,
        type,
        description: `${direction === 'in' ? 'استلام من' : 'سحب إلى'} ${partyType === 'partner' ? 'الشريك' : 'العامل'}: ${partyName}${note ? ` — ${note}` : ''}`,
        amount, treasury, direction, referenceId: partyId, partyType, partyName,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      };
      const next = {
        ...prev,
        cashBalance: treasury === 'cash' ? (direction === 'in' ? prev.cashBalance + amount : prev.cashBalance - amount) : prev.cashBalance,
        bankBalance: treasury === 'bank' ? (direction === 'in' ? prev.bankBalance + amount : prev.bankBalance - amount) : prev.bankBalance,
        treasuryTransactions: [...prev.treasuryTransactions, transaction],
      };
      saveToFirebase('treasuryTransactions', transaction.id, transaction);
      return next;
    });
    return result;
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
  // استعادة نسخة احتياطية كاملة: لازم تكتب كل عنصر فعليًا على Firebase
  // مش بس تغيّر الحالة المحلية (state) - وإلا الاستعادة تفضل حبيسة في المتصفح
  // اللي عمل فيه الاستعادة بس، ومتظهرش على أي متصفح/جهاز تاني.
  const restoreFullState = useCallback(async (restored: AppState) => {
    setState(restored);

    const collections: Array<[string, unknown[]]> = [
      ['products', restored.products],
      ['serials', restored.serials],
      ['customers', restored.customers],
      ['suppliers', restored.suppliers],
      ['saleInvoices', restored.saleInvoices],
      ['purchaseInvoices', restored.purchaseInvoices],
      ['payments', restored.payments],
      ['expenses', restored.expenses],
      ['noonOrders', restored.noonOrders],
      ['brands', restored.brands],
      ['dailyJournals', restored.dailyJournals],
      ['partners', restored.partners],
      ['profitDistributions', restored.profitDistributions],
      ['employees', restored.employees],
      ['treasuryTransactions', restored.treasuryTransactions],
      ['dailyClosings', restored.dailyClosings],
      ['weeklyInventoryCounts', restored.weeklyInventoryCounts || []],
      ['stockTransfers', restored.stockTransfers || []],
      ['dailyOperations', restored.dailyOperations || []],
      ['dailyInventoryScans', restored.dailyInventoryScans || []],
    ];

    for (const [collectionName, items] of collections) {
      for (const item of items) {
        const id = (item as { id?: string }).id;
        if (id) await saveToFirebase(collectionName, id, item);
      }
    }

    await saveToFirebase('settings', 'main', restored.settings);
    await saveToFirebase('treasury', 'main', {
      cashBalance: restored.cashBalance,
      bankBalance: restored.bankBalance,
    });

    treasurySyncRef.current = {
      ready: true,
      syncedTxIds: new Set(restored.treasuryTransactions.map(t => t.id)),
      syncedClosingIds: new Set(restored.dailyClosings.map(c => c.id)),
    };
  }, []);

  /**
   * يبدأ دورة تشغيل جديدة للنظام.
   *
   * يتم التنفيذ على Firebase أولًا (وليس على React state فقط) حتى يختفي
   * الأثر القديم من كل الأجهزة والمتصفحات بعد إعادة التحميل.
   *
   * يتم الاحتفاظ بالـ master data: المنتجات، البراندات، العملاء، الموردين،
   * الشركاء والعاملين، وإعدادات الشركة.
   * وتُصفّر حسابات العملاء والموردين ومخزون المنتجات، بينما تُحذف كل
   * المعاملات/الأجهزة/الأوردرات/الجرد والحركات المالية الخاصة بالدورة السابقة.
   */
  const resetAllData = useCallback(async () => {
    treasurySyncRef.current = { ready: false, syncedTxIds: new Set(), syncedClosingIds: new Set() };

    try {
      // اقرأ آخر master data من Firebase قبل التنفيذ حتى لا نعتمد على state قديم.
      const [products, customers, suppliers, brands, partners, employees, settingsRows] = await Promise.all([
        loadCollection<Product>('products'),
        loadCollection<Customer>('customers'),
        loadCollection<Supplier>('suppliers'),
        loadCollection<Brand>('brands'),
        loadCollection<Partner>('partners'),
        loadCollection<Employee>('employees'),
        loadCollection<AppSettings>('settings'),
      ]);

      const now = new Date().toISOString();

      // المنتجات تفضل، لكن المخزون يبدأ من صفر.
      const resetProducts = products.map(product => ({
        ...product,
        stock: 0,
        updatedAt: now,
      }));

      // أسماء/بيانات العملاء تفضل، لكن حساباتهم تبدأ من الصفر.
      const resetCustomers = customers.map(customer => ({
        ...customer,
        openingBalance: 0,
        totalInvoices: 0,
        totalPaid: 0,
      }));

      // الموردون تفضل أسماؤهم وبياناتهم، لكن حساباتهم تبدأ من الصفر.
      const resetSuppliers = suppliers.map(supplier => ({
        ...supplier,
        openingBalance: 0,
        totalInvoices: 0,
        totalPaid: 0,
      }));

      // اكتب البيانات المحتفظ بها أولًا وبشكل strict حتى لا نعلن نجاحًا مع فشل جزئي.
      await Promise.all([
        ...resetProducts.map(product => saveToFirebaseStrict('products', product.id, product)),
        ...resetCustomers.map(customer => saveToFirebaseStrict('customers', customer.id, customer)),
        ...resetSuppliers.map(supplier => saveToFirebaseStrict('suppliers', supplier.id, supplier)),
      ]);

      // كل ما يلي هو تاريخ/حركة الدورة القديمة، لذلك يُحذف من Firebase فعلًا.
      const collectionsToDelete = [
        'serials',
        'saleInvoices',
        'purchaseInvoices',
        'payments',
        'expenses',
        'noonOrders',
        'dailyJournals',
        'profitDistributions',
        'treasuryTransactions',
        'dailyClosings',
        'weeklyInventoryCounts',
        'stockTransfers',
        'dailyOperations',
        'dailyInventoryScans',
      ];
      await Promise.all(collectionsToDelete.map(collectionName => deleteCollectionFromFirebase(collectionName)));

      // إعدادات الشركة تفضل، مع إعادة عدادات الفواتير للبداية.
      const currentSettings = settingsRows.find(item => (item as AppSettings & { id?: string }).id === 'main');
      const nextSettings: AppSettings = {
        ...(currentSettings || generateDemoData().settings),
        lastSaleInvoiceNum: 0,
        lastPurchaseInvoiceNum: 0,
      };
      await saveToFirebaseStrict('settings', 'main', nextSettings);
      await saveToFirebaseStrict('treasury', 'main', { cashBalance: 0, bankBalance: 0 });

      // حدّث الواجهة فقط بعد نجاح Firebase بالكامل.
      setState(prev => ({
        ...prev,
        products: resetProducts,
        serials: [],
        customers: resetCustomers,
        suppliers: resetSuppliers,
        saleInvoices: [],
        purchaseInvoices: [],
        payments: [],
        expenses: [],
        noonOrders: [],
        dailyJournals: [],
        profitDistributions: [],
        treasuryTransactions: [],
        dailyClosings: [],
        weeklyInventoryCounts: [],
        stockTransfers: [],
        dailyOperations: [],
        dailyInventoryScans: [],
        cashBalance: 0,
        bankBalance: 0,
        settings: nextSettings,
        brands,
        partners,
        employees,
      }));

      treasurySyncRef.current = {
        ready: true,
        syncedTxIds: new Set(),
        syncedClosingIds: new Set(),
      };
    } catch (error) {
      console.error('[Firebase] start-new-cycle failed:', error);
      treasurySyncRef.current.ready = true;
      throw error;
    }
  }, []);

  const deleteAllNoonOrders = useCallback(async () => {
    treasurySyncRef.current.ready = false;
    try {
      await deleteCollectionFromFirebase('noonOrders');
      setState(prev => ({ ...prev, noonOrders: [] }));
    } finally {
      treasurySyncRef.current.ready = true;
    }
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

      const calc = (id: string) => {
        const sales = prev.saleInvoices.filter(i => i.customerId === id);
        const purchases = prev.purchaseInvoices.filter(i => i.supplierId === id);
        const partyPayments = prev.payments.filter(p => p.referenceId === id);
        return {
          totalInvoices: sales.reduce((s, i) => s + i.total, 0) + purchases.reduce((s, i) => s + i.total, 0),
          totalPaid: partyPayments.reduce((s, p) => s + p.amount, 0),
        };
      };

      newState.customers = prev.customers.map(c => {
        const totals = calc(c.id);
        if (totals.totalInvoices !== (c.totalInvoices || 0) || totals.totalPaid !== (c.totalPaid || 0)) {
          fixedCustomers++;
          const updated = { ...c, ...totals };
          saveToFirebase('customers', updated.id, updated);
          return updated;
        }
        return c;
      });

      newState.suppliers = prev.suppliers.map(s => {
        const totals = calc(s.id);
        if (totals.totalInvoices !== (s.totalInvoices || 0) || totals.totalPaid !== (s.totalPaid || 0)) {
          fixedSuppliers++;
          const updated = { ...s, ...totals };
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
    addEmployee, updateEmployee, deleteEmployee, addPartyMoneyMovement,
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
    isLoading: !hydrated,
    loadError,
  };
}
