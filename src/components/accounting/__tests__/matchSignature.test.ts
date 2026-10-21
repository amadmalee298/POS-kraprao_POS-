import { describe, expect, it } from 'vitest';
import { matchSignature } from '../ExpenseDocActions';

describe('whose signature', () => {
  const list = [{ name: 'อาห์มัด มะหลี' }, { name: 'ฟาติน' }, { name: 'สมชาย ใจดี' }, { name: 'สมชาย รักงาน' }];
  it('finds the person by name, without notes or titles, or by a first name only one has', () => {
    expect(matchSignature(list, 'อาห์มัด มะหลี')?.name).toBe('อาห์มัด มะหลี');
    expect(matchSignature(list, 'อาห์มัด (เจ้าของร้าน)')?.name).toBe('อาห์มัด มะหลี');
    expect(matchSignature(list, 'นางสาว ฟาติน')?.name).toBe('ฟาติน');
    // Two people share the first name: nobody is guessed
    expect(matchSignature(list, 'สมชาย')).toBeUndefined();
    expect(matchSignature(list, 'kameenee.sa')).toBeUndefined();
    expect(matchSignature(list, '')).toBeUndefined();
  });
});
