import { describe, expect, it } from 'vitest';
import { handleMcp, keyHash, MCP_TOOLS } from '../mcp';

/** The Firestore client, faked: collections of plain records */
function fakeDb(data: Record<string, any[]>) {
  const writes: { path: string; doc: any }[] = [];
  const deleted: string[] = [];
  const between = (col: string, field: string, from: string, before: string) => (data[col] || []).filter(d => String(d[field]) >= from && String(d[field]) < before);
  const db: any = {
    whereBetween: async (col: string, field: string, from: string, before: string) => between(col, field, from, before),
    list: async (path: string) => ({ docs: (data[path] || []).map((d: any) => ({ id: d.id, data: d })), next: '' }),
    set: async (path: string, doc: any) => writes.push({ path, doc }),
    get: async (path: string) => (data[path.split('/')[0]] || []).find((d: any) => `exp-${d.id}` === path.split('/')[1] || d.id === path.split('/')[1]) || null,
    delete: async (path: string) => deleted.push(path)
  };
  return { db, writes, deleted };
}

const ctx = (db: any) => ({ db, branchId: 'main', today: () => '2026-11-18' });
const call = (c: any, name: string, args: any = {}) => handleMcp(c, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as Promise<any>;

describe('the shop MCP server', () => {
  it('introduces itself and lists its tools', async () => {
    const { db } = fakeDb({});
    const init: any = await handleMcp(ctx(db), { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect(init.result.protocolVersion).toBe('2025-03-26');
    expect(init.result.capabilities.tools).toBeTruthy();
    expect(await handleMcp(ctx(db), { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list: any = await handleMcp(ctx(db), { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((t: any) => t.name)).toEqual(MCP_TOOLS.map(t => t.name));
  });

  it('sums a day: paid sales of this branch, other income and expenses by category', async () => {
    const { db } = fakeDb({
      // 2026-11-18 Bangkok = from 2026-11-17T17:00Z
      orders: [
        { branchId: 'main', createdAt: '2026-11-18T03:00:00.000Z', status: 'served', grandTotal: 100 },
        { branchId: 'main', createdAt: '2026-11-18T04:00:00.000Z', status: 'cancelled', grandTotal: 999 },
        { branchId: 'other', createdAt: '2026-11-18T04:00:00.000Z', status: 'served', grandTotal: 500 },
        { branchId: 'main', createdAt: '2026-11-17T16:59:00.000Z', status: 'served', grandTotal: 777 }
      ],
      expenses: [
        { id: 'a', branchId: 'main', date: '2026-11-18', category: 'raw_material', title: 'ไก่', amount: 350 },
        { id: 'b', branchId: 'main', date: '2026-11-18', category: 'salary', title: 'ค่าแรง', amount: 400 }
      ],
      incomes: [{ id: 'i', branchId: 'main', date: '2026-11-18', category: 'other', title: 'ขายน้ำมันเก่า', amount: 50 }]
    });
    const r = await call(ctx(db), 'shop_summary');
    expect(r.result.structuredContent.result).toMatchObject({ sales: 100, orders: 1, otherIncome: 50, expenses: 750, net: -600 });
    expect(r.result.content[0].text).toContain('ยอดขาย POS');
  });

  it('records an expense as the app stores it, and refuses bad input', async () => {
    const { db, writes } = fakeDb({});
    const ok = await call(ctx(db), 'add_expense', { title: 'ซื้อไก่', amount: 350, category: 'raw_material' });
    expect(ok.result.isError).toBeUndefined();
    expect(writes[0].path).toMatch(/^expenses\/exp-mcp-/);
    expect(writes[0].doc).toMatchObject({ branchId: 'main', date: '2026-11-18', category: 'raw_material', title: 'ซื้อไก่', amount: 350 });
    const bad = await call(ctx(db), 'add_expense', { title: 'x', amount: -1, category: 'raw_material' });
    expect(bad.result.isError).toBe(true);
    const badCat = await call(ctx(db), 'add_expense', { title: 'x', amount: 5, category: 'food' });
    expect(badCat.result.isError).toBe(true);
  });

  it('deletes only when confirmed, and only this branch', async () => {
    const { db, deleted } = fakeDb({ expenses: [{ id: 'aaa', branchId: 'main', date: '2026-11-18', title: 'ไก่', amount: 350 }, { id: 'zzz', branchId: 'other', date: '2026-11-18', title: 'x', amount: 1 }] });
    expect((await call(ctx(db), 'delete_expense', { id: 'aaa', confirm: false })).result.isError).toBe(true);
    expect((await call(ctx(db), 'delete_expense', { id: 'zzz', confirm: true })).result.isError).toBe(true);
    const done = await call(ctx(db), 'delete_expense', { id: 'aaa', confirm: true });
    expect(done.result.content[0].text).toContain('ลบค่าใช้จ่ายแล้ว');
    expect(deleted).toEqual(['expenses/exp-aaa']);
  });

  it('keeps only the hash of the key', async () => {
    expect(await keyHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
