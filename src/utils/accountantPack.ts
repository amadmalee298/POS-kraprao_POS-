import type { Expense, ExpenseCategory, Order, OtherIncome, PayrollAdjustment, PayrollSettings, ShiftEntry, StaffMember } from '../types';
import { buildProfitAndLoss, EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, claimableInputVat, round2 } from './accounting';
import { FILINGS, filingDate, FilingRecord, filingsDueIn, monthsOf } from './govFilings';
import { countsAsRevenue, orderVatBreakdown } from './orderUtils';
import { monthlyPayroll } from './payroll';
import type { Party, WhtCertificate } from './staffDocs';
import { WHT_FORM_LABEL } from './withholding';

/**
 * The year's records for the accountant, as CSV files (Excel opens them with Thai text): profit
 * and loss by month, sales and purchase VAT reports, expenses, other income, payroll, withholding
 * tax certificates and the government filings with their status. Receipt and proof images are
 * added by the caller as files.
 */

export interface PackInput {
  year: number;
  branchId: string | 'all';
  shop: Party;
  vatRegistered: boolean;
  orders: Order[];
  expenses: Expense[];
  incomes: OtherIncome[];
  staff: StaffMember[];
  shifts: ShiftEntry[];
  adjustments: PayrollAdjustment[];
  payroll: PayrollSettings;
  certificates: WhtCertificate[];
  records: FilingRecord[];
  today: string;
}

export interface PackFile {
  path: string;
  text: string;
}

const csv = (headers: string[], rows: (string | number | undefined | null)[][]) => {
  const cell = (v: string | number | undefined | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
};
const ymd = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const thMonthShort = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short' });

export function buildAccountantPack(p: PackInput): PackFile[] {
  const y = String(p.year);
  const months = monthsOf(p.year);
  const inBranch = (id?: string) => p.branchId === 'all' || !id || id === p.branchId;
  const inYear = (date: string) => ymd(date).startsWith(y);
  const files: PackFile[] = [];

  // 1. Profit and loss by month
  const pls = months.map(m =>
    buildProfitAndLoss({ orders: p.orders, expenses: p.expenses, incomes: p.incomes }, { branchId: p.branchId, inPeriod: d => ymd(d).startsWith(m) }, p.vatRegistered, {
      today: p.today
    })
  );
  const year = buildProfitAndLoss({ orders: p.orders, expenses: p.expenses, incomes: p.incomes }, { branchId: p.branchId, inPeriod: inYear }, p.vatRegistered, { today: p.today });
  const line = (label: string, pick: (x: typeof year) => number): (string | number)[] => [label, ...pls.map(pick), pick(year)];
  const cats = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
  files.push({
    path: '01_งบกำไรขาดทุน_รายเดือน.csv',
    text: csv(
      ['รายการ', ...months.map(thMonthShort), `รวมปี ${p.year + 543}`],
      [
        line('ยอดขายหน้าร้าน', x => x.storeSales),
        line('ยอดขายเดลิเวอรี่', x => x.deliverySales),
        line('รายได้จัดเลี้ยง', x => x.cateringSales),
        line('รวมรายได้จากการขาย', x => x.salesRevenue),
        line('ต้นทุนขาย', x => x.cogs),
        line('กำไรขั้นต้น', x => x.grossProfit),
        ...cats.map(c => line(`ค่าใช้จ่าย: ${EXPENSE_CATEGORY_LABELS[c]}`, x => x.expenses[c])),
        line('ค่าเสื่อมราคาอุปกรณ์', x => x.depreciation),
        line('รวมค่าใช้จ่ายในการขายและบริหาร', x => x.sga),
        line('กำไรจากการดำเนินงาน', x => x.operatingProfit),
        line('รายได้อื่น', x => x.otherIncome),
        line('กำไร (ขาดทุน) ก่อนภาษีเงินได้', x => x.profitBeforeTax),
        line('ภาษีขาย', x => x.outputVat),
        line('ภาษีซื้อ', x => x.inputVat),
        line('ภาษีมูลค่าเพิ่มที่ต้องชำระ', x => x.vatPayable),
        line('จำนวนบิล', x => x.orderCount)
      ]
    )
  });

  // 2. Sales VAT report (every bill that counts as a sale)
  const sales = p.orders
    .filter(o => inBranch(o.branchId) && countsAsRevenue(o) && inYear(o.createdAt))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  files.push({
    path: '02_รายงานภาษีขาย.csv',
    text: csv(
      ['วันที่', 'เลขที่บิล', 'เลขที่ใบกำกับภาษีเต็มรูป', 'ชื่อผู้ซื้อ', 'เลขผู้เสียภาษีผู้ซื้อ', 'ประเภท', 'ชำระโดย', 'มูลค่าก่อน VAT', 'VAT', 'รวม'],
      sales.map(o => {
        const { base, vat } = orderVatBreakdown(o);
        return [ymd(o.createdAt), o.orderNumber, o.taxInvoiceNo || '', o.customerTaxInfo?.companyName || '', o.customerTaxInfo?.taxId || '', o.orderType, o.paymentMethod, base, vat, round2(o.grandTotal || 0)];
      })
    )
  });

  // 3. Purchase VAT report and 4. every expense
  const expenses = p.expenses.filter(e => inBranch(e.branchId) && inYear(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const withVat = expenses.filter(e => claimableInputVat(e, true) > 0);
  files.push({
    path: '03_รายงานภาษีซื้อ.csv',
    text: csv(
      ['วันที่', 'เลขที่ใบกำกับภาษี / อ้างอิง', 'รายการ / ผู้ขาย', 'หมวด', 'มูลค่าก่อน VAT', 'VAT', 'รวม'],
      withVat.map(e => [e.date, e.refNumber || '', e.title, EXPENSE_CATEGORY_LABELS[e.category] || e.category, round2(e.netAmount ?? e.amount - e.vatAmount), round2(e.vatAmount), round2(e.amount)])
    )
  });
  files.push({
    path: '04_ค่าใช้จ่ายทั้งหมด.csv',
    text: csv(
      ['วันที่', 'หมวด', 'รายการ', 'จำนวนเงิน', 'มี VAT', 'VAT', 'ก่อน VAT', 'เลขที่อ้างอิง', 'หมายเหตุ', 'ไฟล์ใบเสร็จ'],
      expenses.map(e => [e.date, EXPENSE_CATEGORY_LABELS[e.category] || e.category, e.title, round2(e.amount), e.includeVat ? 'มี' : '', round2(e.vatAmount || 0), round2(e.netAmount ?? e.amount), e.refNumber || '', e.note || '', e.receiptImage?.startsWith('data:') ? receiptFileName(e) : ''])
    )
  });

  // 5. Other income
  files.push({
    path: '05_รายได้อื่น.csv',
    text: csv(
      ['วันที่', 'หมวด', 'รายการ', 'ผู้จ่าย', 'จำนวนเงิน', 'ชำระโดย', 'เลขที่อ้างอิง', 'หมายเหตุ'],
      p.incomes
        .filter(i => inBranch(i.branchId) && inYear(i.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(i => [i.date, INCOME_CATEGORY_LABELS[i.category] || i.category, i.title, i.payerName || '', round2(i.amount), i.paymentMethod || '', i.refNumber || '', i.note || ''])
    )
  });

  // 6. Payroll by month
  const payRows: (string | number)[][] = [];
  months
    .filter(m => m <= p.today.slice(0, 7))
    .forEach(m =>
      monthlyPayroll(p.staff, p.shifts, m, p.adjustments, p.payroll, p.today)
        .filter(r => r.gross > 0)
        .forEach(r => {
          const s = p.staff.find(x => x.id === r.staffId);
          payRows.push([m, r.name, s?.taxId || '', r.role, r.daysWorked, r.hours, r.otHours, r.basePay, r.otPay, r.bonus, r.gross, r.sso, r.sso, r.tax, r.deductions, r.net]);
        })
    );
  files.push({
    path: '06_เงินเดือนพนักงาน.csv',
    text: csv(
      ['เดือน', 'ชื่อ', 'เลขประจำตัว', 'ตำแหน่ง', 'วันทำงาน', 'ชั่วโมง', 'OT ชม.', 'ค่าจ้าง', 'ค่า OT', 'เงินเพิ่ม', 'รวมเงินได้', 'ประกันสังคม (ลูกจ้าง)', 'ประกันสังคม (นายจ้าง)', 'ภาษีหัก ณ ที่จ่าย', 'หักอื่น', 'รับสุทธิ'],
      payRows
    )
  });

  // 7. Withholding tax certificates issued in the year
  const certs = p.certificates.filter(c => (c.issueDate || '').startsWith(y)).sort((a, b) => `${a.bookNo}${a.docNo}`.localeCompare(`${b.bookNo}${b.docNo}`));
  files.push({
    path: '07_หนังสือรับรอง50ทวิ.csv',
    text: csv(
      ['เล่มที่', 'เลขที่', 'วันที่ออก', 'แบบ', 'ผู้ถูกหักภาษี', 'เลขผู้เสียภาษี', 'ประเภทเงินได้', 'จำนวนเงินที่จ่าย', 'ภาษีที่หัก', 'ประกันสังคม'],
      certs.map(c => [c.bookNo, c.docNo, c.issueDate, WHT_FORM_LABEL[c.form], c.payee.name, c.payee.taxId, c.lines.map(l => l.detail || `แถว ${l.row}`).join(' / '), round2(c.lines.reduce((t, l) => t + l.amount, 0)), round2(c.lines.reduce((t, l) => t + l.tax, 0)), c.sso || ''])
    )
  });

  // 8. Government filings of the year and their status
  const src = { vatRegistered: p.vatRegistered, staff: p.staff, shifts: p.shifts, adjustments: p.adjustments, payroll: p.payroll, certificates: p.certificates, today: p.today };
  const dueMonths = [...months.slice(1), `${p.year + 1}-01`];
  const items = dueMonths
    .flatMap(m => filingsDueIn(m, src))
    .filter(i => i.period.startsWith(y) && (i.need !== 'none' || p.records.some(r => r.id === i.key)));
  files.push({
    path: '08_สถานะการยื่นแบบราชการ.csv',
    text: csv(
      ['แบบ', 'เรื่อง', 'หน่วยงาน', 'งวด', 'ครบกำหนด', 'ต้องยื่น', 'สถานะ', 'วันที่ยื่น', 'เลขอ้างอิง', 'ยอดที่ชำระ', 'หลักฐานแนบ'],
      items.map(i => {
        const r = p.records.find(x => x.id === i.key);
        return [
          FILINGS[i.code].name,
          FILINGS[i.code].title,
          FILINGS[i.code].agency,
          i.periodLabel,
          filingDate(i.dueDate),
          i.need === 'required' ? 'ต้องยื่น' : 'ตรวจสอบ',
          r ? 'ยื่นแล้ว' : i.dueDate < p.today ? 'ยังไม่ได้บันทึกว่ายื่น' : 'ยังไม่ถึงกำหนด',
          r ? filingDate(r.filedAt) : '',
          r?.refNo || '',
          r?.amountPaid ?? '',
          r?.proofs?.length ? `${r.proofs.length} ไฟล์` : ''
        ];
      })
    )
  });

  files.push({
    path: 'อ่านก่อน.txt',
    text: [
      `ชุดเอกสารบัญชีปี ${p.year + 543} (${p.year})`,
      `${p.shop.name}${p.shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${p.shop.taxId}` : ''}`,
      `สาขา: ${p.branchId === 'all' ? 'ทุกสาขา' : p.branchId}`,
      `จัดทำจากระบบ POS วันที่ ${filingDate(p.today)}`,
      '',
      `รายได้จากการขายทั้งปี ${year.salesRevenue.toLocaleString('th-TH')} บาท · กำไรก่อนภาษี ${year.profitBeforeTax.toLocaleString('th-TH')} บาท`,
      `ภาษีขาย ${year.outputVat.toLocaleString('th-TH')} · ภาษีซื้อ ${year.inputVat.toLocaleString('th-TH')} บาท`,
      `บิลขาย ${sales.length} ใบ · ค่าใช้จ่าย ${expenses.length} รายการ · หนังสือรับรอง 50 ทวิ ${certs.length} ใบ`,
      '',
      'ไฟล์ในชุดนี้',
      ...files.map(f => `- ${f.path}`),
      '- หลักฐานการยื่น/ : ใบยื่นแบบหรือใบเสร็จชำระภาษีที่แนบไว้',
      '- ใบเสร็จค่าใช้จ่าย/ : รูปใบเสร็จที่ถ่ายเก็บในระบบ',
      '',
      'หมายเหตุ: ต้นทุนขายคำนวณจากราคาทุนของเมนู (เมนูที่ยังไม่มีราคาทุนประมาณจากราคาขาย) · ไฟล์ CSV เปิดด้วย Excel ได้',
      'ตัวเลขทั้งหมดมาจากข้อมูลที่บันทึกในระบบ ควรตรวจกับเอกสารจริงก่อนใช้ปิดงบ'
    ].join('\r\n')
  });
  return files;
}

/** File name used for an expense's receipt image inside the pack */
export function receiptFileName(e: Pick<Expense, 'id' | 'date' | 'title' | 'receiptImage' | 'receiptImageName'>): string {
  const ext = (e.receiptImage || '').startsWith('data:application/pdf') ? 'pdf' : (e.receiptImage || '').startsWith('data:image/png') ? 'png' : 'jpg';
  const safe = (e.title || 'ใบเสร็จ').replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'ใบเสร็จ';
  return `${e.date}_${safe}_${e.id.slice(-6)}.${ext}`;
}
