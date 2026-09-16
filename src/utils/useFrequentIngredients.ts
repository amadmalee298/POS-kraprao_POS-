import { useState, useEffect, useMemo, useCallback } from 'react';
import { Ingredient, MenuItem, StockLot } from '../types';

const STORAGE_KEY_PINNED = 'POS_PINNED_INGREDIENTS';
const STORAGE_KEY_USAGE = 'POS_INGREDIENT_USAGE_COUNT';
const STORAGE_KEY_SORT_ENABLED = 'POS_SORT_FREQUENT_FIRST';

/**
 * Helper to get/set pinned ingredients and usage counts
 */
export function getSavedPinnedIngredientIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PINNED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getSavedUsageCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordIngredientUsageDirectly(ingredientId: string, amount: number = 1) {
  if (!ingredientId) return;
  try {
    const counts = getSavedUsageCounts();
    counts[ingredientId] = (counts[ingredientId] || 0) + amount;
    localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(counts));
  } catch (e) {
    console.warn('Failed to record ingredient usage', e);
  }
}

export function togglePinIngredientDirectly(ingredientId: string): boolean {
  if (!ingredientId) return false;
  try {
    const list = getSavedPinnedIngredientIds();
    const isPinned = list.includes(ingredientId);
    const updated = isPinned ? list.filter(id => id !== ingredientId) : [ingredientId, ...list];
    localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify(updated));
    return !isPinned;
  } catch (e) {
    console.warn('Failed to toggle pin', e);
    return false;
  }
}

export interface UseFrequentIngredientsOptions {
  ingredients: Ingredient[];
  menuItems?: MenuItem[];
  stockLots?: StockLot[];
  maxFrequentCount?: number;
}

export function useFrequentIngredients({
  ingredients,
  menuItems = [],
  stockLots = [],
  maxFrequentCount = 7
}: UseFrequentIngredientsOptions) {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getSavedPinnedIngredientIds());
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(() => getSavedUsageCounts());
  const [sortFrequentFirst, setSortFrequentFirstState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SORT_ENABLED);
      return saved !== null ? saved === 'true' : true; // Default ON
    } catch {
      return true;
    }
  });

  const setSortFrequentFirst = useCallback((val: boolean) => {
    setSortFrequentFirstState(val);
    try {
      localStorage.setItem(STORAGE_KEY_SORT_ENABLED, String(val));
    } catch {}
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const isAlready = prev.includes(id);
      const updated = isAlready ? prev.filter(x => x !== id) : [id, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const recordUsage = useCallback((id: string, amount: number = 1) => {
    if (!id) return;
    setUsageCounts(prev => {
      const updated = { ...prev, [id]: (prev[id] || 0) + amount };
      try {
        localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Compute baseline counts from recipe usage and stock lot occurrences
  const baselineScores = useMemo(() => {
    const scores: Record<string, number> = {};

    // 1. Check recipes in menuItems
    menuItems.forEach(item => {
      if (Array.isArray(item.recipe)) {
        item.recipe.forEach(r => {
          if (r.ingredientId) {
            scores[r.ingredientId] = (scores[r.ingredientId] || 0) + 3;
          }
        });
      }
    });

    // 2. Check stockLots
    stockLots.forEach(lot => {
      if (lot.ingredientId) {
        scores[lot.ingredientId] = (scores[lot.ingredientId] || 0) + 2;
      }
    });

    return scores;
  }, [menuItems, stockLots]);

  // Calculate composite score for each ingredient
  const ingredientScores = useMemo(() => {
    const scoreMap: Record<string, number> = {};
    ingredients.forEach(ing => {
      let score = 0;
      // High weight for pinned items
      if (pinnedIds.includes(ing.id) || ing.isFrequent) {
        const pinRank = pinnedIds.includes(ing.id) ? pinnedIds.indexOf(ing.id) : 0;
        score += 10000 - pinRank * 10;
      }
      // User manual / expense usage count
      const usage = usageCounts[ing.id] || 0;
      score += usage * 10;
      // Baseline usage from recipes and stock
      score += baselineScores[ing.id] || 0;

      scoreMap[ing.id] = score;
    });
    return scoreMap;
  }, [ingredients, pinnedIds, usageCounts, baselineScores]);

  // Sort ingredients: frequent & pinned first
  const sortedIngredients = useMemo(() => {
    if (!sortFrequentFirst) {
      return [...ingredients];
    }

    return [...ingredients].sort((a, b) => {
      const scoreA = ingredientScores[a.id] || 0;
      const scoreB = ingredientScores[b.id] || 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }

      // Default alphabetical fallback
      return (a.name || '').localeCompare(b.name || '', 'th');
    });
  }, [ingredients, ingredientScores, sortFrequentFirst]);

  // Top frequent ingredients for quick chips and optgroup
  const frequentIngredients = useMemo(() => {
    if (sortedIngredients.length === 0) return [];
    // Include all pinned items + top items with score > 0, up to maxFrequentCount
    const list = sortedIngredients.filter(ing => {
      const score = ingredientScores[ing.id] || 0;
      return pinnedIds.includes(ing.id) || ing.isFrequent || score > 0;
    });

    // If none have positive score, take the first min(maxFrequentCount, ingredients.length)
    if (list.length === 0) {
      return sortedIngredients.slice(0, Math.min(maxFrequentCount, sortedIngredients.length));
    }

    return list.slice(0, maxFrequentCount);
  }, [sortedIngredients, ingredientScores, pinnedIds, maxFrequentCount]);

  // Remaining ingredients that are not in the frequent list
  const otherIngredients = useMemo(() => {
    const frequentIdSet = new Set(frequentIngredients.map(f => f.id));
    return sortedIngredients.filter(ing => !frequentIdSet.has(ing.id));
  }, [sortedIngredients, frequentIngredients]);

  return {
    sortedIngredients,
    frequentIngredients,
    otherIngredients,
    pinnedIds,
    isPinned,
    togglePin,
    recordUsage,
    sortFrequentFirst,
    setSortFrequentFirst,
    getIngredientScore: (id: string) => ingredientScores[id] || 0
  };
}
