import React, { useState } from 'react';
import {
  Search,
  Flame,
  Plus,
  Minus,
  Trash2,
  Tag,
  ShoppingBag,
  CreditCard,
  Utensils,
  Sparkles,
  ChevronRight,
  Zap,
  Receipt,
  X,
  Banknote,
  Smartphone,
  QrCode,
  User,
  RotateCcw,
  ArrowRight,
  Printer,
  History,
  FileText,
  Calculator,
  Ban,
  ListChecks,
  CheckSquare,
  Square,
  CheckCircle2,
  Check,
  Bot,
  Lightbulb,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingUp
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MenuCategory, MenuItem, CartItem, Order, PaymentMethod } from '../../types';
import { calculateOrderTotals } from '../../utils/tax';
import { CustomizationModal } from './CustomizationModal';
import { QuickAddModal } from './QuickAddModal';
import { PaymentModal } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';
import { TouchNumpadModal } from './TouchNumpad';
import { CancelOrderModal } from './CancelOrderModal';
import { CashShiftManagementPanel } from '../settings/CashShiftManagementPanel';

export const POSView: React.FC = () => {
  const {
    menuItems,
    cart,
    addToCart,
    updateCartQuantity,
    setCartItemQuantity,
    removeFromCart,
    clearCart,
    discount,
    setDiscount,
    currentUser,
    orders,
    updateOrderStatus,
    settings,
    currentOpenShift
  } = usePOS();

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected quick payment method state on the sidebar
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');

  // Modals state
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isPreBill, setIsPreBill] = useState(false);
  const [isRecentReceiptsOpen, setIsRecentReceiptsOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [isCancelCartOpen, setIsCancelCartOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Touch Numpad state
  const [activeNumpadItem, setActiveNumpadItem] = useState<CartItem | null>(null);
  const [isDiscountNumpadOpen, setIsDiscountNumpadOpen] = useState(false);

  // Discount input state
  const [discountVal, setDiscountVal] = useState<number>(0);

  // Mobile tab state ('menu' or 'cart')
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');

  // Bulk edit mode state
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const [isBulkSetQtyModalOpen, setIsBulkSetQtyModalOpen] = useState(false);

  // Auto-clean selectedCartItemIds if items are removed from cart
  React.useEffect(() => {
    if (cart.length === 0) {
      setIsBulkEditMode(false);
      setSelectedCartItemIds([]);
    } else {
      setSelectedCartItemIds(prev => prev.filter(id => cart.some(item => item.cartItemId === id)));
    }
  }, [cart]);

  const toggleSelectItem = (id: string) => {
    setSelectedCartItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllCartItems = () => {
    if (selectedCartItemIds.length === cart.length) {
      setSelectedCartItemIds([]);
    } else {
      setSelectedCartItemIds(cart.map(i => i.cartItemId));
    }
  };

  const handleBulkQuantityChange = (delta: number) => {
    selectedCartItemIds.forEach(id => {
      updateCartQuantity(id, delta);
    });
  };

  const handleBulkDelete = () => {
    selectedCartItemIds.forEach(id => {
      removeFromCart(id);
    });
    setSelectedCartItemIds([]);
  };

  const handleBulkSetExactQty = (qty: number) => {
    if (qty <= 0) return;
    selectedCartItemIds.forEach(id => {
      setCartItemQuantity(id, qty);
    });
    setIsBulkSetQtyModalOpen(false);
  };

  // Current order number prediction
  const nextOrderNum = (1650 + orders.length + 1).toString();

  const handleSelectPaymentAndOpenModal = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    if (cart.length > 0) {
      setIsPaymentOpen(true);
    }
  };

  // Print Pre-Bill (Check Bill before payment)
  const handlePrintPreBill = () => {
    if (cart.length === 0) return;
    const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    let calculatedDiscount = 0;
    if (discount.type === 'fixed') {
      calculatedDiscount = Math.min(discount.amount, rawSubtotal);
    } else {
      calculatedDiscount = (rawSubtotal * Math.min(discount.amount, 100)) / 100;
    }
    const { vatAmount, grandTotal } = calculateOrderTotals(rawSubtotal, calculatedDiscount, settings);

    const preBillOrder: Order = {
      id: `prebill-${Date.now()}`,
      orderNumber: `PRE-${nextOrderNum}`,
      branchId: 'main-branch',
      orderType: 'takeaway',
      tableNumber: undefined,
      items: cart,
      subtotal: rawSubtotal,
      discountAmount: calculatedDiscount,
      discountType: discount.type,
      vatAmount,
      grandTotal,
      paymentMethod: selectedPaymentMethod,
      tenderedAmount: grandTotal,
      changeAmount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setCompletedOrder(preBillOrder);
    setIsPreBill(true);
    setIsReceiptOpen(true);
  };

  // Filter menu items
  const filteredMenuItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate cart totals & tax
  const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  let calculatedDiscount = 0;
  if (discount.type === 'fixed') {
    calculatedDiscount = Math.min(discount.amount, rawSubtotal);
  } else {
    calculatedDiscount = (rawSubtotal * Math.min(discount.amount, 100)) / 100;
  }
  const { vatAmount, vatRate, vatType, enableVat, grandTotal } = calculateOrderTotals(
    rawSubtotal,
    calculatedDiscount,
    settings
  );

  const handleItemClick = (item: MenuItem) => {
    setSelectedMenuItem(item);
    setIsCustomizationOpen(true);
  };

  const handleDiscountChange = (val: number) => {
    setDiscountVal(val);
    setDiscount({
      amount: val,
      type: 'fixed'
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] bg-[#120b07] text-amber-50 font-sans selection:bg-orange-500 selection:text-white overflow-hidden">
      
      {/* LEFT PANEL: MENU & CATEGORIES */}
      <div className={`flex-1 ${mobileTab === 'menu' ? 'flex' : 'hidden'} lg:flex flex-col h-full overflow-hidden border-r border-[#261811]`}>
        
        {/* Top Header Bar */}
        <div className="p-3 bg-[#180f0a] border-b border-[#2a1b13] space-y-3">
          
          {/* Top Status Strip */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 bg-[#251710] border border-[#3d271b] px-3 py-1 rounded-xl">
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500 animate-pulse" />
                <span className="font-extrabold text-sm text-orange-400 tracking-wider">POS</span>
              </div>

              {/* Cashier Badge */}
              <div className="flex items-center space-x-1.5 bg-[#22160f] border border-[#382318] px-2.5 py-1 rounded-xl text-xs text-amber-200">
                <User className="w-3.5 h-3.5 text-orange-400" />
                <span className="font-medium truncate">{currentUser.name.split(' ')[0]}</span>
              </div>

              {/* Order Number Badge */}
              <div className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-black text-xs shadow-md shadow-orange-950/40">
                <span>ออเดอร์ #{nextOrderNum}</span>
              </div>

              {/* Shift Status & Z-Report Button */}
              <button
                onClick={() => setIsShiftModalOpen(true)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-extrabold transition border shadow-sm active:scale-95 ${
                  currentOpenShift
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-300 animate-pulse'
                }`}
                title="จัดการเปิด-ปิดกะ ลิ้นชักเงินสด และออก Z-Report"
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>
                  {currentOpenShift
                    ? `กะ: เปิดอยู่ (#SH-${currentOpenShift.id.slice(-3)})`
                    : '🔴 ยังไม่เปิดกะ (เปิดกะ)'}
                </span>
              </button>
            </div>

            {/* Quick Actions / Reset / Recent Receipts */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsRecentReceiptsOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl transition active:scale-95 shadow-sm"
                title="ดูประวัติออเดอร์และพิมพ์ใบเสร็จรับเงิน"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">ประวัติ & พิมพ์ใบเสร็จ</span>
              </button>

              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="flex items-center space-x-1 px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-600/40 text-red-300 font-bold text-xs rounded-xl transition active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>ยกเลิก</span>
                </button>
              )}

              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#2b1c14] hover:bg-[#38251a] border border-[#482f21] text-amber-300 text-xs font-semibold rounded-xl transition"
              >
                <Zap className="w-3.5 h-3.5 text-orange-400" />
                <span className="hidden sm:inline">สั่งด่วน</span>
              </button>
            </div>
          </div>

          {/* Search bar & Categories scrollable */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-amber-500/70 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ค้นหาเมนูอาหารกะเพรา..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#110a06] border border-[#2d1e15] rounded-xl pl-9 pr-4 py-2 text-xs text-amber-100 placeholder-amber-700/60 focus:outline-none focus:border-orange-500 transition"
              />
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 custom-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-950/50'
                  : 'bg-[#22160f] text-amber-200/80 hover:bg-[#2c1d14] border border-[#382419]'
              }`}
            >
              ทั้งหมด
            </button>

            <button
              onClick={() => setSelectedCategory('kaprao')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'kaprao'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-950/50'
                  : 'bg-[#22160f] text-amber-200/80 hover:bg-[#2c1d14] border border-[#382419]'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>กะเพรา</span>
            </button>

            <button
              onClick={() => setSelectedCategory('fry_soup')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'fry_soup'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-950/50'
                  : 'bg-[#22160f] text-amber-200/80 hover:bg-[#2c1d14] border border-[#382419]'
              }`}
            >
              <Utensils className="w-3.5 h-3.5 text-orange-400" />
              <span>ผัด/ต้ม</span>
            </button>

            <button
              onClick={() => setSelectedCategory('special')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'special'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-950/50'
                  : 'bg-[#22160f] text-amber-200/80 hover:bg-[#2c1d14] border border-[#382419]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>พิเศษ</span>
            </button>

            <button
              onClick={() => setSelectedCategory('drinks_dessert')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'drinks_dessert'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg shadow-orange-950/50'
                  : 'bg-[#22160f] text-amber-200/80 hover:bg-[#2c1d14] border border-[#382419]'
              }`}
            >
              เครื่องดื่ม
            </button>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto pb-28 lg:pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredMenuItems.map(item => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="group bg-[#19100a] hover:bg-[#231710] border border-[#2e1f16] hover:border-orange-500/50 rounded-2xl p-3 cursor-pointer transition duration-150 flex flex-row sm:flex-col items-center sm:items-stretch justify-between gap-3 active:scale-[0.98] shadow-md"
              >
                {/* Thumbnail Image */}
                <div className="relative h-20 w-20 sm:h-28 sm:w-full bg-[#100a06] rounded-xl overflow-hidden border border-[#23170f] shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300 filter brightness-95"
                  />
                  {item.isPopular && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-orange-600 text-white font-bold text-[9px] rounded shadow flex items-center space-x-0.5">
                      <Flame className="w-2.5 h-2.5 fill-white" />
                      <span>ขายดี</span>
                    </span>
                  )}
                  <div className="hidden sm:block absolute bottom-1.5 right-1.5 px-2 py-0.5 bg-slate-950/90 text-orange-400 text-xs font-black rounded-lg border border-orange-500/30 font-mono">
                    ฿{item.price}
                  </div>
                </div>

                {/* Details & Touch Button */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full space-y-1">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-amber-100 text-xs sm:text-sm line-clamp-1 group-hover:text-orange-400 transition">
                        {item.name}
                      </h4>
                      <span className="sm:hidden px-2 py-0.5 bg-slate-950/90 text-orange-400 text-xs font-black rounded-lg border border-orange-500/30 font-mono shrink-0">
                        ฿{item.price}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-200/60 line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="hidden sm:block text-[10px] text-amber-500/80 font-medium">
                      กดเพื่อเลือกตัวเลือก
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                      className="w-full sm:w-auto px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-xs rounded-lg shadow flex items-center justify-center space-x-1 active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>เพิ่มสั่ง</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Floating Bottom Bar for POS */}
        <div className="p-2.5 bg-[#180f0a]/95 border-t border-orange-500/30 lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around gap-2 shadow-2xl backdrop-blur-md">
          <button
            onClick={() => setMobileTab('menu')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center ${
              mobileTab === 'menu'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                : 'text-amber-200/70 hover:text-amber-100'
            }`}
          >
            <Utensils className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">รายการเมนู</span>
          </button>

          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center relative ${
              mobileTab === 'cart'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                : 'text-amber-200/70 hover:text-amber-100'
            }`}
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4 mb-0.5" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-2 bg-orange-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </div>
            <span className="text-[10px]">ตะกร้าสินค้า</span>
          </button>

          <button
            onClick={() => setIsRecentReceiptsOpen(true)}
            className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold text-amber-300 hover:text-amber-100 transition flex flex-col items-center justify-center"
          >
            <Printer className="w-4 h-4 mb-0.5 text-amber-400" />
            <span className="text-[10px]">ประวัติบิล</span>
          </button>

          <button
            disabled={cart.length === 0}
            onClick={() => setIsPaymentOpen(true)}
            className="flex-1 py-1.5 px-2 bg-gradient-to-r from-orange-500 to-amber-500 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition"
          >
            <CreditCard className="w-4 h-4 mb-0.5" />
            <span className="text-[10px] font-mono">฿{grandTotal.toFixed(0)}</span>
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: CART & CHECKOUT SIDEBAR */}
      <div className={`w-full lg:w-96 bg-[#160e09] border-t lg:border-t-0 border-[#2a1b13] ${mobileTab === 'cart' ? 'flex' : 'hidden'} lg:flex flex-col h-full shadow-2xl`}>
        
        {/* Cart Header */}
        <div className="p-3.5 border-b border-[#2a1b13] flex items-center justify-between bg-[#1d130d]">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setMobileTab('menu')}
              className="lg:hidden p-1 bg-[#2b1c14] hover:bg-[#38251a] text-orange-400 rounded-lg mr-1 flex items-center space-x-1 text-xs font-bold"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              <span>เมนู</span>
            </button>
            <Receipt className="w-5 h-5 text-orange-500" />
            <span className="font-extrabold text-sm text-amber-100">รายการสั่ง</span>
          </div>

          {cart.length > 0 && (
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isBulkEditMode) {
                    setIsBulkEditMode(false);
                    setSelectedCartItemIds([]);
                  } else {
                    setIsBulkEditMode(true);
                  }
                }}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition flex items-center space-x-1 ${
                  isBulkEditMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-[#25160e] hover:bg-[#341f14] text-amber-200 border-amber-500/40'
                }`}
                title="เลือกหลายรายการเพื่อลบหรือปรับจำนวนพร้อมกัน"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>{isBulkEditMode ? 'เสร็จสิ้น' : 'เลือกหลายรายการ'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCancelCartOpen(true)}
                className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/60 transition flex items-center space-x-1"
                title="ยกเลิกรายการสั่งทั้งหมดในตะกร้า"
              >
                <Ban className="w-3.5 h-3.5 text-rose-400" />
                <span>ยกเลิกออเดอร์</span>
              </button>
            </div>
          )}
        </div>

        {/* Bulk Action Bar (Visible when in Bulk Edit Mode) */}
        {isBulkEditMode && cart.length > 0 && (
          <div className="p-2.5 bg-[#25150c] border-b border-amber-500/30 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleSelectAllCartItems}
                className="flex items-center space-x-1.5 text-xs font-bold text-amber-200 hover:text-white"
              >
                {selectedCartItemIds.length === cart.length && cart.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-orange-400" />
                ) : (
                  <Square className="w-4 h-4 text-amber-400/70" />
                )}
                <span>
                  {selectedCartItemIds.length === cart.length
                    ? 'ยกเลิกเลือกทั้งหมด'
                    : `เลือกทั้งหมด (${cart.length})`}
                </span>
              </button>

              <span className="text-[11px] font-medium text-amber-300/80">
                เลือกแล้ว <strong className="text-orange-400 font-mono">{selectedCartItemIds.length}</strong> รายการ
              </span>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={() => handleBulkQuantityChange(-1)}
                className="py-1 px-1.5 bg-[#1b1009] hover:bg-[#2b190f] disabled:opacity-40 disabled:hover:bg-[#1b1009] text-amber-200 text-xs font-bold rounded-lg border border-[#3d2416] flex items-center justify-center space-x-1 active:scale-95 transition"
                title="ลดจำนวนรายการที่เลือก -1"
              >
                <Minus className="w-3.5 h-3.5 text-amber-400" />
                <span>-1</span>
              </button>

              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={() => handleBulkQuantityChange(1)}
                className="py-1 px-1.5 bg-[#1b1009] hover:bg-[#2b190f] disabled:opacity-40 disabled:hover:bg-[#1b1009] text-amber-200 text-xs font-bold rounded-lg border border-[#3d2416] flex items-center justify-center space-x-1 active:scale-95 transition"
                title="เพิ่มจำนวนรายการที่เลือก +1"
              >
                <Plus className="w-3.5 h-3.5 text-orange-400" />
                <span>+1</span>
              </button>

              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={() => setIsBulkSetQtyModalOpen(true)}
                className="py-1 px-1.5 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:hover:bg-amber-500/20 text-amber-300 text-xs font-bold rounded-lg border border-amber-500/40 flex items-center justify-center space-x-1 active:scale-95 transition"
                title="ตั้งค่าจำนวนสินค้าที่เลือกพร้อมกัน"
              >
                <span>ตั้งจำนวน</span>
              </button>

              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={handleBulkDelete}
                className="py-1 px-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-40 disabled:hover:bg-rose-950 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/60 flex items-center justify-center space-x-1 active:scale-95 transition"
                title="ลบรายการสินค้าที่เลือกออกจากตะกร้า"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>ลบ ({selectedCartItemIds.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2.5 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-amber-200/40 py-12 space-y-3">
              <div className="p-4 bg-[#110a06] rounded-full border border-[#2a1b13]">
                <ShoppingBag className="w-10 h-10 text-amber-600/50" />
              </div>
              <span className="text-xs font-medium text-amber-200/60">ยังไม่มีรายการ</span>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.cartItemId}
                className="p-3 bg-[#110a06] border border-[#271911] rounded-xl space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-amber-100 text-xs">{item.menuItem.name}</h5>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.spiceLevel && (
                        <span className="px-1.5 py-0.5 bg-orange-950/80 border border-orange-500/30 text-orange-300 text-[10px] rounded font-bold">
                          {item.spiceLevel}
                        </span>
                      )}
                      {item.proteinChoice && (
                        <span className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-500/30 text-amber-300 text-[10px] rounded font-bold">
                          {item.proteinChoice.name}
                        </span>
                      )}
                      {item.selectedAddOns.map(a => (
                        <span key={a.id} className="px-1.5 py-0.5 bg-[#251710] border border-[#382419] text-amber-200/80 text-[10px] rounded">
                          +{a.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.cartItemId)}
                    className="text-amber-200/50 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#1d120b]">
                  <div className="flex items-center space-x-2 bg-[#1b110a] border border-[#2c1d14] rounded-lg p-0.5">
                    <button
                      onClick={() => updateCartQuantity(item.cartItemId, -1)}
                      className="p-1 text-amber-200 hover:bg-[#2c1d14] rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNumpadItem(item)}
                      className="px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 active:bg-orange-500/30 text-orange-400 font-black rounded border border-orange-500/30 font-mono text-xs flex items-center space-x-1 transition active:scale-95"
                      title="แตะเพื่อคีย์ป้อนจำนวนด้วย Touch Numpad"
                    >
                      <span>{item.quantity}</span>
                      <Calculator className="w-3 h-3 text-orange-400" />
                    </button>
                    <button
                      onClick={() => updateCartQuantity(item.cartItemId, 1)}
                      className="p-1 text-amber-200 hover:bg-[#2c1d14] rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-black text-xs text-orange-400 font-mono">
                    ฿{item.totalPrice}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Calculations & Payment Options */}
        <div className="p-3.5 bg-[#120b07] border-t border-[#2a1b13] space-y-2.5">
          
          {/* Subtotal line */}
          <div className="flex items-center justify-between text-xs text-amber-200/80 font-medium">
            <span>ราคารวมสินค้า</span>
            <span className="font-bold font-mono text-amber-100">฿{rawSubtotal.toFixed(2)}</span>
          </div>

          {/* Discount input line */}
          <div className="flex items-center justify-between text-xs space-x-2">
            <span className="text-amber-200/80 whitespace-nowrap">ส่วนลด (฿)</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                min="0"
                value={discountVal || ''}
                onChange={e => handleDiscountChange(Number(e.target.value))}
                placeholder="0"
                className="w-24 bg-[#1c120b] border border-[#332116] rounded-xl px-2.5 py-1 text-right text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => setIsDiscountNumpadOpen(true)}
                className="p-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg border border-orange-500/40 transition active:scale-95"
                title="คีย์ส่วนลดด้วย Touch Numpad"
              >
                <Calculator className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tax / VAT line */}
          {enableVat && vatType !== 'none' && (
            <div className="flex items-center justify-between text-xs text-amber-300/90 font-medium pt-1 border-t border-[#1d120b]">
              <span className="flex items-center space-x-1">
                <span>ภาษี VAT ({vatRate}%)</span>
                <span className="text-[10px] text-amber-400/70">
                  {vatType === 'exclusive' ? '(บวกเพิ่ม)' : '(รวมในราคา)'}
                </span>
              </span>
              <span className="font-bold font-mono text-amber-400">
                {vatType === 'exclusive' ? `+฿${vatAmount.toFixed(2)}` : `฿${vatAmount.toFixed(2)}`}
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex items-center justify-between text-lg font-black pt-2 border-t border-[#23160f]">
            <span className="text-amber-100">รวมทั้งสิ้น</span>
            <span className="text-orange-500 font-mono text-2xl">฿{grandTotal.toFixed(2)}</span>
          </div>

          {/* Payment Method Selector Pills */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-200/60 uppercase tracking-wider">
              <span>เลือกวิธีชำระเงิน</span>
              <span className="text-[10px] text-orange-400 font-normal">กดเพื่อชำระเงินทันที</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleSelectPaymentAndOpenModal('cash')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 border disabled:opacity-40 ${
                  selectedPaymentMethod === 'cash'
                    ? 'bg-gradient-to-b from-orange-500 to-amber-600 text-slate-950 border-orange-400 shadow-md ring-1 ring-orange-300'
                    : 'bg-[#1b110a] text-amber-200/80 border-[#322015] hover:bg-[#25170f]'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>เงินสด</span>
              </button>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleSelectPaymentAndOpenModal('transfer')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 border disabled:opacity-40 ${
                  selectedPaymentMethod === 'transfer'
                    ? 'bg-gradient-to-b from-orange-500 to-amber-600 text-slate-950 border-orange-400 shadow-md ring-1 ring-orange-300'
                    : 'bg-[#1b110a] text-amber-200/80 border-[#322015] hover:bg-[#25170f]'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>โอน</span>
              </button>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleSelectPaymentAndOpenModal('promptpay')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center space-y-1 border disabled:opacity-40 ${
                  selectedPaymentMethod === 'promptpay'
                    ? 'bg-gradient-to-b from-orange-500 to-amber-600 text-slate-950 border-orange-400 shadow-md ring-1 ring-orange-300'
                    : 'bg-[#1b110a] text-amber-200/80 border-[#322015] hover:bg-[#25170f]'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>QR</span>
              </button>
            </div>
          </div>

          {/* Cart Action Buttons: Cancel, Print Pre-Bill & Checkout */}
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-2">
              <button
                disabled={cart.length === 0}
                onClick={() => setIsCancelCartOpen(true)}
                className="col-span-2 py-2.5 px-2 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/60 flex items-center justify-center space-x-1 transition active:scale-[0.98]"
                title="ยกเลิกออเดอร์และล้างตะกร้า"
              >
                <Ban className="w-4 h-4 text-rose-400" />
                <span>ยกเลิกออเดอร์</span>
              </button>

              <button
                disabled={cart.length === 0}
                onClick={handlePrintPreBill}
                className="col-span-3 py-2.5 px-2 bg-[#2a1b12] hover:bg-[#382419] disabled:opacity-40 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30 flex items-center justify-center space-x-1.5 transition active:scale-[0.98] shadow-sm"
                title="พิมพ์ใบเช็คบิล / ใบแจ้งรายการก่อนชำระเงิน"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>พิมพ์ใบเช็คบิล</span>
              </button>
            </div>

            <button
              disabled={cart.length === 0}
              onClick={() => setIsPaymentOpen(true)}
              className="w-full py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-400 hover:to-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm sm:text-base rounded-xl shadow-lg shadow-orange-950/60 flex items-center justify-center space-x-2 transition active:scale-[0.98]"
            >
              <span>ชำระเงิน</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CustomizationModal
        isOpen={isCustomizationOpen}
        onClose={() => setIsCustomizationOpen(false)}
        menuItem={selectedMenuItem}
      />

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSelectItem={item => handleItemClick(item)}
      />

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => {
          setIsPaymentOpen(false);
          setMobileTab('menu');
        }}
        initialPaymentMethod={selectedPaymentMethod}
        onOrderCompleted={order => {
          setCompletedOrder(order);
          setIsPreBill(false);
          setIsReceiptOpen(true);
          setMobileTab('menu');
        }}
      />

      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setMobileTab('menu');
        }}
        order={completedOrder}
        isPreBill={isPreBill}
      />

      {/* Recent Receipts & History Modal */}
      {isRecentReceiptsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700/60">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">ประวัติ & พิมพ์ใบเสร็จรับเงิน (Recent Receipts)</h3>
                  <p className="text-xs text-slate-400">เลือกออเดอร์ล่าสุดเพื่อพิมพ์ใบเสร็จรับเงิน หรือยกเลิกออเดอร์</p>
                </div>
              </div>
              <button
                onClick={() => setIsRecentReceiptsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>ยังไม่มีประวัติออเดอร์ในระบบ</p>
                </div>
              ) : (
                orders.slice().reverse().map(order => (
                  <div
                    key={order.id}
                    className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-amber-500/40 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-1">
                        <span className="font-mono font-black text-amber-400 text-sm">#{order.orderNumber}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {order.orderType === 'dine-in'
                            ? `ทานที่ร้าน (${order.tableNumber || 'T-01'})`
                            : order.orderType === 'takeaway'
                            ? 'ใส่กล่อง'
                            : 'เดลิเวอรี่'}
                        </span>
                        {order.status === 'cancelled' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/60">
                            ยกเลิกแล้ว
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                            {order.paymentMethod === 'cash'
                              ? 'เงินสด'
                              : order.paymentMethod === 'promptpay'
                              ? 'พร้อมเพย์'
                              : 'โอนเงิน'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center space-x-3">
                        <span>{new Date(order.createdAt).toLocaleString('th-TH')}</span>
                        <span>• {order.items.length} รายการ</span>
                      </div>

                      {order.status === 'cancelled' && (
                        <div className="mt-2 text-xs bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-xl text-rose-300 space-y-1">
                          <p className="font-bold text-rose-200 flex items-center space-x-1">
                            <span>🚫 เหตุผล: {order.cancelReason || 'ไม่ระบุเหตุผล'}</span>
                          </p>
                          {order.cancelledBy && (
                            <p className="text-[11px] text-rose-300/80">
                              ผู้ยกเลิก: <span className="font-semibold text-rose-200">{order.cancelledBy.userName}</span> ({order.cancelledBy.role === 'admin' ? 'เจ้าของร้าน' : order.cancelledBy.role === 'manager' ? 'ผู้จัดการ' : 'แคชเชียร์'})
                              {order.cancelledBy.cancelledAt && ` • ${new Date(order.cancelledBy.cancelledAt).toLocaleString('th-TH')}`}
                            </p>
                          )}
                          {order.cancelNote && (
                            <p className="text-[11px] text-slate-300 italic">
                              หมายเหตุ: {order.cancelNote}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <span className="font-mono font-extrabold text-base text-slate-100">
                        ฿{order.grandTotal.toFixed(2)}
                      </span>

                      {order.status === 'cancelled' ? (
                        <span className="px-3 py-1.5 bg-rose-950/80 text-rose-400 border border-rose-800/60 font-bold text-xs rounded-xl">
                          ยกเลิกแล้ว
                        </span>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setOrderToCancel(order)}
                            className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/60 shadow flex items-center space-x-1 transition active:scale-95 shrink-0"
                            title="ยกเลิกออเดอร์นี้"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-400" />
                            <span>ยกเลิกออเดอร์</span>
                          </button>
                          <button
                            onClick={() => {
                              setCompletedOrder(order);
                              setIsPreBill(false);
                              setIsReceiptOpen(true);
                              setIsRecentReceiptsOpen(false);
                            }}
                            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow flex items-center space-x-1.5 transition active:scale-95 shrink-0"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>พิมพ์ใบเสร็จ</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal with Permission Check & Dropdown Reason */}
      <CancelOrderModal
        isOpen={!!orderToCancel}
        onClose={() => setOrderToCancel(null)}
        order={orderToCancel}
      />

      {/* Confirmation Modal for Clearing Cart */}
      {isCancelCartOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-[#1b110a] border border-rose-900/60 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-950/90 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <Ban className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">ยกเลิกรายการในตะกร้า</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                คุณต้องการยกเลิกและล้างออเดอร์ทั้งหมดในตะกร้าใช่หรือไม่?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setIsCancelCartOpen(false)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition active:scale-95"
              >
                ย้อนกลับ
              </button>
              <button
                onClick={() => {
                  clearCart();
                  setIsCancelCartOpen(false);
                }}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-950/60 active:scale-95"
              >
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Touch Numpad for Cart Item Quantity */}
      {activeNumpadItem && (
        <TouchNumpadModal
          isOpen={!!activeNumpadItem}
          onClose={() => setActiveNumpadItem(null)}
          title={`คีย์ป้อนจำนวน: ${activeNumpadItem.menuItem.name}`}
          subtitle={`ราคาต่อหน่วย: ฿${activeNumpadItem.unitPrice.toLocaleString('th-TH')}`}
          initialValue={activeNumpadItem.quantity}
          mode="quantity"
          unitLabel="ชิ้น"
          unitPrice={activeNumpadItem.unitPrice}
          onConfirm={(val) => {
            setCartItemQuantity(activeNumpadItem.cartItemId, val);
            setActiveNumpadItem(null);
          }}
        />
      )}

      {/* Touch Numpad for Bill Discount */}
      <TouchNumpadModal
        isOpen={isDiscountNumpadOpen}
        onClose={() => setIsDiscountNumpadOpen(false)}
        title="ระบุส่วนลดท้ายบิล (บาท)"
        subtitle={`ยอดรวมก่อนลด: ฿${rawSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
        initialValue={discountVal}
        mode="discount"
        unitLabel="บาท"
        maxLimit={rawSubtotal}
        onConfirm={(val) => {
          handleDiscountChange(val);
          setIsDiscountNumpadOpen(false);
        }}
      />

      {/* SHIFT MANAGEMENT MODAL IN POS MODULE */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-100 text-lg">จัดการเปิด-ปิดกะ & ลิ้นชักเงินสด (Shift Management & Z-Report)</h2>
                  <p className="text-xs text-slate-400">ควบคุมยอดเงินทอนรอบกะ บันทึกเงินสดเข้า-ออก และออกรายงาน Z-Report เมื่อปิดกะ</p>
                </div>
              </div>
              <button
                onClick={() => setIsShiftModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="pt-2">
              <CashShiftManagementPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
