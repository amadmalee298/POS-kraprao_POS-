import React, { useState } from 'react';
import {
  Search,
  Flame,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Utensils,
  Receipt,
  X,
  Banknote,
  Smartphone,
  QrCode,
  User,
  ArrowRight,
  Printer,
  Calculator,
  Ban,
  ListChecks,
  CheckSquare,
  Square,
  Zap,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MenuCategory, MenuItem, CartItem, Order, PaymentMethod } from '../../types';
import { calculateOrderTotals } from '../../utils/tax';
import { isItemInCategory } from '../../utils/categoryUtils';
import { CustomizationModal } from './CustomizationModal';
import { QuickAddModal } from './QuickAddModal';
import { PaymentModal } from './PaymentModal';
import { ReceiptModal } from './ReceiptModal';
import { TouchNumpadModal } from './TouchNumpad';
import { CancelOrderModal } from './CancelOrderModal';
import { CashShiftManagementPanel } from '../settings/CashShiftManagementPanel';
import { printReceiptViaWindow } from '../../utils/printReceipt';

export const POSView: React.FC = () => {
  const {
    menuItems,
    categories,
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
    settings,
    currentOpenShift,
    currentBranch,
    setIsLocked
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
  const [isCancelCartConfirmOpen, setIsCancelCartConfirmOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Touch Numpad state
  const [activeNumpadItem, setActiveNumpadItem] = useState<CartItem | null>(null);
  const [isDiscountNumpadOpen, setIsDiscountNumpadOpen] = useState(false);

  // Discount input state
  const [discountVal, setDiscountVal] = useState<number>(0);

  // Mobile tab state ('menu' or 'cart') for iPhone
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');

  // Bulk edit mode state
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);

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

  // Current order number prediction
  const nextOrderNum = (1650 + orders.length + 1).toString();

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
      branchId: currentBranch?.id || 'main-branch',
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
    const matchesCategory = isItemInCategory(item, selectedCategory, categories);
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.nameEn && item.nameEn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Calculate cart totals & tax
  const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
    if (
      (item.availableSpiceLevels && item.availableSpiceLevels.length > 0) ||
      (item.availableProteins && item.availableProteins.length > 0)
    ) {
      setSelectedMenuItem(item);
      setIsCustomizationOpen(true);
    } else {
      addToCart(item, 1);
    }
  };

  const handleDiscountChange = (val: number) => {
    setDiscountVal(val);
    setDiscount({
      amount: val,
      type: 'fixed'
    });
  };

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
  };

  const handleProceedPayment = () => {
    if (cart.length === 0) return;
    setIsPaymentOpen(true);
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-6.5rem)] bg-[#0d0704] text-amber-50 font-sans selection:bg-orange-500 selection:text-white overflow-hidden">
      
      {/* LEFT PANEL: MENU & CATEGORIES (Strict 2-Column Grid on both iPhone and iPad) */}
      <div className={`flex-1 ${mobileTab === 'menu' ? 'flex' : 'hidden'} md:flex flex-col h-full overflow-hidden border-r border-[#22140c]`}>
        
        {/* Top Header Bar inside POSView */}
        <div className="p-3 bg-[#110905] border-b border-[#24150c] space-y-2.5 shrink-0">
          
          {/* Top Status Strip */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center space-x-2 shrink-0">
              {/* POS Badge */}
              <div className="flex items-center space-x-1.5 bg-[#180f0a] border border-[#2b1a11] px-3 py-1 rounded-xl shadow-sm">
                <Flame className="w-3.5 h-3.5 text-[#ff6600] fill-[#ff6600]" />
                <span className="font-extrabold text-xs text-orange-400 tracking-wider">POS</span>
              </div>

              {/* Cashier Badge */}
              <div className="flex items-center space-x-1.5 bg-[#180f0a] border border-[#2b1a11] px-2.5 py-1 rounded-xl text-xs text-amber-200/90 shadow-sm">
                <User className="w-3.5 h-3.5 text-orange-400" />
                <span className="font-semibold truncate">{currentUser.name.split(' ')[0]}</span>
              </div>

              {/* Order Number Badge */}
              <div className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-[#ff6600] text-white font-black text-xs shadow-md shadow-orange-950/40 shrink-0">
                <span>ออเดอร์ #{nextOrderNum}</span>
              </div>

              {/* Shift Status Button */}
              <button
                onClick={() => setIsShiftModalOpen(true)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition border shadow-sm active:scale-95 shrink-0 ${
                  currentOpenShift
                    ? 'bg-[#180f0a] hover:bg-[#22160f] border-[#2b1a11] text-emerald-400'
                    : 'bg-[#180f0a] hover:bg-[#22160f] border-[#2b1a11] text-stone-300 hover:text-white'
                }`}
                title="จัดการเปิด-ปิดกะ ลิ้นชักเงินสด"
              >
                <span className={`w-2 h-2 rounded-full ${currentOpenShift ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
                <span>
                  {currentOpenShift
                    ? `กะ: เปิดอยู่ (#${currentOpenShift.id.slice(-3)})`
                    : 'ยังไม่เปิดกะ (เปิดกะ)'}
                </span>
              </button>
            </div>

            {/* Quick Actions / Recent Receipts / Quick Add */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setIsRecentReceiptsOpen(true)}
                className="p-1.5 bg-[#180f0a] hover:bg-[#22160f] border border-[#2b1a11] text-stone-300 hover:text-orange-400 rounded-xl transition active:scale-95 shadow-sm flex items-center space-x-1 text-xs"
                title="ดูประวัติออเดอร์และพิมพ์ใบเสร็จ"
              >
                <Printer className="w-3.5 h-3.5 text-orange-400" />
                <span className="hidden sm:inline font-semibold">พิมพ์ใบเสร็จ</span>
              </button>

              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="p-1.5 bg-[#180f0a] hover:bg-[#22160f] border border-[#2b1a11] text-stone-300 hover:text-orange-400 rounded-xl transition active:scale-95 shadow-sm flex items-center space-x-1 text-xs"
                title="สั่งรายการแบบพิมพ์ราคาเองด่วน"
              >
                <Zap className="w-3.5 h-3.5 text-orange-400" />
                <span className="hidden sm:inline font-semibold">สั่งด่วน</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาเมนูอาหารกะเพรา..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#130c08] border border-[#26160e] focus:border-[#ff6600] rounded-xl pl-10 pr-4 py-2 text-xs text-amber-100 placeholder-stone-500 focus:outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2 text-stone-400 hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#ff6600] text-black shadow-md shadow-orange-950/40'
                  : 'bg-[#180f0a] text-stone-300 hover:text-white hover:bg-[#22160f] border border-[#26160e]'
              }`}
            >
              ทั้งหมด ({menuItems.length})
            </button>

            {categories.map(cat => {
              const count = menuItems.filter(item => isItemInCategory(item, cat.id, categories)).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#ff6600] text-black shadow-md shadow-orange-950/40'
                      : 'bg-[#180f0a] text-stone-300 hover:text-white hover:bg-[#22160f] border border-[#26160e]'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-black/20 text-black font-extrabold' : 'bg-[#26160e] text-stone-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Grid (Strict 2 Columns, matching user screenshot) */}
        <div className="flex-1 p-2.5 sm:p-4 overflow-y-auto pb-24 md:pb-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            {filteredMenuItems.map(item => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="group bg-[#130c08] hover:bg-[#1a100a] border border-[#23140c] hover:border-[#ff6600]/40 rounded-2xl p-2.5 sm:p-3 cursor-pointer transition flex flex-col justify-between shadow-md active:scale-[0.98]"
              >
                {/* Food Image */}
                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#180f0a] border border-[#24150c] mb-2 shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300 brightness-95"
                    loading="lazy"
                  />
                  {item.isPopular && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-[#ff6600] text-black font-extrabold text-[9px] rounded-md shadow-md flex items-center space-x-0.5">
                      <Flame className="w-2.5 h-2.5 fill-black" />
                      <span>ขายดี</span>
                    </span>
                  )}
                </div>

                {/* Info Row: Title on Left, Price on Right */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <h4 className="font-extrabold text-amber-50 text-xs sm:text-sm line-clamp-1 group-hover:text-orange-400 transition">
                    {item.name}
                  </h4>
                  <span className="font-black text-[#ff6600] text-xs sm:text-base font-mono whitespace-nowrap">
                    ฿{item.price}
                  </span>
                </div>

                {/* Action Button: + เพิ่มสั่ง */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleItemClick(item);
                  }}
                  className="w-full bg-[#ff6600] hover:bg-[#ff7711] text-black font-extrabold text-xs sm:text-sm py-2 px-3 rounded-xl shadow flex items-center justify-center space-x-1 active:scale-95 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>เพิ่มสั่ง</span>
                </button>
              </div>
            ))}
          </div>

          {filteredMenuItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-500 space-y-2">
              <Utensils className="w-10 h-10 stroke-[1.2]" />
              <p className="text-sm">ไม่พบเมนูอาหารที่ค้นหา</p>
            </div>
          )}
        </div>

        {/* Mobile Sticky Floating Bar (for iPhone when viewing menu) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 p-2.5 bg-[#120a06]/95 border-t border-[#26160e] backdrop-blur-md flex items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center space-x-2 pl-1">
            <div className="relative">
              <ShoppingBag className="w-5 h-5 text-orange-400" />
              {totalItemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#ff6600] text-black font-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center shadow">
                  {totalItemCount}
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-stone-400 block">ยอดรวม</span>
              <span className="text-[#ff6600] font-black text-base font-mono">฿{grandTotal.toFixed(0)}</span>
            </div>
          </div>

          <button
            onClick={() => setMobileTab('cart')}
            className="flex-1 py-2.5 px-4 bg-[#ff6600] hover:bg-[#ff7711] text-black font-black text-xs rounded-xl shadow-lg flex items-center justify-center space-x-1.5 active:scale-95 transition"
          >
            <span>ดูรายการสั่ง ({totalItemCount})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: CART & CHECKOUT (Split-screen on iPad/Desktop, Slide/Tab on iPhone) */}
      <div className={`w-full md:w-80 lg:w-96 bg-[#110905] border-t md:border-t-0 border-[#22140c] ${mobileTab === 'cart' ? 'flex' : 'hidden'} md:flex flex-col h-full shadow-2xl shrink-0`}>
        
        {/* Cart Header */}
        <div className="p-3.5 border-b border-[#24150c] flex items-center justify-between bg-[#140b07]">
          <div className="flex items-center space-x-2">
            {/* Mobile Back to Menu button */}
            <button
              onClick={() => setMobileTab('menu')}
              className="md:hidden p-1.5 bg-[#180f0a] border border-[#2b1a11] text-orange-400 rounded-lg mr-1 flex items-center space-x-1 text-xs font-bold active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>เมนู</span>
            </button>
            <Receipt className="w-4 h-4 text-[#ff6600]" />
            <span className="font-extrabold text-sm text-amber-50">รายการสั่ง</span>
          </div>

          <div className="flex items-center space-x-2">
            {cart.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setIsBulkEditMode(!isBulkEditMode)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border transition ${
                    isBulkEditMode
                      ? 'bg-[#ff6600] text-black border-orange-400'
                      : 'bg-[#180f0a] hover:bg-[#22160f] text-stone-300 border-[#2b1a11]'
                  }`}
                  title="เลือกหลายรายการพร้อมกัน"
                >
                  <ListChecks className="w-3.5 h-3.5 inline mr-1" />
                  <span>{isBulkEditMode ? 'เสร็จ' : 'เลือก'}</span>
                </button>

                <button
                  type="button"
                  onClick={clearCart}
                  className="px-2.5 py-1 bg-[#180f0a] hover:bg-[#22160f] border border-[#2b1a11] text-stone-300 hover:text-white text-[11px] font-semibold rounded-xl transition active:scale-95"
                  title="ล้างรายการสั่งทั้งหมด"
                >
                  ล้างทั้งหมด
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bulk Actions (When in Bulk Edit Mode) */}
        {isBulkEditMode && cart.length > 0 && (
          <div className="p-2.5 bg-[#180f0a] border-b border-[#24150c] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-stone-300">
              <button
                type="button"
                onClick={handleSelectAllCartItems}
                className="flex items-center space-x-1.5 hover:text-white"
              >
                {selectedCartItemIds.length === cart.length ? (
                  <CheckSquare className="w-4 h-4 text-orange-400" />
                ) : (
                  <Square className="w-4 h-4 text-stone-500" />
                )}
                <span>เลือกทั้งหมด ({cart.length})</span>
              </button>
              <span className="text-[11px] text-stone-400">
                เลือก <strong className="text-orange-400">{selectedCartItemIds.length}</strong> รายการ
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={() => handleBulkQuantityChange(-1)}
                className="py-1 px-2 bg-[#130c08] hover:bg-[#20130c] disabled:opacity-40 text-stone-300 text-xs font-bold rounded-lg border border-[#2b1a11]"
              >
                <Minus className="w-3 h-3 inline mr-0.5" /> -1
              </button>
              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={() => handleBulkQuantityChange(1)}
                className="py-1 px-2 bg-[#130c08] hover:bg-[#20130c] disabled:opacity-40 text-stone-300 text-xs font-bold rounded-lg border border-[#2b1a11]"
              >
                <Plus className="w-3 h-3 inline mr-0.5" /> +1
              </button>
              <button
                type="button"
                disabled={selectedCartItemIds.length === 0}
                onClick={handleBulkDelete}
                className="py-1 px-2 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/60"
              >
                <Trash2 className="w-3 h-3 inline mr-0.5" /> ลบ
              </button>
            </div>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2 no-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-500 py-16 space-y-3">
              <ShoppingBag className="w-16 h-16 text-stone-700 stroke-[1.2]" />
              <span className="text-xs font-medium text-stone-400">ยังไม่มีรายการ</span>
            </div>
          ) : (
            cart.map(item => {
              const isSelected = selectedCartItemIds.includes(item.cartItemId);
              return (
                <div
                  key={item.cartItemId}
                  className={`p-2.5 bg-[#140c07] border rounded-xl space-y-2 transition ${
                    isSelected ? 'border-orange-500/80 bg-orange-950/20' : 'border-[#24150c]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-start space-x-2">
                      {isBulkEditMode && (
                        <button
                          type="button"
                          onClick={() => toggleSelectItem(item.cartItemId)}
                          className="mt-0.5 text-stone-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-orange-400" />
                          ) : (
                            <Square className="w-4 h-4 text-stone-600" />
                          )}
                        </button>
                      )}
                      <div>
                        <h5 className="font-extrabold text-amber-100 text-xs">{item.menuItem.name}</h5>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.spiceLevel && (
                            <span className="px-1.5 py-0.2 bg-orange-950/70 border border-orange-500/30 text-orange-300 text-[10px] rounded font-semibold">
                              {item.spiceLevel}
                            </span>
                          )}
                          {item.proteinChoice && (
                            <span className="px-1.5 py-0.2 bg-[#20130c] border border-[#352014] text-amber-200 text-[10px] rounded font-semibold">
                              {item.proteinChoice.name}
                            </span>
                          )}
                          {item.selectedAddOns.map(a => (
                            <span key={a.id} className="px-1.5 py-0.2 bg-[#20130c] border border-[#352014] text-stone-300 text-[10px] rounded">
                              +{a.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.cartItemId)}
                      className="text-stone-500 hover:text-rose-400 p-1 transition"
                      title="ลบรายการ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#1d1109]">
                    <div className="flex items-center space-x-1.5 bg-[#180f0a] border border-[#2a1a11] rounded-lg p-0.5">
                      <button
                        onClick={() => updateCartQuantity(item.cartItemId, -1)}
                        className="p-1 text-stone-300 hover:text-white hover:bg-[#25170f] rounded active:scale-95"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveNumpadItem(item)}
                        className="px-2 py-0.5 text-xs font-mono font-black text-orange-400 hover:bg-[#25170f] rounded"
                        title="แตะเพื่อกรอกจำนวน"
                      >
                        {item.quantity}
                      </button>
                      <button
                        onClick={() => updateCartQuantity(item.cartItemId, 1)}
                        className="p-1 text-stone-300 hover:text-white hover:bg-[#25170f] rounded active:scale-95"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-black text-xs text-[#ff6600] font-mono">
                      ฿{item.totalPrice}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Calculations & Payment Section (Bottom) */}
        <div className="p-3.5 bg-[#0d0704] border-t border-[#24150c] space-y-2.5">
          
          {/* Subtotal line */}
          <div className="flex items-center justify-between text-xs text-stone-300 font-medium">
            <span>ราคารวม</span>
            <span className="font-bold font-mono text-stone-100">฿{rawSubtotal.toFixed(2)}</span>
          </div>

          {/* Discount input line */}
          <div className="flex items-center justify-between text-xs space-x-2">
            <span className="text-stone-300 whitespace-nowrap">ส่วนลด (฿)</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                min="0"
                value={discountVal || ''}
                onChange={e => handleDiscountChange(Number(e.target.value))}
                placeholder="0"
                className="w-20 bg-[#140c07] border border-[#2b1a11] rounded-xl px-2 py-1 text-right text-xs font-mono font-bold text-[#ff6600] focus:outline-none focus:border-[#ff6600]"
              />
              <button
                type="button"
                onClick={() => setIsDiscountNumpadOpen(true)}
                className="p-1.5 bg-[#180f0a] hover:bg-[#22160f] text-orange-400 rounded-lg border border-[#2b1a11] transition active:scale-95"
                title="คีย์ส่วนลดด้วย Touch Numpad"
              >
                <Calculator className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tax / VAT line */}
          {enableVat && vatType !== 'none' && (
            <div className="flex items-center justify-between text-xs text-stone-400 font-medium pt-1 border-t border-[#1a100a]">
              <span>ภาษี VAT ({vatRate}%)</span>
              <span className="font-bold font-mono text-orange-400">
                {vatType === 'exclusive' ? `+฿${vatAmount.toFixed(2)}` : `฿${vatAmount.toFixed(2)}`}
              </span>
            </div>
          )}

          {/* Grand Total (Big bold orange text matching screenshot) */}
          <div className="flex items-center justify-between pt-1 border-t border-[#22140c]">
            <span className="text-amber-100 font-extrabold text-sm sm:text-base">รวมทั้งหมด</span>
            <span className="text-[#ff6600] font-black font-mono text-2xl sm:text-3xl tracking-tight">
              ฿{grandTotal.toFixed(0)}
            </span>
          </div>

          {/* Payment Method Selection (3 Large Buttons: เงินสด, โอน, QR) */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-semibold text-stone-400">
              วิธีชำระเงิน
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('cash')}
                className={`p-2.5 rounded-2xl text-xs font-black transition flex flex-col items-center justify-center space-y-1 cursor-pointer active:scale-95 ${
                  selectedPaymentMethod === 'cash'
                    ? 'bg-[#ff6600] text-black shadow-lg border-2 border-orange-400'
                    : 'bg-[#180f0a] text-stone-300 border border-[#2a1a11] hover:border-orange-500/40'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>เงินสด</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('transfer')}
                className={`p-2.5 rounded-2xl text-xs font-black transition flex flex-col items-center justify-center space-y-1 cursor-pointer active:scale-95 ${
                  selectedPaymentMethod === 'transfer'
                    ? 'bg-[#ff6600] text-black shadow-lg border-2 border-orange-400'
                    : 'bg-[#180f0a] text-stone-300 border border-[#2a1a11] hover:border-orange-500/40'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>โอน</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod('promptpay')}
                className={`p-2.5 rounded-2xl text-xs font-black transition flex flex-col items-center justify-center space-y-1 cursor-pointer active:scale-95 ${
                  selectedPaymentMethod === 'promptpay'
                    ? 'bg-[#ff6600] text-black shadow-lg border-2 border-orange-400'
                    : 'bg-[#180f0a] text-stone-300 border border-[#2a1a11] hover:border-orange-500/40'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>QR</span>
              </button>
            </div>
          </div>

          {/* Action Buttons: Checkout button + Pre-bill print */}
          <div className="space-y-2 pt-1">
            <button
              disabled={cart.length === 0}
              onClick={handleProceedPayment}
              className={`w-full py-3.5 rounded-2xl text-base font-black flex items-center justify-center space-x-2 transition ${
                cart.length === 0
                  ? 'bg-[#19110b] text-stone-500 border border-[#281a11] cursor-not-allowed'
                  : 'bg-[#ff6600] hover:bg-[#ff7711] text-black shadow-xl shadow-orange-950/60 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <span>ชำระเงิน</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>

            {cart.length > 0 && (
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handlePrintPreBill}
                  className="text-stone-400 hover:text-orange-400 transition flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>พิมพ์ใบเช็คบิล</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCancelCartConfirmOpen(true)}
                  className="text-stone-500 hover:text-rose-400 transition flex items-center space-x-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>ยกเลิกออเดอร์</span>
                </button>
              </div>
            )}
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
          if (settings.autoLockAfterPayment) {
            setIsLocked(true);
          }
        }}
        order={completedOrder}
        isPreBill={isPreBill}
      />

      {/* Recent Receipts Modal */}
      {isRecentReceiptsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#140c07] border border-[#2b1a11] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#180f0a] border-b border-[#24150c]">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-orange-400" />
                <h3 className="font-bold text-amber-50 text-sm">ประวัติ & พิมพ์ใบเสร็จรับเงิน</h3>
              </div>
              <button
                onClick={() => setIsRecentReceiptsOpen(false)}
                className="p-1 text-stone-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {orders.slice(0, 20).map(ord => (
                <div
                  key={ord.id}
                  className="p-3 bg-[#180f0a] border border-[#281810] rounded-xl flex items-center justify-between hover:border-orange-500/40 transition"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-orange-400 text-xs">#{ord.orderNumber}</span>
                      <span className="text-[10px] text-stone-400">{new Date(ord.createdAt).toLocaleTimeString('th-TH')}</span>
                    </div>
                    <p className="text-xs text-stone-300 mt-0.5">
                      {ord.items.map(i => `${i.menuItem.name} x${i.quantity}`).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-black text-amber-50 text-sm">฿{ord.grandTotal}</span>
                    <button
                      onClick={async () => {
                        await printReceiptViaWindow(ord, currentBranch, settings, {
                          cashierName: currentUser.name.split(' ')[0]
                        });
                      }}
                      className="px-2.5 py-1 bg-[#25170f] hover:bg-[#342015] border border-[#3b2316] text-orange-300 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>พิมพ์</span>
                    </button>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-center text-stone-500 py-8 text-xs">ยังไม่มีประวัติออเดอร์</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Cart Confirmation Dialog */}
      {isCancelCartConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#140c07] border border-[#2b1a11] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-amber-50 text-sm">ยกเลิกรายการสั่ง?</h3>
                <p className="text-xs text-stone-400">รายการในตะกร้าทั้งหมดจะถูกล้างออก</p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelCartConfirmOpen(false)}
                className="px-3 py-1.5 bg-[#180f0a] hover:bg-[#25170f] border border-[#2b1a11] text-stone-300 rounded-xl text-xs font-semibold"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setIsCancelCartConfirmOpen(false);
                  setMobileTab('menu');
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-extrabold shadow"
              >
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal for completed orders if needed */}
      {orderToCancel && (
        <CancelOrderModal
          isOpen={!!orderToCancel}
          onClose={() => setOrderToCancel(null)}
          order={orderToCancel}
          onSuccess={() => setOrderToCancel(null)}
        />
      )}

      {/* Shift Management Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#140c07] border border-[#2b1a11] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#180f0a] border-b border-[#24150c]">
              <div className="flex items-center space-x-2">
                <Banknote className="w-5 h-5 text-orange-400" />
                <h3 className="font-bold text-amber-50 text-sm">จัดการเปิด-ปิดกะ & ลิ้นชักเงินสด</h3>
              </div>
              <button
                onClick={() => setIsShiftModalOpen(false)}
                className="p-1 text-stone-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <CashShiftManagementPanel />
            </div>
          </div>
        </div>
      )}

      {/* Touch Numpad Modal for Cart Item Quantity */}
      {activeNumpadItem && (
        <TouchNumpadModal
          isOpen={!!activeNumpadItem}
          title={`คีย์ป้อนจำนวน: ${activeNumpadItem.menuItem.name}`}
          subtitle={`ราคาต่อหน่วย: ฿${activeNumpadItem.unitPrice.toLocaleString('th-TH')}`}
          initialValue={activeNumpadItem.quantity}
          mode="quantity"
          unitLabel="ชิ้น"
          unitPrice={activeNumpadItem.unitPrice}
          onClose={() => setActiveNumpadItem(null)}
          onConfirm={(val) => {
            if (val > 0) {
              setCartItemQuantity(activeNumpadItem.cartItemId, val);
            } else {
              removeFromCart(activeNumpadItem.cartItemId);
            }
            setActiveNumpadItem(null);
          }}
        />
      )}

      {/* Touch Numpad Modal for Discount */}
      {isDiscountNumpadOpen && (
        <TouchNumpadModal
          isOpen={isDiscountNumpadOpen}
          title="ระบุส่วนลดท้ายบิล (บาท)"
          subtitle={`ยอดรวมก่อนลด: ฿${rawSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
          initialValue={discountVal}
          mode="discount"
          unitLabel="บาท"
          maxLimit={rawSubtotal}
          onClose={() => setIsDiscountNumpadOpen(false)}
          onConfirm={(val) => {
            handleDiscountChange(val);
            setIsDiscountNumpadOpen(false);
          }}
        />
      )}
    </div>
  );
};
