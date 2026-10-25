import { describe, expect, it } from 'vitest';
import { crashesBefore, readRunState } from '../bootGuard';

describe('crashesBefore', () => {
  const now = 10_000_000;
  it('a first run or one that went to the background ended normally', () => {
    expect(crashesBefore(null, now)).toBe(0);
    expect(crashesBefore({ visible: false, at: now - 1000, crashes: 0 }, now)).toBe(0);
  });
  it('a run last seen on screen moments ago was closed by the phone', () => {
    expect(crashesBefore({ visible: true, at: now - 5000, crashes: 0 }, now)).toBe(1);
    expect(crashesBefore({ visible: true, at: now - 5000, crashes: 2 }, now)).toBe(3);
  });
  it('a run last seen on screen long ago is not counted', () => {
    expect(crashesBefore({ visible: true, at: now - 60 * 60_000, crashes: 1 }, now)).toBe(0);
  });
  it('reads what was saved, and ignores anything else', () => {
    expect(readRunState('{"visible":true,"at":5,"crashes":1}')).toEqual({ visible: true, at: 5, crashes: 1 });
    expect(readRunState('nope')).toBeNull();
    expect(readRunState(null)).toBeNull();
  });
});
