import React, { useEffect } from 'react';
import { POSProvider, usePOS } from './context/POSContext';
import { HeaderNavbar } from './components/HeaderNavbar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { LoginScreen } from './components/LoginScreen';
import { POSView } from './components/pos/POSView';
// Heavy views are code-split so the POS screen loads fast on tablets; each chunk is fetched on first use
const lazyNamed = <T extends Record<string, any>>(loader: () => Promise<T>, name: keyof T) =>
  React.lazy(() => loader().then(m => ({ default: m[name] as React.ComponentType })));

const KDSView = lazyNamed(() => import('./components/kds/KDSView'), 'KDSView');
const InventoryView = lazyNamed(() => import('./components/inventory/InventoryView'), 'InventoryView');
const AccountingView = lazyNamed(() => import('./components/accounting/AccountingView'), 'AccountingView');
const SettingsView = lazyNamed(() => import('./components/settings/SettingsView'), 'SettingsView');
const OrderHistoryView = lazyNamed(() => import('./components/orders/OrderHistoryView'), 'OrderHistoryView');
const loadExtendedViews = () => import('./components/ExtendedViews');
const ExecutiveDashboardView = lazyNamed(loadExtendedViews, 'ExecutiveDashboardView');
const QrOrderingView = lazyNamed(loadExtendedViews, 'QrOrderingView');
const RecipeCostingView = lazyNamed(loadExtendedViews, 'RecipeCostingView');
const POManagementView = lazyNamed(loadExtendedViews, 'POManagementView');
const QuotationView = lazyNamed(loadExtendedViews, 'QuotationView');
const TaxReceiptView = lazyNamed(loadExtendedViews, 'TaxReceiptView');
const CRMView = lazyNamed(loadExtendedViews, 'CRMView');
const LineNotifyView = lazyNamed(loadExtendedViews, 'LineNotifyView');

import {
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { SyncConflictResolverModal } from './components/SyncConflictResolverModal';

const MainLayout: React.FC = () => {
  const {
    activeTab,
    isLocked,
    setIsLocked,
    settings,
    isOffline,
    forceOfflineMode,
    pendingOfflineCount,
    syncOfflineQueue,
    conflictReport,
    isConflictResolverOpen,
    closeConflictResolver,
    applyConflictResolutions,
    isResolvingConflicts,
    scanForSyncConflicts,
    isScanningConflicts
  } = usePOS();
  const effectiveOffline = isOffline || forceOfflineMode;

  // Inactivity auto-lock timer
  useEffect(() => {
    const minutes = settings.autoLockMinutes || 0;
    if (minutes <= 0 || isLocked) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLocked(true);
      }, minutes * 60 * 1000);
    };

    resetTimer();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [settings.autoLockMinutes, isLocked, setIsLocked]);

  return (
    <div className="h-[100dvh] bg-[#0d0704] text-stone-100 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white">
      {/* Fullscreen PIN Lock Screen */}
      {isLocked && <LoginScreen />}

      {/* Offline Alert Banner */}
      {effectiveOffline && (
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-slate-950 font-bold px-4 py-2 text-xs flex items-center justify-between shadow-md z-50">
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 animate-pulse stroke-[2.5]" />
            <span>
              ⚡ คุณกำลังอยู่ในโหมดออฟไลน์ (Offline Mode) - ระบบบันทึกยอดขาย เมนู และคลังในเครื่อง (LocalStorage) อย่างปลอดภัย
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {pendingOfflineCount > 0 && (
              <span className="bg-slate-950 text-amber-300 px-2 py-0.5 rounded-full text-[11px] font-mono">
                {pendingOfflineCount} ออเดอร์รอซิงค์
              </span>
            )}
            <button
              onClick={() => syncOfflineQueue()}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-amber-200 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>ซิงค์ข้อมูล</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Top Header Navbar */}
      <HeaderNavbar />

      {/* Slide-out Sidebar Drawer Navigation */}
      <SidebarDrawer />

      {/* Main Content Body */}
      <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center py-24 text-stone-400 text-sm">
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              กำลังโหลด...
            </div>
          }
        >
        {(activeTab === 'dashboard' || activeTab === 'analytics') && <ExecutiveDashboardView />}
        {activeTab === 'pos' && <POSView />}
        {activeTab === 'qr' && <QrOrderingView />}
        {activeTab === 'kds' && <KDSView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'recipes' && <RecipeCostingView />}
        {activeTab === 'po' && <POManagementView />}
        {activeTab === 'accounting' && <AccountingView />}
        {activeTab === 'quotation' && <QuotationView />}
        {activeTab === 'tax_receipt' && <TaxReceiptView />}
        {activeTab === 'order_history' && <OrderHistoryView />}
        {activeTab === 'crm' && <CRMView />}
        {activeTab === 'line_notify' && <LineNotifyView />}
        {activeTab === 'settings' && <SettingsView />}
        </React.Suspense>
      </main>

      {/* Visual Conflict Resolver Modal for Local vs Cloud Mismatch */}
      <SyncConflictResolverModal
        isOpen={isConflictResolverOpen}
        onClose={closeConflictResolver}
        report={conflictReport}
        onApplyResolution={applyConflictResolutions}
        isApplying={isResolvingConflicts}
        onRefreshScan={scanForSyncConflicts}
        isScanning={isScanningConflicts}
      />
    </div>
  );
};

export default function App() {
  return (
    <POSProvider>
      <MainLayout />
    </POSProvider>
  );
}
