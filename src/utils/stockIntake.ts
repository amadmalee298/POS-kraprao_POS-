import type { Ingredient } from '../types';
import { canonicalUnit, convertAmount, effectiveUnitCost } from './recipeUtils';

/**
 * Turning a purchase bill into stock: the items on the bill (read by AI, or typed as the photo's
 * caption such as "กุ้ง 3กก ปลาหมึก 2กก") are matched to the shop's ingredients, converted to each
 * ingredient's unit, and given their share of the bill's cost.
 */

export interface BillItem {
  name: string;
  quantity?: number;
  unit?: string;
  amount?: number; // baht for this line, when the bill shows it
}

export interface IntakeRow {
  key: string;
  label: string; // as written on the bill
  ingredientId: string; // '' = not matched
  quantity: number; // in the ingredient's unit
  cost: number; // baht for this row
  lineAmount?: number; // the amount printed on the bill for this line, if any
  /** The bill's unit could not be converted to the ingredient's unit: check the quantity */
  unitMismatch: boolean;
  selected: boolean;
}

const UNIT_WORDS =
  'กิโลกรัม|กิโล|กก\\.?|kg|กรัม|g|ลิตร|ล\\.|l|มล\\.?|ml|ขวด|ถุง|แพ็ค|แพค|ฟอง|แผง|ชิ้น|กล่อง|ลัง|กระป๋อง|หัว|มัด|ถาด|ห่อ|ตัว|ลูก|กำ|pcs|pack';
const QTY_UNIT = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})?(?=\\s|$|[,/])`, 'i');
const KEYWORDS = /#?(รายจ่าย|รายรับ|จ่ายเงิน|รับเงิน|ซื้อ|ค่า)\s*:?/g;

const toNumber = (s: string) => Number(s.replace(',', '.'));

/** "กุ้ง 3กก ปลาหมึก 2กก" → [{กุ้ง 3 kg}, {ปลาหมึก 2 kg}] */
export function parseItemsFromText(text: string): BillItem[] {
  const clean = ` ${(text || '').replace(KEYWORDS, ' ')} `.replace(/\s+/g, ' ');
  const re = new RegExp(`([^\\d,\\n/]+?)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})?(?=\\s|$|[,/])`, 'gi');
  const items: BillItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const name = m[1].replace(/[-:•·]+$/, '').trim();
    if (!name) continue;
    items.push({ name, quantity: toNumber(m[2]), unit: m[3] ? canonicalUnit(m[3].replace(/\.$/, '')) : undefined });
  }
  return items;
}

/** Quantity and unit written inside a line's name, e.g. "หมูสับ CP 5 กก." */
export function quantityInName(name: string): { quantity?: number; unit?: string; name: string } {
  const m = QTY_UNIT.exec(name || '');
  if (!m || !m[2]) return { name };
  return { quantity: toNumber(m[1]), unit: canonicalUnit(m[2].replace(/\.$/, '')), name: name.replace(m[0], '').trim() };
}

// Thai can be typed with the vowel and tone mark in either order (ก ุ ้ ง / ก ้ ุ ง): normalise, then
// drop tone marks so both spellings of กุ้ง match
const norm = (s: string) =>
  (s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u0E47-\u0E4C]/g, '')
    .replace(/[\s().,\-_/]|สด|แชแขง|ตรา\S*/g, '');

/** The shop's ingredient a bill line most likely means, or null */
export function matchIngredient(label: string, ingredients: Ingredient[]): Ingredient | null {
  const n = norm(label);
  if (n.length < 2) return null;
  let best: { ing: Ingredient; score: number } | null = null;
  for (const ing of ingredients) {
    const i = norm(ing.name);
    if (!i) continue;
    let score = 0;
    if (i === n) score = 100;
    else if (n.includes(i)) score = 50 + i.length;
    else if (i.includes(n)) score = 40 + n.length;
    if (score > (best?.score || 0)) best = { ing, score };
  }
  return best?.ing || null;
}

/**
 * Stock rows for a bill. `totalCost` is what the stock cost the shop (before VAT when it is
 * claimed); lines without their own amount share what is left, in proportion to their value at
 * the ingredient's current cost (or equally when that is unknown).
 */
export function buildIntakeRows(items: BillItem[], ingredients: Ingredient[], totalCost: number): IntakeRow[] {
  const rows = items.map((it, idx) => {
    const inName = quantityInName(it.name);
    const quantity = it.quantity && it.quantity > 0 && (it.unit || !inName.unit) ? it.quantity : inName.quantity || it.quantity || 0;
    const unit = it.unit || inName.unit;
    const ing = matchIngredient(inName.name || it.name, ingredients) || matchIngredient(it.name, ingredients);
    let qty = quantity;
    let unitMismatch = false;
    if (ing && unit) {
      // null = the bill's unit cannot become the ingredient's (e.g. ขวด → kg)
      const converted = convertAmount(quantity, unit, ing.unit);
      if (converted === null) unitMismatch = true;
      else qty = converted;
    }
    return {
      key: `row-${idx}`,
      label: it.name,
      ingredientId: ing?.id || '',
      quantity: Math.round(qty * 1000) / 1000,
      cost: it.amount && it.amount > 0 ? it.amount : 0,
      lineAmount: it.amount && it.amount > 0 ? it.amount : 0,
      unitMismatch,
      selected: !!ing && qty > 0
    };
  });
  return allocateCosts(rows, ingredients, totalCost);
}

/**
 * Cost of each selected row: a row keeps the amount printed on the bill; the rest of the bill is
 * shared by the other selected rows in proportion to their value at the ingredient's current cost
 * (equally when that is unknown). Rows that are not selected cost nothing.
 */
export function allocateCosts<T extends IntakeRow & { lineAmount?: number }>(rows: T[], ingredients: Ingredient[], totalCost: number): T[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const chosen = rows.filter(r => r.selected && r.ingredientId && r.quantity > 0);
  const priced = chosen.filter(r => (r.lineAmount || 0) > 0);
  const unpriced = chosen.filter(r => !((r.lineAmount || 0) > 0));
  const rest = Math.max(0, totalCost - priced.reduce((s, r) => s + (r.lineAmount || 0), 0));
  const weightOf = (r: T) => r.quantity * effectiveUnitCost(byId.get(r.ingredientId) || {});
  const weight = unpriced.reduce((s, r) => s + weightOf(r), 0);
  return rows.map(r => {
    if (!chosen.includes(r)) return { ...r, cost: 0 };
    if ((r.lineAmount || 0) > 0) return { ...r, cost: r.lineAmount! };
    const share = weight > 0 ? (rest * weightOf(r)) / weight : rest / unpriced.length;
    return { ...r, cost: Math.round(share * 100) / 100 };
  });
}
