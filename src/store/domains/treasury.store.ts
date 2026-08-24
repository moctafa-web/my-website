import { AppState, TreasuryTransaction } from '../../types';
import { generateId, getTodayStr } from '../../utils/helpers';

export const createTreasuryTransaction = (
  type: TreasuryTransaction['type'],
  description: string,
  amount: number,
  treasury: TreasuryTransaction['treasury'],
  direction: TreasuryTransaction['direction'],
  referenceId?: string,
): TreasuryTransaction => ({
  id: `tr_${generateId()}`,
  type,
  description,
  amount,
  treasury,
  direction,
  referenceId,
  date: getTodayStr(),
  createdAt: new Date().toISOString(),
});

export const applyTreasuryChange = (state: AppState, treasury: 'cash' | 'bank', amount: number, direction: 'in' | 'out', description: string): AppState => {
  const transaction = createTreasuryTransaction('adjustment', description, amount, treasury, direction);
  return {
    ...state,
    cashBalance: treasury === 'cash' ? (direction === 'in' ? state.cashBalance + amount : state.cashBalance - amount) : state.cashBalance,
    bankBalance: treasury === 'bank' ? (direction === 'in' ? state.bankBalance + amount : state.bankBalance - amount) : state.bankBalance,
    treasuryTransactions: [...state.treasuryTransactions, transaction],
  };
};
