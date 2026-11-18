import { describe, expect, it } from 'vitest';
import { lowStockPlan, updateTold } from '../lowStockTold';

describe('low-stock alerts due', () => {
  it('announces an ingredient once, again after it was restocked, per branch and day', () => {
    let store = {};
    expect(lowStockPlan(store, 'A', '2026-11-18', ['oil'])).toEqual({ due: ['oil'], restocked: [] });
    store = updateTold(store, 'A', '2026-11-18', ['oil']);
    expect(lowStockPlan(store, 'A', '2026-11-18', ['oil']).due).toEqual([]);
    // Another branch on the same device still alerts
    expect(lowStockPlan(store, 'B', '2026-11-18', ['oil']).due).toEqual(['oil']);
    // Restocked: forgotten, so running low again alerts again
    const plan = lowStockPlan(store, 'A', '2026-11-18', []);
    expect(plan.restocked).toEqual(['oil']);
    store = updateTold(store, 'A', '2026-11-18', [], plan.restocked);
    expect(lowStockPlan(store, 'A', '2026-11-18', ['oil']).due).toEqual(['oil']);
    // A new day starts over
    store = updateTold(store, 'A', '2026-11-18', ['oil']);
    expect(lowStockPlan(store, 'A', '2026-11-19', ['oil']).due).toEqual(['oil']);
  });
});
