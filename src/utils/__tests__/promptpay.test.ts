import { describe, expect, it } from 'vitest';
import { crc16, generatePromptPayPayload, isValidPromptPayId } from '../promptpay';

describe('PromptPay', () => {
  it('computes CRC16/CCITT-FALSE', () => {
    // Standard check value for "123456789"
    expect(crc16('123456789')).toBe('29B1');
  });

  it('builds a dynamic mobile payload with amount and valid checksum', () => {
    const payload = generatePromptPayPayload('089-123-4567', 50);
    expect(payload).toContain('01130066891234567');
    expect(payload).toContain('010212');
    expect(payload).toContain('540550.00');
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16(body));
  });

  it('uses tag 02 for a 13-digit tax ID', () => {
    expect(generatePromptPayPayload('0105550000000')).toContain('02130105550000000');
  });

  it('refuses missing, incomplete or placeholder IDs instead of guessing', () => {
    expect(generatePromptPayPayload('', 100)).toBe('');
    expect(generatePromptPayPayload('08123', 100)).toBe('');
    expect(generatePromptPayPayload('0812345678', 100)).toBe('');
    expect(isValidPromptPayId('0891234567')).toBe(true);
  });
});
