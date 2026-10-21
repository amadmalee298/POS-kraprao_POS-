import { useCallback, useMemo } from 'react';
import { usePOS } from '../context/POSContext';
import { isVatRegistered } from '../utils/accounting';
import { buildGlLines, JournalEntry, thaiDay } from '../utils/ledger';
import { usePayables, useReceivables } from './useArAp';
import { useKeyedList } from './useKeyedList';

const journalTime = (j: JournalEntry) => j.createdAt;

/**
 * The branch's general ledger lines (from the shop's records and the owner's journals).
 * `lazy`: not built on every change, only when `buildLines()` is called (e.g. for an export):
 * building them for thousands of orders froze pages that only needed them for a download.
 */
export function useLedger(opts: { lazy?: boolean } = {}) {
  const pos = usePOS();
  const { settings, currentBranch } = pos;
  const [journals, setJournals] = useKeyedList<JournalEntry>('journals', 'POS_JOURNALS', journalTime);
  const [receivables] = useReceivables();
  const [payables] = usePayables();
  const today = thaiDay(new Date().toISOString());
  const branchId = currentBranch?.id || 'all';
  const branchJournals = useMemo(() => journals.filter(j => !j.branchId || j.branchId === branchId), [journals, branchId]);
  const input = useMemo(
    () => ({
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
  const lines = useMemo(() => (opts.lazy ? NO_LINES : buildGlLines(input)), [opts.lazy, input]);
  const buildLines = useCallback(() => (opts.lazy ? buildGlLines(input) : lines), [opts.lazy, input, lines]);
  return { lines, buildLines, journals: branchJournals, setJournals, branchId, today };
}

const NO_LINES: ReturnType<typeof buildGlLines> = [];
