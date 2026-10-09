import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState, Product, Customer, Supplier, Party, SaleInvoice, PurchaseInvoice,
  Payment, Expense, TreasuryTransaction, NoonOrder, NoonAdjustment, DailyClosing, InvoiceItem,
  DailyJournal, SerialItem, Brand, AppSettings, Partner, ProfitDistribution,
  WeeklyInventoryCount, StockTransfer, DailyOperationEntry, DailyInventoryScan, Employee
} from '../types';
import { normalizeForCompare, generateId, normalizeDateValue } from '../utils/helpers';
import { makeTransactionId } from './domains/id.store';
import { netProfit } from '../utils/noonReturns';
import { applyTreasuryChange } from './domains/treasury.store';
import { completePendingPurchaseState } from './domains/purchases.store';
import { generateDemoData } from '../lib/demo-data';
import { saveToFirebase, saveToFirebaseStrict, deleteFromFirebase, loadCollection, deleteCollectionFromFirebase } from '../services/firebasePersistence';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';


const partyKey = (name: string) => normalizeForCompare(name || '');

const reconcilePartyInvoicePayments = (
  saleInvoices: SaleInvoice[],
  purchaseInvoices: PurchaseInvoice[],
  payments: Payment[],
  partyId: string,
  side: 'sale' | 'purchase',
): { sales: SaleInvoice[]; purchases: PurchaseInvoice[] } => {
  const isSale = side === 'sale';
  const invoices = (isSale ? saleInvoices : purchaseInvoices)
    .filter(inv => (isSale ? (inv as SaleInvoice).customerId : (inv as PurchaseInvoice).supplierId) === partyId)
    .filter(inv => inv.status !== 'canceled')
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const createdCompare = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (createdCompare !== 0) return createdCompare;
      return a.id.localeCompare(b.id);
    });

  // The payment created with an invoice is an explicit payment for that invoice.
  // Manual payments are then allocated FIFO across the remaining invoice balances.
  const autoPaidByInvoice = new Map<string, number>();
  const manualPayments = payments
    .filter(p => p.referenceId === partyId && (isSale ? p.direction === 'in' : p.direction === 'out'))
    .filter(p => {
      if (p.id.startsWith('paid_')) {
        const invoiceId = p.id.slice(5);
        if (invoices.some(inv => inv.id === invoiceId)) {
          autoPaidByInvoice.set(invoiceId, Math.max(0, Number(p.amount || 0)));
          return false;
        }
      }
      return p.type === side || p.type === 'opening';
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const createdCompare = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (createdCompare !== 0) return createdCompare;
      return a.id.localeCompare(b.id);
    });

  const allocated = new Map<string, number>();
  invoices.forEach(inv => allocated.set(inv.id, Math.min(inv.total, autoPaidByInvoice.get(inv.id) || 0)));

  for (const payment of manualPayments) {
    let remainingPayment = Math.max(0, Number(payment.amount || 0));
    for (const inv of invoices) {
      if (remainingPayment <= 0) break;
      const alreadyPaid = allocated.get(inv.id) || 0;
      const available = Math.max(0, inv.total - alreadyPaid);
      if (available <= 0) continue;
      const applied = Math.min(remainingPayment, available);
      allocated.set(inv.id, alreadyPaid + applied);
      remainingPayment -= applied;
    }
  }

  const nextInvoices = invoices.map(inv => {
    const paid = Math.min(inv.total, Math.max(0, allocated.get(inv.id) || 0));
    const remaining = Math.max(0, inv.total - paid);
    return { ...inv, paid, remaining, status: remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' } as typeof inv;
  });
  const nextById = new Map(nextInvoices.map(inv => [inv.id, inv]));

  return {
    sales: isSale ? saleInvoices.map(inv => nextById.get(inv.id) || inv) : saleInvoices,
    purchases: isSale ? purchaseInvoices : purchaseInvoices.map(inv => nextById.get(inv.id) || inv),
  };
};

const customerFromParty = (party: Party): Customer => ({
  id: party.id, name: party.name, phone: party.phone, email: party.email, address: party.address,
  type: party.roles.supplier && !party.roles.customer ? 'trader' : 'individual',
  openingBalance: party.openingBalance, totalInvoices: 0, totalPaid: 0, notes: party.notes, createdAt: party.createdAt,
});

const supplierFromParty = (party: Party): Supplier => ({
  id: party.id, name: party.name, phone: party.phone, email: party.email, address: party.address,
  type: party.roles.customer && party.roles.supplier ? 'both' : 'supplier',
  // Legacy supplier balance is represented as the opposite side of the unified opening balance.
  openingBalance: Math.max(0, -party.openingBalance), totalInvoices: 0, totalPaid: 0, notes: party.notes, createdAt: party.createdAt,
});

const buildUnifiedParties = (customers: Customer[], suppliers: Supplier[]): { parties: Party[]; customerMap: Map<string,string>; supplierMap: Map<string,string> } => {
  const byName = new Map<string, Party>();
  const customerMap = new Map<string,string>();
  const supplierMap = new Map<string,string>();
  const ensure = (id: string, name: string, side: 'customer'|'supplier', data: Customer|Supplier) => {
    const key = partyKey(name);
    let party = byName.get(key);
    if (!party) {
      party = { id, name: data.name, phone: data.phone, email: data.email, address: data.address, roles: { customer: false, supplier: false }, openingBalance: 0, notes: data.notes, createdAt: data.createdAt || new Date().toISOString() };
      byName.set(key, party);
    } else {
      party.phone ||= data.phone; party.email ||= data.email; party.address ||= data.address; party.notes ||= data.notes;
    }
    if (side === 'customer') { party.roles.customer = true; party.openingBalance += Number((data as Customer).openingBalance || 0); customerMap.set(id, party.id); }
    else { party.roles.supplier = true; party.openingBalance -= Number((data as Supplier).openingBalance || 0); supplierMap.set(id, party.id); }
  };
  customers.forEach(c => ensure(c.id, c.name, 'customer', c));
  suppliers.forEach(s => ensure(s.id, s.name, 'supplier', s));
  return { parties: [...byName.values()], customerMap, supplierMap };
};

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
          stockTransfers, dailyOperations, dailyInventoryScans, partiesRows,
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
          loadCollection<Party>('parties'),
          loadCollection<AppSettings>('settings'),
          loadCollection<{ cashBalance: number; bankBalance: number }>('treasury'),
        ]);

        if (cancelled) return;

        // Keep the loaded products unchanged; import logic determines product type explicitly.
        const normalizedProducts = products;

        // ==================== توحيد الحسابات القديمة ====================
        // نبني حسابًا واحدًا لكل اسم، ثم نعيد ربط كل الفواتير والدفعات بنفس الـID.
        // لو قاعدة الأطراف الموحدة موجودة بالفعل، نستخدمها كمصدر الحقيقة.
        // ده يمنع إعادة جمع الرصيد الافتتاحي من سجلات customers/suppliers
        // في كل تحميل وبالتالي يمنع تضاعف الرصيد السالب أو الموجب.
        let canonicalParties: Party[];
        let canonicalCustomerMap: Map<string,string>;
        let canonicalSupplierMap: Map<string,string>;
        if (partiesRows.length > 0) {
          // لو اتكرر نفس الحساب الموحد في Firebase (مثلاً نفس اسم التاجر
          // بسجلين مختلفين)، نحتفظ بأول ID ثابت ونضم إليه بيانات السجلات الأخرى.
          // بعد ذلك كل الفواتير والدفعات ستُعاد ربطها بهذا الـID الواحد.
          const mergedByName = new Map<string, Party>();
          const duplicatePartyIds: string[] = [];
          partiesRows.forEach(rawParty => {
            const key = partyKey(rawParty.name);
            const existing = mergedByName.get(key);
            if (!existing) {
              mergedByName.set(key, { ...rawParty, roles: { ...rawParty.roles } });
              return;
            }
            existing.roles.customer = existing.roles.customer || rawParty.roles.customer;
            existing.roles.supplier = existing.roles.supplier || rawParty.roles.supplier;
            existing.phone ||= rawParty.phone;
            existing.email ||= rawParty.email;
            existing.address ||= rawParty.address;
            existing.notes ||= rawParty.notes;
            existing.openingBalance += Number(rawParty.openingBalance || 0);
            duplicatePartyIds.push(rawParty.id);
          });
          canonicalParties = [...mergedByName.values()];
          const byName = new Map(canonicalParties.map(p => [partyKey(p.name), p.id]));
          canonicalCustomerMap = new Map(customers.map(c => [c.id, byName.get(partyKey(c.name)) || c.id]));
          canonicalSupplierMap = new Map(suppliers.map(s => [s.id, byName.get(partyKey(s.name)) || s.id]));
          duplicatePartyIds.forEach(id => void deleteFromFirebase('parties', id));
        } else {
          const unified = buildUnifiedParties(customers, suppliers);
          canonicalParties = unified.parties;
          canonicalCustomerMap = unified.customerMap;
          canonicalSupplierMap = unified.supplierMap;
        }
        const migratedSaleInvoices = saleInvoices.map(inv => {
          const id = canonicalCustomerMap.get(inv.customerId) || inv.customerId;
          const party = canonicalParties.find(p => p.id === id);
          return party ? { ...inv, customerId: id, customerName: party.name } : inv;
        });
        const migratedPurchaseInvoices = purchaseInvoices.map(inv => {
          const id = canonicalSupplierMap.get(inv.supplierId) || inv.supplierId;
          const party = canonicalParties.find(p => p.id === id);
          return party ? { ...inv, supplierId: id, supplierName: party.name } : inv;
        });
        const migratedPayments = payments.map(payment => {
          const id = canonicalCustomerMap.get(payment.referenceId) || canonicalSupplierMap.get(payment.referenceId) || payment.referenceId;
          const party = canonicalParties.find(p => p.id === id);
          return party ? { ...payment, referenceId: id, referenceName: party.name } : payment;
        });
        // كل طرف أصبح متاحًا في شاشتي البيع والشراء؛ الدور يحدد الاستخدام وليس مكان تخزين الحساب.
        const unifiedCustomers = canonicalParties.map(customerFromParty);
        const unifiedSuppliers = canonicalParties.map(supplierFromParty);
        canonicalParties.forEach(party => {
          void saveToFirebase('parties', party.id, party);
        });
        // إزالة سجلات العملاء/الموردين القديمة التي تم دمجها تحت ID موحد.
        customers.forEach(c => { const canonicalId = canonicalCustomerMap.get(c.id); if (canonicalId && canonicalId !== c.id) void deleteFromFirebase('customers', c.id); });
        suppliers.forEach(s => { const canonicalId = canonicalSupplierMap.get(s.id); if (canonicalId && canonicalId !== s.id) void deleteFromFirebase('suppliers', s.id); });
        migratedSaleInvoices.forEach(inv => { if (inv.customerId !== saleInvoices.find(x => x.id === inv.id)?.customerId || inv.customerName !== saleInvoices.find(x => x.id === inv.id)?.customerName) void saveToFirebase('saleInvoices', inv.id, inv); });
        migratedPurchaseInvoices.forEach(inv => { if (inv.supplierId !== purchaseInvoices.find(x => x.id === inv.id)?.supplierId || inv.supplierName !== purchaseInvoices.find(x => x.id === inv.id)?.supplierName) void saveToFirebase('purchaseInvoices', inv.id, inv); });
        migratedPayments.forEach(payment => { const old = payments.find(x => x.id === payment.id); if (old && (old.referenceId !== payment.referenceId || old.referenceName !== payment.referenceName)) void saveToFirebase('payments', payment.id, { ...payment, date: normalizeDateValue(payment.date) }); });

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
          customers: unifiedCustomers,
          suppliers: unifiedSuppliers,
          parties: canonicalParties,
          saleInvoices: migratedSaleInvoices,
          purchaseInvoices: migratedPurchaseInvoices,
          payments: migratedPayments,
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


  // ==================== UNIFIED PARTIES / ACCOUNTS ====================
  const addParty = useCallback((party: Party): { success: boolean; message?: string } => {
    const normalizedName = partyKey(party.name);
    let duplicate = false;
    setState(prev => {
      if ((prev.parties || []).some(p => partyKey(p.name) === normalizedName)) { duplicate = true; return prev; }
      const nextCustomers = [...prev.customers, customerFromParty(party)];
      const nextSuppliers = [...prev.suppliers, supplierFromParty(party)];
      return { ...prev, parties: [...(prev.parties || []), party], customers: nextCustomers, suppliers: nextSuppliers };
    });
    if (duplicate) return { success: false, message: `يوجد حساب بنفس الاسم بالفعل: ${party.name}` };
    saveToFirebase('parties', party.id, party);
    saveToFirebase('customers', party.id, customerFromParty(party));
    saveToFirebase('suppliers', party.id, supplierFromParty(party));
    return { success: true };
  }, []);

  const updateParty = useCallback((party: Party) => {
    setState(prev => {
      const nextCustomer = customerFromParty(party);
      const nextSupplier = supplierFromParty(party);
      const newState = {
        ...prev,
        parties: (prev.parties || []).map(p => p.id === party.id ? party : p),
        customers: prev.customers.map(c => c.id === party.id ? nextCustomer : c),
        suppliers: prev.suppliers.map(s => s.id === party.id ? nextSupplier : s),
        saleInvoices: prev.saleInvoices.map(inv => inv.customerId === party.id ? { ...inv, customerName: party.name } : inv),
        purchaseInvoices: prev.purchaseInvoices.map(inv => inv.supplierId === party.id ? { ...inv, supplierName: party.name } : inv),
        payments: prev.payments.map(p => p.referenceId === party.id ? { ...p, referenceName: party.name } : p),
        treasuryTransactions: prev.treasuryTransactions.map(t => t.referenceId === party.id ? { ...t, description: t.description.replace(/- .*$/, `- ${party.name}`), partyName: party.name } : t),
      };
      saveToFirebase('parties', party.id, party);
      saveToFirebase('customers', party.id, nextCustomer);
      saveToFirebase('suppliers', party.id, nextSupplier);
      newState.saleInvoices.filter(i => i.customerId === party.id).forEach(i => saveToFirebase('saleInvoices', i.id, i));
      newState.purchaseInvoices.filter(i => i.supplierId === party.id).forEach(i => saveToFirebase('purchaseInvoices', i.id, i));
      newState.payments.filter(p => p.referenceId === party.id).forEach(p => saveToFirebase('payments', p.id, p));
      newState.treasuryTransactions.filter(t => t.referenceId === party.id).forEach(t => saveToFirebase('treasuryTransactions', t.id, t));
      return newState;
    });
  }, []);

  const deleteParty = useCallback((id: string): { success: boolean; message?: string } => {
    let blocked = false;
    setState(prev => {
      const hasHistory = prev.saleInvoices.some(i => i.customerId === id) || prev.purchaseInvoices.some(i => i.supplierId === id) || prev.payments.some(p => p.referenceId === id);
      if (hasHistory) { blocked = true; return prev; }
      return { ...prev, parties: (prev.parties || []).filter(p => p.id !== id), customers: prev.customers.filter(c => c.id !== id), suppliers: prev.suppliers.filter(s => s.id !== id) };
    });
    if (blocked) return { success: false, message: 'لا يمكن حذف الحساب لأنه مرتبط بفواتير أو دفعات. احتفظ بالتاريخ ويمكنك تعديل بياناته.' };
    deleteFromFirebase('parties', id); deleteFromFirebase('customers', id); deleteFromFirebase('suppliers', id);
    return { success: true };
  }, []);

  // ==================== CUSTOMERS ====================
  const addCustomer = useCallback((customer: Customer): { success: boolean; message?: string } => {
    const normalizedName = normalizeForCompare(customer.name);
    const normalizedPhone = normalizeForCompare(customer.phone || '');
    let isDuplicate = false;
    setState(prev => {
      const exists = (prev.parties || []).some(p => partyKey(p.name) === normalizedName) || prev.customers.some(c =>
        normalizeForCompare(c.name) === normalizedName &&
        normalizeForCompare(c.phone || '') === normalizedPhone
      );
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, customers: [...prev.customers, customer] };
    });
    if (isDuplicate) return { success: false, message: `يوجد حساب بنفس الاسم بالفعل: ${customer.name}` };
    const party: Party = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, roles: { customer: true, supplier: false }, openingBalance: customer.openingBalance || 0, notes: customer.notes, createdAt: customer.createdAt };
    setState(prev => ({ ...prev, parties: [...(prev.parties || []), party], suppliers: [...prev.suppliers, supplierFromParty(party)] }));
    saveToFirebase('parties', party.id, party);
    saveToFirebase('suppliers', party.id, supplierFromParty(party));
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
      const exists = (prev.parties || []).some(p => partyKey(p.name) === normalizedName) || prev.suppliers.some(s => normalizeForCompare(s.name) === normalizedName);
      if (exists) { isDuplicate = true; return prev; }
      return { ...prev, suppliers: [...prev.suppliers, supplier] };
    });
    if (isDuplicate) return { success: false, message: `يوجد حساب بنفس الاسم بالفعل: ${supplier.name}` };
    const party: Party = { id: supplier.id, name: supplier.name, phone: supplier.phone, email: supplier.email, address: supplier.address, roles: { customer: false, supplier: true }, openingBalance: -(supplier.openingBalance || 0), notes: supplier.notes, createdAt: supplier.createdAt };
    setState(prev => ({ ...prev, parties: [...(prev.parties || []), party], customers: [...prev.customers, customerFromParty(party)] }));
    saveToFirebase('parties', party.id, party);
    saveToFirebase('customers', party.id, customerFromParty(party));
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

      const oldAutoPayment = newState.payments.find(p => p.id === `paid_${oldInvoice.id}`);
      const oldInvoiceTreasury = newState.treasuryTransactions.find(t => t.referenceId === oldInvoice.id);
      const autoPaymentAmount = oldAutoPayment?.amount || 0;
      const invoiceTreasuryAmount = oldInvoiceTreasury?.amount || 0;

      touchParty(oldInvoice.customerId, { invoices: -(oldInvoice.total), paid: -(oldInvoice.paid) });

      const oldInvoicePaidAmount = invoiceTreasuryAmount || autoPaymentAmount;
      if (oldInvoicePaidAmount > 0) {
        const oldTreasury = oldInvoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = oldTreasury === 'cash' ? newState.cashBalance - oldInvoicePaidAmount : newState.cashBalance;
        newState.bankBalance = oldTreasury === 'bank' ? newState.bankBalance - oldInvoicePaidAmount : newState.bankBalance;
      }

      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== oldInvoice.id);
      // نحتفظ بقيمة الدفعة المسجلة مع الفاتورة كما هي. لا نستخدم invoice.paid هنا
      // لأنه قد يشمل دفعات يدوية لاحقة، وإعادة تسجيله كاملًا كانت تسبب تكرار السداد.
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

      if (autoPaymentAmount > 0) {
        const newTreasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = newTreasury === 'cash' ? newState.cashBalance + autoPaymentAmount : newState.cashBalance;
        newState.bankBalance = newTreasury === 'bank' ? newState.bankBalance + autoPaymentAmount : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: oldInvoiceTreasury?.id || makeTransactionId(),
          type: 'sale',
          description: `فاتورة مبيعات ${invoice.invoiceNumber} - ${invoice.customerName}`,
          amount: invoiceTreasuryAmount || autoPaymentAmount,
          treasury: newTreasury,
          direction: 'in',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: oldInvoiceTreasury?.createdAt || new Date().toISOString(),
        }];
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'sale',
          referenceId: invoice.customerId,
          referenceName: invoice.customerName,
          amount: autoPaymentAmount,
          paymentMethod: invoice.paymentMethod,
          direction: 'in',
          date: invoice.date,
          notes: oldAutoPayment?.notes || `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: oldAutoPayment?.createdAt || new Date().toISOString(),
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
      const oldAutoPayment = newState.payments.find(p => p.id === `paid_${oldInvoice.id}`);
      const oldInvoiceTreasury = newState.treasuryTransactions.find(t => t.referenceId === oldInvoice.id);
      const autoPaymentAmount = oldAutoPayment?.amount || 0;
      const invoiceTreasuryAmount = oldInvoiceTreasury?.amount || 0;
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
      const oldInvoicePaidAmount = invoiceTreasuryAmount || autoPaymentAmount;
      if (oldInvoicePaidAmount > 0) {
        const oldTreasury = oldInvoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = oldTreasury === 'cash' ? newState.cashBalance + oldInvoicePaidAmount : newState.cashBalance;
        newState.bankBalance = oldTreasury === 'bank' ? newState.bankBalance + oldInvoicePaidAmount : newState.bankBalance;
      }
      newState.treasuryTransactions = newState.treasuryTransactions.filter(t => t.referenceId !== oldInvoice.id);
      newState.payments = newState.payments.filter(p => p.id !== `paid_${invoice.id}`);
      deleteFromFirebase('payments', `paid_${invoice.id}`);

      if (autoPaymentAmount > 0) {
        const newTreasury = invoice.paymentMethod === 'cash' ? 'cash' : 'bank';
        newState.cashBalance = newTreasury === 'cash' ? newState.cashBalance - autoPaymentAmount : newState.cashBalance;
        newState.bankBalance = newTreasury === 'bank' ? newState.bankBalance - autoPaymentAmount : newState.bankBalance;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: oldInvoiceTreasury?.id || makeTransactionId(),
          type: 'purchase',
          description: `فاتورة مشتريات ${invoice.invoiceNumber} - ${invoice.supplierName}`,
          amount: invoiceTreasuryAmount || autoPaymentAmount,
          treasury: newTreasury,
          direction: 'out',
          referenceId: invoice.id,
          date: invoice.date,
          createdAt: oldInvoiceTreasury?.createdAt || new Date().toISOString(),
        }];
        const autoPayment: Payment = {
          id: `paid_${invoice.id}`,
          type: 'purchase',
          referenceId: invoice.supplierId,
          referenceName: invoice.supplierName,
          amount: autoPaymentAmount,
          paymentMethod: invoice.paymentMethod,
          direction: 'out',
          date: invoice.date,
          notes: oldAutoPayment?.notes || `دفعة مسجلة مع فاتورة ${invoice.invoiceNumber}`,
          createdAt: oldAutoPayment?.createdAt || new Date().toISOString(),
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
      // حماية من التكرار: نفس الدفعة (نفس الطرف/المبلغ/الاتجاه/الطريقة/التاريخ/الملاحظة)
      // اتسجلت قبل أقل من 10 ثواني، أو نفس الـ id، يبقى ضغطة مزدوجة وبنتجاهلها.
      const nowMs = Date.parse(payment.createdAt) || Date.now();
      const isDuplicate = prev.payments.some(p =>
        p.id === payment.id ||
        (p.referenceId === payment.referenceId &&
          p.amount === payment.amount &&
          p.direction === payment.direction &&
          p.paymentMethod === payment.paymentMethod &&
          normalizeDateValue(p.date) === normalizeDateValue(payment.date) &&
          (p.notes || '') === (payment.notes || '') &&
          !p.id.startsWith('paid_') &&
          Math.abs(nowMs - (Date.parse(p.createdAt) || 0)) < 10000));
      if (isDuplicate) return prev;
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
        if (payment.type === 'sale' || payment.type === 'opening') {
          changedCustomer = newState.customers.find(c => c.id === payment.referenceId) || null;
          const reconciled = reconcilePartyInvoicePayments(
            newState.saleInvoices,
            newState.purchaseInvoices,
            newState.payments,
            payment.referenceId,
            'sale',
          );
          newState.saleInvoices = reconciled.sales;
          changedSaleInvoices.push(...newState.saleInvoices.filter(inv => inv.customerId === payment.referenceId));
        }
      } else {
        newState.cashBalance = treasury === 'cash' ? newState.cashBalance - payment.amount : newState.cashBalance;
        newState.bankBalance = treasury === 'bank' ? newState.bankBalance - payment.amount : newState.bankBalance;
        if (payment.type === 'purchase' || payment.type === 'opening') {
          changedSupplier = newState.suppliers.find(s => s.id === payment.referenceId) || null;
          const reconciled = reconcilePartyInvoicePayments(
            newState.saleInvoices,
            newState.purchaseInvoices,
            newState.payments,
            payment.referenceId,
            'purchase',
          );
          newState.purchaseInvoices = reconciled.purchases;
          changedPurchaseInvoices.push(...newState.purchaseInvoices.filter(inv => inv.supplierId === payment.referenceId));
        }
      }

      const treasuryTransaction: TreasuryTransaction = {
        id: makeTransactionId(),
        type: payment.direction === 'in' ? 'payment_in' : 'payment_out',
        description: payment.notes || `دفعة - ${payment.referenceName}`,
        amount: payment.amount,
        treasury,
        direction: payment.direction,
        referenceId: payment.referenceId,
        sourceId: payment.id,
        date: normalizeDateValue(payment.date),
        createdAt: new Date().toISOString(),
      };
      newState.treasuryTransactions = [...newState.treasuryTransactions, treasuryTransaction];

      saveToFirebase('payments', payment.id, payment);
      saveToFirebase('treasuryTransactions', treasuryTransaction.id, treasuryTransaction);
      saveToFirebase('treasury', 'main', { cashBalance: newState.cashBalance, bankBalance: newState.bankBalance });
      const partyCustomer = newState.customers.find(c => c.id === payment.referenceId);
      const partySupplier = newState.suppliers.find(s => s.id === payment.referenceId);
      if (partyCustomer) saveToFirebase('customers', partyCustomer.id, partyCustomer);
      if (partySupplier) saveToFirebase('suppliers', partySupplier.id, partySupplier);
      changedSaleInvoices.forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      changedPurchaseInvoices.forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));

      return newState;
    });
  }, []);


  // ==================== QUICK TREASURY MOVEMENTS ====================
  const addTreasuryTransfer = useCallback((from: 'cash' | 'bank', to: 'cash' | 'bank', amount: number, date: string, note: string): { success: boolean; message?: string } => {
    if (from === to) return { success: false, message: 'اختار خزانتين مختلفتين للتحويل' };
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من صفر' };
    let result: { success: boolean; message?: string } = { success: true };
    setState(prev => {
      const sourceBalance = from === 'cash' ? prev.cashBalance : prev.bankBalance;
      if (amount > sourceBalance) {
        result = { success: false, message: `الرصيد المتاح في ${from === 'cash' ? 'الكاش' : 'البنك'} غير كافٍ` };
        return prev;
      }
      const now = new Date().toISOString();
      const txOut: TreasuryTransaction = { id: makeTransactionId(), type: 'transfer', description: note || `تحويل من ${from === 'cash' ? 'الكاش' : 'البنك'} إلى ${to === 'cash' ? 'الكاش' : 'البنك'}`, amount, treasury: from, direction: 'out', date: normalizeDateValue(date), createdAt: now };
      const txIn: TreasuryTransaction = { id: makeTransactionId(), type: 'transfer', description: note || `تحويل من ${from === 'cash' ? 'الكاش' : 'البنك'} إلى ${to === 'cash' ? 'الكاش' : 'البنك'}`, amount, treasury: to, direction: 'in', date: normalizeDateValue(date), createdAt: now };
      const next = {
        ...prev,
        cashBalance: prev.cashBalance + (to === 'cash' ? amount : 0) - (from === 'cash' ? amount : 0),
        bankBalance: prev.bankBalance + (to === 'bank' ? amount : 0) - (from === 'bank' ? amount : 0),
        treasuryTransactions: [...prev.treasuryTransactions, txOut, txIn],
      };
      saveToFirebase('treasuryTransactions', txOut.id, txOut);
      saveToFirebase('treasuryTransactions', txIn.id, txIn);
      saveToFirebase('treasury', 'main', { cashBalance: next.cashBalance, bankBalance: next.bankBalance });
      return next;
    });
    return result;
  }, []);

  const addTreasuryAdjustment = useCallback((direction: 'in' | 'out', amount: number, treasury: 'cash' | 'bank', date: string, description: string): { success: boolean; message?: string } => {
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'المبلغ يجب أن يكون أكبر من صفر' };
    let result: { success: boolean; message?: string } = { success: true };
    setState(prev => {
      const balance = treasury === 'cash' ? prev.cashBalance : prev.bankBalance;
      if (direction === 'out' && amount > balance) { result = { success: false, message: `الرصيد المتاح في ${treasury === 'cash' ? 'الكاش' : 'البنك'} غير كافٍ` }; return prev; }
      const tx: TreasuryTransaction = { id: makeTransactionId(), type: 'adjustment', description, amount, treasury, direction, date: normalizeDateValue(date), createdAt: new Date().toISOString() };
      const next = { ...prev, cashBalance: treasury === 'cash' ? (direction === 'in' ? prev.cashBalance + amount : prev.cashBalance - amount) : prev.cashBalance, bankBalance: treasury === 'bank' ? (direction === 'in' ? prev.bankBalance + amount : prev.bankBalance - amount) : prev.bankBalance, treasuryTransactions: [...prev.treasuryTransactions, tx] };
      saveToFirebase('treasuryTransactions', tx.id, tx);
      saveToFirebase('treasury', 'main', { cashBalance: next.cashBalance, bankBalance: next.bankBalance });
      return next;
    });
    return result;
  }, []);

  // إلغاء دفعة يدوية: يرجّع الرصيد (كاش/بنك) وحركة الخزنة وحالة الفواتير وإجماليات الطرف
  const deletePayment = useCallback((paymentId: string): { success: boolean; message?: string } => {
    let result: { success: boolean; message?: string } = { success: true };
    setState(prev => {
      const payment = prev.payments.find(p => p.id === paymentId);
      if (!payment) return prev;
      if (paymentId.startsWith('paid_')) {
        result = { success: false, message: 'دي دفعة مرتبطة بفاتورة. عدّل الفاتورة نفسها أو احذفها.' };
        return prev;
      }
      result = { success: true };

      const treasury = payment.paymentMethod === 'cash' ? 'cash' : 'bank';
      const newState = { ...prev, payments: prev.payments.filter(p => p.id !== paymentId) };

      // عكس أثر الدفعة على الخزنة
      const sign = payment.direction === 'in' ? -1 : 1;
      if (treasury === 'cash') newState.cashBalance = prev.cashBalance + sign * payment.amount;
      else newState.bankBalance = prev.bankBalance + sign * payment.amount;

      // حذف حركة الخزنة المرتبطة بالدفعة
      const matchingType = payment.direction === 'in' ? 'payment_in' : 'payment_out';
      const matching = prev.treasuryTransactions.find(t => t.sourceId === paymentId)
        || prev.treasuryTransactions.find(t => !t.sourceId && t.referenceId === payment.referenceId && t.type === matchingType && t.amount === payment.amount && t.createdAt >= payment.createdAt);
      if (matching) newState.treasuryTransactions = prev.treasuryTransactions.filter(t => t.id !== matching.id);

      // إجماليات الطرف
      newState.customers = prev.customers.map(c => c.id === payment.referenceId ? { ...c, totalPaid: Math.max(0, (c.totalPaid || 0) - payment.amount) } : c);
      newState.suppliers = prev.suppliers.map(s => s.id === payment.referenceId ? { ...s, totalPaid: Math.max(0, (s.totalPaid || 0) - payment.amount) } : s);

      // إعادة توزيع الدفعات على الفواتير بعد الإلغاء
      const side: 'sale' | 'purchase' = payment.direction === 'in' ? 'sale' : 'purchase';
      const reconciled = reconcilePartyInvoicePayments(newState.saleInvoices, newState.purchaseInvoices, newState.payments, payment.referenceId, side);
      newState.saleInvoices = reconciled.sales;
      newState.purchaseInvoices = reconciled.purchases;

      deleteFromFirebase('payments', paymentId);
      if (matching) deleteFromFirebase('treasuryTransactions', matching.id);
      saveToFirebase('treasury', 'main', { cashBalance: newState.cashBalance, bankBalance: newState.bankBalance });
      const c = newState.customers.find(x => x.id === payment.referenceId); if (c) saveToFirebase('customers', c.id, c);
      const sp = newState.suppliers.find(x => x.id === payment.referenceId); if (sp) saveToFirebase('suppliers', sp.id, sp);
      if (side === 'sale') newState.saleInvoices.filter(inv => inv.customerId === payment.referenceId).forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      else newState.purchaseInvoices.filter(inv => inv.supplierId === payment.referenceId).forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));

      return newState;
    });
    return result;
  }, []);

  // تعديل دفعة يدوية (المبلغ / الطريقة / التاريخ / الملاحظات) مع تصحيح الخزنة والفواتير
  const updatePayment = useCallback((paymentId: string, patch: Partial<Pick<Payment, 'amount' | 'paymentMethod' | 'date' | 'notes' | 'instapayPerson'>>) => {
    setState(prev => {
      const old = prev.payments.find(p => p.id === paymentId);
      if (!old || paymentId.startsWith('paid_')) return prev;
      const amount = patch.amount !== undefined ? Number(patch.amount) : old.amount;
      if (!(amount > 0)) return prev;

      const updated: Payment = { ...old, ...patch, amount, date: patch.date ? normalizeDateValue(patch.date) : old.date };
      if (updated.instapayPerson === undefined || updated.instapayPerson === '') delete updated.instapayPerson;

      const oldT = old.paymentMethod === 'cash' ? 'cash' : 'bank';
      const newT = updated.paymentMethod === 'cash' ? 'cash' : 'bank';
      const sign = old.direction === 'in' ? 1 : -1; // أثر الدفعة على رصيد الخزنة
      let cash = prev.cashBalance;
      let bank = prev.bankBalance;
      if (oldT === 'cash') cash -= sign * old.amount; else bank -= sign * old.amount;
      if (newT === 'cash') cash += sign * amount; else bank += sign * amount;

      const diff = amount - old.amount;
      const newState = {
        ...prev,
        cashBalance: cash,
        bankBalance: bank,
        payments: prev.payments.map(p => p.id === paymentId ? updated : p),
        customers: prev.customers.map(c => c.id === old.referenceId ? { ...c, totalPaid: Math.max(0, (c.totalPaid || 0) + diff) } : c),
        suppliers: prev.suppliers.map(s2 => s2.id === old.referenceId ? { ...s2, totalPaid: Math.max(0, (s2.totalPaid || 0) + diff) } : s2),
      };

      // حركة الخزنة المرتبطة
      const matchingType = old.direction === 'in' ? 'payment_in' : 'payment_out';
      const matching = prev.treasuryTransactions.find(t => t.sourceId === paymentId)
        || prev.treasuryTransactions.find(t => !t.sourceId && t.referenceId === old.referenceId && t.type === matchingType && t.amount === old.amount && t.createdAt >= old.createdAt);
      let tx: TreasuryTransaction;
      if (matching) {
        tx = { ...matching, amount, treasury: newT, date: normalizeDateValue(updated.date), description: updated.notes || `دفعة - ${old.referenceName}`, sourceId: paymentId };
        newState.treasuryTransactions = prev.treasuryTransactions.map(t => t.id === matching.id ? tx : t);
      } else {
        tx = {
          id: makeTransactionId(),
          type: matchingType,
          description: updated.notes || `دفعة - ${old.referenceName}`,
          amount,
          treasury: newT,
          direction: old.direction,
          referenceId: old.referenceId,
          sourceId: paymentId,
          date: normalizeDateValue(updated.date),
          createdAt: new Date().toISOString(),
        };
        newState.treasuryTransactions = [...prev.treasuryTransactions, tx];
      }

      // إعادة توزيع الدفعات على الفواتير
      const side: 'sale' | 'purchase' = old.direction === 'in' ? 'sale' : 'purchase';
      const reconciled = reconcilePartyInvoicePayments(newState.saleInvoices, newState.purchaseInvoices, newState.payments, old.referenceId, side);
      newState.saleInvoices = reconciled.sales;
      newState.purchaseInvoices = reconciled.purchases;

      saveToFirebase('payments', paymentId, updated);
      saveToFirebase('treasuryTransactions', tx.id, tx);
      saveToFirebase('treasury', 'main', { cashBalance: newState.cashBalance, bankBalance: newState.bankBalance });
      const c = newState.customers.find(x => x.id === old.referenceId); if (c) saveToFirebase('customers', c.id, c);
      const sp = newState.suppliers.find(x => x.id === old.referenceId); if (sp) saveToFirebase('suppliers', sp.id, sp);
      if (side === 'sale') newState.saleInvoices.filter(inv => inv.customerId === old.referenceId).forEach(inv => saveToFirebase('saleInvoices', inv.id, inv));
      else newState.purchaseInvoices.filter(inv => inv.supplierId === old.referenceId).forEach(inv => saveToFirebase('purchaseInvoices', inv.id, inv));

      return newState;
    });
  }, []);

  const updatePaymentDate = useCallback((paymentId: string, date: string) => {
    const normalizedDate = normalizeDateValue(date);
    if (!normalizedDate) return;
    setState(prev => {
      const payment = prev.payments.find(p => p.id === paymentId);
      if (!payment) return prev;
      const payments = prev.payments.map(p => p.id === paymentId ? { ...p, date: normalizedDate } : p);
      const matchingType = payment.direction === 'in' ? 'payment_in' : 'payment_out';
      const matching = prev.treasuryTransactions.find(t => t.sourceId === paymentId)
        || prev.treasuryTransactions.find(t => !t.sourceId && t.referenceId === payment.referenceId && t.type === matchingType && t.amount === payment.amount && t.createdAt >= payment.createdAt);
      const treasuryTransactions = prev.treasuryTransactions.map(t => t.id === matching?.id ? { ...t, date: normalizedDate, sourceId: paymentId } : t);
      const next = { ...prev, payments, treasuryTransactions };
      saveToFirebase('payments', paymentId, payments.find(p => p.id === paymentId)!);
      if (matching) saveToFirebase('treasuryTransactions', matching.id, treasuryTransactions.find(t => t.id === matching.id)!);
      return next;
    });
  }, []);

  const updateSaleInvoiceDate = useCallback((invoiceId: string, date: string) => {
    const normalizedDate = normalizeDateValue(date);
    setState(prev => {
      const invoice = prev.saleInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;
      const saleInvoices = prev.saleInvoices.map(i => i.id === invoiceId ? { ...i, date: normalizedDate } : i);
      const payments = prev.payments.map(p => p.id === `paid_${invoiceId}` ? { ...p, date: normalizedDate } : p);
      const treasuryTransactions = prev.treasuryTransactions.map(t => t.referenceId === invoiceId ? { ...t, date: normalizedDate } : t);
      const next = { ...prev, saleInvoices, payments, treasuryTransactions };
      saveToFirebase('saleInvoices', invoiceId, saleInvoices.find(i => i.id === invoiceId)!);
      const linkedPayment = payments.find(p => p.id === `paid_${invoiceId}`); if (linkedPayment) saveToFirebase('payments', linkedPayment.id, linkedPayment);
      treasuryTransactions.filter(t => t.referenceId === invoiceId).forEach(t => saveToFirebase('treasuryTransactions', t.id, t));
      return next;
    });
  }, []);

  const updatePurchaseInvoiceDate = useCallback((invoiceId: string, date: string) => {
    const normalizedDate = normalizeDateValue(date);
    setState(prev => {
      const invoice = prev.purchaseInvoices.find(i => i.id === invoiceId);
      if (!invoice) return prev;
      const purchaseInvoices = prev.purchaseInvoices.map(i => i.id === invoiceId ? { ...i, date: normalizedDate } : i);
      const payments = prev.payments.map(p => p.id === `paid_${invoiceId}` ? { ...p, date: normalizedDate } : p);
      const treasuryTransactions = prev.treasuryTransactions.map(t => t.referenceId === invoiceId ? { ...t, date: normalizedDate } : t);
      const next = { ...prev, purchaseInvoices, payments, treasuryTransactions };
      saveToFirebase('purchaseInvoices', invoiceId, purchaseInvoices.find(i => i.id === invoiceId)!);
      const linkedPayment = payments.find(p => p.id === `paid_${invoiceId}`); if (linkedPayment) saveToFirebase('payments', linkedPayment.id, linkedPayment);
      treasuryTransactions.filter(t => t.referenceId === invoiceId).forEach(t => saveToFirebase('treasuryTransactions', t.id, t));
      return next;
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
        date: normalizeDateValue(expense.date),
        createdAt: new Date().toISOString(),
      }];
      return newState;
    });
    saveToFirebase('expenses', expense.id, { ...expense, date: normalizeDateValue(expense.date) });
  }, []);

  // ==================== NOON ORDERS ====================
  const addNoonOrder = useCallback((order: NoonOrder): { success: boolean; message?: string; merged?: boolean } => {
    let result: { success: boolean; message?: string; merged?: boolean } = { success: true };
    setState(prev => {
      const normalizedOrderNum = normalizeForCompare(order.orderNumber);
      const existingOrder = prev.noonOrders.find(o => normalizeForCompare(o.orderNumber) === normalizedOrderNum);
      const itemsWithCost: NoonOrder['items'] = order.items.map(item => {
        const matchedSerial = item.serial
          ? prev.serials.find(s => s.serial.trim().toLowerCase() === item.serial!.trim().toLowerCase() && s.status === 'available')
          : undefined;
        const product = matchedSerial
          ? prev.products.find(p => p.id === matchedSerial.productId)
          : prev.products.find(p => p.id === item.productId);
        return {
          ...item,
          productId: product?.id || item.productId,
          productName: product?.name || item.productName,
          upc: item.upc || product?.upc || '',
          serial: matchedSerial?.serial || item.serial,
          imei1: matchedSerial?.imei1 || item.imei1,
          imei2: matchedSerial?.imei2 || item.imei2,
          costPrice: product?.costPrice ?? item.costPrice ?? 0,
        };
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
          const matchedSerial = item.serial
            ? newState.serials.find(s => s.serial.trim().toLowerCase() === item.serial!.trim().toLowerCase() && s.status === 'available')
            : undefined;
          const product = matchedSerial
            ? newState.products.find(p => p.id === matchedSerial.productId)
            : newState.products.find(p => p.id === item.productId);
          return {
            ...item,
            productId: product?.id || item.productId,
            productName: product?.name || item.productName,
            upc: item.upc || product?.upc || '',
            serial: matchedSerial?.serial || item.serial,
            imei1: matchedSerial?.imei1 || item.imei1,
            imei2: matchedSerial?.imei2 || item.imei2,
            costPrice: product?.costPrice ?? item.costPrice ?? 0,
          };
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

  // تسجيل مرتجع (بعد التوصيل): الفلوس ممكن تكون نزلت (settledAmount) فتفضل مستنية خصم نون، أو ماجتش أصلاً
  const returnNoonOrders = useCallback((ids: string[], opts: { date?: string; restock: boolean }) => {
    setState(prev => {
      const today = new Date().toISOString().split('T')[0];
      const newState = { ...prev };
      const updatedProducts: Product[] = [];
      const updatedSerials: SerialItem[] = [];
      const updatedOrders: NoonOrder[] = [];
      newState.noonOrders = prev.noonOrders.map(order => {
        if (!ids.includes(order.id) || order.status === 'canceled') return order;
        const alreadyRestocked = order.status === 'returned' && order.returnRestocked;
        if (order.status === 'returned' && !opts.restock) return order;
        const doRestock = opts.restock && !alreadyRestocked;
        if (doRestock) {
          order.items.forEach(item => {
            const product = newState.products.find(p => p.id === item.productId);
            if (product?.productType === 'serial') {
              const rec = item.serial
                ? newState.serials.find(sr => sr.serial === item.serial)
                : newState.serials.find(sr => sr.productId === item.productId && sr.noonOrderId === order.id);
              if (rec) {
                newState.serials = newState.serials.map(sr => {
                  if (sr.id !== rec.id) return sr;
                  const u = { ...sr, status: 'available' as const, noonOrderId: undefined };
                  updatedSerials.push(u);
                  return u;
                });
              }
            } else {
              newState.products = newState.products.map(p => {
                if (p.id !== item.productId) return p;
                const u = { ...p, stock: p.stock + 1 };
                updatedProducts.push(u);
                return u;
              });
            }
          });
        }
        const updated: NoonOrder = {
          ...order,
          status: 'returned',
          returnedDate: order.returnedDate || opts.date || today,
          returnRestocked: order.returnRestocked || doRestock,
        };
        updated.settlementProfit = updated.settledAmount != null ? netProfit(updated) : updated.settlementProfit;
        updatedOrders.push(updated);
        return updated;
      });
      updatedOrders.forEach(o => saveToFirebase('noonOrders', o.id, o));
      updatedProducts.forEach(p => saveToFirebase('products', p.id, p));
      updatedSerials.forEach(sr => saveToFirebase('serials', sr.id, sr));
      return newState;
    });
  }, []);

  const settleNoonOrders = useCallback((
    settlements: { orderId: string; settledAmount: number; settledDate?: string }[],
    opts?: { actualTotal?: number; adjustments?: { orderId: string; amount: number; kind: NoonAdjustment['kind']; note?: string }[] }
  ) => {
    setState(prev => {
      const newState = { ...prev };
      const today = new Date().toISOString().split('T')[0];
      const valid = settlements.filter(s => prev.noonOrders.some(o => o.id === s.orderId) && s.settledAmount > 0);
      const adjs = (opts?.adjustments || []).filter(a => a.amount > 0 && prev.noonOrders.some(o => o.id === a.orderId));
      const batchDate = valid[0]?.settledDate || today;
      const ordersTotal = valid.reduce((sum, s) => sum + s.settledAmount, 0);
      const adjTotal = adjs.reduce((sum, a) => sum + a.amount, 0);
      const expected = Math.round((ordersTotal - adjTotal) * 100) / 100;
      // الفلوس اللي دخلت البنك فعلاً. الفرق عن المتوقع = مصاريف على الدفعة كلها (بتتوزع على أوردرات الدفعة)
      const actual = opts?.actualTotal !== undefined && !Number.isNaN(opts.actualTotal) ? opts.actualTotal : expected;
      const extraTotal = Math.max(0, Math.round((expected - actual) * 100) / 100);
      const touched = new Map<string, NoonOrder>();
      newState.noonOrders = newState.noonOrders.map(order => {
        const settlement = valid.find(s => s.orderId === order.id);
        const myAdjs = adjs.filter(a => a.orderId === order.id);
        if (!settlement && myAdjs.length === 0) return order;
        let u: NoonOrder = { ...order };
        if (settlement) {
          const extraShare = ordersTotal > 0 ? Math.round(extraTotal * (settlement.settledAmount / ordersTotal) * 100) / 100 : 0;
          u = {
            ...u,
            // المرتجع بيفضل مرتجع (الفلوس نزلت وبتستنى الخصم)، غير كده بيتقفل كمحوّل
            status: order.status === 'returned' ? 'returned' : 'settled',
            settledAmount: settlement.settledAmount,
            settledDate: settlement.settledDate || today,
            settlementExtraFee: extraShare,
          };
        }
        if (myAdjs.length) {
          u.adjustments = [
            ...(u.adjustments || []),
            ...myAdjs.map(a => ({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, date: batchDate, amount: a.amount, kind: a.kind, note: a.note })),
          ];
        }
        if (u.settledAmount != null) u.settlementProfit = netProfit(u);
        touched.set(u.id, u);
        return u;
      });
      if (actual !== 0 && (valid.length > 0 || adjs.length > 0)) {
        newState.bankBalance = newState.bankBalance + actual;
        newState.treasuryTransactions = [...newState.treasuryTransactions, {
          id: makeTransactionId(),
          type: 'sale' as const,
          description: `تسوية تحويل بنكي جماعي - ${valid.length} أوردر${adjs.length ? ` + ${adjs.length} خصم` : ''}${extraTotal > 0 ? ` (مصاريف ${extraTotal})` : ''}`,
          amount: Math.abs(actual),
          treasury: 'bank' as const,
          direction: actual >= 0 ? 'in' as const : 'out' as const,
          date: batchDate,
          createdAt: new Date().toISOString(),
        }];
      }
      touched.forEach(o => saveToFirebase('noonOrders', o.id, o));
      if (actual !== 0) saveToFirebase('treasury', 'main', { cashBalance: newState.cashBalance, bankBalance: newState.bankBalance });
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
    date?: string,
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
        date: normalizeDateValue(date || new Date().toISOString().slice(0, 10)),
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
    const restoredParties = restored.parties?.length ? restored.parties : buildUnifiedParties(restored.customers || [], restored.suppliers || []).parties;
    const normalizedRestored = { ...restored, parties: restoredParties };
    setState(normalizedRestored);

    const collections: Array<[string, unknown[]]> = [
      ['products', restored.products],
      ['serials', restored.serials],
      ['customers', restored.customers],
      ['suppliers', normalizedRestored.suppliers],
      ['parties', normalizedRestored.parties],
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
        parties: [],
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

  const approveWeeklyInventoryCount = useCallback((countId: string): { success: boolean; message?: string } => {
    let result: { success: boolean; message?: string } = { success: true };
    updateState(prev => {
      const count = (prev.weeklyInventoryCounts || []).find(c => c.id === countId);
      if (!count) { result = { success: false, message: 'الجرد غير موجود.' }; return prev; }
      if (count.status === 'approved') return prev;
      const missingIds = new Set(count.missingSerialIds || []);
      let changedSerials = prev.serials;
      if (missingIds.size) {
        changedSerials = prev.serials.map(serial => {
          if (!missingIds.has(serial.id) || serial.status !== 'available') return serial;
          return { ...serial, status: 'missing' as const };
        });
        changedSerials.filter((serial, idx) => serial !== prev.serials[idx]).forEach(serial => saveToFirebase('serials', serial.id, serial));
      }
      const approved = { ...count, status: 'approved' as const, approvedAt: new Date().toISOString() };
      saveToFirebase('weeklyInventoryCounts', approved.id, approved);
      return { ...prev, serials: changedSerials, weeklyInventoryCounts: (prev.weeklyInventoryCounts || []).map(c => c.id === countId ? approved : c) };
    });
    return result;
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
    addParty, updateParty, deleteParty,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addSaleInvoice, updateSaleInvoice, deleteSaleInvoice,
    addPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice,
    completePendingPurchase,
    addPayment, deletePayment, updatePayment,
    updatePaymentDate, updateSaleInvoiceDate, updatePurchaseInvoiceDate,
    addExpense,
    addTreasuryTransfer, addTreasuryAdjustment,
    addNoonOrder, updateNoonOrder, addNoonOrders, settleNoonOrders, returnNoonOrders,
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
    addWeeklyInventoryCount, updateWeeklyInventoryCount, approveWeeklyInventoryCount,
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
