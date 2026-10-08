import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { DEFAULT_PIN_HASH, hashPin, isHashedPin } from '../utils/pins';
import { bigStore } from '../utils/bigStore';
import { averageCostAfterPrep } from '../utils/prep';
import { localDay } from '../utils/stockHistory';
import { effectivePermissions } from '../utils/access';
import { useCloudMergedList } from '../hooks/useCloudMergedList';
import { canonicalUnit, convertAmount, effectiveUnitCost, repointRecipe, withRecipeCosts, withRecipeUnits } from '../utils/recipeUtils';
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
  WasteReason,
  StaffPermissions,
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
  publishPublicMenu,
  applyStockDeltasToFirestore,
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
  fetchHistorySince,
  purgeStubOrderDocs,
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
  subscribeToStockHistory,
  subscribeToBranchDoc,
  claimDailyJob,
  subscribeToDeletedRecords
} from '../services/firebaseService';
import {
  getStoredTriggers,
  getStoredRules,
  dispatchNotification,
  generateDailySummaryMessage,
  generateNewOrderMessage,
  generateVoidOrderMessage,
  generateLowStockMessage,
  setNotificationShopName
} from '../services/notificationService';
import {
  INITIAL_BRANCHES,
  isSampleBranch,
  isSampleStaff,
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
import {
  generateOrderId,
  generateOrderNumber,
  computeSaleStockDeductions,
  applyStockDeductions,
  computeCartTotals,
  mergeCloudOrders,
  resolveItemsForStock,
  normalizeOrderId,
  countsAsRevenue
} from '../utils/orderUtils';
import { crc16, resolvePromptPayId } from '../utils/promptpay';
import { buildPublicMenu } from '../utils/publicMenu';
import { playChime } from '../utils/chime';
import { SHOP_LOGO_URL, normalizeShopLogoUrl } from '../assets/logo';

export function computeOrderChecksum(order: Order): string {
  const itemsCount = order.items ? order.items.length : 0;
  const rawStr = `${order.id}:${order.orderNumber || ''}:${order.grandTotal.toFixed(2)}:${itemsCount}:${order.createdAt || ''}:${order.paymentMethod}`;
  return crc16(rawStr);
}

interface DiscountState {
  amount: number;
  type: 'fixed' | 'percent';
  note?: string;
  /** Coupon the discount came from */
  couponCode?: string;
  /** CRM member credited with this bill */
  member?: { id: string; name: string };
}

/** One stock change: positive adds (received), negative removes (waste, correction). */
export interface StockMove {
  ingredientId: string;
  change: number;
  reason: string;
  notes?: string;
  userName?: string;
  userRole?: string;
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
  /** What the signed-in person may do (from their PIN card; everything for the owner) */
  permissions: Required<StaffPermissions>;
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
  updateMenuItemRecipe: (menuItemId: string, recipe: RecipeIngredient[], costPrice?: number) => void;
  batchUpdateMenuItemRecipes: (updates: { menuItemId: string; recipe: RecipeIngredient[]; costPrice?: number }[]) => void;
  toggleMenuItemFrequent: (menuItemId: string) => void;
  toggleMenuItemAddOns: (menuItemId: string, allow?: boolean) => void;
  /** Take a dish off sale (sold out) or back on */
  setMenuItemSoldOut: (menuItemId: string, soldOut: boolean) => void;
  /** Merge a duplicate ingredient into another: recipes are repointed, stock is added, the duplicate is removed */
  mergeIngredients: (keepId: string, duplicateId: string) => { ok: boolean; error?: string };
  restoreDefaultMenuItems: () => void;

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
  /** Record payment for an order placed unpaid (customer QR order). Returns the updated order. */
  settleOrderPayment: (orderId: string, method: PaymentMethod, tenderedAmount: number) => Order | null;
  /** Publish the customer-visible menu for QR ordering now. */
  publishCustomerMenu: () => Promise<boolean>;
  cancelOrder: (
    orderId: string,
    reason: string,
    note?: string,
    cancelledBy?: { userId?: string; userName: string; role: string },
    options?: { restock?: boolean }
  ) => void;
  updateOrderTaxInfo: (orderId: string, taxInfo: CustomerTaxInfo, extra?: { taxInvoiceNo?: string; withholdingTax?: number }) => void;
  addTaxInvoiceOrder: (newOrder: Order) => void;

  // Inventory operations
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => Ingredient;
  updateIngredient: (ingredient: Ingredient, stockReason?: string, stockNote?: string) => void;
  deleteIngredients: (ingredientIds: string[]) => void;
  toggleIngredientFrequent: (ingredientId: string) => void;
  bulkUpdateIngredients: (ingredientIds: string[], updates: Partial<Omit<Ingredient, 'id'>>) => void;
  updateIngredientStock: (ingredientId: string, newStock: number) => void;
  updateIngredientPriceAndRecalculate: (
    ingredientId: string,
    newUnitCost: number,
    updatedMenuPrices?: Record<string, number>
  ) => void;
  addStockLot: (lot: Omit<StockLot, 'id'>) => void;
  /**
   * Kitchen prep: draw the inputs from stock, put the yield of the output into stock, and set the
   * output's cost to the weighted average including this batch. Returns the batch cost.
   */
  producePrep: (run: { outputIngredientId: string; outputQty: number; inputs: { ingredientId: string; quantity: number }[]; note?: string }) => { cost: number; unitCost: number; averageCost: number };
  /** A new ingredient that arrives with its first purchase: created with that stock and a receiving entry in the history */
  receiveNewIngredient: (ingredient: Omit<Ingredient, 'id' | 'currentStock'>, quantity: number, note: string) => Ingredient;

  // Waste Log operations
  wasteLogs: WasteLog[];
  addWasteLog: (log: Omit<WasteLog, 'id'>) => void;
  /** Take several items out of stock at once: as waste (with a waste record each) or as issued for use */
  issueStock: (lines: { ingredientId: string; quantity: number }[], opts: { waste?: WasteReason; note: string }) => { cost: number };
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
  /** Record stock changes (deltas) with shared history; see moveStock */
  moveStock: (moves: StockMove[]) => StockAdjustmentLog[];
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
  addExpense: (expense: Omit<Expense, 'id'> & { id?: string }) => Expense;
  updateExpense: (expenseId: string, patch: Partial<Expense>) => void;
  deleteExpense: (expenseId: string) => void;
  addIncome: (income: Omit<OtherIncome, 'id'> & { id?: string }) => OtherIncome;
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
  cleanAndSyncCloudNow: (options?: { purgeCloud?: boolean; withStock?: boolean }) => Promise<{
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
  /** Make sure sales, expenses and income from this day on are on this device (reports, books) */
  loadHistory: (fromDay: string) => Promise<boolean>;
  /** The day being loaded by loadHistory, while it loads */
  historyLoading: string | null;
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
/** The earliest day whose sales, expenses and income this device has read from the cloud */
const HISTORY_FROM_KEY = 'POS_HISTORY_FROM';

/** When this device last changed the shop settings (kept across reloads) */
const SETTINGS_EDITED_KEY = 'POS_SETTINGS_EDITED_AT';
const readSettingsEditedAt = (): string => {
  try {
    return localStorage.getItem(SETTINGS_EDITED_KEY) || '';
  } catch {
    return '';
  }
};
const writeSettingsEditedAt = (iso: string) => {
  try {
    localStorage.setItem(SETTINGS_EDITED_KEY, iso);
  } catch {
    // storage unavailable
  }
};

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Track recently updated menu item IDs and timestamps to protect local saves from being overwritten by stale cloud snapshots
  const recentLocalMenuUpdatesRef = useRef<Map<string, number>>(new Map());
  // Track recently updated ingredient IDs and timestamps to protect local saves from being overwritten by stale cloud snapshots
  const recentLocalIngredientUpdatesRef = useRef<Map<string, number>>(new Map());
  // QR orders whose stock was already deducted on approval (guards against double taps)
  const approvedQrStockRef = useRef<Set<string>>(new Set());
  // Orders already re-sent to the cloud by the merge (avoids repeat writes)
  const pushedBackRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Default to true: ทุกครั้งที่เปิดระบบ ต้องใส่รหัสพนักงาน (PIN) เพื่อเข้าสู่ระบบ
  const [isLocked, setIsLocked] = useState(true);
  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);

  const updateUserPin = (userId: string, plainPin: string) => {
    const newPin = hashPin(plainPin);
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
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      return parsed.filter(id => typeof id === 'string' && (id.startsWith('menu-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id)));
    } catch (e) {
      return [];
    }
  });

  const [deletedIngredientIds, setDeletedIngredientIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('POS_DELETED_ING_IDS');
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      return parsed.filter(id => typeof id === 'string' && (id.startsWith('ing-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id)));
    } catch (e) {
      return [];
    }
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      const storedDeleted = localStorage.getItem('POS_DELETED_MENU_IDS');
      const delList: string[] = storedDeleted ? JSON.parse(storedDeleted) : [];
      const delSet = new Set(delList.filter(id => typeof id === 'string' && (id.startsWith('menu-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id))).map(s => String(s).trim().toLowerCase()));

      let loaded: MenuItem[] = [];
      const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.menuItems && Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0) {
            loaded = parsed.menuItems.filter((m: any) => m && typeof m === 'object' && m.id);
          }
        } catch (e) {}
      }
      if (loaded.length === 0) {
        try {
          const sep = bigStore.getItem('POS_MENU_ITEMS_DATA');
          if (sep) {
            const parsedSep = JSON.parse(sep);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              loaded = parsedSep.filter((m: any) => m && typeof m === 'object' && m.id);
            }
          }
        } catch (e) {}
      }
      const base = loaded.length > 0 ? loaded : INITIAL_MENU_ITEMS;
      return base.filter(m => m && m.id && !delSet.has(m.id.toLowerCase()));
    } catch (e) {
      return INITIAL_MENU_ITEMS;
    }
  });
  const [addOns, setAddOns] = useState<AddOnOption[]>(STANDARD_ADD_ONS);
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    try {
      const storedDeleted = localStorage.getItem('POS_DELETED_ING_IDS');
      const delList: string[] = storedDeleted ? JSON.parse(storedDeleted) : [];
      const delSet = new Set(delList.filter(id => typeof id === 'string' && (id.startsWith('ing-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id))).map(s => String(s).trim().toLowerCase()));

      let loaded: Ingredient[] = [];
      const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.ingredients && Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0) {
            loaded = parsed.ingredients.filter((i: any) => i && typeof i === 'object' && i.id);
          }
        } catch (e) {}
      }
      if (loaded.length === 0) {
        try {
          const sep = bigStore.getItem('POS_INGREDIENTS_DATA');
          if (sep) {
            const parsedSep = JSON.parse(sep);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              loaded = parsedSep.filter((i: any) => i && typeof i === 'object' && i.id);
            }
          }
        } catch (e) {}
      }
      const base = loaded.length > 0 ? loaded : INITIAL_INGREDIENTS;
      return base.filter(i => i && i.id && !delSet.has(i.id.toLowerCase()));
    } catch (e) {
      return INITIAL_INGREDIENTS;
    }
  });
  const [stockLots, setStockLots] = useState<StockLot[]>(INITIAL_STOCK_LOTS);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>(INITIAL_WASTE_LOGS);
  const [stockAdjustmentLogs, setStockAdjustmentLogs] = useState<StockAdjustmentLog[]>(INITIAL_STOCK_ADJUSTMENT_LOGS);

  const lastLocalSettingsEditRef = useRef(0);

  // History written while offline, sent on reconnect
  const pendingStockLogsRef = useRef<StockAdjustmentLog[]>([]);
  const pendingWasteLogsRef = useRef<WasteLog[]>([]);

  const addStockAdjustmentLog = (entry: Omit<StockAdjustmentLog, 'id' | 'timestamp'>) => {
    const newEntry: StockAdjustmentLog = {
      ...entry,
      id: `adj-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    };
    setStockAdjustmentLogs(prev => [newEntry, ...prev]);
  };

  /**
   * The one way stock changes outside of sales: receiving, waste, counts and corrections.
   * Each change goes to the cloud as a delta (added to whatever other devices did meanwhile, never
   * overwriting their numbers) and leaves a history entry that is shared with every device.
   */
  const moveStock = (moves: StockMove[]): StockAdjustmentLog[] => {
    const byId = new Map(ingredients.map(i => [i.id, i]));
    const deltas = new Map<string, number>(); // amount to subtract, as for sales
    const logs: StockAdjustmentLog[] = [];
    const now = new Date().toISOString();
    moves.forEach((m, idx) => {
      const ing = byId.get(m.ingredientId);
      if (!ing || !Number.isFinite(m.change) || m.change === 0) return;
      const prev = ing.currentStock || 0;
      const next = Math.max(0, prev + m.change);
      const applied = Number((next - prev).toFixed(4));
      byId.set(ing.id, { ...ing, currentStock: next });
      if (!applied) return;
      deltas.set(ing.id, (deltas.get(ing.id) || 0) - applied);
      logs.push({
        id: `adj-log-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        previousStock: prev,
        newStock: next,
        changeQty: applied,
        unit: ing.unit,
        reason: m.reason,
        notes: m.notes || '',
        userName: m.userName || currentUser?.name || 'ผู้ใช้งานระบบ',
        userRole: m.userRole || currentUser?.role || 'staff',
        timestamp: now
      });
    });
    if (deltas.size > 0) pushStockDeltas(deltas);
    if (logs.length > 0) {
      setStockAdjustmentLogs(prev => [...logs, ...prev]);
      if (isFirebaseAvailable() && !effectiveOffline) {
        logs.forEach(l => syncStockAdjustmentToFirestore(l, currentBranch).catch(console.warn));
      } else {
        pendingStockLogsRef.current.push(...logs);
      }
    }
    return logs;
  };

  /** Set an ingredient to a counted / corrected amount (the difference is what is recorded and synced). */
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
    moveStock([{ ingredientId, change: Math.max(0, newStock) - (targetIng.currentStock || 0), reason, notes, userName, userRole }]);
  };

  // Stock history is an audit trail shared through the cloud: entries are not deleted. A mistake
  // is corrected with a new adjustment. (Kept for callers; they no longer offer deletion.)
  const clearStockAdjustmentLogs = () => undefined;
  const deleteStockAdjustmentLog = (_logId: string) => undefined;
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(INITIAL_STAFF_MEMBERS);

  // Permissions come from the person's current PIN card, so a change applies without signing in again
  const permissions = useMemo(() => {
    const card = staffMembers.find(s => s.id === currentUser?.id);
    return effectivePermissions(currentUser ? { role: currentUser.role, permissions: card?.permissions ?? currentUser.permissions } : null);
  }, [staffMembers, currentUser]);
  const [shifts, setShifts] = useState<ShiftEntry[]>(INITIAL_SHIFTS);
  const [shiftSwapRequests, setShiftSwapRequests] = useState<ShiftSwapRequest[]>(INITIAL_SHIFT_SWAP_REQUESTS);
  const [cashShifts, setCashShifts] = useState<CashShift[]>(INITIAL_CASH_SHIFTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  // Latest expenses for callbacks that run after an await (their render's copy may be old)
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const [incomes, setIncomes] = useState<OtherIncome[]>(INITIAL_INCOMES);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  // The latest settings for callbacks set up once (e.g. the cloud listener)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
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
    // Connected only once the cloud has taken a write (the branch heartbeat below)
    status: navigator.onLine ? 'syncing' : 'offline',
    lastSyncedAt: null,
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
      // Without a cloud database this device works alone: never report it as connected
      setFirebaseSyncState(prev => ({
        ...prev,
        status: effectiveOffline ? 'offline' : 'error',
        errorMessage: effectiveOffline ? prev.errorMessage : 'ยังเชื่อมฐานข้อมูลคลาวด์ไม่ได้',
        pendingSyncCount: orders.filter(o => o.isOfflineOrder && !o.isSynced).length
      }));
      return;
    }

    // Today in local time (an ISO timestamp's date is UTC, 7 hours behind Thailand)
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(o => o.branchId === currentBranch.id && new Date(o.createdAt).toDateString() === todayStr && countsAsRevenue(o));
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
          pendingSyncCount: orders.filter(o => o.isOfflineOrder && !o.isSynced).length,
          errorMessage: undefined
        }));
      } else {
        // The cloud refused the write (usually: this device is not signed in to the shop account)
        setFirebaseSyncState(prev => ({ ...prev, status: 'error', errorMessage: 'บันทึกขึ้นคลาวด์ไม่ได้ ตรวจสอบการเชื่อมบัญชีร้าน' }));
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

    purgeStubOrderDocs().catch(() => undefined);

    const unsubOrders = subscribeToRecentCentralOrders(1000, (centralOrderList, removedIds) => {
      let pushBack: Order[] = [];
      setOrders(prev => {
        const result = mergeCloudOrders(prev, centralOrderList || [], removedIds || []);
        pushBack = result.pushBack;
        if (!result.changed) return prev;
        try {
          bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(result.orders));
        } catch (e) {
          console.warn('[POS Real-Time Sync] Failed to cache synced orders', e);
        }
        return result.orders;
      });
      // Local served/cancelled orders the cloud has not caught up with: send them again
      queueMicrotask(() => {
        if (effectiveOffline || !isFirebaseAvailable()) return;
        pushBack.forEach(o => {
          const key = `${o.id}:${o.status}:${o.updatedAt || ''}`;
          if (pushedBackRef.current.has(key)) return;
          pushedBackRef.current.add(key);
          if (o.status === 'served') {
            updateOrderStatusInFirestore(o.id, 'served', { completedAt: o.completedAt });
          } else if (o.status === 'cancelled') {
            updateOrderStatusInFirestore(o.id, 'cancelled', {
              cancelReason: o.cancelReason,
              cancelNote: o.cancelNote,
              cancelledBy: o.cancelledBy
            });
          }
        });
      });
    });

    const unsubExpenses = subscribeToCentralExpenses(1000, (centralExpList, removedIds) => {
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
              // Signatures and Drive links added on another device count as changes too
              const docsChanged =
                existing.paidFrom !== ce.paidFrom ||
                JSON.stringify(existing.substituteReceipt || null) !== JSON.stringify(ce.substituteReceipt || null) ||
                JSON.stringify(existing.driveFiles || null) !== JSON.stringify(ce.driveFiles || null) ||
                // Photos added elsewhere (e.g. by the Telegram bot)
                (ce.purchaseImages?.length || 0) > (existing.purchaseImages?.length || 0) ||
                (!!ce.receiptImage && !existing.receiptImage);
              if (
                docsChanged ||
                existing.amount !== ce.amount ||
                existing.category !== ce.category ||
                existing.title !== ce.title ||
                existing.note !== ce.note ||
                existing.date !== ce.date ||
                existing.includeVat !== ce.includeVat ||
                existing.vatAmount !== ce.vatAmount
              ) {
                // Pictures the cloud copy left out (too big for it) stay as they are on this device
                localMap.set(ce.id, {
                  ...existing,
                  ...ce,
                  receiptImage: ce.receiptImage || existing.receiptImage,
                  purchaseImages: ce.purchaseImages || existing.purchaseImages
                });
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
          bigStore.setItem('POS_EXPENSES_DATA', JSON.stringify(list));
        } catch (e) {
          console.warn('Failed to cache synced expenses', e);
        }
        return list;
      });
    });

    const unsubIncomes = subscribeToCentralIncomes(1000, (centralIncList, removedIds) => {
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
              if (existing.amount !== ci.amount || existing.category !== ci.category || existing.title !== ci.title || existing.note !== ci.note || existing.date !== ci.date || existing.payerName !== ci.payerName) {
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
          bigStore.setItem('POS_INCOMES_DATA', JSON.stringify(list));
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
            try { bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(currentList)); } catch (e) {}
            return currentList;
          }
          return prev;
        }

        const localMap = new Map<string, MenuItem>(currentList.map(m => [m.id, m]));
        const deletedSet = new Set(deletedMenuItemIds.map(d => String(d).trim().toLowerCase()));

        cloudMenuList.forEach(cm => {
          // Strictly filter by deleted document ID only. Never filter by name so valid dishes are never wiped out.
          if (deletedSet.has(cm.id.toLowerCase())) return;

          // Check if this item was recently modified locally (within 15 seconds) - protect fresh user edits from stale cloud snapshots
          const lastLocalTime = recentLocalMenuUpdatesRef.current.get(cm.id) || 0;
          const isRecentlyEditedLocally = Date.now() - lastLocalTime < 15000;

          if (!localMap.has(cm.id)) {
            localMap.set(cm.id, cm);
            changed = true;
          } else if (!isRecentlyEditedLocally) {
            const existing = localMap.get(cm.id)!;

            // Preserve local rich fields if cloud snapshot has empty or undefined fields
            const mergedRecipe = (cm.recipe && cm.recipe.length > 0)
              ? cm.recipe
              : (existing.recipe && existing.recipe.length > 0 ? existing.recipe : []);
            // An empty list saved on purpose (options removed) must reach other devices too
            const mergedSpice = Array.isArray(cm.availableSpiceLevels) ? cm.availableSpiceLevels : existing.availableSpiceLevels;
            const mergedProteins = Array.isArray(cm.availableProteins) ? cm.availableProteins : existing.availableProteins;
            const mergedAllowedAddOns = (cm.allowedAddOnIds && cm.allowedAddOnIds.length > 0)
              ? cm.allowedAddOnIds
              : existing.allowedAddOnIds;
            const mergedImage = cm.image && cm.image.trim() !== '' ? cm.image : existing.image;
            const mergedDesc = cm.description && cm.description.trim() !== '' ? cm.description : existing.description;

            const isDifferent =
              existing.price !== cm.price ||
              existing.costPrice !== cm.costPrice ||
              existing.name !== cm.name ||
              existing.category !== cm.category ||
              JSON.stringify(existing.recipe || []) !== JSON.stringify(mergedRecipe) ||
              JSON.stringify(existing.availableSpiceLevels || []) !== JSON.stringify(mergedSpice || []) ||
              JSON.stringify(existing.availableProteins || []) !== JSON.stringify(mergedProteins || []) ||
              !!existing.isSoldOut !== !!cm.isSoldOut;

            if (isDifferent) {
              localMap.set(cm.id, {
                ...existing,
                ...cm,
                image: mergedImage,
                description: mergedDesc,
                recipe: mergedRecipe,
                availableSpiceLevels: mergedSpice,
                availableProteins: mergedProteins,
                allowedAddOnIds: mergedAllowedAddOns
              });
              changed = true;
            }
          }
        });

        if (!changed) return prev;
        const merged = Array.from(localMap.values());
        try {
          bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(merged));
          const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.menuItems = merged;
            bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
          }
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
            try {
              bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(currentList));
              const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
              if (saved) {
                const parsed = JSON.parse(saved);
                parsed.ingredients = currentList;
                bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
              }
            } catch (e) {}
            return currentList;
          }
          return prev;
        }

        const localMap = new Map<string, Ingredient>(currentList.map(i => [i.id, i]));
        const deletedSet = new Set(deletedIngredientIds.filter(id => id.startsWith('ing-') || /^[a-zA-Z0-9_-]+$/.test(id)).map(d => String(d).trim().toLowerCase()));

        cloudIngList.forEach(ci => {
          // Strictly filter by system ID only
          if (deletedSet.has(ci.id.toLowerCase())) return;

          // Check if this ingredient was recently modified locally (within 15 seconds) - protect fresh local saves from stale cloud snapshots
          const lastLocalTime = recentLocalIngredientUpdatesRef.current.get(ci.id) || 0;
          const isRecentlyEditedLocally = Date.now() - lastLocalTime < 15000;

          if (!localMap.has(ci.id)) {
            localMap.set(ci.id, ci);
            changed = true;
          } else if (!isRecentlyEditedLocally) {
            const existing = localMap.get(ci.id)!;
            const isDifferent =
              existing.currentStock !== ci.currentStock ||
              existing.unitCost !== ci.unitCost ||
              existing.minStockAlert !== ci.minStockAlert ||
              existing.name !== ci.name ||
              existing.packageUnit !== ci.packageUnit ||
              existing.packageSize !== ci.packageSize ||
              existing.isFrequent !== ci.isFrequent ||
              // A unit change elsewhere changes how every recipe line is deducted here
              existing.unit !== ci.unit ||
              existing.category !== ci.category ||
              (existing.barcode || '') !== (ci.barcode || '');
            if (isDifferent) {
              localMap.set(ci.id, { ...existing, ...ci });
              changed = true;
            }
          }
        });

        if (!changed) return prev;
        const merged = Array.from(localMap.values());
        try {
          bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(merged));
          const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.ingredients = merged;
            bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
          }
        } catch (e) {}
        return merged;
      });
    });

    // Shop settings saved on another device (VAT, receipt, PromptPay...). PINs never travel through
    // the cloud, and the kitchen sound stays a per-device choice.
    const unsubSettings = subscribeToBranchDoc(branchTargetId, 'settings', data => {
      if (!data) return;
      if (Date.now() - lastLocalSettingsEditRef.current < 5000) return;
      // A change made here that never reached the cloud (offline, or a failed save) is not
      // undone by the older cloud copy: it is sent again instead
      const editedHere = readSettingsEditedAt();
      const cloudAt = typeof data.lastUpdatedIso === 'string' ? data.lastUpdatedIso : '';
      if (editedHere && cloudAt < editedHere) {
        const local = settingsRef.current;
        if (local && isFirebaseAvailable()) syncSettingsToFirestore(local, branchTargetId).catch(console.warn);
        return;
      }
      const { updatedAt: _u, lastUpdatedIso: _l, adminPin: _a, managerPin: _m, enableKitchenSound: _k, ...cloud } = data as Record<string, unknown>;
      setSettings(prev => {
        const next = { ...prev, ...(cloud as Partial<SystemSettings>) };
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    });

    // Shared stock history (receiving, counts, corrections, waste) from every device
    const mergeHistory = <T extends { id: string }>(prev: T[], cloud: T[], time: (x: T) => string): T[] => {
      const byId = new Map(prev.map(x => [x.id, x]));
      let changed = false;
      cloud.forEach(x => {
        if (!x.id || byId.has(x.id)) return;
        byId.set(x.id, x);
        changed = true;
      });
      if (!changed) return prev;
      return Array.from(byId.values())
        .sort((a, b) => (time(b) || '').localeCompare(time(a) || ''))
        .slice(0, 2000);
    };
    const unsubHistory = subscribeToStockHistory(
      branchTargetId,
      logs => setStockAdjustmentLogs(prev => mergeHistory(prev, logs, l => l.timestamp)),
      waste => setWasteLogs(prev => mergeHistory(prev, waste, w => w.loggedDate))
    );

    // Real-time listener for deleted record tombstones (tombstone sync across clients)
    const unsubTombstones = subscribeToDeletedRecords((deletedSet) => {
      if (deletedSet.menuIds.size > 0) {
        setMenuItems(prev => {
          const filtered = prev.filter(m => !deletedSet.menuIds.has(m.id));
          if (filtered.length !== prev.length) {
            try { bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(filtered)); } catch (e) {}
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
            try { bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(filtered)); } catch (e) {}
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
            try { bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(filtered)); } catch (e) {}
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
      unsubHistory();
      unsubSettings();
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
        // Local day (the ISO date is UTC)
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const lastSentDate = localStorage.getItem('kaprao_last_daily_summary_date');
        // If current time reached summary time and hasn't been sent yet today
        if (currentTimeStr >= summaryTime && lastSentDate !== todayStr) {
          localStorage.setItem('kaprao_last_daily_summary_date', todayStr);
          // Only one of the shop's open devices sends it (otherwise every tablet sends a copy)
          claimDailyJob(currentBranch.id, 'daily_summary', todayStr).then(mine => {
            if (!mine) return;
            const msg = generateDailySummaryMessage(orders, ingredients, currentBranch, settings, { expenses, incomes });
            dispatchNotification('สรุปยอดขายประจำวัน', msg, { force: true }).catch(console.error);
          });
        }
      } catch (err) {
        console.warn('[Notification Schedule] Check error:', err);
      }
    };

    // Run initial check and then every 30 seconds
    checkDailySummarySchedule();
    const intervalId = setInterval(checkDailySummarySchedule, 30000);
    return () => clearInterval(intervalId);
  }, [orders, ingredients, currentBranch, settings, expenses, incomes]);

  // Notifications name the shop as in Settings
  useEffect(() => {
    setNotificationShopName(settings.shopName || currentBranch?.name);
  }, [settings.shopName, currentBranch?.name]);

  const syncOfflineQueue = async () => {
    const nowIso = new Date().toISOString();
    const pendingOrders = orders.filter(o => o.isOfflineOrder && !o.isSynced);

    if (pendingOrders.length === 0) {
      console.log('[POS Sync Queue] ℹ️ No pending offline orders in queue.');
      if (isFirebaseAvailable() && !effectiveOffline) {
        setFirebaseSyncState(prev => ({ ...prev, status: 'syncing' }));
        await flushPendingStock();
        await flushPendingHistory();
        await syncInventoryToFirestore(ingredients, currentBranch, { withStock: false });
        if (!(await syncBranchToFirestore(currentBranch))) {
          setFirebaseSyncState(prev => ({ ...prev, status: 'error', errorMessage: 'บันทึกขึ้นคลาวด์ไม่ได้ ตรวจสอบการเชื่อมบัญชีร้าน' }));
          return;
        }
        setFirebaseSyncState(prev => ({
          ...prev,
          status: 'connected',
          errorMessage: undefined,
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

    // Only orders the cloud has accepted count as synced; the rest stay queued for the next try
    const uploaded = new Set<string>();
    if (isFirebaseAvailable() && !effectiveOffline) {
      try {
        const batchResult = await syncOrdersBatchToFirestore(pendingOrders, currentBranch);
        batchResult.syncedIds.forEach(id => uploaded.add(id));
        await flushPendingStock();
        await flushPendingHistory();
        await syncInventoryToFirestore(ingredients, currentBranch, { withStock: false });
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
        if (ord.isOfflineOrder && !ord.isSynced && uploaded.has(ord.id)) {
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

    const left = pendingOrders.length - uploaded.size;
    if (left > 0) {
      setFirebaseSyncState(prev => ({
        ...prev,
        status: effectiveOffline ? 'offline' : 'error',
        pendingSyncCount: left,
        errorMessage: `ส่งออเดอร์ขึ้นคลาวด์ไม่ได้ ${left} รายการ (เก็บไว้ในเครื่อง จะลองส่งใหม่)`
      }));
      return;
    }
    setLastSyncedAt(nowIso);
    setFirebaseSyncState(prev => ({
      ...prev,
      status: 'connected',
      errorMessage: undefined,
      lastSyncedAt: nowIso,
      lastSyncedBranch: currentBranch.name,
      pendingSyncCount: 0,
      totalSyncedOrders: prev.totalSyncedOrders + pendingOrders.length
    }));
  };

  const cleanAndSyncCloudNow = useCallback(async (options?: { purgeCloud?: boolean; withStock?: boolean }): Promise<{
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
        purgeOrphanCloudData: purge,
        withStock: options?.withStock !== false
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
    // Adds and updates only: nothing in the cloud is deleted, and stock levels stay as the cloud
    // has them (other devices' sales reach it as changes), so a device with an old or partial
    // copy cannot wipe the shop's data
    const res = await cleanAndSyncCloudNow({ purgeCloud: false, withStock: false });
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
        const result = mergeCloudOrders(prev, cloudOrders);
        newOrUpdatedCount = result.newOrUpdated;
        if (!result.changed) return prev;
        try {
          bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(result.orders));
        } catch (e) {
          console.warn('[POS Cloud Pull] Failed to cache POS_ORDERS_DATA', e);
        }
        return result.orders;
      });
      return { count: newOrUpdatedCount, success: true };
    } catch (err) {
      console.error('[POS Cloud Pull] Error pulling cloud orders:', err);
      return { count: 0, success: false };
    }
  }, [effectiveOffline]);

  // A device keeps the recent weeks; older records are read from the cloud when a report needs them
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const historyInFlight = useRef<Promise<boolean> | null>(null);
  const loadHistory = useCallback(
    async (fromDay: string): Promise<boolean> => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !isFirebaseAvailable() || effectiveOffline) return false;
      let covered = '';
      try {
        covered = localStorage.getItem(HISTORY_FROM_KEY) || '';
      } catch {
        // private mode
      }
      if (covered && covered <= fromDay) return true;
      if (historyInFlight.current) await historyInFlight.current.catch(() => false);
      const run = (async () => {
        setHistoryLoading(fromDay);
        try {
          const res = await fetchHistorySince(fromDay);
          if (!res) return false;
          if (res.orders.length) {
            setOrders(prev => {
              const result = mergeCloudOrders(prev, res.orders);
              if (!result.changed) return prev;
              try {
                bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(result.orders));
              } catch {
                // storage full: kept in memory
              }
              return result.orders;
            });
          }
          const addMissing = <T extends { id: string; date: string }>(prev: T[], more: T[], key: string): T[] => {
            const have = new Set(prev.map(x => x.id));
            const add = more.filter(x => !have.has(x.id));
            if (add.length === 0) return prev;
            const next = [...prev, ...add].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            try {
              bigStore.setItem(key, JSON.stringify(next));
            } catch {
              // storage full: kept in memory
            }
            return next;
          };
          setExpenses(prev => addMissing(prev, res.expenses, 'POS_EXPENSES_DATA'));
          setIncomes(prev => addMissing(prev, res.incomes, 'POS_INCOMES_DATA'));
          try {
            localStorage.setItem(HISTORY_FROM_KEY, fromDay);
          } catch {
            // private mode
          }
          return true;
        } finally {
          setHistoryLoading(null);
        }
      })();
      historyInFlight.current = run;
      try {
        return await run;
      } finally {
        if (historyInFlight.current === run) historyInFlight.current = null;
      }
    },
    [effectiveOffline]
  );

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
          const delIngSet = new Set(deletedIngredientIds.filter(id => id.startsWith('ing-') || /^[a-zA-Z0-9_-]+$/.test(id)).map(d => String(d).trim().toLowerCase()));
          // Cloud items add any newly added cloud ingredients (skipping deleted)
          cloudIngs.forEach(ci => {
            if (ci && ci.id && !delIngSet.has(ci.id.toLowerCase())) ingMap.set(ci.id, ci);
          });
          // Local items strictly OVERWRITE cloud items so user's edits are never lost
          prev.forEach(pi => {
            if (pi && pi.id && !delIngSet.has(pi.id.toLowerCase())) {
              ingMap.set(pi.id, pi);
            }
          });
          const merged = Array.from(ingMap.values());
          try {
            bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(merged));
            const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              parsed.ingredients = merged;
              bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
            }
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
          const delSet = new Set(deletedMenuItemIds.filter(id => id.startsWith('menu-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id)).map(s => String(s).trim().toLowerCase()));

          // Cloud items add newly added cloud menu items (skipping any deleted items)
          cloudMenus.forEach(cm => {
            if (cm && cm.id && !delSet.has(cm.id.toLowerCase())) {
              menuMap.set(cm.id, cm);
            }
          });
          // Local items strictly OVERWRITE cloud items so user's edits are never lost
          prev.forEach(pm => {
            if (pm && pm.id && !delSet.has(pm.id.toLowerCase())) {
              menuMap.set(pm.id, pm);
            }
          });
          const merged = Array.from(menuMap.values());
          try {
            bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(merged));
            const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              parsed.menuItems = merged;
              bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
            }
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
          Array.from(bMap.values()).forEach(b => b.id !== currentBranch?.id && isSampleBranch(b) && bMap.delete(b.id));
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
          bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(updatedMenus));
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
          bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(updatedIngs));
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

      const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
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
            const sepOrders = bigStore.getItem('POS_ORDERS_DATA');
            if (sepOrders) {
              const parsedSep = JSON.parse(sepOrders);
              if (Array.isArray(parsedSep) && parsedSep.length > 0) {
                parsedSep.forEach((o: any) => {
                  if (o && typeof o === 'object' && o.id) {
                    if (!orderMap.has(o.id)) {
                      orderMap.set(o.id, o);
                    } else {
                      const existing = orderMap.get(o.id)!;
                      const exTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                      const sepTime = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
                      if (o.status === 'served' && existing.status !== 'served') {
                        orderMap.set(o.id, o);
                      } else if (sepTime >= exTime && existing.status !== 'served') {
                        orderMap.set(o.id, o);
                      }
                    }
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
          // IMPORTANT: Clean up any strings in loadedDeletedMenuIds that are Thai or names (e.g. 'กะเพราทะเล')
          // Only actual system ID strings (like menu-1234, doc_*, etc.) should ever be in deletedMenuItemIds!
          loadedDeletedMenuIds = loadedDeletedMenuIds.filter(id => id.startsWith('menu-') || id.startsWith('doc_') || /^[a-zA-Z0-9_-]+$/.test(id));
          if (loadedDeletedMenuIds.length > 0) {
            setDeletedMenuItemIds(loadedDeletedMenuIds);
          }
          const delFilterSet = new Set(loadedDeletedMenuIds.map(s => String(s).trim().toLowerCase()));

          let loadedItems = INITIAL_MENU_ITEMS.filter(m => !delFilterSet.has(m.id.toLowerCase()));
          let loadedMenuItems: MenuItem[] = (parsed.menuItems && Array.isArray(parsed.menuItems))
            ? parsed.menuItems.filter((m: any) => m && typeof m === 'object' && m.id)
            : [];
          // Fallback to separate key ONLY if main state was empty
          if (loadedMenuItems.length === 0) {
            try {
              const sepMenu = bigStore.getItem('POS_MENU_ITEMS_DATA');
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
            .filter(m => !delFilterSet.has(m.id.toLowerCase()));

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
              const sepIng = bigStore.getItem('POS_INGREDIENTS_DATA');
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
              const sepExp = bigStore.getItem('POS_EXPENSES_DATA');
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
              const sepInc = bigStore.getItem('POS_INCOMES_DATA');
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
            // Replace empty, old-default or no-longer-existing logo URLs with the current brand logo
            mergedSettings.shopLogoUrl = normalizeShopLogoUrl(parsed.settings.shopLogoUrl);
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
                  return { ...u, name: 'อาห์มัด (เจ้าของร้าน)', role: 'admin', pin: u.pin || DEFAULT_PIN_HASH };
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
            const savedBranches = (parsed.branches as Branch[]).filter(b => b.id === parsed.branchId || !isSampleBranch(b));
            setBranches(savedBranches.length ? savedBranches : INITIAL_BRANCHES);
            if (parsed.branchId) {
              const b = savedBranches.find((item: Branch) => item.id === parsed.branchId);
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
          const sepOrders = bigStore.getItem('POS_ORDERS_DATA');
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
          const sepIng = bigStore.getItem('POS_INGREDIENTS_DATA');
          if (sepIng) {
            const parsedSep = JSON.parse(sepIng);
            if (Array.isArray(parsedSep) && parsedSep.length > 0) {
              setIngredients(parsedSep);
              console.log(`[POS Storage Sync] 🛡️ Recovered ${parsedSep.length} ingredients from resilient POS_INGREDIENTS_DATA backup.`);
            }
          }
        } catch (e) {}
        try {
          const sepMenu = bigStore.getItem('POS_MENU_ITEMS_DATA');
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

  // Staff cards and work shifts (clock-ins) are shared by every device of the branch, so the
  // timeclock on one device and the payroll on another see the same records
  // Built-in sample staff (from earlier versions) are removed here; the removal is shared, so they
  // also leave the cloud and every other device instead of coming back from an older device
  useEffect(() => {
    if (isStorageLoaded && staffMembers.some(isSampleStaff)) setStaffMembers(prev => prev.filter(s => !isSampleStaff(s)));
  }, [isStorageLoaded, staffMembers]);
  useCloudMergedList({ key: 'staff_members', branchId: currentBranch?.id, items: staffMembers, setItems: setStaffMembers, enabled: isStorageLoaded, offline: effectiveOffline });
  useCloudMergedList({
    key: 'staff_shifts',
    branchId: currentBranch?.id,
    items: shifts,
    setItems: setShifts,
    enabled: isStorageLoaded,
    offline: effectiveOffline,
    // The last ~13 months travel between devices (a year of shifts stays well under the document limit)
    cloudFilter: sh => !sh.date || sh.date >= new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
  });

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
      // Owner first: "เจ้าของร้าน / ผู้จัดการใหญ่" also contains "ผู้จัดการ" and was mapped to manager.
      // A head chef is kitchen staff, not the shop owner.
      if (roleLower.includes('เจ้าของ') || roleLower.includes('owner') || roleLower.includes('admin') || roleLower.includes('แอดมิน')) {
        role = 'admin';
      } else if (roleLower.includes('ผู้จัดการ') || roleLower.includes('manager')) {
        role = 'manager';
      } else if (roleLower.includes('แคชเชียร์') || roleLower.includes('cashier')) {
        role = 'cashier';
      }

      return {
        id: staff.id,
        name: staff.name,
        role,
        pin: staff.pin || DEFAULT_PIN_HASH,
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
        return (
          !u ||
          u.id !== fu.id ||
          u.name !== fu.name ||
          u.pin !== fu.pin ||
          u.role !== fu.role ||
          JSON.stringify(u.permissions || null) !== JSON.stringify(fu.permissions || null)
        );
      });

    if (isDifferent) {
      setUsers(finalUsers);
    }
  }, [staffMembers, isStorageLoaded, users]);

  // PINs are kept hashed: a PIN typed in anywhere (staff forms, older records, other devices on an
  // older version) is replaced by its hash as soon as it is here
  useEffect(() => {
    if (!isStorageLoaded) return;
    if (staffMembers.some(st => st.pin && !isHashedPin(st.pin))) {
      setStaffMembers(prev => prev.map(st => (st.pin && !isHashedPin(st.pin) ? { ...st, pin: hashPin(st.pin) } : st)));
    }
  }, [staffMembers, isStorageLoaded]);
  useEffect(() => {
    if (!isStorageLoaded) return;
    if (users.some(u => u.pin && !isHashedPin(u.pin))) {
      setUsers(prev => prev.map(u => (u.pin && !isHashedPin(u.pin) ? { ...u, pin: hashPin(u.pin) } : u)));
    }
    if (currentUser?.pin && !isHashedPin(currentUser.pin)) setCurrentUser(prev => (prev ? { ...prev, pin: hashPin(prev.pin) } : prev));
  }, [users, currentUser, isStorageLoaded]);

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
        bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (storageErr) {
        console.warn('[POS Storage Sync] ⚠️ LocalStorage quota exceeded or save error. Performing self-healing storage compaction...', storageErr);
        // Prune heavy image payloads while keeping all core business, stock, financial and accounting data 100% intact
        const compactedExpenses = expenses.map(e => {
          if ((e.receiptImage && e.receiptImage.length > 50000) || e.purchaseImages?.length) {
            return { ...e, receiptImage: e.receiptImage && e.receiptImage.length > 50000 ? undefined : e.receiptImage, purchaseImages: undefined };
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
        bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compactedState));
        console.log('[POS Storage Sync] ✅ Successfully recovered and saved state after image compaction.');
      }
      try {
        bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(orders));
      } catch (backupErr) {
        console.warn('[POS Storage Sync] ⚠️ Failed to save POS_ORDERS_DATA backup:', backupErr);
      }
      try {
        bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(ingredients));
      } catch (backupErr) {}
      try {
        bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(menuItems));
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
    // Branch details (name, address, tax ID, PromptPay) are what other devices and the customer
    // QR page show, so they are saved to the cloud too
    if (isFirebaseAvailable() && !effectiveOffline) syncBranchToFirestore(updatedBranch).catch(console.warn);
  };

  const addBranch = (branchData: Omit<Branch, 'id'>) => {
    const newBranch: Branch = {
      ...branchData,
      id: `branch-${Date.now()}`
    };
    setBranches(prev => [...prev, newBranch]);
    setCurrentBranch(newBranch);
    if (isFirebaseAvailable() && !effectiveOffline) syncBranchToFirestore(newBranch).catch(console.warn);
  };

  const deleteBranch = (branchId: string) => {
    // The shop always keeps at least one branch (every sale and setting belongs to one)
    if (branches.length <= 1) return;
    setBranches(prev => {
      const filtered = prev.filter(b => b.id !== branchId);
      if (filtered.length === 0) return prev;
      if (currentBranch.id === branchId) {
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
    lastLocalSettingsEditRef.current = Date.now();
    writeSettingsEditedAt(new Date().toISOString());
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
  /** A menu item as it is stored: recipe lines carry units, costs are recalculated from the recipes. */
  const prepareMenuItem = (item: MenuItem, ings: Ingredient[] = ingredients): MenuItem =>
    withRecipeCosts(
      {
        ...item,
        recipe: withRecipeUnits(item.recipe || [], ings),
        availableProteins: item.availableProteins?.map(p => (p.recipe ? { ...p, recipe: withRecipeUnits(p.recipe, ings) } : p))
      },
      ings
    );

  /** Save changed menu items: state, local cache and cloud (the cloud write happens outside the state updater). */
  const commitMenuItems = (changed: MenuItem[]) => {
    if (changed.length === 0) return;
    const byId = new Map(changed.map(m => [m.id, m]));
    const ids = new Set(changed.map(m => m.id.toLowerCase()));
    const names = new Set(changed.map(m => m.name.trim().toLowerCase()));
    const now = Date.now();
    changed.forEach(m => recentLocalMenuUpdatesRef.current.set(m.id, now));

    // Saving an item makes it active again
    setDeletedMenuItemIds(prev => {
      const next = prev.filter(id => !ids.has(id.toLowerCase()) && !names.has(id.toLowerCase()));
      if (next.length === prev.length) return prev;
      try { localStorage.setItem('POS_DELETED_MENU_IDS', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    setMenuItems(prev => {
      const next = prev.map(m => byId.get(m.id) || m);
      changed.forEach(m => {
        if (!prev.some(p => p.id === m.id)) next.push(m);
      });
      try {
        bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next));
        const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.menuItems = next;
          parsed.deletedMenuItemIds = (parsed.deletedMenuItemIds || []).filter(
            (id: string) => !ids.has(id.toLowerCase()) && !names.has(id.toLowerCase())
          );
          bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });

    changed.forEach(m =>
      syncSingleMenuItemToFirestore(m).catch(err => console.warn('[POS Menu Sync] Failed to sync menu item to Cloud:', err))
    );
  };

  /**
   * Menu items whose costs depend on the given ingredients, recalculated with the new ingredient
   * list (base recipes and protein options).
   */
  const recostMenusUsing = (ingredientIds: Set<string>, ings: Ingredient[], source: MenuItem[] = menuItems): MenuItem[] =>
    source
      .filter(m =>
        [...(m.recipe || []), ...(m.availableProteins || []).flatMap(p => p.recipe || [])].some(r => ingredientIds.has(r.ingredientId))
      )
      .map(m => prepareMenuItem(m, ings));

  const addMenuItem = (itemData: Omit<MenuItem, 'id'>) => {
    commitMenuItems([prepareMenuItem({ ...itemData, id: `menu-${Date.now()}` })]);
  };

  const updateMenuItem = (item: MenuItem) => {
    commitMenuItems([prepareMenuItem(item)]);
  };

  const deleteMenuItem = (itemId: string) => {
    const targetItem = menuItems.find(m => m.id === itemId);
    const itemName = targetItem?.name;
    const idsToDelete = [itemId];

    // Persist ONLY ID, never item name string!
    setDeletedMenuItemIds(prev => {
      const next = Array.from(new Set([...prev, ...idsToDelete]));
      try {
        localStorage.setItem('POS_DELETED_MENU_IDS', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Remove from local state and update local storage immediately
    setMenuItems(prev => {
      const next = prev.filter(m => !idsToDelete.includes(m.id));
      try {
        bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next));
        const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.menuItems = next;
          parsed.deletedMenuItemIds = Array.from(new Set([...(parsed.deletedMenuItemIds || []), ...idsToDelete]));
          bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });

    // Delete item from Firestore by ID only
    deleteMenuItemFromFirestore(itemId, itemName).catch(err => {
      console.warn('[POS Menu Sync] Failed to delete menu item from Cloud:', err);
    });
  };

  // The cost passed by older callers is ignored: costs are always recalculated from the recipe
  const updateMenuItemRecipe = (menuItemId: string, recipe: RecipeIngredient[], _costPrice?: number) => {
    const item = menuItems.find(m => m.id === menuItemId);
    if (item) commitMenuItems([prepareMenuItem({ ...item, recipe })]);
  };

  const batchUpdateMenuItemRecipes = (updates: { menuItemId: string; recipe: RecipeIngredient[]; costPrice?: number }[]) => {
    const byId = new Map(menuItems.map(m => [m.id, m]));
    commitMenuItems(
      updates.flatMap(u => {
        const item = byId.get(u.menuItemId);
        return item ? [prepareMenuItem({ ...item, recipe: u.recipe })] : [];
      })
    );
  };

  const toggleMenuItemFrequent = (menuItemId: string) => {
    const target = menuItems.find(m => m.id === menuItemId);
    if (!target) return;
    const updated = { ...target, isFrequent: !target.isFrequent };
    updateMenuItem(updated);
  };

  const restoreDefaultMenuItems = () => {
    setMenuItems(prev => {
      const currentMap = new Map<string, MenuItem>(prev.map(m => [m.id, m]));
      const currentNameMap = new Map<string, MenuItem>(prev.map(m => [m.name.trim().toLowerCase(), m]));

      INITIAL_MENU_ITEMS.forEach(initItem => {
        if (!currentMap.has(initItem.id) && !currentNameMap.has(initItem.name.trim().toLowerCase())) {
          currentMap.set(initItem.id, initItem);
        }
      });

      const next = Array.from(currentMap.values());
      try {
        bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next));
        const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.menuItems = next;
          bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}

      // Clean deletedMenuItemIds for these active items
      setDeletedMenuItemIds(dPrev => {
        const activeIds = new Set(next.map(m => m.id.toLowerCase()));
        const activeNames = new Set(next.map(m => m.name.trim().toLowerCase()));
        const cleaned = dPrev.filter(id => !activeIds.has(id.toLowerCase()) && !activeNames.has(id.toLowerCase()));
        try { localStorage.setItem('POS_DELETED_MENU_IDS', JSON.stringify(cleaned)); } catch (e) {}
        return cleaned;
      });

      // Sync restored items to Firestore
      next.forEach(item => {
        recentLocalMenuUpdatesRef.current.set(item.id, Date.now());
        syncSingleMenuItemToFirestore(item).catch(console.warn);
      });

      return next;
    });
  };

  const setMenuItemSoldOut = (menuItemId: string, soldOut: boolean) => {
    const item = menuItems.find(m => m.id === menuItemId);
    if (item) commitMenuItems([{ ...item, isSoldOut: soldOut }]);
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
      try { bigStore.setItem('POS_MENU_ITEMS_DATA', JSON.stringify(next)); } catch (e) {}
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
      ...(addonData.recipe ? { recipe: withRecipeUnits(addonData.recipe, ingredients) } : {}),
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

  const updateAddOn = (input: AddOnOption) => {
    const addon = input.recipe ? { ...input, recipe: withRecipeUnits(input.recipe, ingredients) } : input;
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

  const playKitchenChime = useCallback(() => {
    if (settings.enableKitchenSound) playChime();
  }, [settings.enableKitchenSound]);

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
  /**
   * Deduct recipe ingredients for a sale. The local list is updated optimistically and the
   * cloud copy is changed with atomic increments, so a stale snapshot can neither be pushed
   * over other devices' stock nor bounce back and undo this deduction.
   */
  // Stock used while offline (or when a cloud write failed), sent later as deltas so it adds to
  // what other devices deducted meanwhile instead of overwriting their numbers.
  const PENDING_STOCK_KEY = 'POS_PENDING_STOCK_DELTAS';
  const readPendingStock = (): Record<string, Record<string, number>> => {
    try {
      return JSON.parse(localStorage.getItem(PENDING_STOCK_KEY) || '{}') || {};
    } catch {
      return {};
    }
  };
  const addPendingStock = (branchId: string, deltas: Map<string, number>) => {
    const all = readPendingStock();
    const forBranch = all[branchId] || {};
    deltas.forEach((amount, id) => (forBranch[id] = (forBranch[id] || 0) + amount));
    all[branchId] = forBranch;
    try {
      localStorage.setItem(PENDING_STOCK_KEY, JSON.stringify(all));
    } catch {
      // storage full: the local stock numbers are still right on this device
    }
  };
  const flushPendingHistory = async () => {
    const logs = pendingStockLogsRef.current.splice(0);
    const waste = pendingWasteLogsRef.current.splice(0);
    await Promise.all([
      ...logs.map(l => syncStockAdjustmentToFirestore(l, currentBranch)),
      ...waste.map(w => syncWasteLogToFirestore(w, currentBranch))
    ]).catch(console.warn);
  };

  const flushPendingStock = async () => {
    const all = readPendingStock();
    const forBranch = all[currentBranch.id];
    if (!forBranch || Object.keys(forBranch).length === 0) return;
    const ok = await applyStockDeltasToFirestore(new Map(Object.entries(forBranch)), ingredients, currentBranch);
    if (!ok) return;
    const latest = readPendingStock();
    // Remove exactly what was sent; anything added meanwhile stays queued
    const rest = latest[currentBranch.id] || {};
    Object.entries(forBranch).forEach(([id, amount]) => {
      const left = (rest[id] || 0) - amount;
      if (Math.abs(left) < 1e-9) delete rest[id];
      else rest[id] = left;
    });
    latest[currentBranch.id] = rest;
    try {
      localStorage.setItem(PENDING_STOCK_KEY, JSON.stringify(latest));
    } catch {
      // ignore
    }
  };

  /** Apply stock deltas (ingredientId -> amount to subtract) here and in the cloud, or queue them offline. */
  const pushStockDeltas = (deltas: Map<string, number>) => {
    if (deltas.size === 0) return;
    const now = Date.now();
    deltas.forEach((_, id) => recentLocalIngredientUpdatesRef.current.set(id, now));
    setIngredients(prev => {
      const next = applyStockDeductions(prev, deltas);
      persistIngredientsLocally(next);
      return next;
    });
    const branch = currentBranch;
    if (!effectiveOffline && isFirebaseAvailable()) {
      applyStockDeltasToFirestore(deltas, ingredients, branch)
        .then(ok => {
          if (!ok) addPendingStock(branch.id, deltas);
        })
        .catch(err => {
          console.error('[POS] Failed to push stock change to cloud:', err);
          addPendingStock(branch.id, deltas);
        });
    } else {
      addPendingStock(branch.id, deltas);
    }
  };

  const deductStockForSale = (items: CartItem[], direction: 1 | -1 = 1) => {
    const deltas = computeSaleStockDeductions(items, ingredients);
    if (direction === -1) deltas.forEach((amount, id) => deltas.set(id, -amount));
    pushStockDeltas(deltas);
  };

  /** Put the ingredients of items that were never cooked back into stock. */
  const returnStockForItems = (items: CartItem[]) => deductStockForSale(items, -1);

  /** Push a new order; if the write fails it is re-queued for the offline sync instead of being marked synced. */
  const pushNewOrderToCloud = (newOrder: Order) => {
    if (effectiveOffline || !isFirebaseAvailable()) return;
    syncOrderToFirestore(newOrder, currentBranch)
      .then(ok => {
        if (ok) return;
        setOrders(prev =>
          prev.map(o => (o.id === newOrder.id ? { ...o, isSynced: false, isOfflineOrder: true, syncedAt: undefined } : o))
        );
      })
      .catch(err => console.error('[POS] Failed to push order to cloud:', err));
  };

  const createOrder = (
    paymentMethod: PaymentMethod,
    tenderedAmount: number,
    orderType: OrderType,
    tableNumber?: string,
    taxInvoiceCustomer?: CustomerTaxInfo,
    isFullTaxInvoiceRequested = false
  ): Order => {
    const {
      rawSubtotal,
      discountAmount: calculatedDiscount,
      vatAmount,
      grandTotal
    } = computeCartTotals(cart, discount, settings);
    const changeAmount = paymentMethod === 'cash' ? Math.max(0, tenderedAmount - grandTotal) : 0;

    const orderNumber = generateOrderNumber(orders, currentBranch.id);
    const nowIso = new Date().toISOString();

    const newOrder: Order = {
      id: generateOrderId(),
      orderNumber,
      branchId: currentBranch.id,
      orderType,
      tableNumber: orderType === 'dine-in' ? tableNumber || undefined : undefined,
      items: [...cart],
      subtotal: rawSubtotal,
      discountAmount: calculatedDiscount,
      discountType: discount.type,
      discountNote: discount.note,
      couponCode: discount.couponCode,
      memberId: discount.member?.id,
      memberName: discount.member?.name,
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

    deductStockForSale(cart);
    setOrders(prev => [newOrder, ...prev]);
    clearCart();
    pushNewOrderToCloud(newOrder);

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
              const msg = generateLowStockMessage(lowItems, currentBranch, rules.onlyCriticalStock, settings);
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
    const orderNumber = generateOrderNumber(orders, currentBranch.id);
    const nowIso = new Date().toISOString();

    const noteText = customerNickname
      ? `ชื่อลูกค้า: ${customerNickname}${notes ? ' (' + notes + ')' : ''}`
      : notes ? `QR Table Order: ${notes}` : 'QR Table Order';

    const newOrder: Order = {
      id: generateOrderId(),
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
      // Customer / table orders are paid later at the counter (see settleOrderPayment)
      paymentStatus: 'unpaid',
      tenderedAmount: 0,
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

    // Orders waiting for staff approval do not touch stock yet (see updateOrderStatus)
    if (initialStatus !== 'pending-qr') deductStockForSale(items);
    setOrders(prev => [newOrder, ...prev]);
    pushNewOrderToCloud(newOrder);

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

  /** Write the order list to state and to the local cache in one step. */
  const commitOrderChange = (orderId: string, updated: Order) => {
    const key = normalizeOrderId(orderId);
    setOrders(prev => {
      const next = prev.map(ord => (normalizeOrderId(ord.id) === key ? updated : ord));
      // Synchronously write to LocalStorage immediately so page refresh retains state
      try {
        bigStore.setItem('POS_ORDERS_DATA', JSON.stringify(next));
        const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.orders = next;
          parsed.savedAt = updated.updatedAt;
          bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {
        console.warn('[POS Order Sync] Error writing order status to LocalStorage:', e);
      }
      return next;
    });
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const now = new Date().toISOString();
    const normalizedId = normalizeOrderId(orderId);
    // The order is taken from the current list (not from inside the state updater, which React
    // may run later) so the cloud write below always has it.
    const current = orders.find(o => normalizeOrderId(o.id) === normalizedId);
    if (!current || current.status === status) return;

    // Approving a customer's QR order is when its ingredients leave the stock. A rejected
    // (cancelled) QR order never deducted anything, so nothing needs to be returned.
    const isQrApproval = current.status === 'pending-qr' && status !== 'pending-qr' && status !== 'cancelled';
    if (isQrApproval && !approvedQrStockRef.current.has(normalizedId)) {
      approvedQrStockRef.current.add(normalizedId);
      deductStockForSale(resolveItemsForStock(current.items, menuItems, addOns));
    }

    const updated: Order = {
      ...current,
      status,
      updatedAt: now,
      // Called back from "served": the order is open again
      completedAt: status === 'served' ? current.completedAt || now : undefined,
      acceptedAt: isQrApproval ? current.acceptedAt || now : current.acceptedAt,
      cancelledBy:
        status === 'cancelled' && !current.cancelledBy
          ? {
              userId: currentUser?.id,
              userName: currentUser?.name || 'ผู้จัดการ',
              role: currentUser?.role || 'admin',
              cancelledAt: now
            }
          : current.cancelledBy,
      cancelReason: status === 'cancelled' && !current.cancelReason ? 'ยกเลิกรายการโดยพนักงาน' : current.cancelReason,
      isSynced: !effectiveOffline
    };
    commitOrderChange(current.id, updated);

    if (!effectiveOffline && isFirebaseAvailable()) {
      updateOrderStatusInFirestore(current.id, status, {
        completedAt: updated.completedAt,
        acceptedAt: isQrApproval ? updated.acceptedAt : undefined,
        cancelledBy: updated.cancelledBy,
        cancelReason: updated.cancelReason,
        cancelNote: updated.cancelNote
      }).catch(err => {
        console.warn('[POS Order Sync] Failed to update order status in Firestore:', err);
      });
    }
  };

  const settleOrderPayment = (orderId: string, method: PaymentMethod, tenderedAmount: number): Order | null => {
    const normalizedId = orderId.replace(/^ord-/, '');
    const target = orders.find(o => o.id.replace(/^ord-/, '') === normalizedId);
    if (!target) return null;
    const now = new Date().toISOString();
    const tendered = method === 'cash' ? tenderedAmount : target.grandTotal;
    const settled: Order = {
      ...target,
      paymentMethod: method,
      paymentStatus: 'paid',
      paidAt: now,
      tenderedAmount: tendered,
      changeAmount: method === 'cash' ? Math.max(0, tendered - target.grandTotal) : 0,
      updatedAt: now,
      isSynced: !effectiveOffline
    };
    setOrders(prev => prev.map(o => (o.id === target.id ? settled : o)));
    pushNewOrderToCloud(settled);
    return settled;
  };

  // Customer QR page reads public_menu/{branch}: republish it whenever the menu, toppings,
  // categories or price settings change (debounced), so customers never see stale prices.
  const publishCustomerMenu = useCallback(async () => {
    if (effectiveOffline || !isFirebaseAvailable()) return false;
    const menu = buildPublicMenu(menuItems, categories, addOns, settings, currentBranch, resolvePromptPayId(settings, currentBranch));
    return publishPublicMenu(currentBranch.id, menu);
  }, [menuItems, categories, addOns, settings, currentBranch, effectiveOffline]);

  useEffect(() => {
    if (!isStorageLoaded || menuItems.length === 0) return;
    const t = setTimeout(() => {
      publishCustomerMenu().catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, [isStorageLoaded, publishCustomerMenu, menuItems.length]);

  // "Auto-approve QR orders" is a per-device switch: the device that has it on (e.g. the
  // counter tablet) approves customers' QR orders as they arrive, which sends them to the
  // kitchen and deducts their stock exactly once.
  const updateOrderStatusRef = useRef(updateOrderStatus);
  updateOrderStatusRef.current = updateOrderStatus;
  useEffect(() => {
    if (!autoApproveQR || !isStorageLoaded) return;
    orders
      .filter(o => o.status === 'pending-qr' && o.branchId === currentBranch.id)
      .forEach(o => updateOrderStatusRef.current(o.id, 'pending'));
  }, [orders, autoApproveQR, isStorageLoaded, currentBranch.id]);

  const cancelOrder = (
    orderId: string,
    reason: string,
    note?: string,
    cancelledByInfo?: { userId?: string; userName: string; role: string },
    options?: { restock?: boolean }
  ) => {
    const now = new Date().toISOString();
    const operator = cancelledByInfo || {
      userId: currentUser?.id,
      userName: currentUser?.name || 'ผู้จัดการ',
      role: currentUser?.role || 'admin'
    };
    const current = orders.find(o => normalizeOrderId(o.id) === normalizeOrderId(orderId));
    if (!current || current.status === 'cancelled') return;

    // Food that was never cooked goes back to stock. A QR order still waiting for approval
    // never took anything out.
    const tookStock = current.status !== 'pending-qr';
    const restocked = !!options?.restock && tookStock;
    if (restocked) {
      returnStockForItems(resolveItemsForStock(current.items, menuItems, addOns));
    }

    const cancelledBy = {
      userId: operator.userId,
      userName: operator.userName,
      role: operator.role,
      cancelledAt: now
    };
    const updated: Order = {
      ...current,
      status: 'cancelled',
      cancelReason: reason,
      cancelNote: note,
      cancelledBy,
      // Kept on the stock card when the food was made and not put back
      cancelStockUsed: tookStock && !restocked,
      stockReturnedAt: restocked ? now : undefined,
      updatedAt: now,
      isSynced: !effectiveOffline
    };
    commitOrderChange(current.id, updated);

    // Real-time Push to Firestore
    if (!effectiveOffline && isFirebaseAvailable()) {
      updateOrderStatusInFirestore(current.id, 'cancelled', {
        cancelReason: reason,
        cancelNote: note,
        cancelledBy,
        cancelStockUsed: updated.cancelStockUsed,
        stockReturnedAt: updated.stockReturnedAt
      }).catch(err => {
        console.warn('[POS Order Sync] Failed to update cancelled order status in Firestore:', err);
      });
    }

    // Real-Time Notification Trigger: Void Order Alert
    try {
      const triggers = getStoredTriggers();
      const rules = getStoredRules();
      const targetOrder = current;
      if (triggers.voidOrder && targetOrder && (targetOrder.grandTotal || 0) >= (rules.minVoidAmount || 0)) {
        const msg = generateVoidOrderMessage(targetOrder, reason, note, operator.userName, currentBranch, settings);
        dispatchNotification(`ยกเลิกบิล (${targetOrder.orderNumber})`, msg).catch(console.error);
      }
    } catch (err) {
      console.warn('[POS Notification] Void order trigger error:', err);
    }
  };

  /** Issue (or correct) the full tax invoice details of an existing sale; saved to the cloud too. */
  const updateOrderTaxInfo = (orderId: string, taxInfo: CustomerTaxInfo, extra?: { taxInvoiceNo?: string; withholdingTax?: number }) => {
    const current = orders.find(o => o.id === orderId);
    if (!current) return;
    const updated: Order = {
      ...current,
      customerTaxInfo: taxInfo,
      isFullTaxInvoiceRequested: true,
      taxInvoiceNo: extra?.taxInvoiceNo || current.taxInvoiceNo,
      withholdingTax: extra?.withholdingTax ?? current.withholdingTax,
      updatedAt: new Date().toISOString()
    };
    commitOrderChange(orderId, updated);
    pushNewOrderToCloud(updated);
  };

  /** A sale made outside the till (e.g. catering) recorded with its receipt / tax invoice. */
  const addTaxInvoiceOrder = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
    pushNewOrderToCloud(newOrder);
  };

  // Helper to persist ingredients locally to both separate key and master state
  const persistIngredientsLocally = (next: Ingredient[], delIdsToAdd?: string[], delIdsToRemove?: string[]) => {
    try {
      bigStore.setItem('POS_INGREDIENTS_DATA', JSON.stringify(next));
      const saved = bigStore.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.ingredients = next;
        if (delIdsToAdd && delIdsToAdd.length > 0) {
          parsed.deletedIngredientIds = Array.from(new Set([...(parsed.deletedIngredientIds || []), ...delIdsToAdd]));
        }
        if (delIdsToRemove && delIdsToRemove.length > 0) {
          const removeSet = new Set(delIdsToRemove.map(s => s.toLowerCase()));
          parsed.deletedIngredientIds = (parsed.deletedIngredientIds || []).filter((id: string) => !removeSet.has(id.toLowerCase()));
        }
        bigStore.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn('[POSContext] Failed to persist ingredients locally:', e);
    }
  };

  // Inventory functions
  const addIngredient = (ingData: Omit<Ingredient, 'id'>): Ingredient => {
    const newIng: Ingredient = {
      ...ingData,
      id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };

    setDeletedIngredientIds(prev => {
      const next = prev.filter(id => id.toLowerCase() !== newIng.id.toLowerCase());
      try { localStorage.setItem('POS_DELETED_ING_IDS', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    recentLocalIngredientUpdatesRef.current.set(newIng.id, Date.now());

    setIngredients(prev => {
      const next = [...prev, newIng];
      persistIngredientsLocally(next, undefined, [newIng.id]);
      return next;
    });

    syncIngredientToFirestore(newIng, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท').catch(err => {
      console.warn('[POS Inventory Sync] Failed to sync added ingredient to Cloud:', err);
    });

    return newIng;
  };

  const updateIngredient = (updatedIng: Ingredient, stockReason?: string, stockNote?: string) => {
    const sanitizedCost = typeof updatedIng.unitCost === 'number' && !isNaN(updatedIng.unitCost)
      ? updatedIng.unitCost
      : parseFloat(String(updatedIng.unitCost)) || 0;
    const sanitizedStock = typeof updatedIng.currentStock === 'number' && !isNaN(updatedIng.currentStock)
      ? updatedIng.currentStock
      : parseFloat(String(updatedIng.currentStock)) || 0;
    const sanitizedMinAlert = typeof updatedIng.minStockAlert === 'number' && !isNaN(updatedIng.minStockAlert)
      ? updatedIng.minStockAlert
      : parseFloat(String(updatedIng.minStockAlert)) || 0;

    const cleanIng: Ingredient = {
      ...updatedIng,
      unitCost: sanitizedCost,
      currentStock: sanitizedStock,
      minStockAlert: sanitizedMinAlert
    };

    const prevIng = ingredients.find(i => i.id === cleanIng.id);
    const unitCostChanged = prevIng !== undefined && Math.abs((prevIng.unitCost || 0) - sanitizedCost) > 0.0001;

    setDeletedIngredientIds(prev => {
      const next = prev.filter(id => id.toLowerCase() !== cleanIng.id.toLowerCase());
      try { localStorage.setItem('POS_DELETED_ING_IDS', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    recentLocalIngredientUpdatesRef.current.set(cleanIng.id, Date.now());

    // Details are saved as given; the stock level keeps its current value and any difference
    // goes through moveStock (a delta with a history entry)
    // A cost the caller did not change keeps the latest one: a delivery received in the same click
    // may just have updated it (e.g. receiving goods, then remembering their package size)
    const pendingCost = unitCostChanged ? undefined : pendingCostRef.current.get(cleanIng.id);
    const saved: Ingredient = pendingCost === undefined ? cleanIng : { ...cleanIng, unitCost: pendingCost };
    setIngredients(prev => {
      const next = prev.map(ing => (ing.id === saved.id ? { ...saved, currentStock: ing.currentStock } : ing));
      persistIngredientsLocally(next, undefined, [saved.id]);
      return next;
    });

    syncIngredientToFirestore(saved, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท', {
      withStock: false
    }).catch(err => {
      console.warn('[POS Inventory Sync] Failed to sync updated ingredient to Cloud:', err);
    });
    if (prevIng && Math.abs((prevIng.currentStock || 0) - sanitizedStock) > 1e-9) {
      moveStock([
        {
          ingredientId: cleanIng.id,
          change: sanitizedStock - (prevIng.currentStock || 0),
          reason: stockReason || 'manual_adjustment',
          notes: stockNote || 'แก้ยอดจากหน้าข้อมูลวัตถุดิบ'
        }
      ]);
    }

    // A unit change must not change what existing recipe lines mean: lines written without a
    // unit keep the old one. Then costs are recalculated for every dish that uses the ingredient.
    const unitChanged = prevIng !== undefined && canonicalUnit(prevIng.unit) !== canonicalUnit(cleanIng.unit);
    const packageChanged = prevIng !== undefined && (prevIng.packageSize || 0) !== (cleanIng.packageSize || 0);
    if (unitCostChanged || unitChanged || packageChanged) {
      const nextIngredients = ingredients.map(i => (i.id === cleanIng.id ? cleanIng : i));
      const stamp = (lines?: RecipeIngredient[]) =>
        lines?.map(r => (r.ingredientId === cleanIng.id && !r.recipeUnit ? { ...r, recipeUnit: prevIng!.unit } : r));
      const source = unitChanged
        ? menuItems.map(m => ({
            ...m,
            recipe: stamp(m.recipe) || [],
            availableProteins: m.availableProteins?.map(p => ({ ...p, recipe: stamp(p.recipe) }))
          }))
        : menuItems;
      commitMenuItems(recostMenusUsing(new Set([cleanIng.id]), nextIngredients, source));
      if (unitChanged && addOns.some(a => a.recipe?.some(r => r.ingredientId === cleanIng.id && !r.recipeUnit))) {
        addOns.forEach(a => {
          if (a.recipe?.some(r => r.ingredientId === cleanIng.id && !r.recipeUnit)) updateAddOn({ ...a, recipe: stamp(a.recipe) });
        });
      }
    }
  };

  const deleteIngredients = (ingredientIds: string[]) => {
    const idSet = new Set(ingredientIds);
    const itemsToDelete = ingredients.filter(ing => idSet.has(ing.id));

    // Tombstone ONLY valid system IDs (never Thai ingredient names)
    setDeletedIngredientIds(prev => {
      const next = Array.from(new Set([...prev, ...ingredientIds]));
      try { localStorage.setItem('POS_DELETED_ING_IDS', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    setIngredients(prev => {
      const next = prev.filter(ing => !idSet.has(ing.id));
      persistIngredientsLocally(next, ingredientIds);
      return next;
    });

    itemsToDelete.forEach(item => {
      deleteIngredientFromFirestore(item.id, currentBranch?.id || 'branch-1786349847821', item.name).catch(err => {
        console.warn('[POS Inventory Sync] Failed to delete ingredient from Cloud:', err);
      });
    });
  };

  const mergeIngredients = (keepId: string, duplicateId: string): { ok: boolean; error?: string } => {
    const keep = ingredients.find(i => i.id === keepId);
    const dup = ingredients.find(i => i.id === duplicateId);
    if (!keep || !dup || keep.id === dup.id) return { ok: false, error: 'เลือกวัตถุดิบ 2 รายการที่ต่างกัน' };
    const stockToAdd = convertAmount(dup.currentStock || 0, dup.unit, keep.unit);
    if (stockToAdd === null) return { ok: false, error: `หน่วย ${dup.unit} กับ ${keep.unit} รวมกันไม่ได้` };

    const nextIngredients = ingredients.filter(i => i.id !== dup.id);
    const changedMenus = menuItems
      .filter(m => [...(m.recipe || []), ...(m.availableProteins || []).flatMap(p => p.recipe || [])].some(r => r.ingredientId === dup.id) ||
        (m.availableProteins || []).some(p => p.replacesIngredientIds?.includes(dup.id)))
      .map(m =>
        prepareMenuItem(
          {
            ...m,
            recipe: repointRecipe(m.recipe, dup, keep) || [],
            availableProteins: m.availableProteins?.map(p => ({
              ...p,
              recipe: repointRecipe(p.recipe, dup, keep),
              replacesIngredientIds: p.replacesIngredientIds
                ? Array.from(new Set(p.replacesIngredientIds.map(id => (id === dup.id ? keep.id : id))))
                : undefined
            }))
          },
          nextIngredients
        )
      );
    commitMenuItems(changedMenus);

    addOns.forEach(a => {
      const usesDup = a.recipe?.some(r => r.ingredientId === dup.id) || a.ingredientId === dup.id;
      if (!usesDup) return;
      const legacy = a.recipe?.length ? a.recipe : [{ ingredientId: a.ingredientId!, amountNeeded: a.ingredientAmount || 0 }];
      const recipe = repointRecipe(legacy, dup, keep) || [];
      updateAddOn({ ...a, recipe, ingredientId: recipe[0]?.ingredientId, ingredientAmount: recipe[0]?.amountNeeded });
    });

    updateIngredient({ ...keep, currentStock: (keep.currentStock || 0) + stockToAdd }, 'restock', `รวมสต็อกจาก "${dup.name}"`);
    deleteIngredients([dup.id]);
    return { ok: true };
  };

  const toggleIngredientFrequent = (ingredientId: string) => {
    const target = ingredients.find(i => i.id === ingredientId);
    if (!target) return;
    const updated = { ...target, isFrequent: !target.isFrequent };
    updateIngredient(updated);
  };

  /**
   * Same details for several ingredients at once (category, unit, alert level, cost). Stock is not
   * changed here. Like updateIngredient, a unit change keeps existing recipe lines meaning the same
   * and dish costs are recalculated, once for all changed ingredients together.
   */
  const bulkUpdateIngredients = (ingredientIds: string[], input: Partial<Omit<Ingredient, 'id'>>) => {
    const { currentStock: _ignored, ...updates } = input;
    const idSet = new Set(ingredientIds);
    const now = Date.now();
    ingredientIds.forEach(id => recentLocalIngredientUpdatesRef.current.set(id, now));

    const before = new Map(ingredients.filter(i => idSet.has(i.id)).map(i => [i.id, i]));
    const nextIngredients = ingredients.map(i => (idSet.has(i.id) ? { ...i, ...updates } : i));

    setIngredients(prev => {
      const next = prev.map(ing => (idSet.has(ing.id) ? { ...ing, ...updates } : ing));
      persistIngredientsLocally(next);
      return next;
    });
    nextIngredients
      .filter(i => idSet.has(i.id))
      .forEach(updated =>
        syncIngredientToFirestore(updated, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท', {
          withStock: false
        }).catch(err => console.warn('[POS Inventory Sync] Failed to sync bulk updated ingredient to Cloud:', err))
      );

    const unitChanged = updates.unit !== undefined;
    const costChanged = updates.unitCost !== undefined || updates.packageSize !== undefined;
    if (!unitChanged && !costChanged) return;
    const stamp = (lines?: RecipeIngredient[]) =>
      lines?.map(r => (idSet.has(r.ingredientId) && !r.recipeUnit ? { ...r, recipeUnit: before.get(r.ingredientId)?.unit || 'pcs' } : r));
    const source = unitChanged
      ? menuItems.map(m => ({
          ...m,
          recipe: stamp(m.recipe) || [],
          availableProteins: m.availableProteins?.map(p => ({ ...p, recipe: stamp(p.recipe) }))
        }))
      : menuItems;
    commitMenuItems(recostMenusUsing(idSet, nextIngredients, source));
    if (unitChanged) {
      addOns.forEach(a => {
        if (a.recipe?.some(r => idSet.has(r.ingredientId) && !r.recipeUnit)) updateAddOn({ ...a, recipe: stamp(a.recipe) });
      });
    }
  };

  const updateIngredientStock = (ingredientId: string, newStock: number) => {
    recordStockAdjustment(ingredientId, newStock, 'manual_adjustment');
  };

  /** Costs set since the last render (state read in the same click does not have them yet) */
  const pendingCostRef = useRef(new Map<string, number>());
  useEffect(() => {
    pendingCostRef.current.clear();
  });

  const updateIngredientPriceAndRecalculate = (
    ingredientId: string,
    newUnitCost: number,
    updatedMenuPrices?: Record<string, number>
  ) => {
    const cleanUnitCost = typeof newUnitCost === 'number' && !isNaN(newUnitCost)
      ? newUnitCost
      : parseFloat(String(newUnitCost)) || 0;

    recentLocalIngredientUpdatesRef.current.set(ingredientId, Date.now());
    pendingCostRef.current.set(ingredientId, cleanUnitCost);

    // 1. Update ingredient unit cost
    setIngredients(prev => {
      const next = prev.map(ing => {
        if (ing.id === ingredientId) {
          const updated = { ...ing, unitCost: cleanUnitCost };
          syncIngredientToFirestore(updated, currentBranch?.id || 'branch-1786349847821', currentBranch?.name || 'ครัวกะเพรา ตลาด กกท', { withStock: false }).catch(err => {
            console.warn('[POS Inventory Sync] Failed to sync unit cost to Cloud:', err);
          });
          return updated;
        }
        return ing;
      });
      persistIngredientsLocally(next);
      return next;
    });

    // 2. Recalculate cost for affected menu items (and update retail price if provided)
    const nextIngredients = ingredients.map(i => (i.id === ingredientId ? { ...i, unitCost: cleanUnitCost } : i));
    const recosted = new Map(recostMenusUsing(new Set([ingredientId]), nextIngredients).map(m => [m.id, m]));
    Object.entries(updatedMenuPrices || {}).forEach(([id, price]) => {
      const item = recosted.get(id) || menuItems.find(m => m.id === id);
      if (item) recosted.set(id, { ...item, price });
    });
    commitMenuItems(Array.from(recosted.values()));
  };

  /** Goods received: a lot record plus the stock increase (with purchase price when given). */
  const addStockLot = (lotData: Omit<StockLot, 'id'>) => {
    const newLot: StockLot = {
      ...lotData,
      id: `lot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    };
    setStockLots(prev => [newLot, ...prev]);
    // The ingredient's cost becomes the weighted average of the stock on hand and this delivery
    // (food cost and stock value follow what was actually paid)
    const ing = ingredients.find(i => i.id === lotData.ingredientId);
    if (ing && lotData.unitCost > 0 && lotData.quantity > 0) {
      const average = averageCostAfterPrep(ing, lotData.quantity, lotData.quantity * lotData.unitCost);
      if (Math.abs(average - (ing.unitCost || 0)) > 1e-6) updateIngredientPriceAndRecalculate(ing.id, average);
    }
    const pkg = lotData.packageQty && lotData.packageUnit ? ` (${lotData.packageQty} ${lotData.packageUnit})` : '';
    moveStock([
      {
        ingredientId: lotData.ingredientId,
        change: lotData.quantity,
        reason: 'restock',
        notes: [`รับเข้า ${lotData.lotNumber}${pkg}`, lotData.supplier && `จาก ${lotData.supplier}`, lotData.notes].filter(Boolean).join(' · ')
      }
    ]);
  };

  const producePrep = (run: { outputIngredientId: string; outputQty: number; inputs: { ingredientId: string; quantity: number }[]; note?: string }) => {
    const byId = new Map(ingredients.map(i => [i.id, i]));
    const output = byId.get(run.outputIngredientId);
    if (!output || !(run.outputQty > 0)) return { cost: 0, unitCost: 0, averageCost: 0 };
    const inputs = run.inputs.filter(i => byId.has(i.ingredientId) && i.quantity > 0);
    const cost = inputs.reduce((sum, i) => sum + i.quantity * effectiveUnitCost(byId.get(i.ingredientId)!), 0);
    const label = `ผลิต ${output.name}${run.note ? ` · ${run.note}` : ''}`;
    // Value moves from the inputs to the output: one stock movement for the whole run
    moveStock([
      ...inputs.map(i => ({ ingredientId: i.ingredientId, change: -i.quantity, reason: 'cooking_prep', notes: label })),
      { ingredientId: output.id, change: run.outputQty, reason: 'prep_output', notes: `${label} (ต้นทุน ฿${cost.toFixed(2)})` }
    ]);
    const averageCost = averageCostAfterPrep(output, run.outputQty, cost);
    updateIngredientPriceAndRecalculate(output.id, averageCost);
    return { cost: Math.round(cost * 100) / 100, unitCost: cost / run.outputQty, averageCost };
  };

  const receiveNewIngredient = (ingData: Omit<Ingredient, 'id' | 'currentStock'>, quantity: number, note: string): Ingredient => {
    // Created with the stock already in it: moveStock cannot see an ingredient added in the same click
    const qty = Math.max(0, quantity);
    const ing = addIngredient({ ...ingData, currentStock: qty });
    if (qty > 0) {
      const log: StockAdjustmentLog = {
        id: `adj-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        previousStock: 0,
        newStock: qty,
        changeQty: qty,
        unit: ing.unit,
        reason: 'restock',
        notes: note,
        userName: currentUser?.name || 'ผู้ใช้งานระบบ',
        userRole: currentUser?.role || 'staff',
        timestamp: new Date().toISOString()
      };
      setStockAdjustmentLogs(prev => [log, ...prev]);
      if (isFirebaseAvailable() && !effectiveOffline) {
        syncStockAdjustmentToFirestore(log, currentBranch).catch(console.warn);
      } else {
        pendingStockLogsRef.current.push(log);
      }
    }
    return ing;
  };

  // Waste Log operations
  const addWasteLog = (logData: Omit<WasteLog, 'id'>) => {
    const newLog: WasteLog = {
      ...logData,
      id: `waste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    };
    setWasteLogs(prev => [newLog, ...prev]);
    if (isFirebaseAvailable() && !effectiveOffline) {
      syncWasteLogToFirestore(newLog, currentBranch).catch(console.warn);
    } else {
      pendingWasteLogsRef.current.push(newLog);
    }
    moveStock([
      {
        ingredientId: logData.ingredientId,
        change: -Math.abs(logData.quantity),
        reason: logData.reason === 'expired' ? 'expired' : logData.reason === 'damaged' ? 'damaged' : 'waste',
        notes: logData.notes,
        userName: logData.reportedBy
      }
    ]);
  };

  const issueStock = (lines: { ingredientId: string; quantity: number }[], opts: { waste?: WasteReason; note: string }) => {
    const byId = new Map(ingredients.map(i => [i.id, i]));
    // One line per item, so the stock history shows the right balances
    const totals = new Map<string, number>();
    lines.forEach(l => {
      if (byId.has(l.ingredientId) && l.quantity > 0) totals.set(l.ingredientId, (totals.get(l.ingredientId) || 0) + l.quantity);
    });
    const userName = currentUser?.name || 'ผู้ใช้งานระบบ';
    const today = localDay(new Date().toISOString());
    let cost = 0;
    const waste: WasteLog[] = [];
    totals.forEach((qty, id) => {
      const ing = byId.get(id)!;
      const unitCost = effectiveUnitCost(ing);
      cost += qty * unitCost;
      if (opts.waste) {
        waste.push({
          id: `waste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ingredientId: id,
          ingredientName: ing.name,
          quantity: qty,
          unit: ing.unit,
          unitCost,
          totalCostLoss: Math.round(qty * unitCost * 100) / 100,
          reason: opts.waste,
          loggedDate: today,
          notes: opts.note,
          reportedBy: userName
        });
      }
    });
    if (waste.length) {
      setWasteLogs(prev => [...waste, ...prev]);
      if (isFirebaseAvailable() && !effectiveOffline) waste.forEach(w => syncWasteLogToFirestore(w, currentBranch).catch(console.warn));
      else pendingWasteLogsRef.current.push(...waste);
    }
    const reason = !opts.waste ? 'issue' : opts.waste === 'expired' ? 'expired' : opts.waste === 'damaged' ? 'damaged' : 'waste';
    moveStock(Array.from(totals, ([ingredientId, qty]) => ({ ingredientId, change: -qty, reason, notes: opts.note, userName })));
    return { cost: Math.round(cost * 100) / 100 };
  };

  // Waste records are shared history like stock adjustments; they are not deleted
  const deleteWasteLog = (_logId: string) => undefined;

  // Accounting functions
  const addExpense = (expData: Omit<Expense, 'id'> & { id?: string }) => {
    const newExp: Expense = {
      ...expData,
      id: expData.id || `exp-${Date.now()}`
    };
    setExpenses(prev => {
      const updated = [newExp, ...prev];
      try {
        bigStore.setItem('POS_EXPENSES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache expense immediately, retrying compact', e);
        try {
          const compact = updated.map(item =>
            (item.receiptImage && item.receiptImage.length > 50000) || item.purchaseImages?.length
              ? { ...item, receiptImage: item.receiptImage && item.receiptImage.length > 50000 ? undefined : item.receiptImage, purchaseImages: undefined }
              : item
          );
          bigStore.setItem('POS_EXPENSES_DATA', JSON.stringify(compact));
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
    return newExp;
  };

  /** Change details of a saved expense (e.g. links to its documents in Google Drive) */
  const updateExpense = (expenseId: string, patch: Partial<Expense>) => {
    // From the latest list (the caller may hold an older render's copy, e.g. after an upload)
    const current = expensesRef.current.find(e => e.id === expenseId);
    setExpenses(prev => {
      const updated = prev.map(e => (e.id === expenseId ? { ...e, ...patch, id: e.id } : e));
      try {
        bigStore.setItem('POS_EXPENSES_DATA', JSON.stringify(updated));
      } catch {
        // kept in memory and in the cloud
      }
      return updated;
    });
    if (current && isFirebaseAvailable()) {
      syncExpenseToFirestore({ ...current, ...patch, id: current.id }, currentBranch).catch(err => console.warn('[POSContext] Failed to sync updated expense:', err));
    }
  };

  const deleteExpense = (expenseId: string) => {
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== expenseId);
      try {
        bigStore.setItem('POS_EXPENSES_DATA', JSON.stringify(updated));
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

  const addIncome = (incData: Omit<OtherIncome, 'id'> & { id?: string }) => {
    const newInc: OtherIncome = {
      ...incData,
      id: incData.id || `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: incData.createdAt || new Date().toISOString()
    };
    setIncomes(prev => {
      const updated = [newInc, ...prev];
      try {
        bigStore.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache income immediately, retrying compact', e);
        try {
          const compact = updated.map(item => (item.slipImage && item.slipImage.length > 50000) ? { ...item, slipImage: undefined } : item);
          bigStore.setItem('POS_INCOMES_DATA', JSON.stringify(compact));
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
  return newInc;
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
        bigStore.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
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
        bigStore.setItem('POS_INCOMES_DATA', JSON.stringify(updated));
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
            pin: fallback.pin || DEFAULT_PIN_HASH,
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
      if (parsed.branches && Array.isArray(parsed.branches)) setBranches((parsed.branches as Branch[]).filter(b => b.id === currentBranch?.id || !isSampleBranch(b)));
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
      return o.branchId === currentBranch.id && countsAsRevenue(o) && oTime >= openTime && oTime <= closeTime;
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
    bigStore.removeItem(LOCAL_STORAGE_KEY);
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
    bigStore.removeItem(LOCAL_STORAGE_KEY);
  };

  const sendDailySummaryNotification = async (channel: 'telegram' | 'line' | 'both' = 'both') => {
    const msg = generateDailySummaryMessage(orders, ingredients, currentBranch, settings, { expenses, incomes });
    const res = await dispatchNotification('สรุปยอดขายประจำวัน', msg, {
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
        permissions,
        setCurrentUser,
        users,
        updateUserPin,
        menuItems,
        addOns,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        updateMenuItemRecipe,
        batchUpdateMenuItemRecipes,
        toggleMenuItemFrequent,
        toggleMenuItemAddOns,
        setMenuItemSoldOut,
        mergeIngredients,
        restoreDefaultMenuItems,
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
        settleOrderPayment,
        publishCustomerMenu,
        cancelOrder,
        updateOrderTaxInfo,
        addTaxInvoiceOrder,
        addIngredient,
        updateIngredient,
        deleteIngredients,
        toggleIngredientFrequent,
        bulkUpdateIngredients,
        updateIngredientStock,
        updateIngredientPriceAndRecalculate,
        addStockLot,
        receiveNewIngredient,
        producePrep,
        issueStock,
        wasteLogs,
        addWasteLog,
        deleteWasteLog,
        stockAdjustmentLogs,
        addStockAdjustmentLog,
        recordStockAdjustment,
        clearStockAdjustmentLogs,
        moveStock,
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
        updateExpense,
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
        loadHistory,
        historyLoading,
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
