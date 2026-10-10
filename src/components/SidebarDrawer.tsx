import React, { useState } from 'react';
import { isLowStock } from '../utils/stockTypes';
import { ShopAccountStatusButton } from './ShopAccountBanner';
import {
  X,
  ChevronDown,
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
  Landmark,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  HardDrive,
  Printer
} from 'lucide-react';
import { requestSettingsTab, SettingsTab } from '../utils/settingsNav';
import { canOpenSettingsPart, canOpenTab } from '../utils/access';
import { requestPageSection, SectionPage } from '../utils/pageNav';
import { usePOS } from '../context/POSContext';
import { ActiveTab } from '../types';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../assets/logo';
import { GoogleSheetsModal } from './common/GoogleSheetsModal';

// Pages that open as dropdowns of their own sections
const STOCK_GROUP: ActiveTab[] = ['inventory', 'recipes', 'po', 'accounting'];
// Documents and customers fold under one header; LINE/Telegram sits with the settings
const DOCS_GROUP: ActiveTab[] = ['quotation', 'tax_receipt', 'order_history', 'crm'];
const IN_SETTINGS: ActiveTab[] = ['line_notify'];
const PAGE_SECTIONS: Partial<Record<SectionPage, { id: string; label: string }[]>> = {
  inventory: [
    { id: 'stock', label: 'สต็อกคงเหลือ' },
    { id: 'count', label: 'นับสต็อก' },
    { id: 'history', label: 'ประวัติรับ-เบิก' },
    { id: 'report', label: 'รายงาน & พยากรณ์' }
  ],
  recipes: [
    { id: 'menu', label: 'จัดการเมนูอาหาร' },
    { id: 'toppings', label: 'จัดการ Toppings' },
    { id: 'recipes', label: 'สูตรอาหาร (BOM)' },
    { id: 'prep', label: 'ผลิต/เตรียมวัตถุดิบ' },
    { id: 'bulk_edit', label: 'ปรับราคาทุน & ราคาขาย' },
    { id: 'ai_engineering', label: 'AI วิศวกรรมเมนู' }
  ],
  po: [
    { id: 'po', label: 'ใบสั่งซื้อ (PO)' },
    { id: 'suppliers', label: 'ซัพพลายเออร์' }
  ],
  accounting: [
    { id: 'statement', label: 'งบกำไรขาดทุน' },
    { id: 'balance_sheet', label: 'งบดุล (งบแสดงฐานะการเงิน)' },
    { id: 'cash_flow', label: 'งบกระแสเงินสด' },
    { id: 'journal', label: 'สมุดรายวัน' },
    { id: 'trial', label: 'งบทดลอง / ผังบัญชี' },
    { id: 'vat', label: 'รายงานภาษี VAT (ภ.พ.30)' },
    { id: 'ar_ap', label: 'ลูกหนี้ / เจ้าหนี้' },
    { id: 'incomes', label: 'รายได้อื่น' },
    { id: 'expenses', label: 'ค่าใช้จ่าย / ภาษีซื้อ' },
    { id: 'details', label: 'รายวัน' },
    { id: 'telegram', label: 'บิลจาก Telegram' }
  ]
};

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
    firebaseSyncState,
    permissions
  } = usePOS();
  const cloudStatus = isOffline || forceOfflineMode ? 'offline' : firebaseSyncState.status;

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  // Menu groups fold away; open or closed is remembered on this device
  const foldKey = (k: string) => (k === 'settings' ? 'POS_MENU_SETTINGS_OPEN' : `POS_MENU_FOLD_${k}`);
  const [folds, setFolds] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    try {
      ['settings', 'docs', ...STOCK_GROUP].forEach(k => (out[k] = localStorage.getItem(foldKey(k)) === '1'));
    } catch {
      // closed
    }
    return out;
  });
  const toggleFold = (key: string) =>
    setFolds(f => {
      const next = { ...f, [key]: !f[key] };
      try {
        localStorage.setItem(foldKey(key), next[key] ? '1' : '0');
      } catch {
        // this visit only
      }
      return next;
    });

  if (!isDrawerOpen) return null;

  const lowStockCount = ingredients.filter(isLowStock).length;
  const pendingKdsCount = orders.filter(
    o => o.branchId === currentBranch.id && (o.status === 'pending' || o.status === 'cooking')
  ).length;

  const allTopItems: { tab: SettingsTab; label: string; icon: React.ElementType; style: string }[] = [
    { tab: 'timeclock', label: 'ลงเวลาเข้า-ออกงาน (PIN)', icon: Clock, style: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40' },
    { tab: 'shifts', label: 'เปิด-ปิดกะ & ลิ้นชักเงินสด', icon: Wallet, style: 'bg-amber-950/30 border-amber-500/30 text-amber-300 hover:bg-amber-900/30' }
  ];

  const topItems = allTopItems.filter(i => canOpenSettingsPart(i.tab, permissions));

  const allSettingsItems: { tab: SettingsTab; label: string; icon: React.ElementType; highlight?: boolean }[] = [
    { tab: 'scheduling', label: 'ตารางงาน เงินเดือน & ประวัติลงเวลา', icon: CalendarDays },
    { tab: 'pins', label: 'รหัส PIN & สิทธิ์พนักงาน', icon: KeyRound },
    { tab: 'general', label: 'ตั้งค่าร้านและสาขา', icon: Settings },
    { tab: 'sync', label: 'ตั้งค่าการซิงค์ข้อมูล', icon: RefreshCw },
    { tab: 'security_logs', label: 'ประวัติความปลอดภัย', icon: ShieldAlert },
    { tab: 'printer', label: 'เครื่องพิมพ์ใบเสร็จ', icon: Printer },
    { tab: 'backup', label: 'สำรอง & กู้คืนข้อมูล', icon: HardDrive }
  ];
  const settingsItems = allSettingsItems.filter(i => canOpenSettingsPart(i.tab, permissions));
  // Payslips and withholding tax certificates, listed with the other documents
  const staffDocLinks: { tab: SettingsTab; section?: string; label: string; icon: React.ElementType }[] = [
    { tab: 'scheduling' as SettingsTab, section: 'monthly', label: 'สลิปเงินเดือน', icon: Wallet },
    { tab: 'staff_docs' as SettingsTab, label: 'หนังสือรับรอง 50 ทวิ', icon: FileText },
    { tab: 'gov_filing' as SettingsTab, label: 'ยื่นเอกสารราชการ (ภาษี/ประกันสังคม)', icon: Landmark }
  ].filter(l => canOpenSettingsPart(l.tab, permissions));

  const allMenuItems: {
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
  const menuItemsList = allMenuItems.filter(i => canOpenTab(i.id, permissions));
  const stockItems = menuItemsList.filter(i => STOCK_GROUP.includes(i.id));
  const docItems = menuItemsList.filter(i => DOCS_GROUP.includes(i.id));
  const settingsPageItems = menuItemsList.filter(i => IN_SETTINGS.includes(i.id));
  const renderItem = (item: (typeof allMenuItems)[number]) => {
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
  };


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
          <span className="text-[10px] text-slate-500 font-mono">{menuItemsList.length + settingsItems.length + topItems.length} ฟังก์ชัน</span>
        </div>

        {/* Google Sheets Quick Sync Card (sales figures: for those who may see the accounts) */}
        {permissions.canAccessAccounting && (
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
        )}

        {/* Menu Items Scrollable List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 py-1 custom-scrollbar">
          {/* Used every shift: clock in/out and the cash drawer come first */}
          {topItems.map(item => {
    const IconComponent = item.icon;
            return (
              <button
                key={item.tab}
                onClick={() => {
                  requestSettingsTab(item.tab);
                  setActiveTab('settings');
                  setIsDrawerOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-sm font-bold transition text-left border ${item.style}`}
              >
                <IconComponent className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {menuItemsList.filter(i => ![...STOCK_GROUP, ...DOCS_GROUP, ...IN_SETTINGS].includes(i.id)).map(renderItem)}

          {/* Quotations, receipts, order history and members */}
          {docItems.length > 0 && (
            <button
              type="button"
              onClick={() => toggleFold('docs')}
              aria-expanded={!!folds.docs}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-left ${
                !folds.docs && docItems.some(i => i.id === activeTab) ? 'bg-red-950/50 text-red-400 border border-red-500/30 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center space-x-3">
                <Receipt className="w-4 h-4 shrink-0 text-slate-400" />
                <span>เอกสาร ใบเสร็จ ลูกค้า & พนักงาน</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${folds.docs ? 'rotate-180' : ''}`} />
            </button>
          )}
          {folds.docs && (
            <div className="ml-6 pl-2 border-l border-slate-800 space-y-0.5">
              {docItems.map(renderItem)}
              {/* Staff paperwork lives in the settings (owner only) */}
              {staffDocLinks.map(link => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => {
                    if (link.section) requestPageSection('scheduling', link.section);
                    requestSettingsTab(link.tab);
                    setActiveTab('settings');
                    setIsDrawerOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-left text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                >
                  <link.icon className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="truncate">{link.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Stock, recipes, purchasing and accounts: each opens to the sections of its page */}
          {stockItems.map(item => {
            const IconComponent = item.icon;
            const open = !!folds[item.id];
            const onPage = activeTab === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleFold(item.id)}
                  aria-expanded={open}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition text-left ${
                    onPage ? 'bg-red-950/50 text-red-400 border border-red-500/30 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center space-x-3 truncate">
                    <IconComponent className={`w-4 h-4 shrink-0 ${onPage ? 'text-red-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5 ml-2 shrink-0">
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white">{item.badgeCount}</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {open && (
                  <div className="ml-6 pl-3 border-l border-slate-800 space-y-0.5 py-1">
                    {(PAGE_SECTIONS[item.id as SectionPage] || []).map(sec => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          requestPageSection(item.id as SectionPage, sec.id);
                          setActiveTab(item.id);
                          setIsDrawerOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Staff & settings: each part of the settings page is one tap away */}
          {settingsItems.length + settingsPageItems.length > 0 && (
            <button
              type="button"
              onClick={() => toggleFold('settings')}
              aria-expanded={folds.settings}
              className="w-full mt-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 border border-slate-800"
            >
              <span className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-400" />
                พนักงาน & ตั้งค่า
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${folds.settings ? 'rotate-180' : ''}`} />
            </button>
          )}
          {folds.settings && settingsItems.map(item => {
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
          {folds.settings && settingsPageItems.map(renderItem)}
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
