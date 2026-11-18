import type { Expense } from '../types';
import type { Party } from './staffDocs';
import { thaiBahtText } from './thaiBaht';
import { formatThaiId } from './withholding';
import { driveImageUrl, isDriveRef, isPdfImage } from './imageRef';
import { cleanExpenseItems, itemsTotal } from './expenseItems';

/**
 * ใบรับรองแทนใบเสร็จรับเงิน: when a seller gives no receipt (market stalls, street vendors), the
 * person who paid certifies the expense and the owner approves it, so it can be booked as a
 * business expense. One A4 sheet: the form with the payment slip and the first photo of the bill
 * under it (when they fit); further photos follow on their own pages.
 */

/**
 * A picture a printout can show: the picture itself or its Drive address ('' for anything else,
 * e.g. a PDF or a reference not read). A Drive reference becomes its picture address
 */
export function printableSrc(src: string | undefined | null): string {
  if (!src) return '';
  if (src.startsWith('data:image/') || src.startsWith('https://drive.google.com/')) return src;
  if (isDriveRef(src) && !isPdfImage(src)) return driveImageUrl(src);
  return '';
}

/** The photos of what was bought that a printout can show */
export const printablePhotos = (e: Pick<Expense, 'purchaseImages'>) =>
  (e.purchaseImages || []).map(i => ({ ...i, dataUrl: printableSrc(i.dataUrl) })).filter(i => !!i.dataUrl);

/** Lines a text takes at about `perLine` characters a line */
const lines = (text: string | undefined, perLine: number) => Math.max(1, Math.ceil((text || '').length / perLine));

/**
 * How tall the pictures under the form may be (mm) so the whole sheet stays on one A4 page (277 mm
 * inside the margins), from how many lines its texts take; 0 when too little room is left (the
 * pictures then go on their own pages)
 */
export function attachedPictureHeight(e: Expense, shop: Party & { phone?: string }): number {
  const sr = e.substituteReceipt;
  const detail = `${e.title}${sr?.payee ? ` (ผู้รับเงิน: ${sr.payee})` : ''}`;
  const certify = `ข้าพเจ้า ${sr?.spender || ''} (ผู้เบิกจ่าย) ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของ ${shop.name || 'กิจการ'} โดยแท้ ตั้งแต่วันที่ 00/00/0000 ถึงวันที่ 00/00/0000`;
  const form =
    125 +
    6 * (lines(`ผู้ซื้อ/ผู้รับบริการ: ${shop.name || ''}`, 95) - 1) +
    6 * (lines(`ที่อยู่: ${shop.address || ''}`, 95) - 1) +
    6.5 * (lines(detail, 50) - 1) +
    // Item lines: one row each (and the line above the table), past the single row counted
    (cleanExpenseItems(e.items).length ? 7 * cleanExpenseItems(e.items).length + 6 : 0) +
    6 * Math.max(0, lines(certify, 100) - 2) +
    (sr?.approvedAt ? 5 : 0);
  // The heading, the labels under the pictures and the margins of that part, and a little to spare
  const room = 277 - form - 18 - 6;
  return room < 55 ? 0 : Math.min(105, Math.floor(room));
}

const esc = (s: string | number | undefined | null) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 5 ตุลาคม 2569 */
export const thaiLongDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
/** 05/10/2569 */
const thaiShortDate = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${Number(y) + 543}`;
};

export { nextSubstituteNo } from './expenseDocNo';

/**
 * `attached`: pictures shown under the form on the same page (the slip and the photos of the bill),
 * so one expense prints on one sheet; the form is set tighter then
 */
export function substituteReceiptPage(e: Expense, shop: Party & { phone?: string }, attached: { src: string; label: string }[] = [], pictureHeight = 0): string {
  const tight = attached.length > 0 && pictureHeight > 0;
  const sr = e.substituteReceipt;
  const spender = sr?.spender || '......................................';
  const approver = sr?.approver || '......................................';
  const detail = `${e.title}${sr?.payee ? ` (ผู้รับเงิน: ${sr.payee})` : ''}`;
  return `<div class="page a4">
<h1 class="center" style="font-size:${tight ? 19 : 22}px;margin-top:${tight ? 0 : 6}mm">ใบรับรองแทนใบเสร็จรับเงิน</h1>
${sr?.docNo ? `<div class="right small" style="margin-top:2mm">เลขที่ ${esc(sr.docNo)}</div>` : ''}
<div style="margin-top:${tight ? 2 : 6}mm;font-size:${tight ? 12 : 13}px;line-height:${tight ? 1.55 : 1.9}">
ผู้ซื้อ/ผู้รับบริการ: ${esc(shop.name)}<br>
${shop.taxId ? `เลขประจำตัวผู้เสียภาษี: ${esc(formatThaiId(shop.taxId))}<br>` : ''}
${shop.address ? `ที่อยู่: ${esc(shop.address)}<br>` : ''}
${shop.phone ? `โทร: ${esc(shop.phone)}` : ''}
</div>
<div class="right" style="font-size:13px;margin-top:2mm">วันที่: ${esc(thaiLongDate(e.date))}</div>
${itemsTable(e, detail, tight)}
<p style="font-size:13px;margin-top:${tight ? 3 : 6}mm">รวมทั้งสิ้น (ตัวอักษร) &nbsp;${esc(thaiBahtText(e.amount))}</p>
<p style="font-size:${tight ? 12 : 13}px;line-height:${tight ? 1.6 : 1.8}">ข้าพเจ้า ${esc(sr?.spender || '......................................')} (ผู้เบิกจ่าย)<br>
ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของ ${esc(shop.name || 'กิจการ')} โดยแท้
ตั้งแต่วันที่ ${esc(thaiShortDate(e.date))} ถึงวันที่ ${esc(thaiShortDate(e.date))}</p>
<div class="sig" style="margin-top:${tight ? 5 : 14}mm;font-size:${tight ? 12 : 13}px">
<div>${signatureImg(sr?.spenderSignature)}______________________________<br>(${esc(spender)})<br>ผู้เบิกจ่าย</div>
<div>${signatureImg(sr?.approverSignature)}______________________________<br>(${esc(approver)})<br>ผู้อนุมัติ${sr?.approvedAt ? `<br><span class="small muted">${esc(thaiLongDate(sr.approvedAt))}</span>` : ''}</div>
</div>
${
  tight
    ? `<div style="margin-top:5mm;border-top:1px solid #ccc;padding-top:3mm">
<div class="bold" style="font-size:12px">หลักฐานการชำระเงิน / การซื้อ</div>
<div style="display:flex;gap:4mm;justify-content:center;align-items:flex-start;margin-top:2mm">
${attached
  // No forced width: the picture keeps its own shape within both limits (the PDF maker ignores object-fit)
  .map(a => `<div style="flex:1;min-width:0;text-align:center"><img src="${a.src}" alt="${esc(a.label)}" style="display:block;width:auto;height:auto;max-width:100%;max-height:${pictureHeight}mm;margin:0 auto"><div class="small muted">${esc(a.label)}</div></div>`)
  .join('')}
</div>
</div>`
    : ''
}
</div>`;
}

/**
 * The table of what was paid for: one line per item bought (quantity, unit price, amount) when the
 * expense has them, else the expense as one line. A difference between the lines and the total
 * paid (delivery, rounding) is its own line, so the table always adds up to the amount
 */
function itemsTable(e: Expense, detail: string, tight: boolean): string {
  const items = cleanExpenseItems(e.items);
  const size = tight && items.length > 4 ? 12 : 13;
  if (!items.length) {
    return `<table class="grid" style="margin-top:4mm;font-size:13px">
<tr><th style="width:9%">ลำดับ</th><th>รายละเอียด</th><th style="width:20%">จำนวนเงิน (บาท)</th><th style="width:18%">หมายเหตุ</th></tr>
<tr><td class="center">1</td><td>${esc(detail)}</td><td class="right">${money(e.amount)}</td><td></td></tr>
<tr class="bold"><td colspan="2" class="right">รวมทั้งสิ้น</td><td class="right">${money(e.amount)}</td><td></td></tr>
</table>`;
  }
  const diff = Math.round((e.amount - itemsTotal(items)) * 100) / 100;
  const rows = items.map(
    (i, n) =>
      `<tr><td class="center">${n + 1}</td><td>${esc(i.name)}</td><td class="right">${i.quantity ? `${esc(String(i.quantity))}${i.unit ? ` ${esc(i.unit)}` : ''}` : ''}</td><td class="right">${i.unitPrice ? money(i.unitPrice) : ''}</td><td class="right">${money(i.amount)}</td></tr>`
  );
  if (Math.abs(diff) >= 0.01) rows.push(`<tr><td class="center">${items.length + 1}</td><td>${diff > 0 ? 'อื่น ๆ (ค่าส่ง/ปัดเศษ)' : 'ส่วนลด'}</td><td></td><td></td><td class="right">${money(diff)}</td></tr>`);
  return `<div style="margin-top:3mm;font-size:12px">${esc(detail)}</div>
<table class="grid" style="margin-top:2mm;font-size:${size}px">
<tr><th style="width:8%">ลำดับ</th><th>รายการสินค้า</th><th style="width:14%">จำนวน</th><th style="width:16%">ราคา/หน่วย</th><th style="width:18%">จำนวนเงิน (บาท)</th></tr>
${rows.join('\n')}
<tr class="bold"><td colspan="4" class="right">รวมทั้งสิ้น</td><td class="right">${money(e.amount)}</td></tr>
</table>`;
}

/** A drawn signature sitting on the signature line (an empty box of the same height when unsigned) */
const signatureImg = (dataUrl?: string) =>
  dataUrl?.startsWith('data:image/')
    ? `<img src="${dataUrl}" alt="ลายเซ็น" style="display:block;height:16mm;max-width:60mm;margin:0 auto -3mm;object-fit:contain">`
    : '<div style="height:13mm"></div>';

/** The payment proof (transfer slip / photo of the bill) on its own page */
export function proofPage(e: Pick<Expense, 'title' | 'date' | 'amount' | 'receiptImage'>, heading = 'หลักฐานการชำระเงิน'): string {
  if (!e.receiptImage) return '';
  const isPdf = isPdfImage(e.receiptImage);
  const src = printableSrc(e.receiptImage);
  if (!isPdf && !src) return '';
  return `<div class="page a4">
<h2>${esc(heading)}</h2>
<div class="small muted">${esc(e.title)} · ${esc(thaiLongDate(e.date))} · ${money(e.amount)} บาท</div>
${isPdf ? '<p class="small">(ไฟล์ PDF แนบแยกไว้ในโฟลเดอร์เดียวกัน)</p>' : `<img src="${src}" style="display:block;max-width:100%;max-height:240mm;margin:6mm auto 0;object-fit:contain">`}
</div>`;
}

/**
 * Photos of what was bought, two to a page. `shownBefore`: photos already on an earlier page (the
 * form's sheet), so each page says which of all the photos it holds
 */
export function purchasePhotoPages(e: Pick<Expense, 'title' | 'date' | 'amount' | 'purchaseImages'>, shownBefore = 0): string[] {
  // Pictures, or their Drive address when this device has no copy (printing loads them)
  const all = printablePhotos(e);
  const imgs = all.slice(shownBefore);
  const pages: string[] = [];
  for (let i = 0; i < imgs.length; i += 2) {
    const pair = imgs.slice(i, i + 2);
    const from = shownBefore + i + 1;
    const to = from + pair.length - 1;
    const which = all.length > 1 ? ` (รูปที่ ${from === to ? from : `${from}–${to}`} จาก ${all.length})` : '';
    pages.push(`<div class="page a4">
<h2>หลักฐานการซื้อสินค้า${which}</h2>
<div class="small muted">${esc(e.title)} · ${esc(thaiLongDate(e.date))} · ${money(e.amount)} บาท</div>
${pair.map(p => `<img src="${p.dataUrl}" alt="${esc(p.name)}" style="display:block;max-width:100%;max-height:${pair.length > 1 ? 118 : 240}mm;margin:5mm auto 0;object-fit:contain">`).join('')}
</div>`);
  }
  return pages;
}

/** Every page of an expense's documents: the substitute receipt, payment proof and purchase photos */
export function expenseDocPages(e: Expense, shop: Party & { phone?: string }): string[] {
  if (e.substituteReceipt) {
    // One sheet: the form, then the slip and the first photo of the bill under it when they fit
    const slip = printableSrc(e.receiptImage);
    const photos = printablePhotos(e);
    const height = attachedPictureHeight(e, shop);
    const onSheet = height > 0 ? 2 : 0;
    const slipOnSheet = onSheet > 0 && !!slip;
    const photosOnSheet = Math.min(photos.length, onSheet - (slipOnSheet ? 1 : 0));
    const attached = [
      ...(slipOnSheet ? [{ src: slip, label: 'หลักฐานการชำระเงิน' }] : []),
      ...photos.slice(0, photosOnSheet).map(p => ({ src: p.dataUrl, label: 'หลักฐานการซื้อสินค้า' }))
    ];
    return [
      substituteReceiptPage(e, shop, attached, height),
      // A slip that did not fit on its own page
      !slipOnSheet && slip ? proofPage(e) : '',
      ...purchasePhotoPages(e, photosOnSheet)
    ].filter(Boolean);
  }
  // (A PDF proof is a file of its own next to this document, not a page here)
  return [printableSrc(e.receiptImage) ? proofPage(e, 'ใบเสร็จ / หลักฐานการชำระเงิน') : '', ...purchasePhotoPages(e)].filter(Boolean);
}

/** Drive folder for an expense: รายจ่าย/2569-10 */
export const expenseDriveFolder = (date: string) => `รายจ่าย/${Number(date.slice(0, 4)) + 543}-${date.slice(5, 7)}`;

/** File name for an expense's document in Drive */
export function expenseDocName(e: Pick<Expense, 'id' | 'date' | 'title' | 'substituteReceipt'>, ext: string): string {
  const safe = (e.title || 'รายจ่าย').replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'รายจ่าย';
  const kind = e.substituteReceipt ? 'ใบรับรองแทนใบเสร็จ' : 'หลักฐานรายจ่าย';
  return `${e.date}_${kind}_${safe}_${e.id.slice(-6)}.${ext}`;
}
