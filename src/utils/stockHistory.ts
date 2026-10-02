import type { AddOnOption, Ingredient, MenuItem, Order, StockAdjustmentLog } from '../types';
import { computeSaleStockDeductions, resolveItemsForStock } from './orderUtils';
import { effectiveUnitCost } from './recipeUtils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day (YYYY-MM-DD) of an ISO time. */
export const localDay = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Orders whose ingredients left the stock: everything except not-yet-approved QR orders and
 * cancelled bills whose ingredients went back to stock (or never left it).
 */
const usedStock = (o: Order) => (o.status === 'cancelled' ? !!o.cancelStockUsed : o.status !== 'pending-qr');

export interface DailySalesUsage {
  day: string;
  /** Time of the last order in this group (sales are grouped per hour) */
  time: string;
  ingredientId: string;
  amount: number; // in the ingredient's stock unit
  orderCount: number;
}

/**
 * Ingredients used by sales, grouped per hour, from the orders themselves (the same rules as the
 * till's deduction). Hourly groups keep the stock card short while its balances stay in order.
 */
export function salesUsageByDay(
  orders: Order[],
  ingredients: Ingredient[],
  menuItems: MenuItem[],
  addOns: AddOnOption[],
  sinceMs = 0
): DailySalesUsage[] {
  const byKey = new Map<string, DailySalesUsage & { ids: Set<string> }>();
  orders.forEach(o => {
    if (!usedStock(o)) return;
    const t = new Date(o.createdAt).getTime();
    if (!Number.isFinite(t) || t < sinceMs) return;
    const day = localDay(o.createdAt);
    const hour = new Date(o.createdAt).getHours();
    const deltas = computeSaleStockDeductions(resolveItemsForStock(o.items || [], menuItems, addOns), ingredients);
    deltas.forEach((amount, ingredientId) => {
      const key = `${day}|${hour}|${ingredientId}`;
      const row = byKey.get(key) || { day, time: o.createdAt, ingredientId, amount: 0, orderCount: 0, ids: new Set<string>() };
      row.amount += amount;
      row.ids.add(o.id);
      if (o.createdAt > row.time) row.time = o.createdAt;
      byKey.set(key, row);
    });
  });
  return Array.from(byKey.values()).map(({ ids, ...r }) => ({ ...r, orderCount: ids.size }));
}

export type MovementType = 'IN' | 'OUT' | 'ADJUST';

export interface StockMovement {
  id: string;
  time: string; // ISO
  ingredientId: string;
  ingredientName: string;
  unit: string;
  type: MovementType;
  change: number; // signed, in the stock unit
  note: string;
  operator: string;
}

const OUT_REASONS = new Set(['waste', 'spoilage', 'expired', 'damaged', 'cooking_prep', 'issue']);

/** Every stock movement: history entries (receiving, waste, counts, corrections) plus daily sales. */
export function buildStockMovements(
  logs: StockAdjustmentLog[],
  sales: DailySalesUsage[],
  ingredients: Ingredient[]
): StockMovement[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const fromLogs: StockMovement[] = logs.map(l => ({
    id: l.id,
    time: l.timestamp,
    ingredientId: l.ingredientId,
    ingredientName: byId.get(l.ingredientId)?.name || l.ingredientName,
    unit: l.unit,
    type: (l.reason === 'restock' || l.reason === 'prep_output') && l.changeQty > 0 ? 'IN' : OUT_REASONS.has(String(l.reason)) ? 'OUT' : 'ADJUST',
    change: l.changeQty,
    note: [reasonLabel(String(l.reason)), l.notes].filter(Boolean).join(' · '),
    operator: l.userName
  }));
  const fromSales: StockMovement[] = sales.map(s => ({
    id: `sale-${s.time}-${s.ingredientId}`,
    time: new Date(s.time).toISOString(),
    ingredientId: s.ingredientId,
    ingredientName: byId.get(s.ingredientId)?.name || s.ingredientId,
    unit: byId.get(s.ingredientId)?.unit || '',
    type: 'OUT',
    change: -Number(s.amount.toFixed(4)),
    note: `ขาย ${s.orderCount} ออเดอร์`,
    operator: 'ระบบขาย'
  }));
  return [...fromLogs, ...fromSales].sort((a, b) => b.time.localeCompare(a.time));
}

/**
 * Balance after each movement of one ingredient, worked back from today's stock
 * (newest first in, newest first out).
 */
export function withRunningBalance(movements: StockMovement[], currentStock: number): (StockMovement & { balance: number })[] {
  let running = currentStock;
  return movements.map(m => {
    const row = { ...m, balance: Number(running.toFixed(4)) };
    running -= m.change;
    return row;
  });
}

export function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    restock: 'รับเข้า',
    waste: 'ของเสีย',
    spoilage: 'เน่าเสีย',
    expired: 'หมดอายุ',
    damaged: 'เสียหาย',
    audit_correction: 'ตรวจนับ',
    manual_adjustment: 'ปรับยอด',
    cooking_prep: 'เบิกไปผลิต/เตรียมครัว',
    prep_output: 'รับเข้าจากการผลิต',
    issue: 'เบิกใช้',
    spoiled: 'เน่าเสีย',
    overcooked: 'ปรุงเสีย',
    trimming: 'ตัดแต่ง',
    other: 'อื่นๆ'
  };
  return labels[reason] || reason;
}

export interface ForecastRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentStock: number;
  minStockAlert: number;
  dailyUsage: number;
  daysOfData: number;
  daysLeft: number | null; // null = no usage recorded
  riskLevel: 'CRITICAL' | 'WARNING' | 'OPTIMAL';
  suggestedOrderQty: number;
  estimatedCost: number;
}

/**
 * Stock forecast from real sales: average daily use over the last `lookbackDays` (only the days
 * the shop actually has orders for), days until the stock runs out, and how much to order to
 * cover `coverDays` plus the alert level. Ingredients never used get no made-up rate.
 */
export function forecastInventory(
  ingredients: Ingredient[],
  orders: Order[],
  menuItems: MenuItem[],
  addOns: AddOnOption[],
  coverDays: number,
  now: Date = new Date(),
  lookbackDays = 14
): ForecastRow[] {
  const since = now.getTime() - lookbackDays * DAY_MS;
  const recent = orders.filter(o => usedStock(o) && new Date(o.createdAt).getTime() >= since);
  const firstOrder = recent.reduce((min, o) => Math.min(min, new Date(o.createdAt).getTime()), now.getTime());
  const daysOfData = recent.length ? Math.max(1, Math.min(lookbackDays, Math.ceil((now.getTime() - firstOrder) / DAY_MS))) : 0;
  const totals = new Map<string, number>();
  salesUsageByDay(recent, ingredients, menuItems, addOns, since).forEach(r => totals.set(r.ingredientId, (totals.get(r.ingredientId) || 0) + r.amount));

  return ingredients.map(ing => {
    const dailyUsage = daysOfData ? (totals.get(ing.id) || 0) / daysOfData : 0;
    const daysLeft = dailyUsage > 0 ? Number((ing.currentStock / dailyUsage).toFixed(1)) : null;
    const lowByAlert = ing.minStockAlert > 0 && ing.currentStock <= ing.minStockAlert;
    const riskLevel: ForecastRow['riskLevel'] =
      lowByAlert || (daysLeft !== null && daysLeft <= 2) ? 'CRITICAL' : daysLeft !== null && daysLeft <= 4 ? 'WARNING' : 'OPTIMAL';
    const need = dailyUsage * coverDays + (ing.minStockAlert || 0) - ing.currentStock;
    const suggestedOrderQty = need > 0 ? Number(need.toFixed(2)) : 0;
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      currentStock: ing.currentStock,
      minStockAlert: ing.minStockAlert,
      dailyUsage: Number(dailyUsage.toFixed(4)),
      daysOfData,
      daysLeft,
      riskLevel,
      suggestedOrderQty,
      estimatedCost: Number((suggestedOrderQty * effectiveUnitCost(ing)).toFixed(2))
    };
  });
}
