import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { calcRecipeItemCostAndDeduction } from '../utils/recipeUtils';
import { syncAndHealCategories, syncAndHealIngredientCategories } from '../utils/categoryUtils';
import {
  MenuItem,
  Ingredient,
  StockLot,
  Order,
  Expense,
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
  CentralBranchLiveStats,
  FirebaseSyncState
} from '../types';
import {
  syncBranchToFirestore,
  syncOrderToFirestore,
  syncOrdersBatchToFirestore,
  syncInventoryToFirestore,
  syncStockAdjustmentToFirestore,
  syncWasteLogToFirestore,
  subscribeToCentralBranches,
  isFirebaseAvailable
} from '../services/firebaseService';
import {
  INITIAL_BRANCHES,
  INITIAL_USERS,
  INITIAL_INGREDIENTS,
  INITIAL_STOCK_LOTS,
  INITIAL_MENU_ITEMS,
  STANDARD_ADD_ONS,
  INITIAL_EXPENSES,
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

  // Menu item CRUD
  addMenuItem: (itemData: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (item: MenuItem) => void;
  deleteMenuItem: (itemId: string) => void;
  updateMenuItemRecipe: (menuItemId: string, recipe: RecipeIngredient[], costPrice: number) => void;

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
  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
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
}

const POSContext = createContext<POSContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kaprao_pos_enterprise_v1';

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
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
    setCategories(prev => [...prev, newCat]);
  };

  const updateCategory = (id: string, name: string, icon?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: trimmed, icon: icon || c.icon } : c));
  };

  const deleteCategory = (id: string) => {
    if (categories.length <= 1) {
      alert('ไม่สามารถลบหมวดหมู่ทั้งหมดได้ ต้องมีอย่างน้อย 1 หมวดหมู่ในระบบ');
      return;
    }
    const remaining = categories.filter(c => c.id !== id);
    const fallbackCatId = remaining[0]?.id || 'kaprao';
    setCategories(remaining);
    setMenuItems(prev => prev.map(m => m.category === id ? { ...m, category: fallbackCatId } : m));
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

  const [menuItems, setMenuItems] = useState<MenuItem[]>(INITIAL_MENU_ITEMS);
  const [addOns, setAddOns] = useState<AddOnOption[]>(STANDARD_ADD_ONS);
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
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
    setIngredients(prev =>
      prev.map(ing => (ing.id === ingredientId ? { ...ing, currentStock: sanitizedNewStock } : ing))
    );

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

  const pushAllBranchDataToCloud = async (): Promise<boolean> => {
    if (!isFirebaseAvailable() || effectiveOffline) {
      return false;
    }
    setFirebaseSyncState(prev => ({ ...prev, status: 'syncing' }));
    try {
      await syncBranchToFirestore(currentBranch);
      await syncInventoryToFirestore(ingredients, currentBranch);
      const branchOrders = orders.filter(o => o.branchId === currentBranch.id);
      await syncOrdersBatchToFirestore(branchOrders, currentBranch);
      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setFirebaseSyncState(prev => ({
        ...prev,
        status: 'connected',
        lastSyncedAt: nowIso,
        lastSyncedBranch: currentBranch.name,
        pendingSyncCount: 0
      }));
      return true;
    } catch (e) {
      console.error('[Firebase Push] Error pushing full branch data:', e);
      setFirebaseSyncState(prev => ({ ...prev, status: 'error', errorMessage: String(e) }));
      return false;
    }
  };

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

          if (parsed.orders && Array.isArray(parsed.orders)) {
            const validOrders = parsed.orders.filter((o: any) => o && typeof o === 'object' && o.id);
            setOrders(validOrders);
            loadedOrdersCount = validOrders.length;
          }
          let loadedCats = DEFAULT_CATEGORIES;
          if (parsed.categories && Array.isArray(parsed.categories)) {
            loadedCats = parsed.categories;
          }

          let loadedItems = INITIAL_MENU_ITEMS;
          if (parsed.menuItems && Array.isArray(parsed.menuItems)) {
            const validItems = parsed.menuItems.filter((m: any) => m && typeof m === 'object' && m.id);
            setMenuItems(validItems);
            loadedItems = validItems;
            loadedMenuItemsCount = validItems.length;
          }

          // Always heal categories so no custom or imported category is ever lost
          const healedCategories = syncAndHealCategories(loadedCats, loadedItems);
          setCategories(healedCategories);

          if (parsed.ingredientCategories && Array.isArray(parsed.ingredientCategories)) {
            setIngredientCategories(syncAndHealIngredientCategories(parsed.ingredientCategories, parsed.ingredients || []));
          } else if (parsed.ingredients && Array.isArray(parsed.ingredients)) {
            setIngredientCategories(prev => syncAndHealIngredientCategories(prev, parsed.ingredients));
          }
          if (parsed.addOns && Array.isArray(parsed.addOns)) setAddOns(parsed.addOns);
          if (parsed.ingredients && Array.isArray(parsed.ingredients)) setIngredients(parsed.ingredients);
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
          if (parsed.expenses && Array.isArray(parsed.expenses)) setExpenses(parsed.expenses);
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
          if (parsed.users && Array.isArray(parsed.users)) setUsers(parsed.users);
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
      }
    } catch (err) {
      console.error('[POS Storage Sync] ❌ Failed to load state from LocalStorage:', err);
    } finally {
      setIsStorageLoaded(true);
    }
  }, []);

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

    const activeStaff = staffMembers.filter(s => s.status !== 'inactive');

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

    const extraAdmin = users.find(u => u.id === 'usr-admin' && !staffAsUsers.some(s => s.id === 'usr-admin'));
    const finalUsers = extraAdmin ? [extraAdmin, ...staffAsUsers] : staffAsUsers;

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
        menuItems,
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
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
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
    menuItems,
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
    setTables(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
  };

  const updateTable = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setTables(prev => prev.map(t => t === oldName ? trimmed : t));
  };

  const deleteTable = (tableName: string) => {
    setTables(prev => prev.filter(t => t !== tableName));
  };

  const updateSettings = (newSettings: Partial<SystemSettings>) => {
    let newPromptPay = newSettings.promptpayMobileOrTaxId || newSettings.promptPayId;
    if (!newPromptPay && newSettings.qrPaymentMethods) {
      const pmPromptPay = newSettings.qrPaymentMethods.find(m => m.type === 'promptpay');
      if (pmPromptPay?.accountNumber) {
        newPromptPay = pmPromptPay.accountNumber.trim();
      }
    }

    setSettings(prev => ({
      ...prev,
      ...newSettings,
      ...(newPromptPay ? { promptpayMobileOrTaxId: newPromptPay, promptPayId: newPromptPay } : {})
    }));

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
        return updated;
      });
    }
  };

  // Menu Item CRUD
  const addMenuItem = (itemData: Omit<MenuItem, 'id'>) => {
    const newItem: MenuItem = {
      ...itemData,
      id: `menu-${Date.now()}`
    };
    setMenuItems(prev => [...prev, newItem]);
  };

  const updateMenuItem = (item: MenuItem) => {
    setMenuItems(prev => prev.map(m => (m.id === item.id ? item : m)));
  };

  const deleteMenuItem = (itemId: string) => {
    setMenuItems(prev => prev.filter(m => m.id !== itemId));
  };

  const updateMenuItemRecipe = (menuItemId: string, recipe: RecipeIngredient[], costPrice: number) => {
    setMenuItems(prev =>
      prev.map(m => (m.id === menuItemId ? { ...m, recipe, costPrice } : m))
    );
  };

  // AddOn / Topping CRUD
  const addAddOn = (addonData: Omit<AddOnOption, 'id'>) => {
    const newAddon: AddOnOption = {
      ...addonData,
      id: `addon-${Date.now()}`
    };
    setAddOns(prev => [...prev, newAddon]);
  };

  const updateAddOn = (addon: AddOnOption) => {
    setAddOns(prev => prev.map(a => (a.id === addon.id ? addon : a)));
  };

  const deleteAddOn = (addonId: string) => {
    setAddOns(prev => prev.filter(a => a.id !== addonId));
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

    return newOrder;
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          const now = new Date().toISOString();
          return {
            ...ord,
            status,
            updatedAt: now,
            completedAt: status === 'served' ? now : ord.completedAt,
            cancelledBy: status === 'cancelled' && !ord.cancelledBy ? {
              userId: currentUser?.id,
              userName: currentUser?.name || 'ผู้จัดการ',
              role: currentUser?.role || 'admin',
              cancelledAt: now
            } : ord.cancelledBy,
            cancelReason: status === 'cancelled' && !ord.cancelReason ? 'ยกเลิกรายการโดยพนักงาน' : ord.cancelReason
          };
        }
        return ord;
      })
    );
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

    setOrders(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          return {
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
            updatedAt: now
          };
        }
        return ord;
      })
    );
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
  const addIngredient = (ingData: Omit<Ingredient, 'id'>) => {
    const newIng: Ingredient = {
      ...ingData,
      id: `ing-${Date.now()}`
    };
    setIngredients(prev => [...prev, newIng]);
  };

  const deleteIngredients = (ingredientIds: string[]) => {
    const idSet = new Set(ingredientIds);
    setIngredients(prev => prev.filter(ing => !idSet.has(ing.id)));
  };

  const bulkUpdateIngredients = (ingredientIds: string[], updates: Partial<Omit<Ingredient, 'id'>>) => {
    const idSet = new Set(ingredientIds);
    setIngredients(prev =>
      prev.map(ing => (idSet.has(ing.id) ? { ...ing, ...updates } : ing))
    );
  };

  const updateIngredientStock = (ingredientId: string, newStock: number) => {
    setIngredients(prev =>
      prev.map(ing => (ing.id === ingredientId ? { ...ing, currentStock: Math.max(0, newStock) } : ing))
    );
  };

  const updateIngredientPriceAndRecalculate = (
    ingredientId: string,
    newUnitCost: number,
    updatedMenuPrices?: Record<string, number>
  ) => {
    // 1. Update ingredient unit cost
    setIngredients(prev =>
      prev.map(ing => (ing.id === ingredientId ? { ...ing, unitCost: newUnitCost } : ing))
    );

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
    setExpenses(prev => [newExp, ...prev]);
  };

  const deleteExpense = (expenseId: string) => {
    setExpenses(prev => prev.filter(e => e.id !== expenseId));
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
    setSettings(INITIAL_SETTINGS);
    setCart([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  const cleanSlateForProduction = () => {
    setOrders([]);
    setExpenses([]);
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
        addAddOn,
        updateAddOn,
        deleteAddOn,
        ingredients,
        stockLots,
        orders,
        expenses,
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
        pushAllBranchDataToCloud
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
