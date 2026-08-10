import { Ingredient } from '../types';

export function calcRecipeItemCostAndDeduction(
  ingredient: Partial<Ingredient> | undefined | null,
  amountNeeded: number,
  recipeUnit?: string
): { lineCost: number; stockDeduction: number; displayUnit: string } {
  if (!ingredient) return { lineCost: 0, stockDeduction: 0, displayUnit: '' };

  const ingUnit = (ingredient.unit || '').toLowerCase().trim();
  const rUnit = (recipeUnit || ingUnit).toLowerCase().trim();
  const unitCost = ingredient.unitCost || 0;

  // Case 1: Ingredient stock unit is KG (kg / กิโลกรัม / กก.)
  if (['kg', 'กิโลกรัม', 'กก', 'กก.'].includes(ingUnit)) {
    if (['g', 'กรัม', 'กรัม.'].includes(rUnit)) {
      // Amount is entered in grams (e.g. 150g)
      const kgAmount = amountNeeded / 1000;
      return { lineCost: kgAmount * unitCost, stockDeduction: kgAmount, displayUnit: 'g' };
    }
    // Default kg
    return { lineCost: amountNeeded * unitCost, stockDeduction: amountNeeded, displayUnit: 'kg' };
  }

  // Case 2: Ingredient stock unit is GRAMS (g / กรัม)
  if (['g', 'กรัม', 'กรัม.'].includes(ingUnit)) {
    if (['kg', 'กิโลกรัม', 'กก', 'กก.'].includes(rUnit)) {
      // Amount is entered in kg (e.g. 0.15 kg)
      const gAmount = amountNeeded * 1000;
      return { lineCost: gAmount * unitCost, stockDeduction: gAmount, displayUnit: 'kg' };
    }
    return { lineCost: amountNeeded * unitCost, stockDeduction: amountNeeded, displayUnit: 'g' };
  }

  // Case 3: Ingredient stock unit is LITER (l / liter / ลิตร)
  if (['l', 'liter', 'ลิตร', 'ล.'].includes(ingUnit)) {
    if (['ml', 'มิลลิลิตร', 'มล', 'มล.'].includes(rUnit)) {
      // Amount is entered in ml (e.g. 8 ml)
      const lAmount = amountNeeded / 1000;
      return { lineCost: lAmount * unitCost, stockDeduction: lAmount, displayUnit: 'ml' };
    }
    return { lineCost: amountNeeded * unitCost, stockDeduction: amountNeeded, displayUnit: 'l' };
  }

  // Case 4: Ingredient stock unit is ML (ml / มิลลิลิตร)
  if (['ml', 'มิลลิลิตร', 'มล', 'มล.'].includes(ingUnit)) {
    if (['l', 'liter', 'ลิตร', 'ล.'].includes(rUnit)) {
      // Amount entered in Liter (e.g. 0.5 L)
      const mlAmount = amountNeeded * 1000;
      return { lineCost: mlAmount * unitCost, stockDeduction: mlAmount, displayUnit: 'l' };
    }
    // Safeguard for legacy data: if ing.unit is 'ml' but unitCost >= 10 (entered cost per bottle/liter like 150 ฿), and user inputs 8 ml
    if (unitCost >= 10 && amountNeeded <= 500 && (rUnit === 'ml' || !recipeUnit)) {
      const lAmount = amountNeeded / 1000;
      return { lineCost: lAmount * unitCost, stockDeduction: amountNeeded, displayUnit: 'ml' };
    }
    return { lineCost: amountNeeded * unitCost, stockDeduction: amountNeeded, displayUnit: 'ml' };
  }

  // Default count or custom unit
  return { lineCost: amountNeeded * unitCost, stockDeduction: amountNeeded, displayUnit: ingUnit || 'pcs' };
}

export function getAvailableRecipeUnits(ingUnit: string): { val: string; label: string }[] {
  const norm = (ingUnit || '').toLowerCase().trim();
  if (['kg', 'กิโลกรัม', 'กก', 'กก.'].includes(norm)) {
    return [
      { val: 'kg', label: 'กิโลกรัม (kg)' },
      { val: 'g', label: 'กรัม (g)' }
    ];
  }
  if (['g', 'กรัม', 'กรัม.'].includes(norm)) {
    return [
      { val: 'g', label: 'กรัม (g)' },
      { val: 'kg', label: 'กิโลกรัม (kg)' }
    ];
  }
  if (['l', 'liter', 'ลิตร', 'ล.'].includes(norm)) {
    return [
      { val: 'l', label: 'ลิตร (L)' },
      { val: 'ml', label: 'มิลลิลิตร (ml)' }
    ];
  }
  if (['ml', 'มิลลิลิตร', 'มล', 'มล.'].includes(norm)) {
    return [
      { val: 'ml', label: 'มิลลิลิตร (ml)' },
      { val: 'l', label: 'ลิตร (L)' }
    ];
  }
  return [
    { val: norm || 'pcs', label: ingUnit || 'pcs' }
  ];
}
