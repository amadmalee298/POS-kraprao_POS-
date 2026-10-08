import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PIN_HASH, findManagerByPin, hashPin, isHashedPin, isWeakPin, notePinAttempt, pinLockRemaining, pinMatches, sha256HexSync } from '../pins';
import type { User } from '../../types';

describe('hashed PINs', () => {
  it('computes SHA-256 like the standard one', () => {
    for (const t of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(130), 'กะเพรา']) {
      expect(sha256HexSync(t)).toBe(createHash('sha256').update(t).digest('hex'));
    }
  });

  it('stores a PIN salted and hashed, and still accepts older plain PINs', () => {
    const a = hashPin('2580');
    const b = hashPin('2580');
    expect(isHashedPin(a)).toBe(true);
    expect(a).not.toContain('2580');
    expect(a).not.toBe(b); // a salt of its own
    expect(pinMatches(a, '2580')).toBe(true);
    expect(pinMatches(a, '2581')).toBe(false);
    expect(hashPin(a)).toBe(a);
    expect(pinMatches('1234', '1234')).toBe(true);
    expect(pinMatches(DEFAULT_PIN_HASH, '1234')).toBe(true);
    expect(pinMatches(undefined, '1234')).toBe(false);
    expect(isWeakPin('1234')).toBe(true);
    expect(isWeakPin('7777')).toBe(true);
    expect(isWeakPin('2580')).toBe(false);
  });

  it('finds the manager by a hashed PIN', () => {
    const users = [{ id: 'm', name: 'ผู้จัดการ', role: 'manager', pin: hashPin('4826') }] as User[];
    expect(findManagerByPin('4826', users, {})?.name).toBe('ผู้จัดการ');
    expect(findManagerByPin('9999', users, { adminPin: hashPin('9999') })?.role).toBe('admin');
    expect(findManagerByPin('1111', users, {})).toBeNull();
  });
});

describe('wrong PIN lockout', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    };
  });

  it('locks after five wrong PINs in a row, longer each round, and clears on a right one', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(notePinAttempt(false, t)).toBe(0);
    expect(notePinAttempt(false, t)).toBe(30_000);
    expect(pinLockRemaining(t + 10_000)).toBe(20_000);
    for (let i = 0; i < 4; i++) notePinAttempt(false, t + 40_000);
    expect(notePinAttempt(false, t + 40_000)).toBe(60_000);
    notePinAttempt(true, t + 200_000);
    expect(pinLockRemaining(t + 200_000)).toBe(0);
    expect(notePinAttempt(false, t + 200_000)).toBe(0);
  });
});
