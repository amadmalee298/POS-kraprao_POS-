import type { PayrollAdjustment, PayrollSettings, ShiftEntry, StaffMember } from '../types';
import { monthlySalaryWithholding } from './withholding';

/**
 * Monthly pay from the time clock. Regular hours are those up to the scheduled shift (at least
 * 8), the rest is overtime. The hourly rate behind overtime for daily and monthly pay follows the
 * Labour Protection Act: a day's wage / 8, and a monthly salary / 30 / 8.
 */

export const DEFAULT_PAYROLL: PayrollSettings = {
  ssoRate: 5,
  // Check the current wage ceiling with the Social Security Office; it can be changed in the app
  ssoMaxWage: 17500,
  ssoMinWage: 1650,
  lateGraceMinutes: 5
};

export const payrollSettings = (s?: Partial<PayrollSettings>): PayrollSettings => ({ ...DEFAULT_PAYROLL, ...(s || {}) });

const mins = (t?: string) => {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Hours actually worked in a shift */
export function workedHours(sh: ShiftEntry): number {
  if (sh.shiftType === 'off') return 0;
  if (typeof sh.actualHours === 'number') return Math.max(0, sh.actualHours);
  const a = mins(sh.clockInTime);
  const b = mins(sh.clockOutTime);
  if (a !== null && b !== null) return Math.round(((b >= a ? b - a : b + 1440 - a) / 60) * 100) / 100;
  return sh.status === 'completed' ? sh.scheduledHours || 0 : 0;
}

export type Attendance = 'off' | 'ok' | 'late' | 'absent' | 'working' | 'upcoming';

export function attendanceOf(sh: ShiftEntry, graceMinutes: number, today: string): { status: Attendance; lateMinutes: number } {
  if (sh.shiftType === 'off') return { status: 'off', lateMinutes: 0 };
  if (sh.status === 'absent') return { status: 'absent', lateMinutes: 0 };
  if (!sh.clockInTime) {
    if (sh.status === 'completed') return { status: 'ok', lateMinutes: 0 };
    return { status: sh.date < today ? 'absent' : 'upcoming', lateMinutes: 0 };
  }
  const start = mins(sh.scheduledStart);
  const inAt = mins(sh.clockInTime);
  const late = start !== null && inAt !== null ? Math.max(0, inAt - start) : 0;
  if (!sh.clockOutTime && sh.status === 'clocked_in') return { status: late > graceMinutes ? 'late' : 'working', lateMinutes: late > graceMinutes ? late : 0 };
  return late > graceMinutes ? { status: 'late', lateMinutes: late } : { status: 'ok', lateMinutes: 0 };
}

export interface MonthlyPay {
  staffId: string;
  name: string;
  role: string;
  payType: 'hourly' | 'daily' | 'monthly';
  rateText: string;
  daysWorked: number;
  hours: number;
  regularHours: number;
  otHours: number;
  lateCount: number;
  lateMinutes: number;
  absentCount: number;
  basePay: number;
  otPay: number;
  bonus: number;
  deductions: number;
  sso: number;
  /** Income tax withheld (ภ.ง.ด.1), 0 when not withheld */
  tax: number;
  gross: number;
  net: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function monthlyPayroll(
  staff: StaffMember[],
  shifts: ShiftEntry[],
  month: string, // YYYY-MM
  adjustments: PayrollAdjustment[],
  settings: PayrollSettings,
  today: string
): MonthlyPay[] {
  return staff
    .map(s => {
      const mine = shifts.filter(sh => sh.staffId === s.id && (sh.date || '').startsWith(month) && sh.shiftType !== 'off');
      let hours = 0;
      let regularHours = 0;
      let otHours = 0;
      let daysWorked = 0;
      let lateCount = 0;
      let lateMinutes = 0;
      let absentCount = 0;
      mine.forEach(sh => {
        const w = workedHours(sh);
        if (w > 0) daysWorked++;
        hours += w;
        const reg = Math.min(w, Math.max(sh.scheduledHours || 0, 8));
        regularHours += reg;
        otHours += Math.max(0, w - reg);
        const a = attendanceOf(sh, settings.lateGraceMinutes, today);
        if (a.status === 'late') {
          lateCount++;
          lateMinutes += a.lateMinutes;
        }
        if (a.status === 'absent') absentCount++;
      });
      const payType = s.payType || 'hourly';
      const hourlyRate = s.hourlyRate || 0;
      const perHour = payType === 'monthly' ? (s.monthlySalary || 0) / 30 / 8 : payType === 'daily' ? (s.dailyRate || 0) / 8 : hourlyRate;
      const otOn = s.otEnabled !== false;
      // Without OT, an hourly worker is still paid every hour worked at the normal rate
      const basePay =
        payType === 'monthly' ? s.monthlySalary || 0 : payType === 'daily' ? daysWorked * (s.dailyRate || 0) : (otOn ? regularHours : hours) * hourlyRate;
      const otPay = otOn ? otHours * perHour * (s.otRateMultiplier || 1.5) : 0;
      const adj = adjustments.filter(a => a.staffId === s.id && a.month === month);
      const bonus = adj.filter(a => a.kind === 'bonus').reduce((t, a) => t + (a.amount || 0), 0);
      const deductions = adj.filter(a => a.kind === 'deduction').reduce((t, a) => t + (a.amount || 0), 0);
      const wage = basePay + otPay;
      const sso =
        s.socialSecurity && wage > 0
          ? Math.round((Math.min(Math.max(wage, settings.ssoMinWage), settings.ssoMaxWage) * settings.ssoRate) / 100)
          : 0;
      const gross = wage + bonus;
      const tax = s.withholdTax ? monthlySalaryWithholding(gross, sso) : 0;
      return {
        staffId: s.id,
        name: s.name,
        role: s.role,
        payType,
        rateText:
          payType === 'monthly'
            ? `เดือนละ ฿${(s.monthlySalary || 0).toLocaleString('th-TH')}`
            : payType === 'daily'
            ? `วันละ ฿${(s.dailyRate || 0).toLocaleString('th-TH')}`
            : `ชม.ละ ฿${hourlyRate.toLocaleString('th-TH')}`,
        daysWorked,
        hours: r2(hours),
        regularHours: r2(regularHours),
        otHours: otOn ? r2(otHours) : 0,
        lateCount,
        lateMinutes,
        absentCount,
        basePay: r2(basePay),
        otPay: r2(otPay),
        bonus: r2(bonus),
        deductions: r2(deductions),
        sso,
        tax,
        gross: r2(gross),
        net: r2(gross - deductions - sso - tax)
      };
    })
    .filter(p => p.daysWorked > 0 || p.payType === 'monthly' || p.bonus > 0 || p.deductions > 0 || staff.find(s => s.id === p.staffId)?.status !== 'inactive');
}

/** "HH:MM" plus some hours, wrapping past midnight */
export function addHours(t: string, hours: number): string {
  const m = mins(t);
  if (m === null) return t;
  const total = (m + Math.round(hours * 60)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface PayTotals {
  gross: number;
  tax: number;
  sso: number;
  net: number;
  months: number; // months with pay
}

/** Pay added up over several months per person (for year-to-date figures and the 50 ทวิ certificate) */
export function payrollTotals(
  staff: StaffMember[],
  shifts: ShiftEntry[],
  months: string[], // YYYY-MM
  adjustments: PayrollAdjustment[],
  settings: PayrollSettings,
  today: string
): Map<string, PayTotals> {
  const totals = new Map<string, PayTotals>();
  // A monthly salary is counted from the month of the person's first recorded shift (before that
  // they may not have worked here yet)
  const firstMonth = new Map<string, string>();
  shifts.forEach(sh => {
    const m = (sh.date || '').slice(0, 7);
    if (m && (!firstMonth.has(sh.staffId) || m < firstMonth.get(sh.staffId)!)) firstMonth.set(sh.staffId, m);
  });
  months.forEach(m => {
    monthlyPayroll(staff, shifts, m, adjustments, settings, today).forEach(p => {
      if (p.gross <= 0) return;
      const first = firstMonth.get(p.staffId);
      if (first && m < first) return;
      const t = totals.get(p.staffId) || { gross: 0, tax: 0, sso: 0, net: 0, months: 0 };
      totals.set(p.staffId, {
        gross: r2(t.gross + p.gross),
        tax: r2(t.tax + p.tax),
        sso: r2(t.sso + p.sso),
        net: r2(t.net + p.net),
        months: t.months + 1
      });
    });
  });
  return totals;
}

/** "2026-01" … up to and including `month` in the same year */
export const monthsOfYearUpTo = (month: string): string[] => {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: m }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
};
