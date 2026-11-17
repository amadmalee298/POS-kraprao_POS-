import { describe, expect, it } from 'vitest';
import { generateLowStockMessage, qty } from '../notificationService';
import { applyStockDeductions } from '../../utils/orderUtils';

describe('low stock message', () => {
  it('shows quantities as people write them', () => {
    expect(qty(0.78000000000000216)).toBe('0.78');
    expect(qty(1)).toBe('1');
    expect(qty(1250.5)).toBe('1,250.5');
    const msg = generateLowStockMessage([{ id: 'oil', name: 'น้ำมันถั่วเหลือง', unit: 'l', currentStock: 0.6700000000000215, minStockAlert: 1 } as any]);
    expect(msg).toContain('เหลือ 0.67 l (เตือนที่ 1 l)');
    expect(msg).not.toContain('000000');
  });

  it('keeps stock free of float leftovers after sales', () => {
    let ings = [{ id: 'oil', currentStock: 1 } as any];
    for (let i = 0; i < 11; i++) ings = applyStockDeductions(ings, new Map([['oil', 0.02]]));
    expect(ings[0].currentStock).toBe(0.78);
  });
});
