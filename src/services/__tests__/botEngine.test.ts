import { describe, expect, it, vi } from 'vitest';
import type { Expense, OtherIncome, PendingReceipt } from '../../types';
import type { VerifiedReceiptData } from '../../utils/receiptOcr';
import { BotContext, BotStore, handleBotUpdate } from '../botEngine';
import type { BotWaiting } from '../telegramBot';

function memoryStore() {
  const expenses = new Map<string, Expense>();
  const incomes = new Map<string, OtherIncome>();
  let inbox: PendingReceipt[] = [];
  const waiting = new Map<string, BotWaiting>();
  const key = (c: string, u?: string) => `${c}:${u || ''}`;
  const store: BotStore = {
    getExpense: async id => expenses.get(id) || null,
    getIncome: async id => incomes.get(id) || null,
    saveExpense: async e => void expenses.set(e.id, e),
    saveIncome: async i => void incomes.set(i.id, i),
    updateExpense: async (id, p) => void (expenses.has(id) && expenses.set(id, { ...expenses.get(id)!, ...p })),
    updateIncome: async (id, p) => void (incomes.has(id) && incomes.set(id, { ...incomes.get(id)!, ...p })),
    deleteExpense: async id => void expenses.delete(id),
    deleteIncome: async id => void incomes.delete(id),
    expensesFrom: async d => [...expenses.values()].filter(e => e.date >= d),
    incomesFrom: async d => [...incomes.values()].filter(i => i.date >= d),
    ordersFrom: async () => [],
    inboxItem: async id => inbox.find(p => p.id === id) || null,
    inboxByRecord: async r => inbox.find(p => p.recordId === r) || null,
    putInbox: async item => void (inbox = [item, ...inbox.filter(p => p.id !== item.id)]),
    patchInbox: async (id, c) => void (inbox = inbox.map(p => (p.id === id ? { ...p, ...c } : p))),
    getWaiting: async (c, u) => waiting.get(key(c, u)) || null,
    setWaiting: async (c, u, w) => void (w ? waiting.set(key(c, u), { ...w, chatId: c, userId: u, until: Date.now() + 60_000 }) : waiting.delete(key(c, u))),
    driveFolderUrl: async () => ''
  };
  return { store, expenses, incomes, inbox: () => inbox, waiting };
}

const slip = (over: Partial<VerifiedReceiptData> = {}): VerifiedReceiptData => ({
  title: 'โอนเงิน',
  vendorName: 'ป้าแดง ผักสด',
  vendorTaxId: '',
  date: '2026-10-05',
  category: 'raw_material',
  amount: 135,
  subtotal: 135,
  discount: 0,
  includeVat: false,
  vatAmount: 0,
  netAmount: 135,
  refNumber: 'TX1',
  note: '',
  confidenceScore: 95,
  lineItems: [],
  warnings: [],
  verified: true,
  passes: 1,
  ...over
});

function setup(over: Partial<BotContext> = {}) {
  const mem = memoryStore();
  const calls: { method: string; params: any }[] = [];
  let mid = 500;
  let n = 0;
  const ctx: BotContext = {
    token: 't',
    chatId: '-1',
    branchId: 'b1',
    mode: 'auto',
    shop: { name: 'ครัวกะเพรา' },
    vatRate: 7,
    tg: (async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      return method === 'sendMessage' ? { message_id: mid++ } : true;
    }) as BotContext['tg'],
    readPhoto: vi.fn(async p => ({ scan: `data:image/jpeg;base64,SCAN-${p.fileId}`, store: `data:image/jpeg;base64,KEEP-${p.storeFileId}` })),
    scan: vi.fn(async () => slip()),
    docUrl: e => `https://app/#doc=${e.id}`,
    newId: prefix => `${prefix}-${++n}`,
    ...over
  };
  const from = { id: 42, first_name: 'แม่ครัว' };
  let m = 1;
  const msg = (extra: any) => ({ update_id: m, message: { message_id: m++, date: 1790000000, chat: { id: -1 }, from, ...extra } });
  const photo = (id: string, extra: any = {}) => msg({ photo: [{ file_id: `${id}-small`, width: 800, height: 600, file_size: 60_000 }, { file_id: id, width: 1280, height: 960, file_size: 150_000 }], ...extra });
  const cb = (data: string, message_id = 777) => ({ update_id: m++, callback_query: { id: `q${m}`, from, data, message: { message_id, chat: { id: -1 } } } });
  const run = (u: any) => handleBotUpdate(ctx, mem.store, u);
  return { ctx, mem, calls, msg, photo, cb, run };
}

describe('bot engine', () => {
  it('records a slip at once with a substitute receipt and a card with a document link', async () => {
    const { mem, calls, photo, run } = setup();
    await run(photo('F1'));
    const e = mem.expenses.get('exp-1')!;
    expect(e).toMatchObject({ title: 'จ่าย ป้าแดง ผักสด', amount: 135, category: 'raw_material', branchId: 'b1', receiptImage: 'data:image/jpeg;base64,KEEP-F1-small' });
    expect(e.substituteReceipt).toEqual({ docNo: '2569/10-001', spender: 'แม่ครัว', payee: 'ป้าแดง ผักสด' });
    const card = calls.find(c => c.method === 'editMessageText')!;
    expect(card.params.message_id).toBe(500); // the "reading…" message becomes the card
    expect(card.params.text).toContain('บันทึกเรียบร้อย');
    expect(card.params.reply_markup.inline_keyboard[0][0]).toEqual({ text: '📄 ดูใบแทนใบเสร็จ', url: 'https://app/#doc=exp-1' });
    expect(mem.inbox()[0]).toMatchObject({ status: 'approved', recordId: 'exp-1', cardMessageId: 500, storeFileId: 'F1-small' });
  });

  it('handles each photo once, and numbers documents in order', async () => {
    const { mem, photo, run } = setup();
    const u = photo('F1');
    await run(u);
    await run(u); // Telegram sent it again
    await run(photo('F2'));
    expect([...mem.expenses.values()].map(e => e.substituteReceipt?.docNo)).toEqual(['2569/10-001', '2569/10-002']);
  });

  it('adds a whole album of photos of the goods sent with the caption "เสร็จ"', async () => {
    const { mem, calls, photo, cb, run } = setup();
    await run(photo('F1'));
    await run(cb('photo:exp-1'));
    // Telegram puts an album's caption on its first photo only
    await run(photo('P1', { caption: 'เสร็จ', media_group_id: 'g' }));
    await run(photo('P2', { media_group_id: 'g' }));
    expect(mem.expenses.get('exp-1')!.purchaseImages!.map(p => p.dataUrl)).toEqual(['data:image/jpeg;base64,KEEP-P1-small', 'data:image/jpeg;base64,KEEP-P2-small']);
    expect(calls.filter(c => c.params.text?.startsWith('✅ เพิ่มรูปแล้ว')).map(c => c.params.text)).toEqual(['✅ เพิ่มรูปแล้ว (1/3)', '✅ เพิ่มรูปแล้ว (2/3)']);
    // A later photo is a new bill
    await run(photo('F2'));
    expect(mem.expenses.size).toBe(2);
    expect(mem.expenses.get('exp-1')!.purchaseImages).toHaveLength(2);
  });

  it('ends adding photos with a single photo captioned "เสร็จ"', async () => {
    const { mem, photo, cb, run } = setup();
    await run(photo('F1'));
    await run(cb('photo:exp-1'));
    await run(photo('P1', { caption: 'เสร็จ' }));
    expect(mem.waiting.size).toBe(0);
    await run(photo('F2'));
    expect(mem.expenses.size).toBe(2);
  });

  it('keeps adding photos until three, without a word in between', async () => {
    const { mem, photo, cb, run } = setup();
    await run(photo('F1'));
    await run(cb('photo:exp-1'));
    for (const id of ['P1', 'P2', 'P3']) await run(photo(id, { media_group_id: 'g' }));
    expect(mem.expenses.get('exp-1')!.purchaseImages).toHaveLength(3);
    expect(mem.waiting.size).toBe(0);
  });

  it('says why a photo could not be added and keeps waiting', async () => {
    const { mem, calls, photo, cb, run, ctx } = setup();
    await run(photo('F1'));
    await run(cb('photo:exp-1'));
    (ctx.readPhoto as any).mockRejectedValueOnce(new Error('HTTP 502'));
    await run(photo('P1'));
    expect(calls.at(-1)!.params.text).toContain('เพิ่มรูปไม่สำเร็จ: HTTP 502');
    await run(photo('P1b'));
    expect(mem.expenses.get('exp-1')!.purchaseImages).toHaveLength(1);
  });

  it('records typed entries and edits them only from the person who asked', async () => {
    const { mem, calls, msg, cb, run } = setup();
    await run(msg({ text: 'จ่าย ค่าแก๊ส 350' }));
    expect(mem.expenses.get('exp-1')).toMatchObject({ title: 'ค่าแก๊ส', amount: 350, category: 'utilities' });
    await run(cb('ask:exp-1:amount'));
    await run({ update_id: 99, message: { message_id: 99, date: 1, chat: { id: -1 }, from: { id: 7, first_name: 'คนอื่น' }, text: '999' } });
    expect(mem.expenses.get('exp-1')!.amount).toBe(350);
    await run(msg({ text: '400' }));
    expect(mem.expenses.get('exp-1')).toMatchObject({ amount: 400, netAmount: 400 });
    expect(calls.some(c => c.method === 'editMessageText' && c.params.message_id === 777 && c.params.text.includes('-400.00'))).toBe(true);
  });

  it('records a photo the AI could not read once the amount is typed', async () => {
    const { mem, photo, msg, run, ctx } = setup();
    (ctx.scan as any).mockRejectedValueOnce(new Error('AI down'));
    await run(photo('F1'));
    expect(mem.inbox()[0].status).toBe('failed');
    await run(msg({ text: '135 ค่าผักตลาด' }));
    expect(mem.expenses.get('exp-1')).toMatchObject({ title: 'ค่าผักตลาด', amount: 135, receiptImage: 'data:image/jpeg;base64,KEEP-F1-small' });
    expect(mem.inbox()[0]).toMatchObject({ status: 'approved', recordId: 'exp-1' });
  });

  it('deletes after confirming, and leaves records made in the POS alone', async () => {
    const { mem, calls, msg, cb, run } = setup();
    await run(msg({ text: 'รับ 500 ค่าจัดเลี้ยง' }));
    expect(mem.incomes.get('inc-1')).toMatchObject({ amount: 500, title: 'ค่าจัดเลี้ยง' });
    await run(cb('del:inc-1'));
    await run(cb('delok:inc-1'));
    expect(mem.incomes.size).toBe(0);
    await mem.store.saveExpense({ id: 'exp-pos', branchId: 'b1', date: '2026-10-05', category: 'other', title: 'POS', amount: 1, includeVat: false, vatAmount: 0, netAmount: 1 });
    await run(cb('delok:exp-pos'));
    expect(mem.expenses.has('exp-pos')).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', params: { text: 'แก้ไขรายการนี้ได้ในระบบ POS' } });
  });

  it('waits for a manager in approval mode', async () => {
    const { mem, photo, run } = setup({ mode: 'approve' });
    await run(photo('F1'));
    expect(mem.expenses.size).toBe(0);
    expect(mem.inbox()[0]).toMatchObject({ status: 'pending', data: { amount: 135 } });
  });
});
