import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
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
import { Order, Ingredient, Branch, StockAdjustmentLog, WasteLog } from '../types';

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
  // If named firestoreDatabaseId is provided in config, use it; otherwise fallback to default
  if (firebaseConfig.firestoreDatabaseId) {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
  isInitialized = true;
  console.log(`[Firebase Service] 🔥 Connected to Firebase Project: ${firebaseConfig.projectId} (DB: ${firebaseConfig.firestoreDatabaseId || 'default'})`);
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
