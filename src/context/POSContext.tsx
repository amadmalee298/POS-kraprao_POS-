import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { calcRecipeItemCostAndDeduction } from '../utils/recipeUtils';
import { syncAndHealCategories, syncAndHealIngredientCategories } from '../utils/categoryUtils';
import {
  MenuItem,
  Ingredient,
  StockLot,
  Order,
  Expense,
  OtherIncome,
  Branch,
  User,
  UserRole,
  SystemSettings,
  CartItem,
  SpiceLevel,
  ProteinChoice,
  AddOnOption,
  RecipeIngredient,
  PaymentMethod,
  OrderStatus,
  OrderType,
  CustomerTaxInfo,
  ActiveTab,
  WasteLog,
  StaffMember,
  ShiftEntry,
  ShiftSwapRequest,
  CashShift,
  CashMovement,
  SecurityLogEntry,
  StockAdjustmentLog,
  CategoryItem,
  IngredientCategory,
  IngredientUnitItem,
  CentralBranchLiveStats,
  FirebaseSyncState,
  SyncConflictReport,
  ConflictResolutionChoice
} from '../types';
import { detectSyncConflicts } from '../utils/conflictDetector';
import {
  syncBranchToFirestore,
  syncOrderToFirestore,
  syncOrdersBatchToFirestore,
  syncInventoryToFirestore,
  syncStockAdjustmentToFirestore,
  syncWasteLogToFirestore,
  subscribeToCentralBranches,
  isFirebaseAvailable,
  syncExpenseToFirestore,
  deleteExpenseFromFirestore,
  syncIncomeToFirestore,
  deleteIncomeFromFirestore,
  subscribeToCentralExpenses,
  subscribeToCentralIncomes,
  subscribeToRecentCentralOrders,
  fetchCentralOrdersFromFirestore,
  syncIngredientToFirestore,
  deleteIngredientFromFirestore,
  fetchBranchInventoryFromFirestore,
  fetchMenuItemsFromFirestore,
  syncSingleMenuItemToFirestore,
  syncMenuItemsBatchToFirestore,
  deleteMenuItemFromFirestore,
  updateOrderStatusInFirestore,
  fetchBranchesFromFirestore,
  syncCategoriesToFirestore,
  deleteCategoryFromFirestore,
  syncTablesToFirestore,
  syncAddOnsToFirestore,
  syncSettingsToFirestore,
  syncFullCatalogToFirestore,
  purgeOutdatedCloudData,
  subscribeToMenuItems,
  subscribeToBranchInventory,
  subscribeToDeletedRecords
} from '../services/firebaseService';
import {
  getStoredTriggers,
  getStoredRules,
  dispatchNotification,
  generateDailySummaryMessage,
  generateNewOrderMessage,
  generateVoidOrderMessage,
  generateLowStockMessage
} from '../services/notificationService';
import {
  INITIAL_BRANCHES,
  INITIAL_USERS,
  INITIAL_INGREDIENTS,
  INITIAL_STOCK_LOTS,
  INITIAL_MENU_ITEMS,
  STANDARD_ADD_ONS,
  INITIAL_EXPENSES,
  INITIAL_INCOMES,
  INITIAL_ORDERS,
  INITIAL_SETTINGS,
  INITIAL_WASTE_LOGS,
  INITIAL_STAFF_MEMBERS,
  INITIAL_SHIFTS,
  INITIAL_SHIFT_SWAP_REQUESTS,
  INITIAL_CASH_SHIFTS,
  INITIAL_SECURITY_LOGS,
  INITIAL_STOCK_ADJUSTMENT_LOGS,
  DEFAULT_CATEGORIES
} from '../data/initialData';
import { calculateOrderTotals } from '../utils/tax';
import { crc16 } from '../utils/promptpay';
import { SHOP_LOGO_URL } from '../assets/logo';

export function computeOrderChecksum(order: Order): string {
  const itemsCount = order.items ? order.items.length : 0;
  const rawStr = `${order.id}:${order.orderNumber || ''}:${order.grandTotal.toFixed(2)}:${itemsCount}:${order.createdAt || ''}:${order.paymentMethod}`;
  return crc16(rawStr);
}

interface DiscountState {
  amount: number;
  type: 'fixed' | 'percent';
  note?: string;
}

interface POSContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  currentBranch: Branch;
  setCurrentBranch: (branch: Branch) => void;
  branches: Branch[];
  updateBranch: (branch: Branch) => void;
  addBranch: (branchData: Omit<Branch, 'id'>) => void;
  deleteBranch: (branchId: string) => void;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  updateUserPin: (userId: string, newPin: string) => void;
  menuItems: MenuItem[];
  addOns: AddOnOption[];
  ingredients: Ingredient[];
  stockLots: StockLot[];
  orders: Order[];
  expenses: Expense[];
  incomes: OtherIncome[];
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  autoApproveQR: boolean;
  setAutoApproveQR: (val: boolean) => void;
  tables: string[];
  setTables: React.Dispatch<React.SetStateAction<string[]>>;
  addTable: (tableName: string) => void;
  updateTable: (oldName: string, newName: string) => void;
  deleteTable: (tableName: string) => void;
  
  // Category CRUD
  categories: CategoryItem[];
  addCategory: (name: string, icon?: string) => void;
  updateCategory: (id: string, name: string, icon?: string) => void;
  deleteCategory: (id: string) => void;
  getCategoryName: (id: string) => string;
  syncCategoriesFromMenu: () => void;

  // Ingredient Category CRUD
  ingredientCategories: IngredientCategory[];
  addIngredientCategory: (name: string, icon?: string) => void;
  updateIngredientCategory: (id: string, name: string, icon?: string) => void;
  deleteIngredientCategory: (id: string) => void;

  // Ingredient Unit CRUD
  ingredientUnits: IngredientUnitItem[];
  addIngredientUnit: (unit: { id?: string; name: string; symbol: string; label?: string }) => void;
  updateIngredientUnit: (id: string, nameOrData: string | { name?: string; symbol?: string; label?: string }, symbol?: string) => void;
  deleteIngredientUnit: (id: string) => void;
  resetIngredientUnits: () => void;

  // Menu item CRUD
  addMenuItem: (itemData: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (item: MenuItem) => void;
  deleteMenuItem: (itemId: string) => void;
  updateMenuItemRecipe: (menuItemId: string, recipe: RecipeIngredient[], costPrice: number) => void;
  toggleMenuItemAddOns: (menuItemId: string, allow?: boolean) => void;

  // AddOn / Topping CRUD
  addAddOn: (addonData: Omit<AddOnOption, 'id'>) => void;
  updateAddOn: (addon: AddOnOption) => void;
  deleteAddOn: (addonId: string) => void;
  
  // Cart operations
  cart: CartItem[];
  addToCart: (
    item: MenuItem,
    quantity?: number,
    spiceLevel?: SpiceLevel,
    proteinChoice?: { name: ProteinChoice; extraPrice: number },
    addOns?: AddOnOption[],
    specialNotes?: string
  ) => void;
  updateCartQuantity: (cartItemId: string, delta: number) => void;
  setCartItemQuantity: (cartItemId: string, exactQty: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  discount: DiscountState;
  setDiscount: React.Dispatch<React.SetStateAction<DiscountState>>;
  
  // Order checkout
  createOrder: (
    paymentMethod: PaymentMethod,
    tenderedAmount: number,
    orderType: OrderType,
    tableNumber?: string,
    taxInvoiceCustomer?: CustomerTaxInfo,
    isFullTaxInvoiceRequested?: boolean
  ) => Order;
  createDirectOrder: (
    items: CartItem[],
    tableNumber: string,
    orderType?: OrderType,
    notes?: string,
    initialStatus?: OrderStatus,
    customerNickname?: string,
    paymentMethod?: PaymentMethod
  ) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  cancelOrder: (
    orderId: string,
    reason: string,
    note?: string,
    cancelledBy?: { userId?: string; userName: string; role: string }
  ) => void;
  updateOrderTaxInfo: (orderId: string, taxInfo: CustomerTaxInfo) => void;
  addTaxInvoiceOrder: (newOrder: Order) => void;

  // Inventory operations
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => Ingredient;
  updateIngredient: (ingredient: Ingredient) => void;
  deleteIngredients: (ingredientIds: string[]) => void;
  bulkUpdateIngredients: (ingredientIds: string[], updates: Partial<Omit<Ingredient, 'id'>>) => void;
  updateIngredientStock: (ingredientId: string, newStock: number) => void;
  updateIngredientPriceAndRecalculate: (
    ingredientId: string,
    newUnitCost: number,
    updatedMenuPrices?: Record<string, number>
  ) => void;
  addStockLot: (lot: Omit<StockLot, 'id'>) => void;

  // Waste Log operations
  wasteLogs: WasteLog[];
  addWasteLog: (log: Omit<WasteLog, 'id'>) => void;
  deleteWasteLog: (logId: string) => void;

  // Stock Adjustment Log operations
  stockAdjustmentLogs: StockAdjustmentLog[];
  addStockAdjustmentLog: (entry: Omit<StockAdjustmentLog, 'id' | 'timestamp'>) => void;
  recordStockAdjustment: (
    ingredientId: string,
    newStock: number,
    reason: string,
    notes?: string,
    userName?: string,
    userRole?: string
  ) => void;
  clearStockAdjustmentLogs: () => void;
  deleteStockAdjustmentLog: (logId: string) => void;

  // Staff Scheduling & Roster operations
  staffMembers: StaffMember[];
  shifts: ShiftEntry[];
  shiftSwapRequests: ShiftSwapRequest[];
  addStaffMember: (staff: Omit<StaffMember, 'id'>) => void;
  updateStaffMember: (staff: StaffMember) => void;
  deleteStaffMember: (staffId: string) => void;
  addShift: (shift: Omit<ShiftEntry, 'id'>) => void;
  updateShift: (shift: ShiftEntry) => void;
  deleteShift: (shiftId: string) => void;
  saveWeeklyRoster: (newShifts: ShiftEntry[]) => void;
  addShiftSwapRequest: (req: Omit<ShiftSwapRequest, 'id' | 'createdAt' | 'status'>) => void;
  approveShiftSwapRequest: (requestId: string, managerComment?: string) => void;
  rejectShiftSwapRequest: (requestId: string, managerComment?: string) => void;

  // Cash Shift Management
  cashShifts: CashShift[];
  currentOpenShift: CashShift | null;
  openCashShift: (startingFloat: number, openedBy: string, notes?: string) => CashShift;
  closeCashShift: (actualCashBalance: number, closedBy: string, closingNotes?: string) => CashShift;
  addCashMovement: (type: 'cash_in' | 'cash_out', amount: number, reason: string, recordedBy: string) => void;
  deleteCashShift: (shiftId: string) => void;

  // Accounting operations
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  deleteExpense: (expenseId: string) => void;
  addIncome: (income: Omit<OtherIncome, 'id'>) => void;
  updateIncome: (incomeOrId: string | OtherIncome, updates?: Partial<OtherIncome>) => void;
  deleteIncome: (incomeId: string) => void;

  // System Backup / Import / Export
  exportStateJSON: () => string;
  importStateJSON: (jsonString: string) => boolean;
  resetToDefaultData: () => void;
  cleanSlateForProduction: () => void;
  
  // Security Logs & PIN Audit
  securityLogs: SecurityLogEntry[];
  logSecurityEvent: (entry: Omit<SecurityLogEntry, 'id' | 'timestamp'>) => void;
  clearSecurityLogs: () => void;
  deleteSecurityLog: (logId: string) => void;

  // Sound trigger for KDS
  playKitchenChime: () => void;

  // Offline PWA & Storage Sync
  isStorageLoaded: boolean;
  isOffline: boolean;
  forceOfflineMode: boolean;
  setForceOfflineMode: (val: boolean) => void;
  lastSyncedAt: string | null;
  pendingOfflineCount: number;
  syncOfflineQueue: () => void;

  // Firebase Cloud & Multi-Branch Real-Time Synchronization
  firebaseSyncState: FirebaseSyncState;
  centralBranchesLive: Record<string, CentralBranchLiveStats>;
  pushAllBranchDataToCloud: () => Promise<boolean>;
  cleanAndSyncCloudNow: (options?: { purgeCloud?: boolean }) => Promise<{
    success: boolean;
    message: string;
    details?: {
      ordersSynced: number;
      menuSynced: number;
      menuDeleted: number;
      inventorySynced: number;
      inventoryDeleted: number;
      categoriesSynced: number;
      tablesSynced: number;
    };
  }>;
  pullCloudOrders: () => Promise<{ count: number; success: boolean }>;
  pullCloudAllData: () => Promise<{ ordersCount: number; ingredientsCount: number; menuItemsCount: number; success: boolean }>;

  // Conflict Resolution
  conflictReport: SyncConflictReport | null;
  isConflictResolverOpen: boolean;
  isScanningConflicts: boolean;
  isResolvingConflicts: boolean;
  scanForSyncConflicts: () => Promise<SyncConflictReport>;
  openConflictResolver: () => void;
  closeConflictResolver: () => void;
  applyConflictResolutions: (resolutions: {
    menuChoices: Record<string, ConflictResolutionChoice>;
    ingredientChoices: Record<string, ConflictResolutionChoice>;
  }) => Promise<boolean>;

  // Real-Time Notification Service
  sendDailySummaryNotification: (channel?: 'telegram' | 'line' | 'both') => Promise<{ success: boolean; summary: string }>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kaprao_pos_enterprise_v1';

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Default to true: ทุกครั้งที่เปิดระบบ ต้องใส่รหัสพนักงาน (PIN) เพื่อเข้าสู่ระบบ
  const [isLocked, setIsLocked] = useState(true);
  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);

  const updateUserPin = (userId: string, newPin: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, pin: newPin } : u));
    setStaffMembers(prev => prev.map(s => s.id === userId ? { ...s, pin: newPin } : s));
    if (currentUser?.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, pin: newPin } : prev);
    }
  };
  
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);

  const DEFAULT_INGREDIENT_UNITS: IngredientUnitItem[] = [
    { id: 'kg', name: 'กิโลกรัม', symbol: 'kg', label: 'กิโลกรัม (kg)', isDefault: true },
    { id: 'g', name: 'กรัม', symbol: 'g', label: 'กรัม (g)', isDefault: true },
    { id: 'l', name: 'ลิตร', symbol: 'l', label: 'ลิตร (l)', isDefault: true },
    { id: 'ml', name: 'มิลลิลิตร', symbol: 'ml', label: 'มิลลิลิตร (ml)', isDefault: true },
    { id: 'pcs', name: 'ฟอง / ชิ้น', symbol: 'pcs', label: 'ฟอง/ชิ้น (pcs)', isDefault: true },
    { id: 'pack', name: 'แพ็ค / ห่อ', symbol: 'pack', label: 'แพ็ค/ห่อ (pack)', isDefault: true },
    { id: 'bottle', name: 'ขวด', symbol: 'ขวด', label: 'ขวด (bottle)', isDefault: true },
    { id: 'can', name: 'กระป๋อง', symbol: 'กระป๋อง', label: 'กระป๋อง (can)', isDefault: true },
    { id: 'bag', name: 'ถุง / กระสอบ', symbol: 'ถุง', label: 'ถุง (bag)', isDefault: true },
    { id: 'bunch', name: 'มัด / กำ', symbol: 'กำ', label: 'มัด/กำ (bunch)', isDefault: true },
    { id: 'tray', name: 'แผง', symbol: 'แผง', label: 'แผง (tray)', isDefault: true },
    { id: 'box', name: 'ลัง / กล่อง', symbol: 'ลัง', label: 'ลัง/กล่อง (box)', isDefault: true },
    { id: 'cup', name: 'ถ้วย / แก้ว', symbol: 'ถ้วย', label: 'ถ้วย/แก้ว (cup)', isDefault: true },
    { id: 'portion', name: 'จาน / ที่', symbol: 'ที่', label: 'จาน/ที่ (portion)', isDefault: true },
    { id: 'roll', name: 'ม้วน', symbol: 'ม้วน', label: 'ม้วน (roll)', isDefault: true },
  ];

  const [ingredientUnits, setIngredientUnits] = useState<IngredientUnitItem[]>(DEFAULT_INGREDIENT_UNITS);

  const addIngredientUnit = (unitData: { id?: string; name: string; symbol: string; label?: string }) => {
    const nameTrimmed = unitData.name.trim();
    const symbolTrimmed = (unitData.symbol || unitData.name).trim();
    if (!nameTrimmed) return;
    const newId = unitData.id || `unit-${Date.now()}`;
    const newLabel = unitData.label || `${nameTrimmed} (${symbolTrimmed})`;
    setIngredientUnits(prev => {
      if (prev.some(u => u.id === newId || u.symbol.toLowerCase() === symbolTrimmed.toLowerCase() || u.name === nameTrimmed)) {
        return prev;
      }
      return [...prev, { id: newId, name: nameTrimmed, symbol: symbolTrimmed, label: newLabel, isDefault: false }];
    });
  };

  const updateIngredientUnit = (
    id: string,
    nameOrData: string | { name?: string; symbol?: string; label?: string },
    symbol?: string
  ) => {
    let nameTrimmed = '';
    let symbolTrimmed = '';
    let customLabel = '';

    if (typeof nameOrData === 'string') {
      nameTrimmed = nameOrData.trim();
      symbolTrimmed = (symbol || nameOrData).trim();
    } else if (nameOrData) {
      nameTrimmed = (nameOrData.name || '').trim();
      symbolTrimmed = (nameOrData.symbol || nameTrimmed).trim();
      customLabel = nameOrData.label || '';
    }

    if (!nameTrimmed) return;
    const finalLabel = customLabel || `${nameTrimmed} (${symbolTrimmed})`;

    setIngredientUnits(prev =>
      prev.map(u =>
        u.id === id
          ? {
              ...u,
              name: nameTrimmed,
              symbol: symbolTrimmed,
              label: finalLabel
            }
          : u
      )
    );
  };

  const deleteIngredientUnit = (id: string) => {
    if (ingredientUnits.length <= 1) {
      alert('ต้องมีหน่วยนับในระบบอย่างน้อย 1 หน่วย');
      return;
    }
    setIngredientUnits(prev => prev.filter(u => u.id !== id));
  };

  const resetIngredientUnits = () => {
    setIngredientUnits(DEFAULT_INGREDIENT_UNITS);
  };

  // Ingredient Categories state & CRUD
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([
    { id: 'meat', name: 'เนื้อสัตว์', icon: '🥩' },
    { id: 'vegetable', name: 'ผักสด', icon: '🥦' },
    { id: 'sauce', name: 'ซอส/เครื่องปรุง', icon: '🍾' },
    { id: 'egg', name: 'ไข่สด', icon: '🥚' },
    { id: 'dry_good', name: 'ของแห้ง', icon: '🌾' },
    { id: 'beverage', name: 'เครื่องดื่ม/ไซรัป', icon: '🥤' },
    { id: 'seafood', name: 'อาหารทะเล/ซีฟู้ด', icon: '🦐' },
    { id: 'packaging', name: 'บรรจุภัณฑ์', icon: '📦' },
  ]);

  const addIngredientCategory = (name: string, icon?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = ingredientCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const newCat: IngredientCategory = {
      id: `ingcat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmed,
      icon: icon || '🏷️'
    };
    setIngredientCategories(prev => [...prev, newCat]);
  };

  const updateIngredientCategory = (id: string, name: string, icon?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIngredientCategories(prev => prev.map(c => c.id === id ? { ...c, name: trimmed, icon: icon || c.icon } : c));
  };

  const deleteIngredientCategory = (id: string) => {
    if (ingredientCategories.length <= 1) {
      alert('ไม่สามารถลบหมวดหมู่วัตถุดิบทั้งหมดได้ ต้องมีอย่างน้อย 1 หมวดหมู่ในระบบ');
      return;
    }
    const target = ingredientCategories.find(c => c.id === id);
    if (!target) return;
    const remaining = ingredientCategories.filter(c => c.id !== id);
    const fallbackCatId = remaining[0]?.id || 'dry_good';
    setIngredientCategories(remaining);
    setIngredients(prev => prev.map(ing => ing.category === id || ing.category === target.name ? { ...ing, category: fallbackCatId } : ing));
  };

  const addCategory = (name: string, icon?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newCat: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: trimmed,
      icon: icon || 'Tag'
    };
    setCategories(prev => {
      const next = [...prev, newCat];
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncCategoriesToFirestore(next, currentBranch.id).catch(err => {
          console.warn('[POS Category Sync] Failed to sync added category:', err);
        });
      }
      return next;
    });
  };

  const updateCategory = (id: string, name: string, icon?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name: trimmed, icon: icon || c.icon } : c);
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncCategoriesToFirestore(next, currentBranch.id).catch(err => {
          console.warn('[POS Category Sync] Failed to sync updated category:', err);
        });
      }
      return next;
    });
  };

  const deleteCategory = (id: string) => {
    if (categories.length <= 1) {
      alert('ไม่สามารถลบหมวดหมู่ทั้งหมดได้ ต้องมีอย่างน้อย 1 หมวดหมู่ในระบบ');
      return;
    }
    const remaining = categories.filter(c => c.id !== id);
    const fallbackCatId = remaining[0]?.id || 'kaprao';
    setCategories(remaining);
    setMenuItems(prev => {
      const updatedMenus = prev.map(m => m.category === id ? { ...m, category: fallbackCatId } : m);
      if (isFirebaseAvailable() && !effectiveOffline) {
        // Sync affected menu items
        updatedMenus.filter(m => m.category === fallbackCatId).forEach(item => {
          syncSingleMenuItemToFirestore(item).catch(console.warn);
        });
      }
      return updatedMenus;
    });

    if (isFirebaseAvailable() && !effectiveOffline) {
      deleteCategoryFromFirestore(id, currentBranch.id).catch(err => {
        console.warn('[POS Category Sync] Failed to delete category from Cloud:', err);
      });
      syncCategoriesToFirestore(remaining, currentBranch.id).catch(console.warn);
    }
  };

  const getCategoryName = (id: string): string => {
    const found = categories.find(c => c.id === id || c.name === id);
    if (found) return found.name;
    if (id === 'kaprao') return 'กะเพราโบราณ';
    if (id === 'fry_soup') return 'เมนูผัด/ต้ม';
    if (id === 'drinks_dessert') return 'เครื่องดื่ม & ขนม';
    if (id === 'special') return 'เมนูพิเศษ';
    return id || 'ทั่วไป';
  };

  const syncCategoriesFromMenu = () => {
    setCategories(prev => syncAndHealCategories(prev, menuItems));
    setIngredientCategories(prev => syncAndHealIngredientCategories(prev, ingredients));
  };

  const [deletedMenuItemIds, setDeletedMenuItemIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('POS_DELETED_MENU_IDS');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [deletedIngredientIds, setDeletedIngredientIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('POS_DELETED_ING_IDS');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      const storedDeleted = localStorage.getItem('POS_DELETED_MENU_IDS');
      const delList: string[] = storedDeleted ? JSON.parse(storedDeleted) : [];
      const delSet = new Set(delList.map(s => String(s).trim().toLowerCase()));
      return INITIAL_MENU_ITEMS.filter(m => !delSet.has(m.id.toLowerCase()) && !delSet.has(m.name.trim().toLowerCase()));
    } catch (e) {
      return INITIAL_MENU_ITEMS;
    }
  });
  const [addOns, setAddOns] = useState<AddOnOption[]>(STANDARD_ADD_ONS);
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    try {
      const storedDeleted = localStorage.getItem('POS_DELETED_ING_IDS');
      const delList: string[] = storedDeleted ? JSON.parse(storedDeleted) : [];
      const delSet = new Set(delList.map(s => String(s).trim().toLowerCase()));
      return INITIAL_INGREDIENTS.filter(i => !delSet.has(i.id.toLowerCase()) && !delSet.has(i.name.trim().toLowerCase()));
    } catch (e) {
      return INITIAL_INGREDIENTS;
    }
  });
  const [stockLots, setStockLots] = useState<StockLot[]>(INITIAL_STOCK_LOTS);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>(INITIAL_WASTE_LOGS);
  const [stockAdjustmentLogs, setStockAdjustmentLogs] = useState<StockAdjustmentLog[]>(INITIAL_STOCK_ADJUSTMENT_LOGS);

  const addStockAdjustmentLog = (entry: Omit<StockAdjustmentLog, 'id' | 'timestamp'>) => {
    const newEntry: StockAdjustmentLog = {
      ...entry,
      id: `adj-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    };
    setStockAdjustmentLogs(prev => [newEntry, ...prev]);
  };

  const recordStockAdjustment = (
    ingredientId: string,
    newStock: number,
    reason: string,
    notes?: string,
    userName?: string,
    userRole?: string
  ) => {
    const targetIng = ingredients.find(i => i.id === ingredientId);
    if (!targetIng) return;

    const previousStock = targetIng.currentStock;
    const sanitizedNewStock = Math.max(0, newStock);
    const changeQty = parseFloat((sanitizedNewStock - previousStock).toFixed(3));

    // Update stock level
    const updatedIng = { ...targetIng, currentStock: sanitizedNewStock };
    setIngredients(prev =>
      prev.map(ing => (ing.id === ingredientId ? updatedIng : ing))
    );
    syncIngredientToFirestore(updatedIng, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
      console.warn('[POS Ingredient Sync] Failed to sync stock adjustment to Cloud:', err);
    });

    // Record adjustment log
    const performer = userName || currentUser?.name || 'ผู้ใช้งานระบบ';
    const performerRole = userRole || currentUser?.role || 'staff';

    addStockAdjustmentLog({
      ingredientId: targetIng.id,
      ingredientName: targetIng.name,
      previousStock,
      newStock: sanitizedNewStock,
      changeQty,
      unit: targetIng.unit,
      reason,
      notes: notes || '',
      userName: performer,
      userRole: performerRole
    });
  };

  const clearStockAdjustmentLogs = () => {
    setStockAdjustmentLogs([]);
  };

  const deleteStockAdjustmentLog = (logId: string) => {
    setStockAdjustmentLogs(prev => prev.filter(l => l.id !== logId));
  };
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(INITIAL_STAFF_MEMBERS);
  const [shifts, setShifts] = useState<ShiftEntry[]>(INITIAL_SHIFTS);
  const [shiftSwapRequests, setShiftSwapRequests] = useState<ShiftSwapRequest[]>(INITIAL_SHIFT_SWAP_REQUESTS);
  const [cashShifts, setCashShifts] = useState<CashShift[]>(INITIAL_CASH_SHIFTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [incomes, setIncomes] = useState<OtherIncome[]>(INITIAL_INCOMES);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>(INITIAL_SECURITY_LOGS);

  const logSecurityEvent = (entry: Omit<SecurityLogEntry, 'id' | 'timestamp'>) => {
    const newLog: SecurityLogEntry = {
      ...entry,
      id: `sec-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      pinMasked: entry.pinMasked || '****',
      ipAddress: entry.ipAddress || 'POS-Terminal-01'
    };
    setSecurityLogs(prev => [newLog, ...prev]);
    console.log(`[Security Audit Log] 🛡️ [${newLog.status}] ${newLog.action} by ${newLog.userName}: ${newLog.details || ''}`);
  };

  const clearSecurityLogs = () => {
    setSecurityLogs([]);
  };

  const deleteSecurityLog = (logId: string) => {
    setSecurityLogs(prev => prev.filter(l => l.id !== logId));
  };
  const [autoApproveQR, setAutoApproveQR] = useState<boolean>(false);
  const [tables, setTables] = useState<string[]>(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14']);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<DiscountState>({ amount: 0, type: 'fixed' });

  // Storage Load Flag to prevent race condition overwriting stored data on mount
  const [isStorageLoaded, setIsStorageLoaded] = useState<boolean>(false);

  // Offline Network Detector & Sync Queue
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [forceOfflineMode, setForceOfflineMode] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(new Date().toISOString());

  const effectiveOffline = isOffline || forceOfflineMode;
  const pendingOfflineCount = orders.filter(o => o.isOfflineOrder && !o.isSynced).length;

  // Firebase Cloud & Multi-Branch Synchronization State
  const [firebaseSyncState, setFirebaseSyncState] = useState<FirebaseSyncState>({
    status: navigator.onLine && isFirebaseAvailable() ? 'connected' : 'offline',
    lastSyncedAt: new Date().toISOString(),
    pendingSyncCount: 0,
    totalSyncedOrders: 0,
    lastSyncedBranch: INITIAL_BRANCHES[0].name
  });
  const [centralBranchesLive, setCentralBranchesLive] = useState<Record<string, CentralBranchLiveStats>>({});

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Auto sync when re-connected
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOffline(true);
      setFirebaseSyncState(prev => ({ ...prev, status: 'offline' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update branch live heartbeat in Firestore
  useEffect(() => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      setFirebaseSyncState(prev => ({
        ...prev,
        status: effectiveOffline ? 'offline' : 'connected',
        pendingSyncCount: orders.filter(o => o.isOfflineOrder && !o.isSynced).length
      }));
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.branchId === currentBranch.id && o.createdAt.startsWith(todayStr) && o.status !== 'cancelled');
    const todaySales = todayOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    const lowStock = ingredients.filter(i => i.currentStock <= i.minStockAlert).length;

    syncBranchToFirestore(currentBranch, {
      totalSalesToday: todaySales,
      orderCountToday: todayOrders.length,
      lowStockCount: lowStock,
      isOnline: true
    }).then(ok => {
      if (ok) {
        setFirebaseSyncState(prev => ({
          ...prev,
          status: 'connected',
          lastSyncedAt: new Date().toISOString(),
          lastSyncedBranch: currentBranch.name,
          pendingSyncCount: orders.filter(o => o.isOfflineOrder && !o.isSynced).length
        }));
      }
    });
  }, [currentBranch.id, effectiveOffline, orders.length, ingredients.length]);

  // Real-time listener for central multi-branch statuses
  useEffect(() => {
    if (!isFirebaseAvailable() || effectiveOffline) return;

    const unsubscribe = subscribeToCentralBranches(
      (branchesMap) => {
        setCentralBranchesLive(branchesMap);
      },
      (err) => {
        console.warn('[Firebase POS] Subscription error on central branches:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [effectiveOffline]);

  // Real-time listener for central orders, expenses, incomes, menu, inventory, and deletions from Firestore
  useEffect(() => {
    if (!isStorageLoaded || !isFirebaseAvailable() || effectiveOffline) return;

    const unsubOrders = subscribeToRecentCentralOrders(1000, (centralOrderList, removedIds) => {
      setOrders(prev => {
        let list = prev;
        let hasChanges = false;
        if (removedIds && removedIds.length > 0) {
          const removedSet = new Set(removedIds.map(id => id.replace(/^ord-/, '')));
          const filtered = list.filter(o => !removedSet.has(o.id) && !removedIds.includes(o.id));
          if (filtered.length !== list.length) {
            list = filtered;
            hasChanges = true;
          }
        }
        if (!centralOrderList || centralOrderList.length === 0) {
          if (hasChanges) {
            try { localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(list)); } catch (e) {}
            return list;
          }
          return prev;
        }
        const localMap = new Map<string, Order>();
        list.forEach(o => { if (o && o.id) localMap.set(o.id, o); });
        centralOrderList.forEach(co => {
          if (!localMap.has(co.id)) {
            localMap.set(co.id, co);
            hasChanges = true;
          } else {
            const existing = localMap.get(co.id)!;
            const isCloudNewer = Boolean(
              co.updatedAt && existing.updatedAt &&
              new Date(co.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
            );
            const statusChanged = co.status !== existing.status;
            if (isCloudNewer || statusChanged) {
              localMap.set(co.id, { ...existing, ...co, isSynced: true });
              hasChanges = true;
            } else if (!existing.isSynced && co.isSynced) {
              localMap.set(co.id, { ...existing, ...co, isSynced: true });
              hasChanges = true;
            }
          }
        });
        if (!hasChanges) return prev;
        const merged = Array.from(localMap.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        try {
          localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(merged));
        } catch (e) {
          console.warn('[POS Real-Time Sync] Failed to cache synced orders', e);
        }
        return merged;
      });
    });

    const unsubExpenses = subscribeToCentralExpenses(100, (centralExpList, removedIds) => {
      setExpenses(prev => {
        let list = prev;
        let hasNew = false;
        if (removedIds && removedIds.length > 0) {
          const remSet = new Set(removedIds);
          const filtered = list.filter(e => !remSet.has(e.id));
          if (filtered.length !== list.length) {
            list = filtered;
            hasNew = true;
          }
        }
        if (centralExpList && centralExpList.length > 0) {
          const localMap = new Map(list.map(e => [e.id, e]));
          centralExpList.forEach(ce => {
            if (!localMap.has(ce.id)) {
              localMap.set(ce.id, ce);
              hasNew = true;
            } else {
              const existing = localMap.get(ce.id)!;
              if (existing.amount !== ce.amount || existing.category !== ce.category || existing.title !== ce.title || existing.note !== ce.note) {
                localMap.set(ce.id, { ...existing, ...ce });
                hasNew = true;
              }
            }
          });
          if (hasNew) {
            list = Array.from(localMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          }
        }
        if (!hasNew) return prev;
        try {
          localStorage.setItem('POS_EXPENSES_DATA', JSON.stringify(list));
        } catch (e) {
          console.warn('Failed to cache synced expenses', e);
        }
        return list;
      });
    });

    const unsubIncomes = subscribeToCentralIncomes(100, (centralIncList, removedIds) => {
      setIncomes(prev => {
        let list = prev;
        let hasNew = false;
        if (removedIds && removedIds.length > 0) {
          const remSet = new Set(removedIds);
          const filtered = list.filter(i => !remSet.has(i.id));
          if (filtered.length !== list.length) {
            list = filtered;
            hasNew = true;
          }
        }
        if (centralIncList && centralIncList.length > 0) {
          const localMap = new Map(list.map(i => [i.id, i]));
          centralIncList.forEach(ci => {
            if (!localMap.has(ci.id)) {
              localMap.set(ci.id, ci);
              hasNew = true;
            } else {
              const existing = localMap.get(ci.id)!;
              if (existing.amount !== ci.amount || existing.category !== ci.category || existing.title !== ci.title || existing.note !== ci.note) {
                localMap.set(ci.id, { ...existing, ...ci });
                hasNew = true;
              }
            }
          });
          if (hasNew) {
            list = Array.from(localMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          }
        }
        if (!hasNew) return prev;
        try {
          localStorage.setItem('POS_INCOMES_DATA', JSON.stringify(list));
        } catch (e) {
          console.warn('Failed to cache synced incomes', e);
        }
        return list;
      });
    });

    const unsubMenus = subscribeToMenuItems((cloudMenuList, removedIds) => {
      setMenuItems(prev => {
        let currentList = prev;
        let changed = false;

        if (removedIds && removedIds.length > 0) {
          const remSet = new Set(removedIds.map(id => id.trim().toLowerCase()));
          const filtered = currentList.filter(m => !remSet.has(m.id.toLowerCase()));
          if (filtered.length !== currentList.length) {
            currentList = filtered;
            changed = true;
          }
        }

        if (!cloudMenuList || cloudMenuList.length === 0) {
          if (changed) {
            try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(currentList)); } catch (e) {}
            return currentList;
          }
          return prev;
        }

        const localMap = new Map<string, MenuItem>(currentList.map(m => [m.id, m]));
        const deletedSet = new Set(deletedMenuItemIds.map(d => String(d).trim().toLowerCase()));

        cloudMenuList.forEach(cm => {
          if (deletedSet.has(cm.id.toLowerCase()) || deletedSet.has(cm.name.trim().toLowerCase())) return;

          if (!localMap.has(cm.id)) {
            localMap.set(cm.id, cm);
            changed = true;
          } else {
            const existing = localMap.get(cm.id)!;
            const isDifferent =
              existing.price !== cm.price ||
              existing.costPrice !== cm.costPrice ||
              existing.name !== cm.name ||
              existing.category !== cm.category ||
              JSON.stringify(existing.recipe || []) !== JSON.stringify(cm.recipe || []);
            if (isDifferent) {
              localMap.set(cm.id, { ...existing, ...cm });
              changed = true;
            }
          }
        });

        if (!changed) return prev;
        const merged = Array.from(localMap.values());
        try {
          localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    });

    const branchTargetId = currentBranch?.id || 'branch-1786349847821';
    const unsubInventory = subscribeToBranchInventory(branchTargetId, (cloudIngList, removedIds) => {
      setIngredients(prev => {
        let currentList = prev;
        let changed = false;

        if (removedIds && removedIds.length > 0) {
          const remSet = new Set(removedIds.map(id => id.trim().toLowerCase()));
          const filtered = currentList.filter(i => !remSet.has(i.id.toLowerCase()));
          if (filtered.length !== currentList.length) {
            currentList = filtered;
            changed = true;
          }
        }

        if (!cloudIngList || cloudIngList.length === 0) {
          if (changed) {
            try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(currentList)); } catch (e) {}
            return currentList;
          }
          return prev;
        }

        const localMap = new Map<string, Ingredient>(currentList.map(i => [i.id, i]));
        const deletedSet = new Set(deletedIngredientIds.map(d => String(d).trim().toLowerCase()));

        cloudIngList.forEach(ci => {
          if (deletedSet.has(ci.id.toLowerCase()) || deletedSet.has(ci.name.trim().toLowerCase())) return;

          if (!localMap.has(ci.id)) {
            localMap.set(ci.id, ci);
            changed = true;
          } else {
            const existing = localMap.get(ci.id)!;
            const isDifferent =
              existing.currentStock !== ci.currentStock ||
              existing.unitCost !== ci.unitCost ||
              existing.minStockAlert !== ci.minStockAlert ||
              existing.name !== ci.name;
            if (isDifferent) {
              localMap.set(ci.id, { ...existing, ...ci });
              changed = true;
            }
          }
        });

        if (!changed) return prev;
        const merged = Array.from(localMap.values());
        try {
          localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    });

    // Real-time listener for deleted record tombstones (tombstone sync across clients)
    const unsubTombstones = subscribeToDeletedRecords((deletedSet) => {
      if (deletedSet.menuIds.size > 0) {
        setMenuItems(prev => {
          const filtered = prev.filter(m => !deletedSet.menuIds.has(m.id));
          if (filtered.length !== prev.length) {
            try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(filtered)); } catch (e) {}
            return filtered;
          }
          return prev;
        });
        setDeletedMenuItemIds(prev => Array.from(new Set([...prev, ...deletedSet.menuIds])));
      }

      if (deletedSet.ingredientIds.size > 0) {
        setIngredients(prev => {
          const filtered = prev.filter(i => !deletedSet.ingredientIds.has(i.id));
          if (filtered.length !== prev.length) {
            try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(filtered)); } catch (e) {}
            return filtered;
          }
          return prev;
        });
        setDeletedIngredientIds(prev => Array.from(new Set([...prev, ...deletedSet.ingredientIds])));
      }

      if (deletedSet.orderIds.size > 0) {
        setOrders(prev => {
          const filtered = prev.filter(o => !deletedSet.orderIds.has(o.id) && !deletedSet.orderIds.has(`ord-${o.id}`));
          if (filtered.length !== prev.length) {
            try { localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(filtered)); } catch (e) {}
            return filtered;
          }
          return prev;
        });
      }
    });

    return () => {
      unsubOrders();
      unsubExpenses();
      unsubIncomes();
      unsubMenus();
      unsubInventory();
      unsubTombstones();
    };
  }, [isStorageLoaded, effectiveOffline, currentBranch?.id, deletedMenuItemIds.length, deletedIngredientIds.length]);

  // Automated Daily Sales Summary Notification at Scheduled Time (e.g. 22:00)
  useEffect(() => {
    const checkDailySummarySchedule = () => {
      try {
        const triggers = getStoredTriggers();
        if (!triggers.dailySummary) return;

        const rules = getStoredRules();
        const summaryTime = rules.dailySummaryTime || '22:00';

        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${currentHours}:${currentMinutes}`;
        const todayStr = now.toISOString().split('T')[0];

        const lastSentDate = localStorage.getItem('kaprao_last_daily_summary_date');
        // If current time reached summary time and hasn't been sent yet today
        if (currentTimeStr >= summaryTime && lastSentDate !== todayStr) {
          localStorage.setItem('kaprao_last_daily_summary_date', todayStr);
          const msg = generateDailySummaryMessage(orders, ingredients, currentBranch, settings);
          dispatchNotification('สรุปยอดขายประจำวันอัตโนมัติ (Daily Summary)', msg, { force: true }).catch(console.error);
        }
      } catch (err) {
        console.warn('[Notification Schedule] Check error:', err);
      }
    };

    // Run initial check and then every 30 seconds
    checkDailySummarySchedule();
    const intervalId = setInterval(checkDailySummarySchedule, 30000);
    return () => clearInterval(intervalId);
  }, [orders, ingredients, currentBranch, settings]);

  const syncOfflineQueue = async () => {
    const nowIso = new Date().toISOString();
    const pendingOrders = orders.filter(o => o.isOfflineOrder && !o.isSynced);

    if (pendingOrders.length === 0) {
      console.log('[POS Sync Queue] ℹ️ No pending offline orders in queue.');
      if (isFirebaseAvailable() && !effectiveOffline) {
        setFirebaseSyncState(prev => ({ ...prev, status: 'syncing' }));
        await syncInventoryToFirestore(ingredients, currentBranch);
        await syncBranchToFirestore(currentBranch);
        setFirebaseSyncState(prev => ({
          ...prev,
          status: 'connected',
          lastSyncedAt: nowIso,
          lastSyncedBranch: currentBranch.name,
          pendingSyncCount: 0
        }));
      }
      setLastSyncedAt(nowIso);
      return;
    }

    console.log(`[POS Sync Queue] 🔄 Initiating cloud synchronization for ${pendingOrders.length} offline order(s)...`);
    setFirebaseSyncState(prev => ({
      ...prev,
      status: 'syncing',
      pendingSyncCount: pendingOrders.length
    }));

    // If online, batch push to Firebase Firestore
    if (isFirebaseAvailable() && !effectiveOffline) {
      try {
        const batchResult = await syncOrdersBatchToFirestore(pendingOrders, currentBranch);
        await syncInventoryToFirestore(ingredients, currentBranch);
        console.log(`[Firebase Service] ☁️ Synced ${batchResult.success} orders and inventory to Firestore.`);
      } catch (err) {
        console.error('[Firebase Service] ❌ Batch sync failed:', err);
      }
    }

    setOrders(prevOrders => {
      const syncLogsTable: Array<{
        'Order ID': string;
        'Order #': string;
        'Grand Total (฿)': string;
        'Items': number;
        'Payment': string;
        'Checksum': string;
        'Integrity Check': string;
        'Sync Status': string;
      }> = [];

      let syncedCount = 0;
      let corruptCount = 0;

      const updatedOrders = prevOrders.map(ord => {
        if (ord.isOfflineOrder && !ord.isSynced) {
          const computedChecksum = computeOrderChecksum(ord);
          const isChecksumValid = !ord.checksum || ord.checksum === computedChecksum;

          if (isChecksumValid) {
            syncedCount++;
            syncLogsTable.push({
              'Order ID': ord.id,
              'Order #': ord.orderNumber,
              'Grand Total (฿)': ord.grandTotal.toFixed(2),
              'Items': ord.items?.length || 0,
              'Payment': ord.paymentMethod,
              'Checksum': computedChecksum,
              'Integrity Check': 'PASSED ✅',
              'Sync Status': 'SYNCED ☁️'
            });

            return {
              ...ord,
              checksum: computedChecksum,
              isSynced: true,
              syncedAt: nowIso
            };
          } else {
            corruptCount++;
            console.error(`[POS Sync Queue] ❌ Checksum mismatch detected for order ${ord.id}! Stored: ${ord.checksum}, Computed: ${computedChecksum}`);
            syncLogsTable.push({
              'Order ID': ord.id,
              'Order #': ord.orderNumber,
              'Grand Total (฿)': ord.grandTotal.toFixed(2),
              'Items': ord.items?.length || 0,
              'Payment': ord.paymentMethod,
              'Checksum': computedChecksum,
              'Integrity Check': 'CORRUPTED ❌',
              'Sync Status': 'REJECTED ⚠️'
            });

            return ord;
          }
        }
        return ord;
      });

      console.log(`[POS Sync Queue] 📊 Synchronization complete: ${syncedCount} synced successfully, ${corruptCount} corrupted/rejected.`);
      if (syncLogsTable.length > 0) {
        console.table(syncLogsTable);
      }

      return updatedOrders;
    });

    setLastSyncedAt(nowIso);
    setFirebaseSyncState(prev => ({
      ...prev,
      status: 'connected',
      lastSyncedAt: nowIso,
      lastSyncedBranch: currentBranch.name,
      pendingSyncCount: 0,
      totalSyncedOrders: prev.totalSyncedOrders + pendingOrders.length
    }));
  };

  const cleanAndSyncCloudNow = useCallback(async (options?: { purgeCloud?: boolean }): Promise<{
    success: boolean;
    message: string;
    details?: {
      ordersSynced: number;
      menuSynced: number;
      menuDeleted: number;
      inventorySynced: number;
      inventoryDeleted: number;
      categoriesSynced: number;
      tablesSynced: number;
    };
  }> => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      return {
        success: false,
        message: 'ไม่สามารถซิงค์ได้: ฐานข้อมูล Firebase ออฟไลน์ หรืออุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต'
      };
    }

    setFirebaseSyncState(prev => ({ ...prev, status: 'syncing' }));
    try {
      const purge = options?.purgeCloud !== false && (settings.cloudPurgeDeletions !== false);
      const res = await syncFullCatalogToFirestore({
        menuItems,
        deletedMenuItemIds,
        ingredients,
        deletedIngredientIds,
        categories,
        tables,
        addOns,
        branch: currentBranch,
        settings,
        orders,
        purgeOrphanCloudData: purge
      });

      if (!res.success) {
        setFirebaseSyncState(prev => ({ ...prev, status: 'error', errorMessage: res.error || 'ซิงค์ข้อมูลล้มเหลว' }));
        return { success: false, message: res.error || 'การซิงค์ข้อมูลขึ้นคลาวด์ล้มเหลว' };
      }

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setFirebaseSyncState(prev => ({
        ...prev,
        status: 'connected',
        lastSyncedAt: nowIso,
        lastSyncedBranch: currentBranch.name,
        pendingSyncCount: 0,
        realtimeSyncActive: true,
        lastPurgedCount: res.menuDeleted + res.inventoryDeleted,
        lastPurgedDetails: {
          menuDeleted: res.menuDeleted,
          inventoryDeleted: res.inventoryDeleted,
          menuSynced: res.menuSynced,
          inventorySynced: res.inventorySynced,
          categoriesSynced: res.categoriesSynced,
          tablesSynced: res.tablesSynced,
          lastCleanedAt: nowIso
        }
      }));

      const msgParts: string[] = [];
      if (res.menuSynced > 0) msgParts.push(`อัปเดตเมนู ${res.menuSynced} รายการ`);
      if (res.menuDeleted > 0) msgParts.push(`ลบเมนูเก่าออกจากคลาวด์ ${res.menuDeleted} รายการ`);
      if (res.inventorySynced > 0) msgParts.push(`อัปเดตสต็อก ${res.inventorySynced} รายการ`);
      if (res.inventoryDeleted > 0) msgParts.push(`ลบสต็อกเก่าออกจากคลาวด์ ${res.inventoryDeleted} รายการ`);
      if (res.categoriesSynced > 0) msgParts.push(`ซิงค์หมวดหมู่ ${res.categoriesSynced} รายการ`);
      if (res.tablesSynced > 0) msgParts.push(`ซิงค์โต๊ะ ${res.tablesSynced} รายการ`);
      if (res.ordersSynced > 0) msgParts.push(`ส่งออเดอร์ ${res.ordersSynced} รายการ`);

      const summaryMsg = msgParts.length > 0
        ? `ซิงค์และล้างข้อมูลเก่าบนคลาวด์สำเร็จ: ${msgParts.join(', ')}`
        : 'ข้อมูลบนคลาวด์เป็นปัจจุบันแล้ว ไม่พบข้อมูลเก่าตกค้าง';

      return {
        success: true,
        message: summaryMsg,
        details: {
          ordersSynced: res.ordersSynced,
          menuSynced: res.menuSynced,
          menuDeleted: res.menuDeleted,
          inventorySynced: res.inventorySynced,
          inventoryDeleted: res.inventoryDeleted,
          categoriesSynced: res.categoriesSynced,
          tablesSynced: res.tablesSynced
        }
      };
    } catch (e: any) {
      console.error('[Firebase Clean Sync] Exception during sync:', e);
      setFirebaseSyncState(prev => ({ ...prev, status: 'error', errorMessage: String(e) }));
      return { success: false, message: `เกิดข้อผิดพลาด: ${e?.message || String(e)}` };
    }
  }, [
    effectiveOffline,
    menuItems,
    deletedMenuItemIds,
    ingredients,
    categories,
    tables,
    addOns,
    currentBranch,
    settings,
    orders
  ]);

  const pushAllBranchDataToCloud = async (): Promise<boolean> => {
    const res = await cleanAndSyncCloudNow({ purgeCloud: true });
    return res.success;
  };

  const pullCloudOrders = useCallback(async (): Promise<{ count: number; success: boolean }> => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      return { count: 0, success: false };
    }
    try {
      const cloudOrders = await fetchCentralOrdersFromFirestore(1000);
      if (!cloudOrders || cloudOrders.length === 0) {
        return { count: 0, success: true };
      }
      let newOrUpdatedCount = 0;
      setOrders(prev => {
        const orderMap = new Map<string, Order>();
        prev.forEach(o => { if (o && o.id) orderMap.set(o.id, o); });
        cloudOrders.forEach(co => {
          if (!orderMap.has(co.id)) {
            orderMap.set(co.id, co);
            newOrUpdatedCount++;
          } else {
            const existing = orderMap.get(co.id)!;
            const isCloudNewer = Boolean(
              co.updatedAt && existing.updatedAt &&
              new Date(co.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
            );
            if (isCloudNewer) {
              orderMap.set(co.id, { ...existing, ...co, isSynced: true });
              newOrUpdatedCount++;
            } else if (!existing.isSynced && co.isSynced) {
              orderMap.set(co.id, { ...existing, ...co, isSynced: true });
              newOrUpdatedCount++;
            }
          }
        });
        const merged = Array.from(orderMap.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        try {
          localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(merged));
        } catch (e) {
          console.warn('[POS Cloud Pull] Failed to cache POS_ORDERS_DATA', e);
        }
        return merged;
      });
      return { count: newOrUpdatedCount, success: true };
    } catch (err) {
      console.error('[POS Cloud Pull] Error pulling cloud orders:', err);
      return { count: 0, success: false };
    }
  }, [effectiveOffline]);

  const pullCloudAllData = useCallback(async (): Promise<{
    ordersCount: number;
    ingredientsCount: number;
    menuItemsCount: number;
    success: boolean;
  }> => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      return { ordersCount: 0, ingredientsCount: 0, menuItemsCount: 0, success: false };
    }

    try {
      console.log('[POS Cloud Pull All] 🔄 Pulling all central data (Orders, Ingredients, Menu Items, Branches)...');
      
      // 1. Orders
      const orderRes = await pullCloudOrders();

      // 2. Ingredients for active branch
      const branchTargetId = currentBranch?.id || 'branch-1786349847821';
      const cloudIngs = await fetchBranchInventoryFromFirestore(branchTargetId);
      let ingCount = 0;
      if (cloudIngs && cloudIngs.length > 0) {
        setIngredients(prev => {
          const ingMap = new Map<string, Ingredient>();
          // Cloud items add any newly added cloud ingredients
          cloudIngs.forEach(ci => {
            if (ci && ci.id) ingMap.set(ci.id, ci);
          });
          // Local items strictly OVERWRITE cloud items so user's edits are never lost
          prev.forEach(pi => {
            if (pi && pi.id) {
              ingMap.set(pi.id, pi);
            }
          });
          const merged = Array.from(ingMap.values());
          try {
            localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(merged));
          } catch (e) {}
          ingCount = merged.length;
          console.log(`[POS Cloud Pull All] 📦 Ingredients synchronized: ${merged.length} items`);
          return merged;
        });
      }

      // 3. Menu Items
      const cloudMenus = await fetchMenuItemsFromFirestore();
      let menuCount = 0;
      if (cloudMenus && cloudMenus.length > 0) {
        setMenuItems(prev => {
          const menuMap = new Map<string, MenuItem>();
          const delSet = new Set(deletedMenuItemIds.map(s => String(s).trim().toLowerCase()));

          // Cloud items add newly added cloud menu items (skipping any deleted items)
          cloudMenus.forEach(cm => {
            if (cm && cm.id && !delSet.has(cm.id.toLowerCase()) && !delSet.has(cm.name.trim().toLowerCase())) {
              menuMap.set(cm.id, cm);
            }
          });
          // Local items strictly OVERWRITE cloud items so user's edits are never lost
          prev.forEach(pm => {
            if (pm && pm.id && !delSet.has(pm.id.toLowerCase()) && !delSet.has(pm.name.trim().toLowerCase())) {
              menuMap.set(pm.id, pm);
            }
          });
          const merged = Array.from(menuMap.values());
          try {
            localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(merged));
          } catch (e) {}
          menuCount = merged.length;
          console.log(`[POS Cloud Pull All] 🍽️ Menu items synchronized: ${merged.length} items`);
          return merged;
        });
      }

      // 4. Branches
      const cloudBranches = await fetchBranchesFromFirestore();
      if (cloudBranches && cloudBranches.length > 0) {
        setBranches(prev => {
          const bMap = new Map<string, Branch>();
          cloudBranches.forEach(cb => bMap.set(cb.id, cb));
          prev.forEach(b => bMap.set(b.id, b));
          const merged = Array.from(bMap.values());
          try {
            localStorage.setItem('POS_BRANCHES_DATA', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }

      return {
        ordersCount: orderRes.count,
        ingredientsCount: ingCount,
        menuItemsCount: menuCount,
        success: true
      };
    } catch (err) {
      console.error('[POS Cloud Pull All] ❌ Error pulling all data from cloud:', err);
      return { ordersCount: 0, ingredientsCount: 0, menuItemsCount: 0, success: false };
    }
  }, [effectiveOffline, currentBranch?.id, pullCloudOrders]);

  // Conflict Resolver State & Handlers
  const [conflictReport, setConflictReport] = useState<SyncConflictReport | null>(null);
  const [isConflictResolverOpen, setIsConflictResolverOpen] = useState(false);
  const [isScanningConflicts, setIsScanningConflicts] = useState(false);
  const [isResolvingConflicts, setIsResolvingConflicts] = useState(false);

  const scanForSyncConflicts = useCallback(async (): Promise<SyncConflictReport> => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      const emptyReport: SyncConflictReport = {
        hasConflicts: false,
        totalConflicts: 0,
        menuConflicts: [],
        ingredientConflicts: [],
        detectedAt: new Date().toISOString()
      };
      setConflictReport(emptyReport);
      return emptyReport;
    }

    setIsScanningConflicts(true);
    try {
      console.log('[POS Conflict Scan] 🔍 Scanning Cloud Firestore vs Local State for conflicts...');
      const [cloudMenus, cloudIngs] = await Promise.all([
        fetchMenuItemsFromFirestore(),
        fetchBranchInventoryFromFirestore(currentBranch?.id || 'branch-1786349847821')
      ]);

      const report = detectSyncConflicts(menuItems, cloudMenus || [], ingredients, cloudIngs || []);
      console.log(`[POS Conflict Scan] Result: ${report.totalConflicts} conflicts found (${report.menuConflicts.length} menus, ${report.ingredientConflicts.length} ingredients).`);
      setConflictReport(report);
      return report;
    } catch (err) {
      console.error('[POS Conflict Scan] ❌ Error scanning for conflicts:', err);
      const errReport: SyncConflictReport = {
        hasConflicts: false,
        totalConflicts: 0,
        menuConflicts: [],
        ingredientConflicts: [],
        detectedAt: new Date().toISOString()
      };
      setConflictReport(errReport);
      return errReport;
    } finally {
      setIsScanningConflicts(false);
    }
  }, [effectiveOffline, currentBranch?.id, menuItems, ingredients]);

  const openConflictResolver = useCallback(() => {
    setIsConflictResolverOpen(true);
    scanForSyncConflicts();
  }, [scanForSyncConflicts]);

  const closeConflictResolver = useCallback(() => {
    setIsConflictResolverOpen(false);
  }, []);

  const applyConflictResolutions = useCallback(async (resolutions: {
    menuChoices: Record<string, ConflictResolutionChoice>;
    ingredientChoices: Record<string, ConflictResolutionChoice>;
  }): Promise<boolean> => {
    if (!conflictReport) return false;
    setIsResolvingConflicts(true);

    try {
      console.log('[POS Conflict Resolution] 🛠️ Applying user conflict choices...', resolutions);

      // 1. Resolve Menu Conflicts
      if (conflictReport.menuConflicts.length > 0) {
        const menuMap = new Map<string, MenuItem>();
        menuItems.forEach(m => menuMap.set(m.id, m));

        for (const conflict of conflictReport.menuConflicts) {
          const choice = resolutions.menuChoices[conflict.id] || 'local';

          if (choice === 'local') {
            if (conflict.localItem) {
              await syncSingleMenuItemToFirestore(conflict.localItem).catch(e => {
                console.warn(`Failed to push local menu ${conflict.id} to cloud:`, e);
              });
            }
          } else if (choice === 'cloud') {
            if (conflict.cloudItem) {
              menuMap.set(conflict.id, conflict.cloudItem);
            }
          }
        }

        const updatedMenus = Array.from(menuMap.values());
        setMenuItems(updatedMenus);
        try {
          localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(updatedMenus));
        } catch (e) {}
      }

      // 2. Resolve Ingredient Conflicts
      if (conflictReport.ingredientConflicts.length > 0) {
        const branchTargetId = currentBranch?.id || 'branch-1786349847821';
        const branchName = currentBranch?.name || 'ครัวกะเพรา ตลาด กกท';

        const ingMap = new Map<string, Ingredient>();
        ingredients.forEach(i => ingMap.set(i.id, i));

        for (const conflict of conflictReport.ingredientConflicts) {
          const choice = resolutions.ingredientChoices[conflict.id] || 'local';

          if (choice === 'local') {
            if (conflict.localIngredient) {
              await syncIngredientToFirestore(conflict.localIngredient, branchTargetId, branchName).catch(e => {
                console.warn(`Failed to push local ingredient ${conflict.id} to cloud:`, e);
              });
            }
          } else if (choice === 'cloud') {
            if (conflict.cloudIngredient) {
              ingMap.set(conflict.id, conflict.cloudIngredient);
            }
          }
        }

        const updatedIngs = Array.from(ingMap.values());
        setIngredients(updatedIngs);
        try {
          localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(updatedIngs));
        } catch (e) {}
      }

      // 3. Log audit event
      logSecurityEvent({
        action: 'SYNC_CONFLICT_RESOLVED',
        status: 'SUCCESS',
        userName: currentUser?.name || 'ผู้จัดการ',
        userRole: currentUser?.role || 'admin',
        details: `Resolved ${conflictReport.totalConflicts} data conflicts between Local and Cloud`
      });

      // Clear report and close
      setConflictReport(null);
      setIsConflictResolverOpen(false);
      console.log('[POS Conflict Resolution] ✅ All conflicts resolved successfully!');
      return true;
    } catch (err) {
      console.error('[POS Conflict Resolution] ❌ Error applying resolutions:', err);
      return false;
    } finally {
      setIsResolvingConflicts(false);
    }
  }, [conflictReport, menuItems, ingredients, currentBranch, logSecurityEvent, currentUser]);

  // Periodic Background Auto Sync Effect based on settings
  useEffect(() => {
    const isAutoSyncEnabled = settings.autoSyncEnabled !== false;
    const intervalSec = settings.syncIntervalSeconds || 30;

    if (!isAutoSyncEnabled || effectiveOffline) return;

    const intervalId = setInterval(() => {
      syncOfflineQueue();
    }, intervalSec * 1000);

    return () => clearInterval(intervalId);
  }, [settings.autoSyncEnabled, settings.syncIntervalSeconds, effectiveOffline]);

  // Load state from localStorage on mount with strict validation & logging
  useEffect(() => {
    try {
      console.log(`[POS Storage Sync] Initializing LocalStorage data load for key '${LOCAL_STORAGE_KEY}'...`);
      const params = new URLSearchParams(window.location.search);
      if (params.get('table') || params.get('qr')) {
        setActiveTab('qr');
      }

      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          let loadedOrdersCount = 0;
          let loadedMenuItemsCount = 0;
          let loadedShiftsCount = 0;

          const orderMap = new Map<string, Order>();
          if (parsed.orders && Array.isArray(parsed.orders)) {
            parsed.orders.forEach((o: any) => {
              if (o && typeof o === 'object' && o.id) orderMap.set(o.id, o);
            });
          }
          try {
            const sepOrders = localStorage.getItem('POS_ORDERS_DATA');
            if (sepOrders) {
              const parsedSep = JSON.parse(sepOrders);
              if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                parsedSep.forEach((o: any) => {
                  if (o && typeof o === 'object' && o.id && !orderMap.has(o.id)) {
                    orderMap.set(o.id, o);
                  }
                });
              }
            }
          } catch (e) {
            console.warn('[POS Storage Sync] Failed to read backup POS_ORDERS_DATA', e);
          }
          const loadedOrders = Array.from(orderMap.values()).sort(
            (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
          );
          setOrders(loadedOrders);
          loadedOrdersCount = loadedOrders.length;
          let loadedCats = DEFAULT_CATEGORIES;
          if (parsed.categories && Array.isArray(parsed.categories)) {
            loadedCats = parsed.categories;
          }

          let loadedDeletedMenuIds: string[] = (parsed.deletedMenuItemIds && Array.isArray(parsed.deletedMenuItemIds))
            ? parsed.deletedMenuItemIds
            : [];
          try {
            const sepDeleted = localStorage.getItem('POS_DELETED_MENU_IDS');
            if (sepDeleted) {
              const parsedSepDel = JSON.parse(sepDeleted);
              if (Array.isArray(parsedSepDel)) {
                loadedDeletedMenuIds = Array.from(new Set([...loadedDeletedMenuIds, ...parsedSepDel]));
              }
            }
          } catch (e) {}
          if (loadedDeletedMenuIds.length > 0) {
            setDeletedMenuItemIds(loadedDeletedMenuIds);
          }
          const delFilterSet = new Set(loadedDeletedMenuIds.map(s => String(s).trim().toLowerCase()));

          let loadedItems = INITIAL_MENU_ITEMS.filter(m => !delFilterSet.has(m.id.toLowerCase()) && !delFilterSet.has(m.name.trim().toLowerCase()));
          let loadedMenuItems: MenuItem[] = (parsed.menuItems && Array.isArray(parsed.menuItems))
            ? parsed.menuItems.filter((m: any) => m && typeof m === 'object' && m.id)
            : [];
          // Fallback to separate key ONLY if main state was empty
          if (loadedMenuItems.length === 0) {
            try {
              const sepMenu = localStorage.getItem('POS_MENU_ITEMS_DATA');
              if (sepMenu) {
                const parsedSep = JSON.parse(sepMenu);
                if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                  loadedMenuItems = parsedSep.filter((m: any) => m && typeof m === 'object' && m.id);
                }
              }
            } catch (e) {
              console.warn('[POS Storage Sync] Failed to read backup POS_MENU_ITEMS_DATA', e);
            }
          }
          const finalMenuItems = (loadedMenuItems.length > 0 ? loadedMenuItems : loadedItems)
            .filter(m => !delFilterSet.has(m.id.toLowerCase()) && !delFilterSet.has(m.name.trim().toLowerCase()));

          setMenuItems(finalMenuItems);
          loadedItems = finalMenuItems;
          loadedMenuItemsCount = finalMenuItems.length;

          // Always heal categories so no custom or imported category is ever lost
          const healedCategories = syncAndHealCategories(loadedCats, loadedItems);
          setCategories(healedCategories);

          if (parsed.ingredientCategories && Array.isArray(parsed.ingredientCategories)) {
            setIngredientCategories(syncAndHealIngredientCategories(parsed.ingredientCategories, parsed.ingredients || []));
          } else if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
            setIngredientCategories(prev => syncAndHealIngredientCategories(prev, parsed.ingredients));
          }
          if (parsed.ingredientUnits && Array.isArray(parsed.ingredientUnits) && parsed.ingredientUnits.length > 0) {
            setIngredientUnits(parsed.ingredientUnits);
          }
          if (parsed.addOns && Array.isArray(parsed.addOns)) setAddOns(parsed.addOns);

          // Ingredients loading with resilient backup (main state strictly takes precedence)
          let loadedIngredients: Ingredient[] = (parsed.ingredients && Array.isArray(parsed.ingredients)) ? parsed.ingredients : [];
          if (loadedIngredients.length === 0) {
            try {
              const sepIng = localStorage.getItem('POS_INGREDIENTS_DATA');
              if (sepIng) {
                const parsedSep = JSON.parse(sepIng);
                if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                  loadedIngredients = parsedSep.filter((i: any) => i && typeof i === 'object' && i.id);
                }
              }
            } catch (e) {
              console.warn('[POS Storage Sync] Failed to read backup POS_INGREDIENTS_DATA', e);
            }
          }
          if (loadedIngredients.length > 0) {
            setIngredients(loadedIngredients);
          }
          if (parsed.stockLots && Array.isArray(parsed.stockLots)) setStockLots(parsed.stockLots);
          if (parsed.wasteLogs && Array.isArray(parsed.wasteLogs)) setWasteLogs(parsed.wasteLogs);
          if (parsed.stockAdjustmentLogs && Array.isArray(parsed.stockAdjustmentLogs)) setStockAdjustmentLogs(parsed.stockAdjustmentLogs);
          if (parsed.staffMembers && Array.isArray(parsed.staffMembers)) setStaffMembers(parsed.staffMembers);
          if (parsed.shifts && Array.isArray(parsed.shifts)) setShifts(parsed.shifts);
          if (parsed.shiftSwapRequests && Array.isArray(parsed.shiftSwapRequests)) setShiftSwapRequests(parsed.shiftSwapRequests);
          if (parsed.cashShifts && Array.isArray(parsed.cashShifts)) {
            setCashShifts(parsed.cashShifts);
            loadedShiftsCount = parsed.cashShifts.length;
          }
          let loadedExpenses: Expense[] = (parsed.expenses && Array.isArray(parsed.expenses)) ? parsed.expenses : [];
          if (loadedExpenses.length === 0) {
            try {
              const sepExp = localStorage.getItem('POS_EXPENSES_DATA');
              if (sepExp) {
                const parsedSep = JSON.parse(sepExp);
                if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                  loadedExpenses = parsedSep;
                }
              }
            } catch (e) {
              console.warn('[POS Storage Sync] Failed to read backup POS_EXPENSES_DATA', e);
            }
          }
          setExpenses(loadedExpenses);

          let loadedIncomes: OtherIncome[] = (parsed.incomes && Array.isArray(parsed.incomes)) ? parsed.incomes : [];
          if (loadedIncomes.length === 0) {
            try {
              const sepInc = localStorage.getItem('POS_INCOMES_DATA');
              if (sepInc) {
                const parsedSep = JSON.parse(sepInc);
                if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                  loadedIncomes = parsedSep;
                }
              }
            } catch (e) {
              console.warn('[POS Storage Sync] Failed to read backup POS_INCOMES_DATA', e);
            }
          }
          setIncomes(loadedIncomes);
          if (parsed.settings && typeof parsed.settings === 'object') {
            const mergedSettings = { ...INITIAL_SETTINGS, ...parsed.settings };
            // If previous shopLogoUrl was the older default SVG or empty, update to the new official brand logo
            if (!parsed.settings.shopLogoUrl || parsed.settings.shopLogoUrl.startsWith('data:image/svg+xml')) {
              mergedSettings.shopLogoUrl = SHOP_LOGO_URL;
            }
            setSettings(mergedSettings);
          }
          if (parsed.securityLogs && Array.isArray(parsed.securityLogs)) setSecurityLogs(parsed.securityLogs);
          if (typeof parsed.autoApproveQR === 'boolean') setAutoApproveQR(parsed.autoApproveQR);
          if (parsed.tables && Array.isArray(parsed.tables)) setTables(parsed.tables);
          if (parsed.users && Array.isArray(parsed.users)) {
            const sanitizedUsers = parsed.users
              .filter((u: any) => u && !u.name?.includes('สมศักดิ์'))
              .map((u: any) => {
                if (u.id === 'usr-admin' || u.name?.includes('สมศักดิ์')) {
                  return { ...u, name: 'อาห์มัด (เจ้าของร้าน)', role: 'admin', pin: u.pin || '1234' };
                }
                return u;
              });
            // Ensure อาห์มัด is in users
            if (!sanitizedUsers.some((u: any) => u.name?.includes('อาห์มัด'))) {
              sanitizedUsers.unshift(INITIAL_USERS[0]);
            }
            setUsers(sanitizedUsers);
          }
          if (parsed.cart && Array.isArray(parsed.cart)) {
            const validCart = parsed.cart.filter((c: any) => c && typeof c === 'object' && c.cartItemId && c.menuItem);
            setCart(validCart);
          }
          if (parsed.discount && typeof parsed.discount === 'object' && typeof parsed.discount.amount === 'number') {
            setDiscount(parsed.discount);
          }
          if (parsed.branches && Array.isArray(parsed.branches)) {
            setBranches(parsed.branches);
            if (parsed.branchId) {
              const b = parsed.branches.find((item: Branch) => item.id === parsed.branchId);
              if (b) setCurrentBranch(b);
            }
          } else if (parsed.branchId) {
            const b = INITIAL_BRANCHES.find(item => item.id === parsed.branchId);
            if (b) setCurrentBranch(b);
          }

          console.log(`[POS Storage Sync] ✅ Successfully loaded and validated state from LocalStorage. Loaded: ${loadedOrdersCount} orders, ${loadedMenuItemsCount} menu items, ${loadedShiftsCount} cash shifts.`);
        } else {
          console.warn('[POS Storage Sync] ⚠️ Stored JSON was invalid format. Initializing with defaults.');
        }
      } else {
        console.log('[POS Storage Sync] ℹ️ No prior LocalStorage state found. Initializing new POS session.');
        try {
          const sepOrders = localStorage.getItem('POS_ORDERS_DATA');
          if (sepOrders) {
            const parsedSep = JSON.parse(sepOrders);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              setOrders(parsedSep);
              console.log(`[POS Storage Sync] 🛡️ Recovered ${parsedSep.length} orders from resilient POS_ORDERS_DATA backup.`);
            }
          }
        } catch (e) {
          console.warn('[POS Storage Sync] Failed to recover POS_ORDERS_DATA on empty session', e);
        }
        try {
          const sepIng = localStorage.getItem('POS_INGREDIENTS_DATA');
          if (sepIng) {
            const parsedSep = JSON.parse(sepIng);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              setIngredients(parsedSep);
              console.log(`[POS Storage Sync] 🛡️ Recovered ${parsedSep.length} ingredients from resilient POS_INGREDIENTS_DATA backup.`);
            }
          }
        } catch (e) {}
        try {
          const sepMenu = localStorage.getItem('POS_MENU_ITEMS_DATA');
          if (sepMenu) {
            const parsedSep = JSON.parse(sepMenu);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              setMenuItems(parsedSep);
              console.log(`[POS Storage Sync] 🛡️ Recovered ${parsedSep.length} menu items from resilient POS_MENU_ITEMS_DATA backup.`);
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('[POS Storage Sync] ❌ Failed to load state from LocalStorage:', err);
    } finally {
      setIsStorageLoaded(true);
    }
  }, []);

  // Auto-pull incoming central orders on app startup (DO NOT auto-pull menus/inventory to protect local edits!)
  useEffect(() => {
    if (!isStorageLoaded) return;
    console.log('[POS Startup] ☁️ Pulling central orders from Firestore...');
    pullCloudOrders();
  }, [isStorageLoaded, pullCloudOrders]);

  // Synchronize users state with staffMembers automatically so PIN screen and login reflect latest staff edits
  useEffect(() => {
    if (!isStorageLoaded) return;
    if (!staffMembers || staffMembers.length === 0) return;

    const colors = [
      'from-amber-500 to-orange-600',
      'from-emerald-500 to-teal-600',
      'from-sky-500 to-blue-600',
      'from-rose-500 to-pink-600',
      'from-purple-500 to-indigo-600',
      'from-teal-500 to-emerald-600'
    ];

    const activeStaff = staffMembers
      .filter(s => s.status !== 'inactive')
      .filter(s => !s.name?.includes('สมศักดิ์'));

    const staffAsUsers: User[] = activeStaff.map((staff, idx) => {
      const existingUser = users.find(u => u.id === staff.id);
      let role: UserRole = 'staff';
      const roleLower = (staff.role || '').toLowerCase();
      if (roleLower.includes('ผู้จัดการ') || roleLower.includes('manager')) {
        role = 'manager';
      } else if (roleLower.includes('เจ้าของ') || roleLower.includes('เชฟใหญ่') || roleLower.includes('admin') || roleLower.includes('แอดมิน')) {
        role = 'admin';
      } else if (roleLower.includes('แคชเชียร์') || roleLower.includes('cashier')) {
        role = 'cashier';
      }

      return {
        id: staff.id,
        name: staff.name,
        role,
        pin: staff.pin || '1234',
        branchId: staff.branchId,
        avatarColor: existingUser?.avatarColor || colors[idx % colors.length],
        permissions: staff.permissions
      };
    });

    const defaultAdmin = INITIAL_USERS[0];
    const extraAdmin = users.find(u => u.id === 'usr-admin' && !staffAsUsers.some(s => s.id === 'usr-admin'));
    const safeAdmin = extraAdmin ? { ...extraAdmin, name: extraAdmin.name?.includes('สมศักดิ์') ? 'อาห์มัด (เจ้าของร้าน)' : extraAdmin.name } : defaultAdmin;
    const finalUsers = staffAsUsers.some(s => s.id === 'usr-admin' || s.name?.includes('อาห์มัด'))
      ? staffAsUsers
      : [safeAdmin, ...staffAsUsers];

    const isDifferent =
      finalUsers.length !== users.length ||
      finalUsers.some((fu, idx) => {
        const u = users[idx];
        return !u || u.id !== fu.id || u.name !== fu.name || u.pin !== fu.pin || u.role !== fu.role;
      });

    if (isDifferent) {
      setUsers(finalUsers);
    }
  }, [staffMembers, isStorageLoaded, users]);

  // Keep categories in sync with all current menuItems so newly added/imported categories never disappear
  useEffect(() => {
    if (!isStorageLoaded) return;
    if (!menuItems || menuItems.length === 0) return;

    setCategories(prev => {
      const healed = syncAndHealCategories(prev, menuItems);
      if (
        healed.length !== prev.length ||
        healed.some((c, i) => !prev[i] || prev[i].id !== c.id || prev[i].name !== c.name)
      ) {
        return healed;
      }
      return prev;
    });
  }, [menuItems, isStorageLoaded]);

  // Save state to localStorage whenever state updates (strictly ONLY after initial load completes)
  useEffect(() => {
    if (!isStorageLoaded) {
      console.log('[POS Storage Sync] ⏳ Storage load in progress... Skipping initial save to preserve existing LocalStorage.');
      return;
    }

    try {
      const stateToSave = {
        cart,
        discount,
        categories,
        ingredientCategories,
        ingredientUnits,
        menuItems,
        deletedMenuItemIds,
        addOns,
        ingredients,
        stockLots,
        wasteLogs,
        stockAdjustmentLogs,
        staffMembers,
        shifts,
        shiftSwapRequests,
        cashShifts,
        orders,
        expenses,
        incomes,
        settings,
        securityLogs,
        autoApproveQR,
        tables,
        users,
        branches,
        currentBranch,
        branchId: currentBranch?.id,
        savedAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (storageErr) {
        console.warn('[POS Storage Sync] ⚠️ LocalStorage quota exceeded or save error. Performing self-healing storage compaction...', storageErr);
        // Prune heavy image payloads while keeping all core business, stock, financial and accounting data 100% intact
        const compactedExpenses = expenses.map(e => {
          if (e.receiptImage && e.receiptImage.length > 50000) {
            return { ...e, receiptImage: undefined };
          }
          return e;
        });
        const compactedIncomes = incomes.map(i => {
          if (i.slipImage && i.slipImage.length > 50000) {
            return { ...i, slipImage: undefined };
          }
          return i;
        });
        const compactedState = {
          ...stateToSave,
          expenses: compactedExpenses,
          incomes: compactedIncomes
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compactedState));
        console.log('[POS Storage Sync] ✅ Successfully recovered and saved state after image compaction.');
      }
      try {
        localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(orders));
      } catch (backupErr) {
        console.warn('[POS Storage Sync] ⚠️ Failed to save POS_ORDERS_DATA backup:', backupErr);
      }
      try {
        localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(ingredients));
      } catch (backupErr) {}
      try {
        localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(menuItems));
      } catch (backupErr) {}
      try {
        localStorage.setItem('POS_DELETED_MENU_IDS', JSON.stringify(deletedMenuItemIds));
      } catch (backupErr) {}
      try {
        localStorage.setItem('POS_BRANCHES_DATA', JSON.stringify(branches));
      } catch (backupErr) {}
      const pendingSync = orders.filter(o => o.isOfflineOrder && !o.isSynced).length;
      console.log(`[POS Storage Sync] 💾 Persisted state & order draft (${cart.length} items) to LocalStorage at ${stateToSave.savedAt}. Orders: ${orders.length} (${pendingSync} pending sync), Cash Shifts: ${cashShifts.length}.`);
    } catch (err) {
      console.error('[POS Storage Sync] ❌ Failed to save state to LocalStorage:', err);
    }
  }, [
    isStorageLoaded,
    cart,
    discount,
    categories,
    ingredientCategories,
    ingredientUnits,
    menuItems,
    deletedMenuItemIds,
    addOns,
    ingredients,
    stockLots,
    wasteLogs,
    stockAdjustmentLogs,
    staffMembers,
    shifts,
    shiftSwapRequests,
    cashShifts,
    orders,
    expenses,
    incomes,
    settings,
    autoApproveQR,
    tables,
    users,
    branches,
    currentBranch
  ]);

  const updateBranch = (updatedBranch: Branch) => {
    setBranches(prev => prev.map(b => b.id === updatedBranch.id ? updatedBranch : b));
    if (currentBranch.id === updatedBranch.id) {
      setCurrentBranch(updatedBranch);
    }
  };

  const addBranch = (branchData: Omit<Branch, 'id'>) => {
    const newBranch: Branch = {
      ...branchData,
      id: `branch-${Date.now()}`
    };
    setBranches(prev => [...prev, newBranch]);
    setCurrentBranch(newBranch);
  };

  const deleteBranch = (branchId: string) => {
    setBranches(prev => {
      const filtered = prev.filter(b => b.id !== branchId);
      if (currentBranch.id === branchId && filtered.length > 0) {
        setCurrentBranch(filtered[0]);
      }
      return filtered;
    });
  };

  const addTable = (tableName: string) => {
    const trimmed = tableName.trim();
    if (!trimmed) return;
    setTables(prev => {
      const next = prev.includes(trimmed) ? prev : [...prev, trimmed];
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncTablesToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const updateTable = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setTables(prev => {
      const next = prev.map(t => t === oldName ? trimmed : t);
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncTablesToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const deleteTable = (tableName: string) => {
    setTables(prev => {
      const next = prev.filter(t => t !== tableName);
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncTablesToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const updateSettings = (newSettings: Partial<SystemSettings>) => {
    let newPromptPay = newSettings.promptpayMobileOrTaxId || newSettings.promptPayId;
    if (!newPromptPay && newSettings.qrPaymentMethods) {
      const pmPromptPay = newSettings.qrPaymentMethods.find(m => m.type === 'promptpay');
      if (pmPromptPay?.accountNumber) {
        newPromptPay = pmPromptPay.accountNumber.trim();
      }
    }

    const updatedSettings: SystemSettings = {
      ...settings,
      ...newSettings,
      ...(newPromptPay ? { promptpayMobileOrTaxId: newPromptPay, promptPayId: newPromptPay } : {})
    };

    setSettings(updatedSettings);

    const newTaxId = newSettings.taxId || newSettings.shopTaxId;
    const newShopName = newSettings.shopName;
    const newShopAddress = newSettings.shopAddress;
    const newShopPhone = newSettings.shopPhone;

    if (newPromptPay || newTaxId || newShopName || newShopAddress || newShopPhone) {
      setCurrentBranch(prevBranch => {
        if (!prevBranch) return prevBranch;
        const updated = {
          ...prevBranch,
          ...(newPromptPay ? { promptpayMobileOrTaxId: newPromptPay } : {}),
          ...(newTaxId ? { taxId: newTaxId } : {}),
          ...(newShopName ? { name: newShopName } : {}),
          ...(newShopAddress ? { address: newShopAddress } : {}),
          ...(newShopPhone ? { phone: newShopPhone } : {})
        };
        setBranches(prev => prev.map(b => b.id === updated.id ? updated : b));
        if (isFirebaseAvailable() && !effectiveOffline) {
          syncBranchToFirestore(updated).catch(console.warn);
        }
        return updated;
      });
    }

    if (isFirebaseAvailable() && !effectiveOffline) {
      syncSettingsToFirestore(updatedSettings, currentBranch.id).catch(console.warn);
    }
  };

  // Menu Item CRUD
  const addMenuItem = (itemData: Omit<MenuItem, 'id'>) => {
    const newItem: MenuItem = {
      ...itemData,
      id: `menu-${Date.now()}`
    };
    setMenuItems(prev => {
      const next = [...prev, newItem];
      try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    syncSingleMenuItemToFirestore(newItem).catch(err => {
      console.warn('[POS Menu Sync] Failed to sync new menu item to Cloud:', err);
    });
  };

  const updateMenuItem = (item: MenuItem) => {
    setMenuItems(prev => {
      const next = prev.map(m => (m.id === item.id ? item : m));
      try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    syncSingleMenuItemToFirestore(item).catch(err => {
      console.warn('[POS Menu Sync] Failed to sync updated menu item to Cloud:', err);
    });
  };

  const deleteMenuItem = (itemId: string) => {
    // Find target item to get its name and identify any duplicate copies
    const targetItem = menuItems.find(m => m.id === itemId);
    const itemName = targetItem?.name;

    const idsToDelete = [itemId];
    if (itemName && itemName.trim()) {
      menuItems.forEach(m => {
        if (m.name.trim() === itemName.trim() && !idsToDelete.includes(m.id)) {
          idsToDelete.push(m.id);
        }
      });
    }

    // Persist to deletedMenuItemIds state and storage
    setDeletedMenuItemIds(prev => {
      const next = Array.from(new Set([...prev, ...idsToDelete, ...(itemName ? [itemName.trim()] : [])]));
      try {
        localStorage.setItem('POS_DELETED_MENU_IDS', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Remove from local state and update local storage immediately
    setMenuItems(prev => {
      const next = prev.filter(m => !idsToDelete.includes(m.id) && !(itemName && m.name.trim() === itemName.trim()));
      try {
        localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next));
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.menuItems = next;
          parsed.deletedMenuItemIds = Array.from(new Set([...(parsed.deletedMenuItemIds || []), ...idsToDelete, ...(itemName ? [itemName.trim()] : [])]));
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });

    // Delete matching items from Firestore
    idsToDelete.forEach(id => {
      deleteMenuItemFromFirestore(id, itemName).catch(err => {
        console.warn('[POS Menu Sync] Failed to delete menu item from Cloud:', err);
      });
    });
  };

  const updateMenuItemRecipe = (menuItemId: string, recipe: RecipeIngredient[], costPrice: number) => {
    setMenuItems(prev => {
      const updatedList = prev.map(m => (m.id === menuItemId ? { ...m, recipe, costPrice } : m));
      try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(updatedList)); } catch (e) {}
      const target = updatedList.find(m => m.id === menuItemId);
      if (target) {
        syncSingleMenuItemToFirestore(target).catch(err => {
          console.warn('[POS Menu Sync] Failed to sync recipe to Cloud:', err);
        });
      }
      return updatedList;
    });
  };

  const toggleMenuItemAddOns = (menuItemId: string, allow?: boolean) => {
    setMenuItems(prev => {
      const next = prev.map(m => {
        if (m.id === menuItemId) {
          const currentAllow = m.allowAddOns !== false;
          const nextAllow = allow !== undefined ? allow : !currentAllow;
          return { ...m, allowAddOns: nextAllow };
        }
        return m;
      });
      try { localStorage.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next)); } catch (e) {}
      const target = next.find(m => m.id === menuItemId);
      if (target && isFirebaseAvailable() && !effectiveOffline) {
        syncSingleMenuItemToFirestore(target).catch(console.warn);
      }
      return next;
    });
  };

  // AddOn / Topping CRUD
  const addAddOn = (addonData: Omit<AddOnOption, 'id'>) => {
    const newAddon: AddOnOption = {
      ...addonData,
      id: `addon-${Date.now()}`
    };
    setAddOns(prev => {
      const next = [...prev, newAddon];
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncAddOnsToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const updateAddOn = (addon: AddOnOption) => {
    setAddOns(prev => {
      const next = prev.map(a => (a.id === addon.id ? addon : a));
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncAddOnsToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const deleteAddOn = (addonId: string) => {
    setAddOns(prev => {
      const next = prev.filter(a => a.id !== addonId);
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncAddOnsToFirestore(next, currentBranch.id).catch(console.warn);
      }
      return next;
    });
  };

  const playKitchenChime = () => {
    if (!settings.enableKitchenSound) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.log('Audio chime error:', err);
    }
  };

  // Cart Management
  const addToCart = (
    item: MenuItem,
    quantity = 1,
    spiceLevel?: SpiceLevel,
    proteinChoice?: { name: ProteinChoice; extraPrice: number },
    addOns: AddOnOption[] = [],
    specialNotes?: string
  ) => {
    // Calculate unit price based on base price + protein extra + add-ons
    let unitPrice = item.price;
    if (proteinChoice?.extraPrice) {
      unitPrice += proteinChoice.extraPrice;
    }
    const addOnsTotal = addOns.reduce((sum, addon) => sum + addon.price, 0);
    unitPrice += addOnsTotal;

    const cartItemId = `${item.id}-${spiceLevel || 'default'}-${proteinChoice?.name || 'normal'}-${addOns.map(a => a.id).sort().join('-')}-${specialNotes || ''}`;

    setCart(prev => {
      const existingIndex = prev.findIndex(c => c.cartItemId === cartItemId);
      if (existingIndex > -1) {
        const updated = [...prev];
        const currentItem = updated[existingIndex];
        const newQty = currentItem.quantity + quantity;
        updated[existingIndex] = {
          ...currentItem,
          quantity: newQty,
          totalPrice: newQty * currentItem.unitPrice
        };
        return updated;
      }

      return [
        ...prev,
        {
          cartItemId,
          menuItem: item,
          quantity,
          spiceLevel,
          proteinChoice,
          selectedAddOns: addOns,
          specialNotes,
          unitPrice,
          totalPrice: unitPrice * quantity
        }
      ];
    });
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.cartItemId === cartItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalPrice: newQty * item.unitPrice
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const setCartItemQuantity = (cartItemId: string, exactQty: number) => {
    setCart(prev => {
      if (exactQty <= 0) {
        return prev.filter(item => item.cartItemId !== cartItemId);
      }
      return prev.map(item => {
        if (item.cartItemId === cartItemId) {
          return {
            ...item,
            quantity: exactQty,
            totalPrice: exactQty * item.unitPrice
          };
        }
        return item;
      });
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount({ amount: 0, type: 'fixed' });
  };

  // Create order & automatic ingredient stock deduction
  const createOrder = (
    paymentMethod: PaymentMethod,
    tenderedAmount: number,
    orderType: OrderType,
    tableNumber?: string,
    taxInvoiceCustomer?: CustomerTaxInfo,
    isFullTaxInvoiceRequested = false
  ): Order => {
    const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    let calculatedDiscount = 0;
    if (discount.type === 'fixed') {
      calculatedDiscount = Math.min(discount.amount, rawSubtotal);
    } else {
      calculatedDiscount = (rawSubtotal * Math.min(discount.amount, 100)) / 100;
    }

    const { vatAmount, grandTotal } = calculateOrderTotals(rawSubtotal, calculatedDiscount, settings);
    const changeAmount = paymentMethod === 'cash' ? Math.max(0, tenderedAmount - grandTotal) : 0;

    const orderNumber = `#KAP-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      branchId: currentBranch.id,
      orderType,
      tableNumber: orderType === 'dine-in' ? tableNumber || 'T-01' : undefined,
      items: [...cart],
      subtotal: rawSubtotal,
      discountAmount: calculatedDiscount,
      discountType: discount.type,
      discountNote: discount.note,
      vatAmount,
      grandTotal,
      paymentMethod,
      tenderedAmount,
      changeAmount,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
      customerTaxInfo: taxInvoiceCustomer,
      isFullTaxInvoiceRequested,
      isOfflineOrder: effectiveOffline,
      isSynced: !effectiveOffline,
      syncedAt: effectiveOffline ? undefined : nowIso,
      isQrOrder: false,
      orderSource: 'pos'
    };
    newOrder.checksum = computeOrderChecksum(newOrder);

    // Deduct raw ingredients from inventory automatically based on recipes
    setIngredients(prevIngredients => {
      const updated = [...prevIngredients];

      cart.forEach(cartItem => {
        const qty = cartItem.quantity;
        // Deduct base menu recipe
        cartItem.menuItem.recipe.forEach(rec => {
          const ingIndex = updated.findIndex(ing => ing.id === rec.ingredientId);
          if (ingIndex > -1) {
            const ing = updated[ingIndex];
            const needed = calcRecipeItemCostAndDeduction(ing, rec.amountNeeded, rec.recipeUnit).stockDeduction * qty;
            updated[ingIndex] = {
              ...ing,
              currentStock: Math.max(0, ing.currentStock - needed)
            };
          }
        });

        // Deduct selected add-ons recipe
        cartItem.selectedAddOns.forEach(addon => {
          if (addon.recipe && addon.recipe.length > 0) {
            addon.recipe.forEach(rec => {
              const ingIndex = updated.findIndex(ing => ing.id === rec.ingredientId);
              if (ingIndex > -1) {
                const ing = updated[ingIndex];
                const needed = calcRecipeItemCostAndDeduction(ing, rec.amountNeeded, rec.recipeUnit).stockDeduction * qty;
                updated[ingIndex] = {
                  ...ing,
                  currentStock: Math.max(0, ing.currentStock - needed)
                };
              }
            });
          } else if (addon.ingredientId && addon.ingredientAmount) {
            const ingIndex = updated.findIndex(ing => ing.id === addon.ingredientId);
            if (ingIndex > -1) {
              const ing = updated[ingIndex];
              const needed = calcRecipeItemCostAndDeduction(ing, addon.ingredientAmount).stockDeduction * qty;
              updated[ingIndex] = {
                ...ing,
                currentStock: Math.max(0, ing.currentStock - needed)
              };
            }
          }
        });
      });

      return updated;
    });

    setOrders(prev => [newOrder, ...prev]);
    clearCart();
    playKitchenChime();

    // Real-time Push to Firebase Firestore
    if (!effectiveOffline && isFirebaseAvailable()) {
      syncOrderToFirestore(newOrder, currentBranch);
      syncInventoryToFirestore(ingredients, currentBranch);
    }

    // Real-Time Notification Trigger: New Order & Low Stock
    try {
      const triggers = getStoredTriggers();
      const rules = getStoredRules();

      // 1. New Order Notification
      if (triggers.newOrder && (newOrder.grandTotal || 0) >= (rules.minOrderAmount || 0)) {
        const msg = generateNewOrderMessage(newOrder, currentBranch, settings);
        dispatchNotification(`ออเดอร์ใหม่ (${newOrder.orderNumber})`, msg).catch(console.error);
      }

      // 2. Low Stock Detection Notification (debounced 15 mins)
      if (triggers.lowStock) {
        setTimeout(() => {
          setIngredients(currIngredients => {
            const lowItems = currIngredients.filter(i => {
              if (rules.onlyCriticalStock) {
                return i.currentStock <= (i.minStockAlert * 0.2);
              }
              return i.currentStock <= i.minStockAlert;
            });
            const lastAlertTime = parseInt(localStorage.getItem('kaprao_last_low_stock_alert_time') || '0', 10);
            const nowMs = Date.now();
            if (lowItems.length > 0 && (nowMs - lastAlertTime > 15 * 60 * 1000)) {
              localStorage.setItem('kaprao_last_low_stock_alert_time', nowMs.toString());
              const msg = generateLowStockMessage(lowItems, currentBranch, rules.onlyCriticalStock);
              dispatchNotification('เตือนวัตถุดิบใกล้หมดสต็อก', msg).catch(console.error);
            }
            return currIngredients;
          });
        }, 150);
      }
    } catch (err) {
      console.warn('[POS Notification] Order trigger error:', err);
    }

    return newOrder;
  };

  const createDirectOrder = (
    items: CartItem[],
    tableNumber: string,
    orderType: OrderType = 'dine-in',
    notes?: string,
    initialStatus: OrderStatus = 'pending',
    customerNickname?: string,
    paymentMethod: PaymentMethod = 'promptpay'
  ): Order => {
    const rawSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const { vatAmount, grandTotal } = calculateOrderTotals(rawSubtotal, 0, settings);
    const orderNumber = `#KAP-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const noteText = customerNickname
      ? `ชื่อลูกค้า: ${customerNickname}${notes ? ' (' + notes + ')' : ''}`
      : notes ? `QR Table Order: ${notes}` : 'QR Table Order';

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      branchId: currentBranch.id,
      orderType,
      tableNumber: orderType === 'dine-in' ? tableNumber : undefined,
      items: [...items],
      subtotal: rawSubtotal,
      discountAmount: 0,
      discountType: 'fixed',
      vatAmount,
      grandTotal,
      paymentMethod,
      tenderedAmount: grandTotal,
      changeAmount: 0,
      status: initialStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
      discountNote: noteText,
      isOfflineOrder: effectiveOffline,
      isSynced: !effectiveOffline,
      syncedAt: effectiveOffline ? undefined : nowIso,
      isQrOrder: true,
      orderSource: 'qr'
    };
    newOrder.checksum = computeOrderChecksum(newOrder);

    // Deduct raw ingredients from inventory automatically based on recipes
    setIngredients(prevIngredients => {
      const updated = [...prevIngredients];

      items.forEach(cartItem => {
        const qty = cartItem.quantity;

        // Deduct menu item recipe
        cartItem.menuItem.recipe.forEach(rec => {
          const ingIndex = updated.findIndex(ing => ing.id === rec.ingredientId);
          if (ingIndex > -1) {
            const ing = updated[ingIndex];
            const needed = calcRecipeItemCostAndDeduction(ing, rec.amountNeeded, rec.recipeUnit).stockDeduction * qty;
            updated[ingIndex] = {
              ...ing,
              currentStock: Math.max(0, ing.currentStock - needed)
            };
          }
        });

        // Deduct selected add-ons recipe
        cartItem.selectedAddOns.forEach(addon => {
          if (addon.recipe && addon.recipe.length > 0) {
            addon.recipe.forEach(rec => {
              const ingIndex = updated.findIndex(ing => ing.id === rec.ingredientId);
              if (ingIndex > -1) {
                const ing = updated[ingIndex];
                const needed = calcRecipeItemCostAndDeduction(ing, rec.amountNeeded, rec.recipeUnit).stockDeduction * qty;
                updated[ingIndex] = {
                  ...ing,
                  currentStock: Math.max(0, ing.currentStock - needed)
                };
              }
            });
          } else if (addon.ingredientId && addon.ingredientAmount) {
            const ingIndex = updated.findIndex(ing => ing.id === addon.ingredientId);
            if (ingIndex > -1) {
              const ing = updated[ingIndex];
              const needed = calcRecipeItemCostAndDeduction(ing, addon.ingredientAmount).stockDeduction * qty;
              updated[ingIndex] = {
                ...ing,
                currentStock: Math.max(0, ing.currentStock - needed)
              };
            }
          }
        });
      });

      return updated;
    });

    setOrders(prev => [newOrder, ...prev]);
    playKitchenChime();

    // Real-time Push to Firebase Firestore
    if (!effectiveOffline && isFirebaseAvailable()) {
      syncOrderToFirestore(newOrder, currentBranch);
      syncInventoryToFirestore(ingredients, currentBranch);
    }

    // Real-Time Notification Trigger: QR / Direct Order
    try {
      const triggers = getStoredTriggers();
      const rules = getStoredRules();
      if (triggers.newOrder && (newOrder.grandTotal || 0) >= (rules.minOrderAmount || 0)) {
        const msg = generateNewOrderMessage(newOrder, currentBranch, settings);
        dispatchNotification(`ออเดอร์ใหม่ QR (${newOrder.orderNumber})`, msg).catch(console.error);
      }
    } catch (err) {
      console.warn('[POS Notification] Direct order trigger error:', err);
    }

    return newOrder;
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const now = new Date().toISOString();
    let updatedTarget: Order | undefined;

    setOrders(prev => {
      const next = prev.map(ord => {
        if (ord.id === orderId) {
          const completedAt = status === 'served' ? (ord.completedAt || now) : ord.completedAt;
          const cancelledBy = status === 'cancelled' && !ord.cancelledBy ? {
            userId: currentUser?.id,
            userName: currentUser?.name || 'ผู้จัดการ',
            role: currentUser?.role || 'admin',
            cancelledAt: now
          } : ord.cancelledBy;
          const cancelReason = status === 'cancelled' && !ord.cancelReason ? 'ยกเลิกรายการโดยพนักงาน' : ord.cancelReason;

          const updated: Order = {
            ...ord,
            status,
            updatedAt: now,
            completedAt,
            cancelledBy,
            cancelReason,
            isSynced: !effectiveOffline
          };
          updatedTarget = updated;
          return updated;
        }
        return ord;
      });

      // Synchronously write to LocalStorage immediately so page refresh retains state
      try {
        localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(next));
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.orders = next;
          parsed.savedAt = now;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {
        console.warn('[POS Order Sync] Error writing order status to LocalStorage:', e);
      }

      return next;
    });

    // Update Firestore in real-time
    if (updatedTarget && !effectiveOffline && isFirebaseAvailable()) {
      updateOrderStatusInFirestore(orderId, status, {
        completedAt: updatedTarget.completedAt,
        cancelledBy: updatedTarget.cancelledBy,
        cancelReason: updatedTarget.cancelReason,
        cancelNote: updatedTarget.cancelNote
      }).catch(err => {
        console.warn('[POS Order Sync] Failed to update order status in Firestore:', err);
      });
    }
  };

  const cancelOrder = (
    orderId: string,
    reason: string,
    note?: string,
    cancelledByInfo?: { userId?: string; userName: string; role: string }
  ) => {
    const now = new Date().toISOString();
    const operator = cancelledByInfo || {
      userId: currentUser?.id,
      userName: currentUser?.name || 'ผู้จัดการ',
      role: currentUser?.role || 'admin'
    };

    let updatedTarget: Order | undefined;

    setOrders(prev => {
      const next = prev.map(ord => {
        if (ord.id === orderId) {
          const updated: Order = {
            ...ord,
            status: 'cancelled',
            cancelReason: reason,
            cancelNote: note,
            cancelledBy: {
              userId: operator.userId,
              userName: operator.userName,
              role: operator.role,
              cancelledAt: now
            },
            updatedAt: now,
            isSynced: !effectiveOffline
          };
          updatedTarget = updated;
          return updated;
        }
        return ord;
      });

      try {
        localStorage.setItem('POS_ORDERS_DATA', JSON.stringify(next));
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.orders = next;
          parsed.savedAt = now;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}

      return next;
    });

    // Real-time Push to Firestore
    if (updatedTarget && !effectiveOffline && isFirebaseAvailable()) {
      updateOrderStatusInFirestore(orderId, 'cancelled', {
        cancelReason: reason,
        cancelNote: note,
        cancelledBy: {
          userId: operator.userId,
          userName: operator.userName,
          role: operator.role,
          cancelledAt: now
        }
      }).catch(err => {
        console.warn('[POS Order Sync] Failed to update cancelled order status in Firestore:', err);
      });
    }

    // Real-Time Notification Trigger: Void Order Alert
    try {
      const triggers = getStoredTriggers();
      const rules = getStoredRules();
      const targetOrder = orders.find(o => o.id === orderId);
      if (triggers.voidOrder && targetOrder && (targetOrder.grandTotal || 0) >= (rules.minVoidAmount || 0)) {
        const msg = generateVoidOrderMessage(targetOrder, reason, note, operator.userName, currentBranch);
        dispatchNotification(`ยกเลิกบิล (${targetOrder.orderNumber})`, msg).catch(console.error);
      }
    } catch (err) {
      console.warn('[POS Notification] Void order trigger error:', err);
    }
  };

  const updateOrderTaxInfo = (orderId: string, taxInfo: CustomerTaxInfo) => {
    setOrders(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          return {
            ...ord,
            customerTaxInfo: taxInfo,
            isFullTaxInvoiceRequested: true,
            updatedAt: new Date().toISOString()
          };
        }
        return ord;
      })
    );
  };

  const addTaxInvoiceOrder = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
  };

  // Inventory functions
  const addIngredient = (ingData: Omit<Ingredient, 'id'>): Ingredient => {
    const newIng: Ingredient = {
      ...ingData,
      id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    setIngredients(prev => {
      const next = [...prev, newIng];
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    syncIngredientToFirestore(newIng, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
      console.warn('[POS Inventory Sync] Failed to sync added ingredient to Cloud:', err);
    });
    return newIng;
  };

  const updateIngredient = (updatedIng: Ingredient) => {
    setIngredients(prev => {
      const next = prev.map(ing => (ing.id === updatedIng.id ? updatedIng : ing));
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    syncIngredientToFirestore(updatedIng, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
      console.warn('[POS Inventory Sync] Failed to sync updated ingredient to Cloud:', err);
    });
  };

  const deleteIngredients = (ingredientIds: string[]) => {
    const idSet = new Set(ingredientIds);
    const itemsToDelete = ingredients.filter(ing => idSet.has(ing.id));

    setIngredients(prev => {
      const next = prev.filter(ing => !idSet.has(ing.id));
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    setDeletedIngredientIds(prev => {
      const next = Array.from(new Set([...prev, ...ingredientIds, ...itemsToDelete.map(i => i.name.trim())]));
      try { localStorage.setItem('POS_DELETED_ING_IDS', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    itemsToDelete.forEach(item => {
      deleteIngredientFromFirestore(item.id, currentBranch?.id || 'branch-1786349847821', item.name).catch(err => {
        console.warn('[POS Inventory Sync] Failed to delete ingredient from Cloud:', err);
      });
    });
  };

  const bulkUpdateIngredients = (ingredientIds: string[], updates: Partial<Omit<Ingredient, 'id'>>) => {
    const idSet = new Set(ingredientIds);
    setIngredients(prev => {
      const next = prev.map(ing => {
        if (idSet.has(ing.id)) {
          const updated = { ...ing, ...updates };
          syncIngredientToFirestore(updated, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
            console.warn('[POS Inventory Sync] Failed to sync bulk updated ingredient to Cloud:', err);
          });
          return updated;
        }
        return ing;
      });
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const updateIngredientStock = (ingredientId: string, newStock: number) => {
    setIngredients(prev => {
      const next = prev.map(ing => {
        if (ing.id === ingredientId) {
          const updated = { ...ing, currentStock: Math.max(0, newStock) };
          syncIngredientToFirestore(updated, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
            console.warn('[POS Inventory Sync] Failed to sync stock to Cloud:', err);
          });
          return updated;
        }
        return ing;
      });
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const updateIngredientPriceAndRecalculate = (
    ingredientId: string,
    newUnitCost: number,
    updatedMenuPrices?: Record<string, number>
  ) => {
    // 1. Update ingredient unit cost
    setIngredients(prev => {
      const next = prev.map(ing => {
        if (ing.id === ingredientId) {
          const updated = { ...ing, unitCost: newUnitCost };
          syncIngredientToFirestore(updated, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
            console.warn('[POS Inventory Sync] Failed to sync unit cost to Cloud:', err);
          });
          return updated;
        }
        return ing;
      });
      try { localStorage.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    // Create lookup map for updated ingredient costs
    const ingCostMap = new Map<string, number>();
    ingredients.forEach(i => ingCostMap.set(i.id, i.id === ingredientId ? newUnitCost : i.unitCost));

    // 2. Recalculate cost for affected menu items (and update retail price if provided)
    setMenuItems(prev =>
      prev.map(item => {
        if (!item.recipe || item.recipe.length === 0) return item;
        const usesIngredient = item.recipe.some(r => r.ingredientId === ingredientId);

        let recalculatedCost = 0;
        item.recipe.forEach(r => {
          const ingObj = ingredients.find(i => i.id === r.ingredientId);
          const costPerUnit = r.ingredientId === ingredientId ? newUnitCost : (ingCostMap.get(r.ingredientId) ?? 0);
          const lineCost = calcRecipeItemCostAndDeduction(
            ingObj ? { ...ingObj, unitCost: costPerUnit } : { unit: 'pcs', unitCost: costPerUnit },
            r.amountNeeded,
            r.recipeUnit
          ).lineCost;
          recalculatedCost += lineCost;
        });

        const newPrice = (updatedMenuPrices && updatedMenuPrices[item.id] !== undefined)
          ? updatedMenuPrices[item.id]
          : item.price;

        return {
          ...item,
          costPrice: recalculatedCost,
          price: newPrice
        };
      })
    );
  };

  const addStockLot = (lotData: Omit<StockLot, 'id'>) => {
    const newLot: StockLot = {
      ...lotData,
      id: `lot-${Date.now()}`
    };
    setStockLots(prev => [newLot, ...prev]);

    // Also increase current stock for that ingredient
    updateIngredientStock(
      lotData.ingredientId,
      (ingredients.find(i => i.id === lotData.ingredientId)?.currentStock || 0) + lotData.quantity
    );
  };

  // Waste Log operations
  const addWasteLog = (logData: Omit<WasteLog, 'id'>) => {
    const newLog: WasteLog = {
      ...logData,
      id: `waste-${Date.now()}`
    };
    setWasteLogs(prev => [newLog, ...prev]);

    // Deduct stock if ingredient exists
    const targetIng = ingredients.find(i => i.id === logData.ingredientId);
    if (targetIng) {
      updateIngredientStock(targetIng.id, Math.max(0, targetIng.currentStock - logData.quantity));
    }
  };

  const deleteWasteLog = (logId: string) => {
    setWasteLogs(prev => prev.filter(w => w.id !== logId));
  };

  // Accounting functions
  const addExpense = (expData: Omit<Expense, 'id'>) => {
    const newExp: Expense = {
      ...expData,
      id: `exp-${Date.now()}`
    };
    setExpenses(prev => {
      const updated = [newExp, ...prev];
      try {
        localStorage.setItem('POS_EXPENSES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache expense immediately, retrying compact', e);
        try {
          const compact = updated.map(item => (item.receiptImage && item.receiptImage.length > 50000) ? { ...item, receiptImage: undefined } : item);
          localStorage.setItem('POS_EXPENSES_DATA', JSON.stringify(compact));
        } catch (e2) {
          console.warn('Failed to cache compact expenses', e2);
        }
      }
      return updated;
    });

    if (isFirebaseAvailable()) {
      syncExpenseToFirestore(newExp, currentBranch).catch(err => {
        console.warn('[POSContext] Failed to sync expense to Firestore:', err);
      });
    }
  };

  const deleteExpense = (expenseId: string) => {
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== expenseId);
      try {
        localStorage.setItem('POS_EXPENSES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache expense deletion', e);
      }
      return updated;
    });

    if (isFirebaseAvailable()) {
      deleteExpenseFromFirestore(expenseId).catch(err => {
        console.warn('[POSContext] Failed to delete expense from Firestore:', err);
      });
    }
  };

  const addIncome = (incData: Omit<OtherIncome, 'id'>) => {
    const newInc: OtherIncome = {
      ...incData,
      id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    setIncomes(prev => {
      const updated = [newInc, ...prev];
      try {
        localStorage.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache income immediately, retrying compact', e);
        try {
          const compact = updated.map(item => (item.slipImage && item.slipImage.length > 50000) ? { ...item, slipImage: undefined } : item);
          localStorage.setItem('POS_INCOMES_DATA', JSON.stringify(compact));
        } catch (e2) {
          console.warn('Failed to cache compact incomes', e2);
        }
      }
      return updated;
    });

    if (isFirebaseAvailable()) {
      syncIncomeToFirestore(newInc, currentBranch).catch(err => {
        console.warn('[POSContext] Failed to sync income to Firestore:', err);
      });
    }
  };

  const updateIncome = (arg1: string | OtherIncome, arg2?: Partial<OtherIncome>) => {
    let targetToSync: OtherIncome | null = null;
    setIncomes(prev => {
      const updated = prev.map(inc => {
        if (typeof arg1 === 'string') {
          if (inc.id === arg1) {
            const merged = { ...inc, ...(arg2 || {}), id: arg1 };
            targetToSync = merged;
            return merged;
          }
          return inc;
        } else {
          if (inc.id === arg1.id) {
            const merged = { ...inc, ...arg1 };
            targetToSync = merged;
            return merged;
          }
          return inc;
        }
      });
      try {
        localStorage.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache updated income', e);
      }
      return updated;
    });

    if (targetToSync && isFirebaseAvailable()) {
      syncIncomeToFirestore(targetToSync, currentBranch).catch(err => {
        console.warn('[POSContext] Failed to sync updated income to Firestore:', err);
      });
    }
  };

  const deleteIncome = (incomeId: string) => {
    setIncomes(prev => {
      const updated = prev.filter(inc => inc.id !== incomeId);
      try {
        localStorage.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache deleted income', e);
      }
      return updated;
    });

    if (isFirebaseAvailable()) {
      deleteIncomeFromFirestore(incomeId).catch(err => {
        console.warn('[POSContext] Failed to delete income from Firestore:', err);
      });
    }
  };

  // Staff Scheduling & Payroll operations
  const addStaffMember = (staffData: Omit<StaffMember, 'id'>) => {
    const newStaff: StaffMember = {
      ...staffData,
      id: `staff-${Date.now()}`
    };
    setStaffMembers(prev => [...prev, newStaff]);
  };

  const updateStaffMember = (staffData: StaffMember) => {
    setStaffMembers(prev => prev.map(s => s.id === staffData.id ? staffData : s));
    if (currentUser?.id === staffData.id) {
      setCurrentUser(prev => ({
        ...prev,
        name: staffData.name,
        role: staffData.role as any,
        pin: staffData.pin || prev.pin,
        permissions: staffData.permissions
      }));
    }
  };

  const deleteStaffMember = (staffId: string) => {
    setStaffMembers(prev => {
      const updated = prev.filter(s => s.id !== staffId);
      if (currentUser?.id === staffId && updated.length > 0) {
        const fallback = updated.find(s => s.status === 'active') || updated[0];
        if (fallback) {
          setCurrentUser({
            id: fallback.id,
            name: fallback.name,
            role: fallback.role as any,
            pin: fallback.pin || '1234',
            avatarColor: 'from-amber-500 to-orange-600',
            permissions: fallback.permissions
          });
        }
      }
      return updated;
    });
    setShifts(prev => prev.filter(sh => sh.staffId !== staffId));
  };

  const addShift = (shiftData: Omit<ShiftEntry, 'id'>) => {
    const newShift: ShiftEntry = {
      ...shiftData,
      id: `shift-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    setShifts(prev => [...prev, newShift]);
  };

  const updateShift = (shiftData: ShiftEntry) => {
    setShifts(prev => prev.map(s => s.id === shiftData.id ? shiftData : s));
  };

  const deleteShift = (shiftId: string) => {
    setShifts(prev => prev.filter(s => s.id !== shiftId));
  };

  const saveWeeklyRoster = (newShifts: ShiftEntry[]) => {
    setShifts(prev => {
      const updatedMap = new Map<string, ShiftEntry>();
      prev.forEach(s => updatedMap.set(s.id, s));
      newShifts.forEach(ns => updatedMap.set(ns.id, ns));
      return Array.from(updatedMap.values());
    });
  };

  const addShiftSwapRequest = (reqData: Omit<ShiftSwapRequest, 'id' | 'createdAt' | 'status'>) => {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);
    const newReq: ShiftSwapRequest = {
      ...reqData,
      id: `swap-${Date.now()}`,
      createdAt: dateStr,
      status: 'pending'
    };
    setShiftSwapRequests(prev => [newReq, ...prev]);
  };

  const approveShiftSwapRequest = (requestId: string, managerComment?: string) => {
    const req = shiftSwapRequests.find(r => r.id === requestId);
    if (!req) return;

    setShiftSwapRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'approved',
          managerComment,
          approvedAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
      }
      return r;
    }));

    // Apply schedule changes if relevant
    if (req.requestType === 'swap' && req.targetStaffId) {
      setShifts(prevShifts => {
        const newShifts = [...prevShifts];
        const reqShiftIndex = newShifts.findIndex(s => s.staffId === req.requestorStaffId && s.date === req.requestorShiftDate);
        const targetDate = req.targetShiftDate || req.requestorShiftDate;
        const targetShiftIndex = newShifts.findIndex(s => s.staffId === req.targetStaffId && s.date === targetDate);

        if (reqShiftIndex !== -1 && targetShiftIndex !== -1) {
          const reqShift = newShifts[reqShiftIndex];
          const targetShift = newShifts[targetShiftIndex];

          newShifts[reqShiftIndex] = {
            ...reqShift,
            staffId: req.targetStaffId!,
            staffName: req.targetStaffName || reqShift.staffName,
            notes: `สลับกะกับ ${req.requestorStaffName} (อนุมัติแล้ว)`
          };

          newShifts[targetShiftIndex] = {
            ...targetShift,
            staffId: req.requestorStaffId,
            staffName: req.requestorStaffName,
            notes: `สลับกะกับ ${req.targetStaffName} (อนุมัติแล้ว)`
          };
        } else if (reqShiftIndex !== -1) {
          newShifts[reqShiftIndex] = {
            ...newShifts[reqShiftIndex],
            staffId: req.targetStaffId!,
            staffName: req.targetStaffName || newShifts[reqShiftIndex].staffName,
            notes: `สลับกะแทนโดย ${req.targetStaffName} (อนุมัติแล้ว)`
          };
        }
        return newShifts;
      });
    } else if (req.requestType === 'cover' && req.targetStaffId) {
      setShifts(prevShifts => {
        return prevShifts.map(s => {
          if (s.staffId === req.requestorStaffId && s.date === req.requestorShiftDate) {
            return {
              ...s,
              staffId: req.targetStaffId!,
              staffName: req.targetStaffName || s.staffName,
              notes: `คุมกะแทน ${req.requestorStaffName} (อนุมัติแล้ว)`
            };
          }
          return s;
        });
      });
    } else if (req.requestType === 'time_off') {
      setShifts(prevShifts => {
        return prevShifts.map(s => {
          if (s.staffId === req.requestorStaffId && s.date === req.requestorShiftDate) {
            return {
              ...s,
              shiftType: 'off',
              scheduledHours: 0,
              notes: `อนุมัติลาหยุด (${req.reason})`
            };
          }
          return s;
        });
      });
    }
  };

  const rejectShiftSwapRequest = (requestId: string, managerComment?: string) => {
    setShiftSwapRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'rejected',
          managerComment,
          approvedAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
      }
      return r;
    }));
  };

  // Backup & Restore
  const exportStateJSON = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      appName: 'Kaprao POS Enterprise',
      version: '1.0.0',
      branches,
      branch: currentBranch,
      branchId: currentBranch.id,
      categories,
      ingredientCategories,
      menuItems,
      addOns,
      ingredients,
      stockLots,
      wasteLogs,
      stockAdjustmentLogs,
      securityLogs,
      staffMembers,
      shifts,
      shiftSwapRequests,
      cashShifts,
      orders,
      expenses,
      incomes,
      settings,
      users,
      autoApproveQR,
      tables,
      discount,
      cart
    };
    return JSON.stringify(data, null, 2);
  };

  const importStateJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.branches && Array.isArray(parsed.branches)) setBranches(parsed.branches);
      if (parsed.branch && typeof parsed.branch === 'object') setCurrentBranch(parsed.branch);
      
      let importedMenuItems = menuItems;
      if (parsed.menuItems && Array.isArray(parsed.menuItems)) {
        const validItems = parsed.menuItems.filter((m: any) => m && typeof m === 'object' && m.id);
        setMenuItems(validItems);
        importedMenuItems = validItems;
      }

      if (parsed.categories && Array.isArray(parsed.categories)) {
        const healed = syncAndHealCategories(parsed.categories, importedMenuItems);
        setCategories(healed);
      } else if (parsed.menuItems && Array.isArray(parsed.menuItems)) {
        const healed = syncAndHealCategories(categories, importedMenuItems);
        setCategories(healed);
      }

      if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
        setIngredients(parsed.ingredients);
        if (parsed.ingredientCategories && Array.isArray(parsed.ingredientCategories)) {
          setIngredientCategories(syncAndHealIngredientCategories(parsed.ingredientCategories, parsed.ingredients));
        } else {
          setIngredientCategories(prev => syncAndHealIngredientCategories(prev, parsed.ingredients));
        }
      } else if (parsed.ingredientCategories && Array.isArray(parsed.ingredientCategories)) {
        setIngredientCategories(parsed.ingredientCategories);
      }

      if (parsed.addOns && Array.isArray(parsed.addOns)) setAddOns(parsed.addOns);
      if (parsed.stockLots && Array.isArray(parsed.stockLots)) setStockLots(parsed.stockLots);
      if (parsed.wasteLogs && Array.isArray(parsed.wasteLogs)) setWasteLogs(parsed.wasteLogs);
      if (parsed.stockAdjustmentLogs && Array.isArray(parsed.stockAdjustmentLogs)) setStockAdjustmentLogs(parsed.stockAdjustmentLogs);
      if (parsed.staffMembers && Array.isArray(parsed.staffMembers)) setStaffMembers(parsed.staffMembers);
      if (parsed.shifts && Array.isArray(parsed.shifts)) setShifts(parsed.shifts);
      if (parsed.shiftSwapRequests && Array.isArray(parsed.shiftSwapRequests)) setShiftSwapRequests(parsed.shiftSwapRequests);
      if (parsed.cashShifts && Array.isArray(parsed.cashShifts)) setCashShifts(parsed.cashShifts);
      if (parsed.orders && Array.isArray(parsed.orders)) setOrders(parsed.orders);
      if (parsed.expenses && Array.isArray(parsed.expenses)) setExpenses(parsed.expenses);
      if (parsed.incomes && Array.isArray(parsed.incomes)) setIncomes(parsed.incomes);
      if (parsed.settings && typeof parsed.settings === 'object') setSettings(parsed.settings);
      if (parsed.securityLogs && Array.isArray(parsed.securityLogs)) setSecurityLogs(parsed.securityLogs);
      if (parsed.users && Array.isArray(parsed.users)) setUsers(parsed.users);
      if (parsed.tables && Array.isArray(parsed.tables)) setTables(parsed.tables);
      if (parsed.cart && Array.isArray(parsed.cart)) setCart(parsed.cart);
      if (parsed.discount && typeof parsed.discount === 'object') setDiscount(parsed.discount);
      if (typeof parsed.autoApproveQR === 'boolean') setAutoApproveQR(parsed.autoApproveQR);
      return true;
    } catch (err) {
      console.error('Failed to parse backup JSON:', err);
      return false;
    }
  };

  const openCashShift = (startingFloat: number, openedBy: string, notes?: string): CashShift => {
    const shiftNum = `SHIFT-${Math.floor(100 + Math.random() * 900)}`;
    const newShift: CashShift = {
      id: `shift-${Date.now()}`,
      shiftNumber: shiftNum,
      branchId: currentBranch.id,
      openedBy,
      openedById: currentUser?.id || 'user-manager',
      openedAt: new Date().toISOString(),
      startingFloat,
      status: 'open',
      cashMovements: [],
      notes: notes || ''
    };
    setCashShifts(prev => [newShift, ...prev]);
    return newShift;
  };

  const closeCashShift = (actualCashBalance: number, closedBy: string, closingNotes?: string): CashShift => {
    const openShift = cashShifts.find(s => s.status === 'open' && s.branchId === currentBranch.id);
    if (!openShift) {
      throw new Error('No open cash shift found for this branch');
    }
    const openTime = new Date(openShift.openedAt).getTime();
    const closeTime = Date.now();
    const shiftOrders = orders.filter(o => {
      const oTime = new Date(o.createdAt).getTime();
      return o.branchId === currentBranch.id && o.status !== 'cancelled' && oTime >= openTime && oTime <= closeTime;
    });
    const totalCashSales = shiftOrders
      .filter(o => o.paymentMethod === 'cash')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const totalPromptPaySales = shiftOrders
      .filter(o => o.paymentMethod === 'promptpay' || o.paymentMethod === 'truemoney')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const totalCreditSales = shiftOrders
      .filter(o => o.paymentMethod === 'credit')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const totalSales = shiftOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    
    const cashIn = (openShift.cashMovements || [])
      .filter(m => m.type === 'cash_in')
      .reduce((sum, m) => sum + m.amount, 0);
    const cashOut = (openShift.cashMovements || [])
      .filter(m => m.type === 'cash_out')
      .reduce((sum, m) => sum + m.amount, 0);
    const expectedCashBalance = openShift.startingFloat + totalCashSales + cashIn - cashOut;
    const cashDifference = actualCashBalance - expectedCashBalance;

    const closedShift: CashShift = {
      ...openShift,
      status: 'closed',
      closedBy,
      closedById: currentUser?.id || 'user-manager',
      closedAt: new Date(closeTime).toISOString(),
      actualCashBalance,
      expectedCashBalance,
      cashDifference,
      totalCashSales,
      totalPromptPaySales,
      totalCreditSales,
      totalSales,
      orderCount: shiftOrders.length,
      closingNotes: closingNotes || ''
    };

    setCashShifts(prev => prev.map(s => s.id === openShift.id ? closedShift : s));
    return closedShift;
  };

  const addCashMovement = (type: 'cash_in' | 'cash_out', amount: number, reason: string, recordedBy: string) => {
    setCashShifts(prev => prev.map(s => {
      if (s.status === 'open' && s.branchId === currentBranch.id) {
        const newMov: CashMovement = {
          id: `mov-${Date.now()}`,
          time: new Date().toISOString(),
          type,
          amount,
          reason,
          recordedBy
        };
        return { ...s, cashMovements: [newMov, ...(s.cashMovements || [])] };
      }
      return s;
    }));
  };

  const deleteCashShift = (shiftId: string) => {
    setCashShifts(prev => prev.filter(s => s.id !== shiftId));
  };

  const currentOpenShift = cashShifts.find(s => s.status === 'open' && s.branchId === currentBranch.id) || null;

  const resetToDefaultData = () => {
    setCategories(DEFAULT_CATEGORIES);
    setMenuItems(INITIAL_MENU_ITEMS);
    setAddOns(STANDARD_ADD_ONS);
    setIngredients(INITIAL_INGREDIENTS);
    setStockLots(INITIAL_STOCK_LOTS);
    setWasteLogs(INITIAL_WASTE_LOGS);
    setStockAdjustmentLogs(INITIAL_STOCK_ADJUSTMENT_LOGS);
    setStaffMembers(INITIAL_STAFF_MEMBERS);
    setShifts(INITIAL_SHIFTS);
    setShiftSwapRequests(INITIAL_SHIFT_SWAP_REQUESTS);
    setCashShifts(INITIAL_CASH_SHIFTS);
    setOrders(INITIAL_ORDERS);
    setExpenses(INITIAL_EXPENSES);
    setIncomes(INITIAL_INCOMES);
    setSettings(INITIAL_SETTINGS);
    setCart([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  const cleanSlateForProduction = () => {
    setOrders([]);
    setExpenses([]);
    setIncomes([]);
    setCashShifts([]);
    setShifts([]);
    setShiftSwapRequests([]);
    setWasteLogs([]);
    setStockAdjustmentLogs([]);
    setStockLots([]);
    setSecurityLogs([]);
    setIngredients(prev => prev.map(ing => ({ ...ing, currentStock: 0 })));
    setCart([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  const sendDailySummaryNotification = async (channel: 'telegram' | 'line' | 'both' = 'both') => {
    const msg = generateDailySummaryMessage(orders, ingredients, currentBranch, settings);
    const res = await dispatchNotification('สรุปยอดขายประจำวัน (Daily Sales Summary)', msg, {
      force: true,
      channelOverride: channel,
    });
    return { success: res.success, summary: res.summary };
  };

  return (
    <POSContext.Provider
      value={{
        activeTab,
        setActiveTab,
        isDrawerOpen,
        setIsDrawerOpen,
        isLocked,
        setIsLocked,
        currentBranch,
        setCurrentBranch,
        branches,
        updateBranch,
        addBranch,
        deleteBranch,
        currentUser,
        setCurrentUser,
        users,
        updateUserPin,
        menuItems,
        addOns,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        updateMenuItemRecipe,
        toggleMenuItemAddOns,
        addAddOn,
        updateAddOn,
        deleteAddOn,
        ingredients,
        stockLots,
        orders,
        expenses,
        incomes,
        settings,
        updateSettings,
        autoApproveQR,
        setAutoApproveQR,
        tables,
        setTables,
        addTable,
        updateTable,
        deleteTable,
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        getCategoryName,
        syncCategoriesFromMenu,
        ingredientCategories,
        addIngredientCategory,
        updateIngredientCategory,
        deleteIngredientCategory,
        ingredientUnits,
        addIngredientUnit,
        updateIngredientUnit,
        deleteIngredientUnit,
        resetIngredientUnits,
        cart,
        addToCart,
        updateCartQuantity,
        setCartItemQuantity,
        removeFromCart,
        clearCart,
        discount,
        setDiscount,
        createOrder,
        createDirectOrder,
        updateOrderStatus,
        cancelOrder,
        updateOrderTaxInfo,
        addTaxInvoiceOrder,
        addIngredient,
        updateIngredient,
        deleteIngredients,
        bulkUpdateIngredients,
        updateIngredientStock,
        updateIngredientPriceAndRecalculate,
        addStockLot,
        wasteLogs,
        addWasteLog,
        deleteWasteLog,
        stockAdjustmentLogs,
        addStockAdjustmentLog,
        recordStockAdjustment,
        clearStockAdjustmentLogs,
        deleteStockAdjustmentLog,
        staffMembers,
        shifts,
        shiftSwapRequests,
        addStaffMember,
        updateStaffMember,
        deleteStaffMember,
        addShift,
        updateShift,
        deleteShift,
        saveWeeklyRoster,
        addShiftSwapRequest,
        approveShiftSwapRequest,
        rejectShiftSwapRequest,
        cashShifts,
        currentOpenShift,
        openCashShift,
        closeCashShift,
        addCashMovement,
        deleteCashShift,
        addExpense,
        deleteExpense,
        addIncome,
        updateIncome,
        deleteIncome,
        exportStateJSON,
        importStateJSON,
        resetToDefaultData,
        cleanSlateForProduction,
        securityLogs,
        logSecurityEvent,
        clearSecurityLogs,
        deleteSecurityLog,
        playKitchenChime,
        isStorageLoaded,
        isOffline,
        forceOfflineMode,
        setForceOfflineMode,
        lastSyncedAt,
        pendingOfflineCount,
        syncOfflineQueue,
        firebaseSyncState,
        centralBranchesLive,
        pushAllBranchDataToCloud,
        cleanAndSyncCloudNow,
        pullCloudOrders,
        pullCloudAllData,
        conflictReport,
        isConflictResolverOpen,
        isScanningConflicts,
        isResolvingConflicts,
        scanForSyncConflicts,
        openConflictResolver,
        closeConflictResolver,
        applyConflictResolutions,
        sendDailySummaryNotification
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
};
