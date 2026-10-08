import { describe, expect, it } from 'vitest';
import type { Ingredient, StockLot } from '../../types';
import { expiryState, latestLotByIngredient } from '../stockLots';
import { isLowStock } from '../stockTypes';
import { forecastInventory } from '../stockHistory';

const lot = (id: string, ingredientId: string, receivedDate: string, expiryDate: string): StockLot => ({ id, ingredientId, lotNumber: id, quantity: 1, unitCost: 1, receivedDate, expiryDate, supplier: '' });
const ing = (over: Partial<Ingredient>): Ingredient => ({ id: 'i', name: 'หมู', category: 'meat', unit: 'kg', currentStock: 5, minStockAlert: 2, unitCost: 100, ...over }) as Ingredient;

describe('stock lots and expiry', () => {
  it('picks each ingredient\'s latest delivery', () => {
    const m = latestLotByIngredient([lot('a', 'x', '2026-10-01', ''), lot('b', 'x', '2026-10-05', ''), lot('c', 'y', '2026-09-01', '')]);
    expect(m.get('x')?.id).toBe('b');
    expect(m.get('y')?.id).toBe('c');
  });

  it('tells expired and expiring-soon lots apart', () => {
    expect(expiryState('2026-10-07', '2026-10-08')).toBe('expired');
    expect(expiryState('2026-10-10', '2026-10-08')).toBe('soon');
    expect(expiryState('2026-10-20', '2026-10-08')).toBeNull();
    expect(expiryState('', '2026-10-08')).toBeNull();
  });
});

describe('low stock', () => {
  it('warns only for stock that is used up and has an alert level', () => {
    expect(isLowStock(ing({ currentStock: 1 }))).toBe(true);
    expect(isLowStock(ing({ currentStock: 2 }))).toBe(true);
    expect(isLowStock(ing({ currentStock: 3 }))).toBe(false);
    expect(isLowStock(ing({ currentStock: 0, minStockAlert: 0 }))).toBe(false);
    expect(isLowStock(ing({ currentStock: 1, minStockAlert: 5, category: 'equipment' }))).toBe(false);
    expect(isLowStock(ing({ currentStock: 1, minStockAlert: 5, stockType: 'supplies' }))).toBe(true);
  });

  it('forecasts an empty item as gone and orders a low one back to twice its alert level, in whole packages', () => {
    const [empty, packed, tool] = forecastInventory(
      [ing({ id: 'a', currentStock: 0 }), ing({ id: 'b', currentStock: 100, minStockAlert: 500, unit: 'g', packageSize: 1000, packageUnit: 'ถุง' }), ing({ id: 'c', currentStock: 1, minStockAlert: 5, category: 'equipment' })],
      [],
      [],
      [],
      7
    );
    expect(empty.daysLeft).toBe(0);
    expect(empty.riskLevel).toBe('CRITICAL');
    expect(empty.suggestedOrderQty).toBe(4);
    expect(packed.suggestedOrderQty).toBe(1000);
    expect(tool.riskLevel).toBe('OPTIMAL');
    expect(tool.suggestedOrderQty).toBe(0);
  });
});
