import { describe, expect, it } from 'vitest';
import { thaiBahtText } from '../thaiBaht';
import { annualIncomeTax, formatThaiId, monthlySalaryWithholding, whtTableRow } from '../withholding';
import { monthlyPayroll, payrollTotals, payrollSettings } from '../payroll';
import { payslipPage, whtPage, type WhtCertificate } from '../staffDocs';
import type { ShiftEntry, StaffMember } from '../../types';

describe('thaiBahtText', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [1, 'หนึ่งบาทถ้วน'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [1250.5, 'หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์'],
    [15000, 'หนึ่งหมื่นห้าพันบาทถ้วน'],
    [1_000_000, 'หนึ่งล้านบาทถ้วน'],
    [2_100_011, 'สองล้านหนึ่งแสนสิบเอ็ดบาทถ้วน'],
    [0.25, 'ยี่สิบห้าสตางค์']
  ])('%s', (n, words) => expect(thaiBahtText(n)).toBe(words));
});

describe('salary withholding (estimate)', () => {
  it('uses the progressive rates', () => {
    expect(annualIncomeTax(150_000)).toBe(0);
    expect(annualIncomeTax(300_000)).toBe(7_500);
    expect(annualIncomeTax(500_000)).toBe(27_500);
  });

  it('is nothing for usual restaurant wages and some for a high salary', () => {
    expect(monthlySalaryWithholding(15_000, 750)).toBe(0);
    // 50,000 x 12 = 600,000 − 100,000 − 60,000 − 9,000 = 431,000 → 7,500 + 13,100 = 20,600 / 12
    expect(monthlySalaryWithholding(50_000, 750)).toBeCloseTo(1716.67, 2);
  });

  it('formats ID numbers and places payments on the certificate', () => {
    expect(formatThaiId('1101700230705')).toBe('1-1017-00230-70-5');
    expect(whtTableRow('salary')).toBe(1);
    expect(whtTableRow('rent')).toBe(5);
    expect(whtTableRow('other')).toBe(6);
  });
});

describe('payroll with tax and yearly totals', () => {
  const boss: StaffMember = { id: 'm', name: 'ผู้จัดการ', role: 'ผู้จัดการ', hourlyRate: 0, otRateMultiplier: 1.5, status: 'active', payType: 'monthly', monthlySalary: 50_000, socialSecurity: true, withholdTax: true };
  const shift = (date: string): ShiftEntry => ({ id: date, staffId: 'm', staffName: 'x', date, dayOfWeek: 'Mon', shiftType: 'fullday', scheduledStart: '09:00', scheduledEnd: '17:00', scheduledHours: 8, status: 'completed', clockInTime: '09:00', clockOutTime: '17:00' }) as ShiftEntry;
  const cfg = payrollSettings({ ssoMaxWage: 15000 });

  it('takes the tax off the net pay', () => {
    const [p] = monthlyPayroll([boss], [shift('2026-03-02')], '2026-03', [], cfg, '2026-03-31');
    expect(p.sso).toBe(750);
    expect(p.tax).toBeCloseTo(1716.67, 2);
    expect(p.net).toBeCloseTo(50_000 - 750 - 1716.67, 2);
  });

  it('adds up the year from the first month with shifts', () => {
    const t = payrollTotals([boss], [shift('2026-03-02')], ['2026-01', '2026-02', '2026-03', '2026-04'], [], cfg, '2026-04-30').get('m')!;
    expect(t.months).toBe(2);
    expect(t.gross).toBe(100_000);
    expect(t.sso).toBe(1500);
  });
});

describe('documents', () => {
  it('prints the payslip with net pay in words', () => {
    const [p] = monthlyPayroll(
      [{ id: 's', name: 'สมชาย <ทดสอบ>', role: 'พ่อครัว', hourlyRate: 0, otRateMultiplier: 1.5, status: 'active', payType: 'monthly', monthlySalary: 12_000 }],
      [],
      '2026-09',
      [{ id: 'a', staffId: 's', month: '2026-09', kind: 'bonus', amount: 500, note: 'เบี้ยขยัน' }],
      payrollSettings(),
      '2026-09-30'
    );
    const html = payslipPage({ shop: { name: 'ครัวกะเพรา', taxId: '', address: '' }, month: '2026-09', pay: p, adjustments: [{ id: 'a', staffId: 's', month: '2026-09', kind: 'bonus', amount: 500, note: 'เบี้ยขยัน' }] });
    expect(html).toContain('สมชาย &lt;ทดสอบ&gt;');
    expect(html).toContain('เบี้ยขยัน');
    expect(html).toContain('12,500.00');
    expect(html).toContain('หนึ่งหมื่นสองพันห้าร้อยบาทถ้วน');
  });

  it('prints the certificate with totals and both copies', () => {
    const c: WhtCertificate = {
      id: 'x', bookNo: '2569', docNo: '0001', form: 'pnd3', mode: 'withhold', issueDate: '2026-09-30',
      payer: { name: 'ครัวกะเพรา', taxId: '0105555000001', address: 'กทม.' },
      payee: { name: 'นายเช่า ที่ดิน', taxId: '1101700230705', address: '' },
      lines: [{ row: 5, detail: 'ค่าเช่า', date: '30/09/2569', amount: 20_000, tax: 1_000 }]
    };
    const one = whtPage(c, 1);
    expect(one).toContain('ฉบับที่ 1');
    expect(one).toContain('1-1017-00230-70-5');
    expect(one).toContain('20,000.00');
    expect(one).toContain('หนึ่งพันบาทถ้วน');
    expect(whtPage(c, 2)).toContain('เก็บไว้เป็นหลักฐาน');
  });
});
