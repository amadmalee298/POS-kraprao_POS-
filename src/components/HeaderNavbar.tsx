import React, { useState, useEffect } from 'react';
import {
  Flame,
  Store,
  ChefHat,
  PackageCheck,
  Building2,
  Clock,
  KeyRound,
  AlertTriangle,
  Menu,
  X,
  Wifi,
  WifiOff,
  CloudOff,
  HardDrive,
  LogOut,
  FileSpreadsheet
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { PinModal } from './PinModal';
import { OfflineSyncModal } from './OfflineSyncModal';
import { SyncHealthMonitor } from './SyncHealthMonitor';
import { MerchantConnectionModal } from './common/MerchantConnectionModal';
import { GoogleSheetsModal } from './common/GoogleSheetsModal';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../assets/logo';

export const HeaderNavbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentBranch,
    setCurrentBranch,
    branches,
    currentUser,
    orders,
    ingredients,
    isDrawerOpen,
    setIsDrawerOpen,
    setIsLocked,
    isOffline,
    forceOfflineMode,
    pendingOfflineCount,
    settings
  } = usePOS();

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [isMerchantModalOpen, setIsMerchantModalOpen] = useState(false);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      setCurrentTime(now.toLocaleDateString('th-TH', options));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate live badge counts
  const pendingKdsCount = orders.filter(
    o => o.branchId === currentBranch.id && (o.status === 'pending' || o.status === 'cooking')
  ).length;

  const lowStockCount = ingredients.filter(i => i.currentStock <= i.minStockAlert).length;

  return (
    <>
      <header className="bg-[#0d0704] border-b border-[#24150c] text-stone-100 sticky top-0 z-40 shadow-xl pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Top Row: Brand & System Controls */}
          <div className="flex items-center justify-between h-14 sm:h-16">
            
            {/* Left: Drawer Hamburger Toggle & Brand Identity */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Sidebar Menu Toggle Button */}
              <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className="p-2 rounded-xl bg-[#180f0a] hover:bg-[#25170f] text-stone-300 border border-[#2b1a11] transition active:scale-95 shadow-sm flex items-center justify-center"
                title="เปิดเมนูนำทาง (Sidebar Drawer)"
              >
                {isDrawerOpen ? <X className="w-4 h-4 text-orange-400" /> : <Menu className="w-4 h-4" />}
              </button>

              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-[#FFFBF5] border border-[#3e2416] shadow-md shadow-orange-950/30 shrink-0 flex items-center justify-center p-0.5">
                  <img
                    src={settings.shopLogoUrl || SHOP_LOGO_URL}
                    alt="ครัวกะเพรา Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      if (e.currentTarget.src !== FALLBACK_SVG_LOGO) {
                        e.currentTarget.src = FALLBACK_SVG_LOGO;
                      }
                    }}
                  />
                </div>
                <div>
                  <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-amber-100 leading-tight">
                    ครัวกะเพรา
                  </h1>
                  <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-[#ff7711] uppercase block">
                    POS ENTERPRISE
                  </span>
                </div>
              </div>

              {/* Branch Selector (Desktop & Tablet) */}
              <div className="hidden md:block relative ml-2">
                <div className="flex items-center space-x-1.5 bg-[#180f0a] hover:bg-[#25170f] border border-[#2d1b12] text-stone-300 px-2.5 py-1 rounded-xl text-xs font-medium transition">
                  <Building2 className="w-3.5 h-3.5 text-orange-400" />
                  <select
                    value={currentBranch.id}
                    onChange={e => {
                      const found = branches.find(b => b.id === e.target.value);
                      if (found) setCurrentBranch(found);
                    }}
                    className="bg-transparent border-none focus:outline-none focus:ring-0 text-stone-200 cursor-pointer pr-1 font-medium text-xs"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#180f0a] text-stone-200 py-1">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Sync Health Monitor, Green Receipt, User Badge & Logout */}
            <div className="flex items-center space-x-2 sm:space-x-2.5">
              {/* Google Sheets / Receipts button */}
              <button
                onClick={() => setIsGoogleSheetsModalOpen(true)}
                className="p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-400 transition active:scale-95 shadow-sm flex items-center justify-center"
                title="Google Sheets & รายการใบเสร็จ"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>

              {/* Merchant Pro Pill (Optional Desktop) */}
              <button
                onClick={() => setIsMerchantModalOpen(true)}
                className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#180f0a] hover:bg-[#25170f] border border-[#2d1b12] text-stone-300 transition active:scale-95 shadow-sm"
                title="คลิกเพื่อจัดการการเชื่อมต่อแอป Merchant Pro"
              >
                <Store className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px]">Merchant Pro</span>
                {settings.merchantSettings?.isConnected !== false ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-stone-500" />
                )}
              </button>

              {/* Sync Health & Connection Monitor */}
              <SyncHealthMonitor />

              {/* User Profile Info (Avatar circle matching screenshot) */}
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="w-8 h-8 rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-extrabold flex items-center justify-center text-sm shadow-md transition active:scale-95 border border-purple-400/40 shrink-0"
                title={`คลิกเพื่อสลับผู้ใช้งาน: ${currentUser.name}`}
              >
                {currentUser.name ? currentUser.name.charAt(0) : 'อ'}
              </button>

              {/* Lock / Logout Button */}
              <button
                onClick={() => setIsLocked(true)}
                className="p-2 rounded-xl bg-[#180f0a] hover:bg-[#25170f] text-stone-400 hover:text-stone-200 border border-[#2b1a11] transition active:scale-95 flex items-center justify-center shrink-0"
                title="ออกจากระบบ / ล็อคหน้าจอ"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Navigation Tabs (ขายหน้าร้าน | ห้องครัว | คลังวัตถุดิบ) */}
          <div className="flex items-center justify-around sm:justify-center sm:space-x-8 border-t border-[#22130a] py-2">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'pos'
                  ? 'text-[#ff7711] bg-orange-950/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-[#180f0a]'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>ขายหน้าร้าน</span>
            </button>

            <button
              onClick={() => setActiveTab('kds')}
              className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'kds'
                  ? 'text-[#ff7711] bg-orange-950/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-[#180f0a]'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              <span>ห้องครัว</span>
              {pendingKdsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-[#ff6600] text-black rounded-full animate-bounce">
                  {pendingKdsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                activeTab === 'inventory'
                  ? 'text-[#ff7711] bg-orange-950/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-[#180f0a]'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              <span>คลังวัตถุดิบ</span>
              {lowStockCount > 0 ? (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-black bg-rose-600 text-white rounded-full flex items-center space-x-0.5">
                  <span>{lowStockCount}</span>
                </span>
              ) : (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-black bg-rose-600/90 text-white rounded-full">
                  33
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Pin Modal */}
      <PinModal isOpen={isPinModalOpen} onClose={() => setIsPinModalOpen(false)} />

      {/* Offline Sync & Cache Modal */}
      <OfflineSyncModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
      />

      {/* Merchant Pro Connection Modal */}
      <MerchantConnectionModal
        isOpen={isMerchantModalOpen}
        onClose={() => setIsMerchantModalOpen(false)}
      />

      {/* Google Sheets Sync Modal */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
      />
    </>
  );
};
