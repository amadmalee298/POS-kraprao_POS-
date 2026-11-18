import { describe, expect, it } from 'vitest';
import { duplicateGroups, oddAlertLevels, similarNames, unusedIngredients, usedIngredientIds } from '../ingredientCleanup';

const ing = (id: string, name: string, unit = 'pcs', currentStock = 0, minStockAlert = 5) => ({ id, name, unit, currentStock, minStockAlert, unitCost: 0, category: 'x' }) as any;

describe('tidying the ingredient list', () => {
  it('finds names spelled several ways', () => {
    expect(similarNames('แม็กซ์โมนิคยัวร์ไซค์6R', 'แม็กซ์โมนิคยัวร์ไซซ์6R')).toBe(true);
    expect(similarNames('แม็กซ์โมนิคแฮนด์60S X4', 'แม็กซ์โมนิแฮนด์60S X4')).toBe(true);
    expect(similarNames('ไข่ไก่เบอร์3-4', 'ไข่ไก่เบอร์ 3-4')).toBe(true);
    expect(similarNames('หมูสับ', 'หมูกรอบ')).toBe(false);
    expect(similarNames('น้ำมันพืช', 'น้ำปลา')).toBe(false);
  });

  it('groups them with the one recipes use first, and keeps different units apart', () => {
    const list = [ing('a', 'แม็กซ์โมนิคยัวร์ไซค์6R'), ing('b', 'แม็กซ์โมนิค์ยัวร์ไซค์6R'), ing('c', 'แม็กซ์โมนิคยัวร์ไซด์6R', 'pcs', 1), ing('d', 'ไข่ไก่'), ing('e', 'ไข่ไก่', 'kg')];
    const groups = duplicateGroups(list, new Set(['b']));
    expect(groups).toHaveLength(1);
    expect(groups[0].map(i => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('lists unused items without stock, and alert levels that do not fit the unit', () => {
    const list = [ing('used', 'ข้าว', 'kg', 0), ing('stock', 'ถุง', 'pcs', 3), ing('gone', 'วากิว', 'g', 0, 1000), ing('soap', 'ผงซักฟอก', 'g', 100, 5)];
    const used = usedIngredientIds([{ recipe: [{ ingredientId: 'used', amountNeeded: 1 }] } as any], []);
    expect(unusedIngredients(list, used).map(i => i.id)).toEqual(['gone']);
    expect(oddAlertLevels(list).map(i => i.id)).toEqual(['soap']);
  });
});
