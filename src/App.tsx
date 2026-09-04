import React, { useEffect } from 'react';
import { POSProvider, usePOS } from './context/POSContext';
import { HeaderNavbar } from './components/HeaderNavbar';
import { SidebarDrawer } from './components/SidebarDrawer';
import { LoginScreen } from './components/LoginScreen';
import { POSView } from './components/pos/POSView';
import { KDSView } from './components/kds/KDSView';
import { InventoryView } from './components/inventory/InventoryView';
import { AccountingView } from './components/accounting/AccountingView';
import { SettingsView } from './components/settings/SettingsView';
import {
  ExecutiveDashboardView,
  QrOrderingView,
  RecipeCostingView,
  POManagementView,
  QuotationView,
  TaxReceiptView,
  CRMView,
  LineNotifyView,
  AnalyticsView
} from './components/ExtendedViews';
import {
  WifiOff,
  RefreshCw
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const {
    activeTab,
    isLocked,
    setIsLocked,
    settings,
    isOffline,
    forceOfflineMode,
    pendingOfflineCount,
    syncOfflineQueue
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
    <div className="min-h-screen bg-[#0d0704] text-stone-100 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white">
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
      <main className="flex-1 overflow-x-hidden overflow-y-auto">
        {activeTab === 'dashboard' && <ExecutiveDashboardView />}
        {activeTab === 'pos' && <POSView />}
        {activeTab === 'qr' && <QrOrderingView />}
        {activeTab === 'kds' && <KDSView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'recipes' && <RecipeCostingView />}
        {activeTab === 'po' && <POManagementView />}
        {activeTab === 'accounting' && <AccountingView />}
        {activeTab === 'quotation' && <QuotationView />}
        {activeTab === 'tax_receipt' && <TaxReceiptView />}
        {activeTab === 'crm' && <CRMView />}
        {activeTab === 'line_notify' && <LineNotifyView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
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
