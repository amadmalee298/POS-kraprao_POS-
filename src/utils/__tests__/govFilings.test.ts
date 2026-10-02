import { describe, expect, it } from 'vitest';
import { dueStatus, filingsDueIn, pnd1Attachment, pnd3Attachment, pp30Figures, splitThaiName, ssoAttachment, type FilingSources } from '../govFilings';
import { filingSheetPage } from '../govFilingDocs';
import { payrollSettings } from '../payroll';
import type { WhtCertificate } from '../staffDocs';
import type { Expense, Order, ShiftEntry, StaffMember } from '../../types';

const cook: StaffMember = { id: 'c', name: 'นาย สมชาย ใจดี', role: 'กุ๊ก', hourlyRate: 0, otRateMultiplier: 1.5, status: 'active', payType: 'monthly', monthlySalary: 15_000, socialSecurity: true, taxId: '1101700230705' };
const boss: StaffMember = { id: 'b', name: 'วิไล รุ่งเรือง', role: 'ผู้จัดการ', hourlyRate: 0, otRateMultiplier: 1.5, status: 'active', payType: 'monthly', monthlySalary: 50_000, socialSecurity: true, withholdTax: true };
const shift = (staffId: string, date: string) => ({ id: staffId + date, staffId, staffName: '', date, dayOfWeek: 'Mon', shiftType: 'fullday', scheduledStart: '09:00', scheduledEnd: '17:00', scheduledHours: 8, status: 'completed', clockInTime: '09:00', clockOutTime: '17:00' }) as ShiftEntry;

const cert = (form: 'pnd3' | 'pnd53', issueDate: string): WhtCertificate => ({
  id: form + issueDate, bookNo: '2569', docNo: '0001', form, mode: 'withhold', issueDate,
  payer: { name: 'ร้าน', taxId: '', address: '' },
  payee: { name: form === 'pnd53' ? 'บริษัท ขนส่งดี จำกัด' : 'นางสาว มาลี เช่าดี', taxId: '0105555000001', address: 'กทม.' },
  lines: [{ row: 5, detail: 'ค่าเช่า', date: '', amount: 10_000, tax: 500 }]
});

const src = (over: Partial<FilingSources> = {}): FilingSources => ({
  vatRegistered: true,
  staff: [cook, boss],
  shifts: [shift('c', '2026-09-01'), shift('b', '2026-09-01')],
  adjustments: [],
  payroll: payrollSettings({ ssoMaxWage: 15_000 }),
  certificates: [cert('pnd3', '2026-09-10'), cert('pnd53', '2026-08-10')],
  today: '2026-10-02',
  ...over
});

describe('what is due in a month', () => {
  it('lists the monthly filings for the month before with their deadlines', () => {
    const items = filingsDueIn('2026-10', src());
    const by = Object.fromEntries(items.map(i => [i.code, i]));
    expect(by.pp30.period).toBe('2026-09');
    expect(by.pp30.dueDate).toBe('2026-10-23');
    expect(by.pp30.paperDueDate).toBe('2026-10-15');
    expect(by.pnd1.dueDate).toBe('2026-10-15');
    expect(by.pnd1.need).toBe('required');
    expect(by.pnd3.need).toBe('required');
    expect(by.pnd53.need).toBe('none');
    expect(by.sso.need).toBe('required');
  });

  it('skips VAT for a shop that is not registered and adds yearly filings in their month', () => {
    expect(filingsDueIn('2026-10', src({ vatRegistered: false })).find(i => i.code === 'pp30')?.need).toBe('none');
    expect(filingsDueIn('2027-02', src()).some(i => i.code === 'pnd1a' && i.period === '2026' && i.dueDate === '2027-02-28')).toBe(true);
    expect(filingsDueIn('2026-05', src()).map(i => i.code)).toEqual(expect.arrayContaining(['pnd50', 'fs']));
  });

  it('counts down to the deadline', () => {
    const item = filingsDueIn('2026-10', src()).find(i => i.code === 'sso')!;
    expect(dueStatus(item, '2026-10-13').tone).toBe('soon');
    expect(dueStatus(item, '2026-10-16').label).toBe('เลยกำหนด 1 วัน');
    expect(dueStatus(item, '2026-10-16', { id: item.key, code: 'sso', period: '2026-09', filedAt: '2026-10-10' }).tone).toBe('done');
  });
});

describe('figures and attachments', () => {
  it('works out ภ.พ.30 from sales and purchases with tax invoices', () => {
    const orders = [
      { id: '1', branchId: 'b1', createdAt: '2026-09-05T10:00:00', status: 'served', grandTotal: 107, vatAmount: 7, items: [] },
      { id: '2', branchId: 'b1', createdAt: '2026-09-06T10:00:00', status: 'cancelled', grandTotal: 107, vatAmount: 7, items: [] },
      { id: '3', branchId: 'b1', createdAt: '2026-10-01T10:00:00', status: 'served', grandTotal: 107, vatAmount: 7, items: [] }
    ] as unknown as Order[];
    const expenses = [
      { id: 'e', branchId: 'b1', date: '2026-09-10', amount: 53.5, includeVat: true, vatAmount: 3.5, netAmount: 50, category: 'raw_material' },
      { id: 'f', branchId: 'b1', date: '2026-09-11', amount: 100, includeVat: false, vatAmount: 0, category: 'other' }
    ] as unknown as Expense[];
    expect(pp30Figures(orders, expenses, '2026-09', 'all')).toMatchObject({ salesBase: 100, outputVat: 7, purchaseBase: 50, inputVat: 3.5, payable: 3.5, orderCount: 1 });
  });

  it('lists employees with tax for ภ.ง.ด.1 and both social security shares', () => {
    const p1 = pnd1Attachment(src(), '2026-09', true);
    expect(p1.rows).toHaveLength(1);
    expect(p1.rows[0].slice(2, 5)).toEqual(['', 'วิไล', 'รุ่งเรือง']);
    expect(p1.missingId).toEqual(['วิไล รุ่งเรือง']);
    const sso = ssoAttachment(src(), '2026-09');
    expect(sso.totals.count).toBe(2);
    expect(sso.totals.amount).toBe(30_000);
    expect(sso.totals.extra).toEqual({ employee: 1500, employer: 1500, total: 3000 });
  });

  it('lists the certificates of the month for ภ.ง.ด.3 with the rate', () => {
    const t = pnd3Attachment(src().certificates, '2026-09', 'pnd3');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0][3]).toBe('นางสาว');
    expect(t.rows[0][9]).toBe(5);
    expect(t.totals).toMatchObject({ count: 1, amount: 10_000, tax: 500 });
  });

  it('splits Thai names and prints the preparation sheet', () => {
    expect(splitThaiName('นาย สมชาย ใจดี')).toEqual({ prefix: 'นาย', first: 'สมชาย', last: 'ใจดี' });
    expect(splitThaiName('บริษัท ขนส่งดี จำกัด')).toEqual({ prefix: 'บริษัท', first: 'ขนส่งดี จำกัด', last: '' });
    const item = filingsDueIn('2026-10', src()).find(i => i.code === 'sso')!;
    const html = filingSheetPage(item, { name: 'ครัวกะเพรา', taxId: '0105555000001', address: '' }, { table: ssoAttachment(src(), '2026-09') });
    expect(html).toContain('สปส.1-10');
    expect(html).toContain('3,000.00');
    expect(html).toContain('สามพันบาทถ้วน');
  });
});
