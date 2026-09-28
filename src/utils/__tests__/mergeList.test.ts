import { describe, expect, it } from 'vitest';
import { mergeLists, stampChanges } from '../mergeList';

type R = { id: string; v: string };
const S = (items: R[], stamps: Record<string, string> = {}, deleted: Record<string, string> = {}) => ({ items, stamps, deleted });
const now = new Date().toISOString();
const t = (min: number) => new Date(Date.now() + min * 60000).toISOString();

describe('mergeLists', () => {
  it('keeps both devices’ new records', () => {
    const m = mergeLists(S([{ id: 'a', v: '1' }], { a: t(0) }), S([{ id: 'b', v: '2' }], { b: t(1) }));
    expect(m.items.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  it('takes the newer change of the same record', () => {
    const m = mergeLists(S([{ id: 'a', v: 'old' }], { a: t(0) }), S([{ id: 'a', v: 'new' }], { a: t(5) }));
    expect(m.items).toEqual([{ id: 'a', v: 'new' }]);
  });

  it('does not bring back a deleted record, but keeps one changed after deletion', () => {
    const del = mergeLists(S([{ id: 'a', v: '1' }], { a: t(0) }), S([], {}, { a: t(1) }));
    expect(del.items).toEqual([]);
    const back = mergeLists(S([{ id: 'a', v: '2' }], { a: t(2) }), S([], {}, { a: t(1) }));
    expect(back.items).toEqual([{ id: 'a', v: '2' }]);
  });
});

describe('stampChanges', () => {
  it('stamps changed and new records and remembers deletions', () => {
    const r = stampChanges([{ id: 'a', v: '1' }, { id: 'b', v: '1' }], [{ id: 'a', v: '2' }, { id: 'c', v: '1' }], { stamps: {}, deleted: {} }, now);
    expect(r.stamps).toEqual({ a: now, c: now });
    expect(r.deleted).toEqual({ b: now });
  });
});
