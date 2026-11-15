import { describe, expect, it } from 'vitest';
import { isTransient } from '../botEngine';

describe('network hiccups while reading a bill', () => {
  it('are told apart from real failures', () => {
    expect(isTransient(new TypeError('fetch failed'))).toBe(true);
    expect(isTransient(new Error('Anthropic API 529: Overloaded'))).toBe(true);
    expect(isTransient(Object.assign(new Error('x'), { cause: { code: 'ECONNRESET' } }))).toBe(true);
    expect(isTransient(new Error('ไม่พบยอดเงินในรูป'))).toBe(false);
    expect(isTransient(new Error('credit balance is too low'))).toBe(false);
  });
});
