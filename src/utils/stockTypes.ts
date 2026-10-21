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

/**
 * Below its alert level: time to buy more. Only stock that is used up counts (ingredients,
 * packaging, supplies); equipment is counted for checking, not reordered, and an item without an
 * alert level never warns.
 */
export const isLowStock = (ing: Pick<Ingredient, 'stockType' | 'category' | 'currentStock' | 'minStockAlert'>): boolean =>
  stockTypeOf(ing) !== 'equipment' && (ing.minStockAlert || 0) > 0 && (ing.currentStock || 0) <= (ing.minStockAlert || 0);

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

// Words in an item's name that tell what kind of stock it is. Packaging sold with the food (bags,
// boxes, cups, plastic spoons) is inventory, like the ingredients.
const EQUIPMENT_WORDS = /ถัง(?!แก๊ส|ขยะพลาสติก)|หม้อ|กระทะ|ตะหลิว|ทัพพี|มีด|เขียง|กะละมัง|ตะแกรง|กระชอน|ชั้นวาง|ตู้|เตา|เครื่อง|พัดลม|โต๊ะ|เก้าอี้|สแตนเลส|ซึ้ง|ลังถึง|ถาดสแตนเลส|กาต้มน้ำ|ไมโครเวฟ|ตาชั่ง|เครื่องชั่ง|ปลั๊ก|หลอดไฟ/;
const SUPPLY_WORDS = /ถุงมือ|ทิชชู่|ทิชชู|กระดาษเช็ด|กระดาษชำระ|น้ำยา|สบู่|ฟองน้ำ|สก๊อตไบรต์|สก็อตไบรต์|ฝอยขัด|แปรง|ฟอยล์|แรป|ถุงขยะ|ไม้กวาด|ผ้าเช็ด|ผ้ากันเปื้อน|หมวกคลุมผม|แก๊ส|หนังยาง|ยางรัด|ไม้จิ้มฟัน|ผงซักฟอก|แอลกอฮอล์|ถ่านไฟฉาย/;

/** The kind of stock an item's name suggests, or null when it does not say (then: as bought) */
export function guessStockType(name: string): StockType | null {
  const n = (name || '').toLowerCase();
  if (SUPPLY_WORDS.test(n)) return 'supplies';
  if (EQUIPMENT_WORDS.test(n)) return 'equipment';
  return null;
}

/** Items in the ingredients list whose names say they are supplies or equipment */
export function misfiledStock(ingredients: Ingredient[]): { ing: Ingredient; to: StockType }[] {
  return ingredients
    .map(ing => ({ ing, to: guessStockType(ing.name) }))
    .filter((x): x is { ing: Ingredient; to: StockType } => !!x.to && stockTypeOf(x.ing) === 'inventory' && !x.ing.stockTypeConfirmed);
}
