import type { Expense } from '../types';
import type { Party } from './staffDocs';
import { thaiBahtText } from './thaiBaht';
import { formatThaiId } from './withholding';

/**
 * ใบรับรองแทนใบเสร็จรับเงิน: when a seller gives no receipt (market stalls, street vendors), the
 * person who paid certifies the expense and the owner approves it, so it can be booked as a
 * business expense. One page per expense, plus a page with the payment proof when there is one.
 */

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
export function substituteReceiptPage(e: Expense, shop: Party & { phone?: string }, attached: { src: string; label: string }[] = []): string {
  const tight = attached.length > 0;
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
<table class="grid" style="margin-top:4mm;font-size:13px">
<tr><th style="width:9%">ลำดับ</th><th>รายละเอียด</th><th style="width:20%">จำนวนเงิน (บาท)</th><th style="width:18%">หมายเหตุ</th></tr>
<tr><td class="center">1</td><td>${esc(detail)}</td><td class="right">${money(e.amount)}</td><td></td></tr>
<tr class="bold"><td colspan="2" class="right">รวมทั้งสิ้น</td><td class="right">${money(e.amount)}</td><td></td></tr>
</table>
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
${attached.map(a => `<div style="flex:1;min-width:0;text-align:center"><img src="${a.src}" alt="${esc(a.label)}" style="display:block;width:100%;max-height:${attached.length > 1 ? 112 : 110}mm;object-fit:contain;margin:0 auto"><div class="small muted">${esc(a.label)}</div></div>`).join('')}
</div>
</div>`
    : ''
}
</div>`;
}

/** A drawn signature sitting on the signature line (an empty box of the same height when unsigned) */
const signatureImg = (dataUrl?: string) =>
  dataUrl?.startsWith('data:image/')
    ? `<img src="${dataUrl}" alt="ลายเซ็น" style="display:block;height:16mm;max-width:60mm;margin:0 auto -3mm;object-fit:contain">`
    : '<div style="height:13mm"></div>';

/** The payment proof (transfer slip / photo of the bill) on its own page */
export function proofPage(e: Pick<Expense, 'title' | 'date' | 'amount' | 'receiptImage'>, heading = 'หลักฐานการชำระเงิน'): string {
  if (!e.receiptImage) return '';
  const isPdf = e.receiptImage.startsWith('data:application/pdf');
  return `<div class="page a4">
<h2>${esc(heading)}</h2>
<div class="small muted">${esc(e.title)} · ${esc(thaiLongDate(e.date))} · ${money(e.amount)} บาท</div>
${isPdf ? '<p class="small">(ไฟล์ PDF แนบแยกไว้ในโฟลเดอร์เดียวกัน)</p>' : `<img src="${e.receiptImage}" style="display:block;max-width:100%;max-height:240mm;margin:6mm auto 0;object-fit:contain">`}
</div>`;
}

/** Photos of what was bought, two to a page */
export function purchasePhotoPages(e: Pick<Expense, 'title' | 'date' | 'amount' | 'purchaseImages'>): string[] {
  // Pictures, or their Drive address when this device has no copy (printing loads them)
  const imgs = (e.purchaseImages || []).filter(i => i.dataUrl?.startsWith('data:image/') || i.dataUrl?.startsWith('https://drive.google.com/'));
  const pages: string[] = [];
  for (let i = 0; i < imgs.length; i += 2) {
    const pair = imgs.slice(i, i + 2);
    pages.push(`<div class="page a4">
<h2>หลักฐานการซื้อสินค้า${imgs.length > 2 ? ` (${i / 2 + 1}/${Math.ceil(imgs.length / 2)})` : ''}</h2>
<div class="small muted">${esc(e.title)} · ${esc(thaiLongDate(e.date))} · ${money(e.amount)} บาท</div>
${pair.map(p => `<img src="${p.dataUrl}" alt="${esc(p.name)}" style="display:block;max-width:100%;max-height:${pair.length > 1 ? 118 : 240}mm;margin:5mm auto 0;object-fit:contain">`).join('')}
</div>`);
  }
  return pages;
}

/** Every page of an expense's documents: the substitute receipt, payment proof and purchase photos */
export function expenseDocPages(e: Expense, shop: Party & { phone?: string }): string[] {
  const isPdfProof = !!e.receiptImage?.startsWith('data:application/pdf');
  if (e.substituteReceipt) {
    // One sheet: the form, then the slip and the first photo of the bill under it (more photos follow, two to a page)
    const photos = (e.purchaseImages || []).filter(i => i.dataUrl?.startsWith('data:image/') || i.dataUrl?.startsWith('https://drive.google.com/'));
    const attached = [
      ...(e.receiptImage && !isPdfProof ? [{ src: e.receiptImage, label: 'หลักฐานการชำระเงิน' }] : []),
      ...photos.map(p => ({ src: p.dataUrl, label: 'หลักฐานการซื้อสินค้า' }))
    ].slice(0, 2);
    const usedPhotos = attached.filter(a => a.label === 'หลักฐานการซื้อสินค้า').length;
    return [substituteReceiptPage(e, shop, attached), ...purchasePhotoPages({ ...e, purchaseImages: photos.slice(usedPhotos) })].filter(Boolean);
  }
  return [
    e.substituteReceipt ? substituteReceiptPage(e, shop) : '',
    e.receiptImage && !isPdfProof ? proofPage(e, e.substituteReceipt ? 'หลักฐานการชำระเงิน' : 'ใบเสร็จ / หลักฐานการชำระเงิน') : '',
    ...purchasePhotoPages(e)
  ].filter(Boolean);
}

/** Drive folder for an expense: รายจ่าย/2569-10 */
export const expenseDriveFolder = (date: string) => `รายจ่าย/${Number(date.slice(0, 4)) + 543}-${date.slice(5, 7)}`;

/** File name for an expense's document in Drive */
export function expenseDocName(e: Pick<Expense, 'id' | 'date' | 'title' | 'substituteReceipt'>, ext: string): string {
  const safe = (e.title || 'รายจ่าย').replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'รายจ่าย';
  const kind = e.substituteReceipt ? 'ใบรับรองแทนใบเสร็จ' : 'หลักฐานรายจ่าย';
  return `${e.date}_${kind}_${safe}_${e.id.slice(-6)}.${ext}`;
}
