import type { Expense, SystemSettings } from '../types';
import { blobToBase64, htmlToPdfBlob } from '../utils/htmlToPdf';
import { documentHtml, type Party } from '../utils/staffDocs';
import { expenseDocName, expenseDocPages, expenseDriveFolder } from '../utils/substituteReceipt';
import { hasImage, imageMime } from '../utils/imageRef';
import { deleteCloudImage, recordImageRefs, resolveRecordImages } from './imageStore';
import { saveFileToDrive } from './sheetsScript';
import { DRIVE_FOLDER_KEY } from './telegramBot';

/**
 * An expense's documents into the shop's Google Drive (through the shop's Apps Script):
 * one PDF with the ใบรับรองแทนใบเสร็จรับเงิน (when the expense has one) and the payment proof,
 * plus the proof itself when it is a PDF. Saved in ครัวกะเพรา POS เอกสาร/รายจ่าย/<ปี-เดือน>.
 */

/** The script is set up and the shop turned on saving documents to Drive */
export const driveEnabled = (settings: Partial<SystemSettings>) => !!(settings.sheetsScript?.url && settings.sheetsScript?.secret && settings.sheetsScript?.saveDocsToDrive);

/** Has something to save */
export const hasExpenseDocs = (e: Pick<Expense, 'substituteReceipt' | 'receiptImage' | 'purchaseImages'>) =>
  !!e.substituteReceipt || hasImage(e.receiptImage) || !!e.purchaseImages?.length;

export async function saveExpenseToDrive(rec: Expense, shop: Party & { phone?: string }, settings: Partial<SystemSettings>): Promise<NonNullable<Expense['driveFiles']>> {
  const script = settings.sheetsScript;
  if (!script?.url || !script.secret) throw new Error('ยังไม่ได้เชื่อม Google Sheets (Apps Script)');
  // The bill pictures themselves (the record holds references to them)
  const e = await resolveRecordImages(rec);
  const folder = expenseDriveFolder(e.date);
  const saved: NonNullable<Expense['driveFiles']> = [];
  const upload = async (name: string, mimeType: string, base64: string) => {
    const r = await saveFileToDrive(script.url, script.secret, { folder, name, mimeType, base64 });
    // A script from before Drive support answers without a file link
    if (!r.fileUrl) throw new Error('โค้ด Apps Script ยังเป็นเวอร์ชันเก่า: คัดลอกโค้ดใหม่จากหน้าตั้งค่า Google Sheets แล้วเผยแพร่เวอร์ชันใหม่');
    saved.push({ name, url: r.fileUrl, savedAt: new Date().toISOString() });
    // Remembered for the Telegram bot's "ขอ link google drive"
    try {
      if (r.folderUrl) localStorage.setItem(DRIVE_FOLDER_KEY, r.folderUrl);
    } catch {
      // storage unavailable
    }
  };

  const isPdfProof = !!e.receiptImage?.startsWith('data:application/pdf');
  const pages = expenseDocPages(e, shop);
  if (pages.length) {
    const pdf = await htmlToPdfBlob(documentHtml(e.title, pages));
    await upload(expenseDocName(e, 'pdf'), 'application/pdf', await blobToBase64(pdf));
  }
  const base = expenseDocName(e, 'pdf').replace(/\.pdf$/, '');
  if (isPdfProof) {
    await upload(`${base}_หลักฐาน.pdf`, 'application/pdf', e.receiptImage!.split(',')[1] || '');
  } else if (e.receiptImage?.startsWith('data:image/')) {
    // The transfer slip / receipt itself, as a picture next to the PDF
    await upload(`${base}_สลิปโอน.${imageExt(e.receiptImage)}`, imageMime(e.receiptImage), e.receiptImage.split(',')[1] || '');
  }
  // Proof of purchase pictures (goods, price boards, the seller's slip)
  for (const [i, img] of (e.purchaseImages || []).entries()) {
    if (!img.dataUrl?.startsWith('data:image/')) continue;
    await upload(`${base}_หลักฐานการซื้อ${i + 1}.${imageExt(img.dataUrl)}`, imageMime(img.dataUrl), img.dataUrl.split(',')[1] || '');
  }
  return saved;
}

const imageExt = (dataUrl: string) => (imageMime(dataUrl) === 'image/png' ? 'png' : imageMime(dataUrl) === 'image/webp' ? 'webp' : 'jpg');

/**
 * The expense's documents are in Drive: its pictures leave the shop's cloud database (this device
 * keeps its copy). Other devices then open them from the Drive links on the expense.
 */
export async function releaseCloudPictures(rec: Expense): Promise<void> {
  await Promise.all(recordImageRefs(rec).map(ref => deleteCloudImage(ref)));
}
