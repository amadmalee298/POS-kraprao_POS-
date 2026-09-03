import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  DocumentData
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order, Ingredient, Branch, StockAdjustmentLog, WasteLog, Expense, OtherIncome } from '../types';

export interface CentralBranchLiveStats {
  branchId: string;
  branchName: string;
  lastActiveAt: string;
  totalSalesToday: number;
  orderCountToday: number;
  lowStockCount: number;
  isOnline: boolean;
  lastSyncedOrderNo?: string;
  lastOrderAmount?: number;
}

export interface CentralBranchInventoryItem {
  ingredientId: string;
  name: string;
  currentStock: number;
  minStockAlert: number;
  unit: string;
  unitCost: number;
  category: string;
  lastUpdated: string;
}

// Initialize Firebase safely
let dbInstance: ReturnType<typeof getFirestore> | null = null;
let isInitialized = false;

try {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const cfg = firebaseConfig as any;
  // If named firestoreDatabaseId is provided in config, use it; otherwise fallback to default
  if (cfg.firestoreDatabaseId) {
    dbInstance = getFirestore(app, cfg.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
  isInitialized = true;
  console.log(`[Firebase Service] 🔥 Connected to Firebase Project: ${firebaseConfig.projectId} (DB: ${cfg.firestoreDatabaseId || 'default'})`);
} catch (err) {
  console.warn('[Firebase Service] ⚠️ Firebase initialization warning:', err);
}

export const isFirebaseAvailable = (): boolean => {
  return isInitialized && dbInstance !== null && navigator.onLine;
};

export const getDb = () => dbInstance;

/**
 * Register/Heartbeat a branch in central Firebase
 */
export async function syncBranchToFirestore(branch: Branch, additionalStats?: Partial<CentralBranchLiveStats>): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const branchRef = doc(dbInstance, 'branches', branch.id);
    const nowIso = new Date().toISOString();
    
    await setDoc(
      branchRef,
      {
        id: branch.id,
        name: branch.name,
        nameEn: branch.nameEn || '',
        address: branch.address || '',
        phone: branch.phone || '',
        taxId: branch.taxId || '',
        promptpayMobileOrTaxId: branch.promptpayMobileOrTaxId || '',
        isMainBranch: branch.isMainBranch || false,
        lastActiveAt: nowIso,
        isOnline: true,
        updatedAt: serverTimestamp(),
        ...(additionalStats || {})
      },
      { merge: true }
    );

    // Also update branch status heartbeat subdocument
    const statusRef = doc(dbInstance, 'branches', branch.id, 'status', 'sync');
    await setDoc(
      statusRef,
      {
        lastPingAt: nowIso,
        isOnline: true,
        clientVersion: 'Enterprise v1.2',
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync branch ${branch.id}:`, err);
    return false;
  }
}

/**
 * Push a single sales order to central Firebase
 */
export async function syncOrderToFirestore(order: Order, branch: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const orderDocId = order.id.startsWith('ord-') ? order.id : `ord-${order.id}`;
    const orderRef = doc(dbInstance, 'orders', orderDocId);
    const nowIso = new Date().toISOString();

    const orderPayload = {
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: branch.id,
      branchName: branch.name,
      orderType: order.orderType,
      tableNumber: order.tableNumber || '',
      itemsCount: order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
      items: order.items.map(item => ({
        cartItemId: item.cartItemId,
        menuItemId: item.menuItem.id,
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        spiceLevel: item.spiceLevel || null,
        proteinChoice: item.proteinChoice?.name || null,
        selectedAddOns: item.selectedAddOns?.map(a => a.name) || [],
        specialNotes: item.specialNotes || ''
      })),
      subtotal: order.subtotal,
      discountAmount: order.discountAmount || 0,
      vatAmount: order.vatAmount || 0,
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod,
      status: order.status,
      createdAt: order.createdAt,
      syncedAt: nowIso,
      isOfflineOrder: false,
      isSynced: true,
      updatedAt: serverTimestamp(),
      checksum: order.checksum || ''
    };

    await setDoc(orderRef, orderPayload, { merge: true });

    // Update branch live sales stats in central database
    const branchRef = doc(dbInstance, 'branches', branch.id);
    await setDoc(
      branchRef,
      {
        lastActiveAt: nowIso,
        lastSalesOrderAt: nowIso,
        lastSyncedOrderNo: order.orderNumber,
        lastOrderAmount: order.grandTotal,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] ☁️ Order ${order.orderNumber} pushed to Firebase Firestore successfully.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to push order ${order.orderNumber}:`, err);
    return false;
  }
}

/**
 * Batch push multiple un-synced offline orders to central Firebase
 */
export async function syncOrdersBatchToFirestore(orders: Order[], branch: Branch): Promise<{ success: number; failed: number }> {
  if (!dbInstance || !navigator.onLine || orders.length === 0) {
    return { success: 0, failed: orders.length };
  }

  let successCount = 0;
  let failedCount = 0;

  // Process in chunks of 450 (Firestore limit is 500 per batch)
  const chunkSize = 450;
  for (let i = 0; i < orders.length; i += chunkSize) {
    const chunk = orders.slice(i, i + chunkSize);
    const batch = writeBatch(dbInstance);
    const nowIso = new Date().toISOString();

    chunk.forEach(order => {
      const orderDocId = order.id.startsWith('ord-') ? order.id : `ord-${order.id}`;
      const orderRef = doc(dbInstance!, 'orders', orderDocId);

      const orderPayload = {
        id: order.id,
        orderNumber: order.orderNumber,
        branchId: branch.id,
        branchName: branch.name,
        orderType: order.orderType,
        tableNumber: order.tableNumber || '',
        itemsCount: order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
        items: order.items.map(item => ({
          cartItemId: item.cartItemId,
          menuItemId: item.menuItem.id,
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          spiceLevel: item.spiceLevel || null,
          proteinChoice: item.proteinChoice?.name || null,
          selectedAddOns: item.selectedAddOns?.map(a => a.name) || [],
          specialNotes: item.specialNotes || ''
        })),
        subtotal: order.subtotal,
        discountAmount: order.discountAmount || 0,
        vatAmount: order.vatAmount || 0,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
        status: order.status,
        createdAt: order.createdAt,
        syncedAt: nowIso,
        isOfflineOrder: false,
        isSynced: true,
        updatedAt: serverTimestamp(),
        checksum: order.checksum || ''
      };

      batch.set(orderRef, orderPayload, { merge: true });
    });

    try {
      await batch.commit();
      successCount += chunk.length;
      console.log(`[Firebase Service] ☁️ Batch committed ${chunk.length} orders to Firebase Firestore.`);
    } catch (err) {
      console.error('[Firebase Service] ❌ Failed to commit batch orders:', err);
      failedCount += chunk.length;
    }
  }

  // Update branch heartbeat
  if (successCount > 0) {
    await syncBranchToFirestore(branch, {
      lastActiveAt: new Date().toISOString()
    });
  }

  return { success: successCount, failed: failedCount };
}

/**
 * Push current branch inventory stock levels to central Firebase
 */
export async function syncInventoryToFirestore(ingredients: Ingredient[], branch: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine || ingredients.length === 0) return false;

  try {
    const batch = writeBatch(dbInstance);
    const nowIso = new Date().toISOString();
    let lowStockCount = 0;

    ingredients.forEach(ing => {
      if (ing.currentStock <= ing.minStockAlert) {
        lowStockCount++;
      }

      // Branch-specific inventory document
      const branchIngRef = doc(dbInstance!, 'branches', branch.id, 'inventory', ing.id);
      batch.set(
        branchIngRef,
        {
          ingredientId: ing.id,
          name: ing.name,
          currentStock: ing.currentStock,
          minStockAlert: ing.minStockAlert,
          unit: ing.unit,
          unitCost: ing.unitCost,
          category: ing.category,
          barcode: ing.barcode || '',
          branchId: branch.id,
          branchName: branch.name,
          isLowStock: ing.currentStock <= ing.minStockAlert,
          lastUpdated: nowIso,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      // Top-level global lookup document: /inventory/${branchId}_${ingredientId}
      const globalIngRef = doc(dbInstance!, 'inventory', `${branch.id}_${ing.id}`);
      batch.set(
        globalIngRef,
        {
          id: `${branch.id}_${ing.id}`,
          ingredientId: ing.id,
          name: ing.name,
          currentStock: ing.currentStock,
          minStockAlert: ing.minStockAlert,
          unit: ing.unit,
          unitCost: ing.unitCost,
          category: ing.category,
          branchId: branch.id,
          branchName: branch.name,
          isLowStock: ing.currentStock <= ing.minStockAlert,
          lastUpdated: nowIso,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });

    await batch.commit();

    // Update branch metadata with low-stock count
    const branchRef = doc(dbInstance, 'branches', branch.id);
    await setDoc(
      branchRef,
      {
        lowStockCount,
        lastInventorySyncAt: nowIso,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] 📦 Synchronized ${ingredients.length} inventory items for branch '${branch.name}' to Firebase Firestore.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync inventory for branch ${branch.id}:`, err);
    return false;
  }
}

/**
 * Push stock adjustment log to central Firebase
 */
export async function syncStockAdjustmentToFirestore(adjustment: StockAdjustmentLog, branch: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const adjRef = doc(dbInstance, 'stock_adjustments', adjustment.id);
    await setDoc(
      adjRef,
      {
        ...adjustment,
        branchId: branch.id,
        branchName: branch.name,
        syncedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to push stock adjustment:', err);
    return false;
  }
}

/**
 * Push waste log to central Firebase
 */
export async function syncWasteLogToFirestore(wasteLog: WasteLog, branch: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const wasteRef = doc(dbInstance, 'waste_logs', wasteLog.id);
    await setDoc(
      wasteRef,
      {
        ...wasteLog,
        branchId: branch.id,
        branchName: branch.name,
        syncedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to push waste log:', err);
    return false;
  }
}

/**
 * Real-time listener for central branches
 */
export function subscribeToCentralBranches(
  onUpdate: (branchesMap: Record<string, CentralBranchLiveStats>) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const branchesCol = collection(dbInstance, 'branches');
    const unsubscribe = onSnapshot(
      branchesCol,
      snapshot => {
        const result: Record<string, CentralBranchLiveStats> = {};
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          result[docSnap.id] = {
            branchId: docSnap.id,
            branchName: data.name || docSnap.id,
            lastActiveAt: data.lastActiveAt || new Date().toISOString(),
            totalSalesToday: data.totalSalesToday || 0,
            orderCountToday: data.orderCountToday || 0,
            lowStockCount: data.lowStockCount || 0,
            isOnline: data.isOnline !== false,
            lastSyncedOrderNo: data.lastSyncedOrderNo,
            lastOrderAmount: data.lastOrderAmount
          };
        });
        onUpdate(result);
      },
      err => {
        console.warn('[Firebase Service] ⚠️ Snapshot error on branches collection:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err: any) {
    console.error('[Firebase Service] ❌ Failed to subscribe to branches:', err);
    return () => {};
  }
}

/**
 * Real-time listener for recent central sales orders
 */
export function subscribeToRecentCentralOrders(
  limitCount: number = 50,
  onUpdate: (orders: Partial<Order>[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const ordersCol = collection(dbInstance, 'orders');
    const q = query(ordersCol, limit(limitCount));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const orderList: Partial<Order>[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          orderList.push({
            id: docSnap.id,
            orderNumber: data.orderNumber,
            branchId: data.branchId,
            orderType: data.orderType,
            tableNumber: data.tableNumber,
            subtotal: data.subtotal,
            discountAmount: data.discountAmount,
            vatAmount: data.vatAmount,
            grandTotal: data.grandTotal,
            paymentMethod: data.paymentMethod,
            status: data.status,
            createdAt: data.createdAt,
            syncedAt: data.syncedAt,
            isOfflineOrder: false,
            isSynced: true
          });
        });
        onUpdate(orderList);
      },
      err => {
        console.warn('[Firebase Service] ⚠️ Snapshot error on orders collection:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to subscribe to orders:', err);
    return () => {};
  }
}

/**
 * Push a single expense entry to central Firebase
 */
export async function syncExpenseToFirestore(expense: Expense, branch?: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const expenseDocId = expense.id.startsWith('exp-') ? expense.id : `exp-${expense.id}`;
    const expenseRef = doc(dbInstance, 'expenses', expenseDocId);
    const nowIso = new Date().toISOString();

    const payload = {
      id: expense.id,
      branchId: expense.branchId || branch?.id || '',
      category: expense.category,
      title: expense.title,
      amount: Number(expense.amount) || 0,
      includeVat: !!expense.includeVat,
      vatAmount: Number(expense.vatAmount) || 0,
      netAmount: Number(expense.netAmount) || 0,
      refNumber: expense.refNumber || '',
      note: expense.note || '',
      date: expense.date,
      receiptImage: expense.receiptImage || null,
      receiptImageName: expense.receiptImageName || null,
      syncedAt: nowIso,
      updatedAt: serverTimestamp()
    };

    await setDoc(expenseRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync expense ${expense.id}:`, err);
    return false;
  }
}

/**
 * Delete an expense entry from central Firebase
 */
export async function deleteExpenseFromFirestore(expenseId: string): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const expenseDocId = expenseId.startsWith('exp-') ? expenseId : `exp-${expenseId}`;
    const expenseRef = doc(dbInstance, 'expenses', expenseDocId);
    await deleteDoc(expenseRef);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete expense ${expenseId}:`, err);
    return false;
  }
}

/**
 * Batch push expenses to central Firebase
 */
export async function syncExpensesBatchToFirestore(expenses: Expense[], branch?: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine || expenses.length === 0) return false;

  try {
    const batch = writeBatch(dbInstance);
    const nowIso = new Date().toISOString();

    expenses.forEach(expense => {
      const expenseDocId = expense.id.startsWith('exp-') ? expense.id : `exp-${expense.id}`;
      const expenseRef = doc(dbInstance!, 'expenses', expenseDocId);
      batch.set(
        expenseRef,
        {
          id: expense.id,
          branchId: expense.branchId || branch?.id || '',
          category: expense.category,
          title: expense.title,
          amount: Number(expense.amount) || 0,
          includeVat: !!expense.includeVat,
          vatAmount: Number(expense.vatAmount) || 0,
          netAmount: Number(expense.netAmount) || 0,
          refNumber: expense.refNumber || '',
          note: expense.note || '',
          date: expense.date,
          receiptImage: expense.receiptImage || null,
          receiptImageName: expense.receiptImageName || null,
          syncedAt: nowIso,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to batch sync expenses:', err);
    return false;
  }
}

/**
 * Push a single other-income entry to central Firebase
 */
export async function syncIncomeToFirestore(income: OtherIncome, branch?: Branch): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const incomeDocId = income.id.startsWith('inc-') ? income.id : `inc-${income.id}`;
    const incomeRef = doc(dbInstance, 'incomes', incomeDocId);
    const nowIso = new Date().toISOString();

    const payload = {
      id: income.id,
      branchId: income.branchId || branch?.id || '',
      category: income.category,
      title: income.title,
      amount: Number(income.amount) || 0,
      date: income.date,
      paymentMethod: income.paymentMethod || 'promptpay',
      payerName: income.payerName || '',
      refNumber: income.refNumber || '',
      note: income.note || '',
      slipImage: income.slipImage || null,
      slipImageName: income.slipImageName || null,
      syncedAt: nowIso,
      updatedAt: serverTimestamp()
    };

    await setDoc(incomeRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync income ${income.id}:`, err);
    return false;
  }
}

/**
 * Delete an income entry from central Firebase
 */
export async function deleteIncomeFromFirestore(incomeId: string): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const incomeDocId = incomeId.startsWith('inc-') ? incomeId : `inc-${incomeId}`;
    const incomeRef = doc(dbInstance, 'incomes', incomeDocId);
    await deleteDoc(incomeRef);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete income ${incomeId}:`, err);
    return false;
  }
}

/**
 * Real-time listener for central expenses
 */
export function subscribeToCentralExpenses(
  limitCount: number = 100,
  onUpdate: (expenses: Expense[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const colRef = collection(dbInstance, 'expenses');
    const q = query(colRef, limit(limitCount));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const list: Expense[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          list.push({
            id: d.id || docSnap.id,
            branchId: d.branchId || '',
            date: d.date || '',
            category: d.category || 'other',
            title: d.title || '',
            amount: Number(d.amount) || 0,
            includeVat: !!d.includeVat,
            vatAmount: Number(d.vatAmount) || 0,
            netAmount: Number(d.netAmount) || Number(d.amount) || 0,
            refNumber: d.refNumber || '',
            note: d.note || '',
            receiptImage: d.receiptImage || undefined,
            receiptImageName: d.receiptImageName || undefined
          });
        });
        onUpdate(list);
      },
      err => {
        console.warn('[Firebase Service] ⚠️ Snapshot error on expenses:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to subscribe to expenses:', err);
    return () => {};
  }
}

/**
 * Real-time listener for central incomes
 */
export function subscribeToCentralIncomes(
  limitCount: number = 100,
  onUpdate: (incomes: OtherIncome[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const colRef = collection(dbInstance, 'incomes');
    const q = query(colRef, limit(limitCount));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const list: OtherIncome[] = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          list.push({
            id: d.id || docSnap.id,
            branchId: d.branchId || '',
            date: d.date || '',
            category: d.category || 'other',
            title: d.title || '',
            amount: Number(d.amount) || 0,
            paymentMethod: d.paymentMethod || 'promptpay',
            payerName: d.payerName || '',
            refNumber: d.refNumber || '',
            note: d.note || '',
            slipImage: d.slipImage || undefined,
            slipImageName: d.slipImageName || undefined,
            createdAt: d.syncedAt || d.createdAt || undefined
          });
        });
        onUpdate(list);
      },
      err => {
        console.warn('[Firebase Service] ⚠️ Snapshot error on incomes:', err);
        if (onError) onError(err);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to subscribe to incomes:', err);
    return () => {};
  }
}

