import {
  MenuItem,
  Ingredient,
  MenuConflictItem,
  IngredientConflictItem,
  DataFieldDiff,
  SyncConflictReport,
  ConflictType
} from '../types';

/**
 * Compare numbers with a small epsilon to avoid float rounding false positives
 */
function areFloatsDifferent(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) > epsilon;
}

/**
 * Format category label into Thai readable string
 */
function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    kaprao: 'กะเพราแท้โบราณ',
    stirfry: 'ผัดกระทะร้อน',
    curry: 'แกง & ต้มยำ',
    appetizer: 'ของทานเล่น',
    beverage: 'เครื่องดื่ม & ของหวาน',
    dessert: 'ของหวาน',
    meat: 'เนื้อสัตว์ & โปรตีน',
    produce: 'ผัก & สมุนไพร',
    sauce: 'ซอส & เครื่องปรุง',
    dry: 'ของแห้ง & ข้าว',
    packaging: 'บรรจุภัณฑ์',
    other: 'อื่นๆ'
  };
  return map[cat] || cat;
}

/**
 * Build diffs for two MenuItems
 */
export function diffMenuItems(local: MenuItem, cloud: MenuItem): DataFieldDiff[] {
  const diffs: DataFieldDiff[] = [];

  // Price
  if (areFloatsDifferent(local.price, cloud.price)) {
    diffs.push({
      fieldName: 'price',
      fieldLabel: 'ราคาขายหน้าร้าน',
      localValue: local.price,
      cloudValue: cloud.price,
      formattedLocal: `฿${local.price.toLocaleString()}`,
      formattedCloud: `฿${cloud.price.toLocaleString()}`
    });
  }

  // Cost Price
  if (areFloatsDifferent(local.costPrice || 0, cloud.costPrice || 0)) {
    diffs.push({
      fieldName: 'costPrice',
      fieldLabel: 'ต้นทุนอาหาร',
      localValue: local.costPrice || 0,
      cloudValue: cloud.costPrice || 0,
      formattedLocal: `฿${(local.costPrice || 0).toLocaleString()}`,
      formattedCloud: `฿${(cloud.costPrice || 0).toLocaleString()}`
    });
  }

  // Name
  if (local.name.trim() !== cloud.name.trim()) {
    diffs.push({
      fieldName: 'name',
      fieldLabel: 'ชื่อเมนู (ไทย)',
      localValue: local.name,
      cloudValue: cloud.name,
      formattedLocal: local.name,
      formattedCloud: cloud.name
    });
  }

  // Name EN
  if ((local.nameEn || '').trim() !== (cloud.nameEn || '').trim()) {
    diffs.push({
      fieldName: 'nameEn',
      fieldLabel: 'ชื่อเมนู (อังกฤษ)',
      localValue: local.nameEn || '-',
      cloudValue: cloud.nameEn || '-',
      formattedLocal: local.nameEn || '-',
      formattedCloud: cloud.nameEn || '-'
    });
  }

  // Category
  if (local.category !== cloud.category) {
    diffs.push({
      fieldName: 'category',
      fieldLabel: 'หมวดหมู่อาหาร',
      localValue: local.category,
      cloudValue: cloud.category,
      formattedLocal: formatCategory(local.category),
      formattedCloud: formatCategory(cloud.category)
    });
  }

  // Allow Add-ons
  const localAddons = local.allowAddOns !== false;
  const cloudAddons = cloud.allowAddOns !== false;
  if (localAddons !== cloudAddons) {
    diffs.push({
      fieldName: 'allowAddOns',
      fieldLabel: 'ตัวเลือกท็อปปิ้ง',
      localValue: localAddons,
      cloudValue: cloudAddons,
      formattedLocal: localAddons ? 'เปิดให้เลือกท็อปปิ้ง' : 'ปิดไม่ให้เลือก',
      formattedCloud: cloudAddons ? 'เปิดให้เลือกท็อปปิ้ง' : 'ปิดไม่ให้เลือก'
    });
  }

  // Recipe ingredients count
  const localRecipeCount = (local.recipe || []).length;
  const cloudRecipeCount = (cloud.recipe || []).length;
  if (localRecipeCount !== cloudRecipeCount) {
    diffs.push({
      fieldName: 'recipe',
      fieldLabel: 'สูตรตัดสต็อก (BOM)',
      localValue: localRecipeCount,
      cloudValue: cloudRecipeCount,
      formattedLocal: `${localRecipeCount} วัตถุดิบ`,
      formattedCloud: `${cloudRecipeCount} วัตถุดิบ`
    });
  }

  return diffs;
}

/**
 * Build diffs for two Ingredients
 */
export function diffIngredients(local: Ingredient, cloud: Ingredient): DataFieldDiff[] {
  const diffs: DataFieldDiff[] = [];

  // Current Stock
  if (areFloatsDifferent(local.currentStock, cloud.currentStock)) {
    diffs.push({
      fieldName: 'currentStock',
      fieldLabel: 'จำนวนสต็อกปัจจุบัน',
      localValue: local.currentStock,
      cloudValue: cloud.currentStock,
      formattedLocal: `${local.currentStock.toLocaleString()} ${local.unit}`,
      formattedCloud: `${cloud.currentStock.toLocaleString()} ${cloud.unit}`
    });
  }

  // Unit Cost
  if (areFloatsDifferent(local.unitCost, cloud.unitCost)) {
    diffs.push({
      fieldName: 'unitCost',
      fieldLabel: 'ราคาต้นทุนต่อหน่วย',
      localValue: local.unitCost,
      cloudValue: cloud.unitCost,
      formattedLocal: `฿${local.unitCost.toLocaleString()}/${local.unit}`,
      formattedCloud: `฿${cloud.unitCost.toLocaleString()}/${cloud.unit}`
    });
  }

  // Min Stock Alert
  if (areFloatsDifferent(local.minStockAlert, cloud.minStockAlert)) {
    diffs.push({
      fieldName: 'minStockAlert',
      fieldLabel: 'เกณฑ์เตือนสต็อกต่ำ',
      localValue: local.minStockAlert,
      cloudValue: cloud.minStockAlert,
      formattedLocal: `${local.minStockAlert.toLocaleString()} ${local.unit}`,
      formattedCloud: `${cloud.minStockAlert.toLocaleString()} ${cloud.unit}`
    });
  }

  // Unit
  if (local.unit !== cloud.unit) {
    diffs.push({
      fieldName: 'unit',
      fieldLabel: 'หน่วยนับ',
      localValue: local.unit,
      cloudValue: cloud.unit,
      formattedLocal: local.unit,
      formattedCloud: cloud.unit
    });
  }

  // Name
  if (local.name.trim() !== cloud.name.trim()) {
    diffs.push({
      fieldName: 'name',
      fieldLabel: 'ชื่อวัตถุดิบ',
      localValue: local.name,
      cloudValue: cloud.name,
      formattedLocal: local.name,
      formattedCloud: cloud.name
    });
  }

  // Category
  if (local.category !== cloud.category) {
    diffs.push({
      fieldName: 'category',
      fieldLabel: 'หมวดหมู่วัตถุดิบ',
      localValue: local.category,
      cloudValue: cloud.category,
      formattedLocal: formatCategory(local.category),
      formattedCloud: formatCategory(cloud.category)
    });
  }

  return diffs;
}

/**
 * Detect all conflicts between local state and cloud state
 */
export function detectSyncConflicts(
  localMenus: MenuItem[],
  cloudMenus: MenuItem[],
  localIngredients: Ingredient[],
  cloudIngredients: Ingredient[]
): SyncConflictReport {
  const menuConflicts: MenuConflictItem[] = [];
  const ingredientConflicts: IngredientConflictItem[] = [];

  // Map by ID
  const localMenuMap = new Map<string, MenuItem>();
  localMenus.forEach(m => localMenuMap.set(m.id, m));

  const cloudMenuMap = new Map<string, MenuItem>();
  cloudMenus.forEach(m => cloudMenuMap.set(m.id, m));

  // 1. Evaluate Menu Items
  // Check common & local-only
  localMenus.forEach(localItem => {
    const cloudItem = cloudMenuMap.get(localItem.id);
    if (cloudItem) {
      const diffs = diffMenuItems(localItem, cloudItem);
      if (diffs.length > 0) {
        menuConflicts.push({
          id: localItem.id,
          type: 'mismatch',
          title: localItem.name,
          localItem,
          cloudItem,
          diffs,
          choice: 'local' // default to local preservation
        });
      }
    } else {
      // Local only
      menuConflicts.push({
        id: localItem.id,
        type: 'local_only',
        title: localItem.name,
        localItem,
        diffs: [{
          fieldName: 'existence',
          fieldLabel: 'สถานะการมีอยู่',
          localValue: 'มีอยู่ในเครื่องสาขา',
          cloudValue: 'ยังไม่มีบนคลาวด์',
          formattedLocal: `พร้อมใช้งาน (ราคา ฿${localItem.price})`,
          formattedCloud: 'ไม่มีในฐานข้อมูลกลาง'
        }],
        choice: 'local' // default push to cloud
      });
    }
  });

  // Check cloud-only menus
  cloudMenus.forEach(cloudItem => {
    if (!localMenuMap.has(cloudItem.id)) {
      menuConflicts.push({
        id: cloudItem.id,
        type: 'cloud_only',
        title: cloudItem.name,
        cloudItem,
        diffs: [{
          fieldName: 'existence',
          fieldLabel: 'สถานะการมีอยู่',
          localValue: 'ไม่มีในเครื่องนี้',
          cloudValue: 'มีอยู่บนคลาวด์',
          formattedLocal: 'ไม่มีในรายการเครื่อง',
          formattedCloud: `มีบนคลาวด์ (ราคา ฿${cloudItem.price})`
        }],
        choice: 'cloud' // default import from cloud
      });
    }
  });

  // 2. Evaluate Ingredients
  const localIngMap = new Map<string, Ingredient>();
  localIngredients.forEach(i => localIngMap.set(i.id, i));

  const cloudIngMap = new Map<string, Ingredient>();
  cloudIngredients.forEach(i => cloudIngMap.set(i.id, i));

  // Check common & local-only
  localIngredients.forEach(localIng => {
    const cloudIng = cloudIngMap.get(localIng.id);
    if (cloudIng) {
      const diffs = diffIngredients(localIng, cloudIng);
      if (diffs.length > 0) {
        ingredientConflicts.push({
          id: localIng.id,
          type: 'mismatch',
          title: localIng.name,
          localIngredient: localIng,
          cloudIngredient: cloudIng,
          diffs,
          choice: 'local' // default to local preservation
        });
      }
    } else {
      ingredientConflicts.push({
        id: localIng.id,
        type: 'local_only',
        title: localIng.name,
        localIngredient: localIng,
        diffs: [{
          fieldName: 'existence',
          fieldLabel: 'สถานะการมีอยู่',
          localValue: 'มีอยู่ในคลังสาขานี้',
          cloudValue: 'ยังไม่มีบนคลาวด์',
          formattedLocal: `สต็อก ${localIng.currentStock} ${localIng.unit}`,
          formattedCloud: 'ไม่มีในฐานข้อมูลกลาง'
        }],
        choice: 'local' // default push to cloud
      });
    }
  });

  // Check cloud-only ingredients
  cloudIngredients.forEach(cloudIng => {
    if (!localIngMap.has(cloudIng.id)) {
      ingredientConflicts.push({
        id: cloudIng.id,
        type: 'cloud_only',
        title: cloudIng.name,
        cloudIngredient: cloudIng,
        diffs: [{
          fieldName: 'existence',
          fieldLabel: 'สถานะการมีอยู่',
          localValue: 'ไม่มีในคลังเครื่องนี้',
          cloudValue: 'มีอยู่บนคลาวด์',
          formattedLocal: 'ไม่มีในรายการคลัง',
          formattedCloud: `สต็อก ${cloudIng.currentStock} ${cloudIng.unit}`
        }],
        choice: 'cloud' // default import from cloud
      });
    }
  });

  const totalConflicts = menuConflicts.length + ingredientConflicts.length;

  return {
    hasConflicts: totalConflicts > 0,
    totalConflicts,
    menuConflicts,
    ingredientConflicts,
    detectedAt: new Date().toISOString()
  };
}
