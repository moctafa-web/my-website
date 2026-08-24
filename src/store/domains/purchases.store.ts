import { AppState, Payment, PurchaseInvoice, SerialItem } from '../../types';
import { generateId } from '../../utils/helpers';
import { makeTransactionId, makePendingPaymentId, makePendingInvoiceId } from './id.store';

export interface PendingPurchaseInput {
  serialId: string;
  newCostPrice: number;
  supplierId: string;
  supplierName: string;
  paymentMethod: 'cash' | 'bank' | 'credit';
  paidAmount: number;
  invoiceNumber: string;
}

export interface PersistCallbacks {
  save: (collectionName: string, id: string, data: unknown) => void | Promise<void>;
}

export const completePendingPurchaseState = (
  prev: AppState,
  input: PendingPurchaseInput,
  persist: PersistCallbacks,
): { state: AppState; result: { success: boolean; message?: string } } => {
  let result: { success: boolean; message?: string } = { success: true };
  const { serialId, newCostPrice, supplierId, supplierName, paymentMethod, paidAmount, invoiceNumber } = input;
  let nextState: AppState | undefined;
  const updater = (prevState: AppState): AppState => {
  
    const serial = prevState.serials.find(s => s.id === serialId);
    if (!serial) {
      result = { success: false, message: 'السيريال غير موجود' };
      return prevState;
    }
    if (!serial.purchasePricePending && serial.costPrice !== 0) {
      result = { success: false, message: 'هذا السيريال لديه سعر شراء مسجل بالفعل' };
      return prevState;
    }
  
    const newState = { ...prevState };
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
        // ✅ نضيف الدفعة الجديدة (لو اتدفعت وقت استكمال السعر) لإجمالي المدفوع في الفاتورة
        const newPaid = (oldInvoice.paid || 0) + (paymentMethod !== 'credit' ? paidAmount : 0);
        const newRemaining = newSubtotal - newPaid;
        updatedPurchaseInvoice = {
          ...oldInvoice,
          items: updatedItems,
          subtotal: newSubtotal,
          total: newSubtotal,
          paid: newPaid,
          remaining: Math.max(0, newRemaining),
          status: newRemaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid',
        };
        newState.purchaseInvoices = newState.purchaseInvoices.map(inv =>
          inv.id === serial.purchaseInvoiceId ? updatedPurchaseInvoice! : inv
        );
        const priceDiff = newCostPrice - serial.costPrice;
        if (priceDiff !== 0 || paidAmount > 0) {
          newState.suppliers = newState.suppliers.map(s => {
            if (s.id !== oldInvoice.supplierId) return s;
            return {
              ...s,
              totalInvoices: (s.totalInvoices || 0) + priceDiff,
              totalPaid: (s.totalPaid || 0) + (paymentMethod !== 'credit' ? paidAmount : 0),
            };
          });
        }
        // ✅ نفس منطق إضافة فاتورة شراء عادية: لو اتدفع مبلغ وقت استكمال السعر،
        // لازم يتخصم من الخزنة (كاش/بنك) ويظهر كحركة خزينة ودفعة في كشف حساب المورد
        if (paidAmount > 0 && paymentMethod !== 'credit') {
          const treasury = paymentMethod === 'cash' ? 'cash' : 'bank';
          newState.cashBalance = treasury === 'cash' ? newState.cashBalance - paidAmount : newState.cashBalance;
          newState.bankBalance = treasury === 'bank' ? newState.bankBalance - paidAmount : newState.bankBalance;
          newState.treasuryTransactions = [...newState.treasuryTransactions, {
            id: makeTransactionId(),
            type: 'purchase',
            description: `استكمال سعر شراء ${serial.productName} - سيريال ${serial.serial} - فاتورة ${oldInvoice.invoiceNumber}`,
            amount: paidAmount,
            treasury,
            direction: 'out',
            referenceId: oldInvoice.id,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          }];
          const autoPayment: Payment = {
            id: makePendingPaymentId(serialId),
            type: 'purchase',
            referenceId: oldInvoice.supplierId,
            referenceName: oldInvoice.supplierName,
            amount: paidAmount,
            paymentMethod,
            direction: 'out',
            date: new Date().toISOString().split('T')[0],
            notes: `دفعة عند استكمال سعر شراء معلّق - فاتورة ${oldInvoice.invoiceNumber}`,
            createdAt: new Date().toISOString(),
          };
          newState.payments = [...newState.payments, autoPayment];
          persist.save('payments', autoPayment.id, autoPayment);
        }
        // ✅ لو السيريال ده كان اتباع قبل ما نستكمل السعر، لازم نصحح تكلفته في فاتورة البيع
        // عشان تقرير الأرباح يحسب المكسب/الخسارة الصح (مش على أساس تكلفة صفر أو مؤقتة)
        if (serial.status === 'sold' && serial.saleInvoiceId) {
          const saleInv = newState.saleInvoices.find(si => si.id === serial.saleInvoiceId);
          if (saleInv) {
            let touched = false;
            const updatedSaleItems = saleInv.items.map(item => {
              const lines = item.serials || [];
              const hasThisSerial = lines.some(sl => sl.serial === serial.serial);
              // بنعدّل التكلفة بس لو البند ده بيمثل السيريال ده لوحده (عشان مفيش قيمة تكلفة واحدة تمثل أكتر من سيريال بسعر مختلف)
              if (hasThisSerial && lines.length === 1) {
                touched = true;
                return { ...item, costPrice: newCostPrice, pendingCost: false };
              }
              return item;
            });
            if (touched) {
              const updatedSaleInvoice = { ...saleInv, items: updatedSaleItems };
              newState.saleInvoices = newState.saleInvoices.map(si => si.id === saleInv.id ? updatedSaleInvoice : si);
              persist.save('saleInvoices', updatedSaleInvoice.id, updatedSaleInvoice);
            }
          }
        }
      }
    } else {
      const product = newState.products.find(p => p.id === serial.productId);
      const invoiceId = makePendingInvoiceId();
      const total = newCostPrice;
      const remaining = total - paidAmount;
      const newInvoice: PurchaseInvoice = {
        id: invoiceId,
        invoiceNumber,
        supplierId,
        supplierName,
        date: new Date().toISOString().split('T')[0],
        items: [{
          id: `item_${generateId()}`,
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
          id: makeTransactionId(),
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
  
    persist.save('serials', updatedSerial.id, updatedSerial);
    if (updatedPurchaseInvoice) persist.save('purchaseInvoices', updatedPurchaseInvoice.id, updatedPurchaseInvoice);
    const updatedProduct = newState.products.find(p => p.id === serial.productId);
    if (updatedProduct) persist.save('products', updatedProduct.id, updatedProduct);
    const updatedSupplier = newState.suppliers.find(s =>
      s.id === supplierId ||
      s.id === prevState.purchaseInvoices.find(inv => inv.id === serial.purchaseInvoiceId)?.supplierId
    );
    if (updatedSupplier) persist.save('suppliers', updatedSupplier.id, updatedSupplier);
  
    return newState;
  };
  nextState = updater(prev);
  return { state: nextState, result };
};
