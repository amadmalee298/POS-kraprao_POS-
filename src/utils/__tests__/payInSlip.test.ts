import { describe, expect, it } from 'vitest';
import { matchPayIn, parsePayInAmount } from '../payIn';
import { checkSlip, toSlipData } from '../slipCheck';

describe('money received notices', () => {
  it('reads the amount of bank notifications', () => {
    expect(parsePayInAmount('รับเงิน 1,250.00 บาท จาก นาย ก')).toBe(1250);
    expect(parsePayInAmount('Merchant Pro: ได้รับเงิน ฿60 ผ่าน QR')).toBe(60);
    expect(parsePayInAmount('You have received THB 60.50 via PromptPay')).toBe(60.5);
    expect(parsePayInAmount('เงินเข้า 85 บาท')).toBe(85);
    expect(parsePayInAmount('ยอดคงเหลือ: -')).toBeNull();
  });

  it('matches the earliest unclaimed notice of the same amount after the bill started waiting', () => {
    const t0 = Date.parse('2026-11-18T10:00:00Z');
    const n = (id: string, amount: number, min: number, claimedBy?: string) => ({ id, amount, at: new Date(t0 + min * 60_000).toISOString(), text: '', claimedBy });
    const list = [n('old', 60, -10), n('taken', 60, 1, 'KAP-1'), n('a', 60, 2), n('b', 60, 3), n('other', 70, 2)];
    expect(matchPayIn(list, 60, t0)?.id).toBe('a');
    expect(matchPayIn(list, 60, t0, new Set(['a']))?.id).toBe('b');
    expect(matchPayIn(list, 65, t0)).toBeNull();
  });
});

describe('transfer slip checks', () => {
  const shop = { names: ['ครัวกะเพรา', 'อาห์มัด มะหลี'], numbers: ['0973399666'] };
  const slip = (over: any = {}) => toSlipData({ isSlip: true, amount: 60, date: '2026-11-18', time: '12:01', senderName: 'นาย ข', receiverName: 'นาย อาห์มัด มะหลี', receiverAccount: 'xxx-xxx-9666', transRef: 'ABC123', bank: 'KBank', ...over });

  it('passes a slip for this bill', () => {
    const v = checkSlip(slip(), { amount: 60, today: '2026-11-18' }, shop, new Set());
    expect(v.ok).toBe(true);
  });

  it('fails a wrong amount, another day, another receiver or a used slip', () => {
    expect(checkSlip(slip({ amount: 50 }), { amount: 60, today: '2026-11-18' }, shop, new Set()).ok).toBe(false);
    expect(checkSlip(slip({ date: '2026-11-17' }), { amount: 60, today: '2026-11-18' }, shop, new Set()).ok).toBe(false);
    expect(checkSlip(slip({ receiverName: 'ร้านอื่น', receiverAccount: 'xxx-1111' }), { amount: 60, today: '2026-11-18' }, shop, new Set()).ok).toBe(false);
    expect(checkSlip(slip(), { amount: 60, today: '2026-11-18' }, shop, new Set(['ABC123'])).ok).toBe(false);
    expect(checkSlip(slip({ isSlip: false }), { amount: 60, today: '2026-11-18' }, shop, new Set()).ok).toBe(false);
  });
});
