import { describe, expect, it } from 'vitest';
import { buildAccountantPack, receiptFileName, type PackInput } from '../accountantPack';
import { payrollSettings } from '../payroll';
import type { Expense, Order, OtherIncome, StaffMember } from '../../types';

const order = (id: string, createdAt: string, total: number, status = 'served'): Order =>
  ({ id, orderNumber: `#${id}`, branchId: 'b1', createdAt, status, grandTotal: total, vatAmount: (total * 7) / 107, items: [], orderType: 'dine-in', paymentMethod: 'cash' }) as unknown as Order;

const input = (over: Partial<PackInput> = {}): PackInput => ({
  year: 2026,
  branchId: 'all',
  shop: { name: 'ครัวกะเพรา', taxId: '0105555000001', address: '' },
  vatRegistered: true,
  orders: [order('1', '2026-03-05T10:00:00', 107), order('2', '2026-03-06T10:00:00', 214, 'cancelled'), order('3', '2025-12-31T10:00:00', 107)],
  expenses: [
    { id: 'e1', branchId: 'b1', date: '2026-03-10', category: 'raw_material', title: 'ตลาด "สด"', amount: 107, includeVat: true, vatAmount: 7, netAmount: 100, receiptImage: 'data:image/jpeg;base64,AAAA' },
    { id: 'e2', branchId: 'b1', date: '2026-04-01', category: 'rent', title: 'ค่าเช่า', amount: 10000, includeVat: false, vatAmount: 0, netAmount: 10000 }
  ] as Expense[],
  incomes: [{ id: 'i1', branchId: 'b1', date: '2026-05-01', category: 'recycling', title: 'ขายน้ำมันเก่า', amount: 300 }] as OtherIncome[],
  staff: [{ id: 's', name: 'สมศรี', role: 'แคชเชียร์', hourlyRate: 0, otRateMultiplier: 1.5, status: 'active', payType: 'monthly', monthlySalary: 12000, socialSecurity: true } as StaffMember],
  shifts: [],
  adjustments: [],
  payroll: payrollSettings(),
  certificates: [],
  records: [{ id: 'sso:2026-03', code: 'sso', period: '2026-03', filedAt: '2026-04-10', refNo: 'R1', amountPaid: 1200, proofs: [{ id: 'p', name: 'slip.jpg', kind: 'image', size: 1, addedAt: '' }] }],
  today: '2026-06-15',
  ...over
});

const file = (files: ReturnType<typeof buildAccountantPack>, prefix: string) => files.find(f => f.path.startsWith(prefix))!.text;

describe('accountant pack', () => {
  const files = buildAccountantPack(input());

  it('has every report and a read-me', () => {
    expect(files.map(f => f.path)).toEqual([
      '01_งบกำไรขาดทุน_รายเดือน.csv',
      '02_รายงานภาษีขาย.csv',
      '03_รายงานภาษีซื้อ.csv',
      '04_ค่าใช้จ่ายทั้งหมด.csv',
      '05_รายได้อื่น.csv',
      '06_เงินเดือนพนักงาน.csv',
      '07_หนังสือรับรอง50ทวิ.csv',
      '08_สถานะการยื่นแบบราชการ.csv',
      'อ่านก่อน.txt'
    ]);
    expect(files[0].text.startsWith('﻿')).toBe(true);
  });

  it('keeps only the year and real sales', () => {
    const sales = file(files, '02').split('\r\n');
    expect(sales).toHaveLength(2); // header + bill #1
    expect(sales[1]).toContain('"#1"');
    expect(sales[1]).toContain('"100"');
  });

  it('lists purchases with VAT and quotes text safely', () => {
    const purchases = file(files, '03').split('\r\n');
    expect(purchases).toHaveLength(2);
    expect(purchases[1]).toContain('"ตลาด ""สด"""');
    expect(file(files, '04')).toContain(receiptFileName(input().expenses[0]));
  });

  it('shows payroll months up to today and filing status with proofs', () => {
    const pay = file(files, '06').split('\r\n');
    expect(pay).toHaveLength(7); // header + Jan–Jun
    const status = file(files, '08');
    expect(status).toContain('"สปส.1-10"');
    expect(status).toContain('"ยื่นแล้ว"');
    expect(status).toContain('"1 ไฟล์"');
    expect(status).toContain('ยังไม่ได้บันทึกว่ายื่น');
    expect(file(files, 'อ่านก่อน')).toContain('ชุดเอกสารบัญชีปี 2569');
  });

  it('names receipt files safely', () => {
    expect(receiptFileName({ id: 'abcdef123456', date: '2026-03-10', title: 'a/b:c', receiptImage: 'data:application/pdf;base64,' })).toBe('2026-03-10_abc_123456.pdf');
  });
});
