import { describe, expect, it } from 'vitest';
import { isIncomeCaption, pendingId, photoFromUpdate, toPendingData } from '../../services/telegramInbox';

describe('telegram receipt inbox', () => {
  it('takes the largest photo of a message', () => {
    const p = photoFromUpdate({
      update_id: 10,
      message: {
        message_id: 55,
        date: 1790000000,
        chat: { id: -100123, title: 'ร้าน' },
        from: { first_name: 'สมชาย' },
        caption: 'ค่าผัก',
        photo: [
          { file_id: 'small', file_size: 1000, width: 90, height: 90 },
          { file_id: 'big', file_size: 90000, width: 1280, height: 1280 }
        ]
      }
    });
    expect(p).toMatchObject({ chatId: '-100123', messageId: 55, fileId: 'big', senderName: 'สมชาย', caption: 'ค่าผัก' });
    expect(pendingId(p!)).toBe('tg--100123-55');
  });

  it('accepts images sent as files and ignores text', () => {
    expect(photoFromUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, document: { file_id: 'd', mime_type: 'image/jpeg' } } })?.fileId).toBe('d');
    expect(photoFromUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 1 }, document: { file_id: 'p', mime_type: 'application/pdf' } } })).toBeNull();
    expect(photoFromUpdate({ update_id: 3, message: { message_id: 3, chat: { id: 1 }, text: 'hi' } })).toBeNull();
  });

  it('marks money received by the caption', () => {
    expect(isIncomeCaption('รายรับ ค่าจัดเลี้ยง')).toBe(true);
    expect(isIncomeCaption('#รับเงิน')).toBe(true);
    expect(isIncomeCaption('ค่าหมู')).toBe(false);
  });

  it('keeps what the AI read and falls back to the day it was sent', () => {
    const d = toPendingData(
      {
        title: '',
        vendorName: 'ตลาดไท',
        vendorTaxId: '',
        date: '',
        category: 'raw_material',
        amount: 850,
        subtotal: 850,
        discount: 0,
        includeVat: false,
        vatAmount: 0,
        netAmount: 850,
        refNumber: 'B12',
        note: '',
        confidenceScore: 90,
        lineItems: [{ name: 'หมูสับ', amount: 850 }],
        warnings: [],
        verified: true,
        passes: 1
      },
      '2026-09-27'
    );
    expect(d).toMatchObject({ title: 'ซื้อจาก ตลาดไท', date: '2026-09-27', category: 'raw_material', amount: 850, refNumber: 'B12' });
    expect(d.note).toContain('หมูสับ 850');
  });
});

describe('telegram form body', () => {
  it('encodes arrays as JSON like the Bot API expects', async () => {
    const { telegramForm } = await import('../../services/telegramInbox');
    const f = telegramForm({ offset: 5, allowed_updates: ['message'], skip: undefined });
    expect(f.get('offset')).toBe('5');
    expect(f.get('allowed_updates')).toBe('["message"]');
    expect(f.has('skip')).toBe(false);
  });
});

describe('caption as the entry name', () => {
  it('drops the income/expense keyword', async () => {
    const { captionTitle } = await import('../../services/telegramInbox');
    expect(captionTitle('รายจ่าย กุ้ง 3กก ปลาหมึก 2กก')).toBe('กุ้ง 3กก ปลาหมึก 2กก');
    expect(captionTitle('#รายรับ: ค่าจัดเลี้ยง')).toBe('ค่าจัดเลี้ยง');
    expect(captionTitle('รายจ่าย')).toBe('');
  });
});
