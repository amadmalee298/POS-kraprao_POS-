import { beforeEach, describe, expect, it } from 'vitest';
import type { Expense, OtherIncome } from '../../types';
import {
  editValue,
  entryKeyboard,
  expenseCard,
  expenseVendor,
  guessCategory,
  latestText,
  menuAction,
  parseCallback,
  futureDateWarning,
  looksLikeEntry,
  parseEntryText,
  parseThaiDate,
  readWaiting,
  recordIdFromCommand,
  summaryText,
  writeWaiting
} from '../telegramBot';

const today = '2026-10-05';

describe('typed entries', () => {
  it('reads the LINE-style template', () => {
    expect(parseEntryText('จ่าย วันที่ 3/10/26 ค่า ผักบุ้ง 135 บาท ร้านค้า ป้าแดง', today)).toEqual({
      kind: 'expense',
      date: '2026-10-03',
      title: 'ค่าผักบุ้ง',
      amount: 135,
      vendor: 'ป้าแดง'
    });
  });

  it('reads short entries in any order, with commas and Buddhist years', () => {
    expect(parseEntryText('จ่าย ค่าแก๊ส 350', today)).toMatchObject({ kind: 'expense', date: today, title: 'ค่าแก๊ส', amount: 350 });
    expect(parseEntryText('รับ 1,500.50 ค่าจัดเลี้ยง 1/10/2569', today)).toMatchObject({ kind: 'income', date: '2026-10-01', title: 'ค่าจัดเลี้ยง', amount: 1500.5 });
    expect(parseEntryText('จ่าย ไข่ 2 แผง 240 บาท', today)).toMatchObject({ title: 'ไข่ 2 แผง', amount: 240 });
    expect(parseEntryText('จ่าย วันที่ 4/10/69 ค่าน้ำแข็ง 60', today)).toMatchObject({ date: '2026-10-04', amount: 60 });
  });

  it('adds up a shopping list, one item a line, with quantities that are not money', () => {
    const list = 'ซื้อวัตถุดิบ ร้านพริกแกง\nพริกซอย 30บาท 3ขีด\nหอมแดงซอย 10บาท 1ขีด\nผงชูรส 35';
    expect(parseEntryText(list, today)).toEqual({
      kind: 'expense',
      date: today,
      title: 'วัตถุดิบ: พริกซอย, หอมแดงซอย, ผงชูรส',
      amount: 75,
      vendor: 'พริกแกง'
    });
    expect(parseEntryText('จ่าย พริกซอย 30 3ขีด', today)).toMatchObject({ amount: 30 });
    // The date on its own first line, with or without "จ่าย"
    expect(parseEntryText('11-10-69\nเติมถังแก๊ส\n380 บาท', today)).toMatchObject({ kind: 'expense', date: '2026-10-11', title: 'เติมถังแก๊ส', amount: 380 });
    expect(parseEntryText('11-10-69\nจ่ายเงินเติมถังแก๊ส\n380 บาท', today)).toMatchObject({ kind: 'expense', date: '2026-10-11', title: 'เติมถังแก๊ส', amount: 380 });
    expect(looksLikeEntry('11-10-69\nเติมถังแก๊ส\n380 บาท')).toBe(true);
    expect(looksLikeEntry('11-10-69')).toBe(false);
    expect(menuAction('💰 จดรายได้')).toBe('income');
    expect(menuAction('💰 จดรายรับ')).toBe('income'); // the button's earlier label
    expect(menuAction('เพิ่มรายได้')).toBe('income');
    expect(parseEntryText('12-11-69\nรายได้  -ค่าแรงครัวกะเพรา 500บาท', today)).toMatchObject({ kind: 'income', title: 'ค่าแรงครัวกะเพรา', amount: 500, date: '2026-11-12' });
    expect(futureDateWarning('2026-11-12', '2026-10-13')).toContain('ยังไม่ถึง');
    expect(futureDateWarning('2026-10-12', '2026-10-13')).toBe('');
    expect(parseEntryText('จ่าย ค่าผัก\n135 บาท', today)).toMatchObject({ title: 'ค่าผัก', amount: 135 });
  });

  it('explains a missing amount (an unfilled template)', () => {
    expect(parseEntryText('จ่าย วันที่ 5/10/69 ค่า... ... บาท ร้านค้า ...', today)).toHaveProperty('error');
    expect(parseEntryText('สวัสดี 100', today)).toHaveProperty('error');
  });

  it('reads dates in both calendars and refuses impossible ones', () => {
    expect(parseThaiDate(5, 10, 69, today)).toBe('2026-10-05');
    expect(parseThaiDate(5, 10, 26, today)).toBe('2026-10-05');
    expect(parseThaiDate(5, 10, 2026, today)).toBe('2026-10-05');
    expect(parseThaiDate(31, 2, undefined, today)).toBeNull();
  });

  it('guesses a category from the words', () => {
    expect(guessCategory('ค่าแก๊ส')).toBe('utilities');
    expect(guessCategory('ค่าผักบุ้ง ป้าแดง')).toBe('raw_material');
    expect(guessCategory('ถุงร้อน กล่องโฟม')).toBe('supplies');
    expect(guessCategory('ค่าน้ำแข็ง')).toBe('raw_material');
    expect(guessCategory('อะไรไม่รู้')).toBe('other');
  });
});

describe('cards, buttons and commands', () => {
  const expense: Expense = {
    id: 'exp-1728100000000',
    branchId: 'b1',
    date: '2026-10-05',
    category: 'raw_material',
    title: 'ค่าผัก <ตลาด>',
    amount: 135,
    includeVat: false,
    vatAmount: 0,
    netAmount: 135,
    note: 'ผักบุ้ง 2 กำ · จาก Telegram: สมชาย',
    receiptImage: 'data:image/jpeg;base64,xx',
    substituteReceipt: { docNo: '2569/10-001', spender: 'สมชาย', payee: 'ป้าแดง' }
  };

  it('shows what was saved like the LINE bot card, escaping HTML', () => {
    const card = expenseCard(expense, { shopName: 'ครัวกะเพรา' });
    expect(card).toContain('บันทึกเรียบร้อย');
    expect(card).toContain('-135.00 บาท');
    expect(card).toContain('ค่าผัก &lt;ตลาด&gt;');
    expect(card).toContain('ใบรับรองแทนใบเสร็จ 2569/10-001');
    expect(card).toContain('ผู้ขาย/ร้านค้า: ป้าแดง');
    expect(card).toContain('ผู้เบิกจ่าย: สมชาย');
    expect(card).toContain('โน้ต: ผักบุ้ง 2 กำ');
    expect(card).not.toContain('จาก Telegram');
    expect(expenseVendor({ note: 'ร้าน: แม็คโคร · x' })).toBe('แม็คโคร');
  });

  it('puts short callback data under the card', () => {
    const kb = entryKeyboard(expense, 'expense');
    const data = kb.inline_keyboard.flat().map(b => b.callback_data).filter(Boolean) as string[];
    expect(data).toEqual(['doc:exp-1728100000000', 'photo:exp-1728100000000', 'edit:exp-1728100000000', 'del:exp-1728100000000']);
    data.forEach(d => expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64));
    expect(parseCallback('setcat:exp-1:raw_material')).toEqual({ action: 'setcat', id: 'exp-1', value: 'raw_material' });
  });

  it('knows the menu buttons, commands and typed requests', () => {
    expect(menuAction('/start')).toBe('menu');
    expect(menuAction('/today@kraprao_bot')).toBe('today');
    expect(menuAction('📅 สรุปเดือนนี้')).toBe('month');
    expect(menuAction('ขอ link google drive')).toBe('drive');
    expect(menuAction('จ่าย ค่าผัก 100')).toBeNull();
  });

  it('takes edited values', () => {
    expect(editValue('amount', '1,250.50 บาท', today)).toEqual({ amount: 1250.5 });
    expect(editValue('amount', 'abc', today)).toHaveProperty('error');
    expect(editValue('date', '4/10/69', today)).toEqual({ date: '2026-10-04' });
    expect(editValue('title', ' ค่าหมู ', today)).toEqual({ title: 'ค่าหมู' });
  });

  it('opens a record from the latest list link', () => {
    const income: OtherIncome = { id: 'inc-1728100000001-ab12', branchId: 'b1', date: '2026-10-04', category: 'other', title: 'ขายน้ำมันเก่า', amount: 200 };
    const text = latestText([expense], [income]);
    expect(text).toContain('/e_exp_1728100000000');
    expect(text).toContain('/e_inc_1728100000001_ab12');
    expect(recordIdFromCommand('/e_inc_1728100000001_ab12')).toBe('inc-1728100000001-ab12');
    expect(recordIdFromCommand('/e_exp_1728100000000@bot')).toBe('exp-1728100000000');
  });

  it('sums a day: sales, other income and expenses', () => {
    const text = summaryText('2026-10-05', {
      orders: [
        { branchId: 'b1', createdAt: new Date(2026, 9, 5, 12).toISOString(), status: 'served', grandTotal: 500 },
        { branchId: 'b1', createdAt: new Date(2026, 9, 5, 13).toISOString(), status: 'cancelled', grandTotal: 999 },
        { branchId: 'b1', createdAt: new Date(2026, 9, 5, 14).toISOString(), status: 'pending-qr', grandTotal: 80, paymentStatus: 'unpaid' }
      ],
      expenses: [expense],
      incomes: [{ id: 'inc-1', branchId: 'b1', date: '2026-10-05', category: 'other', title: 'x', amount: 35 }],
      branchId: 'b1'
    });
    expect(text).toContain('ยอดขายหน้าร้าน: 500.00 บาท (1 บิล)');
    expect(text).toContain('รายจ่าย: 135.00 บาท (1 รายการ)');
    expect(text).toContain('คงเหลือ 400.00 บาท');
  });
});

describe('waiting for an answer', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      clear: () => store.clear()
    };
  });

  it('belongs to the person who pressed the button, and expires', () => {
    writeWaiting('c1', 'u1', { action: 'edit', recordId: 'exp-1', field: 'amount' }, 1000);
    expect(readWaiting('c1', 'u1', 2000)).toMatchObject({ recordId: 'exp-1', field: 'amount' });
    expect(readWaiting('c1', 'u2', 2000)).toBeNull();
    expect(readWaiting('c1', 'u1', 1000 + 11 * 60_000)).toBeNull();
    writeWaiting('c1', 'u1', null, 2000);
    expect(readWaiting('c1', 'u1', 2000)).toBeNull();
  });
});

describe('income categories', () => {
  it('guesses the day sales typed in by hand', async () => {
    const { guessIncomeCategory } = await import('../telegramBot');
    expect(guessIncomeCategory('ยอดขาย 13/10')).toBe('store_sales');
    expect(guessIncomeCategory('ขายข้าวกล่อง')).toBe('store_sales');
    expect(guessIncomeCategory('ขายน้ำมันเก่า')).toBe('recycling');
    expect(guessIncomeCategory('ค่าจัดเลี้ยง')).toBe('catering');
    expect(guessIncomeCategory('เงินคืน')).toBe('other');
  });
});

describe('bills typed without "จ่าย"', () => {
  it('reads "ค่าไฟ 18-10-69 50฿" as an expense', async () => {
    const { looksLikeEntry, parseEntryText } = await import('../telegramBot');
    expect(looksLikeEntry('ค่าไฟ 18-10-69 50฿')).toBe(true);
    expect(parseEntryText('ค่าไฟ 18-10-69 50฿', '2026-10-18')).toEqual({ kind: 'expense', date: '2026-10-18', title: 'ค่าไฟ', amount: 50, vendor: '' });
    expect(parseEntryText('ค่าแก๊ส 380 บาท', '2026-10-18')).toMatchObject({ kind: 'expense', title: 'ค่าแก๊ส', amount: 380 });
    // Talk about bills without an amount is left alone
    expect(looksLikeEntry('ค่าไฟเดือนนี้แพงจัง')).toBe(false);
  });
});

describe('the date first on the same line', () => {
  it('reads "19-10-69 จ่ายค่าไฟ 50 ฿" and "19-10-69ค่าไฟ 50"', async () => {
    const { looksLikeEntry, parseEntryText } = await import('../telegramBot');
    const want = { kind: 'expense', date: '2026-10-19', title: 'ค่าไฟ', amount: 50, vendor: '' };
    for (const t of ['19-10-69 จ่ายค่าไฟ 50 ฿', '19-10-69ค่าไฟ 50', '19/10/69 ค่าไฟ 50', 'วันที่ 19-10-69 จ่าย ค่าไฟ 50']) {
      expect(looksLikeEntry(t)).toBe(true);
      expect(parseEntryText(t, '2026-10-20')).toEqual(want);
    }
    expect(parseEntryText('19-10-69 รับ ยอดขาย 8,620', '2026-10-20')).toMatchObject({ kind: 'income', date: '2026-10-19', amount: 8620 });
    // A range of people in a conversation is not an entry
    expect(looksLikeEntry('1-2 คนมาทาน')).toBe(false);
  });
});
