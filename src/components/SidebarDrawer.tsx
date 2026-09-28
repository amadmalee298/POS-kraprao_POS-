import React, { useState } from 'react';
import { ShopAccountStatusButton } from './ShopAccountBanner';
import {
  X,
  LayoutGrid,
  ShoppingCart,
  QrCode,
  Flame,
  Package,
  BookOpen,
  Truck,
  FileText,
  FileSpreadsheet,
  Receipt,
  Users,
  BellRing,
  BarChart3,
  Settings,
  Database,
  History,
  Flame as FlameIcon,
  Clock,
  CalendarDays,
  Wallet,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  HardDrive
} from 'lucide-react';
import { requestSettingsTab, SettingsTab } from '../utils/settingsNav';
import { usePOS } from '../context/POSContext';
import { ActiveTab } from '../types';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../assets/logo';
import { GoogleSheetsModal } from './common/GoogleSheetsModal';

export const SidebarDrawer: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isDrawerOpen,
    setIsDrawerOpen,
    ingredients,
    orders,
    currentBranch,
    settings,
    isOffline,
    forceOfflineMode,
    firebaseSyncState
  } = usePOS();
  const cloudStatus = isOffline || forceOfflineMode ? 'offline' : firebaseSyncState.status;

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);

  if (!isDrawerOpen) return null;

  const lowStockCount = ingredients.filter(i => i.currentStock <= i.minStockAlert).length;
  const pendingKdsCount = orders.filter(
    o => o.branchId === currentBranch.id && (o.status === 'pending' || o.status === 'cooking')
  ).length;

  const settingsItems: { tab: SettingsTab; label: string; icon: React.ElementType; highlight?: boolean }[] = [
    { tab: 'timeclock', label: 'ลงเวลาเข้า-ออกงาน (PIN)', icon: Clock, highlight: true },
    { tab: 'shifts', label: 'เปิด-ปิดกะ & ลิ้นชักเงินสด', icon: Wallet },
    { tab: 'scheduling', label: 'ตารางงาน & เงินเดือน', icon: CalendarDays },
    { tab: 'pins', label: 'รหัส PIN & สิทธิ์พนักงาน', icon: KeyRound },
    { tab: 'general', label: 'ตั้งค่าร้านและสาขา', icon: Settings },
    { tab: 'sync', label: 'ตั้งค่าการซิงค์ข้อมูล', icon: RefreshCw },
    { tab: 'security_logs', label: 'ประวัติความปลอดภัย', icon: ShieldAlert },
    { tab: 'backup', label: 'สำรอง & กู้คืนข้อมูล', icon: HardDrive }
  ];

  const menuItemsList: {
    id: ActiveTab;
    label: string;
    icon: React.ElementType;
    badgeCount?: number;
    hasDotAlert?: boolean;
  }[] = [
    { id: 'dashboard', label: 'วิเคราะห์ผลประกอบการ (Executive Dashboard)', icon: BarChart3 },
    { id: 'pos', label: 'ระบบขายหน้าร้าน (POS)', icon: ShoppingCart },
    { id: 'qr', label: 'ระบบสั่งอาหารคิวอาร์ (QR)', icon: QrCode },
    { id: 'kds', label: 'ระบบครัว (KDS)', icon: Flame, badgeCount: pendingKdsCount },
    {
      id: 'inventory',
      label: 'สต๊อกวัตถุดิบอัตโนมัติ',
      icon: Package,
      hasDotAlert: lowStockCount > 0,
      badgeCount: lowStockCount > 0 ? lowStockCount : undefined
    },
    { id: 'recipes', label: 'เมนูและสูตรตัดสต๊อก', icon: BookOpen },
    { id: 'po', label: 'จัดซื้อ PO & ซัพพลายเออร์', icon: Truck },
    { id: 'accounting', label: 'การเงินและสมุดบัญชี', icon: FileText },
    { id: 'quotation', label: 'ใบเสนอราคา', icon: FileSpreadsheet },
    { id: 'tax_receipt', label: 'ใบเสร็จรับเงินและใบกำกับภาษี', icon: Receipt },
    { id: 'order_history', label: 'ประวัติออเดอร์และใบเสร็จ (Order History)', icon: History },
    { id: 'crm', label: 'สมาชิก CRM & คูปอง', icon: Users },
    { id: 'line_notify', label: 'แจ้งเตือน Line/Telegram', icon: BellRing },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setIsDrawerOpen(false)}
      />

      {/* Side Drawer Drawer Box */}
      <div className="relative w-80 max-w-[85vw] bg-[#0c1322] border-r border-slate-800/80 text-slate-100 flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FFFBF5] border border-amber-300/80 shadow-md shrink-0 flex items-center justify-center p-0.5">
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
              <h2 className="font-bold text-sm text-slate-100">ครัวกะเพรา POS</h2>
              <p className="text-[10px] text-amber-500 font-medium">{currentBranch.name}</p>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Label */}
        <div className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>คุมบริหารสาขา</span>
          <span className="text-[10px] text-slate-500 font-mono">{menuItemsList.length + settingsItems.length} ฟังก์ชัน</span>
        </div>

        {/* Google Sheets Quick Sync Card */}
        <div className="px-3 mb-2">
          <button
            onClick={() => {
              setIsDrawerOpen(false);
              setIsSheetsModalOpen(true);
            }}
            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/60 border border-emerald-500/40 hover:border-emerald-400/80 text-slate-100 flex items-center justify-between transition group shadow-md"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="font-bold text-xs text-emerald-300">Google Sheets Sync</div>
                <div className="text-[10px] text-slate-400">ส่งออกยอดขาย & สต็อก</div>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 font-bold">
              ซิงค์ข้อมูล ↗
            </span>
          </button>
        </div>

        {/* Menu Items Scrollable List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 py-1 custom-scrollbar">
          {menuItemsList.map(item => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-left group ${
                  isActive
                    ? 'bg-red-950/50 text-red-400 border border-red-500/30 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <IconComponent
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-red-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                {/* Badge indicators */}
                <div className="flex items-center space-x-1.5 ml-2 shrink-0">
                  {item.hasDotAlert && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                  )}
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white shadow-sm">
                      {item.badgeCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Staff & settings: each part of the settings page is one tap away */}
          <div className="pt-3 pb-1 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">พนักงาน & ตั้งค่า</div>
          {settingsItems.map(item => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.tab}
                onClick={() => {
                  requestSettingsTab(item.tab);
                  setActiveTab('settings');
                  setIsDrawerOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-left group ${
                  item.highlight ? 'text-emerald-300 hover:bg-emerald-900/30' : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 ${item.highlight ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Footer Status */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[11px] flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>ฐานข้อมูลร่วม</span>
            </span>
            {/* The real cloud state (same as the sync button in the header) */}
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                cloudStatus === 'connected'
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                  : cloudStatus === 'error'
                  ? 'bg-rose-950/60 border-rose-500/30 text-rose-300'
                  : 'bg-amber-950/60 border-amber-500/30 text-amber-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cloudStatus === 'connected' ? 'bg-emerald-400' : cloudStatus === 'error' ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <span>{cloudStatus === 'connected' ? 'เชื่อมต่อ' : cloudStatus === 'error' ? 'ไม่ได้ซิงค์' : cloudStatus === 'offline' ? 'ออฟไลน์' : 'กำลังเชื่อม'}</span>
            </span>
          </div>

          <ShopAccountStatusButton className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[12px] flex items-center gap-2" />

          <div className="text-[10px] text-slate-500 font-mono text-center pt-1 border-t border-slate-800/50">
            เวอร์ชันระบบ v1.2.4-องค์กร
          </div>
        </div>
      </div>

      {/* Google Sheets Sync Modal */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
      />
    </div>
  );
};
