import { CategoryItem, IngredientCategory, MenuItem, Ingredient } from '../types';
import { DEFAULT_CATEGORIES } from '../data/initialData';

/**
 * Checks if a menu item matches a selected category ID or category name.
 * Strictly checks for ID match, Name match, and canonical default system pairings.
 * Does NOT perform fuzzy cross-category matching that conflates distinct categories (e.g. drinks vs dessert).
 */
export const isItemInCategory = (
  item: MenuItem,
  catId: string,
  categories: CategoryItem[] = []
): boolean => {
  if (!catId || catId === 'all') return true;
  if (!item || !item.category) return false;

  const itemCat = String(item.category).trim();
  const targetId = String(catId).trim();

  // 1. Direct ID or String match
  if (itemCat === targetId) return true;
  if (itemCat.toLowerCase() === targetId.toLowerCase()) return true;

  // 2. Find target category object from system categories list
  const targetCat = categories.find(
    c => c.id.toLowerCase() === targetId.toLowerCase() || c.name.toLowerCase() === targetId.toLowerCase()
  );

  if (targetCat) {
    if (itemCat.toLowerCase() === targetCat.name.toLowerCase()) return true;
    if (itemCat.toLowerCase() === targetCat.id.toLowerCase()) return true;
  }

  // 3. Find if item.category is an ID matching a category object in categories
  const itemCatObj = categories.find(
    c => c.id.toLowerCase() === itemCat.toLowerCase() || c.name.toLowerCase() === itemCat.toLowerCase()
  );
  if (itemCatObj) {
    if (itemCatObj.id.toLowerCase() === targetId.toLowerCase()) return true;
    if (itemCatObj.name.toLowerCase() === targetId.toLowerCase()) return true;
    if (targetCat && itemCatObj.id.toLowerCase() === targetCat.id.toLowerCase()) return true;
    if (targetCat && itemCatObj.name.toLowerCase() === targetCat.name.toLowerCase()) return true;
  }

  // 4. Canonical Default System Pairings (ID <-> Display Name)
  const itemLower = itemCat.toLowerCase();
  const targetLower = targetId.toLowerCase();

  // Kaprao / กะเพราโบราณ
  if (
    (targetLower === 'kaprao' || targetLower === 'กะเพราโบราณ') &&
    (itemLower === 'kaprao' || itemLower === 'กะเพราโบราณ')
  ) {
    return true;
  }

  // Fry & Soup / เมนูผัด/ต้ม
  if (
    (targetLower === 'fry_soup' || targetLower === 'เมนูผัด/ต้ม' || targetLower === 'ผัด/ต้ม') &&
    (itemLower === 'fry_soup' || itemLower === 'เมนูผัด/ต้ม' || itemLower === 'ผัด/ต้ม')
  ) {
    return true;
  }

  // Drinks & Dessert / เครื่องดื่ม & ขนม
  if (
    (targetLower === 'drinks_dessert' || targetLower === 'เครื่องดื่ม & ขนม' || targetLower === 'เครื่องดื่ม & ของหวาน') &&
    (itemLower === 'drinks_dessert' || itemLower === 'เครื่องดื่ม & ขนม' || itemLower === 'เครื่องดื่ม & ของหวาน')
  ) {
    return true;
  }

  // Special / เมนูพิเศษ
  if (
    (targetLower === 'special' || targetLower === 'เมนูพิเศษ') &&
    (itemLower === 'special' || itemLower === 'เมนูพิเศษ')
  ) {
    return true;
  }

  return false;
};

/**
 * Ensures all existing categories and all categories used by menu items are preserved and present.
 * Never destroys existing categories or forcefully overwrites custom names.
 */
export const syncAndHealCategories = (
  existingCategories: CategoryItem[] = [],
  currentMenuItems: MenuItem[] = []
): CategoryItem[] => {
  const categoryMap = new Map<string, CategoryItem>();

  // 1. Add all existing categories first (preserve exact IDs and names)
  if (Array.isArray(existingCategories) && existingCategories.length > 0) {
    existingCategories.forEach(cat => {
      if (cat && cat.id && cat.name) {
        const key = cat.id.toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, {
            id: cat.id,
            name: cat.name.trim(),
            icon: cat.icon || 'Tag'
          });
        }
      }
    });
  } else {
    // If no existing categories exist at all, seed with default categories
    DEFAULT_CATEGORIES.forEach(cat => {
      categoryMap.set(cat.id.toLowerCase(), { ...cat });
    });
  }

  // 2. Scan all menu items and ensure their category has a corresponding entry in the list
  if (Array.isArray(currentMenuItems)) {
    currentMenuItems.forEach(item => {
      if (!item || !item.category) return;
      const catKey = String(item.category).trim();
      if (!catKey) return;

      // Check if this category is already represented by ID or Name
      let found = false;
      for (const existing of categoryMap.values()) {
        if (
          existing.id.toLowerCase() === catKey.toLowerCase() ||
          existing.name.toLowerCase() === catKey.toLowerCase()
        ) {
          found = true;
          break;
        }
      }

      if (!found) {
        // Auto-discover friendly name and icon for newly encountered category
        let name = catKey;
        let icon = 'Tag';
        const lower = catKey.toLowerCase();

        if (lower === 'kaprao' || lower === 'กะเพรา') {
          name = 'กะเพราโบราณ';
          icon = 'Flame';
        } else if (lower === 'fry_soup' || lower === 'ผัด_ต้ม') {
          name = 'เมนูผัด/ต้ม';
          icon = 'Utensils';
        } else if (lower === 'drinks_dessert' || lower === 'drinks') {
          name = 'เครื่องดื่ม & ขนม';
          icon = 'CupSoda';
        } else if (lower === 'special' || lower === 'แนะนำ') {
          name = 'เมนูพิเศษ';
          icon = 'Sparkles';
        } else if (lower.includes('เครื่องดื่ม') || lower.includes('น้ำ') || lower.includes('beverage')) {
          icon = 'CupSoda';
        } else if (lower.includes('ของหวาน') || lower.includes('ขนม') || lower.includes('dessert') || lower.includes('ไอศกรีม')) {
          icon = 'IceCream';
        } else if (lower.includes('ต้ม') || lower.includes('แกง') || lower.includes('soup')) {
          icon = 'Soup';
        } else if (lower.includes('ผัด') || lower.includes('กระทะ')) {
          icon = 'Flame';
        } else if (lower.includes('ไข่') || lower.includes('egg') || lower.includes('topping')) {
          icon = 'Egg';
        } else if (lower.includes('ทานเล่น') || lower.includes('snack') || lower.includes('appetizer')) {
          icon = 'Cookie';
        }

        // Generate clean ID without mangling unicode/Thai text
        const safeId = /^[a-zA-Z0-9_-]+$/.test(catKey)
          ? catKey
          : `cat-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

        categoryMap.set(safeId.toLowerCase(), {
          id: safeId,
          name,
          icon
        });
      }
    });
  }

  return Array.from(categoryMap.values());
};

/**
 * Synchronizes ingredient categories with all categories present in ingredients,
 * ensuring no categories are lost.
 */
export const syncAndHealIngredientCategories = (
  existingCategories: IngredientCategory[] = [],
  ingredients: Ingredient[] = []
): IngredientCategory[] => {
  const defaultIngCats: IngredientCategory[] = [
    { id: 'meat', name: 'เนื้อสัตว์', icon: '🥩' },
    { id: 'vegetable', name: 'ผักสด', icon: '🥦' },
    { id: 'sauce', name: 'ซอส/เครื่องปรุง', icon: '🍾' },
    { id: 'egg', name: 'ไข่สด', icon: '🥚' },
    { id: 'dry_good', name: 'ของแห้ง', icon: '🌾' },
    { id: 'beverage', name: 'เครื่องดื่ม/ไซรัป', icon: '🥤' },
    { id: 'seafood', name: 'อาหารทะเล/ซีฟู้ด', icon: '🦐' },
    { id: 'packaging', name: 'บรรจุภัณฑ์', icon: '📦' },
  ];

  const catMap = new Map<string, IngredientCategory>();

  if (Array.isArray(existingCategories) && existingCategories.length > 0) {
    existingCategories.forEach(c => {
      if (c && c.id && c.name) {
        catMap.set(c.id.toLowerCase(), { ...c });
      }
    });
  } else {
    defaultIngCats.forEach(c => catMap.set(c.id.toLowerCase(), { ...c }));
  }

  if (Array.isArray(ingredients)) {
    ingredients.forEach(ing => {
      if (!ing || !ing.category) return;
      const catKey = String(ing.category).trim();
      if (!catKey) return;

      let found = false;
      for (const existing of catMap.values()) {
        if (
          existing.id.toLowerCase() === catKey.toLowerCase() ||
          existing.name.toLowerCase() === catKey.toLowerCase()
        ) {
          found = true;
          break;
        }
      }

      if (!found) {
        const safeId = /^[a-zA-Z0-9_-]+$/.test(catKey)
          ? catKey
          : `ingcat-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

        catMap.set(safeId.toLowerCase(), {
          id: safeId,
          name: catKey,
          icon: '🏷️'
        });
      }
    });
  }

  return Array.from(catMap.values());
};
