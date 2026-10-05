import type { PayrollAdjustment, StaffMember } from '../types';
import type { MonthlyPay } from './payroll';
import { thaiBahtText } from './thaiBaht';
import { formatThaiId, WHT_FORM_LABEL, WHT_TABLE_ROWS, WhtForm } from './withholding';

/** Printable documents for staff and suppliers: payslips and withholding tax certificates (50 ทวิ). */

export interface Party {
  name: string;
  taxId: string;
  address: string;
}

const esc = (s: string | number | undefined | null) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 15/09/2569 */
export const thaiDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
};
export const thaiMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'Sarabun','Noto Sans Thai',Tahoma,sans-serif;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;min-height:148mm;padding:12mm 14mm;margin:0 auto;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.a4{min-height:297mm;padding:10mm 12mm}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:0}
.muted{color:#555}.small{font-size:11px}.right{text-align:right}.center{text-align:center}.bold{font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{padding:5px 7px 7px;vertical-align:middle;line-height:1.5}
.grid th,.grid td{border:1px solid #333}
.grid th{background:#f1f1f1}
.box{border:1px solid #333;border-radius:4px;padding:6px 8px;margin-top:6px;font-size:12.5px}
.cb{display:inline-block;width:12px;height:12px;border:1px solid #111;margin:0 4px -2px 10px;text-align:center;line-height:10px;font-size:11px}
.sig{display:flex;justify-content:space-around;margin-top:22px;font-size:12px;text-align:center}
.sig div{width:45%}
@media screen{body{background:#e5e7eb}.page{background:#fff;margin:12px auto;box-shadow:0 1px 6px rgba(0,0,0,.2)}}
@media print{@page{margin:0}body{background:#fff}}
`;

/** Wrap pages in a printable HTML document */
export function documentHtml(title: string, pages: string[]): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style></head><body>${pages.join('')}</body></html>`;
}

/** Open the document in a new window and print it (returns false when pop-ups are blocked) */
export function printDocument(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html.replace('</body>', '<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body>'));
  w.document.close();
  return true;
}

// ---------- Payslip ----------

export interface PayslipInput {
  shop: Party & { phone?: string };
  month: string; // YYYY-MM
  pay: MonthlyPay;
  staff?: StaffMember;
  adjustments: PayrollAdjustment[];
  /** Totals from January up to this month */
  ytd?: { gross: number; tax: number; sso: number };
  payDate?: string; // YYYY-MM-DD
}

const PAY_TYPE_TH = { hourly: 'รายชั่วโมง', daily: 'รายวัน', monthly: 'รายเดือน' } as const;

/** One payslip page (A5 landscape-sized half sheet) */
export function payslipPage(i: PayslipInput): string {
  const { pay: p, staff: s } = i;
  const mine = i.adjustments.filter(a => a.staffId === p.staffId && a.month === i.month);
  const earnings: [string, number][] = [
    [p.payType === 'monthly' ? 'เงินเดือน' : `ค่าจ้าง (${p.payType === 'daily' ? `${p.daysWorked} วัน` : `${p.otHours ? p.regularHours : p.hours} ชม.`})`, p.basePay],
    ...(p.otPay > 0 ? ([[`ค่าล่วงเวลา (OT ${p.otHours} ชม.)`, p.otPay]] as [string, number][]) : []),
    ...mine.filter(a => a.kind === 'bonus').map(a => [a.note || 'เงินเพิ่ม', a.amount] as [string, number])
  ];
  const deductions: [string, number][] = [
    ...(p.sso > 0 ? ([['เงินสมทบประกันสังคม', p.sso]] as [string, number][]) : []),
    ...(p.tax > 0 ? ([['ภาษีเงินได้หัก ณ ที่จ่าย', p.tax]] as [string, number][]) : []),
    ...mine.filter(a => a.kind === 'deduction').map(a => [a.note || 'รายการหัก', a.amount] as [string, number])
  ];
  const totalDeduct = deductions.reduce((t, [, v]) => t + v, 0);
  const lines = Math.max(earnings.length, deductions.length, 3);
  const rows = Array.from({ length: lines }, (_, k) => {
    const e = earnings[k];
    const d = deductions[k];
    return `<tr><td>${e ? esc(e[0]) : ''}</td><td class="right">${e ? money(e[1]) : ''}</td><td>${d ? esc(d[0]) : ''}</td><td class="right">${d ? money(d[1]) : ''}</td></tr>`;
  }).join('');

  return `<div class="page">
<table><tr><td><h1>${esc(i.shop.name)}</h1><div class="small muted">${esc(i.shop.address)}${i.shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${esc(formatThaiId(i.shop.taxId))}` : ''}${i.shop.phone ? ` · โทร ${esc(i.shop.phone)}` : ''}</div></td>
<td class="right" style="white-space:nowrap"><h2>สลิปเงินเดือน</h2><div class="small muted">PAY SLIP · ${esc(thaiMonth(i.month))}</div></td></tr></table>
<div class="box"><table>
<tr><td><b>ชื่อ-สกุล</b> ${esc(p.name)}</td><td><b>ตำแหน่ง</b> ${esc(p.role)}</td><td class="right"><b>งวด</b> ${esc(thaiMonth(i.month))}</td></tr>
<tr><td><b>เลขประจำตัว</b> ${esc(s?.taxId ? formatThaiId(s.taxId) : '-')}</td><td><b>ประเภท</b> ${esc(PAY_TYPE_TH[p.payType])} (${esc(p.rateText)})</td><td class="right"><b>วันที่จ่าย</b> ${esc(i.payDate ? thaiDate(i.payDate) : '-')}</td></tr>
${s?.bankAccount ? `<tr><td colspan="3"><b>โอนเข้าบัญชี</b> ${esc(s.bankAccount)}</td></tr>` : ''}
</table></div>
<table class="grid" style="margin-top:8px">
<tr><th style="width:32%">รายได้</th><th style="width:18%" class="right">จำนวนเงิน</th><th style="width:32%">รายการหัก</th><th style="width:18%" class="right">จำนวนเงิน</th></tr>
${rows}
<tr class="bold"><td>รวมรายได้</td><td class="right">${money(p.gross)}</td><td>รวมรายการหัก</td><td class="right">${money(totalDeduct)}</td></tr>
<tr class="bold"><td colspan="2">เงินได้สุทธิ <span class="small muted">(${esc(thaiBahtText(p.net))})</span></td><td colspan="2" class="right" style="font-size:15px">${money(p.net)} บาท</td></tr>
</table>
<table class="small" style="margin-top:6px"><tr>
<td>ทำงาน ${p.daysWorked} วัน · ${p.hours} ชม.${p.otHours ? ` · OT ${p.otHours} ชม.` : ''} · สาย ${p.lateCount} ครั้ง (${p.lateMinutes} นาที) · ขาด ${p.absentCount} วัน</td>
${i.ytd ? `<td class="right">สะสมทั้งปี: เงินได้ ${money(i.ytd.gross)} · ภาษี ${money(i.ytd.tax)} · ประกันสังคม ${money(i.ytd.sso)}</td>` : ''}
</tr></table>
<div class="sig"><div>ลงชื่อ ...................................... ผู้จ่ายเงิน<br>(......................................)</div><div>ลงชื่อ ...................................... ผู้รับเงิน<br>(${esc(p.name)})</div></div>
</div>`;
}

// ---------- Withholding tax certificate (50 ทวิ) ----------

export interface WhtLine {
  row: 1 | 2 | 3 | 4 | 5 | 6;
  /** What was paid (written in for rows 5 and 6, e.g. ค่าเช่า) */
  detail?: string;
  /** Date paid, or the period (e.g. "ปี 2569") */
  date: string;
  amount: number;
  tax: number;
}

export interface WhtCertificate {
  id: string;
  bookNo: string; // เล่มที่
  docNo: string; // เลขที่
  payer: Party;
  payee: Party;
  form: WhtForm;
  /** Order in the return's attachment (ลำดับที่ในแบบ) */
  seq?: number;
  lines: WhtLine[];
  sso?: number;
  providentFund?: number;
  /** หัก ณ ที่จ่าย / ออกให้ตลอดไป / ออกให้ครั้งเดียว */
  mode: 'withhold' | 'always' | 'once';
  issueDate: string; // YYYY-MM-DD
  /** Staff certificate for a whole year */
  staffId?: string;
  year?: number; // Gregorian
  createdAt?: string;
  createdBy?: string;
}

const cb = (on: boolean) => `<span class="cb">${on ? '✓' : ''}</span>`;
const idBoxes = (id: string) => {
  const d = (id || '').replace(/\D/g, '');
  return d.length === 13 ? formatThaiId(d) : esc(id || '-');
};

/** One copy of the certificate (copy 1: for the payee's tax return; copy 2: payee's record) */
export function whtPage(c: WhtCertificate, copy: 1 | 2): string {
  const totalAmount = c.lines.reduce((t, l) => t + (l.amount || 0), 0);
  const totalTax = c.lines.reduce((t, l) => t + (l.tax || 0), 0);
  const body = WHT_TABLE_ROWS.map(r => {
    const ls = c.lines.filter(l => l.row === r.row);
    if (ls.length === 0) return `<tr><td>${esc(r.label)}</td><td></td><td></td><td></td></tr>`;
    return ls
      .map(
        (l, k) =>
          `<tr><td>${k === 0 ? esc(r.label) : ''}${l.detail ? `<div style="padding-left:14px">${esc(l.detail)}</div>` : ''}</td><td class="center">${esc(l.date)}</td><td class="right">${money(l.amount)}</td><td class="right">${money(l.tax)}</td></tr>`
      )
      .join('');
  }).join('');
  const forms = (Object.keys(WHT_FORM_LABEL) as WhtForm[]).map(f => `${cb(c.form === f)}(${c.seq && c.form === f ? c.seq : '&nbsp;&nbsp;'}) ${WHT_FORM_LABEL[f]}`).join(' ');
  return `<div class="page a4">
<div class="small">ฉบับที่ ${copy} (${copy === 1 ? 'สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี' : 'สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน'})</div>
<table style="margin-top:4px"><tr><td class="center"><h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1><div class="small">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div></td>
<td class="right small" style="width:28%;white-space:nowrap">เล่มที่ ${esc(c.bookNo)}<br>เลขที่ ${esc(c.docNo)}</td></tr></table>
<div class="box"><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b><table>
<tr><td>ชื่อ ${esc(c.payer.name)}</td><td class="right">เลขประจำตัวผู้เสียภาษีอากร ${idBoxes(c.payer.taxId)}</td></tr>
<tr><td colspan="2">ที่อยู่ ${esc(c.payer.address || '-')}</td></tr></table></div>
<div class="box"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b><table>
<tr><td>ชื่อ ${esc(c.payee.name)}</td><td class="right">เลขประจำตัวผู้เสียภาษีอากร ${idBoxes(c.payee.taxId)}</td></tr>
<tr><td colspan="2">ที่อยู่ ${esc(c.payee.address || '-')}</td></tr></table>
<div class="small" style="margin-top:4px">ลำดับที่ในแบบ ${forms}</div></div>
<table class="grid" style="margin-top:8px">
<tr><th>ประเภทเงินได้พึงประเมินที่จ่าย</th><th style="width:16%">วัน เดือน หรือปีภาษี ที่จ่าย</th><th style="width:17%">จำนวนเงินที่จ่าย</th><th style="width:17%">ภาษีที่หัก และนำส่งไว้</th></tr>
${body}
<tr class="bold"><td colspan="2" class="right">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td><td class="right">${money(totalAmount)}</td><td class="right">${money(totalTax)}</td></tr>
<tr><td colspan="4"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b> ${esc(thaiBahtText(totalTax))}</td></tr>
</table>
<div class="box">เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ${money(0)} บาท · กองทุนประกันสังคม ${money(c.sso || 0)} บาท · กองทุนสำรองเลี้ยงชีพ ${money(c.providentFund || 0)} บาท</div>
<div class="box">ผู้จ่ายเงิน ${cb(c.mode === 'withhold')}(1) หัก ณ ที่จ่าย ${cb(c.mode === 'always')}(2) ออกให้ตลอดไป ${cb(c.mode === 'once')}(3) ออกให้ครั้งเดียว ${cb(false)}(4) อื่น ๆ</div>
<div class="box" style="display:flex;justify-content:space-between;gap:12px">
<div class="small" style="width:48%"><b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
<div class="center" style="width:50%;font-size:12px">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ<br><br>ลงชื่อ ...................................... ผู้จ่ายเงิน<br>${esc(thaiDate(c.issueDate))}<br><span class="small muted">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</span></div>
</div>
</div>`;
}

/** Both copies of a certificate, ready to print */
export const whtPages = (c: WhtCertificate) => [whtPage(c, 1), whtPage(c, 2)];
