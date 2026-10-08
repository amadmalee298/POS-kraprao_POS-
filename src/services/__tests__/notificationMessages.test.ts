import { describe, expect, it } from 'vitest';
import {
  formatPlainNotification,
  generateDailySummaryMessage,
  generateLowStockMessage,
  generateNewOrderMessage,
  generateVoidOrderMessage,
  htmlToText,
  setNotificationShopName
} from '../notificationService';

const now = new Date('2026-10-08T05:00:00.000Z'); // 12:00 in Bangkok
const item = (name: string, quantity: number, price: number) => ({ cartItemId: name, quantity, unitPrice: price, totalPrice: quantity * price, menuItem: { id: name, name, price } });
const order = (over: any = {}): any => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  branchId: 'b1',
  orderType: 'dine-in',
  tableNumber: '5',
  items: [item('กะเพราหมู', 2, 60)],
  grandTotal: 120,
  paymentMethod: 'cash',
  status: 'served',
  createdAt: now.toISOString(),
  ...over
});
const branch: any = { id: 'b1', name: 'สาขาลาดพร้าว' };
const settings: any = { shopName: 'ร้านอาหมัดกะเพรา' };

describe('notification messages', () => {
  it('names the shop from Settings, in Thai, with a bold heading', () => {
    const m = generateNewOrderMessage(order(), branch, settings);
    expect(m.split('\n')[0]).toBe('🛎 <b>ออเดอร์ใหม่ ORD-1</b>');
    expect(m).toContain('🏪 ร้านอาหมัดกะเพรา · สาขาลาดพร้าว');
    expect(m).toContain('โต๊ะ 5 · 12:00 น.');
    expect(m).not.toMatch(/NEW ORDER|ครัวกะเพรา/);
  });

  it('says who cancelled a bill', () => {
    const m = generateVoidOrderMessage(order(), 'ลูกค้าเปลี่ยนใจ', 'สั่งผิด', 'ซัมฟาติน', branch, settings);
    expect(m).toContain('👤 ผู้ยกเลิก: ซัมฟาติน');
    expect(m).toContain('📝 เหตุผล: ลูกค้าเปลี่ยนใจ (สั่งผิด)');
  });

  it('sums the day with other income, expenses and what is left, best sellers in dishes', () => {
    const m = generateDailySummaryMessage(
      [order(), order({ id: 'o2', grandTotal: 80, paymentMethod: 'transfer', orderType: 'delivery', items: [item('ไข่ดาว', 3, 10)] }), order({ id: 'o3', status: 'cancelled' }), order({ id: 'o4', createdAt: '2026-10-07T05:00:00.000Z' })],
      [{ id: 'i', name: 'หมู', currentStock: 1, minStockAlert: 3, unit: 'kg' } as any],
      branch,
      settings,
      { expenses: [{ date: '2026-10-08', amount: 50, branchId: 'b1' }, { date: '2026-10-07', amount: 999 }], incomes: [{ date: '2026-10-08', amount: 30 }] },
      now
    );
    const text = htmlToText(m);
    expect(text).toContain('ยอดขาย: 200.00 บาท (2 บิล · เฉลี่ย 100.00)');
    expect(text).toContain('รับชำระ: เงินสด 120.00 · โอนเงิน 80.00');
    expect(text).toContain('รายรับอื่น: 30.00 บาท (1 รายการ)');
    expect(text).toContain('รายจ่าย: 50.00 บาท (1 รายการ)');
    expect(text).toContain('คงเหลือ 180.00 บาท');
    expect(text).toContain('ขายดี: ไข่ดาว 3 จาน · กะเพราหมู 2 จาน');
    expect(text).toContain('วัตถุดิบใกล้หมด 1 รายการ');
  });

  it('keeps text safe for Telegram HTML and readable as plain text', () => {
    setNotificationShopName('ร้าน <A&B>');
    const m = generateLowStockMessage([{ id: 'x', name: 'ซอส <หอย>', currentStock: 1, minStockAlert: 2, unit: 'ขวด' } as any]);
    expect(m).toContain('ซอส &lt;หอย&gt;');
    expect(m).toContain('🏪 ร้าน &lt;A&amp;B&gt;');
    expect(htmlToText(m)).toContain('ซอส <หอย>');
    const plain = formatPlainNotification('เตือนยื่นเอกสาร', 'ภ.พ.30 < 15 ต.ค.');
    expect(plain.split('\n')[0]).toBe('🔔 <b>เตือนยื่นเอกสาร</b>');
    expect(plain).toContain('ภ.พ.30 &lt; 15 ต.ค.');
    setNotificationShopName('');
  });
});
