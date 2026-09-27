import { generateId } from '../../utils/helpers';

export const makeTransactionId = () => `tr_${generateId()}`;
export const makePendingPaymentId = (serialId: string) => `paid_pending_${serialId}_${generateId()}`;
export const makePendingInvoiceId = () => `inv_pending_${generateId()}`;
export const makeInventoryCountId = () => `count-${generateId()}`;
