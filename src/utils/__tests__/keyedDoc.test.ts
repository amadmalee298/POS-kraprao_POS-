import { describe, expect, it } from 'vitest';
import { hasLegacyItems, keyedChanges, keyedItems, newestFirst } from '../keyedDoc';

describe('keyed shared documents', () => {
  it('reads per-record fields and the old whole-list array, the per-record copy winning', () => {
    const d = { items: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }], byId: { b: { id: 'b', v: 2 }, c: { id: 'c', v: 3 } } };
    expect(keyedItems<{ id: string; v: number }>(d).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 }
    ]);
    expect(hasLegacyItems(d)).toBe(true);
    expect(hasLegacyItems({ byId: {} })).toBe(false);
    expect(keyedItems(null)).toEqual([]);
  });

  it('finds only the records that changed', () => {
    const prev = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const next = [{ id: 'c', v: 1 }, { id: 'a', v: 2 }];
    expect(keyedChanges(prev, next)).toEqual({ put: [{ id: 'c', v: 1 }, { id: 'a', v: 2 }], removed: ['b'] });
    expect(keyedChanges(prev, [...prev])).toEqual({ put: [], removed: [] });
  });

  it('orders newest first', () => {
    const list = [{ id: 'a', t: '2026-10-01' }, { id: 'b', t: '2026-10-03' }, { id: 'c', t: '2026-10-02' }];
    expect(newestFirst(list, x => x.t).map(x => x.id)).toEqual(['b', 'c', 'a']);
  });
});
