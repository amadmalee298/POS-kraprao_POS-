import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  MenuItem,
  Ingredient,
  StockLot,
  Order,
  Expense,
  Branch,
  User,
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
  CashMovement
} from '../types';
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
  INITIAL_CASH_SHIFTS
} from '../data/initialData';
import { calculateOrderTotals } from '../utils/tax';

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
  
  // Sound trigger for KDS
  playKitchenChime: () => void;

  // Offline PWA & Storage Sync
  isOffline: boolean;
  forceOfflineMode: boolean;
  setForceOfflineMode: (val: boolean) => void;
  lastSyncedAt: string | null;
  pendingOfflineCount: number;
  syncOfflineQueue: () => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kaprao_pos_enterprise_v1';

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [branches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);

  const updateUserPin = (userId: string, newPin: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, pin: newPin } : u));
    if (currentUser?.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, pin: newPin } : prev);
    }
  };
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>(INITIAL_MENU_ITEMS);
  const [addOns, setAddOns] = useState<AddOnOption[]>(STANDARD_ADD_ONS);
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
  const [stockLots, setStockLots] = useState<StockLot[]>(INITIAL_STOCK_LOTS);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>(INITIAL_WASTE_LOGS);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(INITIAL_STAFF_MEMBERS);
  const [shifts, setShifts] = useState<ShiftEntry[]>(INITIAL_SHIFTS);
  const [shiftSwapRequests, setShiftSwapRequests] = useState<ShiftSwapRequest[]>(INITIAL_SHIFT_SWAP_REQUESTS);
  const [cashShifts, setCashShifts] = useState<CashShift[]>(INITIAL_CASH_SHIFTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [autoApproveQR, setAutoApproveQR] = useState<boolean>(false);
  const [tables, setTables] = useState<string[]>(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14']);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<DiscountState>({ amount: 0, type: 'fixed' });

  // Offline Network Detector & Sync Queue
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [forceOfflineMode, setForceOfflineMode] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(new Date().toISOString());

  const effectiveOffline = isOffline || forceOfflineMode;
  const pendingOfflineCount = orders.filter(o => o.isOfflineOrder && !o.isSynced).length;

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Auto sync when re-connected
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncOfflineQueue = () => {
    const nowIso = new Date().toISOString();
    setOrders(prev =>
      prev.map(ord => {
        if (ord.isOfflineOrder && !ord.isSynced) {
          return {
            ...ord,
            isSynced: true,
            syncedAt: nowIso
          };
        }
        return ord;
      })
    );
    setLastSyncedAt(nowIso);
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

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('table') || params.get('qr')) {
        setActiveTab('qr');
      }

      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.menuItems && Array.isArray(parsed.menuItems)) setMenuItems(parsed.menuItems);
        if (parsed.addOns && Array.isArray(parsed.addOns)) setAddOns(parsed.addOns);
        if (parsed.ingredients) setIngredients(parsed.ingredients);
        if (parsed.stockLots) setStockLots(parsed.stockLots);
        if (parsed.wasteLogs && Array.isArray(parsed.wasteLogs)) setWasteLogs(parsed.wasteLogs);
        if (parsed.staffMembers && Array.isArray(parsed.staffMembers)) setStaffMembers(parsed.staffMembers);
        if (parsed.shifts && Array.isArray(parsed.shifts)) setShifts(parsed.shifts);
        if (parsed.shiftSwapRequests && Array.isArray(parsed.shiftSwapRequests)) setShiftSwapRequests(parsed.shiftSwapRequests);
        if (parsed.cashShifts && Array.isArray(parsed.cashShifts)) setCashShifts(parsed.cashShifts);
        if (parsed.orders) setOrders(parsed.orders);
        if (parsed.expenses) setExpenses(parsed.expenses);
        if (parsed.settings) setSettings(parsed.settings);
        if (typeof parsed.autoApproveQR === 'boolean') setAutoApproveQR(parsed.autoApproveQR);
        if (parsed.users && Array.isArray(parsed.users)) setUsers(parsed.users);
        if (parsed.branchId) {
          const b = INITIAL_BRANCHES.find(item => item.id === parsed.branchId);
          if (b) setCurrentBranch(b);
        }
      }
    } catch (err) {
      console.error('Failed to load local storage state:', err);
    }
  }, []);

  // Save state to localStorage whenever state updates
  useEffect(() => {
    try {
      const stateToSave = {
        menuItems,
        addOns,
        ingredients,
        stockLots,
        wasteLogs,
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
        branchId: currentBranch.id
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (err) {
      console.error('Failed to save local storage state:', err);
    }
  }, [menuItems, addOns, ingredients, stockLots, wasteLogs, staffMembers, shifts, shiftSwapRequests, cashShifts, orders, expenses, settings, autoApproveQR, tables, currentBranch]);

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
    setSettings(prev => ({ ...prev, ...newSettings }));
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
      syncedAt: effectiveOffline ? undefined : nowIso
    };

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
            const needed = rec.amountNeeded * qty;
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
                const needed = rec.amountNeeded * qty;
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
              const needed = addon.ingredientAmount * qty;
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
      syncedAt: effectiveOffline ? undefined : nowIso
    };

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
            const needed = rec.amountNeeded * qty;
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
                const needed = rec.amountNeeded * qty;
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
              const needed = addon.ingredientAmount * qty;
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
          const costPerUnit = r.ingredientId === ingredientId ? newUnitCost : (ingCostMap.get(r.ingredientId) ?? 0);
          recalculatedCost += r.amountNeeded * costPerUnit;
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
  };

  const deleteStaffMember = (staffId: string) => {
    setStaffMembers(prev => prev.filter(s => s.id !== staffId));
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
      branch: currentBranch,
      branchId: currentBranch.id,
      menuItems,
      addOns,
      ingredients,
      stockLots,
      wasteLogs,
      staffMembers,
      shifts,
      shiftSwapRequests,
      cashShifts,
      orders,
      expenses,
      settings,
      users,
      autoApproveQR,
      tables
    };
    return JSON.stringify(data, null, 2);
  };

  const importStateJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.menuItems && Array.isArray(parsed.menuItems)) setMenuItems(parsed.menuItems);
      if (parsed.addOns && Array.isArray(parsed.addOns)) setAddOns(parsed.addOns);
      if (parsed.ingredients && Array.isArray(parsed.ingredients)) setIngredients(parsed.ingredients);
      if (parsed.stockLots && Array.isArray(parsed.stockLots)) setStockLots(parsed.stockLots);
      if (parsed.wasteLogs && Array.isArray(parsed.wasteLogs)) setWasteLogs(parsed.wasteLogs);
      if (parsed.staffMembers && Array.isArray(parsed.staffMembers)) setStaffMembers(parsed.staffMembers);
      if (parsed.shifts && Array.isArray(parsed.shifts)) setShifts(parsed.shifts);
      if (parsed.shiftSwapRequests && Array.isArray(parsed.shiftSwapRequests)) setShiftSwapRequests(parsed.shiftSwapRequests);
      if (parsed.cashShifts && Array.isArray(parsed.cashShifts)) setCashShifts(parsed.cashShifts);
      if (parsed.orders && Array.isArray(parsed.orders)) setOrders(parsed.orders);
      if (parsed.expenses && Array.isArray(parsed.expenses)) setExpenses(parsed.expenses);
      if (parsed.settings && typeof parsed.settings === 'object') setSettings(parsed.settings);
      if (parsed.users && Array.isArray(parsed.users)) setUsers(parsed.users);
      if (parsed.tables && Array.isArray(parsed.tables)) setTables(parsed.tables);
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
    setIngredients(INITIAL_INGREDIENTS);
    setStockLots(INITIAL_STOCK_LOTS);
    setWasteLogs(INITIAL_WASTE_LOGS);
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
        playKitchenChime,
        isOffline,
        forceOfflineMode,
        setForceOfflineMode,
        lastSyncedAt,
        pendingOfflineCount,
        syncOfflineQueue
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
