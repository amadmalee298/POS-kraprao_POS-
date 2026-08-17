import React, { useState, useEffect } from 'react';
import { calcRecipeItemCostAndDeduction, getAvailableRecipeUnits } from '../utils/recipeUtils';
import { isItemInCategory } from '../utils/categoryUtils';
import { SHOP_LOGO_URL } from '../assets/logo';
import { compressImageFile } from '../utils/imageCompressor';
import { generatePromptPayPayload } from '../utils/promptpay';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  Upload,
  Camera,
  TrendingUp,
  QrCode,
  BookOpen,
  Truck,
  FileSpreadsheet,
  Receipt,
  Users,
  BellRing,
  BarChart3,
  DollarSign,
  ShoppingBag,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  FolderPlus,
  Folder,
  Edit2,
  Send,
  Download,
  Share2,
  Edit,
  Trash2,
  Utensils,
  Layers,
  FlaskConical,
  Save,
  X,
  Egg,
  PlusCircle,
  Check,
  Printer,
  Smartphone,
  Flame,
  Sparkles,
  ChefHat,
  CheckCircle2,
  Minus,
  ArrowLeft,
  Copy,
  ExternalLink,
  Settings,
  Sliders,
  Play,
  Building2,
  Building,
  CreditCard,
  Calendar,
  Filter,
  Box,
  UserCheck,
  FileText,
  Eye,
  Paperclip,
  UploadCloud,
  User,
  Banknote,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Award,
  Target,
  Scale,
  Image as ImageIcon,
  Wallet,
  Landmark
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { MenuItem, AddOnOption, RecipeIngredient, MenuCategory, CartItem, SpiceLevel, ProteinChoice, Order, CustomerTaxInfo, PaymentMethod, QrPaymentOption } from '../types';
import { exportToPDF, exportToPNG, printElement } from '../utils/exportDocument';
import { AIMenuEngineeringPanel } from './inventory/AIMenuEngineeringPanel';
import { BulkIngredientCostEditorPanel } from './inventory/BulkIngredientCostEditorPanel';
import { EnterpriseExecutiveDashboard } from './executive/EnterpriseExecutiveDashboard';

// 1. Executive Dashboard View (แดชบอร์ดสรุปผู้บริหาร)
export const ExecutiveDashboardView: React.FC = () => {
  return <EnterpriseExecutiveDashboard />;
};

// Helper functions for real scannable QR generation
const getTableOrderUrl = (table: string) => {
  if (typeof window === 'undefined') return `https://ais-dev-kroxy3zk34mzybefraqwyj-164832963000.asia-southeast1.run.app/?table=${table}`;
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  return `${origin}${pathname}?table=${table}`;
};

const getQrCodeImgSrc = (table: string, size = 300) => {
  const targetUrl = getTableOrderUrl(table);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(targetUrl)}&color=070b14&bgcolor=ffffff&margin=1`;
};

const getPromptPayQrCodeImgSrc = (amount: number, promptPayId = '0812345678', size = 220) => {
  const payload = generatePromptPayPayload(promptPayId, amount);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}&color=000000&bgcolor=ffffff&margin=1`;
};

const renderPaymentMethodBadge = (pm?: PaymentMethod) => {
  switch (pm) {
    case 'promptpay':
      return (
        <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md font-bold inline-flex items-center space-x-1">
          <QrCode className="w-3 h-3" />
          <span>พร้อมเพย์</span>
        </span>
      );
    case 'cash':
      return (
        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold inline-flex items-center space-x-1">
          <Banknote className="w-3 h-3" />
          <span>ชำระที่เคาน์เตอร์</span>
        </span>
      );
    case 'credit':
      return (
        <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-bold inline-flex items-center space-x-1">
          <CreditCard className="w-3 h-3" />
          <span>บัตรเครดิต</span>
        </span>
      );
    case 'truemoney':
      return (
        <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-md font-bold inline-flex items-center space-x-1">
          <Wallet className="w-3 h-3" />
          <span>TrueMoney</span>
        </span>
      );
    default:
      return (
        <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-bold">
          {pm || 'พร้อมเพย์'}
        </span>
      );
  }
};

// 2. QR Table Ordering System View (ระบบสั่งอาหารคิวอาร์ QR)
export const QrOrderingView: React.FC = () => {
  const {
    currentBranch,
    menuItems,
    addOns,
    orders,
    createDirectOrder,
    updateOrderStatus,
    autoApproveQR,
    setAutoApproveQR,
    tables,
    categories,
    addTable,
    updateTable,
    deleteTable,
    settings,
    updateSettings
  } = usePOS();

  // Payment Methods Configuration State
  const DEFAULT_QR_METHODS: QrPaymentOption[] = [
    {
      id: 'promptpay',
      name: 'พร้อมเพย์ QR',
      type: 'promptpay',
      enabled: true,
      accountNumber: settings.promptpayMobileOrTaxId || settings.promptPayId || '081-234-5678',
      accountName: settings.shopName || 'ร้านครัวกะเพรา POS',
      instructions: 'สแกนคิวอาร์โค้ดเพื่อโอนชำระเงินผ่านแอปพลิเคชันธนาคารทุกธนาคาร'
    },
    {
      id: 'truemoney',
      name: 'TrueMoney Wallet',
      type: 'truemoney',
      enabled: true,
      accountNumber: settings.promptpayMobileOrTaxId || '081-234-5678',
      accountName: settings.shopName || 'ร้านครัวกะเพรา POS',
      instructions: 'โอนชำระเงินผ่านแอป TrueMoney Wallet'
    },
    {
      id: 'linepay',
      name: 'Rabbit LINE Pay',
      type: 'linepay',
      enabled: true,
      accountNumber: 'RLP-987654321',
      accountName: settings.shopName || 'ร้านครัวกะเพรา POS',
      instructions: 'สแกนชำระเงินผ่าน Rabbit LINE Pay หรือ LINE App'
    },
    {
      id: 'cash',
      name: 'ชำระที่เคาน์เตอร์',
      type: 'cash',
      enabled: true,
      accountNumber: '',
      accountName: '',
      instructions: 'สั่งอาหารเข้าครัวได้เลย แจ้งหมายเลขโต๊ะเพื่อชำระเงินสดหรือสแกนจ่ายที่เคาน์เตอร์'
    },
    {
      id: 'credit',
      name: 'บัตรเครดิต/เดบิต',
      type: 'credit',
      enabled: false,
      accountNumber: '',
      accountName: '',
      instructions: 'รองรับ Visa, Mastercard, JCB พนักงานจะนำเครื่องแตะบัตรมาให้บริการที่โต๊ะ'
    }
  ];

  const configuredPaymentMethods: QrPaymentOption[] = Array.isArray(settings.qrPaymentMethods)
    ? settings.qrPaymentMethods
    : DEFAULT_QR_METHODS;

  const [editingPaymentMethod, setEditingPaymentMethod] = useState<QrPaymentOption | null>(null);
  const [isAddPaymentMethodOpen, setIsAddPaymentMethodOpen] = useState<boolean>(false);
  const [paymentMethodForm, setPaymentMethodForm] = useState<Partial<QrPaymentOption>>({
    name: '',
    type: 'promptpay',
    enabled: true,
    accountNumber: '',
    accountName: '',
    instructions: ''
  });

  const handleTogglePaymentMethod = (id: string) => {
    const updated = configuredPaymentMethods.map(m =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    );
    updateSettings({ qrPaymentMethods: updated });
  };

  const handleOpenEditPaymentMethod = (method: QrPaymentOption) => {
    setEditingPaymentMethod(method);
    setPaymentMethodForm({ ...method });
  };

  const handleOpenAddPaymentMethod = () => {
    setEditingPaymentMethod(null);
    setPaymentMethodForm({
      id: `custom-${Date.now()}`,
      name: '',
      type: 'promptpay',
      enabled: true,
      accountNumber: '',
      accountName: settings.shopName || 'ร้านครัวกะเพรา POS',
      instructions: ''
    });
    setIsAddPaymentMethodOpen(true);
  };

  const handleSavePaymentMethodForm = () => {
    if (!paymentMethodForm.name?.trim()) return;
    const isEditing = !!editingPaymentMethod;
    const targetId = isEditing ? editingPaymentMethod.id : (paymentMethodForm.id || `custom-${Date.now()}`);

    const newOption: QrPaymentOption = {
      id: targetId,
      name: paymentMethodForm.name.trim(),
      type: paymentMethodForm.type || 'promptpay',
      enabled: paymentMethodForm.enabled ?? true,
      accountNumber: paymentMethodForm.accountNumber?.trim() || '',
      accountName: paymentMethodForm.accountName?.trim() || '',
      instructions: paymentMethodForm.instructions?.trim() || ''
    };

    let updatedList: QrPaymentOption[];
    if (isEditing) {
      updatedList = configuredPaymentMethods.map(m => m.id === targetId ? newOption : m);
    } else {
      updatedList = [...configuredPaymentMethods, newOption];
    }

    updateSettings({ qrPaymentMethods: updatedList });
    setEditingPaymentMethod(null);
    setIsAddPaymentMethodOpen(false);
  };

  const handleDeletePaymentMethod = (id: string) => {
    const updated = configuredPaymentMethods.filter(m => m.id !== id);
    updateSettings({ qrPaymentMethods: updated });
  };

  const [selectedPrintTable, setSelectedPrintTable] = useState<string | null>(null);
  const [selectedSimTable, setSelectedSimTable] = useState<string | null>('5');
  const [copiedTable, setCopiedTable] = useState<string | null>(null);
  const [isEditTableMode, setIsEditTableMode] = useState<boolean>(false);
  const [newTableNameInput, setNewTableNameInput] = useState<string>('');

  // Customer Ordering Simulation State
  const [simCart, setSimCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isViewCartOpen, setIsViewCartOpen] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customerNickname, setCustomerNickname] = useState<string>('');

  // Auto-open table ordering modal if ?table= parameter exists in URL (e.g. scanned from real camera)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tableParam = params.get('table') || params.get('qr');
      if (tableParam) {
        handleOpenSim(tableParam);
      }
    }
  }, []);

  const handleCopyLink = (table: string) => {
    const url = getTableOrderUrl(table);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedTable(table);
      setTimeout(() => setCopiedTable(null), 2500);
    });
  };

  const handleAddTable = () => {
    if (!newTableNameInput.trim()) return;
    addTable(newTableNameInput.trim());
    setNewTableNameInput('');
  };

  // Custom Modals for Table Edit & Delete
  const [editingTableTarget, setEditingTableTarget] = useState<string | null>(null);
  const [editingTableNewName, setEditingTableNewName] = useState<string>('');
  const [deletingTableTarget, setDeletingTableTarget] = useState<string | null>(null);

  const handleOpenEditTable = (table: string) => {
    setEditingTableTarget(table);
    setEditingTableNewName(table);
  };

  const handleSaveEditTable = () => {
    if (editingTableTarget && editingTableNewName.trim()) {
      const newName = editingTableNewName.trim();
      updateTable(editingTableTarget, newName);
      if (selectedSimTable === editingTableTarget) {
        setSelectedSimTable(newName);
      }
      if (selectedPrintTable === editingTableTarget) {
        setSelectedPrintTable(newName);
      }
      setEditingTableTarget(null);
      setEditingTableNewName('');
    }
  };

  const handleOpenDeleteTable = (table: string) => {
    setDeletingTableTarget(table);
  };

  const handleConfirmDeleteTable = () => {
    if (deletingTableTarget) {
      deleteTable(deletingTableTarget);
      if (selectedSimTable === deletingTableTarget) {
        setSelectedSimTable(null);
      }
      if (selectedPrintTable === deletingTableTarget) {
        setSelectedPrintTable(null);
      }
      setDeletingTableTarget(null);
    }
  };

  // Customization modal state inside phone
  const [simQuantity, setSimQuantity] = useState(1);
  const [simSpiceLevel, setSimSpiceLevel] = useState<SpiceLevel | undefined>('เผ็ดปานกลาง');
  const [simProtein, setSimProtein] = useState<{ name: ProteinChoice; extraPrice: number } | null>(null);
  const [simSelectedAddOns, setSimSelectedAddOns] = useState<AddOnOption[]>([]);
  const [simNotes, setSimNotes] = useState('');
  const [simPaymentMethod, setSimPaymentMethod] = useState<PaymentMethod>('promptpay');
  const [selectedQrOptionId, setSelectedQrOptionId] = useState<string>('promptpay');
  const [orderSuccessTicket, setOrderSuccessTicket] = useState<{ orderNumber: string; table: string; total: number; paymentMethod: PaymentMethod } | null>(null);

  // Featured / Primary Addon for QR Ordering simulator
  const primarySimAddon: AddOnOption | null = (addOns && addOns.length > 0)
    ? (addOns.find(a => a.id === 'add-egg-fried' || a.name === 'เพิ่มไข่ดาว') || addOns[0])
    : null;

  const simOtherAddOns = (addOns || []).filter(a => !primarySimAddon || a.id !== primarySimAddon.id);

  const handleOpenSim = (table: string) => {
    setSelectedSimTable(table);
    setSimCart([]);
    const firstActive = configuredPaymentMethods.find(m => m.enabled);
    if (firstActive) {
      setSelectedQrOptionId(firstActive.id);
      if (firstActive.type === 'promptpay' || firstActive.type === 'cash' || firstActive.type === 'credit' || firstActive.type === 'truemoney') {
        setSimPaymentMethod(firstActive.type);
      } else {
        setSimPaymentMethod('transfer');
      }
    } else {
      setSimPaymentMethod('promptpay');
    }
    setIsViewCartOpen(false);
    setOrderSuccessTicket(null);
  };

  const handleOpenCustomizer = (item: MenuItem) => {
    setCustomizingItem(item);
    setSimQuantity(1);
    if (item.category === 'drinks_dessert') {
      setSimSpiceLevel(undefined);
      setSimProtein(null);
    } else {
      setSimSpiceLevel('เผ็ดปานกลาง');
      setSimProtein(null);
    }
    setSimSelectedAddOns([]);
    setSimNotes('');
  };

  const handleToggleAddOn = (addon: AddOnOption) => {
    setSimSelectedAddOns(prev => {
      const exists = prev.some(a => a.id === addon.id);
      if (exists) {
        return prev.filter(a => a.id !== addon.id);
      }
      return [...prev, addon];
    });
  };

  const isPrimarySimSelected = primarySimAddon ? simSelectedAddOns.some(
    a => a.id === primarySimAddon.id
  ) : false;

  const handleAddCustomizedToSimCart = () => {
    if (!customizingItem) return;
    const proteinExtra = simProtein ? simProtein.extraPrice : 0;
    const addOnsTotal = simSelectedAddOns.reduce((sum, a) => sum + a.price, 0);
    const unitPrice = customizingItem.price + proteinExtra + addOnsTotal;
    const itemTotalPrice = unitPrice * simQuantity;

    const newCartItem: CartItem = {
      cartItemId: `sim-cart-${Date.now()}-${Math.random()}`,
      menuItem: customizingItem,
      quantity: simQuantity,
      spiceLevel: simSpiceLevel,
      proteinChoice: simProtein || undefined,
      selectedAddOns: simSelectedAddOns,
      specialNotes: simNotes,
      unitPrice,
      totalPrice: itemTotalPrice
    };

    setSimCart(prev => [...prev, newCartItem]);
    setCustomizingItem(null);
  };

  const handleSubmitSimOrder = () => {
    if (!selectedSimTable || simCart.length === 0) return;
    const grandTotal = simCart.reduce((sum, item) => sum + item.totalPrice, 0);
    const initialStatus = autoApproveQR ? 'pending' : 'pending-qr';
    
    const created = createDirectOrder(
      simCart,
      selectedSimTable,
      'dine-in',
      simNotes || 'สั่งผ่าน QR Code',
      initialStatus,
      customerNickname.trim() || undefined,
      simPaymentMethod
    );
    
    setOrderSuccessTicket({
      orderNumber: created.orderNumber,
      table: selectedSimTable,
      total: grandTotal,
      paymentMethod: simPaymentMethod
    });
    setSimCart([]);
    setIsViewCartOpen(false);
  };

  // Filter menu items for sim view
  const filteredMenuItems = menuItems.filter(item => {
    const matchCategory = isItemInCategory(item, selectedCategory, categories);
    const matchSearch = searchQuery.trim() === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const proteinOptions: { name: ProteinChoice; extraPrice: number }[] = [
    { name: 'หมูสับ', extraPrice: 0 },
    { name: 'ไก่ชิ้น', extraPrice: 0 },
    { name: 'หมูกรอบ', extraPrice: 25 },
    { name: 'เนื้อสไลส์', extraPrice: 25 },
    { name: 'กุ้ง+หมึก', extraPrice: 30 },
  ];

  const spiceLevels: SpiceLevel[] = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปานกลาง', 'เผ็ดมาก', 'เผ็ดหูดับ'];

  // Orders for verification card
  const pendingQrOrders = orders.filter(o => o.status === 'pending-qr');
  const approvedQrOrders = orders.filter(
    o => (o.status === 'pending' || o.status === 'cooking') && 
    (o.discountNote?.includes('ลูกค้า') || o.discountNote?.includes('QR'))
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200 text-slate-100">
      
      {/* 1. Header Card with Enterprise Badge and Auto-Approve Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 p-2.5 flex items-center justify-center shadow-lg shadow-orange-950/50 border border-orange-400/30 shrink-0">
            <QrCode className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-100">
                ระบบสแกนสั่งอาหารผ่านคิวอาร์โค้ด
              </h2>
              <span className="bg-red-600/90 text-white font-black text-[10px] tracking-wider px-2 py-0.5 rounded-md uppercase">
                ENTERPRISE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              สร้างคิวอาร์โค้ดประจำโต๊ะ, ตรวจรับออเดอร์เรียลไทม์ และจำลองหน้าจอฝั่งมือถือลูกค้า
            </p>
          </div>
        </div>

        {/* Auto Approve Toggle Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between space-x-4 shrink-0">
          <div className="text-xs">
            <span className="text-slate-200 font-bold block">อนุมัติอัตโนมัติ (Auto-Approve):</span>
            <span className="text-[10px] text-slate-400">
              {autoApproveQR ? 'ส่งเข้าครัวทันทีเมื่อสั่ง' : 'ต้องให้พนักงานกดยืนยัน'}
            </span>
          </div>
          <button
            onClick={() => setAutoApproveQR(!autoApproveQR)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoApproveQR ? 'bg-amber-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoApproveQR ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. Live QR Order Verification Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Pending Verification Orders */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-slate-200 text-sm">
                  ⏱ ตรวจรับคิวอาร์ออเดอร์ ({pendingQrOrders.length})
                </h3>
              </div>
            </div>

            {pendingQrOrders.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <QrCode className="w-10 h-10 text-slate-700 mx-auto opacity-40" />
                <div className="text-slate-300 font-bold text-xs">ยังไม่มีออเดอร์ค้างสแกนเข้ามา</div>
                <div className="text-slate-500 text-[11px] max-w-xs mx-auto">
                  ออเดอร์ที่ถูกสั่งซื้อจากลูกค้าจะปรากฏตรงนี้เพื่อให้พนักงานยืนยัน
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {pendingQrOrders.map(o => (
                  <div key={o.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-xs text-amber-400 flex items-center space-x-2">
                          <span>{o.orderNumber} • โต๊ะ {o.tableNumber || '-'}</span>
                          {renderPaymentMethodBadge(o.paymentMethod)}
                        </div>
                        <div className="text-[11px] text-slate-300">{o.discountNote}</div>
                      </div>
                      <span className="font-mono font-bold text-xs text-emerald-400">฿{o.grandTotal}</span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-0.5">
                      {o.items.map((it, idx) => (
                        <div key={idx}>• {it.menuItem.name} x{it.quantity} ({it.spiceLevel}, {it.proteinChoice?.name})</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => updateOrderStatus(o.id, 'pending')}
                        className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>อนุมัติออเดอร์</span>
                      </button>
                      <button
                        onClick={() => updateOrderStatus(o.id, 'cancelled')}
                        className="py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>ยกเลิก</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: Approved QR Orders */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
              <div className="flex items-center space-x-2">
                <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <h3 className="font-bold text-slate-200 text-sm">
                  ▶ ออเดอร์คิวอาร์ที่อนุมัติแล้ว ({approvedQrOrders.length})
                </h3>
              </div>
            </div>

            {approvedQrOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs font-medium">
                ไม่มีออเดอร์คิวอาร์ที่กำลังปรุง
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {approvedQrOrders.map(o => (
                  <div key={o.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-100 flex items-center space-x-2">
                        <span>{o.orderNumber} • โต๊ะ {o.tableNumber}</span>
                        {renderPaymentMethodBadge(o.paymentMethod)}
                      </div>
                      <div className="text-[10px] text-slate-400">{o.items.map(i => i.menuItem.name).join(', ')}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                        {o.status === 'cooking' ? 'กำลังปรุง' : 'รอคิวทำ'}
                      </span>
                      <div className="font-mono text-xs font-bold text-emerald-400 mt-1">฿{o.grandTotal}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Bottom Bar Simulator Quick Trigger */}
        <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <Smartphone className="w-4 h-4 text-red-500" />
            <span>หน้าจำลองลูกค้าสแกนโต๊ะ <strong className="text-amber-400 font-bold">{selectedSimTable || '5'}</strong></span>
          </div>
          <button
            onClick={() => handleOpenSim(selectedSimTable || tables[0] || '5')}
            className="text-amber-400 font-bold hover:underline transition"
          >
            จำลองการทดสอบ →
          </button>
        </div>
      </div>

      {/* 3. Payment Methods Configuration Section (ตั้งค่าช่องทางการชำระเงินสำหรับลูกค้า) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-slate-100 text-base">
                ตั้งค่าช่องทางการชำระเงินคิวอาร์ (Payment Methods Configuration)
              </h3>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold text-[10px] px-2 py-0.5 rounded-md">
                เปิดใช้งาน {configuredPaymentMethods.filter(m => m.enabled).length}/{configuredPaymentMethods.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              กำหนดและเปิด/ปิด ตัวเลือกการชำระเงิน (เช่น พร้อมเพย์, TrueMoney Wallet, Rabbit LINE Pay, จ่ายเคาน์เตอร์, บัตรเครดิต) ที่จะแสดงให้ลูกค้าเลือกในหน้าสั่งอาหาร
            </p>
          </div>

          <button
            onClick={handleOpenAddPaymentMethod}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มช่องทางชำระเงิน +</span>
          </button>
        </div>

        {/* Payment Methods Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {configuredPaymentMethods.map(method => {
            const isPromptPay = method.type === 'promptpay';
            const isTrueMoney = method.type === 'truemoney';
            const isLinePay = method.type === 'linepay';
            const isCash = method.type === 'cash';
            const isCredit = method.type === 'credit';

            let brandBg = 'bg-slate-950/80 border-slate-800';
            let brandBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
            let IconComponent = Landmark;

            if (isPromptPay) {
              brandBg = method.enabled ? 'bg-blue-950/30 border-blue-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
              IconComponent = QrCode;
            } else if (isTrueMoney) {
              brandBg = method.enabled ? 'bg-orange-950/30 border-orange-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-orange-500/20 text-orange-300 border-orange-500/30';
              IconComponent = Wallet;
            } else if (isLinePay) {
              brandBg = method.enabled ? 'bg-emerald-950/30 border-emerald-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
              IconComponent = QrCode;
            } else if (isCash) {
              brandBg = method.enabled ? 'bg-emerald-950/30 border-emerald-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
              IconComponent = Banknote;
            } else if (isCredit) {
              brandBg = method.enabled ? 'bg-purple-950/30 border-purple-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
              IconComponent = CreditCard;
            } else {
              brandBg = method.enabled ? 'bg-amber-950/30 border-amber-900/60' : 'bg-slate-950/40 border-slate-800/80';
              brandBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
              IconComponent = Landmark;
            }

            return (
              <div
                key={method.id}
                className={`p-4 rounded-2xl border transition relative flex flex-col justify-between space-y-3 ${brandBg} ${
                  method.enabled ? 'shadow-md opacity-100' : 'opacity-60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 border ${brandBadgeClass}`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm text-slate-100 truncate">{method.name}</span>
                    </div>

                    {/* Active Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentMethod(method.id)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        method.enabled ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                      title={method.enabled ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          method.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Details Block */}
                  <div className="text-xs space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
                    {method.accountNumber && (
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400 text-[11px]">เลขบัญชี/เบอร์:</span>
                        <strong className="font-mono text-amber-400 font-bold">{method.accountNumber}</strong>
                      </div>
                    )}
                    {method.accountName && (
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400 text-[11px]">ชื่อบัญชี:</span>
                        <span className="text-slate-200 font-medium truncate max-w-[140px]">{method.accountName}</span>
                      </div>
                    )}
                    {method.instructions && (
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 line-clamp-2 italic">
                        "{method.instructions}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    method.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {method.enabled ? '• แสดงในหน้าลูกค้า' : '• ซ่อนอยู่'}
                  </span>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEditPaymentMethod(method)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg border border-slate-700 transition flex items-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>แก้ไข</span>
                    </button>

                    {method.id.startsWith('custom-') && (
                      <button
                        onClick={() => handleDeletePaymentMethod(method.id)}
                        className="p-1 bg-rose-950/80 hover:bg-rose-900 text-rose-400 rounded-lg border border-rose-800/50 transition"
                        title="ลบช่องทางชำระเงิน"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method Add/Edit Modal */}
      {(editingPaymentMethod !== null || isAddPaymentMethodOpen) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-slate-100">
                  {editingPaymentMethod ? 'แก้ไขช่องทางชำระเงิน' : 'เพิ่มช่องทางชำระเงินใหม่'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setEditingPaymentMethod(null);
                  setIsAddPaymentMethodOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">ชื่อช่องทางการชำระเงิน (Title)</label>
                <input
                  type="text"
                  placeholder="เช่น พร้อมเพย์ QR, TrueMoney Wallet, K-Bank..."
                  value={paymentMethodForm.name || ''}
                  onChange={e => setPaymentMethodForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ประเภทช่องทาง (Method Type)</label>
                <select
                  value={paymentMethodForm.type || 'promptpay'}
                  onChange={e => setPaymentMethodForm(p => ({ ...p, type: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="promptpay">พร้อมเพย์ (PromptPay QR)</option>
                  <option value="truemoney">TrueMoney Wallet</option>
                  <option value="linepay">Rabbit LINE Pay</option>
                  <option value="cash">ชำระเงินสด / เคาน์เตอร์ (Cash at Counter)</option>
                  <option value="credit">บัตรเครดิต/เดบิต (Credit / Debit Card)</option>
                  <option value="custom">โอนเงินธนาคาร / อื่นๆ (Bank Transfer / Custom)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">เลขบัญชี / เบอร์โทรศัพท์ / Merchant ID</label>
                <input
                  type="text"
                  placeholder="เช่น 081-234-5678 หรือ 123-4-56789-0"
                  value={paymentMethodForm.accountNumber || ''}
                  onChange={e => setPaymentMethodForm(p => ({ ...p, accountNumber: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ชื่อบัญชีผู้รับเงิน (Account Name)</label>
                <input
                  type="text"
                  placeholder="เช่น ร้านครัวกะเพรา POS, บจก. กะเพราเอ็นเตอร์ไพรส์"
                  value={paymentMethodForm.accountName || ''}
                  onChange={e => setPaymentMethodForm(p => ({ ...p, accountName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">คำแนะนำการชำระเงินสำหรับลูกค้า (Instructions)</label>
                <textarea
                  rows={2}
                  placeholder="เช่น สแกนคิวอาร์เพื่อโอนเงิน หรือ แจ้งสลิปกับพนักงาน..."
                  value={paymentMethodForm.instructions || ''}
                  onChange={e => setPaymentMethodForm(p => ({ ...p, instructions: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="font-bold text-slate-300">สถานะเปิดแสดงให้ลูกค้า:</span>
                <button
                  type="button"
                  onClick={() => setPaymentMethodForm(p => ({ ...p, enabled: !p.enabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    paymentMethodForm.enabled ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      paymentMethodForm.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEditingPaymentMethod(null);
                  setIsAddPaymentMethodOpen(false);
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSavePaymentMethodForm}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-1"
              >
                <Save className="w-4 h-4" />
                <span>บันทึกข้อมูล</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Table List & Management Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="font-bold text-slate-100 text-base">
              รายการโต๊ะอาหารทั้งหมด ({tables.length})
            </h3>
            <p className="text-xs text-slate-400">คลิกเลือกเพื่อดูคิวอาร์โค้ด</p>
          </div>

          <button
            onClick={() => setIsEditTableMode(!isEditTableMode)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border flex items-center space-x-1.5 transition ${
              isEditTableMode
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEditTableMode ? 'เสร็จสิ้นการจัดโต๊ะ' : 'โหมดจัดการ (แก้ไข/ลบ)'}</span>
          </button>
        </div>

        {/* Add Table Input Row */}
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="พิมพ์ชื่อโต๊ะใหม่... (เช่น 15, VIP-1, บาร์)"
            value={newTableNameInput}
            onChange={e => setNewTableNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTable()}
            className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-red-500"
          />
          <button
            onClick={handleAddTable}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl border border-slate-700 flex items-center space-x-1 transition shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>เพิ่มโต๊ะ +</span>
          </button>
        </div>

        {/* Table Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map(table => {
            const isSelected = selectedSimTable === table;
            return (
              <div
                key={table}
                onClick={() => !isEditTableMode && setSelectedSimTable(table)}
                className={`p-3.5 rounded-2xl border transition relative flex items-center justify-between cursor-pointer select-none ${
                  isSelected
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 border-orange-400 text-white shadow-lg shadow-orange-950/50 ring-2 ring-orange-400'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-100'
                }`}
              >
                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                    T-NO
                  </div>
                  <div className="text-xl font-black font-mono">
                    {table}
                  </div>
                </div>

                {isEditTableMode ? (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditTable(table);
                      }}
                      className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition"
                      title="แก้ไขชื่อโต๊ะ"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDeleteTable(table);
                      }}
                      className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-400 rounded-lg border border-rose-800/50 transition"
                      title="ลบโต๊ะ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPrintTable(table);
                    }}
                    className="p-1.5 bg-black/20 hover:bg-black/40 text-white/90 rounded-lg transition"
                    title="ดู/พิมพ์ QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL 1: PRINTABLE REAL SCANNABLE QR CODE CARD */}
      {selectedPrintTable && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-slate-100 text-sm">การ์ด QR Code ประจำโต๊ะ</h3>
              </div>
              <button
                onClick={() => setSelectedPrintTable(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Card Container */}
            <div
              id="printable-qr-card"
              className="printable-document bg-white text-slate-900 p-6 rounded-2xl shadow-xl border-2 border-slate-900 text-center space-y-3"
            >
              <div className="space-y-0.5">
                <div className="text-xs font-bold uppercase tracking-wider text-red-600">
                  {currentBranch.name}
                </div>
                <h4 className="text-xl font-black text-slate-900">ครัวกะเพรา POS</h4>
                <p className="text-[11px] text-slate-500">สแกนเพื่อสั่งอาหารและดูเมนูได้ทันที</p>
              </div>

              {/* REAL SCANNABLE QR CODE IMAGE */}
              <div
                onClick={() => {
                  const table = selectedPrintTable;
                  setSelectedPrintTable(null);
                  handleOpenSim(table);
                }}
                className="bg-slate-50 p-3 rounded-xl border border-slate-200 inline-block mx-auto shadow-sm cursor-pointer relative group"
                title="คลิกเพื่อสั่งอาหาร"
              >
                <img
                  src={getQrCodeImgSrc(selectedPrintTable, 300)}
                  alt={`QR Code โต๊ะ ${selectedPrintTable}`}
                  className="w-40 h-40 object-contain mx-auto"
                />
                <div className="absolute inset-0 bg-slate-950/80 rounded-xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-amber-300 font-bold text-xs p-2">
                  คลิกเพื่อเปิดสั่งอาหาร
                </div>
              </div>

              <div className="bg-red-600 text-white font-black text-lg py-1.5 rounded-xl uppercase tracking-widest shadow-sm">
                โต๊ะ {selectedPrintTable}
              </div>

              <p className="text-[10px] text-slate-500 font-medium">
                * ใช้กล้องมือถือ (iOS/Android) สแกนเพื่อเลือกเมนูและสั่งอาหารได้ทันที
              </p>
            </div>

            {/* Copy Link Bar */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <span className="truncate text-[10px] font-mono text-slate-400 max-w-[200px]">
                {getTableOrderUrl(selectedPrintTable)}
              </span>
              <button
                onClick={() => handleCopyLink(selectedPrintTable)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-lg text-[11px] flex items-center space-x-1 shrink-0 transition"
              >
                {copiedTable === selectedPrintTable ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">คัดลอกแล้ว!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>คัดลอกลิงก์</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                onClick={() => exportToPNG('printable-qr-card', `QR-Table-${selectedPrintTable}`)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center space-x-1 transition"
                title="บันทึกรูปภาพ PNG"
              >
                <ImageIcon className="w-4 h-4" />
                <span>PNG</span>
              </button>

              <button
                onClick={() => exportToPDF('printable-qr-card', `QR-Table-${selectedPrintTable}`)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center space-x-1 transition"
                title="บันทึกไฟล์ PDF"
              >
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </button>

              <button
                onClick={() => window.print()}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center space-x-1.5 transition"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>พิมพ์</span>
              </button>

              <button
                onClick={() => {
                  const table = selectedPrintTable;
                  setSelectedPrintTable(null);
                  handleOpenSim(table);
                }}
                className="py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1 transition"
              >
                <Smartphone className="w-4 h-4" />
                <span>ลองสั่ง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SIMULATED CUSTOMER MOBILE QR ORDERING INTERFACE */}
      {selectedSimTable && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          {/* Simulated Smartphone Container */}
          <div className="bg-slate-900 border-4 border-slate-700 rounded-[36px] max-w-md w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden relative animate-in slide-in-from-bottom-6 duration-300">
            
            {/* Phone Top Speaker Bar */}
            <div className="bg-slate-950 text-slate-400 px-6 py-2 flex items-center justify-between text-[11px] font-mono border-b border-slate-800 shrink-0">
              <div className="flex items-center space-x-1 font-bold text-amber-400">
                <QrCode className="w-3.5 h-3.5" />
                <span>QR ORDER • โต๊ะ {selectedSimTable}</span>
              </div>
              <button
                onClick={() => setSelectedSimTable(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Header Banner */}
            <div className="bg-gradient-to-r from-red-950 via-slate-900 to-amber-950 p-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider">
                    {currentBranch.name}
                  </div>
                  <h3 className="text-base font-black text-slate-100 flex items-center space-x-1.5">
                    <Utensils className="w-4 h-4 text-red-500" />
                    <span>ครัวกะเพรา (Digital Menu)</span>
                  </h3>
                </div>
                <div className="bg-red-600/90 text-white px-2.5 py-1 rounded-xl font-extrabold text-xs shadow-md border border-red-400/30">
                  โต๊ะ {selectedSimTable}
                </div>
              </div>

              {/* Customer Nickname Input Box */}
              <div className="mt-2.5 bg-slate-950/90 border border-slate-800 rounded-2xl p-2.5 space-y-1">
                <label className="text-[11px] font-medium text-slate-300 block">
                  ลูกค้าสามารถใส่ชื่อเล่นแทนเลขโต๊ะ <span className="text-slate-400">(เพื่อเรียกคิว / พิมพ์บิล)</span>
                </label>
                <input
                  type="text"
                  placeholder="ใส่ชื่อเล่นของคุณ เช่น คุณมุก / เจ๊นุ่น / โต๊ะ 5 - บอล"
                  value={customerNickname}
                  onChange={e => setCustomerNickname(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-xl px-3 py-1.5 text-xs placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Category Pills Slider */}
              <div className="flex space-x-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-1 text-[11px]">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${
                    selectedCategory === 'all'
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ทั้งหมด
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${
                      selectedCategory === cat.id
                        ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-md'
                        : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Menu List Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-950/40">
              {filteredMenuItems.map(item => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <h4 className="font-bold text-slate-100 text-xs truncate">{item.name}</h4>
                      {item.isPopular && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-extrabold shrink-0">
                          ฮิต
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>
                    <div className="text-amber-400 font-extrabold text-xs mt-1">
                      ฿{item.price}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenCustomizer(item)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md transition shrink-0 flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เลือก</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Bottom Mobile Cart Floating Bar */}
            {simCart.length > 0 && !isViewCartOpen && (
              <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
                <button
                  onClick={() => setIsViewCartOpen(true)}
                  className="w-full py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs rounded-2xl shadow-lg flex items-center justify-between px-4 transition"
                >
                  <div className="flex items-center space-x-2">
                    <ShoppingBag className="w-4 h-4" />
                    <span>ดูตะกร้าสั่งอาหาร ({simCart.reduce((sum, i) => sum + i.quantity, 0)})</span>
                  </div>
                  <span className="font-mono text-sm font-black">
                    ฿{simCart.reduce((sum, i) => sum + i.totalPrice, 0)}
                  </span>
                </button>
              </div>
            )}

            {/* SUB-MODAL 1: ITEM CUSTOMIZER (INSIDE MOBILE PHONE) */}
            {customizingItem && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-30 flex flex-col justify-end">
                <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 space-y-4 max-h-[85%] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-slate-200">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm">{customizingItem.name}</h4>
                      <p className="text-[11px] text-amber-400 font-extrabold">เริ่มต้น ฿{customizingItem.price}</p>
                    </div>
                    <button
                      onClick={() => setCustomizingItem(null)}
                      className="text-slate-400 p-1 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-xs font-bold text-slate-300">จำนวน</span>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => setSimQuantity(Math.max(1, simQuantity - 1))}
                        className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="font-bold font-mono text-sm text-amber-400">{simQuantity}</span>
                      <button
                        onClick={() => setSimQuantity(simQuantity + 1)}
                        className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Featured / Primary Topping Toggle */}
                  {primarySimAddon && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                        ท็อปปิ้งแนะนำ (Featured Extra)
                      </label>
                      <div
                        onClick={() => handleToggleAddOn(primarySimAddon)}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition select-none ${
                          isPrimarySimSelected
                            ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-1 ring-amber-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className={`p-1.5 rounded-lg ${isPrimarySimSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-amber-400'}`}>
                            <Egg className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center space-x-1">
                              <span>{primarySimAddon.name}</span>
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-extrabold">+{primarySimAddon.price}฿</span>
                            </div>
                            <div className="text-[10px] text-slate-400">ท็อปปิ้งเพิ่มความอร่อย</div>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          isPrimarySimSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-900 border-slate-700'
                        }`}>
                          {isPrimarySimSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Other Add-on Toppings for QR Ordering */}
                  {simOtherAddOns.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        {primarySimAddon ? 'ตัวเลือกท็อปปิ้งเพิ่มเติม' : 'รายการท็อปปิ้ง'} ({simOtherAddOns.length} รายการ)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {simOtherAddOns.map(addon => {
                          const isSelected = simSelectedAddOns.some(a => a.id === addon.id);
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              onClick={() => handleToggleAddOn(addon)}
                              className={`p-2 rounded-xl border flex items-center justify-between text-left transition ${
                                isSelected
                                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate mr-1">
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-slate-700 bg-slate-900'
                                }`}>
                                  {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                                <span className="text-[11px] font-medium text-slate-200 truncate">{addon.name}</span>
                              </div>
                              <span className="text-[11px] font-bold text-amber-400 shrink-0">+{addon.price}฿</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">หมายเหตุเพิ่มเติม</label>
                    <input
                      type="text"
                      placeholder="เช่น ขอข้าวน้อย, ไม่ใส่กระเทียม"
                      value={simNotes}
                      onChange={e => setSimNotes(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-red-500"
                    />
                  </div>

                  {/* Add to Cart Button */}
                  <button
                    onClick={handleAddCustomizedToSimCart}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>เพิ่มลงตะกร้า • ฿{(customizingItem.price + (simProtein ? simProtein.extraPrice : 0) + simSelectedAddOns.reduce((s, a) => s + a.price, 0)) * simQuantity}</span>
                  </button>
                </div>
              </div>
            )}

            {/* SUB-MODAL 2: CUSTOMER BASKET & CHECKOUT DRAWER */}
            {isViewCartOpen && (
              <div className="absolute inset-0 bg-slate-950/95 z-40 flex flex-col p-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <ShoppingBag className="w-5 h-5 text-red-500" />
                    <h4 className="font-bold text-slate-100 text-sm">ตะกร้าสินค้า (โต๊ะ {selectedSimTable})</h4>
                  </div>
                  <button
                    onClick={() => setIsViewCartOpen(false)}
                    className="text-slate-400 p-1 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
                  {simCart.map(item => (
                    <div key={item.cartItemId} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5 text-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-xs text-slate-100">{item.menuItem.name} x{item.quantity}</div>
                          <div className="text-[10px] text-slate-400 space-x-1 mt-0.5">
                            <span>• {item.spiceLevel}</span>
                            {item.proteinChoice && <span>• {item.proteinChoice.name}</span>}
                          </div>
                          {item.selectedAddOns.length > 0 && (
                            <div className="text-[10px] text-amber-300 mt-0.5 font-medium">
                              + {item.selectedAddOns.map(a => a.name).join(', ')}
                            </div>
                          )}
                          {item.specialNotes && (
                            <div className="text-[10px] text-slate-400 italic">"{item.specialNotes}"</div>
                          )}
                        </div>
                        <span className="font-bold text-amber-400 text-xs font-mono">฿{item.totalPrice}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-3 shrink-0">
                  {/* Payment Method Selector */}
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <CreditCard className="w-4 h-4 text-amber-400" />
                        <span>ช่องทางการชำระเงิน (Payment Method)</span>
                      </span>
                      <span className="text-[10px] text-amber-400 font-bold">เลือกวิธีชำระ</span>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      {configuredPaymentMethods.filter(m => m.enabled).length === 0 ? (
                        <div className="col-span-2 p-3 bg-rose-950/40 border border-rose-900/50 rounded-xl text-xs text-rose-300 text-center">
                          โปรดติดต่อพนักงานที่เคาน์เตอร์เพื่อชำระเงิน
                        </div>
                      ) : (
                        configuredPaymentMethods.filter(m => m.enabled).map(method => {
                          const isSelected = selectedQrOptionId === method.id || (simPaymentMethod === method.type && !selectedQrOptionId);

                          let colorStyle = 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700';
                          let iconBg = 'bg-slate-800 text-slate-400';
                          let IconComp = Landmark;

                          if (method.type === 'promptpay') {
                            IconComp = QrCode;
                            if (isSelected) {
                              colorStyle = 'bg-blue-950/80 border-blue-500 text-blue-200 ring-1 ring-blue-500';
                              iconBg = 'bg-blue-500 text-white';
                            }
                          } else if (method.type === 'truemoney') {
                            IconComp = Wallet;
                            if (isSelected) {
                              colorStyle = 'bg-orange-950/80 border-orange-500 text-orange-200 ring-1 ring-orange-500';
                              iconBg = 'bg-orange-500 text-white';
                            }
                          } else if (method.type === 'linepay') {
                            IconComp = QrCode;
                            if (isSelected) {
                              colorStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500';
                              iconBg = 'bg-emerald-500 text-white';
                            }
                          } else if (method.type === 'cash') {
                            IconComp = Banknote;
                            if (isSelected) {
                              colorStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500';
                              iconBg = 'bg-emerald-500 text-white';
                            }
                          } else if (method.type === 'credit') {
                            IconComp = CreditCard;
                            if (isSelected) {
                              colorStyle = 'bg-purple-950/80 border-purple-500 text-purple-200 ring-1 ring-purple-500';
                              iconBg = 'bg-purple-500 text-white';
                            }
                          } else {
                            IconComp = Landmark;
                            if (isSelected) {
                              colorStyle = 'bg-amber-950/80 border-amber-500 text-amber-200 ring-1 ring-amber-500';
                              iconBg = 'bg-amber-500 text-slate-950';
                            }
                          }

                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => {
                                setSelectedQrOptionId(method.id);
                                if (method.type === 'promptpay' || method.type === 'cash' || method.type === 'credit' || method.type === 'truemoney') {
                                  setSimPaymentMethod(method.type);
                                } else {
                                  setSimPaymentMethod('transfer');
                                }
                              }}
                              className={`p-2 rounded-xl border text-left flex items-center space-x-2 transition ${colorStyle}`}
                            >
                              <div className={`p-1.5 rounded-lg shrink-0 ${iconBg}`}>
                                <IconComp className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-[11px] leading-tight truncate">{method.name}</div>
                                <div className="text-[9px] opacity-75 truncate">
                                  {method.accountNumber || method.type}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Payment Info Preview Details for currently selected active option */}
                    {(() => {
                      const activeMethods = configuredPaymentMethods.filter(m => m.enabled);
                      const currentOption = activeMethods.find(m => m.id === selectedQrOptionId) || activeMethods[0];
                      if (!currentOption) return null;

                      if (currentOption.type === 'promptpay') {
                        return (
                          <div className="bg-slate-900 border border-blue-900/50 p-2.5 rounded-2xl text-center space-y-1.5 animate-in fade-in duration-150">
                            <div className="bg-white p-2 rounded-xl inline-block shadow-sm">
                              <img
                                src={getPromptPayQrCodeImgSrc(simCart.reduce((s, i) => s + i.totalPrice, 0), currentOption.accountNumber || '0812345678')}
                                alt="PromptPay QR"
                                className="w-28 h-28 object-contain mx-auto"
                              />
                            </div>
                            <div className="text-[10px] text-slate-300">
                              <span className="font-bold text-blue-300">{currentOption.accountName || settings.shopName}</span> • พร้อมเพย์: <strong className="text-amber-400 font-mono">{currentOption.accountNumber || '081-234-5678'}</strong>
                            </div>
                            {currentOption.instructions && (
                              <div className="text-[9px] text-slate-400 italic">{currentOption.instructions}</div>
                            )}
                          </div>
                        );
                      }

                      if (currentOption.type === 'truemoney') {
                        return (
                          <div className="bg-slate-900 border border-orange-900/50 p-2.5 rounded-2xl text-[11px] text-slate-300 space-y-1.5 text-center animate-in fade-in duration-150">
                            <div className="bg-white p-2 rounded-xl inline-block shadow-sm">
                              <img
                                src={getPromptPayQrCodeImgSrc(simCart.reduce((s, i) => s + i.totalPrice, 0), currentOption.accountNumber || '0812345678')}
                                alt="TrueMoney QR"
                                className="w-24 h-24 object-contain mx-auto"
                              />
                            </div>
                            <div>โอนผ่าน TrueMoney Wallet: <strong className="text-amber-400 font-mono">{currentOption.accountNumber || '081-234-5678'}</strong></div>
                            {currentOption.accountName && <div className="text-[9px] text-slate-400">ชื่อบัญชี: {currentOption.accountName}</div>}
                            {currentOption.instructions && <div className="text-[9px] text-amber-300/90 italic">{currentOption.instructions}</div>}
                          </div>
                        );
                      }

                      if (currentOption.type === 'linepay') {
                        return (
                          <div className="bg-slate-900 border border-emerald-900/50 p-2.5 rounded-2xl text-[11px] text-slate-300 space-y-1 text-center animate-in fade-in duration-150">
                            <div className="font-bold text-emerald-400">Rabbit LINE Pay</div>
                            <div>ID / Merchant: <strong className="text-amber-400 font-mono">{currentOption.accountNumber}</strong></div>
                            {currentOption.accountName && <div className="text-[9px] text-slate-400">ร้าน: {currentOption.accountName}</div>}
                            {currentOption.instructions && <div className="text-[9px] text-slate-400 italic">{currentOption.instructions}</div>}
                          </div>
                        );
                      }

                      if (currentOption.type === 'cash') {
                        return (
                          <div className="bg-slate-900 border border-emerald-900/50 p-2.5 rounded-2xl text-[11px] text-slate-300 flex items-center space-x-2 animate-in fade-in duration-150">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{currentOption.instructions || 'สั่งอาหารเข้าครัวได้เลย ชำระเงินสดหรือแสกนที่เคาน์เตอร์แคชเชียร์หลังรับประทานเสร็จ'}</span>
                          </div>
                        );
                      }

                      if (currentOption.type === 'credit') {
                        return (
                          <div className="bg-slate-900 border border-purple-900/50 p-2.5 rounded-2xl text-[11px] text-slate-300 flex items-center space-x-2 animate-in fade-in duration-150">
                            <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
                            <span>{currentOption.instructions || 'รองรับ Visa, Mastercard, JCB พนักงานจะนำเครื่องแตะบัตรมาให้บริการที่โต๊ะ'}</span>
                          </div>
                        );
                      }

                      return (
                        <div className="bg-slate-900 border border-amber-900/50 p-2.5 rounded-2xl text-[11px] text-slate-300 space-y-1 text-center animate-in fade-in duration-150">
                          <div className="font-bold text-amber-400">{currentOption.name}</div>
                          {currentOption.accountNumber && <div>เลขบัญชี/ID: <strong className="text-amber-400 font-mono">{currentOption.accountNumber}</strong></div>}
                          {currentOption.accountName && <div className="text-[9px] text-slate-400">ชื่อบัญชี: {currentOption.accountName}</div>}
                          {currentOption.instructions && <div className="text-[9px] text-slate-300 italic">{currentOption.instructions}</div>}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex justify-between items-center text-sm font-black text-slate-100 border-t border-slate-800/80 pt-2">
                    <span>ยอดรวมทั้งสิ้น</span>
                    <span className="text-amber-400 font-mono text-base">฿{simCart.reduce((sum, i) => sum + i.totalPrice, 0)}</span>
                  </div>

                  <button
                    onClick={handleSubmitSimOrder}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-2xl shadow-xl flex items-center justify-center space-x-2 transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>ส่งออเดอร์เข้าครัว (Send Order to Kitchen)</span>
                  </button>
                </div>
              </div>
            )}

            {/* SUB-MODAL 3: ORDER SUCCESS TICKET OVERLAY */}
            {orderSuccessTicket && (
              <div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
                <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-100">ส่งออเดอร์เข้าครัวสำเร็จ!</h3>
                  <p className="text-xs text-slate-400">ออเดอร์ของคุณถูกส่งไปยังหน้าจอห้องครัว (KDS) เรียบร้อยแล้ว</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl w-full text-left space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>เลขที่ออเดอร์:</span>
                    <span className="font-bold text-amber-400">{orderSuccessTicket.orderNumber}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>โต๊ะนั่ง:</span>
                    <span className="font-bold text-slate-100">โต๊ะ {orderSuccessTicket.table}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>วิธีชำระเงิน:</span>
                    <span className="font-bold text-blue-300">
                      {orderSuccessTicket.paymentMethod === 'promptpay' && 'พร้อมเพย์ QR'}
                      {orderSuccessTicket.paymentMethod === 'cash' && 'ชำระที่เคาน์เตอร์'}
                      {orderSuccessTicket.paymentMethod === 'credit' && 'บัตรเครดิต/เดบิต'}
                      {orderSuccessTicket.paymentMethod === 'truemoney' && 'TrueMoney Wallet'}
                      {orderSuccessTicket.paymentMethod === 'transfer' && 'โอนเงินธนาคาร'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-2">
                    <span>ยอดรวมสุทธิ:</span>
                    <span className="font-bold text-emerald-400 text-sm">฿{orderSuccessTicket.total}</span>
                  </div>
                </div>

                {orderSuccessTicket.paymentMethod === 'cash' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl text-[11px] text-emerald-300 space-y-1 text-left w-full">
                    <div className="font-bold flex items-center space-x-1.5 text-emerald-400">
                      <Banknote className="w-4 h-4" />
                      <span>ชำระเงินสดที่เคาน์เตอร์แคชเชียร์</span>
                    </div>
                    <p className="text-slate-300">
                      ลูกค้าสามารถทานอาหารก่อน แล้วแจ้งเลขโต๊ะ <strong>({orderSuccessTicket.table})</strong> หรือแสดงหน้านี้เพื่อชำระเงินสด/สแกนจ่ายที่เคาน์เตอร์ได้ทันที
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setOrderSuccessTicket(null)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl transition"
                >
                  สั่งรายการเพิ่มเติม
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL EDIT TABLE NAME */}
      {editingTableTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Edit2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-100 text-base">แก้ไขชื่อโต๊ะ</h3>
              </div>
              <button
                onClick={() => setEditingTableTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">ชื่อโต๊ะใหม่ (เดิม: โต๊ะ {editingTableTarget}):</label>
              <input
                type="text"
                value={editingTableNewName}
                onChange={e => setEditingTableNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveEditTable()}
                placeholder="พิมพ์ชื่อโต๊ะใหม่..."
                autoFocus
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setEditingTableTarget(null)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEditTable}
                disabled={!editingTableNewName.trim()}
                className="py-2.5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold text-xs rounded-xl shadow-lg transition disabled:opacity-50"
              >
                บันทึกชื่อโต๊ะ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DELETE TABLE CONFIRMATION */}
      {deletingTableTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center space-x-3 text-rose-500 border-b border-slate-800 pb-3">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">ยืนยันลบโต๊ะ {deletingTableTarget}?</h3>
                <p className="text-xs text-rose-400 mt-0.5">คิวอาร์โค้ดของโต๊ะนี้จะไม่สามารถสแกนได้อีกต่อไป</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800">
              คุณกำลังจะลบ <strong className="text-amber-400">"โต๊ะ {deletingTableTarget}"</strong> ออกจากระบบ POS
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setDeletingTableTarget(null)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmDeleteTable}
                className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                ยืนยันลบโต๊ะ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// 3. Menu, Toppings & Recipe Costing View (เมนู, Toppings และสูตรตัดสต๊อก)
export const RecipeCostingView: React.FC = () => {
  const {
    menuItems,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    getCategoryName,
    syncCategoriesFromMenu,
    addOns,
    ingredients,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    updateMenuItemRecipe,
    addAddOn,
    updateAddOn,
    deleteAddOn
  } = usePOS();

  const [activeSubTab, setActiveSubTab] = useState<'menu' | 'toppings' | 'recipes' | 'bulk_edit' | 'ai_engineering'>('bulk_edit');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Category Manager Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatNameInput, setNewCatNameInput] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatNameInput, setEditingCatNameInput] = useState('');

  // Menu Modal State
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [menuFormName, setMenuFormName] = useState('');
  const [menuFormCategory, setMenuFormCategory] = useState<MenuCategory>('kaprao');
  const [menuFormPrice, setMenuFormPrice] = useState<number>(65);
  const [menuFormImage, setMenuFormImage] = useState('');
  const [menuFormDescription, setMenuFormDescription] = useState('');

  // Topping Modal State
  const [isToppingModalOpen, setIsToppingModalOpen] = useState(false);
  const [editingTopping, setEditingTopping] = useState<AddOnOption | null>(null);
  const [toppingFormName, setToppingFormName] = useState('');
  const [toppingFormPrice, setToppingFormPrice] = useState<number>(10);
  const [toppingFormRecipe, setToppingFormRecipe] = useState<RecipeIngredient[]>([]);
  const [toppingSelectedIngToAdd, setToppingSelectedIngToAdd] = useState<string>('');

  // Delete Confirmation Modal State
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: 'menu' | 'topping';
    id: string;
    name: string;
  } | null>(null);

  // Recipe Editor State
  const [selectedRecipeMenuItemId, setSelectedRecipeMenuItemId] = useState<string>(
    menuItems[0]?.id || ''
  );
  const [editableRecipe, setEditableRecipe] = useState<RecipeIngredient[]>([]);

  // Selected Menu Item for Recipe view
  const currentRecipeMenuItem = menuItems.find(m => m.id === selectedRecipeMenuItemId) || menuItems[0];

  // Sync editableRecipe when selected menu item changes
  useEffect(() => {
    if (currentRecipeMenuItem) {
      setEditableRecipe(currentRecipeMenuItem.recipe ? [...currentRecipeMenuItem.recipe] : []);
    }
  }, [selectedRecipeMenuItemId]);

  // Handlers for Menu Item
  const handleOpenAddMenu = () => {
    setEditingMenuItem(null);
    setMenuFormName('');
    setMenuFormCategory(categories[0]?.id || 'kaprao');
    setMenuFormPrice(65);
    setMenuFormImage('https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop');
    setMenuFormDescription('');
    setIsMenuModalOpen(true);
  };

  const handleOpenEditMenu = (item: MenuItem) => {
    setEditingMenuItem(item);
    setMenuFormName(item.name);
    setMenuFormCategory(item.category);
    setMenuFormPrice(item.price);
    setMenuFormImage(item.image);
    setMenuFormDescription(item.description);
    setIsMenuModalOpen(true);
  };

  const handleSaveMenu = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuFormName.trim()) return;

    if (editingMenuItem) {
      updateMenuItem({
        ...editingMenuItem,
        name: menuFormName,
        category: menuFormCategory,
        price: Number(menuFormPrice),
        image: menuFormImage || 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop',
        description: menuFormDescription
      });
    } else {
      addMenuItem({
        name: menuFormName,
        nameEn: menuFormName,
        category: menuFormCategory,
        price: Number(menuFormPrice),
        costPrice: 20,
        image: menuFormImage || 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop',
        description: menuFormDescription,
        recipe: [
          { ingredientId: ingredients[0]?.id || 'ing-pork-minced', amountNeeded: 100 }
        ]
      });
    }
    setIsMenuModalOpen(false);
  };

  const handleDeleteMenu = (item: MenuItem) => {
    setDeleteConfirmItem({
      type: 'menu',
      id: item.id,
      name: item.name
    });
  };

  // Handlers for Topping
  const handleOpenAddTopping = () => {
    setEditingTopping(null);
    setToppingFormName('');
    setToppingFormPrice(10);
    setToppingFormRecipe([]);
    setToppingSelectedIngToAdd(ingredients[0]?.id || '');
    setIsToppingModalOpen(true);
  };

  const handleOpenEditTopping = (topping: AddOnOption) => {
    setEditingTopping(topping);
    setToppingFormName(topping.name);
    setToppingFormPrice(topping.price);
    if (topping.recipe && topping.recipe.length > 0) {
      setToppingFormRecipe(topping.recipe);
    } else if (topping.ingredientId) {
      setToppingFormRecipe([{
        ingredientId: topping.ingredientId,
        amountNeeded: topping.ingredientAmount || 1
      }]);
    } else {
      setToppingFormRecipe([]);
    }
    setToppingSelectedIngToAdd(ingredients[0]?.id || '');
    setIsToppingModalOpen(true);
  };

  const handleAddToppingRecipeItem = () => {
    if (!toppingSelectedIngToAdd) return;
    if (toppingFormRecipe.some(r => r.ingredientId === toppingSelectedIngToAdd)) return;
    const ing = ingredients.find(i => i.id === toppingSelectedIngToAdd);
    let defaultUnit = ing?.unit || 'pcs';
    let defaultAmount = 1;
    if (['kg', 'กิโลกรัม', 'กก.'].includes(ing?.unit || '')) {
      defaultUnit = 'g';
      defaultAmount = 50;
    } else if (['l', 'liter', 'ลิตร'].includes(ing?.unit || '')) {
      defaultUnit = 'ml';
      defaultAmount = 10;
    }
    setToppingFormRecipe(prev => [...prev, { ingredientId: toppingSelectedIngToAdd, amountNeeded: defaultAmount, recipeUnit: defaultUnit }]);
  };

  const handleUpdateToppingRecipeAmount = (ingredientId: string, amountNeeded: number) => {
    setToppingFormRecipe(prev =>
      prev.map(r => (r.ingredientId === ingredientId ? { ...r, amountNeeded: Math.max(0, amountNeeded) } : r))
    );
  };

  const handleUpdateToppingRecipeUnit = (ingredientId: string, newUnit: string) => {
    setToppingFormRecipe(prev =>
      prev.map(r => {
        if (r.ingredientId !== ingredientId) return r;
        const ing = ingredients.find(i => i.id === ingredientId);
        const oldUnit = r.recipeUnit || ing?.unit || 'pcs';
        let newAmount = r.amountNeeded;

        if (oldUnit === 'kg' && newUnit === 'g') newAmount = r.amountNeeded * 1000;
        else if (oldUnit === 'g' && newUnit === 'kg') newAmount = r.amountNeeded / 1000;
        else if (oldUnit === 'l' && newUnit === 'ml') newAmount = r.amountNeeded * 1000;
        else if (oldUnit === 'ml' && newUnit === 'l') newAmount = r.amountNeeded / 1000;

        return {
          ...r,
          amountNeeded: Number(newAmount.toFixed(4)),
          recipeUnit: newUnit
        };
      })
    );
  };

  const handleRemoveToppingRecipeItem = (ingredientId: string) => {
    setToppingFormRecipe(prev => prev.filter(r => r.ingredientId !== ingredientId));
  };

  const handleSaveTopping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toppingFormName.trim()) return;

    const primary = toppingFormRecipe[0];

    if (editingTopping) {
      updateAddOn({
        ...editingTopping,
        name: toppingFormName,
        price: Number(toppingFormPrice),
        recipe: toppingFormRecipe,
        ingredientId: primary?.ingredientId || undefined,
        ingredientAmount: primary?.amountNeeded || undefined
      });
    } else {
      addAddOn({
        name: toppingFormName,
        price: Number(toppingFormPrice),
        recipe: toppingFormRecipe,
        ingredientId: primary?.ingredientId || undefined,
        ingredientAmount: primary?.amountNeeded || undefined
      });
    }
    setIsToppingModalOpen(false);
  };

  const handleDeleteTopping = (topping: AddOnOption) => {
    setDeleteConfirmItem({
      type: 'topping',
      id: topping.id,
      name: topping.name
    });
  };

  // Recipe Editing logic
  const handleAddIngredientToRecipe = (ingredientId: string) => {
    if (!ingredientId) return;
    if (editableRecipe.some(r => r.ingredientId === ingredientId)) return;
    const ing = ingredients.find(i => i.id === ingredientId);
    let defaultAmount = 100;
    let defaultUnit = ing?.unit || 'g';
    if (['kg', 'กิโลกรัม', 'กก.'].includes(ing?.unit || '')) {
      defaultUnit = 'g';
      defaultAmount = 150;
    } else if (['l', 'liter', 'ลิตร'].includes(ing?.unit || '')) {
      defaultUnit = 'ml';
      defaultAmount = 10;
    } else if (['pcs', 'ชิ้น', 'ฟอง', 'ลูก'].includes(ing?.unit || '')) {
      defaultUnit = ing?.unit || 'pcs';
      defaultAmount = 1;
    }
    setEditableRecipe(prev => [...prev, { ingredientId, amountNeeded: defaultAmount, recipeUnit: defaultUnit }]);
  };

  const handleUpdateRecipeAmount = (ingredientId: string, amountNeeded: number) => {
    setEditableRecipe(prev =>
      prev.map(r => (r.ingredientId === ingredientId ? { ...r, amountNeeded: Math.max(0, amountNeeded) } : r))
    );
  };

  const handleUpdateRecipeUnit = (ingredientId: string, newUnit: string) => {
    setEditableRecipe(prev =>
      prev.map(r => {
        if (r.ingredientId !== ingredientId) return r;
        const ing = ingredients.find(i => i.id === ingredientId);
        const oldUnit = r.recipeUnit || ing?.unit || 'pcs';
        let newAmount = r.amountNeeded;

        if (oldUnit === 'kg' && newUnit === 'g') newAmount = r.amountNeeded * 1000;
        else if (oldUnit === 'g' && newUnit === 'kg') newAmount = r.amountNeeded / 1000;
        else if (oldUnit === 'l' && newUnit === 'ml') newAmount = r.amountNeeded * 1000;
        else if (oldUnit === 'ml' && newUnit === 'l') newAmount = r.amountNeeded / 1000;

        return {
          ...r,
          amountNeeded: Number(newAmount.toFixed(4)),
          recipeUnit: newUnit
        };
      })
    );
  };

  const handleRemoveRecipeIngredient = (ingredientId: string) => {
    setEditableRecipe(prev => prev.filter(r => r.ingredientId !== ingredientId));
  };

  const handleSaveRecipe = () => {
    if (!currentRecipeMenuItem) return;
    let calculatedCost = 0;
    editableRecipe.forEach(r => {
      const ing = ingredients.find(i => i.id === r.ingredientId);
      if (ing) {
        calculatedCost += calcRecipeItemCostAndDeduction(ing, r.amountNeeded, r.recipeUnit).lineCost;
      }
    });

    updateMenuItemRecipe(currentRecipeMenuItem.id, editableRecipe, calculatedCost);
    alert(`บันทึกสูตรอาหารสำหรับ "${currentRecipeMenuItem.name}" เรียบร้อยแล้ว (ต้นทุนวัตถุดิบคำนวณ ฿${calculatedCost.toFixed(2)})`);
  };

  // Category labels helper
  const categoryLabels: Record<MenuCategory, string> = {
    kaprao: 'กะเพราโบราณ',
    fry_soup: 'เมนูผัด/ต้ม',
    drinks_dessert: 'เครื่องดื่ม & ขนม',
    special: 'เมนูพิเศษ'
  };

  const filteredMenuItems = selectedCategoryFilter === 'all'
    ? menuItems
    : menuItems.filter(m => isItemInCategory(m, selectedCategoryFilter, categories));

  // Calculated recipe cost
  const totalRecipeCalculatedCost = editableRecipe.reduce((sum, r) => {
    const ing = ingredients.find(i => i.id === r.ingredientId);
    return sum + (ing ? calcRecipeItemCostAndDeduction(ing, r.amountNeeded, r.recipeUnit).lineCost : 0);
  }, 0);

  const recipeMargin = currentRecipeMenuItem ? currentRecipeMenuItem.price - totalRecipeCalculatedCost : 0;
  const recipeMarginPercent = currentRecipeMenuItem && currentRecipeMenuItem.price > 0
    ? ((recipeMargin / currentRecipeMenuItem.price) * 100).toFixed(1)
    : '0';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* View Header */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <BookOpen className="w-6 h-6 text-red-500" />
            <span>จัดการเมนู, Toppings และสูตรคำนวณวัตถุดิบ (BOM Recipe)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            เพิ่ม/แก้ไขเมนูอาหาร จัดการ Topping ตัวเลือกเสริม และปรับสูตรวัตถุดิบเพื่อคำนวณ Food Cost
          </p>
        </div>

        {/* Action Button depending on sub-tab */}
        <div>
          {activeSubTab === 'menu' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition shadow-sm active:scale-95"
              >
                <FolderPlus className="w-4 h-4 text-amber-400" />
                <span>จัดการหมวดหมู่ ({categories.length})</span>
              </button>
              <button
                onClick={handleOpenAddMenu}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-xs rounded-xl flex items-center space-x-1.5 shadow-md shadow-orange-950/50 transition active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>เพิ่มเมนูอาหารใหม่</span>
              </button>
            </div>
          )}
          {activeSubTab === 'toppings' && (
            <button
              onClick={handleOpenAddTopping}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-xs rounded-xl flex items-center space-x-1.5 shadow-md shadow-orange-950/50 transition"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>เพิ่ม Topping ใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 gap-2">
        <button
          onClick={() => setActiveSubTab('menu')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeSubTab === 'menu'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>1. จัดการเมนูอาหาร ({menuItems.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('toppings')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeSubTab === 'toppings'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Egg className="w-4 h-4" />
          <span>2. จัดการ Toppings ({addOns.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('recipes')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeSubTab === 'recipes'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>3. แก้ไขสูตรอาหาร (BOM Recipe)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('bulk_edit')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeSubTab === 'bulk_edit'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md ring-1 ring-amber-400/50'
              : 'text-amber-400 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/30'
          }`}
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span>⚡ 4. ปรับราคาทุนวัตถุดิบ & คำนวณราคาขายยกแผง</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ai_engineering')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeSubTab === 'ai_engineering'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md ring-1 ring-amber-400/50'
              : 'text-amber-400 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/30'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>✨ 5. AI วิศวกรรมเมนู & ราคาแนะนำ</span>
        </button>
      </div>

      {/* SUB TAB 1: MENU ITEMS */}
      {activeSubTab === 'menu' && (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedCategoryFilter === 'all'
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              ทั้งหมด ({menuItems.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedCategoryFilter === cat.id
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {cat.name} ({menuItems.filter(m => isItemInCategory(m, cat.id, categories)).length})
              </button>
            ))}
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMenuItems.map(item => {
              const margin = item.price - item.costPrice;
              const marginPercent = item.price > 0 ? ((margin / item.price) * 100).toFixed(1) : '0';

              return (
                <div key={item.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 relative group hover:border-amber-500/40 transition">
                  <div className="flex items-center space-x-3">
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-amber-400">
                          {getCategoryName(item.category)}
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleOpenEditMenu(item)}
                            className="p-1.5 text-slate-400 hover:text-amber-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition"
                            title="แก้ไขเมนู"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMenu(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition"
                            title="ลบเมนู"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-bold text-slate-100 text-sm truncate mt-1">{item.name}</h4>
                      <div className="text-sm text-emerald-400 font-extrabold font-mono">฿{item.price}</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/50">
                    {item.description || 'ไม่มีคำอธิบาย'}
                  </p>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>ต้นทุนวัตถุดิบ (Food Cost):</span>
                      <span className="font-bold text-rose-400">฿{item.costPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>กำไรขั้นต้น (Margin):</span>
                      <span className="font-bold text-emerald-400">฿{margin.toFixed(2)} ({marginPercent}%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB TAB 2: TOPPINGS */}
      {activeSubTab === 'toppings' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs text-slate-300">
            <span className="font-bold text-amber-400 block mb-1">คำแนะนำเรื่อง Topping:</span>
            รายการ Topping ที่เพิ่ม/แก้ไขตรงนี้ จะแสดงในหน้าต่างเลือกเมนูของลูกค้าทันที และเมื่อมีการสั่งซื้อ ระบบจะตัดสต๊อกวัตถุดิบที่ผูกไว้โดยอัตโนมัติ
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {addOns.map(addon => {
              const recipeList: RecipeIngredient[] = addon.recipe && addon.recipe.length > 0
                ? addon.recipe
                : addon.ingredientId
                  ? [{ ingredientId: addon.ingredientId, amountNeeded: addon.ingredientAmount || 1 }]
                  : [];

              return (
                <div key={addon.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                          <Egg className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-100 text-sm">{addon.name}</h4>
                          <span className="text-xs font-mono font-extrabold text-amber-400">+฿{addon.price}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEditTopping(addon)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition"
                          title="แก้ไข Topping"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTopping(addon)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition"
                          title="ลบ Topping"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60 text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between items-center text-[11px] font-bold text-amber-400">
                        <span>วัตถุดิบที่ใช้ตัดสต๊อก:</span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/20">
                          {recipeList.length} รายการ
                        </span>
                      </div>
                      {recipeList.length > 0 ? (
                        <div className="space-y-1 pt-1">
                          {recipeList.map((rec, idx) => {
                            const ing = ingredients.find(i => i.id === rec.ingredientId);
                            if (!ing) return null;
                            return (
                              <div key={idx} className="flex justify-between items-center text-slate-200 text-xs font-medium bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800/50">
                                <span className="truncate max-w-[140px]">• {ing.name}</span>
                                <span className="font-mono text-amber-300 font-bold shrink-0">{rec.amountNeeded} {ing.unit}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-slate-500 italic text-[11px] pt-0.5">ไม่ได้ผูกวัตถุดิบ</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB TAB 3: RECIPE BOM FORMULA EDITOR */}
      {activeSubTab === 'recipes' && (
        <div className="space-y-6">
          {/* Dish Selector & Cost Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  เลือกเมนูที่ต้องการปรับสูตรวัตถุดิบ:
                </label>
                <select
                  value={selectedRecipeMenuItemId}
                  onChange={e => setSelectedRecipeMenuItemId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-amber-500 transition min-w-[280px]"
                >
                  {menuItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (ราคา ฿{item.price})
                    </option>
                  ))}
                </select>
              </div>

              {currentRecipeMenuItem && (
                <div className="flex items-center space-x-4 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-400">ราคาขาย:</div>
                    <div className="text-base font-extrabold text-emerald-400 font-mono">฿{currentRecipeMenuItem.price}</div>
                  </div>
                  <div className="h-8 w-px bg-slate-800" />
                  <div>
                    <div className="text-slate-400">ต้นทุนสูตรใหม่:</div>
                    <div className="text-base font-extrabold text-rose-400 font-mono">฿{totalRecipeCalculatedCost.toFixed(2)}</div>
                  </div>
                  <div className="h-8 w-px bg-slate-800" />
                  <div>
                    <div className="text-slate-400">กำไรขั้นต้น (Margin):</div>
                    <div className="text-base font-extrabold text-amber-300 font-mono">฿{recipeMargin.toFixed(2)} ({recipeMarginPercent}%)</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recipe Ingredients Table & Controls */}
          {currentRecipeMenuItem && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                  <FlaskConical className="w-4 h-4 text-amber-400" />
                  <span>วัตถุดิบในสูตรของ "{currentRecipeMenuItem.name}"</span>
                </h3>
                <button
                  onClick={handleSaveRecipe}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl flex items-center space-x-1.5 shadow-md shadow-emerald-950/50 transition"
                >
                  <Save className="w-4 h-4 stroke-[3]" />
                  <span>บันทึกสูตรอาหาร</span>
                </button>
              </div>

              {/* Ingredients List */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-200">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-3">ชื่อวัตถุดิบ</th>
                      <th className="p-3">ต้นทุน/หน่วย</th>
                      <th className="p-3">ปริมาณที่ใช้ต่อจาน</th>
                      <th className="p-3">รวมต้นทุนจานนี้</th>
                      <th className="p-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {editableRecipe.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
                          ยังไม่ได้กำหนดวัตถุดิบในสูตรเมนูนี้
                        </td>
                      </tr>
                    ) : (
                      editableRecipe.map(rec => {
                        const ing = ingredients.find(i => i.id === rec.ingredientId);
                        const calc = calcRecipeItemCostAndDeduction(ing, rec.amountNeeded, rec.recipeUnit);
                        const availableUnits = ing ? getAvailableRecipeUnits(ing.unit) : [];

                        return (
                          <tr key={rec.ingredientId} className="hover:bg-slate-800/40">
                            <td className="p-3 font-semibold text-slate-100">
                              {ing ? ing.name : rec.ingredientId}
                            </td>
                            <td className="p-3 font-mono text-slate-400">
                              {ing ? `฿${ing.unitCost} / ${ing.unit}` : '-'}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={rec.amountNeeded}
                                  onChange={e => handleUpdateRecipeAmount(rec.ingredientId, parseFloat(e.target.value) || 0)}
                                  className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-500"
                                />
                                {availableUnits.length > 1 ? (
                                  <select
                                    value={rec.recipeUnit || (availableUnits.some(u => u.val === ing?.unit) ? ing?.unit : availableUnits[0]?.val)}
                                    onChange={e => handleUpdateRecipeUnit(rec.ingredientId, e.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                                  >
                                    {availableUnits.map(u => (
                                      <option key={u.val} value={u.val}>{u.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-slate-400 font-medium">{ing?.unit}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-mono font-bold text-rose-400">
                              ฿{calc.lineCost.toFixed(2)}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleRemoveRecipeIngredient(rec.ingredientId)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                                title="ลบออกจากสูตร"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add Ingredient Selector Row */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-3">
                <span className="text-xs text-slate-400 font-bold">เพิ่มวัตถุดิบลงในสูตร:</span>
                <select
                  onChange={e => {
                    if (e.target.value) {
                      handleAddIngredientToRecipe(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="" disabled>-- เลือกวัตถุดิบจากคลัง --</option>
                  {ingredients
                    .filter(i => !editableRecipe.some(r => r.ingredientId === i.id))
                    .map(i => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unitCost} ฿/{i.unit})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB 4: BULK INGREDIENT COST & RETAIL PRICE RECALCULATOR */}
      {activeSubTab === 'bulk_edit' && (
        <BulkIngredientCostEditorPanel />
      )}

      {/* SUB TAB 5: AI MENU ENGINEERING & PRICE ADVISOR */}
      {activeSubTab === 'ai_engineering' && (
        <AIMenuEngineeringPanel />
      )}

      {/* MODAL: MANAGE CATEGORIES */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-amber-400" />
                <span>จัดการหมวดหมู่เมนูอาหาร (Manage Categories)</span>
              </h3>
              <button
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCatId(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-200 overflow-y-auto flex-1">
              {/* Form to add category */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!newCatNameInput.trim()) return;
                  addCategory(newCatNameInput);
                  setNewCatNameInput('');
                }}
                className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2"
              >
                <label className="block text-slate-300 font-bold text-xs">
                  + เพิ่มหมวดหมู่ใหม่
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="เช่น สเต๊ก & ปิ้งย่าง, เครื่องดื่มสดชื่น..."
                    value={newCatNameInput}
                    onChange={e => setNewCatNameInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold rounded-xl text-xs transition shrink-0 active:scale-95 shadow-md"
                  >
                    เพิ่มหมวดหมู่
                  </button>
                </div>
              </form>

              {/* List of categories */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-400 text-xs">
                    รายการหมวดหมู่ทั้งหมด ({categories.length} หมวดหมู่)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      syncCategoriesFromMenu();
                      alert('ซิงค์และกู้คืนหมวดหมู่จากรายการเมนูทั้งหมดสำเร็จเรียบร้อย!');
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center space-x-1 font-bold hover:underline"
                    title="สแกนรายการอาหารทั้งหมดและกู้คืนหมวดหมู่ที่ขาดหาย"
                  >
                    <span>🔄 กู้คืนหมวดหมู่อัตโนมัติ (Auto-Sync)</span>
                  </button>
                </div>
                {categories.map(cat => {
                  const itemCount = menuItems.filter(m => isItemInCategory(m, cat.id, categories)).length;
                  const isEditingThis = editingCatId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition gap-2"
                    >
                      {isEditingThis ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCatNameInput}
                            onChange={e => setEditingCatNameInput(e.target.value)}
                            className="flex-1 bg-slate-900 border border-amber-500/80 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editingCatNameInput.trim()) {
                                updateCategory(cat.id, editingCatNameInput);
                                setEditingCatId(null);
                              }
                            }}
                            className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-amber-400 transition"
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCatId(null)}
                            className="px-2.5 py-1 bg-slate-800 text-slate-300 font-medium rounded-lg text-xs hover:bg-slate-700 transition"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="font-bold text-slate-100 text-xs truncate">
                              {cat.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-amber-300 font-mono shrink-0">
                              {itemCount} เมนู
                            </span>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(cat.id);
                                setEditingCatNameInput(cat.name);
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition"
                              title="แก้ไขชื่อหมวดหมู่"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                let msg = `ต้องการลบหมวดหมู่ "${cat.name}" หรือไม่?`;
                                if (itemCount > 0) {
                                  msg += `\n\nหมายเหตุ: มีเมนูในหมวดนี้ ${itemCount} รายการ ระบบจะย้ายไปหมวดหมู่อื่นโดยอัตโนมัติ`;
                                }
                                if (confirm(msg)) {
                                  deleteCategory(cat.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/50 rounded-lg transition"
                              title="ลบหมวดหมู่"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCatId(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT MENU ITEM */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm">
                {editingMenuItem ? 'แก้ไขเมนูอาหาร' : 'เพิ่มเมนูอาหารใหม่'}
              </h3>
              <button
                onClick={() => setIsMenuModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMenu} className="p-5 space-y-4 text-xs text-slate-200">
              <div>
                <label className="block text-slate-400 font-bold mb-1">ชื่อเมนู *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น กะเพราหมูกรอบโบราณ"
                  value={menuFormName}
                  onChange={e => setMenuFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">หมวดหมู่</label>
                  <select
                    value={menuFormCategory}
                    onChange={e => setMenuFormCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">ราคาขาย (บาท) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={menuFormPrice}
                    onChange={e => setMenuFormPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* รูปภาพเมนูอาหาร (Image Upload & Preview) */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-bold text-xs flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span>รูปภาพเมนูอาหาร (Menu Image)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">อัปโหลดจากเครื่อง หรือ วาง URL</span>
                </label>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center space-x-3">
                    {/* Image Thumbnail Preview */}
                    <div className="w-16 h-16 rounded-xl border-2 border-slate-700/80 bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center shadow-md relative group">
                      {menuFormImage ? (
                        <img
                          src={menuFormImage}
                          alt="Preview"
                          className="w-full h-full object-cover rounded-lg"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="text-center p-1 text-slate-500">
                          <ImageIcon className="w-6 h-6 mx-auto mb-0.5 opacity-60" />
                          <span className="text-[9px] block">ไม่มีรูป</span>
                        </div>
                      )}
                    </div>

                    {/* Upload Buttons */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <label className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl cursor-pointer transition flex items-center space-x-1.5 shadow-sm active:scale-95">
                          <Upload className="w-3.5 h-3.5 text-amber-400" />
                          <span>เลือกรูปจากเครื่อง / คลังภาพ</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImageFile(file, 800, 0.85);
                                setMenuFormImage(base64);
                              }
                            }}
                          />
                        </label>

                        <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl cursor-pointer transition flex items-center space-x-1.5 active:scale-95">
                          <Camera className="w-3.5 h-3.5 text-emerald-400" />
                          <span>ถ่ายภาพ</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImageFile(file, 800, 0.85);
                                setMenuFormImage(base64);
                              }
                            }}
                          />
                        </label>

                        {menuFormImage && (
                          <button
                            type="button"
                            onClick={() => setMenuFormImage('')}
                            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs rounded-xl transition flex items-center space-x-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>ลบรูป</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        รองรับไฟล์ JPG, PNG, WEBP (ย่อขนาดอัตโนมัติ 800px เพื่อความรวดเร็ว)
                      </p>
                    </div>
                  </div>

                  {/* Optional direct URL input */}
                  <div className="pt-2 border-t border-slate-900">
                    <label className="block text-[11px] text-slate-400 mb-1">หรือระบุ URL รูปภาพจากเว็บ:</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={menuFormImage.startsWith('data:image') ? '[รูปภาพที่อัปโหลดจากเครื่อง]' : menuFormImage}
                      onChange={e => setMenuFormImage(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">คำอธิบายเมนู</label>
                <textarea
                  rows={2}
                  placeholder="คำอธิบายสั้นๆ..."
                  value={menuFormDescription}
                  onChange={e => setMenuFormDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsMenuModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black rounded-xl"
                >
                  บันทึกเมนู
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT TOPPING */}
      {isToppingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm">
                {editingTopping ? 'แก้ไข Topping' : 'เพิ่ม Topping ใหม่'}
              </h3>
              <button
                onClick={() => setIsToppingModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTopping} className="p-5 space-y-4 text-xs text-slate-200">
              <div>
                <label className="block text-slate-400 font-bold mb-1">ชื่อ Topping *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น เพิ่มไข่ดาว"
                  value={toppingFormName}
                  onChange={e => setToppingFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ราคาบวกเพิ่ม (บาท) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={toppingFormPrice}
                  onChange={e => setToppingFormPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Multi-ingredient selection for Topping stock deduction */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-bold text-xs">
                    วัตถุดิบที่ใช้ตัดสต๊อก ({toppingFormRecipe.length} รายการ)
                  </label>
                </div>

                {/* List of currently added stock deduction ingredients */}
                {toppingFormRecipe.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {toppingFormRecipe.map(rec => {
                      const ing = ingredients.find(i => i.id === rec.ingredientId);
                      if (!ing) return null;
                      const availableUnits = getAvailableRecipeUnits(ing.unit);
                      return (
                        <div key={rec.ingredientId} className="flex items-center space-x-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-200 text-xs truncate">{ing.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">คงเหลือ: {ing.currentStock} {ing.unit}</div>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={rec.amountNeeded}
                              onChange={e => handleUpdateToppingRecipeAmount(rec.ingredientId, parseFloat(e.target.value) || 0)}
                              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-amber-300 font-bold font-mono text-center focus:outline-none focus:border-amber-500 text-xs"
                            />
                            {availableUnits.length > 1 ? (
                              <select
                                value={rec.recipeUnit || (availableUnits.some(u => u.val === ing.unit) ? ing.unit : availableUnits[0]?.val)}
                                onChange={e => handleUpdateToppingRecipeUnit(rec.ingredientId, e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-1 py-1 text-[11px] text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                              >
                                {availableUnits.map(u => (
                                  <option key={u.val} value={u.val}>{u.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium px-1">{ing.unit}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveToppingRecipeItem(rec.ingredientId)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                              title="ลบรายการตัดสต๊อก"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic p-2 bg-slate-950 rounded-xl border border-slate-800/60 text-center">
                    ยังไม่มีการเพิ่มรายการตัดสต๊อกสำหรับ Topping นี้
                  </p>
                )}

                {/* Add new ingredient control */}
                <div className="flex items-center space-x-2 pt-1">
                  <select
                    value={toppingSelectedIngToAdd}
                    onChange={e => setToppingSelectedIngToAdd(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                  >
                    <option value="">-- เลือกวัตถุดิบเพิ่ม --</option>
                    {ingredients
                      .filter(ing => !toppingFormRecipe.some(r => r.ingredientId === ing.id))
                      .map(ing => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddToppingRecipeItem}
                    disabled={!toppingSelectedIngToAdd || toppingFormRecipe.some(r => r.ingredientId === toppingSelectedIngToAdd)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 disabled:opacity-40 font-bold rounded-xl flex items-center space-x-1 shrink-0 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่ม</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsToppingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black rounded-xl"
                >
                  บันทึก Topping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-100 text-base">ยืนยันการลบรายการ</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบ{deleteConfirmItem.type === 'menu' ? 'เมนู' : 'Topping'}{' '}
              <span className="font-bold text-amber-300">"{deleteConfirmItem.name}"</span> ออกจากระบบ? การดำเนินการนี้จะมีผลทันที
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmItem.type === 'menu') {
                    deleteMenuItem(deleteConfirmItem.id);
                  } else {
                    deleteAddOn(deleteConfirmItem.id);
                  }
                  setDeleteConfirmItem(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition"
              >
                ยืนยันลบรายการ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// 4. Quotation View (ใบเสนอราคา & Catering Estimates)
interface QuotationItemRow {
  id: string;
  name: string;
  qty: number;
  price: number;
}

interface Quotation {
  id: string;
  quotationNo: string;
  customerName: string;
  companyName: string;
  taxId?: string;
  phone: string;
  email?: string;
  address?: string;
  eventDate: string;
  validUntil: string;
  items: QuotationItemRow[];
  discount: number;
  includeVat: boolean;
  status: 'รออนุมัติ' | 'อนุมัติแล้ว' | 'ยืนยันสั่งซื้อ' | 'ยกเลิก';
  createdAt: string;
  notes?: string;
}

export const QuotationView: React.FC = () => {
  const { menuItems } = usePOS();
  
  const [quotations, setQuotations] = useState<Quotation[]>(() => {
    try {
      const saved = localStorage.getItem('POS_QUOTATIONS');
      return saved ? JSON.parse(saved) : [
        {
          id: 'qt-001',
          quotationNo: 'QT-202607-001',
          customerName: 'คุณภัทรพล สุขสวัสดิ์',
          companyName: 'บริษัท สยามนวัตกรรม จำกัด',
          taxId: '0105562098123',
          phone: '081-987-6543',
          email: 'pattarapol@siaminno.co.th',
          address: '123/45 อาคารสยามสแควร์ ชั้น 12 ถนนพระราม 1 ปทุมวัน กรุงเทพฯ 10330',
          eventDate: '2026-08-05',
          validUntil: '2026-08-01',
          items: [
            { id: '1', name: 'ข้าวผัดกะเพราเนื้อสไลส์พรีเมียม (กล่องจัดเลี้ยง)', qty: 50, price: 95 },
            { id: '2', name: 'ไข่ดาวโบราณขอบกรอบ', qty: 50, price: 15 },
            { id: '3', name: 'ต้มยำกุ้งน้ำข้นเซตพิเศษ', qty: 10, price: 220 },
            { id: '4', name: 'ชาไทยเย็นตรามือ (ขวด 250ml)', qty: 50, price: 35 }
          ],
          discount: 300,
          includeVat: true,
          status: 'อนุมัติแล้ว',
          createdAt: '2026-07-20',
          notes: 'มัดจำ 50% ก่อนวันงาน 3 วัน ส่งมอบเวลา 11:30 น.'
        },
        {
          id: 'qt-002',
          quotationNo: 'QT-202607-002',
          customerName: 'คุณวรรณิสา แก้วมณี',
          companyName: 'โรงพยาบาลกรุงเทพ เซ็นเตอร์',
          taxId: '0105558012341',
          phone: '089-123-4567',
          email: 'wannisak@bhh.co.th',
          address: '456 ถนนเพชรบุรีตัดใหม่ ห้วยขวาง กรุงเทพฯ 10310',
          eventDate: '2026-08-10',
          validUntil: '2026-08-03',
          items: [
            { id: '1', name: 'ข้าวผัดกะเพราไก่สับไข่ดาว (กล่องจัดเลี้ยง)', qty: 120, price: 65 },
            { id: '2', name: 'เฉาก๊วยชากังราวใส่น้ำเชื่อม', qty: 120, price: 25 }
          ],
          discount: 500,
          includeVat: false,
          status: 'รอพิจารณา',
          createdAt: '2026-07-22',
          notes: 'ขอใบเสนอราคาด่วนเพื่อเสนอที่ประชุมคณะกรรมการ'
        }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('POS_QUOTATIONS', JSON.stringify(quotations));
    } catch (e) {
      console.error('Failed to save quotations to localStorage', e);
    }
  }, [quotations]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);

  // New Quotation Form State
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formEventDate, setFormEventDate] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formDiscount, setFormDiscount] = useState<number>(0);
  const [formIncludeVat, setFormIncludeVat] = useState(true);
  const [formNotes, setFormNotes] = useState('ชำระมัดจำ 50% เมื่อยืนยันสั่งซื้อ และชำระส่วนที่เหลือวันจัดส่ง');

  const [formItems, setFormItems] = useState<QuotationItemRow[]>([
    { id: 'item-1', name: 'ข้าวผัดกะเพราหมูกรอบ (ชุดจัดเลี้ยง)', qty: 20, price: 85 }
  ]);

  // Handle Add Item Row
  const handleAddItemRow = () => {
    const defaultMenu = menuItems[0];
    setFormItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        name: defaultMenu ? defaultMenu.name : 'รายการอาหารใหม่',
        qty: 10,
        price: defaultMenu ? defaultMenu.price : 70
      }
    ]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (formItems.length <= 1) return;
    setFormItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateItemRow = (id: string, field: keyof QuotationItemRow, val: any) => {
    setFormItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          if (field === 'name') {
            const matchedMenu = menuItems.find(m => m.name === val);
            return {
              ...item,
              name: val,
              price: matchedMenu ? matchedMenu.price : item.price
            };
          }
          return { ...item, [field]: val };
        }
        return item;
      })
    );
  };

  // Calculations for form
  const formSubtotal = formItems.reduce((sum, item) => sum + item.qty * item.price, 0);
  const formAfterDiscount = Math.max(0, formSubtotal - formDiscount);
  const formVat = formIncludeVat ? formAfterDiscount * 0.07 : 0;
  const formGrandTotal = formAfterDiscount + formVat;

  const handleCreateQuotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerName.trim() && !formCompanyName.trim()) {
      alert('กรุณาระบุชื่อผู้ติดต่อหรือชื่อบริษัท/หน่วยงาน');
      return;
    }

    const newQuotation: Quotation = {
      id: `qt-${Date.now()}`,
      quotationNo: `QT-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${(quotations.length + 1).toString().padStart(3, '0')}`,
      customerName: formCustomerName || 'ลูกค้าจัดเลี้ยง',
      companyName: formCompanyName || '-',
      taxId: formTaxId,
      phone: formPhone || '-',
      email: formEmail,
      address: formAddress,
      eventDate: formEventDate || new Date().toISOString().split('T')[0],
      validUntil: formValidUntil || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      items: formItems,
      discount: Number(formDiscount) || 0,
      includeVat: formIncludeVat,
      status: 'รออนุมัติ',
      createdAt: new Date().toISOString().split('T')[0],
      notes: formNotes
    };

    setQuotations(prev => [newQuotation, ...prev]);
    setIsCreateModalOpen(false);

    // Reset Form
    setFormCustomerName('');
    setFormCompanyName('');
    setFormTaxId('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormDiscount(0);
    setFormItems([{ id: 'item-1', name: 'ข้าวผัดกะเพราหมูกรอบ (ชุดจัดเลี้ยง)', qty: 20, price: 85 }]);
  };

  const handleUpdateStatus = (id: string, newStatus: Quotation['status']) => {
    setQuotations(prev => prev.map(q => (q.id === id ? { ...q, status: newStatus } : q)));
    if (viewingQuotation && viewingQuotation.id === id) {
      setViewingQuotation(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleDeleteQuotation = (id: string) => {
    if (confirm('คุณต้องการลบใบเสนอราคานี้ใช่หรือไม่?')) {
      setQuotations(prev => prev.filter(q => q.id !== id));
      if (viewingQuotation?.id === id) setViewingQuotation(null);
    }
  };

  const filteredQuotations = quotations.filter(q => {
    const matchSearch =
      q.quotationNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.phone.includes(searchTerm);
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-red-500" />
            <span>ใบเสนอราคา (Quotation & Catering Estimates)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ออกใบเสนอราคา พิมพ์เอกสารสัญญา และคำนวณ VAT 7% สำหรับงานจัดเลี้ยงและสัมมนา
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-red-950/40 transition active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>สร้างใบเสนอราคาใหม่</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ค้นหาเลขที่, ชื่อลูกค้า, บริษัท, โทร..."
            className="w-full px-3.5 py-2 pl-9 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
          <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['all', 'รออนุมัติ', 'อนุมัติแล้ว', 'ยืนยันสั่งซื้อ', 'ยกเลิก'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterStatus === st
                  ? 'bg-red-950/90 border border-red-500/50 text-red-300'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {st === 'all' ? 'ทั้งหมด' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200 min-w-[850px]">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">เลขที่ใบเสนอราคา</th>
                <th className="p-3.5">ลูกค้า / บริษัท</th>
                <th className="p-3.5">วันจัดงาน</th>
                <th className="p-3.5 text-center">รายการ</th>
                <th className="p-3.5 text-right">ยอดรวมทั้งสิ้น</th>
                <th className="p-3.5 text-center">สถานะ</th>
                <th className="p-3.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredQuotations.length > 0 ? (
                filteredQuotations.map(q => {
                  const sub = q.items.reduce((s, i) => s + i.qty * i.price, 0);
                  const afterDis = Math.max(0, sub - q.discount);
                  const vat = q.includeVat ? afterDis * 0.07 : 0;
                  const total = afterDis + vat;

                  return (
                    <tr key={q.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono font-bold text-amber-400">
                        {q.quotationNo}
                        <div className="text-[10px] text-slate-500 font-normal">สร้างเมื่อ {q.createdAt}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-100">{q.companyName !== '-' ? q.companyName : q.customerName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                          <span>{q.customerName}</span>
                          <span>•</span>
                          <span>{q.phone}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-red-400" />
                          <span>{q.eventDate}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">ยืนยันภายใน {q.validUntil}</div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px] font-bold">
                          {q.items.length} รายการ
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400 text-sm">
                        ฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        {q.includeVat && <div className="text-[10px] text-slate-500 font-sans font-normal">(รวม VAT 7%)</div>}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            q.status === 'อนุมัติแล้ว' || q.status === 'ยืนยันสั่งซื้อ'
                              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                              : q.status === 'ยกเลิก'
                              ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                              : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-center space-x-1">
                        <button
                          onClick={() => setViewingQuotation(q)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 transition inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>ดู/พิมพ์</span>
                        </button>
                        <button
                          onClick={() => handleDeleteQuotation(q.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition inline-block"
                          title="ลบใบเสนอราคา"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    ไม่พบข้อมูลใบเสนอราคาตามที่ระบุ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE QUOTATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-slate-100 text-base">สร้างใบเสนอราคาใหม่ (New Quotation)</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
              {/* Section 1: Customer Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">1. ข้อมูลผู้ว่าจ้าง / ลูกค้า</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ชื่อผู้ติดต่อ / ลูกค้า *</label>
                    <input
                      type="text"
                      required
                      value={formCustomerName}
                      onChange={e => setFormCustomerName(e.target.value)}
                      placeholder="เช่น คุณสมชาย สุขดี"
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ชื่อบริษัท / หน่วยงาน</label>
                    <input
                      type="text"
                      value={formCompanyName}
                      onChange={e => setFormCompanyName(e.target.value)}
                      placeholder="เช่น บริษัท เอบีซี จำกัด"
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                    <input
                      type="text"
                      value={formTaxId}
                      onChange={e => setFormTaxId(e.target.value)}
                      placeholder="เลข 13 หลัก"
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">เบอร์โทรศัพท์ติดต่อ *</label>
                    <input
                      type="text"
                      required
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="เช่น 081-234-5678"
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">วันจัดส่ง / วันจัดงาน *</label>
                    <input
                      type="date"
                      required
                      value={formEventDate}
                      onChange={e => setFormEventDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ยืนยันภายในวันที่ *</label>
                    <input
                      type="date"
                      required
                      value={formValidUntil}
                      onChange={e => setFormValidUntil(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">2. รายการอาหารและบริการจัดเลี้ยง</h4>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มแถวรายการ</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {formItems.map((item, idx) => (
                    <div key={item.id} className="bg-slate-950 p-2.5 sm:p-3 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-slate-500 w-5 text-center shrink-0">{idx + 1}</span>
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => handleUpdateItemRow(item.id, 'name', e.target.value)}
                          placeholder="ชื่อรายการอาหาร / บริการ"
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-red-500 min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(item.id)}
                          disabled={formItems.length <= 1}
                          className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 shrink-0"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pl-7 pt-1 border-t border-slate-900/80 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">จำนวน:</label>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={e => handleUpdateItemRow(item.id, 'qty', parseInt(e.target.value) || 1)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-mono font-bold text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">ราคา (บาท):</label>
                          <input
                            type="number"
                            min="0"
                            value={item.price}
                            onChange={e => handleUpdateItemRow(item.id, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-mono font-bold text-emerald-400"
                          />
                        </div>

                        <div className="text-right flex flex-col justify-end pb-1">
                          <span className="text-[10px] text-slate-500 block">รวม:</span>
                          <span className="font-mono font-bold text-amber-400 text-xs truncate">
                            ฿{(item.qty * item.price).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Summary & VAT */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>รวมเป็นเงิน (Subtotal):</span>
                  <span className="font-mono font-bold text-slate-100">฿{formSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center space-x-2">
                    <span>ส่วนลดพิเศษ (Discount):</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <span>฿</span>
                    <input
                      type="number"
                      min="0"
                      value={formDiscount}
                      onChange={e => setFormDiscount(parseFloat(e.target.value) || 0)}
                      className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-right font-mono font-bold text-rose-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-slate-800/80">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIncludeVat}
                      onChange={e => setFormIncludeVat(e.target.checked)}
                      className="rounded accent-red-500"
                    />
                    <span className="font-bold text-amber-400">คิดภาษีมูลค่าเพิ่ม VAT 7%</span>
                  </label>
                  <span className="font-mono font-bold text-amber-400">฿{formVat.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex items-center justify-between text-sm font-bold text-slate-100 pt-2 border-t border-slate-800">
                  <span>จำนวนเงินรวมทั้งสิ้น (Grand Total):</span>
                  <span className="font-mono text-lg font-black text-emerald-400">
                    ฿{formGrandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-red-600 to-amber-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-950/50"
                >
                  บันทึกและสร้างใบเสนอราคา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW & PRINT QUOTATION MODAL */}
      {viewingQuotation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3 sm:p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950 shrink-0">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-red-500" />
                <span className="font-bold text-slate-100 text-sm">พิมพ์เอกสารใบเสนอราคา #{viewingQuotation.quotationNo}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => exportToPNG('printable-quotation', `Quotation-${viewingQuotation.quotationNo}`)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg flex items-center space-x-1 border border-slate-700"
                  title="บันทึกรูปภาพ PNG"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  onClick={() => exportToPDF('printable-quotation', `Quotation-${viewingQuotation.quotationNo}`, 'a4')}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs rounded-lg flex items-center space-x-1 border border-slate-700"
                  title="บันทึกไฟล์ PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์</span>
                </button>
                <button
                  onClick={() => setViewingQuotation(null)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Document Paper Preview Container */}
            <div className="p-2 sm:p-4 overflow-auto flex-1">
              <div
                id="printable-quotation"
                className="printable-document printable-a4 bg-white text-slate-900 border border-slate-300 rounded-xl p-4 sm:p-6 font-sans space-y-6 shadow-sm min-w-[300px]"
              >
              {/* Document Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <img src={SHOP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                    <span className="font-black text-lg text-slate-900 tracking-wide">ครัวกะเพรา POS ENTERPRISE</span>
                  </div>
                  <p className="text-[11px] text-slate-600">123/88 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110</p>
                  <p className="text-[11px] text-slate-600">โทร: 02-999-8888 | เลขประจำตัวผู้เสียภาษี: 0105559082910</p>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-xl font-black text-red-600 uppercase tracking-widest">ใบเสนอราคา</div>
                  <div className="text-xs font-mono font-bold text-slate-900">{viewingQuotation.quotationNo}</div>
                  <div className="text-[10px] text-slate-500">วันที่: {viewingQuotation.createdAt}</div>
                </div>
              </div>

              {/* Customer Info Box */}
              <div
                style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
                className="grid grid-cols-2 gap-4 p-4 rounded-xl border text-xs text-slate-800"
              >
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">{viewingQuotation.companyName !== '-' ? viewingQuotation.companyName : viewingQuotation.customerName}</div>
                  <div className="text-slate-600">ผู้ติดต่อ: {viewingQuotation.customerName}</div>
                  <div className="text-slate-600">โทร: {viewingQuotation.phone}</div>
                  {viewingQuotation.taxId && <div className="text-slate-600 font-mono">Tax ID: {viewingQuotation.taxId}</div>}
                  {viewingQuotation.address && <div className="text-slate-600">{viewingQuotation.address}</div>}
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-slate-600">กำหนดจัดงาน: <span className="font-bold text-slate-900">{viewingQuotation.eventDate}</span></div>
                  <div className="text-slate-600">ยืนยันราคาภายใน: <span className="font-bold text-amber-600">{viewingQuotation.validUntil}</span></div>
                  <div className="text-slate-600 mt-2">
                    สถานะปัจจุบัน:{' '}
                    <span className="font-bold text-emerald-600">{viewingQuotation.status}</span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left text-xs text-slate-900 border-collapse">
                <thead style={{ backgroundColor: '#f1f5f9' }} className="uppercase text-[10px] font-bold border-b border-slate-300 text-slate-700">
                  <tr>
                    <th className="p-2.5">ลำดับ</th>
                    <th className="p-2.5">รายการอาหาร / บริการ</th>
                    <th className="p-2.5 text-center">จำนวน</th>
                    <th className="p-2.5 text-right">ราคา/หน่วย</th>
                    <th className="p-2.5 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {viewingQuotation.items.map((item, i) => (
                    <tr key={item.id}>
                      <td className="p-2.5 font-mono text-slate-500">{i + 1}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{item.name}</td>
                      <td className="p-2.5 text-center font-mono">{item.qty}</td>
                      <td className="p-2.5 text-right font-mono">฿{item.price.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">฿{(item.qty * item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Summary */}
              {(() => {
                const sub = viewingQuotation.items.reduce((s, i) => s + i.qty * i.price, 0);
                const afterDis = Math.max(0, sub - viewingQuotation.discount);
                const vat = viewingQuotation.includeVat ? afterDis * 0.07 : 0;
                const grand = afterDis + vat;

                return (
                  <div className="flex justify-between items-end pt-4 border-t border-slate-300 text-xs">
                    <div className="space-y-1 max-w-md">
                      <div className="font-bold text-slate-800">เงื่อนไขการชำระเงิน & หมายเหตุ:</div>
                      <p
                        style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
                        className="text-[11px] text-slate-600 p-2.5 rounded-lg border"
                      >
                        {viewingQuotation.notes || 'ชำระเงินมัดจำ 50% และส่วนที่เหลือชำระวันส่งมอบ'}
                      </p>
                    </div>
                    <div className="w-64 space-y-1.5 text-right font-mono text-slate-800">
                      <div className="flex justify-between text-slate-600">
                        <span>รวมเงิน:</span>
                        <span>฿{sub.toFixed(2)}</span>
                      </div>
                      {viewingQuotation.discount > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>ส่วนลด:</span>
                          <span>-฿{viewingQuotation.discount.toFixed(2)}</span>
                        </div>
                      )}
                      {viewingQuotation.includeVat && (
                        <div className="flex justify-between text-amber-700">
                          <span>VAT 7%:</span>
                          <span>฿{vat.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-emerald-700 pt-1 border-t border-slate-300">
                        <span>ยอดสุทธิ:</span>
                        <span>฿{grand.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Signatures Block */}
              <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-slate-800 border-t border-slate-200">
                <div className="text-center space-y-8">
                  <div className="border-b border-dashed border-slate-400 pb-1 w-3/4 mx-auto text-slate-400">
                    ลงชื่อ ...........................................................
                  </div>
                  <p className="font-bold text-slate-700">ผู้เสนอราคา / Authorized Signature</p>
                </div>
                <div className="text-center space-y-8">
                  <div className="border-b border-dashed border-slate-400 pb-1 w-3/4 mx-auto text-slate-400">
                    ลงชื่อ ...........................................................
                  </div>
                  <p className="font-bold text-slate-700">ผู้อนุมัติสั่งซื้อ / Customer Acceptance</p>
                </div>
              </div>
            </div>

            {/* Status Updater (Interactive UI - Hidden on Print / PDF export) */}
            <div className="mt-4 p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between no-print print:hidden">
              <span className="text-xs text-slate-400 font-bold">ปรับเปลี่ยนสถานะเอกสาร:</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleUpdateStatus(viewingQuotation.id, 'อนุมัติแล้ว')}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition"
                >
                  อนุมัติแล้ว
                </button>
                <button
                  onClick={() => handleUpdateStatus(viewingQuotation.id, 'ยืนยันสั่งซื้อ')}
                  className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs rounded-lg transition"
                >
                  ยืนยันสั่งซื้อ
                </button>
                <button
                  onClick={() => handleUpdateStatus(viewingQuotation.id, 'ยกเลิก')}
                  className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

// 5. CRM Membership & Coupon View (สมาชิก CRM & คูปองส่วนลด)
interface Member {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: 'Silver' | 'Gold' | 'Platinum';
  registeredAt: string;
}

interface Coupon {
  id: string;
  code: string;
  type: 'fixed' | 'percent';
  value: number;
  minSpend: number;
  expiryDate: string;
  isActive: boolean;
}

export const CRMView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'members' | 'coupons'>('members');

  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const saved = localStorage.getItem('POS_MEMBERS');
      return saved ? JSON.parse(saved) : [
        { id: 'M-001', name: 'คุณสมชาย ใจดี', phone: '081-234-5678', points: 450, tier: 'Gold', registeredAt: '2026-01-10' },
        { id: 'M-002', name: 'คุณนภา หวานเย็น', phone: '089-876-5432', points: 120, tier: 'Silver', registeredAt: '2026-03-15' },
        { id: 'M-003', name: 'คุณวิชัย สายลุย', phone: '086-555-4321', points: 890, tier: 'Platinum', registeredAt: '2025-11-20' },
        { id: 'M-004', name: 'คุณอนุรักษ์ มีมิตร', phone: '082-999-1122', points: 230, tier: 'Silver', registeredAt: '2026-05-01' }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('POS_MEMBERS', JSON.stringify(members));
    } catch (e) {
      console.error('Failed to save members to localStorage', e);
    }
  }, [members]);

  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    try {
      const saved = localStorage.getItem('POS_COUPONS');
      return saved ? JSON.parse(saved) : [
        { id: 'cp-1', code: 'KAPRAO50', type: 'fixed', value: 50, minSpend: 300, expiryDate: '2026-08-31', isActive: true },
        { id: 'cp-2', code: 'VIP10', type: 'percent', value: 10, minSpend: 500, expiryDate: '2026-12-31', isActive: true },
        { id: 'cp-3', code: 'WELCOME30', type: 'fixed', value: 30, minSpend: 150, expiryDate: '2026-09-30', isActive: true }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('POS_COUPONS', JSON.stringify(coupons));
    } catch (e) {
      console.error('Failed to save coupons to localStorage', e);
    }
  }, [coupons]);

  const [searchTerm, setSearchTerm] = useState('');

  // Add Member Modal
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberTier, setNewMemberTier] = useState<Member['tier']>('Silver');
  const [newMemberPoints, setNewMemberPoints] = useState<number>(50);

  // Edit Points Modal
  const [selectedMemberForPoints, setSelectedMemberForPoints] = useState<Member | null>(null);
  const [pointsChangeAmount, setPointsChangeAmount] = useState<number>(100);

  // Add Coupon Modal
  const [isAddCouponOpen, setIsAddCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'fixed' | 'percent'>('fixed');
  const [couponValue, setCouponValue] = useState<number>(50);
  const [couponMinSpend, setCouponMinSpend] = useState<number>(200);
  const [couponExpiry, setCouponExpiry] = useState<string>('2026-08-31');

  // Member Handlers
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberPhone.trim()) return;

    const newM: Member = {
      id: `M-00${members.length + 1}`,
      name: newMemberName,
      phone: newMemberPhone,
      points: Number(newMemberPoints) || 0,
      tier: newMemberTier,
      registeredAt: new Date().toISOString().split('T')[0]
    };

    setMembers(prev => [newM, ...prev]);
    setIsAddMemberOpen(false);
    setNewMemberName('');
    setNewMemberPhone('');
  };

  const handleAdjustPoints = (delta: number) => {
    if (!selectedMemberForPoints) return;
    setMembers(prev =>
      prev.map(m =>
        m.id === selectedMemberForPoints.id
          ? { ...m, points: Math.max(0, m.points + delta) }
          : m
      )
    );
    setSelectedMemberForPoints(null);
  };

  // Coupon Handlers
  const handleAddCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    const newCp: Coupon = {
      id: `cp-${Date.now()}`,
      code: couponCode.toUpperCase(),
      type: couponType,
      value: Number(couponValue),
      minSpend: Number(couponMinSpend),
      expiryDate: couponExpiry,
      isActive: true
    };

    setCoupons(prev => [newCp, ...prev]);
    setIsAddCouponOpen(false);
    setCouponCode('');
  };

  const handleToggleCoupon = (id: string) => {
    setCoupons(prev => prev.map(c => (c.id === id ? { ...c, isActive: !c.isActive } : c)));
  };

  const handleDeleteCoupon = (id: string) => {
    setCoupons(prev => prev.filter(c => c.id !== id));
  };

  const filteredMembers = members.filter(
    m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.phone.includes(searchTerm) || m.id.includes(searchTerm)
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Users className="w-6 h-6 text-red-500" />
            <span>ระบบสมาชิก CRM และคูปองส่วนลด</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            บริหารจัดการสมาชิก สะสมแต้ม แลกของรางวัล และรหัสส่วนลดโปรโมชัน
          </p>
        </div>

        <div>
          {activeTab === 'members' ? (
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 text-white font-bold text-xs rounded-xl flex items-center space-x-2 shadow-lg transition"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>เพิ่มสมาชิกใหม่</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAddCouponOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs rounded-xl flex items-center space-x-2 shadow-lg transition"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>สร้างคูปองส่วนลดใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'members'
              ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>1. จัดการสมาชิก ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
            activeTab === 'coupons'
              ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>2. คูปองส่วนลด & โปรโมชัน ({coupons.length})</span>
        </button>
      </div>

      {/* TAB 1: MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อ, เบอร์โทรศัพท์, รหัส..."
              className="w-full px-3.5 py-2 pl-9 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200 min-w-[700px]">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">รหัสสมาชิก</th>
                    <th className="p-3.5">ชื่อ-นามสกุล</th>
                    <th className="p-3.5">เบอร์โทรศัพท์</th>
                    <th className="p-3.5 text-center">คะแนนสะสม</th>
                    <th className="p-3.5 text-center">ระดับสมาชิก</th>
                    <th className="p-3.5 text-center">จัดการแต้ม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredMembers.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono font-bold text-amber-400">{m.id}</td>
                      <td className="p-3.5 font-bold text-slate-100">{m.name}</td>
                      <td className="p-3.5 font-mono text-slate-300">{m.phone}</td>
                      <td className="p-3.5 text-center font-bold text-emerald-400 font-mono text-sm">
                        {m.points.toLocaleString()} แต้ม
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            m.tier === 'Platinum'
                              ? 'bg-purple-950/80 border-purple-500/40 text-purple-300'
                              : m.tier === 'Gold'
                              ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {m.tier}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => setSelectedMemberForPoints(m)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg border border-slate-700 transition"
                        >
                          + / - แต้ม
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COUPONS */}
      {activeTab === 'coupons' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {coupons.map(cp => (
            <div
              key={cp.id}
              className={`bg-slate-900 border p-5 rounded-2xl space-y-3 relative shadow-lg ${
                cp.isActive ? 'border-slate-800' : 'border-rose-900/40 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono font-black text-sm tracking-wider">
                  {cp.code}
                </span>
                <button
                  onClick={() => handleToggleCoupon(cp.id)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                    cp.isActive
                      ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {cp.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </button>
              </div>

              <div className="text-xl font-black text-slate-100">
                {cp.type === 'fixed' ? `ส่วนลด ฿${cp.value}` : `ส่วนลด ${cp.value}%`}
              </div>

              <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800/80 pt-2">
                <div>ขั้นต่ำ: ฿{cp.minSpend}</div>
                <div>หมดอายุ: {cp.expiryDate}</div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => handleDeleteCoupon(cp.id)}
                  className="p-1 text-slate-500 hover:text-rose-400"
                  title="ลบคูปอง"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">สมัครสมาชิกใหม่</h3>
              <button onClick={() => setIsAddMemberOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">ชื่อ-นามสกุล *</label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="เช่น คุณณัฐพล สุขสันต์"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">เบอร์โทรศัพท์ *</label>
                <input
                  type="text"
                  required
                  value={newMemberPhone}
                  onChange={e => setNewMemberPhone(e.target.value)}
                  placeholder="เช่น 081-999-8888"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">ระดับสมาชิก</label>
                  <select
                    value={newMemberTier}
                    onChange={e => setNewMemberTier(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                  >
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                    <option value="Platinum">Platinum</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">แต้มแรกรับ</label>
                  <input
                    type="number"
                    value={newMemberPoints}
                    onChange={e => setNewMemberPoints(parseInt(e.target.value) || 0)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow"
                >
                  บันทึกสมาชิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST POINTS MODAL */}
      {selectedMemberForPoints && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-100 text-sm">ปรับแต้มสำหรับ {selectedMemberForPoints.name}</h3>
            <p className="text-xs text-slate-400">แต้มปัจจุบัน: <span className="font-mono font-bold text-emerald-400">{selectedMemberForPoints.points}</span></p>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-300">จำนวนแต้มที่ต้องการปรับ:</label>
              <input
                type="number"
                value={pointsChangeAmount}
                onChange={e => setPointsChangeAmount(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => handleAdjustPoints(pointsChangeAmount)}
                className="py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
              >
                + เพิ่ม {pointsChangeAmount} แต้ม
              </button>
              <button
                onClick={() => handleAdjustPoints(-pointsChangeAmount)}
                className="py-2 bg-rose-600 text-white font-bold text-xs rounded-xl"
              >
                - หัก {pointsChangeAmount} แต้ม
              </button>
            </div>

            <button
              onClick={() => setSelectedMemberForPoints(null)}
              className="w-full py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl mt-2"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* ADD COUPON MODAL */}
      {isAddCouponOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">สร้างคูปองส่วนลดใหม่</h3>
              <button onClick={() => setIsAddCouponOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCoupon} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">รหัสคูปอง (Code) *</label>
                <input
                  type="text"
                  required
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value)}
                  placeholder="เช่น DISCOUNT50"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono uppercase text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">ประเภทส่วนลด</label>
                  <select
                    value={couponType}
                    onChange={e => setCouponType(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                  >
                    <option value="fixed">จำนวนเงิน (บาท)</option>
                    <option value="percent">เปอร์เซ็นต์ (%)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">มูลค่าส่วนลด</label>
                  <input
                    type="number"
                    min="1"
                    value={couponValue}
                    onChange={e => setCouponValue(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">ยอดสั่งซื้อขั้นต่ำ</label>
                  <input
                    type="number"
                    value={couponMinSpend}
                    onChange={e => setCouponMinSpend(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">วันหมดอายุ</label>
                  <input
                    type="date"
                    value={couponExpiry}
                    onChange={e => setCouponExpiry(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCouponOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl shadow"
                >
                  สร้างคูปอง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// 7. PO & Supplier Management View (จัดซื้อ PO & ซัพพลายเออร์)
interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  leadTimeDays: number;
  status: 'Active' | 'Inactive';
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

interface POItem {
  id: string;
  poNumber: string;
  orderDate: string;
  deliveryDate: string;
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  itemsSummary: string;
  totalAmount: number;
  paymentStatus: 'ชำระแล้ว' | 'ยังไม่แนบสลิป';
  paymentMethod?: 'โอนเงิน' | 'เงินสด';
  cashNote?: string;
  paymentSlipUrl?: string;
  stockStatus: 'รับของเข้าสต๊อกแล้ว' | 'รอรับของ';
  processedBy?: string;
}

const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 's1',
    name: 'ฟาร์มเนื้อไทยกำแพงแสน',
    contactPerson: 'คุณชัยชนะ',
    phone: '085-333-4444',
    address: 'นครปฐม',
    leadTimeDays: 2,
    status: 'Active',
    bankName: 'ธนาคารกสิกรไทย (KBANK)',
    bankAccountNo: '123-1-56789-0',
    bankAccountName: 'บจก. เนื้อไทยกำแพงแสน ฟาร์มมิ่ง'
  },
  {
    id: 's2',
    name: 'ตลาดไทค้าส่งผักและเครื่องเทศ',
    contactPerson: 'คุณประเสริฐ',
    phone: '081-999-8877',
    address: 'ปทุมธานี',
    leadTimeDays: 1,
    status: 'Active',
    bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
    bankAccountNo: '405-2-98765-1',
    bankAccountName: 'ร้านตลาดไทค้าส่งผัก'
  },
  {
    id: 's3',
    name: 'เบทาโกร',
    contactPerson: 'ฝ่ายขายจัดซื้อ',
    phone: '02-792-1111',
    address: 'กรุงเทพมหานคร',
    leadTimeDays: 2,
    status: 'Active',
    bankName: 'ธนาคารกรุงเทพ (BBL)',
    bankAccountNo: '001-3-45678-9',
    bankAccountName: 'บมจ. เบทาโกร'
  }
];

const INITIAL_PO_LIST: POItem[] = [
  {
    id: 'po1',
    poNumber: 'PO-2026-001',
    orderDate: '2/7/2569',
    deliveryDate: '4/7/2569',
    supplierId: 's1',
    supplierName: 'ฟาร์มเนื้อไทยกำแพงแสน',
    leadTimeDays: 2,
    itemsSummary: 'เนื้อวัวบดพรีเมียม (A5) (30 kg)',
    totalAmount: 9300,
    paymentStatus: 'ชำระแล้ว',
    paymentMethod: 'โอนเงิน',
    paymentSlipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500&q=80',
    stockStatus: 'รับของเข้าสต๊อกแล้ว',
    processedBy: 'บันทึกโดยคลังแล้ว'
  },
  {
    id: 'po2',
    poNumber: 'PO-2026-002',
    orderDate: '5/7/2569',
    deliveryDate: '6/7/2569',
    supplierId: 's2',
    supplierName: 'ตลาดไทค้าส่งผักและเครื่องเทศ',
    leadTimeDays: 1,
    itemsSummary: 'ใบกะเพราแดงป่า (ฉบับพิเศษ) (10 kg)',
    totalAmount: 3925,
    paymentStatus: 'ชำระแล้ว',
    paymentMethod: 'เงินสด',
    cashNote: 'ชำระเงินสดเมื่อรับสินค้า',
    stockStatus: 'รับของเข้าสต๊อกแล้ว',
    processedBy: 'บันทึกโดยคลังแล้ว'
  },
  {
    id: 'po3',
    poNumber: 'PO-2026-003',
    orderDate: '10/7/2569',
    deliveryDate: '12/7/2569',
    supplierId: 's3',
    supplierName: 'เบทาโกร',
    leadTimeDays: 2,
    itemsSummary: 'อกไก่สดแช่เย็น (25 kg)',
    totalAmount: 4500,
    paymentStatus: 'ยังไม่แนบสลิป',
    stockStatus: 'รอรับของ'
  }
];

export const POManagementView: React.FC = () => {
  const { ingredients, updateIngredientStock } = usePOS();
  const [activeSubTab, setActiveSubTab] = useState<'po' | 'suppliers'>('po');
  const [poList, setPoList] = useState<POItem[]>(() => {
    try {
      const saved = localStorage.getItem('POS_PO_LIST');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse poList from localStorage', e);
    }
    return INITIAL_PO_LIST;
  });

  useEffect(() => {
    try {
      localStorage.setItem('POS_PO_LIST', JSON.stringify(poList));
    } catch (e) {
      console.error('Failed to save poList to localStorage', e);
    }
  }, [poList]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem('POS_SUPPLIERS');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse suppliers from localStorage', e);
    }
    return INITIAL_SUPPLIERS;
  });

  // Save suppliers to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('POS_SUPPLIERS', JSON.stringify(suppliers));
    } catch (e) {
      console.error('Failed to save suppliers to localStorage', e);
    }
  }, [suppliers]);

  // Modals state
  const [isAddPoOpen, setIsAddPoOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Supplier Editing & Deletion Modals State
  const [editingFullSupplier, setEditingFullSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  // Bank Info Edit Modal State (Screenshot 4)
  const [editingBankSupplier, setEditingBankSupplier] = useState<Supplier | null>(null);
  const [bankNameInput, setBankNameInput] = useState('');
  const [bankAccNoInput, setBankAccNoInput] = useState('');
  const [bankAccNameInput, setBankAccNameInput] = useState('');

  // Payment Slip & Cash Modal
  const [viewingPoDoc, setViewingPoDoc] = useState<POItem | null>(null);
  const [viewingSlipUrl, setViewingSlipUrl] = useState<string | null>(null);
  const [attachingSlipPoId, setAttachingSlipPoId] = useState<string | null>(null);
  const [paymentModeTab, setPaymentModeTab] = useState<'slip' | 'cash'>('slip');
  const [cashPaymentNote, setCashPaymentNote] = useState<string>('');

  // New PO Form
  const [newPoSupplierId, setNewPoSupplierId] = useState(suppliers[0]?.id || '');
  const [newPoItemsSummary, setNewPoItemsSummary] = useState('');
  const [newPoAmount, setNewPoAmount] = useState<number>(0);

  // New Supplier Form
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppContact, setNewSuppContact] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('');
  const [newSuppAddress, setNewSuppAddress] = useState('');
  const [newSuppLeadTime, setNewSuppLeadTime] = useState(1);
  const [newSuppBankName, setNewSuppBankName] = useState('ธนาคารกสิกรไทย (KBANK)');
  const [newSuppBankAccNo, setNewSuppBankAccNo] = useState('');
  const [newSuppBankAccName, setNewSuppBankAccName] = useState('');

  // Handle Edit Bank Info Modal Open
  const handleOpenBankEdit = (supplier: Supplier) => {
    setEditingBankSupplier(supplier);
    setBankNameInput(supplier.bankName);
    setBankAccNoInput(supplier.bankAccountNo);
    setBankAccNameInput(supplier.bankAccountName);
  };

  // Handle Save Bank Info
  const handleSaveBankInfo = () => {
    if (!editingBankSupplier) return;
    setSuppliers(prev =>
      prev.map(s =>
        s.id === editingBankSupplier.id
          ? {
              ...s,
              bankName: bankNameInput,
              bankAccountNo: bankAccNoInput,
              bankAccountName: bankAccNameInput
            }
          : s
      )
    );
    setEditingBankSupplier(null);
  };

  // Handle Create PO
  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const supp = suppliers.find(s => s.id === newPoSupplierId) || suppliers[0];
    const today = new Date();
    const orderDateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
    const delivDate = new Date(today);
    delivDate.setDate(delivDate.getDate() + (supp?.leadTimeDays || 1));
    const delivDateStr = `${delivDate.getDate()}/${delivDate.getMonth() + 1}/${delivDate.getFullYear() + 543}`;

    const newPO: POItem = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-00${poList.length + 1}`,
      orderDate: orderDateStr,
      deliveryDate: delivDateStr,
      supplierId: supp?.id || 's1',
      supplierName: supp?.name || 'ซัพพลายเออร์',
      leadTimeDays: supp?.leadTimeDays || 1,
      itemsSummary: newPoItemsSummary || 'วัตถุดิบจัดซื้อทั่วไป',
      totalAmount: newPoAmount || 1000,
      paymentStatus: 'ยังไม่แนบสลิป',
      stockStatus: 'รอรับของ'
    };

    setPoList([newPO, ...poList]);
    setIsAddPoOpen(false);
    setNewPoItemsSummary('');
    setNewPoAmount(0);
  };

  // Handle Create Supplier
  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuppName.trim()) return;

    const newSupp: Supplier = {
      id: `s${Date.now()}`,
      name: newSuppName,
      contactPerson: newSuppContact || 'ผู้ติดต่อ',
      phone: newSuppPhone || '080-000-0000',
      address: newSuppAddress || 'กรุงเทพมหานคร',
      leadTimeDays: Number(newSuppLeadTime) || 1,
      status: 'Active',
      bankName: newSuppBankName,
      bankAccountNo: newSuppBankAccNo || '000-0-00000-0',
      bankAccountName: newSuppBankAccName || newSuppName
    };

    setSuppliers([...suppliers, newSupp]);
    setIsAddSupplierOpen(false);
    setNewSuppName('');
    setNewSuppContact('');
    setNewSuppPhone('');
    setNewSuppAddress('');
  };

  // Handle Save Edited Full Supplier Info
  const handleSaveFullSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFullSupplier) return;
    setSuppliers(prev =>
      prev.map(s => (s.id === editingFullSupplier.id ? editingFullSupplier : s))
    );
    setEditingFullSupplier(null);
  };

  // Handle Delete Supplier
  const handleDeleteSupplierConfirm = () => {
    if (!supplierToDelete) return;
    setSuppliers(prev => prev.filter(s => s.id !== supplierToDelete.id));
    setSupplierToDelete(null);
  };

  // Handle Toggle Supplier Active Status
  const handleToggleSupplierStatus = (id: string) => {
    setSuppliers(prev =>
      prev.map(s =>
        s.id === id ? { ...s, status: s.status === 'Active' ? 'Inactive' : 'Active' } : s
      )
    );
  };

  // Handle Delete PO
  const handleDeletePo = (poId: string) => {
    const targetPo = poList.find(p => p.id === poId);
    if (window.confirm(`คุณต้องการลบใบสั่งซื้อ (PO) ${targetPo ? targetPo.poNumber : ''} นี้ออกจากระบบใช่หรือไม่?`)) {
      setPoList(prev => prev.filter(p => p.id !== poId));
      if (viewingPoDoc?.id === poId) {
        setViewingPoDoc(null);
      }
    }
  };

  // Handle Receive PO items into stock
  const handleReceiveStock = (poId: string) => {
    setPoList(prev =>
      prev.map(p => {
        if (p.id === poId) {
          return {
            ...p,
            stockStatus: 'รับของเข้าสต๊อกแล้ว',
            processedBy: 'บันทึกโดยคลังแล้ว'
          };
        }
        return p;
      })
    );

    // If ingredient matches, add stock
    const po = poList.find(p => p.id === poId);
    if (po && ingredients.length > 0) {
      // Find matching ingredient
      const match = ingredients.find(ing => po.itemsSummary.includes(ing.name));
      if (match) {
        updateIngredientStock(match.id, match.currentStock + 10);
      }
    }
  };

  // Handle Attach Slip Mock
  const handleAttachSlip = (poId: string) => {
    setPoList(prev =>
      prev.map(p =>
        p.id === poId
          ? {
              ...p,
              paymentStatus: 'ชำระแล้ว',
              paymentMethod: 'โอนเงิน',
              paymentSlipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500&q=80'
            }
          : p
      )
    );
    setAttachingSlipPoId(null);
  };

  // Handle Pay Cash
  const handlePayCash = (poId: string) => {
    setPoList(prev =>
      prev.map(p =>
        p.id === poId
          ? {
              ...p,
              paymentStatus: 'ชำระแล้ว',
              paymentMethod: 'เงินสด',
              cashNote: cashPaymentNote || 'ชำระเงินสดเรียบร้อยแล้ว'
            }
          : p
      )
    );
    setAttachingSlipPoId(null);
    setCashPaymentNote('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Header Box */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Truck className="w-6 h-6 text-orange-500" />
            <span>การสั่งซื้อและซัพพลายเออร์ (Procurement & Suppliers)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            สร้างใบสั่งซื้อวัตถุดิบ (PO) คำนวณวันส่งมอบอัตโนมัติ แนบหลักฐานการชำระเงิน และบริหารคู่ค้า
          </p>
        </div>
        <button
          onClick={() => {
            if (activeSubTab === 'po') {
              setIsAddPoOpen(true);
            } else {
              setIsAddSupplierOpen(true);
            }
          }}
          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-orange-950/40 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>{activeSubTab === 'po' ? 'เปิดใบสั่งซื้อ PO ใหม่' : 'เพิ่มคู่ค้าซัพพลายเออร์'}</span>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-800 space-x-8">
        <button
          onClick={() => setActiveSubTab('po')}
          className={`pb-3 font-bold text-xs sm:text-sm flex items-center space-x-2 border-b-2 transition ${
            activeSubTab === 'po'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-4 h-4" />
          <span>ประวัติใบสั่งซื้อ PO ({poList.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('suppliers')}
          className={`pb-3 font-bold text-xs sm:text-sm flex items-center space-x-2 border-b-2 transition ${
            activeSubTab === 'suppliers'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>บัญชีคู่ค้า / ซัพพลายเออร์ ({suppliers.length})</span>
        </button>
      </div>

      {/* TAB 1: PO History */}
      {activeSubTab === 'po' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200 min-w-[850px]">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 whitespace-nowrap">เลขที่ PO / วันที่สั่ง & กำหนดส่ง</th>
                  <th className="p-3.5 whitespace-nowrap">ซัพพลายเออร์ (LEAD TIME)</th>
                  <th className="p-3.5 whitespace-nowrap">วัตถุดิบสั่งซื้อ</th>
                  <th className="p-3.5 text-right whitespace-nowrap">ยอดรวมสุทธิ</th>
                  <th className="p-3.5 text-center whitespace-nowrap">หลักฐานการชำระ</th>
                  <th className="p-3.5 text-center whitespace-nowrap">สถานะรับสินค้า</th>
                  <th className="p-3.5 text-center whitespace-nowrap">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {poList.map(po => (
                  <tr key={po.id} className="hover:bg-slate-800/40 transition">
                    {/* PO # & Dates */}
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-amber-400 text-sm">{po.poNumber}</div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>สั่งเมื่อ: {po.orderDate}</span>
                        </span>
                        <span className="flex items-center space-x-1 text-amber-300 font-semibold">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>ส่งมอบ: {po.deliveryDate}</span>
                        </span>
                      </div>
                    </td>

                    {/* Supplier */}
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-100">{po.supplierName}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Lead time: {po.leadTimeDays} วัน</div>
                    </td>

                    {/* Items */}
                    <td className="p-3.5">
                      <div className="font-medium text-slate-200 max-w-xs line-clamp-2">{po.itemsSummary}</div>
                    </td>

                    {/* Net Total */}
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <div className="font-bold text-emerald-400 text-sm">
                        {po.totalAmount.toLocaleString('th-TH')} ฿
                      </div>
                    </td>

                    {/* Payment Slip & Status */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center space-y-1">
                        {po.paymentStatus === 'ชำระแล้ว' ? (
                          <>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-950/80 border-emerald-500/40 text-emerald-300 flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ชำระแล้ว {po.paymentMethod === 'เงินสด' ? '(เงินสด)' : '(โอนเงิน)'}</span>
                            </span>
                            {po.paymentMethod === 'เงินสด' ? (
                              <span className="text-[10px] text-amber-300/90 font-medium flex items-center space-x-1 mt-0.5">
                                <Banknote className="w-3.5 h-3.5 text-amber-400" />
                                <span>{po.cashNote || 'ชำระเงินสดเรียบร้อย'}</span>
                              </span>
                            ) : po.paymentSlipUrl ? (
                              <button
                                onClick={() => setViewingSlipUrl(po.paymentSlipUrl || null)}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold underline mt-0.5"
                              >
                                <Eye className="w-3 h-3" />
                                <span>ดูสลิปหลักฐาน</span>
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-rose-950/80 border-rose-500/40 text-rose-300 flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>ยังไม่ชำระเงิน / ยังไม่แนบสลิป</span>
                            </span>
                            <button
                              onClick={() => {
                                setAttachingSlipPoId(po.id);
                                setPaymentModeTab('slip');
                                setCashPaymentNote('');
                              }}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg transition mt-1 flex items-center space-x-1 shadow"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>แนบสลิป / ชำระเงินสด</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Stock Status */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
                          po.stockStatus === 'รับของเข้าสต๊อกแล้ว'
                            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                        }`}
                      >
                        {po.stockStatus}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => setViewingPoDoc(po)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700/80 transition flex items-center space-x-1 shadow"
                          title="ดูและพิมพ์ใบสั่งซื้อ PO"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>ดู/พิมพ์ PO</span>
                        </button>
                        {po.stockStatus === 'รับของเข้าสต๊อกแล้ว' ? (
                          <div className="inline-flex items-center space-x-1 text-slate-400 text-xs">
                            <User className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{po.processedBy || 'รับเข้าคลังแล้ว'}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleReceiveStock(po.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition active:scale-95"
                          >
                            รับของเข้าสต๊อก
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePo(po.id)}
                          className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs rounded-xl transition flex items-center justify-center shadow active:scale-95"
                          title="ลบใบสั่งซื้อ PO นี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Suppliers */}
      {activeSubTab === 'suppliers' && (
        <div className="space-y-6">
          {/* Top Dotted Add Card */}
          <div
            onClick={() => setIsAddSupplierOpen(true)}
            className="border-2 border-dashed border-slate-800 hover:border-orange-500/50 bg-slate-900/50 hover:bg-slate-900 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group"
          >
            <div className="w-12 h-12 rounded-full bg-slate-800 group-hover:bg-orange-500/20 text-slate-400 group-hover:text-orange-400 flex items-center justify-center transition">
              <Plus className="w-6 h-6" />
            </div>
            <div className="font-bold text-slate-200 group-hover:text-orange-400">เพิ่มซัพพลายเออร์คู่ค้าใหม่</div>
            <p className="text-xs text-slate-500">สร้างบัญชีคู่ค้าสำหรับจัดซื้อวัตถุดิบ</p>
          </div>

          {/* Supplier Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suppliers.map(supp => (
              <div key={supp.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg hover:border-slate-700 transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-950/80 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-base">{supp.name}</div>
                      <div className="text-xs text-slate-400 font-mono">ID: {supp.id}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSupplierStatus(supp.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                        supp.status === 'Active'
                          ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'
                          : 'bg-rose-950/80 border-rose-500/40 text-rose-300 hover:bg-rose-900'
                      }`}
                      title="คลิกเพื่อเปลี่ยนสถานะคู่ค้า"
                    >
                      {supp.status === 'Active' ? '🟢 Active' : '🔴 Inactive'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingFullSupplier(supp)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition border border-slate-700"
                      title="แก้ไขข้อมูลคู่ค้า"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSupplierToDelete(supp)}
                      className="p-1.5 bg-rose-950/50 hover:bg-rose-900/80 text-rose-400 hover:text-rose-200 rounded-lg transition border border-rose-800/50"
                      title="ลบคู่ค้าออกจากระบบ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-300 border-t border-b border-slate-800/80 py-3">
                  <div>
                    <span className="text-slate-400 font-medium">โทร:</span> {supp.phone} ({supp.contactPerson})
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">ที่อยู่:</span> {supp.address}
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Lead time:</span> {supp.leadTimeDays} วัน
                  </div>
                </div>

                {/* Bank Details Display */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-orange-400" />
                    <span>ข้อมูลบัญชีธนาคารสำหรับจ่ายเงิน</span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-slate-200">{supp.bankName}</div>
                    <div className="font-mono text-amber-400 font-bold">{supp.bankAccountNo}</div>
                    <div className="text-slate-400 text-[11px]">{supp.bankAccountName}</div>
                  </div>

                  <button
                    onClick={() => handleOpenBankEdit(supp)}
                    className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-orange-400 hover:text-orange-300 text-xs font-bold rounded-lg transition border border-slate-700 flex items-center justify-center space-x-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>แก้ไขข้อมูลบัญชีธนาคารสำหรับจ่ายเงิน</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: Edit Bank Account Info (Matching Screenshot 4 exactly) */}
      {editingBankSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">แก้ไขข้อมูลบัญชีธนาคารสำหรับจ่ายเงิน</h3>
              <button
                onClick={() => setEditingBankSupplier(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Top Banner / Supplier info box */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-orange-950/80 border border-orange-500/40 text-orange-400 flex items-center justify-center flex-shrink-0">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">แก้ไขให้กับซัพพลายเออร์</div>
                  <div className="text-sm font-bold text-slate-100">{editingBankSupplier.name}</div>
                </div>
              </div>

              {/* Form Input 1: Bank Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  เลือกหรือระบุชื่อธนาคาร / ช่องทางชำระเงิน
                </label>
                <select
                  value={bankNameInput}
                  onChange={e => setBankNameInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  <option value="ธนาคารกสิกรไทย (KBANK)">ธนาคารกสิกรไทย (KBANK)</option>
                  <option value="ธนาคารไทยพาณิชย์ (SCB)">ธนาคารไทยพาณิชย์ (SCB)</option>
                  <option value="ธนาคารกรุงเทพ (BBL)">ธนาคารกรุงเทพ (BBL)</option>
                  <option value="ธนาคารกรุงไทย (KTB)">ธนาคารกรุงไทย (KTB)</option>
                  <option value="ธนาคารกรุงศรีอยุธยา (BAY)">ธนาคารกรุงศรีอยุธยา (BAY)</option>
                  <option value="ธนาคารออมสิน (GSB)">ธนาคารออมสิน (GSB)</option>
                  <option value="พร้อมเพย์ (PromptPay)">พร้อมเพย์ (PromptPay)</option>
                </select>
              </div>

              {/* Form Input 2: Account Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">เลขที่บัญชีรับเงิน (Account No.)</label>
                <input
                  type="text"
                  value={bankAccNoInput}
                  onChange={e => setBankAccNoInput(e.target.value)}
                  placeholder="เช่น 123-1-56789-0"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Form Input 3: Account Holder Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  ชื่อบัญชีผู้รับเงิน (Account Holder Name)
                </label>
                <input
                  type="text"
                  value={bankAccNameInput}
                  onChange={e => setBankAccNameInput(e.target.value)}
                  placeholder="ชื่อบัญชีบริษัทหรือชื่อบุคคล"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingBankSupplier(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={handleSaveBankInfo}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/50 transition active:scale-95"
              >
                บันทึกการตั้งค่า
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Full Supplier Details */}
      {editingFullSupplier && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Building className="w-5 h-5 text-orange-400" />
                <span>แก้ไขข้อมูลซัพพลายเออร์ / คู่ค้า</span>
              </h3>
              <button
                onClick={() => setEditingFullSupplier(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFullSupplier} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">ชื่อซัพพลายเออร์ / ร้านค้า *</label>
                <input
                  type="text"
                  required
                  value={editingFullSupplier.name}
                  onChange={e => setEditingFullSupplier({ ...editingFullSupplier, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">ชื่อผู้ติดต่อ</label>
                  <input
                    type="text"
                    value={editingFullSupplier.contactPerson}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    value={editingFullSupplier.phone}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">ที่อยู่ / จังหวัด</label>
                <input
                  type="text"
                  value={editingFullSupplier.address}
                  onChange={e => setEditingFullSupplier({ ...editingFullSupplier, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">ระยะเวลาส่งของ (Lead time - วัน)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingFullSupplier.leadTimeDays}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, leadTimeDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">สถานะ</label>
                  <select
                    value={editingFullSupplier.status}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Active">🟢 Active (เปิดใช้งาน)</option>
                    <option value="Inactive">🔴 Inactive (ปิดใช้งาน)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="font-bold text-orange-400">ข้อมูลบัญชีธนาคารสำหรับจ่ายเงิน</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="ชื่อธนาคาร"
                    value={editingFullSupplier.bankName}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, bankName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100"
                  />
                  <input
                    type="text"
                    placeholder="เลขที่บัญชี"
                    value={editingFullSupplier.bankAccountNo}
                    onChange={e => setEditingFullSupplier({ ...editingFullSupplier, bankAccountNo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono"
                  />
                </div>
                <input
                  type="text"
                  placeholder="ชื่อบัญชี"
                  value={editingFullSupplier.bankAccountName}
                  onChange={e => setEditingFullSupplier({ ...editingFullSupplier, bankAccountName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingFullSupplier(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold shadow-lg"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Supplier Confirm */}
      {supplierToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-950/80 border border-rose-800 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-100 text-base">ยืนยันการลบคู่ค้า / ซัพพลายเออร์</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบซัพพลายเออร์ <strong className="text-slate-100">{supplierToDelete.name}</strong> ออกจากระบบ? การดำเนินการนี้จะลบบัญชีคู่ค้าออกจากฐานข้อมูลอย่างถาวร
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setSupplierToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeleteSupplierConfirm}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition active:scale-95"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New PO */}
      {isAddPoOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">เปิดใบสั่งซื้อ PO ใหม่</h3>
              <button
                onClick={() => setIsAddPoOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">เลือกซัพพลายเออร์</label>
                <select
                  value={newPoSupplierId}
                  onChange={e => setNewPoSupplierId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Lead time {s.leadTimeDays} วัน)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">รายชื่อวัตถุดิบและจำนวนที่สั่งซื้อ</label>
                <input
                  type="text"
                  required
                  value={newPoItemsSummary}
                  onChange={e => setNewPoItemsSummary(e.target.value)}
                  placeholder="เช่น เนื้อวัวบดพรีเมียม (30 kg)"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">ยอดรวมสุทธิ (บาท)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newPoAmount || ''}
                  onChange={e => setNewPoAmount(parseFloat(e.target.value) || 0)}
                  placeholder="เช่น 9300"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end space-x-3 -mx-5 -mb-5 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddPoOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/50 transition active:scale-95"
                >
                  สร้างใบสั่งซื้อ PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create New Supplier */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">เพิ่มซัพพลายเออร์คู่ค้าใหม่</h3>
              <button
                onClick={() => setIsAddSupplierOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">ชื่อบริษัท / ร้านคู่ค้า *</label>
                <input
                  type="text"
                  required
                  value={newSuppName}
                  onChange={e => setNewSuppName(e.target.value)}
                  placeholder="เช่น ฟาร์มเนื้อไทยกำแพงแสน"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">ผู้ติดต่อ</label>
                  <input
                    type="text"
                    value={newSuppContact}
                    onChange={e => setNewSuppContact(e.target.value)}
                    placeholder="เช่น คุณชัยชนะ"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    value={newSuppPhone}
                    onChange={e => setNewSuppPhone(e.target.value)}
                    placeholder="เช่น 085-333-4444"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">จังหวัด / ที่อยู่</label>
                  <input
                    type="text"
                    value={newSuppAddress}
                    onChange={e => setNewSuppAddress(e.target.value)}
                    placeholder="เช่น นครปฐม"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Lead time (วัน)</label>
                  <input
                    type="number"
                    min="1"
                    value={newSuppLeadTime}
                    onChange={e => setNewSuppLeadTime(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="text-xs font-bold text-orange-400 flex items-center space-x-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>ข้อมูลบัญชีธนาคารสำหรับจ่ายเงิน</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">ธนาคาร</label>
                  <input
                    type="text"
                    value={newSuppBankName}
                    onChange={e => setNewSuppBankName(e.target.value)}
                    placeholder="เช่น ธนาคารกสิกรไทย (KBANK)"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">เลขที่บัญชี</label>
                  <input
                    type="text"
                    value={newSuppBankAccNo}
                    onChange={e => setNewSuppBankAccNo(e.target.value)}
                    placeholder="เช่น 123-1-56789-0"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">ชื่อบัญชีผู้รับเงิน</label>
                  <input
                    type="text"
                    value={newSuppBankAccName}
                    onChange={e => setNewSuppBankAccName(e.target.value)}
                    placeholder="ชื่อบริษัทหรือบัญชีผู้รับเงิน"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end space-x-3 -mx-5 -mb-5 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/50 transition active:scale-95"
                >
                  บันทึกคู่ค้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: View Slip Image */}
      {viewingSlipUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-5 space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">หลักฐานการชำระเงิน (สลิปโอนเงิน)</h3>
              <button
                onClick={() => setViewingSlipUrl(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <img src={viewingSlipUrl} alt="Payment Slip" className="w-full max-h-80 object-cover" />
            </div>
            <button
              onClick={() => setViewingSlipUrl(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* MODAL 5: Attach Slip or Pay Cash */}
      {attachingSlipPoId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">ชำระเงินค่าวัตถุดิบ (PO)</h3>
              <button
                onClick={() => setAttachingSlipPoId(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setPaymentModeTab('slip')}
                className={`py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                  paymentModeTab === 'slip'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>แนบสลิปโอนเงิน</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentModeTab('cash')}
                className={`py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                  paymentModeTab === 'cash'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>ชำระเงินสด</span>
              </button>
            </div>

            {paymentModeTab === 'slip' ? (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 bg-slate-950 rounded-xl p-6 text-center space-y-2 cursor-pointer transition">
                  <UploadCloud className="w-8 h-8 text-amber-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">อัปโหลดสลิปโอนเงิน</div>
                  <p className="text-[11px] text-slate-400">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่ออัปโหลดไฟล์ (JPG, PNG)</p>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    onClick={() => setAttachingSlipPoId(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => handleAttachSlip(attachingSlipPoId)}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow transition"
                  >
                    ยืนยันแนบสลิป
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                    <Banknote className="w-4 h-4" />
                    <span>บันทึกการชำระเงินสดให้ซัพพลายเออร์</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300">
                      รายละเอียด/บันทึกเพิ่มเติม (Optional)
                    </label>
                    <input
                      type="text"
                      value={cashPaymentNote}
                      onChange={e => setCashPaymentNote(e.target.value)}
                      placeholder="เช่น ชำระเงินสดหน้าร้านให้พนักงานส่งมอบ"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    onClick={() => setAttachingSlipPoId(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => handlePayCash(attachingSlipPoId)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition"
                  >
                    บันทึกชำระด้วยเงินสด
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 6: Printable PO Document View with Print, PNG, PDF Buttons */}
      {viewingPoDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-orange-400" />
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  ใบสั่งซื้อวัตถุดิบ / Purchase Order ({viewingPoDoc.poNumber})
                </h3>
              </div>
              <button
                onClick={() => setViewingPoDoc(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 font-medium">ส่งออกเอกสาร / พิมพ์ PO:</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => exportToPNG('po-printable-doc', viewingPoDoc.poNumber)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl transition flex items-center space-x-1.5 border border-slate-700"
                  title="บันทึกใบ PO เป็นภาพ PNG"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>บันทึก PNG</span>
                </button>
                <button
                  onClick={() => exportToPDF('po-printable-doc', viewingPoDoc.poNumber, 'a4')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold rounded-xl transition flex items-center space-x-1.5 border border-slate-700"
                  title="บันทึกใบ PO เป็น PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span>บันทึก PDF</span>
                </button>
                <button
                  onClick={() => printElement('po-printable-doc', `Purchase-Order-${viewingPoDoc.poNumber}`)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-lg transition flex items-center space-x-1.5"
                  title="พิมพ์เอกสาร PO"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์เอกสาร</span>
                </button>
                <button
                  onClick={() => handleDeletePo(viewingPoDoc.id)}
                  className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold rounded-xl transition flex items-center space-x-1.5 active:scale-95 shadow"
                  title="ลบใบสั่งซื้อ PO นี้"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>ลบ PO นี้</span>
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-950">
              <div
                id="po-printable-doc"
                className="bg-white text-slate-900 p-8 rounded-xl shadow-xl border border-slate-300 font-sans text-xs space-y-6 max-w-xl mx-auto select-text"
              >
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <img src={SHOP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                      <h2 className="font-extrabold text-lg text-slate-900">ครัวกะเพรา POS Enterprise</h2>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">ใบสั่งซื้อวัตถุดิบ / Purchase Order (PO)</p>
                    <p className="text-[10px] text-slate-500">โทร: 02-123-4567 | อีเมล: procurement@kapraopos.com</p>
                  </div>
                  <div className="text-right">
                    <div className="inline-block bg-orange-100 text-orange-900 font-mono font-extrabold px-3 py-1 rounded text-sm border border-orange-300">
                      {viewingPoDoc.poNumber}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">วันที่สั่งซื้อ: {viewingPoDoc.orderDate}</p>
                    <p className="text-[11px] font-semibold text-orange-800">กำหนดส่งมอบ: {viewingPoDoc.deliveryDate}</p>
                  </div>
                </div>

                {/* Supplier & Delivery Info Grid */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[11px]">
                  <div>
                    <span className="font-bold text-slate-800 block border-b border-slate-300 pb-1 mb-1">
                      คู่ค้า / ซัพพลายเออร์ (Supplier):
                    </span>
                    <p className="font-bold text-slate-900 text-xs">{viewingPoDoc.supplierName}</p>
                    <p className="text-slate-600">ระยะเวลาจัดส่ง (Lead time): {viewingPoDoc.leadTimeDays} วัน</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block border-b border-slate-300 pb-1 mb-1">
                      สถานที่จัดส่ง / รับสินค้า:
                    </span>
                    <p className="font-bold text-slate-900">ครัวกะเพรา สาขาหลัก (Head Office)</p>
                    <p className="text-slate-600">แผนกคลังวัตถุดิบและจัดซื้อ</p>
                  </div>
                </div>

                {/* Items Summary Table */}
                <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <th className="p-2.5 border-r border-slate-300 text-center w-12">ลำดับ</th>
                      <th className="p-2.5 border-r border-slate-300">รายการวัตถุดิบ / รายละเอียด</th>
                      <th className="p-2.5 text-right w-36">จำนวนเงินรวม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono">1</td>
                      <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-900">
                        {viewingPoDoc.itemsSummary}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {viewingPoDoc.totalAmount.toLocaleString('th-TH')} ฿
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals & Status */}
                <div className="flex justify-between items-start pt-2">
                  <div className="space-y-1 text-[11px]">
                    <p className="font-semibold text-slate-700">
                      สถานะการชำระเงิน: <span className="font-bold text-slate-900">{viewingPoDoc.paymentStatus}</span>
                    </p>
                    <p className="font-semibold text-slate-700">
                      สถานะคลังสินค้า: <span className="font-bold text-slate-900">{viewingPoDoc.stockStatus}</span>
                    </p>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 text-right space-y-1">
                    <span className="text-[11px] text-slate-600 block">ยอดรวมสุทธิ (Net Total)</span>
                    <span className="text-lg font-extrabold text-orange-700 font-mono">
                      {viewingPoDoc.totalAmount.toLocaleString('th-TH')} ฿
                    </span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-[10px] text-slate-600">
                  <div>
                    <div className="border-b border-slate-400 pb-8 mb-1"></div>
                    <p className="font-semibold text-slate-800">ผู้จัดทำใบสั่งซื้อ</p>
                    <p>วันที่ ...../...../..........</p>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 pb-8 mb-1"></div>
                    <p className="font-semibold text-slate-800">ผู้อนุมัติสั่งซื้อ / ผู้จัดการ</p>
                    <p>วันที่ ...../...../..........</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to convert numeric Baht into Thai Baht Text
const thaiBahtText = (amount: number): string => {
  if (isNaN(amount) || amount <= 0) return 'ศูนย์บาทถ้วน';

  const numText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const unitText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  const absAmount = Math.abs(amount);
  const [bahtStr, satangStr] = absAmount.toFixed(2).split('.');

  const convertGroup = (numStr: string): string => {
    let res = '';
    const len = numStr.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(numStr[i], 10);
      const pos = len - i - 1;
      if (digit !== 0) {
        if (pos === 1 && digit === 1) {
          res += 'สิบ';
        } else if (pos === 1 && digit === 2) {
          res += 'ยี่สิบ';
        } else if (pos === 0 && digit === 1 && len > 1 && numStr[i - 1] !== '0') {
          res += 'เอ็ด';
        } else {
          res += numText[digit] + unitText[pos];
        }
      }
    }
    return res;
  };

  let bahtRes = '';
  const n = parseInt(bahtStr, 10);
  if (n === 0) {
    bahtRes = 'ศูนย์';
  } else {
    let tempStr = bahtStr;
    const groups: string[] = [];
    while (tempStr.length > 0) {
      groups.unshift(tempStr.slice(Math.max(0, tempStr.length - 6)));
      tempStr = tempStr.slice(0, Math.max(0, tempStr.length - 6));
    }
    bahtRes = groups
      .map((g, idx) => {
        const converted = convertGroup(g);
        const millionSuffix = idx < groups.length - 1 ? 'ล้าน' : '';
        return converted + millionSuffix;
      })
      .join('');
  }

  const satangVal = parseInt(satangStr, 10);
  let satangRes = '';
  if (satangVal === 0) {
    satangRes = 'ถ้วน';
  } else {
    satangRes = convertGroup(satangStr) + 'สตางค์';
  }

  return (bahtRes === 'ศูนย์' ? 'ศูนย์บาท' : bahtRes + 'บาท') + satangRes;
};

// 8. Tax Receipt & Invoice View (ใบเสร็จรับเงินและใบกำกับภาษี)
export const TaxReceiptView: React.FC = () => {
  const { orders, updateOrderTaxInfo, addTaxInvoiceOrder, currentBranch, menuItems } = usePOS();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'abb' | 'full'>('all');

  // Edit / Print Modals
  const [editingTaxOrder, setEditingTaxOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  // New Receipt Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states for creating a new receipt / tax invoice
  const [selectedPosOrderId, setSelectedPosOrderId] = useState('');
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [docType, setDocType] = useState<'full' | 'general' | 'abb'>('full');
  const [crmCustomer, setCrmCustomer] = useState('');

  const [formCompany, setFormCompany] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formBranch, setFormBranch] = useState('สำนักงานใหญ่');
  const [formDate, setFormDate] = useState('24 ก.ค. 2569');
  const [formAddress, setFormAddress] = useState('');

  // Line items
  const [newItems, setNewItems] = useState<
    { id: string; name: string; quantity: number; unitPrice: number; total: number }[]
  >([
    { id: '1', name: 'ชุดอาหารกะเพราจัดเลี้ยง', quantity: 1, unitPrice: 0, total: 0 }
  ]);

  // Payment & VAT & WHT
  const [payMethod, setPayMethod] = useState<'โอนเงินเข้าบัญชี' | 'สแกน PromptPay' | 'เงินสด' | 'บัตรเครดิต'>('โอนเงินเข้าบัญชี');
  const [payRef, setPayRef] = useState('');
  const [vatType, setVatType] = useState<'inclusive' | 'exclusive' | 'none'>('inclusive');
  const [whtRate, setWhtRate] = useState<number>(0);
  const [autoIncomeLog, setAutoIncomeLog] = useState(true);

  // Form state for Edit Tax Info Modal
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editBranchCode, setEditBranchCode] = useState('00000');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Computed summary stats for top cards
  const totalReceiptsCount = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + o.grandTotal, 0);
  const totalVat = orders.reduce((sum, o) => {
    const vat = o.vatAmount || (o.grandTotal - o.grandTotal / 1.07);
    return sum + vat;
  }, 0);
  const totalWht = orders.reduce((sum, o) => {
    if (o.customerTaxInfo) {
      const base = o.grandTotal / 1.07;
      return sum + base * 0.03;
    }
    return sum;
  }, 336.45);

  // Computed totals for New Receipt Form
  const rawSubtotal = newItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  let calculatedVat = 0;
  let subtotalBeforeVat = rawSubtotal;
  let totalGrand = rawSubtotal;

  if (vatType === 'inclusive') {
    calculatedVat = (rawSubtotal * 7) / 107;
    subtotalBeforeVat = rawSubtotal - calculatedVat;
    totalGrand = rawSubtotal;
  } else if (vatType === 'exclusive') {
    calculatedVat = (rawSubtotal * 7) / 100;
    subtotalBeforeVat = rawSubtotal;
    totalGrand = rawSubtotal + calculatedVat;
  } else {
    calculatedVat = 0;
    subtotalBeforeVat = rawSubtotal;
    totalGrand = rawSubtotal;
  }

  const calculatedWht = (subtotalBeforeVat * whtRate) / 100;
  const netPaid = totalGrand - calculatedWht;

  // Handle POS Order Selection in New Receipt Modal
  const handleSelectPosOrder = (orderId: string) => {
    setSelectedPosOrderId(orderId);
    setSelectedQuotationId('');
    if (!orderId) return;

    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      setNewItems(
        ord.items.map((it, idx) => ({
          id: `pos-${idx}`,
          name: it.menuItem.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.totalPrice
        }))
      );
      if (ord.customerTaxInfo) {
        setFormCompany(ord.customerTaxInfo.companyName);
        setFormTaxId(ord.customerTaxInfo.taxId);
        setFormBranch(ord.customerTaxInfo.branchCode || 'สำนักงานใหญ่');
        setFormAddress(ord.customerTaxInfo.address);
        setFormPhone(ord.customerTaxInfo.phone || '');
        setDocType('full');
      }
    }
  };

  // Handle Quotation Selection
  const handleSelectQuotation = (qtId: string) => {
    setSelectedQuotationId(qtId);
    setSelectedPosOrderId('');
    if (!qtId) return;

    if (qtId === 'QT-2026-001') {
      setCrmCustomer('ptt');
      setFormCompany('บจก. ปตท. น้ำมันและการค้าปลีก');
      setFormTaxId('0105558000000');
      setFormPhone('081-234-5678');
      setFormBranch('สำนักงานใหญ่');
      setFormAddress('555/1 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ');
      setNewItems([
        { id: 'q1', name: 'เหมาจัดเลี้ยงอาหารกะเพราพรีเมียม (100 ชุด)', quantity: 1, unitPrice: 15000, total: 15000 }
      ]);
      setDocType('full');
    } else if (qtId === 'QT-2026-002') {
      setCrmCustomer('scg');
      setFormCompany('บจก. เอสซีจี เคมิคอลส์');
      setFormTaxId('0105559123456');
      setFormPhone('02-586-3333');
      setFormBranch('สำนักงานใหญ่');
      setFormAddress('1 ถนนปูนซิเมนต์ไทย แขวงบางซื่อ เขตบางซื่อ กรุงเทพฯ 10800');
      setNewItems([
        { id: 'q2', name: 'จัดเลี้ยงข้าวกล่องกะเพราซีฟู้ด & เครื่องดื่ม (200 ชุด)', quantity: 1, unitPrice: 25000, total: 25000 }
      ]);
      setDocType('full');
    }
  };

  // Handle CRM Customer Dropdown
  const handleSelectCrm = (val: string) => {
    setCrmCustomer(val);
    if (val === 'ptt') {
      setFormCompany('บจก. ปตท. น้ำมันและการค้าปลีก');
      setFormTaxId('0105558000000');
      setFormPhone('081-234-5678');
      setFormBranch('สำนักงานใหญ่');
      setFormAddress('555/1 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ');
    } else if (val === 'scg') {
      setFormCompany('บจก. เอสซีจี เคมิคอลส์');
      setFormTaxId('0105559123456');
      setFormPhone('02-586-3333');
      setFormBranch('สำนักงานใหญ่');
      setFormAddress('1 ถนนปูนซิเมนต์ไทย แขวงบางซื่อ เขตบางซื่อ กรุงเทพฯ 10800');
    } else if (val === 'siam') {
      setFormCompany('บจก. สยามนวัตกรรม');
      setFormTaxId('0105562098123');
      setFormPhone('02-123-4567');
      setFormBranch('สำนักงานใหญ่');
      setFormAddress('123/45 ถนนพระราม 1 ปทุมวัน กรุงเทพฯ 10330');
    }
  };

  // Item List Actions
  const handleAddItem = () => {
    setNewItems(prev => [
      ...prev,
      { id: Date.now().toString(), name: '', quantity: 1, unitPrice: 0, total: 0 }
    ]);
  };

  const handleSelectMenuToAdd = (menuId: string) => {
    if (!menuId) return;
    const m = menuItems.find(item => item.id === menuId);
    if (m) {
      setNewItems(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          name: m.name,
          quantity: 1,
          unitPrice: m.price,
          total: m.price
        }
      ]);
    }
  };

  const handleUpdateItem = (id: string, field: 'name' | 'quantity' | 'unitPrice', val: any) => {
    setNewItems(prev =>
      prev.map(it => {
        if (it.id === id) {
          const updated = { ...it, [field]: val };
          updated.total = updated.quantity * updated.unitPrice;
          return updated;
        }
        return it;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    if (newItems.length <= 1) return;
    setNewItems(prev => prev.filter(it => it.id !== id));
  };

  // Submit New Receipt
  const handleCreateReceiptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (docType === 'full' && (!formCompany.trim() || !formTaxId.trim())) {
      alert('กรุณากรอกชื่อบริษัท/ผู้เสียภาษี และ เลขประจำตัวผู้เสียภาษี (Tax ID)');
      return;
    }

    const orderNum = `#INV-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrderObj: Order = {
      id: `ord-tax-${Date.now()}`,
      orderNumber: orderNum,
      branchId: currentBranch.id,
      orderType: 'takeaway',
      items: newItems.map((it, idx) => ({
        cartItemId: `it-${idx}`,
        menuItem: {
          id: `m-${idx}`,
          name: it.name || 'รายการสินค้า/บริการ',
          nameEn: 'Service Item',
          category: 'special',
          price: it.unitPrice,
          costPrice: it.unitPrice * 0.6,
          description: '',
          image: '',
          recipe: []
        },
        quantity: it.quantity,
        selectedAddOns: [],
        unitPrice: it.unitPrice,
        totalPrice: it.quantity * it.unitPrice
      })),
      subtotal: subtotalBeforeVat,
      discountAmount: 0,
      vatAmount: calculatedVat,
      grandTotal: totalGrand,
      paymentMethod: payMethod === 'เงินสด' ? 'cash' : payMethod === 'สแกน PromptPay' ? 'promptpay' : 'transfer',
      tenderedAmount: netPaid,
      changeAmount: 0,
      status: 'served',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customerTaxInfo:
        docType === 'full'
          ? {
              companyName: formCompany || 'ลูกค้าทั่วไป',
              taxId: formTaxId || '0000000000000',
              branchCode: formBranch || 'สำนักงานใหญ่',
              address: formAddress || '-',
              phone: formPhone || '-'
            }
          : undefined,
      isFullTaxInvoiceRequested: docType === 'full'
    };

    addTaxInvoiceOrder(newOrderObj);
    setIsCreateModalOpen(false);

    // Reset Form
    setFormCompany('');
    setFormTaxId('');
    setFormAddress('');
    setFormPhone('');
    setSelectedPosOrderId('');
    setSelectedQuotationId('');
    setNewItems([{ id: '1', name: 'รายการสินค้า/บริการ', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  // Edit Tax Modal Handlers
  const handleOpenEditTaxModal = (o: Order) => {
    setEditingTaxOrder(o);
    setEditCompanyName(o.customerTaxInfo?.companyName || '');
    setEditTaxId(o.customerTaxInfo?.taxId || '');
    setEditBranchCode(o.customerTaxInfo?.branchCode || '00000');
    setEditAddress(o.customerTaxInfo?.address || '');
    setEditPhone(o.customerTaxInfo?.phone || '');
  };

  const handleSaveTaxInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaxOrder) return;
    if (!editCompanyName.trim() || !editTaxId.trim()) {
      alert('กรุณากรอกชื่อบริษัท/ผู้เสียภาษี และ เลขประจำตัวผู้เสียภาษี');
      return;
    }

    const taxInfo: CustomerTaxInfo = {
      companyName: editCompanyName,
      taxId: editTaxId,
      branchCode: editBranchCode,
      address: editAddress,
      phone: editPhone
    };

    updateOrderTaxInfo(editingTaxOrder.id, taxInfo);
    setEditingTaxOrder(null);
  };

  const filteredOrders = orders.filter(o => {
    const isFull = !!o.customerTaxInfo || o.isFullTaxInvoiceRequested;
    const matchType =
      filterType === 'all' ||
      (filterType === 'full' && isFull) ||
      (filterType === 'abb' && !isFull);

    const matchSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.customerTaxInfo?.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.customerTaxInfo?.taxId || '').includes(searchTerm);

    return matchType && matchSearch;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Receipt className="w-6 h-6 text-emerald-400" />
            <span>ระบบใบเสร็จรับเงิน & ใบกำกับภาษี (Receipts & Tax Invoices)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ออกใบเสร็จรับเงิน/ใบกำกับภาษีเต็มรูปแบบ (A4 & สลิป) คำนวณ VAT 7% และภาษีหัก ณ ที่จ่าย 1%, 3%, 5% อัตโนมัติ
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/40 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>ออกใบเสร็จรับเงินใหม่</span>
        </button>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-bold text-slate-400">ใบเสร็จที่ออกแล้ว</div>
            <div className="text-2xl font-black text-slate-100 mt-1 font-mono">{totalReceiptsCount} <span className="text-xs font-normal text-slate-400">ฉบับ</span></div>
          </div>
          <div className="p-3 bg-slate-800 border border-slate-700/60 rounded-xl text-slate-300">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-bold text-slate-400">ยอดเงินรับชำระรวม</div>
            <div className="text-xl font-black text-emerald-400 mt-1 font-mono">{totalRevenue.toLocaleString('th-TH')} <span className="text-xs font-normal text-emerald-500">฿</span></div>
          </div>
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/30 rounded-xl text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-bold text-slate-400">ภาษีขาย VAT 7% รวม</div>
            <div className="text-xl font-black text-amber-400 mt-1 font-mono">{totalVat.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-amber-500">฿</span></div>
          </div>
          <div className="p-3 bg-amber-950/80 border border-amber-500/30 rounded-xl text-amber-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-[11px] font-bold text-slate-400">ภาษีหัก ณ ที่จ่ายรวม (WHT)</div>
            <div className="text-xl font-black text-cyan-400 mt-1 font-mono">{totalWht.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-cyan-500">฿</span></div>
          </div>
          <div className="p-3 bg-cyan-950/80 border border-cyan-500/30 rounded-xl text-cyan-400">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ค้นหาเลขที่ออเดอร์, ชื่อบริษัท, Tax ID..."
            className="w-full px-3.5 py-2 pl-9 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <Receipt className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center space-x-1.5 w-full sm:w-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'all'
                ? 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            ทั้งหมด ({orders.length})
          </button>
          <button
            onClick={() => setFilterType('abb')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'abb'
                ? 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            อย่างย่อ (ABB) ({orders.filter(o => !o.customerTaxInfo).length})
          </button>
          <button
            onClick={() => setFilterType('full')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'full'
                ? 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            เต็มรูปแบบ ({orders.filter(o => o.customerTaxInfo).length})
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200 min-w-[800px]">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">เลขที่ออเดอร์</th>
                <th className="p-3.5">วันที่/เวลา</th>
                <th className="p-3.5">ประเภทใบเสร็จ</th>
                <th className="p-3.5">ลูกค้า / บริษัท</th>
                <th className="p-3.5 text-right">ฐานภาษี</th>
                <th className="p-3.5 text-right">VAT 7%</th>
                <th className="p-3.5 text-right">ยอดรวมทั้งสิ้น</th>
                <th className="p-3.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOrders.length > 0 ? (
                filteredOrders.map(o => {
                  const vatBase = o.grandTotal / 1.07;
                  const vatAmount = o.grandTotal - vatBase;
                  const isFull = !!o.customerTaxInfo;

                  return (
                    <tr key={o.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono font-bold text-amber-400">{o.orderNumber}</td>
                      <td className="p-3.5 font-mono text-slate-300">
                        {new Date(o.createdAt).toLocaleDateString('th-TH')} {new Date(o.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isFull
                              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {isFull ? 'เต็มรูปแบบ' : 'อย่างย่อ (ABB)'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-100">{o.customerTaxInfo?.companyName || 'ลูกค้าทั่วไป'}</div>
                        {o.customerTaxInfo?.taxId && (
                          <div className="text-[10px] font-mono text-slate-400">Tax ID: {o.customerTaxInfo.taxId}</div>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-300">฿{vatBase.toFixed(2)}</td>
                      <td className="p-3.5 text-right font-mono text-amber-400">฿{vatAmount.toFixed(2)}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400 text-sm">฿{o.grandTotal.toFixed(2)}</td>
                      <td className="p-3.5 text-center space-x-1.5">
                        <button
                          onClick={() => handleOpenEditTaxModal(o)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-bold rounded-lg border border-slate-700 transition"
                        >
                          {isFull ? 'แก้ไขภาษี' : '+ ออกเต็มรูปแบบ'}
                        </button>
                        <button
                          onClick={() => setPrintingOrder(o)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition inline-flex items-center space-x-1 shadow"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>พิมพ์</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    ไม่พบรายการใบเสร็จตามเงื่อนไขที่ระบุ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW RECEIPT / TAX INVOICE MODAL (ออกใบเสร็จรับเงิน / ใบกำกับภาษีใหม่) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 flex-shrink-0">
              <h3 className="font-bold text-slate-100 text-sm sm:text-base flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span>ออกใบเสร็จรับเงิน / ใบกำกับภาษีใหม่</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReceiptSubmit} className="p-3.5 sm:p-5 space-y-4 sm:space-y-5 text-xs text-slate-200 overflow-y-auto flex-1">
              {/* SECTION 1: Pull automatic data */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span>ดึงข้อมูลอัตโนมัติจากออเดอร์ หรือ ใบเสนอราคา:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      value={selectedPosOrderId}
                      onChange={e => handleSelectPosOrder(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 truncate"
                    >
                      <option value="">-- เลือกออเดอร์ POS --</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber} - ฿{o.grandTotal.toFixed(2)} ({o.customerTaxInfo?.companyName || 'ลูกค้าทั่วไป'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      value={selectedQuotationId}
                      onChange={e => handleSelectQuotation(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 truncate"
                    >
                      <option value="">-- เลือกใบเสนอราคา QT --</option>
                      <option value="QT-2026-001">QT-2026-001 (บจก. ปตท. น้ำมันและการค้าปลีก - ฿15,000.00)</option>
                      <option value="QT-2026-002">QT-2026-002 (บจก. เอสซีจี เคมิคอลส์ - ฿25,000.00)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Document Type Selection */}
              <div className="space-y-2">
                <label className="font-bold text-slate-200 text-xs">ประเภทเอกสารใบเสร็จ</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setDocType('full')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      docType === 'full'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-100">ใบกำกับภาษีเต็มรูปแบบ / ใบเสร็จรับเงิน</div>
                    <div className="text-[10px] text-slate-400 mt-1">สำหรับนิติบุคคล/บริษัท มี TAX ID</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocType('general')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      docType === 'general'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-100">ใบเสร็จรับเงินทั่วไป</div>
                    <div className="text-[10px] text-slate-400 mt-1">สำหรับบุคคลธรรมดา/ทั่วไป</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocType('abb')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      docType === 'abb'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-100">ใบเสร็จอย่างย่อ</div>
                    <div className="text-[10px] text-slate-400 mt-1">สลิปย่อสำหรับลูกค้าหน้าร้าน</div>
                  </button>
                </div>
              </div>

              {/* SECTION 3: Customer / Taxpayer Info */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                    <User className="w-4 h-4 flex-shrink-0" />
                    <span>ข้อมูลลูกค้า / ผู้ออกใบเสร็จให้</span>
                  </div>
                  <select
                    value={crmCustomer}
                    onChange={e => handleSelectCrm(e.target.value)}
                    className="w-full sm:w-auto px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500 max-w-full truncate"
                  >
                    <option value="">-- เลือกจากรายชื่อ CRM --</option>
                    <option value="ptt">บจก. ปตท. น้ำมันและการค้าปลีก (Tax ID: 0105558000000)</option>
                    <option value="scg">บจก. เอสซีจี เคมิคอลส์ (Tax ID: 0105559123456)</option>
                    <option value="siam">บจก. สยามนวัตกรรม (Tax ID: 0105562098123)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ชื่อลูกค้า / ชื่อบริษัท *</label>
                    <input
                      type="text"
                      required={docType === 'full'}
                      value={formCompany}
                      onChange={e => setFormCompany(e.target.value)}
                      placeholder="เช่น บจก. ปตท. น้ำมันและการค้าปลีก"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="081-234-5678"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">เลขผู้เสียภาษี (Tax ID 13 หลัก)</label>
                    <input
                      type="text"
                      value={formTaxId}
                      onChange={e => setFormTaxId(e.target.value)}
                      placeholder="0105558000000"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300">สาขา</label>
                      <input
                        type="text"
                        value={formBranch}
                        onChange={e => setFormBranch(e.target.value)}
                        placeholder="สำนักงานใหญ่"
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300">วันที่ออกใบเสร็จ</label>
                      <input
                        type="text"
                        value={formDate}
                        onChange={e => setFormDate(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300">ที่อยู่ผู้เสียภาษี</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="555/1 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ"
                    className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* SECTION 4: Line Items */}
              <div className="space-y-3 border-t border-slate-800 pt-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="font-bold text-emerald-400 flex items-center space-x-1.5">
                    <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                    <span>รายการสินค้า / บริการที่รับชำระ</span>
                  </div>
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <select
                      onChange={e => {
                        handleSelectMenuToAdd(e.target.value);
                        e.target.value = '';
                      }}
                      className="flex-1 sm:flex-none px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500 max-w-[160px] sm:max-w-none truncate"
                    >
                      <option value="">+ เลือกเมนู</option>
                      {menuItems.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} (฿{m.price})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] rounded-lg transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>เพิ่มรายการ</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {newItems.map(it => (
                    <div key={it.id} className="bg-slate-950 p-2.5 sm:p-3 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={it.name}
                          onChange={e => handleUpdateItem(it.id, 'name', e.target.value)}
                          placeholder="ชื่อสินค้า / ค่าบริการ..."
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-start gap-2">
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-400 sm:hidden">จำนวน:</span>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={e => handleUpdateItem(it.id, 'quantity', Number(e.target.value))}
                            className="w-14 sm:w-16 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-center font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-400 sm:hidden">ราคา/หน่วย:</span>
                          <input
                            type="number"
                            min="0"
                            value={it.unitPrice}
                            onChange={e => handleUpdateItem(it.id, 'unitPrice', Number(e.target.value))}
                            className="w-20 sm:w-24 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-right font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-16 sm:w-20 text-right font-mono font-bold text-emerald-400 text-xs">
                          {it.total.toLocaleString('th-TH')} ฿
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(it.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 5: Payment & VAT & WHT Options */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">วิธีชำระเงิน & อ้างอิงสลิป</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value as any)}
                        className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="โอนเงินเข้าบัญชี">โอนเงินเข้าบัญชี</option>
                        <option value="สแกน PromptPay">สแกน PromptPay</option>
                        <option value="เงินสด">เงินสด</option>
                        <option value="บัตรเครดิต">บัตรเครดิต</option>
                      </select>
                      <input
                        type="text"
                        value={payRef}
                        onChange={e => setPayRef(e.target.value)}
                        placeholder="เลขสลิปโอน / Ref"
                        className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ประเภทภาษีมูลค่าเพิ่ม (VAT 7%)</label>
                    <select
                      value={vatType}
                      onChange={e => setVatType(e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="inclusive">รวมภาษี VAT 7% (VAT Inclusive)</option>
                      <option value="exclusive">แยกภาษี VAT 7% (VAT Exclusive)</option>
                      <option value="none">ไม่มี VAT (0%)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300">ภาษีหัก ณ ที่จ่าย (Withholding Tax - WHT)</label>
                    <select
                      value={whtRate}
                      onChange={e => setWhtRate(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={0}>ไม่มีการหัก ณ ที่จ่าย (0%)</option>
                      <option value={1}>หัก ณ ที่จ่าย 1% (ค่าขนส่ง/บริการ)</option>
                      <option value={3}>หัก ณ ที่จ่าย 3% (ค่าบริการ/จ้างทำของ)</option>
                      <option value={5}>หัก ณ ที่จ่าย 5% (ค่าเช่า/โฆษณา)</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoIncomeLog}
                        onChange={e => setAutoIncomeLog(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-emerald-500 focus:ring-0"
                      />
                      <span>บันทึกรายรับลงสมุดบัญชีการเงินทันที (Auto Income Log)</span>
                    </label>
                  </div>
                </div>

                {/* Summary Box inside Modal */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-2 mt-3 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>ยอดรวมรายการ (Subtotal):</span>
                    <span>{rawSubtotal.toLocaleString('th-TH')} ฿</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>ส่วนลด (Discount):</span>
                    <span className="text-red-400">-0 ฿</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                    <span className="text-amber-400">{calculatedVat.toFixed(2)} ฿</span>
                  </div>
                  {whtRate > 0 && (
                    <div className="flex justify-between text-cyan-400">
                      <span>ภาษีหัก ณ ที่จ่าย ({whtRate}%):</span>
                      <span>-{calculatedWht.toFixed(2)} ฿</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-400 font-bold text-sm pt-1 border-t border-slate-800">
                    <span>ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
                    <span>{totalGrand.toLocaleString('th-TH')} ฿</span>
                  </div>
                  <div className="flex justify-between text-emerald-300 font-bold text-base">
                    <span>ยอดเงินโอนจริงสุทธิ (Net Paid):</span>
                    <span className="text-emerald-400">{netPaid.toLocaleString('th-TH')} ฿</span>
                  </div>

                  {/* Thai Baht text pill */}
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-center font-sans text-xs text-slate-300 font-bold mt-2">
                    ({thaiBahtText(netPaid)})
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>ยืนยันออกใบเสร็จรับเงิน</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT/ISSUE FULL TAX INVOICE MODAL */}
      {editingTaxOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>ออกใบกำกับภาษีเต็มรูปแบบ สำหรับออเดอร์ #{editingTaxOrder.orderNumber}</span>
              </h3>
              <button onClick={() => setEditingTaxOrder(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTaxInfo} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">ชื่อบริษัท / ชื่อผู้เสียภาษี *</label>
                <input
                  type="text"
                  required
                  value={editCompanyName}
                  onChange={e => setEditCompanyName(e.target.value)}
                  placeholder="เช่น บริษัท สยามนวัตกรรม จำกัด"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">เลขประจำตัวผู้เสียภาษี (13 หลัก) *</label>
                  <input
                    type="text"
                    required
                    value={editTaxId}
                    onChange={e => setEditTaxId(e.target.value)}
                    placeholder="เช่น 0105562098123"
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">รหัสสาขา</label>
                  <input
                    type="text"
                    value={editBranchCode}
                    onChange={e => setEditBranchCode(e.target.value)}
                    placeholder="00000 (สำนักงานใหญ่)"
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">ที่อยู่ตามใบกำกับภาษี</label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  placeholder="เช่น 123/45 ถนนพระราม 1 ปทุมวัน กรุงเทพฯ 10330"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="02-123-4567"
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingTaxOrder(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  บันทึกใบกำกับภาษี
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAX INVOICE PRINT PREVIEW MODAL */}
      {printingOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full my-6 overflow-hidden shadow-2xl space-y-4">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <span className="font-bold text-slate-100 text-sm">
                พิมพ์ใบกำกับภาษี / ใบเสร็จรับเงิน #{printingOrder.orderNumber}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => exportToPNG('printable-tax-invoice', `TaxInvoice-${printingOrder.orderNumber}`)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg flex items-center space-x-1 border border-slate-700"
                  title="บันทึกรูปภาพ PNG"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  onClick={() => exportToPDF('printable-tax-invoice', `TaxInvoice-${printingOrder.orderNumber}`, 'a4')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs rounded-lg flex items-center space-x-1 border border-slate-700"
                  title="บันทึกไฟล์ PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1 shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์</span>
                </button>
                <button onClick={() => setPrintingOrder(null)} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Paper */}
            <div
              id="printable-tax-invoice"
              className="printable-document printable-a4 bg-white text-slate-900 border border-slate-300 rounded-xl m-4 p-6 font-sans space-y-5 shadow-sm"
            >
              <div className="flex justify-between items-start border-b border-slate-300 pb-3">
                <div>
                  <div className="font-black text-lg text-slate-900">ครัวกะเพรา POS (สำนักงานใหญ่)</div>
                  <div className="text-[11px] text-slate-600">123/88 ถนนสุขุมวิท เขตคลองเตย กรุงเทพฯ 10110</div>
                  <div className="text-[11px] text-slate-600">เลขประจำตัวผู้เสียภาษี: 0105559082910</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-emerald-700">
                    {printingOrder.customerTaxInfo ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน' : 'ใบกำกับภาษีอย่างย่อ (ABB)'}
                  </div>
                  <div className="font-mono text-slate-900 font-bold">{printingOrder.orderNumber}</div>
                  <div className="text-[10px] text-slate-500">
                    วันที่: {new Date(printingOrder.createdAt).toLocaleDateString('th-TH')} {new Date(printingOrder.createdAt).toLocaleTimeString('th-TH')}
                  </div>
                </div>
              </div>

              {printingOrder.customerTaxInfo ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-slate-800">
                  <div className="font-bold text-slate-900">{printingOrder.customerTaxInfo.companyName}</div>
                  <div className="text-slate-600">
                    เลขประจำตัวผู้เสียภาษี: <span className="font-mono text-slate-900">{printingOrder.customerTaxInfo.taxId}</span> (สาขา {printingOrder.customerTaxInfo.branchCode})
                  </div>
                  {printingOrder.customerTaxInfo.address && <div className="text-slate-600">ที่อยู่: {printingOrder.customerTaxInfo.address}</div>}
                </div>
              ) : (
                <div className="text-slate-500 italic">ลูกค้าทั่วไป (ใบกำกับภาษีอย่างย่อ)</div>
              )}

              <table className="w-full text-left text-xs border-collapse text-slate-900">
                <thead className="bg-slate-100 border-b border-slate-300 uppercase text-[10px] text-slate-700">
                  <tr>
                    <th className="p-2">รายการ</th>
                    <th className="p-2 text-center">จำนวน</th>
                    <th className="p-2 text-right">ราคา</th>
                    <th className="p-2 text-right">รวมเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {printingOrder.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium text-slate-900">{it.menuItem.name}</td>
                      <td className="p-2 text-center font-mono">{it.quantity}</td>
                      <td className="p-2 text-right font-mono">฿{it.unitPrice}</td>
                      <td className="p-2 text-right font-mono font-bold">฿{it.totalPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(() => {
                const vatBase = printingOrder.grandTotal / 1.07;
                const vat = printingOrder.grandTotal - vatBase;
                return (
                  <div className="border-t border-slate-300 pt-3 space-y-2">
                    <div className="flex justify-between font-mono text-xs text-slate-800">
                      <div className="text-slate-600 font-sans">วิธีชำระเงิน: {printingOrder.paymentMethod}</div>
                      <div className="space-y-1 text-right">
                        <div>มูลค่าสินค้า (ก่อน VAT): ฿{vatBase.toFixed(2)}</div>
                        <div className="text-amber-700">ภาษีมูลค่าเพิ่ม (VAT 7%): ฿{vat.toFixed(2)}</div>
                        <div className="text-sm font-bold text-emerald-700 font-sans">ราคารวมทั้งสิ้น: ฿{printingOrder.grandTotal.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center font-sans text-xs text-slate-800 font-bold">
                      ({thaiBahtText(printingOrder.grandTotal)})
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 9. Detailed Analytics View (วิเคราะห์ผลประกอบการ) - Unified with ExecutiveDashboardView
export const AnalyticsView: React.FC = ExecutiveDashboardView;

// 10. LINE / Telegram Notifications View (แจ้งเตือนไลน์และโทรเลขพร้อมรายละเอียดครบถ้วน)
export const LineNotifyView: React.FC = () => {
  const { orders, ingredients, menuItems, settings, currentBranch } = usePOS();

  // State for Tokens and Settings
  const [lineToken, setLineToken] = useState('ln_live_83920193847291039');
  const [telegramToken, setTelegramToken] = useState('bot68392019:AAHk98231_KapraoBot');
  const [telegramChatId, setTelegramChatId] = useState('-1001928374650');
  const [tokenSavedToast, setTokenSavedToast] = useState<string | null>(null);
  const [isSendingChannel, setIsSendingChannel] = useState<'line' | 'telegram' | null>(null);

  useEffect(() => {
    const savedTelegramToken = localStorage.getItem('kaprao_telegram_token');
    const savedTelegramChatId = localStorage.getItem('kaprao_telegram_chat_id');
    const savedLineToken = localStorage.getItem('kaprao_line_token');

    if (savedTelegramToken) setTelegramToken(savedTelegramToken);
    if (savedTelegramChatId) setTelegramChatId(savedTelegramChatId);
    if (savedLineToken) setLineToken(savedLineToken);
  }, []);

  // Enabled Notification Triggers
  const [triggers, setTriggers] = useState({
    dailySummary: true,
    lowStock: true,
    voidOrder: true,
    newOrder: true,
    kdsDelay: false,
  });

  // Manager Trigger Rules Configuration State
  const [minOrderAmount, setMinOrderAmount] = useState<number>(300);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['all']);
  const [minVoidAmount, setMinVoidAmount] = useState<number>(100);
  const [onlyCriticalStock, setOnlyCriticalStock] = useState<boolean>(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const [quietHoursStart, setQuietHoursStart] = useState<string>('00:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState<string>('06:00');
  const [dailySummaryTime, setDailySummaryTime] = useState<string>('22:00');
  const [rulesSavedToast, setRulesSavedToast] = useState<string | null>(null);

  // Available categories derived from menu items or default fallback
  const availableCategories = React.useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(m => m.category || 'ทั่วไป'))).filter(Boolean);
    if (cats.length === 0) {
      return ['อาหารจานเดียว', 'ทานเล่น / กับข้าว', 'เครื่องดื่ม / ของหวาน', 'วัตถุดิบ / สด'];
    }
    return cats;
  }, [menuItems]);

  const toggleCategoryRule = (cat: string) => {
    if (cat === 'all') {
      setSelectedCategories(['all']);
      return;
    }
    let updated = selectedCategories.filter(c => c !== 'all');
    if (updated.includes(cat)) {
      updated = updated.filter(c => c !== cat);
      if (updated.length === 0) updated = ['all'];
    } else {
      updated.push(cat);
    }
    setSelectedCategories(updated);
  };

  // Active Preview Tab
  const [activeTab, setActiveTab] = useState<'daily' | 'stock' | 'void' | 'new_order' | 'kds'>('daily');

  // Modal & Simulator state
  const [isSimulatedMobileOpen, setIsSimulatedMobileOpen] = useState(false);
  const [simulatedChannel, setSimulatedChannel] = useState<'line' | 'telegram'>('line');
  const [simulatedMessage, setSimulatedMessage] = useState('');
  const [simulatedTitle, setSimulatedTitle] = useState('');
  const [testToast, setTestToast] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Notification Logs History
  const [logs, setLogs] = useState([
    {
      id: 'log-1',
      time: '22:00:05',
      date: 'วันนี้',
      channel: 'LINE',
      event: 'สรุปยอดขายประจำวัน (Daily Summary)',
      status: 'ส่งสำเร็จ (200 OK)',
      recipient: 'กลุ่มผู้บริหารครัวกะเพรา'
    },
    {
      id: 'log-2',
      time: '18:42:10',
      date: 'วันนี้',
      channel: 'Telegram',
      event: 'ออเดอร์ใหม่เข้า (QR Table 05)',
      status: 'ส่งสำเร็จ (200 OK)',
      recipient: '@KapraoBot Channel'
    },
    {
      id: 'log-3',
      time: '14:15:30',
      date: 'วันนี้',
      channel: 'LINE',
      event: 'เตือนวัตถุดิบใกล้หมด (Low Stock Alert)',
      status: 'ส่งสำเร็จ (200 OK)',
      recipient: 'กลุ่มผู้บริหารครัวกะเพรา'
    },
    {
      id: 'log-4',
      time: '12:05:12',
      date: 'วันนี้',
      channel: 'LINE',
      event: 'เตือนยกเลิกบิล (Void Order Alert)',
      status: 'ส่งสำเร็จ (200 OK)',
      recipient: 'กลุ่มผู้บริหารครัวกะเพรา'
    }
  ]);

  // Save Token Handler
  const handleSaveTokens = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('kaprao_telegram_token', telegramToken);
    localStorage.setItem('kaprao_telegram_chat_id', telegramChatId);
    localStorage.setItem('kaprao_line_token', lineToken);
    setTokenSavedToast('บันทึกการตั้งค่า LINE Token & Telegram Bot เรียบร้อยแล้ว!');
    setTimeout(() => setTokenSavedToast(null), 3500);
  };

  // Toggle trigger handler
  const toggleTrigger = (key: keyof typeof triggers) => {
    setTriggers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Compute live POS store metrics for template formatting
  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => {
    const oDate = new Date(o.createdAt).toISOString().split('T')[0];
    return oDate === todayStr && o.status !== 'cancelled';
  });
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const avgBill = todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0;

  const posOrders = todayOrders.filter(o => o.orderType === 'dine-in' || o.orderType === 'takeaway' || !o.orderType);
  const qrOrders = todayOrders.filter(o => (o.orderType as string) === 'qr');
  const deliveryOrders = todayOrders.filter(o => o.orderType === 'delivery');

  const cashTotal = todayOrders.filter(o => o.paymentMethod === 'cash').reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const promptPayTotal = todayOrders.filter(o => o.paymentMethod !== 'cash').reduce((sum, o) => sum + (o.grandTotal || 0), 0);

  // Low stock ingredients list
  const lowStockItems = ingredients.filter(i => (i.currentStock || 0) <= (i.minStockAlert || 5));

  // Generate dynamic notification message texts
  const getMessageContent = (type: 'daily' | 'stock' | 'void' | 'new_order' | 'kds') => {
    const shopName = settings.shopName || 'ครัวกะเพรา POS Enterprise';
    const branchName = currentBranch?.name || 'สาขาหลัก (พญาไท)';
    const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    if (type === 'daily') {
      return `📊 [${shopName}] - สรุปยอดขายประจำวัน
📅 วันที่: ${new Date().toLocaleDateString('th-TH')} | เวลาส่งอัตโนมัติ: ${dailySummaryTime} น.
🏪 สาขา: ${branchName}
──────────────────────────────
💰 ยอดขายรวมสุทธิ: ฿${todayRevenue > 0 ? todayRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '14,850.00'}
🧾 จำนวนออเดอร์ขาย: ${todayOrders.length > 0 ? todayOrders.length : 86} บิล (เฉลี่ย ฿${avgBill > 0 ? avgBill.toFixed(2) : '172.67'}/บิล)

💳 สรุปยอดขายตามช่องทาง:
  • หน้าร้าน (POS): ฿${posOrders.reduce((s, o) => s + (o.grandTotal || 0), 0) || 9800} (${posOrders.length || 58} บิล)
  • สแกนสั่งโต๊ะ (QR): ฿${qrOrders.reduce((s, o) => s + (o.grandTotal || 0), 0) || 3800} (${qrOrders.length || 20} บิล)
  • เดลิเวอรี่ (Delivery): ฿${deliveryOrders.reduce((s, o) => s + (o.grandTotal || 0), 0) || 1250} (${deliveryOrders.length || 8} บิล)

💵 สรุปยอดตามวิธีชำระเงิน:
  • เงินสด (Cash): ฿${cashTotal || 4850}
  • สแกนโอน (PromptPay/QR): ฿${promptPayTotal || 10000}

🏆 เมนูขายดีท็อป 3 ประจำวัน:
  1. กะเพราเนื้อสับไข่ดาว (42 จาน)
  2. กะเพราหมูกรอบกรอบ (31 จาน)
  3. ชาไทยเย็นโบราณ (38 แก้ว)
${quietHoursEnabled ? `\n🌙 โหมดห้ามรบกวนเปิดใช้งาน: (${quietHoursStart} - ${quietHoursEnd} น.)` : ''}
✅ ปิดยอดขายกะประจำวันเรียบร้อยแล้ว`;
    }

    if (type === 'stock') {
      const ruleText = onlyCriticalStock ? 'เตือนเฉพาะสต็อกวิกฤต (<= 20% ของเกณฑ์)' : 'เตือนทันทีเมื่อต่ำกว่าเกณฑ์สั่งซื้อ';
      const displayStock = lowStockItems.length > 0
        ? lowStockItems.map((i, idx) => `  ${idx + 1}. ${i.name} (เหลือ: ${i.currentStock} ${i.unit} | เกณฑ์: ${i.minStockAlert} ${i.unit})`).join('\n')
        : `  1. เนื้อวัวบด A5 (คงเหลือ: 1.50 กก. | เกณฑ์: 5.00 กก.)
  2. ไข่ไก่สดเบอร์ 1 (คงเหลือ: 12 ฟอง | เกณฑ์: 30 ฟอง)
  3. ใบกะเพราป่า (คงเหลือ: 0.30 กก. | เกณฑ์: 2.00 กก.)`;

      return `⚠️ [ALERT] แจ้งเตือนวัตถุดิบใกล้หมดสต็อก!
🏪 สาขา: ${branchName}
🕒 เวลาตรวจพบ: ${nowTime} น.
⚙️ เงื่อนไข Trigger Rules: ${ruleText}
──────────────────────────────
📦 รายการวัตถุดิบที่ต่ำกว่าจุดสั่งซื้อด่วน:
${displayStock}

💡 คำแนะนำ: โปรดดำเนินการสั่งซื้อวัตถุดิบเพิ่มเติมจาก Supplier เพื่อป้องกันสินค้าขาดหน้าร้าน`;
    }

    if (type === 'void') {
      const statusText = 325 >= minVoidAmount ? `✅ ผ่านเงื่อนไข (ยอด ฿325.00 >= ฿${minVoidAmount.toLocaleString()})` : `⚠️ ยอดต่ำกว่าเกณฑ์ ฿${minVoidAmount.toLocaleString()} (จะไม่ส่งเตือน)`;
      return `❌ [SECURITY ALERT] แจ้งเตือนการยกเลิกบิล / คืนเงิน
🏪 สาขา: ${branchName}
🧾 บิลเลขที่: #ORD-20260729-014
🕒 เวลาทำรายการ: ${nowTime} น.
──────────────────────────────
💵 ยอดเงินที่ยกเลิก: ฿325.00
👤 พนักงานขาย: คุณสมชาย (แคชเชียร์)
🔑 อนุมัติโดย: Manager PIN (คุณวิภา)
📝 เหตุผลที่ยกเลิก: ลูกค้าขอยกเลิกเนื่องจากสั่งผิดเมนู
⚙️ เงื่อนไข Trigger Rules: แจ้งเตือนเมื่อยกเลิกบิล >= ฿${minVoidAmount.toLocaleString()}
📌 สถานะกฎ: ${statusText}

📋 รายการอาหารในบิลที่ยกเลิก:
  • กะเพราไก่สับ x2 (฿170.00)
  • ชามะนาวเย็น x2 (฿80.00)
  • ไข่ดาวกรอบ x3 (฿75.00)`;
    }

    if (type === 'new_order') {
      const catText = selectedCategories.includes('all') ? 'ทุกหมวดหมู่' : selectedCategories.join(', ');
      const ruleText = `🎯 เงื่อนไข Trigger Rules: ยอดขั้นต่ำ >= ฿${minOrderAmount.toLocaleString()} | หมวดหมู่: ${catText}`;
      const statusText = minOrderAmount > 0 ? (385 >= minOrderAmount ? `✅ ผ่านเงื่อนไข (ยอด ฿385.00 >= ฿${minOrderAmount.toLocaleString()})` : `⚠️ ยอดต่ำกว่าเกณฑ์ ฿${minOrderAmount.toLocaleString()} (จะไม่ส่งเตือน)`) : '✅ ส่งเตือนทุกยอดขาย';

      return `🔔 [NEW ORDER] มีออเดอร์ใหม่เข้าจากลูกค้า!
🏪 สาขา: ${branchName}
🪑 โต๊ะ / ช่องทาง: Table 05 (QR Ordering)
🧾 เลขออเดอร์: #ORD-20260729-088
🕒 เวลาที่สั่ง: ${nowTime} น.
──────────────────────────────
🍲 รายการอาหารที่สั่ง (3 รายการ):
  • กะเพราเนื้อสับเผ็ดมาก + ไข่ดาว x1 (฿115.00)
  • ต้มยำกุ้งน้ำข้น x1 (฿180.00)
  • ชาไทยเย็นหวานน้อย x2 (฿90.00)

💰 ยอดเงินรวมทั้งสิ้น: ฿385.00 (ชำระเงินแล้ว - PromptPay QR)
⚙️ ${ruleText}
📌 สถานะกฎ: ${statusText}
🍳 สถานะครัว KDS: ส่งเข้าคิวทำอาหารเรียบร้อยแล้ว`;
    }

    // KDS Kitchen delay
    return `⏰ [KDS DELAY WARNING] แจ้งเตือนออเดอร์ช้าเกินกำหนดในครัว!
🏪 สาขา: ${branchName}
🪑 โต๊ะ: Table 02
🧾 เลขออเดอร์: #ORD-20260729-075
⏱️ รอนานแล้ว: 18 นาที (เกณฑ์เตือน: 15 นาที)
──────────────────────────────
🍳 เมนูที่กำลังทำค้างอยู่:
  • กะเพราหมูกรอบสเปเชียล x2 จาน

💡 โปรดประสานงานเชฟในครัวเพื่อเร่งปรุงอาหารให้ลูกค้า`;
  };

  // Send real notification via Telegram/LINE API & open mobile preview
  const handleTriggerTest = async (channel: 'line' | 'telegram', type: 'daily' | 'stock' | 'void' | 'new_order' | 'kds') => {
    const titles: Record<string, string> = {
      daily: 'สรุปยอดขายประจำวัน (Daily Sales Summary)',
      stock: 'เตือนวัตถุดิบใกล้หมดสต็อก (Low Stock Alert)',
      void: 'เตือนยกเลิกบิล (Void Order Alert)',
      new_order: 'ออเดอร์ใหม่เข้า (New QR Order Alert)',
      kds: 'เตือนออเดอร์ช้าในครัว (KDS Kitchen Delay)'
    };

    const titleText = titles[type] || 'การแจ้งเตือนระบบ';
    const msgContent = getMessageContent(type);
    const fullMessage = `🔔 [ครัวกะเพรา POS - ${titleText}]\n\n${msgContent}`;

    setSimulatedChannel(channel);
    setSimulatedTitle(titleText);
    setSimulatedMessage(msgContent);
    setIsSimulatedMobileOpen(true);
    setIsSendingChannel(channel);

    let isSuccess = false;
    let statusLogText = '';
    let errorMessage = '';

    try {
      if (channel === 'telegram') {
        if (!telegramToken.trim() || !telegramChatId.trim()) {
          throw new Error('กรุณากรอก Bot Token และ Group Chat ID ให้ครบถ้วน');
        }

        // Try sending via server endpoint first
        let res = await fetch('/api/notify/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: telegramToken,
            chatId: telegramChatId,
            message: fullMessage
          })
        });

        let data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          isSuccess = true;
          statusLogText = 'ส่งสำเร็จ (200 OK - Telegram Real)';
        } else {
          // Fallback to client-side direct fetch to Telegram Bot API
          const cleanToken = telegramToken.trim().startsWith('bot') ? telegramToken.trim().slice(3) : telegramToken.trim();
          const directRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId.trim(),
              text: fullMessage
            })
          });

          const directData = await directRes.json().catch(() => ({}));

          if (directRes.ok && directData.ok) {
            isSuccess = true;
            statusLogText = 'ส่งสำเร็จ (200 OK - Direct Telegram)';
          } else {
            throw new Error(data.error || directData.description || 'เกิดข้อผิดพลาดจาก Telegram Bot API');
          }
        }
      } else {
        // LINE
        if (!lineToken.trim()) {
          throw new Error('กรุณากรอก LINE Notify Token');
        }

        const res = await fetch('/api/notify/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineToken,
            message: fullMessage
          })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          isSuccess = true;
          statusLogText = 'ส่งสำเร็จ (200 OK - LINE Real)';
        } else {
          throw new Error(data.error || 'เกิดข้อผิดพลาดจาก LINE Notify API');
        }
      }
    } catch (err: any) {
      isSuccess = false;
      errorMessage = err.message || 'ส่งข้อความไม่สำเร็จ';
      statusLogText = `ล้มเหลว (${errorMessage})`;
    } finally {
      setIsSendingChannel(null);
    }

    const newLog = {
      id: `log-${Date.now()}`,
      time: new Date().toLocaleTimeString('th-TH'),
      date: 'วันนี้',
      channel: channel === 'line' ? 'LINE' : 'Telegram',
      event: titles[type],
      status: statusLogText,
      recipient: channel === 'line' ? 'กลุ่ม LINE Notify' : `Chat ID: ${telegramChatId || 'Telegram'}`
    };

    setLogs(prev => [newLog, ...prev.slice(0, 9)]);

    if (isSuccess) {
      setTestToast(`✅ ส่งการแจ้งเตือนจริงไปยัง ${channel.toUpperCase()} (${channel === 'telegram' ? telegramChatId : 'LINE'}) เรียบร้อยแล้ว!`);
    } else {
      setTestToast(`❌ เกิดข้อผิดพลาดในการส่ง ${channel.toUpperCase()}: ${errorMessage}`);
    }
    setTimeout(() => setTestToast(null), 6000);
  };

  // Copy message text
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* HEADER BANNER */}
      <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <BellRing className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-100 flex items-center space-x-2">
                <span>ศูนย์การตั้งค่า & รายละเอียดการส่งแจ้งเตือน (Notifications Center)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ส่งสรุปยอดขายรายวัน เตือนวัตถุดิบหมด เตือนยกเลิกบิล และออเดอร์ใหม่ไปยัง LINE Group & Telegram Bot ด่วน
              </p>
            </div>
          </div>
        </div>

        {/* STATUS BADGES */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 font-bold flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LINE Official / Notify: เชื่อมต่อแล้ว</span>
          </div>
          <div className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-300 font-bold flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Telegram Bot: ออนไลน์</span>
          </div>
        </div>
      </div>

      {testToast && (
        <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{testToast}</span>
          </div>
          <button onClick={() => setTestToast(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: TOKEN CONFIGURATION & TRIGGERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: TOKEN SETTINGS FORM */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveTokens} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-emerald-400 font-bold text-sm">
                <Send className="w-5 h-5" />
                <span>กำหนดคีย์เชื่อมต่อ (API Credentials & Tokens)</span>
              </div>
              {tokenSavedToast && (
                <span className="text-xs text-emerald-400 font-bold animate-in fade-in">
                  {tokenSavedToast}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* LINE TOKEN INPUT */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                    <Send className="w-4 h-4" />
                    <span>LINE Official / Notify Token</span>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    LINE API v2
                  </span>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">Token สำหรับกลุ่มผู้บริหาร:</label>
                  <input
                    type="text"
                    value={lineToken}
                    onChange={e => setLineToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-emerald-300 font-mono font-bold focus:border-emerald-500"
                    placeholder="ป้อน LINE Notify Token..."
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">สำหรับส่งเตือนเข้ากลุ่ม Line</span>
                  <button
                    type="button"
                    disabled={isSendingChannel !== null}
                    onClick={() => handleTriggerTest('line', activeTab)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] rounded-xl shadow transition active:scale-95 flex items-center space-x-1"
                  >
                    <Send className={`w-3 h-3 ${isSendingChannel === 'line' ? 'animate-spin' : ''}`} />
                    <span>{isSendingChannel === 'line' ? 'กำลังส่ง...' : 'ทดสอบ LINE'}</span>
                  </button>
                </div>
              </div>

              {/* TELEGRAM BOT INPUT */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                    <BellRing className="w-4 h-4" />
                    <span>Telegram Bot Token & Chat ID</span>
                  </div>
                  <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full font-bold">
                    Bot API
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1 text-[11px]">Bot Token:</label>
                    <input
                      type="text"
                      value={telegramToken}
                      onChange={e => setTelegramToken(e.target.value)}
                      placeholder="เช่น 8712743364:AAFcwX0..."
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-cyan-300 font-mono font-bold focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium mb-1 text-[11px]">Group Chat ID:</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={e => setTelegramChatId(e.target.value)}
                      placeholder="เช่น -5424457109"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-cyan-300 font-mono font-bold focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">สำหรับส่งเตือนด่วน Telegram</span>
                  <button
                    type="button"
                    disabled={isSendingChannel !== null}
                    onClick={() => handleTriggerTest('telegram', activeTab)}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-[11px] rounded-xl shadow transition active:scale-95 flex items-center space-x-1"
                  >
                    <Send className={`w-3 h-3 ${isSendingChannel === 'telegram' ? 'animate-spin' : ''}`} />
                    <span>{isSendingChannel === 'telegram' ? 'กำลังส่ง...' : 'ทดสอบ Telegram'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center space-x-2 active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>บันทึกรหัสผ่านและ Token</span>
              </button>
            </div>
          </form>

          {/* NOTIFICATION TRIGGERS TOGGLES PANEL */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>เปิด/ปิด เหตุการณ์ที่ต้องการให้แจ้งเตือน (Notification Event Triggers)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">ส่งทั้ง LINE และ Telegram</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div
                onClick={() => toggleTrigger('dailySummary')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  triggers.dailySummary ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-bold block text-slate-100">📊 สรุปยอดขายประจำวัน (22:00 น.)</span>
                  <span className="text-[11px] text-slate-400">ส่งยอดขายรวม จำนวนบิล เมนูขายดีท็อป 3</span>
                </div>
                <input type="checkbox" checked={triggers.dailySummary} onChange={() => {}} className="w-5 h-5 accent-emerald-500" />
              </div>

              <div
                onClick={() => toggleTrigger('lowStock')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  triggers.lowStock ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-bold block text-slate-100">⚠️ เตือนวัตถุดิบใกล้หมดสต็อก</span>
                  <span className="text-[11px] text-slate-400">เตือนทันทีเมื่อวัตถุดิบต่ำกว่าจุดสั่งซื้อ</span>
                </div>
                <input type="checkbox" checked={triggers.lowStock} onChange={() => {}} className="w-5 h-5 accent-emerald-500" />
              </div>

              <div
                onClick={() => toggleTrigger('voidOrder')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  triggers.voidOrder ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-bold block text-slate-100">❌ เตือนการยกเลิกบิล / คืนเงิน</span>
                  <span className="text-[11px] text-slate-400">เตือนด่วนเพื่อป้องกันการทุจริตหน้าร้าน</span>
                </div>
                <input type="checkbox" checked={triggers.voidOrder} onChange={() => {}} className="w-5 h-5 accent-emerald-500" />
              </div>

              <div
                onClick={() => toggleTrigger('newOrder')}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  triggers.newOrder ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-bold block text-slate-100">🛒 เตือนออเดอร์ใหม่ผ่าน QR Code</span>
                  <span className="text-[11px] text-slate-400">เตือนทันทีเมื่อลูกค้าสแกนสั่งจากโต๊ะ</span>
                </div>
                <input type="checkbox" checked={triggers.newOrder} onChange={() => {}} className="w-5 h-5 accent-emerald-500" />
              </div>
            </div>
          </div>

          {/* MANAGER TRIGGER RULES CONFIGURATION PANEL */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-amber-400 font-bold text-sm">
                <Sliders className="w-5 h-5 text-amber-400" />
                <span>ตั้งค่าเงื่อนไขการกรองแจ้งเตือนผู้จัดการ (Manager Trigger Rules)</span>
              </div>
              <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-full font-bold">
                กรองแจ้งเตือนขยะ
              </span>
            </div>

            {rulesSavedToast && (
              <div className="p-3 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded-2xl text-xs font-bold animate-in fade-in flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  <span>{rulesSavedToast}</span>
                </div>
                <button onClick={() => setRulesSavedToast(null)}>
                  <X className="w-4 h-4 text-amber-400" />
                </button>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* RULE 1: MINIMUM ORDER AMOUNT */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>1. แจ้งเตือนเฉพาะออเดอร์ใหม่ที่ยอดขั้นต่ำ (Minimum Order Amount)</span>
                  </label>
                  <span className="font-mono text-emerald-400 font-extrabold text-sm">
                    {minOrderAmount > 0 ? `฿${minOrderAmount.toLocaleString()}` : 'เตือนทุกยอด (฿0)'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  จะไม่ส่งแจ้งเตือน LINE/Telegram สำหรับออเดอร์ที่ยอดรวมต่ำกว่าเกณฑ์นี้ เพื่อป้องกันขยะข้อความรบกวนผู้บริหาร
                </p>

                {/* Quick Select Buttons & Custom Input */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {[0, 100, 200, 300, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setMinOrderAmount(amt)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                        minOrderAmount === amt
                          ? 'bg-emerald-500 text-slate-950 font-extrabold shadow'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {amt === 0 ? 'เตือนทุกยอด' : `>= ฿${amt}`}
                    </button>
                  ))}
                  <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl">
                    <span className="text-slate-400 font-bold">กำหนดเอง: ฿</span>
                    <input
                      type="number"
                      value={minOrderAmount}
                      onChange={e => setMinOrderAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 bg-transparent text-emerald-300 font-bold font-mono text-xs focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* RULE 2: ITEM CATEGORY FILTER */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span>2. กรองเฉพาะหมวดหมู่สินค้าที่ต้องการเตือน (Category Filter)</span>
                  </label>
                  <span className="text-[11px] text-sky-400 font-bold">
                    {selectedCategories.includes('all') ? 'ทุกหมวดหมู่' : `เลือก ${selectedCategories.length} หมวดหมู่`}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  เลือกหมวดหมู่สินค้าที่ต้องการส่งเตือน (เช่น เลือกเฉพาะเครื่องดื่ม หรืออาหารจานเดียว)
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleCategoryRule('all')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                      selectedCategories.includes('all')
                        ? 'bg-sky-500 text-slate-950 font-extrabold shadow'
                        : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    🌐 ทุกหมวดหมู่ (ALL)
                  </button>

                  {availableCategories.map(cat => {
                    const isSelected = !selectedCategories.includes('all') && selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategoryRule(cat)}
                        className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                          isSelected
                            ? 'bg-sky-500 text-slate-950 font-extrabold shadow'
                            : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* RULE 3 & 4: MIN VOID AMOUNT & CRITICAL STOCK TOGGLE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* MIN VOID AMOUNT */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2">
                  <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <Receipt className="w-4 h-4 text-rose-400" />
                    <span>3. ยอดเตือนยกเลิกบิลขั้นต่ำ</span>
                  </label>
                  <p className="text-[10px] text-slate-400">เตือนเฉพาะเมื่อยอดบิลยกเลิก/คืนเงิน &gt;= ที่กำหนด</p>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      value={minVoidAmount}
                      onChange={e => setMinVoidAmount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-rose-300 font-mono font-bold text-xs"
                    />
                    <span className="text-slate-400 font-bold shrink-0">บาท</span>
                  </div>
                </div>

                {/* CRITICAL STOCK ALERT */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2">
                  <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>4. เกณฑ์สต็อกวิกฤต</span>
                  </label>
                  <p className="text-[10px] text-slate-400">เตือนเฉพาะสต็อกขั้นวิกฤต (&lt;= 20% ของเกณฑ์สั่งซื้อ)</p>
                  <div className="flex items-center space-x-2 pt-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyCriticalStock}
                        onChange={e => setOnlyCriticalStock(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                    <span className="text-xs font-bold text-slate-300">
                      {onlyCriticalStock ? 'เปิด (เตือนเฉพาะวิกฤตด่วน)' : 'ปิด (เตือนวัตถุดิบหมดปกติ)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* RULE 5: QUIET HOURS & DAILY SUMMARY TIME */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span>5. เวลาสรุปยอดขาย & โหมดห้ามรบกวน (Quiet Hours Schedule)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 font-medium mb-1">เวลาส่งสรุปยอดขายรายวัน:</label>
                    <input
                      type="time"
                      value={dailySummaryTime}
                      onChange={e => setDailySummaryTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-purple-300 font-mono font-bold text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-400 font-medium">โหมดห้ามรบกวนช่วงกลางคืน:</label>
                      <input
                        type="checkbox"
                        checked={quietHoursEnabled}
                        onChange={e => setQuietHoursEnabled(e.target.checked)}
                        className="w-4 h-4 accent-purple-500 cursor-pointer"
                      />
                    </div>
                    {quietHoursEnabled ? (
                      <div className="flex items-center space-x-1.5 text-xs">
                        <input
                          type="time"
                          value={quietHoursStart}
                          onChange={e => setQuietHoursStart(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-purple-300 font-mono font-bold"
                        />
                        <span className="text-slate-500 font-bold">-</span>
                        <input
                          type="time"
                          value={quietHoursEnd}
                          onChange={e => setQuietHoursEnd(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-purple-300 font-mono font-bold"
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 block pt-1">ปิดอยู่ (ส่งเตือนตลอด 24 ชม.)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* SAVE TRIGGER RULES BUTTON */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRulesSavedToast('บันทึกเงื่อนไข Trigger Rules เรียบร้อยแล้ว!');
                    setTimeout(() => setRulesSavedToast(null), 3500);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition flex items-center space-x-2 active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>บันทึกเงื่อนไข Trigger Rules</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RECENT NOTIFICATION AUDIT LOGS */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                <Clock className="w-4 h-4" />
                <span>ประวัติการส่งล่าสุด (Notification Audit Log)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">10 รายการล่าสุด</span>
            </div>

            <div className="space-y-2.5 text-xs max-h-[460px] overflow-y-auto pr-1">
              {logs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      log.channel === 'LINE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    }`}>
                      {log.channel}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{log.date} {log.time}</span>
                  </div>
                  <p className="font-bold text-slate-200 text-[11px]">{log.event}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>ผู้รับ: {log.recipient}</span>
                    <span className="text-emerald-400 font-bold">{log.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: DETAILED NOTIFICATION MESSAGE PREVIEW & TESTER */}
      <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl space-y-5 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="font-extrabold text-slate-100 text-base flex items-center space-x-2">
              <Eye className="w-5 h-5 text-amber-400" />
              <span>รายละเอียดรูปแบบข้อความการแจ้งเตือนจริง (Notification Template Inspector)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              คลิกเลือกประเภทหัวข้อเพื่อดูรายละเอียดข้อความ ตัวเลข ยอดขาย และรูปแบบที่จะส่งไปยัง LINE และ Telegram
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleTriggerTest('line', activeTab)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ทดสอบส่งเข้า LINE</span>
            </button>
            <button
              onClick={() => handleTriggerTest('telegram', activeTab)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95 shrink-0"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>ทดสอบส่งเข้า Telegram</span>
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION BUTTONS */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2.5 rounded-2xl font-extrabold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'daily'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>📊 สรุปยอดขายประจำวัน</span>
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2.5 rounded-2xl font-extrabold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'stock'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>⚠️ วัตถุดิบใกล้หมดสต็อก</span>
          </button>

          <button
            onClick={() => setActiveTab('void')}
            className={`px-4 py-2.5 rounded-2xl font-extrabold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'void'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>❌ การยกเลิกบิล / คืนเงิน</span>
          </button>

          <button
            onClick={() => setActiveTab('new_order')}
            className={`px-4 py-2.5 rounded-2xl font-extrabold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'new_order'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>🛒 ออเดอร์ใหม่ผ่าน QR</span>
          </button>

          <button
            onClick={() => setActiveTab('kds')}
            className={`px-4 py-2.5 rounded-2xl font-extrabold transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'kds'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>⏰ ออเดอร์ช้าในครัว</span>
          </button>
        </div>

        {/* ACTIVE TEMPLATE DETAILS DISPLAY BOX */}
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
              <FileText className="w-4 h-4" />
              <span>รายละเอียดโครงสร้างตัวอย่างข้อความ (Template Raw Payload)</span>
            </div>

            <button
              onClick={() => handleCopyMessage(getMessageContent(activeTab))}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-1.5 active:scale-95"
            >
              {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSuccess ? 'คัดลอกข้อความแล้ว!' : 'คัดลอกข้อความ'}</span>
            </button>
          </div>

          <pre className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-mono text-emerald-300 leading-relaxed overflow-x-auto whitespace-pre-wrap selection:bg-emerald-500 selection:text-slate-950">
            {getMessageContent(activeTab)}
          </pre>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between text-xs text-slate-400">
            <span>💡 หมายเหตุ: ตัวเลข ยอดขาย รายการเมนู และชื่อพนักงานจะถูกประมวลผลจากฐานข้อมูล POS จริง ณ เวลาที่ส่ง</span>
            <span className="text-emerald-400 font-mono font-bold">Status: Ready to Send</span>
          </div>
        </div>
      </div>

      {/* SIMULATED SMARTPHONE NOTIFICATION MODAL */}
      {isSimulatedMobileOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-slate-100">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm text-slate-100">
                  ตัวอย่างการรับการแจ้งเตือนบนมือถือ
                </h3>
              </div>
              <button
                onClick={() => setIsSimulatedMobileOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SIMULATED SMARTPHONE SCREEN CHAT BUBBLE */}
            <div className="bg-slate-950 rounded-3xl border-2 border-slate-800 overflow-hidden shadow-2xl">
              {/* PHONE TOP STATUS BAR */}
              <div className={`p-3 text-white text-xs font-bold flex items-center justify-between ${
                simulatedChannel === 'line' ? 'bg-emerald-600' : 'bg-cyan-600'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  <span>{simulatedChannel === 'line' ? '💬 LINE Group: ผู้บริหาร' : '✈️ Telegram: @KapraoBot'}</span>
                </div>
                <span className="font-mono text-[10px]">100% 🔋</span>
              </div>

              {/* CHAT BUBBLE AREA */}
              <div className="p-4 bg-slate-900 min-h-[280px] max-h-[360px] overflow-y-auto space-y-3">
                <div className="text-center">
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-mono">
                    วันนี้ {new Date().toLocaleTimeString('th-TH')}
                  </span>
                </div>

                <div className="flex items-start space-x-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                    simulatedChannel === 'line' ? 'bg-emerald-500' : 'bg-cyan-500'
                  }`}>
                    {simulatedChannel === 'line' ? 'LINE' : 'TG'}
                  </div>

                  <div className="bg-slate-950 border border-slate-800 text-slate-100 p-3 rounded-2xl rounded-tl-none space-y-1 text-xs shadow-md">
                    <span className="text-[10px] text-amber-400 font-bold block">{simulatedTitle}</span>
                    <p className="font-mono text-[11px] text-emerald-300 leading-relaxed whitespace-pre-wrap">
                      {simulatedMessage}
                    </p>
                    <span className="text-[9px] text-slate-500 block text-right font-mono pt-1">
                      {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. • Read
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="flex items-center justify-between text-xs pt-2">
              <span className="text-emerald-400 font-bold text-[11px] flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>ส่งข้อความทดสอบสำเร็จ!</span>
              </span>
              <button
                onClick={() => setIsSimulatedMobileOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

