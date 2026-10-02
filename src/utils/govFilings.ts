import type { Expense, Order, PayrollAdjustment, PayrollSettings, ShiftEntry, StaffMember } from '../types';
import { claimableInputVat, round2 } from './accounting';
import { countsAsRevenue, orderVatBreakdown } from './orderUtils';
import { monthlyPayroll, payrollTotals } from './payroll';
import type { WhtCertificate } from './staffDocs';

/**
 * What a restaurant company files with government offices each month and year, when it is due,
 * and the figures and attachment lists for each filing, prepared from the shop's own records.
 * The app does not file anything itself: the owner or accountant files on the agency's website.
 *
 * Deadlines follow the usual rules (paper / e-filing). The Revenue Department sometimes extends
 * e-filing deadlines, so the dates are shown as a guide.
 */

export type FilingCode = 'pp30' | 'pnd1' | 'pnd3' | 'pnd53' | 'sso' | 'pnd1a' | 'pnd51' | 'pnd50' | 'fs' | 'signage';

export interface FilingDef {
  code: FilingCode;
  name: string;
  title: string;
  agency: string;
  link: string;
  frequency: 'monthly' | 'yearly';
}

export const FILINGS: Record<FilingCode, FilingDef> = {
  pp30: { code: 'pp30', name: 'ภ.พ.30', title: 'ภาษีมูลค่าเพิ่ม', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'monthly' },
  pnd1: { code: 'pnd1', name: 'ภ.ง.ด.1', title: 'ภาษีหัก ณ ที่จ่าย เงินเดือนพนักงาน', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'monthly' },
  pnd3: { code: 'pnd3', name: 'ภ.ง.ด.3', title: 'ภาษีหัก ณ ที่จ่าย จ่ายบุคคลธรรมดา', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'monthly' },
  pnd53: { code: 'pnd53', name: 'ภ.ง.ด.53', title: 'ภาษีหัก ณ ที่จ่าย จ่ายนิติบุคคล', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'monthly' },
  sso: { code: 'sso', name: 'สปส.1-10', title: 'เงินสมทบประกันสังคม', agency: 'สำนักงานประกันสังคม', link: 'https://www.sso.go.th', frequency: 'monthly' },
  pnd1a: { code: 'pnd1a', name: 'ภ.ง.ด.1ก', title: 'สรุปเงินเดือนและภาษีพนักงานทั้งปี', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'yearly' },
  pnd51: { code: 'pnd51', name: 'ภ.ง.ด.51', title: 'ภาษีเงินได้นิติบุคคล ครึ่งปี', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'yearly' },
  pnd50: { code: 'pnd50', name: 'ภ.ง.ด.50', title: 'ภาษีเงินได้นิติบุคคล ประจำปี', agency: 'กรมสรรพากร', link: 'https://efiling.rd.go.th', frequency: 'yearly' },
  fs: { code: 'fs', name: 'งบการเงิน / บอจ.5', title: 'ส่งงบการเงินและรายชื่อผู้ถือหุ้น', agency: 'กรมพัฒนาธุรกิจการค้า', link: 'https://efiling.dbd.go.th', frequency: 'yearly' },
  signage: { code: 'signage', name: 'ภาษีป้าย', title: 'ยื่นแบบภาษีป้าย (ภ.ป.1)', agency: 'เทศบาล / สำนักงานเขต', link: '', frequency: 'yearly' }
};

/** YYYY-MM-DD of a day in a month (day past the month's end = its last day) */
const dayOf = (y: number, m: number, d: number) => {
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
export const prevMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

export interface FilingItem {
  /** code:period, e.g. "pp30:2026-09" */
  key: string;
  code: FilingCode;
  /** The month (YYYY-MM) or year (YYYY) the filing covers */
  period: string;
  periodLabel: string;
  /** Last day to file (e-filing when there is one) */
  dueDate: string;
  /** Paper filing deadline when it differs */
  paperDueDate?: string;
  /** required = data shows it must be filed; check = file if it applies; none = nothing to file */
  need: 'required' | 'check' | 'none';
  needNote: string;
}

const thMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

export interface FilingSources {
  vatRegistered: boolean;
  staff: StaffMember[];
  shifts: ShiftEntry[];
  adjustments: PayrollAdjustment[];
  payroll: PayrollSettings;
  certificates: WhtCertificate[];
  today: string;
}

/** Everything due in a calendar month (monthly filings for the month before, plus yearly ones) */
export function filingsDueIn(month: string, src: FilingSources): FilingItem[] {
  const [y, m] = month.split('-').map(Number);
  const work = prevMonth(month);
  const items: FilingItem[] = [];
  const pay = monthlyPayroll(src.staff, src.shifts, work, src.adjustments, src.payroll, src.today).filter(p => p.gross > 0);
  const certs = certificatesIn(src.certificates, work);

  items.push({
    key: `pp30:${work}`,
    code: 'pp30',
    period: work,
    periodLabel: thMonth(work),
    dueDate: dayOf(y, m, 23),
    paperDueDate: dayOf(y, m, 15),
    need: src.vatRegistered ? 'required' : 'none',
    needNote: src.vatRegistered ? 'จดทะเบียน VAT ต้องยื่นทุกเดือนแม้ไม่มียอดขาย' : 'ร้านตั้งค่าว่าไม่ได้จดทะเบียน VAT'
  });
  const taxed = pay.filter(p => p.tax > 0);
  items.push({
    key: `pnd1:${work}`,
    code: 'pnd1',
    period: work,
    periodLabel: thMonth(work),
    dueDate: dayOf(y, m, 15),
    paperDueDate: dayOf(y, m, 7),
    need: taxed.length ? 'required' : pay.length ? 'check' : 'none',
    needNote: taxed.length
      ? `หักภาษีพนักงาน ${taxed.length} คน`
      : pay.length
        ? 'จ่ายเงินเดือนแต่ไม่มีภาษีหัก โดยทั่วไปไม่ต้องยื่น (ตรวจสอบกับนักบัญชี)'
        : 'ไม่มีการจ่ายเงินเดือนในระบบ'
  });
  (['pnd3', 'pnd53'] as const).forEach(code => {
    const mine = certs.filter(c => c.form === code);
    items.push({
      key: `${code}:${work}`,
      code,
      period: work,
      periodLabel: thMonth(work),
      dueDate: dayOf(y, m, 15),
      paperDueDate: dayOf(y, m, 7),
      need: mine.length ? 'required' : 'none',
      needNote: mine.length ? `มีหนังสือรับรอง 50 ทวิ ${mine.length} ใบ` : 'ไม่มีการหักภาษีที่บันทึกไว้ (ออก 50 ทวิ แบบ ' + FILINGS[code].name + ' ก่อน)'
    });
  });
  const insured = pay.filter(p => p.sso > 0);
  items.push({
    key: `sso:${work}`,
    code: 'sso',
    period: work,
    periodLabel: thMonth(work),
    dueDate: dayOf(y, m, 15),
    need: insured.length ? 'required' : 'none',
    needNote: insured.length ? `ผู้ประกันตน ${insured.length} คน` : 'ไม่มีพนักงานที่หักประกันสังคม'
  });

  // Yearly filings, in the month they fall due (accounts closing on 31 December)
  if (m === 2) {
    const hasPay = payrollTotals(src.staff, src.shifts, monthsOf(y - 1), src.adjustments, src.payroll, src.today).size > 0;
    items.push({
      key: `pnd1a:${y - 1}`,
      code: 'pnd1a',
      period: String(y - 1),
      periodLabel: `ปี ${y - 1 + 543}`,
      dueDate: dayOf(y, 2, 31),
      need: hasPay ? 'required' : 'check',
      needNote: hasPay ? 'มีการจ่ายเงินเดือนในปีที่ผ่านมา' : 'ยื่นถ้ามีการจ่ายเงินเดือนในปีที่ผ่านมา'
    });
  }
  if (m === 3) items.push(yearly('signage', String(y), dayOf(y, 3, 31), 'ยื่นแบบภายในมีนาคม ชำระตามที่ท้องถิ่นแจ้ง (ถ้ามีป้ายชื่อร้าน)'));
  if (m === 5) {
    items.push(yearly('pnd50', String(y - 1), dayOf(y, 5, 30), 'ภายใน 150 วันหลังปิดบัญชี · ส่งงบกำไรขาดทุนให้นักบัญชี'));
    items.push(yearly('fs', String(y - 1), dayOf(y, 5, 31), 'ประชุมผู้ถือหุ้นอนุมัติงบภายใน 4 เดือน แล้วส่งงบภายใน 1 เดือนหลังประชุม'));
  }
  if (m === 8) items.push(yearly('pnd51', String(y), dayOf(y, 8, 31), 'ประมาณการกำไรครึ่งปีแรก · ส่งงบ ม.ค.–มิ.ย. ให้นักบัญชี'));
  return items;
}

const yearly = (code: FilingCode, year: string, dueDate: string, note: string): FilingItem => ({
  key: `${code}:${year}`,
  code,
  period: year,
  periodLabel: `ปี ${Number(year) + 543}`,
  dueDate,
  need: 'check',
  needNote: note
});

export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

/** Certificates of a month: by the date the tax was withheld (issue date) */
export const certificatesIn = (certs: WhtCertificate[], month: string) => certs.filter(c => (c.issueDate || '').startsWith(month));

// ---------- Figures for each filing ----------

export interface Pp30Figures {
  salesBase: number;
  outputVat: number;
  purchaseBase: number;
  inputVat: number;
  payable: number; // negative = overpaid (carried forward / refund)
  orderCount: number;
  purchaseCount: number;
}

/** ภ.พ.30: sales and purchases with VAT for a month */
export function pp30Figures(orders: Order[], expenses: Expense[], month: string, branchId: string | 'all'): Pp30Figures {
  let salesBase = 0;
  let outputVat = 0;
  let orderCount = 0;
  orders.forEach(o => {
    if ((branchId !== 'all' && o.branchId !== branchId) || !countsAsRevenue(o)) return;
    const d = new Date(o.createdAt);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (m !== month) return;
    const { base, vat } = orderVatBreakdown(o);
    salesBase += base;
    outputVat += vat;
    orderCount++;
  });
  let purchaseBase = 0;
  let inputVat = 0;
  let purchaseCount = 0;
  expenses.forEach(e => {
    if ((branchId !== 'all' && e.branchId && e.branchId !== branchId) || !(e.date || '').startsWith(month)) return;
    const vat = claimableInputVat(e, true);
    if (vat <= 0) return;
    inputVat += vat;
    purchaseBase += typeof e.netAmount === 'number' ? e.netAmount : (e.amount || 0) - vat;
    purchaseCount++;
  });
  return {
    salesBase: round2(salesBase),
    outputVat: round2(outputVat),
    purchaseBase: round2(purchaseBase),
    inputVat: round2(inputVat),
    payable: round2(outputVat - inputVat),
    orderCount,
    purchaseCount
  };
}

/** A Thai name split into prefix, first name and surname (for filing attachments) */
export function splitThaiName(full: string): { prefix: string; first: string; last: string } {
  let rest = (full || '').trim().replace(/\s+/g, ' ');
  const m = rest.match(/^(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|บริษัท|ห้างหุ้นส่วนจำกัด|หจก\.|ร้าน)\s*/);
  const prefix = m ? m[1] : '';
  if (m) rest = rest.slice(m[0].length);
  if (prefix && ['บริษัท', 'ห้างหุ้นส่วนจำกัด', 'หจก.', 'ร้าน'].includes(prefix)) return { prefix, first: rest, last: '' };
  const i = rest.indexOf(' ');
  return i < 0 ? { prefix, first: rest, last: '' } : { prefix, first: rest.slice(0, i), last: rest.slice(i + 1) };
}

const digits = (s?: string) => (s || '').replace(/\D/g, '');

/** dd/mm/yyyy (Buddhist year) */
export const filingDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${Number(y) + 543}`;
};
const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return dayOf(y, m, 31);
};

export interface AttachmentTable {
  headers: string[];
  rows: (string | number)[][];
  totals: { count: number; amount: number; tax: number; extra?: Record<string, number> };
  /** People or payees with a missing or wrong ID number */
  missingId: string[];
}

/** ภ.ง.ด.1 attachment: employees paid in the month with the tax withheld */
export function pnd1Attachment(src: FilingSources, month: string, onlyTaxed = false): AttachmentTable {
  const pay = monthlyPayroll(src.staff, src.shifts, month, src.adjustments, src.payroll, src.today).filter(p => p.gross > 0 && (!onlyTaxed || p.tax > 0));
  const payDate = filingDate(lastDayOf(month) < src.today ? lastDayOf(month) : src.today);
  const missingId: string[] = [];
  const rows = pay.map((p, i) => {
    const s = src.staff.find(x => x.id === p.staffId);
    const n = splitThaiName(p.name);
    if (digits(s?.taxId).length !== 13) missingId.push(p.name);
    return [i + 1, digits(s?.taxId), n.prefix, n.first, n.last, payDate, round2(p.gross), round2(p.tax), 1];
  });
  return {
    headers: ['ลำดับ', 'เลขประจำตัวผู้เสียภาษีอากร', 'คำนำหน้าชื่อ', 'ชื่อ', 'ชื่อสกุล', 'วันเดือนปีที่จ่าย', 'จำนวนเงินได้ที่จ่าย', 'จำนวนเงินภาษีที่หัก', 'เงื่อนไข (1=หัก ณ ที่จ่าย)'],
    rows,
    totals: { count: rows.length, amount: round2(pay.reduce((t, p) => t + p.gross, 0)), tax: round2(pay.reduce((t, p) => t + p.tax, 0)) },
    missingId
  };
}

/** ภ.ง.ด.1ก: each employee's pay and tax for the year */
export function pnd1aAttachment(src: FilingSources, year: number): AttachmentTable {
  const totals = payrollTotals(src.staff, src.shifts, monthsOf(year), src.adjustments, src.payroll, src.today);
  const missingId: string[] = [];
  const rows: (string | number)[][] = [];
  let amount = 0;
  let tax = 0;
  src.staff.forEach(s => {
    const t = totals.get(s.id);
    if (!t) return;
    const n = splitThaiName(s.name);
    if (digits(s.taxId).length !== 13) missingId.push(s.name);
    rows.push([rows.length + 1, digits(s.taxId), n.prefix, n.first, n.last, s.address || '', round2(t.gross), round2(t.tax), 1]);
    amount += t.gross;
    tax += t.tax;
  });
  return {
    headers: ['ลำดับ', 'เลขประจำตัวผู้เสียภาษีอากร', 'คำนำหน้าชื่อ', 'ชื่อ', 'ชื่อสกุล', 'ที่อยู่', 'จำนวนเงินได้ทั้งปี', 'ภาษีที่หักทั้งปี', 'เงื่อนไข (1=หัก ณ ที่จ่าย)'],
    rows,
    totals: { count: rows.length, amount: round2(amount), tax: round2(tax) },
    missingId
  };
}

/** ภ.ง.ด.3 / ภ.ง.ด.53 attachment: one line per payment on the certificates of the month */
export function pnd3Attachment(certs: WhtCertificate[], month: string, form: 'pnd3' | 'pnd53'): AttachmentTable {
  const mine = certificatesIn(certs, month).filter(c => c.form === form);
  const missingId: string[] = [];
  const rows: (string | number)[][] = [];
  let amount = 0;
  let tax = 0;
  mine.forEach(c => {
    if (digits(c.payee.taxId).length !== 13) missingId.push(c.payee.name);
    const n = splitThaiName(c.payee.name);
    c.lines.forEach(l => {
      const rate = l.amount > 0 ? round2((l.tax / l.amount) * 100) : 0;
      rows.push([
        rows.length + 1,
        digits(c.payee.taxId),
        form === 'pnd53' ? '00000' : '',
        n.prefix,
        form === 'pnd53' ? c.payee.name : n.first,
        form === 'pnd53' ? '' : n.last,
        c.payee.address || '',
        filingDate(c.issueDate),
        l.detail || '',
        rate,
        round2(l.amount),
        round2(l.tax),
        c.mode === 'always' ? 2 : c.mode === 'once' ? 3 : 1
      ]);
      amount += l.amount;
      tax += l.tax;
    });
  });
  return {
    headers: ['ลำดับ', 'เลขประจำตัวผู้เสียภาษีอากร', 'สาขาที่', 'คำนำหน้าชื่อ', 'ชื่อ', 'ชื่อสกุล', 'ที่อยู่', 'วันเดือนปีที่จ่าย', 'ประเภทเงินได้', 'อัตราภาษี (%)', 'จำนวนเงินที่จ่าย', 'ภาษีที่หัก', 'เงื่อนไข'],
    rows,
    totals: { count: mine.length, amount: round2(amount), tax: round2(tax) },
    missingId
  };
}

/** สปส.1-10: insured employees, the wage contributions are worked on and both shares */
export function ssoAttachment(src: FilingSources, month: string): AttachmentTable {
  const pay = monthlyPayroll(src.staff, src.shifts, month, src.adjustments, src.payroll, src.today).filter(p => p.sso > 0);
  const missingId: string[] = [];
  let wages = 0;
  let employee = 0;
  const rows = pay.map((p, i) => {
    const s = src.staff.find(x => x.id === p.staffId);
    const n = splitThaiName(p.name);
    if (digits(s?.taxId).length !== 13) missingId.push(p.name);
    // Contributions are worked on the wage within the floor and ceiling
    const base = Math.min(Math.max(p.basePay + p.otPay, src.payroll.ssoMinWage), src.payroll.ssoMaxWage);
    wages += base;
    employee += p.sso;
    return [i + 1, digits(s?.taxId), n.prefix, n.first, n.last, round2(base), p.sso];
  });
  return {
    headers: ['ลำดับ', 'เลขประจำตัวประชาชน', 'คำนำหน้าชื่อ', 'ชื่อ', 'ชื่อสกุล', 'ค่าจ้าง', 'เงินสมทบ (ผู้ประกันตน)'],
    rows,
    totals: {
      count: rows.length,
      amount: round2(wages),
      tax: 0,
      // The employer pays the same amount again
      extra: { employee: round2(employee), employer: round2(employee), total: round2(employee * 2) }
    },
    missingId
  };
}

/** A filing's status as recorded by the shop */
export interface FilingRecord {
  id: string; // FilingItem.key
  code: FilingCode;
  period: string;
  filedAt: string; // YYYY-MM-DD
  refNo?: string;
  amountPaid?: number;
  note?: string;
  by?: string;
  /** Proof of filing / payment (files are stored separately, see services/filingProofs) */
  proofs?: { id: string; name: string; kind: 'image' | 'pdf'; size: number; addedAt: string; by?: string }[];
}

/** Days left (negative = late) and a label for it */
export function dueStatus(item: FilingItem, today: string, filed?: FilingRecord): { days: number; label: string; tone: 'done' | 'late' | 'soon' | 'ok' | 'none' } {
  const days = daysBetween(today, item.dueDate);
  if (filed) return { days, label: `ยื่นแล้ว ${filingDate(filed.filedAt)}`, tone: 'done' };
  if (item.need === 'none') return { days, label: 'ไม่ต้องยื่น', tone: 'none' };
  if (days < 0) return { days, label: `เลยกำหนด ${-days} วัน`, tone: 'late' };
  if (days === 0) return { days, label: 'ครบกำหนดวันนี้', tone: 'soon' };
  return { days, label: `อีก ${days} วัน`, tone: days <= 3 ? 'soon' : 'ok' };
}

/** Reminders before filings are due (on this device; on by default) */
export const REMIND_KEY = 'POS_FILING_REMIND';
export const readRemindOn = () => {
  try {
    return localStorage.getItem(REMIND_KEY) !== '0';
  } catch {
    return true;
  }
};
