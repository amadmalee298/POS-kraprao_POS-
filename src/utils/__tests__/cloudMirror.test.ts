import { describe, expect, it } from 'vitest';
import { mergeMirror } from '../cloudMirror';

type R = { id: string; v: number };
const base = { key: 'd', docOf: () => 'd', toCloud: (x: R) => x, removed: new Set<string>() };
const j = (x: R) => JSON.stringify(x);

describe('mergeMirror', () => {
  it('first meeting: keeps both sides, the cloud wins a record both have (unless preferred)', () => {
    const prev = [{ id: 'a', v: 1 }, { id: 'local', v: 1 }];
    const cloud = [{ id: 'a', v: 2 }, { id: 'remote', v: 1 }];
    const out = mergeMirror({ ...base, prev, cloud, first: true, before: new Map() });
    expect(out).toEqual([{ id: 'remote', v: 1 }, { id: 'a', v: 2 }, { id: 'local', v: 1 }]);
    const mine = mergeMirror({ ...base, prev, cloud, first: true, before: new Map(), prefer: m => m });
    expect(mine.find(x => x.id === 'a')).toEqual({ id: 'a', v: 1 });
  });

  it('later: a change made elsewhere arrives; a change made here and not sent stays', () => {
    const before = new Map([['a', j({ id: 'a', v: 1 })], ['b', j({ id: 'b', v: 1 })]]);
    const prev = [{ id: 'a', v: 5 }, { id: 'b', v: 1 }];
    const cloud = [{ id: 'a', v: 1 }, { id: 'b', v: 9 }];
    expect(mergeMirror({ ...base, prev, cloud, first: false, before })).toEqual([{ id: 'a', v: 5 }, { id: 'b', v: 9 }]);
  });

  it('later: removed elsewhere goes; added here and not sent stays; removed here does not come back', () => {
    const before = new Map([['gone', j({ id: 'gone', v: 1 })], ['del', j({ id: 'del', v: 1 })]]);
    const prev = [{ id: 'gone', v: 1 }, { id: 'new', v: 1 }];
    const cloud = [{ id: 'del', v: 1 }];
    const out = mergeMirror({ ...base, prev, cloud, first: false, before, removed: new Set(['del']) });
    expect(out).toEqual([{ id: 'new', v: 1 }]);
  });

  it('records of other documents are left alone', () => {
    const prev = [{ id: 'x', v: 1 }];
    const out = mergeMirror({ ...base, docOf: () => 'other', prev, cloud: [], first: false, before: new Map([['x', j({ id: 'x', v: 1 })]]) });
    expect(out).toEqual(prev);
  });
});
