import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  ShoppingBag,
  Printer,
  Zap,
  Banknote,
  CreditCard,
  Check,
  Receipt,
  ChevronLeft,
  Percent,
  FileText
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { CartItem, MenuCategory, MenuItem, Order, OrderType } from '../../types';
import { isItemInCategory } from '../../utils/categoryUtils';
import { computeCartTotals, defaultSpiceLevel } from '../../utils/orderUtils';
import { printReceiptViaWindow } from '../../utils/printReceipt';
import { CustomizationModal } from './CustomizationModal';
import { QuickAddModal } from './QuickAddModal';
import { PaymentModal } from './PaymentModal';
import { QuickPayModal } from './QuickPayModal';
import { ReceiptModal } from './ReceiptModal';
import { TouchNumpadModal } from './TouchNumpad';
import { RecentReceiptsModal } from './RecentReceiptsModal';
import { CashShiftManagementPanel } from '../settings/CashShiftManagementPanel';

const ORDER_TYPES: { id: OrderType; label: string; short: string }[] = [
  { id: 'dine-in', label: 'ทานที่ร้าน', short: 'ร้าน' },
  { id: 'takeaway', label: 'กลับบ้าน', short: 'กลับบ้าน' },
  { id: 'delivery', label: 'เดลิเวอรี่', short: 'ส่ง' }
];

const ORDER_TYPE_KEY = 'pos_last_order_type';
const HOT = 'hot';

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const hasOptions = (item: MenuItem, addOnCount: number) =>
  (item.allowAddOns !== false && addOnCount > 0) ||
  (item.availableSpiceLevels?.length ?? 0) > 0 ||
  (item.availableProteins?.length ?? 0) > 0;

const cartItemDetails = (item: CartItem) =>
  [
    item.spiceLevel,
    item.proteinChoice?.name,
    ...item.selectedAddOns.map(a => `+${a.name.replace(/^เพิ่ม/, '')}`),
    item.specialNotes
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Counter POS: tap a dish to add it (default options), tap the options button to customise,
 * pay in one dialog. Order type and table are chosen once in the top bar.
 */
export const POSView: React.FC = () => {
  const {
    menuItems,
    categories,
    addOns,
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
    tables,
    setIsLocked
  } = usePOS();

  const hotItems = useMemo(() => menuItems.filter(m => m.isPopular || m.isFrequent), [menuItems]);
  const [category, setCategory] = useState<MenuCategory | 'all' | typeof HOT>(() => (hotItems.length ? HOT : 'all'));
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState<OrderType>(() => {
    try {
      const saved = localStorage.getItem(ORDER_TYPE_KEY) as OrderType | null;
      return saved && ORDER_TYPES.some(t => t.id === saved) ? saved : 'takeaway';
    } catch {
      return 'takeaway';
    }
  });
  const [table, setTable] = useState<string>(tables[0] || '1');

  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isFullInvoiceOpen, setIsFullInvoiceOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [isPreBill, setIsPreBill] = useState(false);
  const [done, setDone] = useState<{ order: Order; change: number; printed: boolean } | null>(null);
  const [isReceiptsOpen, setIsReceiptsOpen] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [numpadItem, setNumpadItem] = useState<CartItem | null>(null);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false); // phones

  useEffect(() => {
    try {
      localStorage.setItem(ORDER_TYPE_KEY, orderType);
    } catch {
      // storage unavailable: keep the choice for this session only
    }
  }, [orderType]);

  useEffect(() => {
    if (cart.length === 0) setIsCartSheetOpen(false);
  }, [cart.length]);

  const totals = computeCartTotals(cart, discount, settings);
  const qtyByMenuId = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(c => map.set(c.menuItem.id, (map.get(c.menuItem.id) || 0) + c.quantity));
    return map;
  }, [cart]);

  const todayKey = new Date().toDateString();
  const nextOrderNo = `KAP-${String(
    orders.filter(o => o.branchId === currentBranch?.id && o.createdAt && new Date(o.createdAt).toDateString() === todayKey)
      .length + 1
  ).padStart(3, '0')}`;

  const query = search.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const list = query
      ? menuItems.filter(
          m => m.name.toLowerCase().includes(query) || (m.nameEn || '').toLowerCase().includes(query)
        )
      : category === HOT
        ? hotItems
        : menuItems.filter(m => isItemInCategory(m, category as MenuCategory | 'all', categories));
    return [...list].sort((a, b) => Number(!!b.isFrequent) - Number(!!a.isFrequent));
  }, [menuItems, hotItems, categories, category, query]);

  const categoryTabs = useMemo(
    () => [
      ...(hotItems.length ? [{ id: HOT, label: 'ขายดี', count: hotItems.length }] : []),
      { id: 'all', label: 'ทั้งหมด', count: menuItems.length },
      ...categories.map(c => ({
        id: c.id,
        label: c.name,
        count: menuItems.filter(m => isItemInCategory(m, c.id as MenuCategory, categories)).length
      }))
    ],
    [hotItems.length, menuItems, categories]
  );

  const addQuick = (item: MenuItem) => addToCart(item, 1, defaultSpiceLevel(item), item.availableProteins?.[0]);

  const openCustomize = (item: MenuItem) => setCustomizeItem(item);

  const printPreBill = () => {
    if (cart.length === 0) return;
    const now = new Date().toISOString();
    setReceiptOrder({
      id: `prebill-${Date.now()}`,
      orderNumber: `PRE-${nextOrderNo}`,
      branchId: currentBranch?.id || 'main-branch',
      orderType,
      tableNumber: orderType === 'dine-in' ? table : undefined,
      items: cart,
      subtotal: totals.rawSubtotal,
      discountAmount: totals.discountAmount,
      discountType: discount.type,
      vatAmount: totals.vatAmount,
      grandTotal: totals.grandTotal,
      paymentMethod: 'cash',
      tenderedAmount: totals.grandTotal,
      changeAmount: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    });
    setIsPreBill(true);
  };

  const finishOrder = (order: Order, change: number) => {
    setIsPayOpen(false);
    setIsFullInvoiceOpen(false);
    setIsCartSheetOpen(false);
    setDone({ order, change, printed: false });
  };

  const nextOrder = () => {
    setDone(null);
    setSearch('');
    if (settings.autoLockAfterPayment) setIsLocked(true);
  };

  const cashierFirstName = currentUser?.name?.split(' ')[0] || '';
  const tableOptions = tables.length ? tables : ['1'];

  const cartPanel = (
    <>
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-b border-[#2d1c12] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsCartSheetOpen(false)}
            aria-label="กลับไปหน้าเมนู"
            className="md:hidden h-11 w-11 -ml-2 rounded-xl flex items-center justify-center text-[#d9c7b5]"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <div className="font-num text-xl font-semibold">ออเดอร์ #{nextOrderNo}</div>
            <div className="text-[13px] text-[#b3a393] truncate">
              {ORDER_TYPES.find(t => t.id === orderType)?.label}
              {orderType === 'dine-in' ? ` · โต๊ะ ${table}` : ''} · {cashierFirstName}
            </div>
          </div>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => setIsClearConfirmOpen(true)}
            className="h-10 px-3 rounded-xl border border-[#4a2718] text-[#ff9b85] text-sm shrink-0"
          >
            ล้างบิล
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-[#b3a393] px-8">
            <ShoppingBag className="w-11 h-11 text-[#5a4130]" strokeWidth={1.5} />
            <div className="text-base">แตะเมนูเพื่อเพิ่มลงออเดอร์</div>
            <div className="text-[13px]">แตะ 1 ครั้ง = 1 จาน (เผ็ดกลาง) · ปุ่ม <SlidersHorizontal className="inline w-3.5 h-3.5" /> = เลือกความเผ็ด ท็อปปิ้ง</div>
          </div>
        ) : (
          cart.map(item => {
            const details = cartItemDetails(item);
            return (
              <div key={item.cartItemId} className="flex items-center gap-2.5 px-1.5 py-2.5 border-b border-[#22150d]">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{item.menuItem.name}</div>
                  {details && <div className="text-[13px] text-[#d9a77e] leading-snug">{details}</div>}
                  <div className="text-[13px] text-[#b3a393]">฿{baht(item.unitPrice)} / จาน</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateCartQuantity(item.cartItemId, -1)}
                    aria-label={`ลด ${item.menuItem.name}`}
                    className="w-10 h-10 rounded-xl border border-[#3a2517] bg-[#1d130c] text-xl"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumpadItem(item)}
                    aria-label={`ใส่จำนวน ${item.menuItem.name}`}
                    className="min-w-[32px] h-10 font-num text-lg font-semibold"
                  >
                    {item.quantity}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCartQuantity(item.cartItemId, 1)}
                    aria-label={`เพิ่ม ${item.menuItem.name}`}
                    className="w-10 h-10 rounded-xl border border-[#3a2517] bg-[#1d130c] text-xl"
                  >
                    +
                  </button>
                </div>
                <div className="w-16 text-right font-num text-[17px] font-semibold">฿{baht(item.totalPrice)}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 sm:px-5 pt-3 pb-4 border-t border-[#2d1c12] flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsDiscountOpen(true)}
            disabled={cart.length === 0}
            className="h-10 px-3 rounded-xl border border-[#3a2517] bg-[#1d130c] text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <Percent className="w-4 h-4 text-[#ff8a3d]" />
            {totals.discountAmount > 0 ? `ส่วนลด −฿${baht(totals.discountAmount)}` : 'ส่วนลด'}
          </button>
          <button
            type="button"
            onClick={printPreBill}
            disabled={cart.length === 0}
            className="h-10 px-3 rounded-xl border border-[#3a2517] bg-[#1d130c] text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <FileText className="w-4 h-4 text-[#ff8a3d]" />
            ใบแจ้งยอด
          </button>
        </div>
        <div className="flex justify-between text-[13px] text-[#b3a393]">
          <span>{totals.itemCount} รายการ</span>
          {totals.enableVat && totals.vatAmount > 0 && (
            <span>
              {totals.vatType === 'exclusive' ? 'VAT' : 'รวม VAT'} {totals.vatRate}% ฿{baht(totals.vatAmount)}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg">ยอดรวม</span>
          <span className="font-num text-4xl font-bold text-[#ff8a3d]">฿{baht(totals.grandTotal)}</span>
        </div>
        <button
          type="button"
          onClick={() => cart.length && setIsPayOpen(true)}
          disabled={cart.length === 0}
          className={`h-16 rounded-2xl flex items-center justify-center gap-2.5 font-num text-xl font-semibold transition ${
            cart.length ? 'bg-[#ff6a13] text-[#1a0d05] active:scale-[0.99]' : 'bg-[#2a1b12] text-[#7d6a5a] cursor-not-allowed'
          }`}
        >
          <CreditCard className="w-6 h-6" />
          ชำระเงิน ฿{baht(totals.grandTotal)}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0704] text-[#f6efe7] overflow-hidden">
      {/* Top bar: order type, table, search, quick actions */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-[#2d1c12] bg-[#120a06] flex flex-wrap items-center gap-2 sm:gap-3">
        <div role="group" aria-label="ประเภทออเดอร์" className="flex gap-1 p-1 rounded-2xl bg-[#1d130c] border border-[#2d1c12]">
          {ORDER_TYPES.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={orderType === t.id}
              onClick={() => setOrderType(t.id)}
              className={`h-10 px-3 sm:px-4 rounded-xl text-[15px] font-semibold transition ${
                orderType === t.id ? 'bg-[#ff6a13] text-[#1a0d05]' : 'text-[#d9c7b5] hover:text-white'
              }`}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {orderType === 'dine-in' && (
          <label className="h-11 pl-3 pr-1 rounded-xl border border-[#4a2c18] bg-[#24160d] flex items-center gap-1.5 text-[15px] font-semibold">
            โต๊ะ
            <select
              value={table}
              onChange={e => setTable(e.target.value)}
              className="h-10 bg-transparent font-num text-lg outline-none cursor-pointer"
            >
              {tableOptions.map(t => (
                <option key={t} value={t} className="bg-[#1d130c]">
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="order-last sm:order-none basis-full sm:basis-auto flex-1 min-w-[180px] h-11 px-3 rounded-xl bg-[#1d130c] border border-[#2d1c12] flex items-center gap-2">
          <Search className="w-[18px] h-[18px] text-[#b3a393] shrink-0" />
          <span className="sr-only">ค้นหาเมนู</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเมนู เช่น หมูกรอบ"
            className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-[#8c7968]"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="ล้างคำค้นหา" className="p-1 text-[#b3a393]">
              <X className="w-4 h-4" />
            </button>
          )}
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setIsShiftOpen(true)}
            className="h-11 px-3 rounded-xl border border-[#2d1c12] bg-[#1d130c] text-sm flex items-center gap-2"
            title="เปิด-ปิดกะ ลิ้นชักเงินสด"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${currentOpenShift ? 'bg-[#3ecf8e]' : 'bg-[#ff5a3d] animate-pulse'}`} />
            <span className="hidden lg:inline">{currentOpenShift ? 'กะเปิดอยู่' : 'ยังไม่เปิดกะ'}</span>
            <Banknote className="w-4 h-4 lg:hidden text-[#d9c7b5]" />
          </button>
          <button
            type="button"
            onClick={() => setIsReceiptsOpen(true)}
            className="h-11 px-3 rounded-xl border border-[#2d1c12] bg-[#1d130c] text-sm flex items-center gap-1.5"
            title="บิลล่าสุด / พิมพ์ใบเสร็จซ้ำ"
          >
            <Printer className="w-4 h-4 text-[#ff8a3d]" />
            <span className="hidden lg:inline">บิลล่าสุด</span>
          </button>
          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="h-11 px-3 rounded-xl border border-[#2d1c12] bg-[#1d130c] text-sm flex items-center gap-1.5"
            title="เพิ่มรายการที่ไม่มีในเมนู"
          >
            <Zap className="w-4 h-4 text-[#ff8a3d]" />
            <span className="hidden lg:inline">รายการด่วน</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Menu */}
        <main className="flex-1 min-w-0 flex flex-col">
          <nav aria-label="หมวดหมู่" className="shrink-0 flex gap-2 px-3 sm:px-5 pt-3 pb-2 overflow-x-auto no-scrollbar">
            {categoryTabs.map(c => {
              const active = !query && category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCategory(c.id as MenuCategory);
                    setSearch('');
                  }}
                  className={`h-11 px-4 rounded-xl border text-[15px] font-semibold whitespace-nowrap flex items-center gap-1.5 shrink-0 transition ${
                    active ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517] hover:border-[#5a3a24]'
                  }`}
                >
                  {c.label}
                  <span className="text-xs opacity-70">{c.count}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto px-3 sm:px-5 pb-28 md:pb-5 pt-1">
            {visibleItems.length === 0 ? (
              <p className="text-center text-[#b3a393] mt-12">ไม่พบเมนูที่ค้นหา</p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {visibleItems.map(item => {
                  const qty = qtyByMenuId.get(item.id) || 0;
                  const customisable = hasOptions(item, addOns.length);
                  return (
                    <div key={item.id} className="relative">
                      <button
                        type="button"
                        onClick={() => addQuick(item)}
                        aria-label={`เพิ่ม ${item.name} ราคา ${item.price} บาท`}
                        className={`w-full h-[118px] sm:h-[124px] text-left p-3 sm:p-3.5 rounded-2xl border flex flex-col justify-between transition active:scale-[0.98] ${
                          qty ? 'bg-[#24160d] border-[#6b3a1a]' : 'bg-[#1a110b] border-[#2d1c12] hover:border-[#4a2c18]'
                        }`}
                      >
                        <span className={`text-[15px] sm:text-base font-semibold leading-snug line-clamp-2 ${customisable ? 'pr-10' : ''}`}>
                          {item.name}
                        </span>
                        <span className="flex items-end justify-between w-full">
                          <span className="font-num text-[22px] font-semibold text-[#ff8a3d]">฿{baht(item.price)}</span>
                          {qty > 0 && (
                            <span className="min-w-[28px] h-7 px-2 rounded-full bg-[#ff6a13] text-[#1a0d05] text-sm font-bold flex items-center justify-center">
                              {qty}
                            </span>
                          )}
                        </span>
                      </button>
                      {(item.isPopular || item.isFrequent) && category !== HOT && (
                        <span className="absolute bottom-[42px] right-3 text-[11px] font-bold text-[#ffb07a] pointer-events-none">ขายดี</span>
                      )}
                      {customisable && (
                        <button
                          type="button"
                          onClick={() => openCustomize(item)}
                          aria-label={`ปรับ ${item.name} (ความเผ็ด ท็อปปิ้ง)`}
                          className="absolute top-1.5 right-1.5 w-10 h-10 rounded-xl border border-[#3a2517] bg-[#24160d] flex items-center justify-center hover:border-[#ff6a13]"
                        >
                          <SlidersHorizontal className="w-[18px] h-[18px] text-[#e8d9c9]" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Cart (tablet / desktop) */}
        <aside aria-label="ออเดอร์ปัจจุบัน" className="hidden md:flex w-[360px] lg:w-[400px] shrink-0 flex-col border-l border-[#2d1c12] bg-[#120a06]">
          {cartPanel}
        </aside>
      </div>

      {/* Cart bar (phones) */}
      <div className="md:hidden fixed left-3 right-3 bottom-4 z-30">
        <button
          type="button"
          onClick={() => cart.length && setIsCartSheetOpen(true)}
          disabled={cart.length === 0}
          className={`w-full h-16 rounded-2xl px-4 flex items-center gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${
            cart.length ? 'bg-[#ff6a13] text-[#1a0d05]' : 'bg-[#24160d] text-[#8c7968]'
          }`}
        >
          <span className="min-w-[32px] h-8 rounded-full bg-[#1a0d05] text-[#ff8a3d] font-bold flex items-center justify-center">
            {totals.itemCount}
          </span>
          <span className="flex-1 text-left text-[17px] font-semibold">{cart.length ? 'ดูตะกร้า · ชำระเงิน' : 'ยังไม่มีรายการ'}</span>
          <span className="font-num text-[22px] font-bold">฿{baht(totals.grandTotal)}</span>
        </button>
      </div>

      {isCartSheetOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#120a06] flex flex-col" role="dialog" aria-modal="true" aria-label="ตะกร้า">
          {cartPanel}
        </div>
      )}

      {/* Dialogs */}
      <CustomizationModal isOpen={!!customizeItem} onClose={() => setCustomizeItem(null)} menuItem={customizeItem} />

      <QuickAddModal isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} onSelectItem={item => addQuick(item)} />

      <QuickPayModal
        isOpen={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        orderType={orderType}
        tableNumber={orderType === 'dine-in' ? table : undefined}
        onCompleted={finishOrder}
        onOpenFullInvoice={() => {
          setIsPayOpen(false);
          setIsFullInvoiceOpen(true);
        }}
      />

      <PaymentModal
        isOpen={isFullInvoiceOpen}
        onClose={() => setIsFullInvoiceOpen(false)}
        initialOrderType={orderType}
        initialTable={orderType === 'dine-in' ? table : undefined}
        onOrderCompleted={order => finishOrder(order, order.changeAmount || 0)}
      />

      <ReceiptModal
        isOpen={!!receiptOrder}
        onClose={() => {
          setReceiptOrder(null);
          setIsPreBill(false);
        }}
        order={receiptOrder}
        isPreBill={isPreBill}
      />

      {done && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ชำระเงินสำเร็จ"
            className="w-full max-w-[520px] rounded-3xl bg-[#160e09] border border-[#245c43] p-6 sm:p-8 flex flex-col items-center gap-3 text-center"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-[#133a29] flex items-center justify-center">
              <Check className="w-10 h-10 text-[#3ecf8e]" strokeWidth={2.6} />
            </div>
            <div className="font-num text-2xl font-semibold">รับเงินแล้ว · ส่งเข้าครัวแล้ว</div>
            <div className="text-[15px] text-[#b3a393]">
              {done.order.orderNumber} · ฿{baht(done.order.grandTotal)}
            </div>
            {done.order.paymentMethod === 'cash' && (
              <>
                <div className="text-base text-[#b3a393] mt-1">เงินทอน</div>
                <div className="font-num text-6xl font-bold text-[#3ecf8e] leading-none">฿{baht(done.change)}</div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3 w-full mt-4">
              <button
                type="button"
                onClick={async () => {
                  await printReceiptViaWindow(done.order, currentBranch, settings, { cashierName: cashierFirstName });
                  setDone(d => (d ? { ...d, printed: true } : d));
                }}
                className="h-14 rounded-2xl border border-[#3a2517] bg-[#1d130c] text-[17px] font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                {done.printed ? 'พิมพ์อีกครั้ง' : 'พิมพ์ใบเสร็จ'}
              </button>
              <button
                type="button"
                onClick={nextOrder}
                autoFocus
                className="h-14 rounded-2xl bg-[#ff6a13] text-[#1a0d05] font-num text-xl font-semibold"
              >
                ออเดอร์ถัดไป
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsPreBill(false);
                setReceiptOrder(done.order);
              }}
              className="h-10 px-3 text-sm text-[#d9a77e] flex items-center gap-1.5 hover:underline"
            >
              <Receipt className="w-4 h-4" />
              ดู / ส่งใบเสร็จ
            </button>
          </div>
        </div>
      )}

      <RecentReceiptsModal isOpen={isReceiptsOpen} onClose={() => setIsReceiptsOpen(false)} />

      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-label="ล้างบิล" className="w-full max-w-sm rounded-3xl bg-[#160e09] border border-[#3a2517] p-6 flex flex-col gap-4">
            <div className="font-num text-xl font-semibold">ล้างรายการทั้งหมด?</div>
            <p className="text-[15px] text-[#b3a393]">รายการในบิลนี้จะถูกลบออก ({totals.itemCount} รายการ)</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setIsClearConfirmOpen(false)} className="h-12 rounded-xl border border-[#3a2517] bg-[#1d130c] font-semibold">
                ไม่ล้าง
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setIsClearConfirmOpen(false);
                }}
                className="h-12 rounded-xl bg-[#c7361b] text-white font-semibold"
              >
                ล้างบิล
              </button>
            </div>
          </div>
        </div>
      )}

      {isShiftOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="เปิด-ปิดกะ" className="w-full max-w-2xl max-h-[90vh] rounded-3xl bg-[#140c07] border border-[#2b1a11] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#24150c]">
              <div className="flex items-center gap-2 font-semibold">
                <Banknote className="w-5 h-5 text-[#ff8a3d]" />
                เปิด-ปิดกะ & ลิ้นชักเงินสด
              </div>
              <button type="button" onClick={() => setIsShiftOpen(false)} aria-label="ปิด" className="w-10 h-10 rounded-xl flex items-center justify-center text-[#b3a393]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <CashShiftManagementPanel />
            </div>
          </div>
        </div>
      )}

      {numpadItem && (
        <TouchNumpadModal
          isOpen
          title={`จำนวน: ${numpadItem.menuItem.name}`}
          subtitle={`ราคาต่อหน่วย: ฿${baht(numpadItem.unitPrice)}`}
          initialValue={numpadItem.quantity}
          mode="quantity"
          unitLabel="จาน"
          unitPrice={numpadItem.unitPrice}
          onClose={() => setNumpadItem(null)}
          onConfirm={val => {
            if (val > 0) setCartItemQuantity(numpadItem.cartItemId, val);
            else removeFromCart(numpadItem.cartItemId);
            setNumpadItem(null);
          }}
        />
      )}

      {isDiscountOpen && (
        <TouchNumpadModal
          isOpen
          title="ส่วนลดท้ายบิล (บาท)"
          subtitle={`ยอดก่อนลด: ฿${baht(totals.rawSubtotal)}`}
          initialValue={discount.type === 'fixed' ? discount.amount : totals.discountAmount}
          mode="discount"
          onClose={() => setIsDiscountOpen(false)}
          onConfirm={val => {
            setDiscount({ amount: Math.max(0, val), type: 'fixed' });
            setIsDiscountOpen(false);
          }}
        />
      )}
    </div>
  );
};
