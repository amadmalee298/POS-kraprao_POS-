import { describe, expect, it } from 'vitest';
import { countsAsRevenue, isUnpaid } from '../orderUtils';
import { buildPublicMenu } from '../publicMenu';
import type { AddOnOption, Branch, CategoryItem, MenuItem } from '../../types';

describe('countsAsRevenue', () => {
  it('counts paid orders in any kitchen state, not cancelled, unapproved or unpaid ones', () => {
    expect(countsAsRevenue({ status: 'pending' })).toBe(true); // old orders have no paymentStatus = paid
    expect(countsAsRevenue({ status: 'served', paymentStatus: 'paid' })).toBe(true);
    expect(countsAsRevenue({ status: 'cancelled' })).toBe(false);
    expect(countsAsRevenue({ status: 'pending-qr', paymentStatus: 'unpaid' })).toBe(false);
    expect(countsAsRevenue({ status: 'served', paymentStatus: 'unpaid' })).toBe(false);
    expect(isUnpaid({ paymentStatus: 'unpaid' })).toBe(true);
  });
});

describe('buildPublicMenu', () => {
  const menu = [
    {
      id: 'm1', name: 'กะเพราไก่', nameEn: 'Chicken', category: 'kaprao', price: 50, costPrice: 22,
      description: 'd', image: 'data:image/png;base64,AAAA', recipe: [{ ingredientId: 'x', amountNeeded: 1 }],
      availableSpiceLevels: ['เผ็ดน้อย'],
      availableProteins: [
        { name: 'หมูกรอบ', extraPrice: 20, recipe: [{ ingredientId: 'crispy', amountNeeded: 140 }], replacesIngredientIds: ['x'], costDelta: 26 }
      ],
      isSoldOut: true
    }
  ] as unknown as MenuItem[];
  const addOns = [{ id: 'a1', name: 'เพิ่มไข่ดาว', price: 10, ingredientId: 'egg', ingredientAmount: 1 }] as AddOnOption[];
  const cats = [{ id: 'kaprao', name: 'กะเพรา', icon: 'Flame' }] as CategoryItem[];
  const branch = { id: 'b1', name: 'สาขา 1', promptpayMobileOrTaxId: '' } as Branch;

  it('never publishes cost prices, recipes, ingredient links or embedded images', () => {
    const pub = buildPublicMenu(menu, cats, addOns, { shopName: 'ร้าน', shopLogoUrl: 'data:image/png;base64,AA' }, branch, '0891234567');
    const json = JSON.stringify(pub);
    expect(json).not.toContain('costPrice');
    expect(json).not.toContain('recipe');
    expect(json).not.toContain('ingredientId');
    expect(pub.menuItems[0].image).toBe('');
    expect(pub.settings.shopLogoUrl).toBeUndefined();
    expect(pub.branch.promptpayMobileOrTaxId).toBe('0891234567');
    expect(pub.menuItems[0].availableSpiceLevels).toEqual(['เผ็ดน้อย']);
    expect(pub.menuItems[0].availableProteins).toEqual([{ name: 'หมูกรอบ', extraPrice: 20 }]);
    expect(json).not.toContain('costDelta');
    expect(json).not.toContain('replacesIngredientIds');
    expect(pub.menuItems[0].isSoldOut).toBe(true);
  });
});
