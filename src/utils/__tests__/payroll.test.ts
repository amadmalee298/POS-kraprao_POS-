import { describe, expect, it } from 'vitest';
import type { ShiftEntry, StaffMember } from '../../types';
import { attendanceOf, DEFAULT_PAYROLL, monthlyPayroll, workedHours } from '../payroll';

const sh = (p: Partial<ShiftEntry>): ShiftEntry => ({
  id: Math.random().toString(),
  staffId: 's1',
  staffName: 'A',
  date: '2026-09-10',
  dayOfWeek: 'Thu',
  shiftType: 'fullday',
  scheduledStart: '08:00',
  scheduledEnd: '17:00',
  scheduledHours: 8,
  status: 'completed',
  ...p
});
const staff = (p: Partial<StaffMember>): StaffMember => ({ id: 's1', name: 'A', role: 'พนักงาน', hourlyRate: 50, otRateMultiplier: 1.5, status: 'active', ...p });
const settings = { ...DEFAULT_PAYROLL, ssoMaxWage: 15000 };

describe('workedHours', () => {
  it('uses the clock times, including past midnight', () => {
    expect(workedHours(sh({ clockInTime: '08:00', clockOutTime: '18:30' }))).toBe(10.5);
    expect(workedHours(sh({ clockInTime: '20:00', clockOutTime: '02:00' }))).toBe(6);
    expect(workedHours(sh({ actualHours: 7 }))).toBe(7);
  });
});

describe('attendanceOf', () => {
  it('marks late after the grace minutes and absent days in the past', () => {
    expect(attendanceOf(sh({ clockInTime: '08:04', clockOutTime: '17:00' }), 5, '2026-09-28').status).toBe('ok');
    expect(attendanceOf(sh({ clockInTime: '08:20', clockOutTime: '17:00' }), 5, '2026-09-28')).toEqual({ status: 'late', lateMinutes: 20 });
    expect(attendanceOf(sh({ status: 'scheduled' }), 5, '2026-09-28').status).toBe('absent');
    expect(attendanceOf(sh({ status: 'scheduled', date: '2026-09-30' }), 5, '2026-09-28').status).toBe('upcoming');
  });
});

describe('monthlyPayroll', () => {
  const shifts = [
    sh({ clockInTime: '08:00', clockOutTime: '18:00' }), // 10 h: 8 + 2 OT
    sh({ date: '2026-09-11', clockInTime: '08:30', clockOutTime: '16:30' }), // 8 h, late 30
    sh({ date: '2026-08-31', clockInTime: '08:00', clockOutTime: '17:00' }) // other month
  ];

  it('pays by the hour with OT at 1.5x', () => {
    const [p] = monthlyPayroll([staff({})], shifts, '2026-09', [], settings, '2026-09-28');
    expect(p).toMatchObject({ daysWorked: 2, hours: 18, regularHours: 16, otHours: 2, basePay: 800, otPay: 150, lateCount: 1, lateMinutes: 30 });
    expect(p.net).toBe(950);
  });

  it('pays by the day, and OT from the day rate / 8', () => {
    const [p] = monthlyPayroll([staff({ payType: 'daily', dailyRate: 400 })], shifts, '2026-09', [], settings, '2026-09-28');
    expect(p.basePay).toBe(800);
    expect(p.otPay).toBe(150); // 2 h * 400/8 * 1.5
  });

  it('pays a monthly salary with OT from salary / 30 / 8, bonus, advance and social security', () => {
    const [p] = monthlyPayroll(
      [staff({ payType: 'monthly', monthlySalary: 12000, socialSecurity: true })],
      shifts,
      '2026-09',
      [
        { id: 'a', staffId: 's1', month: '2026-09', kind: 'bonus', amount: 500, note: '' },
        { id: 'b', staffId: 's1', month: '2026-09', kind: 'deduction', amount: 1000, note: 'เบิกล่วงหน้า' }
      ],
      settings,
      '2026-09-28'
    );
    expect(p.basePay).toBe(12000);
    expect(p.otPay).toBe(150); // 2 h * 50 * 1.5
    expect(p.sso).toBe(608); // 5% of 12,150
    expect(p.gross).toBe(12650);
    expect(p.net).toBe(12650 - 1000 - 608);
  });

  it('caps social security at the wage ceiling', () => {
    const [p] = monthlyPayroll([staff({ payType: 'monthly', monthlySalary: 30000, socialSecurity: true })], [], '2026-09', [], settings, '2026-09-28');
    expect(p.sso).toBe(750);
  });
});

describe('addHours', () => {
  it('adds hours and wraps past midnight', async () => {
    const { addHours } = await import('../payroll');
    expect(addHours('09:30', 8)).toBe('17:30');
    expect(addHours('20:00', 8)).toBe('04:00');
  });
});
