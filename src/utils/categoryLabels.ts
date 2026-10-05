import type { ExpenseCategory, IncomeCategory } from '../types';

/*
 * No imports besides types: also used by the Telegram bot on Vercel (plain Node ESM).
 */

/** Thai names of expense categories */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  raw_material: 'ซื้อวัตถุดิบ',
  salary: 'เงินเดือนและค่าแรง',
  rent: 'ค่าเช่า',
  utilities: 'ค่าน้ำ ค่าไฟ ค่าแก๊ส',
  supplies: 'วัสดุสิ้นเปลือง',
  equipment: 'ซื้ออุปกรณ์ (สินทรัพย์)',
  marketing: 'โฆษณาและการตลาด',
  other: 'ค่าใช้จ่ายอื่น'
};

/** Thai names of other-income categories */
export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  catering: 'งานจัดเลี้ยง / เหมาบูธ',
  ad_sponsor: 'สปอนเซอร์ / ป้ายโฆษณา',
  recycling: 'ขายของรีไซเคิล / น้ำมันพืชเก่า',
  interest: 'ดอกเบี้ยรับ / เงินปันผล',
  rental: 'ค่าเช่าพื้นที่ / หน้าร้าน',
  asset_sale: 'ขายสินทรัพย์ / อุปกรณ์เก่า',
  subsidy: 'เงินช่วยเหลือ / เงินอุดหนุนรัฐ',
  delivery_subsidy: 'เงินชดเชย / เงินคืนแพลตฟอร์ม',
  other: 'รายได้เบ็ดเตล็ดอื่นๆ'
};
