import { useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useKeyedList } from '../../hooks/useKeyedList';
import type { PrepRecipe } from '../../types';
import { prepEstimatedCosts } from '../../utils/prep';

/**
 * Items made in the kitchen (ซอสกะเพรา, ข้าวหอม…) get their cost from their prep recipe while none
 * is in stock, so the dishes using them are costed before the first run (and follow recipe or
 * price changes). A run sets the real cost; this leaves items in stock alone.
 */
export function PrepCostSync() {
  const { ingredients, updateIngredient, currentUser, isStorageLoaded } = usePOS();
  const [recipes] = useKeyedList<PrepRecipe>('prep_recipes', 'POS_PREP_RECIPES', undefined);

  useEffect(() => {
    if (!currentUser || !isStorageLoaded || recipes.length === 0) return;
    const t = setTimeout(() => {
      const estimates = prepEstimatedCosts(recipes, ingredients);
      estimates.forEach((cost, id) => {
        const item = ingredients.find(i => i.id === id);
        if (!item) return;
        const current = item.unitCost || 0;
        // Small differences are left alone so devices do not keep rewriting each other
        if (Math.abs(current - cost) <= Math.max(0.0001, cost * 0.005)) return;
        updateIngredient({ ...item, unitCost: cost });
      });
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, ingredients, currentUser?.id, isStorageLoaded]);

  return null;
}
