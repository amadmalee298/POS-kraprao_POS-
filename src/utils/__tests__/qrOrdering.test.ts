import { describe, expect, it } from 'vitest';
import { readTableFromUrl, DEFAULT_BRANCH_ID } from '../../components/customer/tableLink';
import { generateQrOrderNumber, repriceQrOrder, resolveItemsForStock } from '../orderUtils';
import type { AddOnOption, CartItem, MenuItem, Order } from '../../types';

describe('readTableFromUrl', () => {
  it('reads table and branch from a table QR link', () => {
    expect(readTableFromUrl('?table=5&b=branch-123')).toEqual({ table: '5', branchId: 'branch-123' });
  });
  it('falls back to the default branch for old QR codes and accepts ?qr=', () => {
    expect(readTableFromUrl('?qr=A2')).toEqual({ table: 'A2', branchId: DEFAULT_BRANCH_ID });
  });
  it('strips unsafe characters and ignores links without a table', () => {
    expect(readTableFromUrl('?table=<script>7')?.table).toBe('script7');
    expect(readTableFromUrl('?foo=1')).toBeNull();
  });
});

describe('generateQrOrderNumber', () => {
  it('includes the table and a short random tag', () => {
    expect(generateQrOrderNumber('12')).toMatch(/^#Q12-[A-Z2-9]{4}$/);
  });
});

describe('resolveItemsForStock', () => {
  it("re-attaches the shop's recipes and add-ons to an order that came from the cloud", () => {
    const shopMenu = [{ id: 'm1', name: 'กะเพราไก่', recipe: [{ ingredientId: 'chicken', amountNeeded: 150 }] }] as unknown as MenuItem[];
    const shopAddOns = [{ id: 'egg', name: 'เพิ่มไข่ดาว', price: 10, ingredientId: 'egg-ing', ingredientAmount: 1 }] as AddOnOption[];
    const cloudItem = {
      cartItemId: 'c1',
      quantity: 2,
      menuItem: { id: 'm1', name: 'กะเพราไก่', recipe: [] },
      selectedAddOns: [{ id: 'addon-0', name: 'เพิ่มไข่ดาว', price: 0 }]
    } as unknown as CartItem;
    const [resolved] = resolveItemsForStock([cloudItem], shopMenu, shopAddOns);
    expect(resolved.menuItem.recipe).toHaveLength(1);
    expect(resolved.selectedAddOns[0].ingredientId).toBe('egg-ing');
    expect(resolved.quantity).toBe(2);
  });
});

describe('resolveItemsForStock keeps the recipe of the time of sale', () => {
  it('uses the recipe saved on the bill when it has one', () => {
    const shopMenu = [{ id: 'm1', name: 'กะเพราไก่', recipe: [{ ingredientId: 'chicken', amountNeeded: 200 }] }] as unknown as MenuItem[];
    const sold = {
      cartItemId: 'c1',
      quantity: 1,
      menuItem: { id: 'm1', name: 'กะเพราไก่', recipe: [{ ingredientId: 'chicken', amountNeeded: 150 }] },
      selectedAddOns: [{ id: 'egg', name: 'เพิ่มไข่ดาว', price: 10, ingredientId: 'egg-old', ingredientAmount: 1 }]
    } as unknown as CartItem;
    const shopAddOns = [{ id: 'egg', name: 'เพิ่มไข่ดาว', price: 10, ingredientId: 'egg-new', ingredientAmount: 2 }] as AddOnOption[];
    const [resolved] = resolveItemsForStock([sold], shopMenu, shopAddOns);
    expect(resolved.menuItem.recipe?.[0].amountNeeded).toBe(150);
    expect(resolved.selectedAddOns[0].ingredientId).toBe('egg-old');
  });
});

describe('repriceQrOrder', () => {
  const menu = [{ id: 'm1', name: 'กะเพรา', price: 60, availableProteins: [{ name: 'หมูกรอบ', extraPrice: 15 }] }] as unknown as MenuItem[];
  const shopAddOns = [{ id: 'egg', name: 'ไข่ดาว', price: 10 }] as AddOnOption[];
  const order = (unitPrice: number) =>
    ({
      id: 'o1',
      isQrOrder: true,
      items: [
        {
          cartItemId: 'c1',
          menuItem: { id: 'm1', name: 'กะเพรา', price: 1 },
          quantity: 2,
          proteinChoice: { name: 'หมูกรอบ', extraPrice: 0 },
          selectedAddOns: [{ id: 'egg', name: 'ไข่ดาว', price: 0 }],
          unitPrice,
          totalPrice: unitPrice * 2
        }
      ],
      subtotal: unitPrice * 2,
      discountAmount: 0,
      vatAmount: 0,
      grandTotal: unitPrice * 2
    }) as unknown as Order;

  it("charges the shop's prices, not what the customer's page sent", () => {
    const fixed = repriceQrOrder(order(1), menu, shopAddOns, { enableVat: false });
    expect(fixed.items[0].unitPrice).toBe(85);
    expect(fixed.subtotal).toBe(170);
    expect(fixed.grandTotal).toBe(170);
  });

  it('leaves a correctly priced order as it is', () => {
    const ok = order(85);
    expect(repriceQrOrder(ok, menu, shopAddOns, { enableVat: false })).toBe(ok);
  });
});
