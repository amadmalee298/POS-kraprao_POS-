import { describe, expect, it } from 'vitest';
import { matchPayIn, parsePayInAmount, payInSource, payInTaken, PAYIN_HOLD_MS } from '../payIn';
import { checkSlip, toSlipData } from '../slipCheck';

describe('money received notices', () => {
  it('reads the amount of bank notifications', () => {
    expect(parsePayInAmount('รับเงิน 1,250.00 บาท จาก นาย ก')).toBe(1250);
    expect(parsePayInAmount('Merchant Pro: ได้รับเงิน ฿60 ผ่าน QR')).toBe(60);
    expect(parsePayInAmount('You have received THB 60.50 via PromptPay')).toBe(60.5);
    expect(parsePayInAmount('เงินเข้า 85 บาท')).toBe(85);
    expect(parsePayInAmount('ยอดคงเหลือ: -')).toBeNull();
  });

  it('takes the money-in amount, not the balance or a fee', () => {
    expect(parsePayInAmount('ยอดคงเหลือ 5,000.00 บาท รับเงิน 60.00 บาท')).toBe(60);
    expect(parsePayInAmount('THB 5,000.00 คงเหลือ / รับเงิน 85 บาท')).toBe(85);
    expect(parsePayInAmount('ค่าธรรมเนียม 0.00 บาท ได้รับ 120 บาท')).toBe(120);
    expect(parsePayInAmount('Balance THB 9,999.00, received THB 45.00')).toBe(45);
    expect(parsePayInAmount('เงินเข้าบัญชี 60 บาท ยอดเงินคงเหลือ 1,060 บาท')).toBe(60);
  });

  it("skips notices held by another till until the hold lapses, and final claims always", () => {
    const now = Date.parse('2026-11-18T12:10:00Z');
    const held = { id: 'h', amount: 60, at: '2026-11-18T12:05:00Z', text: '', verified: true, claimedBy: 'hold:other', reservedAt: '2026-11-18T12:06:00Z' };
    expect(payInTaken(held, now)).toBe(true);
    expect(payInTaken(held, now, 'other')).toBe(false);
    expect(payInTaken(held, Date.parse(held.reservedAt) + PAYIN_HOLD_MS + 1)).toBe(false);
    expect(payInTaken({ ...held, claimedBy: 'A-0012' }, now + PAYIN_HOLD_MS * 10)).toBe(true);
    const since = Date.parse('2026-11-18T12:00:00Z');
    expect(matchPayIn([held], 60, since, new Set(), { now })).toBeNull();
    expect(matchPayIn([held], 60, since, new Set(), { now, mine: 'other' })?.id).toBe('h');
  });

  it('does not take a notice from well before the bill', () => {
    const since = Date.parse('2026-11-18T12:00:00Z');
    const early = { id: 'e', amount: 60, at: '2026-11-18T11:59:30Z', text: '', verified: true };
    expect(matchPayIn([early], 60, since)).toBeNull();
    expect(matchPayIn([{ ...early, at: '2026-11-18T11:59:50Z' }], 60, since)?.id).toBe('e');
  });

  it('matches the earliest unclaimed notice of the same amount after the bill started waiting', () => {
    const t0 = Date.parse('2026-11-18T10:00:00Z');
    const n = (id: string, amount: number, min: number, claimedBy?: string) => ({ id, amount, at: new Date(t0 + min * 60_000).toISOString(), text: '', verified: true, claimedBy });
    const list = [n('old', 60, -10), n('taken', 60, 1, 'KAP-1'), n('a', 60, 2), n('b', 60, 3), n('other', 70, 2)];
    expect(matchPayIn(list, 60, t0)?.id).toBe('a');
    expect(matchPayIn(list, 60, t0, new Set(['a']))?.id).toBe('b');
    expect(matchPayIn(list, 65, t0)).toBeNull();
  });

  it('never takes a notice that was not verified as the bank app as paid', () => {
    const t0 = Date.parse('2026-11-18T10:00:00Z');
    const fake = { id: 'f', amount: 60, at: new Date(t0 + 60_000).toISOString(), text: 'รับเงิน 60 บาท', verified: false };
    expect(matchPayIn([fake], 60, t0)).toBeNull();
    expect(matchPayIn([{ ...fake, verified: undefined }], 60, t0)).toBeNull();
    expect(payInSource('Merchant Pro')).toBe('bank');
    expect(payInSource('บัวหลวง')).toBe('bank');
    expect(payInSource('LINE')).toBe('other');
    expect(payInSource('')).toBe('unknown');
    expect(payInSource('[notification_app_name]')).toBe('unknown');
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
