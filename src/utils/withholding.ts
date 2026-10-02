/**
 * Personal income tax withheld from salaries (ภ.ง.ด.1) and the income types printed on the
 * withholding tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย, มาตรา 50 ทวิ).
 *
 * Salary withholding follows the Revenue Department's method for employees: the month's pay is
 * taken as a year's income (x12), less the expense deduction (50%, at most 100,000), the personal
 * allowance (60,000) and social security paid; the year's tax on the progressive rates is spread
 * over 12 months. Other allowances (spouse, children, insurance, funds) are not known to the shop,
 * so this is an estimate: the employee settles the exact tax in their own return (ภ.ง.ด.90/91).
 */

export const PERSONAL_ALLOWANCE = 60_000;
export const EXPENSE_RATE = 0.5;
export const EXPENSE_CAP = 100_000;

/** Progressive rates on net income: [upper bound of the band, rate] */
const BANDS: [number, number][] = [
  [150_000, 0],
  [300_000, 0.05],
  [500_000, 0.1],
  [750_000, 0.15],
  [1_000_000, 0.2],
  [2_000_000, 0.25],
  [5_000_000, 0.3],
  [Infinity, 0.35]
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tax on a year's net income (after deductions and allowances) */
export function annualIncomeTax(netIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of BANDS) {
    if (netIncome <= lower) break;
    tax += (Math.min(netIncome, upper) - lower) * rate;
    lower = upper;
  }
  return r2(tax);
}

/** Estimated tax to withhold from one month's pay (0 for most restaurant wages) */
export function monthlySalaryWithholding(monthlyIncome: number, monthlySso = 0): number {
  if (monthlyIncome <= 0) return 0;
  const yearIncome = monthlyIncome * 12;
  const expense = Math.min(yearIncome * EXPENSE_RATE, EXPENSE_CAP);
  const net = yearIncome - expense - PERSONAL_ALLOWANCE - Math.max(0, monthlySso) * 12;
  return r2(annualIncomeTax(Math.max(0, net)) / 12);
}

/** Return forms the certificate is filed with */
export type WhtForm = 'pnd1a' | 'pnd1a_ex' | 'pnd2' | 'pnd3' | 'pnd2a' | 'pnd3a' | 'pnd53';

export const WHT_FORM_LABEL: Record<WhtForm, string> = {
  pnd1a: 'ภ.ง.ด.1ก',
  pnd1a_ex: 'ภ.ง.ด.1ก พิเศษ',
  pnd2: 'ภ.ง.ด.2',
  pnd3: 'ภ.ง.ด.3',
  pnd2a: 'ภ.ง.ด.2ก',
  pnd3a: 'ภ.ง.ด.3ก',
  pnd53: 'ภ.ง.ด.53'
};

export interface WhtIncomeType {
  id: string;
  /** Row of the certificate's income table (1–6) */
  row: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  /** Usual rate for this kind of payment (%) */
  rate: number;
}

/** Payments a restaurant usually withholds on, with their usual rates */
export const WHT_INCOME_TYPES: WhtIncomeType[] = [
  { id: 'salary', row: 1, label: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)', rate: 0 },
  { id: 'fee', row: 2, label: 'ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)', rate: 3 },
  { id: 'service', row: 6, label: 'ค่าบริการ / ค่าจ้างทำของ', rate: 3 },
  { id: 'rent', row: 6, label: 'ค่าเช่า', rate: 5 },
  { id: 'transport', row: 6, label: 'ค่าขนส่ง', rate: 1 },
  { id: 'advertising', row: 6, label: 'ค่าโฆษณา', rate: 2 },
  { id: 'professional', row: 6, label: 'ค่าวิชาชีพอิสระ (เช่น ทนาย บัญชี)', rate: 3 },
  { id: 'prize', row: 6, label: 'รางวัล ส่วนลด หรือประโยชน์จากการส่งเสริมการขาย', rate: 3 },
  { id: 'other', row: 6, label: 'อื่น ๆ', rate: 3 }
];

/** The certificate's income table rows (row 6 carries the kind of payment written in) */
export const WHT_TABLE_ROWS: { row: WhtIncomeType['row']; label: string }[] = [
  { row: 1, label: '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)' },
  { row: 2, label: '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)' },
  { row: 3, label: '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)' },
  { row: 4, label: '4. ดอกเบี้ย เงินปันผล ฯลฯ ตามมาตรา 40 (4)' },
  { row: 5, label: '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส' },
  { row: 6, label: '6. อื่น ๆ (ระบุ)' }
];

/**
 * Where a payment goes on the certificate: payments under the Revenue Department's order under
 * section 3 เตรส (services, rent, transport, advertising, professional fees, prizes) are row 5;
 * row 6 is for anything else.
 */
export function whtTableRow(typeId: string): WhtIncomeType['row'] {
  const t = WHT_INCOME_TYPES.find(x => x.id === typeId);
  if (!t) return 6;
  if (['service', 'rent', 'transport', 'advertising', 'professional', 'prize'].includes(t.id)) return 5;
  return t.row;
}

/** 1-2345-67890-12-3 */
export function formatThaiId(id: string): string {
  const d = (id || '').replace(/\D/g, '');
  if (d.length !== 13) return id || '';
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
}
