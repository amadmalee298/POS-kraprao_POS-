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
  LogOut
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { PinModal } from './PinModal';
import { OfflineSyncModal } from './OfflineSyncModal';
import { SyncHealthMonitor } from './SyncHealthMonitor';
import { MerchantConnectionModal } from './common/MerchantConnectionModal';
import { SHOP_LOGO_URL } from '../assets/logo';

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
      <header className="bg-[#0b1220] border-b border-slate-800/80 text-slate-100 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Left: Drawer Hamburger Toggle & Brand Identity */}
            <div className="flex items-center space-x-3">
              {/* Sidebar Menu Toggle Button */}
              <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition active:scale-95 shadow-sm flex items-center justify-center"
                title="เปิดเมนูนำทาง (Sidebar Drawer)"
              >
                {isDrawerOpen ? <X className="w-5 h-5 text-red-400" /> : <Menu className="w-5 h-5" />}
              </button>

              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FFFBF5] border border-amber-300/80 shadow-lg shadow-amber-950/50 shrink-0 flex items-center justify-center p-0.5">
                  <img
                    src={settings.shopLogoUrl || SHOP_LOGO_URL}
                    alt="ครัวกะเพรา Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      if (e.currentTarget.src !== SHOP_LOGO_URL) {
                        e.currentTarget.src = SHOP_LOGO_URL;
                      }
                    }}
                  />
                </div>
                <div>
                  <h1 className="font-bold text-base tracking-tight bg-gradient-to-r from-amber-200 via-orange-300 to-amber-400 bg-clip-text text-transparent">
                    ครัวกะเพรา
                  </h1>
                  <span className="text-[10px] font-semibold tracking-wider text-amber-500 uppercase block -mt-1">
                    POS ENTERPRISE
                  </span>
                </div>
              </div>

              <div className="hidden md:block h-6 w-px bg-slate-800" />

              {/* Branch Selector */}
              <div className="hidden sm:block relative">
                <div className="flex items-center space-x-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium transition">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <select
                    value={currentBranch.id}
                    onChange={e => {
                      const found = branches.find(b => b.id === e.target.value);
                      if (found) setCurrentBranch(found);
                    }}
                    className="bg-transparent border-none focus:outline-none focus:ring-0 text-slate-200 cursor-pointer pr-2 font-medium"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200 py-1">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Middle: Quick Navigation Tabs (Desktop) */}
            <nav className="hidden lg:flex items-center space-x-1 bg-slate-950/60 p-1 rounded-2xl border border-slate-800/80">
              <button
                onClick={() => setActiveTab('pos')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  activeTab === 'pos'
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/50 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>ขายหน้าร้าน</span>
              </button>

              <button
                onClick={() => setActiveTab('kds')}
                className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  activeTab === 'kds'
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/50 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <ChefHat className="w-4 h-4" />
                <span>ห้องครัว (KDS)</span>
                {pendingKdsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-slate-950 rounded-full animate-bounce">
                    {pendingKdsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('inventory')}
                className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  activeTab === 'inventory'
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/50 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <PackageCheck className="w-4 h-4" />
                <span>คลังวัตถุดิบ</span>
                {lowStockCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center space-x-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>{lowStockCount}</span>
                  </span>
                )}
              </button>


            </nav>

            {/* Right: Sync Health Monitor, Merchant Pro, Clock, User Badge & Logout */}
            <div className="flex items-center space-x-2.5">
              {/* Merchant Pro Connection Status Pill */}
              <button
                onClick={() => setIsMerchantModalOpen(true)}
                className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-950/60 hover:bg-blue-900/80 border border-blue-500/40 text-blue-200 transition active:scale-95 shadow-sm"
                title="คลิกเพื่อจัดการการเชื่อมต่อแอป Merchant Pro"
              >
                <Store className="w-3.5 h-3.5 text-blue-400" />
                <span>Merchant Pro</span>
                {settings.merchantSettings?.isConnected !== false ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                )}
              </button>

              {/* Sync Health & Connection Monitor */}
              <SyncHealthMonitor />

              {/* Clock */}
              <div className="hidden xl:flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-950/40 border border-slate-800 px-2.5 py-1 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>{currentTime}</span>
              </div>

              {/* User Profile Info */}
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs transition active:scale-95 shadow-sm"
                title="คลิกเพื่อสลับผู้ใช้งาน (PIN Code)"
              >
                <div
                  className={`w-6 h-6 rounded-full bg-gradient-to-tr ${currentUser.avatarColor} flex items-center justify-center font-bold text-white text-[11px] shadow-sm`}
                >
                  {currentUser.name.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="font-semibold text-slate-200 text-xs leading-none">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium leading-none mt-0.5">
                    {currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : currentUser.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'}
                  </div>
                </div>
                <KeyRound className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </button>

              {/* Lock / Logout Button */}
              <button
                onClick={() => setIsLocked(true)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 border border-slate-700/60 hover:border-rose-500/40 transition active:scale-95 flex items-center justify-center"
                title="ออกจากระบบ / ล็อคหน้าจอ"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Quick Bar */}
        <div className="lg:hidden flex items-center justify-around bg-slate-950 border-t border-slate-800/80 px-2 py-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex flex-col items-center py-1 px-3 rounded-lg text-[11px] font-medium transition whitespace-nowrap ${
              activeTab === 'pos' ? 'text-red-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Store className="w-4 h-4 mb-0.5" />
            <span>ขายหน้าร้าน</span>
          </button>

          <button
            onClick={() => setActiveTab('kds')}
            className={`relative flex flex-col items-center py-1 px-3 rounded-lg text-[11px] font-medium transition whitespace-nowrap ${
              activeTab === 'kds' ? 'text-red-400 font-bold' : 'text-slate-400'
            }`}
          >
            <ChefHat className="w-4 h-4 mb-0.5" />
            <span>ห้องครัว</span>
            {pendingKdsCount > 0 && (
              <span className="absolute top-0 right-1 px-1 bg-amber-500 text-slate-950 text-[9px] font-bold rounded-full">
                {pendingKdsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`relative flex flex-col items-center py-1 px-3 rounded-lg text-[11px] font-medium transition whitespace-nowrap ${
              activeTab === 'inventory' ? 'text-red-400 font-bold' : 'text-slate-400'
            }`}
          >
            <PackageCheck className="w-4 h-4 mb-0.5" />
            <span>คลังวัตถุดิบ</span>
            {lowStockCount > 0 && (
              <span className="absolute top-0 right-1 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full">
                {lowStockCount}
              </span>
            )}
          </button>


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
    </>
  );
};
