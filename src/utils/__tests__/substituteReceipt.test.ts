import { afterEach, describe, expect, it, vi } from 'vitest';
import { expenseDocName, expenseDriveFolder, nextSubstituteNo, proofPage, substituteReceiptPage } from '../substituteReceipt';
import { appsScriptCode, SCRIPT_VERSION } from '../../services/sheetsScript';
import type { Expense } from '../../types';

vi.mock('../htmlToPdf', () => ({
  htmlToPdfBlob: vi.fn(async () => new Blob(['%PDF'])),
  blobToBase64: vi.fn(async () => 'JVBERg==')
}));

const exp = (over: Partial<Expense> = {}): Expense => ({
  id: 'exp-1760000000123',
  branchId: 'b1',
  date: '2026-10-05',
  category: 'raw_material',
  title: 'ค่า ร้านถุงเงิน (ตำป่ากาฬสินธุ์)',
  amount: 135,
  includeVat: false,
  vatAmount: 0,
  netAmount: 135,
  substituteReceipt: { docNo: '2569/10-001', spender: 'อาห์มัด มะหลี', approver: 'อาห์มัด มะหลี' },
  ...over
});
const shop = { name: 'บริษัท เรื่องครัวครัว จำกัด (สำนักงานใหญ่)', taxId: '1900601151801', address: '', phone: '0973399666' };

describe('ใบรับรองแทนใบเสร็จรับเงิน', () => {
  it('has the shop, the item, the total in words and both signatures', () => {
    const html = substituteReceiptPage(exp(), shop);
    expect(html).toContain('ใบรับรองแทนใบเสร็จรับเงิน');
    expect(html).toContain('บริษัท เรื่องครัวครัว จำกัด');
    expect(html).toContain('1-9006-01151-80-1');
    expect(html).toContain('5 ตุลาคม 2569');
    expect(html).toContain('135.00');
    expect(html).toContain('หนึ่งร้อยสามสิบห้าบาทถ้วน');
    expect(html).toContain('ตั้งแต่วันที่ 05/10/2569 ถึงวันที่ 05/10/2569');
    expect(html).toContain('ผู้เบิกจ่าย');
    expect(html).toContain('ผู้อนุมัติ');
  });

  it('shows drawn signatures above the lines and the approval date', () => {
    const sig = 'data:image/png;base64,iVBORw0KGgo=';
    const signed = substituteReceiptPage(exp({ substituteReceipt: { docNo: '2569/10-001', spender: 'อาห์มัด', approver: 'เจ้าของ', spenderSignature: sig, approverSignature: sig, approvedAt: '2026-10-06' } }), shop);
    expect(signed.match(/alt="ลายเซ็น"/g)).toHaveLength(2);
    expect(signed).toContain('6 ตุลาคม 2569');
    // Unsigned: blank space kept so the paper can be signed by hand
    expect(substituteReceiptPage(exp(), shop)).not.toContain('alt="ลายเซ็น"');
    expect(substituteReceiptPage(exp({ substituteReceipt: { docNo: 'x', spender: 'a', spenderSignature: 'javascript:alert(1)' } }), shop)).not.toContain('javascript:');
  });

  it('numbers documents per month', () => {
    const list = [exp(), exp({ substituteReceipt: { docNo: '2569/10-007', spender: '' } }), exp({ date: '2026-09-30', substituteReceipt: { docNo: '2569/09-050', spender: '' } })];
    expect(nextSubstituteNo(list, '2026-10-20')).toBe('2569/10-008');
    expect(nextSubstituteNo(list, '2026-11-01')).toBe('2569/11-001');
  });

  it('adds the payment proof page only when there is a picture', () => {
    expect(proofPage(exp())).toBe('');
    expect(proofPage(exp({ receiptImage: 'data:image/jpeg;base64,AAA' }))).toContain('<img');
  });

  it('names the Drive folder and file', () => {
    expect(expenseDriveFolder('2026-10-05')).toBe('รายจ่าย/2569-10');
    expect(expenseDocName(exp(), 'pdf')).toBe('2026-10-05_ใบรับรองแทนใบเสร็จ_ค่า ร้านถุงเงิน (ตำป่ากาฬสินธุ์)_000123.pdf');
  });
});

describe('Apps Script with Google Drive', () => {
  it('can save files and reports its version', () => {
    const code = appsScriptCode('abc');
    expect(code).toContain(`const VERSION = ${SCRIPT_VERSION};`);
    expect(code).toContain('if (data.file) return saveFile(data.file);');
    expect(code).toContain('DriveApp.getRootFolder()');
  });
});

describe('saving an expense to Drive', () => {
  afterEach(() => vi.unstubAllGlobals());
  const settings = { sheetsScript: { url: 'https://script.google.com/macros/s/abc/exec', secret: 's', saveDocsToDrive: true } };

  it('uploads one PDF into the month folder and returns its link', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, version: 2, fileUrl: 'https://drive.google.com/file/d/x', fileId: 'x' }));
    }));
    const { saveExpenseToDrive } = await import('../../services/expenseDrive');
    const files = await saveExpenseToDrive(exp({ receiptImage: 'data:image/jpeg;base64,AAA' }), shop, settings);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toMatchObject({ folder: 'รายจ่าย/2569-10', mimeType: 'application/pdf', base64: 'JVBERg==' });
    expect(files[0].url).toBe('https://drive.google.com/file/d/x');
  });

  it('asks to update an old script that cannot save files', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rows: 0 }))));
    const { saveExpenseToDrive } = await import('../../services/expenseDrive');
    await expect(saveExpenseToDrive(exp(), shop, settings)).rejects.toThrow('เวอร์ชันเก่า');
  });
});
