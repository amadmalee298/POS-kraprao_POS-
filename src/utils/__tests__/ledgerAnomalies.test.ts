import { describe, expect, it } from 'vitest';
import { buildGlLines, LedgerData } from '../ledger';
import { ledgerAnomalies } from '../ledgerAnomalies';

const ing = { id: 'chili', name: 'พริกซอย', unit: 'g', category: 'veg', currentStock: 0, minStockAlert: 0, unitCost: 0.1 } as any;
const log = (id: string, changeQty: number) =>
  ({ id, ingredientId: 'chili', ingredientName: 'พริกซอย', previousStock: 0, newStock: 0, changeQty, reason: 'audit_correction', notes: 'นับสต็อก', timestamp: '2026-10-10T05:00:00.000Z' }) as any;
const data = (over: Partial<LedgerData> = {}): LedgerData => ({
  branchId: 'b1', orders: [], expenses: [], incomes: [], stockLots: [], wasteLogs: [], cashShifts: [], journals: [],
  stockLogs: [log('small-1', -100), log('small-2', -200), log('small-3', -150), log('huge', -11_000_000)],
  ingredients: [ing], vatRegistered: false, today: '2026-10-26', ...over
});

describe('ledgerAnomalies', () => {
  it('points at the record that makes the stock loss unusual, with its quantity and cost', () => {
    const groups = ledgerAnomalies(buildGlLines(data()), '2026-10-01', '2026-10-31');
    const shrink = groups.find(g => g.account === '5300')!;
    expect(shrink.total).toBeCloseTo(-1_100_045, 0);
    expect(shrink.entries[0].sourceId).toBe('huge');
    expect(shrink.entries[0].unusual).toBe(true);
    expect(shrink.entries[0].memo).toContain('g ×');
    expect(shrink.entries.filter(e => e.unusual)).toHaveLength(1);
  });

  it('a record the owner left out is not in the books', () => {
    const groups = ledgerAnomalies(buildGlLines(data({ excluded: ['huge'] })), '2026-10-01', '2026-10-31');
    const shrink = groups.find(g => g.account === '5300')!;
    expect(shrink.total).toBeCloseTo(-45, 2);
    expect(shrink.entries.some(e => e.unusual)).toBe(false);
  });
});
