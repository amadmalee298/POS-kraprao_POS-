import { FILINGS, FilingItem, filingDate, type AttachmentTable, type Pp30Figures } from './govFilings';
import type { Party } from './staffDocs';
import { thaiBahtText } from './thaiBaht';
import { formatThaiId } from './withholding';

/** A printable preparation sheet for one filing (figures to type into the agency's form, plus the attachment list). */

const esc = (s: string | number | undefined | null) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function filingSheetPage(
  item: FilingItem,
  shop: Party,
  data: { pp30?: Pp30Figures; table?: AttachmentTable }
): string {
  const def = FILINGS[item.code];
  const summary: [string, string][] = [];
  if (data.pp30) {
    const f = data.pp30;
    summary.push(
      ['1. ยอดขายที่ต้องเสียภาษี (ก่อน VAT)', money(f.salesBase)],
      ['2. ภาษีขาย', money(f.outputVat)],
      ['3. ยอดซื้อที่มีสิทธินำภาษีซื้อมาหัก (ก่อน VAT)', money(f.purchaseBase)],
      ['4. ภาษีซื้อ', money(f.inputVat)],
      [f.payable >= 0 ? '5. ภาษีที่ต้องชำระ (2 − 4)' : '5. ภาษีที่ชำระเกิน (4 − 2)', money(Math.abs(f.payable))]
    );
  }
  const t = data.table;
  if (t) {
    if (item.code === 'sso') {
      summary.push(
        ['จำนวนผู้ประกันตน', `${t.totals.count} คน`],
        ['ค่าจ้างที่ใช้คำนวณเงินสมทบรวม', money(t.totals.amount)],
        ['เงินสมทบส่วนผู้ประกันตน', money(t.totals.extra?.employee || 0)],
        ['เงินสมทบส่วนนายจ้าง', money(t.totals.extra?.employer || 0)],
        ['รวมเงินสมทบที่ต้องนำส่ง', money(t.totals.extra?.total || 0)]
      );
    } else {
      summary.push(
        [item.code === 'pnd3' || item.code === 'pnd53' ? 'จำนวนหนังสือรับรอง (ราย)' : 'จำนวนราย', `${t.totals.count}`],
        ['รวมเงินได้ที่จ่าย', money(t.totals.amount)],
        ['รวมภาษีที่หักนำส่ง', money(t.totals.tax)]
      );
    }
  }
  const payable = data.pp30 ? Math.max(0, data.pp30.payable) : item.code === 'sso' ? t?.totals.extra?.total || 0 : t?.totals.tax || 0;
  const table = t && t.rows.length
    ? `<table class="grid" style="margin-top:10px;font-size:11px"><tr>${t.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${t.rows
        .map(r => `<tr>${r.map((c, i) => `<td class="${typeof c === 'number' && i > 0 ? 'right' : ''}">${esc(typeof c === 'number' && i > 0 && !Number.isInteger(c) ? money(c) : typeof c === 'string' && /^\d{13}$/.test(c) ? formatThaiId(c) : c)}</td>`).join('')}</tr>`)
        .join('')}</table>`
    : '';
  return `<div class="page a4">
<table><tr><td><h1>ใบเตรียมยื่น ${esc(def.name)}</h1><div class="small muted">${esc(def.title)} · ${esc(def.agency)}</div></td>
<td class="right small">งวด <b>${esc(item.periodLabel)}</b><br>ยื่นภายใน <b>${esc(filingDate(item.dueDate))}</b>${item.paperDueDate ? `<br>(แบบกระดาษ ${esc(filingDate(item.paperDueDate))})` : ''}</td></tr></table>
<div class="box"><b>${esc(shop.name)}</b> · เลขประจำตัวผู้เสียภาษี ${esc(shop.taxId ? formatThaiId(shop.taxId) : '-')}<br><span class="small">${esc(shop.address || '')}</span></div>
${summary.length ? `<table class="grid" style="margin-top:10px">${summary.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="right bold" style="width:30%">${esc(v)}</td></tr>`).join('')}</table>` : ''}
${payable > 0 ? `<div class="box bold">ยอดที่ต้องชำระ ${money(payable)} บาท <span class="small muted">(${esc(thaiBahtText(payable))})</span></div>` : ''}
${t?.missingId.length ? `<div class="box small">⚠ ยังไม่มีเลขประจำตัว 13 หลักที่ถูกต้อง: ${esc(t.missingId.join(', '))}</div>` : ''}
${table}
<p class="small muted" style="margin-top:12px">${esc(item.needNote)}<br>เอกสารนี้เตรียมข้อมูลจากระบบ POS เพื่อใช้กรอกแบบ ไม่ใช่แบบยื่นทางราชการ · ยื่นได้ที่ ${esc(def.link || def.agency)} · ตรวจสอบตัวเลขกับนักบัญชีก่อนยื่น</p>
</div>`;
}
