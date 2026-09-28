import type { Ingredient, StockType } from '../types';
import { effectiveUnitCost } from './recipeUtils';

/**
 * The three kinds of stock a restaurant keeps, each with its own accounting:
 * - inventory: ingredients and the packaging sold with the food — an asset until sold, then cost
 *   of sales (IAS 2 Inventories)
 * - supplies: cleaning and kitchen consumables — low value, expensed when bought; the stock list
 *   only tracks how many are left (materiality)
 * - equipment: tools and machines — recorded at cost when bought and depreciated over their useful
 *   life (IAS 16 Property, plant and equipment); the stock list counts them
 */
export const STOCK_TYPES: { id: StockType; label: string; short: string; hint: string }[] = [
  { id: 'inventory', label: 'สต็อกสินค้า / วัตถุดิบ', short: 'วัตถุดิบ', hint: 'วัตถุดิบอาหารและบรรจุภัณฑ์ที่ขายไปกับอาหาร นับเป็นสินค้าคงเหลือ (สินทรัพย์) จนกว่าจะขาย' },
  { id: 'supplies', label: 'วัสดุสิ้นเปลือง', short: 'วัสดุสิ้นเปลือง', hint: 'น้ำยาล้างจาน ทิชชู่ ถุงมือ แก๊ส ฯลฯ ลงเป็นค่าใช้จ่ายเมื่อซื้อ นับจำนวนไว้เพื่อสั่งซื้อ' },
  { id: 'equipment', label: 'อุปกรณ์', short: 'อุปกรณ์', hint: 'เครื่องครัว มีด หม้อ เตา ตู้แช่ บันทึกเป็นสินทรัพย์และคิดค่าเสื่อมราคา นับจำนวนไว้ตรวจสอบ' }
];

const SUPPLY_CATEGORIES = new Set(['supplies', 'supply', 'cleaning', 'consumable', 'consumables']);
const EQUIPMENT_CATEGORIES = new Set(['equipment', 'tools', 'tool', 'utensils']);

/** The ingredient's stock type: set by the shop, or decided from its category */
export function stockTypeOf(ing: Pick<Ingredient, 'stockType' | 'category'>): StockType {
  if (ing.stockType) return ing.stockType;
  const c = (ing.category || '').toLowerCase();
  if (EQUIPMENT_CATEGORIES.has(c)) return 'equipment';
  if (SUPPLY_CATEGORIES.has(c)) return 'supplies';
  return 'inventory';
}

export const stockTypeLabel = (t: StockType) => STOCK_TYPES.find(x => x.id === t)?.label || t;

/** Value of what is on hand, by type (quantity × cost per unit) */
export function stockValueByType(ingredients: Ingredient[]): Record<StockType, { value: number; items: number }> {
  const out: Record<StockType, { value: number; items: number }> = {
    inventory: { value: 0, items: 0 },
    supplies: { value: 0, items: 0 },
    equipment: { value: 0, items: 0 }
  };
  ingredients.forEach(ing => {
    const t = stockTypeOf(ing);
    out[t].items += 1;
    out[t].value += (ing.currentStock || 0) * effectiveUnitCost(ing);
  });
  (Object.keys(out) as StockType[]).forEach(t => (out[t].value = Math.round(out[t].value * 100) / 100));
  return out;
}

/** The expense category a purchase of this stock type is recorded under */
export const expenseCategoryForStockType = (t: StockType) => (t === 'inventory' ? 'raw_material' : t);

/** The stock type goods bought under an expense category go to, if any */
export function stockTypeForExpenseCategory(category: string): StockType | null {
  if (category === 'raw_material') return 'inventory';
  if (category === 'supplies') return 'supplies';
  if (category === 'equipment') return 'equipment';
  return null;
}
