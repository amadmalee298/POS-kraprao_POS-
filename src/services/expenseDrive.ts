import type { Expense, SystemSettings } from '../types';
import { blobToBase64, htmlToPdfBlob } from '../utils/htmlToPdf';
import { documentHtml, type Party } from '../utils/staffDocs';
import { expenseDocName, expenseDocPages, expenseDriveFolder } from '../utils/substituteReceipt';
import { saveFileToDrive } from './sheetsScript';

/**
 * An expense's documents into the shop's Google Drive (through the shop's Apps Script):
 * one PDF with the ใบรับรองแทนใบเสร็จรับเงิน (when the expense has one) and the payment proof,
 * plus the proof itself when it is a PDF. Saved in ครัวกะเพรา POS เอกสาร/รายจ่าย/<ปี-เดือน>.
 */

/** The script is set up and the shop turned on saving documents to Drive */
export const driveEnabled = (settings: Partial<SystemSettings>) => !!(settings.sheetsScript?.url && settings.sheetsScript?.secret && settings.sheetsScript?.saveDocsToDrive);

/** Has something to save */
export const hasExpenseDocs = (e: Pick<Expense, 'substituteReceipt' | 'receiptImage' | 'purchaseImages'>) =>
  !!e.substituteReceipt || !!e.receiptImage?.startsWith('data:') || !!e.purchaseImages?.length;

export async function saveExpenseToDrive(e: Expense, shop: Party & { phone?: string }, settings: Partial<SystemSettings>): Promise<NonNullable<Expense['driveFiles']>> {
  const script = settings.sheetsScript;
  if (!script?.url || !script.secret) throw new Error('ยังไม่ได้เชื่อม Google Sheets (Apps Script)');
  const folder = expenseDriveFolder(e.date);
  const saved: NonNullable<Expense['driveFiles']> = [];
  const upload = async (name: string, mimeType: string, base64: string) => {
    const r = await saveFileToDrive(script.url, script.secret, { folder, name, mimeType, base64 });
    // A script from before Drive support answers without a file link
    if (!r.fileUrl) throw new Error('โค้ด Apps Script ยังเป็นเวอร์ชันเก่า: คัดลอกโค้ดใหม่จากหน้าตั้งค่า Google Sheets แล้วเผยแพร่เวอร์ชันใหม่');
    saved.push({ name, url: r.fileUrl, savedAt: new Date().toISOString() });
  };

  const isPdfProof = !!e.receiptImage?.startsWith('data:application/pdf');
  const pages = expenseDocPages(e, shop);
  if (pages.length) {
    const pdf = await htmlToPdfBlob(documentHtml(e.title, pages));
    await upload(expenseDocName(e, 'pdf'), 'application/pdf', await blobToBase64(pdf));
  }
  if (isPdfProof) {
    await upload(expenseDocName(e, 'pdf').replace(/\.pdf$/, '_หลักฐาน.pdf'), 'application/pdf', e.receiptImage!.split(',')[1] || '');
  }
  return saved;
}
