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
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  DocumentData
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order, OrderStatus, CartItem, Ingredient, Branch, StockAdjustmentLog, WasteLog, Expense, OtherIncome, MenuItem, CategoryItem, AddOnOption, SystemSettings } from '../types';

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
 * Deep sanitization utility for Firestore payloads
 * Strips unsupported `undefined` properties to prevent Firestore write crashes
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as any;
  if (data instanceof Date) return data.toISOString() as any;
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as any;
  }
  if (typeof data === 'object') {
    // Preserve FieldValue (serverTimestamp, deleteField, etc.) or Timestamp
    if ((data as any)?._methodName || typeof (data as any)?.toMillis === 'function') {
      return data;
    }
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as any;
  }
  return data;
}

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

    const orderPayload = cleanForFirestore({
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: branch.id,
      branchName: branch.name,
      orderType: order.orderType,
      tableNumber: order.tableNumber || '',
      itemsCount: order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
      items: order.items.map(item => ({
        cartItemId: item.cartItemId,
        menuItemId: item.menuItem?.id || '',
        name: item.menuItem?.name || '',
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
      discountType: order.discountType || 'fixed',
      discountNote: order.discountNote || '',
      vatAmount: order.vatAmount || 0,
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod,
      tenderedAmount: order.tenderedAmount ?? order.grandTotal,
      changeAmount: order.changeAmount ?? 0,
      status: order.status,
      createdAt: order.createdAt,
      completedAt: order.completedAt || (order.status === 'served' ? (order.updatedAt || nowIso) : null),
      customerTaxInfo: order.customerTaxInfo || null,
      customerName: order.customerTaxInfo?.companyName || '',
      customerPhone: order.customerTaxInfo?.phone || '',
      isFullTaxInvoiceRequested: Boolean(order.isFullTaxInvoiceRequested),
      isQrOrder: Boolean(order.isQrOrder),
      orderSource: order.orderSource || (order.isQrOrder ? 'qr' : 'pos'),
      cancelledBy: order.cancelledBy || null,
      cancelReason: order.cancelReason || null,
      cancelNote: order.cancelNote || null,
      syncedAt: nowIso,
      isOfflineOrder: false,
      isSynced: true,
      updatedAt: serverTimestamp(),
      checksum: order.checksum || ''
    });

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

      const orderPayload = cleanForFirestore({
        id: order.id,
        orderNumber: order.orderNumber,
        branchId: branch.id,
        branchName: branch.name,
        orderType: order.orderType,
        tableNumber: order.tableNumber || '',
        itemsCount: order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
        items: order.items.map(item => ({
          cartItemId: item.cartItemId,
          menuItemId: item.menuItem?.id || '',
          name: item.menuItem?.name || '',
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
        discountType: order.discountType || 'fixed',
        discountNote: order.discountNote || '',
        vatAmount: order.vatAmount || 0,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
        tenderedAmount: order.tenderedAmount ?? order.grandTotal,
        changeAmount: order.changeAmount ?? 0,
        status: order.status,
        createdAt: order.createdAt,
        completedAt: order.completedAt || (order.status === 'served' ? (order.updatedAt || nowIso) : null),
        customerTaxInfo: order.customerTaxInfo || null,
        customerName: order.customerTaxInfo?.companyName || '',
        customerPhone: order.customerTaxInfo?.phone || '',
        isFullTaxInvoiceRequested: Boolean(order.isFullTaxInvoiceRequested),
        isQrOrder: Boolean(order.isQrOrder),
        orderSource: order.orderSource || (order.isQrOrder ? 'qr' : 'pos'),
        cancelledBy: order.cancelledBy || null,
        cancelReason: order.cancelReason || null,
        cancelNote: order.cancelNote || null,
        syncedAt: nowIso,
        isOfflineOrder: false,
        isSynced: true,
        updatedAt: serverTimestamp(),
        checksum: order.checksum || ''
      });

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
export async function syncInventoryToFirestore(
  ingredients: Ingredient[],
  branch: Branch,
  options?: { purgeDeleted?: boolean }
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine || ingredients.length === 0) return false;

  try {
    const batch = writeBatch(dbInstance);
    const nowIso = new Date().toISOString();
    let lowStockCount = 0;

    // If purgeDeleted is not disabled, remove deleted/orphan ingredients from Firestore
    if (options?.purgeDeleted !== false) {
      try {
        const activeIds = new Set(ingredients.map(i => i.id));
        const existingSnap = await getDocs(collection(dbInstance, 'branches', branch.id, 'inventory'));
        existingSnap.forEach(d => {
          if (!activeIds.has(d.id)) {
            batch.delete(d.ref);
            batch.delete(doc(dbInstance!, 'inventory', `${branch.id}_${d.id}`));
          }
        });
      } catch (purgeErr) {
        console.warn('[Firebase Service] Note during inventory purge check:', purgeErr);
      }
    }

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
 * Helper to safely convert Firestore order document into a fully-hydrated Order
 */
export function docToOrder(docId: string, data: any): Order {
  const items: CartItem[] = Array.isArray(data.items)
    ? data.items.map((it: any, idx: number) => {
        if (it.menuItem && it.cartItemId) {
          return it as CartItem;
        }
        return {
          cartItemId: it.cartItemId || `ci-${docId}-${idx}`,
          menuItem: {
            id: it.menuItemId || it.id || `item-${idx}`,
            name: it.name || 'เมนูอาหาร',
            nameEn: it.nameEn || '',
            category: it.category || 'kaprao',
            price: Number(it.unitPrice) || Number(it.price) || 0,
            costPrice: Number(it.costPrice) || (Number(it.unitPrice || it.price || 0) * 0.35),
            description: it.description || '',
            image: it.image || '',
            recipe: []
          },
          quantity: Number(it.quantity) || 1,
          spiceLevel: it.spiceLevel || undefined,
          proteinChoice: it.proteinChoice ? { name: it.proteinChoice, extraPrice: 0 } : undefined,
          selectedAddOns: Array.isArray(it.selectedAddOns)
            ? it.selectedAddOns.map((a: any, aIdx: number) =>
                typeof a === 'string' ? { id: `addon-${aIdx}`, name: a, price: 0 } : a
              )
            : [],
          specialNotes: it.specialNotes || '',
          unitPrice: Number(it.unitPrice) || Number(it.price) || 0,
          totalPrice: Number(it.totalPrice) || ((Number(it.unitPrice) || 0) * (Number(it.quantity) || 1))
        };
      })
    : [];

  const grandTotal = Number(data.grandTotal) || 0;
  const subtotal = Number(data.subtotal) || grandTotal;

  return {
    id: data.id || docId,
    orderNumber: data.orderNumber || `#${docId.slice(-6).toUpperCase()}`,
    branchId: data.branchId || 'main-branch',
    orderType: data.orderType || 'dine-in',
    tableNumber: data.tableNumber || undefined,
    items,
    subtotal,
    discountAmount: Number(data.discountAmount) || 0,
    discountType: data.discountType || 'fixed',
    discountNote: data.discountNote || '',
    vatAmount: Number(data.vatAmount) || 0,
    grandTotal,
    paymentMethod: data.paymentMethod || 'cash',
    tenderedAmount: Number(data.tenderedAmount) || grandTotal,
    changeAmount: Number(data.changeAmount) || 0,
    status: data.status || 'pending',
    createdAt: data.createdAt || (data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : new Date().toISOString()),
    updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : (data.updatedAt || data.createdAt || new Date().toISOString()),
    completedAt: data.completedAt,
    customerTaxInfo: data.customerTaxInfo,
    isFullTaxInvoiceRequested: Boolean(data.isFullTaxInvoiceRequested),
    isOfflineOrder: false,
    isSynced: true,
    syncedAt: data.syncedAt || new Date().toISOString(),
    checksum: data.checksum || '',
    cancelledBy: data.cancelledBy,
    cancelReason: data.cancelReason,
    cancelNote: data.cancelNote,
    isQrOrder: Boolean(data.isQrOrder),
    orderSource: data.orderSource || 'pos'
  };
}

/**
 * Real-time listener for recent central sales orders
 */
export function subscribeToRecentCentralOrders(
  limitCount: number = 300,
  onUpdate: (orders: Order[], removedIds?: string[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const ordersCol = collection(dbInstance, 'orders');
    const q = query(ordersCol, limit(limitCount));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const orderList: Order[] = [];
        const removedIds: string[] = [];

        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            const rawId = change.doc.id;
            const cleanId = rawId.startsWith('ord-') ? rawId.replace('ord-', '') : rawId;
            removedIds.push(rawId);
            removedIds.push(cleanId);
          }
        });

        snapshot.forEach(docSnap => {
          orderList.push(docToOrder(docSnap.id, docSnap.data()));
        });
        orderList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        onUpdate(orderList, removedIds);
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
 * Manually fetch recent sales orders from Firestore
 */
export async function fetchCentralOrdersFromFirestore(limitCount: number = 500): Promise<Order[]> {
  if (!dbInstance || !navigator.onLine) return [];
  try {
    const ordersCol = collection(dbInstance, 'orders');
    const q = query(ordersCol, limit(limitCount));
    const snap = await getDocs(q);
    const list: Order[] = [];
    snap.forEach(docSnap => {
      list.push(docToOrder(docSnap.id, docSnap.data()));
    });
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to fetch orders from Firestore:', err);
    return [];
  }
}

export const fetchRecentOrdersFromFirestore = fetchCentralOrdersFromFirestore;

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
    // Fallback: If document size exceeds Firestore limit (1MB) due to receiptImage, retry without image so financial log is never lost
    try {
      if (expense.receiptImage) {
        const expenseDocId = expense.id.startsWith('exp-') ? expense.id : `exp-${expense.id}`;
        const expenseRef = doc(dbInstance, 'expenses', expenseDocId);
        await setDoc(
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
            receiptImage: null,
            receiptImageName: expense.receiptImageName || null,
            syncedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        console.log(`[Firebase Service] ✅ Rescued expense ${expense.id} without heavy image.`);
        return true;
      }
    } catch (rescueErr) {
      console.error(`[Firebase Service] ❌ Failed fallback sync for expense:`, rescueErr);
    }
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
      // Ensure image doesn't blow up the 10MB batch limit
      const safeImage = expense.receiptImage && expense.receiptImage.length < 150000 ? expense.receiptImage : null;
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
          receiptImage: safeImage,
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
      slipImage: (income.slipImage && income.slipImage.length < 250000) ? income.slipImage : null,
      slipImageName: income.slipImageName || null,
      syncedAt: nowIso,
      updatedAt: serverTimestamp()
    };

    await setDoc(incomeRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync income ${income.id}:`, err);
    // Fallback: Retry without slipImage if too large
    try {
      if (income.slipImage) {
        const incomeDocId = income.id.startsWith('inc-') ? income.id : `inc-${income.id}`;
        const incomeRef = doc(dbInstance, 'incomes', incomeDocId);
        await setDoc(
          incomeRef,
          {
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
            slipImage: null,
            slipImageName: income.slipImageName || null,
            syncedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
        console.log(`[Firebase Service] ✅ Rescued income ${income.id} without heavy image.`);
        return true;
      }
    } catch (rescueErr) {
      console.error(`[Firebase Service] ❌ Failed fallback sync for income:`, rescueErr);
    }
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
  onUpdate: (expenses: Expense[], removedIds?: string[]) => void,
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
        const removedIds: string[] = [];

        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            const rawId = change.doc.id;
            const cleanId = rawId.startsWith('exp-') ? rawId.replace('exp-', '') : rawId;
            removedIds.push(rawId);
            removedIds.push(cleanId);
          }
        });

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
        onUpdate(list, removedIds);
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
  onUpdate: (incomes: OtherIncome[], removedIds?: string[]) => void,
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
        const removedIds: string[] = [];

        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            const rawId = change.doc.id;
            const cleanId = rawId.startsWith('inc-') ? rawId.replace('inc-', '') : rawId;
            removedIds.push(rawId);
            removedIds.push(cleanId);
          }
        });

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
        onUpdate(list, removedIds);
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

/**
 * Fetch inventory items for a branch from Firestore
 */
export async function fetchBranchInventoryFromFirestore(branchId: string = 'branch-1786349847821'): Promise<Ingredient[]> {
  if (!dbInstance) return [];

  try {
    const list: Ingredient[] = [];
    const seenIds = new Set<string>();

    // 1. Try branch-specific sub-collection: /branches/{branchId}/inventory
    try {
      const branchCol = collection(dbInstance, 'branches', branchId, 'inventory');
      const snap = await getDocs(branchCol);
      snap.forEach(d => {
        const data = d.data();
        const ingId = data.ingredientId || d.id;
        if (!seenIds.has(ingId)) {
          seenIds.add(ingId);
          list.push({
            id: ingId,
            name: data.name || 'วัตถุดิบ',
            unit: data.unit || 'g',
            currentStock: typeof data.currentStock === 'number' ? Number(data.currentStock.toFixed(3)) : 0,
            minStockAlert: typeof data.minStockAlert === 'number' ? data.minStockAlert : 0.01,
            unitCost: typeof data.unitCost === 'number' ? data.unitCost : 0,
            category: data.category || 'meat',
            barcode: data.barcode || ''
          });
        }
      });
    } catch (subErr) {
      console.warn(`[Firebase Service] Sub-collection fetch failed for ${branchId}:`, subErr);
    }

    // 2. If needed, also check global /inventory collection for any items belonging to this branch or all items
    if (list.length === 0) {
      try {
        const globalCol = collection(dbInstance, 'inventory');
        const snap = await getDocs(globalCol);
        snap.forEach(d => {
          const data = d.data();
          if (data.branchId && data.branchId !== branchId) return;
          const ingId = data.ingredientId || d.id.replace(`${branchId}_`, '');
          if (!seenIds.has(ingId)) {
            seenIds.add(ingId);
            list.push({
              id: ingId,
              name: data.name || 'วัตถุดิบ',
              unit: data.unit || 'g',
              currentStock: typeof data.currentStock === 'number' ? Number(data.currentStock.toFixed(3)) : 0,
              minStockAlert: typeof data.minStockAlert === 'number' ? data.minStockAlert : 0.01,
              unitCost: typeof data.unitCost === 'number' ? data.unitCost : 0,
              category: data.category || 'meat',
              barcode: data.barcode || ''
            });
          }
        });
      } catch (globalErr) {
        console.warn('[Firebase Service] Global inventory fetch failed:', globalErr);
      }
    }

    console.log(`[Firebase Service] 📦 Fetched ${list.length} ingredients from Firestore for branch ${branchId}`);
    return list;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to fetch inventory from Firestore:', err);
    return [];
  }
}

/**
 * Sync a single ingredient change to Firestore
 */
export async function syncIngredientToFirestore(
  ingredient: Ingredient,
  branchId: string = 'branch-1786349847821',
  branchName: string = 'ครัวกะเพรา ตลาด กกท'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const nowIso = new Date().toISOString();
    const payload = {
      ingredientId: ingredient.id,
      id: ingredient.id,
      name: ingredient.name,
      currentStock: ingredient.currentStock,
      minStockAlert: ingredient.minStockAlert,
      unit: ingredient.unit,
      unitCost: ingredient.unitCost,
      category: ingredient.category,
      barcode: ingredient.barcode || '',
      branchId,
      branchName,
      isLowStock: ingredient.currentStock <= ingredient.minStockAlert,
      lastUpdated: nowIso,
      updatedAt: serverTimestamp()
    };

    // Save to branch-specific subcollection
    const branchDocRef = doc(dbInstance, 'branches', branchId, 'inventory', ingredient.id);
    await setDoc(branchDocRef, payload, { merge: true });

    // Save to global lookup collection
    const globalDocRef = doc(dbInstance, 'inventory', `${branchId}_${ingredient.id}`);
    await setDoc(globalDocRef, payload, { merge: true });

    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync ingredient ${ingredient.id}:`, err);
    return false;
  }
}

/**
 * Delete an ingredient from Firestore (deletes from branch inventory, global inventory, and records tombstone)
 */
export async function deleteIngredientFromFirestore(
  ingredientId: string,
  branchId: string = 'branch-1786349847821',
  ingredientName?: string
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const branchDocRef = doc(dbInstance, 'branches', branchId, 'inventory', ingredientId);
    await deleteDoc(branchDocRef);

    const globalPrefixedRef = doc(dbInstance, 'inventory', `${branchId}_${ingredientId}`);
    await deleteDoc(globalPrefixedRef);

    const globalPlainRef = doc(dbInstance, 'inventory', ingredientId);
    await deleteDoc(globalPlainRef).catch(() => {});

    // Delete any duplicate document by name in branch inventory or global inventory
    if (ingredientName && ingredientName.trim()) {
      try {
        const qBranch = query(collection(dbInstance, 'branches', branchId, 'inventory'), where('name', '==', ingredientName.trim()));
        const snapBranch = await getDocs(qBranch);
        if (!snapBranch.empty) {
          const batch = writeBatch(dbInstance);
          snapBranch.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        const qGlobal = query(collection(dbInstance, 'inventory'), where('name', '==', ingredientName.trim()));
        const snapGlobal = await getDocs(qGlobal);
        if (!snapGlobal.empty) {
          const batch2 = writeBatch(dbInstance);
          snapGlobal.forEach(d => batch2.delete(d.ref));
          await batch2.commit();
        }
      } catch (cleanErr) {
        console.warn(`[Firebase Service] Note on duplicate cleanup for "${ingredientName}":`, cleanErr);
      }
    }

    // Record tombstone in deleted_records so all branches and real-time listeners honor the deletion
    const tombstoneRef = doc(dbInstance, 'deleted_records', `ing_${branchId}_${ingredientId}`);
    await setDoc(
      tombstoneRef,
      {
        type: 'ingredient',
        recordId: ingredientId,
        branchId,
        name: ingredientName || '',
        deletedAt: serverTimestamp(),
        deletedAtIso: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] 🗑️ Successfully deleted ingredient ${ingredientId} ("${ingredientName || ''}") from Firestore.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete ingredient ${ingredientId}:`, err);
    return false;
  }
}

/**
 * Delete a sales order from Firestore
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const orderDocId = orderId.startsWith('ord-') ? orderId : `ord-${orderId}`;
    const orderRef = doc(dbInstance, 'orders', orderDocId);
    await deleteDoc(orderRef);

    // Also record tombstone
    const tombstoneRef = doc(dbInstance, 'deleted_records', `order_${orderDocId}`);
    await setDoc(
      tombstoneRef,
      {
        type: 'order',
        recordId: orderId,
        deletedAt: serverTimestamp(),
        deletedAtIso: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] 🗑️ Successfully deleted order ${orderDocId} from Firestore.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete order ${orderId}:`, err);
    return false;
  }
}

/**
 * Fetch all custom menu items from Firestore
 */
export async function fetchMenuItemsFromFirestore(): Promise<MenuItem[]> {
  if (!dbInstance) return [];

  try {
    const colRef = collection(dbInstance, 'menu_items');
    const snap = await getDocs(colRef);
    const list: MenuItem[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        name: data.name || '',
        nameEn: data.nameEn || '',
        category: data.category || 'kaprao',
        price: Number(data.price) || 0,
        costPrice: Number(data.costPrice) || 0,
        description: data.description || '',
        image: data.image || '',
        isPopular: !!data.isPopular,
        recipe: Array.isArray(data.recipe) ? data.recipe : [],
        availableSpiceLevels: Array.isArray(data.availableSpiceLevels) ? data.availableSpiceLevels : undefined,
        availableProteins: Array.isArray(data.availableProteins) ? data.availableProteins : undefined,
        allowAddOns: data.allowAddOns !== undefined ? data.allowAddOns : true,
        allowedAddOnIds: Array.isArray(data.allowedAddOnIds) ? data.allowedAddOnIds : undefined
      });
    });

    console.log(`[Firebase Service] 🍽️ Fetched ${list.length} menu items from Firestore.`);
    return list;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to fetch menu items from Firestore:', err);
    return [];
  }
}

/**
 * Sync a single menu item to Firestore
 */
export async function syncSingleMenuItemToFirestore(item: MenuItem): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'menu_items', item.id);
    const payload = cleanForFirestore({
      ...item,
      updatedAt: serverTimestamp()
    });
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to sync menu item ${item.id}:`, err);
    return false;
  }
}

/**
 * Batch sync all menu items to Firestore
 */
export async function syncMenuItemsBatchToFirestore(items: MenuItem[]): Promise<boolean> {
  if (!dbInstance || !navigator.onLine || items.length === 0) return false;

  try {
    const batch = writeBatch(dbInstance);
    items.forEach(item => {
      const ref = doc(dbInstance!, 'menu_items', item.id);
      const payload = cleanForFirestore({
        ...item,
        updatedAt: serverTimestamp()
      });
      batch.set(ref, payload, { merge: true });
    });
    await batch.commit();
    console.log(`[Firebase Service] 🍽️ Committed ${items.length} menu items to Firestore.`);
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to batch sync menu items:', err);
    return false;
  }
}

/**
 * Update order status and completion/cancellation details directly in Firestore
 */
export async function updateOrderStatusInFirestore(
  orderId: string,
  status: OrderStatus,
  extra?: {
    completedAt?: string;
    cancelledBy?: { userId?: string; userName: string; role: string; cancelledAt?: string };
    cancelReason?: string;
    cancelNote?: string;
  }
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const primaryDocId = orderId.startsWith('ord-') ? orderId : `ord-${orderId}`;
    const rawDocId = orderId.replace(/^ord-/, '');
    const nowIso = new Date().toISOString();

    const updatePayload: Record<string, any> = cleanForFirestore({
      status,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      isSynced: true,
      ...(status === 'served' ? { completedAt: extra?.completedAt || nowIso } : {}),
      ...(status === 'cancelled' ? {
        cancelledBy: extra?.cancelledBy,
        cancelReason: extra?.cancelReason,
        cancelNote: extra?.cancelNote
      } : {})
    });

    // Write to primaryDocId (ord-...)
    const primaryRef = doc(dbInstance, 'orders', primaryDocId);
    await setDoc(primaryRef, updatePayload, { merge: true });

    // Also update rawDocId if distinct, ensuring any legacy document without ord- prefix is kept in sync
    if (rawDocId && rawDocId !== primaryDocId) {
      try {
        const rawRef = doc(dbInstance, 'orders', rawDocId);
        await setDoc(rawRef, updatePayload, { merge: true });
      } catch {
        // Silently ignore secondary doc update
      }
    }

    console.log(`[Firebase Service] ☁️ Order ${orderId} (${primaryDocId}) status successfully updated to '${status}' in Firestore.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to update status for order ${orderId} in Firestore:`, err);
    return false;
  }
}

/**
 * Delete a menu item from Firestore (with deletion of duplicate documents and tombstone recording)
 */
export async function deleteMenuItemFromFirestore(itemId: string, itemName?: string): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'menu_items', itemId);
    await deleteDoc(docRef);

    // Also delete any document with matching name or ID in menu_items collection to remove duplicates
    if (itemName && itemName.trim()) {
      try {
        const q = query(collection(dbInstance, 'menu_items'), where('name', '==', itemName.trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(dbInstance);
          snap.forEach(d => {
            batch.delete(d.ref);
          });
          await batch.commit();
          console.log(`[Firebase Service] 🗑️ Deleted ${snap.size} Firestore menu doc(s) matching name "${itemName.trim()}".`);
        }
      } catch (subErr) {
        console.warn(`[Firebase Service] Note on name-based deletion for "${itemName}":`, subErr);
      }
    }

    // Record tombstone in deleted_records
    const tombstoneRef = doc(dbInstance, 'deleted_records', `menu_${itemId}`);
    await setDoc(
      tombstoneRef,
      {
        type: 'menu_item',
        recordId: itemId,
        name: itemName || '',
        deletedAt: serverTimestamp(),
        deletedAtIso: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] 🗑️ Successfully deleted menu item ${itemId} from Firestore.`);
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete menu item ${itemId}:`, err);
    return false;
  }
}

/**
 * Delete an add-on option from Firestore
 */
export async function deleteAddOnFromFirestore(
  addonId: string,
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'addons');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const currentList: AddOnOption[] = data.addOns || [];
      const updatedList = currentList.filter(a => a.id !== addonId);
      await setDoc(docRef, cleanForFirestore({ addOns: updatedList, updatedAt: serverTimestamp() }), { merge: true });
    }
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete add-on ${addonId}:`, err);
    return false;
  }
}

/**
 * Fetch branches from Firestore
 */
export async function fetchBranchesFromFirestore(): Promise<Branch[]> {
  if (!dbInstance) return [];

  try {
    const colRef = collection(dbInstance, 'branches');
    const snap = await getDocs(colRef);
    const list: Branch[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        name: data.name || '',
        nameEn: data.nameEn || '',
        address: data.address || '',
        phone: data.phone || '',
        taxId: data.taxId || '',
        promptpayMobileOrTaxId: data.promptpayMobileOrTaxId || '',
        isMainBranch: !!data.isMainBranch
      });
    });

    console.log(`[Firebase Service] 🏢 Fetched ${list.length} branches from Firestore.`);
    return list;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to fetch branches from Firestore:', err);
    return [];
  }
}

/**
 * Sync Categories to Firestore
 */
export async function syncCategoriesToFirestore(
  categories: CategoryItem[],
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'categories');
    await setDoc(
      docRef,
      {
        categories,
        updatedAt: serverTimestamp(),
        lastUpdatedIso: new Date().toISOString()
      },
      { merge: true }
    );

    // Also persist in global categories collection doc for central access
    const globalCatRef = doc(dbInstance, 'categories', 'active_list');
    await setDoc(
      globalCatRef,
      {
        categories,
        updatedAt: serverTimestamp(),
        lastUpdatedIso: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`[Firebase Service] 🏷️ Synced ${categories.length} categories to Firestore.`);
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to sync categories to Firestore:', err);
    return false;
  }
}

/**
 * Delete a category from Firestore
 */
export async function deleteCategoryFromFirestore(
  categoryId: string,
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'categories');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const currentList: CategoryItem[] = data.categories || [];
      const updatedList = currentList.filter(c => c.id !== categoryId);
      await setDoc(docRef, { categories: updatedList, updatedAt: serverTimestamp() }, { merge: true });
    }
    return true;
  } catch (err) {
    console.error(`[Firebase Service] ❌ Failed to delete category ${categoryId}:`, err);
    return false;
  }
}

/**
 * Fetch Categories from Firestore
 */
export async function fetchCategoriesFromFirestore(
  branchId: string = 'branch-1786349847821'
): Promise<CategoryItem[] | null> {
  if (!dbInstance) return null;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'categories');
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().categories) {
      return snap.data().categories as CategoryItem[];
    }
    const globalSnap = await getDoc(doc(dbInstance, 'categories', 'active_list'));
    if (globalSnap.exists() && globalSnap.data().categories) {
      return globalSnap.data().categories as CategoryItem[];
    }
    return null;
  } catch (err) {
    console.warn('[Firebase Service] Could not fetch categories from Firestore:', err);
    return null;
  }
}

/**
 * Sync Tables list to Firestore
 */
export async function syncTablesToFirestore(
  tables: string[],
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'tables');
    await setDoc(
      docRef,
      {
        tables,
        updatedAt: serverTimestamp(),
        lastUpdatedIso: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to sync tables to Firestore:', err);
    return false;
  }
}

/**
 * Sync Add-on Options to Firestore
 */
export async function syncAddOnsToFirestore(
  addOns: AddOnOption[],
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'addons');
    await setDoc(
      docRef,
      {
        addOns,
        updatedAt: serverTimestamp(),
        lastUpdatedIso: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to sync add-ons to Firestore:', err);
    return false;
  }
}

/**
 * Sync System Settings to Firestore
 */
export async function syncSettingsToFirestore(
  settings: SystemSettings,
  branchId: string = 'branch-1786349847821'
): Promise<boolean> {
  if (!dbInstance || !navigator.onLine) return false;

  try {
    // Sanitize pins before uploading
    const { adminPin, managerPin, ...safeSettings } = settings;
    const docRef = doc(dbInstance, 'branches', branchId, 'config', 'settings');
    await setDoc(
      docRef,
      {
        ...safeSettings,
        updatedAt: serverTimestamp(),
        lastUpdatedIso: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to sync settings to Firestore:', err);
    return false;
  }
}

/**
 * Purge Outdated or Deleted Documents from Firestore Cloud
 * Deletes any menu items and inventory documents that were removed locally.
 */
export async function purgeOutdatedCloudData(
  branchId: string,
  activeMenuIds: string[],
  activeIngredientIds: string[],
  deletedMenuIds: string[] = [],
  deletedIngredientIds: string[] = []
): Promise<{ menuDeleted: number; inventoryDeleted: number }> {
  if (!dbInstance || !navigator.onLine) return { menuDeleted: 0, inventoryDeleted: 0 };

  let menuDeleted = 0;
  let inventoryDeleted = 0;

  try {
    // 1. Purge Deleted / Orphan Menu Items from /menu_items
    const menuColRef = collection(dbInstance, 'menu_items');
    const menuSnap = await getDocs(menuColRef);
    const activeMenuSet = new Set(activeMenuIds.map(id => String(id).trim().toLowerCase()));
    const deletedMenuSet = new Set(deletedMenuIds.map(id => String(id).trim().toLowerCase()));

    const menuBatch = writeBatch(dbInstance);
    let menuBatchCount = 0;

    menuSnap.forEach(d => {
      const docIdLower = d.id.trim().toLowerCase();
      const docName = String(d.data().name || '').trim().toLowerCase();
      const shouldDelete =
        deletedMenuSet.has(docIdLower) ||
        deletedMenuSet.has(docName) ||
        (!activeMenuSet.has(docIdLower) && activeMenuSet.size > 0);

      if (shouldDelete) {
        menuBatch.delete(d.ref);
        menuDeleted++;
        menuBatchCount++;
      }
    });

    if (menuBatchCount > 0) {
      await menuBatch.commit();
      console.log(`[Firebase Service] 🧹 Purged ${menuBatchCount} obsolete menu doc(s) from Firestore.`);
    }

    // 2. Purge Deleted / Orphan Ingredients from branches/{branchId}/inventory AND /inventory
    const branchInvColRef = collection(dbInstance, 'branches', branchId, 'inventory');
    const invSnap = await getDocs(branchInvColRef);
    const activeIngSet = new Set(activeIngredientIds.map(id => String(id).trim().toLowerCase()));
    const deletedIngSet = new Set(deletedIngredientIds.map(id => String(id).trim().toLowerCase()));

    const invBatch = writeBatch(dbInstance);
    let invBatchCount = 0;

    invSnap.forEach(d => {
      const docIdLower = d.id.trim().toLowerCase();
      const docName = String(d.data().name || '').trim().toLowerCase();
      const shouldDelete =
        deletedIngSet.has(docIdLower) ||
        deletedIngSet.has(docName) ||
        (!activeIngSet.has(docIdLower) && activeIngSet.size > 0);

      if (shouldDelete) {
        invBatch.delete(d.ref);
        invBatch.delete(doc(dbInstance!, 'inventory', `${branchId}_${d.id}`));
        inventoryDeleted++;
        invBatchCount++;
      }
    });

    // Also scan top-level /inventory to prune any orphaned or duplicate documents
    try {
      const globalInvColRef = collection(dbInstance, 'inventory');
      const globalInvSnap = await getDocs(globalInvColRef);
      globalInvSnap.forEach(d => {
        const rawId = d.id.trim().toLowerCase();
        const ingIdPart = rawId.startsWith(`${branchId.toLowerCase()}_`)
          ? rawId.replace(`${branchId.toLowerCase()}_`, '')
          : rawId;
        const docName = String(d.data().name || '').trim().toLowerCase();

        const isBranchDoc = rawId.startsWith(`${branchId.toLowerCase()}_`);
        const shouldDeleteGlobal =
          (isBranchDoc && !activeIngSet.has(ingIdPart) && activeIngSet.size > 0) ||
          deletedIngSet.has(ingIdPart) ||
          deletedIngSet.has(docName);

        if (shouldDeleteGlobal) {
          invBatch.delete(d.ref);
          invBatchCount++;
          inventoryDeleted++;
        }
      });
    } catch (globalPurgeErr) {
      console.warn('[Firebase Service] Note on global inventory purge scan:', globalPurgeErr);
    }

    if (invBatchCount > 0) {
      await invBatch.commit();
      console.log(`[Firebase Service] 🧹 Purged ${invBatchCount} obsolete inventory doc(s) from Firestore.`);
    }

    return { menuDeleted, inventoryDeleted };
  } catch (err) {
    console.error('[Firebase Service] ❌ Error during cloud data purge:', err);
    return { menuDeleted, inventoryDeleted };
  }
}

export interface SyncFullCatalogParams {
  menuItems: MenuItem[];
  deletedMenuItemIds: string[];
  ingredients: Ingredient[];
  deletedIngredientIds?: string[];
  categories: CategoryItem[];
  tables: string[];
  addOns?: AddOnOption[];
  branch: Branch;
  settings?: SystemSettings;
  orders?: Order[];
  purgeOrphanCloudData?: boolean;
}

export interface SyncFullCatalogResult {
  success: boolean;
  menuSynced: number;
  menuDeleted: number;
  inventorySynced: number;
  inventoryDeleted: number;
  categoriesSynced: number;
  tablesSynced: number;
  ordersSynced: number;
  error?: string;
}

/**
 * Comprehensively sync all current POS data to Firebase Firestore
 * AND purge all obsolete / deleted items so the cloud is 100% up-to-date.
 */
export async function syncFullCatalogToFirestore(
  params: SyncFullCatalogParams
): Promise<SyncFullCatalogResult> {
  if (!dbInstance || !navigator.onLine) {
    return {
      success: false,
      menuSynced: 0,
      menuDeleted: 0,
      inventorySynced: 0,
      inventoryDeleted: 0,
      categoriesSynced: 0,
      tablesSynced: 0,
      ordersSynced: 0,
      error: 'ฐานข้อมูล Firebase ออฟไลน์หรือไม่พร้อมใช้งาน'
    };
  }

  const {
    menuItems,
    deletedMenuItemIds,
    ingredients,
    deletedIngredientIds = [],
    categories,
    tables,
    addOns = [],
    branch,
    settings,
    orders = [],
    purgeOrphanCloudData = true
  } = params;

  try {
    console.log(`[Firebase Service] 🚀 Starting Full Real-Time Cloud Synchronization & Data Reconciliation for Branch: ${branch.name}...`);

    let menuDeleted = 0;
    let inventoryDeleted = 0;

    // 1. Purge obsolete / deleted cloud items if requested
    if (purgeOrphanCloudData) {
      const purgeRes = await purgeOutdatedCloudData(
        branch.id,
        menuItems.map(m => m.id),
        ingredients.map(i => i.id),
        deletedMenuItemIds,
        deletedIngredientIds
      );
      menuDeleted = purgeRes.menuDeleted;
      inventoryDeleted = purgeRes.inventoryDeleted;
    }

    // 2. Sync Active Menu Items to Firestore
    let menuSynced = 0;
    if (menuItems.length > 0) {
      const menuBatch = writeBatch(dbInstance);
      const nowIso = new Date().toISOString();

      menuItems.forEach(item => {
        const docRef = doc(dbInstance!, 'menu_items', item.id);
        const payload = cleanForFirestore({
          ...item,
          branchId: branch.id,
          branchName: branch.name,
          lastSyncedAt: nowIso,
          updatedAt: serverTimestamp()
        });
        menuBatch.set(docRef, payload, { merge: true });
        menuSynced++;
      });
      await menuBatch.commit();
      console.log(`[Firebase Service] 🍽️ Synced ${menuSynced} menu item(s) to Firestore.`);
    }

    // 3. Sync Active Inventory to Firestore
    let inventorySynced = 0;
    if (ingredients.length > 0) {
      await syncInventoryToFirestore(ingredients, branch, { purgeDeleted: purgeOrphanCloudData });
      inventorySynced = ingredients.length;
    }

    // 4. Sync Categories, Tables, Add-ons, and Settings
    let categoriesSynced = 0;
    if (categories.length > 0) {
      await syncCategoriesToFirestore(categories, branch.id);
      categoriesSynced = categories.length;
    }

    let tablesSynced = 0;
    if (tables.length > 0) {
      await syncTablesToFirestore(tables, branch.id);
      tablesSynced = tables.length;
    }

    if (addOns.length > 0) {
      await syncAddOnsToFirestore(addOns, branch.id);
    }

    if (settings) {
      await syncSettingsToFirestore(settings, branch.id);
    }

    // 5. Sync Pending Orders (if any)
    let ordersSynced = 0;
    const pendingOrders = orders.filter(o => o.branchId === branch.id && (o.isOfflineOrder || !o.isSynced));
    if (pendingOrders.length > 0) {
      const batchOrderRes = await syncOrdersBatchToFirestore(pendingOrders, branch);
      ordersSynced = batchOrderRes.success;
    }

    // 6. Heartbeat & Branch Metadata
    await syncBranchToFirestore(branch, {
      lowStockCount: ingredients.filter(i => i.currentStock <= i.minStockAlert).length
    });

    console.log(`[Firebase Service] ✅ Full Cloud Synchronization Complete: ${menuSynced} menus synced, ${menuDeleted} menus purged, ${inventorySynced} inventory synced, ${inventoryDeleted} inventory purged.`);

    return {
      success: true,
      menuSynced,
      menuDeleted,
      inventorySynced,
      inventoryDeleted,
      categoriesSynced,
      tablesSynced,
      ordersSynced
    };
  } catch (err: any) {
    console.error('[Firebase Service] ❌ Full Catalog Cloud Sync failed:', err);
    return {
      success: false,
      menuSynced: 0,
      menuDeleted: 0,
      inventorySynced: 0,
      inventoryDeleted: 0,
      categoriesSynced: 0,
      tablesSynced: 0,
      ordersSynced: 0,
      error: err?.message || String(err)
    };
  }
}

/**
 * Real-time Listener for Menu Items in Firestore
 */
export function subscribeToMenuItems(
  onUpdate: (items: MenuItem[], removedIds?: string[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  const colRef = collection(dbInstance, 'menu_items');
  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: MenuItem[] = [];
      const removedIds: string[] = [];

      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.push(change.doc.id);
        }
      });

      snapshot.forEach(d => {
        const data = d.data();
        items.push({
          id: d.id,
          name: data.name || '',
          nameEn: data.nameEn || '',
          category: data.category || 'kaprao',
          price: Number(data.price) || 0,
          costPrice: Number(data.costPrice) || 0,
          description: data.description || '',
          image: data.image || '',
          isPopular: !!data.isPopular,
          recipe: Array.isArray(data.recipe) ? data.recipe : [],
          availableSpiceLevels: data.availableSpiceLevels,
          availableProteins: data.availableProteins,
          allowAddOns: data.allowAddOns !== undefined ? data.allowAddOns : true,
          allowedAddOnIds: data.allowedAddOnIds
        });
      });
      onUpdate(items, removedIds);
    },
    (err) => {
      console.warn('[Firebase Service] Real-time subscription error on menu_items:', err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Real-time Listener for Branch Inventory in Firestore
 */
export function subscribeToBranchInventory(
  branchId: string,
  onUpdate: (ingredients: Ingredient[], removedIds?: string[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  const colRef = collection(dbInstance, 'branches', branchId, 'inventory');
  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const ings: Ingredient[] = [];
      const removedIds: string[] = [];

      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.push(change.doc.id);
        }
      });

      snapshot.forEach(d => {
        const data = d.data();
        ings.push({
          id: data.ingredientId || d.id,
          name: data.name || '',
          currentStock: Number(data.currentStock) || 0,
          minStockAlert: Number(data.minStockAlert) || 0,
          unit: data.unit || 'pcs',
          unitCost: Number(data.unitCost) || 0,
          category: data.category || 'dry_good',
          barcode: data.barcode || ''
        });
      });
      onUpdate(ings, removedIds);
    },
    (err) => {
      console.warn(`[Firebase Service] Real-time subscription error on branch inventory (${branchId}):`, err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Real-time Listener for Deleted Records (Tombstones) in Firestore
 * Informs all connected clients when an item was deleted centrally.
 */
export function subscribeToDeletedRecords(
  onUpdate: (deletedSet: { menuIds: Set<string>; ingredientIds: Set<string>; orderIds: Set<string> }) => void,
  onError?: (err: Error) => void
): () => void {
  if (!dbInstance) return () => {};

  try {
    const colRef = collection(dbInstance, 'deleted_records');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const menuIds = new Set<string>();
        const ingredientIds = new Set<string>();
        const orderIds = new Set<string>();

        snapshot.forEach(d => {
          const data = d.data();
          if (data.type === 'menu_item' && data.recordId) {
            menuIds.add(data.recordId);
          } else if (data.type === 'ingredient' && data.recordId) {
            ingredientIds.add(data.recordId);
          } else if (data.type === 'order' && data.recordId) {
            orderIds.add(data.recordId);
          }
        });

        onUpdate({ menuIds, ingredientIds, orderIds });
      },
      (err) => {
        console.warn('[Firebase Service] Real-time subscription error on deleted_records:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error('[Firebase Service] ❌ Failed to subscribe to deleted_records:', err);
    return () => {};
  }
}



