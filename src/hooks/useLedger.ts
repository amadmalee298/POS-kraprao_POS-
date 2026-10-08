import { useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { isVatRegistered } from '../utils/accounting';
import { buildGlLines, JournalEntry, thaiDay } from '../utils/ledger';
import { usePayables, useReceivables } from './useArAp';
import { useKeyedList } from './useKeyedList';

const journalTime = (j: JournalEntry) => j.createdAt;

/** The branch's general ledger lines (from the shop's records and the owner's journals) */
export function useLedger() {
  const pos = usePOS();
  const { settings, currentBranch } = pos;
  const [journals, setJournals] = useKeyedList<JournalEntry>('journals', 'POS_JOURNALS', journalTime);
  const [receivables] = useReceivables();
  const [payables] = usePayables();
  const today = thaiDay(new Date().toISOString());
  const branchId = currentBranch?.id || 'all';
  const branchJournals = useMemo(() => journals.filter(j => !j.branchId || j.branchId === branchId), [journals, branchId]);
  const lines = useMemo(
    () =>
      buildGlLines({
        branchId,
        orders: pos.orders,
        expenses: pos.expenses,
        incomes: pos.incomes || [],
        stockLots: pos.stockLots || [],
        wasteLogs: pos.wasteLogs || [],
        stockLogs: pos.stockAdjustmentLogs || [],
        cashShifts: pos.cashShifts || [],
        journals: branchJournals,
        receivables,
        payables,
        ingredients: pos.ingredients,
        vatRegistered: isVatRegistered(settings),
        vatRate: Number(settings.vatRate) || 7,
        usefulLifeYears: settings.equipmentUsefulLifeYears,
        today,
        startAt: settings.booksStartAt
      }),
    [branchId, pos.orders, pos.expenses, pos.incomes, pos.stockLots, pos.wasteLogs, pos.stockAdjustmentLogs, pos.cashShifts, branchJournals, receivables, payables, pos.ingredients, settings, today]
  );
  return { lines, journals: branchJournals, setJournals, branchId, today };
}
